import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import { createRecoverableDataWorkspaceComposition }
  from "../src/outsider-recoverable-data-workspace-composition.js";
const hash = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const digest = value => hash(canonicalizeStrict(value));

function harness(corrupt = false) {
  const rows = [{ id: "a", value: "one" }, { id: "b", value: "two" }, { id: "c", value: "three" }];
  const calls = [];
  const context = { program: { programHash: hash("program") },
    requirement: { requirementId: "source", role: "PRIMARY", capability: "D1_SYNTHETIC_THREE_RECORD_WORKSPACE", constraints: {} },
    operationId: "initial" };
  const snapshot = { schema: "outsider/recoverable-record-snapshot/v1",
    sourceReadReceiptHash: hash("SELECT-original"), records: rows };
  const snapshotBytes = Buffer.from(canonicalizeStrict(snapshot));
  const primaryAdapter = {
    adapterId: "d1", providerRef: "cloudflare", failureDomainRef: "cloudflare-d1",
    capabilities: [context.requirement.capability], supports: () => true,
    reserve: async () => ({ status: "RESERVED", reservationId: "source" }),
    execute: async () => { calls.push("write"); return { status: "SUCCEEDED", recordsHash: digest(rows), providerReceipt: hash("SELECT-original") }; },
    snapshot: async () => { calls.push("SELECT-snapshot"); return { snapshotBytes, snapshotHash: hash(snapshotBytes), sourceReadReceiptHash: hash("SELECT-original") }; },
    release: async () => { calls.push("release-primary"); return { status: "RELEASED" }; },
  };
  let uploaded;
  const config = { directory: mkdtempSync(path.join(os.tmpdir(), "outsider-data-composition-")),
    permissionGrantHash: hash("fixture-grant"), primaryAdapter,
    createBackupAdapter: ({ snapshotSource }) => ({
      reserve: async () => ({ status: "NAMESPACE_PREPARED", capacityEstablished: false }),
      execute: async () => { calls.push("upload"); uploaded = await snapshotSource(); return { status: "SUCCEEDED", snapshotHash: uploaded.snapshotHash }; },
      downloadSnapshot: async () => {
        calls.push("download");
        const bytes = corrupt ? Buffer.from(canonicalizeStrict({ ...snapshot,
          records: rows.map((row, i) => i ? row : { ...row, value: "changed" }) })) : Buffer.from(uploaded.snapshotBytes);
        return { status: "SUCCEEDED", downloadedFromProvider: true, snapshotBytes: bytes,
          snapshotHash: hash(bytes), sourceReadReceiptHash: hash("SELECT-original"), providerReceipt: hash("github-download") };
      },
      release: async () => { calls.push("release-backup"); return { status: "RELEASED" }; },
    }),
    createRestoreAdapter: ({ records, recordSourceRefHash }) => {
      assert.deepEqual(records, rows); assert.equal(recordSourceRefHash, hash("github-download"));
      return { reserve: async () => { calls.push("restore-allocate"); return { status: "RESERVED", reservationId: "new-database" }; },
        execute: async () => { calls.push("restore-write-read"); return { status: "SUCCEEDED", sourceKind: "PROVIDER_FIXTURE", recordsHash: digest(records), providerReceipt: hash("SELECT-restored") }; },
        release: async () => { calls.push("release-restored"); return { status: "RELEASED" }; } };
    } };
  return { config, calls, context };
}

test("runner-compatible adapter restores only GitHub-downloaded records and cold replay avoids duplicate effects", async () => {
  const x = harness(); let composition = createRecoverableDataWorkspaceComposition(x.config);
  assert.equal((await composition.discover({ requirement: x.context.requirement })).adapterId, composition.adapter.adapterId);
  assert.equal(await composition.discover({ requirement: { ...x.context.requirement, role: "INDEPENDENT_WITNESS" } }), null);
  const reservation = await composition.adapter.reserve(x.context);
  assert.equal(reservation.backupCapacityReserved, false); assert.equal(reservation.restorationCapacityReserved, false);
  const context = { ...x.context, reservation };
  const result = await composition.adapter.execute(context);
  assert.equal(result.status, "SUCCEEDED"); assert.equal(result.providerObservationIndependent, false);
  assert.equal(result.cloudflareOutageRecoveryProven, false); assert.equal(composition.guaranteeReady, false);
  composition = createRecoverableDataWorkspaceComposition(x.config);
  assert.deepEqual(await composition.adapter.execute(context), result);
  assert.deepEqual(x.calls, ["write", "upload", "SELECT-snapshot", "download", "restore-allocate", "restore-write-read"]);
  assert.equal((await composition.adapter.release(context)).status, "RELEASED");
  assert.deepEqual(x.calls.slice(-3), ["release-restored", "release-backup", "release-primary"]);
});

test("changed cross-provider snapshot cannot allocate a restored database and remains cleanup-capable", async () => {
  const x = harness(true); const { adapter } = createRecoverableDataWorkspaceComposition(x.config);
  const reservation = await adapter.reserve(x.context); const context = { ...x.context, reservation };
  await assert.rejects(adapter.execute(context), /PRIMARY_BACKUP_RESTORE_MISMATCH/);
  assert.equal(x.calls.includes("restore-allocate"), false);
  assert.equal((await adapter.release(context)).status, "RELEASED");
});
