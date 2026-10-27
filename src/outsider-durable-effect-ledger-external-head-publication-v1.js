/*
 * Minimal publication seam from a seller one-use durable effect ledger to an
 * injected external anchor transport.
 *
 * The local ledger is replayed at an exact caller-pinned head before the one
 * transport invocation.  Only a digest of a head/entry-set commitment leaves
 * this module.  A returned receipt must echo that exact digest and the exact
 * requested predecessor/sequence.  That establishes only that the injected
 * transport returned a structurally bound acknowledgement.  It does not make
 * the provider acknowledgement authority, outcome truth, independent
 * evidence, a cryptographic anchor, or proof of append-only external storage.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";

const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectKeys = Object.keys;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetHas = Function.prototype.call.bind(Set.prototype.has);

const PREFIX = "OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_EXTERNAL_SEQUENCE = 9_007_199_254_740_991;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;

export const OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS
  = ObjectFreeze({
    commitment:
      "outsider/durable-effect-ledger-external-head-commitment/v1",
    request:
      "outsider/durable-effect-ledger-external-head-publication-request/v1",
    transportReceipt:
      "outsider/durable-effect-ledger-external-head-transport-receipt/v1",
    verification:
      "outsider/durable-effect-ledger-external-head-publication-verification/v1",
  });

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)
    || SetHas(seen, value)) return value;
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

export const OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_BOUNDARY
  = deepFreeze({
    position:
      "INJECTED_TRANSPORT_ACKNOWLEDGEMENT_OF_DIGEST_ONLY_LOCAL_HEAD_COMMITMENT_HOLD_ONLY",
    freshExactLocalHeadReplayRequired: true,
    digestOnlyOutboundSubject: true,
    directoryPathProjected: false,
    rawLedgerIdProjected: false,
    entryBytesProjected: false,
    eventBytesProjected: false,
    endpointSecretsProjected: false,
    injectedTransportInvokedAtMostOnce: true,
    automaticTransportRetryPermitted: false,
    receiptExactCommitmentBindingRequired: true,
    receiptExactPredecessorAndSequenceBindingRequired: true,
    providerAcknowledgementObserved: true,
    providerAcknowledgementIsAuthority: false,
    providerAcknowledgementIsOutcomeTruth: false,
    providerAppendClaimIsCryptographicAppendProof: false,
    providerIdentityEstablished: false,
    transportProvenanceEstablished: false,
    cryptographicSubjectBindingVerified: false,
    independentlySourcedTrustPolicyEstablished: false,
    independentWitnessEstablished: false,
    externalAnchorEstablished: false,
    durableExternalHeadEstablished: false,
    durableAppendOnlyExternalHistoryEstablished: false,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    ownerRollbackOrDirectoryReplacementExcluded: false,
    parallelGenesisExclusionEstablished: false,
    forkExclusionEstablished: false,
    trustedClockEstablished: false,
    timestampsAreProviderAndCallerAssertions: true,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "ONE_DIGEST_ONLY_INJECTED_TRANSPORT_CALL",
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    permitsPricing: false,
    permitsGuarantee: false,
    permitsSettlement: false,
    automaticTraining: false,
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
  const encoded = canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(domain, "utf8")
    .update("\0", "utf8").update(encoded, "utf8").digest("hex")}`;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function identifier(value, code) {
  if (typeof value !== "string" || !RegExpTest(IDENTIFIER, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function time(value, code) {
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function externalChain(value) {
  exactObject(value, ["expectedSequence", "previousReceiptHash"],
    "EXTERNAL_CHAIN");
  if (!Number.isSafeInteger(value.expectedSequence)
    || value.expectedSequence < 1
    || value.expectedSequence > MAX_EXTERNAL_SEQUENCE) {
    fail("EXTERNAL_CHAIN_SEQUENCE_INVALID");
  }
  if (value.previousReceiptHash !== null) {
    hash(value.previousReceiptHash, "EXTERNAL_CHAIN_PREVIOUS_RECEIPT_HASH");
  }
  if (value.expectedSequence === 1 && value.previousReceiptHash !== null) {
    fail("EXTERNAL_CHAIN_GENESIS_PREDECESSOR_INVALID");
  }
  if (value.expectedSequence > 1 && value.previousReceiptHash === null) {
    fail("EXTERNAL_CHAIN_PREDECESSOR_REQUIRED");
  }
  return value;
}

function localLedger(value) {
  exactObject(value, ["directory", "ledgerId", "expectedLocalHeadHash"],
    "LOCAL_LEDGER");
  if (typeof value.directory !== "string" || value.directory.length < 1
    || value.directory.length > 4096) fail("LOCAL_LEDGER_DIRECTORY_INVALID");
  identifier(value.ledgerId, "LOCAL_LEDGER_ID");
  hash(value.expectedLocalHeadHash, "EXPECTED_LOCAL_HEAD_HASH");
  return value;
}

function replayLocalLedger(value) {
  const verified = verifyDurableOneUseEndpointEffectLedgerV1({
    directory: value.directory,
    ledgerId: value.ledgerId,
    expectedLocalHeadHash: value.expectedLocalHeadHash,
  });
  const head = verified?.head;
  if (verified?.ok !== true
    || verified.expectedLocalHeadHashProvided !== true
    || verified.expectedLocalHeadHashMatched !== true
    || verified.fullAncestryReplayVerified !== true
    || verified.twoPassEntrySnapshotStabilityVerified !== true
    || verified.networkIoPerformed !== false
    || verified.durableExternalHistoryEstablished !== false
    || verified.externalNonOmissionEstablished !== false
    || verified.externalNonEquivocationEstablished !== false
    || verified.filesystemOwnerRollbackOrReplacementExcluded !== false
    || verified.authority !== "NONE" || verified.decisionState !== "HOLD"
    || !plain(head) || head.ledgerId !== value.ledgerId
    || head.headHash !== value.expectedLocalHeadHash
    || !Number.isSafeInteger(head.entryCount) || head.entryCount < 1
    || !Number.isSafeInteger(verified.exactEntryByteCount)
    || verified.exactEntryByteCount < 1
    || head.headSequence !== head.entryCount
    || head.exactOccurrenceCount !== head.entryCount) {
    fail("FRESH_EXACT_LOCAL_LEDGER_REPLAY_FAILED");
  }
  for (const [field, item] of Object.entries({
    headHash: head.headHash,
    headEntryHash: head.headEntryHash,
    entrySetRoot: head.entrySetRoot,
    verificationHash: verified.verificationHash,
  })) hash(item, `LOCAL_${field.toUpperCase()}`);
  return verified;
}

function makeCommitment(verified) {
  const head = verified.head;
  const body = {
    schema:
      OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS.commitment,
    subjectKind: "SELLER_ONE_USE_DURABLE_ENDPOINT_EFFECT_LEDGER_HEAD_V1",
    ledgerIdHash: digest("durable-effect-ledger-id", { ledgerId: head.ledgerId }),
    headHash: head.headHash,
    headEntryHash: head.headEntryHash,
    entrySetRoot: head.entrySetRoot,
    entryCount: head.entryCount,
    exactEntryByteCount: verified.exactEntryByteCount,
    localVerificationHash: verified.verificationHash,
    localReplayScope:
      "FULL_ANCESTRY_TWO_PASS_STABLE_EXACT_BYTES_IN_ONE_CALLER_SELECTED_ROOT",
    disclosure:
      "COMMITMENT_METADATA_ONLY_NO_DIRECTORY_LEDGER_ID_ENTRY_EVENT_OR_SECRET_BYTES",
    localFsyncBackedHistoryObserved: true,
    durableExternalHistoryEstablished: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return deepFreeze({ ...body, commitmentHash: digest(
    "durable-effect-ledger-external-head-commitment", body) });
}

function makeRequest(commitment, input, dependencies) {
  const body = {
    schema:
      OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS.request,
    requestClass:
      "DIGEST_ONLY_EXTERNAL_HEAD_APPEND_REQUEST_PROVIDER_ACK_IS_NOT_TRUTH",
    publishedAt: input.publishedAt,
    publishedAtIsExternalTimeEvidence: false,
    subject: {
      kind: "DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_COMMITMENT_V1_HASH",
      algorithm: "SHA-256",
      digestHex: commitment.commitmentHash.slice("sha256:".length),
    },
    commitmentHash: commitment.commitmentHash,
    transportBinding: {
      transportId: dependencies.transportId,
      transportPolicyHash: dependencies.transportPolicyHash,
      identityAndTrustEstablishedByIdOrPolicyHash: false,
    },
    externalChainExpectation: {
      expectedSequence: input.externalChain.expectedSequence,
      previousReceiptHash: input.externalChain.previousReceiptHash,
      predecessorWasCallerSupplied: true,
    },
    disclosure: {
      digestOnly: true,
      directoryPathIncluded: false,
      rawLedgerIdIncluded: false,
      entryOrEventBytesIncluded: false,
      endpointSecretIncluded: false,
    },
    automaticRetryPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return deepFreeze({ ...body, requestHash: digest(
    "durable-effect-ledger-external-head-publication-request", body) });
}

function timeoutMs(value) {
  const selected = value === undefined ? DEFAULT_TIMEOUT_MS : value;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > MAX_TIMEOUT_MS) {
    fail("TRANSPORT_TIMEOUT_INVALID");
  }
  return selected;
}

function normalizeDependencies(value) {
  if (!plain(value)) fail("DEPENDENCIES_OBJECT_INVALID");
  const allowed = ["transport", "transportId", "transportPolicyHash", "timeoutMs"];
  const keys = ObjectKeys(value);
  if (keys.some((key) => !allowed.includes(key))
    || !keys.includes("transport") || !keys.includes("transportId")
    || !keys.includes("transportPolicyHash")) fail("DEPENDENCIES_SHAPE_INVALID");
  if (typeof value.transport !== "function") fail("TRANSPORT_INVALID");
  return {
    transport: value.transport,
    transportId: identifier(value.transportId, "TRANSPORT_ID"),
    transportPolicyHash: hash(value.transportPolicyHash,
      "TRANSPORT_POLICY_HASH"),
    timeoutMs: timeoutMs(value.timeoutMs),
  };
}

async function invokeOnce(transport, request, milliseconds) {
  const controller = new AbortController();
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ timedOut: true });
    }, milliseconds);
  });
  let outcome;
  try {
    const call = Promise.resolve().then(() => transport(request,
      ObjectFreeze({ signal: controller.signal })));
    outcome = await Promise.race([
      call.then((value) => ({ value }), () => ({ failed: true })), timedOut,
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (outcome?.timedOut === true || outcome?.failed === true) {
    fail("TRANSPORT_FAILED_OR_TIMED_OUT_NO_AUTOMATIC_RETRY");
  }
  return outcome.value;
}

function verifyTransportReceipt(value, request) {
  exactObject(value, ["schema", "status", "requestHash", "commitmentHash",
    "subjectDigestHex", "transportId", "transportPolicyHash",
    "externalSequence", "previousReceiptHash", "providerReceiptHash",
    "observedAt"], "TRANSPORT_RECEIPT");
  if (value.schema
      !== OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS
        .transportReceipt
    || value.status !== "APPENDED"
    || value.requestHash !== request.requestHash
    || value.commitmentHash !== request.commitmentHash
    || value.subjectDigestHex !== request.subject.digestHex
    || value.transportId !== request.transportBinding.transportId
    || value.transportPolicyHash !== request.transportBinding.transportPolicyHash
    || value.externalSequence
      !== request.externalChainExpectation.expectedSequence
    || value.previousReceiptHash
      !== request.externalChainExpectation.previousReceiptHash) {
    fail("TRANSPORT_RECEIPT_EXACT_BINDING_MISMATCH");
  }
  hash(value.requestHash, "TRANSPORT_RECEIPT_REQUEST_HASH");
  hash(value.commitmentHash, "TRANSPORT_RECEIPT_COMMITMENT_HASH");
  hash(`sha256:${value.subjectDigestHex}`, "TRANSPORT_RECEIPT_SUBJECT_DIGEST");
  hash(value.transportPolicyHash, "TRANSPORT_RECEIPT_POLICY_HASH");
  hash(value.providerReceiptHash, "TRANSPORT_RECEIPT_PROVIDER_RECEIPT_HASH");
  time(value.observedAt, "TRANSPORT_RECEIPT_OBSERVED_AT");
  const body = {
    schema: value.schema,
    status: value.status,
    requestHash: value.requestHash,
    commitmentHash: value.commitmentHash,
    subjectDigestHex: value.subjectDigestHex,
    transportId: value.transportId,
    transportPolicyHash: value.transportPolicyHash,
    externalSequence: value.externalSequence,
    previousReceiptHash: value.previousReceiptHash,
    providerReceiptHash: value.providerReceiptHash,
    observedAt: value.observedAt,
    observedAtIsTrustedTime: false,
    providerAppendClaimObserved: true,
    providerAppendClaimCryptographicallyVerified: false,
    exactCommitmentBindingVerified: true,
  };
  return deepFreeze({ ...body, receiptHash: digest(
    "durable-effect-ledger-external-head-transport-receipt", body) });
}

/**
 * Replay one exact durable local head, publish its digest once through the
 * injected transport, and verify the returned acknowledgement binding.
 */
export async function publishDurableEffectLedgerExternalHeadV1(input = {},
  dependencyInput = {}) {
  exactObject(input, ["localLedger", "publishedAt", "externalChain"],
    "PUBLICATION_INPUT");
  const dependencies = normalizeDependencies(dependencyInput);
  const local = localLedger(input.localLedger);
  time(input.publishedAt, "PUBLISHED_AT");
  externalChain(input.externalChain);
  const verified = replayLocalLedger(local);
  const commitment = makeCommitment(verified);
  const request = makeRequest(commitment, input, dependencies);
  const response = await invokeOnce(dependencies.transport, request,
    dependencies.timeoutMs);
  const receipt = verifyTransportReceipt(response, request);
  const body = {
    schema:
      OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS
        .verification,
    ok: true,
    commitment,
    request,
    receipt,
    localHeadFreshFullAncestryReplayVerified: true,
    exactExpectedLocalHeadMatched: true,
    requestDerivedFromExactHeadAndEntrySetCommitment: true,
    digestOnlyRequestTransported: true,
    injectedTransportInvokedOnce: true,
    automaticTransportRetryPerformed: false,
    providerAcknowledgementObserved: true,
    receiptExactCommitmentBindingVerified: true,
    receiptExactPredecessorAndSequenceBindingVerified: true,
    providerAcknowledgementIsAuthority: false,
    providerAcknowledgementIsOutcomeTruth: false,
    cryptographicSubjectBindingVerified: false,
    externalAnchorEstablished: false,
    durableExternalHeadEstablished: false,
    durableAppendOnlyExternalHistoryEstablished: false,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    ownerRollbackOrDirectoryReplacementExcluded: false,
    parallelGenesisExclusionEstablished: false,
    forkExclusionEstablished: false,
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    boundary:
      OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, verificationHash: digest(
    "durable-effect-ledger-external-head-publication-verification", body) });
}

