/* Generic order-scoped opaque seller-origin lease contract v1. */

import { isIP } from "node:net";
import { isProxy } from "node:util/types";
import { createOrderScopedDiscoveryNodeReceiptV1 }
  from "./outsider-order-scoped-discovery-federation-v1.js";

const PREFIX = "OUTSIDER_ORDER_SCOPED_SELLER_ORIGIN_LEASE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^(?:discovery|node|resource|evidence|recovery)_[a-f0-9]{32}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const KIND = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,7}$/u;
const ISSUERS = new WeakMap();
const LEASES = new WeakMap();
const fail = (code) => { throw new TypeError(`${PREFIX}${code}`); };

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (d && Object.hasOwn(d, "value")) deepFreeze(d.value);
  }
  return Object.freeze(value);
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value) || Reflect.ownKeys(value).length !== fields.length) fail(`${code}_INVALID`);
  for (const field of fields) if (!Object.hasOwn(value, field)) fail(`${code}_INVALID`);
}

function origin(raw) {
  let url;
  try { url = new URL(raw); } catch { fail("ORIGIN_INVALID"); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || host === "localhost" || host.endsWith(".local") || isIP(host) !== 0) fail("ORIGIN_INVALID");
  return url.origin;
}

const BINDING_FIELDS = ["tenderHash", "workOrderHash", "typedGraphHash",
  "occurrenceId", "nodeSlotId", "nodeKind", "requirementKind",
  "requirementId", "requirementSetHash", "requirementObjectHash",
  "expiresAt", "privateBindingNonce"];

export const OUTSIDER_ORDER_SCOPED_SELLER_ORIGIN_LEASE_V1_BOUNDARY
  = deepFreeze({ position: "ORDER_SCOPED_OPAQUE_SELLER_ORIGIN_LEASE_HOLD",
    issuerPerNodeInvocation: true, moduleIssuedInvocationRequired: true,
    nakedUrlAcceptedByConsumer: false, originProjected: false,
    globalProviderRegistryCreated: false, consumerClaimsPermitted: 1,
    resourceOwnerAuthorityEstablished: false, providerAcceptanceEstablished: false,
    capacityReserved: false, authority: "NONE", decisionState: "HOLD" });

export function createOrderScopedSellerOriginIssuerV1(binding) {
  exact(binding, BINDING_FIELDS, "BINDING");
  for (const field of ["tenderHash", "workOrderHash", "typedGraphHash",
    "requirementSetHash", "requirementObjectHash", "privateBindingNonce"]) {
    if (typeof binding[field] !== "string" || !HASH.test(binding[field])) fail("BINDING_HASH_INVALID");
  }
  for (const field of ["occurrenceId", "nodeSlotId", "requirementId"]) {
    if (typeof binding[field] !== "string" || !ID.test(binding[field])) fail("BINDING_ID_INVALID");
  }
  if (typeof binding.nodeKind !== "string" || !KIND.test(binding.nodeKind)
    || !["RESOURCE", "EVIDENCE", "RECOVERY"].includes(binding.requirementKind)
    || typeof binding.expiresAt !== "string" || !INSTANT.test(binding.expiresAt)) fail("BINDING_VALUE_INVALID");
  const issuer = deepFreeze({ schema: "outsider/order-scoped-seller-origin-issuer/v1",
    nodeKind: binding.nodeKind, opaque: true, authority: "NONE" });
  ISSUERS.set(issuer, { binding: { ...binding }, used: false });
  return issuer;
}

export function sealSellerOriginFromDiscoveryInvocationV1(issuer, invocation,
  input) {
  const state = ISSUERS.get(issuer);
  if (state === undefined || state.used) fail("ISSUER_INVALID_OR_REPLAYED");
  exact(input, ["sellerOrigin", "externalInfrastructureNetworkIoAttempted"],
    "SEAL_INPUT");
  if (typeof input.externalInfrastructureNetworkIoAttempted !== "boolean") fail("NETWORK_FLAG_INVALID");
  const actual = {
    tenderHash: invocation?.tender?.tenderHash,
    workOrderHash: invocation?.tender?.workOrderHash,
    typedGraphHash: invocation?.tender?.typedGraph?.typedGraphHash,
    occurrenceId: invocation?.occurrenceId, nodeSlotId: invocation?.nodeSlotId,
    nodeKind: invocation?.nodeKind, requirementKind: invocation?.requirementKind,
    requirementId: invocation?.requirementId,
    requirementSetHash: invocation?.requirementSetHash,
    requirementObjectHash: invocation?.requirementObjectHash,
    expiresAt: invocation?.expiresAt,
    privateBindingNonce: invocation?.privateBindingNonce,
  };
  if (BINDING_FIELDS.some((field) => actual[field] !== state.binding[field])) fail("INVOCATION_BINDING_MISMATCH");
  /* This call is the unforgeable proof that federation issued and currently
   * opened this exact invocation. It also yields the node's sole receipt. */
  const publicReceipt = createOrderScopedDiscoveryNodeReceiptV1(invocation, {
    status: "SUCCEEDED", failureCode: null,
    externalInfrastructureNetworkIoAttempted:
      input.externalInfrastructureNetworkIoAttempted,
  });
  state.used = true;
  const normalizedOrigin = origin(input.sellerOrigin);
  const lease = deepFreeze({ schema:
    "outsider/order-scoped-opaque-seller-origin-lease/v1", schemaVersion: "1.0.0",
  tenderHash: state.binding.tenderHash, workOrderHash: state.binding.workOrderHash,
  typedGraphHash: state.binding.typedGraphHash,
  occurrenceId: state.binding.occurrenceId, nodeSlotId: state.binding.nodeSlotId,
  nodeKind: state.binding.nodeKind, requirementKind: state.binding.requirementKind,
  requirementId: state.binding.requirementId,
  requirementSetHash: state.binding.requirementSetHash,
  requirementObjectHash: state.binding.requirementObjectHash,
  expiresAt: state.binding.expiresAt, originProjected: false,
  consumableOnce: true, authority: "NONE", decisionState: "HOLD" });
  LEASES.set(lease, { origin: normalizedOrigin, binding: state.binding,
    consumed: false });
  return deepFreeze({ publicReceipt, privateEphemeral: lease });
}

export function claimOrderScopedSellerOriginV1(lease, expected) {
  const state = LEASES.get(lease);
  if (state === undefined || state.consumed) fail("LEASE_INVALID_OR_REPLAYED");
  exact(expected, BINDING_FIELDS.filter((field) => field !== "privateBindingNonce"),
    "EXPECTED_BINDING");
  for (const field of BINDING_FIELDS) {
    if (field !== "privateBindingNonce" && expected[field] !== state.binding[field]) {
      fail("LEASE_CROSS_ORDER_OR_BINDING_MISMATCH");
    }
  }
  state.consumed = true;
  return deepFreeze({ origin: state.origin, expiresAt: state.binding.expiresAt,
    tenderHash: state.binding.tenderHash, occurrenceId: state.binding.occurrenceId,
    authorityEstablished: false, providerAcceptanceEstablished: false,
    capacityReserved: false });
}
