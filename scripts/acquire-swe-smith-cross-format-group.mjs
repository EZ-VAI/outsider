#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  SWE_SMITH_CROSS_FORMAT_DATASET_ID,
  SWE_SMITH_CROSS_FORMAT_RANGE_PLAN,
  SWE_SMITH_CROSS_FORMAT_REVISION,
  buildSweSmithCrossFormatArtifactFromSourceDirectory,
  createSweSmithCrossFormatReceipt,
  createSweSmithCrossFormatSourceManifestFromDirectory,
  serializeSweSmithCrossFormatArtifact,
  verifySweSmithCrossFormatArtifactDirectory,
} from "../src/outsider-swe-smith-cross-format-group.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-swe-smith-cross-format-group-20260829-v1";
const TREE_SHA256 =
  "1b3539ea30815625d9fe4d2a59cccf866b43bd7e8d23fafd22857c3d59aafca2";
const RANGE_SOURCE_BYTES = 196_566_655;

function fail(code, detail = null) {
  throw new Error(detail === null ? `SWE_SMITH_CROSS_FORMAT_ACQUIRE_${code}`
    : `SWE_SMITH_CROSS_FORMAT_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, sourceOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--source-only") result.sourceOnly = true;
    else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-swe-smith-cross-format-group.mjs [--output-dir <new-dir>] [--source-only]",
        "",
        "Acquires exact fixed-revision traj_id closure ranges for all 32",
        "SWE-smith Parquet paths plus two complete tool/ticks row groups.",
      ].join("\n") + "\n");
      process.exit(0);
    } else fail("ARGUMENT_INVALID", argument);
  }
  return result;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function mkdirPrivate(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function ensureParents(file, stop) {
  const missing = [];
  let cursor = path.dirname(file);
  while (cursor !== stop && !existsSync(cursor)) {
    missing.push(cursor);
    cursor = path.dirname(cursor);
  }
  for (const directory of missing.reverse()) mkdirPrivate(directory);
}

function validateTarget(workspace, target, checkpoint) {
  const relation = path.relative(workspace, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation) || existsSync(target)) {
    fail("OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE", target);
  }
  ensureParents(target, workspace);
  if (existsSync(checkpoint)) {
    const status = lstatSync(checkpoint);
    if (!status.isDirectory() || status.isSymbolicLink()
      || (status.mode & 0o777) !== 0o700) fail("CHECKPOINT_UNSAFE");
  } else mkdirPrivate(checkpoint);
}

function sourceUrl(relative, mode = "resolve") {
  const encoded = SWE_SMITH_CROSS_FORMAT_DATASET_ID.split("/")
    .map(encodeURIComponent).join("/");
  return `https://huggingface.co/datasets/${encoded}/${mode}/${
    SWE_SMITH_CROSS_FORMAT_REVISION}/${relative}`;
}

async function retry(operation, code) {
  let last;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      last = error;
      if (attempt < 7) await new Promise((resolve) => setTimeout(resolve,
        Math.min(8_000, 500 * (2 ** attempt))));
    }
  }
  fail(code, last?.message ?? "unknown");
}

async function fetchSmall(url, maximumBytes) {
  return retry(async () => {
    const response = await fetch(url, { redirect: "follow", headers: {
      "Accept-Encoding": "identity",
      "User-Agent": "outsider-swe-smith-cross-format/1.0",
    } });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1 || bytes.length > maximumBytes) {
      throw new Error(`SIZE_${bytes.length}`);
    }
    return bytes;
  }, "SMALL_DOWNLOAD_FAILED");
}

async function downloadSmall(file, url, maximumBytes) {
  if (existsSync(file)) return;
  writePrivate(file, await fetchSmall(url, maximumBytes));
}

async function signedLocation(entry, treeEntry) {
  return retry(async () => {
    const response = await fetch(`${sourceUrl(entry.path)}?download=true`, {
      method: "HEAD", redirect: "manual", headers: {
        "Accept-Encoding": "identity",
        "User-Agent": "outsider-swe-smith-cross-format/1.0",
      },
    });
    if (![302, 307].includes(response.status)
      || response.headers.get("x-repo-commit") !== SWE_SMITH_CROSS_FORMAT_REVISION
      || Number(response.headers.get("x-linked-size")) !== entry.size
      || response.headers.get("x-linked-etag")?.replaceAll('"', "")
        !== treeEntry.lfs.oid) {
      throw new Error(`PIN_HEADERS_${entry.path}_${response.status}`);
    }
    const location = response.headers.get("location");
    const parsed = new URL(location);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password
      || !(parsed.hostname.endsWith(".hf.co")
        || parsed.hostname.endsWith(".huggingface.co"))) {
      throw new Error("SIGNED_LOCATION_INVALID");
    }
    return location;
  }, "SIGNED_LOCATION_FAILED");
}

async function rangeBytes(location, start, end, total) {
  return retry(async () => {
    const response = await fetch(location, { redirect: "error", headers: {
      Range: `bytes=${start}-${end}`,
      "Accept-Encoding": "identity",
      "User-Agent": "outsider-swe-smith-cross-format/1.0",
    } });
    const expected = end - start + 1;
    if (response.status !== 206
      || response.headers.get("content-range") !== `bytes ${start}-${end}/${total}`
      || Number(response.headers.get("content-length")) !== expected) {
      throw new Error(`RANGE_HEADERS_${start}_${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== expected) throw new Error(`RANGE_SIZE_${start}`);
    return bytes;
  }, "RANGE_DOWNLOAD_FAILED");
}

function rangeFile(root, entry, range) {
  return path.join(root, "ranges", entry.path,
    `${String(range[0]).padStart(12, "0")}-${
      String(range[1]).padStart(12, "0")}.bin`);
}

async function downloadEntryRanges(root, entry, treeEntry) {
  const missing = [];
  for (const range of entry.ranges) {
    const destination = rangeFile(root, entry, range);
    const exact = range[1] - range[0] + 1;
    ensureParents(destination, root);
    if (existsSync(destination)) {
      const status = lstatSync(destination);
      if (!status.isFile() || status.isSymbolicLink()
        || status.size !== exact || (status.mode & 0o777) !== 0o600) {
        fail("EXISTING_RANGE_INVALID", destination);
      }
    } else missing.push({ range, destination });
  }
  if (missing.length === 0) return;
  const location = await signedLocation(entry, treeEntry);
  for (const { range, destination } of missing) {
    writePrivate(destination,
      await rangeBytes(location, range[0], range[1], entry.size));
  }
  process.stdout.write(`${JSON.stringify({ checkpoint: entry.path,
    ranges: entry.ranges.length })}\n`);
}

function validatePreflight(recordFile, treeFile) {
  const recordBytes = readFileSync(recordFile);
  const treeBytes = readFileSync(treeFile);
  if (sha256(treeBytes) !== TREE_SHA256) {
    fail("PREFLIGHT_BYTES_CHANGED");
  }
  const record = JSON.parse(recordBytes);
  const tree = JSON.parse(treeBytes);
  const recordProjection = {
    id: record.id, sha: record.sha, lastModified: record.lastModified,
    private: record.private, gated: record.gated, disabled: record.disabled,
    usedStorage: record.usedStorage, license: record.cardData?.license,
    splits: record.cardData?.dataset_info?.splits,
    configs: record.cardData?.configs, siblings: record.siblings?.length,
  };
  if (record.id !== SWE_SMITH_CROSS_FORMAT_DATASET_ID
    || record.sha !== SWE_SMITH_CROSS_FORMAT_REVISION
    || record.private !== false || record.gated !== false
    || record.disabled !== false || record.usedStorage !== 8_777_676_392
    || record.cardData?.license !== "mit" || record.siblings?.length !== 34
    || !Array.isArray(tree) || tree.length !== 35) fail("PREFLIGHT_PROFILE_INVALID");
  const byPath = new Map(tree.filter((entry) => entry.type === "file")
    .map((entry) => [entry.path, entry]));
  for (const entry of SWE_SMITH_CROSS_FORMAT_RANGE_PLAN) {
    const actual = byPath.get(entry.path);
    if (actual?.size !== entry.size || actual?.lfs?.size !== entry.size
      || !/^[a-f0-9]{64}$/u.test(actual?.lfs?.oid ?? "")) {
      fail("TREE_ENTRY_INVALID", entry.path);
    }
  }
  return { byPath, recordProjection };
}

const encodedId = SWE_SMITH_CROSS_FORMAT_DATASET_ID.split("/")
  .map(encodeURIComponent).join("/");
const api = `https://huggingface.co/api/datasets/${encodedId}`;
const recordUrl = `${api}/revision/${SWE_SMITH_CROSS_FORMAT_REVISION}`;
const treeUrl = `${api}/tree/${SWE_SMITH_CROSS_FORMAT_REVISION}?recursive=true&limit=1000`;

async function acquireSource(root) {
  mkdirPrivate(path.join(root, "metadata"));
  mkdirPrivate(path.join(root, "files"));
  mkdirPrivate(path.join(root, "ranges"));
  const beforeRecord = path.join(root, "metadata/dataset-record-before.json");
  const beforeTree = path.join(root, "metadata/full-tree-before.json");
  await downloadSmall(beforeRecord, recordUrl, 4 * 1024 * 1024);
  await downloadSmall(beforeTree, treeUrl, 4 * 1024 * 1024);
  const before = validatePreflight(beforeRecord, beforeTree);
  await downloadSmall(path.join(root, "files/.gitattributes"),
    sourceUrl(".gitattributes", "raw"), 64 * 1024);
  await downloadSmall(path.join(root, "files/README.md"),
    sourceUrl("README.md", "raw"), 2 * 1024 * 1024);

  let planned = 0;
  for (const entry of SWE_SMITH_CROSS_FORMAT_RANGE_PLAN) {
    for (const range of entry.ranges) planned += range[1] - range[0] + 1;
  }
  if (planned !== RANGE_SOURCE_BYTES || planned > 300_000_000) {
    fail("RANGE_PLAN_BUDGET_INVALID");
  }
  let cursor = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= SWE_SMITH_CROSS_FORMAT_RANGE_PLAN.length) return;
      const entry = SWE_SMITH_CROSS_FORMAT_RANGE_PLAN[index];
      await downloadEntryRanges(root, entry, before.byPath.get(entry.path));
    }
  });
  await Promise.all(workers);

  const afterTree = path.join(root, "metadata/full-tree-after.json");
  const afterRecord = path.join(root, "metadata/dataset-record-after.json");
  await downloadSmall(afterTree, treeUrl, 4 * 1024 * 1024);
  await downloadSmall(afterRecord, recordUrl, 4 * 1024 * 1024);
  const after = validatePreflight(afterRecord, afterTree);
  if (JSON.stringify(before.recordProjection)
      !== JSON.stringify(after.recordProjection)
    || !readFileSync(beforeTree).equals(readFileSync(afterTree))) {
    fail("MATERIAL_STATE_CHANGED");
  }
}

async function main(options) {
  const workspace = path.resolve(".");
  const target = path.resolve(options.outputDir);
  const checkpoint = `${target}.source-checkpoint`;
  validateTarget(workspace, target, checkpoint);
  await acquireSource(checkpoint);
  if (options.sourceOnly) {
    process.stdout.write(`${JSON.stringify({ ok: true, sourceOnly: true,
      checkpoint, rangeSourceBytes: RANGE_SOURCE_BYTES })}\n`);
    return;
  }
  let sourceMoved = false;
  try {
    const expected = ["files", "metadata", "ranges"];
    if (readdirSync(checkpoint).sort().join("\0") === expected.sort().join("\0")) {
      const manifest = createSweSmithCrossFormatSourceManifestFromDirectory(checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeSweSmithCrossFormatArtifact(manifest));
    }
    const built = buildSweSmithCrossFormatArtifactFromSourceDirectory(checkpoint);
    const manifestBytes = serializeSweSmithCrossFormatArtifact(built.sourceManifest);
    const reportBytes = serializeSweSmithCrossFormatArtifact(built.report);
    const receipt = createSweSmithCrossFormatReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeSweSmithCrossFormatArtifact(receipt));
    const checked = verifySweSmithCrossFormatArtifactDirectory(target);
    if (!checked.ok) fail("PUBLISHED_ARTIFACT_REPLAY_FAILED", checked.error);
    process.stdout.write(`${JSON.stringify({ ok: true, outputDir: target,
      artifactHash: checked.report.artifactHash,
      receiptHash: checked.receipt.receiptHash })}\n`);
  } catch (error) {
    if (sourceMoved && existsSync(path.join(target, "source"))
      && !existsSync(checkpoint)) {
      renameSync(path.join(target, "source"), checkpoint);
    }
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

await main(parseArgs(process.argv.slice(2)));
