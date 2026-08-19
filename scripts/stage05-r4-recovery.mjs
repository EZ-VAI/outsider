#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { fork, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachedSessionKey } from "../src/outsider-attached-ledger.js";
import { controllerSocketPath, createControllerToken,
  requestController } from "../src/outsider-controller-rpc.js";
import { resolveClaudeExecutable, startKernelRun } from "../src/outsider-kernel-runner.js";
import { RunStore } from "../src/outsider-kernel-store.js";
import { createAttestationV2, finalizeStage05Evidence,
  verifyAttestationV2, verifyStage05RunDirectory } from "../src/outsider-stage05-evidence.js";
import { verifySupervisedExperienceV2 } from "../src/outsider-supervised-experience.js";
import {
  inspectJudgeProcess, judgeOwnershipDirectory, judgeOwnershipFiles,
} from "../src/outsider-judge-process-ownership.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const valueAfter = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
if (!args.includes("--execute-live")) throw new Error("R4_LIVE_EXECUTION_REQUIRES_--execute-live");
const output = path.resolve(valueAfter("--output") ?? path.join(root, "artifacts",
  `r4-recovery-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`));
if (existsSync(output) && readdirSync(output).length) throw new Error("R4_OUTPUT_MUST_BE_FRESH");
mkdirSync(output, { recursive: true });
const recoveryWindowMs = Number(valueAfter("--recovery-window-ms") ?? 120_000);
if (!Number.isInteger(recoveryWindowMs) || recoveryWindowMs < 120_000) {
  throw new Error("R4_RECOVERY_WINDOW_MUST_BE_AT_LEAST_120000MS");
}
const sha = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const fileHash = (file) => sha(readFileSync(file));
const oracle = path.join(here, "stage05-r4-recovery-oracle.mjs");
const supervisorCommand = [process.execPath, oracle];
const artifact = valueAfter("--artifact") ? path.resolve(valueAfter("--artifact")) : null;
if (!artifact || !existsSync(artifact)) throw new Error("R4_PACKAGED_ARTIFACT_REQUIRED");
const artifactHash = fileHash(artifact);
function fileManifest(directory) {
  const entries = [];
  const visit = (current, prefix = "") => {
    for (const name of readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const relative = path.posix.join(prefix, name);
      const stat = statSync(absolute);
      if (stat.isDirectory()) visit(absolute, relative);
      else if (stat.isFile()) entries.push({ path: relative, sha256: fileHash(absolute) });
      else throw new Error(`R4_ARTIFACT_UNSUPPORTED_ENTRY:${relative}`);
    }
  };
  visit(directory);
  return entries;
}
function verifyRuntimeMatchesArtifact() {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-r4-artifact-"));
  try {
    const extracted = spawnSync("tar", ["-xzf", artifact, "-C", temporary], {
      encoding: "utf8", stdio: "pipe",
    });
    if (extracted.status !== 0) {
      throw new Error(`R4_ARTIFACT_EXTRACT_FAILED:${extracted.stderr || extracted.stdout}`);
    }
    const packagedRoot = path.join(temporary, "package");
    const packaged = fileManifest(packagedRoot);
    const runtime = packaged.map((entry) => {
      const runtimeFile = path.join(root, entry.path);
      if (!existsSync(runtimeFile)) throw new Error(`R4_RUNTIME_FILE_MISSING:${entry.path}`);
      return { path: entry.path, sha256: fileHash(runtimeFile) };
    });
    if (JSON.stringify(runtime) !== JSON.stringify(packaged)) {
      const mismatch = packaged.find((entry, index) => entry.sha256 !== runtime[index]?.sha256);
      throw new Error(`R4_RUNTIME_ARTIFACT_MISMATCH:${mismatch?.path ?? "unknown"}`);
    }
    return { fileCount: packaged.length, contentManifestHash: sha(JSON.stringify(packaged)) };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
const artifactClosure = verifyRuntimeMatchesArtifact();
const sourceHashes = Object.fromEntries([
  "scripts/stage05-r4-recovery.mjs", "scripts/stage05-r4-recovery-oracle.mjs",
  "src/outsider-controller-watchdog.js", "src/outsider-controller-host.js",
  "src/outsider-controller-rpc.js", "src/outsider-intervention-recovery.js",
  "src/outsider-judge-process-ownership.js", "src/outsider-json-command-process.mjs",
  "src/outsider-attached-daemon.js", "src/outsider-supervised-experience.js",
].map((relative) => [relative, fileHash(path.join(root, relative))]));
const lanes = ["correction-audit-in-flight", "correction-persisted-before-reply",
  "outcome-audit-in-flight", "terminal-event-before-state-lease",
  "controller-and-attached-daemon-restart"];
const preregistration = { schema: "outsider/stage05-r4-preregistration/v1",
  artifactHash, artifactClosure, sourceHashes, lanes, recoveryWindowMs,
  claimBoundary: "deterministic process-recovery evidence; no model reliability or endurance claim" };
writeFileSync(path.join(output, "preregistration.json"), JSON.stringify(preregistration, null, 2));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForFile(file, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) { if (existsSync(file)) return; await wait(20); }
  throw new Error(`R4_MARKER_TIMEOUT:${path.basename(file)}`);
}
function workspace(label, initial = 1) {
  const directory = path.join(output, "workspaces", label);
  mkdirSync(path.join(directory, "src"), { recursive: true });
  writeFileSync(path.join(directory, "src", "value.js"), `export const value = ${initial};\n`);
  writeFileSync(path.join(directory, "test.mjs"), `import assert from "node:assert/strict";\nimport { value } from "./src/value.js";\nassert.equal(value, 2);\n`);
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module",
    scripts: { test: "node test.mjs" } }, null, 2));
  const transcript = path.join(directory, "session.jsonl");
  writeFileSync(transcript, "");
  return { directory, transcript };
}
function payload(event, transcript, extra = {}) {
  return { agent: "claude-code", input: { hook_event_name: event,
    session_id: extra.session_id ?? "r4", cwd: extra.cwd,
    transcript_path: transcript, ...extra } };
}
function correctionText(response) {
  return response?.output?.reason ?? response?.output?.hookSpecificOutput?.permissionDecisionReason
    ?? response?.decision?.corrective ?? "";
}
function appendCorrection(transcript, correction) {
  writeFileSync(transcript, `${JSON.stringify({ type: "user", message: { content: correction } })}\n`,
    { flag: "a" });
}
async function applyEffect(run, item, correction, hookExtra = {}) {
  appendCorrection(item.transcript, correction);
  const editId = `edit-${randomUUID()}`;
  const pre = await run.handleHook(payload("PreToolUse", item.transcript, { ...hookExtra,
    cwd: item.directory,
    tool_name: "Edit", tool_use_id: editId,
    tool_input: { file_path: path.join(item.directory, "src", "value.js") } }));
  if (pre?.output?.hookSpecificOutput?.permissionDecision === "deny") {
    throw new Error(`R4_EFFECT_EDIT_DENIED:${pre.output.hookSpecificOutput.permissionDecisionReason}`);
  }
  writeFileSync(path.join(item.directory, "src", "value.js"), "export const value = 2;\n");
  await run.handleHook(payload("PostToolUse", item.transcript, { ...hookExtra,
    cwd: item.directory,
    tool_name: "Edit", tool_use_id: editId,
    tool_input: { file_path: path.join(item.directory, "src", "value.js") },
    tool_response: { success: true, exit_code: 0 } }));
  const testId = `test-${randomUUID()}`;
  await run.handleHook(payload("PreToolUse", item.transcript, { ...hookExtra,
    cwd: item.directory,
    tool_name: "Bash", tool_use_id: testId, tool_input: { command: "npm test" } }));
  await run.handleHook(payload("PostToolUse", item.transcript, { ...hookExtra,
    cwd: item.directory,
    tool_name: "Bash", tool_use_id: testId, tool_input: { command: "npm test" },
    tool_response: { success: true, exit_code: 0 } }));
}
function withEnv(values, fn) {
  const prior = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  return Promise.resolve().then(fn).finally(() => {
    for (const [key, value] of Object.entries(prior)) {
      if (value == null) delete process.env[key]; else process.env[key] = value;
    }
  });
}
async function start(label, initial = 1, environment = {}) {
  const item = workspace(label, initial);
  const run = await withEnv(environment, () => startKernelRun({
    cwd: item.directory, ask: "Change src/value.js so the exported value is exactly 2.",
    acceptance: "npm test", supervisorCommand, workerExecutable: process.execPath,
    hookEntry: path.join(root, "bin", "outsider-hook.mjs"),
    stateRoot: path.join(output, "state", label), attachedMode: true,
    losslessContract: true, requireInterventionProof: initial !== 2,
    workerPreflight: () => ({ ok: true }),
    controllerOptions: { maxSupervisorCalls: 24, semanticPatrolEvery: 96,
      semanticPatrolMinEvidenceSteps: 6, maxControllerRestarts: 3 },
  }));
  run.store.writeJson("r4-preregistration.json", { ...preregistration, lane: label });
  return { ...item, run };
}
function eventsFor(item) {
  return RunStore.open({ directory: item.run.store.directory, supervisorCommand }).events();
}
function causalIdentity(events) {
  const emitted = events.find((event) => event.type === "correction_emitted");
  return { interventionId: emitted?.interventionId ?? null,
    authorityHash: emitted?.correctionAuthorityHash ?? null };
}
function markerPid(file) {
  const pid = Number(String(readFileSync(file, "utf8")).trim());
  if (!Number.isInteger(pid) || pid <= 1) throw new Error(`R4_MARKER_PID_INVALID:${file}`);
  return pid;
}
function validateLane(item, label, { originalGeneration = 1, requireRecovery = true,
  terminalReconciled = false, judgePids = [] } = {}) {
  const events = eventsFor(item);
  const identity = causalIdentity(events);
  const recovered = events.filter((event) => event.type === "controller_recovered");
  const final = events.at(-1);
  const lease = JSON.parse(readFileSync(path.join(item.run.store.directory,
    "controller-lease.json"), "utf8"));
  const aliveJudgePids = judgePids.filter((pid) => inspectJudgeProcess(pid));
  const ownershipRecordsRemaining = judgeOwnershipFiles(
    judgeOwnershipDirectory(item.run.store.directory)).length;
  const recoveredCleanup = recovered.reduce((sum, event) =>
    sum + Number(event.orphanJudgeProcessesTerminated ?? 0), 0);
  const result = {
    schema: "outsider/stage05-r4-recovery-result/v1", lane: label,
    failpoint: label, passed: final?.type === "run_finalized"
      && final.proofComplete === true && lease.status === "released"
      && (!requireRecovery || recovered.length === 1)
      && aliveJudgePids.length === 0 && ownershipRecordsRemaining === 0
      && (judgePids.length === 0 || recoveredCleanup >= judgePids.length),
    runId: final?.runId ?? item.run.runId, contractSeal: final?.contractSeal ?? item.run.contract.seal,
    originalGeneration, recoveredGeneration: recovered.at(-1)?.generation ?? originalGeneration,
    sameRunId: events.every((event) => event.runId === item.run.runId),
    sameContractSeal: events.every((event) => event.contractSeal === item.run.contract.seal),
    sameInterventionId: identity.interventionId,
    sameAuthorityHash: identity.authorityHash,
    judgeProcessesObserved: judgePids.length,
    judgeProcessIdentityCommitments: judgePids.map((pid) => sha(`r4-judge-pid\0${pid}`)),
    orphanJudgeProcesses: aliveJudgePids.length,
    orphanJudgeProcessesTerminated: recoveredCleanup,
    ownershipRecordsRemaining,
    terminalReconciled,
    eventCount: events.length,
  };
  if (!result.passed || !result.sameRunId || !result.sameContractSeal) {
    throw new Error(`R4_LANE_FAILED:${label}:${JSON.stringify(result)}`);
  }
  return result;
}
async function seal(item, laneResult) {
  const mutable = RunStore.open({ directory: item.run.store.directory, supervisorCommand });
  mutable.writeJson("r4-recovery-result.json", laneResult);
  const evidence = finalizeStage05Evidence({ directory: mutable.directory });
  const experience = evidence.supervisedExperience;
  if (!verifySupervisedExperienceV2(experience, { verified: evidence }).ok) {
    throw new Error("R4_SUPERVISED_EXPERIENCE_INVALID");
  }
  const attestation = createAttestationV2({ runDirectories: [mutable.directory] });
  if (!verifyAttestationV2(attestation).ok) throw new Error("R4_ATTESTATION_INVALID");
  writeFileSync(path.join(output, `${laneResult.lane}.attestation.json`),
    JSON.stringify(attestation, null, 2));
  return { runDirectory: mutable.directory, manifestHash: evidence.manifest.manifestHash,
    experienceHash: experience.recordHash, attestationHash: attestation.attestationHash,
    lane: laneResult };
}

async function finishOwned(item, { requireIntervention = true } = {}) {
  const result = await item.run.watchdog.finish({ requireIntervention, timeoutMs: 60_000 });
  await item.run.watchdog.close();
  if (result.proof?.complete !== true) throw new Error(`R4_FINAL_PROOF_FAILED:${result.proof?.errors}`);
  return result;
}

const results = [];
const trackedJudgePids = [];

// lane 1
{
  const marker = path.join(output, "lane1-auditor.blocked");
  const item = await start(lanes[0], 1, { OUTSIDER_R4_BLOCK_KIND: "correction-factual-audit",
    OUTSIDER_R4_BLOCK_MARKER: marker });
  const pending = item.run.handleHook(payload("Stop", item.transcript, { cwd: item.directory })).catch(() => null);
  await waitForFile(marker);
  const judgePid = markerPid(marker);
  trackedJudgePids.push(judgePid);
  const originalGeneration = item.run.watchdog.generation;
  item.run.watchdog.crashForTest("SIGKILL");
  await pending;
  await item.run.watchdog.waitUntilReady();
  const correction = await item.run.handleHook(payload("Stop", item.transcript, { cwd: item.directory }));
  await applyEffect(item.run, item, correctionText(correction));
  const stop = await item.run.handleHook(payload("Stop", item.transcript, { cwd: item.directory }));
  if (stop.output.decision !== "approve") throw new Error("R4_LANE1_STOP_NOT_APPROVED");
  await finishOwned(item);
  results.push(await seal(item, validateLane(item, lanes[0], {
    originalGeneration, judgePids: [judgePid],
  })));
}

// lane 2
{
  const marker = path.join(output, "lane2-rpc.json");
  const receipt = path.join(output, "lane2-rpc.receipt");
  writeFileSync(marker, JSON.stringify({ schema: "outsider/evaluation-rpc-failpoint/v1",
    name: "after-correction-persisted-before-rpc-reply" }));
  const item = await start(lanes[1], 1, { OUTSIDER_EVALUATION_ALLOW_FAILPOINTS: "1",
    OUTSIDER_EVALUATION_RPC_FAILPOINT: "after-correction-persisted-before-rpc-reply",
    OUTSIDER_EVALUATION_FAILPOINT_MARKER: marker,
    OUTSIDER_EVALUATION_FAILPOINT_RECEIPT: receipt });
  const originalGeneration = item.run.watchdog.generation;
  const pending = item.run.handleHook(payload("Stop", item.transcript, { cwd: item.directory })).catch(() => null);
  await waitForFile(receipt);
  await pending;
  await item.run.watchdog.waitUntilReady();
  const correction = await item.run.handleHook(payload("PreToolUse", item.transcript, {
    cwd: item.directory, tool_name: "Read", tool_use_id: `read-${randomUUID()}`,
    tool_input: { file_path: path.join(item.directory, "src", "value.js") } }));
  await applyEffect(item.run, item, correctionText(correction));
  const stop = await item.run.handleHook(payload("Stop", item.transcript, { cwd: item.directory }));
  if (stop.output.decision !== "approve") throw new Error("R4_LANE2_STOP_NOT_APPROVED");
  await finishOwned(item);
  results.push(await seal(item, validateLane(item, lanes[1], { originalGeneration })));
}

// lane 3
{
  const marker = path.join(output, "lane3-auditor.blocked");
  const item = await start(lanes[2], 1, { OUTSIDER_R4_BLOCK_KIND: "outcome-approval-audit",
    OUTSIDER_R4_BLOCK_MARKER: marker });
  const originalGeneration = item.run.watchdog.generation;
  const correction = await item.run.handleHook(payload("Stop", item.transcript, { cwd: item.directory }));
  await applyEffect(item.run, item, correctionText(correction));
  const pending = item.run.handleHook(payload("Stop", item.transcript, { cwd: item.directory })).catch(() => null);
  await waitForFile(marker);
  const judgePid = markerPid(marker);
  trackedJudgePids.push(judgePid);
  item.run.watchdog.crashForTest("SIGKILL");
  await pending;
  await item.run.watchdog.waitUntilReady();
  const stop = await item.run.handleHook(payload("Stop", item.transcript, { cwd: item.directory }));
  if (stop.output.decision !== "approve") throw new Error("R4_LANE3_STOP_NOT_APPROVED");
  await finishOwned(item);
  results.push(await seal(item, validateLane(item, lanes[2], {
    originalGeneration, judgePids: [judgePid],
  })));
}

// lane 4
{
  const marker = path.join(output, "lane4-finalization.json");
  writeFileSync(marker, JSON.stringify({ schema: "outsider/evaluation-finalization-failpoint/v1",
    name: "after-run-finalized-before-state" }));
  const item = await start(lanes[3], 2, { OUTSIDER_EVALUATION_ALLOW_FAILPOINTS: "1",
    OUTSIDER_EVALUATION_FINALIZATION_FAILPOINT: "after-run-finalized-before-state",
    OUTSIDER_EVALUATION_FAILPOINT_MARKER: marker });
  const stop = await item.run.handleHook(payload("Stop", item.transcript, { cwd: item.directory }));
  if (stop.output.decision !== "approve") throw new Error("R4_LANE4_STOP_NOT_APPROVED");
  await finishOwned(item, { requireIntervention: false });
  results.push(await seal(item, validateLane(item, lanes[3], { requireRecovery: false,
    terminalReconciled: true })));
}

// lane 5: real daemon process + controller process die together.
{
  const label = lanes[4];
  const item = workspace(label, 1);
  const attachedRoot = path.join(output, "attached");
  const stateRoot = path.join(output, "state", label);
  const socketPath = controllerSocketPath(`r4-daemon-${randomUUID()}`);
  const token = createControllerToken();
  const daemonEntry = path.join(root, "bin", "outsider-attached-daemon.mjs");
  const env = { ...process.env, OUTSIDER_ATTACHED_ROOT: attachedRoot,
    OUTSIDER_ATTACHED_SOCKET: socketPath, OUTSIDER_ATTACHED_TOKEN: token,
    OUTSIDER_STATE_ROOT: stateRoot,
    OUTSIDER_SUPERVISOR_ARGV: JSON.stringify(supervisorCommand) };
  delete env.OUTSIDER_SUPERVISOR;
  const launchDaemon = async () => {
    const child = fork(daemonEntry, [], { env, stdio: ["ignore", "ignore", "pipe", "ipc"] });
    const until = Date.now() + 20_000;
    while (Date.now() < until) {
      try {
        await requestController({ socketPath, token, payload: { _outsiderAttachedPing: true },
          timeoutMs: 500 });
        return child;
      } catch { await wait(25); }
    }
    child.kill("SIGKILL");
    throw new Error("R4_ATTACHED_DAEMON_START_TIMEOUT");
  };
  let daemon = await launchDaemon();
  const sessionId = "r4-joint-recovery";
  await requestController({ socketPath, token, payload: payload("UserPromptSubmit", item.transcript,
    { cwd: item.directory, session_id: sessionId,
      prompt: "Change src/value.js so the exported value is exactly 2." }), timeoutMs: 30_000 });
  const correction = await requestController({ socketPath, token,
    payload: payload("Stop", item.transcript, { cwd: item.directory, session_id: sessionId }),
    timeoutMs: 60_000 });
  appendCorrection(item.transcript, correctionText(correction));
  const sessionFile = path.join(attachedRoot, "sessions",
    attachedSessionKey({ session_id: sessionId }), "session.json");
  const active = JSON.parse(readFileSync(sessionFile, "utf8")).active;
  const runStore = RunStore.open({ directory: active.runDirectory, supervisorCommand });
  const originalLease = runStore.readJson("controller-lease.json");
  // Kill the owner of the watchdog first. Otherwise a live daemon can observe
  // the controller exit and win a generation-2 recovery race before this lane
  // has actually exercised the joint-restart path.
  daemon.kill("SIGKILL");
  await once(daemon, "exit");
  try { process.kill(-Number(originalLease.pid), "SIGKILL"); }
  catch {
    try { process.kill(Number(originalLease.pid), "SIGKILL"); } catch {}
  }
  daemon = await launchDaemon();
  const recoveredPre = await requestController({ socketPath, token,
    payload: payload("PreToolUse", item.transcript, { cwd: item.directory, session_id: sessionId,
      tool_name: "Read", tool_use_id: `read-${randomUUID()}`,
      tool_input: { file_path: path.join(item.directory, "src", "value.js") } }), timeoutMs: 30_000 });
  if (recoveredPre.output?.hookSpecificOutput?.permissionDecision === "deny") {
    throw new Error("R4_LANE5_RECOVERY_PRETOOL_DENIED");
  }
  const adapter = { handleHook: (body) => requestController({ socketPath, token, payload: body,
    timeoutMs: 60_000 }) };
  await applyEffect(adapter, item, correctionText(correction), { session_id: sessionId });
  const beforeStop = RunStore.open({ directory: active.runDirectory, supervisorCommand });
  const recovery = beforeStop.events().find((event) => event.type === "controller_recovered");
  const identity = causalIdentity(beforeStop.events());
  const remainingOwnershipRecords = judgeOwnershipFiles(
    judgeOwnershipDirectory(active.runDirectory)).length;
  const preliminary = { schema: "outsider/stage05-r4-recovery-result/v1", lane: label,
    failpoint: label, passed: Boolean(recovery && identity.interventionId
      && identity.authorityHash && remainingOwnershipRecords === 0),
    runId: active.runId, contractSeal: active.contract.seal,
    originalGeneration: originalLease.generation, recoveredGeneration: recovery?.generation ?? null,
    sameRunId: beforeStop.events().every((event) => event.runId === active.runId),
    sameContractSeal: beforeStop.events().every((event) => event.contractSeal === active.contract.seal),
    sameInterventionId: identity.interventionId, sameAuthorityHash: identity.authorityHash,
    judgeProcessesObserved: 0,
    judgeProcessIdentityCommitments: [],
    orphanJudgeProcesses: 0,
    orphanJudgeProcessesTerminated: Number(recovery?.orphanJudgeProcessesTerminated ?? 0),
    ownershipRecordsRemaining: remainingOwnershipRecords,
    terminalReconciled: false };
  if (!preliminary.passed || !preliminary.sameRunId || !preliminary.sameContractSeal) {
    throw new Error(`R4_LANE_FAILED:${label}:${JSON.stringify(preliminary)}`);
  }
  beforeStop.writeJson("r4-recovery-result.json", preliminary);
  const stopped = await requestController({ socketPath, token,
    payload: payload("Stop", item.transcript, { cwd: item.directory, session_id: sessionId }),
    timeoutMs: 60_000 });
  if (stopped.output.decision !== "approve") throw new Error("R4_LANE5_STOP_NOT_APPROVED");
  daemon.kill("SIGTERM"); await once(daemon, "exit");
  const verified = verifyStage05RunDirectory(active.runDirectory);
  if (!verified.ok || verified.manifest.terminal.proofComplete !== true) {
    throw new Error(`R4_LANE5_EVIDENCE_FAILED:${verified.error ?? "proof incomplete"}`);
  }
  const terminalEvents = RunStore.open({ directory: active.runDirectory, supervisorCommand }).events();
  const resolved = terminalEvents.find((event) => event.type === "intervention_resolved"
    && event.interventionId === identity.interventionId
    && event.correctionAuthorityHash === identity.authorityHash);
  if (!resolved) throw new Error("R4_LANE5_INTERVENTION_NOT_RESOLVED");
  const experience = JSON.parse(readFileSync(path.join(active.runDirectory,
    "stage05-supervised-experience.json"), "utf8"));
  const attestation = createAttestationV2({ runDirectories: [active.runDirectory] });
  writeFileSync(path.join(output, `${label}.attestation.json`), JSON.stringify(attestation, null, 2));
  results.push({ runDirectory: active.runDirectory,
    manifestHash: verified.manifest.manifestHash, experienceHash: experience.recordHash,
    attestationHash: attestation.attestationHash, lane: preliminary });
}

process.stdout.write(`R4 five lanes sealed; waiting ${recoveryWindowMs}ms recovery window\n`);
await wait(recoveryWindowMs);
for (const result of results) {
  const verified = verifyStage05RunDirectory(result.runDirectory);
  if (!verified.ok || verified.manifest.manifestHash !== result.manifestHash) {
    throw new Error(`R4_RECOVERY_WINDOW_EVIDENCE_CHANGED:${result.lane.lane}`);
  }
}
const lateOrphans = trackedJudgePids.filter((pid) => inspectJudgeProcess(pid));
if (lateOrphans.length > 0) {
  throw new Error(`R4_ORPHAN_JUDGE_PROCESS_SURVIVED_WINDOW:${lateOrphans.length}`);
}
const finalSourceHashes = Object.fromEntries(Object.keys(sourceHashes)
  .map((relative) => [relative, fileHash(path.join(root, relative))]));
if (JSON.stringify(finalSourceHashes) !== JSON.stringify(sourceHashes)) {
  throw new Error("R4_EVALUATOR_SOURCE_CHANGED_DURING_RUN");
}
const report = { schema: "outsider/stage05-r4-batch-result/v1",
  ok: results.length === 5 && results.every((item) => item.lane.passed === true
    && item.lane.orphanJudgeProcesses === 0
    && item.lane.ownershipRecordsRemaining === 0),
  artifactHash, artifactClosure, sourceHashes, recoveryWindowMs, results,
  claimBoundary: preregistration.claimBoundary };
writeFileSync(path.join(output, "result.json"), JSON.stringify(report, null, 2));
process.stdout.write(`${JSON.stringify({ ok: report.ok, output, lanes: results.map((item) => ({
  lane: item.lane.lane, runId: item.lane.runId, manifestHash: item.manifestHash,
  experienceHash: item.experienceHash })) }, null, 2)}\n`);
