/*
 * VERSIONED SOURCE LINEAGE — outsider network lifecycle Rekor anchor v2.
 *
 * Supersedes the frozen v1 predecessor source at
 * src/outsider-network-lifecycle-rekor-anchor.js
 * SHA-256 e1594a7ba04ef4ecb55a0b65ecbfafb764ad959baa93c5d38360a324532b627f.
 * The v1 schemas, lifecycle behavior, and verification decisions are retained
 * byte-for-byte below.  V2 adds only a subject-neutral, strict P-256
 * hashedrekord proposal/response primitive export surface so versioned
 * adapters can reuse the same SET, RFC 6962 inclusion, signed-checkpoint,
 * log-key-epoch, chronology, and canonical-byte verifier without pretending
 * their subject is a network-lifecycle checkpoint.
 */

/*
 * Provider-scoped Rekor v1 anchoring for a digest-only lifecycle head.
 *
 * Request creation is pure: it signs a small statement with a caller-managed
 * P-256 key and emits the official hashedrekord/0.0.1 proposal shape.  Send
 * has no default transport and accepts only an injected fetch implementation.
 * Offline replay requires caller-supplied pins for both the trust-policy hash
 * and the resulting bundle hash.  Because the transport callback, policy, and
 * pins all come from the caller, a successful replay proves cryptographic
 * response consistency under that policy, not network submission or an
 * external anchor.  It also does not prove log non-equivocation, non-omission,
 * independent witnessing, WORM storage, action authority, training
 * eligibility, pricing, guarantees, or settlement.
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
import {
  assertNetworkLifecycleAnchorOutboxRequest,
  assertNetworkLifecycleHeadCheckpoint,
} from "./outsider-network-lifecycle-head-checkpoint.js";

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const BigIntConstructor = BigInt;
const BufferByteLength = Buffer.byteLength;
const BufferConcat = Buffer.concat;
const BufferFrom = Buffer.from;
const BufferPrototype = Buffer.prototype;
const BufferEquals = Function.prototype.call.bind(BufferPrototype.equals);
const BufferSubarray = Function.prototype.call.bind(BufferPrototype.subarray);
const BufferToString = Function.prototype.call.bind(BufferPrototype.toString);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const JSONParse = JSON.parse;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpExec = Function.prototype.call.bind(RegExp.prototype.exec);
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetConstructor = Set;
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const StringEndsWith = Function.prototype.call.bind(String.prototype.endsWith);
const StringIndexOf = Function.prototype.call.bind(String.prototype.indexOf);
const StringSlice = Function.prototype.call.bind(String.prototype.slice);
const StringSplit = Function.prototype.call.bind(String.prototype.split);
const StringTrimEnd = Function.prototype.call.bind(String.prototype.trimEnd);
const TypeErrorConstructor = TypeError;
const URLConstructor = URL;
const URLPrototype = URL.prototype;
const URLHashGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "hash").get);
const URLOriginGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "origin").get);
const URLPasswordGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "password").get);
const URLPathnameGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "pathname").get);
const URLProtocolGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "protocol").get);
const URLSearchGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "search").get);
const URLUsernameGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "username").get);
const ResponseConstructor = Response;
const ResponsePrototype = Response.prototype;
const ResponseHeadersGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(ResponsePrototype, "headers").get);
const ResponseRedirectedGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(ResponsePrototype, "redirected").get);
const ResponseStatusGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(ResponsePrototype, "status").get);
const ResponseText = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(ResponsePrototype, "text").value);
const HeadersPrototype = Headers.prototype;
const HeadersGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(HeadersPrototype, "get").value);

/* Capture crypto object/prototype methods once so later same-realm prototype
   replacement cannot redefine key classification, key export, or hashing. */
const IntrinsicProbePublicKey = createPublicKey({
  key: BufferFrom("3059301306072a8648ce3d020106082a8648ce3d03010703420004"
    + "f40c8127faa8fc69018e57e9dce7cd92146b63061559437f6a0264a27b06c796"
    + "bc240ee4e4566da5ea0634842386679289e657772cc524fe8b7d5539ae0cca0f", "hex"),
  format: "der",
  type: "spki",
});
const IntrinsicPublicKeyPrototype = ObjectGetPrototypeOf(IntrinsicProbePublicKey);
const IntrinsicAsymmetricKeyPrototype = ObjectGetPrototypeOf(
  IntrinsicPublicKeyPrototype);
const KeyObjectAsymmetricKeyType = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(IntrinsicAsymmetricKeyPrototype,
    "asymmetricKeyType").get);
const KeyObjectAsymmetricKeyDetails = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(IntrinsicAsymmetricKeyPrototype,
    "asymmetricKeyDetails").get);
const KeyObjectExport = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(IntrinsicPublicKeyPrototype, "export").value);
const CryptoHashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const CryptoHashUpdate = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(CryptoHashPrototype, "update").value);
const CryptoHashDigest = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(CryptoHashPrototype, "digest").value);

const HASH = /^sha256:[a-f0-9]{64}$/u;
const HEX_32 = /^[a-f0-9]{64}$/u;
const UUID = /^(?:[a-f0-9]{64}|[a-f0-9]{80})$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const CHECKPOINT_SIGNATURE = /^— ([^+\s]+) ([A-Za-z0-9+/]+={0,2})$/u;
const CHECKPOINT_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/u;
const CONTENT_TYPE_JSON = /^application\/json(?:\s*;|$)/iu;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_STATEMENT_BYTES = 128 * 1024;
const MAX_KEY_BYTES = 64 * 1024;
const MAX_CHECKPOINT_BYTES = 128 * 1024;
const MAX_LOG_KEY_EPOCHS = 32;
const MAX_INCLUSION_PATH = 64;

export const NETWORK_LIFECYCLE_REKOR_ANCHOR_V2_LINEAGE = ObjectFreeze({
  schema: "outsider/network-lifecycle-rekor-anchor-source-lineage/v2",
  version: "2.0.0",
  predecessor: {
    path: "src/outsider-network-lifecycle-rekor-anchor.js",
    sha256:
      "e1594a7ba04ef4ecb55a0b65ecbfafb764ad959baa93c5d38360a324532b627f",
    byteLength: 52_389,
    frozenAndRestored: true,
  },
  semanticChange:
    "ADDITIVE_SUBJECT_NEUTRAL_STRICT_P256_HASHEDREKORD_PRIMITIVE_EXPORTS_ONLY",
  existingV1SchemasRetained: true,
  existingLifecycleBehaviorChanged: false,
});

export const NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS = ObjectFreeze({
  statement: "outsider/network-lifecycle-rekor-anchor-statement/v1",
  request: "outsider/network-lifecycle-rekor-anchor-request/v1",
  trustPolicy: "outsider/network-lifecycle-rekor-trust-policy/v1",
  bundle: "outsider/network-lifecycle-rekor-anchor-bundle/v1",
  verification: "outsider/network-lifecycle-rekor-anchor-verification/v1",
});

export const NETWORK_LIFECYCLE_REKOR_ANCHOR_BOUNDARY = deepFreeze({
  anchorClass: "CALLER_POLICY_REKOR_V1_CRYPTO_RESPONSE_HOLD_ONLY",
  digestOnly: true,
  rawEventsIncluded: false,
  rawObjectsIncluded: false,
  rawPayloadsIncluded: false,
  exportPageBytesIncluded: false,
  operatorPrivateKeyCallerManaged: true,
  operatorPrivateKeyPersisted: false,
  sendRequiresInjectedFetch: true,
  defaultFetchAvailable: false,
  injectedTransportCallbackIsNetworkProvenance: false,
  callerSuppliedTrustPolicyIsExternalPinProvenance: false,
  httpsPinnedOriginRequired: true,
  redirectPolicy: "ERROR",
  independentWitnessEstablished: false,
  wormStorageEstablished: false,
  nonOmissionProofEstablished: false,
  nonEquivocationEstablished: false,
  longTermMonitoringEstablished: false,
  releaseTestEvidenceClass: "LOCAL_SELF_GENERATED_CRYPTO_FIXTURE_ONLY",
  publicProviderInteroperabilityObserved: false,
  publicProviderLiveAnchorArtifactEstablished: false,
  publicDeploymentReady: false,
  status: "PARTIAL",
  decision: "HOLD",
  disposition: "QUARANTINED",
  authority: "NONE",
  authorityGrants: 0,
  actionReady: false,
  actionAuthorized: false,
  actionAdmissions: 0,
  executable: false,
  automaticTraining: false,
  productionTrainingAuthorized: false,
  trainingRows: 0,
  causalExperienceUnits: 0,
  pricingAuthorized: false,
  permitsPricing: false,
  guaranteeEstablished: false,
  permitsGuarantee: false,
  settlementAuthorized: false,
  permitsSettlement: false,
});

function fail(code) {
  throw new TypeErrorConstructor(`NETWORK_LIFECYCLE_REKOR_ANCHOR_${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, writable: true, enumerable: true, configurable: true,
  });
  return array;
}

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || typeof value !== "object" || SetHas(seen, value)) return value;
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && ObjectHasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return ObjectFreeze(value);
}

function rejectTree(value, seen = new SetConstructor(), depth = 0) {
  if (value === null || typeof value !== "object") return;
  if (depth > 96) fail("VALUE_TOO_DEEP");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(seen, value)) fail("CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")) fail("ACCESSOR_FORBIDDEN");
    rejectTree(descriptor.value, seen, depth + 1);
  }
  SetDelete(seen, value);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) fail(`${code}_OBJECT_INVALID`);
  const keys = ReflectOwnKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, fields[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function denseArray(value, code, maximum, { nonempty = false } = {}) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum || nonempty && value.length === 0) fail(`${code}_INVALID`);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  if (keys.length !== value.length + 1 || !ObjectHasOwn(descriptors, "length")) {
    fail(`${code}_INVALID`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[StringConstructor(index)];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_INVALID`);
  }
  return value;
}

function clone(value) {
  rejectTree(value);
  let parsed;
  try { parsed = JSONParse(canonicalizeStrict(value)); }
  catch { fail("CANONICAL_DATA_REQUIRED"); }
  rejectTree(parsed);
  return deepFreeze(parsed);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function hex32(value, code) {
  if (typeof value !== "string" || !RegExpTest(HEX_32, value)) fail(`${code}_INVALID`);
  return value;
}

function canonicalTime(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)) {
    fail(`${code}_INVALID`);
  }
  const epoch = DateParse(value);
  if (!NumberIsFinite(epoch)
    || DateToISOString(new DateConstructor(epoch)) !== value) fail(`${code}_INVALID`);
  return value;
}

function observedNow(clock) {
  if (typeof clock !== "function" || isProxy(clock)) fail("INJECTED_CLOCK_REQUIRED");
  let observed;
  try { observed = clock(); } catch { fail("CLOCK_OBSERVATION_FAILED"); }
  if (typeof observed === "string") return canonicalTime(observed, "OBSERVED_AT");
  if (observed === null || typeof observed !== "object" || isProxy(observed)) {
    fail("OBSERVED_AT_INVALID");
  }
  let encoded;
  try { encoded = DateToISOString(observed); } catch { fail("OBSERVED_AT_INVALID"); }
  return canonicalTime(encoded, "OBSERVED_AT");
}

function digestBytes(value) {
  const state = createHash("sha256");
  CryptoHashUpdate(state, value);
  return CryptoHashDigest(state);
}

function digestHex(value) {
  return BufferToString(digestBytes(value), "hex");
}

function byteHash(value) {
  return `sha256:${digestHex(value)}`;
}

function domainDigest(domain, value) {
  const state = createHash("sha256");
  CryptoHashUpdate(state,
    `outsider:network-lifecycle-rekor-anchor:${domain}:v1\0${canonicalizeStrict(value)}`,
    "utf8");
  return `sha256:${CryptoHashDigest(state, "hex")}`;
}

function strictBase64(value, code, { maximumBytes, expectedBytes = null } = {}) {
  if (typeof value !== "string" || value.length === 0 || !RegExpTest(BASE64, value)) {
    fail(`${code}_INVALID`);
  }
  const bytes = BufferFrom(value, "base64");
  if (BufferToString(bytes, "base64") !== value
    || bytes.length > maximumBytes
    || expectedBytes !== null && bytes.length !== expectedBytes) fail(`${code}_INVALID`);
  return bytes;
}

function p256PublicMaterial(publicKeyPem, code) {
  if (typeof publicKeyPem !== "string" || BufferByteLength(publicKeyPem, "utf8") < 1
    || BufferByteLength(publicKeyPem, "utf8") > MAX_KEY_BYTES) fail(`${code}_INVALID`);
  let key;
  try {
    key = createPublicKey({ key: BufferFrom(publicKeyPem, "utf8"), format: "pem" });
  } catch { fail(`${code}_INVALID`); }
  const details = KeyObjectAsymmetricKeyDetails(key);
  if (KeyObjectAsymmetricKeyType(key) !== "ec" || details === null
    || details.namedCurve !== "prime256v1") fail(`${code}_P256_REQUIRED`);
  const normalizedPem = KeyObjectExport(key, { type: "spki", format: "pem" });
  if (typeof normalizedPem !== "string" || normalizedPem !== publicKeyPem) {
    fail(`${code}_CANONICAL_PEM_REQUIRED`);
  }
  const der = KeyObjectExport(key, { type: "spki", format: "der" });
  return { key, der: BufferFrom(der), publicKeyPem: normalizedPem,
    keyId: `sha256:${digestHex(der)}` };
}

function p256PrivateMaterial(privateKeyPem) {
  if (typeof privateKeyPem !== "string" || BufferByteLength(privateKeyPem, "utf8") < 1
    || BufferByteLength(privateKeyPem, "utf8") > MAX_KEY_BYTES) {
    fail("OPERATOR_PRIVATE_KEY_INVALID");
  }
  let privateKey;
  try {
    privateKey = createPrivateKey({
      key: BufferFrom(privateKeyPem, "utf8"), format: "pem",
    });
  }
  catch { fail("OPERATOR_PRIVATE_KEY_INVALID"); }
  const details = KeyObjectAsymmetricKeyDetails(privateKey);
  if (KeyObjectAsymmetricKeyType(privateKey) !== "ec" || details === null
    || details.namedCurve !== "prime256v1") fail("OPERATOR_PRIVATE_KEY_P256_REQUIRED");
  const publicKey = createPublicKey(privateKey);
  const publicKeyPem = KeyObjectExport(publicKey, { type: "spki", format: "pem" });
  const der = KeyObjectExport(publicKey, { type: "spki", format: "der" });
  return { privateKey, publicKey, publicKeyPem, der: BufferFrom(der),
    keyId: `sha256:${digestHex(der)}` };
}

function httpsOrigin(value, code) {
  if (typeof value !== "string") fail(`${code}_REQUIRED`);
  let parsed;
  try { parsed = new URLConstructor(value); } catch { fail(`${code}_INVALID`); }
  const origin = URLOriginGet(parsed);
  if (URLProtocolGet(parsed) !== "https:" || URLUsernameGet(parsed) !== ""
    || URLPasswordGet(parsed) !== "" || URLSearchGet(parsed) !== ""
    || URLHashGet(parsed) !== "" || URLPathnameGet(parsed) !== "/"
    || origin !== value) fail(`${code}_EXACT_HTTPS_ORIGIN_REQUIRED`);
  return origin;
}

function checkpointOrigin(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 512
    || RegExpTest(CHECKPOINT_CONTROL, value) || StringIndexOf(value, "\n") !== -1) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function checkpointSignerName(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 255
    || RegExpTest(/[^A-Za-z0-9._:/-]/u, value)) fail(`${code}_INVALID`);
  return value;
}

function normalizeLogKeyEpoch(value, code) {
  exactObject(value, ["logID", "publicKeyPem", "checkpointOrigin",
    "checkpointSignerName", "validFrom", "validUntil"], code);
  const logID = hex32(value.logID, `${code}_LOG_ID`);
  const material = p256PublicMaterial(value.publicKeyPem, `${code}_PUBLIC_KEY`);
  if (StringSlice(material.keyId, "sha256:".length) !== logID) {
    fail(`${code}_LOG_ID_PUBLIC_KEY_MISMATCH`);
  }
  const validFrom = canonicalTime(value.validFrom, `${code}_VALID_FROM`);
  const validUntil = canonicalTime(value.validUntil, `${code}_VALID_UNTIL`);
  if (DateParse(validFrom) >= DateParse(validUntil)) fail(`${code}_VALIDITY_INVALID`);
  return {
    logID,
    publicKeyPem: material.publicKeyPem,
    checkpointOrigin: checkpointOrigin(value.checkpointOrigin,
      `${code}_CHECKPOINT_ORIGIN`),
    checkpointSignerName: checkpointSignerName(value.checkpointSignerName,
      `${code}_CHECKPOINT_SIGNER_NAME`),
    validFrom,
    validUntil,
  };
}

function trustPolicyBody(input) {
  exactObject(input, ["rekorOrigin", "logKeyEpochs"], "TRUST_POLICY_INPUT");
  const rekorOrigin = httpsOrigin(input.rekorOrigin, "REKOR_ORIGIN");
  denseArray(input.logKeyEpochs, "LOG_KEY_EPOCHS", MAX_LOG_KEY_EPOCHS,
    { nonempty: true });
  const logKeyEpochs = new ArrayConstructor();
  const seenLogIds = new SetConstructor();
  for (let index = 0; index < input.logKeyEpochs.length; index += 1) {
    const epoch = normalizeLogKeyEpoch(input.logKeyEpochs[index],
      `LOG_KEY_EPOCH_${index}`);
    if (SetHas(seenLogIds, epoch.logID)) fail("LOG_KEY_EPOCH_LOG_ID_DUPLICATE");
    SetAdd(seenLogIds, epoch.logID);
    append(logKeyEpochs, epoch);
  }
  return {
    schema: NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS.trustPolicy,
    profile: "SIGSTORE_REKOR_HASHEDREKORD_0.0.1",
    rekorOrigin,
    createEntryPath: "/api/v1/log/entries",
    logKeyEpochs,
    validitySemantics: "VALID_FROM_INCLUSIVE_VALID_UNTIL_EXCLUSIVE",
    externallyPinnedPolicyRequired: true,
    boundary: clone(NETWORK_LIFECYCLE_REKOR_ANCHOR_BOUNDARY),
  };
}

export function createNetworkLifecycleRekorTrustPolicy(input = {}) {
  rejectTree(input);
  const body = trustPolicyBody(input);
  return deepFreeze({ ...body, policyHash: domainDigest("trust-policy", body) });
}

function normalizeTrustPolicy(value) {
  const policy = clone(value);
  exactObject(policy, ["schema", "profile", "rekorOrigin", "createEntryPath",
    "logKeyEpochs", "validitySemantics", "externallyPinnedPolicyRequired",
    "boundary", "policyHash"], "TRUST_POLICY");
  const { policyHash, ...body } = policy;
  if (body.schema !== NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS.trustPolicy
    || body.profile !== "SIGSTORE_REKOR_HASHEDREKORD_0.0.1"
    || body.createEntryPath !== "/api/v1/log/entries"
    || body.validitySemantics !== "VALID_FROM_INCLUSIVE_VALID_UNTIL_EXCLUSIVE"
    || body.externallyPinnedPolicyRequired !== true
    || !same(body.boundary, NETWORK_LIFECYCLE_REKOR_ANCHOR_BOUNDARY)) {
    fail("TRUST_POLICY_STATE_INVALID");
  }
  const rebuilt = trustPolicyBody({
    rekorOrigin: body.rekorOrigin,
    logKeyEpochs: body.logKeyEpochs,
  });
  if (!same(body, rebuilt) || hash(policyHash, "TRUST_POLICY_HASH")
    !== domainDigest("trust-policy", body)) fail("TRUST_POLICY_REPLAY_INVALID");
  return policy;
}

export function assertNetworkLifecycleRekorTrustPolicy(value, options = {}) {
  rejectTree(options);
  exactObject(options, ["expectedTrustPolicyHash"], "TRUST_POLICY_ASSERT_OPTIONS");
  const policy = normalizeTrustPolicy(value);
  const expected = hash(options.expectedTrustPolicyHash, "EXPECTED_TRUST_POLICY_HASH");
  if (policy.policyHash !== expected) fail("EXPECTED_TRUST_POLICY_HASH_MISMATCH");
  return policy;
}

function statementBody(checkpoint, outboxRequest, statementCreatedAt) {
  const createdAt = canonicalTime(statementCreatedAt, "STATEMENT_CREATED_AT");
  if (DateParse(createdAt) < DateParse(checkpoint.createdAt)) {
    fail("STATEMENT_PRECEDES_CHECKPOINT");
  }
  return {
    schema: NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS.statement,
    statementClass: "DIGEST_ONLY_NETWORK_LIFECYCLE_HEAD",
    checkpointHash: checkpoint.checkpointHash,
    anchorOutboxRequestHash: outboxRequest.requestHash,
    subjectDigest: {
      algorithm: "sha256",
      value: outboxRequest.subjectDigest.digestHex,
    },
    statementCreatedAt: createdAt,
    statementCreatedAtIsExternalTimeEvidence: false,
    disclosure: "CHECKPOINT_DIGEST_ONLY_NO_EVENT_OBJECT_PAYLOAD_OR_EXPORT_PAGE_BYTES",
    rawEventsIncluded: false,
    rawObjectsIncluded: false,
    rawPayloadsIncluded: false,
    exportPageBytesIncluded: false,
  };
}

export function createNetworkLifecycleRekorAnchorRequest(input = {}) {
  rejectTree(input);
  exactObject(input, ["checkpoint", "outboxRequest", "statementCreatedAt",
    "operatorPrivateKeyPem"], "REQUEST_CREATE_INPUT");
  const checkpoint = assertNetworkLifecycleHeadCheckpoint(input.checkpoint);
  const outboxRequest = assertNetworkLifecycleAnchorOutboxRequest(input.outboxRequest,
    { checkpoint });
  const unsignedStatement = statementBody(checkpoint, outboxRequest,
    input.statementCreatedAt);
  const statement = deepFreeze({ ...unsignedStatement,
    statementHash: domainDigest("statement", unsignedStatement) });
  const statementBytes = BufferFrom(canonicalizeStrict(statement), "utf8");
  if (statementBytes.length > MAX_STATEMENT_BYTES) fail("STATEMENT_TOO_LARGE");
  const statementDigest = digestHex(statementBytes);
  const material = p256PrivateMaterial(input.operatorPrivateKeyPem);
  let signature;
  try { signature = cryptoSign("sha256", statementBytes, material.privateKey); }
  catch { fail("OPERATOR_SIGNATURE_FAILED"); }
  const signatureBase64 = BufferToString(signature, "base64");
  const operator = {
    algorithm: "ECDSA_P256_SHA256_ASN1_DER",
    keyId: material.keyId,
    publicKeyPem: material.publicKeyPem,
    signatureBase64,
  };
  const proposal = {
    apiVersion: "0.0.1",
    kind: "hashedrekord",
    spec: {
      data: { hash: { algorithm: "sha256", value: statementDigest } },
      signature: {
        content: signatureBase64,
        publicKey: {
          content: BufferToString(BufferFrom(material.publicKeyPem, "utf8"), "base64"),
        },
      },
    },
  };
  const body = {
    schema: NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS.request,
    profile: "SIGSTORE_REKOR_HASHEDREKORD_0.0.1",
    statement,
    statementDigest: { algorithm: "sha256", value: statementDigest },
    operator,
    proposal,
    networkSubmissionPerformed: false,
    operatorPrivateKeyPersisted: false,
    boundary: clone(NETWORK_LIFECYCLE_REKOR_ANCHOR_BOUNDARY),
  };
  return deepFreeze({ ...body, requestHash: domainDigest("request", body) });
}

function normalizeStatement(value, checkpoint, outboxRequest) {
  exactObject(value, ["schema", "statementClass", "checkpointHash",
    "anchorOutboxRequestHash", "subjectDigest", "statementCreatedAt",
    "statementCreatedAtIsExternalTimeEvidence", "disclosure", "rawEventsIncluded",
    "rawObjectsIncluded", "rawPayloadsIncluded", "exportPageBytesIncluded",
    "statementHash"], "STATEMENT");
  exactObject(value.subjectDigest, ["algorithm", "value"], "STATEMENT_SUBJECT_DIGEST");
  const { statementHash, ...body } = value;
  if (body.schema !== NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS.statement
    || body.statementClass !== "DIGEST_ONLY_NETWORK_LIFECYCLE_HEAD"
    || body.checkpointHash !== checkpoint.checkpointHash
    || body.anchorOutboxRequestHash !== outboxRequest.requestHash
    || body.subjectDigest.algorithm !== "sha256"
    || body.subjectDigest.value !== outboxRequest.subjectDigest.digestHex
    || body.statementCreatedAtIsExternalTimeEvidence !== false
    || body.disclosure
      !== "CHECKPOINT_DIGEST_ONLY_NO_EVENT_OBJECT_PAYLOAD_OR_EXPORT_PAGE_BYTES"
    || body.rawEventsIncluded !== false || body.rawObjectsIncluded !== false
    || body.rawPayloadsIncluded !== false || body.exportPageBytesIncluded !== false
    || hash(statementHash, "STATEMENT_HASH") !== domainDigest("statement", body)) {
    fail("STATEMENT_INVALID");
  }
  canonicalTime(body.statementCreatedAt, "STATEMENT_CREATED_AT");
  if (DateParse(body.statementCreatedAt) < DateParse(checkpoint.createdAt)) {
    fail("STATEMENT_PRECEDES_CHECKPOINT");
  }
  return value;
}

function normalizeRequest(value, checkpoint, outboxRequest) {
  const request = clone(value);
  exactObject(request, ["schema", "profile", "statement", "statementDigest",
    "operator", "proposal", "networkSubmissionPerformed",
    "operatorPrivateKeyPersisted", "boundary", "requestHash"], "REQUEST");
  const { requestHash, ...body } = request;
  if (body.schema !== NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS.request
    || body.profile !== "SIGSTORE_REKOR_HASHEDREKORD_0.0.1"
    || body.networkSubmissionPerformed !== false
    || body.operatorPrivateKeyPersisted !== false
    || !same(body.boundary, NETWORK_LIFECYCLE_REKOR_ANCHOR_BOUNDARY)
    || hash(requestHash, "REQUEST_HASH") !== domainDigest("request", body)) {
    fail("REQUEST_STATE_INVALID");
  }
  const statement = normalizeStatement(body.statement, checkpoint, outboxRequest);
  exactObject(body.statementDigest, ["algorithm", "value"], "STATEMENT_DIGEST");
  const statementBytes = BufferFrom(canonicalizeStrict(statement), "utf8");
  if (statementBytes.length > MAX_STATEMENT_BYTES
    || body.statementDigest.algorithm !== "sha256"
    || body.statementDigest.value !== digestHex(statementBytes)) {
    fail("STATEMENT_DIGEST_INVALID");
  }
  exactObject(body.operator, ["algorithm", "keyId", "publicKeyPem",
    "signatureBase64"], "OPERATOR");
  const operatorMaterial = p256PublicMaterial(body.operator.publicKeyPem,
    "OPERATOR_PUBLIC_KEY");
  const signature = strictBase64(body.operator.signatureBase64, "OPERATOR_SIGNATURE",
    { maximumBytes: 256 });
  if (body.operator.algorithm !== "ECDSA_P256_SHA256_ASN1_DER"
    || body.operator.keyId !== operatorMaterial.keyId
    || !cryptoVerify("sha256", statementBytes, operatorMaterial.key, signature)) {
    fail("OPERATOR_SIGNATURE_INVALID");
  }
  exactObject(body.proposal, ["apiVersion", "kind", "spec"], "PROPOSAL");
  exactObject(body.proposal.spec, ["data", "signature"], "PROPOSAL_SPEC");
  exactObject(body.proposal.spec.data, ["hash"], "PROPOSAL_DATA");
  exactObject(body.proposal.spec.data.hash, ["algorithm", "value"],
    "PROPOSAL_DATA_HASH");
  exactObject(body.proposal.spec.signature, ["content", "publicKey"],
    "PROPOSAL_SIGNATURE");
  exactObject(body.proposal.spec.signature.publicKey, ["content"],
    "PROPOSAL_PUBLIC_KEY");
  const proposalPublicKey = strictBase64(
    body.proposal.spec.signature.publicKey.content, "PROPOSAL_PUBLIC_KEY_CONTENT",
    { maximumBytes: MAX_KEY_BYTES });
  if (body.proposal.apiVersion !== "0.0.1" || body.proposal.kind !== "hashedrekord"
    || body.proposal.spec.data.hash.algorithm !== "sha256"
    || body.proposal.spec.data.hash.value !== body.statementDigest.value
    || body.proposal.spec.signature.content !== body.operator.signatureBase64
    || BufferToString(proposalPublicKey, "utf8") !== body.operator.publicKeyPem
    || !BufferEquals(BufferFrom(BufferToString(proposalPublicKey, "utf8"), "utf8"),
      proposalPublicKey)) fail("PROPOSAL_BINDING_INVALID");
  return request;
}

export function assertNetworkLifecycleRekorAnchorRequest(value, options = {}) {
  rejectTree(options);
  exactObject(options, ["checkpoint", "outboxRequest"], "REQUEST_ASSERT_OPTIONS");
  const checkpoint = assertNetworkLifecycleHeadCheckpoint(options.checkpoint);
  const outboxRequest = assertNetworkLifecycleAnchorOutboxRequest(options.outboxRequest,
    { checkpoint });
  return normalizeRequest(value, checkpoint, outboxRequest);
}

function selectLogEpoch(policy, logID, integratedTime) {
  const integratedMillis = integratedTime * 1000;
  if (!NumberIsSafeInteger(integratedMillis)) fail("INTEGRATED_TIME_INVALID");
  let selected = null;
  for (let index = 0; index < policy.logKeyEpochs.length; index += 1) {
    const epoch = policy.logKeyEpochs[index];
    if (epoch.logID === logID && DateParse(epoch.validFrom) <= integratedMillis
      && integratedMillis < DateParse(epoch.validUntil)) {
      if (selected !== null) fail("LOG_KEY_EPOCH_AMBIGUOUS");
      selected = epoch;
    }
  }
  if (selected === null) fail("PINNED_LOG_KEY_EPOCH_NOT_FOUND");
  return selected;
}

function parseCheckpointEnvelope(envelope) {
  if (typeof envelope !== "string" || BufferByteLength(envelope, "utf8") < 1
    || BufferByteLength(envelope, "utf8") > MAX_CHECKPOINT_BYTES
    || !StringEndsWith(envelope, "\n") || RegExpTest(CHECKPOINT_CONTROL, envelope)) {
    fail("CHECKPOINT_ENVELOPE_INVALID");
  }
  const separator = StringIndexOf(envelope, "\n\n");
  if (separator < 0) fail("CHECKPOINT_ENVELOPE_INVALID");
  const noteText = StringSlice(envelope, 0, separator + 1);
  const signatureBlock = StringSlice(envelope, separator + 2);
  const noteLines = StringSplit(StringSlice(noteText, 0, -1), "\n");
  if (noteLines.length < 3) fail("CHECKPOINT_ENVELOPE_INVALID");
  for (let index = 0; index < noteLines.length; index += 1) {
    if (noteLines[index].length === 0) fail("CHECKPOINT_ENVELOPE_INVALID");
  }
  if (!RegExpTest(/^(?:0|[1-9][0-9]*)$/u, noteLines[1])) {
    fail("CHECKPOINT_TREE_SIZE_INVALID");
  }
  const treeSize = BigIntConstructor(noteLines[1]);
  if (treeSize < 1n || treeSize > 0x7fffffffffffffffn) {
    fail("CHECKPOINT_TREE_SIZE_INVALID");
  }
  const root = strictBase64(noteLines[2], "CHECKPOINT_ROOT",
    { maximumBytes: 32, expectedBytes: 32 });
  const trimmed = StringTrimEnd(signatureBlock);
  if (trimmed.length === 0) fail("CHECKPOINT_SIGNATURES_INVALID");
  const signatureLines = StringSplit(trimmed, "\n");
  if (signatureLines.length > 64) fail("CHECKPOINT_SIGNATURES_INVALID");
  const signatures = new ArrayConstructor();
  for (let index = 0; index < signatureLines.length; index += 1) {
    const match = RegExpExec(CHECKPOINT_SIGNATURE, signatureLines[index]);
    if (match === null) fail("CHECKPOINT_SIGNATURE_INVALID");
    append(signatures, { name: match[1], bytes: strictBase64(match[2],
      "CHECKPOINT_SIGNATURE", { maximumBytes: 8192 }) });
  }
  return { noteText, origin: noteLines[0], treeSize, root, signatures };
}

function verifyCheckpointSignature(checkpoint, epoch) {
  if (checkpoint.origin !== epoch.checkpointOrigin) fail("CHECKPOINT_ORIGIN_MISMATCH");
  const material = p256PublicMaterial(epoch.publicKeyPem, "LOG_PUBLIC_KEY");
  const keyId = BufferSubarray(digestBytes(material.der), 0, 4);
  let verified = false;
  for (let index = 0; index < checkpoint.signatures.length; index += 1) {
    const signature = checkpoint.signatures[index];
    if (signature.name !== epoch.checkpointSignerName || signature.bytes.length <= 4
      || !BufferEquals(BufferSubarray(signature.bytes, 0, 4), keyId)) continue;
    if (!cryptoVerify("sha256", BufferFrom(checkpoint.noteText, "utf8"), material.key,
      BufferSubarray(signature.bytes, 4))) fail("CHECKPOINT_SIGNATURE_INVALID");
    verified = true;
  }
  if (!verified) fail("PINNED_CHECKPOINT_SIGNATURE_NOT_FOUND");
}

function verifyMerkleInclusion(bodyBytes, proof) {
  if (!NumberIsSafeInteger(proof.logIndex) || proof.logIndex < 0
    || !NumberIsSafeInteger(proof.treeSize) || proof.treeSize < 1
    || proof.logIndex >= proof.treeSize) fail("INCLUSION_POSITION_INVALID");
  denseArray(proof.hashes, "INCLUSION_HASHES", MAX_INCLUSION_PATH);
  let node = digestBytes(BufferConcat([BufferFrom([0x00]), bodyBytes]));
  let fn = BigIntConstructor(proof.logIndex);
  let sn = BigIntConstructor(proof.treeSize - 1);
  for (let index = 0; index < proof.hashes.length; index += 1) {
    if (sn === 0n) fail("INCLUSION_PATH_TOO_LONG");
    const sibling = BufferFrom(hex32(proof.hashes[index],
      `INCLUSION_HASH_${index}`), "hex");
    if ((fn & 1n) === 1n || fn === sn) {
      node = digestBytes(BufferConcat([BufferFrom([0x01]), sibling, node]));
      while (fn !== 0n && (fn & 1n) === 0n) {
        fn >>= 1n;
        sn >>= 1n;
      }
    } else {
      node = digestBytes(BufferConcat([BufferFrom([0x01]), node, sibling]));
    }
    fn >>= 1n;
    sn >>= 1n;
  }
  const expectedRoot = BufferFrom(hex32(proof.rootHash, "INCLUSION_ROOT_HASH"), "hex");
  if (sn !== 0n || !BufferEquals(node, expectedRoot)) fail("INCLUSION_PROOF_INVALID");
  return { leafHash: digestHex(BufferConcat([BufferFrom([0x00]), bodyBytes])),
    root: expectedRoot };
}

function parseResponseText(responseText) {
  if (typeof responseText !== "string" || BufferByteLength(responseText, "utf8") < 2
    || BufferByteLength(responseText, "utf8") > MAX_RESPONSE_BYTES) {
    fail("REKOR_RESPONSE_SIZE_INVALID");
  }
  let parsed;
  try { parsed = JSONParse(responseText); } catch { fail("REKOR_RESPONSE_JSON_INVALID"); }
  rejectTree(parsed);
  canonicalizeStrict(parsed);
  return parsed;
}

function verifyRekorResponse(responseText, request, policy, observedAt) {
  const observed = canonicalTime(observedAt, "OBSERVED_AT");
  const response = parseResponseText(responseText);
  if (response === null || typeof response !== "object" || ArrayIsArray(response)
    || ObjectGetPrototypeOf(response) !== ObjectPrototype) fail("REKOR_RESPONSE_INVALID");
  const responseKeys = ReflectOwnKeys(response);
  if (responseKeys.length !== 1 || typeof responseKeys[0] !== "string") {
    fail("REKOR_RESPONSE_ONE_ENTRY_REQUIRED");
  }
  const uuid = responseKeys[0];
  if (!RegExpTest(UUID, uuid)) fail("ENTRY_UUID_INVALID");
  const entryDescriptor = ObjectGetOwnPropertyDescriptor(response, uuid);
  if (!entryDescriptor || !ObjectHasOwn(entryDescriptor, "value")
    || entryDescriptor.enumerable !== true) fail("REKOR_RESPONSE_INVALID");
  const entry = entryDescriptor.value;
  exactObject(entry, ["body", "integratedTime", "logID", "logIndex", "verification"],
    "REKOR_ENTRY");
  exactObject(entry.verification, ["inclusionProof", "signedEntryTimestamp"],
    "REKOR_VERIFICATION");
  exactObject(entry.verification.inclusionProof,
    ["checkpoint", "hashes", "logIndex", "rootHash", "treeSize"],
    "REKOR_INCLUSION_PROOF");
  if (!NumberIsSafeInteger(entry.integratedTime) || entry.integratedTime < 1
    || !NumberIsSafeInteger(entry.logIndex) || entry.logIndex < 0
    || entry.verification.inclusionProof.logIndex !== entry.logIndex) {
    fail("REKOR_ENTRY_POSITION_OR_TIME_INVALID");
  }
  const logID = hex32(entry.logID, "REKOR_LOG_ID");
  const integratedMillis = entry.integratedTime * 1000;
  if (!NumberIsSafeInteger(integratedMillis)
    || integratedMillis < DateParse(request.statement.statementCreatedAt)
    || integratedMillis > DateParse(observed)) fail("INTEGRATED_TIME_CHRONOLOGY_INVALID");
  const epoch = selectLogEpoch(policy, logID, entry.integratedTime);
  const bodyBytes = strictBase64(entry.body, "REKOR_BODY",
    { maximumBytes: MAX_STATEMENT_BYTES + MAX_KEY_BYTES });
  const bodyText = BufferToString(bodyBytes, "utf8");
  if (!BufferEquals(BufferFrom(bodyText, "utf8"), bodyBytes)) fail("REKOR_BODY_UTF8_INVALID");
  let storedProposal;
  try { storedProposal = JSONParse(bodyText); } catch { fail("REKOR_BODY_JSON_INVALID"); }
  rejectTree(storedProposal);
  if (canonicalizeStrict(storedProposal) !== bodyText
    || !same(storedProposal, request.proposal)) fail("REKOR_BODY_BINDING_INVALID");
  const inclusion = verifyMerkleInclusion(bodyBytes, entry.verification.inclusionProof);
  if (!StringEndsWith(uuid, inclusion.leafHash)) fail("ENTRY_UUID_LEAF_SUFFIX_MISMATCH");
  const checkpoint = parseCheckpointEnvelope(entry.verification.inclusionProof.checkpoint);
  if (checkpoint.treeSize !== BigIntConstructor(entry.verification.inclusionProof.treeSize)
    || !BufferEquals(checkpoint.root, inclusion.root)) {
    fail("CHECKPOINT_INCLUSION_ROOT_MISMATCH");
  }
  verifyCheckpointSignature(checkpoint, epoch);
  const setPayload = {
    body: entry.body,
    integratedTime: entry.integratedTime,
    logID: entry.logID,
    logIndex: entry.logIndex,
  };
  const setSignature = strictBase64(entry.verification.signedEntryTimestamp,
    "SIGNED_ENTRY_TIMESTAMP", { maximumBytes: 8192 });
  const logMaterial = p256PublicMaterial(epoch.publicKeyPem, "LOG_PUBLIC_KEY");
  if (!cryptoVerify("sha256", BufferFrom(canonicalizeStrict(setPayload), "utf8"),
    logMaterial.key, setSignature)) fail("SIGNED_ENTRY_TIMESTAMP_INVALID");
  return {
    entryUUID: uuid,
    logID,
    logIndex: entry.logIndex,
    integratedTime: entry.integratedTime,
    inclusionRootHash: entry.verification.inclusionProof.rootHash,
    inclusionTreeSize: entry.verification.inclusionProof.treeSize,
  };
}

function bundleBody({ request, policy, responseText, observedAt, facts }) {
  const responseBytes = BufferFrom(responseText, "utf8");
  return {
    schema: NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS.bundle,
    bundleClass: "OFFLINE_REPLAYABLE_CALLER_POLICY_REKOR_V1_CRYPTO_RESPONSE_HOLD_ONLY",
    request: clone(request),
    trustPolicyHash: policy.policyHash,
    rekorOrigin: policy.rekorOrigin,
    createEntryUrl: `${policy.rekorOrigin}${policy.createEntryPath}`,
    receivedAtLocallyObserved: observedAt,
    receivedAtIsExternalTimeEvidence: false,
    response: {
      httpStatus: 201,
      mediaType: "application/json",
      utf8Base64: BufferToString(responseBytes, "base64"),
      byteLength: responseBytes.length,
      responseHash: byteHash(responseBytes),
    },
    entryUUID: facts.entryUUID,
    logID: facts.logID,
    logIndex: facts.logIndex,
    integratedTime: facts.integratedTime,
    inclusionRootHash: facts.inclusionRootHash,
    inclusionTreeSize: facts.inclusionTreeSize,
    networkSubmissionPerformed: false,
    injectedTransportCallbackAccepted: true,
    cryptographicResponseVerifiedUnderCallerSuppliedPolicy: true,
    trustPolicyExternalPinProvenanceEstablished: false,
    transportProvenanceEstablished: false,
    integratedTimeWithinCallerObservedUpperBoundVerified: true,
    operatorPrivateKeyPersisted: false,
    externalAnchorEstablishedWithinPinnedProviderScope: false,
    independentWitnessEstablished: false,
    wormStorageEstablished: false,
    nonOmissionProofEstablished: false,
    nonEquivocationEstablished: false,
    longTermMonitoringEstablished: false,
    publicProviderInteroperabilityObserved: false,
    publicProviderLiveAnchorArtifactEstablished: false,
    publicDeploymentReady: false,
    status: "PARTIAL",
    decision: "HOLD",
    disposition: "QUARANTINED",
    authority: "NONE",
    authorityGrants: 0,
    actionReady: false,
    actionAuthorized: false,
    actionAdmissions: 0,
    executable: false,
    automaticTraining: false,
    productionTrainingAuthorized: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    pricingAuthorized: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    settlementAuthorized: false,
    permitsSettlement: false,
    boundary: clone(NETWORK_LIFECYCLE_REKOR_ANCHOR_BOUNDARY),
  };
}

function makeBundle(input) {
  const body = bundleBody(input);
  return deepFreeze({ ...body, bundleHash: domainDigest("bundle", body) });
}

function assertBundleState(bundle) {
  exactObject(bundle, ["schema", "bundleClass", "request", "trustPolicyHash",
    "rekorOrigin", "createEntryUrl", "receivedAtLocallyObserved",
    "receivedAtIsExternalTimeEvidence", "response", "entryUUID", "logID", "logIndex",
    "integratedTime", "inclusionRootHash", "inclusionTreeSize",
    "networkSubmissionPerformed", "injectedTransportCallbackAccepted",
    "cryptographicResponseVerifiedUnderCallerSuppliedPolicy",
    "trustPolicyExternalPinProvenanceEstablished", "transportProvenanceEstablished",
    "integratedTimeWithinCallerObservedUpperBoundVerified",
    "operatorPrivateKeyPersisted",
    "externalAnchorEstablishedWithinPinnedProviderScope",
    "independentWitnessEstablished", "wormStorageEstablished",
    "nonOmissionProofEstablished", "nonEquivocationEstablished",
    "longTermMonitoringEstablished", "publicProviderInteroperabilityObserved",
    "publicProviderLiveAnchorArtifactEstablished", "publicDeploymentReady", "status", "decision",
    "disposition", "authority", "authorityGrants", "actionReady", "actionAuthorized",
    "actionAdmissions", "executable", "automaticTraining",
    "productionTrainingAuthorized", "trainingRows", "causalExperienceUnits",
    "pricingAuthorized", "permitsPricing", "guaranteeEstablished", "permitsGuarantee",
    "settlementAuthorized", "permitsSettlement", "boundary", "bundleHash"], "BUNDLE");
  exactObject(bundle.response, ["httpStatus", "mediaType", "utf8Base64", "byteLength",
    "responseHash"], "BUNDLE_RESPONSE");
  if (bundle.schema !== NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS.bundle
    || bundle.bundleClass
      !== "OFFLINE_REPLAYABLE_CALLER_POLICY_REKOR_V1_CRYPTO_RESPONSE_HOLD_ONLY"
    || bundle.receivedAtIsExternalTimeEvidence !== false
    || bundle.response.httpStatus !== 201 || bundle.response.mediaType !== "application/json"
    || bundle.networkSubmissionPerformed !== false
    || bundle.injectedTransportCallbackAccepted !== true
    || bundle.cryptographicResponseVerifiedUnderCallerSuppliedPolicy !== true
    || bundle.trustPolicyExternalPinProvenanceEstablished !== false
    || bundle.transportProvenanceEstablished !== false
    || bundle.integratedTimeWithinCallerObservedUpperBoundVerified !== true
    || bundle.operatorPrivateKeyPersisted !== false
    || bundle.externalAnchorEstablishedWithinPinnedProviderScope !== false
    || bundle.independentWitnessEstablished !== false
    || bundle.wormStorageEstablished !== false
    || bundle.nonOmissionProofEstablished !== false
    || bundle.nonEquivocationEstablished !== false
    || bundle.longTermMonitoringEstablished !== false
    || bundle.publicProviderInteroperabilityObserved !== false
    || bundle.publicProviderLiveAnchorArtifactEstablished !== false
    || bundle.publicDeploymentReady !== false || bundle.status !== "PARTIAL"
    || bundle.decision !== "HOLD" || bundle.disposition !== "QUARANTINED"
    || bundle.authority !== "NONE" || bundle.authorityGrants !== 0
    || bundle.actionReady !== false || bundle.actionAuthorized !== false
    || bundle.actionAdmissions !== 0 || bundle.executable !== false
    || bundle.automaticTraining !== false
    || bundle.productionTrainingAuthorized !== false || bundle.trainingRows !== 0
    || bundle.causalExperienceUnits !== 0 || bundle.pricingAuthorized !== false
    || bundle.permitsPricing !== false || bundle.guaranteeEstablished !== false
    || bundle.permitsGuarantee !== false || bundle.settlementAuthorized !== false
    || bundle.permitsSettlement !== false
    || !same(bundle.boundary, NETWORK_LIFECYCLE_REKOR_ANCHOR_BOUNDARY)) {
    fail("BUNDLE_STATE_INVALID");
  }
}

function replayBundle(record, context) {
  rejectTree(record);
  rejectTree(context);
  exactObject(context, ["checkpoint", "outboxRequest", "trustPolicy",
    "expectedTrustPolicyHash", "expectedBundleHash"], "BUNDLE_VERIFY_CONTEXT");
  const checkpoint = assertNetworkLifecycleHeadCheckpoint(context.checkpoint);
  const outboxRequest = assertNetworkLifecycleAnchorOutboxRequest(context.outboxRequest,
    { checkpoint });
  const policy = assertNetworkLifecycleRekorTrustPolicy(context.trustPolicy, {
    expectedTrustPolicyHash: context.expectedTrustPolicyHash,
  });
  const bundle = clone(record);
  assertBundleState(bundle);
  const expectedBundleHash = hash(context.expectedBundleHash, "EXPECTED_BUNDLE_HASH");
  const { bundleHash, ...body } = bundle;
  if (hash(bundleHash, "BUNDLE_HASH") !== domainDigest("bundle", body)) {
    fail("BUNDLE_HASH_INVALID");
  }
  if (bundleHash !== expectedBundleHash) fail("EXPECTED_BUNDLE_HASH_MISMATCH");
  const request = normalizeRequest(bundle.request, checkpoint, outboxRequest);
  if (bundle.trustPolicyHash !== policy.policyHash
    || bundle.rekorOrigin !== policy.rekorOrigin
    || bundle.createEntryUrl !== `${policy.rekorOrigin}${policy.createEntryPath}`) {
    fail("BUNDLE_POLICY_BINDING_INVALID");
  }
  const responseBytes = strictBase64(bundle.response.utf8Base64,
    "BUNDLE_RESPONSE_BYTES", { maximumBytes: MAX_RESPONSE_BYTES });
  if (bundle.response.byteLength !== responseBytes.length
    || bundle.response.responseHash !== byteHash(responseBytes)) {
    fail("BUNDLE_RESPONSE_BYTES_INVALID");
  }
  const responseText = BufferToString(responseBytes, "utf8");
  if (!BufferEquals(BufferFrom(responseText, "utf8"), responseBytes)) {
    fail("BUNDLE_RESPONSE_UTF8_INVALID");
  }
  const facts = verifyRekorResponse(responseText, request, policy,
    bundle.receivedAtLocallyObserved);
  const rebuilt = makeBundle({ request, policy, responseText,
    observedAt: bundle.receivedAtLocallyObserved, facts });
  if (!same(bundle, rebuilt)) fail("BUNDLE_REPLAY_INVALID");
  return { bundle, request, policy, facts };
}

function verificationBoundaryFields(cryptographicResponseVerified) {
  return {
    networkSubmissionPerformed: false,
    injectedTransportCallbackAccepted: cryptographicResponseVerified,
    cryptographicResponseVerifiedUnderCallerSuppliedPolicy:
      cryptographicResponseVerified,
    trustPolicyExternalPinProvenanceEstablished: false,
    transportProvenanceEstablished: false,
    integratedTimeWithinCallerObservedUpperBoundVerified:
      cryptographicResponseVerified,
    externalAnchorEstablishedWithinPinnedProviderScope: false,
    independentWitnessEstablished: false,
    wormStorageEstablished: false,
    nonOmissionProofEstablished: false,
    nonEquivocationEstablished: false,
    longTermMonitoringEstablished: false,
    publicProviderInteroperabilityObserved: false,
    publicProviderLiveAnchorArtifactEstablished: false,
    publicDeploymentReady: false,
    status: "PARTIAL",
    decision: "HOLD",
    disposition: "QUARANTINED",
    authority: "NONE",
    authorityGrants: 0,
    actionReady: false,
    actionAuthorized: false,
    actionAdmissions: 0,
    executable: false,
    automaticTraining: false,
    productionTrainingAuthorized: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    pricingAuthorized: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    settlementAuthorized: false,
    permitsSettlement: false,
    boundary: clone(NETWORK_LIFECYCLE_REKOR_ANCHOR_BOUNDARY),
  };
}

function verificationFailure(error) {
  return deepFreeze({
    schema: NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS.verification,
    ok: false,
    stage: "OFFLINE_BUNDLE_REPLAY",
    error: StringConstructor(error?.message ?? error),
    expectedBundleHashRequired: true,
    exactBodyBindingVerified: false,
    operatorSignatureVerified: false,
    logKeyEpochPinVerified: false,
    signedEntryTimestampVerified: false,
    entryUUIDLeafSuffixVerified: false,
    rfc6962InclusionProofVerified: false,
    signedCheckpointRootVerified: false,
    integratedTimeChronologyVerified: false,
    ...verificationBoundaryFields(false),
  });
}

export function verifyNetworkLifecycleRekorAnchorBundle(record, context = {}) {
  try {
    const checked = replayBundle(record, context);
    const body = {
      schema: NETWORK_LIFECYCLE_REKOR_ANCHOR_SCHEMAS.verification,
      ok: true,
      stage: "OFFLINE_BUNDLE_REPLAY",
      bundleHash: checked.bundle.bundleHash,
      expectedBundleHash: context.expectedBundleHash,
      trustPolicyHash: checked.policy.policyHash,
      requestHash: checked.request.requestHash,
      checkpointHash: checked.request.statement.checkpointHash,
      anchorOutboxRequestHash: checked.request.statement.anchorOutboxRequestHash,
      entryUUID: checked.facts.entryUUID,
      logID: checked.facts.logID,
      logIndex: checked.facts.logIndex,
      integratedTime: checked.facts.integratedTime,
      expectedBundleHashRequired: true,
      exactBodyBindingVerified: true,
      operatorSignatureVerified: true,
      logKeyEpochPinVerified: true,
      signedEntryTimestampVerified: true,
      entryUUIDLeafSuffixVerified: true,
      rfc6962InclusionProofVerified: true,
      signedCheckpointRootVerified: true,
      integratedTimeChronologyVerified: true,
      ...verificationBoundaryFields(true),
    };
    return deepFreeze({ ...body, verificationHash: domainDigest("verification", body) });
  } catch (error) {
    return verificationFailure(error);
  }
}

async function readRekorResponse(response) {
  if (response === null || typeof response !== "object" || isProxy(response)
    || !(response instanceof ResponseConstructor)) fail("NATIVE_RESPONSE_REQUIRED");
  if (ResponseStatusGet(response) !== 201) {
    fail(`REKOR_HTTP_${StringConstructor(ResponseStatusGet(response))}`);
  }
  if (ResponseRedirectedGet(response) !== false) fail("REKOR_REDIRECT_FORBIDDEN");
  const mediaType = HeadersGet(ResponseHeadersGet(response), "content-type");
  if (typeof mediaType !== "string" || !RegExpTest(CONTENT_TYPE_JSON, mediaType)) {
    fail("REKOR_CONTENT_TYPE_INVALID");
  }
  const responseText = await ResponseText(response);
  parseResponseText(responseText);
  return responseText;
}

export async function sendNetworkLifecycleRekorAnchor(input = {}) {
  rejectTree(input);
  exactObject(input, ["checkpoint", "outboxRequest", "request", "trustPolicy",
    "expectedTrustPolicyHash", "endpoint", "fetchImpl", "clock"], "SEND_INPUT");
  const checkpoint = assertNetworkLifecycleHeadCheckpoint(input.checkpoint);
  const outboxRequest = assertNetworkLifecycleAnchorOutboxRequest(input.outboxRequest,
    { checkpoint });
  const request = normalizeRequest(input.request, checkpoint, outboxRequest);
  const policy = assertNetworkLifecycleRekorTrustPolicy(input.trustPolicy, {
    expectedTrustPolicyHash: input.expectedTrustPolicyHash,
  });
  const endpoint = httpsOrigin(input.endpoint, "ENDPOINT");
  if (endpoint !== policy.rekorOrigin) fail("ENDPOINT_PINNED_ORIGIN_MISMATCH");
  const fetchImpl = input.fetchImpl;
  const clock = input.clock;
  if (typeof fetchImpl !== "function" || isProxy(fetchImpl)) {
    fail("INJECTED_FETCH_REQUIRED");
  }
  if (typeof clock !== "function" || isProxy(clock)) {
    fail("INJECTED_CLOCK_REQUIRED");
  }
  const createEntryUrl = `${policy.rekorOrigin}${policy.createEntryPath}`;
  const response = await fetchImpl(createEntryUrl, {
    method: "POST",
    redirect: "error",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: canonicalizeStrict(request.proposal),
  });
  const responseText = await readRekorResponse(response);
  const observedAt = observedNow(clock);
  if (DateParse(observedAt) < DateParse(request.statement.statementCreatedAt)) {
    fail("OBSERVED_AT_PRECEDES_STATEMENT");
  }
  const facts = verifyRekorResponse(responseText, request, policy, observedAt);
  const bundle = makeBundle({ request, policy, responseText, observedAt, facts });
  const replayed = verifyNetworkLifecycleRekorAnchorBundle(bundle, {
    checkpoint,
    outboxRequest,
    trustPolicy: policy,
    expectedTrustPolicyHash: policy.policyHash,
    expectedBundleHash: bundle.bundleHash,
  });
  if (replayed.ok !== true) fail(`FINAL_BUNDLE_REPLAY_FAILED:${replayed.error}`);
  return bundle;
}

/*
 * Narrow generic exports for versioned adapters whose subject is not a
 * network-lifecycle checkpoint.  These functions intentionally reuse the
 * exact P-256, Rekor SET, RFC 6962 inclusion, signed-checkpoint, key-epoch,
 * chronology, response-size, and canonical-byte checks above.  They do not
 * weaken or change the lifecycle-specific APIs.
 */

function normalizeP256HashedRekordPrimitive(value) {
  exactObject(value, ["schema", "statementBytesUtf8", "statementDigest",
    "operator", "proposal", "operatorPrivateKeyPersisted", "primitiveHash"],
  "GENERIC_PRIMITIVE");
  const { primitiveHash, ...body } = value;
  if (body.schema !== "outsider/rekor-p256-hashedrekord-proposal-primitive/v1"
    || body.operatorPrivateKeyPersisted !== false
    || hash(primitiveHash, "GENERIC_PRIMITIVE_HASH")
      !== domainDigest("generic-proposal-primitive", body)
    || typeof body.statementBytesUtf8 !== "string"
    || BufferByteLength(body.statementBytesUtf8, "utf8") < 2
    || BufferByteLength(body.statementBytesUtf8, "utf8") > MAX_STATEMENT_BYTES) {
    fail("GENERIC_PRIMITIVE_STATE_INVALID");
  }
  let statement;
  try { statement = JSONParse(body.statementBytesUtf8); }
  catch { fail("GENERIC_PRIMITIVE_STATEMENT_JSON_INVALID"); }
  rejectTree(statement);
  if (statement === null || typeof statement !== "object" || ArrayIsArray(statement)
    || ObjectGetPrototypeOf(statement) !== ObjectPrototype
    || canonicalizeStrict(statement) !== body.statementBytesUtf8) {
    fail("GENERIC_PRIMITIVE_STATEMENT_CANONICAL_INVALID");
  }
  exactObject(body.statementDigest, ["algorithm", "value"],
    "GENERIC_PRIMITIVE_STATEMENT_DIGEST");
  const statementBytes = BufferFrom(body.statementBytesUtf8, "utf8");
  if (body.statementDigest.algorithm !== "sha256"
    || body.statementDigest.value !== digestHex(statementBytes)) {
    fail("GENERIC_PRIMITIVE_STATEMENT_DIGEST_INVALID");
  }
  exactObject(body.operator, ["algorithm", "keyId", "publicKeyPem",
    "signatureBase64"], "GENERIC_PRIMITIVE_OPERATOR");
  const publicMaterial = p256PublicMaterial(body.operator.publicKeyPem,
    "GENERIC_PRIMITIVE_OPERATOR_PUBLIC_KEY");
  const signature = strictBase64(body.operator.signatureBase64,
    "GENERIC_PRIMITIVE_OPERATOR_SIGNATURE", { maximumBytes: 256 });
  if (body.operator.algorithm !== "ECDSA_P256_SHA256_ASN1_DER"
    || body.operator.keyId !== publicMaterial.keyId
    || !cryptoVerify("sha256", statementBytes, publicMaterial.key, signature)) {
    fail("GENERIC_PRIMITIVE_OPERATOR_SIGNATURE_INVALID");
  }
  exactObject(body.proposal, ["apiVersion", "kind", "spec"],
    "GENERIC_PRIMITIVE_PROPOSAL");
  exactObject(body.proposal.spec, ["data", "signature"],
    "GENERIC_PRIMITIVE_PROPOSAL_SPEC");
  exactObject(body.proposal.spec.data, ["hash"],
    "GENERIC_PRIMITIVE_PROPOSAL_DATA");
  exactObject(body.proposal.spec.data.hash, ["algorithm", "value"],
    "GENERIC_PRIMITIVE_PROPOSAL_DATA_HASH");
  exactObject(body.proposal.spec.signature, ["content", "publicKey"],
    "GENERIC_PRIMITIVE_PROPOSAL_SIGNATURE");
  exactObject(body.proposal.spec.signature.publicKey, ["content"],
    "GENERIC_PRIMITIVE_PROPOSAL_PUBLIC_KEY");
  const proposalPublicKey = strictBase64(
    body.proposal.spec.signature.publicKey.content,
    "GENERIC_PRIMITIVE_PROPOSAL_PUBLIC_KEY_CONTENT",
    { maximumBytes: MAX_KEY_BYTES });
  if (body.proposal.apiVersion !== "0.0.1"
    || body.proposal.kind !== "hashedrekord"
    || body.proposal.spec.data.hash.algorithm !== "sha256"
    || body.proposal.spec.data.hash.value !== body.statementDigest.value
    || body.proposal.spec.signature.content !== body.operator.signatureBase64
    || BufferToString(proposalPublicKey, "utf8") !== body.operator.publicKeyPem
    || !BufferEquals(BufferFrom(BufferToString(proposalPublicKey, "utf8"), "utf8"),
      proposalPublicKey)) fail("GENERIC_PRIMITIVE_PROPOSAL_BINDING_INVALID");
  return deepFreeze({ primitive: value, statement });
}

export function createRekorP256HashedRekordProposalPrimitiveV1(input = {}) {
  rejectTree(input);
  exactObject(input, ["statementBytesUtf8", "operatorPrivateKeyPem"],
    "GENERIC_PRIMITIVE_CREATE_INPUT");
  if (typeof input.statementBytesUtf8 !== "string"
    || BufferByteLength(input.statementBytesUtf8, "utf8") < 2
    || BufferByteLength(input.statementBytesUtf8, "utf8") > MAX_STATEMENT_BYTES) {
    fail("GENERIC_PRIMITIVE_STATEMENT_BYTES_INVALID");
  }
  let statement;
  try { statement = JSONParse(input.statementBytesUtf8); }
  catch { fail("GENERIC_PRIMITIVE_STATEMENT_JSON_INVALID"); }
  rejectTree(statement);
  if (statement === null || typeof statement !== "object" || ArrayIsArray(statement)
    || ObjectGetPrototypeOf(statement) !== ObjectPrototype
    || canonicalizeStrict(statement) !== input.statementBytesUtf8) {
    fail("GENERIC_PRIMITIVE_STATEMENT_CANONICAL_INVALID");
  }
  const statementBytes = BufferFrom(input.statementBytesUtf8, "utf8");
  const material = p256PrivateMaterial(input.operatorPrivateKeyPem);
  let signature;
  try { signature = cryptoSign("sha256", statementBytes, material.privateKey); }
  catch { fail("GENERIC_PRIMITIVE_OPERATOR_SIGNATURE_FAILED"); }
  const signatureBase64 = BufferToString(signature, "base64");
  const statementDigest = { algorithm: "sha256", value: digestHex(statementBytes) };
  const operator = {
    algorithm: "ECDSA_P256_SHA256_ASN1_DER",
    keyId: material.keyId,
    publicKeyPem: material.publicKeyPem,
    signatureBase64,
  };
  const proposal = {
    apiVersion: "0.0.1",
    kind: "hashedrekord",
    spec: {
      data: { hash: { algorithm: "sha256", value: statementDigest.value } },
      signature: {
        content: signatureBase64,
        publicKey: {
          content: BufferToString(BufferFrom(material.publicKeyPem, "utf8"), "base64"),
        },
      },
    },
  };
  const body = {
    schema: "outsider/rekor-p256-hashedrekord-proposal-primitive/v1",
    statementBytesUtf8: input.statementBytesUtf8,
    statementDigest,
    operator,
    proposal,
    operatorPrivateKeyPersisted: false,
  };
  const primitive = deepFreeze({ ...body, primitiveHash: domainDigest(
    "generic-proposal-primitive", body) });
  normalizeP256HashedRekordPrimitive(primitive);
  return primitive;
}

export function assertRekorP256HashedRekordProposalPrimitiveV1(value) {
  rejectTree(value);
  return normalizeP256HashedRekordPrimitive(clone(value)).primitive;
}

export function verifyRekorP256HashedRekordResponsePrimitiveV1(input = {}) {
  rejectTree(input);
  exactObject(input, ["primitive", "responseText", "statementCreatedAt",
    "observedAt", "trustPolicy", "expectedTrustPolicyHash"],
  "GENERIC_RESPONSE_VERIFY_INPUT");
  const primitive = normalizeP256HashedRekordPrimitive(
    clone(input.primitive)).primitive;
  const policy = assertNetworkLifecycleRekorTrustPolicy(input.trustPolicy, {
    expectedTrustPolicyHash: input.expectedTrustPolicyHash,
  });
  const statementCreatedAt = canonicalTime(input.statementCreatedAt,
    "GENERIC_RESPONSE_STATEMENT_CREATED_AT");
  const observedAt = canonicalTime(input.observedAt,
    "GENERIC_RESPONSE_OBSERVED_AT");
  if (DateParse(observedAt) < DateParse(statementCreatedAt)) {
    fail("GENERIC_RESPONSE_OBSERVED_AT_PRECEDES_STATEMENT");
  }
  const facts = verifyRekorResponse(input.responseText, {
    statement: { statementCreatedAt },
    proposal: primitive.proposal,
  }, policy, observedAt);
  return deepFreeze({
    ...facts,
    exactProposalBodyBindingVerified: true,
    operatorP256SignatureVerified: true,
    logKeyEpochPinVerified: true,
    signedEntryTimestampVerified: true,
    entryUUIDLeafSuffixVerified: true,
    rfc6962InclusionProofVerified: true,
    signedCheckpointRootVerified: true,
    integratedTimeChronologyVerified: true,
  });
}

export async function readRekorCreateEntryResponseTextPrimitiveV1(response) {
  return readRekorResponse(response);
}
