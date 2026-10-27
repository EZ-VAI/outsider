/*
 * One-transfer PayPal Payouts sandbox transport. No live endpoint, credential
 * storage, insurance admission or actual compensation decision exists here.
 * Immutable operation + exact payload precede POST; append-only observations
 * retain raw private response bytes. A missing response stays ambiguous.
 */
import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { withUserHeldExecutionLockV2 } from "./outsider-user-held-durable-execution-v2.js";

const ORIGIN = "https://api-m.sandbox.paypal.com";
const SCHEMA = "outsider/paypal-payout-sandbox/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9_-]{1,32}$/u;
const OP = /^paypal-sandbox-[a-f0-9]{40}$/u;
const WINDOW_MS = 30 * 86400_000;
const MAX_BYTES = 1024 * 1024;
export const PAYPAL_PAYOUT_SANDBOX_PROTOCOL = Object.freeze({
  environment: "SANDBOX", origin: ORIGIN, idempotencyWindowDays: 30,
  scope: "https://uri.paypal.com/payments/payouts",
  sources: Object.freeze([
    "https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-post/",
    "https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-get/",
    "https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-item-get/",
    "https://developer.paypal.com/api/payouts/standard/customize",
    "https://developer.paypal.com/api/payouts/standard/test-go-live/",
  ]),
});
function fail(code) {
  const error = new TypeError(`OUTSIDER_PAYPAL_SANDBOX_${code}`);
  error.code = code;
  throw error;
}
function hash(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function digest(value) { return hash(canonicalizeStrict(value)); }
function instant(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail("TIME_INVALID");
  return value;
}
function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    fail("PRIVATE_DIRECTORY_REQUIRED");
  }
}
function readPrivate(file) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0
    || stat.size > MAX_BYTES) fail("PRIVATE_FILE_REQUIRED");
  return readFileSync(file);
}
function writeOnce(file, bytes) {
  const fd = openSync(file, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  const directory = openSync(path.dirname(file), "r");
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
function decimal(minorUnits) {
  if (typeof minorUnits !== "string" || !/^[1-9][0-9]{0,8}$/u.test(minorUnits)) {
    fail("POSITIVE_BOUNDED_USD_MINOR_REQUIRED");
  }
  const amount = BigInt(minorUnits);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}
function responseMinor(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/u.test(value)) {
    fail("PROVIDER_AMOUNT_FORMAT_UNSUPPORTED");
  }
  const [whole, fraction = ""] = value.split(".");
  return String(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
}
function binding(input) {
  canonicalizeStrict(input);
  const { sandboxTransfer: transfer, testRecipient: recipient, sandboxAcceptance: acceptance } = input;
  if (!transfer || !HASH.test(transfer.idempotencyKey) || !HASH.test(transfer.termRefHash)
    || transfer.status !== "SIMULATED_NOT_SUBMITTED" || transfer.submitted !== false
    || transfer.moneyMoved !== false || transfer.paymentAuthorized !== false
    || transfer.amount?.currency !== "USD") fail("SANDBOX_TRANSFER_REQUIRED");
  decimal(transfer.amount.minorUnits);
  if (recipient?.recipientType !== "EMAIL" || recipient.isSandboxAccount !== true
    || !HASH.test(recipient.testAccountRefHash) || typeof recipient.receiver !== "string"
    || recipient.receiver.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipient.receiver)) {
    fail("EXPLICIT_SANDBOX_RECIPIENT_REQUIRED");
  }
  if (acceptance?.environment !== "SANDBOX" || acceptance.scope !== "PAYOUTS_TEST_ONLY"
    || acceptance.accepted !== true || !HASH.test(acceptance.acceptanceRefHash)) {
    fail("SANDBOX_SCOPE_ACCEPTANCE_REQUIRED");
  }
  return {
    transferKey: transfer.idempotencyKey, termRefHash: transfer.termRefHash,
    amount: { currency: "USD", minorUnits: transfer.amount.minorUnits },
    recipient: { recipientType: "EMAIL", receiver: recipient.receiver,
      isSandboxAccount: true, testAccountRefHash: recipient.testAccountRefHash },
    acceptance: { environment: "SANDBOX", scope: "PAYOUTS_TEST_ONLY", accepted: true,
      acceptanceRefHash: acceptance.acceptanceRefHash },
  };
}

/** Injecting fetch always marks replies PROVIDER_FIXTURE, never external proof.
 * getAccessToken is optional for offline prepare/inspect, required for HTTP.
 * There are no timer retries or polling loops; each method does bounded work.
 */
export function createPayPalPayoutSandboxAdapter(config = {}) {
  if (typeof config.directory !== "string" || !path.isAbsolute(config.directory)
    || ["baseUrl", "baseURL", "origin", "environment"].some((key) => Object.hasOwn(config, key))) {
    fail("CONFIG_INVALID_OR_ENDPOINT_OVERRIDE");
  }
  const configuredRoot = path.resolve(config.directory);
  ensureDirectory(configuredRoot);
  const root = realpathSync(configuredRoot);
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const sourceKind = config.fetchImpl ? "PROVIDER_FIXTURE" : "PAYPAL_SANDBOX_API";
  if (config.sourceKind !== undefined && config.sourceKind !== sourceKind) fail("SOURCE_KIND_MISMATCH");
  const clock = config.clock ?? (() => new Date().toISOString());
  const timeoutMs = config.timeoutMs ?? 15000;
  if (typeof fetchImpl !== "function" || typeof clock !== "function"
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) fail("CONFIG_INVALID");
  const now = () => instant(clock());
  function location(operationId) {
    if (typeof operationId !== "string" || !OP.test(operationId)) fail("OPERATION_ID_INVALID");
    return path.join(root, operationId);
  }
  function load(operationId) {
    const directory = location(operationId);
    ensureDirectory(directory);
    const operation = JSON.parse(readPrivate(path.join(directory, "operation.json")));
    const { operationHash, ...body } = operation;
    if (operation.operationId !== operationId || operation.sourceKind !== sourceKind
      || digest(body) !== operationHash || hash(operation.payloadBytes) !== operation.payloadHash) {
      fail("OPERATION_BINDING_MISMATCH");
    }
    const files = readdirSync(directory).filter((name) => /^event-[0-9]{8}\.json$/u.test(name)).sort();
    const events = [];
    let previousHash = operationHash;
    for (const [index, name] of files.entries()) {
      const event = JSON.parse(readPrivate(path.join(directory, name)));
      const { eventHash, ...eventBody } = event;
      if (event.sequence !== index + 1 || event.operationId !== operationId
        || event.previousHash !== previousHash || digest(eventBody) !== eventHash) fail("HISTORY_MISMATCH");
      if (event.source) {
        if (!/^source-[a-f0-9-]{36}\.bin$/u.test(event.source.file)) fail("SOURCE_PATH_INVALID");
        const bytes = readPrivate(path.join(directory, event.source.file));
        if (bytes.length !== event.source.bytes || hash(bytes) !== event.source.hash) fail("SOURCE_REPLAY_MISMATCH");
      }
      events.push(event);
      previousHash = eventHash;
    }
    return { directory, operation, events, previousHash };
  }
  function append(state, values) {
    const body = { schema: SCHEMA, operationId: state.operation.operationId,
      sequence: state.events.length + 1, previousHash: state.previousHash, at: now(), ...values };
    const event = { ...body, eventHash: digest(body) };
    // Numbered exclusive files preserve append-only history. Whole HTTP
    // operations are separately serialized by the same-host execution lock.
    writeOnce(path.join(state.directory, `event-${String(body.sequence).padStart(8, "0")}.json`),
      canonicalizeStrict(event));
    return load(state.operation.operationId);
  }
  function projection(state) {
    const { operation, events } = state;
    const last = events.at(-1);
    const batchEvent = [...events].reverse().find((event) => event.batchId);
    const itemEvent = [...events].reverse().find((event) => event.itemId);
    const dispatch = events.find((event) => event.kind === "POST_STARTED");
    // Read the provider's bounded issue code from the already source-replayed
    // last response. Keep recipient-bearing descriptions private.
    let providerErrorCode = null;
    if (last?.source) {
      try {
        const value = JSON.parse(readPrivate(path.join(state.directory, last.source.file)));
        const code = value.errors?.name;
        if (typeof code === "string" && /^[A-Z][A-Z0-9_]{0,95}$/u.test(code)) providerErrorCode = code;
      } catch { /* Source bytes are still retained even when not JSON. */ }
    }
    return {
      schema: SCHEMA, environment: "SANDBOX", sourceKind,
      operationId: operation.operationId, operationHash: operation.operationHash,
      status: last?.status ?? "PREPARED", amount: operation.binding.amount,
      transferIdempotencyKey: operation.binding.transferKey,
      senderBatchId: operation.senderBatchId, senderItemId: operation.senderItemId,
      payoutBatchId: batchEvent?.batchId ?? null, payoutItemId: itemEvent?.itemId ?? null,
      providerItemStatus: last?.providerItemStatus ?? null,
      providerErrorCode,
      reason: last?.reason ?? null, eventCount: events.length, journalHeadHash: state.previousHash,
      requestPayloadHash: operation.payloadHash,
      firstSubmissionAt: dispatch?.at ?? null,
      retryBefore: dispatch ? new Date(Date.parse(dispatch.at) + WINDOW_MS).toISOString() : null,
      sandboxSubmissionAttempted: Boolean(dispatch),
      externalSandboxReceiptObserved: sourceKind === "PAYPAL_SANDBOX_API" && events.some((event) => event.source),
      actualCompensationDue: null, actualMoneyMoved: false, paymentAuthorized: false,
      guaranteeCreated: false, independentOutcomeVerified: false,
      sources: events.filter((event) => event.source).map((event) => event.source),
    };
  }
  function prepare(input) {
    const bound = binding(input);
    const key = digest({ schema: SCHEMA, transferKey: bound.transferKey }).slice(7);
    const operationId = `paypal-sandbox-${key.slice(0, 40)}`;
    const directory = location(operationId);
    ensureDirectory(directory);
    const file = path.join(directory, "operation.json");
    if (existsSync(file)) {
      const existing = load(operationId);
      if (digest(existing.operation.binding) !== digest(bound)) fail("TRANSFER_BINDING_CHANGED");
      return projection(existing);
    }
    const senderBatchId = `osb-${key.slice(0, 26)}`;
    const senderItemId = `osi-${key.slice(0, 26)}`;
    const payloadBytes = canonicalizeStrict({
      sender_batch_header: { sender_batch_id: senderBatchId,
        email_subject: "Outsider sandbox payout rehearsal" },
      items: [{ recipient_type: "EMAIL", receiver: bound.recipient.receiver,
        sender_item_id: senderItemId, recipient_wallet: "PAYPAL",
        amount: { currency: "USD", value: decimal(bound.amount.minorUnits) } }],
    });
    const body = { schema: SCHEMA, environment: "SANDBOX", operationId, sourceKind,
      createdAt: now(), binding: bound, senderBatchId, senderItemId,
      payloadBytes, payloadHash: hash(payloadBytes) };
    writeOnce(file, canonicalizeStrict({ ...body, operationHash: digest(body) }));
    return projection(load(operationId));
  }
  async function request(state, method, pathname) {
    if (typeof config.getAccessToken !== "function") fail("TOKEN_PROVIDER_NOT_CONFIGURED");
    let token;
    try { token = await config.getAccessToken({ environment: "SANDBOX",
      scope: PAYPAL_PAYOUT_SANDBOX_PROTOCOL.scope }); } catch { fail("TOKEN_PROVIDER_FAILED"); }
    if (typeof token !== "string" || !token || /\s/u.test(token)) fail("TOKEN_INVALID");
    if (method === "POST") {
      // Authentication can take time; recheck immediately before durable dispatch.
      const first = state.events.find((event) => event.kind === "POST_STARTED");
      const dispatchAt = Date.parse(now());
      if (first && (dispatchAt < Date.parse(first.at)
        || dispatchAt >= Date.parse(first.at) + WINDOW_MS)) fail("IDEMPOTENCY_WINDOW_EXPIRED_OR_CLOCK_ROLLBACK");
      state = append(state, { kind: "POST_STARTED",
        status: "PROVIDER_TEST_SUBMISSION_UNKNOWN", source: null });
    }
    let response; let bytes;
    try {
      response = await fetchImpl(`${ORIGIN}${pathname}`, {
        method, redirect: "error", signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
          ...(method === "POST" ? { "PayPal-Request-Id": state.operation.senderBatchId } : {}) },
        ...(method === "POST" ? { body: state.operation.payloadBytes } : {}),
      });
      const chunks = []; let size = 0;
      for await (const chunk of response.body ?? []) {
        size += chunk.length;
        if (size > MAX_BYTES) fail("RESPONSE_TOO_LARGE");
        chunks.push(Buffer.from(chunk));
      }
      bytes = Buffer.concat(chunks);
    } catch {
      return { state: append(state, { kind: "TRANSPORT_UNKNOWN",
        status: method === "POST" ? "PROVIDER_TEST_SUBMISSION_UNKNOWN" : "PROVIDER_TEST_RECONCILIATION_REQUIRED",
        reason: "NO_COMPLETE_PROVIDER_RESPONSE", source: null }), response: null, json: null, source: null };
    }
    const file = `source-${randomUUID()}.bin`;
    writeOnce(path.join(state.directory, file), bytes);
    const source = { file, bytes: bytes.length, hash: hash(bytes), sourceKind,
      method, url: `${ORIGIN}${pathname}`, httpStatus: response.status };
    let json = null;
    try { json = JSON.parse(bytes.toString("utf8")); } catch { /* preserve undecodable source */ }
    return { state, response, json, source };
  }
  function observe(result, values) {
    return append(result.state, { kind: "PROVIDER_RESPONSE", source: result.source, ...values });
  }
  function bindBatch(json, state, expectedBatchId = null) {
    const header = json?.batch_header;
    if (!ID.test(header?.payout_batch_id ?? "")
      || header.sender_batch_header?.sender_batch_id !== state.operation.senderBatchId
      || (expectedBatchId && header.payout_batch_id !== expectedBatchId)) fail("PROVIDER_BATCH_BINDING_MISMATCH");
    return header;
  }
  function bindItem(item, state, batchId, expectedItemId = null) {
    const payload = item?.payout_item;
    const expected = state.operation.binding;
    if (!ID.test(item?.payout_item_id ?? "") || item.payout_batch_id !== batchId
      || (expectedItemId && item.payout_item_id !== expectedItemId)
      || (item.sender_batch_id !== undefined && item.sender_batch_id !== state.operation.senderBatchId)
      || payload?.sender_item_id !== state.operation.senderItemId
      || payload.recipient_type !== "EMAIL" || payload.receiver !== expected.recipient.receiver
      || (payload.recipient_wallet !== undefined && payload.recipient_wallet !== "PAYPAL")
      || payload.amount?.currency !== "USD"
      || responseMinor(payload.amount.value) !== expected.amount.minorUnits
      || item.currency_conversion) fail("PROVIDER_ITEM_BINDING_MISMATCH");
    return item;
  }
  function itemStatus(status) {
    if (status === "SUCCESS") return "PROVIDER_TEST_COMPLETED";
    if (["PENDING", "UNCLAIMED", "ONHOLD"].includes(status)) return "PROVIDER_TEST_PENDING";
    if (["FAILED", "RETURNED", "REFUNDED", "BLOCKED", "DENIED"].includes(status)) return "PROVIDER_TEST_FAILED";
    return "PROVIDER_TEST_UNSUPPORTED";
  }
  async function submitInternal(operationId) {
    let state = load(operationId);
    const current = projection(state);
    if (current.payoutBatchId) return reconcileInternal(operationId);
    if (current.status === "PROVIDER_TEST_FAILED") return current;
    if (current.firstSubmissionAt && (Date.parse(now()) < Date.parse(current.firstSubmissionAt)
      || Date.parse(now()) >= Date.parse(current.retryBefore))) fail("IDEMPOTENCY_WINDOW_EXPIRED_OR_CLOCK_ROLLBACK");
    const result = await request(state, "POST", "/v1/payments/payouts");
    if (!result.response) return projection(result.state);
    if (result.response.status === 201) {
      try {
        const header = bindBatch(result.json, result.state);
        state = observe(result, { status: header.batch_status === "DENIED"
          ? "PROVIDER_TEST_FAILED" : "PROVIDER_TEST_ACCEPTED", batchId: header.payout_batch_id,
        reason: "BATCH_RECEIPT_IS_NOT_ITEM_SUCCESS" });
      } catch (error) {
        state = observe(result, { status: "PROVIDER_TEST_SUBMISSION_UNKNOWN", reason: error.code ?? "RECEIPT_UNSUPPORTED" });
      }
    } else {
      // Duplicate errors may identify the original batch, but never complete it.
      const duplicate = result.json?.name === "DUPLICATE_BATCH_ID"
        || result.json?.details?.some((detail) => detail.issue === "DUPLICATE_BATCH_ID");
      const links = duplicate && Array.isArray(result.json.links) ? result.json.links : [];
      const matches = links.filter((link) => link.method === "GET" && typeof link.href === "string"
        && /^https:\/\/api-m\.sandbox\.paypal\.com\/v1\/payments\/payouts\/[A-Za-z0-9_-]{1,32}$/u.test(link.href));
      if (matches.length === 1) {
        state = observe(result, { status: "PROVIDER_TEST_RECONCILIATION_REQUIRED",
          batchId: matches[0].href.split("/").at(-1), reason: "DUPLICATE_BATCH_REQUIRES_BOUND_QUERY" });
      } else {
        state = observe(result, { status: "PROVIDER_TEST_SUBMISSION_UNKNOWN",
          reason: `HTTP_${result.response.status}_REQUIRES_SAME_OPERATION_RECONCILIATION` });
      }
    }
    return projection(state);
  }
  async function reconcileInternal(operationId) {
    let state = load(operationId);
    const current = projection(state);
    if (!current.payoutBatchId) return current;
    const result = await request(state, "GET", `/v1/payments/payouts/${current.payoutBatchId}?page_size=2&total_required=true`);
    if (!result.response) return projection(result.state);
    try {
      if (result.response.status !== 200) fail("BATCH_QUERY_NOT_200");
      const header = bindBatch(result.json, result.state, current.payoutBatchId);
      if (header.batch_status === "DENIED") {
        return projection(observe(result, { status: "PROVIDER_TEST_FAILED", batchId: current.payoutBatchId,
          reason: "PROVIDER_BATCH_DENIED" }));
      }
      const items = result.json.items;
      if (!Array.isArray(items) || items.length !== 1
        || (result.json.total_items !== undefined && result.json.total_items !== 1)
        || (result.json.total_pages !== undefined && result.json.total_pages !== 1)) fail("SINGLE_ITEM_QUERY_REQUIRED");
      const item = bindItem(items[0], result.state, current.payoutBatchId, current.payoutItemId);
      state = observe(result, { status: "PROVIDER_TEST_PENDING", batchId: current.payoutBatchId,
        itemId: item.payout_item_id, reason: "AWAITING_ITEM_DETAIL_QUERY" });
    } catch (error) {
      return projection(observe(result, { status: "PROVIDER_TEST_RECONCILIATION_REQUIRED",
        reason: error.code ?? "PROVIDER_BATCH_UNSUPPORTED" }));
    }
    const itemId = projection(state).payoutItemId;
    const detail = await request(state, "GET", `/v1/payments/payouts-item/${itemId}`);
    if (!detail.response) return projection(detail.state);
    try {
      if (detail.response.status !== 200) fail("ITEM_QUERY_NOT_200");
      const item = bindItem(detail.json, detail.state, current.payoutBatchId, itemId);
      state = observe(detail, { status: itemStatus(item.transaction_status),
        batchId: current.payoutBatchId, itemId, providerItemStatus: item.transaction_status,
        reason: "BOUND_SANDBOX_ITEM_OBSERVATION_ONLY" });
    } catch (error) {
      state = observe(detail, { status: "PROVIDER_TEST_RECONCILIATION_REQUIRED",
        reason: error.code ?? "PROVIDER_ITEM_UNSUPPORTED" });
    }
    return projection(state);
  }
  function locked(operationId, operation) {
    location(operationId);
    // Reuse the kernel-held host lock, released on process death. This does
    // not claim cross-host/shared-filesystem serialization.
    return withUserHeldExecutionLockV2(digest({ kind: SCHEMA, root, operationId }), operation);
  }
  return Object.freeze({ prepare,
    submit: (id) => locked(id, () => submitInternal(id)),
    reconcile: (id) => locked(id, () => reconcileInternal(id)),
    inspect: (id) => projection(load(id)),
  });
}
