/*
 * Pinned SO101 RECAP declared-scope and linked-lineage intake.
 *
 * The source closure binds the author's thirteen repositories returned by the
 * fixed author/search query, replays the complete no-video bytes for the
 * policy-rollout and H264 merged datasets, and retains bounded support bytes
 * needed to distinguish zero-episode intermediates, a stale merged metadata
 * revision, and a same-episode advantage derivative.  Videos, upstream
 * discarded attempts, independent outcomes, recovery semantics, training,
 * network, authority and action are deliberately not promoted.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, rmSync, statSync, writeSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const RECAP_AUTHOR = "apaszynska";
export const RECAP_DECLARED_QUERY =
  "https://huggingface.co/api/datasets?author=apaszynska&search=recap&limit=100&full=true";
export const RECAP_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const RECAP_SOURCE_SCHEMA = "outsider/recap-so101-source/v1";
export const RECAP_LINEAGE_SCHEMA = "outsider/recap-so101-linked-lineage/v1";

const MAIN_PATHS = Object.freeze([
  "README.md",
  "data/chunk-000/file-000.parquet",
  "meta/episodes/chunk-000/file-000.parquet",
  "meta/info.json",
  "meta/stats.json",
  "meta/tasks.parquet",
]);
const BASE20_PATHS = Object.freeze([
  ...MAIN_PATHS,
  "recap_advantages.json",
  "recap_episode_labels.json",
]);
const DERIVED20_PATHS = Object.freeze(BASE20_PATHS.filter((item) => item !== "README.md"));
const LEGACY_SUPPORT_PATHS = Object.freeze([
  "README.md",
  "meta/episodes/chunk-000/file-000.parquet",
  "meta/info.json",
]);
const INFO_ONLY = Object.freeze(["meta/info.json"]);

function frozenProfile(value) {
  return Object.freeze({ ...value, selectedPaths: Object.freeze([...value.selectedPaths]) });
}

export const RECAP_REPOSITORIES = Object.freeze([
  frozenProfile({
    key: "eval_recap_pi05", id: "apaszynska/eval_recap_pi05",
    revision: "864d0ee093fee002c123794d1141f35595d13c03", usedStorage: 0,
    cardLicense: "apache-2.0", repositoryPaths: 3, treeEntries: 4,
    treeFiles: 3, treeBytes: 8_552, selectedPaths: INFO_ONLY,
    selectedBytes: 2_801, repositoryProjectionHash:
      "sha256:95a554901a1d0d544e9992603fa886f681635de423d8720065ab6f08a824266b",
    treeProjectionHash:
      "sha256:9f1383f7d3f54eee842064d44ffdca1dcd35a650136f93e1a6f2d04e618ef7e9",
    disposition: "METADATA_ONLY_ZERO_EPISODE",
  }),
  frozenProfile({
    key: "eval_recap_pi05_cup", id: "apaszynska/eval_recap_pi05_cup",
    revision: "ec8e6f305be06d659ca1c50e3c319b339e211822", usedStorage: 0,
    cardLicense: "apache-2.0", repositoryPaths: 3, treeEntries: 4,
    treeFiles: 3, treeBytes: 8_552, selectedPaths: INFO_ONLY,
    selectedBytes: 2_801, repositoryProjectionHash:
      "sha256:ca3c718cb03969ab3fa2e58d22989c2a5ce928302ab5fa7832784a8f900335c0",
    treeProjectionHash:
      "sha256:9f1383f7d3f54eee842064d44ffdca1dcd35a650136f93e1a6f2d04e618ef7e9",
    disposition: "METADATA_ONLY_ZERO_EPISODE",
  }),
  frozenProfile({
    key: "eval_recap_pi05_cup_2", id: "apaszynska/eval_recap_pi05_cup_2",
    revision: "e6ece08730b07402980b1830f66c66fc3f49bbb2", usedStorage: 0,
    cardLicense: "apache-2.0", repositoryPaths: 3, treeEntries: 4,
    treeFiles: 3, treeBytes: 9_650, selectedPaths: INFO_ONLY,
    selectedBytes: 3_350, repositoryProjectionHash:
      "sha256:78b4d00d75e649ce348740003742e2397c4605beaeeeb06dc17d8a29044975c2",
    treeProjectionHash:
      "sha256:b288d6557898a339def5672b68736abb685bbc006d156c768159a916039a495f",
    disposition: "METADATA_ONLY_ZERO_EPISODE",
  }),
  frozenProfile({
    key: "merged_h264", id: "apaszynska/merged-recap-cup-training-h264",
    revision: "fa666e78248ef233fcd83de5f1599924d2bfbce9",
    usedStorage: 5_091_608_227, cardLicense: "apache-2.0",
    repositoryPaths: 81, treeEntries: 96, treeFiles: 81,
    treeBytes: 5_091_635_645, selectedPaths: MAIN_PATHS,
    selectedBytes: 4_268_930, repositoryProjectionHash:
      "sha256:aaec494544358d491a3abe22f6b16fafcc52d6886e75dda3af8dc1dfb20d5f05",
    treeProjectionHash:
      "sha256:fc61e413b9e4a64af7bc78bd40eb8955d6deed9b6b9a7ee6adcd3f305d491a8c",
    disposition: "ACQUIRE_NOW_PRIMARY_MERGED_NO_VIDEO",
  }),
  frozenProfile({
    key: "merged_legacy", id: "apaszynska/merged-recap-cup-training",
    revision: "54e0b6246e6807498904e32fdca7986e42a6ab87",
    usedStorage: 5_605_241_127, cardLicense: "apache-2.0",
    repositoryPaths: 80, treeEntries: 95, treeFiles: 80,
    treeBytes: 5_604_466_398, selectedPaths: LEGACY_SUPPORT_PATHS,
    selectedBytes: 813_408, repositoryProjectionHash:
      "sha256:11b5e8ec811a9f98a59d31c4bd5ebfd30b0d4ec33622c78f34ab5a8d937e7238",
    treeProjectionHash:
      "sha256:79b4e421ff03914ac5f653da8255ec72d67746430d0afe77a75b045507274803",
    disposition: "METADATA_ONLY_STALE_METADATA_SUPPORT",
  }),
  frozenProfile({
    key: "recap_episodes_1", id: "apaszynska/recap_episodes_1",
    revision: "d3dd53146954a32c1d508c40fbf325d628928930",
    usedStorage: 368_222_199, cardLicense: "apache-2.0",
    repositoryPaths: 12, treeEntries: 24, treeFiles: 12,
    treeBytes: 368_777_582, selectedPaths: BASE20_PATHS,
    selectedBytes: 1_518_380, repositoryProjectionHash:
      "sha256:bfb06a69bede9158e2d8e17367123399b8bfa420a2a1658d7b3abd9f4a1b53e9",
    treeProjectionHash:
      "sha256:5ee0b2f327c74acc698939676ec09e98136e14242cbeffb5188e4d6ca5b407d3",
    disposition: "ACQUIRE_NOW_DISTINCT_20_EPISODE_SUPPORT",
  }),
  ...[
    ["recap_pi05_cup_new_2", "f786a83c4efa5f109b36851ed1c9bc45431d5b63",
      "sha256:beefe851b919b7b08c92c9418c3f8ac1c591ba75d45612e57a7ac8b09822419d"],
    ["recap_pi05_cup_new_3", "3582c7f22252dda43f8a3811340cbedbfd975c2d",
      "sha256:33624ba70444ef779e9a1c89009ddf338e763be689388805777d4a07750646fb"],
    ["recap_pi05_cup_new_4", "0322115a1a30c3045a9e0b27f0f112f2026e57a3",
      "sha256:1e1364e5fadddefbea3942968f79a6e8ca45a82af4d7eec2d3bbb8284d66e9ba"],
    ["recap_pi05_cup_new_5", "f3683a52c32fef8d7667e37479ecc20d00b38223",
      "sha256:982bdfc96c7b686bcabb42d01628407d0933e487c637e86ca54eb9d132a8439e"],
    ["recap_pi05_cup_new_6", "0807b9517ff57f412d67c9423b96c3f9454b9896",
      "sha256:d6b201126028da85b40e05348117142e7fa640aaa234804e44c2caf11de18fa7"],
  ].map(([key, revision, repositoryProjectionHash]) => frozenProfile({
    key, id: `apaszynska/${key}`, revision, usedStorage: 0,
    cardLicense: "apache-2.0", repositoryPaths: 3, treeEntries: 4,
    treeFiles: 3, treeBytes: 10_258, selectedPaths: INFO_ONLY,
    selectedBytes: 3_654, repositoryProjectionHash,
    treeProjectionHash:
      "sha256:c775ba95f42a6dc72a1cae59db82e83753d7690a2d41b90414ae59ece7cb8c38",
    disposition: "METADATA_ONLY_ZERO_EPISODE",
  })),
  frozenProfile({
    key: "rollout_new_7", id: "apaszynska/recap_pi05_cup_new_7",
    revision: "f4395be3090ced744153522c5d4c96258e02474f",
    usedStorage: 467_367_141, cardLicense: "apache-2.0",
    repositoryPaths: 10, treeEntries: 22, treeFiles: 10,
    treeBytes: 467_400_195, selectedPaths: MAIN_PATHS,
    selectedBytes: 1_131_877, repositoryProjectionHash:
      "sha256:f0b00527823f745fce4003c02b46cf08917eadb90ad42ee7d4e752d35e9cf013",
    treeProjectionHash:
      "sha256:8185528bc5d264879f1e6879acf522ccd7319efa211172b1a0b234fc9797c033",
    disposition: "ACQUIRE_NOW_PRIMARY_ROLLOUT_NO_VIDEO",
  }),
  frozenProfile({
    key: "so101_cup_recap_20ep", id: "apaszynska/so101-cup-recap-20ep",
    revision: "3d3d86f69a8b2171e9054e2efb4e5169b632a703",
    usedStorage: 368_171_374, cardLicense: null,
    repositoryPaths: 11, treeEntries: 23, treeFiles: 11,
    treeBytes: 368_721_187, selectedPaths: DERIVED20_PATHS,
    selectedBytes: 1_461_985, repositoryProjectionHash:
      "sha256:fdf27078132c07c3cf44ccfa1473092eb119c53bc2b75d3a7c0ffbdcb3eff97f",
    treeProjectionHash:
      "sha256:4e8a110f93144a1e7c6c231dbfd393ad4e2575c3bd909d0ae697c9fa457b03d5",
    disposition: "QUARANTINE_EVAL_DERIVATIVE_RIGHTS_UNDECLARED",
  }),
]);

export const RECAP_PROFILE = Object.freeze({
  declaredRepositories: 13,
  zeroEpisodeRepositories: 8,
  selectedObjects: 38,
  selectedBytes: 9_221_802,
  primaryRolloutEpisodes: 20,
  primaryRolloutFrames: 8_927,
  mergedEpisodes: 321,
  mergedFrames: 97_457,
  mergedTeleopPrefixEpisodes: 301,
  mergedTeleopPrefixFrames: 88_530,
  legacyMetadataEpisodes: 320,
  legacyMetadataFrames: 96_162,
  legacyMissingEpisodeIndex: 122,
  legacyMissingFrames: 1_295,
  supportEpisodes: 20,
  supportFrames: 8_803,
  stateDimensions: 12,
  actionDimensions: 12,
  fps: 15,
});

const HF_ORIGIN = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const MAX_API_BYTES = 8 * 1024 * 1024;
const MAX_OBJECT_BYTES = 5 * 1024 * 1024;
const FETCH_ATTEMPTS = 3;
const FETCH_CONCURRENCY = 6;
const EXPECTED_QUERY_PROJECTION_HASH =
  "sha256:8daf39c485ad2b1078b6ecba745ffb1038c5d1687466ef0cac4bee38093bbb60";

function fail(code, detail = null) {
  throw new Error(detail == null ? `RECAP_SO101_${code}`
    : `RECAP_SO101_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function recapSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return recapSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes).digest("hex");
}

function safeRemotePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1024
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function profileByKey(key) {
  const profile = RECAP_REPOSITORIES.find((entry) => entry.key === key);
  if (!profile) fail("PROFILE_UNKNOWN", key);
  return profile;
}

function apiUrls(profile) {
  const encoded = profile.id.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF_ORIGIN}/api/datasets/${encoded}/revision/${profile.revision}`,
    tree: `${HF_ORIGIN}/api/datasets/${encoded}/tree/${profile.revision}?recursive=true&limit=1000`,
    rawBase: `${HF_ORIGIN}/datasets/${encoded}/resolve/${profile.revision}`,
  };
}

function repositoryProjection(metadata) {
  if (!plain(metadata) || typeof metadata.id !== "string"
    || typeof metadata.sha !== "string" || !Array.isArray(metadata.siblings)) {
    fail("REPOSITORY_METADATA_INVALID");
  }
  const siblingPaths = metadata.siblings.map((entry) => entry?.rfilename)
    .sort();
  if (siblingPaths.some((entry) => !safeRemotePath(entry))
    || new Set(siblingPaths).size !== siblingPaths.length) {
    fail("REPOSITORY_PATHS_INVALID", metadata.id);
  }
  return {
    id: metadata.id,
    sha: metadata.sha,
    private: metadata.private,
    gated: metadata.gated,
    disabled: metadata.disabled,
    usedStorage: metadata.usedStorage,
    cardLicense: metadata.cardData?.license ?? null,
    siblingPaths,
  };
}

function validateRepository(profile, metadata) {
  const projection = repositoryProjection(metadata);
  if (projection.id !== profile.id || projection.sha !== profile.revision
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false || projection.usedStorage !== profile.usedStorage
    || projection.cardLicense !== profile.cardLicense
    || projection.siblingPaths.length !== profile.repositoryPaths
    || digest("outsider/recap-repository-projection/v1", projection)
      !== profile.repositoryProjectionHash) {
    fail("REPOSITORY_PROFILE_INVALID", profile.key);
  }
  return projection;
}

function treeEntryProjection(entry) {
  if (!plain(entry) || !safeRemotePath(entry.path)
    || !["file", "directory"].includes(entry.type)
    || !SHA1.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
  if (entry.type === "directory") {
    if (entry.size !== 0) fail("TREE_DIRECTORY_SIZE_INVALID", entry.path);
    return { path: entry.path, type: "directory", oid: entry.oid,
      sizeBytes: 0, lfsSha256: null, lfsBytes: null };
  }
  if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
    fail("TREE_FILE_SIZE_INVALID", entry.path);
  }
  if (entry.lfs == null) return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: null, lfsBytes: null };
  if (!plain(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
    || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
  return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: `sha256:${entry.lfs.oid}`,
    lfsBytes: entry.lfs.size };
}

function projectTree(entries) {
  if (!Array.isArray(entries) || entries.length < 1) fail("TREE_INVALID");
  const projection = entries.map(treeEntryProjection)
    .sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(projection.map((entry) => entry.path)).size !== projection.length) {
    fail("TREE_DUPLICATE_PATH");
  }
  return projection;
}

function validateTree(profile, entries) {
  const projection = projectTree(entries);
  const files = projection.filter((entry) => entry.type === "file");
  const selected = profile.selectedPaths.map((remotePath) => {
    const found = files.find((entry) => entry.path === remotePath);
    if (!found) fail("SELECTED_PATH_MISSING", `${profile.key}:${remotePath}`);
    return found;
  });
  if (projection.length !== profile.treeEntries || files.length !== profile.treeFiles
    || files.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== profile.treeBytes
    || selected.reduce((sum, entry) => sum + entry.sizeBytes, 0)
      !== profile.selectedBytes
    || digest("outsider/recap-tree-projection/v1", projection)
      !== profile.treeProjectionHash) fail("TREE_PROFILE_INVALID", profile.key);
  return { projection, selected };
}

function queryProjection(metadata) {
  if (!Array.isArray(metadata)) fail("QUERY_METADATA_INVALID");
  const projection = metadata.map((entry) => ({
    id: entry?.id,
    sha: entry?.sha,
    private: entry?.private,
    gated: entry?.gated,
    disabled: entry?.disabled,
    usedStorage: entry?.usedStorage ?? null,
    cardLicense: entry?.cardData?.license ?? null,
  })).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  if (projection.length !== RECAP_PROFILE.declaredRepositories
    || digest("outsider/recap-query-projection/v1", projection)
      !== EXPECTED_QUERY_PROJECTION_HASH) fail("QUERY_SCOPE_CHANGED");
  return projection;
}

function permittedUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === ""
      && parsed.password === "" && (parsed.hostname === "huggingface.co"
        || parsed.hostname.endsWith(".hf.co")
        || parsed.hostname.endsWith(".xethub.hf.co"));
  } catch {
    return false;
  }
}

function retryable(error) {
  return error?.name === "AbortError" || error?.retryable === true
    || /(?:fetch failed|network|timed out|timeout|ECONN|ENOTFOUND|EAI_AGAIN)/iu
      .test(String(error?.message ?? error));
}

async function fetchOnce(url, maximumBytes, fetchImpl) {
  if (!permittedUrl(url)) fail("REQUEST_URL_REFUSED", url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetchImpl(url, {
      method: "GET", redirect: "follow", signal: controller.signal,
      headers: { Accept: "application/json, application/octet-stream;q=0.9, */*;q=0.8" },
    });
    if (!response || typeof response.arrayBuffer !== "function") {
      fail("FETCH_RESPONSE_INVALID");
    }
    if (!response.ok) {
      const error = new Error(`HTTP_${response.status}`);
      error.retryable = response.status === 408 || response.status === 429
        || response.status >= 500;
      throw error;
    }
    const finalUrl = response.url || url;
    if (!permittedUrl(finalUrl)) fail("FINAL_URL_REFUSED", finalUrl);
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > maximumBytes) {
      fail("CONTENT_LENGTH_EXCEEDED", String(declared));
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) fail("BODY_BYTES_EXCEEDED", String(bytes.length));
    return { bytes, finalUrl, status: response.status,
      contentType: response.headers?.get?.("content-type") ?? null };
  } finally {
    clearTimeout(timer);
  }
}

async function boundedFetch(url, maximumBytes, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await fetchOnce(url, maximumBytes, fetchImpl);
    } catch (error) {
      last = error;
      if (!retryable(error) || attempt === FETCH_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  }
  throw last;
}

function parseJson(bytes, label) {
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    return value;
  } catch (error) {
    fail("JSON_INVALID", `${label}:${error.message}`);
  }
}

async function fetchJson(url, fetchImpl) {
  const fetched = await boundedFetch(url, MAX_API_BYTES, fetchImpl);
  return { ...fetched, value: parseJson(fetched.bytes, url) };
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function safeJoin(root, relativePath) {
  if (!safeRemotePath(relativePath)) fail("LOCAL_RELATIVE_PATH_UNSAFE", relativePath);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(path.resolve(root), target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("LOCAL_PATH_ESCAPE", relativePath);
  return target;
}

function writePrivateFileOnce(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  const descriptor = openSync(file, fsConstants.O_CREAT | fsConstants.O_EXCL
    | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  try {
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size !== bytes.length) fail("WRITE_VERIFY_FAILED", file);
  } finally {
    closeSync(descriptor);
  }
}

async function mapConcurrent(values, concurrency, operation) {
  const result = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      result[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return result;
}

function snapshotRelative(phase, kind, key = null) {
  if (kind === "query") return `api/${phase}/query.json`;
  return `api/${phase}/${kind}/${key}.json`;
}

function snapshotDescriptor(phase, kind, key, url, fetched, relativePath) {
  return {
    phase, kind, key, requestUrl: url, finalUrl: fetched.finalUrl,
    status: fetched.status, contentType: fetched.contentType,
    file: relativePath, bytes: fetched.bytes.length, sha256: recapSha256(fetched.bytes),
  };
}

async function fetchSnapshotSet(root, phase, fetchImpl) {
  const query = await fetchJson(RECAP_DECLARED_QUERY, fetchImpl);
  queryProjection(query.value);
  const queryFile = snapshotRelative(phase, "query");
  writePrivateFileOnce(safeJoin(root, queryFile), query.bytes);
  const snapshots = [snapshotDescriptor(phase, "query", null,
    RECAP_DECLARED_QUERY, query, queryFile)];
  const repoSnapshots = await mapConcurrent(RECAP_REPOSITORIES, FETCH_CONCURRENCY,
    async (profile) => {
      const urls = apiUrls(profile);
      const [repository, tree] = await Promise.all([
        fetchJson(urls.repository, fetchImpl), fetchJson(urls.tree, fetchImpl),
      ]);
      validateRepository(profile, repository.value);
      validateTree(profile, tree.value);
      const repositoryFile = snapshotRelative(phase, "repositories", profile.key);
      const treeFile = snapshotRelative(phase, "trees", profile.key);
      writePrivateFileOnce(safeJoin(root, repositoryFile), repository.bytes);
      writePrivateFileOnce(safeJoin(root, treeFile), tree.bytes);
      return [
        snapshotDescriptor(phase, "repository", profile.key,
          urls.repository, repository, repositoryFile),
        snapshotDescriptor(phase, "tree", profile.key,
          urls.tree, tree, treeFile),
      ];
    });
  return [...snapshots, ...repoSnapshots.flat()]
    .sort((left, right) => left.file.localeCompare(right.file));
}

function readSnapshot(root, descriptor) {
  const bytes = readRegularFile(safeJoin(root, descriptor.file), descriptor.bytes);
  if (recapSha256(bytes) !== descriptor.sha256) fail("SNAPSHOT_HASH_INVALID", descriptor.file);
  return parseJson(bytes, descriptor.file);
}

function snapshotsByPhase(root, descriptors, phase) {
  const selected = descriptors.filter((entry) => entry.phase === phase);
  const query = selected.find((entry) => entry.kind === "query");
  if (!query) fail("QUERY_SNAPSHOT_MISSING", phase);
  const repositories = {};
  const trees = {};
  for (const profile of RECAP_REPOSITORIES) {
    const repository = selected.find((entry) => entry.kind === "repository"
      && entry.key === profile.key);
    const tree = selected.find((entry) => entry.kind === "tree"
      && entry.key === profile.key);
    if (!repository || !tree) fail("REPOSITORY_SNAPSHOT_MISSING", `${phase}:${profile.key}`);
    repositories[profile.key] = readSnapshot(root, repository);
    trees[profile.key] = readSnapshot(root, tree);
  }
  return { query: readSnapshot(root, query), repositories, trees };
}

function compareStableSnapshots(before, after) {
  if (!same(queryProjection(before.query), queryProjection(after.query))) {
    fail("QUERY_CHANGED_DURING_ACQUISITION");
  }
  for (const profile of RECAP_REPOSITORIES) {
    const beforeRepository = validateRepository(profile, before.repositories[profile.key]);
    const afterRepository = validateRepository(profile, after.repositories[profile.key]);
    const beforeTree = validateTree(profile, before.trees[profile.key]);
    const afterTree = validateTree(profile, after.trees[profile.key]);
    if (!same(beforeRepository, afterRepository)
      || !same(beforeTree.projection, afterTree.projection)) {
      fail("PINNED_SOURCE_CHANGED_DURING_ACQUISITION", profile.key);
    }
  }
}

async function downloadObject(root, profile, entry, fetchImpl) {
  const url = `${apiUrls(profile).rawBase}/${entry.path.split("/")
    .map(encodeURIComponent).join("/")}`;
  const fetched = await boundedFetch(url, Math.min(MAX_OBJECT_BYTES,
    entry.sizeBytes + 1), fetchImpl);
  if (fetched.bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_INVALID",
    `${profile.key}:${entry.path}`);
  const sha256 = recapSha256(fetched.bytes);
  if (entry.lfsSha256 !== null) {
    if (sha256 !== entry.lfsSha256) fail("OBJECT_LFS_HASH_INVALID",
      `${profile.key}:${entry.path}`);
  } else if (gitBlobOid(fetched.bytes) !== entry.oid) {
    fail("OBJECT_GIT_HASH_INVALID", `${profile.key}:${entry.path}`);
  }
  const relativePath = `objects/${profile.key}/${entry.path}`;
  writePrivateFileOnce(safeJoin(root, relativePath), fetched.bytes);
  return {
    repoKey: profile.key, datasetId: profile.id, revision: profile.revision,
    path: entry.path, file: relativePath, requestUrl: url,
    finalUrl: fetched.finalUrl, status: fetched.status,
    contentType: fetched.contentType, bytes: fetched.bytes.length, sha256,
    gitOid: entry.oid, lfsSha256: entry.lfsSha256,
  };
}

function sourceRootFor(apiSnapshots, remoteObjects) {
  const files = [
    ...apiSnapshots.map((entry) => ({ file: entry.file, bytes: entry.bytes,
      sha256: entry.sha256 })),
    ...remoteObjects.map((entry) => ({ file: entry.file, bytes: entry.bytes,
      sha256: entry.sha256 })),
  ].sort((left, right) => left.file.localeCompare(right.file));
  return { files, sourceRoot: digest("outsider/recap-source-root/v1", files) };
}

function sourceManifestHash(body) {
  return digest("outsider/recap-source-manifest/v1", body);
}

export async function acquirePinnedRecapSource(sourceDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  if (existsSync(sourceDirectory)) fail("SOURCE_EXISTS", sourceDirectory);
  const parent = path.dirname(path.resolve(sourceDirectory));
  ensurePrivateDirectory(parent);
  const temporary = path.join(parent,
    `.${path.basename(sourceDirectory)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const beforeDescriptors = await fetchSnapshotSet(temporary, "before", fetchImpl);
    const before = snapshotsByPhase(temporary, beforeDescriptors, "before");
    const selections = [];
    for (const profile of RECAP_REPOSITORIES) {
      const tree = validateTree(profile, before.trees[profile.key]);
      for (const entry of tree.selected) selections.push({ profile, entry });
    }
    const remoteObjects = (await mapConcurrent(selections, FETCH_CONCURRENCY,
      ({ profile, entry }) => downloadObject(temporary, profile, entry, fetchImpl)))
      .sort((left, right) => left.file.localeCompare(right.file));
    if (remoteObjects.length !== RECAP_PROFILE.selectedObjects
      || remoteObjects.reduce((sum, entry) => sum + entry.bytes, 0)
        !== RECAP_PROFILE.selectedBytes
      || remoteObjects.some((entry) => /\.(?:mp4|avi|mov|mkv)$/iu.test(entry.path))) {
      fail("SELECTED_CLOSURE_INVALID");
    }
    const afterDescriptors = await fetchSnapshotSet(temporary, "after", fetchImpl);
    const apiSnapshots = [...beforeDescriptors, ...afterDescriptors]
      .sort((left, right) => left.file.localeCompare(right.file));
    const after = snapshotsByPhase(temporary, afterDescriptors, "after");
    compareStableSnapshots(before, after);
    const rooted = sourceRootFor(apiSnapshots, remoteObjects);
    const manifestBody = {
      schema: RECAP_SOURCE_SCHEMA,
      frozenAt: RECAP_FROZEN_AT,
      declaredQuery: RECAP_DECLARED_QUERY,
      apiSnapshots,
      remoteObjects,
      sourceFiles: rooted.files,
      sourceRoot: rooted.sourceRoot,
      closure: {
        declaredRepositories: RECAP_PROFILE.declaredRepositories,
        selectedObjects: remoteObjects.length,
        selectedBytes: remoteObjects.reduce((sum, entry) => sum + entry.bytes, 0),
        videosSelected: 0,
        completePrimaryRolloutNoVideo: true,
        completePrimaryMergedNoVideo: true,
        declaredScopeGlobalExhaustion: false,
      },
    };
    const manifest = { ...manifestBody, manifestHash: sourceManifestHash(manifestBody) };
    writePrivateFileOnce(path.join(temporary, "acquisition-manifest.json"),
      canonicalBytes(manifest));
    enforcePrivateTree(temporary);
    renameSync(temporary, sourceDirectory);
    chmodSync(sourceDirectory, 0o700);
    return { sourceDirectory, manifest };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function readRegularFile(file, expectedBytes = null) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) fail("FILE_UNSAFE", file);
  const bytes = readFileSync(file);
  if (expectedBytes !== null && bytes.length !== expectedBytes) {
    fail("FILE_SIZE_INVALID", file);
  }
  return bytes;
}

function enforcePrivateTree(root) {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", root);
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) enforcePrivateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

function walkRelative(root) {
  const files = [];
  const queue = [root];
  while (queue.length > 0) {
    const directory = queue.shift();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
      if (entry.isDirectory()) queue.push(child);
      else if (entry.isFile()) files.push(path.relative(root, child).split(path.sep).join("/"));
      else fail("SPECIAL_FILE_REFUSED", child);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function verifyRemoteObjects(root, manifest, trees) {
  if (!Array.isArray(manifest.remoteObjects)
    || manifest.remoteObjects.length !== RECAP_PROFILE.selectedObjects) {
    fail("REMOTE_OBJECT_CENSUS_INVALID");
  }
  const expected = [];
  for (const profile of RECAP_REPOSITORIES) {
    const tree = validateTree(profile, trees[profile.key]);
    for (const entry of tree.selected) expected.push({ profile, entry });
  }
  const expectedKeys = expected.map(({ profile, entry }) => `${profile.key}\0${entry.path}`)
    .sort();
  const actualKeys = manifest.remoteObjects.map((entry) => `${entry.repoKey}\0${entry.path}`)
    .sort();
  if (!same(expectedKeys, actualKeys)) fail("REMOTE_OBJECT_SET_INVALID");
  for (const descriptor of manifest.remoteObjects) {
    const profile = profileByKey(descriptor.repoKey);
    const tree = validateTree(profile, trees[profile.key]);
    const entry = tree.selected.find((item) => item.path === descriptor.path);
    if (!entry || descriptor.datasetId !== profile.id
      || descriptor.revision !== profile.revision
      || descriptor.file !== `objects/${profile.key}/${entry.path}`
      || descriptor.bytes !== entry.sizeBytes || descriptor.gitOid !== entry.oid
      || descriptor.lfsSha256 !== entry.lfsSha256
      || !HASH.test(descriptor.sha256 ?? "")) fail("REMOTE_DESCRIPTOR_INVALID");
    const bytes = readRegularFile(safeJoin(root, descriptor.file), descriptor.bytes);
    if (recapSha256(bytes) !== descriptor.sha256) fail("REMOTE_HASH_INVALID", descriptor.file);
    if (entry.lfsSha256 !== null ? descriptor.sha256 !== entry.lfsSha256
      : gitBlobOid(bytes) !== entry.oid) fail("REMOTE_TREE_BINDING_INVALID", descriptor.file);
  }
}

export function verifyRecapSourceDirectory(sourceDirectory) {
  try {
    const rootStat = lstatSync(sourceDirectory);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) fail("SOURCE_DIRECTORY_UNSAFE");
    const manifestBytes = readRegularFile(path.join(sourceDirectory,
      "acquisition-manifest.json"));
    const manifest = parseJson(manifestBytes, "acquisition-manifest.json");
    if (!plain(manifest) || manifest.schema !== RECAP_SOURCE_SCHEMA
      || manifest.frozenAt !== RECAP_FROZEN_AT
      || manifest.declaredQuery !== RECAP_DECLARED_QUERY
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 54
      || !Array.isArray(manifest.sourceFiles) || !HASH.test(manifest.sourceRoot ?? "")
      || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_SHAPE_INVALID");
    for (const descriptor of manifest.apiSnapshots) {
      if (!plain(descriptor) || !safeRemotePath(descriptor.file)
        || !HASH.test(descriptor.sha256 ?? "")
        || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1
        || !permittedUrl(descriptor.requestUrl) || !permittedUrl(descriptor.finalUrl)
        || descriptor.status !== 200) fail("SNAPSHOT_DESCRIPTOR_INVALID");
      readSnapshot(sourceDirectory, descriptor);
    }
    const before = snapshotsByPhase(sourceDirectory, manifest.apiSnapshots, "before");
    const after = snapshotsByPhase(sourceDirectory, manifest.apiSnapshots, "after");
    compareStableSnapshots(before, after);
    verifyRemoteObjects(sourceDirectory, manifest, before.trees);
    const rooted = sourceRootFor(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles)
      || rooted.sourceRoot !== manifest.sourceRoot) fail("SOURCE_ROOT_INVALID");
    const actualFiles = walkRelative(sourceDirectory);
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"]
      .sort((left, right) => left.localeCompare(right));
    if (!same(actualFiles, expectedFiles)) fail("SOURCE_FILE_CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== sourceManifestHash(body)) fail("MANIFEST_HASH_INVALID");
    if (!same(manifest.closure, {
      declaredRepositories: 13, selectedObjects: 38, selectedBytes: 9_221_802,
      videosSelected: 0, completePrimaryRolloutNoVideo: true,
      completePrimaryMergedNoVideo: true, declaredScopeGlobalExhaustion: false,
    })) fail("MANIFEST_CLOSURE_INVALID");
    return { ok: true, manifest, before, after,
      verificationLevel:
        "PINNED_13_REPOSITORY_DECLARED_SCOPE_AND_PRIMARY_NO_VIDEO_BYTES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYARROW_REPLAY = String.raw`
import json, os, sys
import pyarrow.parquet as pq

root = sys.argv[1]

def die(code, detail=""):
    raise RuntimeError("RECAP_SO101_PYARROW_" + code + ((":" + detail) if detail else ""))

def obj(key, rel):
    return os.path.join(root, "objects", key, *rel.split("/"))

def read_json(key, rel):
    with open(obj(key, rel), "r", encoding="utf-8") as handle:
        return json.load(handle)

def table(key, rel):
    return pq.read_table(obj(key, rel))

def scalar_list(tab, name):
    return tab[name].to_pylist()

def validate_data(key, expected_rows, expected_episodes, fps, signals):
    data = table(key, "data/chunk-000/file-000.parquet")
    info = read_json(key, "meta/info.json")
    episodes = table(key, "meta/episodes/chunk-000/file-000.parquet")
    tasks = table(key, "meta/tasks.parquet")
    if data.num_rows != expected_rows or info.get("total_frames") != expected_rows:
        die("FRAME_COUNT", key)
    if info.get("total_episodes") != expected_episodes or episodes.num_rows != expected_episodes:
        die("EPISODE_COUNT", key)
    if info.get("fps") != fps or info.get("total_tasks") != 1 or tasks.num_rows != 1:
        die("INFO_PROFILE", key)
    names = data.column_names
    required = ["action", "observation.state", "timestamp", "frame_index",
                "episode_index", "index", "task_index"]
    if signals:
        required += ["is_intervention", "episode_success"]
    if set(names) != set(required):
        die("DATA_COLUMNS", key)
    values = {name: scalar_list(data, name) for name in required}
    if values["index"] != list(range(expected_rows)):
        die("GLOBAL_INDEX", key)
    if any(len(item) != 12 for item in values["action"] + values["observation.state"]):
        die("STATE_ACTION_DIMENSIONS", key)
    episode_rows = episodes.select(["episode_index", "length", "dataset_from_index",
                                    "dataset_to_index"]).to_pylist()
    if [row["episode_index"] for row in episode_rows] != list(range(expected_episodes)):
        die("METADATA_EPISODE_INDEX", key)
    if sum(row["length"] for row in episode_rows) != expected_rows:
        die("METADATA_LENGTH_SUM", key)
    cursor = 0
    for row in episode_rows:
        length = row["length"]
        if row["dataset_from_index"] != cursor or row["dataset_to_index"] != cursor + length:
            die("METADATA_RANGE", key)
        stop = cursor + length
        if values["episode_index"][cursor:stop] != [row["episode_index"]] * length:
            die("FRAME_EPISODE_ALIGNMENT", key)
        if values["frame_index"][cursor:stop] != list(range(length)):
            die("FRAME_INDEX", key)
        if any(abs(float(values["timestamp"][cursor + i]) - (i / fps)) > 0.00001
               for i in range(length)):
            die("TIMESTAMP", key)
        cursor = stop
    return data, info, episodes, tasks, values, episode_rows

def signal_summary(values, episode_rows):
    frame_cross = {"successNoIntervention": 0, "successIntervention": 0,
                   "failureNoIntervention": 0, "failureIntervention": 0}
    episode_cross = {"successNoIntervention": 0, "successIntervention": 0,
                     "failureNoIntervention": 0, "failureIntervention": 0}
    episodes = []
    for row in episode_rows:
        start, stop = row["dataset_from_index"], row["dataset_to_index"]
        success_values = set(int(item) for item in values["episode_success"][start:stop])
        if len(success_values) != 1 or not success_values.issubset({0, 1}):
            die("SUCCESS_NOT_EPISODE_CONSTANT")
        intervention = [int(item) for item in values["is_intervention"][start:stop]]
        if any(item not in (0, 1) for item in intervention):
            die("INTERVENTION_NOT_BINARY")
        success = next(iter(success_values))
        intervention_frames = sum(intervention)
        segments = 0
        previous = 0
        for current in intervention:
            if current == 1 and previous == 0:
                segments += 1
            previous = current
        key = ("success" if success else "failure") + ("Intervention" if intervention_frames else "NoIntervention")
        episode_cross[key] += 1
        episodes.append({"episodeIndex": row["episode_index"], "frames": row["length"],
                         "success": success, "interventionFrames": intervention_frames,
                         "interventionSegments": segments})
        for current in intervention:
            frame_key = ("success" if success else "failure") + ("Intervention" if current else "NoIntervention")
            frame_cross[frame_key] += 1
    return {"frameCross": frame_cross, "episodeCross": episode_cross,
            "interventionFrames": sum(item["interventionFrames"] for item in episodes),
            "interventionEpisodes": sum(item["interventionFrames"] > 0 for item in episodes),
            "interventionSegments": sum(item["interventionSegments"] for item in episodes),
            "successfulEpisodes": sum(item["success"] for item in episodes),
            "failedEpisodes": sum(1 - item["success"] for item in episodes),
            "episodes": episodes}

rollout = validate_data("rollout_new_7", 8927, 20, 15, True)
merged = validate_data("merged_h264", 97457, 321, 15, True)
rollout_summary = signal_summary(rollout[4], rollout[5])
merged_summary = signal_summary(merged[4], merged[5])

start = merged[5][301]["dataset_from_index"]
mapping_fields = ["action", "observation.state", "timestamp", "frame_index",
                  "task_index", "is_intervention", "episode_success"]
field_matches = {}
for field in mapping_fields:
    left = rollout[4][field]
    right = merged[4][field][start:start + len(left)]
    field_matches[field] = sum(a == b for a, b in zip(left, right))
if any(count != 8927 for count in field_matches.values()):
    die("ROLLOUT_FIELD_CROSSWALK")
if any(target != source + 301 for source, target in zip(
       rollout[4]["episode_index"], merged[4]["episode_index"][start:])):
    die("ROLLOUT_EPISODE_OFFSET")
if any(target != source + start for source, target in zip(
       rollout[4]["index"], merged[4]["index"][start:])):
    die("ROLLOUT_GLOBAL_OFFSET")
if [row["length"] for row in rollout[5]] != [row["length"] for row in merged[5][301:]]:
    die("ROLLOUT_EPISODE_LENGTH_CROSSWALK")

if start != 88530 or any(int(item) != 1 for item in merged[4]["is_intervention"][:start]) \
   or any(int(item) != 1 for item in merged[4]["episode_success"][:start]):
    die("TELEOP_PREFIX")

legacy_info = read_json("merged_legacy", "meta/info.json")
legacy_episodes = table("merged_legacy", "meta/episodes/chunk-000/file-000.parquet")
legacy_rows = legacy_episodes.select(["episode_index", "length", "dataset_from_index",
                                      "dataset_to_index"]).to_pylist()
legacy_lengths = [row["length"] for row in legacy_rows]
merged_lengths = [row["length"] for row in merged[5]]
if legacy_info.get("total_episodes") != 320 or legacy_info.get("total_frames") != 96162 \
   or len(legacy_rows) != 320 or sum(legacy_lengths) != 96162:
    die("LEGACY_METADATA_PROFILE")
if legacy_lengths != merged_lengths[:122] + merged_lengths[123:] \
   or merged_lengths[122] != 1295:
    die("LEGACY_INSERTION_CROSSWALK")

base = validate_data("recap_episodes_1", 8803, 20, 30, False)
derived = table("so101_cup_recap_20ep", "data/chunk-000/file-000.parquet")
derived_info = read_json("so101_cup_recap_20ep", "meta/info.json")
if derived.num_rows != 8803 or derived_info.get("total_episodes") != 20 \
   or derived_info.get("total_frames") != 8803 or derived_info.get("fps") != 30:
    die("DERIVED_PROFILE")
core_fields = ["action", "observation.state", "timestamp", "frame_index",
               "episode_index", "index", "task_index"]
core_matches = {}
for field in core_fields:
    left = base[4][field]
    right = derived[field].to_pylist()
    core_matches[field] = sum(a == b for a, b in zip(left, right))
if any(count != 8803 for count in core_matches.values()):
    die("DERIVED_CORE_CROSSWALK")
if set(derived.column_names) != set(core_fields + ["advantage", "advantage_indicator", "loss_mask"]):
    die("DERIVED_COLUMNS")
labels = read_json("recap_episodes_1", "recap_episode_labels.json")
advantages = read_json("recap_episodes_1", "recap_advantages.json")
if len(labels) != 20 or len(advantages.get("episodes", {})) != 20 \
   or advantages.get("stats", {}).get("num_frames") != 8803:
    die("DERIVED_SUPPORT")
label_successes = sum(bool(value.get("success")) for value in labels.values())
if label_successes != 12:
    die("DERIVED_LABEL_COUNTS")

zero_keys = ["eval_recap_pi05", "eval_recap_pi05_cup", "eval_recap_pi05_cup_2",
             "recap_pi05_cup_new_2", "recap_pi05_cup_new_3",
             "recap_pi05_cup_new_4", "recap_pi05_cup_new_5",
             "recap_pi05_cup_new_6"]
for key in zero_keys:
    info = read_json(key, "meta/info.json")
    if info.get("total_episodes") != 0 or info.get("total_frames") != 0 \
       or info.get("total_tasks") != 0:
        die("ZERO_EPISODE_PROFILE", key)

out = {
  "primaryRollout": {
    "episodes": 20, "frames": 8927, "fps": 15,
    "actionDimensions": 12, "stateDimensions": 12,
    "signalSummary": rollout_summary,
  },
  "mergedH264": {
    "episodes": 321, "frames": 97457, "fps": 15,
    "actionDimensions": 12, "stateDimensions": 12,
    "signalSummary": {key: value for key, value in merged_summary.items() if key != "episodes"},
    "teleopPrefix": {"episodes": 301, "frames": 88530,
                      "allPublisherSuccess": True, "allIntervention": True},
  },
  "lineage": {
    "sourceEpisodes": 20, "sourceFrames": 8927,
    "targetEpisodeStart": 301, "targetEpisodeEndInclusive": 320,
    "targetFrameStart": 88530, "targetFrameEndExclusive": 97457,
    "episodeIndexOffset": 301, "globalIndexOffset": 88530,
    "fieldExactMatchCounts": field_matches,
    "allSevenFieldsExact": True, "episodeLengthsExact": True,
  },
  "legacyMetadataDrift": {
    "metadataEpisodes": 320, "metadataFrames": 96162,
    "missingRelativeToPhysicalParquet": {"episodeIndex": 122, "frames": 1295},
    "metadataLengthSequenceEqualsH264MinusInsertedEpisode": True,
  },
  "supportDerivative": {
    "baseEpisodes": 20, "baseFrames": 8803, "fps": 30,
    "basePublisherSuccessLabels": 12, "basePublisherFailureLabels": 8,
    "coreFieldExactMatchCounts": core_matches, "allSevenCoreFieldsExact": True,
    "derivedColumns": ["advantage", "advantage_indicator", "loss_mask"],
    "distinctEpisodeSetFromPrimaryRollout": True,
    "sameEpisodeSetAcrossSupportPair": True,
  },
  "zeroEpisodeRepositories": zero_keys,
}
print(json.dumps(out, sort_keys=True, separators=(",", ":")))
`;

function replayPath(sourceDirectory, key, remotePath) {
  return path.join(sourceDirectory, "objects", key, ...remotePath.split("/"));
}

export function runRecapPyarrowReplay(sourceDirectory,
  options = {}) {
  const pythonExecutable = options.pythonExecutable ?? ".venv/bin/python";
  const executed = spawnSync(pythonExecutable, ["-c", PYARROW_REPLAY,
    path.resolve(sourceDirectory)], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  if (executed.error) fail("PYARROW_EXEC_FAILED", executed.error.message);
  if (executed.status !== 0) fail("PYARROW_REPLAY_FAILED",
    String(executed.stderr || executed.stdout).trim());
  const replay = parseJson(Buffer.from(executed.stdout, "utf8"), "PYARROW_REPLAY");
  if (!plain(replay) || replay.primaryRollout?.episodes !== 20
    || replay.primaryRollout?.frames !== 8_927
    || replay.mergedH264?.episodes !== 321 || replay.mergedH264?.frames !== 97_457
    || replay.lineage?.allSevenFieldsExact !== true
    || replay.supportDerivative?.allSevenCoreFieldsExact !== true
    || replay.zeroEpisodeRepositories?.length !== 8) fail("PYARROW_RESULT_INVALID");
  return replay;
}

function treeFile(before, key, remotePath) {
  const profile = profileByKey(key);
  const tree = validateTree(profile, before.trees[key]);
  const found = tree.projection.find((entry) => entry.type === "file"
    && entry.path === remotePath);
  if (!found) fail("TREE_FILE_NOT_FOUND", `${key}:${remotePath}`);
  return found;
}

function sourceCrosswalks(verified) {
  const before = verified.before;
  const mainData = treeFile(before, "merged_h264", "data/chunk-000/file-000.parquet");
  const legacyData = treeFile(before, "merged_legacy", "data/chunk-000/file-000.parquet");
  if (mainData.lfsSha256 === null || mainData.lfsSha256 !== legacyData.lfsSha256
    || mainData.sizeBytes !== legacyData.sizeBytes) fail("LEGACY_DATA_OBJECT_NOT_SHARED");
  const baseShared = ["meta/episodes/chunk-000/file-000.parquet", "meta/stats.json",
    "meta/tasks.parquet", "recap_advantages.json", "recap_episode_labels.json"];
  for (const remotePath of baseShared) {
    const left = treeFile(before, "recap_episodes_1", remotePath);
    const right = treeFile(before, "so101_cup_recap_20ep", remotePath);
    if (left.oid !== right.oid || left.sizeBytes !== right.sizeBytes
      || left.lfsSha256 !== right.lfsSha256) fail("SUPPORT_OBJECT_NOT_SHARED", remotePath);
  }
  const rolloutVideos = validateTree(profileByKey("rollout_new_7"),
    before.trees.rollout_new_7).projection.filter((entry) => entry.type === "file"
      && entry.path.startsWith("videos/"));
  const legacyVideos = validateTree(profileByKey("merged_legacy"),
    before.trees.merged_legacy).projection.filter((entry) => entry.type === "file"
      && entry.path.startsWith("videos/"));
  const videoMatches = rolloutVideos.map((entry) => {
    const target = legacyVideos.find((candidate) => candidate.lfsSha256 === entry.lfsSha256
      && candidate.sizeBytes === entry.sizeBytes);
    if (!target) fail("ROLLOUT_VIDEO_OBJECT_CROSSWALK_MISSING", entry.path);
    return { sourcePath: entry.path, targetPath: target.path,
      bytes: entry.sizeBytes, lfsSha256: entry.lfsSha256 };
  });
  return {
    legacyAndH264DataParquetSameLfsObject: true,
    sharedDataParquet: { bytes: mainData.sizeBytes, lfsSha256: mainData.lfsSha256 },
    supportSharedObjects: baseShared,
    rolloutVideoObjectsMappedIntoLegacyMergedByLfsIdentity: videoMatches,
    rolloutVideoObjectsMappedIntoH264MergedByLfsIdentity: false,
    rolloutVideoObjectsAcquired: false,
  };
}

function inspectReadmes(sourceDirectory) {
  const rollout = readRegularFile(replayPath(sourceDirectory, "rollout_new_7",
    "README.md")).toString("utf8");
  const merged = readRegularFile(replayPath(sourceDirectory, "merged_h264",
    "README.md")).toString("utf8");
  const legacy = readRegularFile(replayPath(sourceDirectory, "merged_legacy",
    "README.md")).toString("utf8");
  const support = readRegularFile(replayPath(sourceDirectory, "recap_episodes_1",
    "README.md")).toString("utf8");
  if (!merged.includes("Human teleop demonstrations (301 episodes)")
    || !merged.includes("recap_pi05_cup_new_7")
    || !merged.includes("policy rollouts with interventions (20 episodes)")
    || !rollout.includes("license: apache-2.0")
    || !support.includes("license: apache-2.0")
    || !legacy.includes('"total_episodes": 320')
    || !legacy.includes('"total_frames": 96162')) fail("README_CLAIMS_INVALID");
  return {
    mergedPublisherDeclares301TeleopPlus20Rollout: true,
    primaryRolloutReadmeDeclaresApache2: true,
    primaryMergedReadmeDeclaresApache2: true,
    supportBaseReadmeDeclaresApache2: true,
    derivativeRepositoryHasNoReadme: true,
  };
}

export function recapArtifactHash(body) {
  return digest("outsider/recap-so101-linked-lineage/v1", body);
}

function artifactBody(verified, replay, crosswalks, readmes) {
  const disposition = RECAP_REPOSITORIES.map((profile) => ({
    datasetId: profile.id, revision: profile.revision,
    disposition: profile.disposition, selectedObjects: profile.selectedPaths.length,
    selectedBytes: profile.selectedBytes,
  }));
  return {
    schema: RECAP_LINEAGE_SCHEMA,
    frozenAt: RECAP_FROZEN_AT,
    status: "PINNED_RECAP_DECLARED_SCOPE_AND_LINKED_NO_VIDEO_REPLAY",
    admission: "ACQUIRED_EVAL_ONLY",
    source: {
      declaredQuery: RECAP_DECLARED_QUERY,
      queryScope: { author: RECAP_AUTHOR, search: "recap", limit: 100,
        returnedRepositories: 13, globallyExhaustive: false },
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      selectedObjects: 38,
      selectedBytes: 9_221_802,
      disposition,
    },
    replay,
    exactCrosswalks: crosswalks,
    publisherClaims: readmes,
    lineageConclusion: {
      publisherDeclaredLineage: true,
      primaryRolloutMappedExactlyIntoMerged: true,
      exactMappedEpisodes: 20,
      exactMappedFrames: 8_927,
      mappingMethod: "SEVEN_FRAME_FIELDS_PLUS_EPISODE_LENGTHS_AND_INDEX_OFFSETS",
      videoContentReplayed: false,
      videoObjectsCrosswalkedIntoLegacyMergedByPinnedLfsIdentity: true,
      videoObjectsCrosswalkedIntoH264MergedByPinnedLfsIdentity: false,
    },
    legacyMetadataConclusion: {
      legacyMetadataInternallyMatchesItsOwn320EpisodeRanges: true,
      legacyTreePointsToSamePhysicalDataParquetAsH264: true,
      physicalParquetReplayedThroughIdenticalLfsObject: true,
      legacyMetadataMatchesPhysicalParquet: false,
      exactMissingEpisode: { h264EpisodeIndex: 122, frames: 1_295 },
    },
    supportConclusion: {
      recapEpisodes1DistinctFromPrimaryRollout: true,
      so101CupDerivativeAddsThreeAdvantageFieldsToExactSameCoreFrames: true,
      derivativeContributesDistinctEpisodes: false,
      derivativeRightsFailClosed: true,
    },
    outcome: {
      episodeSuccessSource: "PUBLISHER_OPERATOR_LABEL",
      independentOutcome: 0,
      longitudinalOutcome: 0,
      interventionAutomaticallyMeansRecovery: false,
    },
    recovery: {
      explicitRetryOrRecoveryIdentifier: false,
      pairedFailureToRecoveryAttempts: false,
      collectionAttemptCensusComplete: false,
      publishedMergedEpisodeCensusCompleteWithinPinnedBytes: true,
      upstreamDiscardedAttemptsUnknown: true,
    },
    completeness: {
      allPrimaryRolloutDataAndMetadataAcquired: true,
      allPrimaryMergedDataAndMetadataAcquired: true,
      allSelectedParquetsReplayed: true,
      all13PinnedRepositoryRecordsAndTreesCapturedBeforeAndAfter: true,
      declaredAuthorSearchScopeCompleteAtCutoff: true,
      globalSourceExhaustion: false,
      videosAcquired: false,
      visualReplay: false,
    },
    rights: {
      primaryDatasetCardClaims: "Apache-2.0",
      repositoryLicenseFilesPresent: false,
      derivativeDatasetCardClaim: null,
      derivativeTrainingAllowed: false,
      productionTrainingRightFinallyAdjudicated: false,
    },
    privacy: {
      videosAcquired: false,
      publicAvailabilityResolvesPrivacy: false,
      privacyReviewComplete: false,
      noPersonalInformationGuarantee: false,
    },
    boundary: {
      training: 0, network: 0, CEU: 0, authority: 0, action: 0,
      opportunity: 0, delegation: 0, independentOutcome: 0,
      longitudinalOutcome: 0,
    },
  };
}

export function buildRecapLinkedLineageFromSource(sourceDirectory, options = {}) {
  const verified = verifyRecapSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runRecapPyarrowReplay(sourceDirectory, options);
  const crosswalks = sourceCrosswalks(verified);
  const readmes = inspectReadmes(sourceDirectory);
  const body = artifactBody(verified, replay, crosswalks, readmes);
  return { ...body, artifactHash: recapArtifactHash(body) };
}

function zeroBoundary(value) {
  return plain(value) && ["training", "network", "CEU", "authority", "action",
    "opportunity", "delegation", "independentOutcome", "longitudinalOutcome"]
    .every((key) => value[key] === 0);
}

export function verifyRecapLinkedLineageArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== RECAP_LINEAGE_SCHEMA
      || artifact.frozenAt !== RECAP_FROZEN_AT
      || artifact.status !== "PINNED_RECAP_DECLARED_SCOPE_AND_LINKED_NO_VIDEO_REPLAY"
      || artifact.admission !== "ACQUIRED_EVAL_ONLY" || !HASH.test(artifact.artifactHash ?? "")) {
      fail("ARTIFACT_SHAPE_INVALID");
    }
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== recapArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.queryScope?.returnedRepositories !== 13
      || artifact.source?.queryScope?.globallyExhaustive !== false
      || artifact.source?.selectedObjects !== 38 || artifact.source?.selectedBytes !== 9_221_802
      || artifact.source?.disposition?.length !== 13) fail("ARTIFACT_SOURCE_SCOPE_INVALID");
    const rollout = artifact.replay?.primaryRollout;
    const merged = artifact.replay?.mergedH264;
    const lineage = artifact.replay?.lineage;
    if (rollout?.episodes !== 20 || rollout?.frames !== 8_927
      || rollout?.signalSummary?.successfulEpisodes !== 7
      || rollout?.signalSummary?.failedEpisodes !== 13
      || rollout?.signalSummary?.interventionFrames !== 2_341
      || rollout?.signalSummary?.interventionEpisodes !== 11
      || rollout?.signalSummary?.interventionSegments !== 26
      || merged?.episodes !== 321 || merged?.frames !== 97_457
      || merged?.signalSummary?.successfulEpisodes !== 308
      || merged?.signalSummary?.failedEpisodes !== 13
      || merged?.signalSummary?.interventionFrames !== 90_871
      || merged?.signalSummary?.interventionEpisodes !== 312
      || merged?.signalSummary?.interventionSegments !== 327
      || merged?.teleopPrefix?.episodes !== 301
      || merged?.teleopPrefix?.frames !== 88_530
      || lineage?.targetEpisodeStart !== 301 || lineage?.targetEpisodeEndInclusive !== 320
      || lineage?.targetFrameStart !== 88_530 || lineage?.targetFrameEndExclusive !== 97_457
      || lineage?.allSevenFieldsExact !== true || lineage?.episodeLengthsExact !== true) {
      fail("ARTIFACT_REPLAY_INVALID");
    }
    if (artifact.replay?.legacyMetadataDrift?.missingRelativeToPhysicalParquet?.episodeIndex !== 122
      || artifact.replay?.legacyMetadataDrift?.missingRelativeToPhysicalParquet?.frames !== 1_295
      || artifact.replay?.supportDerivative?.baseFrames !== 8_803
      || artifact.replay?.supportDerivative?.basePublisherSuccessLabels !== 12
      || artifact.replay?.supportDerivative?.basePublisherFailureLabels !== 8
      || artifact.replay?.supportDerivative?.allSevenCoreFieldsExact !== true
      || artifact.replay?.zeroEpisodeRepositories?.length !== 8) {
      fail("ARTIFACT_SUPPORT_INVALID");
    }
    if (artifact.lineageConclusion?.primaryRolloutMappedExactlyIntoMerged !== true
      || artifact.legacyMetadataConclusion?.legacyMetadataMatchesPhysicalParquet !== false
      || artifact.supportConclusion?.derivativeContributesDistinctEpisodes !== false
      || artifact.supportConclusion?.derivativeRightsFailClosed !== true
      || artifact.outcome?.independentOutcome !== 0
      || artifact.outcome?.interventionAutomaticallyMeansRecovery !== false
      || artifact.recovery?.explicitRetryOrRecoveryIdentifier !== false
      || artifact.recovery?.pairedFailureToRecoveryAttempts !== false
      || artifact.recovery?.collectionAttemptCensusComplete !== false
      || artifact.completeness?.videosAcquired !== false
      || artifact.completeness?.visualReplay !== false
      || artifact.completeness?.globalSourceExhaustion !== false
      || artifact.rights?.derivativeDatasetCardClaim !== null
      || artifact.rights?.derivativeTrainingAllowed !== false
      || artifact.rights?.productionTrainingRightFinallyAdjudicated !== false
      || artifact.privacy?.privacyReviewComplete !== false
      || artifact.privacy?.noPersonalInformationGuarantee !== false
      || !zeroBoundary(artifact.boundary)) fail("ARTIFACT_BOUNDARY_INVALID");
    return { ok: true, artifactHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyRecapLinkedLineageArtifactWithSource(artifact,
  sourceDirectory, options = {}) {
  const standalone = verifyRecapLinkedLineageArtifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildRecapLinkedLineageFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("ARTIFACT_SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: rebuilt.source.sourceManifestHash,
      sourceRoot: rebuilt.source.sourceRoot,
      verificationLevel: "FULL_DECLARED_SCOPE_PRIMARY_BYTE_AND_PYARROW_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
