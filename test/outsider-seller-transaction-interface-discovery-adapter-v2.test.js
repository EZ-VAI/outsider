import assert from "node:assert/strict";
import test from "node:test";
import { OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V2_BOUNDARY,
  claimSellerTransactionEndpointLeaseV2,
  discoverSellerTransactionInterfaceV2 } from
  "../src/outsider-seller-transaction-interface-discovery-adapter-v2.js";

test("v2 consumes only generic opaque origin leases and remains HOLD", async () => {
  const boundary = OUTSIDER_SELLER_TRANSACTION_INTERFACE_DISCOVERY_V2_BOUNDARY;
  assert.equal(boundary.braveSpecificOriginImportRequired, false);
  assert.equal(boundary.genericOpaqueSellerOriginLeaseRequired, true);
  assert.equal(boundary.endpointInvocationPerformed, false);
  assert.equal(boundary.authority, "NONE");
  assert.equal(boundary.decisionState, "HOLD");
  let calls = 0;
  await assert.rejects(() => discoverSellerTransactionInterfaceV2({
    sellerOriginLease: {}, originBinding: {},
    asOf: "2099-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:01:00.000Z",
    privateBindingNonce: `sha256:${"0".repeat(64)}`,
  }, { transportConfig: { lookupImpl: async () => { calls += 1; } },
    timeoutMs: 100 }), /LEASE_INVALID/u);
  assert.equal(calls, 0);
  assert.throws(() => claimSellerTransactionEndpointLeaseV2({}),
    /ENDPOINT_LEASE_INVALID/u);
});
