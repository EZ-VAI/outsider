/*
 * A bounded, source-native pair of official OpenHands SWE-bench Lite runs.
 *
 * The downloaded JSONL files contain prompts, messages, tool outputs, patches,
 * and configuration fields.  They stay in a mode-0600 source tree.  Reports
 * expose only structural counts, hashes, and publisher-harness labels.  A
 * SWE-bench `resolved` value is not independent or real-world outcome truth.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const OPENHANDS_EVAL_DATASET_ID = "OpenHands/openhands-evaluation-outputs";
export const OPENHANDS_EVAL_REVISION = "aa8977805b4cefd317001d80ddf1ad52790e9d23";
export const OPENHANDS_EVAL_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const OPENHANDS_EVAL_SOURCE_SCHEMA = "outsider/openhands-evaluation-paired-source/v1";
export const OPENHANDS_EVAL_INVENTORY_SCHEMA = "outsider/openhands-evaluation-paired-inventory/v1";
export const OPENHANDS_EVAL_REPORT_SCHEMA = "outsider/openhands-evaluation-paired-runs/v1";
export const OPENHANDS_EVAL_RECEIPT_SCHEMA = "outsider/openhands-evaluation-paired-run-receipt/v1";

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${OPENHANDS_EVAL_DATASET_ID}`;
const HF_RECORD_URL = `${HF_API}/revision/${OPENHANDS_EVAL_REVISION}`;
const HF_TREE_PATH = `/api/datasets/${OPENHANDS_EVAL_DATASET_ID}/tree/${OPENHANDS_EVAL_REVISION}`;
const HF_TREE_URL = `${HF_ORIGIN}${HF_TREE_PATH}?recursive=true&expand=true&limit=100`;
const HF_RESOLVE = `${HF_ORIGIN}/datasets/${OPENHANDS_EVAL_DATASET_ID}/resolve/${OPENHANDS_EVAL_REVISION}`;
const MAX_API_BYTES = 16 * 1024 * 1024;
const MAX_OBJECT_BYTES = 64 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 240_000;
const DOWNLOAD_ATTEMPTS = 3;
const REDIRECT_HOST = /(?:^|\.)(?:hf\.co|huggingface\.co)$/iu;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

const SONNET_DIRECTORY = "outputs/SWE-bench_Lite-test/CodeActAgent/claude-3-5-sonnet-20241022_maxiter_30_N_v1.9-no-hint";
const DEEPSEEK_DIRECTORY = "outputs/SWE-bench_Lite-test/CodeActAgent/deepseek-v2.5_maxiter_30_N_v1.9-no-hint-eval-24sep";
const SELECTED_CONTRAST_INSTANCE = "astropy__astropy-14995";

const EXPECTED = Object.freeze({
  treeEntries: 119,
  treeFiles: 91,
  treeDirectories: 28,
  treeBytes: 4_608_334_624,
  recordUsedStorageBytes: 4_820_369_648,
  selectedFiles: 11,
  selectedBytes: 114_939_223,
  supportFiles: 6,
  runRows: 300,
  sharedInstances: 300,
  totalEvaluationRows: 600,
  explicitResolvedRows: 408,
  explicitTrueFalseContrasts: 21,
  resolvedStateDivergences: 213,
  historyEvents: 19_086,
});

const ROOT_SUPPORT_PATHS = Object.freeze([".gitattributes", "README.md", "analyze_outputs.py"]);
const EXPECTED_SELECTED = Object.freeze({
  ".gitattributes": [2510, "0bd1e5a8a03f71fc0f5576d23e9ae57bed6ea1ca", null, null],
  "README.md": [24, "7be5fc7f47d5db027d120b8024982df93db95b74", null, null],
  "analyze_outputs.py": [12676, "842fafb0915cf1da4d4ba42d082e0f7ccaa1f76c", null, null],
  [`${SONNET_DIRECTORY}/README.md`]: [27332, "0434a4107776b1a8006851cbfe3afe42a79d5a97", null, null],
  [`${SONNET_DIRECTORY}/metadata.json`]: [1217, "72be8d49e8511b217fdf90be8c7615e2bc57e2c1", null, null],
  [`${SONNET_DIRECTORY}/output.jsonl`]: [53823238, "56ddf9295c063bcc9f97847232f608fafc211fe2", "000f310a900808da260f2fbbf3baf12f745ec8cc304f3f82f9b0417ba7c995d0", "2433c762d1e69ed550a6f74e922de5f60fc0ee2bf3d605efff9071ad2a91bc42"],
  [`${DEEPSEEK_DIRECTORY}/README.md`]: [25130, "7411b23f2af912b0782c5cbf1165225b36f5a0ff", null, null],
  [`${DEEPSEEK_DIRECTORY}/metadata.json`]: [1042, "bc878608a80c3f350ef70d604d42da7fdf384345", null, null],
  [`${DEEPSEEK_DIRECTORY}/output.jsonl`]: [61000487, "80191027b04a4aef390271a35a33ea911a82ef60", "9ad88259ecacb662fd1999b387be0b29a211598da8ed44b06189cf1183c75ece", "27526c2f45b2d68744faf22346d34d58caa8a0dbc8bc6a35426cf8eda76cae1b"],
  [`${DEEPSEEK_DIRECTORY}/report.json`]: [45543, "f0b1b623a1b1f19976ef1b4e15c1c5ff09256f3d", null, null],
  [`${DEEPSEEK_DIRECTORY}/run_id.txt`]: [24, "8e5e0d07f19a13a52da97b692bef39fc1e5f77ed", null, null],
});

const RUNS = Object.freeze([
  Object.freeze({
    key: "sonnet-v1.9",
    directory: SONNET_DIRECTORY,
    outputPath: `${SONNET_DIRECTORY}/output.jsonl`,
    model: "anthropic/claude-3-5-sonnet-20241022",
    datasetAliases: ["princeton-nlp__SWE-bench_Lite-test"],
    gitCommits: { "8a7e4381a240c10048af292c3ad3cb95b8759590": 300 },
    expected: { rows: 300, resolvedTrue: 92, resolvedFalse: 208,
      resolvedNull: 0, errorRows: 73, historyEvents: 13_149,
      historyRows: 300, instructionRows: 300, testPatchRows: 298,
      emptyGenerationRows: 2, failedApplyPatchRows: 1,
      errorEvalRows: 0, testTimeoutRows: 0 },
  }),
  Object.freeze({
    key: "deepseek-v1.9",
    directory: DEEPSEEK_DIRECTORY,
    outputPath: `${DEEPSEEK_DIRECTORY}/output.jsonl`,
    model: "deepseek/deepseek-coder",
    datasetAliases: ["swe-bench-lite"],
    gitCommits: { "3138852af180fbdf157fd5e0c623502e01265387": 2,
      "6999d969bbe0e62598e739fec4e204a552165c28": 298 },
    expected: { rows: 300, resolvedTrue: 40, resolvedFalse: 68,
      resolvedNull: 192, errorRows: 202, historyEvents: 5_937,
      historyRows: 300, instructionRows: 300, testPatchRows: 233,
      emptyGenerationRows: 67, failedApplyPatchRows: 0,
      errorEvalRows: 1, testTimeoutRows: 0 },
  }),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `OPENHANDS_EVAL_${code}`
    : `OPENHANDS_EVAL_${code}:${detail}`);
}

export function openHandsEvalSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function openHandsEvalDigest(value, domain = OPENHANDS_EVAL_REPORT_SCHEMA) {
  return openHandsEvalSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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
    || value.includes("\\") || value.split("/").some((part) => ["", ".", ".."].includes(part))
    || path.posix.normalize(value) !== value) fail("PATH_INVALID", String(value));
  return value;
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function checkedUrl(value, kind) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    fail("URL_INVALID", value);
  }
  if (kind === "HF" && url.origin !== HF_ORIGIN) fail("HF_URL_INVALID", value);
  if (kind === "REDIRECT" && !(url.origin === HF_ORIGIN
    || REDIRECT_HOST.test(url.hostname))) fail("REDIRECT_URL_INVALID", value);
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

async function boundedFetch(value, maximumBytes, fetchImpl) {
  const url = checkedUrl(value, "HF");
  let lastError = null;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, { redirect: "error",
        headers: { accept: "application/json", "accept-encoding": "identity",
          "user-agent": "outsider-openhands-evaluation/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.status !== 200 || response.headers.get("content-encoding") !== null
        || new URL(response.url || url).origin !== url.origin) {
        fail(`FETCH_HTTP_${response.status}`, url.pathname);
      }
      return { bytes: await readResponse(response, maximumBytes), headers: response.headers,
        status: response.status };
    } catch (error) {
      lastError = error;
      if (attempt < DOWNLOAD_ATTEMPTS) await delay(250 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

async function jsonFetch(value, maximumBytes, fetchImpl) {
  const fetched = await boundedFetch(value, maximumBytes, fetchImpl);
  return { ...fetched, value: parseJson(fetched.bytes, "FETCH_JSON_INVALID") };
}

async function objectFetch(remotePath, expectedBytes, fetchImpl) {
  const initial = checkedUrl(`${HF_RESOLVE}/${remotePath}?download=true`, "HF");
  let lastError = null;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      let url = initial;
      for (let redirect = 0; redirect < 5; redirect += 1) {
        const response = await fetchImpl(url, { redirect: "manual",
          headers: { accept: "application/octet-stream", "accept-encoding": "identity",
            "user-agent": "outsider-openhands-evaluation/1.0" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location) fail("OBJECT_REDIRECT_MISSING", remotePath);
          url = checkedUrl(new URL(location, url).toString(), "REDIRECT");
          continue;
        }
        if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
          fail(`OBJECT_HTTP_${response.status}`, remotePath);
        }
        return readResponse(response, Math.min(MAX_OBJECT_BYTES, expectedBytes), expectedBytes);
      }
      fail("OBJECT_REDIRECT_LIMIT", remotePath);
    } catch (error) {
      lastError = error;
      if (attempt < DOWNLOAD_ATTEMPTS) await delay(250 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function recordProjection(value) {
  if (!exactObject(value) || value.id !== OPENHANDS_EVAL_DATASET_ID
    || value.sha !== OPENHANDS_EVAL_REVISION || value.private !== false
    || value.gated !== false || value.disabled !== false
    || value.cardData?.license !== "mit" || !Array.isArray(value.tags)
    || !value.tags.includes("license:mit")
    || value.lastModified !== "2025-01-18T18:05:19.000Z"
    || value.usedStorage !== EXPECTED.recordUsedStorageBytes
    || !Array.isArray(value.siblings) || value.siblings.length !== EXPECTED.treeFiles) {
    fail("HF_RECORD_INVALID");
  }
  return { datasetId: OPENHANDS_EVAL_DATASET_ID, revision: OPENHANDS_EVAL_REVISION,
    lastModified: value.lastModified, private: false, gated: false, disabled: false,
    publisherLicenseClaim: "MIT", usedStorageBytes: value.usedStorage,
    siblingCount: value.siblings.length,
    siblingPaths: sorted(value.siblings.map((item) => safeRelative(item.rfilename))) };
}

function normalizeTree(value) {
  if (!Array.isArray(value)) fail("HF_TREE_INVALID");
  return value.map((entry) => {
    if (!exactObject(entry) || !["file", "directory"].includes(entry.type)
      || !SHA1.test(entry.oid ?? "") || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      fail("HF_TREE_ENTRY_INVALID");
    }
    const projected = { path: safeRelative(entry.path), type: entry.type,
      gitOid: entry.oid, sizeBytes: entry.size, lfs: null, xetHash: null };
    if (entry.type === "directory") {
      if (entry.size !== 0) fail("HF_TREE_DIRECTORY_INVALID", entry.path);
      return projected;
    }
    if (entry.size < 1) fail("HF_TREE_FILE_EMPTY", entry.path);
    if (entry.lfs !== undefined) {
      if (!exactObject(entry.lfs) || !SHA256.test(entry.lfs.oid ?? "")
        || entry.lfs.size !== entry.size || !Number.isSafeInteger(entry.lfs.pointerSize)) {
        fail("HF_TREE_LFS_INVALID", entry.path);
      }
      projected.lfs = { sha256: `sha256:${entry.lfs.oid}`, sizeBytes: entry.lfs.size,
        pointerSize: entry.lfs.pointerSize };
    }
    if (entry.xetHash !== undefined) {
      if (!SHA256.test(entry.xetHash)) fail("HF_TREE_XET_INVALID", entry.path);
      projected.xetHash = entry.xetHash;
    }
    return projected;
  });
}

function parseNextLink(value) {
  if (!value) return null;
  const part = String(value).split(",").find((item) => /;\s*rel="next"\s*$/iu.test(item));
  if (!part) return null;
  const match = /^\s*<([^>]+)>/u.exec(part);
  if (!match) fail("HF_TREE_LINK_INVALID");
  const url = checkedUrl(match[1], "HF");
  if (decodeURIComponent(url.pathname) !== HF_TREE_PATH
    || url.searchParams.get("recursive") !== "true"
    || url.searchParams.get("expand") !== "true"
    || url.searchParams.get("limit") !== "100"
    || !url.searchParams.get("cursor")) fail("HF_TREE_LINK_UNSAFE");
  return url.toString();
}

async function fetchTree(fetchImpl, label) {
  const entries = [];
  const support = [];
  const seen = new Set();
  let url = HF_TREE_URL;
  for (let page = 1; url !== null; page += 1) {
    if (page > 3 || seen.has(url)) fail("HF_TREE_PAGINATION_INVALID");
    seen.add(url);
    const fetched = await jsonFetch(url, MAX_API_BYTES, fetchImpl);
    entries.push(...normalizeTree(fetched.value));
    support.push({ relativePath: `source-support/hf-tree-${label}-${String(page).padStart(3, "0")}.json`,
      source: url, fetched });
    url = parseNextLink(fetched.headers.get("link"));
  }
  const ordered = entries.sort((left, right) => left.path.localeCompare(right.path));
  if (support.length !== 2 || ordered.length !== EXPECTED.treeEntries
    || new Set(ordered.map((entry) => entry.path)).size !== ordered.length) {
    fail("HF_TREE_PROFILE_CHANGED");
  }
  return { entries: ordered, support };
}

function treeSummary(entries) {
  const files = entries.filter((entry) => entry.type === "file");
  const summary = { entries: entries.length, files: files.length,
    directories: entries.length - files.length,
    bytes: files.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    snapshotHash: openHandsEvalDigest(entries, `${OPENHANDS_EVAL_SOURCE_SCHEMA}/hf-tree`) };
  if (!same(summary, { entries: EXPECTED.treeEntries, files: EXPECTED.treeFiles,
    directories: EXPECTED.treeDirectories, bytes: EXPECTED.treeBytes,
    snapshotHash: summary.snapshotHash })) fail("HF_TREE_SUMMARY_INVALID");
  return summary;
}

async function fetchSnapshot(fetchImpl, label) {
  const record = await jsonFetch(HF_RECORD_URL, MAX_API_BYTES, fetchImpl);
  const tree = await fetchTree(fetchImpl, label);
  return { record: recordProjection(record.value), tree: tree.entries,
    treeSummary: treeSummary(tree.entries), support: [
      { relativePath: `source-support/hf-record-${label}.json`, source: HF_RECORD_URL,
        fetched: record },
      ...tree.support,
    ] };
}

function remoteBinding(entry) {
  return { remotePath: entry.path, sizeBytes: entry.sizeBytes, gitOid: entry.gitOid,
    lfsSha256: entry.lfs?.sha256 ?? null,
    lfsPointerSize: entry.lfs?.pointerSize ?? null, xetHash: entry.xetHash };
}

function inventoryFromTree(entries) {
  const files = entries.filter((entry) => entry.type === "file");
  const byPath = new Map(files.map((entry) => [entry.path, entry]));
  const selectedPaths = sorted(Object.keys(EXPECTED_SELECTED));
  const selected = selectedPaths.map((selectedPath) => {
    const entry = byPath.get(selectedPath);
    if (!entry) fail("SELECTED_PATH_MISSING", selectedPath);
    const expected = EXPECTED_SELECTED[selectedPath];
    if (entry.sizeBytes !== expected[0] || entry.gitOid !== expected[1]
      || (entry.lfs?.sha256 ?? null) !== (expected[2] === null ? null : `sha256:${expected[2]}`)
      || entry.xetHash !== expected[3]) fail("SELECTED_BINDING_CHANGED", selectedPath);
    return entry;
  });
  const selectedSet = new Set(selectedPaths);
  for (const run of RUNS) {
    const directoryFiles = files.filter((entry) => entry.path.startsWith(`${run.directory}/`));
    if (directoryFiles.length < 1 || directoryFiles.some((entry) => !selectedSet.has(entry.path))) {
      fail("RUN_DIRECTORY_NOT_COMPLETE", run.key);
    }
  }
  const selectedBytes = selected.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (selected.length !== EXPECTED.selectedFiles || selectedBytes !== EXPECTED.selectedBytes) {
    fail("SELECTED_TOTAL_CHANGED");
  }
  const excluded = files.filter((entry) => !selectedSet.has(entry.path));
  const inventory = { schema: OPENHANDS_EVAL_INVENTORY_SCHEMA,
    datasetId: OPENHANDS_EVAL_DATASET_ID, pinnedRevision: OPENHANDS_EVAL_REVISION,
    completeTree: treeSummary(entries),
    selection: { benchmark: "SWE-bench_Lite-test", agentClass: "CodeActAgent",
      rule: "two smallest complete published run directories whose 300-instance universes match and contain an explicit resolved true/false contrast, plus root card and publisher analyzer",
      rootSupportPaths: ROOT_SUPPORT_PATHS,
      runDirectories: RUNS.map((run) => run.directory),
      completeRunDirectories: true, selectedFiles: selected.length,
      selectedBytes, rawRowsRemainPrivate: true },
    selectedObjects: selected.map(remoteBinding),
    excludedObjects: excluded.map(remoteBinding),
    excludedFiles: excluded.length,
    excludedBytes: excluded.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    crossPopulationTotal: null, additionProhibited: true };
  inventory.inventoryHash = openHandsEvalDigest(inventory,
    `${OPENHANDS_EVAL_INVENTORY_SCHEMA}/inventory`);
  return { inventory, selected };
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

function verifyObject(entry, bytes) {
  if (bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_INVALID", entry.path);
  const fileSha256 = openHandsEvalSha256(bytes);
  if (entry.lfs !== null) {
    if (fileSha256 !== entry.lfs.sha256) fail("OBJECT_LFS_HASH_INVALID", entry.path);
  } else if (gitBlobOid(bytes) !== entry.gitOid) fail("OBJECT_GIT_OID_INVALID", entry.path);
  return fileSha256;
}

function supportDescriptor(item) {
  return { path: item.relativePath, source: item.source, httpStatus: item.fetched.status,
    sizeBytes: item.fetched.bytes.length, sha256: openHandsEvalSha256(item.fetched.bytes) };
}

function manifestCore(manifest) {
  const copy = structuredClone(manifest);
  delete copy.manifestHash;
  return copy;
}

export async function acquirePinnedOpenHandsEvaluationSource(targetDirectory,
  { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  const target = path.resolve(targetDirectory);
  if (existsSync(target)) fail("SOURCE_TARGET_EXISTS", target);
  mkdirPrivate(path.dirname(target));
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirPrivate(staging);
  const before = await fetchSnapshot(fetchImpl, "before");
  const { inventory, selected } = inventoryFromTree(before.tree);
  const downloaded = [];
  for (const entry of selected) {
    const bytes = await objectFetch(entry.path, entry.sizeBytes, fetchImpl);
    const fileSha256 = verifyObject(entry, bytes);
    writePrivate(path.join(staging, entry.path), bytes);
    downloaded.push({ ...remoteBinding(entry), localPath: entry.path, fileSha256 });
  }
  const after = await fetchSnapshot(fetchImpl, "after");
  if (!same(before.record, after.record) || !same(before.tree, after.tree)) {
    fail("SOURCE_BRACKET_CHANGED");
  }
  const supportRecords = [...before.support, ...after.support];
  for (const item of supportRecords) {
    writePrivate(path.join(staging, item.relativePath), item.fetched.bytes);
  }
  const inventoryBytes = canonicalBytes(inventory);
  writePrivate(path.join(staging, "source-inventory.json"), inventoryBytes);
  const sourceSupportObjects = supportRecords.map(supportDescriptor);
  const selectedObjects = downloaded.sort((left, right) =>
    left.remotePath.localeCompare(right.remotePath));
  const sourceRoot = openHandsEvalDigest({ sourceSupportObjects, selectedObjects,
    inventoryFileSha256: openHandsEvalSha256(inventoryBytes),
    inventoryHash: inventory.inventoryHash }, `${OPENHANDS_EVAL_SOURCE_SCHEMA}/source-root`);
  const manifest = { schema: OPENHANDS_EVAL_SOURCE_SCHEMA,
    frozenAt: OPENHANDS_EVAL_FROZEN_AT, datasetId: OPENHANDS_EVAL_DATASET_ID,
    pinnedRevision: OPENHANDS_EVAL_REVISION,
    repositoryBefore: before.record, repositoryAfter: after.record,
    hfTreeBefore: before.treeSummary, hfTreeAfter: after.treeSummary,
    selection: inventory.selection,
    duplicateDisposition: { status: "DISTINCT_OFFICIAL_SOURCE",
      existingOpenHandsCorpus: "OpenHands/openhands-feedback@facf45600d625510b98222ec584a8c9ac59272a2",
      existingSWERebenchCorpus: "nebius/SWE-rebench-openhands-trajectories@35455389ab51bf5e2306bfd436ef72d0f98bf882",
      sameDatasetIdentityAsEitherExistingSource: false },
    rights: { publisherLicenseClaim: "MIT", datasetCardLicenseClaimPresent: true,
      standaloneLicenseFilePresent: false, useSpecificLegalClearanceEstablished: false,
      productionTrainingAuthorizedByOutsider: false },
    privacy: { rawInstructionHistoryToolOutputAndPatchBytesPrivate: true,
      sourceFileMode: "0600", sourceDirectoryMode: "0700", noPiiGuaranteed: false,
      credentialConfigurationFieldsPresent: true, credentialValuesPublishedInReport: false },
    inventory: { path: "source-inventory.json", sizeBytes: inventoryBytes.length,
      fileSha256: openHandsEvalSha256(inventoryBytes), inventoryHash: inventory.inventoryHash },
    sourceSupportObjects, selectedObjects, sourceRoot };
  manifest.manifestHash = openHandsEvalDigest(manifestCore(manifest),
    `${OPENHANDS_EVAL_SOURCE_SCHEMA}/manifest`);
  writePrivate(path.join(staging, "source-manifest.json"), canonicalBytes(manifest));
  renameSync(staging, target);
  chmodSync(target, 0o700);
  const checked = verifyOpenHandsEvaluationSourceDirectory(target);
  if (!checked.ok) fail("SOURCE_PUBLICATION_INVALID", checked.error);
  return checked;
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
        if (!child.isFile() || (child.mode & 0o777) !== 0o600) fail("FILE_UNSAFE", relative);
        result.push(relative);
      }
    }
  };
  visit(root);
  return sorted(result);
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

function replaySupportSnapshot(bytes, label) {
  const record = recordProjection(parseJson(bytes.get(`source-support/hf-record-${label}.json`),
    "SAVED_HF_RECORD_INVALID"));
  const entries = [1, 2].flatMap((page) => normalizeTree(parseJson(bytes.get(
    `source-support/hf-tree-${label}-${String(page).padStart(3, "0")}.json`),
  "SAVED_HF_TREE_INVALID"))).sort((left, right) => left.path.localeCompare(right.path));
  return { record, entries, summary: treeSummary(entries) };
}

export function verifyOpenHandsEvaluationSourceDirectory(sourceDirectory) {
  try {
    const root = path.resolve(sourceDirectory);
    const manifestBytes = readPrivate(path.join(root, "source-manifest.json"));
    const manifest = parseJson(manifestBytes, "MANIFEST_JSON_INVALID");
    if (!exactObject(manifest) || manifest.schema !== OPENHANDS_EVAL_SOURCE_SCHEMA
      || manifest.frozenAt !== OPENHANDS_EVAL_FROZEN_AT
      || manifest.datasetId !== OPENHANDS_EVAL_DATASET_ID
      || manifest.pinnedRevision !== OPENHANDS_EVAL_REVISION
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")
      || manifest.manifestHash !== openHandsEvalDigest(manifestCore(manifest),
        `${OPENHANDS_EVAL_SOURCE_SCHEMA}/manifest`)
      || !Array.isArray(manifest.sourceSupportObjects)
      || manifest.sourceSupportObjects.length !== EXPECTED.supportFiles) fail("MANIFEST_INVALID");
    const supportBytes = new Map();
    for (const item of manifest.sourceSupportObjects) {
      safeRelative(item.path);
      const bytes = readPrivate(path.join(root, item.path), item.sizeBytes);
      if (openHandsEvalSha256(bytes) !== item.sha256) fail("SUPPORT_HASH_INVALID", item.path);
      supportBytes.set(item.path, bytes);
    }
    const before = replaySupportSnapshot(supportBytes, "before");
    const after = replaySupportSnapshot(supportBytes, "after");
    if (!same(before, after) || !same(manifest.repositoryBefore, before.record)
      || !same(manifest.repositoryAfter, after.record)
      || !same(manifest.hfTreeBefore, before.summary)
      || !same(manifest.hfTreeAfter, after.summary)
      || !same(before.record.siblingPaths,
        before.entries.filter((entry) => entry.type === "file").map((entry) => entry.path))) {
      fail("SAVED_BRACKET_INVALID");
    }
    const { inventory: rebuiltInventory, selected } = inventoryFromTree(before.entries);
    const inventoryBytes = readPrivate(path.join(root, "source-inventory.json"));
    const inventory = parseJson(inventoryBytes, "INVENTORY_JSON_INVALID");
    if (!same(inventory, rebuiltInventory)
      || inventoryBytes.length !== manifest.inventory.sizeBytes
      || openHandsEvalSha256(inventoryBytes) !== manifest.inventory.fileSha256
      || inventory.inventoryHash !== manifest.inventory.inventoryHash) fail("INVENTORY_INVALID");
    if (!Array.isArray(manifest.selectedObjects)
      || manifest.selectedObjects.length !== selected.length) fail("SELECTED_OBJECTS_INVALID");
    for (let index = 0; index < selected.length; index += 1) {
      const entry = selected[index];
      const declared = manifest.selectedObjects[index];
      if (declared.remotePath !== entry.path || declared.localPath !== entry.path
        || declared.sizeBytes !== entry.sizeBytes || declared.gitOid !== entry.gitOid
        || declared.lfsSha256 !== (entry.lfs?.sha256 ?? null)
        || declared.lfsPointerSize !== (entry.lfs?.pointerSize ?? null)
        || declared.xetHash !== entry.xetHash || !HASH.test(declared.fileSha256 ?? "")) {
        fail("SELECTED_BINDING_INVALID", entry.path);
      }
      const bytes = readPrivate(path.join(root, entry.path), entry.sizeBytes);
      if (verifyObject(entry, bytes) !== declared.fileSha256) fail("SELECTED_HASH_INVALID", entry.path);
    }
    const sourceRoot = openHandsEvalDigest({
      sourceSupportObjects: manifest.sourceSupportObjects,
      selectedObjects: manifest.selectedObjects,
      inventoryFileSha256: manifest.inventory.fileSha256,
      inventoryHash: inventory.inventoryHash,
    }, `${OPENHANDS_EVAL_SOURCE_SCHEMA}/source-root`);
    if (sourceRoot !== manifest.sourceRoot) fail("SOURCE_ROOT_INVALID");
    const expectedFiles = sorted([
      ...manifest.sourceSupportObjects.map((item) => item.path),
      ...manifest.selectedObjects.map((item) => item.localPath),
      "source-inventory.json", "source-manifest.json",
    ]);
    if (!same(listFiles(root), expectedFiles)) fail("SOURCE_FILE_CENSUS_INVALID");
    return { ok: true, verificationLevel: "FULL_SELECTED_SOURCE_REPLAY",
      manifest, inventory, sourceRoot, manifestFileSha256: openHandsEvalSha256(manifestBytes) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function parseOutputRows(bytes, run) {
  if (bytes.at(-1) !== 0x0a) fail("JSONL_FINAL_NEWLINE_MISSING", run.key);
  const lines = bytes.toString("utf8").split("\n");
  lines.pop();
  if (lines.length !== EXPECTED.runRows || lines.some((line) => line.length === 0)) {
    fail("JSONL_ROW_COUNT_INVALID", run.key);
  }
  const rows = lines.map((line, index) => {
    let row;
    try { row = JSON.parse(line); } catch { fail("JSONL_ROW_INVALID", `${run.key}:${index}`); }
    if (!exactObject(row) || typeof row.instance_id !== "string"
      || !exactObject(row.instance) || row.instance.instance_id !== row.instance_id
      || typeof row.instruction !== "string" || row.instruction.length < 1
      || !Array.isArray(row.history) || row.history.length < 1
      || !exactObject(row.metadata) || !exactObject(row.metadata.llm_config)
      || row.metadata.llm_config.model !== run.model
      || row.metadata.max_iterations !== 30 || !run.datasetAliases.includes(row.metadata.dataset)
      || !exactObject(row.metrics) || !exactObject(row.test_result)) {
      fail("JSONL_ROW_SCHEMA_INVALID", `${run.key}:${index}`);
    }
    if (row.report !== null && row.report !== undefined && !exactObject(row.report)) {
      fail("JSONL_REPORT_INVALID", `${run.key}:${index}`);
    }
    const resolved = row.report?.resolved;
    if (![true, false, null, undefined].includes(resolved)) {
      fail("JSONL_RESOLVED_INVALID", `${run.key}:${index}`);
    }
    return row;
  });
  if (new Set(rows.map((row) => row.instance_id)).size !== EXPECTED.runRows) {
    fail("INSTANCE_DUPLICATE", run.key);
  }
  return rows;
}

function countTrue(rows, field) {
  return rows.filter((row) => row.report?.[field] === true).length;
}

function schemaProfiles(rows, selector) {
  const counts = new Map();
  for (const row of rows) {
    const value = selector(row);
    const schema = exactObject(value) ? Object.keys(value).sort().join(",") : "<absent>";
    counts.set(schema, (counts.get(schema) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right))
    .map(([schema, rows]) => ({ schema, rows }));
}

function runProfile(rows, run) {
  const gitCommits = {};
  for (const row of rows) {
    const commit = row.metadata.git_commit;
    if (!SHA1.test(commit ?? "")) fail("ROW_GIT_COMMIT_INVALID", run.key);
    gitCommits[commit] = (gitCommits[commit] ?? 0) + 1;
  }
  const profile = { key: run.key, sourceDirectory: run.directory,
    model: run.model, publisherDatasetAliases: run.datasetAliases,
    rows: rows.length, uniqueInstances: new Set(rows.map((row) => row.instance_id)).size,
    resolvedTrue: rows.filter((row) => row.report?.resolved === true).length,
    resolvedFalse: rows.filter((row) => row.report?.resolved === false).length,
    resolvedNull: rows.filter((row) => row.report?.resolved == null).length,
    errorRows: rows.filter((row) => row.error != null).length,
    historyEvents: rows.reduce((sum, row) => sum + row.history.length, 0),
    historyRows: rows.filter((row) => row.history.length > 0).length,
    instructionRows: rows.filter((row) => row.instruction.length > 0).length,
    testPatchRows: rows.filter((row) =>
      typeof row.test_result.git_patch === "string" && row.test_result.git_patch.length > 0).length,
    emptyGenerationRows: countTrue(rows, "empty_generation"),
    failedApplyPatchRows: countTrue(rows, "failed_apply_patch"),
    errorEvalRows: countTrue(rows, "error_eval"),
    testTimeoutRows: countTrue(rows, "test_timeout"),
    gitCommitRowCounts: Object.fromEntries(Object.entries(gitCommits)
      .sort(([left], [right]) => left.localeCompare(right))),
    topLevelSchemaProfiles: schemaProfiles(rows, (row) => row),
    publisherReportSchemaProfiles: schemaProfiles(rows, (row) => row.report),
    credentialConfigurationFieldsPresent: rows.some((row) => ["api_key", "aws_access_key_id",
      "aws_secret_access_key"].some((key) => Object.hasOwn(row.metadata.llm_config, key))),
  };
  const expectedComparable = { rows: profile.rows, resolvedTrue: profile.resolvedTrue,
    resolvedFalse: profile.resolvedFalse, resolvedNull: profile.resolvedNull,
    errorRows: profile.errorRows, historyEvents: profile.historyEvents,
    historyRows: profile.historyRows, instructionRows: profile.instructionRows,
    testPatchRows: profile.testPatchRows, emptyGenerationRows: profile.emptyGenerationRows,
    failedApplyPatchRows: profile.failedApplyPatchRows, errorEvalRows: profile.errorEvalRows,
    testTimeoutRows: profile.testTimeoutRows };
  if (!same(expectedComparable, run.expected) || profile.uniqueInstances !== EXPECTED.runRows
    || !same(profile.gitCommitRowCounts, run.gitCommits)
    || profile.credentialConfigurationFieldsPresent !== true) {
    fail("RUN_PROFILE_CHANGED", run.key);
  }
  return profile;
}

function replaySelectedSource(sourceDirectory) {
  const checked = verifyOpenHandsEvaluationSourceDirectory(sourceDirectory);
  if (!checked.ok) fail("SOURCE_INVALID", checked.error);
  const root = path.resolve(sourceDirectory);
  const card = readPrivate(path.join(root, "README.md"), 24);
  if (!card.equals(Buffer.from("---\r\nlicense: mit\r\n---\r\n", "utf8"))) {
    fail("DATASET_CARD_CHANGED");
  }
  const analyzer = readPrivate(path.join(root, "analyze_outputs.py"), 12676).toString("utf8");
  if (!analyzer.includes("resolved") || !analyzer.includes("report")) {
    fail("ANALYZER_SCHEMA_LINK_MISSING");
  }
  const runRows = RUNS.map((run) => {
    parseJson(readPrivate(path.join(root, `${run.directory}/metadata.json`)),
      "RUN_METADATA_JSON_INVALID");
    for (const name of ["README.md"]) readPrivate(path.join(root, `${run.directory}/${name}`));
    if (run.key === "deepseek-v1.9") {
      const harness = parseJson(readPrivate(path.join(root, `${run.directory}/report.json`)),
        "HARNESS_REPORT_JSON_INVALID");
      if (harness.schema_version !== 2 || harness.total_instances !== 300
        || harness.submitted_instances !== 300 || harness.resolved_instances !== 40
        || harness.unresolved_instances !== 192 || harness.empty_patch_instances !== 67
        || !Array.isArray(harness.resolved_ids) || harness.resolved_ids.length !== 40
        || !Array.isArray(harness.unresolved_ids) || harness.unresolved_ids.length !== 192) {
        fail("HARNESS_REPORT_PROFILE_CHANGED");
      }
      const runId = readPrivate(path.join(root, `${run.directory}/run_id.txt`), 24).toString("utf8");
      if (runId !== "RUN_ID: 20240929_223534\n") fail("RUN_ID_INVALID");
    }
    const bytes = readPrivate(path.join(root, run.outputPath),
      EXPECTED_SELECTED[run.outputPath][0]);
    const rows = parseOutputRows(bytes, run);
    return { run, rows, profile: runProfile(rows, run),
      outputFileSha256: openHandsEvalSha256(bytes) };
  });
  return { checked, runRows };
}

function pairProfile(runRows) {
  const [first, second] = runRows;
  const secondById = new Map(second.rows.map((row) => [row.instance_id, row]));
  const shared = first.rows.filter((row) => secondById.has(row.instance_id));
  const pairCounts = { trueTrue: 0, trueFalse: 0, trueNull: 0,
    falseTrue: 0, falseFalse: 0, falseNull: 0 };
  let matchingInstanceObjects = 0;
  let resolvedStateDivergences = 0;
  const instanceUniverse = [];
  for (const row of shared) {
    const other = secondById.get(row.instance_id);
    const firstState = row.report?.resolved === true ? "true"
      : row.report?.resolved === false ? "false" : "null";
    const secondState = other.report?.resolved === true ? "True"
      : other.report?.resolved === false ? "False" : "Null";
    pairCounts[`${firstState}${secondState}`] += 1;
    if (firstState.toLowerCase() !== secondState.toLowerCase()) resolvedStateDivergences += 1;
    const firstInstanceHash = openHandsEvalDigest(row.instance,
      `${OPENHANDS_EVAL_REPORT_SCHEMA}/private-instance-object`);
    const secondInstanceHash = openHandsEvalDigest(other.instance,
      `${OPENHANDS_EVAL_REPORT_SCHEMA}/private-instance-object`);
    if (firstInstanceHash === secondInstanceHash) matchingInstanceObjects += 1;
    instanceUniverse.push({ instanceId: row.instance_id, instanceObjectHash: firstInstanceHash });
  }
  if (shared.length !== EXPECTED.sharedInstances || secondById.size !== EXPECTED.sharedInstances
    || matchingInstanceObjects !== EXPECTED.sharedInstances
    || pairCounts.trueFalse + pairCounts.falseTrue !== EXPECTED.explicitTrueFalseContrasts
    || resolvedStateDivergences !== EXPECTED.resolvedStateDivergences) {
    fail("PAIRED_INSTANCE_PROFILE_CHANGED");
  }
  const selected = shared.find((row) => row.instance_id === SELECTED_CONTRAST_INSTANCE);
  const selectedOther = secondById.get(SELECTED_CONTRAST_INSTANCE);
  if (!selected || !selectedOther || selected.report?.resolved !== true
    || selectedOther.report?.resolved !== false) fail("SELECTED_CONTRAST_CHANGED");
  return { benchmark: "SWE-bench Lite test", sharedInstanceUnits: shared.length,
    exactInstanceUniverseMatch: true, matchingInstanceObjectUnits: matchingInstanceObjects,
    instanceUniverseHash: openHandsEvalDigest(instanceUniverse.sort((left, right) =>
      left.instanceId.localeCompare(right.instanceId)), `${OPENHANDS_EVAL_REPORT_SCHEMA}/instance-universe`),
    publisherResolvedPairCounts: pairCounts,
    explicitTrueFalseContrastUnits: pairCounts.trueFalse + pairCounts.falseTrue,
    resolvedStateDivergenceUnits: resolvedStateDivergences,
    selectedContrast: { instanceId: SELECTED_CONTRAST_INSTANCE,
      instanceObjectHash: openHandsEvalDigest(selected.instance,
        `${OPENHANDS_EVAL_REPORT_SCHEMA}/private-instance-object`),
      runs: [
        { runKey: first.run.key, publisherResolved: true,
          errorPresent: selected.error != null, historyEvents: selected.history.length,
          testPatchPresent: typeof selected.test_result.git_patch === "string"
            && selected.test_result.git_patch.length > 0,
          privateTrajectoryHash: openHandsEvalDigest(selected,
            `${OPENHANDS_EVAL_REPORT_SCHEMA}/private-trajectory`) },
        { runKey: second.run.key, publisherResolved: false,
          errorPresent: selectedOther.error != null, historyEvents: selectedOther.history.length,
          testPatchPresent: typeof selectedOther.test_result.git_patch === "string"
            && selectedOther.test_result.git_patch.length > 0,
          privateTrajectoryHash: openHandsEvalDigest(selectedOther,
            `${OPENHANDS_EVAL_REPORT_SCHEMA}/private-trajectory`) },
      ] },
  };
}

function reportCore(sourceDirectory) {
  const replay = replaySelectedSource(sourceDirectory);
  const pair = pairProfile(replay.runRows);
  const runs = replay.runRows.map(({ profile, outputFileSha256 }) =>
    ({ ...profile, outputFileSha256 }));
  const report = { schema: OPENHANDS_EVAL_REPORT_SCHEMA,
    frozenAt: OPENHANDS_EVAL_FROZEN_AT,
    source: { datasetId: OPENHANDS_EVAL_DATASET_ID,
      pinnedRevision: OPENHANDS_EVAL_REVISION,
      sourceRoot: replay.checked.sourceRoot,
      sourceManifestHash: replay.checked.manifest.manifestHash,
      sourceManifestFileSha256: replay.checked.manifestFileSha256,
      verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED" },
    disposition: { status: "DISTINCT_EVALUATION_SOURCE",
      duplicateOfExistingEngineOpenHandsCorpus: false,
      comparedSourceIdentities: replay.checked.manifest.duplicateDisposition },
    denominators: {
      completeOfficialRepositoryTree: { units: EXPECTED.treeEntries, unit: "HF_TREE_ENTRY",
        files: EXPECTED.treeFiles, bytes: EXPECTED.treeBytes },
      selectedCompleteRunDirectories: { units: 2, unit: "SOURCE_NATIVE_RUN_DIRECTORY",
        files: EXPECTED.selectedFiles, bytes: EXPECTED.selectedBytes },
      evaluationRunRows: { units: EXPECTED.totalEvaluationRows, unit: "RUN_INSTANCE_ROW" },
      uniqueBenchmarkInstances: { units: EXPECTED.sharedInstances, unit: "SWE_BENCH_INSTANCE" },
      explicitPublisherResolvedLabels: { units: EXPECTED.explicitResolvedRows,
        unit: "PUBLISHER_HARNESS_LABEL" },
      crossPopulationTotal: null, additionProhibited: true },
    runs, pairedComparison: pair,
    segments: {
      opportunityCensus: { units: 0, prospective: false },
      delegationAuthorization: { units: 0, authorityEstablished: false },
      action: { trajectoryRows: EXPECTED.totalEvaluationRows,
        historyEventUnits: EXPECTED.historyEvents, rawContentPublished: false },
      effect: { independentRealWorldEffectUnits: 0 },
      outcome: { publisherHarnessLabelUnits: EXPECTED.explicitResolvedRows,
        independentUnits: 0, realWorldUnits: 0 },
      recovery: { units: 0, sameInstanceCrossRunContrastIsRecovery: false },
      longitudinal: { units: 0 } },
    truthBoundary: { publisherHarnessOutcomeEstablished: true,
      publisherResolvedMeansIndependentOutcome: false,
      publisherResolvedMeansRealWorldOutcome: false,
      crossRunResolvedContrastMeansRecovery: false,
      completeAttemptCensusEstablished: false,
      causalFailureOrWasteTruthEstablished: false,
      delegationOrExecutionAuthorityEstablished: false },
    rights: replay.checked.manifest.rights,
    privacy: { rawInstructionsPrivate: true, rawHistoryMessagesPrivate: true,
      rawToolOutputsPrivate: true, rawPatchesPrivate: true,
      rawConfigurationValuesPrivate: true, noPiiGuaranteed: false,
      reportContainsRawDialogueOrToolContent: false },
    useBoundary: { status: "QUARANTINE_EVAL_ONLY",
      offlineEvaluationRows: EXPECTED.totalEvaluationRows,
      offlineModelFittingRows: 0, authorizedTrainingRows: 0,
      authorizedTrainingJobs: 0, trainingPerformed: false,
      useSpecificClearanceEstablished: false },
    network: { networkAdmissionRows: 0 },
    economics: { CEU: 0, pricingUnits: 0 },
    authority: { executionAuthorityUnits: 0, delegatedActionUnits: 0 } };
  report.artifactHash = openHandsEvalDigest(report,
    `${OPENHANDS_EVAL_REPORT_SCHEMA}/artifact`);
  return report;
}

export function buildOpenHandsEvaluationReportFromSource(sourceDirectory) {
  return reportCore(sourceDirectory);
}

export function verifyOpenHandsEvaluationReport(report) {
  try {
    if (!exactObject(report) || report.schema !== OPENHANDS_EVAL_REPORT_SCHEMA
      || report.frozenAt !== OPENHANDS_EVAL_FROZEN_AT || !HASH.test(report.artifactHash ?? "")) {
      fail("REPORT_INVALID");
    }
    const core = structuredClone(report);
    delete core.artifactHash;
    if (report.artifactHash !== openHandsEvalDigest(core,
      `${OPENHANDS_EVAL_REPORT_SCHEMA}/artifact`)) fail("REPORT_HASH_INVALID");
    if (report.source?.datasetId !== OPENHANDS_EVAL_DATASET_ID
      || report.source?.pinnedRevision !== OPENHANDS_EVAL_REVISION
      || report.disposition?.status !== "DISTINCT_EVALUATION_SOURCE"
      || report.disposition?.duplicateOfExistingEngineOpenHandsCorpus !== false
      || report.denominators?.evaluationRunRows?.units !== EXPECTED.totalEvaluationRows
      || report.denominators?.uniqueBenchmarkInstances?.units !== EXPECTED.sharedInstances
      || report.denominators?.crossPopulationTotal !== null
      || report.denominators?.additionProhibited !== true
      || report.pairedComparison?.explicitTrueFalseContrastUnits
        !== EXPECTED.explicitTrueFalseContrasts
      || report.pairedComparison?.selectedContrast?.instanceId !== SELECTED_CONTRAST_INSTANCE
      || report.truthBoundary?.publisherResolvedMeansIndependentOutcome !== false
      || report.truthBoundary?.crossRunResolvedContrastMeansRecovery !== false
      || report.segments?.outcome?.independentUnits !== 0
      || report.segments?.recovery?.units !== 0
      || report.useBoundary?.authorizedTrainingRows !== 0
      || report.useBoundary?.trainingPerformed !== false
      || report.network?.networkAdmissionRows !== 0
      || report.economics?.CEU !== 0 || report.authority?.executionAuthorityUnits !== 0) {
      fail("REPORT_BOUNDARY_INVALID");
    }
    return { ok: true, verificationLevel: "STANDALONE_STRUCTURAL" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyOpenHandsEvaluationReportWithSource(report, sourceDirectory) {
  try {
    const standalone = verifyOpenHandsEvaluationReport(report);
    if (!standalone.ok) fail("REPORT_STANDALONE_INVALID", standalone.error);
    const rebuilt = reportCore(sourceDirectory);
    if (!same(report, rebuilt)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    return { ok: true, verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function buildOpenHandsEvaluationReceipt(report, reportBytes) {
  const receipt = { schema: OPENHANDS_EVAL_RECEIPT_SCHEMA,
    completedAt: OPENHANDS_EVAL_FROZEN_AT,
    reportSchema: OPENHANDS_EVAL_REPORT_SCHEMA,
    reportArtifactHash: report.artifactHash,
    reportFileSha256: openHandsEvalSha256(reportBytes),
    sourceRoot: report.source.sourceRoot,
    assertions: { fullSelectedSourceRederived: true, completeRunDirectories: 2,
      sharedBenchmarkInstances: EXPECTED.sharedInstances,
      rawContentPublished: false, independentOutcomeUnits: 0,
      recoveryUnits: 0, authorizedTrainingRows: 0,
      networkAdmissionRows: 0, CEU: 0, authorityUnits: 0 } };
  receipt.receiptHash = openHandsEvalDigest(receipt,
    `${OPENHANDS_EVAL_RECEIPT_SCHEMA}/receipt`);
  return receipt;
}

export function verifyOpenHandsEvaluationReceipt(receipt, report, reportBytes) {
  try {
    if (!verifyOpenHandsEvaluationReport(report).ok || !exactObject(receipt)
      || receipt.schema !== OPENHANDS_EVAL_RECEIPT_SCHEMA
      || receipt.completedAt !== OPENHANDS_EVAL_FROZEN_AT
      || receipt.reportArtifactHash !== report.artifactHash
      || receipt.reportFileSha256 !== openHandsEvalSha256(reportBytes)
      || receipt.sourceRoot !== report.source.sourceRoot || !HASH.test(receipt.receiptHash ?? "")) {
      fail("RECEIPT_INVALID");
    }
    const core = structuredClone(receipt);
    delete core.receiptHash;
    if (receipt.receiptHash !== openHandsEvalDigest(core,
      `${OPENHANDS_EVAL_RECEIPT_SCHEMA}/receipt`)
      || receipt.assertions?.fullSelectedSourceRederived !== true
      || receipt.assertions?.rawContentPublished !== false
      || receipt.assertions?.independentOutcomeUnits !== 0
      || receipt.assertions?.recoveryUnits !== 0
      || receipt.assertions?.authorizedTrainingRows !== 0
      || receipt.assertions?.networkAdmissionRows !== 0
      || receipt.assertions?.CEU !== 0 || receipt.assertions?.authorityUnits !== 0) {
      fail("RECEIPT_ASSERTION_INVALID");
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function publishOpenHandsEvaluationArtifactDirectory(stagingDirectory, targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (existsSync(target)) fail("ARTIFACT_TARGET_EXISTS", target);
  if (!existsSync(staging)) fail("ARTIFACT_STAGING_MISSING", staging);
  renameSync(staging, target);
  chmodSync(target, 0o700);
}

export function verifyOpenHandsEvaluationArtifactDirectory(artifactDirectory) {
  try {
    const root = path.resolve(artifactDirectory);
    const rootStat = lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()
      || (rootStat.mode & 0o777) !== 0o700) fail("ARTIFACT_DIRECTORY_INVALID");
    const reportBytes = readPrivate(path.join(root, "report.json"));
    const report = parseJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const receiptBytes = readPrivate(path.join(root, "run-receipt.json"));
    const receipt = parseJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
    const source = verifyOpenHandsEvaluationSourceDirectory(path.join(root, "source"));
    if (!source.ok) fail("ARTIFACT_SOURCE_INVALID", source.error);
    const replay = verifyOpenHandsEvaluationReportWithSource(report, path.join(root, "source"));
    if (!replay.ok) fail("ARTIFACT_REPLAY_INVALID", replay.error);
    const receiptCheck = verifyOpenHandsEvaluationReceipt(receipt, report, reportBytes);
    if (!receiptCheck.ok) fail("ARTIFACT_RECEIPT_INVALID", receiptCheck.error);
    return { ok: true, verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED",
      reportFileSha256: openHandsEvalSha256(reportBytes),
      receiptFileSha256: openHandsEvalSha256(receiptBytes), report, receipt };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
