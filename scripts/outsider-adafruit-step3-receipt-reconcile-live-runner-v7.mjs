#!/usr/bin/env node

/*
 * Adafruit Step 3 receipt-only reconciliation v7.
 *
 * This descendant exists only for the precise crash boundary where the v6
 * address save_two effect reached Adafruit, while the local HOLD ended
 * AMBIGUOUS before its Step 3 receipt was persisted.  It verifies that exact
 * partial tree, consumes a newly issued read-only grant, copies the evolved
 * order-scoped cookie into a fresh private tree, and performs only:
 *
 *   GET /checkout -> same-origin GET /checkout?step=3
 *
 * No contact, address, shipping-selection, payment, or order POST exists in
 * this runner.  Exact response bytes and response metadata remain private;
 * only content hashes and normalized quote facts enter the public projection.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createBuyerNativeRouteEvidenceV1,
} from "../src/outsider-buyer-native-route-evidence-v1.js";
import {
  createOrderScopedBuyerNativeHttpsTransportV1,
} from "../src/outsider-order-scoped-buyer-native-https-transport-v1.js";

const PREFIX = "OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILE_LIVE_RUNNER_V7_";
const ORIGIN = "https://www.adafruit.com";
const PROVIDER = "ADAFRUIT_GUEST_SHOPPER";
const PURPOSE = "READ_EXISTING_STEP3_QUOTE_RECEIPT_ONLY";
const PRIOR_PROJECTION_SCHEMA
  = "outsider/adafruit-full-address-shipping-quote-public-projection/v5";
const PRIOR_MANIFEST_SCHEMA
  = "outsider/private-adafruit-full-address-shipping-quote-manifest/v5";
const PRIOR_GRANT_SCHEMA
  = "outsider/private-adafruit-address-quote-residual-use-grant/v6";
const PRIOR_USE_SCHEMA
  = "outsider/private-adafruit-address-residual-grant-use/v6";
const EVENT_SCHEMA = "outsider/buyer-native-transaction-private-event/v1";
const HANDLE_SCHEMA
  = "outsider/buyer-native-transaction-private-response-handle/v2";
const PUBLIC_SCHEMA
  = "outsider/adafruit-step3-receipt-reconcile-public-projection/v7";
const MANIFEST_SCHEMA
  = "outsider/private-adafruit-step3-receipt-reconcile-manifest/v7";
const SOURCE_OCCURRENCE_SCHEMA
  = "outsider/adafruit-step3-read-only-source-occurrence/v7";
const SOURCE_RECEIPT_SCHEMA
  = "outsider/private-adafruit-step3-read-only-source-receipt/v7";
const USE_SCHEMA
  = "outsider/private-adafruit-step3-receipt-reconciliation-grant-use/v7";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_SOURCE_BYTES = 768 * 1024;
const PERMITTED_ACTIONS = Object.freeze([
  "READ_EXISTING_CHECKOUT_STEP_3_RECEIPT",
]);
const FORBIDDEN_ACTIONS = Object.freeze([
  "ADDRESS_RESUBMISSION",
  "CONTACT_RESUBMISSION",
  "CROSS_ORIGIN_DISCLOSURE",
  "MARKETING_SUBSCRIPTION",
  "ORDER_SUBMISSION",
  "PAYMENT",
  "PII_PUBLIC_PROJECTION",
  "SHIPPING_METHOD_APPLICATION",
]);

export const OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILIATION_GRANT_SCHEMA_V7
  = "outsider/private-adafruit-step3-receipt-reconciliation-grant/v7";

export const OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILE_V7_BOUNDARY
  = Object.freeze({
    predecessorEffect:
      "ADDRESS_SAVE_TWO_EXTERNALLY_SUCCEEDED_HOLD_AMBIGUOUS",
    predecessorReplayed: false,
    predecessorTreesMutated: false,
    readOnlyReceiptRecovery: true,
    allowedRequests: Object.freeze([
      "GET https://www.adafruit.com/checkout",
      "GET https://www.adafruit.com/checkout?step=3",
    ]),
    maximumHttpRequests: 2,
    maximumRedirects: 1,
    contactPostAllowed: false,
    addressPostAllowed: false,
    shippingMethodApplied: false,
    paymentAllowed: false,
    orderAllowed: false,
    marketingAllowed: false,
    exactResponseBytesPrivate0600: true,
    publicProjectionPiiFree: true,
    capacityReserved: false,
    independentOutcomeTruthEstablished: false,
    userResultCommitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return bytesHash(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) fail(`${code}_FIELDS_INVALID`);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function exactArray(value, expected, code) {
  if (!Array.isArray(value)
    || canonicalizeStrict(value) !== canonicalizeStrict(expected)) fail(`${code}_INVALID`);
  return value;
}

function privateBytes(file, code, maximum = MAX_JSON_BYTES) {
  if (typeof file !== "string" || file === "") fail(`${code}_REQUIRED`);
  const absolute = path.resolve(file);
  let info;
  try { info = lstatSync(absolute); } catch { fail(`${code}_UNAVAILABLE`); }
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 1
    || info.size > maximum) fail(`${code}_NOT_PRIVATE`);
  const bytes = readFileSync(absolute);
  return Object.freeze({ absolute, bytes, bytesHash: bytesHash(bytes) });
}

function canonicalFile(file, code, maximum = MAX_JSON_BYTES) {
  const record = privateBytes(file, code, maximum);
  const source = record.bytes.toString("utf8");
  let value;
  try { value = JSON.parse(source); } catch { fail(`${code}_JSON_INVALID`); }
  const trailing = source.endsWith("\n") ? "\n" : "";
  if (`${canonicalizeStrict(value)}${trailing}` !== source) {
    fail(`${code}_NOT_CANONICAL`);
  }
  return Object.freeze({ ...record, value });
}

function verifySealed(value, schema, hashField, code) {
  if (value?.schema !== schema || !HASH.test(value?.[hashField] ?? "")) {
    fail(`${code}_SCHEMA_INVALID`);
  }
  const { [hashField]: claimed, ...body } = value;
  if (claimed !== digest(schema, body)) fail(`${code}_HASH_INVALID`);
  return value;
}

function privateDirectory(directory, code) {
  if (typeof directory !== "string" || directory === "") fail(`${code}_REQUIRED`);
  const absolute = path.resolve(directory);
  let info;
  try { info = lstatSync(absolute); } catch { fail(`${code}_UNAVAILABLE`); }
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail(`${code}_NOT_PRIVATE`);
  return absolute;
}

function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("PRIVATE_DIRECTORY_INVALID");
}

function syncDirectory(directory) {
  let descriptor;
  try { descriptor = openSync(directory, "r"); fsyncSync(descriptor); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function writeBytesOnce(file, bytes) {
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    }
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  chmodSync(file, 0o600);
  syncDirectory(path.dirname(file));
  return Object.freeze({ file, bytes: bytes.length, hash: bytesHash(bytes) });
}

function writeOnce(file, value) {
  return writeBytesOnce(file,
    Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"));
}

function inventory(root, relative = "") {
  const directory = path.join(root, relative);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("ARTIFACT_DIRECTORY_NOT_PRIVATE");
  const rows = [];
  for (const name of readdirSync(directory).sort()) {
    const childRelative = relative === "" ? name : path.join(relative, name);
    const child = path.join(root, childRelative);
    const childInfo = lstatSync(child);
    if (childInfo.isSymbolicLink()) fail("ARTIFACT_SYMLINK_FORBIDDEN");
    if (childInfo.isDirectory()) rows.push(...inventory(root, childRelative));
    else {
      if (!childInfo.isFile() || (childInfo.mode & 0o777) !== 0o600) {
        fail("ARTIFACT_FILE_NOT_PRIVATE");
      }
      const bytes = readFileSync(child);
      rows.push(Object.freeze({
        relativePath: childRelative.split(path.sep).join("/"),
        bytes: bytes.length,
        bytesHash: bytesHash(bytes),
      }));
    }
  }
  return Object.freeze(rows);
}

function cookieRecord(file, code) {
  const record = canonicalFile(file, code, 256 * 1024);
  exact(record.value, ["schema", "schemaVersion", "orderRefHash",
    "nextCreationIndex", "cookies"], code);
  if (record.value.schema !== "outsider/order-scoped-buyer-native-cookie-jar/v1"
    || record.value.schemaVersion !== "1.0.0"
    || !HASH.test(record.value.orderRefHash ?? "")
    || !Number.isSafeInteger(record.value.nextCreationIndex)
    || record.value.nextCreationIndex < 0
    || !Array.isArray(record.value.cookies)
    || path.basename(record.absolute)
      !== `${record.value.orderRefHash.slice(7)}.cookies-v1.json`) {
    fail(`${code}_BINDING_INVALID`);
  }
  return record;
}

function priorState(priorRunDirectory, inputRecord) {
  const directory = privateDirectory(priorRunDirectory, "PRIOR_V5_RUN");
  const projectionRecord = canonicalFile(path.join(directory,
    "public-projection.v5.json"), "PRIOR_V5_PROJECTION");
  const manifestRecord = canonicalFile(path.join(directory,
    "private-manifest.v5.json"), "PRIOR_V5_MANIFEST");
  const projection = verifySealed(projectionRecord.value,
    PRIOR_PROJECTION_SCHEMA, "projectionHash", "PRIOR_V5_PROJECTION");
  const manifest = verifySealed(manifestRecord.value,
    PRIOR_MANIFEST_SCHEMA, "manifestHash", "PRIOR_V5_MANIFEST");
  const evaluation = verifySealed(projection.exactSpecEvaluation,
    "outsider/exact-source-outcome-spec-evaluation/v5", "evaluationHash",
    "PRIOR_V5_SPEC_EVALUATION");
  if (manifest.projectionHash !== projection.projectionHash
    || manifest.inputBytesHash !== inputRecord.bytesHash
    || projection.selectedRoute?.sellerOrigin !== ORIGIN
    || projection.selectedRoute?.nativeResourceId !== "4474"
    || projection.routeCompiledProduct?.productId !== "4474"
    || projection.contactSubmitted !== true
    || projection.fullAddressSubmitted !== false
    || projection.counters?.contactPostCount !== 1
    || projection.counters?.addressQuotePostCount !== 0
    || projection.shippingMethodApplied !== false
    || projection.paymentPerformed !== false
    || projection.orderSubmitted !== false
    || projection.marketingSubscriptionPerformed !== false
    || projection.capacityReserved !== false
    || evaluation.accepted !== true
    || projection.nextGate !== "ADDRESS_FORM_NOT_AVAILABLE"
    || !Array.isArray(manifest.artifactInventory)) {
    fail("PRIOR_V5_STATE_NOT_RECONCILABLE");
  }
  const cookieEntries = manifest.artifactInventory.filter((entry) =>
    /^https-state\/[a-f0-9]{64}\.cookies-v1\.json$/u
      .test(entry.relativePath));
  if (cookieEntries.length !== 1) fail("PRIOR_V5_COOKIE_INVENTORY_INVALID");
  const cookie = cookieRecord(path.join(directory,
    cookieEntries[0].relativePath), "PRIOR_V5_COOKIE");
  if (cookie.bytesHash !== cookieEntries[0].bytesHash
    || cookie.bytes.length !== cookieEntries[0].bytes) {
    fail("PRIOR_V5_COOKIE_INVENTORY_MISMATCH");
  }
  return Object.freeze({ directory, projection, projectionRecord, manifest,
    manifestRecord, evaluation, cookie });
}

function residualState(grantFile, useFile, prior, inputRecord) {
  const grantRecord = canonicalFile(grantFile, "PRIOR_RESIDUAL_GRANT",
    64 * 1024);
  const grant = exact(grantRecord.value, ["schema", "schemaVersion",
    "supplierOrigin", "purpose", "priorProjectionHash",
    "priorManifestHash", "inputBytesHash", "permittedActions",
    "forbiddenActions", "authorizedAt", "expiresAt", "oneUse"],
  "PRIOR_RESIDUAL_GRANT");
  if (grant.schema !== PRIOR_GRANT_SCHEMA || grant.schemaVersion !== "6.0.0"
    || grant.supplierOrigin !== ORIGIN
    || grant.purpose !== "RESUME_CONFIRMED_CONTACT_TO_DESTINATION_QUOTE_ONLY"
    || grant.priorProjectionHash !== prior.projection.projectionHash
    || grant.priorManifestHash !== prior.manifest.manifestHash
    || grant.inputBytesHash !== inputRecord.bytesHash || grant.oneUse !== true) {
    fail("PRIOR_RESIDUAL_GRANT_BINDING_INVALID");
  }
  exactArray(grant.permittedActions, ["READ_CHECKOUT_STEP_2",
    "SUBMIT_ADDRESS_SAVE_TWO", "READ_SHIPPING_RATES_STEP_3"],
  "PRIOR_RESIDUAL_GRANT_ACTIONS");
  exactArray(grant.forbiddenActions, ["CONTACT_RESUBMISSION",
    "CROSS_ORIGIN_DISCLOSURE", "MARKETING_SUBSCRIPTION", "ORDER_SUBMISSION",
    "PAYMENT", "PII_PUBLIC_PROJECTION", "SHIPPING_METHOD_APPLICATION"],
  "PRIOR_RESIDUAL_GRANT_FORBIDDEN");
  instant(grant.authorizedAt, "PRIOR_RESIDUAL_GRANT_AUTHORIZED_AT");
  instant(grant.expiresAt, "PRIOR_RESIDUAL_GRANT_EXPIRES_AT");

  const useRecord = canonicalFile(useFile, "PRIOR_RESIDUAL_USE", 64 * 1024);
  const use = exact(useRecord.value, ["schema", "schemaVersion",
    "residualGrantBytesHash", "priorProjectionHash", "observedAt",
    "nonceHash", "useHash"], "PRIOR_RESIDUAL_USE");
  const { useHash, ...useBody } = use;
  if (use.schema !== PRIOR_USE_SCHEMA || use.schemaVersion !== "6.0.0"
    || use.residualGrantBytesHash !== grantRecord.bytesHash
    || use.priorProjectionHash !== prior.projection.projectionHash
    || !HASH.test(use.nonceHash ?? "")
    || useHash !== digest(PRIOR_USE_SCHEMA, useBody)
    || path.basename(useRecord.absolute)
      !== `${grantRecord.bytesHash.slice(7)}.json`) {
    fail("PRIOR_RESIDUAL_USE_BINDING_INVALID");
  }
  instant(use.observedAt, "PRIOR_RESIDUAL_USE_OBSERVED_AT");
  if (Date.parse(use.observedAt) < Date.parse(grant.authorizedAt)
    || Date.parse(use.observedAt) >= Date.parse(grant.expiresAt)) {
    fail("PRIOR_RESIDUAL_USE_OUTSIDE_GRANT");
  }
  return Object.freeze({ grantRecord, grant, useRecord, use });
}

function journalEvents(file) {
  const record = privateBytes(file, "PARTIAL_V6_JOURNAL", MAX_JSON_BYTES);
  const source = record.bytes.toString("utf8");
  if (!source.endsWith("\n")) fail("PARTIAL_V6_JOURNAL_TRUNCATED");
  const lines = source.slice(0, -1).split("\n");
  if (lines.length !== 5) fail("PARTIAL_V6_JOURNAL_EVENT_COUNT_INVALID");
  const events = [];
  let previous = null;
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try { event = JSON.parse(lines[index]); }
    catch { fail("PARTIAL_V6_JOURNAL_JSON_INVALID"); }
    if (canonicalizeStrict(event) !== lines[index]
      || event?.schema !== EVENT_SCHEMA || event.schemaVersion !== "1.0.0"
      || event.sequence !== index + 1 || event.previousEventHash !== previous) {
      fail("PARTIAL_V6_JOURNAL_CHAIN_INVALID");
    }
    const { eventHash, ...body } = event;
    if (eventHash !== digest(EVENT_SCHEMA, body)) {
      fail("PARTIAL_V6_JOURNAL_HASH_INVALID");
    }
    previous = eventHash;
    events.push(Object.freeze(event));
  }
  return Object.freeze({ ...record, events: Object.freeze(events),
    headHash: previous });
}

function validatePartialEventChain(journal, prior, residual) {
  const [opened, quoteAttempt, quoteOccurrence, holdAttempt, ambiguous]
    = journal.events;
  exact(opened, ["schema", "schemaVersion", "sequence",
    "previousEventHash", "eventType", "recordedAt", "binding", "eventHash"],
  "PARTIAL_V6_OPENED_EVENT");
  exact(opened.binding, ["transactionRefHash", "outcomeIntentRefHash",
    "routeRole", "formationExpiresAt", "capabilityRefHash", "accountRefHash",
    "nodeRefHash"], "PARTIAL_V6_RUNTIME_BINDING");
  if (opened.eventType !== "RUNTIME_OPENED"
    || opened.binding.outcomeIntentRefHash
      !== prior.projection.outcomeIntentRefHash
    || opened.binding.routeRole !== prior.projection.routeRole
    || opened.binding.formationExpiresAt !== residual.grant.expiresAt) {
    fail("PARTIAL_V6_RUNTIME_BINDING_INVALID");
  }
  for (const [field, value] of Object.entries(opened.binding)) {
    if (field !== "routeRole" && field !== "formationExpiresAt") {
      hash(value, `PARTIAL_V6_${field.toUpperCase()}`);
    }
  }
  instant(opened.recordedAt, "PARTIAL_V6_OPENED_AT");
  if (opened.recordedAt !== residual.use.observedAt) {
    fail("PARTIAL_V6_USE_TIME_BINDING_INVALID");
  }

  const attemptFields = ["schema", "schemaVersion", "sequence",
    "previousEventHash", "eventType", "recordedAt", "operation",
    "effectIdHash", "operationNonceHash", "idempotencyKeyHash",
    "requestBytesHash", "operationExpiresAt",
    "expectedPreviousOccurrenceHash", "triggerOccurrenceHash", "eventHash"];
  exact(quoteAttempt, attemptFields, "PARTIAL_V6_QUOTE_ATTEMPT");
  exact(holdAttempt, attemptFields, "PARTIAL_V6_HOLD_ATTEMPT");
  const occurrenceFields = ["schema", "schemaVersion", "sequence",
    "previousEventHash", "eventType", "recordedAt", "operation",
    "effectIdHash", "idempotencyKeyHash", "responseHandleHash",
    "sourceOccurrenceHash", "sourceBytesHash", "sourceState",
    "sourceRecordClass", "sourceExpiresAt", "previousSourceOccurrenceHash",
    "previousRuntimeState", "runtimeState", "stateExpiresAt", "eventHash"];
  exact(quoteOccurrence, occurrenceFields, "PARTIAL_V6_QUOTE_OCCURRENCE");
  exact(ambiguous, ["schema", "schemaVersion", "sequence",
    "previousEventHash", "eventType", "recordedAt", "operation",
    "effectIdHash", "idempotencyKeyHash", "runtimeState", "eventHash"],
  "PARTIAL_V6_AMBIGUOUS");

  const quotedState = `${opened.binding.routeRole}_QUOTED`;
  const unformedState = `${opened.binding.routeRole}_UNFORMED`;
  if (quoteAttempt.eventType !== "OPERATION_ATTEMPTED"
    || quoteAttempt.operation !== "QUOTE"
    || quoteAttempt.expectedPreviousOccurrenceHash !== null
    || quoteAttempt.triggerOccurrenceHash !== null
    || quoteAttempt.operationExpiresAt !== residual.grant.expiresAt
    || quoteOccurrence.eventType !== "SOURCE_OCCURRENCE_OBSERVED"
    || quoteOccurrence.operation !== "QUOTE"
    || quoteOccurrence.effectIdHash !== quoteAttempt.effectIdHash
    || quoteOccurrence.idempotencyKeyHash !== quoteAttempt.idempotencyKeyHash
    || quoteOccurrence.sourceState !== "QUOTE_AVAILABLE"
    || quoteOccurrence.sourceRecordClass !== "QUOTE"
    || quoteOccurrence.sourceExpiresAt !== residual.grant.expiresAt
    || quoteOccurrence.stateExpiresAt !== residual.grant.expiresAt
    || quoteOccurrence.previousSourceOccurrenceHash !== null
    || quoteOccurrence.previousRuntimeState !== unformedState
    || quoteOccurrence.runtimeState !== quotedState
    || holdAttempt.eventType !== "OPERATION_ATTEMPTED"
    || holdAttempt.operation !== "HOLD"
    || holdAttempt.requestBytesHash !== quoteAttempt.requestBytesHash
    || holdAttempt.operationExpiresAt !== residual.grant.expiresAt
    || holdAttempt.expectedPreviousOccurrenceHash
      !== quoteOccurrence.sourceOccurrenceHash
    || holdAttempt.triggerOccurrenceHash !== null
    || ambiguous.eventType !== "AMBIGUOUS_NO_RETRY_HOLD"
    || ambiguous.operation !== "HOLD"
    || ambiguous.effectIdHash !== holdAttempt.effectIdHash
    || ambiguous.idempotencyKeyHash !== holdAttempt.idempotencyKeyHash
    || ambiguous.runtimeState !== quotedState) {
    fail("PARTIAL_V6_EFFECT_CHAIN_INVALID");
  }
  for (const event of [quoteAttempt, quoteOccurrence, holdAttempt, ambiguous]) {
    instant(event.recordedAt, "PARTIAL_V6_EVENT_RECORDED_AT");
  }
  if ([quoteAttempt, quoteOccurrence, holdAttempt, ambiguous].some((event) =>
    Date.parse(event.recordedAt) < Date.parse(opened.recordedAt))
    || Date.parse(quoteOccurrence.recordedAt)
      < Date.parse(quoteAttempt.recordedAt)
    || Date.parse(holdAttempt.recordedAt)
      < Date.parse(quoteOccurrence.recordedAt)
    || Date.parse(ambiguous.recordedAt) < Date.parse(holdAttempt.recordedAt)) {
    fail("PARTIAL_V6_EVENT_TIME_ORDER_INVALID");
  }
  for (const value of [quoteAttempt.effectIdHash, quoteAttempt.operationNonceHash,
    quoteAttempt.idempotencyKeyHash, quoteAttempt.requestBytesHash,
    quoteOccurrence.responseHandleHash, quoteOccurrence.sourceOccurrenceHash,
    quoteOccurrence.sourceBytesHash, holdAttempt.effectIdHash,
    holdAttempt.operationNonceHash, holdAttempt.idempotencyKeyHash]) hash(value,
    "PARTIAL_V6_EVENT_HASH_FIELD");
  return Object.freeze({ opened, quoteAttempt, quoteOccurrence, holdAttempt,
    ambiguous });
}

function validateQuoteResponseArtifacts(partialDirectory, chain, entries) {
  const handleRelative = `runtime/${path.basename(entries.journal.relativePath,
    ".events.jsonl")}.responses/${chain.quoteAttempt.effectIdHash.slice(7)}.json`;
  const sourceRelative = handleRelative.replace(/\.json$/u, ".source-v2.bin");
  if (entries.handle.relativePath !== handleRelative
    || entries.source.relativePath !== sourceRelative) {
    fail("PARTIAL_V6_RESPONSE_PATH_BINDING_INVALID");
  }
  const handleRecord = canonicalFile(path.join(partialDirectory,
    handleRelative), "PARTIAL_V6_QUOTE_HANDLE");
  const handle = exact(handleRecord.value, ["schema", "schemaVersion",
    "schemaLineage", "transactionRefHash", "routeRole", "operation",
    "effectIdHash", "sourceObjectRefHash", "sourceBytesHash",
    "sourceBytesLength", "sourceState", "sourceExpiresAt",
    "sourceRecordClass", "handleHash"], "PARTIAL_V6_QUOTE_HANDLE");
  const { handleHash, ...handleBody } = handle;
  exact(handle.schemaLineage, ["revision", "predecessorSchema",
    "supersedesSchema", "inPlaceMutationAllowed"],
  "PARTIAL_V6_QUOTE_HANDLE_LINEAGE");
  const source = privateBytes(path.join(partialDirectory, sourceRelative),
    "PARTIAL_V6_QUOTE_SOURCE", MAX_SOURCE_BYTES);
  if (handle.schema !== HANDLE_SCHEMA || handle.schemaVersion !== "2.0.0"
    || handle.schemaLineage.revision !== 1
    || handle.schemaLineage.predecessorSchema
      !== "outsider/buyer-native-transaction-private-response-handle/v1"
    || handle.schemaLineage.supersedesSchema
      !== "outsider/buyer-native-transaction-private-response-handle/v1"
    || handle.schemaLineage.inPlaceMutationAllowed !== false
    || handleHash !== digest(HANDLE_SCHEMA, handleBody)
    || handle.transactionRefHash !== chain.opened.binding.transactionRefHash
    || handle.routeRole !== chain.opened.binding.routeRole
    || handle.operation !== "QUOTE"
    || handle.effectIdHash !== chain.quoteAttempt.effectIdHash
    || handle.sourceBytesHash !== source.bytesHash
    || handle.sourceBytesLength !== source.bytes.length
    || handle.sourceBytesHash !== chain.quoteOccurrence.sourceBytesHash
    || handle.sourceState !== "QUOTE_AVAILABLE"
    || handle.sourceExpiresAt !== chain.quoteOccurrence.sourceExpiresAt
    || handle.sourceRecordClass !== "QUOTE"
    || handleHash !== chain.quoteOccurrence.responseHandleHash
    || handle.sourceObjectRefHash !== digest(
      "outsider/buyer-native-transaction-private-response-source-object/v2", {
        transactionRefHash: handle.transactionRefHash,
        effectIdHash: handle.effectIdHash,
        sourceBytesHash: handle.sourceBytesHash,
        sourceBytesLength: handle.sourceBytesLength,
      })) fail("PARTIAL_V6_QUOTE_RESPONSE_BINDING_INVALID");
  const occurrenceBody = {
    transactionRefHash: chain.opened.binding.transactionRefHash,
    outcomeIntentRefHash: chain.opened.binding.outcomeIntentRefHash,
    routeRole: chain.opened.binding.routeRole,
    operation: "QUOTE",
    effectIdHash: chain.quoteAttempt.effectIdHash,
    sourceBytesHash: handle.sourceBytesHash,
    sourceState: handle.sourceState,
    sourceRecordClass: handle.sourceRecordClass,
    sourceExpiresAt: handle.sourceExpiresAt,
    observedAt: chain.quoteOccurrence.recordedAt,
    previousSourceOccurrenceHash: null,
  };
  if (chain.quoteOccurrence.sourceOccurrenceHash !== digest(
    "outsider/buyer-native-transaction-source-occurrence/v1", occurrenceBody)) {
    fail("PARTIAL_V6_QUOTE_OCCURRENCE_HASH_INVALID");
  }
}

function partialState(partialRunDirectory, prior, residual) {
  const directory = privateDirectory(partialRunDirectory, "PARTIAL_V6_RUN");
  const basename = path.basename(directory);
  const runMatch
    = /^adafruit-address-quote-resume-v6-\d{8}-([a-f0-9]{32})$/u
      .exec(basename);
  if (runMatch === null) fail("PARTIAL_V6_RUN_NAME_INVALID");
  const nonce = runMatch[1];
  const artifacts = inventory(directory);
  const cookieRows = artifacts.filter((entry) =>
    /^https-state\/[a-f0-9]{64}\.cookies-v1\.json$/u.test(entry.relativePath));
  const journalRows = artifacts.filter((entry) =>
    /^runtime\/transaction_[a-f0-9]{32}\.events\.jsonl$/u
      .test(entry.relativePath));
  const handleRows = artifacts.filter((entry) =>
    /^runtime\/transaction_[a-f0-9]{32}\.responses\/[a-f0-9]{64}\.json$/u
      .test(entry.relativePath));
  const sourceRows = artifacts.filter((entry) =>
    /^runtime\/transaction_[a-f0-9]{32}\.responses\/[a-f0-9]{64}\.source-v2\.bin$/u
      .test(entry.relativePath));
  if (artifacts.length !== 4 || cookieRows.length !== 1
    || journalRows.length !== 1 || handleRows.length !== 1
    || sourceRows.length !== 1) fail("PARTIAL_V6_TREE_SHAPE_INVALID");
  const entries = Object.freeze({ cookie: cookieRows[0], journal: journalRows[0],
    handle: handleRows[0], source: sourceRows[0] });
  const cookie = cookieRecord(path.join(directory, entries.cookie.relativePath),
    "PARTIAL_V6_COOKIE");
  if (cookie.bytesHash !== entries.cookie.bytesHash
    || cookie.bytes.length !== entries.cookie.bytes
    || cookie.value.orderRefHash !== prior.cookie.value.orderRefHash) {
    fail("PARTIAL_V6_COOKIE_BINDING_INVALID");
  }
  const journal = journalEvents(path.join(directory,
    entries.journal.relativePath));
  if (journal.bytesHash !== entries.journal.bytesHash
    || journal.bytes.length !== entries.journal.bytes) {
    fail("PARTIAL_V6_JOURNAL_INVENTORY_MISMATCH");
  }
  const chain = validatePartialEventChain(journal, prior, residual);
  const ref = (label) => digest("outsider/adafruit-address-resume-ref/v6", {
    priorProjectionHash: prior.projection.projectionHash, nonce, label,
  });
  if (chain.opened.binding.transactionRefHash !== ref("transaction")
    || chain.opened.binding.capabilityRefHash !== ref("capability")
    || chain.opened.binding.accountRefHash !== ref("guest-account")
    || chain.opened.binding.nodeRefHash !== ref("node")
    || residual.use.nonceHash
      !== digest("outsider/private-resume-nonce/v6", nonce)) {
    fail("PARTIAL_V6_RUN_DERIVATION_INVALID");
  }
  validateQuoteResponseArtifacts(directory, chain, entries);
  const treeBody = {
    priorProjectionHash: prior.projection.projectionHash,
    priorManifestHash: prior.manifest.manifestHash,
    priorResidualGrantBytesHash: residual.grantRecord.bytesHash,
    priorResidualGrantUseBytesHash: residual.useRecord.bytesHash,
    journalHeadHash: journal.headHash,
    quoteOccurrenceHash: chain.quoteOccurrence.sourceOccurrenceHash,
    artifacts,
  };
  return Object.freeze({ directory, artifacts, entries, cookie, journal, chain,
    partialTreeHash: digest("outsider/adafruit-partial-address-quote-tree/v7",
      treeBody) });
}

/** Inspect only hashes, state transitions, and owner-only artifacts. */
export function inspectAdafruitStep3ReceiptRecoveryContextV7(options = {}) {
  const inputRecord = privateBytes(options.inputFile, "INPUT", MAX_INPUT_BYTES);
  const prior = priorState(options.priorV5RunDirectory, inputRecord);
  const residual = residualState(options.priorResidualGrantFile,
    options.priorResidualUseFile, prior, inputRecord);
  const partial = partialState(options.partialV6RunDirectory, prior, residual);
  return Object.freeze({ inputRecord, prior, residual, partial });
}

export function createAdafruitStep3ReceiptReconciliationGrantValueV7(input = {}) {
  const authorizedAt = instant(input.authorizedAt, "AUTHORIZED_AT");
  const expiresAt = instant(input.expiresAt, "EXPIRES_AT");
  if (Date.parse(authorizedAt) >= Date.parse(expiresAt)) {
    fail("GRANT_INTERVAL_INVALID");
  }
  const hashFields = ["priorProjectionHash", "priorManifestHash",
    "inputBytesHash", "partialContinuationTreeHash",
    "partialContinuationJournalHeadHash", "partialContinuationCookieBytesHash",
    "priorResidualGrantBytesHash", "priorResidualGrantUseBytesHash"];
  for (const field of hashFields) hash(input[field], field.toUpperCase());
  return Object.freeze({
    schema: OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILIATION_GRANT_SCHEMA_V7,
    schemaVersion: "7.0.0",
    supplierOrigin: ORIGIN,
    purpose: PURPOSE,
    priorProjectionHash: input.priorProjectionHash,
    priorManifestHash: input.priorManifestHash,
    inputBytesHash: input.inputBytesHash,
    partialContinuationTreeHash: input.partialContinuationTreeHash,
    partialContinuationJournalHeadHash:
      input.partialContinuationJournalHeadHash,
    partialContinuationCookieBytesHash:
      input.partialContinuationCookieBytesHash,
    priorResidualGrantBytesHash: input.priorResidualGrantBytesHash,
    priorResidualGrantUseBytesHash: input.priorResidualGrantUseBytesHash,
    permittedActions: [...PERMITTED_ACTIONS],
    forbiddenActions: [...FORBIDDEN_ACTIONS],
    authorizedAt,
    expiresAt,
    oneUse: true,
  });
}

function reconciliationGrant(record, context) {
  const value = exact(record.value, ["schema", "schemaVersion",
    "supplierOrigin", "purpose", "priorProjectionHash", "priorManifestHash",
    "inputBytesHash", "partialContinuationTreeHash",
    "partialContinuationJournalHeadHash", "partialContinuationCookieBytesHash",
    "priorResidualGrantBytesHash", "priorResidualGrantUseBytesHash",
    "permittedActions", "forbiddenActions", "authorizedAt", "expiresAt",
    "oneUse"], "READ_ONLY_GRANT");
  if (value.schema
      !== OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILIATION_GRANT_SCHEMA_V7
    || value.schemaVersion !== "7.0.0" || value.supplierOrigin !== ORIGIN
    || value.purpose !== PURPOSE || value.oneUse !== true
    || value.priorProjectionHash
      !== context.prior.projection.projectionHash
    || value.priorManifestHash !== context.prior.manifest.manifestHash
    || value.inputBytesHash !== context.inputRecord.bytesHash
    || value.partialContinuationTreeHash !== context.partial.partialTreeHash
    || value.partialContinuationJournalHeadHash
      !== context.partial.journal.headHash
    || value.partialContinuationCookieBytesHash
      !== context.partial.cookie.bytesHash
    || value.priorResidualGrantBytesHash
      !== context.residual.grantRecord.bytesHash
    || value.priorResidualGrantUseBytesHash
      !== context.residual.useRecord.bytesHash) fail("READ_ONLY_GRANT_BINDING_INVALID");
  exactArray(value.permittedActions, PERMITTED_ACTIONS,
    "READ_ONLY_GRANT_ACTIONS");
  exactArray(value.forbiddenActions, FORBIDDEN_ACTIONS,
    "READ_ONLY_GRANT_FORBIDDEN");
  instant(value.authorizedAt, "READ_ONLY_GRANT_AUTHORIZED_AT");
  instant(value.expiresAt, "READ_ONLY_GRANT_EXPIRES_AT");
  if (Date.parse(value.authorizedAt) >= Date.parse(value.expiresAt)
    || Date.parse(value.authorizedAt)
      < Date.parse(context.partial.chain.ambiguous.recordedAt)
    || Date.parse(value.expiresAt)
      > Date.parse(context.prior.projection.completionDeadline)) {
    fail("READ_ONLY_GRANT_INTERVAL_INVALID");
  }
  return value;
}

function decodeHtml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'").replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">").replaceAll("&nbsp;", " ");
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(
    `\\b${name}=(?:\"([^\"]*)\"|'([^']*)')`, "iu"));
  return match?.[1] ?? match?.[2] ?? null;
}

function plainText(value) {
  return decodeHtml(value.replace(/<[^>]*>/gu, " "))
    .replace(/\s+/gu, " ").trim();
}

function moneyMinor(value) {
  const match = /^\$?([0-9]{1,9})(?:\.([0-9]{2}))$/u.exec(value.trim());
  if (match === null) return null;
  const result = Number(match[1]) * 100 + Number(match[2]);
  return Number.isSafeInteger(result) ? result : null;
}

const MONTH = Object.freeze({ jan: "01", feb: "02", mar: "03", apr: "04",
  may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10",
  nov: "11", dec: "12" });

function normalizedDate(source) {
  const iso = /\b(20\d{2}-\d{2}-\d{2})\b/u.exec(source)?.[1];
  if (iso !== undefined
    && new Date(`${iso}T00:00:00.000Z`).toISOString().slice(0, 10) === iso) {
    return iso;
  }
  const numeric = /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2})\b/u
    .exec(source);
  if (numeric !== null) {
    const candidate = `${numeric[3]}-${numeric[1].padStart(2, "0")}-${numeric[2].padStart(2, "0")}`;
    if (new Date(`${candidate}T00:00:00.000Z`).toISOString()
      .slice(0, 10) === candidate) return candidate;
  }
  const named = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:,)?\s+(20\d{2})\b/iu
    .exec(source);
  if (named !== null) {
    const candidate = `${named[3]}-${MONTH[named[1].slice(0, 3).toLowerCase()]}-${named[2].padStart(2, "0")}`;
    if (new Date(`${candidate}T00:00:00.000Z`).toISOString()
      .slice(0, 10) === candidate) return candidate;
  }
  return null;
}

function shippingRates(html) {
  const output = [];
  const seen = new Set();
  for (const match of html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/giu)) {
    const input = match[0].match(/<input\b[^>]*>/iu)?.[0] ?? null;
    if (input === null || (attribute(input, "type") ?? "").toLowerCase()
      !== "radio") continue;
    const name = attribute(input, "name");
    const value = attribute(input, "value");
    if (name === null || value === null || !/ship/iu.test(name)
      || value.length < 1 || value.length > 256 || seen.has(value)) continue;
    const description = plainText(match[0]);
    const amounts = [...description.matchAll(/\$[0-9]{1,9}\.[0-9]{2}/gu)]
      .map((entry) => moneyMinor(entry[0])).filter((entry) => entry !== null);
    if (amounts.length < 1) continue;
    const attributeDate = ["data-delivery-date", "data-estimated-delivery-date",
      "data-eta"].map((name) => attribute(input, name)).find((item) =>
      typeof item === "string") ?? "";
    seen.add(value);
    output.push(Object.freeze({
      rateRefHash: digest("outsider/adafruit-step3-rate/v7", {
        methodFieldName: name, methodValue: value, description,
      }),
      amountMinor: amounts.at(-1),
      selectedByProvider: /\bchecked(?:\s|=|>)/iu.test(input),
      sourceDeliveryDate: normalizedDate(attributeDate)
        ?? normalizedDate(description),
    }));
  }
  return Object.freeze(output);
}

function totals(html) {
  const output = { subtotalMinor: null, shippingMinor: null, taxMinor: null,
    totalMinor: null };
  for (const match of html.matchAll(
    /<div\b[^>]*checkout-sidebar-ot-title[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*checkout-sidebar-ot-text[^>]*>([\s\S]*?)<\/div>/giu)) {
    const label = plainText(match[1]).toLowerCase();
    const amount = moneyMinor(plainText(match[2]));
    if (amount === null) continue;
    if (/^subtotal\b/u.test(label)) output.subtotalMinor = amount;
    else if (/^shipping\b/u.test(label)) output.shippingMinor = amount;
    else if (/^tax\b/u.test(label)) output.taxMinor = amount;
    else if (/^total\b/u.test(label)) output.totalMinor = amount;
  }
  return Object.freeze(output);
}

function receiptQuote(html, completionDeadline) {
  if (/\b(?:g-recaptcha|hcaptcha|cf-turnstile|captcha)\b/iu.test(html)) {
    fail("STEP3_CAPTCHA_PRESENT");
  }
  if (/\bname=(?:"action"|'action')[^>]*\bvalue=(?:"save_two"|'save_two')/iu
    .test(html)
    || /\bvalue=(?:"save_two"|'save_two')[^>]*\bname=(?:"action"|'action')/iu
      .test(html)) fail("STEP3_IS_ADDRESS_FORM");
  if (!/\bvalue=(?:"save_three"|'save_three')/iu.test(html)) {
    fail("STEP3_PROGRESS_CONTROL_NOT_OBSERVED");
  }
  const rates = shippingRates(html);
  if (rates.length < 1) fail("STEP3_SHIPPING_RATES_NOT_OBSERVED");
  const summary = totals(html);
  const selected = rates.filter((rate) => rate.selectedByProvider);
  const selectedRate = selected.length === 1 ? selected[0] : null;
  const arithmeticComplete = selectedRate !== null
    && summary.subtotalMinor !== null && summary.taxMinor !== null
    && summary.totalMinor !== null
    && summary.totalMinor === summary.subtotalMinor + selectedRate.amountMinor
      + summary.taxMinor;
  const sourceDeliveryDate = selectedRate?.sourceDeliveryDate ?? null;
  const deadlineDate = completionDeadline.slice(0, 10);
  return Object.freeze({
    rates,
    selectedRateRefHash: selectedRate?.rateRefHash ?? null,
    subtotalMinor: summary.subtotalMinor,
    destinationTaxMinor: summary.taxMinor,
    selectedShippingMinor: selectedRate?.amountMinor ?? null,
    allInTotalMinor: arithmeticComplete ? summary.totalMinor : null,
    allInTotalProven: arithmeticComplete,
    sourceDeliveryDate,
    structuredEtaObserved: sourceDeliveryDate !== null,
    deliveryDeadlineProven: sourceDeliveryDate !== null
      && sourceDeliveryDate <= deadlineDate,
  });
}

function request(sessionRefHash, step, url) {
  return Object.freeze({
    schema: "outsider/source-specific-buyer-native-https-request/v1",
    schemaVersion: "1.0.0",
    provider: PROVIDER,
    sessionRefHash,
    operation: "QUOTE",
    step,
    method: "GET",
    url,
    headers: Object.freeze({ accept: "text/html" }),
    bodyBytes: null,
    redirectPolicy: "MANUAL_SAME_ORIGIN_ONLY",
    maximumResponseBytes: MAX_SOURCE_BYTES,
  });
}

function contentType(exchange, code) {
  const raw = exchange.headers?.["content-type"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^text\/html(?:\s*;|\s*$)/iu.test(value)) {
    fail(`${code}_CONTENT_TYPE_INVALID`);
  }
  return value;
}

function location(exchange) {
  const raw = exchange.headers?.location;
  return Array.isArray(raw) ? raw[0] : raw;
}

function plainHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) =>
    [name, Array.isArray(value) ? [...value] : value]));
}

export async function runAdafruitStep3ReceiptReconcileLiveV7(options = {}) {
  const context = inspectAdafruitStep3ReceiptRecoveryContextV7(options);
  const grantRecord = canonicalFile(options.readOnlyGrantFile,
    "READ_ONLY_GRANT", 64 * 1024);
  const grant = reconciliationGrant(grantRecord, context);
  const observedAt = instant(options.observedAt ?? new Date().toISOString(),
    "OBSERVED_AT");
  if (Date.parse(observedAt) < Date.parse(grant.authorizedAt)
    || Date.parse(observedAt) >= Date.parse(grant.expiresAt)) {
    fail("READ_ONLY_GRANT_NOT_ACTIVE");
  }
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  if (!/^[a-f0-9]{32}$/u.test(nonce)) fail("NONCE_INVALID");
  const privateRoot = path.resolve(options.privateRoot ?? path.join(
    process.cwd(), ".outsider", "private"));
  ensureDirectory(privateRoot);
  const useDirectory = path.join(privateRoot,
    "adafruit-step3-receipt-reconciliation-grant-use-v7");
  ensureDirectory(useDirectory);
  const useBody = {
    schema: USE_SCHEMA,
    schemaVersion: "7.0.0",
    grantBytesHash: grantRecord.bytesHash,
    partialContinuationTreeHash: context.partial.partialTreeHash,
    observedAt,
    nonceHash: digest("outsider/private-step3-reconciliation-nonce/v7", nonce),
  };
  let useArtifact;
  try {
    useArtifact = writeOnce(path.join(useDirectory,
      `${grantRecord.bytesHash.slice(7)}.json`), { ...useBody,
      useHash: digest(USE_SCHEMA, useBody) });
  } catch (error) {
    if (error?.code === "EEXIST") fail("READ_ONLY_GRANT_ALREADY_USED");
    throw error;
  }

  const runDirectory = path.join(privateRoot,
    `adafruit-step3-receipt-reconcile-v7-${observedAt.slice(0, 10)
      .replaceAll("-", "")}-${nonce}`);
  if (existsSync(runDirectory)) fail("RUN_DIRECTORY_EXISTS");
  ensureDirectory(runDirectory);
  const httpsState = path.join(runDirectory, "https-state");
  ensureDirectory(httpsState);
  const copiedCookie = writeBytesOnce(path.join(httpsState,
    path.basename(context.partial.cookie.absolute)), context.partial.cookie.bytes);
  if (copiedCookie.hash !== context.partial.cookie.bytesHash
    || (lstatSync(copiedCookie.file).mode & 0o777) !== 0o600) {
    fail("COOKIE_COPY_INVALID");
  }
  const counters = {
    liveHttpRequestCount: 0,
    getRequestCount: 0,
    postRequestCount: 0,
    boundedCheckoutRedirectCount: 0,
    contactPostAttemptCount: 0,
    addressQuotePostCount: 0,
    shippingMethodApplyAttemptCount: 0,
    paymentEndpointAttemptCount: 0,
    orderEndpointAttemptCount: 0,
    marketingSubscriptionAttemptCount: 0,
    modelCallCount: 0,
    interactiveBrowserActionCount: 0,
    employeeTouchCount: 0,
  };
  const rawFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof rawFetch !== "function") fail("FETCH_IMPL_INVALID");
  const guardedFetch = async (url, init) => {
    const target = new URL(String(url));
    if (init?.method !== "GET" || init.body !== undefined
      || target.origin !== ORIGIN || target.pathname !== "/checkout"
      || !["", "?step=3"].includes(target.search) || target.hash !== ""
      || counters.liveHttpRequestCount >= 2) fail("OUTBOUND_FORBIDDEN");
    counters.liveHttpRequestCount += 1;
    counters.getRequestCount += 1;
    return rawFetch(url, init);
  };
  const transport = createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: httpsState,
    orderRefHash: context.partial.cookie.value.orderRefHash,
    allowedOrigins: [ORIGIN],
    timeoutMs: options.timeoutMs ?? 20_000,
    maximumResponseBytes: MAX_SOURCE_BYTES,
  }, { fetchImpl: guardedFetch, clock: () => Date.parse(observedAt) });
  const sessionRefHash = digest("outsider/adafruit-step3-session/v7", {
    partialContinuationTreeHash: context.partial.partialTreeHash,
    grantBytesHash: grantRecord.bytesHash,
  });
  const redirectExchange = await transport(request(sessionRefHash,
    "CHECKOUT_CURRENT_STEP_GET", `${ORIGIN}/checkout`));
  const rawLocation = location(redirectExchange);
  let target;
  try { target = new URL(rawLocation, `${ORIGIN}/checkout`); }
  catch { fail("STEP3_REDIRECT_INVALID"); }
  if (![302, 303].includes(redirectExchange.status)
    || target.href !== `${ORIGIN}/checkout?step=3`) {
    fail("STEP3_REDIRECT_NOT_OBSERVED");
  }
  counters.boundedCheckoutRedirectCount += 1;
  const receiptExchange = await transport(request(sessionRefHash,
    "CHECKOUT_STEP3_RECEIPT_GET", target.href));
  if (receiptExchange.status !== 200
    || receiptExchange.finalUrl !== `${ORIGIN}/checkout?step=3`) {
    fail("STEP3_RECEIPT_RESPONSE_INVALID");
  }
  contentType(receiptExchange, "STEP3_RECEIPT");
  const quote = receiptQuote(receiptExchange.bodyBytes.toString("utf8"),
    context.prior.projection.completionDeadline);
  const redirectRawArtifact = writeBytesOnce(path.join(runDirectory,
    "checkout-current-step-response.v7.bin"), redirectExchange.bodyBytes);
  const sourceRawArtifact = writeBytesOnce(path.join(runDirectory,
    "checkout-step3-response.v7.bin"), receiptExchange.bodyBytes);
  const occurrenceBody = {
    schema: SOURCE_OCCURRENCE_SCHEMA,
    schemaVersion: "7.0.0",
    operation: "READ_EXISTING_STEP3_QUOTE_RECEIPT",
    partialContinuationTreeHash: context.partial.partialTreeHash,
    priorAmbiguousEventHash: context.partial.chain.ambiguous.eventHash,
    observedAt,
    requestMethod: "GET",
    requestUrl: `${ORIGIN}/checkout?step=3`,
    responseStatus: receiptExchange.status,
    responseFinalUrl: receiptExchange.finalUrl,
    responseBodyBytes: receiptExchange.bodyBytes.length,
    responseBodyBytesHash: sourceRawArtifact.hash,
    quote,
    sourceOccurrenceOnly: true,
    addressEffectReplayed: false,
    shippingMethodApplied: false,
    paymentPerformed: false,
    orderSubmitted: false,
    capacityReserved: false,
  };
  const sourceOccurrenceHash = digest(SOURCE_OCCURRENCE_SCHEMA,
    occurrenceBody);
  const receiptBody = {
    schema: SOURCE_RECEIPT_SCHEMA,
    schemaVersion: "7.0.0",
    sourceOccurrenceHash,
    sourceOccurrence: { ...occurrenceBody, sourceOccurrenceHash },
    observedAt,
    partialContinuationTreeHash: context.partial.partialTreeHash,
    exchanges: [
      {
        method: "GET", url: `${ORIGIN}/checkout`,
        status: redirectExchange.status,
        finalUrl: redirectExchange.finalUrl,
        headers: plainHeaders(redirectExchange.headers),
        bodyBytes: redirectExchange.bodyBytes.length,
        bodyBytesHash: redirectRawArtifact.hash,
      },
      {
        method: "GET", url: `${ORIGIN}/checkout?step=3`,
        status: receiptExchange.status,
        finalUrl: receiptExchange.finalUrl,
        headers: plainHeaders(receiptExchange.headers),
        bodyBytes: receiptExchange.bodyBytes.length,
        bodyBytesHash: sourceRawArtifact.hash,
      },
    ],
    quote,
    rawResponseProjected: false,
    requestBodyPresent: false,
    contactPostCount: 0,
    addressPostCount: 0,
    shippingMethodApplyCount: 0,
    paymentCount: 0,
    orderCount: 0,
  };
  const sourceReceipt = Object.freeze({ ...receiptBody,
    receiptHash: digest(SOURCE_RECEIPT_SCHEMA, receiptBody) });
  const sourceReceiptArtifact = writeOnce(path.join(runDirectory,
    "private-source-receipt.v7.json"), sourceReceipt);

  const budgetSatisfied = Number.isSafeInteger(quote.allInTotalMinor)
    && BigInt(quote.allInTotalMinor)
      <= BigInt(context.prior.projection.budget.maximumAmountMinor);
  const publicBody = {
    schema: PUBLIC_SCHEMA,
    schemaVersion: "7.0.0",
    predecessor: {
      priorProjectionHash: context.prior.projection.projectionHash,
      priorManifestHash: context.prior.manifest.manifestHash,
      partialContinuationTreeHash: context.partial.partialTreeHash,
      partialContinuationJournalHeadHash: context.partial.journal.headHash,
      quoteOccurrenceHash:
        context.partial.chain.quoteOccurrence.sourceOccurrenceHash,
      ambiguousHoldEventHash: context.partial.chain.ambiguous.eventHash,
      contactEffectReplayed: false,
      addressEffectReplayed: false,
    },
    observedAt,
    selectedRoute: context.prior.projection.selectedRoute,
    routeRole: context.prior.projection.routeRole,
    outcomeIntentRefHash: context.prior.projection.outcomeIntentRefHash,
    acceptanceSpecRefHash: context.prior.projection.acceptanceSpecRefHash,
    maximumLossConstraintRefHash:
      context.prior.projection.maximumLossConstraintRefHash,
    recoveryOptionRefHash: context.prior.projection.recoveryOptionRefHash,
    exactSpecEvaluation: context.prior.evaluation,
    destinationRefHash: context.prior.projection.destinationRefHash,
    contactRefHash: context.prior.projection.contactRefHash,
    budget: context.prior.projection.budget,
    completionDeadline: context.prior.projection.completionDeadline,
    stage: {
      operation: "READ_EXISTING_STEP3_QUOTE_RECEIPT",
      operationState: "SOURCE_OCCURRENCE_OBSERVED",
      sourceState: "QUOTE_AVAILABLE",
      sourceRecordClass: "CHECKOUT_RECEIPT",
      sourceOccurrenceHash,
      sourceBytesHash: sourceRawArtifact.hash,
      sourceBytesLength: receiptExchange.bodyBytes.length,
      retryPermitted: false,
    },
    quote,
    allInTotalMinor: quote.allInTotalMinor,
    allInTotalProven: quote.allInTotalProven,
    budgetSatisfied,
    structuredEtaObserved: quote.structuredEtaObserved,
    deliveryDeadlineProven: quote.deliveryDeadlineProven,
    runState: "DESTINATION_QUOTE_OBSERVED_NO_CAPACITY_HOLD",
    nextGate:
      "RESOURCE_OWNER_CAPACITY_AND_SEPARATE_PAYMENT_ORDER_AUTHORIZATION",
    counters,
    sourceCookieBytesHash: context.partial.cookie.bytesHash,
    initialCopiedCookieBytesHash: copiedCookie.hash,
    predecessorTreesMutated: false,
    contactSubmittedInPredecessor: true,
    fullAddressSubmittedInPredecessor: true,
    contactPostAttemptCount: 0,
    addressPostAttemptCount: 0,
    shippingMethodApplied: false,
    paymentAuthorized: false,
    paymentPerformed: false,
    orderAuthorized: false,
    orderSubmitted: false,
    marketingAuthorized: false,
    marketingSubscriptionPerformed: false,
    rawPrivateInputParsed: false,
    rawPrivateInputProjected: false,
    rawResponseProjected: false,
    capacityReserved: false,
    independentOutcomeTruthEstablished: false,
    userResultCommitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  const projection = Object.freeze({ ...publicBody,
    projectionHash: digest(PUBLIC_SCHEMA, publicBody) });
  const publicArtifact = writeOnce(path.join(runDirectory,
    "public-projection.v7.json"), projection);
  const routeEvidence = createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: projection.projectionHash,
    occurrenceRefHash: sourceOccurrenceHash,
    recoveryOptionRefHash: projection.recoveryOptionRefHash,
    observedAt,
    validUntil: grant.expiresAt,
    sourceReplayReceiptHash: sourceReceipt.receiptHash,
    facts: {
      specification: {
        sourceOccurrenceRefHash:
          context.prior.evaluation.sourceOccurrenceHash,
        frozenPredicateHash: projection.acceptanceSpecRefHash,
        evaluationRefHash: context.prior.evaluation.evaluationHash,
        status: "MATCH",
      },
      allInPrice: {
        sourceOccurrenceRefHash: sourceOccurrenceHash,
        constraintRefHash: projection.maximumLossConstraintRefHash,
        currency: projection.budget.currency,
        allInMinorUnits: quote.allInTotalMinor,
        includesItemTaxShippingAndFees: quote.allInTotalProven,
        status: quote.allInTotalProven ? "COMPLETE"
          : quote.allInTotalMinor === null ? "UNAVAILABLE" : "PARTIAL",
      },
      eta: {
        sourceOccurrenceRefHash: sourceOccurrenceHash,
        completionDeadline: projection.completionDeadline,
        estimatedCompletionAt: quote.sourceDeliveryDate === null ? null
          : `${quote.sourceDeliveryDate}T23:59:59.999Z`,
        status: quote.structuredEtaObserved ? "STRUCTURED" : "UNAVAILABLE",
      },
      capacity: {
        sourceOccurrenceRefHash: sourceOccurrenceHash,
        capacityLifecycleRefHash: null,
        capacityLifecycleHeadHash: null,
        reservedFrom: null,
        reservedUntil: null,
        status: "UNRESERVED",
        sourceClass: "SELLER_SERVER_ACK_ONLY",
      },
    },
  });
  const routeEvidenceArtifact = writeOnce(path.join(runDirectory,
    "route-evidence.v1.json"), routeEvidence);
  const artifacts = inventory(runDirectory);
  const manifestBody = {
    schema: MANIFEST_SCHEMA,
    schemaVersion: "7.0.0",
    observedAt,
    priorProjectionHash: context.prior.projection.projectionHash,
    priorManifestHash: context.prior.manifest.manifestHash,
    inputBytesHash: context.inputRecord.bytesHash,
    partialContinuationTreeHash: context.partial.partialTreeHash,
    partialContinuationJournalHeadHash: context.partial.journal.headHash,
    priorResidualGrantBytesHash: context.residual.grantRecord.bytesHash,
    priorResidualGrantUseBytesHash: context.residual.useRecord.bytesHash,
    readOnlyGrantBytesHash: grantRecord.bytesHash,
    readOnlyGrantUseBytesHash: useArtifact.hash,
    sourceCookieBytesHash: context.partial.cookie.bytesHash,
    initialCopiedCookieBytesHash: copiedCookie.hash,
    sourceOccurrenceHash,
    sourceReceiptHash: sourceReceipt.receiptHash,
    rawStep3ResponseBytesHash: sourceRawArtifact.hash,
    projectionHash: projection.projectionHash,
    routeEvidenceHash: routeEvidence.evidenceHash,
    artifactInventory: artifacts,
    artifactCount: artifacts.length,
    artifactBytes: artifacts.reduce((sum, item) => sum + item.bytes, 0),
    predecessorTreesMutated: false,
    contactEffectReplayed: false,
    addressEffectReplayed: false,
    contactPostCount: 0,
    addressPostCount: 0,
    shippingMethodApplyCount: 0,
    paymentCount: 0,
    orderCount: 0,
    rawResponsePrivate0600: true,
    capacityReserved: false,
  };
  const privateManifest = Object.freeze({ ...manifestBody,
    manifestHash: digest(MANIFEST_SCHEMA, manifestBody) });
  const privateManifestArtifact = writeOnce(path.join(runDirectory,
    "private-manifest.v7.json"), privateManifest);
  return Object.freeze({ runDirectory, projection, publicArtifact,
    routeEvidence, routeEvidenceArtifact, sourceReceipt,
    sourceReceiptArtifact, privateManifest, privateManifestArtifact });
}

function parseCli(argv) {
  const allowed = new Set(["--live-read-only-no-post", "--prior-v5-run",
    "--partial-v6-run", "--input", "--prior-residual-grant",
    "--prior-residual-use", "--read-only-grant", "--private-root", "--nonce"]);
  const result = { confirmed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag)) fail("ARGUMENT_INVALID");
    if (flag === "--live-read-only-no-post") {
      result.confirmed = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail("ARGUMENT_VALUE");
    result[flag.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  for (const required of ["prior_v5_run", "partial_v6_run", "input",
    "prior_residual_grant", "prior_residual_use", "read_only_grant"]) {
    if (result[required] === undefined) fail("REQUIRED_ARGUMENT_MISSING");
  }
  if (!result.confirmed) fail("LIVE_READ_ONLY_CONFIRMATION_REQUIRED");
  return result;
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseCli(process.argv.slice(2));
    const result = await runAdafruitStep3ReceiptReconcileLiveV7({
      priorV5RunDirectory: args.prior_v5_run,
      partialV6RunDirectory: args.partial_v6_run,
      inputFile: args.input,
      priorResidualGrantFile: args.prior_residual_grant,
      priorResidualUseFile: args.prior_residual_use,
      readOnlyGrantFile: args.read_only_grant,
      privateRoot: args.private_root,
      nonce: args.nonce,
    });
    process.stdout.write(`${canonicalizeStrict({
      runDirectory: result.runDirectory,
      publicProjection: result.projection,
      routeEvidenceFile: result.routeEvidenceArtifact.file,
      privateManifestFile: result.privateManifestArtifact.file,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
