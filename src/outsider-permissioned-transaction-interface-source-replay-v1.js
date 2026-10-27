/*
 * Permissioned transaction-interface source replay v1.
 *
 * USER_HELD_MAILBOX_CHALLENGE_REPLY_V1 is a private-source-in, closed-public-
 * projection-out HOLD adapter. It can replay evidence that a caller-supplied
 * mailbox adapter observed an existing user-held transaction surface, emitted
 * one exact one-use tender invitation, received transport acknowledgements,
 * and ingested a finite, challenge-bound reply. It performs no network, DNS,
 * mailbox, browser, filesystem, credential, pricing, payment, or live action.
 *
 * Caller-pinned adapter keys establish only consistency of caller-supplied
 * bytes. They never establish mailbox ownership, recipient identity, resource-
 * owner authority, capacity, delivery, an offer, or permission to act. Only a
 * reply in the newly authored inbound portion matching the finite grammar is
 * joined to an already-existing one-use response lifecycle. SMTP/API ACKs,
 * DKIM, ARC, SPF/DMARC, natural language, vendor claims, and model labels are
 * never converted into an offer.
 */

import {
  createHash,
  createPublicKey,
  verify as cryptoVerify,
} from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";
import { verifyOutcomeResourceRouteDiscoverySnapshotV1 }
  from "./outsider-outcome-resource-route-discovery-v1.js";
import { verifyOneUseTenderResponseLifecycleV1 }
  from "./outsider-one-use-tender-response-lifecycle-v1.js";
import { verifyResourceOwnerStandingTrustReplayV1 }
  from "./outsider-resource-owner-standing-trust-replay-v1.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const BufferByteLength = Buffer.byteLength;
const BufferAlloc = Buffer.alloc;
const BufferEquals = Function.prototype.call.bind(Buffer.prototype.equals);
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferSubarray = Function.prototype.call.bind(Buffer.prototype.subarray);
const BufferToString = Function.prototype.call.bind(Buffer.prototype.toString);
const DateParse = Date.parse;
const DateConstructor = Date;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const JSONParse = JSON.parse;
const MapConstructor = Map;
const MapGet = Function.prototype.call.bind(Map.prototype.get);
const MapHas = Function.prototype.call.bind(Map.prototype.has);
const MapSet = Function.prototype.call.bind(Map.prototype.set);
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectCreate = Object.create;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIs = Object.is;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpExec = Function.prototype.call.bind(RegExp.prototype.exec);
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const SetSize = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(Set.prototype, "size").get);
const StringConstructor = String;
const StringIncludes = Function.prototype.call.bind(String.prototype.includes);
const StringSplit = Function.prototype.call.bind(String.prototype.split);
const StringTrim = Function.prototype.call.bind(String.prototype.trim);
const TypeErrorConstructor = TypeError;
const TypedArrayPrototype = ObjectGetPrototypeOf(Uint8Array.prototype);
const TypedArrayByteLength = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(TypedArrayPrototype, "byteLength").get);
const TypedArraySet = Function.prototype.call.bind(TypedArrayPrototype.set);
const HashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const BUFFER_FORBIDDEN_OWN_KEYS = ObjectFreeze([
  "length", "byteLength", "byteOffset", "buffer", "set", "subarray",
  Symbol.iterator,
]);

const PREFIX = "OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/u;
const CODE = /^[A-Z][A-Z0-9_]{0,31}$/u;
const CHALLENGE = /^[a-f0-9]{64}$/u;
const STRICT_BASE64
  = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

const MAX_SINGLE_SOURCE_BYTES = 1024 * 1024;
const MAX_AGGREGATE_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_SINGLE_STRING_BYTES = 1024 * 1024;
const MAX_AGGREGATE_STRING_BYTES = 48 * 1024 * 1024;
const MAX_ARRAY_LENGTH = 4096;
const MAX_AGGREGATE_ARRAY_ELEMENTS = 100_000;
const MAX_TREE_NODES = 300_000;
const MAX_TREE_KEYS = 900_000;
const MAX_TREE_DEPTH = 96;
const MAX_PERMISSION_EVENTS = 1024;
const MAX_INBOUND_OCCURRENCES = 4096;
const MAX_REPLY_CHOICES = 32;
const MAX_NATURAL_LANGUAGE_BYTES = 64 * 1024;

export const OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
  = ObjectFreeze({
    adapterContext:
      "outsider/permissioned-transaction-interface-adapter-context/v1",
    routeObservation:
      "outsider/permissioned-transaction-interface-route-observation/v1",
    outboundTender:
      "outsider/permissioned-transaction-interface-outbound-one-use-tender/v1",
    sendAcknowledgement:
      "outsider/permissioned-transaction-interface-send-acknowledgement/v1",
    inboundMessage:
      "outsider/permissioned-transaction-interface-inbound-message/v1",
    permissionLifecycleEvent:
      "outsider/permissioned-transaction-interface-permission-event/v1",
    permissionLifecycleHead:
      "outsider/permissioned-transaction-interface-permission-head/v1",
    transportHead:
      "outsider/permissioned-transaction-interface-transport-head/v1",
    responseChoiceSet:
      "outsider/permissioned-transaction-interface-response-choice-set/v1",
    binding:
      "outsider/permissioned-transaction-interface-exact-binding/v1",
    replay:
      "outsider/permissioned-transaction-interface-source-replay/v1",
  });

export const OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_LIMITS
  = ObjectFreeze({
    maximumSingleSourceBytes: MAX_SINGLE_SOURCE_BYTES,
    maximumAggregateSourceBytes: MAX_AGGREGATE_SOURCE_BYTES,
    maximumSingleStringBytes: MAX_SINGLE_STRING_BYTES,
    maximumAggregateStringBytes: MAX_AGGREGATE_STRING_BYTES,
    maximumArrayLength: MAX_ARRAY_LENGTH,
    maximumAggregateArrayElements: MAX_AGGREGATE_ARRAY_ELEMENTS,
    maximumTreeNodes: MAX_TREE_NODES,
    maximumTreeKeys: MAX_TREE_KEYS,
    maximumPermissionEvents: MAX_PERMISSION_EVENTS,
    maximumInboundOccurrences: MAX_INBOUND_OCCURRENCES,
    maximumReplyChoices: MAX_REPLY_CHOICES,
  });

export const OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1
  = "USER_HELD_MAILBOX_CHALLENGE_REPLY_V1";

export const OUTSIDER_PERMISSIONED_TRANSACTION_PERMISSION_EVENT_GENESIS_V1
  = sha256Bytes(BufferFrom(
    "outsider/permissioned-transaction-interface-permission-event/genesis/v1",
    "utf8"));

export const OUTSIDER_PERMISSIONED_TRANSACTION_TRANSPORT_OCCURRENCE_GENESIS_V1
  = sha256Bytes(BufferFrom(
    "outsider/permissioned-transaction-interface-transport-occurrence/genesis/v1",
    "utf8"));

export const OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_BOUNDARY
  = deepFreeze({
    position:
      "SOURCE_DECLARATIONS_REPLAYED_PERMISSIONED_TRANSACTION_INTERFACE_HOLD",
    profile: OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1,
    domainAgnosticTransactionTransport: true,
    providerRegistrationRequired: false,
    outsiderStaffInterventionsAllowed: 0,
    internalHumanFallbackPermitted: false,
    privateRawSourceInputMayContainSensitiveMaterial: true,
    rawSourceBytesProjected: false,
    privateTransportIdentifiersProjected: false,
    sourceVerifierMaterialProjected: false,
    individualPrivateSourceCommitmentsProjected: false,
    saltedAggregatePrivateSourceBundleCommitmentProjected: true,
    credentialLocatorsProjected: false,
    credentialsAcceptedOrHandled: false,
    tokensCookiesOrSessionsAcceptedOrHandled: false,
    exactCanonicalSourceBytesRequired: true,
    exactRfc822SourceBytesRequired: true,
    rawSourceReplayRequiredForVerification: true,
    outputOnlyOrResealedVerificationAccepted: false,
    aggregatePreflightBeforeCryptographyAndDependencyVerification: true,
    appendOnlyPermissionLifecycleRequired: true,
    occurrenceCensusSeparatedFromObjectDedup: true,
    suppliedDenominatorCompletenessOnly: true,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    sourceSignedHeadIsIndependentExternalAnchor: false,
    challengeBoundFiniteReplyGrammarRequired: true,
    quotedOrMetadataChallengeAccepted: false,
    serverAcknowledgementCreatesOffer: false,
    deliveryOrReadReceiptCreatesOffer: false,
    dkimArcSpfDmarcCreatesOffer: false,
    naturalLanguageCreatesOffer: false,
    modelOrVendorClaimCreatesOffer: false,
    structuralSignatureCreatesMailboxOwnership: false,
    structuralSignatureCreatesResourceOwnerIdentity: false,
    structuralSignatureCreatesAuthority: false,
    structuralSignatureCreatesCapacity: false,
    userHeldAuthorizationIndependentlyEstablished: false,
    mailboxOwnershipIndependentlyEstablished: false,
    recipientIdentityIndependentlyEstablished: false,
    deliveryIndependentlyEstablished: false,
    contactabilityIndependentlyEstablished: false,
    resourceOwnerLegalIdentityEstablished: false,
    resourceOwnerStandingEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    sendAuthorized: false,
    providerContactPerformed: false,
    networkRequestPerformed: false,
    liveIoPerformed: false,
    pricePresent: false,
    pricingPermitted: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    authority: "NONE",
    decision: "HOLD",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
  });

const SOURCE_KINDS = ObjectFreeze([
  "ROUTE_OBSERVATION", "OUTBOUND_TENDER", "SEND_ACKNOWLEDGEMENT",
  "INBOUND_MESSAGE", "PERMISSION_EVENT", "PERMISSION_HEAD",
  "TRANSPORT_HEAD",
]);
const PERMISSION_STATES = ObjectFreeze(["GRANTED", "REVOKED", "EXPIRED"]);
const DECLINE_REASONS = ObjectFreeze([
  "NO_CAPACITY", "SCOPE_UNSUPPORTED", "POLICY_DECLINED", "OTHER_DECLARED",
]);
const AUTOMATED_MESSAGE_CLASSES = ObjectFreeze([
  "NONE", "SERVER_ACK", "DELIVERY_STATUS", "READ_RECEIPT", "VACATION_REPLY",
  "AUTOREPLY", "WEBHOOK_ACK", "LIST_REWRITE", "FORWARDED_COPY",
]);
const AUTH_RESULT_STATES = ObjectFreeze([
  "NOT_CHECKED", "PASS", "FAIL", "NEUTRAL", "UNKNOWN",
]);

function fail(code) {
  throw new TypeErrorConstructor(`${PREFIX}${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, writable: true, enumerable: true, configurable: true,
  });
  return array;
}

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || typeof value !== "object" || BufferIsBuffer(value)
    || SetHas(seen, value) || ObjectIsFrozen(value)) return value;
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

function clonePreflight(untrusted) {
  const budget = {
    buffers: 0, bytes: 0, strings: 0, stringBytes: 0,
    arrayElements: 0, nodes: 0, keys: 0,
  };
  const active = new SetConstructor();
  function visit(value, depth) {
    if (depth > MAX_TREE_DEPTH) fail("INPUT_TREE_TOO_DEEP");
    if (typeof value === "string") {
      const bytes = BufferByteLength(value, "utf8");
      budget.strings += 1;
      budget.stringBytes += bytes;
      if (bytes > MAX_SINGLE_STRING_BYTES) fail("STRING_BYTE_LIMIT_EXCEEDED");
      if (budget.stringBytes > MAX_AGGREGATE_STRING_BYTES) {
        fail("AGGREGATE_STRING_BYTE_LIMIT_EXCEEDED");
      }
      return value;
    }
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!NumberIsFinite(value) || ObjectIs(value, -0)) fail("NUMBER_INVALID");
      return value;
    }
    if (typeof value !== "object") fail("INPUT_VALUE_TYPE_FORBIDDEN");
    if (isProxy(value)) fail("PROXY_FORBIDDEN");
    if (SetHas(active, value)) fail("CYCLIC_OBJECT_FORBIDDEN");
    budget.nodes += 1;
    if (budget.nodes > MAX_TREE_NODES) fail("TREE_NODE_LIMIT_EXCEEDED");
    if (BufferIsBuffer(value)) {
      for (let index = 0; index < BUFFER_FORBIDDEN_OWN_KEYS.length; index += 1) {
        if (ObjectGetOwnPropertyDescriptor(value,
          BUFFER_FORBIDDEN_OWN_KEYS[index])) {
          fail("DECORATED_SOURCE_BUFFER_FORBIDDEN");
        }
      }
      const internalLength = TypedArrayByteLength(value);
      budget.buffers += 1;
      budget.bytes += internalLength;
      if (internalLength > MAX_SINGLE_SOURCE_BYTES) {
        fail("SINGLE_SOURCE_BYTE_LIMIT_EXCEEDED");
      }
      if (budget.bytes > MAX_AGGREGATE_SOURCE_BYTES) {
        fail("AGGREGATE_SOURCE_BYTE_LIMIT_EXCEEDED");
      }
      const copy = BufferAlloc(internalLength);
      TypedArraySet(copy, value);
      return copy;
    }
    const prototype = ObjectGetPrototypeOf(value);
    const array = ArrayIsArray(value);
    if (prototype !== (array ? ArrayPrototype : ObjectPrototype)
      && prototype !== null) fail("NON_PLAIN_OBJECT_FORBIDDEN");
    const descriptors = ObjectGetOwnPropertyDescriptors(value);
    const keys = ReflectOwnKeys(descriptors);
    budget.keys += keys.length;
    if (budget.keys > MAX_TREE_KEYS) fail("TREE_KEY_LIMIT_EXCEEDED");
    for (let index = 0; index < keys.length; index += 1) {
      if (typeof keys[index] !== "string") fail("SYMBOL_KEY_FORBIDDEN");
      const descriptor = descriptors[keys[index]];
      if (!descriptor || !ObjectHasOwn(descriptor, "value")) {
        fail("ACCESSOR_FORBIDDEN");
      }
      if (keys[index] === "__proto__" || keys[index] === "prototype"
        || keys[index] === "constructor") fail("DANGEROUS_KEY_FORBIDDEN");
    }
    SetAdd(active, value);
    if (array) {
      if (!NumberIsSafeInteger(value.length) || value.length > MAX_ARRAY_LENGTH) {
        fail("ARRAY_LENGTH_LIMIT_EXCEEDED");
      }
      budget.arrayElements += value.length;
      if (budget.arrayElements > MAX_AGGREGATE_ARRAY_ELEMENTS) {
        fail("AGGREGATE_ARRAY_ELEMENT_LIMIT_EXCEEDED");
      }
      if (keys.length !== value.length + 1 || !ObjectHasOwn(descriptors, "length")) {
        fail("SPARSE_OR_DECORATED_ARRAY_FORBIDDEN");
      }
      const result = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!ObjectHasOwn(descriptors, StringConstructor(index))) {
          fail("SPARSE_ARRAY_FORBIDDEN");
        }
        append(result, visit(descriptors[StringConstructor(index)].value,
          depth + 1));
      }
      SetDelete(active, value);
      return result;
    }
    const result = ObjectCreate(ObjectPrototype);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      ObjectDefineProperty(result, key, {
        value: visit(descriptors[key].value, depth + 1),
        enumerable: true, writable: true, configurable: true,
      });
    }
    SetDelete(active, value);
    return result;
  }
  return { clone: visit(untrusted, 0), budget };
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || BufferIsBuffer(value)) fail(`${code}_OBJECT_REQUIRED`);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  const expected = new SetConstructor(fields);
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== "string" || !SetHas(expected, keys[index])
      || !ObjectHasOwn(descriptors[keys[index]], "value")) {
      fail(`${code}_FIELDS_INVALID`);
    }
  }
  for (let index = 0; index < fields.length; index += 1) {
    if (!ObjectHasOwn(descriptors, fields[index])) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function denseArray(value, code, minimum = 0, maximum = MAX_ARRAY_LENGTH) {
  if (!ArrayIsArray(value) || value.length < minimum || value.length > maximum) {
    fail(`${code}_ARRAY_INVALID`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!ObjectHasOwn(value, index)) fail(`${code}_SPARSE_ARRAY_FORBIDDEN`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function token(value, code) {
  if (typeof value !== "string" || !RegExpTest(TOKEN, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function upperCode(value, code) {
  if (typeof value !== "string" || !RegExpTest(CODE, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function allowed(value, values, code) {
  for (let index = 0; index < values.length; index += 1) {
    if (value === values[index]) return value;
  }
  fail(`${code}_INVALID`);
}

function safeInteger(value, minimum, maximum, code) {
  if (!NumberIsSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)) {
    fail(`${code}_INVALID`);
  }
  const parsed = DateParse(value);
  if (!NumberIsFinite(parsed)
    || DateToISOString(new DateConstructor(parsed)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function sha256Bytes(value) {
  const state = createHash("sha256");
  HashUpdate(state, value);
  return `sha256:${HashDigest(state, "hex")}`;
}

function digest(domain, value) {
  return sha256Bytes(BufferFrom(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function setRoot(domain, values) {
  const rows = [];
  for (let index = 0; index < values.length; index += 1) {
    append(rows, hash(values[index], "SET_ROOT_HASH"));
  }
  ArraySort(rows);
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index] === rows[index - 1]) fail("DUPLICATE_SET_MEMBER");
  }
  return digest(domain, { count: rows.length, hashes: rows });
}

function occurrenceMultisetRoot(domain, values) {
  const rows = [];
  for (let index = 0; index < values.length; index += 1) {
    append(rows, hash(values[index], "OCCURRENCE_MULTISET_HASH"));
  }
  ArraySort(rows);
  return digest(domain, { count: rows.length, hashes: rows });
}

const ADAPTER_CONTEXT_FIELDS = ObjectFreeze([
  "profile", "adapterArtifactHash", "adapterRevisionHash", "sourceSystemId",
  "sourcePublicKeyPem", "expectedSourceKeyId", "sourceTrustPolicyRefHash",
  "rightsPrivacyPolicyRefHash", "issuedAt", "validFrom", "validUntil",
  "maximumLifecycleHeadAgeMs",
]);

function publicKeyMaterial(publicKeyPem, expectedKeyId, code) {
  if (typeof publicKeyPem !== "string"
    || BufferByteLength(publicKeyPem, "utf8") > 16_384) {
    fail(`${code}_PUBLIC_KEY_INVALID`);
  }
  let key;
  try { key = createPublicKey(publicKeyPem); }
  catch { fail(`${code}_PUBLIC_KEY_INVALID`); }
  if (key.asymmetricKeyType !== "ed25519") {
    fail(`${code}_PUBLIC_KEY_NOT_ED25519`);
  }
  const keyId = sha256Bytes(key.export({ type: "spki", format: "der" }));
  if (keyId !== hash(expectedKeyId, `${code}_EXPECTED_KEY_ID`)) {
    fail(`${code}_KEY_ID_MISMATCH`);
  }
  return { key, keyId };
}

function adapterContextData(input) {
  exactObject(input, ADAPTER_CONTEXT_FIELDS, "ADAPTER_CONTEXT");
  if (input.profile !== OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1) {
    fail("ADAPTER_CONTEXT_PROFILE_INVALID");
  }
  const material = publicKeyMaterial(input.sourcePublicKeyPem,
    input.expectedSourceKeyId, "ADAPTER_CONTEXT");
  const issuedAt = instant(input.issuedAt, "ADAPTER_CONTEXT_ISSUED_AT");
  const validFrom = instant(input.validFrom, "ADAPTER_CONTEXT_VALID_FROM");
  const validUntil = instant(input.validUntil, "ADAPTER_CONTEXT_VALID_UNTIL");
  if (DateParse(issuedAt) > DateParse(validFrom)
    || DateParse(validUntil) <= DateParse(validFrom)) {
    fail("ADAPTER_CONTEXT_VALIDITY_INVALID");
  }
  const body = {
    schema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .adapterContext,
    schemaVersion: "1.0.0",
    contextClass:
      "CALLER_PINNED_SOURCE_SPECIFIC_MAILBOX_TRANSPORT_CONTEXT_HOLD_ONLY",
    profile: input.profile,
    adapterArtifactHash: hash(input.adapterArtifactHash,
      "ADAPTER_CONTEXT_ARTIFACT_HASH"),
    adapterRevisionHash: hash(input.adapterRevisionHash,
      "ADAPTER_CONTEXT_REVISION_HASH"),
    sourceSystemId: token(input.sourceSystemId,
      "ADAPTER_CONTEXT_SOURCE_SYSTEM_ID"),
    sourcePublicKeyPem: input.sourcePublicKeyPem,
    sourceKeyId: material.keyId,
    sourceTrustPolicyRefHash: hash(input.sourceTrustPolicyRefHash,
      "ADAPTER_CONTEXT_SOURCE_TRUST_POLICY_REF_HASH"),
    rightsPrivacyPolicyRefHash: hash(input.rightsPrivacyPolicyRefHash,
      "ADAPTER_CONTEXT_RIGHTS_PRIVACY_POLICY_REF_HASH"),
    issuedAt,
    validFrom,
    validUntil,
    maximumLifecycleHeadAgeMs: safeInteger(input.maximumLifecycleHeadAgeMs,
      0, 86_400_000, "ADAPTER_CONTEXT_MAXIMUM_HEAD_AGE_MS"),
    callerPinRequired: true,
    sourceKeyEstablishesMailboxOwnership: false,
    sourceKeyEstablishesRecipientIdentity: false,
    sourceKeyEstablishesResourceOwnerAuthority: false,
    sourceKeyEstablishesCapacity: false,
    liveIoAvailable: false,
    actionReady: false,
    executable: false,
  };
  return { body, material };
}

function checkedAdapterContext(input, expectedHash) {
  const { body, material } = adapterContextData(input);
  const contextHash = digest(
    OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
      .adapterContext, body);
  if (contextHash !== hash(expectedHash, "EXPECTED_ADAPTER_CONTEXT_HASH")) {
    fail("ADAPTER_CONTEXT_HASH_PIN_MISMATCH");
  }
  return { ...body, contextHash, key: material.key };
}

/**
 * Return the commitment a caller must pin for a private adapter context. The
 * context itself (including source system and public key) is never projected.
 */
export function permissionedTransactionInterfaceAdapterContextHashV1(
  untrustedInput = {}) {
  const input = clonePreflight(untrustedInput).clone;
  const { body } = adapterContextData(input);
  return digest(
    OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
      .adapterContext, body);
}

/** Domain-separated exact payload bytes for source-specific test/adapters. */
export function permissionedTransactionInterfaceSourceSigningMessageV1(
  kind, payload) {
  const selected = allowed(kind, SOURCE_KINDS, "SOURCE_KIND");
  canonicalizeStrict(payload);
  return BufferFrom(
    `outsider/permissioned-transaction-interface-source/${selected.toLowerCase()}/v1\0${canonicalizeStrict(payload)}`,
    "utf8");
}

function canonicalEnvelope(bytes, expectedHash, context, kind, code) {
  if (!BufferIsBuffer(bytes) || bytes.length < 2
    || bytes.length > MAX_SINGLE_SOURCE_BYTES) fail(`${code}_BYTES_INVALID`);
  const copy = BufferFrom(bytes);
  const sourceHash = sha256Bytes(copy);
  if (sourceHash !== hash(expectedHash, `${code}_EXPECTED_HASH`)) {
    fail(`${code}_HASH_PIN_MISMATCH`);
  }
  const text = BufferToString(copy, "utf8");
  if (!BufferEquals(BufferFrom(text, "utf8"), copy)) fail(`${code}_UTF8_INVALID`);
  let parsed;
  try { parsed = JSONParse(text); }
  catch { fail(`${code}_JSON_INVALID`); }
  const parsedPreflight = clonePreflight(parsed).clone;
  exactObject(parsedPreflight, ["payload", "signature"], `${code}_ENVELOPE`);
  if (canonicalizeStrict(parsedPreflight) !== text) {
    fail(`${code}_NOT_EXACT_CANONICAL_JSON`);
  }
  const signature = parsedPreflight.signature;
  exactObject(signature, ["algorithm", "keyId", "valueBase64"],
    `${code}_SIGNATURE`);
  if (signature.algorithm !== "ED25519"
    || signature.keyId !== context.sourceKeyId
    || typeof signature.valueBase64 !== "string"
    || !RegExpTest(STRICT_BASE64, signature.valueBase64)) {
    fail(`${code}_SIGNATURE_INVALID`);
  }
  const signatureBytes = BufferFrom(signature.valueBase64, "base64");
  if (signatureBytes.length !== 64
    || BufferToString(signatureBytes, "base64") !== signature.valueBase64
    || !cryptoVerify(null, permissionedTransactionInterfaceSourceSigningMessageV1(
      kind, parsedPreflight.payload), context.key, signatureBytes)) {
    fail(`${code}_SIGNATURE_INVALID`);
  }
  return deepFreeze({ value: parsedPreflight, hash: sourceHash });
}

function contextTime(context, value, code) {
  const at = instant(value, code);
  if (DateParse(at) < DateParse(context.validFrom)
    || DateParse(at) >= DateParse(context.validUntil)) {
    fail(`${code}_OUTSIDE_ADAPTER_CONTEXT`);
  }
  return at;
}

const ROUTE_REPLAY_FIELDS = ObjectFreeze([
  "record", "source", "expectedSnapshotHash",
]);
const OWNER_REPLAY_FIELDS = ObjectFreeze(["source", "expectedReplayHash"]);
const RESPONSE_REPLAY_FIELDS = ObjectFreeze([
  "responses", "occurrences", "expectedOccurrenceCount",
  "expectedLifecycleHeadHash",
]);

function verifiedDependencies(source, observedAt) {
  const tenderCheck = verifyOutsiderOutcomeTenderV1(source.tender, {
    expectedTenderHash: source.expectedTenderHash,
  });
  if (tenderCheck.ok !== true
    || tenderCheck.typedGraphReferencesPreserved !== true
    || tenderCheck.authorizationEstablished !== false
    || tenderCheck.decisionState !== "HOLD") {
    fail("TENDER_SOURCE_REPLAY_FAILED");
  }

  exactObject(source.routeDiscoveryReplay, ROUTE_REPLAY_FIELDS,
    "ROUTE_DISCOVERY_REPLAY");
  const routeCheck = verifyOutcomeResourceRouteDiscoverySnapshotV1(
    source.routeDiscoveryReplay.record, {
      source: source.routeDiscoveryReplay.source,
      expectedSnapshotHash:
        source.routeDiscoveryReplay.expectedSnapshotHash,
    });
  if (routeCheck.ok !== true
    || routeCheck.exactTenderAndRequirementCrossBindingVerified !== true
    || routeCheck.occurrenceCensusVerified !== true
    || routeCheck.objectDedupVerified !== true
    || routeCheck.authority !== "NONE") {
    fail("ROUTE_DISCOVERY_SOURCE_REPLAY_FAILED");
  }
  const routeRecord = source.routeDiscoveryReplay.record;
  if (routeRecord.tenderBinding.tenderHash !== source.tender.tenderHash
    || routeRecord.tenderBinding.workOrderHash !== source.tender.workOrderHash
    || routeRecord.tenderBinding.typedGraphHash
      !== source.tender.typedGraph.typedGraphHash
    || routeRecord.tenderBinding.episodeHash
      !== source.tender.typedGraph.episode.episodeHash
    || routeRecord.tenderBinding.attemptHash
      !== source.tender.typedGraph.attempt.attemptHash) {
    fail("ROUTE_DISCOVERY_TENDER_SPLICE");
  }
  const selectedRouteObjectHash = hash(source.selectedRouteObjectHash,
    "SELECTED_ROUTE_OBJECT_HASH");
  const selectedCandidateHash = hash(source.selectedCandidateHash,
    "SELECTED_CANDIDATE_HASH");
  let selectedObject = null;
  let selectedCandidate = null;
  for (let index = 0; index < routeRecord.routeObjects.length; index += 1) {
    if (routeRecord.routeObjects[index].routeObjectHash
      === selectedRouteObjectHash) selectedObject = routeRecord.routeObjects[index];
  }
  for (let index = 0; index < routeRecord.candidateOccurrences.length;
    index += 1) {
    if (routeRecord.candidateOccurrences[index].candidateHash
      === selectedCandidateHash) {
      selectedCandidate = routeRecord.candidateOccurrences[index];
    }
  }
  if (!selectedObject || !selectedCandidate
    || selectedObject.currentReferenceAvailable !== true
    || selectedObject.currentCandidateHash !== selectedCandidateHash
    || selectedCandidate.routeObject.routeObjectHash !== selectedRouteObjectHash
    || selectedObject.routeKind !== "USER_HELD_ACCOUNT"
    || selectedCandidate.routeKind !== "USER_HELD_ACCOUNT") {
    fail("SELECTED_USER_HELD_ACCOUNT_ROUTE_NOT_CURRENT");
  }

  exactObject(source.oneUseResponseReplay, RESPONSE_REPLAY_FIELDS,
    "ONE_USE_RESPONSE_REPLAY");
  const responseCheck = verifyOneUseTenderResponseLifecycleV1({
    tender: source.tender,
    expectedTenderHash: source.expectedTenderHash,
    responses: source.oneUseResponseReplay.responses,
    occurrences: source.oneUseResponseReplay.occurrences,
    expectedOccurrenceCount:
      source.oneUseResponseReplay.expectedOccurrenceCount,
    expectedLifecycleHeadHash:
      source.oneUseResponseReplay.expectedLifecycleHeadHash,
    observedAt,
  });
  if (responseCheck.ok !== true
    || responseCheck.typedGraphAndEpisodeBoundExactly !== true
    || responseCheck.discoveryRouteObjectHash !== selectedRouteObjectHash
    || responseCheck.discoveryCandidateHash !== selectedCandidateHash
    || responseCheck.capacityReserved !== false
    || responseCheck.authority !== "NONE") {
    fail("ONE_USE_RESPONSE_SOURCE_REPLAY_FAILED");
  }
  if (selectedCandidate.requirementBinding.requirementKind
      !== responseCheck.requirementKind
    || selectedCandidate.requirementBinding.requirementId
      !== responseCheck.requirementId
    || selectedCandidate.requirementBinding.requirementSetHash
      !== responseCheck.requirementSetHash
    || selectedCandidate.requirementBinding.requirementObjectHash
      !== responseCheck.requirementObjectHash) {
    fail("ROUTE_REQUIREMENT_RESPONSE_SPLICE");
  }

  exactObject(source.ownerStandingReplay, OWNER_REPLAY_FIELDS,
    "OWNER_STANDING_REPLAY");
  if (source.ownerStandingReplay.source.observedAt !== observedAt) {
    fail("OWNER_STANDING_OBSERVED_AT_SPLICE");
  }
  const ownerCheck = verifyResourceOwnerStandingTrustReplayV1(
    source.ownerStandingReplay.source,
    source.ownerStandingReplay.expectedReplayHash);
  if (ownerCheck.ok !== true || ownerCheck.rawSourceReplayPerformed !== true
    || ownerCheck.typedGraphPathBoundExactly !== true
    || ownerCheck.tenderHash !== source.tender.tenderHash
    || ownerCheck.typedGraphHash !== source.tender.typedGraph.typedGraphHash
    || ownerCheck.oneUseResponseLifecycleHeadHash
      !== responseCheck.lifecycleHeadHash
    || ownerCheck.oneUseResponseHash !== responseCheck.initialResponseHash
    || ownerCheck.providerRefHash !== responseCheck.providerRefHash
    || ownerCheck.scopeHash !== responseCheck.scopeHash
    || ownerCheck.capacityReserved !== false
    || ownerCheck.authority !== "NONE") {
    fail("OWNER_STANDING_SOURCE_REPLAY_FAILED");
  }
  return { tenderCheck, routeCheck, routeRecord, selectedObject,
    selectedCandidate, responseCheck, ownerCheck };
}

const GRAPH_BINDING_FIELDS = ObjectFreeze([
  "principalEpochProjectionHash", "accountableDeploymentSubjectHash",
  "runtimeInstanceHash", "embodimentRevisionHash", "delegationEdgeHash",
  "episodeHash", "attemptHash",
]);
const REQUIREMENT_BINDING_FIELDS = ObjectFreeze([
  "requirementKind", "requirementId", "requirementSetHash",
  "requirementObjectHash", "requirementClassCode", "requirementScopeRefHash",
  "quantity", "unitCode", "regionRefHash", "dueBy",
  "evidencePlanHash", "remedyPlanHash",
]);
const EXACT_BINDING_FIELDS = ObjectFreeze([
  "schema", "tenderHash", "workOrderHash", "typedGraphHash", "graph",
  "requirement", "routeKind", "routeObjectHash", "currentCandidateHash",
  "transactionSurfaceRefHash", "accountableActorIdentityEnvelopeHash",
  "ownerActorIdentityEnvelopeHash", "resourceOwnerRefHash", "providerRefHash",
]);

function expectedGraphBinding(tender) {
  return {
    principalEpochProjectionHash:
      tender.typedGraph.principalEpoch.principalEpochProjectionHash,
    accountableDeploymentSubjectHash:
      tender.typedGraph.accountableDeployment.accountableDeploymentSubjectHash,
    runtimeInstanceHash: tender.typedGraph.runtime.runtimeInstanceHash,
    embodimentRevisionHash:
      tender.typedGraph.embodiment.embodimentRevisionHash,
    delegationEdgeHash: tender.typedGraph.delegation.delegationEdgeHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
  };
}

function expectedRequirementBinding(response) {
  return {
    requirementKind: response.requirementKind,
    requirementId: response.requirementId,
    requirementSetHash: response.requirementSetHash,
    requirementObjectHash: response.requirementObjectHash,
    requirementClassCode: response.requirementClassCode,
    requirementScopeRefHash: response.requirementScopeRefHash,
    quantity: response.quantity,
    unitCode: response.unitCode,
    regionRefHash: response.regionRefHash,
    dueBy: response.dueBy,
    evidencePlanHash: response.evidencePlanHash,
    remedyPlanHash: response.remedyPlanHash,
  };
}

function expectedBinding(source, dependency) {
  const candidate = dependency.selectedCandidate;
  const response = dependency.responseCheck;
  const owner = dependency.ownerCheck;
  const body = {
    schema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .binding,
    tenderHash: source.tender.tenderHash,
    workOrderHash: source.tender.workOrderHash,
    typedGraphHash: source.tender.typedGraph.typedGraphHash,
    graph: expectedGraphBinding(source.tender),
    requirement: expectedRequirementBinding(response),
    routeKind: "USER_HELD_ACCOUNT",
    routeObjectHash: candidate.routeObject.routeObjectHash,
    currentCandidateHash: candidate.candidateHash,
    transactionSurfaceRefHash:
      candidate.sourceReference.transactionSurfaceRefHash,
    accountableActorIdentityEnvelopeHash:
      owner.accountableActorIdentityEnvelopeHash,
    ownerActorIdentityEnvelopeHash: owner.ownerActorIdentityEnvelopeHash,
    resourceOwnerRefHash: owner.resourceOwnerRefHash,
    providerRefHash: owner.providerRefHash,
  };
  return deepFreeze({ ...body, bindingHash: digest(
    OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
      .binding, body) });
}

function validateGraphBinding(graph, expected) {
  exactObject(graph, GRAPH_BINDING_FIELDS, "GRAPH_BINDING");
  if (!same(graph, expected)) fail("TYPED_GRAPH_PATH_BINDING_SPLICE");
  hash(graph.principalEpochProjectionHash, "GRAPH_PRINCIPAL_EPOCH_HASH");
  hash(graph.accountableDeploymentSubjectHash,
    "GRAPH_ACCOUNTABLE_DEPLOYMENT_HASH");
  hash(graph.runtimeInstanceHash, "GRAPH_RUNTIME_HASH");
  nullableHash(graph.embodimentRevisionHash, "GRAPH_EMBODIMENT_HASH");
  hash(graph.delegationEdgeHash, "GRAPH_DELEGATION_HASH");
  hash(graph.episodeHash, "GRAPH_EPISODE_HASH");
  hash(graph.attemptHash, "GRAPH_ATTEMPT_HASH");
}

function validateRequirementBinding(requirement, expected) {
  exactObject(requirement, REQUIREMENT_BINDING_FIELDS, "REQUIREMENT_BINDING");
  if (!same(requirement, expected)) fail("TENDER_REQUIREMENT_BINDING_SPLICE");
}

function validateBinding(binding, expected) {
  exactObject(binding, [...EXACT_BINDING_FIELDS, "bindingHash"],
    "EXACT_BINDING");
  validateGraphBinding(binding.graph, expected.graph);
  validateRequirementBinding(binding.requirement, expected.requirement);
  if (!same(binding, expected)) fail("EXACT_BINDING_SPLICE");
  if (binding.bindingHash !== expected.bindingHash) fail("BINDING_HASH_SPLICE");
  return binding;
}

const CHOICE_FIELDS = ObjectFreeze([
  "choiceCode", "serviceFrom", "serviceUntil", "expiresAt",
]);

function checkedChoices(value, tender, response) {
  denseArray(value, "RESPONSE_CHOICES", 1, MAX_REPLY_CHOICES);
  const choices = [];
  const seen = new SetConstructor();
  let previous = null;
  for (let index = 0; index < value.length; index += 1) {
    const choice = value[index];
    exactObject(choice, CHOICE_FIELDS, "RESPONSE_CHOICE");
    const choiceCode = upperCode(choice.choiceCode, "RESPONSE_CHOICE_CODE");
    if (SetHas(seen, choiceCode) || (previous !== null
      && previous > choiceCode)) fail("RESPONSE_CHOICES_NOT_SORTED_UNIQUE");
    SetAdd(seen, choiceCode);
    previous = choiceCode;
    const serviceFrom = instant(choice.serviceFrom, "CHOICE_SERVICE_FROM");
    const serviceUntil = instant(choice.serviceUntil, "CHOICE_SERVICE_UNTIL");
    const expiresAt = instant(choice.expiresAt, "CHOICE_EXPIRES_AT");
    if (DateParse(serviceUntil) <= DateParse(serviceFrom)
      || DateParse(serviceUntil) > DateParse(response.dueBy)
      || DateParse(expiresAt) < DateParse(serviceUntil)
      || DateParse(expiresAt) > DateParse(response.dueBy)
      || DateParse(expiresAt) > DateParse(tender.exactOutcome.deadline)) {
      fail("RESPONSE_CHOICE_TIME_INVALID");
    }
    append(choices, { choiceCode, serviceFrom, serviceUntil, expiresAt });
  }
  return deepFreeze({
    choices,
    choiceSetHash: digest(
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .responseChoiceSet, { choices }),
  });
}

function challengeCommitment(challengeToken) {
  if (typeof challengeToken !== "string"
    || !RegExpTest(CHALLENGE, challengeToken)) fail("CHALLENGE_TOKEN_INVALID");
  return digest("outsider/permissioned-transaction-interface-challenge/v1", {
    challengeToken,
  });
}

function outboundTemplateCommitment(binding, privateScope, challengeHash,
  choiceSetHash) {
  return digest(
    "outsider/permissioned-transaction-interface-outbound-template/v1", {
      bindingHash: binding.bindingHash,
      userHeldAccountRefHash: privateScope.userHeldAccountRefHash,
      counterpartyMailboxRefHash: privateScope.counterpartyMailboxRefHash,
      recipientSetCommitmentHash: privateScope.recipientSetCommitmentHash,
      threadRefHash: privateScope.threadRefHash,
      challengeCommitmentHash: challengeHash,
      responseChoiceSetHash: choiceSetHash,
    });
}

const PRIVATE_SCOPE_FIELDS = ObjectFreeze([
  "userHeldAccountRefHash", "counterpartyMailboxRefHash",
  "recipientSetCommitmentHash", "threadRefHash",
]);

function checkedPrivateScope(value, binding) {
  exactObject(value, PRIVATE_SCOPE_FIELDS, "PRIVATE_SCOPE");
  const normalized = {
    userHeldAccountRefHash: hash(value.userHeldAccountRefHash,
      "USER_HELD_ACCOUNT_REF_HASH"),
    counterpartyMailboxRefHash: hash(value.counterpartyMailboxRefHash,
      "COUNTERPARTY_MAILBOX_REF_HASH"),
    recipientSetCommitmentHash: hash(value.recipientSetCommitmentHash,
      "RECIPIENT_SET_COMMITMENT_HASH"),
    threadRefHash: hash(value.threadRefHash, "THREAD_REF_HASH"),
  };
  if (normalized.userHeldAccountRefHash
    !== binding.transactionSurfaceRefHash
    || normalized.userHeldAccountRefHash
      === normalized.counterpartyMailboxRefHash) {
    fail("PRIVATE_SCOPE_ROUTE_OR_COUNTERPARTY_SPLICE");
  }
  return normalized;
}

const PERMISSION_EVENT_FIELDS = ObjectFreeze([
  "schema", "sourceSystemId", "adapterContextHash", "permissionIdHash",
  "ordinal", "previousEventSourceHash", "eventState", "reasonCode",
  "occurredAt", "validUntil", "binding", "privateScope",
  "challengeCommitmentHash", "responseChoiceSetHash",
  "outboundTemplateCommitmentHash", "sendIdempotencyKeyHash", "maxSendCount",
  "allowedOperations", "permissionOccurrenceNonceHash", "objectIdentityHash",
  "occurrenceIdentityHash",
]);
const PERMISSION_HEAD_FIELDS = ObjectFreeze([
  "schema", "sourceSystemId", "adapterContextHash", "permissionIdHash",
  "eventCount", "coveredFromOrdinal", "coveredToOrdinal",
  "headEventSourceHash", "currentState", "currentOccurredAt",
  "permissionObjectIdentityHash", "eventSetRootHash", "observedAt",
  "signedAt", "occurrencePolicy",
]);
const PERMISSION_OPERATIONS = ObjectFreeze([
  "DISCOVER_ROUTE", "EMIT_ONE_USE_TENDER", "INGEST_CHALLENGE_REPLY",
]);

function expectedPermissionObjectIdentity(payload) {
  return digest(
    "outsider/permissioned-transaction-interface-permission-object/v1", {
      adapterContextHash: payload.adapterContextHash,
      permissionIdHash: payload.permissionIdHash,
      bindingHash: payload.binding.bindingHash,
      privateScope: payload.privateScope,
      challengeCommitmentHash: payload.challengeCommitmentHash,
      responseChoiceSetHash: payload.responseChoiceSetHash,
      outboundTemplateCommitmentHash: payload.outboundTemplateCommitmentHash,
      sendIdempotencyKeyHash: payload.sendIdempotencyKeyHash,
      maxSendCount: payload.maxSendCount,
      allowedOperations: payload.allowedOperations,
    });
}

function expectedPermissionOccurrenceIdentity(payload) {
  return digest(
    "outsider/permissioned-transaction-interface-permission-occurrence/v1", {
      permissionIdHash: payload.permissionIdHash,
      ordinal: payload.ordinal,
      previousEventSourceHash: payload.previousEventSourceHash,
      eventState: payload.eventState,
      reasonCode: payload.reasonCode,
      occurredAt: payload.occurredAt,
      validUntil: payload.validUntil,
      permissionOccurrenceNonceHash: payload.permissionOccurrenceNonceHash,
      objectIdentityHash: payload.objectIdentityHash,
    });
}

function verifyPermissionEvent(payload, context, expectedBinding,
  expectedPrivateScope, expectedChallengeHash, expectedChoiceSetHash,
  expectedTemplateHash, expectedOrdinal, expectedPreviousHash,
  previousEvent) {
  exactObject(payload, PERMISSION_EVENT_FIELDS, "PERMISSION_EVENT_PAYLOAD");
  if (payload.schema
      !== OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .permissionLifecycleEvent
    || payload.sourceSystemId !== context.sourceSystemId
    || payload.adapterContextHash !== context.contextHash) {
    fail("PERMISSION_EVENT_CONTEXT_SPLICE");
  }
  hash(payload.permissionIdHash, "PERMISSION_ID_HASH");
  const ordinal = safeInteger(payload.ordinal, 1, MAX_PERMISSION_EVENTS,
    "PERMISSION_EVENT_ORDINAL");
  if (ordinal !== expectedOrdinal
    || payload.previousEventSourceHash !== expectedPreviousHash) {
    fail("PERMISSION_EVENT_APPEND_ONLY_LINK_INVALID");
  }
  validateBinding(payload.binding, expectedBinding);
  const privateScope = checkedPrivateScope(payload.privateScope, expectedBinding);
  if (!same(privateScope, expectedPrivateScope)
    || payload.challengeCommitmentHash !== expectedChallengeHash
    || payload.responseChoiceSetHash !== expectedChoiceSetHash
    || payload.outboundTemplateCommitmentHash !== expectedTemplateHash) {
    fail("PERMISSION_EVENT_SCOPE_SPLICE");
  }
  hash(payload.challengeCommitmentHash, "PERMISSION_CHALLENGE_HASH");
  hash(payload.responseChoiceSetHash, "PERMISSION_CHOICE_SET_HASH");
  hash(payload.outboundTemplateCommitmentHash,
    "PERMISSION_OUTBOUND_TEMPLATE_HASH");
  hash(payload.sendIdempotencyKeyHash, "PERMISSION_SEND_IDEMPOTENCY_HASH");
  if (payload.maxSendCount !== 1
    || !same(payload.allowedOperations, PERMISSION_OPERATIONS)) {
    fail("PERMISSION_OPERATION_SCOPE_INVALID");
  }
  const state = allowed(payload.eventState, PERMISSION_STATES,
    "PERMISSION_EVENT_STATE");
  const occurredAt = contextTime(context, payload.occurredAt,
    "PERMISSION_EVENT_OCCURRED_AT");
  const validUntil = contextTime(context, payload.validUntil,
    "PERMISSION_EVENT_VALID_UNTIL");
  if (DateParse(validUntil) <= DateParse(occurredAt) && state === "GRANTED") {
    fail("PERMISSION_GRANT_VALIDITY_INVALID");
  }
  if (ordinal === 1) {
    if (state !== "GRANTED"
      || payload.previousEventSourceHash
        !== OUTSIDER_PERMISSIONED_TRANSACTION_PERMISSION_EVENT_GENESIS_V1
      || payload.reasonCode !== "USER_SOURCE_DECLARED_PERMISSION") {
      fail("PERMISSION_GENESIS_INVALID");
    }
  } else {
    if (!previousEvent || previousEvent.eventState !== "GRANTED"
      || payload.permissionIdHash !== previousEvent.permissionIdHash
      || payload.validUntil !== previousEvent.validUntil
      || payload.sendIdempotencyKeyHash !== previousEvent.sendIdempotencyKeyHash
      || !same(payload.binding, previousEvent.binding)
      || !same(payload.privateScope, previousEvent.privateScope)
      || !same(payload.allowedOperations, previousEvent.allowedOperations)
      || payload.maxSendCount !== previousEvent.maxSendCount
      || DateParse(occurredAt) < DateParse(previousEvent.occurredAt)) {
      fail("PERMISSION_DESCENDANT_SCOPE_OR_TIME_SPLICE");
    }
    if (state === "REVOKED"
      ? payload.reasonCode !== "USER_SOURCE_DECLARED_REVOCATION"
      : state === "EXPIRED"
        ? payload.reasonCode !== "DECLARED_PERMISSION_WINDOW_EXPIRED"
        : true) fail("PERMISSION_DESCENDANT_STATE_INVALID");
    if (state === "EXPIRED" && DateParse(occurredAt) < DateParse(validUntil)) {
      fail("PERMISSION_EXPIRY_PRECEDES_VALID_UNTIL");
    }
  }
  hash(payload.permissionOccurrenceNonceHash,
    "PERMISSION_OCCURRENCE_NONCE_HASH");
  const objectIdentityHash = expectedPermissionObjectIdentity(payload);
  if (payload.objectIdentityHash !== objectIdentityHash
    || payload.occurrenceIdentityHash
      !== expectedPermissionOccurrenceIdentity(payload)) {
    fail("PERMISSION_IDENTITY_HASH_INVALID");
  }
  return payload;
}

function replayPermissionLifecycle(source, context, expectedBinding,
  privateScope, challengeHash, choiceSetHash, templateHash, observedAt) {
  denseArray(source.permissionLifecycleEventSourceBytes,
    "PERMISSION_EVENT_SOURCE_BYTES", 1, MAX_PERMISSION_EVENTS);
  denseArray(source.expectedPermissionLifecycleEventSourceHashes,
    "EXPECTED_PERMISSION_EVENT_SOURCE_HASHES", 1, MAX_PERMISSION_EVENTS);
  const expectedCount = safeInteger(source.expectedPermissionLifecycleEventCount,
    1, MAX_PERMISSION_EVENTS, "EXPECTED_PERMISSION_EVENT_COUNT");
  if (source.permissionLifecycleEventSourceBytes.length !== expectedCount
    || source.expectedPermissionLifecycleEventSourceHashes.length
      !== expectedCount) fail("PERMISSION_EVENT_DENOMINATOR_MISMATCH");
  const events = [];
  const sourceHashes = [];
  const occurrenceNonces = new SetConstructor();
  let previousHash =
    OUTSIDER_PERMISSIONED_TRANSACTION_PERMISSION_EVENT_GENESIS_V1;
  let previousEvent = null;
  let permissionIdHash = null;
  let permissionObjectIdentityHash = null;
  for (let index = 0; index < expectedCount; index += 1) {
    const envelope = canonicalEnvelope(
      source.permissionLifecycleEventSourceBytes[index],
      source.expectedPermissionLifecycleEventSourceHashes[index], context,
      "PERMISSION_EVENT", `PERMISSION_EVENT_${index + 1}`);
    const event = verifyPermissionEvent(envelope.value.payload, context,
      expectedBinding, privateScope, challengeHash, choiceSetHash, templateHash,
      index + 1, previousHash, previousEvent);
    if (index === 0) {
      permissionIdHash = event.permissionIdHash;
      permissionObjectIdentityHash = event.objectIdentityHash;
    } else if (event.permissionIdHash !== permissionIdHash
      || event.objectIdentityHash !== permissionObjectIdentityHash) {
      fail("PERMISSION_LIFECYCLE_OBJECT_SPLICE");
    }
    if (SetHas(occurrenceNonces, event.permissionOccurrenceNonceHash)) {
      fail("PERMISSION_OCCURRENCE_NONCE_REUSE");
    }
    SetAdd(occurrenceNonces, event.permissionOccurrenceNonceHash);
    append(events, event);
    append(sourceHashes, envelope.hash);
    previousHash = envelope.hash;
    previousEvent = event;
  }
  if (events.length > 2) fail("PERMISSION_TERMINAL_DESCENDANT_REQUIRED_NEW_ID");

  const headEnvelope = canonicalEnvelope(source.permissionLifecycleHeadSourceBytes,
    source.expectedPermissionLifecycleHeadSourceHash, context,
    "PERMISSION_HEAD", "PERMISSION_HEAD");
  const head = headEnvelope.value.payload;
  exactObject(head, PERMISSION_HEAD_FIELDS, "PERMISSION_HEAD_PAYLOAD");
  const signedAt = contextTime(context, head.signedAt,
    "PERMISSION_HEAD_SIGNED_AT");
  const headObservedAt = contextTime(context, head.observedAt,
    "PERMISSION_HEAD_OBSERVED_AT");
  if (head.schema
      !== OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .permissionLifecycleHead
    || head.sourceSystemId !== context.sourceSystemId
    || head.adapterContextHash !== context.contextHash
    || head.permissionIdHash !== permissionIdHash
    || head.eventCount !== expectedCount
    || head.coveredFromOrdinal !== 1 || head.coveredToOrdinal !== expectedCount
    || head.headEventSourceHash !== sourceHashes[sourceHashes.length - 1]
    || head.currentState !== events[events.length - 1].eventState
    || head.currentOccurredAt !== events[events.length - 1].occurredAt
    || head.permissionObjectIdentityHash !== permissionObjectIdentityHash
    || head.eventSetRootHash !== setRoot(
      "outsider/permissioned-transaction-interface-permission-event-set/v1",
      sourceHashes)
    || head.occurrencePolicy
      !== "EVERY_PERMISSION_EVENT_COUNTS_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR") {
    fail("PERMISSION_HEAD_BINDING_INVALID");
  }
  if (DateParse(headObservedAt) < DateParse(events[events.length - 1].occurredAt)
    || DateParse(signedAt) < DateParse(headObservedAt)
    || DateParse(signedAt) > DateParse(observedAt)
    || DateParse(observedAt) - DateParse(signedAt)
      > context.maximumLifecycleHeadAgeMs) {
    fail("PERMISSION_HEAD_TIME_OR_FRESHNESS_INVALID");
  }
  const current = head.currentState === "GRANTED"
    && DateParse(observedAt) < DateParse(events[0].validUntil);
  if (head.currentState === "GRANTED"
    && DateParse(observedAt) >= DateParse(events[0].validUntil)) {
    fail("EXPIRED_PERMISSION_MISSING_APPEND_ONLY_DESCENDANT");
  }
  return { events, sourceHashes, genesisSourceHash: sourceHashes[0],
    permissionIdHash, permissionObjectIdentityHash, current,
    grant: events[0], head, headSourceHash: headEnvelope.hash,
    occurrenceCount: expectedCount, distinctObjectCount: 1 };
}

const COMMON_TRANSPORT_FIELDS = ObjectFreeze([
  "sourceSystemId", "adapterContextHash", "permissionIdHash", "binding",
  "privateScope", "ordinal", "previousTransportOccurrenceHash", "occurredAt",
  "idempotencyKeyHash", "transportOccurrenceNonceHash", "objectIdentityHash",
  "occurrenceIdentityHash",
]);
const ROUTE_OBSERVATION_FIELDS = ObjectFreeze([
  "schema", ...COMMON_TRANSPORT_FIELDS, "routeDiscoverySnapshotHash",
  "selectedRouteOccurrenceHash",
]);
const OUTBOUND_FIELDS = ObjectFreeze([
  "schema", ...COMMON_TRANSPORT_FIELDS, "permissionGenesisSourceHash",
  "routeObservationSourceHash", "challengeToken", "responseChoices",
  "responseChoiceSetHash", "outboundTemplateCommitmentHash", "messageRefHash",
  "senderAccountRefHash", "recipientMailboxRefHash", "threadRefHash",
  "direction", "messageKind", "rfc822SourceHash", "challengeLineOctetStart",
  "challengeLineOctetEnd",
]);
const SEND_ACK_FIELDS = ObjectFreeze([
  "schema", ...COMMON_TRANSPORT_FIELDS, "outboundMessageSourceHash",
  "messageRefHash", "acknowledgementRefHash", "serverStatusCode",
  "serverAcknowledged", "queuedClaimed", "deliveredClaimed", "openedClaimed",
  "readClaimed", "dkimResult", "arcResult", "spfResult", "dmarcResult",
  "messageKind",
]);
const INBOUND_FIELDS = ObjectFreeze([
  "schema", ...COMMON_TRANSPORT_FIELDS, "outboundMessageSourceHash",
  "sendAcknowledgementSourceHash", "messageRefHash", "senderMailboxRefHash",
  "recipientAccountRefHash", "threadRefHash", "direction", "messageKind",
  "automatedMessageClass", "replyPlacement", "machineReplyLine",
  "naturalLanguageBody", "serverAcknowledged", "deliveredClaimed",
  "openedClaimed", "readClaimed", "dkimResult", "arcResult", "spfResult",
  "dmarcResult", "vendorClaimedOffer", "modelLabeledOffer",
  "rfc822SourceHash", "replyLineOctetStart", "replyLineOctetEnd",
]);
const TRANSPORT_HEAD_FIELDS = ObjectFreeze([
  "schema", "sourceSystemId", "adapterContextHash", "permissionIdHash",
  "occurrenceCount", "coveredFromOrdinal", "coveredToOrdinal",
  "headOccurrenceHash", "occurrenceSetRootHash", "objectSetRootHash",
  "distinctObjectCount", "outboundMessageSourceHash",
  "outboundRfc822SourceHash", "sendAcknowledgementSourceHash",
  "inboundMessageSourceSetRootHash", "inboundRfc822SourceSetRootHash",
  "observedAt", "signedAt", "occurrencePolicy",
]);

function checkPermissionAt(permission, occurredAt, code) {
  if (DateParse(occurredAt) < DateParse(permission.grant.occurredAt)
    || DateParse(occurredAt) >= DateParse(permission.grant.validUntil)) {
    fail(`${code}_OUTSIDE_PERMISSION_WINDOW`);
  }
  if (permission.events.length === 2
    && DateParse(permission.events[1].occurredAt) <= DateParse(occurredAt)) {
    fail(`${code}_AFTER_PERMISSION_TERMINATION`);
  }
}

function commonTransport(payload, schema, context, binding, privateScope,
  permission, expectedOrdinal, expectedPreviousHash, code) {
  if (payload.schema !== schema || payload.sourceSystemId !== context.sourceSystemId
    || payload.adapterContextHash !== context.contextHash
    || payload.permissionIdHash !== permission.permissionIdHash) {
    fail(`${code}_CONTEXT_OR_PERMISSION_SPLICE`);
  }
  validateBinding(payload.binding, binding);
  const scope = checkedPrivateScope(payload.privateScope, binding);
  if (!same(scope, privateScope)) fail(`${code}_PRIVATE_SCOPE_SPLICE`);
  const ordinal = safeInteger(payload.ordinal, 1,
    MAX_INBOUND_OCCURRENCES + 3, `${code}_ORDINAL`);
  if (ordinal !== expectedOrdinal
    || payload.previousTransportOccurrenceHash !== expectedPreviousHash) {
    fail(`${code}_APPEND_ONLY_LINK_INVALID`);
  }
  const occurredAt = contextTime(context, payload.occurredAt,
    `${code}_OCCURRED_AT`);
  checkPermissionAt(permission, occurredAt, code);
  hash(payload.idempotencyKeyHash, `${code}_IDEMPOTENCY_KEY_HASH`);
  hash(payload.transportOccurrenceNonceHash, `${code}_OCCURRENCE_NONCE_HASH`);
  hash(payload.objectIdentityHash, `${code}_OBJECT_IDENTITY_HASH`);
  hash(payload.occurrenceIdentityHash, `${code}_OCCURRENCE_IDENTITY_HASH`);
  return occurredAt;
}

function occurrenceIdentity(payload) {
  return digest(
    "outsider/permissioned-transaction-interface-transport-occurrence/v1", {
      permissionIdHash: payload.permissionIdHash,
      ordinal: payload.ordinal,
      previousTransportOccurrenceHash:
        payload.previousTransportOccurrenceHash,
      occurredAt: payload.occurredAt,
      idempotencyKeyHash: payload.idempotencyKeyHash,
      transportOccurrenceNonceHash: payload.transportOccurrenceNonceHash,
      objectIdentityHash: payload.objectIdentityHash,
    });
}

function requireDeclaredIdentities(payload, expectedObjectHash, code) {
  if (payload.objectIdentityHash !== expectedObjectHash
    || payload.occurrenceIdentityHash !== occurrenceIdentity(payload)) {
    fail(`${code}_DECLARED_IDENTITY_HASH_INVALID`);
  }
}

function routeObjectIdentity(payload) {
  return digest(
    "outsider/permissioned-transaction-interface-route-observation-object/v1", {
      permissionIdHash: payload.permissionIdHash,
      bindingHash: payload.binding.bindingHash,
      privateScope: payload.privateScope,
      routeDiscoverySnapshotHash: payload.routeDiscoverySnapshotHash,
      selectedRouteOccurrenceHash: payload.selectedRouteOccurrenceHash,
    });
}

function outboundObjectIdentity(payload) {
  return digest(
    "outsider/permissioned-transaction-interface-outbound-tender-object/v1", {
      permissionIdHash: payload.permissionIdHash,
      bindingHash: payload.binding.bindingHash,
      privateScope: payload.privateScope,
      permissionGenesisSourceHash: payload.permissionGenesisSourceHash,
      routeObservationSourceHash: payload.routeObservationSourceHash,
      challengeToken: payload.challengeToken,
      responseChoices: payload.responseChoices,
      responseChoiceSetHash: payload.responseChoiceSetHash,
      outboundTemplateCommitmentHash: payload.outboundTemplateCommitmentHash,
      messageRefHash: payload.messageRefHash,
      senderAccountRefHash: payload.senderAccountRefHash,
      recipientMailboxRefHash: payload.recipientMailboxRefHash,
      threadRefHash: payload.threadRefHash,
      direction: payload.direction,
      messageKind: payload.messageKind,
      rfc822SourceHash: payload.rfc822SourceHash,
      challengeLineOctetStart: payload.challengeLineOctetStart,
      challengeLineOctetEnd: payload.challengeLineOctetEnd,
    });
}

function sendAckObjectIdentity(payload) {
  return digest(
    "outsider/permissioned-transaction-interface-send-ack-object/v1", {
      permissionIdHash: payload.permissionIdHash,
      bindingHash: payload.binding.bindingHash,
      outboundMessageSourceHash: payload.outboundMessageSourceHash,
      messageRefHash: payload.messageRefHash,
      acknowledgementRefHash: payload.acknowledgementRefHash,
      serverStatusCode: payload.serverStatusCode,
      serverAcknowledged: payload.serverAcknowledged,
      queuedClaimed: payload.queuedClaimed,
      deliveredClaimed: payload.deliveredClaimed,
      openedClaimed: payload.openedClaimed,
      readClaimed: payload.readClaimed,
      dkimResult: payload.dkimResult,
      arcResult: payload.arcResult,
      spfResult: payload.spfResult,
      dmarcResult: payload.dmarcResult,
      messageKind: payload.messageKind,
    });
}

function inboundObjectIdentity(payload) {
  return digest(
    "outsider/permissioned-transaction-interface-inbound-message-object/v1", {
      permissionIdHash: payload.permissionIdHash,
      bindingHash: payload.binding.bindingHash,
      outboundMessageSourceHash: payload.outboundMessageSourceHash,
      sendAcknowledgementSourceHash: payload.sendAcknowledgementSourceHash,
      senderMailboxRefHash: payload.senderMailboxRefHash,
      recipientAccountRefHash: payload.recipientAccountRefHash,
      threadRefHash: payload.threadRefHash,
      direction: payload.direction,
      messageKind: payload.messageKind,
      automatedMessageClass: payload.automatedMessageClass,
      replyPlacement: payload.replyPlacement,
      machineReplyLine: payload.machineReplyLine,
      naturalLanguageBody: payload.naturalLanguageBody,
      serverAcknowledged: payload.serverAcknowledged,
      deliveredClaimed: payload.deliveredClaimed,
      openedClaimed: payload.openedClaimed,
      readClaimed: payload.readClaimed,
      dkimResult: payload.dkimResult,
      arcResult: payload.arcResult,
      spfResult: payload.spfResult,
      dmarcResult: payload.dmarcResult,
      vendorClaimedOffer: payload.vendorClaimedOffer,
      modelLabeledOffer: payload.modelLabeledOffer,
      rfc822SourceHash: payload.rfc822SourceHash,
      replyLineOctetStart: payload.replyLineOctetStart,
      replyLineOctetEnd: payload.replyLineOctetEnd,
    });
}

function pinnedRawBytes(bytes, expectedHash, code) {
  if (!BufferIsBuffer(bytes) || bytes.length < 1
    || bytes.length > MAX_SINGLE_SOURCE_BYTES) fail(`${code}_BYTES_INVALID`);
  const actual = sha256Bytes(bytes);
  if (actual !== hash(expectedHash, `${code}_EXPECTED_HASH`)) {
    fail(`${code}_HASH_PIN_MISMATCH`);
  }
  return { bytes, hash: actual };
}

function exactSingleLineRfc822Body(raw, start, end, expectedLine, code) {
  const from = safeInteger(start, 0, raw.length, `${code}_START`);
  const to = safeInteger(end, 0, raw.length, `${code}_END`);
  let separator = -1;
  let separatorCount = 0;
  for (let index = 0; index + 3 < raw.length; index += 1) {
    if (raw[index] === 13 && raw[index + 1] === 10
      && raw[index + 2] === 13 && raw[index + 3] === 10) {
      if (separator === -1) separator = index;
      separatorCount += 1;
    }
  }
  if (separator <= 0 || separatorCount !== 1 || from !== separator + 4
    || to !== raw.length - 2 || raw[to] !== 13 || raw[to + 1] !== 10) {
    fail(`${code}_RFC822_SINGLE_LINE_BODY_REQUIRED`);
  }
  const headerSlice = BufferSubarray(raw, 0, separator);
  const headerText = BufferToString(headerSlice, "utf8");
  if (!BufferEquals(BufferFrom(headerText, "utf8"), headerSlice)
    || !RegExpTest(/^(?:[A-Za-z0-9-]+:[\x20-\x7e]*(?:\r\n|$))+$/u,
      headerText)
    || RegExpTest(/^(?:Auto-Submitted|X-Autoreply|X-Autorespond|X-Auto-Response-Suppress|List-Id|List-Unsubscribe):/imu,
      headerText)
    || RegExpTest(/^Content-Type:\s*(?:multipart\/report|message\/delivery-status)/imu,
      headerText)
    || RegExpTest(/^Return-Path:\s*<>/imu, headerText)
    || RegExpTest(/^Precedence:\s*(?:bulk|list|junk|auto_reply)/imu,
      headerText)) fail(`${code}_RFC822_HEADERS_INVALID`);
  const headerLines = StringSplit(headerText, "\r\n");
  let contentTypeSeen = false;
  let transferEncodingSeen = false;
  for (let index = 0; index < headerLines.length; index += 1) {
    const line = headerLines[index];
    if (RegExpTest(/^Content-Disposition:/iu, line)) {
      fail(`${code}_RFC822_HEADERS_INVALID`);
    }
    if (RegExpTest(/^Content-Type:/iu, line)) {
      if (contentTypeSeen
        || !RegExpTest(/^Content-Type:[ \t]*text\/plain(?:[ \t]*;[ \t]*charset=(?:"?(?:us-ascii|utf-8)"?))?[ \t]*$/iu,
          line)) fail(`${code}_RFC822_HEADERS_INVALID`);
      contentTypeSeen = true;
    }
    if (RegExpTest(/^Content-Transfer-Encoding:/iu, line)) {
      if (transferEncodingSeen
        || !RegExpTest(/^Content-Transfer-Encoding:[ \t]*7bit[ \t]*$/iu,
          line)) fail(`${code}_RFC822_HEADERS_INVALID`);
      transferEncodingSeen = true;
    }
  }
  const slice = BufferSubarray(raw, from, to);
  const text = BufferToString(slice, "utf8");
  if (!BufferEquals(BufferFrom(text, "utf8"), slice)
    || text !== expectedLine || StringIncludes(text, "\r")
    || StringIncludes(text, "\n")) fail(`${code}_RFC822_LINE_MISMATCH`);
}

function validateAuthSignals(payload, code) {
  if (typeof payload.serverAcknowledged !== "boolean"
    || typeof payload.deliveredClaimed !== "boolean"
    || typeof payload.openedClaimed !== "boolean"
    || typeof payload.readClaimed !== "boolean") {
    fail(`${code}_ACK_SIGNAL_INVALID`);
  }
  allowed(payload.dkimResult, AUTH_RESULT_STATES, `${code}_DKIM_RESULT`);
  allowed(payload.arcResult, AUTH_RESULT_STATES, `${code}_ARC_RESULT`);
  allowed(payload.spfResult, AUTH_RESULT_STATES, `${code}_SPF_RESULT`);
  allowed(payload.dmarcResult, AUTH_RESULT_STATES, `${code}_DMARC_RESULT`);
}

function parseReplyLine(line, placement, automatedClass, challengeToken,
  choices) {
  if (placement !== "NEWLY_AUTHORED_PLAIN_TEXT_SINGLE_LINE"
    || automatedClass !== "NONE" || typeof line !== "string"
    || line.length > 256 || StringTrim(line) !== line
    || StringIncludes(line, "\n") || StringIncludes(line, "\r")) return null;
  const offered = RegExpExec(
    /^OUTSIDER_REPLY_V1 OFFERED ([A-Z][A-Z0-9_]{0,31}) ([a-f0-9]{64})$/u,
    line);
  if (offered) {
    if (offered[2] !== challengeToken) return null;
    let selected = null;
    for (let index = 0; index < choices.length; index += 1) {
      if (choices[index].choiceCode === offered[1]) selected = choices[index];
    }
    if (!selected) return null;
    return { responseState: "OFFERED", reasonCode: "ONE_USE_OFFER_CREATED",
      choiceCode: selected.choiceCode, serviceFrom: selected.serviceFrom,
      serviceUntil: selected.serviceUntil, expiresAt: selected.expiresAt };
  }
  const declined = RegExpExec(
    /^OUTSIDER_REPLY_V1 DECLINED (NO_CAPACITY|SCOPE_UNSUPPORTED|POLICY_DECLINED|OTHER_DECLARED) ([a-f0-9]{64})$/u,
    line);
  if (!declined || declined[2] !== challengeToken) return null;
  allowed(declined[1], DECLINE_REASONS, "REPLY_DECLINE_REASON");
  return { responseState: "DECLINED", reasonCode: declined[1],
    choiceCode: null, serviceFrom: choices[0].serviceFrom,
    serviceUntil: choices[0].serviceUntil, expiresAt: choices[0].expiresAt };
}

/** Exact nonce commitment expected by the existing one-use response contract. */
export function permissionedTransactionChallengeResponseNonceHashV1(input = {}) {
  const checked = clonePreflight(input).clone;
  exactObject(checked, ["challengeCommitmentHash", "tenderHash",
    "routeObjectHash", "candidateHash", "providerRefHash", "responseState",
    "reasonCode", "choiceCode"], "CHALLENGE_RESPONSE_NONCE_INPUT");
  return digest(
    "outsider/permissioned-transaction-interface-challenge-response-nonce/v1", {
      challengeCommitmentHash: hash(checked.challengeCommitmentHash,
        "NONCE_CHALLENGE_HASH"),
      tenderHash: hash(checked.tenderHash, "NONCE_TENDER_HASH"),
      routeObjectHash: hash(checked.routeObjectHash, "NONCE_ROUTE_HASH"),
      candidateHash: hash(checked.candidateHash, "NONCE_CANDIDATE_HASH"),
      providerRefHash: hash(checked.providerRefHash, "NONCE_PROVIDER_HASH"),
      responseState: allowed(checked.responseState, ["OFFERED", "DECLINED"],
        "NONCE_RESPONSE_STATE"),
      reasonCode: upperCode(checked.reasonCode, "NONCE_REASON_CODE"),
      choiceCode: checked.choiceCode === null ? null
        : upperCode(checked.choiceCode, "NONCE_CHOICE_CODE"),
    });
}

function addTransportOccurrence(state, payload, sourceHash, code) {
  if (SetHas(state.occurrenceNonces, payload.transportOccurrenceNonceHash)) {
    fail("TRANSPORT_OCCURRENCE_NONCE_REUSE");
  }
  SetAdd(state.occurrenceNonces, payload.transportOccurrenceNonceHash);
  if (SetHas(state.sourceHashes, sourceHash)) {
    fail("TRANSPORT_SOURCE_OCCURRENCE_REPLAY");
  }
  SetAdd(state.sourceHashes, sourceHash);
  if (MapHas(state.idempotencyObjects, payload.idempotencyKeyHash)) {
    if (MapGet(state.idempotencyObjects, payload.idempotencyKeyHash)
      !== payload.objectIdentityHash) fail("IDEMPOTENCY_KEY_OBJECT_CONFLICT");
  } else {
    MapSet(state.idempotencyObjects, payload.idempotencyKeyHash,
      payload.objectIdentityHash);
  }
  if (state.previousOccurredAt !== null
    && DateParse(payload.occurredAt) < DateParse(state.previousOccurredAt)) {
    fail(`${code}_TRANSPORT_TIME_ROLLBACK`);
  }
  state.previousOccurredAt = payload.occurredAt;
  state.previousOccurrenceHash = payload.occurrenceIdentityHash;
  append(state.occurrenceHashes, payload.occurrenceIdentityHash);
  append(state.sourceHashList, sourceHash);
  if (!SetHas(state.objectHashes, payload.objectIdentityHash)) {
    SetAdd(state.objectHashes, payload.objectIdentityHash);
    append(state.objectHashList, payload.objectIdentityHash);
  }
}

function replayTransport(source, context, binding, privateScope, permission,
  routeEnvelope, outboundEnvelope, choices, challengeHash, templateHash,
  observedAt, selectedCandidate, outboundRaw) {
  const state = {
    previousOccurrenceHash:
      OUTSIDER_PERMISSIONED_TRANSACTION_TRANSPORT_OCCURRENCE_GENESIS_V1,
    previousOccurredAt: null,
    occurrenceNonces: new SetConstructor(),
    sourceHashes: new SetConstructor(),
    idempotencyObjects: new MapConstructor(),
    objectHashes: new SetConstructor(),
    occurrenceHashes: [], sourceHashList: [], objectHashList: [],
  };

  const route = routeEnvelope.value.payload;
  const routeSnapshotAsOf = instant(source.routeDiscoveryReplay.record.asOf,
    "ROUTE_DISCOVERY_SNAPSHOT_AS_OF");
  exactObject(route, ROUTE_OBSERVATION_FIELDS, "ROUTE_OBSERVATION_PAYLOAD");
  commonTransport(route,
    OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
      .routeObservation, context, binding, privateScope, permission, 1,
    state.previousOccurrenceHash, "ROUTE_OBSERVATION");
  if (route.routeDiscoverySnapshotHash
      !== source.routeDiscoveryReplay.expectedSnapshotHash
    || route.selectedRouteOccurrenceHash
      !== selectedCandidate.routeOccurrence.occurrenceHash
    || route.occurredAt !== routeSnapshotAsOf
    || (selectedCandidate.lifecycle.revokedAt !== null
      && DateParse(route.occurredAt)
        >= DateParse(selectedCandidate.lifecycle.revokedAt))) {
    fail("ROUTE_OBSERVATION_DISCOVERY_SPLICE");
  }
  requireDeclaredIdentities(route, routeObjectIdentity(route),
    "ROUTE_OBSERVATION");
  addTransportOccurrence(state, route, routeEnvelope.hash,
    "ROUTE_OBSERVATION");

  const outbound = outboundEnvelope.value.payload;
  exactObject(outbound, OUTBOUND_FIELDS, "OUTBOUND_TENDER_PAYLOAD");
  commonTransport(outbound,
    OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
      .outboundTender, context, binding, privateScope, permission, 2,
    state.previousOccurrenceHash, "OUTBOUND_TENDER");
  const checkedOutboundChoices = checkedChoices(outbound.responseChoices,
    source.tender, source.oneUseResponseReplay.responses[0]);
  if (outbound.permissionGenesisSourceHash !== permission.genesisSourceHash
    || outbound.routeObservationSourceHash !== routeEnvelope.hash
    || challengeCommitment(outbound.challengeToken) !== challengeHash
    || checkedOutboundChoices.choiceSetHash !== choices.choiceSetHash
    || !same(checkedOutboundChoices.choices, choices.choices)
    || outbound.responseChoiceSetHash !== choices.choiceSetHash
    || outbound.outboundTemplateCommitmentHash !== templateHash
    || outbound.idempotencyKeyHash !== permission.grant.sendIdempotencyKeyHash
    || outbound.senderAccountRefHash !== privateScope.userHeldAccountRefHash
    || outbound.recipientMailboxRefHash
      !== privateScope.counterpartyMailboxRefHash
    || outbound.threadRefHash !== privateScope.threadRefHash
    || outbound.direction !== "OUTBOUND"
    || outbound.messageKind !== "ONE_USE_TENDER_INVITATION"
    || outbound.rfc822SourceHash !== outboundRaw.hash
    || DateParse(outbound.occurredAt) > DateParse(observedAt)
    || DateParse(outbound.occurredAt)
      >= DateParse(selectedCandidate.routeOccurrence.validUntil)
    || (selectedCandidate.lifecycle.revokedAt !== null
      && DateParse(outbound.occurredAt)
        >= DateParse(selectedCandidate.lifecycle.revokedAt))) {
    fail("OUTBOUND_TENDER_SCOPE_OR_TEMPLATE_SPLICE");
  }
  exactSingleLineRfc822Body(outboundRaw.bytes, outbound.challengeLineOctetStart,
    outbound.challengeLineOctetEnd,
    `OUTSIDER_CHALLENGE_V1 ${outbound.challengeToken} ${choices.choiceSetHash}`,
    "OUTBOUND_CHALLENGE_LINE");
  hash(outbound.messageRefHash, "OUTBOUND_MESSAGE_REF_HASH");
  requireDeclaredIdentities(outbound, outboundObjectIdentity(outbound),
    "OUTBOUND_TENDER");
  addTransportOccurrence(state, outbound, outboundEnvelope.hash,
    "OUTBOUND_TENDER");

  const ackEnvelope = canonicalEnvelope(
    source.sendAcknowledgementSourceBytes,
    source.expectedSendAcknowledgementSourceHash, context,
    "SEND_ACKNOWLEDGEMENT", "SEND_ACKNOWLEDGEMENT");
  const ack = ackEnvelope.value.payload;
  exactObject(ack, SEND_ACK_FIELDS, "SEND_ACKNOWLEDGEMENT_PAYLOAD");
  commonTransport(ack,
    OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
      .sendAcknowledgement, context, binding, privateScope, permission, 3,
    state.previousOccurrenceHash, "SEND_ACKNOWLEDGEMENT");
  if (ack.outboundMessageSourceHash !== outboundEnvelope.hash
    || ack.messageRefHash !== outbound.messageRefHash
    || ack.messageKind !== "TRANSPORT_ACK_ONLY") {
    fail("SEND_ACKNOWLEDGEMENT_OUTBOUND_SPLICE");
  }
  hash(ack.acknowledgementRefHash, "ACKNOWLEDGEMENT_REF_HASH");
  token(ack.serverStatusCode, "SERVER_STATUS_CODE");
  if (typeof ack.serverAcknowledged !== "boolean"
    || typeof ack.queuedClaimed !== "boolean") {
    fail("SEND_ACKNOWLEDGEMENT_SIGNAL_INVALID");
  }
  validateAuthSignals(ack, "SEND_ACKNOWLEDGEMENT");
  requireDeclaredIdentities(ack, sendAckObjectIdentity(ack),
    "SEND_ACKNOWLEDGEMENT");
  addTransportOccurrence(state, ack, ackEnvelope.hash,
    "SEND_ACKNOWLEDGEMENT");

  denseArray(source.inboundMessageSourceBytes, "INBOUND_MESSAGE_SOURCE_BYTES",
    1, MAX_INBOUND_OCCURRENCES);
  denseArray(source.expectedInboundMessageSourceHashes,
    "EXPECTED_INBOUND_MESSAGE_SOURCE_HASHES", 1, MAX_INBOUND_OCCURRENCES);
  const inboundCount = safeInteger(source.expectedInboundMessageOccurrenceCount,
    1, MAX_INBOUND_OCCURRENCES,
    "EXPECTED_INBOUND_MESSAGE_OCCURRENCE_COUNT");
  if (source.inboundMessageSourceBytes.length !== inboundCount
    || source.expectedInboundMessageSourceHashes.length !== inboundCount) {
    fail("INBOUND_MESSAGE_OCCURRENCE_DENOMINATOR_MISMATCH");
  }
  denseArray(source.inboundRfc822Bytes, "INBOUND_RFC822_BYTES",
    1, MAX_INBOUND_OCCURRENCES);
  denseArray(source.expectedInboundRfc822Hashes,
    "EXPECTED_INBOUND_RFC822_HASHES", 1, MAX_INBOUND_OCCURRENCES);
  if (source.inboundRfc822Bytes.length !== inboundCount
    || source.expectedInboundRfc822Hashes.length !== inboundCount) {
    fail("INBOUND_RFC822_DENOMINATOR_MISMATCH");
  }
  const inboundSourceHashes = [];
  const inboundRfc822Hashes = [];
  const strict = [];
  let responseSemanticHash = null;
  for (let index = 0; index < inboundCount; index += 1) {
    const envelope = canonicalEnvelope(source.inboundMessageSourceBytes[index],
      source.expectedInboundMessageSourceHashes[index], context,
      "INBOUND_MESSAGE", `INBOUND_MESSAGE_${index + 1}`);
    const inbound = envelope.value.payload;
    const inboundRaw = pinnedRawBytes(source.inboundRfc822Bytes[index],
      source.expectedInboundRfc822Hashes[index], `INBOUND_RFC822_${index + 1}`);
    exactObject(inbound, INBOUND_FIELDS, "INBOUND_MESSAGE_PAYLOAD");
    commonTransport(inbound,
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .inboundMessage, context, binding, privateScope, permission, index + 4,
      state.previousOccurrenceHash, "INBOUND_MESSAGE");
    if (inbound.outboundMessageSourceHash !== outboundEnvelope.hash
      || inbound.sendAcknowledgementSourceHash !== ackEnvelope.hash
      || inbound.senderMailboxRefHash
        !== privateScope.counterpartyMailboxRefHash
      || inbound.recipientAccountRefHash !== privateScope.userHeldAccountRefHash
      || inbound.threadRefHash !== privateScope.threadRefHash
      || inbound.direction !== "INBOUND"
      || inbound.messageKind !== "COUNTERPARTY_REPLY_OBSERVATION"
      || inbound.rfc822SourceHash !== inboundRaw.hash) {
      fail("INBOUND_MESSAGE_SCOPE_OR_DIRECTION_SPLICE");
    }
    hash(inbound.messageRefHash, "INBOUND_MESSAGE_REF_HASH");
    allowed(inbound.automatedMessageClass, AUTOMATED_MESSAGE_CLASSES,
      "INBOUND_AUTOMATED_MESSAGE_CLASS");
    allowed(inbound.replyPlacement, [
      "NEWLY_AUTHORED_PLAIN_TEXT_SINGLE_LINE", "QUOTED_OR_METADATA_ONLY",
      "NO_MACHINE_REPLY_PRESENT",
    ], "INBOUND_REPLY_PLACEMENT");
    if (inbound.machineReplyLine !== null
      && (typeof inbound.machineReplyLine !== "string"
        || BufferByteLength(inbound.machineReplyLine, "utf8") > 1024)) {
      fail("INBOUND_MACHINE_REPLY_LINE_INVALID");
    }
    if (inbound.replyPlacement === "NEWLY_AUTHORED_PLAIN_TEXT_SINGLE_LINE") {
      if (inbound.machineReplyLine === null
        || inbound.replyLineOctetStart === null
        || inbound.replyLineOctetEnd === null) {
        fail("INBOUND_NEW_REPLY_RANGE_REQUIRED");
      }
      exactSingleLineRfc822Body(inboundRaw.bytes, inbound.replyLineOctetStart,
        inbound.replyLineOctetEnd, inbound.machineReplyLine,
        "INBOUND_REPLY_LINE");
    } else if (inbound.replyLineOctetStart !== null
      || inbound.replyLineOctetEnd !== null
      || inbound.machineReplyLine !== null) {
      fail("INBOUND_NON_NEW_REPLY_RANGE_FORBIDDEN");
    }
    if (typeof inbound.naturalLanguageBody !== "string"
      || BufferByteLength(inbound.naturalLanguageBody, "utf8")
        > MAX_NATURAL_LANGUAGE_BYTES
      || typeof inbound.vendorClaimedOffer !== "boolean"
      || typeof inbound.modelLabeledOffer !== "boolean") {
      fail("INBOUND_NONAUTHORITATIVE_ASSERTION_FIELDS_INVALID");
    }
    validateAuthSignals(inbound, "INBOUND_MESSAGE");
    requireDeclaredIdentities(inbound, inboundObjectIdentity(inbound),
      "INBOUND_MESSAGE");
    addTransportOccurrence(state, inbound, envelope.hash, "INBOUND_MESSAGE");
    append(inboundSourceHashes, envelope.hash);
    append(inboundRfc822Hashes, inboundRaw.hash);
    const parsed = parseReplyLine(inbound.machineReplyLine,
      inbound.replyPlacement, inbound.automatedMessageClass,
      outbound.challengeToken, choices.choices);
    if (parsed !== null) {
      if (DateParse(inbound.occurredAt) >= DateParse(parsed.expiresAt)) {
        fail("CHALLENGE_BOUND_REPLY_EXPIRED");
      }
      const semantic = digest(
        "outsider/permissioned-transaction-interface-strict-reply/v1", {
          bindingHash: binding.bindingHash,
          challengeCommitmentHash: challengeHash,
          ...parsed,
        });
      if (responseSemanticHash !== null && responseSemanticHash !== semantic) {
        fail("CHALLENGE_NONCE_REUSED_FOR_DIFFERENT_RESPONSE");
      }
      responseSemanticHash = semantic;
      append(strict, { parsed, occurredAt: inbound.occurredAt,
        sourceHash: envelope.hash, idempotencyKeyHash: inbound.idempotencyKeyHash,
        objectIdentityHash: inbound.objectIdentityHash });
    }
  }
  if (strict.length < 1) fail("STRICT_CHALLENGE_BOUND_REPLY_MISSING");

  const initialResponse = source.oneUseResponseReplay.responses[0];
  const parsed = strict[0].parsed;
  const expectedResponseNonceHash
    = permissionedTransactionChallengeResponseNonceHashV1({
      challengeCommitmentHash: challengeHash,
      tenderHash: binding.tenderHash,
      routeObjectHash: binding.routeObjectHash,
      candidateHash: binding.currentCandidateHash,
      providerRefHash: binding.providerRefHash,
      responseState: parsed.responseState,
      reasonCode: parsed.reasonCode,
      choiceCode: parsed.choiceCode,
    });
  if (initialResponse.responseState !== parsed.responseState
    || initialResponse.reasonCode !== parsed.reasonCode
    || initialResponse.serviceFrom !== parsed.serviceFrom
    || initialResponse.serviceUntil !== parsed.serviceUntil
    || initialResponse.expiresAt !== parsed.expiresAt
    || initialResponse.stateAt !== strict[0].occurredAt
    || initialResponse.responseNonceHash !== expectedResponseNonceHash
    || initialResponse.sourceResponseRefHash !== strict[0].sourceHash) {
    fail("STRICT_REPLY_ONE_USE_RESPONSE_BINDING_INVALID");
  }
  let initialOccurrenceCount = 0;
  for (let index = 0; index < source.oneUseResponseReplay.occurrences.length;
    index += 1) {
    if (source.oneUseResponseReplay.occurrences[index].responseHash
      === initialResponse.responseHash) initialOccurrenceCount += 1;
    else break;
  }
  if (initialOccurrenceCount !== strict.length) {
    fail("STRICT_REPLY_RESPONSE_OCCURRENCE_DENOMINATOR_SPLICE");
  }
  for (let index = 0; index < initialOccurrenceCount; index += 1) {
    const occurrence = source.oneUseResponseReplay.occurrences[index];
    if (occurrence.responseHash !== initialResponse.responseHash
      || occurrence.recordedAt !== strict[index].occurredAt) {
      fail("STRICT_REPLY_RESPONSE_OCCURRENCE_CENSUS_SPLICE");
    }
  }

  const expectedTransportCount = safeInteger(
    source.expectedTransportOccurrenceCount, 4,
    MAX_INBOUND_OCCURRENCES + 3, "EXPECTED_TRANSPORT_OCCURRENCE_COUNT");
  if (expectedTransportCount !== inboundCount + 3
    || state.occurrenceHashes.length !== expectedTransportCount) {
    fail("TRANSPORT_OCCURRENCE_DENOMINATOR_MISMATCH");
  }
  const headEnvelope = canonicalEnvelope(source.transportHeadSourceBytes,
    source.expectedTransportHeadSourceHash, context, "TRANSPORT_HEAD",
    "TRANSPORT_HEAD");
  const head = headEnvelope.value.payload;
  exactObject(head, TRANSPORT_HEAD_FIELDS, "TRANSPORT_HEAD_PAYLOAD");
  const signedAt = contextTime(context, head.signedAt,
    "TRANSPORT_HEAD_SIGNED_AT");
  const headObservedAt = contextTime(context, head.observedAt,
    "TRANSPORT_HEAD_OBSERVED_AT");
  if (head.schema
      !== OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .transportHead
    || head.sourceSystemId !== context.sourceSystemId
    || head.adapterContextHash !== context.contextHash
    || head.permissionIdHash !== permission.permissionIdHash
    || head.occurrenceCount !== expectedTransportCount
    || head.coveredFromOrdinal !== 1
    || head.coveredToOrdinal !== expectedTransportCount
    || head.headOccurrenceHash !== state.previousOccurrenceHash
    || head.occurrenceSetRootHash !== setRoot(
      "outsider/permissioned-transaction-interface-transport-occurrence-set/v1",
      state.occurrenceHashes)
    || head.objectSetRootHash !== setRoot(
      "outsider/permissioned-transaction-interface-transport-object-set/v1",
      state.objectHashList)
    || head.distinctObjectCount !== state.objectHashList.length
    || head.outboundMessageSourceHash !== outboundEnvelope.hash
    || head.outboundRfc822SourceHash !== outboundRaw.hash
    || head.sendAcknowledgementSourceHash !== ackEnvelope.hash
    || head.inboundMessageSourceSetRootHash !== setRoot(
      "outsider/permissioned-transaction-interface-inbound-source-set/v1",
      inboundSourceHashes)
    || head.inboundRfc822SourceSetRootHash !== occurrenceMultisetRoot(
      "outsider/permissioned-transaction-interface-inbound-rfc822-set/v1",
      inboundRfc822Hashes)
    || head.occurrencePolicy
      !== "EVERY_TRANSPORT_OCCURRENCE_COUNTS_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR") {
    fail("TRANSPORT_HEAD_BINDING_INVALID");
  }
  if (DateParse(headObservedAt) < DateParse(state.previousOccurredAt)
    || DateParse(signedAt) < DateParse(headObservedAt)
    || DateParse(signedAt) > DateParse(observedAt)
    || DateParse(observedAt) - DateParse(signedAt)
      > context.maximumLifecycleHeadAgeMs) {
    fail("TRANSPORT_HEAD_TIME_OR_FRESHNESS_INVALID");
  }
  return {
    route, outbound, ack, strict, inboundCount, inboundSourceHashes,
    inboundRfc822Hashes,
    responseSemanticHash, occurrenceCount: expectedTransportCount,
    distinctObjectCount: state.objectHashList.length,
    occurrenceHeadHash: state.previousOccurrenceHash,
    occurrenceSetRootHash: head.occurrenceSetRootHash,
    objectSetRootHash: head.objectSetRootHash,
    headSourceHash: headEnvelope.hash,
  };
}

const SOURCE_FIELDS = ObjectFreeze([
  "tender", "expectedTenderHash", "routeDiscoveryReplay",
  "selectedRouteObjectHash", "selectedCandidateHash", "ownerStandingReplay",
  "oneUseResponseReplay", "adapterContext", "expectedAdapterContextHash",
  "permissionLifecycleEventSourceBytes",
  "expectedPermissionLifecycleEventSourceHashes",
  "expectedPermissionLifecycleEventCount", "permissionLifecycleHeadSourceBytes",
  "expectedPermissionLifecycleHeadSourceHash", "routeObservationSourceBytes",
  "expectedRouteObservationSourceHash", "outboundMessageSourceBytes",
  "expectedOutboundMessageSourceHash", "outboundRfc822Bytes",
  "expectedOutboundRfc822Hash", "sendAcknowledgementSourceBytes",
  "expectedSendAcknowledgementSourceHash", "inboundMessageSourceBytes",
  "expectedInboundMessageSourceHashes",
  "inboundRfc822Bytes", "expectedInboundRfc822Hashes",
  "expectedInboundMessageOccurrenceCount", "expectedTransportOccurrenceCount",
  "transportHeadSourceBytes", "expectedTransportHeadSourceHash", "observedAt",
  "privateProjectionNonce",
]);

function buildReplay(untrustedSource) {
  // This full aggregate copy is intentionally the first operation. No crypto or
  // dependency verifier observes caller-owned mutable objects or buffers.
  const preflight = clonePreflight(untrustedSource);
  const source = preflight.clone;
  exactObject(source, SOURCE_FIELDS, "SOURCE");
  const observedAt = instant(source.observedAt, "OBSERVED_AT");
  const context = checkedAdapterContext(source.adapterContext,
    source.expectedAdapterContextHash);
  if (DateParse(observedAt) < DateParse(context.validFrom)
    || DateParse(observedAt) >= DateParse(context.validUntil)) {
    fail("OBSERVED_AT_OUTSIDE_ADAPTER_CONTEXT");
  }

  const dependency = verifiedDependencies(source, observedAt);
  if (context.rightsPrivacyPolicyRefHash
    !== source.tender.authorizationBinding.rightsPrivacyPolicyRefHash) {
    fail("ADAPTER_CONTEXT_RIGHTS_PRIVACY_TENDER_SPLICE");
  }
  const binding = expectedBinding(source, dependency);

  const routeEnvelope = canonicalEnvelope(source.routeObservationSourceBytes,
    source.expectedRouteObservationSourceHash, context, "ROUTE_OBSERVATION",
    "ROUTE_OBSERVATION");
  const outboundEnvelope = canonicalEnvelope(source.outboundMessageSourceBytes,
    source.expectedOutboundMessageSourceHash, context, "OUTBOUND_TENDER",
    "OUTBOUND_TENDER");
  const outbound = outboundEnvelope.value.payload;
  exactObject(outbound, OUTBOUND_FIELDS, "OUTBOUND_TENDER_PAYLOAD");
  if (outbound.schema
      !== OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .outboundTender
    || outbound.sourceSystemId !== context.sourceSystemId
    || outbound.adapterContextHash !== context.contextHash) {
    fail("OUTBOUND_TENDER_CONTEXT_SPLICE");
  }
  validateBinding(outbound.binding, binding);
  const privateScope = checkedPrivateScope(outbound.privateScope, binding);
  const choices = checkedChoices(outbound.responseChoices, source.tender,
    dependency.responseCheck);
  const challengeHash = challengeCommitment(outbound.challengeToken);
  const templateHash = outboundTemplateCommitment(binding, privateScope,
    challengeHash, choices.choiceSetHash);
  if (outbound.responseChoiceSetHash !== choices.choiceSetHash
    || outbound.outboundTemplateCommitmentHash !== templateHash) {
    fail("OUTBOUND_TENDER_TEMPLATE_COMMITMENT_INVALID");
  }

  const permission = replayPermissionLifecycle(source, context, binding,
    privateScope, challengeHash, choices.choiceSetHash, templateHash, observedAt);
  const outboundRaw = pinnedRawBytes(source.outboundRfc822Bytes,
    source.expectedOutboundRfc822Hash, "OUTBOUND_RFC822");
  const transport = replayTransport(source, context, binding, privateScope,
    permission, routeEnvelope, outboundEnvelope, choices, challengeHash,
    templateHash, observedAt, dependency.selectedCandidate, outboundRaw);

  if (typeof source.privateProjectionNonce !== "string"
    || !RegExpTest(CHALLENGE, source.privateProjectionNonce)) {
    fail("PRIVATE_PROJECTION_NONCE_INVALID");
  }
  const privateSourceBundleCommitmentHash = digest(
    "outsider/permissioned-transaction-interface-private-source-bundle/v1", {
      privateProjectionNonce: source.privateProjectionNonce,
      tenderHash: source.tender.tenderHash,
      routeDiscoverySnapshotHash:
        source.routeDiscoveryReplay.expectedSnapshotHash,
      ownerStandingReplayHash: source.ownerStandingReplay.expectedReplayHash,
      responseLifecycleHeadHash:
        source.oneUseResponseReplay.expectedLifecycleHeadHash,
      adapterContextHash: context.contextHash,
      permissionEventSourceHashes: permission.sourceHashes,
      permissionHeadSourceHash: permission.headSourceHash,
      routeObservationSourceHash: routeEnvelope.hash,
      outboundTenderSourceHash: outboundEnvelope.hash,
      outboundRfc822SourceHash: outboundRaw.hash,
      sendAcknowledgementSourceHash:
        source.expectedSendAcknowledgementSourceHash,
      inboundMessageSourceHashes: transport.inboundSourceHashes,
      inboundRfc822SourceHashes: transport.inboundRfc822Hashes,
      transportHeadSourceHash: transport.headSourceHash,
      strictResponseSemanticHash: transport.responseSemanticHash,
      observedAt,
    });

  const responseCurrent = dependency.responseCheck.currentResponseState
      === "OFFERED"
    && dependency.responseCheck.currentCallerDeclaredOneUseOfferReference === true
    && dependency.ownerCheck.sourceDeclaredOwnerStandingCurrent === true
    && permission.current;
  const body = {
    schema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .replay,
    schemaVersion: "1.0.0",
    ok: true,
    strongestState:
      "SOURCE_DECLARATIONS_REPLAYED_PERMISSIONED_TRANSACTION_INTERFACE_HOLD",
    profile: OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1,
    tenderHash: source.tender.tenderHash,
    workOrderHash: source.tender.workOrderHash,
    typedGraphHash: source.tender.typedGraph.typedGraphHash,
    principalEpochProjectionHash:
      binding.graph.principalEpochProjectionHash,
    accountableDeploymentSubjectHash:
      binding.graph.accountableDeploymentSubjectHash,
    runtimeInstanceHash: binding.graph.runtimeInstanceHash,
    embodimentRevisionHash: binding.graph.embodimentRevisionHash,
    delegationEdgeHash: binding.graph.delegationEdgeHash,
    episodeHash: binding.graph.episodeHash,
    attemptHash: binding.graph.attemptHash,
    requirementKind: binding.requirement.requirementKind,
    requirementId: binding.requirement.requirementId,
    requirementObjectHash: binding.requirement.requirementObjectHash,
    routeKind: binding.routeKind,
    routeDiscoverySnapshotHash:
      source.routeDiscoveryReplay.expectedSnapshotHash,
    routeObjectHash: binding.routeObjectHash,
    currentCandidateHash: binding.currentCandidateHash,
    accountableActorIdentityEnvelopeHash:
      binding.accountableActorIdentityEnvelopeHash,
    ownerActorIdentityEnvelopeHash: binding.ownerActorIdentityEnvelopeHash,
    resourceOwnerRefHash: binding.resourceOwnerRefHash,
    providerRefHash: binding.providerRefHash,
    privateSourceBundleCommitmentHash,
    permissionLifecycleEventCount: permission.occurrenceCount,
    permissionLifecycleDistinctObjectCount: permission.distinctObjectCount,
    transportOccurrenceCount: transport.occurrenceCount,
    transportDistinctObjectCount: transport.distinctObjectCount,
    inboundOccurrenceCount: transport.inboundCount,
    strictChallengeReplyOccurrenceCount: transport.strict.length,
    observedAt,
    exactSourceBufferCount: preflight.budget.buffers,
    exactSourceByteCount: preflight.budget.bytes,
    aggregateArrayElementCount: preflight.budget.arrayElements,
    rawSourceReplayPerformed: true,
    exactCanonicalSourceBytesReplayed: true,
    exactRfc822SourceBytesReplayed: true,
    tenderSourceReplayed: true,
    typedGraphPathBoundExactly: true,
    routeDiscoveryRecordRederivedFromCallerInput: true,
    callerScopedRouteObservationSourceReplayed: true,
    routeCurrentUserHeldAccountCandidateBoundExactly: true,
    ownerStandingSourceReplayed: true,
    ownerStandingCreatesAuthority: false,
    oneUseResponseLifecycleReplayed: true,
    terminalResponseDescendantReplayed:
      source.oneUseResponseReplay.responses.length === 2,
    sourceDeclaredOneUseResponseState:
      dependency.responseCheck.currentResponseState,
    adapterSourceSignaturesConsistentWithCallerPinnedKey: true,
    adapterSourceSignatureCreatesAuthority: false,
    permissionAppendOnlyLifecycleReplayed: true,
    permissionOccurrenceDenominatorReplayed: true,
    sourceDeclaredPermissionCurrentAtObservedAt: permission.current,
    permissionSourceDeclarationCreatesAuthority: false,
    permissionSourceDeclarationCreatesSendAuthorization: false,
    transportAppendOnlyOccurrenceChainReplayed: true,
    transportOccurrenceDenominatorReplayed: true,
    transportObjectDedupReducedOccurrenceDenominator: false,
    idempotencyObjectConflictsRejected: true,
    transportOccurrenceNoncesUniqueWithinSuppliedDenominator: true,
    challengeBoundMailboxReplySourceVerified: true,
    challengeBoundReplyExactNewlyAuthoredGrammarRequired: true,
    oneChallengeBoundToOneSemanticResponseWithinSuppliedDenominator: true,
    sourceDeclaredResponseCurrent: responseCurrent,
    serverAcknowledgementAcceptedAsOffer: false,
    deliveryOrReadReceiptAcceptedAsOffer: false,
    dkimAcceptedAsOffer: false,
    arcAcceptedAsOffer: false,
    spfOrDmarcAcceptedAsOffer: false,
    naturalLanguageAcceptedAsOffer: false,
    vendorClaimAcceptedAsOffer: false,
    modelLabelAcceptedAsOffer: false,
    quotedOrMetadataChallengeAccepted: false,
    nonceFreshnessBeyondSuppliedDenominatorEstablished: false,
    nonceConsumptionPersistedExternally: false,
    suppliedLifecycleDenominatorCompleteUnderCallerPinOnly: true,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    independentExternalAnchorEstablished: false,
    mailboxOwnershipIndependentlyEstablished: false,
    recipientIdentityIndependentlyEstablished: false,
    deliveryIndependentlyEstablished: false,
    contactabilityIndependentlyEstablished: false,
    resourceOwnerLegalIdentityEstablished: false,
    resourceOwnerStandingEstablished: false,
    userHeldAuthorizationIndependentlyEstablished: false,
    sendAuthorized: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    providerContactPerformed: false,
    networkRequestPerformed: false,
    liveIoPerformed: false,
    pricePresent: false,
    pricingPermitted: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    result:
      "SOURCE_DECLARATIONS_REPLAYED_PERMISSIONED_TRANSACTION_INTERFACE_HOLD",
    error: null,
    boundary:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, replayHash: digest(
    OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS.replay,
    body) });
}

function replayFailure(error) {
  let message = `${PREFIX}UNTRUSTED_FAILURE`;
  try {
    if (error instanceof ErrorConstructor && typeof error.message === "string"
      && RegExpTest(
        /^OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_[A-Z0-9_]+$/u,
        error.message)) message = error.message;
  } catch { message = `${PREFIX}UNTRUSTED_FAILURE`; }
  return deepFreeze({
    schema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .replay,
    schemaVersion: "1.0.0",
    ok: false,
    strongestState:
      "SOURCE_DECLARATIONS_NOT_REPLAYED_PERMISSIONED_TRANSACTION_INTERFACE_HOLD",
    rawSourceReplayPerformed: false,
    typedGraphPathBoundExactly: false,
    permissionAppendOnlyLifecycleReplayed: false,
    permissionOccurrenceDenominatorReplayed: false,
    transportAppendOnlyOccurrenceChainReplayed: false,
    transportOccurrenceDenominatorReplayed: false,
    challengeBoundMailboxReplySourceVerified: false,
    sourceDeclaredResponseCurrent: false,
    serverAcknowledgementAcceptedAsOffer: false,
    dkimAcceptedAsOffer: false,
    arcAcceptedAsOffer: false,
    naturalLanguageAcceptedAsOffer: false,
    userHeldAuthorizationIndependentlyEstablished: false,
    sendAuthorized: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    providerContactPerformed: false,
    networkRequestPerformed: false,
    liveIoPerformed: false,
    pricePresent: false,
    pricingPermitted: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    result:
      "SOURCE_DECLARATIONS_NOT_REPLAYED_PERMISSIONED_TRANSACTION_INTERFACE_HOLD",
    replayHash: null,
    error: message,
    boundary:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_BOUNDARY,
  });
}

/** Build only from the complete private raw source bundle. */
export function createPermissionedTransactionInterfaceSourceReplayV1(
  source = {}) {
  return buildReplay(source);
}

/** Verify only by replaying raw source and matching a caller-pinned hash. */
export function verifyPermissionedTransactionInterfaceSourceReplayV1(
  source = {}, expectedReplayHash = null) {
  try {
    const expected = hash(expectedReplayHash, "EXPECTED_REPLAY_HASH");
    const replay = buildReplay(source);
    if (replay.replayHash !== expected) fail("EXPECTED_REPLAY_HASH_MISMATCH");
    return replay;
  } catch (error) {
    return replayFailure(error);
  }
}
