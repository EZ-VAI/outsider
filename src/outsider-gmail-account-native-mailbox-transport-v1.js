/*
 * Outcome Formation Engine: Gmail account-native mailbox transport v1.
 *
 * This is a provider edge for an exact, one-recipient mailbox effect.  It is
 * intentionally usable as the `deliverExact` closure of the web-native
 * mailto transaction-surface adapter.  The generic route runtime owns the
 * durable INTENT_ADMITTED -> SUBMIT_RESERVED -> SUBMIT_ATTEMPTED sequence;
 * this edge records a module-local no-retry attempt before its one injected
 * Gmail request and never performs an automatic second send.
 *
 * OAuth access tokens stay behind module-issued capabilities.  SEND and READ
 * are separate grants: gmail.send is sufficient for delivery, while optional
 * reply observation requires a distinct gmail.readonly grant.  A Gmail send
 * acknowledgement and an exact reply remain source bytes only.  Neither can
 * establish supplier acceptance, capacity, price, authority, or outcome.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const GMAIL_ID = /^[A-Za-z0-9_-]{1,512}$/u;
const JOURNAL_ID = /^journal_[a-f0-9]{32}$/u;
const ASCII_LOCAL_PART
  = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/u;
const ASCII_DOMAIN_LABEL
  = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;
const SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const API_ROOT = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const MAX_TENDER_BYTES = 8 * 1024 * 1024;
const MAX_PROVIDER_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_RAW_MESSAGE_BYTES = 16 * 1024 * 1024;
const MAX_OBSERVATION_CALLS = 8;
const MAX_TOTAL_LIST_REQUESTS = 16;
const MAX_TOTAL_GET_REQUESTS = 64;

const OAUTH_STATES = new WeakMap();
// One node owns the PostgreSQL namespace; serialize this account’s journal.
const ledgerMailboxQueues = new Map();
const TRANSPORT_STATES = new WeakMap();
const OBSERVATION_STATES = new WeakMap();

export const OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_SCHEMAS
  = Object.freeze({
    oauthCapability: "outsider/gmail-oauth-capability/v1",
    oauthRevocationReceipt: "outsider/gmail-oauth-revocation-receipt/v1",
    transport: "outsider/gmail-account-native-mailbox-transport/v1",
    replyObservation:
      "outsider/gmail-account-native-reply-observation/v1",
    privateReplySources:
      "outsider/gmail-account-native-private-reply-sources/v1",
    journalEvent: "outsider/gmail-account-native-journal-event/v1",
    responseHandle:
      "outsider/gmail-account-native-durable-response-handle/v1",
    sourcePins: "outsider/gmail-official-source-pin-set/v1",
  });

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function byteHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

const GOOGLE_SOURCES = Object.freeze([
  Object.freeze({
    sourceId: "GMAIL_SEND_GUIDE",
    canonicalUrl:
      "https://developers.google.com/workspace/gmail/api/guides/sending",
    revision: "LAST_UPDATED_2026-05-06",
    pinnedClaim: "RFC2822_MIME_ENCODED_AS_BASE64URL_RAW",
  }),
  Object.freeze({
    sourceId: "GMAIL_MESSAGES_SEND_REFERENCE",
    canonicalUrl:
      "https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send",
    revision: "LAST_UPDATED_2026-04-15",
    pinnedClaim:
      "POST_GMAIL_V1_USERS_ME_MESSAGES_SEND_WITH_GMAIL_SEND_SCOPE",
  }),
  Object.freeze({
    sourceId: "GMAIL_MESSAGES_LIST_REFERENCE",
    canonicalUrl:
      "https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list",
    revision: "LAST_UPDATED_2026-04-16",
    pinnedClaim: "GET_MESSAGES_LIST_WITH_Q_AND_FINITE_PAGINATION",
  }),
  Object.freeze({
    sourceId: "GMAIL_MESSAGES_GET_REFERENCE",
    canonicalUrl:
      "https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get",
    revision: "LAST_UPDATED_2026-04-15",
    pinnedClaim: "GET_MESSAGE_FORMAT_RAW_WITH_GMAIL_READONLY_SCOPE",
  }),
  Object.freeze({
    sourceId: "GMAIL_OAUTH_WEB_SERVER",
    canonicalUrl:
      "https://developers.google.com/workspace/gmail/api/auth/web-server",
    revision: "PINNED_2026-09-04",
    pinnedClaim: "OAUTH2_USER_GRANT_REQUIRED_AND_OFFLINE_REFRESH_IS_EXPLICIT",
  }),
  Object.freeze({
    sourceId: "GMAIL_OAUTH_SCOPES",
    canonicalUrl:
      "https://developers.google.com/workspace/gmail/api/auth/scopes",
    revision: "LAST_UPDATED_2026-07-22",
    pinnedClaim: "GMAIL_SEND_AND_GMAIL_READONLY_ARE_DISTINCT_SCOPES",
  }),
]);

const SOURCE_PIN_BODY = Object.freeze({
  schema:
    OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_SCHEMAS.sourcePins,
  schemaVersion: "1.0.0",
  pinnedAt: "2026-09-04T00:00:00.000Z",
  sources: GOOGLE_SOURCES,
});

export const OUTSIDER_GMAIL_OFFICIAL_SOURCE_PINS_V1 = Object.freeze({
  ...SOURCE_PIN_BODY,
  sourcePinSetHash: digest(SOURCE_PIN_BODY.schema, SOURCE_PIN_BODY),
});

export const OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_BOUNDARY
  = Object.freeze({
    position: "ACCOUNT_NATIVE_GMAIL_ONE_USE_MAILBOX_EDGE",
    providerRegistryCreated: false,
    providerEnrollmentRequired: false,
    injectedRequestImplementationRequired: true,
    globalFetchFallbackPresent: false,
    ambientCredentialAccepted: false,
    browserCredentialAccepted: false,
    rawOAuthTokenProjected: false,
    sendAndReadCapabilitiesSeparated: true,
    sendOnlyOperationSupported: true,
    sendScope: SEND_SCOPE,
    replyObservationScope: READ_SCOPE,
    broaderModifyOrFullMailboxScopeRequired: false,
    exactlyOneRecipientRequired: true,
    rfc5322MimeRequired: true,
    gmailRawEncoding: "BASE64URL_WITHOUT_PADDING",
    privateJournalMode: "0600",
    privateJournalAppendOnly: true,
    sendAttemptFsyncedBeforePost: true,
    successfulDeliveryReceiptAndCorrelationFsynced: true,
    successfulHttpResponseHandleFsyncedBeforeReceiptParsing: true,
    responseHandleColdRecoveryRequired: true,
    coldRestartMayObserveButNeverResend: true,
    maximumSendRequestsPerExactBinding: 1,
    automaticRetryAfterSendAttempted: false,
    replyObservationReadOnly: true,
    maximumObservationCallsPerSend: MAX_OBSERVATION_CALLS,
    maximumListRequestsPerSend: MAX_TOTAL_LIST_REQUESTS,
    maximumGetRequestsPerSend: MAX_TOTAL_GET_REQUESTS,
    exactProviderBytesRetainedPrivately: true,
    rawProviderBytesProjected: false,
    deliveryReceiptIsAcceptance: false,
    counterpartyResponseIsAcceptance: false,
    counterpartyResponseCreatesCapacity: false,
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: false,
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

function boundedInteger(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(code);
  }
  return value;
}

function boundedBytes(value, maximum, code) {
  if (!Buffer.isBuffer(value) || value.length < 1 || value.length > maximum) {
    fail(code);
  }
  return Buffer.from(value);
}

function clockInstant(state, code) {
  let value;
  try { value = state.clock(); } catch { fail(`${code}_FAILED`); }
  return instant(value, `${code}_INVALID`);
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function prepareJournalDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const locks = path.join(directory, ".send-locks-v1");
  mkdirSync(locks, { recursive: true, mode: 0o700 });
  chmodSync(locks, 0o700);
  const responses = path.join(directory, ".response-handles-v1");
  mkdirSync(responses, { recursive: true, mode: 0o700 });
  chmodSync(responses, 0o700);
  return { locks, responses };
}

function journalEvent(state, eventType, recordedAt, payload) {
  const body = {
    schema:
      OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_SCHEMAS.journalEvent,
    schemaVersion: "1.0.0",
    sequence: state.events.length + 1,
    previousEventHash: state.events.length === 0
      ? null : state.events[state.events.length - 1].eventHash,
    recordedAt,
    eventType,
    payload,
  };
  return { ...body, eventHash: digest(body.schema, body) };
}

function decodePersistedBytes(value, expectedHash, code,
  maximum = MAX_PROVIDER_RESPONSE_BYTES) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) {
    fail(`${code}_BASE64_INVALID`);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 1 || bytes.length > maximum
    || bytes.toString("base64") !== value
    || byteHash(bytes) !== expectedHash) fail(`${code}_BYTES_INVALID`);
  return bytes;
}

function applyJournalEvent(state, event) {
  const payload = event.payload;
  if (payload === null || typeof payload !== "object"
    || Array.isArray(payload)) fail("JOURNAL_PAYLOAD_INVALID");
  if (event.eventType === "SEND_ATTEMPTED") {
    const transactionBindingHash = hash(payload.transactionBindingHash,
      "JOURNAL_TRANSACTION_BINDING_HASH_INVALID");
    const bindingHash = hash(payload.bindingHash,
      "JOURNAL_BINDING_HASH_INVALID");
    const idempotencyKeyHash = hash(payload.idempotencyKeyHash,
      "JOURNAL_IDEMPOTENCY_KEY_HASH_INVALID");
    const oneUseNonceHash = hash(payload.oneUseNonceHash,
      "JOURNAL_ONE_USE_NONCE_HASH_INVALID");
    if (state.sends.has(transactionBindingHash)
      || (state.idempotency.has(idempotencyKeyHash)
        && state.idempotency.get(idempotencyKeyHash) !== bindingHash)
      || (state.nonces.has(oneUseNonceHash)
        && state.nonces.get(oneUseNonceHash) !== bindingHash)) {
      fail("JOURNAL_SEND_ATTEMPT_CONFLICT");
    }
    const recipient = canonicalAddress(payload.recipient,
      "JOURNAL_RECIPIENT_INVALID");
    if (hash(payload.recipientAddressHash,
      "JOURNAL_RECIPIENT_HASH_INVALID") !== digest(
      "outsider/gmail-account-native-recipient/v1", recipient)) {
      fail("JOURNAL_RECIPIENT_HASH_MISMATCH");
    }
    if (payload.messageIdHeader !== messageIdFor(transactionBindingHash)) {
      fail("JOURNAL_MESSAGE_ID_INVALID");
    }
    const record = {
      status: "ATTEMPTED_NO_RETRY",
      bindingHash,
      transactionBindingHash,
      recipient,
      ...(payload.replyToAddress ? { replyToAddress: canonicalAddress(payload.replyToAddress, "JOURNAL_REPLY_TO_INVALID") } : {}),
      recipientAddressHash: payload.recipientAddressHash,
      messageIdHeader: payload.messageIdHeader,
      subject: payload.subject ?? `Outsider one-use tender ${transactionBindingHash.slice(7, 19)}`,
      attemptedAt: instant(payload.attemptedAt,
        "JOURNAL_ATTEMPTED_AT_INVALID"),
      completedAt: null,
      gmailMessageId: null,
      gmailThreadId: null,
      receiptBytes: null,
      observationCalls: 0,
      listRequests: 0,
      getRequests: 0,
      idempotencyKeyHash,
      oneUseNonceHash,
    };
    state.sends.set(transactionBindingHash, record);
    state.idempotency.set(idempotencyKeyHash, bindingHash);
    state.nonces.set(oneUseNonceHash, bindingHash);
    return;
  }
  if (event.eventType === "SEND_COMPLETED") {
    const transactionBindingHash = hash(payload.transactionBindingHash,
      "JOURNAL_TRANSACTION_BINDING_HASH_INVALID");
    const record = state.sends.get(transactionBindingHash);
    if (record === undefined || record.status !== "ATTEMPTED_NO_RETRY"
      || payload.bindingHash !== record.bindingHash
      || typeof payload.gmailMessageId !== "string"
      || !GMAIL_ID.test(payload.gmailMessageId)
      || typeof payload.gmailThreadId !== "string"
      || !GMAIL_ID.test(payload.gmailThreadId)
      || typeof payload.receiptHash !== "string"
      || !HASH.test(payload.receiptHash)) fail("JOURNAL_SEND_COMPLETION_INVALID");
    const completedAt = instant(payload.completedAt,
      "JOURNAL_COMPLETED_AT_INVALID");
    if (Date.parse(completedAt) < Date.parse(record.attemptedAt)) {
      fail("JOURNAL_COMPLETION_PRECEDES_ATTEMPT");
    }
    record.status = "DELIVERED";
    record.completedAt = completedAt;
    record.gmailMessageId = payload.gmailMessageId;
    record.gmailThreadId = payload.gmailThreadId;
    record.receiptBytes = decodePersistedBytes(payload.receiptBase64,
      payload.receiptHash, "JOURNAL_SEND_RECEIPT");
    return;
  }
  if (event.eventType === "REPLY_OBSERVATION_RECORDED") {
    const transactionBindingHash = hash(payload.transactionBindingHash,
      "JOURNAL_TRANSACTION_BINDING_HASH_INVALID");
    const record = state.sends.get(transactionBindingHash);
    if (record === undefined || record.status !== "DELIVERED"
      || !Number.isSafeInteger(payload.observationCallCount)
      || !Number.isSafeInteger(payload.cumulativeListRequestCount)
      || !Number.isSafeInteger(payload.cumulativeGetRequestCount)
      || payload.observationCallCount < record.observationCalls
      || payload.cumulativeListRequestCount < record.listRequests
      || payload.cumulativeGetRequestCount < record.getRequests
      || !Array.isArray(payload.sourceOccurrences)
      || payload.sourceOccurrences.length !== payload.sourceOccurrenceCount
      || !Number.isSafeInteger(payload.sourceOccurrenceCount)
      || payload.sourceOccurrenceCount < 1
      || payload.sourceOccurrenceCount > 100) {
      fail("JOURNAL_REPLY_OBSERVATION_INVALID");
    }
    const allowed = new Set(["GMAIL_MESSAGES_LIST_RESPONSE",
      "GMAIL_MESSAGES_GET_RAW_RESPONSE", "RFC5322_COUNTERPARTY_RESPONSE"]);
    for (const source of payload.sourceOccurrences) {
      if (source === null || typeof source !== "object"
        || Array.isArray(source) || !allowed.has(source.sourceKind)
        || instant(source.observedAt, "JOURNAL_REPLY_SOURCE_AT_INVALID")
          !== source.observedAt
        || hash(source.sourceHash, "JOURNAL_REPLY_SOURCE_HASH_INVALID")
          !== source.sourceHash) fail("JOURNAL_REPLY_SOURCE_INVALID");
      decodePersistedBytes(source.bytesBase64, source.sourceHash,
        "JOURNAL_REPLY_SOURCE", source.sourceKind
          === "RFC5322_COUNTERPARTY_RESPONSE"
          ? MAX_RAW_MESSAGE_BYTES : MAX_PROVIDER_RESPONSE_BYTES);
    }
    if ((payload.responseHash === null) !== (payload.responseBase64 === null)) {
      fail("JOURNAL_REPLY_RESPONSE_INVALID");
    }
    if (payload.responseHash !== null) {
      decodePersistedBytes(payload.responseBase64,
        hash(payload.responseHash, "JOURNAL_REPLY_RESPONSE_HASH_INVALID"),
        "JOURNAL_REPLY_RESPONSE", MAX_RAW_MESSAGE_BYTES);
    }
    record.observationCalls = payload.observationCallCount;
    record.listRequests = payload.cumulativeListRequestCount;
    record.getRequests = payload.cumulativeGetRequestCount;
    return;
  }
  fail("JOURNAL_EVENT_TYPE_INVALID");
}

function verifyJournalEvent(event, sequence, previousEventHash) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    fail("JOURNAL_EVENT_INVALID");
  }
  const body = {
    schema: event.schema,
    schemaVersion: event.schemaVersion,
    sequence: event.sequence,
    previousEventHash: event.previousEventHash,
    recordedAt: event.recordedAt,
    eventType: event.eventType,
    payload: event.payload,
  };
  if (body.schema
      !== OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_SCHEMAS
        .journalEvent
    || body.schemaVersion !== "1.0.0" || body.sequence !== sequence
    || body.previousEventHash !== previousEventHash
    || !["SEND_ATTEMPTED", "SEND_COMPLETED",
      "REPLY_OBSERVATION_RECORDED"].includes(body.eventType)
    || instant(body.recordedAt, "JOURNAL_RECORDED_AT_INVALID")
      !== body.recordedAt
    || event.eventHash !== digest(body.schema, body)) {
    fail("JOURNAL_CHAIN_INVALID");
  }
  return event;
}

function replayJournal(state) {
  state.events = [];
  state.sends.clear();
  state.idempotency.clear();
  state.nonces.clear();
  let lines;
  if(state.ledger){
    lines=state.ledger.entries(state.recordPrefix+'/events/'+state.journalId+'/')
      .sort(([a],[b])=>a.localeCompare(b)).map(([,event])=>JSON.stringify(event));
  }else{
    if (!existsSync(state.journalPath)) return;
    const bytes = readFileSync(state.journalPath);
    if (bytes.length < 1 || !bytes.toString("utf8").endsWith("\n")) fail("JOURNAL_PARTIAL_OR_EMPTY");
    lines = bytes.toString("utf8").slice(0, -1).split("\n");
  }
  let previous = null;
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try { event = JSON.parse(lines[index]); }
    catch { fail("JOURNAL_JSON_INVALID"); }
    verifyJournalEvent(event, index + 1, previous);
    applyJournalEvent(state, event);
    state.events.push(event);
    previous = event.eventHash;
  }
}

async function appendJournal(state, eventType, recordedAt, payload) {
  const event = journalEvent(state, eventType, recordedAt, payload);
  if(state.ledger){
    const key=state.recordPrefix+'/events/'+state.journalId+'/'+String(event.sequence).padStart(12,'0')+'.json';
    await state.ledger.put(key,event,{kind:'MAIL_'+eventType,expected:{[key]:null}});
    applyJournalEvent(state,event);state.events.push(event);return event;
  }
  const line = Buffer.from(`${canonicalizeStrict(event)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(state.journalPath, "a", 0o600);
    chmodSync(state.journalPath, 0o600);
    let offset = 0;
    while (offset < line.length) {
      offset += writeSync(descriptor, line, offset, line.length - offset);
    }
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  fsyncDirectory(state.directory);
  applyJournalEvent(state, event);
  state.events.push(event);
  return event;
}

function acquireSendLock(state, transactionBindingHash) {
  if(state.ledger)return {ledger:true};
  const file = path.join(state.lockDirectory,
    `${transactionBindingHash.slice(7)}.lock`);
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    const owner = canonicalizeStrict({
      schema: "outsider/gmail-account-native-send-lock-owner/v1",
      journalId: state.journalId,
      transactionBindingHash,
      processId: process.pid,
    });
    writeSync(descriptor, `${owner}\n`, null, "utf8");
    fsyncSync(descriptor);
    fsyncDirectory(state.lockDirectory);
    return { descriptor, file };
  } catch {
    if (descriptor !== undefined) closeSync(descriptor);
    fail("SEND_BINDING_LOCKED_NO_RETRY");
  }
}

function releaseSendLock(state, lock) {
  if (lock === null||lock.ledger) return;
  try { closeSync(lock.descriptor); } catch { /* already closed */ }
  try { unlinkSync(lock.file); } catch { /* stale lock is fail-closed */ }
  fsyncDirectory(state.lockDirectory);
}

function responseHandlePath(state, transactionBindingHash) {
  return path.join(state.responseDirectory,
    `${transactionBindingHash.slice(7)}.response.json`);
}

async function writeResponseHandle(state, delivery, attemptedAt, exactResponse) {
  const body = {
    schema:
      OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_SCHEMAS
        .responseHandle,
    schemaVersion: "1.0.0",
    journalId: state.journalId,
    transactionBindingHash: delivery.transactionBindingHash,
    bindingHash: delivery.bindingHash,
    attemptedAt,
    responseStatus: exactResponse.status,
    responseHash: byteHash(exactResponse.bytes),
    responseBase64: exactResponse.bytes.toString("base64"),
  };
  const handle = { ...body, handleHash: digest(body.schema, body) };
  const file = responseHandlePath(state, delivery.transactionBindingHash);
  if(state.ledger){const key=state.recordPrefix+'/responses/'+path.basename(file);
    await state.ledger.put(key,handle,{kind:'MAIL_RESPONSE_RECEIVED',expected:{[key]:null}});return file;}

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
  } catch {
    fail("RESPONSE_HANDLE_WRITE_FAILED_NO_RETRY");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  fsyncDirectory(state.responseDirectory);
  return file;
}

function readResponseHandle(state, file, transactionBindingHash) {
  let handle;
  try {
    const bytes = state.ledger?Buffer.from(JSON.stringify(state.ledger.read(state.recordPrefix+'/responses/'+path.basename(file)))+'\n'):readFileSync(file);
    if (bytes.length < 2 || !bytes.toString("utf8").endsWith("\n")) {
      fail("RESPONSE_HANDLE_PARTIAL");
    }
    handle = JSON.parse(bytes.toString("utf8").slice(0, -1));
  } catch (error) {
    if (error?.outsiderCode !== undefined) throw error;
    fail("RESPONSE_HANDLE_INVALID");
  }
  if (handle === null || typeof handle !== "object" || Array.isArray(handle)) {
    fail("RESPONSE_HANDLE_INVALID");
  }
  const body = {
    schema: handle.schema,
    schemaVersion: handle.schemaVersion,
    journalId: handle.journalId,
    transactionBindingHash: handle.transactionBindingHash,
    bindingHash: handle.bindingHash,
    attemptedAt: handle.attemptedAt,
    responseStatus: handle.responseStatus,
    responseHash: handle.responseHash,
    responseBase64: handle.responseBase64,
  };
  if (body.schema
      !== OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_SCHEMAS
        .responseHandle
    || body.schemaVersion !== "1.0.0" || body.journalId !== state.journalId
    || body.transactionBindingHash !== transactionBindingHash
    || !HASH.test(body.bindingHash) || body.responseStatus !== 200
    || handle.handleHash !== digest(body.schema, body)) {
    fail("RESPONSE_HANDLE_BINDING_INVALID");
  }
  const responseBytes = decodePersistedBytes(body.responseBase64,
    hash(body.responseHash, "RESPONSE_HANDLE_HASH_INVALID"),
    "RESPONSE_HANDLE");
  return { ...body, responseBytes };
}

function lockOwnerIsLive(state, transactionBindingHash) {
  if(state.ledger)return {live:false,file:null};
  const file = path.join(state.lockDirectory,
    `${transactionBindingHash.slice(7)}.lock`);
  if (!existsSync(file)) return { file, live: false };
  let owner;
  try {
    const bytes = readFileSync(file, "utf8");
    owner = JSON.parse(bytes.endsWith("\n") ? bytes.slice(0, -1) : bytes);
  } catch { fail("SEND_LOCK_OWNER_INVALID"); }
  if (owner?.schema !== "outsider/gmail-account-native-send-lock-owner/v1"
    || owner.journalId !== state.journalId
    || owner.transactionBindingHash !== transactionBindingHash
    || !Number.isSafeInteger(owner.processId) || owner.processId < 1) {
    fail("SEND_LOCK_OWNER_INVALID");
  }
  let live = true;
  try { process.kill(owner.processId, 0); }
  catch (error) {
    if (error?.code === "ESRCH") live = false;
    else if (error?.code !== "EPERM") throw error;
  }
  return { file, live };
}

function removeRecoveredFiles(state, responseFile, lockFile) {
  if(state.ledger)return; // Keep immutable provider response evidence.
  try { unlinkSync(responseFile); } catch { fail("RESPONSE_HANDLE_REMOVE_FAILED"); }
  fsyncDirectory(state.responseDirectory);
  if (existsSync(lockFile)) {
    try { unlinkSync(lockFile); } catch { fail("STALE_SEND_LOCK_REMOVE_FAILED"); }
    fsyncDirectory(state.lockDirectory);
  }
}

function removeResponseHandle(state, responseFile) {
  if(state.ledger)return;
  try { unlinkSync(responseFile); } catch { fail("RESPONSE_HANDLE_REMOVE_FAILED"); }
  fsyncDirectory(state.responseDirectory);
}

async function recoverResponseHandles(state) {
  const files = state.ledger?state.ledger.entries(state.recordPrefix+'/responses/').filter(([,r])=>r.journalId===state.journalId).map(([key])=>path.basename(key)).sort():readdirSync(state.responseDirectory).sort();
  for (const name of files) {
    const match = /^([a-f0-9]{64})\.response\.json$/u.exec(name);
    if (match === null) fail("RESPONSE_HANDLE_FILENAME_INVALID");
    const transactionBindingHash = `sha256:${match[1]}`;
    const responseFile = path.join(state.responseDirectory, name);
    const handle = readResponseHandle(state, responseFile,
      transactionBindingHash);
    const record = state.sends.get(transactionBindingHash);
    if (record === undefined || record.bindingHash !== handle.bindingHash
      || record.attemptedAt !== handle.attemptedAt) {
      fail("RESPONSE_HANDLE_ATTEMPT_BINDING_INVALID");
    }
    const lock = lockOwnerIsLive(state, transactionBindingHash);
    if (lock.live) fail("RESPONSE_HANDLE_OWNER_STILL_ACTIVE");
    const correlation = gmailReceipt(handle.responseBytes);
    if (record.status === "ATTEMPTED_NO_RETRY") {
      await appendJournal(state, "SEND_COMPLETED", record.attemptedAt, {
        transactionBindingHash,
        bindingHash: record.bindingHash,
        completedAt: record.attemptedAt,
        gmailMessageId: correlation.messageId,
        gmailThreadId: correlation.threadId,
        receiptHash: handle.responseHash,
        receiptBase64: handle.responseBase64,
        recoveredFromDurableResponseHandle: true,
      });
    } else if (record.status !== "DELIVERED"
      || record.gmailMessageId !== correlation.messageId
      || record.gmailThreadId !== correlation.threadId
      || byteHash(record.receiptBytes) !== handle.responseHash) {
      fail("RESPONSE_HANDLE_COMPLETION_CONFLICT");
    }
    removeRecoveredFiles(state, responseFile, lock.file);
  }
}

function canonicalAddress(value, code) {
  if (typeof value !== "string" || value.length < 3
    || Buffer.byteLength(value, "utf8") > 254
    || /[^\x21-\x7e]/u.test(value) || /[,;<>]/u.test(value)) fail(code);
  const separator = value.lastIndexOf("@");
  if (separator < 1 || separator !== value.indexOf("@")) fail(code);
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  const labels = domain.split(".");
  if (Buffer.byteLength(local, "ascii") > 64
    || !ASCII_LOCAL_PART.test(local) || domain.length > 253
    || labels.length < 2
    || labels.some((label) => !ASCII_DOMAIN_LABEL.test(label))) fail(code);
  return `${local}@${domain.toLowerCase()}`;
}

function headerAddress(value) {
  if (typeof value !== "string" || /[\r\n]/u.test(value)) return null;
  const trimmed = value.trim();
  const angle = /<([^<>]+)>\s*$/u.exec(trimmed);
  const candidate = angle === null ? trimmed : angle[1];
  try { return canonicalAddress(candidate, "REPLY_FROM_INVALID"); }
  catch { return null; }
}

function issueOAuth(kind, scope, input) {
  exact(input, ["accessToken", "accountRefHash", "oauthGrantHash",
    "senderAddress", "issuedAt", "expiresAt"], "OAUTH_INPUT_INVALID");
  if (typeof input.accessToken !== "string"
    || input.accessToken.length < 20 || input.accessToken.length > 8192
    || /[^\x21-\x7e]/u.test(input.accessToken)) fail("OAUTH_TOKEN_INVALID");
  const accountRefHash = hash(input.accountRefHash,
    "OAUTH_ACCOUNT_REF_HASH_INVALID");
  const oauthGrantHash = hash(input.oauthGrantHash,
    "OAUTH_GRANT_HASH_INVALID");
  const senderAddress = canonicalAddress(input.senderAddress,
    "OAUTH_SENDER_ADDRESS_INVALID");
  const issuedAt = instant(input.issuedAt, "OAUTH_ISSUED_AT_INVALID");
  const expiresAt = instant(input.expiresAt, "OAUTH_EXPIRES_AT_INVALID");
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    fail("OAUTH_EXPIRY_NOT_AFTER_ISSUANCE");
  }
  const body = {
    schema:
      OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_SCHEMAS
        .oauthCapability,
    schemaVersion: "1.0.0",
    capabilityKind: kind,
    scope,
    accountRefHash,
    oauthGrantHash,
    senderAddressHash: digest(
      "outsider/gmail-account-native-sender-address/v1", senderAddress),
    issuedAt,
    expiresAt,
    sourcePinSetHash: OUTSIDER_GMAIL_OFFICIAL_SOURCE_PINS_V1.sourcePinSetHash,
    rawAccessTokenProjected: false,
    rawSenderAddressProjected: false,
    ambientCredentialAccepted: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  const capability = Object.freeze({ ...body,
    capabilityHash: digest(body.schema, body) });
  OAUTH_STATES.set(capability, {
    kind, scope, accountRefHash, oauthGrantHash, senderAddress,
    issuedAt, expiresAt, accessToken: input.accessToken, revokedAt: null,
  });
  return capability;
}

/** Issue a finite, module-identity-bound gmail.send capability. */
export function issueGmailSendOAuthCapabilityV1(input = {}) {
  return issueOAuth("SEND", SEND_SCOPE, input);
}

/** Issue a separate finite gmail.readonly capability for reply observation. */
export function issueGmailReadOAuthCapabilityV1(input = {}) {
  return issueOAuth("READ", READ_SCOPE, input);
}

function oauthState(capability, kind) {
  const state = OAUTH_STATES.get(capability);
  if (state === undefined || state.kind !== kind) {
    fail(`${kind}_OAUTH_CAPABILITY_NOT_MODULE_ISSUED`);
  }
  return state;
}

/** Revoke either exact module-issued capability without exposing its token. */
export function revokeGmailOAuthCapabilityV1(capability, input = {}) {
  exact(input, ["revokedAt"], "OAUTH_REVOCATION_INPUT_INVALID");
  const state = OAUTH_STATES.get(capability);
  if (state === undefined) fail("OAUTH_CAPABILITY_NOT_MODULE_ISSUED");
  const revokedAt = instant(input.revokedAt, "OAUTH_REVOKED_AT_INVALID");
  if (Date.parse(revokedAt) < Date.parse(state.issuedAt)) {
    fail("OAUTH_REVOCATION_PRECEDES_ISSUANCE");
  }
  if (state.revokedAt !== null && state.revokedAt !== revokedAt) {
    fail("OAUTH_ALREADY_REVOKED");
  }
  state.revokedAt = revokedAt;
  const body = {
    schema:
      OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_SCHEMAS
        .oauthRevocationReceipt,
    schemaVersion: "1.0.0",
    capabilityHash: capability.capabilityHash,
    capabilityKind: state.kind,
    revokedAt,
    rawAccessTokenProjected: false,
  };
  return Object.freeze({ ...body,
    revocationReceiptHash: digest(body.schema, body) });
}

/** Privacy-closed inspection of an exact module-issued OAuth capability. */
export function inspectGmailOAuthCapabilityV1(capability) {
  if (!OAUTH_STATES.has(capability)) {
    fail("OAUTH_CAPABILITY_NOT_MODULE_ISSUED");
  }
  return capability;
}

function assertOAuthCurrent(state, observedAt, kind) {
  if (Date.parse(observedAt) < Date.parse(state.issuedAt)
    || Date.parse(observedAt) >= Date.parse(state.expiresAt)
    || state.revokedAt !== null) fail(`${kind}_OAUTH_NOT_CURRENT`);
}

function readableTenderText(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail("TENDER_TEXT_UTF8_REQUIRED"); }
  if (!Buffer.from(text, "utf8").equals(bytes) || text.includes("\u0000")
    || /(^|[^\r])\n/u.test(text) || /\r(?!\n)/u.test(text)) {
    fail("TENDER_TEXT_CRLF_SAFE_REQUIRED");
  }
  return text;
}

function messageIdFor(transactionBindingHash) {
  hash(transactionBindingHash, "TRANSACTION_BINDING_HASH_INVALID");
  return `<outsider.${transactionBindingHash.slice(7)}@one-use.invalid>`;
}

function buildMime(senderAddress, delivery, attemptedAt, parent = null) {
  const tenderText = readableTenderText(delivery.tenderBytes);
  const messageId = messageIdFor(delivery.transactionBindingHash);
  const subject = parent?.subject ?? delivery.subject ?? `Outsider one-use tender ${
    delivery.transactionBindingHash.slice(7, 19)}`;
  const replyToAddress = parent?.replyToAddress ?? delivery.replyToAddress;
  const headers = [
    `From: ${senderAddress}`,
    ...(replyToAddress ? [`Reply-To: ${replyToAddress}`] : []),
    `To: ${delivery.recipient}`,
    `Date: ${new Date(Date.parse(attemptedAt)).toUTCString()}`,
    `Message-ID: ${messageId}`,
    `Subject: ${subject}`,
    ...(parent ? [`In-Reply-To: ${parent.messageIdHeader}`, `References: ${parent.messageIdHeader}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    `X-Outsider-Transaction-Binding: ${delivery.transactionBindingHash}`,
    `X-Outsider-Tender-Body-Hash: ${delivery.tenderBodyHash}`,
  ];
  return {
    messageId,
    subject,
    ...(replyToAddress ? { replyToAddress } : {}),
    bytes: Buffer.from(`${headers.join("\r\n")}\r\n\r\n${
      tenderText}${tenderText.endsWith("\r\n") ? "" : "\r\n"}`, "utf8"),
  };
}

function normalizeDelivery(input, profile) {
  const optional = profile === 'DELIVER_EXACT'
    ? ['subject', 'replyToTransactionBindingHash', 'replyToAddress'].filter(key => Object.hasOwn(input ?? {}, key)) : [];
  exact(input, profile === "DELIVER_EXACT"
    ? ["recipient", "candidateRefHash", "tenderBytes", "tenderBodyHash",
      "transactionBindingHash", "authorityGrantHash", "effectDeadline",
      "idempotencyKey", "oneUseNonceHash", ...optional]
    : ["recipient", "recipientMailboxRefHash", "tenderBytes", "tenderHash",
      "tenderBodyHash", "authorityGrantHash", "idempotencyKey",
      "idempotencyKeyHash", "effectDeadline", "transactionBindingHash",
    ], `${profile}_INPUT_INVALID`);
  const tenderBytes = boundedBytes(input.tenderBytes, MAX_TENDER_BYTES,
    "TENDER_BYTES_INVALID");
  const tenderBodyHash = hash(input.tenderBodyHash,
    "TENDER_BODY_HASH_INVALID");
  if (byteHash(tenderBytes) !== tenderBodyHash) fail("TENDER_BODY_HASH_MISMATCH");
  if (typeof input.idempotencyKey !== "string"
    || input.idempotencyKey.length < 1 || input.idempotencyKey.length > 4096
    || /[\u0000\r\n]/u.test(input.idempotencyKey)) {
    fail("IDEMPOTENCY_KEY_INVALID");
  }
  const routeRefHash = hash(profile === "DELIVER_EXACT"
    ? input.candidateRefHash : input.recipientMailboxRefHash,
  "ROUTE_REF_HASH_INVALID");
  const delivery = {
    ...(optional.includes('subject') ? {subject: input.subject} : {}),
    ...(optional.includes('replyToAddress') ? {replyToAddress: canonicalAddress(input.replyToAddress, 'REPLY_TO_ADDRESS_INVALID')} : {}),
    ...(optional.includes('replyToTransactionBindingHash') ? {replyToTransactionBindingHash:
      hash(input.replyToTransactionBindingHash, 'REPLY_PARENT_INVALID')} : {}),
    recipient: canonicalAddress(input.recipient, "EXACT_ONE_RECIPIENT_REQUIRED"),
    routeRefHash,
    tenderBytes,
    tenderBodyHash,
    transactionBindingHash: hash(input.transactionBindingHash,
      "TRANSACTION_BINDING_HASH_INVALID"),
    authorityGrantHash: hash(input.authorityGrantHash,
      "AUTHORITY_GRANT_HASH_INVALID"),
    effectDeadline: instant(input.effectDeadline, "EFFECT_DEADLINE_INVALID"),
    idempotencyKeyHash: digest(profile === "SEND_EXACT"
      ? "outsider/permissioned-mailbox-idempotency-key/v1"
      : "outsider/gmail-account-native-idempotency-key/v1",
    input.idempotencyKey),
    oneUseNonceHash: profile === "DELIVER_EXACT"
      ? hash(input.oneUseNonceHash, "ONE_USE_NONCE_HASH_INVALID")
      : digest("outsider/gmail-account-native-generic-child-nonce/v1", {
        transactionBindingHash: input.transactionBindingHash,
        idempotencyKeyHash: input.idempotencyKeyHash,
      }),
  };
  if (delivery.subject !== undefined && (typeof delivery.subject !== 'string'
    || !/^[\x20-\x7e]{1,150}$/u.test(delivery.subject))) fail('SUBJECT_INVALID');
  if (profile === "SEND_EXACT") {
    hash(input.tenderHash, "TENDER_HASH_INVALID");
    if (input.idempotencyKeyHash !== delivery.idempotencyKeyHash) {
      fail("IDEMPOTENCY_KEY_HASH_MISMATCH");
    }
  }
  delivery.bindingHash = digest(
    "outsider/gmail-account-native-exact-delivery-binding/v1", {
      recipientAddressHash: digest(
        "outsider/gmail-account-native-recipient/v1", delivery.recipient),
      routeRefHash: delivery.routeRefHash,
      tenderBodyHash: delivery.tenderBodyHash,
      transactionBindingHash: delivery.transactionBindingHash,
      authorityGrantHash: delivery.authorityGrantHash,
      effectDeadline: delivery.effectDeadline,
      idempotencyKeyHash: delivery.idempotencyKeyHash,
      oneUseNonceHash: delivery.oneUseNonceHash,
      ...(delivery.subject === undefined ? {} : {subject: delivery.subject}),
      ...(delivery.replyToAddress === undefined ? {} : {replyToAddress: delivery.replyToAddress}),
      ...(delivery.replyToTransactionBindingHash === undefined ? {} : {replyToTransactionBindingHash: delivery.replyToTransactionBindingHash}),
    });
  return delivery;
}

function providerBytes(response, code) {
  if (response === null || typeof response !== "object"
    || !Number.isSafeInteger(response.status) || response.status < 100
    || response.status > 599) fail(`${code}_RESPONSE_INVALID`);
  return {
    status: response.status,
    bytes: boundedBytes(response.body, MAX_PROVIDER_RESPONSE_BYTES,
      `${code}_BODY_INVALID`),
  };
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function gmailReceipt(bytes) {
  const value = parseJson(bytes, "GMAIL_SEND_RECEIPT_JSON_INVALID");
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || typeof value.id !== "string" || !GMAIL_ID.test(value.id)
    || typeof value.threadId !== "string" || !GMAIL_ID.test(value.threadId)) {
    fail("GMAIL_SEND_RECEIPT_INVALID");
  }
  return { messageId: value.id, threadId: value.threadId };
}

function sameDelivery(record, delivery) {
  return record.bindingHash === delivery.bindingHash;
}

function successfulDelivery(record) {
  return {
    completedAt: record.completedAt,
    deliveryReceiptBytes: Buffer.from(record.receiptBytes),
    counterpartyResponseBytes: null,
    reservationReceiptBytes: null,
  };
}

async function request(state, capabilityState, requestInput, kind) {
  const at = clockInstant(state, `${kind}_REQUEST_AT`);
  assertOAuthCurrent(capabilityState, at, kind);
  const headers = Object.freeze({
    accept: "application/json",
    authorization: `Bearer ${capabilityState.accessToken}`,
    ...(requestInput.method === "POST"
      ? { "content-type": "application/json; charset=utf-8" } : {}),
  });
  return state.requestImpl(Object.freeze({
    method: requestInput.method,
    url: requestInput.url,
    headers,
    body: requestInput.body === null ? null : Buffer.from(requestInput.body),
  }));
}

// Query the original Message-ID after a lost send response. A missing match
// never authorizes another POST. The authenticated sent item must bind to the
// original recipient, payload and transaction, not merely share a subject.
async function reconcileSentMessage(state,record,delivery){
  if(!state.readOAuth)return false;
  const query=new URLSearchParams({q:'in:sent rfc822msgid:'+record.messageIdHeader.slice(1,-1),maxResults:'2'});
  const listed=providerBytes(await request(state,state.readOAuth,{method:'GET',url:API_ROOT+'?'+query,body:null},'READ'),'GMAIL_SENT_QUERY');
  if(listed.status!==200)return false;
  const list=parseJson(listed.bytes,'GMAIL_SENT_QUERY_INVALID');
  if(!Array.isArray(list.messages)||list.messages.length!==1||list.nextPageToken)return false;
  const id=list.messages[0].id;if(!GMAIL_ID.test(id??''))return false;
  const found=providerBytes(await request(state,state.readOAuth,{method:'GET',url:API_ROOT+'/'+id+'?format=raw',body:null},'READ'),'GMAIL_SENT_READ');
  if(found.status!==200)return false;
  const message=parseJson(found.bytes,'GMAIL_SENT_READ_INVALID'),raw=decodeRaw(message.raw);
  if(message.id!==id||!GMAIL_ID.test(message.threadId??'')||!message.labelIds?.includes('SENT')||!raw)return false;
  const headers=parseHeaderBlock(raw),one=name=>headers.get(name)?.length===1?headers.get(name)[0]:null;
  if(one('message-id')!==record.messageIdHeader||one('x-outsider-transaction-binding')!==record.transactionBindingHash
    ||one('x-outsider-tender-body-hash')!==delivery.tenderBodyHash||one('subject')!==record.subject
    ||headerAddress(one('from'))?.toLowerCase()!==state.sendOAuth.senderAddress.toLowerCase()
    ||headerAddress(one('to'))?.toLowerCase()!==record.recipient.toLowerCase())return false;
  const text=raw.toString('utf8').replace(/\r\n/gu,'\n'),separator=text.indexOf('\n\n');
  const expected=readableTenderText(delivery.tenderBytes).replace(/\r\n/gu,'\n');
  if(separator<0||text.slice(separator+2)!==(expected.endsWith('\n')?expected:expected+'\n'))return false;
  const completedAt=clockInstant(state,'SEND_RECONCILED_AT');
  await appendJournal(state,'SEND_COMPLETED',completedAt,{transactionBindingHash:record.transactionBindingHash,bindingHash:record.bindingHash,
    completedAt,gmailMessageId:message.id,gmailThreadId:message.threadId,receiptHash:byteHash(found.bytes),receiptBase64:found.bytes.toString('base64'),
    recoveredFromDurableResponseHandle:false,reconciledFromSentMessage:true});
  return true;
}

async function send(state, input, profile) {
  const delivery = normalizeDelivery(input, profile);
  let lock = null;
  let mime = null;
  let requestBody = null;
  try {
    lock = acquireSendLock(state, delivery.transactionBindingHash);
    replayJournal(state);
    const existing = state.sends.get(delivery.transactionBindingHash);
    if (existing !== undefined) {
      if (!sameDelivery(existing, delivery)) fail("TRANSACTION_BINDING_CONFLICT");
      if (existing.status === "DELIVERED") return successfulDelivery(existing);
      if(await reconcileSentMessage(state,existing,delivery))return successfulDelivery(state.sends.get(delivery.transactionBindingHash));
      fail("SEND_ALREADY_ATTEMPTED_NO_RETRY");
    }
    const attemptedAt = clockInstant(state, "SEND_ATTEMPTED_AT");
    assertOAuthCurrent(state.sendOAuth, attemptedAt, "SEND");
    if (Date.parse(attemptedAt) >= Date.parse(delivery.effectDeadline)) {
      fail("EFFECT_DEADLINE_REACHED_BEFORE_SEND");
    }
    const priorIdempotency = state.idempotency.get(delivery.idempotencyKeyHash);
    const priorNonce = state.nonces.get(delivery.oneUseNonceHash);
    if ((priorIdempotency !== undefined
        && priorIdempotency !== delivery.bindingHash)
      || (priorNonce !== undefined && priorNonce !== delivery.bindingHash)) {
      fail("ONE_USE_CONTROL_CONFLICT");
    }
    const parent = delivery.replyToTransactionBindingHash
      ? state.sends.get(delivery.replyToTransactionBindingHash) : null;
    if (delivery.replyToTransactionBindingHash && (!parent || parent.status !== 'DELIVERED'
      || parent.recipient.toLowerCase() !== delivery.recipient.toLowerCase())) fail('REPLY_PARENT_NOT_DELIVERED_TO_RECIPIENT');
    if (parent && delivery.subject !== undefined && delivery.subject !== parent.subject) fail('REPLY_SUBJECT_CHANGED');
    if (parent && delivery.replyToAddress !== undefined && delivery.replyToAddress !== parent.replyToAddress) fail('REPLY_ROUTE_CHANGED');
    mime = buildMime(state.sendOAuth.senderAddress, delivery, attemptedAt, parent);
    requestBody = Buffer.from(JSON.stringify({
      raw: mime.bytes.toString("base64url"),
      ...(parent ? {threadId: parent.gmailThreadId} : {}),
    }), "utf8");
    await appendJournal(state, "SEND_ATTEMPTED", attemptedAt, {
      transactionBindingHash: delivery.transactionBindingHash,
      bindingHash: delivery.bindingHash,
      recipient: delivery.recipient,
      recipientAddressHash: digest(
        "outsider/gmail-account-native-recipient/v1", delivery.recipient),
      messageIdHeader: mime.messageId,
      subject: mime.subject,
      ...(mime.replyToAddress ? { replyToAddress: mime.replyToAddress } : {}),
      attemptedAt,
      idempotencyKeyHash: delivery.idempotencyKeyHash,
      oneUseNonceHash: delivery.oneUseNonceHash,
    });
    let response;
    try {
      response = await request(state, state.sendOAuth, {
      method: "POST", url: `${API_ROOT}/send`, body: requestBody,
      }, "SEND");
    } catch (error) {
      if (error?.outsiderCode !== undefined) throw error;
      fail("GMAIL_SEND_AMBIGUOUS_NO_RETRY");
    }
    const exactResponse = providerBytes(response, "GMAIL_SEND");
    if (exactResponse.status !== 200) {
      fail(exactResponse.status === 429
        ? "GMAIL_SEND_HTTP_429_NO_RETRY"
        : "GMAIL_SEND_HTTP_REJECTED_NO_RETRY");
    }
    const responseFile = await writeResponseHandle(state, delivery, attemptedAt,
      exactResponse);
    const correlation = gmailReceipt(exactResponse.bytes);
    const completedAt = clockInstant(state, "SEND_COMPLETED_AT");
    if (Date.parse(completedAt) < Date.parse(attemptedAt)) {
      fail("SEND_CLOCK_MOVED_BACKWARDS");
    }
    await appendJournal(state, "SEND_COMPLETED", completedAt, {
      transactionBindingHash: delivery.transactionBindingHash,
      bindingHash: delivery.bindingHash,
      completedAt,
      gmailMessageId: correlation.messageId,
      gmailThreadId: correlation.threadId,
      receiptHash: byteHash(exactResponse.bytes),
      receiptBase64: exactResponse.bytes.toString("base64"),
      recoveredFromDurableResponseHandle: false,
    });
    removeResponseHandle(state, responseFile);
    return successfulDelivery(state.sends.get(
      delivery.transactionBindingHash));
  } finally {
    delivery.tenderBytes.fill(0);
    if (mime !== null) mime.bytes.fill(0);
    if (requestBody !== null) requestBody.fill(0);
    releaseSendLock(state, lock);
  }
}

function parseHeaderBlock(bytes) {
  const crlf = bytes.indexOf(Buffer.from("\r\n\r\n", "ascii"));
  const lf = bytes.indexOf(Buffer.from("\n\n", "ascii"));
  const end = crlf >= 0 ? crlf : lf;
  if (end < 1 || end > 256 * 1024) return null;
  const text = bytes.subarray(0, end).toString("latin1");
  const physical = text.split(/\r?\n/u);
  const logical = [];
  for (const line of physical) {
    if (/^[ \t]/u.test(line) && logical.length > 0) {
      logical[logical.length - 1] += ` ${line.trim()}`;
    } else {
      logical.push(line);
    }
  }
  const headers = new Map();
  for (const line of logical) {
    const separator = line.indexOf(":");
    if (separator < 1) return null;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!headers.has(name)) headers.set(name, []);
    headers.get(name).push(value);
  }
  return headers;
}

function referencesMessage(headers, messageId) {
  const values = [
    ...(headers.get("in-reply-to") ?? []),
    ...(headers.get("references") ?? []),
  ];
  return values.some((value) => {
    const tokens = value.match(/<[^<>\r\n]+>/gu) ?? [];
    return tokens.includes(messageId);
  });
}

function addressedTo(headers, address) {
  const expected = address.toLowerCase();
  return ['to', 'cc', 'delivered-to'].some(name => (headers.get(name) ?? []).some(value => {
    const parts = value.match(/<[^<>]+>/gu) ?? value.split(',');
    return parts.some(part => headerAddress(part)?.toLowerCase() === expected);
  }));
}

function decodeRaw(value) {
  if (typeof value !== "string" || value.length < 1
    || value.length > Math.ceil(MAX_RAW_MESSAGE_BYTES * 4 / 3) + 4
    || !/^[A-Za-z0-9_-]+={0,2}$/u.test(value)) return null;
  let bytes;
  try { bytes = Buffer.from(value, "base64url"); } catch { return null; }
  if (bytes.length < 1 || bytes.length > MAX_RAW_MESSAGE_BYTES
    || bytes.toString("base64url") !== value.replace(/=+$/u, "")) return null;
  return bytes;
}

function queryDate(afterTimestamp) {
  const date = new Date(Date.parse(afterTimestamp));
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1)
    .padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`;
}

function responseCensus(sources) {
  let head = digest("outsider/gmail-reply-source-occurrence-genesis/v1", {
    occurrenceCount: 0,
  });
  let total = 0;
  const projection = sources.map((source, index) => {
    const sourceHash = byteHash(source.bytes);
    total += source.bytes.length;
    const body = {
      occurrenceIndex: index,
      sourceKind: source.sourceKind,
      observedAt: source.observedAt,
      sourceByteLength: source.bytes.length,
      sourceHash,
      previousOccurrenceHash: head,
    };
    const occurrenceHash = digest(
      "outsider/gmail-account-native-reply-source-occurrence/v1", body);
    head = occurrenceHash;
    return { ...body, occurrenceHash, rawSourceBytesProjected: false };
  });
  return { projection, occurrenceCount: projection.length,
    exactSourceByteCount: total, lifecycleHeadHash: head };
}

async function observe(state, record, limits) {
  if (state.readOAuth === null) fail("READ_OAUTH_CAPABILITY_REQUIRED");
  if (record.status !== "DELIVERED") fail("DELIVERY_NOT_CONFIRMED");
  const calls = limits.maximumObservationCalls ?? MAX_OBSERVATION_CALLS;
  if (record.observationCalls >= calls) {
    fail("REPLY_OBSERVATION_CALL_LIMIT_REACHED");
  }
  record.observationCalls += 1;
  const sources = [];
  const seenMessageIds = new Set();
  let responseBytes = null;
  const baseQuery = `from:(${record.recipient}) after:${queryDate(record.completedAt)}`;
  const searches = record.replyToAddress
    ? [{ query: `${baseQuery} to:(${record.replyToAddress})`, threadOnly: false },
      { query: baseQuery, threadOnly: true }]
    : [{ query: baseQuery, threadOnly: true }];
  for (const search of searches) {
  const seenPageTokens = new Set();
  let pageToken = null;
  for (let page = 0; page < limits.maximumPages; page += 1) {
    if (record.listRequests >= Math.max(MAX_TOTAL_LIST_REQUESTS, calls * 2)) {
      fail("REPLY_LIST_REQUEST_LIMIT_REACHED");
    }
    const url = new URL(API_ROOT);
    url.searchParams.set("maxResults", String(limits.maximumMessagesPerPage));
    url.searchParams.set("includeSpamTrash", "false");
    url.searchParams.set("q", search.query);
    if (pageToken !== null) url.searchParams.set("pageToken", pageToken);
    record.listRequests += 1;
    let listResponse;
    try {
      listResponse = await request(state, state.readOAuth, {
        method: "GET", url: url.toString(), body: null,
      }, "READ");
    } catch (error) {
      if (error?.outsiderCode !== undefined) throw error;
      fail("GMAIL_REPLY_LIST_UNAVAILABLE");
    }
    const listExact = providerBytes(listResponse, "GMAIL_REPLY_LIST");
    const listObservedAt = clockInstant(state, "REPLY_LIST_OBSERVED_AT");
    sources.push({ sourceKind: "GMAIL_MESSAGES_LIST_RESPONSE",
      observedAt: listObservedAt, bytes: listExact.bytes });
    if (listExact.status !== 200) fail("GMAIL_REPLY_LIST_REJECTED");
    const list = parseJson(listExact.bytes, "GMAIL_REPLY_LIST_JSON_INVALID");
    if (list === null || typeof list !== "object" || Array.isArray(list)
      || (list.messages !== undefined && !Array.isArray(list.messages))
      || (list.nextPageToken !== undefined
        && (typeof list.nextPageToken !== "string"
          || list.nextPageToken.length < 1
          || list.nextPageToken.length > 4096))) {
      fail("GMAIL_REPLY_LIST_INVALID");
    }
    const messages = list.messages ?? [];
    for (const candidate of messages) {
      if (candidate === null || typeof candidate !== "object"
        || typeof candidate.id !== "string" || !GMAIL_ID.test(candidate.id)
        || typeof candidate.threadId !== "string"
        || !GMAIL_ID.test(candidate.threadId)
        || search.threadOnly && candidate.threadId !== record.gmailThreadId
        || candidate.id === record.gmailMessageId
        || seenMessageIds.has(candidate.id)) continue;
      seenMessageIds.add(candidate.id);
      if (record.getRequests >= Math.max(MAX_TOTAL_GET_REQUESTS, calls * 8)
        || limits.maximumGetRequests < 1) break;
      limits.maximumGetRequests -= 1;
      record.getRequests += 1;
      const getUrl = `${API_ROOT}/${encodeURIComponent(candidate.id)
        }?format=raw`;
      let getResponse;
      try {
        getResponse = await request(state, state.readOAuth, {
          method: "GET", url: getUrl, body: null,
        }, "READ");
      } catch (error) {
        if (error?.outsiderCode !== undefined) throw error;
        fail("GMAIL_REPLY_GET_UNAVAILABLE");
      }
      const getExact = providerBytes(getResponse, "GMAIL_REPLY_GET");
      const getObservedAt = clockInstant(state, "REPLY_GET_OBSERVED_AT");
      sources.push({ sourceKind: "GMAIL_MESSAGES_GET_RAW_RESPONSE",
        observedAt: getObservedAt, bytes: getExact.bytes });
      if (getExact.status !== 200) continue;
      const message = parseJson(getExact.bytes, "GMAIL_REPLY_GET_JSON_INVALID");
      if (message === null || typeof message !== "object"
        || message.id !== candidate.id
        || message.threadId !== candidate.threadId
        || typeof message.internalDate !== "string"
        || !/^\d{1,17}$/u.test(message.internalDate)
        || Number(message.internalDate) <= Date.parse(record.completedAt)) {
        continue;
      }
      const raw = decodeRaw(message.raw);
      if (raw === null) continue;
      if (limits.excludedResponseHashes?.includes(byteHash(raw))) continue;
      const headers = parseHeaderBlock(raw);
      const fromValues = headers?.get("from") ?? [];
      if (headers === null || fromValues.length !== 1
        || headerAddress(fromValues[0])?.toLowerCase()
          !== record.recipient.toLowerCase()
        || !(message.threadId === record.gmailThreadId && referencesMessage(headers, record.messageIdHeader)
          || record.replyToAddress && addressedTo(headers, record.replyToAddress))) continue;
      responseBytes = raw;
      sources.push({ sourceKind: "RFC5322_COUNTERPARTY_RESPONSE",
        observedAt: getObservedAt, bytes: Buffer.from(raw) });
      break;
    }
    if (responseBytes !== null || list.nextPageToken === undefined) break;
    if (seenPageTokens.has(list.nextPageToken)) {
      fail("GMAIL_REPLY_PAGE_TOKEN_LOOP");
    }
    seenPageTokens.add(list.nextPageToken);
    pageToken = list.nextPageToken;
  }
  if (responseBytes !== null) break;
  }
  return { sources, responseBytes,
    observedAt: clockInstant(state, "REPLY_OBSERVATION_COMPLETED_AT") };
}

async function observationResult(state, record, observed) {
  const census = responseCensus(observed.sources);
  const responseObserved = observed.responseBytes !== null;
  await appendJournal(state, "REPLY_OBSERVATION_RECORDED", observed.observedAt, {
    transactionBindingHash: record.transactionBindingHash,
    observationCallCount: record.observationCalls,
    cumulativeListRequestCount: record.listRequests,
    cumulativeGetRequestCount: record.getRequests,
    sourceOccurrenceCount: census.occurrenceCount,
    sourceOccurrences: observed.sources.map((source) => ({
      sourceKind: source.sourceKind,
      observedAt: source.observedAt,
      sourceHash: byteHash(source.bytes),
      bytesBase64: source.bytes.toString("base64"),
    })),
    responseHash: responseObserved ? byteHash(observed.responseBytes) : null,
    responseBase64: responseObserved
      ? observed.responseBytes.toString("base64") : null,
  });
  const body = {
    schema:
      OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_SCHEMAS
        .replyObservation,
    schemaVersion: "1.0.0",
    transportBindingHash: state.transportBindingHash,
    transactionBindingHash: record.transactionBindingHash,
    recipientAddressHash: record.recipientAddressHash,
    gmailThreadRefHash: digest(
      "outsider/gmail-account-native-thread-ref/v1", record.gmailThreadId),
    outboundRfc5322MessageIdHash: digest(
      "outsider/gmail-account-native-message-id/v1", record.messageIdHeader),
    afterTimestamp: record.completedAt,
    observedAt: observed.observedAt,
    state: responseObserved ? "COUNTERPARTY_RESPONSE_OBSERVED" : "PENDING",
    observationCallCount: record.observationCalls,
    cumulativeListRequestCount: record.listRequests,
    cumulativeGetRequestCount: record.getRequests,
    sourceOccurrenceCount: census.occurrenceCount,
    exactSourceByteCount: census.exactSourceByteCount,
    sourceLifecycleHeadHash: census.lifecycleHeadHash,
    sourceOccurrences: census.projection,
    counterpartyResponseObserved: responseObserved,
    rawSourceBytesProjected: false,
    counterpartyResponseIsAcceptance: false,
    counterpartyResponseCreatesCapacity: false,
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    outcomeEstablished: false,
    paymentPerformed: false,
    humanQueueCreated: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  const publicProjection = Object.freeze({ ...body,
    observationHash: digest(body.schema, body),
    boundary: OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_BOUNDARY });
  const result = Object.freeze({ publicProjection });
  OBSERVATION_STATES.set(result, { consumed: false,
    transactionBindingHash: record.transactionBindingHash,
    responseBytes: observed.responseBytes === null ? null
      : Buffer.from(observed.responseBytes),
    sources: observed.sources.map((source) => ({ ...source,
      bytes: Buffer.from(source.bytes) })),
  });
  return result;
}

/**
 * Create an account-native Gmail edge. `readOAuthCapability` may be null;
 * send-only operation is complete and does not require mailbox read access.
 */
export function createGmailAccountNativeMailboxTransportV1(input = {}) {
  exact(input, ["sendOAuthCapability", "readOAuthCapability", "requestImpl",
    "clock", "directory", "journalId",...(input.ledger!==undefined?["ledger","recordPrefix"]:[])], "INPUT_INVALID");
  if(input.ledger&&(!input.recordPrefix||path.isAbsolute(input.recordPrefix)||input.recordPrefix.split("/").some(p=>!p||p==="..")))fail("LEDGER_PREFIX_INVALID");
  const sendOAuth = oauthState(input.sendOAuthCapability, "SEND");
  const readOAuth = input.readOAuthCapability === null ? null
    : oauthState(input.readOAuthCapability, "READ");
  if (readOAuth !== null
    && (readOAuth.accountRefHash !== sendOAuth.accountRefHash
      || readOAuth.senderAddress.toLowerCase()
        !== sendOAuth.senderAddress.toLowerCase())) {
    fail("SEND_READ_ACCOUNT_BINDING_MISMATCH");
  }
  if (typeof input.requestImpl !== "function" || typeof input.clock !== "function") {
    fail("DEPENDENCY_INVALID");
  }
  if (typeof input.directory !== "string" || input.directory.length < 1
    || typeof input.journalId !== "string" || !JOURNAL_ID.test(input.journalId)) {
    fail("JOURNAL_CONFIG_INVALID");
  }
  const directory = path.resolve(input.directory);
  const journalRootRefHash = digest(
    "outsider/gmail-account-native-journal-root/v1", directory);
  const bindingBody = {
    schema:
      OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_SCHEMAS.transport,
    schemaVersion: "1.0.0",
    transportFamily: "PERMISSIONED_MAILBOX",
    providerInterface: "GMAIL_API_V1",
    accountRefHash: sendOAuth.accountRefHash,
    senderAddressHash: input.sendOAuthCapability.senderAddressHash,
    sendCapabilityHash: input.sendOAuthCapability.capabilityHash,
    readCapabilityHash: input.readOAuthCapability?.capabilityHash ?? null,
    journalId: input.journalId,
    journalRootRefHash,
    sourcePinSetHash: OUTSIDER_GMAIL_OFFICIAL_SOURCE_PINS_V1.sourcePinSetHash,
    deliverExactClosureSupported: true,
    permissionedMailboxSendExactClosureSupported: true,
    permissionedMailboxReceiveExactClosureSupported: true,
    replyObservationEnabled: readOAuth !== null,
    rawCredentialProjected: false,
    rawJournalPathProjected: false,
    durableSendAttemptBeforePost: true,
    coldRestartNeverResends: true,
    deliveryReceiptIsAcceptance: false,
    counterpartyResponseCreatesCapacity: false,
    paymentPerformed: false,
  };
  const journalDirectories = prepareJournalDirectory(directory);
  const state = {
    ledger:input.ledger,recordPrefix:input.recordPrefix,
    sendOAuth, readOAuth, requestImpl: input.requestImpl, clock: input.clock,
    directory,
    journalId: input.journalId,
    journalPath: path.join(directory, `${input.journalId}.events.jsonl`),
    lockDirectory: journalDirectories.locks,
    responseDirectory: journalDirectories.responses,
    events: [],
    sends: new Map(), idempotency: new Map(), nonces: new Map(),
    transportBindingHash: digest(bindingBody.schema, bindingBody),
  };
  replayJournal(state);
  const serialized=action=>async value=>{
    const key=state.ledger?state.directory+'/'+state.journalId:state;
    const previous=ledgerMailboxQueues.get(key)??Promise.resolve();
    const current=previous.catch(()=>{}).then(async()=>{replayJournal(state);await recoverResponseHandles(state);return action(value);});
    ledgerMailboxQueues.set(key,current);
    try{return await current;}finally{if(ledgerMailboxQueues.get(key)===current)ledgerMailboxQueues.delete(key);}
  };

  async function deliverExact(delivery) {
    return send(state, delivery, "DELIVER_EXACT");
  }

  async function sendExact(delivery) {
    const result = await send(state, delivery, "SEND_EXACT");
    return { status: "SENT",
      acknowledgementBytes: Buffer.from(result.deliveryReceiptBytes) };
  }

  async function observeReplyExact(input = {}) {
    exact(input, ["transactionBindingHash", "recipient", "afterTimestamp",
      "maximumPages", "maximumMessagesPerPage", "maximumGetRequests"],
    "REPLY_OBSERVATION_INPUT_INVALID");
    const transactionBindingHash = hash(input.transactionBindingHash,
      "TRANSACTION_BINDING_HASH_INVALID");
    const record = state.sends.get(transactionBindingHash);
    if (record === undefined || record.status !== "DELIVERED") {
      fail("DELIVERY_BINDING_NOT_FOUND");
    }
    if (canonicalAddress(input.recipient, "EXACT_ONE_RECIPIENT_REQUIRED")
        .toLowerCase() !== record.recipient.toLowerCase()
      || instant(input.afterTimestamp, "AFTER_TIMESTAMP_INVALID")
        !== record.completedAt) fail("REPLY_OBSERVATION_BINDING_MISMATCH");
    const limits = {
      maximumPages: boundedInteger(input.maximumPages, 1, 5,
        "MAXIMUM_PAGES_INVALID"),
      maximumMessagesPerPage: boundedInteger(input.maximumMessagesPerPage,
        1, 100, "MAXIMUM_MESSAGES_PER_PAGE_INVALID"),
      maximumGetRequests: boundedInteger(input.maximumGetRequests, 1, 32,
        "MAXIMUM_GET_REQUESTS_INVALID"),
    };
    return observationResult(state, record, await observe(state, record,
      limits));
  }

  async function receiveExact(input = {}) {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      fail("RECEIVE_EXACT_INPUT_INVALID");
    }
    const transactionBindingHash = hash(input.transactionBindingHash,
      "TRANSACTION_BINDING_HASH_INVALID");
    const record = state.sends.get(transactionBindingHash);
    if (record === undefined || record.status !== "DELIVERED") {
      fail("DELIVERY_BINDING_NOT_FOUND");
    }
    if (canonicalAddress(input.recipient, "EXACT_ONE_RECIPIENT_REQUIRED")
        .toLowerCase() !== record.recipient.toLowerCase()) {
      fail("REPLY_OBSERVATION_BINDING_MISMATCH");
    }
    if (state.readOAuth === null) {
      return { status: "PENDING", retryAfter: null,
        reason: "READ_CAPABILITY_NOT_GRANTED" };
    }
    const maximumObservationCalls = input.maximumObservationCalls === undefined ? MAX_OBSERVATION_CALLS
      : boundedInteger(input.maximumObservationCalls, 1, 512, 'MAXIMUM_OBSERVATIONS_INVALID');
    const excludedResponseHashes = input.excludedResponseHashes ?? [];
    if (!Array.isArray(excludedResponseHashes) || excludedResponseHashes.length > 64
      || excludedResponseHashes.some(value => !HASH.test(value ?? ''))) fail('EXCLUDED_RESPONSES_INVALID');
    const observed = await observe(state, record, {
      maximumPages: 2, maximumMessagesPerPage: 25,
      maximumGetRequests: 16,
      maximumObservationCalls, excludedResponseHashes,
    });
    await observationResult(state, record, observed);
    return observed.responseBytes === null
      ? { status: "PENDING", retryAfter: null }
      : { status: "RESPONSE",
        responseBytes: Buffer.from(observed.responseBytes) };
  }

  const transport = Object.freeze({
    ...bindingBody,
    transportBindingHash: state.transportBindingHash,
    boundary: OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_BOUNDARY,
    deliverExact:serialized(deliverExact),
    sendExact:serialized(sendExact),
    receiveExact:serialized(receiveExact),
    observeReplyExact:serialized(observeReplyExact),
  });
  TRANSPORT_STATES.set(transport, state);
  return transport;
}

/** Privacy-closed inspection; no access token or raw address is returned. */
export function inspectGmailAccountNativeMailboxTransportV1(transport) {
  if (!TRANSPORT_STATES.has(transport)) fail("TRANSPORT_NOT_FACTORY_ISSUED");
  return transport;
}

/** Claim the exact list/get/raw reply source occurrences once. */
export function claimGmailReplyObservationSourcesV1(result) {
  const state = OBSERVATION_STATES.get(result);
  if (state === undefined || state.consumed) {
    fail("REPLY_OBSERVATION_RESULT_INVALID_OR_REPLAYED");
  }
  state.consumed = true;
  return Object.freeze({
    schema:
      OUTSIDER_GMAIL_ACCOUNT_NATIVE_MAILBOX_TRANSPORT_V1_SCHEMAS
        .privateReplySources,
    schemaVersion: "1.0.0",
    transactionBindingHash: state.transactionBindingHash,
    sourceOccurrences: state.sources.map((source, occurrenceIndex) => ({
      occurrenceIndex,
      sourceKind: source.sourceKind,
      observedAt: source.observedAt,
      bytes: Buffer.from(source.bytes),
    })),
    responseBytes: state.responseBytes === null ? null
      : Buffer.from(state.responseBytes),
    interpretationPerformed: false,
    counterpartyResponseIsAcceptance: false,
    counterpartyResponseCreatesCapacity: false,
  });
}
