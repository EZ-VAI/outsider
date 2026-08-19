import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

const digest = (value) => {
  const bytes = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
};

const validHash = (value) => /^sha256:[a-f0-9]{64}$/.test(String(value ?? ""));
const safeHash = (namespace, value) => {
  if (value == null || value === "") return null;
  return validHash(value) ? String(value) : digest(`${namespace}\0${String(value)}`);
};
const countBy = (values) => Object.fromEntries([...new Set(values)].sort()
  .map((value) => [value, values.filter((candidate) => candidate === value).length]));
const eventRef = (event) => ({ seq: event.seq, type: event.type, eventHash: event.eventHash });

function supervisorFailureRisk(event) {
  if (event.failureCategory === "control-plane-capacity") {
    return "CONTROL_PLANE_CAPACITY_LOSS";
  }
  if (event.error === "INVALID_CORRECTION_AUTHORITY_PROJECTION") {
    return "CORRECTION_AUTHORITY_PROJECTION_REJECTED";
  }
  if (String(event.error ?? "").startsWith("INVALID_")) {
    return "SUPERVISOR_PROTOCOL_INVALID";
  }
  return "SUPERVISOR_UNAVAILABLE";
}

const evaluationEventTypes = new Set([
  "endurance_invalidation_detected",
  "endurance_terminal_controller_failure_detected",
  "endurance_recovery_drill_causal_chain_missing",
  "endurance_patrol_warmup_unusable",
  "endurance_host_capacity_exhausted",
]);

function boundedEvaluationCode(event) {
  const code = String(event.code ?? "");
  return /^[A-Z][A-Z0-9_]{0,95}$/.test(code) ? code : null;
}

function evaluationDisposition(event) {
  const code = boundedEvaluationCode(event);
  return {
    code,
    codeHash: code ? null : safeHash("evaluation-code", event.code),
    productSafetyFailure: event.productSafetyFailure === true,
    evaluationProtocolFailure: event.evaluationProtocolFailure === true
      || event.type === "endurance_invalidation_detected"
        && String(event.code ?? "").startsWith("PREREGISTERED_"),
    stage05ActuationEvidenceFailure: event.stage05ActuationEvidenceFailure === true,
    hostCapacityFailure: event.hostCapacityFailure === true
      || event.type === "endurance_host_capacity_exhausted",
  };
}

const riskRules = Object.freeze({
  acceptance_finished: (event) => event.passed === false ? "ACCEPTANCE_RED" : null,
  outcome_verdict: (event) => event.passed === false ? "SEMANTIC_OUTCOME_RED" : null,
  boundary_paused: () => "CONTROL_BOUNDARY_PAUSED",
  correction_factual_audit: (event) => event.passed === false ? "CORRECTION_REJECTED" : null,
  outcome_approval_audit: (event) => event.passed === false ? "OUTCOME_APPROVAL_REJECTED" : null,
  supervisor_clearance_rejected: () => "CLEARANCE_REJECTED",
  contract_audit_rejected: () => "CONTRACT_REJECTED",
  contract_audit_failed: () => "CONTRACT_AUDIT_FAILED",
  supervisor_failed: supervisorFailureRisk,
  supervisor_clearance_auditor_failed: (event) =>
    event.failureCategory === "control-plane-capacity"
      ? "CONTROL_PLANE_CAPACITY_LOSS" : "SUPERVISOR_UNAVAILABLE",
  supervisor_clearance_rediagnosis_failed: (event) =>
    event.failureCategory === "control-plane-capacity"
      ? "CONTROL_PLANE_CAPACITY_LOSS" : "SUPERVISOR_UNAVAILABLE",
  correction_auditor_failed: (event) => event.failureCategory === "control-plane-capacity"
    ? "CONTROL_PLANE_CAPACITY_LOSS" : "SUPERVISOR_UNAVAILABLE",
  outcome_verifier_failed: (event) => event.failureCategory === "control-plane-capacity"
    ? "CONTROL_PLANE_CAPACITY_LOSS" : "SUPERVISOR_UNAVAILABLE",
  outcome_approval_auditor_failed: (event) =>
    event.failureCategory === "control-plane-capacity"
      ? "CONTROL_PLANE_CAPACITY_LOSS" : "SUPERVISOR_UNAVAILABLE",
  supervisor_insufficient: () => "SUPERVISOR_INSUFFICIENT",
  unattended_interaction_intercepted: () => "HUMAN_WAIT_INTERCEPTED",
  unattended_interaction_unresolved: () => "HUMAN_WAIT_UNRESOLVED",
  safety_gate_emitted: () => "IRREVERSIBLE_ACTION_GATED",
  agent_identity_conflict: () => "AGENT_IDENTITY_CONFLICT",
  agent_host_identity_conflict: () => "AGENT_IDENTITY_CONFLICT",
  team_identity_binding_conflict: () => "AGENT_IDENTITY_CONFLICT",
  task_completion_identity_unresolved: () => "TASK_IDENTITY_UNRESOLVED",
  controller_recovered: () => "CONTROLLER_RECOVERED",
  endurance_host_capacity_exhausted: () => "HOST_CAPACITY_EXHAUSTED",
  endurance_invalidation_detected: (event) => {
    const disposition = evaluationDisposition(event);
    if (disposition.productSafetyFailure) return "PRODUCT_SAFETY_FAILURE_OBSERVED";
    if (disposition.stage05ActuationEvidenceFailure) {
      return "STAGE05_ACTUATION_EVIDENCE_FAILURE";
    }
    return disposition.evaluationProtocolFailure
      ? "EVALUATION_PROTOCOL_INVALIDATED" : "EVALUATION_INVALIDATION_UNCLASSIFIED";
  },
  endurance_terminal_controller_failure_detected: () => "EVALUATION_PROTOCOL_INVALIDATED",
  endurance_recovery_drill_causal_chain_missing: () => "STAGE05_ACTUATION_EVIDENCE_FAILURE",
  endurance_patrol_warmup_unusable: () => "EVALUATION_PROTOCOL_INVALIDATED",
  run_cannot_recover: () => "RUN_CANNOT_RECOVER",
  worker_budget_exhausted: () => "WORKER_BUDGET_EXHAUSTED",
  gate_containment_finalized: () => "CONTROL_BOUNDARY_CONTAINMENT",
  unattributed_workspace_change_observed: () => "UNATTRIBUTED_WORKSPACE_CHANGE",
  intervention_unresolved: (event) => event.reason
    === "no authority-matched effect exists on the delivered fingerprint"
    ? "CAUSAL_ATTRIBUTION_UNRESOLVED" : null,
});

const causalStageTypes = Object.freeze([
  "boundary_paused",
  "supervisor_verdict",
  "correction_factual_audit",
  "correction_emitted",
  "correction_observed",
  "effect_observed",
  "acceptance_finished",
  "outcome_verdict",
  "intervention_resolved",
]);

function eventMatchesCausalStage(event, type) {
  if (event.type !== type) return false;
  if (type === "supervisor_verdict") return event.onTrack === false;
  if (type === "correction_factual_audit") return event.passed === true;
  if (type === "effect_observed") return typeof event.matchedExpectedAction === "string"
    && event.matchedExpectedAction.length > 0
    && validHash(event.artifactFingerprint);
  if (type === "acceptance_finished") return ["stop", "integration"].includes(event.phase)
    && event.passed === true;
  if (type === "outcome_verdict") return ["stop", "integration"].includes(event.phase)
    && event.passed === true;
  if (type === "intervention_resolved") return Number(event.causalEffectSeq) > 0
    && validHash(event.finalFingerprint);
  return true;
}

function riskEventsFrom(events) {
  return events.flatMap((event) => {
    const riskClass = riskRules[event.type]?.(event) ?? null;
    if (!riskClass) return [];
    return [{
      riskClass,
      seq: event.seq,
      eventType: event.type,
      eventHash: event.eventHash,
      interventionHash: safeHash("intervention", event.interventionId),
      authorityHash: safeHash("authority",
        event.correctionAuthorityHash ?? event.authorityHash),
    }];
  });
}

function evaluationValidityFrom(events) {
  const invalidations = events.filter((event) => evaluationEventTypes.has(event.type))
    .map((event) => ({
      ...eventRef(event),
      ...evaluationDisposition(event),
    }));
  return {
    observedOnly: true,
    classificationAuthority: "DETERMINISTIC_EVENT_MAPPING",
    establishesLossOrLiability: false,
    invalidated: invalidations.length > 0,
    productSafetyFailuresObserved: invalidations.filter((entry) =>
      entry.productSafetyFailure).length,
    evaluationProtocolFailuresObserved: invalidations.filter((entry) =>
      entry.evaluationProtocolFailure).length,
    stage05ActuationEvidenceFailuresObserved: invalidations.filter((entry) =>
      entry.stage05ActuationEvidenceFailure).length,
    hostCapacityFailuresObserved: invalidations.filter((entry) =>
      entry.hostCapacityFailure).length,
    invalidations,
  };
}

function causalChainsFrom(events, terminal) {
  const ids = [...new Set(events.map((event) => event.interventionId).filter(Boolean))];
  return ids.map((id) => {
    const related = events.filter((event) => event.interventionId === id)
      .sort((left, right) => left.seq - right.seq);
    const before = (type, seq, predicate = () => true) => related.findLast((event) =>
      event.seq < seq && eventMatchesCausalStage(event, type) && predicate(event)) ?? null;
    const between = (type, lower, upper, predicate = () => true) => related.find((event) =>
      event.seq > lower && event.seq < upper && eventMatchesCausalStage(event, type)
      && predicate(event)) ?? null;
    let stages = [];
    for (const resolved of related.filter((event) =>
      eventMatchesCausalStage(event, "intervention_resolved")).toReversed()) {
      const effect = related.find((event) => event.seq === resolved.causalEffectSeq
        && eventMatchesCausalStage(event, "effect_observed")
        && event.correctionAuthorityHash === resolved.correctionAuthorityHash) ?? null;
      if (!effect) continue;
      const observed = before("correction_observed", effect.seq,
        (event) => event.correctionAuthorityHash === effect.correctionAuthorityHash);
      const emitted = observed && before("correction_emitted", observed.seq,
        (event) => event.correctionAuthorityHash === effect.correctionAuthorityHash);
      const audit = emitted && before("correction_factual_audit", emitted.seq,
        (event) => event.correctionAuthorityHash === effect.correctionAuthorityHash);
      const verdict = audit && before("supervisor_verdict", audit.seq,
        (event) => event.correctionAuthorityHash === effect.correctionAuthorityHash);
      const paused = verdict && before("boundary_paused", verdict.seq);
      const acceptance = between("acceptance_finished", effect.seq, resolved.seq,
        (event) => event.finalFingerprint === effect.artifactFingerprint);
      const outcome = acceptance && between("outcome_verdict", acceptance.seq, resolved.seq,
        (event) => event.phase === acceptance.phase
          && event.finalFingerprint === effect.artifactFingerprint);
      const candidate = [paused, verdict, audit, emitted, observed, effect, acceptance, outcome,
        resolved];
      if (candidate.every(Boolean)) {
        stages = candidate;
        break;
      }
    }
    if (!stages.length) {
      let afterSeq = -1;
      stages = causalStageTypes.map((type) => {
        const stage = related.find((event) => event.seq > afterSeq
          && eventMatchesCausalStage(event, type)) ?? null;
        if (stage) afterSeq = stage.seq;
        return stage;
      }).filter(Boolean);
    }
    const coveredTypes = stages.map((stage) => stage.type);
    const ordered = stages.length === causalStageTypes.length
      && stages.every((stage, index) => index === 0 || stage.seq > stages[index - 1].seq);
    const byType = Object.fromEntries(stages.map((stage) => [stage.type, stage]));
    const effect = byType.effect_observed;
    const acceptance = byType.acceptance_finished;
    const outcome = byType.outcome_verdict;
    const resolved = byType.intervention_resolved;
    const causalIntegrity = Boolean(effect && acceptance && outcome && resolved
      && effect.artifactFingerprint === acceptance.finalFingerprint
      && effect.artifactFingerprint === outcome.finalFingerprint
      && effect.artifactFingerprint === resolved.finalFingerprint
      && resolved.causalEffectSeq === effect.seq
      && resolved.correctionAuthorityHash === effect.correctionAuthorityHash);
    return {
      interventionHash: digest(`intervention\0${id}`),
      authorityHashes: [...new Set(related.map((event) => safeHash("authority",
        event.correctionAuthorityHash ?? event.authorityHash)).filter(Boolean))].sort(),
      requiredStages: [...causalStageTypes],
      coveredStages: coveredTypes,
      ordered,
      causalIntegrity,
      sealedComplete: ordered && causalIntegrity && terminal.interventionComplete === true,
      events: stages.map(eventRef),
    };
  });
}

function durationMs(events) {
  const first = Date.parse(events[0]?.at ?? "");
  const last = Date.parse(events.at(-1)?.at ?? "");
  return Number.isFinite(first) && Number.isFinite(last) ? Math.max(0, last - first) : null;
}

function finalObservedAt(events) {
  const value = events.at(-1)?.at ?? null;
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function hostCapacityFrom(events, binding, terminal, { witness = null, preregistration = null,
  r4Recovery = null } = {}) {
  const boundaries = events.filter((event) => event.type === "boundary_reached");
  const capabilities = events.filter((event) => event.type === "team_spawn_capability_observed");
  const checkpoints = Array.isArray(witness?.checkpoints) ? witness.checkpoints : [];
  const firstCheckpoint = Number(checkpoints[0]?.monotonicMs);
  const lastCheckpoint = Number(checkpoints.at(-1)?.monotonicMs);
  const witnessedDurationMs = Number.isFinite(firstCheckpoint) && Number.isFinite(lastCheckpoint)
    ? Math.max(0, lastCheckpoint - firstCheckpoint) : null;
  return {
    observedOnly: true,
    hostProtocol: binding.source.hostProtocol,
    eventDurationMs: durationMs(events),
    toolBoundaries: {
      pre: boundaries.filter((event) => event.boundary === "PreToolUse").length,
      post: boundaries.filter((event) => event.boundary === "PostToolUse").length,
      successfulPostWithExit: boundaries.filter((event) =>
        event.boundary === "PostToolUse" && Number(event.exit) === 0).length,
    },
    actors: {
      registered: events.filter((event) => event.type === "agent_registered").length,
      teammateBindings: events.filter((event) => event.type === "team_identity_bound"
        && event.status === "teammate_spawned").length,
      delegationBindingChallenges: events.filter((event) =>
        event.type === "team_delegation_binding_required").length,
      directDelegationsBound: events.filter((event) =>
        event.type === "team_delegation_bound" && event.directPromptBound === true).length,
      delegationBindingConflicts: events.filter((event) =>
        event.type === "team_delegation_binding_conflict"
        || event.type === "team_task_definition_conflict").length,
    },
    agentTeamCapabilities: countBy(capabilities.map((event) => String(event.status ?? "missing"))),
    controller: {
      generations: terminal.controllerGenerationCount,
      recoveries: events.filter((event) => event.type === "controller_recovered").length,
    },
    semanticPatrol: {
      due: events.filter((event) => event.type === "semantic_patrol_due").length,
      passed: events.filter((event) => event.type === "semantic_patrol_passed").length,
      finished: events.filter((event) => event.type === "semantic_patrol_finished").length,
      deferredPendingCorrectionEffect: events.filter((event) =>
        event.type === "semantic_patrol_deferred_pending_correction_effect").length,
    },
    semanticJudgment: {
      insufficient: events.filter((event) => event.type === "supervisor_insufficient").length,
      insufficiencyReclassifiedAsAdvisory: events.filter((event) =>
        event.type === "supervisor_insufficiency_reclassified_as_advisory").length,
      correctionAuditInsufficiencyReclassifiedAsAdvisory: events.filter((event) =>
        event.type === "correction_audit_insufficiency_reclassified_as_advisory").length,
    },
    externalEnduranceWitness: witness ? {
      schema: witness.schema ?? null,
      passed: witness.passed === true,
      checkpoints: checkpoints.length,
      witnessedDurationMs,
      witnessHash: digest(witness),
      preregistrationHash: preregistration?.preregistrationHash ?? null,
      evaluationMode: preregistration?.evaluationMode ?? null,
    } : null,
    capacityExhaustions: events.filter((event) =>
      event.type === "endurance_host_capacity_exhausted"
      || event.failureCategory === "control-plane-capacity").length,
    unattendedInteractionAttempts: events.filter((event) =>
      event.type === "unattended_interaction_intercepted"
      || event.type === "unattended_interaction_unresolved").length,
    recoveryEvaluation: r4Recovery ? {
      observedOnly: true,
      schema: r4Recovery.schema ?? null,
      lane: r4Recovery.lane ?? null,
      failpoint: r4Recovery.failpoint ?? null,
      passed: r4Recovery.passed === true,
      originalGeneration: r4Recovery.originalGeneration ?? null,
      recoveredGeneration: r4Recovery.recoveredGeneration ?? null,
      sameRunId: r4Recovery.sameRunId === true,
      sameContractSeal: r4Recovery.sameContractSeal === true,
      sameInterventionId: r4Recovery.sameInterventionId ?? null,
      sameAuthorityHash: r4Recovery.sameAuthorityHash ?? null,
      orphanJudgeProcesses: r4Recovery.orphanJudgeProcesses ?? null,
      terminalReconciled: r4Recovery.terminalReconciled === true,
      recoveryHash: digest(r4Recovery),
    } : null,
  };
}

function modelInputFrom({ verified, events, risks, causalChains, hostCapacity }) {
  const { binding, manifest, projection } = verified;
  const terminal = projection.outcome;
  const resolved = ["SAFE_DELIVERY", "VERIFIED_DELIVERY_UNATTRIBUTED"]
    .includes(terminal.terminalClass);
  const outsiderCausalContribution = terminal.proofComplete === true
    && terminal.interventionRequired === true && terminal.interventionComplete === true
    && causalChains.some((chain) => chain.sealedComplete === true);
  const neededCorrection = terminal.interventionRequired === true
    || events.some((event) => event.type === "correction_emitted");
  const fakeSignal = risks.some((risk) => risk.riskClass === "SEMANTIC_OUTCOME_RED")
    && events.some((event) => event.type === "acceptance_finished" && event.passed === true);
  const taskId = binding.claimRef.claimHash ?? binding.claimRef.observedObjectiveHash;
  return {
    schema: "outsider/experience/v1",
    taskId,
    executor: { id: binding.wayRef.wayHash, kind: binding.wayRef.wayType ?? "DURABLE_WORKFLOW" },
    world: { kind: "unknown", evidenceHash: binding.worldRef.worldHash
      ?? binding.worldRef.workspaceEvidenceHash ?? null },
    claim: { id: taskId, mode: binding.claimRef.mode },
    features: {
      nSteps: hostCapacity.toolBoundaries.post,
      claimedPass: null,
      claimedDone: null,
      ranTestClaim: null,
      costUsd: null,
      costVsPeer: null,
    },
    labels: {
      fakedSuccess: fakeSignal,
      neededCorrection,
      escalated: risks.some((risk) => risk.riskClass === "HUMAN_WAIT_UNRESOLVED"),
      gatedIrreversible: risks.some((risk) =>
        risk.riskClass === "IRREVERSIBLE_ACTION_GATED"
        || risk.riskClass === "CONTROL_BOUNDARY_CONTAINMENT"),
      correctionSucceeded: outsiderCausalContribution,
    },
    signalsSeen: [...new Set(risks.map((risk) => risk.riskClass))].sort(),
    trajectory: {
      verbSequence: events.filter((event) => event.type === "boundary_reached"
        && event.boundary === "PostToolUse").map((event) =>
        String(event.tool ?? "other").toLowerCase()),
      returnCodes: countBy(events.filter((event) => event.type === "boundary_reached"
        && event.boundary === "PostToolUse" && event.exit != null)
        .map((event) => String(event.exit))),
      steps: hostCapacity.toolBoundaries.post,
    },
    verified: {
      resolved,
      deliveryResolved: resolved,
      interventionRequired: terminal.interventionRequired === true,
      interventionComplete: terminal.interventionComplete === true,
      outsiderCausalContribution,
      eligibleForCorrectionEffectLearning: outsiderCausalContribution,
      causalAttributionClass: outsiderCausalContribution
        ? "AUDITED_INTERVENTION_COMPLETE"
        : resolved && terminal.interventionRequired === true
          ? "DELIVERY_UNATTRIBUTED"
          : resolved ? "DELIVERY_NO_INTERVENTION_REQUIRED" : "NO_DELIVERY",
      by: `stage05:${manifest.manifestHash}`,
      terminalClass: terminal.terminalClass,
      projectionHash: projection.projectionHash,
    },
    stateHash: manifest.eventChain.chainHash,
  };
}

export function buildSupervisedExperienceV2({ verified, events = [], witness = null,
  preregistration = null, agentTeamPreregistration = null, r4Recovery = null } = {}) {
  if (!verified?.ok || !verified.binding || !verified.manifest || !verified.projection) {
    throw new Error("SUPERVISED_EXPERIENCE_VERIFIED_STAGE05_RUN_REQUIRED");
  }
  if (!Array.isArray(events) || events.length !== verified.manifest.eventChain.eventCount
    || events.at(-1)?.eventHash !== verified.manifest.eventChain.lastEventHash) {
    throw new Error("SUPERVISED_EXPERIENCE_EVENT_CHAIN_MISMATCH");
  }
  const { binding, manifest, projection } = verified;
  const risks = riskEventsFrom(events);
  const evaluationValidity = evaluationValidityFrom(events);
  const causalChains = causalChainsFrom(events, projection.outcome);
  const hostCapacity = hostCapacityFrom(events, binding, projection.outcome,
    { witness, preregistration, r4Recovery });
  const gatesObserved = ["R1"];
  if (agentTeamPreregistration) gatesObserved.push("R2");
  if (events.some((event) => event.type === "multi_agent_integration_verified"
    || event.type === "multi_agent_integration_blocked")) gatesObserved.push("R3");
  if (events.some((event) => event.type === "controller_recovered") || r4Recovery) {
    gatesObserved.push("R4");
  }
  if (preregistration?.schema === "outsider/stage05-endurance-preregistration/v1") {
    gatesObserved.push("R5");
  }
  const groupKey = {
    extractorId: binding.source.extractorId,
    productVersion: binding.source.packageVersion,
    controllerImplementationHash: binding.source.controllerImplementationHash,
    hostProtocol: binding.source.hostProtocol,
    wayHash: binding.wayRef.wayHash,
    claimRefHash: digest(binding.claimRef),
    worldRefHash: digest(binding.worldRef),
    authorityRefHash: digest(binding.authority),
  };
  const body = {
    schema: "outsider/supervised-experience/v2",
    schemaVersion: "2.0.0",
    extractor: { id: "outsider-supervised-experience/v2", version: "2.1.0" },
    source: {
      runId: manifest.sourceRunId,
      observedAt: finalObservedAt(events),
      manifestHash: manifest.manifestHash,
      projectionHash: projection.projectionHash,
      publicEvidenceHash: verified.publicEvidence.publicEvidenceHash,
      eventChainHash: manifest.eventChain.chainHash,
      eventCount: manifest.eventChain.eventCount,
    },
    attestationCompatibility: { artifactType: "outsider_attestation_v2", groupKey },
    evaluationContext: {
      gatesObserved,
      gatePassClaimed: false,
      note: "observed evidence routing only; R1-R5 evaluators remain authoritative",
      preregistrationHashes: {
        agentTeam: agentTeamPreregistration ? digest(agentTeamPreregistration) : null,
        endurance: preregistration ? digest(preregistration) : null,
        recovery: r4Recovery ? digest(r4Recovery) : null,
      },
    },
    evaluationValidity,
    terminal: projection.outcome,
    riskEvidence: {
      observedOnly: true,
      classificationAuthority: "DETERMINISTIC_EVENT_MAPPING",
      establishesLossOrLiability: false,
    },
    riskEvents: risks,
    causalChains,
    hostCapacity,
    modelInput: null,
  };
  body.modelInput = modelInputFrom({ verified, events, risks, causalChains, hostCapacity });
  body.learningLabels = {
    deliveryResolved: body.modelInput.verified.deliveryResolved,
    outsiderCausalContribution: body.modelInput.verified.outsiderCausalContribution,
    eligibleForCorrectionEffectLearning:
      body.modelInput.verified.eligibleForCorrectionEffectLearning,
    causalAttributionClass: body.modelInput.verified.causalAttributionClass,
  };
  return { ...body, recordHash: digest(body) };
}

export function verifySupervisedExperienceV2(record, { verified = null } = {}) {
  try {
    if (record?.schema !== "outsider/supervised-experience/v2"
      || record.schemaVersion !== "2.0.0") throw new Error("SUPERVISED_EXPERIENCE_SCHEMA_INVALID");
    if (record.extractor?.id !== "outsider-supervised-experience/v2"
      || !["2.0.0", "2.1.0"].includes(record.extractor?.version)) {
      throw new Error("SUPERVISED_EXPERIENCE_EXTRACTOR_INVALID");
    }
    const { recordHash, ...body } = record;
    if (recordHash !== digest(body)) throw new Error("SUPERVISED_EXPERIENCE_HASH_BROKEN");
    if (verified && (record.source.manifestHash !== verified.manifest.manifestHash
      || record.source.projectionHash !== verified.projection.projectionHash
      || record.source.eventChainHash !== verified.manifest.eventChain.chainHash)) {
      throw new Error("SUPERVISED_EXPERIENCE_SOURCE_MISMATCH");
    }
    if (record.source?.observedAt != null
      && (typeof record.source.observedAt !== "string"
        || !Number.isFinite(Date.parse(record.source.observedAt)))) {
      throw new Error("SUPERVISED_EXPERIENCE_OBSERVED_AT_INVALID");
    }
    if (record.modelInput?.schema !== "outsider/experience/v1"
      || typeof record.modelInput?.verified?.resolved !== "boolean"
      || typeof record.learningLabels?.deliveryResolved !== "boolean"
      || typeof record.learningLabels?.outsiderCausalContribution !== "boolean"
      || typeof record.learningLabels?.eligibleForCorrectionEffectLearning !== "boolean") {
      throw new Error("SUPERVISED_EXPERIENCE_MODEL_INPUT_INVALID");
    }
    if (record.evaluationValidity != null) {
      const validity = record.evaluationValidity;
      if (validity.observedOnly !== true || validity.establishesLossOrLiability !== false
        || !Array.isArray(validity.invalidations)
        || validity.invalidated !== (validity.invalidations.length > 0)
        || validity.productSafetyFailuresObserved !== validity.invalidations.filter((entry) =>
          entry.productSafetyFailure === true).length
        || validity.evaluationProtocolFailuresObserved !== validity.invalidations.filter((entry) =>
          entry.evaluationProtocolFailure === true).length
        || validity.stage05ActuationEvidenceFailuresObserved
          !== validity.invalidations.filter((entry) =>
            entry.stage05ActuationEvidenceFailure === true).length
        || validity.hostCapacityFailuresObserved !== validity.invalidations.filter((entry) =>
          entry.hostCapacityFailure === true).length) {
        throw new Error("SUPERVISED_EXPERIENCE_EVALUATION_VALIDITY_INVALID");
      }
    }
    const labels = record.learningLabels;
    if (labels.eligibleForCorrectionEffectLearning !== labels.outsiderCausalContribution
      || (labels.outsiderCausalContribution && (!labels.deliveryResolved
        || !record.causalChains?.some((chain) => chain.sealedComplete === true)))) {
      throw new Error("SUPERVISED_EXPERIENCE_CAUSAL_ATTRIBUTION_INVALID");
    }
    if (record.terminal?.terminalClass === "VERIFIED_DELIVERY_UNATTRIBUTED"
      && (labels.outsiderCausalContribution || labels.eligibleForCorrectionEffectLearning)) {
      throw new Error("SUPERVISED_EXPERIENCE_UNATTRIBUTED_TREATMENT_INVALID");
    }
    return { ok: true, recordHash };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

export function supervisedExperienceModelInput(record) {
  const checked = verifySupervisedExperienceV2(record);
  if (!checked.ok) throw new Error(checked.error);
  return structuredClone(record.modelInput);
}

export function loadSupervisedExperienceCorpus(directory) {
  let names;
  try { names = readdirSync(directory).filter((name) => name.endsWith(".json")).sort(); }
  catch { return { records: [], refused: [] }; }
  const records = [];
  const refused = [];
  for (const name of names) {
    try {
      const record = JSON.parse(readFileSync(path.join(directory, name), "utf8"));
      const checked = verifySupervisedExperienceV2(record);
      if (!checked.ok) refused.push({ fileHash: digest(name), reason: checked.error });
      else records.push(record);
    } catch (error) {
      refused.push({ fileHash: digest(name), reason: String(error?.message ?? error) });
    }
  }
  return { records, refused };
}

export { digest as supervisedExperienceDigest };
