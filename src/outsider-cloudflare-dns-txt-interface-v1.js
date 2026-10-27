/*
 * Outcome Formation Engine: user-held Cloudflare DNS TXT interface v1.
 *
 * This source-specific adapter performs three read-only Cloudflare API v4
 * preflight reads: token verification, exact zone lookup, and exact TXT-name
 * absence.  It does not query recursive DNS.  A successful preflight remains
 * HOLD and creates one process-local, one-use DESCRIBED_INTERFACE_LEASE.  The
 * optional driver below can consume that lease, but only after durably binding
 * the exact create/delete effects in the existing one-use endpoint ledger.
 *
 * The generic transaction-surface adapter contract is a pure structural
 * source-replay artifact and explicitly accepts no raw credential material.
 * It therefore cannot seal or prove this live credential.  The profile below
 * records that contract boundary without treating conformance as authority.
 */

import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const CLOUDFLARE_ORIGIN = "https://api.cloudflare.com";
const GOOGLE_DOH_ORIGIN = "https://dns.google";
const API_PREFIX = "/client/v4";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MAX_POLL_INTERVAL_MS = 10_000;
const MAX_OBSERVATION_WAIT_MS = 60_000;
const MAX_OBSERVATION_ATTEMPTS = 64;
const TXT_TTL_SECONDS = 60;
const TXT_LABEL_PREFIX = "outsider-proof-";
const PREFIX = "OUTSIDER_CLOUDFLARE_DNS_TXT_INTERFACE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ZONE_ID = /^[a-f0-9]{32}$/u;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const API_TOKEN = /^[A-Za-z0-9._~-]{20,512}$/u;
const LEDGER_ID = /^ledger_[a-f0-9]{32}$/u;
const PRIVATE_NONCE = /^[a-f0-9]{64}$/u;

const Fetch = globalThis.fetch;
const DateNow = Date.now;
const CREDENTIAL_CAPABILITIES = new WeakMap();
const DESCRIBED_INTERFACE_LEASES = new WeakMap();
const EFFECT_DRIVER_HANDOFFS = new WeakMap();
const EFFECT_DRIVERS = new WeakMap();
const ISSUED_LABELS = new Set();

export const OUTSIDER_CLOUDFLARE_DNS_TXT_INTERFACE_V1_SCHEMAS
  = Object.freeze({
    publicProjection:
      "outsider/cloudflare-dns-txt-interface-public-preflight/v1",
    describedInterfaceLease:
      "outsider/cloudflare-dns-txt-described-interface-lease/v1",
    effectDriverHandoff:
      "outsider/cloudflare-dns-txt-effect-driver-handoff/v1",
    effectDriverProjection:
      "outsider/cloudflare-dns-txt-effect-driver-projection/v1",
  });

export const OUTSIDER_CLOUDFLARE_DNS_TXT_INTERFACE_V1_PROFILE = deepFreeze({
  profileId: "CLOUDFLARE_DNS_TXT_USER_HELD_API_V1",
  transactionSurfaceAdapterContractSchemaRef:
    "outsider/transaction-surface-adapter-contract/v1",
  transportFamily: "USER_HELD_ACCOUNT_API",
  fixedOrigin: CLOUDFLARE_ORIGIN,
  apiVersion: "v4",
  preflightMethods: ["GET", "GET", "GET"],
  effectMethodsImplemented: ["POST", "DELETE"],
  adapterContractReplayRequiredBeforeEffect: true,
  adapterContractReplayedByThisPreflight: false,
  durableEndpointEffectLedgerRequiredBeforeEffect: true,
  durableEndpointEffectLedgerUsedByThisPreflight: false,
  structuralConformanceMintsAuthority: false,
  profileHash: digest("outsider/cloudflare-dns-txt-interface-profile/v1", {
    profileId: "CLOUDFLARE_DNS_TXT_USER_HELD_API_V1",
    transactionSurfaceAdapterContractSchemaRef:
      "outsider/transaction-surface-adapter-contract/v1",
    transportFamily: "USER_HELD_ACCOUNT_API",
    fixedOrigin: CLOUDFLARE_ORIGIN,
    apiVersion: "v4",
    preflightMethods: ["GET", "GET", "GET"],
    effectMethodsImplemented: ["POST", "DELETE"],
  }),
});

export const OUTSIDER_CLOUDFLARE_DNS_TXT_INTERFACE_V1_BOUNDARY = deepFreeze({
  position:
    "USER_HELD_CLOUDFLARE_DNS_PREFLIGHT_PLUS_EXPLICIT_ONE_USE_EFFECT_HOLD",
  fixedOfficialOrigin: CLOUDFLARE_ORIGIN,
  arbitraryUrlAccepted: false,
  callerSuppliedTransportCallbackAccepted: false,
  requestMethodsAllowed: ["GET"],
  effectRequestMethodsImplemented: ["POST", "GET_RECONCILE", "DELETE"],
  independentObservationMethodsImplemented: ["GOOGLE_PUBLIC_DNS_DOH_GET"],
  maximumRequestAttempts: 3,
  retryPermitted: false,
  redirectPermitted: false,
  cookiesSent: false,
  responseBodyLimitBytes: MAX_RESPONSE_BYTES,
  timeoutBounded: true,
  apiTokenProjected: false,
  zoneIdProjected: false,
  zoneNameProjected: false,
  txtLabelProjected: false,
  fqdnProjected: false,
  recursiveDnsQueryPerformed: false,
  txtTtlSeconds: TXT_TTL_SECONDS,
  txtContentRestrictedToPublicOutcomeCommitmentHash: true,
  oneUseDescribedInterfaceLeaseIssuedOnlyAfterSuccessfulPreflight: true,
  postImplemented: true,
  deleteImplemented: true,
  effectDriverImplemented: true,
  effectDriverDefaultExecutes: false,
  providerCreateAcknowledgementIsOutcomeTruth: false,
  providerDeleteAcknowledgementIsRecoveryTruth: false,
  independentObservationOrigin: GOOGLE_DOH_ORIGIN,
  recursiveDnsQueriedBeforeCreate: false,
  postMaximumAttemptsPerLease: 1,
  deleteMaximumAttemptsPerLease: 1,
  transportFailurePostRetryPermitted: false,
  transportFailureDeleteRetryPermitted: false,
  exactReadOnlyReconciliationAfterAmbiguousEffect: true,
  processRestartCapabilityRecoveryImplemented: false,
  durableEffectLedgerDuplicated: false,
  credentialAccessAuthenticatedCanMintOwnerAuthority: false,
  offerEstablished: false,
  capacityEstablished: false,
  capacityReserved: false,
  resourceOwnerAuthorityEstablished: false,
  providerAcceptanceEstablished: false,
  priceEstablished: false,
  settlementPermitted: false,
  internalHumanFallbackPermitted: false,
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

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
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

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function zoneName(value) {
  if (typeof value !== "string" || value.length < 3 || value.length > 205
    || value !== value.toLowerCase() || value.endsWith(".")) {
    fail("ZONE_NAME_INVALID");
  }
  const labels = value.split(".");
  if (labels.length < 2 || labels.some((label) => !DNS_LABEL.test(label))) {
    fail("ZONE_NAME_INVALID");
  }
  return value;
}

function verifiedTender(tender, expectedTenderHash) {
  if (typeof expectedTenderHash !== "string" || !HASH.test(expectedTenderHash)) {
    fail("EXPECTED_TENDER_HASH_INVALID");
  }
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

function opaqueCapability() {
  return Object.freeze(Object.create(null));
}

/** Seal one user-held token and exact zone in process-local module state. */
export function sealCloudflareDnsTxtUserCapabilityV1(input) {
  exactObject(input, ["apiToken", "zoneId", "zoneName"], "CAPABILITY_INPUT");
  if (typeof input.apiToken !== "string" || !API_TOKEN.test(input.apiToken)) {
    fail("API_TOKEN_INVALID");
  }
  if (typeof input.zoneId !== "string" || !ZONE_ID.test(input.zoneId)) {
    fail("ZONE_ID_INVALID");
  }
  const normalizedZoneName = zoneName(input.zoneName);
  if (`${TXT_LABEL_PREFIX}${"0".repeat(32)}.${normalizedZoneName}`.length
      > 253) {
    fail("FQDN_INVALID");
  }
  const capability = opaqueCapability();
  CREDENTIAL_CAPABILITIES.set(capability, {
    apiToken: input.apiToken,
    zoneId: input.zoneId,
    zoneName: normalizedZoneName,
  });
  return capability;
}

function normalizePreflight(input, timeoutMs) {
  exactObject(input, ["credentialCapability", "tender",
    "expectedTenderHash", "publicOutcomeCommitmentHash", "createDeadline",
    "witnessDeadline", "deleteDeadline"], "PREFLIGHT_INPUT");
  const credential = CREDENTIAL_CAPABILITIES.get(input.credentialCapability);
  if (credential === undefined) fail("CAPABILITY_NOT_MODULE_ISSUED");
  const tender = verifiedTender(input.tender, input.expectedTenderHash);
  if (typeof input.publicOutcomeCommitmentHash !== "string"
    || !HASH.test(input.publicOutcomeCommitmentHash)
    || input.publicOutcomeCommitmentHash
      !== tender.exactOutcome.exactOutcomeHash) {
    fail("OUTCOME_COMMITMENT_HASH_MISMATCH");
  }
  const createDeadline = instant(input.createDeadline, "CREATE_DEADLINE");
  const witnessDeadline = instant(input.witnessDeadline, "WITNESS_DEADLINE");
  const deleteDeadline = instant(input.deleteDeadline, "DELETE_DEADLINE");
  const nowMs = DateNow();
  const createMs = Date.parse(createDeadline);
  const witnessMs = Date.parse(witnessDeadline);
  const deleteMs = Date.parse(deleteDeadline);
  if (nowMs < Date.parse(tender.compiledAt)
    || nowMs >= createMs
    || createMs > Date.parse(tender.formationDeadline)
    || witnessMs <= createMs || deleteMs <= witnessMs
    || deleteMs > Date.parse(tender.exactOutcome.deadline)) {
    fail("DEADLINE_ORDER_OR_WINDOW_INVALID");
  }
  const normalizedTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(normalizedTimeout) || normalizedTimeout < 1
    || normalizedTimeout > MAX_TIMEOUT_MS) fail("TIMEOUT_INVALID");
  return { credentialCapability: input.credentialCapability, credential,
    tender, publicOutcomeCommitmentHash: input.publicOutcomeCommitmentHash,
    createDeadline, witnessDeadline, deleteDeadline,
    timeoutMs: normalizedTimeout };
}

function issueUniqueLabel() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entropy = randomBytes(16).toString("hex");
    if (!ISSUED_LABELS.has(entropy)) {
      ISSUED_LABELS.add(entropy);
      return `${TXT_LABEL_PREFIX}${entropy}`;
    }
  }
  fail("UNIQUE_LABEL_EXHAUSTED");
}

function fixedUrl(path, query = null) {
  const url = new URL(path, CLOUDFLARE_ORIGIN);
  if (query !== null) {
    for (const [key, value] of query) url.searchParams.set(key, value);
  }
  if (url.origin !== CLOUDFLARE_ORIGIN || !url.pathname.startsWith(API_PREFIX)) {
    fail("FIXED_ORIGIN_INVARIANT_FAILED");
  }
  return url.href;
}

async function boundedJson(response, controller) {
  if (response === null || typeof response !== "object"
    || !Number.isSafeInteger(response.status)) return null;
  const contentType = response.headers?.get?.("content-type");
  if (typeof contentType !== "string"
    || !/^application\/json(?:\s*;|\s*$)/iu.test(contentType)) return null;
  const declared = response.headers?.get?.("content-length");
  if (declared !== null && declared !== undefined && declared !== "") {
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes < 0
      || bytes > MAX_RESPONSE_BYTES) return null;
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    return null;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    if (!(part.value instanceof Uint8Array)) return null;
    total += part.value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      controller.abort();
      try { await reader.cancel(); } catch { /* already failed closed */ }
      return null;
    }
    chunks.push(Buffer.from(part.value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
  } catch {
    return null;
  }
}

async function readCloudflareJson(url, state, controller) {
  state.requestAttemptCount += 1;
  if (typeof Fetch !== "function") return { ok: false, code: "FETCH_UNAVAILABLE" };
  let response;
  try {
    response = await Fetch(url, {
      method: "GET",
      headers: Object.freeze({
        Accept: "application/json",
        Authorization: `Bearer ${state.credential.apiToken}`,
      }),
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
  } catch {
    return { ok: false, code: "TRANSPORT_UNAVAILABLE" };
  }
  if (response.status >= 300 && response.status < 400) {
    return { ok: false, code: "REDIRECT_REFUSED" };
  }
  if (response.status !== 200) {
    return { ok: false, code: response.status === 401 || response.status === 403
      ? "ACCESS_DENIED" : "SOURCE_REJECTED" };
  }
  const body = await boundedJson(response, controller);
  if (body === null) return { ok: false, code: "SOURCE_MALFORMED" };
  return { ok: true, body };
}

function successfulEnvelope(normalized, label, fqdn, requestAttemptCount) {
  const body = {
    schema:
      OUTSIDER_CLOUDFLARE_DNS_TXT_INTERFACE_V1_SCHEMAS.publicProjection,
    schemaVersion: "1.0.0",
    recordClass: "CLOUDFLARE_DNS_TXT_READ_ONLY_PREFLIGHT",
    status: "SUCCEEDED",
    phase: "ACCESS_AUTHENTICATED",
    failureCode: null,
    tenderHash: normalized.tender.tenderHash,
    publicOutcomeCommitmentHash: normalized.publicOutcomeCommitmentHash,
    txtContent: normalized.publicOutcomeCommitmentHash,
    txtTtlSeconds: TXT_TTL_SECONDS,
    createDeadline: normalized.createDeadline,
    witnessDeadline: normalized.witnessDeadline,
    deleteDeadline: normalized.deleteDeadline,
    requestAttemptCount,
    exactTokenVerified: true,
    exactZoneMatched: true,
    exactTxtRecordAbsent: true,
    recursiveDnsQueryPerformed: false,
    credentialProjected: false,
    zoneProjected: false,
    labelProjected: false,
    fqdnProjected: false,
    describedInterfaceLeaseAvailable: true,
    offerEstablished: false,
    capacityReserved: false,
    resourceOwnerAuthorityEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  const publicProjection = deepFreeze({ ...body,
    projectionHash: digest(
      OUTSIDER_CLOUDFLARE_DNS_TXT_INTERFACE_V1_SCHEMAS.publicProjection,
      body) });
  const result = Object.freeze({ publicProjection });
  DESCRIBED_INTERFACE_LEASES.set(result, {
    schema:
      OUTSIDER_CLOUDFLARE_DNS_TXT_INTERFACE_V1_SCHEMAS.describedInterfaceLease,
    credentialCapability: normalized.credentialCapability,
    tenderHash: normalized.tender.tenderHash,
    outcomeCommitmentHash: normalized.publicOutcomeCommitmentHash,
    label,
    fqdn,
    ttlSeconds: TXT_TTL_SECONDS,
    createDeadline: normalized.createDeadline,
    witnessDeadline: normalized.witnessDeadline,
    deleteDeadline: normalized.deleteDeadline,
    claimed: false,
    driverConsumed: false,
  });
  return result;
}

function failedEnvelope(normalized, failureCode, requestAttemptCount) {
  const body = {
    schema:
      OUTSIDER_CLOUDFLARE_DNS_TXT_INTERFACE_V1_SCHEMAS.publicProjection,
    schemaVersion: "1.0.0",
    recordClass: "CLOUDFLARE_DNS_TXT_READ_ONLY_PREFLIGHT",
    status: "FAILED",
    phase: "ACCESS_NOT_AUTHENTICATED",
    failureCode,
    tenderHash: normalized.tender.tenderHash,
    publicOutcomeCommitmentHash: normalized.publicOutcomeCommitmentHash,
    txtContent: normalized.publicOutcomeCommitmentHash,
    txtTtlSeconds: TXT_TTL_SECONDS,
    createDeadline: normalized.createDeadline,
    witnessDeadline: normalized.witnessDeadline,
    deleteDeadline: normalized.deleteDeadline,
    requestAttemptCount,
    exactTokenVerified: false,
    exactZoneMatched: false,
    exactTxtRecordAbsent: false,
    recursiveDnsQueryPerformed: false,
    credentialProjected: false,
    zoneProjected: false,
    labelProjected: false,
    fqdnProjected: false,
    describedInterfaceLeaseAvailable: false,
    offerEstablished: false,
    capacityReserved: false,
    resourceOwnerAuthorityEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  const publicProjection = deepFreeze({ ...body,
    projectionHash: digest(
      OUTSIDER_CLOUDFLARE_DNS_TXT_INTERFACE_V1_SCHEMAS.publicProjection,
      body) });
  return Object.freeze({ publicProjection });
}

async function runPreflight(normalized, label, fqdn, state, controller) {
  const verify = await readCloudflareJson(fixedUrl(
    `${API_PREFIX}/user/tokens/verify`), state, controller);
  if (!verify.ok) return verify;
  if (verify.body?.success !== true || verify.body?.result?.status !== "active") {
    return { ok: false, code: "TOKEN_NOT_ACTIVE" };
  }

  const zone = await readCloudflareJson(fixedUrl(
    `${API_PREFIX}/zones/${normalized.credential.zoneId}`), state, controller);
  if (!zone.ok) return zone;
  if (zone.body?.success !== true
    || zone.body?.result?.id !== normalized.credential.zoneId
    || zone.body?.result?.name !== normalized.credential.zoneName) {
    return { ok: false, code: "EXACT_ZONE_MISMATCH" };
  }

  const records = await readCloudflareJson(fixedUrl(
    `${API_PREFIX}/zones/${normalized.credential.zoneId}/dns_records`, [
      ["type", "TXT"], ["name", fqdn], ["per_page", "2"],
    ]), state, controller);
  if (!records.ok) return records;
  if (records.body?.success !== true || !Array.isArray(records.body?.result)) {
    return { ok: false, code: "RECORD_SOURCE_MALFORMED" };
  }
  if (records.body.result.length !== 0) {
    return { ok: false, code: "TXT_RECORD_NOT_UNIQUE" };
  }
  return { ok: true };
}

/** Run exactly three fixed-origin Cloudflare GETs and issue no effect. */
export async function preflightCloudflareDnsTxtInterfaceV1(input,
  options = { timeoutMs: DEFAULT_TIMEOUT_MS }) {
  exactObject(options, ["timeoutMs"], "PREFLIGHT_OPTIONS");
  const normalized = normalizePreflight(input, options.timeoutMs);
  const label = issueUniqueLabel();
  const fqdn = `${label}.${normalized.credential.zoneName}`;
  if (fqdn.length > 253 || !DNS_LABEL.test(label)) fail("FQDN_INVALID");

  const controller = new AbortController();
  const state = { credential: normalized.credential, requestAttemptCount: 0 };
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, code: "TIMEOUT" });
    }, normalized.timeoutMs);
  });
  const work = runPreflight(normalized, label, fqdn, state, controller)
    .catch(() => ({ ok: false, code: "TRANSPORT_UNAVAILABLE" }));
  const outcome = await Promise.race([work, timeout]);
  clearTimeout(timer);
  if (!outcome.ok) {
    return failedEnvelope(normalized, outcome.code, state.requestAttemptCount);
  }
  if (DateNow() >= Date.parse(normalized.createDeadline)) {
    return failedEnvelope(normalized, "LEASE_EXPIRED_AFTER_PREFLIGHT",
      state.requestAttemptCount);
  }
  return successfulEnvelope(normalized, label, fqdn,
    state.requestAttemptCount);
}

/**
 * Reserve the successful result once for a future effect driver.  This still
 * performs no effect and intentionally exposes no token, zone, label, or FQDN.
 */
export function claimCloudflareDnsTxtDescribedInterfaceLeaseV1(
  result, input) {
  exactObject(input, ["tender", "expectedTenderHash"], "LEASE_CLAIM_INPUT");
  const lease = DESCRIBED_INTERFACE_LEASES.get(result);
  if (lease === undefined) fail("DESCRIBED_INTERFACE_LEASE_NOT_MODULE_ISSUED");
  const tender = verifiedTender(input.tender, input.expectedTenderHash);
  if (lease.tenderHash !== tender.tenderHash) fail("LEASE_TENDER_MISMATCH");
  if (lease.claimed) fail("DESCRIBED_INTERFACE_LEASE_ALREADY_CLAIMED");
  if (DateNow() >= Date.parse(lease.createDeadline)) fail("LEASE_EXPIRED");
  lease.claimed = true;
  const handoff = opaqueCapability();
  EFFECT_DRIVER_HANDOFFS.set(handoff, lease);
  return handoff;
}

export const runCloudflareDnsTxtInterfacePreflightV1
  = preflightCloudflareDnsTxtInterfaceV1;

/*
 * Optional effect driver.  Nothing below is reached by preflight or lease
 * claim.  The caller must explicitly create a driver (which only writes the
 * private durable intent) and then explicitly invoke each network phase.
 */

function byteHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function checkedHash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function checkedDriver(driver) {
  const state = EFFECT_DRIVERS.get(driver);
  if (state === undefined) fail("EFFECT_DRIVER_NOT_MODULE_ISSUED");
  return state;
}

function driverNow() {
  const milliseconds = DateNow();
  if (!Number.isSafeInteger(milliseconds)) fail("CLOCK_INVALID");
  return new Date(milliseconds).toISOString();
}

function operationNonceHash(domain) {
  return digest(domain, randomBytes(32).toString("hex"));
}

function createBinding(state) {
  const createBody = Object.freeze({
    type: "TXT",
    name: state.lease.fqdn,
    content: state.lease.outcomeCommitmentHash,
    ttl: TXT_TTL_SECONDS,
  });
  const bodyBytes = Buffer.from(JSON.stringify(createBody), "utf8");
  return {
    operation: "CREATE",
    effectIdHash: digest("outsider/cloudflare-dns-txt-create-effect/v1", {
      tenderHash: state.lease.tenderHash,
      outcomeCommitmentHash: state.lease.outcomeCommitmentHash,
      fqdn: state.lease.fqdn,
    }),
    transactionBindingHash: state.transactionBindingHash,
    endpointBindingHash: digest(
      "outsider/cloudflare-dns-txt-create-endpoint/v1", {
        origin: CLOUDFLARE_ORIGIN,
        zoneId: state.credential.zoneId,
        fqdn: state.lease.fqdn,
        method: "POST",
      }),
    adapterInstanceRefHash: state.adapterInstanceRefHash,
    permissionGrantHash: state.permissionGrantHash,
    oneUseNonceHash: operationNonceHash(
      "outsider/cloudflare-dns-txt-create-nonce/v1"),
    idempotencyKeyHash: operationNonceHash(
      "outsider/cloudflare-dns-txt-create-local-idempotency-key/v1"),
    bodyHash: byteHash(bodyBytes),
    effectDeadline: state.lease.createDeadline,
    bodyBytes,
    currentEvent: null,
  };
}

function deleteBinding(state) {
  if (typeof state.recordId !== "string" || !ZONE_ID.test(state.recordId)) {
    fail("DELETE_RECORD_ID_NOT_ESTABLISHED");
  }
  return {
    operation: "DELETE",
    effectIdHash: digest("outsider/cloudflare-dns-txt-delete-effect/v1", {
      createEffectIdHash: state.create.effectIdHash,
      recordId: state.recordId,
      fqdn: state.lease.fqdn,
    }),
    transactionBindingHash: state.transactionBindingHash,
    endpointBindingHash: digest(
      "outsider/cloudflare-dns-txt-delete-endpoint/v1", {
        origin: CLOUDFLARE_ORIGIN,
        zoneId: state.credential.zoneId,
        recordId: state.recordId,
        method: "DELETE",
      }),
    adapterInstanceRefHash: state.adapterInstanceRefHash,
    permissionGrantHash: state.permissionGrantHash,
    oneUseNonceHash: operationNonceHash(
      "outsider/cloudflare-dns-txt-delete-nonce/v1"),
    idempotencyKeyHash: operationNonceHash(
      "outsider/cloudflare-dns-txt-delete-local-idempotency-key/v1"),
    bodyHash: digest("outsider/cloudflare-dns-txt-delete-empty-body/v1", {
      recordId: state.recordId,
    }),
    effectDeadline: state.lease.deleteDeadline,
    bodyBytes: null,
    currentEvent: null,
  };
}

function ledgerEvent(state, binding, eventType, previousEffectEventHash,
  endpointReceiptHash = null, terminalEvidenceHash = null) {
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
    recordedAt: driverNow(),
    previousEffectEventHash,
    occurrenceNonceHash: operationNonceHash(
      `outsider/cloudflare-dns-txt-${binding.operation.toLowerCase()}-occurrence/v1`),
    endpointReceiptHash,
    terminalEvidenceHash,
  });
}

function appendDriverEvent(state, binding, eventType,
  endpointReceiptHash = null, terminalEvidenceHash = null) {
  const event = ledgerEvent(state, binding, eventType,
    binding.currentEvent?.eventHash ?? null,
    endpointReceiptHash, terminalEvidenceHash);
  const next = appendDurableOneUseEndpointEffectLedgerV1({
    directory: state.ledgerDirectory,
    ledgerId: state.ledgerId,
    event,
    expectedLocalHeadHash: state.verification.head.headHash,
  });
  state.verification = next;
  binding.currentEvent = event;
  return next;
}

function driverProjection(state, stage, callIo = {}) {
  const transitions = state.verification.head.transitionCounts;
  const privateBindingCommitmentHash = digest(
    "outsider/cloudflare-dns-txt-private-driver-binding/v1", {
      privateProjectionNonce: state.privateProjectionNonce,
      zoneId: state.credential.zoneId,
      fqdn: state.lease.fqdn,
      createEffectIdHash: state.create.effectIdHash,
      deleteEffectIdHash: state.delete?.effectIdHash ?? null,
      localHeadHash: state.verification.head.headHash,
    });
  const body = {
    schema:
      OUTSIDER_CLOUDFLARE_DNS_TXT_INTERFACE_V1_SCHEMAS.effectDriverProjection,
    schemaVersion: "1.0.0",
    recordClass: "CLOUDFLARE_DNS_TXT_ONE_USE_EFFECT_DRIVER",
    stage,
    planHash: state.planHash,
    tenderHash: state.lease.tenderHash,
    publicOutcomeCommitmentHash: state.lease.outcomeCommitmentHash,
    txtContentHash: state.lease.outcomeCommitmentHash,
    txtTtlSeconds: TXT_TTL_SECONDS,
    createDeadline: state.lease.createDeadline,
    witnessDeadline: state.lease.witnessDeadline,
    deleteDeadline: state.lease.deleteDeadline,
    durableOccurrenceCount: state.verification.head.exactOccurrenceCount,
    createPostAttemptOccurrenceCount:
      state.create.currentEvent === null ? 0
        : transitions.SUBMIT_ATTEMPTED > 0 ? 1 : 0,
    totalSubmitAttemptOccurrenceCount: transitions.SUBMIT_ATTEMPTED,
    totalProviderReceiptOccurrenceCount: transitions.ENDPOINT_RECEIPT_OBSERVED,
    createPostPerformedByThisCall: callIo.createPost === true,
    createReconcileGetPerformedByThisCall: callIo.createGet === true,
    googleDohGetPerformedByThisCall: callIo.googleGet === true,
    deletePerformedByThisCall: callIo.delete === true,
    deleteReconcileGetPerformedByThisCall: callIo.deleteGet === true,
    networkIoPerformedByThisCall: callIo.network === true,
    createProviderReceiptObserved: state.createProviderReceiptObserved,
    createProviderReceiptMeaning: state.createProviderReceiptObserved
      ? "CLOUDFLARE_RECORD_CREATE_OR_EXACT_PRESENCE_ACKNOWLEDGED_ONLY" : null,
    createProviderReceiptIsIndependentOutcomeTruth: false,
    createIndependentlyObserved: state.createWitnessObserved,
    createIndependentWitnessClass: state.createWitnessObserved
      ? "GOOGLE_PUBLIC_DNS_DOH" : null,
    createIndependentObservationEvidenceHash:
      state.createWitnessEvidenceHash,
    deleteProviderReceiptObserved: state.deleteProviderReceiptObserved,
    deleteProviderReceiptMeaning: state.deleteProviderReceiptObserved
      ? "CLOUDFLARE_DELETE_OR_EXACT_ABSENCE_ACKNOWLEDGED_ONLY" : null,
    deleteProviderReceiptIsIndependentRecoveryTruth: false,
    recoveryIndependentlyObserved: state.recoveryWitnessObserved,
    recoveryIndependentWitnessClass: state.recoveryWitnessObserved
      ? "GOOGLE_PUBLIC_DNS_DOH" : null,
    recoveryIndependentObservationEvidenceHash:
      state.recoveryWitnessEvidenceHash,
    createAutomaticRetryPerformed: false,
    deleteAutomaticRetryPerformed: false,
    recursiveDnsQueriedBeforeCreate: false,
    apiTokenProjected: false,
    zoneProjected: false,
    labelProjected: false,
    fqdnProjected: false,
    recordIdProjected: false,
    privateBindingHandlesProjected: false,
    privateBindingCommitmentHash,
    callerAssertedPermissionGrantOnly: true,
    structuralConformanceMintsAuthority: false,
    offerEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    resourceOwnerAuthorityEstablished: false,
    providerAcceptanceEstablished: false,
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
    OUTSIDER_CLOUDFLARE_DNS_TXT_INTERFACE_V1_SCHEMAS.effectDriverProjection,
    body) });
}

function driverResult(state, stage, callIo = {}) {
  return Object.freeze({ publicProjection:
    driverProjection(state, stage, callIo) });
}

function requestOptions(options) {
  exactObject(options, ["timeoutMs"], "EFFECT_REQUEST_OPTIONS");
  const timeoutMs = options.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1
    || timeoutMs > MAX_TIMEOUT_MS) fail("TIMEOUT_INVALID");
  return { timeoutMs };
}

function observationOptions(options) {
  exactObject(options, ["requestTimeoutMs", "pollIntervalMs", "maxWaitMs"],
    "OBSERVATION_OPTIONS");
  if (!Number.isSafeInteger(options.requestTimeoutMs)
    || options.requestTimeoutMs < 1
    || options.requestTimeoutMs > MAX_TIMEOUT_MS
    || !Number.isSafeInteger(options.pollIntervalMs)
    || options.pollIntervalMs < 1
    || options.pollIntervalMs > MAX_POLL_INTERVAL_MS
    || !Number.isSafeInteger(options.maxWaitMs)
    || options.maxWaitMs < 1
    || options.maxWaitMs > MAX_OBSERVATION_WAIT_MS) {
    fail("OBSERVATION_BOUNDS_INVALID");
  }
  return options;
}

async function jsonExchange(url, request, timeoutMs) {
  if (typeof Fetch !== "function") {
    return { contacted: false, timedOut: false, status: 0, body: null };
  }
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ contacted: true, timedOut: true, status: 0, body: null });
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
        return { contacted: true, timedOut: false,
          status: response.status, body: null };
      }
      const body = await boundedJson(response, controller);
      return { contacted: true, timedOut: false,
        status: response.status, body };
    } catch {
      return { contacted: true, timedOut: false, status: 0, body: null };
    }
  })();
  const result = await Promise.race([work, timeout]);
  clearTimeout(timer);
  return result;
}

function cloudflareHeaders(state, bodyBytes = null) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${state.credential.apiToken}`,
  };
  if (bodyBytes !== null) {
    headers["content-type"] = "application/json";
    headers["content-length"] = String(bodyBytes.length);
  }
  return Object.freeze(headers);
}

function exactRecordFromEnvelope(envelope, state) {
  const record = envelope?.result;
  if (envelope?.success !== true || record === null
    || typeof record !== "object" || Array.isArray(record)
    || typeof record.id !== "string" || !ZONE_ID.test(record.id)
    || record.type !== "TXT" || record.name !== state.lease.fqdn
    || record.content !== state.lease.outcomeCommitmentHash
    || record.ttl !== TXT_TTL_SECONDS) return null;
  return record;
}

function exactRecordFromList(envelope, state) {
  if (envelope?.success !== true || !Array.isArray(envelope.result)
    || envelope.result.length !== 1) return null;
  return exactRecordFromEnvelope({ success: true,
    result: envelope.result[0] }, state);
}

function exactRecordListUrl(state) {
  return fixedUrl(
    `${API_PREFIX}/zones/${state.credential.zoneId}/dns_records`, [
      ["type", "TXT"], ["name", state.lease.fqdn], ["per_page", "2"],
    ]);
}

function googleDohUrl(state) {
  const url = new URL("/resolve", GOOGLE_DOH_ORIGIN);
  url.searchParams.set("name", state.lease.fqdn);
  url.searchParams.set("type", "TXT");
  url.searchParams.set("do", "1");
  url.searchParams.set("edns_client_subnet", "0.0.0.0/0");
  if (url.origin !== GOOGLE_DOH_ORIGIN || url.pathname !== "/resolve") {
    fail("GOOGLE_DOH_FIXED_ORIGIN_INVARIANT_FAILED");
  }
  return url.href;
}

function googleTxtObserved(body, state) {
  if (body === null || typeof body !== "object" || body.Status !== 0
    || !Array.isArray(body.Answer)) return false;
  const quoted = `"${state.lease.outcomeCommitmentHash}"`;
  return body.Answer.some((answer) => answer !== null
    && typeof answer === "object" && answer.type === 16
    && (answer.data === quoted
      || answer.data === state.lease.outcomeCommitmentHash));
}

function googleTxtAbsent(body) {
  if (body === null || typeof body !== "object"
    || (body.Status !== 0 && body.Status !== 3)) return false;
  if (body.Status === 3) return true;
  if (body.Answer === undefined) return true;
  return Array.isArray(body.Answer)
    && !body.Answer.some((answer) => answer !== null
      && typeof answer === "object" && answer.type === 16);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pollGoogle(state, expectPresent, options, deadline) {
  const start = DateNow();
  const stopAt = Math.min(start + options.maxWaitMs, Date.parse(deadline));
  const maximumAttempts = Math.min(MAX_OBSERVATION_ATTEMPTS,
    Math.max(1, Math.ceil(options.maxWaitMs / options.pollIntervalMs)));
  let attempts = 0;
  let last = null;
  do {
    attempts += 1;
    last = await jsonExchange(googleDohUrl(state), {
      method: "GET",
      headers: Object.freeze({ Accept: "application/dns-json" }),
    }, options.requestTimeoutMs);
    if (last.status === 200 && last.body !== null) {
      const observed = expectPresent
        ? googleTxtObserved(last.body, state) : googleTxtAbsent(last.body);
      if (observed) return { observed: true, attempts,
        evidenceHash: digest("outsider/google-public-dns-doh-observation/v1", {
          expectedState: expectPresent ? "PRESENT" : "ABSENT",
          body: last.body,
        }) };
    }
    if (attempts >= maximumAttempts
      || DateNow() + options.pollIntervalMs >= stopAt) break;
    await wait(options.pollIntervalMs);
  } while (DateNow() < stopAt);
  return { observed: false, attempts, evidenceHash: null };
}

/**
 * Consume one claimed preflight handoff and durably admit the exact create
 * intent.  This function performs no network I/O and returns an opaque driver.
 */
export function createCloudflareDnsTxtEffectDriverV1(handoff, config = {}) {
  exactObject(config, ["ledgerDirectory", "ledgerId", "expectedTenderHash",
    "expectedOutcomeCommitmentHash", "adapterInstanceRefHash",
    "permissionGrantHash", "privateProjectionNonce"], "DRIVER_CONFIG");
  const lease = EFFECT_DRIVER_HANDOFFS.get(handoff);
  if (lease === undefined) fail("EFFECT_DRIVER_HANDOFF_NOT_MODULE_ISSUED");
  if (lease.driverConsumed) fail("EFFECT_DRIVER_HANDOFF_ALREADY_CONSUMED");
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
    || config.expectedOutcomeCommitmentHash !== lease.outcomeCommitmentHash) {
    fail("DRIVER_HANDOFF_BINDING_MISMATCH");
  }
  if (DateNow() >= Date.parse(lease.createDeadline)) {
    fail("EFFECT_DRIVER_HANDOFF_EXPIRED");
  }
  const credential = CREDENTIAL_CAPABILITIES.get(lease.credentialCapability);
  if (credential === undefined) fail("DRIVER_CREDENTIAL_CAPABILITY_LOST");
  const state = {
    lease,
    credential,
    ledgerDirectory: config.ledgerDirectory,
    ledgerId: config.ledgerId,
    adapterInstanceRefHash: config.adapterInstanceRefHash,
    permissionGrantHash: config.permissionGrantHash,
    privateProjectionNonce: config.privateProjectionNonce,
    transactionBindingHash: digest(
      "outsider/cloudflare-dns-txt-transaction-binding/v1", {
        tenderHash: lease.tenderHash,
        outcomeCommitmentHash: lease.outcomeCommitmentHash,
        fqdn: lease.fqdn,
        ttlSeconds: lease.ttlSeconds,
        createDeadline: lease.createDeadline,
        witnessDeadline: lease.witnessDeadline,
        deleteDeadline: lease.deleteDeadline,
      }),
    verification: null,
    create: null,
    delete: null,
    recordId: null,
    createProviderReceiptObserved: false,
    createWitnessObserved: false,
    createWitnessEvidenceHash: null,
    deleteProviderReceiptObserved: false,
    recoveryWitnessObserved: false,
    recoveryWitnessEvidenceHash: null,
    planHash: digest("outsider/cloudflare-dns-txt-effect-plan/v1", {
      tenderHash: lease.tenderHash,
      outcomeCommitmentHash: lease.outcomeCommitmentHash,
      zoneId: credential.zoneId,
      fqdn: lease.fqdn,
      ttlSeconds: lease.ttlSeconds,
      createDeadline: lease.createDeadline,
      witnessDeadline: lease.witnessDeadline,
      deleteDeadline: lease.deleteDeadline,
      createOrigin: CLOUDFLARE_ORIGIN,
      witnessOrigin: GOOGLE_DOH_ORIGIN,
    }),
  };
  state.create = createBinding(state);
  const intent = ledgerEvent(state, state.create, "INTENT_ADMITTED", null);
  state.verification = initializeDurableOneUseEndpointEffectLedgerV1({
    directory: state.ledgerDirectory,
    ledgerId: state.ledgerId,
    genesisEvent: intent,
  });
  state.create.currentEvent = intent;
  lease.driverConsumed = true;
  const driver = Object.freeze({ publicProjection:
    driverProjection(state, "DURABLY_ADMITTED_NO_NETWORK_HOLD") });
  EFFECT_DRIVERS.set(driver, state);
  return driver;
}

/** POST the exact TXT body once, only after SUBMIT_ATTEMPTED is durable. */
export async function createCloudflareDnsTxtRecordOnceV1(driver,
  input = {}, options = { timeoutMs: DEFAULT_TIMEOUT_MS }) {
  exactObject(input, ["expectedPlanHash"], "CREATE_INPUT");
  const state = checkedDriver(driver);
  if (checkedHash(input.expectedPlanHash, "EXPECTED_PLAN_HASH")
    !== state.planHash) fail("PLAN_HASH_MISMATCH");
  const checkedOptions = requestOptions(options);
  if (state.create.currentEvent.eventType === "ENDPOINT_RECEIPT_OBSERVED") {
    return driverResult(state, "CREATE_PROVIDER_RECEIPT_OBSERVED_HOLD");
  }
  if (state.create.currentEvent.eventType === "SUBMIT_ATTEMPTED") {
    return driverResult(state, "CREATE_COMMIT_UNKNOWN_READ_ONLY_RECONCILE_HOLD");
  }
  if (DateNow() >= Date.parse(state.lease.createDeadline)) {
    if (state.create.currentEvent.eventType === "INTENT_ADMITTED"
      || state.create.currentEvent.eventType === "SUBMIT_RESERVED") {
      appendDriverEvent(state, state.create, "EXPIRED_BEFORE_SUBMIT", null,
        digest("outsider/cloudflare-dns-txt-create-expired/v1", {
          planHash: state.planHash,
          createDeadline: state.lease.createDeadline,
        }));
    }
    return driverResult(state, "CREATE_EXPIRED_BEFORE_SUBMIT_HOLD");
  }
  if (state.create.currentEvent.eventType === "INTENT_ADMITTED") {
    appendDriverEvent(state, state.create, "SUBMIT_RESERVED");
  }
  if (state.create.currentEvent.eventType !== "SUBMIT_RESERVED") {
    fail("CREATE_STATE_INVALID");
  }
  appendDriverEvent(state, state.create, "SUBMIT_ATTEMPTED");
  const response = await jsonExchange(fixedUrl(
    `${API_PREFIX}/zones/${state.credential.zoneId}/dns_records`), {
      method: "POST",
      headers: cloudflareHeaders(state, state.create.bodyBytes),
      body: state.create.bodyBytes,
    }, checkedOptions.timeoutMs);
  const record = response.status === 200
    ? exactRecordFromEnvelope(response.body, state) : null;
  if (record === null) {
    return driverResult(state,
      "CREATE_COMMIT_UNKNOWN_READ_ONLY_RECONCILE_HOLD",
      { network: response.contacted, createPost: response.contacted });
  }
  state.recordId = record.id;
  appendDriverEvent(state, state.create, "ENDPOINT_RECEIPT_OBSERVED",
    digest("outsider/cloudflare-dns-txt-create-provider-receipt/v1", {
      status: response.status, body: response.body,
    }));
  state.createProviderReceiptObserved = true;
  return driverResult(state, "CREATE_PROVIDER_RECEIPT_OBSERVED_HOLD",
    { network: true, createPost: true });
}

/** Reconcile an ambiguous create using only the exact Cloudflare record GET. */
export async function reconcileCloudflareDnsTxtCreateV1(driver,
  input = {}, options = { timeoutMs: DEFAULT_TIMEOUT_MS }) {
  exactObject(input, ["expectedPlanHash"], "CREATE_RECONCILE_INPUT");
  const state = checkedDriver(driver);
  if (checkedHash(input.expectedPlanHash, "EXPECTED_PLAN_HASH")
    !== state.planHash) fail("PLAN_HASH_MISMATCH");
  const checkedOptions = requestOptions(options);
  if (state.create.currentEvent.eventType === "ENDPOINT_RECEIPT_OBSERVED") {
    return driverResult(state, "CREATE_PROVIDER_RECEIPT_OBSERVED_HOLD");
  }
  if (state.create.currentEvent.eventType !== "SUBMIT_ATTEMPTED") {
    fail("CREATE_RECONCILIATION_STATE_INVALID");
  }
  const response = await jsonExchange(exactRecordListUrl(state), {
    method: "GET", headers: cloudflareHeaders(state),
  }, checkedOptions.timeoutMs);
  const record = response.status === 200
    ? exactRecordFromList(response.body, state) : null;
  if (record === null) {
    return driverResult(state,
      "CREATE_COMMIT_UNKNOWN_READ_ONLY_RECONCILE_HOLD",
      { network: response.contacted, createGet: response.contacted });
  }
  state.recordId = record.id;
  appendDriverEvent(state, state.create, "ENDPOINT_RECEIPT_OBSERVED",
    digest("outsider/cloudflare-dns-txt-create-reconciliation-receipt/v1", {
      status: response.status, body: response.body,
    }));
  state.createProviderReceiptObserved = true;
  return driverResult(state, "CREATE_PROVIDER_RECEIPT_OBSERVED_HOLD",
    { network: true, createGet: true });
}

/** Observe presence through fixed-origin Google Public DNS DoH. */
export async function observeCloudflareDnsTxtCreationV1(driver,
  input = {}, options = { requestTimeoutMs: DEFAULT_TIMEOUT_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    maxWaitMs: MAX_OBSERVATION_WAIT_MS }) {
  exactObject(input, ["expectedPlanHash"], "CREATE_OBSERVE_INPUT");
  const state = checkedDriver(driver);
  if (checkedHash(input.expectedPlanHash, "EXPECTED_PLAN_HASH")
    !== state.planHash) fail("PLAN_HASH_MISMATCH");
  const checkedOptions = observationOptions(options);
  if (!state.createProviderReceiptObserved) {
    fail("CREATE_PROVIDER_RECEIPT_REQUIRED_BEFORE_DNS_OBSERVATION");
  }
  if (state.createWitnessObserved) {
    return driverResult(state, "CREATE_INDEPENDENTLY_OBSERVED_HOLD");
  }
  if (DateNow() >= Date.parse(state.lease.witnessDeadline)) {
    return driverResult(state, "CREATE_WITNESS_DEADLINE_EXPIRED_HOLD");
  }
  const observation = await pollGoogle(state, true, checkedOptions,
    state.lease.witnessDeadline);
  if (!observation.observed) {
    return driverResult(state, "CREATE_AWAITING_INDEPENDENT_OBSERVATION_HOLD",
      { network: observation.attempts > 0,
        googleGet: observation.attempts > 0 });
  }
  state.createWitnessObserved = true;
  state.createWitnessEvidenceHash = observation.evidenceHash;
  return driverResult(state, "CREATE_INDEPENDENTLY_OBSERVED_HOLD",
    { network: true, googleGet: true });
}

/** DELETE the exact created record once, after a durable delete attempt. */
export async function deleteCloudflareDnsTxtRecordOnceV1(driver,
  input = {}, options = { timeoutMs: DEFAULT_TIMEOUT_MS }) {
  exactObject(input, ["expectedPlanHash"], "DELETE_INPUT");
  const state = checkedDriver(driver);
  if (checkedHash(input.expectedPlanHash, "EXPECTED_PLAN_HASH")
    !== state.planHash) fail("PLAN_HASH_MISMATCH");
  const checkedOptions = requestOptions(options);
  if (!state.createProviderReceiptObserved || state.recordId === null) {
    fail("EXACT_CREATED_RECORD_REQUIRED_BEFORE_DELETE");
  }
  if (state.delete === null) state.delete = deleteBinding(state);
  if (state.delete.currentEvent?.eventType === "ENDPOINT_RECEIPT_OBSERVED") {
    return driverResult(state, "DELETE_PROVIDER_RECEIPT_OBSERVED_HOLD");
  }
  if (state.delete.currentEvent?.eventType === "SUBMIT_ATTEMPTED") {
    return driverResult(state, "DELETE_COMMIT_UNKNOWN_READ_ONLY_RECONCILE_HOLD");
  }
  if (DateNow() >= Date.parse(state.lease.deleteDeadline)) {
    return driverResult(state, "DELETE_DEADLINE_EXPIRED_RECOVERY_OPEN_HOLD");
  }
  if (state.delete.currentEvent === null) {
    appendDriverEvent(state, state.delete, "INTENT_ADMITTED");
  }
  appendDriverEvent(state, state.delete, "SUBMIT_RESERVED");
  appendDriverEvent(state, state.delete, "SUBMIT_ATTEMPTED");
  const response = await jsonExchange(fixedUrl(
    `${API_PREFIX}/zones/${state.credential.zoneId}/dns_records/${state.recordId}`), {
      method: "DELETE",
      headers: cloudflareHeaders(state),
    }, checkedOptions.timeoutMs);
  const valid = response.status === 200 && response.body?.success === true
    && response.body?.result?.id === state.recordId;
  if (!valid) {
    return driverResult(state,
      "DELETE_COMMIT_UNKNOWN_READ_ONLY_RECONCILE_HOLD",
      { network: response.contacted, delete: response.contacted });
  }
  appendDriverEvent(state, state.delete, "ENDPOINT_RECEIPT_OBSERVED",
    digest("outsider/cloudflare-dns-txt-delete-provider-receipt/v1", {
      status: response.status, body: response.body,
    }));
  state.deleteProviderReceiptObserved = true;
  return driverResult(state, "DELETE_PROVIDER_RECEIPT_OBSERVED_HOLD",
    { network: true, delete: true });
}

/** Reconcile an ambiguous delete by proving exact Cloudflare-list absence. */
export async function reconcileCloudflareDnsTxtDeleteV1(driver,
  input = {}, options = { timeoutMs: DEFAULT_TIMEOUT_MS }) {
  exactObject(input, ["expectedPlanHash"], "DELETE_RECONCILE_INPUT");
  const state = checkedDriver(driver);
  if (checkedHash(input.expectedPlanHash, "EXPECTED_PLAN_HASH")
    !== state.planHash) fail("PLAN_HASH_MISMATCH");
  const checkedOptions = requestOptions(options);
  if (state.deleteProviderReceiptObserved) {
    return driverResult(state, "DELETE_PROVIDER_RECEIPT_OBSERVED_HOLD");
  }
  if (state.delete?.currentEvent?.eventType !== "SUBMIT_ATTEMPTED") {
    fail("DELETE_RECONCILIATION_STATE_INVALID");
  }
  const response = await jsonExchange(exactRecordListUrl(state), {
    method: "GET", headers: cloudflareHeaders(state),
  }, checkedOptions.timeoutMs);
  const absent = response.status === 200 && response.body?.success === true
    && Array.isArray(response.body.result)
    && response.body.result.length === 0;
  if (!absent) {
    return driverResult(state,
      "DELETE_COMMIT_UNKNOWN_READ_ONLY_RECONCILE_HOLD",
      { network: response.contacted, deleteGet: response.contacted });
  }
  appendDriverEvent(state, state.delete, "ENDPOINT_RECEIPT_OBSERVED",
    digest("outsider/cloudflare-dns-txt-delete-reconciliation-receipt/v1", {
      status: response.status, body: response.body,
    }));
  state.deleteProviderReceiptObserved = true;
  return driverResult(state, "DELETE_PROVIDER_RECEIPT_OBSERVED_HOLD",
    { network: true, deleteGet: true });
}

/** Observe post-delete absence; delete ACK alone never closes recovery. */
export async function observeCloudflareDnsTxtRecoveryV1(driver,
  input = {}, options = { requestTimeoutMs: DEFAULT_TIMEOUT_MS,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    maxWaitMs: MAX_OBSERVATION_WAIT_MS }) {
  exactObject(input, ["expectedPlanHash"], "RECOVERY_OBSERVE_INPUT");
  const state = checkedDriver(driver);
  if (checkedHash(input.expectedPlanHash, "EXPECTED_PLAN_HASH")
    !== state.planHash) fail("PLAN_HASH_MISMATCH");
  const checkedOptions = observationOptions(options);
  if (!state.createWitnessObserved) {
    fail("INDEPENDENT_CREATE_OBSERVATION_REQUIRED_BEFORE_RECOVERY_OBSERVATION");
  }
  if (!state.deleteProviderReceiptObserved) {
    fail("DELETE_PROVIDER_RECEIPT_REQUIRED_BEFORE_RECOVERY_OBSERVATION");
  }
  if (state.recoveryWitnessObserved) {
    return driverResult(state, "RECOVERY_INDEPENDENTLY_OBSERVED_HOLD");
  }
  if (DateNow() >= Date.parse(state.lease.deleteDeadline)) {
    return driverResult(state, "RECOVERY_WITNESS_DEADLINE_EXPIRED_HOLD");
  }
  const observation = await pollGoogle(state, false, checkedOptions,
    state.lease.deleteDeadline);
  if (!observation.observed) {
    return driverResult(state, "RECOVERY_AWAITING_INDEPENDENT_OBSERVATION_HOLD",
      { network: observation.attempts > 0,
        googleGet: observation.attempts > 0 });
  }
  state.recoveryWitnessObserved = true;
  state.recoveryWitnessEvidenceHash = observation.evidenceHash;
  return driverResult(state, "RECOVERY_INDEPENDENTLY_OBSERVED_HOLD",
    { network: true, googleGet: true });
}
