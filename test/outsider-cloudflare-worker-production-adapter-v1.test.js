import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createCloudflareWorkerProductionAdapterV1 }
  from "../src/outsider-cloudflare-worker-production-adapter-v1.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";

const artifact = Buffer.from("outsider first committed reality\n", "utf8");
const artifactHash = `sha256:${createHash("sha256").update(artifact).digest("hex")}`;

function program() {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: "program_cf_001",
    orderId: "order_cf_001",
    createdAt: "2026-09-03T12:00:00.000Z",
    formationDeadline: "2026-09-03T12:10:00.000Z",
    completionDeadline: "2026-09-03T12:30:00.000Z",
    cleanupDeadline: "2026-09-03T12:40:00.000Z",
    artifactHash,
  });
}

test("stages, activates, observes and removes one deterministic Worker", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, signal: init.signal });
    if (url.endsWith("workers.dev/")) return new Response(artifact, { status: 200 });
    if (init.method === "PUT") {
      return Response.json({ success: true, result: { id: "staged" } });
    }
    if (init.method === "POST") {
      return Response.json({
        success: true,
        result: { enabled: true, previews_enabled: false },
      });
    }
    return new Response(null, { status: 204 });
  };
  const adapter = createCloudflareWorkerProductionAdapterV1({
    apiToken: "token_abcdefghijklmnopqrstuvwxyz",
    accountId: "a".repeat(32),
    workersDevSubdomain: "outsider-test",
    artifactBytes: artifact,
    fetchImpl,
  });
  const selectedProgram = program();
  const requirement = selectedProgram.requirements.find(
    (item) => item.role === "PRIMARY");
  const reservation = await adapter.reserve({
    program: selectedProgram,
    requirement,
    operationId: "reserve-primary-001",
  });
  assert.equal(reservation.status, "RESERVED");
  assert.equal(reservation.adapterState.artifactHash, artifactHash);
  assert.equal(JSON.stringify(reservation).includes("token_"), false);

  const effect = await adapter.execute({ reservation,
    operationId: "execute-primary-001" });
  assert.equal(effect.status, "SUCCEEDED");
  assert.equal(effect.providerObservationIndependent, false);

  const closed = await adapter.closeObligation({ reservation,
    operationId: "cleanup-primary-001" });
  assert.equal(closed.status, "CLOSED");
  assert.deepEqual(calls.map((call) => call.method),
    ["PUT", "POST", "GET", "DELETE"]);
  assert.equal(calls.every((call) => call.signal instanceof AbortSignal), true);
  assert.equal(new Set(calls.map((call) => call.signal)).size, calls.length,
    "every provider/public request receives its own timeout signal");
});

test("injected primary failure does not activate the staged route", async () => {
  const calls = [];
  const adapter = createCloudflareWorkerProductionAdapterV1({
    apiToken: "token_abcdefghijklmnopqrstuvwxyz",
    accountId: "b".repeat(32),
    workersDevSubdomain: "outsider-test",
    artifactBytes: artifact,
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      return Response.json({ success: true, result: {} });
    },
  });
  const selectedProgram = program();
  const requirement = selectedProgram.requirements[0];
  const reservation = await adapter.reserve({ program: selectedProgram,
    requirement, operationId: "reserve-primary-002" });
  const effect = await adapter.execute({ reservation,
    operationId: "execute-primary-002", primaryFailure: true });
  assert.equal(effect.status, "FAILED");
  assert.deepEqual(calls.map((call) => call.method), ["PUT"]);
});

test("staging transport interruption is retryable rather than provider unavailability",
  async () => {
    const adapter = createCloudflareWorkerProductionAdapterV1({
      apiToken: "token_abcdefghijklmnopqrstuvwxyz",
      accountId: "9".repeat(32),
      workersDevSubdomain: "outsider-test",
      artifactBytes: artifact,
      async fetchImpl() { throw new TypeError("network unavailable"); },
    });
    const selectedProgram = program();
    await assert.rejects(adapter.reserve({
      program: selectedProgram,
      requirement: selectedProgram.requirements[0],
      operationId: "reserve-transport-retryable",
    }), /STAGE_TRANSPORT_FAILED/u);
  });

test("staging timeout aborts the request and remains retryable", async () => {
  let observedSignal = null;
  const adapter = createCloudflareWorkerProductionAdapterV1({
    apiToken: "token_abcdefghijklmnopqrstuvwxyz",
    accountId: "8".repeat(32),
    workersDevSubdomain: "outsider-test",
    artifactBytes: artifact,
    requestTimeoutMs: 5,
    async fetchImpl(_url, init) {
      observedSignal = init.signal;
      return new Promise(() => {});
    },
  });
  const selectedProgram = program();
  await assert.rejects(adapter.reserve({
    program: selectedProgram,
    requirement: selectedProgram.requirements[0],
    operationId: "reserve-timeout-retryable",
  }), (error) => {
    assert.equal(error.outsiderCode, "STAGE_TRANSPORT_FAILED");
    return true;
  });
  assert.equal(observedSignal instanceof AbortSignal, true);
  assert.equal(observedSignal.aborted, true);
});

test("staging timeout also bounds a response body that never finishes",
  async () => {
    let observedSignal = null;
    const adapter = createCloudflareWorkerProductionAdapterV1({
      apiToken: "token_abcdefghijklmnopqrstuvwxyz",
      accountId: "7".repeat(32),
      workersDevSubdomain: "outsider-test",
      artifactBytes: artifact,
      requestTimeoutMs: 5,
      async fetchImpl(_url, init) {
        observedSignal = init.signal;
        return {
          ok: true,
          status: 200,
          arrayBuffer() { return new Promise(() => {}); },
        };
      },
    });
    const selectedProgram = program();
    await assert.rejects(adapter.reserve({
      program: selectedProgram,
      requirement: selectedProgram.requirements[0],
      operationId: "reserve-body-timeout-retryable",
    }), /STAGE_TRANSPORT_FAILED/u);
    assert.equal(observedSignal instanceof AbortSignal, true);
    assert.equal(observedSignal.aborted, true);
  });

test("controlled production fault activates a real Worker route that serves 503 and drives recovery",
  async () => {
    const calls = [];
    let stagedSourceContains503 = false;
    const adapter = createCloudflareWorkerProductionAdapterV1({
      apiToken: "token_abcdefghijklmnopqrstuvwxyz",
      accountId: "c".repeat(32),
      workersDevSubdomain: "outsider-test",
      artifactBytes: artifact,
      controlledFailureStatus: 503,
      async fetchImpl(url, init) {
        calls.push({ url, method: init.method });
        if (init.method === "PUT") {
          stagedSourceContains503 = Buffer.from(init.body)
            .includes(Buffer.from("status:503"));
          return Response.json({ success: true, result: { id: "staged" } });
        }
        if (init.method === "POST") {
          return Response.json({
            success: true,
            result: { enabled: true, previews_enabled: false },
          });
        }
        if (url.endsWith("workers.dev/")) {
          return new Response(artifact, { status: 503 });
        }
        return new Response(null, { status: 204 });
      },
    });
    const selectedProgram = program();
    const requirement = selectedProgram.requirements[0];
    const reservation = await adapter.reserve({
      program: selectedProgram,
      requirement,
      operationId: "reserve-controlled-primary",
    });
    assert.equal(reservation.status, "RESERVED");
    assert.equal(stagedSourceContains503, true);
    const result = await adapter.execute({
      reservation,
      operationId: "execute-controlled-primary",
    });
    assert.equal(result.status, "FAILED");
    assert.equal(result.reason, "CONTROLLED_PRIMARY_FAILURE_OBSERVED");
    assert.equal(result.observedPublicStatus, 503);
    assert.equal(result.controlledFailureObserved, true);
    assert.deepEqual(calls.map((call) => call.method), ["PUT", "POST", "GET"]);
  });

test("bounded propagation confirmation does not mistake an initial 404 for controlled failure absence",
  async () => {
    const calls = [];
    let publicReads = 0;
    const adapter = createCloudflareWorkerProductionAdapterV1({
      apiToken: "token_abcdefghijklmnopqrstuvwxyz",
      accountId: "e".repeat(32),
      workersDevSubdomain: "outsider-test",
      artifactBytes: artifact,
      controlledFailureStatus: 503,
      visibilityPollIntervalMs: 1,
      visibilityMaxWaitMs: 4,
      async fetchImpl(url, init) {
        calls.push({ url, method: init.method });
        if (init.method === "PUT") {
          return Response.json({ success: true, result: { id: "staged" } });
        }
        if (init.method === "POST") {
          return Response.json({
            success: true,
            result: { enabled: true, previews_enabled: false },
          });
        }
        if (url.endsWith("workers.dev/")) {
          publicReads += 1;
          return publicReads < 3
            ? new Response("not found", { status: 404 })
            : new Response(artifact, { status: 503 });
        }
        return new Response(null, { status: 204 });
      },
    });
    const selectedProgram = program();
    const requirement = selectedProgram.requirements[0];
    const reservation = await adapter.reserve({
      program: selectedProgram,
      requirement,
      operationId: "reserve-propagating-primary",
    });
    const result = await adapter.execute({
      reservation,
      operationId: "execute-propagating-primary",
    });
    assert.equal(result.status, "FAILED");
    assert.equal(result.reason, "CONTROLLED_PRIMARY_FAILURE_OBSERVED");
    assert.equal(result.observedPublicStatus, 503);
    assert.equal(result.controlledFailureObserved, true);
    assert.equal(result.visibilityAttempts, 3);
    assert.deepEqual(calls.map((call) => call.method),
      ["PUT", "POST", "GET", "GET", "GET"]);
  });

test("bounded propagation confirmation reports the last observation after its retry budget",
  async () => {
    let publicReads = 0;
    const adapter = createCloudflareWorkerProductionAdapterV1({
      apiToken: "token_abcdefghijklmnopqrstuvwxyz",
      accountId: "f".repeat(32),
      workersDevSubdomain: "outsider-test",
      artifactBytes: artifact,
      controlledFailureStatus: 503,
      visibilityPollIntervalMs: 1,
      visibilityMaxWaitMs: 3,
      async fetchImpl(url, init) {
        if (init.method === "PUT") {
          return Response.json({ success: true, result: { id: "staged" } });
        }
        if (init.method === "POST") {
          return Response.json({ success: true, result: { enabled: true } });
        }
        if (url.endsWith("workers.dev/")) {
          publicReads += 1;
          return new Response("not found", { status: 404 });
        }
        return new Response(null, { status: 204 });
      },
    });
    const selectedProgram = program();
    const reservation = await adapter.reserve({
      program: selectedProgram,
      requirement: selectedProgram.requirements[0],
      operationId: "reserve-never-propagated-primary",
    });
    const result = await adapter.execute({ reservation,
      operationId: "execute-never-propagated-primary" });
    assert.equal(result.reason, "PUBLIC_EFFECT_NOT_OBSERVED");
    assert.equal(result.observedPublicStatus, 404);
    assert.equal(result.controlledFailureObserved, false);
    assert.equal(result.visibilityAttempts, 3);
    assert.equal(publicReads, 3);
  });

test("controlled fault is opt-in and accepts only the milestone's exact 503",
  () => {
    assert.throws(() => createCloudflareWorkerProductionAdapterV1({
      apiToken: "token_abcdefghijklmnopqrstuvwxyz",
      accountId: "d".repeat(32),
      workersDevSubdomain: "outsider-test",
      artifactBytes: artifact,
      controlledFailureStatus: 500,
    }), /CONFIG_INVALID/u);
    assert.throws(() => createCloudflareWorkerProductionAdapterV1({
      apiToken: "token_abcdefghijklmnopqrstuvwxyz",
      accountId: "d".repeat(32),
      workersDevSubdomain: "outsider-test",
      artifactBytes: artifact,
      requestTimeoutMs: 60_001,
    }), /CONFIG_INVALID/u);
  });
