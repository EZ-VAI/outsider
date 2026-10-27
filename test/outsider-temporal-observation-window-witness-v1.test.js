import assert from "node:assert/strict";
import test from "node:test";

import { createTemporalObservationWindowWitnessV1 }
  from "../src/outsider-temporal-observation-window-witness-v1.js";

function child(observe) {
  return {
    adapterId: "independent-witness.test",
    providerRef: "independent-provider.test",
    reserve: async () => ({ status: "RESERVED" }),
    observe,
    release: async () => ({ status: "RELEASED" }),
    closeObligation: async () => ({ status: "CLOSED" }),
  };
}

function context(comparator = "PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS") {
  return {
    program: {
      outcome: {
        acceptance: [{
          criterionId: "horizon",
          comparator,
          expected: 600_000,
        }],
      },
    },
    node: {
      nodeId: "sustain_and_observe",
      kind: "OBSERVATION",
      input: { observationWindowMs: 600_000 },
      acceptance: ["horizon"],
    },
    effectResult: {
      dependencyEvidence: [{
        nodeId: "publish_result",
        primaryEffectRecordedAt: "2026-09-03T12:00:30.000Z",
        recoveryEffectRecordedAt: null,
        witnessRecordedAt: "2026-09-03T12:01:00.000Z",
      }],
    },
    operationId: "op_observe_1",
  };
}

test("does not contact a witness before the provider-statistics horizon", async () => {
  let childCalls = 0;
  const adapter = createTemporalObservationWindowWitnessV1({
    witnessAdapter: child(async () => {
      childCalls += 1;
      return { status: "SATISFIED" };
    }),
    clock: () => "2026-09-03T12:05:00.000Z",
  });
  const result = await adapter.observe(context());
  assert.equal(result.status, "INCONCLUSIVE");
  assert.equal(result.reason, "OBSERVATION_WINDOW_OPEN");
  assert.equal(result.windowStartedAt, "2026-09-03T12:01:00.000Z");
  assert.equal(result.retryAfter, "2026-09-03T12:11:00.000Z");
  assert.equal(childCalls, 0);
});

test("requires explicit longitudinal proof for provider reports and continuous truth",
  async () => {
    let longitudinalWindowProven = false;
    const adapter = createTemporalObservationWindowWitnessV1({
      witnessAdapter: child(async () => ({
        status: "SATISFIED",
        longitudinalWindowProven,
      })),
      clock: () => "2026-09-03T12:12:00.000Z",
    });

    const unprovenProviderReport = await adapter.observe(context());
    assert.equal(unprovenProviderReport.status, "INCONCLUSIVE");
    assert.equal(unprovenProviderReport.reason,
      "LONGITUDINAL_WINDOW_NOT_PROVEN");
    assert.equal(unprovenProviderReport
      .providerReportedZeroDowntimeSatisfied, false);

    const unprovenContinuous = await adapter.observe(
      context("CONTINUOUS_FOR_MS"));
    assert.equal(unprovenContinuous.status, "INCONCLUSIVE");
    assert.equal(unprovenContinuous.reason,
      "LONGITUDINAL_WINDOW_NOT_PROVEN");
    assert.equal(unprovenContinuous.continuousWindowSatisfied, false);

    longitudinalWindowProven = true;
    const provenProviderReport = await adapter.observe(context());
    assert.equal(provenProviderReport.status, "SATISFIED");
    assert.equal(provenProviderReport
      .providerReportedZeroDowntimeSatisfied, true);

    const provenContinuous = await adapter.observe(
      context("CONTINUOUS_FOR_MS"));
    assert.equal(provenContinuous.status, "SATISFIED");
    assert.equal(provenContinuous.continuousWindowSatisfied, true);
  });
