/* A bounded resource adapter for the existing production OutcomeProgram runner.
 * Its reserve receipt covers only the actual primary D1 allocation. GitHub
 * publication and the restored database are execution steps, NOT pre-reserved
 * recovery capacity. No independent witness or commercial guarantee is minted.
 * The durable runner retains scheduling, user confirmation and task lifecycle.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, lstatSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce,
  withUserHeldExecutionLockV2 } from "./outsider-user-held-durable-execution-v2.js";
import { createProductionAdapterFederationV1 }
  from "./outsider-production-outcome-runner-v1.js";

const hash = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const digest = value => hash(canonicalizeStrict(value));
const HASH = /^sha256:[a-f0-9]{64}$/u;
const fail = code => { throw new Error(`OUTSIDER_DATA_WORKSPACE_${code}`); };
const read = file => JSON.parse(readPrivateExecutionBytes(file));
function privateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) fail("PRIVATE_DIRECTORY_REQUIRED");
}

export function createRecoverableDataWorkspaceComposition(config) {
  if (!path.isAbsolute(config?.directory ?? "") || !HASH.test(config.permissionGrantHash ?? "")
    || typeof config.primaryAdapter?.snapshot !== "function"
    || typeof config.createBackupAdapter !== "function"
    || typeof config.createRestoreAdapter !== "function") fail("CONFIG_INVALID");
  privateDirectory(config.directory);
  const primary = config.primaryAdapter;
  const adapterId = config.adapterId ?? "recoverable-data-workspace";
  function contextFor(context, suffix = "primary") {
    return { ...context, permissionGrantHash: config.permissionGrantHash,
      requirementId: context.requirement?.requirementId ?? context.requirementId,
      operationId: `data_${hash(`${context.operationId}\0${suffix}`).slice(7, 47)}` };
  }
  function stateFor(context) {
    const requirementId = context.requirement?.requirementId ?? context.requirementId;
    if (!HASH.test(context.program?.programHash ?? "") || !requirementId) fail("CONTEXT_INVALID");
    const key = digest({ programHash: context.program.programHash, requirementId });
    const directory = path.join(config.directory, key.slice(7)); privateDirectory(directory);
    const primaryContext = contextFor(context);
    const backup = config.createBackupAdapter({ directory: path.join(directory, "backup"),
      snapshotSource: () => primary.snapshot(primaryContext) });
    const file = name => path.join(directory, `${name}.json`);
    function downloaded() {
      const value = read(file("download"));
      const bytes = Buffer.from(value.snapshotBytesBase64, "base64");
      if (hash(bytes) !== value.snapshotHash || !HASH.test(value.providerReceipt ?? "")) fail("DOWNLOAD_INVALID");
      const snapshot = JSON.parse(bytes.toString("utf8"));
      if (snapshot.schema !== "outsider/recoverable-record-snapshot/v1"
        || snapshot.sourceReadReceiptHash !== value.sourceReadReceiptHash
        || !Array.isArray(snapshot.records) || snapshot.records.length !== 3) fail("SNAPSHOT_INVALID");
      return { ...value, snapshot };
    }
    function restored() {
      const value = downloaded();
      // The only restore input is the provider download, never config.records.
      return config.createRestoreAdapter({ directory: path.join(directory, "restore"),
        records: value.snapshot.records, recordSourceRefHash: value.providerReceipt });
    }
    function restoreContext(reservation) {
      const original = context.requirement ?? read(file("requirement"));
      const requirement = { ...original, requirementId: `${original.requirementId}_restore`,
        constraints: { ...original.constraints, recordsHash: digest(downloaded().snapshot.records) } };
      return { ...contextFor(context, "restore"), requirement,
        requirementId: requirement.requirementId, reservation };
    }
    return { key, file, backup, downloaded, restored, restoreContext, primaryContext };
  }
  const adapter = {
    adapterId, providerRef: primary.providerRef, failureDomainRef: primary.failureDomainRef,
    roles: Object.freeze(["PRIMARY"]), capabilities: primary.capabilities,
    supports: requirement => requirement?.role === "PRIMARY" && primary.supports(requirement),
    async reserve(context) {
      const state = stateFor(context);
      writePrivateExecutionRecordOnce(state.file("requirement"), context.requirement);
      const reservation = await primary.reserve(state.primaryContext);
      return { ...reservation, allocationScope: "PRIMARY_D1_DATABASE_ONLY",
        backupCapacityReserved: false, restorationCapacityReserved: false,
        commercialCommitmentIssued: false };
    },
    reconcileReserve: context => primary.reconcileReserve(contextFor(context)),
    readReservation: context => primary.readReservation(contextFor(context)),
    async execute(context) {
      const state = stateFor(context);
      return withUserHeldExecutionLockV2(state.key, async () => {
        if (existsSync(state.file("result"))) return read(state.file("result"));
        if (!existsSync(state.file("primary-written"))) {
          const result = await primary.execute(state.primaryContext);
          if (result.status !== "SUCCEEDED") return result;
          writePrivateExecutionRecordOnce(state.file("primary-written"), {
            recordsHash: result.recordsHash, providerReceipt: result.providerReceipt });
        }
        if (!existsSync(state.file("backup-reservation"))) {
          const reservation = await state.backup.reserve(contextFor(context, "backup-reserve"));
          writePrivateExecutionRecordOnce(state.file("backup-reservation"), reservation);
        }
        const backupContext = { ...contextFor(context, "backup-execute"),
          reservation: read(state.file("backup-reservation")) };
        if (!existsSync(state.file("backup-published"))) {
          const published = await state.backup.execute(backupContext);
          if (published.status !== "SUCCEEDED") fail("BACKUP_PUBLICATION_NOT_CONFIRMED");
          writePrivateExecutionRecordOnce(state.file("backup-published"), published);
        }
        if (!existsSync(state.file("download"))) {
          const value = await state.backup.downloadSnapshot(backupContext);
          if (value.status !== "SUCCEEDED" || value.downloadedFromProvider !== true
            || !Buffer.isBuffer(value.snapshotBytes) || hash(value.snapshotBytes) !== value.snapshotHash) fail("PROVIDER_DOWNLOAD_REQUIRED");
          writePrivateExecutionRecordOnce(state.file("download"), {
            snapshotBytesBase64: value.snapshotBytes.toString("base64"), snapshotHash: value.snapshotHash,
            sourceReadReceiptHash: value.sourceReadReceiptHash, providerReceipt: value.providerReceipt });
        }
        if (digest(state.downloaded().snapshot.records)
          !== read(state.file("primary-written")).recordsHash) fail("PRIMARY_BACKUP_RESTORE_MISMATCH");
        const restored = state.restored();
        if (!existsSync(state.file("restore-reservation"))) {
          const reservation = await restored.reserve(state.restoreContext());
          if (reservation.status !== "RESERVED") fail("RESTORE_ALLOCATION_NOT_CONFIRMED");
          writePrivateExecutionRecordOnce(state.file("restore-reservation"), reservation);
        }
        const result = await restored.execute(state.restoreContext(read(state.file("restore-reservation"))));
        const download = state.downloaded();
        if (result.status !== "SUCCEEDED" || result.recordsHash !== digest(download.snapshot.records)) fail("RESTORE_READBACK_NOT_EXACT");
        const primaryRead = read(state.file("primary-written"));
        if (result.recordsHash !== primaryRead.recordsHash) fail("PRIMARY_BACKUP_RESTORE_MISMATCH");
        const receipt = { status: "SUCCEEDED", recordCount: 3, recordsHash: result.recordsHash,
          snapshotHash: download.snapshotHash, primaryReadReceipt: primaryRead.providerReceipt,
          githubDownloadReceipt: download.providerReceipt, restoreReadReceipt: result.providerReceipt,
          sourceKind: result.sourceKind, providerObservationIndependent: false,
          recoveryScope: "FRESH_DATABASE_RESTORE_FROM_CROSS_PROVIDER_SNAPSHOT",
          cloudflareOutageRecoveryProven: false, reservedRecoveryCapacityEstablished: false,
          commercialCommitmentIssued: false };
        writePrivateExecutionRecordOnce(state.file("result"), receipt); return receipt;
      });
    },
    async release(context) {
      const state = stateFor(context);
      return withUserHeldExecutionLockV2(state.key, async () => {
        const receipts = {};
        if (existsSync(state.file("restore-reservation"))) {
          receipts.restore = await state.restored().release(state.restoreContext(read(state.file("restore-reservation"))));
        }
        if (existsSync(state.file("backup-reservation"))) {
          receipts.backup = await state.backup.release({ ...contextFor(context, "backup-release"),
            reservation: read(state.file("backup-reservation")) });
        }
        receipts.primary = await primary.release(state.primaryContext);
        return { status: Object.values(receipts).every(x => x.status === "RELEASED") ? "RELEASED" : "OPEN",
          receipts, providerObservationIndependent: false };
      });
    },
    async closeObligation(context) {
      const result = await adapter.release(context);
      return { ...result, status: result.status === "RELEASED" ? "CLOSED" : "OPEN" };
    },
  };
  // Callers can inject this composition directly into the unchanged runner.
  // Without genuine recovery/witness candidates its formation remains unavailable.
  const federation = createProductionAdapterFederationV1({ adapters: [
    { adapter, roles: ["PRIMARY"] }, ...(config.additionalCandidates ?? []),
  ] });
  return Object.freeze({ ...federation, adapter: Object.freeze(adapter),
    guaranteeReady: false, sourceRecordsInPublicProjection: false });
}
