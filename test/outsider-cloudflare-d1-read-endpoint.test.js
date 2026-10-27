import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import { writePrivateExecutionRecordOnce } from "../src/outsider-user-held-durable-execution-v2.js";
import { buildD1ReadEndpointModule, createCloudflareD1ReadEndpoint }
  from "../src/outsider-cloudflare-d1-read-endpoint.js";
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const records = [{ id: "a", value: "one" }, { id: "b", value: "two" }, { id: "c", value: "three" }];
const expectedRecordsHash = hash(canonicalizeStrict(records));
const expiresAt = "2099-01-01T00:00:00.000Z";
const importModule = async bytes => (await import(`data:text/javascript;base64,${bytes.toString("base64")}`)).default;

test("public Worker queries current D1 on every GET, never serves embedded seed, and expires", async () => {
  const bytes = buildD1ReadEndpointModule({ expectedRecordsHash, expiresAt });
  assert.equal(bytes.toString().includes('"one"'), false);
  const worker = await importModule(bytes); let calls = 0; let current = records;
  const env = { OUTSIDER_DB: { prepare(sql) {
    assert.equal(sql, "SELECT id, value FROM outsider_records ORDER BY id");
    return { async all() { calls++; return { success: true, results: current }; } };
  } } };
  const request = new Request("https://fixture.workers.dev/");
  const first = await worker.fetch(request, env);
  assert.equal(first.status, 200); assert.equal(hash(await first.text()), expectedRecordsHash);
  assert.match(first.headers.get("cache-control"), /no-store/);
  current = records.map((row, index) => index ? row : { ...row, value: "changed" });
  assert.equal((await worker.fetch(request, env)).status, 409); assert.equal(calls, 2);
  const expired = await importModule(buildD1ReadEndpointModule({ expectedRecordsHash, expiresAt: "2020-01-01T00:00:00Z" }));
  assert.equal((await expired.fetch(request, env)).status, 410); assert.equal(calls, 2);
});

test("native upload binds only receipt-owned D1, exposes exact dynamic route, and deletes only its script", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-d1-reader-"));
  const accountId = "a".repeat(32), databaseId = "11111111-2222-3333-4444-555555555555";
  const databaseCreateReceiptFile = path.join(directory, "create.json");
  writePrivateExecutionRecordOnce(databaseCreateReceiptFile, {
    method: "POST", path: `/client/v4/accounts/${accountId}/d1/database`, status: 200,
    bodyBase64: Buffer.from(JSON.stringify({ success: true, result: { uuid: databaseId } })).toString("base64") });
  let active = false, moduleBytes, scriptPath, metadata, deletes = 0, publicReads = 0;
  const fetchImpl = async (url, options) => {
    if (new URL(url).hostname.endsWith(".workers.dev")) {
      assert.equal(options.headers.authorization, undefined); publicReads++;
      return (await importModule(moduleBytes)).fetch(new Request(url), {
        OUTSIDER_DB: { prepare: () => ({ all: async () => ({ success: true, results: records }) }) } });
    }
    assert.equal(options.headers.authorization, "Bearer FIXTURE_ONLY");
    const pathname = new URL(url).pathname;
    if (options.method === "PUT") {
      scriptPath = pathname; metadata = JSON.parse(options.body.get("metadata"));
      assert.equal(metadata.main_module, "worker.js");
      assert.deepEqual(metadata.bindings, [{ type: "d1", name: "OUTSIDER_DB", id: databaseId }]);
      assert.equal(options.headers["content-type"], undefined);
      moduleBytes = Buffer.from(await options.body.get("worker.js").arrayBuffer());
      active = true; return Response.json({ success: true, result: {} });
    }
    if (!active) return Response.json({ success: false }, { status: 404 });
    if (pathname.endsWith("/settings")) return Response.json({ success: true, result: { bindings: metadata.bindings } });
    if (pathname.endsWith("/subdomain")) return Response.json({ success: true, result: { enabled: true } });
    assert.equal(pathname, scriptPath);
    if (options.method === "DELETE") { deletes++; active = false; return Response.json({ success: true }); }
    return new Response(moduleBytes);
  };
  const endpoint = createCloudflareD1ReadEndpoint({ directory: path.join(directory, "endpoint"),
    accountId, getApiToken: () => "FIXTURE_ONLY", workersDevSubdomain: "outsider-fixture",
    databaseCreateReceiptFile, expectedRecordsHash, namespace: "fixture", expiresAt, syntheticData: true, fetchImpl });
  assert.equal((await endpoint.deploy()).status, "DEPLOYED");
  const observed = await endpoint.read(); assert.equal(observed.status, "SATISFIED");
  assert.equal(observed.providerObservationIndependent, false); assert.equal(publicReads, 1);
  assert.equal((await endpoint.release()).status, "RELEASED");
  assert.equal((await endpoint.release()).databaseDeleted, false); assert.equal(deletes, 1);
});
