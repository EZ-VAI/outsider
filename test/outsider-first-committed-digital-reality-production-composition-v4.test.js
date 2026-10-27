import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createFirstCommittedDigitalRealityProductionCompositionV4 }
  from "../src/outsider-first-committed-digital-reality-production-composition-v4.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";

const ARTIFACT_BYTES = Buffer.from("outsider-release-recovery-v4\n", "utf8");
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

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function program() {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: "first_production_composition_v4_test",
    orderId: "order_first_production_composition_v4_test",
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
  return {
    events,
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
        events.push(["UPTIME_POST", new URL(body.url).hostname]);
        const id = ++monitorCount;
        monitors.set(id, { id, type: "HTTP", friendlyName: body.friendlyName,
          url: body.url, status: "STARTED" });
        return json(monitors.get(id), 201);
      }
      if (options.method === "DELETE") {
        events.push(["UPTIME_DELETE", url]);
        return new Response(null, { status: 200 });
      }
      const id = Number(url.split("/").at(-1));
      return json({ ...monitors.get(id), status: "UP" });
    },
  };
}

function composition(directory, providers) {
  const forbidden = async () => {
    throw new Error("construction must not contact effect providers");
  };
  return createFirstCommittedDigitalRealityProductionCompositionV4({
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
      permissionGrantHash: hash("uptime-grant-v4"),
      intervalSeconds: 300,
      timeoutSeconds: 30,
      successHttpResponseCodes: ["2xx"],
      requestImpl: providers.uptimeRequest,
      clock: () => "2026-09-04T12:01:00.000Z",
    },
    globalping: {
      fetchImpl: providers.globalpingFetch,
      wait: async () => {},
      clock: () => "2026-09-04T12:01:00.000Z",
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
    operationId: "reserve-v4-preflighted-routes",
  };
}

test("v4 preflights exact bytes on both frozen routes before accepting witness capacity",
  async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(),
      "outsider-first-production-composition-v4-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const providers = stubs();
    const formed = composition(directory, providers);
    assert.deepEqual(Object.keys(formed.adapters).sort(), [
      "cloudflare-worker-preactivated-production-v2",
      "first-committed-reality-route-witness-v4",
      "github-release-asset-production-recovery-v2",
    ]);
    assert.deepEqual(providers.events, [],
      "composition construction must remain no-network");

    const compiled = program();
    const witness = formed.adapters[
      "first-committed-reality-route-witness-v4"];
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

test("a recovery redirect policy failure prevents a committed witness reservation",
  async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(),
      "outsider-first-production-composition-v4-fail-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const providers = stubs({
      redirectLocation:
        "https://evil.example/github-production-release-asset/x?sig=x",
    });
    const formed = composition(directory, providers);
    const compiled = program();
    const witness = formed.adapters[
      "first-committed-reality-route-witness-v4"];
    const result = await witness.reserve(witnessContext(compiled, witness));
    assert.equal(result.status, "UNAVAILABLE");
    assert.equal(result.reason, "ALL_ROUTE_WITNESS_RESERVATIONS_REQUIRED");
    assert.equal(providers.events.some(([kind]) => kind === "UPTIME_DELETE"),
      true, "any sibling capacity must be compensated before formation fails");
  });
