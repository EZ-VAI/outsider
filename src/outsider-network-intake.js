/*
 * Outsider three-lane network intake protocol.
 *
 * This is a transport and quarantine contract, not a CURATE, training,
 * authority, action, or causal-evidence contract.  A transport signature proves
 * possession of a submission key only.  It never identifies the actor,
 * principal, resource owner, authority issuer, or outcome adjudicator.
 */

import {
  createHash, createPrivateKey, createPublicKey, sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { isProxy } from "node:util/types";
import { canonicalizeStrict } from "./canonical.js";

const ArrayIsArray = Array.isArray;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const DateParse = Date.parse;
const DateConstructor = Date;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const JsonParse = JSON.parse;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectKeys = Object.keys;
const ObjectPrototype = Object.prototype;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const ReflectOwnKeys = Reflect.ownKeys;
const SetConstructor = Set;
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringReplace = Function.prototype.call.bind(String.prototype.replace);
const URLConstructor = URL;
const URLPrototype = URL.prototype;
const URLProtocolGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "protocol").get);
const URLHostnameGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "hostname").get);
const URLUsernameGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "username").get);
const URLPasswordGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "password").get);
const URLSearchGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "search").get);
const URLHashGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "hash").get);
const URLToString = Function.prototype.call.bind(URL.prototype.toString);
const BufferByteLength = Buffer.byteLength;
const BufferFrom = Buffer.from;
const BufferToString = Function.prototype.call.bind(Buffer.prototype.toString);
const IntrinsicProbePublicKey = createPublicKey({
  key: BufferFrom("302a300506032b6570032100" + "00".repeat(32), "hex"),
  format: "der",
  type: "spki",
});
const IntrinsicPublicKeyPrototype = ObjectGetPrototypeOf(IntrinsicProbePublicKey);
const IntrinsicAsymmetricKeyPrototype = ObjectGetPrototypeOf(IntrinsicPublicKeyPrototype);
const KeyObjectAsymmetricKeyType = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(IntrinsicAsymmetricKeyPrototype, "asymmetricKeyType").get);
const KeyObjectExport = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(IntrinsicPublicKeyPrototype, "export").value);
const CryptoHashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const CryptoHashUpdate = Function.prototype.call.bind(CryptoHashPrototype.update);
const CryptoHashDigest = Function.prototype.call.bind(CryptoHashPrototype.digest);

export const NETWORK_INTAKE_SCHEMAS = ObjectFreeze({
  manifest: "outsider/network-intake-manifest/v1",
  challenge: "outsider/network-intake-challenge/v1",
  reservation: "outsider/network-intake-reservation/v1",
  payloadEnvelope: "outsider/network-intake-payload-envelope/v1",
  receipt: "outsider/network-intake-receipt/v1",
  revocation: "outsider/network-intake-revocation/v1",
  revocationAcknowledgment:
    "outsider/network-intake-revocation-acknowledgment/v1",
  verification: "outsider/network-intake-verification/v1",
});

export const NETWORK_INTAKE_LANES = ObjectFreeze([
  "DELEGATION_RESPONSIBILITY",
  "ACTION_OUTCOME",
  "PROSPECTIVE_CENSUS",
]);

export const NETWORK_INTAKE_PAYLOAD_SCHEMAS = ObjectFreeze({
  DELEGATION_RESPONSIBILITY:
    "outsider/network-delegation-responsibility-projection/v1",
  ACTION_OUTCOME: "outsider/network-action-outcome-projection/v1",
  PROSPECTIVE_CENSUS: "outsider/network-prospective-census-projection/v1",
});

/* ACTION_OUTCOME/v2 is an append-only, delayed witness successor to an
   already-recorded v1 action occurrence.  Keeping the historical public map
   above pinned to v1 preserves every existing manifest and caller. */
export const NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS = ObjectFreeze({
  V1: NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME,
  V2: "outsider/network-action-outcome-projection/v2",
});

export const NETWORK_ACTION_OUTCOME_V2_OBSERVATION_STATUSES = ObjectFreeze([
  "CENSORED",
  "MISSING",
  "OBSERVED",
  "REFUSED",
  "UNAVAILABLE",
]);

export const NETWORK_INTAKE_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const DAY_MS = 86_400_000;

export const NETWORK_INTAKE_BOUNDARY = deepFreeze({
  disposition: "QUARANTINED",
  structuralPrivacyGuards: true,
  noPiiGuaranteed: false,
  noRawMediaGuaranteed: false,
  payloadSchemaAllowlistEnforced: true,
  acceptedPayloadsAreExactHashOnlyProjections: true,
  publicDeploymentReady: false,
  automaticTraining: false,
  trainingRows: 0,
  permitsCuratePromotion: false,
  authority: "NONE",
  actionReady: false,
  executable: false,
  causalExperienceUnits: 0,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
  transportSignerIsActorIdentity: false,
  transportSignerIsAuthority: false,
  transportSignerIsOutcomeAdjudicator: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/u;
const SUBMISSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const PEM = /^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----\n?$/u;
const FORBIDDEN_PAYLOAD_KEY
  = /(?:^|_)(?:password|passwd|secret|private_?key|api_?key|access_?token|refresh_?token|authorization|cookie|raw_?prompt|transcript|command_?output|source_?code|raw_?media|image|video|audio|blob|attachment|url|uri|href)(?:$|_)/iu;
const FORBIDDEN_COMPACT_PAYLOAD_KEY
  = /^(?:(?:raw)?(?:image|video|audio|media|blob|attachment)(?:base64|bytes|data|content)?|(?:full|first|last|legal|display|user)?name|email(?:address)?|phone(?:number)?|telephone|ssn|socialsecuritynumber|passport(?:number)?|nationalid|governmentid|dateofbirth|dob|biometric|faceprint|fingerprint|voiceprint|preciselocation|gps|latitude|longitude|ipaddress|macaddress|deviceidentifier)$/iu;
const REMOTE_OR_INLINE = /(?:^|\s|["'(])(?:https?|file|data|ipfs):/iu;

function fail(code) {
  throw new Error(`NETWORK_INTAKE_${code}`);
}

function sha256Bytes(value) {
  const state = createHash("sha256");
  CryptoHashUpdate(state, value);
  return `sha256:${CryptoHashDigest(state, "hex")}`;
}

export function networkIntakeDigest(domain, value) {
  if (typeof domain !== "string" || !RegExpTest(TOKEN, domain)) fail("DIGEST_DOMAIN_INVALID");
  return sha256Bytes(`${domain}\0${typeof value === "string"
    ? value : canonicalizeStrict(value)}`);
}

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || typeof value !== "object" || SetHas(seen, value)) return value;
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if ("value" in descriptors[key]) deepFreeze(descriptors[key].value, seen);
  }
  return ObjectFreeze(value);
}

function canonicalClone(value) {
  rejectProxyTree(value);
  return deepFreeze(JsonParse(canonicalizeStrict(value)));
}

function rejectProxyTree(value, seen = new SetConstructor(), depth = 0) {
  if (value === null || typeof value !== "object") return;
  if (depth > 64) fail("VALUE_TOO_DEEP");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(seen, value)) fail("CYCLE_FORBIDDEN");
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if (!("value" in descriptor)) fail("ACCESSOR_FORBIDDEN");
    rejectProxyTree(descriptor.value, seen, depth + 1);
  }
  SetDelete(seen, value);
}

function plain(value) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value)) return false;
  const prototype = ObjectGetPrototypeOf(value);
  return prototype === ObjectPrototype || prototype === null;
}

function exactObject(value, fields, code) {
  rejectProxyTree(value);
  if (!plain(value)) fail(`${code}_OBJECT_INVALID`);
  const actual = ObjectKeys(value);
  const expected = [];
  for (let index = 0; index < fields.length; index += 1) expected[index] = fields[index];
  ArraySort(actual);
  ArraySort(expected);
  if (actual.length !== expected.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) fail(`${code}_FIELDS_INVALID`);
  }
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function token(value, code, pattern = TOKEN) {
  if (typeof value !== "string" || !RegExpTest(pattern, value)) fail(`${code}_INVALID`);
  return value;
}

function canonicalTime(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)) fail(`${code}_INVALID`);
  const parsed = DateParse(value);
  if (!NumberIsFinite(parsed)
    || DateToISOString(new DateConstructor(parsed)) !== value) fail(`${code}_INVALID`);
  return value;
}

function boundedAudience(value) {
  if (typeof value !== "string" || value.length > 512) fail("AUDIENCE_INVALID");
  let parsed;
  try { parsed = new URLConstructor(value); } catch { fail("AUDIENCE_INVALID"); }
  if (StringReplace(URLToString(parsed), /\/$/u, "") !== StringReplace(value, /\/$/u, "")) {
    fail("AUDIENCE_NON_CANONICAL");
  }
  const protocol = URLProtocolGet(parsed);
  const hostname = URLHostnameGet(parsed);
  if (protocol !== "https:"
    && !(protocol === "http:"
      && (hostname === "127.0.0.1" || hostname === "localhost"))) {
    fail("AUDIENCE_SCHEME_INVALID");
  }
  if (URLUsernameGet(parsed) !== "" || URLPasswordGet(parsed) !== ""
    || URLSearchGet(parsed) !== "" || URLHashGet(parsed) !== "") {
    fail("AUDIENCE_COMPONENT_INVALID");
  }
  return StringReplace(value, /\/$/u, "");
}

function keyId(publicKeyPem) {
  if (typeof publicKeyPem !== "string" || publicKeyPem.length > 512
    || !RegExpTest(PEM, publicKeyPem)) {
    fail("PUBLIC_KEY_INVALID");
  }
  let key;
  try { key = createPublicKey(publicKeyPem); } catch { fail("PUBLIC_KEY_INVALID"); }
  if (KeyObjectAsymmetricKeyType(key) !== "ed25519") fail("PUBLIC_KEY_TYPE_INVALID");
  return sha256Bytes(KeyObjectExport(key, { type: "spki", format: "der" }));
}

function signHash(valueHash, privateKeyPem) {
  let privateKey;
  try { privateKey = createPrivateKey(privateKeyPem); } catch { fail("PRIVATE_KEY_INVALID"); }
  if (KeyObjectAsymmetricKeyType(privateKey) !== "ed25519") fail("PRIVATE_KEY_TYPE_INVALID");
  const publicKey = createPublicKey(privateKey);
  const exported = KeyObjectExport(publicKey, { type: "spki", format: "pem" });
  const publicKeyPem = typeof exported === "string" ? exported : BufferToString(exported);
  return deepFreeze({
    algorithm: "Ed25519",
    keyId: keyId(publicKeyPem),
    publicKeyPem,
    value: BufferToString(cryptoSign(null, BufferFrom(valueHash), privateKey), "base64"),
  });
}

function publicKeyPemFromPrivate(privateKeyPem) {
  let privateKey;
  try { privateKey = createPrivateKey(privateKeyPem); } catch { fail("PRIVATE_KEY_INVALID"); }
  if (KeyObjectAsymmetricKeyType(privateKey) !== "ed25519") fail("PRIVATE_KEY_TYPE_INVALID");
  const publicKey = createPublicKey(privateKey);
  const exported = KeyObjectExport(publicKey, { type: "spki", format: "pem" });
  return typeof exported === "string" ? exported : BufferToString(exported);
}

function verifySignature(valueHash, signature, expectedPublicKeyPem = null) {
  try {
    exactObject(signature, ["algorithm", "keyId", "publicKeyPem", "value"], "SIGNATURE");
    if (signature.algorithm !== "Ed25519" || signature.keyId !== keyId(signature.publicKeyPem)
      || expectedPublicKeyPem !== null && signature.keyId !== keyId(expectedPublicKeyPem)
      || typeof signature.value !== "string" || signature.value.length > 128
      || !RegExpTest(/^[A-Za-z0-9+/]+={0,2}$/u, signature.value)) return false;
    const signatureBytes = BufferFrom(signature.value, "base64");
    if (signatureBytes.length !== 64
      || BufferToString(signatureBytes, "base64") !== signature.value) return false;
    return cryptoVerify(null, BufferFrom(valueHash), createPublicKey(signature.publicKeyPem),
      signatureBytes);
  } catch { return false; }
}

function addressedSigned(body, domain, hashField, privateKeyPem) {
  const unsigned = { ...body, signature: null };
  const valueHash = networkIntakeDigest(domain, unsigned);
  return deepFreeze({ ...unsigned, [hashField]: valueHash,
    signature: signHash(valueHash, privateKeyPem) });
}

function verifyAddressedSigned(record, fields, domain, hashField,
  expectedPublicKeyPem = null) {
  const allFields = [];
  for (let index = 0; index < fields.length; index += 1) allFields[index] = fields[index];
  allFields[fields.length] = hashField;
  allFields[fields.length + 1] = "signature";
  exactObject(record, allFields, domain);
  hash(record[hashField], hashField);
  const body = {};
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    body[field] = record[field];
  }
  const expected = networkIntakeDigest(domain, { ...body, signature: null });
  if (record[hashField] !== expected
    || !verifySignature(expected, record.signature, expectedPublicKeyPem)) {
    fail(`${hashField}_SIGNATURE_OR_HASH_INVALID`);
  }
  return record;
}

function lane(value) {
  let found = false;
  for (let index = 0; index < NETWORK_INTAKE_LANES.length; index += 1) {
    if (NETWORK_INTAKE_LANES[index] === value) found = true;
  }
  if (!found) fail("LANE_INVALID");
  return value;
}

function fixedFalse(value, code) {
  if (value !== false) fail(`${code}_MUST_REMAIN_FALSE`);
  return false;
}

function expectedPayloadSchema(selectedLane, value) {
  const expected = NETWORK_INTAKE_PAYLOAD_SCHEMAS[selectedLane];
  if (selectedLane === "ACTION_OUTCOME"
    && value === NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2) return value;
  if (value !== expected) fail("PAYLOAD_SCHEMA_NOT_ALLOWLISTED_FOR_LANE");
  return expected;
}

function normalizeDelegationResponsibilityPayload(value, subject) {
  exactObject(value, ["schema", "accountableDeploymentSubjectHash",
    "delegationEnvelopeHash", "capabilityRadiusHash",
    "authorityRadiusHash", "evidenceRadiusHash", "responsibilityRadiusHash",
    "responsibilityCommitmentHash", "ownerWriteGateConformanceHash",
    "authorityEstablished", "responsibilityCoverageEstablished"],
  "DELEGATION_RESPONSIBILITY_PAYLOAD");
  const accountableDeploymentSubjectHash = hash(value.accountableDeploymentSubjectHash,
    "ACCOUNTABLE_DEPLOYMENT_SUBJECT_HASH");
  if (accountableDeploymentSubjectHash !== subject.accountableDeploymentSubjectHash) {
    fail("DELEGATION_SUBJECT_BINDING_MISMATCH");
  }
  return {
    schema: expectedPayloadSchema("DELEGATION_RESPONSIBILITY", value.schema),
    accountableDeploymentSubjectHash,
    delegationEnvelopeHash: hash(value.delegationEnvelopeHash, "DELEGATION_ENVELOPE_HASH"),
    capabilityRadiusHash: hash(value.capabilityRadiusHash, "CAPABILITY_RADIUS_HASH"),
    authorityRadiusHash: hash(value.authorityRadiusHash, "AUTHORITY_RADIUS_HASH"),
    evidenceRadiusHash: hash(value.evidenceRadiusHash, "EVIDENCE_RADIUS_HASH"),
    responsibilityRadiusHash: hash(value.responsibilityRadiusHash,
      "RESPONSIBILITY_RADIUS_HASH"),
    responsibilityCommitmentHash: hash(value.responsibilityCommitmentHash,
      "RESPONSIBILITY_COMMITMENT_HASH"),
    ownerWriteGateConformanceHash: nullableHash(value.ownerWriteGateConformanceHash,
      "OWNER_WRITE_GATE_CONFORMANCE_HASH"),
    authorityEstablished: fixedFalse(value.authorityEstablished,
      "DELEGATION_AUTHORITY_ESTABLISHED"),
    responsibilityCoverageEstablished: fixedFalse(value.responsibilityCoverageEstablished,
      "RESPONSIBILITY_COVERAGE_ESTABLISHED"),
  };
}

function normalizeActionOutcomeV1Payload(value, subject) {
  exactObject(value, ["schema", "attemptRecordHash", "executionEvidenceHash",
    "outcomeEvidenceHash", "obligationStateHash", "sourceArtifactHash",
    "sourceReplayReferenceHash", "externalOutcomeVerified",
    "causalAttributionEstablished", "obligationClosed"], "ACTION_OUTCOME_PAYLOAD");
  const attemptRecordHash = hash(value.attemptRecordHash, "ATTEMPT_RECORD_HASH");
  if (attemptRecordHash !== subject.attemptHash) fail("ACTION_OUTCOME_ATTEMPT_BINDING_MISMATCH");
  return {
    schema: expectedPayloadSchema("ACTION_OUTCOME", value.schema),
    attemptRecordHash,
    executionEvidenceHash: hash(value.executionEvidenceHash, "EXECUTION_EVIDENCE_HASH"),
    outcomeEvidenceHash: hash(value.outcomeEvidenceHash, "OUTCOME_EVIDENCE_HASH"),
    obligationStateHash: hash(value.obligationStateHash, "OBLIGATION_STATE_HASH"),
    sourceArtifactHash: hash(value.sourceArtifactHash, "SOURCE_ARTIFACT_HASH"),
    sourceReplayReferenceHash: nullableHash(value.sourceReplayReferenceHash,
      "SOURCE_REPLAY_REFERENCE_HASH"),
    externalOutcomeVerified: fixedFalse(value.externalOutcomeVerified,
      "EXTERNAL_OUTCOME_VERIFIED"),
    causalAttributionEstablished: fixedFalse(value.causalAttributionEstablished,
      "CAUSAL_ATTRIBUTION_ESTABLISHED"),
    obligationClosed: fixedFalse(value.obligationClosed, "OBLIGATION_CLOSED"),
  };
}

function includesExact(values, candidate) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === candidate) return true;
  }
  return false;
}

function allDistinct(values, code) {
  const seen = new SetConstructor();
  for (let index = 0; index < values.length; index += 1) {
    if (SetHas(seen, values[index])) fail(`${code}_ROLE_COLLISION`);
    SetAdd(seen, values[index]);
  }
}

function normalizeActionOutcomeV2Payload(value, subject) {
  exactObject(value, ["schema", "baseActionOutcomeManifestHash",
    "baseActionOutcomeBundleHash", "baseActionOutcomeOccurrenceIdentityHash",
    "attemptRecordHash", "executionEvidenceHash", "observationStatus",
    "outcomeWitnessEnvelopeHash", "witnessSourceManifestHash",
    "witnessReplayReceiptHash", "witnessRelationshipReviewHash",
    "consequenceReportHash", "affectedPartyRegisterRootHash",
    "affectedPartyReportSetHash", "recoveryEvidenceSetHash",
    "obligationGenesisHash", "obligationStateHash", "horizonId",
    "obligationHorizonCommitmentHash", "affectedPartyHorizonBindingHash",
    "observedAt", "externalOutcomeVerified", "causalAttributionEstablished",
    "obligationClosed"], "ACTION_OUTCOME_V2_PAYLOAD");
  if (value.schema !== NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2) {
    fail("ACTION_OUTCOME_V2_SCHEMA_INVALID");
  }
  const attemptRecordHash = hash(value.attemptRecordHash, "ATTEMPT_RECORD_HASH");
  if (attemptRecordHash !== subject.attemptHash) {
    fail("ACTION_OUTCOME_ATTEMPT_BINDING_MISMATCH");
  }
  if (!includesExact(NETWORK_ACTION_OUTCOME_V2_OBSERVATION_STATUSES,
    value.observationStatus)) fail("ACTION_OUTCOME_V2_OBSERVATION_STATUS_INVALID");
  const consequenceReportHash = nullableHash(value.consequenceReportHash,
    "CONSEQUENCE_REPORT_HASH");
  const affectedPartyReportSetHash = nullableHash(value.affectedPartyReportSetHash,
    "AFFECTED_PARTY_REPORT_SET_HASH");
  const recoveryEvidenceSetHash = nullableHash(value.recoveryEvidenceSetHash,
    "RECOVERY_EVIDENCE_SET_HASH");
  if (value.observationStatus === "OBSERVED") {
    if (consequenceReportHash === null || affectedPartyReportSetHash === null) {
      fail("ACTION_OUTCOME_V2_OBSERVED_EVIDENCE_REQUIRED");
    }
  } else if (consequenceReportHash !== null || affectedPartyReportSetHash !== null
    || recoveryEvidenceSetHash !== null) {
    fail("ACTION_OUTCOME_V2_UNOBSERVED_EVIDENCE_MUST_BE_NULL");
  }
  const baseActionOutcomeManifestHash = hash(value.baseActionOutcomeManifestHash,
    "BASE_ACTION_OUTCOME_MANIFEST_HASH");
  const baseActionOutcomeBundleHash = hash(value.baseActionOutcomeBundleHash,
    "BASE_ACTION_OUTCOME_BUNDLE_HASH");
  const baseActionOutcomeOccurrenceIdentityHash = hash(
    value.baseActionOutcomeOccurrenceIdentityHash,
    "BASE_ACTION_OUTCOME_OCCURRENCE_IDENTITY_HASH");
  allDistinct([baseActionOutcomeManifestHash, baseActionOutcomeBundleHash,
    baseActionOutcomeOccurrenceIdentityHash], "ACTION_OUTCOME_V2_BASE_REFERENCE");
  const outcomeWitnessEnvelopeHash = hash(value.outcomeWitnessEnvelopeHash,
    "OUTCOME_WITNESS_ENVELOPE_HASH");
  const witnessSourceManifestHash = hash(value.witnessSourceManifestHash,
    "WITNESS_SOURCE_MANIFEST_HASH");
  const witnessReplayReceiptHash = hash(value.witnessReplayReceiptHash,
    "WITNESS_REPLAY_RECEIPT_HASH");
  const witnessRelationshipReviewHash = hash(value.witnessRelationshipReviewHash,
    "WITNESS_RELATIONSHIP_REVIEW_HASH");
  allDistinct([outcomeWitnessEnvelopeHash, witnessSourceManifestHash,
    witnessReplayReceiptHash, witnessRelationshipReviewHash],
  "ACTION_OUTCOME_V2_WITNESS_REFERENCE");
  const obligationGenesisHash = hash(value.obligationGenesisHash,
    "OBLIGATION_GENESIS_HASH");
  const obligationStateHash = hash(value.obligationStateHash,
    "OBLIGATION_STATE_HASH");
  if (obligationGenesisHash === obligationStateHash) {
    fail("ACTION_OUTCOME_V2_OBLIGATION_HASH_ROLE_COLLISION");
  }
  const obligationHorizonCommitmentHash = hash(
    value.obligationHorizonCommitmentHash, "OBLIGATION_HORIZON_COMMITMENT_HASH");
  const affectedPartyHorizonBindingHash = hash(value.affectedPartyHorizonBindingHash,
    "AFFECTED_PARTY_HORIZON_BINDING_HASH");
  if (obligationHorizonCommitmentHash === affectedPartyHorizonBindingHash) {
    fail("ACTION_OUTCOME_V2_HORIZON_HASH_ROLE_COLLISION");
  }
  return {
    schema: NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2,
    baseActionOutcomeManifestHash,
    baseActionOutcomeBundleHash,
    baseActionOutcomeOccurrenceIdentityHash,
    attemptRecordHash,
    executionEvidenceHash: hash(value.executionEvidenceHash, "EXECUTION_EVIDENCE_HASH"),
    observationStatus: value.observationStatus,
    outcomeWitnessEnvelopeHash,
    witnessSourceManifestHash,
    witnessReplayReceiptHash,
    witnessRelationshipReviewHash,
    consequenceReportHash,
    affectedPartyRegisterRootHash: hash(value.affectedPartyRegisterRootHash,
      "AFFECTED_PARTY_REGISTER_ROOT_HASH"),
    affectedPartyReportSetHash,
    recoveryEvidenceSetHash,
    obligationGenesisHash,
    obligationStateHash,
    horizonId: token(value.horizonId, "HORIZON_ID", TOKEN),
    obligationHorizonCommitmentHash,
    affectedPartyHorizonBindingHash,
    observedAt: canonicalTime(value.observedAt, "ACTION_OUTCOME_V2_OBSERVED_AT"),
    externalOutcomeVerified: fixedFalse(value.externalOutcomeVerified,
      "EXTERNAL_OUTCOME_VERIFIED"),
    causalAttributionEstablished: fixedFalse(value.causalAttributionEstablished,
      "CAUSAL_ATTRIBUTION_ESTABLISHED"),
    obligationClosed: fixedFalse(value.obligationClosed, "OBLIGATION_CLOSED"),
  };
}

function normalizeActionOutcomePayload(value, subject) {
  if (value !== null && typeof value === "object"
    && value.schema === NETWORK_ACTION_OUTCOME_PAYLOAD_SCHEMAS.V2) {
    return normalizeActionOutcomeV2Payload(value, subject);
  }
  return normalizeActionOutcomeV1Payload(value, subject);
}

function normalizeProspectiveCensusPayload(value, subject) {
  exactObject(value, ["schema", "cohortCommitmentHash", "censusSlotCommitmentHash",
    "eligibilityRuleHash", "assignmentPolicyHash", "instrumentPlanHash",
    "preActionRegistrationReferenceHash", "externalTimeAnchorHash",
    "prospectiveRegistrationEstablishedAtNetworkEdge",
    "scientificCensusCompletenessEstablishedAtNetworkEdge"],
  "PROSPECTIVE_CENSUS_PAYLOAD");
  const cohortCommitmentHash = hash(value.cohortCommitmentHash, "COHORT_COMMITMENT_HASH");
  const censusSlotCommitmentHash = hash(value.censusSlotCommitmentHash,
    "CENSUS_SLOT_COMMITMENT_HASH");
  if (cohortCommitmentHash !== subject.cohortHash
    || censusSlotCommitmentHash !== subject.censusSlotHash) {
    fail("PROSPECTIVE_CENSUS_SUBJECT_BINDING_MISMATCH");
  }
  return {
    schema: expectedPayloadSchema("PROSPECTIVE_CENSUS", value.schema),
    cohortCommitmentHash,
    censusSlotCommitmentHash,
    eligibilityRuleHash: hash(value.eligibilityRuleHash, "ELIGIBILITY_RULE_HASH"),
    assignmentPolicyHash: hash(value.assignmentPolicyHash, "ASSIGNMENT_POLICY_HASH"),
    instrumentPlanHash: hash(value.instrumentPlanHash, "INSTRUMENT_PLAN_HASH"),
    preActionRegistrationReferenceHash: hash(value.preActionRegistrationReferenceHash,
      "PRE_ACTION_REGISTRATION_REFERENCE_HASH"),
    externalTimeAnchorHash: nullableHash(value.externalTimeAnchorHash,
      "EXTERNAL_TIME_ANCHOR_HASH"),
    prospectiveRegistrationEstablishedAtNetworkEdge: fixedFalse(
      value.prospectiveRegistrationEstablishedAtNetworkEdge,
      "PROSPECTIVE_REGISTRATION_ESTABLISHED_AT_NETWORK_EDGE"),
    scientificCensusCompletenessEstablishedAtNetworkEdge: fixedFalse(
      value.scientificCensusCompletenessEstablishedAtNetworkEdge,
      "SCIENTIFIC_CENSUS_COMPLETENESS_ESTABLISHED_AT_NETWORK_EDGE"),
  };
}

function normalizeAllowlistedPayload(selectedLane, payloadSchema, value, subject) {
  expectedPayloadSchema(selectedLane, payloadSchema);
  let normalized;
  if (selectedLane === "DELEGATION_RESPONSIBILITY") {
    normalized = normalizeDelegationResponsibilityPayload(value, subject);
  } else if (selectedLane === "ACTION_OUTCOME") {
    normalized = normalizeActionOutcomePayload(value, subject);
  } else {
    normalized = normalizeProspectiveCensusPayload(value, subject);
  }
  if (canonicalizeStrict(value) !== canonicalizeStrict(normalized)) {
    fail("PAYLOAD_CANONICAL_PROJECTION_MISMATCH");
  }
  return normalized;
}

function validatePayloadTree(value, state = { nodes: 0 }, depth = 0) {
  if (depth > 64 || state.nodes > 100_000) fail("PAYLOAD_TREE_TOO_LARGE");
  state.nodes += 1;
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!NumberIsFinite(value)) fail("PAYLOAD_NUMBER_INVALID");
    return;
  }
  if (typeof value === "string") {
    if (value.length > 16_384 || RegExpTest(REMOTE_OR_INLINE, value)) {
      fail("PAYLOAD_STRING_INVALID");
    }
    return;
  }
  if (typeof value !== "object" || isProxy(value)) fail("PAYLOAD_VALUE_INVALID");
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const compactKey = typeof key === "string" ? StringReplace(key, /[_\-\s]/gu, "") : "";
    if (typeof key !== "string" || RegExpTest(FORBIDDEN_PAYLOAD_KEY, key)
      || RegExpTest(FORBIDDEN_COMPACT_PAYLOAD_KEY, compactKey)
      || !("value" in descriptors[key])) fail("PAYLOAD_FIELD_FORBIDDEN");
    validatePayloadTree(descriptors[key].value, state, depth + 1);
  }
}

export function encodeNetworkIntakePayload(payload) {
  rejectProxyTree(payload);
  validatePayloadTree(payload);
  const canonical = canonicalizeStrict(payload);
  const payloadBytes = BufferByteLength(canonical, "utf8");
  if (payloadBytes < 2 || payloadBytes > NETWORK_INTAKE_MAX_PAYLOAD_BYTES) {
    fail("PAYLOAD_BYTES_INVALID");
  }
  return deepFreeze({ canonical, payloadBytes,
    payloadByteHash: sha256Bytes(canonical),
    payloadSemanticHash: networkIntakeDigest("outsider/network-intake-payload-semantic/v1",
      payload) });
}

function normalizeSubject(value, selectedLane) {
  exactObject(value, ["claimHash", "wayHash", "worldHash", "episodeHash", "attemptHash",
    "actorIdentityEnvelopeHash", "accountableDeploymentSubjectHash",
    "attemptActorSubjectHash", "cohortHash", "censusSlotHash"], "SUBJECT");
  const result = {
    claimHash: hash(value.claimHash, "CLAIM_HASH"),
    wayHash: hash(value.wayHash, "WAY_HASH"),
    worldHash: hash(value.worldHash, "WORLD_HASH"),
    episodeHash: nullableHash(value.episodeHash, "EPISODE_HASH"),
    attemptHash: nullableHash(value.attemptHash, "ATTEMPT_HASH"),
    actorIdentityEnvelopeHash: nullableHash(value.actorIdentityEnvelopeHash,
      "ACTOR_IDENTITY_ENVELOPE_HASH"),
    accountableDeploymentSubjectHash: nullableHash(value.accountableDeploymentSubjectHash,
      "ACCOUNTABLE_DEPLOYMENT_SUBJECT_HASH"),
    attemptActorSubjectHash: nullableHash(value.attemptActorSubjectHash,
      "ATTEMPT_ACTOR_SUBJECT_HASH"),
    cohortHash: hash(value.cohortHash, "COHORT_HASH"),
    censusSlotHash: hash(value.censusSlotHash, "CENSUS_SLOT_HASH"),
  };
  const materializedValues = [result.episodeHash, result.attemptHash,
    result.actorIdentityEnvelopeHash, result.accountableDeploymentSubjectHash,
    result.attemptActorSubjectHash];
  let materialized = true;
  let any = false;
  for (let index = 0; index < materializedValues.length; index += 1) {
    if (materializedValues[index] === null) materialized = false;
    else any = true;
  }
  if (selectedLane === "PROSPECTIVE_CENSUS") {
    if (any && !materialized) fail("CENSUS_SUBJECT_PARTIALLY_MATERIALIZED");
  } else if (!materialized) fail("MATERIALIZED_SUBJECT_REQUIRED");
  return result;
}

function normalizeSource(value) {
  exactObject(value, ["sourceManifestHash", "instrumentHash", "rightsReviewHash",
    "privacyReviewHash"], "SOURCE");
  return {
    sourceManifestHash: hash(value.sourceManifestHash, "SOURCE_MANIFEST_HASH"),
    instrumentHash: hash(value.instrumentHash, "INSTRUMENT_HASH"),
    rightsReviewHash: hash(value.rightsReviewHash, "RIGHTS_REVIEW_HASH"),
    privacyReviewHash: hash(value.privacyReviewHash, "PRIVACY_REVIEW_HASH"),
  };
}

function rejectTransportIdentityRoleCollapse(manifest, transportSignerKeyId) {
  const refs = [manifest.subject.actorIdentityEnvelopeHash,
    manifest.subject.accountableDeploymentSubjectHash,
    manifest.subject.attemptActorSubjectHash];
  for (let index = 0; index < refs.length; index += 1) {
    if (refs[index] !== null && refs[index] === transportSignerKeyId) {
      fail("TRANSPORT_SIGNER_IDENTITY_ROLE_COLLISION");
    }
  }
}

function objectIdentityHash(payload) {
  return networkIntakeDigest("outsider/network-intake-object/v1", {
    payloadByteHash: payload.payloadByteHash,
    payloadSemanticHash: payload.payloadSemanticHash,
    payloadBytes: payload.payloadBytes,
  });
}

function normalizePayloadProjection(value) {
  exactObject(value, ["payloadByteHash", "payloadSemanticHash", "payloadBytes",
    "objectIdentityHash"], "PAYLOAD_PROJECTION");
  const projection = {
    payloadByteHash: hash(value.payloadByteHash, "PAYLOAD_BYTE_HASH"),
    payloadSemanticHash: hash(value.payloadSemanticHash, "PAYLOAD_SEMANTIC_HASH"),
    payloadBytes: value.payloadBytes,
    objectIdentityHash: hash(value.objectIdentityHash, "OBJECT_IDENTITY_HASH"),
  };
  if (!NumberIsSafeInteger(projection.payloadBytes) || projection.payloadBytes < 2
    || projection.payloadBytes > NETWORK_INTAKE_MAX_PAYLOAD_BYTES) {
    fail("PAYLOAD_BYTES_INVALID");
  }
  if (projection.objectIdentityHash !== objectIdentityHash(projection)) {
    fail("OBJECT_IDENTITY_HASH_MISMATCH");
  }
  return projection;
}

export function createNetworkIntakeManifest(input = {}) {
  canonicalizeStrict(input);
  exactObject(input, ["lane", "clientSubmissionId", "payloadSchema", "payload",
    "subject", "source", "consentHash", "retentionDays", "createdAt"], "MANIFEST_INPUT");
  const selectedLane = lane(input.lane);
  token(input.clientSubmissionId, "CLIENT_SUBMISSION_ID", SUBMISSION_ID);
  const subject = normalizeSubject(input.subject, selectedLane);
  const payloadSchema = expectedPayloadSchema(selectedLane, input.payloadSchema);
  normalizeAllowlistedPayload(selectedLane, payloadSchema, input.payload, subject);
  const payload = encodeNetworkIntakePayload(input.payload);
  const body = {
    schema: NETWORK_INTAKE_SCHEMAS.manifest,
    schemaVersion: "1.0.0",
    lane: selectedLane,
    clientSubmissionId: input.clientSubmissionId,
    payloadSchema,
    payload: (() => {
      const projection = {
      payloadByteHash: payload.payloadByteHash,
      payloadSemanticHash: payload.payloadSemanticHash,
      payloadBytes: payload.payloadBytes,
      };
      return { ...projection, objectIdentityHash: objectIdentityHash(projection) };
    })(),
    subject,
    source: normalizeSource(input.source),
    consentHash: hash(input.consentHash, "CONSENT_HASH"),
    retentionDays: input.retentionDays,
    createdAt: canonicalTime(input.createdAt, "MANIFEST_CREATED_AT"),
    useBoundary: NETWORK_INTAKE_BOUNDARY,
  };
  if (!NumberIsSafeInteger(body.retentionDays) || body.retentionDays < 1
    || body.retentionDays > 3650) fail("RETENTION_DAYS_INVALID");
  const occurrenceIdentityHash = networkIntakeDigest(
    "outsider/network-intake-occurrence/v1", {
      lane: body.lane, clientSubmissionId: body.clientSubmissionId,
      subject: body.subject, sourceManifestHash: body.source.sourceManifestHash,
      payloadSemanticHash: body.payload.payloadSemanticHash, createdAt: body.createdAt,
    });
  const withOccurrence = { ...body, occurrenceIdentityHash };
  return deepFreeze({ ...withOccurrence, manifestHash: networkIntakeDigest(
    NETWORK_INTAKE_SCHEMAS.manifest, withOccurrence) });
}

function exactManifest(record) {
  canonicalizeStrict(record);
  exactObject(record, ["schema", "schemaVersion", "lane", "clientSubmissionId",
    "payloadSchema", "payload", "subject", "source", "consentHash", "retentionDays",
    "createdAt", "useBoundary", "occurrenceIdentityHash", "manifestHash"], "MANIFEST");
  if (record.schema !== NETWORK_INTAKE_SCHEMAS.manifest || record.schemaVersion !== "1.0.0"
    || canonicalizeStrict(record.useBoundary) !== canonicalizeStrict(NETWORK_INTAKE_BOUNDARY)) {
    fail("MANIFEST_STATE_INVALID");
  }
  const selectedLane = lane(record.lane);
  const clientSubmissionId = token(record.clientSubmissionId, "CLIENT_SUBMISSION_ID",
    SUBMISSION_ID);
  const payloadSchema = expectedPayloadSchema(selectedLane, record.payloadSchema);
  const payload = normalizePayloadProjection(record.payload);
  const subject = normalizeSubject(record.subject, selectedLane);
  const source = normalizeSource(record.source);
  const consentHash = hash(record.consentHash, "CONSENT_HASH");
  if (!NumberIsSafeInteger(record.retentionDays) || record.retentionDays < 1
    || record.retentionDays > 3650) fail("RETENTION_DAYS_INVALID");
  const createdAt = canonicalTime(record.createdAt, "MANIFEST_CREATED_AT");
  const body = { schema: NETWORK_INTAKE_SCHEMAS.manifest, schemaVersion: "1.0.0",
    lane: selectedLane, clientSubmissionId, payloadSchema, payload, subject, source,
    consentHash, retentionDays: record.retentionDays, createdAt,
    useBoundary: NETWORK_INTAKE_BOUNDARY };
  const occurrenceIdentityHash = networkIntakeDigest(
    "outsider/network-intake-occurrence/v1", {
      lane: body.lane, clientSubmissionId: body.clientSubmissionId,
      subject: body.subject, sourceManifestHash: body.source.sourceManifestHash,
      payloadSemanticHash: body.payload.payloadSemanticHash, createdAt: body.createdAt,
    });
  if (record.occurrenceIdentityHash !== occurrenceIdentityHash) {
    fail("OCCURRENCE_IDENTITY_HASH_MISMATCH");
  }
  const withOccurrence = { ...body, occurrenceIdentityHash };
  const rebuilt = { ...withOccurrence, manifestHash: networkIntakeDigest(
    NETWORK_INTAKE_SCHEMAS.manifest, withOccurrence) };
  if (canonicalizeStrict(record) !== canonicalizeStrict(rebuilt)) fail("MANIFEST_REPLAY_INVALID");
  return record;
}

function verification(ok, stage, detail = {}) {
  return deepFreeze({ schema: NETWORK_INTAKE_SCHEMAS.verification, ok, stage,
    useBoundary: NETWORK_INTAKE_BOUNDARY, ...detail });
}

function failed(stage, error) {
  return verification(false, stage, { error: error instanceof Error ? error.message
    : "NETWORK_INTAKE_UNKNOWN_FAILURE" });
}

export function verifyNetworkIntakeManifest(record, { payload = undefined,
  expectedManifestHash = null } = {}) {
  try {
    const checked = exactManifest(record);
    if (expectedManifestHash !== null
      && checked.manifestHash !== hash(expectedManifestHash, "EXPECTED_MANIFEST_HASH")) {
      fail("EXPECTED_MANIFEST_HASH_MISMATCH");
    }
    if (payload !== undefined) {
      normalizeAllowlistedPayload(checked.lane, checked.payloadSchema, payload,
        checked.subject);
      const encoded = encodeNetworkIntakePayload(payload);
      if (encoded.payloadByteHash !== checked.payload.payloadByteHash
        || encoded.payloadSemanticHash !== checked.payload.payloadSemanticHash
        || encoded.payloadBytes !== checked.payload.payloadBytes) fail("PAYLOAD_BINDING_MISMATCH");
    }
    return verification(true, "MANIFEST", { manifestHash: checked.manifestHash,
      lane: checked.lane, objectIdentityHash: checked.payload.objectIdentityHash,
      occurrenceIdentityHash: checked.occurrenceIdentityHash });
  } catch (error) { return failed("MANIFEST", error); }
}

export function createNetworkIntakeChallenge({ manifestHash, transportSignerKeyId,
  audience, nonce, issuedAt, expiresAt, serverPrivateKeyPem } = {}) {
  const issued = canonicalTime(issuedAt, "CHALLENGE_ISSUED_AT");
  const expires = canonicalTime(expiresAt, "CHALLENGE_EXPIRES_AT");
  if (DateParse(expires) <= DateParse(issued)
    || DateParse(expires) - DateParse(issued) > 10 * 60_000) fail("CHALLENGE_WINDOW_INVALID");
  const normalizedAudience = boundedAudience(audience);
  const body = {
    schema: NETWORK_INTAKE_SCHEMAS.challenge,
    manifestHash: hash(manifestHash, "CHALLENGE_MANIFEST_HASH"),
    transportSignerKeyId: hash(transportSignerKeyId, "TRANSPORT_SIGNER_KEY_ID"),
    audience: normalizedAudience,
    nonce: token(nonce, "CHALLENGE_NONCE", NONCE),
    issuedAt: issued,
    expiresAt: expires,
    challengeId: networkIntakeDigest("outsider/network-intake-challenge-id/v1", {
      manifestHash, transportSignerKeyId, audience: normalizedAudience, nonce }),
  };
  return addressedSigned(body, NETWORK_INTAKE_SCHEMAS.challenge, "challengeHash",
    serverPrivateKeyPem);
}

const CHALLENGE_FIELDS = ["schema", "manifestHash", "transportSignerKeyId", "audience",
  "nonce", "issuedAt", "expiresAt", "challengeId"];

function exactChallenge(record, serverPublicKeyPem) {
  verifyAddressedSigned(record, CHALLENGE_FIELDS, NETWORK_INTAKE_SCHEMAS.challenge,
    "challengeHash", serverPublicKeyPem);
  if (record.schema !== NETWORK_INTAKE_SCHEMAS.challenge) fail("CHALLENGE_SCHEMA_INVALID");
  hash(record.manifestHash, "CHALLENGE_MANIFEST_HASH");
  hash(record.transportSignerKeyId, "TRANSPORT_SIGNER_KEY_ID");
  boundedAudience(record.audience);
  token(record.nonce, "CHALLENGE_NONCE", NONCE);
  canonicalTime(record.issuedAt, "CHALLENGE_ISSUED_AT");
  canonicalTime(record.expiresAt, "CHALLENGE_EXPIRES_AT");
  if (DateParse(record.expiresAt) <= DateParse(record.issuedAt)
    || DateParse(record.expiresAt) - DateParse(record.issuedAt) > 10 * 60_000) {
    fail("CHALLENGE_WINDOW_INVALID");
  }
  const challengeId = networkIntakeDigest("outsider/network-intake-challenge-id/v1", {
    manifestHash: record.manifestHash,
    transportSignerKeyId: record.transportSignerKeyId,
    audience: record.audience,
    nonce: record.nonce,
  });
  if (record.challengeId !== challengeId) fail("CHALLENGE_ID_MISMATCH");
  return record;
}

export function verifyNetworkIntakeChallenge(record, { serverPublicKeyPem,
  expectedAudience, expectedManifestHash, expectedTransportSignerKeyId, at } = {}) {
  try {
    const checked = exactChallenge(record, serverPublicKeyPem);
    if (checked.audience !== boundedAudience(expectedAudience)
      || checked.manifestHash !== hash(expectedManifestHash, "EXPECTED_MANIFEST_HASH")
      || checked.transportSignerKeyId !== hash(expectedTransportSignerKeyId,
        "EXPECTED_TRANSPORT_SIGNER_KEY_ID")) fail("CHALLENGE_BINDING_MISMATCH");
    const when = DateParse(canonicalTime(at, "CHALLENGE_VERIFY_AT"));
    if (when < DateParse(checked.issuedAt) || when >= DateParse(checked.expiresAt)) {
      fail("CHALLENGE_EXPIRED_OR_NOT_YET_VALID");
    }
    return verification(true, "CHALLENGE", { challengeHash: checked.challengeHash });
  } catch (error) { return failed("CHALLENGE", error); }
}

export function createNetworkIntakeReservation({ manifest, challenge, transportPrivateKeyPem,
  serverPublicKeyPem, expectedAudience, reservedAt, expiresAt } = {}) {
  exactManifest(manifest);
  const transportPublicKeyPem = publicKeyPemFromPrivate(transportPrivateKeyPem);
  const transportSignerKeyId = keyId(transportPublicKeyPem);
  rejectTransportIdentityRoleCollapse(manifest, transportSignerKeyId);
  const at = canonicalTime(reservedAt, "RESERVED_AT");
  const checkedChallenge = verifyNetworkIntakeChallenge(challenge, { serverPublicKeyPem,
    expectedAudience, expectedManifestHash: manifest.manifestHash,
    expectedTransportSignerKeyId: transportSignerKeyId, at });
  if (!checkedChallenge.ok) fail("CHALLENGE_INVALID_FOR_RESERVATION");
  const expiry = canonicalTime(expiresAt, "RESERVATION_EXPIRES_AT");
  if (DateParse(expiry) <= DateParse(at)
    || DateParse(expiry) - DateParse(at) > 60 * 60_000
    || DateParse(expiry) > DateParse(challenge.expiresAt)) {
    fail("RESERVATION_WINDOW_INVALID");
  }
  const body = { schema: NETWORK_INTAKE_SCHEMAS.reservation,
    manifest, challengeHash: challenge.challengeHash, transportSignerKeyId,
    reservedAt: at, expiresAt: expiry };
  return addressedSigned(body, NETWORK_INTAKE_SCHEMAS.reservation, "reservationHash",
    transportPrivateKeyPem);
}

const RESERVATION_FIELDS = ["schema", "manifest", "challengeHash",
  "transportSignerKeyId", "reservedAt", "expiresAt"];

function exactReservation(record, options) {
  verifyAddressedSigned(record, RESERVATION_FIELDS, NETWORK_INTAKE_SCHEMAS.reservation,
    "reservationHash");
  if (record.schema !== NETWORK_INTAKE_SCHEMAS.reservation
    || record.transportSignerKeyId !== record.signature.keyId) fail("RESERVATION_STATE_INVALID");
  exactManifest(record.manifest);
  rejectTransportIdentityRoleCollapse(record.manifest, record.transportSignerKeyId);
  if (record.challengeHash !== options.challenge.challengeHash) {
    fail("RESERVATION_CHALLENGE_HASH_MISMATCH");
  }
  const checkedChallenge = verifyNetworkIntakeChallenge(options.challenge, {
    serverPublicKeyPem: options.serverPublicKeyPem,
    expectedAudience: options.expectedAudience,
    expectedManifestHash: record.manifest.manifestHash,
    expectedTransportSignerKeyId: record.transportSignerKeyId,
    at: record.reservedAt,
  });
  if (!checkedChallenge.ok) fail("RESERVATION_CHALLENGE_INVALID");
  canonicalTime(record.reservedAt, "RESERVED_AT");
  canonicalTime(record.expiresAt, "RESERVATION_EXPIRES_AT");
  if (DateParse(record.expiresAt) <= DateParse(record.reservedAt)
    || DateParse(record.expiresAt) - DateParse(record.reservedAt) > 60 * 60_000
    || DateParse(record.expiresAt) > DateParse(options.challenge.expiresAt)) {
    fail("RESERVATION_WINDOW_INVALID");
  }
  return record;
}

export function verifyNetworkIntakeReservation(record, options = {}) {
  try {
    const checked = exactReservation(record, options);
    if (options.expectedReservationHash != null
      && checked.reservationHash !== hash(options.expectedReservationHash,
        "EXPECTED_RESERVATION_HASH")) fail("EXPECTED_RESERVATION_HASH_MISMATCH");
    return verification(true, "RESERVATION", {
      reservationHash: checked.reservationHash,
      manifestHash: checked.manifest.manifestHash,
      lane: checked.manifest.lane,
      transportSignerKeyId: checked.transportSignerKeyId,
      objectIdentityHash: checked.manifest.payload.objectIdentityHash,
      occurrenceIdentityHash: checked.manifest.occurrenceIdentityHash,
    });
  } catch (error) { return failed("RESERVATION", error); }
}

export function createNetworkIntakePayloadEnvelope({ reservation, challenge,
  payload, transportPrivateKeyPem, serverPublicKeyPem, expectedAudience, createdAt } = {}) {
  const checkedReservation = verifyNetworkIntakeReservation(reservation, { challenge,
    serverPublicKeyPem, expectedAudience });
  if (!checkedReservation.ok) fail("RESERVATION_INVALID_FOR_PAYLOAD");
  const transportPublicKeyPem = publicKeyPemFromPrivate(transportPrivateKeyPem);
  if (keyId(transportPublicKeyPem) !== reservation.transportSignerKeyId) {
    fail("PAYLOAD_TRANSPORT_SIGNER_MISMATCH");
  }
  normalizeAllowlistedPayload(reservation.manifest.lane,
    reservation.manifest.payloadSchema, payload, reservation.manifest.subject);
  const encoded = encodeNetworkIntakePayload(payload);
  const manifest = reservation.manifest;
  if (encoded.payloadByteHash !== manifest.payload.payloadByteHash
    || encoded.payloadSemanticHash !== manifest.payload.payloadSemanticHash
    || encoded.payloadBytes !== manifest.payload.payloadBytes) fail("PAYLOAD_BINDING_MISMATCH");
  const at = canonicalTime(createdAt, "PAYLOAD_CREATED_AT");
  if (DateParse(at) < DateParse(reservation.reservedAt)
    || DateParse(at) >= DateParse(reservation.expiresAt)) fail("PAYLOAD_OUTSIDE_RESERVATION");
  const body = { schema: NETWORK_INTAKE_SCHEMAS.payloadEnvelope,
    reservationHash: reservation.reservationHash, manifestHash: manifest.manifestHash,
    objectIdentityHash: manifest.payload.objectIdentityHash,
    occurrenceIdentityHash: manifest.occurrenceIdentityHash,
    transportSignerKeyId: reservation.transportSignerKeyId,
    createdAt: at, payload: canonicalClone(payload), useBoundary: NETWORK_INTAKE_BOUNDARY };
  return addressedSigned(body, NETWORK_INTAKE_SCHEMAS.payloadEnvelope,
    "payloadEnvelopeHash", transportPrivateKeyPem);
}

const ENVELOPE_FIELDS = ["schema", "reservationHash", "manifestHash",
  "objectIdentityHash", "occurrenceIdentityHash", "transportSignerKeyId", "createdAt",
  "payload", "useBoundary"];

export function verifyNetworkIntakePayloadTransportProof(record, {
  expectedReservationHash, expectedTransportSignerKeyId, expectedPublicKeyPem,
} = {}) {
  try {
    verifyAddressedSigned(record, ENVELOPE_FIELDS, NETWORK_INTAKE_SCHEMAS.payloadEnvelope,
      "payloadEnvelopeHash", expectedPublicKeyPem);
    if (record.schema !== NETWORK_INTAKE_SCHEMAS.payloadEnvelope
      || record.reservationHash !== hash(expectedReservationHash, "EXPECTED_RESERVATION_HASH")
      || record.transportSignerKeyId !== hash(expectedTransportSignerKeyId,
        "EXPECTED_TRANSPORT_SIGNER_KEY_ID")
      || record.signature.keyId !== record.transportSignerKeyId) {
      fail("PAYLOAD_TRANSPORT_PROOF_BINDING_MISMATCH");
    }
    return verification(true, "PAYLOAD_TRANSPORT_PROOF", {
      transportProofVerified: true,
      reservationHash: record.reservationHash,
      transportSignerKeyId: record.transportSignerKeyId,
      payloadEnvelopeHash: record.payloadEnvelopeHash,
    });
  } catch (error) { return failed("PAYLOAD_TRANSPORT_PROOF", error); }
}

function exactPayloadEnvelope(record, options) {
  verifyAddressedSigned(record, ENVELOPE_FIELDS, NETWORK_INTAKE_SCHEMAS.payloadEnvelope,
    "payloadEnvelopeHash");
  if (record.schema !== NETWORK_INTAKE_SCHEMAS.payloadEnvelope
    || record.transportSignerKeyId !== record.signature.keyId
    || canonicalizeStrict(record.useBoundary) !== canonicalizeStrict(NETWORK_INTAKE_BOUNDARY)) {
    fail("PAYLOAD_ENVELOPE_STATE_INVALID");
  }
  const reservationCheck = verifyNetworkIntakeReservation(options.reservation, {
    challenge: options.challenge, serverPublicKeyPem: options.serverPublicKeyPem,
    expectedAudience: options.expectedAudience });
  if (!reservationCheck.ok) fail("PAYLOAD_RESERVATION_INVALID");
  const reservation = options.reservation;
  const manifest = reservation.manifest;
  if (record.reservationHash !== reservation.reservationHash
    || record.manifestHash !== manifest.manifestHash
    || record.objectIdentityHash !== manifest.payload.objectIdentityHash
    || record.occurrenceIdentityHash !== manifest.occurrenceIdentityHash
    || record.transportSignerKeyId !== reservation.transportSignerKeyId) {
    fail("PAYLOAD_ENVELOPE_BINDING_MISMATCH");
  }
  normalizeAllowlistedPayload(manifest.lane, manifest.payloadSchema, record.payload,
    manifest.subject);
  const encoded = encodeNetworkIntakePayload(record.payload);
  if (encoded.payloadByteHash !== manifest.payload.payloadByteHash
    || encoded.payloadSemanticHash !== manifest.payload.payloadSemanticHash
    || encoded.payloadBytes !== manifest.payload.payloadBytes) fail("PAYLOAD_BINDING_MISMATCH");
  const at = DateParse(canonicalTime(record.createdAt, "PAYLOAD_CREATED_AT"));
  if (at < DateParse(reservation.reservedAt) || at >= DateParse(reservation.expiresAt)) {
    fail("PAYLOAD_OUTSIDE_RESERVATION");
  }
  return record;
}

export function verifyNetworkIntakePayloadEnvelope(record, options = {}) {
  try {
    const checked = exactPayloadEnvelope(record, options);
    return verification(true, "PAYLOAD_ENVELOPE", {
      payloadEnvelopeHash: checked.payloadEnvelopeHash,
      reservationHash: checked.reservationHash,
      manifestHash: checked.manifestHash,
      objectIdentityHash: checked.objectIdentityHash,
      occurrenceIdentityHash: checked.occurrenceIdentityHash,
    });
  } catch (error) { return failed("PAYLOAD_ENVELOPE", error); }
}

export function createNetworkIntakeReceipt({ reservation, payloadEnvelope, challenge,
  serverPublicKeyPem, expectedAudience, registryId, eventOrdinal, eventHash,
  objectAlreadyPresent, receivedAt, retentionUntil, serverPrivateKeyPem } = {}) {
  const checked = verifyNetworkIntakePayloadEnvelope(payloadEnvelope, { reservation, challenge,
    serverPublicKeyPem, expectedAudience });
  if (!checked.ok) fail("PAYLOAD_INVALID_FOR_RECEIPT");
  const received = canonicalTime(receivedAt, "RECEIVED_AT");
  const retention = canonicalTime(retentionUntil, "RETENTION_UNTIL");
  if (DateParse(received) < DateParse(payloadEnvelope.createdAt)
    || DateParse(received) >= DateParse(reservation.expiresAt)
    || DateParse(retention) <= DateParse(received)
    || DateParse(retention) > DateParse(received)
      + reservation.manifest.retentionDays * DAY_MS) fail("RECEIPT_TIME_INVALID");
  if (!NumberIsSafeInteger(eventOrdinal) || eventOrdinal < 1) fail("EVENT_ORDINAL_INVALID");
  if (typeof objectAlreadyPresent !== "boolean") fail("OBJECT_ALREADY_PRESENT_INVALID");
  const manifest = reservation.manifest;
  const body = { schema: NETWORK_INTAKE_SCHEMAS.receipt,
    registryId: token(registryId, "REGISTRY_ID"),
    reservationHash: reservation.reservationHash, manifestHash: manifest.manifestHash,
    payloadEnvelopeHash: payloadEnvelope.payloadEnvelopeHash,
    lane: manifest.lane, objectIdentityHash: manifest.payload.objectIdentityHash,
    occurrenceIdentityHash: manifest.occurrenceIdentityHash,
    transportSignerKeyId: reservation.transportSignerKeyId,
    eventOrdinal, eventHash: hash(eventHash, "EVENT_HASH"),
    objectAlreadyPresent, occurrenceRecorded: true,
    receivedAt: received, retentionUntil: retention,
    networkDenominatorIncremented: true,
    scientificCensusCompletenessEstablished: false,
    disposition: "QUARANTINED", useBoundary: NETWORK_INTAKE_BOUNDARY };
  return addressedSigned(body, NETWORK_INTAKE_SCHEMAS.receipt, "receiptHash",
    serverPrivateKeyPem);
}

const RECEIPT_FIELDS = ["schema", "registryId", "reservationHash", "manifestHash",
  "payloadEnvelopeHash", "lane", "objectIdentityHash", "occurrenceIdentityHash",
  "transportSignerKeyId",
  "eventOrdinal", "eventHash", "objectAlreadyPresent", "occurrenceRecorded", "receivedAt",
  "retentionUntil", "networkDenominatorIncremented",
  "scientificCensusCompletenessEstablished", "disposition", "useBoundary"];

export function verifyNetworkIntakeReceipt(record, { serverPublicKeyPem,
  challengeServerPublicKeyPem = serverPublicKeyPem,
  receiptServerPublicKeyPem = serverPublicKeyPem,
  reservation, payloadEnvelope, challenge, expectedAudience } = {}) {
  try {
    verifyAddressedSigned(record, RECEIPT_FIELDS, NETWORK_INTAKE_SCHEMAS.receipt,
      "receiptHash", receiptServerPublicKeyPem);
    const envelopeCheck = verifyNetworkIntakePayloadEnvelope(payloadEnvelope, { reservation,
      challenge, serverPublicKeyPem: challengeServerPublicKeyPem, expectedAudience });
    if (!envelopeCheck.ok) fail("RECEIPT_PAYLOAD_ENVELOPE_INVALID");
    const manifest = reservation.manifest;
    if (record.schema !== NETWORK_INTAKE_SCHEMAS.receipt
      || record.reservationHash !== reservation.reservationHash
      || record.manifestHash !== manifest.manifestHash || record.lane !== manifest.lane
      || record.payloadEnvelopeHash !== payloadEnvelope.payloadEnvelopeHash
      || record.objectIdentityHash !== manifest.payload.objectIdentityHash
      || record.occurrenceIdentityHash !== manifest.occurrenceIdentityHash
      || record.transportSignerKeyId !== reservation.transportSignerKeyId
      || !NumberIsSafeInteger(record.eventOrdinal) || record.eventOrdinal < 1
      || !RegExpTest(HASH, record.eventHash) || typeof record.objectAlreadyPresent !== "boolean"
      || record.occurrenceRecorded !== true || record.networkDenominatorIncremented !== true
      || record.scientificCensusCompletenessEstablished !== false
      || record.disposition !== "QUARANTINED"
      || canonicalizeStrict(record.useBoundary) !== canonicalizeStrict(NETWORK_INTAKE_BOUNDARY)) {
      fail("RECEIPT_STATE_OR_BINDING_INVALID");
    }
    canonicalTime(record.receivedAt, "RECEIVED_AT");
    canonicalTime(record.retentionUntil, "RETENTION_UNTIL");
    if (DateParse(record.receivedAt) < DateParse(payloadEnvelope.createdAt)
      || DateParse(record.receivedAt) >= DateParse(reservation.expiresAt)
      || DateParse(record.retentionUntil) <= DateParse(record.receivedAt)
      || DateParse(record.retentionUntil) > DateParse(record.receivedAt)
        + reservation.manifest.retentionDays * DAY_MS) {
      fail("RECEIPT_TIME_INVALID");
    }
    return verification(true, "RECEIPT", { receiptHash: record.receiptHash,
      reservationHash: record.reservationHash, manifestHash: record.manifestHash,
      eventHash: record.eventHash });
  } catch (error) { return failed("RECEIPT", error); }
}

const REVOCATION_SCOPE = "EXACT_RESERVATION_TRANSPORT_WITHDRAWAL";
const REVOCATION_REASON = "TRANSPORT_SUBMISSION_WITHDRAWN";
const TRANSPORT_SIGNER_ROLE = "TRANSPORT_POSSESSION_ONLY";
const REVOCATION_ACK_MAX_REQUEST_DELTA_MS = 300_000;

const REVOCATION_FIELDS = ["schema", "audience", "registryId", "reservationHash",
  "manifestHash", "lane", "clientSubmissionId", "consentHash", "transportSignerKeyId",
  "requestedAt", "scope", "reasonCode", "transportSignerRole", "useBoundary"];

function exactSelfSignedReservation(record, expectedTransportPublicKeyPem = null) {
  verifyAddressedSigned(record, RESERVATION_FIELDS, NETWORK_INTAKE_SCHEMAS.reservation,
    "reservationHash", expectedTransportPublicKeyPem);
  if (record.schema !== NETWORK_INTAKE_SCHEMAS.reservation
    || record.transportSignerKeyId !== record.signature.keyId) {
    fail("REVOCATION_RESERVATION_STATE_INVALID");
  }
  exactManifest(record.manifest);
  rejectTransportIdentityRoleCollapse(record.manifest, record.transportSignerKeyId);
  canonicalTime(record.reservedAt, "RESERVED_AT");
  canonicalTime(record.expiresAt, "RESERVATION_EXPIRES_AT");
  if (DateParse(record.expiresAt) <= DateParse(record.reservedAt)) {
    fail("REVOCATION_RESERVATION_WINDOW_INVALID");
  }
  return record;
}

function exactRevocation(record, { reservation, expectedAudience, expectedRegistryId,
  expectedTransportPublicKeyPem = null, at, maximumFutureSkewMs = 300_000 } = {}) {
  const checkedReservation = exactSelfSignedReservation(reservation,
    expectedTransportPublicKeyPem);
  verifyAddressedSigned(record, REVOCATION_FIELDS, NETWORK_INTAKE_SCHEMAS.revocation,
    "revocationHash", expectedTransportPublicKeyPem);
  if (!NumberIsSafeInteger(maximumFutureSkewMs) || maximumFutureSkewMs < 0
    || maximumFutureSkewMs > 600_000) fail("REVOCATION_FUTURE_SKEW_INVALID");
  const audience = boundedAudience(record.audience);
  const expectedNormalizedAudience = boundedAudience(expectedAudience);
  const registryId = token(record.registryId, "REVOCATION_REGISTRY_ID");
  const expectedRegistry = token(expectedRegistryId, "EXPECTED_REVOCATION_REGISTRY_ID");
  const requestedAt = canonicalTime(record.requestedAt, "REVOCATION_REQUESTED_AT");
  const checkedAt = canonicalTime(at, "REVOCATION_VERIFY_AT");
  const manifest = checkedReservation.manifest;
  if (record.schema !== NETWORK_INTAKE_SCHEMAS.revocation
    || audience !== expectedNormalizedAudience || registryId !== expectedRegistry
    || record.reservationHash !== checkedReservation.reservationHash
    || record.manifestHash !== manifest.manifestHash || record.lane !== manifest.lane
    || record.clientSubmissionId !== manifest.clientSubmissionId
    || record.consentHash !== manifest.consentHash
    || record.transportSignerKeyId !== checkedReservation.transportSignerKeyId
    || record.transportSignerKeyId !== record.signature.keyId
    || record.scope !== REVOCATION_SCOPE || record.reasonCode !== REVOCATION_REASON
    || record.transportSignerRole !== TRANSPORT_SIGNER_ROLE
    || canonicalizeStrict(record.useBoundary) !== canonicalizeStrict(NETWORK_INTAKE_BOUNDARY)
    || DateParse(requestedAt) < DateParse(checkedReservation.reservedAt)
    || DateParse(requestedAt) > DateParse(checkedAt) + maximumFutureSkewMs) {
    fail("REVOCATION_STATE_OR_BINDING_INVALID");
  }
  return record;
}

export function createNetworkIntakeRevocation({ reservation, audience, registryId,
  requestedAt, transportPrivateKeyPem } = {}) {
  const transportPublicKeyPem = publicKeyPemFromPrivate(transportPrivateKeyPem);
  const checkedReservation = exactSelfSignedReservation(reservation, transportPublicKeyPem);
  const manifest = checkedReservation.manifest;
  const body = { schema: NETWORK_INTAKE_SCHEMAS.revocation,
    audience: boundedAudience(audience),
    registryId: token(registryId, "REVOCATION_REGISTRY_ID"),
    reservationHash: checkedReservation.reservationHash,
    manifestHash: manifest.manifestHash, lane: manifest.lane,
    clientSubmissionId: manifest.clientSubmissionId, consentHash: manifest.consentHash,
    transportSignerKeyId: checkedReservation.transportSignerKeyId,
    requestedAt: canonicalTime(requestedAt, "REVOCATION_REQUESTED_AT"),
    scope: REVOCATION_SCOPE, reasonCode: REVOCATION_REASON,
    transportSignerRole: TRANSPORT_SIGNER_ROLE, useBoundary: NETWORK_INTAKE_BOUNDARY };
  if (body.transportSignerKeyId !== keyId(transportPublicKeyPem)
    || DateParse(body.requestedAt) < DateParse(checkedReservation.reservedAt)) {
    fail("REVOCATION_TRANSPORT_SIGNER_MISMATCH");
  }
  return addressedSigned(body, NETWORK_INTAKE_SCHEMAS.revocation, "revocationHash",
    transportPrivateKeyPem);
}

export function verifyNetworkIntakeRevocation(record, options = {}) {
  try {
    const checked = exactRevocation(record, options);
    return verification(true, "REVOCATION", { revocationHash: checked.revocationHash,
      reservationHash: checked.reservationHash, manifestHash: checked.manifestHash,
      transportSignerKeyId: checked.transportSignerKeyId,
      scope: checked.scope, reasonCode: checked.reasonCode });
  } catch (error) { return failed("REVOCATION", error); }
}

const REVOCATION_ACKNOWLEDGMENT_FIELDS = ["schema", "registryId", "audience",
  "revocationHash", "reservationHash", "manifestHash", "lane", "clientSubmissionId",
  "consentHash", "transportSignerKeyId", "scope", "reasonCode", "priorStatus",
  "processedAt", "revokedEventOrdinal", "revokedEventHash", "occurrenceExisted",
  "revokedOccurrencePayloadAccessible", "objectPayloadRemoved",
  "sharedObjectPayloadRetained", "futureSettlementBlocked",
  "networkDenominatorDecremented", "historicalOccurrenceRemoved", "transportSignerRole",
  "disposition", "useBoundary"];

function revocationOutcomeBooleans(priorStatus, occurrenceExisted, objectPayloadRemoved,
  sharedObjectPayloadRetained) {
  if (typeof occurrenceExisted !== "boolean" || typeof objectPayloadRemoved !== "boolean"
    || typeof sharedObjectPayloadRetained !== "boolean") {
    fail("REVOCATION_ACKNOWLEDGMENT_OUTCOME_INVALID");
  }
  if (priorStatus === "OPEN") {
    if (occurrenceExisted || objectPayloadRemoved || sharedObjectPayloadRetained) {
      fail("REVOCATION_ACKNOWLEDGMENT_OPEN_OUTCOME_INVALID");
    }
    return;
  }
  if (priorStatus !== "SETTLED" || !occurrenceExisted
    || objectPayloadRemoved === sharedObjectPayloadRetained) {
    fail("REVOCATION_ACKNOWLEDGMENT_SETTLED_OUTCOME_INVALID");
  }
}

function exactRevocationAcknowledgment(record, { revocation, reservation,
  expectedAudience, expectedRegistryId, receiptServerPublicKeyPem } = {}) {
  verifyAddressedSigned(record, REVOCATION_ACKNOWLEDGMENT_FIELDS,
    NETWORK_INTAKE_SCHEMAS.revocationAcknowledgment, "acknowledgmentHash",
    receiptServerPublicKeyPem);
  const manifest = reservation.manifest;
  if (record.schema !== NETWORK_INTAKE_SCHEMAS.revocationAcknowledgment
    || record.registryId !== token(expectedRegistryId, "EXPECTED_REVOCATION_REGISTRY_ID")
    || boundedAudience(record.audience) !== boundedAudience(expectedAudience)
    || record.revocationHash !== revocation.revocationHash
    || record.reservationHash !== reservation.reservationHash
    || record.manifestHash !== manifest.manifestHash || record.lane !== manifest.lane
    || record.clientSubmissionId !== manifest.clientSubmissionId
    || record.consentHash !== manifest.consentHash
    || record.transportSignerKeyId !== reservation.transportSignerKeyId
    || record.scope !== revocation.scope || record.reasonCode !== revocation.reasonCode
    || record.transportSignerRole !== TRANSPORT_SIGNER_ROLE
    || !NumberIsSafeInteger(record.revokedEventOrdinal) || record.revokedEventOrdinal < 1
    || !RegExpTest(HASH, record.revokedEventHash)
    || record.revokedOccurrencePayloadAccessible !== false
    || record.futureSettlementBlocked !== true
    || record.networkDenominatorDecremented !== false
    || record.historicalOccurrenceRemoved !== false
    || record.disposition !== "QUARANTINED"
    || canonicalizeStrict(record.useBoundary) !== canonicalizeStrict(NETWORK_INTAKE_BOUNDARY)) {
    fail("REVOCATION_ACKNOWLEDGMENT_STATE_OR_BINDING_INVALID");
  }
  const processedAt = canonicalTime(record.processedAt, "REVOCATION_PROCESSED_AT");
  const requestDelta = DateParse(processedAt) - DateParse(revocation.requestedAt);
  if (requestDelta < -REVOCATION_ACK_MAX_REQUEST_DELTA_MS
    || requestDelta > REVOCATION_ACK_MAX_REQUEST_DELTA_MS) {
    fail("REVOCATION_ACKNOWLEDGMENT_TIME_INVALID");
  }
  revocationOutcomeBooleans(record.priorStatus, record.occurrenceExisted,
    record.objectPayloadRemoved, record.sharedObjectPayloadRetained);
  return record;
}

export function createNetworkIntakeRevocationAcknowledgment({ revocation, reservation,
  priorStatus, processedAt, revokedEventOrdinal, revokedEventHash, occurrenceExisted,
  objectPayloadRemoved, sharedObjectPayloadRetained, serverPrivateKeyPem } = {}) {
  const processed = canonicalTime(processedAt, "REVOCATION_PROCESSED_AT");
  const revocationCheck = verifyNetworkIntakeRevocation(revocation, { reservation,
    expectedAudience: revocation?.audience, expectedRegistryId: revocation?.registryId,
    expectedTransportPublicKeyPem: reservation?.signature?.publicKeyPem, at: processed });
  if (!revocationCheck.ok) fail("REVOCATION_INVALID_FOR_ACKNOWLEDGMENT");
  const requestDelta = DateParse(processed) - DateParse(revocation.requestedAt);
  if (requestDelta < -REVOCATION_ACK_MAX_REQUEST_DELTA_MS
    || requestDelta > REVOCATION_ACK_MAX_REQUEST_DELTA_MS) {
    fail("REVOCATION_ACKNOWLEDGMENT_TIME_INVALID");
  }
  revocationOutcomeBooleans(priorStatus, occurrenceExisted, objectPayloadRemoved,
    sharedObjectPayloadRetained);
  const body = { schema: NETWORK_INTAKE_SCHEMAS.revocationAcknowledgment,
    registryId: revocation.registryId, audience: revocation.audience,
    revocationHash: revocation.revocationHash, reservationHash: revocation.reservationHash,
    manifestHash: revocation.manifestHash, lane: revocation.lane,
    clientSubmissionId: revocation.clientSubmissionId, consentHash: revocation.consentHash,
    transportSignerKeyId: revocation.transportSignerKeyId,
    scope: revocation.scope, reasonCode: revocation.reasonCode, priorStatus,
    processedAt: processed, revokedEventOrdinal,
    revokedEventHash: hash(revokedEventHash, "REVOKED_EVENT_HASH"), occurrenceExisted,
    revokedOccurrencePayloadAccessible: false, objectPayloadRemoved,
    sharedObjectPayloadRetained, futureSettlementBlocked: true,
    networkDenominatorDecremented: false, historicalOccurrenceRemoved: false,
    transportSignerRole: TRANSPORT_SIGNER_ROLE, disposition: "QUARANTINED",
    useBoundary: NETWORK_INTAKE_BOUNDARY };
  if (!NumberIsSafeInteger(revokedEventOrdinal) || revokedEventOrdinal < 1) {
    fail("REVOKED_EVENT_ORDINAL_INVALID");
  }
  return addressedSigned(body, NETWORK_INTAKE_SCHEMAS.revocationAcknowledgment,
    "acknowledgmentHash", serverPrivateKeyPem);
}

export function verifyNetworkIntakeRevocationAcknowledgment(record, options = {}) {
  try {
    const checked = exactRevocationAcknowledgment(record, options);
    return verification(true, "REVOCATION_ACKNOWLEDGMENT", {
      acknowledgmentHash: checked.acknowledgmentHash,
      revocationHash: checked.revocationHash, reservationHash: checked.reservationHash,
      revokedEventHash: checked.revokedEventHash, priorStatus: checked.priorStatus,
    });
  } catch (error) { return failed("REVOCATION_ACKNOWLEDGMENT", error); }
}
