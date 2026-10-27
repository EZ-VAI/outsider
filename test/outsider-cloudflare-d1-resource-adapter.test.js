import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCloudflareD1ResourceAdapter }
  from "../src/outsider-cloudflare-d1-resource-adapter.js";

const hash = digit => `sha256:${digit.repeat(64)}`;
const now = "2026-09-05T18:00:00.000Z";
const key = "fixture_secret_never_projected";
const rows = [{ id: "row-3", value: "synthetic spare" }, { id: "row-1", value: "synthetic primary" },
  { id: "row-2", value: "synthetic value '); DROP TABLE outsider_records; --" }];
const context = { program: { programHash: hash("1"), formationDeadline: "2026-09-05T18:03:00.000Z",
  completionDeadline: "2026-09-05T18:10:00.000Z" },
  requirement: { requirementId: "workspace-primary", capability: "D1_SYNTHETIC_THREE_RECORD_WORKSPACE",
    constraints: { recordCount: 3 } }, operationId: "reserve-1", permissionGrantHash: hash("2") };
const releaseContext = (reservation, ctx = context) => ({ reservation, program: ctx.program,
  requirementId: ctx.requirement.requirementId, permissionGrantHash: ctx.permissionGrantHash, operationId: "release-1" });
const response = (result, status = 200) => new Response(JSON.stringify({ success: status < 400, result }), {
  status, headers: { "content-type": "application/json" },
});
const queryResponse = results => response([{ success: true, results, meta: { rows_read: results.length, rows_written: 0 } }]);
function setup() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-d1-"));
  const calls = []; const databases = new Map();
  const state = { next: 1, loseCreate: false, loseWrite: false, loseDelete: false, deleteAccepted: true };
  const fetchImpl = async (url, init) => {
    assert.equal(init.headers.authorization, `Bearer ${key}`); assert.equal(init.redirect, "error");
    const endpoint = new URL(url);
    assert.equal(endpoint.origin, "https://api.cloudflare.com");
    assert.equal(endpoint.search, "");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path: endpoint.pathname, body });
    const base = `/client/v4/accounts/${"a".repeat(32)}/d1/database`;
    if (init.method === "POST" && endpoint.pathname === base) {
      const uuid = `00000000-0000-0000-0000-${String(state.next++).padStart(12, "0")}`;
      const db = { uuid, name: body.name, schema: false, records: [] }; databases.set(uuid, db);
      if (state.loseCreate) throw new Error("create response lost");
      return response({ uuid, name: db.name }, 201);
    }
    const match = endpoint.pathname.slice(base.length).match(/^\/([a-f0-9-]{36})(\/query)?$/u);
    assert.ok(match, "only task database endpoints allowed");
    const db = databases.get(match[1]);
    if (init.method === "GET") return db ? response({ uuid: db.uuid, name: db.name }) : response(null, 404);
    if (init.method === "DELETE") {
      if (state.deleteAccepted) databases.delete(match[1]);
      if (state.loseDelete) throw new Error("delete response lost");
      return response(null);
    }
    assert.equal(init.method, "POST"); assert.equal(match[2], "/query");
    if (!db) return response(null, 404);
    if (body.sql.startsWith("CREATE TABLE")) { assert.equal(db.schema, false); db.schema = true; return queryResponse([]); }
    if (body.sql.startsWith("INSERT INTO")) {
      assert.equal(db.schema, true); assert.equal(db.records.length, 0);
      assert.equal(body.params.length, 6); assert.equal(body.sql.includes("synthetic"), false);
      db.records = [0, 2, 4].map(i => ({ id: body.params[i], value: body.params[i + 1] }));
      if (state.loseWrite) throw new Error("write response lost");
      return queryResponse([]);
    }
    if (body.sql.startsWith("SELECT name FROM sqlite_master")) return queryResponse(db.schema ? [{ name: "outsider_records" }] : []);
    assert.equal(body.sql, "SELECT id, value FROM outsider_records ORDER BY id");
    assert.deepEqual(body.params, []);
    return queryResponse(db.records);
  };
  const config = { directory, accountId: "a".repeat(32), records: rows, syntheticData: true,
    getApiToken: async () => key, fetchImpl, clock: () => now,
    zeroCostScope: { confirmed: true, refHash: hash("3"), expiresAt: "2026-09-05T18:15:00.000Z" } };
  return { config, adapter: createCloudflareD1ResourceAdapter(config), calls, databases, state };
}
const mutations = fixture => fixture.calls.filter(call => call.method === "DELETE"
  || (call.method === "POST" && !call.body?.sql?.startsWith("SELECT")));
function files(root) {
  return readdirSync(root).flatMap(name => {
    const file = path.join(root, name); return statSync(file).isDirectory() ? files(file) : [file];
  });
}

test("owned D1 writes exact parameterized records, snapshots observed bytes, restores fresh resource and cleans exact UUIDs", async () => {
  const fixture = setup(); const primary = await fixture.adapter.reserve(context);
  assert.equal(primary.status, "RESERVED"); assert.equal(primary.sourceKind, "PROVIDER_FIXTURE");
  assert.equal(primary.automaticExpiry, false); assert.equal(primary.validUntilBasis, "LOCAL_TASK_HORIZON_NOT_PROVIDER_LEASE");
  const completed = await fixture.adapter.execute({ reservation: primary });
  assert.equal(completed.status, "SUCCEEDED"); assert.equal(completed.providerObservationIndependent, false);
  const snapshot = JSON.parse(completed.snapshotBytes);
  assert.equal(snapshot.sourceReadReceiptHash, completed.providerReceipt);
  assert.equal(completed.sourceReadReceiptHash, snapshot.sourceReadReceiptHash);
  assert.equal(snapshot.sourceDatabaseRefHash, primary.adapterState.databaseRefHash);
  assert.deepEqual(snapshot.records, [...rows].sort((a, b) => a.id.localeCompare(b.id)));
  assert.equal(completed.snapshotHash, `sha256:${createHash("sha256").update(completed.snapshotBytes).digest("hex")}`);
  assert.equal(completed.snapshotBytes.at(-1), "}".charCodeAt(0));
  // Caller is responsible for externally storing/fetching/verifying these exact
  // bytes. The driver exposes data provenance, not a pretend GitHub receipt.
  const recovery = createCloudflareD1ResourceAdapter({ ...fixture.config,
    adapterId: "cloudflare-d1-recovery", records: snapshot.records, recordSourceRefHash: completed.snapshotHash });
  const recoveryContext = { ...context, requirement: { ...context.requirement, requirementId: "workspace-recovery" } };
  const secondary = await recovery.reserve(recoveryContext);
  assert.notEqual(secondary.adapterState.databaseRefHash, primary.adapterState.databaseRefHash);
  const restored = await recovery.execute({ reservation: secondary });
  assert.equal(restored.recordsHash, completed.recordsHash);
  assert.equal(restored.recordSourceRefHash, completed.snapshotHash);
  assert.equal(fixture.databases.size, 2);
  assert.equal((await fixture.adapter.release(releaseContext(primary))).status, "RELEASED");
  assert.equal((await recovery.closeObligation(releaseContext(secondary, recoveryContext))).status, "CLOSED");
  assert.equal(fixture.databases.size, 0); assert.equal(mutations(fixture).length, 8);
  const projected = JSON.stringify({ primary, secondary, completed, restored });
  assert.equal(projected.includes(key), false); assert.equal(projected.includes(fixture.config.directory), false);
  for (const file of files(fixture.config.directory)) {
    assert.equal(statSync(file).mode & 0o777, 0o600); assert.equal(readFileSync(file, "utf8").includes(key), false);
  }
});

test("cold replay rereads current resources without duplicating mutations or allowing changed frozen inputs", async () => {
  const fixture = setup();
  assert.equal((await fixture.adapter.reconcileReserve(context)).reason, "NO_LOCAL_SUBMISSION");
  assert.equal(fixture.calls.length, 0);
  const reservation = await fixture.adapter.reserve(context);
  await fixture.adapter.execute({ reservation });
  const cold = createCloudflareD1ResourceAdapter(fixture.config);
  assert.equal((await cold.reserve(context)).reservationId, reservation.reservationId);
  assert.equal((await cold.execute({ reservation })).status, "SUCCEEDED");
  assert.equal(mutations(fixture).length, 3);
  await assert.rejects(cold.reserve({ ...context, operationId: "reserve-another" }), /LOCAL_RECORD_MISMATCH/u);
  const changed = createCloudflareD1ResourceAdapter({ ...fixture.config, records: rows.map(row => ({ ...row, value: "changed" })) });
  await assert.rejects(changed.execute({ reservation }), /RESERVATION_BINDING_MISMATCH/u);
  assert.equal(mutations(fixture).length, 3);
  const expired = setup(); expired.config.clock = () => "2026-09-05T18:20:00.000Z";
  await assert.rejects(createCloudflareD1ResourceAdapter(expired.config).reserve(context), /MUTATION_SCOPE_EXPIRED/u);
  assert.equal(expired.calls.length, 0);
});

test("lost create cannot acquire another DB; lost accepted write is cold-reconciled from exact SELECT", async () => {
  const unknown = setup(); unknown.state.loseCreate = true;
  await assert.rejects(unknown.adapter.reserve(context), error => error.recoverable && /CREATE_UNKNOWN_NO_RETRY/u.test(error.message));
  await assert.rejects(createCloudflareD1ResourceAdapter(unknown.config).reserve(context), /CREATE_UNKNOWN_NO_RETRY/u);
  await assert.rejects(unknown.adapter.reconcileReserve(context), /CREATE_UNKNOWN_NO_RETRY/u);
  assert.equal(mutations(unknown).length, 1); assert.equal(unknown.databases.size, 1);
  const written = setup(); const reservation = await written.adapter.reserve(context); written.state.loseWrite = true;
  const result = await written.adapter.execute({ reservation });
  assert.equal(result.status, "SUCCEEDED"); assert.equal(result.writeSubmissionAmbiguous, true);
  assert.equal(result.writeReceipt, null); assert.equal(result.reconciledBy, "EXACT_ORDERED_SELECT");
  const cold = createCloudflareD1ResourceAdapter(written.config);
  assert.equal((await cold.execute({ reservation })).status, "SUCCEEDED");
  assert.equal(mutations(written).length, 3);
  written.databases.values().next().value.records[0].value = "external alteration";
  await assert.rejects(cold.execute({ reservation }), error => error.recoverable && /RECORDS_NOT_EXACT/u.test(error.message));
  assert.equal(mutations(written).length, 3);
});

test("lost delete is exact-ID read-reconciled, never retried or aimed at caller-supplied IDs", async () => {
  for (const deleteAccepted of [true, false]) {
    const fixture = setup(); const reservation = await fixture.adapter.reserve(context);
    fixture.state.loseDelete = true; fixture.state.deleteAccepted = deleteAccepted;
    const result = await fixture.adapter.release(releaseContext(reservation));
    assert.equal(result.status, deleteAccepted ? "RELEASED" : "OPEN");
    assert.equal(result.releaseAttributionConfirmed, false); assert.equal(result.releaseSubmissionAmbiguous, true);
    const cold = createCloudflareD1ResourceAdapter(fixture.config);
    assert.equal((await cold.release({ ...releaseContext(reservation), operationId: "retry-another-id" })).status,
      deleteAccepted ? "RELEASED" : "OPEN");
    assert.equal(mutations(fixture).length, 2);
    const foreign = { ...reservation, adapterState: { ...reservation.adapterState, databaseRefHash: hash("f"),
      databaseId: "ffffffff-ffff-ffff-ffff-ffffffffffff" } };
    await assert.rejects(cold.release(releaseContext(foreign)), /RESERVATION_BINDING_MISMATCH/u);
    assert.equal(fixture.calls.some(call => call.path.includes("ffffffff-ffff")), false);
    assert.equal(mutations(fixture).length, 2);
  }
});
