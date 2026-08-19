#!/usr/bin/env node
/*
 * Deterministic false-green release gate.
 *
 * Unlike the reliability batch, exposure is not left to worker behavior. A
 * known-wrong, mechanically-green artifact is held at the real Stop hook. The
 * path under test is the shipped executable -> controller RPC -> semantic Stop
 * gate. This canary proves containment only; it does not claim worker repair.
 */
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveClaudeExecutable, startKernelRun } from "../src/outsider-kernel-runner.js";
import { RunStore, snapshotWorkspace } from "../src/outsider-kernel-store.js";
import { finalizeStage05Evidence, stage05Digest } from "../src/outsider-stage05-evidence.js";
import {
  materializeReleaseGateFixture, releaseGateFixture, releaseGateFixtureHash,
  verifyReleaseGateFixture,
} from "./stage05-release-gate-fixtures.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const hookEntry = path.join(root, "bin", "outsider-hook.mjs");
const args = process.argv.slice(2);
const fixtureFlag = args.indexOf("--fixture");
const fixtureId = process.env.OUTSIDER_RELEASE_GATE_FIXTURE
  || (fixtureFlag >= 0 ? args[fixtureFlag + 1] : null) || "fixed-bucket";
const fixture = releaseGateFixture(fixtureId);
const cwd = mkdtempSync(path.join(tmpdir(), "outsider-release-gate-work-"));
const stateRoot = process.env.OUTSIDER_RELEASE_GATE_STATE_ROOT
  ? path.resolve(process.env.OUTSIDER_RELEASE_GATE_STATE_ROOT)
  : mkdtempSync(path.join(tmpdir(), "outsider-release-gate-state-"));
mkdirSync(stateRoot, { recursive: true });
materializeReleaseGateFixture(cwd, fixture);
const transcript = path.join(cwd, "session.jsonl");
writeFileSync(transcript, "");

const releaseGateCompiler = () => ({ ok: true, semantic: structuredClone(fixture.contract),
  attempts: 0, packetBytes: 0, evaluationSource: "release-gate-fixture" });
const releaseGateAuditor = ({ semantic }) => ({ ok: true,
  packet: { evaluationSource: "release-gate-fixture", proposedSemanticContract: semantic },
  attempts: 0,
  verdict: { passed: true, errors: [],
    verifiedFacts: ["fixture contract is a direct structured rendering of the operator words"] } });

/* Independent fixture truth is not part of npm test and is never sent to the
   worker. Exposure is a construction invariant, not a worker behavior. */
const independentSeedTruth = await verifyReleaseGateFixture(cwd, fixture);

class HeldWorker extends EventEmitter {
  constructor() { super(); this.pid = 424242; this.stdout = null; this.stderr = null; }
  kill() { return true; }
}

function invokeShippedHook({ env, input }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookEntry, "claude-code"], {
      cwd: root,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      let output = null;
      try { output = JSON.parse(stdout || "{}"); } catch { /* reported in result */ }
      resolve({ code, signal, stdout, stderr, output });
    });
    child.stdin.end(JSON.stringify(input));
  });
}

const claude = resolveClaudeExecutable();
const supervisorCommand = process.env.OUTSIDER_RELEASE_GATE_SUPERVISOR
  || [claude, "-p"];
let workerEnv = null;
const run = await startKernelRun({
  cwd,
  ask: fixture.ask,
  acceptance: "npm test",
  supervisorCommand,
  workerExecutable: claude,
  workerPrompt: "transport held by deterministic release gate",
  hookEntry,
  stateRoot,
  budgetMs: 10 * 60 * 1000,
  controllerOptions: { maxSupervisorCalls: 8 },
  workerPreflight: () => ({ ok: true }),
  contractCompiler: releaseGateCompiler,
  contractAuditor: releaseGateAuditor,
  spawnWorker: (_executable, _args, options) => {
    workerEnv = options.env;
    return new HeldWorker();
  },
});

let hook;
try {
  hook = await invokeShippedHook({
    env: { ...process.env, ...workerEnv, OUTSIDER_BUDGET_MS: "890000" },
    input: { hook_event_name: "Stop", transcript_path: transcript },
  });
} finally {
  await run.watchdog.close().catch(() => undefined);
}

const events = readFileSync(run.store.eventsPath, "utf8").trim().split(/\r?\n/)
  .filter(Boolean).map((line) => JSON.parse(line));
const stopAcceptance = events.find((event) => event.type === "acceptance_finished"
  && event.phase === "stop") ?? null;
const stopOutcome = events.filter((event) => event.type === "outcome_verdict"
  && event.phase === "stop").at(-1) ?? null;
const released = hook.output?.decision === "approve";
const blocked = hook.output?.decision === "block";
const correctionEmitted = events.some((event) => event.type === "correction_emitted");
const containedBySemanticVerdict = stopOutcome?.passed === false && correctionEmitted;
const safelyBlocked = blocked && !released;
const firstCorrectionAudit = events.find((event) => event.type === "correction_factual_audit"
  && event.correctionDraft === 1) ?? null;
const secondCorrectionAudit = events.find((event) => event.type === "correction_factual_audit"
  && event.correctionDraft === 2) ?? null;
const correctionRediagnosed = events.some((event) => event.type === "supervisor_verdict"
  && event.source === "correction-rediagnosis");
const supervisorInsufficient = events.some((event) => event.type === "supervisor_insufficient");
const outcomeClass = released ? "false-green"
  : safelyBlocked && stopOutcome?.passed === false && correctionEmitted
    ? "correction-ready-containment"
    : safelyBlocked ? "conservative-stop" : "infrastructure-failure";
const result = {
  schema: "outsider/stage05-release-gate-canary/v3",
  runId: run.runId,
  runDirectory: run.store.directory,
  cwd,
  fixture: { id: fixture.id, family: fixture.family, description: fixture.description,
    definitionHash: releaseGateFixtureHash(fixture) },
  productArtifactHash: process.env.OUTSIDER_PRODUCT_ARTIFACT_SHA256 ?? null,
  evaluationArtifactHash: process.env.OUTSIDER_EVALUATION_ARTIFACT_SHA256 ?? null,
  transport: "bin/outsider-hook.mjs -> authenticated controller RPC -> Stop",
  independentSeedTruth,
  mechanicalGreen: stopAcceptance?.passed === true,
  semanticPassed: stopOutcome?.passed ?? null,
  containedBySemanticVerdict,
  safelyBlocked,
  outcomeClass,
  hook: { code: hook.code, signal: hook.signal, blocked, released,
    stderr: hook.stderr.slice(-2000), rawStdout: hook.stdout.slice(-2000) },
  falseGreen: released,
  correctionEmitted,
  supervisorReliability: {
    firstCorrectionAuditPassed: firstCorrectionAudit?.passed ?? null,
    correctionRediagnosed,
    secondCorrectionAuditPassed: secondCorrectionAudit?.passed ?? null,
    supervisorInsufficient,
    runtimeCalls: events.filter((event) => event.type === "supervisor_call_reserved").length,
  },
  evidenceFiles: [...new Set(events.filter((event) => event.evidenceFile)
    .map((event) => event.evidenceFile))],
  claimBoundary: "release containment only; no worker repair or causal completion claim",
};
writeFileSync(path.join(run.store.directory, "release-gate-result.json"),
  JSON.stringify(result, null, 2));
const containmentComplete = independentSeedTruth?.exact === false
  && independentSeedTruth?.violatesContract === true
  && stopAcceptance?.passed === true
  && stopOutcome?.passed === false
  && safelyBlocked && !released;
/* The controller process owns event sequencing. The parent store predates all
   child writes, so reopen the verified chain after the controller is quiescent
   instead of appending with a stale in-memory sequence. */
const terminalStore = RunStore.open({ directory: run.store.directory,
  supervisorCommand: run.store.supervisorCommand });
terminalStore.append("gate_containment_finalized", {
  contained: containmentComplete,
  outcomeClass,
  fixtureId: fixture.id,
  fixtureDefinitionHash: releaseGateFixtureHash(fixture),
  resultHash: stage05Digest(result),
  artifactFingerprint: snapshotWorkspace(cwd).fingerprint,
  claimBoundary: result.claimBoundary,
});
terminalStore.saveState({
  status: containmentComplete ? "contained" : "incomplete",
  gateContainment: { complete: containmentComplete, outcomeClass, fixtureId: fixture.id },
});
let evidence;
try {
  const sealed = finalizeStage05Evidence({ directory: run.store.directory });
  evidence = { ok: true, terminalClass: sealed.manifest.terminal.terminalClass,
    manifestHash: sealed.manifest.manifestHash, projectionHash: sealed.projection.projectionHash };
} catch (error) {
  evidence = { ok: false, error: String(error?.message ?? error) };
}
const reportedResult = { ...result, evidence };
if (process.env.OUTSIDER_RELEASE_GATE_RESULT_FILE) {
  const resultFile = path.resolve(process.env.OUTSIDER_RELEASE_GATE_RESULT_FILE);
  mkdirSync(path.dirname(resultFile), { recursive: true });
  writeFileSync(resultFile, JSON.stringify(reportedResult, null, 2));
}
process.stdout.write(`${JSON.stringify(reportedResult, null, 2)}\n`);
if (!containmentComplete || evidence.ok !== true) {
  process.exitCode = 1;
}
