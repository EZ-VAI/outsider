import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createCloudflareWorkerPreactivatedProductionAdapterV3,
  createCloudflareWorkerProductionAdapterV3,
  OUTSIDER_CLOUDFLARE_WORKER_PRODUCTION_ADAPTER_V3_PROTOCOL,
} from "../src/outsider-cloudflare-worker-production-adapter-v3.js";

const ARTIFACT = Buffer.from("protocol-correct Worker artifact\n", "utf8");
const ARTIFACT_HASH = `sha256:${createHash("sha256")
  .update(ARTIFACT).digest("hex")}`;
const PROGRAM = Object.freeze({
  programHash: `sha256:${"1".repeat(64)}`,
  completionDeadline: "2026-09-04T12:30:00.000Z",
  obligations: [],
});
const REQUIREMENT = Object.freeze({
  requirementId: "primary_publication",
  role: "PRIMARY",
  capability: "PUBLIC_HTTPS_ARTIFACT_PUBLICATION",
  constraints: Object.freeze({ artifactHash: ARTIFACT_HASH }),
});

async function inspectUpload(options) {
  assert.equal(options.body instanceof FormData, true);
  const headers = new Headers(options.headers);
  assert.equal(headers.has("content-type"), false,
    "fetch must derive the boundary from the native FormData body");
  assert.equal(headers.has("content-length"), false);
  const keys = [...options.body.keys()];
  assert.deepEqual(keys, ["metadata", "worker.js"]);
  const metadata = JSON.parse(options.body.get("metadata"));
  assert.equal(metadata.main_module, "worker.js");
  assert.equal(metadata.compatibility_date, "2025-08-01");
  const module = options.body.get("worker.js");
  assert.equal(module.name, "worker.js");
  assert.equal(module.type, "application/javascript+module");
  assert.equal((await module.text()).includes("export default"), true);
  assert.equal(options.body.has("worker.mjs"), false);
  return module.text();
}

test("v3 emits the current Wrangler-compatible main-module multipart tuple",
  async () => {
    let uploads = 0;
    const adapter = createCloudflareWorkerProductionAdapterV3({
      apiToken: "cloudflare-private-token-v3-123456",
      accountId: "a".repeat(32),
      workersDevSubdomain: "account-subdomain",
      artifactBytes: ARTIFACT,
      async fetchImpl(url, options) {
        assert.match(new URL(url).pathname,
          new RegExp(`^/client/v4/accounts/${"a".repeat(32)}`
            + "/workers/scripts/outsider-[a-f0-9]{32}$", "u"));
        assert.equal(options.method, "PUT");
        await inspectUpload(options);
        uploads += 1;
        return Response.json({ success: true, result: { id: "staged" } });
      },
    });
    const reservation = await adapter.reserve({
      program: PROGRAM,
      requirement: REQUIREMENT,
      operationId: "reserve_primary_v3",
    });
    assert.equal(reservation.status, "RESERVED");
    assert.equal(uploads, 1);
    assert.equal(adapter.adapterId, "cloudflare-worker-production-v3");
    assert.equal(adapter.uploadProtocol.protocolHash.startsWith("sha256:"),
      true);
    assert.equal(
      OUTSIDER_CLOUDFLARE_WORKER_PRODUCTION_ADAPTER_V3_PROTOCOL
        .mjsExtensionAloneProvenInvalid,
      false);
  });

test("v3 preactivated adapter normalizes both exact-200 and controlled-503 uploads",
  async () => {
    const uploadStatuses = [];
    let deployedStatus = null;
    let deleted = false;
    const methods = [];
    const adapter = createCloudflareWorkerPreactivatedProductionAdapterV3({
      apiToken: "cloudflare-private-token-v3-123456",
      accountId: "b".repeat(32),
      workersDevSubdomain: "account-subdomain",
      artifactBytes: ARTIFACT,
      controlledFailureStatus: 503,
      visibilityPollIntervalMs: 1,
      visibilityMaxWaitMs: 2,
      cleanupVerificationPollIntervalMs: 1,
      cleanupVerificationMaxWaitMs: 2,
      wait: async () => {},
      async fetchImpl(url, options) {
        methods.push(options.method);
        if (options.method === "PUT") {
          const source = await inspectUpload(options);
          deployedStatus = source.includes("status:503") ? 503 : 200;
          uploadStatuses.push(deployedStatus);
          return Response.json({ success: true });
        }
        if (options.method === "POST") {
          return Response.json({ success: true, result: { enabled: true } });
        }
        if (options.method === "GET") {
          if (deleted
            && new URL(url).searchParams.has("outsider_cleanup_probe")) {
            return new Response(null, { status: 404 });
          }
          return new Response(ARTIFACT, { status: deployedStatus });
        }
        if (options.method === "DELETE") {
          deleted = true;
          return Response.json({ success: true });
        }
        throw new Error("unexpected method");
      },
    });
    const reservation = await adapter.reserve({
      program: PROGRAM,
      requirement: REQUIREMENT,
      operationId: "reserve_preactivated_v3",
    });
    assert.equal(reservation.status, "RESERVED");
    assert.equal(reservation.formationRoutePreactivated, true);

    const effect = await adapter.execute({
      program: PROGRAM,
      requirement: REQUIREMENT,
      reservation,
      operationId: "execute_preactivated_v3",
    });
    assert.equal(effect.status, "FAILED");
    assert.equal(effect.reason, "CONTROLLED_PRIMARY_FAILURE_OBSERVED");
    assert.deepEqual(uploadStatuses, [200, 503]);

    const released = await adapter.release({
      reservation,
      operationId: "release_preactivated_v3",
    });
    assert.equal(released.status, "RELEASED");
    assert.deepEqual(methods,
      ["PUT", "POST", "GET", "PUT", "POST", "GET", "DELETE", "GET"]);
  });

test("a provider 10021 remains an explicit rejection, never a capacity receipt",
  async () => {
    const adapter = createCloudflareWorkerProductionAdapterV3({
      apiToken: "cloudflare-private-token-v3-123456",
      accountId: "c".repeat(32),
      workersDevSubdomain: "account-subdomain",
      artifactBytes: ARTIFACT,
      async fetchImpl(_url, options) {
        await inspectUpload(options);
        return Response.json({
          success: false,
          errors: [{ code: 10021, message: "module resolution failed" }],
        }, { status: 400 });
      },
    });
    const result = await adapter.reserve({
      program: PROGRAM,
      requirement: REQUIREMENT,
      operationId: "reserve_rejected_v3",
    });
    assert.deepEqual(result, {
      status: "UNAVAILABLE",
      reason: "STAGE_REJECTED",
      providerStatus: 400,
    });
  });
