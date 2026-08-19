import test from "node:test";
import assert from "node:assert/strict";
import { summarizeSupervisedExperience } from "../src/outsider-supervised-corpus.js";

// The exporter itself is covered with full sealed-run fixtures elsewhere.  This
// test pins the corpus admission boundary without duplicating those fixtures.
test("an empty corpus never becomes reliability, loss, or pricing evidence", () => {
  const report = summarizeSupervisedExperience([]);
  assert.equal(report.counts.verifiedUnique, 0);
  assert.equal(report.counts.productionReliabilityEligible, 0);
  assert.equal(report.counts.lossSeverityEligible, 0);
  assert.equal(report.counts.pricingEligible, 0);
  assert.equal(report.authority.admissibleForPricing, false);
});

test("invalid and duplicate records are not silently multiplied", () => {
  const invalid = { schema: "outsider/supervised-experience/v2", recordHash: "no" };
  const report = summarizeSupervisedExperience([invalid, invalid]);
  assert.equal(report.counts.verifiedUnique, 0);
  assert.equal(report.counts.refused, 2);
});
