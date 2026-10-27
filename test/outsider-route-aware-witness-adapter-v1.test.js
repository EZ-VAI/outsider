import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import { createRouteAwareWitnessAdapterV1 }
  from "../src/outsider-route-aware-witness-adapter-v1.js";
import { createRouteAwareWitnessAdapterV2 }
  from "../src/outsider-route-aware-witness-adapter-v2.js";

function hash(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function program() {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: "route_aware_witness_test",
    orderId: "order_route_aware_witness_test",
    createdAt: "2026-09-03T12:00:00.000Z",
    formationDeadline: "2026-09-03T12:10:00.000Z",
    completionDeadline: "2026-09-03T12:30:00.000Z",
    cleanupDeadline: "2026-09-03T12:40:00.000Z",
    artifactHash: hash("route-aware-artifact"),
    observationWindowMs: 600_000,
  });
}

function dependencies() {
  return {
    primary_publication: {
      requirementId: "primary_publication",
      role: "PRIMARY",
      reservationId: "primary-reservation",
      validUntil: "2026-09-03T13:00:00.000Z",
      adapterState: {
        publicRoute: "https://primary.example.test/result.json",
      },
    },
    recovery_publication: {
      requirementId: "recovery_publication",
      role: "RECOVERY",
      reservationId: "recovery-reservation",
      validUntil: "2026-09-03T13:00:00.000Z",
      adapterState: {
        publicRoute: "https://recovery.example.test/result.json",
      },
    },
  };
}

function fakeChildFactory(calls, options = {}) {
  return async ({ routeRole, routeRef, resumeReservation }) => {
    calls.push(["create", routeRole, routeRef,
      resumeReservation?.reservationId ?? null]);
    return {
      adapterId: `child.${routeRole.toLowerCase()}`,
      providerRef: "uptimerobot-api-v3+globalping-v2",
      async reserve(context) {
        calls.push(["reserve", routeRole, context.routeRef,
          context.operationId]);
        if (options.unavailableRole === routeRole) {
          return { status: "UNAVAILABLE", reason: "INJECTED" };
        }
        if (options.pendingUntilResume
          && (resumeReservation === null || resumeReservation === undefined)) {
          return {
            status: "PENDING",
            reason: "CREATE_COMMIT_UNKNOWN_RECONCILE_ONLY",
            reservationId: `child-reservation:${routeRole.toLowerCase()}`,
            validUntil: "2026-09-03T13:00:00.000Z",
            providerReceipt: { provider: "redacted-pending-receipt" },
            adapterState: { routeRole, monitorId: null,
              reserveOperationId: context.operationId,
              containsCredential: false },
          };
        }
        return {
          status: "RESERVED",
          reservationId: `child-reservation:${routeRole.toLowerCase()}`,
          validUntil: routeRole === "PRIMARY"
            ? "2026-09-03T12:55:00.000Z"
            : "2026-09-03T13:00:00.000Z",
          providerReceipt: { provider: "redacted-child-receipt" },
          adapterState: {
            routeRole,
            monitorHandle: `monitor:${routeRole.toLowerCase()}`,
            containsCredential: false,
          },
        };
      },
      async observe(context) {
        calls.push(["observe", routeRole, context.routeRef,
          context.reservation.reservationId, context.operationId]);
        return {
          status: "SATISFIED",
          providerReceipt: { provider: "redacted-observation" },
          bothSourcesSatisfied: true,
        };
      },
      async release(context) {
        calls.push(["release", routeRole, context.routeRef,
          context.disposition ?? null, context.operationId]);
        return {
          status: "RELEASED",
          receipt: hash(`released-${routeRole}`),
          adapterState: {
            ...context.reservation.adapterState,
            released: true,
          },
        };
      },
      async closeObligation(context) {
        calls.push(["close", routeRole, context.routeRef,
          context.operationId]);
        return { status: "CLOSED", receipt: hash(`closed-${routeRole}`) };
      },
    };
  };
}

function wrapper(calls, options = {}) {
  return createRouteAwareWitnessAdapterV1({
    adapterId: "witness.route-aware",
    providerRef: "route-aware-composite",
    routeFromReservation: ({ dependencyReservation }) =>
      dependencyReservation.adapterState.publicRoute,
    createRouteWitness: fakeChildFactory(calls, options),
  });
}

function wrapperV2(calls, options = {}) {
  return createRouteAwareWitnessAdapterV2({
    adapterId: "witness.route-aware-v2",
    providerRef: "route-aware-composite-v2",
    routeFromReservation: ({ dependencyReservation }) =>
      dependencyReservation.adapterState.publicRoute,
    createRouteWitness: fakeChildFactory(calls, options),
  });
}

function reserveContext(compiled) {
  return {
    program: compiled,
    requirement: compiled.requirements.find((item) =>
      item.role === "INDEPENDENT_WITNESS"),
    binding: { adapterId: "witness.route-aware" },
    dependencyReservations: dependencies(),
    operationId: "op_reserve_route_aware",
  };
}

test("reserves both routes before COMMIT and replay observes only the actual recovery route",
  async () => {
    const compiled = program();
    const formationCalls = [];
    const reservation = await wrapper(formationCalls).reserve(
      reserveContext(compiled));

    assert.equal(reservation.status, "RESERVED");
    assert.equal(reservation.validUntil, "2026-09-03T12:55:00.000Z");
    assert.deepEqual(reservation.adapterState.routes.map((item) =>
      [item.routeRole, item.routeRef]), [
      ["PRIMARY", "https://primary.example.test/result.json"],
      ["RECOVERY", "https://recovery.example.test/result.json"],
    ]);
    assert.deepEqual(reservation.providerReceipt.routes.map((item) =>
      item.childProviderRef), [
      "uptimerobot-api-v3+globalping-v2",
      "uptimerobot-api-v3+globalping-v2",
    ]);
    assert.equal(reservation.providerReceipt.allRoutesReservedBeforeCommit,
      true);
    assert.equal(formationCalls.filter(([phase]) => phase === "reserve").length,
      2);

    // A fresh wrapper proves adapterState is sufficient after restart.
    const replayCalls = [];
    const replay = wrapper(replayCalls);
    const observation = await replay.observe({
      program: compiled,
      requirement: reserveContext(compiled).requirement,
      reservation,
      effectResult: {
        status: "SUCCEEDED",
        routeUrl: "https://recovery.example.test/result.json",
      },
      operationId: "op_observe_recovery",
    });
    assert.equal(observation.status, "SATISFIED");
    assert.equal(observation.selectedRouteRole, "RECOVERY");
    assert.equal(observation.selectedRouteRef,
      "https://recovery.example.test/result.json");
    assert.equal(observation.providerReceipt.childProviderRef,
      "uptimerobot-api-v3+globalping-v2");
    assert.deepEqual(replayCalls.filter(([phase]) => phase === "observe")
      .map((call) => call[1]), ["RECOVERY"]);
    assert.equal(replayCalls.find(([phase]) => phase === "create")[3],
      "child-reservation:recovery");

    const closed = await replay.closeObligation({
      program: compiled,
      requirement: reserveContext(compiled).requirement,
      reservation,
      operationId: "op_close_both_routes",
    });
    assert.equal(closed.status, "CLOSED");
    assert.deepEqual(closed.providerReceipt.routes.map((item) =>
      item.childProviderRef), [
      "uptimerobot-api-v3+globalping-v2",
      "uptimerobot-api-v3+globalping-v2",
    ]);
    const released = await replay.release({
      program: compiled,
      requirement: reserveContext(compiled).requirement,
      reservation,
      disposition: "SUCCEEDED",
      operationId: "op_release_both_routes",
    });
    assert.equal(released.status, "RELEASED");
    assert.deepEqual(replayCalls.filter(([phase]) => phase === "close")
      .map((call) => call[1]).sort(), ["PRIMARY", "RECOVERY"]);
    assert.deepEqual(replayCalls.filter(([phase]) => phase === "release")
      .map((call) => call[1]).sort(), ["PRIMARY", "RECOVERY"]);
  });

test("downstream nodes inherit one witnessed route, while unknown routes stay inconclusive",
  async () => {
    const compiled = program();
    const calls = [];
    const adapter = wrapper(calls);
    const reservation = await adapter.reserve(reserveContext(compiled));
    const downstream = await adapter.observe({
      program: compiled,
      requirement: reserveContext(compiled).requirement,
      reservation,
      effectResult: {
        status: "SUCCEEDED",
        source: "SATISFIED_DEPENDENCIES",
        dependencyEvidence: [{
          witness: {
            status: "SATISFIED",
            selectedRouteRef:
              "https://recovery.example.test/result.json",
          },
          primary: {
            status: "FAILED",
            routeUrl: "https://primary.example.test/result.json",
          },
          recovery: {
            status: "SUCCEEDED",
            resultUrl: "https://recovery.example.test/result.json",
          },
        }],
      },
      operationId: "op_observe_downstream",
    });
    assert.equal(downstream.status, "SATISFIED");
    assert.equal(downstream.selectedRouteRole, "RECOVERY");

    const unknown = await adapter.observe({
      program: compiled,
      requirement: reserveContext(compiled).requirement,
      reservation,
      effectResult: {
        status: "SUCCEEDED",
        resultUrl: "https://unknown.example.test/result.json",
      },
      operationId: "op_observe_unknown",
    });
    assert.equal(unknown.status, "INCONCLUSIVE");
    assert.equal(unknown.reason, "EFFECT_RESULT_ROUTE_NOT_RESERVED");
    assert.equal(calls.filter(([phase]) => phase === "observe").length, 1);
  });

test("a partial route reservation is compensated instead of leaking witness capacity",
  async () => {
    const calls = [];
    const result = await wrapper(calls, {
      unavailableRole: "RECOVERY",
    }).reserve(reserveContext(program()));
    assert.equal(result.status, "UNAVAILABLE");
    assert.equal(result.reason, "ALL_ROUTE_WITNESS_RESERVATIONS_REQUIRED");
    const releases = calls.filter(([phase]) => phase === "release");
    assert.equal(releases.length, 1);
    assert.equal(releases[0][1], "PRIMARY");
    assert.equal(releases[0][3], "FORMATION_FAILED");
  });

test("v2 persists both pending-create routes and cold-resumes their child state",
  async () => {
    const compiled = program();
    const firstCalls = [];
    const first = await wrapperV2(firstCalls, {
      pendingUntilResume: true,
    }).reserve(reserveContext(compiled));
    assert.equal(first.status, "PENDING");
    assert.equal(first.allRoutesReservedBeforeCommit, false);
    assert.equal(first.providerReceipt.pendingCreateReconciliationPreserved,
      true);
    assert.deepEqual(first.adapterState.routes.map((entry) =>
      entry.childReservation.adapterState.monitorId), [null, null]);

    const resumedCalls = [];
    const resumed = await wrapperV2(resumedCalls, {
      pendingUntilResume: true,
    }).reserve({ ...reserveContext(compiled), resumeReservation: first });
    assert.equal(resumed.status, "RESERVED");
    assert.equal(resumed.providerReceipt.allRoutesReservedBeforeCommit, true);
    assert.deepEqual(resumedCalls.filter(([phase]) => phase === "create")
      .map((call) => call[3]).sort(), [
      "child-reservation:primary", "child-reservation:recovery",
    ]);
  });
