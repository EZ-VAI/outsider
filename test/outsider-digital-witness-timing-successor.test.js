import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createUptimeRobotFormationWitnessAdapterV2,
  createUptimeRobotHttpWitnessDriverV2,
  createUptimeRobotHttpWitnessPlanV2,
  createUptimeRobotHttpWitnessPlanV3,
  OUTSIDER_HTTP_WITNESS_READINESS_TIMING_POLICY,
  resumeUptimeRobotHttpWitnessDriverV2,
  sealUptimeRobotApiCapabilityV2,
} from "../src/outsider-uptimerobot-http-witness-adapter-v2.js";
import {
  normalizeDigitalWitnessLifecycleConfiguration,
  resolveDigitalWitnessLifecycle,
} from "../src/outsider-first-committed-digital-reality-production-composition.js";

const policy = OUTSIDER_HTTP_WITNESS_READINESS_TIMING_POLICY;
const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const program = {
  createdAt: "2026-09-05T19:00:45.048Z",
  formationDeadline: "2026-09-05T19:05:45.048Z",
  completionDeadline: "2026-09-05T19:38:46.189Z",
};
const requirement = { requirementId: "independent_http_witness" };
const publishedAt = "2026-09-05T19:03:00.815Z";
const readyAt = "2026-09-05T19:02:00.000Z";
const dueAt = "2026-09-05T19:13:00.815Z";

function planInput(configuration) {
  return {
    targetUrl: "https://example.com/outsider-timing-fixture",
    friendlyName: "outsider-timing-fixture",
    intervalSeconds: 300,
    timeoutSeconds: 30,
    httpMethod: "GET",
    successHttpResponseCodes: ["2xx"],
    followRedirections: false,
    redirectPolicyHash: hash("fixture-redirect-policy"),
    observationRequirementHash: hash("fixture-observation"),
    ...resolveDigitalWitnessLifecycle(program, requirement, configuration),
  };
}

async function fixture(t, plan, initialNow = program.createdAt) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "outsider-timing-")));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let now = initialNow;
  const calls = [];
  const requestImpl = async (url, options) => {
    calls.push({ url, method: options.method });
    if (options.method === "POST") return Response.json({
      id: 803910199, type: "HTTP", friendlyName: plan.friendlyName,
      url: plan.targetUrl, status: "UP",
    }, { status: 201 });
    if (url.includes("/stats/uptime?")) {
      const query = new URL(url).searchParams;
      return Response.json({ uptime: 100, total_downtime_seconds: 0,
        incident_count: 0, mtbf: null,
        from: query.get("from"), to: query.get("to") });
    }
    throw new Error("unexpected fixture transport");
  };
  const driverInput = {
    plan, expectedPlanHash: plan.planHash,
    credentialCapability: sealUptimeRobotApiCapabilityV2({
      apiToken: "fixture-timing-private-token",
      expiresAt: "2026-09-05T20:30:00.000Z",
    }),
    ledgerDirectory: path.join(root, "ledger"),
    ledgerId: "ledger_0123456789abcdef0123456789abcdef",
    adapterInstanceRefHash: hash("timing-adapter"),
    permissionGrantHash: hash("fixture-only-not-external-authority"),
    privateProjectionNonce: "fixture_timing_nonce_12345",
  };
  const dependencies = { requestImpl, clock: () => now };
  const adapter = createUptimeRobotFormationWitnessAdapterV2(
    createUptimeRobotHttpWitnessDriverV2(driverInput, dependencies));
  const reservation = await adapter.reserve({ operationId: "reserve-timing", program });
  assert.equal(reservation.status, "RESERVED");
  return { adapter, reservation, calls, driverInput, dependencies,
    setNow(value) { now = value; } };
}

function observation(reservation, operationId, overrides = {}) {
  return {
    operationId, reservation, witnessReadyAt: readyAt,
    program: { outcome: { acceptance: [{ criterionId: "availability",
      expected: 600_000, comparator: "PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS" }] } },
    node: { kind: "OBSERVATION", acceptance: ["availability"],
      input: { observationWindowMs: 600_000 } },
    effectResult: { dependencyEvidence: [{ witnessRecordedAt: publishedAt }] },
    ...overrides,
  };
}

test("timing opt-in separates formation expiry from service eligibility without altering legacy plans", () => {
  const oldInput = planInput();
  assert.equal(oldInput.serviceFrom, program.formationDeadline);
  const old = createUptimeRobotHttpWitnessPlanV2(oldInput);
  assert.equal(old.schema, "outsider/uptimerobot-http-witness-plan/v2");
  assert.equal(Object.hasOwn(old, "timingPolicy"), false);
  assert.throws(() => createUptimeRobotHttpWitnessPlanV2({
    ...oldInput, serviceFrom: program.createdAt,
  }), /LIFECYCLE_WINDOW_INVALID/u);
  const nextInput = planInput({ timingPolicy: policy });
  assert.equal(nextInput.serviceFrom, program.createdAt);
  const next = createUptimeRobotHttpWitnessPlanV3(nextInput);
  assert.equal(next.schema, "outsider/uptimerobot-http-witness-plan/v3");
  assert.equal(next.timingPolicy, policy);
  assert.notEqual(next.planHash, old.planHash);
  assert.equal(createUptimeRobotHttpWitnessPlanV3(planInput({ timingPolicy: policy }))
    .planHash, next.planHash, "reconstruction has no current-clock dependency");
  assert.deepEqual(next.createBody, old.createBody,
    "only local timing contract changes, not monitor operation or acceptance");
});

test("the prior run's exact 164233 ms delay is absent only in the new timing plan", async (t) => {
  const legacy = await fixture(t, createUptimeRobotHttpWitnessPlanV2(planInput()));
  const successor = await fixture(t, createUptimeRobotHttpWitnessPlanV3(
    planInput({ timingPolicy: policy })));
  legacy.setNow(dueAt);
  successor.setNow(dueAt);
  const old = await legacy.adapter.observe(observation(legacy.reservation, "old-window"));
  assert.equal(old.reason, "CONTINUOUS_WINDOW_NOT_DUE");
  assert.equal(Date.parse(old.retryAfter) - Date.parse(dueAt), 164_233);
  assert.equal(legacy.calls.length, 1, "waiting makes no provider read");
  const next = await successor.adapter.observe(observation(successor.reservation, "new-window"));
  assert.equal(next.status, "SATISFIED");
  assert.equal(next.windowFrom, publishedAt);
  assert.equal(next.windowTo, dueAt);
  assert.equal(Date.parse(next.windowTo) - Date.parse(next.windowFrom), 600_000);
  assert.equal(next.independentOutcomeTruthEstablished, false,
    "provider-reported uptime still needs existing independent corroboration");
  assert.equal(successor.calls.filter((call) => call.method === "GET").length, 1);
});

test("new timing retains a later actual readiness anchor and the complete requested window", async (t) => {
  const state = await fixture(t, createUptimeRobotHttpWitnessPlanV3(
    planInput({ timingPolicy: policy })));
  const laterReady = "2026-09-05T19:04:00.000Z";
  state.setNow(dueAt);
  const pending = await state.adapter.observe(observation(state.reservation,
    "late-ready-pending", { witnessReadyAt: laterReady }));
  assert.equal(pending.retryAfter, "2026-09-05T19:14:00.000Z");
  assert.equal(state.calls.length, 1);
  state.setNow(pending.retryAfter);
  const complete = await state.adapter.observe(observation(state.reservation,
    "late-ready-complete", { witnessReadyAt: laterReady }));
  assert.equal(complete.windowFrom, laterReady);
  assert.equal(complete.windowTo, pending.retryAfter);
});

test("explicit future serviceFrom and serviceNotBefore both remain binding under successor policy", async (t) => {
  for (const configuration of [
    { timingPolicy: policy, serviceFrom: "2026-09-05T19:10:00.000Z" },
    { timingPolicy: policy, serviceNotBefore: "2026-09-05T19:10:00.000Z",
      serviceFrom: "2026-09-05T19:09:00.000Z" },
  ]) {
    const state = await fixture(t, createUptimeRobotHttpWitnessPlanV3(planInput(configuration)));
    state.setNow(dueAt);
    const pending = await state.adapter.observe(observation(state.reservation, "future-pending"));
    assert.equal(pending.retryAfter, "2026-09-05T19:20:00.000Z");
    assert.equal(state.calls.length, 1);
  }
});

test("cold resume retains successor plan/window and never reserves a second monitor", async (t) => {
  const state = await fixture(t, createUptimeRobotHttpWitnessPlanV3(
    planInput({ timingPolicy: policy })));
  state.setNow("2026-09-05T19:07:00.000Z");
  const pending = await state.adapter.observe(observation(state.reservation, "before-restart"));
  assert.equal(pending.retryAfter, dueAt);
  const resumed = createUptimeRobotFormationWitnessAdapterV2(
    resumeUptimeRobotHttpWitnessDriverV2({ ...state.driverInput,
      adapterState: pending.adapterState }, state.dependencies));
  const reservation = await resumed.reserve({ operationId: "reserve-timing", program });
  assert.equal(reservation.reservationId, state.reservation.reservationId);
  state.setNow(dueAt);
  const complete = await resumed.observe(observation(reservation, "after-restart"));
  assert.equal(complete.status, "SATISFIED");
  assert.equal(complete.windowFrom, publishedAt);
  assert.equal(complete.windowTo, dueAt);
  assert.equal(state.calls.filter((call) => call.method === "POST").length, 1);
});

test("successor requires real readiness and post-publication witness anchors before counting time", async (t) => {
  const state = await fixture(t, createUptimeRobotHttpWitnessPlanV3(
    planInput({ timingPolicy: policy })));
  state.setNow(dueAt);
  const noReadiness = observation(state.reservation, "missing-readiness");
  delete noReadiness.witnessReadyAt;
  assert.equal((await state.adapter.observe(noReadiness)).reason,
    "WITNESS_READINESS_ANCHOR_MISSING");
  const noWitness = observation(state.reservation, "missing-witness", {
    effectResult: { dependencyEvidence: [{ primaryEffectRecordedAt: publishedAt }] },
  });
  assert.equal((await state.adapter.observe(noWitness)).reason,
    "CONTINUOUS_WINDOW_ANCHOR_MISSING");
  assert.equal(state.calls.length, 1);
});

test("timing configuration rejects ambiguous modes and still bounds formation/service/cleanup", () => {
  assert.throws(() => normalizeDigitalWitnessLifecycleConfiguration({
    serviceNotBefore: program.createdAt,
  }), /WITNESS_LIFECYCLE_CONFIGURATION_INVALID/u);
  assert.throws(() => normalizeDigitalWitnessLifecycleConfiguration({
    timingPolicy: "use-the-clock",
  }), /WITNESS_LIFECYCLE_CONFIGURATION_INVALID/u);
  assert.throws(() => normalizeDigitalWitnessLifecycleConfiguration({
    timingPolicy: policy, serviceNotBefore: "2026-02-30T00:00:00.000Z",
  }), /WITNESS_LIFECYCLE_INSTANT_INVALID/u);
  const input = planInput({ timingPolicy: policy });
  assert.throws(() => createUptimeRobotHttpWitnessPlanV3({
    ...input, formationDeadline: input.serviceUntil,
  }), /LIFECYCLE_WINDOW_INVALID/u);
  assert.throws(() => createUptimeRobotHttpWitnessPlanV3({
    ...input, cleanupDeadline: input.formationDeadline,
  }), /LIFECYCLE_WINDOW_INVALID/u);
});
