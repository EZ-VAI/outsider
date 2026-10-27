/*
 * Outcome Formation Engine: WooCommerce seller-owned Products discovery v1.
 *
 * The adapter accepts no URL. A seller origin must first be imported from one
 * exact module-issued order-scoped federation result and its private one-use
 * Brave candidate lease. The origin then remains in module-private WeakMap
 * state. Additional source-specific importers can be added without changing
 * the adapter's no-naked-URL boundary.
 *
 * Execution is read-only: bounded HEAD discovery, bounded API-index GET, and
 * one bounded Products GET. There is no cart, checkout, tender delivery,
 * provider contact, acceptance, inventory reservation, payment, or retry.
 */

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { claimBraveSearchCandidateForSellerObservationV1 }
  from "./outsider-brave-search-route-discovery-adapter-v1.js";
import { claimOrderScopedDiscoveryNodeResultV1 }
  from "./outsider-order-scoped-discovery-federation-v1.js";

const PREFIX = "OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const OCCURRENCE_ID = /^discovery_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const MONEY = /^\d+$/u;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_SEARCH_BYTES = 400;
const MAX_SEARCH_WORDS = 50;
const MAX_PRODUCTS = 10;
const MAX_LINK_HEADER_BYTES = 16 * 1024;
const MAX_INDEX_BYTES = 1024 * 1024;
const MAX_PRODUCTS_BYTES = 2 * 1024 * 1024;
const BRAVE_NODE_KIND = "brave.web_search.v1";
const WORDPRESS_API_REL = "https://api.w.org/";
const WOO_NAMESPACE = "wc/store/v1";
const WOO_PRODUCTS_ROUTE = "/wc/store/v1/products";
const SELLER_ORIGIN_LEASES = new WeakMap();
const RESULT_ENVELOPES = new WeakMap();

export const OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_SCHEMAS
  = Object.freeze({
    sellerOriginLease:
      "outsider/woocommerce-seller-origin-private-one-use-lease/v1",
    publicProjection:
      "outsider/woocommerce-products-privacy-closed-discovery-summary/v1",
    privateEphemeral:
      "outsider/woocommerce-products-private-ephemeral-candidates/v1",
  });

export const OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_BOUNDARY
  = deepFreeze({
    position: "SELLER_OWNED_WOOCOMMERCE_PRODUCTS_DISCOVERY_HOLD",
    nakedUrlAccepted: false,
    arbitraryOriginAccepted: false,
    fullModuleIssuedFederationResultRequiredForOriginImport: true,
    privateCandidateLeaseRequiredForOriginImport: true,
    sellerOriginLeaseConsumableOnce: true,
    httpsRequired: true,
    standardTlsPortRequired: true,
    sameOriginWordPressApiRootRequired: true,
    wordpressApiDiscoveryRel: WORDPRESS_API_REL,
    requiredNamespace: WOO_NAMESPACE,
    requiredProductsRoute: WOO_PRODUCTS_ROUTE,
    permittedMethods: ["HEAD", "GET"],
    maximumHttpRequests: 3,
    maximumRequestsPerStep: 1,
    retriesPermitted: false,
    redirectsPermitted: false,
    credentialsAccepted: false,
    cookiesAccepted: false,
    maximumProductsRequested: MAX_PRODUCTS,
    maximumApiIndexBytes: MAX_INDEX_BYTES,
    maximumProductsResponseBytes: MAX_PRODUCTS_BYTES,
    cartReadPermitted: false,
    cartMutationPermitted: false,
    checkoutPermitted: false,
    orderCreationPermitted: false,
    paymentPermitted: false,
    sellerOriginProjected: false,
    searchProjected: false,
    apiRootProjected: false,
    productIdProjected: false,
    productNameProjected: false,
    productSlugProjected: false,
    productPriceProjected: false,
    rawResponseProjected: false,
    resultDerivedCountProjected: false,
    resultDerivedHashProjected: false,
    sellerDomainControlEstablished: false,
    providerIdentityEstablished: false,
    providerOwnershipEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    bindingOfferEstablished: false,
    providerAcceptanceEstablished: false,
    inventoryReservationEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    priceCommitmentEstablished: false,
    settlementPermitted: false,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    consequenceReachScope: "TASK_PROVIDER_ACTION_ONLY",
    infrastructureConsequenceReach:
      "THREE_BOUNDED_SELLER_ORIGIN_READ_ONLY_REQUESTS",
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
  });

export const OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_FAILURE_CODES_V1
  = Object.freeze([
    "SELLER_SURFACE_PERMISSION_DENIED",
    "SELLER_SURFACE_RATE_LIMITED",
    "SELLER_SURFACE_TIMEOUT",
    "SELLER_SURFACE_REDIRECT_REFUSED",
    "SELLER_SURFACE_MALFORMED",
    "SELLER_SURFACE_UNAVAILABLE",
  ]);

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && Object.hasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value, seen);
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

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function safeOrigin(raw) {
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
  return parsed.origin;
}

/**
 * Consume one Brave-origin federation result and issue an opaque seller-origin
 * lease. The returned object intentionally contains no URL.
 */
export function importWooCommerceSellerOriginFromBraveFederationV1(input) {
  exactObject(input, ["federationResult", "expectedTenderHash",
    "occurrenceId", "candidateIndex"], "ORIGIN_IMPORT_INPUT");
  if (typeof input.expectedTenderHash !== "string"
    || !HASH.test(input.expectedTenderHash)) fail("EXPECTED_TENDER_HASH_INVALID");
  if (typeof input.occurrenceId !== "string"
    || !OCCURRENCE_ID.test(input.occurrenceId)) fail("OCCURRENCE_ID_INVALID");
  if (!Number.isSafeInteger(input.candidateIndex)
    || input.candidateIndex < 0) fail("CANDIDATE_INDEX_INVALID");
  const projection = input.federationResult?.publicProjection;
  if (projection?.tenderHash !== input.expectedTenderHash
    || !Array.isArray(projection.occurrences)) {
    fail("FEDERATION_TENDER_BINDING_MISMATCH");
  }
  const matches = projection.occurrences.filter(
    (row) => row.occurrenceId === input.occurrenceId);
  if (matches.length !== 1 || matches[0].status !== "SUCCEEDED"
    || matches[0].nodeKind !== BRAVE_NODE_KIND) {
    fail("FEDERATION_OCCURRENCE_INVALID");
  }
  const adapterResult = claimOrderScopedDiscoveryNodeResultV1(
    input.federationResult, input.occurrenceId);
  const binding = adapterResult?.privateEphemeral?.binding;
  if (binding?.tenderHash !== input.expectedTenderHash
    || binding.requirementKind !== matches[0].requirementKind
    || binding.requirementId !== matches[0].requirementId
    || binding.requirementObjectHash !== matches[0].requirementObjectHash) {
    fail("PRIVATE_CANDIDATE_TENDER_BINDING_MISMATCH");
  }
  const candidate = claimBraveSearchCandidateForSellerObservationV1(
    adapterResult, input.candidateIndex);
  if (candidate.routeKind !== "PROVIDER_OWNED_PUBLIC_ENTRY"
    || candidate.routeKindEstablished !== false
    || candidate.providerOwnershipEstablished !== false
    || candidate.downstreamSellerPageReachability !== "UNTESTED") {
    fail("PRIVATE_CANDIDATE_BOUNDARY_INVALID");
  }
  const origin = safeOrigin(candidate.sellerUrl);
  if (origin === null) fail("PRIVATE_CANDIDATE_ORIGIN_INVALID");
  const lease = deepFreeze({
    schema:
      OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_SCHEMAS
        .sellerOriginLease,
    sourceKind: "ORDER_SCOPED_PRIVATE_CANDIDATE",
    occurrenceId: input.occurrenceId,
    tenderHash: input.expectedTenderHash,
    requirementKind: matches[0].requirementKind,
    requirementId: matches[0].requirementId,
    requirementObjectHash: matches[0].requirementObjectHash,
    expiresAt: matches[0].expiresAt,
    sellerOriginProjected: false,
    consumableOnce: true,
    providerOwnershipEstablished: false,
    resourceOwnerAuthorityEstablished: false,
  });
  SELLER_ORIGIN_LEASES.set(lease, { origin, consumed: false });
  return lease;
}

function normalizeInput(input) {
  exactObject(input, ["sellerOriginLease", "search", "limit", "asOf",
    "expiresAt", "privateBindingNonce"], "INPUT");
  const leaseState = SELLER_ORIGIN_LEASES.get(input.sellerOriginLease);
  if (leaseState === undefined) fail("SELLER_ORIGIN_LEASE_NOT_MODULE_ISSUED");
  if (leaseState.consumed) fail("SELLER_ORIGIN_LEASE_ALREADY_CONSUMED");
  if (typeof input.search !== "string") fail("SEARCH_INVALID");
  const search = input.search.trim();
  if (search.length === 0 || Buffer.byteLength(search, "utf8")
      > MAX_SEARCH_BYTES || search.split(/\s+/u).length > MAX_SEARCH_WORDS
    || /[\u0000-\u001f\u007f]/u.test(search)) fail("SEARCH_INVALID");
  if (!Number.isSafeInteger(input.limit)
    || input.limit < 1 || input.limit > MAX_PRODUCTS) fail("LIMIT_INVALID");
  const asOf = instant(input.asOf, "AS_OF");
  const expiresAt = instant(input.expiresAt, "EXPIRES_AT");
  if (input.sellerOriginLease.expiresAt !== expiresAt
    || Date.parse(asOf) >= Date.parse(expiresAt)) fail("TIME_WINDOW_INVALID");
  if (typeof input.privateBindingNonce !== "string"
    || !HASH.test(input.privateBindingNonce)) {
    fail("PRIVATE_BINDING_NONCE_INVALID");
  }
  leaseState.consumed = true;
  return { lease: input.sellerOriginLease, origin: leaseState.origin,
    search, limit: input.limit, asOf, expiresAt,
    privateBindingNonce: input.privateBindingNonce };
}

function normalizeDependencies(dependencies) {
  exactObject(dependencies, ["fetchImpl", "timeoutMs"], "DEPENDENCIES");
  if (typeof dependencies.fetchImpl !== "function") {
    fail("FETCH_IMPLEMENTATION_INVALID");
  }
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) fail("TIMEOUT_INVALID");
  return { fetchImpl: dependencies.fetchImpl, timeoutMs };
}

function linkApiRoot(linkHeader, origin) {
  if (linkHeader === null || linkHeader === undefined) return null;
  if (typeof linkHeader !== "string"
    || Buffer.byteLength(linkHeader, "utf8") > MAX_LINK_HEADER_BYTES) {
    return null;
  }
  for (const segment of linkHeader.split(",")) {
    const target = /<([^>]+)>/u.exec(segment)?.[1];
    const rel = /;\s*rel\s*=\s*(?:"([^"]+)"|([^;\s]+))/iu.exec(segment);
    const rels = (rel?.[1] ?? rel?.[2] ?? "").split(/\s+/u);
    if (target === undefined || !rels.includes(WORDPRESS_API_REL)) continue;
    let url;
    try { url = new URL(target); } catch { return null; }
    if (url.origin !== origin || url.protocol !== "https:"
      || url.username !== "" || url.password !== "" || url.port !== "") {
      return null;
    }
    url.hash = "";
    return url;
  }
  return null;
}

function routeSupportsGet(route) {
  if (route === null || typeof route !== "object" || Array.isArray(route)) {
    return false;
  }
  if (Array.isArray(route.methods) && route.methods.includes("GET")) return true;
  return Array.isArray(route.endpoints) && route.endpoints.some(
    (endpoint) => endpoint !== null && typeof endpoint === "object"
      && !Array.isArray(endpoint) && Array.isArray(endpoint.methods)
      && endpoint.methods.includes("GET"));
}

function validIndex(raw) {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    && Array.isArray(raw.namespaces) && raw.namespaces.includes(WOO_NAMESPACE)
    && raw.routes !== null && typeof raw.routes === "object"
    && !Array.isArray(raw.routes)
    && routeSupportsGet(raw.routes[WOO_PRODUCTS_ROUTE]);
}

function productsUrl(apiRoot, search, limit) {
  const url = new URL(apiRoot.href);
  if (url.searchParams.has("rest_route")) {
    url.searchParams.set("rest_route", WOO_PRODUCTS_ROUTE);
  } else {
    url.pathname = `${url.pathname.replace(/\/?$/u, "/")}${WOO_NAMESPACE}/products`;
  }
  url.searchParams.set("search", search);
  url.searchParams.set("per_page", String(limit));
  url.searchParams.set("_fields",
    "id,name,slug,prices,is_purchasable,is_in_stock,has_options,add_to_cart");
  return url;
}

function productCandidates(raw, maximum) {
  if (!Array.isArray(raw) || raw.length > maximum) return null;
  const candidates = [];
  const ids = new Set();
  for (const product of raw) {
    if (product === null || typeof product !== "object"
      || Array.isArray(product) || !Number.isSafeInteger(product.id)
      || product.id < 1 || typeof product.name !== "string"
      || Buffer.byteLength(product.name, "utf8") > 8_192
      || typeof product.slug !== "string" || !SLUG.test(product.slug)
      || product.prices === null || typeof product.prices !== "object"
      || Array.isArray(product.prices)
      || typeof product.prices.currency_code !== "string"
      || !CURRENCY.test(product.prices.currency_code)
      || !Number.isSafeInteger(product.prices.currency_minor_unit)
      || product.prices.currency_minor_unit < 0
      || product.prices.currency_minor_unit > 6
      || typeof product.prices.price !== "string"
      || !MONEY.test(product.prices.price)
      || typeof product.is_purchasable !== "boolean"
      || typeof product.is_in_stock !== "boolean"
      || typeof product.has_options !== "boolean") return null;
    if (ids.has(product.id)) continue;
    ids.add(product.id);
    candidates.push(deepFreeze({
      routeKind: "SELLER_PUBLISHED_WOOCOMMERCE_PRODUCT",
      productId: product.id,
      productName: product.name,
      productSlug: product.slug,
      price: product.prices.price,
      currencyCode: product.prices.currency_code,
      currencyMinorUnit: product.prices.currency_minor_unit,
      sellerPublishedPurchasable: product.is_purchasable,
      sellerPublishedInStock: product.is_in_stock,
      hasOptions: product.has_options,
      sellerDomainControlEstablished: false,
      providerIdentityEstablished: false,
      providerOwnershipEstablished: false,
      resourceOwnerAuthorityEstablished: false,
      bindingOfferEstablished: false,
      providerAcceptanceEstablished: false,
      inventoryReservationEstablished: false,
      capacityEstablished: false,
      capacityReserved: false,
      priceCommitmentEstablished: false,
      actionPermitted: false,
    }));
  }
  return deepFreeze(candidates);
}

async function boundedJson(response, maximumBytes, controller) {
  const contentType = response.headers?.get?.("content-type");
  if (typeof contentType !== "string"
    || !/^application\/json(?:\s*;|\s*$)/iu.test(contentType)) {
    controller.abort();
    return null;
  }
  const declared = response.headers?.get?.("content-length");
  if (declared !== null && declared !== undefined && declared !== "") {
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maximumBytes) {
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
      if (!(part.value instanceof Uint8Array)) return null;
      total += part.value.byteLength;
      if (total > maximumBytes) {
        controller.abort();
        try { await reader.cancel(); } catch { /* already failed closed */ }
        return null;
      }
      chunks.push(Buffer.from(part.value));
    }
    text = Buffer.concat(chunks, total).toString("utf8");
  } else if (typeof response.text === "function") {
    text = await response.text();
    if (typeof text !== "string"
      || Buffer.byteLength(text, "utf8") > maximumBytes) {
      controller.abort();
      return null;
    }
  } else return null;
  try { return JSON.parse(text); } catch { return null; }
}

function statusFailure(status) {
  if ([301, 302, 303, 307, 308].includes(status)) {
    return "SELLER_SURFACE_REDIRECT_REFUSED";
  }
  if (status === 401 || status === 403) {
    return "SELLER_SURFACE_PERMISSION_DENIED";
  }
  if (status === 429) return "SELLER_SURFACE_RATE_LIMITED";
  if (status === 408 || status === 504) return "SELLER_SURFACE_TIMEOUT";
  return "SELLER_SURFACE_UNAVAILABLE";
}

async function request(deps, url, method, maximumBytes) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "FAIL", failureCode: "SELLER_SURFACE_TIMEOUT" });
    }, deps.timeoutMs);
  });
  const network = deps.fetchImpl(url.href, {
    method,
    headers: Object.freeze({ Accept: method === "HEAD"
      ? "text/html,application/xhtml+xml" : "application/json" }),
    redirect: "error",
    credentials: "omit",
    signal: controller.signal,
  }).then(async (response) => {
    if (response === null || typeof response !== "object"
      || !Number.isSafeInteger(response.status)) {
      return { kind: "FAIL", failureCode: "SELLER_SURFACE_MALFORMED" };
    }
    if (response.status < 200 || response.status > 299) {
      return { kind: "FAIL", failureCode: statusFailure(response.status) };
    }
    if (method === "HEAD") return { kind: "HEAD", response };
    const raw = await boundedJson(response, maximumBytes, controller);
    return raw === null
      ? { kind: "FAIL", failureCode: "SELLER_SURFACE_MALFORMED" }
      : { kind: "JSON", raw };
  }).catch(() => ({ kind: "FAIL",
    failureCode: "SELLER_SURFACE_UNAVAILABLE" }));
  const result = await Promise.race([network, timeout]);
  clearTimeout(timer);
  return result;
}

function publicEnvelope(normalized, status, failureCode, stage, attempts,
  candidates) {
  const body = {
    schema:
      OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_SCHEMAS
        .publicProjection,
    schemaVersion: "1.0.0",
    recordClass: "WOOCOMMERCE_PRODUCTS_PRIVACY_CLOSED_DISCOVERY_SUMMARY",
    status,
    failureCode,
    terminalStage: stage,
    readOnlyHttpAttemptCount: attempts,
    retriesPerformed: false,
    redirectsFollowed: false,
    credentialsPresented: false,
    cartOrCheckoutRequestPerformed: false,
    sellerOriginProjected: false,
    searchProjected: false,
    apiRootProjected: false,
    productDetailProjected: false,
    rawResponseProjected: false,
    resultDerivedCountProjected: false,
    resultDerivedHashProjected: false,
    sellerDomainControlEstablished: false,
    providerIdentityEstablished: false,
    providerOwnershipEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    bindingOfferEstablished: false,
    providerAcceptanceEstablished: false,
    inventoryReservationEstablished: false,
    capacityEstablished: false,
    capacityReserved: false,
    priceCommitmentEstablished: false,
    settlementPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
  };
  const publicProjection = deepFreeze({ ...body,
    projectionHash: digest(
      OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_SCHEMAS
        .publicProjection, body) });
  const binding = deepFreeze({
    tenderHash: normalized.lease.tenderHash,
    requirementKind: normalized.lease.requirementKind,
    requirementId: normalized.lease.requirementId,
    requirementObjectHash: normalized.lease.requirementObjectHash,
    asOf: normalized.asOf,
    expiresAt: normalized.expiresAt,
    exactPrivateBindingHash: digest(
      "outsider/woocommerce-products-private-binding/v1", {
        privateBindingNonce: normalized.privateBindingNonce,
        tenderHash: normalized.lease.tenderHash,
        requirementId: normalized.lease.requirementId,
        occurrenceId: normalized.lease.occurrenceId,
        origin: normalized.origin,
        search: normalized.search,
        limit: normalized.limit,
        asOf: normalized.asOf,
        expiresAt: normalized.expiresAt,
      }),
  });
  const privateEphemeral = deepFreeze({
    schema:
      OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_SCHEMAS
        .privateEphemeral,
    retention: "CALLER_PRIVATE_EPHEMERAL_DO_NOT_PERSIST",
    binding,
    candidateLeaseCount: candidates.length,
    candidateLeaseConsumableOnce: true,
    rawResponseRetained: false,
    sellerOriginRetainedInProjection: false,
  });
  const envelope = { publicProjection };
  Object.defineProperty(envelope, "privateEphemeral", {
    value: privateEphemeral, enumerable: false, writable: false,
    configurable: false,
  });
  Object.freeze(envelope);
  RESULT_ENVELOPES.set(envelope, { candidates, consumed: new Set() });
  return envelope;
}

export function claimWooCommerceProductCandidateV1(result, index) {
  const state = RESULT_ENVELOPES.get(result);
  if (state === undefined) fail("RESULT_ENVELOPE_NOT_MODULE_ISSUED");
  if (!Number.isSafeInteger(index) || index < 0
    || index >= state.candidates.length) fail("PRODUCT_INDEX_INVALID");
  if (state.consumed.has(index)) fail("PRODUCT_CANDIDATE_ALREADY_CONSUMED");
  state.consumed.add(index);
  return state.candidates[index];
}

export async function discoverWooCommerceProductsV1(input, dependencies) {
  const normalized = normalizeInput(input);
  const deps = normalizeDependencies(dependencies);
  let attempts = 0;
  const root = new URL("/", normalized.origin);
  attempts += 1;
  const head = await request(deps, root, "HEAD", 0);
  if (head.kind === "FAIL") {
    return publicEnvelope(normalized, "FAILED", head.failureCode,
      "SELLER_ROOT_HEAD", attempts, deepFreeze([]));
  }
  const apiRoot = linkApiRoot(head.response.headers?.get?.("link"),
    normalized.origin) ?? new URL("/wp-json/", normalized.origin);
  attempts += 1;
  const index = await request(deps, apiRoot, "GET", MAX_INDEX_BYTES);
  if (index.kind === "FAIL" || index.kind !== "JSON") {
    return publicEnvelope(normalized, "FAILED",
      index.failureCode ?? "SELLER_SURFACE_MALFORMED", "WORDPRESS_API_INDEX",
      attempts, deepFreeze([]));
  }
  if (!validIndex(index.raw)) {
    index.raw = null;
    return publicEnvelope(normalized, "FAILED", "SELLER_SURFACE_MALFORMED",
      "WORDPRESS_API_INDEX", attempts, deepFreeze([]));
  }
  index.raw = null;
  const productsEndpoint = productsUrl(apiRoot, normalized.search,
    normalized.limit);
  attempts += 1;
  const products = await request(deps, productsEndpoint, "GET",
    MAX_PRODUCTS_BYTES);
  if (products.kind === "FAIL" || products.kind !== "JSON") {
    return publicEnvelope(normalized, "FAILED",
      products.failureCode ?? "SELLER_SURFACE_MALFORMED", "PRODUCTS_READ",
      attempts, deepFreeze([]));
  }
  const candidates = productCandidates(products.raw, normalized.limit);
  products.raw = null;
  if (candidates === null) {
    return publicEnvelope(normalized, "FAILED", "SELLER_SURFACE_MALFORMED",
      "PRODUCTS_READ", attempts, deepFreeze([]));
  }
  return publicEnvelope(normalized, "SUCCEEDED", null, "PRODUCTS_READ",
    attempts, candidates);
}
