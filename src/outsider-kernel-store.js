import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync,
  statSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { isSensitiveSupervisorPath } from "./outsider-supervisor-projection.js";

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const EVENT_CHAIN_GENESIS = sha256("outsider/kernel-event-chain/genesis/v2");

function eventHash(event) {
  const { eventHash: ignored, ...body } = event;
  return sha256(canonicalizeStrict(body));
}

function atomicWrite(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, value, { mode: 0o600 });
  renameSync(temporary, file);
}

function shouldSkip(relative) {
  /* Claude's interactive ScheduleWakeup surface creates this host-owned lock
     while the worker is alive and removes it during normal process teardown.
     It is neither a delivered artifact nor stable evidence. Including it made
     an otherwise unchanged Agent Team tree acquire a new fingerprint between
     the approved Stop boundary and finalization. Keep the exclusion exact;
     other project-owned .claude files remain part of the artifact. */
  if (relative.split(path.sep).join("/") === ".claude/scheduled_tasks.lock") return true;
  return /(^|[/\\])(?:\.git|\.outsider|node_modules|dist|build|coverage|__pycache__|\.venv)(?:[/\\]|$)/.test(relative);
}

const SOURCE_OR_TEXT_EXTENSION = new Set([
  ".c", ".cc", ".cpp", ".css", ".csv", ".go", ".h", ".html", ".java", ".js", ".json",
  ".jsx", ".kt", ".md", ".mjs", ".php", ".py", ".rb", ".rs", ".sh", ".sql", ".svelte",
  ".swift", ".toml", ".ts", ".tsx", ".txt", ".vue", ".xml", ".yaml", ".yml",
]);

function captureText(buffer, relative) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { return { text: null, textStatus: "not-captured", captureReason: "invalid-utf8" }; }
  /* NUL is valid inside source strings/template literals. Treating every NUL
     as a binary marker hid a real JavaScript implementation from the 1.3.7
     Cowork supervisor. For unknown extensions we retain the conservative
     binary heuristic; known source/text files preserve the exact UTF-8 bytes
     and JSON safely escapes the NUL in evidence packets. */
  if (buffer.includes(0) && !SOURCE_OR_TEXT_EXTENSION.has(path.extname(relative).toLowerCase())) {
    return { text: null, textStatus: "not-captured", captureReason: "nul-in-unknown-file-type" };
  }
  return { text, textStatus: "captured", captureReason: null };
}

/** A content-addressed view of the workspace. It is evidence, not worker narration. */
export function snapshotWorkspace(cwd, {
  maxFiles = 4000,
  maxFileBytes = 256 * 1024,
  maxCapturedBytes = 4 * 1024 * 1024,
} = {}) {
  const files = {};
  let captured = 0;
  const walk = (directory, depth = 0) => {
    if (depth > 10 || Object.keys(files).length >= maxFiles) return;
    let names = [];
    try { names = readdirSync(directory); } catch { return; }
    names.sort();
    for (const name of names) {
      if (Object.keys(files).length >= maxFiles) break;
      const absolute = path.join(directory, name);
      const relative = path.relative(cwd, absolute);
      if (!relative || shouldSkip(relative)) continue;
      let stat;
      try { stat = statSync(absolute); } catch { continue; }
      if (stat.isDirectory()) {
        walk(absolute, depth + 1);
        continue;
      }
      if (!stat.isFile()) continue;
      let body;
      try { body = readFileSync(absolute); } catch { continue; }
      const record = { sha: sha256(body), size: body.length };
      /* Credentials remain part of the local content-addressed manifest, so a
         change is still detected, but their plaintext is never captured into
         a snapshot that can later become supervisor evidence. */
      if (isSensitiveSupervisorPath(relative)) {
        record.textStatus = "not-captured";
        record.captureReason = "sensitive-path-denylist";
      } else if (body.length > maxFileBytes) {
        record.textStatus = "not-captured";
        record.captureReason = "file-size-limit";
      } else if (captured + body.length > maxCapturedBytes) {
        record.textStatus = "not-captured";
        record.captureReason = "workspace-byte-budget";
      } else {
        const capturedText = captureText(body, relative);
        record.textStatus = capturedText.textStatus;
        record.captureReason = capturedText.captureReason;
        if (capturedText.text !== null) {
          record.text = capturedText.text;
          captured += body.length;
        }
      }
      files[relative] = record;
    }
  };
  walk(cwd);
  const manifest = Object.entries(files).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}\0${value.sha}\0${value.size}`).join("\n");
  return { fingerprint: sha256(manifest), files, nFiles: Object.keys(files).length };
}

const excerpt = (text, max = 2400) => {
  if (text == null) return null;
  const value = String(text);
  if (value.length <= max) return value;
  const half = Math.floor(max / 2);
  return `${value.slice(0, half)}\n…<truncated>…\n${value.slice(-half)}`;
};

export function diffSnapshots(before, after, { maxChanges = 40 } = {}) {
  const names = [...new Set([
    ...Object.keys(before?.files ?? {}), ...Object.keys(after?.files ?? {}),
  ])].sort();
  const changes = [];
  for (const name of names) {
    const left = before?.files?.[name] ?? null;
    const right = after?.files?.[name] ?? null;
    if (left?.sha === right?.sha) continue;
    changes.push({
      path: name,
      status: !left ? "added" : !right ? "deleted" : "modified",
      beforeSha: left?.sha ?? null,
      afterSha: right?.sha ?? null,
      before: excerpt(left?.text),
      after: excerpt(right?.text),
    });
    if (changes.length >= maxChanges) break;
  }
  return {
    beforeFingerprint: before?.fingerprint ?? null,
    afterFingerprint: after?.fingerprint ?? null,
    changed: changes.length,
    truncated: changes.length >= maxChanges && names.length > maxChanges,
    changes,
  };
}

export function defaultStateRoot() {
  return process.env.OUTSIDER_STATE_ROOT
    || path.join(process.env.OUTSIDER_HOME || path.join(homedir(), ".outsider"), "runs");
}

export class RunStore {
  static create({ cwd, contract, supervisorCommand, host = "claude-code",
    stateRoot = defaultStateRoot(), binding = null, workspaceIdentity = null,
    runId = randomUUID() }) {
    if (!/^[A-Za-z0-9._-]{8,128}$/.test(String(runId))) {
      throw new Error("RUN_STORE_ID_INVALID");
    }
    const directory = path.join(stateRoot, runId);
    mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
    mkdirSync(directory, { mode: 0o700 });
    const store = new RunStore({ runId, directory, cwd, contract, supervisorCommand, host,
      eventSchema: "outsider/kernel-event/v2", lastEventHash: EVENT_CHAIN_GENESIS });
    store.writeJson("contract.json", contract);
    if (binding) store.writeJson("stage05-binding.json", binding);
    if (workspaceIdentity) store.writeJson("workspace-identity.json", workspaceIdentity);
    store.saveState({
      schema: "outsider/kernel-run/v2",
      runId,
      cwd,
      host,
      contractSeal: contract.seal,
      bindingHash: binding?.bindingHash ?? null,
      workspaceIdentityHash: workspaceIdentity?.identityHash ?? null,
      eventSchema: "outsider/kernel-event/v2",
      supervisorCommandHash: sha256(String(supervisorCommand ?? "")),
      status: "starting",
      openIntervention: null,
    });
    return store;
  }

  static open({ directory, supervisorCommand }) {
    if (!directory) throw new Error("RUN_STORE_DIRECTORY_REQUIRED");
    let state;
    let contract;
    try {
      state = JSON.parse(readFileSync(path.join(directory, "run.json"), "utf8"));
      contract = JSON.parse(readFileSync(path.join(directory, "contract.json"), "utf8"));
    } catch (error) {
      throw new Error(`RUN_STORE_UNREADABLE:${error?.message ?? error}`);
    }
    if (!state?.runId || !state?.cwd || !state?.contractSeal || !contract?.seal) {
      throw new Error("RUN_STORE_IDENTITY_INCOMPLETE");
    }
    const { seal, ...contractBody } = contract;
    if (seal !== sha256(JSON.stringify(contractBody))) throw new Error("RUN_STORE_CONTRACT_SEAL_BROKEN");
    if (state.contractSeal !== contract.seal) throw new Error("RUN_STORE_CONTRACT_SEAL_MISMATCH");
    if (state.bindingHash) {
      let binding;
      try { binding = JSON.parse(readFileSync(path.join(directory, "stage05-binding.json"), "utf8")); } catch {
        throw new Error("RUN_STORE_STAGE05_BINDING_MISSING");
      }
      const { bindingHash, ...bindingBody } = binding;
      if (bindingHash !== sha256(canonicalizeStrict(bindingBody))
        || bindingHash !== state.bindingHash
        || binding.contractRef?.contractSeal !== contract.seal) {
        throw new Error("RUN_STORE_STAGE05_BINDING_BROKEN");
      }
    }
    if (state.workspaceIdentityHash) {
      let identity;
      try { identity = JSON.parse(readFileSync(path.join(directory, "workspace-identity.json"), "utf8")); } catch {
        throw new Error("RUN_STORE_WORKSPACE_IDENTITY_MISSING");
      }
      const { identityHash, ...identityBody } = identity;
      if (identityHash !== sha256(canonicalizeStrict(identityBody))
        || identityHash !== state.workspaceIdentityHash
        || identity.contractSeal !== contract.seal
        || path.resolve(identity.canonicalCwd ?? "") !== path.resolve(state.cwd)) {
        throw new Error("RUN_STORE_WORKSPACE_IDENTITY_BROKEN");
      }
    }
    if (contract.baselineEvidence?.fingerprint) {
      let baseline;
      try { baseline = JSON.parse(readFileSync(path.join(directory, "baseline.json"), "utf8")); } catch {
        throw new Error("RUN_STORE_BASELINE_EVIDENCE_MISSING");
      }
      if (baseline?.fingerprint !== contract.baselineEvidence.fingerprint) {
        throw new Error("RUN_STORE_BASELINE_EVIDENCE_MISMATCH");
      }
    }
    if (state.supervisorCommandHash !== sha256(String(supervisorCommand ?? ""))) {
      throw new Error("RUN_STORE_SUPERVISOR_IDENTITY_MISMATCH");
    }
    const store = new RunStore({
      runId: state.runId,
      directory,
      cwd: state.cwd,
      contract,
      supervisorCommand,
      host: state.host ?? "claude-code",
      eventSchema: state.eventSchema ?? "outsider/kernel-event/v1",
      lastEventHash: EVENT_CHAIN_GENESIS,
    });
    const events = store.events();
    let priorHash = EVENT_CHAIN_GENESIS;
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event.runId !== state.runId || event.contractSeal !== contract.seal
        || event.seq !== index + 1) {
        throw new Error(`RUN_STORE_EVENT_CHAIN_BROKEN:${index + 1}`);
      }
      if (store.eventSchema === "outsider/kernel-event/v2") {
        if (event.schema !== store.eventSchema || event.prevEventHash !== priorHash
          || event.eventHash !== eventHash(event)) {
          throw new Error(`RUN_STORE_EVENT_HASH_CHAIN_BROKEN:${index + 1}`);
        }
        priorHash = event.eventHash;
      }
    }
    store.sequence = events.length;
    store.lastEventHash = priorHash;
    return store;
  }

  constructor({ runId, directory, cwd, contract, supervisorCommand, host,
    eventSchema = "outsider/kernel-event/v1", lastEventHash = EVENT_CHAIN_GENESIS }) {
    this.runId = runId;
    this.directory = directory;
    this.cwd = cwd;
    this.contract = contract;
    this.supervisorCommand = supervisorCommand;
    this.host = host;
    this.eventsPath = path.join(directory, "events.jsonl");
    this.statePath = path.join(directory, "run.json");
    this.sequence = 0;
    this.eventSchema = eventSchema;
    this.lastEventHash = lastEventHash;
  }

  get sealedEvidencePath() {
    return path.join(this.directory, "stage05-evidence-manifest.json");
  }

  assertMutable(operation = "write") {
    if (existsSync(this.sealedEvidencePath)) {
      throw new Error(`RUN_EVIDENCE_ALREADY_SEALED:${operation}`);
    }
  }

  writeJson(name, value) {
    this.assertMutable(`writeJson:${name}`);
    atomicWrite(path.join(this.directory, name), JSON.stringify(value, null, 2));
  }

  readJson(name) {
    try { return JSON.parse(readFileSync(path.join(this.directory, name), "utf8")); } catch { return null; }
  }

  saveState(patch) {
    this.assertMutable("saveState");
    const prior = this.readState() ?? {};
    const next = { ...prior, ...patch, runId: this.runId, updatedAt: new Date().toISOString() };
    atomicWrite(this.statePath, JSON.stringify(next, null, 2));
    return next;
  }

  readState() {
    try { return JSON.parse(readFileSync(this.statePath, "utf8")); } catch { return null; }
  }

  append(type, payload = {}) {
    this.assertMutable(`append:${type}`);
    this.sequence += 1;
    let event = {
      ...payload,
      schema: this.eventSchema,
      runId: this.runId,
      seq: this.sequence,
      type,
      contractSeal: this.contract?.seal ?? null,
      at: new Date().toISOString(),
    };
    if (this.eventSchema === "outsider/kernel-event/v2") {
      event = { ...event, prevEventHash: this.lastEventHash };
      event = { ...event, eventHash: eventHash(event) };
      this.lastEventHash = event.eventHash;
    }
    appendFileSync(this.eventsPath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
    return event;
  }

  events() {
    if (!existsSync(this.eventsPath)) return [];
    return readFileSync(this.eventsPath, "utf8").split("\n").filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  }
}

export { EVENT_CHAIN_GENESIS, eventHash as computeKernelEventHash };

/** Non-authoritative reliability telemetry. It never decides whether a run may
 * proceed; it makes supervisor factual errors and worker uptake measurable
 * instead of hiding both behind one final PASS. */
export function supervisorReliability(events = []) {
  const correctionAudits = events.filter((event) => event.type === "correction_factual_audit");
  const clearanceAudits = events.filter((event) => event.type === "supervisor_clearance_audit");
  const outcomeAudits = events.filter((event) => event.type === "outcome_approval_audit"
    || event.type === "baseline_outcome_approval_audit");
  const corrections = events.filter((event) => event.type === "correction_emitted");
  const byId = (type, id) => events.some((event) => event.type === type
    && event.interventionId === id);
  const hasAuthorityMatchedEffect = (id) => events.some((event) =>
    event.type === "effect_observed" && event.interventionId === id
    && typeof event.matchedExpectedAction === "string"
    && event.matchedExpectedAction.length > 0
    && typeof event.artifactFingerprint === "string"
    && event.artifactFingerprint.length > 0);
  const correctionOutcomes = corrections.map((event) => ({
    interventionId: event.interventionId,
    observed: byId("correction_observed", event.interventionId),
    effectObserved: hasAuthorityMatchedEffect(event.interventionId),
    resolved: byId("intervention_resolved", event.interventionId),
  }));
  const factualRejected = correctionAudits.filter((event) => event.passed === false
    && Array.isArray(event.errors) && event.errors.length > 0).length;
  return {
    clearanceProposalsAudited: clearanceAudits.length,
    clearancesPassed: clearanceAudits.filter((event) => event.passed === true).length,
    clearancesRejected: clearanceAudits.filter((event) => event.passed === false).length,
    clearanceErrorRate: clearanceAudits.length
      ? clearanceAudits.filter((event) => event.passed === false).length / clearanceAudits.length : null,
    clearanceRediagnoses: events.filter((event) => event.type === "supervisor_verdict"
      && event.source === "clearance-rediagnosis").length,
    correctionProposalsAudited: correctionAudits.length,
    correctionFactualPasses: correctionAudits.filter((event) => event.passed === true).length,
    correctionFactualRejections: factualRejected,
    correctionAuditInsufficient: correctionAudits.filter((event) => event.insufficient).length,
    correctionFactualErrorRate: correctionAudits.length
      ? factualRejected / correctionAudits.length : null,
    correctionRediagnoses: events.filter((event) => event.type === "supervisor_verdict"
      && event.source === "correction-rediagnosis").length,
    correctionsDelivered: corrections.length,
    correctionsObserved: correctionOutcomes.filter((item) => item.observed).length,
    correctionsWithEffect: correctionOutcomes.filter((item) => item.effectObserved).length,
    correctionsResolved: correctionOutcomes.filter((item) => item.resolved).length,
    workerResponse: {
      acted: correctionOutcomes.filter((item) => item.effectObserved).length,
      observedWithoutEffect: correctionOutcomes.filter((item) => item.observed && !item.effectObserved).length,
      notObserved: correctionOutcomes.filter((item) => !item.observed).length,
      /* “worker corrected the supervisor” needs narration semantics and is not
         inferred from edits. Keep it unknown rather than fabricate a number. */
      correctedSupervisor: null,
    },
    outcomeApprovalsAudited: outcomeAudits.length,
    outcomeApprovalsRejected: outcomeAudits.filter((event) => event.passed === false).length,
  };
}

/**
 * Delivery proof and intervention proof are related but not identical. A worker
 * that reaches the frozen outcome correctly on its first attempt must not be
 * forced to drift merely so Outsider can demonstrate an intervention. Once an
 * objective failure or correction does occur, however, the same-run causal chain
 * becomes mandatory. `requireIntervention` is for canaries that deliberately test
 * the actuator rather than ordinary product runs.
 */
export function validateCausalProof(events, { requireIntervention = false } = {}) {
  const errors = [];
  if (!events.length) return { complete: false, errors: ["event stream is empty"] };
  const runIds = new Set(events.map((event) => event.runId));
  if (runIds.size !== 1) errors.push("event stream contains more than one runId");
  const contractSeals = new Set(events.map((event) => event.contractSeal).filter(Boolean));
  if (contractSeals.size !== 1 || events.some((event) => !event.contractSeal)) {
    errors.push("event stream does not have one immutable contract seal");
  }
  for (let i = 0; i < events.length; i += 1) {
    if (events[i].seq !== i + 1) errors.push(`non-monotonic sequence at index ${i}`);
  }
  const compiled = events.find((event) => event.type === "contract_compiled");
  if (!compiled || Number(compiled.successCriteria) < 1) {
    errors.push("semantic work contract was not compiled before execution");
  }
  const contractAudit = events.find((event) => event.type === "contract_audited");
  if (!contractAudit?.passed) {
    errors.push("semantic work contract did not receive an independent pre-worker audit");
  }
  const frozen = events.find((event) => event.type === "contract_frozen");
  const launch = events.find((event) => event.type === "worker_launch");
  if (!frozen || (launch && frozen.seq > launch.seq) || (launch && compiled && compiled.seq > launch.seq)
    || (launch && contractAudit && contractAudit.seq > launch.seq)) {
    errors.push("contract was not frozen, compiled and independently audited before worker launch");
  }
  const finalAcceptance = [...events].reverse().find((event) => event.type === "acceptance_finished"
    && event.phase === "final");
  if (!finalAcceptance?.ran || finalAcceptance?.passed !== true || finalAcceptance.phase !== "final") {
    errors.push("final independent acceptance did not pass");
  }
  const finalFingerprint = finalAcceptance?.finalFingerprint ?? null;
  if (!finalFingerprint) errors.push("final independent acceptance is not bound to an artifact fingerprint");
  /* Never fall back to a PASS over an older tree.  A later final acceptance can
     be green for fingerprint B while the only semantic PASS and approval audit
     belong to fingerprint A.  That is a verified historical artifact, not the
     delivered artifact. */
  const outcome = [...events].reverse().find((event) => event.type === "outcome_verdict"
    && event.phase === "stop" && event.finalFingerprint === finalFingerprint);
  if (!outcome || outcome.passed !== true || outcome.insufficient) {
    errors.push("independent semantic outcome verification did not pass");
  } else if (outcome.source === "baseline-outcome-attestation") {
    const baselineApprovalAudit = events.find((event) => event.type === "baseline_outcome_approval_audit"
      && event.passed === true && event.baselineFingerprint === outcome.finalFingerprint);
    if (!baselineApprovalAudit) errors.push("baseline semantic PASS did not receive an independent factual audit");
  } else {
    const approvalAudit = events.find((event) => event.type === "outcome_approval_audit"
      && event.seq < outcome.seq && event.passed === true
      && event.seq === outcome.approvalAuditSeq
      && event.interventionId === outcome.interventionId
      && event.finalFingerprint === outcome.finalFingerprint);
    if (!approvalAudit) errors.push("semantic PASS did not receive an independent factual audit");
  }
  if (events.some((event) => event.type === "team_task_created")) {
    const ready = [...events].reverse().find((event) => event.type === "coordination_ready_at_stop");
    const incomplete = [...events].reverse().find((event) => event.type === "coordination_incomplete_at_stop");
    if (!ready || (incomplete && incomplete.seq > ready.seq)) {
      errors.push("multi-agent task graph was not complete and conflict-free at Stop");
    }
  }
  const controllerGenerations = events.filter((event) => event.type === "controller_started"
    || event.type === "controller_recovered").map((event) => Number(event.generation));
  for (let index = 0; index < controllerGenerations.length; index += 1) {
    if (controllerGenerations[index] !== index + 1) {
      errors.push("controller recovery generations are not monotonic");
      break;
    }
  }
  const remediationRequired = requireIntervention || events.some((event) => (
    (event.type === "acceptance_finished" && event.phase === "stop" && event.passed === false)
      || (event.type === "outcome_verdict" && event.passed === false)
      || event.type === "correction_emitted"
  ));
  let interventionComplete = !remediationRequired;
  if (remediationRequired) {
    const corrections = events.filter((event) => event.type === "correction_emitted"
      && event.source === "supervisor_plan" && event.interventionId);
    const valid = corrections.some((correction) => {
      const id = correction.interventionId;
      const authorityHash = correction.correctionAuthorityHash;
      if (!authorityHash || !(Number(correction.factualAuditSeq) > 0)) return false;
      const same = (type, predicate = () => true) => events.filter((event) =>
        event.type === type && event.interventionId === id && predicate(event));
      const paused = same("boundary_paused").find((event) => event.seq < correction.seq);
      const verdict = same("supervisor_verdict", (event) => event.onTrack === false
        && event.planSteps > 0 && event.correctionAuthorityHash === authorityHash)
        .find((event) => event.seq > (paused?.seq ?? 0) && event.seq < correction.seq);
      const audit = same("correction_factual_audit", (event) => event.passed === true
        && !event.insufficient && event.correctionAuthorityHash === authorityHash
        && event.seq === correction.factualAuditSeq)
        .find((event) => event.seq > (verdict?.seq ?? 0) && event.seq < correction.seq);
      const observed = same("correction_observed", (event) =>
        event.correctionAuthorityHash === authorityHash)
        .find((event) => event.seq > correction.seq);
      const effect = same("effect_observed", (event) =>
        event.correctionAuthorityHash === authorityHash
        && typeof event.matchedExpectedAction === "string"
        && event.matchedExpectedAction.length > 0
        && event.artifactFingerprint === finalFingerprint)
        .find((event) => event.seq > (observed?.seq ?? Number.POSITIVE_INFINITY));
      const acceptance = same("acceptance_finished", (event) => event.phase === "stop"
        && event.ran === true && event.passed === true
        && event.finalFingerprint === finalFingerprint)
        .find((event) => event.seq > (effect?.seq ?? Number.POSITIVE_INFINITY));
      const semantic = same("outcome_verdict", (event) => event.phase === "stop"
        && event.passed === true && !event.insufficient
        && event.finalFingerprint === finalFingerprint)
        .find((event) => event.seq > (acceptance?.seq ?? Number.POSITIVE_INFINITY));
      const resolved = same("intervention_resolved", (event) =>
        event.correctionAuthorityHash === authorityHash
        && event.correctionObserved === true && event.effectObserved === true)
        .find((event) => event.seq > (semantic?.seq ?? Number.POSITIVE_INFINITY));
      return Boolean(paused && verdict && audit && observed && effect
        && acceptance && semantic && resolved);
    });
    interventionComplete = valid;
    if (!valid) errors.push("no intervention has a complete causal chain");
  }
  return {
    complete: errors.length === 0,
    deliveryComplete: errors.every((error) => error === "no intervention has a complete causal chain"),
    interventionRequired: remediationRequired,
    interventionComplete,
    errors,
  };
}
