/*
 * WooCommerce seller-owned Products discovery v2.
 *
 * V1 is frozen after a real occurrence proved that a WordPress root index can
 * exceed its 1 MiB pre-parse cap. V2 supersedes only that stage: the API root
 * discovered from the seller is narrowed, same-origin, to the wc/store/v1
 * namespace index before it is read. The remaining v1 lease, validation,
 * Products GET, privacy, and HOLD semantics are replayed unchanged.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_BOUNDARY,
  OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_SCHEMAS,
  claimWooCommerceProductCandidateV1,
  discoverWooCommerceProductsV1,
  importWooCommerceSellerOriginFromBraveFederationV1,
} from "./outsider-woocommerce-products-discovery-adapter-v1.js";

const PREFIX = "OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_";
const MAX_NAMESPACE_INDEX_BYTES = 1024 * 1024;
const RESULTS = new WeakMap();
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
const fail = (code) => { throw new TypeError(`${PREFIX}${code}`); };

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

export const OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_SCHEMAS
  = Object.freeze({
    sellerOriginLease:
      OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_SCHEMAS.sellerOriginLease,
    publicProjection:
      "outsider/woocommerce-products-privacy-closed-discovery-summary/v2",
    privateEphemeral:
      "outsider/woocommerce-products-private-ephemeral-candidates/v2",
  });

export const OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_LINEAGE
  = deepFreeze({
    revision: 2,
    supersedesSchema:
      OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_SCHEMAS.publicProjection,
    supersedesSourceSha256:
      "82134fbe9769af7e458151bd46e831cf54a416a4be14b0e34a6b76af9e9c9c1a",
    supersessionReason:
      "ROOT_INDEX_OBSERVED_2196879_BYTES_EXCEEDED_1MIB_CAP",
    frozenV1Modified: false,
  });

export const OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_BOUNDARY
  = deepFreeze({
    ...OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V1_BOUNDARY,
    position: "SELLER_OWNED_WOOCOMMERCE_NAMESPACE_PRODUCTS_DISCOVERY_HOLD",
    wordpressRootIndexFetched: false,
    namespaceIndexFetched: true,
    requiredNamespaceIndex: "wc/store/v1",
    maximumNamespaceIndexBytes: MAX_NAMESPACE_INDEX_BYTES,
    prettyPermalinkNamespaceDerivationSupported: true,
    restRouteNamespaceDerivationSupported: true,
    lineage: OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_LINEAGE,
  });

export const importWooCommerceSellerOriginFromBraveFederationV2
  = importWooCommerceSellerOriginFromBraveFederationV1;

function namespaceIndexUrl(raw) {
  const url = new URL(raw);
  if (url.searchParams.has("rest_route")) {
    if (url.searchParams.get("rest_route") !== "/") {
      fail("WORDPRESS_API_ROOT_INVALID");
    }
    url.searchParams.set("rest_route", "/wc/store/v1");
  } else {
    url.pathname = `${url.pathname.replace(/\/?$/u, "/")}wc/store/v1`;
  }
  return url.href;
}

async function boundedNamespaceBody(response) {
  const contentType = response.headers?.get?.("content-type");
  if (typeof contentType !== "string"
    || !/^application\/json(?:\s*;|\s*$)/iu.test(contentType)) {
    fail("NAMESPACE_INDEX_MALFORMED");
  }
  const declared = response.headers?.get?.("content-length");
  if (declared !== null && declared !== undefined && declared !== "") {
    const bytes = Number(declared);
    if (!Number.isSafeInteger(bytes) || bytes < 0
      || bytes > MAX_NAMESPACE_INDEX_BYTES) {
      fail("NAMESPACE_INDEX_TOO_LARGE");
    }
  }
  let text;
  try { text = await response.text(); } catch { fail("NAMESPACE_INDEX_MALFORMED"); }
  if (typeof text !== "string"
    || Buffer.byteLength(text, "utf8") > MAX_NAMESPACE_INDEX_BYTES) {
    fail("NAMESPACE_INDEX_TOO_LARGE");
  }
  let body;
  try { body = JSON.parse(text); } catch { fail("NAMESPACE_INDEX_MALFORMED"); }
  if (body === null || typeof body !== "object" || Array.isArray(body)
    || body.namespace !== "wc/store/v1"
    || body.routes === null || typeof body.routes !== "object"
    || Array.isArray(body.routes)) fail("NAMESPACE_INDEX_MALFORMED");
  return JSON.stringify({ ...body, namespaces: ["wc/store/v1"] });
}

export function createWooCommerceNamespaceIndexFetchV2(fetchImpl) {
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_INVALID");
  let calls = 0;
  return async (rawUrl, options) => {
    calls += 1;
    if (calls !== 2) return fetchImpl(rawUrl, options);
    const response = await fetchImpl(namespaceIndexUrl(rawUrl), options);
    const text = await boundedNamespaceBody(response);
    const contentLength = String(Buffer.byteLength(text, "utf8"));
    return {
      status: response.status,
      headers: { get(name) {
        const lower = String(name).toLowerCase();
        if (lower === "content-type") return "application/json";
        if (lower === "content-length") return contentLength;
        return response.headers?.get?.(name) ?? null;
      } },
      async text() { return text; },
    };
  };
}

export async function discoverWooCommerceProductsV2(input, dependencies) {
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies)) fail("DEPENDENCIES_INVALID");
  const v1 = await discoverWooCommerceProductsV1(input, {
    fetchImpl: createWooCommerceNamespaceIndexFetchV2(dependencies.fetchImpl),
    timeoutMs: dependencies.timeoutMs,
  });
  const body = { ...v1.publicProjection,
    schema: OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_SCHEMAS.publicProjection,
    recordClass: "WOOCOMMERCE_PRODUCTS_NAMESPACE_PRIVACY_CLOSED_DISCOVERY_SUMMARY",
    terminalStage: v1.publicProjection.terminalStage === "WORDPRESS_API_INDEX"
      ? "WOOCOMMERCE_NAMESPACE_INDEX"
      : v1.publicProjection.terminalStage,
    wordpressRootIndexFetched: false,
    namespaceIndexFetched: true,
    namespaceIndexMaximumBytes: MAX_NAMESPACE_INDEX_BYTES,
    supersedesV1: true,
    supersededV1ProjectionHash: v1.publicProjection.projectionHash };
  delete body.projectionHash;
  body.projectionHash = digest(
    OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_SCHEMAS.publicProjection,
    body);
  const result = deepFreeze({
    schema:
      OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_SCHEMAS.privateEphemeral,
    schemaVersion: "2.0.0",
    publicProjection: deepFreeze(body),
  });
  RESULTS.set(result, { v1 });
  return result;
}

export function claimWooCommerceProductCandidateV2(result, index) {
  const state = RESULTS.get(result);
  if (state === undefined) fail("RESULT_NOT_MODULE_ISSUED");
  return claimWooCommerceProductCandidateV1(state.v1, index);
}
