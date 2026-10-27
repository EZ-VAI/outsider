/*
 * Byte-pinned, video-free SO-101 Coffee recovery/census slice.
 *
 * The two populations in this module are deliberately non-additive:
 *   - 184 kept real-robot episodes with action/proprioceptive telemetry; and
 *   - 200 prospective attempt-census records, 16 of which are deleted and
 *     represented only by run-log metadata.
 *
 * Source-native labels and retry structure are evidence about the publisher's
 * record. They are not independent physical-effect or outcome verification,
 * delegation, authority, CEU, or permission to train or act.
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const SO101_COFFEE_RECOVERY_CENSUS_SCHEMA
  = "outsider/so101-coffee-recovery-census/v1";
export const SO101_COFFEE_SOURCE_MANIFEST_SCHEMA
  = "outsider/so101-coffee-pinned-source/v1";
export const SO101_COFFEE_RUN_RECEIPT_SCHEMA
  = "outsider/so101-coffee-recovery-census-run-receipt/v1";
export const SO101_COFFEE_DATASET_ID = "nevertmr/so101_coffee_rollouts";
export const SO101_COFFEE_REVISION = "eaf2d303f4958aa87fdd1ba81cca07bcf4d7296d";
export const SO101_COFFEE_FROZEN_AT = "2026-08-29T00:00:00.000Z";

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${SO101_COFFEE_DATASET_ID}`;
const TREE_PATH = `/api/datasets/${SO101_COFFEE_DATASET_ID}/tree/${SO101_COFFEE_REVISION}`;
const RAW_ROOT = `${HF_ORIGIN}/datasets/${SO101_COFFEE_DATASET_ID}/resolve/${SO101_COFFEE_REVISION}`;
const TREE_SNAPSHOT_DOMAIN = `${SO101_COFFEE_SOURCE_MANIFEST_SCHEMA}/tree-snapshot`;
const EXPECTED_TREE_HASH
  = "sha256:c63943039748c91d76f524d4772da7f18348dd194e06e1e331db3d90680e6e2c";
const EXPECTED_LAST_MODIFIED = "2026-08-11T06:49:03.000Z";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const RUN_NAME = /^coffee_new(0[1-9]|1[0-5])$/u;
const RUN_META_PATH = /^runs\/coffee_new(0[1-9]|1[0-5])\/run_meta\.json$/u;
const MAX_API_BYTES = 8 * 1024 * 1024;
const MAX_SELECTED_FILE_BYTES = 3 * 1024 * 1024;
const MAX_SOURCE_MANIFEST_BYTES = 2 * 1024 * 1024;
const EXPECTED_TREE_ENTRIES = 356;
const EXPECTED_TREE_FILES = 164;
const EXPECTED_TREE_PAGES = 8;
const EXPECTED_SELECTED_FILES = 23;
const EXPECTED_SELECTED_BYTES = 3_405_847;

const CANONICAL_OBJECTS = Object.freeze([
  { path: "README.md", sizeBytes: 6007,
    gitOid: "7f886718c7a2a64fb7dafef9f1c9bcdc6fff5ca2", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:75a55f1b39d49051e886b9e6af2d3f1e8fbcbdaec04724339ebf8bdeda8aae10" },
  { path: "data/chunk-000/file-000.parquet", sizeBytes: 2808271,
    gitOid: "993e72a582958cb97f680b9adfe36e4ce5337e59",
    lfsSha256: "sha256:354d55c9e365192b595e944cbd049331228946306fcac05f1b3c454e95d4f70a",
    lfsPointerSize: 132,
    contentSha256: "sha256:354d55c9e365192b595e944cbd049331228946306fcac05f1b3c454e95d4f70a" },
  { path: "episode_labels.csv", sizeBytes: 14500,
    gitOid: "4efdfbcaec20374c568f45223e21a6ea4466e46a", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:0ce17ccaf4d3e8872b0b4cb93ec1cec481bc8c665089f2cd4bb56c7ddc0ebb2c" },
  { path: "meta/episodes/chunk-000/file-000.parquet", sizeBytes: 343342,
    gitOid: "c09f17e320910caf351a6774e0f757891486e237",
    lfsSha256: "sha256:2301df78358d1d15523eb07817cfcb3afa35c6e0c23d354481a7320d9af69b26",
    lfsPointerSize: 131,
    contentSha256: "sha256:2301df78358d1d15523eb07817cfcb3afa35c6e0c23d354481a7320d9af69b26" },
  { path: "meta/info.json", sizeBytes: 3716,
    gitOid: "4136557c3ca74e7b0b9228748a9027997c446506", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:3c0daf8af963f17fb38a745c5c223b8eb29925d2300418887f5f300e866bc52e" },
  { path: "meta/stats.json", sizeBytes: 13048,
    gitOid: "49ca7d2a05ad4244690a5de1b69ad9957598b69b", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:e651523e27acc4bd6ca4b2bd4e967d209c075189a9625579cd4ab4677a34ac09" },
  { path: "meta/tasks.parquet", sizeBytes: 2354,
    gitOid: "64d3fdf76a9ed989358184a818cf0af68cc5700f",
    lfsSha256: "sha256:a9d21ea046576c3611a9c1671b937577ec3bf4af82a9c851a9e8e319b3aeb51f",
    lfsPointerSize: 129,
    contentSha256: "sha256:a9d21ea046576c3611a9c1671b937577ec3bf4af82a9c851a9e8e319b3aeb51f" },
  { path: "runs/ANALYSIS.md", sizeBytes: 23745,
    gitOid: "a8cff6f9bb2428ee3863c3c1afde7f70b0e747ee", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:3d40e9694e0313a04074b6175bbf55af69b7c3aa07a5f8a0fd0a801cb5e3a5ed" },
  { path: "runs/coffee_new01/run_meta.json", sizeBytes: 12993,
    gitOid: "00ce019e38af636b785ffcf13bc6b4a79a48bc85", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:71daaa4b89a3a79fcc4f0fee8af6b63e43812692ef9b3d6bb7151a3cf959d6ec" },
  { path: "runs/coffee_new02/run_meta.json", sizeBytes: 10882,
    gitOid: "593be79c49462dec519cd42dd748c6c90fff9534", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:847450e49ee420d557206ee834d64ab6dce84883e091d29763312729da51ad13" },
  { path: "runs/coffee_new03/run_meta.json", sizeBytes: 12443,
    gitOid: "1dcd2a636f8e426ee79ebd832e346000d1fc2836", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:2711ff0f1b9ee98a382a90b204bb70b3c25289281af3b43e385bf3d799d43547" },
  { path: "runs/coffee_new04/run_meta.json", sizeBytes: 17852,
    gitOid: "c99ef1e2c0c9a69c4ef7054b5213d8474c1b6528", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:bf10da4e949b0232bc37f2a1d398996a6b5e125c924b0dbb0e11f15fcb20d9bf" },
  { path: "runs/coffee_new05/run_meta.json", sizeBytes: 16518,
    gitOid: "0bac469fd3fed1654ec844229f5de709d14b4e11", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:d8f46cdb0beda64fba6f22fdf47ef2e18faa1b96ad289fe810900eecb667ad39" },
  { path: "runs/coffee_new06/run_meta.json", sizeBytes: 13998,
    gitOid: "10835304fe3515ef72b580471bbe7c807cf7db89", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:f5e65aa4bcb6591316fd05a585143cde6d6ae64ed3b042246fd77d5b498e54b6" },
  { path: "runs/coffee_new07/run_meta.json", sizeBytes: 11384,
    gitOid: "08d73a63c29201b50fdc39553a946cb82c33d73f", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:b9be0f51a3d19cb6d162ff787084d8133b59c27f4b3bea443c623f4473d923a8" },
  { path: "runs/coffee_new08/run_meta.json", sizeBytes: 12561,
    gitOid: "d6acb6ce0748a6ea692c5b5c2f20dbda7e7263ce", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:ab55a2d9631f9b3688ab4af6dba6ed2fa8b7111f890de4361ebdfe8730b314b6" },
  { path: "runs/coffee_new09/run_meta.json", sizeBytes: 11066,
    gitOid: "f5f7ed3f0573f0d747d62bfc7d344e2563cb0137", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:7b17bf5f8562d73a6cd63829896dac98d77d55629dca347c28c8d1e2191bc320" },
  { path: "runs/coffee_new10/run_meta.json", sizeBytes: 10761,
    gitOid: "766d6de87187e4b30e0cbbe5363b40289821bb38", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:8fc2873b48d44277bd2f073db62ff4a3c03342f92d38684ab0a33671f8d0bee8" },
  { path: "runs/coffee_new11/run_meta.json", sizeBytes: 10840,
    gitOid: "a90f9f66eeac0c31dd71add08fd314a6930fba23", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:24fb51d332070ee04a1bc249ba3ed0e1bca81e9ea49ee43f71ea1e1dc57d3394" },
  { path: "runs/coffee_new12/run_meta.json", sizeBytes: 14724,
    gitOid: "8eb6bcef12228fd182500c31716072dddd2497fe", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:6a33c3b24c4698617b26f7876239b3afad760a40563103a2fb2d1df0c518d453" },
  { path: "runs/coffee_new13/run_meta.json", sizeBytes: 11608,
    gitOid: "8081d5aefe23bbb1461638b7897d5fbea44495ff", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:c0bf674fa8b1665b4fd3c4406ff9cbb0950696354401c4fc7180fd963928f22a" },
  { path: "runs/coffee_new14/run_meta.json", sizeBytes: 12403,
    gitOid: "d3857e26ad55cc22657012bf338f4f45dff85aba", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:1ef9dfce53b9cce68eaf7677e209f80e636c937ffc9957442acc004d1de946f3" },
  { path: "runs/coffee_new15/run_meta.json", sizeBytes: 10831,
    gitOid: "e9a0556867fd25d0f92b3d6902e4b2ac698ff85e", lfsSha256: null,
    lfsPointerSize: null,
    contentSha256: "sha256:3fb2018131debc75e1cf7bfb22cc4e6adf890358babedca1ae66009b64236234" },
].sort((left, right) => left.path.localeCompare(right.path)));

const CANONICAL_PATHS = new Set(CANONICAL_OBJECTS.map((entry) => entry.path));

function fail(code, detail = null) {
  throw new Error(detail == null ? `SO101_COFFEE_${code}` : `SO101_COFFEE_${code}:${detail}`);
}

export function so101CoffeeSha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return so101CoffeeSha256Bytes(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`);
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function lfsPointerBytes(entry) {
  return Buffer.from("version https://git-lfs.github.com/spec/v1\n"
    + `oid sha256:${entry.lfsSha256.slice("sha256:".length)}\n`
    + `size ${entry.sizeBytes}\n`);
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return exactObject(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function equalCanonical(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function repositoryProjection(metadata) {
  if (!exactObject(metadata) || metadata.id !== SO101_COFFEE_DATASET_ID
    || metadata.sha !== SO101_COFFEE_REVISION || metadata.private !== false
    || metadata.gated !== false || metadata.disabled !== false
    || metadata.lastModified !== EXPECTED_LAST_MODIFIED
    || String(metadata.cardData?.license ?? "").toLowerCase() !== "apache-2.0") {
    fail("REPOSITORY_METADATA_INVALID");
  }
  return {
    datasetId: SO101_COFFEE_DATASET_ID,
    revision: SO101_COFFEE_REVISION,
    private: false,
    gated: false,
    disabled: false,
    lastModified: EXPECTED_LAST_MODIFIED,
    hfCardLicenseClaim: "apache-2.0",
  };
}

function treeProjection(entries) {
  if (!Array.isArray(entries)) fail("TREE_INVALID");
  const projected = entries.map((entry) => {
    if (!exactObject(entry) || !["file", "directory"].includes(entry.type)
      || typeof entry.path !== "string" || entry.path.length < 1
      || !Number.isSafeInteger(entry.size) || entry.size < 0
      || !SHA1.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
    let lfs = null;
    if (entry.lfs != null) {
      if (entry.type !== "file" || !exactObject(entry.lfs)
        || !SHA256_BARE.test(entry.lfs.oid ?? "") || entry.lfs.size !== entry.size
        || !Number.isSafeInteger(entry.lfs.pointerSize) || entry.lfs.pointerSize <= 0) {
        fail("TREE_LFS_ENTRY_INVALID", entry.path);
      }
      lfs = { oid: entry.lfs.oid, size: entry.lfs.size,
        pointerSize: entry.lfs.pointerSize };
    }
    return { type: entry.type, path: entry.path, size: entry.size, oid: entry.oid, lfs };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(projected.map((entry) => entry.path)).size !== projected.length) {
    fail("TREE_DUPLICATE_PATH");
  }
  return projected;
}

function parseNextTreeLink(header) {
  if (header == null || header === "") return null;
  const next = String(header).split(",")
    .find((piece) => /;\s*rel="next"\s*$/iu.test(piece.trim()));
  if (!next) return null;
  const match = /^\s*<([^>]+)>/u.exec(next);
  if (!match) fail("TREE_NEXT_LINK_INVALID");
  const parsed = new URL(match[1]);
  const allowed = ["expand", "recursive", "limit", "cursor"];
  if (parsed.origin !== HF_ORIGIN || parsed.pathname !== TREE_PATH
    || parsed.searchParams.get("expand") !== "true"
    || parsed.searchParams.get("recursive") !== "true"
    || parsed.searchParams.get("limit") !== "50"
    || !parsed.searchParams.get("cursor")
    || [...parsed.searchParams.keys()].some((key) => !allowed.includes(key))) {
    fail("TREE_NEXT_LINK_UNSAFE");
  }
  return parsed.toString();
}

async function boundedFetch(url, maximumBytes, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { redirect: "follow", headers: {
      accept: "application/json, application/octet-stream;q=0.9, text/plain;q=0.8",
      "user-agent": "outsider-so101-coffee-recovery-census/1.0",
    } });
  } catch (error) {
    fail("FETCH_TRANSPORT_FAILED", `${url}:${error?.cause?.code ?? error?.message ?? error}`);
  }
  if (!response?.ok) fail(`FETCH_${response?.status ?? "FAILED"}`, url);
  const declared = response.headers?.get?.("content-length");
  if (declared != null && (!/^[0-9]+$/u.test(declared)
    || Number(declared) > maximumBytes)) fail("FETCH_DECLARED_SIZE_INVALID", url);
  const reader = response.body?.getReader?.();
  if (!reader) fail("FETCH_BODY_MISSING", url);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      fail("FETCH_SIZE_INVALID", url);
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1) fail("FETCH_EMPTY", url);
  return { bytes: Buffer.concat(chunks, total), headers: response.headers };
}

async function jsonFetch(url, maximumBytes, fetchImpl) {
  const fetched = await boundedFetch(url, maximumBytes, fetchImpl);
  try { return { value: JSON.parse(fetched.bytes.toString("utf8")), headers: fetched.headers }; }
  catch { fail("FETCH_JSON_INVALID", url); }
}

async function fetchPinnedTree(fetchImpl) {
  const entries = [];
  let next = `${HF_API}/tree/${SO101_COFFEE_REVISION}`
    + "?expand=true&recursive=true&limit=50";
  let pages = 0;
  const seen = new Set();
  while (next !== null) {
    if (seen.has(next) || pages >= EXPECTED_TREE_PAGES + 1) fail("TREE_PAGINATION_INVALID");
    seen.add(next);
    const page = await jsonFetch(next, MAX_API_BYTES, fetchImpl);
    if (!Array.isArray(page.value) || page.value.length < 1 || page.value.length > 50) {
      fail("TREE_PAGE_INVALID");
    }
    entries.push(...page.value);
    pages += 1;
    next = parseNextTreeLink(page.headers?.get?.("link"));
  }
  const projection = treeProjection(entries);
  const fileCount = projection.filter((entry) => entry.type === "file").length;
  const snapshotHash = digest(TREE_SNAPSHOT_DOMAIN, projection);
  if (pages !== EXPECTED_TREE_PAGES || projection.length !== EXPECTED_TREE_ENTRIES
    || fileCount !== EXPECTED_TREE_FILES || snapshotHash !== EXPECTED_TREE_HASH) {
    fail("TREE_CANONICAL_PROFILE_CHANGED");
  }
  return { pages, projection, fileCount, snapshotHash };
}

function classifyTreeFiles(projection) {
  const counts = {
    selected: 0,
    rawTar: 0,
    perRunDuplicateNonVideo: 0,
    perRunVideo: 0,
    rootVideo: 0,
    conversionLogs: 0,
    gitAttributes: 0,
  };
  for (const entry of projection.filter((item) => item.type === "file")) {
    const remotePath = entry.path;
    if (CANONICAL_PATHS.has(remotePath)) counts.selected += 1;
    else if (/^raw\/coffee_new(?:0[1-9]|1[0-5])_raw\.tar$/u.test(remotePath)) counts.rawTar += 1;
    else if (/^runs\/coffee_new(?:0[1-9]|1[0-5])\/lerobot_ds\/videos\//u.test(remotePath)) {
      counts.perRunVideo += 1;
    } else if (/^runs\/coffee_new(?:0[1-9]|1[0-5])\/lerobot_ds\//u.test(remotePath)) {
      counts.perRunDuplicateNonVideo += 1;
    } else if (remotePath.startsWith("videos/")) counts.rootVideo += 1;
    else if (/^runs\/coffee_new(?:04|08)\/convert\.log$/u.test(remotePath)) {
      counts.conversionLogs += 1;
    } else if (remotePath === ".gitattributes") counts.gitAttributes += 1;
    else fail("TREE_FILE_UNCLASSIFIED", remotePath);
  }
  const expected = {
    selected: 23, rawTar: 15, perRunDuplicateNonVideo: 90, perRunVideo: 30,
    rootVideo: 3, conversionLogs: 2, gitAttributes: 1,
  };
  if (!equalCanonical(counts, expected)) fail("TREE_EXCLUSION_PROFILE_CHANGED");
  return counts;
}

export function selectPinnedSo101CoffeeEntries(treeEntries) {
  const projection = treeProjection(treeEntries);
  const treeHash = digest(TREE_SNAPSHOT_DOMAIN, projection);
  if (projection.length !== EXPECTED_TREE_ENTRIES
    || projection.filter((entry) => entry.type === "file").length !== EXPECTED_TREE_FILES
    || treeHash !== EXPECTED_TREE_HASH) fail("TREE_CANONICAL_PROFILE_CHANGED");
  const exclusions = classifyTreeFiles(projection);
  const byPath = new Map(projection.map((entry) => [entry.path, entry]));
  const selected = CANONICAL_OBJECTS.map((expected) => {
    const observed = byPath.get(expected.path);
    const expectedLfs = expected.lfsSha256 == null ? null : {
      oid: expected.lfsSha256.slice("sha256:".length), size: expected.sizeBytes,
      pointerSize: expected.lfsPointerSize,
    };
    if (!observed || observed.type !== "file" || observed.size !== expected.sizeBytes
      || observed.oid !== expected.gitOid || !equalCanonical(observed.lfs, expectedLfs)) {
      fail("TREE_SELECTED_OBJECT_CHANGED", expected.path);
    }
    return { ...expected };
  });
  const selectedBytes = selected.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (selected.length !== EXPECTED_SELECTED_FILES
    || selectedBytes !== EXPECTED_SELECTED_BYTES) fail("TREE_SELECTION_TOTAL_CHANGED");
  return { selected, selectedCount: selected.length, selectedBytes, exclusions, treeHash };
}

function safeTarget(root, remotePath) {
  if (!CANONICAL_PATHS.has(remotePath)) fail("REMOTE_PATH_UNSAFE", remotePath);
  const target = path.resolve(root, ...remotePath.split("/"));
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) fail("REMOTE_PATH_ESCAPE");
  return target;
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
}

function writeRaw(root, remotePath, bytes) {
  const target = safeTarget(root, remotePath);
  ensurePrivateDirectory(path.dirname(target));
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(target, 0o600);
}

function checkRemoteBytes(expected, bytes) {
  if (bytes.length !== expected.sizeBytes) fail("REMOTE_SIZE_MISMATCH", expected.path);
  const contentSha256 = so101CoffeeSha256Bytes(bytes);
  if (contentSha256 !== expected.contentSha256) fail("REMOTE_CONTENT_HASH_MISMATCH", expected.path);
  if (expected.lfsSha256 !== null) {
    if (contentSha256 !== expected.lfsSha256
      || lfsPointerBytes(expected).length !== expected.lfsPointerSize
      || gitBlobOid(lfsPointerBytes(expected)) !== expected.gitOid) {
      fail("REMOTE_LFS_BINDING_MISMATCH", expected.path);
    }
  } else if (gitBlobOid(bytes) !== expected.gitOid) {
    fail("REMOTE_GIT_BINDING_MISMATCH", expected.path);
  }
  return contentSha256;
}

async function mapConcurrent(values, width, operation) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      output[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, values.length) }, worker));
  return output;
}

export async function acquirePinnedSo101CoffeeSource(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_TOO_BROAD");
  ensurePrivateDirectory(path.dirname(target));
  const temporary = path.join(path.dirname(target),
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const repositoryBefore = repositoryProjection((await jsonFetch(HF_API,
      MAX_API_BYTES, fetchImpl)).value);
    const treeBefore = await fetchPinnedTree(fetchImpl);
    const selection = selectPinnedSo101CoffeeEntries(treeBefore.projection);
    const remoteObjects = await mapConcurrent(selection.selected, 3, async (entry) => {
      const encodedPath = entry.path.split("/").map(encodeURIComponent).join("/");
      const fetched = await boundedFetch(`${RAW_ROOT}/${encodedPath}?download=true`,
        Math.min(MAX_SELECTED_FILE_BYTES, entry.sizeBytes), fetchImpl);
      const contentSha256 = checkRemoteBytes(entry, fetched.bytes);
      writeRaw(temporary, entry.path, fetched.bytes);
      return { path: entry.path, sizeBytes: entry.sizeBytes, gitOid: entry.gitOid,
        lfsSha256: entry.lfsSha256, lfsPointerSize: entry.lfsPointerSize, contentSha256 };
    });
    const treeAfter = await fetchPinnedTree(fetchImpl);
    const repositoryAfter = repositoryProjection((await jsonFetch(HF_API,
      MAX_API_BYTES, fetchImpl)).value);
    if (!equalCanonical(repositoryBefore, repositoryAfter)
      || !equalCanonical(treeBefore.projection, treeAfter.projection)
      || treeBefore.snapshotHash !== treeAfter.snapshotHash) {
      fail("SOURCE_CHANGED_DURING_ACQUISITION");
    }
    const readme = readFileSync(path.join(temporary, "README.md"), "utf8");
    if (!/(^|\n)license:\s*apache-2\.0\s*($|\n)/iu.test(readme)) {
      fail("README_LICENSE_CLAIM_MISSING");
    }
    const manifestBody = {
      schema: SO101_COFFEE_SOURCE_MANIFEST_SCHEMA,
      capturedAt: SO101_COFFEE_FROZEN_AT,
      datasetId: SO101_COFFEE_DATASET_ID,
      pinnedRevision: SO101_COFFEE_REVISION,
      repositoryBefore,
      treeBefore: { pagesFetched: treeBefore.pages, entryCount: treeBefore.projection.length,
        fileCount: treeBefore.fileCount, snapshotHash: treeBefore.snapshotHash,
        entries: treeBefore.projection },
      treeAfter: { pagesFetched: treeAfter.pages, entryCount: treeAfter.projection.length,
        fileCount: treeAfter.fileCount, snapshotHash: treeAfter.snapshotHash,
        entries: treeAfter.projection },
      repositoryAfter,
      stableDuringAcquisition: true,
      selection: {
        rule: "README, publisher label CSV, merged root data and four root metadata files, publisher analysis, and exactly 15 root run_meta logs",
        selectedCount: selection.selectedCount,
        selectedBytes: selection.selectedBytes,
        exclusions: selection.exclusions,
        videoFetched: false,
        perRunDuplicateLerobotFetched: false,
        rawTarFetched: false,
      },
      rightsClaims: {
        hfCardLicenseClaim: "Apache-2.0",
        bytePinnedReadmeLicenseClaim: "Apache-2.0",
        legalConclusion: false,
        useSpecificTrainingClearance: false,
      },
      transportAttested: false,
      remoteObjects: remoteObjects.sort((left, right) => left.path.localeCompare(right.path)),
    };
    const manifest = { ...manifestBody,
      manifestHash: digest(`${SO101_COFFEE_SOURCE_MANIFEST_SCHEMA}/manifest`, manifestBody) };
    const manifestPath = path.join(temporary, "acquisition-manifest.json");
    writeFileSync(manifestPath, canonicalBytes(manifest), { flag: "wx", mode: 0o600 });
    chmodSync(manifestPath, 0o600);
    renameSync(temporary, target);
    return { sourceDirectory: target, manifest,
      manifestFileSha256: so101CoffeeSha256Bytes(readFileSync(
        path.join(target, "acquisition-manifest.json"))) };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function recursiveSourceEntries(root, relative = "") {
  const directory = path.join(root, relative);
  const files = [];
  const directories = [relative];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail("SOURCE_SYMLINK", child);
    if (entry.isDirectory()) {
      const nested = recursiveSourceEntries(root, child);
      files.push(...nested.files);
      directories.push(...nested.directories);
    } else if (entry.isFile()) files.push(child);
    else fail("SOURCE_SPECIAL_FILE", child);
  }
  return { files: files.sort(), directories: directories.sort() };
}

function stableReadFile(target, expectedBytes, requirePrivateMode = true) {
  const initial = lstatSync(target, { bigint: true });
  if (!initial.isFile() || initial.isSymbolicLink()
    || initial.size !== BigInt(expectedBytes)) fail("SOURCE_FILE_UNSAFE", target);
  if (requirePrivateMode && (Number(initial.mode) & 0o777) !== 0o600) {
    fail("SOURCE_FILE_MODE_INVALID", target);
  }
  const descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const finalPath = lstatSync(target, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || before.dev !== finalPath.dev || before.ino !== finalPath.ino
      || before.size !== finalPath.size || before.mtimeNs !== finalPath.mtimeNs
      || before.ctimeNs !== finalPath.ctimeNs || bytes.length !== expectedBytes) {
      fail("SOURCE_FILE_CHANGED", target);
    }
    return bytes;
  } finally { closeSync(descriptor); }
}

function readJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function assertPrivateSourceDirectories(root, directories) {
  for (const relative of directories) {
    const target = relative === "" ? root : path.join(root, relative);
    const observed = lstatSync(target);
    if (!observed.isDirectory() || observed.isSymbolicLink()) {
      fail("SOURCE_DIRECTORY_UNSAFE", relative);
    }
    if ((observed.mode & 0o777) !== 0o700) fail("SOURCE_DIRECTORY_MODE_INVALID", relative);
  }
}

function validateManifestShape(manifest) {
  if (!exactObject(manifest) || manifest.schema !== SO101_COFFEE_SOURCE_MANIFEST_SCHEMA
    || manifest.capturedAt !== SO101_COFFEE_FROZEN_AT
    || manifest.datasetId !== SO101_COFFEE_DATASET_ID
    || manifest.pinnedRevision !== SO101_COFFEE_REVISION
    || manifest.stableDuringAcquisition !== true
    || manifest.transportAttested !== false || !HASH.test(manifest.manifestHash ?? "")
    || !Array.isArray(manifest.remoteObjects)
    || manifest.remoteObjects.length !== EXPECTED_SELECTED_FILES) {
    fail("SOURCE_MANIFEST_INVALID");
  }
  const { manifestHash, ...body } = manifest;
  if (manifestHash !== digest(`${SO101_COFFEE_SOURCE_MANIFEST_SCHEMA}/manifest`, body)) {
    fail("SOURCE_MANIFEST_HASH_INVALID");
  }
  for (const side of ["Before", "After"]) {
    const tree = manifest[`tree${side}`];
    if (!exactObject(tree) || tree.pagesFetched !== EXPECTED_TREE_PAGES
      || tree.entryCount !== EXPECTED_TREE_ENTRIES || tree.fileCount !== EXPECTED_TREE_FILES
      || tree.snapshotHash !== EXPECTED_TREE_HASH || !Array.isArray(tree.entries)) {
      fail("SOURCE_TREE_BRACKET_INVALID", side);
    }
    const projection = treeProjection(tree.entries);
    if (projection.length !== EXPECTED_TREE_ENTRIES
      || digest(TREE_SNAPSHOT_DOMAIN, projection) !== EXPECTED_TREE_HASH
      || !equalCanonical(projection, tree.entries)) fail("SOURCE_TREE_REPLAY_INVALID", side);
  }
  if (!equalCanonical(manifest.treeBefore, manifest.treeAfter)) {
    fail("SOURCE_TREE_NOT_STABLE");
  }
  if (!equalCanonical(manifest.repositoryBefore, manifest.repositoryAfter)) {
    fail("SOURCE_REPOSITORY_NOT_STABLE");
  }
  for (const repository of [manifest.repositoryBefore, manifest.repositoryAfter]) {
    repositoryProjection({ id: repository.datasetId, sha: repository.revision,
      private: repository.private, gated: repository.gated, disabled: repository.disabled,
      lastModified: repository.lastModified,
      cardData: { license: repository.hfCardLicenseClaim } });
  }
  const selection = selectPinnedSo101CoffeeEntries(manifest.treeBefore.entries);
  if (manifest.selection?.selectedCount !== EXPECTED_SELECTED_FILES
    || manifest.selection?.selectedBytes !== EXPECTED_SELECTED_BYTES
    || manifest.selection?.videoFetched !== false
    || manifest.selection?.perRunDuplicateLerobotFetched !== false
    || manifest.selection?.rawTarFetched !== false
    || !equalCanonical(manifest.selection.exclusions, selection.exclusions)
    || manifest.rightsClaims?.hfCardLicenseClaim !== "Apache-2.0"
    || manifest.rightsClaims?.bytePinnedReadmeLicenseClaim !== "Apache-2.0"
    || manifest.rightsClaims?.legalConclusion !== false
    || manifest.rightsClaims?.useSpecificTrainingClearance !== false) {
    fail("SOURCE_SELECTION_OR_RIGHTS_INVALID");
  }
  const observedObjects = manifest.remoteObjects.map((entry) => ({
    path: entry.path, sizeBytes: entry.sizeBytes, gitOid: entry.gitOid,
    lfsSha256: entry.lfsSha256, lfsPointerSize: entry.lfsPointerSize,
    contentSha256: entry.contentSha256,
  })).sort((left, right) => left.path.localeCompare(right.path));
  if (!equalCanonical(observedObjects, CANONICAL_OBJECTS)) {
    fail("SOURCE_REMOTE_OBJECT_PROFILE_INVALID");
  }
  return manifest;
}

export function verifySo101CoffeeSourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail("SOURCE_DIRECTORY_UNSAFE");
  const observed = recursiveSourceEntries(root);
  assertPrivateSourceDirectories(root, observed.directories);
  const expectedFiles = [...CANONICAL_PATHS, "acquisition-manifest.json"].sort();
  if (!equalCanonical(observed.files, expectedFiles)) fail("SOURCE_FILE_SET_INVALID");
  const manifestPath = path.join(root, "acquisition-manifest.json");
  const manifestBytesCount = statSync(manifestPath).size;
  if (!Number.isSafeInteger(manifestBytesCount) || manifestBytesCount < 1
    || manifestBytesCount > MAX_SOURCE_MANIFEST_BYTES) fail("SOURCE_MANIFEST_SIZE_INVALID");
  const manifestBytes = stableReadFile(manifestPath, manifestBytesCount);
  const manifest = validateManifestShape(readJson(manifestBytes, "SOURCE_MANIFEST_JSON_INVALID"));
  const verifiedObjects = [];
  for (const expected of CANONICAL_OBJECTS) {
    const bytes = stableReadFile(safeTarget(root, expected.path), expected.sizeBytes);
    checkRemoteBytes(expected, bytes);
    verifiedObjects.push({ path: expected.path, sizeBytes: bytes.length,
      contentSha256: so101CoffeeSha256Bytes(bytes) });
  }
  const readme = readFileSync(path.join(root, "README.md"), "utf8");
  if (!/(^|\n)license:\s*apache-2\.0\s*($|\n)/iu.test(readme)) {
    fail("README_LICENSE_CLAIM_MISSING");
  }
  return {
    ok: true,
    sourceDirectory: root,
    manifest,
    manifestFileSha256: so101CoffeeSha256Bytes(manifestBytes),
    verifiedObjectCount: verifiedObjects.length,
    verifiedBytes: verifiedObjects.reduce((sum, item) => sum + item.sizeBytes, 0),
  };
}

const PYARROW_EXTRACTOR = String.raw`
import json, math, sys
import pyarrow.parquet as pq

data_path, episodes_path, tasks_path = sys.argv[1:4]
data = pq.read_table(data_path)
expected_data_columns = ["action", "observation.state", "timestamp", "frame_index",
                         "episode_index", "index", "task_index"]
if data.column_names != expected_data_columns or data.num_rows != 38718:
    raise ValueError("DATA_SHAPE")
rows = data.to_pylist()
episodes = []
cursor = 0
for episode_index in range(184):
    start = cursor
    task_index = None
    while cursor < len(rows) and rows[cursor]["episode_index"] == episode_index:
        row = rows[cursor]
        frame = cursor - start
        if row["index"] != cursor or row["frame_index"] != frame:
            raise ValueError("FRAME_SEQUENCE")
        if not isinstance(row["timestamp"], (int, float)) or not math.isfinite(row["timestamp"]):
            raise ValueError("TIMESTAMP")
        if frame == 0 and abs(float(row["timestamp"])) > 1e-6:
            raise ValueError("TIMESTAMP_START")
        if not isinstance(row["action"], list) or len(row["action"]) != 6:
            raise ValueError("ACTION_WIDTH")
        if not isinstance(row["observation.state"], list) or len(row["observation.state"]) != 6:
            raise ValueError("STATE_WIDTH")
        if not all(isinstance(value, (int, float)) and math.isfinite(value)
                   for value in row["action"] + row["observation.state"]):
            raise ValueError("NONFINITE_TELEMETRY")
        if task_index is None:
            task_index = row["task_index"]
        elif task_index != row["task_index"]:
            raise ValueError("TASK_INDEX_CHANGED")
        cursor += 1
    if cursor == start:
        raise ValueError("EPISODE_MISSING")
    episodes.append({"episodeIndex": episode_index, "frames": cursor - start,
                     "taskIndex": task_index, "fromIndex": start, "toIndex": cursor})
if cursor != len(rows):
    raise ValueError("EXTRA_ROWS")

meta = pq.read_table(episodes_path,
    columns=["episode_index", "tasks", "length", "data/chunk_index", "data/file_index",
             "dataset_from_index", "dataset_to_index"])
if meta.num_rows != 184:
    raise ValueError("META_ROWS")
meta_rows = meta.to_pylist()
for index, row in enumerate(meta_rows):
    expected = episodes[index]
    if row["episode_index"] != index or row["length"] != expected["frames"]:
        raise ValueError("META_EPISODE")
    if row["data/chunk_index"] != 0 or row["data/file_index"] != 0:
        raise ValueError("META_DATA_FILE")
    if row["dataset_from_index"] != expected["fromIndex"] or row["dataset_to_index"] != expected["toIndex"]:
        raise ValueError("META_RANGE")
    if not isinstance(row["tasks"], list) or len(row["tasks"]) != 1 or not isinstance(row["tasks"][0], str):
        raise ValueError("META_TASK")
    expected["task"] = row["tasks"][0]

tasks_table = pq.read_table(tasks_path)
if tasks_table.column_names != ["task_index", "task"] or tasks_table.num_rows != 8:
    raise ValueError("TASKS_SHAPE")
tasks = tasks_table.to_pylist()
if [row["task_index"] for row in tasks] != list(range(8)) or any(not isinstance(row["task"], str) for row in tasks):
    raise ValueError("TASKS_CONTENT")
for episode in episodes:
    if episode["taskIndex"] < 0 or episode["taskIndex"] >= len(tasks):
        raise ValueError("TASK_INDEX_RANGE")
    if tasks[episode["taskIndex"]]["task"] != episode["task"]:
        raise ValueError("TASK_TEXT_BINDING")

print(json.dumps({"dataRows": len(rows), "episodeCount": len(episodes),
                  "actionWidth": 6, "stateWidth": 6,
                  "episodes": episodes, "tasks": tasks}, ensure_ascii=False,
                 separators=(",", ":")))
`;

export function extractSo101CoffeeCensus(sourceDirectory, options = {}) {
  const checked = verifySo101CoffeeSourceDirectory(sourceDirectory);
  const pythonExecutable = options.pythonExecutable ?? ".venv/bin/python";
  const args = ["-c", PYARROW_EXTRACTOR,
    path.join(checked.sourceDirectory, "data/chunk-000/file-000.parquet"),
    path.join(checked.sourceDirectory, "meta/episodes/chunk-000/file-000.parquet"),
    path.join(checked.sourceDirectory, "meta/tasks.parquet")];
  const result = spawnSync(pythonExecutable, args, {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 120_000,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONNOUSERSITE: "1" },
  });
  if (result.status !== 0 || result.signal != null) {
    fail("PYARROW_EXTRACTION_FAILED", String(result.stderr ?? "").trim().slice(0, 500));
  }
  const parquet = readJson(Buffer.from(result.stdout), "PYARROW_OUTPUT_INVALID");
  return buildReplayFromPinnedSource(checked, parquet);
}

function readPinnedObject(root, remotePath) {
  const expected = CANONICAL_OBJECTS.find((entry) => entry.path === remotePath);
  if (!expected) fail("PINNED_OBJECT_UNKNOWN", remotePath);
  return stableReadFile(safeTarget(root, remotePath), expected.sizeBytes);
}

function parseCsv(text) {
  if (typeof text !== "string" || text.includes("\0")) fail("LABEL_CSV_INVALID");
  const rows = [];
  let row = [];
  let field = "";
  let index = 0;
  let quoted = false;
  let justClosedQuote = false;
  while (index < text.length) {
    const character = text[index];
    if (quoted) {
      if (character === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 2;
          continue;
        }
        quoted = false;
        justClosedQuote = true;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }
    if (justClosedQuote && character !== "," && character !== "\r" && character !== "\n") {
      fail("LABEL_CSV_TRAILING_QUOTE_DATA");
    }
    if (character === "\"" && field.length === 0 && !justClosedQuote) {
      quoted = true;
      index += 1;
      continue;
    }
    if (character === ",") {
      row.push(field);
      field = "";
      justClosedQuote = false;
      index += 1;
      continue;
    }
    if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      justClosedQuote = false;
      index += 1;
      continue;
    }
    if (justClosedQuote || character === "\"") fail("LABEL_CSV_QUOTE_INVALID");
    field += character;
    index += 1;
  }
  if (quoted) fail("LABEL_CSV_UNTERMINATED_QUOTE");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length > 0 && rows.at(-1).length === 1 && rows.at(-1)[0] === "") rows.pop();
  return rows;
}

function parsePublisherLabels(bytes) {
  const rows = parseCsv(bytes.toString("utf8"));
  const header = ["episode_index", "run", "source_episode", "cycle", "step_index",
    "instruction", "outcome", "memo"];
  if (rows.length !== 185 || !equalCanonical(rows[0], header)) fail("LABEL_CSV_SHAPE_INVALID");
  const labels = rows.slice(1).map((values, rowIndex) => {
    if (values.length !== header.length) fail("LABEL_CSV_ROW_WIDTH", rowIndex);
    const record = Object.fromEntries(header.map((key, index) => [key, values[index]]));
    const integer = (value, name, minimum = 0) => {
      if (!/^(0|[1-9][0-9]*)$/u.test(value)) fail("LABEL_CSV_INTEGER", name);
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < minimum) fail("LABEL_CSV_INTEGER", name);
      return parsed;
    };
    const episodeIndex = integer(record.episode_index, "episode_index");
    const sourceEpisode = integer(record.source_episode, "source_episode");
    const cycle = integer(record.cycle, "cycle", 1);
    const stepIndex = integer(record.step_index, "step_index", 1);
    if (episodeIndex !== rowIndex || !RUN_NAME.test(record.run)
      || stepIndex > 12 || typeof record.instruction !== "string"
      || record.instruction.length < 1 || !["success", "fail", "unstable"].includes(record.outcome)) {
      fail("LABEL_CSV_RECORD_INVALID", rowIndex);
    }
    return { episodeIndex, runName: record.run, sourceEpisode, cycle, stepIndex,
      instruction: record.instruction, outcome: record.outcome,
      memoPresent: record.memo.length > 0 };
  });
  const keys = labels.map((label) => `${label.runName}:${label.sourceEpisode}`);
  if (new Set(keys).size !== labels.length) fail("LABEL_CSV_DUPLICATE_SOURCE_EPISODE");
  const outcomes = labels.reduce((counts, label) => {
    counts[label.outcome] += 1;
    return counts;
  }, { success: 0, fail: 0, unstable: 0 });
  if (!equalCanonical(outcomes, { success: 149, fail: 31, unstable: 4 })) {
    fail("LABEL_OUTCOME_TOTAL_INVALID");
  }
  return { labels, outcomes, bySource: new Map(labels.map((label) => [
    `${label.runName}:${label.sourceEpisode}`, label,
  ])) };
}

const EXPECTED_EVENT_COUNTS = Object.freeze({
  bulk_label: 2,
  episode_end: 200,
  episode_update: 226,
  finalize_done: 15,
  finalize_error: 1,
  finalize_start: 16,
  memo: 1,
  merged_from: 1,
  run_resume: 1,
  run_start: 16,
  run_stop: 16,
  task_end_button: 92,
  task_start: 200,
});

function integerField(value, minimum, code) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(code);
  return value;
}

function parseRunLog(bytes, expectedRunIndex) {
  const run = readJson(bytes, "RUN_LOG_JSON_INVALID");
  const expectedRunName = `coffee_new${String(expectedRunIndex).padStart(2, "0")}`;
  if (!exactObject(run) || run.run_name !== expectedRunName
    || run.model !== "aailabkaist/pi05_coffee_NorRec_RW_10k"
    || run.exec_mode !== "async" || run.mock !== false
    || !Array.isArray(run.tasks) || run.tasks.length !== 12
    || run.tasks.some((task) => typeof task !== "string" || task.length < 1)
    || !Array.isArray(run.events) || !Array.isArray(run.episodes)) {
    fail("RUN_LOG_SHAPE_INVALID", expectedRunName);
  }
  const eventCounts = {};
  const eventAttempts = [];
  let session = -1;
  let pending = null;
  for (let eventIndex = 0; eventIndex < run.events.length; eventIndex += 1) {
    const event = run.events[eventIndex];
    if (!exactObject(event) || typeof event.type !== "string"
      || typeof event.ts !== "number" || !Number.isFinite(event.ts)) {
      fail("RUN_EVENT_INVALID", `${expectedRunName}:${eventIndex}`);
    }
    eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    if (event.type === "run_start") {
      if (pending !== null) fail("RUN_SESSION_STARTED_WITH_PENDING_ATTEMPT");
      session += 1;
    } else if (event.type === "task_start") {
      if (session < 0 || pending !== null) fail("TASK_START_SEQUENCE_INVALID");
      const taskIndex = integerField(event.task_index, 1, "TASK_START_INDEX_INVALID");
      const cycle = integerField(event.cycle, 1, "TASK_START_CYCLE_INVALID");
      if (taskIndex > run.tasks.length || event.task !== run.tasks[taskIndex - 1]) {
        fail("TASK_START_TEXT_INVALID");
      }
      pending = { session, taskIndex, cycle, task: event.task, eventIndex };
    } else if (event.type === "episode_end") {
      if (pending === null) fail("EPISODE_END_WITHOUT_TASK_START");
      const sourceEpisode = integerField(event.episode, 0, "EPISODE_ID_INVALID");
      // Aborted/deleted census records can have zero run-log frames. They never
      // become kept episodes or action traces below.
      const frames = integerField(event.n_frames, 0, "EPISODE_FRAMES_INVALID");
      if (event.task_index !== pending.taskIndex || event.cycle !== pending.cycle) {
        fail("EPISODE_TASK_START_MISMATCH");
      }
      eventAttempts.push({ session, rawSourceEpisode: sourceEpisode,
        cycle: pending.cycle, stepIndex: pending.taskIndex, task: pending.task,
        frames, taskStartEventIndex: pending.eventIndex, episodeEndEventIndex: eventIndex });
      pending = null;
    } else if (!Object.hasOwn(EXPECTED_EVENT_COUNTS, event.type)) {
      fail("RUN_EVENT_TYPE_UNKNOWN", event.type);
    }
  }
  if (pending !== null || session < 0) fail("RUN_EVENT_SEQUENCE_INCOMPLETE");
  const merged = run.events.filter((event) => event.type === "merged_from");
  if ((session === 0 && merged.length !== 0)
    || (session === 1 && (expectedRunIndex !== 4 || merged.length !== 1))
    || session > 1) fail("RUN_MERGE_SHAPE_INVALID", expectedRunName);
  const idMap = merged.length === 1 ? merged[0].id_map : null;
  for (const attempt of eventAttempts) {
    attempt.sourceEpisode = attempt.session === 0 ? attempt.rawSourceEpisode
      : idMap?.[String(attempt.rawSourceEpisode)];
    if (!Number.isSafeInteger(attempt.sourceEpisode) || attempt.sourceEpisode < 0) {
      fail("RUN_MERGE_ID_MAP_INVALID");
    }
  }
  const byId = new Map();
  for (const episode of run.episodes) {
    if (!exactObject(episode)) fail("RUN_EPISODE_INVALID");
    const id = integerField(episode.id, 0, "RUN_EPISODE_ID_INVALID");
    if (byId.has(id) || typeof episode.deleted !== "boolean"
      || ![null, "success", "fail", "unstable"].includes(episode.label)
      || integerField(episode.cycle, 1, "RUN_EPISODE_CYCLE_INVALID") < 1
      || integerField(episode.task_index, 1, "RUN_EPISODE_TASK_INVALID") > 12
      || integerField(episode.n_frames, 0, "RUN_EPISODE_FRAMES_INVALID") < 0
      || episode.task !== run.tasks[episode.task_index - 1]) {
      fail("RUN_EPISODE_INVALID", `${expectedRunName}:${id}`);
    }
    byId.set(id, episode);
  }
  if (eventAttempts.length !== run.episodes.length
    || new Set(eventAttempts.map((attempt) => attempt.sourceEpisode)).size !== eventAttempts.length) {
    fail("RUN_EVENT_EPISODE_CENSUS_MISMATCH");
  }
  for (const attempt of eventAttempts) {
    const episode = byId.get(attempt.sourceEpisode);
    if (!episode || episode.cycle !== attempt.cycle || episode.task_index !== attempt.stepIndex
      || episode.task !== attempt.task || episode.n_frames !== attempt.frames
      || attempt.taskStartEventIndex >= attempt.episodeEndEventIndex) {
      fail("RUN_EVENT_EPISODE_BINDING_INVALID");
    }
    attempt.deleted = episode.deleted;
    attempt.runLogLabel = episode.label;
  }
  return { runName: expectedRunName, runIndex: expectedRunIndex,
    eventCounts, attempts: eventAttempts, sessionCount: session + 1 };
}

function combineEventCounts(runs) {
  const combined = {};
  for (const run of runs) {
    for (const [eventType, count] of Object.entries(run.eventCounts)) {
      combined[eventType] = (combined[eventType] ?? 0) + count;
    }
  }
  const ordered = Object.fromEntries(Object.keys(combined).sort()
    .map((key) => [key, combined[key]]));
  if (!equalCanonical(ordered, EXPECTED_EVENT_COUNTS)) fail("EVENT_CENSUS_INVALID");
  return ordered;
}

function validateInfo(root) {
  const info = readJson(readPinnedObject(root, "meta/info.json"), "INFO_JSON_INVALID");
  if (info.codebase_version !== "v3.0" || info.fps !== 30
    || info.total_episodes !== 184 || info.total_frames !== 38_718
    || info.total_tasks !== 8 || info.robot_type !== "so101_follower"
    || info.features?.action?.dtype !== "float32"
    || !equalCanonical(info.features?.action?.shape, [6])
    || info.features?.["observation.state"]?.dtype !== "float32"
    || !equalCanonical(info.features?.["observation.state"]?.shape, [6])
    || info.features?.["observation.images.front"]?.dtype !== "video"
    || info.features?.["observation.images.wrist"]?.dtype !== "video") {
    fail("INFO_PROFILE_INVALID");
  }
  const stats = readJson(readPinnedObject(root, "meta/stats.json"), "STATS_JSON_INVALID");
  if (!exactObject(stats)) fail("STATS_PROFILE_INVALID");
  return { codebaseVersion: info.codebase_version, fps: info.fps,
    robotType: info.robot_type, declaredEpisodes: info.total_episodes,
    declaredFrames: info.total_frames, declaredTasks: info.total_tasks,
    declaredVideoFeatures: 2 };
}

function buildRetryProjection(attempts) {
  const byGroup = new Map();
  for (const attempt of attempts) {
    const key = `${attempt.runIndex}:${attempt.cycle}:${attempt.stepIndex}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(attempt);
  }
  const groups = [...byGroup.entries()].map(([key, members]) => {
    const [runIndex, cycle, stepIndex] = key.split(":").map(Number);
    const groupId = digest(`${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/retry-group`,
      { runIndex, cycle, stepIndex });
    return { groupId, runIndex, cycle, stepIndex, attemptCount: members.length,
      attemptIds: members.map((item) => item.attemptId),
      dispositions: members.map((item) => item.disposition),
      publisherOutcomes: members.map((item) => item.publisherOutcome),
      members };
  }).sort((left, right) => left.runIndex - right.runIndex
    || left.cycle - right.cycle || left.stepIndex - right.stepIndex);
  const histogram = {};
  for (const group of groups) histogram[String(group.attemptCount)]
    = (histogram[String(group.attemptCount)] ?? 0) + 1;
  const recoveryChains = [];
  let recoveredPublisherFailAttempts = 0;
  let unrecoveredPublisherFailAttempts = 0;
  for (const group of groups) {
    for (let index = 0; index < group.members.length; index += 1) {
      if (group.members[index].publisherOutcome !== "fail") continue;
      const laterSuccess = group.members.slice(index + 1)
        .some((member) => member.publisherOutcome === "success");
      if (laterSuccess) recoveredPublisherFailAttempts += 1;
      else unrecoveredPublisherFailAttempts += 1;
    }
    const firstFail = group.members.findIndex((member, index) =>
      member.publisherOutcome === "fail"
      && group.members.slice(index + 1).some((later) => later.publisherOutcome === "success"));
    if (firstFail < 0) continue;
    const firstSuccess = group.members.findIndex((member, index) =>
      index > firstFail && member.publisherOutcome === "success");
    const span = group.members.slice(firstFail, firstSuccess + 1);
    recoveryChains.push({
      chainId: digest(`${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/recovery-chain`,
        { groupId: group.groupId, firstFail, firstSuccess }),
      groupId: group.groupId,
      runIndex: group.runIndex,
      cycle: group.cycle,
      stepIndex: group.stepIndex,
      attemptIds: span.map((member) => member.attemptId),
      dispositions: span.map((member) => member.disposition),
      publisherOutcomes: span.map((member) => member.publisherOutcome),
      interveningDeletedAttemptCount: span.slice(1, -1)
        .filter((member) => member.disposition === "DELETED_METADATA_ONLY").length,
    });
  }
  const publicGroups = groups.map(({ members, ...group }) => group);
  const retryGroups = publicGroups.filter((group) => group.attemptCount > 1);
  const summary = {
    groupCount: groups.length,
    singleAttemptGroups: groups.filter((group) => group.attemptCount === 1).length,
    retryGroups: retryGroups.length,
    attemptCountHistogram: histogram,
    publisherFailToEventualSuccessChains: recoveryChains.length,
    recoveredPublisherFailAttempts,
    unrecoveredPublisherFailAttempts,
    chainsWithInterveningDeletedAttempts: recoveryChains
      .filter((chain) => chain.interveningDeletedAttemptCount > 0).length,
    recoveryChainAttemptSpanCount: recoveryChains
      .reduce((sum, chain) => sum + chain.attemptIds.length, 0),
  };
  const expected = {
    groupCount: 150, singleAttemptGroups: 120, retryGroups: 30,
    attemptCountHistogram: { 1: 120, 2: 17, 3: 8, 4: 4, 6: 1 },
    publisherFailToEventualSuccessChains: 21, recoveredPublisherFailAttempts: 30,
    unrecoveredPublisherFailAttempts: 1, chainsWithInterveningDeletedAttempts: 3,
    recoveryChainAttemptSpanCount: 55,
  };
  if (!equalCanonical(summary, expected)) fail("RETRY_CENSUS_INVALID");
  return { summary, allGroupsHash: digest(
    `${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/all-retry-groups`, publicGroups),
  retryGroups, recoveryChains };
}

function buildReplayFromPinnedSource(checked, parquet) {
  if (!exactObject(parquet) || parquet.dataRows !== 38_718 || parquet.episodeCount !== 184
    || parquet.actionWidth !== 6 || parquet.stateWidth !== 6
    || !Array.isArray(parquet.episodes) || parquet.episodes.length !== 184
    || !Array.isArray(parquet.tasks) || parquet.tasks.length !== 8) {
    fail("PARQUET_REPLAY_INVALID");
  }
  const root = checked.sourceDirectory;
  const info = validateInfo(root);
  const publisher = parsePublisherLabels(readPinnedObject(root, "episode_labels.csv"));
  const runs = Array.from({ length: 15 }, (_, offset) => {
    const runIndex = offset + 1;
    return parseRunLog(readPinnedObject(root,
      `runs/coffee_new${String(runIndex).padStart(2, "0")}/run_meta.json`), runIndex);
  });
  const eventCounts = combineEventCounts(runs);
  const allRunAttempts = runs.flatMap((run) => run.attempts.map((attempt) => ({ ...attempt,
    runName: run.runName, runIndex: run.runIndex })));
  if (allRunAttempts.length !== 200) fail("ATTEMPT_CENSUS_INVALID");
  const runLogOutcomes = { success: 0, fail: 0, unstable: 0 };
  let runLogPublisherCorrections = 0;
  const attempts = allRunAttempts.map((attempt, ordinal) => {
    const label = publisher.bySource.get(`${attempt.runName}:${attempt.sourceEpisode}`) ?? null;
    if (attempt.deleted !== (label === null)) fail("DELETED_LABEL_MEMBERSHIP_INVALID");
    const taskFingerprint = digest(`${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/task-text`,
      attempt.task);
    const attemptId = digest(`${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/attempt`,
      { runIndex: attempt.runIndex, attemptIndexInRun: runs[attempt.runIndex - 1]
        .attempts.indexOf(attempt) });
    if (label === null) {
      return { attemptId, ordinal, runIndex: attempt.runIndex,
        attemptIndexInRun: runs[attempt.runIndex - 1].attempts.indexOf(attempt),
        cycle: attempt.cycle, stepIndex: attempt.stepIndex,
        sourceEpisode: attempt.sourceEpisode, taskFingerprint,
        opportunityRecordPresent: true, disposition: "DELETED_METADATA_ONLY",
        keptEpisodeIndex: null, sourceRunLogFrameCount: attempt.frames,
        actionTraceAdmitted: false, admittedActionFrameCount: null,
        proprioceptiveTelemetryAdmitted: false, publisherOutcome: null };
    }
    if (attempt.frames < 1 || label.cycle !== attempt.cycle || label.stepIndex !== attempt.stepIndex
      || label.instruction !== attempt.task) fail("LABEL_RUN_ATTEMPT_BINDING_INVALID");
    if (attempt.runLogLabel !== null) {
      runLogOutcomes[attempt.runLogLabel] += 1;
      if (attempt.runLogLabel !== label.outcome) runLogPublisherCorrections += 1;
    }
    const episode = parquet.episodes[label.episodeIndex];
    if (!episode || episode.episodeIndex !== label.episodeIndex
      || episode.frames !== attempt.frames || episode.task !== attempt.task
      || parquet.tasks[episode.taskIndex]?.task !== attempt.task) {
      fail("KEPT_EPISODE_PARQUET_BINDING_INVALID");
    }
    return { attemptId, ordinal, runIndex: attempt.runIndex,
      attemptIndexInRun: runs[attempt.runIndex - 1].attempts.indexOf(attempt),
      cycle: attempt.cycle, stepIndex: attempt.stepIndex,
      sourceEpisode: attempt.sourceEpisode, taskFingerprint,
      opportunityRecordPresent: true, disposition: "KEPT_REAL_ROBOT_EPISODE",
      keptEpisodeIndex: label.episodeIndex, sourceRunLogFrameCount: attempt.frames,
      actionTraceAdmitted: true, admittedActionFrameCount: episode.frames,
      proprioceptiveTelemetryAdmitted: true, publisherOutcome: label.outcome };
  });
  // Array#indexOf above sees cloned attempts after flatMap. Recompute local indices deterministically.
  const perRunCursor = new Map();
  for (const attempt of attempts) {
    const next = perRunCursor.get(attempt.runIndex) ?? 0;
    attempt.attemptIndexInRun = next;
    attempt.attemptId = digest(`${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/attempt`,
      { runIndex: attempt.runIndex, attemptIndexInRun: next });
    perRunCursor.set(attempt.runIndex, next + 1);
  }
  const kept = attempts.filter((attempt) => attempt.disposition === "KEPT_REAL_ROBOT_EPISODE");
  const deleted = attempts.filter((attempt) => attempt.disposition === "DELETED_METADATA_ONLY");
  if (kept.length !== 184 || deleted.length !== 16
    || new Set(kept.map((attempt) => attempt.keptEpisodeIndex)).size !== 184
    || attempts.some((attempt) => attempt.opportunityRecordPresent !== true)
    || !equalCanonical(runLogOutcomes, { success: 151, fail: 29, unstable: 4 })
    || runLogPublisherCorrections !== 2) fail("ATTEMPT_POPULATION_BINDING_INVALID");
  const retry = buildRetryProjection(attempts);
  const taskFingerprints = parquet.tasks.map((task) => ({ taskIndex: task.task_index,
    taskFingerprint: digest(`${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/task-text`, task.task) }));
  return {
    source: checked,
    info,
    eventCounts,
    attempts,
    attemptsHash: digest(`${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/attempts`, attempts),
    taskFingerprints,
    taskFingerprintsHash: digest(`${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/tasks`,
      taskFingerprints),
    publisherOutcomes: publisher.outcomes,
    runLogOutcomes,
    runLogPublisherCorrections,
    memoBearingPublisherLabels: publisher.labels.filter((label) => label.memoPresent).length,
    retry,
    frames: parquet.dataRows,
  };
}

function buildReportFromReplay(replay) {
  const body = {
    schema: SO101_COFFEE_RECOVERY_CENSUS_SCHEMA,
    createdAt: SO101_COFFEE_FROZEN_AT,
    dataset: {
      datasetId: SO101_COFFEE_DATASET_ID,
      pinnedRevision: SO101_COFFEE_REVISION,
      robotType: replay.info.robotType,
      codebaseVersion: replay.info.codebaseVersion,
      framesPerSecond: replay.info.fps,
      sourceManifestHash: replay.source.manifest.manifestHash,
      hfCardLicenseClaim: "Apache-2.0",
    },
    sourceReplay: {
      verificationLevel: "FULL_BYTE_AND_SOURCE_REPLAY",
      fullSourceReplayRequired: true,
      fullSourceReplayPerformed: true,
      selectedObjects: EXPECTED_SELECTED_FILES,
      selectedBytes: EXPECTED_SELECTED_BYTES,
      treeBracketPagesPerSide: EXPECTED_TREE_PAGES,
      treeBracketEntriesPerSide: EXPECTED_TREE_ENTRIES,
      treeBracketFilesPerSide: EXPECTED_TREE_FILES,
      treeSnapshotHashBefore: EXPECTED_TREE_HASH,
      treeSnapshotHashAfter: EXPECTED_TREE_HASH,
      revisionStableDuringAcquisition: true,
      transportAttested: false,
      publisherAnalysisDocumentFetched: true,
      publisherAnalysisClaimsUsedForCounts: false,
      videoBytesFetched: false,
      perRunDuplicateLerobotBytesFetched: false,
      rawTarBytesFetched: false,
    },
    declaredScope: {
      pinnedRepositoryRevisionObserved: true,
      selectedTwentyThreeObjectClosureExhausted: true,
      fifteenRunLogAttemptScopeExhausted: true,
      rootMergedKeptEpisodeScopeExhausted: true,
      externalDiscoveryPerformed: false,
      sourceRepositoryUniverseExhausted: false,
      globalExhaustion: false,
    },
    rightsAndUseClearance: {
      hfCardLicenseClaim: "Apache-2.0",
      bytePinnedReadmeLicenseClaim: "Apache-2.0",
      licenseClaimAgreementObserved: true,
      legalConclusion: false,
      privacyClearanceAdjudicated: false,
      revisionSpecificUseClearanceAdjudicated: false,
      productionUseClearanceAdjudicated: false,
      authorizedTrainingClearanceAdjudicated: false,
      artifactUseBoundary: "OFFLINE_EVALUATION_AND_RESEARCH_ONLY",
    },
    denominatorRegistry: {
      populations: [
        { denominatorClass: "KEPT_REAL_ROBOT_EPISODE", units: 184,
          sourceComponent: "ROOT_MERGED_ACTION_AND_PROPRIOCEPTIVE_EPISODES" },
        { denominatorClass: "ATTEMPT_CENSUS_RECORD", units: 200,
          sourceComponent: "FIFTEEN_PROSPECTIVE_RUN_LOGS" },
      ],
      crossPopulationTotal: null,
      crossPopulationAdditionProhibited: true,
      deletedMetadataOnlyAttemptsAreEpisodes: false,
    },
    census: {
      attemptCensusRecords: 200,
      keptRealRobotEpisodes: 184,
      deletedAbortedMetadataOnlyAttempts: 16,
      sourceRunLogs: 15,
      taskStartOpportunityRecords: 200,
      keptTaskStartBindings: 184,
      deletedTaskStartMetadataBindings: 16,
      actionTraceEpisodes: 184,
      actionTraceFrames: replay.frames,
      eventTypeCounts: replay.eventCounts,
    },
    publisherOutcomeClaims: {
      source: "BYTE_PINNED_EPISODE_LABEL_CSV",
      keptEpisodeClaims: 184,
      success: replay.publisherOutcomes.success,
      fail: replay.publisherOutcomes.fail,
      unstable: replay.publisherOutcomes.unstable,
      runLogFinalLabelClaims: replay.runLogOutcomes,
      runLogToPublisherLabelCorrections: replay.runLogPublisherCorrections,
      independentOutcomeVerification: false,
      independentOutcomeVerifiedEpisodes: 0,
    },
    attemptLedger: {
      records: replay.attempts,
      recordsHash: replay.attemptsHash,
      taskFingerprints: replay.taskFingerprints,
      taskFingerprintsHash: replay.taskFingerprintsHash,
      rawTaskTextProjected: false,
      rawMemoTextProjected: false,
    },
    retryAndRecovery: {
      definition: "SAME_RUN_SAME_CYCLE_SAME_STEP_ORDERED_ATTEMPTS",
      counts: replay.retry.summary,
      allGroupsHash: replay.retry.allGroupsHash,
      retryGroups: replay.retry.retryGroups,
      publisherFailToEventualSuccessChains: replay.retry.recoveryChains,
      sourceNativePublisherClaimsOnly: true,
      independentRecoveryVerification: false,
      independentlyVerifiedRecoveryChains: 0,
    },
    segmentCoverageAttribution: {
      additiveAcrossSegments: false,
      completeIndependentEpisodeIntersection: 0,
      opportunityCensus: {
        denominatorClass: "ATTEMPT_CENSUS_RECORD", records: 200,
        prospectiveTaskStartPresent: 200,
      },
      delegationAuthorization: {
        denominatorClass: "ATTEMPT_CENSUS_RECORD", delegatedRecords: 0,
        authorizedRecords: 0,
      },
      action: {
        denominatorClass: "KEPT_REAL_ROBOT_EPISODE", sourceNativeActionTraces: 184,
        independentlyWitnessedActionTraces: 0,
      },
      effect: {
        denominatorClass: "KEPT_REAL_ROBOT_EPISODE", independentPhysicalEffects: 0,
        independentObjectStateEffects: 0,
      },
      outcome: {
        denominatorClass: "KEPT_REAL_ROBOT_EPISODE", publisherOutcomeClaims: 184,
        independentOutcomes: 0,
      },
      recovery: {
        denominatorClass: "ATTEMPT_CENSUS_RECORD", publisherRetryChains: 21,
        independentlyVerifiedRecoveryChains: 0,
      },
      longitudinal: {
        denominatorClass: "KEPT_REAL_ROBOT_EPISODE", independentlyTrackedEpisodes: 0,
      },
    },
    telemetryBoundary: {
      sourceNativeActionTraceEpisodes: 184,
      sourceNativeProprioceptiveStateEpisodes: 184,
      actionDimensions: 6,
      proprioceptiveStateDimensions: 6,
      telemetryFrames: replay.frames,
      deletedMetadataOnlyActionTraceEpisodes: 0,
      videoFeaturesDeclaredInMetadata: replay.info.declaredVideoFeatures,
      videoFilesFetched: 0,
      videoFramesDecoded: 0,
      independentCameraWitnessEpisodes: 0,
      independentObjectStateEpisodes: 0,
      independentPhysicalEffectEpisodes: 0,
      independentOutcomeEpisodes: 0,
      longitudinalEpisodes: 0,
    },
    privacyAndProjection: {
      rawSourceTextProjectedRecords: 0,
      rawInstructionTextProjectedRecords: 0,
      rawMemoTextProjectedRecords: 0,
      rawPublisherAnalysisTextProjectedRecords: 0,
      videoProjectedFiles: 0,
      videoProjectedFrames: 0,
      networkProjectionRows: 0,
      trainingProjectionRows: 0,
    },
    modelAndTrainingBoundary: {
      offlineEvaluationPerformed: true,
      offlineResearchCensusBuilt: true,
      offlineModelFittingPerformed: false,
      offlineModelFittingRows: 0,
      authorizedTraining: false,
      authorizedTrainingRows: 0,
      authorizedTrainingJobs: 0,
      authorizedTrainingPerformed: false,
      automaticTraining: false,
      policyOptimizationPerformed: false,
      modelWeightsProduced: false,
    },
    authorityBoundary: {
      delegationRecords: 0,
      authorityRecords: 0,
      authorizedActionRecords: 0,
      actionsDispatched: 0,
      actionsExecutedByThisArtifact: 0,
      CEURecords: 0,
      creditUnitsMinted: 0,
      outcomeTruthEstablished: 0,
      authorityDelta: 0,
      executable: false,
    },
    limitations: {
      publisherLabelsAreIndependentTruth: false,
      proprioceptionAloneEstablishesPhysicalEffect: false,
      actionTracePresenceEstablishesAuthorization: false,
      taskStartPresenceEstablishesDelegation: false,
      deletedRunLogAttemptMetadataEstablishesEpisode: false,
      crossDomainAggregationAllowed: false,
    },
  };
  return { ...body,
    artifactHash: digest(`${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/artifact`, body) };
}

export function buildSo101CoffeeRecoveryCensusFromSource(sourceDirectory, options = {}) {
  return buildReportFromReplay(extractSo101CoffeeCensus(sourceDirectory, options));
}

function addError(errors, condition, code) {
  if (!condition) errors.push(code);
}

export function verifySo101CoffeeRecoveryCensusReport(report) {
  const errors = [];
  try {
    addError(errors, exactObject(report), "REPORT_NOT_OBJECT");
    if (!exactObject(report)) return { ok: false, errors };
    const { artifactHash, ...body } = report;
    addError(errors, report.schema === SO101_COFFEE_RECOVERY_CENSUS_SCHEMA, "SCHEMA");
    addError(errors, report.createdAt === SO101_COFFEE_FROZEN_AT, "CREATED_AT");
    addError(errors, HASH.test(artifactHash ?? "")
      && artifactHash === digest(`${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/artifact`, body),
    "ARTIFACT_HASH");
    addError(errors, report.dataset?.datasetId === SO101_COFFEE_DATASET_ID
      && report.dataset?.pinnedRevision === SO101_COFFEE_REVISION
      && report.dataset?.hfCardLicenseClaim === "Apache-2.0"
      && HASH.test(report.dataset?.sourceManifestHash ?? ""), "DATASET_BINDING");
    addError(errors, report.sourceReplay?.verificationLevel === "FULL_BYTE_AND_SOURCE_REPLAY"
      && report.sourceReplay?.fullSourceReplayRequired === true
      && report.sourceReplay?.fullSourceReplayPerformed === true
      && report.sourceReplay?.selectedObjects === 23
      && report.sourceReplay?.selectedBytes === EXPECTED_SELECTED_BYTES
      && report.sourceReplay?.treeSnapshotHashBefore === EXPECTED_TREE_HASH
      && report.sourceReplay?.treeSnapshotHashAfter === EXPECTED_TREE_HASH
      && report.sourceReplay?.revisionStableDuringAcquisition === true
      && report.sourceReplay?.transportAttested === false
      && report.sourceReplay?.publisherAnalysisClaimsUsedForCounts === false
      && report.sourceReplay?.videoBytesFetched === false
      && report.sourceReplay?.perRunDuplicateLerobotBytesFetched === false
      && report.sourceReplay?.rawTarBytesFetched === false, "SOURCE_REPLAY");
    addError(errors, report.declaredScope?.selectedTwentyThreeObjectClosureExhausted === true
      && report.declaredScope?.fifteenRunLogAttemptScopeExhausted === true
      && report.declaredScope?.rootMergedKeptEpisodeScopeExhausted === true
      && report.declaredScope?.externalDiscoveryPerformed === false
      && report.declaredScope?.sourceRepositoryUniverseExhausted === false
      && report.declaredScope?.globalExhaustion === false, "EXHAUSTION_BOUNDARY");
    addError(errors, equalCanonical(report.denominatorRegistry?.populations, [
      { denominatorClass: "KEPT_REAL_ROBOT_EPISODE", units: 184,
        sourceComponent: "ROOT_MERGED_ACTION_AND_PROPRIOCEPTIVE_EPISODES" },
      { denominatorClass: "ATTEMPT_CENSUS_RECORD", units: 200,
        sourceComponent: "FIFTEEN_PROSPECTIVE_RUN_LOGS" },
    ]) && report.denominatorRegistry?.crossPopulationTotal === null
      && report.denominatorRegistry?.crossPopulationAdditionProhibited === true
      && report.denominatorRegistry?.deletedMetadataOnlyAttemptsAreEpisodes === false,
    "DENOMINATOR_BOUNDARY");
    addError(errors, report.census?.attemptCensusRecords === 200
      && report.census?.keptRealRobotEpisodes === 184
      && report.census?.deletedAbortedMetadataOnlyAttempts === 16
      && report.census?.sourceRunLogs === 15
      && report.census?.taskStartOpportunityRecords === 200
      && report.census?.keptTaskStartBindings === 184
      && report.census?.deletedTaskStartMetadataBindings === 16
      && report.census?.actionTraceEpisodes === 184
      && report.census?.actionTraceFrames === 38_718
      && equalCanonical(report.census?.eventTypeCounts, EXPECTED_EVENT_COUNTS), "CENSUS");
    addError(errors, report.publisherOutcomeClaims?.keptEpisodeClaims === 184
      && report.publisherOutcomeClaims?.success === 149
      && report.publisherOutcomeClaims?.fail === 31
      && report.publisherOutcomeClaims?.unstable === 4
      && equalCanonical(report.publisherOutcomeClaims?.runLogFinalLabelClaims,
        { success: 151, fail: 29, unstable: 4 })
      && report.publisherOutcomeClaims?.runLogToPublisherLabelCorrections === 2
      && report.publisherOutcomeClaims?.independentOutcomeVerification === false
      && report.publisherOutcomeClaims?.independentOutcomeVerifiedEpisodes === 0,
    "PUBLISHER_OUTCOMES");
    const records = report.attemptLedger?.records;
    addError(errors, Array.isArray(records) && records.length === 200, "ATTEMPT_RECORDS");
    if (Array.isArray(records)) {
      const kept = records.filter((record) => record.disposition === "KEPT_REAL_ROBOT_EPISODE");
      const deleted = records.filter((record) => record.disposition === "DELETED_METADATA_ONLY");
      addError(errors, kept.length === 184 && deleted.length === 16
        && records.every((record, ordinal) => record.ordinal === ordinal
          && HASH.test(record.attemptId ?? "") && HASH.test(record.taskFingerprint ?? "")
          && record.opportunityRecordPresent === true)
        && kept.every((record) => record.actionTraceAdmitted === true
          && record.proprioceptiveTelemetryAdmitted === true
          && Number.isSafeInteger(record.admittedActionFrameCount)
          && ["success", "fail", "unstable"].includes(record.publisherOutcome))
        && deleted.every((record) => record.keptEpisodeIndex === null
          && record.actionTraceAdmitted === false && record.admittedActionFrameCount === null
          && record.proprioceptiveTelemetryAdmitted === false
          && record.publisherOutcome === null), "ATTEMPT_POPULATIONS");
      addError(errors, report.attemptLedger?.recordsHash
        === digest(`${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/attempts`, records),
      "ATTEMPT_RECORDS_HASH");
    }
    addError(errors, report.attemptLedger?.rawTaskTextProjected === false
      && report.attemptLedger?.rawMemoTextProjected === false
      && Array.isArray(report.attemptLedger?.taskFingerprints)
      && report.attemptLedger.taskFingerprints.length === 8
      && report.attemptLedger.taskFingerprintsHash === digest(
        `${SO101_COFFEE_RECOVERY_CENSUS_SCHEMA}/tasks`,
        report.attemptLedger.taskFingerprints), "TASK_PROJECTION");
    addError(errors, equalCanonical(report.retryAndRecovery?.counts, {
      groupCount: 150, singleAttemptGroups: 120, retryGroups: 30,
      attemptCountHistogram: { 1: 120, 2: 17, 3: 8, 4: 4, 6: 1 },
      publisherFailToEventualSuccessChains: 21, recoveredPublisherFailAttempts: 30,
      unrecoveredPublisherFailAttempts: 1, chainsWithInterveningDeletedAttempts: 3,
      recoveryChainAttemptSpanCount: 55,
    }) && Array.isArray(report.retryAndRecovery?.retryGroups)
      && report.retryAndRecovery.retryGroups.length === 30
      && Array.isArray(report.retryAndRecovery?.publisherFailToEventualSuccessChains)
      && report.retryAndRecovery.publisherFailToEventualSuccessChains.length === 21
      && report.retryAndRecovery?.sourceNativePublisherClaimsOnly === true
      && report.retryAndRecovery?.independentRecoveryVerification === false
      && report.retryAndRecovery?.independentlyVerifiedRecoveryChains === 0,
    "RETRY_RECOVERY");
    addError(errors, report.segmentCoverageAttribution?.additiveAcrossSegments === false
      && report.segmentCoverageAttribution?.completeIndependentEpisodeIntersection === 0
      && report.segmentCoverageAttribution?.opportunityCensus?.prospectiveTaskStartPresent === 200
      && report.segmentCoverageAttribution?.delegationAuthorization?.delegatedRecords === 0
      && report.segmentCoverageAttribution?.delegationAuthorization?.authorizedRecords === 0
      && report.segmentCoverageAttribution?.action?.sourceNativeActionTraces === 184
      && report.segmentCoverageAttribution?.effect?.independentPhysicalEffects === 0
      && report.segmentCoverageAttribution?.effect?.independentObjectStateEffects === 0
      && report.segmentCoverageAttribution?.outcome?.publisherOutcomeClaims === 184
      && report.segmentCoverageAttribution?.outcome?.independentOutcomes === 0
      && report.segmentCoverageAttribution?.recovery?.publisherRetryChains === 21
      && report.segmentCoverageAttribution?.recovery?.independentlyVerifiedRecoveryChains === 0
      && report.segmentCoverageAttribution?.longitudinal?.independentlyTrackedEpisodes === 0,
    "SEGMENT_COVERAGE");
    addError(errors, report.telemetryBoundary?.sourceNativeActionTraceEpisodes === 184
      && report.telemetryBoundary?.sourceNativeProprioceptiveStateEpisodes === 184
      && report.telemetryBoundary?.telemetryFrames === 38_718
      && report.telemetryBoundary?.deletedMetadataOnlyActionTraceEpisodes === 0
      && report.telemetryBoundary?.videoFilesFetched === 0
      && report.telemetryBoundary?.videoFramesDecoded === 0
      && report.telemetryBoundary?.independentCameraWitnessEpisodes === 0
      && report.telemetryBoundary?.independentObjectStateEpisodes === 0
      && report.telemetryBoundary?.independentPhysicalEffectEpisodes === 0
      && report.telemetryBoundary?.independentOutcomeEpisodes === 0
      && report.telemetryBoundary?.longitudinalEpisodes === 0, "TELEMETRY_BOUNDARY");
    addError(errors, Object.values(report.privacyAndProjection ?? {}).every((value) => value === 0),
      "PRIVACY_PROJECTION");
    addError(errors, report.modelAndTrainingBoundary?.offlineEvaluationPerformed === true
      && report.modelAndTrainingBoundary?.offlineResearchCensusBuilt === true
      && report.modelAndTrainingBoundary?.offlineModelFittingPerformed === false
      && report.modelAndTrainingBoundary?.offlineModelFittingRows === 0
      && report.modelAndTrainingBoundary?.authorizedTraining === false
      && report.modelAndTrainingBoundary?.authorizedTrainingRows === 0
      && report.modelAndTrainingBoundary?.authorizedTrainingJobs === 0
      && report.modelAndTrainingBoundary?.authorizedTrainingPerformed === false
      && report.modelAndTrainingBoundary?.automaticTraining === false
      && report.modelAndTrainingBoundary?.policyOptimizationPerformed === false
      && report.modelAndTrainingBoundary?.modelWeightsProduced === false, "TRAINING_BOUNDARY");
    addError(errors, Object.entries(report.authorityBoundary ?? {}).every(([key, value]) =>
      key === "executable" ? value === false : value === 0), "AUTHORITY_BOUNDARY");
    addError(errors, Object.values(report.limitations ?? {}).every((value) => value === false),
      "LIMITATIONS");
    addError(errors, report.rightsAndUseClearance?.hfCardLicenseClaim === "Apache-2.0"
      && report.rightsAndUseClearance?.bytePinnedReadmeLicenseClaim === "Apache-2.0"
      && report.rightsAndUseClearance?.licenseClaimAgreementObserved === true
      && report.rightsAndUseClearance?.legalConclusion === false
      && report.rightsAndUseClearance?.privacyClearanceAdjudicated === false
      && report.rightsAndUseClearance?.revisionSpecificUseClearanceAdjudicated === false
      && report.rightsAndUseClearance?.productionUseClearanceAdjudicated === false
      && report.rightsAndUseClearance?.authorizedTrainingClearanceAdjudicated === false
      && report.rightsAndUseClearance?.artifactUseBoundary
        === "OFFLINE_EVALUATION_AND_RESEARCH_ONLY", "RIGHTS_BOUNDARY");
  } catch (error) {
    errors.push(`EXCEPTION:${error?.message ?? error}`);
  }
  return { ok: errors.length === 0, errors };
}

export function verifySo101CoffeeRecoveryCensusWithSource(report, sourceDirectory,
  options = {}) {
  const standalone = verifySo101CoffeeRecoveryCensusReport(report);
  if (!standalone.ok) return standalone;
  try {
    const expected = buildSo101CoffeeRecoveryCensusFromSource(sourceDirectory, options);
    if (!equalCanonical(report, expected)) return { ok: false, errors: ["SOURCE_EXACT_REBUILD"] };
    return { ok: true, errors: [], reportHash: report.artifactHash,
      sourceManifestHash: expected.dataset.sourceManifestHash,
      verificationLevel: "FULL_BYTE_AND_SOURCE_REPLAY" };
  } catch (error) {
    return { ok: false, errors: [`SOURCE_REPLAY:${error?.message ?? error}`] };
  }
}

export function buildSo101CoffeeRecoveryCensusRunReceipt(report, reportBytes,
  sourceManifestHash) {
  const verified = verifySo101CoffeeRecoveryCensusReport(report);
  if (!verified.ok || !Buffer.isBuffer(reportBytes)
    || so101CoffeeSha256Bytes(reportBytes) !== so101CoffeeSha256Bytes(canonicalBytes(report))
    || !HASH.test(sourceManifestHash ?? "")
    || sourceManifestHash !== report.dataset.sourceManifestHash) {
    fail("RUN_RECEIPT_INPUT_INVALID");
  }
  const body = {
    schema: SO101_COFFEE_RUN_RECEIPT_SCHEMA,
    createdAt: SO101_COFFEE_FROZEN_AT,
    reportFile: "so101-coffee-recovery-census.json",
    reportFileSha256: so101CoffeeSha256Bytes(reportBytes),
    reportArtifactHash: report.artifactHash,
    sourceManifestHash,
    counts: {
      keptRealRobotEpisodes: 184,
      attemptCensusRecords: 200,
      deletedMetadataOnlyAttempts: 16,
      publisherFailToEventualSuccessChains: 21,
    },
    crossPopulationTotal: null,
    crossPopulationAdditionProhibited: true,
    authorizedTrainingRows: 0,
    authorizedTrainingJobs: 0,
    authorizedActions: 0,
    authorityDelta: 0,
  };
  return { ...body,
    receiptHash: digest(`${SO101_COFFEE_RUN_RECEIPT_SCHEMA}/receipt`, body) };
}

export function verifySo101CoffeeRecoveryCensusRunReceipt(receipt, reportBytes) {
  const errors = [];
  try {
    if (!exactObject(receipt)) return { ok: false, errors: ["RECEIPT_NOT_OBJECT"] };
    const { receiptHash, ...body } = receipt;
    addError(errors, receipt.schema === SO101_COFFEE_RUN_RECEIPT_SCHEMA, "SCHEMA");
    addError(errors, receipt.createdAt === SO101_COFFEE_FROZEN_AT, "CREATED_AT");
    addError(errors, HASH.test(receiptHash ?? "")
      && receiptHash === digest(`${SO101_COFFEE_RUN_RECEIPT_SCHEMA}/receipt`, body),
    "RECEIPT_HASH");
    addError(errors, Buffer.isBuffer(reportBytes)
      && receipt.reportFileSha256 === so101CoffeeSha256Bytes(reportBytes), "REPORT_FILE_HASH");
    let report = null;
    try { report = JSON.parse(reportBytes.toString("utf8")); } catch { /* checked below */ }
    addError(errors, report !== null && verifySo101CoffeeRecoveryCensusReport(report).ok
      && receipt.reportArtifactHash === report.artifactHash
      && receipt.sourceManifestHash === report.dataset.sourceManifestHash, "REPORT_BINDING");
    addError(errors, equalCanonical(receipt.counts, {
      keptRealRobotEpisodes: 184, attemptCensusRecords: 200,
      deletedMetadataOnlyAttempts: 16, publisherFailToEventualSuccessChains: 21,
    }) && receipt.crossPopulationTotal === null
      && receipt.crossPopulationAdditionProhibited === true
      && receipt.authorizedTrainingRows === 0 && receipt.authorizedTrainingJobs === 0
      && receipt.authorizedActions === 0 && receipt.authorityDelta === 0,
    "ZERO_BOUNDARIES");
  } catch (error) { errors.push(`EXCEPTION:${error?.message ?? error}`); }
  return { ok: errors.length === 0, errors };
}

export const SO101_COFFEE_RECOVERY_CENSUS_CONSTANTS = Object.freeze({
  expectedTreeHash: EXPECTED_TREE_HASH,
  expectedTreeEntries: EXPECTED_TREE_ENTRIES,
  expectedTreeFiles: EXPECTED_TREE_FILES,
  expectedTreePages: EXPECTED_TREE_PAGES,
  expectedSelectedFiles: EXPECTED_SELECTED_FILES,
  expectedSelectedBytes: EXPECTED_SELECTED_BYTES,
  canonicalObjects: CANONICAL_OBJECTS,
});
