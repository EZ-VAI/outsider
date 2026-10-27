/* Seller-controlled /.well-known/outsider interface discovery v1. */

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { claimBraveSearchCandidateForSellerObservationV1 }
  from "./outsider-brave-search-route-discovery-adapter-v1.js";
import { claimOrderScopedDiscoveryNodeResultV1 }
  from "./outsider-order-scoped-discovery-federation-v1.js";
import { createPinnedPublicHttpsFetchV1 }
  from "./outsider-public-https-read-only-fetch-transport-v1.js";

const PREFIX = "OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const OCCURRENCE = /^discovery_[a-f0-9]{32}$/u;
const INSTANT = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const DESCRIPTOR_SCHEMA = "https://outsider.network/schemas/transaction-interface/v1";
const MAX_DESCRIPTOR_BYTES = 256 * 1024;
const MAX_LEASE_MS = 30 * 24 * 60 * 60 * 1000;
const ORIGIN_LEASES = new WeakMap();
const RESULTS = new WeakMap();

const fail = (code) => { throw new TypeError(`${PREFIX}${code}`); };
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${code}_OBJECT_INVALID`);
  if (Reflect.ownKeys(value).length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
}

function instant(value, code) {
  if (typeof value !== "string" || !INSTANT.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function safeOrigin(raw) {
  let url;
  try { url = new URL(raw); } catch { fail("SELLER_ORIGIN_INVALID"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username !== "" || url.password !== ""
    || url.port !== "" || host === "localhost" || host.endsWith(".localhost")
    || host.endsWith(".local") || isIP(host) !== 0) fail("SELLER_ORIGIN_INVALID");
  return url.origin;
}

export const OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V1_SCHEMAS
  = Object.freeze({
    descriptor: DESCRIPTOR_SCHEMA,
    sellerOriginLease: "outsider/seller-origin-private-one-use-lease/v1",
    publicProjection: "outsider/seller-transaction-interface-privacy-closed-summary/v1",
    endpointLease: "outsider/seller-transaction-interface-private-one-use-endpoint-lease/v1",
  });

export const OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V1_BOUNDARY
  = deepFreeze({
    position: "SELLER_CONTROLLED_WELL_KNOWN_INTERFACE_DESCRIBED_HOLD",
    path: "/.well-known/outsider", discoveryMethod: "GET",
    pinnedPublicHttpsTransportRequired: true, sameOriginEndpointRequired: true,
    maximumDiscoveryRequests: 1, retriesPermitted: false,
    redirectsPermitted: false, maximumDescriptorBytes: MAX_DESCRIPTOR_BYTES,
    maximumDescriptorLeaseMs: MAX_LEASE_MS,
    machineUseDeclarationRequired: true, oneUseTenderDeclarationRequired: true,
    endpointInvocationPerformed: false, paymentPerformed: false,
    domainProjected: false, endpointProjected: false, contactProjected: false,
    rawDescriptorProjected: false, sellerIdentityEstablished: false,
    sellerDomainControlEstablished: false, resourceOwnerAuthorityEstablished: false,
    providerAcceptanceEstablished: false, capacityEstablished: false,
    capacityReserved: false, authority: "NONE", decisionState: "HOLD",
    actionReady: false, executable: false,
  });

export function importSellerOriginFromBraveFederationV1(input) {
  exact(input, ["federationResult", "expectedTenderHash", "occurrenceId",
    "candidateIndex"], "ORIGIN_IMPORT_INPUT");
  if (typeof input.expectedTenderHash !== "string" || !HASH.test(input.expectedTenderHash)) {
    fail("EXPECTED_TENDER_HASH_INVALID");
  }
  if (typeof input.occurrenceId !== "string" || !OCCURRENCE.test(input.occurrenceId)
    || !Number.isSafeInteger(input.candidateIndex) || input.candidateIndex < 0) {
    fail("ORIGIN_IMPORT_BINDING_INVALID");
  }
  const occurrence = input.federationResult?.publicProjection?.occurrences?.find?.(
    (row) => row.occurrenceId === input.occurrenceId);
  if (!occurrence || occurrence.nodeKind !== "brave.web_search.v1"
    || occurrence.status !== "SUCCEEDED"
    || input.federationResult.publicProjection.tenderHash !== input.expectedTenderHash) {
    fail("ORIGIN_IMPORT_OCCURRENCE_INVALID");
  }
  const privateResult = claimOrderScopedDiscoveryNodeResultV1(
    input.federationResult, input.occurrenceId);
  const candidate = claimBraveSearchCandidateForSellerObservationV1(
    privateResult, input.candidateIndex);
  const origin = safeOrigin(candidate.sellerUrl);
  const lease = deepFreeze({
    schema: OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V1_SCHEMAS.sellerOriginLease,
    schemaVersion: "1.0.0", tenderHash: input.expectedTenderHash,
    occurrenceId: input.occurrenceId,
    originProjected: false, consumableOnce: true,
  });
  ORIGIN_LEASES.set(lease, { origin, consumed: false });
  return lease;
}

function endpoint(raw, origin) {
  let url;
  try { url = new URL(raw); } catch { fail("ENDPOINT_INVALID"); }
  if (url.origin !== origin || url.protocol !== "https:" || url.username !== ""
    || url.password !== "" || url.port !== "" || url.hash !== "") fail("ENDPOINT_NOT_SAME_ORIGIN");
  return url.href;
}

function descriptor(raw, origin, asOf, requestedExpiry) {
  exact(raw, ["schema", "version", "expiresAt", "machineUse",
    "oneUseTender"], "DESCRIPTOR");
  if (raw.schema !== DESCRIPTOR_SCHEMA || raw.version !== "1.0.0"
    || raw.machineUse !== true) fail("DESCRIPTOR_POLICY_INVALID");
  const expiresAt = instant(raw.expiresAt, "DESCRIPTOR_EXPIRY_INVALID");
  if (Date.parse(expiresAt) <= Date.parse(asOf)
    || Date.parse(expiresAt) > Date.parse(requestedExpiry)
    || Date.parse(expiresAt) - Date.parse(asOf) > MAX_LEASE_MS) {
    fail("DESCRIPTOR_EXPIRY_INVALID");
  }
  exact(raw.oneUseTender, ["accepted", "endpoint", "method", "contentType"],
    "ONE_USE_TENDER");
  if (raw.oneUseTender.accepted !== true || raw.oneUseTender.method !== "POST"
    || raw.oneUseTender.contentType !== "application/json") {
    fail("DESCRIPTOR_POLICY_INVALID");
  }
  return { expiresAt, endpoint: endpoint(raw.oneUseTender.endpoint, origin) };
}

async function boundedJson(response) {
  const type = response.headers?.get?.("content-type");
  if (typeof type !== "string" || !/^application\/json(?:\s*;|\s*$)/iu.test(type)) {
    fail("DESCRIPTOR_CONTENT_TYPE_INVALID");
  }
  const length = response.headers?.get?.("content-length");
  if (length !== null && length !== undefined && length !== "") {
    const bytes = Number(length);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_DESCRIPTOR_BYTES) {
      fail("DESCRIPTOR_TOO_LARGE");
    }
  }
  const text = await response.text();
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_DESCRIPTOR_BYTES) {
    fail("DESCRIPTOR_TOO_LARGE");
  }
  try { return JSON.parse(text); } catch { fail("DESCRIPTOR_JSON_INVALID"); }
}

export async function discoverSellerTransactionInterfaceV1(input, dependencies) {
  exact(input, ["sellerOriginLease", "asOf", "expiresAt", "privateBindingNonce"],
    "INPUT");
  exact(dependencies, ["transportConfig", "timeoutMs"], "DEPENDENCIES");
  if (dependencies.transportConfig === null
    || typeof dependencies.transportConfig !== "object"
    || Array.isArray(dependencies.transportConfig)
    || !Number.isSafeInteger(dependencies.timeoutMs)
    || dependencies.timeoutMs < 1 || dependencies.timeoutMs > 30_000) {
    fail("DEPENDENCIES_INVALID");
  }
  const state = ORIGIN_LEASES.get(input.sellerOriginLease);
  if (state === undefined || state.consumed) fail("SELLER_ORIGIN_LEASE_INVALID");
  const asOf = instant(input.asOf, "AS_OF_INVALID");
  const expiresAt = instant(input.expiresAt, "EXPIRY_INVALID");
  if (typeof input.privateBindingNonce !== "string" || !HASH.test(input.privateBindingNonce)
    || input.sellerOriginLease.tenderHash === undefined
    || Date.parse(expiresAt) <= Date.parse(asOf)) fail("INPUT_BINDING_INVALID");
  state.consumed = true;
  const url = new URL("/.well-known/outsider", state.origin);
  const fetchImpl = createPinnedPublicHttpsFetchV1({
    ...dependencies.transportConfig,
    timeoutMs: dependencies.timeoutMs,
    maximumResponseBytes: MAX_DESCRIPTOR_BYTES,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), dependencies.timeoutMs);
  let response;
  try {
    response = await fetchImpl(url.href, { method: "GET",
      headers: Object.freeze({ Accept: "application/json" }), redirect: "error",
      credentials: "omit", signal: controller.signal });
  } catch { clearTimeout(timer); fail("SOURCE_UNAVAILABLE"); }
  clearTimeout(timer);
  if (!response || !Number.isSafeInteger(response.status)
    || response.status < 200 || response.status > 299) fail("SOURCE_UNAVAILABLE");
  const described = descriptor(await boundedJson(response), state.origin, asOf, expiresAt);
  const publicBody = {
    schema: OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V1_SCHEMAS.publicProjection,
    schemaVersion: "1.0.0", status: "INTERFACE_DESCRIBED",
    requestAttemptCount: 1, descriptorSchemaVerified: true,
    descriptorVersionVerified: true, sameOriginEndpointVerified: true,
    machineUseDeclaredBySeller: true, oneUseTenderDeclaredBySeller: true,
    declarationIsNotAuthorityOrAcceptance: true, domainProjected: false,
    endpointProjected: false, contactProjected: false, rawDescriptorProjected: false,
    resourceOwnerAuthorityEstablished: false, providerAcceptanceEstablished: false,
    capacityEstablished: false, capacityReserved: false, authority: "NONE",
    decisionState: "HOLD", actionReady: false, executable: false,
  };
  publicBody.projectionHash = digest(
    OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V1_SCHEMAS.publicProjection,
    publicBody);
  const result = deepFreeze({
    schema: OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V1_SCHEMAS.endpointLease,
    schemaVersion: "1.0.0", publicProjection: deepFreeze(publicBody),
  });
  RESULTS.set(result, { endpoint: described.endpoint,
    expiresAt: described.expiresAt, tenderHash: input.sellerOriginLease.tenderHash,
    privateBindingNonce: input.privateBindingNonce, consumed: false });
  return result;
}

export function claimSellerTransactionEndpointLeaseV1(result) {
  const state = RESULTS.get(result);
  if (state === undefined || state.consumed) fail("ENDPOINT_LEASE_INVALID");
  state.consumed = true;
  return deepFreeze({ schema:
    OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V1_SCHEMAS.endpointLease,
  schemaVersion: "1.0.0", endpoint: state.endpoint, method: "POST",
  contentType: "application/json", expiresAt: state.expiresAt,
  tenderHash: state.tenderHash, privateBindingNonce: state.privateBindingNonce,
  sellerDeclaredMachineUse: true, sellerDeclaredOneUseTender: true,
  authorityEstablished: false, providerAcceptanceEstablished: false,
  capacityReserved: false, invocationPermittedByThisLease: false });
}
