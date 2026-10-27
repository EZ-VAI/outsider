/*
 * Cloudflare Workers KV injected transport for the durable effect-ledger
 * external-head publication seam.
 *
 * A factory seals exactly one account, namespace, KV binding and versioned
 * key.  A valid publication request may cause one KV put followed by one KV
 * get of that same key.  The get must replay the exact canonical bytes that
 * were supplied to put before a persistence observation receipt is returned.
 * No token, URL, fetch, list, delete, retry, mutable current-head key, or
 * arbitrary key input exists here.
 *
 * Workers KV is eventually consistent and has no create-if-absent/CAS
 * primitive.  A resolved put plus exact get is therefore only a persistence
 * observation.  It is not external authority, outcome truth, append-only
 * history, non-omission, non-equivocation, or protection from another writer
 * or a newly constructed adapter overwriting the same key.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS,
} from "./outsider-durable-effect-ledger-external-head-publication-v1.js";

const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectApply = Reflect.apply;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const TextEncoderConstructor = TextEncoder;

const PREFIX = "OUTSIDER_CLOUDFLARE_WORKERS_KV_EXTERNAL_HEAD_TRANSPORT_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const HEX_64 = /^[a-f0-9]{64}$/u;
const CLOUDFLARE_ID = /^[a-f0-9]{32}$/u;
const VERSIONED_KEY
  = /^outsider\/external-head\/v1\/[a-f0-9]{32}\/([0-9]{12})\.json$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const TRANSPORT_ID = "cloudflare.workers-kv.external-head.v1";
const MAX_VALUE_BYTES = 16 * 1024;

export const OUTSIDER_CLOUDFLARE_WORKERS_KV_EXTERNAL_HEAD_TRANSPORT_V1_SCHEMAS
  = ObjectFreeze({
    policy: "outsider/cloudflare-workers-kv-external-head-policy/v1",
    storedObject: "outsider/cloudflare-workers-kv-external-head-object/v1",
    adapter: "outsider/cloudflare-workers-kv-external-head-adapter/v1",
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

export const OUTSIDER_CLOUDFLARE_WORKERS_KV_EXTERNAL_HEAD_TRANSPORT_V1_BOUNDARY
  = deepFreeze({
    position:
      "ONE_PREDECLARED_WORKERS_KV_BINDING_AND_VERSIONED_KEY_PERSISTENCE_OBSERVATION_HOLD_ONLY",
    cloudflarePrimitive: "WORKERS_KV_NAMESPACE_BINDING",
    apiTokenAccepted: false,
    urlOrFetchAccepted: false,
    accountBindingPredeclaredAndSealed: true,
    namespaceBindingPredeclaredAndSealed: true,
    versionedKeyPredeclaredAndSealed: true,
    rawAccountIdProjected: false,
    rawNamespaceIdProjected: false,
    rawKeyProjected: false,
    requestValueContainsOnlyCommitmentMetadata: true,
    maximumPutAttemptsPerAdapter: 1,
    maximumGetAttemptsPerAdapter: 1,
    maximumTotalKvOperationsPerAdapter: 2,
    automaticRetryPermitted: false,
    listPermitted: false,
    deletePermitted: false,
    mutableCurrentHeadKeyPresent: false,
    sameAdapterSecondWritePermitted: false,
    sameKeyDifferentRequestBodyGeneratedByAdapter: false,
    createIfAbsentOrCompareAndSwapAvailable: false,
    absenceBeforePutEstablished: false,
    overwriteByOtherWriterExcluded: false,
    crossProcessOrRestartReuseExcluded: false,
    exactReadAfterWriteBytesRequiredForReceipt: true,
    workersKvStrongReadAfterWriteConsistencyEstablished: false,
    providerCryptographicReceiptVerified: false,
    providerIdentityEstablished: false,
    transportProvenanceEstablished: false,
    persistenceObservationIsAuthority: false,
    persistenceObservationIsOutcomeTruth: false,
    externalAnchorEstablished: false,
    durableExternalHeadEstablished: false,
    durableAppendOnlyExternalHistoryEstablished: false,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    independentWitnessEstablished: false,
    trustedClockEstablished: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach:
      "ONE_PUT_THEN_ONE_GET_OF_ONE_SEALED_WORKERS_KV_VERSIONED_KEY",
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
  return `sha256:${createHash("sha256").update(domain, "utf8")
    .update("\0", "utf8").update(encoded, "utf8").digest("hex")}`;
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

function normalizeConfig(value) {
  if (!plain(value)) fail("CONFIG_OBJECT_INVALID");
  const allowed = ["accountId", "namespaceId", "key", "kvBinding", "clock"];
  const keys = ReflectOwnKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.includes(key))
    || !keys.includes("accountId") || !keys.includes("namespaceId")
    || !keys.includes("key") || !keys.includes("kvBinding")) {
    fail("CONFIG_SHAPE_INVALID");
  }
  if (typeof value.accountId !== "string"
    || !RegExpTest(CLOUDFLARE_ID, value.accountId)) fail("ACCOUNT_ID_INVALID");
  if (typeof value.namespaceId !== "string"
    || !RegExpTest(CLOUDFLARE_ID, value.namespaceId)) fail("NAMESPACE_ID_INVALID");
  const match = typeof value.key === "string"
    ? VERSIONED_KEY.exec(value.key) : null;
  if (!match) fail("VERSIONED_KEY_INVALID");
  const binding = value.kvBinding;
  if (binding === null || (typeof binding !== "object" && typeof binding !== "function")) {
    fail("KV_BINDING_INVALID");
  }
  let put;
  let get;
  try {
    put = binding.put;
    get = binding.get;
  } catch {
    fail("KV_BINDING_INVALID");
  }
  if (typeof put !== "function" || typeof get !== "function") {
    fail("KV_BINDING_INVALID");
  }
  const clock = value.clock === undefined ? () => new Date().toISOString() : value.clock;
  if (typeof clock !== "function") fail("CLOCK_INVALID");
  return {
    accountId: value.accountId,
    namespaceId: value.namespaceId,
    key: value.key,
    keySequence: Number(match[1]),
    binding,
    put,
    get,
    clock,
  };
}

function policyFor(config) {
  const body = {
    schema:
      OUTSIDER_CLOUDFLARE_WORKERS_KV_EXTERNAL_HEAD_TRANSPORT_V1_SCHEMAS.policy,
    provider: "CLOUDFLARE",
    primitive: "WORKERS_KV_NAMESPACE_BINDING",
    accountIdHash: digest("cloudflare-workers-kv-account-id", config.accountId),
    namespaceIdHash: digest("cloudflare-workers-kv-namespace-id",
      config.namespaceId),
    versionedKeyHash: digest("cloudflare-workers-kv-versioned-key", config.key),
    versionedKeySequence: config.keySequence,
    fixedBindingOnly: true,
    maximumPutAttempts: 1,
    maximumGetAttempts: 1,
    automaticRetryPermitted: false,
    deletePermitted: false,
    createIfAbsentOrCompareAndSwapAvailable: false,
    strongReadAfterWriteConsistencyEstablished: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return deepFreeze({ ...body, policyHash: digest(
    "cloudflare-workers-kv-external-head-policy", body) });
}

function assertRequest(value, policy) {
  exactObject(value, ["schema", "requestClass", "publishedAt",
    "publishedAtIsExternalTimeEvidence", "subject", "commitmentHash",
    "transportBinding", "externalChainExpectation", "disclosure",
    "automaticRetryPermitted", "authority", "decisionState", "requestHash"],
  "PUBLICATION_REQUEST");
  exactObject(value.subject, ["kind", "algorithm", "digestHex"],
    "PUBLICATION_REQUEST_SUBJECT");
  exactObject(value.transportBinding, ["transportId", "transportPolicyHash",
    "identityAndTrustEstablishedByIdOrPolicyHash"],
  "PUBLICATION_REQUEST_TRANSPORT_BINDING");
  exactObject(value.externalChainExpectation, ["expectedSequence",
    "previousReceiptHash", "predecessorWasCallerSupplied"],
  "PUBLICATION_REQUEST_CHAIN");
  exactObject(value.disclosure, ["digestOnly", "directoryPathIncluded",
    "rawLedgerIdIncluded", "entryOrEventBytesIncluded",
    "endpointSecretIncluded"], "PUBLICATION_REQUEST_DISCLOSURE");
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
  hash(requestHash, "PUBLICATION_REQUEST_HASH");
  if (requestHash !== digest(
    "durable-effect-ledger-external-head-publication-request", body)) {
    fail("PUBLICATION_REQUEST_HASH_MISMATCH");
  }
  return value;
}

function storedObject(request) {
  const body = {
    schema:
      OUTSIDER_CLOUDFLARE_WORKERS_KV_EXTERNAL_HEAD_TRANSPORT_V1_SCHEMAS
        .storedObject,
    storageClass: "VERSIONED_DIGEST_ONLY_EXTERNAL_HEAD_COMMITMENT",
    requestHash: request.requestHash,
    commitmentHash: request.commitmentHash,
    subjectDigest: {
      algorithm: request.subject.algorithm,
      digestHex: request.subject.digestHex,
    },
    transportPolicyHash: request.transportBinding.transportPolicyHash,
    externalSequence: request.externalChainExpectation.expectedSequence,
    previousReceiptHash: request.externalChainExpectation.previousReceiptHash,
    publishedAt: request.publishedAt,
    disclosure:
      "NO_ACCOUNT_NAMESPACE_KEY_DIRECTORY_LEDGER_ID_ENTRY_EVENT_OR_SECRET_BYTES",
    providerAcknowledgementIsAuthority: false,
    providerAcknowledgementIsOutcomeTruth: false,
    durableAppendOnlyExternalHistoryEstablished: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return deepFreeze({ ...body, objectHash: digest(
    "cloudflare-workers-kv-external-head-object", body) });
}

function abortCheck(options) {
  exactObject(options, ["signal"], "TRANSPORT_OPTIONS");
  if (options.signal === null || typeof options.signal !== "object"
    || typeof options.signal.aborted !== "boolean") fail("ABORT_SIGNAL_INVALID");
  if (options.signal.aborted) fail("ABORTED_BEFORE_KV_OPERATION");
}

function providerReceiptHash(policy, request, valueHash, observedAt) {
  return digest("cloudflare-workers-kv-persistence-observation", {
    requestHash: request.requestHash,
    commitmentHash: request.commitmentHash,
    accountIdHash: policy.accountIdHash,
    namespaceIdHash: policy.namespaceIdHash,
    versionedKeyHash: policy.versionedKeyHash,
    storedValueHash: valueHash,
    observedAt,
    semantics:
      "LOCAL_OBSERVATION_OF_RESOLVED_PUT_AND_ONE_EXACT_GET_NOT_PROVIDER_SIGNATURE",
  });
}

function publicAdapter(policy, transport) {
  const projection = deepFreeze({
    schema:
      OUTSIDER_CLOUDFLARE_WORKERS_KV_EXTERNAL_HEAD_TRANSPORT_V1_SCHEMAS.adapter,
    transportId: TRANSPORT_ID,
    transportPolicyHash: policy.policyHash,
    accountIdHash: policy.accountIdHash,
    namespaceIdHash: policy.namespaceIdHash,
    versionedKeyHash: policy.versionedKeyHash,
    versionedKeySequence: policy.versionedKeySequence,
    rawAccountIdProjected: false,
    rawNamespaceIdProjected: false,
    rawVersionedKeyProjected: false,
    apiTokenAccepted: false,
    maximumPutAttempts: 1,
    maximumGetAttempts: 1,
    authority: "NONE",
    decisionState: "HOLD",
    boundary:
      OUTSIDER_CLOUDFLARE_WORKERS_KV_EXTERNAL_HEAD_TRANSPORT_V1_BOUNDARY,
  });
  return deepFreeze({
    schema:
      OUTSIDER_CLOUDFLARE_WORKERS_KV_EXTERNAL_HEAD_TRANSPORT_V1_SCHEMAS.adapter,
    transportId: TRANSPORT_ID,
    transportPolicyHash: policy.policyHash,
    transport,
    publicProjection: projection,
  });
}

/**
 * Seal one Cloudflare account/namespace/KV binding/versioned-key tuple and
 * return a transport compatible with publishDurableEffectLedgerExternalHeadV1.
 */
export function createCloudflareWorkersKvExternalHeadTransportV1(input = {}) {
  const config = normalizeConfig(input);
  const policy = policyFor(config);
  let used = false;

  const transport = async (candidate, options = {}) => {
    const request = assertRequest(candidate, policy);
    abortCheck(options);
    if (request.externalChainExpectation.expectedSequence !== config.keySequence) {
      fail("VERSIONED_KEY_SEQUENCE_MISMATCH");
    }
    if (used) fail("TRANSPORT_ALREADY_CONSUMED");
    used = true;

    const object = storedObject(request);
    const exactBytes = canonicalizeStrict(object);
    const byteLength = new TextEncoderConstructor().encode(exactBytes).byteLength;
    if (byteLength < 1 || byteLength > MAX_VALUE_BYTES) fail("VALUE_BYTES_INVALID");
    try {
      await ReflectApply(config.put, config.binding, [config.key, exactBytes]);
    } catch {
      fail("PUT_FAILED_COMMIT_STATUS_UNKNOWN_NO_RETRY");
    }
    abortCheck(options);
    let replay;
    try {
      replay = await ReflectApply(config.get, config.binding,
        [config.key, ObjectFreeze({ type: "text" })]);
    } catch {
      fail("GET_FAILED_AFTER_PUT_COMMIT_STATUS_UNKNOWN_NO_RETRY");
    }
    if (typeof replay !== "string" || replay !== exactBytes) {
      fail("GET_EXACT_REPLAY_NOT_OBSERVED_HOLD_NO_RETRY");
    }
    let observedAt;
    try { observedAt = time(config.clock(), "OBSERVED_AT"); }
    catch { fail("OBSERVED_AT_INVALID"); }
    if (Date.parse(observedAt) < Date.parse(request.publishedAt)) {
      fail("OBSERVED_AT_PRECEDES_PUBLICATION");
    }
    const valueHash = digest("cloudflare-workers-kv-stored-value-bytes", exactBytes);
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
      providerReceiptHash: providerReceiptHash(policy, request, valueHash,
        observedAt),
      observedAt,
    });
  };

  return publicAdapter(policy, transport);
}

