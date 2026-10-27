#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  AGENTHORIZON_DATASET_ID,
  AGENTHORIZON_REVISION,
  AGENTHORIZON_SELECTED_SUPPORT_PATHS,
  AGENTHORIZON_SELECTED_TRAJECTORIES,
  buildAgentHorizonReciprocalPairArtifactFromSourceDirectory,
  createAgentHorizonReciprocalPairReceipt,
  createAgentHorizonReciprocalPairSourceManifestFromDirectory,
  serializeAgentHorizonReciprocalPairArtifact,
  verifyAgentHorizonReciprocalPairArtifactDirectory,
} from "../src/outsider-agenthorizon-reciprocal-sibling-pair.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-agenthorizon-reciprocal-sibling-pair-20260829-v1";
const POSITIVES = AGENTHORIZON_SELECTED_TRAJECTORIES
  .filter((item) => Number.isSafeInteger(item.steps));
const JSON_PATHS = AGENTHORIZON_SELECTED_TRAJECTORIES.map((item) =>
  `sandbox/data/jsons/${item.trajectoryId}.json`);
const MARKDOWN_PATHS = AGENTHORIZON_SELECTED_TRAJECTORIES.map((item) =>
  `sandbox/data/markdowns/${item.trajectoryId}.md`);
const TEXT_PATHS = [
  ...AGENTHORIZON_SELECTED_SUPPORT_PATHS, ...JSON_PATHS, ...MARKDOWN_PATHS,
];
const MAX_RECORD_BYTES = 12 * 1024 * 1024;
const MAX_TREE_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENTHORIZON_PAIR_ACQUIRE_${code}`
    : `AGENTHORIZON_PAIR_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-agenthorizon-reciprocal-sibling-pair.mjs [--output-dir <new-dir>] [--source-only]",
        "",
        "Acquires one reciprocal AgentHorizon sibling pair: four labels/JSON/",
        "markdown items and two complete fixed-revision screenshot directories.",
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

function encodedDataset() {
  return AGENTHORIZON_DATASET_ID.split("/").map(encodeURIComponent).join("/");
}

function encodedPath(relative) {
  return relative.split("/").map(encodeURIComponent).join("/");
}

function sourceUrl(relative) {
  return `https://huggingface.co/datasets/${encodedDataset()}/resolve/${
    AGENTHORIZON_REVISION}/${encodedPath(relative)}?download=true`;
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

async function fetchBytes(url, maximumBytes, minimumBytes = 1) {
  return retry(async () => {
    const response = await fetch(url, { redirect: "follow", headers: {
      "Accept-Encoding": "identity",
      "User-Agent": "outsider-agenthorizon-pair/1.0",
    } });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < minimumBytes || bytes.length > maximumBytes) {
      throw new Error(`SIZE_${bytes.length}`);
    }
    return bytes;
  }, "DOWNLOAD_FAILED");
}

async function fetchPage(url) {
  return retry(async () => {
    const response = await fetch(url, { redirect: "error", headers: {
      "Accept-Encoding": "identity",
      "User-Agent": "outsider-agenthorizon-pair/1.0",
    } });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 2 || bytes.length > MAX_TREE_PAGE_BYTES) {
      throw new Error(`TREE_PAGE_SIZE_${bytes.length}`);
    }
    return { bytes, link: response.headers.get("link") };
  }, "TREE_PAGE_DOWNLOAD_FAILED");
}

async function downloadSmall(file, url, maximumBytes, allowEmpty = false) {
  if (existsSync(file)) return;
  writePrivate(file, await fetchBytes(url, maximumBytes, allowEmpty ? 0 : 1));
}

function recordProjection(bytes) {
  const value = JSON.parse(bytes);
  const siblings = value.siblings;
  if (!Array.isArray(siblings)) fail("RECORD_SIBLINGS_INVALID");
  const paths = siblings.map((entry) => entry.rfilename);
  const pathSet = new Set(paths);
  for (const required of TEXT_PATHS) {
    if (!pathSet.has(required)) fail("RECORD_REQUIRED_PATH_MISSING", required);
  }
  const licenseFiles = paths.filter((entry) =>
    /(^|\/)(licen[cs]e|copying)(\.|$)/iu.test(entry));
  const projection = {
    id: value.id, sha: value.sha, lastModified: value.lastModified,
    private: value.private, gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, siblingCount: paths.length,
    siblingPathSha256: sha256(Buffer.from(JSON.stringify([...paths].sort()))),
    cardLicense: value.cardData?.license ?? null,
    promptPathPresent: pathSet.has("sandbox/prompt.md"),
    licenseTags: (value.tags ?? []).filter((entry) =>
      typeof entry === "string" && entry.startsWith("license:")),
    licenseFiles,
  };
  if (projection.id !== AGENTHORIZON_DATASET_ID
    || projection.sha !== AGENTHORIZON_REVISION
    || projection.lastModified !== "2026-06-09T01:52:11.000Z"
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false || projection.usedStorage !== 42_822_925_824
    || projection.siblingCount !== 99_144 || projection.cardLicense !== null
    || projection.promptPathPresent !== false
    || projection.licenseTags.length !== 0 || projection.licenseFiles.length !== 0) {
    fail("RECORD_PROFILE_INVALID");
  }
  return { projection, pathSet };
}

function treeUrl(stepsId) {
  const encodedPrefix = encodeURIComponent(
    `sandbox/data/media/images/${stepsId}`);
  return `https://huggingface.co/api/datasets/${encodedDataset()}/tree/${
    AGENTHORIZON_REVISION}/${encodedPrefix}?expand=false&limit=100`;
}

function treeFile(metadata, stepsId, when, page) {
  return path.join(metadata,
    `selected-tree-${stepsId}-${when}-page${page}.json`);
}

function nextLink(value) {
  if (typeof value !== "string") return null;
  const match = /<([^>]+)>;\s*rel="next"/u.exec(value);
  if (match === null) return null;
  const parsed = new URL(match[1]);
  if (parsed.protocol !== "https:" || parsed.hostname !== "huggingface.co"
    || parsed.username || parsed.password
    || !decodeURIComponent(parsed.pathname).includes(AGENTHORIZON_REVISION)) {
    fail("TREE_NEXT_LINK_INVALID");
  }
  return parsed.href;
}

async function acquireTreeSnapshot(metadata, stepsId, when) {
  const firstFile = treeFile(metadata, stepsId, when, 1);
  const secondFile = treeFile(metadata, stepsId, when, 2);
  if (!existsSync(firstFile) || !existsSync(secondFile)) {
    const first = await fetchPage(treeUrl(stepsId));
    const next = nextLink(first.link);
    if (next === null) fail("TREE_SECOND_PAGE_MISSING", stepsId);
    const second = await fetchPage(next);
    if (nextLink(second.link) !== null) fail("TREE_UNEXPECTED_THIRD_PAGE", stepsId);
    if (existsSync(firstFile)) {
      if (!readFileSync(firstFile).equals(first.bytes)) fail("TREE_PAGE_CHANGED");
    } else writePrivate(firstFile, first.bytes);
    if (existsSync(secondFile)) {
      if (!readFileSync(secondFile).equals(second.bytes)) fail("TREE_PAGE_CHANGED");
    } else writePrivate(secondFile, second.bytes);
  }
  const pages = [JSON.parse(readFileSync(firstFile)), JSON.parse(readFileSync(secondFile))];
  const entries = pages.flat();
  const expected = POSITIVES.find((item) => item.stepsId === stepsId);
  if (pages[0].length !== 100 || pages[1].length !== expected.imageFiles - 100
    || entries.length !== expected.imageFiles
    || entries.reduce((sum, entry) => sum + entry.size, 0) !== expected.imageBytes) {
    fail("TREE_CENSUS_INVALID", stepsId);
  }
  return entries;
}

async function downloadImage(root, file, entry) {
  if (existsSync(file)) {
    const status = lstatSync(file);
    if (!status.isFile() || status.isSymbolicLink()
      || (status.mode & 0o777) !== 0o600 || status.size !== entry.size
      || sha256(readFileSync(file)) !== entry.lfs.oid) {
      fail("EXISTING_IMAGE_INVALID", entry.path);
    }
    return;
  }
  const bytes = await fetchBytes(sourceUrl(entry.path), entry.size);
  if (bytes.length !== entry.size || sha256(bytes) !== entry.lfs.oid) {
    fail("IMAGE_LFS_PIN_INVALID", entry.path);
  }
  ensureParents(file, root);
  writePrivate(file, bytes);
}

async function acquireSource(root) {
  const metadata = path.join(root, "metadata");
  const files = path.join(root, "files");
  mkdirPrivate(metadata);
  mkdirPrivate(files);
  const recordUrl = `https://huggingface.co/api/datasets/${encodedDataset()}/revision/${
    AGENTHORIZON_REVISION}`;
  const beforeRecord = path.join(metadata, "dataset-record-before.json");
  await downloadSmall(beforeRecord, recordUrl, MAX_RECORD_BYTES);
  const before = recordProjection(readFileSync(beforeRecord));
  const beforeTrees = new Map();
  for (const positive of POSITIVES) {
    beforeTrees.set(positive.stepsId,
      await acquireTreeSnapshot(metadata, positive.stepsId, "before"));
  }
  for (const entries of beforeTrees.values()) {
    for (const entry of entries) {
      if (!before.pathSet.has(entry.path)) fail("IMAGE_SIBLING_MISSING", entry.path);
    }
  }
  for (const relative of TEXT_PATHS) {
    const destination = path.join(files, relative);
    ensureParents(destination, root);
    await downloadSmall(destination, sourceUrl(relative), MAX_TEXT_BYTES,
      relative === "sandbox/.gitkeep");
  }
  const imageEntries = [...beforeTrees.values()].flat();
  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= imageEntries.length) return;
      const entry = imageEntries[index];
      await downloadImage(root, path.join(files, entry.path), entry);
    }
  });
  await Promise.all(workers);
  process.stdout.write(`${JSON.stringify({ checkpoint: "selected-images",
    files: imageEntries.length,
    bytes: imageEntries.reduce((sum, entry) => sum + entry.size, 0) })}\n`);

  for (const positive of POSITIVES) {
    await acquireTreeSnapshot(metadata, positive.stepsId, "after");
  }
  const afterRecord = path.join(metadata, "dataset-record-after.json");
  await downloadSmall(afterRecord, recordUrl, MAX_RECORD_BYTES);
  const after = recordProjection(readFileSync(afterRecord));
  if (JSON.stringify(before.projection) !== JSON.stringify(after.projection)) {
    fail("MATERIAL_RECORD_STATE_CHANGED");
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
      checkpoint, selectedImageFiles: 246, selectedImageBytes: 50_202_493 })}\n`);
    return;
  }
  let sourceMoved = false;
  try {
    if (readdirSync(checkpoint).sort().join("\0")
      === ["files", "metadata"].sort().join("\0")) {
      const manifest = createAgentHorizonReciprocalPairSourceManifestFromDirectory(
        checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeAgentHorizonReciprocalPairArtifact(manifest));
    }
    const built = buildAgentHorizonReciprocalPairArtifactFromSourceDirectory(
      checkpoint);
    const manifestBytes = serializeAgentHorizonReciprocalPairArtifact(
      built.sourceManifest);
    const reportBytes = serializeAgentHorizonReciprocalPairArtifact(built.report);
    const receipt = createAgentHorizonReciprocalPairReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeAgentHorizonReciprocalPairArtifact(receipt));
    const checked = verifyAgentHorizonReciprocalPairArtifactDirectory(target);
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
