/*
 * Brave Web Search -> order-scoped discovery federation bridge v1.
 *
 * Brave-specific replay stays outside the generic federation. This bridge
 * reduces one exact, privacy-closed Brave projection to the generic node
 * receipt; the caller keeps the original Brave envelope as private ephemeral
 * state so its one-use seller URL lease is never projected or persisted here.
 */

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY,
  OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_SCHEMAS,
  verifyBraveSearchDiscoveryEnvelopeForFederationV1,
} from "./outsider-brave-search-route-discovery-adapter-v1.js";
import { createOrderScopedDiscoveryNodeReceiptV1 }
  from "./outsider-order-scoped-discovery-federation-v1.js";

const PREFIX
  = "OUTSIDER_BRAVE_SEARCH_DISCOVERY_FEDERATION_NODE_V1_";
const ADAPTED_ENVELOPES = new WeakSet();
const FAILURE_CODES = new Set([
  "SOURCE_PERMISSION_DENIED",
  "SOURCE_RATE_LIMITED",
  "SOURCE_TIMEOUT",
  "SOURCE_MALFORMED",
  "SOURCE_TRANSPORT_UNAVAILABLE",
]);
const PROJECTION_FIELDS = Object.freeze([
  "schema", "schemaVersion", "recordClass", "status", "failureCode",
  "braveRequestAttemptCount", "retryCount",
  "externalInfrastructureNetworkIoAttempted", "braveCredentialPresented",
  "billableRequestPossible", "productionExecutionAuthorityReplayed",
  "outOfBandPilotAuthorizationRequired", "braveDiscoverySucceeded",
  "queryProjected", "rawTokenProjected", "rawResponseProjected",
  "resultTitleProjected", "resultSnippetProjected",
  "resultContactProjected", "resultPoiProjected",
  "resultDerivedCountProjected", "candidateSellerUrlProjected",
  "privateBindingProjected", "storageRightsEstablished",
  "durableCollectorAdmissionPermitted",
  "freshSellerOwnedSourceRequiredForDurableCollectorAdmission",
  "providerOwnershipEstablished",
  "downstreamSellerPageReachabilityEstablished",
  "providerContactPerformed", "tenderDelivered",
  "providerAcceptanceEstablished", "resourceOwnerAuthorityEstablished",
  "capacityEstablished", "capacityReserved", "priceEstablished",
  "economicsEstablished", "guaranteeEstablished", "settlementPermitted",
  "internalHumanFallbackPermitted", "humanQueueCreated",
  "enabledCapabilityCount", "enabledCapabilityCountScope",
  "provenAuthorityCount", "enabledCapabilitiesSubsetOfProvenAuthority",
  "consequenceReach", "consequenceReachScope",
  "infrastructureConsequenceReach", "decisionState", "authority",
  "actionReady", "executable", "boundary", "projectionHash",
]);

export const OUTSIDER_BRAVE_SEARCH_DISCOVERY_FEDERATION_NODE_V1_BOUNDARY
  = Object.freeze({
    position: "BRAVE_TO_GENERIC_DISCOVERY_NODE_RECEIPT_BRIDGE",
    genericFederationDependsOnBrave: false,
    braveReceivesNoPrivilegedNodeRole: true,
    rawBraveProjectionPassedThrough: false,
    braveProjectionHashPassedThrough: false,
    queryOrResultMaterialPassedThrough: false,
    privateCandidateLeaseClaimedByBridge: false,
    fullModuleIssuedAdapterEnvelopeRequired: true,
    exactInvocationPrivateBindingRequired: true,
    adapterEnvelopeBridgeConsumableOnce: true,
    storageRightsEstablished: false,
    durableCollectorAdmissionPermitted: false,
    providerAcceptanceEstablished: false,
    capacityEstablished: false,
    economicsEstablished: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function ownValue(value, field) {
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  if (!descriptor || !Object.hasOwn(descriptor, "value")
    || descriptor.enumerable !== true) fail("PROJECTION_FIELDS_INVALID");
  return descriptor.value;
}

function exactProjection(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) fail("PROJECTION_OBJECT_INVALID");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("PROJECTION_OBJECT_INVALID");
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== PROJECTION_FIELDS.length) {
    fail("PROJECTION_FIELDS_INVALID");
  }
  for (const field of PROJECTION_FIELDS) ownValue(value, field);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

/** Map one exact, module-issued Brave envelope to one invocation receipt. */
export function adaptBraveSearchDiscoveryProjectionV1(adapterResult,
  invocation) {
  verifyBraveSearchDiscoveryEnvelopeForFederationV1(adapterResult,
    invocation);
  if (ADAPTED_ENVELOPES.has(adapterResult)) {
    fail("ADAPTER_ENVELOPE_ALREADY_BRIDGED");
  }
  const projection = adapterResult.publicProjection;
  exactProjection(projection);
  const body = {};
  for (const field of PROJECTION_FIELDS) {
    if (field !== "projectionHash") body[field] = ownValue(projection, field);
  }
  if (projection.schema
      !== OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_SCHEMAS
        .publicProjection
    || projection.schemaVersion !== "1.0.0"
    || projection.recordClass
      !== "BRAVE_WEB_SEARCH_PRIVACY_CLOSED_DISCOVERY_SUMMARY"
    || projection.projectionHash !== digest(projection.schema, body)
    || !isDeepStrictEqual(projection.boundary,
      OUTSIDER_BRAVE_SEARCH_ROUTE_DISCOVERY_ADAPTER_V1_BOUNDARY)
    || projection.braveRequestAttemptCount !== 1
    || projection.retryCount !== 0
    || projection.externalInfrastructureNetworkIoAttempted !== true
    || projection.braveCredentialPresented !== true
    || projection.billableRequestPossible !== true
    || projection.productionExecutionAuthorityReplayed !== false
    || projection.queryProjected !== false
    || projection.rawTokenProjected !== false
    || projection.rawResponseProjected !== false
    || projection.resultTitleProjected !== false
    || projection.resultSnippetProjected !== false
    || projection.resultContactProjected !== false
    || projection.resultPoiProjected !== false
    || projection.resultDerivedCountProjected !== false
    || projection.candidateSellerUrlProjected !== false
    || projection.privateBindingProjected !== false
    || projection.storageRightsEstablished !== false
    || projection.durableCollectorAdmissionPermitted !== false
    || projection.freshSellerOwnedSourceRequiredForDurableCollectorAdmission
      !== true
    || projection.providerOwnershipEstablished !== false
    || projection.downstreamSellerPageReachabilityEstablished !== false
    || projection.providerContactPerformed !== false
    || projection.tenderDelivered !== false
    || projection.providerAcceptanceEstablished !== false
    || projection.resourceOwnerAuthorityEstablished !== false
    || projection.capacityEstablished !== false
    || projection.capacityReserved !== false
    || projection.priceEstablished !== false
    || projection.economicsEstablished !== false
    || projection.guaranteeEstablished !== false
    || projection.settlementPermitted !== false
    || projection.internalHumanFallbackPermitted !== false
    || projection.humanQueueCreated !== false
    || projection.enabledCapabilityCount !== 0
    || projection.enabledCapabilityCountScope !== "TASK_PROVIDER_ACTION_ONLY"
    || projection.provenAuthorityCount !== 0
    || projection.enabledCapabilitiesSubsetOfProvenAuthority !== true
    || projection.consequenceReach !== "NONE"
    || projection.consequenceReachScope !== "TASK_PROVIDER_ACTION_ONLY"
    || projection.decisionState !== "HOLD" || projection.authority !== "NONE"
    || projection.actionReady !== false || projection.executable !== false
    || (projection.status === "SUCCEEDED"
      ? projection.failureCode !== null
        || projection.braveDiscoverySucceeded !== true
      : projection.status !== "FAILED"
        || !FAILURE_CODES.has(projection.failureCode)
        || projection.braveDiscoverySucceeded !== false)) {
    fail("PROJECTION_SOURCE_REPLAY_FAILED");
  }
  const receipt = createOrderScopedDiscoveryNodeReceiptV1(invocation, {
    status: projection.status,
    failureCode: projection.failureCode,
    externalInfrastructureNetworkIoAttempted: true,
  });
  ADAPTED_ENVELOPES.add(adapterResult);
  return receipt;
}
