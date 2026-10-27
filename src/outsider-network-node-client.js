/*
 * Private, HOLD-only client for the existing three-step Network Intake wire.
 *
 * Preview is pure and performs no I/O.  Send has no default fetch: a caller
 * must inject the transport explicitly.  The transport key proves possession
 * of a submission key only; it is never an actor, authority, or outcome
 * identity.  This module persists neither keys nor records.  Any caller-owned
 * private key or bundle file remains subject to a 0600 file-mode requirement.
 */

import { createHash, createPublicKey } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  NETWORK_INTAKE_BOUNDARY,
  NETWORK_INTAKE_SCHEMAS,
  createNetworkIntakeManifest,
  createNetworkIntakePayloadEnvelope,
  createNetworkIntakeReservation,
  createNetworkIntakeRevocation,
  networkIntakeDigest,
  verifyNetworkIntakeChallenge,
  verifyNetworkIntakeManifest,
  verifyNetworkIntakePayloadEnvelope,
  verifyNetworkIntakeReceipt,
  verifyNetworkIntakeRevocation,
  verifyNetworkIntakeRevocationAcknowledgment,
  verifyNetworkIntakeReservation,
} from "./outsider-network-intake.js";
import {
  OUTSIDER_NETWORK_NODE_SDK_BOUNDARY,
  buildOutsiderNetworkNodeConformance,
  createOutsiderNetworkNodeSdkSource,
  verifyOutsiderNetworkNodeConformance,
} from "./outsider-network-node-sdk.js";

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const BufferByteLength = Buffer.byteLength;
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
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
const SetConstructor = Set;
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const StringReplace = Function.prototype.call.bind(String.prototype.replace);
const TypeErrorConstructor = TypeError;
const URLConstructor = URL;
const URLPrototype = URL.prototype;
const URLProtocolGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "protocol").get);
const URLUsernameGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "username").get);
const URLPasswordGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "password").get);
const URLSearchGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "search").get);
const URLHashGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "hash").get);
const URLPathnameGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "pathname").get);
const URLToString = Function.prototype.call.bind(URL.prototype.toString);
const ResponseConstructor = Response;
const ResponsePrototype = Response.prototype;
const ResponseOkGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(ResponsePrototype, "ok").get);
const ResponseStatusGet = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(ResponsePrototype, "status").get);
const ResponseText = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(ResponsePrototype, "text").value);
const IntrinsicProbePublicKey = createPublicKey({
  key: Buffer.from("302a300506032b6570032100" + "00".repeat(32), "hex"),
  format: "der",
  type: "spki",
});
const IntrinsicPublicKeyPrototype = ObjectGetPrototypeOf(IntrinsicProbePublicKey);
const IntrinsicAsymmetricKeyPrototype = ObjectGetPrototypeOf(IntrinsicPublicKeyPrototype);
const KeyObjectAsymmetricKeyType = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(IntrinsicAsymmetricKeyPrototype, "asymmetricKeyType").get);
const KeyObjectExport = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(IntrinsicPublicKeyPrototype, "export").value);
const CryptoHashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const CryptoHashUpdate = Function.prototype.call.bind(CryptoHashPrototype.update);
const CryptoHashDigest = Function.prototype.call.bind(CryptoHashPrototype.digest);

export const OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS = ObjectFreeze({
  preview: "outsider/network-node-submission-preview/v1",
  bundle: "outsider/network-node-submission-bundle/v1",
  revocationBundle: "outsider/network-node-revocation-bundle/v1",
  verification: "outsider/network-node-submission-verification/v1",
  revocationVerification: "outsider/network-node-revocation-verification/v1",
});

export const OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY = deepFreeze({
  pilotClass: "PRIVATE_ANCHOR_REPORTING_NODE_HOLD_ONLY",
  existingGatewayWireOnly: true,
  publicDeploymentReady: false,
  previewPerformsIo: false,
  sendRequiresInjectedFetch: true,
  clientPersistencePerformed: false,
  transportKeyPersistencePerformed: false,
  unsignedGatewayResponseClaimsRetained: false,
  reservationEventRetainedOnlyAsSignedSettlementPredecessor: true,
  exactReservationSettlementEventChainRequired: true,
  settlementEventRetainedOnlyWhenBoundBySignedReceipt: true,
  externalAudienceRegistryRetentionPinsRequired: true,
  externalServerKeyEpochPinsRequired: true,
  keyEpochValidityWindow: "HALF_OPEN_VALID_FROM_INCLUSIVE_VALID_UNTIL_EXCLUSIVE",
  callerManagedPrivateFileModeRequired: "0600",
  transportSignerIsActorIdentity: false,
  transportSignerIsAuthority: false,
  transportSignerIsOutcomeAdjudicator: false,
  disposition: "QUARANTINED",
  decision: "HOLD",
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
});

export const OUTSIDER_NETWORK_NODE_REVOCATION_BOUNDARY = deepFreeze({
  pilotClass: "PRIVATE_ANCHOR_REPORTING_NODE_HOLD_ONLY",
  withdrawalScope: "EXACT_RESERVATION_TRANSPORT_WITHDRAWAL",
  publicDeploymentReady: false,
  sendRequiresInjectedFetch: true,
  clientPersistencePerformed: false,
  transportKeyPersistencePerformed: false,
  transportSignerRole: "TRANSPORT_POSSESSION_ONLY",
  transportSignerIsActorIdentity: false,
  transportSignerIsAuthority: false,
  transportSignerIsOutcomeAdjudicator: false,
  revocationEventFullChainInclusionEstablished: false,
  externalEventHeadAnchored: false,
  networkDenominatorDecremented: false,
  historicalOccurrenceRemoved: false,
  disposition: "QUARANTINED",
  decision: "HOLD",
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
});

const NETWORK_SERVER_BOUNDARY = deepFreeze({
  ...NETWORK_INTAKE_BOUNDARY,
  disposition: "QUARANTINED",
  automaticTraining: false,
  trainingRows: 0,
  authorityGrants: 0,
  actionAdmissions: 0,
  ceuUnits: 0,
  permitsAuthority: false,
  permitsAction: false,
  permitsCeu: false,
  permitsCuratePromotion: false,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const NETWORK_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function fail(code) {
  throw new TypeErrorConstructor(`OUTSIDER_NETWORK_NODE_CLIENT_${code}`);
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

function rejectTree(value, seen = new SetConstructor(), depth = 0) {
  if (value === null || typeof value !== "object") return;
  if (depth > 96) fail("VALUE_TOO_DEEP");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
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

function denseArray(value, code, maximum = 64) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function clone(value) {
  rejectTree(value);
  return deepFreeze(JSONParse(canonicalizeStrict(value)));
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function canonicalTime(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)
    || DateToISOString(new DateConstructor(value)) !== value) fail(`${code}_INVALID`);
  return value;
}

function digestBytes(value) {
  const state = createHash("sha256");
  CryptoHashUpdate(state, value);
  return `sha256:${CryptoHashDigest(state, "hex")}`;
}

function transportKeyId(privateKeyPem) {
  if (typeof privateKeyPem !== "string") fail("TRANSPORT_PRIVATE_KEY_PEM_REQUIRED");
  try {
    const der = KeyObjectExport(createPublicKey(privateKeyPem),
      { type: "spki", format: "der" });
    return digestBytes(der);
  } catch {
    fail("TRANSPORT_PRIVATE_KEY_INVALID");
  }
}

function httpsOrigin(value, code) {
  if (typeof value !== "string") fail(`${code}_REQUIRED`);
  let parsed;
  try { parsed = new URLConstructor(value); } catch { fail(`${code}_INVALID`); }
  const pathname = URLPathnameGet(parsed);
  if (URLProtocolGet(parsed) !== "https:" || URLUsernameGet(parsed) !== ""
    || URLPasswordGet(parsed) !== "" || URLSearchGet(parsed) !== ""
    || URLHashGet(parsed) !== "" || (pathname !== "" && pathname !== "/")) {
    fail(`${code}_HTTPS_ORIGIN_REQUIRED`);
  }
  return StringReplace(URLToString(parsed), /\/$/u, "");
}

function endpointOrigin(value) {
  return httpsOrigin(value, "ENDPOINT");
}

function nowIso(clock, code) {
  if (typeof clock !== "function") fail("CLOCK_FUNCTION_REQUIRED");
  const value = clock();
  if (typeof value === "string") return canonicalTime(value, code);
  if (value === null || typeof value !== "object") fail(`${code}_INVALID`);
  return canonicalTime(DateToISOString(value), code);
}

function previewBody(input) {
  exactObject(input, ["manifestInput", "sdkReleaseHash", "nodeSoftwareRevisionHash",
    "providerPatternReview", "adapterDeclarations", "nativeSafetyEvidenceRefs"],
  "PREVIEW_INPUT");
  const manifest = createNetworkIntakeManifest(input.manifestInput);
  const payload = clone(input.manifestInput.payload);
  const nodeSource = createOutsiderNetworkNodeSdkSource({
    sdkReleaseHash: input.sdkReleaseHash,
    nodeSoftwareRevisionHash: input.nodeSoftwareRevisionHash,
    providerPatternReview: input.providerPatternReview,
    networkManifest: manifest,
    payload,
    adapterDeclarations: input.adapterDeclarations,
    nativeSafetyEvidenceRefs: input.nativeSafetyEvidenceRefs,
  });
  const nodeConformance = buildOutsiderNetworkNodeConformance(nodeSource);
  return {
    schema: OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.preview,
    previewClass: "PURE_NETWORK_INTAKE_AND_NODE_CONFORMANCE_PREVIEW_HOLD_ONLY",
    manifest,
    payload,
    nodeSource,
    nodeConformance,
    transport: {
      requestPerformed: false,
      transportSignerBound: false,
      transportSignerIsActorIdentity: false,
      callerManagedPrivateKeyFileModeRequired: "0600",
    },
    decision: "HOLD",
    boundary: OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY,
  };
}

export function createOutsiderNetworkNodeSubmissionPreview(input = {}) {
  rejectTree(input);
  canonicalizeStrict(input);
  const body = previewBody(input);
  return deepFreeze({ ...body, previewHash: networkIntakeDigest(
    OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.preview, body) });
}

function replayPreview(record, expectedPreviewHash) {
  rejectTree(record);
  canonicalizeStrict(record);
  exactObject(record, ["schema", "previewClass", "manifest", "payload", "nodeSource",
    "nodeConformance", "transport", "decision", "boundary", "previewHash"], "PREVIEW");
  if (record.schema !== OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.preview
    || record.previewClass
      !== "PURE_NETWORK_INTAKE_AND_NODE_CONFORMANCE_PREVIEW_HOLD_ONLY"
    || record.decision !== "HOLD"
    || !same(record.boundary, OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY)) {
    fail("PREVIEW_STATE_INVALID");
  }
  exactObject(record.transport, ["requestPerformed", "transportSignerBound",
    "transportSignerIsActorIdentity", "callerManagedPrivateKeyFileModeRequired"],
  "PREVIEW_TRANSPORT");
  if (record.transport.requestPerformed !== false
    || record.transport.transportSignerBound !== false
    || record.transport.transportSignerIsActorIdentity !== false
    || record.transport.callerManagedPrivateKeyFileModeRequired !== "0600") {
    fail("PREVIEW_TRANSPORT_STATE_INVALID");
  }
  const manifestCheck = verifyNetworkIntakeManifest(record.manifest,
    { payload: record.payload });
  if (!manifestCheck.ok) fail(`PREVIEW_MANIFEST_REPLAY_FAILED:${manifestCheck.error}`);
  if (!same(record.nodeSource.networkManifest, record.manifest)
    || !same(record.nodeSource.payload, record.payload)) fail("PREVIEW_NODE_SOURCE_BINDING_MISMATCH");
  const conformanceCheck = verifyOutsiderNetworkNodeConformance(record.nodeConformance, {
    source: record.nodeSource,
    expectedSourceHash: record.nodeSource.sourceHash,
    expectedConformanceHash: record.nodeConformance.conformanceHash,
  });
  if (!conformanceCheck.ok) {
    fail(`PREVIEW_NODE_CONFORMANCE_REPLAY_FAILED:${conformanceCheck.error}`);
  }
  const body = {
    schema: record.schema,
    previewClass: record.previewClass,
    manifest: record.manifest,
    payload: record.payload,
    nodeSource: record.nodeSource,
    nodeConformance: record.nodeConformance,
    transport: record.transport,
    decision: record.decision,
    boundary: record.boundary,
  };
  const rebuilt = { ...body, previewHash: networkIntakeDigest(
    OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.preview, body) };
  if (!same(record, rebuilt)) fail("PREVIEW_REPLAY_INVALID");
  if (expectedPreviewHash !== null
    && record.previewHash !== hash(expectedPreviewHash, "EXPECTED_PREVIEW_HASH")) {
    fail("EXPECTED_PREVIEW_HASH_MISMATCH");
  }
  return clone(record);
}

function verificationFailure(stage, error) {
  return deepFreeze({
    schema: OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.verification,
    ok: false,
    stage,
    sourceReplayComplete: false,
    networkSourceReplayTrusted: false,
    decision: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    error: error instanceof Error ? error.message : StringConstructor(error),
    boundary: OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY,
  });
}

export function verifyOutsiderNetworkNodeSubmissionPreview(record,
  { expectedPreviewHash = null } = {}) {
  try {
    const checked = replayPreview(record, expectedPreviewHash);
    return deepFreeze({
      schema: OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.verification,
      ok: true,
      stage: "PREVIEW",
      sourceReplayComplete: true,
      previewHash: checked.previewHash,
      decision: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      boundary: OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY,
    });
  } catch (error) { return verificationFailure("PREVIEW", error); }
}

function networkDigest(domain, value) {
  return digestBytes(`outsider:network-intake:${domain}:v1\0${canonicalizeStrict(value)}`);
}

function stableOccurrenceSubjectHash(manifest) {
  const subject = manifest.subject;
  return networkDigest("stable-occurrence-subject", {
    lane: manifest.lane,
    claimHash: subject.claimHash,
    wayHash: subject.wayHash,
    worldHash: subject.worldHash,
    episodeHash: subject.episodeHash,
    attemptHash: subject.attemptHash,
    cohortHash: subject.cohortHash,
    censusSlotHash: subject.censusSlotHash,
  });
}

function semanticSubjectHash(manifest) {
  if (manifest.lane === "DELEGATION_RESPONSIBILITY") {
    return manifest.subject.accountableDeploymentSubjectHash;
  }
  if (manifest.lane === "ACTION_OUTCOME") return manifest.subject.attemptActorSubjectHash;
  return manifest.subject.censusSlotHash;
}

function exactLifecycleEvent(event, bindings, eventType, reasonCode, trustPolicy) {
  exactObject(event, ["schema", "ordinal", "previousEventHash", "reservationHash",
    "manifestHash", "lane", "clientSubmissionId", "challengeServerKeyId", "registryId",
    "retentionPolicyVersion", "appliedRetentionDays", "retentionUntil", "eventType",
    "objectIdentityHash", "occurrenceIdentityHash", "stableOccurrenceSubjectHash",
    "semanticSubjectHash", "censusSlotHash", "occurredAt", "disposition", "reasonCode",
    "eventHash"], "LIFECYCLE_EVENT");
  const manifest = bindings.reservation.manifest;
  if (event.schema !== "outsider/network-intake-event/v2"
    || !NumberIsSafeInteger(event.ordinal) || event.ordinal < 1
    || event.reservationHash !== bindings.reservation.reservationHash
    || event.manifestHash !== manifest.manifestHash || event.lane !== manifest.lane
    || event.clientSubmissionId !== manifest.clientSubmissionId
    || event.challengeServerKeyId !== bindings.challenge.signature.keyId
    || event.registryId !== trustPolicy.expectedRegistryId
    || event.retentionPolicyVersion !== trustPolicy.expectedRetentionPolicyVersion
    || !NumberIsSafeInteger(event.appliedRetentionDays)
    || event.appliedRetentionDays < 1
    || event.appliedRetentionDays > manifest.retentionDays
    || event.appliedRetentionDays > trustPolicy.maxAppliedRetentionDays
    || event.eventType !== eventType
    || event.objectIdentityHash !== manifest.payload.objectIdentityHash
    || event.occurrenceIdentityHash !== manifest.occurrenceIdentityHash
    || event.stableOccurrenceSubjectHash !== stableOccurrenceSubjectHash(manifest)
    || event.semanticSubjectHash !== semanticSubjectHash(manifest)
    || event.censusSlotHash !== manifest.subject.censusSlotHash
    || event.disposition !== "QUARANTINED" || event.reasonCode !== reasonCode) {
    fail("LIFECYCLE_EVENT_BINDING_INVALID");
  }
  hash(event.previousEventHash, "LIFECYCLE_PREVIOUS_EVENT_HASH");
  canonicalTime(event.retentionUntil, "LIFECYCLE_RETENTION_UNTIL");
  canonicalTime(event.occurredAt, "LIFECYCLE_OCCURRED_AT");
  if (DateParse(event.occurredAt) >= DateParse(event.retentionUntil)) {
    fail("LIFECYCLE_EVENT_OUTSIDE_RETENTION_WINDOW");
  }
  const { eventHash, ...body } = event;
  if (eventHash !== networkDigest("lifecycle-event", body)) fail("LIFECYCLE_EVENT_HASH_MISMATCH");
  return event;
}

function exactReservationEvent(event, bindings, trustPolicy) {
  exactLifecycleEvent(event, bindings, "RESERVED", null, trustPolicy);
  if (DateParse(event.occurredAt) < DateParse(bindings.reservation.reservedAt)
    || DateParse(event.occurredAt) >= DateParse(bindings.reservation.expiresAt)
    || DateToISOString(new DateConstructor(DateParse(event.occurredAt)
      + event.appliedRetentionDays * 86_400_000)) !== event.retentionUntil) {
    fail("RESERVATION_EVENT_TIME_INVALID");
  }
  return event;
}

function exactLifecycleEventChain(reservationEvent, settlementEvent, bindings, trustPolicy) {
  exactReservationEvent(reservationEvent, bindings, trustPolicy);
  exactLifecycleEvent(settlementEvent, bindings, "QUARANTINED",
    "PENDING_CURATE_REVIEW", trustPolicy);
  if (settlementEvent.ordinal !== reservationEvent.ordinal + 1
    || settlementEvent.previousEventHash !== reservationEvent.eventHash
    || settlementEvent.registryId !== reservationEvent.registryId
    || settlementEvent.retentionPolicyVersion !== reservationEvent.retentionPolicyVersion
    || settlementEvent.appliedRetentionDays !== reservationEvent.appliedRetentionDays
    || settlementEvent.retentionUntil !== reservationEvent.retentionUntil
    || DateParse(settlementEvent.occurredAt) < DateParse(reservationEvent.occurredAt)) {
    fail("RESERVATION_SETTLEMENT_EVENT_CHAIN_INVALID");
  }
  return settlementEvent;
}

function exactReservationResponse(value, bindings, trustPolicy) {
  exactObject(value, ["accepted", "duplicate", "reservationHash", "authenticatedAt",
    "status", "retention", "event", "useBoundary"], "RESERVATION_RESPONSE");
  exactObject(value.retention, ["retentionPolicyVersion", "appliedRetentionDays",
    "retentionUntil"], "RESERVATION_RETENTION");
  if (value.accepted !== true || value.duplicate !== false
    || value.reservationHash !== bindings.reservation.reservationHash
    || value.status !== "OPEN" || !same(value.useBoundary, NETWORK_SERVER_BOUNDARY)
    || value.retention.retentionPolicyVersion
      !== trustPolicy.expectedRetentionPolicyVersion
    || !NumberIsSafeInteger(value.retention.appliedRetentionDays)
    || value.retention.appliedRetentionDays < 1
    || value.retention.appliedRetentionDays > bindings.reservation.manifest.retentionDays
    || value.retention.appliedRetentionDays > trustPolicy.maxAppliedRetentionDays) {
    fail("RESERVATION_RESPONSE_STATE_INVALID");
  }
  const authenticatedAt = canonicalTime(value.authenticatedAt, "AUTHENTICATED_AT");
  const retentionUntil = canonicalTime(value.retention.retentionUntil,
    "RESERVATION_RETENTION_UNTIL");
  if (DateParse(authenticatedAt) < DateParse(bindings.reservation.reservedAt)
    || DateParse(authenticatedAt) >= DateParse(bindings.reservation.expiresAt)
    || DateToISOString(new DateConstructor(DateParse(authenticatedAt)
      + value.retention.appliedRetentionDays * 86_400_000)) !== retentionUntil) {
    fail("RESERVATION_RESPONSE_TIME_INVALID");
  }
  exactReservationEvent(value.event, bindings, trustPolicy);
  if (value.event.occurredAt !== authenticatedAt
    || value.event.retentionUntil !== retentionUntil
    || value.event.appliedRetentionDays !== value.retention.appliedRetentionDays) {
    fail("RESERVATION_RESPONSE_EVENT_MISMATCH");
  }
  return value;
}

function exactSettlementResponse(value, bindings, trustPolicy) {
  exactObject(value, ["appended", "duplicate", "objectAlreadyPresent", "occurrenceOrdinal",
    "event", "receipt", "useBoundary"], "SETTLEMENT_RESPONSE");
  if (value.appended !== true || value.duplicate !== false
    || typeof value.objectAlreadyPresent !== "boolean"
    || !NumberIsSafeInteger(value.occurrenceOrdinal) || value.occurrenceOrdinal < 1
    || !same(value.useBoundary, NETWORK_SERVER_BOUNDARY)) fail("SETTLEMENT_RESPONSE_STATE_INVALID");
  exactLifecycleEventChain(bindings.reservationEvent, value.event, bindings, trustPolicy);
  if (value.receipt.eventHash !== value.event.eventHash
    || value.receipt.eventOrdinal !== value.event.ordinal
    || value.receipt.objectAlreadyPresent !== value.objectAlreadyPresent
    || value.receipt.registryId !== trustPolicy.expectedRegistryId
    || value.receipt.registryId !== value.event.registryId
    || value.receipt.receivedAt !== value.event.occurredAt
    || value.receipt.retentionUntil !== value.event.retentionUntil) {
    fail("SETTLEMENT_RESPONSE_EVENT_RECEIPT_MISMATCH");
  }
  return value;
}

function publicKeyId(publicKeyPem, code) {
  if (typeof publicKeyPem !== "string") fail(`${code}_PUBLIC_KEY_INVALID`);
  try {
    const publicKey = createPublicKey(publicKeyPem);
    if (KeyObjectAsymmetricKeyType(publicKey) !== "ed25519") {
      fail(`${code}_PUBLIC_KEY_INVALID`);
    }
    return digestBytes(KeyObjectExport(publicKey, { type: "spki", format: "der" }));
  } catch { fail(`${code}_PUBLIC_KEY_INVALID`); }
}

function normalizeKeyEpochs(value, code) {
  denseArray(value, `${code}_EPOCHS`, 64);
  if (value.length < 1) fail(`${code}_EPOCHS_EMPTY`);
  const result = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["keyId", "publicKeyPem", "validFrom", "validUntil"],
      `${code}_EPOCH`);
    const keyId = hash(row.keyId, `${code}_KEY_ID`);
    const derivedKeyId = publicKeyId(row.publicKeyPem, code);
    const validFrom = canonicalTime(row.validFrom, `${code}_VALID_FROM`);
    const validUntil = canonicalTime(row.validUntil, `${code}_VALID_UNTIL`);
    if (derivedKeyId !== keyId || DateParse(validUntil) <= DateParse(validFrom)) {
      fail(`${code}_EPOCH_INVALID`);
    }
    append(result, { keyId, publicKeyPem: row.publicKeyPem, validFrom, validUntil });
  }
  ArraySort(result, (left, right) => left.keyId < right.keyId ? -1
    : left.keyId > right.keyId ? 1
      : left.validFrom < right.validFrom ? -1 : left.validFrom > right.validFrom ? 1 : 0);
  for (let index = 1; index < result.length; index += 1) {
    const previous = result[index - 1];
    const current = result[index];
    if (current.keyId === previous.keyId && current.validFrom < previous.validUntil) {
      fail(`${code}_EPOCH_OVERLAP`);
    }
  }
  return result;
}

function normalizeTrustPolicy(value) {
  exactObject(value, ["expectedAudience", "expectedRegistryId",
    "expectedRetentionPolicyVersion", "maxAppliedRetentionDays",
    "challengeServerKeyEpochs", "receiptServerKeyEpochs"], "TRUST_POLICY");
  const expectedAudience = httpsOrigin(value.expectedAudience, "EXPECTED_AUDIENCE");
  if (typeof value.expectedRegistryId !== "string"
    || !RegExpTest(NETWORK_TOKEN, value.expectedRegistryId)) {
    fail("EXPECTED_REGISTRY_ID_INVALID");
  }
  if (typeof value.expectedRetentionPolicyVersion !== "string"
    || !RegExpTest(NETWORK_TOKEN, value.expectedRetentionPolicyVersion)) {
    fail("EXPECTED_RETENTION_POLICY_VERSION_INVALID");
  }
  if (!NumberIsSafeInteger(value.maxAppliedRetentionDays)
    || value.maxAppliedRetentionDays < 1 || value.maxAppliedRetentionDays > 3650) {
    fail("MAX_APPLIED_RETENTION_DAYS_INVALID");
  }
  return {
    expectedAudience,
    expectedRegistryId: value.expectedRegistryId,
    expectedRetentionPolicyVersion: value.expectedRetentionPolicyVersion,
    maxAppliedRetentionDays: value.maxAppliedRetentionDays,
    challengeServerKeyEpochs: normalizeKeyEpochs(value.challengeServerKeyEpochs,
      "CHALLENGE_SERVER_KEY"),
    receiptServerKeyEpochs: normalizeKeyEpochs(value.receiptServerKeyEpochs,
      "RECEIPT_SERVER_KEY"),
  };
}

function selectKeyEpoch(epochs, signature, at, code) {
  exactObject(signature, ["algorithm", "keyId", "publicKeyPem", "value"],
    `${code}_SIGNATURE`);
  const when = DateParse(canonicalTime(at, `${code}_AT`));
  let selected = null;
  let matches = 0;
  for (let index = 0; index < epochs.length; index += 1) {
    const epoch = epochs[index];
    if (epoch.keyId === signature.keyId && epoch.publicKeyPem === signature.publicKeyPem
      && when >= DateParse(epoch.validFrom) && when < DateParse(epoch.validUntil)) {
      selected = epoch;
      matches += 1;
    }
  }
  if (matches !== 1) fail(`${code}_NO_UNIQUE_VALID_EXTERNAL_EPOCH`);
  return selected;
}

function bundleBody(input) {
  const trustPolicy = normalizeTrustPolicy(input.trustPolicy);
  const preview = replayPreview(input.preview, input.preview.previewHash);
  const manifest = preview.manifest;
  const reservation = input.reservation;
  const challengeEpoch = selectKeyEpoch(trustPolicy.challengeServerKeyEpochs,
    input.challenge.signature, input.challenge.issuedAt, "CHALLENGE_SERVER_KEY_EPOCH");
  const receiptEpoch = selectKeyEpoch(trustPolicy.receiptServerKeyEpochs,
    input.receipt.signature, input.receipt.receivedAt, "RECEIPT_SERVER_KEY_EPOCH");
  const challengeCheck = verifyNetworkIntakeChallenge(input.challenge, {
    serverPublicKeyPem: challengeEpoch.publicKeyPem,
    expectedAudience: trustPolicy.expectedAudience,
    expectedManifestHash: manifest.manifestHash,
    expectedTransportSignerKeyId: reservation.transportSignerKeyId,
    at: reservation.reservedAt,
  });
  if (!challengeCheck.ok) fail(`BUNDLE_CHALLENGE_INVALID:${challengeCheck.error}`);
  const reservationCheck = verifyNetworkIntakeReservation(reservation, {
    challenge: input.challenge,
    serverPublicKeyPem: challengeEpoch.publicKeyPem,
    expectedAudience: trustPolicy.expectedAudience,
  });
  if (!reservationCheck.ok) fail(`BUNDLE_RESERVATION_INVALID:${reservationCheck.error}`);
  const envelopeCheck = verifyNetworkIntakePayloadEnvelope(input.payloadEnvelope, {
    reservation,
    challenge: input.challenge,
    serverPublicKeyPem: challengeEpoch.publicKeyPem,
    expectedAudience: trustPolicy.expectedAudience,
  });
  if (!envelopeCheck.ok) fail(`BUNDLE_PAYLOAD_ENVELOPE_INVALID:${envelopeCheck.error}`);
  const receiptCheck = verifyNetworkIntakeReceipt(input.receipt, {
    challengeServerPublicKeyPem: challengeEpoch.publicKeyPem,
    receiptServerPublicKeyPem: receiptEpoch.publicKeyPem,
    reservation,
    payloadEnvelope: input.payloadEnvelope,
    challenge: input.challenge,
    expectedAudience: trustPolicy.expectedAudience,
  });
  if (!receiptCheck.ok) fail(`BUNDLE_RECEIPT_INVALID:${receiptCheck.error}`);
  exactLifecycleEventChain(input.reservationEvent, input.settlementEvent,
    { reservation, challenge: input.challenge }, trustPolicy);
  if (input.receipt.eventHash !== input.settlementEvent.eventHash
    || input.receipt.eventOrdinal !== input.settlementEvent.ordinal
    || input.receipt.receivedAt !== input.settlementEvent.occurredAt
    || input.receipt.retentionUntil !== input.settlementEvent.retentionUntil
    || input.receipt.registryId !== input.settlementEvent.registryId
    || input.receipt.registryId !== trustPolicy.expectedRegistryId) {
    fail("BUNDLE_SERVER_EVENT_BINDING_MISMATCH");
  }
  return {
    schema: OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.bundle,
    bundleClass: "EXISTING_NETWORK_WIRE_SOURCE_REPLAYED_QUARANTINE_HOLD_ONLY",
    preview,
    networkTrust: {
      expectedAudience: trustPolicy.expectedAudience,
      expectedRegistryId: trustPolicy.expectedRegistryId,
      expectedRetentionPolicyVersion: trustPolicy.expectedRetentionPolicyVersion,
      maxAppliedRetentionDays: trustPolicy.maxAppliedRetentionDays,
      challengeServerKeyId: challengeEpoch.keyId,
      challengeKeyEpochValidAtIssuedAt: true,
      receiptServerKeyId: receiptEpoch.keyId,
      receiptKeyEpochValidAtReceivedAt: true,
      externalTrustPinsApplied: true,
    },
    challenge: clone(input.challenge),
    reservation: clone(reservation),
    payloadEnvelope: clone(input.payloadEnvelope),
    reservationEvent: clone(input.reservationEvent),
    settlementEvent: clone(input.settlementEvent),
    receipt: clone(input.receipt),
    transport: {
      transportSignerKeyId: reservation.transportSignerKeyId,
      transportPossessionProofVerified: true,
      transportSignerIsActorIdentity: false,
      transportSignerIsAuthority: false,
      transportSignerIsOutcomeAdjudicator: false,
    },
    disposition: "QUARANTINED",
    decision: "HOLD",
    boundary: OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY,
  };
}

function makeBundle(input) {
  const body = bundleBody(input);
  return deepFreeze({ ...body, bundleHash: networkIntakeDigest(
    OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.bundle, body) });
}

function replayBundle(record, context) {
  rejectTree(record);
  rejectTree(context);
  canonicalizeStrict(record);
  exactObject(context, ["expectedBundleHash", "trustPolicy"], "BUNDLE_VERIFY_CONTEXT");
  const trustPolicy = normalizeTrustPolicy(context.trustPolicy);
  exactObject(record, ["schema", "bundleClass", "preview", "networkTrust", "challenge",
    "reservation", "payloadEnvelope", "reservationEvent", "settlementEvent", "receipt",
    "transport", "disposition", "decision", "boundary", "bundleHash"], "BUNDLE");
  if (record.schema !== OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.bundle
    || record.bundleClass
      !== "EXISTING_NETWORK_WIRE_SOURCE_REPLAYED_QUARANTINE_HOLD_ONLY"
    || record.disposition !== "QUARANTINED" || record.decision !== "HOLD"
    || !same(record.boundary, OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY)) {
    fail("BUNDLE_STATE_INVALID");
  }
  const rebuilt = makeBundle({
    preview: record.preview,
    trustPolicy,
    challenge: record.challenge,
    reservation: record.reservation,
    payloadEnvelope: record.payloadEnvelope,
    reservationEvent: record.reservationEvent,
    settlementEvent: record.settlementEvent,
    receipt: record.receipt,
  });
  if (!same(record, rebuilt)) fail("BUNDLE_REPLAY_INVALID");
  if (record.bundleHash !== hash(context.expectedBundleHash, "EXPECTED_BUNDLE_HASH")) {
    fail("EXPECTED_BUNDLE_HASH_MISMATCH");
  }
  return rebuilt;
}

export function verifyOutsiderNetworkNodeSubmissionBundle(record, context = {}) {
  try {
    const checked = replayBundle(record, context);
    return deepFreeze({
      schema: OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.verification,
      ok: true,
      stage: "BUNDLE",
      sourceReplayComplete: true,
      networkSourceReplayTrusted: true,
      bundleHash: checked.bundleHash,
      previewHash: checked.preview.previewHash,
      receiptHash: checked.receipt.receiptHash,
      disposition: "QUARANTINED",
      decision: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      boundary: OUTSIDER_NETWORK_NODE_CLIENT_BOUNDARY,
    });
  } catch (error) { return verificationFailure("BUNDLE", error); }
}

function revocationVerificationFailure(stage, error) {
  return deepFreeze({
    schema: OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.revocationVerification,
    ok: false,
    stage,
    sourceReplayComplete: false,
    networkSourceReplayTrusted: false,
    revocationEventFullChainInclusionEstablished: false,
    externalEventHeadAnchored: false,
    decision: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    error: error instanceof Error ? error.message : StringConstructor(error),
    boundary: OUTSIDER_NETWORK_NODE_REVOCATION_BOUNDARY,
  });
}

function revocationBundleBody(input) {
  const trustPolicy = normalizeTrustPolicy(input.trustPolicy);
  const challengeEpoch = selectKeyEpoch(trustPolicy.challengeServerKeyEpochs,
    input.challenge.signature, input.challenge.issuedAt,
    "REVOCATION_CHALLENGE_SERVER_KEY_EPOCH");
  const reservation = input.reservation;
  const challengeCheck = verifyNetworkIntakeChallenge(input.challenge, {
    serverPublicKeyPem: challengeEpoch.publicKeyPem,
    expectedAudience: trustPolicy.expectedAudience,
    expectedManifestHash: reservation.manifest.manifestHash,
    expectedTransportSignerKeyId: reservation.transportSignerKeyId,
    at: reservation.reservedAt,
  });
  if (!challengeCheck.ok) {
    fail(`REVOCATION_BUNDLE_CHALLENGE_INVALID:${challengeCheck.error}`);
  }
  const reservationCheck = verifyNetworkIntakeReservation(reservation, {
    challenge: input.challenge, serverPublicKeyPem: challengeEpoch.publicKeyPem,
    expectedAudience: trustPolicy.expectedAudience,
  });
  if (!reservationCheck.ok) {
    fail(`REVOCATION_BUNDLE_RESERVATION_INVALID:${reservationCheck.error}`);
  }
  const revocationCheck = verifyNetworkIntakeRevocation(input.revocation, { reservation,
    expectedAudience: trustPolicy.expectedAudience,
    expectedRegistryId: trustPolicy.expectedRegistryId,
    expectedTransportPublicKeyPem: reservation.signature.publicKeyPem,
    at: input.acknowledgment.processedAt });
  if (!revocationCheck.ok) {
    fail(`REVOCATION_BUNDLE_REQUEST_INVALID:${revocationCheck.error}`);
  }
  const acknowledgmentEpoch = selectKeyEpoch(trustPolicy.receiptServerKeyEpochs,
    input.acknowledgment.signature, input.acknowledgment.processedAt,
    "REVOCATION_ACKNOWLEDGMENT_SERVER_KEY_EPOCH");
  const acknowledgmentCheck = verifyNetworkIntakeRevocationAcknowledgment(
    input.acknowledgment, { revocation: input.revocation, reservation,
      expectedAudience: trustPolicy.expectedAudience,
      expectedRegistryId: trustPolicy.expectedRegistryId,
      receiptServerPublicKeyPem: acknowledgmentEpoch.publicKeyPem });
  if (!acknowledgmentCheck.ok) {
    fail(`REVOCATION_BUNDLE_ACKNOWLEDGMENT_INVALID:${acknowledgmentCheck.error}`);
  }
  exactLifecycleEvent(input.revocationEvent,
    { reservation, challenge: input.challenge }, "REVOKED",
    "SIGNED_TRANSPORT_WITHDRAWAL", trustPolicy);
  const requestDelta = DateParse(input.revocationEvent.occurredAt)
    - DateParse(input.revocation.requestedAt);
  if (input.revocationEvent.eventHash !== input.acknowledgment.revokedEventHash
    || input.revocationEvent.ordinal !== input.acknowledgment.revokedEventOrdinal
    || input.revocationEvent.occurredAt !== input.acknowledgment.processedAt
    || input.revocationEvent.registryId !== input.acknowledgment.registryId
    || input.revocationEvent.registryId !== trustPolicy.expectedRegistryId
    || requestDelta < -300_000 || requestDelta > 300_000
    || DateParse(input.revocationEvent.occurredAt)
      >= DateParse(input.revocationEvent.retentionUntil)) {
    fail("REVOCATION_BUNDLE_EVENT_ACKNOWLEDGMENT_MISMATCH");
  }
  return {
    schema: OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.revocationBundle,
    bundleClass: "EXACT_RESERVATION_TRANSPORT_WITHDRAWAL_QUARANTINE_HOLD_ONLY",
    networkTrust: {
      expectedAudience: trustPolicy.expectedAudience,
      expectedRegistryId: trustPolicy.expectedRegistryId,
      expectedRetentionPolicyVersion: trustPolicy.expectedRetentionPolicyVersion,
      challengeServerKeyId: challengeEpoch.keyId,
      challengeKeyEpochValidAtIssuedAt: true,
      acknowledgmentServerKeyId: acknowledgmentEpoch.keyId,
      acknowledgmentKeyEpochValidAtProcessedAt: true,
      externalTrustPinsApplied: true,
      revocationEventFullChainInclusionEstablished: false,
      externalEventHeadAnchored: false,
    },
    challenge: clone(input.challenge),
    reservation: clone(reservation),
    revocation: clone(input.revocation),
    revocationEvent: clone(input.revocationEvent),
    acknowledgment: clone(input.acknowledgment),
    transport: {
      transportSignerKeyId: reservation.transportSignerKeyId,
      transportPossessionProofVerified: true,
      transportSignerRole: "TRANSPORT_POSSESSION_ONLY",
      transportSignerIsActorIdentity: false,
      transportSignerIsAuthority: false,
      transportSignerIsOutcomeAdjudicator: false,
    },
    disposition: "QUARANTINED",
    decision: "HOLD",
    boundary: OUTSIDER_NETWORK_NODE_REVOCATION_BOUNDARY,
  };
}

function makeRevocationBundle(input) {
  const body = revocationBundleBody(input);
  return deepFreeze({ ...body, revocationBundleHash: networkIntakeDigest(
    OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.revocationBundle, body) });
}

function replayRevocationBundle(record, context) {
  rejectTree(record);
  rejectTree(context);
  canonicalizeStrict(record);
  exactObject(context, ["expectedRevocationBundleHash", "trustPolicy"],
    "REVOCATION_BUNDLE_VERIFY_CONTEXT");
  const trustPolicy = normalizeTrustPolicy(context.trustPolicy);
  exactObject(record, ["schema", "bundleClass", "networkTrust", "challenge",
    "reservation", "revocation", "revocationEvent", "acknowledgment", "transport",
    "disposition", "decision", "boundary", "revocationBundleHash"],
  "REVOCATION_BUNDLE");
  if (record.schema !== OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.revocationBundle
    || record.bundleClass
      !== "EXACT_RESERVATION_TRANSPORT_WITHDRAWAL_QUARANTINE_HOLD_ONLY"
    || record.disposition !== "QUARANTINED" || record.decision !== "HOLD"
    || !same(record.boundary, OUTSIDER_NETWORK_NODE_REVOCATION_BOUNDARY)) {
    fail("REVOCATION_BUNDLE_STATE_INVALID");
  }
  const rebuilt = makeRevocationBundle({ trustPolicy,
    challenge: record.challenge, reservation: record.reservation,
    revocation: record.revocation, revocationEvent: record.revocationEvent,
    acknowledgment: record.acknowledgment });
  if (!same(record, rebuilt)) fail("REVOCATION_BUNDLE_REPLAY_INVALID");
  if (record.revocationBundleHash !== hash(context.expectedRevocationBundleHash,
    "EXPECTED_REVOCATION_BUNDLE_HASH")) {
    fail("EXPECTED_REVOCATION_BUNDLE_HASH_MISMATCH");
  }
  return rebuilt;
}

export function verifyOutsiderNetworkNodeRevocationBundle(record, context = {}) {
  try {
    const checked = replayRevocationBundle(record, context);
    return deepFreeze({
      schema: OUTSIDER_NETWORK_NODE_CLIENT_SCHEMAS.revocationVerification,
      ok: true,
      stage: "REVOCATION_BUNDLE",
      sourceReplayComplete: true,
      networkSourceReplayTrusted: true,
      revocationBundleHash: checked.revocationBundleHash,
      revocationHash: checked.revocation.revocationHash,
      acknowledgmentHash: checked.acknowledgment.acknowledgmentHash,
      revokedEventHash: checked.revocationEvent.eventHash,
      revocationEventFullChainInclusionEstablished: false,
      externalEventHeadAnchored: false,
      disposition: "QUARANTINED",
      decision: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      boundary: OUTSIDER_NETWORK_NODE_REVOCATION_BOUNDARY,
    });
  } catch (error) { return revocationVerificationFailure("REVOCATION_BUNDLE", error); }
}

async function responseJson(response, label) {
  if (!(response instanceof ResponseConstructor) || ResponseOkGet(response) !== true) {
    const status = response instanceof ResponseConstructor
      && NumberIsSafeInteger(ResponseStatusGet(response)) ? ResponseStatusGet(response) : "INVALID";
    fail(`${label}_HTTP_${status}`);
  }
  const text = await ResponseText(response);
  if (typeof text !== "string" || BufferByteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    fail(`${label}_RESPONSE_TOO_LARGE`);
  }
  let parsed;
  try { parsed = JSONParse(text); } catch { fail(`${label}_JSON_INVALID`); }
  rejectTree(parsed);
  canonicalizeStrict(parsed);
  return parsed;
}

async function postJson(fetchImpl, url, value, label) {
  const response = await fetchImpl(url, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json" },
    body: canonicalizeStrict(value),
  });
  return responseJson(response, label);
}

export async function sendOutsiderNetworkNodeRevocation(input = {}) {
  rejectTree(input);
  exactObject(input, ["reservation", "challenge", "endpoint", "transportPrivateKeyPem",
    "trustPolicy", "fetchImpl", "clock"], "REVOCATION_SEND_INPUT");
  const endpoint = endpointOrigin(input.endpoint);
  const trustPolicy = normalizeTrustPolicy(input.trustPolicy);
  if (endpoint !== trustPolicy.expectedAudience) fail("ENDPOINT_AUDIENCE_MISMATCH");
  if (typeof input.fetchImpl !== "function") fail("INJECTED_FETCH_REQUIRED");
  const signerKeyId = transportKeyId(input.transportPrivateKeyPem);
  if (signerKeyId !== input.reservation?.transportSignerKeyId) {
    fail("REVOCATION_TRANSPORT_SIGNER_MISMATCH");
  }
  const challengeEpoch = selectKeyEpoch(trustPolicy.challengeServerKeyEpochs,
    input.challenge?.signature, input.challenge?.issuedAt,
    "REVOCATION_CHALLENGE_SERVER_KEY_EPOCH");
  const challengeCheck = verifyNetworkIntakeChallenge(input.challenge, {
    serverPublicKeyPem: challengeEpoch.publicKeyPem,
    expectedAudience: trustPolicy.expectedAudience,
    expectedManifestHash: input.reservation?.manifest?.manifestHash,
    expectedTransportSignerKeyId: signerKeyId,
    at: input.reservation?.reservedAt,
  });
  if (!challengeCheck.ok) fail(`REVOCATION_CHALLENGE_INVALID:${challengeCheck.error}`);
  const reservationCheck = verifyNetworkIntakeReservation(input.reservation, {
    challenge: input.challenge, serverPublicKeyPem: challengeEpoch.publicKeyPem,
    expectedAudience: trustPolicy.expectedAudience,
  });
  if (!reservationCheck.ok) fail(`REVOCATION_RESERVATION_INVALID:${reservationCheck.error}`);
  const requestedAt = nowIso(input.clock, "REVOCATION_REQUESTED_AT");
  const revocation = createNetworkIntakeRevocation({ reservation: input.reservation,
    audience: trustPolicy.expectedAudience, registryId: trustPolicy.expectedRegistryId,
    requestedAt, transportPrivateKeyPem: input.transportPrivateKeyPem });
  const response = await postJson(input.fetchImpl, `${endpoint}/v1/network/revocations`,
    revocation, "REVOCATION");
  exactObject(response, ["revoked", "duplicate", "event", "acknowledgment", "useBoundary"],
    "REVOCATION_RESPONSE");
  if (response.revoked !== true || typeof response.duplicate !== "boolean"
    || !same(response.useBoundary, NETWORK_SERVER_BOUNDARY)) {
    fail("REVOCATION_RESPONSE_STATE_INVALID");
  }
  const bundle = makeRevocationBundle({ trustPolicy, challenge: input.challenge,
    reservation: input.reservation, revocation, revocationEvent: response.event,
    acknowledgment: response.acknowledgment });
  const verified = verifyOutsiderNetworkNodeRevocationBundle(bundle, {
    expectedRevocationBundleHash: bundle.revocationBundleHash, trustPolicy,
  });
  if (!verified.ok) fail(`FINAL_REVOCATION_BUNDLE_REPLAY_FAILED:${verified.error}`);
  return bundle;
}

export async function sendOutsiderNetworkNodeSubmission(input = {}) {
  rejectTree(input);
  exactObject(input, ["preview", "endpoint", "transportPrivateKeyPem",
    "trustPolicy", "fetchImpl", "clock"], "SEND_INPUT");
  const preview = replayPreview(input.preview, input.preview?.previewHash ?? null);
  const endpoint = endpointOrigin(input.endpoint);
  const trustPolicy = normalizeTrustPolicy(input.trustPolicy);
  if (endpoint !== trustPolicy.expectedAudience) fail("ENDPOINT_AUDIENCE_MISMATCH");
  if (typeof input.fetchImpl !== "function") fail("INJECTED_FETCH_REQUIRED");
  const signerKeyId = transportKeyId(input.transportPrivateKeyPem);
  const challenge = await postJson(input.fetchImpl, `${endpoint}/v1/network/challenges`, {
    manifest: preview.manifest,
    transportSignerKeyId: signerKeyId,
  }, "CHALLENGE");
  const challengeEpoch = selectKeyEpoch(trustPolicy.challengeServerKeyEpochs,
    challenge.signature, challenge.issuedAt, "CHALLENGE_SERVER_KEY_EPOCH");
  const reservedAt = nowIso(input.clock, "RESERVED_AT");
  const challengeCheck = verifyNetworkIntakeChallenge(challenge, {
    serverPublicKeyPem: challengeEpoch.publicKeyPem,
    expectedAudience: trustPolicy.expectedAudience,
    expectedManifestHash: preview.manifest.manifestHash,
    expectedTransportSignerKeyId: signerKeyId,
    at: reservedAt,
  });
  if (!challengeCheck.ok) fail(`CHALLENGE_INVALID:${challengeCheck.error}`);
  const reservation = createNetworkIntakeReservation({
    manifest: preview.manifest,
    challenge,
    transportPrivateKeyPem: input.transportPrivateKeyPem,
    serverPublicKeyPem: challengeEpoch.publicKeyPem,
    expectedAudience: trustPolicy.expectedAudience,
    reservedAt,
    expiresAt: challenge.expiresAt,
  });
  const reservationResponse = exactReservationResponse(await postJson(input.fetchImpl,
    `${endpoint}/v1/network/reservations`, { challenge, reservation }, "RESERVATION"),
  { challenge, reservation }, trustPolicy);
  const payloadCreatedAt = nowIso(input.clock, "PAYLOAD_CREATED_AT");
  const payloadEnvelope = createNetworkIntakePayloadEnvelope({
    reservation,
    challenge,
    payload: preview.payload,
    transportPrivateKeyPem: input.transportPrivateKeyPem,
    serverPublicKeyPem: challengeEpoch.publicKeyPem,
    expectedAudience: trustPolicy.expectedAudience,
    createdAt: payloadCreatedAt,
  });
  const settlementResponse = exactSettlementResponse(await postJson(input.fetchImpl,
    `${endpoint}/v1/network/reservations/${reservation.reservationHash}/payload`,
    payloadEnvelope, "SETTLEMENT"), {
    challenge,
    reservation,
    reservationEvent: reservationResponse.event,
  }, trustPolicy);
  const receiptEpoch = selectKeyEpoch(trustPolicy.receiptServerKeyEpochs,
    settlementResponse.receipt.signature, settlementResponse.receipt.receivedAt,
    "RECEIPT_SERVER_KEY_EPOCH");
  const receiptCheck = verifyNetworkIntakeReceipt(settlementResponse.receipt, {
    challengeServerPublicKeyPem: challengeEpoch.publicKeyPem,
    receiptServerPublicKeyPem: receiptEpoch.publicKeyPem,
    reservation,
    payloadEnvelope,
    challenge,
    expectedAudience: trustPolicy.expectedAudience,
  });
  if (!receiptCheck.ok) fail(`RECEIPT_INVALID:${receiptCheck.error}`);
  const bundle = makeBundle({
    preview,
    trustPolicy,
    challenge,
    reservation,
    payloadEnvelope,
    reservationEvent: reservationResponse.event,
    settlementEvent: settlementResponse.event,
    receipt: settlementResponse.receipt,
  });
  const verified = verifyOutsiderNetworkNodeSubmissionBundle(bundle, {
    expectedBundleHash: bundle.bundleHash,
    trustPolicy,
  });
  if (!verified.ok) fail(`FINAL_BUNDLE_REPLAY_FAILED:${verified.error}`);
  return bundle;
}

export const OUTSIDER_NETWORK_NODE_CLIENT_NETWORK_SERVER_BOUNDARY_FOR_TESTS
  = NETWORK_SERVER_BOUNDARY;
