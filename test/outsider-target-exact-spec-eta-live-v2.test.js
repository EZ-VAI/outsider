import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V2_BOUNDARY,
  evaluateSellerVoltageEvidence,
} from "../scripts/outsider-target-exact-spec-eta-live-v2.mjs";

test("admits exact 5V/3A only from structured seller ClientResponses", () => {
  const admitted = evaluateSellerVoltageEvidence(Buffer.from(JSON.stringify({
    reviews: { results: [{ ClientResponses: [{
      text: "This cable is rated for up to 15W (5V/3A).",
    }] }] },
  })));
  assert.equal(admitted.exactFiveVoltThreeAmpSellerResponseObserved, true);
  assert.deepEqual([admitted.nominalVoltageV, admitted.maximumCurrentA,
    admitted.ratedPowerW], [5, 3, 15]);

  const rejected = evaluateSellerVoltageEvidence(Buffer.from(JSON.stringify({
    reviews: { results: [{ text: "Guest claims 15W (5V/3A).",
      ClientResponses: [{ text: "Thanks for the review." }] }] },
  })));
  assert.equal(rejected.exactFiveVoltThreeAmpSellerResponseObserved, false);
});

test("boundary remains read-only, private and non-committing", () => {
  assert.equal(OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V2_BOUNDARY.transport,
    "MACHINE_HTTPS_GET");
  assert.equal(OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V2_BOUNDARY.cartMutationAllowed,
    false);
  assert.equal(OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V2_BOUNDARY.paymentAllowed,
    false);
  assert.equal(OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V2_BOUNDARY.orderAllowed,
    false);
  assert.equal(OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V2_BOUNDARY.authorityMinted,
    false);
  assert.equal(OUTSIDER_TARGET_EXACT_SPEC_ETA_LIVE_V2_BOUNDARY.outcomeCommitted,
    false);
});
