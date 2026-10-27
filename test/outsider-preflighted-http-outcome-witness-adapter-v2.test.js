import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createPreflightedHttpOutcomeWitnessAdapterV2 }
  from "../src/outsider-preflighted-http-outcome-witness-adapter-v2.js";

const ROUTE = "https://result.account.workers.dev/";
const BODY_HASH = `sha256:${createHash("sha256")
  .update("artifact").digest("hex")}`;

function context(input = {}) {
  const dependency = {
    requirementId: "primary_publication",
    role: "PRIMARY",
    constraints: { artifactHash: BODY_HASH },
  };
  const witness = {
    requirementId: "independent_http_witness",
    role: "INDEPENDENT_WITNESS",
    capability: "PUBLIC_HTTPS_LONGITUDINAL_EXACT_RESPONSE_OBSERVATION",
    constraints: { expectedStatus: 200, expectedBodyHash: BODY_HASH },
    dependsOnRequirementIds: [dependency.requirementId],
  };
  return {
    operationId: "reserve_witness_route_001",
    routeRef: input.routeRef ?? ROUTE,
    requirement: input.requirement ?? witness,
    dependencyRequirement: input.dependencyRequirement ?? dependency,
    program: input.program ?? { requirements: [dependency, witness] },
  };
}

function child(events) {
  return Object.freeze({
    adapterId: "composed-child-v1",
    providerRef: "uptimerobot-api-v3+globalping-v2",
    supports: () => true,
    async reserve() {
      events.push("CHILD_RESERVE");
      return {
        status: "RESERVED",
        reservationId: "reservation_001",
        validUntil: "2026-09-04T13:00:00.000Z",
        providerReceipt: { source: "uptime" },
        adapterState: { private: false },
      };
    },
    async observe() { return { status: "SATISFIED" }; },
    async release() { return { status: "RELEASED" }; },
    async closeObligation() { return { status: "CLOSED" }; },
  });
}

function adapter(events, observation = {}) {
  return createPreflightedHttpOutcomeWitnessAdapterV2({
    adapterId: "preflighted-child-v2",
    childAdapter: child(events),
    exactSpotObserver: Object.freeze({
      providerRef: "globalping-redirect-aware-v2",
      async observe(input) {
        events.push(["EXACT_PREFLIGHT", input]);
        if (observation.throw === true) throw new Error("unavailable");
        return {
          status: observation.status ?? 200,
          bodyHash: observation.bodyHash ?? BODY_HASH,
          providerReceipt: { receipt: "hash-only" },
        };
      },
    }),
    routeRef: ROUTE,
    expectedStatus: 200,
    expectedBodyHash: BODY_HASH,
  });
}

test("exact route compatibility is proven before monitor capacity is reserved",
  async () => {
    const events = [];
    const result = await adapter(events).reserve(context());
    assert.equal(result.status, "RESERVED");
    assert.equal(result.exactRoutePreflightProven, true);
    assert.equal(events[0][0], "EXACT_PREFLIGHT");
    assert.equal(events[0][1].targetUrl, ROUTE);
    assert.match(events[0][1].operationId, /:EXACT_PREFLIGHT$/u);
    assert.equal(events[1], "CHILD_RESERVE");
    assert.equal(result.providerReceipt.rawRouteProjected, false);
    assert.equal(JSON.stringify(result.providerReceipt).includes(ROUTE), false);
    assert.equal(result.providerReceipt.authorityMintedByPreflight, false);
    assert.equal(result.providerReceipt.independentOutcomeTruthClaimedByPreflight,
      false);
  });

for (const [name, observation, reason] of [
  ["observer unavailable", { throw: true }, "EXACT_ROUTE_PREFLIGHT_UNAVAILABLE"],
  ["body mismatch", { bodyHash: `sha256:${"0".repeat(64)}` },
    "EXACT_ROUTE_PREFLIGHT_MISMATCH"],
]) {
  test(`${name} cannot reserve monitor capacity`, async () => {
    const events = [];
    const result = await adapter(events, observation).reserve(context());
    assert.deepEqual(result, { status: "UNAVAILABLE", reason });
    assert.equal(events.includes("CHILD_RESERVE"), false);
  });
}

test("route/program/requirement mismatch fails before any external preflight",
  async () => {
    const events = [];
    const result = await adapter(events).reserve(context({
      routeRef: "https://different.account.workers.dev/",
    }));
    assert.deepEqual(result, {
      status: "UNAVAILABLE",
      reason: "EXACT_PREFLIGHT_PROGRAM_BINDING_MISMATCH",
    });
    assert.deepEqual(events, []);
  });
