#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAttestationV2, finalizeStage05Evidence, verifyAttestationV2,
  verifyStage05RunDirectory,
} from "../src/outsider-stage05-evidence.js";
import {
  inspectProductRun, listProductRuns, productVersion, runProductDoctor,
  resolveRunDirectory,
} from "../src/outsider-product.js";
import { defaultStateRoot } from "../src/outsider-kernel-store.js";
import {
  CONTRIBUTION_PURPOSES, createContributionRevocation, initializeShareDirectory,
  previewRunContribution, readShareState, sendRunContribution, setShareEnabled,
  sendContributionRevocation, shareDirectoryForStateRoot,
} from "../src/outsider-experience-contribution.js";
import {
  createDeepSeekHarnessObservation, verifyDeepSeekHarnessObservation,
} from "../src/outsider-deepseek-harness-adapter.js";
import { createFederatedSupervisionRecord,
  acceptFederatedHandoffOffer, createFederatedEvidencePacket,
  createFederatedHandoffOffer, createFederatedWayAttestation,
  createFederatedWayCheckpoint,
  verifyFederatedEvidencePacket, verifyFederationTrustStore } from
  "../src/outsider-federation.js";
import { openFederationRegistry } from "../src/outsider-federation-store.js";
import { DurableGlobalOutsiderMonitor } from "../src/outsider-federation-monitor.js";
import { createFederatedTaskPlan, createTaskBoundFederatedCheckpoint,
  verifyFederatedTaskHandoff, verifyFederatedTaskHandoffOffer,
  verifyFederatedTaskPlan } from "../src/outsider-federation-plan.js";

function usage() {
  console.log(`Outsider Stage 0.5\n\n`
    + `  outsider run "<目标>" --accept "npm test" --max-budget-usd 20 [--supervisor "claude -p"]\n`
    + `  outsider install [--scope user|project] [--check] [--strict]\n`
    + `  outsider doctor [--worker <claude>] [--state-root <directory>] [--json]\n`
    + `  outsider runs [--state-root <directory>] [--json]\n`
    + `  outsider show <run-id|run-directory> [--state-root <directory>]\n`
    + `  outsider evidence <run-directory>\n`
    + `  outsider attest <run-directory>... --out <attestation.json> [--signing-key <ed25519-private.pem>]\n`
    + `  outsider share preview <run-id|run-directory> [--state-root <directory>]\n`
    + `  outsider share enable --endpoint <https-url> --server-public-key <pem> --accept-policy [--purposes <csv>] [--retention-days 365]\n`
    + `  outsider share send <run-id|run-directory> [--state-root <directory>]\n`
    + `  outsider share status [--state-root <directory>]\n`
    + `  outsider share disable [--state-root <directory>]\n`
    + `  outsider share revoke [--send] [--reason <text>] [--state-root <directory>]\n`
    + `  outsider observe-dsh <session-events.json|jsonl> --out <observation.json> [--session-id <id>]\n`
    + `  outsider federation-verify <packet.json> --trust-store <trust.json>\n`
    + `  outsider federation-supervise <packet.json> --trust-store <trust.json> --out <record.json>\n`
    + `  outsider federation-sign-way <way-spec.json> --signing-key <private.pem> --out <attestation.json>\n`
    + `  outsider federation-offer <source-attestation.json> <offer-spec.json> --trust-store <trust.json> --signing-key <sender-private.pem> --out <offer.json>\n`
    + `  outsider federation-accept <offer.json> <source-attestation.json> --trust-store <trust.json> --signing-key <receiver-private.pem> --received-at <ISO time> --out <handoff.json>\n`
    + `  outsider federation-pack <packet-spec.json> --trust-store <trust.json> --out <packet.json>\n`
    + `  outsider federation-ingest <packet.json> --trust-store <trust.json> --state-root <directory>\n`
    + `  outsider federation-status --trust-store <trust.json> --state-root <directory>\n`
    + `  outsider federation-checkpoint <checkpoint-spec.json> --signing-key <private.pem> --out <checkpoint.json>\n`
    + `  outsider federation-plan <task-plan-spec.json> --trust-store <trust.json> --signing-key <coordinator-private.pem> --out <plan.json>\n`
    + `  outsider federation-plan-verify <plan.json> --trust-store <trust.json>\n`
    + `  outsider federation-task-handoff-verify <handoff.json> <source-attestation.json> --task-plan <plan.json> --trust-store <trust.json>\n`
    + `  outsider federation-monitor-ingest <checkpoint.json> --trust-store <trust.json> --state-root <directory> [--task-plan <plan.json>] [--max-silence-ms 900000]\n`
    + `  outsider federation-monitor-status --trust-store <trust.json> --state-root <directory> [--task-plan <plan.json>] [--now <ISO time>]\n`
    + `  outsider verify <run-directory|attestation.json>\n\n`
    + `安装后直接照常使用 claude 或 Claude Desktop；outsider run 仅用于 CI/显式无头任务。`);
}

function parse(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) { positional.push(value); continue; }
    const next = argv[index + 1];
    if (next == null || next.startsWith("--")) options[value.slice(2)] = true;
    else { options[value.slice(2)] = next; index += 1; }
  }
  return { positional, options };
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") { usage(); return 0; }
  if (argv[0] === "--version" || argv[0] === "-v" || argv[0] === "version") {
    console.log(productVersion());
    return 0;
  }
  const commands = new Set(["run", "install", "doctor", "runs", "show", "evidence", "attest",
    "share",
    "observe-dsh", "federation-verify", "federation-supervise", "federation-sign-way",
    "federation-offer", "federation-accept", "federation-pack", "federation-ingest",
    "federation-status", "federation-checkpoint", "federation-monitor-ingest",
    "federation-monitor-status", "federation-plan", "federation-plan-verify",
    "federation-task-handoff-verify",
    "verify", "help", "legacy"]);
  const requested = argv[0];
  const command = commands.has(requested) ? requested : "run";
  const rest = commands.has(requested) ? argv.slice(1) : argv;
  if (command === "help") { usage(); return 0; }
  if (command === "legacy") {
    console.error("legacy observer 已隔离；正常 Claude hook 进入 transparent attached Stage 0.5，outsider run 只用于显式无头任务。");
    return 2;
  }
  if (command === "run") {
    const { main: run } = await import("./outsider-run.mjs");
    return run(rest);
  }
  if (command === "install") {
    const installer = fileURLToPath(new URL("../install.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [installer, ...rest], { stdio: "inherit" });
    return result.status ?? 1;
  }
  const { positional, options } = parse(rest);
  const stateRoot = options["state-root"] ? path.resolve(options["state-root"]) : undefined;
  if (command === "share") {
    const action = positional[0] ?? "status";
    const runValue = positional[1];
    const actualStateRoot = stateRoot ?? defaultStateRoot();
    const shareRoot = options["share-root"]
      ? path.resolve(options["share-root"]) : shareDirectoryForStateRoot(actualStateRoot);
    try {
      if (action === "preview") {
        const directory = resolveRunDirectory(runValue, actualStateRoot);
        if (!directory) throw new Error("RUN_NOT_FOUND");
        console.log(JSON.stringify(previewRunContribution(directory), null, 2));
        return 0;
      }
      if (action === "enable") {
        if (options["accept-policy"] !== true || !options.endpoint
          || !options["server-public-key"]) {
          console.error("share enable requires --endpoint, --server-public-key and explicit --accept-policy");
          return 2;
        }
        const purposes = options.purposes
          ? String(options.purposes).split(",").map((value) => value.trim()).filter(Boolean)
          : CONTRIBUTION_PURPOSES;
        const result = initializeShareDirectory({ directory: shareRoot,
          endpoint: options.endpoint,
          serverPublicKeyPem: readFileSync(path.resolve(options["server-public-key"]), "utf8"),
          purposes,
          retentionDays: options["retention-days"] == null
            ? 365 : Number(options["retention-days"]),
        });
        console.log(JSON.stringify({ ok: true, enabled: true, explicitSendOnly: true,
          automaticUpload: false, rawContentAllowed: false,
          deviceKeyId: result.config.deviceKeyId,
          serverKeyId: result.config.serverKeyId,
          consentHash: result.consent.consentHash, shareRoot }, null, 2));
        return 0;
      }
      if (action === "status") {
        const result = readShareState(shareRoot);
        if (!result.ok) {
          console.log(JSON.stringify({ ok: true, configured: false, enabled: false,
            automaticUpload: false, explicitSendOnly: true, shareRoot }, null, 2));
          return 0;
        }
        console.log(JSON.stringify({ ok: true, configured: true,
          enabled: result.config.enabled === true,
          endpoint: result.config.endpoint,
          deviceKeyId: result.config.deviceKeyId,
          serverKeyId: result.config.serverKeyId,
          purposes: result.consent.purposes,
          retentionDays: result.consent.retentionDays,
          automaticUpload: false, explicitSendOnly: true, rawContentAllowed: false,
          shareRoot }, null, 2));
        return 0;
      }
      if (action === "disable") {
        const result = setShareEnabled(shareRoot, false);
        console.log(JSON.stringify({ ok: true, enabled: false,
          consentHash: result.consent.consentHash,
          note: "Local sending is disabled; previously received server data is not deleted." }, null, 2));
        return 0;
      }
      if (action === "revoke") {
        if (options.send === true) {
          const result = await sendContributionRevocation({ shareDirectory: shareRoot,
            reason: options.reason ?? "USER_REQUEST" });
          console.log(JSON.stringify({ ok: true, enabled: false,
            revocationHash: result.revocation.revocationHash,
            serverAcknowledged: true,
            acknowledgmentHash: result.acknowledgment.acknowledgmentHash,
            deletedContributions: result.acknowledgment.deletedContributions,
            futureUseBlocked: result.acknowledgment.futureUseBlocked }, null, 2));
          return 0;
        }
        const revocation = createContributionRevocation({ shareDirectory: shareRoot,
          reason: options.reason ?? "USER_REQUEST" });
        console.log(JSON.stringify({ ok: true, enabled: false,
          revocationHash: revocation.revocationHash,
          requestFile: path.join(shareRoot, "revocation.json"),
          serverAcknowledged: false,
          note: "A signed local request was created. Add --send for server acknowledgment and erasure." }, null, 2));
        return 0;
      }
      if (action === "send") {
        const directory = resolveRunDirectory(runValue, actualStateRoot);
        if (!directory) throw new Error("RUN_NOT_FOUND");
        const result = await sendRunContribution({ runDirectory: directory,
          shareDirectory: shareRoot });
        console.log(JSON.stringify({ ok: true, duplicate: result.duplicate,
          contributionRecordHash: result.contributionRecordHash,
          receiptHash: result.receipt.receiptHash,
          disposition: result.receipt.disposition,
          evidenceLevel: result.receipt.evidenceLevel,
          eligibleFor: result.receipt.eligibleFor }, null, 2));
        return 0;
      }
      console.error(`unknown share action: ${action}`);
      return 2;
    } catch (error) {
      console.error(`share ${action} failed: ${error?.message ?? error}`);
      return 1;
    }
  }
  if (command === "doctor") {
    const report = runProductDoctor({ workerExecutable: options.worker || null, stateRoot });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Outsider ${report.version} · ${report.ok ? "READY" : "NOT READY"}`);
      for (const [name, check] of Object.entries(report.checks)) {
        console.log(`${check.ok ? "✓" : "✗"} ${name}: ${check.detail ?? (check.ok ? "ok" : "failed")}`);
      }
      console.log(`runs: ${report.existingRuns} · state: ${report.stateRoot}`);
      const surfaces = report.surfaces ?? {};
      console.log(`native Claude: ${surfaces.nativeClaudeCode?.installed ? "installed" : "not installed"}`
        + ` · runtime ${surfaces.nativeClaudeCode?.runtimeConformanceSeen ? "seen" : "not yet seen"}`);
      console.log(`Desktop Cowork: ${surfaces.desktopCowork?.pluginPackaged ? "plugin ready" : "plugin missing"}`
        + ` · helper ${surfaces.desktopCowork?.systemHelperRunning ? "running" : "not running"}`
        + ` · runtime ${surfaces.desktopCowork?.runtimeConformanceSeen ? "seen" : "not yet seen"}`);
    }
    return report.ok ? 0 : 1;
  }
  if (command === "runs") {
    const runs = listProductRuns(stateRoot);
    if (options.json) console.log(JSON.stringify(runs, null, 2));
    else if (!runs.length) console.log("No controlled runs yet.");
    else {
      console.log("RUN ID                                STATUS      PROOF  EVIDENCE    UPDATED");
      for (const run of runs) console.log(
        `${run.runId.padEnd(36)}  ${run.status.padEnd(10)}  ${run.proofComplete ? "yes " : "no  "}`
        + `  ${run.evidence.padEnd(10)}  ${run.updatedAt ?? "-"}`);
    }
    return 0;
  }
  if (command === "show") {
    const detail = inspectProductRun(positional[0], stateRoot);
    console.log(JSON.stringify(detail, null, 2));
    return detail.ok ? 0 : 1;
  }
  if (command === "evidence") {
    const directory = positional[0] && path.resolve(positional[0]);
    if (!directory) { usage(); return 2; }
    try {
      const artifacts = finalizeStage05Evidence({ directory });
      console.log(JSON.stringify({ ok: true, runId: artifacts.manifest.sourceRunId,
        manifestHash: artifacts.manifest.manifestHash,
        projectionHash: artifacts.projection.projectionHash }, null, 2));
      return 0;
    } catch (error) {
      console.error(`evidence failed: ${error?.message ?? error}`);
      return 1;
    }
  }
  if (command === "verify") {
    const target = positional[0] && path.resolve(positional[0]);
    if (!target || !existsSync(target)) { usage(); return 2; }
    let result;
    if (target.endsWith(".json")) {
      const record = JSON.parse(readFileSync(target, "utf8"));
      result = record?.schema === "outsider/deepseek-harness-observation/v1"
        ? verifyDeepSeekHarnessObservation(record) : verifyAttestationV2(record);
    } else result = verifyStage05RunDirectory(target);
    console.log(JSON.stringify(result.ok ? { ok: true, signed: result.signed ?? null,
      attestationHash: result.attestationHash ?? null,
      manifestHash: result.manifest?.manifestHash ?? null } : result, null, 2));
    return result.ok ? 0 : 1;
  }
  if (command === "observe-dsh") {
    if (!positional[0] || !options.out) { usage(); return 2; }
    try {
      const source = path.resolve(positional[0]);
      const raw = readFileSync(source, "utf8").trim();
      let input;
      try { input = JSON.parse(raw); }
      catch {
        input = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      }
      const record = createDeepSeekHarnessObservation(input, {
        sessionId: options["session-id"] ?? null,
      });
      const output = path.resolve(options.out);
      writeFileSync(output, JSON.stringify(record, null, 2));
      console.log(JSON.stringify({ ok: true, output, recordHash: record.recordHash,
        complete: record.integrity.complete, authority: record.authority.mode }, null, 2));
      return record.integrity.complete ? 0 : 1;
    } catch (error) {
      console.error(`observe-dsh failed: ${error?.message ?? error}`);
      return 1;
    }
  }
  const readJson = (value) => JSON.parse(readFileSync(path.resolve(value), "utf8"));
  const writeJson = (value, output) => {
    const target = path.resolve(output);
    writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    return target;
  };
  if (["federation-sign-way", "federation-offer", "federation-accept",
    "federation-checkpoint", "federation-plan",
    "federation-pack"].includes(command)) {
    if (!options.out || (command !== "federation-pack" && !options["signing-key"])) {
      usage(); return 2;
    }
    try {
      let record;
      if (command === "federation-sign-way") {
        if (!positional[0]) { usage(); return 2; }
        const spec = readJson(positional[0]);
        record = createFederatedWayAttestation({ ...spec,
          privateKeyPem: readFileSync(path.resolve(options["signing-key"]), "utf8") });
      } else if (command === "federation-checkpoint") {
        if (!positional[0]) { usage(); return 2; }
        const spec = readJson(positional[0]);
        if (options["task-plan"]) {
          if (!options["trust-store"] || !spec.taskId) { usage(); return 2; }
          record = createTaskBoundFederatedCheckpoint({ ...spec,
            taskPlan: readJson(options["task-plan"]),
            trustStore: readJson(options["trust-store"]),
            privateKeyPem: readFileSync(path.resolve(options["signing-key"]), "utf8") });
        } else record = createFederatedWayCheckpoint({ ...spec,
          privateKeyPem: readFileSync(path.resolve(options["signing-key"]), "utf8") });
      } else if (command === "federation-plan") {
        if (!positional[0] || !options["trust-store"]) { usage(); return 2; }
        record = createFederatedTaskPlan({ ...readJson(positional[0]),
          trustStore: readJson(options["trust-store"]),
          privateKeyPem: readFileSync(path.resolve(options["signing-key"]), "utf8") });
      } else if (command === "federation-offer") {
        if (!positional[0] || !positional[1] || !options["trust-store"]) {
          usage(); return 2;
        }
        const sourceAttestation = readJson(positional[0]);
        const offerSpec = readJson(positional[1]);
        record = createFederatedHandoffOffer({ ...offerSpec,
          sourceAttestation,
          senderPrivateKeyPem: readFileSync(path.resolve(options["signing-key"]), "utf8"),
          trustStore: readJson(options["trust-store"]) });
        if (offerSpec.taskBinding != null) {
          if (!options["task-plan"]) throw new Error("FEDERATION_TASK_PLAN_REQUIRED");
          const taskChecked = verifyFederatedTaskHandoffOffer({
            taskPlan: readJson(options["task-plan"]), offer: record,
            trustStore: readJson(options["trust-store"]), sourceAttestation });
          if (!taskChecked.ok) throw new Error(
            `FEDERATION_TASK_HANDOFF_INVALID:${taskChecked.failures.join("|")}`);
        }
      } else if (command === "federation-accept") {
        if (!positional[0] || !positional[1] || !options["trust-store"]
          || !options["received-at"]) { usage(); return 2; }
        const offer = readJson(positional[0]), sourceAttestation = readJson(positional[1]);
        if (offer?.payload?.taskBinding != null) {
          if (!options["task-plan"]) throw new Error("FEDERATION_TASK_PLAN_REQUIRED");
          const taskChecked = verifyFederatedTaskHandoffOffer({
            taskPlan: readJson(options["task-plan"]), offer,
            trustStore: readJson(options["trust-store"]), sourceAttestation });
          if (!taskChecked.ok) throw new Error(
            `FEDERATION_TASK_HANDOFF_INVALID:${taskChecked.failures.join("|")}`);
        }
        record = acceptFederatedHandoffOffer({ offer,
          sourceAttestation, receivedAt: options["received-at"],
          receiverPrivateKeyPem: readFileSync(path.resolve(options["signing-key"]), "utf8"),
          trustStore: readJson(options["trust-store"]) });
      } else {
        if (!positional[0] || !options["trust-store"]) { usage(); return 2; }
        const specFile = path.resolve(positional[0]), spec = readJson(specFile);
        const base = path.dirname(specFile);
        const materialize = (value) => typeof value === "string"
          ? JSON.parse(readFileSync(path.resolve(base, value), "utf8")) : value;
        record = createFederatedEvidencePacket({ ...spec,
          wayAttestations: (spec.wayAttestations ?? []).map(materialize),
          handoffs: (spec.handoffs ?? []).map(materialize),
          trustStore: readJson(options["trust-store"]) });
      }
      const output = writeJson(record, options.out);
      console.log(JSON.stringify({ ok: true, output,
        recordHash: record.recordHash ?? null, authority: "none", movesFunds: false }, null, 2));
      return 0;
    } catch (error) {
      console.error(`${command} failed: ${error?.message ?? error}`);
      return 1;
    }
  }
  if (command === "federation-plan-verify") {
    if (!positional[0] || !options["trust-store"]) { usage(); return 2; }
    const result = verifyFederatedTaskPlan(readJson(positional[0]),
      readJson(options["trust-store"]));
    console.log(JSON.stringify({ ...result, authority: "none",
      globalExecutionAuthority: false, movesFunds: false }, null, 2));
    return result.ok ? 0 : 1;
  }
  if (command === "federation-task-handoff-verify") {
    if (!positional[0] || !positional[1] || !options["task-plan"]
      || !options["trust-store"]) { usage(); return 2; }
    const handoff = readJson(positional[0]);
    const binding = handoff?.offer?.payload?.taskBinding;
    const result = verifyFederatedTaskHandoff({ taskPlan: readJson(options["task-plan"]),
      fromTaskId: binding?.fromTaskId, toTaskId: binding?.toTaskId,
      handoff, sourceAttestation: readJson(positional[1]),
      trustStore: readJson(options["trust-store"]) });
    console.log(JSON.stringify({ ...result, authority: "none",
      globalExecutionAuthority: false, movesFunds: false }, null, 2));
    return result.ok ? 0 : 1;
  }
  if (command === "federation-monitor-ingest" || command === "federation-monitor-status") {
    if (!options["trust-store"] || !options["state-root"]
      || (command === "federation-monitor-ingest" && !positional[0])) {
      usage(); return 2;
    }
    try {
      const maxSilenceMs = options["max-silence-ms"] == null ? 15 * 60_000
        : Number(options["max-silence-ms"]);
      const monitor = new DurableGlobalOutsiderMonitor({
        directory: path.resolve(options["state-root"]),
        trustStore: readJson(options["trust-store"]), maxSilenceMs,
        taskPlan: options["task-plan"] ? readJson(options["task-plan"]) : null });
      const now = options.now ?? new Date().toISOString();
      if (command === "federation-monitor-ingest") {
        const result = monitor.append(readJson(positional[0]));
        console.log(JSON.stringify({ ok: true, ...result,
          snapshot: monitor.snapshot({ now }),
          supervision: monitor.taskPlan ? monitor.supervision({ now }) : null }, null, 2));
        return 0;
      }
      const snapshot = monitor.snapshot({ now });
      console.log(JSON.stringify({ ok: monitor.verify().ok, ...snapshot,
        supervision: monitor.taskPlan ? monitor.supervision({ now }) : null }, null, 2));
      return monitor.verify().ok ? 0 : 1;
    } catch (error) {
      console.error(`${command} failed: ${error?.message ?? error}`);
      return 1;
    }
  }
  if (command === "federation-ingest" || command === "federation-status") {
    if (!options["trust-store"] || !options["state-root"]
      || (command === "federation-ingest" && !positional[0])) { usage(); return 2; }
    try {
      const registry = openFederationRegistry({ directory: path.resolve(options["state-root"]),
        trustStore: readJson(options["trust-store"]) });
      if (command === "federation-status") {
        const report = registry.summary();
        console.log(JSON.stringify(report, null, 2));
        return report.ok ? 0 : 1;
      }
      const packet = readJson(positional[0]), result = registry.append(packet);
      console.log(JSON.stringify({ ok: true, ...result, registry: registry.summary(),
        authority: "none", permitsPricing: false, movesFunds: false }, null, 2));
      return 0;
    } catch (error) {
      console.error(`${command} failed: ${error?.message ?? error}`);
      return 1;
    }
  }
  if (command === "federation-verify" || command === "federation-supervise") {
    if (!positional[0] || !options["trust-store"]
      || (command === "federation-supervise" && !options.out)) { usage(); return 2; }
    try {
      const packet = JSON.parse(readFileSync(path.resolve(positional[0]), "utf8"));
      const trustStore = JSON.parse(readFileSync(path.resolve(options["trust-store"]), "utf8"));
      const trust = verifyFederationTrustStore(trustStore);
      const verified = trust.ok
        ? verifyFederatedEvidencePacket(packet, trustStore)
        : { ok: false, failures: trust.failures, recordHash: null, summary: null };
      if (command === "federation-verify") {
        console.log(JSON.stringify({ ...verified, authority: "none",
          institutionalIndependenceEstablished: false,
          permitsPricing: false, movesFunds: false }, null, 2));
        return verified.ok ? 0 : 1;
      }
      if (!verified.ok) {
        console.error(`federation-supervise failed: ${verified.failures.join("|")}`);
        return 1;
      }
      const record = createFederatedSupervisionRecord(packet, trustStore);
      const output = path.resolve(options.out);
      writeFileSync(output, JSON.stringify(record, null, 2));
      console.log(JSON.stringify({ ok: true, output, recordHash: record.recordHash,
        eligibleForRoutingResearch: true, eligibleForGlobalCausalEffectLearning: false,
        eligibleForPricing: false, movesFunds: false }, null, 2));
      return 0;
    } catch (error) {
      console.error(`${command} failed: ${error?.message ?? error}`);
      return 1;
    }
  }
  if (command === "attest") {
    if (!positional.length || !options.out) { usage(); return 2; }
    try {
      const privateKeyPem = options["signing-key"]
        ? readFileSync(path.resolve(options["signing-key"]), "utf8") : null;
      const record = createAttestationV2({
        runDirectories: positional.map((value) => path.resolve(value)), privateKeyPem,
      });
      const output = path.resolve(options.out);
      writeFileSync(output, JSON.stringify(record, null, 2));
      console.log(JSON.stringify({ ok: true, output, signed: Boolean(record.signature),
        nUnique: record.nUnique, attestationHash: record.attestationHash }, null, 2));
      return 0;
    } catch (error) {
      console.error(`attest failed: ${error?.message ?? error}`);
      return 1;
    }
  }
  usage();
  return 2;
}

let directEntry = false;
try { directEntry = realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* imported */ }
if (directEntry) {
  process.exitCode = await main();
}
