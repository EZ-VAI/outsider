import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createBuyerNativeRouteEvidenceV1 }
  from "../src/outsider-buyer-native-route-evidence-v1.js";
import { parseAdafruitPrepaymentSummaryV10 }
  from "../scripts/outsider-adafruit-shipping-reconciliation-live-runner-v10.mjs";
import { convertAdafruitShippingQuoteEvidence }
  from "../scripts/outsider-adafruit-shipping-quote-evidence.mjs";
const h = text => `sha256:${createHash("sha256").update(text).digest("hex")}`;
const DEADLINE = "2026-09-11T03:59:59.999Z";
function fixture() {
  const step4SourceBytes = Buffer.from(`<h1>Payment Method</h1>${[
    ["Subtotal", "4.95"], ["USPS Ground Advantage", "5.93"],
    ["Tax", "0.31"], ["Total", "11.19"]].map(([title, price]) =>
    `<div class="checkout-sidebar-ot-title">${title}</div><div class="checkout-sidebar-ot-text">$${price}</div>`).join("")}`);
  const oldOccurrence = h("old-occurrence");
  const priorRouteEvidence = createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: h("old-proposal"), occurrenceRefHash: oldOccurrence,
    recoveryOptionRefHash: h("option"), sourceReplayReceiptHash: h("old-replay"),
    observedAt: "2026-09-05T02:31:07.861Z", validUntil: "2026-09-05T02:55:30.000Z",
    facts: {
      specification: { sourceOccurrenceRefHash: oldOccurrence, frozenPredicateHash: h("spec"),
        evaluationRefHash: h("evaluation"), status: "MATCH" },
      allInPrice: { sourceOccurrenceRefHash: oldOccurrence, constraintRefHash: h("budget"),
        currency: "USD", allInMinorUnits: 1395, includesItemTaxShippingAndFees: true, status: "COMPLETE" },
      eta: { sourceOccurrenceRefHash: oldOccurrence, completionDeadline: DEADLINE,
        estimatedCompletionAt: null, status: "UNAVAILABLE" },
      capacity: { sourceOccurrenceRefHash: oldOccurrence, capacityLifecycleRefHash: null,
        capacityLifecycleHeadHash: null, reservedFrom: null, reservedUntil: null,
        status: "UNRESERVED", sourceClass: "SELLER_SERVER_ACK_ONLY" },
    },
  });
  const result = { state: "ALL_IN_QUOTE_OBSERVED", service: "USPS Ground Advantage",
    shippingMinor: 593, observedAt: "2026-09-05T12:32:06.435Z",
    summary: parseAdafruitPrepaymentSummaryV10(step4SourceBytes.toString(), DEADLINE, 593, "USPS Ground Advantage"),
    counts: { postRequests: 1, paymentSubmissions: 0, orderSubmissions: 0 },
    exchanges: [{ method: "GET", url: "https://www.adafruit.com/checkout?step=4",
      status: 200, body: { bytesHash: h(step4SourceBytes), bytes: step4SourceBytes.length } }],
    paymentPerformed: false, orderSubmitted: false, capacityReserved: false,
    userResultCommitted: false };
  return { resultSourceBytes: Buffer.from(JSON.stringify(result)), step4SourceBytes, priorRouteEvidence };
}
test("current price occurrence inherits old spec explicitly and uses only local quote freshness", () => {
  const input = fixture();
  const { replay, routeEvidence } = convertAdafruitShippingQuoteEvidence(input);
  assert.equal(routeEvidence.facts.allInPrice.allInMinorUnits, 1119);
  assert.notEqual(routeEvidence.facts.allInPrice.sourceOccurrenceRefHash,
    input.priorRouteEvidence.facts.allInPrice.sourceOccurrenceRefHash);
  assert.deepEqual(routeEvidence.facts.specification, input.priorRouteEvidence.facts.specification);
  assert.equal(replay.specificationProvenance.validityRefreshed, false);
  assert.equal(replay.freshness.sellerGuaranteedPriceValidity, false);
  assert.equal(routeEvidence.validUntil, "2026-09-05T13:02:06.435Z");
  assert.equal(routeEvidence.facts.eta.status, "UNAVAILABLE");
  assert.equal(routeEvidence.facts.capacity.status, "UNRESERVED");
});
test("a different current checkout response cannot become the saved quote", () => {
  assert.throws(() => convertAdafruitShippingQuoteEvidence({ ...fixture(),
    step4SourceBytes: Buffer.from("changed page") }), /SOURCE_BINDING_INVALID/u);
});
