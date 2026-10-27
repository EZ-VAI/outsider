/*
 * Bounded ViFailback cut-sausage failure/correction morphology intake.
 *
 * The acquirer freezes the complete pinned subtree, excludes all 33 MP4
 * objects, and downloads only the publisher annotation plus 597 JPEGs.  The
 * resulting keyframe/instruction pairs are publisher morphology, not raw
 * trajectories, independently observed outcomes, or verified recovery effects.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmdirSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const VIFAILBACK_DATASET_ID = "sii-rhos-ai/ViFailback-Dataset";
export const VIFAILBACK_REVISION = "21df46c2585c52e5a62df5f4b946bae6cbc6fed7";
export const VIFAILBACK_SUBTREE = "annotated_data/cut_sausage";
export const VIFAILBACK_ANNOTATION_PATH =
  `${VIFAILBACK_SUBTREE}/cut_sausage_annotations.json`;
export const VIFAILBACK_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const VIFAILBACK_SOURCE_SCHEMA = "outsider/vifailback-cut-sausage-pinned-source/v1";
export const VIFAILBACK_INVENTORY_SCHEMA = "outsider/vifailback-cut-sausage-inventory/v1";
export const VIFAILBACK_REPORT_SCHEMA = "outsider/vifailback-cut-sausage-morphology/v1";
export const VIFAILBACK_RECEIPT_SCHEMA = "outsider/vifailback-cut-sausage-run-receipt/v1";

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${VIFAILBACK_DATASET_ID}`;
const RECORD_URL = `${HF_API}/revision/${VIFAILBACK_REVISION}`;
const TREE_PATH = `/api/datasets/${VIFAILBACK_DATASET_ID}/tree/${VIFAILBACK_REVISION}`;
const TREE_URL = `${HF_ORIGIN}${TREE_PATH}/${encodeURIComponent(VIFAILBACK_SUBTREE)}`
  + "?recursive=true&expand=true&limit=100";
const RESOLVE_ROOT = `${HF_ORIGIN}/datasets/${VIFAILBACK_DATASET_ID}/resolve/${
  VIFAILBACK_REVISION}`;
const FETCH_TIMEOUT_MS = 180_000;
const MAX_API_BYTES = 16 * 1024 * 1024;
const MAX_OBJECT_BYTES = 16 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 20;
const DOWNLOAD_ATTEMPTS = 3;
const EXPECTED_REPOSITORY_BYTES = 512_923_928_502;
const EXPECTED_TREE_PAGES = 7;
const EXPECTED_TREE_ENTRIES = 666;
const EXPECTED_FILES = 631;
const EXPECTED_DIRECTORIES = 35;
const EXPECTED_JPEGS = 597;
const EXPECTED_VIDEOS = 33;
const EXPECTED_SELECTED_FILES = 598;
const EXPECTED_SELECTED_BYTES = 42_016_007;
const EXPECTED_VIDEO_BYTES = 157_431_339;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const BARE_SHA256 = /^[a-f0-9]{64}$/u;
const ALLOWED_HF_REDIRECT = /^(?:[a-z0-9-]+\.)*hf\.co$/iu;

function fail(code, detail = null) {
  throw new Error(detail === null ? `VIFAILBACK_MORPHOLOGY_${code}`
    : `VIFAILBACK_MORPHOLOGY_${code}:${detail}`);
}

export function vifailbackSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function vifailbackDigest(value, domain = VIFAILBACK_REPORT_SCHEMA) {
  return vifailbackSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function checkedUrl(value, kind) {
  const url = new URL(value);
  if (url.username !== "" || url.password !== "") fail("URL_CREDENTIALS_FORBIDDEN", value);
  if (kind === "HF") {
    if (url.protocol !== "https:" || url.origin !== HF_ORIGIN) fail("HF_URL_INVALID", value);
  } else if (kind === "REDIRECT") {
    if (url.protocol !== "https:" || !(url.origin === HF_ORIGIN
      || ALLOWED_HF_REDIRECT.test(url.hostname))) fail("REDIRECT_URL_INVALID", value);
  } else fail("URL_KIND_INVALID", kind);
  return url;
}

async function streamResponse(response, maximumBytes, expectedBytes = null) {
  if (!response.body) fail("FETCH_BODY_MISSING");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maximumBytes
    || expectedBytes !== null && Number(declared) !== expectedBytes)) {
    fail("FETCH_CONTENT_LENGTH_INVALID", declared);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes || expectedBytes !== null && total > expectedBytes) {
      await reader.cancel("bounded source limit exceeded");
      fail("FETCH_STREAM_SIZE_INVALID", String(total));
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1 || expectedBytes !== null && total !== expectedBytes) {
    fail("FETCH_BODY_SIZE_INVALID", String(total));
  }
  return Buffer.concat(chunks, total);
}

async function boundedFetch(value, maximumBytes, fetchImpl) {
  const url = checkedUrl(value, "HF");
  const response = await fetchImpl(url, {
    redirect: "error",
    headers: { accept: "application/json", "accept-encoding": "identity",
      "user-agent": "outsider-vifailback-morphology/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status !== 200 || response.headers.get("content-encoding") !== null
    || new URL(response.url || url).origin !== url.origin) {
    fail(`FETCH_HTTP_${response.status}`, url.pathname);
  }
  return { bytes: await streamResponse(response, maximumBytes), headers: response.headers };
}

async function jsonFetch(value, maximumBytes, fetchImpl) {
  const fetched = await boundedFetch(value, maximumBytes, fetchImpl);
  try { return { ...fetched, value: JSON.parse(fetched.bytes.toString("utf8")) }; }
  catch { fail("FETCH_JSON_INVALID", value); }
}

function recordProjection(value) {
  if (!exactObject(value) || value.id !== VIFAILBACK_DATASET_ID
    || value.sha !== VIFAILBACK_REVISION || value.private !== false
    || value.gated !== false || value.disabled !== false
    || value.cardData?.license !== "mit" || value.usedStorage !== EXPECTED_REPOSITORY_BYTES) {
    fail("REPOSITORY_RECORD_INVALID");
  }
  return { datasetId: VIFAILBACK_DATASET_ID, revision: VIFAILBACK_REVISION,
    private: false, gated: false, disabled: false,
    publisherLicenseClaim: "MIT", usedStorageBytes: EXPECTED_REPOSITORY_BYTES,
    lastModified: typeof value.lastModified === "string" ? value.lastModified : null };
}

function normalizeTreePage(value) {
  if (!Array.isArray(value)) fail("TREE_PAGE_INVALID");
  return value.map((entry) => {
    if (!exactObject(entry) || typeof entry.path !== "string"
      || !entry.path.startsWith(`${VIFAILBACK_SUBTREE}/`)
      || !["file", "directory"].includes(entry.type)) fail("TREE_ENTRY_INVALID");
    if (entry.type === "directory") return { path: entry.path, type: "directory" };
    if (!Number.isSafeInteger(entry.size) || entry.size < 1 || !SHA1.test(entry.oid ?? "")) {
      fail("TREE_FILE_INVALID", entry.path);
    }
    const projected = { path: entry.path, type: "file", sizeBytes: entry.size,
      gitOid: entry.oid, lfs: null,
      xetHash: typeof entry.xetHash === "string" ? entry.xetHash : null };
    if (entry.lfs !== undefined) {
      if (!exactObject(entry.lfs) || !BARE_SHA256.test(entry.lfs.oid ?? "")
        || entry.lfs.size !== entry.size || !Number.isSafeInteger(entry.lfs.pointerSize)) {
        fail("TREE_LFS_INVALID", entry.path);
      }
      projected.lfs = { sha256: `sha256:${entry.lfs.oid}`, sizeBytes: entry.lfs.size,
        pointerSize: entry.lfs.pointerSize };
    }
    return projected;
  });
}

function parseNextLink(value) {
  if (!value) return null;
  const part = String(value).split(",").find((item) => /;\s*rel="next"\s*$/iu.test(item));
  if (!part) return null;
  const match = /^\s*<([^>]+)>/u.exec(part);
  if (!match) fail("TREE_LINK_INVALID");
  const url = checkedUrl(match[1], "HF");
  const decoded = decodeURIComponent(url.pathname);
  if (decoded !== `${TREE_PATH}/${VIFAILBACK_SUBTREE}`
    || url.searchParams.get("recursive") !== "true"
    || url.searchParams.get("expand") !== "true"
    || url.searchParams.get("limit") !== "100"
    || !url.searchParams.get("cursor")) fail("TREE_LINK_UNSAFE");
  return url.toString();
}

async function fetchTree(fetchImpl, bracket) {
  const support = [];
  const entries = [];
  const seen = new Set();
  let url = TREE_URL;
  for (let page = 1; url !== null; page += 1) {
    if (page > 16 || seen.has(url)) fail("TREE_PAGINATION_INVALID");
    seen.add(url);
    const fetched = await jsonFetch(url, MAX_API_BYTES, fetchImpl);
    entries.push(...normalizeTreePage(fetched.value));
    support.push({ path: `source-support/hf-tree-${bracket}-${String(page).padStart(3, "0")}.json`,
      source: url, bytes: fetched.bytes });
    url = parseNextLink(fetched.headers.get("link"));
  }
  const ordered = entries.sort((left, right) => left.path.localeCompare(right.path));
  if (support.length !== EXPECTED_TREE_PAGES || ordered.length !== EXPECTED_TREE_ENTRIES
    || new Set(ordered.map((entry) => entry.path)).size !== ordered.length) {
    fail("TREE_PROFILE_CHANGED", `${support.length}/${ordered.length}`);
  }
  return { support, entries: ordered, pages: support.length,
    snapshotHash: vifailbackDigest(ordered, `${VIFAILBACK_SOURCE_SCHEMA}/tree`) };
}

function inventoryFromEntries(entries) {
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const videos = files.filter((entry) => entry.path.endsWith(".mp4"));
  const jpegs = files.filter((entry) => entry.path.endsWith(".jpg"));
  const annotations = files.filter((entry) => entry.path === VIFAILBACK_ANNOTATION_PATH);
  const selected = files.filter((entry) => !entry.path.endsWith(".mp4"));
  const unknown = files.filter((entry) => !entry.path.endsWith(".mp4")
    && !entry.path.endsWith(".jpg") && entry.path !== VIFAILBACK_ANNOTATION_PATH);
  const selectedBytes = selected.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const videoBytes = videos.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (files.length !== EXPECTED_FILES || directories.length !== EXPECTED_DIRECTORIES
    || videos.length !== EXPECTED_VIDEOS || jpegs.length !== EXPECTED_JPEGS
    || annotations.length !== 1 || selected.length !== EXPECTED_SELECTED_FILES
    || unknown.length !== 0 || selectedBytes !== EXPECTED_SELECTED_BYTES
    || videoBytes !== EXPECTED_VIDEO_BYTES) fail("SUBTREE_PROFILE_CHANGED");
  const body = { schema: VIFAILBACK_INVENTORY_SCHEMA,
    datasetId: VIFAILBACK_DATASET_ID, pinnedRevision: VIFAILBACK_REVISION,
    subtree: VIFAILBACK_SUBTREE, completePinnedSubtreeEnumerated: true,
    counts: { entries: entries.length, files: files.length, directories: directories.length,
      annotationJsonFiles: 1, jpegFiles: jpegs.length, excludedMp4Files: videos.length,
      selectedNoVideoFiles: selected.length, selectedNoVideoBytes: selectedBytes,
      excludedVideoBytes: videoBytes }, selectedPaths: selected.map((entry) => entry.path),
    excludedVideoObjects: videos, entries };
  return { ...body,
    inventoryHash: vifailbackDigest(body, `${VIFAILBACK_INVENTORY_SCHEMA}/inventory`) };
}

function parseAnnotationEpisodes(bytes, selectedPathSet, excludedVideoSet) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("ANNOTATION_JSON_INVALID"); }
  if (!Array.isArray(value) || value.length !== 33) fail("ANNOTATION_EPISODE_COUNT_INVALID");
  const ids = [];
  const sources = [];
  const allImageRefs = new Set();
  const annotatedImageRefs = new Set();
  const videoRefs = new Set();
  const failureTypes = new Map();
  const failureSubtasks = new Map();
  let failureYes = 0;
  let failureNo = 0;
  let keyframeRows = 0;
  let avoidanceRows = 0;
  let correctionRows = 0;
  const increment = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const episode of value) {
    if (!exactObject(episode) || typeof episode.video !== "string"
      || !Array.isArray(episode.images) || !Array.isArray(episode.subtasks)
      || typeof episode.task !== "string" || !Number.isInteger(episode.source_index)) {
      fail("ANNOTATION_EPISODE_SCHEMA_INVALID");
    }
    const match = /^annotated_data\/cut_sausage\/videos\/episode_(\d+)_cam_high\.mp4$/u
      .exec(episode.video);
    if (!match || !excludedVideoSet.has(episode.video)) fail("ANNOTATION_VIDEO_REF_INVALID");
    ids.push(Number(match[1]));
    sources.push(episode.source_index);
    videoRefs.add(episode.video);
    for (const image of episode.images) {
      if (typeof image !== "string" || !selectedPathSet.has(image) || !image.endsWith(".jpg")) {
        fail("ANNOTATION_IMAGE_REF_INVALID", String(image));
      }
      allImageRefs.add(image);
    }
    if (episode.failure_detection === "yes") {
      failureYes += 1;
      if (typeof episode.failure_subtask !== "string"
        || typeof episode.failure_type !== "string"
        || !Array.isArray(episode.keyframe) || episode.keyframe.length !== 1
        || !Array.isArray(episode.avoidance) || episode.avoidance.length !== 1
        || !Array.isArray(episode.correction) || episode.correction.length !== 1) {
        fail("ANNOTATION_FAILURE_SCHEMA_INVALID", episode.video);
      }
      increment(failureTypes, episode.failure_type);
      increment(failureSubtasks, episode.failure_subtask);
      keyframeRows += 1;
      avoidanceRows += 1;
      correctionRows += 1;
      const keyframe = episode.keyframe[0];
      const avoidance = episode.avoidance[0];
      const correction = episode.correction[0];
      const refs = [keyframe.avoid_keyframe, keyframe.correct_keyframe,
        avoidance.avoid_keyframe_annotations, correction.correct_keyframe_annotations];
      if (refs.some((item) => typeof item !== "string" || !selectedPathSet.has(item))
        || !episode.images.includes(keyframe.avoid_keyframe)
        || !episode.images.includes(keyframe.correct_keyframe)
        || typeof avoidance.low_level !== "string" || avoidance.low_level.length < 1
        || typeof correction.low_level !== "string" || correction.low_level.length < 1
        || !Array.isArray(avoidance.avoid_keyframe_annotations_code)
        || !Array.isArray(correction.correct_keyframe_annotations_code)) {
        fail("ANNOTATION_MORPHOLOGY_INVALID", episode.video);
      }
      refs.forEach((item) => annotatedImageRefs.add(item));
    } else if (episode.failure_detection === "no") {
      failureNo += 1;
      for (const key of ["failure_subtask", "failure_type", "keyframe", "avoidance", "correction"]) {
        if (Object.hasOwn(episode, key)) fail("ANNOTATION_NO_FAILURE_FIELD_PRESENT", episode.video);
      }
    } else fail("ANNOTATION_FAILURE_DETECTION_INVALID", episode.video);
  }
  const expectedIds = Array.from({ length: 33 }, (_, index) => index);
  if (!same([...ids].sort((a, b) => a - b), expectedIds)
    || !same([...sources].sort((a, b) => a - b), expectedIds)
    || videoRefs.size !== 33 || failureYes !== 31 || failureNo !== 2
    || allImageRefs.size !== 533 || annotatedImageRefs.size !== 124
    || keyframeRows !== 31 || avoidanceRows !== 31 || correctionRows !== 31
    || !same(Object.fromEntries([...failureTypes].sort()),
      { "gripper 6d-pose": 27, "gripper state": 4 })
    || !same(Object.fromEntries([...failureSubtasks].sort()), { "1": 16, "3": 13, "4": 2 })) {
    fail("ANNOTATION_PROFILE_CHANGED");
  }
  const union = new Set([...allImageRefs, ...annotatedImageRefs]);
  return { episodes: 33, failureDetectedEpisodes: 31, noFailureDetectedEpisodes: 2,
    videoReferences: videoRefs.size, imageReferences: allImageRefs.size,
    annotatedMorphologyImageReferences: annotatedImageRefs.size,
    uniqueReferencedJpegs: union.size,
    unreferencedSelectedJpegs: EXPECTED_JPEGS - union.size,
    keyframePairs: keyframeRows, lowLevelAvoidanceInstructions: avoidanceRows,
    lowLevelCorrectionInstructions: correctionRows,
    failureTypes: Object.fromEntries([...failureTypes].sort()),
    failureSubtasks: Object.fromEntries([...failureSubtasks].sort()),
    episodeIds: expectedIds, sourceIndices: expectedIds,
    rawEpisodes: value };
}

function waitMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeQuoted(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1) : trimmed;
}

async function downloadPinnedObject(entry, fetchImpl) {
  const initialUrl = checkedUrl(`${RESOLVE_ROOT}/${entry.path.split("/")
    .map(encodeURIComponent).join("/")}`, "HF");
  let lastError = null;
  for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt += 1) {
    let initial = null;
    let final = null;
    try {
      initial = await fetchImpl(initialUrl, {
        redirect: "manual",
        headers: { "accept-encoding": "identity",
          "user-agent": "outsider-vifailback-morphology/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const location = initial.headers.get("location");
      const repoCommit = initial.headers.get("x-repo-commit");
      const linkedEtag = normalizeQuoted(initial.headers.get("x-linked-etag"));
      const linkedSize = initial.headers.get("x-linked-size");
      const xetHash = initial.headers.get("x-xet-hash");
      if (![302, 307].includes(initial.status) || !location
        || repoCommit !== VIFAILBACK_REVISION) {
        fail("OBJECT_REDIRECT_BINDING_INVALID", `${entry.path}:${initial.status}`);
      }
      if (entry.lfs === null) {
        if (initial.status !== 307 || linkedEtag !== entry.gitOid) {
          fail("OBJECT_GIT_REDIRECT_BINDING_INVALID", entry.path);
        }
      } else if (initial.status !== 302 || linkedEtag !== entry.lfs.sha256.slice(7)
        || linkedSize !== String(entry.sizeBytes) || xetHash !== entry.xetHash) {
        fail("OBJECT_LFS_REDIRECT_BINDING_INVALID", entry.path);
      }
      if (initial.body) await initial.body.cancel("validated pinned redirect");
      const finalUrl = checkedUrl(new URL(location, initialUrl).toString(), "REDIRECT");
      final = await fetchImpl(finalUrl, {
        redirect: "error",
        headers: { "accept-encoding": "identity",
          "user-agent": "outsider-vifailback-morphology/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (final.status !== 200 || final.headers.get("content-encoding") !== null) {
        fail("OBJECT_FINAL_RESPONSE_INVALID", `${entry.path}:${final.status}`);
      }
      const bytes = await streamResponse(final, Math.min(MAX_OBJECT_BYTES, entry.sizeBytes),
        entry.sizeBytes);
      if (entry.lfs === null ? gitBlobOid(bytes) !== entry.gitOid
        : vifailbackSha256(bytes) !== entry.lfs.sha256) {
        fail("OBJECT_CONTENT_PIN_MISMATCH", entry.path);
      }
      return { bytes, transport: { initialStatus: initial.status,
        repositoryCommit: repoCommit,
        linkedEtag: entry.lfs?.sha256 ?? `git:${entry.gitOid}`,
        linkedSizeBytes: entry.sizeBytes,
        xetHash: entry.xetHash,
        finalHost: new URL(final.url || finalUrl).hostname } };
    } catch (error) {
      if (safeError(error).includes("_BINDING_INVALID")
        || safeError(error).includes("_CONTENT_PIN_MISMATCH")) throw error;
      lastError = safeError(error);
      if (initial?.body) { try { await initial.body.cancel(); } catch { /* no-op */ } }
      if (final?.body) { try { await final.body.cancel(); } catch { /* no-op */ } }
      if (attempt === DOWNLOAD_ATTEMPTS - 1) {
        fail("OBJECT_DOWNLOAD_FAILED", `${entry.path}:${lastError}`);
      }
      await waitMilliseconds(Math.min(4_000, 500 * (2 ** attempt)));
    }
  }
  fail("OBJECT_DOWNLOAD_FAILED", `${entry.path}:${lastError}`);
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function writeSupport(staging, item, projections) {
  writePrivate(path.join(staging, ...item.path.split("/")), item.bytes);
  projections.push({ path: item.path, source: item.source, sizeBytes: item.bytes.length,
    sha256: vifailbackSha256(item.bytes) });
}

function publishSourceStaging(staging, target) {
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("SOURCE_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "raw"), path.join(target, "raw"));
    renameSync(path.join(staging, "source-support"), path.join(target, "source-support"));
    renameSync(path.join(staging, "subtree-inventory.json"),
      path.join(target, "subtree-inventory.json"));
    renameSync(path.join(staging, "acquisition-manifest.json"),
      path.join(target, "acquisition-manifest.json"));
    rmdirSync(staging);
  } catch { fail("SOURCE_TARGET_PUBLISH_INCOMPLETE", target); }
}

export async function acquirePinnedVifailbackCutSausageSource(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_BROAD");
  ensurePrivateDirectory(path.dirname(target));
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  const supportObjects = [];
  const recordBeforeRaw = await jsonFetch(RECORD_URL, MAX_API_BYTES, fetchImpl);
  const recordBefore = recordProjection(recordBeforeRaw.value);
  writeSupport(staging, { path: "source-support/hf-repository-before.json",
    source: RECORD_URL, bytes: recordBeforeRaw.bytes }, supportObjects);
  const treeBefore = await fetchTree(fetchImpl, "before");
  for (const item of treeBefore.support) writeSupport(staging, item, supportObjects);
  const inventory = inventoryFromEntries(treeBefore.entries);
  const inventoryBytes = canonicalBytes(inventory);
  writePrivate(path.join(staging, "subtree-inventory.json"), inventoryBytes);
  const selectedEntries = treeBefore.entries.filter((entry) => entry.type === "file"
    && !entry.path.endsWith(".mp4"));
  const selectedObjects = new Array(selectedEntries.length);
  let cursor = 0;
  let completed = 0;
  const workers = Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, selectedEntries.length) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= selectedEntries.length) return;
        const entry = selectedEntries[index];
        const downloaded = await downloadPinnedObject(entry, fetchImpl);
        const rawPath = `raw/${entry.path}`;
        writePrivate(path.join(staging, ...rawPath.split("/")), downloaded.bytes);
        selectedObjects[index] = { remotePath: entry.path, rawPath,
          sizeBytes: downloaded.bytes.length, gitOid: entry.gitOid,
          lfsSha256: entry.lfs?.sha256 ?? null, xetHash: entry.xetHash,
          sha256: vifailbackSha256(downloaded.bytes), transport: downloaded.transport };
        completed += 1;
        if (completed % 100 === 0) process.stderr.write(`Downloaded ${completed}/${selectedEntries.length} pinned no-video objects...\n`);
      }
    });
  const settled = await Promise.allSettled(workers);
  const rejected = settled.find((item) => item.status === "rejected");
  if (rejected) throw rejected.reason;
  selectedObjects.sort((left, right) => left.remotePath.localeCompare(right.remotePath));
  const annotationEntry = selectedObjects.find((entry) =>
    entry.remotePath === VIFAILBACK_ANNOTATION_PATH);
  const selectedSet = new Set(inventory.selectedPaths);
  const excludedSet = new Set(inventory.excludedVideoObjects.map((entry) => entry.path));
  const annotationSummary = parseAnnotationEpisodes(readFileSync(path.join(staging,
    ...annotationEntry.rawPath.split("/"))), selectedSet, excludedSet);

  const treeAfter = await fetchTree(fetchImpl, "after");
  for (const item of treeAfter.support) writeSupport(staging, item, supportObjects);
  const recordAfterRaw = await jsonFetch(RECORD_URL, MAX_API_BYTES, fetchImpl);
  const recordAfter = recordProjection(recordAfterRaw.value);
  writeSupport(staging, { path: "source-support/hf-repository-after.json",
    source: RECORD_URL, bytes: recordAfterRaw.bytes }, supportObjects);
  if (!same(recordBefore, recordAfter) || treeBefore.snapshotHash !== treeAfter.snapshotHash
    || !same(treeBefore.entries, treeAfter.entries)) fail("PINNED_SOURCE_CHANGED_DURING_ACQUISITION");
  supportObjects.sort((left, right) => left.path.localeCompare(right.path));
  const { rawEpisodes: _rawEpisodes, ...summary } = annotationSummary;
  const body = { schema: VIFAILBACK_SOURCE_SCHEMA, capturedAt: VIFAILBACK_FROZEN_AT,
    datasetId: VIFAILBACK_DATASET_ID, pinnedRevision: VIFAILBACK_REVISION,
    repositoryBefore: recordBefore, repositoryAfter: recordAfter,
    treeBefore: { pages: treeBefore.pages, entryCount: treeBefore.entries.length,
      snapshotHash: treeBefore.snapshotHash },
    treeAfter: { pages: treeAfter.pages, entryCount: treeAfter.entries.length,
      snapshotHash: treeAfter.snapshotHash },
    repositoryStableDuringAcquisition: true, treeStableDuringAcquisition: true,
    subtree: { path: VIFAILBACK_SUBTREE, inventoryHash: inventory.inventoryHash,
      inventoryFileSha256: vifailbackSha256(inventoryBytes),
      completePinnedSubtreeEnumerated: true },
    selection: { annotationJsonFiles: 1, jpegFiles: EXPECTED_JPEGS,
      selectedNoVideoFiles: EXPECTED_SELECTED_FILES,
      selectedNoVideoBytes: EXPECTED_SELECTED_BYTES,
      excludedMp4Files: EXPECTED_VIDEOS, excludedVideoBytes: EXPECTED_VIDEO_BYTES,
      fullVideoContentDownloaded: false, rawTrajectoryContentDownloaded: false,
      completeSelectedNoVideoClosureReplayed: true },
    annotationSummary: summary,
    rights: { publisherLicenseClaim: "MIT", licenseClaimSource: "HF_CARD_DATA",
      legalAdjudicationPerformed: false, redistributionAuthorizedByArtifact: false,
      productionTrainingAuthorizedByOutsider: false },
    privacy: { publisherFramesSelected: true, videosExcluded: true,
      noPiiGuaranteed: false, humanPresenceExcludedByVerifiedAnalysis: false,
      biometricContentExcludedByVerifiedAnalysis: false },
    sourceSupportObjects: supportObjects,
    selectedObjects,
  };
  const manifest = { ...body,
    manifestHash: vifailbackDigest(body, `${VIFAILBACK_SOURCE_SCHEMA}/manifest`) };
  writePrivate(path.join(staging, "acquisition-manifest.json"), canonicalBytes(manifest));
  publishSourceStaging(staging, target);
  return { outputDirectory: target, selectedFiles: selectedObjects.length,
    selectedBytes: EXPECTED_SELECTED_BYTES, manifestHash: manifest.manifestHash };
}

function validateManifest(manifest) {
  if (!exactObject(manifest)) fail("MANIFEST_INVALID");
  const { manifestHash, ...body } = manifest;
  if (manifest.schema !== VIFAILBACK_SOURCE_SCHEMA
    || manifest.capturedAt !== VIFAILBACK_FROZEN_AT
    || manifest.datasetId !== VIFAILBACK_DATASET_ID
    || manifest.pinnedRevision !== VIFAILBACK_REVISION
    || manifestHash !== vifailbackDigest(body, `${VIFAILBACK_SOURCE_SCHEMA}/manifest`)
    || !same(manifest.repositoryBefore, manifest.repositoryAfter)
    || manifest.repositoryStableDuringAcquisition !== true
    || manifest.treeStableDuringAcquisition !== true
    || manifest.treeBefore?.pages !== EXPECTED_TREE_PAGES
    || manifest.treeAfter?.pages !== EXPECTED_TREE_PAGES
    || manifest.treeBefore?.entryCount !== EXPECTED_TREE_ENTRIES
    || manifest.treeAfter?.entryCount !== EXPECTED_TREE_ENTRIES
    || manifest.treeBefore?.snapshotHash !== manifest.treeAfter?.snapshotHash
    || !HASH.test(manifest.treeBefore?.snapshotHash ?? "")) fail("MANIFEST_IDENTITY_INVALID");
  recordProjection({ id: manifest.repositoryBefore.datasetId,
    sha: manifest.repositoryBefore.revision, private: manifest.repositoryBefore.private,
    gated: manifest.repositoryBefore.gated, disabled: manifest.repositoryBefore.disabled,
    cardData: { license: "mit" }, usedStorage: manifest.repositoryBefore.usedStorageBytes,
    lastModified: manifest.repositoryBefore.lastModified });
  if (manifest.subtree?.path !== VIFAILBACK_SUBTREE
    || manifest.subtree?.completePinnedSubtreeEnumerated !== true
    || !HASH.test(manifest.subtree?.inventoryHash ?? "")
    || !HASH.test(manifest.subtree?.inventoryFileSha256 ?? "")
    || !same(manifest.selection, { annotationJsonFiles: 1, jpegFiles: EXPECTED_JPEGS,
      selectedNoVideoFiles: EXPECTED_SELECTED_FILES,
      selectedNoVideoBytes: EXPECTED_SELECTED_BYTES,
      excludedMp4Files: EXPECTED_VIDEOS, excludedVideoBytes: EXPECTED_VIDEO_BYTES,
      fullVideoContentDownloaded: false, rawTrajectoryContentDownloaded: false,
      completeSelectedNoVideoClosureReplayed: true })) fail("MANIFEST_SELECTION_INVALID");
  const annotation = manifest.annotationSummary;
  if (annotation?.episodes !== 33 || annotation?.failureDetectedEpisodes !== 31
    || annotation?.noFailureDetectedEpisodes !== 2 || annotation?.videoReferences !== 33
    || annotation?.imageReferences !== 533
    || annotation?.annotatedMorphologyImageReferences !== 124
    || annotation?.uniqueReferencedJpegs !== 595
    || annotation?.unreferencedSelectedJpegs !== 2
    || annotation?.keyframePairs !== 31
    || annotation?.lowLevelAvoidanceInstructions !== 31
    || annotation?.lowLevelCorrectionInstructions !== 31
    || !same(annotation?.failureTypes,
      { "gripper 6d-pose": 27, "gripper state": 4 })
    || !same(annotation?.failureSubtasks, { "1": 16, "3": 13, "4": 2 })
    || !same(annotation?.episodeIds, Array.from({ length: 33 }, (_, index) => index))
    || !same(annotation?.sourceIndices, Array.from({ length: 33 }, (_, index) => index))) {
    fail("MANIFEST_ANNOTATION_INVALID");
  }
  if (!same(manifest.rights, { publisherLicenseClaim: "MIT",
    licenseClaimSource: "HF_CARD_DATA", legalAdjudicationPerformed: false,
    redistributionAuthorizedByArtifact: false,
    productionTrainingAuthorizedByOutsider: false })
    || !same(manifest.privacy, { publisherFramesSelected: true, videosExcluded: true,
      noPiiGuaranteed: false, humanPresenceExcludedByVerifiedAnalysis: false,
      biometricContentExcludedByVerifiedAnalysis: false })) fail("MANIFEST_BOUNDARY_INVALID");
  if (!Array.isArray(manifest.sourceSupportObjects)
    || manifest.sourceSupportObjects.length !== 16
    || !Array.isArray(manifest.selectedObjects)
    || manifest.selectedObjects.length !== EXPECTED_SELECTED_FILES) {
    fail("MANIFEST_OBJECT_COUNT_INVALID");
  }
  const expectedSupportPaths = ["source-support/hf-repository-after.json",
    "source-support/hf-repository-before.json",
    ...["after", "before"].flatMap((bracket) => Array.from({ length: 7 }, (_, index) =>
      `source-support/hf-tree-${bracket}-${String(index + 1).padStart(3, "0")}.json`))]
    .sort((left, right) => left.localeCompare(right));
  if (!same(manifest.sourceSupportObjects.map((item) => item.path), expectedSupportPaths)
    || !same(manifest.selectedObjects.map((item) => item.remotePath),
      sorted(manifest.selectedObjects.map((item) => item.remotePath)))) {
    fail("MANIFEST_OBJECT_ORDER_INVALID");
  }
  for (const item of manifest.sourceSupportObjects) {
    if (!exactObject(item) || !item.path.startsWith("source-support/")
      || item.path.split("/").length !== 2 || typeof item.source !== "string"
      || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 1
      || !HASH.test(item.sha256 ?? "")) fail("SUPPORT_OBJECT_INVALID");
    checkedUrl(item.source, "HF");
  }
  for (const item of manifest.selectedObjects) {
    if (!exactObject(item) || !item.remotePath.startsWith(`${VIFAILBACK_SUBTREE}/`)
      || item.remotePath.endsWith(".mp4") || item.rawPath !== `raw/${item.remotePath}`
      || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 1
      || !SHA1.test(item.gitOid ?? "")
      || item.lfsSha256 !== null && !HASH.test(item.lfsSha256 ?? "")
      || item.xetHash !== null && !BARE_SHA256.test(item.xetHash ?? "")
      || !HASH.test(item.sha256 ?? "") || !exactObject(item.transport)
      || item.transport.repositoryCommit !== VIFAILBACK_REVISION
      || item.transport.linkedSizeBytes !== item.sizeBytes
      || typeof item.transport.finalHost !== "string") fail("SELECTED_OBJECT_INVALID");
    if (item.lfsSha256 === null) {
      if (item.transport.initialStatus !== 307
        || item.transport.linkedEtag !== `git:${item.gitOid}`) {
        fail("SELECTED_GIT_TRANSPORT_INVALID", item.remotePath);
      }
    } else if (item.transport.initialStatus !== 302
      || item.transport.linkedEtag !== item.lfsSha256
      || item.transport.xetHash !== item.xetHash
      || !ALLOWED_HF_REDIRECT.test(item.transport.finalHost)) {
      fail("SELECTED_LFS_TRANSPORT_INVALID", item.remotePath);
    }
  }
  return manifest;
}

function treeSnapshot(root) {
  const directories = [];
  const files = [];
  const stamps = [];
  const visit = (directory, relative) => {
    const stat = lstatSync(directory, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory() || Number(stat.mode & 0o777n) !== 0o700) {
      fail("SOURCE_DIRECTORY_UNSAFE", relative || ".");
    }
    const names = sorted(readdirSync(directory));
    directories.push(relative);
    stamps.push({ path: relative, kind: "directory", dev: String(stat.dev), ino: String(stat.ino),
      mode: String(stat.mode), size: String(stat.size), mtimeNs: String(stat.mtimeNs),
      ctimeNs: String(stat.ctimeNs), names });
    for (const name of names) {
      const target = path.join(directory, name);
      const child = lstatSync(target, { bigint: true });
      const childRelative = relative === "" ? name : `${relative}/${name}`;
      if (child.isSymbolicLink()) fail("SOURCE_SYMLINK_FORBIDDEN", childRelative);
      if (child.isDirectory()) visit(target, childRelative);
      else if (child.isFile() && Number(child.mode & 0o777n) === 0o600) {
        files.push(childRelative);
        stamps.push({ path: childRelative, kind: "file", dev: String(child.dev),
          ino: String(child.ino), mode: String(child.mode), size: String(child.size),
          mtimeNs: String(child.mtimeNs), ctimeNs: String(child.ctimeNs) });
      } else fail("SOURCE_FILE_UNSAFE", childRelative);
    }
  };
  visit(root, "");
  return { directories: sorted(directories), files: sorted(files), stamps };
}

function expectedDirectories(files) {
  const directories = new Set([""]);
  for (const file of files) {
    let cursor = path.posix.dirname(file);
    while (cursor !== ".") {
      directories.add(cursor);
      cursor = path.posix.dirname(cursor);
    }
  }
  return sorted(directories);
}

function stableRead(root, relative, expected = null, maximumBytes = MAX_API_BYTES) {
  if (relative.startsWith("/") || relative.split("/").some((part) => !part
    || part === "." || part === "..")) fail("SOURCE_RELATIVE_PATH_INVALID", relative);
  const target = path.join(root, ...relative.split("/"));
  const link = lstatSync(target, { bigint: true });
  if (link.isSymbolicLink() || !link.isFile() || Number(link.mode & 0o777n) !== 0o600
    || link.size > BigInt(maximumBytes)) fail("SOURCE_FILE_READ_UNSAFE", relative);
  let descriptor;
  try {
    descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.dev !== link.dev || before.ino !== link.ino
      || before.mode !== link.mode || before.dev !== after.dev || before.ino !== after.ino
      || before.mode !== after.mode || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || bytes.length !== Number(before.size)) fail("SOURCE_FILE_CHANGED", relative);
    if (expected && (expected.sizeBytes !== bytes.length
      || expected.sha256 !== vifailbackSha256(bytes))) fail("SOURCE_FILE_BINDING_INVALID", relative);
    return bytes;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function replayTree(manifest, supportBytes, bracket) {
  const prefix = `source-support/hf-tree-${bracket}-`;
  const pages = manifest.sourceSupportObjects.filter((item) => item.path.startsWith(prefix));
  if (pages.length !== EXPECTED_TREE_PAGES) fail("TREE_REPLAY_PAGE_COUNT_INVALID", bracket);
  const entries = [];
  const sourceUrls = new Set();
  for (let index = 0; index < pages.length; index += 1) {
    const item = pages[index];
    const url = checkedUrl(item.source, "HF");
    const decoded = decodeURIComponent(url.pathname);
    if (decoded !== `${TREE_PATH}/${VIFAILBACK_SUBTREE}`
      || url.searchParams.get("recursive") !== "true"
      || url.searchParams.get("expand") !== "true"
      || url.searchParams.get("limit") !== "100"
      || index === 0 && url.searchParams.has("cursor")
      || index > 0 && !url.searchParams.get("cursor")
      || sourceUrls.has(url.toString())) fail("TREE_REPLAY_SOURCE_URL_INVALID", item.source);
    sourceUrls.add(url.toString());
    entries.push(...normalizeTreePage(parseJson(supportBytes.get(item.path),
      "TREE_SUPPORT_JSON_INVALID")));
  }
  const ordered = entries.sort((left, right) => left.path.localeCompare(right.path));
  const summary = bracket === "before" ? manifest.treeBefore : manifest.treeAfter;
  if (ordered.length !== EXPECTED_TREE_ENTRIES
    || new Set(ordered.map((entry) => entry.path)).size !== ordered.length
    || vifailbackDigest(ordered, `${VIFAILBACK_SOURCE_SCHEMA}/tree`) !== summary.snapshotHash) {
    fail("TREE_REPLAY_SNAPSHOT_INVALID", bracket);
  }
  return ordered;
}

function jpegProfile(bytes, objectPath) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8
    || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) fail("JPEG_BOUNDARY_INVALID", objectPath);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if ([0x01, ...Array.from({ length: 8 }, (_, index) => 0xd0 + index)].includes(marker)) {
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > bytes.length) fail("JPEG_SEGMENT_INVALID", objectPath);
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) fail("JPEG_SEGMENT_INVALID", objectPath);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb,
      0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) fail("JPEG_SOF_INVALID", objectPath);
      return { sofMarker: marker, precisionBits: bytes[offset + 2],
        height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5),
        components: bytes[offset + 7] };
    }
    offset += length;
  }
  fail("JPEG_SOF_MISSING", objectPath);
}

export function verifyVifailbackCutSausageSourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const before = treeSnapshot(root);
  const manifestBytes = stableRead(root, "acquisition-manifest.json", null, 32 * 1024 * 1024);
  const manifest = validateManifest(parseJson(manifestBytes, "MANIFEST_JSON_INVALID"));
  const expectedFiles = ["acquisition-manifest.json", "subtree-inventory.json",
    ...manifest.sourceSupportObjects.map((item) => item.path),
    ...manifest.selectedObjects.map((item) => item.rawPath)];
  if (!same(before.files, sorted(expectedFiles))
    || !same(before.directories, expectedDirectories(expectedFiles))) {
    fail("SOURCE_LAYOUT_INVALID");
  }
  const supportBytes = new Map();
  for (const item of manifest.sourceSupportObjects) {
    supportBytes.set(item.path, stableRead(root, item.path, item, MAX_API_BYTES));
  }
  const recordBefore = recordProjection(parseJson(supportBytes.get(
    "source-support/hf-repository-before.json"), "REPOSITORY_BEFORE_JSON_INVALID"));
  const recordAfter = recordProjection(parseJson(supportBytes.get(
    "source-support/hf-repository-after.json"), "REPOSITORY_AFTER_JSON_INVALID"));
  if (!same(recordBefore, manifest.repositoryBefore)
    || !same(recordAfter, manifest.repositoryAfter) || !same(recordBefore, recordAfter)) {
    fail("REPOSITORY_REPLAY_INVALID");
  }
  const treeBefore = replayTree(manifest, supportBytes, "before");
  const treeAfter = replayTree(manifest, supportBytes, "after");
  if (!same(treeBefore, treeAfter)) fail("TREE_BRACKET_REPLAY_INVALID");
  const rebuiltInventory = inventoryFromEntries(treeBefore);
  const inventoryBytes = stableRead(root, "subtree-inventory.json",
    { sizeBytes: Number(lstatSync(path.join(root, "subtree-inventory.json")).size),
      sha256: manifest.subtree.inventoryFileSha256 }, 4 * 1024 * 1024);
  const inventory = parseJson(inventoryBytes, "INVENTORY_JSON_INVALID");
  if (!same(rebuiltInventory, inventory)
    || inventory.inventoryHash !== manifest.subtree.inventoryHash) {
    fail("INVENTORY_REPLAY_INVALID");
  }
  const entryByPath = new Map(treeBefore.filter((entry) => entry.type === "file")
    .map((entry) => [entry.path, entry]));
  const rawBytes = new Map();
  const jpegProfiles = new Map();
  let totalBytes = 0;
  for (const item of manifest.selectedObjects) {
    const treeEntry = entryByPath.get(item.remotePath);
    if (!treeEntry || treeEntry.sizeBytes !== item.sizeBytes || treeEntry.gitOid !== item.gitOid
      || (treeEntry.lfs?.sha256 ?? null) !== item.lfsSha256
      || (treeEntry.xetHash ?? null) !== item.xetHash) {
      fail("SELECTED_TREE_BINDING_INVALID", item.remotePath);
    }
    const bytes = stableRead(root, item.rawPath, item, MAX_OBJECT_BYTES);
    if (item.lfsSha256 === null ? gitBlobOid(bytes) !== item.gitOid
      : vifailbackSha256(bytes) !== item.lfsSha256) {
      fail("SELECTED_CONTENT_PIN_INVALID", item.remotePath);
    }
    rawBytes.set(item.remotePath, bytes);
    totalBytes += bytes.length;
    if (item.remotePath.endsWith(".jpg")) {
      const profile = jpegProfile(bytes, item.remotePath);
      const key = canonicalizeStrict(profile);
      jpegProfiles.set(key, { profile, count: (jpegProfiles.get(key)?.count ?? 0) + 1 });
    }
  }
  if (totalBytes !== EXPECTED_SELECTED_BYTES || jpegProfiles.size < 1) {
    fail("SELECTED_REPLAY_TOTAL_INVALID");
  }
  const annotation = parseAnnotationEpisodes(rawBytes.get(VIFAILBACK_ANNOTATION_PATH),
    new Set(inventory.selectedPaths),
    new Set(inventory.excludedVideoObjects.map((entry) => entry.path)));
  const { rawEpisodes: _rawEpisodes, ...annotationSummary } = annotation;
  if (!same(annotationSummary, manifest.annotationSummary)) {
    fail("ANNOTATION_SUMMARY_REPLAY_INVALID");
  }
  const after = treeSnapshot(root);
  if (!same(before, after)) fail("SOURCE_TREE_CHANGED_DURING_REPLAY");
  const rootObjects = expectedFiles.filter((item) => item !== "acquisition-manifest.json")
    .map((item) => {
      const bytes = item === "subtree-inventory.json" ? inventoryBytes
        : supportBytes.get(item) ?? rawBytes.get(item.replace(/^raw\//u, ""));
      if (!bytes) fail("SOURCE_ROOT_OBJECT_MISSING", item);
      return { path: item, sizeBytes: bytes.length, sha256: vifailbackSha256(bytes) };
    }).sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({ ok: true, verificationLevel: "FULL_BOUNDED_SOURCE_REPLAY",
    sourceDirectory: root, manifest, inventory, annotationSummary,
    jpegProfiles: [...jpegProfiles.values()].sort((left, right) =>
      canonicalizeStrict(left.profile).localeCompare(canonicalizeStrict(right.profile))),
    manifestFileSha256: vifailbackSha256(manifestBytes),
    sourceRoot: vifailbackDigest(rootObjects, `${VIFAILBACK_SOURCE_SCHEMA}/source-root`) });
}

export function buildVifailbackCutSausageReportFromSource(sourceDirectory) {
  const checked = verifyVifailbackCutSausageSourceDirectory(sourceDirectory);
  const body = { schema: VIFAILBACK_REPORT_SCHEMA, capturedAt: VIFAILBACK_FROZEN_AT,
    source: { datasetId: VIFAILBACK_DATASET_ID, pinnedRevision: VIFAILBACK_REVISION,
      subtree: VIFAILBACK_SUBTREE, publisherLicenseClaim: "MIT",
      manifestHash: checked.manifest.manifestHash,
      manifestFileSha256: checked.manifestFileSha256,
      sourceRoot: checked.sourceRoot, verificationLevel: checked.verificationLevel,
      repositoryPublicAndUngated: true, completePinnedSubtreeEnumerated: true,
      fullVideoContentDownloaded: false, rawTrajectoryContentDownloaded: false },
    denominators: {
      completeSubtreeInventory: { class: "PINNED_PUBLISHER_SUBTREE_ENTRY",
        units: 666, fileUnits: 631, directoryUnits: 35 },
      selectedNoVideoClosure: { class: "PUBLISHER_ANNOTATION_AND_KEYFRAME_OBJECT",
        units: 598, annotationJsonUnits: 1, jpegUnits: 597, bytes: 42_016_007 },
      publisherAnnotationEpisodes: { class: "PUBLISHER_ANNOTATED_CUT_SAUSAGE_EPISODE",
        units: 33, publisherFailureDetectedUnits: 31,
        publisherNoFailureDetectedUnits: 2 },
      publisherFailureCorrectionMorphologies: {
        class: "PUBLISHER_FAILURE_AND_CORRECTION_MORPHOLOGY",
        units: 31, keyframePairUnits: 31, avoidanceInstructionUnits: 31,
        correctionInstructionUnits: 31 },
      excludedVideos: { class: "EXCLUDED_MP4_OBJECT", units: 33,
        bytes: 157_431_339, contentReplayed: false },
      crossTotal: null,
    },
    observations: { annotation: checked.annotationSummary,
      jpegProfiles: checked.jpegProfiles, exactPinnedJpegBytesReplayed: 597,
      imageSequenceIsNotRawRobotTrajectory: true,
      videoReferencesPresentButVideoBytesExcluded: true },
    truthBoundary: {
      publisherRealWorldDatasetClaimPresent: true,
      physicalExecutionIndependentlyVerifiedByOutsider: false,
      completePublisherAnnotatedSubtreeCensusEstablished: true,
      prospectiveAttemptCensusEstablished: false,
      publisherFailureAnnotationEstablished: true,
      publisherCorrectionMorphologyEstablished: true,
      rawActionOrRobotStateTrajectoryEstablished: false,
      physicalEffectEstablished: false,
      independentOutcomeEstablished: false,
      correctionExecutionEstablished: false,
      completeRecoveryEffectEstablished: false,
      longitudinalFollowupEstablished: false,
      affectedPartyOutcomeEstablished: false,
    },
    segments: {
      opportunityCensus: { units: 0, established: false },
      delegationAuthorization: { units: 0, established: false },
      actionTrace: { units: 0, established: false },
      effect: { units: 0, independentlyEstablished: false },
      outcome: { publisherFailureAnnotationUnits: 31, independentUnits: 0,
        sourceNativeAttributionOnly: true },
      recovery: { publisherCorrectionMorphologyUnits: 31,
        executableRecoverySuffixUnits: 0, verifiedRecoveryEffectUnits: 0 },
      longitudinal: { units: 0, established: false },
    },
    rights: { publisherLicenseClaim: "MIT", licenseClaimSource: "HF_CARD_DATA",
      legalAdjudicationPerformed: false, redistributionAuthorizedByArtifact: false,
      productionTrainingAuthorizedByOutsider: false },
    privacy: { publisherFramesPresent: true, videosExcluded: true,
      noPiiGuaranteed: false, humanPresenceExcludedByVerifiedAnalysis: false,
      biometricContentExcludedByVerifiedAnalysis: false,
      networkProjectionAllowed: false },
    useBoundary: { status: "QUARANTINE_EVAL_ONLY", offlineEvaluationOnly: true,
      publicDeploymentReady: false, governedTrainingRows: 0,
      modelTrainingAuthorized: false },
    network: { networkAdmissionRows: 0, published: false,
      externalAnchorEstablished: false },
    economics: { CEU: 0, pricingUnits: 0, insuranceUnits: 0 },
    authority: { executionAuthorityEstablished: false,
      trainingAuthorityEstablished: false, delegationAuthorityEstablished: false,
      safetyAuthorityEstablished: false, authorityUnits: 0 },
  };
  return Object.freeze({ ...body,
    artifactHash: vifailbackDigest(body, `${VIFAILBACK_REPORT_SCHEMA}/artifact`) });
}

function assertReportBoundary(report) {
  if (!exactObject(report)) fail("REPORT_INVALID");
  const { artifactHash, ...body } = report;
  if (report.schema !== VIFAILBACK_REPORT_SCHEMA
    || report.capturedAt !== VIFAILBACK_FROZEN_AT
    || artifactHash !== vifailbackDigest(body, `${VIFAILBACK_REPORT_SCHEMA}/artifact`)
    || report.source?.datasetId !== VIFAILBACK_DATASET_ID
    || report.source?.pinnedRevision !== VIFAILBACK_REVISION
    || report.source?.subtree !== VIFAILBACK_SUBTREE
    || report.source?.publisherLicenseClaim !== "MIT"
    || report.source?.repositoryPublicAndUngated !== true
    || report.source?.completePinnedSubtreeEnumerated !== true
    || report.source?.fullVideoContentDownloaded !== false
    || report.source?.rawTrajectoryContentDownloaded !== false
    || !HASH.test(report.source?.manifestHash ?? "")
    || !HASH.test(report.source?.manifestFileSha256 ?? "")
    || !HASH.test(report.source?.sourceRoot ?? "")) fail("REPORT_SOURCE_INVALID");
  if (report.denominators?.completeSubtreeInventory?.units !== 666
    || report.denominators?.selectedNoVideoClosure?.units !== 598
    || report.denominators?.selectedNoVideoClosure?.bytes !== 42_016_007
    || report.denominators?.publisherAnnotationEpisodes?.units !== 33
    || report.denominators?.publisherAnnotationEpisodes?.publisherFailureDetectedUnits !== 31
    || report.denominators?.publisherAnnotationEpisodes?.publisherNoFailureDetectedUnits !== 2
    || report.denominators?.publisherFailureCorrectionMorphologies?.units !== 31
    || report.denominators?.excludedVideos?.units !== 33
    || report.denominators?.excludedVideos?.contentReplayed !== false
    || report.denominators?.crossTotal !== null) fail("REPORT_DENOMINATOR_INVALID");
  if (report.observations?.annotation?.failureDetectedEpisodes !== 31
    || report.observations?.annotation?.noFailureDetectedEpisodes !== 2
    || report.observations?.annotation?.keyframePairs !== 31
    || report.observations?.annotation?.lowLevelAvoidanceInstructions !== 31
    || report.observations?.annotation?.lowLevelCorrectionInstructions !== 31
    || report.observations?.exactPinnedJpegBytesReplayed !== 597
    || report.observations?.imageSequenceIsNotRawRobotTrajectory !== true
    || report.observations?.videoReferencesPresentButVideoBytesExcluded !== true) {
    fail("REPORT_OBSERVATION_INVALID");
  }
  if (report.truthBoundary?.completePublisherAnnotatedSubtreeCensusEstablished !== true
    || report.truthBoundary?.prospectiveAttemptCensusEstablished !== false
    || report.truthBoundary?.publisherFailureAnnotationEstablished !== true
    || report.truthBoundary?.publisherCorrectionMorphologyEstablished !== true
    || report.truthBoundary?.rawActionOrRobotStateTrajectoryEstablished !== false
    || report.truthBoundary?.physicalEffectEstablished !== false
    || report.truthBoundary?.independentOutcomeEstablished !== false
    || report.truthBoundary?.correctionExecutionEstablished !== false
    || report.truthBoundary?.completeRecoveryEffectEstablished !== false
    || report.truthBoundary?.longitudinalFollowupEstablished !== false
    || report.segments?.opportunityCensus?.units !== 0
    || report.segments?.delegationAuthorization?.units !== 0
    || report.segments?.actionTrace?.units !== 0
    || report.segments?.effect?.units !== 0
    || report.segments?.outcome?.publisherFailureAnnotationUnits !== 31
    || report.segments?.outcome?.independentUnits !== 0
    || report.segments?.recovery?.publisherCorrectionMorphologyUnits !== 31
    || report.segments?.recovery?.executableRecoverySuffixUnits !== 0
    || report.segments?.recovery?.verifiedRecoveryEffectUnits !== 0
    || report.segments?.longitudinal?.units !== 0) fail("REPORT_TRUTH_BOUNDARY_INVALID");
  if (report.rights?.publisherLicenseClaim !== "MIT"
    || report.rights?.productionTrainingAuthorizedByOutsider !== false
    || report.rights?.redistributionAuthorizedByArtifact !== false
    || report.privacy?.noPiiGuaranteed !== false
    || report.privacy?.networkProjectionAllowed !== false
    || report.useBoundary?.status !== "QUARANTINE_EVAL_ONLY"
    || report.useBoundary?.governedTrainingRows !== 0
    || report.useBoundary?.modelTrainingAuthorized !== false
    || report.network?.networkAdmissionRows !== 0 || report.network?.published !== false
    || report.economics?.CEU !== 0 || report.economics?.pricingUnits !== 0
    || report.authority?.executionAuthorityEstablished !== false
    || report.authority?.trainingAuthorityEstablished !== false
    || report.authority?.delegationAuthorityEstablished !== false
    || report.authority?.safetyAuthorityEstablished !== false
    || report.authority?.authorityUnits !== 0) fail("REPORT_AUTHORITY_BOUNDARY_INVALID");
  return report;
}

export function verifyVifailbackCutSausageReport(report) {
  try { assertReportBoundary(report); return Object.freeze({ ok: true,
    verificationLevel: "SELF_SEALED_BOUNDARY_CHECK" }); }
  catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function verifyVifailbackCutSausageReportWithSource(report, sourceDirectory) {
  try {
    assertReportBoundary(report);
    const rebuilt = buildVifailbackCutSausageReportFromSource(sourceDirectory);
    if (!same(report, rebuilt)) fail("FULL_REPLAY_REPORT_MISMATCH");
    return Object.freeze({ ok: true, verificationLevel: "FULL_BOUNDED_SOURCE_REDERIVED",
      sourceRoot: rebuilt.source.sourceRoot });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function buildVifailbackCutSausageReceipt(report, reportBytes) {
  assertReportBoundary(report);
  if (!Buffer.isBuffer(reportBytes) || !reportBytes.equals(canonicalBytes(report))) {
    fail("RECEIPT_REPORT_BYTES_INVALID");
  }
  const body = { schema: VIFAILBACK_RECEIPT_SCHEMA, capturedAt: VIFAILBACK_FROZEN_AT,
    reportSchema: VIFAILBACK_REPORT_SCHEMA, reportFileSha256: vifailbackSha256(reportBytes),
    artifactHash: report.artifactHash, sourceRoot: report.source.sourceRoot,
    manifestHash: report.source.manifestHash,
    summary: { publisherAnnotatedEpisodes: 33, publisherFailureAnnotations: 31,
      publisherCorrectionMorphologies: 31, selectedNoVideoFiles: 598,
      independentOutcomeUnits: 0, executableRecoverySuffixUnits: 0,
      verifiedRecoveryEffectUnits: 0, governedTrainingRows: 0,
      networkAdmissionRows: 0, CEU: 0, pricingUnits: 0, authorityUnits: 0 },
    verificationLevel: "FULL_BOUNDED_SOURCE_REDERIVED" };
  return Object.freeze({ ...body,
    receiptHash: vifailbackDigest(body, `${VIFAILBACK_RECEIPT_SCHEMA}/receipt`) });
}

export function verifyVifailbackCutSausageReceipt(receipt, report, reportBytes) {
  try {
    const expected = buildVifailbackCutSausageReceipt(report, reportBytes);
    if (!same(receipt, expected)) fail("RECEIPT_MISMATCH");
    return Object.freeze({ ok: true });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function publishVifailbackCutSausageArtifactDirectory(stagingDirectory,
  targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (target === path.parse(target).root || existsSync(target)) {
    fail("PUBLISH_TARGET_EXISTS_OR_BROAD", target);
  }
  const stat = lstatSync(staging);
  if (stat.isSymbolicLink() || !stat.isDirectory()
    || !same(sorted(readdirSync(staging)), ["report.json", "run-receipt.json", "source"])) {
    fail("PUBLISH_STAGING_INVALID");
  }
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("PUBLISH_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "source"), path.join(target, "source"));
    renameSync(path.join(staging, "report.json"), path.join(target, "report.json"));
    renameSync(path.join(staging, "run-receipt.json"), path.join(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch { fail("PUBLISH_INCOMPLETE", target); }
}

export function verifyVifailbackCutSausageArtifactDirectory(artifactDirectory) {
  try {
    const root = path.resolve(artifactDirectory);
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== 0o700
      || !same(sorted(readdirSync(root)), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const readTop = (name) => {
      const target = path.join(root, name);
      const item = lstatSync(target);
      if (item.isSymbolicLink() || !item.isFile() || (item.mode & 0o777) !== 0o600) {
        fail("ARTIFACT_FILE_UNSAFE", name);
      }
      return readFileSync(target);
    };
    const reportBytes = readTop("report.json");
    const receiptBytes = readTop("run-receipt.json");
    const report = parseJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const receipt = parseJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
    const replay = verifyVifailbackCutSausageReportWithSource(report,
      path.join(root, "source"));
    if (!replay.ok) fail("ARTIFACT_SOURCE_REPLAY_INVALID", replay.error);
    if (!verifyVifailbackCutSausageReceipt(receipt, report, reportBytes).ok) {
      fail("ARTIFACT_RECEIPT_INVALID");
    }
    return Object.freeze({ ok: true, verificationLevel: replay.verificationLevel,
      publisherAnnotatedEpisodes: 33, publisherFailureAnnotations: 31,
      publisherCorrectionMorphologies: 31, independentOutcomeUnits: 0,
      verifiedRecoveryEffectUnits: 0, governedTrainingRows: 0,
      networkAdmissionRows: 0, CEU: 0, pricingUnits: 0, authorityUnits: 0 });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}
