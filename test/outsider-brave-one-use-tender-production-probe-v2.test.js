import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { compileBraveProductionProbeInputV1 }
  from "../src/outsider-brave-production-probe-input-compiler-v1.js";
import {
  OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V2_BOUNDARY,
  runBraveOneUseTenderProductionProbeV2,
} from "../src/outsider-brave-one-use-tender-production-probe-v2.js";
import { main as runProbeCliV2 }
  from "../scripts/outsider-brave-one-use-tender-production-probe-v2.mjs";

const PUBLIC_V4 = "93.184.216.34";
const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;

function references() {
  const delegationEvidenceRefHash = h("v2-delegation-evidence");
  const delegationEdgeHash = h("v2-delegation-edge");
  return {
    requestScopeRefHash: h("v2-private-request-scope"),
    workOrderHash: h("v2-work-order"),
    typedGraph: {
      principalEpoch: { principalRefHash: h("v2-principal"),
        epochRefHash: h("v2-principal-epoch"),
        principalEpochProjectionHash: h("v2-principal-epoch-projection") },
      accountableDeployment: {
        deploymentLineageRefHash: h("v2-deployment-lineage"),
        deploymentRevisionHash: h("v2-deployment-revision"),
        accountableDeploymentSubjectHash: h("v2-deployment-subject") },
      runtime: { runtimeInstanceRefHash: h("v2-runtime-ref"),
        runtimeInstanceHash: h("v2-runtime") },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash, delegationEdgeHash },
      episode: { episodeHash: h("v2-episode"),
        networkCompleteEpisodeJoinHash: h("v2-episode-join") },
      attempt: { attemptHash: h("v2-attempt"),
        attemptActorSubjectHash: h("v2-attempt-actor") },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: h("v2-actor-envelope"),
      delegationEvidenceRefHash, delegationEdgeHash,
      authorityScopeRefHash: h("v2-authority-scope"),
      resourceOwnerAuthorizationRefHash: h("v2-owner-authorization"),
      rightsPrivacyPolicyRefHash: h("v2-rights-privacy-policy"),
    },
    subjectRefHash: h("v2-private-subject"),
    regionRefHash: h("v2-private-region"),
    consequenceEnvelopeRefHash: h("v2-consequence"),
    affectedChannelRefHashes: [h("v2-affected-channel")],
  };
}

function compiledInput(label = "v2-probe", deadlines = {}) {
  const now = Date.now();
  return compileBraveProductionProbeInputV1({
    requestId: label,
    query: deadlines.query
      ?? "global outcome supplier with a public acquisition interface",
    currentTime: deadlines.currentTime ?? new Date(now).toISOString(),
    formationDeadline: deadlines.formationDeadline
      ?? new Date(now + 30 * 60_000).toISOString(),
    completionDeadline: deadlines.completionDeadline
      ?? new Date(now + 24 * 3600_000).toISOString(),
    references: references(),
    exactCallerContactAuthorityRefHash: null,
  });
}

function braveResponse() {
  return {
    status: 200,
    headers: { get() { return null; } },
    async text() {
      return JSON.stringify({ type: "search", web: { results: [{
        title: "PRIVATE_RESULT_TITLE",
        url: "https://seller.example.com/catalog",
        description: "PRIVATE_RESULT_DESCRIPTION",
      }] } });
    },
  };
}

function sellerResponse(status, body, contentType) {
  const bytes = Buffer.from(body, "utf8");
  return {
    status,
    headers: { "content-type": contentType,
      "content-length": String(bytes.length) },
    body: bytes,
    remoteAddress: PUBLIC_V4,
    remoteFamily: "IPv4",
    tlsAuthorized: true,
    tlsServernameVerified: true,
    tlsCertificateHostnameVerified: true,
  };
}

function dependencies(calls, sellerHandler) {
  return {
    apiToken: "PRIVATE_BRAVE_TOKEN",
    braveFetchImpl: async () => {
      calls.push("BRAVE_GET");
      return braveResponse();
    },
    braveTimeoutMs: 1_000,
    descriptorTransportConfig: {
      async lookupImpl() {
        return [{ address: PUBLIC_V4, family: 4 }];
      },
      async requestImpl(request) {
        calls.push(request.url.endsWith("/.well-known/outsider")
          ? "DESCRIPTOR_GET" : "WEB_ROOT_GET");
        return sellerHandler(request);
      },
    },
    descriptorTimeoutMs: 1_000,
  };
}

function compatibleDescriptor(input) {
  return JSON.stringify({
    schema: "https://outsider.network/schemas/transaction-interface/v1",
    version: "1.0.0",
    expiresAt: new Date(Date.parse(input.descriptorAsOf) + 60_000)
      .toISOString(),
    machineUse: true,
    oneUseTender: { accepted: true,
      endpoint: "https://seller.example.com/outsider/v1/tenders",
      method: "POST", contentType: "application/json" },
  });
}

function assertPrivacyAndHold(result) {
  const serialized = JSON.stringify(result);
  for (const canary of ["PRIVATE_BRAVE_TOKEN", "seller.example.com",
    "PRIVATE_RESULT_TITLE", "PRIVATE_RESULT_DESCRIPTION",
    "global outcome supplier", "sales@seller.example.com", "/request-quote"]) {
    assert.equal(serialized.includes(canary), false, canary);
  }
  assert.equal(result.tenderPostAttemptCount, 0);
  assert.equal(result.paymentAttemptCount, 0);
  assert.equal(result.providerAcceptanceEstablished, false);
  assert.equal(result.resourceOwnerAuthorityEstablished, false);
  assert.equal(result.capacityReserved, false);
  assert.equal(result.authority, "NONE");
  assert.equal(result.decisionState, "HOLD");
  assert.equal(result.humanQueueCreated, false);
}

test("one Brave candidate and one lease stop after a compatible descriptor",
  async () => {
    const input = compiledInput("v2-descriptor");
    const calls = [];
    const result = await runBraveOneUseTenderProductionProbeV2(input,
      dependencies(calls, () => sellerResponse(200,
        compatibleDescriptor(input), "application/json")));
    assert.deepEqual(calls, ["BRAVE_GET", "DESCRIPTOR_GET"]);
    assert.equal(result.status,
      "SELLER_OUTSIDER_INTERFACE_OBSERVED_POST_DISABLED");
    assert.equal(result.braveRequestAttemptCount, 1);
    assert.equal(result.selectedCandidateCount, 1);
    assert.equal(result.sellerOriginLeaseClaimCount, 1);
    assert.equal(result.secondBraveSearchRequestCount, 0);
    assert.equal(result.sellerDescriptorProbeInvocationCount, 1);
    assert.equal(result.sellerWebNativeFallbackInvocationCount, 0);
    assert.equal(result.compatibleSellerInterfaceCount, 1);
    assert.equal(result.selectedSurfaceFamily, "OUTSIDER_DESCRIPTOR");
    assert.equal(Object.isFrozen(result.postBlockers), true);
    assert.match(result.sellerReadOnlyProbe.descriptorProbe.sourceReplay.bodyHash,
      /^sha256:[a-f0-9]{64}$/u);
    assertPrivacyAndHold(result);
  });

test("descriptor miss falls through to Web-native surfaces without a second search",
  async () => {
    const input = compiledInput("v2-web-fallback");
    const calls = [];
    const html = `<form action="/request-quote" method="post"></form>
      <a href="mailto:sales@seller.example.com">mail</a>`;
    const result = await runBraveOneUseTenderProductionProbeV2(input,
      dependencies(calls, (request) => request.url
        .endsWith("/.well-known/outsider")
        ? sellerResponse(404, "not found", "text/plain")
        : sellerResponse(200, html, "text/html; charset=utf-8")));
    assert.deepEqual(calls, ["BRAVE_GET", "DESCRIPTOR_GET", "WEB_ROOT_GET"]);
    assert.equal(result.status,
      "SELLER_WEB_NATIVE_SURFACES_OBSERVED_POST_DISABLED");
    assert.equal(result.braveRequestAttemptCount, 1);
    assert.equal(result.sellerOriginLeaseClaimCount, 1);
    assert.equal(result.secondBraveSearchRequestCount, 0);
    assert.equal(result.sellerDescriptorProbeInvocationCount, 1);
    assert.equal(result.sellerWebNativeFallbackInvocationCount, 1);
    assert.equal(result.compatibleSellerInterfaceCount, 0);
    assert.equal(result.observedWebNativeSurfaceOccurrenceCount, 2);
    assert.equal(result.selectedSurfaceFamily, "WEB_NATIVE_OBSERVATION");
    assert.equal(result.sellerReadOnlyProbe.webNativeFallback.projection
      .sourceReplay.terminalStatus, 200);
    assertPrivacyAndHold(result);
  });

test("maximum formation window still falls through to the Web root",
  async () => {
    const input = compiledInput("v2-long-window", {
      formationDeadline: new Date(Date.now() + 24 * 3600_000).toISOString(),
      completionDeadline: new Date(Date.now() + 48 * 3600_000).toISOString(),
    });
    const calls = [];
    const result = await runBraveOneUseTenderProductionProbeV2(input,
      dependencies(calls, (request) => request.url
        .endsWith("/.well-known/outsider")
        ? sellerResponse(404, "not found", "text/plain")
        : sellerResponse(200, "<form action='/quote'></form>",
          "text/html; charset=utf-8")));
    assert.deepEqual(calls, ["BRAVE_GET", "DESCRIPTOR_GET", "WEB_ROOT_GET"]);
    assert.equal(result.status,
      "SELLER_WEB_NATIVE_SURFACES_OBSERVED_POST_DISABLED");
    assert.equal(result.sellerReadOnlyProbe.expiresAt,
      input.tender.formationDeadline);
    assert.equal(result.sellerReadOnlyProbe.webNativeFallback
      .observationExpiresAt, input.tender.formationDeadline);
    assert.equal(result.sellerReadOnlyProbe.webNativeFallback.projection
      .expiresAt, input.tender.formationDeadline);
  });

test("invalid seller transport fails before the single Brave request", async () => {
  const input = compiledInput("v2-invalid-transport");
  let braveCalls = 0;
  await assert.rejects(runBraveOneUseTenderProductionProbeV2(input, {
    apiToken: "PRIVATE_TOKEN",
    braveFetchImpl: async () => { braveCalls += 1; return braveResponse(); },
    braveTimeoutMs: 1_000,
    descriptorTransportConfig: { unsupportedOption: true },
    descriptorTimeoutMs: 1_000,
  }), /TRANSPORT_CONFIG_FIELDS_INVALID/u);
  assert.equal(braveCalls, 0);
});

test("compiler-valid but Brave-invalid query fails with an exact zero count",
  async () => {
    const input = compiledInput("v2-query-bound", { query: "q".repeat(401) });
    let braveCalls = 0;
    let failure;
    try {
      await runBraveOneUseTenderProductionProbeV2(input, {
        apiToken: "PRIVATE_TOKEN",
        braveFetchImpl: async () => { braveCalls += 1; return braveResponse(); },
        braveTimeoutMs: 1_000,
        descriptorTransportConfig: {}, descriptorTimeoutMs: 1_000,
      });
    } catch (error) { failure = error; }
    assert.equal(failure?.outsiderCode, "QUERY_TEXT_INVALID");
    assert.equal(failure?.braveRequestAttemptCount, 0);
    assert.equal(braveCalls, 0);
  });

test("seller transport dependencies are snapshotted before Brave awaits",
  async () => {
    const input = compiledInput("v2-transport-snapshot");
    const calls = [];
    const transportConfig = {
      async lookupImpl() {
        return [{ address: PUBLIC_V4, family: 4 }];
      },
      async requestImpl(request) {
        calls.push(request.url.endsWith("/.well-known/outsider")
          ? "DESCRIPTOR_GET" : "WEB_ROOT_GET");
        return request.url.endsWith("/.well-known/outsider")
          ? sellerResponse(404, "missing", "text/plain")
          : sellerResponse(200, "<form action='/quote'></form>",
            "text/html; charset=utf-8");
      },
    };
    const result = await runBraveOneUseTenderProductionProbeV2(input, {
      apiToken: "PRIVATE_TOKEN",
      braveFetchImpl: async () => {
        calls.push("BRAVE_GET");
        transportConfig.requestImpl = async () => {
          throw new Error("mutated transport must not enter claimed closure");
        };
        return braveResponse();
      },
      braveTimeoutMs: 1_000, descriptorTransportConfig: transportConfig,
      descriptorTimeoutMs: 1_000,
    });
    assert.deepEqual(calls, ["BRAVE_GET", "DESCRIPTOR_GET", "WEB_ROOT_GET"]);
    assert.equal(result.status,
      "SELLER_WEB_NATIVE_SURFACES_OBSERVED_POST_DISABLED");
  });

test("an exhausted descriptor budget does not overcount fallback invocation",
  async () => {
    const input = compiledInput("v2-timeout-count");
    const calls = [];
    const result = await runBraveOneUseTenderProductionProbeV2(input, {
      apiToken: "PRIVATE_TOKEN",
      braveFetchImpl: async () => { calls.push("BRAVE_GET");
        return braveResponse(); },
      braveTimeoutMs: 1_000,
      descriptorTransportConfig: {
        async lookupImpl() {
          return [{ address: PUBLIC_V4, family: 4 }];
        },
        async requestImpl() {
          calls.push("DESCRIPTOR_GET");
          return new Promise(() => {});
        },
      },
      descriptorTimeoutMs: 1,
    });
    assert.deepEqual(calls, ["BRAVE_GET", "DESCRIPTOR_GET"]);
    assert.equal(result.status, "SELLER_READ_ONLY_PROBE_FAILED");
    assert.equal(result.sellerDescriptorProbeInvocationCount, 1);
    assert.equal(result.sellerWebNativeFallbackInvocationCount, 0);
    assert.equal(result.sellerReadOnlyProbe.webNativeFallback.attempted, false);
    assert.equal(result.sellerReadOnlyProbe.webNativeFallback
      .requiredByDescriptorResult, true);
  });

test("a descriptor finishing after lease expiry cannot trigger a root GET",
  async () => {
    const now = Date.now();
    const input = compiledInput("v2-lease-expiry", {
      currentTime: new Date(now).toISOString(),
      formationDeadline: new Date(now + 500).toISOString(),
      completionDeadline: new Date(now + 60_000).toISOString(),
    });
    const calls = [];
    const result = await runBraveOneUseTenderProductionProbeV2(input, {
      apiToken: "PRIVATE_TOKEN",
      braveFetchImpl: async () => { calls.push("BRAVE_GET");
        return braveResponse(); },
      braveTimeoutMs: 1_000,
      descriptorTransportConfig: {
        async lookupImpl() {
          return [{ address: PUBLIC_V4, family: 4 }];
        },
        async requestImpl() {
          calls.push("DESCRIPTOR_GET");
          await new Promise((resolve) => setTimeout(resolve, 700));
          return sellerResponse(404, "late", "text/plain");
        },
      },
      descriptorTimeoutMs: 1_000,
    });
    assert.deepEqual(calls, ["BRAVE_GET", "DESCRIPTOR_GET"]);
    assert.equal(result.status, "SELLER_READ_ONLY_PROBE_FAILED");
    assert.equal(result.sellerWebNativeFallbackInvocationCount, 0);
    assert.equal(result.sellerReadOnlyProbe.webNativeFallback.attempted, false);
    assert.equal(result.sellerReadOnlyProbe.webNativeFallback.failureCode,
      "TIME_BUDGET_EXHAUSTED");
  });

test("no Brave result declines without probing a seller or creating a queue",
  async () => {
    const input = compiledInput("v2-empty");
    let braveCalls = 0;
    const result = await runBraveOneUseTenderProductionProbeV2(input, {
      apiToken: "PRIVATE_EMPTY_TOKEN",
      braveFetchImpl: async () => {
        braveCalls += 1;
        return { status: 200, headers: { get() { return null; } },
          async text() { return JSON.stringify({ type: "search",
            web: { results: [] } }); } };
      },
      braveTimeoutMs: 1_000,
      descriptorTransportConfig: {}, descriptorTimeoutMs: 1_000,
    });
    assert.equal(braveCalls, 1);
    assert.equal(result.status, "NO_DISCOVERY_CANDIDATE");
    assert.equal(result.sellerOriginLeaseClaimCount, 0);
    assert.equal(result.sellerDescriptorProbeInvocationCount, 0);
    assert.equal(result.sellerWebNativeFallbackInvocationCount, 0);
    assert.equal(result.humanQueueCreated, false);
    assert.equal(result.tenderPostAttemptCount, 0);
  });

test("v2 CLI reuses v1 0600 input/capability and appends one closed projection",
  async (t) => {
    const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
      "outsider-brave-v2-cli-")));
    chmodSync(directory, 0o700);
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const inputFile = path.join(directory, "probe-input-v1.json");
    const capabilityFile = path.join(directory, "brave-capability-v1.json");
    const transcriptFile = path.join(directory, "probe-v2.jsonl");
    const input = compiledInput("v2-cli");
    writeFileSync(inputFile, `${canonicalizeStrict(input)}\n`, { mode: 0o600 });
    writeFileSync(capabilityFile, `${canonicalizeStrict({
      schema: "outsider/brave-search-api-capability/v1",
      schemaVersion: "1.0.0", apiToken: "PRIVATE_CLI_TOKEN",
    })}\n`, { mode: 0o600 });
    const calls = [];
    const output = [];
    await runProbeCliV2([
      "probe", "--input", inputFile, "--capability", capabilityFile,
      "--transcript", transcriptFile,
    ], { ...dependencies(calls, (request) => request.url
      .endsWith("/.well-known/outsider")
      ? sellerResponse(404, "missing", "text/plain")
      : sellerResponse(200, "<form action='/book'></form>",
        "text/html; charset=utf-8")),
    writeOutput: (text) => output.push(text),
    writeError: () => assert.fail("v2 CLI should not write stderr") });
    assert.deepEqual(calls, ["BRAVE_GET", "DESCRIPTOR_GET", "WEB_ROOT_GET"]);
    assert.equal(statSync(transcriptFile).mode & 0o777, 0o600);
    const stored = readFileSync(transcriptFile, "utf8");
    assert.equal(stored, output.join(""));
    assert.equal(stored.includes("PRIVATE_CLI_TOKEN"), false);
    assert.equal(stored.includes("seller.example.com"), false);
    const parsed = JSON.parse(stored);
    assert.equal(parsed.secondBraveSearchRequestCount, 0);
    assert.equal(parsed.tenderPostAttemptCount, 0);
    assert.equal(parsed.paymentAttemptCount, 0);
  });

test("v2 declares no registry, POST, payment, or second-search path", () => {
  assert.equal(OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V2_BOUNDARY
    .secondBraveSearchPermitted, false);
  assert.equal(OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V2_BOUNDARY
    .tenderPostPermitted, false);
  assert.equal(OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V2_BOUNDARY
    .paymentPermitted, false);
  assert.equal(OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V2_BOUNDARY
    .providerRegistryCreated, false);
});
