import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createFirstCommittedDigitalRealityProductionCompositionV5 }
  from "../src/outsider-first-committed-digital-reality-production-composition-v5.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";
import { canonicalizeStrict } from "../src/canonical.js";
import { createGlobalpingExactHttpObserverV2 }
  from "../src/outsider-globalping-exact-http-observer-v2.js";
import {
  createUptimeRobotFormationWitnessAdapterV2,
  createUptimeRobotHttpWitnessDriverV2,
  createUptimeRobotHttpWitnessPlanV2,
  sealUptimeRobotApiCapabilityV2,
} from "../src/outsider-uptimerobot-http-witness-adapter-v2.js";

const ARTIFACT_BYTES = Buffer.from("outsider-release-recovery-v5\n", "utf8");
const ARTIFACT_HASH = `sha256:${createHash("sha256")
  .update(ARTIFACT_BYTES).digest("hex")}`;
const SUFFIX = "0123456789abcdef0123456789abcdef";
const PRIMARY_URL = "https://result.account-subdomain.workers.dev/";
const RECOVERY_URL = "https://github.com/owner/repository/releases/download/"
  + `outsider-recovery-${SUFFIX}/artifact-${SUFFIX}.bin`;
const REDIRECT_URL = "https://release-assets.githubusercontent.com/"
  + "github-production-release-asset/1/2/artifact.bin"
  + "?sp=r&se=2026-09-04T13%3A00%3A00Z&sig=private-query";
const TOKEN = "github_pat_same_contents_and_admin_123456789";
const PROBE = Object.freeze({ country: "US", asn: 64500,
  network: "Independent test probe" });

function hash(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function program() {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: "first_production_composition_v5_test",
    orderId: "order_first_production_composition_v5_test",
    createdAt: "2026-09-04T12:00:00.000Z",
    formationDeadline: "2026-09-04T12:10:00.000Z",
    completionDeadline: "2026-09-04T12:30:00.000Z",
    cleanupDeadline: "2026-09-04T12:40:00.000Z",
    artifactHash: ARTIFACT_HASH,
    observationWindowMs: 600_000,
  });
}

function finished(id, request, result) {
  return {
    id,
    type: "http",
    target: request.target,
    status: "finished",
    probesCount: 1,
    results: [{ probe: PROBE, result: {
      status: "finished",
      truncated: false,
      tls: { authorized: true },
      ...result,
    } }],
  };
}

function stubs(input = {}) {
  const events = [];
  const measurements = new Map();
  const monitors = new Map();
  let measurementCount = 0;
  let monitorCount = 0;
  let now = "2026-09-04T12:01:00.000Z";
  return {
    events,
    clock: () => now,
    setClock(value) { now = value; },
    async globalpingFetch(url, options) {
      if (options.method === "POST") {
        const request = JSON.parse(options.body);
        const id = `measurement_${++measurementCount}`;
        measurements.set(id, request);
        events.push(["GLOBALPING_POST", request.target]);
        return json({ id, probesCount: 1 }, 202, {
          location: `/v1/measurements/${id}`,
        });
      }
      const id = url.split("/").at(-1);
      const request = measurements.get(id);
      events.push(["GLOBALPING_FINISHED", request.target]);
      if (request.target.endsWith("workers.dev")) {
        return json(finished(id, request, {
          statusCode: 200,
          rawBody: ARTIFACT_BYTES.toString("utf8"),
        }));
      }
      if (request.target === "github.com") {
        return json(finished(id, request, {
          statusCode: 302,
          rawBody: null,
          headers: { location: input.redirectLocation ?? REDIRECT_URL },
        }));
      }
      return json(finished(id, request, {
        statusCode: 200,
        rawBody: ARTIFACT_BYTES.toString("utf8"),
      }));
    },
    async uptimeRequest(url, options) {
      if (options.method === "POST") {
        const body = JSON.parse(Buffer.from(options.body).toString("utf8"));
        events.push(["UPTIME_POST", new URL(body.url).hostname,
          body.followRedirections]);
        const id = ++monitorCount;
        monitors.set(id, { id, type: "HTTP", friendlyName: body.friendlyName,
          url: body.url, status: "STARTED",
          followRedirections: body.followRedirections });
        if (input.losePostResponses) {
          throw new Error("provider accepted create; response lost");
        }
        return json(monitors.get(id), 201);
      }
      if (options.method === "DELETE") {
        events.push(["UPTIME_DELETE", url]);
        return new Response(null, { status: 200 });
      }
      if (url.includes("/stats/uptime?")) {
        const parsed = new URL(url);
        events.push(["UPTIME_STATS", parsed.searchParams.get("from"),
          parsed.searchParams.get("to")]);
        return json({ uptime: 100, total_downtime_seconds: 0,
          incident_count: 0, mtbf: null,
          from: parsed.searchParams.get("from"),
          to: parsed.searchParams.get("to") });
      }
      if (url.includes("/monitors?")) {
        const parsed = new URL(url);
        const values = [...monitors.values()].filter((monitor) =>
          monitor.friendlyName === parsed.searchParams.get("name")
          && monitor.url === parsed.searchParams.get("url"));
        events.push(["UPTIME_LIST", values.length]);
        return json({ data: values });
      }
      const id = Number(url.split("/").at(-1));
      const value = monitors.get(id);
      const up = new URL(value.url).hostname !== "github.com"
        || value.followRedirections === true;
      events.push(["UPTIME_GET", new URL(value.url).hostname,
        value.followRedirections]);
      return json({ ...value, status: up ? "UP" : "DOWN" });
    },
  };
}

function composition(directory, providers) {
  const forbidden = async () => {
    throw new Error("construction must not contact effect providers");
  };
  return createFirstCommittedDigitalRealityProductionCompositionV5({
    directory,
    cloudflare: {
      apiToken: "cloudflare-token-never-projected-123456",
      accountId: "a".repeat(32),
      workersDevSubdomain: "account-subdomain",
      artifactBytes: ARTIFACT_BYTES,
      fetchImpl: forbidden,
    },
    githubReleaseAsset: {
      contentsWriteApiToken: TOKEN,
      administrationReadApiToken: TOKEN,
      administrationReadCapabilityConfirmed: true,
      owner: "owner",
      repository: "repository",
      artifactBytes: ARTIFACT_BYTES,
      contentsFetchImpl: forbidden,
      administrationFetchImpl: forbidden,
    },
    uptimeRobot: {
      apiToken: "uptime-token-never-projected",
      expiresAt: "2026-09-04T13:00:00.000Z",
      permissionGrantHash: hash("uptime-grant-v5"),
      intervalSeconds: 300,
      timeoutSeconds: 30,
      successHttpResponseCodes: ["2xx"],
      requestImpl: providers.uptimeRequest,
      clock: providers.clock,
      readinessWait: async () => {},
    },
    globalping: {
      fetchImpl: providers.globalpingFetch,
      wait: async () => {},
      clock: providers.clock,
      pollIntervalMs: 0,
      maximumPolls: 2,
    },
  });
}

function witnessContext(compiled, witness) {
  const requirement = compiled.requirements.find((item) =>
    item.requirementId === "independent_http_witness");
  return {
    program: compiled,
    requirement,
    binding: { adapterId: witness.adapterId },
    dependencyReservations: {
      primary_publication: {
        status: "RESERVED",
        reservationId: "primary-reservation",
        validUntil: "2026-09-04T12:40:00.000Z",
        adapterState: { publicUrl: PRIMARY_URL, artifactHash: ARTIFACT_HASH },
      },
      recovery_publication: {
        status: "RESERVED",
        reservationId: "recovery-reservation",
        validUntil: "2026-09-04T12:40:00.000Z",
        adapterState: { routeUrl: RECOVERY_URL, artifactHash: ARTIFACT_HASH },
      },
    },
    operationId: "reserve-v5-preflighted-routes",
  };
}

test("v5 preflights exact bytes on both frozen routes before accepting witness capacity",
  async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(),
      "outsider-first-production-composition-v5-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const providers = stubs();
    const formed = composition(directory, providers);
    assert.deepEqual(Object.keys(formed.adapters).sort(), [
      "cloudflare-worker-preactivated-production-v2",
      "first-committed-reality-route-witness-v5",
      "github-release-asset-production-recovery-v2",
    ]);
    assert.deepEqual(providers.events, [],
      "composition construction must remain no-network");

    const compiled = program();
    const witness = formed.adapters[
      "first-committed-reality-route-witness-v5"];
    const reserved = await witness.reserve(witnessContext(compiled, witness));
    assert.equal(reserved.status, "RESERVED");
    assert.equal(reserved.adapterState.routes.every((route) =>
      route.childReservation.providerReceipt
        .exactCompatibilityProvenBeforeChildCapacityReservation === true),
    true);
    assert.equal(providers.events.filter(([kind]) =>
      kind === "GLOBALPING_POST").length, 3);
    assert.equal(providers.events.filter(([kind]) =>
      kind === "UPTIME_POST").length, 2);
    assert.deepEqual(providers.events.filter(([kind]) =>
      kind === "UPTIME_POST").map(([, host, follow]) => [host, follow])
      .sort((left, right) => left[0].localeCompare(right[0])), [
      ["github.com", true],
      ["result.account-subdomain.workers.dev", false],
    ]);
    assert.equal(reserved.adapterState.routes.every((route) => {
      const ready = route.childReservation.adapterState.uptimeAdapterState;
      return ready.schema
        === "outsider/readiness-gated-longitudinal-witness-state/v1"
        && ready.readinessSourceStatus === "UP"
        && ready.readinessSourceDeclaredRequirementMatch === true
        && ready.readyAt === "2026-09-04T12:01:00.000Z";
    }), true);
    for (const hostname of [
      "result.account-subdomain.workers.dev",
      "github.com",
    ]) {
      const exactFinished = providers.events.findIndex(([kind, host]) =>
        kind === "GLOBALPING_FINISHED" && host === hostname);
      const uptimeReserved = providers.events.findIndex(([kind, host]) =>
        kind === "UPTIME_POST" && host === hostname);
      assert.notEqual(exactFinished, -1);
      assert.notEqual(uptimeReserved, -1);
      assert.equal(exactFinished < uptimeReserved, true,
        `${hostname} exact preflight must precede its monitor reservation`);
    }
    assert.equal(JSON.stringify(reserved).includes("private-query"), false);
  });

test("v5 auto-discovers fsynced pending CREATE handles after a hard restart",
  async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(),
      "outsider-first-production-composition-v5-pending-restart-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const providers = stubs({ losePostResponses: true });
    const compiled = program();
    const context = witnessContext(compiled, {
      adapterId: "first-committed-reality-route-witness-v5",
    });
    const requirement = context.requirement;
    const capability = sealUptimeRobotApiCapabilityV2({
      apiToken: "uptime-token-never-projected",
      expiresAt: "2026-09-04T13:00:00.000Z",
    });
    const programKey = createHash("sha256").update(compiled.programHash,
      "utf8").digest("hex").slice(0, 24);
    const cleanupDeadline = compiled.obligations
      .filter((item) => item.targetRequirementId === requirement.requirementId)
      .reduce((latest, item) => Date.parse(item.deadline) > Date.parse(latest)
        ? item.deadline : latest, compiled.completionDeadline);
    for (const [routeRole, routeRef] of [
      ["PRIMARY", PRIMARY_URL], ["RECOVERY", RECOVERY_URL],
    ]) {
      const key = createHash("sha256").update(
        `${compiled.programHash}\0${routeRole}\0${routeRef}`, "utf8")
        .digest("hex");
      const routeRootPath = path.join(directory, "witness-routes-v5",
        programKey, `${routeRole.toLowerCase()}-${key.slice(0, 24)}`);
      mkdirSync(routeRootPath, { recursive: true, mode: 0o700 });
      const routeRoot = realpathSync(routeRootPath);
      const exact = createGlobalpingExactHttpObserverV2({
        directory: path.join(routeRoot, "globalping-observations-v2"),
        fetchImpl: providers.globalpingFetch, wait: async () => {},
        clock: providers.clock, pollIntervalMs: 0, maximumPolls: 2,
      });
      const plan = createUptimeRobotHttpWitnessPlanV2({
        targetUrl: routeRef,
        friendlyName: `outsider-v5-${key.slice(0, 21)}-${
          routeRole.toLowerCase()}`,
        intervalSeconds: 300, timeoutSeconds: 30, httpMethod: "GET",
        successHttpResponseCodes: ["2xx"],
        followRedirections: routeRole === "RECOVERY",
        redirectPolicyHash: exact.supportedPolicySetHash,
        observationRequirementHash: digest(
          "outsider/first-reality-observation-requirement/v5", requirement),
        formationDeadline: compiled.formationDeadline,
        serviceFrom: compiled.formationDeadline,
        serviceUntil: compiled.completionDeadline,
        cleanupDeadline,
      });
      const driver = createUptimeRobotHttpWitnessDriverV2({
        plan, expectedPlanHash: plan.planHash,
        credentialCapability: capability,
        ledgerDirectory: path.join(routeRoot, "uptimerobot-effect-ledger"),
        ledgerId: `ledger_${key.slice(0, 32)}`,
        adapterInstanceRefHash: digest(
          "outsider/uptimerobot-route-adapter-instance/v5", {
            programHash: compiled.programHash, routeRole, routeRef,
          }),
        permissionGrantHash: hash("uptime-grant-v5"),
        privateProjectionNonce: `private_v5_${createHmac("sha256",
          "uptime-token-never-projected").update(
          `${compiled.programHash}\0${routeRole}\0${routeRef}`, "utf8")
          .digest("hex")}`,
      }, { requestImpl: providers.uptimeRequest, clock: providers.clock });
      const childOperationId = `${context.operationId}:RESERVE:${
        createHash("sha256").update(routeRef, "utf8").digest("hex")
          .slice(0, 20)}`;
      const ignoredPending = await createUptimeRobotFormationWitnessAdapterV2(
        driver).reserve({ operationId: childOperationId,
        program: { completionDeadline: compiled.completionDeadline } });
      assert.equal(ignoredPending.status, "PENDING");
    }
    assert.equal(providers.events.filter(([kind]) => kind === "UPTIME_POST")
      .length, 2);

    // No first-process adapterState is passed here. The new composition finds
    // only the exact plan/ledger/operation-bound 0600 handles on disk.
    providers.setClock("2026-09-04T12:02:00.000Z");
    const restarted = composition(directory, providers);
    const witness = restarted.adapters[
      "first-committed-reality-route-witness-v5"];
    const reserved = await witness.reserve(witnessContext(compiled, witness));
    assert.equal(reserved.status, "RESERVED");
    assert.equal(providers.events.filter(([kind]) => kind === "UPTIME_LIST")
      .length, 2);
    assert.equal(providers.events.filter(([kind]) => kind === "UPTIME_POST")
      .length, 2, "restart must not emit a second POST for either route");
    const released = await witness.release({
      ...witnessContext(compiled, witness), reservation: reserved,
      operationId: "release-v5-pending-restart",
      disposition: "TEST_COMPLETE",
    });
    assert.equal(released.status, "RELEASED");
    assert.equal(providers.events.filter(([kind]) => kind === "UPTIME_DELETE")
      .length, 2);
  });

test("v5 replays sanitized exact-range evidence and propagates fresh child state",
  async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(),
      "outsider-first-production-composition-v5-window-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const providers = stubs();
    const formed = composition(directory, providers);
    const compiled = program();
    const witness = formed.adapters[
      "first-committed-reality-route-witness-v5"];
    const reserved = await witness.reserve(witnessContext(compiled, witness));
    assert.equal(reserved.status, "RESERVED");
    providers.setClock("2026-09-04T12:25:00.000Z");
    const resumedFormed = composition(directory, providers);
    const resumedWitness = resumedFormed.adapters[
      "first-committed-reality-route-witness-v5"];
    const requirement = compiled.requirements.find((item) =>
      item.requirementId === "independent_http_witness");
    const observation = await resumedWitness.observe({
      program: compiled,
      requirement,
      node: compiled.nodes.find((item) =>
        item.nodeId === "sustain_and_observe"),
      acceptance: ["availability_window"],
      reservation: reserved,
      operationId: "observe-v5-exact-window",
      effectResult: {
        routeUrl: RECOVERY_URL,
        dependencyEvidence: [{
          witnessRecordedAt: "2026-09-04T12:11:00.000Z",
        }],
      },
    });
    assert.equal(observation.status, "SATISFIED");
    assert.deepEqual(observation.sanitizedExactMetrics, {
      uptime: 100, totalDowntimeSeconds: 0, incidentCount: 0, mtbf: null,
      from: "2026-09-04T12:11:00.000Z",
      to: "2026-09-04T12:21:00.000Z",
    });
    assert.deepEqual(observation.providerReceipt.sanitizedExactMetrics,
      observation.sanitizedExactMetrics);
    assert.equal(observation.windowFrom, "2026-09-04T12:11:00.000Z");
    const recovery = observation.adapterState.routes.find((route) =>
      route.routeRole === "RECOVERY");
    const ready = recovery.childReservation.adapterState.uptimeAdapterState;
    assert.equal(ready.readyAt, "2026-09-04T12:01:00.000Z");
    assert.equal(ready.childAdapterState.sourceStatus, "UP");
    assert.equal(ready.childAdapterState.sourceDeclaredRequirementMatch, true);
    assert.equal(ready.childAdapterState.observationOccurrenceCount, 2,
      "fresh readiness GET survives resume and exact-range stats propagates");
  });

test("a recovery redirect policy failure prevents a committed witness reservation",
  async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(),
      "outsider-first-production-composition-v5-fail-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const providers = stubs({
      redirectLocation:
        "https://evil.example/github-production-release-asset/x?sig=x",
    });
    const formed = composition(directory, providers);
    const compiled = program();
    const witness = formed.adapters[
      "first-committed-reality-route-witness-v5"];
    const result = await witness.reserve(witnessContext(compiled, witness));
    assert.equal(result.status, "UNAVAILABLE");
    assert.equal(result.reason, "ALL_ROUTE_WITNESS_RESERVATIONS_REQUIRED");
    assert.equal(providers.events.some(([kind]) => kind === "UPTIME_DELETE"),
      true, "any sibling capacity must be compensated before formation fails");
  });
