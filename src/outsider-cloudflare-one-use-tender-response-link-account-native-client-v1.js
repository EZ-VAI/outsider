/*
 * Account-native client for the Cloudflare one-use tender response link.
 *
 * This is an execution edge, not a provider registry. It creates one HMAC
 * bearer route, initializes its frozen seller-facing definition, exposes the
 * private URL for composition into an exact mailbox tender, polls exact source
 * bytes, and can revoke the route. Every network attempt is fsync-recorded
 * first. Every HTTP response is fsync-captured before interpretation. Mutating
 * attempts are never retried after an ambiguous outcome.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync,
  readFileSync, readdirSync, unlinkSync, writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  createCloudflareOneUseTenderResponseTokenV1,
} from "./outsider-cloudflare-one-use-tender-response-token-v1.js";
import {
  createOneUseTenderResponseLinkDefinitionV1,
} from "./outsider-one-use-tender-response-link-handler-v1.js";

const PREFIX
  = "OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const JOURNAL_ID = /^journal_[a-f0-9]{32}$/u;
const TOKEN = /^[A-Za-z0-9_-]{86}$/u;
const OPERATION_KINDS = new Set(["INITIALIZE", "SOURCE_POLL", "REVOKE"]);
const MAX_HTTP_BYTES = 2 * 1024 * 1024;
const MAX_GMAIL_PREFIX_BYTES = 48 * 1024;
const CLIENT_STATES = new WeakMap();
const SOURCE_RESULTS = new WeakMap();

export const OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_SCHEMAS
  = Object.freeze({
    client: "outsider/cloudflare-response-link-account-native-client/v1",
    journalEvent:
      "outsider/cloudflare-response-link-account-native-journal-event/v1",
    responseHandle:
      "outsider/cloudflare-response-link-account-native-response-handle/v1",
    action: "outsider/cloudflare-response-link-account-native-action/v1",
    sourceOccurrence:
      "outsider/cloudflare-response-link-account-native-source-occurrence/v1",
    privateSellerRoute:
      "outsider/cloudflare-response-link-private-seller-route/v1",
    privateSource:
      "outsider/cloudflare-response-link-private-source-claim/v1",
  });

export const OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_BOUNDARY
  = Object.freeze({
    position: "ACCOUNT_NATIVE_ONE_USE_SELLER_RESPONSE_ROUTE",
    providerRegistryCreated: false,
    sellerRegistrationRequired: false,
    injectedHttpsRequestClosureRequired: true,
    globalFetchFallbackPresent: false,
    hmacTokenFactoryReused: true,
    privateJournalMode: "0600",
    externalAttemptFsyncedBeforeRequest: true,
    exactHttpResponseFsyncedBeforeInterpretation: true,
    ambiguousInitializeAutomaticallyRetried: false,
    ambiguousRevokeAutomaticallyRetried: false,
    sourcePollingIsReadOnlyAndExplicit: true,
    sourcePollingUsesTokenHashRoute: true,
    sourceReplaySurvivesMacKeyRetirement: true,
    rawResponseTokenProjected: false,
    rawAdminBearerProjected: false,
    rawMacKeyProjected: false,
    sellerUrlProjected: false,
    offerOrDeclineIsAcceptance: false,
    offerOrDeclineCreatesCapacity: false,
    providerIdentityEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    outcomeEstablished: false,
    paymentPerformed: false,
    humanQueueCreated: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function byteHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(code);
  return value;
}

function clockInstant(state, code) {
  let value;
  try { value = state.clock(); } catch { fail(`${code}_FAILED`); }
  return instant(value, `${code}_INVALID`);
}

function serviceOrigin(value) {
  let parsed;
  try { parsed = new URL(value); } catch { fail("SERVICE_ORIGIN_INVALID"); }
  if (typeof value !== "string" || parsed.protocol !== "https:"
    || parsed.username !== "" || parsed.password !== ""
    || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
    fail("SERVICE_ORIGIN_INVALID");
  }
  return parsed.origin;
}

function boundedSecret(value, code) {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8")
    : Buffer.isBuffer(value) || value instanceof Uint8Array
      ? Buffer.from(value) : null;
  if (bytes === null || bytes.length < 32 || bytes.length > 512) fail(code);
  return bytes;
}

function boundedHttpResponse(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !Number.isSafeInteger(value.status) || value.status < 100
    || value.status > 599 || !Buffer.isBuffer(value.body)
    || value.body.length < 1 || value.body.length > MAX_HTTP_BYTES) {
    fail("HTTP_RESPONSE_INVALID");
  }
  return { status: value.status, bytes: Buffer.from(value.body) };
}

function parseJson(bytes, code) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(code); }
}

function fsyncDirectory(directory) {
  let descriptor;
  try { descriptor = openSync(directory, "r"); fsyncSync(descriptor); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function prepareDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const responses = path.join(directory, ".response-handles-v1");
  mkdirSync(responses, { recursive: true, mode: 0o700 });
  chmodSync(responses, 0o700);
  return responses;
}

function journalEvent(state, eventType, recordedAt, payload) {
  const body = {
    schema:
      OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_SCHEMAS
        .journalEvent,
    schemaVersion: "1.0.0",
    sequence: state.events.length + 1,
    previousEventHash: state.events.length === 0
      ? null : state.events.at(-1).eventHash,
    recordedAt,
    eventType,
    payload,
  };
  return { ...body, eventHash: digest(body.schema, body) };
}

function decodePersisted(value, expectedHash, code) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    fail(`${code}_BASE64_INVALID`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 1 || bytes.length > MAX_HTTP_BYTES
    || bytes.toString("base64") !== value || byteHash(bytes) !== expectedHash) {
    fail(`${code}_BYTES_INVALID`);
  }
  return bytes;
}

function definitionInput(definition) {
  return {
    tenderHash: definition.tenderHash,
    requirementKind: definition.requirementKind,
    requirementId: definition.requirementId,
    issuedAt: definition.issuedAt,
    expiresAt: definition.expiresAt,
    summary: definition.summary,
    acceptedCurrencyCodes: definition.acceptedCurrencyCodes,
    responsibilityTermsText: definition.responsibilityTermsText,
    responsibilityTermsHash: definition.responsibilityTermsHash,
  };
}

function replayPrepared(state, payload) {
  if (state.definition !== null || typeof payload.responseToken !== "string"
    || !TOKEN.test(payload.responseToken) || payload.definition === null
    || typeof payload.definition !== "object") fail("JOURNAL_PREPARED_INVALID");
  let compiled;
  try {
    compiled = createOneUseTenderResponseLinkDefinitionV1({
      ...definitionInput(payload.definition),
      responseToken: payload.responseToken,
    });
  } catch { fail("JOURNAL_DEFINITION_INVALID"); }
  if (canonicalizeStrict(compiled) !== canonicalizeStrict(payload.definition)) {
    fail("JOURNAL_DEFINITION_MISMATCH");
  }
  state.responseToken = payload.responseToken;
  state.definition = compiled;
}

function applyEvent(state, event) {
  const payload = event.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    fail("JOURNAL_PAYLOAD_INVALID");
  }
  if (event.eventType === "LINK_PREPARED") {
    replayPrepared(state, payload);
    return;
  }
  if (event.eventType === "OPERATION_ATTEMPTED") {
    const operationId = hash(payload.operationId,
      "JOURNAL_OPERATION_ID_INVALID");
    if (!OPERATION_KINDS.has(payload.operationKind)
      || state.definition === null || state.operations.has(operationId)
      || hash(payload.bindingHash, "JOURNAL_BINDING_HASH_INVALID")
        !== payload.bindingHash
      || (payload.requestBodyHash !== null
        && hash(payload.requestBodyHash, "JOURNAL_BODY_HASH_INVALID")
          !== payload.requestBodyHash)) fail("JOURNAL_ATTEMPT_INVALID");
    const operation = {
      operationId,
      kind: payload.operationKind,
      bindingHash: payload.bindingHash,
      attemptedAt: instant(payload.attemptedAt,
        "JOURNAL_ATTEMPTED_AT_INVALID"),
      requestBodyHash: payload.requestBodyHash,
      response: null,
      resolution: null,
    };
    state.operations.set(operationId, operation);
    state.operationOrder.push(operationId);
    return;
  }
  const operationId = hash(payload.operationId,
    "JOURNAL_OPERATION_ID_INVALID");
  const operation = state.operations.get(operationId);
  if (operation === undefined) fail("JOURNAL_OPERATION_NOT_FOUND");
  if (event.eventType === "HTTP_RESPONSE_CAPTURED") {
    if (operation.response !== null || operation.resolution !== null
      || !Number.isSafeInteger(payload.status)
      || payload.status < 100 || payload.status > 599) {
      fail("JOURNAL_RESPONSE_INVALID");
    }
    const responseHash = hash(payload.responseHash,
      "JOURNAL_RESPONSE_HASH_INVALID");
    operation.response = { status: payload.status,
      bytes: decodePersisted(payload.responseBase64, responseHash,
        "JOURNAL_RESPONSE"), responseHash };
    return;
  }
  if (event.eventType === "OPERATION_RESOLVED"
    || event.eventType === "OPERATION_AMBIGUOUS_NO_RETRY") {
    if (operation.resolution !== null
      || event.eventType === "OPERATION_RESOLVED"
        && operation.response === null
      || typeof payload.state !== "string" || payload.state.length < 1
      || payload.state.length > 128) fail("JOURNAL_RESOLUTION_INVALID");
    operation.resolution = {
      state: payload.state,
      resolvedAt: instant(payload.resolvedAt,
        "JOURNAL_RESOLVED_AT_INVALID"),
      details: payload.details ?? null,
      ambiguous: event.eventType === "OPERATION_AMBIGUOUS_NO_RETRY",
    };
    return;
  }
  fail("JOURNAL_EVENT_TYPE_INVALID");
}

function verifyEvent(event, sequence, previous) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    fail("JOURNAL_EVENT_INVALID");
  }
  const body = { schema: event.schema, schemaVersion: event.schemaVersion,
    sequence: event.sequence, previousEventHash: event.previousEventHash,
    recordedAt: event.recordedAt, eventType: event.eventType,
    payload: event.payload };
  if (body.schema
      !== OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_SCHEMAS
        .journalEvent
    || body.schemaVersion !== "1.0.0" || body.sequence !== sequence
    || body.previousEventHash !== previous
    || !["LINK_PREPARED", "OPERATION_ATTEMPTED",
      "HTTP_RESPONSE_CAPTURED", "OPERATION_RESOLVED",
      "OPERATION_AMBIGUOUS_NO_RETRY"].includes(body.eventType)
    || instant(body.recordedAt, "JOURNAL_RECORDED_AT_INVALID")
      !== body.recordedAt
    || event.eventHash !== digest(body.schema, body)) fail("JOURNAL_CHAIN_INVALID");
}

function replayJournal(state) {
  state.events = [];
  state.definition = null;
  state.responseToken = null;
  state.operations.clear();
  state.operationOrder = [];
  if (!existsSync(state.journalPath)) return;
  const text = readFileSync(state.journalPath, "utf8");
  if (text.length < 2 || !text.endsWith("\n")) fail("JOURNAL_PARTIAL");
  let previous = null;
  for (const [index, line] of text.slice(0, -1).split("\n").entries()) {
    let event;
    try { event = JSON.parse(line); } catch { fail("JOURNAL_JSON_INVALID"); }
    verifyEvent(event, index + 1, previous);
    applyEvent(state, event);
    state.events.push(event);
    previous = event.eventHash;
  }
}

function appendJournal(state, eventType, recordedAt, payload) {
  const event = journalEvent(state, eventType, recordedAt, payload);
  const bytes = Buffer.from(`${canonicalizeStrict(event)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(state.journalPath, "a", 0o600);
    chmodSync(state.journalPath, 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    }
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  fsyncDirectory(state.directory);
  applyEvent(state, event);
  state.events.push(event);
  return event;
}

function operationId(kind, binding) {
  return digest("outsider/cloudflare-response-link-operation/v1",
    { kind, binding });
}

function lockFile(state) {
  return path.join(state.directory, ".external-operation.lock");
}

function acquireLock(state, operation) {
  let descriptor;
  const file = lockFile(state);
  try {
    descriptor = openSync(file, "wx", 0o600);
    const owner = canonicalizeStrict({
      schema: "outsider/cloudflare-response-link-operation-lock/v1",
      journalId: state.journalId,
      operationId: operation.operationId,
      operationKind: operation.kind,
      processId: process.pid,
    });
    writeSync(descriptor, `${owner}\n`, null, "utf8");
    fsyncSync(descriptor);
    fsyncDirectory(state.directory);
    return { descriptor, file };
  } catch {
    if (descriptor !== undefined) closeSync(descriptor);
    fail("EXTERNAL_OPERATION_LOCKED");
  }
}

function releaseLock(state, lock) {
  if (lock === null) return;
  try { closeSync(lock.descriptor); } catch { /* already closed */ }
  try { unlinkSync(lock.file); } catch { /* fail-closed stale lock */ }
  fsyncDirectory(state.directory);
}

function handleFile(state, operationIdValue) {
  return path.join(state.responseDirectory,
    `${operationIdValue.slice(7)}.response.json`);
}

function writeResponseHandle(state, operation, response) {
  const body = {
    schema:
      OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_SCHEMAS
        .responseHandle,
    schemaVersion: "1.0.0",
    journalId: state.journalId,
    operationId: operation.operationId,
    operationKind: operation.kind,
    bindingHash: operation.bindingHash,
    status: response.status,
    responseHash: byteHash(response.bytes),
    responseBase64: response.bytes.toString("base64"),
  };
  const handle = { ...body, handleHash: digest(body.schema, body) };
  const file = handleFile(state, operation.operationId);
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    chmodSync(file, 0o600);
    const bytes = Buffer.from(`${canonicalizeStrict(handle)}\n`, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    }
    fsyncSync(descriptor);
  } catch { fail("RESPONSE_HANDLE_WRITE_FAILED_NO_RETRY"); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
  fsyncDirectory(state.responseDirectory);
  return file;
}

function readResponseHandle(state, file, operationIdValue) {
  let value;
  try {
    const text = readFileSync(file, "utf8");
    if (!text.endsWith("\n")) fail("RESPONSE_HANDLE_PARTIAL");
    value = JSON.parse(text.slice(0, -1));
  } catch (error) {
    if (error?.outsiderCode !== undefined) throw error;
    fail("RESPONSE_HANDLE_INVALID");
  }
  const body = { schema: value?.schema, schemaVersion: value?.schemaVersion,
    journalId: value?.journalId, operationId: value?.operationId,
    operationKind: value?.operationKind, bindingHash: value?.bindingHash,
    status: value?.status, responseHash: value?.responseHash,
    responseBase64: value?.responseBase64 };
  if (body.schema
      !== OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_SCHEMAS
        .responseHandle
    || body.schemaVersion !== "1.0.0" || body.journalId !== state.journalId
    || body.operationId !== operationIdValue
    || !OPERATION_KINDS.has(body.operationKind) || !HASH.test(body.bindingHash)
    || !Number.isSafeInteger(body.status) || body.status < 100
    || body.status > 599 || value.handleHash !== digest(body.schema, body)) {
    fail("RESPONSE_HANDLE_BINDING_INVALID");
  }
  return { ...body, bytes: decodePersisted(body.responseBase64,
    hash(body.responseHash, "RESPONSE_HANDLE_HASH_INVALID"),
    "RESPONSE_HANDLE") };
}

function removeFileAndSync(file, directory, code) {
  try { unlinkSync(file); } catch { fail(code); }
  fsyncDirectory(directory);
}

function readLockOwner(state) {
  const file = lockFile(state);
  if (!existsSync(file)) return null;
  let owner;
  try {
    const text = readFileSync(file, "utf8");
    owner = JSON.parse(text.endsWith("\n") ? text.slice(0, -1) : text);
  } catch { fail("OPERATION_LOCK_INVALID"); }
  if (owner?.schema !== "outsider/cloudflare-response-link-operation-lock/v1"
    || owner.journalId !== state.journalId || !HASH.test(owner.operationId)
    || !OPERATION_KINDS.has(owner.operationKind)
    || !Number.isSafeInteger(owner.processId) || owner.processId < 1) {
    fail("OPERATION_LOCK_INVALID");
  }
  let live = true;
  try { process.kill(owner.processId, 0); }
  catch (error) {
    if (error?.code === "ESRCH") live = false;
    else if (error?.code !== "EPERM") throw error;
  }
  return { ...owner, file, live };
}

function captureHandle(state, file, operationIdValue) {
  const handle = readResponseHandle(state, file, operationIdValue);
  const operation = state.operations.get(operationIdValue);
  if (operation === undefined || operation.kind !== handle.operationKind
    || operation.bindingHash !== handle.bindingHash) {
    fail("RESPONSE_HANDLE_OPERATION_MISMATCH");
  }
  if (operation.response === null) {
    appendJournal(state, "HTTP_RESPONSE_CAPTURED", operation.attemptedAt, {
      operationId: operation.operationId,
      status: handle.status,
      responseHash: handle.responseHash,
      responseBase64: handle.responseBase64,
    });
  } else if (operation.response.status !== handle.status
    || operation.response.responseHash !== handle.responseHash) {
    fail("RESPONSE_HANDLE_REPLAY_CONFLICT");
  }
  removeFileAndSync(file, state.responseDirectory,
    "RESPONSE_HANDLE_REMOVE_FAILED");
}

function recoverAbandonedOperation(state) {
  replayJournal(state);
  const owner = readLockOwner(state);
  if (owner?.live === true) return;
  const handles = readdirSync(state.responseDirectory).sort();
  for (const name of handles) {
    const matched = /^([a-f0-9]{64})\.response\.json$/u.exec(name);
    if (matched === null) fail("RESPONSE_HANDLE_FILENAME_INVALID");
    captureHandle(state, path.join(state.responseDirectory, name),
      `sha256:${matched[1]}`);
  }
  if (owner === null) return;
  const operation = state.operations.get(owner.operationId);
  if (operation !== undefined && operation.resolution === null
    && operation.response === null) {
    appendJournal(state, "OPERATION_AMBIGUOUS_NO_RETRY",
      operation.attemptedAt, { operationId: operation.operationId,
        resolvedAt: operation.attemptedAt,
        state: `${operation.kind}_AMBIGUOUS_NO_RETRY_HOLD`,
        details: null });
  }
  removeFileAndSync(owner.file, state.directory,
    "STALE_OPERATION_LOCK_REMOVE_FAILED");
}

function operationProjection(state, operation, actionState, extra = {}) {
  const definition = state.definition;
  const body = {
    schema:
      OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_SCHEMAS
        .action,
    schemaVersion: "1.0.0",
    clientBindingHash: state.clientBindingHash,
    operationId: operation?.operationId ?? null,
    operationKind: operation?.kind ?? "LOCAL",
    tenderHash: definition?.tenderHash ?? null,
    definitionHash: definition?.definitionHash ?? null,
    tokenHash: definition?.tokenHash ?? null,
    expiresAt: definition?.expiresAt ?? null,
    state: actionState,
    exactHttpResponseObserved: operation !== null && operation !== undefined
      && operation.response !== null,
    httpResponseSourceHash: operation?.response?.responseHash ?? null,
    rawHttpResponseProjected: false,
    rawResponseTokenProjected: false,
    rawAdminBearerProjected: false,
    rawMacKeyProjected: false,
    sellerUrlProjected: false,
    responseOccurrenceOnly: true,
    providerIdentityEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    providerAcceptanceEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    outcomeEstablished: false,
    paymentPerformed: false,
    humanQueueCreated: false,
    authority: "NONE",
    decisionState: "HOLD",
    ...extra,
  };
  return Object.freeze({ ...body, actionHash: digest(body.schema, body),
    boundary:
      OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_BOUNDARY });
}

function actionResult(projection, privateState = null) {
  const result = Object.freeze({ publicProjection: projection });
  if (privateState !== null) SOURCE_RESULTS.set(result,
    { consumed: false, ...privateState });
  return result;
}

async function issueRequest(state, operation, request) {
  const existing = state.operations.get(operation.operationId);
  if (existing !== undefined
    && (existing.resolution !== null || existing.response !== null)) {
    return existing;
  }
  if (existing !== undefined) return existing;
  let lock = null;
  try {
    lock = acquireLock(state, operation);
    replayJournal(state);
    if (state.operations.has(operation.operationId)) {
      return state.operations.get(operation.operationId);
    }
    const attemptedAt = clockInstant(state, "OPERATION_ATTEMPTED_AT");
    appendJournal(state, "OPERATION_ATTEMPTED", attemptedAt, {
      operationId: operation.operationId,
      operationKind: operation.kind,
      bindingHash: operation.bindingHash,
      attemptedAt,
      requestBodyHash: request.body === null ? null : byteHash(request.body),
    });
    let raw;
    try {
      raw = await state.requestImpl(Object.freeze({
        method: request.method,
        url: request.url,
        headers: Object.freeze({
          accept: "application/json",
          authorization: `Bearer ${state.adminBearer.toString("utf8")}`,
          ...(request.body === null ? {}
            : { "content-type": "application/json; charset=utf-8" }),
        }),
        body: request.body === null ? null : Buffer.from(request.body),
      }));
    } catch {
      appendJournal(state, "OPERATION_AMBIGUOUS_NO_RETRY", attemptedAt, {
        operationId: operation.operationId,
        resolvedAt: attemptedAt,
        state: `${operation.kind}_AMBIGUOUS_NO_RETRY_HOLD`,
        details: null,
      });
      return state.operations.get(operation.operationId);
    }
    const response = boundedHttpResponse(raw);
    const file = writeResponseHandle(state,
      state.operations.get(operation.operationId), response);
    appendJournal(state, "HTTP_RESPONSE_CAPTURED", attemptedAt, {
      operationId: operation.operationId,
      status: response.status,
      responseHash: byteHash(response.bytes),
      responseBase64: response.bytes.toString("base64"),
    });
    removeFileAndSync(file, state.responseDirectory,
      "RESPONSE_HANDLE_REMOVE_FAILED");
    return state.operations.get(operation.operationId);
  } finally { releaseLock(state, lock); }
}

function resolveOperation(state, operation, resolutionState, details) {
  if (operation.resolution === null) {
    const resolvedAt = clockInstant(state, "OPERATION_RESOLVED_AT");
    appendJournal(state, "OPERATION_RESOLVED", resolvedAt, {
      operationId: operation.operationId,
      resolvedAt,
      state: resolutionState,
      details,
    });
  }
  return state.operations.get(operation.operationId);
}

function parseInitialization(state, operation) {
  if (operation.resolution !== null) return operation;
  const response = operation.response;
  if (response === null) return operation;
  if (response.status === 429) {
    return resolveOperation(state, operation,
      "INITIALIZE_HTTP_429_NO_RETRY_HOLD", null);
  }
  if (![200, 201].includes(response.status)) {
    return resolveOperation(state, operation,
      "INITIALIZE_HTTP_REJECTED_NO_RETRY_HOLD", { status: response.status });
  }
  let value;
  try { value = parseJson(response.bytes, "INITIALIZE_JSON_INVALID"); }
  catch {
    return resolveOperation(state, operation,
      "INITIALIZE_MALFORMED_RESPONSE_NO_RETRY_HOLD", null);
  }
  if (value?.ok !== true || value.publicProjection?.tenderHash
      !== state.definition.tenderHash
    || value.publicProjection?.definitionHash
      !== state.definition.definitionHash) {
    return resolveOperation(state, operation,
      "INITIALIZE_MALFORMED_RESPONSE_NO_RETRY_HOLD", null);
  }
  return resolveOperation(state, operation, "LINK_INITIALIZED_HOLD", {
    workerProjectionHash: digest(
      "outsider/cloudflare-response-link-worker-projection/v1",
      value.publicProjection),
  });
}

function parseRevocation(state, operation) {
  if (operation.resolution !== null || operation.response === null) {
    return operation;
  }
  const response = operation.response;
  if (response.status === 429) {
    return resolveOperation(state, operation,
      "REVOKE_HTTP_429_NO_RETRY_HOLD", null);
  }
  if (response.status !== 200) {
    return resolveOperation(state, operation,
      "REVOKE_HTTP_REJECTED_NO_RETRY_HOLD", { status: response.status });
  }
  let value;
  try { value = parseJson(response.bytes, "REVOKE_JSON_INVALID"); }
  catch {
    return resolveOperation(state, operation,
      "REVOKE_MALFORMED_RESPONSE_NO_RETRY_HOLD", null);
  }
  if (value?.ok !== true || value.publicProjection?.tenderHash
      !== state.definition.tenderHash) {
    return resolveOperation(state, operation,
      "REVOKE_MALFORMED_RESPONSE_NO_RETRY_HOLD", null);
  }
  const workerStatus = value.publicProjection.status;
  return resolveOperation(state, operation,
    workerStatus === "LINK_REVOKED" ? "LINK_REVOKED_HOLD"
      : "REVOKE_NOT_APPLIED_HOLD", { workerStatus });
}

function parseSource(state, operation) {
  if (operation.resolution !== null) return operation;
  const response = operation.response;
  if (response === null) return operation;
  if (response.status === 429) {
    return resolveOperation(state, operation,
      "SOURCE_POLL_HTTP_429_NO_RETRY_HOLD", null);
  }
  let value;
  try { value = parseJson(response.bytes, "SOURCE_JSON_INVALID"); }
  catch {
    return resolveOperation(state, operation,
      "SOURCE_POLL_MALFORMED_RESPONSE_HOLD", null);
  }
  if (response.status === 202 && value?.ok === true
    && value.status === "AWAITING_RESPONSE"
    && value.decisionState === "HOLD") {
    return resolveOperation(state, operation, "AWAITING_RESPONSE_HOLD", null);
  }
  if (response.status === 404
    && ["LINK_EXPIRED_NO_RESPONSE", "LINK_REVOKED_NO_RESPONSE"]
      .includes(value?.status) && value.decisionState === "HOLD") {
    return resolveOperation(state, operation, `${value.status}_HOLD`, null);
  }
  const source = value?.source;
  let sourceBytes;
  if (response.status !== 200 || value?.ok !== true
    || value.status !== "RESPONSE_SOURCE_RECORDED_HOLD"
    || source?.decisionState !== "HOLD"
    || source.responseOccurrenceOnly !== true
    || source.providerIdentityEstablished !== false
    || source.resourceOwnerAuthorityEstablished !== false
    || source.capacityReserved !== false
    || !["OFFER", "DECLINE"].includes(source.normalizedResponse?.choice)
    || source.event?.tenderHash !== state.definition.tenderHash
    || source.event?.tokenHash !== state.definition.tokenHash
    || source.eventHash !== source.event?.eventHash
    || !HASH.test(source.eventHash) || !HASH.test(source.sourceBodyHash)
    || !Number.isSafeInteger(source.sourceByteLength)
    || source.sourceByteLength < 1) {
    return resolveOperation(state, operation,
      "SOURCE_POLL_MALFORMED_RESPONSE_HOLD", null);
  }
  try {
    sourceBytes = decodePersisted(source.sourceBodyBase64,
      source.sourceBodyHash, "SELLER_SOURCE");
  } catch {
    return resolveOperation(state, operation,
      "SOURCE_POLL_MALFORMED_RESPONSE_HOLD", null);
  }
  if (sourceBytes.length !== source.sourceByteLength) {
    return resolveOperation(state, operation,
      "SOURCE_POLL_MALFORMED_RESPONSE_HOLD", null);
  }
  return resolveOperation(state, operation,
    `RESPONSE_${source.normalizedResponse.choice}_SOURCE_OBSERVED_HOLD`, {
      declaredChoice: source.normalizedResponse.choice,
      sourceBodyHash: source.sourceBodyHash,
      sourceByteLength: source.sourceByteLength,
      eventHash: source.eventHash,
      contentType: source.contentType,
    });
}

function lastOperation(state, kind) {
  for (let index = state.operationOrder.length - 1; index >= 0; index -= 1) {
    const operation = state.operations.get(state.operationOrder[index]);
    if (operation.kind === kind) return operation;
  }
  return null;
}

/** Create one private client for one response-link journal. */
export function createCloudflareOneUseTenderResponseLinkAccountNativeClientV1(
  input = {}) {
  exact(input, ["serviceOrigin", "adminBearerToken", "tokenMacKey",
    "randomBytesImpl", "requestImpl", "clock", "directory", "journalId"],
  "INPUT_INVALID");
  const origin = serviceOrigin(input.serviceOrigin);
  if (typeof input.adminBearerToken !== "string"
    || /[^\x21-\x7e]/u.test(input.adminBearerToken)) {
    fail("ADMIN_BEARER_INVALID");
  }
  const adminBearer = boundedSecret(input.adminBearerToken,
    "ADMIN_BEARER_INVALID");
  const tokenMacKey = boundedSecret(input.tokenMacKey, "TOKEN_MAC_KEY_INVALID");
  if (typeof input.randomBytesImpl !== "function"
    || typeof input.requestImpl !== "function" || typeof input.clock !== "function"
    || typeof input.directory !== "string" || input.directory.length < 1
    || typeof input.journalId !== "string" || !JOURNAL_ID.test(input.journalId)) {
    fail("DEPENDENCY_INVALID");
  }
  const directory = path.resolve(input.directory);
  const bindingBody = {
    schema:
      OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_SCHEMAS.client,
    schemaVersion: "1.0.0",
    serviceOriginHash: digest(
      "outsider/cloudflare-response-link-service-origin/v1", origin),
    journalId: input.journalId,
    journalRootRefHash: digest(
      "outsider/cloudflare-response-link-journal-root/v1", directory),
    initializeSupported: true,
    privateSellerRouteSupported: true,
    gmailTenderCompositionSupported: true,
    sourcePollingSupported: true,
    revokeSupported: true,
    rawCredentialProjected: false,
  };
  const state = {
    origin, adminBearer, tokenMacKey,
    randomBytesImpl: input.randomBytesImpl,
    requestImpl: input.requestImpl,
    clock: input.clock,
    directory,
    journalId: input.journalId,
    journalPath: path.join(directory, `${input.journalId}.events.jsonl`),
    responseDirectory: prepareDirectory(directory),
    events: [], definition: null, responseToken: null,
    operations: new Map(), operationOrder: [],
    clientBindingHash: digest(bindingBody.schema, bindingBody),
  };
  recoverAbandonedOperation(state);

  async function initializeExact(request = {}) {
    exact(request, ["definition"], "INITIALIZE_INPUT_INVALID");
    if (state.definition === null) {
      let entropy;
      try { entropy = Buffer.from(await state.randomBytesImpl(32)); }
      catch { fail("TOKEN_ENTROPY_UNAVAILABLE"); }
      if (entropy.length !== 32) fail("TOKEN_ENTROPY_INVALID");
      let responseToken;
      try {
        responseToken = createCloudflareOneUseTenderResponseTokenV1({
          entropyBytes: entropy, macKey: state.tokenMacKey,
        });
      } finally { entropy.fill(0); }
      let definition;
      try {
        definition = createOneUseTenderResponseLinkDefinitionV1({
          ...request.definition, responseToken,
        });
      } catch { fail("DEFINITION_INVALID"); }
      appendJournal(state, "LINK_PREPARED", clockInstant(state,
        "LINK_PREPARED_AT"), { responseToken, definition });
    } else {
      let expected;
      try {
        expected = createOneUseTenderResponseLinkDefinitionV1({
          ...request.definition, responseToken: state.responseToken,
        });
      } catch { fail("DEFINITION_INVALID"); }
      if (expected.definitionHash !== state.definition.definitionHash) {
        fail("DEFINITION_CONFLICT");
      }
    }
    let operation = lastOperation(state, "INITIALIZE");
    if (operation === null) {
      const body = Buffer.from(canonicalizeStrict(
        definitionInput(state.definition)), "utf8");
      const binding = { definitionHash: state.definition.definitionHash,
        tokenHash: state.definition.tokenHash };
      operation = { kind: "INITIALIZE",
        operationId: operationId("INITIALIZE", binding),
        bindingHash: digest(
          "outsider/cloudflare-response-link-initialize-binding/v1", binding) };
      operation = await issueRequest(state, operation, {
        method: "PUT",
        url: `${state.origin}/internal/v1/response-links/${state.responseToken}`,
        body,
      });
    }
    operation = parseInitialization(state, operation);
    const actionState = operation.resolution?.state
      ?? "INITIALIZE_ATTEMPTED_NO_RETRY_HOLD";
    return actionResult(operationProjection(state, operation, actionState));
  }

  function privateSellerRouteExact(request = {}) {
    exact(request, ["expectedTenderHash"], "SELLER_ROUTE_INPUT_INVALID");
    const initialized = lastOperation(state, "INITIALIZE");
    if (state.definition === null
      || request.expectedTenderHash !== state.definition.tenderHash
      || initialized?.resolution?.state !== "LINK_INITIALIZED_HOLD") {
      fail("SELLER_ROUTE_NOT_INITIALIZED");
    }
    return Object.freeze({
      schema:
        OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_SCHEMAS
          .privateSellerRoute,
      schemaVersion: "1.0.0",
      tenderHash: state.definition.tenderHash,
      tokenHash: state.definition.tokenHash,
      expiresAt: state.definition.expiresAt,
      sellerResponseUrl: `${state.origin}/r/v1/${state.responseToken}`,
      privateBearerRoute: true,
      publicProjectionPermitted: false,
    });
  }

  function composeGmailTenderBodyExact(request = {}) {
    exact(request, ["expectedTenderHash", "tenderText"],
      "GMAIL_BODY_INPUT_INVALID");
    if (typeof request.tenderText !== "string" || request.tenderText.length < 1
      || Buffer.byteLength(request.tenderText, "utf8") > MAX_GMAIL_PREFIX_BYTES
      || request.tenderText.includes("\u0000")
      || /(^|[^\r])\n/u.test(request.tenderText)
      || /\r(?!\n)/u.test(request.tenderText)) fail("GMAIL_BODY_TEXT_INVALID");
    const route = privateSellerRouteExact({
      expectedTenderHash: request.expectedTenderHash,
    });
    return Buffer.from(`${request.tenderText}\r\n\r\nRespond once using this `
      + `registration-free link:\r\n${route.sellerResponseUrl}\r\n`
      + `Response deadline: ${route.expiresAt}\r\n`, "utf8");
  }

  async function pollSourceExact(request = {}) {
    exact(request, ["expectedTenderHash"], "SOURCE_POLL_INPUT_INVALID");
    if (state.definition === null
      || request.expectedTenderHash !== state.definition.tenderHash) {
      fail("SOURCE_POLL_BINDING_INVALID");
    }
    const initialized = lastOperation(state, "INITIALIZE");
    if (initialized?.resolution?.state !== "LINK_INITIALIZED_HOLD") {
      fail("SOURCE_POLL_NOT_INITIALIZED");
    }
    const now = clockInstant(state, "SOURCE_POLL_GATE_AT");
    const revoked = lastOperation(state, "REVOKE");
    if (revoked?.resolution?.state === "LINK_REVOKED_HOLD") {
      return actionResult(operationProjection(state, revoked,
        "LINK_REVOKED_NO_RESPONSE_HOLD"));
    }
    if (Date.parse(now) >= Date.parse(state.definition.expiresAt)) {
      return actionResult(operationProjection(state, null,
        "LINK_EXPIRED_NO_RESPONSE_HOLD"));
    }
    let operation = lastOperation(state, "SOURCE_POLL");
    if (operation === null || operation.resolution !== null) {
      const ordinal = state.operationOrder.filter((id) =>
        state.operations.get(id).kind === "SOURCE_POLL").length + 1;
      const binding = { definitionHash: state.definition.definitionHash,
        tokenHash: state.definition.tokenHash, ordinal };
      operation = { kind: "SOURCE_POLL",
        operationId: operationId("SOURCE_POLL", binding),
        bindingHash: digest(
          "outsider/cloudflare-response-link-source-poll-binding/v1", binding) };
      operation = await issueRequest(state, operation, {
        method: "GET",
        url: `${state.origin}/internal/v1/response-link-sources/${
          state.definition.tokenHash}`,
        body: null,
      });
    }
    operation = parseSource(state, operation);
    const details = operation.resolution?.details;
    const actionState = operation.resolution?.state
      ?? "SOURCE_POLL_ATTEMPTED_HOLD";
    const responseSource = details?.sourceBodyHash === undefined ? null
      : parseJson(operation.response.bytes, "SOURCE_JSON_INVALID").source;
    const projection = operationProjection(state, operation, actionState,
      details?.sourceBodyHash === undefined ? {} : {
        declaredChoice: details.declaredChoice,
        sellerSourceHash: details.sourceBodyHash,
        sellerSourceByteLength: details.sourceByteLength,
        sellerResponseEventHash: details.eventHash,
      });
    return actionResult(projection, {
      operationId: operation.operationId,
      httpResponseBytes: operation.response === null ? null
        : Buffer.from(operation.response.bytes),
      sellerSourceBytes: responseSource === null ? null
        : Buffer.from(responseSource.sourceBodyBase64, "base64"),
      persistedEvent: responseSource?.event ?? null,
    });
  }

  async function revokeExact(request = {}) {
    exact(request, ["expectedTenderHash", "reasonCode"],
      "REVOKE_INPUT_INVALID");
    if (state.definition === null
      || request.expectedTenderHash !== state.definition.tenderHash) {
      fail("REVOKE_BINDING_INVALID");
    }
    if (!["REQUESTER_REVOKED", "TENDER_SUPERSEDED", "POLICY_REVOKED"]
      .includes(request.reasonCode)) fail("REVOKE_REASON_INVALID");
    let operation = lastOperation(state, "REVOKE");
    if (operation === null) {
      const requestBody = { expectedTenderHash: request.expectedTenderHash,
        reasonCode: request.reasonCode };
      const body = Buffer.from(canonicalizeStrict(requestBody), "utf8");
      const binding = { definitionHash: state.definition.definitionHash,
        requestBodyHash: byteHash(body) };
      operation = { kind: "REVOKE",
        operationId: operationId("REVOKE", binding),
        bindingHash: digest(
          "outsider/cloudflare-response-link-revoke-binding/v1", binding) };
      operation = await issueRequest(state, operation, {
        method: "POST",
        url: `${state.origin}/internal/v1/response-links/${
          state.responseToken}/revoke`, body,
      });
    } else {
      const expectedBody = Buffer.from(canonicalizeStrict({
        expectedTenderHash: request.expectedTenderHash,
        reasonCode: request.reasonCode,
      }), "utf8");
      const expected = digest(
        "outsider/cloudflare-response-link-revoke-binding/v1", {
          definitionHash: state.definition.definitionHash,
          requestBodyHash: byteHash(expectedBody),
        });
      if (operation.bindingHash !== expected) fail("REVOKE_CONFLICT");
    }
    operation = parseRevocation(state, operation);
    return actionResult(operationProjection(state, operation,
      operation.resolution?.state ?? "REVOKE_ATTEMPTED_NO_RETRY_HOLD"));
  }

  const client = Object.freeze({ ...bindingBody,
    clientBindingHash: state.clientBindingHash,
    boundary:
      OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_BOUNDARY,
    initializeExact,
    privateSellerRouteExact,
    composeGmailTenderBodyExact,
    pollSourceExact,
    revokeExact,
  });
  CLIENT_STATES.set(client, state);
  return client;
}

export function inspectCloudflareOneUseTenderResponseLinkAccountNativeClientV1(
  client) {
  if (!CLIENT_STATES.has(client)) fail("CLIENT_NOT_FACTORY_ISSUED");
  return client;
}

/** Claim exact authenticated HTTP and persisted seller source bytes once. */
export function claimCloudflareOneUseTenderResponseLinkSourceV1(result) {
  const state = SOURCE_RESULTS.get(result);
  if (state === undefined || state.consumed) {
    fail("SOURCE_RESULT_INVALID_OR_REPLAYED");
  }
  state.consumed = true;
  return Object.freeze({
    schema:
      OUTSIDER_CLOUDFLARE_RESPONSE_LINK_ACCOUNT_NATIVE_CLIENT_V1_SCHEMAS
        .privateSource,
    schemaVersion: "1.0.0",
    operationId: state.operationId,
    httpResponseBytes: state.httpResponseBytes === null ? null
      : Buffer.from(state.httpResponseBytes),
    sellerSourceBytes: state.sellerSourceBytes === null ? null
      : Buffer.from(state.sellerSourceBytes),
    persistedEvent: state.persistedEvent,
    interpretationPerformed: false,
    responseOccurrenceOnly: true,
    providerAcceptanceEstablished: false,
    capacityReserved: false,
    decisionState: "HOLD",
  });
}
