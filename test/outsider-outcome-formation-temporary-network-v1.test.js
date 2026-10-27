import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createExternalCapacityReservationReceiptBindingV1,
  createOwnerOneUseMandateV1,
  createProviderOneUseAcceptanceV1,
} from "../src/outsider-one-use-commitments-v1.js";
import {
  createInitialOneUseTenderResponseV1,
  createExternalCapacityVerifierContextV1,
  createOneUseTenderResponseDescendantV1,
  createOneUseTenderResponseOccurrenceV1,
  externalCapacitySourceSigningMessageV1,
  OUTSIDER_EXTERNAL_CAPACITY_EVENT_GENESIS_V1,
  OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1,
  verifyExternalCapacityReceiptLifecycleV1,
  verifyOneUseTenderResponseLifecycleV1,
} from "../src/outsider-one-use-tender-response-lifecycle-v1.js";
import {
  createOutcomeFormationFoundationBoundEvaluationV1,
} from "../src/outsider-outcome-formation-foundation-replay-v1.js";
import {
  createOutcomeFormationTemporaryNetworkNorthStarSourceV1,
  createOutcomeFormationTemporaryNetworkNorthStarV1,
} from "../src/outsider-outcome-formation-temporary-network-north-star-v1.js";
import {
  createOutcomeFormationTemporaryNetworkV1,
  OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_BOUNDARY,
  OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_LIMITS,
  OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_SCHEMAS,
  OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_STATES,
  verifyOutcomeFormationTemporaryNetworkV1,
} from "../src/outsider-outcome-formation-temporary-network-v1.js";
import {
  createOutcomeResourceRouteDiscoverySnapshotV1,
} from "../src/outsider-outcome-resource-route-discovery-v1.js";
import { compileOutsiderOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(`temporary-network:${label}`, "utf8").digest("hex")}`;
const id = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;
const mutable = (value) => JSON.parse(JSON.stringify(value));

const FAMILIES = Object.freeze([{
  label: "coordination",
  outcomeKindCode: "CALENDAR_EVENT_ESTABLISHED",
  resourceClassCode: "COMMUNICATION_COORDINATOR",
  evidenceClassCode: "INDEPENDENT_CONFIRMATION",
  recoveryClassCode: "ALTERNATE_COORDINATION_RESOURCE",
}, {
  label: "connectivity",
  outcomeKindCode: "NETWORK_CONNECTIVITY_RESTORED",
  resourceClassCode: "LOCAL_NETWORK_TECHNICIAN",
  evidenceClassCode: "INDEPENDENT_NETWORK_PROBE",
  recoveryClassCode: "ALTERNATE_NETWORK_TECHNICIAN",
}, {
  label: "export",
  outcomeKindCode: "DATASET_DELIVERED",
  resourceClassCode: "CLOUD_DATA_EXPORT_WORKER",
  evidenceClassCode: "INDEPENDENT_CHECKSUM_WITNESS",
  recoveryClassCode: "SECONDARY_EXPORT_PATH",
}]);

function tenderInput(family) {
  const label = family.label;
  const evidenceId = id("evidence", `${label}:evidence`);
  return {
    tenderId: id("tender", label),
    compiledAt: "2026-09-02T12:00:00.000Z",
    lineage: { revision: 0, predecessorTenderHash: null,
      supersedesTenderHash: null },
    workOrderHash: h(`${label}:work-order`),
    typedGraph: {
      principalEpoch: { principalRefHash: h(`${label}:principal`),
        epochRefHash: h(`${label}:epoch`),
        principalEpochProjectionHash: h(`${label}:epoch-projection`) },
      accountableDeployment: {
        deploymentLineageRefHash: h(`${label}:deployment-lineage`),
        deploymentRevisionHash: h(`${label}:deployment-revision`),
        accountableDeploymentSubjectHash: h(`${label}:deployment-subject`),
      },
      runtime: { runtimeInstanceRefHash: h(`${label}:runtime-ref`),
        runtimeInstanceHash: h(`${label}:runtime`) },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
        delegationEdgeHash: h(`${label}:delegation-edge`) },
      episode: { episodeHash: h(`${label}:episode`),
        networkCompleteEpisodeJoinHash: h(`${label}:episode-join`) },
      attempt: { attemptHash: h(`${label}:attempt`),
        attemptActorSubjectHash: h(`${label}:attempt-actor`) },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: h(`${label}:actor-envelope`),
      delegationEvidenceRefHash: h(`${label}:delegation-evidence`),
      delegationEdgeHash: h(`${label}:delegation-edge`),
      authorityScopeRefHash: h(`${label}:authority-scope`),
      resourceOwnerAuthorizationRefHash: h(`${label}:owner-auth`),
      rightsPrivacyPolicyRefHash: h(`${label}:rights-policy`),
    },
    exactOutcome: {
      outcomeKindCode: family.outcomeKindCode,
      outcomeSpecRefHash: h(`${label}:outcome-spec`),
      subjectRefHash: h(`${label}:subject`),
      acceptanceCriteriaRefHash: h(`${label}:acceptance-criteria`),
      conditions: [{
        conditionId: id("condition", `${label}:complete`),
        metricCode: "OUTCOME_STATE",
        comparator: "EQUAL",
        target: { valueKind: "STATE_CODE", booleanValue: null,
          integerValue: null, stateCode: "COMPLETE", unitCode: null },
        observationWindowMs: 0,
        conditionRefHash: h(`${label}:condition`),
        mandatory: true,
      }],
      deadline: "2026-09-02T16:00:00.000Z",
    },
    formationDeadline: "2026-09-02T12:40:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: id("resource", `${label}:primary`),
      resourceClassCode: family.resourceClassCode,
      capabilityRefHash: h(`${label}:capability`),
      quantity: 1,
      unitCode: "TASK_SLOT",
      regionRefHash: h(`${label}:region`),
      requiredBy: "2026-09-02T15:00:00.000Z",
      mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: family.evidenceClassCode,
      evidenceRequirementRefHash: h(`${label}:evidence-ref`),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "AT_COMPLETION",
      dueBy: "2026-09-02T16:00:00.000Z",
      mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: id("recovery", `${label}:alternate`),
      triggerRefHash: h(`${label}:recovery-trigger`),
      recoveryOutcomeRefHash: h(`${label}:recovery-outcome`),
      resourceClassCode: family.recoveryClassCode,
      maximumAttempts: 2,
      completionDeadline: "2026-09-02T16:00:00.000Z",
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED",
      mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h(`${label}:consequence`),
      consequenceClassCode: "BOUNDED_DELAY",
      measureCode: "MAXIMUM_DELAY_MINUTES",
      maximumValue: 120,
      unitCode: "MINUTE",
      affectedChannelRefHashes: [h(`${label}:affected-channel`)],
      irreversibleHarmAllowed: false,
      unboundedConsequenceAllowed: false,
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
  };
}

function assertions() {
  return {
    capacityReceiptAuthentic: false,
    externalTrustEstablished: false,
    authorityEstablished: false,
    riskCapitalEstablished: false,
    custodyEstablished: false,
    adjudicationEstablished: false,
    independentWitnessEstablished: false,
    rightsPrivacyCleared: false,
    actionReady: false,
    priceAuthorityEstablished: false,
    guaranteeAuthorityEstablished: false,
    settlementAuthorityEstablished: false,
  };
}

function foundation(tender, family) {
  const label = family.label;
  const commercialTerm = { quoteRefHash: h(`${label}:quote`), currency: "USD",
    amountMinor: "10000" };
  const providerRefHash = h(`${label}:primary-provider`);
  const ownerMandate = createOwnerOneUseMandateV1({
    tenderHash: tender.tenderHash,
    scopeHash: tender.exactOutcome.exactOutcomeHash,
    ownerPrincipalRefHash: h(`${label}:owner`),
    delegationEnvelopeHash: h(`${label}:owner-delegation`),
    evidencePlanHash: tender.evidenceRequirements.requirementSetHash,
    remedyPlanHash: tender.recoveryRequirements.requirementSetHash,
    commercialTerm,
    issuedAt: "2026-09-02T12:01:00.000Z",
    expiresAt: "2026-09-02T12:39:00.000Z",
    oneUseNonceHash: h(`${label}:owner-nonce`),
    response: "ACCEPT",
    signatureRefHash: h(`${label}:owner-signature`),
  });
  const providerAcceptance = createProviderOneUseAcceptanceV1({
    tenderHash: tender.tenderHash,
    scopeHash: tender.exactOutcome.exactOutcomeHash,
    providerRefHash,
    evidencePlanHash: tender.evidenceRequirements.requirementSetHash,
    remedyPlanHash: tender.recoveryRequirements.requirementSetHash,
    commercialTerm,
    acceptedAt: "2026-09-02T12:02:00.000Z",
    expiresAt: "2026-09-02T12:39:00.000Z",
    oneUseNonceHash: h(`${label}:provider-nonce`),
    response: "ACCEPT",
    signatureRefHash: h(`${label}:provider-signature`),
  });
  const capacityReservationReceipt
    = createExternalCapacityReservationReceiptBindingV1({
      tenderHash: tender.tenderHash,
      scopeHash: tender.exactOutcome.exactOutcomeHash,
      providerAcceptanceHash: providerAcceptance.providerAcceptanceHash,
      commercialTermHash: providerAcceptance.commercialTerm.commercialTermHash,
      externalSystemRefHash: h(`${label}:capacity-system`),
      externalReservationRefHash: h(`${label}:capacity-reservation`),
      externalReceiptArtifactHash: h(`${label}:capacity-receipt`),
      issuedAt: "2026-09-02T12:03:00.000Z",
      reservedFrom: "2026-09-02T12:30:00.000Z",
      reservedUntil: "2026-09-02T16:30:00.000Z",
      status: "RESERVED",
      signatureRefHash: h(`${label}:capacity-signature`),
    });
  const source = {
    formationId: id("formation", label),
    evaluatedAt: "2026-09-02T12:30:00.000Z",
    expectedTenderHash: tender.tenderHash,
    tender,
    ownerMandate,
    providerAcceptance,
    capacityReservationReceipt,
    consumedNonceHashes: [],
    untrustedCallerAssertions: assertions(),
    autonomousWorkOrder: null,
    actionAdmissionReplay: null,
    attemptSetReplay: null,
    networkOutcomeWitnessReplay: null,
    actionObligationHoldCompositionInput: null,
  };
  return { source,
    record: createOutcomeFormationFoundationBoundEvaluationV1(source),
    providerRefHash };
}

function sourceReference(label) {
  return {
    transactionSurfaceRefHash: h(`${label}:surface`),
    sourceArtifactHash: h(`${label}:artifact`),
    sourceRevisionHash: h(`${label}:revision`),
    sourceRecordHash: h(`${label}:record`),
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
  };
}

function requirementId(tender, kind) {
  return kind === "RESOURCE"
    ? tender.resourceRequirements.items[0].resourceRequirementId
    : kind === "EVIDENCE"
      ? tender.evidenceRequirements.items[0].evidenceRequirementId
      : tender.recoveryRequirements.items[0].recoveryRequirementId;
}

function candidateSource(tender, kind, label) {
  return {
    occurrenceId: id("routeocc", label),
    requirementKind: kind,
    requirementId: requirementId(tender, kind),
    routeKind: "OFFICIAL_API",
    observedAt: "2026-09-02T12:05:00.000Z",
    validUntil: "2026-09-02T12:35:00.000Z",
    sourceReference: sourceReference(label),
    lifecycle: { revision: 0, predecessorCandidateHash: null,
      supersedesCandidateHash: null, revokedAt: null,
      revocationRefHash: null },
  };
}

function discovery(tender, family, includedKinds = [
  "RESOURCE", "EVIDENCE", "RECOVERY",
]) {
  const source = { tender, asOf: "2026-09-02T12:30:00.000Z",
    candidateSources: includedKinds.map((kind) => candidateSource(tender, kind,
      `${family.label}:${kind.toLowerCase()}`)) };
  return { source, record: createOutcomeResourceRouteDiscoverySnapshotV1(source) };
}

function responseSlot(tender, kind) {
  if (kind === "RESOURCE") {
    const row = tender.resourceRequirements.items[0];
    return { id: row.resourceRequirementId, quantity: row.quantity,
      unitCode: row.unitCode };
  }
  return { id: requirementId(tender, kind), quantity: 1,
    unitCode: "REQUIREMENT" };
}

function selectedRoute(discoveryRecord, kind) {
  const requirement = discoveryRecord.fanoutPlan.requirements.find(
    (row) => row.requirementKind === kind);
  assert.ok(requirement);
  assert.equal(requirement.currentRouteObjectHashes.length, 1);
  return { routeObjectHash: requirement.currentRouteObjectHashes[0],
    currentCandidateHash: requirement.currentCandidateHashes[0] };
}

function responseLifecycle(tender, discoveryRecord, family, kind,
  terminalState = null) {
  const slot = responseSlot(tender, kind);
  const route = selectedRoute(discoveryRecord, kind);
  const label = `${family.label}:${kind.toLowerCase()}`;
  const providerRefHash = kind === "RESOURCE"
    ? h(`${family.label}:primary-provider`) : h(`${label}:provider`);
  const shortWindow = terminalState === "EXPIRED";
  const initial = createInitialOneUseTenderResponseV1({
    tender,
    expectedTenderHash: tender.tenderHash,
    providerRefHash,
    requirementKind: kind,
    requirementId: slot.id,
    discoveryRouteObjectHash: route.routeObjectHash,
    discoveryCandidateHash: route.currentCandidateHash,
    quantity: slot.quantity,
    unitCode: slot.unitCode,
    serviceFrom: shortWindow ? "2026-09-02T12:10:00.000Z"
      : "2026-09-02T13:00:00.000Z",
    serviceUntil: shortWindow ? "2026-09-02T12:15:00.000Z"
      : "2026-09-02T14:00:00.000Z",
    responseState: terminalState === "DECLINED" ? "DECLINED" : "OFFERED",
    stateAt: "2026-09-02T12:06:00.000Z",
    expiresAt: shortWindow ? "2026-09-02T12:20:00.000Z"
      : "2026-09-02T14:30:00.000Z",
    reasonCode: terminalState === "DECLINED" ? "NO_CAPACITY"
      : "ONE_USE_OFFER_CREATED",
    responseNonceHash: h(`${label}:response-nonce`),
    sourceResponseRefHash: h(`${label}:response-source`),
  });
  const responses = [initial];
  if (terminalState === "REVOKED" || terminalState === "EXPIRED") {
    responses.push(createOneUseTenderResponseDescendantV1({
      tender,
      expectedTenderHash: tender.tenderHash,
      predecessorResponse: initial,
      responseState: terminalState,
      stateAt: terminalState === "REVOKED"
        ? "2026-09-02T12:20:00.000Z" : "2026-09-02T12:20:00.000Z",
      reasonCode: terminalState === "REVOKED" ? "CAPACITY_WITHDRAWN"
        : "OFFER_WINDOW_EXPIRED",
      responseNonceHash: h(`${label}:${terminalState}:nonce`),
      sourceResponseRefHash: h(`${label}:${terminalState}:source`),
    }));
  }
  const occurrences = [];
  let previous = OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1;
  for (let index = 0; index < responses.length; index += 1) {
    const occurrence = createOneUseTenderResponseOccurrenceV1({
      response: responses[index],
      ordinal: index + 1,
      previousOccurrenceHash: previous,
      recordedAt: index === 0 ? "2026-09-02T12:06:01.000Z"
        : responses[index].stateAt,
      occurrenceNonceHash: h(`${label}:occurrence:${index + 1}`),
    });
    occurrences.push(occurrence);
    previous = occurrence.occurrenceHash;
  }
  const source = {
    tender,
    expectedTenderHash: tender.tenderHash,
    responses,
    occurrences,
    expectedOccurrenceCount: occurrences.length,
    expectedLifecycleHeadHash: previous,
    observedAt: "2026-09-02T12:30:00.000Z",
  };
  const checked = verifyOneUseTenderResponseLifecycleV1(source);
  assert.equal(checked.ok, true, checked.error);
  return { source, checked, route };
}

function externalKeyFixture() {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" });
  const publicKeyDer = pair.publicKey.export({ type: "spki", format: "der" });
  return { privateKey: pair.privateKey, publicKeyPem,
    keyId: `sha256:${createHash("sha256").update(publicKeyDer).digest("hex")}` };
}

function externalContext(keys, maximumLifecycleHeadAgeMs = 600_000) {
  return createExternalCapacityVerifierContextV1({
    verifierId: "test.capacity.adapter",
    verifierRevisionHash: h("external:verifier-revision"),
    adapterArtifactHash: h("external:adapter-artifact"),
    sourceSystemId: "private.capacity.source.system",
    semanticsSchema: "test/capacity-semantics/v1",
    standingSchema: "test/resource-owner-standing/v1",
    receiptSchema: "test/capacity-receipt/v1",
    lifecycleEventSchema: "test/capacity-lifecycle-event/v1",
    lifecycleHeadSchema: "test/capacity-lifecycle-head/v1",
    sourcePublicKeyPem: keys.publicKeyPem,
    expectedSourceKeyId: keys.keyId,
    sourceTrustPolicyRefHash: h("external:trust-policy"),
    rightsPrivacyPolicyRefHash: h("external:rights-privacy-policy"),
    validFrom: "2026-09-02T00:00:00.000Z",
    validUntil: "2026-09-03T00:00:00.000Z",
    issuedAt: "2026-09-01T23:00:00.000Z",
    maximumLifecycleHeadAgeMs,
  });
}

function signedExternalSource(kind, payload, keys) {
  const signature = sign(null,
    externalCapacitySourceSigningMessageV1(kind, payload), keys.privateKey);
  return Buffer.from(canonicalizeStrict({
    payload,
    signature: { algorithm: "ED25519", keyId: keys.keyId,
      valueBase64: signature.toString("base64") },
  }), "utf8");
}

function byteHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function externalCapacityBundle(selected, keys, context, index,
  states = ["RESERVED"]) {
  const response = verifyOneUseTenderResponseLifecycleV1(
    selected.responseLifecycleSource);
  assert.equal(response.ok, true, response.error);
  const label = `external:${index}`;
  const semanticsPayload = {
    schema: context.semanticsSchema,
    sourceSystemId: context.sourceSystemId,
    verifierId: context.verifierId,
    verifierRevisionHash: context.verifierRevisionHash,
    adapterArtifactHash: context.adapterArtifactHash,
    receiptSchema: context.receiptSchema,
    lifecycleEventSchema: context.lifecycleEventSchema,
    lifecycleHeadSchema: context.lifecycleHeadSchema,
    reservedStatusSemanticCode:
      "RESERVED_MEANS_CAPACITY_HELD_FOR_EXACT_TENDER_SCOPE",
    semanticsEvidenceRefHash: h(`${label}:semantics-evidence`),
    validFrom: "2026-09-02T00:00:00.000Z",
    validUntil: "2026-09-03T00:00:00.000Z",
    issuedAt: "2026-09-02T00:00:00.000Z",
  };
  const semanticsSourceBytes = signedExternalSource("SEMANTICS",
    semanticsPayload, keys);
  const standingPayload = {
    schema: context.standingSchema,
    sourceSystemId: context.sourceSystemId,
    providerRefHash: response.providerRefHash,
    resourceOwnerRefHash: h(`${label}:resource-owner`),
    discoveryRouteObjectHash: response.discoveryRouteObjectHash,
    discoveryCandidateHash: response.discoveryCandidateHash,
    scopeHash: response.scopeHash,
    requirementKind: response.requirementKind,
    requirementId: response.requirementId,
    requirementSetHash: response.requirementSetHash,
    requirementObjectHash: response.requirementObjectHash,
    requirementClassCode: response.requirementClassCode,
    requirementScopeRefHash: response.requirementScopeRefHash,
    quantity: response.quantity,
    unitCode: response.unitCode,
    regionRefHash: response.regionRefHash,
    quantitySemantics: response.quantitySemantics,
    validFrom: "2026-09-02T12:20:00.000Z",
    validUntil: "2026-09-02T14:30:00.000Z",
    issuedAt: "2026-09-02T12:00:00.000Z",
    standingState: "SOURCE_DECLARED_ACTIVE",
    standingEvidenceRefHash: h(`${label}:standing-evidence`),
  };
  const standingSourceBytes = signedExternalSource("STANDING", standingPayload,
    keys);
  const receiptPayload = {
    schema: context.receiptSchema,
    sourceSystemId: context.sourceSystemId,
    sourceReceiptId: `private-receipt-${index}`,
    lifecycleStreamId: `private-capacity-stream-${index}`,
    semanticsSourceHash: byteHash(semanticsSourceBytes),
    standingSourceHash: byteHash(standingSourceBytes),
    oneUseResponseHash: response.initialResponseHash,
    tenderHash: response.tenderHash,
    typedGraphHash: response.typedGraphHash,
    episodeHash: response.episodeHash,
    networkCompleteEpisodeJoinHash: response.networkCompleteEpisodeJoinHash,
    attemptHash: response.attemptHash,
    providerRefHash: response.providerRefHash,
    discoveryRouteObjectHash: response.discoveryRouteObjectHash,
    discoveryCandidateHash: response.discoveryCandidateHash,
    scopeHash: response.scopeHash,
    requirementKind: response.requirementKind,
    requirementId: response.requirementId,
    requirementSetHash: response.requirementSetHash,
    requirementObjectHash: response.requirementObjectHash,
    requirementClassCode: response.requirementClassCode,
    requirementScopeRefHash: response.requirementScopeRefHash,
    quantity: response.quantity,
    unitCode: response.unitCode,
    regionRefHash: response.regionRefHash,
    quantitySemantics: response.quantitySemantics,
    reservedFrom: "2026-09-02T12:20:00.000Z",
    reservedUntil: "2026-09-02T14:00:00.000Z",
    issuedAt: "2026-09-02T12:10:00.000Z",
    status: "RESERVED",
  };
  const receiptSourceBytes = signedExternalSource("RECEIPT", receiptPayload,
    keys);
  const receiptSourceHash = byteHash(receiptSourceBytes);
  const lifecycleEventSourceBytes = [];
  let previous = OUTSIDER_EXTERNAL_CAPACITY_EVENT_GENESIS_V1;
  for (let eventIndex = 0; eventIndex < states.length; eventIndex += 1) {
    const payload = {
      schema: context.lifecycleEventSchema,
      sourceSystemId: context.sourceSystemId,
      lifecycleStreamId: receiptPayload.lifecycleStreamId,
      receiptSourceHash,
      oneUseResponseHash: response.initialResponseHash,
      tenderHash: response.tenderHash,
      providerRefHash: response.providerRefHash,
      scopeHash: response.scopeHash,
      ordinal: eventIndex + 1,
      previousEventSourceHash: previous,
      eventState: states[eventIndex],
      occurredAt: eventIndex === 0 ? "2026-09-02T12:21:00.000Z"
        : "2026-09-02T12:28:00.000Z",
      occurrenceIdentityHash: h(`${label}:event:${eventIndex + 1}`),
    };
    const bytes = signedExternalSource("LIFECYCLE_EVENT", payload, keys);
    lifecycleEventSourceBytes.push(bytes);
    previous = byteHash(bytes);
  }
  const lifecycleHeadPayload = {
    schema: context.lifecycleHeadSchema,
    sourceSystemId: context.sourceSystemId,
    lifecycleStreamId: receiptPayload.lifecycleStreamId,
    receiptSourceHash,
    oneUseResponseHash: response.initialResponseHash,
    tenderHash: response.tenderHash,
    providerRefHash: response.providerRefHash,
    scopeHash: response.scopeHash,
    eventCount: lifecycleEventSourceBytes.length,
    coveredFromOrdinal: 1,
    coveredToOrdinal: lifecycleEventSourceBytes.length,
    headEventSourceHash: previous,
    currentState: states[states.length - 1],
    observedAt: states.length === 1 ? "2026-09-02T12:25:00.000Z"
      : "2026-09-02T12:29:00.000Z",
    occurrencePolicy:
      "EVERY_SOURCE_EVENT_COUNTED_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR",
  };
  const lifecycleHeadSourceBytes = signedExternalSource("LIFECYCLE_HEAD",
    lifecycleHeadPayload, keys);
  const source = {
    tender: selected.responseLifecycleSource.tender,
    expectedTenderHash: selected.responseLifecycleSource.expectedTenderHash,
    responses: selected.responseLifecycleSource.responses,
    responseOccurrences: selected.responseLifecycleSource.occurrences,
    expectedResponseOccurrenceCount:
      selected.responseLifecycleSource.expectedOccurrenceCount,
    expectedResponseLifecycleHeadHash:
      selected.responseLifecycleSource.expectedLifecycleHeadHash,
    verifierContext: context,
    expectedVerifierContextHash: context.verifierContextHash,
    semanticsSourceBytes,
    expectedSemanticsSourceHash: byteHash(semanticsSourceBytes),
    standingSourceBytes,
    expectedStandingSourceHash: byteHash(standingSourceBytes),
    receiptSourceBytes,
    expectedReceiptSourceHash: byteHash(receiptSourceBytes),
    lifecycleEventSourceBytes,
    lifecycleHeadSourceBytes,
    expectedLifecycleHeadSourceHash: byteHash(lifecycleHeadSourceBytes),
    observedAt: selected.responseLifecycleSource.observedAt,
  };
  return { source, checked: verifyExternalCapacityReceiptLifecycleV1(source) };
}

function northStar() {
  const source = createOutcomeFormationTemporaryNetworkNorthStarSourceV1();
  return { source, record: createOutcomeFormationTemporaryNetworkNorthStarV1(
    source) };
}

function fixture(family = FAMILIES[0], options = {}) {
  const tender = compileOutsiderOutcomeTenderV1(tenderInput(family));
  const foundationValue = foundation(tender, family);
  const includedKinds = options.includedKinds ?? [
    "RESOURCE", "EVIDENCE", "RECOVERY",
  ];
  const discoveryValue = discovery(tender, family, includedKinds);
  const selectedKinds = options.selectedKinds ?? includedKinds;
  const selectedRouteResponseSources = selectedKinds.map((kind) => {
    const response = responseLifecycle(tender, discoveryValue.record, family,
      kind, options.terminalKind === kind ? options.terminalState : null);
    return {
      routeObjectHash: response.route.routeObjectHash,
      currentCandidateHash: response.route.currentCandidateHash,
      responseLifecycleSource: response.source,
      expectedResponseLifecycleVerificationHash:
        response.checked.verificationHash,
      externalCapacityLifecycleSource: null,
      expectedExternalCapacityVerificationHash: null,
    };
  });
  const northStarValue = northStar();
  const source = {
    temporaryNetworkId: id("network", `${family.label}:temporary`),
    observedAt: "2026-09-02T12:30:00.000Z",
    northStarReplay: { record: northStarValue.record,
      source: northStarValue.source,
      expectedNorthStarInvariantHash:
        northStarValue.record.northStarInvariantHash },
    foundationBoundEvaluationReplay: { record: foundationValue.record,
      source: foundationValue.source,
      expectedFoundationBoundEvaluationHash:
        foundationValue.record.foundationBoundEvaluationHash },
    routeDiscoveryReplay: { record: discoveryValue.record,
      source: discoveryValue.source,
      expectedSnapshotHash: discoveryValue.record.snapshotHash },
    selectedRouteResponseSources,
  };
  return { tender, foundationValue, discoveryValue, source };
}

function reseal(value) {
  const body = mutable(value);
  delete body.temporaryNetworkHash;
  const state = createHash("sha256");
  state.update(`${OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_SCHEMAS
    .network}\0${canonicalizeStrict(body)}`, "utf8");
  return { ...body, temporaryNetworkHash: `sha256:${state.digest("hex")}` };
}

test("three unrelated outcome families use one generic temporary-network path",
  () => {
    for (let index = 0; index < FAMILIES.length; index += 1) {
      const { source } = fixture(FAMILIES[index]);
      const value = createOutcomeFormationTemporaryNetworkV1(source);
      const checked = verifyOutcomeFormationTemporaryNetworkV1(value, {
        source, expectedTemporaryNetworkHash: value.temporaryNetworkHash,
      });

      assert.equal(value.strongestState,
        OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_STATES
          .callerDeclarations);
      assert.equal(value.disposition,
        "CONTINUE_AUTOMATED_FORMATION_HOLD");
      assert.equal(value.coverageSummary.mandatoryRequirementCount, 3);
      assert.equal(value.coverageSummary.selectedRouteResponseCount, 3);
      assert.equal(value.coverageSummary.mandatoryRouteGapCount, 0);
      assert.equal(value.coverageSummary.mandatoryResponseGapCount, 0);
      assert.equal(value.foundationOneUseCrossBinding
        .primaryResourceResponseProviderRefMatchesOutcomeLevelAcceptance, true);
      assert.equal(value.networkTopology.oneEpisodeScope, true);
      assert.equal(value.networkTopology.episodeScopeCount, 1);
      assert.equal(value.networkTopology.responseOccurrenceDenominatorReduced,
        false);
      assert.equal(value.externalTrustBoundary.externalCapacityEstablished,
        false);
      assert.equal(value.externalTrustBoundary.capacityReserved, false);
      assert.equal(value.authority, "NONE");
      assert.equal(value.actionReady, false);
      assert.equal(value.price, null);
      assert.equal(value.guarantee, null);
      assert.equal(value.settlement, null);
      assert.equal(value.boundary,
        OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_BOUNDARY);
      assert.equal(checked.ok, true, checked.error);
      assert.equal(checked.allDependencySourcesRebuiltAndPinned, true);
      assert.equal(checked.externalCapacityEstablished, false);
      assert.equal(checked.authorityEstablished, false);
    }
  });

test("empty discovery and missing routes/responses keep automated formation running before the deadline",
  () => {
    const cases = [fixture(FAMILIES[0], { includedKinds: [], selectedKinds: [] }),
      fixture(FAMILIES[0], {
        includedKinds: ["RESOURCE", "EVIDENCE"],
        selectedKinds: ["RESOURCE", "EVIDENCE"],
      }), fixture(FAMILIES[0], {
        selectedKinds: ["RESOURCE", "EVIDENCE"],
      })];
    for (let index = 0; index < cases.length; index += 1) {
      const value = createOutcomeFormationTemporaryNetworkV1(cases[index].source);
      assert.equal(value.disposition, "CONTINUE_AUTOMATED_FORMATION_HOLD");
      assert.equal(value.strongestState,
        OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_STATES.forming);
      assert.equal(value.zeroInternalOpsBoundary.humanQueueCreated, false);
      assert.equal(value.zeroInternalOpsBoundary.declineInsteadOfHumanQueue,
        false);
      assert.equal(value.atomicCommitmentGate.userOutcomePromiseIssued, false);
      assert.equal(value.actionReady, false);
    }
  });

test("declined, revoked, and expired one-use lifecycles keep searching before the deadline",
  () => {
    for (const state of ["DECLINED", "REVOKED", "EXPIRED"]) {
      const { source } = fixture(FAMILIES[0], {
        terminalKind: "RECOVERY", terminalState: state,
      });
      const value = createOutcomeFormationTemporaryNetworkV1(source);
      const recovery = value.requirementCoverage.find(
        (row) => row.requirementKind === "RECOVERY");
      assert.equal(recovery.responseState, state);
      assert.equal(recovery.currentCallerDeclaredOneUseResponseReference, false);
      assert.equal(value.coverageSummary.mandatoryResponseGapCount, 1);
      assert.equal(value.disposition, "CONTINUE_AUTOMATED_FORMATION_HOLD");
      assert.equal(value.strongestState,
        OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_STATES.forming);
    }
  });

test("an incomplete atomic promise gate declines automatically at the deadline",
  () => {
    const built = fixture(FAMILIES[0], { includedKinds: [], selectedKinds: [] });
    const deadline = built.tender.formationDeadline;
    const foundationSource = {
      ...built.source.foundationBoundEvaluationReplay.source,
      evaluatedAt: deadline,
    };
    const foundationRecord
      = createOutcomeFormationFoundationBoundEvaluationV1(foundationSource);
    const selectedRouteResponseSources
      = built.source.selectedRouteResponseSources.map((selected) => {
        const responseLifecycleSource = {
          ...selected.responseLifecycleSource,
          observedAt: deadline,
        };
        const checked = verifyOneUseTenderResponseLifecycleV1(
          responseLifecycleSource);
        assert.equal(checked.ok, true, checked.error);
        return { ...selected, responseLifecycleSource,
          expectedResponseLifecycleVerificationHash: checked.verificationHash };
      });
    const source = {
      ...built.source,
      observedAt: deadline,
      foundationBoundEvaluationReplay: {
        record: foundationRecord,
        source: foundationSource,
        expectedFoundationBoundEvaluationHash:
          foundationRecord.foundationBoundEvaluationHash,
      },
      selectedRouteResponseSources,
    };
    const value = createOutcomeFormationTemporaryNetworkV1(source);
    assert.equal(value.formationDeadline.reached, true);
    assert.equal(value.disposition, "DECLINE_NOT_HUMAN_QUEUE");
    assert.equal(value.strongestState,
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_STATES.declined);
    assert.equal(value.atomicCommitmentGate.allRequiredGatesSatisfied, false);
    assert.equal(value.atomicCommitmentGate.userOutcomePromiseIssued, false);
    assert.equal(value.zeroInternalOpsBoundary.humanQueueCreated, false);
    assert.equal(value.zeroInternalOpsBoundary.declineInsteadOfHumanQueue, true);
  });

test("signed external receipt lifecycles replay through every mandatory route but remain trust HOLD",
  () => {
    const built = fixture();
    const keys = externalKeyFixture();
    const context = externalContext(keys);
    const selectedRouteResponseSources
      = built.source.selectedRouteResponseSources.map((selected, index) => {
        const external = externalCapacityBundle(selected, keys, context,
          index + 1);
        assert.equal(external.checked.ok, true, external.checked.error);
        assert.equal(external.checked.sourceBundleCryptographicallyConsistent,
          true);
        assert.equal(external.checked.sourceDeclaredReservationCurrent, true);
        assert.equal(external.checked.independentResourceOwnerTrustAnchorReplayed,
          false);
        assert.equal(external.checked.externalCapacityEstablished, false);
        assert.equal(external.checked.capacityReserved, false);
        return { ...selected,
          externalCapacityLifecycleSource: external.source,
          expectedExternalCapacityVerificationHash:
            external.checked.verificationHash };
      });
    const source = { ...built.source, selectedRouteResponseSources };
    const value = createOutcomeFormationTemporaryNetworkV1(source);
    const checked = verifyOutcomeFormationTemporaryNetworkV1(value, {
      source, expectedTemporaryNetworkHash: value.temporaryNetworkHash,
    });

    assert.equal(value.strongestState,
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_STATES
        .sourceDeclarations);
    assert.equal(value.disposition, "CONTINUE_AUTOMATED_FORMATION_HOLD");
    assert.equal(value.coverageSummary.mandatoryExternalDeclarationCount, 3);
    assert.equal(value.coverageSummary
      .allMandatoryRequirementsHaveCurrentExternalSourceDeclarations, true);
    assert.equal(value.coverageSummary.totalExternalLifecycleOccurrenceCount, 3);
    assert.ok(value.coverageSummary.totalExactExternalSourceByteCount > 0);
    assert.equal(value.coverageSummary.aggregateExternalSourceByteCountPreflight,
      value.coverageSummary.totalExactExternalSourceByteCount);
    assert.equal(value.coverageSummary
      .aggregateExternalSourceByteCountMatchedVerifiedBundles, true);
    assert.ok(value.selectedRouteResponses.every((row) =>
      row.sourceBundleCryptographicallyConsistent === true
      && row.sourceDeclaredReservationCurrent === true
      && row.ownerStandingClaimSigned === true
      && row.independentResourceOwnerTrustAnchorReplayed === false
      && row.externalCapacityEstablished === false
      && row.capacityReserved === false));
    assert.equal(value.externalTrustBoundary.rightsPrivacySourceReplayEstablished,
      false);
    assert.equal(value.externalTrustBoundary
      .rawExternalSourceSystemIdentifierProjected, false);
    assert.equal(value.externalTrustBoundary
      .rawExternalLifecycleStreamIdentifierProjected, false);
    const projection = canonicalizeStrict(value);
    assert.equal(projection.includes("private.capacity.source.system"), false);
    assert.equal(projection.includes("private-capacity-stream-"), false);
    assert.equal(value.atomicCommitmentGate.userOutcomePromiseIssued, false);
    assert.equal(value.externalTrustBoundary.externalCapacityEstablished, false);
    assert.equal(value.authority, "NONE");
    assert.equal(value.actionReady, false);
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.externalCapacityEstablished, false);
  });

test("a signed revoked source head removes the declaration and continues alternatives before deadline",
  () => {
    const built = fixture();
    const keys = externalKeyFixture();
    const context = externalContext(keys);
    const selectedRouteResponseSources
      = built.source.selectedRouteResponseSources.map((selected, index) => {
        if (index !== 0) return selected;
        const external = externalCapacityBundle(selected, keys, context, 1,
          ["RESERVED", "REVOKED"]);
        assert.equal(external.checked.ok, true, external.checked.error);
        assert.equal(external.checked.externalLifecycleState, "REVOKED");
        assert.equal(external.checked.sourceDeclaredReservationCurrent, false);
        return { ...selected,
          externalCapacityLifecycleSource: external.source,
          expectedExternalCapacityVerificationHash:
            external.checked.verificationHash };
      });
    const source = { ...built.source, selectedRouteResponseSources };
    const value = createOutcomeFormationTemporaryNetworkV1(source);
    assert.equal(value.coverageSummary.mandatoryExternalContradictionCount, 1);
    assert.equal(value.strongestState,
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_STATES.forming);
    assert.equal(value.disposition, "CONTINUE_AUTOMATED_FORMATION_HOLD");
    assert.equal(value.atomicCommitmentGate.userOutcomePromiseIssued, false);
    assert.equal(value.externalTrustBoundary.capacityReserved, false);
  });

test("stale external heads and missing external occurrence denominators fail source replay",
  () => {
    const built = fixture();
    const keys = externalKeyFixture();
    const selected = built.source.selectedRouteResponseSources[0];

    const stale = externalCapacityBundle(selected, keys,
      externalContext(keys, 60_000), 1);
    assert.equal(stale.checked.ok, false);
    const staleRows = built.source.selectedRouteResponseSources.map(
      (row, index) => index === 0 ? { ...row,
        externalCapacityLifecycleSource: stale.source,
        expectedExternalCapacityVerificationHash: h("stale-verification") }
        : row);
    assert.throws(() => createOutcomeFormationTemporaryNetworkV1({
      ...built.source, selectedRouteResponseSources: staleRows,
    }), /OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_/u);

    const valid = externalCapacityBundle(selected, keys,
      externalContext(keys), 2);
    assert.equal(valid.checked.ok, true, valid.checked.error);
    const missingDenominatorSource = { ...valid.source,
      lifecycleEventSourceBytes: [] };
    const missing = verifyExternalCapacityReceiptLifecycleV1(
      missingDenominatorSource);
    assert.equal(missing.ok, false);
    const missingRows = built.source.selectedRouteResponseSources.map(
      (row, index) => index === 0 ? { ...row,
        externalCapacityLifecycleSource: missingDenominatorSource,
        expectedExternalCapacityVerificationHash: h("missing-denominator") }
        : row);
    assert.throws(() => createOutcomeFormationTemporaryNetworkV1({
      ...built.source, selectedRouteResponseSources: missingRows,
    }), /OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_/u);
  });

test("selected routes and aggregate external bytes are bounded before verifier fanout",
  () => {
    const built = fixture();
    assert.throws(() => createOutcomeFormationTemporaryNetworkV1({
      ...built.source,
      selectedRouteResponseSources: [
        ...built.source.selectedRouteResponseSources,
        built.source.selectedRouteResponseSources[0],
      ],
    }), /SELECTED_ROUTE_RESPONSE_COUNT_EXCEEDS_TENDER_REQUIREMENT_COUNT/u);

    const keys = externalKeyFixture();
    const external = externalCapacityBundle(
      built.source.selectedRouteResponseSources[0], keys,
      externalContext(keys), 1);
    assert.equal(external.checked.ok, true, external.checked.error);
    let proxyLengthReads = 0;
    const proxiedBuffer = new Proxy(Buffer.alloc(1), {
      get(target, property, receiver) {
        if (property === "length") {
          proxyLengthReads += 1;
          throw new Error("PROXY_LENGTH_TRAP_MUST_NOT_RUN");
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const proxied = { ...external.source,
      semanticsSourceBytes: proxiedBuffer };
    const proxiedRows = built.source.selectedRouteResponseSources.map(
      (selected, index) => index === 0 ? { ...selected,
        externalCapacityLifecycleSource: proxied,
        expectedExternalCapacityVerificationHash:
          external.checked.verificationHash } : selected);
    assert.throws(() => createOutcomeFormationTemporaryNetworkV1({
      ...built.source, selectedRouteResponseSources: proxiedRows,
    }), /EXTERNAL_SOURCE_PREFLIGHT_BUFFER_REQUIRED/u);
    assert.equal(proxyLengthReads, 0);

    const oversized = { ...external.source,
      semanticsSourceBytes: Buffer.alloc(
        OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_LIMITS
          .maximumAggregateExternalSourceBytes + 1) };
    const selectedRouteResponseSources
      = built.source.selectedRouteResponseSources.map((selected, index) =>
        index === 0 ? { ...selected,
          externalCapacityLifecycleSource: oversized,
          expectedExternalCapacityVerificationHash:
            external.checked.verificationHash } : selected);
    assert.throws(() => createOutcomeFormationTemporaryNetworkV1({
      ...built.source, selectedRouteResponseSources,
    }), /AGGREGATE_EXTERNAL_SOURCE_BYTES_EXCEEDED/u);
  });

test("route-response splices and wrong dependency pins cannot build", () => {
  const { source } = fixture();
  const splice = { ...source, selectedRouteResponseSources:
    source.selectedRouteResponseSources.map((row) => ({ ...row })) };
  splice.selectedRouteResponseSources[0].routeObjectHash
    = splice.selectedRouteResponseSources[1].routeObjectHash;
  assert.throws(() => createOutcomeFormationTemporaryNetworkV1(splice),
    /OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_/u);

  const wrongPin = { ...source, routeDiscoveryReplay: {
    ...source.routeDiscoveryReplay, expectedSnapshotHash: h("wrong-pin") } };
  assert.throws(() => createOutcomeFormationTemporaryNetworkV1(wrongPin),
    /OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_/u);
});

test("rehashed and all-true output poisoning fails full source rebuild", () => {
  const { source } = fixture();
  const value = createOutcomeFormationTemporaryNetworkV1(source);
  const poisoned = mutable(value);
  poisoned.externalTrustBoundary.externalCapacityEstablished = true;
  poisoned.externalTrustBoundary.capacityReserved = true;
  poisoned.authorityBoundary.enabledCapabilities = ["EXECUTE"];
  poisoned.authorityBoundary.enabledCapabilityCount = 1;
  poisoned.authority = "FULL";
  poisoned.actionReady = true;
  poisoned.executable = true;
  poisoned.price = { amountMinor: "1", currency: "USD" };
  poisoned.guarantee = { promised: true };
  poisoned.settlement = { permitted: true };
  const forged = reseal(poisoned);
  const checked = verifyOutcomeFormationTemporaryNetworkV1(forged, {
    source, expectedTemporaryNetworkHash: forged.temporaryNetworkHash,
  });
  assert.equal(checked.ok, false);
  assert.equal(checked.externalCapacityEstablished, false);
  assert.equal(checked.capacityReserved, false);
  assert.equal(checked.authorityEstablished, false);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.actionReady, false);
  assert.equal(checked.executable, false);
  assert.equal(checked.price, null);
  assert.equal(checked.guarantee, null);
  assert.equal(checked.settlement, null);
});

test("output-only verification is impossible", () => {
  const { source } = fixture();
  const value = createOutcomeFormationTemporaryNetworkV1(source);
  const checked = verifyOutcomeFormationTemporaryNetworkV1(value, {
    source: value,
    expectedTemporaryNetworkHash: value.temporaryNetworkHash,
  });
  assert.equal(checked.ok, false);
  assert.equal(checked.allDependencySourcesRebuiltAndPinned, false);
  assert.equal(checked.authority, "NONE");
});
