/*
 * Official MCP Registry -> order-scoped discovery federation bridge v1.
 *
 * MCP-specific replay stays outside the generic federation. This bridge
 * accepts only the exact privacy-closed adapter projection and reduces it to
 * the generic module-issued receipt. It never receives or claims the adapter's
 * private one-use remote transport leases.
 */

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_BOUNDARY,
  OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_SCHEMAS,
  verifyMcpRegistryDiscoveryEnvelopeForFederationV1,
} from "./outsider-mcp-registry-discovery-adapter-v1.js";
import { createOrderScopedDiscoveryNodeReceiptV1 }
  from "./outsider-order-scoped-discovery-federation-v1.js";

const PREFIX = "OUTSIDER_MCP_REGISTRY_DISCOVERY_FEDERATION_NODE_V1_";
const ADAPTED_ENVELOPES = new WeakMap();
const FAILURE_CODES = new Set([
  "SOURCE_PERMISSION_DENIED",
  "SOURCE_RATE_LIMITED",
  "SOURCE_TIMEOUT",
  "SOURCE_REDIRECT_REFUSED",
  "SOURCE_MALFORMED",
  "SOURCE_TRANSPORT_UNAVAILABLE",
]);
const PROJECTION_FIELDS = Object.freeze([
  "schema", "schemaVersion", "recordClass", "status", "failureCode",
  "requestAttempted", "requestMethod", "fixedOfficialEndpointUsed",
  "credentialPresented", "redirectFollowed", "retryPerformed",
  "timeoutEnforced", "responseBodyLimitEnforcedBeforeJsonParsing",
  "registryReadSucceeded", "serverNameProjected", "serverVersionProjected",
  "serverDescriptionProjected", "remoteTransportUrlProjected",
  "rawResponseProjected", "resultDerivedHashProjected",
  "occurrenceRowsTreatedAsProviders", "providerIdentityEstablished",
  "providerOwnershipEstablished", "resourceOwnerAuthorityEstablished",
  "safetyEstablished", "capacityEstablished",
  "productionExecutionAuthorityReplayed", "decisionState", "authority",
  "actionReady", "executable", "projectionHash",
]);
const EXPECTED_ADAPTER_BOUNDARY = Object.freeze({
  position: "ORDER_SCOPED_PUBLIC_MCP_REGISTRY_DISCOVERY_ONLY",
  fixedOfficialRegistryOrigin: "https://registry.modelcontextprotocol.io",
  fixedOfficialRegistryPath: "/v0.1/servers",
  registryApiVersion: "v0.1",
  registryReleaseState: "PREVIEW",
  arbitraryOriginAccepted: false,
  arbitraryEndpointAccepted: false,
  unauthenticatedReadOnlyRequest: true,
  credentialsAccepted: false,
  maximumRequestAttempts: 1,
  maximumResultOccurrencesRequested: 10,
  retryPermitted: false,
  redirectPermitted: false,
  externalInfrastructureNetworkIoPossible: true,
  maximumResponseBytes: 2 * 1024 * 1024,
  responseBodyLimitEnforcedBeforeJsonParsing: true,
  jsonContentTypeRequired: true,
  exactTenderRequirementWindowBindingRequired: true,
  callerDeclaredAsOfTrustedTime: false,
  serverNameProjected: false,
  serverVersionProjected: false,
  serverDescriptionProjected: false,
  remoteTransportUrlProjected: false,
  rawResponseProjected: false,
  resultDerivedCountProjected: false,
  resultDerivedHashProjected: false,
  occurrenceRowsTreatedAsProviders: false,
  occurrenceRowsMayRepresentMultipleVersions: true,
  providerRegistryCreated: false,
  candidateLeaseRetention: "CALLER_PRIVATE_EPHEMERAL_DO_NOT_PERSIST",
  candidateLeaseConsumableOnce: true,
  candidateRemoteReachabilityEstablished: false,
  providerIdentityEstablished: false,
  providerOwnershipEstablished: false,
  resourceOwnerAuthorityEstablished: false,
  safetyEstablished: false,
  capacityEstablished: false,
  capacityReserved: false,
  providerContactPerformed: false,
  tenderDelivered: false,
  providerAcceptanceEstablished: false,
  priceEstablished: false,
  settlementPermitted: false,
  productionExecutionAuthorityReplayed: false,
  productionExecutionPermitted: false,
  internalHumanFallbackPermitted: false,
  enabledCapabilitiesSubsetOfProvenAuthority: true,
  consequenceReach: "NONE",
  consequenceReachScope: "TASK_PROVIDER_ACTION_ONLY",
  infrastructureConsequenceReach:
    "ONE_BOUNDED_UNAUTHENTICATED_MCP_REGISTRY_GET",
  decisionState: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
});

export const OUTSIDER_MCP_REGISTRY_DISCOVERY_FEDERATION_NODE_V1_BOUNDARY
  = Object.freeze({
    position: "MCP_REGISTRY_TO_GENERIC_DISCOVERY_NODE_RECEIPT_BRIDGE",
    genericFederationDependsOnMcpRegistry: false,
    genericFederationDependsOnBrave: false,
    braveModuleImported: false,
    mcpRegistryReceivesNoPrivilegedNodeRole: true,
    exactAdapterProjectionAllowlistRequired: true,
    adapterProjectionSourceReplayRequired: true,
    rawAdapterProjectionPassedThrough: false,
    adapterProjectionHashPassedThrough: false,
    searchOrRegistryResultMaterialPassedThrough: false,
    serverNameVersionDescriptionPassedThrough: false,
    remoteTransportUrlPassedThrough: false,
    resultCountPassedThrough: false,
    privateCandidateLeaseClaimedByBridge: false,
    fullModuleIssuedAdapterEnvelopeRequired: true,
    exactInvocationPrivateBindingRequired: true,
    adapterEnvelopeBridgeConsumableOnce: true,
    occurrenceRowsTreatedAsProviders: false,
    providerIdentityEstablished: false,
    providerOwnershipEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    safetyEstablished: false,
    capacityEstablished: false,
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

function genericFailureCode(sourceFailureCode) {
  return sourceFailureCode === "SOURCE_REDIRECT_REFUSED"
    ? "SOURCE_TRANSPORT_UNAVAILABLE" : sourceFailureCode;
}

/** Map one exact, module-issued MCP envelope to one invocation receipt. */
export function adaptMcpRegistryDiscoveryProjectionV1(adapterResult,
  invocation) {
  verifyMcpRegistryDiscoveryEnvelopeForFederationV1(adapterResult,
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
  if (!isDeepStrictEqual(
    OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_BOUNDARY,
    EXPECTED_ADAPTER_BOUNDARY)
    || projection.schema
      !== OUTSIDER_MCP_REGISTRY_DISCOVERY_ADAPTER_V1_SCHEMAS.publicProjection
    || projection.schemaVersion !== "1.0.0"
    || projection.recordClass
      !== "MCP_REGISTRY_PRIVACY_CLOSED_TRANSPORT_STATUS"
    || projection.projectionHash !== digest(projection.schema, body)
    || projection.requestAttempted !== true
    || projection.requestMethod !== "GET"
    || projection.fixedOfficialEndpointUsed !== true
    || projection.credentialPresented !== false
    || projection.redirectFollowed !== false
    || projection.retryPerformed !== false
    || projection.timeoutEnforced !== true
    || projection.responseBodyLimitEnforcedBeforeJsonParsing !== true
    || projection.serverNameProjected !== false
    || projection.serverVersionProjected !== false
    || projection.serverDescriptionProjected !== false
    || projection.remoteTransportUrlProjected !== false
    || projection.rawResponseProjected !== false
    || projection.resultDerivedHashProjected !== false
    || projection.occurrenceRowsTreatedAsProviders !== false
    || projection.providerIdentityEstablished !== false
    || projection.providerOwnershipEstablished !== false
    || projection.resourceOwnerAuthorityEstablished !== false
    || projection.safetyEstablished !== false
    || projection.capacityEstablished !== false
    || projection.productionExecutionAuthorityReplayed !== false
    || projection.decisionState !== "HOLD"
    || projection.authority !== "NONE"
    || projection.actionReady !== false
    || projection.executable !== false
    || (projection.status === "SUCCEEDED"
      ? projection.failureCode !== null
        || projection.registryReadSucceeded !== true
      : projection.status !== "FAILED"
        || !FAILURE_CODES.has(projection.failureCode)
        || projection.registryReadSucceeded !== false)) {
    fail("PROJECTION_SOURCE_REPLAY_FAILED");
  }
  const receipt = createOrderScopedDiscoveryNodeReceiptV1(invocation, {
    status: projection.status,
    failureCode: projection.status === "FAILED"
      ? genericFailureCode(projection.failureCode) : null,
    externalInfrastructureNetworkIoAttempted: true,
  });
  ADAPTED_ENVELOPES.set(adapterResult, Object.freeze({
    tenderHash: invocation.tender.tenderHash,
    workOrderHash: invocation.tender.workOrderHash,
    typedGraphHash: invocation.tender.typedGraph.typedGraphHash,
    asOf: invocation.asOf,
    occurrenceId: invocation.occurrenceId,
    nodeSlotId: invocation.nodeSlotId,
    nodeKind: invocation.nodeKind,
    requirementKind: invocation.requirementKind,
    requirementId: invocation.requirementId,
    requirementSetHash: invocation.requirementSetHash,
    requirementObjectHash: invocation.requirementObjectHash,
    expiresAt: invocation.expiresAt,
    exactPrivateBindingHash: invocation.exactPrivateBindingHash,
  }));
  return receipt;
}

/**
 * Prove that this exact adapter envelope, rather than a substituted private
 * value, created the bridge receipt for the exact federation occurrence.
 * This check is process-local, read-only, and does not consume the envelope.
 */
export function verifyMcpRegistryFederationPrivateResultForObservationV1(
  adapterResult, expected) {
  const state = ADAPTED_ENVELOPES.get(adapterResult);
  if (state === undefined) fail("ADAPTER_ENVELOPE_NOT_BRIDGED");
  const fields = ["tenderHash", "workOrderHash", "typedGraphHash", "asOf",
    "occurrenceId", "nodeSlotId", "nodeKind", "requirementKind",
    "requirementId", "requirementSetHash", "requirementObjectHash",
    "expiresAt", "exactPrivateBindingHash"];
  if (expected === null || typeof expected !== "object"
    || Array.isArray(expected) || isProxy(expected)
    || Reflect.ownKeys(expected).length !== fields.length) {
    fail("OBSERVATION_BINDING_INVALID");
  }
  for (const field of fields) {
    if (ownValue(expected, field) !== state[field]) {
      fail("OBSERVATION_BINDING_MISMATCH");
    }
  }
  return true;
}
