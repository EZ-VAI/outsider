#!/usr/bin/env node
/*
 * Strict R1 live runner. It never runs a model unless --execute-live is
 * present. One copied npm package tarball is extracted into five fresh package
 * roots; missing-role-default is the only accepted fixture. Evaluation output
 * stays outside the permanently sealed run directories.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync,
  statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assessR1CausalChain, makeR1CanonicalCase, R1_FIXTURE_ID,
  R1_MIN_RECOVERY_WINDOW_MS, R1_RUN_COUNT, r1Digest, r1FileDigest, r1Record,
} from "./stage05-r1-repeatability-core.mjs";
import { tallyR1Repeatability } from "./stage05-r1-repeatability-tally.mjs";
import {
  DEFAULT_EVALUATION_SUPERVISOR_EFFORT, DEFAULT_EVALUATION_SUPERVISOR_MODEL,
  headlessCostEnvelope,
} from "./stage05-model-cost-policy.mjs";
import { materializeEvaluationClaudeGuard } from
  "./stage05-claude-budget-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/* Timers may return a few milliseconds before the requested wall duration on
   some host/runtime combinations.  The evaluator records observed time and
   must never turn that scheduler granularity into a false invalid-evidence
   result.  Wait beyond, never round up, the preregistered minimum. */
const R1_RECOVERY_WINDOW_SAFETY_MARGIN_MS = 1_000;
const args = process.argv.slice(2);
const after = (flag) => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : null; };
const live = args.includes("--execute-live");
const sourceArtifact = after("--artifact");
const recoveryWindowMs = Number(after("--recovery-window-ms")
  ?? R1_MIN_RECOVERY_WINDOW_MS);
const output = path.resolve(after("--output")
  ?? path.join(tmpdir(), `outsider-stage05-r1-${Date.now()}`));

if (!live) {
  process.stderr.write("R1_LIVE_EXECUTION_REQUIRES_EXPLICIT_--execute-live; no Claude process was started\n");
  process.exit(2);
}
if (!sourceArtifact || !existsSync(path.resolve(sourceArtifact))) {
  throw new Error("R1_PACKAGED_ARTIFACT_REQUIRED");
}
if (!Number.isInteger(recoveryWindowMs) || recoveryWindowMs < R1_MIN_RECOVERY_WINDOW_MS) {
  throw new Error(`R1_RECOVERY_WINDOW_MUST_BE_AT_LEAST_${R1_MIN_RECOVERY_WINDOW_MS}MS`);
}
if (existsSync(output)) throw new Error("R1_OUTPUT_MUST_BE_A_FRESH_DIRECTORY");
for (const name of ["artifact", "attestations", "evaluator", "logs", "packages",
  "results", "state", "supervised-experience", "workspaces"]) {
  mkdirSync(path.join(output, name), { recursive: true });
}

const artifactName = path.basename(sourceArtifact);
const artifactRelative = path.join("artifact", artifactName);
const artifactFile = path.join(output, artifactRelative);
copyFileSync(path.resolve(sourceArtifact), artifactFile);
if (!statSync(artifactFile).isFile()) throw new Error("R1_ARTIFACT_COPY_FAILED");
const artifactHash = r1FileDigest(artifactFile);
if (r1FileDigest(path.resolve(sourceArtifact)) !== artifactHash) {
  throw new Error("R1_ARTIFACT_COPY_HASH_MISMATCH");
}

function extractPackage(target) {
  mkdirSync(target, { recursive: true });
  const extracted = spawnSync("tar", ["-xzf", artifactFile, "-C", target], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000,
  });
  if (extracted.status !== 0) throw new Error(`R1_ARTIFACT_EXTRACT_FAILED:${extracted.stderr}`);
  const packageRoot = path.join(target, "package");
  const required = ["package.json", "scripts/stage05-recovery-family-canary.mjs",
    "scripts/stage05-recovery-injection-hook.mjs",
    "scripts/stage05-release-gate-fixtures.mjs",
    "scripts/stage05-r1-repeatability-core.mjs", "src/outsider-stage05-evidence.js",
    "src/outsider-supervised-experience.js"];
  for (const relative of required) {
    if (!existsSync(path.join(packageRoot, relative))) {
      throw new Error(`R1_ARTIFACT_REQUIRED_FILE_MISSING:${relative}`);
    }
  }
  const pkg = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  if (pkg.name !== "outsider-guard") throw new Error("R1_ARTIFACT_PACKAGE_IDENTITY_INVALID");
  return packageRoot;
}

const preregPackage = extractPackage(path.join(output, "packages", "preregistration"));
const runnerUrl = pathToFileURL(path.join(preregPackage, "src/outsider-kernel-runner.js"));
runnerUrl.searchParams.set("r1-runtime", artifactHash);
const runnerModule = await import(runnerUrl.href);
let realWorkerExecutable = path.resolve(after("--worker")
  ?? runnerModule.resolveClaudeExecutable());
if (!existsSync(realWorkerExecutable)) {
  const located = spawnSync("which", [after("--worker")
    ?? runnerModule.resolveClaudeExecutable()], { encoding: "utf8" });
  realWorkerExecutable = String(located.stdout ?? "").trim();
}
if (!realWorkerExecutable || !existsSync(realWorkerExecutable)) {
  throw new Error("R1_CLAUDE_EXECUTABLE_REQUIRED");
}
const realWorkerExecutableHash = r1FileDigest(realWorkerExecutable);
const workerVersionResult = spawnSync(realWorkerExecutable, ["--version"], {
  encoding: "utf8", timeout: 15_000,
});
if (workerVersionResult.status !== 0) throw new Error("R1_CLAUDE_VERSION_UNAVAILABLE");
const workerVersion = String(workerVersionResult.stdout ?? workerVersionResult.stderr ?? "").trim();
const supervisorModel = String(after("--supervisor-model")
  ?? DEFAULT_EVALUATION_SUPERVISOR_MODEL);
const supervisorEffort = String(after("--supervisor-effort")
  ?? DEFAULT_EVALUATION_SUPERVISOR_EFFORT);
const maxBudgetUsd = Number(after("--max-budget-usd") ?? 0.5);
const maxRuntimeSupervisorCalls = Number(after("--max-runtime-supervisor-calls") ?? 4);
if (!/^[A-Za-z0-9._:-]+$/.test(supervisorModel)
  || supervisorModel.toLowerCase().includes("opus")
  || supervisorEffort !== "low"
  || !Number.isFinite(maxBudgetUsd) || maxBudgetUsd <= 0 || maxBudgetUsd > 2
  || !Number.isInteger(maxRuntimeSupervisorCalls)
  || maxRuntimeSupervisorCalls < 1 || maxRuntimeSupervisorCalls > 8) {
  throw new Error("R1_SUPERVISOR_RUNTIME_OPTIONS_INVALID");
}
const preliminaryCostEnvelope = headlessCostEnvelope({ maxBudgetUsd, workerProcesses: 1,
  baselineJudgeProcesses: 2, runtimeSupervisorCalls: maxRuntimeSupervisorCalls,
  maximumAttemptsPerJudge: 2 });
const costRuntime = materializeEvaluationClaudeGuard({
  directory: path.join(output, "evaluator", "claude-runtime"),
  realClaude: realWorkerExecutable,
  maxBudgetUsd,
  maxInvocations: preliminaryCostEnvelope.maximumModelProcesses,
});
Object.assign(process.env, costRuntime.environment);
const workerExecutable = costRuntime.executable;
const workerExecutableHash = r1FileDigest(workerExecutable);
const workerPreflight = runnerModule.preflightWorkerCli(workerExecutable);
if (!workerPreflight?.ok) {
  throw new Error(`R1_CLAUDE_PREFLIGHT_FAILED:${workerPreflight?.error ?? "unknown"}`);
}
const supervisorCommand = [workerExecutable, "-p",
  "--model", supervisorModel, "--effort", supervisorEffort,
  "--max-budget-usd", String(maxBudgetUsd)];
const resolvedSupervisorCommand = runnerModule.resolveSupervisorCommand(
  supervisorCommand, workerExecutable);
const runtimeIdentity = {
  workerExecutableHash,
  realWorkerExecutableHash,
  workerVersion,
  workerTransport: "headless",
  workerModel: costRuntime.policy.model,
  workerEffort: costRuntime.policy.effort,
  workerGuardHash: workerExecutableHash,
  supervisorCommandHash: r1Digest(resolvedSupervisorCommand),
  supervisorModel,
  supervisorEffort,
  costEnvelope: preliminaryCostEnvelope,
};
const maxModelProcessesPerRun = runtimeIdentity.costEnvelope.maximumModelProcesses;
const runtimeIdentityHash = r1Digest(runtimeIdentity);
const fixtureUrl = pathToFileURL(path.join(preregPackage,
  "scripts/stage05-release-gate-fixtures.mjs"));
fixtureUrl.searchParams.set("r1", artifactHash);
const fixtureModule = await import(fixtureUrl.href);
const fixture = fixtureModule.releaseGateFixture(R1_FIXTURE_ID);
const legacyDefinitionHash = fixtureModule.releaseGateFixtureHash(fixture);
const fixtureHash = `sha256:${legacyDefinitionHash}`;
const operatorContractHash = r1Digest({ ask: fixture.ask, contract: fixture.contract });
const hiddenAcceptanceHash = r1Digest({ fixtureId: fixture.id,
  oracleSource: fixture.truth.toString() });

const evaluatorSources = [
  ["orchestrator/stage05-r1-repeatability.mjs", path.join(root,
    "scripts/stage05-r1-repeatability.mjs")],
  ["orchestrator/stage05-r1-repeatability-tally.mjs", path.join(root,
    "scripts/stage05-r1-repeatability-tally.mjs")],
  ["orchestrator/stage05-r1-repeatability-core.mjs", path.join(root,
    "scripts/stage05-r1-repeatability-core.mjs")],
  ["orchestrator/stage05-claude-budget-runtime.mjs", path.join(root,
    "scripts/stage05-claude-budget-runtime.mjs")],
  ["orchestrator/claude-budget-guard.mjs", path.join(root,
    "scripts/claude-budget-guard.mjs")],
  ["orchestrator/outsider-stage05-evidence.js", path.join(root,
    "src/outsider-stage05-evidence.js")],
  ["artifact/stage05-recovery-family-canary.mjs", path.join(preregPackage,
    "scripts/stage05-recovery-family-canary.mjs")],
  ["artifact/stage05-recovery-injection-hook.mjs", path.join(preregPackage,
    "scripts/stage05-recovery-injection-hook.mjs")],
  ["artifact/stage05-release-gate-fixtures.mjs", path.join(preregPackage,
    "scripts/stage05-release-gate-fixtures.mjs")],
  ["artifact/outsider-stage05-evidence.js", path.join(preregPackage,
    "src/outsider-stage05-evidence.js")],
  ["artifact/outsider-supervised-experience.js", path.join(preregPackage,
    "src/outsider-supervised-experience.js")],
];
const evaluatorFiles = evaluatorSources.map(([relative, source]) => {
  const target = path.join(output, "evaluator", relative);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
  return { path: path.relative(output, target), sha256: r1FileDigest(target) };
});
const evaluatorHash = r1Digest(evaluatorFiles);
const schedule = Array.from({ length: R1_RUN_COUNT }, (_, index) => ({
  ordinal: index + 1,
  label: `${R1_FIXTURE_ID}-${String(index + 1).padStart(2, "0")}`,
  fixtureId: R1_FIXTURE_ID,
}));
const canonicalCase = makeR1CanonicalCase({ artifactHash, evaluatorHash, fixtureHash,
  contractHash: operatorContractHash, hiddenAcceptanceHash, runtimeIdentityHash });
const preregistration = r1Record({
  schema: "outsider/stage05-r1-preregistration/v1",
  artifact: { path: artifactRelative, sha256: artifactHash,
    byteLength: statSync(artifactFile).size },
  evaluator: { sha256: evaluatorHash, files: evaluatorFiles },
  fixture: { id: fixture.id, family: fixture.family, definitionHash: fixtureHash,
    legacyDefinitionHash },
  operatorContractHash,
  hiddenAcceptanceHash,
  runtime: { ...runtimeIdentity, runtimeIdentityHash },
  protocol: {
    gate: "R1",
    host: "claude-code",
    runCount: R1_RUN_COUNT,
    execution: "strictly-sequential",
    workspacePolicy: "fresh-per-run",
    recoveryWindowMs,
    schedule,
  },
  canonicalCase,
}, "preregistrationHash");
const experiment = {
  schema: "outsider/stage05-r1-repeatability-experiment/v1",
  createdAt: new Date().toISOString(),
  design: { host: "claude-code", fixtureId: R1_FIXTURE_ID, runs: R1_RUN_COUNT,
    workspacePolicy: "fresh-per-run", runIdPolicy: "fresh-per-run",
    execution: "strictly-sequential", recoveryWindowMs, schedule },
  preregistration,
  claimBoundary: "repeatability of one constructed missing-role-default recovery fixture; no R2-R5 claim",
};
writeFileSync(path.join(output, "experiment.json"), JSON.stringify(experiment, null, 2));

const evaluatorMatches = () => evaluatorFiles.every((item) =>
  r1FileDigest(path.join(output, item.path)) === item.sha256)
  && r1Digest(evaluatorFiles) === evaluatorHash;
const currentArtifactMatches = () => r1FileDigest(artifactFile) === artifactHash;
const currentRuntimeMatches = () => r1FileDigest(workerExecutable) === workerExecutableHash
  && r1FileDigest(realWorkerExecutable) === realWorkerExecutableHash;
const hashEnv = {
  ...costRuntime.environment,
  OUTSIDER_PRODUCT_ARTIFACT_SHA256: artifactHash,
  OUTSIDER_EVALUATION_ARTIFACT_SHA256: evaluatorHash,
  OUTSIDER_R1_ARTIFACT_SHA256: artifactHash,
  OUTSIDER_R1_EVALUATOR_SHA256: evaluatorHash,
  OUTSIDER_R1_FIXTURE_SHA256: fixtureHash,
  OUTSIDER_R1_CONTRACT_SHA256: operatorContractHash,
  OUTSIDER_R1_HIDDEN_ACCEPTANCE_SHA256: hiddenAcceptanceHash,
  OUTSIDER_R1_CLAIM_SHA256: canonicalCase.claim.claimHash,
  OUTSIDER_R1_WAY_SHA256: canonicalCase.way.wayHash,
  OUTSIDER_R1_WORLD_SHA256: canonicalCase.world.worldHash,
  OUTSIDER_WORKER: workerExecutable,
  OUTSIDER_RECOVERY_SUPERVISOR_ARGV: JSON.stringify(supervisorCommand),
  OUTSIDER_RECOVERY_MAX_BUDGET_USD: String(maxBudgetUsd),
  OUTSIDER_RECOVERY_MAX_SUPERVISOR_CALLS: String(maxRuntimeSupervisorCalls),
};

const runDirectories = [];
let batchAbort = null;
for (const item of schedule) {
  if (!currentArtifactMatches()) throw new Error("R1_PACKAGED_ARTIFACT_DRIFT_DURING_RUN");
  if (!evaluatorMatches()) throw new Error("R1_EVALUATOR_DRIFT_DURING_RUN");
  if (!currentRuntimeMatches()) throw new Error("R1_CLAUDE_RUNTIME_DRIFT_DURING_RUN");
  const packageRoot = extractPackage(path.join(output, "packages", item.label));
  const canaryFile = path.join(output, "results", `${item.label}.canary.json`);
  const assessmentFile = path.join(output, "results", `${item.label}.r1.json`);
  const stateRoot = path.join(output, "state", item.label);
  const workspaceRoot = path.join(output, "workspaces", item.label);
  mkdirSync(stateRoot, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: true });
  const log = createWriteStream(path.join(output, "logs", `${item.label}.log`));
  process.stdout.write(`R1 ${item.label}: starting immutable artifact ${artifactHash.slice(0, 19)}\n`);
  const environment = { ...process.env, ...hashEnv,
    OUTSIDER_R1_LABEL: item.label,
    OUTSIDER_RECOVERY_FIXTURE: R1_FIXTURE_ID,
    OUTSIDER_RECOVERY_RESULT_FILE: canaryFile,
    OUTSIDER_RECOVERY_STATE_ROOT: stateRoot,
    OUTSIDER_RECOVERY_WORKSPACE_ROOT: workspaceRoot,
    OUTSIDER_CLAUDE_BUDGET_AUDIT_LOG: path.join(output, "logs",
      `${item.label}.claude-budget.jsonl`),
    OUTSIDER_CLAUDE_MAX_BUDGET_USD: String(maxBudgetUsd),
    OUTSIDER_CLAUDE_MAX_INVOCATIONS: String(maxModelProcessesPerRun) };
  for (const name of ["CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_PARENT_SESSION_ID",
    "CLAUDE_CODE_AGENT_ID", "CLAUDE_CODE_PARENT_AGENT_ID", "CLAUDE_CODE_TEAM_NAME",
    "CLAUDE_CODE_TEAMMATE_NAME", "CLAUDE_CODE_TASK_LIST_ID"]) delete environment[name];
  const child = spawn(process.execPath,
    [path.join(packageRoot, "scripts/stage05-recovery-family-canary.mjs"),
      "--fixture", R1_FIXTURE_ID], {
      cwd: packageRoot, env: environment, stdio: ["ignore", "pipe", "pipe"],
    });
  child.stdout.on("data", (chunk) => { log.write(chunk); process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => { log.write(chunk); process.stderr.write(chunk); });
  const processExit = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: null, signal: null,
      error: String(error?.message ?? error) }));
    child.once("close", (code, signal) => resolve({ code, signal, error: null }));
  });
  await new Promise((resolve) => log.end(resolve));
  const assessmentErrors = [];
  let canary = null;
  let immediate = { ok: false, error: "CANARY_RESULT_MISSING" };
  let stable = { ok: false, error: "CANARY_RESULT_MISSING", observedAfterMs: 0 };
  let immediateTruth = { exact: false, violatesContract: true,
    error: "CANARY_RESULT_MISSING" };
  let stableTruth = immediateTruth;
  let causalChain = { ok: false, errors: ["CANARY_RESULT_MISSING"] };
  let supervisedExperience = null;
  let attestation = null;
  try {
    canary = JSON.parse(readFileSync(canaryFile, "utf8"));
    if (canary.phase === "before-worker" && !canary.runId) {
      throw new Error(`R1_INFRASTRUCTURE_FAILURE_BEFORE_WORKER:${String(
        canary.error ?? "unknown pre-worker failure").slice(0, 1200)}`);
    }
    const evidenceUrl = pathToFileURL(path.join(packageRoot,
      "src/outsider-stage05-evidence.js"));
    evidenceUrl.searchParams.set("r1", item.label);
    const evidenceModule = await import(evidenceUrl.href);
    const experienceUrl = pathToFileURL(path.join(packageRoot,
      "src/outsider-supervised-experience.js"));
    experienceUrl.searchParams.set("r1", item.label);
    const experienceModule = await import(experienceUrl.href);
    const perRunFixtureUrl = pathToFileURL(path.join(packageRoot,
      "scripts/stage05-release-gate-fixtures.mjs"));
    perRunFixtureUrl.searchParams.set("r1", item.label);
    const perRunFixtureModule = await import(perRunFixtureUrl.href);
    const perRunFixture = perRunFixtureModule.releaseGateFixture(R1_FIXTURE_ID);
    const checked = evidenceModule.verifyStage05RunDirectory(canary.runDirectory);
    immediate = { ok: checked.ok, error: checked.error ?? null,
      manifestHash: checked.manifest?.manifestHash ?? null,
      evidenceRoot: checked.manifest?.rawLocalRoot?.merkleRoot ?? null };
    immediateTruth = await perRunFixtureModule.verifyRepairedReleaseGateFixture(
      canary.cwd, perRunFixture);
    const eventBytes = readFileSync(path.join(canary.runDirectory, "events.jsonl"), "utf8");
    causalChain = assessR1CausalChain(eventBytes.split(/\r?\n/).filter(Boolean).map(JSON.parse));
    const experienceFile = path.join(canary.runDirectory,
      "stage05-supervised-experience.json");
    const experience = JSON.parse(readFileSync(experienceFile, "utf8"));
    const experienceCheck = experienceModule.verifySupervisedExperienceV2(experience,
      { verified: checked });
    supervisedExperience = { present: true, verified: experienceCheck.ok,
      error: experienceCheck.error ?? null, recordHash: experience.recordHash };
    const corpusTarget = path.join(output, "supervised-experience",
      `${experience.recordHash.slice("sha256:".length)}.json`);
    if (existsSync(corpusTarget)) {
      if (r1FileDigest(corpusTarget) !== r1FileDigest(experienceFile)) {
        throw new Error("R1_SUPERVISED_EXPERIENCE_CORPUS_CONFLICT");
      }
    } else copyFileSync(experienceFile, corpusTarget);
    attestation = evidenceModule.createAttestationV2({ runDirectories: [canary.runDirectory] });
    const attestationCheck = evidenceModule.verifyAttestationV2(attestation);
    const attestationPath = path.join(output, "attestations", `${item.label}.json`);
    writeFileSync(attestationPath, JSON.stringify(attestation, null, 2));
    if (!attestationCheck.ok) assessmentErrors.push("PER_RUN_ATTESTATION_INVALID");
    process.stdout.write(`R1 ${item.label}: manifest verified; waiting ${recoveryWindowMs}ms recovery window\n`);
    const waitStarted = performance.now();
    await delay(recoveryWindowMs + R1_RECOVERY_WINDOW_SAFETY_MARGIN_MS);
    const observedAfterMs = Math.floor(performance.now() - waitStarted);
    const checkedAgain = evidenceModule.verifyStage05RunDirectory(canary.runDirectory);
    stable = { ok: checkedAgain.ok, error: checkedAgain.error ?? null, observedAfterMs,
      manifestHash: checkedAgain.manifest?.manifestHash ?? null,
      evidenceRoot: checkedAgain.manifest?.rawLocalRoot?.merkleRoot ?? null };
    stableTruth = await perRunFixtureModule.verifyRepairedReleaseGateFixture(
      canary.cwd, perRunFixture);
    if (checked.ok && checkedAgain.ok) runDirectories.push(canary.runDirectory);
  } catch (error) {
    assessmentErrors.push(`R1_POST_RUN_ASSESSMENT_FAILED:${error?.message ?? error}`);
  }
  if (!existsSync(path.join(output, "attestations", `${item.label}.json`))) {
    writeFileSync(path.join(output, "attestations", `${item.label}.json`), "{}");
  }
  if (!currentArtifactMatches()) assessmentErrors.push("PACKAGED_ARTIFACT_DRIFT");
  if (!evaluatorMatches()) assessmentErrors.push("EVALUATOR_DRIFT");
  if (!currentRuntimeMatches()) assessmentErrors.push("CLAUDE_RUNTIME_DRIFT");
  const canaryResultHash = existsSync(canaryFile) ? r1FileDigest(canaryFile) : null;
  const assessment = r1Record({
    schema: "outsider/stage05-r1-run-assessment/v1",
    label: item.label,
    fixtureId: R1_FIXTURE_ID,
    runId: canary?.runId ?? null,
    runDirectory: canary?.runDirectory ?? null,
    cwd: canary?.cwd ?? null,
    packageRoot,
    processExit,
    canaryResultHash,
    evidence: { immediate, stable },
    truth: { immediate: immediateTruth, stable: stableTruth },
    causalChain,
    supervisedExperience,
    attestation: attestation ? { present: true,
      attestationHash: attestation.attestationHash,
      includedRunId: attestation.included?.[0]?.runId ?? null,
      supervisedExperienceHash: attestation.included?.[0]?.supervisedExperienceHash ?? null,
    } : { present: false, attestationHash: null },
    errors: assessmentErrors,
    binding: { artifactHash, evaluatorHash, fixtureHash, operatorContractHash,
      hiddenAcceptanceHash, canonicalCase },
  }, "assessmentHash");
  writeFileSync(assessmentFile, JSON.stringify(assessment, null, 2));
  process.stdout.write(`R1 ${item.label}: assessment ${assessment.assessmentHash.slice(0, 19)}\n`);
  if (canary?.phase === "before-worker" && !canary.runId) {
    batchAbort = r1Record({
      schema: "outsider/stage05-r1-batch-abort/v1",
      stoppedAfterOrdinal: item.ordinal,
      stoppedAfterLabel: item.label,
      eligibleProductSamples: 0,
      reasonClass: "infrastructure-failure-before-worker",
      error: String(canary.error ?? "unknown pre-worker failure").slice(0, 1200),
      excludedFromLearning: true,
    });
    writeFileSync(path.join(output, "batch-abort.json"), JSON.stringify(batchAbort, null, 2));
    process.stderr.write("R1_BATCH_ABORTED_AFTER_PRE_WORKER_INFRASTRUCTURE_FAILURE; remaining scheduled samples were not started\n");
    break;
  }
}

if (runDirectories.length === R1_RUN_COUNT) {
  try {
    const evidenceUrl = pathToFileURL(path.join(preregPackage,
      "src/outsider-stage05-evidence.js"));
    evidenceUrl.searchParams.set("r1-aggregate", artifactHash);
    const evidenceModule = await import(evidenceUrl.href);
    const aggregate = evidenceModule.createAttestationV2({ runDirectories });
    const checked = evidenceModule.verifyAttestationV2(aggregate);
    if (!checked.ok) throw new Error(`R1_AGGREGATE_ATTESTATION_INVALID:${checked.error}`);
    writeFileSync(path.join(output, "attestations", "aggregate.json"),
      JSON.stringify(aggregate, null, 2));
  } catch (error) {
    writeFileSync(path.join(output, "attestations", "aggregate-error.json"),
      JSON.stringify({ error: String(error?.message ?? error) }, null, 2));
  }
}

const report = tallyR1Repeatability(output);
writeFileSync(path.join(output, "tally.json"), JSON.stringify(report, null, 2));
process.stdout.write(`${JSON.stringify(report, null, 2)}\nR1 experiment=${output}\n`);
process.exitCode = report.ok ? 0 : 1;
