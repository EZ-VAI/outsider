import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  MEMORY_PROPOSAL_SCHEMA,
  MEMORY_RELEASE_SCHEMA,
  PHYSICAL_CAPABILITY_REFERENCE_SCHEMA,
  PHYSICAL_DELEGATION_ENVELOPE_SCHEMA,
  PRIMITIVE_ATTEMPT_SCHEMA,
  createMemoryProposal,
  createMemoryRelease,
  createPhysicalDelegationEnvelope,
  createPrimitiveAttempt,
  verifyMemoryProposal,
  verifyMemoryRelease,
  verifyPhysicalDelegationEnvelope,
  verifyPrimitiveAttempt,
} from "../src/outsider-physical-delegation.js";

const h = (letter) => `sha256:${letter.repeat(64)}`;
const memoryReleaseHash = (body) => `sha256:${createHash("sha256")
  .update("outsider:physical-memory-release:v1\0")
  .update(canonicalizeStrict(body)).digest("hex")}`;

function envelope(overrides = {}) {
  const input = {
    delegationId: "delegation-physical-0001",
    runId: "rollout-0001",
    issuedAt: "2026-08-24T00:00:00.000Z",
    validFrom: "2026-08-24T00:01:00.000Z",
    validUntil: "2026-08-24T01:00:00.000Z",
    authorityReleaseHash: h("a"),
    capabilityReferences: [{
      schema: PHYSICAL_CAPABILITY_REFERENCE_SCHEMA,
      primitiveId: "vla_act",
      registryHash: h("b"),
      capabilityId: "outsider.physical.vla-act/v1",
      implementationHash: h("c"),
      embodimentId: "robot-arm-a",
      embodimentHash: h("d"),
      controllerId: "controller-a",
      controllerVersion: "1.2.3",
      controllerImplementationHash: h("e"),
      checkpointId: "frozen-vla-a",
      checkpointHash: h("f"),
      observationSchemaId: "outsider.rgbd-observation/v1",
      observationSchemaHash: h("1"),
      calibrationId: "calibration-a",
      calibrationHash: h("2"),
      calibrationValidFrom: "2026-08-24T00:00:00.000Z",
      calibrationValidUntil: "2026-08-24T00:20:00.000Z",
      coordinateFrameId: "robot-base-frame",
    }],
    workspaceEnvelope: {
      workspaceMapHash: h("3"),
      coordinateFrameId: "robot-base-frame",
      allowedRegionIds: ["bench-safe-zone"],
      forbiddenRegionIds: ["human-zone"],
    },
    actionEnvelope: {
      allowedPrimitiveIds: ["vla_act"],
      prohibitedPrimitiveIds: [],
      maxLinearSpeedMps: 0.1,
      maxAngularSpeedRadS: 0.2,
      maxRequestedContactForceN: 5,
      maxPrimitiveDurationMs: 10_000,
      maxObservationAgeMs: 2_000,
    },
    riskEnvelope: {
      maxPerAttemptRiskUnits: 3,
      maxCumulativeRiskUnits: 5,
      maxObservedContactForceN: 10,
      maxPerAttemptEnergyJ: 2,
      maxCumulativeEnergyJ: 3,
      maxConsecutiveFailures: 3,
    },
    retryEnvelope: {
      maxAttemptsPerPrimitive: 2,
      maxRetriesTotal: 1,
      resetAllowed: false,
    },
    judgeBindings: {
      judgeDefinitionSetHash: h("b"),
      primitiveStopJudgeDefinitionHash: h("4"),
      localPostconditionJudgeDefinitionHash: h("5"),
      taskOutcomeJudgeDefinitionHash: h("6"),
      safetyOutcomeJudgeDefinitionHash: h("7"),
    },
    memoryPolicy: {
      independentApprovalRequired: true,
      coordinatePolicy: "RELOCALIZE_FROM_CURRENT_OBSERVATION",
      maxMemoryAgeMs: 86_400_000,
      mayGrantCapabilities: false,
      mayExpandWorkspace: false,
      mayIncreaseActionLimits: false,
      mayIncreaseRiskBudget: false,
      mayIncreaseRetryBudget: false,
    },
    ...overrides,
  };
  return createPhysicalDelegationEnvelope(input);
}

function attemptInput(env, {
  attemptId = "attempt-0001",
  primitiveId = "vla_act",
  commandedAt = "2026-08-24T00:05:00.000Z",
  observationAt = "2026-08-24T00:04:59.500Z",
  startedAt = commandedAt,
  stoppedAt = "2026-08-24T00:05:02.000Z",
  judgedAt = stoppedAt,
  coordinateSource = "CURRENT_OBSERVATION",
  coordinateObservationHash = h("8"),
  localState = "SATISFIED",
  taskState = "SUCCEEDED",
  safetyState = "SAFE",
  stopState = "STOPPED",
  riskUnits = 1,
  peakContactForceN = 2,
  energyJ = 0.5,
  retryOfAttemptHash = null,
  memoryReleaseHash = null,
} = {}) {
  const evidence = (state, letter) => state === "UNKNOWN" ? null : h(letter);
  return {
    attemptId,
    primitiveId,
    commandedAt,
    observation: {
      evidenceHash: h("8"),
      capturedAt: observationAt,
      observationSchemaHash: env.capabilityReferences[0].observationSchemaHash,
      calibrationHash: env.capabilityReferences[0].calibrationHash,
      coordinateFrameId: "robot-base-frame",
    },
    command: {
      commandHash: h("9"),
      targetRegionId: "bench-safe-zone",
      coordinateSource,
      coordinateObservationHash,
      requestedLinearSpeedMps: 0.05,
      requestedAngularSpeedRadS: 0.1,
      requestedContactForceN: 2,
      requestedEnergyJ: 0.5,
      requestedDurationMs: 5_000,
    },
    execution: {
      startedAt,
      stoppedAt,
      receiptHash: h("0"),
      primitiveStop: {
        state: stopState,
        judgeDefinitionHash: env.judgeBindings.primitiveStopJudgeDefinitionHash,
        judgeManifestHash: h("3"),
        evidenceHash: evidence(stopState, "a"),
        observedAt: judgedAt,
      },
    },
    localPostcondition: {
      state: localState,
      judgeDefinitionHash: env.judgeBindings.localPostconditionJudgeDefinitionHash,
      judgeManifestHash: h("4"),
      evidenceHash: evidence(localState, "b"),
      observedAt: judgedAt,
    },
    taskOutcome: {
      state: taskState,
      judgeDefinitionHash: env.judgeBindings.taskOutcomeJudgeDefinitionHash,
      judgeManifestHash: h("5"),
      evidenceHash: evidence(taskState, "c"),
      observedAt: judgedAt,
    },
    safetyOutcome: {
      state: safetyState,
      judgeDefinitionHash: env.judgeBindings.safetyOutcomeJudgeDefinitionHash,
      judgeManifestHash: h("6"),
      evidenceHash: evidence(safetyState, "d"),
      observedAt: judgedAt,
    },
    risk: { riskUnits, peakContactForceN, energyJ },
    retryOfAttemptHash,
    memoryReleaseHash,
  };
}

test("the closed envelope binds the complete physical capability and all action boundaries", () => {
  const artifact = envelope();
  assert.equal(artifact.schema, PHYSICAL_DELEGATION_ENVELOPE_SCHEMA);
  assert.equal(Object.isFrozen(artifact), true);
  assert.equal(Object.isFrozen(artifact.capabilityReferences[0]), true);
  assert.equal(artifact.capabilityReferences[0].registryHash, h("b"));
  assert.equal(artifact.capabilityReferences[0].implementationHash, h("c"));
  assert.equal(artifact.capabilityReferences[0].embodimentHash, h("d"));
  assert.equal(artifact.capabilityReferences[0].controllerImplementationHash, h("e"));
  assert.equal(artifact.capabilityReferences[0].checkpointHash, h("f"));
  assert.equal(artifact.capabilityReferences[0].observationSchemaHash, h("1"));
  assert.equal(artifact.capabilityReferences[0].calibrationHash, h("2"));
  assert.equal(verifyPhysicalDelegationEnvelope(artifact, {
    expectedEnvelopeHash: artifact.envelopeHash,
  }).ok, true);

  assert.throws(() => createPhysicalDelegationEnvelope({
    ...structuredClone(artifact), envelopeHash: undefined, hiddenPermission: true,
  }), /UNKNOWN_FIELDS/, "closed constructors reject fields that would escape the commitment");
});

test("attempt evidence separates stop, local, task and safety outcomes and detects tamper", () => {
  const env = envelope();
  const artifact = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env) });
  assert.equal(artifact.schema, PRIMITIVE_ATTEMPT_SCHEMA);
  assert.equal(artifact.execution.primitiveStop.state, "STOPPED");
  assert.equal(artifact.localPostcondition.state, "SATISFIED");
  assert.equal(artifact.taskOutcome.state, "SUCCEEDED");
  assert.equal(artifact.safetyOutcome.state, "SAFE");
  assert.equal(artifact.resultDisposition,
    "STRUCTURAL_SAFE_SUCCESS_UNVERIFIED_AUTHORITY");
  const verified = verifyPrimitiveAttempt(artifact, {
    envelope: env, expectedAttemptHash: artifact.attemptHash,
  });
  assert.equal(verified.structurallyWithinEnvelope, true);
  assert.equal(verified.authorizationEstablished, false);
  assert.equal(artifact.lineage.lineageCompleteOnlyRelativeToSuppliedPrefix, true);

  const tampered = structuredClone(artifact);
  tampered.command.commandHash = h("e");
  const checked = verifyPrimitiveAttempt(tampered, { envelope: env });
  assert.equal(checked.ok, false);
  assert.match(checked.errors.join(";"), /not canonical|hash changed/);

  const falseCompletion = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env, { localState: "NOT_SATISFIED" }) });
  assert.equal(falseCompletion.resultDisposition, "BLOCKED");
  assert.ok(falseCompletion.envelopeConformance.reasonCodes
    .includes("FALSE_COMPLETION_OUTCOME_CONTRADICTION"));
});

test("stale calibration, stale observations and replayed coordinates fail closed", () => {
  const env = envelope();
  const staleCalibration = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env, {
      commandedAt: "2026-08-24T00:30:00.000Z",
      observationAt: "2026-08-24T00:29:59.500Z",
      stoppedAt: "2026-08-24T00:30:02.000Z",
      judgedAt: "2026-08-24T00:30:02.000Z",
    }) });
  let checked = verifyPrimitiveAttempt(staleCalibration, { envelope: env });
  assert.equal(checked.ok, true, checked.errors.join("; "));
  assert.equal(checked.structurallyWithinEnvelope, false);
  assert.equal(checked.authorizationEstablished, false);
  assert.ok(checked.reasonCodes.includes("CALIBRATION_STALE_OR_NOT_YET_VALID"));

  const staleObservation = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env, { observationAt: "2026-08-24T00:04:00.000Z" }) });
  checked = verifyPrimitiveAttempt(staleObservation, { envelope: env });
  assert.equal(checked.structurallyWithinEnvelope, false);
  assert.ok(checked.reasonCodes.includes("OBSERVATION_STALE_OR_FROM_FUTURE"));

  const coordinateReplay = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env, {
      coordinateSource: "MEMORY_REPLAY",
      coordinateObservationHash: h("f"),
    }) });
  checked = verifyPrimitiveAttempt(coordinateReplay, { envelope: env });
  assert.equal(checked.structurallyWithinEnvelope, false);
  assert.ok(checked.reasonCodes.includes("MEMORY_COORDINATE_REPLAY_FORBIDDEN"));
});

test("late execution, late judge observations and actual duration overrun fail closed", () => {
  const env = envelope();
  const late = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env, {
      attemptId: "late-execution",
      commandedAt: "2026-08-24T00:19:59.000Z",
      observationAt: "2026-08-24T00:19:58.500Z",
      startedAt: "2026-08-24T00:19:59.000Z",
      stoppedAt: "2026-08-24T00:20:00.500Z",
      judgedAt: "2026-08-24T00:20:00.500Z",
    }) });
  let checked = verifyPrimitiveAttempt(late, { envelope: env });
  assert.equal(checked.ok, true, checked.errors.join("; "));
  assert.equal(checked.structurallyWithinEnvelope, false);
  assert.ok(checked.reasonCodes.includes("EXECUTION_OUTSIDE_CALIBRATION_WINDOW"));
  assert.ok(checked.reasonCodes.includes("JUDGE_OBSERVATION_OUTSIDE_CALIBRATION_WINDOW"));

  const durationOverrun = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env, {
      attemptId: "duration-overrun",
      stoppedAt: "2026-08-24T00:05:11.000Z",
      judgedAt: "2026-08-24T00:05:11.000Z",
    }) });
  checked = verifyPrimitiveAttempt(durationOverrun, { envelope: env });
  assert.equal(checked.ok, true, checked.errors.join("; "));
  assert.equal(checked.structurallyWithinEnvelope, false);
  assert.ok(checked.reasonCodes.includes("ACTUAL_PRIMITIVE_DURATION_LIMIT_EXCEEDED"));
});

test("a supplied attempt prefix is never promoted into complete-lineage authority", () => {
  const env = envelope();
  const first = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env, { attemptId: "prefix-attempt-1",
      localState: "NOT_SATISFIED", taskState: "FAILED" }) });
  const second = createPrimitiveAttempt({ envelope: env, priorAttempts: [first],
    ...attemptInput(env, { attemptId: "prefix-attempt-2",
      commandedAt: "2026-08-24T00:06:00.000Z",
      observationAt: "2026-08-24T00:05:59.500Z",
      startedAt: "2026-08-24T00:06:00.000Z",
      stoppedAt: "2026-08-24T00:06:02.000Z",
      judgedAt: "2026-08-24T00:06:02.000Z",
      retryOfAttemptHash: first.attemptHash }) });

  const completeOnlyForSuppliedPrefix = verifyPrimitiveAttempt(second, {
    envelope: env, priorAttempts: [first],
  });
  assert.equal(completeOnlyForSuppliedPrefix.structurallyWithinEnvelope, true);
  assert.equal(completeOnlyForSuppliedPrefix.authorizationEstablished, false);
  assert.equal(completeOnlyForSuppliedPrefix
    .lineageCompleteOnlyRelativeToSuppliedPrefix, true);
  assert.equal("authorized" in completeOnlyForSuppliedPrefix, false);

  const omittedPrefix = verifyPrimitiveAttempt(second, { envelope: env });
  assert.equal(omittedPrefix.ok, false);
  assert.equal(omittedPrefix.authorizationEstablished, false);
  assert.match(omittedPrefix.errors.join(";"),
    /RETRY_TARGET_INVALID|lineage changed|hash changed/);
});

test("caller-minted authority, registry, judge and memory hashes never establish authority", () => {
  const env = envelope();
  const envelopeCheck = verifyPhysicalDelegationEnvelope(env, {
    expectedEnvelopeHash: env.envelopeHash,
  });
  assert.equal(envelopeCheck.structurallyValid, true);
  assert.equal(envelopeCheck.authorizationEstablished, false);

  const artifact = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env, { memoryReleaseHash: h("f") }) });
  const checked = verifyPrimitiveAttempt(artifact, { envelope: env });
  assert.equal(checked.structurallyWithinEnvelope, true);
  assert.equal(checked.authorizationEstablished, false);
  assert.equal(artifact.resultDisposition,
    "STRUCTURAL_SAFE_SUCCESS_UNVERIFIED_AUTHORITY");
  assert.deepEqual(artifact.memoryReleaseAuthority, {
    status: "CLAIM_ONLY_UNVERIFIED",
    executionAuthorityEstablished: false,
  });
  assert.equal(checked.memoryReleaseAuthorityEstablished, false);
  assert.equal(checked.memoryReleaseReferenceStatus, "CLAIM_ONLY_UNVERIFIED");
});

test("RESET is canonicalized and blocked when the frozen retry envelope forbids it", () => {
  const base = envelope();
  const { schema: _schema, envelopeHash: _hash, ...input } = structuredClone(base);
  input.capabilityReferences[0].primitiveId = "RESET";
  input.capabilityReferences[0].capabilityId = "outsider.physical.reset/v1";
  input.actionEnvelope.allowedPrimitiveIds = ["ReSeT"];
  const env = createPhysicalDelegationEnvelope(input);
  assert.equal(env.capabilityReferences[0].primitiveId, "reset");
  assert.deepEqual(env.actionEnvelope.allowedPrimitiveIds, ["reset"]);

  const artifact = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env, { primitiveId: "RESET" }) });
  const checked = verifyPrimitiveAttempt(artifact, { envelope: env });
  assert.equal(checked.ok, true, checked.errors.join("; "));
  assert.equal(checked.structurallyWithinEnvelope, false);
  assert.ok(checked.reasonCodes.includes("RESET_NOT_ALLOWED"));
});

test("risk and retry violations remain auditable artifacts but cannot remain authorized", () => {
  const env = envelope();
  const riskExceeded = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env, { riskUnits: 4, energyJ: 2.5 }) });
  let checked = verifyPrimitiveAttempt(riskExceeded, { envelope: env });
  assert.equal(checked.ok, true, checked.errors.join("; "));
  assert.equal(checked.structurallyWithinEnvelope, false);
  assert.ok(checked.reasonCodes.includes("PER_ATTEMPT_RISK_BUDGET_EXCEEDED"));
  assert.ok(checked.reasonCodes.includes("PER_ATTEMPT_ENERGY_BUDGET_EXCEEDED"));

  const first = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env, { attemptId: "attempt-retry-1", localState: "NOT_SATISFIED",
      taskState: "FAILED" }) });
  const second = createPrimitiveAttempt({ envelope: env, priorAttempts: [first],
    ...attemptInput(env, { attemptId: "attempt-retry-2",
      commandedAt: "2026-08-24T00:06:00.000Z",
      observationAt: "2026-08-24T00:05:59.500Z",
      startedAt: "2026-08-24T00:06:00.000Z",
      stoppedAt: "2026-08-24T00:06:02.000Z",
      judgedAt: "2026-08-24T00:06:02.000Z",
      localState: "NOT_SATISFIED", taskState: "FAILED",
      retryOfAttemptHash: first.attemptHash }) });
  checked = verifyPrimitiveAttempt(second, { envelope: env, priorAttempts: [first] });
  assert.equal(checked.ok, true, checked.errors.join("; "));
  assert.equal(second.lineage.retryIndex, 1);
  assert.equal(checked.structurallyWithinEnvelope, true);
  assert.equal(checked.authorizationEstablished, false);

  const third = createPrimitiveAttempt({ envelope: env, priorAttempts: [first, second],
    ...attemptInput(env, { attemptId: "attempt-retry-3",
      commandedAt: "2026-08-24T00:07:00.000Z",
      observationAt: "2026-08-24T00:06:59.500Z",
      startedAt: "2026-08-24T00:07:00.000Z",
      stoppedAt: "2026-08-24T00:07:02.000Z",
      judgedAt: "2026-08-24T00:07:02.000Z",
      localState: "NOT_SATISFIED", taskState: "FAILED",
      retryOfAttemptHash: second.attemptHash }) });
  checked = verifyPrimitiveAttempt(third, {
    envelope: env, priorAttempts: [first, second],
  });
  assert.equal(checked.ok, true, checked.errors.join("; "));
  assert.equal(checked.structurallyWithinEnvelope, false);
  assert.ok(checked.reasonCodes.includes("MAX_ATTEMPTS_PER_PRIMITIVE_EXCEEDED"));
  assert.ok(checked.reasonCodes.includes("TOTAL_RETRY_BUDGET_EXCEEDED"));
});

function memoryFixture() {
  const env = envelope();
  const positive = createPrimitiveAttempt({ envelope: env,
    ...attemptInput(env, { attemptId: "positive-attempt" }) });
  const negative = createPrimitiveAttempt({ envelope: env, priorAttempts: [positive],
    ...attemptInput(env, { attemptId: "negative-attempt",
      commandedAt: "2026-08-24T00:06:00.000Z",
      observationAt: "2026-08-24T00:05:59.500Z",
      startedAt: "2026-08-24T00:06:00.000Z",
      stoppedAt: "2026-08-24T00:06:02.000Z",
      judgedAt: "2026-08-24T00:06:02.000Z",
      localState: "NOT_SATISFIED", taskState: "FAILED",
      retryOfAttemptHash: positive.attemptHash }) });
  const attempts = [positive, negative];
  const proposalInput = {
    proposalId: "memory-proposal-1",
    proposedBy: "planner-a",
    proposedAt: "2026-08-24T00:10:00.000Z",
    content: {
      taskClassId: "rich-contact-grasp",
      applicablePrimitiveIds: ["vla_act"],
      applicableRegionIds: ["bench-safe-zone"],
      preconditionIds: ["object-localized", "gripper-open"],
      recoveryPrimitiveIds: ["vla_act"],
      maxRiskUnitsPerAttempt: 2,
      maxRetriesPerPrimitive: 1,
      coordinatePolicy: "RELOCALIZE_FROM_CURRENT_OBSERVATION",
      strategyCommitment: h("e"),
    },
    positiveProvenance: [{ attemptId: positive.attemptId, attemptHash: positive.attemptHash }],
    negativeProvenance: [{ attemptId: negative.attemptId, attemptHash: negative.attemptHash }],
  };
  return { env, attempts, positive, negative, proposalInput };
}

test("memory requires positive and negative attempt provenance and cannot increase authority", () => {
  const { env, attempts, proposalInput } = memoryFixture();
  const proposal = createMemoryProposal({ envelope: env, attempts, ...proposalInput });
  assert.equal(proposal.schema, MEMORY_PROPOSAL_SCHEMA);
  assert.equal(proposal.authorityBoundary.executionAuthority, "NONE_ADVISORY_ONLY");
  assert.equal(proposal.authorityBoundary.mayGrantCapabilities, false);
  assert.equal(verifyMemoryProposal(proposal, {
    envelope: env, attempts, expectedProposalHash: proposal.proposalHash,
  }).ok, true);

  assert.throws(() => createMemoryProposal({
    envelope: env,
    attempts,
    ...proposalInput,
    content: { ...proposalInput.content, applicableRegionIds: ["human-zone"] },
  }), /cannot expand the workspace envelope/);
  assert.throws(() => createMemoryProposal({
    envelope: env,
    attempts,
    ...proposalInput,
    content: { ...proposalInput.content, applicablePrimitiveIds: ["unregistered_release"] },
  }), /cannot grant capabilities/);
  assert.throws(() => createMemoryProposal({
    envelope: env,
    attempts,
    ...proposalInput,
    content: { ...proposalInput.content, maxRiskUnitsPerAttempt: 4 },
  }), /cannot increase the risk budget/);
  assert.throws(() => createMemoryProposal({
    envelope: env,
    attempts,
    ...proposalInput,
    negativeProvenance: [],
  }), /NEGATIVE_PROVENANCE_REQUIRED/);

  const tamperedAttempts = structuredClone(attempts);
  tamperedAttempts[1].taskOutcome.state = "SUCCEEDED";
  assert.throws(() => createMemoryProposal({
    envelope: env, attempts: tamperedAttempts, ...proposalInput,
  }), /MEMORY_ATTEMPT_INVALID/,
  "provenance cannot promote a mutated attempt whose old hash is retained");
});

test("a caller-declared memory approval never establishes external authority", () => {
  const { env, attempts, proposalInput } = memoryFixture();
  const proposal = createMemoryProposal({ envelope: env, attempts, ...proposalInput });
  const policyHash = h("f");
  const approvalEvidenceHash = h("0");
  const approval = {
    approvedBy: "safety-reviewer-a",
    approverRole: "INDEPENDENT_MEMORY_APPROVER",
    authority: "EXTERNAL_PREAUTHORIZED_APPROVER",
    approvalPolicyHash: policyHash,
    approvalEvidenceHash,
    approvedProposalHash: proposal.proposalHash,
    decision: "APPROVED",
    approvedAt: "2026-08-24T00:20:00.000Z",
  };
  const release = createMemoryRelease({
    proposal, envelope: env, attempts, releaseId: "memory-release-1", approval,
  }, {
    trustedApproverIds: ["safety-reviewer-a"],
    expectedApprovalPolicyHash: policyHash,
    expectedApprovalEvidenceHash: approvalEvidenceHash,
  });
  assert.equal(release.schema, MEMORY_RELEASE_SCHEMA);
  assert.equal(release.authorityBoundary.executionAuthority, "NONE_ADVISORY_ONLY");
  assert.equal(release.approval.approverRole, "INDEPENDENT_MEMORY_APPROVER");
  assert.equal(release.approval.authority, "EXTERNAL_PREAUTHORIZED_APPROVER");
  assert.equal(release.approvalAuthority.approverRoleClaimed,
    "INDEPENDENT_MEMORY_APPROVER");
  assert.equal(release.approvalAuthority.authorityClaimed,
    "EXTERNAL_PREAUTHORIZED_APPROVER");
  assert.equal(release.approvalAuthority.decisionClaimRecorded, true);
  assert.equal(release.approvalAuthority.approvalAuthorityEstablished, false);
  assert.equal(release.approvalAuthority.operatorIndependenceEstablished, false);
  assert.equal(release.approvalAuthority.externalPreauthorizationEstablished, false);
  assert.equal(release.approvalAuthority.authorityUpgradeRequirement,
    "MAINTAINER_PINNED_EXTERNAL_REGISTRY_AND_SIGNED_FULL_REPLAY_NOT_IMPLEMENTED");
  const verified = verifyMemoryRelease(release, {
    proposal,
    envelope: env,
    attempts,
    trustedApproverIds: ["safety-reviewer-a"],
    expectedApprovalPolicyHash: policyHash,
    expectedApprovalEvidenceHash: approvalEvidenceHash,
    expectedReleaseHash: release.releaseHash,
    atTime: "2026-08-24T00:30:00.000Z",
  });
  assert.equal(verified.ok, true, verified.errors.join("; "));
  assert.equal(verified.structurallyValidCallerDeclaration, true);
  assert.equal(verified.approvalDecisionClaimed, "APPROVED");
  assert.equal(verified.approvalDecisionRecordedAsCallerClaim, true);
  assert.equal(verified.approverRoleClaimed, "INDEPENDENT_MEMORY_APPROVER");
  assert.equal(verified.approvalAuthorityClaimed, "EXTERNAL_PREAUTHORIZED_APPROVER");
  assert.equal(verified.approvalAuthorityEstablished, false);
  assert.equal(verified.operatorIndependenceEstablished, false);
  assert.equal(verified.externalPreauthorizationEstablished, false);

  assert.throws(() => createMemoryRelease({
    proposal,
    envelope: env,
    attempts,
    releaseId: "memory-release-self-approved",
    approval: { ...approval, approvedBy: proposal.proposedBy },
  }, {
    trustedApproverIds: [proposal.proposedBy],
    expectedApprovalPolicyHash: policyHash,
    expectedApprovalEvidenceHash: approvalEvidenceHash,
  }), /APPROVAL_DECLARATION_INCONSISTENT/);
  assert.throws(() => createMemoryRelease({
    proposal,
    envelope: env,
    attempts,
    releaseId: "memory-release-unpinned-approval",
    approval,
  }, {
    trustedApproverIds: ["safety-reviewer-a"],
    expectedApprovalPolicyHash: policyHash,
    expectedApprovalEvidenceHash: h("1"),
  }), /APPROVAL_DECLARATION_INCONSISTENT/,
  "caller-provided expected hashes are consistency inputs, not external authority");

  const selfSealed = structuredClone(release);
  selfSealed.approval.approvedBy = proposal.proposedBy;
  selfSealed.approvalAuthority.approvedByClaimed = proposal.proposedBy;
  const { releaseHash: ignoredSelfHash, ...selfSealedBody } = selfSealed;
  selfSealed.releaseHash = memoryReleaseHash(selfSealedBody);
  const selfSealedCheck = verifyMemoryRelease(selfSealed, {
    proposal,
    envelope: env,
    attempts,
    trustedApproverIds: [proposal.proposedBy],
    expectedApprovalPolicyHash: policyHash,
    expectedApprovalEvidenceHash: approvalEvidenceHash,
    expectedReleaseHash: selfSealed.releaseHash,
  });
  assert.equal(selfSealedCheck.ok, false,
    "a self-listed approver remains invalid after recomputing the release hash");
  assert.match(selfSealedCheck.errors.join(";"), /APPROVAL_DECLARATION_INCONSISTENT/);
  assert.equal(selfSealedCheck.approvalAuthorityEstablished, false);
  assert.equal(selfSealedCheck.operatorIndependenceEstablished, false);
  assert.equal(selfSealedCheck.externalPreauthorizationEstablished, false);

  const promoted = structuredClone(release);
  promoted.approvalAuthority.approvalAuthorityEstablished = true;
  promoted.approvalAuthority.operatorIndependenceEstablished = true;
  promoted.approvalAuthority.externalPreauthorizationEstablished = true;
  const { releaseHash: ignoredPromotedHash, ...promotedBody } = promoted;
  promoted.releaseHash = memoryReleaseHash(promotedBody);
  const promotedCheck = verifyMemoryRelease(promoted, {
    proposal,
    envelope: env,
    attempts,
    trustedApproverIds: ["safety-reviewer-a"],
    expectedApprovalPolicyHash: policyHash,
    expectedApprovalEvidenceHash: approvalEvidenceHash,
    expectedReleaseHash: promoted.releaseHash,
  });
  assert.equal(promotedCheck.ok, false,
    "a self-consistent release hash cannot promote caller declarations into authority");
  assert.match(promotedCheck.errors.join(";"), /not canonical|hash changed/);
  assert.equal(promotedCheck.approvalAuthorityEstablished, false);
  assert.equal(promotedCheck.operatorIndependenceEstablished, false);
  assert.equal(promotedCheck.externalPreauthorizationEstablished, false);

  const tampered = structuredClone(release);
  tampered.content.maxRiskUnitsPerAttempt = 99;
  const checked = verifyMemoryRelease(tampered, {
    proposal,
    envelope: env,
    attempts,
    trustedApproverIds: ["safety-reviewer-a"],
    expectedApprovalPolicyHash: policyHash,
    expectedApprovalEvidenceHash: approvalEvidenceHash,
  });
  assert.equal(checked.ok, false);
  assert.match(checked.errors.join(";"), /not canonical|hash changed/);
});
