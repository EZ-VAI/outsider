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
  OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V3_BOUNDARY,
  runBraveOneUseTenderProductionProbeV3,
} from "../src/outsider-brave-one-use-tender-production-probe-v3.js";
import { OUTSIDER_BRAVE_SELLER_ORIGIN_DISCOVERY_NODE_V2_BOUNDARY }
  from "../src/outsider-brave-seller-origin-discovery-node-v2.js";
import { main as runProbeCliV3 }
  from "../scripts/outsider-brave-one-use-tender-production-probe-v3.mjs";

const PUBLIC_V4 = "93.184.216.34";
const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;

function references(label) {
  const delegationEvidenceRefHash = h(`${label}-delegation-evidence`);
  const delegationEdgeHash = h(`${label}-delegation-edge`);
  return {
    requestScopeRefHash: h(`${label}-private-request-scope`),
    workOrderHash: h(`${label}-work-order`),
    typedGraph: {
      principalEpoch: { principalRefHash: h(`${label}-principal`),
        epochRefHash: h(`${label}-principal-epoch`),
        principalEpochProjectionHash: h(`${label}-principal-projection`) },
      accountableDeployment: {
        deploymentLineageRefHash: h(`${label}-deployment-lineage`),
        deploymentRevisionHash: h(`${label}-deployment-revision`),
        accountableDeploymentSubjectHash: h(`${label}-deployment-subject`) },
      runtime: { runtimeInstanceRefHash: h(`${label}-runtime-ref`),
        runtimeInstanceHash: h(`${label}-runtime`) },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash, delegationEdgeHash },
      episode: { episodeHash: h(`${label}-episode`),
        networkCompleteEpisodeJoinHash: h(`${label}-episode-join`) },
      attempt: { attemptHash: h(`${label}-attempt`),
        attemptActorSubjectHash: h(`${label}-attempt-actor`) },
    },
    authorizationBinding: {
      actorIdentityEnvelopeHash: h(`${label}-actor-envelope`),
      delegationEvidenceRefHash,
      delegationEdgeHash,
      authorityScopeRefHash: h(`${label}-authority-scope`),
      resourceOwnerAuthorizationRefHash: h(`${label}-owner-authorization`),
      rightsPrivacyPolicyRefHash: h(`${label}-rights-privacy-policy`),
    },
    subjectRefHash: h(`${label}-private-subject`),
    regionRefHash: h(`${label}-private-region`),
    consequenceEnvelopeRefHash: h(`${label}-consequence`),
    affectedChannelRefHashes: [h(`${label}-affected-channel`)],
  };
}

function compiledInput(label) {
  const now = Date.now();
  return compileBraveProductionProbeInputV1({
    requestId: label,
    query: "global outcome supplier with a public acquisition interface",
    currentTime: new Date(now - 1_000).toISOString(),
    formationDeadline: new Date(now + 60_000).toISOString(),
    completionDeadline: new Date(now + 120_000).toISOString(),
    references: references(label),
    exactCallerContactAuthorityRefHash: null,
  });
}

function braveJson(results) {
  return {
    status: 200,
    headers: { get() { return null; } },
    async text() {
      return JSON.stringify({ type: "search", web: { results } });
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

function baseDependencies(braveFetchImpl, sellerCalls = []) {
  return {
    apiToken: "PRIVATE_BRAVE_TOKEN_V3",
    braveFetchImpl,
    braveTimeoutMs: 1_000,
    descriptorTransportConfig: {
      async lookupImpl() {
        return [{ address: PUBLIC_V4, family: 4 }];
      },
      async requestImpl(request) {
        sellerCalls.push(request.url);
        return sellerResponse(404, "not found", "text/plain");
      },
    },
    descriptorTimeoutMs: 1_000,
  };
}

test("v2 node preserves every Brave SOURCE_* receipt without seller I/O",
  async () => {
    for (const [status, expected] of [
      [401, "SOURCE_PERMISSION_DENIED"],
      [429, "SOURCE_RATE_LIMITED"],
      [408, "SOURCE_TIMEOUT"],
      [422, "SOURCE_MALFORMED"],
      [500, "SOURCE_TRANSPORT_UNAVAILABLE"],
    ]) {
      const sellerCalls = [];
      let braveCalls = 0;
      const result = await runBraveOneUseTenderProductionProbeV3(
        compiledInput(`v3-source-${status}`), baseDependencies(async () => {
          braveCalls += 1;
          return { status, headers: { get() { return null; } },
            async text() { return "PRIVATE_SOURCE_BODY"; } };
        }, sellerCalls));
      assert.equal(braveCalls, 1);
      assert.deepEqual(sellerCalls, []);
      assert.equal(result.status, "NO_DISCOVERY_CANDIDATE");
      assert.equal(result.failureCode, expected);
      assert.equal(result.braveRequestAttemptCount, 1);
      assert.equal(result.selectedCandidateCount, 0);
      assert.equal(result.sellerOriginLeaseClaimCount, 0);
      assert.equal(result.tenderPostAttemptCount, 0);
      assert.equal(result.paymentAttemptCount, 0);
      assert.equal(result.humanQueueCreated, false);
      assert.equal(JSON.stringify(result).includes("PRIVATE_SOURCE_BODY"),
        false);
    }
  });

test("a successful empty Brave result becomes explicit NODE_DECLARED_FAILURE",
  async () => {
    const sellerCalls = [];
    const result = await runBraveOneUseTenderProductionProbeV3(
      compiledInput("v3-empty"), baseDependencies(async () => braveJson([]),
        sellerCalls));
    assert.deepEqual(sellerCalls, []);
    assert.equal(result.status, "NO_DISCOVERY_CANDIDATE");
    assert.equal(result.failureCode, "NODE_DECLARED_FAILURE");
    assert.equal(result.braveRequestAttemptCount, 1);
    assert.equal(result.selectedCandidateCount, 0);
    assert.equal(result.sellerOriginLeaseClaimCount, 0);
    assert.equal(result.sellerDescriptorProbeInvocationCount, 0);
    assert.equal(result.sellerWebNativeFallbackInvocationCount, 0);
    assert.equal(result.humanQueueCreated, false);
  });

test("one source candidate issues and consumes exactly one opaque origin lease",
  async () => {
    const sellerCalls = [];
    const result = await runBraveOneUseTenderProductionProbeV3(
      compiledInput("v3-one-candidate"), baseDependencies(async () =>
        braveJson([{ title: "PRIVATE_TITLE",
          url: "https://seller.example.com/private/catalog",
          description: "PRIVATE_DESCRIPTION" }]), sellerCalls));
    assert.equal(sellerCalls.length, 2);
    assert.equal(result.braveRequestAttemptCount, 1);
    assert.equal(result.selectedCandidateCount, 1);
    assert.equal(result.sellerOriginLeaseClaimCount, 1);
    assert.equal(result.sellerDescriptorProbeInvocationCount, 1);
    assert.equal(result.sellerWebNativeFallbackInvocationCount, 1);
    assert.equal(result.tenderPostAttemptCount, 0);
    assert.equal(result.paymentAttemptCount, 0);
    const durable = JSON.stringify(result);
    for (const canary of ["PRIVATE_BRAVE_TOKEN_V3", "PRIVATE_TITLE",
      "PRIVATE_DESCRIPTION", "seller.example.com", "/private/catalog"]) {
      assert.equal(durable.includes(canary), false, canary);
    }
    assert.equal(OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_V3_BOUNDARY
      .braveSellerOriginDiscoveryNode,
    OUTSIDER_BRAVE_SELLER_ORIGIN_DISCOVERY_NODE_V2_BOUNDARY);
  });

test("v3 CLI appends the exact source failure to a 0600 transcript",
  async (t) => {
    const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
      "outsider-brave-v3-cli-")));
    chmodSync(directory, 0o700);
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const inputFile = path.join(directory, "input.json");
    const capabilityFile = path.join(directory, "capability.json");
    const transcriptFile = path.join(directory, "transcript.jsonl");
    writeFileSync(inputFile,
      `${canonicalizeStrict(compiledInput("v3-cli-source-failure"))}\n`,
      { mode: 0o600 });
    writeFileSync(capabilityFile, `${canonicalizeStrict({
      schema: "outsider/brave-search-api-capability/v1",
      schemaVersion: "1.0.0",
      apiToken: "PRIVATE_CLI_TOKEN_V3",
    })}\n`, { mode: 0o600 });
    const output = [];
    const result = await runProbeCliV3([
      "probe", "--input", inputFile, "--capability", capabilityFile,
      "--transcript", transcriptFile,
    ], {
      braveFetchImpl: async () => ({ status: 403,
        headers: { get() { return null; } }, async text() { return ""; } }),
      descriptorTransportConfig: {},
      writeOutput: (value) => output.push(value),
      writeError: () => assert.fail("declared source failure is a projection"),
    });
    assert.equal(result.failureCode, "SOURCE_PERMISSION_DENIED");
    assert.equal(statSync(transcriptFile).mode & 0o777, 0o600);
    const stored = readFileSync(transcriptFile, "utf8");
    assert.equal(stored, output.join(""));
    assert.equal(stored.includes("PRIVATE_CLI_TOKEN_V3"), false);
    assert.equal(JSON.parse(stored).failureCode,
      "SOURCE_PERMISSION_DENIED");
  });
