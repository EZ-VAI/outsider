/*
 * Outcome Formation Engine: Brave order-scoped route discovery adapter v1.
 *
 * This is a deliberately narrow live adapter. It performs exactly one GET to
 * Brave's fixed official Web Search endpoint and extracts only HTTPS seller
 * route candidates. Search query material, result titles, snippets, contacts,
 * POI data, and raw responses are never placed in the durable projection.
 * Candidate URLs live only in module-private ephemeral state and are exposed
 * through a one-consumption claim; the non-enumerable caller-private result
 * contains the exact binding and lease metadata, never candidate values.
 *
 * A successful Brave response proves only that discovery ran. It does not
 * prove that a result is provider-owned, reachable downstream, contactable,
 * authorized, willing, priced, or able to reserve capacity.
 */

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { isDeepStrictEqual } from "node:util";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const BRAVE_ORIGIN = "https://api.search.brave.com";
const BRAVE_WEB_SEARCH_PATH = "/res/v1/web/search";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_QUERY_BYTES = 400;
const MAX_QUERY_WORDS = 50;
const MAX_TOKEN_BYTES = 4_096;
const MAX_RESULTS = 20;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const PREFIX = "OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const REQUIREMENT_ID = /^(?:resource|evidence|recovery)_[a-f0-9]{32}$/u;
const SEARCH_LANGUAGE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

/* Brave documents this finite enum for Web Search. `KE` is intentionally not
 * present: callers targeting unsupported regions must put the place in the
 * query and pass country=null (or use ALL), rather than sending a request that
 * Brave will reject with 422. */
export const OUTSIDER_BRAVE_WEB_SEARCH_COUNTRIES_V1 = Object.freeze([
  "ALL", "AR", "AU", "AT", "BE", "BR", "CA", "CL", "DK", "FI", "FR",
  "DE", "GR", "HK", "IN", "ID", "IT", "JP", "KR", "MY", "MX", "NL",
  "NZ", "NO", "CN", "PL", "PT", "PH", "RU", "SA", "ZA", "ES", "SE",
  "CH", "TW", "TR", "GB", "US",
]);

const COUNTRY_SET = new Set(OUTSIDER_BRAVE_WEB_SEARCH_COUNTRIES_V1);
const EPHEMERAL_ENVELOPES = new WeakMap();
const FEDERATION_NODE_KIND = "brave.web_search.v1";

export const OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_SCHEMAS
  = Object.freeze({
    privateEphemeral:
      "outsider/brave-search-caller-private-ephemeral-route-discovery/v1",
    publicProjection:
      "outsider/brave-search-privacy-closed-route-discovery-summary/v1",
  });

export const OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_ENDPOINT
  = Object.freeze({
    origin: BRAVE_ORIGIN,
    path: BRAVE_WEB_SEARCH_PATH,
    method: "GET",
  });

export const OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY
  = deepFreeze({
    position: "ORDER_SCOPED_BRAVE_WEB_DISCOVERY_ONLY",
    fixedOfficialBraveOrigin: BRAVE_ORIGIN,
    fixedOfficialBravePath: BRAVE_WEB_SEARCH_PATH,
    arbitraryOriginAccepted: false,
    arbitraryEndpointAccepted: false,
    maximumRequestAttempts: 1,
    retryPermitted: false,
    externalInfrastructureNetworkIoPossible: true,
    singleBillableBraveRequestPossible: true,
    productionExecutionAuthorityReplayed: false,
    productionExecutionPermitted: false,
    outOfBandPilotAuthorizationRequired: true,
    maximumResponseBytes: MAX_RESPONSE_BYTES,
    responseBodyLimitEnforcedBeforeJsonParsing: true,
    exactQueryExpiryRequired: true,
    callerDeclaredAsOfTrustedTime: false,
    resultFilter: "web",
    safeSearch: "strict",
    queryProjected: false,
    rawTokenProjected: false,
    rawResponseProjected: false,
    resultTitleProjected: false,
    resultSnippetProjected: false,
    resultContactProjected: false,
    resultPoiProjected: false,
    resultDerivedCountProjected: false,
    candidateSellerUrlProjectedDurably: false,
    callerPrivateCandidateRouteKind: "PROVIDER_OWNED_PUBLIC_ENTRY",
    defaultLicenseResultStoragePermitted: false,
    storageRightsEstablished: false,
    durableCollectorAdmissionPermitted: false,
    freshSellerOwnedSourceRequiredForDurableCollectorAdmission: true,
    providerOwnershipEstablishedBySearch: false,
    downstreamSellerPageReachabilityEstablishedBySearch: false,
    providerRegistryCreated: false,
    providerContactPerformed: false,
    tenderDelivered: false,
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    economicsEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    internalHumanFallbackPermitted: false,
    humanQueueCreated: false,
    enabledCapabilityCount: 0,
    enabledCapabilityCountScope: "TASK_PROVIDER_ACTION_ONLY",
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    consequenceReachScope: "TASK_PROVIDER_ACTION_ONLY",
    infrastructureConsequenceReach: "ONE_BOUNDED_BRAVE_SEARCH_REQUEST",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  });

export const OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_FAILURE_CODES_V1
  = Object.freeze([
    "SOURCE_PERMISSION_DENIED",
    "SOURCE_RATE_LIMITED",
    "SOURCE_TIMEOUT",
    "SOURCE_MALFORMED",
    "SOURCE_TRANSPORT_UNAVAILABLE",
  ]);

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
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${code}_OBJECT_INVALID`);
  }
  if (isProxy(value)) fail(`${code}_OBJECT_INVALID`);
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

function verifiedTender(tender) {
  const descriptor = tender === null || typeof tender !== "object"
    ? null : Object.getOwnPropertyDescriptor(tender, "tenderHash");
  if (!descriptor || !Object.hasOwn(descriptor, "value")) {
    fail("TENDER_HASH_REQUIRED");
  }
  const checked = verifyOutsiderOutcomeTenderV1(tender, {
    expectedTenderHash: descriptor.value,
  });
  if (checked.ok !== true || checked.structuralTenderVerified !== true
    || checked.derivationVerified !== true || checked.selfHashVerified !== true
    || checked.expectedHashMatched !== true
    || checked.typedGraphReferencesPreserved !== true
    || checked.zeroInternalOpsVerified !== true
    || checked.authorizationEstablished !== false
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE"
    || checked.actionReady !== false || checked.executable !== false
    || tender.zeroInternalOps.outsiderStaffInterventionsAllowed !== 0
    || tender.zeroInternalOps.humanQueueFallbackAllowed !== false) {
    fail("TENDER_SOURCE_REPLAY_FAILED");
  }
  return tender;
}

function requirementBinding(tender, kind, id) {
  if (!(["RESOURCE", "EVIDENCE", "RECOVERY"].includes(kind))) {
    fail("REQUIREMENT_KIND_INVALID");
  }
  if (typeof id !== "string" || !REQUIREMENT_ID.test(id)) {
    fail("REQUIREMENT_ID_INVALID");
  }
  const rows = kind === "RESOURCE" ? tender.resourceRequirements.items
    : kind === "EVIDENCE" ? tender.evidenceRequirements.items
      : tender.recoveryRequirements.items;
  const requirementSetHash = kind === "RESOURCE"
    ? tender.resourceRequirements.requirementSetHash
    : kind === "EVIDENCE" ? tender.evidenceRequirements.requirementSetHash
      : tender.recoveryRequirements.requirementSetHash;
  const idField = kind === "RESOURCE" ? "resourceRequirementId"
    : kind === "EVIDENCE" ? "evidenceRequirementId"
      : "recoveryRequirementId";
  const matches = rows.filter((row) => row[idField] === id);
  if (matches.length !== 1) fail("REQUIREMENT_NOT_EXACTLY_PRESENT_IN_TENDER");
  return {
    requirementKind: kind,
    requirementId: id,
    requirementSetHash,
    requirementObjectHash: digest(
      "outsider/outcome-formation-exact-tender-requirement/v1", {
        tenderHash: tender.tenderHash,
        requirementKind: kind,
        requirementSetHash,
        requirement: matches[0],
      }),
  };
}

function normalizeQuery(value) {
  exactObject(value, ["text", "country", "searchLang", "count", "expiresAt"],
    "QUERY");
  if (typeof value.text !== "string") fail("QUERY_TEXT_INVALID");
  const text = value.text.trim();
  if (text.length === 0 || Buffer.byteLength(text, "utf8") > MAX_QUERY_BYTES
    || text.split(/\s+/u).length > MAX_QUERY_WORDS
    || /[\u0000-\u001f\u007f]/u.test(text)) {
    fail("QUERY_TEXT_INVALID");
  }
  if (value.country !== null
    && (typeof value.country !== "string"
      || !COUNTRY_SET.has(value.country))) fail("QUERY_COUNTRY_UNSUPPORTED");
  if (value.searchLang !== null
    && (typeof value.searchLang !== "string"
      || !SEARCH_LANGUAGE.test(value.searchLang))) {
    fail("QUERY_SEARCH_LANGUAGE_INVALID");
  }
  if (!Number.isSafeInteger(value.count)
    || value.count < 1 || value.count > MAX_RESULTS) {
    fail("QUERY_COUNT_INVALID");
  }
  const expiresAt = instant(value.expiresAt, "QUERY_EXPIRES_AT");
  return deepFreeze({
    text,
    country: value.country,
    searchLang: value.searchLang,
    count: value.count,
    expiresAt,
  });
}

function normalizeInput(input) {
  exactObject(input, ["tender", "requirementKind", "requirementId", "query",
    "asOf", "privateBindingNonce"], "INPUT");
  const tender = verifiedTender(input.tender);
  const requirement = requirementBinding(tender, input.requirementKind,
    input.requirementId);
  const query = normalizeQuery(input.query);
  const asOf = instant(input.asOf, "AS_OF");
  if (Date.parse(asOf) < Date.parse(tender.compiledAt)
    || Date.parse(asOf) >= Date.parse(tender.formationDeadline)
    || Date.parse(query.expiresAt) <= Date.parse(asOf)
    || Date.parse(query.expiresAt) > Date.parse(tender.formationDeadline)) {
    fail("QUERY_TIME_WINDOW_INVALID");
  }
  if (typeof input.privateBindingNonce !== "string"
    || !HASH.test(input.privateBindingNonce)) {
    fail("PRIVATE_BINDING_NONCE_INVALID");
  }
  return { tender, requirement, query, asOf,
    privateBindingNonce: input.privateBindingNonce };
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function normalizeDependencies(dependencies) {
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies)) fail("DEPENDENCIES_INVALID");
  const fetchImpl = dependencies.fetchImpl;
  const apiToken = dependencies.apiToken;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_INVALID");
  if (typeof apiToken !== "string" || apiToken.length === 0
    || Buffer.byteLength(apiToken, "utf8") > MAX_TOKEN_BYTES
    || /[\r\n\u0000]/u.test(apiToken)) fail("API_TOKEN_INVALID");
  if (!Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    fail("TIMEOUT_INVALID");
  }
  return { fetchImpl, apiToken, timeoutMs };
}

function requestUrl(query) {
  const url = new URL(BRAVE_WEB_SEARCH_PATH, BRAVE_ORIGIN);
  url.searchParams.set("q", query.text);
  if (query.country !== null) url.searchParams.set("country", query.country);
  if (query.searchLang !== null) {
    url.searchParams.set("search_lang", query.searchLang);
  }
  url.searchParams.set("count", String(query.count));
  url.searchParams.set("offset", "0");
  url.searchParams.set("safesearch", "strict");
  url.searchParams.set("spellcheck", "false");
  url.searchParams.set("text_decorations", "false");
  url.searchParams.set("result_filter", "web");
  url.searchParams.set("extra_snippets", "false");
  url.searchParams.set("summary", "false");
  url.searchParams.set("enable_rich_callback", "false");
  url.searchParams.set("include_fetch_metadata", "false");
  url.searchParams.set("operators", "false");
  return url;
}

function privateBinding(normalized) {
  const value = {
    tenderHash: normalized.tender.tenderHash,
    workOrderHash: normalized.tender.workOrderHash,
    typedGraphHash: normalized.tender.typedGraph.typedGraphHash,
    requirementKind: normalized.requirement.requirementKind,
    requirementId: normalized.requirement.requirementId,
    requirementSetHash: normalized.requirement.requirementSetHash,
    requirementObjectHash: normalized.requirement.requirementObjectHash,
    endpoint: OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_ENDPOINT,
    asOf: normalized.asOf,
    query: normalized.query,
  };
  return deepFreeze({
    tenderHash: normalized.tender.tenderHash,
    requirementKind: normalized.requirement.requirementKind,
    requirementId: normalized.requirement.requirementId,
    requirementObjectHash: normalized.requirement.requirementObjectHash,
    queryHash: digest("outsider/brave-search-exact-private-query/v1",
      normalized.query),
    exactTenderRequirementQueryBindingHash: digest(
      "outsider/brave-search-private-tender-requirement-query-binding/v1", {
        privateBindingNonce: normalized.privateBindingNonce,
        binding: value,
      }),
  });
}

function safeSellerUrl(raw) {
  if (typeof raw !== "string" || raw.length === 0
    || raw.length > 16_384) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username !== ""
    || parsed.password !== "" || parsed.port !== "") return null;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")
    || hostname.endsWith(".local") || isIP(hostname) !== 0) return null;
  parsed.hash = "";
  return parsed.href;
}

function extractCandidates(raw, binding, maximum) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)
    || raw.type !== "search" || raw.web === null
    || typeof raw.web !== "object" || Array.isArray(raw.web)
    || !Array.isArray(raw.web.results)
    || raw.web.results.length > MAX_RESULTS) return null;
  const candidates = [];
  const seen = new Set();
  for (const result of raw.web.results) {
    if (result === null || typeof result !== "object" || Array.isArray(result)
      || typeof result.url !== "string") return null;
    const sellerUrl = safeSellerUrl(result.url);
    if (sellerUrl === null || seen.has(sellerUrl)) continue;
    seen.add(sellerUrl);
    candidates.push(deepFreeze({
      routeKind: "PROVIDER_OWNED_PUBLIC_ENTRY",
      routeKindEstablished: false,
      sellerUrl,
      transactionSurfaceRefHash: digest(
        "outsider/brave-search-private-transaction-surface-reference/v1", {
          exactTenderRequirementQueryBindingHash:
            binding.exactTenderRequirementQueryBindingHash,
          sellerUrl,
        }),
      providerOwnershipEstablished: false,
      downstreamSellerPageReachability: "UNTESTED",
      contactabilityEstablished: false,
    }));
    if (candidates.length === maximum) break;
  }
  return deepFreeze(candidates);
}

function projectionBody(status, failureCode) {
  const succeeded = status === "SUCCEEDED";
  return {
    schema:
      OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_SCHEMAS.publicProjection,
    schemaVersion: "1.0.0",
    recordClass: "BRAVE_WEB_SEARCH_PRIVACY_CLOSED_DISCOVERY_SUMMARY",
    status,
    failureCode,
    braveRequestAttemptCount: 1,
    retryCount: 0,
    externalInfrastructureNetworkIoAttempted: true,
    braveCredentialPresented: true,
    billableRequestPossible: true,
    productionExecutionAuthorityReplayed: false,
    outOfBandPilotAuthorizationRequired: true,
    braveDiscoverySucceeded: succeeded,
    queryProjected: false,
    rawTokenProjected: false,
    rawResponseProjected: false,
    resultTitleProjected: false,
    resultSnippetProjected: false,
    resultContactProjected: false,
    resultPoiProjected: false,
    resultDerivedCountProjected: false,
    candidateSellerUrlProjected: false,
    privateBindingProjected: false,
    storageRightsEstablished: false,
    durableCollectorAdmissionPermitted: false,
    freshSellerOwnedSourceRequiredForDurableCollectorAdmission: true,
    providerOwnershipEstablished: false,
    downstreamSellerPageReachabilityEstablished: false,
    providerContactPerformed: false,
    tenderDelivered: false,
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    economicsEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    internalHumanFallbackPermitted: false,
    humanQueueCreated: false,
    enabledCapabilityCount: 0,
    enabledCapabilityCountScope: "TASK_PROVIDER_ACTION_ONLY",
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    consequenceReachScope: "TASK_PROVIDER_ACTION_ONLY",
    infrastructureConsequenceReach: "ONE_BOUNDED_BRAVE_SEARCH_REQUEST",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY,
  };
}

function envelope(binding, candidates, status, failureCode) {
  const body = projectionBody(status, failureCode);
  const publicProjection = deepFreeze({
    ...body,
    projectionHash: digest(
      OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_SCHEMAS.publicProjection,
      body),
  });
  const privateEphemeral = deepFreeze({
    schema:
      OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_SCHEMAS.privateEphemeral,
    retention: "CALLER_PRIVATE_EPHEMERAL_DO_NOT_PERSIST",
    binding,
    candidateLeaseCount: candidates.length,
    candidateLeaseConsumableOnce: true,
    rawResponseRetained: false,
    rawResultFieldsRetained: false,
    apiTokenRetained: false,
  });
  const result = { publicProjection };
  Object.defineProperty(result, "privateEphemeral", {
    value: privateEphemeral,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  Object.freeze(result);
  EPHEMERAL_ENVELOPES.set(result, {
    binding,
    candidates,
    consumed: new Set(),
  });
  return result;
}

/**
 * Verify, without consuming any candidate lease, that an adapter envelope was
 * issued by this module for this exact live federation invocation.
 */
export function verifyBraveSearchDiscoveryEnvelopeForFederationV1(
  result, invocation) {
  const state = EPHEMERAL_ENVELOPES.get(result);
  if (state === undefined) fail("FEDERATION_ENVELOPE_NOT_MODULE_ISSUED");
  if (invocation === null || typeof invocation !== "object"
    || Array.isArray(invocation) || isProxy(invocation)) {
    fail("FEDERATION_INVOCATION_INVALID");
  }
  const required = ["tender", "asOf", "nodeKind", "requirementKind",
    "requirementId", "requirementSetHash", "requirementObjectHash",
    "expiresAt", "nodeInput", "privateBindingNonce"];
  for (const field of required) {
    const descriptor = Object.getOwnPropertyDescriptor(invocation, field);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      fail("FEDERATION_INVOCATION_INVALID");
    }
  }
  if (invocation.nodeKind !== FEDERATION_NODE_KIND) {
    fail("FEDERATION_NODE_KIND_MISMATCH");
  }
  exactObject(invocation.nodeInput, ["query"],
    "FEDERATION_NODE_INPUT");
  const normalized = normalizeInput({
    tender: invocation.tender,
    requirementKind: invocation.requirementKind,
    requirementId: invocation.requirementId,
    query: invocation.nodeInput.query,
    asOf: invocation.asOf,
    privateBindingNonce: invocation.privateBindingNonce,
  });
  if (invocation.requirementSetHash
      !== normalized.requirement.requirementSetHash
    || invocation.requirementObjectHash
      !== normalized.requirement.requirementObjectHash
    || invocation.expiresAt !== normalized.query.expiresAt
    || !isDeepStrictEqual(state.binding, privateBinding(normalized))) {
    fail("FEDERATION_INVOCATION_BINDING_MISMATCH");
  }
  return true;
}

/**
 * Consume one module-issued candidate lease. This is deliberately separate
 * from the serializable result and rejects copied, fabricated, or reused
 * envelopes. The returned candidate remains caller-private and must be handed
 * directly to a seller-source observer, never persisted as Brave evidence.
 */
export function claimBraveSearchCandidateForSellerObservationV1(
  result, index) {
  const state = EPHEMERAL_ENVELOPES.get(result);
  if (state === undefined) fail("EPHEMERAL_ENVELOPE_NOT_MODULE_ISSUED");
  if (!Number.isSafeInteger(index) || index < 0
    || index >= state.candidates.length) fail("CANDIDATE_INDEX_INVALID");
  if (state.consumed.has(index)) fail("CANDIDATE_ALREADY_CONSUMED");
  state.consumed.add(index);
  return state.candidates[index];
}

function statusFailureCode(status) {
  if (status === 401 || status === 403) return "SOURCE_PERMISSION_DENIED";
  if (status === 429) return "SOURCE_RATE_LIMITED";
  if (status === 408 || status === 504) return "SOURCE_TIMEOUT";
  if (status === 400 || status === 422) return "SOURCE_MALFORMED";
  return "SOURCE_TRANSPORT_UNAVAILABLE";
}

async function boundedJson(response, controller) {
  const declared = response.headers
    && typeof response.headers.get === "function"
    ? response.headers.get("content-length") : null;
  if (declared !== null && declared !== "") {
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes < 0
      || bytes > MAX_RESPONSE_BYTES) {
      controller.abort();
      return null;
    }
  }
  let text;
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) {
        controller.abort();
        try { await reader.cancel(); } catch { /* fail closed below */ }
        return null;
      }
      total += part.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        controller.abort();
        try { await reader.cancel(); } catch { /* already rejected */ }
        return null;
      }
      chunks.push(Buffer.from(part.value));
    }
    text = Buffer.concat(chunks, total).toString("utf8");
  } else if (typeof response.text === "function") {
    text = await response.text();
    if (typeof text !== "string"
      || Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      controller.abort();
      return null;
    }
  } else {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function oneRequest(url, dependencies, controller) {
  const response = await dependencies.fetchImpl(url.href, {
    method: "GET",
    headers: Object.freeze({
      Accept: "application/json",
      "X-Subscription-Token": dependencies.apiToken,
    }),
    redirect: "error",
    signal: controller.signal,
  });
  if (response === null || typeof response !== "object"
    || !Number.isSafeInteger(response.status)) {
    return { kind: "MALFORMED" };
  }
  if (response.status !== 200) {
    return { kind: "STATUS", status: response.status };
  }
  try {
    const raw = await boundedJson(response, controller);
    return raw === null ? { kind: "MALFORMED" } : { kind: "JSON", raw };
  } catch {
    return { kind: "MALFORMED" };
  }
}

/**
 * Run one order-scoped Brave Web Search discovery.
 *
 * The return object's `privateEphemeral` property is intentionally
 * non-enumerable. Serializing the whole envelope therefore serializes only the
 * privacy-closed public projection. Candidate values remain in a module-owned
 * WeakMap and are available only through the one-consumption claim function.
 */
export async function discoverBraveSearchRoutesV1(input, dependencies) {
  const normalized = normalizeInput(input);
  const deps = normalizeDependencies(dependencies);
  const binding = privateBinding(normalized);
  const url = requestUrl(normalized.query);
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "TIMEOUT" });
    }, deps.timeoutMs);
  });
  const request = oneRequest(url, deps, controller)
    .catch(() => ({ kind: "TRANSPORT_FAILURE" }));
  const outcome = await Promise.race([request, timeout]);
  clearTimeout(timer);

  if (outcome.kind === "TIMEOUT") {
    return envelope(binding, deepFreeze([]), "FAILED", "SOURCE_TIMEOUT");
  }
  if (outcome.kind === "TRANSPORT_FAILURE") {
    return envelope(binding, deepFreeze([]), "FAILED",
      "SOURCE_TRANSPORT_UNAVAILABLE");
  }
  if (outcome.kind === "STATUS") {
    return envelope(binding, deepFreeze([]), "FAILED",
      statusFailureCode(outcome.status));
  }
  if (outcome.kind !== "JSON") {
    return envelope(binding, deepFreeze([]), "FAILED", "SOURCE_MALFORMED");
  }
  const candidates = extractCandidates(outcome.raw, binding,
    normalized.query.count);
  outcome.raw = null;
  if (candidates === null) {
    return envelope(binding, deepFreeze([]), "FAILED", "SOURCE_MALFORMED");
  }
  return envelope(binding, candidates, "SUCCEEDED", null);
}

export const runBraveSearchRouteDiscoveryAdapterV1
  = discoverBraveSearchRoutesV1;
