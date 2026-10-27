import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createCloudflareWorkerPreactivatedProductionAdapterV2 }
  from "../src/outsider-cloudflare-worker-preactivated-production-adapter-v2.js";

const ARTIFACT = Buffer.from("preactivated exact artifact\n", "utf8");
const ARTIFACT_HASH = `sha256:${createHash("sha256")
  .update(ARTIFACT).digest("hex")}`;

test("reserve preactivates an exact 200 route, while later controlled failure remains an outcome attempt",
  async () => {
    const calls = [];
    let deployedStatus = null;
    let deleted = false;
    const adapter = createCloudflareWorkerPreactivatedProductionAdapterV2({
      apiToken: "cloudflare-private-token-v2-123456",
      accountId: "a".repeat(32),
      workersDevSubdomain: "account-subdomain",
      artifactBytes: ARTIFACT,
      controlledFailureStatus: 503,
      visibilityPollIntervalMs: 1,
      visibilityMaxWaitMs: 2,
      wait: async () => {},
      async fetchImpl(url, options) {
        calls.push([options.method, url]);
        if (options.method === "PUT") {
          deployedStatus = Buffer.from(options.body).includes(
            Buffer.from("status:503", "utf8")) ? 503 : 200;
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
    const requirement = {
      requirementId: "primary_publication",
      role: "PRIMARY",
      capability: "PUBLIC_HTTPS_ARTIFACT_PUBLICATION",
      constraints: { artifactHash: ARTIFACT_HASH },
    };
    const program = {
      programHash: `sha256:${"1".repeat(64)}`,
      completionDeadline: "2026-09-04T12:30:00.000Z",
      obligations: [],
    };
    const reservation = await adapter.reserve({
      program,
      requirement,
      operationId: "reserve_primary_v2",
    });
    assert.equal(reservation.status, "RESERVED");
    assert.equal(reservation.formationRoutePreactivated, true);
    assert.deepEqual(calls.map(([method]) => method), ["PUT", "POST", "GET"]);
    assert.equal(reservation.providerReceipt.observedPublicStatus, 200);
    assert.equal(reservation.providerReceipt.artifactHash, ARTIFACT_HASH);
    assert.equal(reservation.providerReceipt.outcomeCompletionClaimed, false);

    const effect = await adapter.execute({
      program,
      requirement,
      reservation,
      operationId: "execute_primary_v2",
    });
    assert.equal(effect.status, "FAILED");
    assert.equal(effect.reason, "CONTROLLED_PRIMARY_FAILURE_OBSERVED");
    assert.equal(effect.observedPublicStatus, 503);
    assert.equal(effect.controlledFailureObserved, true);
    assert.equal(effect.formationPreflightWasExact200, true);
    assert.deepEqual(calls.map(([method]) => method),
      ["PUT", "POST", "GET", "PUT", "POST", "GET"],
      "execute must replace 200 with an externally observed controlled 503");

    const released = await adapter.release({
      reservation,
      operationId: "release_primary_v2",
    });
    assert.equal(released.status, "RELEASED");
    assert.equal(released.activeRouteVerifiedAbsent, true);
    assert.equal(released.publicAbsenceObservationIndependent, false);
    assert.deepEqual(calls.map(([method]) => method),
      ["PUT", "POST", "GET", "PUT", "POST", "GET", "DELETE", "GET"]);
  });

test("a DELETE acknowledgement cannot close an obligation while the route is still live",
  async () => {
    let clock = 0;
    let deployedStatus = null;
    const adapter = createCloudflareWorkerPreactivatedProductionAdapterV2({
      apiToken: "cloudflare-private-token-v2-123456",
      accountId: "a".repeat(32),
      workersDevSubdomain: "account-subdomain",
      artifactBytes: ARTIFACT,
      visibilityPollIntervalMs: 1,
      visibilityMaxWaitMs: 2,
      cleanupVerificationPollIntervalMs: 1,
      cleanupVerificationMaxWaitMs: 2,
      requestTimeoutMs: 10,
      now: () => clock++,
      wait: async () => {},
      async fetchImpl(_url, options) {
        if (options.method === "PUT") {
          deployedStatus = 200;
          return Response.json({ success: true });
        }
        if (options.method === "POST") {
          return Response.json({ success: true, result: { enabled: true } });
        }
        if (options.method === "GET") {
          return new Response(ARTIFACT, { status: deployedStatus });
        }
        if (options.method === "DELETE") {
          return Response.json({ success: true });
        }
        throw new Error("unexpected method");
      },
    });
    const requirement = {
      requirementId: "primary_publication",
      role: "PRIMARY",
      capability: "PUBLIC_HTTPS_ARTIFACT_PUBLICATION",
      constraints: { artifactHash: ARTIFACT_HASH },
    };
    const program = {
      programHash: `sha256:${"1".repeat(64)}`,
      completionDeadline: "2026-09-04T12:30:00.000Z",
      obligations: [],
    };
    const reservation = await adapter.reserve({
      program,
      requirement,
      operationId: "reserve_cleanup_unverified_v2",
    });
    const released = await adapter.release({
      reservation,
      operationId: "release_cleanup_unverified_v2",
    });
    assert.deepEqual(released, {
      status: "OPEN",
      reason: "PUBLIC_ROUTE_ABSENCE_NOT_VERIFIED",
      activeRouteVerifiedAbsent: false,
    });
  });
