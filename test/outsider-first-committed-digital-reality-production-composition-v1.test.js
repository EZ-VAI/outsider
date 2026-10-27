import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createFirstCommittedDigitalRealityProductionCompositionV1 }
  from "../src/outsider-first-committed-digital-reality-production-composition-v1.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import { createDurableOutcomeProgramOrchestratorV1 }
  from "../src/outsider-durable-outcome-program-orchestrator-v1.js";

const ARTIFACT_BYTES = Buffer.from("outsider-real-production-composition-v1\n");
const ARTIFACT_HASH = `sha256:${createHash("sha256")
  .update(ARTIFACT_BYTES).digest("hex")}`;
const UPTIME_TOKEN = "uptimerobot-private-token-never-projected";
const CLOUDFLARE_TOKEN = "cloudflare-private-token-never-projected";
const GITHUB_TOKEN = "github-private-token-never-projected";
const PRIMARY_URL = "https://primary-route.example.test/";
const RECOVERY_URL
  = "https://raw.githubusercontent.com/owner/repository/recovery/artifact";

function hash(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function program() {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: "first_production_composition_test",
    orderId: "order_first_production_composition_test",
    createdAt: "2026-09-03T12:00:00.000Z",
    formationDeadline: "2026-09-03T12:10:00.000Z",
    completionDeadline: "2026-09-03T12:30:00.000Z",
    cleanupDeadline: "2026-09-03T12:40:00.000Z",
    artifactHash: ARTIFACT_HASH,
    observationWindowMs: 600_000,
  });
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function providerStubs() {
  const monitors = new Map();
  const uptimeCalls = [];
  const globalpingCalls = [];
  let measurement = 0;
  return {
    uptimeCalls,
    globalpingCalls,
    async uptimeRequest(url, options) {
      const method = options.method;
      uptimeCalls.push([method, url]);
      if (method === "POST") {
        const body = JSON.parse(Buffer.from(options.body).toString("utf8"));
        const id = body.url === PRIMARY_URL ? 11001 : 11002;
        monitors.set(id, {
          id,
          type: "HTTP",
          friendlyName: body.friendlyName,
          url: body.url,
          status: "STARTED",
        });
        return json(monitors.get(id), 201);
      }
      if (method === "GET") {
        if (url.includes("/stats/uptime?")) {
          const parsed = new URL(url);
          return json({
            uptime: 100,
            total_downtime_seconds: 0,
            incident_count: 0,
            mtbf: null,
            from: parsed.searchParams.get("from"),
            to: parsed.searchParams.get("to"),
          });
        }
        const id = Number(url.split("/").at(-1));
        return json({ ...monitors.get(id), status: "UP" });
      }
      if (method === "DELETE") return new Response(null, { status: 200 });
      throw new Error(`unexpected UptimeRobot call: ${method} ${url}`);
    },
    async globalpingFetch(url, options) {
      globalpingCalls.push([options.method, url]);
      if (options.method === "POST") {
        measurement += 1;
        const id = `measure_${measurement}`;
        const body = JSON.parse(options.body);
        assert.equal(body.target, "raw.githubusercontent.com");
        return json({ id, probesCount: 1 }, 202, {
          location: `/v1/measurements/${id}`,
        });
      }
      const id = url.split("/").at(-1);
      return json({
        id,
        type: "http",
        target: "raw.githubusercontent.com",
        status: "finished",
        probesCount: 1,
        results: [{
          probe: { country: "US", asn: 64500, network: "injected" },
          result: {
            status: "finished",
            statusCode: 200,
            rawBody: ARTIFACT_BYTES.toString("utf8"),
            truncated: false,
            tls: { authorized: true },
          },
        }],
      });
    },
  };
}

function composition(directory, stubs,
  clock = () => "2026-09-03T12:01:00.000Z", overrides = {}) {
  const neverContactEffectProviders = async () => {
    throw new Error("effect provider must not be contacted by this test");
  };
  return createFirstCommittedDigitalRealityProductionCompositionV1({
    directory,
    cloudflare: {
      apiToken: CLOUDFLARE_TOKEN,
      accountId: "a".repeat(32),
      workersDevSubdomain: "outsider-test",
      artifactBytes: ARTIFACT_BYTES,
      fetchImpl: neverContactEffectProviders,
    },
    github: {
      apiToken: GITHUB_TOKEN,
      owner: "owner",
      repository: "repository",
      artifactBytes: ARTIFACT_BYTES,
      fetchImpl: neverContactEffectProviders,
    },
    uptimeRobot: {
      apiToken: UPTIME_TOKEN,
      expiresAt: "2026-09-03T13:00:00.000Z",
      permissionGrantHash: hash("uptimerobot-user-account-permission"),
      requestImpl: stubs.uptimeRequest,
      clock,
    },
    globalping: {
      fetchImpl: stubs.globalpingFetch,
      wait: async () => {},
      clock: () => "2026-09-03T12:20:00.000Z",
      pollIntervalMs: 0,
      maximumPolls: 2,
    },
    ...overrides,
  });
}

test("production composition reserves Uptime+Globalping capacity per route and resumes the effective route without projecting credentials",
  async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(),
      "outsider-first-production-composition-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const stubs = providerStubs();
    let current = "2026-09-03T12:01:00.000Z";
    const clock = () => current;
    const compiled = program();
    const formed = composition(directory, stubs, clock);
    assert.deepEqual(Object.keys(formed.adapters).sort(), [
      "cloudflare-worker-production-v1",
      "first-committed-reality-route-witness-v1",
      "github-contents-production-recovery-v1",
    ]);
    assert.equal(stubs.uptimeCalls.length, 0,
      "composition construction must not contact a provider");

    const witness = formed.adapters[
      "first-committed-reality-route-witness-v1"];
    const requirement = compiled.requirements.find((item) =>
      item.requirementId === "independent_http_witness");
    const reservation = await witness.reserve({
      program: compiled,
      requirement,
      binding: { adapterId: witness.adapterId },
      dependencyReservations: {
        primary_publication: {
          status: "RESERVED",
          reservationId: "primary-reservation",
          validUntil: "2026-09-03T12:40:00.000Z",
          adapterState: { publicUrl: PRIMARY_URL },
        },
        recovery_publication: {
          status: "RESERVED",
          reservationId: "recovery-reservation",
          validUntil: "2026-09-03T12:40:00.000Z",
          adapterState: { routeUrl: RECOVERY_URL },
        },
      },
      operationId: "reserve-both-production-witness-routes",
    });
    assert.equal(reservation.status, "RESERVED");
    assert.equal(stubs.uptimeCalls.filter(([method]) => method === "POST")
      .length, 2);
    assert.deepEqual(reservation.adapterState.routes.map((route) =>
      [route.routeRole, route.routeRef]), [
      ["PRIMARY", PRIMARY_URL],
      ["RECOVERY", RECOVERY_URL],
    ]);

    const routeParent = path.join(directory, "witness-routes");
    const programDirectory = path.join(routeParent,
      readdirSync(routeParent)[0]);
    const routeDirectories = readdirSync(programDirectory).sort();
    assert.equal(routeDirectories.length, 2);
    for (const entry of routeDirectories) {
      assert.equal(statSync(path.join(programDirectory, entry)).mode & 0o777,
        0o700);
    }

    // Rebuild every closure as a restarted process would. The child receives
    // the persisted composite handle and resumes the same Uptime ledger.
    const restarted = composition(directory, stubs, clock);
    const replayWitness = restarted.adapters[
      "first-committed-reality-route-witness-v1"];
    const observation = await replayWitness.observe({
      program: compiled,
      requirement,
      node: compiled.nodes[0],
      acceptance: compiled.nodes[0].acceptance,
      binding: { adapterId: replayWitness.adapterId },
      reservation,
      effectResult: {
        status: "SUCCEEDED",
        routeUrl: RECOVERY_URL,
        artifactHash: ARTIFACT_HASH,
      },
      operationId: "observe-effective-recovery-production-route",
    });
    assert.equal(observation.status, "SATISFIED");
    assert.equal(observation.selectedRouteRole, "RECOVERY");
    assert.equal(observation.selectedRouteRef, RECOVERY_URL);
    assert.equal(stubs.uptimeCalls.filter(([method]) => method === "GET")
      .length, 0,
    "exact-only publication acceptance must not wait for monitor readiness");
    assert.deepEqual(stubs.globalpingCalls.map(([method]) => method),
      ["POST", "GET"]);
    assert.equal(readdirSync(programDirectory).length, 2,
      "restart must address the same stable per-route directories");

    current = "2026-09-03T12:20:00.000Z";
    const sustained = await replayWitness.observe({
      program: compiled,
      requirement,
      node: compiled.nodes[1],
      acceptance: compiled.nodes[1].acceptance,
      binding: { adapterId: replayWitness.adapterId },
      reservation,
      effectResult: {
        status: "SUCCEEDED",
        source: "SATISFIED_DEPENDENCIES",
        dependencyEvidence: [{
          nodeId: "publish_result",
          witness: observation,
          witnessRecordedAt: "2026-09-03T12:01:00.000Z",
          primary: { status: "FAILED", routeUrl: PRIMARY_URL },
          primaryEffectRecordedAt: "2026-09-03T12:00:15.000Z",
          recovery: { status: "SUCCEEDED", routeUrl: RECOVERY_URL },
          recoveryEffectRecordedAt: "2026-09-03T12:00:30.000Z",
        }],
      },
      operationId: "observe-provider-reported-zero-downtime-window",
    });
    assert.equal(sustained.status, "SATISFIED");
    assert.equal(sustained.longitudinalWindowProven, true);
    assert.equal(sustained.providerReportedZeroDowntimeSatisfied, true);
    assert.equal(sustained.selectedRouteRole, "RECOVERY");
    const statsCalls = stubs.uptimeCalls.filter(([method, url]) =>
      method === "GET" && url.includes("/stats/uptime?"));
    assert.equal(statsCalls.length, 1);
    const statsUrl = new URL(statsCalls[0][1]);
    assert.equal(statsUrl.searchParams.get("from"),
      "2026-09-03T12:10:00.000Z");
    assert.equal(statsUrl.searchParams.get("to"),
      "2026-09-03T12:20:00.000Z");
    const checkpoint = await replayWitness.observe({
      program: compiled,
      requirement,
      node: compiled.nodes[2],
      acceptance: compiled.nodes[2].acceptance,
      binding: { adapterId: replayWitness.adapterId },
      reservation,
      effectResult: {
        status: "SUCCEEDED",
        source: "SATISFIED_DEPENDENCIES",
        dependencyEvidence: [{
          nodeId: "sustain_and_observe",
          witness: sustained,
          witnessRecordedAt: "2026-09-03T12:20:00.000Z",
          primary: null,
          primaryEffectRecordedAt: null,
          recovery: null,
          recoveryEffectRecordedAt: null,
        }],
      },
      operationId: "observe-close-episode-checkpoint",
    });
    assert.equal(checkpoint.status, "SATISFIED");
    assert.equal(checkpoint.selectedRouteRole, "RECOVERY");
    assert.equal(checkpoint.longitudinalWindowProven, true,
      "checkpoint carries the already-proven window without opening a new one");
    assert.equal(checkpoint.acceptanceEvidenceReused, true);
    assert.equal(stubs.uptimeCalls.filter(([method, url]) =>
      method === "GET" && url.includes("/stats/uptime?")).length, 1,
    "the checkpoint must not open a second longitudinal range");
    assert.deepEqual(stubs.globalpingCalls.map(([method]) => method),
      ["POST", "GET", "POST", "GET"],
    "checkpoint must reuse dependency evidence instead of re-observing");

    const publicMaterial = JSON.stringify({ formed, reservation, observation,
      sustained, checkpoint });
    for (const secret of [UPTIME_TOKEN, CLOUDFLARE_TOKEN, GITHUB_TOKEN]) {
      assert.equal(publicMaterial.includes(secret), false);
    }
  });

test("the production witness composition carries the durable DAG through stats, exact horizon observation, checkpoint, and closure",
  async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(),
      "outsider-first-production-dag-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const stubs = providerStubs();
    let current = "2026-09-03T12:01:00.000Z";
    const clock = () => current;
    const calls = [];

    function effectAdapter(role, adapterId, providerRef, routeUrl) {
      return {
        adapterId,
        providerRef,
        supports(requirement) {
          return requirement?.role === role
            && requirement?.capability
              === "PUBLIC_HTTPS_ARTIFACT_PUBLICATION";
        },
        async reserve({ operationId }) {
          calls.push(["reserve", role, operationId]);
          return {
            status: "RESERVED",
            reservationId: `${adapterId}:reservation`,
            validUntil: "2026-09-03T12:40:00.000Z",
            adapterState: { publicUrl: routeUrl },
          };
        },
        async execute({ operationId }) {
          calls.push(["execute", role, operationId]);
          return role === "PRIMARY" ? {
            status: "FAILED",
            receipt: { failureCode: "INJECTED_PRIMARY_FAILURE" },
          } : {
            status: "SUCCEEDED",
            routeUrl,
            artifactHash: ARTIFACT_HASH,
          };
        },
        async closeObligation({ operationId }) {
          calls.push(["close", role, operationId]);
          return { status: "CLOSED", receipt: hash(`${role}:closed`) };
        },
        async release({ operationId }) {
          calls.push(["release", role, operationId]);
          return { status: "RELEASED", receipt: hash(`${role}:released`) };
        },
      };
    }

    const formed = composition(directory, stubs, clock, {
      primaryAdapter: effectAdapter("PRIMARY", "primary.injected",
        "primary-failure-domain", PRIMARY_URL),
      recoveryAdapter: effectAdapter("RECOVERY", "recovery.injected",
        "recovery-failure-domain", RECOVERY_URL),
    });
    const orchestrator = createDurableOutcomeProgramOrchestratorV1({
      directory: path.join(directory, "orchestrator"),
      adapters: formed.adapters,
      discover: formed.discover,
      clock,
      measureOperations: async () => ({
        outsiderStaffTouchCount: 0,
        humanQueueCreated: false,
        source: "INJECTED_PRODUCTION_DAG_COUNTER",
      }),
    });
    const compiled = createFirstCommittedDigitalRealityProgramV1({
      programId: "first_production_full_dag",
      orderId: "order_first_production_full_dag",
      createdAt: "2026-09-03T12:00:00.000Z",
      formationDeadline: "2026-09-03T12:10:00.000Z",
      completionDeadline: "2026-09-03T12:30:00.000Z",
      cleanupDeadline: "2026-09-03T12:40:00.000Z",
      artifactHash: ARTIFACT_HASH,
      observationWindowMs: 600_000,
    });

    const first = await orchestrator.run(compiled);
    assert.equal(first.state, "PAUSED_RETRYABLE");
    assert.equal(first.retry.subjectId, "sustain_and_observe");
    assert.equal(first.retry.retryAfter, "2026-09-03T12:11:00.000Z");
    assert.equal(first.nodes.publish_result.recovery.status, "SUCCEEDED");
    assert.equal(first.nodes.publish_result.witness.status, "SATISFIED");

    current = "2026-09-03T12:11:00.000Z";
    const serviceWindowPause = await orchestrator.resume(
      compiled.programId);
    assert.equal(serviceWindowPause.state, "PAUSED_RETRYABLE");
    assert.equal(serviceWindowPause.retry.retryAfter,
      "2026-09-03T12:20:00.000Z");
    assert.equal(stubs.uptimeCalls.some(([, url]) =>
      url.includes("/stats/uptime?")), false);

    current = "2026-09-03T12:20:00.000Z";
    // Reconstruct both the production composition and the orchestrator before
    // closure. This deliberately starts with an empty route-aware child cache;
    // obligation closure must rebuild each witness child from the persisted
    // reservation and the requirement carried by the durable orchestrator.
    const restartedFormed = composition(directory, stubs, clock, {
      primaryAdapter: formed.adapters["primary.injected"],
      recoveryAdapter: formed.adapters["recovery.injected"],
    });
    const restartedOrchestrator = createDurableOutcomeProgramOrchestratorV1({
      directory: path.join(directory, "orchestrator"),
      adapters: restartedFormed.adapters,
      discover: restartedFormed.discover,
      clock,
      measureOperations: async () => ({
        outsiderStaffTouchCount: 0,
        humanQueueCreated: false,
        source: "INJECTED_PRODUCTION_DAG_COUNTER",
      }),
    });
    const completed = await restartedOrchestrator.resume(compiled.programId);
    assert.equal(completed.state, "SUCCEEDED");
    assert.equal(completed.nodes.sustain_and_observe.witness
      .longitudinalWindowProven, true);
    assert.equal(completed.nodes.close_episode.witness.status, "SATISFIED");
    assert.deepEqual(completed.reservations.independent_http_witness
      .adapterState.routes.map((route) =>
        route.childReservation.adapterState.uptimeAdapterState.released),
    [true, true], "closure persists the newest child lifecycle handles");
    assert.equal(completed.telemetry.zeroInternalOpsObserved, true);
    assert.equal(completed.humanQueueCreated, false);
    assert.equal(stubs.uptimeCalls.filter(([method, url]) =>
      method === "GET" && url.includes("/stats/uptime?")).length, 1);
    assert.equal(stubs.globalpingCalls.length, 4,
      "publish and horizon observe externally; checkpoint reuses their evidence");
    assert.equal(calls.filter(([phase]) => phase === "reserve").length, 2,
      "resume must reuse the initially formed primary and recovery routes");
    assert.equal(calls.filter(([phase]) => phase === "close").length, 2);
    assert.equal(calls.filter(([phase]) => phase === "release").length, 2);
  });
