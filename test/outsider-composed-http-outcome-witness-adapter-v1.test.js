import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createComposedHttpOutcomeWitnessAdapterV1,
  unwrapComposedHttpOutcomeWitnessStateV1,
} from "../src/outsider-composed-http-outcome-witness-adapter-v1.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function program() {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: "composed_witness_test",
    orderId: "order_composed_witness_test",
    createdAt: "2026-09-03T12:00:00.000Z",
    formationDeadline: "2026-09-03T12:10:00.000Z",
    completionDeadline: "2026-09-03T12:30:00.000Z",
    cleanupDeadline: "2026-09-03T12:40:00.000Z",
    artifactHash: h("exact-artifact"),
    observationWindowMs: 600_000,
  });
}

function fakeUptime(status = "SATISFIED", longitudinalWindowProven = false) {
  const calls = [];
  const adapter = {
    adapterId: "uptime.fake",
    providerRef: "uptimerobot-api-v3",
    supports(requirement) {
      calls.push(["supports", requirement.capability]);
      return requirement.capability
        === "PUBLIC_HTTPS_LONGITUDINAL_OBSERVATION";
    },
    async reserve(context) {
      calls.push(["reserve", context.operationId]);
      return {
        status: "RESERVED",
        reservationId: h("uptime-reservation"),
        validUntil: "2026-09-03T12:40:00.000Z",
        providerReceipt: { id: "uptime-reserve-receipt" },
        adapterState: {
          schema: "outsider/uptimerobot-monitor-handle/v1",
          monitorId: 797054213,
          containsCredential: false,
        },
      };
    },
    async observe(context) {
      calls.push(["observe", context.operationId,
        context.reservation.adapterState.monitorId]);
      return {
        status,
        reason: status === "INCONCLUSIVE" ? "MONITOR_NOT_READY" : null,
        sourceStatus: status === "INCONCLUSIVE" ? "STARTED" : "UP",
        longitudinalWindowProven,
        providerReceipt: { id: "uptime-observation-receipt" },
      };
    },
    async release(context) {
      calls.push(["release", context.operationId,
        context.reservation.adapterState.monitorId]);
      return {
        status: "RELEASED",
        receipt: h("uptime-release"),
        adapterState: {
          ...context.reservation.adapterState,
          released: true,
        },
      };
    },
    async closeObligation(context) {
      calls.push(["close", context.operationId,
        context.reservation.adapterState.monitorId]);
      return { status: "CLOSED", receipt: h("uptime-close") };
    },
  };
  return { adapter, calls };
}

function context(compiled, reservation, nodeIndex = 0) {
  const node = compiled.nodes[nodeIndex];
  const requirement = compiled.requirements.find((item) =>
    item.requirementId === node.witnessRequirementId);
  return {
    program: compiled,
    node,
    effectiveRoute: "RECOVERY",
    effectResult: {
      status: "SUCCEEDED",
      routeUrl: "https://recovery.example.net/result.json",
    },
    acceptance: node.acceptance,
    requirement,
    binding: { adapterId: "witness.composed" },
    reservation,
    operationId: `observe-node-${nodeIndex}`,
  };
}

test("exact status/hash acceptance succeeds from the independent spot while the reserved monitor is warming",
  async () => {
    const uptime = fakeUptime("INCONCLUSIVE");
    const compiled = program();
    const spotCalls = [];
    const adapter = createComposedHttpOutcomeWitnessAdapterV1({
      adapterId: "witness.composed",
      uptimeAdapter: uptime.adapter,
      uptimeProviderRef: "uptimerobot-api-v3",
      spotProviderRef: "globalping-v2",
      exactSpotObserver: async (input) => {
        spotCalls.push(input);
        return {
          status: 200,
          bodyHash: h("exact-artifact"),
          providerReceipt: { measurement: "private-id-not-projected" },
        };
      },
    });
    assert.deepEqual(adapter.capabilities,
      ["PUBLIC_HTTPS_LONGITUDINAL_EXACT_RESPONSE_OBSERVATION"]);
    assert.equal(adapter.supports(compiled.requirements[2]), true);
    assert.equal(uptime.calls.find(([phase]) => phase === "supports")[1],
      "PUBLIC_HTTPS_LONGITUDINAL_OBSERVATION");
    const reservation = await adapter.reserve({
      program: compiled,
      requirement: compiled.requirements[2],
      operationId: "reserve-composed-witness",
    });
    assert.equal(reservation.status, "RESERVED");
    assert.equal(reservation.providerReceipt.longitudinalProviderRef,
      "uptimerobot-api-v3");
    assert.equal(reservation.providerReceipt.exactSpotProviderRef,
      "globalping-v2");
    assert.equal(unwrapComposedHttpOutcomeWitnessStateV1(
      reservation.adapterState).monitorId, 797054213);

    const observation = await adapter.observe(context(compiled, reservation));
    assert.equal(observation.status, "SATISFIED");
    assert.equal(observation.longitudinalStatusSatisfied, null);
    assert.equal(observation.exactResponseMatched, true);
    assert.equal(observation.bothSourcesSatisfied, false);
    assert.equal(observation.providerReceipt.bothSourcesRequired, false);
    assert.equal(observation.providerReceipt.longitudinal.status,
      "NOT_REQUIRED");
    assert.equal(uptime.calls.some(([phase]) => phase === "observe"), false,
      "monitor readiness is irrelevant to an exact-only node");
    assert.equal(observation.providerReceipt.longitudinal.providerRef,
      "uptimerobot-api-v3");
    assert.equal(observation.providerReceipt.exactSpot.providerRef,
      "globalping-v2");
    assert.equal(spotCalls[0].targetUrl,
      "https://recovery.example.net/result.json");
    assert.deepEqual(spotCalls[0].expectedExactResponse, {
      status: 200, bodyHash: h("exact-artifact"),
    });
    assert.equal(JSON.stringify(observation)
      .includes("private-id-not-projected"), false);

    const closed = await adapter.closeObligation({
      reservation, operationId: "close-witness",
    });
    assert.equal(closed.status, "CLOSED");
    const released = await adapter.release({
      reservation, operationId: "release-witness",
    });
    assert.equal(released.status, "RELEASED");
    assert.equal(released.providerReceipt.longitudinalProviderRef,
      "uptimerobot-api-v3");
    assert.equal(released.providerReceipt.exactSpotProviderRef,
      "globalping-v2");
  });

test("an exact status or body mismatch is NOT_SATISFIED even when Uptime is UP",
  async () => {
    const compiled = program();
    for (const spotResult of [
      { status: 503, bodyHash: h("exact-artifact") },
      { status: 200, bodyHash: h("wrong-artifact") },
    ]) {
      const uptime = fakeUptime("SATISFIED");
      const adapter = createComposedHttpOutcomeWitnessAdapterV1({
        uptimeAdapter: uptime.adapter,
        spotProviderRef: "globalping-v2",
        exactSpotObserver: async () => spotResult,
      });
      const reservation = await adapter.reserve({
        operationId: `reserve-${spotResult.status}-${spotResult.bodyHash}`,
      });
      const observation = await adapter.observe(
        context(compiled, reservation));
      assert.equal(observation.status, "NOT_SATISFIED");
      assert.equal(observation.reason, "EXACT_RESPONSE_MISMATCH");
      assert.equal(observation.bothSourcesSatisfied, false);
    }
  });

test("a longitudinal node remains INCONCLUSIVE when either required source is unavailable",
  async () => {
    const compiled = program();
    const cases = [
      {
        uptimeStatus: "INCONCLUSIVE",
        longitudinalWindowProven: false,
        spot: async () => ({ status: 200, bodyHash: h("exact-artifact") }),
        reason: "MONITOR_NOT_READY",
      },
      {
        uptimeStatus: "SATISFIED",
        longitudinalWindowProven: true,
        spot: async () => { throw new Error("spot unavailable"); },
        reason: "EXACT_SPOT_OBSERVATION_UNAVAILABLE",
      },
    ];
    for (const item of cases) {
      const uptime = fakeUptime(item.uptimeStatus,
        item.longitudinalWindowProven);
      const adapter = createComposedHttpOutcomeWitnessAdapterV1({
        uptimeAdapter: uptime.adapter,
        spotProviderRef: "globalping-v2",
        exactSpotObserver: item.spot,
      });
      const reservation = await adapter.reserve({
        operationId: `reserve-${item.uptimeStatus}`,
      });
      const observation = await adapter.observe(
        context(compiled, reservation, 1));
      assert.equal(observation.status, "INCONCLUSIVE");
      assert.equal(observation.reason, item.reason);
      assert.equal(observation.bothSourcesSatisfied, false);
    }
  });

test("CHECKPOINT reuses proven dependency acceptance without another provider observation",
  async () => {
    const compiled = program();
    const uptime = fakeUptime("INCONCLUSIVE");
    let spotCalls = 0;
    const adapter = createComposedHttpOutcomeWitnessAdapterV1({
      uptimeAdapter: uptime.adapter,
      spotProviderRef: "globalping-v2",
      exactSpotObserver: async () => {
        spotCalls += 1;
        throw new Error("checkpoint must not call spot observer");
      },
    });
    const reservation = await adapter.reserve({
      operationId: "reserve-checkpoint-reuse",
    });
    const checkpointContext = context(compiled, reservation, 2);
    checkpointContext.routeRef =
      "https://recovery.example.net/result.json";
    checkpointContext.effectResult = {
      status: "SUCCEEDED",
      source: "SATISFIED_DEPENDENCIES",
      dependencyEvidence: [{
        nodeId: "sustain_and_observe",
        witness: {
          status: "SATISFIED",
          observationId: h("prior-witness"),
          selectedRouteRef: "https://recovery.example.net/result.json",
          exactResponseMatched: true,
          longitudinalWindowProven: true,
        },
      }],
    };
    const observation = await adapter.observe(checkpointContext);
    assert.equal(observation.status, "SATISFIED");
    assert.equal(observation.acceptanceEvidenceReused, true);
    assert.equal(observation.longitudinalWindowProven, true);
    assert.equal(spotCalls, 0);
    assert.equal(uptime.calls.some(([phase]) => phase === "observe"), false);
  });

test("provider-reported zero downtime propagates only with exact-range stats and exact endpoint evidence",
  async () => {
    const compiled = program();
    const goodUptime = fakeUptime("SATISFIED", true);
    const exactSpotObserver = async () => ({
      status: 200,
      bodyHash: h("exact-artifact"),
      providerReceipt: { measurement: "exact-horizon-sample" },
    });
    const adapter = createComposedHttpOutcomeWitnessAdapterV1({
      uptimeAdapter: goodUptime.adapter,
      spotProviderRef: "globalping-v2",
      exactSpotObserver,
    });
    const reservation = await adapter.reserve({
      operationId: "reserve-provider-window",
    });
    const observation = await adapter.observe(
      context(compiled, reservation, 1));
    assert.equal(observation.status, "SATISFIED");
    assert.equal(observation.longitudinalWindowProven, true);
    assert.equal(observation.bothSourcesSatisfied, true);
    assert.equal(observation.providerReceipt.longitudinalWindowProven, true);
    assert.equal(observation.providerReceipt.longitudinal
      .exactRangeWindowProven, true);

    const unprovenUptime = fakeUptime("SATISFIED", false);
    const unprovenAdapter = createComposedHttpOutcomeWitnessAdapterV1({
      uptimeAdapter: unprovenUptime.adapter,
      spotProviderRef: "globalping-v2",
      exactSpotObserver,
    });
    const unprovenReservation = await unprovenAdapter.reserve({
      operationId: "reserve-unproven-window",
    });
    const unproven = await unprovenAdapter.observe(
      context(compiled, unprovenReservation, 1));
    assert.equal(unproven.status, "INCONCLUSIVE");
    assert.equal(unproven.reason, "LONGITUDINAL_WINDOW_NOT_PROVEN");
    assert.equal(unproven.longitudinalWindowProven, false);

    const mismatchAdapter = createComposedHttpOutcomeWitnessAdapterV1({
      uptimeAdapter: fakeUptime("SATISFIED", true).adapter,
      spotProviderRef: "globalping-v2",
      exactSpotObserver: async () => ({
        status: 200, bodyHash: h("wrong-artifact"),
      }),
    });
    const mismatchReservation = await mismatchAdapter.reserve({
      operationId: "reserve-window-mismatch",
    });
    const mismatch = await mismatchAdapter.observe(
      context(compiled, mismatchReservation, 1));
    assert.equal(mismatch.status, "NOT_SATISFIED");
    assert.equal(mismatch.longitudinalWindowProven, false);
  });
