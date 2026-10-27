import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SOURCE_PINS,
  createUptimeRobotFormationWitnessAdapterV1,
  createUptimeRobotHttpWitnessDriverV1,
  createUptimeRobotHttpWitnessPlanV1,
  createUptimeRobotProspectiveWitnessAdapterV1,
  resumeUptimeRobotHttpWitnessDriverV1,
  sealUptimeRobotApiCapabilityV1,
} from "../src/outsider-uptimerobot-http-witness-adapter-v1.js";
import {
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";

const LEDGER_ID = "ledger_abcdefabcdefabcdefabcdefabcdefab";
const TOKEN = "private-uptimerobot-api-token";

function h(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function clock() {
  let offset = 0;
  return () => new Date(Date.parse("2026-09-03T10:00:00.000Z")
    + offset++ * 1_000).toISOString();
}

function privateRoot(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-uptimerobot-")));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function plan(overrides = {}) {
  return createUptimeRobotHttpWitnessPlanV1({
    targetUrl: "https://example.com/healthz",
    friendlyName: "outsider-order-0123456789abcdef",
    intervalSeconds: 300,
    timeoutSeconds: 30,
    httpMethod: "GET",
    successHttpResponseCodes: ["2xx"],
    observationRequirementHash: h("observation-requirement"),
    formationDeadline: "2026-09-03T11:00:00.000Z",
    serviceFrom: "2026-09-03T11:30:00.000Z",
    serviceUntil: "2026-09-03T12:30:00.000Z",
    cleanupDeadline: "2026-09-03T13:00:00.000Z",
    ...overrides,
  });
}

function monitor(status = "STARTED") {
  return {
    id: 797054213,
    type: "HTTP",
    friendlyName: "outsider-order-0123456789abcdef",
    url: "https://example.com/healthz",
    status,
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}

function driver(t, requestImpl, planValue = plan(), clockImpl = clock()) {
  const root = privateRoot(t);
  const capability = sealUptimeRobotApiCapabilityV1({
    apiToken: TOKEN,
    expiresAt: "2026-09-03T14:00:00.000Z",
  });
  const created = createUptimeRobotHttpWitnessDriverV1({
    plan: planValue,
    expectedPlanHash: planValue.planHash,
    credentialCapability: capability,
    ledgerDirectory: path.join(root, "effect-ledger"),
    ledgerId: LEDGER_ID,
    adapterInstanceRefHash: h("adapter-instance"),
    permissionGrantHash: h("user-held-account-permission"),
    privateProjectionNonce: "private_projection_nonce_0123456789",
  }, { requestImpl, clock: clockImpl });
  return { driver: created, root, plan: planValue, capability };
}

function resumedDriver(run, requestImpl, adapterState,
  clockImpl = clock()) {
  return resumeUptimeRobotHttpWitnessDriverV1({
    plan: run.plan,
    expectedPlanHash: run.plan.planHash,
    credentialCapability: run.capability,
    ledgerDirectory: path.join(run.root, "effect-ledger"),
    ledgerId: LEDGER_ID,
    adapterInstanceRefHash: h("adapter-instance"),
    permissionGrantHash: h("user-held-account-permission"),
    privateProjectionNonce: "private_projection_nonce_0123456789",
    adapterState,
  }, { requestImpl, clock: clockImpl });
}

test("formation adapter reserves, observes, releases, and closes one real witness lifecycle shape",
  async (t) => {
    const calls = [];
    const run = driver(t, async (url, options) => {
      calls.push({ url, options });
      assert.equal(options.credentials, "omit");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
      if (url.endsWith("/v3/monitors?limit=1")) return json({ data: [], nextLink: null });
      if (options.method === "POST") {
        assert.equal(url, "https://api.uptimerobot.com/v3/monitors");
        const body = JSON.parse(Buffer.from(options.body).toString("utf8"));
        assert.deepEqual(body, run.plan.createBody);
        assert.equal(body.config.applicationErrorRetries, 0);
        assert.equal(body.followRedirections, false);
        return json(monitor(), 201);
      }
      if (options.method === "GET") return json(monitor("UP"));
      if (options.method === "DELETE") return new Response(null, { status: 200 });
      throw new Error("unexpected request");
    });

    const direct = createUptimeRobotProspectiveWitnessAdapterV1(run.driver);
    const preflight = await direct.preflight();
    assert.equal(preflight.publicProjection.stage, "PREFLIGHT_READ_REACHABLE");
    assert.equal(preflight.publicProjection.preflightSourceDeclaredWritable,
      "NOT_PROVEN_BY_READ");

    const adapter = createUptimeRobotFormationWitnessAdapterV1(run.driver);
    assert.match(adapter.adapterId, /^uptimerobot-http-witness-v1:/u);
    const reservation = await adapter.reserve({
      program: { completionDeadline: "2026-09-03T12:00:00.000Z" },
      requirement: {}, binding: {}, operationId: "reserve-operation-1",
    });
    assert.equal(reservation.status, "RESERVED");
    assert.equal(reservation.validUntil, run.plan.cleanupDeadline);
    assert.match(reservation.reservationId, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(reservation.adapterState.monitorId, 797054213);
    assert.equal(reservation.adapterState.containsCredential, false);
    assert.equal(reservation.providerReceipt.independentOutcomeTruthEstablished,
      false);

    const resumed = createUptimeRobotFormationWitnessAdapterV1(
      resumedDriver(run, async (url, options) => {
        calls.push({ url, options });
        assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
        if (options.method === "GET") return json(monitor("UP"));
        if (options.method === "DELETE") return new Response(null,
          { status: 200 });
        throw new Error("unexpected resumed request");
      }, reservation.adapterState));
    const observed = await resumed.observe({
      program: {}, node: {}, effectiveRoute: {}, effectResult: {},
      acceptance: {}, requirement: {}, binding: {}, reservation,
      operationId: "observe-operation-1",
    });
    assert.equal(observed.status, "SATISFIED");
    assert.equal(observed.independentOutcomeTruthEstablished, false);
    const observedAgain = await resumed.observe({
      reservation, operationId: "observe-operation-1",
    });
    assert.strictEqual(observedAgain, observed);

    const released = await resumed.release({
      program: {}, requirement: {}, binding: {}, reservation,
      operationId: "release-operation-1",
    });
    assert.equal(released.status, "RELEASED");
    const closed = await resumed.closeObligation({
      reservation, operationId: "close-operation-1",
    });
    assert.equal(closed.status, "CLOSED");

    assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
    assert.equal(calls.filter((call) => call.options.method === "DELETE").length, 1);
    assert.equal(calls.filter((call) => call.options.method === "GET").length, 2);
    const publicJson = JSON.stringify({
      capability: run.capability, reservation, observed, released, closed,
    });
    assert.equal(publicJson.includes(TOKEN), false);
    assert.equal(publicJson.includes("example.com"), false);

    const ledger = verifyDurableOneUseEndpointEffectLedgerV1({
      directory: path.join(run.root, "effect-ledger"),
      ledgerId: LEDGER_ID,
      expectedLocalHeadHash: null,
    });
    assert.equal(ledger.ok, true);
    assert.equal(ledger.head.transitionCounts.INTENT_ADMITTED, 2);
    assert.equal(ledger.head.transitionCounts.SUBMIT_RESERVED, 2);
    assert.equal(ledger.head.transitionCounts.SUBMIT_ATTEMPTED, 2);
    assert.equal(ledger.head.transitionCounts.ENDPOINT_RECEIPT_OBSERVED, 2);
  });

test("ambiguous create is never reposted and the same operation id reconciles an exact monitor",
  async (t) => {
    let posts = 0;
    let lists = 0;
    const run = driver(t, async (url, options) => {
      if (options.method === "POST") {
        posts += 1;
        throw new Error("connection ended after send");
      }
      if (options.method === "GET" && url.includes("?limit=200")) {
        lists += 1;
        return json({ data: [monitor("STARTED")], nextLink: null });
      }
      throw new Error("unexpected request");
    });
    const adapter = createUptimeRobotFormationWitnessAdapterV1(run.driver);
    const first = await adapter.reserve({
      program: { completionDeadline: "2026-09-03T12:00:00.000Z" },
      operationId: "stable-reserve-operation",
    });
    assert.equal(first.status, "PENDING");
    const reconciled = await adapter.reserve({
      program: { completionDeadline: "2026-09-03T12:00:00.000Z" },
      operationId: "stable-reserve-operation",
    });
    assert.equal(reconciled.status, "RESERVED");
    assert.equal(posts, 1);
    assert.equal(lists, 1);
    const mismatched = await adapter.reserve({
      operationId: "different-reserve-operation",
    });
    assert.equal(mismatched.status, "UNAVAILABLE");
    assert.equal(mismatched.reason, "OPERATION_ID_MISMATCH");
    assert.equal(posts, 1);
  });

test("ambiguous delete is never repeated and exact-id absence closes release",
  async (t) => {
    let deletes = 0;
    let deleteReconciliations = 0;
    const clockImpl = clock();
    const requestImpl = async (url, options) => {
      if (options.method === "POST") return json(monitor(), 201);
      if (options.method === "DELETE") {
        deletes += 1;
        throw new Error("response lost");
      }
      if (options.method === "GET" && url.endsWith("/797054213")) {
        deleteReconciliations += 1;
        return json({ message: "not found" }, 404);
      }
      throw new Error("unexpected request");
    };
    const run = driver(t, requestImpl, plan(), clockImpl);
    const adapter = createUptimeRobotFormationWitnessAdapterV1(run.driver);
    const reservation = await adapter.reserve({
      operationId: "reserve-for-delete",
    });
    assert.equal(reservation.status, "RESERVED");
    const first = await adapter.release({
      reservation, operationId: "stable-delete-operation",
    });
    assert.equal(first.status, "PENDING");
    const restarted = createUptimeRobotFormationWitnessAdapterV1(
      resumedDriver(run, requestImpl, reservation.adapterState, clockImpl));
    const reconciled = await restarted.release({
      reservation, operationId: "stable-delete-operation",
    });
    assert.equal(reconciled.status, "RELEASED");
    assert.equal(deletes, 1);
    assert.equal(deleteReconciliations, 1);
    const replayed = await restarted.release({
      reservation, operationId: "stable-delete-operation",
    });
    assert.strictEqual(replayed, reconciled);
    assert.equal(deletes, 1);
  });

test("cold restart replays a completed delete descendant from a stale reservation handle without a second delete",
  async (t) => {
    let posts = 0;
    let deletes = 0;
    const requestImpl = async (_url, options) => {
      if (options.method === "POST") {
        posts += 1;
        return json(monitor(), 201);
      }
      if (options.method === "DELETE") {
        deletes += 1;
        return new Response(null, { status: 204 });
      }
      throw new Error("cold closure replay must not perform another request");
    };
    const run = driver(t, requestImpl);
    const adapter = createUptimeRobotFormationWitnessAdapterV1(run.driver);
    const reservation = await adapter.reserve({
      operationId: "reserve-before-parent-crash",
    });
    assert.equal(reservation.status, "RESERVED");
    const staleHead = reservation.adapterState.ledgerHeadHash;

    const deleted = await adapter.release({
      reservation,
      operationId: "delete-before-parent-crash",
    });
    assert.equal(deleted.status, "RELEASED");
    assert.notEqual(deleted.adapterState.ledgerHeadHash, staleHead);
    assert.equal(deletes, 1);

    // Simulate the parent crashing before it can persist deleted.adapterState:
    // only the original RESERVATION_CONFIRMED handle survives.
    const restarted = createUptimeRobotFormationWitnessAdapterV1(
      resumedDriver(run, requestImpl, reservation.adapterState));
    const closed = await restarted.closeObligation({
      reservation,
      operationId: "delete-before-parent-crash",
    });
    assert.equal(closed.status, "CLOSED");
    assert.equal(closed.adapterState.released, true);
    assert.equal(deletes, 1, "validated descendant history forbids re-delete");
    assert.equal(posts, 1);

    const ledger = verifyDurableOneUseEndpointEffectLedgerV1({
      directory: path.join(run.root, "effect-ledger"),
      ledgerId: LEDGER_ID,
      expectedLocalHeadHash: closed.adapterState.ledgerHeadHash,
    });
    assert.equal(ledger.ok, true);
    assert.equal(ledger.head.entryCount, 8);
    assert.equal(ledger.head.transitionCounts.ENDPOINT_RECEIPT_OBSERVED, 2);
  });

test("plan rejects a query-bearing target and a witness window too short for completion",
  async (t) => {
    assert.throws(() => plan({ targetUrl:
      "https://example.com/healthz?secret=no" }),
    /CANONICAL_PUBLIC_HTTPS_TARGET_REQUIRED/u);
    const run = driver(t, async () => { throw new Error("must not contact"); });
    const adapter = createUptimeRobotFormationWitnessAdapterV1(run.driver);
    const unavailable = await adapter.reserve({
      program: { completionDeadline: "2026-09-03T13:15:00.000Z" },
      operationId: "window-check",
    });
    assert.equal(unavailable.status, "UNAVAILABLE");
    assert.equal(unavailable.reason,
      "WITNESS_WINDOW_ENDS_BEFORE_COMPLETION_DEADLINE");
  });

test("continuous-window observations use exact due UptimeRobot stats and replay safely",
  async (t) => {
    let current = "2026-09-03T10:00:00.000Z";
    let statsMode = "SATISFIED";
    let statsGets = 0;
    const requestImpl = async (url, options) => {
      if (options.method === "POST") return json(monitor(), 201);
      if (options.method === "GET" && url.includes("/stats/uptime?")) {
        statsGets += 1;
        const parsed = new URL(url);
        const requestedFrom = parsed.searchParams.get("from");
        const requestedTo = parsed.searchParams.get("to");
        return json({
          uptime: statsMode === "OUTAGE" ? 99.5 : 100,
          total_downtime_seconds: statsMode === "OUTAGE" ? 30 : 0,
          incident_count: statsMode === "OUTAGE" ? 1 : 0,
          mtbf: null,
          from: statsMode === "RANGE_MISMATCH"
            ? "2026-09-03T11:31:00.000Z" : requestedFrom,
          to: requestedTo,
        });
      }
      throw new Error(`unexpected request: ${options.method} ${url}`);
    };
    const clockImpl = () => current;
    const run = driver(t, requestImpl, plan(), clockImpl);
    const adapter = createUptimeRobotFormationWitnessAdapterV1(run.driver);
    const reservation = await adapter.reserve({
      operationId: "reserve-for-continuous-window",
    });
    assert.equal(reservation.status, "RESERVED");

    const observationContext = {
      program: {
        outcome: {
          acceptance: [{
            criterionId: "continuous_availability",
            comparator: "PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS",
            expected: 600_000,
          }],
        },
      },
      node: {
        nodeId: "sustain_and_observe",
        kind: "OBSERVATION",
        input: { observationWindowMs: 600_000 },
        acceptance: ["continuous_availability"],
      },
      effectResult: {
        dependencyEvidence: [{
          nodeId: "publish_result",
          primaryEffectRecordedAt: "2026-09-03T11:29:00.000Z",
          recoveryEffectRecordedAt: null,
          witnessRecordedAt: "2026-09-03T11:30:00.000Z",
        }],
      },
      reservation,
    };

    current = "2026-09-03T11:39:59.000Z";
    const early = await adapter.observe({
      ...observationContext, operationId: "continuous-read-1",
    });
    assert.equal(early.status, "INCONCLUSIVE");
    assert.equal(early.reason, "CONTINUOUS_WINDOW_NOT_DUE");
    assert.equal(early.retryAfter, "2026-09-03T11:40:00.000Z");
    assert.equal(early.longitudinalWindowProven, false);
    assert.equal(statsGets, 0, "a future range must not contact stats");

    current = "2026-09-03T11:40:00.000Z";
    const satisfied = await adapter.observe({
      ...observationContext, operationId: "continuous-read-2",
    });
    assert.equal(satisfied.status, "SATISFIED");
    assert.equal(satisfied.longitudinalWindowProven, true);
    assert.equal(satisfied.windowFrom, "2026-09-03T11:30:00.000Z");
    assert.equal(satisfied.windowTo, "2026-09-03T11:40:00.000Z");
    assert.match(satisfied.providerReceipt.receiptHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.equal(satisfied.providerReceipt.exactRangeEchoed, true);
    assert.equal(satisfied.providerReceipt.metrics.uptime, 100);
    assert.equal(satisfied.providerReceipt.metrics.totalDowntimeSeconds, 0);
    assert.equal(satisfied.providerReceipt.metrics.incidentCount, 0);
    const cached = await adapter.observe({
      ...observationContext, operationId: "continuous-read-2",
    });
    assert.strictEqual(cached, satisfied);
    assert.equal(statsGets, 1);

    const restarted = createUptimeRobotFormationWitnessAdapterV1(
      resumedDriver(run, requestImpl, satisfied.adapterState, clockImpl));
    const replayed = await restarted.observe({
      ...observationContext,
      reservation: { ...reservation, adapterState: satisfied.adapterState },
      operationId: "continuous-read-2",
    });
    assert.equal(replayed.status, "SATISFIED");
    assert.equal(replayed.longitudinalWindowProven, true);
    assert.equal(statsGets, 2,
      "a restart may safely repeat the same read-only stats operation");

    const strictContext = structuredClone(observationContext);
    strictContext.program.outcome.acceptance[0].comparator
      = "CONTINUOUS_FOR_MS";
    const strict = await restarted.observe({
      ...strictContext,
      reservation: { ...reservation, adapterState: satisfied.adapterState },
      operationId: "continuous-read-strict",
    });
    assert.equal(strict.status, "SATISFIED");
    assert.equal(strict.longitudinalWindowProven, true,
      "the generic continuous comparator remains stats-proof gated");

    statsMode = "OUTAGE";
    const outage = await restarted.observe({
      ...observationContext,
      reservation: { ...reservation, adapterState: satisfied.adapterState },
      operationId: "continuous-read-3",
    });
    assert.equal(outage.status, "NOT_SATISFIED");
    assert.equal(outage.reason, "LONGITUDINAL_WINDOW_REPORTED_FAILURE");
    assert.equal(outage.longitudinalWindowProven, false);

    statsMode = "RANGE_MISMATCH";
    const mismatched = await restarted.observe({
      ...observationContext,
      reservation: { ...reservation, adapterState: satisfied.adapterState },
      operationId: "continuous-read-4",
    });
    assert.equal(mismatched.status, "INCONCLUSIVE");
    assert.equal(mismatched.reason, "LONGITUDINAL_RANGE_NOT_EXACT");
    assert.equal(mismatched.longitudinalWindowProven, false);
    assert.equal(OUTSIDER_UPTIMEROBOT_HTTP_WITNESS_ADAPTER_V1_SOURCE_PINS
      .getMonitorUptimeStatsOperation,
    "GET /monitors/{id}/stats/uptime?from={ISO8601}&to={ISO8601}");
    assert.equal(JSON.stringify({ reservation, satisfied, outage, mismatched })
      .includes(TOKEN), false);
  });
