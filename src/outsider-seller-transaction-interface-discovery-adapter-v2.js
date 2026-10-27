/* Generic-origin descendant of seller transaction interface discovery v1. */
import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import { claimOrderScopedSellerOriginV1 }
  from "./outsider-order-scoped-seller-origin-lease-v1.js";
import { createPinnedPublicHttpsFetchV1 }
  from "./outsider-public-https-read-only-fetch-transport-v1.js";

const PREFIX = "OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V2_";
const SCHEMA = "https://outsider.network/schemas/transaction-interface/v1";
const MAX = 256 * 1024;
const RESULTS = new WeakMap();
const fail = (code) => { throw new TypeError(`${PREFIX}${code}`); };
const digest = (value) => `sha256:${createHash("sha256")
  .update(`outsider/seller-transaction-interface-privacy-closed-summary/v2\0${canonicalizeStrict(value)}`).digest("hex")}`;
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) freeze(value[key]); Object.freeze(value);
  } return value;
};
const exact = (value, fields, code) => {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) fail(code);
};

export const OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V2_BOUNDARY
  = freeze({ position: "GENERIC_ORDER_SCOPED_SELLER_INTERFACE_DESCRIBED_HOLD",
    supersedes: "outsider/seller-transaction-interface-privacy-closed-summary/v1",
    braveSpecificOriginImportRequired: false,
    genericOpaqueSellerOriginLeaseRequired: true,
    path: "/.well-known/outsider", maximumRequests: 1,
    maximumDescriptorBytes: MAX, pinnedPublicHttpsTransportRequired: true,
    endpointInvocationPerformed: false, domainProjected: false,
    endpointProjected: false, contactProjected: false,
    authority: "NONE", decisionState: "HOLD", capacityReserved: false });

export async function discoverSellerTransactionInterfaceV2(input, dependencies) {
  exact(input, ["sellerOriginLease", "originBinding", "asOf", "expiresAt",
    "privateBindingNonce"], "INPUT_INVALID");
  exact(dependencies, ["transportConfig", "timeoutMs"], "DEPENDENCIES_INVALID");
  const asOfMs = Date.parse(input.asOf);
  const expiresAtMs = Date.parse(input.expiresAt);
  if (!Number.isFinite(asOfMs) || !Number.isFinite(expiresAtMs)
    || new Date(asOfMs).toISOString() !== input.asOf
    || new Date(expiresAtMs).toISOString() !== input.expiresAt
    || !/^sha256:[a-f0-9]{64}$/u.test(input.privateBindingNonce)
    || asOfMs >= expiresAtMs) fail("BINDING_INVALID");
  const claimed = claimOrderScopedSellerOriginV1(input.sellerOriginLease,
    input.originBinding);
  if (claimed.expiresAt !== input.expiresAt
  ) fail("BINDING_INVALID");
  const fetchImpl = createPinnedPublicHttpsFetchV1({ ...dependencies.transportConfig,
    timeoutMs: dependencies.timeoutMs, maximumResponseBytes: MAX });
  const response = await fetchImpl(new URL("/.well-known/outsider",
    claimed.origin).href, { method: "GET", headers: { Accept: "application/json" },
  redirect: "error", credentials: "omit", signal: new AbortController().signal });
  if (response.status < 200 || response.status > 299
    || !/^application\/json(?:\s*;|\s*$)/iu.test(
      response.headers.get("content-type") ?? "")) fail("SOURCE_INVALID");
  const declared = response.headers.get("content-length");
  if (declared) {
    const declaredBytes = Number(declared);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0
      || declaredBytes > MAX) fail("DESCRIPTOR_TOO_LARGE");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX) fail("DESCRIPTOR_TOO_LARGE");
  let body;
  try { body = JSON.parse(text); } catch { fail("DESCRIPTOR_INVALID"); }
  exact(body, ["schema", "version", "expiresAt", "machineUse", "oneUseTender"],
    "DESCRIPTOR_INVALID");
  exact(body.oneUseTender, ["accepted", "endpoint", "method", "contentType"],
    "DESCRIPTOR_INVALID");
  let endpoint;
  try { endpoint = new URL(body.oneUseTender.endpoint); } catch { fail("ENDPOINT_INVALID"); }
  const descriptorExpiry = Date.parse(body.expiresAt);
  if (body.schema !== SCHEMA || body.version !== "1.0.0"
    || body.machineUse !== true || body.oneUseTender.accepted !== true
    || body.oneUseTender.method !== "POST"
    || body.oneUseTender.contentType !== "application/json"
    || endpoint.origin !== claimed.origin || endpoint.protocol !== "https:"
    || endpoint.username || endpoint.password || endpoint.port || endpoint.hash
    || !Number.isFinite(descriptorExpiry)
    || new Date(descriptorExpiry).toISOString() !== body.expiresAt
    || descriptorExpiry <= asOfMs
    || descriptorExpiry > expiresAtMs
    || descriptorExpiry - asOfMs > 30 * 86400000) {
    fail("DESCRIPTOR_POLICY_INVALID");
  }
  const projection = { schema:
    "outsider/seller-transaction-interface-privacy-closed-summary/v2",
  schemaVersion: "2.0.0", status: "INTERFACE_DESCRIBED",
  genericOriginLeaseConsumed: true, requestAttemptCount: 1,
  sameOriginEndpointVerified: true, sellerDeclaredMachineUse: true,
  sellerDeclaredOneUseTender: true, declarationIsNotAuthorityOrAcceptance: true,
  domainProjected: false, endpointProjected: false, contactProjected: false,
  rawDescriptorProjected: false, resourceOwnerAuthorityEstablished: false,
  providerAcceptanceEstablished: false, capacityReserved: false,
  authority: "NONE", decisionState: "HOLD", actionReady: false, executable: false };
  projection.projectionHash = digest(projection);
  const result = freeze({ schema:
    "outsider/seller-transaction-interface-private-one-use-endpoint-lease/v2",
  schemaVersion: "2.0.0", publicProjection: freeze(projection) });
  RESULTS.set(result, { endpoint: endpoint.href, expiresAt: body.expiresAt,
    tenderHash: claimed.tenderHash, consumed: false });
  return result;
}

export function claimSellerTransactionEndpointLeaseV2(result) {
  const state = RESULTS.get(result);
  if (!state || state.consumed) fail("ENDPOINT_LEASE_INVALID");
  state.consumed = true;
  return freeze({ endpoint: state.endpoint, method: "POST",
    contentType: "application/json", expiresAt: state.expiresAt,
    tenderHash: state.tenderHash, invocationPermittedByThisLease: false,
    authorityEstablished: false, providerAcceptanceEstablished: false,
    capacityReserved: false });
}
