import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync }
  from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createUptimeRobotFormationWitnessAdapterV2,
  createUptimeRobotHttpWitnessDriverV2,
  createUptimeRobotHttpWitnessPlanV2,
  discoverUptimeRobotPendingCreateStateV2,
  resumeUptimeRobotHttpWitnessDriverV2,
  sealUptimeRobotApiCapabilityV2,
} from "../src/outsider-uptimerobot-http-witness-adapter-v2.js";
import {
  createReadinessGatedLongitudinalWitnessAdapterV1,
  unwrapReadinessGatedLongitudinalWitnessStateV1,
}
  from "../src/outsider-readiness-gated-longitudinal-witness-adapter-v1.js";
import {
  createComposedHttpOutcomeWitnessAdapterV2,
  unwrapComposedHttpOutcomeWitnessStateV2,
} from "../src/outsider-composed-http-outcome-witness-adapter-v2.js";
import { verifyDurableOneUseEndpointEffectLedgerV1 }
  from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";

function hash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function json(value, status = 200) {
  return Response.json(value, { status });
}

test("v2 durably binds explicit redirect following and exact-range metrics",
  async (t) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(),
      "outsider-uptime-v2-")));
    chmodSync(root, 0o700);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const target = "https://github.com/owner/repository/releases/download/"
      + "outsider-recovery-0123456789abcdef0123456789abcdef/"
      + "artifact-0123456789abcdef0123456789abcdef.bin";
    const policy = hash("globalping-policy-set-v2");
    const plan = createUptimeRobotHttpWitnessPlanV2({
      targetUrl: target,
      friendlyName: "outsider-v5-recovery-monitor",
      intervalSeconds: 300,
      timeoutSeconds: 30,
      httpMethod: "GET",
      successHttpResponseCodes: ["2xx"],
      followRedirections: true,
      redirectPolicyHash: policy,
      observationRequirementHash: hash("requirement"),
      formationDeadline: "2026-09-04T12:05:00.000Z",
      serviceFrom: "2026-09-04T12:10:00.000Z",
      serviceUntil: "2026-09-04T12:30:00.000Z",
      cleanupDeadline: "2026-09-04T12:40:00.000Z",
    });
    const calls = [];
    let now = "2026-09-04T12:00:00.000Z";
    const monitor = { id: 803910100, type: "HTTP",
      friendlyName: plan.friendlyName, url: target, status: "STARTED" };
    const requestImpl = async (url, options) => {
      calls.push([url, options]);
      if (options.method === "POST") {
        const body = JSON.parse(Buffer.from(options.body).toString("utf8"));
        assert.equal(body.followRedirections, true);
        return json(monitor, 201);
      }
      if (url.includes("/stats/uptime?")) {
        const query = new URL(url).searchParams;
        return json({ uptime: 100, total_downtime_seconds: 0,
          incident_count: 0, mtbf: null,
          from: query.get("from"), to: query.get("to") });
      }
      return json({ ...monitor, status: "UP" });
    };
    const capability = sealUptimeRobotApiCapabilityV2({
      apiToken: "private-v2-token",
      expiresAt: "2026-09-04T13:00:00.000Z",
    });
    const driver = createUptimeRobotHttpWitnessDriverV2({
      plan, expectedPlanHash: plan.planHash,
      credentialCapability: capability,
      ledgerDirectory: path.join(root, "ledger"),
      ledgerId: "ledger_0123456789abcdef0123456789abcdef",
      adapterInstanceRefHash: hash("adapter"),
      permissionGrantHash: hash("permission"),
      privateProjectionNonce: "private_v2_nonce_0123456789",
    }, { requestImpl, clock: () => now });
    const adapter = createUptimeRobotFormationWitnessAdapterV2(driver);
    assert.equal(adapter.redirectObservation.followRedirections, true);
    assert.equal(adapter.redirectObservation.externalRedirectPolicyHash,
      policy);
    const reservation = await adapter.reserve({
      operationId: "reserve-v2",
      program: { completionDeadline: "2026-09-04T12:30:00.000Z" },
    });
    assert.equal(reservation.status, "RESERVED");
    assert.equal(reservation.adapterState.followRedirections, true);
    const readiness = await adapter.observe({
      operationId: "readiness-v2", reservation,
    });
    assert.equal(readiness.status, "SATISFIED");
    assert.equal(readiness.adapterState.sourceStatus, "UP");
    now = "2026-09-04T12:25:00.000Z";
    const longitudinal = await adapter.observe({
      operationId: "longitudinal-v2",
      reservation: { ...reservation, adapterState: readiness.adapterState },
      witnessReadyAt: "2026-09-04T11:15:00.000Z",
      program: { outcome: { acceptance: [{
        criterionId: "availability", expected: 600_000,
        comparator: "PROVIDER_REPORTED_ZERO_DOWNTIME_FOR_MS",
      }] } },
      node: { kind: "OBSERVATION", acceptance: ["availability"],
        input: { observationWindowMs: 600_000 } },
      effectResult: { dependencyEvidence: [{
        witnessRecordedAt: "2026-09-04T11:10:00.000Z",
      }] },
    });
    assert.equal(longitudinal.status, "SATISFIED");
    assert.equal(longitudinal.windowFrom, "2026-09-04T12:10:00.000Z",
      "range begins at max(readyAt, serviceFrom, post-effect witness)");
    assert.deepEqual(longitudinal.sanitizedExactMetrics, {
      uptime: 100, totalDowntimeSeconds: 0, incidentCount: 0, mtbf: null,
      from: "2026-09-04T12:10:00.000Z",
      to: "2026-09-04T12:20:00.000Z",
    });
    assert.equal(calls.filter(([, options]) => options.method === "POST")
      .length, 1);
  });

test("v2 refuses implicit redirect behavior", () => {
  assert.throws(() => createUptimeRobotHttpWitnessPlanV2({
    targetUrl: "https://example.com/",
    friendlyName: "outsider-explicit-redirect-mode",
    intervalSeconds: 300, timeoutSeconds: 30, httpMethod: "GET",
    successHttpResponseCodes: ["2xx"],
    followRedirections: null,
    redirectPolicyHash: hash("policy"),
    observationRequirementHash: hash("requirement"),
    formationDeadline: "2026-09-04T11:00:00.000Z",
    serviceFrom: "2026-09-04T11:00:00.000Z",
    serviceUntil: "2026-09-04T12:00:00.000Z",
    cleanupDeadline: "2026-09-04T12:10:00.000Z",
  }), /FOLLOW_REDIRECTIONS_INVALID/u);
});

test("an unfollowed 302 route cannot turn create ACK into commit capacity",
  async (t) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(),
      "outsider-uptime-v2-no-redirect-")));
    chmodSync(root, 0o700);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const target = "https://github.com/owner/repository/releases/download/"
      + "outsider-recovery-fedcba9876543210fedcba9876543210/"
      + "artifact-fedcba9876543210fedcba9876543210.bin";
    const policy = hash("globalping-policy-set-v2-no-follow");
    const plan = createUptimeRobotHttpWitnessPlanV2({
      targetUrl: target,
      friendlyName: "outsider-v5-unfollowed-recovery",
      intervalSeconds: 300, timeoutSeconds: 30, httpMethod: "GET",
      successHttpResponseCodes: ["2xx"], followRedirections: false,
      redirectPolicyHash: policy,
      observationRequirementHash: hash("unfollowed-requirement"),
      formationDeadline: "2026-09-04T12:05:00.000Z",
      serviceFrom: "2026-09-04T12:10:00.000Z",
      serviceUntil: "2026-09-04T12:30:00.000Z",
      cleanupDeadline: "2026-09-04T12:40:00.000Z",
    });
    let deletes = 0;
    const requestImpl = async (_url, options) => {
      if (options.method === "POST") return json({ id: 803910101,
        type: "HTTP", friendlyName: plan.friendlyName, url: target,
        status: "STARTED" }, 201);
      if (options.method === "GET") return json({ id: 803910101,
        type: "HTTP", friendlyName: plan.friendlyName, url: target,
        status: "DOWN" });
      if (options.method === "DELETE") {
        deletes += 1;
        return new Response(null, { status: 200 });
      }
      throw new Error("unexpected request");
    };
    const capability = sealUptimeRobotApiCapabilityV2({
      apiToken: "private-v2-unfollowed-token",
      expiresAt: "2026-09-04T13:00:00.000Z",
    });
    const driver = createUptimeRobotHttpWitnessDriverV2({
      plan, expectedPlanHash: plan.planHash,
      credentialCapability: capability,
      ledgerDirectory: path.join(root, "ledger"),
      ledgerId: "ledger_fedcba9876543210fedcba9876543210",
      adapterInstanceRefHash: hash("unfollowed-adapter"),
      permissionGrantHash: hash("unfollowed-permission"),
      privateProjectionNonce: "private_v2_unfollowed_nonce",
    }, { requestImpl, clock: () => "2026-09-04T12:00:00.000Z" });
    const gated = createReadinessGatedLongitudinalWitnessAdapterV1({
      childAdapter: createUptimeRobotFormationWitnessAdapterV2(driver),
      clock: () => "2026-09-04T12:00:00.000Z",
      wait: async () => {}, minimumSafeReadSpacingMs: 15_000,
      maximumReadOccurrences: 1, requireRedirectFollowing: false,
      externalRedirectPolicyHash: policy,
    });
    const result = await gated.reserve({ operationId: "unfollowed-302",
      program: { formationDeadline: plan.formationDeadline,
        completionDeadline: plan.serviceUntil } });
    assert.equal(result.status, "UNAVAILABLE");
    assert.equal(result.sourceStatus, "DOWN");
    assert.equal(result.childReservationReleased, true);
    assert.equal(deletes, 1);
  });

test("lost CREATE response cold-resumes exact reconciliation without second POST",
  async (t) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(),
      "outsider-uptime-v2-create-reconcile-")));
    chmodSync(root, 0o700);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    let nowMs = Date.parse("2026-09-04T12:00:00.000Z");
    const target = "https://example.com/outsider-create-reconcile";
    const policy = hash("create-reconcile-policy");
    const plan = createUptimeRobotHttpWitnessPlanV2({
      targetUrl: target,
      friendlyName: "outsider-v5-create-reconcile",
      intervalSeconds: 300, timeoutSeconds: 30, httpMethod: "GET",
      successHttpResponseCodes: ["2xx"], followRedirections: false,
      redirectPolicyHash: policy,
      observationRequirementHash: hash("create-reconcile-requirement"),
      formationDeadline: "2026-09-04T12:02:00.000Z",
      serviceFrom: "2026-09-04T12:02:00.000Z",
      serviceUntil: "2026-09-04T12:10:00.000Z",
      cleanupDeadline: "2026-09-04T12:15:00.000Z",
    });
    const monitor = { id: 803910102, type: "HTTP",
      friendlyName: plan.friendlyName, url: target, status: "STARTED" };
    const calls = [];
    let listCount = 0;
    const requestImpl = async (url, options) => {
      if (options.method === "POST") {
        calls.push("POST_ACCEPTED_RESPONSE_LOST");
        assert.equal(discoverUptimeRobotPendingCreateStateV2({
          ledgerDirectory,
          ledgerId: driverInput.ledgerId,
          expectedPlanHash: plan.planHash,
          reserveOperationId: context.operationId,
        })?.monitorId, null,
        "pending handle is fsynced before provider contact");
        throw new Error("response lost after provider accepted create");
      }
      if (options.method === "GET" && url.includes("/monitors?")) {
        listCount += 1;
        calls.push(listCount === 1 ? "LIST_EMPTY" : "LIST_UNIQUE");
        return json({ data: listCount === 1 ? [] : [monitor] });
      }
      if (options.method === "GET") {
        calls.push("MONITOR_UP");
        return json({ ...monitor, status: "UP" });
      }
      if (options.method === "DELETE") {
        calls.push("DELETE");
        return new Response(null, { status: 204 });
      }
      throw new Error("unexpected request");
    };
    const capability = sealUptimeRobotApiCapabilityV2({
      apiToken: "private-v2-create-reconcile-token",
      expiresAt: "2026-09-04T13:00:00.000Z",
    });
    const ledgerDirectory = path.join(root, "ledger");
    const driverInput = {
      plan, expectedPlanHash: plan.planHash,
      credentialCapability: capability, ledgerDirectory,
      ledgerId: "ledger_1234567890abcdef1234567890abcdef",
      adapterInstanceRefHash: hash("create-reconcile-adapter"),
      permissionGrantHash: hash("create-reconcile-permission"),
      privateProjectionNonce: "private_create_reconcile_nonce",
    };
    const dependencies = {
      requestImpl, clock: () => new Date(nowMs).toISOString(),
    };
    const driver = createUptimeRobotHttpWitnessDriverV2(
      driverInput, dependencies);
    const firstProcessAdapter = createUptimeRobotFormationWitnessAdapterV2(
      driver);
    const exactSpotObserver = Object.freeze({
      providerRef: "globalping-exact-http-v2-test",
      async observe() { throw new Error("spot observation not expected"); },
    });
    const firstComposition = createComposedHttpOutcomeWitnessAdapterV2({
      adapterId: "create-reconcile-composed-first",
      uptimeAdapter: firstProcessAdapter,
      uptimeProviderRef: "uptimerobot-api-v3-test",
      spotProviderRef: exactSpotObserver.providerRef,
      exactSpotObserver,
    });
    const context = {
      operationId: "create-reconcile-same-operation",
      program: { formationDeadline: plan.formationDeadline,
        completionDeadline: plan.serviceUntil },
    };
    const pending = await firstComposition.reserve(context);
    assert.equal(pending.status, "PENDING");
    assert.equal(unwrapComposedHttpOutcomeWitnessStateV2(
      pending.adapterState).monitorId, null);
    const discoveredPendingState = discoverUptimeRobotPendingCreateStateV2({
      ledgerDirectory,
      ledgerId: driverInput.ledgerId,
      expectedPlanHash: plan.planHash,
      reserveOperationId: context.operationId,
    });
    assert.equal(discoveredPendingState.monitorId, null);
    assert.equal(discoveredPendingState.reserveOperationId,
      context.operationId);
    assert.equal(discoveredPendingState.containsCredential, false);
    const pendingDirectory = `${ledgerDirectory}.pending-create-handles-v2`;
    assert.equal(statSync(pendingDirectory).mode & 0o777, 0o700);
    const pendingFiles = readdirSync(pendingDirectory);
    assert.equal(pendingFiles.length, 1);
    assert.equal(statSync(path.join(pendingDirectory, pendingFiles[0])).mode
      & 0o777, 0o600);
    const resumedDriver = resumeUptimeRobotHttpWitnessDriverV2({
      ...driverInput, adapterState: discoveredPendingState,
    }, dependencies);
    const gated = createReadinessGatedLongitudinalWitnessAdapterV1({
      childAdapter: createUptimeRobotFormationWitnessAdapterV2(resumedDriver),
      clock: () => new Date(nowMs).toISOString(),
      wait: async (milliseconds) => { nowMs += milliseconds; },
      minimumSafeReadSpacingMs: 20_000,
      maximumReadOccurrences: 4, requireRedirectFollowing: false,
      externalRedirectPolicyHash: policy,
    });
    const resumedComposition = createComposedHttpOutcomeWitnessAdapterV2({
      adapterId: "create-reconcile-composed-resumed",
      uptimeAdapter: gated,
      uptimeProviderRef: "uptimerobot-api-v3-test",
      spotProviderRef: exactSpotObserver.providerRef,
      exactSpotObserver,
    });
    const reservation = await resumedComposition.reserve(context);
    assert.equal(reservation.status, "RESERVED");
    const readyState = unwrapComposedHttpOutcomeWitnessStateV2(
      reservation.adapterState);
    assert.equal(readyState.readyAt,
      "2026-09-04T12:00:20.000Z");
    assert.equal(unwrapReadinessGatedLongitudinalWitnessStateV1(
      readyState).monitorId, monitor.id);
    const released = await resumedComposition.release({
      operationId: "release-create-reconciled-monitor",
      reservation,
    });
    assert.equal(released.status, "RELEASED");
    assert.deepEqual(calls, ["POST_ACCEPTED_RESPONSE_LOST", "LIST_EMPTY",
      "LIST_UNIQUE", "MONITOR_UP", "DELETE"]);
    assert.equal(calls.filter((value) =>
      value === "POST_ACCEPTED_RESPONSE_LOST").length, 1);
  });

test("hard exit after successful CREATE response cold-resumes from known handle",
  async (t) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(),
      "outsider-uptime-v2-create-receipt-gap-")));
    chmodSync(root, 0o700);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const target = "https://example.com/outsider-create-receipt-gap";
    const plan = createUptimeRobotHttpWitnessPlanV2({
      targetUrl: target,
      friendlyName: "outsider-v5-create-receipt-gap",
      intervalSeconds: 300, timeoutSeconds: 30, httpMethod: "GET",
      successHttpResponseCodes: ["2xx"], followRedirections: false,
      redirectPolicyHash: hash("create-receipt-gap-policy"),
      observationRequirementHash: hash("create-receipt-gap-requirement"),
      formationDeadline: "2026-09-04T12:02:00.000Z",
      serviceFrom: "2026-09-04T12:02:00.000Z",
      serviceUntil: "2026-09-04T12:10:00.000Z",
      cleanupDeadline: "2026-09-04T12:15:00.000Z",
    });
    const monitor = { id: 803910104, type: "HTTP",
      friendlyName: plan.friendlyName, url: target, status: "STARTED" };
    const ledgerDirectory = path.join(root, "ledger");
    const commonDriverInput = {
      plan, expectedPlanHash: plan.planHash, ledgerDirectory,
      ledgerId: "ledger_456789abcdef0123456789abcdef0123",
      adapterInstanceRefHash: hash("create-receipt-gap-adapter"),
      permissionGrantHash: hash("create-receipt-gap-permission"),
      privateProjectionNonce: "private_create_receipt_gap_nonce",
    };
    const operationId = "create-receipt-gap-same-operation";
    const moduleUrl = new URL(
      "../src/outsider-uptimerobot-http-witness-adapter-v2.js",
      import.meta.url).href;
    const childSource = `
      import {
        createUptimeRobotFormationWitnessAdapterV2,
        createUptimeRobotHttpWitnessDriverV2,
        sealUptimeRobotApiCapabilityV2,
      } from ${JSON.stringify(moduleUrl)};
      const driverInput = ${JSON.stringify(commonDriverInput)};
      const monitor = ${JSON.stringify(monitor)};
      let providerAccepted = false;
      const capability = sealUptimeRobotApiCapabilityV2({
        apiToken: "private-child-create-receipt-gap-token",
        expiresAt: "2026-09-04T13:00:00.000Z",
      });
      const driver = createUptimeRobotHttpWitnessDriverV2({
        ...driverInput, credentialCapability: capability,
      }, {
        requestImpl: async (_url, options) => {
          if (options.method !== "POST") process.exit(93);
          providerAccepted = true;
          return Response.json(monitor, { status: 201 });
        },
        clock: () => {
          if (providerAccepted) process.exit(91);
          return "2026-09-04T12:00:00.000Z";
        },
      });
      const adapter = createUptimeRobotFormationWitnessAdapterV2(driver);
      await adapter.reserve({
        operationId: ${JSON.stringify(operationId)},
        program: { completionDeadline: driverInput.plan.serviceUntil },
      });
      process.exit(92);
    `;
    const child = spawnSync(process.execPath,
      ["--input-type=module", "--eval", childSource], {
        encoding: "utf8",
      });
    assert.equal(child.status, 91, child.stderr,
      "child exits only when receipt append asks for its timestamp");

    // No return value or in-memory adapter state crosses this process
    // boundary. The new process finds only the deterministic disk handle.
    const discovered = discoverUptimeRobotPendingCreateStateV2({
      ledgerDirectory,
      ledgerId: commonDriverInput.ledgerId,
      expectedPlanHash: plan.planHash,
      reserveOperationId: operationId,
    });
    assert.equal(discovered.monitorId, monitor.id);
    assert.equal(discovered.containsCredential, false);
    let secondProcessPosts = 0;
    let listReads = 0;
    let deletes = 0;
    const requestImpl = async (url, options) => {
      if (options.method === "POST") {
        secondProcessPosts += 1;
        throw new Error("cold resume must never issue a second POST");
      }
      if (options.method === "GET" && url.includes("/monitors?")) {
        listReads += 1;
        return json({ data: [monitor] });
      }
      if (options.method === "DELETE") {
        deletes += 1;
        return new Response(null, { status: 204 });
      }
      throw new Error("unexpected request");
    };
    const capability = sealUptimeRobotApiCapabilityV2({
      apiToken: "private-parent-create-receipt-gap-token",
      expiresAt: "2026-09-04T13:00:00.000Z",
    });
    const resumedDriver = resumeUptimeRobotHttpWitnessDriverV2({
      ...commonDriverInput, credentialCapability: capability,
      adapterState: discovered,
    }, { requestImpl, clock: () => "2026-09-04T12:00:00.000Z" });
    const resumedAdapter = createUptimeRobotFormationWitnessAdapterV2(
      resumedDriver);
    const reservation = await resumedAdapter.reserve({ operationId,
      program: { completionDeadline: plan.serviceUntil } });
    assert.equal(reservation.status, "RESERVED");
    assert.equal(reservation.adapterState.monitorId, monitor.id);
    assert.equal(secondProcessPosts, 0);
    assert.equal(listReads, 1);
    const released = await resumedAdapter.release({
      operationId: "release-create-receipt-gap-monitor", reservation,
    });
    assert.equal(released.status, "RELEASED");
    assert.equal(deletes, 1);
    const verification = verifyDurableOneUseEndpointEffectLedgerV1({
      directory: ledgerDirectory,
      ledgerId: commonDriverInput.ledgerId,
      expectedLocalHeadHash: released.adapterState.ledgerHeadHash,
    });
    assert.equal(verification.ok, true);
    assert.equal(verification.head.transitionCounts.SUBMIT_ATTEMPTED, 2,
      "one CREATE plus one DELETE mutation occurred");
    assert.equal(verification.head.transitionCounts.ENDPOINT_RECEIPT_OBSERVED,
      2);
  });

test("DELETE 429 schedules a new durable cleanup effect and cold-resumes",
  async (t) => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(),
      "outsider-uptime-v2-delete-429-")));
    chmodSync(root, 0o700);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    let nowMs = Date.parse("2026-09-04T12:00:00.000Z");
    const target = "https://example.com/outsider-delete-retry";
    const plan = createUptimeRobotHttpWitnessPlanV2({
      targetUrl: target, friendlyName: "outsider-v5-delete-retry",
      intervalSeconds: 300, timeoutSeconds: 30, httpMethod: "GET",
      successHttpResponseCodes: ["2xx"], followRedirections: false,
      redirectPolicyHash: hash("delete-retry-policy"),
      observationRequirementHash: hash("delete-retry-requirement"),
      formationDeadline: "2026-09-04T12:02:00.000Z",
      serviceFrom: "2026-09-04T12:02:00.000Z",
      serviceUntil: "2026-09-04T12:10:00.000Z",
      cleanupDeadline: "2026-09-04T12:15:00.000Z",
    });
    const monitor = { id: 803910103, type: "HTTP",
      friendlyName: plan.friendlyName, url: target, status: "STARTED" };
    let deleteCount = 0;
    const requestImpl = async (_url, options) => {
      if (options.method === "POST") return json(monitor, 201);
      if (options.method === "DELETE") {
        deleteCount += 1;
        return deleteCount === 1
          ? new Response(null, { status: 429,
            headers: { "Retry-After": "60" } })
          : new Response(null, { status: 204 });
      }
      throw new Error("unexpected request");
    };
    const capability = sealUptimeRobotApiCapabilityV2({
      apiToken: "private-v2-delete-retry-token",
      expiresAt: "2026-09-04T13:00:00.000Z",
    });
    const ledgerDirectory = path.join(root, "ledger");
    const ledgerId = "ledger_abcdef1234567890abcdef1234567890";
    const driverInput = {
      plan, expectedPlanHash: plan.planHash,
      credentialCapability: capability, ledgerDirectory, ledgerId,
      adapterInstanceRefHash: hash("delete-retry-adapter"),
      permissionGrantHash: hash("delete-retry-permission"),
      privateProjectionNonce: "private_delete_retry_nonce",
    };
    const dependencies = {
      requestImpl, clock: () => new Date(nowMs).toISOString(),
    };
    const driver = createUptimeRobotHttpWitnessDriverV2(
      driverInput, dependencies);
    const adapter = createUptimeRobotFormationWitnessAdapterV2(driver);
    const reservation = await adapter.reserve({
      operationId: "reserve-delete-retry",
      program: { completionDeadline: plan.serviceUntil },
    });
    assert.equal(reservation.status, "RESERVED");
    const firstRelease = await adapter.release({
      operationId: "same-release-operation", reservation,
    });
    assert.equal(firstRelease.status, "PENDING");
    assert.equal(firstRelease.reason,
      "DELETE_RATE_LIMITED_NEW_EFFECT_SCHEDULED");
    assert.equal(firstRelease.retryAfter, "2026-09-04T12:01:00.000Z");
    assert.equal(firstRelease.adapterState.deleteRateLimitRetryGeneration, 1);
    const earlyRelease = await adapter.release({
      operationId: "same-release-operation", reservation: {
        ...reservation, adapterState: firstRelease.adapterState,
      },
    });
    assert.equal(earlyRelease.status, "PENDING");
    assert.equal(deleteCount, 1, "not-before never emits an early DELETE");

    const resumedDriver = resumeUptimeRobotHttpWitnessDriverV2({
      ...driverInput, adapterState: firstRelease.adapterState,
    }, dependencies);
    const resumedAdapter = createUptimeRobotFormationWitnessAdapterV2(
      resumedDriver);
    nowMs += 60_000;
    const finalRelease = await resumedAdapter.release({
      operationId: "same-release-operation", reservation: {
        ...reservation, adapterState: firstRelease.adapterState,
      },
    });
    assert.equal(finalRelease.status, "RELEASED");
    assert.equal(finalRelease.adapterState.released, true);
    assert.equal(finalRelease.adapterState.deleteRateLimitRetryGeneration, 1);
    assert.equal(finalRelease.adapterState.deleteRetryNotBefore, null);

    const finalDriver = resumeUptimeRobotHttpWitnessDriverV2({
      ...driverInput, adapterState: finalRelease.adapterState,
    }, dependencies);
    const finalAdapter = createUptimeRobotFormationWitnessAdapterV2(
      finalDriver);
    const replayedRelease = await finalAdapter.release({
      operationId: "same-release-operation", reservation: finalRelease,
    });
    assert.equal(replayedRelease.status, "RELEASED");
    assert.equal(deleteCount, 2, "cold replay cannot emit a third DELETE");
    const verification = verifyDurableOneUseEndpointEffectLedgerV1({
      directory: ledgerDirectory, ledgerId,
      expectedLocalHeadHash: finalRelease.adapterState.ledgerHeadHash,
    });
    assert.equal(verification.ok, true);
    assert.equal(verification.head.effectCount, 3);
    assert.equal(verification.head.transitionCounts.SUBMIT_ATTEMPTED, 3);
    assert.equal(verification.head.transitionCounts.ENDPOINT_RECEIPT_OBSERVED,
      2);
    assert.equal(verification.head.transitionCounts.AMBIGUOUS_NO_RETRY_HOLD,
      1);
  });
