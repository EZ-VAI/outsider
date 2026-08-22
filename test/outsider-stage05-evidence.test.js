import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  appendFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { snapshotWorkspace, RunStore } from "../src/outsider-kernel-store.js";
import {
  createAttestationV2, createStage05ControlledWayBinding, finalizeStage05Evidence,
  verifyAttestationV2, verifyStage05RunDirectory, exportSupervisedExperienceV2, stage05Digest,
} from "../src/outsider-stage05-evidence.js";
import {
  loadSupervisedExperienceCorpus, verifySupervisedExperienceV2,
} from "../src/outsider-supervised-experience.js";
import { fitBehaviorModel } from "../src/outsider-experience.js";
import { experienceToFeedLine } from "../src/outsider-feed-adapter.js";
import { freezeContract } from "../src/outsider-work-contract.js";

function completedRun(ask = "PRIVATE_OPERATOR_SECRET: preserve the exact behavior",
  { terminal = "delivery", withIntervention = false, withCapacityLoss = false,
    withMultipleEffects = false, interventionPhase = "stop",
    withEvaluationInvalidation = false, withProjectionFailure = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-stage05-evidence-"));
  const cwd = path.join(root, "workspace");
  mkdirSync(cwd);
  writeFileSync(path.join(cwd, "value.js"), "export const value = 2;\n");
  const baseline = snapshotWorkspace(cwd);
  const contract = freezeContract({
    cwd,
    ask,
    acceptance: "node --test",
    semantic: {
      objective: "preserve exact behavior",
      successCriteria: ["tests pass"],
      architecturalConstraints: [], forbiddenShortcuts: [],
      scope: { in: ["value.js"], out: [] }, uncertainties: [],
    },
    semanticAudit: { passed: true, evidenceHash: "sha256:audit" },
    baselineEvidence: baseline,
  });
  const binding = createStage05ControlledWayBinding({
    contract, workerExecutable: "/private/worker", supervisorCommand: "private supervisor command",
  });
  const store = RunStore.create({
    cwd, contract, supervisorCommand: "private supervisor command",
    stateRoot: path.join(root, "runs"), binding,
  });
  store.writeJson("baseline.json", baseline);
  store.writeJson("private-evidence.json", { secret: "RAW_SECRET_MUST_NOT_BE_PUBLIC" });
  store.append("stage05_binding_frozen", { bindingHash: binding.bindingHash,
    createdBeforeWorker: true });
  store.append("contract_compiled", { objective: "preserve exact behavior" });
  store.append("contract_audited", { passed: true, evidenceHash: "sha256:audit" });
  store.append("contract_frozen", { ask: contract.ask, acceptance: contract.acceptance });
  store.append("worker_launch", { executable: "private" });
  if (withProjectionFailure) store.append("supervisor_failed", {
    interventionId: "projection-failure-intervention",
    error: "INVALID_CORRECTION_AUTHORITY_PROJECTION",
  });
  if (withEvaluationInvalidation) store.append("endurance_invalidation_detected", {
    code: "AGENT_TEAM_EXCLUSIVE_FILE_OWNERSHIP_VIOLATED",
    eventSeq: 5,
    productSafetyFailure: false,
    evaluationProtocolFailure: true,
  });
  if (terminal === "containment") {
    store.append("acceptance_finished", { phase: "stop", ran: true, passed: true, exit: 0 });
    store.append("outcome_verdict", { phase: "stop", passed: false,
      finalFingerprint: baseline.fingerprint });
    store.append("boundary_paused", { trigger: "semantic-outcome-red-at-stop" });
    store.writeJson("release-gate-result.json", { safelyBlocked: true, falseGreen: false });
    store.append("gate_containment_finalized", { contained: true,
      outcomeClass: "conservative-stop", artifactFingerprint: baseline.fingerprint });
    store.saveState({ status: "contained", proof: { complete: false } });
  } else if (terminal === "unattributed") {
    store.append("acceptance_finished", { phase: "final", ran: true, passed: true, exit: 0 });
    store.append("outcome_verdict", { phase: "stop", passed: true,
      finalFingerprint: baseline.fingerprint });
    store.append("run_finalized", { proofComplete: false, deliveryComplete: true,
      interventionRequired: true, interventionComplete: false,
      acceptancePassed: true, finalFingerprint: baseline.fingerprint,
      errors: ["no intervention has a complete causal chain"] });
    store.saveState({ status: "delivered-unattributed", proof: { complete: false,
      deliveryComplete: true, interventionRequired: true, interventionComplete: false } });
  } else {
    if (withIntervention) {
      const interventionId = "private-intervention-id";
      const correctionAuthorityHash = `sha256:${"a".repeat(64)}`;
      store.append("boundary_paused", { interventionId,
        trigger: "semantic-outcome-red-at-stop" });
      store.append("supervisor_verdict", { interventionId, onTrack: false, planSteps: 1,
        correctionAuthorityHash });
      store.append("correction_factual_audit", { interventionId, passed: true,
        correctionAuthorityHash });
      store.append("correction_emitted", { interventionId, source: "supervisor_plan",
        correctionAuthorityHash });
      store.append("correction_observed", { interventionId, correctionAuthorityHash });
      if (withMultipleEffects) store.append("effect_observed", { interventionId,
        correctionAuthorityHash, matchedExpectedAction: "edit:value.js",
        artifactFingerprint: baseline.fingerprint });
      const effect = store.append("effect_observed", { interventionId,
        correctionAuthorityHash, matchedExpectedAction: withMultipleEffects
          ? "runRef:frozenAcceptance" : "edit:value.js",
        artifactFingerprint: baseline.fingerprint });
      store.append("acceptance_finished", { interventionId, phase: interventionPhase, ran: true,
        passed: true, exit: 0, finalFingerprint: baseline.fingerprint });
      store.append("outcome_verdict", { interventionId, phase: interventionPhase, passed: true,
        finalFingerprint: baseline.fingerprint });
      store.append("intervention_resolved", { interventionId, correctionAuthorityHash,
        correctionObserved: true, effectObserved: true, causalEffectSeq: effect.seq,
        matchedExpectedAction: effect.matchedExpectedAction,
        finalFingerprint: baseline.fingerprint });
      store.append("controller_started", { generation: 1 });
      store.append("controller_recovered", { generation: 2 });
      store.append("semantic_patrol_due", { toolBoundaries: 8 });
      store.append("semantic_patrol_deferred_pending_correction_effect", {
        toolBoundaries: 8, interventionId,
      });
      store.append("supervisor_insufficiency_reclassified_as_advisory", {
        interventionId,
        basis: "controller-owned-semantic-gap-and-complete-actionable-verdict",
      });
      store.append("semantic_patrol_passed", { toolBoundaries: 8 });
      store.append("team_spawn_capability_observed", { status: "teammate_spawned",
        bindable: true });
      store.append("multi_agent_integration_verified", { taskId: "integration",
        agentId: "main" });
    }
    if (withCapacityLoss) {
      store.append("supervisor_clearance_auditor_failed", {
        failureKind: "process",
        failureCategory: "control-plane-capacity",
        retryable: true,
        timedOut: true,
      });
    }
    store.append("acceptance_finished", { phase: "final", ran: true, passed: true, exit: 0 });
    store.append("outcome_verdict", { phase: "stop", passed: true,
      finalFingerprint: baseline.fingerprint });
    store.append("run_finalized", { proofComplete: true, deliveryComplete: true,
      acceptancePassed: true, finalFingerprint: baseline.fingerprint, errors: [] });
    store.saveState({ status: "complete", proof: { complete: true,
      deliveryComplete: true, interventionRequired: withIntervention,
      interventionComplete: true } });
  }
  return { root, cwd, store, contract, binding };
}

test("Stage05 ingress binds before worker, seals an event hash chain and emits private/public evidence", () => {
  const fixture = completedRun();
  const artifacts = finalizeStage05Evidence({ directory: fixture.store.directory });
  assert.equal(artifacts.binding.createdBeforeWorker, true);
  assert.equal(artifacts.binding.claimRef.mode, "OBSERVATION_ONLY");
  assert.equal(artifacts.binding.wayRef.mode, "OBSERVATION_ONLY");
  assert.equal(artifacts.binding.worldRef.mode, "OBSERVATION_ONLY");
  assert.equal(artifacts.binding.authority.lane, "RESEARCH");
  assert.equal(artifacts.manifest.eventChain.cryptographic, true);
  assert.equal(artifacts.manifest.terminal.terminalClass, "SAFE_DELIVERY");
  assert.equal(artifacts.supervisedExperience.learningLabels.deliveryResolved, true);
  assert.equal(artifacts.supervisedExperience.learningLabels.outsiderCausalContribution, false);
  assert.equal(artifacts.supervisedExperience.learningLabels
    .eligibleForCorrectionEffectLearning, false);
  assert.equal(artifacts.supervisedExperience.learningLabels.causalAttributionClass,
    "DELIVERY_NO_INTERVENTION_REQUIRED");
  assert.equal(artifacts.projection.admission, "OBSERVATION_ONLY");
  assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, true);
  const publicBytes = ["stage05-evidence-manifest.json", "stage05-canonical-projection.json",
    "stage05-public-evidence.json"].map((name) =>
    readFileSync(path.join(fixture.store.directory, name), "utf8")).join("\n");
  assert.doesNotMatch(publicBytes, /RAW_SECRET_MUST_NOT_BE_PUBLIC|PRIVATE_OPERATOR_SECRET|private supervisor command/);
});

test("the evidence manifest is a permanent write barrier and finalization is idempotent", () => {
  const fixture = completedRun();
  const first = finalizeStage05Evidence({ directory: fixture.store.directory });
  const second = finalizeStage05Evidence({ directory: fixture.store.directory });
  assert.equal(second.manifest.manifestHash, first.manifest.manifestHash);
  assert.throws(() => fixture.store.append("controller_recovered", { generation: 2 }),
    /RUN_EVIDENCE_ALREADY_SEALED/);
  assert.throws(() => fixture.store.saveState({ controllerStatus: "running" }),
    /RUN_EVIDENCE_ALREADY_SEALED/);
  assert.throws(() => fixture.store.writeJson("controller-lease.json", { status: "active" }),
    /RUN_EVIDENCE_ALREADY_SEALED/);
  assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, true);
});

test("an older sealed run can backfill the derived Experience without reopening evidence", () => {
  const fixture = completedRun();
  const first = finalizeStage05Evidence({ directory: fixture.store.directory });
  const sidecar = path.join(fixture.store.directory, "stage05-supervised-experience.json");
  unlinkSync(sidecar);
  assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, true);
  const backfilled = finalizeStage05Evidence({ directory: fixture.store.directory });
  assert.equal(backfilled.supervisedExperience.recordHash,
    first.supervisedExperience.recordHash);
  assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, true);
});

test("every sealed run deterministically exports one hash-bound supervised Experience", () => {
  const fixture = completedRun("PRIVATE_OPERATOR_SECRET: supervised export",
    { withIntervention: true, withMultipleEffects: true, interventionPhase: "integration" });
  fixture.store.writeJson("endurance-preregistration.json", {
    schema: "outsider/stage05-endurance-preregistration/v1",
    evaluationMode: "NON_CERTIFYING_SMOKE",
    preregistrationHash: `sha256:${"b".repeat(64)}`,
  });
  fixture.store.writeJson("agent-team-probe-preregistration.json", {
    schema: "outsider/stage05-agent-team-probe/v1",
    exactTeamTaskCount: 3,
  });
  fixture.store.writeJson("endurance-witness.json", {
    schema: "outsider/stage05-endurance-witness/v1",
    passed: true,
    checkpoints: [
      { ordinal: 1, monotonicMs: 1000 },
      { ordinal: 2, monotonicMs: 61000 },
    ],
  });
  const evidence = finalizeStage05Evidence({ directory: fixture.store.directory });
  const recordFile = path.join(fixture.store.directory, "stage05-supervised-experience.json");
  const record = JSON.parse(readFileSync(recordFile, "utf8"));
  assert.equal(record.recordHash, evidence.supervisedExperience.recordHash);
  assert.equal(verifySupervisedExperienceV2(record, { verified: evidence }).ok, true);
  assert.equal(record.schema, "outsider/supervised-experience/v2");
  assert.equal(record.schemaVersion, "2.0.0");
  assert.equal(record.extractor.version, "2.1.0");
  assert.equal(record.source.manifestHash, evidence.manifest.manifestHash);
  assert.equal(record.source.observedAt,
    JSON.parse(readFileSync(path.join(fixture.store.directory, "events.jsonl"), "utf8")
      .trim().split("\n").at(-1)).at);
  assert.equal(record.source.eventChainHash, evidence.manifest.eventChain.chainHash);
  assert.equal(record.terminal.terminalClass, "SAFE_DELIVERY");
  assert.equal(record.modelInput.verified.resolved, true);
  assert.equal(record.learningLabels.deliveryResolved, true);
  assert.equal(record.learningLabels.outsiderCausalContribution, true);
  assert.equal(record.learningLabels.eligibleForCorrectionEffectLearning, true);
  assert.equal(record.learningLabels.causalAttributionClass, "AUDITED_INTERVENTION_COMPLETE");
  assert.equal(record.causalChains.length, 1);
  assert.equal(record.causalChains[0].ordered, true);
  assert.equal(record.causalChains[0].sealedComplete, true);
  const rawEffects = readFileSync(path.join(fixture.store.directory, "events.jsonl"), "utf8")
    .trim().split("\n").map(JSON.parse).filter((event) => event.type === "effect_observed");
  const selectedEffect = record.causalChains[0].events.find((event) =>
    event.type === "effect_observed");
  assert.equal(rawEffects.length, 2);
  assert.equal(selectedEffect.seq, rawEffects.at(-1).seq,
    "the exported chain must anchor the exact effect referenced by intervention_resolved");
  assert.match(record.causalChains[0].interventionHash, /^sha256:/);
  assert.ok(record.riskEvents.some((risk) => risk.riskClass === "CONTROL_BOUNDARY_PAUSED"));
  assert.ok(record.riskEvents.some((risk) => risk.riskClass === "CONTROLLER_RECOVERED"));
  assert.equal(record.riskEvidence.observedOnly, true);
  assert.equal(record.riskEvidence.establishesLossOrLiability, false);
  assert.equal(record.hostCapacity.controller.generations, 2);
  assert.equal(record.hostCapacity.controller.recoveries, 1);
  assert.equal(record.hostCapacity.agentTeamCapabilities.teammate_spawned, 1);
  assert.equal(record.hostCapacity.externalEnduranceWitness.checkpoints, 2);
  assert.equal(record.hostCapacity.externalEnduranceWitness.witnessedDurationMs, 60000);
  assert.equal(record.hostCapacity.observedOnly, true);
  assert.equal(record.hostCapacity.semanticPatrol.deferredPendingCorrectionEffect, 1);
  assert.equal(record.hostCapacity.semanticJudgment.insufficiencyReclassifiedAsAdvisory, 1);
  assert.deepEqual(record.evaluationContext.gatesObserved, ["R1", "R2", "R3", "R4", "R5"]);
  assert.equal(record.evaluationContext.gatePassClaimed, false);
  assert.doesNotMatch(readFileSync(recordFile, "utf8"),
    /PRIVATE_OPERATOR_SECRET|private-intervention-id|private supervisor command/);

  const attestation = createAttestationV2({ runDirectories: [fixture.store.directory] });
  assert.deepEqual(record.attestationCompatibility.groupKey, attestation.groupKey,
    "the per-run record groups on the exact same evidence domain as ATTEST v2");
  assert.equal(attestation.included[0].supervisedExperienceHash, record.recordHash,
    "ATTEST v2 commits the exact supervised record that enters the model corpus");
  assert.equal(experienceToFeedLine(record).ok, true,
    "verified Stage05 labels reach the existing training feed without trusting worker claims");
  assert.equal(fitBehaviorModel([record]).nRecords, 1);
  const corpusRoot = path.join(path.dirname(fixture.store.directory),
    ".supervised-experience-v2");
  assert.deepEqual(readdirSync(corpusRoot), [`${record.recordHash.slice(7)}.json`],
    "each sealed run also lands once in the local append-only supervised corpus");
  assert.equal(loadSupervisedExperienceCorpus(corpusRoot).records.length, 1);
  const repeated = exportSupervisedExperienceV2({ directory: fixture.store.directory });
  assert.equal(repeated.recordHash, record.recordHash);
  assert.equal(readdirSync(corpusRoot).length, 1);
});

test("conservative containment trains as unresolved safety evidence, never a delivery", () => {
  const fixture = completedRun("hold the false green", { terminal: "containment" });
  const evidence = finalizeStage05Evidence({ directory: fixture.store.directory });
  const record = evidence.supervisedExperience;
  assert.equal(record.terminal.terminalClass, "CONTROL_BOUNDARY_CONTAINMENT");
  assert.equal(record.modelInput.verified.resolved, false);
  assert.equal(record.learningLabels.deliveryResolved, false);
  assert.equal(record.learningLabels.outsiderCausalContribution, false);
  assert.equal(record.learningLabels.eligibleForCorrectionEffectLearning, false);
  assert.equal(record.learningLabels.causalAttributionClass, "NO_DELIVERY");
  assert.equal(record.modelInput.labels.gatedIrreversible, true);
  assert.ok(record.riskEvents.some((risk) =>
    risk.riskClass === "CONTROL_BOUNDARY_CONTAINMENT"));
});

test("a bounded control-plane outage becomes capacity-loss supervision, not a semantic error", () => {
  const fixture = completedRun("deliver after a transient control-plane outage",
    { withCapacityLoss: true });
  const evidence = finalizeStage05Evidence({ directory: fixture.store.directory });
  const record = evidence.supervisedExperience;
  const losses = record.riskEvents.filter((risk) =>
    risk.riskClass === "CONTROL_PLANE_CAPACITY_LOSS");
  assert.equal(losses.length, 1);
  assert.equal(record.hostCapacity.capacityExhaustions, 1);
  assert.equal(record.riskEvidence.observedOnly, true);
  assert.equal(record.riskEvidence.establishesLossOrLiability, false);
  assert.equal(record.learningLabels.deliveryResolved, true);
  assert.equal(record.learningLabels.outsiderCausalContribution, false);
});

test("evaluation fixture invalidation stays separate from product safety and loss labels", () => {
  const fixture = completedRun("preserve an invalidated R5 sample", {
    terminal: "containment",
    withEvaluationInvalidation: true,
    withProjectionFailure: true,
  });
  const record = finalizeStage05Evidence({ directory: fixture.store.directory })
    .supervisedExperience;
  assert.equal(record.evaluationValidity.invalidated, true);
  assert.equal(record.evaluationValidity.productSafetyFailuresObserved, 0);
  assert.equal(record.evaluationValidity.evaluationProtocolFailuresObserved, 1);
  assert.equal(record.evaluationValidity.stage05ActuationEvidenceFailuresObserved, 0);
  assert.equal(record.evaluationValidity.hostCapacityFailuresObserved, 0);
  assert.equal(record.evaluationValidity.establishesLossOrLiability, false);
  assert.deepEqual(record.evaluationValidity.invalidations.map((entry) => entry.code),
    ["AGENT_TEAM_EXCLUSIVE_FILE_OWNERSHIP_VIOLATED"]);
  assert.ok(record.riskEvents.some((risk) =>
    risk.riskClass === "EVALUATION_PROTOCOL_INVALIDATED"));
  assert.ok(record.riskEvents.some((risk) =>
    risk.riskClass === "CORRECTION_AUTHORITY_PROJECTION_REJECTED"));
  assert.equal(record.riskEvents.some((risk) =>
    risk.riskClass === "SUPERVISOR_UNAVAILABLE"), false);
  assert.equal(record.learningLabels.deliveryResolved, false);
  assert.equal(record.learningLabels.outsiderCausalContribution, false);
  assert.equal(verifySupervisedExperienceV2(record).ok, true);
});

test("supervised Experience hashes fail closed and cannot be replaced after export", () => {
  const fixture = completedRun();
  const evidence = finalizeStage05Evidence({ directory: fixture.store.directory });
  const file = path.join(fixture.store.directory, "stage05-supervised-experience.json");
  const forged = JSON.parse(readFileSync(file, "utf8"));
  forged.terminal.terminalClass = "CONSERVATIVE_STOP";
  assert.equal(verifySupervisedExperienceV2(forged, { verified: evidence }).ok, false);
  writeFileSync(file, JSON.stringify(forged));
  assert.throws(() => exportSupervisedExperienceV2({ directory: fixture.store.directory }),
    /EXISTING_ARTIFACT_CONFLICT/);
  assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, true,
    "the derived private record cannot mutate the already-sealed Stage05 evidence root");
});

test("evidence cannot seal while a controller lease is active", () => {
  const fixture = completedRun();
  fixture.store.writeJson("controller-lease.json", { status: "active", pid: process.pid });
  assert.throws(() => finalizeStage05Evidence({ directory: fixture.store.directory }),
    /STAGE05_CONTROLLER_LEASE_ACTIVE/);
});

test("gate containment is an attestable terminal class, never a delivery proof", () => {
  const fixture = completedRun("hold a known false green at Stop", { terminal: "containment" });
  const evidence = finalizeStage05Evidence({ directory: fixture.store.directory });
  assert.equal(evidence.manifest.terminal.terminalClass, "CONTROL_BOUNDARY_CONTAINMENT");
  assert.equal(evidence.manifest.terminal.proofComplete, false);
  assert.equal(evidence.manifest.terminal.containmentComplete, true);
  const attestation = createAttestationV2({ runDirectories: [fixture.store.directory] });
  assert.equal(attestation.evidenceClass, "CONTROL_BOUNDARY_CONTAINMENT");
  assert.equal(attestation.outcomes.CONTROL_BOUNDARY_CONTAINMENT, 1);
  assert.equal(attestation.outcomes.SAFE_DELIVERY, 0);
});

test("verified delivery without causal attribution is attestable but never counted SAFE", () => {
  const fixture = completedRun("deliver only what independent evidence proves",
    { terminal: "unattributed" });
  const evidence = finalizeStage05Evidence({ directory: fixture.store.directory });
  assert.equal(evidence.manifest.terminal.terminalClass, "VERIFIED_DELIVERY_UNATTRIBUTED");
  assert.equal(evidence.manifest.terminal.proofComplete, false);
  assert.equal(evidence.manifest.terminal.deliveryComplete, true);
  assert.equal(evidence.manifest.terminal.interventionRequired, true);
  assert.equal(evidence.manifest.terminal.interventionComplete, false);
  assert.equal(evidence.supervisedExperience.learningLabels.deliveryResolved, true);
  assert.equal(evidence.supervisedExperience.learningLabels.outsiderCausalContribution, false);
  assert.equal(evidence.supervisedExperience.learningLabels
    .eligibleForCorrectionEffectLearning, false);
  assert.equal(evidence.supervisedExperience.learningLabels.causalAttributionClass,
    "DELIVERY_UNATTRIBUTED");
  const attestation = createAttestationV2({ runDirectories: [fixture.store.directory] });
  assert.equal(attestation.outcomes.VERIFIED_DELIVERY_UNATTRIBUTED, 1);
  assert.equal(attestation.outcomes.SAFE_DELIVERY, 0);
  assert.equal(attestation.included[0].deliveryComplete, true);
  assert.equal(attestation.included[0].interventionComplete, false);
});

test("attached evidence says pre-action, not the false stronger claim pre-worker", () => {
  const fixture = completedRun("transparent attached task");
  const binding = createStage05ControlledWayBinding({
    contract: fixture.contract,
    workerExecutable: "host-owned-claude",
    supervisorCommand: "fresh supervisor",
    host: "claude-desktop",
    createdBeforeWorker: false,
  });
  assert.equal(binding.createdBeforeWorker, false);
  assert.equal(binding.createdBeforeFirstAction, true);
  assert.equal(binding.source.hostProtocol, "claude-desktop");
});

test("ATTEST v2 deduplicates copied run evidence and supports third-party Ed25519 verification", () => {
  const fixture = completedRun();
  finalizeStage05Evidence({ directory: fixture.store.directory });
  const { privateKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const attestation = createAttestationV2({
    runDirectories: [fixture.store.directory, fixture.store.directory], privateKeyPem,
  });
  assert.equal(attestation.nUnique, 1);
  assert.equal(attestation.duplicates.length, 1);
  assert.equal(attestation.outcomes.SAFE_DELIVERY, 1);
  assert.equal(attestation.validityDomain.generalizesBeyondIncludedEvidence, false);
  assert.equal(verifyAttestationV2(attestation).ok, true);
  assert.equal(verifyAttestationV2(attestation).signed, true);
  const forged = structuredClone(attestation);
  forged.outcomes.SAFE_DELIVERY = 99;
  assert.equal(verifyAttestationV2(forged).ok, false);
});

test("ATTEST v2 backfills legacy sealed projections without undefined terminal fields", () => {
  const fixture = completedRun("legacy sealed delivery");
  const evidence = finalizeStage05Evidence({ directory: fixture.store.directory });
  const projectionFile = path.join(fixture.store.directory, "stage05-canonical-projection.json");
  const projection = JSON.parse(readFileSync(projectionFile, "utf8"));
  delete projection.outcome.deliveryComplete;
  delete projection.outcome.interventionRequired;
  delete projection.outcome.interventionComplete;
  const { projectionHash: ignored, ...projectionBody } = projection;
  projection.projectionHash = stage05Digest(projectionBody);
  writeFileSync(projectionFile, JSON.stringify(projection, null, 2));
  unlinkSync(path.join(fixture.store.directory, "stage05-supervised-experience.json"));
  rmSync(path.join(path.dirname(fixture.store.directory), ".supervised-experience-v2"),
    { recursive: true, force: true });
  assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, true);
  const attestation = createAttestationV2({ runDirectories: [fixture.store.directory] });
  assert.equal(verifyAttestationV2(attestation).ok, true);
  assert.equal(attestation.included[0].deliveryComplete, true);
  assert.equal(attestation.included[0].interventionRequired, false);
  assert.equal(attestation.included[0].interventionComplete, false);
  assert.equal(attestation.included[0].manifestHash, evidence.manifest.manifestHash);
});

test("ATTEST v2 rejects runs from different claim/world evidence domains", () => {
  const first = completedRun("objective A");
  const second = completedRun("objective B");
  finalizeStage05Evidence({ directory: first.store.directory });
  finalizeStage05Evidence({ directory: second.store.directory });
  assert.throws(() => createAttestationV2({
    runDirectories: [first.store.directory, second.store.directory],
  }), /MIXED_EVIDENCE_DOMAIN/);
});

test("the unified CLI verifies runs and writes a verifiable unsigned attestation", () => {
  const fixture = completedRun();
  finalizeStage05Evidence({ directory: fixture.store.directory });
  const cli = path.resolve("bin/outsider.mjs");
  const verified = spawnSync(process.execPath, [cli, "verify", fixture.store.directory], {
    cwd: process.cwd(), encoding: "utf8",
  });
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).ok, true);
  const output = path.join(fixture.root, "attestation.json");
  const attested = spawnSync(process.execPath,
    [cli, "attest", fixture.store.directory, "--out", output], {
      cwd: process.cwd(), encoding: "utf8",
    });
  assert.equal(attested.status, 0, attested.stderr);
  const checked = spawnSync(process.execPath, [cli, "verify", output], {
    cwd: process.cwd(), encoding: "utf8",
  });
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).signed, false);
});

test("the unified CLI refuses unknown canonical schemas instead of misrouting them", () => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-unsupported-schema-"));
  const artifact = path.join(root, "canonical.json");
  writeFileSync(artifact, JSON.stringify({
    schema: "outsider/local-research/v1",
    schemaVersion: "1.2.0",
    artifactHash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  }));
  const checked = spawnSync(process.execPath,
    [path.resolve("bin/outsider.mjs"), "verify", artifact], {
      cwd: process.cwd(), encoding: "utf8",
    });
  assert.equal(checked.status, 1, checked.stderr);
  const result = JSON.parse(checked.stdout);
  assert.equal(result.ok, false);
  assert.equal(result.error, "UNSUPPORTED_SCHEMA");
  assert.equal(result.schema, "outsider/local-research/v1");
  assert.equal(result.verificationMode, "NO_VERIFIER_DISPATCHED");
  assert.equal(result.sourceArtifactsReverified, false);
  assert.doesNotMatch(JSON.stringify(result), /ATTESTATION_HASH_BROKEN/);
});

test("run evidence verification fails after raw evidence or the event chain is changed", () => {
  const fixture = completedRun();
  finalizeStage05Evidence({ directory: fixture.store.directory });
  appendFileSync(path.join(fixture.store.directory, "private-evidence.json"), "\n");
  assert.equal(verifyStage05RunDirectory(fixture.store.directory).ok, false);

  const second = completedRun();
  const eventFile = second.store.eventsPath;
  const lines = readFileSync(eventFile, "utf8").trim().split("\n");
  const event = JSON.parse(lines[2]);
  event.passed = false;
  lines[2] = JSON.stringify(event);
  writeFileSync(eventFile, `${lines.join("\n")}\n`);
  assert.throws(() => RunStore.open({
    directory: second.store.directory, supervisorCommand: "private supervisor command",
  }), /EVENT_HASH_CHAIN_BROKEN/);

  const third = completedRun();
  const bindingFile = path.join(third.store.directory, "stage05-binding.json");
  const binding = JSON.parse(readFileSync(bindingFile, "utf8"));
  binding.source.packageName = "forged-product";
  writeFileSync(bindingFile, JSON.stringify(binding));
  assert.throws(() => RunStore.open({
    directory: third.store.directory, supervisorCommand: "private supervisor command",
  }), /STAGE05_BINDING_BROKEN/);
});
