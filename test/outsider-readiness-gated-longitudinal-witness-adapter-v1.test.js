import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createReadinessGatedLongitudinalWitnessAdapterV1,
  unwrapReadinessGatedLongitudinalWitnessStateV1 }
  from "../src/outsider-readiness-gated-longitudinal-witness-adapter-v1.js";

function hash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

const POLICY = hash("redirect-policy");

function fixture(input = {}) {
  let nowMs = Date.parse("2026-09-04T12:00:00.000Z");
  const calls = [];
  let observation = 0;
  let releaseCount = 0;
  const child = {
    adapterId: "uptime-child-v2",
    providerRef: "uptimerobot-api-v3-redirect-aware-v2",
    capabilities: ["PUBLIC_HTTPS_LONGITUDINAL_OBSERVATION"],
    redirectObservation: {
      followRedirections: input.followRedirections ?? true,
      externalRedirectPolicyHash: POLICY,
      providerEnforcesExternalRedirectPolicy: false,
    },
    supports: () => true,
    async reserve(context) {
      calls.push(["RESERVE", context.operationId]);
      return {
        status: "RESERVED",
        reservationId: "child-reservation",
        validUntil: "2026-09-04T13:00:00.000Z",
        providerReceipt: { receipt: "created" },
        adapterState: { containsCredential: false, generation: 0,
          sourceStatus: "STARTED",
          sourceDeclaredRequirementMatch: null },
      };
    },
    async observe(context) {
      observation += 1;
      calls.push(["OBSERVE", context.operationId]);
      if (context.node?.kind === "OBSERVATION") {
        return {
          status: "SATISFIED",
          observationId: hash("longitudinal"),
          longitudinalWindowProven: true,
          windowFrom: context.witnessReadyAt,
          windowTo: new Date(Date.parse(context.witnessReadyAt) + 60_000)
            .toISOString(),
          sanitizedExactMetrics: {
            uptime: 100, totalDowntimeSeconds: 0, incidentCount: 0,
            mtbf: null, from: context.witnessReadyAt,
            to: new Date(Date.parse(context.witnessReadyAt) + 60_000)
              .toISOString(),
          },
          providerReceipt: { receipt: "exact-range" },
          adapterState: { containsCredential: false, generation: 2,
            sourceStatus: "UP", sourceDeclaredRequirementMatch: true },
        };
      }
      const status = input.alwaysStarted || observation === 1 ? "STARTED"
        : "UP";
      return {
        status: status === "UP" ? "SATISFIED" : "INCONCLUSIVE",
        observationId: hash(`readiness-${observation}`),
        providerReceipt: { receipt: `get-${observation}` },
        adapterState: { containsCredential: false, generation: observation,
          sourceStatus: status,
          sourceDeclaredRequirementMatch: status === "UP" ? true : null },
      };
    },
    async release(context) {
      releaseCount += 1;
      calls.push(["RELEASE", context.operationId]);
      if (input.rateLimitedRelease && releaseCount === 1) {
        return { status: "PENDING",
          retryAfter: new Date(nowMs + 60_000).toISOString(),
          adapterState: { containsCredential: false, released: false,
            deleteRateLimitRetryGeneration: 1,
            sourceStatus: "STARTED",
            sourceDeclaredRequirementMatch: null } };
      }
      return { status: "RELEASED", providerReceipt: { receipt: "deleted" },
        adapterState: { containsCredential: false, released: true,
          sourceStatus: "STARTED", sourceDeclaredRequirementMatch: null } };
    },
    async closeObligation(context) {
      calls.push(["CLOSE", context.operationId]);
      return { status: "CLOSED",
        adapterState: { containsCredential: false, released: true,
          sourceStatus: "UP", sourceDeclaredRequirementMatch: true } };
    },
  };
  const adapter = createReadinessGatedLongitudinalWitnessAdapterV1({
    childAdapter: child,
    clock: () => new Date(nowMs).toISOString(),
    wait: async (milliseconds) => { calls.push(["WAIT", milliseconds]);
      if (!input.waitDoesNotAdvance) nowMs += milliseconds; },
    minimumSafeReadSpacingMs: 15_000,
    maximumReadOccurrences: input.maximumReadOccurrences ?? 3,
    requireRedirectFollowing: input.requireRedirectFollowing ?? true,
    externalRedirectPolicyHash: POLICY,
  });
  return { adapter, child, calls, setNow(value) { nowMs = Date.parse(value); } };
}

function reserveContext() {
  return {
    operationId: "formation-reserve",
    program: { formationDeadline: "2026-09-04T12:01:00.000Z" },
  };
}

test("create ACK and STARTED cannot reserve; one spaced fresh UP can", async () => {
  const state = fixture();
  const result = await state.adapter.reserve(reserveContext());
  assert.equal(result.status, "RESERVED");
  assert.equal(result.freshUpProvenBeforeCommit, true);
  assert.equal(result.witnessReadyAt, "2026-09-04T12:00:15.000Z");
  assert.deepEqual(state.calls.map(([kind]) => kind),
    ["RESERVE", "OBSERVE", "WAIT", "OBSERVE"]);
  assert.equal(result.providerReceipt.sourceStatus, "UP");
  assert.equal(result.providerReceipt.safeReadOccurrenceCount, 2);
  assert.equal(result.providerReceipt.monitorCreateAcknowledgementAcceptedAsReadiness,
    false);
  const raw = unwrapReadinessGatedLongitudinalWitnessStateV1(
    result.adapterState);
  assert.equal(raw.sourceStatus, "UP");
  assert.equal(raw.generation, 2);
});

test("budget exhaustion releases the unready monitor before UNAVAILABLE",
  async () => {
    const state = fixture({ alwaysStarted: true, maximumReadOccurrences: 2 });
    const result = await state.adapter.reserve(reserveContext());
    assert.equal(result.status, "UNAVAILABLE");
    assert.equal(result.reason, "READINESS_SAFE_READ_BUDGET_EXHAUSTED");
    assert.equal(result.childReservationReleased, true);
    assert.deepEqual(state.calls.map(([kind]) => kind),
      ["RESERVE", "OBSERVE", "WAIT", "OBSERVE", "RELEASE"]);
  });

test("readiness failure waits through retryable DELETE 429 cleanup", async () => {
  const state = fixture({ alwaysStarted: true, maximumReadOccurrences: 1,
    rateLimitedRelease: true });
  const result = await state.adapter.reserve(reserveContext());
  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(result.childReservationReleased, true);
  assert.deepEqual(state.calls.map(([kind]) => kind),
    ["RESERVE", "OBSERVE", "RELEASE", "WAIT", "RELEASE"]);
});

test("a route requiring redirect following rejects a direct-only monitor",
  () => {
    assert.throws(() => fixture({ followRedirections: false }),
      /REQUIRED_REDIRECT_FOLLOWING_DISABLED/u);
  });

test("an injected early-return wait cannot exceed the safe read rate", async () => {
  const state = fixture({ alwaysStarted: true, waitDoesNotAdvance: true });
  const result = await state.adapter.reserve(reserveContext());
  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(result.reason, "READINESS_WAIT_DID_NOT_ADVANCE_SAFE_INTERVAL");
  assert.equal(result.readinessSafeReadOccurrenceCount, 1);
  assert.deepEqual(state.calls.map(([kind]) => kind),
    ["RESERVE", "OBSERVE", "WAIT", "RELEASE"]);
});

test("longitudinal range cannot predate persisted readiness and child state propagates",
  async () => {
    const state = fixture();
    const reserved = await state.adapter.reserve(reserveContext());
    const criterion = { criterionId: "availability", expected: 60_000,
      comparator: "PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS" };
    const base = {
      operationId: "observe-window",
      reservation: reserved,
      program: { outcome: { acceptance: [criterion] } },
      node: { kind: "OBSERVATION", acceptance: ["availability"],
        input: { observationWindowMs: 60_000 } },
    };
    const rejected = await state.adapter.observe({ ...base,
      effectResult: { dependencyEvidence: [{
        witnessRecordedAt: "2026-09-04T12:00:14.000Z",
      }] },
    });
    assert.equal(rejected.status, "INCONCLUSIVE");
    assert.equal(rejected.reason,
      "OBSERVATION_WINDOW_PREDATES_WITNESS_READINESS");
    const accepted = await state.adapter.observe({ ...base,
      operationId: "observe-window-current",
      effectResult: { dependencyEvidence: [{
        witnessRecordedAt: "2026-09-04T12:00:16.000Z",
      }] },
    });
    assert.equal(accepted.status, "SATISFIED");
    assert.equal(accepted.observationWindowAnchoredAfterReadiness, true);
    assert.equal(accepted.sanitizedExactMetrics.uptime, 100);
    assert.equal(unwrapReadinessGatedLongitudinalWitnessStateV1(
      accepted.adapterState).generation, 2);
  });
