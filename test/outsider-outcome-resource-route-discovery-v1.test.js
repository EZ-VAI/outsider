import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { compileOutsiderOutcomeTenderV1 } from
  "../src/outsider-outcome-tender-v1.js";
import {
  OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_BOUNDARY,
  OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS,
  OUTSIDER_OUTCOME_RESOURCE_ROUTE_KINDS,
  createOutcomeResourceRouteCandidateV1,
  createOutcomeResourceRouteDiscoverySnapshotV1,
  createRouteCandidateV1,
  createDiscoverySnapshotV1,
  verifyOutcomeResourceRouteCandidateV1,
  verifyOutcomeResourceRouteDiscoverySnapshotV1,
  verifyRouteCandidateV1,
  verifyDiscoverySnapshotV1,
} from "../src/outsider-outcome-resource-route-discovery-v1.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

function tenderInput() {
  const evidenceId = alias("evidence", "independent");
  return {
    tenderId: alias("tender", "route-discovery"),
    compiledAt: "2026-09-02T12:00:00.000Z",
    lineage: { revision: 0, predecessorTenderHash: null,
      supersedesTenderHash: null },
    workOrderHash: h("work-order"),
    typedGraph: {
      principalEpoch: { principalRefHash: h("principal"),
        epochRefHash: h("epoch"), principalEpochProjectionHash: h("epoch-projection") },
      accountableDeployment: { deploymentLineageRefHash: h("deployment-lineage"),
        deploymentRevisionHash: h("deployment-revision"),
        accountableDeploymentSubjectHash: h("deployment-subject") },
      runtime: { runtimeInstanceRefHash: h("runtime-ref"),
        runtimeInstanceHash: h("runtime") },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash: h("delegation-evidence"),
        delegationEdgeHash: h("delegation-edge") },
      episode: { episodeHash: h("episode"),
        networkCompleteEpisodeJoinHash: h("episode-join") },
      attempt: { attemptHash: h("attempt"),
        attemptActorSubjectHash: h("attempt-actor") },
    },
    authorizationBinding: { actorIdentityEnvelopeHash: h("actor-envelope"),
      delegationEvidenceRefHash: h("delegation-evidence"),
      delegationEdgeHash: h("delegation-edge"), authorityScopeRefHash: h("scope"),
      resourceOwnerAuthorizationRefHash: h("owner-auth"),
      rightsPrivacyPolicyRefHash: h("rights-policy") },
    exactOutcome: {
      outcomeKindCode: "CALENDAR_EVENT_ESTABLISHED",
      outcomeSpecRefHash: h("outcome-spec"), subjectRefHash: h("subject"),
      acceptanceCriteriaRefHash: h("criteria"),
      conditions: [{ conditionId: alias("condition", "event-confirmed"),
        metricCode: "EVENT_STATE", comparator: "EQUAL",
        target: { valueKind: "STATE_CODE", booleanValue: null,
          integerValue: null, stateCode: "CONFIRMED", unitCode: null },
        observationWindowMs: 0, conditionRefHash: h("condition"), mandatory: true }],
      deadline: "2026-09-03T12:00:00.000Z",
    },
    formationDeadline: "2026-09-02T12:15:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: alias("resource", "coordination-surface"),
      resourceClassCode: "TRANSACTION_SURFACE", capabilityRefHash: h("capability"),
      quantity: 1, unitCode: "SURFACE", regionRefHash: h("region"),
      requiredBy: "2026-09-03T10:00:00.000Z", mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId, evidenceClassCode: "INDEPENDENT_CONFIRMATION",
      evidenceRequirementRefHash: h("evidence-requirement"),
      sourceControl: "INDEPENDENT_OF_PROVIDER", observationMode: "AT_COMPLETION",
      dueBy: "2026-09-03T12:00:00.000Z", mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: alias("recovery", "alternate-route"),
      triggerRefHash: h("trigger"), recoveryOutcomeRefHash: h("recovery-outcome"),
      resourceClassCode: "ALTERNATE_TRANSACTION_SURFACE", maximumAttempts: 2,
      completionDeadline: "2026-09-03T12:00:00.000Z",
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED", mandatory: true,
    }],
    maximumConsequence: { consequenceEnvelopeRefHash: h("consequence"),
      consequenceClassCode: "BOUNDED_SCHEDULING_FAILURE", measureCode: "MAXIMUM_DELAY",
      maximumValue: 120, unitCode: "MINUTE",
      affectedChannelRefHashes: [h("channel")], irreversibleHarmAllowed: false,
      unboundedConsequenceAllowed: false },
    zeroInternalOps: { outsiderStaffInterventionsAllowed: 0,
      internalManualSourcingAllowed: false, internalManualCoordinationAllowed: false,
      internalManualVerificationAllowed: false, internalManualRecoveryAllowed: false,
      humanQueueFallbackAllowed: false, failureDisposition: "DECLINE_NOT_HUMAN_QUEUE" },
  };
}

function tender() {
  return compileOutsiderOutcomeTenderV1(tenderInput());
}

function sourceReference(label, overrides = {}) {
  return {
    transactionSurfaceRefHash: h(`surface-${label}`),
    sourceArtifactHash: h(`artifact-${label}`),
    sourceRevisionHash: h(`revision-${label}`),
    sourceRecordHash: h(`record-${label}`),
    sourceReplayReceiptHash: null,
    rightsReviewRefHash: null,
    privacyReviewRefHash: null,
    resourceOwnerAuthorityRefHash: null,
    contactabilityEvidenceRefHash: null,
    capacityEvidenceRefHash: null,
    providerPatternProjectionHash: null,
    networkIntakeManifestHash: null,
    networkNodeConformanceHash: null,
    federatedHandoffHash: null,
    standingCapacityGrantHash: null,
    ...overrides,
  };
}

function candidateSource(tenderRecord, kind, label, overrides = {}) {
  const requirementId = kind === "RESOURCE"
    ? tenderRecord.resourceRequirements.items[0].resourceRequirementId
    : kind === "EVIDENCE"
      ? tenderRecord.evidenceRequirements.items[0].evidenceRequirementId
      : tenderRecord.recoveryRequirements.items[0].recoveryRequirementId;
  return {
    occurrenceId: alias("routeocc", label),
    requirementKind: kind,
    requirementId,
    routeKind: "OFFICIAL_API",
    observedAt: "2026-09-02T12:01:00.000Z",
    validUntil: "2026-09-02T12:14:00.000Z",
    sourceReference: sourceReference(label),
    lifecycle: { revision: 0, predecessorCandidateHash: null,
      supersedesCandidateHash: null, revokedAt: null, revocationRefHash: null },
    ...overrides,
  };
}

function completeSources(tenderRecord) {
  return [candidateSource(tenderRecord, "RESOURCE", "resource"),
    candidateSource(tenderRecord, "EVIDENCE", "evidence"),
    candidateSource(tenderRecord, "RECOVERY", "recovery")];
}

test("builds a strict requirement-scoped discovered reference, never capacity",
  () => {
    const t = tender();
    const source = { tender: t,
      candidateSource: candidateSource(t, "RESOURCE", "one") };
    const candidate = createOutcomeResourceRouteCandidateV1(source);
    const checked = verifyOutcomeResourceRouteCandidateV1(candidate, {
      source, expectedCandidateHash: candidate.candidateHash,
    });

    assert.equal(candidate.schema,
      OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS.routeCandidate);
    assert.equal(candidate.tenderBinding.tenderHash, t.tenderHash);
    assert.equal(candidate.tenderBinding.typedGraphHash, t.typedGraph.typedGraphHash);
    assert.equal(candidate.requirementBinding.requirementId,
      t.resourceRequirements.items[0].resourceRequirementId);
    assert.equal(candidate.discoveryState.state, "DISCOVERED_REFERENCE");
    assert.equal(candidate.discoveryState.contactable, false);
    assert.equal(candidate.discoveryState.authorized, false);
    assert.equal(candidate.discoveryState.capacityAvailable, false);
    assert.equal(candidate.discoveryState.rightsState, "UNRESOLVED");
    assert.equal(candidate.sourceReference.sourceObjectReplayed, false);
    assert.equal(candidate.identityBoundary.providerIdentityCreated, false);
    assert.equal(candidate.identityBoundary.ipDeviceOrModelIdentityUsed, false);
    assert.equal(candidate.decision, "HOLD");
    assert.equal(candidate.authority, "NONE");
    assert.equal(Object.isFrozen(candidate), true);
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.candidateRecordRederivedFromInput, true);
    assert.equal(checked.externalSourceReplayVerified, false);
    assert.equal(checked.discoveredReferenceOnly, true);
    assert.equal(checked.contactable, false);
  });

test("all six existing transaction-surface route kinds remain references only", () => {
  const t = tender();
  for (let index = 0; index < OUTSIDER_OUTCOME_RESOURCE_ROUTE_KINDS.length;
    index += 1) {
    const routeKind = OUTSIDER_OUTCOME_RESOURCE_ROUTE_KINDS[index];
    const source = candidateSource(t, "RESOURCE", `kind-${index}`, {
      routeKind,
      sourceReference: sourceReference(`kind-${index}`, {
        standingCapacityGrantHash: routeKind === "STANDING_CAPACITY_GRANT"
          ? h("standing-grant") : null,
      }),
    });
    const record = createOutcomeResourceRouteCandidateV1({ tender: t,
      candidateSource: source });
    assert.equal(record.routeKind, routeKind);
    assert.equal(record.discoveryState.state, "DISCOVERED_REFERENCE");
    assert.equal(record.discoveryState.contactable, false);
    assert.equal(record.discoveryState.authorized, false);
    assert.equal(record.discoveryState.capacityAvailable, false);
  }
});

test("foundation, review, contactability, and capacity hashes cannot launder proof",
  () => {
    const t = tender();
    const referenced = sourceReference("all-foundation-refs", {
      sourceReplayReceiptHash: h("source-replay-receipt"),
      rightsReviewRefHash: h("rights-review"),
      privacyReviewRefHash: h("privacy-review"),
      resourceOwnerAuthorityRefHash: h("owner-authority"),
      contactabilityEvidenceRefHash: h("contactability"),
      capacityEvidenceRefHash: h("capacity"),
      providerPatternProjectionHash: h("provider-pattern"),
      networkIntakeManifestHash: h("network-intake"),
      networkNodeConformanceHash: h("node-conformance"),
      federatedHandoffHash: h("handoff"),
      standingCapacityGrantHash: h("standing-capacity"),
    });
    const record = createOutcomeResourceRouteCandidateV1({ tender: t,
      candidateSource: candidateSource(t, "RESOURCE", "all-refs", {
        routeKind: "STANDING_CAPACITY_GRANT", sourceReference: referenced,
      }) });
    assert.equal(record.sourceReference.sourceReplayReceiptHash,
      h("source-replay-receipt"));
    assert.equal(record.sourceReference.sourceObjectReplayed, false);
    assert.equal(record.sourceReference.referencePresenceEstablishesRights, false);
    assert.equal(record.sourceReference.referencePresenceEstablishesPrivacy, false);
    assert.equal(record.sourceReference.referencePresenceEstablishesOwnerAuthority,
      false);
    assert.equal(record.sourceReference.referencePresenceEstablishesContactability,
      false);
    assert.equal(record.sourceReference.referencePresenceEstablishesCapacity, false);
    assert.equal(record.sourceReference.opaqueReferencePreimagePrivacyVerified, false);
    assert.equal(record.discoveryState.rightsState, "UNRESOLVED");
    assert.equal(record.discoveryState.privacyState, "UNRESOLVED");
    assert.equal(record.discoveryState.authorized, false);
    assert.equal(record.discoveryState.capacityAvailable, false);
  });

test("complete current reference coverage creates deterministic HOLD fanout, not send",
  () => {
    const t = tender();
    const source = { tender: t, asOf: "2026-09-02T12:05:00.000Z",
      candidateSources: completeSources(t) };
    const snapshot = createOutcomeResourceRouteDiscoverySnapshotV1(source);
    const checked = verifyOutcomeResourceRouteDiscoverySnapshotV1(snapshot, {
      source, expectedSnapshotHash: snapshot.snapshotHash,
    });

    assert.equal(snapshot.occurrenceCensus.totalOccurrenceCount, 3);
    assert.equal(snapshot.occurrenceCensus.uniqueRouteObjectCount, 3);
    assert.equal(snapshot.fanoutPlan.unavailableMandatoryRequirementClassCount, 0);
    assert.equal(snapshot.fanoutPlan
      .allMandatoryRequirementClassesHaveCurrentRouteReference, true);
    assert.equal(snapshot.result, "CURRENT_DISCOVERED_REFERENCE_FANOUT_PLAN_HOLD");
    assert.equal(snapshot.disposition,
      "HOLD_FOR_EXTERNAL_RIGHTS_AUTHORITY_CONTACTABILITY_AND_CAPACITY_REPLAY");
    assert.equal(snapshot.fanoutPlan.contactPerformed, false);
    assert.equal(snapshot.fanoutPlan.tenderSent, false);
    assert.equal(snapshot.discoveryBoundary.rightsAndPrivacyRemainUnresolved, true);
    assert.equal(snapshot.discoveryBoundary.resourceOwnerAuthorityRemainsUnresolved,
      true);
    assert.equal(snapshot.discoveryBoundary.thisPureModuleStaffInterventionCount, 0);
    assert.equal(snapshot.discoveryBoundary.externalRouteZeroInternalOpsEstablished,
      false);
    assert.equal(snapshot.decision, "HOLD");
    assert.equal(snapshot.authority, "NONE");
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.deterministicZeroHumanReferencePlanDerived, true);
    assert.equal(checked.externalRouteZeroInternalOpsEstablished, false);
  });

test("candidate input poisoning, URLs, contact data, secrets, and extra fields fail closed",
  () => {
    const t = tender();
    for (const [field, value] of [["url", "https://provider.invalid"],
      ["email", "person@example.invalid"], ["password", "secret"],
      ["providerIdentity", h("provider")], ["globalScore", 100]]) {
      const poisoned = candidateSource(t, "RESOURCE", `poison-${field}`);
      poisoned[field] = value;
      assert.throws(() => createOutcomeResourceRouteCandidateV1({ tender: t,
        candidateSource: poisoned }), /CANDIDATE_SOURCE_FIELDS_INVALID/u);
    }
    const poisonedReference = candidateSource(t, "RESOURCE", "poison-ref");
    poisonedReference.sourceReference.url = "https://provider.invalid";
    assert.throws(() => createOutcomeResourceRouteCandidateV1({ tender: t,
      candidateSource: poisonedReference }), /SOURCE_REFERENCE_FIELDS_INVALID/u);
  });

test("wrong-tender requirement splice and output-only verifier forgery fail", () => {
  const t = tender();
  const source = { tender: t,
    candidateSource: candidateSource(t, "RESOURCE", "scope") };
  const candidate = createOutcomeResourceRouteCandidateV1(source);
  const forged = clone(candidate);
  forged.tenderBinding.attemptHash = h("unrelated-attempt");
  const verification = verifyOutcomeResourceRouteCandidateV1(forged, {
    source, expectedCandidateHash: candidate.candidateHash,
  });
  assert.equal(verification.ok, false);
  assert.match(verification.error, /CANDIDATE_SOURCE_REBUILD_MISMATCH/u);

  const wrongRequirement = candidateSource(t, "RESOURCE", "wrong");
  wrongRequirement.requirementId = alias("resource", "not-in-tender");
  assert.throws(() => createOutcomeResourceRouteCandidateV1({ tender: t,
    candidateSource: wrongRequirement }), /REQUIREMENT_NOT_EXACTLY_PRESENT/u);
});

test("repeated observations are censused but deduplicated as one route object", () => {
  const t = tender();
  const firstSource = candidateSource(t, "RESOURCE", "repeat-1");
  const secondSource = candidateSource(t, "RESOURCE", "repeat-2", {
    sourceReference: sourceReference("repeat-2", {
      transactionSurfaceRefHash: firstSource.sourceReference.transactionSurfaceRefHash,
    }),
  });
  const snapshot = createOutcomeResourceRouteDiscoverySnapshotV1({ tender: t,
    asOf: "2026-09-02T12:05:00.000Z",
    candidateSources: [firstSource, secondSource] });
  assert.equal(snapshot.occurrenceCensus.totalOccurrenceCount, 2);
  assert.equal(snapshot.occurrenceCensus.uniqueRouteObjectCount, 1);
  assert.equal(snapshot.occurrenceCensus.repeatedObjectOccurrenceCount, 1);
  assert.equal(snapshot.routeObjects[0].occurrenceCount, 2);
  assert.equal(snapshot.routeObjects[0].objectIsProviderIdentity, false);
  assert.equal(snapshot.routeObjects[0].occurrenceMultiplicityUsedForRanking, false);
});

test("exact duplicate candidate and reused occurrence id are rejected", () => {
  const t = tender();
  const one = candidateSource(t, "RESOURCE", "duplicate");
  assert.throws(() => createOutcomeResourceRouteDiscoverySnapshotV1({ tender: t,
    asOf: "2026-09-02T12:05:00.000Z", candidateSources: [one, clone(one)] }),
  /DUPLICATE_CANDIDATE_OCCURRENCE/u);

  const two = candidateSource(t, "EVIDENCE", "other");
  two.occurrenceId = one.occurrenceId;
  assert.throws(() => createOutcomeResourceRouteDiscoverySnapshotV1({ tender: t,
    asOf: "2026-09-02T12:05:00.000Z", candidateSources: [one, two] }),
  /DUPLICATE_OCCURRENCE_ID/u);
});

test("append-only supersession keeps occurrence history and only descendant current",
  () => {
    const t = tender();
    const firstSource = candidateSource(t, "RESOURCE", "lifecycle-0", {
      validUntil: "2026-09-02T12:10:00.000Z",
    });
    const first = createOutcomeResourceRouteCandidateV1({ tender: t,
      candidateSource: firstSource });
    const secondSource = candidateSource(t, "RESOURCE", "lifecycle-1", {
      observedAt: "2026-09-02T12:04:00.000Z",
      sourceReference: sourceReference("lifecycle-1", {
        transactionSurfaceRefHash: firstSource.sourceReference.transactionSurfaceRefHash,
      }),
      lifecycle: { revision: 1, predecessorCandidateHash: first.candidateHash,
        supersedesCandidateHash: first.candidateHash, revokedAt: null,
        revocationRefHash: null },
    });
    const snapshot = createOutcomeResourceRouteDiscoverySnapshotV1({ tender: t,
      asOf: "2026-09-02T12:05:00.000Z",
      candidateSources: [secondSource, firstSource] });
    assert.equal(snapshot.occurrenceCensus.totalOccurrenceCount, 2);
    assert.equal(snapshot.occurrenceCensus.uniqueRouteObjectCount, 1);
    assert.equal(snapshot.occurrenceCensus.supersededOccurrenceCount, 1);
    assert.equal(snapshot.occurrenceCensus.currentOccurrenceCount, 1);
    const second = snapshot.candidateOccurrences.find((row) => (
      row.lifecycle.revision === 1));
    assert.equal(snapshot.routeObjects[0].currentCandidateHash, second.candidateHash);
  });

test("lifecycle predecessor splice across route objects is rejected", () => {
  const t = tender();
  const firstSource = candidateSource(t, "RESOURCE", "splice-0");
  const first = createOutcomeResourceRouteCandidateV1({ tender: t,
    candidateSource: firstSource });
  const child = candidateSource(t, "RESOURCE", "splice-1", {
    observedAt: "2026-09-02T12:04:00.000Z",
    lifecycle: { revision: 1, predecessorCandidateHash: first.candidateHash,
      supersedesCandidateHash: first.candidateHash, revokedAt: null,
      revocationRefHash: null },
  });
  assert.throws(() => createOutcomeResourceRouteDiscoverySnapshotV1({ tender: t,
    asOf: "2026-09-02T12:05:00.000Z", candidateSources: [firstSource, child] }),
  /LIFECYCLE_PREDECESSOR_SCOPE_OR_REVISION_SPLICE/u);
});

test("a descendant cannot silently resurrect an already revoked route", () => {
  const t = tender();
  const revokedSource = candidateSource(t, "RESOURCE", "revoked-parent", {
    lifecycle: { revision: 0, predecessorCandidateHash: null,
      supersedesCandidateHash: null, revokedAt: "2026-09-02T12:03:00.000Z",
      revocationRefHash: h("parent-revocation") },
  });
  const revoked = createOutcomeResourceRouteCandidateV1({ tender: t,
    candidateSource: revokedSource });
  const descendant = candidateSource(t, "RESOURCE", "resurrection", {
    observedAt: "2026-09-02T12:04:00.000Z",
    sourceReference: sourceReference("resurrection", {
      transactionSurfaceRefHash:
        revokedSource.sourceReference.transactionSurfaceRefHash,
    }),
    lifecycle: { revision: 1, predecessorCandidateHash: revoked.candidateHash,
      supersedesCandidateHash: revoked.candidateHash, revokedAt: null,
      revocationRefHash: null },
  });
  assert.throws(() => createOutcomeResourceRouteDiscoverySnapshotV1({ tender: t,
    asOf: "2026-09-02T12:05:00.000Z",
    candidateSources: [revokedSource, descendant] }),
  /REVOKED_ROUTE_CANNOT_BE_RESURRECTED_BY_DESCENDANT/u);
});

test("expired and revoked references are excluded and mandatory gaps decline", () => {
  const t = tender();
  const expired = candidateSource(t, "RESOURCE", "expired", {
    validUntil: "2026-09-02T12:03:00.000Z",
  });
  const revoked = candidateSource(t, "EVIDENCE", "revoked", {
    lifecycle: { revision: 0, predecessorCandidateHash: null,
      supersedesCandidateHash: null, revokedAt: "2026-09-02T12:04:00.000Z",
      revocationRefHash: h("revocation") },
  });
  const snapshot = createOutcomeResourceRouteDiscoverySnapshotV1({ tender: t,
    asOf: "2026-09-02T12:05:00.000Z", candidateSources: [expired, revoked] });
  assert.equal(snapshot.occurrenceCensus.expiredOccurrenceCount, 1);
  assert.equal(snapshot.occurrenceCensus.revokedOccurrenceCount, 1);
  assert.equal(snapshot.occurrenceCensus.currentOccurrenceCount, 0);
  assert.equal(snapshot.fanoutPlan.unavailableMandatoryRequirementClassCount, 3);
  assert.equal(snapshot.result, "MANDATORY_ROUTE_CLASS_UNAVAILABLE_DECLINE");
  assert.equal(snapshot.disposition, "DECLINE_NOT_HUMAN_QUEUE");
  assert.equal(snapshot.discoveryBoundary.humanQueueCreated, false);
});

test("empty discovery result declines immediately without internal human fallback", () => {
  const t = tender();
  const snapshot = createOutcomeResourceRouteDiscoverySnapshotV1({ tender: t,
    asOf: "2026-09-02T12:05:00.000Z", candidateSources: [] });
  assert.equal(snapshot.fanoutPlan.unavailableMandatoryRequirementClassCount, 3);
  assert.equal(snapshot.disposition, "DECLINE_NOT_HUMAN_QUEUE");
  assert.equal(snapshot.fanoutPlan.thisPureModuleStaffInterventionCount, 0);
  assert.equal(snapshot.fanoutPlan.externalRouteZeroInternalOpsEstablished, false);
  assert.equal(snapshot.discoveryBoundary.humanQueueCreated, false);
  assert.deepEqual(snapshot.boundary,
    OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_BOUNDARY);
});

test("Sybil-looking distinct route objects remain distinct without identity inference",
  () => {
    const t = tender();
    const alpha = candidateSource(t, "RESOURCE", "sybil-alpha");
    const beta = candidateSource(t, "RESOURCE", "sybil-beta");
    const snapshot = createOutcomeResourceRouteDiscoverySnapshotV1({ tender: t,
      asOf: "2026-09-02T12:05:00.000Z", candidateSources: [alpha, beta] });
    assert.equal(snapshot.occurrenceCensus.totalOccurrenceCount, 2);
    assert.equal(snapshot.occurrenceCensus.uniqueRouteObjectCount, 2);
    assert.equal(snapshot.occurrenceCensus.objectMultiplicityUsedAsProviderIdentity,
      false);
    assert.equal(snapshot.occurrenceCensus.objectMultiplicityUsedForRanking, false);
    assert.equal(snapshot.routeObjects.every((row) => row.objectIsProviderIdentity
      === false), true);
    assert.equal(snapshot.boundary.identityInferencePerformed, false);
    assert.equal(snapshot.boundary.globalScoreCreatedOrUsed, false);
  });

test("snapshot hash and selection are independent of source array ordering", () => {
  const t = tender();
  const sources = completeSources(t);
  const left = createOutcomeResourceRouteDiscoverySnapshotV1({ tender: t,
    asOf: "2026-09-02T12:05:00.000Z", candidateSources: sources });
  const right = createOutcomeResourceRouteDiscoverySnapshotV1({ tender: t,
    asOf: "2026-09-02T12:05:00.000Z",
    candidateSources: clone(sources).reverse() });
  assert.equal(left.snapshotHash, right.snapshotHash);
  assert.deepEqual(left.fanoutPlan, right.fanoutPlan);
});

test("source-rebuild verification rejects a snapshot splice and wrong expected hash",
  () => {
    const t = tender();
    const source = { tender: t, asOf: "2026-09-02T12:05:00.000Z",
      candidateSources: completeSources(t) };
    const snapshot = createOutcomeResourceRouteDiscoverySnapshotV1(source);
    const forged = clone(snapshot);
    forged.fanoutPlan.requirements[0].capacityVerified = true;
    assert.equal(verifyOutcomeResourceRouteDiscoverySnapshotV1(forged, {
      source, expectedSnapshotHash: snapshot.snapshotHash,
    }).ok, false);
    assert.equal(verifyOutcomeResourceRouteDiscoverySnapshotV1(snapshot, {
      source, expectedSnapshotHash: h("wrong-snapshot"),
    }).ok, false);
    assert.equal(verifyOutcomeResourceRouteDiscoverySnapshotV1(snapshot, {
      source: { ...source, asOf: "2026-09-02T12:06:00.000Z" },
      expectedSnapshotHash: snapshot.snapshotHash,
    }).ok, false);
  });

test("captured intrinsics keep discovery deterministic after prototype poisoning", () => {
  const t = tender();
  const source = { tender: t, asOf: "2026-09-02T12:05:00.000Z",
    candidateSources: completeSources(t) };
  const expected = createOutcomeResourceRouteDiscoverySnapshotV1(source);
  const originalArraySort = Array.prototype.sort;
  const originalMapGet = Map.prototype.get;
  const originalMapHas = Map.prototype.has;
  const originalMapSet = Map.prototype.set;
  const originalMapEntries = Map.prototype.entries;
  const originalSetAdd = Set.prototype.add;
  const originalSetHas = Set.prototype.has;
  try {
    Array.prototype.sort = () => { throw new Error("POISONED_ARRAY_SORT"); };
    Map.prototype.get = () => { throw new Error("POISONED_MAP_GET"); };
    Map.prototype.has = () => { throw new Error("POISONED_MAP_HAS"); };
    Map.prototype.set = () => { throw new Error("POISONED_MAP_SET"); };
    Map.prototype.entries = () => { throw new Error("POISONED_MAP_ENTRIES"); };
    Set.prototype.add = () => { throw new Error("POISONED_SET_ADD"); };
    Set.prototype.has = () => { throw new Error("POISONED_SET_HAS"); };
    const actual = createOutcomeResourceRouteDiscoverySnapshotV1(source);
    assert.equal(actual.snapshotHash, expected.snapshotHash);
    assert.equal(verifyOutcomeResourceRouteDiscoverySnapshotV1(actual, {
      source, expectedSnapshotHash: expected.snapshotHash,
    }).ok, true);
  } finally {
    Array.prototype.sort = originalArraySort;
    Map.prototype.get = originalMapGet;
    Map.prototype.has = originalMapHas;
    Map.prototype.set = originalMapSet;
    Map.prototype.entries = originalMapEntries;
    Set.prototype.add = originalSetAdd;
    Set.prototype.has = originalSetHas;
  }
});

test("public aliases are exact and standing grant route requires an explicit hash", () => {
  assert.equal(createRouteCandidateV1, createOutcomeResourceRouteCandidateV1);
  assert.equal(verifyRouteCandidateV1, verifyOutcomeResourceRouteCandidateV1);
  assert.equal(createDiscoverySnapshotV1,
    createOutcomeResourceRouteDiscoverySnapshotV1);
  assert.equal(verifyDiscoverySnapshotV1,
    verifyOutcomeResourceRouteDiscoverySnapshotV1);
  const t = tender();
  const source = candidateSource(t, "RESOURCE", "standing", {
    routeKind: "STANDING_CAPACITY_GRANT",
  });
  assert.throws(() => createOutcomeResourceRouteCandidateV1({ tender: t,
    candidateSource: source }), /STANDING_CAPACITY_GRANT_REFERENCE_REQUIRED/u);
});
