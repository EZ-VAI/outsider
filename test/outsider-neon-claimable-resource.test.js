import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createNeonClaimableResource } from "../src/outsider-neon-claimable-resource.js";
const permissionGrantHash = `sha256:${"a".repeat(64)}`;
function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-neon-test-"));
  let registrations = 0, inserts = 0, rows = [], dropped = false;
  const fetchImpl = async (url, options) => {
    let result;
    if (url.endsWith("/identity")) {
      registrations++;
      result = { identity_assertion: "fixture-secret", project: { id: "fixture-project", branch_id: "br-fixture",
        expires_at: "2026-09-09T00:00:00.000Z" }, capabilities: [{ capability: "postgres", granted: true }] };
    } else if (url.endsWith("/token")) result = { access_token: "fixture-access" };
    else if (url.endsWith("/credentials")) result = { database_url: "postgresql://fixture:secret@ep-fixture.us-east-1.aws.neon.tech/neondb" };
    else if (url.endsWith("/sql")) {
      const { query, params } = JSON.parse(options.body);
      if (query.startsWith("INSERT")) { inserts++; rows = [[params[0],params[1]],[params[2],params[3]],[params[4],params[5]]]; }
      if (query.startsWith("DROP")) { dropped = true; rows = []; }
      result = { rows: query.startsWith("SELECT 1") ? [["1"]] : query.startsWith("SELECT id") ? rows
        : query.startsWith("SELECT to_regclass") ? [[dropped ? null : "outsider_records"]] : [] };
    } else throw new Error("Unexpected route");
    return Response.json(result);
  };
  const config = { directory, permissionGrantHash, fetchImpl, clock: () => "2026-09-06T00:00:00.000Z" };
  return { config, adapter: createNeonClaimableResource(config), counts: () => ({ registrations, inserts }) };
}
test("accountless capacity cold replay never registers twice", async () => {
  const f = fixture();
  assert.equal((await f.adapter.reserve()).status, "RESERVED");
  assert.equal((await createNeonClaimableResource(f.config).reserve()).status, "RESERVED");
  assert.equal(f.counts().registrations, 1);
});
test("exact restore reconciles insert and distinguishes data cleanup from project deletion", async () => {
  const f = fixture(); await f.adapter.reserve();
  const input = { records: ["a","b","c"].map(id => ({ id, value: "synthetic" })), recordSourceRefHash: permissionGrantHash };
  assert.equal((await f.adapter.restore(input)).recordCount, 3);
  await createNeonClaimableResource(f.config).restore(input);
  assert.equal(f.counts().inserts, 1);
  const cleanup = await f.adapter.clear();
  assert.equal(cleanup.dataCleared, true); assert.equal(cleanup.projectDeleted, false);
  await assert.rejects(() => f.adapter.restore(input), /ALREADY_CLEARED/u);
});
test("ambiguous registration cannot mint another resource after process restart", async () => {
  const f = fixture(); let calls = 0;
  const config = { ...f.config, fetchImpl: async () => { calls++; throw new Error("connection lost"); } };
  await assert.rejects(() => createNeonClaimableResource(config).reserve(), /TRANSPORT_UNKNOWN/u);
  await assert.rejects(() => createNeonClaimableResource(config).reserve(), /UNKNOWN_NO_RETRY/u);
  assert.equal(calls, 1);
});
