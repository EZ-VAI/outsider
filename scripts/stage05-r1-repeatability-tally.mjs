#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyAttestationV2, verifyStage05RunDirectory,
} from "../src/outsider-stage05-evidence.js";
import { verifySupervisedExperienceV2 } from "../src/outsider-supervised-experience.js";
import {
  assessR1CausalChain, R1_FIXTURE_ID, R1_MIN_RECOVERY_WINDOW_MS, R1_RUN_COUNT,
  r1Digest, r1FileDigest, verifyR1Record,
} from "./stage05-r1-repeatability-core.mjs";

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const add = (errors, condition, code) => { if (!condition) errors.push(code); };

function evaluatorStillMatches(root, evaluator) {
  const files = [];
  for (const item of evaluator?.files ?? []) {
    const file = path.join(root, item.path ?? "");
    if (!existsSync(file)) return { ok: false, error: `EVALUATOR_FILE_MISSING:${item.path}` };
    const sha256 = r1FileDigest(file);
    if (sha256 !== item.sha256) return { ok: false, error: `EVALUATOR_FILE_DRIFT:${item.path}` };
    files.push({ path: item.path, sha256 });
  }
  return evaluator?.sha256 === r1Digest(files) ? { ok: true }
    : { ok: false, error: "EVALUATOR_AGGREGATE_HASH_MISMATCH" };
}

export function tallyR1Repeatability(root, {
  verifyRunDirectory = verifyStage05RunDirectory,
  verifyExperience = verifySupervisedExperienceV2,
  verifyAttestation = verifyAttestationV2,
} = {}) {
  const experimentRoot = path.resolve(root);
  const experiment = readJson(path.join(experimentRoot, "experiment.json"));
  const errors = [];
  add(errors, experiment.schema === "outsider/stage05-r1-repeatability-experiment/v1",
    "EXPERIMENT_SCHEMA_INVALID");
  add(errors, verifyR1Record(experiment.preregistration, "preregistrationHash"),
    "PREREGISTRATION_HASH_INVALID");
  const schedule = experiment.design?.schedule ?? [];
  add(errors, experiment.design?.fixtureId === R1_FIXTURE_ID, "FIXTURE_NOT_R1_FROZEN");
  add(errors, schedule.length === R1_RUN_COUNT, `SCHEDULE_COUNT:${schedule.length}`);
  add(errors, experiment.design?.recoveryWindowMs >= R1_MIN_RECOVERY_WINDOW_MS,
    "RECOVERY_WINDOW_TOO_SHORT");
  add(errors, new Set(schedule.map((item) => item.label)).size === R1_RUN_COUNT,
    "SCHEDULE_LABELS_NOT_UNIQUE");
  add(errors, schedule.every((item) => item.fixtureId === R1_FIXTURE_ID),
    "SCHEDULE_FIXTURE_DRIFT");
  add(errors, experiment.preregistration?.protocol?.gate === "R1"
    && experiment.preregistration.protocol.host === "claude-code"
    && experiment.preregistration.protocol.runCount === R1_RUN_COUNT
    && experiment.preregistration.protocol.recoveryWindowMs === experiment.design?.recoveryWindowMs
    && JSON.stringify(experiment.preregistration.protocol.schedule) === JSON.stringify(schedule),
  "PREREGISTERED_PROTOCOL_MISMATCH");

  const artifactFile = path.join(experimentRoot,
    experiment.preregistration?.artifact?.path ?? "");
  add(errors, existsSync(artifactFile), "PACKAGED_ARTIFACT_MISSING");
  if (existsSync(artifactFile)) add(errors,
    r1FileDigest(artifactFile) === experiment.preregistration.artifact.sha256,
    "PACKAGED_ARTIFACT_DRIFT");
  const runtime = experiment.preregistration?.runtime;
  add(errors, /^sha256:[a-f0-9]{64}$/.test(String(runtime?.workerExecutableHash ?? ""))
    && runtime?.runtimeIdentityHash === r1Digest(Object.fromEntries(Object.entries(runtime)
      .filter(([key]) => key !== "runtimeIdentityHash"))), "RUNTIME_IDENTITY_INVALID");
  const evaluator = evaluatorStillMatches(experimentRoot,
    experiment.preregistration?.evaluator);
  add(errors, evaluator.ok, evaluator.error ?? "EVALUATOR_DRIFT");

  const rows = schedule.map((item) => {
    const rowErrors = [];
    const assessmentFile = path.join(experimentRoot, "results", `${item.label}.r1.json`);
    const canaryFile = path.join(experimentRoot, "results", `${item.label}.canary.json`);
    const attestationFile = path.join(experimentRoot, "attestations", `${item.label}.json`);
    if (![assessmentFile, canaryFile, attestationFile].every(existsSync)) {
      return { ...item, passed: false, outcomeClass: "infrastructure-failure",
        runId: null, cwd: null, errors: ["R1_RESULT_SET_INCOMPLETE"] };
    }
    let assessment;
    let canary;
    let attestation;
    try {
      assessment = readJson(assessmentFile);
      canary = readJson(canaryFile);
      attestation = readJson(attestationFile);
    } catch (error) {
      return { ...item, passed: false, outcomeClass: "infrastructure-failure",
        runId: null, cwd: null, errors: [`R1_RESULT_JSON_INVALID:${error.message}`] };
    }
    add(rowErrors, assessment.schema === "outsider/stage05-r1-run-assessment/v1",
      "ASSESSMENT_SCHEMA_INVALID");
    add(rowErrors, verifyR1Record(assessment, "assessmentHash"), "ASSESSMENT_HASH_INVALID");
    add(rowErrors, assessment.label === item.label, "ASSESSMENT_LABEL_MISMATCH");
    add(rowErrors, assessment.canaryResultHash === r1FileDigest(canaryFile),
      "CANARY_RESULT_HASH_MISMATCH");
    const preWorkerInfrastructureFailure = canary.phase === "before-worker" && !canary.runId;
    if (!preWorkerInfrastructureFailure) add(rowErrors,
      Array.isArray(assessment.errors) && assessment.errors.length === 0,
      `ASSESSMENT_REPORTED_ERRORS:${(assessment.errors ?? []).join(",")}`);
    const prereg = experiment.preregistration;
    const binding = canary.r1Binding;
    for (const [name, expected, actual] of [
      ["ARTIFACT", prereg.artifact?.sha256, binding?.artifactHash],
      ["EVALUATOR", prereg.evaluator?.sha256, binding?.evaluatorHash],
      ["FIXTURE", prereg.fixture?.definitionHash, binding?.fixtureHash],
      ["CONTRACT", prereg.operatorContractHash, binding?.contractHash],
      ["HIDDEN_ACCEPTANCE", prereg.hiddenAcceptanceHash, binding?.hiddenAcceptanceHash],
      ["CLAIM", prereg.canonicalCase?.claim?.claimHash, binding?.canonicalCase?.claimHash],
      ["WAY", prereg.canonicalCase?.way?.wayHash, binding?.canonicalCase?.wayHash],
      ["WORLD", prereg.canonicalCase?.world?.worldHash, binding?.canonicalCase?.worldHash],
    ]) add(rowErrors, Boolean(expected) && expected === actual, `${name}_HASH_MISMATCH`);
    add(rowErrors, binding?.label === item.label, "CANARY_LABEL_MISMATCH");
    add(rowErrors, binding?.schema === "outsider/stage05-r1-canary-binding/v1",
      "CANARY_R1_BINDING_SCHEMA_INVALID");
    add(rowErrors, canary.productArtifactHash === prereg.artifact?.sha256,
      "CANARY_PRODUCT_ARTIFACT_MISMATCH");
    add(rowErrors, canary.evaluationArtifactHash === prereg.evaluator?.sha256,
      "CANARY_EVALUATOR_ARTIFACT_MISMATCH");
    if (preWorkerInfrastructureFailure) {
      add(rowErrors, canary.fixtureId === R1_FIXTURE_ID, "CANARY_FIXTURE_MISMATCH");
      add(rowErrors, String(canary.error ?? "").startsWith("SEMANTIC_CONTROL_PREFLIGHT_FAILED:"),
        "PRE_WORKER_FAILURE_NOT_SEMANTIC_CONTROL_INFRASTRUCTURE");
      add(rowErrors, assessment.runId == null && assessment.runDirectory == null,
        "PRE_WORKER_FAILURE_CREATED_RUN_IDENTITY");
      return { ...item, runId: null, cwd: canary.cwd ?? null, passed: false,
        exact: false, proofComplete: false, falseGreen: false, unfinalized: false,
        conservativeStop: false, infrastructureFailure: true,
        outcomeClass: "infrastructure-failure-before-worker", manifestHash: null,
        evidenceRoot: null, interventionId: null, correctionAuthorityHash: null,
        supervisedExperienceHash: null, attestationHash: null, errors: rowErrors };
    }
    add(rowErrors, canary.fixture?.id === R1_FIXTURE_ID, "CANARY_FIXTURE_MISMATCH");
    add(rowErrors, canary.fixture?.definitionHash === prereg.fixture?.legacyDefinitionHash,
      "CANARY_FIXTURE_DEFINITION_MISMATCH");
    add(rowErrors, assessment.runId === canary.runId && Boolean(canary.runId),
      "RUN_ID_MISMATCH");
    add(rowErrors, path.resolve(assessment.cwd ?? "/") === path.resolve(canary.cwd ?? "/"),
      "WORKSPACE_MISMATCH");
    add(rowErrors, assessment.runDirectory === canary.runDirectory,
      "RUN_DIRECTORY_MISMATCH");

    let verified = null;
    let chain = { ok: false, errors: ["EVENTS_UNAVAILABLE"] };
    try {
      verified = verifyRunDirectory(assessment.runDirectory);
      add(rowErrors, verified?.ok === true, `CURRENT_MANIFEST_INVALID:${verified?.error ?? "unknown"}`);
      const events = readFileSync(path.join(assessment.runDirectory, "events.jsonl"), "utf8")
        .split(/\r?\n/).filter(Boolean).map(JSON.parse);
      chain = assessR1CausalChain(events);
      add(rowErrors, chain.ok, `CAUSAL_CHAIN_INVALID:${chain.errors.join(",")}`);
      add(rowErrors, assessment.causalChain?.interventionId === chain.interventionId,
        "CAUSAL_INTERVENTION_MISMATCH");
      add(rowErrors, assessment.causalChain?.correctionAuthorityHash
        === chain.correctionAuthorityHash, "CAUSAL_AUTHORITY_MISMATCH");
    } catch (error) {
      rowErrors.push(`CURRENT_EVIDENCE_READ_FAILED:${error.message}`);
    }
    const immediate = assessment.evidence?.immediate;
    const stable = assessment.evidence?.stable;
    add(rowErrors, immediate?.ok === true && stable?.ok === true,
      "MANIFEST_TWO_PHASE_VERIFY_FAILED");
    add(rowErrors, stable?.observedAfterMs >= R1_MIN_RECOVERY_WINDOW_MS,
      "RECOVERY_WINDOW_OBSERVATION_TOO_SHORT");
    add(rowErrors, immediate?.manifestHash && immediate.manifestHash === stable?.manifestHash,
      "MANIFEST_NOT_STABLE");
    add(rowErrors, immediate?.evidenceRoot && immediate.evidenceRoot === stable?.evidenceRoot,
      "EVIDENCE_ROOT_NOT_STABLE");
    if (verified?.ok) {
      add(rowErrors, verified.manifest.manifestHash === immediate?.manifestHash,
        "CURRENT_MANIFEST_HASH_MISMATCH");
      add(rowErrors, verified.manifest.rawLocalRoot.merkleRoot === immediate?.evidenceRoot,
        "CURRENT_EVIDENCE_ROOT_MISMATCH");
      add(rowErrors, verified.binding.claimRef?.mode === "EXACT_CLAIM"
        && verified.binding.claimRef.claimHash === prereg.canonicalCase?.claim?.claimHash,
      "CANONICAL_CLAIM_NOT_BOUND");
      add(rowErrors, verified.binding.wayRef?.mode === "EXACT_WAY_REFERENCE"
        && verified.binding.wayRef.wayHash === prereg.canonicalCase?.way?.wayHash,
      "CANONICAL_WAY_NOT_BOUND");
      add(rowErrors, verified.binding.worldRef?.mode === "EXACT_WORLD"
        && verified.binding.worldRef.worldHash === prereg.canonicalCase?.world?.worldHash,
      "CANONICAL_WORLD_NOT_BOUND");
    }

    const exact = assessment.truth?.immediate?.exact === true
      && assessment.truth?.immediate?.violatesContract === false
      && assessment.truth?.stable?.exact === true
      && assessment.truth?.stable?.violatesContract === false;
    const proofComplete = canary.proof?.complete === true
      && canary.finalized?.proofComplete === true && canary.complete === true;
    add(rowErrors, assessment.processExit?.code === 0 && assessment.processExit?.signal == null,
      "CANARY_PROCESS_EXIT_NOT_CLEAN");
    add(rowErrors, canary.initialTruth?.exact === true
      && canary.initialTruth?.violatesContract === false, "INITIAL_ARTIFACT_NOT_EXACT");
    add(rowErrors, canary.injection?.hashesMatch === true,
      "CONSTRUCTED_FAULT_NOT_INJECTED");
    add(rowErrors, canary.observed?.stopSemanticRed === true,
      "CONSTRUCTED_FALSE_GREEN_NOT_SEMANTIC_RED");
    add(rowErrors, canary.finalTruth?.exact === true
      && canary.finalTruth?.violatesContract === false, "CANARY_FINAL_TRUTH_NOT_EXACT");
    add(rowErrors, exact, "INDEPENDENT_TRUTH_NOT_EXACT");
    add(rowErrors, proofComplete, "PROOF_NOT_COMPLETE");
    add(rowErrors, canary.observed?.r1CausalChain?.ok === true,
      "CANARY_CAUSAL_CHAIN_NOT_COMPLETE");

    try {
      const experienceFile = path.join(assessment.runDirectory,
        "stage05-supervised-experience.json");
      const experience = readJson(experienceFile);
      const experienceVerified = verifyExperience(experience, { verified });
      add(rowErrors, experienceVerified?.ok === true, "SUPERVISED_EXPERIENCE_INVALID");
      add(rowErrors, experience.recordHash === assessment.supervisedExperience?.recordHash,
        "SUPERVISED_EXPERIENCE_HASH_MISMATCH");
      add(rowErrors, experience.terminal?.terminalClass === "SAFE_DELIVERY"
        && experience.terminal?.proofComplete === true
        && experience.terminal?.deliveryComplete === true
        && experience.terminal?.interventionRequired === true
        && experience.terminal?.interventionComplete === true,
      "SUPERVISED_EXPERIENCE_TERMINAL_NOT_CAUSAL_SAFE_DELIVERY");
      add(rowErrors, experience.learningLabels?.deliveryResolved === true
        && experience.learningLabels?.outsiderCausalContribution === true
        && experience.learningLabels?.eligibleForCorrectionEffectLearning === true
        && experience.learningLabels?.causalAttributionClass === "AUDITED_INTERVENTION_COMPLETE"
        && experience.causalChains?.some((item) => item.sealedComplete === true),
      "SUPERVISED_EXPERIENCE_NOT_TREATMENT_ELIGIBLE");
      const corpusFile = path.join(experimentRoot, "supervised-experience",
        `${String(experience.recordHash).replace(/^sha256:/, "")}.json`);
      add(rowErrors, existsSync(corpusFile)
        && r1FileDigest(corpusFile) === r1FileDigest(experienceFile),
      "SUPERVISED_EXPERIENCE_CORPUS_COPY_INVALID");
      const attestationVerified = verifyAttestation(attestation);
      add(rowErrors, attestationVerified?.ok === true, "PER_RUN_ATTESTATION_INVALID");
      add(rowErrors, attestation.attestationHash === assessment.attestation?.attestationHash,
        "PER_RUN_ATTESTATION_HASH_MISMATCH");
      add(rowErrors, attestation.nUnique === 1 && attestation.included?.[0]?.runId === canary.runId,
        "PER_RUN_ATTESTATION_RUN_MISSING");
      add(rowErrors, attestation.included?.[0]?.supervisedExperienceHash === experience.recordHash,
        "PER_RUN_ATTESTATION_EXPERIENCE_MISSING");
      add(rowErrors, attestation.outcomes?.SAFE_DELIVERY === 1
        && ["VERIFIED_DELIVERY_UNATTRIBUTED", "CONTROL_BOUNDARY_CONTAINMENT",
          "CONSERVATIVE_STOP", "UNFINALIZED"].every((name) => attestation.outcomes?.[name] === 0)
        && attestation.included?.[0]?.terminalClass === "SAFE_DELIVERY"
        && attestation.included?.[0]?.proofComplete === true
        && attestation.included?.[0]?.deliveryComplete === true
        && attestation.included?.[0]?.interventionRequired === true
        && attestation.included?.[0]?.interventionComplete === true,
      "PER_RUN_ATTESTATION_NOT_CAUSAL_SAFE_DELIVERY");
    } catch (error) {
      rowErrors.push(`SUPERVISED_OR_ATTESTATION_READ_FAILED:${error.message}`);
    }
    const falseGreen = proofComplete && !exact;
    const unfinalized = !canary.finalized || canary.finalized.type !== "run_finalized";
    const conservativeStop = !falseGreen && !proofComplete && !unfinalized;
    const passed = rowErrors.length === 0;
    return { ...item, runId: canary.runId ?? null, cwd: canary.cwd ?? null,
      passed, exact, proofComplete, falseGreen, unfinalized, conservativeStop,
      infrastructureFailure: false,
      outcomeClass: falseGreen ? "false-green" : passed ? "exact-causal-delivery"
        : conservativeStop ? "conservative-stop" : "invalid-evidence",
      manifestHash: immediate?.manifestHash ?? null,
      evidenceRoot: immediate?.evidenceRoot ?? null,
      interventionId: chain.interventionId ?? null,
      correctionAuthorityHash: chain.correctionAuthorityHash ?? null,
      supervisedExperienceHash: assessment.supervisedExperience?.recordHash ?? null,
      attestationHash: assessment.attestation?.attestationHash ?? null,
      errors: rowErrors };
  });

  const nonNullRunIds = rows.map((row) => row.runId).filter(Boolean);
  const nonNullCwds = rows.map((row) => row.cwd).filter(Boolean).map((cwd) => path.resolve(cwd));
  add(errors, nonNullRunIds.length === R1_RUN_COUNT
    && new Set(nonNullRunIds).size === R1_RUN_COUNT, "RUN_IDS_NOT_FRESH");
  add(errors, nonNullCwds.length === R1_RUN_COUNT
    && new Set(nonNullCwds).size === R1_RUN_COUNT, "WORKSPACES_NOT_FRESH");

  const aggregateFile = path.join(experimentRoot, "attestations", "aggregate.json");
  if (!existsSync(aggregateFile)) errors.push("AGGREGATE_ATTESTATION_MISSING");
  else {
    try {
      const aggregate = readJson(aggregateFile);
      const checked = verifyAttestation(aggregate);
      add(errors, checked?.ok === true, "AGGREGATE_ATTESTATION_INVALID");
      add(errors, aggregate.nUnique === R1_RUN_COUNT, "AGGREGATE_ATTESTATION_COUNT_INVALID");
      add(errors, aggregate.validityDomain?.claimMode === "EXACT_CLAIM"
        && aggregate.validityDomain?.worldMode === "EXACT_WORLD",
      "AGGREGATE_ATTESTATION_NOT_CANONICAL");
      const included = new Map((aggregate.included ?? []).map((item) => [item.runId, item]));
      for (const row of rows) {
        add(errors, included.get(row.runId)?.supervisedExperienceHash
          === row.supervisedExperienceHash, `AGGREGATE_ATTESTATION_RUN_MISSING:${row.label}`);
      }
    } catch (error) {
      errors.push(`AGGREGATE_ATTESTATION_READ_FAILED:${error.message}`);
    }
  }

  const summary = {
    scheduled: schedule.length,
    terminalProofComplete: rows.filter((row) => row.proofComplete).length,
    independentlyExact: rows.filter((row) => row.exact).length,
    falseGreen: rows.filter((row) => row.falseGreen).length,
    unfinalized: rows.filter((row) => row.unfinalized).length,
    conservativeStops: rows.filter((row) => row.conservativeStop).length,
    infrastructureFailures: rows.filter((row) => row.infrastructureFailure).length,
    supervisedExperiencePresent: rows.filter((row) => row.supervisedExperienceHash).length,
    perRunAttestationPresent: rows.filter((row) => row.attestationHash).length,
  };
  const ok = errors.length === 0 && rows.every((row) => row.passed)
    && summary.falseGreen === 0 && summary.unfinalized === 0
    && summary.conservativeStops === 0;
  return { schema: "outsider/stage05-r1-repeatability-tally/v1", ok,
    experiment: experimentRoot, preregistrationHash: experiment.preregistration?.preregistrationHash,
    summary, errors, rows,
    claimBoundary: "R1 repeatability for one deterministic missing-role-default fixture on Claude Code; no endurance or Agent Team claim" };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const report = tallyR1Repeatability(process.argv[2] ?? ".");
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ schema: "outsider/stage05-r1-repeatability-tally/v1",
      ok: false, errors: [String(error?.message ?? error)] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
