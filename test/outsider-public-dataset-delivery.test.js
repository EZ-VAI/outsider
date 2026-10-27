import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { normalizePublicDataset, publicDatasetHash as digest } from "../src/outsider-public-dataset.js";
import { buildDatasetReadServiceModule } from "../src/outsider-dataset-read-service.js";
import { compilePublicDatasetDelivery, createPublicDatasetDeliveryRuntime } from "../src/outsider-public-dataset-delivery.js";
import { writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
import { selectNativeServiceNetwork, normalizeDatasetDeliveryInput } from "../src/outsider-native-service-network.js";

const records = Array.from({ length: 7 }, (_, index) => ({ id: `resource-${index}`, value: `public resource ${index}` }));
const now = "2026-09-06T16:00:00.000Z";
function preparation(selectedNetwork = null) {
  return compilePublicDatasetDelivery({ request: { requestId: "fixture-joined-success", goal: "A live public dataset and exact portable copy",
    completionDeadline: "2026-09-06T16:20:00.000Z" }, dataset: { visibility: "PUBLIC", records }, createdAt: now,
    profile: { retentionMs: 7200000, permissionGrantHash: `sha256:${"1".repeat(64)}`,
      zeroCostScope: { confirmed: true, refHash: `sha256:${"1".repeat(64)}`, expiresAt: "2026-09-13T00:00:00.000Z" },
      github: { owner: "fixture-owner", repository: "fixture-repo", credentialsFile: "/fixture/account.json", administrationReadCapabilityConfirmed: true },
      cloudflare: { workersCredentialsFile: "/fixture/account.json", d1TokenFile: "/fixture/token", accountId: "a".repeat(32), workersDevSubdomain: "fixture" } },
    simulationTerms: { amount: { currency: "USD", minorUnits: "5000" }, paymentDueWithinSeconds: 86400 }, selectedNetwork });
}
const candidates = [["cloudflare", "EXISTING_ACCOUNT"], ["neon", "ACCOUNTLESS"]].map(([providerRef, accountMode]) => ({
  candidateId: providerRef, adapterId: `${providerRef}_bundle`, providerRef, accountMode,
  interfaceObserved: true, ownerAccessAvailable: true, capabilities: ["PUBLIC_DATASET_SERVICE_V1"],
  offerValidUntil: "2026-09-06T16:05:00.000Z", resourceUsableUntil: "2026-09-09T00:00:00.000Z" }));
function network(primaryAccount = "ACCOUNTLESS") { return { ...selectNativeServiceNetwork({ candidates,
  policy: { primaryAccount, independentlyQueryableReplica: true }, requiredUntil: "2026-09-06T18:20:00.000Z", now }),
  discovery: { coverage: "FIXTURE_NOT_LIVE" } }; }
test("the same observed candidates bind different real executor roles under different user policies", () => {
  assert.equal(network().primary.providerRef, "neon");
  assert.equal(network("EXISTING_ACCOUNT").primary.providerRef, "cloudflare");
  assert.equal(network().bindings.primary_bundle, "neon_bundle");
  assert.equal(selectNativeServiceNetwork({ candidates: candidates.filter(c => c.providerRef === "neon"),
    policy: network().policy, requiredUntil: "2026-09-06T18:20:00.000Z", now }).state, "UNAVAILABLE");
  assert.equal(preparation(network()).compilation.program.nodes.length, 3);
  assert.equal(normalizeDatasetDeliveryInput({ visibility: "PUBLIC", records, networkPolicy: network().policy }).networkPolicy.primaryAccount, "ACCOUNTLESS");
});

test("caller inputs, joint-state DAG and financial draft are bound before provider work", () => {
  const value = preparation();
  assert.equal(value.compilation.program.nodes.length, 3);
  assert.equal(value.compilation.program.requirements.length, 5);
  assert.equal(value.dataset.records.length, 7);
  assert.equal(value.contractDraft.outcomeProgramHash, value.compilation.program.programHash);
  assert.equal(value.contractDraft.guaranteeCreated, false);
  assert.equal(value.recoveryRehearsalRequested, false);
  assert.throws(() => normalizePublicDataset({ visibility: "PRIVATE", records }), /INPUT_INVALID/);
});

test("deployed reader returns live database bytes without embedding caller records", async () => {
  const ordered = normalizePublicDataset({ visibility: "PUBLIC", records }).records;
  const module = buildDatasetReadServiceModule({ recordsHash: digest(ordered), recordCount: ordered.length,
    expiresAt: "2099-09-06T18:00:00.000Z" });
  assert.equal(module.includes(Buffer.from(records[0].value)), false);
  const worker = await import(`data:text/javascript;base64,${module.toString("base64")}`);
  const response = await worker.default.fetch(new Request("https://fixture.workers.dev/"), {
    OUTSIDER_DB: { prepare: () => ({ all: async () => ({ success: true, results: ordered }) }) } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), ordered);
});

for (const selectedNetwork of [null, network(), network("EXISTING_ACCOUNT")]) test(`normal delivery executes selected providers: ${selectedNetwork?.policy.primaryAccount ?? "legacy"}`, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-dataset-success-")), p = preparation(selectedNetwork), calls = [];
  const primaryUrl = "https://outsider-data-fixture.fixture.workers.dev/";
  const neonUrl = "https://ep-fixture.apirest.us-east-2.aws.neon.tech/neondb/rest/v1/outsider_records?select=id,value&order=id.asc";
  const backupUrl = "https://github.com/fixture-owner/fixture-repo/releases/download/outsider-recovery-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/artifact-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bin";
  const runtime = createPublicDatasetDeliveryRuntime({ directory, preparation: p }, {
    clock: () => now,
    credentials: { cloudflare: { apiToken: "fixture-token" }, githubReleaseAsset: { contentsWriteApiToken: "fixture_token_12345678901234567890", administrationReadApiToken: "fixture_token_12345678901234567890" } },
    createD1: ({ directory: root }) => ({
      async reserve() { calls.push("allocate-d1"); const operationRefHash = `sha256:${"2".repeat(64)}`;
        const source = digest({ operationRefHash, kind: "CREATE" }).slice(7);
        mkdirSync(path.join(root, source), { recursive: true, mode: 0o700 });
        writeOnce(path.join(root, source, "source.json"), { bodyBase64: Buffer.from(JSON.stringify({ result: { uuid: "11111111-2222-3333-4444-555555555555" } })).toString("base64") });
        return { status: "RESERVED", reservationId: "fixture:d1", validUntil: "2026-09-13T00:00:00.000Z",
          providerReceipt: "fixture:d1", adapterState: { operationRefHash } }; },
      async execute() { assert.ok(calls.includes("allocate-neon")); assert.ok(calls.includes("allocate-worker"));
        assert.ok(calls.includes("allocate-github")); calls.push("write-d1");
        return { status: "SUCCEEDED", recordsHash: p.recordsHash, providerReceipt: "fixture:written" }; },
      release() { throw new Error("must retain delivered data"); },
    }),
    createNeon: () => ({ async reserve() { calls.push("allocate-neon"); return { status: "RESERVED",
      projectRefHash: `sha256:${"3".repeat(64)}`, validUntil: "2026-09-09T16:00:00.000Z", providerReceipt: "fixture:neon" }; },
      async writePublicDataset() { if (!selectedNetwork) throw new Error("normal success must not force recovery"); calls.push("write-neon"); return { status: "SUCCEEDED" }; },
      async publishPublicRead() { calls.push("publish-neon"); return { status: "SUCCEEDED", routeUrl: neonUrl }; },
      publicReadUrl: async () => neonUrl, publicAnonymousTokenUrl: async () => "https://fixture-token.neon.tech/public",
      clear() { throw new Error("keep standby"); } }),
    createEndpoint: config => ({ routeUrl: primaryUrl, async reserve() { calls.push("allocate-worker");
      if (selectedNetwork) assert.equal(config.neonFallback, false);
      return { status: "RESERVED", reservationId: "fixture:worker", validUntil: "2026-09-06T18:20:00.000Z", providerReceipt: "fixture:worker" }; },
      release() { throw new Error("must retain delivered endpoint"); } }),
    createGitHub: () => ({ async reserve() { calls.push("allocate-github"); return { status: "RESERVED", reservationId: "fixture:github",
      validUntil: "2026-09-13T00:00:00.000Z", providerReceipt: "fixture:github", adapterState: { routeUrl: backupUrl } }; },
      execute() { throw new Error("normal success must not force failover"); }, release() { throw new Error("keep portable copy"); } }),
    createObserver: () => ({ async observe({ operationId, targetUrl }) { calls.push(`observe:${targetUrl}`);
      if (!operationId.endsWith("readiness")) assert.ok(calls.includes(targetUrl === neonUrl ? "publish-neon" : "write-d1"));
      return { status: 200, bodyHash: p.recordsHash, ...(targetUrl === neonUrl ? { canonicalJsonHash: p.recordsHash } : {}), measurementIds: [`fixture-${operationId}`] }; } }),
  });
  const result = await runtime.run();
  assert.equal(result.state, "SUCCEEDED", JSON.stringify(result.retry ?? null));
  assert.equal(result.program.committed, true);
  assert.equal(result.program.reservations.independent_read.capacityReserved, false);
  assert.equal(result.compensation.decision, "NO_SANDBOX_COMPENSATION");
  assert.equal(result.delivery.primaryUrl, selectedNetwork?.primary.providerRef === "neon" ? neonUrl : primaryUrl);
  assert.equal(result.delivery.portableCopyUrl, backupUrl);
  assert.equal(result.recoveryRouteExercised, false);
  assert.equal(result.forcedFailurePerformed, false);
  assert.equal(result.program.nodes.world_state_acceptance.witness.observations.length, selectedNetwork ? 3 : 2);
  assert.equal(calls.filter(c => c === "allocate-neon").length, 1);
  assert.equal(calls.filter(c => c === "allocate-d1").length, 1);
  if (selectedNetwork) { assert.ok(calls.includes("write-neon")); assert.equal(result.delivery.servicesDependOnEachOtherAtReadTime, false); }
});
