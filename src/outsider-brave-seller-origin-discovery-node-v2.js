/*
 * Brave Web Search -> one opaque seller-origin lease node v2.
 *
 * This descendant repairs the v1 composition bug that tried to claim a
 * candidate even when Brave returned a source failure or a successful empty
 * result set. Source failures now become exact generic federation receipts;
 * an empty/ineligible selection becomes NODE_DECLARED_FAILURE; and only a
 * selected candidate can mint the node's sole opaque seller-origin lease.
 * Query, token, result material, and seller origin remain process-private.
 */

import {
  claimBraveSearchCandidateForSellerObservationV1,
  discoverBraveSearchRoutesV1,
  verifyBraveSearchDiscoveryEnvelopeForFederationV1,
} from "./outsider-brave-search-route-discovery-adapter-v1.js";
import { adaptBraveSearchDiscoveryProjectionV1 }
  from "./outsider-brave-search-discovery-federation-node-v1.js";
import {
  createOrderScopedDiscoveryNodeCapabilityV1,
  createOrderScopedDiscoveryNodeReceiptV1,
} from "./outsider-order-scoped-discovery-federation-v1.js";
import {
  createOrderScopedSellerOriginIssuerV1,
  sealSellerOriginFromDiscoveryInvocationV1,
} from "./outsider-order-scoped-seller-origin-lease-v1.js";

const PREFIX = "OUTSIDER_BRAVE_SELLER_ORIGIN_DISCOVERY_NODE_V2_";
const MAXIMUM_CANDIDATE_INDEX = 19;

export const OUTSIDER_BRAVE_SELLER_ORIGIN_DISCOVERY_NODE_V2_NODE_KIND
  = "brave.web_search.v1";

export const OUTSIDER_BRAVE_SELLER_ORIGIN_DISCOVERY_NODE_V2_BOUNDARY
  = Object.freeze({
    position: "BRAVE_SOURCE_RECEIPT_TO_ONE_OPAQUE_SELLER_ORIGIN_LEASE",
    sourceAdapterVersion: "v1",
    genericFederationNodeVersion: "v2",
    publicNodeKindPreservedForSourceReplay:
      OUTSIDER_BRAVE_SELLER_ORIGIN_DISCOVERY_NODE_V2_NODE_KIND,
    maximumBraveRequests: 1,
    maximumFederationReceipts: 1,
    maximumSellerOriginLeases: 1,
    sourceFailureReceiptPreserved: true,
    successfulEmptyResultReceipt: "NODE_DECLARED_FAILURE",
    candidateClaimAttemptedOnSourceFailure: false,
    candidateClaimAttemptedOnEmptySelection: false,
    queryProjected: false,
    braveResultProjected: false,
    sellerOriginProjected: false,
    credentialProjected: false,
    providerRegistrationRequired: false,
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: false,
    tenderPostPermitted: false,
    paymentPermitted: false,
    humanQueueCreated: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) fail(code);
  return value;
}

function failedResult(invocation, failureCode) {
  return Object.freeze({
    publicReceipt: createOrderScopedDiscoveryNodeReceiptV1(invocation, {
      status: "FAILED",
      failureCode,
      externalInfrastructureNetworkIoAttempted: true,
    }),
    privateEphemeral: null,
  });
}

function failedSourceResult(adapterResult, invocation) {
  return Object.freeze({
    publicReceipt: adaptBraveSearchDiscoveryProjectionV1(adapterResult,
      invocation),
    privateEphemeral: null,
  });
}

/**
 * Build one replaceable Brave node. The underlying v1 source adapter and its
 * exact source receipts remain frozen; this node only corrects their reduction
 * into the generic federation and opaque seller-origin lease.
 */
export function createBraveSellerOriginDiscoveryNodeV2(input = {}) {
  exact(input, ["apiToken", "fetchImpl", "timeoutMs", "candidateIndex"],
    "INPUT_INVALID");
  if (typeof input.apiToken !== "string" || input.apiToken.length < 1
    || Buffer.byteLength(input.apiToken, "utf8") > 4_096
    || /[\r\n\u0000]/u.test(input.apiToken)
    || typeof input.fetchImpl !== "function"
    || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1
    || input.timeoutMs > 30_000
    || !Number.isSafeInteger(input.candidateIndex)
    || input.candidateIndex < 0
    || input.candidateIndex > MAXIMUM_CANDIDATE_INDEX) {
    fail("INPUT_INVALID");
  }
  const dependencies = Object.freeze({
    apiToken: input.apiToken,
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
  });
  const candidateIndex = input.candidateIndex;
  return createOrderScopedDiscoveryNodeCapabilityV1({
    nodeKind: OUTSIDER_BRAVE_SELLER_ORIGIN_DISCOVERY_NODE_V2_NODE_KIND,
    async invoke(invocation) {
      const result = await discoverBraveSearchRoutesV1({
        tender: invocation.tender,
        requirementKind: invocation.requirementKind,
        requirementId: invocation.requirementId,
        query: invocation.nodeInput.query,
        asOf: invocation.asOf,
        privateBindingNonce: invocation.privateBindingNonce,
      }, dependencies);
      verifyBraveSearchDiscoveryEnvelopeForFederationV1(result, invocation);
      const projection = result.publicProjection;
      if (projection.status === "FAILED") {
        return failedSourceResult(result, invocation);
      }
      if (projection.status !== "SUCCEEDED" || projection.failureCode !== null
        || result.privateEphemeral === null
        || typeof result.privateEphemeral !== "object"
        || !Number.isSafeInteger(result.privateEphemeral.candidateLeaseCount)
        || result.privateEphemeral.candidateLeaseCount < 0
        || result.privateEphemeral.candidateLeaseCount > 20) {
        fail("SOURCE_ENVELOPE_STATE_INVALID");
      }
      if (candidateIndex >= result.privateEphemeral.candidateLeaseCount) {
        return failedResult(invocation, "NODE_DECLARED_FAILURE");
      }
      const candidate = claimBraveSearchCandidateForSellerObservationV1(
        result, candidateIndex);
      const issuer = createOrderScopedSellerOriginIssuerV1({
        tenderHash: invocation.tender.tenderHash,
        workOrderHash: invocation.tender.workOrderHash,
        typedGraphHash: invocation.tender.typedGraph.typedGraphHash,
        occurrenceId: invocation.occurrenceId,
        nodeSlotId: invocation.nodeSlotId,
        nodeKind: invocation.nodeKind,
        requirementKind: invocation.requirementKind,
        requirementId: invocation.requirementId,
        requirementSetHash: invocation.requirementSetHash,
        requirementObjectHash: invocation.requirementObjectHash,
        expiresAt: invocation.expiresAt,
        privateBindingNonce: invocation.privateBindingNonce,
      });
      return sealSellerOriginFromDiscoveryInvocationV1(issuer, invocation, {
        sellerOrigin: candidate.sellerUrl,
        externalInfrastructureNetworkIoAttempted: true,
      });
    },
  });
}
