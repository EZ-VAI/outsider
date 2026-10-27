/*
 * VERSIONED SOURCE LINEAGE — Sigstore TUF -> Rekor v2 route acquisition v2.
 *
 * Supersedes v1 (sha256:3aef4a6d8c2e2a4a4cb44aafeef9e573c65ceeca4067b9fd5b6d2e3ff3783b7f).
 * V1 truthfully used @sigstore/tuf for its live refresh, but its frozen
 * artifact retained only target files. Its role-chain claim therefore could
 * not be independently replayed offline. V2 requires a fresh empty cache,
 * retains the exact embedded bootstrap, every sequential root descendant
 * available in that refresh, final root, timestamp, snapshot, targets and the
 * two target files, then replays those bytes through tuf-js before it can emit
 * the runner-compatible verification report.
 *
 * This remains a read-only route observation. It never calls Rekor, never
 * pays, and never creates authority, capacity, trusted time or outcome truth.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, realpathSync,
} from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { isProxy } from "node:util/types";

import { initTUF as sigstoreInitTUF } from "@sigstore/tuf";
import { TrustedMetadataStore } from "tuf-js/dist/store.js";

import { canonicalizeStrict } from "./canonical.js";
import { publishPrivateArtifact }
  from "./outsider-private-artifact-publication.js";
import { createRekorV2PinnedTufServiceSelectionV2 }
  from "./outsider-rekor-durable-effect-head-transport-v2.js";

const PREFIX = "OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V2_";
const MIRROR = "https://tuf-repo-cdn.sigstore.dev";
const SIGNING_TARGET = "signing_config_rekor_v2.v0.2.json";
const TRUST_TARGET = "trusted_root.json";
const CREATE_PATH = "/api/v2/log/entries";
const MIN_TIMEOUT = 20_000;
const MAX_TIMEOUT = 120_000;
const MAX_FILE = 8 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const TUF_VERSION = "4.0.2";
const TUF_INTEGRITY
  = "sha512-TCAzTy0xzdP79EnxSjq9KQ3eaR7+FmudLC6eRKknVKZbV7ZNlGLClAAQb/HMNJ5n2OBNk2GT1tEmU0xuPr+SLQ==";
const TUF_JS_VERSION = "4.1.0";
const TUF_JS_INTEGRITY
  = "sha512-50QV99kCKH5P/Vs4E2Gzp7BopNV+KzTXqWeaxrfu5IQJBOULRsTIS9seSsOVT8ZnGXzCyx55nYWAi4qJzpZKEQ==";
const PRODUCTION_BOOTSTRAP_HASH
  = "sha256:c8c41ec13f06ccabf5b48541ee2550098b4c7b5349e1d180390c29a7d5c2642c";
const V1_SOURCE_HASH
  = "sha256:3aef4a6d8c2e2a4a4cb44aafeef9e573c65ceeca4067b9fd5b6d2e3ff3783b7f";
const V1_MANIFEST_HASH
  = "sha256:446cb07e84b8c78466e396d692d5810b21b766a1fff706a5d85090fa4589ca42";
const V1_MANIFEST_FILE_HASH
  = "sha256:15b1620a4af31503ec46d3e3fcadc8e61e6a1e062854c197ab28e32bd2e136e0";
const V1_ACQUISITION_HASH
  = "sha256:6b1c8414c79dbd008ae55d74332a0e655a6dea6edc4748933cdce1d6b85b0a42";
const REQUIRE = createRequire(import.meta.url);
const PRIVATE = new WeakMap();
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V2_SCHEMAS
  = Object.freeze({
    projection: "outsider/sigstore-tuf-rekor-v2-route-acquisition/v2",
    offlineReplay: "outsider/sigstore-tuf-offline-role-chain-replay/v2",
    verificationReport:
      "outsider/rekor-v2-production-tuf-selection-verification/v1",
    manifest: "outsider/sigstore-tuf-rekor-v2-route-artifact-manifest/v2",
  });

export const OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V2_BOUNDARY
  = Object.freeze({
    position:
      "EXACT_RETAINED_TUF_ROLE_CHAIN_OFFLINE_REPLAYED_REKOR_V2_ROUTE_HOLD_ONLY",
    supersedesV1SourceHash: V1_SOURCE_HASH,
    supersedesV1ManifestHash: V1_MANIFEST_HASH,
    exactTufDependency: `@sigstore/tuf@${TUF_VERSION}`,
    exactOfflineReplayDependency: `tuf-js@${TUF_JS_VERSION}`,
    freshEmptyCacheRequired: true,
    forceInitFromEmbeddedBootstrap: true,
    sequentialRootGapPermitted: false,
    applicationRetries: 0,
    transportRetries: 0,
    minimumTimeoutMs: MIN_TIMEOUT,
    rekorPostPermitted: false,
    rawRoleAndTargetBytesProjected: false,
    privateArtifactFileMode: "0600",
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code, cause = undefined) {
  const error = new Error(`${PREFIX}${code}`);
  if (cause !== undefined) error.cause = cause;
  throw error;
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value, fields, code) {
  if (!plain(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || keys.some((key) => typeof key !== "string" || !fields.includes(key))) {
    fail(`${code}_SHAPE_INVALID`);
  }
  return value;
}

function freeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || seen.has(value) || ArrayBuffer.isView(value)) return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ("value" in descriptor) freeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function sha(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha(Buffer.from(
    `outsider:sigstore-tuf-rekor-v2-route-acquisition:${domain}:v2\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function canonicalTime(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail(`${code}_INVALID`);
  }
  return new Date(value).toISOString();
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function safeDirectory(input, { empty = false } = {}) {
  if (typeof input !== "string" || !path.isAbsolute(input)) {
    fail("CACHE_ABSOLUTE_PATH_REQUIRED");
  }
  const resolved = path.resolve(input);
  let stat;
  try { stat = lstatSync(resolved, { bigint: true }); }
  catch (error) { fail("CACHE_UNAVAILABLE", error); }
  if (resolved === path.parse(resolved).root || !stat.isDirectory()
    || stat.isSymbolicLink() || Number(stat.mode & 0o777n) !== 0o700
    || realpathSync(resolved) !== resolved
    || (typeof process.getuid === "function" && stat.uid !== BigInt(process.getuid()))) {
    fail("CACHE_UNSAFE");
  }
  if (empty && readdirSync(resolved).length !== 0) fail("FRESH_EMPTY_CACHE_REQUIRED");
  return resolved;
}

function readRegular(file, code, maximum = MAX_FILE) {
  const before = lstatSync(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.size < 2n
    || before.size > BigInt(maximum) || realpathSync(file) !== file) {
    fail(`${code}_UNSAFE`);
  }
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | NOFOLLOW);
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size) fail(`${code}_IDENTITY_CHANGED`);
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    if (after.size !== opened.size || after.mtimeNs !== opened.mtimeNs
      || after.ctimeNs !== opened.ctimeNs) fail(`${code}_CHANGED_DURING_READ`);
    return bytes;
  } finally { if (fd !== undefined) closeSync(fd); }
}

function json(bytes, code) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > MAX_FILE) {
    fail(`${code}_BYTES_INVALID`);
  }
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(`${code}_JSON_INVALID`, error); }
  if (!plain(parsed)) fail(`${code}_OBJECT_INVALID`);
  return parsed;
}

function metadata(bytes, expectedType, code) {
  const parsed = json(bytes, code);
  if (!plain(parsed.signed) || parsed.signed._type !== expectedType
    || !Number.isSafeInteger(parsed.signed.version) || parsed.signed.version < 1
    || typeof parsed.signed.expires !== "string"
    || !Number.isFinite(Date.parse(parsed.signed.expires))) {
    fail(`${code}_HEADER_INVALID`);
  }
  return {
    parsed,
    type: expectedType,
    version: parsed.signed.version,
    expires: new Date(parsed.signed.expires).toISOString(),
    bytes: bytes.length,
    sha256: sha(bytes),
  };
}

function installedPackage(name, expectedVersion, code) {
  let value;
  try { value = JSON.parse(readFileSync(REQUIRE.resolve(`${name}/package.json`), "utf8")); }
  catch (error) { fail(`${code}_UNREADABLE`, error); }
  if (!plain(value) || value.name !== name || value.version !== expectedVersion) {
    fail(`${code}_VERSION_INVALID`);
  }
  return path.dirname(REQUIRE.resolve(`${name}/package.json`));
}

function embeddedProductionBootstrap(packageDirectory) {
  let seeds;
  try { seeds = JSON.parse(readFileSync(path.join(packageDirectory, "seeds.json"), "utf8")); }
  catch (error) { fail("TUF_SEEDS_UNREADABLE", error); }
  const encoded = seeds?.[MIRROR]?.["root.json"];
  if (typeof encoded !== "string") fail("PRODUCTION_BOOTSTRAP_MISSING");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded || sha(bytes) !== PRODUCTION_BOOTSTRAP_HASH) {
    fail("PRODUCTION_BOOTSTRAP_PIN_MISMATCH");
  }
  return bytes;
}

function targetDescriptor(name, bytes) {
  return { targetPath: name, expectedLength: bytes.length,
    expectedSha256: sha(bytes).slice("sha256:".length), bytes: Buffer.from(bytes) };
}

function roleFact(name, bytes, type) {
  const parsed = metadata(bytes, type, name.toUpperCase());
  return { name, version: parsed.version, expires: parsed.expires,
    bytes: parsed.bytes, sha256: parsed.sha256 };
}

function repositoryCachePath(cachePath) {
  const url = new URL(MIRROR);
  return path.join(cachePath,
    encodeURIComponent(url.host + url.pathname.replace(/\/$/u, "")));
}

function captureCache(cachePath, bootstrapRootBytes, signingText, trustedText) {
  const repository = repositoryCachePath(cachePath);
  if (realpathSync(repository) !== repository) fail("TUF_REPOSITORY_CACHE_UNSAFE");
  const finalRootBytes = readRegular(path.join(repository, "root.json"), "FINAL_ROOT");
  const timestampBytes = readRegular(path.join(repository, "timestamp.json"), "TIMESTAMP");
  const snapshotBytes = readRegular(path.join(repository, "snapshot.json"), "SNAPSHOT");
  const targetsBytes = readRegular(path.join(repository, "targets.json"), "TARGETS");
  const signingConfigBytes = readRegular(path.join(repository, "targets", SIGNING_TARGET),
    "SIGNING_TARGET");
  const trustedRootBytes = readRegular(path.join(repository, "targets", TRUST_TARGET),
    "TRUST_TARGET");
  if (!signingConfigBytes.equals(Buffer.from(signingText, "utf8"))
    || !trustedRootBytes.equals(Buffer.from(trustedText, "utf8"))) {
    fail("RETURNED_TARGET_AND_CACHE_BYTES_MISMATCH");
  }
  const bootstrap = metadata(bootstrapRootBytes, "root", "BOOTSTRAP_ROOT");
  const finalRoot = metadata(finalRootBytes, "root", "FINAL_ROOT");
  if (finalRoot.version < bootstrap.version
    || finalRoot.version > bootstrap.version + 1) {
    fail("EXACT_SEQUENTIAL_ROOT_DESCENDANTS_NOT_RETAINED");
  }
  const rootDescendantBytes = finalRoot.version === bootstrap.version
    ? [] : [finalRootBytes];
  return {
    bootstrapRootBytes: Buffer.from(bootstrapRootBytes),
    rootDescendantBytes: rootDescendantBytes.map((bytes) => Buffer.from(bytes)),
    finalRootBytes,
    timestampBytes,
    snapshotBytes,
    targetsBytes,
    signingConfigBytes,
    trustedRootBytes,
  };
}

/**
 * Offline replay over caller-retained exact bytes. This uses a new
 * TrustedMetadataStore and no live client/cache/network state.
 */
export async function replaySigstoreTufRekorV2RouteBytesV2(input = {}) {
  exact(input, ["bootstrapRootBytes", "rootDescendantBytes", "finalRootBytes",
    "timestampBytes", "snapshotBytes", "targetsBytes", "signingConfigBytes",
    "trustedRootBytes", "selection", "selectedAt"], "REPLAY_INPUT");
  const selectedAt = canonicalTime(input.selectedAt, "SELECTED_AT");
  const buffers = {};
  for (const field of ["bootstrapRootBytes", "finalRootBytes", "timestampBytes",
    "snapshotBytes", "targetsBytes", "signingConfigBytes", "trustedRootBytes"]) {
    if (!Buffer.isBuffer(input[field])) fail(`${field.toUpperCase()}_BUFFER_REQUIRED`);
    buffers[field] = Buffer.from(input[field]);
  }
  if (!Array.isArray(input.rootDescendantBytes) || input.rootDescendantBytes.length > 32
    || input.rootDescendantBytes.some((bytes) => !Buffer.isBuffer(bytes))) {
    fail("ROOT_DESCENDANTS_INVALID");
  }
  const descendants = input.rootDescendantBytes.map((bytes) => Buffer.from(bytes));
  const bootstrap = metadata(buffers.bootstrapRootBytes, "root", "BOOTSTRAP_ROOT");
  let expectedVersion = bootstrap.version + 1;
  const rotations = [];
  for (const bytes of descendants) {
    const item = metadata(bytes, "root", "ROOT_DESCENDANT");
    if (item.version !== expectedVersion) fail("ROOT_DESCENDANT_SEQUENCE_INVALID");
    rotations.push({ version: item.version, bytes: item.bytes, sha256: item.sha256,
      expires: item.expires });
    expectedVersion += 1;
  }
  const finalRoot = metadata(buffers.finalRootBytes, "root", "FINAL_ROOT");
  const expectedFinalVersion = descendants.length === 0
    ? bootstrap.version : rotations.at(-1).version;
  const expectedFinalBytes = descendants.length === 0
    ? buffers.bootstrapRootBytes : descendants.at(-1);
  if (finalRoot.version !== expectedFinalVersion
    || !buffers.finalRootBytes.equals(expectedFinalBytes)) {
    fail("FINAL_ROOT_NOT_EXACT_LAST_REPLAYED_ROOT");
  }
  let store;
  try {
    store = new TrustedMetadataStore(buffers.bootstrapRootBytes);
    store.referenceTime = new Date(selectedAt);
    for (const bytes of descendants) store.updateRoot(bytes);
    store.updateTimestamp(buffers.timestampBytes);
    store.updateSnapshot(buffers.snapshotBytes);
    store.updateDelegatedTargets(buffers.targetsBytes, "targets", "root");
    for (const [name, bytes] of [[SIGNING_TARGET, buffers.signingConfigBytes],
      [TRUST_TARGET, buffers.trustedRootBytes]]) {
      const target = store.targets?.signed?.targets?.[name];
      if (!target) fail("REQUIRED_TARGET_DESCRIPTION_MISSING");
      await target.verify(Readable.from([bytes]));
    }
  } catch (error) {
    if (String(error?.message ?? "").startsWith(PREFIX)) throw error;
    fail("OFFLINE_TUF_ROLE_CHAIN_REPLAY_FAILED", error);
  }
  const timestamp = roleFact("timestamp.json", buffers.timestampBytes, "timestamp");
  const snapshot = roleFact("snapshot.json", buffers.snapshotBytes, "snapshot");
  const targets = roleFact("targets.json", buffers.targetsBytes, "targets");
  const selection = input.selection;
  if (!plain(selection) || typeof selection.selectionHash !== "string"
    || !HASH.test(selection.selectionHash)
    || selection.signingConfigTarget?.sha256 !== sha(buffers.signingConfigBytes)
    || selection.signingConfigTarget?.length !== buffers.signingConfigBytes.length
    || selection.trustedRootTarget?.sha256 !== sha(buffers.trustedRootBytes)
    || selection.trustedRootTarget?.length !== buffers.trustedRootBytes.length) {
    fail("SELECTION_TARGET_CROSSWALK_INVALID");
  }
  const body = {
    schema: OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V2_SCHEMAS.offlineReplay,
    replayedAt: selectedAt,
    bootstrapRoot: { version: bootstrap.version, bytes: bootstrap.bytes,
      sha256: bootstrap.sha256, expires: bootstrap.expires,
      trustSource: "CALLER_RETAINED_BOOTSTRAP_BYTES" },
    rootDescendants: rotations,
    finalRoot: { version: finalRoot.version, bytes: finalRoot.bytes,
      sha256: finalRoot.sha256, expires: finalRoot.expires },
    timestamp,
    snapshot,
    targets,
    signingConfigTarget: { targetPath: SIGNING_TARGET,
      bytes: buffers.signingConfigBytes.length, sha256: sha(buffers.signingConfigBytes) },
    trustedRootTarget: { targetPath: TRUST_TARGET,
      bytes: buffers.trustedRootBytes.length, sha256: sha(buffers.trustedRootBytes) },
    selectionHash: selection.selectionHash,
    bootstrapRootSelfThresholdVerified: true,
    everyRootDescendantOldAndNewThresholdVerified: true,
    rootVersionsSequential: true,
    timestampRoleSignatureAndExpiryVerified: true,
    snapshotBytesBoundByTimestampAndRoleSignatureVerified: true,
    targetsBytesBoundBySnapshotAndRoleSignatureVerified: true,
    requiredTargetLengthAndHashesVerified: true,
    exactRetainedBytesUsedForReplay: true,
    replayUsedFreshStoreWithoutLiveClientOrCacheState: true,
    offlineReplayImplementation: `tuf-js@${TUF_JS_VERSION}:TrustedMetadataStore`,
    independentFromLiveClientState: true,
    independentCryptographicImplementationFromOfficialClient: false,
    networkIoPerformed: false,
    filesystemWritePerformed: false,
    rawMetadataOrTargetBytesProjected: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return freeze({ ...body, tufRoleChainVerificationHash: digest("offline-replay", body) });
}

function report(selection, replay, productionBootstrap) {
  if (!productionBootstrap || replay.bootstrapRoot.sha256 !== PRODUCTION_BOOTSTRAP_HASH) {
    return null;
  }
  return freeze({
    schema: OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V2_SCHEMAS
      .verificationReport,
    ok: true,
    tufRoleChainCryptographicallyVerified: true,
    signingConfigTargetBytesVerified: true,
    trustedRootTargetBytesVerified: true,
    selectionHash: selection.selectionHash,
    signingConfigTargetPath: selection.signingConfigTarget.targetPath,
    signingConfigTargetHash: selection.signingConfigTarget.sha256,
    signingConfigTargetLength: selection.signingConfigTarget.length,
    trustedRootTargetPath: selection.trustedRootTarget.targetPath,
    trustedRootTargetHash: selection.trustedRootTarget.sha256,
    trustedRootTargetLength: selection.trustedRootTarget.length,
    tufRoleChainVerificationHash: replay.tufRoleChainVerificationHash,
    exactRoleAndTargetBytesRetainedForOfflineReplay: true,
    officialClientRefreshVerified: true,
    offlineRetainedByteReplayVerified: true,
    offlineReplayUsesSameTufJsCryptographicImplementation: true,
    authority: "NONE",
    decisionState: "HOLD",
  });
}

export async function acquireSigstoreTufRekorV2RouteV2(input = {}, dependencies = {}) {
  exact(input, ["cachePath", "timeoutMs", "occurrenceNonceHash"], "INPUT");
  hash(input.occurrenceNonceHash, "OCCURRENCE_NONCE_HASH");
  if (!plain(dependencies) || Object.keys(dependencies).some((key) =>
    key !== "initTUFImpl" && key !== "clock" && key !== "bootstrapRootBytes")) {
    fail("DEPENDENCIES_INVALID");
  }
  const cachePath = safeDirectory(input.cachePath, { empty: true });
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < MIN_TIMEOUT
    || input.timeoutMs > MAX_TIMEOUT) fail("TIMEOUT_INVALID");
  const tufPackage = installedPackage("@sigstore/tuf", TUF_VERSION, "TUF_PACKAGE");
  installedPackage("tuf-js", TUF_JS_VERSION, "TUF_JS_PACKAGE");
  const production = dependencies.initTUFImpl === undefined
    && dependencies.bootstrapRootBytes === undefined;
  const bootstrapRootBytes = dependencies.bootstrapRootBytes === undefined
    ? embeddedProductionBootstrap(tufPackage)
    : Buffer.from(dependencies.bootstrapRootBytes);
  const initTUFImpl = dependencies.initTUFImpl ?? sigstoreInitTUF;
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  if (typeof initTUFImpl !== "function" || typeof clock !== "function") {
    fail("DEPENDENCY_FUNCTION_INVALID");
  }
  const startedAt = canonicalTime(clock(), "STARTED_AT");
  let client;
  try {
    client = await initTUFImpl({ mirrorURL: MIRROR, cachePath,
      retry: { retries: 0 }, timeout: input.timeoutMs,
      forceCache: false, forceInit: true });
  } catch (error) { fail("OFFICIAL_TUF_REFRESH_FAILED_NO_RETRY", error); }
  if (!client || typeof client.getTarget !== "function") fail("TUF_CLIENT_INVALID");
  let signingText;
  let trustedText;
  try { signingText = await client.getTarget(SIGNING_TARGET); }
  catch (error) { fail("SIGNING_TARGET_GET_FAILED_NO_RETRY", error); }
  try { trustedText = await client.getTarget(TRUST_TARGET); }
  catch (error) { fail("TRUST_TARGET_GET_FAILED_NO_RETRY", error); }
  const selectedAt = canonicalTime(clock(), "SELECTED_AT");
  if (Date.parse(selectedAt) < Date.parse(startedAt)) fail("CLOCK_MOVED_BACKWARDS");
  const captured = captureCache(cachePath, bootstrapRootBytes, signingText, trustedText);
  const selection = createRekorV2PinnedTufServiceSelectionV2({
    signingConfigTarget: targetDescriptor(SIGNING_TARGET,
      captured.signingConfigBytes),
    trustedRootTarget: targetDescriptor(TRUST_TARGET, captured.trustedRootBytes),
    selectedAt,
  });
  const replay = await replaySigstoreTufRekorV2RouteBytesV2({
    ...captured, selection, selectedAt,
  });
  const verifiedSelectionReport = report(selection, replay, production);
  if (production && verifiedSelectionReport === null) fail("PRODUCTION_REPORT_NOT_ESTABLISHED");
  const body = {
    schema: OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V2_SCHEMAS.projection,
    lineage: { revision: 2, predecessorSourceHash: V1_SOURCE_HASH,
      supersedesV1AcquisitionHash: V1_ACQUISITION_HASH,
      supersedesV1ManifestHash: V1_MANIFEST_HASH,
      supersedesV1ManifestFileHash: V1_MANIFEST_FILE_HASH,
      reason: "V1_DID_NOT_RETAIN_EXACT_TUF_ROLE_CHAIN_FOR_OFFLINE_REPLAY" },
    occurrenceNonceHash: input.occurrenceNonceHash,
    startedAt,
    selectedAt,
    source: { repository: "SIGSTORE_PUBLIC_GOOD_TUF", mirrorOrigin: MIRROR,
      officialClient: `@sigstore/tuf@${TUF_VERSION}`,
      officialClientPackageLockIntegrity: TUF_INTEGRITY,
      offlineReplay: `tuf-js@${TUF_JS_VERSION}:TrustedMetadataStore`,
      offlineReplayPackageLockIntegrity: TUF_JS_INTEGRITY,
      forceInitFromExactEmbeddedBootstrap: production,
      freshEmptyCacheUsed: true, retryCount: 0, timeoutMs: input.timeoutMs,
      exactTargetGets: [SIGNING_TARGET, TRUST_TARGET] },
    roleChain: { bootstrapRoot: replay.bootstrapRoot,
      rootDescendants: replay.rootDescendants, finalRoot: replay.finalRoot,
      timestamp: replay.timestamp, snapshot: replay.snapshot,
      targets: replay.targets,
      exactBytesHeldPrivate: true, rawBytesProjected: false,
      offlineReplayVerified: true,
      tufRoleChainVerificationHash: replay.tufRoleChainVerificationHash },
    route: { origin: selection.selectedService.origin,
      operator: selection.selectedService.operator,
      majorApiVersion: 2, createEntryPath: CREATE_PATH,
      createEntryUrl: `${selection.selectedService.origin}${CREATE_PATH}`,
      selector: selection.selector, selectionHash: selection.selectionHash,
      validFrom: selection.selectedService.validFrom,
      validUntil: selection.selectedService.validUntil },
    targets: { signingConfig: replay.signingConfigTarget,
      trustedRoot: replay.trustedRootTarget,
      exactBytesHeldPrivate: true, rawBytesProjected: false },
    productionRunnerCompatibleReportEstablished: verifiedSelectionReport !== null,
    officialClientRefreshVerified: true,
    retainedBytesOfflineReplayVerified: true,
    externalNetworkReadOnly: true,
    rekorPostPerformed: false,
    paymentPerformed: false,
    externalLogInclusionEstablished: false,
    trustedTimeEstablished: false,
    independentWitnessEstablished: false,
    authority: "NONE",
    capacityReserved: false,
    outcomeTruthEstablished: false,
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    permitsPricing: false,
    permitsGuarantee: false,
    permitsSettlement: false,
  };
  const projection = freeze({ ...body, acquisitionHash: digest("projection", body) });
  const handle = freeze({ projection, verifiedSelectionReport });
  PRIVATE.set(handle, { captured, selection, replay, projection,
    verifiedSelectionReport, production });
  return handle;
}

function publicationPaths(options) {
  exact(options, ["trustedRoot", "outputDirectory"], "PUBLICATION_OPTIONS");
  const trustedRoot = path.resolve(options.trustedRoot);
  const outputDirectory = path.resolve(options.outputDirectory);
  if (trustedRoot === path.parse(trustedRoot).root || outputDirectory === trustedRoot
    || path.dirname(outputDirectory) !== trustedRoot || realpathSync(trustedRoot) !== trustedRoot) {
    fail("OUTPUT_MUST_BE_NEW_DIRECT_CHILD_OF_CANONICAL_TRUSTED_ROOT");
  }
  try { lstatSync(outputDirectory); fail("OUTPUT_ALREADY_EXISTS"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  return { trustedRoot, outputDirectory };
}

function addPayload(payloads, name, role, bytes) {
  if (payloads.some((item) => item.name === name)) fail("PAYLOAD_NAME_COLLISION");
  payloads.push({ name, role, bytes: Buffer.from(bytes) });
}

export function publishSigstoreTufRekorV2RouteArtifactsV2(handle, options = {}) {
  const state = PRIVATE.get(handle);
  if (!state || !state.production || state.verifiedSelectionReport === null) {
    fail("PRODUCTION_REPLAYED_ACQUISITION_HANDLE_REQUIRED");
  }
  const paths = publicationPaths(options);
  const payloads = [];
  addPayload(payloads, "tuf/bootstrap-root.json", "TUF_BOOTSTRAP_ROOT",
    state.captured.bootstrapRootBytes);
  state.captured.rootDescendantBytes.forEach((bytes, index) => {
    const version = metadata(bytes, "root", "ROOT_DESCENDANT").version;
    addPayload(payloads,
      `tuf/root-descendants/${String(version).padStart(12, "0")}.root.json`,
      `TUF_ROOT_DESCENDANT_${index + 1}`, bytes);
  });
  addPayload(payloads, "tuf/final-root.json", "TUF_FINAL_ROOT",
    state.captured.finalRootBytes);
  addPayload(payloads, "tuf/timestamp.json", "TUF_TIMESTAMP",
    state.captured.timestampBytes);
  addPayload(payloads, "tuf/snapshot.json", "TUF_SNAPSHOT",
    state.captured.snapshotBytes);
  addPayload(payloads, "tuf/targets.json", "TUF_TARGETS",
    state.captured.targetsBytes);
  addPayload(payloads, `tuf/target-files/${SIGNING_TARGET}`,
    "SIGNING_CONFIG_TARGET", state.captured.signingConfigBytes);
  addPayload(payloads, `tuf/target-files/${TRUST_TARGET}`,
    "TRUSTED_ROOT_TARGET", state.captured.trustedRootBytes);
  addPayload(payloads, "rekor-v2-route-selection.json", "REKOR_V2_SELECTION",
    Buffer.from(`${canonicalizeStrict(state.selection)}\n`));
  addPayload(payloads, "offline-tuf-replay-report.json", "OFFLINE_REPLAY_REPORT",
    Buffer.from(`${canonicalizeStrict(state.replay)}\n`));
  addPayload(payloads, "verified-tuf-selection-report.json", "RUNNER_COMPATIBLE_REPORT",
    Buffer.from(`${canonicalizeStrict(state.verifiedSelectionReport)}\n`));
  addPayload(payloads, "privacy-safe-route-projection.json", "PUBLIC_PROJECTION",
    Buffer.from(`${canonicalizeStrict(state.projection)}\n`));
  const fileFacts = payloads.map((item) => ({ name: item.name, role: item.role,
    bytes: item.bytes.length, sha256: sha(item.bytes), mode: "0600" }));
  const manifestBody = {
    schema: OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V2_SCHEMAS.manifest,
    lineage: state.projection.lineage,
    acquisitionHash: state.projection.acquisitionHash,
    tufRoleChainVerificationHash: state.replay.tufRoleChainVerificationHash,
    selectionHash: state.selection.selectionHash,
    files: fileFacts,
    exactRoleAndTargetBytesRetained: true,
    offlineReplayPassedBeforePublication: true,
    manifestPublishedLast: true,
    authority: "NONE",
    decisionState: "HOLD",
  };
  const manifest = freeze({ ...manifestBody, manifestHash: digest("manifest", manifestBody) });
  for (const item of payloads) {
    publishPrivateArtifact(path.join(paths.outputDirectory, item.name), item.bytes,
      { trustedRoot: paths.trustedRoot, allowExistingIdentical: false });
  }
  const manifestBytes = Buffer.from(`${canonicalizeStrict(manifest)}\n`);
  publishPrivateArtifact(path.join(paths.outputDirectory, "manifest.json"), manifestBytes,
    { trustedRoot: paths.trustedRoot, allowExistingIdentical: false });
  return freeze({ outputDirectory: paths.outputDirectory, manifest,
    manifestFile: { name: "manifest.json", bytes: manifestBytes.length,
      sha256: sha(manifestBytes), mode: "0600" } });
}

export async function verifyPublishedSigstoreTufRekorV2RouteArtifactsV2(
  directory, expectedManifestFileHash) {
  const root = path.resolve(directory);
  if (realpathSync(root) !== root) fail("PUBLISHED_DIRECTORY_NON_CANONICAL");
  const manifestBytes = readRegular(path.join(root, "manifest.json"), "MANIFEST");
  if (sha(manifestBytes) !== hash(expectedManifestFileHash,
    "EXPECTED_MANIFEST_FILE_HASH")) fail("MANIFEST_FILE_HASH_MISMATCH");
  const manifest = json(manifestBytes, "MANIFEST");
  if (manifest.schema
      !== OUTSIDER_SIGSTORE_TUF_REKOR_V2_ROUTE_ACQUISITION_V2_SCHEMAS.manifest
    || !Array.isArray(manifest.files)) fail("MANIFEST_INVALID");
  const byRole = new Map();
  for (const item of manifest.files) {
    if (!plain(item) || typeof item.name !== "string" || typeof item.role !== "string"
      || !Number.isSafeInteger(item.bytes) || !HASH.test(item.sha256)
      || item.mode !== "0600" || byRole.has(item.role)) fail("MANIFEST_FILE_INVALID");
    const file = path.join(root, item.name);
    const bytes = readRegular(file, "ARTIFACT_FILE");
    const stat = lstatSync(file, { bigint: true });
    if (Number(stat.mode & 0o777n) !== 0o600 || bytes.length !== item.bytes
      || sha(bytes) !== item.sha256) fail("ARTIFACT_FILE_COMMITMENT_MISMATCH");
    byRole.set(item.role, bytes);
  }
  const selection = json(byRole.get("REKOR_V2_SELECTION"), "SELECTION");
  const projection = json(byRole.get("PUBLIC_PROJECTION"), "PROJECTION");
  const rootDescendants = [...byRole].filter(([role]) =>
    role.startsWith("TUF_ROOT_DESCENDANT_")).sort(([left], [right]) =>
    Number(left.slice(20)) - Number(right.slice(20))).map(([, bytes]) => bytes);
  const replay = await replaySigstoreTufRekorV2RouteBytesV2({
    bootstrapRootBytes: byRole.get("TUF_BOOTSTRAP_ROOT"),
    rootDescendantBytes: rootDescendants,
    finalRootBytes: byRole.get("TUF_FINAL_ROOT"),
    timestampBytes: byRole.get("TUF_TIMESTAMP"),
    snapshotBytes: byRole.get("TUF_SNAPSHOT"),
    targetsBytes: byRole.get("TUF_TARGETS"),
    signingConfigBytes: byRole.get("SIGNING_CONFIG_TARGET"),
    trustedRootBytes: byRole.get("TRUSTED_ROOT_TARGET"),
    selection,
    selectedAt: projection.selectedAt,
  });
  if (replay.tufRoleChainVerificationHash !== manifest.tufRoleChainVerificationHash) {
    fail("PUBLISHED_OFFLINE_REPLAY_HASH_MISMATCH");
  }
  return freeze({ ok: true, manifestHash: manifest.manifestHash,
    manifestFileHash: sha(manifestBytes),
    tufRoleChainVerificationHash: replay.tufRoleChainVerificationHash,
    selectionHash: selection.selectionHash,
    exactRetainedBytesOfflineReplayed: true,
    networkIoPerformed: false, authority: "NONE", decisionState: "HOLD" });
}

