import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createCloudflareWorkerProductionAdapter,
  OUTSIDER_CLOUDFLARE_WORKER_UPLOAD_PROTOCOL }
  from "../src/outsider-cloudflare-worker-production-adapter.js";
import { createCloudflareWorkerPreactivatedProductionAdapter }
  from "../src/outsider-cloudflare-worker-preactivated-production-adapter.js";
import { createCloudflareWorkerProductionAdapterV3,
  createCloudflareWorkerPreactivatedProductionAdapterV3,
  OUTSIDER_CLOUDFLARE_WORKER_PRODUCTION_ADAPTER_V3_PROTOCOL }
  from "../src/outsider-cloudflare-worker-production-adapter-v3.js";

const ARTIFACT = Buffer.from("current Worker contract replay\n", "utf8");
const ARTIFACT_HASH = `sha256:${createHash("sha256")
  .update(ARTIFACT).digest("hex")}`;
const PROGRAM = Object.freeze({
  programHash: `sha256:${"1".repeat(64)}`,
  completionDeadline: "2026-09-04T12:30:00.000Z",
  obligations: [{ targetRequirementId: "primary_publication",
    deadline: "2026-09-04T12:40:00.000Z" }],
});
const REQUIREMENT = Object.freeze({
  requirementId: "primary_publication",
  role: "PRIMARY",
  capability: "PUBLIC_HTTPS_ARTIFACT_PUBLICATION",
  constraints: { artifactHash: ARTIFACT_HASH },
});
const RESERVE = Object.freeze({ program: PROGRAM,
  requirement: REQUIREMENT, operationId: "reserve_primary" });

function configuration(overrides = {}) {
  return {
    apiToken: "offline-cloudflare-token-1234567890",
    accountId: "a".repeat(32),
    workersDevSubdomain: "account-subdomain",
    artifactBytes: ARTIFACT,
    adapterId: "cloudflare-primary-contract",
    preactivatedAdapterId: "cloudflare-preactivated-contract",
    visibilityPollIntervalMs: 1,
    visibilityMaxWaitMs: 3,
    cleanupVerificationPollIntervalMs: 1,
    cleanupVerificationMaxWaitMs: 3,
    wait: async () => {},
    ...overrides,
  };
}

async function inspectUpload(init) {
  assert.ok(init.body instanceof FormData);
  const headers = new Headers(init.headers);
  assert.equal(headers.has("content-type"), false);
  assert.equal(headers.has("content-length"), false);
  assert.deepEqual([...init.body.keys()], ["metadata", "worker.js"]);
  const metadata = JSON.parse(init.body.get("metadata"));
  assert.deepEqual(metadata, { main_module: "worker.js",
    compatibility_date: "2025-08-01" });
  const module = init.body.get("worker.js");
  assert.equal(module.name, metadata.main_module);
  assert.equal(module.type, "application/javascript+module");
  const source = await module.text();
  assert.ok(source.includes(ARTIFACT.toString("base64")));
  return { metadata, source };
}

function provider(scenario = {}) {
  const calls = [];
  let deployedStatus = null;
  let deleted = false;
  let reads = 0;
  let clock = 0;
  return {
    calls,
    now: () => clock++,
    async fetchImpl(url, init) {
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.redirect, "error");
      const call = { url, method: init.method };
      calls.push(call);
      if (init.method === "PUT") {
        call.upload = await inspectUpload(init);
        deployedStatus = call.upload.source.includes("status:503") ? 503 : 200;
        return scenario.rejectUpload
          ? Response.json({ success: false, errors: [{ code: 10021 }] },
            { status: 400 })
          : Response.json({ success: true, result: { id: "staged" } });
      }
      if (init.method === "POST") {
        call.body = JSON.parse(Buffer.from(init.body).toString("utf8"));
        return Response.json({ success: !scenario.rejectActivation,
          result: { enabled: !scenario.rejectActivation } });
      }
      if (init.method === "GET") {
        if (new URL(url).searchParams.has("outsider_cleanup_probe")) {
          return deleted && !scenario.cleanupStillLive
            ? new Response(null, { status: 404 })
            : new Response(ARTIFACT, { status: 200 });
        }
        reads += 1;
        if (reads <= (scenario.propagationReads ?? 0)) {
          return new Response("propagating", { status: 404 });
        }
        return new Response(ARTIFACT, { status: deployedStatus });
      }
      if (init.method === "DELETE") {
        deleted = true;
        return Response.json({ success: true });
      }
      throw new Error(`Unexpected offline request ${init.method}`);
    },
  };
}

async function replay(factory, scenario = {}) {
  const transport = provider(scenario);
  const adapter = factory(configuration({ ...transport,
    controlledFailureStatus: scenario.controlledFailure ? 503 : undefined }));
  const reservation = await adapter.reserve(RESERVE);
  let effect = null;
  let closure = null;
  if (reservation.status === "RESERVED") {
    effect = await adapter.execute({ ...RESERVE, reservation,
      operationId: "execute_primary" });
    closure = await adapter.closeObligation({ reservation,
      operationId: "close_primary" });
  }
  return { reservation, effect, closure, calls: transport.calls,
    uploadProtocol: adapter.uploadProtocol };
}

test("current implementation preserves the frozen v3 upload protocol", () => {
  assert.deepEqual(OUTSIDER_CLOUDFLARE_WORKER_UPLOAD_PROTOCOL,
    OUTSIDER_CLOUDFLARE_WORKER_PRODUCTION_ADAPTER_V3_PROTOCOL);
});

for (const [name, current, frozen, scenario, expected] of [
  ["direct successful lifecycle", createCloudflareWorkerProductionAdapter,
    createCloudflareWorkerProductionAdapterV3, {}, "SUCCEEDED"],
  ["direct observed 503", createCloudflareWorkerProductionAdapter,
    createCloudflareWorkerProductionAdapterV3,
    { controlledFailure: true }, "FAILED"],
  ["bounded route propagation", createCloudflareWorkerProductionAdapter,
    createCloudflareWorkerProductionAdapterV3,
    { propagationReads: 2 }, "SUCCEEDED"],
  ["provider upload rejection", createCloudflareWorkerProductionAdapter,
    createCloudflareWorkerProductionAdapterV3, { rejectUpload: true }, null],
  ["preactivated successful lifecycle",
    createCloudflareWorkerPreactivatedProductionAdapter,
    createCloudflareWorkerPreactivatedProductionAdapterV3, {}, "SUCCEEDED"],
  ["preflight 200 followed by observed 503",
    createCloudflareWorkerPreactivatedProductionAdapter,
    createCloudflareWorkerPreactivatedProductionAdapterV3,
    { controlledFailure: true }, "FAILED"],
  ["preactivation failure compensation",
    createCloudflareWorkerPreactivatedProductionAdapter,
    createCloudflareWorkerPreactivatedProductionAdapterV3,
    { rejectActivation: true }, null],
  ["live route prevents closure",
    createCloudflareWorkerPreactivatedProductionAdapter,
    createCloudflareWorkerPreactivatedProductionAdapterV3,
    { cleanupStillLive: true }, "SUCCEEDED"],
]) {
  test(`contract replay: ${name}`, async () => {
    const historical = await replay(frozen, scenario);
    const actual = await replay(current, scenario);
    assert.deepEqual(actual, historical,
      "provider requests, deterministic identities and receipts remain compatible");
    assert.equal(actual.effect?.status ?? null, expected);
    if (scenario.cleanupStillLive) {
      assert.equal(actual.closure.status, "OPEN");
      assert.equal(actual.closure.reason, "PUBLIC_ROUTE_ABSENCE_NOT_VERIFIED");
    } else if (actual.reservation.status === "RESERVED") {
      assert.equal(actual.closure.status, "CLOSED");
    } else {
      assert.equal(actual.reservation.status, "UNAVAILABLE");
    }
  });
}

test("current formation and controlled-failure paths work without a multipart parser",
  async (context) => {
    context.mock.method(Response.prototype, "formData", () => {
      throw new Error("legacy multipart parsing must not run");
    });
    const actual = await replay(createCloudflareWorkerPreactivatedProductionAdapter,
      { controlledFailure: true });
    assert.equal(actual.reservation.status, "RESERVED");
    assert.equal(actual.effect.reason, "CONTROLLED_PRIMARY_FAILURE_OBSERVED");
    assert.equal(actual.closure.status, "CLOSED");
    assert.deepEqual(actual.calls.map((call) => call.method),
      ["PUT", "POST", "GET", "PUT", "POST", "GET", "DELETE", "GET"]);
  });

test("a persisted frozen reservation resumes on the current lifecycle", async () => {
  const transport = provider();
  const frozen = createCloudflareWorkerPreactivatedProductionAdapterV3(
    configuration(transport));
  const persisted = JSON.parse(JSON.stringify(await frozen.reserve(RESERVE)));
  const current = createCloudflareWorkerPreactivatedProductionAdapter(
    configuration(transport));
  const effect = await current.execute({ ...RESERVE, reservation: persisted,
    operationId: "resume_primary" });
  assert.equal(effect.status, "SUCCEEDED");
  assert.equal(effect.routeUrl, persisted.adapterState.publicUrl);
  const closed = await current.closeObligation({ reservation: persisted,
    operationId: "resume_cleanup" });
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.activeRouteVerifiedAbsent, true);
});

test("transport failure retries the same deterministic upload without a false rejection",
  async () => {
    const calls = [];
    const adapter = createCloudflareWorkerProductionAdapter(configuration({
      async fetchImpl(url, init) {
        calls.push({ url, upload: await inspectUpload(init) });
        if (calls.length === 1) throw new TypeError("offline transport drop");
        return Response.json({ success: true });
      },
    }));
    await assert.rejects(adapter.reserve(RESERVE),
      { outsiderCode: "STAGE_TRANSPORT_FAILED" });
    const retried = await adapter.reserve(RESERVE);
    assert.equal(retried.status, "RESERVED");
    assert.deepEqual(calls[0], calls[1]);
  });

for (const blockedPart of ["request", "response body"]) {
  test(`current upload timeout bounds a stalled ${blockedPart}`, async () => {
    let signal;
    const adapter = createCloudflareWorkerProductionAdapter(configuration({
      requestTimeoutMs: 5,
      async fetchImpl(_url, init) {
        signal = init.signal;
        const never = () => new Promise(() => {});
        return blockedPart === "request" ? never()
          : { ok: true, status: 200, arrayBuffer: never };
      },
    }));
    await assert.rejects(adapter.reserve(RESERVE),
      { outsiderCode: "STAGE_TRANSPORT_FAILED" });
    assert.equal(signal.aborted, true);
  });
}
