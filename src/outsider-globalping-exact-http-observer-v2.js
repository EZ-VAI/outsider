/*
 * Redirect-aware production exact-response observer for Outsider's
 * order-scoped GitHub Release Asset recovery route.
 *
 * GitHub's canonical browser_download_url is intentionally not the byte
 * origin: an external Globalping probe first observes the one HTTPS 302 from
 * github.com, then a second measurement reuses that exact probe by supplying
 * the first measurement id as `locations`. Only the independently observed,
 * policy-checked release-assets.githubusercontent.com target may carry the
 * signed query string. The final hash is over the complete, untruncated UTF-8
 * bytes returned by the second probe.
 *
 * The per-operation JSONL journal is private and durable, but still retains
 * only target hashes. An interrupted redirect is reconstructed by reading the
 * already-created first measurement and matching its recorded redirect hash;
 * neither the raw Location nor its signed query is persisted. Returned/public
 * receipts likewise contain hashes only. A lost create acknowledgement is
 * never submitted again.
 *
 * Globalping provider contract used by this descendant (revision pinned by
 * the frozen v1 observer):
 *   50aaddb6d312efbc018007e519053bc5c694c039
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

const PREFIX = "OUTSIDER_GLOBALPING_EXACT_HTTP_OBSERVER_V2_";
const API_ORIGIN = "https://api.globalping.io";
const MEASUREMENT_ID = /^[A-Za-z0-9_-]{6,160}$/u;
const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_API_BYTES = 256 * 1024;
const MAX_TARGET_BYTES = 12 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const MAX_REQUEST_TIMEOUT_MS = 60_000;
const MAX_SIGNED_REDIRECT_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const GITHUB_REDIRECTS = 1;
const INITIAL_HOST = "github.com";
const REDIRECT_HOST = "release-assets.githubusercontent.com";
const RELEASE_PATH = /^\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}\/releases\/download\/outsider-recovery-([a-f0-9]{32})\/artifact-\1\.bin$/u;
const REDIRECT_PATH_PREFIX = "/github-production-release-asset/";
const EVENT_SCHEMA = "outsider/globalping-exact-observer-event/v2";
const GITHUB_POLICY = Object.freeze({
  schema: "outsider/globalping-github-release-asset-redirect-policy/v1",
  initialHost: INITIAL_HOST,
  initialQueryAllowed: false,
  redirectStatus: 302,
  maximumRedirects: GITHUB_REDIRECTS,
  redirectHost: REDIRECT_HOST,
  redirectPathPrefix: REDIRECT_PATH_PREFIX,
  redirectQueryAllowed: true,
  userSuppliedCredentialsAllowedAtAnyHop: false,
  authorizationHeadersSentToGlobalping: false,
  providerIssuedSignedQueryForwardedToGlobalping: true,
  providerIssuedSignedQueryPersistedLocally: false,
  providerIssuedSignedQueryProjectedPublicly: false,
  maximumSignedRedirectLifetimeMs: MAX_SIGNED_REDIRECT_LIFETIME_MS,
  fragmentsAllowedAtAnyHop: false,
  tlsAuthorizationRequiredAtEveryHop: true,
  reuseInitialProbeForRedirectTarget: true,
});
const WORKERS_POLICY = Object.freeze({
  schema: "outsider/globalping-cloudflare-workers-direct-policy/v1",
  initialHostSuffix: ".workers.dev",
  initialPath: "/",
  initialQueryAllowed: false,
  maximumRedirects: 0,
  userSuppliedCredentialsAllowedAtAnyHop: false,
  authorizationHeadersSentToGlobalping: false,
  fragmentsAllowedAtAnyHop: false,
  tlsAuthorizationRequiredAtEveryHop: true,
});
const NEON_PUBLIC_POLICY = Object.freeze({
  schema: "outsider/globalping-neon-public-dataset-policy/v1",
  maximumRedirects: 0, ownerCredentialsForwarded: false,
  publicAnonymousTokenSource: "SAME_PROJECT_NEON_AUTH_PUBLIC_TOKEN_ENDPOINT",
  publicAnonymousTokenForwardedToProbe: true, publicAnonymousTokenPersistedLocally: false,
  dataScope: "TASK_OWNED_ANONYMOUS_SELECT_ONLY_TABLE", bodyComparison: "CANONICAL_JSON_AND_RAW_BYTE_HASH",
});
const FUNCTION_POLICY = Object.freeze({
  schema: "outsider/globalping-public-json-function-policy/v1", maximumRedirects: 0,
  dataScope: "EXPLICIT_PUBLIC_JSON_FUNCTION_INPUTS", evidenceScope: "CURRENT_COMPUTED_JSON_NOT_ALL_FUNCTION_BEHAVIOR",
  bodyComparison: "CANONICAL_JSON_AND_RAW_BYTE_HASH", ownerCredentialsForwarded: false,
  publicAnonymousTokenPersistedLocally: false,
});
const CALCOM_AVAILABILITY_POLICY = Object.freeze({
  schema: "outsider/globalping-calcom-public-availability-policy/v1",
  maximumRedirects: 0, apiVersion: "2024-09-04", credentialsForwarded: false,
  reservationUidForwarded: false, evidenceScope: "PUBLIC_SLOT_AVAILABILITY_NOT_HOLD_OWNERSHIP_OR_ATTENDANCE",
});

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

function commonHttpsTarget(input, code) {
  if (typeof input !== "string" || input.length < 1
    || Buffer.byteLength(input, "utf8") > MAX_TARGET_BYTES) fail(code);
  let value;
  try { value = new URL(input); } catch { fail(code); }
  if (value.protocol !== "https:" || value.username !== ""
    || value.password !== "" || value.hash !== "" || value.port !== ""
    || value.hostname.length === 0) fail(code);
  return value;
}

function initialTarget(input) {
  const value = commonHttpsTarget(input, "INITIAL_TARGET_INVALID");
  if((value.hostname==='api.github.com'&&/^\/repos\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9][0-9]*$/u.test(value.pathname)&&value.search==='')
    ||(value.hostname==='ntfy.sh'&&/^\/outsider-handoff-[a-f0-9]{32}\/json$/u.test(value.pathname)&&value.search==='?poll=1&since=all'))
    return Object.freeze({url:value,policy:{schema:'outsider/globalping-public-handoff-read/v1',maximumRedirects:0,
      credentialsForwarded:false,evidenceScope:'EXACT_PUBLIC_RECORD_NOT_HUMAN_OR_SUPPLIER_ACCEPTANCE'},
      policyName:'PUBLIC_OPERATIONS_HANDOFF_JSON',maximumRedirects:0,canonicalJson:true});
  const publicInput = () => {
    if ([...value.searchParams.keys()].join(",") !== "input" || Buffer.byteLength(value.searchParams.get("input") ?? "") > 3000) return false;
    try { JSON.parse(value.searchParams.get("input")); return true; } catch { return false; }
  };
  if (/^outsider-[a-z0-9-]+\.[a-z0-9-]+\.deno\.net$/u.test(value.hostname)
    && (value.pathname === "/" && value.search === "" || value.pathname === "/evaluate" && publicInput()))
    return Object.freeze({ url: value, policy: FUNCTION_POLICY, policyName: "DENO_PUBLIC_JSON_FUNCTION", maximumRedirects: 0, canonicalJson: true });
  if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2}workers\.dev$/u.test(value.hostname)
    && value.pathname === "/evaluate" && publicInput()) return Object.freeze({ url: value, policy: FUNCTION_POLICY,
      policyName: "CLOUDFLARE_PUBLIC_JSON_FUNCTION", maximumRedirects: 0, canonicalJson: true });
  if (/^ep-[a-z0-9-]+\.apirest\.(?:c-[0-9]+\.)?[a-z0-9-]+\.aws\.neon\.tech$/u.test(value.hostname)
    && (value.pathname === "/neondb/rest/v1/rpc/outsider_metadata" && value.search === ""
      || ["/neondb/rest/v1/rpc/outsider_evaluate", "/neondb/rest/v1/rpc/outsider_evaluate_get"].includes(value.pathname) && publicInput())) return Object.freeze({
      url: value, policy: FUNCTION_POLICY, policyName: "NEON_PUBLIC_JSON_FUNCTION", maximumRedirects: 0, canonicalJson: true,
      anonymousTokenUrl: `https://${value.hostname.replace(".apirest.", ".neonauth.")}/neondb/auth/token/anonymous` });
  if (value.hostname === INITIAL_HOST && value.search === ""
    && RELEASE_PATH.test(value.pathname)
    && value.href === `https://${INITIAL_HOST}${value.pathname}`) {
    return Object.freeze({
      url: value,
      policy: GITHUB_POLICY,
      policyName: "GITHUB_RELEASE_ASSET_SINGLE_HTTPS_REDIRECT",
      maximumRedirects: GITHUB_REDIRECTS,
    });
  }
  if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2}workers\.dev$/u
    .test(value.hostname) && value.pathname === "/" && value.search === ""
    && value.href === `https://${value.hostname}/`) {
    return Object.freeze({
      url: value,
      policy: WORKERS_POLICY,
      policyName: "CLOUDFLARE_WORKERS_DIRECT_HTTPS",
      maximumRedirects: 0,
    });
  }
  if (/^ep-[a-z0-9-]+\.apirest\.(?:c-[0-9]+\.)?[a-z0-9-]+\.aws\.neon\.tech$/u.test(value.hostname)
    && value.pathname === "/neondb/rest/v1/outsider_records" && value.search === "?select=id,value&order=id.asc") {
    return Object.freeze({ url: value, policy: NEON_PUBLIC_POLICY, policyName: "NEON_PUBLIC_DATA_API", maximumRedirects: 0,
      anonymousTokenUrl: `https://${value.hostname.replace(".apirest.", ".neonauth.")}/neondb/auth/token/anonymous` });
  }
  if (value.hostname === "api.cal.com" && value.pathname === "/v2/slots") {
    const q = value.searchParams, start = Date.parse(q.get("start")), end = Date.parse(q.get("end"));
    if ([...q.keys()].sort().join(",") === "end,eventTypeId,format,start,timeZone"
      && /^[1-9][0-9]{0,12}$/u.test(q.get("eventTypeId")) && q.get("format") === "range"
      && q.get("timeZone") === "UTC" && Number.isFinite(start) && Number.isFinite(end)
      && end > start && end - start <= 3 * 86400000) return Object.freeze({ url: value,
        policy: CALCOM_AVAILABILITY_POLICY, policyName: "CALCOM_PUBLIC_AVAILABILITY", maximumRedirects: 0 });
  }
  fail("INITIAL_TARGET_POLICY_MISMATCH");
}

function redirectTarget(input, observedAt = undefined) {
  const value = commonHttpsTarget(input, "REDIRECT_TARGET_INVALID");
  if (value.hostname !== REDIRECT_HOST
    || !value.pathname.startsWith(REDIRECT_PATH_PREFIX)
    || value.pathname.length <= REDIRECT_PATH_PREFIX.length
    || /%(?:00|0[ad]|2f|5c)/iu.test(value.pathname)
    || value.search.length > MAX_TARGET_BYTES || value.search === "") {
    fail("REDIRECT_TARGET_POLICY_MISMATCH");
  }
  if (observedAt !== undefined) {
    const observed = Date.parse(observedAt);
    const expiries = value.searchParams.getAll("se");
    const signatures = value.searchParams.getAll("sig");
    const expiry = expiries.length === 1 ? Date.parse(expiries[0]) : NaN;
    if (!Number.isFinite(observed) || expiries.length !== 1
      || !Number.isFinite(expiry) || expiry <= observed
      || expiry - observed > MAX_SIGNED_REDIRECT_LIFETIME_MS
      || signatures.length !== 1 || signatures[0].length < 1) {
      fail("SIGNED_REDIRECT_CAPABILITY_INVALID_OR_EXPIRED");
    }
  }
  return value;
}

function redirectLocation(headers, observedAt) {
  if (headers === null || typeof headers !== "object"
    || Array.isArray(headers)) fail("REDIRECT_LOCATION_UNAVAILABLE");
  const matches = Object.entries(headers).filter(([name]) =>
    name.toLowerCase() === "location");
  if (matches.length !== 1) fail("REDIRECT_LOCATION_UNAVAILABLE");
  let value = matches[0][1];
  if (Array.isArray(value)) {
    if (value.length !== 1) fail("REDIRECT_LOCATION_UNAVAILABLE");
    [value] = value;
  }
  if (typeof value !== "string" || value.length < 1) {
    fail("REDIRECT_LOCATION_UNAVAILABLE");
  }
  return redirectTarget(value, observedAt);
}

function eventFile(directory, operationId) {
  return path.join(directory, `${createHash("sha256")
    .update(operationId, "utf8").digest("hex")}.globalping-redirect.jsonl`);
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

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(descriptor, bytes, offset,
      bytes.length - offset, null);
    if (!Number.isSafeInteger(written) || written < 1) {
      fail("JOURNAL_WRITE_INCOMPLETE");
    }
    offset += written;
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
  const allowed = new Set([
    "PREPARED", "HOP_CREATE_SUBMITTING", "HOP_MEASUREMENT_CREATED",
    "HOP_OBSERVED", "FINISHED",
  ]);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event?.schema !== EVENT_SCHEMA || event.schemaVersion !== "2.0.0"
      || event.sequence !== index + 1
      || event.previousEventHash !== previousEventHash
      || !allowed.has(event.eventType)) fail("JOURNAL_CHAIN_INVALID");
    const body = { ...event };
    delete body.eventHash;
    if (event.eventHash !== digest(EVENT_SCHEMA, body)) {
      fail("JOURNAL_HASH_INVALID");
    }
    previousEventHash = event.eventHash;
  }
  if (events.length > 0 && events[0].eventType !== "PREPARED") {
    fail("JOURNAL_TRANSITION_INVALID");
  }
  if (events.filter((event) => event.eventType === "PREPARED").length > 1
    || events.filter((event) => event.eventType === "FINISHED").length > 1
    || (events.some((event) => event.eventType === "FINISHED")
      && events.at(-1).eventType !== "FINISHED")) {
    fail("JOURNAL_TRANSITION_INVALID");
  }
  for (const event of events.filter((item) => item.eventType.startsWith("HOP_"))) {
    if (![0, 1].includes(event.payload?.hopIndex)) {
      fail("JOURNAL_TRANSITION_INVALID");
    }
  }
  return events;
}

function appendEvent(file, events, eventType, payload, now) {
  const body = {
    schema: EVENT_SCHEMA,
    schemaVersion: "2.0.0",
    sequence: events.length + 1,
    previousEventHash: events.at(-1)?.eventHash ?? null,
    recordedAt: now(),
    eventType,
    payload,
  };
  const event = { ...body, eventHash: digest(EVENT_SCHEMA, body) };
  const created = !existsSync(file);
  const bytes = Buffer.from(`${canonicalizeStrict(event)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, "a", 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (created) syncDirectory(path.dirname(file));
  events.push(event);
}

function oneHopEvent(events, eventType, hopIndex) {
  const matches = events.filter((event) => event.eventType === eventType
    && event.payload?.hopIndex === hopIndex);
  if (matches.length > 1) fail("JOURNAL_TRANSITION_INVALID");
  return matches[0] ?? null;
}

async function responseJson(response) {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_API_BYTES) fail("PROVIDER_RESPONSE_TOO_LARGE");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("PROVIDER_RESPONSE_INVALID"); }
  return { value, responseHash: sha256(bytes) };
}

async function providerExchange(fetchImpl, requestTimeoutMs, url, init,
  timeoutCode) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${PREFIX}${timeoutCode}`);
      error.outsiderCode = timeoutCode;
      controller.abort(error);
      reject(error);
    }, requestTimeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(async () => {
        const response = await fetchImpl(url, { ...init,
          signal: controller.signal });
        const captured = await responseJson(response);
        return { response, captured };
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function probeBindingHash(source) {
  const probe = source?.results?.[0]?.probe;
  if (probe === null || typeof probe !== "object" || Array.isArray(probe)) {
    fail("PROBE_BINDING_UNAVAILABLE");
  }
  try {
    return digest("outsider/globalping-probe-binding/v2", probe);
  } catch {
    fail("PROBE_BINDING_UNAVAILABLE");
  }
}

function commonFinishedResult(source, measurementId, expectedTarget) {
  if (source?.id !== measurementId || source.type !== "http"
    || source.target !== expectedTarget || source.status !== "finished"
    || source.probesCount !== 1 || !Array.isArray(source.results)
    || source.results.length !== 1) fail("MEASUREMENT_RESULT_INVALID");
  const result = source.results[0]?.result;
  if (result?.status !== "finished" || !Number.isSafeInteger(result.statusCode)
    || result.statusCode < 100 || result.statusCode > 599
    || result.tls?.authorized !== true) fail("EXACT_HTTP_RESULT_UNAVAILABLE");
  return { result, probeBindingHash: probeBindingHash(source) };
}

function redirectObservation(source, measurementId, expectedTarget,
  observedAt) {
  const captured = commonFinishedResult(source, measurementId, expectedTarget);
  if (captured.result.statusCode !== 302 || captured.result.rawBody !== null
    || captured.result.truncated !== false) {
    fail("CANONICAL_REDIRECT_UNAVAILABLE");
  }
  const next = redirectLocation(captured.result.headers, observedAt);
  return Object.freeze({
    status: 302,
    probeBindingHash: captured.probeBindingHash,
    nextTargetUrl: next.href,
    nextTargetHash: digest("outsider/globalping-target/v2", next.href),
  });
}

function finalObservation(source, measurementId, expectedTarget,
  expectedProbeBindingHash, compareJson = false, projectAvailability = false) {
  const captured = commonFinishedResult(source, measurementId, expectedTarget);
  if (expectedProbeBindingHash !== null
    && captured.probeBindingHash !== expectedProbeBindingHash) {
    fail("REDIRECT_PROBE_BINDING_MISMATCH");
  }
  if (captured.result.statusCode !== 200
    || typeof captured.result.rawBody !== "string"
    || captured.result.truncated !== false) {
    fail("EXACT_FINAL_BODY_UNAVAILABLE");
  }
  const bytes = Buffer.from(captured.result.rawBody, "utf8");
  let canonicalJsonHash;
  if (compareJson) {
    try { canonicalJsonHash = sha256(Buffer.from(canonicalizeStrict(JSON.parse(bytes)), "utf8")); }
    catch { fail("EXACT_JSON_RESULT_UNAVAILABLE"); }
  }
  let publicAvailability;
  if (projectAvailability) {
    let body; try { body = JSON.parse(bytes); } catch { fail("CALCOM_AVAILABILITY_INVALID"); }
    if (body?.status !== "success" || !body.data || typeof body.data !== "object"
      || Object.values(body.data).some(rows => !Array.isArray(rows))) fail("CALCOM_AVAILABILITY_INVALID");
    const slots = Object.values(body.data).flat().map(row => ({ start: row?.start, end: row?.end }));
    if (slots.some(row => !Number.isFinite(Date.parse(row.start)) || !Number.isFinite(Date.parse(row.end))))
      fail("CALCOM_AVAILABILITY_INVALID");
    publicAvailability = { slots, ownershipEstablished: false, attendanceEstablished: false };
  }
  return Object.freeze({
    status: 200,
    probeBindingHash: captured.probeBindingHash,
    bodyHash: sha256(bytes),
    bodyByteLength: bytes.length,
    ...(canonicalJsonHash ? { canonicalJsonHash } : {}),
    ...(publicAvailability ? { publicAvailability } : {}),
  });
}

function measurementRequest(url, hopIndex, firstMeasurementId, publicAnonymousToken) {
  return {
    type: "http",
    target: url.hostname,
    inProgressUpdates: false,
    ...(hopIndex === 0 ? { limit: 1 }
      : { locations: [{ magic: firstMeasurementId }] }),
    timeout: 20,
    measurementOptions: {
      protocol: "HTTPS",
      port: 443,
      request: { method: "GET", path: `${url.pathname}${url.search}`,
        ...(url.hostname === "api.cal.com" ? { headers: { "cal-api-version": "2024-09-04" } } : {}),
        ...(publicAnonymousToken ? { headers: { Authorization: `Bearer ${publicAnonymousToken}` } } : {}) },
    },
  };
}

function publicObservation(policyName, policyHash, initialTargetHash,
  redirectTargetHash, measurementIds, probeHash, bodyHash, bodyByteLength, canonicalJsonHash, publicAvailability) {
  const redirectCount = redirectTargetHash === null ? 0 : 1;
  return Object.freeze({
    status: 200,
    bodyHash,
    ...(canonicalJsonHash ? { canonicalJsonHash } : {}),
    ...(publicAvailability ? { publicAvailability } : {}),
    providerReceipt: Object.freeze({
      schema: "outsider/globalping-exact-http-provider-receipt/v2",
      schemaVersion: "2.0.0",
      provider: "globalping-public-api-v1",
      observationPolicy: policyName,
      policyHash,
      redirectCount,
      hopCount: measurementIds.length,
      initialTargetHash,
      redirectTargetHash,
      measurementIdHashes: Object.freeze(measurementIds.map((measurementId) =>
        digest("outsider/globalping-measurement-id/v2", measurementId))),
      probeBindingHash: probeHash,
      sameProbeAcrossHops: measurementIds.length > 1 ? true : null,
      hopStatuses: Object.freeze(redirectCount === 1 ? [302, 200] : [200]),
      tlsAuthorizedAtEveryHop: true,
      finalBodyTruncated: false,
      finalBodyByteLength: bodyByteLength,
      rawTargetsProjected: false,
      signedRedirectQueryProjected: false,
      userSuppliedCredentialForwarded: false,
      authorizationHeaderForwarded: ["NEON_PUBLIC_DATA_API", "NEON_PUBLIC_JSON_FUNCTION"].includes(policyName),
      ...(["NEON_PUBLIC_DATA_API", "NEON_PUBLIC_JSON_FUNCTION"].includes(policyName) ? { publicAnonymousTokenForwarded: true, ownerCredentialsForwarded: false } : {}),
      providerIssuedSignedRedirectCapabilityObservedAndForwarded:
        redirectCount === 1,
      providerIssuedSignedRedirectCapabilityPersistedLocally: false,
    }),
  });
}

function sameCanonical(left, right) {
  try { return canonicalizeStrict(left) === canonicalizeStrict(right); }
  catch { return false; }
}

export function createGlobalpingExactHttpObserverV2(config = {}) {
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
  const requestTimeoutMs = config.requestTimeoutMs
    ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (typeof fetchImpl !== "function" || typeof wait !== "function"
    || typeof now !== "function" || !Number.isSafeInteger(pollIntervalMs)
    || pollIntervalMs < 0 || pollIntervalMs > 10_000
    || !Number.isSafeInteger(maximumPolls) || maximumPolls < 1
    || maximumPolls > 240 || !Number.isSafeInteger(requestTimeoutMs)
    || requestTimeoutMs < 1
    || requestTimeoutMs > MAX_REQUEST_TIMEOUT_MS) fail("CONFIG_INVALID");
  async function observe(input = {}) {
    if (typeof input.operationId !== "string"
      || !OPERATION_ID.test(input.operationId)) fail("OPERATION_ID_INVALID");
    const route = initialTarget(input.targetUrl);
    const initial = route.url;
    const policyHash = digest(route.policy.schema, route.policy);
    const initialTargetHash = digest(
      "outsider/globalping-target/v2", initial.href);
    const file = eventFile(directory, input.operationId);
    const releaseOperationLock = acquireOperationLock(file);
    try {
      const events = readEvents(file);
      const prepared = events.find((event) => event.eventType === "PREPARED");
      if (prepared !== undefined
        && (prepared.payload?.initialTargetHash !== initialTargetHash
          || prepared.payload?.policyHash !== policyHash)) {
        fail("OPERATION_TARGET_OR_POLICY_MISMATCH");
      }
      if (!prepared) appendEvent(file, events, "PREPARED", {
        initialTargetHash,
        policyHash,
        maximumRedirects: route.maximumRedirects,
      }, now);

      const completedAtEntry = events.find((event) =>
        event.eventType === "FINISHED");
      if (completedAtEntry) {
        const observedHops = events.filter((event) =>
          event.eventType === "HOP_OBSERVED");
        if (observedHops.length !== route.maximumRedirects + 1) {
          fail("JOURNAL_FINAL_MISMATCH");
        }
        const first = oneHopEvent(events, "HOP_MEASUREMENT_CREATED", 0);
        const last = oneHopEvent(events, "HOP_MEASUREMENT_CREATED",
          route.maximumRedirects);
        const finalHop = oneHopEvent(events, "HOP_OBSERVED",
          route.maximumRedirects);
        const redirectHop = route.maximumRedirects === 1
          ? oneHopEvent(events, "HOP_OBSERVED", 0) : null;
        const measurementIds = route.maximumRedirects === 0
          ? [last?.payload?.measurementId]
          : [first?.payload?.measurementId, last?.payload?.measurementId];
        if (measurementIds.some((value) => typeof value !== "string"
          || !MEASUREMENT_ID.test(value))
          || finalHop?.payload?.status !== 200
          || typeof finalHop.payload?.bodyHash !== "string"
          || !HASH.test(finalHop.payload.bodyHash)
          || typeof finalHop.payload?.probeBindingHash !== "string"
          || !HASH.test(finalHop.payload.probeBindingHash)
          || !Number.isSafeInteger(finalHop.payload?.bodyByteLength)
          || finalHop.payload.bodyByteLength < 0
          || (route.maximumRedirects === 1
            && (redirectHop?.payload?.status !== 302
              || redirectHop.payload?.probeBindingHash
                !== finalHop.payload.probeBindingHash
              || typeof redirectHop.payload?.nextTargetHash !== "string"
              || !HASH.test(redirectHop.payload.nextTargetHash)))) {
          fail("JOURNAL_FINAL_MISMATCH");
        }
        const rebuilt = publicObservation(route.policyName, policyHash,
          initialTargetHash,
          redirectHop?.payload?.nextTargetHash ?? null,
          measurementIds, finalHop.payload.probeBindingHash,
          finalHop.payload.bodyHash, finalHop.payload.bodyByteLength, finalHop.payload.canonicalJsonHash, finalHop.payload.publicAvailability);
        if (!sameCanonical(completedAtEntry.payload?.observation, rebuilt)) {
          fail("JOURNAL_FINAL_MISMATCH");
        }
        return Object.freeze(completedAtEntry.payload.observation);
      }

      let currentTarget = initial;
      let firstMeasurementId = null;
      let firstProbeBindingHash = null;
      let redirectTargetHash = null;
      let final = null;

      for (let hopIndex = 0; hopIndex <= route.maximumRedirects;
        hopIndex += 1) {
        const targetHash = digest(
          "outsider/globalping-target/v2", currentTarget.href);
        const submitting = oneHopEvent(events,
          "HOP_CREATE_SUBMITTING", hopIndex);
        let created = oneHopEvent(events, "HOP_MEASUREMENT_CREATED", hopIndex);
        let observed = oneHopEvent(events, "HOP_OBSERVED", hopIndex);
        let recoveredRedirectTarget = null;
        if (created && (!submitting
          || created.sequence <= submitting.sequence
          || created.payload?.targetHash !== targetHash)) {
          fail("JOURNAL_TRANSITION_INVALID");
        }
        if (observed && (!created || observed.sequence <= created.sequence
          || observed.payload?.targetHash !== targetHash
          || observed.payload?.measurementId !== created.payload.measurementId)) {
          fail("JOURNAL_TRANSITION_INVALID");
        }

        if (!created) {
          if (submitting) fail("CREATE_COMMIT_AMBIGUOUS_NO_RETRY");
          let publicAnonymousToken;
          if (route.anonymousTokenUrl) {
            const tokenResponse = await fetchImpl(route.anonymousTokenUrl, { method: "GET", headers: { accept: "application/json" },
              redirect: "error", signal: AbortSignal.timeout(requestTimeoutMs) });
            const guest = await tokenResponse.json();
            let claims; try { claims = JSON.parse(Buffer.from(guest.token.split(".")[1], "base64url")); } catch {}
            if (!tokenResponse.ok || typeof guest.token !== "string" || guest.token.length > 8192 || claims?.role !== "anonymous")
              fail("PUBLIC_ANONYMOUS_TOKEN_UNAVAILABLE");
            publicAnonymousToken = guest.token;
          }
          const request = measurementRequest(currentTarget, hopIndex,
            firstMeasurementId, publicAnonymousToken);
          appendEvent(file, events, "HOP_CREATE_SUBMITTING", {
            hopIndex,
            targetHash,
            requestHash: digest(
              "outsider/globalping-create-request/v2", request),
          }, now);
          let exchange;
          try {
            exchange = await providerExchange(fetchImpl, requestTimeoutMs,
              `${API_ORIGIN}/v1/measurements`, {
              method: "POST",
              headers: {
                accept: "application/json",
                "content-type": "application/json",
                "user-agent": "outsider-outcome-formation/2",
              },
              body: canonicalizeStrict(request),
              redirect: "error",
            }, "CREATE_REQUEST_TIMEOUT");
          } catch { fail("CREATE_COMMIT_AMBIGUOUS_NO_RETRY"); }
          const { response, captured } = exchange;
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
          appendEvent(file, events, "HOP_MEASUREMENT_CREATED", {
            hopIndex,
            targetHash,
            measurementId,
            providerResponseHash: captured.responseHash,
          }, now);
          created = events.at(-1);
        }

        const measurementId = created.payload.measurementId;
        if (!MEASUREMENT_ID.test(measurementId)) {
          fail("JOURNAL_TRANSITION_INVALID");
        }
        if (!observed) {
          for (let index = 0; index < maximumPolls; index += 1) {
            const { response, captured } = await providerExchange(
              fetchImpl, requestTimeoutMs,
              `${API_ORIGIN}/v1/measurements/${
                encodeURIComponent(measurementId)}`, {
                method: "GET",
                headers: {
                  accept: "application/json",
                  "user-agent": "outsider-outcome-formation/2",
                },
                redirect: "error",
              }, "MEASUREMENT_READ_TIMEOUT");
            if (response.status !== 200) fail("MEASUREMENT_READ_REJECTED");
            if (captured.value?.status === "finished") {
              if (hopIndex < route.maximumRedirects) {
                const result = redirectObservation(captured.value,
                  measurementId, currentTarget.hostname, now());
                recoveredRedirectTarget = redirectTarget(result.nextTargetUrl);
                appendEvent(file, events, "HOP_OBSERVED", {
                  hopIndex,
                  targetHash,
                  measurementId,
                  providerResponseHash: captured.responseHash,
                  status: result.status,
                  probeBindingHash: result.probeBindingHash,
                  nextTargetHash: result.nextTargetHash,
                  tlsAuthorized: true,
                  bodyTruncated: false,
                }, now);
              } else {
                const result = finalObservation(captured.value,
                  measurementId, currentTarget.hostname,
                  firstProbeBindingHash, route.canonicalJson === true || route.policyName === "NEON_PUBLIC_DATA_API", route.policyName === "CALCOM_PUBLIC_AVAILABILITY");
                appendEvent(file, events, "HOP_OBSERVED", {
                  hopIndex,
                  targetHash,
                  measurementId,
                  providerResponseHash: captured.responseHash,
                  status: result.status,
                  probeBindingHash: result.probeBindingHash,
                  bodyHash: result.bodyHash,
                  bodyByteLength: result.bodyByteLength,
                  ...(result.canonicalJsonHash ? { canonicalJsonHash: result.canonicalJsonHash } : {}),
                  ...(result.publicAvailability ? { publicAvailability: result.publicAvailability } : {}),
                  tlsAuthorized: true,
                  bodyTruncated: false,
                }, now);
              }
              observed = events.at(-1);
              break;
            }
            if (captured.value?.status !== "in-progress") {
              fail("MEASUREMENT_TERMINAL_WITHOUT_RESULT");
            }
            if (index + 1 < maximumPolls) await wait(pollIntervalMs);
          }
          if (!observed) fail("MEASUREMENT_TIMEOUT");
        }

        if (hopIndex < route.maximumRedirects) {
          if (observed.payload?.status !== 302
            || typeof observed.payload?.nextTargetHash !== "string"
            || !HASH.test(observed.payload.nextTargetHash)
            || typeof observed.payload?.probeBindingHash !== "string"
            || !HASH.test(observed.payload.probeBindingHash)) {
            fail("JOURNAL_TRANSITION_INVALID");
          }
          if (recoveredRedirectTarget === null) {
            const { response, captured } = await providerExchange(
              fetchImpl, requestTimeoutMs,
              `${API_ORIGIN}/v1/measurements/${
                encodeURIComponent(measurementId)}`, {
                method: "GET",
                headers: {
                  accept: "application/json",
                  "user-agent": "outsider-outcome-formation/2",
                },
                redirect: "error",
              }, "REDIRECT_REPLAY_TIMEOUT");
            if (response.status !== 200
              || captured.value?.status !== "finished") {
              fail("REDIRECT_REPLAY_UNAVAILABLE");
            }
            const replayed = redirectObservation(captured.value,
              measurementId, currentTarget.hostname, now());
            if (replayed.probeBindingHash
              !== observed.payload.probeBindingHash
              || replayed.nextTargetHash
                !== observed.payload.nextTargetHash) {
              fail("REDIRECT_REPLAY_MISMATCH");
            }
            recoveredRedirectTarget = redirectTarget(replayed.nextTargetUrl);
          }
          const next = recoveredRedirectTarget;
          const expectedNextHash = digest(
            "outsider/globalping-target/v2", next.href);
          if (observed.payload.nextTargetHash !== expectedNextHash) {
            fail("JOURNAL_REDIRECT_HASH_MISMATCH");
          }
          firstMeasurementId = measurementId;
          firstProbeBindingHash = observed.payload.probeBindingHash;
          redirectTargetHash = expectedNextHash;
          currentTarget = next;
        } else {
          if (observed.payload?.status !== 200
            || (route.maximumRedirects > 0
              && observed.payload?.probeBindingHash
                !== firstProbeBindingHash)
            || typeof observed.payload?.bodyHash !== "string"
            || !HASH.test(observed.payload.bodyHash)
            || !Number.isSafeInteger(observed.payload.bodyByteLength)
            || observed.payload.bodyByteLength < 0) {
            fail("JOURNAL_TRANSITION_INVALID");
          }
          const measurementIds = route.maximumRedirects === 0
            ? [measurementId] : [firstMeasurementId, measurementId];
          final = publicObservation(route.policyName, policyHash,
            initialTargetHash, redirectTargetHash, measurementIds,
            observed.payload.probeBindingHash, observed.payload.bodyHash,
            observed.payload.bodyByteLength, observed.payload.canonicalJsonHash, observed.payload.publicAvailability);
        }
      }

      const completed = events.find((event) => event.eventType === "FINISHED");
      if (completed) {
        if (!sameCanonical(completed.payload?.observation, final)) {
          fail("JOURNAL_FINAL_MISMATCH");
        }
        return Object.freeze(completed.payload.observation);
      }
      appendEvent(file, events, "FINISHED", { observation: final }, now);
      return final;
    } finally {
      releaseOperationLock();
    }
  }

  // A cached observation keeps its original collection interval. Reading this
  // metadata never starts a probe or replaces an old observation time with now.
  function timing({ operationId: id } = {}) {
    if (typeof id !== "string" || !OPERATION_ID.test(id)) fail("OPERATION_ID_INVALID");
    const events = readEvents(eventFile(directory, id));
    const finished = events.find(event => event.eventType === "FINISHED");
    if (!finished) return null;
    const first = events.find(event => event.eventType === "HOP_CREATE_SUBMITTING");
    const last = events.filter(event => event.eventType === "HOP_OBSERVED").at(-1);
    const stamps = [first?.recordedAt, last?.recordedAt, finished.recordedAt];
    if (stamps.some(value => typeof value !== "string" || !Number.isFinite(Date.parse(value))
      || new Date(value).toISOString() !== value)
      || Date.parse(stamps[0]) > Date.parse(stamps[1]) || Date.parse(stamps[1]) > Date.parse(stamps[2])
      || last?.payload?.status !== 200 || last.payload.bodyHash !== finished.payload?.observation?.bodyHash)
      fail("JOURNAL_TIMING_INVALID");
    return Object.freeze({ schema: "outsider/globalping-observation-timing/v1",
      observationStartedAt: stamps[0], observedAt: stamps[1], recordedAt: stamps[2],
      observationHash: sha256(Buffer.from(canonicalizeStrict(finished.payload.observation), "utf8")),
      journalEventHash: finished.eventHash,
      source: "LOCAL_RECORDED_EXTERNAL_MEASUREMENT_INTERVAL", providerSignedTime: false });
  }

  return Object.freeze({
    providerRef: "globalping-public-api-v1-redirect-aware-v2",
    supportedPolicySetHash: digest(
      "outsider/globalping-exact-observer-policy-set/v2",
      [GITHUB_POLICY, WORKERS_POLICY, NEON_PUBLIC_POLICY, CALCOM_AVAILABILITY_POLICY]),
    observe, timing,
  });
}
