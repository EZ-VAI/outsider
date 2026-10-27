import assert from "node:assert/strict";
import test from "node:test";

import {
  OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V1_BOUNDARY,
  OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V1_SCHEMAS,
  claimSellerTransactionEndpointLeaseV1,
  discoverSellerTransactionInterfaceV1,
  importSellerOriginFromBraveFederationV1,
} from "../src/outsider-seller-transaction-interface-discovery-adapter-v1.js";

test("boundary is one read, privacy closed, and descriptive HOLD only", () => {
  const boundary = OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V1_BOUNDARY;
  assert.equal(boundary.path, "/.well-known/outsider");
  assert.equal(boundary.discoveryMethod, "GET");
  assert.equal(boundary.maximumDiscoveryRequests, 1);
  assert.equal(boundary.maximumDescriptorBytes, 256 * 1024);
  assert.equal(boundary.pinnedPublicHttpsTransportRequired, true);
  assert.equal(boundary.sameOriginEndpointRequired, true);
  assert.equal(boundary.endpointInvocationPerformed, false);
  assert.equal(boundary.paymentPerformed, false);
  assert.equal(boundary.domainProjected, false);
  assert.equal(boundary.endpointProjected, false);
  assert.equal(boundary.contactProjected, false);
  assert.equal(boundary.resourceOwnerAuthorityEstablished, false);
  assert.equal(boundary.providerAcceptanceEstablished, false);
  assert.equal(boundary.capacityReserved, false);
  assert.equal(boundary.authority, "NONE");
  assert.equal(boundary.decisionState, "HOLD");
  assert.equal(OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V1_SCHEMAS
    .descriptor,
  "https://outsider.network/schemas/transaction-interface/v1");
});

test("fabricated federation and seller-origin leases fail before I/O",
  async () => {
    assert.throws(() => importSellerOriginFromBraveFederationV1({
      federationResult: {}, expectedTenderHash: `sha256:${"0".repeat(64)}`,
      occurrenceId: `discovery_${"0".repeat(32)}`, candidateIndex: 0,
    }), /ORIGIN_IMPORT_OCCURRENCE_INVALID/u);
    let calls = 0;
    await assert.rejects(() => discoverSellerTransactionInterfaceV1({
      sellerOriginLease: Object.freeze({}),
      asOf: "2099-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:01:00.000Z",
      privateBindingNonce: `sha256:${"1".repeat(64)}`,
    }, { transportConfig: { lookupImpl: async () => { calls += 1; } },
      timeoutMs: 100 }),
    /SELLER_ORIGIN_LEASE_INVALID/u);
    assert.equal(calls, 0);
  });

test("endpoint claims require a module-issued successful result", () => {
  assert.throws(() => claimSellerTransactionEndpointLeaseV1({}, 0),
    /ENDPOINT_LEASE_INVALID/u);
});
