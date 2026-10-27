/* One bounded task-family execution entry. The existing Node owns admission,
 * concurrency and resume; native adapters retain effect journals/reconciliation.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { createCloudflareD1ResourceAdapter } from "./outsider-cloudflare-d1-resource-adapter.js";
import { createGitHubDeferredSnapshotAdapter } from "./outsider-github-deferred-snapshot-adapter.js";
import { createRecoverableDataWorkspaceComposition } from "./outsider-recoverable-data-workspace-composition.js";
import { createCloudflareD1ReadEndpoint } from "./outsider-cloudflare-d1-read-endpoint.js";
import { createGlobalpingExactHttpObserverV2 } from "./outsider-globalping-exact-http-observer-v2.js";
import { createGitHubImmutableReleasePolicyProductionProbeV1 } from "./outsider-github-immutable-release-policy-production-probe-v1.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce } from "./outsider-user-held-durable-execution-v2.js";
const digest = value => `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { const error = new Error(code); error.code = `DATA_TASK_${code}`; throw error; };
const token = file => readPrivateExecutionBytes(file).toString("utf8").trim();
const credentials = file => read(file);

export async function executeDataWorkspaceTask({ directory, preparation }, dependencies = {}) {
  const { profile, program, records } = preparation;
  const file = name => path.join(directory, `${name}.json`);
  if (existsSync(file("runtime-result"))) return read(file("runtime-result"));
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  // The production profile can reuse one existing 0600 account bundle instead
  // of proliferating secret copies. Raw-token references remain supported for
  // already staged fixture profiles.
  const sharedCredentials = profile.github.credentialsFile
    ? credentials(profile.github.credentialsFile) : null;
  const workersCredentials = profile.cloudflare.workersCredentialsFile
    ? (profile.cloudflare.workersCredentialsFile === profile.github.credentialsFile
        ? sharedCredentials : credentials(profile.cloudflare.workersCredentialsFile)) : null;
  const githubCredentials = sharedCredentials?.githubReleaseAsset ?? {
    contentsWriteApiToken: token(profile.github.contentsWriteTokenFile),
    administrationReadApiToken: token(profile.github.administrationReadTokenFile),
  };
  const workersToken = workersCredentials?.cloudflare?.apiToken
    ?? token(profile.cloudflare.workersTokenFile);
  if (typeof workersToken !== "string" || typeof githubCredentials?.contentsWriteApiToken !== "string"
    || typeof githubCredentials?.administrationReadApiToken !== "string") fail("PROVIDER_CREDENTIALS_INVALID");
  const d1Factory = dependencies.createD1Adapter ?? createCloudflareD1ResourceAdapter;
  const base = { accountId: profile.cloudflare.accountId, syntheticData: true,
    zeroCostScope: profile.zeroCostScope, getApiToken: () => token(profile.cloudflare.d1TokenFile), clock };
  const composition = (dependencies.createComposition ?? createRecoverableDataWorkspaceComposition)({
    directory: path.join(directory, "composition"), permissionGrantHash: profile.permissionGrantHash,
    primaryAdapter: d1Factory({ ...base, directory: path.join(directory, "primary"), records }),
    createBackupAdapter: ({ directory: backupDirectory, snapshotSource }) =>
      (dependencies.createBackupAdapter ?? createGitHubDeferredSnapshotAdapter)({ directory: backupDirectory, snapshotSource, clock,
        github: { owner: profile.github.owner, repository: profile.github.repository,
          apiToken: githubCredentials.contentsWriteApiToken,
          immutableReleasePolicyProbe: createGitHubImmutableReleasePolicyProductionProbeV1({
            owner: profile.github.owner, repository: profile.github.repository,
            apiToken: githubCredentials.administrationReadApiToken,
            administrationReadCapabilityConfirmed: profile.github.administrationReadCapabilityConfirmed === true }) } }),
    createRestoreAdapter: restore => d1Factory({ ...base, ...restore, adapterId: "d1-restored" }),
  });
  const requirement = { requirementId: "data_workspace", role: "PRIMARY",
    capability: "D1_SYNTHETIC_THREE_RECORD_WORKSPACE", constraints: { recordCount: 3, recordsHash: digest(records) } };
  const context = { program, requirement, operationId: `data_${program.programHash.slice(7, 39)}` };
  if (!existsSync(file("reservation"))) {
    if (Date.parse(clock()) >= Date.parse(program.formationDeadline)) fail("FORMATION_DEADLINE_EXPIRED");
    const reservation = await composition.adapter.reserve(context);
    if (reservation.status !== "RESERVED") fail("ALLOCATION_NOT_CONFIRMED");
    writePrivateExecutionRecordOnce(file("reservation"), reservation);
  }
  const taskContext = { ...context, reservation: read(file("reservation")) };
  if (!existsSync(file("data-result"))) {
    const data = await composition.adapter.execute(taskContext);
    if (data.status !== "SUCCEEDED") fail("DATA_EXECUTION_NOT_COMPLETE");
    writePrivateExecutionRecordOnce(file("data-result"), data);
  }
  const data = read(file("data-result"));
  const stateDirectory = path.join(directory, "composition", digest({ programHash: program.programHash,
    requirementId: requirement.requirementId }).slice(7));
  const restoreReservation = dependencies.restoreReservation ?? read(path.join(stateDirectory, "restore-reservation.json"));
  const createEffect = digest({ operationRefHash: restoreReservation.adapterState.operationRefHash, kind: "CREATE" });
  const endpoint = (dependencies.createEndpoint ?? createCloudflareD1ReadEndpoint)({
    directory: path.join(directory, "endpoint"), accountId: profile.cloudflare.accountId,
    workersDevSubdomain: profile.cloudflare.workersDevSubdomain,
    getApiToken: () => workersToken,
    databaseCreateReceiptFile: path.join(stateDirectory, "restore", createEffect.slice(7), "source.json"),
    expectedRecordsHash: data.recordsHash, namespace: program.programId,
    expiresAt: program.completionDeadline, syntheticData: true, clock });
  if (!existsSync(file("observed"))) {
    if (!existsSync(file("endpoint-deployed"))) {
      const deployed = await endpoint.deploy();
      if (deployed.status !== "DEPLOYED") fail("ENDPOINT_NOT_DEPLOYED");
      writePrivateExecutionRecordOnce(file("endpoint-deployed"), deployed);
    }
    const observer = (dependencies.createObserver ?? createGlobalpingExactHttpObserverV2)({
      directory: path.join(directory, "observer"), clock });
    const observation = await observer.observe({ operationId: `observe_${program.programHash.slice(7, 39)}`,
      targetUrl: endpoint.routeUrl });
    if (observation.status !== 200 || observation.bodyHash !== data.recordsHash) fail("INDEPENDENT_OBSERVATION_NOT_EXACT");
    writePrivateExecutionRecordOnce(file("observed"), observation);
  }
  // Resuming after observation never resubmits another measurement or reopens
  // a deleted endpoint. Adapters independently replay their cleanup receipts.
  if (!existsSync(file("endpoint-released"))) {
    const result = await endpoint.release();
    if (result.status !== "RELEASED") fail("ENDPOINT_CLEANUP_OPEN");
    writePrivateExecutionRecordOnce(file("endpoint-released"), result);
  }
  if (!existsSync(file("resources-released"))) {
    const result = await composition.adapter.release(taskContext);
    if (result.status !== "RELEASED") fail("RESOURCE_CLEANUP_OPEN");
    writePrivateExecutionRecordOnce(file("resources-released"), result);
  }
  const result = { state: "SUCCEEDED", taskFamily: "RECOVERABLE_DATA_WORKSPACE_V1",
    recordCount: 3, recordsHash: data.recordsHash, snapshotHash: data.snapshotHash,
    independentlyObserved: true, observationReceiptHash: digest(read(file("observed"))),
    cleanupComplete: true, completedAt: clock(), capitalBacked: false,
    completeTemporarySupplyNetworkCommitted: false, paymentAuthorized: false };
  writePrivateExecutionRecordOnce(file("runtime-result"), result); return result;
}
