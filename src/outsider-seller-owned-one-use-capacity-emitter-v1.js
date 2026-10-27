/*
 * Seller-owned one-use capacity emitter v1.
 *
 * This is the producer-side seam for the already-frozen external-capacity
 * replay contract. A seller-controlled process keeps its Ed25519 private key
 * in a sealed in-process capability and emits the five exact signed source
 * documents consumed by verifyExternalCapacityReceiptLifecycleV1. It also
 * emits a challenge binding those sources to a separately discovered witness
 * route. No network I/O, discovery, payment, authority, capacity truth, or
 * outcome truth is created here. A seller declaration is not an independent
 * witness. Process-lifetime duplicate suppression is explicit and is not a
 * substitute for a durable seller-side nonce store.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
} from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_EXTERNAL_CAPACITY_EVENT_GENESIS_V1,
  externalCapacitySourceSigningMessageV1,
  verifyExternalCapacityReceiptLifecycleV1,
  verifyExternalCapacityVerifierContextV1,
  verifyOneUseTenderResponseLifecycleV1,
} from "./outsider-one-use-tender-response-lifecycle-v1.js";

const PREFIX = "OUTSIDER_SELLER_OWNED_ONE_USE_CAPACITY_EMITTER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const CAPABILITY_STATE = new WeakMap();

export const OUTSIDER_SELLER_OWNED_ONE_USE_CAPACITY_EMITTER_V1_SCHEMAS
  = Object.freeze({
    capability: "outsider/seller-owned-one-use-capacity-emitter-capability/v1",
    sourceBundleManifest:
      "outsider/seller-owned-one-use-capacity-source-bundle-manifest/v1",
    witnessChallenge:
      "outsider/seller-owned-one-use-capacity-witness-challenge/v1",
    emission: "outsider/seller-owned-one-use-capacity-emission/v1",
  });

export const OUTSIDER_SELLER_OWNED_ONE_USE_CAPACITY_EMITTER_V1_BOUNDARY
  = Object.freeze({
    position: "SELLER_SIDE_SIGNED_SOURCE_PRODUCTION_HOLD_ONLY",
    sellerControlledPrivateKeyRequired: true,
    privateKeyProjected: false,
    existingCapacityReplayContractReused: true,
    newCapacityVerifierCreated: false,
    exactTenderResponseAndScopeBound: true,
    sourceBundleContainsFiveSignedDocuments: true,
    duplicateEmissionSuppressedWithinProcess: true,
    durableNonceConsumptionEstablished: false,
    restartSafeOneUseEstablished: false,
    witnessRouteCallerPinnedOnly: true,
    witnessRouteIndependentlyDiscoveredByThisModule: false,
    sellerDeclarationIsIndependentWitness: false,
    independentWitnessReceiptPresent: false,
    providerRegistrationRequired: false,
    networkIoPerformed: false,
    externalResourceContacted: false,
    sourceDeclarationEstablishesLegalIdentity: false,
    sourceDeclarationEstablishesOwnerAuthority: false,
    sourceDeclarationEstablishesCapacity: false,
    sourceDeclarationEstablishesOutcome: false,
    rightsEstablished: false,
    privacyEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    pricePresent: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
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

function token(value, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(`${code}_INVALID`);
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

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha256Bytes(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function signedSource(kind, payload, state) {
  const signature = cryptoSign(null,
    externalCapacitySourceSigningMessageV1(kind, payload), state.privateKey);
  return Buffer.from(canonicalizeStrict({
    payload,
    signature: {
      algorithm: "ED25519",
      keyId: state.context.sourceKeyId,
      valueBase64: signature.toString("base64"),
    },
  }), "utf8");
}

function capabilityState(capability) {
  if (capability === null || typeof capability !== "object"
    || !CAPABILITY_STATE.has(capability)) fail("CAPABILITY_INVALID");
  return CAPABILITY_STATE.get(capability);
}

const CAPABILITY_INPUT_FIELDS = Object.freeze([
  "verifierContext", "expectedVerifierContextHash", "sellerPrivateKeyPem",
]);

export function createSellerOwnedOneUseCapacityEmitterV1(input = {}) {
  exactObject(input, CAPABILITY_INPUT_FIELDS, "CAPABILITY_INPUT");
  const contextCheck = verifyExternalCapacityVerifierContextV1(
    input.verifierContext,
    { expectedVerifierContextHash: input.expectedVerifierContextHash });
  if (!contextCheck.ok) fail("VERIFIER_CONTEXT_NOT_REPLAYABLE");
  if (typeof input.sellerPrivateKeyPem !== "string"
    || Buffer.byteLength(input.sellerPrivateKeyPem, "utf8") > 16_384) {
    fail("SELLER_PRIVATE_KEY_INVALID");
  }
  let privateKey;
  try { privateKey = createPrivateKey(input.sellerPrivateKeyPem); }
  catch { fail("SELLER_PRIVATE_KEY_INVALID"); }
  if (privateKey.asymmetricKeyType !== "ed25519") {
    fail("SELLER_PRIVATE_KEY_NOT_ED25519");
  }
  const derivedPublicKey = createPublicKey(privateKey);
  const derivedKeyId = sha256Bytes(
    derivedPublicKey.export({ type: "spki", format: "der" }));
  if (derivedKeyId !== contextCheck.context.sourceKeyId) {
    fail("SELLER_PRIVATE_KEY_CONTEXT_MISMATCH");
  }
  const profileBody = {
    schema:
      OUTSIDER_SELLER_OWNED_ONE_USE_CAPACITY_EMITTER_V1_SCHEMAS.capability,
    schemaVersion: "1.0.0",
    recordClass: "SEALED_SELLER_SIDE_CAPACITY_SOURCE_EMITTER",
    verifierContextHash: contextCheck.context.verifierContextHash,
    sourceKeyId: contextCheck.context.sourceKeyId,
    privateKeyProjected: false,
    processLifetimeDuplicateSuppression: true,
    durableNonceConsumptionEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  const capability = Object.freeze({
    ...profileBody,
    interfaceProfileHash: digest(
      OUTSIDER_SELLER_OWNED_ONE_USE_CAPACITY_EMITTER_V1_SCHEMAS.capability,
      profileBody),
  });
  CAPABILITY_STATE.set(capability, {
    context: contextCheck.context,
    privateKey,
    emittedResponseHashes: new Set(),
  });
  return capability;
}

const EMISSION_INPUT_FIELDS = Object.freeze([
  "tender", "expectedTenderHash", "responses", "responseOccurrences",
  "expectedResponseOccurrenceCount", "expectedResponseLifecycleHeadHash",
  "observedAt", "sourceEvidence", "reservation", "witnessRequest",
]);
const SOURCE_EVIDENCE_FIELDS = Object.freeze([
  "semanticsEvidenceRefHash", "resourceOwnerRefHash",
  "standingEvidenceRefHash", "semanticsValidFrom", "semanticsValidUntil",
  "semanticsIssuedAt", "standingValidFrom", "standingValidUntil",
  "standingIssuedAt",
]);
const RESERVATION_FIELDS = Object.freeze([
  "sourceReceiptId", "lifecycleStreamId", "reservedFrom", "reservedUntil",
  "receiptIssuedAt", "eventOccurredAt", "occurrenceIdentityHash",
  "lifecycleHeadObservedAt",
]);
const WITNESS_REQUEST_FIELDS = Object.freeze([
  "witnessRouteObjectHash", "witnessCandidateHash",
  "witnessRequirementRefHash", "witnessControllerSeparationPolicyRefHash",
  "requestedAt", "observationDeadline",
]);

function validateEmissionInput(input) {
  exactObject(input, EMISSION_INPUT_FIELDS, "EMISSION_INPUT");
  exactObject(input.sourceEvidence, SOURCE_EVIDENCE_FIELDS, "SOURCE_EVIDENCE");
  exactObject(input.reservation, RESERVATION_FIELDS, "RESERVATION");
  exactObject(input.witnessRequest, WITNESS_REQUEST_FIELDS, "WITNESS_REQUEST");
  hash(input.sourceEvidence.semanticsEvidenceRefHash,
    "SEMANTICS_EVIDENCE_REF_HASH");
  hash(input.sourceEvidence.resourceOwnerRefHash, "RESOURCE_OWNER_REF_HASH");
  hash(input.sourceEvidence.standingEvidenceRefHash,
    "STANDING_EVIDENCE_REF_HASH");
  token(input.reservation.sourceReceiptId, "SOURCE_RECEIPT_ID");
  token(input.reservation.lifecycleStreamId, "LIFECYCLE_STREAM_ID");
  hash(input.reservation.occurrenceIdentityHash, "OCCURRENCE_IDENTITY_HASH");
  hash(input.witnessRequest.witnessRouteObjectHash,
    "WITNESS_ROUTE_OBJECT_HASH");
  hash(input.witnessRequest.witnessCandidateHash, "WITNESS_CANDIDATE_HASH");
  hash(input.witnessRequest.witnessRequirementRefHash,
    "WITNESS_REQUIREMENT_REF_HASH");
  hash(input.witnessRequest.witnessControllerSeparationPolicyRefHash,
    "WITNESS_CONTROLLER_SEPARATION_POLICY_REF_HASH");
  const timeFields = [
    [input.observedAt, "OBSERVED_AT"],
    [input.sourceEvidence.semanticsValidFrom, "SEMANTICS_VALID_FROM"],
    [input.sourceEvidence.semanticsValidUntil, "SEMANTICS_VALID_UNTIL"],
    [input.sourceEvidence.semanticsIssuedAt, "SEMANTICS_ISSUED_AT"],
    [input.sourceEvidence.standingValidFrom, "STANDING_VALID_FROM"],
    [input.sourceEvidence.standingValidUntil, "STANDING_VALID_UNTIL"],
    [input.sourceEvidence.standingIssuedAt, "STANDING_ISSUED_AT"],
    [input.reservation.reservedFrom, "RESERVED_FROM"],
    [input.reservation.reservedUntil, "RESERVED_UNTIL"],
    [input.reservation.receiptIssuedAt, "RECEIPT_ISSUED_AT"],
    [input.reservation.eventOccurredAt, "EVENT_OCCURRED_AT"],
    [input.reservation.lifecycleHeadObservedAt, "HEAD_OBSERVED_AT"],
    [input.witnessRequest.requestedAt, "WITNESS_REQUESTED_AT"],
    [input.witnessRequest.observationDeadline, "WITNESS_DEADLINE"],
  ];
  for (let index = 0; index < timeFields.length; index += 1) {
    instant(timeFields[index][0], timeFields[index][1]);
  }
}

function bindingFields(response) {
  return {
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
  };
}

export function emitSellerOwnedOneUseCapacityReservationV1(
  capability, input = {}) {
  const state = capabilityState(capability);
  validateEmissionInput(input);
  const response = verifyOneUseTenderResponseLifecycleV1({
    tender: input.tender,
    expectedTenderHash: input.expectedTenderHash,
    responses: input.responses,
    occurrences: input.responseOccurrences,
    expectedOccurrenceCount: input.expectedResponseOccurrenceCount,
    expectedLifecycleHeadHash: input.expectedResponseLifecycleHeadHash,
    observedAt: input.observedAt,
  });
  if (!response.ok || !response.currentCallerDeclaredOneUseOfferReference
    || response.currentResponseState !== "OFFERED") {
    fail("CURRENT_OFFERED_RESPONSE_REQUIRED");
  }
  if (state.emittedResponseHashes.has(response.initialResponseHash)) {
    fail("RESPONSE_ALREADY_EMITTED_IN_THIS_PROCESS");
  }
  if (input.witnessRequest.witnessRouteObjectHash
      === response.discoveryRouteObjectHash
    || input.witnessRequest.witnessCandidateHash
      === response.discoveryCandidateHash) {
    fail("WITNESS_ROUTE_MUST_DIFFER_FROM_PROVIDER_ROUTE");
  }
  if (Date.parse(input.witnessRequest.requestedAt)
      < Date.parse(input.reservation.lifecycleHeadObservedAt)
    || Date.parse(input.witnessRequest.observationDeadline)
      <= Date.parse(input.witnessRequest.requestedAt)
    || Date.parse(input.witnessRequest.observationDeadline)
      > Date.parse(input.tender.exactOutcome.deadline)) {
    fail("WITNESS_REQUEST_WINDOW_INVALID");
  }

  const context = state.context;
  const bindings = bindingFields(response);
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
    semanticsEvidenceRefHash:
      input.sourceEvidence.semanticsEvidenceRefHash,
    validFrom: input.sourceEvidence.semanticsValidFrom,
    validUntil: input.sourceEvidence.semanticsValidUntil,
    issuedAt: input.sourceEvidence.semanticsIssuedAt,
  };
  const semanticsSourceBytes = signedSource("SEMANTICS", semanticsPayload,
    state);
  const standingPayload = {
    schema: context.standingSchema,
    sourceSystemId: context.sourceSystemId,
    ...bindings,
    resourceOwnerRefHash: input.sourceEvidence.resourceOwnerRefHash,
    validFrom: input.sourceEvidence.standingValidFrom,
    validUntil: input.sourceEvidence.standingValidUntil,
    issuedAt: input.sourceEvidence.standingIssuedAt,
    standingState: "SOURCE_DECLARED_ACTIVE",
    standingEvidenceRefHash: input.sourceEvidence.standingEvidenceRefHash,
  };
  /* Keep the verifier's frozen field order irrelevant by canonicalizing, while
     retaining an ordinary exact-shape object. */
  const standingSourceBytes = signedSource("STANDING", standingPayload, state);
  const receiptPayload = {
    schema: context.receiptSchema,
    sourceSystemId: context.sourceSystemId,
    sourceReceiptId: input.reservation.sourceReceiptId,
    lifecycleStreamId: input.reservation.lifecycleStreamId,
    semanticsSourceHash: sha256Bytes(semanticsSourceBytes),
    standingSourceHash: sha256Bytes(standingSourceBytes),
    oneUseResponseHash: response.initialResponseHash,
    tenderHash: response.tenderHash,
    typedGraphHash: response.typedGraphHash,
    episodeHash: response.episodeHash,
    networkCompleteEpisodeJoinHash: response.networkCompleteEpisodeJoinHash,
    attemptHash: response.attemptHash,
    ...bindings,
    reservedFrom: input.reservation.reservedFrom,
    reservedUntil: input.reservation.reservedUntil,
    issuedAt: input.reservation.receiptIssuedAt,
    status: "RESERVED",
  };
  const receiptSourceBytes = signedSource("RECEIPT", receiptPayload, state);
  const receiptSourceHash = sha256Bytes(receiptSourceBytes);
  const eventPayload = {
    schema: context.lifecycleEventSchema,
    sourceSystemId: context.sourceSystemId,
    lifecycleStreamId: input.reservation.lifecycleStreamId,
    receiptSourceHash,
    oneUseResponseHash: response.initialResponseHash,
    tenderHash: response.tenderHash,
    providerRefHash: response.providerRefHash,
    scopeHash: response.scopeHash,
    ordinal: 1,
    previousEventSourceHash: OUTSIDER_EXTERNAL_CAPACITY_EVENT_GENESIS_V1,
    eventState: "RESERVED",
    occurredAt: input.reservation.eventOccurredAt,
    occurrenceIdentityHash: input.reservation.occurrenceIdentityHash,
  };
  const lifecycleEventSourceBytes = [signedSource(
    "LIFECYCLE_EVENT", eventPayload, state)];
  const lifecycleEventSourceHash = sha256Bytes(lifecycleEventSourceBytes[0]);
  const headPayload = {
    schema: context.lifecycleHeadSchema,
    sourceSystemId: context.sourceSystemId,
    lifecycleStreamId: input.reservation.lifecycleStreamId,
    receiptSourceHash,
    oneUseResponseHash: response.initialResponseHash,
    tenderHash: response.tenderHash,
    providerRefHash: response.providerRefHash,
    scopeHash: response.scopeHash,
    eventCount: 1,
    coveredFromOrdinal: 1,
    coveredToOrdinal: 1,
    headEventSourceHash: lifecycleEventSourceHash,
    currentState: "RESERVED",
    observedAt: input.reservation.lifecycleHeadObservedAt,
    occurrencePolicy:
      "EVERY_SOURCE_EVENT_COUNTED_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR",
  };
  const lifecycleHeadSourceBytes = signedSource(
    "LIFECYCLE_HEAD", headPayload, state);
  const sourceHashes = {
    semanticsSourceHash: sha256Bytes(semanticsSourceBytes),
    standingSourceHash: sha256Bytes(standingSourceBytes),
    receiptSourceHash,
    lifecycleEventSourceHashes: [lifecycleEventSourceHash],
    lifecycleHeadSourceHash: sha256Bytes(lifecycleHeadSourceBytes),
  };
  const exactSourceByteCount = semanticsSourceBytes.length
    + standingSourceBytes.length + receiptSourceBytes.length
    + lifecycleEventSourceBytes[0].length + lifecycleHeadSourceBytes.length;
  const manifestBody = {
    schema: OUTSIDER_SELLER_OWNED_ONE_USE_CAPACITY_EMITTER_V1_SCHEMAS
      .sourceBundleManifest,
    schemaVersion: "1.0.0",
    recordClass: "SELLER_SIGNED_ONE_USE_CAPACITY_SOURCE_BUNDLE",
    tenderHash: response.tenderHash,
    typedGraphHash: response.typedGraphHash,
    episodeHash: response.episodeHash,
    attemptHash: response.attemptHash,
    oneUseResponseHash: response.initialResponseHash,
    providerRefHash: response.providerRefHash,
    scopeHash: response.scopeHash,
    verifierContextHash: context.verifierContextHash,
    sourceHashes,
    exactSourceDocumentCount: 5,
    exactSourceByteCount,
    currentSourceDeclaredState: "RESERVED",
    sellerDeclarationIsIndependentWitness: false,
    independentWitnessReceiptPresent: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  const sourceBundleManifest = Object.freeze({
    ...manifestBody,
    sourceBundleManifestHash: digest(
      OUTSIDER_SELLER_OWNED_ONE_USE_CAPACITY_EMITTER_V1_SCHEMAS
        .sourceBundleManifest, manifestBody),
  });
  const challengeBody = {
    schema: OUTSIDER_SELLER_OWNED_ONE_USE_CAPACITY_EMITTER_V1_SCHEMAS
      .witnessChallenge,
    schemaVersion: "1.0.0",
    recordClass: "INDEPENDENT_WITNESS_REQUEST_NOT_WITNESS_RECEIPT",
    sourceBundleManifestHash: sourceBundleManifest.sourceBundleManifestHash,
    tenderHash: response.tenderHash,
    oneUseResponseHash: response.initialResponseHash,
    providerRefHash: response.providerRefHash,
    scopeHash: response.scopeHash,
    witnessRouteObjectHash: input.witnessRequest.witnessRouteObjectHash,
    witnessCandidateHash: input.witnessRequest.witnessCandidateHash,
    witnessRequirementRefHash:
      input.witnessRequest.witnessRequirementRefHash,
    witnessControllerSeparationPolicyRefHash:
      input.witnessRequest.witnessControllerSeparationPolicyRefHash,
    requestedObservationCode:
      "REPLAY_EXACT_SOURCE_BUNDLE_AND_OBSERVE_CURRENT_LIFECYCLE_HEAD",
    requestedAt: input.witnessRequest.requestedAt,
    observationDeadline: input.witnessRequest.observationDeadline,
    sellerMayNotAnswerOwnChallenge: true,
    witnessRouteIndependenceEstablished: false,
    independentWitnessReceiptPresent: false,
    independentOutcomeTruthEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  const witnessChallenge = Object.freeze({
    ...challengeBody,
    witnessChallengeHash: digest(
      OUTSIDER_SELLER_OWNED_ONE_USE_CAPACITY_EMITTER_V1_SCHEMAS
        .witnessChallenge, challengeBody),
  });
  const verification = verifyExternalCapacityReceiptLifecycleV1({
    tender: input.tender,
    expectedTenderHash: input.expectedTenderHash,
    responses: input.responses,
    responseOccurrences: input.responseOccurrences,
    expectedResponseOccurrenceCount: input.expectedResponseOccurrenceCount,
    expectedResponseLifecycleHeadHash:
      input.expectedResponseLifecycleHeadHash,
    verifierContext: context,
    expectedVerifierContextHash: context.verifierContextHash,
    semanticsSourceBytes,
    expectedSemanticsSourceHash: sourceHashes.semanticsSourceHash,
    standingSourceBytes,
    expectedStandingSourceHash: sourceHashes.standingSourceHash,
    receiptSourceBytes,
    expectedReceiptSourceHash: sourceHashes.receiptSourceHash,
    lifecycleEventSourceBytes,
    lifecycleHeadSourceBytes,
    expectedLifecycleHeadSourceHash: sourceHashes.lifecycleHeadSourceHash,
    observedAt: input.observedAt,
  });
  if (!verification.ok || !verification.sourceBundleCryptographicallyConsistent
    || !verification.sourceDeclaredReservationCurrent
    || verification.capacityReserved !== false
    || verification.authority !== "NONE") {
    fail("EMITTED_SOURCE_BUNDLE_FAILED_EXISTING_REPLAY_CONTRACT");
  }
  state.emittedResponseHashes.add(response.initialResponseHash);
  const publicProjectionBody = {
    schema: OUTSIDER_SELLER_OWNED_ONE_USE_CAPACITY_EMITTER_V1_SCHEMAS.emission,
    schemaVersion: "1.0.0",
    recordClass: "SELLER_SIDE_ONE_USE_CAPACITY_SOURCE_EMISSION",
    sourceBundleManifest,
    witnessChallenge,
    capacityReplayVerificationHash: verification.verificationHash,
    sourceBundleCryptographicallyConsistent: true,
    sourceDeclaredReservationCurrent: true,
    sellerDeclarationIsIndependentWitness: false,
    independentWitnessReceiptPresent: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    duplicateEmissionSuppressedWithinProcess: true,
    durableNonceConsumptionEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_SELLER_OWNED_ONE_USE_CAPACITY_EMITTER_V1_BOUNDARY,
  };
  const publicProjection = Object.freeze({
    ...publicProjectionBody,
    emissionHash: digest(
      OUTSIDER_SELLER_OWNED_ONE_USE_CAPACITY_EMITTER_V1_SCHEMAS.emission,
      publicProjectionBody),
  });
  return {
    sourceBundle: {
      semanticsSourceBytes: Buffer.from(semanticsSourceBytes),
      standingSourceBytes: Buffer.from(standingSourceBytes),
      receiptSourceBytes: Buffer.from(receiptSourceBytes),
      lifecycleEventSourceBytes:
        lifecycleEventSourceBytes.map((bytes) => Buffer.from(bytes)),
      lifecycleHeadSourceBytes: Buffer.from(lifecycleHeadSourceBytes),
    },
    publicProjection,
  };
}

