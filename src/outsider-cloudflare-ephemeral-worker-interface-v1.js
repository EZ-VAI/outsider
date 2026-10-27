/*
 * Outcome Formation Engine: user-held Cloudflare ephemeral Worker interface.
 *
 * A random, order-scoped Worker is admitted without listing or reading any
 * other Worker.  Live methods are explicit and default-off.  Upload, workers.dev
 * enablement, and deletion are separate one-use effects in the existing durable
 * endpoint-effect ledger.  Ambiguous writes are never retried; only exact-name
 * reads may reconcile them.  Provider acknowledgements and the provider-hosted
 * workers.dev observation remain HOLD evidence, never authority or independent
 * outcome truth.
 */

import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
} from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const CLOUDFLARE_ORIGIN = "https://api.cloudflare.com";
const API_PREFIX = "/client/v4";
const SCRIPT_PREFIX = "outsider-proof-";
const MAIN_MODULE = "worker.mjs";
const COMPATIBILITY_DATE = "2026-09-03";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MAX_POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 60_000;
const MAX_POLL_ATTEMPTS = 64;
const MAX_API_RESPONSE_BYTES = 512 * 1024;
const MAX_PUBLIC_RESPONSE_BYTES = 4 * 1024;
const PREFIX = "OUTSIDER_CLOUDFLARE_EPHEMERAL_WORKER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ACCOUNT_ID = /^[a-f0-9]{32}$/u;
const API_TOKEN = /^[A-Za-z0-9._~-]{20,512}$/u;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const LEDGER_ID = /^ledger_[a-f0-9]{32}$/u;
const PRIVATE_NONCE = /^[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

const Fetch = globalThis.fetch;
const DateNow = Date.now;
const CAPABILITIES = new WeakMap();
const LEASES = new WeakMap();
const HANDOFFS = new WeakMap();
const DRIVERS = new WeakMap();
const ISSUED_NAMES = new Set();

export const OUTSIDER_CLOUDFLARE_EPHEMERAL_WORKER_V1_SCHEMAS
  = Object.freeze({
    publicPreflight:
      "outsider/cloudflare-ephemeral-worker-public-preflight/v1",
    response: "outsider/cloudflare-ephemeral-worker-proof-response/v1",
    effectProjection:
      "outsider/cloudflare-ephemeral-worker-effect-projection/v1",
  });

export const OUTSIDER_CLOUDFLARE_EPHEMERAL_WORKER_V1_BOUNDARY = deepFreeze({
  position: "USER_HELD_EPHEMERAL_WORKER_EFFECT_PATH_HOLD",
  fixedApiOrigin: CLOUDFLARE_ORIGIN,
  fixedPublicHostnameSuffix: ".workers.dev",
  arbitraryUrlAccepted: false,
  callerTransportCallbackAccepted: false,
  browserSessionAccepted: false,
  wranglerOauthUsed: false,
  existingWorkersListed: false,
  existingWorkerContentRead: false,
  exactRandomScriptNameOnly: true,
  scriptNameEntropyBits: 128,
  providerConditionalCreateAvailable: false,
  preflightToUploadNameRaceCryptographicallyEliminated: false,
  uploadMaximumAttempts: 1,
  subdomainEnableMaximumAttempts: 1,
  deleteMaximumAttempts: 1,
  automaticWriteRetryPermitted: false,
  exactReadOnlyReconciliationOnly: true,
  uploadMustPrecedePublicWitness: true,
  publicResponseCacheControl: "no-store",
  publicResponseContainsOnlySchemaVersionAndOutcomeHash: true,
  providerUploadAcknowledgementIsOutcomeTruth: false,
  providerDeleteAcknowledgementIsRecoveryTruth: false,
  workersDevObservationIsIndependentOfProvider: false,
  durableOneUseEndpointLedgerReused: true,
  secondEffectLedgerCreated: false,
  processRestartSecretCapabilityRecoveryImplemented: false,
  apiTokenProjected: false,
  accountIdProjected: false,
  workersDevSubdomainProjected: false,
  scriptNameProjected: false,
  publicUrlProjected: false,
  resourceOwnerAuthorityEstablished: false,
  providerAcceptanceEstablished: false,
  offerEstablished: false,
  capacityEstablished: false,
  capacityReserved: false,
  priceEstablished: false,
  guaranteeEstablished: false,
  settlementPermitted: false,
  decisionState: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
});

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value);
    }
  }
  return Object.freeze(value);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function byteHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function checkedHash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function checkedInstant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function nowInstant() {
  const now = DateNow();
  if (!Number.isSafeInteger(now)) fail("CLOCK_INVALID");
  return new Date(now).toISOString();
}

function opaqueCapability() {
  return Object.freeze(Object.create(null));
}

function fixedApiUrl(path) {
  const url = new URL(path, CLOUDFLARE_ORIGIN);
  if (url.origin !== CLOUDFLARE_ORIGIN
    || !url.pathname.startsWith(API_PREFIX)) fail("FIXED_API_ORIGIN_FAILED");
  return url.href;
}

function issueScriptName() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entropy = randomBytes(16).toString("hex");
    if (!ISSUED_NAMES.has(entropy)) {
      ISSUED_NAMES.add(entropy);
      return `${SCRIPT_PREFIX}${entropy}`;
    }
  }
  fail("SCRIPT_NAME_ENTROPY_EXHAUSTED");
}

function verifiedTender(tender, expectedTenderHash) {
  checkedHash(expectedTenderHash, "EXPECTED_TENDER_HASH");
  const checked = verifyOutsiderOutcomeTenderV1(tender, {
    expectedTenderHash,
  });
  if (checked.ok !== true || checked.structuralTenderVerified !== true
    || checked.derivationVerified !== true || checked.selfHashVerified !== true
    || checked.expectedHashMatched !== true
    || checked.zeroInternalOpsVerified !== true
    || tender.tenderHash !== expectedTenderHash
    || tender.zeroInternalOps.outsiderStaffInterventionsAllowed !== 0
    || tender.zeroInternalOps.invariantSatisfied !== true
    || tender.zeroInternalOps.humanQueueFallbackAllowed !== false) {
    fail("TENDER_SOURCE_REPLAY_FAILED");
  }
  return tender;
}

function publicResponse(outcomeHash) {
  const value = {
    schema: OUTSIDER_CLOUDFLARE_EPHEMERAL_WORKER_V1_SCHEMAS.response,
    schemaVersion: "1.0.0",
    exactOutcomeHash: outcomeHash,
  };
  return Buffer.from(canonicalizeStrict(value), "utf8");
}

function workerModuleSource(responseBytes) {
  const literal = JSON.stringify(responseBytes.toString("utf8"));
  return Buffer.from([
    `const RESPONSE_BODY=${literal};`,
    "export default {",
    "fetch() {",
    "return new Response(RESPONSE_BODY,{status:200,headers:{",
    '"content-type":"application/json",',
    '"cache-control":"no-store"',
    "}});",
    "}",
    "};",
    "",
  ].join("\n"), "utf8");
}

function multipartUpload(moduleBytes, boundary) {
  const metadata = canonicalizeStrict({
    main_module: MAIN_MODULE,
    compatibility_date: COMPATIBILITY_DATE,
  });
  const parts = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="metadata"\r\n',
    "Content-Type: application/json\r\n\r\n",
    `${metadata}\r\n`,
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="${MAIN_MODULE}"; filename="${MAIN_MODULE}"\r\n`,
    "Content-Type: application/javascript+module\r\n\r\n",
    moduleBytes,
    "\r\n",
    `--${boundary}--\r\n`,
  ];
  return Buffer.concat(parts.map((part) => Buffer.isBuffer(part)
    ? part : Buffer.from(part, "utf8")));
}

function publicWorkerUrl(accountSubdomain, scriptName) {
  const url = new URL(`https://${scriptName}.${accountSubdomain}.workers.dev/`);
  if (url.protocol !== "https:" || url.pathname !== "/"
    || url.username !== "" || url.password !== "" || url.port !== ""
    || url.hostname !== `${scriptName}.${accountSubdomain}.workers.dev`) {
    fail("FIXED_WORKERS_DEV_URL_FAILED");
  }
  return url.href;
}

async function boundedBytes(response, limit, controller) {
  if (!response?.body || typeof response.body.getReader !== "function") {
    return null;
  }
  const declared = response.headers?.get?.("content-length");
  if (declared !== null && declared !== undefined && declared !== "") {
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limit) return null;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    if (!(part.value instanceof Uint8Array)) return null;
    total += part.value.byteLength;
    if (total > limit) {
      controller.abort();
      try { await reader.cancel(); } catch { /* fail closed */ }
      return null;
    }
    chunks.push(Buffer.from(part.value));
  }
  return Buffer.concat(chunks, total);
}

function jsonFromBytes(bytes) {
  if (bytes === null) return null;
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { return null; }
}

async function exchange(url, request, timeoutMs, limit, readBody = true) {
  if (typeof Fetch !== "function") {
    return { contacted: false, status: 0, timedOut: false,
      headers: null, bytes: null, json: null };
  }
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ contacted: true, status: 0, timedOut: true,
        headers: null, bytes: null, json: null });
    }, timeoutMs);
  });
  const work = (async () => {
    try {
      const response = await Fetch(url, {
        ...request,
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        return { contacted: true, status: response.status, timedOut: false,
          headers: response.headers, bytes: null, json: null };
      }
      if (!readBody) {
        try { await response.body?.cancel?.(); } catch { /* status is enough */ }
        return { contacted: true, status: response.status, timedOut: false,
          headers: response.headers, bytes: null, json: null };
      }
      const bytes = await boundedBytes(response, limit, controller);
      return { contacted: true, status: response.status, timedOut: false,
        headers: response.headers, bytes, json: jsonFromBytes(bytes) };
    } catch {
      return { contacted: true, status: 0, timedOut: false,
        headers: null, bytes: null, json: null };
    }
  })();
  const result = await Promise.race([work, timeout]);
  clearTimeout(timer);
  return result;
}

function apiHeaders(credential, body = null, contentType = null,
  apiDate = false) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${credential.apiToken}`,
  };
  if (body !== null) {
    headers["content-type"] = contentType;
    headers["content-length"] = String(body.length);
  }
  if (apiDate) {
    headers["Cloudflare-Workers-Script-Api-Date"] = "2025-08-01";
  }
  return Object.freeze(headers);
}

function normalizePreflight(input, timeoutMs) {
  exactObject(input, ["credentialCapability", "tender",
    "expectedTenderHash", "publicOutcomeCommitmentHash", "uploadDeadline",
    "witnessDeadline", "deleteDeadline"], "PREFLIGHT_INPUT");
  const credential = CAPABILITIES.get(input.credentialCapability);
  if (credential === undefined) fail("CAPABILITY_NOT_MODULE_ISSUED");
  const tender = verifiedTender(input.tender, input.expectedTenderHash);
  checkedHash(input.publicOutcomeCommitmentHash,
    "PUBLIC_OUTCOME_COMMITMENT_HASH");
  if (input.publicOutcomeCommitmentHash
    !== tender.exactOutcome.exactOutcomeHash) {
    fail("OUTCOME_COMMITMENT_HASH_MISMATCH");
  }
  const uploadDeadline = checkedInstant(input.uploadDeadline,
    "UPLOAD_DEADLINE");
  const witnessDeadline = checkedInstant(input.witnessDeadline,
    "WITNESS_DEADLINE");
  const deleteDeadline = checkedInstant(input.deleteDeadline,
    "DELETE_DEADLINE");
  const now = DateNow();
  if (now < Date.parse(tender.compiledAt)
    || now >= Date.parse(uploadDeadline)
    || Date.parse(uploadDeadline) > Date.parse(tender.formationDeadline)
    || Date.parse(witnessDeadline) <= Date.parse(uploadDeadline)
    || Date.parse(deleteDeadline) <= Date.parse(witnessDeadline)
    || Date.parse(deleteDeadline) > Date.parse(tender.exactOutcome.deadline)) {
    fail("DEADLINE_ORDER_OR_WINDOW_INVALID");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1
    || timeoutMs > MAX_TIMEOUT_MS) fail("TIMEOUT_INVALID");
  return { credentialCapability: input.credentialCapability, credential,
    tender, outcomeHash: input.publicOutcomeCommitmentHash,
    uploadDeadline, witnessDeadline, deleteDeadline, timeoutMs };
}

function preflightProjection(normalized, status, failureCode,
  attempts, leaseAvailable) {
  const body = {
    schema:
      OUTSIDER_CLOUDFLARE_EPHEMERAL_WORKER_V1_SCHEMAS.publicPreflight,
    schemaVersion: "1.0.0",
    recordClass: "CLOUDFLARE_EPHEMERAL_WORKER_PREFLIGHT",
    status,
    phase: status === "SUCCEEDED"
      ? "ACCESS_AUTHENTICATED_INTERFACE_DESCRIBED" : "HOLD",
    failureCode,
    tenderHash: normalized.tender.tenderHash,
    publicOutcomeCommitmentHash: normalized.outcomeHash,
    uploadDeadline: normalized.uploadDeadline,
    witnessDeadline: normalized.witnessDeadline,
    deleteDeadline: normalized.deleteDeadline,
    requestAttemptCount: attempts,
    exactAccountSubdomainMatched: status === "SUCCEEDED",
    exactRandomScriptNameAbsent: status === "SUCCEEDED",
    existingWorkersListed: false,
    existingWorkerContentRead: false,
    describedInterfaceLeaseAvailable: leaseAvailable,
    apiTokenProjected: false,
    accountIdProjected: false,
    workersDevSubdomainProjected: false,
    scriptNameProjected: false,
    publicUrlProjected: false,
    offerEstablished: false,
    capacityReserved: false,
    resourceOwnerAuthorityEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return deepFreeze({ ...body, projectionHash: digest(
    OUTSIDER_CLOUDFLARE_EPHEMERAL_WORKER_V1_SCHEMAS.publicPreflight, body) });
}

/** Seal token/account/subdomain in process-local state. */
export function sealCloudflareEphemeralWorkerCapabilityV1(input = {}) {
  exactObject(input, ["apiToken", "accountId", "workersDevSubdomain"],
    "CAPABILITY_INPUT");
  if (typeof input.apiToken !== "string" || !API_TOKEN.test(input.apiToken)
    || typeof input.accountId !== "string" || !ACCOUNT_ID.test(input.accountId)
    || typeof input.workersDevSubdomain !== "string"
    || !DNS_LABEL.test(input.workersDevSubdomain)) {
    fail("CAPABILITY_FIELDS_INVALID");
  }
  const capability = opaqueCapability();
  CAPABILITIES.set(capability, {
    apiToken: input.apiToken,
    accountId: input.accountId,
    workersDevSubdomain: input.workersDevSubdomain,
  });
  return capability;
}

/** Three fixed GETs; never lists scripts and never consumes script content. */
export async function preflightCloudflareEphemeralWorkerV1(input,
  options = { timeoutMs: DEFAULT_TIMEOUT_MS }) {
  exactObject(options, ["timeoutMs"], "PREFLIGHT_OPTIONS");
  const normalized = normalizePreflight(input, options.timeoutMs);
  const scriptName = issueScriptName();
  const workerUrl = publicWorkerUrl(
    normalized.credential.workersDevSubdomain, scriptName);
  let attempts = 0;
  const run = async (path, readBody = true) => {
    attempts += 1;
    return exchange(fixedApiUrl(path), {
      method: "GET", headers: apiHeaders(normalized.credential),
    }, normalized.timeoutMs, MAX_API_RESPONSE_BYTES, readBody);
  };
  const tokenVerificationPath = normalized.credential.apiToken.startsWith("cfat_")
    ? `${API_PREFIX}/accounts/${normalized.credential.accountId}/tokens/verify`
    : `${API_PREFIX}/user/tokens/verify`;
  const token = await run(tokenVerificationPath);
  if (token.status !== 200 || token.json?.success !== true
    || token.json?.result?.status !== "active") {
    return Object.freeze({ publicProjection: preflightProjection(normalized,
      "FAILED", "TOKEN_NOT_ACTIVE_OR_UNREADABLE", attempts, false) });
  }
  const subdomain = await run(
    `${API_PREFIX}/accounts/${normalized.credential.accountId}/workers/subdomain`);
  if (subdomain.status !== 200 || subdomain.json?.success !== true
    || subdomain.json?.result?.subdomain
      !== normalized.credential.workersDevSubdomain) {
    return Object.freeze({ publicProjection: preflightProjection(normalized,
      "FAILED", "EXACT_ACCOUNT_SUBDOMAIN_MISMATCH", attempts, false) });
  }
  const collision = await run(
    `${API_PREFIX}/accounts/${normalized.credential.accountId}/workers/scripts/${scriptName}/subdomain`,
    false);
  if (collision.status !== 404) {
    return Object.freeze({ publicProjection: preflightProjection(normalized,
      "FAILED", collision.status === 200 ? "SCRIPT_NAME_COLLISION"
        : "SCRIPT_ABSENCE_NOT_PROVEN", attempts, false) });
  }
  if (DateNow() >= Date.parse(normalized.uploadDeadline)) {
    return Object.freeze({ publicProjection: preflightProjection(normalized,
      "FAILED", "LEASE_EXPIRED_AFTER_PREFLIGHT", attempts, false) });
  }
  const result = Object.freeze({ publicProjection: preflightProjection(
    normalized, "SUCCEEDED", null, attempts, true) });
  LEASES.set(result, {
    credentialCapability: normalized.credentialCapability,
    tenderHash: normalized.tender.tenderHash,
    outcomeHash: normalized.outcomeHash,
    scriptName,
    workerUrl,
    uploadDeadline: normalized.uploadDeadline,
    witnessDeadline: normalized.witnessDeadline,
    deleteDeadline: normalized.deleteDeadline,
    claimed: false,
    consumed: false,
  });
  return result;
}

export function claimCloudflareEphemeralWorkerLeaseV1(result, input = {}) {
  exactObject(input, ["tender", "expectedTenderHash"], "LEASE_CLAIM_INPUT");
  const lease = LEASES.get(result);
  if (lease === undefined) fail("LEASE_NOT_MODULE_ISSUED");
  const tender = verifiedTender(input.tender, input.expectedTenderHash);
  if (tender.tenderHash !== lease.tenderHash) fail("LEASE_TENDER_MISMATCH");
  if (lease.claimed) fail("LEASE_ALREADY_CLAIMED");
  if (DateNow() >= Date.parse(lease.uploadDeadline)) fail("LEASE_EXPIRED");
  lease.claimed = true;
  const handoff = opaqueCapability();
  HANDOFFS.set(handoff, lease);
  return handoff;
}

function operationBinding(state, operation, method, path, bodyBytes,
  deadline) {
  return {
    operation,
    effectIdHash: digest(
      `outsider/cloudflare-ephemeral-worker-${operation.toLowerCase()}-effect/v1`, {
        transactionBindingHash: state.transactionBindingHash, method, path,
      }),
    transactionBindingHash: state.transactionBindingHash,
    endpointBindingHash: digest(
      "outsider/cloudflare-ephemeral-worker-fixed-endpoint/v1", {
        origin: CLOUDFLARE_ORIGIN, method, path,
      }),
    adapterInstanceRefHash: state.adapterInstanceRefHash,
    permissionGrantHash: state.permissionGrantHash,
    oneUseNonceHash: digest(
      `outsider/cloudflare-ephemeral-worker-${operation.toLowerCase()}-nonce/v1`,
      randomBytes(32).toString("hex")),
    idempotencyKeyHash: digest(
      `outsider/cloudflare-ephemeral-worker-${operation.toLowerCase()}-local-key/v1`,
      randomBytes(32).toString("hex")),
    bodyHash: bodyBytes === null
      ? digest("outsider/cloudflare-ephemeral-worker-empty-body/v1", { path })
      : byteHash(bodyBytes),
    effectDeadline: deadline,
    method,
    path,
    bodyBytes,
    currentEvent: null,
  };
}

function makeEvent(state, binding, eventType, receiptHash = null,
  terminalEvidenceHash = null) {
  return createDurableOneUseEndpointEffectEventV1({
    ledgerId: state.ledgerId,
    eventType,
    effectIdHash: binding.effectIdHash,
    transactionBindingHash: binding.transactionBindingHash,
    endpointBindingHash: binding.endpointBindingHash,
    adapterInstanceRefHash: binding.adapterInstanceRefHash,
    permissionGrantHash: binding.permissionGrantHash,
    oneUseNonceHash: binding.oneUseNonceHash,
    idempotencyKeyHash: binding.idempotencyKeyHash,
    bodyHash: binding.bodyHash,
    effectDeadline: binding.effectDeadline,
    recordedAt: nowInstant(),
    previousEffectEventHash: binding.currentEvent?.eventHash ?? null,
    occurrenceNonceHash: digest(
      "outsider/cloudflare-ephemeral-worker-effect-occurrence/v1", {
        operation: binding.operation,
        eventType,
        entropy: randomBytes(32).toString("hex"),
      }),
    endpointReceiptHash: receiptHash,
    terminalEvidenceHash,
  });
}

function appendEvent(state, binding, type, receiptHash = null) {
  const event = makeEvent(state, binding, type, receiptHash);
  const verification = appendDurableOneUseEndpointEffectLedgerV1({
    directory: state.ledgerDirectory,
    ledgerId: state.ledgerId,
    event,
    expectedLocalHeadHash: state.verification.head.headHash,
  });
  binding.currentEvent = event;
  state.verification = verification;
}

function projection(state, stage, io = {}) {
  const transitions = state.verification.head.transitionCounts;
  const body = {
    schema:
      OUTSIDER_CLOUDFLARE_EPHEMERAL_WORKER_V1_SCHEMAS.effectProjection,
    schemaVersion: "1.0.0",
    recordClass: "CLOUDFLARE_EPHEMERAL_WORKER_ONE_USE_EFFECT",
    stage,
    planHash: state.planHash,
    tenderHash: state.lease.tenderHash,
    publicOutcomeCommitmentHash: state.lease.outcomeHash,
    publicResponseBodyHash: byteHash(state.responseBytes),
    uploadDeadline: state.lease.uploadDeadline,
    witnessDeadline: state.lease.witnessDeadline,
    deleteDeadline: state.lease.deleteDeadline,
    durableOccurrenceCount: state.verification.head.exactOccurrenceCount,
    totalSubmitAttemptOccurrenceCount: transitions.SUBMIT_ATTEMPTED,
    totalProviderReceiptOccurrenceCount: transitions.ENDPOINT_RECEIPT_OBSERVED,
    apiPutPerformedByThisCall: io.put === true,
    apiPostSubdomainPerformedByThisCall: io.enable === true,
    apiDeletePerformedByThisCall: io.delete === true,
    exactApiGetReconcilePerformedByThisCall: io.reconcile === true,
    workersDevGetPerformedByThisCall: io.witness === true,
    networkIoPerformedByThisCall: io.network === true,
    uploadProviderReceiptObserved: state.uploadReceipt,
    subdomainEnableProviderReceiptObserved: state.enableReceipt,
    publicEffectObservedAtWorkersDev: state.publicEffectObserved,
    publicEffectObservationEvidenceHash: state.publicEffectEvidenceHash,
    deleteProviderReceiptObserved: state.deleteReceipt,
    publicAbsenceObservedAtWorkersDev: state.publicAbsenceObserved,
    publicAbsenceObservationEvidenceHash: state.publicAbsenceEvidenceHash,
    providerAcknowledgementIsOutcomeTruth: false,
    workersDevObservationIsIndependentOutcomeTruth: false,
    providerDeleteAcknowledgementIsRecoveryTruth: false,
    workersDevAbsenceIsIndependentRecoveryTruth: false,
    uploadAutomaticRetryPerformed: false,
    subdomainEnableAutomaticRetryPerformed: false,
    deleteAutomaticRetryPerformed: false,
    existingWorkersListed: false,
    existingWorkerContentRead: false,
    apiTokenProjected: false,
    accountIdProjected: false,
    workersDevSubdomainProjected: false,
    scriptNameProjected: false,
    publicUrlProjected: false,
    privateBindingCommitmentHash: digest(
      "outsider/cloudflare-ephemeral-worker-private-binding/v1", {
        privateProjectionNonce: state.privateProjectionNonce,
        accountId: state.credential.accountId,
        scriptName: state.lease.scriptName,
        workerUrl: state.lease.workerUrl,
        localHeadHash: state.verification.head.headHash,
      }),
    callerAssertedPermissionGrantOnly: true,
    resourceOwnerAuthorityEstablished: false,
    providerAcceptanceEstablished: false,
    offerEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    userOutcomePromiseIssued: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    enabledCapabilities: [],
    provenAuthorityCapabilities: [],
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return deepFreeze({ ...body, projectionHash: digest(
    OUTSIDER_CLOUDFLARE_EPHEMERAL_WORKER_V1_SCHEMAS.effectProjection, body) });
}

function result(state, stage, io = {}) {
  return Object.freeze({ publicProjection: projection(state, stage, io) });
}

function checkedDriver(driver, input, code) {
  exactObject(input, ["expectedPlanHash"], code);
  const state = DRIVERS.get(driver);
  if (state === undefined) fail("DRIVER_NOT_MODULE_ISSUED");
  if (checkedHash(input.expectedPlanHash, "EXPECTED_PLAN_HASH")
    !== state.planHash) fail("PLAN_HASH_MISMATCH");
  return state;
}

function requestOptions(options) {
  exactObject(options, ["timeoutMs"], "REQUEST_OPTIONS");
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1
    || options.timeoutMs > MAX_TIMEOUT_MS) fail("TIMEOUT_INVALID");
  return options;
}

function pollOptions(options) {
  exactObject(options, ["requestTimeoutMs", "pollIntervalMs", "maxWaitMs"],
    "POLL_OPTIONS");
  if (!Number.isSafeInteger(options.requestTimeoutMs)
    || options.requestTimeoutMs < 1
    || options.requestTimeoutMs > MAX_TIMEOUT_MS
    || !Number.isSafeInteger(options.pollIntervalMs)
    || options.pollIntervalMs < 1
    || options.pollIntervalMs > MAX_POLL_INTERVAL_MS
    || !Number.isSafeInteger(options.maxWaitMs)
    || options.maxWaitMs < 1 || options.maxWaitMs > MAX_WAIT_MS) {
    fail("POLL_BOUNDS_INVALID");
  }
  return options;
}

/** Consume a handoff and admit the upload intent, without network I/O. */
export function createCloudflareEphemeralWorkerDriverV1(handoff, config = {}) {
  exactObject(config, ["ledgerDirectory", "ledgerId", "expectedTenderHash",
    "expectedOutcomeCommitmentHash", "adapterInstanceRefHash",
    "permissionGrantHash", "privateProjectionNonce"], "DRIVER_CONFIG");
  const lease = HANDOFFS.get(handoff);
  if (lease === undefined) fail("HANDOFF_NOT_MODULE_ISSUED");
  if (lease.consumed) fail("HANDOFF_ALREADY_CONSUMED");
  if (typeof config.ledgerDirectory !== "string"
    || !LEDGER_ID.test(config.ledgerId)
    || !PRIVATE_NONCE.test(config.privateProjectionNonce)) {
    fail("DRIVER_CONFIG_INVALID");
  }
  checkedHash(config.expectedTenderHash, "EXPECTED_TENDER_HASH");
  checkedHash(config.expectedOutcomeCommitmentHash,
    "EXPECTED_OUTCOME_COMMITMENT_HASH");
  checkedHash(config.adapterInstanceRefHash, "ADAPTER_INSTANCE_REF_HASH");
  checkedHash(config.permissionGrantHash, "PERMISSION_GRANT_HASH");
  if (config.expectedTenderHash !== lease.tenderHash
    || config.expectedOutcomeCommitmentHash !== lease.outcomeHash) {
    fail("HANDOFF_BINDING_MISMATCH");
  }
  if (DateNow() >= Date.parse(lease.uploadDeadline)) fail("HANDOFF_EXPIRED");
  const credential = CAPABILITIES.get(lease.credentialCapability);
  if (credential === undefined) fail("CREDENTIAL_CAPABILITY_LOST");
  const responseBytes = publicResponse(lease.outcomeHash);
  const moduleBytes = workerModuleSource(responseBytes);
  const multipartBoundary
    = `outsider-${randomBytes(24).toString("hex")}`;
  const uploadBytes = multipartUpload(moduleBytes, multipartBoundary);
  const scriptPath
    = `${API_PREFIX}/accounts/${credential.accountId}/workers/scripts/${lease.scriptName}`;
  const enableBytes = Buffer.from(canonicalizeStrict({
    enabled: true, previews_enabled: false,
  }), "utf8");
  const state = {
    lease, credential, responseBytes, moduleBytes, uploadBytes,
    multipartBoundary, enableBytes,
    ledgerDirectory: config.ledgerDirectory,
    ledgerId: config.ledgerId,
    adapterInstanceRefHash: config.adapterInstanceRefHash,
    permissionGrantHash: config.permissionGrantHash,
    privateProjectionNonce: config.privateProjectionNonce,
    transactionBindingHash: digest(
      "outsider/cloudflare-ephemeral-worker-transaction/v1", {
        tenderHash: lease.tenderHash,
        outcomeHash: lease.outcomeHash,
        accountId: credential.accountId,
        scriptName: lease.scriptName,
        workerUrl: lease.workerUrl,
        uploadDeadline: lease.uploadDeadline,
        witnessDeadline: lease.witnessDeadline,
        deleteDeadline: lease.deleteDeadline,
      }),
    verification: null,
    upload: null,
    enable: null,
    deletion: null,
    uploadReceipt: false,
    enableReceipt: false,
    publicEffectObserved: false,
    publicEffectEvidenceHash: null,
    deleteReceipt: false,
    publicAbsenceObserved: false,
    publicAbsenceEvidenceHash: null,
    planHash: null,
  };
  state.upload = operationBinding(state, "UPLOAD", "PUT", scriptPath,
    uploadBytes, lease.uploadDeadline);
  state.enable = operationBinding(state, "ENABLE_WORKERS_DEV", "POST",
    `${scriptPath}/subdomain`, enableBytes, lease.witnessDeadline);
  state.deletion = operationBinding(state, "DELETE", "DELETE", scriptPath,
    null, lease.deleteDeadline);
  state.planHash = digest("outsider/cloudflare-ephemeral-worker-plan/v1", {
    transactionBindingHash: state.transactionBindingHash,
    uploadBodyHash: state.upload.bodyHash,
    enableBodyHash: state.enable.bodyHash,
    deleteBodyHash: state.deletion.bodyHash,
    responseBodyHash: byteHash(responseBytes),
  });
  const intent = makeEvent(state, state.upload, "INTENT_ADMITTED");
  state.verification = initializeDurableOneUseEndpointEffectLedgerV1({
    directory: state.ledgerDirectory,
    ledgerId: state.ledgerId,
    genesisEvent: intent,
  });
  state.upload.currentEvent = intent;
  lease.consumed = true;
  const driver = Object.freeze({ publicProjection:
    projection(state, "DURABLY_ADMITTED_NO_NETWORK_HOLD") });
  DRIVERS.set(driver, state);
  return driver;
}

function prepareEffect(state, binding, deadlineCode) {
  if (binding.currentEvent?.eventType === "ENDPOINT_RECEIPT_OBSERVED") {
    return "OBSERVED";
  }
  if (binding.currentEvent?.eventType === "SUBMIT_ATTEMPTED") {
    return "AMBIGUOUS";
  }
  if (DateNow() >= Date.parse(binding.effectDeadline)) return deadlineCode;
  if (binding.currentEvent === null) appendEvent(state, binding,
    "INTENT_ADMITTED");
  if (binding.currentEvent.eventType === "INTENT_ADMITTED") {
    appendEvent(state, binding, "SUBMIT_RESERVED");
  }
  if (binding.currentEvent.eventType !== "SUBMIT_RESERVED") {
    fail(`${binding.operation}_STATE_INVALID`);
  }
  appendEvent(state, binding, "SUBMIT_ATTEMPTED");
  return "ATTEMPTED";
}

function cloudflareReceipt(response, domain) {
  return digest(domain, {
    status: response.status,
    bodyHash: response.bytes === null ? null : byteHash(response.bytes),
  });
}

export async function uploadCloudflareEphemeralWorkerOnceV1(driver,
  input = {}, options = { timeoutMs: DEFAULT_TIMEOUT_MS }) {
  const state = checkedDriver(driver, input, "UPLOAD_INPUT");
  const checked = requestOptions(options);
  const preparation = prepareEffect(state, state.upload, "UPLOAD_EXPIRED");
  if (preparation === "OBSERVED") {
    return result(state, "UPLOAD_PROVIDER_RECEIPT_OBSERVED_HOLD");
  }
  if (preparation === "AMBIGUOUS") {
    return result(state, "UPLOAD_COMMIT_UNKNOWN_GET_RECONCILE_ONLY_HOLD");
  }
  if (preparation === "UPLOAD_EXPIRED") {
    return result(state, "UPLOAD_DEADLINE_EXPIRED_HOLD");
  }
  const response = await exchange(fixedApiUrl(state.upload.path), {
    method: "PUT",
    headers: apiHeaders(state.credential, state.uploadBytes,
      `multipart/form-data; boundary=${state.multipartBoundary}`),
    body: state.uploadBytes,
  }, checked.timeoutMs, MAX_API_RESPONSE_BYTES);
  if (response.status !== 200 || response.json?.success !== true
    || response.json?.result === null
    || typeof response.json?.result !== "object") {
    return result(state, "UPLOAD_COMMIT_UNKNOWN_GET_RECONCILE_ONLY_HOLD",
      { network: response.contacted, put: response.contacted });
  }
  appendEvent(state, state.upload, "ENDPOINT_RECEIPT_OBSERVED",
    cloudflareReceipt(response,
      "outsider/cloudflare-ephemeral-worker-upload-receipt/v1"));
  state.uploadReceipt = true;
  return result(state, "UPLOAD_PROVIDER_RECEIPT_OBSERVED_HOLD",
    { network: true, put: true });
}

function exactModuleDownloaded(response, expectedModule) {
  if (response.status !== 200 || response.bytes === null) return false;
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (/^(?:application\/javascript|text\/javascript)(?:\s*;|\s*$)/iu
    .test(contentType)) return response.bytes.equals(expectedModule);
  const boundaryMatch
    = /^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^;\s]+))/iu
      .exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2] ?? null;
  if (boundary === null || boundary.length > 200) return false;
  const text = response.bytes.toString("utf8");
  const segments = text.split(`--${boundary}`);
  let matches = 0;
  for (const segment of segments) {
    const separator = segment.indexOf("\r\n\r\n");
    if (separator < 0) continue;
    const headers = segment.slice(0, separator).toLowerCase();
    if (!headers.includes(`name="${MAIN_MODULE}"`)) continue;
    let content = segment.slice(separator + 4);
    if (content.endsWith("\r\n")) content = content.slice(0, -2);
    if (Buffer.from(content, "utf8").equals(expectedModule)) matches += 1;
  }
  return matches === 1;
}

export async function reconcileCloudflareEphemeralWorkerUploadV1(driver,
  input = {}, options = { timeoutMs: DEFAULT_TIMEOUT_MS }) {
  const state = checkedDriver(driver, input, "UPLOAD_RECONCILE_INPUT");
  const checked = requestOptions(options);
  if (state.uploadReceipt) {
    return result(state, "UPLOAD_PROVIDER_RECEIPT_OBSERVED_HOLD");
  }
  if (state.upload.currentEvent?.eventType !== "SUBMIT_ATTEMPTED") {
    fail("UPLOAD_RECONCILE_STATE_INVALID");
  }
  const response = await exchange(fixedApiUrl(state.upload.path), {
    method: "GET",
    headers: Object.freeze({
      Accept: "application/javascript",
      Authorization: `Bearer ${state.credential.apiToken}`,
    }),
  }, checked.timeoutMs, MAX_API_RESPONSE_BYTES);
  if (!exactModuleDownloaded(response, state.moduleBytes)) {
    return result(state, "UPLOAD_COMMIT_UNKNOWN_GET_RECONCILE_ONLY_HOLD",
      { network: response.contacted, reconcile: response.contacted });
  }
  appendEvent(state, state.upload, "ENDPOINT_RECEIPT_OBSERVED",
    cloudflareReceipt(response,
      "outsider/cloudflare-ephemeral-worker-upload-reconcile/v1"));
  state.uploadReceipt = true;
  return result(state, "UPLOAD_PROVIDER_RECEIPT_OBSERVED_HOLD",
    { network: true, reconcile: true });
}

export async function enableCloudflareEphemeralWorkerSubdomainOnceV1(driver,
  input = {}, options = { timeoutMs: DEFAULT_TIMEOUT_MS }) {
  const state = checkedDriver(driver, input, "ENABLE_INPUT");
  const checked = requestOptions(options);
  if (!state.uploadReceipt) fail("UPLOAD_RECEIPT_REQUIRED_BEFORE_ENABLE");
  const preparation = prepareEffect(state, state.enable, "ENABLE_EXPIRED");
  if (preparation === "OBSERVED") {
    return result(state, "SUBDOMAIN_ENABLE_RECEIPT_OBSERVED_HOLD");
  }
  if (preparation === "AMBIGUOUS") {
    return result(state, "SUBDOMAIN_ENABLE_UNKNOWN_GET_RECONCILE_ONLY_HOLD");
  }
  if (preparation === "ENABLE_EXPIRED") {
    return result(state, "SUBDOMAIN_ENABLE_DEADLINE_EXPIRED_HOLD");
  }
  const response = await exchange(fixedApiUrl(state.enable.path), {
    method: "POST",
    headers: apiHeaders(state.credential, state.enableBytes,
      "application/json", true),
    body: state.enableBytes,
  }, checked.timeoutMs, MAX_API_RESPONSE_BYTES);
  if (response.status !== 200 || response.json?.success !== true
    || response.json?.result?.enabled !== true) {
    return result(state, "SUBDOMAIN_ENABLE_UNKNOWN_GET_RECONCILE_ONLY_HOLD",
      { network: response.contacted, enable: response.contacted });
  }
  appendEvent(state, state.enable, "ENDPOINT_RECEIPT_OBSERVED",
    cloudflareReceipt(response,
      "outsider/cloudflare-ephemeral-worker-enable-receipt/v1"));
  state.enableReceipt = true;
  return result(state, "SUBDOMAIN_ENABLE_RECEIPT_OBSERVED_HOLD",
    { network: true, enable: true });
}

export async function reconcileCloudflareEphemeralWorkerSubdomainV1(driver,
  input = {}, options = { timeoutMs: DEFAULT_TIMEOUT_MS }) {
  const state = checkedDriver(driver, input, "ENABLE_RECONCILE_INPUT");
  const checked = requestOptions(options);
  if (state.enableReceipt) {
    return result(state, "SUBDOMAIN_ENABLE_RECEIPT_OBSERVED_HOLD");
  }
  if (state.enable.currentEvent?.eventType !== "SUBMIT_ATTEMPTED") {
    fail("ENABLE_RECONCILE_STATE_INVALID");
  }
  const response = await exchange(fixedApiUrl(state.enable.path), {
    method: "GET", headers: apiHeaders(state.credential),
  }, checked.timeoutMs, MAX_API_RESPONSE_BYTES);
  if (response.status !== 200 || response.json?.success !== true
    || response.json?.result?.enabled !== true) {
    return result(state, "SUBDOMAIN_ENABLE_UNKNOWN_GET_RECONCILE_ONLY_HOLD",
      { network: response.contacted, reconcile: response.contacted });
  }
  appendEvent(state, state.enable, "ENDPOINT_RECEIPT_OBSERVED",
    cloudflareReceipt(response,
      "outsider/cloudflare-ephemeral-worker-enable-reconcile/v1"));
  state.enableReceipt = true;
  return result(state, "SUBDOMAIN_ENABLE_RECEIPT_OBSERVED_HOLD",
    { network: true, reconcile: true });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pollPublicWorker(state, expectPresent, options, deadline) {
  const start = DateNow();
  const stopAt = Math.min(start + options.maxWaitMs, Date.parse(deadline));
  const maxAttempts = Math.min(MAX_POLL_ATTEMPTS,
    Math.max(1, Math.ceil(options.maxWaitMs / options.pollIntervalMs)));
  let attempts = 0;
  do {
    attempts += 1;
    const response = await exchange(state.lease.workerUrl, {
      method: "GET",
      headers: Object.freeze({
        Accept: "application/json",
        "Cache-Control": "no-cache",
      }),
    }, options.requestTimeoutMs, MAX_PUBLIC_RESPONSE_BYTES);
    if (expectPresent) {
      const contentType = response.headers?.get?.("content-type") ?? "";
      const cacheControl = response.headers?.get?.("cache-control") ?? "";
      if (response.status === 200 && response.bytes !== null
        && response.bytes.equals(state.responseBytes)
        && /^application\/json(?:\s*;|\s*$)/iu.test(contentType)
        && cacheControl.split(",").some((value) => value.trim().toLowerCase()
          === "no-store")) {
        return { observed: true, attempts, evidenceHash: digest(
          "outsider/cloudflare-workers-dev-public-effect-observation/v1", {
            status: response.status,
            bodyHash: byteHash(response.bytes),
            contentType: contentType.toLowerCase(),
            cacheControl: cacheControl.toLowerCase(),
          }) };
      }
    } else if (response.status === 404 || response.status === 410) {
      return { observed: true, attempts, evidenceHash: digest(
        "outsider/cloudflare-workers-dev-public-absence-observation/v1", {
          status: response.status,
        }) };
    }
    if (attempts >= maxAttempts
      || DateNow() + options.pollIntervalMs >= stopAt) break;
    await wait(options.pollIntervalMs);
  } while (DateNow() < stopAt);
  return { observed: false, attempts, evidenceHash: null };
}

export async function observeCloudflareEphemeralWorkerPublicEffectV1(driver,
  input = {}, options = { requestTimeoutMs: DEFAULT_TIMEOUT_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS, maxWaitMs: MAX_WAIT_MS }) {
  const state = checkedDriver(driver, input, "PUBLIC_OBSERVE_INPUT");
  const checked = pollOptions(options);
  if (!state.uploadReceipt || !state.enableReceipt) {
    fail("UPLOAD_AND_ENABLE_RECEIPTS_REQUIRED_BEFORE_PUBLIC_OBSERVATION");
  }
  if (state.publicEffectObserved) {
    return result(state, "PUBLIC_EFFECT_OBSERVED_AT_WORKERS_DEV_HOLD");
  }
  if (DateNow() >= Date.parse(state.lease.witnessDeadline)) {
    return result(state, "PUBLIC_EFFECT_WITNESS_DEADLINE_EXPIRED_HOLD");
  }
  const observed = await pollPublicWorker(state, true, checked,
    state.lease.witnessDeadline);
  if (!observed.observed) {
    return result(state, "PUBLIC_EFFECT_AWAITING_WORKERS_DEV_HOLD", {
      network: observed.attempts > 0, witness: observed.attempts > 0,
    });
  }
  state.publicEffectObserved = true;
  state.publicEffectEvidenceHash = observed.evidenceHash;
  return result(state, "PUBLIC_EFFECT_OBSERVED_AT_WORKERS_DEV_HOLD",
    { network: true, witness: true });
}

export async function deleteCloudflareEphemeralWorkerOnceV1(driver,
  input = {}, options = { timeoutMs: DEFAULT_TIMEOUT_MS }) {
  const state = checkedDriver(driver, input, "DELETE_INPUT");
  const checked = requestOptions(options);
  if (!state.uploadReceipt
    && state.upload.currentEvent?.eventType !== "SUBMIT_ATTEMPTED") {
    fail("UPLOAD_ATTEMPT_OR_RECEIPT_REQUIRED_BEFORE_DELETE");
  }
  const preparation = prepareEffect(state, state.deletion, "DELETE_EXPIRED");
  if (preparation === "OBSERVED") {
    return result(state, "DELETE_PROVIDER_RECEIPT_OBSERVED_HOLD");
  }
  if (preparation === "AMBIGUOUS") {
    return result(state, "DELETE_COMMIT_UNKNOWN_GET_RECONCILE_ONLY_HOLD");
  }
  if (preparation === "DELETE_EXPIRED") {
    return result(state, "DELETE_DEADLINE_EXPIRED_RECOVERY_OPEN_HOLD");
  }
  const response = await exchange(fixedApiUrl(state.deletion.path), {
    method: "DELETE", headers: apiHeaders(state.credential),
  }, checked.timeoutMs, MAX_API_RESPONSE_BYTES);
  if (response.status !== 200 && response.status !== 204) {
    return result(state, "DELETE_COMMIT_UNKNOWN_GET_RECONCILE_ONLY_HOLD",
      { network: response.contacted, delete: response.contacted });
  }
  appendEvent(state, state.deletion, "ENDPOINT_RECEIPT_OBSERVED",
    cloudflareReceipt(response,
      "outsider/cloudflare-ephemeral-worker-delete-receipt/v1"));
  state.deleteReceipt = true;
  return result(state, "DELETE_PROVIDER_RECEIPT_OBSERVED_HOLD",
    { network: true, delete: true });
}

export async function reconcileCloudflareEphemeralWorkerDeleteV1(driver,
  input = {}, options = { timeoutMs: DEFAULT_TIMEOUT_MS }) {
  const state = checkedDriver(driver, input, "DELETE_RECONCILE_INPUT");
  const checked = requestOptions(options);
  if (state.deleteReceipt) {
    return result(state, "DELETE_PROVIDER_RECEIPT_OBSERVED_HOLD");
  }
  if (state.deletion.currentEvent?.eventType !== "SUBMIT_ATTEMPTED") {
    fail("DELETE_RECONCILE_STATE_INVALID");
  }
  const response = await exchange(fixedApiUrl(state.deletion.path), {
    method: "GET",
    headers: Object.freeze({
      Accept: "application/javascript",
      Authorization: `Bearer ${state.credential.apiToken}`,
    }),
  }, checked.timeoutMs, MAX_API_RESPONSE_BYTES, false);
  if (response.status !== 404) {
    return result(state, "DELETE_COMMIT_UNKNOWN_GET_RECONCILE_ONLY_HOLD",
      { network: response.contacted, reconcile: response.contacted });
  }
  appendEvent(state, state.deletion, "ENDPOINT_RECEIPT_OBSERVED",
    cloudflareReceipt(response,
      "outsider/cloudflare-ephemeral-worker-delete-reconcile/v1"));
  state.deleteReceipt = true;
  return result(state, "DELETE_PROVIDER_RECEIPT_OBSERVED_HOLD",
    { network: true, reconcile: true });
}

export async function observeCloudflareEphemeralWorkerAbsenceV1(driver,
  input = {}, options = { requestTimeoutMs: DEFAULT_TIMEOUT_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS, maxWaitMs: MAX_WAIT_MS }) {
  const state = checkedDriver(driver, input, "ABSENCE_OBSERVE_INPUT");
  const checked = pollOptions(options);
  if (!state.publicEffectObserved) {
    fail("PUBLIC_EFFECT_OBSERVATION_REQUIRED_BEFORE_ABSENCE_OBSERVATION");
  }
  if (!state.deleteReceipt) {
    fail("DELETE_PROVIDER_RECEIPT_REQUIRED_BEFORE_ABSENCE_OBSERVATION");
  }
  if (state.publicAbsenceObserved) {
    return result(state, "PUBLIC_ABSENCE_OBSERVED_AT_WORKERS_DEV_HOLD");
  }
  if (DateNow() >= Date.parse(state.lease.deleteDeadline)) {
    return result(state, "PUBLIC_ABSENCE_WITNESS_DEADLINE_EXPIRED_HOLD");
  }
  const observed = await pollPublicWorker(state, false, checked,
    state.lease.deleteDeadline);
  if (!observed.observed) {
    return result(state, "PUBLIC_ABSENCE_AWAITING_WORKERS_DEV_HOLD", {
      network: observed.attempts > 0, witness: observed.attempts > 0,
    });
  }
  state.publicAbsenceObserved = true;
  state.publicAbsenceEvidenceHash = observed.evidenceHash;
  return result(state, "PUBLIC_ABSENCE_OBSERVED_AT_WORKERS_DEV_HOLD",
    { network: true, witness: true });
}
