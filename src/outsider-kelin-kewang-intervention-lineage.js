/*
 * Fixed-revision linked lineage for KelinLiIC/intervention_1,
 * KelinLiIC/intervention_2, and the already verified
 * KeWangRobotics/peg_intervention artifact. The two Kelin repositories are
 * acquired as complete no-video closures. Their hand-camera objects are
 * cross-bound to the existing KeWang source bytes rather than duplicated;
 * every base-camera object remains exact tree inventory only.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";
import {
  verifyPegInterventionArtifact, verifyPegInterventionArtifactWithSource,
  verifyPegInterventionSourceDirectory,
} from "./outsider-peg-intervention.js";

export const KELIN_KEWANG_LINEAGE_FROZEN_AT =
  "2026-08-30T00:00:00.000Z";
export const KELIN_KEWANG_LINEAGE_SOURCE_SCHEMA =
  "outsider/kelin-kewang-intervention-lineage-source/v1";
export const KELIN_KEWANG_LINEAGE_ARTIFACT_SCHEMA =
  "outsider/kelin-kewang-intervention-lineage/v1";
export const KELIN_KEWANG_SOURCES = Object.freeze([
  Object.freeze({ key: "intervention_1", id: "KelinLiIC/intervention_1",
    revision: "4d13af74b04a1b63572f7841657c9527f8ce84cc",
    usedStorage: 535_676_491, treeEntries: 20, treeDirectories: 10,
    treeFiles: 10, treeBytes: 535_707_700,
    noVideoFiles: 7, noVideoBytes: 3_215_519,
    baseVideoFiles: 2, baseVideoBytes: 397_934_510,
    handVideoFiles: 1, handVideoBytes: 134_557_671,
    episodes: 44, frames: 18_455,
    handSha256:
      "sha256:16e66bc26001dd1de8acadf67696bd67b907186b062b9307893756044621ff00",
    cacheDirectory: "/private/tmp/kelin1-no-video" }),
  Object.freeze({ key: "intervention_2", id: "KelinLiIC/intervention_2",
    revision: "ab61fc8954b20c16514575fe9e087491b8cb6333",
    usedStorage: 603_518_037, treeEntries: 21, treeDirectories: 10,
    treeFiles: 11, treeBytes: 603_549_243,
    noVideoFiles: 7, noVideoBytes: 3_757_809,
    baseVideoFiles: 3, baseVideoBytes: 449_247_096,
    handVideoFiles: 1, handVideoBytes: 150_544_338,
    episodes: 62, frames: 20_840,
    handSha256:
      "sha256:6c4697341440ad4a84142e57decc1feac8f244061622610d4a3b69389752a887",
    cacheDirectory: "/private/tmp/kelin2-no-video" }),
]);
export const KELIN_KEWANG_LINEAGE_PROFILE = Object.freeze({
  repositoryUsedStorageBytes: 1_139_194_528,
  recursiveTreeEntries: 41, recursiveTreeDirectories: 20,
  recursiveTreeFiles: 21, recursiveTreeBytes: 1_139_256_943,
  acquiredNoVideoFiles: 14, acquiredNoVideoBytes: 6_973_328,
  crossBoundHandVideoFiles: 2, crossBoundHandVideoBytes: 285_102_009,
  baseVideoInventoryFiles: 5, baseVideoInventoryBytes: 847_181_606,
  sourceEpisodeOccurrences: 106, uniqueMergedEpisodes: 106,
  sourceFrameOccurrences: 39_295, uniqueMergedFrames: 39_295,
});

const KE_ARTIFACT_DIRECTORY =
  "artifacts/outsider-peg-intervention-20260830-v1";
const KE_ID = "KeWangRobotics/peg_intervention";
const KE_REVISION = "a521f26020d464a23c19a3fbb24ee10e9f10216c";
const KE_ARTIFACT_HASH =
  "sha256:99b7a505aa26ca35407f9f1b22f9c391f041408be6fead2d7a500c0825a3bca5";
const KE_SOURCE_MANIFEST_HASH =
  "sha256:a62f2ab977ed102139743c27cf20f9da08fda4ba0b7a7227507e90a30606e8da";
const KE_SOURCE_ROOT =
  "sha256:c619f78517b3d03fcf8f144b224b8f1647d50fb9f34d803ae22942f112e343e5";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const NO_VIDEO_PATHS = Object.freeze([
  ".gitattributes", "README.md", "data/chunk-000/file-000.parquet",
  "meta/episodes/chunk-000/file-000.parquet", "meta/info.json",
  "meta/stats.json", "meta/tasks.parquet",
]);
const FETCH_ATTEMPTS = 6;

function fail(code, detail = null) {
  throw new Error(detail === null ? `KELIN_KEWANG_LINEAGE_${code}`
    : `KELIN_KEWANG_LINEAGE_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function kelinKewangLineageSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return kelinKewangLineageSha256(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes).digest("hex");
}

function safeRemotePath(value) {
  return typeof value === "string" && value.length > 0 && value.length < 4096
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "."
      && part !== "..");
}

function safeJoin(root, relative) {
  if (!safeRemotePath(relative)) fail("PATH_REFUSED", String(relative));
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  const rel = path.relative(base, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`)
    || path.isAbsolute(rel)) fail("PATH_ESCAPE", relative);
  return target;
}

function ensureDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function writeExclusive(file, bytes) {
  ensureDirectory(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function writeCanonical(file, value) {
  writeExclusive(file, canonicalBytes(value));
}

function enforcePrivateTree(root) {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("TREE_UNSAFE", root);
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) enforcePrivateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

function scanFiles(root, excluded = new Set()) {
  const files = [];
  const directories = [path.resolve(root)];
  for (let index = 0; index < directories.length; index += 1) {
    for (const entry of readdirSync(directories[index], { withFileTypes: true })) {
      const child = path.join(directories[index], entry.name);
      if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
      if (entry.isDirectory()) directories.push(child);
      else if (entry.isFile()) {
        const relative = path.relative(path.resolve(root), child).split(path.sep).join("/");
        if (!excluded.has(relative)) {
          const bytes = readFileSync(child);
          files.push({ path: relative, bytes: bytes.length,
            sha256: kelinKewangLineageSha256(bytes) });
        }
      } else fail("SPECIAL_FILE_REFUSED", child);
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function permittedUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname === "huggingface.co"
      && parsed.username === "" && parsed.password === "";
  } catch { return false; }
}

function headersObject(headers) {
  const result = {};
  if (headers && typeof headers.entries === "function") {
    for (const [key, value] of headers.entries()) result[key.toLowerCase()] = value;
  }
  return result;
}

function retryable(error) {
  return error?.name === "AbortError" || error?.retryable === true
    || /(?:fetch failed|network|timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN|socket)/iu
      .test(String(error?.message ?? error));
}

async function fetchOnce(url, fetchImpl) {
  if (!permittedUrl(url)) fail("URL_REFUSED", url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "follow",
      signal: controller.signal, headers: { Accept: "application/json",
        "Accept-Encoding": "identity", "User-Agent": "outsider-source-intake/1" } });
    if (!response || typeof response.arrayBuffer !== "function") {
      fail("FETCH_RESPONSE_INVALID");
    }
    if (response.status !== 200) {
      const error = new Error(`HTTP_${response.status}`);
      error.retryable = response.status === 408 || response.status === 425
        || response.status === 429 || response.status >= 500;
      throw error;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 16 * 1024 * 1024) fail("API_BODY_TOO_LARGE");
    if (!permittedUrl(response.url || url)) fail("FINAL_URL_REFUSED");
    return { status: response.status, finalUrl: response.url || url, bytes,
      headers: headersObject(response.headers) };
  } finally { clearTimeout(timer); }
}

async function boundedFetch(url, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try { return await fetchOnce(url, fetchImpl); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === FETCH_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw last;
}

function jsonValue(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail("JSON_INVALID", `${label}:${error.message}`); }
}

function endpoints(profile) {
  const id = profile.id.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `https://huggingface.co/api/datasets/${id}/revision/${profile.revision}`,
    tree: `https://huggingface.co/api/datasets/${id}/tree/${profile.revision}`
      + "?recursive=true&expand=false&limit=1000",
  };
}

function repositoryProjection(value, profile) {
  if (!plain(value) || !Array.isArray(value.siblings)) fail("REPOSITORY_INVALID");
  const siblingPaths = value.siblings.map((row) => row.rfilename)
    .sort((left, right) => left.localeCompare(right));
  const projection = { id: value.id, sha: value.sha, private: value.private,
    gated: value.gated, disabled: value.disabled, usedStorage: value.usedStorage,
    cardLicense: value.cardData?.license ?? null,
    taskCategories: value.cardData?.task_categories ?? null,
    cardTags: value.cardData?.tags ?? null, siblingPaths };
  if (projection.id !== profile.id || projection.sha !== profile.revision
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false || projection.usedStorage !== profile.usedStorage
    || projection.cardLicense !== "apache-2.0"
    || !projection.taskCategories?.includes("robotics")
    || siblingPaths.length !== profile.treeFiles
    || siblingPaths.some((entry) => !safeRemotePath(entry))) {
    fail("REPOSITORY_PROFILE_INVALID", profile.key);
  }
  return projection;
}

function projectTree(entries, profile) {
  if (!Array.isArray(entries)) fail("TREE_INVALID", profile.key);
  const projection = entries.map((entry) => {
    if (!plain(entry) || !safeRemotePath(entry.path)
      || !["file", "directory"].includes(entry.type)
      || !SHA1.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID", profile.key);
    if (entry.type === "directory") return { path: entry.path, type: "directory",
      oid: entry.oid, sizeBytes: 0, lfsSha256: null };
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
      fail("TREE_SIZE_INVALID", entry.path);
    }
    if (entry.lfs == null) return { path: entry.path, type: "file",
      oid: entry.oid, sizeBytes: entry.size, lfsSha256: null };
    if (!plain(entry.lfs) || !SHA256.test(entry.lfs.oid ?? "")
      || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
    return { path: entry.path, type: "file", oid: entry.oid,
      sizeBytes: entry.size, lfsSha256: `sha256:${entry.lfs.oid}` };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const files = projection.filter((entry) => entry.type === "file");
  const directories = projection.filter((entry) => entry.type === "directory");
  const noVideo = files.filter((entry) => NO_VIDEO_PATHS.includes(entry.path));
  const base = files.filter((entry) => entry.path.includes("base_camera"));
  const hand = files.filter((entry) => entry.path.includes("hand_camera"));
  const bytes = (rows) => rows.reduce((sum, row) => sum + row.sizeBytes, 0);
  if (projection.length !== profile.treeEntries
    || files.length !== profile.treeFiles
    || directories.length !== profile.treeDirectories
    || bytes(files) !== profile.treeBytes
    || noVideo.length !== profile.noVideoFiles
    || bytes(noVideo) !== profile.noVideoBytes
    || base.length !== profile.baseVideoFiles || bytes(base) !== profile.baseVideoBytes
    || hand.length !== 1 || bytes(hand) !== profile.handVideoBytes
    || hand[0].lfsSha256 !== profile.handSha256
    || files.some((entry) => /(?:^|\/)LICENSE(?:\.|$)/iu.test(entry.path))) {
    fail("TREE_PROFILE_INVALID", profile.key);
  }
  return { projection, files, directories, noVideo, base, hand,
    treeHash: digest(`outsider/kelin-kewang-tree/${profile.key}/v1`, projection) };
}

function parseNext(link) {
  if (link == null || link === "") return null;
  for (const item of link.split(",")) {
    const match = item.match(/^\s*<([^>]+)>;\s*rel="next"\s*$/u);
    if (match) {
      if (!permittedUrl(match[1])) fail("PAGINATION_URL_REFUSED", match[1]);
      return match[1];
    }
  }
  return null;
}

async function captureRepository(stage, bracket, profile, fetchImpl) {
  const urls = endpoints(profile);
  const base = `api/${bracket}/${profile.key}`;
  const repository = await boundedFetch(urls.repository, fetchImpl);
  writeExclusive(safeJoin(stage, `${base}/repository.raw.json`), repository.bytes);
  writeCanonical(safeJoin(stage, `${base}/repository.headers.json`), {
    status: repository.status, finalUrl: repository.finalUrl,
    headers: repository.headers,
  });
  const repositoryValue = jsonValue(repository.bytes, `${profile.key}:repository`);
  const projectedRepository = repositoryProjection(repositoryValue, profile);
  writeCanonical(safeJoin(stage, `${base}/repository.projection.json`),
    projectedRepository);
  const pages = [];
  const entries = [];
  let next = urls.tree;
  for (let page = 0; next !== null; page += 1) {
    if (page > 10) fail("TREE_PAGE_LIMIT", profile.key);
    const response = await boundedFetch(next, fetchImpl);
    const rows = jsonValue(response.bytes, `${profile.key}:tree:${page}`);
    if (!Array.isArray(rows)) fail("TREE_PAGE_INVALID", profile.key);
    writeExclusive(safeJoin(stage, `${base}/tree-page-${page}.raw.json`),
      response.bytes);
    writeCanonical(safeJoin(stage, `${base}/tree-page-${page}.headers.json`), {
      status: response.status, finalUrl: response.finalUrl,
      headers: response.headers,
    });
    const nextUrl = parseNext(response.headers.link);
    pages.push({ page, entries: rows.length, hasNext: nextUrl !== null,
      pageHash: kelinKewangLineageSha256(response.bytes) });
    entries.push(...rows);
    next = nextUrl;
  }
  const tree = projectTree(entries, profile);
  writeCanonical(safeJoin(stage, `${base}/tree.projection.json`), {
    treeHash: tree.treeHash, pages, entries: tree.projection,
  });
  return { repository: projectedRepository, tree, pages };
}

function validateObject(entry, bytes) {
  if (bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_INVALID", entry.path);
  const hash = kelinKewangLineageSha256(bytes);
  if (entry.lfsSha256 !== null) {
    if (hash !== entry.lfsSha256) fail("OBJECT_LFS_HASH_INVALID", entry.path);
  } else if (gitBlobOid(bytes) !== entry.oid) fail("OBJECT_GIT_OID_INVALID", entry.path);
  return hash;
}

function copyCachedNoVideo(stage, captures, cacheDirectories) {
  const records = [];
  for (const profile of KELIN_KEWANG_SOURCES) {
    const sourceRoot = path.resolve(cacheDirectories[profile.key]);
    const sourceStat = lstatSync(sourceRoot);
    if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) {
      fail("CACHE_DIRECTORY_UNSAFE", profile.key);
    }
    const tree = captures[profile.key].tree;
    for (const remotePath of NO_VIDEO_PATHS) {
      const entry = tree.noVideo.find((row) => row.path === remotePath);
      if (!entry) fail("CACHE_TREE_ENTRY_MISSING", `${profile.key}:${remotePath}`);
      const source = safeJoin(sourceRoot, remotePath);
      const stat = lstatSync(source);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        fail("CACHE_OBJECT_UNSAFE", `${profile.key}:${remotePath}`);
      }
      const bytes = readFileSync(source);
      const sha256 = validateObject(entry, bytes);
      writeExclusive(safeJoin(stage, `objects/${profile.key}/${remotePath}`), bytes);
      records.push({ source: profile.key, path: remotePath, bytes: bytes.length,
        sha256, oid: entry.oid, lfsSha256: entry.lfsSha256,
        acquisition: "VERIFIED_FIXED_REVISION_ROOT_PREFETCH_CACHE" });
    }
  }
  return records.sort((left, right) =>
    `${left.source}/${left.path}`.localeCompare(`${right.source}/${right.path}`));
}

function copyKeLinkEvidence(stage, keArtifactDirectory) {
  const directory = path.resolve(keArtifactDirectory);
  const sourceDirectory = path.join(directory, "source");
  const sourceChecked = verifyPegInterventionSourceDirectory(sourceDirectory);
  if (!sourceChecked.ok) fail("KE_SOURCE_INVALID", sourceChecked.error);
  if (sourceChecked.manifest.manifestHash !== KE_SOURCE_MANIFEST_HASH
    || sourceChecked.manifest.sourceRoot !== KE_SOURCE_ROOT) fail("KE_SOURCE_DRIFT");
  const names = ["peg-intervention.json", "artifact-manifest.json", "receipt.json"];
  const copied = [];
  for (const name of names) {
    const file = path.join(directory, name);
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) fail("KE_LINK_FILE_UNSAFE", name);
    const bytes = readFileSync(file);
    writeExclusive(safeJoin(stage, `links/kewang-peg/${name}`), bytes);
    copied.push({ path: name, bytes: bytes.length,
      sha256: kelinKewangLineageSha256(bytes) });
  }
  const sourceManifestBytes = readFileSync(path.join(sourceDirectory,
    "acquisition-manifest.json"));
  writeExclusive(safeJoin(stage,
    "links/kewang-peg/source-acquisition-manifest.json"), sourceManifestBytes);
  copied.push({ path: "source-acquisition-manifest.json",
    bytes: sourceManifestBytes.length,
    sha256: kelinKewangLineageSha256(sourceManifestBytes) });
  const report = jsonValue(readFileSync(path.join(directory,
    "peg-intervention.json")), "ke-report");
  const standalone = verifyPegInterventionArtifact(report);
  if (!standalone.ok || report.artifactHash !== KE_ARTIFACT_HASH
    || report.source.id !== KE_ID || report.source.revision !== KE_REVISION) {
    fail("KE_ARTIFACT_INVALID", standalone.error);
  }
  return { copied, report, sourceChecked, directory, sourceDirectory };
}

function buildCrossBinds(captures, ke) {
  const map = {
    intervention_2:
      "videos/observation.images.hand_camera/chunk-000/file-000.mp4",
    intervention_1:
      "videos/observation.images.hand_camera/chunk-000/file-001.mp4",
  };
  return KELIN_KEWANG_SOURCES.map((profile) => {
    const sourceEntry = captures[profile.key].tree.hand[0];
    const kePath = map[profile.key];
    const keObject = ke.sourceChecked.manifest.remoteObjects.find((row) =>
      row.path === kePath);
    if (!keObject || keObject.sha256 !== profile.handSha256
      || sourceEntry.lfsSha256 !== keObject.sha256
      || sourceEntry.sizeBytes !== keObject.bytes) {
      fail("HAND_CROSS_BIND_INVALID", profile.key);
    }
    return { source: profile.key, sourcePath: sourceEntry.path,
      sourceRevision: profile.revision, bytes: sourceEntry.sizeBytes,
      sha256: sourceEntry.lfsSha256, nestedArtifactId: KE_ID,
      nestedArtifactRevision: KE_REVISION, nestedArtifactPath: kePath,
      nestedArtifactHash: KE_ARTIFACT_HASH,
      nestedSourceManifestHash: KE_SOURCE_MANIFEST_HASH,
      nestedSourceRoot: KE_SOURCE_ROOT,
      disposition: "CROSS_BOUND_VERIFIED_KEWANG_SOURCE_BYTES_NOT_DUPLICATED" };
  }).sort((left, right) => left.source.localeCompare(right.source));
}

function terminalDispositions(captures) {
  const result = [];
  for (const profile of KELIN_KEWANG_SOURCES) {
    for (const entry of captures[profile.key].tree.files) {
      if (NO_VIDEO_PATHS.includes(entry.path)) {
        result.push({ source: profile.key, path: entry.path,
          bytes: entry.sizeBytes, disposition: "ACQUIRED_AND_REPLAYED",
          reason: "COMPLETE_SEMANTIC_NO_VIDEO_CLOSURE" });
      } else if (entry.path.includes("hand_camera")) {
        result.push({ source: profile.key, path: entry.path,
          bytes: entry.sizeBytes,
          disposition: "CROSS_BOUND_EXISTING_KEWANG_BYTES_NOT_DUPLICATED",
          reason: "IDENTICAL_LFS_OBJECT_AND_SOURCE_BOUND_NESTED_ARTIFACT" });
      } else {
        result.push({ source: profile.key, path: entry.path,
          bytes: entry.sizeBytes, disposition: "TREE_INVENTORY_ONLY_NOT_ACQUIRED",
          reason: "BASE_CAMERA_EXCLUDED_FROM_BOUNDED_LINKED_LINEAGE" });
      }
    }
  }
  return result.sort((left, right) =>
    `${left.source}/${left.path}`.localeCompare(`${right.source}/${right.path}`));
}

export async function acquirePinnedKelinKewangLineageSource(sourceDirectory,
  options = {}) {
  const target = path.resolve(sourceDirectory);
  if (existsSync(target)) fail("SOURCE_EXISTS", target);
  const checkpoint = path.resolve(options.checkpointDirectory
    ?? `${target}.checkpoint`);
  if (existsSync(checkpoint)) fail("CHECKPOINT_EXISTS", checkpoint);
  ensureDirectory(checkpoint);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  const cacheDirectories = Object.fromEntries(KELIN_KEWANG_SOURCES.map((profile) =>
    [profile.key, options.cacheDirectories?.[profile.key]
      ?? profile.cacheDirectory]));
  const before = {};
  for (const profile of KELIN_KEWANG_SOURCES) {
    before[profile.key] = await captureRepository(checkpoint, "before", profile,
      fetchImpl);
  }
  const remoteObjects = copyCachedNoVideo(checkpoint, before, cacheDirectories);
  const ke = copyKeLinkEvidence(checkpoint,
    options.keArtifactDirectory ?? KE_ARTIFACT_DIRECTORY);
  const crossBinds = buildCrossBinds(before, ke);
  const after = {};
  for (const profile of KELIN_KEWANG_SOURCES) {
    after[profile.key] = await captureRepository(checkpoint, "after", profile,
      fetchImpl);
    if (!same(before[profile.key].repository, after[profile.key].repository)
      || before[profile.key].tree.treeHash !== after[profile.key].tree.treeHash
      || !same(before[profile.key].pages, after[profile.key].pages)) {
      fail("SOURCE_CHANGED_DURING_ACQUISITION", profile.key);
    }
  }
  const dispositions = terminalDispositions(before);
  const sourceFiles = scanFiles(checkpoint);
  const body = {
    schema: KELIN_KEWANG_LINEAGE_SOURCE_SCHEMA,
    frozenAt: KELIN_KEWANG_LINEAGE_FROZEN_AT,
    sources: KELIN_KEWANG_SOURCES.map((profile) => ({ key: profile.key,
      id: profile.id, revision: profile.revision,
      repositoryProjection: before[profile.key].repository,
      treeHash: before[profile.key].tree.treeHash,
      treePages: before[profile.key].pages })),
    beforeTreeHashes: Object.fromEntries(KELIN_KEWANG_SOURCES.map((profile) =>
      [profile.key, before[profile.key].tree.treeHash])),
    afterTreeHashes: Object.fromEntries(KELIN_KEWANG_SOURCES.map((profile) =>
      [profile.key, after[profile.key].tree.treeHash])),
    remoteObjects, crossBinds,
    nestedKeArtifact: { id: KE_ID, revision: KE_REVISION,
      artifactHash: KE_ARTIFACT_HASH, sourceManifestHash: KE_SOURCE_MANIFEST_HASH,
      sourceRoot: KE_SOURCE_ROOT, copiedEvidence: ke.copied },
    terminalDispositions: dispositions,
    closure: {
      allPublishedEpisodesInBothSelectedDataFiles: true,
      completeSemanticNoVideoClosureBothRepositories: true,
      allRepositoryFilesHaveTerminalDisposition: true,
      recursiveTreesCapturedBeforeAndAfter: true,
      noFurtherTreePagesBeforeOrAfter: true,
      repositoryUsedStorageBytes: 1_139_194_528,
      recursiveTreeEntries: 41, recursiveTreeDirectories: 20,
      recursiveTreeFiles: 21, recursiveTreeBytes: 1_139_256_943,
      repositoryUsedStorageAndTreeBytesAreDistinctMeasures: true,
      acquiredNoVideoFiles: 14, acquiredNoVideoBytes: 6_973_328,
      crossBoundHandVideoFiles: 2, crossBoundHandVideoBytes: 285_102_009,
      newlyAcquiredHandVideoFiles: 0, newlyAcquiredHandVideoBytes: 0,
      baseVideoFilesInventoryOnly: 5, baseVideoBytesInventoryOnly: 847_181_606,
      evidenceCoveredFiles: 16, evidenceCoveredBytes: 292_075_337,
      completeFixedRepositoriesAcquired: false,
      randomTruncation: false,
    },
    sourceFiles,
    sourceRoot: digest("outsider/kelin-kewang-intervention-lineage-source-root/v1",
      sourceFiles),
  };
  const manifest = { ...body,
    manifestHash: digest(
      "outsider/kelin-kewang-intervention-lineage-source-manifest/v1", body) };
  writeCanonical(path.join(checkpoint, "acquisition-manifest.json"), manifest);
  enforcePrivateTree(checkpoint);
  renameSync(checkpoint, target);
  chmodSync(target, 0o700);
  return verifyKelinKewangLineageSourceDirectory(target, {
    keArtifactDirectory: options.keArtifactDirectory ?? KE_ARTIFACT_DIRECTORY,
  });
}

function readSource(root, relative) {
  const file = safeJoin(root, relative);
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) fail("SOURCE_FILE_UNSAFE", relative);
  return file;
}

function readCapture(sourceDirectory, bracket, profile) {
  const base = `api/${bracket}/${profile.key}`;
  const repository = jsonValue(readFileSync(readSource(sourceDirectory,
    `${base}/repository.projection.json`)), `${base}:repository`);
  const treeDocument = jsonValue(readFileSync(readSource(sourceDirectory,
    `${base}/tree.projection.json`)), `${base}:tree`);
  const tree = projectTree(treeDocument.entries.map((entry) => ({
    path: entry.path, type: entry.type, oid: entry.oid,
    size: entry.sizeBytes,
    lfs: entry.lfsSha256 === null ? null : {
      oid: entry.lfsSha256.slice("sha256:".length), size: entry.sizeBytes,
    },
  })), profile);
  if (tree.treeHash !== treeDocument.treeHash
    || !same(treeDocument.pages, [{ page: 0,
      entries: profile.treeEntries, hasNext: false,
      pageHash: treeDocument.pages[0]?.pageHash }])) {
    fail("CAPTURE_TREE_INVALID", `${bracket}:${profile.key}`);
  }
  return { repository, tree, pages: treeDocument.pages };
}

export function verifyKelinKewangLineageSourceDirectory(sourceDirectory,
  options = {}) {
  try {
    const manifest = jsonValue(readFileSync(readSource(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== KELIN_KEWANG_LINEAGE_SOURCE_SCHEMA
      || manifest.frozenAt !== KELIN_KEWANG_LINEAGE_FROZEN_AT
      || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_SHAPE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest(
      "outsider/kelin-kewang-intervention-lineage-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    const files = scanFiles(sourceDirectory, new Set(["acquisition-manifest.json"]));
    if (!same(files, manifest.sourceFiles)
      || manifest.sourceRoot !== digest(
        "outsider/kelin-kewang-intervention-lineage-source-root/v1", files)) {
      fail("SOURCE_ROOT_INVALID");
    }
    const before = {};
    const after = {};
    for (const profile of KELIN_KEWANG_SOURCES) {
      before[profile.key] = readCapture(sourceDirectory, "before", profile);
      after[profile.key] = readCapture(sourceDirectory, "after", profile);
      if (!same(before[profile.key].repository, after[profile.key].repository)
        || before[profile.key].tree.treeHash !== after[profile.key].tree.treeHash
        || before[profile.key].pages.length !== 1
        || before[profile.key].pages[0].hasNext !== false
        || !same(before[profile.key].pages, after[profile.key].pages)) {
        fail("API_BRACKET_INVALID", profile.key);
      }
    }
    if (!Array.isArray(manifest.remoteObjects)
      || manifest.remoteObjects.length !== 14) fail("OBJECT_CLOSURE_INVALID");
    for (const record of manifest.remoteObjects) {
      const entry = before[record.source].tree.noVideo.find((row) =>
        row.path === record.path);
      const bytes = readFileSync(readSource(sourceDirectory,
        `objects/${record.source}/${record.path}`));
      if (!entry || validateObject(entry, bytes) !== record.sha256
        || record.acquisition !== "VERIFIED_FIXED_REVISION_ROOT_PREFETCH_CACHE") {
        fail("OBJECT_INVALID", `${record.source}:${record.path}`);
      }
    }
    if (!Array.isArray(manifest.crossBinds) || manifest.crossBinds.length !== 2
      || manifest.crossBinds.reduce((sum, row) => sum + row.bytes, 0)
        !== 285_102_009
      || manifest.crossBinds.some((row) =>
        row.disposition
          !== "CROSS_BOUND_VERIFIED_KEWANG_SOURCE_BYTES_NOT_DUPLICATED")) {
      fail("CROSS_BIND_MANIFEST_INVALID");
    }
    const keDirectory = path.resolve(options.keArtifactDirectory
      ?? KE_ARTIFACT_DIRECTORY);
    const keChecked = verifyPegInterventionSourceDirectory(path.join(keDirectory,
      "source"));
    if (!keChecked.ok || keChecked.manifest.manifestHash !== KE_SOURCE_MANIFEST_HASH
      || keChecked.manifest.sourceRoot !== KE_SOURCE_ROOT) {
      fail("KE_SOURCE_LINK_INVALID", keChecked.error);
    }
    for (const row of manifest.crossBinds) {
      const nested = keChecked.manifest.remoteObjects.find((entry) =>
        entry.path === row.nestedArtifactPath);
      if (!nested || nested.bytes !== row.bytes || nested.sha256 !== row.sha256) {
        fail("KE_HAND_LINK_INVALID", row.source);
      }
    }
    const linkedReport = jsonValue(readFileSync(readSource(sourceDirectory,
      "links/kewang-peg/peg-intervention.json")), "linked-ke-report");
    const linkedChecked = verifyPegInterventionArtifact(linkedReport);
    if (!linkedChecked.ok || linkedReport.artifactHash !== KE_ARTIFACT_HASH
      || linkedReport.source.sourceManifestHash !== KE_SOURCE_MANIFEST_HASH
      || linkedReport.source.sourceRoot !== KE_SOURCE_ROOT) {
      fail("LINKED_KE_REPORT_INVALID", linkedChecked.error);
    }
    if (!Array.isArray(manifest.terminalDispositions)
      || manifest.terminalDispositions.length !== 21
      || manifest.terminalDispositions.filter((row) =>
        row.disposition === "ACQUIRED_AND_REPLAYED").length !== 14
      || manifest.terminalDispositions.filter((row) =>
        row.disposition === "CROSS_BOUND_EXISTING_KEWANG_BYTES_NOT_DUPLICATED")
        .length !== 2
      || manifest.terminalDispositions.filter((row) =>
        row.disposition === "TREE_INVENTORY_ONLY_NOT_ACQUIRED").length !== 5) {
      fail("DISPOSITION_INVALID");
    }
    if (manifest.closure?.acquiredNoVideoFiles !== 14
      || manifest.closure?.acquiredNoVideoBytes !== 6_973_328
      || manifest.closure?.crossBoundHandVideoFiles !== 2
      || manifest.closure?.newlyAcquiredHandVideoBytes !== 0
      || manifest.closure?.baseVideoBytesInventoryOnly !== 847_181_606
      || manifest.closure?.completeSemanticNoVideoClosureBothRepositories !== true
      || manifest.closure?.allRepositoryFilesHaveTerminalDisposition !== true) {
      fail("CLOSURE_INVALID");
    }
    return { ok: true, manifest, before, after, linkedKeReport: linkedReport,
      keChecked, verificationLevel:
        "TWO_PINNED_NO_VIDEO_CLOSURES_PLUS_NESTED_KE_HAND_OBJECT_CROSS_BIND" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYTHON_KELIN_KEWANG_LINEAGE_REPLAY = String.raw`
import collections
import hashlib
import json
import math
import os
import sys

import numpy as np
import pyarrow.parquet as pq

source_root = os.path.realpath(sys.argv[1])
ke_source_root = os.path.realpath(sys.argv[2])
objects_root = os.path.realpath(os.path.join(source_root, "objects"))
ke_objects_root = os.path.realpath(os.path.join(ke_source_root, "objects"))

def die(code, detail=""):
    raise SystemExit("KELIN_KEWANG_LINEAGE_REPLAY_" + code
                     + ((":" + detail) if detail else ""))

def inside(root, relative):
    value = os.path.realpath(os.path.join(root, relative))
    if not value.startswith(root + os.sep) or not os.path.isfile(value):
        die("PATH", relative)
    return value

def object_file(source, relative):
    return inside(objects_root, source + "/" + relative)

def ke_file(relative):
    return inside(ke_objects_root, relative)

def canonical_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False).encode("utf-8")

def logical_hash(value):
    return "sha256:" + hashlib.sha256(canonical_bytes(value)).hexdigest()

def file_hash(file):
    digest = hashlib.sha256()
    with open(file, "rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()

def raw_hash(array, dtype):
    value = np.asarray(array, dtype=dtype)
    return "sha256:" + hashlib.sha256(value.tobytes(order="C")).hexdigest()

def schema_projection(table):
    return [{"name": field.name, "type": str(field.type),
             "nullable": field.nullable} for field in table.schema]

def parquet(file):
    reader = pq.ParquetFile(file)
    table = reader.read()
    schema = schema_projection(table)
    return reader, table, {"path": os.path.basename(file),
      "bytes": os.path.getsize(file), "sha256": file_hash(file),
      "rows": table.num_rows, "rowGroups": reader.num_row_groups,
      "fields": table.num_columns, "columns": table.column_names,
      "schema": schema, "schemaHash": logical_hash(schema),
      "nullValues": sum(table[name].null_count for name in table.column_names),
      "createdBy": reader.metadata.created_by,
      "serializedMetadataBytes": reader.metadata.serialized_size}

def read_json(file):
    with open(file, "r", encoding="utf-8") as handle:
        return json.load(handle,
            parse_constant=lambda value: die("JSON_NONFINITE", file))

def read_text(file):
    with open(file, "r", encoding="utf-8", errors="strict") as handle:
        return handle.read()

profiles = {
  "intervention_1": {"episodes": 44, "frames": 18455,
    "episodeOffset": 62, "indexOffset": 20840,
    "baseFileOffset": 3, "handFileOffset": 1},
  "intervention_2": {"episodes": 62, "frames": 20840,
    "episodeOffset": 0, "indexOffset": 0,
    "baseFileOffset": 0, "handFileOffset": 0},
}
order = ["intervention_2", "intervention_1"]
data = {}
episodes = {}
tasks = {}
info = {}
stats = {}
reports = {}
for source, profile in profiles.items():
    data_reader, data[source], data_report = parquet(object_file(source,
        "data/chunk-000/file-000.parquet"))
    episode_reader, episodes[source], episode_report = parquet(object_file(source,
        "meta/episodes/chunk-000/file-000.parquet"))
    task_reader, tasks[source], task_report = parquet(object_file(source,
        "meta/tasks.parquet"))
    info[source] = read_json(object_file(source, "meta/info.json"))
    stats[source] = read_json(object_file(source, "meta/stats.json"))
    reports[source] = {"data": data_report, "episodes": episode_report,
                       "tasks": task_report}
    if data[source].num_rows != profile["frames"] \
       or data_reader.num_row_groups != profile["episodes"] \
       or episodes[source].num_rows != profile["episodes"] \
       or info[source].get("total_episodes") != profile["episodes"] \
       or info[source].get("total_frames") != profile["frames"] \
       or info[source].get("fps") != 20 \
       or info[source].get("robot_type") != "maniskill_sim" \
       or info[source].get("splits") != {"train": "0:%d" % profile["episodes"]}:
        die("PART_PROFILE", source)

ke_data_reader, ke_data, ke_data_report = parquet(ke_file(
    "data/chunk-000/file-000.parquet"))
ke_episode_reader, ke_episodes, ke_episode_report = parquet(ke_file(
    "meta/episodes/chunk-000/file-000.parquet"))
ke_task_reader, ke_tasks, ke_task_report = parquet(ke_file("meta/tasks.parquet"))
ke_info = read_json(ke_file("meta/info.json"))
ke_stats = read_json(ke_file("meta/stats.json"))
if ke_data.num_rows != 39295 or ke_data_reader.num_row_groups != 106 \
   or ke_episodes.num_rows != 106 or ke_info.get("total_episodes") != 106 \
   or ke_info.get("total_frames") != 39295:
    die("KE_PROFILE")

expected_columns = ["action", "observation.state", "observation.qvel",
  "intervention", "next.success", "timestamp", "frame_index",
  "episode_index", "index", "task_index"]
if any(table.column_names != expected_columns for table in
       [data["intervention_1"], data["intervention_2"], ke_data]):
    die("DATA_COLUMNS")
if any(reports[source]["data"]["nullValues"] != 0 or
       reports[source]["episodes"]["nullValues"] != 0 or
       reports[source]["tasks"]["nullValues"] != 0 for source in profiles):
    die("NULL_VALUES")

def values(table):
    return {name: table[name].to_pylist() for name in table.column_names}

part_values = {source: values(table) for source, table in data.items()}
ke_values = values(ke_data)
dtypes = {"action": "<f4", "observation.state": "<f4",
  "observation.qvel": "<f4", "intervention": np.bool_,
  "next.success": np.bool_, "timestamp": "<f4", "frame_index": "<i8",
  "episode_index": "<i8", "index": "<i8", "task_index": "<i8"}
part_reports = {}
merged_arrays = {}
for source, profile in profiles.items():
    value = part_values[source]
    arrays = {name: np.asarray(value[name]) for name in expected_columns}
    if arrays["action"].shape != (profile["frames"], 8) \
       or arrays["observation.state"].shape != (profile["frames"], 9) \
       or arrays["observation.qvel"].shape != (profile["frames"], 9) \
       or not np.isfinite(arrays["action"]).all() \
       or not np.isfinite(arrays["observation.state"]).all() \
       or not np.isfinite(arrays["observation.qvel"]).all() \
       or not np.array_equal(arrays["index"], np.arange(profile["frames"])) \
       or not np.array_equal(np.unique(arrays["episode_index"]),
                             np.arange(profile["episodes"])):
        die("PART_VALUES", source)
    adjusted_hashes = {}
    local_hashes = {}
    for name in expected_columns:
        adjusted = arrays[name]
        if name == "episode_index":
            adjusted = adjusted.astype(np.int64) + profile["episodeOffset"]
        if name == "index":
            adjusted = adjusted.astype(np.int64) + profile["indexOffset"]
        adjusted_hashes[name] = raw_hash(adjusted, dtypes[name])
        local_hashes[name] = raw_hash(arrays[name], dtypes[name])
    intervention = arrays["intervention"].astype(bool)
    success = arrays["next.success"].astype(bool)
    segments = []
    episode_success = []
    episode_intervention = []
    intervention_frames_by_episode = []
    for episode in range(profile["episodes"]):
        mask = arrays["episode_index"] == episode
        local_intervention = intervention[mask]
        local_success = success[mask]
        if local_success.size == 0 or not np.all(local_success == local_success[0]):
            die("SUCCESS_NOT_EPISODE_BROADCAST", source + ":" + str(episode))
        segments.append(int(local_intervention[0]) + int(np.sum(
            local_intervention[1:] & ~local_intervention[:-1])))
        episode_success.append(bool(local_success[0]))
        episode_intervention.append(bool(np.any(local_intervention)))
        intervention_frames_by_episode.append(int(local_intervention.sum()))
    part_reports[source] = {**reports[source]["data"],
      "vectorWidths": {"action": 8, "observation.state": 9,
                       "observation.qvel": 9},
      "finiteVectorValues": True,
      "localNumericHashes": local_hashes,
      "offsetAdjustedNumericHashes": adjusted_hashes,
      "native": {"interventionTrueFrames": int(intervention.sum()),
        "episodesWithIntervention": int(sum(episode_intervention)),
        "interventionSegments": int(sum(segments)),
        "segmentsPerEpisodeDistribution": {str(key): value for key, value in
          sorted(collections.Counter(segments).items())},
        "publisherSuccessEpisodes": int(sum(episode_success)),
        "publisherFailureEpisodes": len(episode_success) - int(sum(episode_success)),
        "successIsEpisodeConstantFrameBroadcast": True,
        "episodeInterventionTrueFrameCountsHash":
          logical_hash(intervention_frames_by_episode)},
      "rawValuesProjected": False}

for name in expected_columns:
    chunks = []
    for source in order:
        array = np.asarray(part_values[source][name])
        if name == "episode_index":
            array = array.astype(np.int64) + profiles[source]["episodeOffset"]
        if name == "index":
            array = array.astype(np.int64) + profiles[source]["indexOffset"]
        chunks.append(array)
    joined = np.concatenate(chunks, axis=0)
    target = np.asarray(ke_values[name])
    if not np.array_equal(joined, target):
        die("DATA_LINEAGE_MISMATCH", name)
    merged_arrays[name] = joined
merged_numeric_hashes = {name: raw_hash(merged_arrays[name], dtypes[name])
                         for name in expected_columns}
expected_merged_hashes = {
  "action": "sha256:839bf14a3f8e9d930b5decbf7c7f60e9e528061aa03ca793871a7ab645637636",
  "episode_index": "sha256:7000e9125973b99dc23c511da75f013de4303c89a24862959c86cd63ba9caa37",
  "frame_index": "sha256:11a5d3e5735aa6f757bc7565e408d1ee84931139d97ac17698c97e64b3f8cefb",
  "index": "sha256:4870eeb66120fbe8f58fb738e51b5210a0cd15412be762b3108b61f8746f6baf",
  "intervention": "sha256:f0185f9394f156f75863381a18a49d17c610b43db8bca3e2a08c231bb748cf0a",
  "next.success": "sha256:afc062ac0647591ec1d93fcce460a2fb24120bf3978c86af22555142fe909540",
  "observation.qvel": "sha256:60954ececcec95c3f086b601f94c37f4037074286c769e38b279b576cc865ab4",
  "observation.state": "sha256:e8a352d0f1fca4059128eca0a13eeaffe4c4de4a7cc24fc506d80b84c078a79f",
  "task_index": "sha256:0c0b7aeb65fcd0902ce0d27ec8fe8a91253c071bab50f6d47bc8d2e74378086c",
  "timestamp": "sha256:4123dde46325913c6ff6777df13e6fdb197aa71c77080b77aaa6f0029cf468d3",
}
if merged_numeric_hashes != expected_merged_hashes:
    die("MERGED_HASHES")

episode_rows = {source: table.to_pylist() for source, table in episodes.items()}
ke_episode_rows = ke_episodes.to_pylist()
if episode_rows["intervention_2"] != ke_episode_rows[:62]:
    die("EPISODE_PREFIX")
transformed_k1 = []
for row in episode_rows["intervention_1"]:
    value = dict(row)
    value["episode_index"] += 62
    value["dataset_from_index"] += 20840
    value["dataset_to_index"] += 20840
    value["videos/observation.images.base_camera/file_index"] += 3
    value["videos/observation.images.hand_camera/file_index"] += 1
    transformed_k1.append(value)
if transformed_k1 != ke_episode_rows[62:] \
   or episode_rows["intervention_2"] + transformed_k1 != ke_episode_rows:
    die("EPISODE_SUFFIX_TRANSFORM")
episode_reports = {
  "intervention_1": {**reports["intervention_1"]["episodes"],
    "logicalRowsHash": logical_hash(episode_rows["intervention_1"]),
    "mergeTransform": {"episodeIndexOffset": 62, "datasetIndexOffset": 20840,
      "baseVideoFileIndexOffset": 3, "handVideoFileIndexOffset": 1,
      "otherColumnsChanged": False}, "transformedEqualsKeSuffix": True},
  "intervention_2": {**reports["intervention_2"]["episodes"],
    "logicalRowsHash": logical_hash(episode_rows["intervention_2"]),
    "equalsKePrefixWithoutTransform": True},
  "ke": {**ke_episode_report,
    "logicalRowsHash": logical_hash(ke_episode_rows)},
}

task_rows = {source: table.to_pylist() for source, table in tasks.items()}
ke_task_rows = ke_tasks.to_pylist()
if not all(rows == ke_task_rows for rows in task_rows.values()) \
   or ke_task_rows != [{"task_index": 0,
                        "task": "Insert the peg into the hole."}]:
    # Some parquet writers retain the task string as the index column.
    if not all(rows == ke_task_rows for rows in task_rows.values()):
        die("TASK_LINEAGE")
task_report = {"allThreeTaskTablesLogicallyEqual": True,
  "records": ke_task_rows, "logicalRowsHash": logical_hash(ke_task_rows),
  "kelin1": reports["intervention_1"]["tasks"],
  "kelin2": reports["intervention_2"]["tasks"], "ke": ke_task_report}

feature_hashes = {source: logical_hash(value["features"])
                  for source, value in info.items()}
feature_hashes["ke"] = logical_hash(ke_info["features"])
if len(set(feature_hashes.values())) != 1:
    die("INFO_FEATURE_DRIFT")
info_report = {source: {"bytes": os.path.getsize(object_file(source,
    "meta/info.json")), "logicalHash": logical_hash(info[source]),
    "episodes": info[source]["total_episodes"],
    "frames": info[source]["total_frames"], "fps": info[source]["fps"],
    "robotType": info[source]["robot_type"], "splits": info[source]["splits"],
    "featureHash": feature_hashes[source], "rawInfoProjected": False}
    for source in profiles}
info_report["ke"] = {"bytes": os.path.getsize(ke_file("meta/info.json")),
  "logicalHash": logical_hash(ke_info), "episodes": 106, "frames": 39295,
  "fps": ke_info["fps"], "robotType": ke_info["robot_type"],
  "splits": ke_info["splits"], "featureHash": feature_hashes["ke"],
  "rawInfoProjected": False}

numeric_fields = ["action", "observation.state", "observation.qvel",
  "intervention", "next.success", "timestamp", "frame_index",
  "episode_index", "index", "task_index"]
stable_fields = [name for name in numeric_fields
                 if name not in ["episode_index", "index"]]

def stat_error(stat_object, value_map, fields, statistic_names):
    maximum = 0.0
    for name in fields:
        array = np.asarray(value_map[name], dtype=float)
        if array.ndim == 1:
            array = array[:, None]
        calculations = {"min": array.min(axis=0), "max": array.max(axis=0),
          "mean": array.mean(axis=0), "std": array.std(axis=0),
          "q01": np.quantile(array, .01, axis=0),
          "q10": np.quantile(array, .10, axis=0),
          "q50": np.quantile(array, .50, axis=0),
          "q90": np.quantile(array, .90, axis=0),
          "q99": np.quantile(array, .99, axis=0)}
        for statistic in statistic_names:
            observed = np.asarray(stat_object[name][statistic], dtype=float)
            maximum = max(maximum,
              float(np.max(np.abs(observed - calculations[statistic]))))
    return maximum

stats_report = {}
for source in profiles:
    primary_error = stat_error(stats[source], part_values[source], numeric_fields,
                               ["min", "max", "mean", "std"])
    quantile_difference = stat_error(stats[source], part_values[source],
      numeric_fields, ["q01", "q10", "q50", "q90", "q99"])
    if primary_error > 0.000004:
        die("PART_STATS", source + ":" + str(primary_error))
    hand_count = stats[source]["observation.images.hand_camera"]["count"][0]
    base_count = stats[source]["observation.images.base_camera"]["count"][0]
    if hand_count != profiles[source]["frames"] * 25600 \
       or base_count != hand_count:
        die("IMAGE_STAT_COUNT", source)
    stats_report[source] = {"bytes": os.path.getsize(object_file(source,
      "meta/stats.json")), "logicalHash": logical_hash(stats[source]),
      "jsonFinite": True, "numericMinMaxMeanStdMaxAbsoluteError": primary_error,
      "publisherQuantilesVsNumpyFullArrayMaxAbsoluteDifference":
        quantile_difference, "publisherQuantileAlgorithmOrSamplingSeedDeclared":
        False, "publisherQuantilesUsedForLineage": False,
      "publisherImageStatisticCountPerCamera": hand_count,
      "publisherImageStatisticCountPerFrame": 25600,
      "publisherImageStatisticCountIsVideoSampleCount": False,
      "rawStatisticsProjected": False}

ke_stable_error = stat_error(ke_stats, ke_values, stable_fields,
                             ["min", "max", "mean", "std"])
restart_values = dict(ke_values)
restart_values["episode_index"] = np.concatenate([
  np.asarray(part_values["intervention_2"]["episode_index"]),
  np.asarray(part_values["intervention_1"]["episode_index"])])
restart_values["index"] = np.concatenate([
  np.asarray(part_values["intervention_2"]["index"]),
  np.asarray(part_values["intervention_1"]["index"])])
ke_restart_error = stat_error(ke_stats, restart_values,
  ["episode_index", "index"], ["min", "max", "mean", "std"])
ke_canonical_identifier_error = stat_error(ke_stats, ke_values,
  ["episode_index", "index"], ["min", "max", "mean", "std"])
if ke_stable_error > 0.000004 or ke_restart_error > 0.000004 \
   or ke_canonical_identifier_error <= 1:
    die("KE_STATS_LINEAGE")
ke_hand_count = ke_stats["observation.images.hand_camera"]["count"][0]
if ke_hand_count != 1005952000 \
   or ke_hand_count != sum(stats[source]["observation.images.hand_camera"]
                            ["count"][0] for source in profiles):
    die("KE_IMAGE_STATS")
stats_report["ke"] = {"bytes": os.path.getsize(ke_file("meta/stats.json")),
  "logicalHash": logical_hash(ke_stats), "jsonFinite": True,
  "stableNumericMinMaxMeanStdMaxAbsoluteError": ke_stable_error,
  "identifierMinMaxMeanStdMatchesRestartedKelinProjectionMaxAbsoluteError":
    ke_restart_error,
  "identifierMinMaxMeanStdVsCanonicalAdjustedDataMaxAbsoluteDifference":
    ke_canonical_identifier_error,
  "publisherImageStatisticCountPerCamera": ke_hand_count,
  "publisherImageStatisticCountsEqualPartSum": True,
  "publisherQuantilesUsedForLineage": False,
  "rawStatisticsProjected": False}

documents = {}
for source in profiles:
    readme = read_text(object_file(source, "README.md"))
    attributes = read_text(object_file(source, ".gitattributes"))
    documents[source] = {"readmeBytes": len(readme.encode("utf-8")),
      "readmeApacheYamlClaim": "license: apache-2.0" in readme,
      "readmeApacheBodyClaim": "**License:** apache-2.0" in readme,
      "readmeLeRobotClaim": "This dataset was created using" in readme
                            and "LeRobot" in readme,
      "gitAttributesBytes": len(attributes.encode("utf-8")),
      "gitLfsPatternLines": sum("filter=lfs" in line
                                for line in attributes.splitlines()),
      "rawTextProjected": False}
    if not documents[source]["readmeApacheYamlClaim"] \
       or not documents[source]["readmeApacheBodyClaim"]:
        die("README_LICENSE_CLAIM", source)

ke_intervention = np.asarray(ke_values["intervention"], dtype=bool)
ke_success = np.asarray(ke_values["next.success"], dtype=bool)
ke_episode_index = np.asarray(ke_values["episode_index"], dtype=np.int64)
merged_segments = []
merged_success = []
merged_any_intervention = []
merged_intervention_counts = []
for episode in range(106):
    mask = ke_episode_index == episode
    intervention = ke_intervention[mask]
    success = ke_success[mask]
    if not np.all(success == success[0]):
        die("KE_SUCCESS_BROADCAST", str(episode))
    merged_segments.append(int(intervention[0]) + int(np.sum(
        intervention[1:] & ~intervention[:-1])))
    merged_success.append(bool(success[0]))
    merged_any_intervention.append(bool(np.any(intervention)))
    merged_intervention_counts.append(int(intervention.sum()))
if int(ke_intervention.sum()) != 28719 or sum(merged_segments) != 134 \
   or sum(merged_success) != 104 or sum(merged_any_intervention) != 105 \
   or merged_success[61] is not False or merged_intervention_counts[61] != 0 \
   or merged_success[105] is not False or merged_intervention_counts[105] != 464:
    die("MERGED_NATIVE_LABELS")

result = {
  "parts": {source: {"data": part_reports[source],
    "episodes": episode_reports[source], "info": info_report[source],
    "stats": stats_report[source], "documents": documents[source]}
    for source in profiles},
  "lineage": {"byteDerivedMergeOrder": order,
    "repositoryNumericSuffixesEstablishChronology": False,
    "intervention2EqualsKeDataPrefixRows": 20840,
    "intervention1EqualsKeDataSuffixRows": 18455,
    "allTenOffsetAdjustedDataColumnsEqualKe": True,
    "mergedNumericHashes": merged_numeric_hashes,
    "mergedNumericRoot": logical_hash(merged_numeric_hashes),
    "episodeSidecarPrefixExact": True,
    "episodeSidecarSuffixExactAfterFiveDeclaredOffsets": True,
    "episodeSidecarMergedLogicalHash": logical_hash(ke_episode_rows),
    "sourceEpisodeOccurrences": 106, "uniqueMergedEpisodes": 106,
    "nestedKeEpisodeOccurrencesAddZeroUniqueEpisodes": True,
    "sourceFrameOccurrences": 39295, "uniqueMergedFrames": 39295,
    "nestedKeFrameOccurrencesAddZeroUniqueFrames": True,
    "sourceOccurrenceAndUniquePopulationsMayBeSummed": False,
    "thisIsExactRepackLineageNotNewExperimentEvidence": True,
    "thisDoesNotEstablishAttemptParentageOrRecoveryChronology": True},
  "repacking": {"kelinVectorTypes": "fixed_size_list<float>",
    "keVectorTypes": "list<float>",
    "physicalVectorWidthsEqual": True,
    "rawParquetFilesByteIdentical": False,
    "allLogicalDataValuesEqualAfterDeclaredOffsets": True,
    "dataFiles": {"intervention_1": reports["intervention_1"]["data"],
      "intervention_2": reports["intervention_2"]["data"],
      "ke": ke_data_report},
    "episodeFiles": episode_reports,
    "tasks": task_report,
    "info": info_report,
    "stats": stats_report,
    "kelinNoVideoBytes": 6973328, "keNoVideoBytes": 6572363,
    "noVideoPackagingByteDifference": 400965},
  "nativeSemantics": {"interventionField": "intervention",
    "publisherSuccessField": "next.success",
    "publisherSuccessIsEpisodeConstantFrameBroadcast": True,
    "interventionTrueFrames": 28719, "episodesWithIntervention": 105,
    "interventionSegments": 134,
    "segmentsPerEpisodeDistribution": {str(key): value for key, value in
      sorted(collections.Counter(merged_segments).items())},
    "publisherSuccessEpisodes": 104, "publisherFailureEpisodes": 2,
    "episode61PublisherFailureNoIntervention": True,
    "episode105PublisherFailureAll464FramesIntervention": True,
    "interventionHumanSourceVerified": False,
    "interventionEstablishesAuthorization": False,
    "publisherSuccessIsIndependentOutcome": False,
    "interventionToSuccessIsCausalRecovery": False},
  "safety": {"publisherCodeExecuted": False,
    "publisherCommandsExecuted": False, "newVideoBytesAcquired": False,
    "videoPixelsDecodedByLinkedReplay": False,
    "rawActionStateQvelValuesProjected": False},
}
print(json.dumps(result, sort_keys=True, separators=(",", ":"),
                 ensure_ascii=False, allow_nan=False))
`;

export function runKelinKewangLineageReplay(sourceDirectory, options = {}) {
  const verified = verifyKelinKewangLineageSourceDirectory(sourceDirectory,
    options);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const keDirectory = path.resolve(options.keArtifactDirectory
    ?? KE_ARTIFACT_DIRECTORY);
  const keSourceDirectory = path.join(keDirectory, "source");
  const keSourceBound = verifyPegInterventionArtifactWithSource(
    verified.linkedKeReport, keSourceDirectory,
    { pythonExecutable: options.pythonExecutable ?? ".venv/bin/python" });
  if (!keSourceBound.ok) fail("KE_SOURCE_BOUND_REPLAY_FAILED", keSourceBound.error);
  const executed = spawnSync(options.pythonExecutable ?? ".venv/bin/python",
    ["-c", PYTHON_KELIN_KEWANG_LINEAGE_REPLAY,
      path.resolve(sourceDirectory), path.resolve(keSourceDirectory)],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (executed.error) fail("REPLAY_PYTHON_FAILED", executed.error.message);
  if (executed.status !== 0) fail("REPLAY_FAILED",
    String(executed.stderr || executed.stdout).trim());
  let replay;
  try { replay = JSON.parse(executed.stdout); }
  catch (error) { fail("REPLAY_JSON_INVALID", error.message); }
  if (replay.lineage?.allTenOffsetAdjustedDataColumnsEqualKe !== true
    || replay.lineage?.uniqueMergedEpisodes !== 106
    || replay.nativeSemantics?.interventionTrueFrames !== 28_719
    || replay.nativeSemantics?.publisherSuccessEpisodes !== 104
    || replay.nativeSemantics?.publisherFailureEpisodes !== 2
    || replay.safety?.publisherCodeExecuted !== false) fail("REPLAY_RESULT_INVALID");
  return { ...replay, nestedKeVerification: {
    artifactHash: verified.linkedKeReport.artifactHash,
    sourceManifestHash: verified.linkedKeReport.source.sourceManifestHash,
    sourceRoot: verified.linkedKeReport.source.sourceRoot,
    sourceBoundVerificationLevel: keSourceBound.verificationLevel,
    handVideoFiles: verified.linkedKeReport.replay.video.files,
    handVideoBytes: verified.linkedKeReport.replay.video.bytes,
    handVideoSamples: verified.linkedKeReport.replay.video.totalSamples,
    handVideoSampleTablesReplayed: true,
    pixelsDecoded: verified.linkedKeReport.replay.video.pixelsDecoded,
    pixelsProjected: verified.linkedKeReport.replay.video.pixelsProjected,
    newHandVideoBytesAcquired: 0,
  } };
}

function artifactBody(verified, replay) {
  return {
    schema: KELIN_KEWANG_LINEAGE_ARTIFACT_SCHEMA,
    frozenAt: KELIN_KEWANG_LINEAGE_FROZEN_AT,
    status: "PINNED_LINKED_REPACK_LINEAGE_REPLAYED",
    admission: "QUARANTINE_EVAL_ONLY",
    source: { sources: KELIN_KEWANG_SOURCES.map((profile) => ({
      id: profile.id, revision: profile.revision })),
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      closure: verified.manifest.closure,
      nestedKeArtifact: verified.manifest.nestedKeArtifact },
    replay,
    typedDenominators: {
      KELIN_SOURCE_EPISODE_OCCURRENCE: 106,
      UNIQUE_MERGED_EPISODE: 106,
      KELIN_SOURCE_ACTION_STATE_QVEL_FRAME_OCCURRENCE: 39_295,
      UNIQUE_MERGED_ACTION_STATE_QVEL_FRAME: 39_295,
      NATIVE_INTERVENTION_TRUE_FRAME: 28_719,
      NATIVE_INTERVENTION_SEGMENT: 134,
      PUBLISHER_EPISODE_OUTCOME: 106,
      CROSS_BOUND_HAND_VIDEO_FILE: 2,
      KELIN_BASE_VIDEO_FILE_INVENTORY: 5,
      crossTotal: null,
    },
    denominatorBoundary: {
      kelinSourceOccurrencesAndUniqueMergedEpisodesAreSeparateViews: true,
      nestedKeRepackAddsUniqueEpisodes: 0,
      nestedKeRepackAddsUniqueFrames: 0,
      publisherFrameBroadcastSuccessValuesAreIndependentOutcomes: false,
      typedPopulationsMayBeSummed: false,
    },
    lineageBoundary: {
      exactRepackLineageEstablished: true,
      byteDerivedMergeOrder: ["intervention_2", "intervention_1"],
      publisherRepositorySuffixesEstablishChronology: false,
      attemptIdentityEstablished: false,
      attemptParentLineageEstablished: false,
      attemptChronologyEstablished: false,
      completeAttemptCensusEstablished: false,
      newExperimentEvidenceEstablished: false,
      recoveryEstablished: false,
      causalEffectEstablished: false,
    },
    semantics: {
      publisherDeclaredRobotType: "maniskill_sim",
      simulationTrajectoryPresent: true,
      realRobotTrajectoryPresent: false,
      sourceNativeActionStateQvelTrajectoryPresent: true,
      sourceNativeInterventionPresent: true,
      sourceNativePublisherOutcomePresent: true,
      publisherSuccessEpisodeDenominator: 106,
      publisherSuccessEpisodes: 104, publisherFailureEpisodes: 2,
      interventionProvenanceAsHumanVerified: false,
      interventionEstablishesAuthorization: false,
      reliableOutcomeEstablished: false,
      independentOutcomeEstablished: false,
      directCausalEffectEstablished: false,
      recoveryEstablished: false,
      delegationEstablished: false,
    },
    rights: {
      kelin1DatasetCardLicenseClaim: "Apache-2.0",
      kelin1ReadmeLicenseClaim: "Apache-2.0",
      kelin2DatasetCardLicenseClaim: "Apache-2.0",
      kelin2ReadmeLicenseClaim: "Apache-2.0",
      kewangDatasetCardLicenseClaim: null,
      kewangReadmeLicenseClaim: "More Information Needed",
      rootLicenseFilePresentInAnyLinkedRepository: false,
      upstreamLeRobotAndManiSkillRightsIndependentlyAdjudicated: false,
      telemetryRightsIndependentlyAdjudicated: false,
      crossBoundVisualRightsIndependentlyAdjudicated: false,
      legalConclusionEstablished: false,
      productionTrainingAuthorized: false,
      evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    },
    privacy: {
      rawArtifactPrivate: true, directoryMode: "0700", fileMode: "0600",
      localSelectedVisualBytesPresent: false,
      crossBoundHandCameraVisualEvidencePresent: true,
      noPiiGuaranteed: false, privacyReviewComplete: false,
      publicAvailabilityResolvesPrivacy: false,
      rawActionStateQvelValuesProjected: false,
      videoPixelsDecoded: false, videoPixelsProjected: false,
    },
    boundary: { privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
      action: 1, mechanicsTelemetry: 1, simulationObservation: 1,
      realRobotTrajectory: 0, physicalObservation: 0, nativeIntervention: 1,
      humanAuthorization: 0, publisherOutcome: 1, reliableOutcome: 0,
      independentOutcome: 0, directCausalEffect: 0, recovery: 0,
      attemptLineage: 0, attemptCensus: 0, delegation: 0, externalEffect: 0 },
  };
}

export function kelinKewangLineageArtifactHash(body) {
  return digest("outsider/kelin-kewang-intervention-lineage/v1", body);
}

export function buildKelinKewangLineageArtifactFromSource(sourceDirectory,
  options = {}) {
  const verified = verifyKelinKewangLineageSourceDirectory(sourceDirectory,
    options);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runKelinKewangLineageReplay(sourceDirectory, options);
  const body = artifactBody(verified, replay);
  const artifact = { ...body,
    artifactHash: kelinKewangLineageArtifactHash(body) };
  const checked = verifyKelinKewangLineageArtifact(artifact);
  if (!checked.ok) fail("ARTIFACT_BUILD_INVALID", checked.error);
  return artifact;
}

export function verifyKelinKewangLineageArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== KELIN_KEWANG_LINEAGE_ARTIFACT_SCHEMA
      || artifact.frozenAt !== KELIN_KEWANG_LINEAGE_FROZEN_AT
      || artifact.status !== "PINNED_LINKED_REPACK_LINEAGE_REPLAYED"
      || artifact.admission !== "QUARANTINE_EVAL_ONLY"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== kelinKewangLineageArtifactHash(body)) {
      fail("ARTIFACT_HASH_INVALID");
    }
    if (artifact.source?.closure?.acquiredNoVideoFiles !== 14
      || artifact.source?.closure?.newlyAcquiredHandVideoBytes !== 0
      || artifact.replay?.lineage?.allTenOffsetAdjustedDataColumnsEqualKe !== true
      || artifact.replay?.lineage?.uniqueMergedEpisodes !== 106
      || artifact.replay?.nativeSemantics?.publisherSuccessEpisodes !== 104
      || artifact.replay?.nestedKeVerification?.handVideoSamples !== 39_295) {
      fail("REPLAY_INVALID");
    }
    if (!same(artifact.typedDenominators, {
      KELIN_SOURCE_EPISODE_OCCURRENCE: 106,
      UNIQUE_MERGED_EPISODE: 106,
      KELIN_SOURCE_ACTION_STATE_QVEL_FRAME_OCCURRENCE: 39_295,
      UNIQUE_MERGED_ACTION_STATE_QVEL_FRAME: 39_295,
      NATIVE_INTERVENTION_TRUE_FRAME: 28_719,
      NATIVE_INTERVENTION_SEGMENT: 134,
      PUBLISHER_EPISODE_OUTCOME: 106,
      CROSS_BOUND_HAND_VIDEO_FILE: 2,
      KELIN_BASE_VIDEO_FILE_INVENTORY: 5,
      crossTotal: null })) fail("DENOMINATOR_INVALID");
    if (artifact.denominatorBoundary?.nestedKeRepackAddsUniqueEpisodes !== 0
      || artifact.lineageBoundary?.attemptParentLineageEstablished !== false
      || artifact.lineageBoundary?.recoveryEstablished !== false
      || artifact.lineageBoundary?.causalEffectEstablished !== false
      || artifact.semantics?.independentOutcomeEstablished !== false
      || artifact.semantics?.directCausalEffectEstablished !== false
      || artifact.semantics?.recoveryEstablished !== false) fail("SEMANTIC_PROMOTION");
    if (artifact.rights?.rootLicenseFilePresentInAnyLinkedRepository !== false
      || artifact.rights?.legalConclusionEstablished !== false
      || artifact.rights?.productionTrainingAuthorized !== false
      || artifact.privacy?.rawArtifactPrivate !== true
      || artifact.privacy?.noPiiGuaranteed !== false) fail("GATE_INVALID");
    if (!same(artifact.boundary, { privacy: 0, training: 0, network: 0,
      authority: 0, CEU: 0, action: 1, mechanicsTelemetry: 1,
      simulationObservation: 1, realRobotTrajectory: 0, physicalObservation: 0,
      nativeIntervention: 1, humanAuthorization: 0, publisherOutcome: 1,
      reliableOutcome: 0, independentOutcome: 0, directCausalEffect: 0,
      recovery: 0, attemptLineage: 0, attemptCensus: 0, delegation: 0,
      externalEffect: 0 })) fail("BOUNDARY_INVALID");
    return { ok: true, artifactHash, verificationLevel:
      "STANDALONE_HASH_TYPED_EXACT_REPACK_NO_DOUBLE_COUNT_BOUNDARY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyKelinKewangLineageArtifactWithSource(artifact,
  sourceDirectory, options = {}) {
  const standalone = verifyKelinKewangLineageArtifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildKelinKewangLineageArtifactFromSource(sourceDirectory,
      options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.source.sourceManifestHash,
      sourceRoot: artifact.source.sourceRoot,
      verificationLevel:
        "FULL_TWO_PART_PARQUET_OFFSET_JOIN_PLUS_NESTED_KE_SELF_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
