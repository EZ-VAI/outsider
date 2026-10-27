/*
 * Stage 1 direct-participant invitation packet, draft-only v1.
 *
 * This artifact closes a pre-contact engineering gap only.  It binds exact
 * private case, reconstruction, review-packet, purpose, audience, question,
 * challenge, and retention bytes without creating a dispute-review
 * INVITATION occurrence and without exposing any transport capability.  The
 * network-safe projection contains lengths and keyed commitments only.  A
 * locally generated Ed25519 signature and a fresh 256-bit challenge prove at
 * most bundle control/integrity; neither proves identity, standing,
 * participation, truth, delivery, response, outcome, authority, or adoption.
 */

import {
  createHash, createHmac, createPublicKey, generateKeyPairSync, randomBytes,
  sign, verify,
} from "node:crypto";
import {
  chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, realpathSync,
} from "node:fs";
import path from "node:path";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { publishPrivateArtifact } from "./outsider-private-artifact-publication.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const BufferAllocUnsafe = Buffer.allocUnsafe;
const BufferByteLength = Buffer.byteLength;
const BufferCopy = Function.prototype.call.bind(Buffer.prototype.copy);
const BufferEquals = Function.prototype.call.bind(Buffer.prototype.equals);
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferPrototype = Buffer.prototype;
const TypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const TypedArrayByteLength = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(TypedArrayPrototype, "byteLength").get);
const TypedArrayLength = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(TypedArrayPrototype, "length").get);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const HmacPrototype = Object.getPrototypeOf(createHmac("sha256", Buffer.alloc(32)));
const HmacDigest = Function.prototype.call.bind(HmacPrototype.digest);
const HmacUpdate = Function.prototype.call.bind(HmacPrototype.update);
const JSONParse = JSON.parse;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const StringEndsWith = Function.prototype.call.bind(String.prototype.endsWith);
const StringIncludes = Function.prototype.call.bind(String.prototype.includes);
const StringStartsWith = Function.prototype.call.bind(String.prototype.startsWith);
const StringTrim = Function.prototype.call.bind(String.prototype.trim);
const TextDecoderConstructor = TextDecoder;
const TextDecoderDecode = Function.prototype.call.bind(TextDecoder.prototype.decode);
const TypeErrorConstructor = TypeError;

const FATAL_UTF8_DECODER = new TextDecoderConstructor("utf-8", {
  fatal: true,
  ignoreBOM: true,
});

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const DIRECTORY = constants.O_DIRECTORY ?? 0;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const HMAC = /^hmac-sha256:[a-f0-9]{64}$/u;
const CASE_ALIAS = /^case_[a-f0-9]{32}$/u;
const PARTICIPANT_ALIAS = /^participant_[a-f0-9]{32}$/u;
const OPAQUE_DIRECTORY = /^invitation_[a-f0-9]{32}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const QUESTION_END = /[?？]$/u;
const MAX_SOURCE_BYTES = 32 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 128 * 1024;
const MIN_RETENTION_SECONDS = 300;
const MAX_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const MAX_TREE_NODES = 25_000;
const MAX_TREE_KEYS = 100_000;
const MAX_TOP_LEVEL_KEYS = 64;
const MAX_ARRAY_LENGTH = 4_096;
const MAX_OWN_KEYS_PER_OBJECT = 4_096;
const MAX_STRING_BYTES = 64 * 1024;

export const AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
  = ObjectFreeze({
    privatePacket:
      "outsider/autonomous-work-order-direct-participant-invitation-private-packet/v1",
    networkSafeProjection:
      "outsider/autonomous-work-order-direct-participant-invitation-network-projection/v1",
    privateReceipt:
      "outsider/autonomous-work-order-direct-participant-invitation-private-receipt/v1",
    inMemoryDerivation:
      "outsider/autonomous-work-order-direct-participant-invitation-in-memory-derivation/v1",
    verification:
      "outsider/autonomous-work-order-direct-participant-invitation-verification/v1",
  });

export const AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_FILES
  = ObjectFreeze({
    caseRecord: "case-record.bytes",
    reviewPacket: "review-packet.bytes",
    purpose: "purpose.bytes",
    audience: "audience.bytes",
    privatePacket: "private-packet.json",
    challengeNonce: "challenge-nonce.bytes",
    projectionKey: "projection-key.bytes",
    signerPublicKey: "signer-public-key.spki",
    publisherControlSignature: "publisher-control-signature.bytes",
    networkSafeProjection: "network-safe-projection.json",
    receipt: "run-receipt.json",
  });

export const AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_QUESTION_KINDS
  = ObjectFreeze(["EVIDENCE_REQUEST", "DISPUTE_DISPOSITION"]);

export const AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_COMPONENTS
  = ObjectFreeze(["ATTEMPT", "OBSERVATION", "PROMISE", "UNRESOLVED"]);

export const AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_BOUNDARY
  = deepFreeze({
    position: "STAGE1_DIRECT_PARTICIPANT_INVITATION_DRAFT_NOT_SENT",
    fillsPreContactEngineeringGapOnly: true,
    createsDisputeReviewInvitationOccurrence: false,
    actualCandidateBytesRequiredByProtocol: false,
    syntheticFixtureCanExerciseEngineeringGateOnly: true,
    latentPrivateDirectoryModeRequirement: "0700",
    latentPrivateFileModeRequirement: "0600",
    latentExactFileAllowlistRequirement: true,
    latentFixedFileCountRequirement: 11,
    latentNoClobberRequirement: true,
    latentReceiptWrittenLastRequirement: true,
    rawPrivatePublicationIntegrated: false,
    rawPrivatePublicationHardDisabledBeforeInputOrPathAccess: true,
    rawPrivateVerificationIntegrated: false,
    rawPrivateVerificationHardDisabledBeforeInputOrPathAccess: true,
    retentionAndPurgeLifecycleRequiredBeforeRawPersistenceCanBeEnabled: true,
    pureInMemoryDerivationAvailable: true,
    partialFailureMayLeaveTerminalDirectoryWithoutReceipt: true,
    automaticPartialFailureCleanupIntegrated: false,
    rawCaseReviewPurposeAudienceAndChallengeRemainPrivate: true,
    networkProjectionContainsUrls: false,
    networkProjectionContainsLogins: false,
    networkProjectionContainsProviderIdsOrNodeIds: false,
    networkProjectionContainsPii: false,
    networkProjectionContainsRawHashes: false,
    networkProjectionContainsLocalPathsOrFilenames: false,
    networkProjectionContainsOnlyLengthsTypedStateAndKeyedCommitments: true,
    freshChallengeNonceBits: 256,
    challengeGeneratedByLocalCsprngForEachDerivationCall: true,
    inputNormalizedBeforeChallengeOrKeyGeneration: true,
    processLocalChallengeCollisionRejected: false,
    processLocalChallengeCollisionTrackingIntegrated: false,
    crossProcessOrGlobalChallengeFreshnessEstablished: false,
    challengeProvesControlOnly: true,
    inMemoryDerivationSignatureAlgorithm: "Ed25519",
    inMemoryDerivationSignatureVerifiesPrivatePacketIntegrity: true,
    inMemoryDerivationSignatureProvesControlOnly: true,
    signerLegalIdentityVerified: false,
    participantLegalIdentityVerified: false,
    participantStandingVerified: false,
    caseScopedAliasesCallerSuppliedRegexOnly: true,
    caseScopedAliasSourceDerivationVerified: false,
    caseScopedAliasUnlinkabilityVerified: false,
    directHistoricalParticipationVerified: false,
    questionSemanticTruthVerified: false,
    audienceOwnershipOrChannelContinuityVerified: false,
    independentTimeEstablished: false,
    retentionPermissionCurrent: false,
    automaticPurgeIntegrated: false,
    stage1EngineeringIntegrationReceiptReplayed: false,
    stage1EngineeringGatePassed: false,
    stage1Complete: false,
    stage2Permitted: false,
    sourceReplayVerified: false,
    rightsPrivacyAdjudicationEstablished: false,
    directParticipantConfirmationEstablished: false,
    networkOrderEstablished: false,
    callerBindingsOnly: true,
    eligibleForContact: false,
    sendableInvitationMaterialAvailable: false,
    challengeEchoCanBeRequestedFromThisDerivedObject: false,
    contactPerformed: false,
    outboundCapability: false,
    transportTargetPresent: false,
    deliveryEstablished: false,
    responseEstablished: false,
    independentOutcomeEstablished: false,
    stage1ExternalFactGateSatisfied: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    permitsPricing: false,
    permitsGuarantee: false,
    permitsInsurance: false,
    permitsSettlement: false,
    moneyMovementEnabled: false,
  });

const SOURCE_ROLES = ObjectFreeze([
  "caseRecord", "reviewPacket", "purpose", "audience",
]);
const NON_RECEIPT_ROLES = ObjectFreeze([
  "caseRecord", "reviewPacket", "purpose", "audience", "privatePacket",
  "challengeNonce", "projectionKey", "signerPublicKey",
  "publisherControlSignature", "networkSafeProjection",
]);
const ALL_ROLES = ObjectFreeze([...NON_RECEIPT_ROLES, "receipt"]);

function fail(code) {
  throw new TypeErrorConstructor(
    `AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, writable: true, enumerable: true, configurable: true,
  });
  return array;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && ObjectHasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return ObjectFreeze(value);
}

function exactBoundedBuffer(value, maximum, code) {
  if (!BufferIsBuffer(value) || isProxy(value)
    || ObjectGetPrototypeOf(value) !== BufferPrototype
    || ObjectGetOwnPropertyDescriptor(value, "length") !== undefined
    || ObjectGetOwnPropertyDescriptor(value, "byteLength") !== undefined) {
    fail(`${code}_EXACT_BUFFER_REQUIRED`);
  }
  let length;
  let byteLength;
  try {
    length = TypedArrayLength(value);
    byteLength = TypedArrayByteLength(value);
  } catch {
    fail(`${code}_TYPED_ARRAY_SIZE_INVALID`);
  }
  if (!NumberIsSafeInteger(length) || !NumberIsSafeInteger(byteLength)
    || length !== byteLength || length < 0 || length > maximum) {
    fail(`${code}_TYPED_ARRAY_SIZE_INVALID`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== length) fail(`${code}_OWN_KEYS_INVALID`);
  for (let index = 0; index < length; index += 1) {
    if (keys[index] !== StringConstructor(index)) fail(`${code}_OWN_KEYS_INVALID`);
  }
  return length;
}

function safeCopyExactBuffer(value, length, code) {
  let target;
  let copied;
  try {
    target = BufferAllocUnsafe(length);
    copied = BufferCopy(value, target, 0, 0, length);
  } catch {
    fail(`${code}_COPY_FAILED`);
  }
  if (copied !== length || TypedArrayLength(target) !== length
    || TypedArrayByteLength(target) !== length
    || ObjectGetPrototypeOf(target) !== BufferPrototype) {
    fail(`${code}_COPY_FAILED`);
  }
  return target;
}

function decodeUtf8Exact(value, code) {
  try { return TextDecoderDecode(FATAL_UTF8_DECODER, value); }
  catch { fail(`${code}_UTF8_INVALID`); }
}

function rejectTree(value, seen = new SetConstructor(), depth = 0,
  budget = { nodes: 0, keys: 0 }) {
  if (typeof value === "string") {
    if (BufferByteLength(value, "utf8") > MAX_STRING_BYTES) {
      fail("VALUE_STRING_BYTES_EXCEEDED");
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (depth > 128) fail("VALUE_TOO_DEEP");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (BufferIsBuffer(value)) {
    exactBoundedBuffer(value, MAX_SOURCE_BYTES, "VALUE_BUFFER");
    return;
  }
  if (ArrayIsArray(value) && value.length > MAX_ARRAY_LENGTH) {
    fail("VALUE_ARRAY_LENGTH_EXCEEDED");
  }
  budget.nodes += 1;
  if (budget.nodes > MAX_TREE_NODES) fail("VALUE_TREE_NODE_BUDGET_EXCEEDED");
  if (SetHas(seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(seen, value);
  const keys = ReflectOwnKeys(value);
  if (depth === 0 && keys.length > MAX_TOP_LEVEL_KEYS) {
    fail("VALUE_TOP_LEVEL_KEYS_EXCEEDED");
  }
  if (keys.length > MAX_OWN_KEYS_PER_OBJECT) fail("VALUE_OWN_KEYS_EXCEEDED");
  budget.keys += keys.length;
  if (budget.keys > MAX_TREE_KEYS) fail("VALUE_TREE_KEY_BUDGET_EXCEEDED");
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const descriptorKeys = ReflectOwnKeys(descriptors);
  if (descriptorKeys.length !== keys.length) fail("VALUE_KEYS_CHANGED_DURING_INSPECTION");
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")) fail("ACCESSOR_FORBIDDEN");
    rejectTree(descriptor.value, seen, depth + 1, budget);
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

function denseArray(value, length, code) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length !== length || ReflectOwnKeys(value).length !== length + 1) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  for (let index = 0; index < length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function boundedDenseArray(value, minimum, maximum, code) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length < minimum || value.length > maximum
    || ReflectOwnKeys(value).length !== value.length + 1) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function alias(value, expression, code) {
  if (typeof value !== "string" || !RegExpTest(expression, value)) fail(`${code}_INVALID`);
  return value;
}

function timestamp(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)) {
    fail(`${code}_INVALID`);
  }
  const milliseconds = DateParse(value);
  if (!NumberIsSafeInteger(milliseconds)) fail(`${code}_INVALID`);
  let roundTrip;
  try { roundTrip = DateToISOString(new DateConstructor(milliseconds)); }
  catch { fail(`${code}_INVALID`); }
  if (roundTrip !== value) fail(`${code}_INVALID`);
  return value;
}

function canonicalBytes(value) {
  return BufferFrom(`${canonicalizeStrict(value)}\n`, "utf8");
}

function digest(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function sha256(bytes) {
  const state = createHash("sha256");
  HashUpdate(state, bytes);
  return `sha256:${HashDigest(state, "hex")}`;
}

function keyedCommitment(key, domain, context, ...parts) {
  const state = createHmac("sha256", key);
  HmacUpdate(state, `${domain}\0${canonicalizeStrict(context)}\0parts:${parts.length}\0`,
    "utf8");
  for (let index = 0; index < parts.length; index += 1) {
    HmacUpdate(state,
      `part:${index}:length:${TypedArrayLength(parts[index])}\0`, "utf8");
    HmacUpdate(state, parts[index]);
  }
  return `hmac-sha256:${HmacDigest(state, "hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function nonzero32(value, code) {
  const length = exactBoundedBuffer(value, 32, code);
  if (length !== 32) {
    fail(`${code}_MUST_BE_32_BYTES`);
  }
  let nonzero = false;
  for (let index = 0; index < length; index += 1) {
    if (value[index] !== 0) nonzero = true;
  }
  if (!nonzero) fail(`${code}_ALL_ZERO_FORBIDDEN`);
  return safeCopyExactBuffer(value, length, code);
}

function sourceBytes(value) {
  exactObject(value, SOURCE_ROLES, "SOURCE_BYTES");
  const result = {};
  let total = 0;
  for (let index = 0; index < SOURCE_ROLES.length; index += 1) {
    const role = SOURCE_ROLES[index];
    const bytes = value[role];
    const length = exactBoundedBuffer(bytes, MAX_SOURCE_BYTES,
      `SOURCE_${role.toUpperCase()}`);
    if (length < 1) fail(`SOURCE_${role.toUpperCase()}_EMPTY`);
    total += length;
    if (total > MAX_TOTAL_SOURCE_BYTES) fail("SOURCE_TOTAL_BYTES_EXCEEDED");
    result[role] = safeCopyExactBuffer(bytes, length,
      `SOURCE_${role.toUpperCase()}`);
  }
  return result;
}

function normalizeCaseBinding(value, sources) {
  exactObject(value, ["caseScopedAlias", "caseRecordHash", "workOrderHash",
    "episodeHash", "attemptSetCompositionHash", "reconstructionHash",
    "reviewPacketHash", "purposeHash", "audienceHash"], "CASE_BINDING");
  const result = {
    caseScopedAlias: alias(value.caseScopedAlias, CASE_ALIAS, "CASE_SCOPED_ALIAS"),
    caseRecordHash: hash(value.caseRecordHash, "CASE_RECORD_HASH"),
    workOrderHash: hash(value.workOrderHash, "WORK_ORDER_HASH"),
    episodeHash: hash(value.episodeHash, "EPISODE_HASH"),
    attemptSetCompositionHash: hash(value.attemptSetCompositionHash,
      "ATTEMPT_SET_COMPOSITION_HASH"),
    reconstructionHash: hash(value.reconstructionHash, "RECONSTRUCTION_HASH"),
    reviewPacketHash: hash(value.reviewPacketHash, "REVIEW_PACKET_HASH"),
    purposeHash: hash(value.purposeHash, "PURPOSE_HASH"),
    audienceHash: hash(value.audienceHash, "AUDIENCE_HASH"),
  };
  if (result.caseRecordHash !== sha256(sources.caseRecord)) {
    fail("CASE_RECORD_EXACT_BYTES_MISMATCH");
  }
  if (result.reviewPacketHash !== sha256(sources.reviewPacket)) {
    fail("REVIEW_PACKET_EXACT_BYTES_MISMATCH");
  }
  if (result.purposeHash !== sha256(sources.purpose)) {
    fail("PURPOSE_EXACT_BYTES_MISMATCH");
  }
  if (result.audienceHash !== sha256(sources.audience)) {
    fail("AUDIENCE_EXACT_BYTES_MISMATCH");
  }
  return result;
}

function normalizeReconstruction(value, expectedHash) {
  exactObject(value, ["promiseRefCommitment", "attemptRefCommitment",
    "observationRefCommitment", "unresolvedRefCommitment"], "RECONSTRUCTION");
  const result = {
    promiseRefCommitment: hash(value.promiseRefCommitment,
      "PROMISE_REF_COMMITMENT"),
    attemptRefCommitment: hash(value.attemptRefCommitment,
      "ATTEMPT_REF_COMMITMENT"),
    observationRefCommitment: hash(value.observationRefCommitment,
      "OBSERVATION_REF_COMMITMENT"),
    unresolvedRefCommitment: hash(value.unresolvedRefCommitment,
      "UNRESOLVED_REF_COMMITMENT"),
  };
  if (digest("outsider.autonomous-work-order.dispute-review-reconstruction.v1",
    result) !== expectedHash) fail("RECONSTRUCTION_EXACT_CONTENT_MISMATCH");
  return result;
}

function normalizeQuestion(value) {
  exactObject(value, ["kind", "prompt", "decisionPointRefCommitment",
    "beforeRefCommitment", "changedRefCommitment", "triggeringComponents",
    "requestedEvidenceRefCommitment", "disputeDispositionRefCommitment",
    "responseProtocol"],
  "QUESTION");
  let kind;
  if (value.kind === "EVIDENCE_REQUEST" || value.kind === "DISPUTE_DISPOSITION") {
    kind = value.kind;
  } else fail("QUESTION_KIND_INVALID");
  if (typeof value.prompt !== "string" || StringTrim(value.prompt) !== value.prompt
    || StringIncludes(value.prompt, "\0") || !RegExpTest(QUESTION_END, value.prompt)) {
    fail("QUESTION_PROMPT_INVALID");
  }
  const promptBytes = BufferFrom(value.prompt, "utf8");
  const promptByteLength = TypedArrayLength(promptBytes);
  if (promptByteLength < 24 || promptByteLength > 2_048
    || decodeUtf8Exact(promptBytes, "QUESTION_PROMPT") !== value.prompt
    || BufferByteLength(value.prompt, "utf8") !== promptByteLength) {
    fail("QUESTION_PROMPT_INVALID");
  }
  const decisionPointRefCommitment = hash(value.decisionPointRefCommitment,
    "QUESTION_DECISION_POINT_REF_COMMITMENT");
  const beforeRefCommitment = hash(value.beforeRefCommitment,
    "QUESTION_BEFORE_REF_COMMITMENT");
  const changedRefCommitment = hash(value.changedRefCommitment,
    "QUESTION_CHANGED_REF_COMMITMENT");
  if (beforeRefCommitment === changedRefCommitment) {
    fail("QUESTION_BEFORE_AND_CHANGED_REFERENCES_MUST_DIFFER");
  }
  boundedDenseArray(value.triggeringComponents, 1,
    AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_COMPONENTS.length,
    "QUESTION_TRIGGERING_COMPONENTS");
  const triggeringComponents = [];
  let priorComponentIndex = -1;
  for (let index = 0; index < value.triggeringComponents.length; index += 1) {
    const component = value.triggeringComponents[index];
    let componentIndex = -1;
    for (let scan = 0;
      scan < AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_COMPONENTS
        .length;
      scan += 1) {
      if (AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_COMPONENTS[scan]
        === component) componentIndex = scan;
    }
    if (componentIndex <= priorComponentIndex) {
      fail("QUESTION_TRIGGERING_COMPONENTS_ORDER_OR_DUPLICATE_INVALID");
    }
    priorComponentIndex = componentIndex;
    append(triggeringComponents, component);
  }
  if (value.responseProtocol !== "YES_NO_UNSURE_DECLINE_V1") {
    fail("QUESTION_RESPONSE_PROTOCOL_INVALID");
  }
  const requestedEvidenceRefCommitment = value.requestedEvidenceRefCommitment === null
    ? null : hash(value.requestedEvidenceRefCommitment,
      "QUESTION_REQUESTED_EVIDENCE_REF_COMMITMENT");
  const disputeDispositionRefCommitment = value.disputeDispositionRefCommitment === null
    ? null : hash(value.disputeDispositionRefCommitment,
      "QUESTION_DISPUTE_DISPOSITION_REF_COMMITMENT");
  if (kind === "EVIDENCE_REQUEST") {
    if (requestedEvidenceRefCommitment === null
      || disputeDispositionRefCommitment !== null) {
      fail("EVIDENCE_REQUEST_EXACT_REFERENCE_SHAPE_REQUIRED");
    }
  } else if (requestedEvidenceRefCommitment !== null
    || disputeDispositionRefCommitment === null) {
    fail("DISPUTE_DISPOSITION_EXACT_REFERENCE_SHAPE_REQUIRED");
  }
  return { kind, prompt: value.prompt, decisionPointRefCommitment,
    beforeRefCommitment, changedRefCommitment, triggeringComponents,
    requestedEvidenceRefCommitment, disputeDispositionRefCommitment,
    responseProtocol: "YES_NO_UNSURE_DECLINE_V1",
    responseChoices: ["YES", "NO", "UNSURE", "DECLINE"],
    yesMeansExactChangedReferenceWouldReplaceBeforeAtDecisionPoint: true,
    noMeansExactChangedReferenceWouldNotReplaceBeforeAtDecisionPoint: true,
    unsureAndDeclineDoNotCountAsYesOrNo: true,
    structurallySpecificQuestionShapePresent: true,
    actualCaseDeltaTruthOrCausalityVerified: false,
    questionSemanticSpecificityOrTruthVerified: false };
}

function normalizeInput(input) {
  rejectTree(input);
  exactObject(input, ["recordedAt", "retentionSeconds", "caseBinding",
    "caseScopedParticipantAlias", "reconstruction", "sourceBytes", "question"],
  "INPUT");
  const recordedAt = timestamp(input.recordedAt, "RECORDED_AT");
  if (!NumberIsSafeInteger(input.retentionSeconds)
    || input.retentionSeconds < MIN_RETENTION_SECONDS
    || input.retentionSeconds > MAX_RETENTION_SECONDS) {
    fail("RETENTION_SECONDS_INVALID");
  }
  const recordedAtMilliseconds = DateParse(recordedAt);
  const expiresAtMilliseconds = recordedAtMilliseconds + input.retentionSeconds * 1_000;
  if (!NumberIsSafeInteger(expiresAtMilliseconds)) fail("RETENTION_EXPIRY_INVALID");
  const sources = sourceBytes(input.sourceBytes);
  const caseBinding = normalizeCaseBinding(input.caseBinding, sources);
  const reconstruction = normalizeReconstruction(input.reconstruction,
    caseBinding.reconstructionHash);
  const question = normalizeQuestion(input.question);
  return {
    recordedAt,
    retentionSeconds: input.retentionSeconds,
    expiresAtLocalDerivationClock:
      DateToISOString(new DateConstructor(expiresAtMilliseconds)),
    caseBinding,
    caseScopedParticipantAlias: alias(input.caseScopedParticipantAlias,
      PARTICIPANT_ALIAS, "CASE_SCOPED_PARTICIPANT_ALIAS"),
    reconstruction,
    sources,
    question,
  };
}

function projectionContext(normalized) {
  return {
    recordedAt: normalized.recordedAt,
    expiresAtLocalDerivationClock: normalized.expiresAtLocalDerivationClock,
    retentionSeconds: normalized.retentionSeconds,
    caseBinding: normalized.caseBinding,
    caseScopedParticipantAlias: normalized.caseScopedParticipantAlias,
    reconstruction: normalized.reconstruction,
    question: normalized.question,
  };
}

function deriveArtifactsFromNormalized(normalized, nonceInput, projectionKeyInput,
  signerPublicKey,
  signerPrivateKey = null) {
  const nonce = nonzero32(nonceInput, "CHALLENGE_NONCE");
  const projectionKey = nonzero32(projectionKeyInput, "PROJECTION_KEY");
  const context = projectionContext(normalized);
  const sourceLengths = {
    caseRecord: TypedArrayLength(normalized.sources.caseRecord),
    reviewPacket: TypedArrayLength(normalized.sources.reviewPacket),
    purpose: TypedArrayLength(normalized.sources.purpose),
    audience: TypedArrayLength(normalized.sources.audience),
  };
  const privateBindingCommitment = keyedCommitment(projectionKey,
    "outsider.autonomous-work-order.direct-participant-invitation.binding.v1",
    context, canonicalBytes(context));
  const questionCommitment = keyedCommitment(projectionKey,
    "outsider.autonomous-work-order.direct-participant-invitation.question.v1",
    { kind: normalized.question.kind, sourceLengths },
    BufferFrom(normalized.question.prompt, "utf8"), canonicalBytes(normalized.question));
  const challengeCommitment = keyedCommitment(projectionKey,
    "outsider.autonomous-work-order.direct-participant-invitation.challenge.v1",
    { privateBindingCommitment, questionCommitment }, nonce);
  const retentionCommitment = keyedCommitment(projectionKey,
    "outsider.autonomous-work-order.direct-participant-invitation.retention.v1",
    { privateBindingCommitment }, canonicalBytes({
      recordedAt: normalized.recordedAt,
      expiresAtLocalDerivationClock: normalized.expiresAtLocalDerivationClock,
      retentionSeconds: normalized.retentionSeconds,
      purgeRequired: true,
    }));
  const sourceSetCommitment = keyedCommitment(projectionKey,
    "outsider.autonomous-work-order.direct-participant-invitation.source-set.v1",
    { privateBindingCommitment, sourceLengths },
    normalized.sources.caseRecord, normalized.sources.reviewPacket,
    normalized.sources.purpose, normalized.sources.audience);

  const networkSafeProjection = deepFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
        .networkSafeProjection,
    schemaVersion: "1.0.0",
    projectionClass: "KEYED_COMMITMENTS_AND_LENGTHS_ONLY_NOT_SENT_HOLD",
    sourceByteLengths: sourceLengths,
    binding: {
      privateBindingCommitment,
      sourceSetCommitment,
      exactPrivateCaseReconstructionReviewPurposeAndAudienceBound: true,
      exactPrivateValuesProjected: false,
      caseScopedAliasesProjected: false,
      caseScopedAliasesCallerSuppliedRegexOnly: true,
      aliasSourceDerivationVerified: false,
      aliasUnlinkabilityVerified: false,
    },
    question: {
      kind: normalized.question.kind,
      promptByteLength: BufferByteLength(normalized.question.prompt, "utf8"),
      triggeringComponentCount: normalized.question.triggeringComponents.length,
      responseProtocol: "YES_NO_UNSURE_DECLINE_V1",
      responseChoices: ["YES", "NO", "UNSURE", "DECLINE"],
      exactBeforeChangedDecisionAndTriggerReferencesPrivateOnly: true,
      questionCommitment,
      exactPromptProjected: false,
      structurallySpecificQuestionShapePresent: true,
      actualCaseDeltaTruthOrCausalityVerified: false,
      semanticSpecificityOrTruthVerified: false,
    },
    challenge: {
      nonceBits: 256,
      challengeCommitment,
      nonceProjected: false,
      generatedForThisDerivationCallByLocalCsprng: true,
      processLocalCollisionRejected: false,
      globalFreshnessEstablished: false,
      provesControlOnly: true,
    },
    retention: {
      retentionSeconds: normalized.retentionSeconds,
      retentionCommitment,
      exactTimesProjected: false,
      localDerivationClockIsIndependentTime: false,
      permissionCurrent: false,
      automaticPurgeIntegrated: false,
    },
    localControl: {
      algorithm: "Ed25519",
      inMemorySignatureVerifiedDuringDerivation: true,
      signatureReturnedOrPersisted: false,
      signerReferenceProjected: false,
      verifiesPrivatePacketIntegrityOnly: true,
      provesLegalPerson: false,
      provesParticipantStanding: false,
      provesNarrativeOrOutcomeTruth: false,
    },
    delivery: {
      state: "NOT_SENT",
      contactPerformed: false,
      outboundCapability: false,
      transportTargetProjected: false,
      deliveryEstablished: false,
      responseEstablished: false,
    },
    gate: {
      stage1EngineeringIntegrationReceiptReplayed: false,
      stage1EngineeringGatePassed: false,
      stage1Complete: false,
      stage2Permitted: false,
      sourceReplayVerified: false,
      rightsPrivacyAdjudicationEstablished: false,
      directParticipantConfirmationEstablished: false,
      networkOrderEstablished: false,
      callerBindingsOnly: true,
      eligibleForContact: false,
      sendableInvitationMaterialAvailable: false,
      challengeEchoCanBeRequestedFromThisDerivedObject: false,
      directHistoricalParticipationVerified: false,
      stage1ExternalFactGateSatisfied: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      economicAuthority: "NONE",
    },
  });
  const projectionBytes = canonicalBytes(networkSafeProjection);
  const exportedPublicKey = signerPublicKey.export({ type: "spki", format: "der" });
  const publicKeyLength = exactBoundedBuffer(exportedPublicKey, MAX_SOURCE_BYTES,
    "SIGNER_PUBLIC_KEY");
  const publicKeyBytes = safeCopyExactBuffer(exportedPublicKey, publicKeyLength,
    "SIGNER_PUBLIC_KEY");
  const privatePacketBase = {
    schema:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
        .privatePacket,
    schemaVersion: "1.0.0",
    packetClass: "PRIVATE_EXACT_INVITATION_DRAFT_NOT_SENT",
    recordedAt: normalized.recordedAt,
    caseBinding: normalized.caseBinding,
    caseScopedParticipantAlias: normalized.caseScopedParticipantAlias,
    aliasBoundary: {
      aliasesCallerSuppliedRegexOnly: true,
      aliasSourceDerivationVerified: false,
      aliasUnlinkabilityVerified: false,
      aliasEstablishesActorEpisodeOrLegalIdentity: false,
    },
    reconstruction: normalized.reconstruction,
    question: normalized.question,
    exactPrivateSources: {
      caseRecord: { byteLength: TypedArrayLength(normalized.sources.caseRecord),
        sha256: sha256(normalized.sources.caseRecord) },
      reviewPacket: { byteLength: TypedArrayLength(normalized.sources.reviewPacket),
        sha256: sha256(normalized.sources.reviewPacket) },
      purpose: { byteLength: TypedArrayLength(normalized.sources.purpose),
        sha256: sha256(normalized.sources.purpose) },
      audience: { byteLength: TypedArrayLength(normalized.sources.audience),
        sha256: sha256(normalized.sources.audience) },
    },
    challenge: {
      nonceBits: 256,
      nonceSha256: sha256(nonce),
      challengeCommitment,
      generatedForThisDerivationCallByLocalCsprng: true,
      processLocalCollisionRejected: false,
      crossProcessOrGlobalFreshnessEstablished: false,
      provesControlOnly: true,
    },
    retention: {
      retentionSeconds: normalized.retentionSeconds,
      expiresAtLocalDerivationClock: normalized.expiresAtLocalDerivationClock,
      retentionCommitment,
      localDerivationClockIsIndependentTime: false,
      purgeRequired: true,
      automaticPurgeIntegrated: false,
      retentionPermissionCurrent: false,
    },
    networkProjection: {
      sha256: sha256(projectionBytes),
      privateBindingCommitment,
      sourceSetCommitment,
      questionCommitment,
      challengeCommitment,
      retentionCommitment,
    },
    localControl: {
      algorithm: "Ed25519",
      signerPublicKeySha256: sha256(publicKeyBytes),
      projectionKeySha256: sha256(projectionKey),
      inMemorySignatureVerifiedDuringDerivation: true,
      signatureReturnedOrPersisted: false,
      provesBundleControlOnly: true,
      signerLegalIdentityVerified: false,
      participantStandingVerified: false,
      narrativeOrOutcomeTruthVerified: false,
    },
    delivery: {
      state: "NOT_SENT",
      contactPerformed: false,
      outboundCapability: false,
      transportTargetIncluded: false,
      deliveryEstablished: false,
      responseEstablished: false,
    },
    stage1EngineeringIntegrationReceiptReplayed: false,
    stage1EngineeringGatePassed: false,
    stage1Complete: false,
    stage2Permitted: false,
    sourceReplayVerified: false,
    rightsPrivacyAdjudicationEstablished: false,
    directParticipantConfirmationEstablished: false,
    networkOrderEstablished: false,
    callerBindingsOnly: true,
    eligibleForContact: false,
    sendableInvitationMaterialAvailable: false,
    challengeEchoCanBeRequestedFromThisDerivedObject: false,
    decisionState: "HOLD",
    authority: "NONE",
    stage1ExternalFactGateSatisfied: false,
  };
  const privatePacket = deepFreeze({
    ...privatePacketBase,
    packetHash: digest(
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
        .privatePacket,
      privatePacketBase),
  });
  const privatePacketBytes = canonicalBytes(privatePacket);
  let signatureBytes = null;
  if (signerPrivateKey !== null) {
    const generatedSignature = sign(null, privatePacketBytes, signerPrivateKey);
    const signatureLength = exactBoundedBuffer(generatedSignature, 128,
      "DERIVATION_CONTROL_SIGNATURE");
    signatureBytes = safeCopyExactBuffer(generatedSignature, signatureLength,
      "DERIVATION_CONTROL_SIGNATURE");
  }
  return { normalized, nonce, projectionKey, publicKeyBytes, signatureBytes,
    networkSafeProjection, projectionBytes, privatePacket, privatePacketBytes };
}

function receiptFor(artifacts, signatureBytes) {
  const payloads = {
    caseRecord: artifacts.normalized.sources.caseRecord,
    reviewPacket: artifacts.normalized.sources.reviewPacket,
    purpose: artifacts.normalized.sources.purpose,
    audience: artifacts.normalized.sources.audience,
    privatePacket: artifacts.privatePacketBytes,
    challengeNonce: artifacts.nonce,
    projectionKey: artifacts.projectionKey,
    signerPublicKey: artifacts.publicKeyBytes,
    publisherControlSignature: signatureBytes,
    networkSafeProjection: artifacts.projectionBytes,
  };
  const fileManifest = [];
  for (let index = 0; index < NON_RECEIPT_ROLES.length; index += 1) {
    const role = NON_RECEIPT_ROLES[index];
    const bytes = payloads[role];
    append(fileManifest, {
      role,
      file:
        AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_FILES[role],
      byteLength: bytes.length,
      sha256: sha256(bytes),
    });
  }
  const base = {
    schema:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
        .privateReceipt,
    schemaVersion: "1.0.0",
    recordedAt: artifacts.normalized.recordedAt,
    packetHash: artifacts.privatePacket.packetHash,
    fileManifest,
    latentPublicationOrderRequirement: ALL_ROLES,
    latentExactFileAllowlistRequirement: true,
    latentFixedFileCountRequirement: 11,
    latentDirectoryModeRequirement: "0700",
    latentFileModeRequirement: "0600",
    latentNoClobberRequirement: true,
    latentReceiptWrittenLastRequirement: true,
    publisherControlFlowExecuted: false,
    receiptWriteOrderIndependentlyWitnessed: false,
    contactPerformed: false,
    outboundCapability: false,
    deliveryEstablished: false,
    responseEstablished: false,
    stage1ExternalFactGateSatisfied: false,
    decisionState: "HOLD",
    authority: "NONE",
  };
  return deepFreeze({ ...base, receiptHash: digest(
    AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
      .privateReceipt,
    base) });
}

function safeRootAndOutput(trustedRootInput, outputDirectoryInput) {
  if (typeof trustedRootInput !== "string" || typeof outputDirectoryInput !== "string") {
    fail("PUBLICATION_PATHS_INVALID");
  }
  const trustedRoot = path.resolve(trustedRootInput);
  const outputDirectory = path.resolve(outputDirectoryInput);
  if (trustedRoot === path.parse(trustedRoot).root) fail("TRUSTED_ROOT_TOO_BROAD");
  let rootStat;
  try { rootStat = lstatSync(trustedRoot, { bigint: true }); }
  catch { fail("TRUSTED_ROOT_INVALID"); }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
    || (rootStat.mode & 0o777n) !== 0o700n
    || realpathSync(trustedRoot) !== trustedRoot) fail("TRUSTED_ROOT_INVALID");
  if (path.dirname(outputDirectory) !== trustedRoot
    || !RegExpTest(OPAQUE_DIRECTORY, path.basename(outputDirectory))) {
    fail("OUTPUT_MUST_BE_OPAQUE_DIRECT_CHILD");
  }
  return { trustedRoot, outputDirectory };
}

function mapPublicationError(error) {
  const message = error instanceof ErrorConstructor ? error.message : "";
  if (StringStartsWith(message,
    "AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_")) {
    throw error;
  }
  if (StringIncludes(message, "TARGET_EXISTS") || error?.code === "EEXIST") {
    fail("NO_CLOBBER_TARGET_EXISTS");
  }
  fail("PRIVATE_PUBLICATION_FAILED");
}

function publishPayloads(paths, artifacts, receipt, trustedRoot) {
  const payloads = {
    caseRecord: artifacts.normalized.sources.caseRecord,
    reviewPacket: artifacts.normalized.sources.reviewPacket,
    purpose: artifacts.normalized.sources.purpose,
    audience: artifacts.normalized.sources.audience,
    privatePacket: artifacts.privatePacketBytes,
    challengeNonce: artifacts.nonce,
    projectionKey: artifacts.projectionKey,
    signerPublicKey: artifacts.publicKeyBytes,
    publisherControlSignature: artifacts.signatureBytes,
    networkSafeProjection: artifacts.projectionBytes,
  };
  for (let index = 0; index < NON_RECEIPT_ROLES.length; index += 1) {
    const role = NON_RECEIPT_ROLES[index];
    publishPrivateArtifact(path.join(paths.outputDirectory,
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_FILES[role]),
    payloads[role], { trustedRoot, allowExistingIdentical: false });
  }
  publishPrivateArtifact(path.join(paths.outputDirectory,
    AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_FILES.receipt),
  canonicalBytes(receipt), { trustedRoot, allowExistingIdentical: false });
}

function parseCanonical(bytes, code) {
  if (!BufferIsBuffer(bytes) || bytes.length < 3 || bytes.length > 512 * 1024) {
    fail(`${code}_BYTES_INVALID`);
  }
  let value;
  try { value = JSONParse(decodeUtf8Exact(bytes, code)); }
  catch { fail(`${code}_JSON_INVALID`); }
  if (!BufferEquals(bytes, canonicalBytes(value))) fail(`${code}_NOT_CANONICAL`);
  rejectTree(value);
  return value;
}

function readRegularPrivate(file, maximum, code) {
  let before;
  try { before = lstatSync(file, { bigint: true }); }
  catch { fail(`${code}_MISSING`); }
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1n
    || (before.mode & 0o777n) !== 0o600n || before.size < 1n
    || before.size > BigInt(maximum)) fail(`${code}_UNSAFE`);
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_RDONLY | NOFOLLOW);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size || opened.mtimeNs !== before.mtimeNs
      || opened.ctimeNs !== before.ctimeNs) fail(`${code}_CHANGED`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(file, { bigint: true });
    if (after.dev !== opened.dev || after.ino !== opened.ino
      || after.size !== opened.size || after.mtimeNs !== opened.mtimeNs
      || after.ctimeNs !== opened.ctimeNs || current.dev !== opened.dev
      || current.ino !== opened.ino || current.size !== opened.size
      || current.mtimeNs !== opened.mtimeNs || current.ctimeNs !== opened.ctimeNs) {
      fail(`${code}_CHANGED`);
    }
    return bytes;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function exactRoleManifest(value, payloads) {
  denseArray(value, NON_RECEIPT_ROLES.length, "FILE_MANIFEST");
  for (let index = 0; index < NON_RECEIPT_ROLES.length; index += 1) {
    const role = NON_RECEIPT_ROLES[index];
    const row = value[index];
    exactObject(row, ["role", "file", "byteLength", "sha256"],
      "FILE_MANIFEST_ROW");
    if (row.role !== role
      || row.file
        !== AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_FILES[role]
      || row.byteLength !== payloads[role].length
      || row.sha256 !== sha256(payloads[role])) fail("FILE_MANIFEST_MISMATCH");
  }
}

function inputFromPrivatePacket(packet, sources) {
  return {
    recordedAt: packet.recordedAt,
    retentionSeconds: packet.retention.retentionSeconds,
    caseBinding: packet.caseBinding,
    caseScopedParticipantAlias: packet.caseScopedParticipantAlias,
    reconstruction: {
      promiseRefCommitment: packet.reconstruction.promiseRefCommitment,
      attemptRefCommitment: packet.reconstruction.attemptRefCommitment,
      observationRefCommitment: packet.reconstruction.observationRefCommitment,
      unresolvedRefCommitment: packet.reconstruction.unresolvedRefCommitment,
    },
    sourceBytes: sources,
    question: {
      kind: packet.question.kind,
      prompt: packet.question.prompt,
      decisionPointRefCommitment: packet.question.decisionPointRefCommitment,
      beforeRefCommitment: packet.question.beforeRefCommitment,
      changedRefCommitment: packet.question.changedRefCommitment,
      triggeringComponents: packet.question.triggeringComponents,
      requestedEvidenceRefCommitment:
        packet.question.requestedEvidenceRefCommitment,
      disputeDispositionRefCommitment:
        packet.question.disputeDispositionRefCommitment,
      responseProtocol: packet.question.responseProtocol,
    },
  };
}

function verifyPrivatePacketShape(packet) {
  exactObject(packet, ["schema", "schemaVersion", "packetClass", "recordedAt",
    "caseBinding", "caseScopedParticipantAlias", "aliasBoundary", "reconstruction",
    "question",
    "exactPrivateSources", "challenge", "retention", "networkProjection",
    "localControl", "delivery", "stage1EngineeringIntegrationReceiptReplayed",
    "stage1EngineeringGatePassed", "stage1Complete", "stage2Permitted",
    "sourceReplayVerified", "rightsPrivacyAdjudicationEstablished",
    "directParticipantConfirmationEstablished", "networkOrderEstablished",
    "callerBindingsOnly", "eligibleForContact", "sendableInvitationMaterialAvailable",
    "challengeEchoCanBeRequestedFromThisDerivedObject", "decisionState", "authority",
    "stage1ExternalFactGateSatisfied", "packetHash"], "PRIVATE_PACKET");
  if (packet.schema
      !== AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
        .privatePacket
    || packet.schemaVersion !== "1.0.0"
    || packet.packetClass !== "PRIVATE_EXACT_INVITATION_DRAFT_NOT_SENT"
    || packet.stage1EngineeringIntegrationReceiptReplayed !== false
    || packet.stage1EngineeringGatePassed !== false
    || packet.stage1Complete !== false || packet.stage2Permitted !== false
    || packet.sourceReplayVerified !== false
    || packet.rightsPrivacyAdjudicationEstablished !== false
    || packet.directParticipantConfirmationEstablished !== false
    || packet.networkOrderEstablished !== false
    || packet.callerBindingsOnly !== true || packet.eligibleForContact !== false
    || packet.sendableInvitationMaterialAvailable !== false
    || packet.challengeEchoCanBeRequestedFromThisDerivedObject !== false
    || packet.decisionState !== "HOLD" || packet.authority !== "NONE"
    || packet.stage1ExternalFactGateSatisfied !== false
    || packet.delivery?.state !== "NOT_SENT"
    || packet.delivery?.contactPerformed !== false
    || packet.delivery?.outboundCapability !== false
    || packet.delivery?.transportTargetIncluded !== false
    || packet.delivery?.deliveryEstablished !== false
    || packet.delivery?.responseEstablished !== false) fail("PRIVATE_PACKET_BOUNDARY_INVALID");
  const { packetHash, ...base } = packet;
  hash(packetHash, "PACKET_HASH");
  if (packetHash !== digest(
    AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
      .privatePacket,
    base)) fail("PRIVATE_PACKET_HASH_MISMATCH");
}

function verifyProjectionShape(value) {
  exactObject(value, ["schema", "schemaVersion", "projectionClass",
    "sourceByteLengths", "binding", "question", "challenge", "retention",
    "localControl", "delivery", "gate"], "NETWORK_PROJECTION");
  if (value.schema
      !== AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
        .networkSafeProjection
    || value.schemaVersion !== "1.0.0"
    || value.projectionClass !== "KEYED_COMMITMENTS_AND_LENGTHS_ONLY_NOT_SENT_HOLD"
    || value.delivery?.state !== "NOT_SENT"
    || value.delivery?.contactPerformed !== false
    || value.delivery?.outboundCapability !== false
    || value.delivery?.transportTargetProjected !== false
    || value.delivery?.deliveryEstablished !== false
    || value.delivery?.responseEstablished !== false
    || value.gate?.stage1EngineeringIntegrationReceiptReplayed !== false
    || value.gate?.stage1EngineeringGatePassed !== false
    || value.gate?.stage1Complete !== false || value.gate?.stage2Permitted !== false
    || value.gate?.sourceReplayVerified !== false
    || value.gate?.rightsPrivacyAdjudicationEstablished !== false
    || value.gate?.directParticipantConfirmationEstablished !== false
    || value.gate?.networkOrderEstablished !== false
    || value.gate?.callerBindingsOnly !== true
    || value.gate?.eligibleForContact !== false
    || value.gate?.sendableInvitationMaterialAvailable !== false
    || value.gate?.challengeEchoCanBeRequestedFromThisDerivedObject !== false
    || value.gate?.stage1ExternalFactGateSatisfied !== false
    || value.gate?.decisionState !== "HOLD" || value.gate?.authority !== "NONE") {
    fail("NETWORK_PROJECTION_BOUNDARY_INVALID");
  }
  const serialized = canonicalizeStrict(value);
  if (RegExpTest(/(?:https?:\/\/|www\.|@|(?:^|[^-])sha256:|"(?:login|id|node_id|url|path|file|filename|pii)")/iu,
    serialized)) fail("NETWORK_PROJECTION_FORBIDDEN_VALUE_OR_FIELD");
  const commitments = [value.binding?.privateBindingCommitment,
    value.binding?.sourceSetCommitment, value.question?.questionCommitment,
    value.challenge?.challengeCommitment, value.retention?.retentionCommitment];
  for (let index = 0; index < commitments.length; index += 1) {
    if (typeof commitments[index] !== "string" || !RegExpTest(HMAC, commitments[index])) {
      fail("NETWORK_PROJECTION_COMMITMENT_INVALID");
    }
  }
}

function verifyReceiptShape(receipt, payloads) {
  exactObject(receipt, ["schema", "schemaVersion", "recordedAt", "packetHash",
    "fileManifest", "latentPublicationOrderRequirement",
    "latentExactFileAllowlistRequirement", "latentFixedFileCountRequirement",
    "latentDirectoryModeRequirement", "latentFileModeRequirement",
    "latentNoClobberRequirement", "latentReceiptWrittenLastRequirement",
    "publisherControlFlowExecuted",
    "receiptWriteOrderIndependentlyWitnessed", "contactPerformed",
    "outboundCapability", "deliveryEstablished", "responseEstablished",
    "stage1ExternalFactGateSatisfied", "decisionState", "authority", "receiptHash"],
  "RECEIPT");
  if (receipt.schema
      !== AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
        .privateReceipt
    || receipt.schemaVersion !== "1.0.0"
    || receipt.latentExactFileAllowlistRequirement !== true
    || receipt.latentFixedFileCountRequirement !== 11
    || receipt.latentDirectoryModeRequirement !== "0700"
    || receipt.latentFileModeRequirement !== "0600"
    || receipt.latentNoClobberRequirement !== true
    || receipt.latentReceiptWrittenLastRequirement !== true
    || receipt.publisherControlFlowExecuted !== false
    || receipt.receiptWriteOrderIndependentlyWitnessed !== false
    || receipt.contactPerformed !== false || receipt.outboundCapability !== false
    || receipt.deliveryEstablished !== false || receipt.responseEstablished !== false
    || receipt.stage1ExternalFactGateSatisfied !== false
    || receipt.decisionState !== "HOLD" || receipt.authority !== "NONE") {
    fail("RECEIPT_BOUNDARY_INVALID");
  }
  denseArray(receipt.latentPublicationOrderRequirement, ALL_ROLES.length,
    "PUBLICATION_ORDER");
  for (let index = 0; index < ALL_ROLES.length; index += 1) {
    if (receipt.latentPublicationOrderRequirement[index] !== ALL_ROLES[index]) {
      fail("PUBLICATION_ORDER_INVALID");
    }
  }
  exactRoleManifest(receipt.fileManifest, payloads);
  hash(receipt.packetHash, "RECEIPT_PACKET_HASH");
  hash(receipt.receiptHash, "RECEIPT_HASH");
  const { receiptHash, ...base } = receipt;
  if (receiptHash !== digest(
    AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
      .privateReceipt,
    base)) fail("RECEIPT_HASH_MISMATCH");
}

function readDirectory(directory, trustedRoot) {
  const paths = safeRootAndOutput(trustedRoot, directory);
  let directoryStat;
  try { directoryStat = lstatSync(paths.outputDirectory, { bigint: true }); }
  catch { fail("DIRECTORY_MISSING"); }
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()
    || (directoryStat.mode & 0o777n) !== 0o700n
    || realpathSync(paths.outputDirectory) !== paths.outputDirectory) {
    fail("DIRECTORY_UNSAFE");
  }
  let entries;
  try { entries = readdirSync(paths.outputDirectory); }
  catch { fail("DIRECTORY_READ_FAILED"); }
  if (entries.length !== ALL_ROLES.length) fail("EXACT_FILE_ALLOWLIST_MISMATCH");
  for (let index = 0; index < ALL_ROLES.length; index += 1) {
    const required =
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_FILES[
        ALL_ROLES[index]];
    let found = false;
    for (let scan = 0; scan < entries.length; scan += 1) {
      if (entries[scan] === required) found = true;
    }
    if (!found) fail("EXACT_FILE_ALLOWLIST_MISMATCH");
  }
  const bytes = {};
  for (let index = 0; index < ALL_ROLES.length; index += 1) {
    const role = ALL_ROLES[index];
    const maximum = role === "privatePacket" || role === "networkSafeProjection"
      || role === "receipt" ? 512 * 1024 : MAX_SOURCE_BYTES;
    bytes[role] = readRegularPrivate(path.join(paths.outputDirectory,
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_FILES[role]),
    maximum, role.toUpperCase());
  }
  return bytes;
}

function verificationFailure(error) {
  const message = error instanceof ErrorConstructor ? error.message : "";
  return deepFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
        .verification,
    ok: false,
    exactPrivateBundleReplayVerified: false,
    inMemoryDerivationControlSignatureVerified: false,
    challengeNonceExactlyBound: false,
    challengeGlobalFreshnessEstablished: false,
    networkProjectionSafeShapeVerified: false,
    stage1EngineeringIntegrationReceiptReplayed: false,
    stage1EngineeringGatePassed: false,
    stage1Complete: false,
    stage2Permitted: false,
    sourceReplayVerified: false,
    rightsPrivacyAdjudicationEstablished: false,
    directParticipantConfirmationEstablished: false,
    networkOrderEstablished: false,
    callerBindingsOnly: true,
    eligibleForContact: false,
    sendableInvitationMaterialAvailable: false,
    challengeEchoCanBeRequestedFromThisDerivedObject: false,
    contactPerformed: false,
    outboundCapability: false,
    deliveryEstablished: false,
    directHistoricalParticipationVerified: false,
    stage1ExternalFactGateSatisfied: false,
    decisionState: "HOLD",
    authority: "NONE",
    receiptHash: null,
    error: StringStartsWith(message,
      "AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_")
      ? message :
        "AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_UNTRUSTED_FAILURE",
    boundary:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_BOUNDARY,
  });
}

function rawLifecycleDisabledVerification() {
  return deepFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
        .verification,
    ok: false,
    exactPrivateBundleReplayVerified: false,
    inMemoryDerivationControlSignatureVerified: false,
    challengeNonceExactlyBound: false,
    challengeGlobalFreshnessEstablished: false,
    networkProjectionSafeShapeVerified: false,
    rawPrivateVerificationIntegrated: false,
    retentionPermissionCurrent: false,
    automaticPurgeIntegrated: false,
    stage1EngineeringIntegrationReceiptReplayed: false,
    stage1EngineeringGatePassed: false,
    stage1Complete: false,
    stage2Permitted: false,
    sourceReplayVerified: false,
    rightsPrivacyAdjudicationEstablished: false,
    directParticipantConfirmationEstablished: false,
    networkOrderEstablished: false,
    callerBindingsOnly: true,
    eligibleForContact: false,
    sendableInvitationMaterialAvailable: false,
    challengeEchoCanBeRequestedFromThisDerivedObject: false,
    contactPerformed: false,
    outboundCapability: false,
    deliveryEstablished: false,
    directHistoricalParticipationVerified: false,
    stage1ExternalFactGateSatisfied: false,
    decisionState: "HOLD",
    authority: "NONE",
    receiptHash: null,
    error:
      "AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_RAW_VERIFICATION_HARD_DISABLED_PENDING_RETENTION_AND_PURGE_LIFECYCLE",
    boundary:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_BOUNDARY,
  });
}

export function deriveAutonomousWorkOrderDirectParticipantInvitationPacketV1(input) {
  const normalized = normalizeInput(input);
  const nonce = nonzero32(randomBytes(32), "CHALLENGE_NONCE");
  const projectionKey = nonzero32(randomBytes(32), "PROJECTION_KEY");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const artifacts = deriveArtifactsFromNormalized(normalized, nonce, projectionKey,
    publicKey, privateKey);
  if (TypedArrayLength(artifacts.signatureBytes) !== 64
    || !verify(null, artifacts.privatePacketBytes, publicKey,
      artifacts.signatureBytes)) fail("IN_MEMORY_LOCAL_CONTROL_SIGNATURE_INVALID");
  return deepFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
        .inMemoryDerivation,
    privatePacket: artifacts.privatePacket,
    networkSafeProjection: artifacts.networkSafeProjection,
    inMemoryControlVerification: {
      inMemoryDerivationControlSignatureVerified: true,
      signatureAlgorithm: "Ed25519",
      signatureAndSignerReferencePersisted: false,
      signatureProvesControlOnly: true,
      signerLegalIdentityVerified: false,
      participantStandingVerified: false,
      narrativeOrOutcomeTruthVerified: false,
    },
    challengeControl: {
      nonceBits: 256,
      inputNormalizedBeforeChallengeOrKeyGeneration: true,
      generatedForThisDerivationCallByLocalCsprng: true,
      processLocalCollisionRejected: false,
      nonceReturnedOrPersisted: false,
      crossProcessOrGlobalFreshnessEstablished: false,
      provesControlOnly: true,
    },
    persistence: {
      rawPrivatePublicationIntegrated: false,
      rawPrivateVerificationIntegrated: false,
      retentionPermissionCurrent: false,
      automaticPurgeIntegrated: false,
      directoryOrFileCreated: false,
      latentRequiredDirectoryMode: "0700",
      latentRequiredFileMode: "0600",
      latentNoClobberRequired: true,
      latentReceiptWrittenLastRequired: true,
    },
    aliasBoundary: {
      aliasesCallerSuppliedRegexOnly: true,
      aliasSourceDerivationVerified: false,
      aliasUnlinkabilityVerified: false,
    },
    stage1EngineeringIntegrationReceiptReplayed: false,
    stage1EngineeringGatePassed: false,
    stage1Complete: false,
    stage2Permitted: false,
    sourceReplayVerified: false,
    rightsPrivacyAdjudicationEstablished: false,
    directParticipantConfirmationEstablished: false,
    networkOrderEstablished: false,
    callerBindingsOnly: true,
    eligibleForContact: false,
    sendableInvitationMaterialAvailable: false,
    challengeEchoCanBeRequestedFromThisDerivedObject: false,
    contactPerformed: false,
    outboundCapability: false,
    deliveryEstablished: false,
    directHistoricalParticipationVerified: false,
    stage1ExternalFactGateSatisfied: false,
    decisionState: "HOLD",
    authority: "NONE",
    boundary:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_BOUNDARY,
  });
}

export function publishAutonomousWorkOrderDirectParticipantInvitationPacketV1(
  input, options = {}) {
  fail("RAW_PUBLICATION_HARD_DISABLED_PENDING_RETENTION_AND_PURGE_LIFECYCLE");
  rejectTree(options);
  exactObject(options, ["trustedRoot", "outputDirectory"], "PUBLISH_OPTIONS");
  const normalized = normalizeInput(input);
  const paths = safeRootAndOutput(options.trustedRoot, options.outputDirectory);
  const nonce = nonzero32(randomBytes(32), "CHALLENGE_NONCE");
  const projectionKey = nonzero32(randomBytes(32), "PROJECTION_KEY");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const artifacts = deriveArtifactsFromNormalized(normalized, nonce, projectionKey,
    publicKey, privateKey);
  const receipt = receiptFor(artifacts, artifacts.signatureBytes);
  try {
    mkdirSync(paths.outputDirectory, { mode: 0o700 });
    chmodSync(paths.outputDirectory, 0o700);
    publishPayloads(paths, artifacts, receipt, paths.trustedRoot);
  } catch (error) {
    mapPublicationError(error);
  }
  const verified = verifyAutonomousWorkOrderDirectParticipantInvitationPacketV1(
    paths.outputDirectory, {
      trustedRoot: paths.trustedRoot,
      expectedReceiptHash: receipt.receiptHash,
    });
  if (!verified.ok) fail("POST_PUBLICATION_VERIFICATION_FAILED");
  return deepFreeze({
    receipt,
    networkSafeProjection: artifacts.networkSafeProjection,
    verification: verified,
    contactPerformed: false,
    outboundCapability: false,
    boundary:
      AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_BOUNDARY,
  });
}

export function verifyAutonomousWorkOrderDirectParticipantInvitationPacketV1(
  directory, options = {}) {
  return rawLifecycleDisabledVerification();
  try {
    rejectTree(options);
    exactObject(options, ["trustedRoot", "expectedReceiptHash"], "VERIFY_OPTIONS");
    const expectedReceiptHash = hash(options.expectedReceiptHash,
      "EXPECTED_RECEIPT_HASH");
    const bytes = readDirectory(directory, options.trustedRoot);
    const packet = parseCanonical(bytes.privatePacket, "PRIVATE_PACKET");
    const projection = parseCanonical(bytes.networkSafeProjection,
      "NETWORK_PROJECTION");
    const receipt = parseCanonical(bytes.receipt, "RECEIPT");
    verifyPrivatePacketShape(packet);
    verifyProjectionShape(projection);
    const payloads = {};
    for (let index = 0; index < NON_RECEIPT_ROLES.length; index += 1) {
      payloads[NON_RECEIPT_ROLES[index]] = bytes[NON_RECEIPT_ROLES[index]];
    }
    verifyReceiptShape(receipt, payloads);
    if (receipt.receiptHash !== expectedReceiptHash
      || receipt.packetHash !== packet.packetHash) fail("CALLER_PIN_MISMATCH");
    const sources = {
      caseRecord: bytes.caseRecord,
      reviewPacket: bytes.reviewPacket,
      purpose: bytes.purpose,
      audience: bytes.audience,
    };
    const signerPublicKey = createPublicKey({ key: bytes.signerPublicKey,
      format: "der", type: "spki" });
    const rebuiltInput = normalizeInput(inputFromPrivatePacket(packet, sources));
    const rebuilt = deriveArtifactsFromNormalized(rebuiltInput, bytes.challengeNonce,
      bytes.projectionKey, signerPublicKey, null);
    if (!same(rebuilt.privatePacket, packet)
      || !same(rebuilt.networkSafeProjection, projection)
      || !BufferEquals(rebuilt.privatePacketBytes, bytes.privatePacket)
      || !BufferEquals(rebuilt.projectionBytes, bytes.networkSafeProjection)) {
      fail("EXACT_PRIVATE_REPLAY_MISMATCH");
    }
    if (TypedArrayLength(bytes.publisherControlSignature) !== 64
      || !verify(null, bytes.privatePacket, signerPublicKey,
        bytes.publisherControlSignature)) fail("LOCAL_CONTROL_SIGNATURE_INVALID");
    return deepFreeze({
      schema:
        AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_SCHEMAS
          .verification,
      ok: true,
      exactPrivateBundleReplayVerified: true,
      inMemoryDerivationControlSignatureVerified: false,
      latentControlSignatureRequirementOnly: true,
      signerLegalIdentityVerified: false,
      participantStandingVerified: false,
      challengeNonceExactlyBound: true,
      challengeNonceBits: 256,
      challengeGeneratedForThisDerivationCallByLocalCsprng: false,
      challengeProcessLocalCollisionRejected: false,
      challengeGlobalFreshnessEstablished: false,
      networkProjectionSafeShapeVerified: true,
      latentReceiptWrittenLastRequirement: true,
      publisherControlFlowExecuted: false,
      receiptWriteOrderIndependentlyWitnessed: false,
      contactPerformed: false,
      outboundCapability: false,
      deliveryEstablished: false,
      responseEstablished: false,
      directHistoricalParticipationVerified: false,
      stage1ExternalFactGateSatisfied: false,
      decisionState: "HOLD",
      authority: "NONE",
      receiptHash: receipt.receiptHash,
      packetHash: packet.packetHash,
      error: null,
      boundary:
        AUTONOMOUS_WORK_ORDER_DIRECT_PARTICIPANT_INVITATION_PACKET_V1_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
