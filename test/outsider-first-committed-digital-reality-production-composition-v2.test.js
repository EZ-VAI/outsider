import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createFirstCommittedDigitalRealityProductionCompositionV2 }
  from "../src/outsider-first-committed-digital-reality-production-composition-v2.js";
import { createFirstCommittedDigitalRealityProgramV1 }
  from "../src/outsider-first-committed-digital-reality-program-v1.js";

const ARTIFACT_BYTES = Buffer.from("outsider-release-recovery-v2\n", "utf8");
const ARTIFACT_HASH = `sha256:${createHash("sha256")
  .update(ARTIFACT_BYTES).digest("hex")}`;
const GITHUB_TOKEN = "github_pat_same_contents_and_admin_token_123456789";

function hash(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function program() {
  return createFirstCommittedDigitalRealityProgramV1({
    programId: "first_production_composition_v2_test",
    orderId: "order_first_production_composition_v2_test",
    createdAt: "2026-09-04T12:00:00.000Z",
    formationDeadline: "2026-09-04T12:10:00.000Z",
    completionDeadline: "2026-09-04T12:30:00.000Z",
    cleanupDeadline: "2026-09-04T12:40:00.000Z",
    artifactHash: ARTIFACT_HASH,
    observationWindowMs: 600_000,
  });
}

function primaryAdapter() {
  return Object.freeze({
    adapterId: "injected-cloudflare-primary-v1",
    providerRef: "cloudflare-workers",
    failureDomainRef: "cloudflare.com",
    roles: Object.freeze(["PRIMARY"]),
    supports(requirement) { return requirement?.role === "PRIMARY"; },
    async reserve() { throw new Error("not used"); },
    async execute() { throw new Error("not used"); },
    async release() { throw new Error("not used"); },
    async closeObligation() { throw new Error("not used"); },
  });
}

function compositionInput(directory, input = {}) {
  const calls = input.calls ?? [];
  return {
    directory,
    primaryAdapter: primaryAdapter(),
    githubReleaseAsset: {
      contentsWriteApiToken: input.contentsToken ?? GITHUB_TOKEN,
      administrationReadApiToken: input.administrationToken ?? GITHUB_TOKEN,
      administrationReadCapabilityConfirmed: true,
      owner: "owner",
      repository: "repository",
      baseBranch: "main",
      artifactBytes: ARTIFACT_BYTES,
      async contentsFetchImpl(url, options) {
        calls.push(["contents", options.method ?? "GET", url]);
        if (input.contentsFetchImpl !== undefined) {
          return input.contentsFetchImpl(url, options);
        }
        throw new Error("construction/discovery must not contact GitHub");
      },
      async administrationFetchImpl(url, options) {
        calls.push(["administration", options.method ?? "GET", url]);
        if (input.administrationFetchImpl !== undefined) {
          return input.administrationFetchImpl(url, options);
        }
        throw new Error("construction/discovery must not contact GitHub");
      },
    },
    uptimeRobot: {
      apiToken: "uptimerobot-private-token-never-projected",
      expiresAt: "2026-09-04T13:00:00.000Z",
      permissionGrantHash: hash("uptimerobot-account-grant-v2"),
      intervalSeconds: 300,
      timeoutSeconds: 30,
      successHttpResponseCodes: ["2xx"],
      async requestImpl() {
        throw new Error("construction/discovery must not contact witness");
      },
      clock: () => "2026-09-04T12:01:00.000Z",
    },
    globalping: {
      async fetchImpl() {
        throw new Error("construction/discovery must not contact witness");
      },
      wait: async () => {},
      clock: () => "2026-09-04T12:20:00.000Z",
      pollIntervalMs: 1,
      maximumPolls: 2,
    },
  };
}

test("v2 injects Release Asset recovery while reusing v1 primary and witness wiring",
  async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(),
      "outsider-first-production-composition-v2-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const calls = [];
    const composition =
      createFirstCommittedDigitalRealityProductionCompositionV2(
        compositionInput(directory, { calls }));
    assert.deepEqual(Object.keys(composition.adapters).sort(), [
      "first-committed-reality-route-witness-v1",
      "github-release-asset-production-recovery-v2",
      "injected-cloudflare-primary-v1",
    ]);
    assert.equal(calls.length, 0,
      "construction must not invoke either GitHub capability");

    const compiled = program();
    const requirement = compiled.requirements.find((item) =>
      item.role === "RECOVERY");
    const binding = await composition.discover({ program: compiled,
      requirement });
    assert.deepEqual(binding, {
      adapterId: "github-release-asset-production-recovery-v2",
      providerRef: "github-release-assets",
    });
    assert.equal(calls.length, 0,
      "capability discovery must remain no-network");
    assert.equal(JSON.stringify(composition).includes(GITHUB_TOKEN), false);
  });

test("separate capability fields must identify the exact same credential", (t) => {
  const directory = mkdtempSync(path.join(tmpdir(),
    "outsider-first-production-composition-v2-token-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  assert.throws(() =>
    createFirstCommittedDigitalRealityProductionCompositionV2(
      compositionInput(directory, {
        calls,
        administrationToken: `${GITHUB_TOKEN}_different`,
      })), (error) => {
    assert.equal(error.outsiderCode, "GITHUB_CAPABILITY_CONFIG_INVALID");
    return true;
  });
  assert.equal(calls.length, 0);
});

for (const status of [403, 404]) {
  test(`v2 admin preflight ${status} fails before any Release Asset mutation`,
    async (t) => {
      const directory = mkdtempSync(path.join(tmpdir(),
        "outsider-first-production-composition-v2-preflight-"));
      t.after(() => rmSync(directory, { recursive: true, force: true }));
      const calls = [];
      const composition =
        createFirstCommittedDigitalRealityProductionCompositionV2(
          compositionInput(directory, {
            calls,
            async contentsFetchImpl(url, options) {
              assert.equal(options.method ?? "GET", "GET");
              assert.equal(url,
                "https://api.github.com/repos/owner/repository");
              return Response.json({ private: false, default_branch: "main" });
            },
            async administrationFetchImpl(url, options) {
              assert.equal(options.method ?? "GET", "GET");
              assert.equal(url.endsWith("/actions/permissions"), true);
              return Response.json({ message: status === 403
                ? "Forbidden" : "Not Found" }, { status });
            },
          }));
      const compiled = program();
      const requirement = compiled.requirements.find((item) =>
        item.role === "RECOVERY");
      const recovery = composition.adapters[
        "github-release-asset-production-recovery-v2"];
      await assert.rejects(recovery.reserve({
        program: compiled,
        requirement,
        operationId: `reserve-v2-preflight-${status}`,
      }), (error) => {
        assert.equal(error.outsiderCode,
          "ADMINISTRATION_READ_PREFLIGHT_FAILED");
        return true;
      });
      assert.deepEqual(calls.map(([capability, method]) =>
        [capability, method]), [
        ["contents", "GET"],
        ["administration", "GET"],
      ]);
      assert.equal(calls.some(([, method]) => method !== "GET"), false);
      assert.equal(calls.some(([, , url]) =>
        url.includes("/immutable-releases")), false);
    });
}
