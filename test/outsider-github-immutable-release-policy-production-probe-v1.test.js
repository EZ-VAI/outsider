import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createGitHubImmutableReleasePolicyProductionProbeV1 }
  from "../src/outsider-github-immutable-release-policy-production-probe-v1.js";

const TOKEN = "github_pat_outsider_administration_read_123456789";

function createProbe(fetchImpl, overrides = {}) {
  return createGitHubImmutableReleasePolicyProductionProbeV1({
    apiToken: TOKEN,
    administrationReadCapabilityConfirmed: true,
    owner: "outsider",
    repository: "public-recovery",
    fetchImpl,
    ...overrides,
  });
}

function policyFetch(input = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/actions/permissions")) {
      const status = input.administrationStatus ?? 200;
      return status === 200
        ? Response.json({ enabled: true, allowed_actions: "all" })
        : Response.json({ message: status === 403 ? "Forbidden" : "Not Found" },
          { status });
    }
    if (url.endsWith("/immutable-releases")) {
      if (input.immutableEnabled === true) {
        return Response.json({ enabled: true, enforced_by_owner: true });
      }
      return Response.json({ message: "Not Found" }, { status: 404 });
    }
    throw new Error(`unexpected policy URL ${url}`);
  };
  return { calls, fetchImpl };
}

test("same-token admin 200 then immutable 404 produces disabled observation", async () => {
  const selected = policyFetch();
  const capability = createProbe(selected.fetchImpl);
  const outer = new AbortController();
  const result = await capability.probe({
    owner: "outsider",
    repository: "public-recovery",
    signal: outer.signal,
  });
  assert.equal(result.status, "DISABLED");
  assert.equal(result.administrationPreflightHttpStatus, 200);
  assert.equal(result.immutablePolicyHttpStatus, 404);
  assert.equal(result.observedHttpStatus, 404);
  assert.match(result.administrationPreflightResponseBodyHash,
    /^sha256:[a-f0-9]{64}$/u);
  assert.match(result.immutablePolicyResponseBodyHash,
    /^sha256:[a-f0-9]{64}$/u);
  assert.equal(result.capability,
    "GITHUB_REPOSITORY_ADMINISTRATION_READ");
  assert.equal(result.authorizationBasis,
    "SAME_CREDENTIAL_ADMINISTRATION_ENDPOINT_200");
  assert.match(result.observationReceipt, /^sha256:[a-f0-9]{64}$/u);
  const { observationReceipt, containsCredential, ...boundObservation } = result;
  assert.equal(observationReceipt, `sha256:${createHash("sha256")
    .update(Buffer.from(JSON.stringify(boundObservation), "utf8"))
    .digest("hex")}`,
  "receipt binds both preflight and immutable-policy statuses and body hashes");
  assert.equal(result.containsCredential, false);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.deepEqual(selected.calls.map((call) => call.url), [
    "https://api.github.com/repos/outsider/public-recovery/actions/permissions",
    "https://api.github.com/repos/outsider/public-recovery/immutable-releases",
  ]);
  assert.equal(selected.calls.every((call) =>
    new Headers(call.init.headers).get("authorization")
      === `Bearer ${TOKEN}`), true);
  assert.equal(selected.calls.every((call) =>
    new Headers(call.init.headers).get("x-github-api-version")
      === "2026-03-10"), true);
  assert.equal(selected.calls.every((call) =>
    call.init.signal instanceof AbortSignal), true);
});

for (const status of [403, 404]) {
  test(`admin preflight ${status} refuses to interpret immutable policy`,
    async () => {
      const selected = policyFetch({ administrationStatus: status });
      const capability = createProbe(selected.fetchImpl);
      await assert.rejects(capability.probe({ owner: "outsider",
        repository: "public-recovery" }), (error) => {
        assert.equal(error.outsiderCode,
          "ADMINISTRATION_READ_PREFLIGHT_FAILED");
        return true;
      });
      assert.equal(selected.calls.length, 1);
      assert.equal(selected.calls[0].url.endsWith("/actions/permissions"), true);
    });
}

test("enabled policy stays enabled and cannot be converted into capacity", async () => {
  const selected = policyFetch({ immutableEnabled: true });
  const capability = createProbe(selected.fetchImpl);
  const result = await capability.probe({ owner: "outsider",
    repository: "public-recovery" });
  assert.equal(result.status, "ENABLED");
  assert.equal(result.administrationPreflightHttpStatus, 200);
  assert.equal(result.immutablePolicyHttpStatus, 200);
});

test("constructor acknowledgement remains a gate but is not the evidence", () => {
  assert.throws(() => createGitHubImmutableReleasePolicyProductionProbeV1({
    apiToken: TOKEN,
    owner: "outsider",
    repository: "public-recovery",
    fetchImpl: policyFetch().fetchImpl,
  }), /CONFIG_INVALID/u);
});

test("policy response body consumption is hard-bounded and abortable", async () => {
  let observedSignal;
  const capability = createProbe(async (_url, init) => {
    observedSignal = init.signal;
    return {
      ok: true,
      status: 200,
      async arrayBuffer() { return new Promise(() => {}); },
    };
  }, { requestTimeoutMs: 5 });
  await assert.rejects(capability.probe({ owner: "outsider",
    repository: "public-recovery" }), (error) => {
    assert.equal(error.outsiderCode, "REQUEST_TIMEOUT");
    return true;
  });
  assert.equal(observedSignal.aborted, true);

  assert.throws(() => createProbe(async () => new Response(null), {
    requestTimeoutMs: 60_001,
  }), /CONFIG_INVALID/u);
});
