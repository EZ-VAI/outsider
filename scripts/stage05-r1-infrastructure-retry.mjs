#!/usr/bin/env node
/*
 * Evaluation-only R1 infrastructure retry.
 *
 * This does not retry a product exposure.  It replaces exactly one scheduled
 * slot only when the frozen assessment proves that no worker/run/manifest was
 * created.  The original failure is copied into an immutable amendment
 * directory, the retry uses the original artifact/evaluator/runtime bindings,
 * and the final tally discloses the operational amendment.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync,
  readdirSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  assessR1CausalChain, R1_FIXTURE_ID, r1Digest, r1FileDigest, r1Record,
} from "./stage05-r1-repeatability-core.mjs";
import { tallyR1Repeatability } from "./stage05-r1-repeatability-tally.mjs";

const args = process.argv.slice(2);
const after = (flag) => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : null; };
const output = path.resolve(after("--experiment") ?? "");
const label = after("--label") ?? `${R1_FIXTURE_ID}-05`;
if (!args.includes("--execute-live")) throw new Error("R1_INFRA_RETRY_REQUIRES_--execute-live");
if (!output || !existsSync(path.join(output, "experiment.json"))) {
  throw new Error("R1_INFRA_RETRY_EXPERIMENT_REQUIRED");
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const experimentFile = path.join(output, "experiment.json");
const experiment = readJson(experimentFile);
const prereg = experiment.preregistration;
const schedule = prereg?.protocol?.schedule ?? [];
const item = schedule.find((row) => row.label === label);
if (!item || item.ordinal !== 5 || schedule.length !== 5) {
  throw new Error("R1_INFRA_RETRY_ONLY_FIFTH_FROZEN_SLOT_SUPPORTED");
}
const oldAssessmentFile = path.join(output, "results", `${label}.r1.json`);
const oldCanaryFile = path.join(output, "results", `${label}.canary.json`);
const oldAttestationFile = path.join(output, "attestations", `${label}.json`);
const oldAssessment = readJson(oldAssessmentFile);
const oldCanary = readJson(oldCanaryFile);
if (oldAssessment.runId != null || oldAssessment.runDirectory != null
  || oldAssessment.supervisedExperience != null
  || oldAssessment.attestation?.present === true
  || oldCanary.phase !== "before-worker" || oldCanary.runId != null
  || !String(oldCanary.error ?? "").includes("SEMANTIC_CONTROL_PREFLIGHT_FAILED")) {
  throw new Error("R1_INFRA_RETRY_TARGET_WAS_A_PRODUCT_EXPOSURE");
}

const retryOrdinal = (experiment.operationalAmendments ?? []).length + 1;
const retryId = `${label}-infra-retry-${String(retryOrdinal).padStart(2, "0")}`;
const archive = path.join(output, "infrastructure-attempts", retryId);
if (existsSync(archive) && readdirSync(archive).length) throw new Error("R1_INFRA_RETRY_ALREADY_EXISTS");
mkdirSync(archive, { recursive: true });
for (const [name, file] of [
  ["assessment.json", oldAssessmentFile], ["canary.json", oldCanaryFile],
  ["attestation.json", oldAttestationFile],
  ["worker.log", path.join(output, "logs", `${label}.log`)],
  ["budget.jsonl", path.join(output, "logs", `${label}.claude-budget.jsonl`)],
]) {
  if (existsSync(file)) copyFileSync(file, path.join(archive, name));
}
writeJson(path.join(archive, "failure-binding.json"), {
  schema: "outsider/stage05-r1-infrastructure-attempt/v1",
  label,
  reasonClass: "operator-confirmed-network-interruption-before-worker",
  productExposure: false,
  originalAssessmentHash: r1FileDigest(oldAssessmentFile),
  originalCanaryHash: r1FileDigest(oldCanaryFile),
  originalErrorHash: r1Digest(String(oldCanary.error ?? "")),
});

const artifactFile = path.join(output, prereg.artifact.path);
if (r1FileDigest(artifactFile) !== prereg.artifact.sha256) {
  throw new Error("R1_INFRA_RETRY_ARTIFACT_DRIFT");
}
for (const file of prereg.evaluator.files) {
  if (r1FileDigest(path.join(output, file.path)) !== file.sha256) {
    throw new Error(`R1_INFRA_RETRY_EVALUATOR_DRIFT:${file.path}`);
  }
}
if (r1Digest(prereg.evaluator.files) !== prereg.evaluator.sha256) {
  throw new Error("R1_INFRA_RETRY_EVALUATOR_CLOSURE_DRIFT");
}

const packageTarget = path.join(output, "packages", retryId);
mkdirSync(packageTarget, { recursive: true });
const extracted = spawnSync("tar", ["-xzf", artifactFile, "-C", packageTarget], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000,
});
if (extracted.status !== 0) throw new Error(`R1_INFRA_RETRY_EXTRACT_FAILED:${extracted.stderr}`);
const packageRoot = path.join(packageTarget, "package");
const runnerUrl = pathToFileURL(path.join(packageRoot, "src/outsider-kernel-runner.js"));
runnerUrl.searchParams.set("r1-infra-retry", retryId);
const runner = await import(runnerUrl.href);
const realClaude = runner.resolveClaudeExecutable();
const guardedClaude = path.join(output, "evaluator", "claude-runtime", "claude");
if (r1FileDigest(guardedClaude) !== prereg.runtime.workerExecutableHash
  || r1FileDigest(realClaude) !== prereg.runtime.realWorkerExecutableHash) {
  throw new Error("R1_INFRA_RETRY_CLAUDE_RUNTIME_DRIFT");
}
const maxBudgetUsd = prereg.runtime.costEnvelope.maxBudgetUsdPerProcess;
const maxInvocations = prereg.runtime.costEnvelope.maximumModelProcesses;
const supervisorCommand = [guardedClaude, "-p", "--model", prereg.runtime.supervisorModel,
  "--effort", prereg.runtime.supervisorEffort, "--max-budget-usd", String(maxBudgetUsd)];
if (r1Digest(runner.resolveSupervisorCommand(supervisorCommand, guardedClaude))
  !== prereg.runtime.supervisorCommandHash) {
  throw new Error("R1_INFRA_RETRY_SUPERVISOR_COMMAND_DRIFT");
}

const canaryFile = oldCanaryFile;
const assessmentFile = oldAssessmentFile;
const stateRoot = path.join(output, "state", retryId);
const workspaceRoot = path.join(output, "workspaces", retryId);
mkdirSync(stateRoot, { recursive: true });
mkdirSync(workspaceRoot, { recursive: true });
const logFile = path.join(output, "logs", `${retryId}.log`);
const budgetFile = path.join(output, "logs", `${retryId}.claude-budget.jsonl`);
const log = createWriteStream(logFile);
const environment = {
  ...process.env,
  OUTSIDER_REAL_CLAUDE: realClaude,
  OUTSIDER_CLAUDE_BUDGET_AUDIT_LOG: budgetFile,
  OUTSIDER_CLAUDE_MAX_BUDGET_USD: String(maxBudgetUsd),
  OUTSIDER_CLAUDE_MAX_INVOCATIONS: String(maxInvocations),
  OUTSIDER_PRODUCT_ARTIFACT_SHA256: prereg.artifact.sha256,
  OUTSIDER_EVALUATION_ARTIFACT_SHA256: prereg.evaluator.sha256,
  OUTSIDER_R1_ARTIFACT_SHA256: prereg.artifact.sha256,
  OUTSIDER_R1_EVALUATOR_SHA256: prereg.evaluator.sha256,
  OUTSIDER_R1_FIXTURE_SHA256: prereg.fixture.definitionHash,
  OUTSIDER_R1_CONTRACT_SHA256: prereg.operatorContractHash,
  OUTSIDER_R1_HIDDEN_ACCEPTANCE_SHA256: prereg.hiddenAcceptanceHash,
  OUTSIDER_R1_CLAIM_SHA256: prereg.canonicalCase.claim.claimHash,
  OUTSIDER_R1_WAY_SHA256: prereg.canonicalCase.way.wayHash,
  OUTSIDER_R1_WORLD_SHA256: prereg.canonicalCase.world.worldHash,
  OUTSIDER_R1_LABEL: label,
  OUTSIDER_WORKER: guardedClaude,
  OUTSIDER_RECOVERY_SUPERVISOR_ARGV: JSON.stringify(supervisorCommand),
  OUTSIDER_RECOVERY_MAX_BUDGET_USD: String(maxBudgetUsd),
  OUTSIDER_RECOVERY_MAX_SUPERVISOR_CALLS:
    String(prereg.runtime.costEnvelope.assumptions.runtimeSupervisorCalls),
  OUTSIDER_RECOVERY_FIXTURE: R1_FIXTURE_ID,
  OUTSIDER_RECOVERY_RESULT_FILE: canaryFile,
  OUTSIDER_RECOVERY_STATE_ROOT: stateRoot,
  OUTSIDER_RECOVERY_WORKSPACE_ROOT: workspaceRoot,
};
for (const name of ["CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_PARENT_SESSION_ID",
  "CLAUDE_CODE_AGENT_ID", "CLAUDE_CODE_PARENT_AGENT_ID", "CLAUDE_CODE_TEAM_NAME",
  "CLAUDE_CODE_TEAMMATE_NAME", "CLAUDE_CODE_TASK_LIST_ID"]) delete environment[name];

process.stdout.write(`R1 ${label}: retrying only pre-worker infrastructure slot\n`);
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
const canary = readJson(canaryFile);
if (canary.phase === "before-worker" || !canary.runId) {
  copyFileSync(canaryFile, path.join(archive, "retry-canary-failed.json"));
  throw new Error(`R1_INFRA_RETRY_FAILED_BEFORE_WORKER:${canary.error ?? "unknown"}`);
}

const evidenceUrl = pathToFileURL(path.join(packageRoot, "src/outsider-stage05-evidence.js"));
evidenceUrl.searchParams.set("r1-infra-retry", retryId);
const evidence = await import(evidenceUrl.href);
const experienceUrl = pathToFileURL(path.join(packageRoot,
  "src/outsider-supervised-experience.js"));
experienceUrl.searchParams.set("r1-infra-retry", retryId);
const experienceModule = await import(experienceUrl.href);
const fixtureUrl = pathToFileURL(path.join(packageRoot,
  "scripts/stage05-release-gate-fixtures.mjs"));
fixtureUrl.searchParams.set("r1-infra-retry", retryId);
const fixtureModule = await import(fixtureUrl.href);
const fixture = fixtureModule.releaseGateFixture(R1_FIXTURE_ID);
const immediateCheck = evidence.verifyStage05RunDirectory(canary.runDirectory);
const immediateTruth = await fixtureModule.verifyRepairedReleaseGateFixture(canary.cwd, fixture);
const events = readFileSync(path.join(canary.runDirectory, "events.jsonl"), "utf8")
  .split(/\r?\n/).filter(Boolean).map(JSON.parse);
const causalChain = assessR1CausalChain(events);
const experienceFile = path.join(canary.runDirectory, "stage05-supervised-experience.json");
const experience = readJson(experienceFile);
const experienceCheck = experienceModule.verifySupervisedExperienceV2(experience,
  { verified: immediateCheck });
const corpusTarget = path.join(output, "supervised-experience",
  `${experience.recordHash.slice("sha256:".length)}.json`);
if (!existsSync(corpusTarget)) copyFileSync(experienceFile, corpusTarget);
const perRunAttestation = evidence.createAttestationV2({ runDirectories: [canary.runDirectory] });
if (!evidence.verifyAttestationV2(perRunAttestation).ok) {
  throw new Error("R1_INFRA_RETRY_ATTESTATION_INVALID");
}
writeJson(oldAttestationFile, perRunAttestation);
const recoveryWindowMs = prereg.protocol.recoveryWindowMs;
process.stdout.write(`R1 ${label}: manifest verified; waiting ${recoveryWindowMs}ms recovery window\n`);
const waitStarted = performance.now();
await delay(recoveryWindowMs + 1_000);
const stableCheck = evidence.verifyStage05RunDirectory(canary.runDirectory);
const stableTruth = await fixtureModule.verifyRepairedReleaseGateFixture(canary.cwd, fixture);
const assessment = r1Record({
  schema: "outsider/stage05-r1-run-assessment/v1",
  label, fixtureId: R1_FIXTURE_ID, runId: canary.runId,
  runDirectory: canary.runDirectory, cwd: canary.cwd, packageRoot, processExit,
  canaryResultHash: r1FileDigest(canaryFile),
  evidence: {
    immediate: { ok: immediateCheck.ok, error: immediateCheck.error ?? null,
      manifestHash: immediateCheck.manifest?.manifestHash ?? null,
      evidenceRoot: immediateCheck.manifest?.rawLocalRoot?.merkleRoot ?? null },
    stable: { ok: stableCheck.ok, error: stableCheck.error ?? null,
      observedAfterMs: Math.floor(performance.now() - waitStarted),
      manifestHash: stableCheck.manifest?.manifestHash ?? null,
      evidenceRoot: stableCheck.manifest?.rawLocalRoot?.merkleRoot ?? null },
  },
  truth: { immediate: immediateTruth, stable: stableTruth },
  causalChain,
  supervisedExperience: { present: true, verified: experienceCheck.ok,
    error: experienceCheck.error ?? null, recordHash: experience.recordHash },
  attestation: { present: true, attestationHash: perRunAttestation.attestationHash,
    includedRunId: perRunAttestation.included?.[0]?.runId ?? null,
    supervisedExperienceHash:
      perRunAttestation.included?.[0]?.supervisedExperienceHash ?? null },
  errors: [],
  binding: { artifactHash: prereg.artifact.sha256,
    evaluatorHash: prereg.evaluator.sha256, fixtureHash: prereg.fixture.definitionHash,
    operatorContractHash: prereg.operatorContractHash,
    hiddenAcceptanceHash: prereg.hiddenAcceptanceHash,
    canonicalCase: prereg.canonicalCase },
}, "assessmentHash");
writeJson(assessmentFile, assessment);

const runDirectories = schedule.map((row) => readJson(path.join(output,
  "results", `${row.label}.r1.json`)).runDirectory);
if (runDirectories.some((directory) => !directory)) {
  throw new Error("R1_INFRA_RETRY_FIVE_RUN_DIRECTORIES_REQUIRED");
}
const aggregate = evidence.createAttestationV2({ runDirectories });
if (!evidence.verifyAttestationV2(aggregate).ok) {
  throw new Error("R1_INFRA_RETRY_AGGREGATE_ATTESTATION_INVALID");
}
writeJson(path.join(output, "attestations", "aggregate.json"), aggregate);
const retryEvaluatorHash = r1FileDigest(fileURLToPath(import.meta.url));
const amendment = r1Record({
  schema: "outsider/stage05-r1-operational-amendment/v1",
  targetLabel: label,
  originalAttemptArchive: path.relative(output, archive),
  originalAssessmentHash: oldAssessment.assessmentHash,
  originalFailureClass: "infrastructure-failure-before-worker",
  operatorStatement: "Wi-Fi disconnected; retry the unexposed fifth slot only",
  replacementRunId: canary.runId,
  replacementAssessmentHash: assessment.assessmentHash,
  productArtifactHash: prereg.artifact.sha256,
  frozenEvaluatorHash: prereg.evaluator.sha256,
  retryOrchestratorHash: retryEvaluatorHash,
  productExposureReplaced: false,
}, "amendmentHash");
experiment.operationalAmendments = [...(experiment.operationalAmendments ?? []), amendment];
writeJson(experimentFile, experiment);
const tally = { ...tallyR1Repeatability(output), operationalAmendments:
  experiment.operationalAmendments };
writeJson(path.join(output, "tally.json"), tally);
process.stdout.write(`${JSON.stringify(tally, null, 2)}\n`);
process.exitCode = tally.ok ? 0 : 1;
