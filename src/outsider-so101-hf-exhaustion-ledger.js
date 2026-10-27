/*
 * Exact Hugging Face SO-101 search census plus one complete, bounded,
 * video-free source-native reward/state/action closure.
 *
 * The census exhausts only the two explicitly declared HF API queries.  It
 * never claims global source exhaustion.  Publisher `next.reward` values are
 * preserved as released signals, not promoted to independent task outcomes,
 * successes, failures, interventions, recoveries, or an attempt census.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "./canonical-historical-replay.js";

export const SO101_HF_SEARCH_TERMS = Object.freeze(["so101", "SO-101"]);
export const SO101_HF_ADMITTED_DATASET_ID =
  "k1000dai/so101-self-replica-pick-up-grenn-cube-50ep-iter0-rewards-overhead";
export const SO101_HF_ADMITTED_REVISION =
  "bdfc548b5216a0ad271ee10d9545eb97c8b57d37";
export const SO101_HF_SOURCE_SCHEMA = "outsider/so101-hf-search-source/v1";
export const SO101_HF_INVENTORY_SCHEMA = "outsider/so101-hf-search-inventory/v1";
export const SO101_HF_LEDGER_SCHEMA = "outsider/so101-hf-exhaustion-ledger/v1";
export const SO101_HF_RECEIPT_SCHEMA = "outsider/so101-hf-exhaustion-run-receipt/v1";

const HF_ORIGIN = "https://huggingface.co";
const SEARCH_PATH = "/api/datasets";
const SEARCH_LIMIT = 1_000;
const ADMITTED_API = `${HF_ORIGIN}/api/datasets/${SO101_HF_ADMITTED_DATASET_ID}`;
const ADMITTED_RECORD_URL = `${ADMITTED_API}/revision/${SO101_HF_ADMITTED_REVISION}`;
const ADMITTED_TREE_PATH =
  `/api/datasets/${SO101_HF_ADMITTED_DATASET_ID}/tree/${SO101_HF_ADMITTED_REVISION}`;
const ADMITTED_TREE_URL = `${HF_ORIGIN}${ADMITTED_TREE_PATH}?recursive=true&limit=1000`;
const ADMITTED_RESOLVE = `${HF_ORIGIN}/datasets/${SO101_HF_ADMITTED_DATASET_ID}`
  + `/resolve/${SO101_HF_ADMITTED_REVISION}`;
const MAX_SEARCH_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_CONTROL_BYTES = 16 * 1024 * 1024;
const MAX_OBJECT_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 180_000;
const FETCH_ATTEMPTS = 3;
const EXPECTED = Object.freeze({
  searchPages: 10,
  searchRecords: 9_766,
  publicUngated: 9_679,
  gatedAuto: 62,
  gatedManual: 25,
  privateRecords: 0,
  disabledRecords: 0,
  prioritySignalCandidates: 56,
  dispositionOutsidePriority: 9_618,
  dispositionNotPublicUngated: 87,
  dispositionOneSourceBudgetFilled: 50,
  dispositionAlreadyCovered: 10,
  dispositionAdmitted: 1,
  candidateTreeEntries: 23,
  candidateTreeFiles: 11,
  candidateTreeDirectories: 12,
  candidateTreeBytes: 681_635_035,
  selectedFiles: 7,
  selectedBytes: 1_287_697,
  excludedVideoFiles: 4,
  excludedVideoBytes: 680_347_338,
  repositoryUsedStorageBytes: 681_606_294,
  episodes: 50,
  frames: 45_273,
  tasks: 1,
  fps: 30,
});
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const REDIRECT_HOST = /(?:^|\.)(?:hf\.co|huggingface\.co)$/iu;
const TERMINAL_STATUSES = new Set(["ADMITTED", "REJECTED"]);
const PRIORITY_PATTERNS = Object.freeze([
  ["INTERVENTION", /intervention|is[_ .-]?intervention/iu],
  ["REWARD", /reward|next[._ ]?reward/iu],
  ["DONE_TERMINAL", /next[._ ]?done|\bdone\b|\bterminal\b/iu],
  ["FAILURE_ANOMALY", /fail|anomal/iu],
  ["RETRY_RECOVERY", /retry|recover/iu],
  ["MECHANICAL_SENSOR", /tactile|torque|motor[ _.-]?current|force[ _.-]?sensor|mechanical|dynamics|collision/iu],
]);

export const SO101_HF_COVERED_DATASET_IDS = Object.freeze([
  "MINT-SJTU/RW-RL-Dataset",
  "NOJIMA21/so101-egg-cracking",
  "NOJIMA21/so101-egg-transport-act-v0",
  "NoahWeiss/farm_uf850",
  "Posttraining-RFM-RSS2026/Challenge-phase1-dataset",
  "TakuyaHiraoka/so101_pick_diverse_objects_hil_round1",
  "TakuyaHiraoka/so101_pick_diverse_objects_rl_round1",
  "aBochen/so101_HIL_pick_lift_15ep004_reward_classifier",
  "abdul004/molmoact2-so101-zero-shot-eval",
  "apaszynska/eval_recap_pi05",
  "apaszynska/eval_recap_pi05_cup",
  "apaszynska/eval_recap_pi05_cup_2",
  "apaszynska/merged-recap-cup-training",
  "apaszynska/merged-recap-cup-training-h264",
  "apaszynska/recap_episodes_1",
  "apaszynska/recap_pi05_cup_new_2",
  "apaszynska/recap_pi05_cup_new_3",
  "apaszynska/recap_pi05_cup_new_4",
  "apaszynska/recap_pi05_cup_new_5",
  "apaszynska/recap_pi05_cup_new_6",
  "apaszynska/recap_pi05_cup_new_7",
  "apaszynska/so101-cup-recap-20ep",
  "armnet/armnetbench_v01_lerobot_so101",
  "BrutalCaesar/phi_so101_cubes_cylinder_recovery_v1",
  "configinc/HABIT",
  "ExylosAi/pick_and_place_sample",
  "frankzydou/NAD",
  "Jingyi-Z/sotac",
  "nevertmr/so101_coffee_rollouts",
  "nvidia/Anchor-Lab",
].sort((left, right) => left.localeCompare(right)));

function fail(code, detail = null) {
  throw new Error(detail === null ? `SO101_HF_EXHAUSTION_${code}`
    : `SO101_HF_EXHAUSTION_${code}:${detail}`);
}

export function so101HfSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function so101HfDigest(value, domain = SO101_HF_LEDGER_SCHEMA) {
  return so101HfSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length < 1 || value.startsWith("/")
    || value.includes("\\") || value.split("/").some((item) => ["", ".", ".."].includes(item))
    || path.posix.normalize(value) !== value) fail("PATH_INVALID", String(value));
  return value;
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function searchUrl(term) {
  const url = new URL(`${HF_ORIGIN}${SEARCH_PATH}`);
  url.searchParams.set("search", term);
  url.searchParams.set("limit", String(SEARCH_LIMIT));
  url.searchParams.set("full", "true");
  return url.toString();
}

function checkedHfUrl(value, kind, term = null) {
  const url = new URL(value);
  if (url.origin !== HF_ORIGIN || url.username !== "" || url.password !== "") {
    fail("HF_URL_INVALID", value);
  }
  if (kind === "SEARCH") {
    if (url.pathname !== SEARCH_PATH || url.searchParams.get("search") !== term
      || url.searchParams.get("limit") !== String(SEARCH_LIMIT)
      || url.searchParams.get("full") !== "true") fail("SEARCH_URL_INVALID", value);
    const allowed = new Set(["search", "limit", "full", "cursor"]);
    if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) {
      fail("SEARCH_URL_PARAMETER_INVALID", value);
    }
  } else if (kind === "RECORD" && url.toString() !== ADMITTED_RECORD_URL) {
    fail("RECORD_URL_INVALID", value);
  } else if (kind === "TREE") {
    if (url.pathname !== ADMITTED_TREE_PATH || url.searchParams.get("recursive") !== "true"
      || url.searchParams.get("limit") !== "1000") fail("TREE_URL_INVALID", value);
  }
  return url;
}

function checkedRedirectUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== ""
    || !(url.hostname === "huggingface.co" || REDIRECT_HOST.test(url.hostname))) {
    fail("REDIRECT_URL_INVALID", value);
  }
  return url;
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readResponse(response, maximumBytes, expectedBytes = null) {
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

async function boundedFetch(value, kind, maximumBytes, fetchImpl, term = null) {
  const url = checkedHfUrl(value, kind, term);
  let lastError = null;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, { redirect: "error",
        headers: { accept: "application/json", "accept-encoding": "identity",
          "user-agent": "outsider-so101-hf-exhaustion/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.status !== 200 || new URL(response.url || url).origin !== HF_ORIGIN) {
        fail(`FETCH_HTTP_${response.status}`, url.pathname);
      }
      const bytes = await readResponse(response, maximumBytes);
      return { bytes, status: response.status, url: url.toString(),
        serverDate: response.headers.get("date"), etag: response.headers.get("etag"),
        link: response.headers.get("link") };
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS) await delay(300 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function parseNextSearchLink(value, term) {
  if (value === null) return null;
  const parts = value.split(",");
  const next = parts.find((item) => /;\s*rel="next"\s*$/iu.test(item));
  if (!next) return null;
  const match = /^\s*<([^>]+)>/u.exec(next);
  if (!match) fail("SEARCH_LINK_INVALID");
  const url = checkedHfUrl(match[1], "SEARCH", term);
  if (!url.searchParams.get("cursor")) fail("SEARCH_CURSOR_MISSING");
  return url.toString();
}

function projectSearchRecord(value) {
  if (!exactObject(value) || typeof value.id !== "string" || !value.id.includes("/")
    || !(value.sha === null || SHA1.test(value.sha ?? ""))
    || typeof value.private !== "boolean"
    || ![false, "auto", "manual"].includes(value.gated)
    || typeof value.disabled !== "boolean" || !Array.isArray(value.tags)
    || value.tags.some((item) => typeof item !== "string")
    || typeof value.lastModified !== "string"
    || Number.isNaN(Date.parse(value.lastModified))) fail("SEARCH_RECORD_INVALID");
  const description = typeof value.description === "string" ? value.description : null;
  const cardData = exactObject(value.cardData) ? value.cardData : null;
  return { id: value.id, revision: value.sha, private: value.private, gated: value.gated,
    disabled: value.disabled, createdAt: typeof value.createdAt === "string"
      ? value.createdAt : null, lastModified: value.lastModified,
    tags: sorted(value.tags), cardData, description };
}

function projectSearchRecords(items) {
  if (!Array.isArray(items)) fail("SEARCH_PAGE_INVALID");
  const records = items.map(projectSearchRecord)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(records.map((item) => item.id)).size !== records.length) {
    fail("SEARCH_DUPLICATE_ID");
  }
  return records;
}

function searchSummary(records) {
  const summary = { records: records.length,
    privateRecords: records.filter((item) => item.private).length,
    publicUngated: records.filter((item) => !item.private && item.gated === false).length,
    gatedAuto: records.filter((item) => item.gated === "auto").length,
    gatedManual: records.filter((item) => item.gated === "manual").length,
    disabledRecords: records.filter((item) => item.disabled).length,
    projectionHash: so101HfDigest(records, `${SO101_HF_SOURCE_SCHEMA}/search-projection`) };
  if (summary.records !== EXPECTED.searchRecords
    || summary.privateRecords !== EXPECTED.privateRecords
    || summary.publicUngated !== EXPECTED.publicUngated
    || summary.gatedAuto !== EXPECTED.gatedAuto
    || summary.gatedManual !== EXPECTED.gatedManual
    || summary.disabledRecords !== EXPECTED.disabledRecords) fail("SEARCH_SUMMARY_CHANGED");
  return summary;
}

function supportDescriptor(relativePath, fetched) {
  return { path: relativePath, source: fetched.url, httpStatus: fetched.status,
    sizeBytes: fetched.bytes.length, sha256: so101HfSha256(fetched.bytes),
    serverDate: fetched.serverDate, etag: fetched.etag,
    nextUrl: fetched.nextUrl ?? null };
}

async function fetchSearchSnapshot(term, key, label, fetchImpl) {
  let url = searchUrl(term);
  const support = [];
  const items = [];
  const seen = new Set();
  for (let page = 1; url !== null; page += 1) {
    if (page > 12 || seen.has(url)) fail("SEARCH_PAGINATION_INVALID", `${key}-${label}`);
    seen.add(url);
    const fetched = await boundedFetch(url, "SEARCH", MAX_SEARCH_PAGE_BYTES, fetchImpl, term);
    const value = parseJson(fetched.bytes, "SEARCH_JSON_INVALID");
    if (!Array.isArray(value) || value.length < 1 || value.length > SEARCH_LIMIT) {
      fail("SEARCH_PAGE_PROFILE_INVALID", `${key}-${label}-${page}`);
    }
    items.push(...value);
    const nextUrl = parseNextSearchLink(fetched.link, term);
    const relativePath = `control/search-${key}-${label}-page-${String(page).padStart(3, "0")}.json`;
    support.push({ relativePath, fetched: { ...fetched, nextUrl } });
    url = nextUrl;
  }
  if (support.length !== EXPECTED.searchPages
    || support.slice(0, -1).some((item) => parseJson(item.fetched.bytes,
      "SEARCH_JSON_INVALID").length !== SEARCH_LIMIT)
    || parseJson(support.at(-1).fetched.bytes, "SEARCH_JSON_INVALID").length
      !== EXPECTED.searchRecords % SEARCH_LIMIT) fail("SEARCH_PAGE_COUNT_CHANGED");
  const records = projectSearchRecords(items);
  return { term, key, label, support, records, summary: searchSummary(records) };
}

function normalizeTree(value) {
  if (!Array.isArray(value)) fail("TREE_JSON_INVALID");
  return value.map((entry) => {
    if (!exactObject(entry) || !["file", "directory"].includes(entry.type)
      || typeof entry.path !== "string" || !SHA1.test(entry.oid ?? "")) {
      fail("TREE_ENTRY_INVALID");
    }
    safeRelative(entry.path);
    const projected = { path: entry.path, type: entry.type, gitOid: entry.oid,
      sizeBytes: entry.type === "file" ? entry.size : 0, lfs: null };
    if (entry.type === "file" && (!Number.isSafeInteger(entry.size) || entry.size < 1)) {
      fail("TREE_FILE_SIZE_INVALID", entry.path);
    }
    if (entry.lfs !== undefined) {
      if (entry.type !== "file" || !exactObject(entry.lfs)
        || !SHA256.test(entry.lfs.oid ?? "") || entry.lfs.size !== entry.size
        || !Number.isSafeInteger(entry.lfs.pointerSize)) fail("TREE_LFS_INVALID", entry.path);
      projected.lfs = { sha256: `sha256:${entry.lfs.oid}`, sizeBytes: entry.lfs.size,
        pointerSize: entry.lfs.pointerSize };
    }
    return projected;
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function candidateRecordProjection(value) {
  if (!exactObject(value) || value.id !== SO101_HF_ADMITTED_DATASET_ID
    || value.sha !== SO101_HF_ADMITTED_REVISION || value.private !== false
    || value.gated !== false || value.disabled !== false
    || value.usedStorage !== EXPECTED.repositoryUsedStorageBytes
    || !Array.isArray(value.siblings) || value.siblings.length !== EXPECTED.candidateTreeFiles
    || value.cardData?.license !== "apache-2.0") fail("CANDIDATE_RECORD_CHANGED");
  return { datasetId: value.id, revision: value.sha, private: value.private,
    gated: value.gated, disabled: value.disabled, usedStorageBytes: value.usedStorage,
    lastModified: value.lastModified, publisherLicenseClaim: "Apache-2.0",
    siblingPaths: value.siblings.map((item) => item.rfilename).sort() };
}

function candidateTreeSummary(entries) {
  const files = entries.filter((item) => item.type === "file");
  const selected = files.filter((item) => !item.path.endsWith(".mp4"));
  const videos = files.filter((item) => item.path.endsWith(".mp4"));
  const summary = { entries: entries.length, files: files.length,
    directories: entries.length - files.length,
    bytes: files.reduce((sum, item) => sum + item.sizeBytes, 0),
    selectedFiles: selected.length,
    selectedBytes: selected.reduce((sum, item) => sum + item.sizeBytes, 0),
    excludedVideoFiles: videos.length,
    excludedVideoBytes: videos.reduce((sum, item) => sum + item.sizeBytes, 0),
    projectionHash: so101HfDigest(entries, `${SO101_HF_SOURCE_SCHEMA}/candidate-tree`) };
  if (summary.entries !== EXPECTED.candidateTreeEntries
    || summary.files !== EXPECTED.candidateTreeFiles
    || summary.directories !== EXPECTED.candidateTreeDirectories
    || summary.bytes !== EXPECTED.candidateTreeBytes
    || summary.selectedFiles !== EXPECTED.selectedFiles
    || summary.selectedBytes !== EXPECTED.selectedBytes
    || summary.excludedVideoFiles !== EXPECTED.excludedVideoFiles
    || summary.excludedVideoBytes !== EXPECTED.excludedVideoBytes) {
    fail("CANDIDATE_TREE_SUMMARY_CHANGED");
  }
  return summary;
}

async function fetchCandidateSnapshot(label, fetchImpl) {
  const record = await boundedFetch(ADMITTED_RECORD_URL, "RECORD", MAX_CONTROL_BYTES,
    fetchImpl);
  const tree = await boundedFetch(ADMITTED_TREE_URL, "TREE", MAX_CONTROL_BYTES, fetchImpl);
  if (parseNextSearchLink(tree.link, "so101") !== null) fail("CANDIDATE_TREE_PAGINATED");
  const recordValue = candidateRecordProjection(parseJson(record.bytes,
    "CANDIDATE_RECORD_JSON_INVALID"));
  const entries = normalizeTree(parseJson(tree.bytes, "CANDIDATE_TREE_JSON_INVALID"));
  const summary = candidateTreeSummary(entries);
  return { record: recordValue, entries, summary, support: [
    { relativePath: `control/candidate-record-${label}.json`, fetched: record },
    { relativePath: `control/candidate-tree-${label}-page-001.json`,
      fetched: { ...tree, nextUrl: null } },
  ] };
}

async function objectFetch(remotePath, expectedBytes, fetchImpl) {
  let url = checkedRedirectUrl(`${ADMITTED_RESOLVE}/${remotePath}?download=true`);
  let lastError = null;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      for (let redirects = 0; redirects < 6; redirects += 1) {
        const response = await fetchImpl(url, { redirect: "manual",
          headers: { accept: "application/octet-stream", "accept-encoding": "identity",
            "user-agent": "outsider-so101-hf-exhaustion/1.0" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location) fail("OBJECT_REDIRECT_LOCATION_MISSING", remotePath);
          url = checkedRedirectUrl(new URL(location, url).toString());
          continue;
        }
        if (response.status !== 200) fail(`OBJECT_HTTP_${response.status}`, remotePath);
        return await readResponse(response, Math.min(MAX_OBJECT_BYTES, expectedBytes),
          expectedBytes);
      }
      fail("OBJECT_REDIRECT_LIMIT", remotePath);
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS) await delay(300 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function verifyObject(entry, bytes) {
  if (bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_INVALID", entry.path);
  const sha256 = so101HfSha256(bytes);
  if (entry.lfs !== null) {
    if (sha256 !== entry.lfs.sha256) fail("OBJECT_LFS_HASH_INVALID", entry.path);
  } else if (gitBlobOid(bytes) !== entry.gitOid) fail("OBJECT_GIT_OID_INVALID", entry.path);
  return sha256;
}

function mkdirPrivate(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  mkdirPrivate(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function manifestCore(manifest) {
  const copy = structuredClone(manifest);
  delete copy.manifestHash;
  return copy;
}

function inventoryCore(inventory) {
  const copy = structuredClone(inventory);
  delete copy.inventoryHash;
  return copy;
}

function remoteBinding(entry) {
  return { remotePath: entry.path, sizeBytes: entry.sizeBytes, gitOid: entry.gitOid,
    lfsSha256: entry.lfs?.sha256 ?? null,
    lfsPointerSize: entry.lfs?.pointerSize ?? null };
}

function buildSourceInventory(search, candidate) {
  const selected = candidate.entries.filter((item) => item.type === "file"
    && !item.path.endsWith(".mp4"));
  const videos = candidate.entries.filter((item) => item.type === "file"
    && item.path.endsWith(".mp4"));
  const inventory = { schema: SO101_HF_INVENTORY_SCHEMA,
    queries: SO101_HF_SEARCH_TERMS.map((term) => ({ term, url: searchUrl(term),
      pages: EXPECTED.searchPages, records: EXPECTED.searchRecords })),
    searchSummary: search,
    admittedCandidate: { datasetId: SO101_HF_ADMITTED_DATASET_ID,
      revision: SO101_HF_ADMITTED_REVISION, treeSummary: candidate.summary,
      selectedNoVideoObjects: selected.map(remoteBinding),
      excludedVideoObjects: videos.map(remoteBinding),
      closureRule: "all repository files except MP4 videos" },
    crossPopulationTotal: null, additionProhibited: true };
  inventory.inventoryHash = so101HfDigest(inventoryCore(inventory),
    `${SO101_HF_INVENTORY_SCHEMA}/inventory`);
  return { inventory, selected };
}

function observedBounds(descriptors) {
  const dates = descriptors.map((item) => item.serverDate)
    .filter((item) => typeof item === "string" && !Number.isNaN(Date.parse(item)))
    .map((item) => new Date(item).toISOString()).sort();
  if (dates.length !== descriptors.length) fail("SERVER_DATE_MISSING");
  return { observedFrom: dates[0], observedThrough: dates.at(-1) };
}

export async function acquireSo101HfExhaustionSource(targetDirectory,
  { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  const target = path.resolve(targetDirectory);
  if (existsSync(target)) fail("SOURCE_TARGET_EXISTS", target);
  mkdirPrivate(path.dirname(target));
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirPrivate(staging);

  const [lowerBefore, upperBefore] = await Promise.all([
    fetchSearchSnapshot(SO101_HF_SEARCH_TERMS[0], "lower", "before", fetchImpl),
    fetchSearchSnapshot(SO101_HF_SEARCH_TERMS[1], "upper", "before", fetchImpl),
  ]);
  if (!same(lowerBefore.records, upperBefore.records)) fail("CASE_VARIANT_UNIVERSE_MISMATCH");
  const candidateBefore = await fetchCandidateSnapshot("before", fetchImpl);
  const { inventory, selected } = buildSourceInventory(lowerBefore.summary, candidateBefore);
  const downloaded = [];
  for (const entry of selected) {
    const bytes = await objectFetch(entry.path, entry.sizeBytes, fetchImpl);
    const fileSha256 = verifyObject(entry, bytes);
    const localPath = `candidate/${entry.path}`;
    writePrivate(path.join(staging, localPath), bytes);
    downloaded.push({ ...remoteBinding(entry), localPath, fileSha256 });
  }
  const candidateAfter = await fetchCandidateSnapshot("after", fetchImpl);
  if (!same(candidateBefore.record, candidateAfter.record)
    || !same(candidateBefore.entries, candidateAfter.entries)) fail("CANDIDATE_BRACKET_CHANGED");
  const [lowerAfter, upperAfter] = await Promise.all([
    fetchSearchSnapshot(SO101_HF_SEARCH_TERMS[0], "lower", "after", fetchImpl),
    fetchSearchSnapshot(SO101_HF_SEARCH_TERMS[1], "upper", "after", fetchImpl),
  ]);
  if (!same(lowerBefore.records, lowerAfter.records)
    || !same(lowerBefore.records, upperAfter.records)) fail("SEARCH_BRACKET_CHANGED");

  const supportRecords = [
    ...lowerBefore.support, ...upperBefore.support, ...candidateBefore.support,
    ...candidateAfter.support, ...lowerAfter.support, ...upperAfter.support,
  ];
  for (const item of supportRecords) {
    writePrivate(path.join(staging, item.relativePath), item.fetched.bytes);
  }
  const inventoryBytes = canonicalBytes(inventory);
  writePrivate(path.join(staging, "source-inventory.json"), inventoryBytes);
  const sourceSupportObjects = supportRecords.map((item) =>
    supportDescriptor(item.relativePath, item.fetched));
  const bounds = observedBounds(sourceSupportObjects);
  const sourceRoot = so101HfDigest({ sourceSupportObjects, selectedObjects: downloaded,
    inventoryFileSha256: so101HfSha256(inventoryBytes),
    inventoryHash: inventory.inventoryHash }, `${SO101_HF_SOURCE_SCHEMA}/source-root`);
  const manifest = { schema: SO101_HF_SOURCE_SCHEMA, ...bounds,
    declaredSearch: { provider: "Hugging Face official datasets API",
      queries: inventory.queries, caseVariantsEquivalent: true,
      searchProjectionHash: lowerBefore.summary.projectionHash,
      declaredScopeExhausted: true, globalExhaustion: false },
    admittedCandidate: { before: candidateBefore.record, after: candidateAfter.record,
      treeBefore: candidateBefore.summary, treeAfter: candidateAfter.summary,
      selectionRule: "highest-value uncovered public+ungated candidate under 300 MB with a complete no-video closure and a source-native priority field",
      selectedNoVideoFiles: EXPECTED.selectedFiles,
      selectedNoVideoBytes: EXPECTED.selectedBytes,
      excludedVideoFiles: EXPECTED.excludedVideoFiles,
      excludedVideoBytes: EXPECTED.excludedVideoBytes },
    rights: { publisherLicenseClaim: "Apache-2.0", licenseFilePresent: false,
      useSpecificLegalClearanceEstablished: false,
      productionTrainingAuthorizedByOutsider: false },
    privacy: { videosExcluded: true, noPiiGuaranteed: false,
      videoPrivacyReviewPerformed: false },
    inventory: { path: "source-inventory.json", sizeBytes: inventoryBytes.length,
      fileSha256: so101HfSha256(inventoryBytes), inventoryHash: inventory.inventoryHash },
    sourceSupportObjects, selectedObjects: downloaded, sourceRoot };
  manifest.manifestHash = so101HfDigest(manifestCore(manifest),
    `${SO101_HF_SOURCE_SCHEMA}/manifest`);
  writePrivate(path.join(staging, "source-manifest.json"), canonicalBytes(manifest));
  renameSync(staging, target);
  chmodSync(target, 0o700);
  const verified = verifySo101HfExhaustionSource(target);
  if (!verified.ok) fail("SOURCE_PUBLICATION_INVALID", verified.error);
  return verified;
}

function readPrivate(file, expectedBytes = null) {
  const descriptor = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600
      || expectedBytes !== null && stat.size !== expectedBytes) fail("FILE_INVALID", file);
    return readFileSync(descriptor);
  } finally { closeSync(descriptor); }
}

function listFiles(root) {
  const result = [];
  const visit = (directory, prefix = "") => {
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== 0o700) {
      fail("DIRECTORY_UNSAFE", directory);
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const target = path.join(directory, entry.name);
      const child = lstatSync(target);
      if (child.isSymbolicLink()) fail("SYMLINK_FORBIDDEN", relative);
      if (child.isDirectory()) visit(target, relative);
      else {
        if (!child.isFile() || (child.mode & 0o777) !== 0o600) {
          fail("FILE_UNSAFE", relative);
        }
        result.push(relative);
      }
    }
  };
  visit(root);
  return sorted(result);
}

function supportMapFromManifest(root, manifest) {
  if (!Array.isArray(manifest.sourceSupportObjects)
    || manifest.sourceSupportObjects.length !== 44) fail("SUPPORT_COUNT_INVALID");
  const result = new Map();
  for (const item of manifest.sourceSupportObjects) {
    if (!exactObject(item) || typeof item.path !== "string" || result.has(item.path)
      || item.httpStatus !== 200 || !Number.isSafeInteger(item.sizeBytes)
      || !HASH.test(item.sha256 ?? "") || typeof item.source !== "string"
      || typeof item.serverDate !== "string") fail("SUPPORT_DESCRIPTOR_INVALID");
    safeRelative(item.path);
    const bytes = readPrivate(path.join(root, item.path), item.sizeBytes);
    if (so101HfSha256(bytes) !== item.sha256) fail("SUPPORT_HASH_INVALID", item.path);
    result.set(item.path, { descriptor: item, bytes });
  }
  return result;
}

function replaySearchSupport(support, term, key, label) {
  let expectedUrl = searchUrl(term);
  const items = [];
  for (let page = 1; page <= EXPECTED.searchPages; page += 1) {
    const relative = `control/search-${key}-${label}-page-${String(page).padStart(3, "0")}.json`;
    const item = support.get(relative);
    if (!item || item.descriptor.source !== expectedUrl) {
      fail("SAVED_SEARCH_CHAIN_INVALID", relative);
    }
    checkedHfUrl(item.descriptor.source, "SEARCH", term);
    const value = parseJson(item.bytes, "SAVED_SEARCH_JSON_INVALID");
    if (!Array.isArray(value) || value.length !== (page < EXPECTED.searchPages
      ? SEARCH_LIMIT : EXPECTED.searchRecords % SEARCH_LIMIT)) {
      fail("SAVED_SEARCH_PAGE_INVALID", relative);
    }
    items.push(...value);
    if (page < EXPECTED.searchPages) {
      if (typeof item.descriptor.nextUrl !== "string") {
        fail("SAVED_SEARCH_NEXT_MISSING", relative);
      }
      checkedHfUrl(item.descriptor.nextUrl, "SEARCH", term);
      if (!new URL(item.descriptor.nextUrl).searchParams.get("cursor")) {
        fail("SAVED_SEARCH_CURSOR_MISSING", relative);
      }
      expectedUrl = item.descriptor.nextUrl;
    } else if (item.descriptor.nextUrl !== null) fail("SAVED_SEARCH_FINAL_LINK_INVALID");
  }
  const records = projectSearchRecords(items);
  return { records, summary: searchSummary(records) };
}

function replayCandidateSupport(support, label) {
  const recordItem = support.get(`control/candidate-record-${label}.json`);
  const treeItem = support.get(`control/candidate-tree-${label}-page-001.json`);
  if (!recordItem || !treeItem || recordItem.descriptor.source !== ADMITTED_RECORD_URL
    || treeItem.descriptor.source !== ADMITTED_TREE_URL
    || treeItem.descriptor.nextUrl !== null) fail("SAVED_CANDIDATE_CONTROL_INVALID");
  const record = candidateRecordProjection(parseJson(recordItem.bytes,
    "SAVED_CANDIDATE_RECORD_INVALID"));
  const entries = normalizeTree(parseJson(treeItem.bytes, "SAVED_CANDIDATE_TREE_INVALID"));
  return { record, entries, summary: candidateTreeSummary(entries) };
}

export function verifySo101HfExhaustionSource(sourceDirectory) {
  try {
    const root = path.resolve(sourceDirectory);
    const rootStat = lstatSync(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
      || (rootStat.mode & 0o777) !== 0o700) fail("SOURCE_ROOT_UNSAFE");
    const manifestBytes = readPrivate(path.join(root, "source-manifest.json"));
    const manifest = parseJson(manifestBytes, "MANIFEST_JSON_INVALID");
    if (!exactObject(manifest) || manifest.schema !== SO101_HF_SOURCE_SCHEMA
      || typeof manifest.observedFrom !== "string"
      || typeof manifest.observedThrough !== "string"
      || Date.parse(manifest.observedFrom) > Date.parse(manifest.observedThrough)
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")
      || manifest.manifestHash !== so101HfDigest(manifestCore(manifest),
        `${SO101_HF_SOURCE_SCHEMA}/manifest`)) fail("MANIFEST_INVALID");
    const support = supportMapFromManifest(root, manifest);
    const lowerBefore = replaySearchSupport(support, "so101", "lower", "before");
    const upperBefore = replaySearchSupport(support, "SO-101", "upper", "before");
    const lowerAfter = replaySearchSupport(support, "so101", "lower", "after");
    const upperAfter = replaySearchSupport(support, "SO-101", "upper", "after");
    if (!same(lowerBefore.records, upperBefore.records)
      || !same(lowerBefore.records, lowerAfter.records)
      || !same(lowerBefore.records, upperAfter.records)) fail("SAVED_SEARCH_BRACKET_INVALID");
    const candidateBefore = replayCandidateSupport(support, "before");
    const candidateAfter = replayCandidateSupport(support, "after");
    if (!same(candidateBefore, candidateAfter)) fail("SAVED_CANDIDATE_BRACKET_INVALID");

    const inventoryBytes = readPrivate(path.join(root, "source-inventory.json"));
    const inventory = parseJson(inventoryBytes, "INVENTORY_JSON_INVALID");
    const rebuilt = buildSourceInventory(lowerBefore.summary, candidateBefore).inventory;
    if (!same(inventory, rebuilt) || inventory.schema !== SO101_HF_INVENTORY_SCHEMA
      || inventory.inventoryHash !== so101HfDigest(inventoryCore(inventory),
        `${SO101_HF_INVENTORY_SCHEMA}/inventory`)
      || manifest.inventory?.path !== "source-inventory.json"
      || manifest.inventory?.sizeBytes !== inventoryBytes.length
      || manifest.inventory?.fileSha256 !== so101HfSha256(inventoryBytes)
      || manifest.inventory?.inventoryHash !== inventory.inventoryHash) {
      fail("INVENTORY_INVALID");
    }
    if (manifest.declaredSearch?.provider !== "Hugging Face official datasets API"
      || !same(manifest.declaredSearch?.queries, inventory.queries)
      || manifest.declaredSearch?.caseVariantsEquivalent !== true
      || manifest.declaredSearch?.searchProjectionHash
        !== lowerBefore.summary.projectionHash
      || manifest.declaredSearch?.declaredScopeExhausted !== true
      || manifest.declaredSearch?.globalExhaustion !== false
      || manifest.admittedCandidate?.before?.datasetId !== SO101_HF_ADMITTED_DATASET_ID
      || manifest.admittedCandidate?.before?.revision !== SO101_HF_ADMITTED_REVISION
      || !same(manifest.admittedCandidate?.before, candidateBefore.record)
      || !same(manifest.admittedCandidate?.after, candidateAfter.record)
      || !same(manifest.admittedCandidate?.treeBefore, candidateBefore.summary)
      || !same(manifest.admittedCandidate?.treeAfter, candidateAfter.summary)
      || manifest.admittedCandidate?.selectedNoVideoFiles !== EXPECTED.selectedFiles
      || manifest.admittedCandidate?.selectedNoVideoBytes !== EXPECTED.selectedBytes
      || manifest.admittedCandidate?.excludedVideoFiles !== EXPECTED.excludedVideoFiles
      || manifest.admittedCandidate?.excludedVideoBytes !== EXPECTED.excludedVideoBytes
      || manifest.rights?.publisherLicenseClaim !== "Apache-2.0"
      || manifest.rights?.licenseFilePresent !== false
      || manifest.rights?.useSpecificLegalClearanceEstablished !== false
      || manifest.rights?.productionTrainingAuthorizedByOutsider !== false
      || manifest.privacy?.videosExcluded !== true
      || manifest.privacy?.noPiiGuaranteed !== false) fail("MANIFEST_BOUNDARY_INVALID");

    const selected = candidateBefore.entries.filter((item) => item.type === "file"
      && !item.path.endsWith(".mp4"));
    if (!Array.isArray(manifest.selectedObjects)
      || manifest.selectedObjects.length !== selected.length) fail("SELECTED_COUNT_INVALID");
    for (let index = 0; index < selected.length; index += 1) {
      const expected = selected[index];
      const declared = manifest.selectedObjects[index];
      const localPath = `candidate/${expected.path}`;
      if (declared.remotePath !== expected.path || declared.localPath !== localPath
        || declared.sizeBytes !== expected.sizeBytes || declared.gitOid !== expected.gitOid
        || declared.lfsSha256 !== (expected.lfs?.sha256 ?? null)
        || declared.lfsPointerSize !== (expected.lfs?.pointerSize ?? null)
        || !HASH.test(declared.fileSha256 ?? "")) fail("SELECTED_BINDING_INVALID");
      const bytes = readPrivate(path.join(root, localPath), expected.sizeBytes);
      if (verifyObject(expected, bytes) !== declared.fileSha256) {
        fail("SELECTED_OBJECT_HASH_INVALID", expected.path);
      }
    }
    const expectedFiles = sorted(["source-manifest.json", "source-inventory.json",
      ...manifest.sourceSupportObjects.map((item) => item.path),
      ...manifest.selectedObjects.map((item) => item.localPath)]);
    if (!same(listFiles(root), expectedFiles)) fail("SOURCE_FILE_SET_INVALID");
    const sourceRoot = so101HfDigest({ sourceSupportObjects: manifest.sourceSupportObjects,
      selectedObjects: manifest.selectedObjects,
      inventoryFileSha256: so101HfSha256(inventoryBytes),
      inventoryHash: inventory.inventoryHash }, `${SO101_HF_SOURCE_SCHEMA}/source-root`);
    if (sourceRoot !== manifest.sourceRoot) fail("SOURCE_ROOT_INVALID");
    const readme = readPrivate(path.join(root, "candidate/README.md")).toString("utf8");
    const info = parseJson(readPrivate(path.join(root, "candidate/meta/info.json")),
      "CANDIDATE_INFO_INVALID");
    if (!readme.includes("license: apache-2.0")
      || info.robot_type !== "so101_follower" || info.total_episodes !== EXPECTED.episodes
      || info.total_frames !== EXPECTED.frames || info.total_tasks !== EXPECTED.tasks
      || info.fps !== EXPECTED.fps || info.features?.["next.reward"]?.dtype !== "float32"
      || Object.hasOwn(info.features, "next.done")
      || Object.hasOwn(info.features, "is_intervention")) fail("CANDIDATE_SEMANTICS_CHANGED");
    return { ok: true, verificationLevel: "FULL_QUERY_AND_SELECTED_SOURCE_REPLAY",
      sourceDirectory: root, manifest, inventory, sourceRoot,
      manifestFileSha256: so101HfSha256(manifestBytes),
      searchRecords: lowerBefore.records, searchSummary: lowerBefore.summary,
      candidate: candidateBefore };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYARROW_REPLAY = String.raw`
import json
import math
import os
import struct
import sys
import pyarrow as pa
import pyarrow.parquet as pq

root = os.path.join(sys.argv[1], "candidate")

def load_json(relative):
    with open(os.path.join(root, relative), "rb") as handle:
        return json.loads(handle.read().decode("utf-8"))

def f32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]

info = load_json("meta/info.json")
stats = load_json("meta/stats.json")
expected_features = ["action", "episode_index", "frame_index", "index", "next.reward",
                     "observation.images.overhead", "observation.images.top",
                     "observation.images.wrist", "observation.state", "task_index",
                     "timestamp"]
if (info.get("codebase_version") != "v3.0" or info.get("robot_type") != "so101_follower"
        or info.get("total_episodes") != 50 or info.get("total_frames") != 45273
        or info.get("total_tasks") != 1 or info.get("fps") != 30
        or sorted(info.get("features", {}).keys()) != expected_features
        or info["features"]["next.reward"] != {"dtype": "float32", "shape": [1], "names": None}
        or "next.done" in info["features"] or "is_intervention" in info["features"]):
    raise RuntimeError("SO101_HF_REPLAY_INFO_INVALID")

data = pq.read_table(os.path.join(root, "data/chunk-000/file-000.parquet"))
expected_columns = ["observation.state", "action", "timestamp", "frame_index",
                    "episode_index", "index", "task_index", "next.reward"]
if data.column_names != expected_columns or data.num_rows != 45273:
    raise RuntimeError("SO101_HF_REPLAY_DATA_PROFILE_INVALID")

episodes = pq.read_table(os.path.join(root, "meta/episodes/chunk-000/file-000.parquet"))
tasks = pq.read_table(os.path.join(root, "meta/tasks.parquet"))
if episodes.num_rows != 50 or tasks.num_rows != 1 or tasks.column_names != ["task_index", "task"]:
    raise RuntimeError("SO101_HF_REPLAY_META_PROFILE_INVALID")
task_rows = tasks.to_pylist()
if task_rows != [{"task_index": 0, "task": "pick up green cube"}]:
    raise RuntimeError("SO101_HF_REPLAY_TASK_INVALID")

episode_rows = episodes.select(["episode_index", "tasks", "length", "data/chunk_index",
    "data/file_index", "dataset_from_index", "dataset_to_index"]).to_pylist()
if ([row["episode_index"] for row in episode_rows] != list(range(50))
        or sum(row["length"] for row in episode_rows) != 45273
        or any(row["tasks"] != ["pick up green cube"] or row["data/chunk_index"] != 0
               or row["data/file_index"] != 0 for row in episode_rows)):
    raise RuntimeError("SO101_HF_REPLAY_EPISODE_META_INVALID")
cursor = 0
for row in episode_rows:
    if row["dataset_from_index"] != cursor or row["dataset_to_index"] != cursor + row["length"]:
        raise RuntimeError("SO101_HF_REPLAY_EPISODE_RANGE_INVALID")
    cursor = row["dataset_to_index"]
if cursor != 45273:
    raise RuntimeError("SO101_HF_REPLAY_EPISODE_CLOSURE_INVALID")

rows = data.to_pylist()
null_values = sum(data[name].null_count for name in expected_columns)
nonfinite_values = 0
timestamp_exact_rows = 0
reward_values = []
for index, row in enumerate(rows):
    if row["index"] != index or row["task_index"] != 0:
        raise RuntimeError("SO101_HF_REPLAY_GLOBAL_PROVENANCE_INVALID")
    if len(row["action"]) != 6 or len(row["observation.state"]) != 6:
        raise RuntimeError("SO101_HF_REPLAY_VECTOR_WIDTH_INVALID")
    for value in row["action"] + row["observation.state"] + [row["next.reward"]]:
        if not math.isfinite(value):
            nonfinite_values += 1
    reward_values.append(row["next.reward"])

episode_profiles = []
for episode in episode_rows:
    start = episode["dataset_from_index"]
    stop = episode["dataset_to_index"]
    values = reward_values[start:stop]
    for local, row in enumerate(rows[start:stop]):
        if row["episode_index"] != episode["episode_index"] or row["frame_index"] != local:
            raise RuntimeError("SO101_HF_REPLAY_EPISODE_PROVENANCE_INVALID")
        if row["timestamp"] != f32(local / 30.0):
            raise RuntimeError("SO101_HF_REPLAY_TIMESTAMP_INVALID")
        timestamp_exact_rows += 1
    episode_profiles.append({
        "episodeIndex": episode["episode_index"], "frames": episode["length"],
        "rewardMin": min(values), "rewardMax": max(values),
        "rewardFirst": values[0], "rewardLast": values[-1],
        "rewardPositiveRows": sum(value > 0 for value in values),
        "rewardNegativeRows": sum(value < 0 for value in values),
        "rewardZeroRows": sum(value == 0 for value in values),
    })

reward = {
    "rows": len(reward_values), "minimum": min(reward_values), "maximum": max(reward_values),
    "positiveRows": sum(value > 0 for value in reward_values),
    "negativeRows": sum(value < 0 for value in reward_values),
    "zeroRows": sum(value == 0 for value in reward_values),
    "uniqueFloat32BitPatterns": len({struct.pack("<f", value) for value in reward_values}),
    "episodesWithAnyPositive": sum(item["rewardPositiveRows"] > 0 for item in episode_profiles),
    "episodesWithAnyNegative": sum(item["rewardNegativeRows"] > 0 for item in episode_profiles),
    "episodesWithAnyZero": sum(item["rewardZeroRows"] > 0 for item in episode_profiles),
    "terminalPositiveEpisodes": sum(item["rewardLast"] > 0 for item in episode_profiles),
    "terminalNegativeEpisodes": sum(item["rewardLast"] < 0 for item in episode_profiles),
    "terminalZeroEpisodes": sum(item["rewardLast"] == 0 for item in episode_profiles),
}

result = {
    "parser": {"engine": "python-pyarrow", "pythonVersion": sys.version.split()[0],
               "pyarrowVersion": pa.__version__},
    "info": {"codebaseVersion": info["codebase_version"], "robotType": info["robot_type"],
             "episodes": info["total_episodes"], "frames": info["total_frames"],
             "tasks": info["total_tasks"], "fps": info["fps"],
             "featureNames": sorted(info["features"].keys()),
             "nextDonePresent": "next.done" in info["features"],
             "isInterventionPresent": "is_intervention" in info["features"]},
    "data": {"files": 1, "rows": data.num_rows, "columns": data.column_names,
             "schema": str(data.schema.remove_metadata()), "nullValues": null_values,
             "nonfiniteActionStateRewardValues": nonfinite_values,
             "timestampExactRows": timestamp_exact_rows,
             "actionWidth": 6, "stateWidth": 6},
    "metadata": {"episodeFiles": 1, "episodeRows": episodes.num_rows,
                 "taskRows": tasks.num_rows, "task": "pick up green cube",
                 "episodeLengthMin": min(row["length"] for row in episode_rows),
                 "episodeLengthMax": max(row["length"] for row in episode_rows),
                 "statsTopLevelKeys": sorted(stats.keys())},
    "reward": reward,
    "episodeProfiles": episode_profiles,
}
print(json.dumps(result, sort_keys=True, separators=(",", ":"), allow_nan=False))
`;

function runCandidateReplay(sourceDirectory) {
  const python = process.env.OUTSIDER_PYTHON ?? path.resolve(".venv/bin/python");
  const result = spawnSync(python, ["-c", PYARROW_REPLAY, sourceDirectory], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 180_000,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONNOUSERSITE: "1" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("PYARROW_REPLAY_FAILED", String(result.stderr || result.error?.message));
  }
  const replay = parseJson(Buffer.from(result.stdout, "utf8"), "PYARROW_OUTPUT_INVALID");
  const reward = replay.reward;
  if (!exactObject(replay) || replay.info?.episodes !== EXPECTED.episodes
    || replay.info?.frames !== EXPECTED.frames || replay.info?.tasks !== EXPECTED.tasks
    || replay.info?.fps !== EXPECTED.fps || replay.info?.robotType !== "so101_follower"
    || replay.info?.nextDonePresent !== false || replay.info?.isInterventionPresent !== false
    || replay.data?.rows !== EXPECTED.frames || replay.data?.files !== 1
    || replay.data?.nullValues !== 0
    || replay.data?.nonfiniteActionStateRewardValues !== 0
    || replay.data?.timestampExactRows !== EXPECTED.frames
    || replay.data?.actionWidth !== 6 || replay.data?.stateWidth !== 6
    || replay.metadata?.episodeRows !== EXPECTED.episodes
    || replay.metadata?.taskRows !== EXPECTED.tasks
    || replay.metadata?.task !== "pick up green cube"
    || replay.metadata?.episodeLengthMin !== 827
    || replay.metadata?.episodeLengthMax !== 910
    || reward?.rows !== EXPECTED.frames
    || reward?.minimum !== -0.014086723327636719
    || reward?.maximum !== 0.012749433517456055
    || reward?.positiveRows !== 25_466 || reward?.negativeRows !== 19_757
    || reward?.zeroRows !== 50 || reward?.uniqueFloat32BitPatterns !== 3_200
    || reward?.episodesWithAnyPositive !== 50 || reward?.episodesWithAnyNegative !== 50
    || reward?.episodesWithAnyZero !== 50 || reward?.terminalPositiveEpisodes !== 0
    || reward?.terminalNegativeEpisodes !== 0 || reward?.terminalZeroEpisodes !== 50
    || replay.episodeProfiles?.length !== EXPECTED.episodes) fail("PYARROW_PROFILE_INVALID");
  return replay;
}

function prioritySignals(record) {
  const text = canonicalizeStrict({ id: record.id, tags: record.tags,
    cardData: record.cardData, description: record.description });
  return PRIORITY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

function publisherLicense(record) {
  if (typeof record.cardData?.license === "string") return record.cardData.license;
  const tag = record.tags.find((item) => item.startsWith("license:"));
  return tag ? tag.slice("license:".length) : null;
}

function candidateDisposition(record, signals, covered) {
  if (record.private || record.gated !== false) {
    return { status: "REJECTED", code: "NOT_PUBLIC_UNGATED", terminal: true,
      reason: "the official search record is gated or private",
      gates: [record.private ? "PRIVATE" : "PUBLIC", `GATED_${String(record.gated).toUpperCase()}`] };
  }
  if (covered.has(record.id)) {
    return { status: "REJECTED", code: "ALREADY_COVERED", terminal: true,
      reason: "an existing Outsider source artifact already covers this dataset family",
      gates: ["PUBLIC", "UNGATED", "EXISTING_ARTIFACT_COVERAGE"] };
  }
  if (record.id === SO101_HF_ADMITTED_DATASET_ID) {
    return { status: "ADMITTED", code: "SELECTED_COMPLETE_NO_VIDEO_REWARD_CLOSURE",
      terminal: true,
      reason: "selected under the one-source budget after exact tree and field replay",
      gates: ["PUBLIC", "UNGATED", "UNCOVERED", "APACHE_2_0_CARD_CLAIM",
        "SO101_FOLLOWER_METADATA", "SOURCE_NATIVE_NEXT_REWARD",
        "COMPLETE_NO_VIDEO_CLOSURE_LE_300MB"] };
  }
  if (signals.length > 0) {
    return { status: "REJECTED", code: "ONE_SOURCE_BUDGET_FILLED", terminal: true,
      reason: "priority signal observed, but this declared census admits only the single fully replayed source",
      gates: ["PUBLIC", "UNGATED", "UNCOVERED", "PRIORITY_SIGNAL_IN_SEARCH_METADATA",
        "NOT_SELECTED_FOR_THIS_ONE_SOURCE_SLICE"] };
  }
  return { status: "REJECTED", code: "OUTSIDE_DECLARED_PRIORITY_FILTER", terminal: true,
    reason: "official search metadata exposes no declared intervention/reward/done/failure/retry/mechanical priority signal",
    gates: ["PUBLIC", "UNGATED", "UNCOVERED", "NO_DECLARED_PRIORITY_SIGNAL"] };
}

function buildCandidateLedger(records) {
  const covered = new Set(SO101_HF_COVERED_DATASET_IDS);
  const entries = records.map((record) => {
    const signals = prioritySignals(record);
    return { datasetId: record.id, observedRevision: record.revision,
      lastModified: record.lastModified,
      access: { private: record.private, gated: record.gated, disabled: record.disabled },
      publisherLicenseClaim: publisherLicense(record), prioritySignals: signals,
      disposition: candidateDisposition(record, signals, covered) };
  });
  const countsByCode = {};
  for (const entry of entries) {
    const code = entry.disposition.code;
    countsByCode[code] = (countsByCode[code] ?? 0) + 1;
  }
  const present = sorted(entries.filter((item) => covered.has(item.datasetId))
    .map((item) => item.datasetId));
  const absent = SO101_HF_COVERED_DATASET_IDS.filter((item) => !present.includes(item));
  return { entries, countsByCode,
    prioritySignalCandidates: entries.filter((item) => item.prioritySignals.length > 0).length,
    terminalEntries: entries.filter((item) => TERMINAL_STATUSES.has(
      item.disposition.status) && item.disposition.terminal === true).length,
    coveredRequestedIdsPresent: present, coveredRequestedIdsAbsent: absent,
    ledgerHash: so101HfDigest(entries, `${SO101_HF_LEDGER_SCHEMA}/candidate-ledger`) };
}

function reportCore(report) {
  const copy = structuredClone(report);
  delete copy.artifactHash;
  return copy;
}

export function buildSo101HfExhaustionReportFromSource(sourceDirectory) {
  const checked = verifySo101HfExhaustionSource(sourceDirectory);
  if (!checked.ok) fail("SOURCE_INVALID", checked.error);
  const replay = runCandidateReplay(checked.sourceDirectory);
  const ledger = buildCandidateLedger(checked.searchRecords);
  const report = { schema: SO101_HF_LEDGER_SCHEMA,
    generatedAt: checked.manifest.observedThrough,
    source: { sourceRoot: checked.sourceRoot,
      sourceManifestHash: checked.manifest.manifestHash,
      sourceManifestFileSha256: checked.manifestFileSha256,
      inventoryHash: checked.inventory.inventoryHash,
      observedFrom: checked.manifest.observedFrom,
      observedThrough: checked.manifest.observedThrough,
      provider: "Hugging Face official datasets API",
      completeRawSearchPagesPreserved: true,
      completeSelectedNoVideoSourcePreserved: true },
    discovery: {
      declaredScope: { scopeId: "HF_DATASET_SEARCH_SO101_CASE_VARIANTS_20260829",
        exactQueries: SO101_HF_SEARCH_TERMS.map((term) => ({ term, url: searchUrl(term),
          limit: SEARCH_LIMIT, full: true, pages: EXPECTED.searchPages })),
        caseVariantsEquivalent: true, deduplicatedCandidateRecords: EXPECTED.searchRecords,
        cutoffObservedThrough: checked.manifest.observedThrough,
        externalDiscoveryPerformed: true },
      declaredScopeExhausted: true, globalExhaustion: false,
      sourceUniverseExhausted: false,
      terminalDispositionRequiredForEveryDeclaredCandidate: true,
      candidateRecords: EXPECTED.searchRecords,
      terminalCandidateRecords: ledger.terminalEntries,
      prioritySignalCandidates: ledger.prioritySignalCandidates,
      countsByDispositionCode: ledger.countsByCode,
      searchAccessCounts: { private: EXPECTED.privateRecords,
        publicUngated: EXPECTED.publicUngated, gatedAuto: EXPECTED.gatedAuto,
        gatedManual: EXPECTED.gatedManual, disabled: EXPECTED.disabledRecords },
      searchProjectionHash: checked.searchSummary.projectionHash,
      dispositionPolicy: {
        prioritySignals: PRIORITY_PATTERNS.map(([name]) => name),
        admittedSourceBudget: 1,
        coveredDatasetIdsDeclared: SO101_HF_COVERED_DATASET_IDS,
        coveredDatasetIdsPresentInSearch: ledger.coveredRequestedIdsPresent,
        coveredDatasetIdsAbsentFromSearch: ledger.coveredRequestedIdsAbsent,
        noClaimThatRejectedCandidatesAreGloballyWorthless: true,
        rejectionIsTerminalOnlyForThisDeclaredOneSourceSlice: true },
    },
    candidateLedger: { unit: "HF_SEARCH_CANDIDATE_RECORD", entries: ledger.entries,
      ledgerHash: ledger.ledgerHash, crossCandidateTotal: EXPECTED.searchRecords },
    selectedSource: { datasetId: SO101_HF_ADMITTED_DATASET_ID,
      pinnedRevision: SO101_HF_ADMITTED_REVISION,
      selectionStatus: "ADMITTED",
      closureRule: "all repository files except MP4 videos",
      completeRepositoryTreeEnumerated: true,
      selectedNoVideoFiles: EXPECTED.selectedFiles,
      selectedNoVideoBytes: EXPECTED.selectedBytes,
      excludedVideoFiles: EXPECTED.excludedVideoFiles,
      excludedVideoBytes: EXPECTED.excludedVideoBytes,
      sourceNativePriorityFields: ["next.reward"],
      absentPriorityFields: ["is_intervention", "next.done"],
      sourceNativeRewardSemanticsDocumented: false,
      whySelected: "largest fully replayed uncovered Apache-2.0-card SO-101 reward closure found under the declared one-source budget" },
    denominators: {
      hfSearchCandidateRecords: { units: EXPECTED.searchRecords,
        unit: "HF_SEARCH_CANDIDATE_RECORD" },
      admittedSourceEpisodes: { units: EXPECTED.episodes,
        unit: "SOURCE_NATIVE_LEROBOT_EPISODE", task: "pick up green cube" },
      admittedStateActionFrames: { units: EXPECTED.frames,
        unit: "STATE_ACTION_FRAME" },
      publisherRewardRows: { units: EXPECTED.frames,
        unit: "PUBLISHER_NEXT_REWARD_ROW" },
      excludedVideoObjects: { units: EXPECTED.excludedVideoFiles,
        unit: "MP4_OBJECT", bytes: EXPECTED.excludedVideoBytes, replayed: false },
      completeAttemptCensus: { units: 0, established: false },
      crossPopulationTotal: null, additionProhibited: true },
    observations: {
      selectedSourceReplay: replay,
      rewardSemantics: { field: "next.reward", dtype: "float32",
        sourceNative: true, continuousSignedValuesObserved: true,
        everyEpisodeTerminalRowIsZero: true,
        publisherDefinitionBeyondFieldNamePresent: false,
        binarySuccessOrFailureLabelEstablished: false,
        independentOutcomeEstablished: false },
      videoInventory: { cameraStreamsDeclared: ["observation.images.overhead",
        "observation.images.top", "observation.images.wrist"],
        files: EXPECTED.excludedVideoFiles, bytes: EXPECTED.excludedVideoBytes,
        contentDownloadedOrReplayed: false },
    },
    segments: {
      opportunityCensus: { units: 0, prospective: false },
      delegationAuthorization: { units: 0, established: false },
      action: { episodeUnits: EXPECTED.episodes, frameUnits: EXPECTED.frames,
        stateActionTelemetryPresent: true },
      effect: { publisherRewardRows: EXPECTED.frames,
        independentPhysicalEffectUnits: 0 },
      outcome: { independentUnits: 0, publisherVerifiedSuccessUnits: 0,
        publisherVerifiedFailureUnits: 0 },
      recovery: { units: 0, verifiedRecoveryEffectUnits: 0 },
      longitudinal: { units: 0 }, attributionAdditionProhibited: true },
    truthBoundary: {
      completeDeclaredHfSearchQueryUniverseEstablished: true,
      globalSourceUniverseExhaustionEstablished: false,
      completeSelectedNoVideoEpisodeClosureEstablished: true,
      publisherNextRewardFieldEstablished: true,
      nextRewardMeaningIndependentlyAdjudicatedOutcome: false,
      successfulTaskOutcomeEstablished: false,
      failureOutcomeEstablished: false,
      interventionEstablished: false,
      retryOrRecoveryChainEstablished: false,
      independentWitnessEstablished: false,
      completeAttemptCensusEstablished: false,
      delegationOrAuthorityEstablished: false },
    rights: { publisherLicenseClaim: "Apache-2.0", licenseFilePresent: false,
      useSpecificLegalClearanceEstablished: false,
      productionTrainingAuthorizedByOutsider: false },
    privacy: { noPiiGuaranteed: false, videosExcluded: true,
      videoPrivacyReviewPerformed: false },
    useBoundary: { status: "QUARANTINE_EVAL_ONLY",
      offlineEvaluationRows: EXPECTED.frames, offlineModelFittingRows: 0,
      authorizedTrainingRows: 0, governedTrainingRows: 0,
      trainingPerformed: false },
    network: { rawNetworkAdmissionRows: 0, networkAdmissionRows: 0 },
    economics: { CEU: 0, pricingUnits: 0 },
    authority: { executionAuthorityUnits: 0, executionAuthorityEstablished: false },
    rankedGaps: [
      "publisher documentation for the numerical next.reward construction and units",
      "source-native is_intervention and next.done fields",
      "independent physical outcome and success/failure adjudication",
      "prospective opportunity and complete attempt census",
      "retry/recovery linkage and longitudinal follow-up",
      "use-specific rights/privacy clearance and delegation authority",
    ],
    verification: { level: "FULL_QUERY_AND_SELECTED_SOURCE_REDERIVED",
      pyarrowHelperSha256: so101HfSha256(Buffer.from(PYARROW_REPLAY, "utf8")) } };
  report.artifactHash = so101HfDigest(reportCore(report),
    `${SO101_HF_LEDGER_SCHEMA}/artifact`);
  const verified = verifySo101HfExhaustionReport(report);
  if (!verified.ok) fail("BUILT_REPORT_INVALID", verified.error);
  return report;
}

function expectedDispositionForEntry(entry) {
  const covered = new Set(SO101_HF_COVERED_DATASET_IDS);
  if (entry.access.private || entry.access.gated !== false) return "NOT_PUBLIC_UNGATED";
  if (covered.has(entry.datasetId)) return "ALREADY_COVERED";
  if (entry.datasetId === SO101_HF_ADMITTED_DATASET_ID) {
    return "SELECTED_COMPLETE_NO_VIDEO_REWARD_CLOSURE";
  }
  return entry.prioritySignals.length > 0
    ? "ONE_SOURCE_BUDGET_FILLED" : "OUTSIDE_DECLARED_PRIORITY_FILTER";
}

export function verifySo101HfExhaustionReport(report) {
  try {
    if (!exactObject(report) || report.schema !== SO101_HF_LEDGER_SCHEMA
      || typeof report.generatedAt !== "string" || Number.isNaN(Date.parse(report.generatedAt))
      || !HASH.test(report.artifactHash ?? "")
      || report.artifactHash !== so101HfDigest(reportCore(report),
        `${SO101_HF_LEDGER_SCHEMA}/artifact`)) fail("REPORT_HASH_INVALID");
    if (!HASH.test(report.source?.sourceRoot ?? "")
      || !HASH.test(report.source?.sourceManifestHash ?? "")
      || !HASH.test(report.source?.sourceManifestFileSha256 ?? "")
      || !HASH.test(report.source?.inventoryHash ?? "")
      || report.source?.provider !== "Hugging Face official datasets API"
      || report.source?.completeRawSearchPagesPreserved !== true
      || report.source?.completeSelectedNoVideoSourcePreserved !== true
      || report.generatedAt !== report.source?.observedThrough) fail("REPORT_SOURCE_INVALID");
    const discovery = report.discovery;
    if (discovery?.declaredScope?.scopeId
        !== "HF_DATASET_SEARCH_SO101_CASE_VARIANTS_20260829"
      || discovery?.declaredScope?.exactQueries?.length !== 2
      || !same(discovery.declaredScope.exactQueries.map((item) => item.term),
        SO101_HF_SEARCH_TERMS)
      || discovery.declaredScope.caseVariantsEquivalent !== true
      || discovery.declaredScope.deduplicatedCandidateRecords !== EXPECTED.searchRecords
      || discovery.declaredScope.externalDiscoveryPerformed !== true
      || discovery.declaredScopeExhausted !== true || discovery.globalExhaustion !== false
      || discovery.sourceUniverseExhausted !== false
      || discovery.terminalDispositionRequiredForEveryDeclaredCandidate !== true
      || discovery.candidateRecords !== EXPECTED.searchRecords
      || discovery.terminalCandidateRecords !== EXPECTED.searchRecords
      || discovery.prioritySignalCandidates !== EXPECTED.prioritySignalCandidates
      || !same(discovery.countsByDispositionCode, {
        OUTSIDE_DECLARED_PRIORITY_FILTER: EXPECTED.dispositionOutsidePriority,
        NOT_PUBLIC_UNGATED: EXPECTED.dispositionNotPublicUngated,
        ONE_SOURCE_BUDGET_FILLED: EXPECTED.dispositionOneSourceBudgetFilled,
        ALREADY_COVERED: EXPECTED.dispositionAlreadyCovered,
        SELECTED_COMPLETE_NO_VIDEO_REWARD_CLOSURE: EXPECTED.dispositionAdmitted,
      })
      || discovery.searchAccessCounts?.private !== EXPECTED.privateRecords
      || discovery.searchAccessCounts?.publicUngated !== EXPECTED.publicUngated
      || discovery.searchAccessCounts?.gatedAuto !== EXPECTED.gatedAuto
      || discovery.searchAccessCounts?.gatedManual !== EXPECTED.gatedManual
      || discovery.searchAccessCounts?.disabled !== EXPECTED.disabledRecords
      || !HASH.test(discovery.searchProjectionHash ?? "")
      || discovery.dispositionPolicy?.admittedSourceBudget !== 1
      || !same(discovery.dispositionPolicy?.coveredDatasetIdsDeclared,
        SO101_HF_COVERED_DATASET_IDS)
      || discovery.dispositionPolicy?.noClaimThatRejectedCandidatesAreGloballyWorthless !== true
      || discovery.dispositionPolicy?.rejectionIsTerminalOnlyForThisDeclaredOneSourceSlice
        !== true) fail("REPORT_DISCOVERY_INVALID");
    const ledger = report.candidateLedger;
    if (ledger?.unit !== "HF_SEARCH_CANDIDATE_RECORD"
      || !Array.isArray(ledger.entries) || ledger.entries.length !== EXPECTED.searchRecords
      || !HASH.test(ledger.ledgerHash ?? "")
      || ledger.ledgerHash !== so101HfDigest(ledger.entries,
        `${SO101_HF_LEDGER_SCHEMA}/candidate-ledger`)
      || ledger.crossCandidateTotal !== EXPECTED.searchRecords
      || new Set(ledger.entries.map((item) => item.datasetId)).size !== EXPECTED.searchRecords
      || !same(ledger.entries.map((item) => item.datasetId),
        sorted(ledger.entries.map((item) => item.datasetId)))) fail("REPORT_LEDGER_INVALID");
    const counts = {};
    let priority = 0;
    let admitted = 0;
    for (const entry of ledger.entries) {
      if (!exactObject(entry) || typeof entry.datasetId !== "string"
        || !(entry.observedRevision === null || SHA1.test(entry.observedRevision ?? ""))
        || !exactObject(entry.access) || !Array.isArray(entry.prioritySignals)
        || entry.prioritySignals.some((item) => !PRIORITY_PATTERNS.some(([name]) => name === item))
        || !exactObject(entry.disposition)
        || !TERMINAL_STATUSES.has(entry.disposition.status)
        || entry.disposition.terminal !== true
        || entry.disposition.code !== expectedDispositionForEntry(entry)) {
        fail("REPORT_LEDGER_ENTRY_INVALID", entry?.datasetId);
      }
      priority += Number(entry.prioritySignals.length > 0);
      admitted += Number(entry.disposition.status === "ADMITTED");
      counts[entry.disposition.code] = (counts[entry.disposition.code] ?? 0) + 1;
    }
    if (admitted !== 1 || priority !== discovery.prioritySignalCandidates
      || !same(counts, discovery.countsByDispositionCode)) fail("REPORT_LEDGER_COUNTS_INVALID");
    const selected = report.selectedSource;
    if (selected?.datasetId !== SO101_HF_ADMITTED_DATASET_ID
      || selected?.pinnedRevision !== SO101_HF_ADMITTED_REVISION
      || selected?.selectionStatus !== "ADMITTED"
      || selected?.closureRule !== "all repository files except MP4 videos"
      || selected?.completeRepositoryTreeEnumerated !== true
      || selected?.selectedNoVideoFiles !== EXPECTED.selectedFiles
      || selected?.selectedNoVideoBytes !== EXPECTED.selectedBytes
      || selected?.excludedVideoFiles !== EXPECTED.excludedVideoFiles
      || selected?.excludedVideoBytes !== EXPECTED.excludedVideoBytes
      || !same(selected?.sourceNativePriorityFields, ["next.reward"])
      || !same(selected?.absentPriorityFields, ["is_intervention", "next.done"])
      || selected?.sourceNativeRewardSemanticsDocumented !== false) {
      fail("REPORT_SELECTED_SOURCE_INVALID");
    }
    const d = report.denominators;
    if (d?.hfSearchCandidateRecords?.units !== EXPECTED.searchRecords
      || d?.hfSearchCandidateRecords?.unit !== "HF_SEARCH_CANDIDATE_RECORD"
      || d?.admittedSourceEpisodes?.units !== EXPECTED.episodes
      || d?.admittedSourceEpisodes?.unit !== "SOURCE_NATIVE_LEROBOT_EPISODE"
      || d?.admittedStateActionFrames?.units !== EXPECTED.frames
      || d?.publisherRewardRows?.units !== EXPECTED.frames
      || d?.excludedVideoObjects?.units !== EXPECTED.excludedVideoFiles
      || d?.excludedVideoObjects?.bytes !== EXPECTED.excludedVideoBytes
      || d?.excludedVideoObjects?.replayed !== false
      || d?.completeAttemptCensus?.units !== 0
      || d?.completeAttemptCensus?.established !== false
      || d?.crossPopulationTotal !== null || d?.additionProhibited !== true) {
      fail("REPORT_DENOMINATOR_INVALID");
    }
    const replay = report.observations?.selectedSourceReplay;
    const reward = replay?.reward;
    if (replay?.info?.episodes !== EXPECTED.episodes || replay?.info?.frames !== EXPECTED.frames
      || replay?.info?.robotType !== "so101_follower"
      || replay?.info?.nextDonePresent !== false
      || replay?.info?.isInterventionPresent !== false
      || replay?.data?.rows !== EXPECTED.frames || replay?.data?.nullValues !== 0
      || replay?.data?.nonfiniteActionStateRewardValues !== 0
      || replay?.data?.timestampExactRows !== EXPECTED.frames
      || reward?.rows !== EXPECTED.frames || reward?.positiveRows !== 25_466
      || reward?.negativeRows !== 19_757 || reward?.zeroRows !== 50
      || reward?.uniqueFloat32BitPatterns !== 3_200
      || reward?.terminalZeroEpisodes !== 50
      || report.observations?.rewardSemantics?.sourceNative !== true
      || report.observations?.rewardSemantics?.publisherDefinitionBeyondFieldNamePresent !== false
      || report.observations?.rewardSemantics?.binarySuccessOrFailureLabelEstablished !== false
      || report.observations?.rewardSemantics?.independentOutcomeEstablished !== false
      || report.observations?.videoInventory?.contentDownloadedOrReplayed !== false) {
      fail("REPORT_OBSERVATION_INVALID");
    }
    const truth = report.truthBoundary;
    if (truth?.completeDeclaredHfSearchQueryUniverseEstablished !== true
      || truth?.globalSourceUniverseExhaustionEstablished !== false
      || truth?.completeSelectedNoVideoEpisodeClosureEstablished !== true
      || truth?.publisherNextRewardFieldEstablished !== true
      || truth?.nextRewardMeaningIndependentlyAdjudicatedOutcome !== false
      || truth?.successfulTaskOutcomeEstablished !== false
      || truth?.failureOutcomeEstablished !== false
      || truth?.interventionEstablished !== false
      || truth?.retryOrRecoveryChainEstablished !== false
      || truth?.independentWitnessEstablished !== false
      || truth?.completeAttemptCensusEstablished !== false
      || truth?.delegationOrAuthorityEstablished !== false
      || report.segments?.opportunityCensus?.units !== 0
      || report.segments?.delegationAuthorization?.units !== 0
      || report.segments?.action?.episodeUnits !== EXPECTED.episodes
      || report.segments?.action?.frameUnits !== EXPECTED.frames
      || report.segments?.effect?.publisherRewardRows !== EXPECTED.frames
      || report.segments?.effect?.independentPhysicalEffectUnits !== 0
      || report.segments?.outcome?.independentUnits !== 0
      || report.segments?.outcome?.publisherVerifiedSuccessUnits !== 0
      || report.segments?.outcome?.publisherVerifiedFailureUnits !== 0
      || report.segments?.recovery?.units !== 0
      || report.segments?.longitudinal?.units !== 0
      || report.segments?.attributionAdditionProhibited !== true) fail("REPORT_TRUTH_INVALID");
    if (report.rights?.publisherLicenseClaim !== "Apache-2.0"
      || report.rights?.licenseFilePresent !== false
      || report.rights?.useSpecificLegalClearanceEstablished !== false
      || report.rights?.productionTrainingAuthorizedByOutsider !== false
      || report.privacy?.noPiiGuaranteed !== false || report.privacy?.videosExcluded !== true
      || report.useBoundary?.status !== "QUARANTINE_EVAL_ONLY"
      || report.useBoundary?.offlineEvaluationRows !== EXPECTED.frames
      || report.useBoundary?.offlineModelFittingRows !== 0
      || report.useBoundary?.authorizedTrainingRows !== 0
      || report.useBoundary?.governedTrainingRows !== 0
      || report.useBoundary?.trainingPerformed !== false
      || report.network?.rawNetworkAdmissionRows !== 0
      || report.network?.networkAdmissionRows !== 0
      || report.economics?.CEU !== 0 || report.economics?.pricingUnits !== 0
      || report.authority?.executionAuthorityUnits !== 0
      || report.authority?.executionAuthorityEstablished !== false
      || report.verification?.level !== "FULL_QUERY_AND_SELECTED_SOURCE_REDERIVED"
      || report.verification?.pyarrowHelperSha256
        !== so101HfSha256(Buffer.from(PYARROW_REPLAY, "utf8"))) fail("REPORT_BOUNDARY_INVALID");
    return { ok: true, artifactHash: report.artifactHash,
      searchCandidateRecords: EXPECTED.searchRecords,
      terminalCandidateRecords: EXPECTED.searchRecords,
      selectedEpisodes: EXPECTED.episodes, selectedFrames: EXPECTED.frames,
      publisherRewardRows: EXPECTED.frames, independentOutcomeUnits: 0,
      recoveryUnits: 0, authorizedTrainingRows: 0, authorityUnits: 0 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifySo101HfExhaustionReportWithSource(report, sourceDirectory) {
  const standalone = verifySo101HfExhaustionReport(report);
  if (!standalone.ok) return standalone;
  const source = verifySo101HfExhaustionSource(sourceDirectory);
  if (!source.ok) return source;
  try {
    if (report.source.sourceRoot !== source.sourceRoot
      || report.source.sourceManifestHash !== source.manifest.manifestHash
      || report.source.sourceManifestFileSha256 !== source.manifestFileSha256
      || report.source.inventoryHash !== source.inventory.inventoryHash
      || report.source.observedFrom !== source.manifest.observedFrom
      || report.source.observedThrough !== source.manifest.observedThrough) {
      fail("REPORT_SOURCE_BINDING_INVALID");
    }
    const rebuilt = buildSo101HfExhaustionReportFromSource(sourceDirectory);
    if (!same(report, rebuilt)) fail("REPORT_SOURCE_REDERIVATION_MISMATCH");
    return { ...standalone, ok: true,
      verificationLevel: "FULL_QUERY_AND_SELECTED_SOURCE_REDERIVED" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function receiptCore(receipt) {
  const copy = structuredClone(receipt);
  delete copy.receiptHash;
  return copy;
}

export function buildSo101HfExhaustionReceipt(report, reportBytes) {
  const checked = verifySo101HfExhaustionReport(report);
  if (!checked.ok || !Buffer.isBuffer(reportBytes)
    || !reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_INPUT_INVALID");
  const receipt = { schema: SO101_HF_RECEIPT_SCHEMA, createdAt: report.generatedAt,
    reportSchema: SO101_HF_LEDGER_SCHEMA, artifactHash: report.artifactHash,
    reportFileSha256: so101HfSha256(reportBytes),
    sourceRoot: report.source.sourceRoot,
    sourceManifestHash: report.source.sourceManifestHash,
    inventoryHash: report.source.inventoryHash,
    candidateLedgerHash: report.candidateLedger.ledgerHash,
    verificationLevel: "FULL_QUERY_AND_SELECTED_SOURCE_REDERIVED",
    closure: { searchQueryVariants: 2, searchPagesPerVariant: EXPECTED.searchPages,
      deduplicatedCandidateRecords: EXPECTED.searchRecords,
      terminalCandidateRecords: EXPECTED.searchRecords,
      declaredScopeExhausted: true, globalExhaustion: false,
      admittedDatasetId: SO101_HF_ADMITTED_DATASET_ID,
      admittedRevision: SO101_HF_ADMITTED_REVISION,
      selectedNoVideoFiles: EXPECTED.selectedFiles,
      selectedNoVideoBytes: EXPECTED.selectedBytes,
      selectedEpisodes: EXPECTED.episodes, selectedFrames: EXPECTED.frames,
      publisherRewardRows: EXPECTED.frames,
      independentOutcomeUnits: 0, recoveryUnits: 0,
      completeAttemptCensusEstablished: false,
      authorizedTrainingRows: 0, networkAdmissionRows: 0,
      CEU: 0, pricingUnits: 0, authorityUnits: 0 } };
  receipt.receiptHash = so101HfDigest(receiptCore(receipt),
    `${SO101_HF_RECEIPT_SCHEMA}/receipt`);
  return receipt;
}

export function verifySo101HfExhaustionReceipt(receipt, report, reportBytes) {
  try {
    if (!exactObject(receipt) || receipt.schema !== SO101_HF_RECEIPT_SCHEMA
      || receipt.createdAt !== report.generatedAt || !HASH.test(receipt.receiptHash ?? "")
      || receipt.receiptHash !== so101HfDigest(receiptCore(receipt),
        `${SO101_HF_RECEIPT_SCHEMA}/receipt`)
      || receipt.reportSchema !== SO101_HF_LEDGER_SCHEMA
      || receipt.artifactHash !== report.artifactHash
      || receipt.reportFileSha256 !== so101HfSha256(reportBytes)
      || receipt.sourceRoot !== report.source.sourceRoot
      || receipt.sourceManifestHash !== report.source.sourceManifestHash
      || receipt.inventoryHash !== report.source.inventoryHash
      || receipt.candidateLedgerHash !== report.candidateLedger.ledgerHash
      || receipt.verificationLevel !== "FULL_QUERY_AND_SELECTED_SOURCE_REDERIVED"
      || receipt.closure?.searchQueryVariants !== 2
      || receipt.closure?.searchPagesPerVariant !== EXPECTED.searchPages
      || receipt.closure?.deduplicatedCandidateRecords !== EXPECTED.searchRecords
      || receipt.closure?.terminalCandidateRecords !== EXPECTED.searchRecords
      || receipt.closure?.declaredScopeExhausted !== true
      || receipt.closure?.globalExhaustion !== false
      || receipt.closure?.admittedDatasetId !== SO101_HF_ADMITTED_DATASET_ID
      || receipt.closure?.admittedRevision !== SO101_HF_ADMITTED_REVISION
      || receipt.closure?.selectedNoVideoFiles !== EXPECTED.selectedFiles
      || receipt.closure?.selectedNoVideoBytes !== EXPECTED.selectedBytes
      || receipt.closure?.selectedEpisodes !== EXPECTED.episodes
      || receipt.closure?.selectedFrames !== EXPECTED.frames
      || receipt.closure?.publisherRewardRows !== EXPECTED.frames
      || receipt.closure?.independentOutcomeUnits !== 0
      || receipt.closure?.recoveryUnits !== 0
      || receipt.closure?.completeAttemptCensusEstablished !== false
      || receipt.closure?.authorizedTrainingRows !== 0
      || receipt.closure?.networkAdmissionRows !== 0
      || receipt.closure?.CEU !== 0 || receipt.closure?.pricingUnits !== 0
      || receipt.closure?.authorityUnits !== 0) fail("RECEIPT_INVALID");
    return { ok: true, receiptHash: receipt.receiptHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function publishSo101HfExhaustionArtifactDirectory(stagingDirectory,
  targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (staging === target || target === path.parse(target).root || existsSync(target)) {
    fail("PUBLISH_TARGET_EXISTS_OR_BROAD", target);
  }
  const parent = path.dirname(target);
  if (!existsSync(parent) || lstatSync(parent).isSymbolicLink()
    || !lstatSync(parent).isDirectory()) fail("PUBLISH_PARENT_INVALID", parent);
  renameSync(staging, target);
  chmodSync(target, 0o700);
  return target;
}

export function verifySo101HfExhaustionArtifactDirectory(artifactDirectory) {
  try {
    const root = path.resolve(artifactDirectory);
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== 0o700) {
      fail("ARTIFACT_ROOT_INVALID");
    }
    if (!same(sorted(readdirSync(root)),
      ["run-receipt.json", "so101-hf-exhaustion-ledger.json", "source"])) {
      fail("ARTIFACT_TOP_LEVEL_INVALID");
    }
    const reportBytes = readPrivate(path.join(root, "so101-hf-exhaustion-ledger.json"));
    const receiptBytes = readPrivate(path.join(root, "run-receipt.json"));
    const report = parseJson(reportBytes, "ARTIFACT_REPORT_INVALID");
    const receipt = parseJson(receiptBytes, "ARTIFACT_RECEIPT_INVALID");
    const replay = verifySo101HfExhaustionReportWithSource(report, path.join(root, "source"));
    if (!replay.ok) fail("ARTIFACT_REPLAY_INVALID", replay.error);
    const checkedReceipt = verifySo101HfExhaustionReceipt(receipt, report, reportBytes);
    if (!checkedReceipt.ok) fail("ARTIFACT_RECEIPT_INVALID", checkedReceipt.error);
    return { ...replay, ok: true, report, receipt,
      reportFileSha256: so101HfSha256(reportBytes),
      receiptFileSha256: so101HfSha256(receiptBytes),
      sourceManifestFileSha256: report.source.sourceManifestFileSha256 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
