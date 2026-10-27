import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_BOUNDARY,
  OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_LIMITS,
  createRouteDiscoveryCollectorSourcePinV1,
  createRouteDiscoveryCollectorV1,
  runRouteDiscoveryCollectorV1,
  verifyRouteDiscoveryCollectorV1,
} from "../src/outsider-route-discovery-collector-v1.js";
import { createOutcomeResourceRouteDiscoverySnapshotV1 }
  from "../src/outsider-outcome-resource-route-discovery-v1.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";
import {
  createTransactionSurfaceAdapterContractSourcePinV1,
  createTransactionSurfaceAdapterContractV1,
} from "../src/outsider-transaction-surface-adapter-contract-v1.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;

function containsOwnKey(value, searchedKey) {
  if (value === null || typeof value !== "object") return false;
  if (Object.hasOwn(value, searchedKey)) return true;
  const values = Object.values(value);
  for (let index = 0; index < values.length; index += 1) {
    if (containsOwnKey(values[index], searchedKey)) return true;
  }
  return false;
}

function mutable(value) {
  if (Array.isArray(value)) return value.map(mutable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(
      ([key, item]) => [key, mutable(item)]));
  }
  return value;
}

function tender(label = "collector") {
  const evidenceId = alias("evidence", `${label}:evidence`);
  return compileOutsiderOutcomeTenderV1({
    tenderId: alias("tender", label),
    compiledAt: "2026-09-03T12:00:00.000Z",
    lineage: { revision: 0, predecessorTenderHash: null,
      supersedesTenderHash: null },
    workOrderHash: h(`${label}:work-order`),
    typedGraph: {
      principalEpoch: { principalRefHash: h(`${label}:principal`),
        epochRefHash: h(`${label}:epoch`),
        principalEpochProjectionHash: h(`${label}:principal-epoch`) },
      accountableDeployment: {
        deploymentLineageRefHash: h(`${label}:lineage`),
        deploymentRevisionHash: h(`${label}:deployment-revision`),
        accountableDeploymentSubjectHash: h(`${label}:deployment-subject`) },
      runtime: { runtimeInstanceRefHash: h(`${label}:runtime-ref`),
        runtimeInstanceHash: h(`${label}:runtime`) },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
        delegationEdgeHash: h(`${label}:delegation-edge`) },
      episode: { episodeHash: h(`${label}:episode`),
        networkCompleteEpisodeJoinHash: h(`${label}:episode-join`) },
      attempt: { attemptHash: h(`${label}:attempt`),
        attemptActorSubjectHash: h(`${label}:attempt-subject`) },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: h(`${label}:actor-envelope`),
      delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
      delegationEdgeHash: h(`${label}:delegation-edge`),
      authorityScopeRefHash: h(`${label}:authority-scope`),
      resourceOwnerAuthorizationRefHash: h(`${label}:owner-authorization`),
      rightsPrivacyPolicyRefHash: h(`${label}:rights-policy`),
    },
    exactOutcome: {
      outcomeKindCode: "GENERIC_OUTCOME_ESTABLISHED",
      outcomeSpecRefHash: h(`${label}:outcome-spec`),
      subjectRefHash: h(`${label}:subject`),
      acceptanceCriteriaRefHash: h(`${label}:acceptance-criteria`),
      conditions: [{ conditionId: alias("condition", `${label}:condition`),
        metricCode: "GENERIC_STATE", comparator: "EQUAL",
        target: { valueKind: "STATE_CODE", booleanValue: null,
          integerValue: null, stateCode: "COMPLETE", unitCode: null },
        observationWindowMs: 0,
        conditionRefHash: h(`${label}:condition-ref`), mandatory: true }],
      deadline: "2026-09-04T12:00:00.000Z",
    },
    formationDeadline: "2026-09-03T12:15:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: alias("resource", `${label}:primary`),
      resourceClassCode: "GENERIC_PRIMARY_RESOURCE",
      capabilityRefHash: h(`${label}:capability`), quantity: 1,
      unitCode: "RESOURCE", regionRefHash: h(`${label}:region`),
      requiredBy: "2026-09-04T10:00:00.000Z", mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: "GENERIC_INDEPENDENT_EVIDENCE",
      evidenceRequirementRefHash: h(`${label}:evidence-ref`),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "AT_COMPLETION",
      dueBy: "2026-09-04T12:00:00.000Z", mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: alias("recovery", `${label}:recovery`),
      triggerRefHash: h(`${label}:trigger`),
      recoveryOutcomeRefHash: h(`${label}:recovery-outcome`),
      resourceClassCode: "GENERIC_RECOVERY_RESOURCE", maximumAttempts: 2,
      completionDeadline: "2026-09-04T12:00:00.000Z",
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED", mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h(`${label}:consequence`),
      consequenceClassCode: "BOUNDED_GENERIC_FAILURE",
      measureCode: "MAXIMUM_DELAY", maximumValue: 120, unitCode: "MINUTE",
      affectedChannelRefHashes: [h(`${label}:channel`)],
      irreversibleHarmAllowed: false, unboundedConsequenceAllowed: false,
    },
    zeroInternalOps: {
      outsiderStaffInterventionsAllowed: 0,
      internalManualSourcingAllowed: false,
      internalManualCoordinationAllowed: false,
      internalManualVerificationAllowed: false,
      internalManualRecoveryAllowed: false,
      humanQueueFallbackAllowed: false,
      failureDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    },
  });
}

function adapterSource(routeSupported = true) {
  const transportRef = h("collector:transport-profile");
  const declaration = (capability, supported) => ({
    capability,
    supported,
    transportProfileRefHashes: supported ? [transportRef] : [],
    maximumSideEffectsPerTender: 0,
  });
  return {
    observedAt: "2026-09-03T11:59:00.000Z",
    privateAdapterInstanceRefHash: h("collector:adapter-instance"),
    privateProjectionNonce: h("collector:adapter-nonce"),
    adapterClosure: {
      adapterImplementationHash: h("collector:adapter-implementation"),
      adapterPackageProfileHash: h("collector:adapter-package"),
    },
    supportedTransportProfiles: [{
      transportProfileRefHash: transportRef,
      transportFamily: "OFFICIAL_PROVIDER_API",
      profileVersion: "1.0.0",
      requestSchemaHash: h("collector:request-schema"),
      responseSchemaHash: h("collector:response-schema"),
      lifecycleSchemaHash: h("collector:lifecycle-schema"),
      strictFiniteResponseGrammarRequired: true,
      naturalLanguageResponseAccepted: false,
      serverAcknowledgementIsAcceptance: false,
      deliveryReceiptIsAcceptance: false,
      arbitraryUrlExecutionPermitted: false,
      genericBrowserDriverPermitted: false,
    }],
    inputContracts: {
      permission: { inputSchemaHash: h("collector:permission-input"),
        replayVerifierImplementationHash: h("collector:permission-verifier"),
        lifecycleHeadSchemaHash: h("collector:permission-head"),
        appendOnlyLifecycleRequired: true,
        currentGrantRequiredAtEachEffect: true, revocationFailClosed: true,
        callerDeclarationAloneSufficient: false },
      credentialLease: { inputSchemaHash: h("collector:lease-input"),
        replayVerifierImplementationHash: h("collector:lease-verifier"),
        leaseReceiptSchemaHash: h("collector:lease-receipt"),
        finiteExpiryRequired: true, exactScopeRequired: true,
        revalidationAtEachCredentialedEffect: true,
        rawCredentialMaterialProjected: false,
        callerDeclarationAloneSufficient: false },
      rights: { inputSchemaHash: h("collector:rights-input"),
        replayVerifierImplementationHash: h("collector:rights-verifier"),
        reviewReceiptSchemaHash: h("collector:rights-receipt"),
        sourceRevisionPinRequired: true, purposeAndJurisdictionBound: true,
        revocationReplayRequired: true,
        callerDeclarationAloneSufficient: false },
      privacy: { inputSchemaHash: h("collector:privacy-input"),
        replayVerifierImplementationHash: h("collector:privacy-verifier"),
        reviewReceiptSchemaHash: h("collector:privacy-receipt"),
        dataMinimizationRequired: true,
        privateIdentifierProjectionAllowed: false,
        rawSourceProjectionAllowed: false,
        callerDeclarationAloneSufficient: false },
    },
    oneUseControls: {
      oneTenderScopeRequired: true, idempotencyKeyHashRequired: true,
      idempotencyObservedBeforeEffectRequired: true, nonceHashRequired: true,
      nonceReservationBeforeEffectRequired: true,
      nonceSingleConsumptionRequired: true, consumedNonceReplayRejected: true,
      exactFormationDeadlineRequired: true,
      newFormationEffectsAfterDeadlineForbidden: true,
      lateResponseCannotFormCommitment: true,
      reservationRequiresExplicitBoundResponse: true,
      cancellationRequiresReservationBinding: true,
      revocationRequiresPermissionLifecycleBinding: true,
      cancellationAndRevocationIdempotent: true,
      terminalStateCannotReopen: true, standingCapacityInferred: false,
    },
    capabilityDeclarations: [
      declaration("PERMISSION_REVOCATION", false),
      declaration("RESERVATION_CANCELLATION", false),
      declaration("CAPACITY_RESERVATION_REQUEST", false),
      declaration("STRICT_RESPONSE_OBSERVATION", false),
      declaration("ONE_USE_TENDER_DELIVERY", false),
      declaration("STRICT_QUOTE_OBSERVATION", false),
      declaration("STRUCTURED_QUOTE_REQUEST", false),
      declaration("PERMITTED_ROUTE_DISCOVERY", routeSupported),
    ],
    maximumAggregateSideEffectsPerTender: 0,
  };
}

function adapterReplay(routeSupported = true) {
  const source = adapterSource(routeSupported);
  const record = createTransactionSurfaceAdapterContractV1(source);
  const pin = createTransactionSurfaceAdapterContractSourcePinV1(source);
  return { record, source, expectedSourceHash: pin.sourceHash,
    expectedContractHash: record.contractHash };
}

function collectorProfile() {
  return {
    collectorImplementationHash: h("collector:implementation"),
    adapterImplementationHash: h("collector:adapter-implementation"),
    transportProfileRefHash: h("collector:transport-profile"),
    capability: "PERMITTED_ROUTE_DISCOVERY",
    maximumAttemptOccurrences: 32,
    maximumObservationsPerAttempt: 4,
    maximumSideEffectsPerAttempt: 0,
  };
}

function requirementId(tenderRecord, kind) {
  if (kind === "RESOURCE") {
    return tenderRecord.resourceRequirements.items[0].resourceRequirementId;
  }
  if (kind === "EVIDENCE") {
    return tenderRecord.evidenceRequirements.items[0].evidenceRequirementId;
  }
  return tenderRecord.recoveryRequirements.items[0].recoveryRequirementId;
}

function request(tenderRecord, kind, label, overrides = {}) {
  return {
    collectorOccurrenceId: alias("collectorocc", label),
    requirementKind: kind,
    requirementId: requirementId(tenderRecord, kind),
    transportProfileRefHash: h("collector:transport-profile"),
    sourceArtifactHash: h(`collector:artifact:${kind}`),
    sourceRevisionHash: h(`collector:revision:${kind}`),
    sourceReplayReceiptHash: h(`collector:source-replay:${kind}`),
    permissionReplayRefHash: h(`collector:permission:${kind}`),
    credentialLeaseReplayRefHash: h(`collector:lease:${kind}`),
    rightsReviewRefHash: h(`collector:rights:${kind}`),
    privacyReviewRefHash: h(`collector:privacy:${kind}`),
    externalTrustRefHash: h(`collector:external-trust:${kind}`),
    requestedAt: "2026-09-03T12:01:00.000Z",
    logicalDeadline: "2026-09-03T12:05:00.000Z",
    routeValidUntil: "2026-09-03T12:14:00.000Z",
    idempotencyKeyHash: h(`collector:idempotency:${kind}`),
    nonceHash: h(`collector:nonce:${label}`),
    maximumObservationCount: 2,
    ...overrides,
  };
}

function plan(tenderRecord, requests, overrides = {}) {
  return { tender: tenderRecord, asOf: "2026-09-03T12:10:00.000Z",
    adapterReplay: adapterReplay(), collectorProfile: collectorProfile(),
    collectionRequests: requests,
    privateProjectionNonce: h("collector:projection-nonce"), ...overrides };
}

function routeObservationSource(attempt, label, surfaceHash) {
  const requestSource = attempt.request;
  return {
    occurrenceId: alias("routeocc", label),
    requirementKind: requestSource.requirementKind,
    requirementId: requestSource.requirementId,
    routeKind: "OFFICIAL_API",
    observedAt: "2026-09-03T12:02:00.000Z",
    validUntil: requestSource.routeValidUntil,
    sourceReference: {
      transactionSurfaceRefHash: surfaceHash ?? h(`collector:surface:${label}`),
      sourceArtifactHash: requestSource.sourceArtifactHash,
      sourceRevisionHash: requestSource.sourceRevisionHash,
      sourceRecordHash: h(`collector:source-record:${label}`),
      sourceReplayReceiptHash: requestSource.sourceReplayReceiptHash,
      rightsReviewRefHash: requestSource.rightsReviewRefHash,
      privacyReviewRefHash: requestSource.privacyReviewRefHash,
      resourceOwnerAuthorityRefHash: null,
      contactabilityEvidenceRefHash: null,
      capacityEvidenceRefHash: null,
      providerPatternProjectionHash: null,
      networkIntakeManifestHash: null,
      networkNodeConformanceHash: null,
      federatedHandoffHash: null,
      standingCapacityGrantHash: null,
    },
    lifecycle: { revision: 0, predecessorCandidateHash: null,
      supersedesCandidateHash: null, revokedAt: null,
      revocationRefHash: null },
  };
}

function declareSuccess(source, index, label, surfaceHash) {
  const attempt = source.collectorAttempts[index];
  attempt.sourceDeclaredCollectorInvoked = true;
  attempt.sourceDeclarationStructurallyAccepted = true;
  attempt.sourceDeclaredOutcome = "SUCCEEDED";
  attempt.failureCode = null;
  attempt.sourceDeclaredCompletedAt = "2026-09-03T12:03:00.000Z";
  attempt.sourceDeclaredCompletionTimeBasis
    = "COLLECTOR_DECLARATION_NO_TRUSTED_TIME";
  attempt.sourceDeclaredSideEffectCount = 0;
  attempt.sourceDeclaredSideEffectWithinLimit = true;
  attempt.observationSources = [routeObservationSource(attempt, label,
    surfaceHash)];
}

function declareSuccessCount(source, index, label, count) {
  const attempt = source.collectorAttempts[index];
  attempt.sourceDeclaredCollectorInvoked = true;
  attempt.sourceDeclarationStructurallyAccepted = true;
  attempt.sourceDeclaredOutcome = "SUCCEEDED";
  attempt.failureCode = null;
  attempt.sourceDeclaredCompletedAt = "2026-09-03T12:03:00.000Z";
  attempt.sourceDeclaredCompletionTimeBasis
    = "COLLECTOR_DECLARATION_NO_TRUSTED_TIME";
  attempt.sourceDeclaredSideEffectCount = 0;
  attempt.sourceDeclaredSideEffectWithinLimit = true;
  attempt.observationSources = [];
  const sharedSurfaceHash = h(`${label}:shared-surface`);
  for (let observationIndex = 0; observationIndex < count;
    observationIndex += 1) {
    attempt.observationSources.push(routeObservationSource(attempt,
      `${label}-${observationIndex}`, sharedSurfaceHash));
  }
}

test("v1 never touches or invokes a supplied collector capability", async () => {
  const t = tender("no-execution");
  const requests = [request(t, "RESOURCE", "no-execution")];
  let applyTrapCount = 0;
  let getTrapCount = 0;
  let ownKeysTrapCount = 0;
  const hostileCapability = new Proxy(function collector() {}, {
    apply() { applyTrapCount += 1; throw new Error("must not invoke"); },
    get() { getTrapCount += 1; throw new Error("must not inspect"); },
    ownKeys() { ownKeysTrapCount += 1; throw new Error("must not inspect"); },
  });
  const source = await runRouteDiscoveryCollectorV1(
    plan(t, requests), hostileCapability);
  const record = createRouteDiscoveryCollectorV1(source);

  assert.equal(applyTrapCount, 0);
  assert.equal(getTrapCount, 0);
  assert.equal(ownKeysTrapCount, 0);
  assert.equal(source.actualCollectorCallbackInvocationCount, 0);
  assert.equal(record.actualCollectorCallbackInvocationCount, 0);
  assert.equal(record.actualCollectorInvoked, false);
  assert.equal(record.actualNetworkIoEstablished, false);
  assert.equal(record.recordClass,
    "SOURCE_SPECIFIC_ROUTE_COLLECTION_SOURCE_REPLAY_HOLD_ONLY");
  assert.equal(record.attemptCensus.actualCollectorInvocationOccurrenceCount, 0);
  assert.equal(record.collectorAttemptOccurrences[0].occurrence.failureCode,
    "EXECUTION_AUTHORITY_UNPROVEN");
  assert.equal(record.collectorAttemptOccurrences[0].occurrence
    .sourceDeclaredOutcome, "NOT_INVOKED");
  assert.equal(record.collectorAttemptOccurrences[0].occurrence
    .actualCollectorInvoked, false);
  assert.equal(record.decisionState, "HOLD");
});

test("caller-retained observations replay into existing route snapshot as declarations only",
  async () => {
    const t = tender("declarations");
    const planned = await runRouteDiscoveryCollectorV1(plan(t, [
      request(t, "RESOURCE", "declared-resource"),
      request(t, "EVIDENCE", "declared-evidence"),
      request(t, "RECOVERY", "declared-recovery"),
    ]), null);
    const source = mutable(planned);
    declareSuccess(source, 0, "declared-resource");
    declareSuccess(source, 1, "declared-evidence");
    declareSuccess(source, 2, "declared-recovery");
    const record = createRouteDiscoveryCollectorV1(source);
    const sourceHash = createRouteDiscoveryCollectorSourcePinV1(source);
    const checked = verifyRouteDiscoveryCollectorV1(record, {
      source, expectedSourceHash: sourceHash,
      expectedCollectorHash: record.collectorHash,
    });

    assert.equal(record.attemptCensus.totalAttemptOccurrenceCount, 3);
    assert.equal(record.attemptCensus.sourceDeclaredInvokedOccurrenceCount, 3);
    assert.equal(record.attemptCensus.sourceDeclaredSucceededOccurrenceCount, 3);
    assert.equal(record.attemptCensus.actualCollectorInvocationOccurrenceCount, 0);
    assert.equal(record.discoveryProjection.sourceDeclaredOccurrenceCensus
      .totalOccurrenceCount, 3);
    assert.equal(record.discoveryProjection
      .sourceDeclaredAllMandatoryRequirementsHaveCurrentRouteReference, true);
    assert.equal(record.tenderBinding.typedGraphHash, t.typedGraph.typedGraphHash);
    assert.equal(record.tenderBinding.principalEpochProjectionHash,
      t.typedGraph.principalEpoch.principalEpochProjectionHash);
    assert.equal(record.tenderBinding.accountableDeploymentSubjectHash,
      t.typedGraph.accountableDeployment.accountableDeploymentSubjectHash);
    assert.equal(record.tenderBinding.runtimeInstanceHash,
      t.typedGraph.runtime.runtimeInstanceHash);
    assert.equal(record.tenderBinding.delegationEdgeHash,
      t.typedGraph.delegation.delegationEdgeHash);
    assert.equal(record.tenderBinding.episodeHash, t.typedGraph.episode.episodeHash);
    assert.equal(record.tenderBinding.attemptHash, t.typedGraph.attempt.attemptHash);
    assert.equal(record.sourceDeclaredObservationsAreExternallyTrusted, false);
    assert.equal(record.permissionEstablished, false);
    assert.equal(record.credentialLeaseEstablished, false);
    assert.equal(record.rightsCleared, false);
    assert.equal(record.privacyCleared, false);
    assert.equal(record.externalTrustEstablished, false);
    assert.equal(record.contactabilityEstablished, false);
    assert.equal(record.resourceOwnerAuthorityEstablished, false);
    assert.equal(record.externalCapacityEstablished, false);
    assert.equal(record.zeroInternalOpsEstablished, false);
    assert.equal(record.actionAuthorized, false);
    assert.equal(record.priceEstablished, false);
    assert.equal(record.guaranteeEstablished, false);
    assert.equal(record.settlementPermitted, false);
    assert.equal(record.disposition, "CONTINUE_AUTOMATED_FORMATION_HOLD");
    assert.equal(record.decisionState, "HOLD");
    assert.equal(record.authority, "NONE");
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.sourceDeclaredObservationsAreExternallyTrusted, false);
    assert.equal(checked.actualCollectorCallbackInvocationCount, 0);
    assert.equal(checked.actualCollectorInvoked, false);
    assert.equal(checked.actualNetworkIoEstablished, false);
    assert.equal(checked.actionAuthorized, false);
    assert.ok(Object.isFrozen(record));
  });

test("public record and verification omit every private ref and unsalted derived handle",
  async () => {
    const t = tender("privacy-closure");
    const source = mutable(await runRouteDiscoveryCollectorV1(plan(t, [
      request(t, "RESOURCE", "privacy-closure"),
    ]), null));
    declareSuccess(source, 0, "privacy-closure-route");
    const record = createRouteDiscoveryCollectorV1(source);
    const sourceHash = createRouteDiscoveryCollectorSourcePinV1(source);
    const checked = verifyRouteDiscoveryCollectorV1(record, {
      source, expectedSourceHash: sourceHash,
      expectedCollectorHash: record.collectorHash,
    });
    assert.equal(checked.ok, true, checked.error);

    const attempt = source.collectorAttempts[0];
    const publicAttempt = record.collectorAttemptOccurrences[0];
    const privateObjectIdentity = {
      tenderHash: t.tenderHash,
      typedGraphHash: t.typedGraph.typedGraphHash,
      requirementKind: publicAttempt.requirementKind,
      requirementId: publicAttempt.requirementId,
      requirementObjectHash: publicAttempt.requirementObjectHash,
      collectorImplementationHash:
        source.collectorProfile.collectorImplementationHash,
      adapterImplementationHash:
        source.collectorProfile.adapterImplementationHash,
      transportProfileRefHash:
        source.collectorProfile.transportProfileRefHash,
      sourceArtifactHash: attempt.request.sourceArtifactHash,
      sourceRevisionHash: attempt.request.sourceRevisionHash,
      sourceReplayReceiptHash: attempt.request.sourceReplayReceiptHash,
      permissionReplayRefHash: attempt.request.permissionReplayRefHash,
      credentialLeaseReplayRefHash:
        attempt.request.credentialLeaseReplayRefHash,
      rightsReviewRefHash: attempt.request.rightsReviewRefHash,
      privacyReviewRefHash: attempt.request.privacyReviewRefHash,
      externalTrustRefHash: attempt.request.externalTrustRefHash,
      logicalDeadline: attempt.request.logicalDeadline,
      routeValidUntil: attempt.request.routeValidUntil,
      maximumObservationCount: attempt.request.maximumObservationCount,
      maximumSideEffectsPerAttempt:
        source.collectorProfile.maximumSideEffectsPerAttempt,
    };
    const privateAttemptObjectHash = digest(
      "outsider/route-discovery-collector-private-attempt-object-identity/v1",
      privateObjectIdentity);
    const privateAttemptOccurrenceHash = digest(
      "outsider/route-discovery-collector-private-attempt-occurrence-identity/v1",
      { privateAttemptObjectHash, attempt });
    const discoverySource = {
      tender: t, asOf: source.asOf,
      candidateSources: attempt.observationSources,
    };
    const privateDiscovery = createOutcomeResourceRouteDiscoverySnapshotV1(
      discoverySource);
    const privateDiscoverySourceHash = digest(
      "outsider/route-discovery-collector-derived-snapshot-source/v1",
      discoverySource);
    const expectedBundleCommitment = digest(
      "outsider/route-discovery-collector-private-discovery-bundle/v1", {
        privateProjectionNonce: source.privateProjectionNonce,
        exactPrivateSourceHash: sourceHash,
        exactDerivedDiscoverySourceHash: privateDiscoverySourceHash,
        exactDerivedDiscoverySnapshotHash: privateDiscovery.snapshotHash,
        attemptIdentities: [{ privateAttemptObjectHash,
          privateAttemptOccurrenceHash }],
      });
    assert.equal(record.privateDiscoveryBundleCommitmentHash,
      expectedBundleCommitment);
    const changedPrivateSource = mutable(source);
    changedPrivateSource.collectorAttempts[0].request.rightsReviewRefHash
      = h("privacy-closure:changed-rights");
    changedPrivateSource.collectorAttempts[0].observationSources[0]
      .sourceReference.rightsReviewRefHash
      = changedPrivateSource.collectorAttempts[0].request.rightsReviewRefHash;
    const changedPrivateRecord = createRouteDiscoveryCollectorV1(
      changedPrivateSource);
    assert.deepEqual(changedPrivateRecord.discoveryProjection,
      record.discoveryProjection);
    assert.deepEqual(changedPrivateRecord.collectorAttemptOccurrences,
      record.collectorAttemptOccurrences);
    assert.notEqual(changedPrivateRecord.privateDiscoveryBundleCommitmentHash,
      record.privateDiscoveryBundleCommitmentHash);

    const forbiddenKeys = [
      "discoverySnapshot", "discoverySnapshotHash",
      "discoverySnapshotSourceHash", "collectorOccurrenceId",
      "collectorAttemptObjectHash", "collectorAttemptOccurrenceHash",
      "observationSourceHashes", "sourceArtifactHash", "sourceRevisionHash",
      "sourceRecordHash", "transactionSurfaceRefHash",
      "sourceReplayReceiptHash", "permissionReplayRefHash",
      "credentialLeaseReplayRefHash", "rightsReviewRefHash",
      "privacyReviewRefHash", "externalTrustRefHash", "idempotencyKeyHash",
      "nonceHash",
    ];
    for (const key of forbiddenKeys) {
      assert.equal(containsOwnKey(record, key), false, key);
      assert.equal(containsOwnKey(checked, key), false, key);
    }

    const privateCanaries = [
      source.privateProjectionNonce,
      source.adapterReplay.source.privateAdapterInstanceRefHash,
      source.adapterReplay.source.privateProjectionNonce,
      source.adapterReplay.expectedSourceHash,
      attempt.request.collectorOccurrenceId,
      attempt.request.sourceArtifactHash,
      attempt.request.sourceRevisionHash,
      attempt.request.sourceReplayReceiptHash,
      attempt.request.permissionReplayRefHash,
      attempt.request.credentialLeaseReplayRefHash,
      attempt.request.rightsReviewRefHash,
      attempt.request.privacyReviewRefHash,
      attempt.request.externalTrustRefHash,
      attempt.request.idempotencyKeyHash,
      attempt.request.nonceHash,
      attempt.observationSources[0].occurrenceId,
      attempt.observationSources[0].sourceReference.transactionSurfaceRefHash,
      attempt.observationSources[0].sourceReference.sourceRecordHash,
      sourceHash,
      privateAttemptObjectHash,
      privateAttemptOccurrenceHash,
      privateDiscoverySourceHash,
      privateDiscovery.snapshotHash,
      privateDiscovery.fanoutPlan.fanoutPlanHash,
      privateDiscovery.candidateOccurrences[0].candidateHash,
      privateDiscovery.candidateOccurrences[0].routeObject.routeObjectHash,
      privateDiscovery.candidateOccurrences[0].routeOccurrence.occurrenceHash,
      digest("outsider/route-discovery-collector-observation-source/v1",
        attempt.observationSources[0]),
    ];
    const publicBytes = JSON.stringify([record, checked]);
    for (const canary of privateCanaries) {
      assert.equal(publicBytes.includes(canary), false, canary);
    }
    assert.equal(record.discoveryProjection.fullDiscoverySnapshotProjected,
      false);
    assert.equal(record.privateReferencePreimagesProjected, false);
    assert.equal(record.unsaltedPrivateDerivedHashesProjected, false);
  });

test("attempt occurrence denominator and route occurrence denominator survive dedup",
  async () => {
    const t = tender("dedup");
    const first = request(t, "RESOURCE", "dedup-first");
    const second = request(t, "RESOURCE", "dedup-second", {
      idempotencyKeyHash: first.idempotencyKeyHash,
      sourceArtifactHash: first.sourceArtifactHash,
      sourceRevisionHash: first.sourceRevisionHash,
      sourceReplayReceiptHash: first.sourceReplayReceiptHash,
      permissionReplayRefHash: first.permissionReplayRefHash,
      credentialLeaseReplayRefHash: first.credentialLeaseReplayRefHash,
      rightsReviewRefHash: first.rightsReviewRefHash,
      privacyReviewRefHash: first.privacyReviewRefHash,
      externalTrustRefHash: first.externalTrustRefHash,
    });
    const source = mutable(await runRouteDiscoveryCollectorV1(
      plan(t, [first, second]), null));
    const sharedSurface = h("collector:shared-surface");
    declareSuccess(source, 0, "dedup-route-first", sharedSurface);
    declareSuccess(source, 1, "dedup-route-second", sharedSurface);
    const record = createRouteDiscoveryCollectorV1(source);

    assert.equal(record.attemptCensus.totalAttemptOccurrenceCount, 2);
    assert.equal(record.attemptCensus.uniqueAttemptObjectCount, 1);
    assert.equal(record.attemptCensus.repeatedAttemptObjectOccurrenceCount, 1);
    assert.equal(record.discoveryProjection.sourceDeclaredOccurrenceCensus
      .totalOccurrenceCount, 2);
    assert.equal(record.discoveryProjection.sourceDeclaredOccurrenceCensus
      .uniqueRouteObjectCount, 1);
    assert.equal(record.discoveryProjection.sourceDeclaredOccurrenceCensus
      .repeatedObjectOccurrenceCount, 1);
    assert.equal(record.attemptCensus.objectDedupDoesNotReduceAttemptDenominator,
      true);
  });

test("missing adapter capability and prerequisite references stay NOT_INVOKED",
  async () => {
    const t = tender("missing");
    const disabled = await runRouteDiscoveryCollectorV1(plan(t, [
      request(t, "RESOURCE", "disabled"),
    ], { adapterReplay: adapterReplay(false) }), () => {
      throw new Error("must not run");
    });
    assert.equal(disabled.collectorAttempts[0].failureCode,
      "ADAPTER_CAPABILITY_UNSUPPORTED");

    const fields = [
      ["permissionReplayRefHash", "PERMISSION_INPUT_MISSING"],
      ["credentialLeaseReplayRefHash", "CREDENTIAL_LEASE_INPUT_MISSING"],
      ["rightsReviewRefHash", "RIGHTS_INPUT_MISSING"],
      ["privacyReviewRefHash", "PRIVACY_INPUT_MISSING"],
      ["externalTrustRefHash", "EXTERNAL_TRUST_INPUT_MISSING"],
    ];
    for (let index = 0; index < fields.length; index += 1) {
      let callbackCount = 0;
      const source = await runRouteDiscoveryCollectorV1(plan(t, [request(t,
        "RESOURCE", `missing-${index}`, { [fields[index][0]]: null })]),
      () => { callbackCount += 1; });
      assert.equal(callbackCount, 0);
      assert.equal(source.collectorAttempts[0].failureCode, fields[index][1]);
      const record = createRouteDiscoveryCollectorV1(source);
      assert.equal(record.attemptCensus
        .sourceDeclaredNotInvokedOccurrenceCount, 1);
      assert.equal(record.humanQueueCreated, false);
      assert.equal(record.internalHumanFallbackPermitted, false);
      assert.equal(record.decisionState, "HOLD");
    }
  });

test("source-declared timeout and cardinality failure remain non-authoritative",
  async () => {
    const t = tender("failures");
    const source = mutable(await runRouteDiscoveryCollectorV1(plan(t, [
      request(t, "RESOURCE", "cardinality"),
      request(t, "EVIDENCE", "logical-timeout"),
    ]), null));
    const cardinality = source.collectorAttempts[0];
    cardinality.sourceDeclaredCollectorInvoked = true;
    cardinality.sourceDeclaredOutcome = "FAILED";
    cardinality.failureCode = "SIDE_EFFECT_CARDINALITY_EXCEEDED";
    cardinality.sourceDeclaredCompletedAt = "2026-09-03T12:03:00.000Z";
    cardinality.sourceDeclaredCompletionTimeBasis
      = "COLLECTOR_DECLARATION_NO_TRUSTED_TIME";
    cardinality.sourceDeclaredSideEffectCount = 1;
    cardinality.sourceDeclaredSideEffectWithinLimit = false;
    const timeout = source.collectorAttempts[1];
    timeout.sourceDeclaredCollectorInvoked = true;
    timeout.sourceDeclaredOutcome = "FAILED";
    timeout.failureCode = "LOGICAL_DEADLINE_EXCEEDED";
    timeout.sourceDeclaredCompletedAt = "2026-09-03T12:06:00.000Z";
    timeout.sourceDeclaredCompletionTimeBasis
      = "COLLECTOR_DECLARATION_NO_TRUSTED_TIME";
    timeout.sourceDeclaredSideEffectCount = 0;
    timeout.sourceDeclaredSideEffectWithinLimit = true;
    const record = createRouteDiscoveryCollectorV1(source);

    assert.equal(record.attemptCensus.sourceDeclaredFailedOccurrenceCount, 2);
    assert.equal(record.attemptCensus
      .reportedCardinalityViolationOccurrenceCount, 1);
    assert.equal(record.attemptCensus.actualCollectorInvocationOccurrenceCount, 0);
    assert.equal(record.attemptCensus.actualNetworkIoOccurrenceCount, 0);
    for (const attempt of record.collectorAttemptOccurrences) {
      assert.equal(attempt.occurrence.actualCollectorInvoked, false);
      assert.equal(attempt.occurrence.actualNetworkIoEstablished, false);
      assert.equal(attempt.occurrence.actualSideEffectCardinalityEstablished,
        false);
      assert.equal(attempt.occurrence.trustedTimeEstablished, false);
    }
  });

test("accepted success and failure cannot complete before their request",
  async () => {
    const t = tender("pre-request-completion");
    const planned = await runRouteDiscoveryCollectorV1(plan(t, [request(t,
      "RESOURCE", "pre-request-completion")]), null);

    const success = mutable(planned);
    success.collectorAttempts[0].sourceDeclaredCollectorInvoked = true;
    success.collectorAttempts[0].sourceDeclaredOutcome = "SUCCEEDED";
    success.collectorAttempts[0].failureCode = null;
    success.collectorAttempts[0].sourceDeclaredCompletedAt
      = "2026-09-03T12:00:30.000Z";
    success.collectorAttempts[0].sourceDeclaredCompletionTimeBasis
      = "COLLECTOR_DECLARATION_NO_TRUSTED_TIME";
    assert.throws(() => createRouteDiscoveryCollectorV1(success),
      /SOURCE_DECLARED_COMPLETION_BEFORE_REQUEST/u);

    const failure = mutable(planned);
    failure.collectorAttempts[0].sourceDeclaredCollectorInvoked = true;
    failure.collectorAttempts[0].sourceDeclaredOutcome = "FAILED";
    failure.collectorAttempts[0].failureCode = "SOURCE_UNAVAILABLE";
    failure.collectorAttempts[0].sourceDeclaredCompletedAt
      = "2026-09-03T12:00:30.000Z";
    failure.collectorAttempts[0].sourceDeclaredCompletionTimeBasis
      = "COLLECTOR_DECLARATION_NO_TRUSTED_TIME";
    failure.collectorAttempts[0].sourceDeclaredSideEffectCount = 0;
    failure.collectorAttempts[0].sourceDeclaredSideEffectWithinLimit = true;
    assert.throws(() => createRouteDiscoveryCollectorV1(failure),
      /SOURCE_DECLARED_COMPLETION_BEFORE_REQUEST/u);
  });

test("tighter aggregate observation cap accepts 256 and rejects 257",
  async () => {
    const t = tender("aggregate-cap");
    const requests = [];
    for (let index = 0; index < 5; index += 1) {
      requests.push(request(t, "RESOURCE", `aggregate-${index}`, {
        maximumObservationCount: 64,
      }));
    }
    const aggregateProfile = {
      ...collectorProfile(), maximumObservationsPerAttempt: 64,
    };
    const planned = await runRouteDiscoveryCollectorV1(plan(t, requests, {
      collectorProfile: aggregateProfile,
    }), null);

    const exact = mutable(planned);
    exact.collectorAttempts.pop();
    exact.expectedAttemptOccurrenceCount = 4;
    for (let index = 0; index < exact.collectorAttempts.length; index += 1) {
      declareSuccessCount(exact, index, `aggregate-${index}`, 64);
    }
    const record = createRouteDiscoveryCollectorV1(exact);
    assert.equal(OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_LIMITS
      .maximumTotalObservationOccurrences, 256);
    assert.equal(OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_LIMITS
      .downstreamNominalMaximumCandidateOccurrences, 512);
    assert.equal(record.collectorBinding.maximumTotalObservationOccurrences,
      256);
    assert.equal(record.acceptedSourceDeclaredRouteObservationCount, 256);
    assert.equal(record.discoveryProjection.sourceDeclaredOccurrenceCensus
      .totalOccurrenceCount, 256);

    const overflow = mutable(planned);
    for (let index = 0; index < 4; index += 1) {
      declareSuccessCount(overflow, index, `aggregate-${index}`, 64);
    }
    declareSuccessCount(overflow, 4, "aggregate-overflow", 1);
    assert.throws(() => createRouteDiscoveryCollectorV1(overflow),
      /TOTAL_OBSERVATION_OCCURRENCE_LIMIT_EXCEEDED/u);
  });

test("source replay binds tender graph, requirement, revision, rights, privacy, and expiry",
  async () => {
    const t = tender("binding");
    const source = mutable(await runRouteDiscoveryCollectorV1(plan(t, [
      request(t, "RESOURCE", "binding"),
    ]), null));
    declareSuccess(source, 0, "binding-route");
    const record = createRouteDiscoveryCollectorV1(source);
    const sourceHash = createRouteDiscoveryCollectorSourcePinV1(source);
    for (const mutate of [
      (value) => { value.tender.typedGraph.attempt.attemptHash = h("splice"); },
      (value) => { value.collectorAttempts[0].request.requirementId
        = alias("resource", "wrong"); },
      (value) => { value.collectorAttempts[0].request.sourceRevisionHash
        = h("revision-splice"); },
      (value) => { value.collectorAttempts[0].request.rightsReviewRefHash
        = h("rights-splice"); },
      (value) => { value.collectorAttempts[0].request.privacyReviewRefHash
        = h("privacy-splice"); },
      (value) => { value.collectorAttempts[0].request.routeValidUntil
        = "2026-09-03T12:13:00.000Z"; },
    ]) {
      const spliced = mutable(source);
      mutate(spliced);
      const checked = verifyRouteDiscoveryCollectorV1(record, {
        source: spliced, expectedSourceHash: sourceHash,
        expectedCollectorHash: record.collectorHash,
      });
      assert.equal(checked.ok, false);
      assert.match(checked.error, /EXPECTED_SOURCE_HASH_MISMATCH/u);
    }
    const internallySpliced = mutable(source);
    internallySpliced.collectorAttempts[0].observationSources[0]
      .sourceReference.sourceRevisionHash = h("observation-splice");
    assert.throws(() => createRouteDiscoveryCollectorV1(internallySpliced),
      /OBSERVATION_SOURCE_REQUEST_BINDING_MISMATCH/u);
    const denominator = mutable(source);
    denominator.expectedAttemptOccurrenceCount = 2;
    assert.throws(() => createRouteDiscoveryCollectorV1(denominator),
      /ATTEMPT_OCCURRENCE_DENOMINATOR_MISMATCH/u);
    const callbackCount = mutable(source);
    callbackCount.actualCollectorCallbackInvocationCount = 1;
    assert.throws(() => createRouteDiscoveryCollectorV1(callbackCount),
      /ACTUAL_COLLECTOR_CALLBACK_INVOCATION_FORBIDDEN/u);
    const futureCompletion = mutable(source);
    futureCompletion.collectorAttempts[0].sourceDeclaredCompletedAt
      = "2026-09-03T12:11:00.000Z";
    assert.throws(() => createRouteDiscoveryCollectorV1(futureCompletion),
      /SOURCE_DECLARED_COMPLETION_AFTER_AS_OF/u);
    const forged = mutable(record);
    forged.externalTrustEstablished = true;
    assert.equal(verifyRouteDiscoveryCollectorV1(forged, {
      source, expectedSourceHash: sourceHash,
      expectedCollectorHash: record.collectorHash,
    }).ok, false);
  });

test("hostile/decorated/arbitrary-target plans fail before any callback", async () => {
  const t = tender("hostile");
  let callbackCount = 0;
  const callback = () => { callbackCount += 1; };
  const urlPlan = plan(t, [request(t, "RESOURCE", "url")]);
  urlPlan.collectionRequests[0].url = "https://arbitrary.invalid";
  await assert.rejects(() => runRouteDiscoveryCollectorV1(urlPlan, callback),
    /COLLECTION_REQUEST_FIELDS_INVALID/u);
  let proxyTrap = 0;
  const proxyPlan = new Proxy(plan(t, []), {
    ownKeys() { proxyTrap += 1; throw new Error("must not touch"); },
  });
  await assert.rejects(() => runRouteDiscoveryCollectorV1(proxyPlan, callback),
    /VALUE_PROXY_FORBIDDEN/u);
  assert.equal(proxyTrap, 0);
  let accessorCount = 0;
  const accessorPlan = plan(t, []);
  Object.defineProperty(accessorPlan, "asOf", { enumerable: true,
    get() { accessorCount += 1; return "2026-09-03T12:10:00.000Z"; } });
  await assert.rejects(
    () => runRouteDiscoveryCollectorV1(accessorPlan, callback),
    /DATA_FIELDS_REQUIRED/u);
  assert.equal(accessorCount, 0);
  assert.equal(callbackCount, 0);
});

test("boundary fixes all real authority, action, economics, and fallback off", () => {
  const boundary = OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_BOUNDARY;
  assert.equal(boundary.position,
    "SOURCE_SPECIFIC_ROUTE_COLLECTION_SOURCE_REPLAY_HOLD_ONLY");
  assert.equal(boundary.injectedCollectorCallbackInvocationEnabled, false);
  assert.equal(boundary.actualCollectorCallbackInvocationCount, 0);
  assert.equal(boundary.builtInFetchPresent, false);
  assert.equal(boundary.builtInFilesystemIoPresent, false);
  assert.equal(boundary.builtInBrowserDriverPresent, false);
  assert.equal(boundary.builtInMailboxDriverPresent, false);
  assert.equal(boundary.arbitraryUrlAccepted, false);
  assert.equal(boundary.rawCredentialMaterialAccepted, false);
  assert.equal(boundary.privateIdentifierProjectionAllowed, false);
  assert.equal(boundary.rawSourceProjectionAllowed, false);
  assert.equal(boundary.fullDiscoverySnapshotProjected, false);
  assert.equal(boundary.privateReferencePreimagesProjected, false);
  assert.equal(boundary.unsaltedPrivateDerivedHashesProjected, false);
  assert.equal(boundary.privateDiscoveryBundleCommitmentSalted, true);
  assert.equal(boundary
    .publicDiscoveryProjectionContainsCountsAndTenderRequirementsOnly, true);
  assert.equal(boundary.ambientCredentialsAcceptedOrReadByThisModule, false);
  assert.equal(boundary.sourceDeclaredCollectorSuccessEstablishesPermission,
    false);
  assert.equal(boundary.sourceDeclaredCollectorSuccessEstablishesRightsClearance,
    false);
  assert.equal(boundary.sourceDeclaredCollectorSuccessEstablishesPrivacyClearance,
    false);
  assert.equal(boundary.sourceDeclaredCollectorSuccessEstablishesExternalTrust,
    false);
  assert.equal(boundary.sourceDeclaredCollectorSuccessEstablishesContactability,
    false);
  assert.equal(boundary.sourceDeclaredCollectorSuccessEstablishesOwnerAuthority,
    false);
  assert.equal(boundary.sourceDeclaredCollectorSuccessEstablishesCapacity,
    false);
  assert.equal(boundary.sourceDeclaredCollectorSuccessEstablishesZeroInternalOps,
    false);
  assert.equal(boundary.sourceDeclaredCollectorSuccessEnablesAction, false);
  assert.equal(boundary.internalHumanFallbackPermitted, false);
  assert.equal(boundary.humanQueueCreated, false);
  assert.equal(boundary.priceEstablished, false);
  assert.equal(boundary.guaranteeEstablished, false);
  assert.equal(boundary.settlementPermitted, false);
  assert.equal(boundary.enabledCapabilityCount, 0);
  assert.equal(boundary.provenAuthorityCount, 0);
  assert.equal(boundary.enabledCapabilitiesSubsetOfProvenAuthority, true);
  assert.equal(boundary.consequenceReach, "NONE");
  assert.equal(boundary.decisionState, "HOLD");
  assert.equal(boundary.authority, "NONE");
  assert.ok(Object.isFrozen(boundary));
});
