/*
 * Independent outcome/recovery witness lifecycle v1.
 *
 * A witness-owned process can reserve one exact observation responsibility,
 * later issue one signed observation receipt, and revoke that reservation.
 * The verifier replays the exact signed bytes against a caller-pinned key and
 * an exact Outsider outcome tender.  This is deliberately a HOLD-only source
 * seam: key continuity and structurally different controller references do not
 * prove owner identity, operational independence, observation truth, capacity,
 * authority, action admission, pricing, guarantee, or settlement.
 *
 * Provider self-reports, server acknowledgements, and model rewards are
 * rejected at the source boundary; they cannot be relabelled as independent
 * observation evidence.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const PREFIX = "OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const STRICT_BASE64
  = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const CAPABILITY_STATE = new WeakMap();
const OBSERVATION_TARGETS = new Set(["PRIMARY_OUTCOME", "RECOVERY_OUTCOME"]);
const OBSERVATION_STATUSES = new Set([
  "OBSERVED_SATISFIED", "OBSERVED_NOT_SATISFIED", "INCONCLUSIVE",
]);
const ACCEPTED_EVIDENCE_SOURCE_CLASSES = new Set([
  "WITNESS_DIRECT_OBSERVATION", "INDEPENDENT_INSTRUMENT_OBSERVATION",
]);
const FORBIDDEN_EVIDENCE_SOURCE_CLASSES = new Set([
  "PROVIDER_SELF_REPORT", "SERVER_ACKNOWLEDGEMENT", "MODEL_REWARD",
]);

export const OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS
  = Object.freeze({
    verifierContext:
      "outsider/independent-outcome-witness-verifier-context/v1",
    capability:
      "outsider/independent-outcome-witness-source-capability/v1",
    reservation:
      "outsider/independent-outcome-witness-reservation-source/v1",
    resultReceipt:
      "outsider/independent-outcome-witness-result-receipt-source/v1",
    revocation:
      "outsider/independent-outcome-witness-revocation-source/v1",
    replay:
      "outsider/independent-outcome-witness-lifecycle-replay/v1",
  });

export const OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_BOUNDARY
  = Object.freeze({
    position:
      "WITNESS_OWNED_RESERVATION_RESULT_AND_REVOCATION_SOURCE_REPLAY_HOLD_ONLY",
    exactTenderBound: true,
    exactOutcomeAndAcceptanceCriteriaBound: true,
    exactPrimaryAttemptBound: true,
    exactWitnessOwnerAndControllerReferencesBound: true,
    exactObservationWindowNonceAndExpiryBound: true,
    sourceSignaturesReplayed: true,
    providerSelfReportAcceptedAsOutcomeTruth: false,
    serverAcknowledgementAcceptedAsOutcomeTruth: false,
    modelRewardAcceptedAsOutcomeTruth: false,
    structuralDistinctnessProvesIndependentControl: false,
    callerPinnedWitnessKeyProvesOwnerIdentity: false,
    callerPinnedWitnessKeyProvesOperationalIndependence: false,
    witnessOwnerIdentityExternallyEstablished: false,
    independentControlEstablished: false,
    independentOutcomeTruthEstablished: false,
    recoveryOutcomeTruthEstablished: false,
    networkIoPerformed: false,
    paymentPerformed: false,
    capacityReserved: false,
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

function sourceMessage(kind, payload) {
  return Buffer.from(
    `outsider/independent-outcome-witness-source-signing/v1\0${kind}\0${canonicalizeStrict(payload)}`,
    "utf8");
}

function parseCanonicalSource(bytes, maximum, code) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > maximum) {
    fail(`${code}_BYTES_INVALID`);
  }
  const copy = Buffer.from(bytes);
  const text = copy.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(copy)) fail(`${code}_UTF8_INVALID`);
  let value;
  try { value = JSON.parse(text); } catch { fail(`${code}_JSON_INVALID`); }
  if (canonicalizeStrict(value) !== text) fail(`${code}_NOT_CANONICAL`);
  return value;
}

function publicKey(publicKeyPem, expectedKeyId) {
  if (typeof publicKeyPem !== "string"
    || Buffer.byteLength(publicKeyPem, "utf8") > 16_384) {
    fail("PUBLIC_KEY_INVALID");
  }
  let key;
  try { key = createPublicKey(publicKeyPem); } catch { fail("PUBLIC_KEY_INVALID"); }
  if (key.asymmetricKeyType !== "ed25519") fail("PUBLIC_KEY_NOT_ED25519");
  const keyId = sha256Bytes(key.export({ type: "spki", format: "der" }));
  if (expectedKeyId !== undefined && keyId !== expectedKeyId) {
    fail("PUBLIC_KEY_ID_MISMATCH");
  }
  return { key, keyId };
}

const CONTEXT_INPUT_FIELDS = Object.freeze([
  "sourceSystemId", "witnessOwnerRefHash", "witnessControllerRefHash",
  "observationPolicyRefHash", "publicKeyPem",
]);

export function createIndependentOutcomeWitnessVerifierContextV1(input = {}) {
  exactObject(input, CONTEXT_INPUT_FIELDS, "CONTEXT_INPUT");
  const sourceSystemId = token(input.sourceSystemId, "SOURCE_SYSTEM_ID");
  const witnessOwnerRefHash = hash(input.witnessOwnerRefHash,
    "WITNESS_OWNER_REF_HASH");
  const witnessControllerRefHash = hash(input.witnessControllerRefHash,
    "WITNESS_CONTROLLER_REF_HASH");
  const observationPolicyRefHash = hash(input.observationPolicyRefHash,
    "OBSERVATION_POLICY_REF_HASH");
  const checkedKey = publicKey(input.publicKeyPem);
  const body = {
    schema: OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS
      .verifierContext,
    schemaVersion: "1.0.0",
    sourceSystemId,
    witnessOwnerRefHash,
    witnessControllerRefHash,
    observationPolicyRefHash,
    sourceKeyId: checkedKey.keyId,
    publicKeyPem: input.publicKeyPem,
    callerPinnedTrustOnly: true,
    witnessOwnerIdentityExternallyEstablished: false,
    operationalIndependenceEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
  };
  return Object.freeze({
    ...body,
    verifierContextHash: digest(
      OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS
        .verifierContext, body),
  });
}

function verifyContext(record, expectedHash) {
  hash(expectedHash, "EXPECTED_VERIFIER_CONTEXT_HASH");
  const fields = [
    "schema", "schemaVersion", "sourceSystemId", "witnessOwnerRefHash",
    "witnessControllerRefHash", "observationPolicyRefHash", "sourceKeyId",
    "publicKeyPem", "callerPinnedTrustOnly",
    "witnessOwnerIdentityExternallyEstablished",
    "operationalIndependenceEstablished", "decisionState", "authority",
    "verifierContextHash",
  ];
  exactObject(record, fields, "VERIFIER_CONTEXT");
  if (record.schema
      !== OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS
        .verifierContext
    || record.schemaVersion !== "1.0.0" || record.callerPinnedTrustOnly !== true
    || record.witnessOwnerIdentityExternallyEstablished !== false
    || record.operationalIndependenceEstablished !== false
    || record.decisionState !== "HOLD" || record.authority !== "NONE") {
    fail("VERIFIER_CONTEXT_BOUNDARY_INVALID");
  }
  token(record.sourceSystemId, "SOURCE_SYSTEM_ID");
  hash(record.witnessOwnerRefHash, "WITNESS_OWNER_REF_HASH");
  hash(record.witnessControllerRefHash, "WITNESS_CONTROLLER_REF_HASH");
  hash(record.observationPolicyRefHash, "OBSERVATION_POLICY_REF_HASH");
  const checkedKey = publicKey(record.publicKeyPem,
    hash(record.sourceKeyId, "SOURCE_KEY_ID"));
  const body = { ...record };
  delete body.verifierContextHash;
  const rebuilt = digest(record.schema, body);
  if (record.verifierContextHash !== rebuilt || rebuilt !== expectedHash) {
    fail("VERIFIER_CONTEXT_HASH_MISMATCH");
  }
  return { record, key: checkedKey.key };
}

const CAPABILITY_INPUT_FIELDS = Object.freeze([
  "verifierContext", "expectedVerifierContextHash", "witnessPrivateKeyPem",
]);

export function createIndependentOutcomeWitnessSourceCapabilityV1(input = {}) {
  exactObject(input, CAPABILITY_INPUT_FIELDS, "CAPABILITY_INPUT");
  const context = verifyContext(input.verifierContext,
    input.expectedVerifierContextHash);
  if (typeof input.witnessPrivateKeyPem !== "string"
    || Buffer.byteLength(input.witnessPrivateKeyPem, "utf8") > 16_384) {
    fail("PRIVATE_KEY_INVALID");
  }
  let key;
  try { key = createPrivateKey(input.witnessPrivateKeyPem); }
  catch { fail("PRIVATE_KEY_INVALID"); }
  if (key.asymmetricKeyType !== "ed25519") fail("PRIVATE_KEY_NOT_ED25519");
  const derivedKeyId = sha256Bytes(createPublicKey(key)
    .export({ type: "spki", format: "der" }));
  if (derivedKeyId !== context.record.sourceKeyId) {
    fail("PRIVATE_KEY_CONTEXT_MISMATCH");
  }
  const body = {
    schema: OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS
      .capability,
    schemaVersion: "1.0.0",
    verifierContextHash: context.record.verifierContextHash,
    sourceKeyId: context.record.sourceKeyId,
    privateKeyProjected: false,
    networkIoPerformed: false,
    paymentPerformed: false,
    decisionState: "HOLD",
    authority: "NONE",
  };
  const capability = Object.freeze({
    ...body,
    capabilityHash: digest(
      OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS.capability,
      body),
  });
  CAPABILITY_STATE.set(capability, {
    context: context.record,
    privateKey: key,
    reservationHashes: new Set(),
    reservationNonces: new Set(),
    resultByReservation: new Set(),
    revokedReservations: new Set(),
  });
  return capability;
}

function capabilityState(capability) {
  if (capability === null || typeof capability !== "object"
    || !CAPABILITY_STATE.has(capability)) fail("CAPABILITY_INVALID");
  return CAPABILITY_STATE.get(capability);
}

function signedSource(kind, payload, state) {
  const signature = cryptoSign(null, sourceMessage(kind, payload),
    state.privateKey);
  return Buffer.from(canonicalizeStrict({
    payload,
    signature: {
      algorithm: "ED25519",
      keyId: state.context.sourceKeyId,
      valueBase64: signature.toString("base64"),
    },
  }), "utf8");
}

function verifySignedSource(bytes, kind, schema, context, code) {
  const envelope = parseCanonicalSource(bytes, 1024 * 1024, code);
  exactObject(envelope, ["payload", "signature"], `${code}_ENVELOPE`);
  exactObject(envelope.signature, ["algorithm", "keyId", "valueBase64"],
    `${code}_SIGNATURE`);
  if (envelope.signature.algorithm !== "ED25519"
    || envelope.signature.keyId !== context.record.sourceKeyId
    || typeof envelope.signature.valueBase64 !== "string"
    || !STRICT_BASE64.test(envelope.signature.valueBase64)) {
    fail(`${code}_SIGNATURE_INVALID`);
  }
  const signature = Buffer.from(envelope.signature.valueBase64, "base64");
  if (signature.length !== 64
    || signature.toString("base64") !== envelope.signature.valueBase64
    || !cryptoVerify(null, sourceMessage(kind, envelope.payload), context.key,
      signature)) fail(`${code}_SIGNATURE_INVALID`);
  if (envelope.payload?.schema !== schema) fail(`${code}_SCHEMA_INVALID`);
  return { payload: envelope.payload, sourceHash: sha256Bytes(bytes) };
}

function evidenceRequirement(tender, requirementId) {
  const matches = tender.evidenceRequirements.items.filter((row) =>
    row.evidenceRequirementId === requirementId);
  if (matches.length !== 1 || matches[0].mandatory !== true
    || matches[0].sourceControl !== "INDEPENDENT_OF_PROVIDER"
    || matches[0].requiredAsIndependentOutcomeEvidence !== true) {
    fail("INDEPENDENT_EVIDENCE_REQUIREMENT_MISMATCH");
  }
  return matches[0];
}

function recoveryBinding(tender, target, recoveryRequirementId,
  recoveryOutcomeRefHash, evidenceRequirementId) {
  if (target === "PRIMARY_OUTCOME") {
    if (recoveryRequirementId !== null || recoveryOutcomeRefHash !== null) {
      fail("PRIMARY_TARGET_RECOVERY_FIELDS_MUST_BE_NULL");
    }
    return;
  }
  if (typeof recoveryRequirementId !== "string") {
    fail("RECOVERY_REQUIREMENT_ID_REQUIRED");
  }
  hash(recoveryOutcomeRefHash, "RECOVERY_OUTCOME_REF_HASH");
  const matches = tender.recoveryRequirements.items.filter((row) =>
    row.recoveryRequirementId === recoveryRequirementId);
  if (matches.length !== 1
    || matches[0].recoveryOutcomeRefHash !== recoveryOutcomeRefHash
    || matches[0].recoveryEvidenceRequirementId !== evidenceRequirementId) {
    fail("RECOVERY_BINDING_MISMATCH");
  }
}

const RESERVATION_INPUT_FIELDS = Object.freeze([
  "tender", "expectedTenderHash", "reservationId", "lifecycleStreamId",
  "evidenceRequirementId", "observationTarget", "recoveryRequirementId",
  "recoveryOutcomeRefHash", "primaryAttemptHash", "primaryProviderRefHash",
  "primaryControllerRefHash", "witnessProviderRefHash",
  "reservationNonceHash", "observationOpensAt", "observationClosesAt",
  "expiresAt", "reservedAt",
]);

export function emitIndependentOutcomeWitnessReservationV1(
  capability, input = {}) {
  const state = capabilityState(capability);
  exactObject(input, RESERVATION_INPUT_FIELDS, "RESERVATION_INPUT");
  const tenderCheck = verifyOutsiderOutcomeTenderV1(input.tender,
    { expectedTenderHash: input.expectedTenderHash });
  if (!tenderCheck.ok || tenderCheck.authority !== "NONE") {
    fail("TENDER_REPLAY_FAILED");
  }
  const tender = input.tender;
  token(input.reservationId, "RESERVATION_ID");
  token(input.lifecycleStreamId, "LIFECYCLE_STREAM_ID");
  token(input.evidenceRequirementId, "EVIDENCE_REQUIREMENT_ID");
  if (!OBSERVATION_TARGETS.has(input.observationTarget)) {
    fail("OBSERVATION_TARGET_INVALID");
  }
  const evidence = evidenceRequirement(tender, input.evidenceRequirementId);
  recoveryBinding(tender, input.observationTarget,
    input.recoveryRequirementId, input.recoveryOutcomeRefHash,
    input.evidenceRequirementId);
  hash(input.primaryAttemptHash, "PRIMARY_ATTEMPT_HASH");
  if (input.primaryAttemptHash !== tender.typedGraph.attempt.attemptHash) {
    fail("PRIMARY_ATTEMPT_TENDER_MISMATCH");
  }
  hash(input.primaryProviderRefHash, "PRIMARY_PROVIDER_REF_HASH");
  hash(input.primaryControllerRefHash, "PRIMARY_CONTROLLER_REF_HASH");
  hash(input.witnessProviderRefHash, "WITNESS_PROVIDER_REF_HASH");
  if (input.primaryProviderRefHash === input.witnessProviderRefHash
    || input.primaryControllerRefHash === state.context.witnessControllerRefHash) {
    fail("WITNESS_STRUCTURAL_SEPARATION_REQUIRED");
  }
  hash(input.reservationNonceHash, "RESERVATION_NONCE_HASH");
  if (state.reservationNonces.has(input.reservationNonceHash)) {
    fail("RESERVATION_NONCE_ALREADY_CONSUMED_IN_PROCESS");
  }
  const reservedAt = instant(input.reservedAt, "RESERVED_AT");
  const opensAt = instant(input.observationOpensAt, "OBSERVATION_OPENS_AT");
  const closesAt = instant(input.observationClosesAt, "OBSERVATION_CLOSES_AT");
  const expiresAt = instant(input.expiresAt, "EXPIRES_AT");
  const reservedMs = Date.parse(reservedAt);
  const opensMs = Date.parse(opensAt);
  const closesMs = Date.parse(closesAt);
  const expiresMs = Date.parse(expiresAt);
  if (reservedMs > opensMs || opensMs >= closesMs || closesMs > expiresMs
    || expiresMs > Date.parse(tender.exactOutcome.deadline)
    || reservedMs > Date.parse(tender.formationDeadline)) {
    fail("OBSERVATION_WINDOW_OR_EXPIRY_INVALID");
  }
  const payload = {
    schema:
      OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS.reservation,
    schemaVersion: "1.0.0",
    sourceSystemId: state.context.sourceSystemId,
    reservationId: input.reservationId,
    lifecycleStreamId: input.lifecycleStreamId,
    tenderHash: tender.tenderHash,
    exactOutcomeHash: tender.exactOutcome.exactOutcomeHash,
    acceptanceCriteriaRefHash: tender.exactOutcome.acceptanceCriteriaRefHash,
    evidenceRequirementId: input.evidenceRequirementId,
    evidenceRequirementRefHash: evidence.evidenceRequirementRefHash,
    observationTarget: input.observationTarget,
    recoveryRequirementId: input.recoveryRequirementId,
    recoveryOutcomeRefHash: input.recoveryOutcomeRefHash,
    primaryAttemptHash: input.primaryAttemptHash,
    primaryProviderRefHash: input.primaryProviderRefHash,
    primaryControllerRefHash: input.primaryControllerRefHash,
    witnessProviderRefHash: input.witnessProviderRefHash,
    witnessOwnerRefHash: state.context.witnessOwnerRefHash,
    witnessControllerRefHash: state.context.witnessControllerRefHash,
    observationPolicyRefHash: state.context.observationPolicyRefHash,
    reservationNonceHash: input.reservationNonceHash,
    observationOpensAt: opensAt,
    observationClosesAt: closesAt,
    expiresAt,
    reservedAt,
    state: "RESERVED",
  };
  const bytes = signedSource("RESERVATION", payload, state);
  const sourceHash = sha256Bytes(bytes);
  if (state.reservationHashes.has(sourceHash)) {
    fail("RESERVATION_ALREADY_EMITTED_IN_PROCESS");
  }
  state.reservationHashes.add(sourceHash);
  state.reservationNonces.add(input.reservationNonceHash);
  return bytes;
}

const RESULT_INPUT_FIELDS = Object.freeze([
  "reservationSourceBytes", "observationStatus", "evidenceSourceClass",
  "observationEvidenceHashes", "resultReceiptNonceHash", "observedAt",
  "issuedAt",
]);

function parseOwnReservation(bytes, state) {
  const context = verifyContext(state.context, state.context.verifierContextHash);
  const source = verifySignedSource(bytes, "RESERVATION",
    OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS.reservation,
    context, "RESERVATION_SOURCE");
  if (source.payload.sourceSystemId !== state.context.sourceSystemId
    || source.payload.witnessOwnerRefHash !== state.context.witnessOwnerRefHash
    || source.payload.witnessControllerRefHash
      !== state.context.witnessControllerRefHash) {
    fail("RESERVATION_SOURCE_CONTEXT_MISMATCH");
  }
  return source;
}

export function emitIndependentOutcomeWitnessResultReceiptV1(
  capability, input = {}) {
  const state = capabilityState(capability);
  exactObject(input, RESULT_INPUT_FIELDS, "RESULT_INPUT");
  const reservation = parseOwnReservation(input.reservationSourceBytes, state);
  if (!state.reservationHashes.has(reservation.sourceHash)) {
    fail("RESERVATION_NOT_EMITTED_BY_CAPABILITY");
  }
  if (state.revokedReservations.has(reservation.sourceHash)) {
    fail("RESERVATION_ALREADY_REVOKED");
  }
  if (state.resultByReservation.has(reservation.sourceHash)) {
    fail("RESULT_ALREADY_EMITTED_IN_PROCESS");
  }
  if (!OBSERVATION_STATUSES.has(input.observationStatus)) {
    fail("OBSERVATION_STATUS_INVALID");
  }
  if (FORBIDDEN_EVIDENCE_SOURCE_CLASSES.has(input.evidenceSourceClass)) {
    fail("FORBIDDEN_OUTCOME_EVIDENCE_SOURCE_CLASS");
  }
  if (!ACCEPTED_EVIDENCE_SOURCE_CLASSES.has(input.evidenceSourceClass)) {
    fail("EVIDENCE_SOURCE_CLASS_INVALID");
  }
  if (!Array.isArray(input.observationEvidenceHashes)
    || input.observationEvidenceHashes.length < 1
    || input.observationEvidenceHashes.length > 64) {
    fail("OBSERVATION_EVIDENCE_HASHES_INVALID");
  }
  const evidenceHashes = input.observationEvidenceHashes.map((value) =>
    hash(value, "OBSERVATION_EVIDENCE_HASH"));
  if (new Set(evidenceHashes).size !== evidenceHashes.length) {
    fail("OBSERVATION_EVIDENCE_HASH_DUPLICATE");
  }
  evidenceHashes.sort();
  hash(input.resultReceiptNonceHash, "RESULT_RECEIPT_NONCE_HASH");
  if (input.resultReceiptNonceHash === reservation.payload.reservationNonceHash) {
    fail("RESULT_NONCE_MUST_DIFFER_FROM_RESERVATION_NONCE");
  }
  const observedAt = instant(input.observedAt, "OBSERVED_AT");
  const issuedAt = instant(input.issuedAt, "ISSUED_AT");
  if (Date.parse(observedAt) < Date.parse(reservation.payload.observationOpensAt)
    || Date.parse(observedAt) > Date.parse(reservation.payload.observationClosesAt)
    || Date.parse(issuedAt) < Date.parse(observedAt)
    || Date.parse(issuedAt) > Date.parse(reservation.payload.expiresAt)) {
    fail("RESULT_TIME_OUTSIDE_RESERVED_WINDOW");
  }
  const bindings = reservation.payload;
  const payload = {
    schema:
      OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS.resultReceipt,
    schemaVersion: "1.0.0",
    sourceSystemId: state.context.sourceSystemId,
    reservationSourceHash: reservation.sourceHash,
    reservationId: bindings.reservationId,
    lifecycleStreamId: bindings.lifecycleStreamId,
    tenderHash: bindings.tenderHash,
    exactOutcomeHash: bindings.exactOutcomeHash,
    acceptanceCriteriaRefHash: bindings.acceptanceCriteriaRefHash,
    evidenceRequirementId: bindings.evidenceRequirementId,
    evidenceRequirementRefHash: bindings.evidenceRequirementRefHash,
    observationTarget: bindings.observationTarget,
    recoveryRequirementId: bindings.recoveryRequirementId,
    recoveryOutcomeRefHash: bindings.recoveryOutcomeRefHash,
    primaryAttemptHash: bindings.primaryAttemptHash,
    primaryProviderRefHash: bindings.primaryProviderRefHash,
    primaryControllerRefHash: bindings.primaryControllerRefHash,
    witnessProviderRefHash: bindings.witnessProviderRefHash,
    witnessOwnerRefHash: bindings.witnessOwnerRefHash,
    witnessControllerRefHash: bindings.witnessControllerRefHash,
    observationPolicyRefHash: bindings.observationPolicyRefHash,
    reservationNonceHash: bindings.reservationNonceHash,
    resultReceiptNonceHash: input.resultReceiptNonceHash,
    observationStatus: input.observationStatus,
    evidenceSourceClass: input.evidenceSourceClass,
    observationEvidenceHashes: evidenceHashes,
    observationEvidenceSetHash: digest(
      "outsider/independent-outcome-witness-observation-evidence-set/v1",
      evidenceHashes),
    observedAt,
    issuedAt,
    providerSelfReportAcceptedAsOutcomeTruth: false,
    serverAcknowledgementAcceptedAsOutcomeTruth: false,
    modelRewardAcceptedAsOutcomeTruth: false,
    state: "RESULT_ISSUED",
  };
  const bytes = signedSource("RESULT_RECEIPT", payload, state);
  state.resultByReservation.add(reservation.sourceHash);
  return bytes;
}

const REVOCATION_INPUT_FIELDS = Object.freeze([
  "reservationSourceBytes", "revocationNonceHash", "reasonCode", "revokedAt",
]);

export function emitIndependentOutcomeWitnessRevocationV1(
  capability, input = {}) {
  const state = capabilityState(capability);
  exactObject(input, REVOCATION_INPUT_FIELDS, "REVOCATION_INPUT");
  const reservation = parseOwnReservation(input.reservationSourceBytes, state);
  if (!state.reservationHashes.has(reservation.sourceHash)) {
    fail("RESERVATION_NOT_EMITTED_BY_CAPABILITY");
  }
  if (state.revokedReservations.has(reservation.sourceHash)) {
    fail("RESERVATION_ALREADY_REVOKED");
  }
  hash(input.revocationNonceHash, "REVOCATION_NONCE_HASH");
  if (input.revocationNonceHash === reservation.payload.reservationNonceHash) {
    fail("REVOCATION_NONCE_MUST_DIFFER_FROM_RESERVATION_NONCE");
  }
  token(input.reasonCode, "REVOCATION_REASON_CODE");
  const revokedAt = instant(input.revokedAt, "REVOKED_AT");
  if (Date.parse(revokedAt) < Date.parse(reservation.payload.reservedAt)) {
    fail("REVOCATION_BEFORE_RESERVATION");
  }
  const payload = {
    schema:
      OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS.revocation,
    schemaVersion: "1.0.0",
    sourceSystemId: state.context.sourceSystemId,
    reservationSourceHash: reservation.sourceHash,
    reservationId: reservation.payload.reservationId,
    lifecycleStreamId: reservation.payload.lifecycleStreamId,
    tenderHash: reservation.payload.tenderHash,
    witnessOwnerRefHash: reservation.payload.witnessOwnerRefHash,
    witnessControllerRefHash: reservation.payload.witnessControllerRefHash,
    reservationNonceHash: reservation.payload.reservationNonceHash,
    revocationNonceHash: input.revocationNonceHash,
    reasonCode: input.reasonCode,
    revokedAt,
    state: "REVOKED",
  };
  const bytes = signedSource("REVOCATION", payload, state);
  state.revokedReservations.add(reservation.sourceHash);
  return bytes;
}

const RESERVATION_PAYLOAD_FIELDS = Object.freeze([
  "schema", "schemaVersion", "sourceSystemId", "reservationId",
  "lifecycleStreamId", "tenderHash", "exactOutcomeHash",
  "acceptanceCriteriaRefHash", "evidenceRequirementId",
  "evidenceRequirementRefHash", "observationTarget", "recoveryRequirementId",
  "recoveryOutcomeRefHash", "primaryAttemptHash", "primaryProviderRefHash",
  "primaryControllerRefHash", "witnessProviderRefHash",
  "witnessOwnerRefHash", "witnessControllerRefHash",
  "observationPolicyRefHash", "reservationNonceHash", "observationOpensAt",
  "observationClosesAt", "expiresAt", "reservedAt", "state",
]);
const RESULT_PAYLOAD_FIELDS = Object.freeze([
  "schema", "schemaVersion", "sourceSystemId", "reservationSourceHash",
  "reservationId", "lifecycleStreamId", "tenderHash", "exactOutcomeHash",
  "acceptanceCriteriaRefHash", "evidenceRequirementId",
  "evidenceRequirementRefHash", "observationTarget", "recoveryRequirementId",
  "recoveryOutcomeRefHash", "primaryAttemptHash", "primaryProviderRefHash",
  "primaryControllerRefHash", "witnessProviderRefHash",
  "witnessOwnerRefHash", "witnessControllerRefHash",
  "observationPolicyRefHash", "reservationNonceHash", "resultReceiptNonceHash",
  "observationStatus", "evidenceSourceClass", "observationEvidenceHashes",
  "observationEvidenceSetHash", "observedAt", "issuedAt",
  "providerSelfReportAcceptedAsOutcomeTruth",
  "serverAcknowledgementAcceptedAsOutcomeTruth",
  "modelRewardAcceptedAsOutcomeTruth", "state",
]);
const REVOCATION_PAYLOAD_FIELDS = Object.freeze([
  "schema", "schemaVersion", "sourceSystemId", "reservationSourceHash",
  "reservationId", "lifecycleStreamId", "tenderHash", "witnessOwnerRefHash",
  "witnessControllerRefHash", "reservationNonceHash", "revocationNonceHash",
  "reasonCode", "revokedAt", "state",
]);

function validateReservationPayload(payload, tender, context) {
  exactObject(payload, RESERVATION_PAYLOAD_FIELDS, "RESERVATION_PAYLOAD");
  if (payload.schemaVersion !== "1.0.0"
    || payload.sourceSystemId !== context.record.sourceSystemId
    || payload.tenderHash !== tender.tenderHash
    || payload.exactOutcomeHash !== tender.exactOutcome.exactOutcomeHash
    || payload.acceptanceCriteriaRefHash
      !== tender.exactOutcome.acceptanceCriteriaRefHash
    || payload.primaryAttemptHash !== tender.typedGraph.attempt.attemptHash
    || payload.witnessOwnerRefHash !== context.record.witnessOwnerRefHash
    || payload.witnessControllerRefHash
      !== context.record.witnessControllerRefHash
    || payload.observationPolicyRefHash
      !== context.record.observationPolicyRefHash
    || payload.state !== "RESERVED") fail("RESERVATION_BINDING_MISMATCH");
  token(payload.reservationId, "RESERVATION_ID");
  token(payload.lifecycleStreamId, "LIFECYCLE_STREAM_ID");
  token(payload.evidenceRequirementId, "EVIDENCE_REQUIREMENT_ID");
  const evidence = evidenceRequirement(tender, payload.evidenceRequirementId);
  if (payload.evidenceRequirementRefHash
      !== evidence.evidenceRequirementRefHash) {
    fail("EVIDENCE_REQUIREMENT_REF_MISMATCH");
  }
  if (!OBSERVATION_TARGETS.has(payload.observationTarget)) {
    fail("OBSERVATION_TARGET_INVALID");
  }
  recoveryBinding(tender, payload.observationTarget,
    payload.recoveryRequirementId, payload.recoveryOutcomeRefHash,
    payload.evidenceRequirementId);
  hash(payload.primaryProviderRefHash, "PRIMARY_PROVIDER_REF_HASH");
  hash(payload.primaryControllerRefHash, "PRIMARY_CONTROLLER_REF_HASH");
  hash(payload.witnessProviderRefHash, "WITNESS_PROVIDER_REF_HASH");
  if (payload.primaryProviderRefHash === payload.witnessProviderRefHash
    || payload.primaryControllerRefHash === payload.witnessControllerRefHash) {
    fail("WITNESS_STRUCTURAL_SEPARATION_REQUIRED");
  }
  hash(payload.reservationNonceHash, "RESERVATION_NONCE_HASH");
  const reservedAt = instant(payload.reservedAt, "RESERVED_AT");
  const opensAt = instant(payload.observationOpensAt, "OBSERVATION_OPENS_AT");
  const closesAt = instant(payload.observationClosesAt, "OBSERVATION_CLOSES_AT");
  const expiresAt = instant(payload.expiresAt, "EXPIRES_AT");
  if (Date.parse(reservedAt) > Date.parse(opensAt)
    || Date.parse(opensAt) >= Date.parse(closesAt)
    || Date.parse(closesAt) > Date.parse(expiresAt)
    || Date.parse(expiresAt) > Date.parse(tender.exactOutcome.deadline)
    || Date.parse(reservedAt) > Date.parse(tender.formationDeadline)) {
    fail("OBSERVATION_WINDOW_OR_EXPIRY_INVALID");
  }
}

function sameBindings(result, reservation) {
  const fields = [
    "sourceSystemId", "reservationId", "lifecycleStreamId", "tenderHash",
    "exactOutcomeHash", "acceptanceCriteriaRefHash", "evidenceRequirementId",
    "evidenceRequirementRefHash", "observationTarget", "recoveryRequirementId",
    "recoveryOutcomeRefHash", "primaryAttemptHash", "primaryProviderRefHash",
    "primaryControllerRefHash", "witnessProviderRefHash",
    "witnessOwnerRefHash", "witnessControllerRefHash",
    "observationPolicyRefHash", "reservationNonceHash",
  ];
  return fields.every((field) => result[field] === reservation[field]);
}

function validateResultPayload(payload, reservation, resultHash) {
  exactObject(payload, RESULT_PAYLOAD_FIELDS, "RESULT_PAYLOAD");
  if (payload.schemaVersion !== "1.0.0"
    || payload.reservationSourceHash !== resultHash
    || !sameBindings(payload, reservation)
    || !OBSERVATION_STATUSES.has(payload.observationStatus)
    || !ACCEPTED_EVIDENCE_SOURCE_CLASSES.has(payload.evidenceSourceClass)
    || FORBIDDEN_EVIDENCE_SOURCE_CLASSES.has(payload.evidenceSourceClass)
    || payload.providerSelfReportAcceptedAsOutcomeTruth !== false
    || payload.serverAcknowledgementAcceptedAsOutcomeTruth !== false
    || payload.modelRewardAcceptedAsOutcomeTruth !== false
    || payload.state !== "RESULT_ISSUED") fail("RESULT_BINDING_INVALID");
  hash(payload.resultReceiptNonceHash, "RESULT_RECEIPT_NONCE_HASH");
  if (payload.resultReceiptNonceHash === reservation.reservationNonceHash) {
    fail("RESULT_NONCE_MUST_DIFFER_FROM_RESERVATION_NONCE");
  }
  if (!Array.isArray(payload.observationEvidenceHashes)
    || payload.observationEvidenceHashes.length < 1
    || payload.observationEvidenceHashes.length > 64) {
    fail("RESULT_EVIDENCE_HASHES_INVALID");
  }
  const sorted = payload.observationEvidenceHashes.map((value) =>
    hash(value, "OBSERVATION_EVIDENCE_HASH"));
  if (new Set(sorted).size !== sorted.length) {
    fail("RESULT_EVIDENCE_HASH_DUPLICATE");
  }
  const normalized = [...sorted].sort();
  if (normalized.some((value, index) =>
    value !== payload.observationEvidenceHashes[index])
    || payload.observationEvidenceSetHash !== digest(
      "outsider/independent-outcome-witness-observation-evidence-set/v1",
      normalized)) fail("RESULT_EVIDENCE_SET_INVALID");
  instant(payload.observedAt, "OBSERVED_AT");
  instant(payload.issuedAt, "ISSUED_AT");
  if (Date.parse(payload.observedAt) < Date.parse(reservation.observationOpensAt)
    || Date.parse(payload.observedAt) > Date.parse(reservation.observationClosesAt)
    || Date.parse(payload.issuedAt) < Date.parse(payload.observedAt)
    || Date.parse(payload.issuedAt) > Date.parse(reservation.expiresAt)) {
    fail("RESULT_TIME_OUTSIDE_RESERVED_WINDOW");
  }
}

function validateRevocationPayload(payload, reservation, reservationHash) {
  exactObject(payload, REVOCATION_PAYLOAD_FIELDS, "REVOCATION_PAYLOAD");
  const bindings = ["sourceSystemId", "reservationId", "lifecycleStreamId",
    "tenderHash", "witnessOwnerRefHash", "witnessControllerRefHash",
    "reservationNonceHash"];
  if (payload.schemaVersion !== "1.0.0"
    || payload.reservationSourceHash !== reservationHash
    || bindings.some((field) => payload[field] !== reservation[field])
    || payload.state !== "REVOKED") fail("REVOCATION_BINDING_INVALID");
  hash(payload.revocationNonceHash, "REVOCATION_NONCE_HASH");
  if (payload.revocationNonceHash === reservation.reservationNonceHash) {
    fail("REVOCATION_NONCE_MUST_DIFFER_FROM_RESERVATION_NONCE");
  }
  token(payload.reasonCode, "REVOCATION_REASON_CODE");
  instant(payload.revokedAt, "REVOKED_AT");
  if (Date.parse(payload.revokedAt) < Date.parse(reservation.reservedAt)) {
    fail("REVOCATION_BEFORE_RESERVATION");
  }
}

const REPLAY_INPUT_FIELDS = Object.freeze([
  "tender", "expectedTenderHash", "verifierContext",
  "expectedVerifierContextHash", "reservationSourceBytes",
  "expectedReservationSourceHash", "resultReceiptSourceBytes",
  "expectedResultReceiptSourceHash", "revocationSourceBytes",
  "expectedRevocationSourceHash", "observedAt",
]);

export function verifyIndependentOutcomeWitnessLifecycleV1(input = {}) {
  try {
    exactObject(input, REPLAY_INPUT_FIELDS, "REPLAY_INPUT");
    const observedAt = instant(input.observedAt, "REPLAY_OBSERVED_AT");
    const tenderCheck = verifyOutsiderOutcomeTenderV1(input.tender,
      { expectedTenderHash: input.expectedTenderHash });
    if (!tenderCheck.ok || tenderCheck.authority !== "NONE") {
      fail("TENDER_REPLAY_FAILED");
    }
    const context = verifyContext(input.verifierContext,
      input.expectedVerifierContextHash);
    const reservation = verifySignedSource(input.reservationSourceBytes,
      "RESERVATION",
      OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS.reservation,
      context, "RESERVATION_SOURCE");
    if (reservation.sourceHash
      !== hash(input.expectedReservationSourceHash,
        "EXPECTED_RESERVATION_SOURCE_HASH")) {
      fail("RESERVATION_SOURCE_HASH_MISMATCH");
    }
    validateReservationPayload(reservation.payload, input.tender, context);
    if (Date.parse(observedAt) < Date.parse(reservation.payload.reservedAt)) {
      fail("REPLAY_OBSERVED_BEFORE_RESERVATION");
    }

    const resultBytesPresent = input.resultReceiptSourceBytes !== null;
    if (resultBytesPresent !== (input.expectedResultReceiptSourceHash !== null)) {
      fail("RESULT_SOURCE_AND_PIN_PRESENCE_MISMATCH");
    }
    let result = null;
    if (resultBytesPresent) {
      result = verifySignedSource(input.resultReceiptSourceBytes,
        "RESULT_RECEIPT",
        OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS.resultReceipt,
        context, "RESULT_SOURCE");
      if (result.sourceHash !== hash(input.expectedResultReceiptSourceHash,
        "EXPECTED_RESULT_SOURCE_HASH")) fail("RESULT_SOURCE_HASH_MISMATCH");
      validateResultPayload(result.payload, reservation.payload,
        reservation.sourceHash);
      if (Date.parse(result.payload.issuedAt) > Date.parse(observedAt)) {
        fail("RESULT_ISSUED_AFTER_REPLAY_OBSERVATION");
      }
    }

    const revocationBytesPresent = input.revocationSourceBytes !== null;
    if (revocationBytesPresent !== (input.expectedRevocationSourceHash !== null)) {
      fail("REVOCATION_SOURCE_AND_PIN_PRESENCE_MISMATCH");
    }
    let revocation = null;
    if (revocationBytesPresent) {
      revocation = verifySignedSource(input.revocationSourceBytes,
        "REVOCATION",
        OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS.revocation,
        context, "REVOCATION_SOURCE");
      if (revocation.sourceHash !== hash(input.expectedRevocationSourceHash,
        "EXPECTED_REVOCATION_SOURCE_HASH")) {
        fail("REVOCATION_SOURCE_HASH_MISMATCH");
      }
      validateRevocationPayload(revocation.payload, reservation.payload,
        reservation.sourceHash);
      if (Date.parse(revocation.payload.revokedAt) > Date.parse(observedAt)) {
        fail("REVOCATION_AFTER_REPLAY_OBSERVATION");
      }
      if (result && Date.parse(result.payload.issuedAt)
          >= Date.parse(revocation.payload.revokedAt)) {
        fail("RESULT_ISSUED_AT_OR_AFTER_REVOCATION");
      }
    }

    const expired = Date.parse(observedAt)
      >= Date.parse(reservation.payload.expiresAt);
    const revoked = revocation !== null;
    const reservationCurrent = !expired && !revoked;
    const body = {
      schema:
        OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS.replay,
      schemaVersion: "1.0.0",
      ok: true,
      tenderHash: input.tender.tenderHash,
      exactOutcomeHash: reservation.payload.exactOutcomeHash,
      acceptanceCriteriaRefHash:
        reservation.payload.acceptanceCriteriaRefHash,
      primaryAttemptHash: reservation.payload.primaryAttemptHash,
      primaryProviderRefHash: reservation.payload.primaryProviderRefHash,
      primaryControllerRefHash: reservation.payload.primaryControllerRefHash,
      witnessProviderRefHash: reservation.payload.witnessProviderRefHash,
      witnessOwnerRefHash: reservation.payload.witnessOwnerRefHash,
      witnessControllerRefHash: reservation.payload.witnessControllerRefHash,
      evidenceRequirementId: reservation.payload.evidenceRequirementId,
      observationTarget: reservation.payload.observationTarget,
      recoveryRequirementId: reservation.payload.recoveryRequirementId,
      reservationSourceHash: reservation.sourceHash,
      resultReceiptSourceHash: result?.sourceHash ?? null,
      revocationSourceHash: revocation?.sourceHash ?? null,
      observedAt,
      observationOpensAt: reservation.payload.observationOpensAt,
      observationClosesAt: reservation.payload.observationClosesAt,
      expiresAt: reservation.payload.expiresAt,
      reservationExpired: expired,
      reservationRevoked: revoked,
      reservationCurrent,
      resultReceiptPresent: result !== null,
      sourceSignatureContinuityVerified: true,
      exactTenderOutcomeAttemptOwnerWindowNonceAndExpiryReplayed: true,
      structuralControllerAndProviderSeparationObserved: true,
      structuralDistinctnessProvesIndependentControl: false,
      callerPinnedWitnessKeyProvesOwnerIdentity: false,
      callerPinnedWitnessKeyProvesOperationalIndependence: false,
      witnessOwnerIdentityExternallyEstablished: false,
      independentControlEstablished: false,
      witnessSourceDeclaredObservation:
        result?.payload.observationStatus ?? null,
      acceptedEvidenceSourceClass:
        result?.payload.evidenceSourceClass ?? null,
      providerSelfReportAcceptedAsOutcomeTruth: false,
      serverAcknowledgementAcceptedAsOutcomeTruth: false,
      modelRewardAcceptedAsOutcomeTruth: false,
      independentOutcomeTruthEstablished: false,
      recoveryOutcomeTruthEstablished: false,
      capacityReserved: false,
      paymentPerformed: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      enabledCapabilityCount: 0,
      provenAuthorityCount: 0,
      enabledCapabilitiesSubsetOfProvenAuthority: true,
      consequenceReach: "NONE",
      boundary:
        OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_BOUNDARY,
    };
    return Object.freeze({
      ...body,
      replayHash: digest(
        OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS.replay,
        body),
    });
  } catch (error) {
    const errorCode = error instanceof Error
      && typeof error.message === "string"
      && /^OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_[A-Z0-9_]+$/u
        .test(error.message)
      ? error.message : `${PREFIX}UNTRUSTED_FAILURE`;
    return Object.freeze({
      schema:
        OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_SCHEMAS.replay,
      schemaVersion: "1.0.0",
      ok: false,
      errorCode,
      resultReceiptPresent: false,
      reservationCurrent: false,
      sourceSignatureContinuityVerified: false,
      independentControlEstablished: false,
      independentOutcomeTruthEstablished: false,
      capacityReserved: false,
      paymentPerformed: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      enabledCapabilityCount: 0,
      provenAuthorityCount: 0,
      enabledCapabilitiesSubsetOfProvenAuthority: true,
      consequenceReach: "NONE",
      boundary:
        OUTSIDER_INDEPENDENT_OUTCOME_WITNESS_LIFECYCLE_V1_BOUNDARY,
    });
  }
}

export const verifyIndependentOutcomeOrRecoveryWitnessLifecycleV1
  = verifyIndependentOutcomeWitnessLifecycleV1;
