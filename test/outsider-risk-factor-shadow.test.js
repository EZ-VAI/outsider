import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalizeStrict } from "../src/canonical.js";
import { buildRiskFactorShadowMeasurement, verifyRiskFactorShadowMeasurement,
  OUTSIDERF_RISK_SCHEMA_SNAPSHOT } from "../src/outsider-risk-factor-shadow.js";

const hash = (value) => `sha256:${createHash("sha256")
  .update(typeof value === "string" ? value : canonicalizeStrict(value)).digest("hex")}`;
const H = (char) => `sha256:${char.repeat(64)}`;

function experience({ id = "a", group = "g", terminalClass = "SAFE_DELIVERY",
  delivery = true, causal = false } = {}) {
  const body = {
    schema: "outsider/supervised-experience/v2", schemaVersion: "2.0.0",
    extractor: { id: "outsider-supervised-experience/v2", version: "2.0.0" },
    source: { runId: id, manifestHash: H("a"), projectionHash: H("b"),
      publicEvidenceHash: H("c"), eventChainHash: H("d"), eventCount: 2 },
    attestationCompatibility: { artifactType: "outsider_attestation_v2", groupKey: {
      extractorId: "x", productVersion: "1.3.13", controllerImplementationHash: H("e"),
      hostProtocol: "claude-code", wayHash: H("f"), claimRefHash: hash(group),
      worldRefHash: H("1"), authorityRefHash: H("2") } },
    evaluationContext: { gatesObserved: ["R1"], gatePassClaimed: false },
    terminal: { terminalClass, proofComplete: causal, deliveryComplete: delivery,
      interventionRequired: causal, interventionComplete: causal },
    riskEvidence: { observedOnly: true, classificationAuthority: "DETERMINISTIC_EVENT_MAPPING",
      establishesLossOrLiability: false },
    riskEvents: [],
    causalChains: causal ? [{ sealedComplete: true, events: [
      { seq: 10, type: "boundary_paused", eventHash: H("3") },
      { seq: 22, type: "effect_observed", eventHash: H("4") },
    ] }] : [],
    hostCapacity: { observedOnly: true, toolBoundaries: { pre: 5, post: 5 } },
    modelInput: { schema: "outsider/experience/v1", labels: {}, verified: {
      resolved: delivery, deliveryResolved: delivery, outsiderCausalContribution: causal,
      eligibleForCorrectionEffectLearning: causal } },
    learningLabels: { deliveryResolved: delivery, outsiderCausalContribution: causal,
      eligibleForCorrectionEffectLearning: causal,
      causalAttributionClass: causal ? "AUDITED_INTERVENTION_COMPLETE" : "NO_DELIVERY" },
  };
  return { ...body, recordHash: hash(body) };
}

test("risk-factor shadow maps only sealed observations and keeps production dormant", () => {
  const report = buildRiskFactorShadowMeasurement([experience()], { now: 42 });
  assert.equal(verifyRiskFactorShadowMeasurement(report).ok, true);
  assert.equal(report.factorSchema.schemaHash, OUTSIDERF_RISK_SCHEMA_SNAPSHOT.schemaHash);
  assert.equal(report.measurements[0].factors.length, 36);
  assert.deepEqual(report.factorCoverage.measuredFactorIds, [
    "executor_identity_stability", "outcome_cohort_maturity_count",
    "semantic_closure_state", "telemetry_completeness_ratio",
  ]);
  assert.equal(report.boundary.decision, "ABSTAIN_NO_ADMISSIBLE_L3_L4");
  assert.equal(report.boundary.financialEffect, "none");
  assert.equal(report.factorCoverage.productionHeadCanRun, false);
  const privilege = report.measurements[0].factors.find((f) => f.factorId === "privilege_level");
  assert.deepEqual([privilege.status, privilege.value, privilege.measurementQuality],
    ["missing", null, "unavailable"]);
});

test("shadow cohorts preserve correlation and never call repeated runs independent domains", () => {
  const first = experience({ id: "a", group: "same" });
  const second = experience({ id: "b", group: "same", terminalClass: "CONSERVATIVE_STOP",
    delivery: false });
  second.source = { ...second.source, runId: "b", manifestHash: H("9") };
  const { recordHash: _old, ...secondBody } = second;
  const fixed = { ...secondBody, recordHash: hash(secondBody) };
  const report = buildRiskFactorShadowMeasurement([first, fixed], { now: 42 });
  assert.equal(report.corpus.accepted, 2);
  assert.equal(report.corpus.uniqueCorrelationGroups, 1);
  assert.equal(report.corpus.independentDomainCount, 0);
  assert.equal(report.cohorts[0].nRuns, 2);
  assert.equal(report.cohorts[0].deliveryResolvedRate, 0.5);
  for (const row of report.measurements) {
    assert.equal(row.factors.find((f) => f.factorId === "outcome_cohort_maturity_count").value, 2);
  }
});

test("only a sealed intervention creates correction latency; tampering is rejected", () => {
  const report = buildRiskFactorShadowMeasurement([experience({ causal: true })], { now: 42 });
  const latency = report.measurements[0].factors
    .find((factor) => factor.factorId === "self_correction_latency_events");
  assert.deepEqual([latency.status, latency.value], ["derived", 12]);
  const tampered = structuredClone(report);
  tampered.boundary.financialEffect = "price";
  assert.equal(verifyRiskFactorShadowMeasurement(tampered).ok, false);
});

test("duplicate and invalid experience records are refused rather than pooled", () => {
  const good = experience();
  const bad = structuredClone(good);
  bad.learningLabels.deliveryResolved = false;
  const report = buildRiskFactorShadowMeasurement([good, good, bad], { now: 42 });
  assert.equal(report.corpus.accepted, 1);
  assert.equal(report.corpus.refused, 2);
  assert.deepEqual(report.refused.map((item) => item.reason).sort(),
    ["DUPLICATE_RECORD_HASH", "SUPERVISED_EXPERIENCE_HASH_BROKEN"].sort());
});

