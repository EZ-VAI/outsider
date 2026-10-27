/*
 * Rekor hashedrekord/0.0.1 transport for an exact digest-only durable effect
 * head publication request.
 *
 * The caller pins one HTTPS Rekor origin, log-key epoch policy, P-256
 * ephemeral operator key, fetch implementation, and clock.  One valid
 * publication request is signed and submitted once.  The returned Rekor body
 * is accepted only after the shared strict primitive verifies proposal bytes,
 * SET, RFC 6962 inclusion, UUID leaf binding, the signed checkpoint, log-key
 * epoch, and chronology.  No default transport, redirect, or retry exists.
 *
 * This proves limited external inclusion under the caller-pinned log key.  It
 * does not prove cross-checkpoint consistency, non-equivocation, non-omission,
 * independent witnessing, authority, outcome truth, or durable responsibility.
 */

import {
  createHash, createPrivateKey, createPublicKey,
} from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS,
} from "./outsider-durable-effect-ledger-external-head-publication-v1.js";
import {
  NETWORK_LIFECYCLE_REKOR_ANCHOR_V2_LINEAGE,
  assertNetworkLifecycleRekorTrustPolicy,
  assertRekorP256HashedRekordProposalPrimitiveV1,
  createRekorP256HashedRekordProposalPrimitiveV1,
  readRekorCreateEntryResponseTextPrimitiveV1,
  verifyRekorP256HashedRekordResponsePrimitiveV1,
} from "./outsider-network-lifecycle-rekor-anchor-v2.js";

const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetHas = Function.prototype.call.bind(Set.prototype.has);

const PREFIX = "OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const HEX_64 = /^[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const BASE64
  = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const TRANSPORT_ID = "sigstore.rekor-v1.durable-effect-head.v1";
const CREATE_ENTRY_PATH = "/api/v1/log/entries";
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_KEY_BYTES = 64 * 1024;
const STRICT_PRIMITIVE_PREDECESSOR_SOURCE_HASH
  = `sha256:${NETWORK_LIFECYCLE_REKOR_ANCHOR_V2_LINEAGE.predecessor.sha256}`;

const ADAPTER_STATES = new WeakMap();

export const OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_SCHEMAS
  = ObjectFreeze({
    policy: "outsider/rekor-durable-effect-head-transport-policy/v1",
    statement: "outsider/rekor-durable-effect-head-statement/v1",
    bundle: "outsider/rekor-durable-effect-head-bundle/v1",
    verification: "outsider/rekor-durable-effect-head-verification/v1",
    adapter: "outsider/rekor-durable-effect-head-adapter/v1",
  });

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")
    || ObjectIsFrozen(value) || SetHas(seen, value)) return value;
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  for (const key of ReflectOwnKeys(value)) {
    const descriptor = descriptors[key];
    if (descriptor && ObjectHasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return ObjectFreeze(value);
}

export const OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_BOUNDARY
  = deepFreeze({
    position:
      "CALLER_PINNED_REKOR_V1_CRYPTOGRAPHIC_INCLUSION_OF_DIGEST_ONLY_EFFECT_HEAD_HOLD_ONLY",
    profile: "SIGSTORE_REKOR_HASHEDREKORD_0.0.1",
    exactHttpsOriginCallerPinned: true,
    createEntryPath: CREATE_ENTRY_PATH,
    p256OperatorKeyRequired: true,
    operatorPrivateKeyCallerManaged: true,
    operatorPrivateKeyProjected: false,
    operatorPrivateKeyPersisted: false,
    rawLedgerProjected: false,
    rawLedgerIdProjected: false,
    entryOrEventBytesProjected: false,
    digestOnlyStatement: true,
    maximumPostAttempts: 1,
    maximumResponseBytes: MAX_RESPONSE_BYTES,
    redirectPolicy: "ERROR",
    automaticRetryPermitted: false,
    defaultFetchAvailable: false,
    exactProposalBodyBindingRequired: true,
    signedEntryTimestampRequired: true,
    rfc6962InclusionProofRequired: true,
    signedCheckpointRequired: true,
    callerPinnedLogKeyEpochRequired: true,
    externalInclusionUnderPinnedLogKeyEstablishedOnSuccess: true,
    providerAcknowledgementIsAuthority: false,
    providerAcknowledgementIsOutcomeTruth: false,
    independentWitnessEstablished: false,
    trustPolicyExternalProvenanceEstablished: false,
    transportProvenanceEstablished: false,
    checkpointConsistencyProofVerified: false,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    durableAppendOnlyExternalHistoryEstablished: false,
    durableExternalHeadEstablished: false,
    trustedClockEstablished: false,
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    permitsPricing: false,
    permitsGuarantee: false,
    permitsSettlement: false,
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && !isProxy(value) && ObjectGetPrototypeOf(value) === ObjectPrototype;
}

function exactObject(value, fields, code) {
  if (!plain(value)) fail(`${code}_OBJECT_INVALID`);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(value);
  if (keys.length !== fields.length
    || keys.some((key) => typeof key !== "string" || !fields.includes(key))) {
    fail(`${code}_SHAPE_INVALID`);
  }
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DESCRIPTOR_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  const encoded = typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256")
    .update(`outsider:rekor-durable-effect-head-transport:${domain}:v1\0`, "utf8")
    .update(encoded, "utf8").digest("hex")}`;
}

function rawHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function time(value, code) {
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function clone(value) {
  return JSON.parse(canonicalizeStrict(value));
}

function strictBase64(value, code, maximumBytes = MAX_RESPONSE_BYTES) {
  if (typeof value !== "string" || value.length < 1
    || !RegExpTest(BASE64, value)) fail(`${code}_INVALID`);
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > maximumBytes || bytes.toString("base64") !== value) {
    fail(`${code}_INVALID`);
  }
  return bytes;
}

function p256Operator(privateKeyPem) {
  if (typeof privateKeyPem !== "string"
    || Buffer.byteLength(privateKeyPem, "utf8") < 1
    || Buffer.byteLength(privateKeyPem, "utf8") > MAX_KEY_BYTES) {
    fail("OPERATOR_PRIVATE_KEY_INVALID");
  }
  let privateKey;
  try { privateKey = createPrivateKey(privateKeyPem); }
  catch { fail("OPERATOR_PRIVATE_KEY_INVALID"); }
  if (privateKey.asymmetricKeyType !== "ec"
    || privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    fail("OPERATOR_PRIVATE_KEY_P256_REQUIRED");
  }
  const publicKey = createPublicKey(privateKey);
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  return {
    privateKeyPem,
    publicKeyPem,
    keyId: rawHash(publicDer),
  };
}

function validatePublicationRequest(value, policy) {
  exactObject(value, ["schema", "requestClass", "publishedAt",
    "publishedAtIsExternalTimeEvidence", "subject", "commitmentHash",
    "transportBinding", "externalChainExpectation", "disclosure",
    "automaticRetryPermitted", "authority", "decisionState", "requestHash"],
  "PUBLICATION_REQUEST");
  exactObject(value.subject, ["kind", "algorithm", "digestHex"],
    "PUBLICATION_REQUEST_SUBJECT");
  exactObject(value.transportBinding, ["transportId", "transportPolicyHash",
    "identityAndTrustEstablishedByIdOrPolicyHash"],
  "PUBLICATION_REQUEST_TRANSPORT");
  exactObject(value.externalChainExpectation, ["expectedSequence",
    "previousReceiptHash", "predecessorWasCallerSupplied"],
  "PUBLICATION_REQUEST_CHAIN");
  exactObject(value.disclosure, ["digestOnly", "directoryPathIncluded",
    "rawLedgerIdIncluded", "entryOrEventBytesIncluded", "endpointSecretIncluded"],
  "PUBLICATION_REQUEST_DISCLOSURE");
  const { requestHash, ...body } = value;
  if (value.schema
      !== OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS
        .request
    || value.requestClass
      !== "DIGEST_ONLY_EXTERNAL_HEAD_APPEND_REQUEST_PROVIDER_ACK_IS_NOT_TRUTH"
    || value.publishedAtIsExternalTimeEvidence !== false
    || value.subject.kind
      !== "DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_COMMITMENT_V1_HASH"
    || value.subject.algorithm !== "SHA-256"
    || typeof value.subject.digestHex !== "string"
    || !RegExpTest(HEX_64, value.subject.digestHex)
    || value.subject.digestHex !== value.commitmentHash.slice("sha256:".length)
    || value.transportBinding.transportId !== TRANSPORT_ID
    || value.transportBinding.transportPolicyHash !== policy.policyHash
    || value.transportBinding.identityAndTrustEstablishedByIdOrPolicyHash !== false
    || !Number.isSafeInteger(value.externalChainExpectation.expectedSequence)
    || value.externalChainExpectation.expectedSequence < 1
    || value.externalChainExpectation.predecessorWasCallerSupplied !== true
    || value.disclosure.digestOnly !== true
    || value.disclosure.directoryPathIncluded !== false
    || value.disclosure.rawLedgerIdIncluded !== false
    || value.disclosure.entryOrEventBytesIncluded !== false
    || value.disclosure.endpointSecretIncluded !== false
    || value.automaticRetryPermitted !== false
    || value.authority !== "NONE" || value.decisionState !== "HOLD") {
    fail("PUBLICATION_REQUEST_INVALID");
  }
  time(value.publishedAt, "PUBLICATION_REQUEST_PUBLISHED_AT");
  hash(value.commitmentHash, "PUBLICATION_REQUEST_COMMITMENT_HASH");
  hash(value.transportBinding.transportPolicyHash,
    "PUBLICATION_REQUEST_TRANSPORT_POLICY_HASH");
  if (value.externalChainExpectation.previousReceiptHash !== null) {
    hash(value.externalChainExpectation.previousReceiptHash,
      "PUBLICATION_REQUEST_PREVIOUS_RECEIPT_HASH");
  }
  if (hash(requestHash, "PUBLICATION_REQUEST_HASH") !== digestPublication(body)) {
    fail("PUBLICATION_REQUEST_HASH_MISMATCH");
  }
  return value;
}

function digestPublication(body) {
  const encoded = canonicalizeStrict(body);
  return `sha256:${createHash("sha256")
    .update("durable-effect-ledger-external-head-publication-request", "utf8")
    .update("\0", "utf8").update(encoded, "utf8").digest("hex")}`;
}

function makeStatement(request) {
  const body = {
    schema: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_SCHEMAS.statement,
    statementClass: "SIGNED_DIGEST_ONLY_DURABLE_EFFECT_HEAD_PUBLICATION",
    publicationRequestHash: request.requestHash,
    commitmentHash: request.commitmentHash,
    subjectDigest: {
      algorithm: "sha256",
      value: request.subject.digestHex,
    },
    transportPolicyHash: request.transportBinding.transportPolicyHash,
    externalSequence: request.externalChainExpectation.expectedSequence,
    previousReceiptHash: request.externalChainExpectation.previousReceiptHash,
    statementCreatedAt: request.publishedAt,
    statementCreatedAtIsExternalTimeEvidence: false,
    disclosure:
      "COMMITMENT_DIGEST_ONLY_NO_DIRECTORY_LEDGER_ID_ENTRY_EVENT_OR_SECRET_BYTES",
    rawLedgerIncluded: false,
    rawLedgerIdIncluded: false,
    entryOrEventBytesIncluded: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return deepFreeze({ ...body, statementHash: digest("statement", body) });
}

function policyBody(trustPolicy, operator) {
  const body = {
    schema: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_SCHEMAS.policy,
    profile: "SIGSTORE_REKOR_HASHEDREKORD_0.0.1",
    rekorOrigin: trustPolicy.rekorOrigin,
    createEntryPath: CREATE_ENTRY_PATH,
    reusedTrustPolicyHash: trustPolicy.policyHash,
    trustPolicyReuseScope:
      "HTTPS_ORIGIN_AND_PINNED_P256_LOG_KEY_EPOCHS_ONLY_NO_LIFECYCLE_SUBJECT_REUSE",
    operatorAlgorithm: "ECDSA_P256_SHA256_ASN1_DER",
    operatorKeyId: operator.keyId,
    strictPrimitivePredecessorSourceHash:
      STRICT_PRIMITIVE_PREDECESSOR_SOURCE_HASH,
    maximumPostAttempts: 1,
    maximumResponseBytes: MAX_RESPONSE_BYTES,
    redirectPolicy: "ERROR",
    automaticRetryPermitted: false,
    defaultFetchAvailable: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return deepFreeze({ ...body, policyHash: digest("transport-policy", body) });
}

function observedNow(clock) {
  let value;
  try { value = clock(); } catch { fail("CLOCK_FAILED"); }
  if (value instanceof Date) value = value.toISOString();
  return time(value, "OBSERVED_AT");
}

function validateOptions(value) {
  exactObject(value, ["signal"], "TRANSPORT_OPTIONS");
  if (value.signal === null || typeof value.signal !== "object"
    || typeof value.signal.aborted !== "boolean") fail("ABORT_SIGNAL_INVALID");
  if (value.signal.aborted) fail("ABORTED_BEFORE_POST");
  return value.signal;
}

function factsProjection(facts) {
  return {
    entryUUID: facts.entryUUID,
    logID: facts.logID,
    logIndex: facts.logIndex,
    integratedTime: facts.integratedTime,
    inclusionRootHash: facts.inclusionRootHash,
    inclusionTreeSize: facts.inclusionTreeSize,
    exactProposalBodyBindingVerified: true,
    operatorP256SignatureVerified: true,
    logKeyEpochPinVerified: true,
    signedEntryTimestampVerified: true,
    entryUUIDLeafSuffixVerified: true,
    rfc6962InclusionProofVerified: true,
    signedCheckpointRootVerified: true,
    integratedTimeChronologyVerified: true,
  };
}

function makeBundle({ request, policy, primitive, responseText, observedAt, facts }) {
  const responseBytes = Buffer.from(responseText, "utf8");
  const body = {
    schema: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_SCHEMAS.bundle,
    bundleClass:
      "REPLAYABLE_CALLER_PINNED_REKOR_V1_EFFECT_HEAD_INCLUSION_HOLD_ONLY",
    publicationRequest: clone(request),
    transportPolicyHash: policy.policyHash,
    reusedTrustPolicyHash: policy.reusedTrustPolicyHash,
    strictPrimitivePredecessorSourceHash:
      STRICT_PRIMITIVE_PREDECESSOR_SOURCE_HASH,
    rekorOrigin: policy.rekorOrigin,
    createEntryUrl: `${policy.rekorOrigin}${CREATE_ENTRY_PATH}`,
    primitive: clone(primitive),
    response: {
      httpStatus: 201,
      mediaType: "application/json",
      utf8Base64: responseBytes.toString("base64"),
      byteLength: responseBytes.length,
      responseHash: rawHash(responseBytes),
    },
    observedAt,
    observedAtIsExternalTimeEvidence: false,
    facts: factsProjection(facts),
    externalInclusionUnderPinnedLogKeyEstablished: true,
    exactCommitmentSubjectBindingVerified: true,
    providerAcknowledgementIsAuthority: false,
    providerAcknowledgementIsOutcomeTruth: false,
    independentWitnessEstablished: false,
    trustPolicyExternalProvenanceEstablished: false,
    transportProvenanceEstablished: false,
    checkpointConsistencyProofVerified: false,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    durableAppendOnlyExternalHistoryEstablished: false,
    durableExternalHeadEstablished: false,
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, bundleHash: digest("bundle", body) });
}

function validateFacts(value) {
  exactObject(value, ["entryUUID", "logID", "logIndex", "integratedTime",
    "inclusionRootHash", "inclusionTreeSize", "exactProposalBodyBindingVerified",
    "operatorP256SignatureVerified", "logKeyEpochPinVerified",
    "signedEntryTimestampVerified", "entryUUIDLeafSuffixVerified",
    "rfc6962InclusionProofVerified", "signedCheckpointRootVerified",
    "integratedTimeChronologyVerified"], "BUNDLE_FACTS");
  if (!["exactProposalBodyBindingVerified", "operatorP256SignatureVerified",
    "logKeyEpochPinVerified", "signedEntryTimestampVerified",
    "entryUUIDLeafSuffixVerified", "rfc6962InclusionProofVerified",
    "signedCheckpointRootVerified", "integratedTimeChronologyVerified"]
    .every((field) => value[field] === true)) fail("BUNDLE_FACTS_INVALID");
  return value;
}

function validateBundleState(value) {
  exactObject(value, ["schema", "bundleClass", "publicationRequest",
    "transportPolicyHash", "reusedTrustPolicyHash",
    "strictPrimitivePredecessorSourceHash", "rekorOrigin", "createEntryUrl",
    "primitive", "response", "observedAt", "observedAtIsExternalTimeEvidence",
    "facts", "externalInclusionUnderPinnedLogKeyEstablished",
    "exactCommitmentSubjectBindingVerified", "providerAcknowledgementIsAuthority",
    "providerAcknowledgementIsOutcomeTruth", "independentWitnessEstablished",
    "trustPolicyExternalProvenanceEstablished", "transportProvenanceEstablished",
    "checkpointConsistencyProofVerified", "externalNonOmissionEstablished",
    "externalNonEquivocationEstablished", "durableAppendOnlyExternalHistoryEstablished",
    "durableExternalHeadEstablished", "authority", "decisionState", "actionReady",
    "executable", "boundary", "bundleHash"], "BUNDLE");
  exactObject(value.response, ["httpStatus", "mediaType", "utf8Base64",
    "byteLength", "responseHash"], "BUNDLE_RESPONSE");
  validateFacts(value.facts);
  const { bundleHash, ...body } = value;
  if (value.schema !== OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_SCHEMAS.bundle
    || value.bundleClass
      !== "REPLAYABLE_CALLER_PINNED_REKOR_V1_EFFECT_HEAD_INCLUSION_HOLD_ONLY"
    || value.strictPrimitivePredecessorSourceHash
      !== STRICT_PRIMITIVE_PREDECESSOR_SOURCE_HASH
    || value.createEntryUrl !== `${value.rekorOrigin}${CREATE_ENTRY_PATH}`
    || value.response.httpStatus !== 201
    || value.response.mediaType !== "application/json"
    || value.observedAtIsExternalTimeEvidence !== false
    || value.externalInclusionUnderPinnedLogKeyEstablished !== true
    || value.exactCommitmentSubjectBindingVerified !== true
    || value.providerAcknowledgementIsAuthority !== false
    || value.providerAcknowledgementIsOutcomeTruth !== false
    || value.independentWitnessEstablished !== false
    || value.trustPolicyExternalProvenanceEstablished !== false
    || value.transportProvenanceEstablished !== false
    || value.checkpointConsistencyProofVerified !== false
    || value.externalNonOmissionEstablished !== false
    || value.externalNonEquivocationEstablished !== false
    || value.durableAppendOnlyExternalHistoryEstablished !== false
    || value.durableExternalHeadEstablished !== false
    || value.authority !== "NONE" || value.decisionState !== "HOLD"
    || value.actionReady !== false || value.executable !== false
    || !same(value.boundary,
      OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_BOUNDARY)
    || hash(bundleHash, "BUNDLE_HASH") !== digest("bundle", body)) {
    fail("BUNDLE_STATE_INVALID");
  }
  return value;
}

function verificationFailure(error) {
  return deepFreeze({
    schema: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_SCHEMAS.verification,
    ok: false,
    error: String(error?.message ?? error),
    exactCommitmentSubjectBindingVerified: false,
    externalInclusionUnderPinnedLogKeyEstablished: false,
    providerAcknowledgementIsAuthority: false,
    providerAcknowledgementIsOutcomeTruth: false,
    independentWitnessEstablished: false,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    durableAppendOnlyExternalHistoryEstablished: false,
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
  });
}

export function verifyRekorDurableEffectHeadBundleV1(record, context = {}) {
  try {
    exactObject(context, ["trustPolicy", "expectedTrustPolicyHash",
      "expectedTransportPolicyHash", "expectedBundleHash",
      "expectedPublicationRequestHash"], "VERIFY_CONTEXT");
    const trustPolicy = assertNetworkLifecycleRekorTrustPolicy(
      context.trustPolicy, { expectedTrustPolicyHash: context.expectedTrustPolicyHash });
    const bundle = validateBundleState(clone(record));
    if (bundle.bundleHash !== hash(context.expectedBundleHash,
      "EXPECTED_BUNDLE_HASH")) fail("EXPECTED_BUNDLE_HASH_MISMATCH");
    if (bundle.transportPolicyHash !== hash(context.expectedTransportPolicyHash,
      "EXPECTED_TRANSPORT_POLICY_HASH")) fail("TRANSPORT_POLICY_HASH_MISMATCH");
    if (bundle.publicationRequest.requestHash !== hash(
      context.expectedPublicationRequestHash,
      "EXPECTED_PUBLICATION_REQUEST_HASH")) {
      fail("EXPECTED_PUBLICATION_REQUEST_HASH_MISMATCH");
    }
    if (bundle.reusedTrustPolicyHash !== trustPolicy.policyHash
      || bundle.rekorOrigin !== trustPolicy.rekorOrigin) {
      fail("TRUST_POLICY_BINDING_MISMATCH");
    }
    const policy = { policyHash: bundle.transportPolicyHash };
    const request = validatePublicationRequest(bundle.publicationRequest, policy);
    const expectedStatement = makeStatement(request);
    const primitive = assertRekorP256HashedRekordProposalPrimitiveV1(
      bundle.primitive);
    if (primitive.statementBytesUtf8 !== canonicalizeStrict(expectedStatement)) {
      fail("STATEMENT_PUBLICATION_BINDING_MISMATCH");
    }
    const responseBytes = strictBase64(bundle.response.utf8Base64,
      "BUNDLE_RESPONSE_BYTES");
    if (bundle.response.byteLength !== responseBytes.length
      || bundle.response.responseHash !== rawHash(responseBytes)) {
      fail("BUNDLE_RESPONSE_BYTE_BINDING_INVALID");
    }
    const responseText = responseBytes.toString("utf8");
    if (!Buffer.from(responseText, "utf8").equals(responseBytes)) {
      fail("BUNDLE_RESPONSE_UTF8_INVALID");
    }
    const facts = verifyRekorP256HashedRekordResponsePrimitiveV1({
      primitive,
      responseText,
      statementCreatedAt: expectedStatement.statementCreatedAt,
      observedAt: time(bundle.observedAt, "BUNDLE_OBSERVED_AT"),
      trustPolicy,
      expectedTrustPolicyHash: context.expectedTrustPolicyHash,
    });
    if (!same(bundle.facts, factsProjection(facts))) fail("BUNDLE_FACTS_MISMATCH");
    const rebuilt = makeBundle({ request, policy: {
      ...policy,
      reusedTrustPolicyHash: trustPolicy.policyHash,
      rekorOrigin: trustPolicy.rekorOrigin,
    }, primitive, responseText, observedAt: bundle.observedAt, facts });
    if (!same(bundle, rebuilt)) fail("BUNDLE_REPLAY_MISMATCH");
    const body = {
      schema:
        OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_SCHEMAS.verification,
      ok: true,
      bundleHash: bundle.bundleHash,
      publicationRequestHash: request.requestHash,
      commitmentHash: request.commitmentHash,
      transportPolicyHash: bundle.transportPolicyHash,
      reusedTrustPolicyHash: trustPolicy.policyHash,
      entryUUID: facts.entryUUID,
      logID: facts.logID,
      logIndex: facts.logIndex,
      integratedTime: facts.integratedTime,
      exactProposalBodyBindingVerified: true,
      operatorP256SignatureVerified: true,
      logKeyEpochPinVerified: true,
      signedEntryTimestampVerified: true,
      rfc6962InclusionProofVerified: true,
      signedCheckpointRootVerified: true,
      exactCommitmentSubjectBindingVerified: true,
      externalInclusionUnderPinnedLogKeyEstablished: true,
      providerAcknowledgementIsAuthority: false,
      providerAcknowledgementIsOutcomeTruth: false,
      independentWitnessEstablished: false,
      externalNonOmissionEstablished: false,
      externalNonEquivocationEstablished: false,
      durableAppendOnlyExternalHistoryEstablished: false,
      authority: "NONE",
      decisionState: "HOLD",
      actionReady: false,
      executable: false,
    };
    return deepFreeze({ ...body, verificationHash: digest("verification", body) });
  } catch (error) {
    return verificationFailure(error);
  }
}

function normalizeConfig(input) {
  exactObject(input, ["rekorOrigin", "trustPolicy", "expectedTrustPolicyHash",
    "operatorPrivateKeyPem", "fetchImpl", "clock"], "CONFIG");
  const trustPolicy = assertNetworkLifecycleRekorTrustPolicy(input.trustPolicy, {
    expectedTrustPolicyHash: input.expectedTrustPolicyHash,
  });
  if (input.rekorOrigin !== trustPolicy.rekorOrigin) fail("REKOR_ORIGIN_PIN_MISMATCH");
  if (typeof input.fetchImpl !== "function" || isProxy(input.fetchImpl)) {
    fail("INJECTED_FETCH_REQUIRED");
  }
  if (typeof input.clock !== "function" || isProxy(input.clock)) {
    fail("INJECTED_CLOCK_REQUIRED");
  }
  return {
    trustPolicy,
    operator: p256Operator(input.operatorPrivateKeyPem),
    fetchImpl: input.fetchImpl,
    clock: input.clock,
  };
}

function publicAdapter(policy, transport) {
  const projection = deepFreeze({
    schema: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_SCHEMAS.adapter,
    transportId: TRANSPORT_ID,
    transportPolicyHash: policy.policyHash,
    rekorOrigin: policy.rekorOrigin,
    reusedTrustPolicyHash: policy.reusedTrustPolicyHash,
    operatorKeyId: policy.operatorKeyId,
    strictPrimitivePredecessorSourceHash:
      STRICT_PRIMITIVE_PREDECESSOR_SOURCE_HASH,
    currentPublicLogKeyHardcodedAsTrust: false,
    operatorPrivateKeyProjected: false,
    rawLedgerProjected: false,
    maximumPostAttempts: 1,
    maximumResponseBytes: MAX_RESPONSE_BYTES,
    authority: "NONE",
    decisionState: "HOLD",
    boundary: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_BOUNDARY,
  });
  return deepFreeze({
    schema: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V1_SCHEMAS.adapter,
    transportId: TRANSPORT_ID,
    transportPolicyHash: policy.policyHash,
    transport,
    publicProjection: projection,
  });
}

export function createRekorDurableEffectHeadTransportV1(input = {}) {
  const config = normalizeConfig(input);
  const policy = policyBody(config.trustPolicy, config.operator);
  const state = { used: false, bundle: null };

  const transport = async (candidate, options = {}) => {
    const request = validatePublicationRequest(candidate, policy);
    const signal = validateOptions(options);
    if (state.used) fail("TRANSPORT_ALREADY_CONSUMED");
    state.used = true;
    const statement = makeStatement(request);
    const primitive = createRekorP256HashedRekordProposalPrimitiveV1({
      statementBytesUtf8: canonicalizeStrict(statement),
      operatorPrivateKeyPem: config.operator.privateKeyPem,
    });
    if (primitive.operator.keyId !== policy.operatorKeyId) {
      fail("OPERATOR_KEY_POLICY_MISMATCH");
    }
    let response;
    try {
      response = await config.fetchImpl(`${policy.rekorOrigin}${CREATE_ENTRY_PATH}`, {
        method: "POST",
        redirect: "error",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: canonicalizeStrict(primitive.proposal),
        signal,
      });
    } catch { fail("POST_FAILED_COMMIT_STATUS_UNKNOWN_NO_RETRY"); }
    let responseText;
    try { responseText = await readRekorCreateEntryResponseTextPrimitiveV1(response); }
    catch { fail("REKOR_RESPONSE_INVALID_NO_RETRY"); }
    const observedAt = observedNow(config.clock);
    const facts = verifyRekorP256HashedRekordResponsePrimitiveV1({
      primitive,
      responseText,
      statementCreatedAt: statement.statementCreatedAt,
      observedAt,
      trustPolicy: config.trustPolicy,
      expectedTrustPolicyHash: config.trustPolicy.policyHash,
    });
    const bundle = makeBundle({ request, policy, primitive, responseText,
      observedAt, facts });
    const verified = verifyRekorDurableEffectHeadBundleV1(bundle, {
      trustPolicy: config.trustPolicy,
      expectedTrustPolicyHash: config.trustPolicy.policyHash,
      expectedTransportPolicyHash: policy.policyHash,
      expectedBundleHash: bundle.bundleHash,
      expectedPublicationRequestHash: request.requestHash,
    });
    if (verified.ok !== true) fail("FINAL_BUNDLE_REPLAY_FAILED");
    state.bundle = bundle;
    return deepFreeze({
      schema:
        OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS
          .transportReceipt,
      status: "APPENDED",
      requestHash: request.requestHash,
      commitmentHash: request.commitmentHash,
      subjectDigestHex: request.subject.digestHex,
      transportId: TRANSPORT_ID,
      transportPolicyHash: policy.policyHash,
      externalSequence: request.externalChainExpectation.expectedSequence,
      previousReceiptHash: request.externalChainExpectation.previousReceiptHash,
      providerReceiptHash: bundle.bundleHash,
      observedAt,
    });
  };

  const adapter = publicAdapter(policy, transport);
  ADAPTER_STATES.set(adapter, state);
  return adapter;
}

export function readCapturedRekorDurableEffectHeadBundleV1(adapter,
  input = {}) {
  exactObject(input, ["expectedBundleHash"], "READ_CAPTURE_INPUT");
  const expected = hash(input.expectedBundleHash, "EXPECTED_BUNDLE_HASH");
  const state = ADAPTER_STATES.get(adapter);
  if (!state || state.bundle === null) fail("CAPTURE_NOT_AVAILABLE");
  if (state.bundle.bundleHash !== expected) fail("CAPTURE_HASH_MISMATCH");
  return state.bundle;
}
