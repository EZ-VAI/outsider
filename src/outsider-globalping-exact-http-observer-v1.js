/*
 * A small production exact-response observer backed by Globalping's public
 * measurement API. It creates one unauthenticated, one-probe HTTPS GET and
 * hashes the body returned by that external probe. The operation journal is
 * durable so a process restart polls the same measurement instead of creating
 * a second one. A crash after POST but before its measurement id is recorded is
 * deliberately ambiguous and is never retried automatically.
 *
 * Current provider contract (checked 2026-09-03):
 * Revision: 50aaddb6d312efbc018007e519053bc5c694c039
 * https://github.com/jsdelivr/globalping/blob/50aaddb6d312efbc018007e519053bc5c694c039/public/v1/spec.yaml
 * https://github.com/jsdelivr/globalping/blob/50aaddb6d312efbc018007e519053bc5c694c039/public/v1/components/schemas.yaml
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_GLOBALPING_EXACT_HTTP_OBSERVER_V1_";
const API_ORIGIN = "https://api.globalping.io";
const MEASUREMENT_ID = /^[A-Za-z0-9_-]{6,160}$/u;
const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u;
const MAX_API_BYTES = 256 * 1024;

function fail(code) {
  const error = new Error(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function target(input) {
  if (typeof input !== "string" || input.length > 4096) {
    fail("TARGET_INVALID");
  }
  let value;
  try { value = new URL(input); } catch { fail("TARGET_INVALID"); }
  if (value.protocol !== "https:" || value.username !== ""
    || value.password !== "" || value.search !== "" || value.hash !== ""
    || value.port !== "" || value.hostname.length === 0) {
    fail("PUBLIC_HTTPS_TARGET_REQUIRED");
  }
  return value;
}

function eventFile(directory, operationId) {
  return path.join(directory, `${createHash("sha256")
    .update(operationId, "utf8").digest("hex")}.globalping.jsonl`);
}

function operationLockFile(file) {
  return `${file}.lock`;
}

function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

/* A symlink publishes its owner atomically; a newly created regular file can
 * briefly be visible with no owner bytes. */
function acquireOperationLock(file) {
  const lock = operationLockFile(file);
  const owner = `${process.pid}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      symlinkSync(owner, lock);
      return () => {
        try {
          if (readlinkSync(lock) === owner) unlinkSync(lock);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let incumbent;
      try { incumbent = readlinkSync(lock); }
      catch { fail("OPERATION_BUSY"); }
      const pid = Number(incumbent);
      if (String(pid) !== incumbent || processExists(pid)) {
        fail("OPERATION_BUSY");
      }
      try { unlinkSync(lock); }
      catch (unlinkError) {
        if (unlinkError?.code !== "ENOENT") fail("OPERATION_BUSY");
      }
    }
  }
  fail("OPERATION_BUSY");
}

function syncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readEvents(file) {
  if (!existsSync(file)) return [];
  const bytes = readFileSync(file);
  if (bytes.length === 0 || bytes[bytes.length - 1] !== 0x0a) {
    fail("JOURNAL_PARTIAL");
  }
  const events = bytes.toString("utf8").trimEnd().split("\n").map((line) => {
    try { return JSON.parse(line); } catch { fail("JOURNAL_INVALID"); }
  });
  let previousEventHash = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event?.sequence !== index + 1
      || event.previousEventHash !== previousEventHash) fail("JOURNAL_CHAIN_INVALID");
    const body = { ...event };
    delete body.eventHash;
    if (event.eventHash !== digest(
      "outsider/globalping-exact-observer-event/v1", body)) {
      fail("JOURNAL_HASH_INVALID");
    }
    previousEventHash = event.eventHash;
  }
  return events;
}

function appendEvent(file, events, eventType, payload, now) {
  const body = {
    schema: "outsider/globalping-exact-observer-event/v1",
    schemaVersion: "1.0.0",
    sequence: events.length + 1,
    previousEventHash: events.at(-1)?.eventHash ?? null,
    recordedAt: now(),
    eventType,
    payload,
  };
  const event = { ...body, eventHash: digest(body.schema, body) };
  const created = !existsSync(file);
  let descriptor;
  try {
    descriptor = openSync(file, "a", 0o600);
    writeSync(descriptor, `${canonicalizeStrict(event)}\n`, null, "utf8");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (created) syncDirectory(path.dirname(file));
  events.push(event);
}

async function responseJson(response) {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_API_BYTES) fail("PROVIDER_RESPONSE_TOO_LARGE");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("PROVIDER_RESPONSE_INVALID"); }
  return { value, responseHash: sha256(bytes) };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function finishedObservation(source, measurementId, expectedTarget) {
  if (source?.id !== measurementId || source.type !== "http"
    || source.target !== expectedTarget || source.status !== "finished"
    || source.probesCount !== 1 || !Array.isArray(source.results)
    || source.results.length !== 1) fail("MEASUREMENT_RESULT_INVALID");
  const result = source.results[0]?.result;
  if (result?.status !== "finished" || !Number.isSafeInteger(result.statusCode)
    || result.statusCode < 100 || result.statusCode > 599
    || typeof result.rawBody !== "string" || result.truncated !== false
    || result.tls?.authorized !== true) fail("EXACT_HTTP_RESULT_UNAVAILABLE");
  const observed = {
    status: result.statusCode,
    bodyHash: sha256(Buffer.from(result.rawBody, "utf8")),
    providerReceipt: {
      schema: "outsider/globalping-exact-http-provider-receipt/v1",
      provider: "globalping-public-api-v1",
      measurementIdHash: digest(
        "outsider/globalping-measurement-id/v1", measurementId),
      probe: {
        country: source.results[0]?.probe?.country ?? null,
        asn: source.results[0]?.probe?.asn ?? null,
        network: source.results[0]?.probe?.network ?? null,
      },
      tlsAuthorized: true,
      bodyTruncated: false,
    },
  };
  return Object.freeze(observed);
}

export function createGlobalpingExactHttpObserverV1(config = {}) {
  if (typeof config.directory !== "string" || config.directory.length === 0) {
    fail("DIRECTORY_REQUIRED");
  }
  const directory = path.resolve(config.directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const wait = config.wait ?? sleep;
  const now = config.clock ?? (() => new Date().toISOString());
  const pollIntervalMs = config.pollIntervalMs ?? 500;
  const maximumPolls = config.maximumPolls ?? 80;
  if (typeof fetchImpl !== "function" || typeof wait !== "function"
    || typeof now !== "function" || !Number.isSafeInteger(pollIntervalMs)
    || pollIntervalMs < 0 || pollIntervalMs > 10_000
    || !Number.isSafeInteger(maximumPolls) || maximumPolls < 1
    || maximumPolls > 240) fail("CONFIG_INVALID");

  async function observe(input = {}) {
    if (typeof input.operationId !== "string"
      || !OPERATION_ID.test(input.operationId)) fail("OPERATION_ID_INVALID");
    const url = target(input.targetUrl);
    const file = eventFile(directory, input.operationId);
    const releaseOperationLock = acquireOperationLock(file);
    try {
      const events = readEvents(file);
      const targetHash = digest("outsider/globalping-target/v1", url.href);
      const prepared = events.find((event) => event.eventType === "PREPARED");
      if (prepared !== undefined && prepared.payload.targetHash !== targetHash) {
        fail("OPERATION_TARGET_MISMATCH");
      }
      const completed = [...events].reverse().find((event) =>
        event.eventType === "FINISHED");
      if (completed) return Object.freeze(completed.payload.observation);
      if (!prepared) appendEvent(file, events, "PREPARED", { targetHash }, now);

      let created = [...events].reverse().find((event) =>
        event.eventType === "MEASUREMENT_CREATED");
      if (!created) {
        if (events.some((event) => event.eventType === "CREATE_SUBMITTING")) {
          fail("CREATE_COMMIT_AMBIGUOUS_NO_RETRY");
        }
        const request = {
          type: "http",
          target: url.hostname,
          inProgressUpdates: false,
          limit: 1,
          timeout: 20,
          measurementOptions: {
            protocol: "HTTPS",
            port: 443,
            request: { method: "GET", path: url.pathname },
          },
        };
        appendEvent(file, events, "CREATE_SUBMITTING", {
          requestHash: digest("outsider/globalping-create-request/v1", request),
        }, now);
        let response;
        try {
          response = await fetchImpl(`${API_ORIGIN}/v1/measurements`, {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              "user-agent": "outsider-outcome-formation/1",
            },
            body: canonicalizeStrict(request),
            redirect: "error",
          });
        } catch { fail("CREATE_COMMIT_AMBIGUOUS_NO_RETRY"); }
        const captured = await responseJson(response);
        const measurementId = captured.value?.id;
        let location;
        try {
          location = new URL(response.headers.get("location"), API_ORIGIN);
        } catch { fail("CREATE_REJECTED"); }
        const expectedLocation = `${API_ORIGIN}/v1/measurements/${
          encodeURIComponent(measurementId ?? "")}`;
        if (response.status !== 202 || typeof measurementId !== "string"
          || !MEASUREMENT_ID.test(measurementId)
          || captured.value.probesCount !== 1
          || location.href !== expectedLocation) fail("CREATE_REJECTED");
        appendEvent(file, events, "MEASUREMENT_CREATED", {
          measurementId,
          providerResponseHash: captured.responseHash,
        }, now);
        created = events.at(-1);
      }

      const measurementId = created.payload.measurementId;
      for (let index = 0; index < maximumPolls; index += 1) {
        const response = await fetchImpl(
          `${API_ORIGIN}/v1/measurements/${encodeURIComponent(measurementId)}`, {
            method: "GET",
            headers: {
              accept: "application/json",
              "user-agent": "outsider-outcome-formation/1",
            },
            redirect: "error",
          });
        const captured = await responseJson(response);
        if (response.status !== 200) fail("MEASUREMENT_READ_REJECTED");
        if (captured.value?.status === "finished") {
          const observation = finishedObservation(
            captured.value, measurementId, url.hostname);
          appendEvent(file, events, "FINISHED", {
            providerResponseHash: captured.responseHash,
            observation,
          }, now);
          return observation;
        }
        if (captured.value?.status !== "in-progress") {
          fail("MEASUREMENT_TERMINAL_WITHOUT_RESULT");
        }
        if (index + 1 < maximumPolls) await wait(pollIntervalMs);
      }
      fail("MEASUREMENT_TIMEOUT");
    } finally {
      releaseOperationLock();
    }
  }

  return Object.freeze({
    providerRef: "globalping-public-api-v1",
    observe,
  });
}
