/*
 * Injected end-to-end temporary-network formation slice v1.
 *
 * This coordinator wiring joins an existing source-replayed outcome tender and
 * multi-slot coordinator to three seller-owned injected HTTP endpoints. The
 * endpoint responses are independently replayed with the existing external
 * capacity lifecycle verifier. It performs no discovery, live HTTP, payment,
 * or action. Three different hashes/keys/routes are structural separation,
 * never proof of independent control. Seller source declarations remain HOLD
 * until external owner trust, capacity truth, and an independent outcome
 * witness receipt exist.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { handleSellerOwnedHttpOneUseTenderRequestV1 }
  from "./outsider-seller-owned-http-one-use-tender-endpoint-v1.js";
import { verifyExternalCapacityReceiptLifecycleV1 }
  from "./outsider-one-use-tender-response-lifecycle-v1.js";
import { verifyOutcomeFormationTemporaryNetworkCoordinatorV1 }
  from "./outsider-outcome-formation-temporary-network-coordinator-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const PREFIX = "OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const STRICT_BASE64
  = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const ROLE_TO_KIND = Object.freeze({
  PRIMARY: "RESOURCE",
  RECOVERY: "RECOVERY",
  INDEPENDENT_WITNESS: "EVIDENCE",
});
const ROLES = Object.freeze(Object.keys(ROLE_TO_KIND));

export const OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_SCHEMAS
  = Object.freeze({
    formation:
      "outsider/injected-seller-temporary-network-formation-slice/v1",
  });

export const OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_BOUNDARY
  = Object.freeze({
    position: "INJECTED_THREE_SLOT_SELLER_ENDPOINT_FORMATION_HOLD_ONLY",
    requiredRoles: ROLES,
    roleRequirementMapping: ROLE_TO_KIND,
    existingTenderVerifierReused: true,
    existingTemporaryNetworkCoordinatorReused: true,
    existingSellerHttpEndpointReused: true,
    existingExternalCapacityLifecycleVerifierReused: true,
    newVerifierCreated: false,
    newLedgerCreated: false,
    parallelInjectedDispatch: true,
    liveHttpPerformed: false,
    discoveryPerformed: false,
    paymentPerformed: false,
    providerRegistrationRequired: false,
    missingSlotCreatesHumanQueue: false,
    incompleteAtOrAfterDeadlineDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    incompleteBeforeDeadlineDisposition: "CONTINUE_AUTOMATED_FORMATION_HOLD",
    hashKeyRouteOrOwnerInequalityProvesIndependentControl: false,
    sellerSignedOfferEstablishesOwnerAuthority: false,
    sellerSignedCapacitySourcesEstablishExternalCapacity: false,
    sellerWitnessChallengeIsIndependentWitnessReceipt: false,
    independentWitnessReceiptPresent: false,
    atomicCommitWithoutAllExternalTruthPermitted: false,
    externalOwnerTrustEstablished: false,
    primaryCapacityReserved: false,
    recoveryCapacityReserved: false,
    independentWitnessCapacityReserved: false,
    independentWitnessOutcomeTruthEstablished: false,
    atomicCommit: false,
    userOutcomePromiseIssued: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, fields[index]);
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function parseCanonical(bytes, code) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2
    || bytes.length > 8 * 1024 * 1024) fail(`${code}_BYTES_INVALID`);
  const copy = Buffer.from(bytes);
  const text = copy.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(copy)) fail(`${code}_UTF8_INVALID`);
  let value;
  try { value = JSON.parse(text); } catch { fail(`${code}_JSON_INVALID`); }
  if (canonicalizeStrict(value) !== text) fail(`${code}_NOT_CANONICAL`);
  return value;
}

function decodeBase64(value, code) {
  if (typeof value !== "string" || !STRICT_BASE64.test(value)) {
    fail(`${code}_BASE64_INVALID`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 2 || bytes.toString("base64") !== value) {
    fail(`${code}_BASE64_INVALID`);
  }
  return bytes;
}

function role(value) {
  if (!Object.hasOwn(ROLE_TO_KIND, value)) fail("SLOT_ROLE_INVALID");
  return value;
}

const SLOT_FIELDS = Object.freeze([
  "role", "endpoint", "httpRequest", "verifierContext",
  "expectedVerifierContextHash",
]);

function failedSlot(selectedRole, statusCode, errorCode) {
  return Object.freeze({
    role: selectedRole,
    requirementKind: Object.hasOwn(ROLE_TO_KIND, selectedRole)
      ? ROLE_TO_KIND[selectedRole] : null,
    endpointStatusCode: statusCode,
    errorCode,
    endpointReturnedSignedSources: false,
    sourceBundleCryptographicallyConsistent: false,
    sourceDeclaredReservationCurrent: false,
    independentOwnerTrustEstablished: false,
    capacityReserved: false,
    independentWitnessReceiptPresent: false,
    authority: "NONE",
  });
}

async function invokeSlot(invocation, tender, coordinator) {
  let selectedRole = null;
  try {
    exactObject(invocation, SLOT_FIELDS, "SLOT_INVOCATION");
    selectedRole = role(invocation.role);
    hash(invocation.expectedVerifierContextHash,
      "EXPECTED_VERIFIER_CONTEXT_HASH");
    if (invocation.endpoint.expectedTenderHash !== tender.tenderHash) {
      fail("ENDPOINT_TENDER_MISMATCH");
    }
    /* Deliberately schedule every synchronous injected handler from the same
       Promise fanout boundary. No claim of live transport concurrency. */
    const http = await Promise.resolve().then(() =>
      handleSellerOwnedHttpOneUseTenderRequestV1(
        invocation.endpoint, invocation.httpRequest));
    if (http.statusCode !== 200) {
      let errorCode = "SELLER_ENDPOINT_HOLD";
      try {
        const error = parseCanonical(http.bodyBytes, "ENDPOINT_ERROR");
        if (typeof error.errorCode === "string") errorCode = error.errorCode;
      } catch { /* finite fallback */ }
      return failedSlot(selectedRole, http.statusCode, errorCode);
    }
    const body = parseCanonical(http.bodyBytes, "ENDPOINT_RESPONSE");
    if (body.schema !== "outsider/seller-owned-http-one-use-tender-response/v1"
      || body.exactSourceDocumentCount !== 5
      || body.tenderHash !== tender.tenderHash
      || body.capacityReserved !== false || body.authority !== "NONE"
      || body.sellerSignedSourcesAreIndependentWitness !== false
      || body.independentWitnessReceiptPresent !== false) {
      fail("ENDPOINT_RESPONSE_BOUNDARY_INVALID");
    }
    const request = parseCanonical(invocation.httpRequest.bodyBytes,
      "ENDPOINT_REQUEST");
    const source = body.sourceDocuments;
    if (source === null || typeof source !== "object"
      || source.encoding !== "base64" || !Array.isArray(source.lifecycleEvents)
      || source.lifecycleEvents.length !== 1) {
      fail("SOURCE_DOCUMENT_SET_INVALID");
    }
    const semantics = decodeBase64(source.semantics, "SEMANTICS");
    const standing = decodeBase64(source.standing, "STANDING");
    const receipt = decodeBase64(source.receipt, "RECEIPT");
    const event = decodeBase64(source.lifecycleEvents[0], "EVENT");
    const head = decodeBase64(source.lifecycleHead, "HEAD");
    const manifest = body.sourceBundleManifest;
    const checked = verifyExternalCapacityReceiptLifecycleV1({
      tender: request.tender,
      expectedTenderHash: request.expectedTenderHash,
      responses: request.responses,
      responseOccurrences: request.responseOccurrences,
      expectedResponseOccurrenceCount:
        request.expectedResponseOccurrenceCount,
      expectedResponseLifecycleHeadHash:
        request.expectedResponseLifecycleHeadHash,
      verifierContext: invocation.verifierContext,
      expectedVerifierContextHash: invocation.expectedVerifierContextHash,
      semanticsSourceBytes: semantics,
      expectedSemanticsSourceHash: manifest.sourceHashes.semanticsSourceHash,
      standingSourceBytes: standing,
      expectedStandingSourceHash: manifest.sourceHashes.standingSourceHash,
      receiptSourceBytes: receipt,
      expectedReceiptSourceHash: manifest.sourceHashes.receiptSourceHash,
      lifecycleEventSourceBytes: [event],
      lifecycleHeadSourceBytes: head,
      expectedLifecycleHeadSourceHash:
        manifest.sourceHashes.lifecycleHeadSourceHash,
      observedAt: invocation.endpoint.emissionObservedAt,
    });
    const expectedKind = ROLE_TO_KIND[selectedRole];
    if (!checked.ok || !checked.sourceBundleCryptographicallyConsistent
      || !checked.sourceDeclaredReservationCurrent
      || checked.requirementKind !== expectedKind
      || checked.tenderHash !== tender.tenderHash
      || checked.capacityReserved !== false || checked.authority !== "NONE") {
      fail("CAPACITY_SOURCE_REPLAY_INVALID");
    }
    const baseline = coordinator.mandatoryNetworkCoverage.slots.find(
      (item) => item.requirementKind === expectedKind
        && item.requirementId === checked.requirementId);
    if (!baseline || baseline.providerRefHash !== checked.providerRefHash
      || baseline.routeObjectHash !== checked.discoveryRouteObjectHash
      || baseline.currentCandidateHash !== checked.discoveryCandidateHash) {
      fail("COORDINATOR_SLOT_CROSS_BINDING_INVALID");
    }
    const standingEnvelope = parseCanonical(standing, "STANDING_SOURCE");
    const resourceOwnerRefHash = hash(
      standingEnvelope.payload?.resourceOwnerRefHash,
      "RESOURCE_OWNER_REF_HASH");
    return Object.freeze({
      role: selectedRole,
      requirementKind: expectedKind,
      requirementId: checked.requirementId,
      providerRefHash: checked.providerRefHash,
      resourceOwnerRefHash,
      routeObjectHash: checked.discoveryRouteObjectHash,
      sourceKeyId: invocation.verifierContext.sourceKeyId,
      oneUseResponseHash: checked.oneUseResponseHash,
      sourceBundleManifestHash: manifest.sourceBundleManifestHash,
      endpointStatusCode: 200,
      errorCode: null,
      endpointReturnedSignedSources: true,
      sourceBundleCryptographicallyConsistent: true,
      sourceDeclaredReservationCurrent: true,
      independentOwnerTrustEstablished: false,
      capacityReserved: false,
      independentWitnessReceiptPresent: false,
      authority: "NONE",
    });
  } catch {
    return failedSlot(selectedRole, 500, "SLOT_REPLAY_HOLD");
  }
}

const INPUT_FIELDS = Object.freeze([
  "tender", "expectedTenderHash", "coordinatorReplay", "slotInvocations",
  "observedAt",
]);
const COORDINATOR_FIELDS = Object.freeze(["source", "expectedCoordinatorHash"]);

export async function formInjectedTemporaryNetworkV1(input = {}) {
  exactObject(input, INPUT_FIELDS, "FORMATION_INPUT");
  exactObject(input.coordinatorReplay, COORDINATOR_FIELDS,
    "COORDINATOR_REPLAY");
  const expectedTenderHash = hash(input.expectedTenderHash,
    "EXPECTED_TENDER_HASH");
  const observedAt = instant(input.observedAt, "OBSERVED_AT");
  const tenderCheck = verifyOutsiderOutcomeTenderV1(input.tender,
    { expectedTenderHash });
  if (!tenderCheck.ok) fail("TENDER_REPLAY_FAILED");
  const expectedCoordinatorHash = hash(
    input.coordinatorReplay.expectedCoordinatorHash,
    "EXPECTED_COORDINATOR_HASH");
  const coordinator = verifyOutcomeFormationTemporaryNetworkCoordinatorV1(
    input.coordinatorReplay.source, expectedCoordinatorHash);
  if (!coordinator.ok
    || coordinator.tenderBinding.tenderHash !== expectedTenderHash
    || coordinator.atomicCommitmentGate.atomicCommitmentGateSatisfied !== false
    || coordinator.authority !== "NONE") fail("COORDINATOR_REPLAY_FAILED");
  if (!Array.isArray(input.slotInvocations)
    || input.slotInvocations.length > ROLES.length) {
    fail("SLOT_INVOCATIONS_INVALID");
  }
  const slotResults = await Promise.all(input.slotInvocations.map(
    (invocation) => invokeSlot(invocation, input.tender, coordinator)));
  const seenRoles = new Set();
  let duplicateRole = false;
  for (const item of slotResults) {
    if (item.role !== null && seenRoles.has(item.role)) duplicateRole = true;
    if (item.role !== null) seenRoles.add(item.role);
  }
  const missingRoles = ROLES.filter((item) => !seenRoles.has(item));
  const successful = slotResults.filter((item) =>
    item.endpointReturnedSignedSources === true
      && item.sourceBundleCryptographicallyConsistent === true);
  const providerRefs = new Set(successful.map((item) => item.providerRefHash));
  const ownerRefs = new Set(successful.map((item) => item.resourceOwnerRefHash));
  const sourceKeys = new Set(successful.map((item) => item.sourceKeyId));
  const routeRefs = new Set(successful.map((item) => item.routeObjectHash));
  const allRolesStructurallyPresent = missingRoles.length === 0
    && !duplicateRole && slotResults.length === ROLES.length;
  const allEndpointsReturned = allRolesStructurallyPresent
    && successful.length === ROLES.length;
  const structuralSeparationObserved = allEndpointsReturned
    && providerRefs.size === 3 && ownerRefs.size === 3
    && sourceKeys.size === 3 && routeRefs.size === 3;
  const deadlineReached = Date.parse(observedAt)
    >= Date.parse(input.tender.formationDeadline);
  const disposition = deadlineReached
    ? "DECLINE_NOT_HUMAN_QUEUE" : "CONTINUE_AUTOMATED_FORMATION_HOLD";
  const gapCodes = [];
  if (!allRolesStructurallyPresent) gapCodes.push("MANDATORY_SLOT_MISSING_OR_DUPLICATE");
  if (!allEndpointsReturned) gapCodes.push("SELLER_ENDPOINT_RESPONSE_INCOMPLETE");
  if (!structuralSeparationObserved) gapCodes.push("THREE_SLOT_STRUCTURAL_SEPARATION_INCOMPLETE");
  gapCodes.push("EXTERNAL_RESOURCE_OWNER_TRUST_NOT_ESTABLISHED");
  gapCodes.push("PRIMARY_AND_RECOVERY_CAPACITY_NOT_EXTERNALLY_ESTABLISHED");
  gapCodes.push("INDEPENDENT_WITNESS_RECEIPT_NOT_PRESENT");
  gapCodes.push("ATOMIC_COMMIT_PREMISES_INCOMPLETE");
  const publicSlots = slotResults.map((item) => {
    const { resourceOwnerRefHash: _owner, sourceKeyId: _key, ...projection }
      = item;
    return projection;
  });
  const body = {
    schema: OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_SCHEMAS
      .formation,
    schemaVersion: "1.0.0",
    recordClass: "INJECTED_THREE_SLOT_TEMPORARY_NETWORK_FORMATION",
    tenderHash: expectedTenderHash,
    coordinatorHash: expectedCoordinatorHash,
    observedAt,
    formationDeadline: input.tender.formationDeadline,
    deadlineReached,
    parallelFormationAttempted: true,
    parallelDispatchCount: input.slotInvocations.length,
    requiredRoles: ROLES,
    missingRoles,
    duplicateRoleDetected: duplicateRole,
    slots: publicSlots,
    allRolesStructurallyPresent,
    allSellerEndpointsReturnedSignedSources: allEndpointsReturned,
    allReturnedSourceBundlesCryptographicallyConsistent:
      allEndpointsReturned,
    allSourceDeclaredReservationsCurrent: allEndpointsReturned,
    distinctProviderRefCount: providerRefs.size,
    distinctResourceOwnerRefCount: ownerRefs.size,
    distinctSellerSourceKeyCount: sourceKeys.size,
    distinctRouteObjectCount: routeRefs.size,
    threeSlotStructuralSeparationObserved: structuralSeparationObserved,
    hashKeyRouteOrOwnerInequalityProvesIndependentControl: false,
    independentControlEstablished: false,
    externalResourceOwnerTrustEstablished: false,
    primaryCapacityReserved: false,
    recoveryCapacityReserved: false,
    independentWitnessCapacityReserved: false,
    independentWitnessReceiptPresent: false,
    independentWitnessOutcomeTruthEstablished: false,
    sellerSignedOfferedResponsePresent: successful.length > 0,
    sellerSignedOfferMintsAuthorityOrCapacity: false,
    atomicCommitmentGateSatisfied: false,
    atomicCommit: false,
    userOutcomePromiseIssued: false,
    disposition,
    humanQueueCreated: false,
    internalHumanFallbackPermitted: false,
    gapCodes,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    boundary:
      OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_BOUNDARY,
  };
  return Object.freeze({
    ...body,
    formationHash: digest(
      OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_SCHEMAS.formation,
      body),
  });
}

