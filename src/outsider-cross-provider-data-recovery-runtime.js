/* A successor execution lane, composed from existing resource adapters. The
 * original Node remains responsible for admission/confirmation and scheduling.
 * This bounded rehearsal removes its OWN primary only after a real remote
 * backup download, then restores into already allocated different-provider
 * compute. It is not an actual Cloudflare outage or a commercial guarantee.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce,
  withUserHeldExecutionLockV2 } from "./outsider-user-held-durable-execution-v2.js";
import { createCloudflareD1ResourceAdapter } from "./outsider-cloudflare-d1-resource-adapter.js";
import { createGitHubDeferredSnapshotAdapter } from "./outsider-github-deferred-snapshot-adapter.js";
import { createGitHubImmutableReleasePolicyProductionProbeV1 } from "./outsider-github-immutable-release-policy-production-probe-v1.js";
import { createNeonClaimableResource } from "./outsider-neon-claimable-resource.js";

const hash = v => `sha256:${createHash("sha256").update(v).digest("hex")}`;
const digest = v => hash(canonicalizeStrict(v));
const read = f => JSON.parse(readPrivateExecutionBytes(f));
const fail = c => { throw new Error(`OUTSIDER_CROSS_PROVIDER_${c}`); };

export async function executeCrossProviderDataRecovery({ directory, preparation }, dependencies = {}) {
  const { profile, program, records, retireOwnedPrimaryForRecovery } = preparation;
  if (!path.isAbsolute(directory ?? "") || profile?.syntheticData !== true
    || retireOwnedPrimaryForRecovery !== true) fail("BOUNDED_REHEARSAL_REQUIRED");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const file = n => path.join(directory, `${n}.json`);
  return withUserHeldExecutionLockV2(digest({ directory, programHash: program.programHash }), async () => {
    writeOnce(file("preparation"), preparation);
    if (existsSync(file("runtime-result"))) return read(file("runtime-result"));
    const shared = dependencies.credentials ?? read(profile.github.credentialsFile).githubReleaseAsset;
    const primary = (dependencies.createPrimary ?? createCloudflareD1ResourceAdapter)({
      directory: path.join(directory, "primary"), accountId: profile.cloudflare.accountId,
      getApiToken: () => readPrivateExecutionBytes(profile.cloudflare.d1TokenFile).toString("utf8").trim(),
      records, syntheticData: true, zeroCostScope: profile.zeroCostScope, clock });
    const recovery = (dependencies.createRecovery ?? createNeonClaimableResource)({
      directory: path.join(directory, "recovery"), permissionGrantHash: profile.permissionGrantHash, clock });
    const requirement = { requirementId: "cross_provider_data", role: "PRIMARY",
      capability: "D1_SYNTHETIC_THREE_RECORD_WORKSPACE", constraints: { recordsHash: digest(records), recordCount: 3 } };
    const base = { program, requirement, requirementId: requirement.requirementId,
      permissionGrantHash: profile.permissionGrantHash, operationId: `data_${program.programHash.slice(7, 39)}` };
    const step = async (name, operation) => {
      if (existsSync(file(name))) return read(file(name));
      const result = await operation(); writeOnce(file(name), result); return result;
    };
    // Each independent allocation is durably recorded even if its sibling fails.
    const [allocation, standby] = await Promise.all([
      step("primary-reservation", () => primary.reserve(base)),
      step("recovery-reservation", () => recovery.reserve()),
    ]);
    if (allocation.status !== "RESERVED" || standby.status !== "RESERVED"
      || Date.parse(standby.validUntil) < Date.parse(program.completionDeadline)) fail("CAPACITY_NOT_CLOSED");
    const context = { ...base, reservation: allocation };
    const backup = (dependencies.createBackup ?? createGitHubDeferredSnapshotAdapter)({
      directory: path.join(directory, "backup"), snapshotSource: () => primary.snapshot(context), clock,
      github: { owner: profile.github.owner, repository: profile.github.repository,
        apiToken: shared.contentsWriteApiToken,
        immutableReleasePolicyProbe: createGitHubImmutableReleasePolicyProductionProbeV1({
          owner: profile.github.owner, repository: profile.github.repository,
          apiToken: shared.administrationReadApiToken, administrationReadCapabilityConfirmed: true }) } });
    const written = await step("primary-written", async () => {
      const value = await primary.execute(context);
      if (value.status !== "SUCCEEDED") fail("PRIMARY_NOT_WRITTEN");
      return { status: value.status, recordsHash: value.recordsHash, providerReceipt: value.providerReceipt };
    });
    const namespace = await step("backup-reservation", () => backup.reserve(base));
    const backupContext = { ...base, reservation: namespace };
    await step("backup-published", async () => {
      const value = await backup.execute(backupContext);
      if (value.status !== "SUCCEEDED") fail("BACKUP_NOT_PUBLISHED"); return value;
    });
    const downloaded = await step("download", async () => {
      const value = await backup.downloadSnapshot(backupContext);
      if (value.status !== "SUCCEEDED" || !value.downloadedFromProvider
        || !Buffer.isBuffer(value.snapshotBytes) || hash(value.snapshotBytes) !== value.snapshotHash) fail("REMOTE_DOWNLOAD_REQUIRED");
      return { snapshotBytesBase64: value.snapshotBytes.toString("base64"), snapshotHash: value.snapshotHash,
        providerReceipt: value.providerReceipt, sourceReadReceiptHash: value.sourceReadReceiptHash };
    });
    const bytes = Buffer.from(downloaded.snapshotBytesBase64, "base64");
    if (hash(bytes) !== downloaded.snapshotHash) fail("DOWNLOAD_HASH_MISMATCH");
    const snapshot = JSON.parse(bytes);
    if (snapshot.schema !== "outsider/recoverable-record-snapshot/v1"
      || snapshot.sourceReadReceiptHash !== downloaded.sourceReadReceiptHash
      || digest(snapshot.records) !== written.recordsHash) fail("SNAPSHOT_MISMATCH");
    // Explicit rehearsal condition: this task-owned primary no longer exists.
    await step("primary-retired", async () => {
      const value = await primary.release(context);
      if (value.status !== "RELEASED") fail("PRIMARY_STILL_PRESENT");
      return { ...value, retiredAt: clock() };
    });
    const restored = await step("recovered", async () => {
      const value = await recovery.restore({ records: snapshot.records, recordSourceRefHash: downloaded.providerReceipt });
      if (value.status !== "SUCCEEDED" || value.recordsHash !== written.recordsHash) fail("RECOVERY_NOT_EXACT");
      return { ...value, recoveredAt: clock() };
    });
    const backupCleanup = await step("backup-cleanup", async () => {
      const value = await backup.release(backupContext);
      if (value.status !== "RELEASED") fail("BACKUP_CLEANUP_OPEN"); return value;
    });
    const recoveryCleanup = await step("recovery-cleanup", () => recovery.clear());
    const result = { state: "RECOVERED_WITH_EXPIRY_PENDING", taskFamily: "CROSS_PROVIDER_DATA_RECOVERY_REHEARSAL_V1",
      recordsHash: restored.recordsHash, recordCount: restored.recordCount,
      recoveryCapacityReservedBeforePrimaryWrite: true,
      primaryRemovedBeforeRestore: true, restoreProvider: "neon", primaryProvider: "cloudflare",
      backupProvider: "github", downloadedFromProvider: true,
      actualProviderOutageTested: false, independentOutcomeVerified: false,
      completeTemporarySupplyNetworkCommitted: false,
      primaryReleased: true, backupReleased: backupCleanup.status === "RELEASED",
      recoveryDataCleared: recoveryCleanup.dataCleared, recoveryProjectDeleted: false,
      recoveryProjectExpiresAt: recoveryCleanup.expiresAt,
      recoveryMs: Date.parse(restored.recoveredAt) - Date.parse(read(file("primary-retired")).retiredAt),
      sourceReceipt: restored.providerReceipt, completedAt: clock(), financeMode: "SIMULATION_ONLY",
      paymentPerformed: false, capitalBacked: false };
    writeOnce(file("runtime-result"), result); return result;
  });
}
