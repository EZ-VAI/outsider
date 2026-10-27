import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createBuyerNativeRouteEvidenceV1, verifyBuyerNativeRouteEvidenceV1 }
  from "../src/outsider-buyer-native-route-evidence-v1.js";
import { buildAdafruitEtaPlanningV1, parseAdafruitShippingTermsV1,
  selectAdafruitEtaNextActionV1 }
  from "../src/outsider-adafruit-eta-planning-v1.js";

const sha = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const DEADLINE = "2026-09-11T03:59:59.999Z";
const SHIPPING = `<main>
  Orders usually ship within 1-2 business days.
  With UPS 3 Day Select, 2nd Day Air, and Next Day air shipping options,
  orders placed by 11am ET during weekdays usually ship same day.
  UPS Ground Saver is a low cost service. Delivery estimates range from 5-8 business days once shipped.
  UPS Ground usually arrives within 3-5 business days once shipped.
  UPS 3 Day Select arrives by the end of the third business day once shipped.
  UPS 2nd Day Air arrives by the end of the second business day once shipped.
  UPS Next Day Air arrives by the end of next business day once shipped.
  USPS Ground Advantage is a low cost service. Delivery estimates range from 2-5 business days once shipped.
  All transit times do not include weekends, US holidays, etc.
</main>`;
const CALENDAR = { validFromDate: "2026-09-01", validUntilDate: "2026-09-30",
  closedDates: ["2026-09-07"], sourceUrl: "https://www.ups.com/holiday-fixture",
  sourceText: "September 7, 2026: Labor Day. No pickup or delivery." };
const RATES = [["upsxml_UPS Ground Saver", "UPS Ground Saver", 869],
  ["upsxml_UPS Ground", "UPS Ground", 1869],
  ["upsxml_UPS 3 Day Select", "UPS 3 Day Select", 1911],
  ["upsxml_UPS 2nd Day Air", "UPS 2nd Day Air", 2137],
  ["upsxml_UPS Next Day Air", "UPS Next Day Air", 4286],
  ["easyshipusps_fixture", "USPS - Ground Advantage", 593]];

function fixture() {
  const html = `<form action="/checkout" method="post">
    <input type="hidden" name="csrf_token" value="0123456789abcdef0123456789abcdef">
    ${RATES.map(([value, label, minor], index) =>
    `<input type="radio" name="shipping" id="shipping_${index}" value="${value}" ${index === 0 ? "checked" : ""}>
      <label for="shipping_${index}">${label} $${(minor / 100).toFixed(2)}</label>`).join("\n")}
    <button name="action" value="save_three">Continue</button>
  </form>`;
  const recovery = sha("recovery"), acceptance = sha("acceptance");
  const occurrence = sha("occurrence"), constraint = sha("constraint");
  const sourceRouteEvidence = createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: sha("proposal"), occurrenceRefHash: occurrence,
    recoveryOptionRefHash: recovery, observedAt: "2026-09-05T02:00:00.000Z",
    validUntil: "2026-09-05T02:55:30.000Z", sourceReplayReceiptHash: sha("receipt"),
    facts: {
      specification: { sourceOccurrenceRefHash: occurrence,
        frozenPredicateHash: acceptance, evaluationRefHash: sha("eval"), status: "MATCH" },
      allInPrice: { sourceOccurrenceRefHash: occurrence, constraintRefHash: constraint,
        currency: "USD", allInMinorUnits: 1395, includesItemTaxShippingAndFees: true,
        status: "COMPLETE" },
      eta: { sourceOccurrenceRefHash: occurrence, completionDeadline: DEADLINE,
        estimatedCompletionAt: null, status: "UNAVAILABLE" },
      capacity: { sourceOccurrenceRefHash: occurrence, capacityLifecycleRefHash: null,
        capacityLifecycleHeadHash: null, reservedFrom: null, reservedUntil: null,
        status: "UNRESERVED", sourceClass: "SELLER_SERVER_ACK_ONLY" },
    },
  });
  return { sourceRouteEvidence, shippingSourceBytes: Buffer.from(SHIPPING),
    step3SourceBytes: Buffer.from(html),
    step3Projection: { sourceBytesHash: sha(html), recoveryOptionRefHash: recovery,
      acceptanceSpecRefHash: acceptance, projectionHash: sha("step3-projection"),
      observedAt: "2026-09-05T01:00:00.000Z" },
    calendar: CALENDAR, plannedOrderAt: "2026-09-05T12:00:00.000Z" };
}

test("shipping processing and transit remain separate sourced estimates", () => {
  const terms = parseAdafruitShippingTermsV1(SHIPPING);
  assert.deepEqual(terms.processingBusinessDays, { minimum: 1, maximum: 2 });
  assert.deepEqual(terms.transitBusinessDays["UPS Ground Saver"], { minimum: 5, maximum: 8 });
  assert.equal(terms.expeditedCutoffHourET, 11);
  assert.equal(terms.sourcePromisesSameDayDispatch, false);
  assert.throws(() => parseAdafruitShippingTermsV1("Fast shipping"), /TERMS_UNRECOGNIZED/u);
});

test("Saturday planning skips Labor Day and proposes faster observed services", () => {
  const { assessment, routeEvidence } = buildAdafruitEtaPlanningV1(fixture());
  const byService = name => assessment.planningCandidates.find(row => row.service === name);
  const saver = byService("UPS Ground Saver");
  assert.equal(saver.arrivalWindow.earliestDate, "2026-09-15");
  assert.equal(saver.arrivalWindow.latestDate, "2026-09-21");
  assert.equal(saver.deadlineDisposition, "TYPICAL_WINDOW_AFTER_DEADLINE");
  assert.equal(byService("UPS 2nd Day Air").arrivalWindow.earliestDate, "2026-09-10");
  assert.equal(byService("UPS 2nd Day Air").arrivalWindow.latestDate, "2026-09-11");
  assert.equal(byService("UPS 2nd Day Air").deadlineDisposition,
    "TYPICAL_WINDOW_STRADDLES_DEADLINE");
  assert.equal(byService("UPS Next Day Air").arrivalWindow.latestDate, "2026-09-10");
  assert.equal(assessment.nextActionCandidates[0].service, "UPS Next Day Air");
  assert.equal(assessment.nextAction, "REQUOTE_FASTER_SERVICE_AND_REQUEST_DESTINATION_DATE");
  assert.equal(byService("USPS Ground Advantage").shippingMinor, 593);
  assert.equal(saver.quoteExpired, true);
  assert.equal(saver.arrivalWindow.guaranteed, false);
  assert.equal(assessment.networkRequestCount, 0);
  const verified = verifyBuyerNativeRouteEvidenceV1(routeEvidence);
  assert.equal(verified.facts.eta.status, "UNSTRUCTURED");
  assert.equal(verified.facts.eta.estimatedCompletionAt, null);
  assert.equal(verified.facts.capacity.status, "UNRESERVED");
  assert.equal(verified.validUntil, fixture().sourceRouteEvidence.validUntil);
});

test("11am cutoff is evaluated in Eastern time and does not apply on a holiday", () => {
  const plan = at => buildAdafruitEtaPlanningV1({ ...fixture(), plannedOrderAt: at })
    .assessment.planningCandidates.find(row => row.service === "UPS Next Day Air");
  const before = plan("2026-09-08T14:59:00.000Z");
  assert.equal(before.arrivalWindow.earliestDate, "2026-09-09");
  assert.equal(before.arrivalWindow.latestDate, "2026-09-09");
  const cutoff = plan("2026-09-08T15:00:00.000Z");
  assert.equal(cutoff.arrivalWindow.earliestDate, "2026-09-10");
  assert.equal(cutoff.arrivalWindow.latestDate, "2026-09-11");
  const holiday = plan("2026-09-07T14:00:00.000Z");
  assert.equal(holiday.arrivalWindow.dispatchEstimate, "USUAL_PROCESSING_RANGE");
  assert.equal(holiday.arrivalWindow.earliestDate, "2026-09-09");
});

test("calendar coverage and missing service terms remain actionable gaps", () => {
  const tooLate = buildAdafruitEtaPlanningV1({ ...fixture(),
    plannedOrderAt: "2026-09-25T12:00:00.000Z" }).assessment;
  const saver = tooLate.planningCandidates.find(row => row.service === "UPS Ground Saver");
  assert.equal(saver.arrivalWindow, null);
  assert.equal(saver.missingFact, "HOLIDAY_CALENDAR_DOES_NOT_COVER_ARRIVAL");
  const unsupported = buildAdafruitEtaPlanningV1({ ...fixture(),
    shippingSourceBytes: Buffer.from(SHIPPING.replace(
      "UPS Ground Saver is a low cost service. Delivery estimates range from 5-8 business days once shipped.", "")) });
  assert.equal(unsupported.assessment.planningCandidates[0].missingFact,
    "SERVICE_TRANSIT_TERMS_UNAVAILABLE");
});

test("existing direct source dates are retained and unbound checkout bytes reject", () => {
  const input = fixture();
  const { evidenceHash, schema, schemaVersion, ...sourceInput } = input.sourceRouteEvidence;
  input.sourceRouteEvidence = createBuyerNativeRouteEvidenceV1({ ...sourceInput,
    facts: { ...sourceInput.facts, eta: { ...sourceInput.facts.eta,
      estimatedCompletionAt: "2026-09-10T21:00:00.000Z", status: "STRUCTURED" } } });
  const result = buildAdafruitEtaPlanningV1(input);
  assert.equal(result.routeEvidence.evidenceHash, input.sourceRouteEvidence.evidenceHash);
  assert.equal(result.assessment.sourceDateEvidence.status, "STRUCTURED");
  assert.throws(() => buildAdafruitEtaPlanningV1({ ...fixture(),
    step3SourceBytes: Buffer.from("changed") }), /CHECKOUT_SOURCE_BINDING_INVALID/u);
});

test("next quote selection respects the whole order budget and searches another supplier when no affordable typical window fits", () => {
  const input = fixture();
  const { assessment } = buildAdafruitEtaPlanningV1(input);
  const decision = selectAdafruitEtaNextActionV1({ assessment,
    sourceRouteEvidence: input.sourceRouteEvidence, maximumAmountMinor: "2000" });
  assert.equal(decision.selectedQuote.service, "USPS Ground Advantage");
  assert.equal(decision.selectedQuote.estimatedOrderTotalMinor, 1119);
  assert.equal(decision.selectedQuote.deadlineDisposition,
    "TYPICAL_WINDOW_STRADDLES_DEADLINE");
  assert.equal(decision.searchAnotherSupplierInParallel, true);
  assert.equal(decision.nextActions[0], "SEARCH_DEADLINE_FEASIBLE_SUPPLIER_WITHIN_BUDGET");
  assert.equal(decision.candidates.find(row => row.service === "UPS Next Day Air")
    .budgetDisposition, "SHIPPING_QUOTE_EXCEEDS_TOTAL_BUDGET");
  assert.equal(decision.establishesStructuredEta, false);
  assert.equal(decision.establishesCapacity, false);
  assert.equal(decision.sourceValidUntil, input.sourceRouteEvidence.validUntil);
  const largerBudget = selectAdafruitEtaNextActionV1({ assessment,
    sourceRouteEvidence: input.sourceRouteEvidence, maximumAmountMinor: "5000" });
  assert.equal(largerBudget.selectedQuote.service, "UPS Next Day Air");
  assert.equal(largerBudget.selectedQuote.estimatedOrderTotalMinor, 4812);
  assert.equal(largerBudget.searchAnotherSupplierInParallel, false);
  const tightBudget = selectAdafruitEtaNextActionV1({ assessment,
    sourceRouteEvidence: input.sourceRouteEvidence, maximumAmountMinor: "600" });
  assert.equal(tightBudget.selectedQuote, null);
  assert.equal(tightBudget.candidates.find(row => row.service === "USPS Ground Advantage")
    .budgetDisposition, "REPRICING_ESTIMATE_OVER_BUDGET");
});

test("saved ETA assessments bind their source without being silently reissued", () => {
  const input = fixture();
  const { assessment } = buildAdafruitEtaPlanningV1(input);
  assert.throws(() => selectAdafruitEtaNextActionV1({
    assessment: { ...assessment, plannedOrderAt: "2026-09-08T12:00:00.000Z" },
    sourceRouteEvidence: input.sourceRouteEvidence, maximumAmountMinor: "2000" }),
  /ASSESSMENT_SOURCE_BINDING_INVALID/u);
});
