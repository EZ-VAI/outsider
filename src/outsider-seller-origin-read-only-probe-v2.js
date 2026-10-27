/*
 * One-lease seller-origin read-only probe v2.
 *
 * This is the single private consumer of an order-scoped seller-origin lease.
 * It first checks the seller-owned /.well-known/outsider descriptor. Only when
 * that is absent or incompatible does it inspect the seller's Web root for
 * native forms, mailto links, and schema.org EntryPoints. No branch can POST,
 * submit, send mail, pay, reserve capacity, or project an origin/target.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { claimOrderScopedSellerOriginV1 }
  from "./outsider-order-scoped-seller-origin-lease-v1.js";
import {
  OUTSIDER_PUBLIC_HTTPS_READ_ONLY_FETCH_TRANSPORT_V1_LIMITS,
  createPinnedPublicHttpsFetchV1,
} from "./outsider-public-https-read-only-fetch-transport-v1.js";
import {
  claimWebNativeTransactionSurfaceLeaseV1,
  discoverWebNativeTransactionSurfacesV1,
} from "./outsider-web-native-transaction-surface-discovery-adapter-v1.js";

const PREFIX = "OUTSIDER_SELLER_ORIGIN_READ_ONLY_PROBE_V2_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const REQUIREMENT_ID = /^(?:resource|evidence|recovery)_[a-f0-9]{32}$/u;
const ORIGIN_BINDING_FIELDS = Object.freeze([
  "tenderHash", "workOrderHash", "typedGraphHash", "occurrenceId",
  "nodeSlotId", "nodeKind", "requirementKind", "requirementId",
  "requirementSetHash", "requirementObjectHash", "expiresAt",
]);
const DESCRIPTOR_SCHEMA
  = "https://outsider.network/schemas/transaction-interface/v1";
const MAXIMUM_DESCRIPTOR_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAXIMUM_TIMEOUT_MS = 30_000;
const DEFAULT_MAXIMUM_WEB_DOCUMENT_BYTES = 512 * 1024;
const DEFAULT_MAXIMUM_WEB_REDIRECTS = 2;
const MAXIMUM_WEB_OBSERVATION_LEASE_MS = 24 * 60 * 60 * 1000;
const PRIVATE_RESULTS = new WeakMap();

export const OUTSIDER_SELLER_ORIGIN_READ_ONLY_PROBE_V2_BOUNDARY = deepFreeze({
  position: "ONE_SELLER_ORIGIN_LEASE_DESCRIPTOR_THEN_WEB_NATIVE_READ_ONLY",
  genericOrderScopedSellerOriginLeaseRequired: true,
  sellerOriginLeaseMaximumClaims: 1,
  sellerOriginLeaseClaimCountPerInvocation: 1,
  descriptorPath: "/.well-known/outsider",
  descriptorProbeMaximumRequests: 1,
  webNativeFallbackOnlyAfterDescriptorNotCompatible: true,
  webNativeFallbackMaximumInitialDocuments: 1,
  webNativeFallbackDefaultMaximumRedirects: DEFAULT_MAXIMUM_WEB_REDIRECTS,
  maximumBraveRequests: 0,
  secondExternalDiscoverySearchRequestPermitted: false,
  publicHttpsPinnedTransportRequired: true,
  sameOriginOnly: true,
  onlyNetworkMethod: "GET",
  postPerformed: false,
  formSubmitted: false,
  emailSent: false,
  paymentPerformed: false,
  tenderDelivered: false,
  rawSellerOriginProjected: false,
  rawSellerTargetProjected: false,
  rawSellerDocumentProjected: false,
  sourceStatusBodyHashAndBytesReplayed: true,
  observedDescriptorIsNotContactAuthority: true,
  observedWebSurfaceIsNotPermission: true,
  observedWebSurfaceIsNotAcceptance: true,
  observedWebSurfaceIsNotCapacity: true,
  observedWebSurfaceIsNotPrice: true,
  resourceOwnerAuthorityEstablished: false,
  providerAcceptanceEstablished: false,
  capacityReserved: false,
  priceEstablished: false,
  authority: "NONE",
  decisionState: "HOLD",
  actionReady: false,
  executable: false,
});

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value))) {
    if (Object.hasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
}

function plain(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) fail(`${code}_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_INVALID`);
  }
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, "value")) fail(`${code}_INVALID`);
  }
  return value;
}

function exact(value, fields, code) {
  plain(value, code);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) =>
    typeof key !== "string" || !fields.includes(key))) fail(`${code}_INVALID`);
  return value;
}

function options(value, fields, code) {
  plain(value, code);
  if (Reflect.ownKeys(value).some((key) =>
    typeof key !== "string" || !fields.includes(key))) fail(`${code}_INVALID`);
  return value;
}

function instant(raw, code) {
  if (typeof raw !== "string" || !INSTANT.test(raw)) fail(code);
  const milliseconds = Date.parse(raw);
  if (!Number.isFinite(milliseconds)
    || new Date(milliseconds).toISOString() !== raw) fail(code);
  return milliseconds;
}

function hashBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function privateRef(nonce, tenderHash, requirementId, kind, value) {
  return `sha256:${createHash("sha256")
    .update("outsider/seller-origin-read-only-probe-private-ref/v2\0")
    .update(nonce).update("\0").update(tenderHash).update("\0")
    .update(requirementId).update("\0").update(kind).update("\0")
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function projectionHash(value) {
  return `sha256:${createHash("sha256")
    .update("outsider/seller-origin-read-only-probe-projection/v2\0")
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function safeFailure(error) {
  if (typeof error?.outsiderCode === "string"
    && /^[A-Z0-9_]{1,160}$/u.test(error.outsiderCode)) {
    return error.outsiderCode;
  }
  if (typeof error?.message === "string"
    && /^OUTSIDER_[A-Z0-9_]{1,200}$/u.test(error.message)) {
    return error.message;
  }
  return "SOURCE_UNAVAILABLE";
}

async function responseBytes(response) {
  if (response === null || typeof response !== "object"
    || !Number.isSafeInteger(response.status) || response.status < 100
    || response.status > 599 || response.headers === null
    || typeof response.headers !== "object"
    || typeof response.headers.get !== "function"
    || typeof response.arrayBuffer !== "function") {
    fail("DESCRIPTOR_RESPONSE_INVALID");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared)
    || Number(declared) > MAXIMUM_DESCRIPTOR_BYTES)) {
    fail("DESCRIPTOR_TOO_LARGE");
  }
  const raw = await response.arrayBuffer();
  if (!(raw instanceof ArrayBuffer)) fail("DESCRIPTOR_RESPONSE_INVALID");
  const bytes = Buffer.from(raw);
  if (bytes.length > MAXIMUM_DESCRIPTOR_BYTES) fail("DESCRIPTOR_TOO_LARGE");
  return { status: response.status, headers: response.headers, bytes };
}

function descriptorBody(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return { ok: false, failureCode: "DESCRIPTOR_ENCODING_UNSUPPORTED" }; }
  let body;
  try { body = JSON.parse(text); }
  catch { return { ok: false, failureCode: "DESCRIPTOR_JSON_INVALID" }; }
  if (body === null || typeof body !== "object" || Array.isArray(body)
    || Reflect.ownKeys(body).length !== 5
    || !["schema", "version", "expiresAt", "machineUse", "oneUseTender"]
      .every((field) => Object.hasOwn(body, field))) {
    return { ok: false, failureCode: "DESCRIPTOR_SHAPE_INVALID" };
  }
  const tender = body.oneUseTender;
  if (tender === null || typeof tender !== "object" || Array.isArray(tender)
    || Reflect.ownKeys(tender).length !== 4
    || !["accepted", "endpoint", "method", "contentType"]
      .every((field) => Object.hasOwn(tender, field))) {
    return { ok: false, failureCode: "DESCRIPTOR_SHAPE_INVALID" };
  }
  return { ok: true, body };
}

async function probeDescriptor(origin, input, config, timeoutMs) {
  const fetchImpl = createPinnedPublicHttpsFetchV1({ ...config,
    timeoutMs: Math.min(timeoutMs,
      OUTSIDER_PUBLIC_HTTPS_READ_ONLY_FETCH_TRANSPORT_V1_LIMITS.maximumTimeoutMs),
    maximumResponseBytes: MAXIMUM_DESCRIPTOR_BYTES });
  const response = await fetchImpl(`${origin}/.well-known/outsider`, {
    method: "GET", headers: { Accept: "application/json" },
    redirect: "error", credentials: "omit",
    signal: new AbortController().signal,
  });
  const read = await responseBytes(response);
  const sourceReplay = {
    requestCount: 1,
    requestRefHash: privateRef(input.privateBindingNonce,
      input.originBinding.tenderHash, input.originBinding.requirementId,
      "DESCRIPTOR_REQUEST", `${origin}/.well-known/outsider`),
    status: read.status,
    bodyHash: hashBytes(read.bytes),
    bodyBytes: read.bytes.length,
    bodyRepresentation: "EXACT_RAW_RESPONSE_BYTES_FROM_PINNED_TRANSPORT",
  };
  if (read.status < 200 || read.status > 299) {
    return { compatible: false, failureCode: "DESCRIPTOR_HTTP_STATUS",
      sourceReplay, endpoint: null, endpointRefHash: null };
  }
  if (!/^application\/json(?:\s*;|\s*$)/iu.test(
    read.headers.get("content-type") ?? "")) {
    return { compatible: false, failureCode: "DESCRIPTOR_CONTENT_TYPE_INVALID",
      sourceReplay, endpoint: null, endpointRefHash: null };
  }
  const parsed = descriptorBody(read.bytes);
  if (!parsed.ok) return { compatible: false,
    failureCode: parsed.failureCode, sourceReplay, endpoint: null,
    endpointRefHash: null };
  const body = parsed.body;
  let endpoint;
  try { endpoint = new URL(body.oneUseTender.endpoint); } catch {
    return { compatible: false, failureCode: "DESCRIPTOR_ENDPOINT_INVALID",
      sourceReplay, endpoint: null, endpointRefHash: null };
  }
  const descriptorExpiry = Date.parse(body.expiresAt);
  const asOfMs = Date.parse(input.asOf);
  const expiresAtMs = Date.parse(input.expiresAt);
  if (body.schema !== DESCRIPTOR_SCHEMA || body.version !== "1.0.0"
    || body.machineUse !== true || body.oneUseTender.accepted !== true
    || body.oneUseTender.method !== "POST"
    || body.oneUseTender.contentType !== "application/json"
    || endpoint.origin !== origin || endpoint.protocol !== "https:"
    || endpoint.username || endpoint.password || endpoint.port || endpoint.hash
    || !Number.isFinite(descriptorExpiry)
    || new Date(descriptorExpiry).toISOString() !== body.expiresAt
    || descriptorExpiry <= asOfMs || descriptorExpiry > expiresAtMs
    || descriptorExpiry - asOfMs > 30 * 86400000) {
    return { compatible: false, failureCode: "DESCRIPTOR_POLICY_INVALID",
      sourceReplay, endpoint: null, endpointRefHash: null };
  }
  return { compatible: true, failureCode: null, sourceReplay,
    endpoint: endpoint.href, sourceExpiresAt: body.expiresAt,
    endpointRefHash: privateRef(input.privateBindingNonce,
      input.originBinding.tenderHash, input.originBinding.requirementId,
      "OUTSIDER_DESCRIPTOR_ENDPOINT", endpoint.href) };
}

export function preflightSellerOriginReadOnlyProbeV2(dependencies = {}) {
  options(dependencies, ["transportConfig", "timeoutMs",
    "maximumWebDocumentBytes", "maximumWebRedirects"], "DEPENDENCIES");
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maximumWebDocumentBytes = dependencies.maximumWebDocumentBytes
    ?? DEFAULT_MAXIMUM_WEB_DOCUMENT_BYTES;
  const maximumWebRedirects = dependencies.maximumWebRedirects
    ?? DEFAULT_MAXIMUM_WEB_REDIRECTS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1
    || timeoutMs > MAXIMUM_TIMEOUT_MS
    || !Number.isSafeInteger(maximumWebDocumentBytes)
    || maximumWebDocumentBytes < 1 || maximumWebDocumentBytes > 2 * 1024 * 1024
    || !Number.isSafeInteger(maximumWebRedirects)
    || maximumWebRedirects < 0 || maximumWebRedirects > 5) {
    fail("LIMIT_INVALID");
  }
  const transportConfig = dependencies.transportConfig ?? {};
  plain(transportConfig, "TRANSPORT_CONFIG");
  const transportSnapshot = Object.freeze({ ...transportConfig });
  /* Both factories are side-effect free. The first validates caller-supplied
   * transport limits instead of silently shadowing invalid values; the second
   * validates the exact bounded configuration this probe will use. Do this
   * before claiming a one-use seller-origin lease. */
  createPinnedPublicHttpsFetchV1(transportSnapshot);
  createPinnedPublicHttpsFetchV1({ ...transportSnapshot,
    timeoutMs: Math.min(timeoutMs,
      OUTSIDER_PUBLIC_HTTPS_READ_ONLY_FETCH_TRANSPORT_V1_LIMITS.maximumTimeoutMs),
    maximumResponseBytes: MAXIMUM_DESCRIPTOR_BYTES });
  return Object.freeze({ transportConfig: transportSnapshot, timeoutMs,
    maximumWebDocumentBytes, maximumWebRedirects });
}

export async function probeSellerOriginReadOnlyV2(input, dependencies = {}) {
  exact(input, ["sellerOriginLease", "originBinding", "asOf", "expiresAt",
    "privateBindingNonce"], "INPUT");
  exact(input.originBinding, ORIGIN_BINDING_FIELDS, "ORIGIN_BINDING");
  if (typeof input.privateBindingNonce !== "string"
    || !HASH.test(input.privateBindingNonce)
    || typeof input.originBinding.tenderHash !== "string"
    || !HASH.test(input.originBinding.tenderHash)
    || typeof input.originBinding.requirementId !== "string"
    || !REQUIREMENT_ID.test(input.originBinding.requirementId)) {
    fail("BINDING_INVALID");
  }
  const asOfMs = instant(input.asOf, "AS_OF_INVALID");
  const expiresAtMs = instant(input.expiresAt, "EXPIRES_AT_INVALID");
  if (asOfMs >= expiresAtMs || input.originBinding.expiresAt !== input.expiresAt) {
    fail("TIME_BINDING_INVALID");
  }
  const normalizedDependencies
    = preflightSellerOriginReadOnlyProbeV2(dependencies);
  const { transportConfig, timeoutMs, maximumWebDocumentBytes,
    maximumWebRedirects } = normalizedDependencies;
  const localNowBeforeClaim = Date.now();
  if (localNowBeforeClaim >= expiresAtMs) fail("LEASE_EXPIRED_BEFORE_PROBE");
  const deadline = Math.min(localNowBeforeClaim + timeoutMs, expiresAtMs);
  const claimed = claimOrderScopedSellerOriginV1(input.sellerOriginLease,
    input.originBinding);
  if (claimed.tenderHash !== input.originBinding.tenderHash
    || claimed.expiresAt !== input.expiresAt) fail("LEASE_BINDING_INVALID");
  const descriptorRemainingMs = deadline - Date.now();
  if (descriptorRemainingMs < 1) fail("LEASE_EXPIRED_BEFORE_DESCRIPTOR");
  let descriptor;
  try {
    descriptor = await probeDescriptor(claimed.origin, input,
      transportConfig, descriptorRemainingMs);
  } catch (error) {
    descriptor = { compatible: false, failureCode: safeFailure(error),
      sourceReplay: null, endpoint: null, endpointRefHash: null };
  }
  let webNativeResult = null;
  let webNativeFailureCode = null;
  let webNativeInvoked = false;
  const webNativeExpiresAt = new Date(Math.min(expiresAtMs,
    asOfMs + MAXIMUM_WEB_OBSERVATION_LEASE_MS)).toISOString();
  if (!descriptor.compatible) {
    const remainingMs = deadline - Date.now();
    if (remainingMs < 1) webNativeFailureCode = "TIME_BUDGET_EXHAUSTED";
    else {
      try {
        webNativeInvoked = true;
        webNativeResult = await discoverWebNativeTransactionSurfacesV1({
          sellerOrigin: claimed.origin,
          tenderHash: input.originBinding.tenderHash,
          requirementId: input.originBinding.requirementId,
          observedAt: input.asOf,
          expiresAt: webNativeExpiresAt,
          privateProjectionNonce: input.privateBindingNonce,
        }, {
          transportConfig,
          timeoutMs: remainingMs,
          maximumDocumentBytes: maximumWebDocumentBytes,
          maximumRedirects: maximumWebRedirects,
        });
      } catch (error) { webNativeFailureCode = safeFailure(error); }
    }
  }
  const webProjection = webNativeResult?.publicProjection ?? null;
  const webSurfaceCount = webProjection?.surfaceOccurrenceCount ?? 0;
  const status = descriptor.compatible ? "OUTSIDER_DESCRIPTOR_OBSERVED"
    : webProjection?.status === "SURFACES_OBSERVED"
      ? "WEB_NATIVE_SURFACES_OBSERVED"
      : webProjection !== null ? "NO_SUPPORTED_SURFACE_OBSERVED"
        : "SELLER_READ_FAILED";
  const projection = {
    schema: "outsider/seller-origin-read-only-probe/v2",
    schemaVersion: "2.0.0", tenderHash: input.originBinding.tenderHash,
    requirementKind: input.originBinding.requirementKind,
    requirementId: input.originBinding.requirementId,
    observedAt: input.asOf, expiresAt: input.expiresAt, status,
    sellerOriginLeaseClaimCount: 1,
    additionalSellerOriginLeaseClaimCount: 0,
    externalDiscoverySearchRequestCount: 0,
    descriptorProbe: {
      attempted: true, compatible: descriptor.compatible,
      failureCode: descriptor.failureCode,
      endpointRefHash: descriptor.endpointRefHash,
      sourceReplay: descriptor.sourceReplay,
    },
    webNativeFallback: {
      attempted: webNativeInvoked,
      requiredByDescriptorResult: !descriptor.compatible,
      failureCode: webNativeFailureCode,
      observationExpiresAt: webNativeExpiresAt,
      surfaceOccurrenceCount: webSurfaceCount,
      projection: webProjection,
    },
    selectedSurfaceFamily: descriptor.compatible ? "OUTSIDER_DESCRIPTOR"
      : webSurfaceCount > 0 ? "WEB_NATIVE_OBSERVATION" : null,
    sellerOriginProjected: false, sellerTargetProjected: false,
    sellerDocumentProjected: false, queryProjected: false,
    providerContactPerformed: false, tenderDelivered: false,
    formSubmitted: false, emailSent: false, paymentPerformed: false,
    observationIsNotPermissionAcceptanceCapacityOrPrice: true,
    resourceOwnerAuthorityEstablished: false,
    providerAcceptanceEstablished: false, capacityReserved: false,
    priceEstablished: false, authority: "NONE", decisionState: "HOLD",
    actionReady: false, executable: false,
    boundary: OUTSIDER_SELLER_ORIGIN_READ_ONLY_PROBE_V2_BOUNDARY,
  };
  projection.projectionHash = projectionHash(projection);
  const result = deepFreeze({
    schema: "outsider/seller-origin-read-only-private-lease/v2",
    schemaVersion: "2.0.0", publicProjection: deepFreeze(projection),
  });
  const sourceExpiresAt = descriptor.compatible
    ? descriptor.sourceExpiresAt
    : webNativeResult !== null ? webNativeExpiresAt : null;
  PRIVATE_RESULTS.set(result, { consumed: false,
    descriptorEndpoint: descriptor.endpoint,
    webNativeResult, tenderHash: input.originBinding.tenderHash,
    requirementId: input.originBinding.requirementId,
    orderLeaseExpiresAt: input.expiresAt, sourceExpiresAt,
    projectionHash: projection.projectionHash,
    selectedSurfaceFamily: projection.selectedSurfaceFamily });
  return result;
}

export function claimSellerOriginReadOnlyProbePrivateV2(result) {
  const state = PRIVATE_RESULTS.get(result);
  if (state === undefined || state.consumed) fail("PRIVATE_LEASE_INVALID_OR_REPLAYED");
  state.consumed = true;
  let observations = [];
  if (state.descriptorEndpoint !== null) {
    observations = [{ surfaceKind: "OUTSIDER_DESCRIPTOR",
      targetKind: "HTTPS_URL", target: state.descriptorEndpoint,
      methodCode: "POST", expiresAt: state.sourceExpiresAt,
      invocationPermittedByObservation: false,
      authorityEstablished: false, providerAcceptanceEstablished: false,
      capacityReserved: false }];
  } else if (state.webNativeResult !== null) {
    observations = claimWebNativeTransactionSurfaceLeaseV1(
      state.webNativeResult).observations;
  }
  return deepFreeze({
    schema: "outsider/seller-origin-read-only-private-claim/v2",
    schemaVersion: "2.0.0", tenderHash: state.tenderHash,
    requirementId: state.requirementId,
    orderLeaseExpiresAt: state.orderLeaseExpiresAt,
    sourceObservationExpiresAt: state.sourceExpiresAt,
    publicProjectionHash: state.projectionHash,
    selectedSurfaceFamily: state.selectedSurfaceFamily, observations,
    invocationPermitted: false, permissionEstablished: false,
    providerAcceptanceEstablished: false, capacityReserved: false,
    authority: "NONE", decisionState: "HOLD",
  });
}
