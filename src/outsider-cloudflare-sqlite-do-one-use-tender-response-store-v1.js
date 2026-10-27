/*
 * Cloudflare SQLite Durable Object store for one-use tender response links.
 *
 * This is deliberately not a Workers KV adapter. One Durable Object instance
 * owns one response link and uses one synchronous SQLite transaction for each
 * compare-and-append. That transaction is the consume-once decision. Any KV
 * publication may happen later as a non-authoritative receipt/head copy, but
 * can never decide whether a response won.
 */

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_CLOUDFLARE_SQLITE_DO_ONE_USE_TENDER_RESPONSE_STORE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;

export const OUTSIDER_CLOUDFLARE_SQLITE_DO_ONE_USE_TENDER_RESPONSE_STORE_V1_BOUNDARY
  = Object.freeze({
    cloudflarePrimitive: "SQLITE_DURABLE_OBJECT",
    oneDurableObjectPerTokenHashRequired: true,
    compareAndAppendIsOneSynchronousTransaction: true,
    workersKvUsedForConsumeOnce: false,
    eventuallyConsistentStoreUsedForConsumeOnce: false,
    maximumEventsPerLink: 2,
    rawTokenStored: false,
    rawResponseStoredInPrivateDurableObject: true,
    publicResponseProjectionStored: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) fail(code);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function one(sql, statement, ...bindings) {
  return sql.exec(statement, ...bindings).toArray()[0] ?? null;
}

function parseStoredJson(text, code) {
  if (typeof text !== "string") fail(code);
  let value;
  try { value = JSON.parse(text); } catch { fail(code); }
  if (canonicalizeStrict(value) !== text) fail(code);
  return value;
}

/**
 * The supplied object must be a SQLite-backed DurableObjectStorage. Its `sql`
 * cursor and `transactionSync` method are intentionally captured once.
 */
export function createCloudflareSqliteDurableObjectOneUseTenderResponseStoreV1(
  input = {}) {
  exact(input, ["storage"], "INPUT_INVALID");
  const storage = input.storage;
  if (storage === null || typeof storage !== "object"
    || typeof storage.transactionSync !== "function"
    || storage.sql === null || typeof storage.sql !== "object"
    || typeof storage.sql.exec !== "function") fail("STORAGE_INVALID");
  const sql = storage.sql;

  sql.exec(`CREATE TABLE IF NOT EXISTS outsider_response_link_definition_v1 (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    token_hash TEXT NOT NULL UNIQUE,
    definition_hash TEXT NOT NULL UNIQUE,
    definition_json TEXT NOT NULL
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS outsider_response_link_events_v1 (
    ordinal INTEGER PRIMARY KEY CHECK (ordinal IN (1, 2)),
    token_hash TEXT NOT NULL,
    event_hash TEXT NOT NULL UNIQUE,
    previous_event_hash TEXT,
    event_json TEXT NOT NULL
  )`);

  function readDefinition() {
    const row = one(sql, `SELECT token_hash, definition_hash, definition_json
      FROM outsider_response_link_definition_v1 WHERE singleton = 1`);
    if (row === null) return null;
    const definition = parseStoredJson(row.definition_json,
      "STORED_DEFINITION_INVALID");
    if (definition.tokenHash !== row.token_hash
      || definition.definitionHash !== row.definition_hash) {
      fail("STORED_DEFINITION_INVALID");
    }
    return definition;
  }

  function initializeDefinition(request = {}) {
    exact(request, ["definition"], "INITIALIZE_DEFINITION_INPUT_INVALID");
    const definition = request.definition;
    if (definition === null || typeof definition !== "object"
      || Array.isArray(definition)) fail("DEFINITION_INVALID");
    hash(definition.tokenHash, "TOKEN_HASH_INVALID");
    hash(definition.definitionHash, "DEFINITION_HASH_INVALID");
    const definitionJson = canonicalizeStrict(definition);
    let status;
    storage.transactionSync(() => {
      const current = one(sql, `SELECT token_hash, definition_hash,
          definition_json FROM outsider_response_link_definition_v1
        WHERE singleton = 1`);
      if (current === null) {
        sql.exec(`INSERT INTO outsider_response_link_definition_v1
          (singleton, token_hash, definition_hash, definition_json)
          VALUES (1, ?, ?, ?)`, definition.tokenHash,
        definition.definitionHash, definitionJson);
        status = "INITIALIZED";
        return;
      }
      if (current.token_hash !== definition.tokenHash
        || current.definition_hash !== definition.definitionHash
        || current.definition_json !== definitionJson) {
        fail("DEFINITION_CONFLICT");
      }
      status = "EXISTING";
    });
    const replayed = readDefinition();
    if (replayed === null
      || canonicalizeStrict(replayed) !== definitionJson) {
      fail("DEFINITION_READBACK_MISMATCH");
    }
    return Object.freeze({ status, definition: replayed });
  }

  function read(request = {}) {
    exact(request, ["tokenHash"], "READ_INPUT_INVALID");
    hash(request.tokenHash, "TOKEN_HASH_INVALID");
    const definition = readDefinition();
    if (definition === null) return null;
    if (definition.tokenHash !== request.tokenHash) fail("TOKEN_HASH_CONFLICT");
    const rows = sql.exec(`SELECT ordinal, token_hash, event_hash,
        previous_event_hash, event_json
      FROM outsider_response_link_events_v1 ORDER BY ordinal ASC`).toArray();
    if (rows.length === 0) return null;
    if (rows.length > 2) fail("STORED_EVENT_SET_INVALID");
    const events = rows.map((row, index) => {
      const event = parseStoredJson(row.event_json, "STORED_EVENT_INVALID");
      if (Number(row.ordinal) !== index + 1
        || event.ordinal !== index + 1
        || row.token_hash !== request.tokenHash
        || event.tokenHash !== row.token_hash
        || event.eventHash !== row.event_hash
        || event.previousEventHash !== row.previous_event_hash) {
        fail("STORED_EVENT_INVALID");
      }
      return event;
    });
    return Object.freeze({
      headHash: events[events.length - 1].eventHash,
      events: Object.freeze(events),
    });
  }

  function compareAndAppend(request = {}) {
    exact(request, ["tokenHash", "expectedHeadHash", "event"],
      "APPEND_INPUT_INVALID");
    hash(request.tokenHash, "TOKEN_HASH_INVALID");
    if (request.expectedHeadHash !== null) {
      hash(request.expectedHeadHash, "EXPECTED_HEAD_HASH_INVALID");
    }
    const event = request.event;
    if (event === null || typeof event !== "object" || Array.isArray(event)
      || event.tokenHash !== request.tokenHash
      || event.previousEventHash !== request.expectedHeadHash
      || !Number.isSafeInteger(event.ordinal)
      || event.ordinal < 1 || event.ordinal > 2) fail("EVENT_INVALID");
    hash(event.eventHash, "EVENT_HASH_INVALID");
    const eventJson = canonicalizeStrict(event);
    let result;
    storage.transactionSync(() => {
      const definition = one(sql, `SELECT token_hash
        FROM outsider_response_link_definition_v1 WHERE singleton = 1`);
      if (definition?.token_hash !== request.tokenHash) {
        fail("DEFINITION_NOT_INITIALIZED");
      }
      const tail = one(sql, `SELECT ordinal, event_hash
        FROM outsider_response_link_events_v1 ORDER BY ordinal DESC LIMIT 1`);
      const actualHeadHash = tail?.event_hash ?? null;
      const expectedOrdinal = Number(tail?.ordinal ?? 0) + 1;
      if (actualHeadHash !== request.expectedHeadHash
        || event.ordinal !== expectedOrdinal || expectedOrdinal > 2) {
        result = Object.freeze({ status: "CONFLICT",
          headHash: actualHeadHash });
        return;
      }
      sql.exec(`INSERT INTO outsider_response_link_events_v1
        (ordinal, token_hash, event_hash, previous_event_hash, event_json)
        VALUES (?, ?, ?, ?, ?)`, event.ordinal, request.tokenHash,
      event.eventHash, event.previousEventHash, eventJson);
      const readback = one(sql, `SELECT event_hash, event_json
        FROM outsider_response_link_events_v1 WHERE ordinal = ?`,
      event.ordinal);
      if (readback?.event_hash !== event.eventHash
        || readback.event_json !== eventJson) fail("EVENT_READBACK_MISMATCH");
      result = Object.freeze({ status: "APPENDED",
        headHash: event.eventHash });
    });
    if (result === undefined) fail("APPEND_RESULT_MISSING");
    return result;
  }

  return Object.freeze({ readDefinition, initializeDefinition, read,
    compareAndAppend });
}

