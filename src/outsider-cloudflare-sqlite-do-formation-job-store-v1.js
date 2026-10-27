/*
 * SQLite Durable Object implementation of the Formation Job Worker v1 store.
 *
 * One Durable Object is addressed by jobKey. Its singleton row makes claim
 * and completion compare-and-set decisions synchronous and durable. The
 * external executor is never invoked inside a storage transaction.
 */

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_CLOUDFLARE_SQLITE_DO_FORMATION_JOB_STORE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;

export const OUTSIDER_CLOUDFLARE_SQLITE_DO_FORMATION_JOB_STORE_V1_BOUNDARY
  = Object.freeze({
    cloudflarePrimitive: "SQLITE_DURABLE_OBJECT",
    oneDurableObjectPerJobKeyRequired: true,
    claimCompareAndSetIsOneSynchronousTransaction: true,
    completeCompareAndSetIsOneSynchronousTransaction: true,
    externalExecutionInsideStorageTransaction: false,
    workersKvUsedForIdempotencyDecision: false,
    rawCredentialsStored: false,
    rawPaymentMaterialStored: false,
    rawPromptStored: false,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
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

function parseCanonical(text, code) {
  if (typeof text !== "string") fail(code);
  let value;
  try { value = JSON.parse(text); } catch { fail(code); }
  if (canonicalizeStrict(value) !== text) fail(code);
  return value;
}

function one(sql, statement, ...bindings) {
  return sql.exec(statement, ...bindings).toArray()[0] ?? null;
}

export function createCloudflareSqliteDurableObjectFormationJobStoreV1(
  input = {}) {
  exact(input, ["storage"], "INPUT_INVALID");
  const storage = input.storage;
  if (storage === null || typeof storage !== "object"
    || typeof storage.transactionSync !== "function"
    || storage.sql === null || typeof storage.sql !== "object"
    || typeof storage.sql.exec !== "function") fail("STORAGE_INVALID");
  const sql = storage.sql;

  sql.exec(`CREATE TABLE IF NOT EXISTS outsider_formation_job_v1 (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    job_key TEXT NOT NULL UNIQUE,
    job_hash TEXT NOT NULL UNIQUE,
    job_json TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('RUNNING', 'COMPLETE')),
    claimed_at TEXT NOT NULL,
    receipt_json TEXT
  )`);

  function row() {
    return one(sql, `SELECT job_key, job_hash, job_json, state, claimed_at,
        receipt_json
      FROM outsider_formation_job_v1 WHERE singleton = 1`);
  }

  function project(stored) {
    if (stored === null) return null;
    hash(stored.job_key, "STORED_JOB_KEY_INVALID");
    hash(stored.job_hash, "STORED_JOB_HASH_INVALID");
    parseCanonical(stored.job_json, "STORED_JOB_INVALID");
    if (!new Set(["RUNNING", "COMPLETE"]).has(stored.state)
      || typeof stored.claimed_at !== "string") fail("STORED_STATE_INVALID");
    const receipt = stored.receipt_json === null
      ? null : parseCanonical(stored.receipt_json, "STORED_RECEIPT_INVALID");
    if ((stored.state === "COMPLETE") !== (receipt !== null)) {
      fail("STORED_RECEIPT_STATE_INVALID");
    }
    return Object.freeze({ state: stored.state, jobKey: stored.job_key,
      jobHash: stored.job_hash, claimedAt: stored.claimed_at, receipt });
  }

  function claim(request = {}) {
    exact(request, ["jobKey", "jobHash", "job", "claimedAt"],
      "CLAIM_INPUT_INVALID");
    hash(request.jobKey, "JOB_KEY_INVALID");
    hash(request.jobHash, "JOB_HASH_INVALID");
    if (typeof request.claimedAt !== "string") fail("CLAIMED_AT_INVALID");
    const jobJson = canonicalizeStrict(request.job);
    let result;
    storage.transactionSync(() => {
      const existing = row();
      if (existing === null) {
        sql.exec(`INSERT INTO outsider_formation_job_v1
          (singleton, job_key, job_hash, job_json, state, claimed_at,
            receipt_json) VALUES (1, ?, ?, ?, 'RUNNING', ?, NULL)`,
        request.jobKey, request.jobHash, jobJson, request.claimedAt);
        result = Object.freeze({ status: "CLAIMED" });
        return;
      }
      if (existing.job_key !== request.jobKey
        || existing.job_hash !== request.jobHash
        || existing.job_json !== jobJson) {
        result = Object.freeze({ status: "CONFLICT" });
        return;
      }
      const projected = project(existing);
      result = projected.state === "COMPLETE"
        ? Object.freeze({ status: "COMPLETE", receipt: projected.receipt })
        : Object.freeze({ status: "RUNNING", claimedAt: projected.claimedAt });
    });
    if (result === undefined) fail("CLAIM_RESULT_MISSING");
    return result;
  }

  function complete(request = {}) {
    exact(request, ["jobKey", "jobHash", "receipt"],
      "COMPLETE_INPUT_INVALID");
    hash(request.jobKey, "JOB_KEY_INVALID");
    hash(request.jobHash, "JOB_HASH_INVALID");
    const receiptJson = canonicalizeStrict(request.receipt);
    let result;
    storage.transactionSync(() => {
      const existing = row();
      if (existing === null || existing.job_key !== request.jobKey
        || existing.job_hash !== request.jobHash) fail("COMPLETE_WITHOUT_CLAIM");
      if (existing.state === "COMPLETE") {
        if (existing.receipt_json !== receiptJson) fail("RECEIPT_CONFLICT");
        result = Object.freeze({ status: "EXISTING",
          receipt: project(existing).receipt });
        return;
      }
      sql.exec(`UPDATE outsider_formation_job_v1 SET state = 'COMPLETE',
        receipt_json = ? WHERE singleton = 1 AND state = 'RUNNING'`, receiptJson);
      const readback = row();
      if (readback?.state !== "COMPLETE"
        || readback.receipt_json !== receiptJson) fail("COMPLETE_READBACK_MISMATCH");
      result = Object.freeze({ status: "COMPLETED",
        receipt: project(readback).receipt });
    });
    if (result === undefined) fail("COMPLETE_RESULT_MISSING");
    return result;
  }

  function read(request = {}) {
    exact(request, ["jobKey"], "READ_INPUT_INVALID");
    hash(request.jobKey, "JOB_KEY_INVALID");
    const stored = row();
    if (stored === null) return null;
    if (stored.job_key !== request.jobKey) return null;
    return project(stored);
  }

  return Object.freeze({ claim, complete, read });
}
