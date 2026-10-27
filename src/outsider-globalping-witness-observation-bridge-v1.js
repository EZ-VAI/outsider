/*
 * Additive bridge from one exact durable Globalping v2 run to an Outsider
 * external-observation source candidate.
 *
 * This module performs only local source replay.  Globalping did not sign an
 * Outsider tender, accept a witness-owner mandate, or emit the owner-signed
 * reservation/result lifecycle required by the independent-witness gate.
 * Consequently this bridge deliberately stops at
 * EXTERNAL_OBSERVATION_SOURCE_CANDIDATE_HOLD.  It cannot create authority,
 * capacity, legal independence, outcome truth, COMMIT, or a user promise.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, realpathSync,
} from "node:fs";
import path from "node:path";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V2_BOUNDARY,
  OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V2_LINEAGE,
  createGlobalpingHttpWitnessPlanV2,
  verifyGlobalpingHttpWitnessRawJournalV2,
} from "./outsider-globalping-http-witness-node-v2.js";
import {
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";

const PREFIX = "OUTSIDER_GLOBALPING_WITNESS_OBSERVATION_BRIDGE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MEASUREMENT_ID = /^[A-Za-z0-9_-]{8,128}$/u;
const MAX_PRIVATE_FILE_BYTES = 8 * 1024 * 1024;
const CREATE_URL = "https://api.globalping.io/v1/measurements";
const API_ORIGIN = "https://api.globalping.io";

const PROJECTION_FIELDS = Object.freeze([
  "actionReady", "authority", "boundary", "commitPermitted",
  "createPostAttemptCount", "createPostAutomaticRetryCount", "decisionState",
  "disposition", "evidenceRequirementDisclosed", "exactPrivateTargetBound",
  "executable", "externalCapacityEstablished", "externalCreateReceiptObserved",
  "globalpingApiCredentialPresent", "guaranteeEstablished", "humanQueueCreated",
  "independentOutcomeTruthEstablished", "internalHumanFallbackPermitted",
  "legalIndependenceEstablished", "measuredTargetCredentialsPresent",
  "measuredTargetCustomHeadersPresent", "measuredTargetMethodClass",
  "measuredTargetQueryPresent", "measuredTargetRedirectFollowRequested",
  "measurementIdDisclosed", "noQueryTargetSerialization", "observationClass",
  "oneUseEffectLedgerHeadHash", "outcomeRequirementDisclosed",
  "paidCreditsObserved", "paidCreditsPermitted", "priceEstablished",
  "privateProjectionSaltDisclosed", "privateRawJournalByteCount",
  "privateRawJournalHeadHash", "privateRawJournalMode",
  "privateRawJournalRecordCount", "privateTargetAndRequirementsBindingCommitment",
  "projectionHash", "resourceOwnerAuthorityEstablished",
  "responseBodyOrHeadersDisclosed", "schema", "schemaVersion",
  "settlementPermitted", "source", "sourceDeclaredObservationOnly",
  "sourceDeclaredRequirementMatch", "sourceDeclaredResultStatusCounts",
  "sourcePins", "statusGetCount", "targetAddressesDisclosed", "targetDisclosed",
  "targetDnsAddressCount", "targetHostnameDisclosed", "targetPathDisclosed",
  "targetSelectionVerificationPerformedByThisModule",
]);
const MANIFEST_FIELDS = Object.freeze([
  "authority", "commitPermitted", "decisionState", "finalProjection",
  "humanQueueCreated", "independentOutcomeTruthEstablished", "lineage",
  "liveCreatePostAttemptCount", "liveCreatePostAutomaticRetryCount",
  "manifestClass", "manifestHash", "manifestPublishedLast",
  "oneUseEffectLedger", "paidCreditsPermitted", "privateRawJournal",
  "privateTargetAndRequirementsBindingCommitment", "publicationOrder", "schema",
  "schemaVersion", "sourcePins", "sourcePinsHash",
  "targetSelectionProvenanceClass", "targetSelectionProvenanceHash",
  "targetSelectionVerificationPerformedByThisModule",
]);
const JOURNAL_RECORD_FIELDS = Object.freeze([
  "authority", "decisionState", "payload", "phase", "previousRecordHash",
  "privateRawEvidence", "publicProjectionPermitted", "recordHash", "recordedAt",
  "schema", "schemaVersion", "sequence",
]);

export const OUTSIDER_GLOBALPING_WITNESS_OBSERVATION_BRIDGE_V1_SCHEMAS
  = Object.freeze({
    bridge: "outsider/globalping-witness-observation-bridge/v1",
    binding: "outsider/globalping-witness-observation-source-binding/v1",
  });

export const OUTSIDER_GLOBALPING_WITNESS_OBSERVATION_BRIDGE_V1_BOUNDARY
  = Object.freeze({
    position: "EXTERNAL_OBSERVATION_SOURCE_CANDIDATE_HOLD",
    inputGlobalpingRevision: 2,
    exactPlanRebuilt: true,
    exactProjectionAndManifestFilesRequired: true,
    exactJournalAndLedgerReplayRequired: true,
    externalObservationSourceCandidateOnly: true,
    globalpingReceiptBindsOutsiderTender: false,
    globalpingReceiptBindsWitnessOwnerMandate: false,
    witnessOwnerSignatureMayBeMinted: false,
    witnessReservationMayBeMinted: false,
    independentWitnessLifecycleReceiptMayBeMinted: false,
    existingIndependentWitnessHoldGateInvoked: false,
    productionDeploymentRevisionAttested: false,
    resourceOwnerAuthorityEstablished: false,
    currentCapacityEstablished: false,
    legalIndependenceEstablished: false,
    independentOutcomeTruthEstablished: false,
    atomicCommitPermitted: false,
    userPromisePermitted: false,
    enabledCapabilityCount: 0,
    consequenceReach: "LOCAL_REPLAYED_SOURCE_CANDIDATE_RECORD_ONLY",
    networkIoPerformed: false,
    paymentPerformed: false,
    humanQueueCreated: false,
    internalHumanFallbackPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactObject(value, fields, code) {
  if (!plain(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || keys.some((key) => typeof key !== "string" || !fields.includes(key))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function freeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)
    || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (Object.hasOwn(descriptor, "value")) freeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isSafeInteger(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function positiveInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${code}_INVALID`);
  return value;
}

function safeDirectory(input, code) {
  if (typeof input !== "string" || !path.isAbsolute(input)) {
    fail(`${code}_ABSOLUTE_PATH_REQUIRED`);
  }
  const resolved = path.resolve(input);
  let stat;
  try { stat = lstatSync(resolved, { bigint: true }); }
  catch { fail(`${code}_UNREADABLE`); }
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || Number(stat.mode & 0o777n) !== 0o700
    || realpathSync(resolved) !== resolved
    || (typeof process.getuid === "function"
      && stat.uid !== BigInt(process.getuid()))) fail(`${code}_UNSAFE`);
  return resolved;
}

function expectedFile(value, code) {
  exactObject(value, ["bytes", "sha256"], code);
  return Object.freeze({
    bytes: positiveInteger(value.bytes, `${code}_BYTES`),
    sha256: hash(value.sha256, `${code}_SHA256`),
  });
}

function readPrivateCanonicalFile(directory, name, expected, code) {
  const root = safeDirectory(directory, `${code}_PARENT`);
  const file = path.join(root, name);
  let before;
  try { before = lstatSync(file, { bigint: true }); }
  catch { fail(`${code}_UNREADABLE`); }
  if (!before.isFile() || before.isSymbolicLink()
    || Number(before.mode & 0o777n) !== 0o600 || before.size < 2n
    || before.size > BigInt(MAX_PRIVATE_FILE_BYTES)
    || realpathSync(file) !== file
    || (typeof process.getuid === "function"
      && before.uid !== BigInt(process.getuid()))) fail(`${code}_UNSAFE`);
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size) fail(`${code}_IDENTITY_CHANGED`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (after.size !== opened.size || after.mtimeNs !== opened.mtimeNs
      || after.ctimeNs !== opened.ctimeNs) fail(`${code}_CHANGED_DURING_READ`);
    if (expected !== null && (bytes.length !== expected.bytes
      || sha256(bytes) !== expected.sha256)) fail(`${code}_PIN_MISMATCH`);
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); }
    catch { fail(`${code}_JSON_INVALID`); }
    if (!plain(value)
      || !bytes.equals(Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"))) {
      fail(`${code}_CANONICAL_BYTES_INVALID`);
    }
    return Object.freeze({ value, bytes, sha256: sha256(bytes) });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function strictBase64(value, code) {
  if (typeof value !== "string" || value.length < 4
    || value.length > MAX_PRIVATE_FILE_BYTES * 2) fail(`${code}_INVALID`);
  let bytes;
  try { bytes = Buffer.from(value, "base64"); }
  catch { fail(`${code}_INVALID`); }
  if (bytes.toString("base64") !== value) fail(`${code}_INVALID`);
  return bytes;
}

function verifyProjection(value, expected, plan) {
  exactObject(value, PROJECTION_FIELDS, "PROJECTION");
  const { projectionHash, ...body } = value;
  if (hash(projectionHash, "PROJECTION_HASH") !== expected.projectionHash
    || digest("outsider/globalping-http-witness-public-projection/v2", body)
      !== projectionHash
    || value.schema !== "outsider/globalping-http-witness-public-projection/v2"
    || value.schemaVersion !== "2.0.0"
    || value.observationClass
      !== "THIRD_PARTY_SOURCE_DECLARED_HTTP_OBSERVATION"
    || value.source !== "GLOBALPING_PUBLIC_API"
    || !same(value.sourcePins, plan.sourcePins)
    || !same(value.boundary,
      OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V2_BOUNDARY)
    || value.privateTargetAndRequirementsBindingCommitment
      !== plan.privateBindingCommitment
    || value.disposition !== "SOURCE_DECLARED_REQUIREMENT_MATCH_HOLD"
    || value.externalCreateReceiptObserved !== true
    || value.sourceDeclaredObservationOnly !== true
    || value.sourceDeclaredRequirementMatch !== true
    || value.createPostAttemptCount !== 1
    || value.createPostAutomaticRetryCount !== 0
    || !Number.isSafeInteger(value.statusGetCount) || value.statusGetCount < 1
    || value.statusGetCount > 20
    || !Number.isSafeInteger(value.targetDnsAddressCount)
    || value.targetDnsAddressCount < 1
    || value.noQueryTargetSerialization !== "QUERY_FIELD_OMITTED"
    || value.measuredTargetMethodClass !== "READ_ONLY_HEAD_OR_GET"
    || value.privateRawJournalMode !== "0600_FILES_IN_0700_DIRECTORY"
    || value.authority !== "NONE" || value.decisionState !== "HOLD") {
    fail("PROJECTION_SEMANTICS_INVALID");
  }
  exactObject(value.sourceDeclaredResultStatusCounts,
    ["finished", "failed", "offline", "other"], "PROJECTION_RESULT_COUNTS");
  if (value.sourceDeclaredResultStatusCounts.finished !== 1
    || value.sourceDeclaredResultStatusCounts.failed !== 0
    || value.sourceDeclaredResultStatusCounts.offline !== 0
    || value.sourceDeclaredResultStatusCounts.other !== 0) {
    fail("PROJECTION_RESULT_COUNTS_INVALID");
  }
  const falseFields = [
    "actionReady", "commitPermitted", "evidenceRequirementDisclosed",
    "executable", "externalCapacityEstablished", "globalpingApiCredentialPresent",
    "guaranteeEstablished", "humanQueueCreated",
    "independentOutcomeTruthEstablished", "internalHumanFallbackPermitted",
    "legalIndependenceEstablished", "measuredTargetCredentialsPresent",
    "measuredTargetCustomHeadersPresent", "measuredTargetQueryPresent",
    "measuredTargetRedirectFollowRequested", "measurementIdDisclosed",
    "outcomeRequirementDisclosed", "paidCreditsObserved", "paidCreditsPermitted",
    "priceEstablished", "privateProjectionSaltDisclosed",
    "resourceOwnerAuthorityEstablished", "responseBodyOrHeadersDisclosed",
    "settlementPermitted", "targetAddressesDisclosed", "targetDisclosed",
    "targetHostnameDisclosed", "targetPathDisclosed",
    "targetSelectionVerificationPerformedByThisModule",
  ];
  if (falseFields.some((field) => value[field] !== false)
    || value.exactPrivateTargetBound !== true) fail("PROJECTION_BOUNDARY_INVALID");
}

function verifyManifest(value, expected, plan, projection, expectedAll) {
  exactObject(value, MANIFEST_FIELDS, "MANIFEST");
  const { manifestHash, ...body } = value;
  if (hash(manifestHash, "MANIFEST_HASH") !== expected.manifestHash
    || digest("outsider/globalping-http-witness-run-manifest/v2", body)
      !== manifestHash
    || value.schema !== "outsider/globalping-http-witness-run-manifest/v2"
    || value.schemaVersion !== "2.0.0"
    || value.manifestClass !== "PRIVATE_DURABLE_RUN_RECORD_PUBLISHED_LAST"
    || !same(value.lineage, OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V2_LINEAGE)
    || !same(value.sourcePins, plan.sourcePins)
    || value.sourcePinsHash !== digest(
      "outsider/globalping-http-witness-source-pins/v2", plan.sourcePins)
    || value.targetSelectionProvenanceClass
      !== plan.targetSelectionProvenanceClass
    || value.targetSelectionProvenanceHash
      !== plan.targetSelectionProvenanceHash
    || value.targetSelectionVerificationPerformedByThisModule !== false
    || value.privateTargetAndRequirementsBindingCommitment
      !== plan.privateBindingCommitment
    || !same(value.publicationOrder,
      ["final-public-projection.json", "manifest.json"])
    || value.manifestPublishedLast !== true
    || value.liveCreatePostAttemptCount !== 1
    || value.liveCreatePostAutomaticRetryCount !== 0
    || value.paidCreditsPermitted !== false
    || value.independentOutcomeTruthEstablished !== false
    || value.commitPermitted !== false || value.humanQueueCreated !== false
    || value.authority !== "NONE" || value.decisionState !== "HOLD") {
    fail("MANIFEST_SEMANTICS_INVALID");
  }
  exactObject(value.finalProjection, ["bytes", "mode", "name", "sha256"],
    "MANIFEST_FINAL_PROJECTION");
  exactObject(value.privateRawJournal,
    ["relativeDirectory", "headHash", "recordCount", "exactByteCount",
      "directoryMode", "recordMode"], "MANIFEST_JOURNAL");
  exactObject(value.oneUseEffectLedger,
    ["relativeDirectory", "ledgerId", "headHash", "entryCount",
      "exactEntryByteCount"], "MANIFEST_LEDGER");
  if (value.finalProjection.name !== "final-public-projection.json"
    || value.finalProjection.mode !== "0600"
    || value.finalProjection.bytes !== expectedAll.finalProjection.file.bytes
    || value.finalProjection.sha256 !== expectedAll.finalProjection.file.sha256
    || value.privateRawJournal.relativeDirectory !== "raw-globalping-journal"
    || value.privateRawJournal.directoryMode !== "0700"
    || value.privateRawJournal.recordMode !== "0600"
    || value.privateRawJournal.headHash !== expectedAll.rawJournal.headHash
    || value.privateRawJournal.recordCount
      !== expectedAll.rawJournal.recordCount
    || value.privateRawJournal.exactByteCount
      !== expectedAll.rawJournal.exactByteCount
    || value.oneUseEffectLedger.relativeDirectory !== "one-use-effect-ledger"
    || value.oneUseEffectLedger.ledgerId
      !== expectedAll.oneUseEffectLedger.ledgerId
    || value.oneUseEffectLedger.headHash
      !== expectedAll.oneUseEffectLedger.headHash
    || value.oneUseEffectLedger.entryCount
      !== expectedAll.oneUseEffectLedger.entryCount
    || value.oneUseEffectLedger.exactEntryByteCount
      !== expectedAll.oneUseEffectLedger.exactEntryByteCount
    || projection.privateRawJournalHeadHash
      !== value.privateRawJournal.headHash
    || projection.privateRawJournalRecordCount
      !== value.privateRawJournal.recordCount
    || projection.privateRawJournalByteCount
      !== value.privateRawJournal.exactByteCount
    || projection.oneUseEffectLedgerHeadHash
      !== value.oneUseEffectLedger.headHash) fail("MANIFEST_BINDING_INVALID");
}

function readJournalRecords(directory, count) {
  const names = readdirSync(directory).sort();
  if (names.length !== count) fail("JOURNAL_RECORD_COUNT_CHANGED");
  return names.map((name, index) => {
    if (name !== `${String(index + 1).padStart(6, "0")}.json`) {
      fail("JOURNAL_SEQUENCE_INVALID");
    }
    const record = readPrivateCanonicalFile(directory, name, null,
      "JOURNAL_RECORD").value;
    exactObject(record, JOURNAL_RECORD_FIELDS, "JOURNAL_RECORD");
    if (record.schema
      !== "outsider/globalping-http-witness-raw-journal-record/v2"
      || record.schemaVersion !== "2.0.0" || record.sequence !== index + 1
      || record.privateRawEvidence !== true
      || record.publicProjectionPermitted !== false
      || record.authority !== "NONE" || record.decisionState !== "HOLD") {
      fail("JOURNAL_RECORD_BOUNDARY_INVALID");
    }
    instant(record.recordedAt, "JOURNAL_RECORDED_AT");
    return record;
  });
}

function responsePayload(record, code) {
  exactObject(record.payload,
    ["status", "headers", "bodyBase64", "bodyLength", "bodyHash",
      "rawResponseCaptured"], code);
  if (!Number.isSafeInteger(record.payload.status)
    || record.payload.status < 100 || record.payload.status > 599
    || !plain(record.payload.headers)
    || record.payload.rawResponseCaptured !== true) fail(`${code}_INVALID`);
  const bytes = strictBase64(record.payload.bodyBase64, `${code}_BODY_BASE64`);
  if (bytes.length !== record.payload.bodyLength
    || sha256(bytes) !== record.payload.bodyHash) fail(`${code}_BODY_INVALID`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_BODY_JSON_INVALID`); }
  if (!plain(value)) fail(`${code}_BODY_OBJECT_INVALID`);
  return { bytes, value };
}

function verifyJournalSemantics(records, plan, projection) {
  const prefix = [
    "PRIVATE_PLAN_PREPARED", "TARGET_PUBLIC_DNS_PREFLIGHT_OBSERVED",
    "INTENT_ADMITTED_FSYNCED", "SUBMIT_RESERVED_FSYNCED",
    "CREATE_REQUEST_FSYNCED_BEFORE_POST",
    "SUBMIT_ATTEMPTED_FSYNCED_BEFORE_POST", "CREATE_RESPONSE_OBSERVED",
    "ENDPOINT_RECEIPT_FSYNCED",
  ];
  const phases = [...prefix];
  for (let index = 0; index < projection.statusGetCount; index += 1) {
    phases.push("STATUS_GET_REQUEST_FSYNCED", "STATUS_GET_RESPONSE_OBSERVED");
  }
  phases.push("FINAL_SOURCE_OBSERVATION_EVALUATED");
  if (records.length !== phases.length
    || records.some((record, index) => record.phase !== phases[index])) {
    fail("JOURNAL_SUCCESS_PHASE_SEQUENCE_INVALID");
  }
  const prepared = records[0].payload;
  exactObject(prepared, ["adapterInstanceRefHash", "idempotencyKeyHash",
    "oneUseNonceHash", "permissionGrantHash", "plan", "transactionBindingHash"],
  "PREPARED_PAYLOAD");
  for (const field of ["adapterInstanceRefHash", "idempotencyKeyHash",
    "oneUseNonceHash", "permissionGrantHash", "transactionBindingHash"]) {
    hash(prepared[field], `PREPARED_${field.toUpperCase()}`);
  }
  if (!same(prepared.plan, plan)) fail("JOURNAL_PLAN_BINDING_INVALID");

  const request = records[4].payload;
  exactObject(request, ["url", "method", "headers", "bodyBase64", "bodyLength",
    "rawRequestCaptured", "containsCredentials"], "CREATE_REQUEST");
  const requestBytes = strictBase64(request.bodyBase64,
    "CREATE_REQUEST_BODY_BASE64");
  const expectedRequestBytes = Buffer.from(canonicalizeStrict(
    plan.measurementRequest), "utf8");
  if (request.url !== CREATE_URL || request.method !== "POST"
    || !same(request.headers,
      { Accept: "application/json", "Content-Type": "application/json" })
    || request.rawRequestCaptured !== true || request.containsCredentials !== false
    || request.bodyLength !== expectedRequestBytes.length
    || !requestBytes.equals(expectedRequestBytes)
    || Object.hasOwn(plan.measurementRequest.measurementOptions.request,
      "query")) fail("CREATE_REQUEST_PLAN_BINDING_INVALID");

  const created = responsePayload(records[6], "CREATE_RESPONSE");
  exactObject(created.value, ["id", "probesCount"], "CREATE_RESPONSE_BODY");
  const measurementId = created.value.id;
  if (records[6].payload.status !== 202 || !MEASUREMENT_ID.test(measurementId)
    || created.value.probesCount !== 1) fail("CREATE_RESPONSE_ACCEPTANCE_INVALID");
  let location;
  try { location = new URL(records[6].payload.headers.location, API_ORIGIN); }
  catch { fail("CREATE_RESPONSE_LOCATION_INVALID"); }
  const statusPath = `/v1/measurements/${measurementId}`;
  if (location.origin !== API_ORIGIN || location.pathname !== statusPath
    || location.search !== "" || location.hash !== ""
    || (records[6].payload.headers["x-credits-consumed"] !== undefined
      && records[6].payload.headers["x-credits-consumed"] !== "0")) {
    fail("CREATE_RESPONSE_LOCATION_OR_PAYMENT_INVALID");
  }
  const receiptHash = digest("outsider/globalping-create-response/v2", {
    status: records[6].payload.status,
    headers: records[6].payload.headers,
    bodyHash: records[6].payload.bodyHash,
    bodyLength: records[6].payload.bodyLength,
  });
  exactObject(records[7].payload,
    ["eventHash", "endpointReceiptHash", "localLedgerHeadHash"],
    "ENDPOINT_RECEIPT");
  if (records[7].payload.endpointReceiptHash !== receiptHash) {
    fail("ENDPOINT_RECEIPT_HASH_INVALID");
  }

  let finalMeasurement = null;
  let finalResponseBodyHash = null;
  for (let index = 0; index < projection.statusGetCount; index += 1) {
    const requestRecord = records[8 + index * 2];
    const responseRecord = records[9 + index * 2];
    exactObject(requestRecord.payload,
      ["url", "method", "headers", "bodyBase64", "bodyLength",
        "rawRequestCaptured", "containsCredentials"], "STATUS_REQUEST");
    if (requestRecord.payload.url !== `${API_ORIGIN}${statusPath}`
      || requestRecord.payload.method !== "GET"
      || !same(requestRecord.payload.headers, { Accept: "application/json" })
      || requestRecord.payload.bodyBase64 !== null
      || requestRecord.payload.bodyLength !== 0
      || requestRecord.payload.rawRequestCaptured !== true
      || requestRecord.payload.containsCredentials !== false) {
      fail("STATUS_REQUEST_BINDING_INVALID");
    }
    const response = responsePayload(responseRecord, "STATUS_RESPONSE");
    if (responseRecord.payload.status !== 200
      || response.value.id !== measurementId || response.value.type !== "http"
      || response.value.target !== plan.targetHostname
      || response.value.probesCount !== 1) fail("STATUS_RESPONSE_BINDING_INVALID");
    if (index + 1 < projection.statusGetCount) {
      if (response.value.status !== "in-progress") {
        fail("NONFINAL_STATUS_NOT_IN_PROGRESS");
      }
    } else {
      finalMeasurement = response.value;
      finalResponseBodyHash = responseRecord.payload.bodyHash;
    }
  }
  if (!plain(finalMeasurement) || finalMeasurement.status !== "finished"
    || !Array.isArray(finalMeasurement.results)
    || finalMeasurement.results.length !== 1) fail("FINAL_MEASUREMENT_INVALID");
  const result = finalMeasurement.results[0]?.result;
  if (!plain(result) || result.status !== "finished"
    || !Number.isSafeInteger(result.statusCode)
    || !plan.acceptableStatusCodes.includes(result.statusCode)
    || !plain(result.tls) || result.tls.authorized !== true
    || !plain(result.timings) || typeof result.timings.total !== "number"
    || !Number.isFinite(result.timings.total) || result.timings.total < 0
    || (plan.maximumTotalMilliseconds !== null
      && result.timings.total > plan.maximumTotalMilliseconds)) {
    fail("FINAL_SOURCE_DECLARATION_REQUIREMENT_MISMATCH");
  }
  const finalRecord = records.at(-1);
  exactObject(finalRecord.payload, ["independentOutcomeTruthEstablished",
    "privateMeasurementId", "sourceDeclaredRequirementMatch",
    "sourceDeclaredResultStatusCounts"], "FINAL_EVALUATION");
  if (finalRecord.payload.privateMeasurementId !== measurementId
    || finalRecord.payload.sourceDeclaredRequirementMatch !== true
    || finalRecord.payload.independentOutcomeTruthEstablished !== false
    || !same(finalRecord.payload.sourceDeclaredResultStatusCounts,
      projection.sourceDeclaredResultStatusCounts)) {
    fail("FINAL_EVALUATION_BINDING_INVALID");
  }
  return Object.freeze({
    prepared,
    endpointReceiptHash: receiptHash,
    endpointReceiptEventHash: records[7].payload.eventHash,
    finalResponseBodyHash,
    sourceObservationRecordedAt: finalRecord.recordedAt,
  });
}

function verifyLedger(directory, expected, plan, journal) {
  const verification = verifyDurableOneUseEndpointEffectLedgerV1({
    directory,
    ledgerId: expected.ledgerId,
    expectedLocalHeadHash: expected.headHash,
  });
  if (verification.ok !== true || verification.head.headHash !== expected.headHash
    || verification.head.ledgerId !== expected.ledgerId
    || verification.head.entryCount !== expected.entryCount
    || verification.exactEntryByteCount !== expected.exactEntryByteCount
    || verification.fullAncestryReplayVerified !== true
    || verification.twoPassEntrySnapshotStabilityVerified !== true
    || verification.head.effectCount !== 1
    || verification.head.terminalEffectCount !== 1
    || verification.head.transitionCounts.INTENT_ADMITTED !== 1
    || verification.head.transitionCounts.SUBMIT_RESERVED !== 1
    || verification.head.transitionCounts.SUBMIT_ATTEMPTED !== 1
    || verification.head.transitionCounts.ENDPOINT_RECEIPT_OBSERVED !== 1
    || verification.head.transitionCounts.REVOKED_BEFORE_SUBMIT !== 0
    || verification.head.transitionCounts.EXPIRED_BEFORE_SUBMIT !== 0
    || verification.head.transitionCounts.AMBIGUOUS_NO_RETRY_HOLD !== 0
    || verification.head.automaticRetryAfterSubmitAttemptedPermitted !== false) {
    fail("LEDGER_REPLAY_INVALID");
  }
  const entriesDirectory = safeDirectory(path.join(directory, "entries"),
    "LEDGER_ENTRIES");
  const finalEntry = readPrivateCanonicalFile(entriesDirectory,
    `${String(expected.entryCount).padStart(12, "0")}.json`, null,
    "LEDGER_FINAL_ENTRY").value;
  const event = finalEntry.event;
  if (!plain(event) || event.eventType !== "ENDPOINT_RECEIPT_OBSERVED"
    || event.ledgerId !== expected.ledgerId
    || event.eventHash !== journal.endpointReceiptEventHash
    || event.endpointReceiptHash !== journal.endpointReceiptHash
    || event.bodyHash !== plan.measurementRequestHash
    || event.effectDeadline !== plan.effectDeadline
    || event.transactionBindingHash !== journal.prepared.transactionBindingHash
    || event.adapterInstanceRefHash !== journal.prepared.adapterInstanceRefHash
    || event.permissionGrantHash !== journal.prepared.permissionGrantHash
    || event.oneUseNonceHash !== journal.prepared.oneUseNonceHash
    || event.idempotencyKeyHash !== journal.prepared.idempotencyKeyHash
    || event.retryAfterSubmitAttemptedPermitted !== false
    || event.authority !== "NONE" || event.decisionState !== "HOLD") {
    fail("LEDGER_FINAL_RECEIPT_BINDING_INVALID");
  }
  return verification;
}

function normalizeExpected(value) {
  exactObject(value,
    ["finalProjection", "manifest", "rawJournal", "oneUseEffectLedger"],
    "EXPECTED");
  exactObject(value.finalProjection,
    ["file", "projectionHash"], "EXPECTED_FINAL_PROJECTION");
  exactObject(value.manifest, ["file", "manifestHash"], "EXPECTED_MANIFEST");
  exactObject(value.rawJournal,
    ["headHash", "recordCount", "exactByteCount"], "EXPECTED_JOURNAL");
  exactObject(value.oneUseEffectLedger,
    ["ledgerId", "headHash", "entryCount", "exactEntryByteCount"],
    "EXPECTED_LEDGER");
  if (typeof value.oneUseEffectLedger.ledgerId !== "string"
    || !/^ledger_[a-f0-9]{32}$/u.test(value.oneUseEffectLedger.ledgerId)) {
    fail("EXPECTED_LEDGER_ID_INVALID");
  }
  return freeze({
    finalProjection: {
      file: expectedFile(value.finalProjection.file,
        "EXPECTED_FINAL_PROJECTION_FILE"),
      projectionHash: hash(value.finalProjection.projectionHash,
        "EXPECTED_PROJECTION_HASH"),
    },
    manifest: {
      file: expectedFile(value.manifest.file, "EXPECTED_MANIFEST_FILE"),
      manifestHash: hash(value.manifest.manifestHash,
        "EXPECTED_MANIFEST_HASH"),
    },
    rawJournal: {
      headHash: hash(value.rawJournal.headHash, "EXPECTED_JOURNAL_HEAD"),
      recordCount: positiveInteger(value.rawJournal.recordCount,
        "EXPECTED_JOURNAL_RECORD_COUNT"),
      exactByteCount: positiveInteger(value.rawJournal.exactByteCount,
        "EXPECTED_JOURNAL_BYTES"),
    },
    oneUseEffectLedger: {
      ledgerId: value.oneUseEffectLedger.ledgerId,
      headHash: hash(value.oneUseEffectLedger.headHash,
        "EXPECTED_LEDGER_HEAD"),
      entryCount: positiveInteger(value.oneUseEffectLedger.entryCount,
        "EXPECTED_LEDGER_ENTRY_COUNT"),
      exactEntryByteCount: positiveInteger(
        value.oneUseEffectLedger.exactEntryByteCount,
        "EXPECTED_LEDGER_BYTES"),
    },
  });
}

export function createGlobalpingWitnessObservationBridgeV1(input = {}) {
  exactObject(input, ["globalpingPlanInput", "privateEpisodeDirectory",
    "expected", "observedAt", "formationDeadline"], "INPUT");
  const plan = createGlobalpingHttpWitnessPlanV2(input.globalpingPlanInput);
  if (plan.sourcePins.productionDeploymentRevisionAttested !== false
    || plan.targetSelectionVerificationPerformedByThisModule !== false
    || plan.authority !== "NONE" || plan.decisionState !== "HOLD") {
    fail("PLAN_BOUNDARY_INVALID");
  }
  const observedAt = instant(input.observedAt, "OBSERVED_AT");
  const formationDeadline = instant(input.formationDeadline,
    "FORMATION_DEADLINE");
  const expected = normalizeExpected(input.expected);
  const episode = safeDirectory(input.privateEpisodeDirectory,
    "PRIVATE_EPISODE_DIRECTORY");
  const membersBefore = readdirSync(episode).sort();
  if (!same(membersBefore, ["final-public-projection.json", "manifest.json",
    "one-use-effect-ledger", "raw-globalping-journal"])) {
    fail("PRIVATE_EPISODE_LAYOUT_INVALID");
  }

  const projectionFile = readPrivateCanonicalFile(episode,
    "final-public-projection.json", expected.finalProjection.file,
    "FINAL_PROJECTION_FILE");
  const manifestFile = readPrivateCanonicalFile(episode, "manifest.json",
    expected.manifest.file, "MANIFEST_FILE");
  verifyProjection(projectionFile.value, expected.finalProjection, plan);
  verifyManifest(manifestFile.value, expected.manifest, plan,
    projectionFile.value, expected);

  const journalDirectory = safeDirectory(path.join(episode,
    "raw-globalping-journal"), "RAW_JOURNAL_DIRECTORY");
  const journalVerification = verifyGlobalpingHttpWitnessRawJournalV2({
    directory: journalDirectory,
    expectedHeadHash: expected.rawJournal.headHash,
  });
  if (journalVerification.ok !== true
    || journalVerification.headHash !== expected.rawJournal.headHash
    || journalVerification.recordCount !== expected.rawJournal.recordCount
    || journalVerification.exactByteCount !== expected.rawJournal.exactByteCount) {
    fail("JOURNAL_REPLAY_INVALID");
  }
  const records = readJournalRecords(journalDirectory,
    expected.rawJournal.recordCount);
  const journal = verifyJournalSemantics(records, plan, projectionFile.value);
  if (Date.parse(journal.sourceObservationRecordedAt) > Date.parse(observedAt)
    || Date.parse(journal.sourceObservationRecordedAt)
      > Date.parse(plan.effectDeadline)) fail("OBSERVATION_TIME_BINDING_INVALID");

  const ledgerDirectory = safeDirectory(path.join(episode,
    "one-use-effect-ledger"), "EFFECT_LEDGER_DIRECTORY");
  const ledger = verifyLedger(ledgerDirectory, expected.oneUseEffectLedger,
    plan, journal);

  // A second replay/read closes the local two-pass composition window.
  const journalSecond = verifyGlobalpingHttpWitnessRawJournalV2({
    directory: journalDirectory,
    expectedHeadHash: expected.rawJournal.headHash,
  });
  const ledgerSecond = verifyDurableOneUseEndpointEffectLedgerV1({
    directory: ledgerDirectory,
    ledgerId: expected.oneUseEffectLedger.ledgerId,
    expectedLocalHeadHash: expected.oneUseEffectLedger.headHash,
  });
  readPrivateCanonicalFile(episode, "final-public-projection.json",
    expected.finalProjection.file, "FINAL_PROJECTION_FILE_SECOND_PASS");
  readPrivateCanonicalFile(episode, "manifest.json", expected.manifest.file,
    "MANIFEST_FILE_SECOND_PASS");
  if (!same(membersBefore, readdirSync(episode).sort())
    || !same(journalSecond, journalVerification)
    || ledgerSecond.ok !== true
    || ledgerSecond.verificationHash !== ledger.verificationHash) {
    fail("SOURCE_SET_CHANGED_DURING_REPLAY");
  }

  const sourceBinding = {
    schema:
      OUTSIDER_GLOBALPING_WITNESS_OBSERVATION_BRIDGE_V1_SCHEMAS.binding,
    globalpingPlanHash: plan.planHash,
    globalpingMeasurementRequestHash: plan.measurementRequestHash,
    privateTargetAndRequirementsBindingCommitment: plan.privateBindingCommitment,
    outcomeRequirementHash: plan.outcomeRequirementHash,
    evidenceRequirementHash: plan.evidenceRequirementHash,
    targetSelectionProvenanceClass: plan.targetSelectionProvenanceClass,
    targetSelectionProvenanceHash: plan.targetSelectionProvenanceHash,
    targetSelectionVerificationPerformedByGlobalpingModule: false,
    globalpingProductionDeploymentRevisionAttested: false,
    finalProjectionFile: expected.finalProjection.file,
    finalProjectionHash: expected.finalProjection.projectionHash,
    manifestFile: expected.manifest.file,
    manifestHash: expected.manifest.manifestHash,
    rawJournal: expected.rawJournal,
    oneUseEffectLedger: expected.oneUseEffectLedger,
    globalpingTransactionBindingHash: journal.prepared.transactionBindingHash,
    globalpingAdapterInstanceRefHash: journal.prepared.adapterInstanceRefHash,
    globalpingPermissionGrantHash: journal.prepared.permissionGrantHash,
    globalpingOneUseNonceHash: journal.prepared.oneUseNonceHash,
    globalpingIdempotencyKeyHash: journal.prepared.idempotencyKeyHash,
    globalpingEndpointReceiptHash: journal.endpointReceiptHash,
    finalStatusResponseBodyHash: journal.finalResponseBodyHash,
    sourceObservationRecordedAt: journal.sourceObservationRecordedAt,
  };
  const sourceBindingHash = digest(
    OUTSIDER_GLOBALPING_WITNESS_OBSERVATION_BRIDGE_V1_SCHEMAS.binding,
    sourceBinding);
  const deadlineReached = Date.parse(observedAt) >= Date.parse(formationDeadline);
  const disposition = deadlineReached
    ? "DECLINE_NOT_HUMAN_QUEUE"
    : "CONTINUE_AUTOMATED_FORMATION_HOLD";
  const body = {
    schema: OUTSIDER_GLOBALPING_WITNESS_OBSERVATION_BRIDGE_V1_SCHEMAS.bridge,
    schemaVersion: "1.0.0",
    recordClass: "EXTERNAL_OBSERVATION_SOURCE_CANDIDATE_HOLD",
    candidateState: "AWAITING_INDEPENDENT_WITNESS_OWNER_ADOPTION",
    observedAt,
    formationDeadline,
    deadlineReached,
    disposition,
    sourceBinding,
    sourceBindingHash,
    exactGlobalpingV2PlanRebuilt: true,
    exactFinalProjectionInternalHashAndFilePinVerified: true,
    exactManifestInternalHashAndFilePinVerified: true,
    exactRawJournalHeadRecordAndByteBindingsReplayed: true,
    exactOneUseLedgerHeadEntryAndByteBindingsReplayed: true,
    exactCreateReceiptAndFinalStatusSourceBytesReplayed: true,
    exactOutcomeEvidenceAndTargetSelectionCommitmentsBound: true,
    thirdPartySourceDeclarationAppeared: true,
    sourceDeclaredRequirementMatch: true,
    externalObservationSourceCandidatePresent: true,
    globalpingProductionDeploymentRevisionAttested: false,
    globalpingReceiptBindsOutsiderTender: false,
    globalpingReceiptBindsWitnessOwnerMandate: false,
    witnessOwnerSignaturePresent: false,
    witnessObservationResponsibilityReservationPresent: false,
    independentWitnessLifecycleReceiptPresent: false,
    existingIndependentWitnessHoldGateInvoked: false,
    eligibleForExistingIndependentWitnessHoldGate: false,
    ownerAdoptionRequired: true,
    ownerAdoptionEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    currentCapacityEstablished: false,
    capacityReserved: false,
    legalIndependenceEstablished: false,
    independentWitnessControlEstablished: false,
    independentOutcomeTruthEstablished: false,
    atomicCommitmentGateSatisfied: false,
    atomicCommit: false,
    userOutcomePromiseIssued: false,
    enabledCapabilityCount: 0,
    enabledCapabilityTypes: Object.freeze([]),
    provenAuthorityCapabilityCount: 0,
    provenAuthorityCapabilityTypes: Object.freeze([]),
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "LOCAL_REPLAYED_SOURCE_CANDIDATE_RECORD_ONLY",
    gapCodes: Object.freeze([
      "GLOBALPING_RECEIPT_NOT_BOUND_TO_OUTSIDER_TENDER",
      "WITNESS_OWNER_MANDATE_ABSENT",
      "WITNESS_OWNER_SIGNATURE_ABSENT",
      "WITNESS_RESERVATION_ABSENT",
      "INDEPENDENT_WITNESS_LIFECYCLE_RECEIPT_ABSENT",
      "GLOBALPING_PRODUCTION_DEPLOYMENT_REVISION_NOT_ATTESTED",
      "TARGET_SELECTION_VERIFICATION_NOT_PERFORMED_BY_GLOBALPING_MODULE",
      "LEGAL_INDEPENDENCE_NOT_ESTABLISHED",
      "INDEPENDENT_OUTCOME_TRUTH_NOT_ESTABLISHED",
      "ATOMIC_COMMIT_PREMISES_INCOMPLETE",
    ]),
    bridgeFilesystemReadPerformed: true,
    bridgeNetworkIoPerformed: false,
    paymentPerformed: false,
    price: null,
    priceEstablished: false,
    guarantee: null,
    guaranteeEstablished: false,
    settlement: null,
    settlementPermitted: false,
    humanQueueCreated: false,
    internalHumanFallbackPermitted: false,
    sourceEpisodeDirectoryDisclosed: false,
    rawSourceBytesProjected: false,
    targetOrMeasurementIdProjected: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_GLOBALPING_WITNESS_OBSERVATION_BRIDGE_V1_BOUNDARY,
  };
  return freeze({ ...body, bridgeHash: digest(
    OUTSIDER_GLOBALPING_WITNESS_OBSERVATION_BRIDGE_V1_SCHEMAS.bridge, body) });
}
