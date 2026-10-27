import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createAutonomousWorkOrderLifecycleOutcomeReplayReceiptV3,
} from "../../src/outsider-autonomous-work-order-lifecycle-outcome-replay-v3.js";
import {
  createAutonomousWorkOrderDelegationLaneCrosswalkSource,
  createAutonomousWorkOrderProductTermReferenceSource,
  createAutonomousWorkOrderSourceReplayClosureReceipt,
} from "../../src/outsider-autonomous-work-order-source-replay-closure.js";
import {
  createEpisodeAttemptSetComposition,
} from "../../src/outsider-episode-attempt-set-composition.js";
import {
  appendEpisodeAttemptSetLocalHeadV2,
  initializeEpisodeAttemptSetLocalHeadV2,
} from "../../src/outsider-episode-attempt-set-local-head-v2.js";
import {
  buildOutsiderNetworkNodeContractConformance,
} from "../../src/outsider-network-node-contract-conformance.js";
import {
  createAutonomousWorkOrderLifecycleOutcomeReplayV3Fixture,
} from "./outsider-autonomous-work-order-lifecycle-outcome-replay-v3-fixture.js";

const BASE_LANES = Object.freeze([
  "PROSPECTIVE_CENSUS",
  "DELEGATION_RESPONSIBILITY",
  "ACTION_OUTCOME",
]);

function delegationLane(base) {
  const matches = base.network.input.laneBundles.filter(
    (row) => row.preview.manifest.lane === "DELEGATION_RESPONSIBILITY",
  );
  assert.equal(matches.length, 1);
  return matches[0];
}

function actorEdge(base) {
  const graph = base.workOrder.typedGraph.delegation;
  const matches = base.foundation.actorEnvelope.delegationEdges.filter(
    (row) => row.delegationEdgeHash === graph.delegationEdgeHash
      && row.delegationEvidenceRefHash === graph.delegationEvidenceRefHash,
  );
  assert.equal(matches.length, 1);
  return matches[0];
}

function delegationSourceInput(base) {
  const edge = actorEdge(base);
  return {
    actorIdentityEnvelopeHash:
      base.foundation.actorEnvelope.actorIdentityEnvelopeHash,
    accountableDeploymentSubjectHash:
      base.foundation.actorEnvelope.actorSubjectHash,
    actorDelegationEdge: {
      parent: edge.parent,
      child: edge.child,
      delegationEvidenceRefHash: edge.delegationEvidenceRefHash,
      delegationEdgeHash: edge.delegationEdgeHash,
    },
    laneProjection: delegationLane(base).preview.payload,
  };
}

function productTermSourceInput(base) {
  return {
    orderIdentityHash: base.workOrder.episodeAlias.orderIdentityHash,
    resourceOwner: base.workOrder.resourceOwner,
    promisedOutcome: base.workOrder.promisedOutcome,
    obligors: base.workOrder.obligorSet.items.map((row) => ({
      obligorRefHash: row.obligorRefHash,
      role: row.role,
      obligationRefHash: row.obligationRefHash,
    })),
    remedies: base.workOrder.remedyMenu.items.map((row) => ({
      remedyId: row.remedyId,
      kind: row.kind,
      remedyTermsHash: row.remedyTermsHash,
      obligorRefHashes: row.obligorRefHashes,
    })),
    proofAccessPolicy: {
      roleScopedProofPolicyHash:
        base.workOrder.proofAccessPolicy.roleScopedProofPolicyHash,
      redactionPolicyHash: base.workOrder.proofAccessPolicy.redactionPolicyHash,
    },
  };
}

function sourceClosureFixture(base) {
  const pins = {
    expectedJoinHash: base.network.join.joinHash,
    laneTrust: base.network.laneTrust,
  };
  const conformance = buildOutsiderNetworkNodeContractConformance({
    input: base.network.input,
    join: base.network.join,
  }, pins);
  const delegationCrosswalkSource
    = createAutonomousWorkOrderDelegationLaneCrosswalkSource(
      delegationSourceInput(base));
  const productTermReferenceSource
    = createAutonomousWorkOrderProductTermReferenceSource(
      productTermSourceInput(base));
  const input = {
    predecessor: {
      receipt: base.receipt,
      input: base.input,
      context: base.context,
    },
    networkNodeContract: { conformance, pins },
    delegationCrosswalkSource,
    productTermReferenceSource,
    independentPinProvenance: null,
  };
  const context = {
    expectedPredecessorReceiptHash: base.receipt.sourceReplayReceiptHash,
    expectedNetworkNodeContractConformanceHash: conformance.conformanceHash,
    expectedDelegationCrosswalkSourceHash: delegationCrosswalkSource.sourceHash,
    expectedProductTermReferenceSourceHash:
      productTermReferenceSource.sourceHash,
  };
  const receipt = createAutonomousWorkOrderSourceReplayClosureReceipt(
    input, context);
  return {
    pins,
    conformance,
    delegationCrosswalkSource,
    productTermReferenceSource,
    input,
    context,
    receipt,
  };
}

function episodeBinding(lifecycle) {
  const base = lifecycle.predecessor;
  const graph = base.workOrder.typedGraph;
  return {
    principalEpochProjectionHash:
      graph.principalEpoch.principalEpochProjectionHash,
    accountableDeploymentSubjectHash:
      graph.accountableDeployment.accountableDeploymentSubjectHash,
    runtimeInstanceHash: graph.runtime.runtimeInstanceHash,
    embodimentRevisionHash: graph.embodiment.embodimentRevisionHash,
    delegationEdgeHash: graph.delegation.delegationEdgeHash,
    episodeHash: graph.episode.episodeHash,
    workOrderProjectionHash: base.workOrder.workOrderHash,
    networkCompleteEpisodeJoinHash:
      graph.episode.networkCompleteEpisodeJoinHash,
    prospectiveCensusProjectionHash:
      base.receipt.sourcePins.prospectiveCensusProjectionHash,
    realityObligationGenesisHash:
      base.receipt.sourcePins.obligationGenesisHash,
    realityObligationStateHash:
      base.receipt.sourcePins.obligationStateHash,
    genesisObligationAttemptHash: graph.attempt.attemptHash,
  };
}

function primaryAttempt(lifecycle) {
  const graph = lifecycle.predecessor.workOrder.typedGraph;
  const firstCreatedAt = lifecycle.predecessor.network.rows[0]
    .bundle.preview.manifest.createdAt;
  return {
    attemptOrdinal: 1,
    occurredAt: firstCreatedAt,
    episodeHash: graph.episode.episodeHash,
    attemptHash: graph.attempt.attemptHash,
    attemptActorSubjectHash: graph.attempt.attemptActorSubjectHash,
    kind: "PRIMARY",
    retryOfAttemptHash: null,
    recoveryOfAttemptHash: null,
  };
}

function reportRow({ ordinal, bundle, attemptHash, episodeHash,
  executionDisposition = "UNKNOWN", outcomeObservationStatus = "UNKNOWN",
  reportedOutcomeEvidenceHash = null, consequenceEvidenceHashes = [],
  reportedAt = bundle.receipt.receivedAt, networkReceiptHash = null }) {
  return {
    reportOrdinal: ordinal,
    reportedAt,
    episodeHash,
    occurrenceIdentityHash: bundle.preview.manifest.occurrenceIdentityHash,
    attemptHash,
    networkObjectIdentityHash:
      bundle.preview.manifest.payload.objectIdentityHash,
    networkReceiptHash: networkReceiptHash ?? bundle.receipt.receiptHash,
    executionDisposition,
    outcomeObservationStatus,
    reportedOutcomeEvidenceHash,
    consequenceEvidenceHashes,
  };
}

function baseReports(lifecycle, attempt) {
  const byLane = new Map(lifecycle.predecessor.network.rows.map(
    ({ bundle }) => [bundle.preview.manifest.lane, bundle]));
  assert.deepEqual([...byLane.keys()], BASE_LANES);
  return BASE_LANES.map((lane, index) => {
    const bundle = byLane.get(lane);
    const consequenceEvidenceHashes = lane === "ACTION_OUTCOME"
      ? [bundle.preview.payload.outcomeEvidenceHash] : [];
    return reportRow({
      ordinal: index + 1,
      bundle,
      attemptHash: attempt.attemptHash,
      episodeHash: attempt.episodeHash,
      consequenceEvidenceHashes,
    });
  });
}

function lifecycleReports(lifecycle, attempt) {
  const consequenceReportHash = lifecycle.v2Payload.consequenceReportHash;
  const shared = {
    attemptHash: attempt.attemptHash,
    episodeHash: attempt.episodeHash,
    outcomeObservationStatus: lifecycle.v2Payload.observationStatus,
    reportedOutcomeEvidenceHash: consequenceReportHash,
    consequenceEvidenceHashes: [consequenceReportHash],
  };
  const delayed = reportRow({
    ordinal: 4,
    bundle: lifecycle.successorRow.bundle,
    ...shared,
  });
  const sourceReviewEvent = lifecycle.sourceReview.exportRecord
    .networkSnapshot.event;
  const reviewed = reportRow({
    ordinal: 5,
    bundle: lifecycle.sourceReview.row.bundle,
    ...shared,
    reportedAt: sourceReviewEvent.occurredAt,
  });
  assert.notEqual(delayed.occurrenceIdentityHash,
    reviewed.occurrenceIdentityHash);
  assert.equal(delayed.networkObjectIdentityHash,
    reviewed.networkObjectIdentityHash);
  return [delayed, reviewed];
}

function cloneModel(value) {
  return structuredClone(value);
}

function attemptSetFixture(t, lifecycle, mutateAttemptSetModel = null) {
  const initial = {
    binding: episodeBinding(lifecycle),
    attempts: [primaryAttempt(lifecycle)],
  };
  initial.baseReports = baseReports(lifecycle, initial.attempts[0]);
  initial.lifecycleReports = lifecycleReports(lifecycle, initial.attempts[0]);
  const model = mutateAttemptSetModel === null
    ? initial : mutateAttemptSetModel(cloneModel(initial));
  assert.ok(model && typeof model === "object");
  const genesisRecordedAt = model.baseReports.reduce(
    (latest, row) => row.reportedAt > latest ? row.reportedAt : latest,
    model.attempts[0].occurredAt,
  );
  const genesis = createEpisodeAttemptSetComposition({
    recordedAt: genesisRecordedAt,
    episodeBinding: model.binding,
    appendOnlyLineage: {
      revision: 0,
      predecessorCompositionHash: null,
      supersedesCompositionHash: null,
    },
    attempts: model.attempts,
    reportOccurrences: model.baseReports,
  });
  const reportOccurrences = [...model.baseReports, ...model.lifecycleReports]
    .map((row, index) => ({ ...row, reportOrdinal: index + 1 }));
  const headRecordedAt = reportOccurrences.reduce(
    (latest, row) => row.reportedAt > latest ? row.reportedAt : latest,
    genesis.recordedAt,
  );
  const head = createEpisodeAttemptSetComposition({
    recordedAt: headRecordedAt,
    episodeBinding: model.binding,
    appendOnlyLineage: {
      revision: 1,
      predecessorCompositionHash: genesis.compositionHash,
      supersedesCompositionHash: genesis.compositionHash,
    },
    attempts: model.attempts,
    reportOccurrences,
  }, { predecessor: genesis });
  const parent = mkdtempSync(path.join(tmpdir(),
    "outsider-stage1-engineering-integration-attempt-set-"));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = path.join(parent, "registry");
  const registryId = "stage1-engineering-integration-attempt-set";
  const initialized = initializeEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId,
    genesisComposition: genesis,
  });
  assert.equal(initialized.ok, true, initialized.error);
  const appended = appendEpisodeAttemptSetLocalHeadV2({
    directory,
    registryId,
    composition: head,
    expectedLocalHeadHash: initialized.head.headHash,
  });
  assert.equal(appended.ok, true, appended.error);
  assert.equal(appended.head.headCompositionHash, head.compositionHash);
  assert.equal(appended.head.reportOccurrenceCount, reportOccurrences.length);
  return {
    model,
    genesis,
    head,
    reportOccurrences,
    parent,
    directory,
    registryId,
    initialized,
    appended,
  };
}

export function createAutonomousWorkOrderStage1EngineeringIntegrationFixture(
  t, { mutateAttemptSetModel = null } = {}) {
  const lifecycle =
    createAutonomousWorkOrderLifecycleOutcomeReplayV3Fixture(t);
  const lifecycleReceipt
    = createAutonomousWorkOrderLifecycleOutcomeReplayReceiptV3(
      lifecycle.input, lifecycle.context);
  const sourceClosure = sourceClosureFixture(lifecycle.predecessor);
  const attemptSet = attemptSetFixture(t, lifecycle, mutateAttemptSetModel);
  if (mutateAttemptSetModel === null) {
    assert.equal(attemptSet.reportOccurrences.length, 5);
    assert.equal(new Set(attemptSet.reportOccurrences.map(
      (row) => row.occurrenceIdentityHash)).size, 5);
    assert.equal(new Set(attemptSet.reportOccurrences.map(
      (row) => row.networkObjectIdentityHash)).size, 4);
  }
  const input = {
    recordedAt: "2026-09-01T00:02:00.000Z",
    sourceClosure: {
      receipt: sourceClosure.receipt,
      input: sourceClosure.input,
      context: sourceClosure.context,
    },
    attemptSet: {
      headComposition: attemptSet.head,
      immediatePredecessorComposition: attemptSet.genesis,
    },
    lifecycleOutcome: {
      receipt: lifecycleReceipt,
      input: lifecycle.input,
      context: lifecycle.context,
    },
    absentExternalFacts: {
      independentPinProvenance: null,
      durableExternalHead: null,
      directParticipantConfirmation: null,
      rightsPrivacyAdjudication: null,
    },
  };
  const context = {
    expectedSourceClosureReceiptHash:
      sourceClosure.receipt.closureReceiptHash,
    localAttemptSet: {
      directory: attemptSet.directory,
      registryId: attemptSet.registryId,
      expectedLocalHeadHash: attemptSet.appended.head.headHash,
    },
    expectedLifecycleOutcomeReceiptHash: lifecycleReceipt.receiptHash,
  };
  return {
    lifecycle,
    lifecycleReceipt,
    sourceClosure,
    attemptSet,
    input,
    context,
  };
}
