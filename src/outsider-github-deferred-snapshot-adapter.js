/* Defer the existing GitHub native publication until SELECT-derived bytes exist.
 * Namespace preparation is NOT a provider reservation or a complete kernel binding.
 * A started upload without its durable receipt is never automatically repeated.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { createGitHubReleaseAssetProductionRecoveryAdapterV2 } from "./outsider-github-release-asset-production-recovery-adapter-v2.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce,
  withUserHeldExecutionLockV2 } from "./outsider-user-held-durable-execution-v2.js";

const SCHEMA = "outsider/github-deferred-snapshot/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_BYTES = 256 * 1024;
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const digest = value => hash(canonicalizeStrict(value));
const fail = code => { throw new TypeError(`OUTSIDER_GITHUB_DEFERRED_SNAPSHOT_${code}`); };
function privateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) fail("PRIVATE_DIRECTORY_REQUIRED");
}
const read = file => JSON.parse(readPrivateExecutionBytes(file).toString("utf8"));

export function createGitHubDeferredSnapshotAdapter(config, dependencies = {}) {
  if (!config || !path.isAbsolute(config.directory ?? "")
    || typeof config.snapshotSource !== "function" || !config.github
    || !/^[A-Za-z0-9_.-]{1,100}$/u.test(config.github.owner ?? "")
    || !/^[A-Za-z0-9_.-]{1,100}$/u.test(config.github.repository ?? "")) fail("CONFIG_INVALID");
  const root = config.directory; privateDirectory(root);
  const github = { ...config.github };
  const nativeFactory = dependencies.nativeFactory ?? createGitHubReleaseAssetProductionRecoveryAdapterV2;
  const fetchImpl = github.fetchImpl ?? globalThis.fetch;
  const sourceKind = github.fetchImpl || dependencies.nativeFactory ? "PROVIDER_FIXTURE" : "GITHUB_API";
  const clock = config.clock ?? (() => new Date().toISOString());
  const timeoutMs = github.requestTimeoutMs ?? 15000;
  if (typeof fetchImpl !== "function" || typeof nativeFactory !== "function"
    || typeof clock !== "function" || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > 60000) fail("CONFIG_INVALID");
  function location(reservation) {
    const key = reservation?.namespaceHash;
    if (!HASH.test(key ?? "")) fail("NAMESPACE_INVALID");
    const directory = path.join(root, key.slice(7));
    const context = read(path.join(directory, "namespace.json"));
    if (context.namespaceHash !== key || context.sourceKind !== sourceKind
      || context.owner !== github.owner || context.repository !== github.repository) fail("NAMESPACE_BINDING_CHANGED");
    return { directory, context };
  }
  function locked(reservation, operation) {
    const state = location(reservation);
    return withUserHeldExecutionLockV2(digest({ root, namespaceHash: reservation.namespaceHash }), () => operation(state));
  }
  function snapshot(state) {
    const value = read(path.join(state.directory, "snapshot.json"));
    const bytes = Buffer.from(value.snapshotBytesBase64, "base64");
    if (bytes.length < 1 || bytes.length > MAX_BYTES || hash(bytes) !== value.snapshotHash
      || !HASH.test(value.sourceReadReceiptHash ?? "")) fail("SNAPSHOT_BINDING_INVALID");
    return { ...value, bytes };
  }
  async function get(url, authenticated = true, redirect = "error", maximum = 64 * 1024) {
    const response = await fetchImpl(url, { method: "GET", redirect,
      signal: AbortSignal.timeout(timeoutMs), headers: authenticated ? {
        Authorization: `Bearer ${github.apiToken}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      } : { Accept: "application/octet-stream", "Cache-Control": "no-cache" } });
    const chunks = []; let length = 0;
    for await (const chunk of response.body ?? []) {
      length += chunk.length; if (length > maximum) fail("RESPONSE_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    let json = null; try { json = JSON.parse(bytes.toString("utf8")); } catch { /* binary */ }
    return { status: response.status, bytes, json };
  }
  function identity(state, value) {
    const suffix = createHash("sha256").update(`${state.context.program.programHash}\0${state.context.requirement.requirementId}`).digest("hex").slice(0, 32);
    const tag = `outsider-recovery-${suffix}`; const assetName = `artifact-${suffix}.bin`;
    return { suffix, tag, assetName, releaseName: `Outsider recovery ${suffix}`,
      releaseBody: `Outsider order-scoped recovery artifact.\nnamespace:${suffix}\nartifact:${value.snapshotHash}\nretention:ephemeral-active-route`,
      routeUrl: `https://github.com/${github.owner}/${github.repository}/releases/download/${tag}/${assetName}` };
  }
  async function reconcileState(state, operationId) {
    const snapshotFile = path.join(state.directory, "snapshot.json");
    if (!existsSync(snapshotFile)) return { status: "NOT_DISPATCHED", sourceKind, capacityEstablished: false };
    const value = snapshot(state); const expected = identity(state, value);
    const base = `https://api.github.com/repos/${github.owner}/${github.repository}`;
    const release = await get(`${base}/releases/tags/${expected.tag}`);
    if (release.status !== 200) return { status: "PUBLICATION_UNKNOWN", sourceKind,
      reason: "EXACT_NAMESPACE_NOT_OBSERVED_NO_RETRY", snapshotHash: value.snapshotHash };
    const r = release.json;
    if (!Number.isSafeInteger(r?.id) || r.id < 1 || r.tag_name !== expected.tag
      || r.name !== expected.releaseName || r.body !== expected.releaseBody
      || r.draft !== false || r.prerelease !== true || r.immutable !== false
      || !/^[a-f0-9]{40,64}$/u.test(r.target_commitish ?? "")) fail("RELEASE_IDENTITY_CONFLICT");
    const assets = await get(`${base}/releases/${r.id}/assets`);
    if (assets.status !== 200 || !Array.isArray(assets.json) || assets.json.length !== 1) fail("EXACT_ASSET_SET_REQUIRED");
    const listed = assets.json[0];
    if (!Number.isSafeInteger(listed?.id) || listed.id < 1) fail("ASSET_ID_INVALID");
    const asset = await get(`${base}/releases/assets/${listed.id}`);
    const a = asset.json;
    if (asset.status !== 200 || a?.id !== listed.id || a.name !== expected.assetName
      || a.state !== "uploaded" || a.content_type !== "application/octet-stream"
      || a.size !== value.bytes.length || a.browser_download_url !== expected.routeUrl
      || (a.digest != null && a.digest !== value.snapshotHash)) fail("ASSET_IDENTITY_CONFLICT");
    const version = { releaseId: r.id, assetId: a.id, targetCommitSha: r.target_commitish,
      tag: expected.tag, assetName: expected.assetName, snapshotHash: value.snapshotHash };
    const nativeFile = path.join(state.directory, "native-reservation.json");
    if (existsSync(nativeFile)) {
      const pinned = read(nativeFile).adapterState;
      if (pinned.releaseId !== version.releaseId || pinned.assetId !== version.assetId
        || pinned.targetCommitSha !== version.targetCommitSha
        || pinned.artifactHash !== version.snapshotHash) fail("NATIVE_RECEIPT_VERSION_CHANGED");
    }
    const versionFile = path.join(state.directory, "provider-version.json");
    if (existsSync(versionFile) && digest(read(versionFile)) !== digest(version)) fail("PROVIDER_VERSION_CHANGED");
    const route = await get(expected.routeUrl, false, "follow", value.bytes.length + 1024);
    if (route.status !== 200 || !route.bytes.equals(value.bytes)) fail("SNAPSHOT_DOWNLOAD_NOT_EXACT");
    writePrivateExecutionRecordOnce(versionFile, version);
    const receipt = { schema: SCHEMA, sourceKind, operationId, observedAt: clock(), version,
      sourceReadReceiptHash: value.sourceReadReceiptHash, snapshotHash: value.snapshotHash,
      responseHashes: [release, assets, asset, route].map(x => hash(x.bytes)),
      privateResponses: [release, assets, asset, route].map(x => ({ status: x.status,
        bodyHash: hash(x.bytes), bodyBytesBase64: x.bytes.toString("base64") })),
      byteLength: route.bytes.length, providerObservationIndependent: false,
      rawCredentialsProjected: false };
    const receiptHash = digest(receipt);
    writePrivateExecutionRecordOnce(path.join(state.directory, `observation-${receiptHash.slice(7)}.json`), receipt);
    return { status: existsSync(nativeFile) ? "SUCCEEDED" : "PUBLICATION_OBSERVED_CLEANUP_BINDING_REQUIRED", sourceKind, snapshotHash: value.snapshotHash,
      sourceReadReceiptHash: value.sourceReadReceiptHash, providerReceipt: receiptHash,
      version, routeUrl: expected.routeUrl, providerObservationIndependent: false,
      nativeCleanupBindingAvailable: existsSync(nativeFile) };
  }
  const adapter = {
    adapterId: "github-deferred-snapshot-v1", providerRef: "github-release-assets",
    async reserve({ program, requirement, operationId }) {
      if (!HASH.test(program?.programHash ?? "") || typeof requirement?.requirementId !== "string"
        || typeof operationId !== "string" || !operationId) fail("NAMESPACE_INPUT_INVALID");
      const body = { schema: SCHEMA, sourceKind, owner: github.owner, repository: github.repository,
        program, requirement, reserveOperationId: operationId };
      const namespaceHash = digest({ schema: SCHEMA, owner: github.owner, repository: github.repository,
        programHash: program.programHash, requirementId: requirement.requirementId });
      const directory = path.join(root, namespaceHash.slice(7));
      privateDirectory(directory);
      writePrivateExecutionRecordOnce(path.join(directory, "namespace.json"), { ...body, namespaceHash });
      return { status: "NAMESPACE_PREPARED", namespaceHash, sourceKind,
        providerReservationEstablished: false, capacityEstablished: false };
    },
    execute(context) {
      return locked(context.reservation, async state => {
        if (typeof context.operationId !== "string" || !context.operationId) fail("OPERATION_ID_REQUIRED");
        if (existsSync(path.join(state.directory, "released.json"))) fail("NAMESPACE_ALREADY_RELEASED");
        if (existsSync(path.join(state.directory, "dispatch.json"))) return reconcileState(state, context.operationId);
        const file = path.join(state.directory, "snapshot.json");
        if (!existsSync(file)) {
          const source = await config.snapshotSource({ ...context,
            program: state.context.program, requirement: state.context.requirement });
          if (!Buffer.isBuffer(source?.snapshotBytes) || source.snapshotBytes.length < 1
            || source.snapshotBytes.length > MAX_BYTES || !HASH.test(source.sourceReadReceiptHash ?? "")
            || hash(source.snapshotBytes) !== source.snapshotHash) fail("SELECT_DERIVED_SNAPSHOT_REQUIRED");
          // The supplied bytes must carry the same actual SELECT receipt reference.
          let body; try { body = JSON.parse(source.snapshotBytes.toString("utf8")); } catch { fail("SNAPSHOT_JSON_REQUIRED"); }
          if (body.sourceReadReceiptHash !== source.sourceReadReceiptHash) fail("SOURCE_RECEIPT_BINDING_MISMATCH");
          writePrivateExecutionRecordOnce(file, { snapshotBytesBase64: source.snapshotBytes.toString("base64"),
            snapshotHash: source.snapshotHash, sourceReadReceiptHash: source.sourceReadReceiptHash });
        }
        const value = snapshot(state);
        const native = nativeFactory({ ...github, artifactBytes: value.bytes });
        const requirement = { ...state.context.requirement, role: "RECOVERY",
          capability: "PUBLIC_HTTPS_ARTIFACT_PUBLICATION",
          constraints: { ...state.context.requirement.constraints, artifactHash: value.snapshotHash } };
        writePrivateExecutionRecordOnce(path.join(state.directory, "dispatch.json"), {
          operationId: context.operationId, snapshotHash: value.snapshotHash, startedAt: clock(),
          status: "NATIVE_PUBLICATION_STARTED_NO_AUTOMATIC_RETRY" });
        const result = await native.reserve({ program: state.context.program, requirement, operationId: context.operationId });
        if (result?.status !== "RESERVED") fail("NATIVE_PUBLICATION_UNAVAILABLE");
        writePrivateExecutionRecordOnce(path.join(state.directory, "native-reservation.json"), result);
        return reconcileState(state, context.operationId);
      });
    },
    reconcile(context) { return locked(context.reservation, state => reconcileState(state, context.operationId)); },
    downloadSnapshot(context) {
      return locked(context.reservation, async state => {
        // Reconcile performs fresh exact-version and byte reads from GitHub.
        // Return those downloaded bytes, never the locally supplied upload copy.
        const result = await reconcileState(state, context.operationId);
        if (result.status !== "SUCCEEDED") fail("DOWNLOAD_NOT_CONFIRMED");
        const receipt = read(path.join(state.directory,
          `observation-${result.providerReceipt.slice(7)}.json`));
        if (digest(receipt) !== result.providerReceipt) fail("DOWNLOAD_RECEIPT_INVALID");
        const response = receipt.privateResponses.at(-1);
        const snapshotBytes = Buffer.from(response.bodyBytesBase64, "base64");
        if (response.status !== 200 || hash(snapshotBytes) !== result.snapshotHash
          || hash(snapshotBytes) !== response.bodyHash) fail("DOWNLOAD_BYTES_INVALID");
        return { ...result, snapshotBytes, downloadedFromProvider: true };
      });
    },
    release(context) {
      return locked(context.reservation, async state => {
        const closed = path.join(state.directory, "released.json");
        if (existsSync(closed)) return read(closed);
        let result = { status: "RELEASED", sourceKind, remoteObjectsCreated: false };
        if (existsSync(path.join(state.directory, "dispatch.json"))) {
          const nativeFile = path.join(state.directory, "native-reservation.json");
          if (!existsSync(nativeFile)) return { status: "CLEANUP_RECONCILIATION_REQUIRED", sourceKind,
            reason: "MISSING_NATIVE_OWNERSHIP_RECEIPT_NO_DELETE_OR_REUPLOAD" };
          const value = snapshot(state); const native = nativeFactory({ ...github, artifactBytes: value.bytes });
          result = { ...await native.release({ reservation: read(nativeFile), operationId: context.operationId }), sourceKind };
        }
        if (result.status !== "RELEASED") return result;
        writePrivateExecutionRecordOnce(closed, result); return result;
      });
    },
  };
  return Object.freeze(adapter);
}
