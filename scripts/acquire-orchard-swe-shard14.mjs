#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  openSync, closeSync, readSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import {
  ORCHARD_DATASET_ID,
  ORCHARD_REVISION,
  buildOrchardSweShard14ArtifactFromSourceDirectory,
  createOrchardSweShard14Receipt,
  createOrchardSweShard14SourceManifestFromDirectory,
  serializeOrchardSweShard14Artifact,
  verifyOrchardSweShard14ArtifactDirectory,
} from "../src/outsider-orchard-swe-shard14.js";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT = "artifacts/outsider-orchard-swe-shard14-20260829-v1";
const DEFAULT_SOURCE = path.join(tmpdir(), "orchard-swe-shard14.parquet");
const SHARD_PATH = "swe/train/data-00014-of-00019.parquet";
const SHARD_BYTES = 283_683_745;
const SHARD_SHA =
  "sha256:0d5dac902a57530a9de2dbb7a4b3a8161cf7b53f65ad017c7c7e0fe2997d1aad";

function fail(code, detail = null) {
  throw new Error(detail === null ? `ORCHARD_SWE_SHARD14_ACQUIRE_${code}`
    : `ORCHARD_SWE_SHARD14_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, sourceFile: DEFAULT_SOURCE,
    pythonExecutable: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--source-file" && argv[index + 1]) {
      result.sourceFile = argv[++index];
    } else if (argument === "--python" && argv[index + 1]) {
      result.pythonExecutable = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-orchard-swe-shard14.mjs [--output-dir <new-dir>] [--source-file <pinned-parquet>] [--python <python>]",
        "",
        "Copies a verified local shard when present; otherwise downloads the pinned shard.",
        "Parquet content is parsed as data and embedded commands are never executed.",
      ].join("\n") + "\n");
      process.exit(0);
    } else fail("ARGUMENT_INVALID", argument);
  }
  return result;
}

function mkdirPrivate(directory) {
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
}

function ensurePrivateDirectory(directory) {
  if (existsSync(directory)) return;
  ensurePrivateDirectory(path.dirname(directory));
  mkdirPrivate(directory);
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function validateTarget(workspace, target, checkpoint) {
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || existsSync(target)) {
    fail("OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE", target);
  }
  let cursor = path.dirname(target);
  const missing = [];
  while (cursor !== workspace) {
    const relation = path.relative(workspace, cursor);
    if (relation === ".." || relation.startsWith(`..${path.sep}`)) {
      fail("OUTPUT_PARENT_OUTSIDE_WORKSPACE");
    }
    if (!existsSync(cursor)) missing.push(cursor);
    cursor = path.dirname(cursor);
  }
  for (const directory of missing.reverse()) mkdirPrivate(directory);
  const parent = lstatSync(path.dirname(target));
  if (!parent.isDirectory() || parent.isSymbolicLink()) fail("OUTPUT_PARENT_UNSAFE");
  if (existsSync(checkpoint)) {
    const status = lstatSync(checkpoint);
    if (!status.isDirectory() || status.isSymbolicLink()
      || (status.mode & 0o777) !== 0o700) fail("CHECKPOINT_UNSAFE");
  }
}

function checkedUrl(value) {
  const url = new URL(value);
  const pathname = decodeURIComponent(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "huggingface.co"
    || url.username !== "" || url.password !== ""
    || !pathname.includes(ORCHARD_DATASET_ID)
    || !pathname.includes(ORCHARD_REVISION)) fail("URL_INVALID", value);
  return url.href;
}

function existingPrivateFile(file, exactBytes = null) {
  if (!existsSync(file)) return false;
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink()
    || (status.mode & 0o777) !== 0o600
    || exactBytes !== null && status.size !== exactBytes) {
    fail("CHECKPOINT_FILE_INVALID", file);
  }
  return true;
}

function hashFile(file, exactBytes) {
  const link = lstatSync(file);
  if (!link.isFile() || link.isSymbolicLink() || link.size !== exactBytes) {
    fail("LOCAL_SOURCE_INVALID", file);
  }
  const descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0;
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      total += count;
    }
    if (total !== exactBytes) fail("LOCAL_SOURCE_CHANGED", file);
    return `sha256:${hash.digest("hex")}`;
  } finally { closeSync(descriptor); }
}

async function download(file, value, maximumSeconds = 240, exactBytes = null) {
  if (existingPrivateFile(file, exactBytes)) return;
  const url = checkedUrl(value);
  ensurePrivateDirectory(path.dirname(file));
  const temporary = `${file}.download-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    await execFileAsync("/usr/bin/curl", [
      "--fail", "--location", "--silent", "--show-error",
      "--proto", "=https", "--proto-redir", "=https",
      "--retry", "6", "--retry-all-errors", "--retry-delay", "1",
      "--retry-max-time", String(maximumSeconds),
      "--connect-timeout", "30", "--max-time", String(maximumSeconds),
      "--header", "Accept-Encoding: identity",
      "--user-agent", "outsider-orchard-swe-shard14/1.0",
      "--output", temporary, url,
    ], { timeout: (maximumSeconds + 30) * 1_000, maxBuffer: 1024 * 1024 });
    chmodSync(temporary, 0o600);
    const status = lstatSync(temporary);
    if (!status.isFile() || status.isSymbolicLink()
      || exactBytes !== null && status.size !== exactBytes) {
      fail("DOWNLOAD_INVALID", file);
    }
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function copyVerifiedShard(sourceFile, target) {
  if (existingPrivateFile(target, SHARD_BYTES)) return;
  if (hashFile(sourceFile, SHARD_BYTES) !== SHARD_SHA) {
    fail("LOCAL_SOURCE_HASH_MISMATCH", sourceFile);
  }
  ensurePrivateDirectory(path.dirname(target));
  const temporary = `${target}.copy-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    copyFileSync(sourceFile, temporary, constants.COPYFILE_FICLONE);
    chmodSync(temporary, 0o600);
    if (hashFile(temporary, SHARD_BYTES) !== SHARD_SHA) {
      fail("COPIED_SOURCE_HASH_MISMATCH");
    }
    renameSync(temporary, target);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

async function mapLimit(items, limit, callback) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      await callback(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const encodedId = ORCHARD_DATASET_ID.split("/").map(encodeURIComponent).join("/");
const api = `https://huggingface.co/api/datasets/${encodedId}`;
const recordUrl = `${api}/revision/${ORCHARD_REVISION}`;
const treeUrl = `${api}/tree/${ORCHARD_REVISION}?recursive=true&limit=1000`;
const resolve =
  `https://huggingface.co/datasets/${encodedId}/resolve/${ORCHARD_REVISION}`;

async function acquireSource(checkpoint, sourceFile) {
  ensurePrivateDirectory(checkpoint);
  await mapLimit([
    ["metadata/dataset-record-before.json", recordUrl],
    ["metadata/full-tree-before.json", treeUrl],
    ["support/README.md", `${resolve}/README.md`, 23_392],
  ], 3, async ([relative, url, exactBytes]) => {
    await download(path.join(checkpoint, relative), url, 240, exactBytes ?? null);
  });

  const target = path.join(checkpoint, "files", ...SHARD_PATH.split("/"));
  if (existsSync(sourceFile)) {
    copyVerifiedShard(path.resolve(sourceFile), target);
  } else {
    await download(target, `${resolve}/${SHARD_PATH}?download=true`, 1_200,
      SHARD_BYTES);
    if (hashFile(target, SHARD_BYTES) !== SHARD_SHA) {
      fail("DOWNLOADED_SHARD_HASH_MISMATCH");
    }
  }

  await mapLimit([
    ["metadata/full-tree-after.json", treeUrl],
    ["metadata/dataset-record-after.json", recordUrl],
  ], 2, async ([relative, url]) => {
    await download(path.join(checkpoint, relative), url, 240);
  });
}

async function acquire(options) {
  const workspace = path.resolve(".");
  const target = path.resolve(options.outputDir);
  const checkpoint = `${target}.source-checkpoint`;
  validateTarget(workspace, target, checkpoint);
  let sourceMoved = false;
  try {
    await acquireSource(checkpoint, options.sourceFile);
    const names = sorted(readdirSync(checkpoint));
    if (names.join("\0") === ["files", "metadata", "support"].join("\0")) {
      const manifest = createOrchardSweShard14SourceManifestFromDirectory(checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeOrchardSweShard14Artifact(manifest));
    }
    const built = buildOrchardSweShard14ArtifactFromSourceDirectory(checkpoint,
      { pythonExecutable: options.pythonExecutable });
    const manifestBytes = serializeOrchardSweShard14Artifact(built.sourceManifest);
    const reportBytes = serializeOrchardSweShard14Artifact(built.report);
    const receipt = createOrchardSweShard14Receipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeOrchardSweShard14Artifact(receipt));
    const checked = verifyOrchardSweShard14ArtifactDirectory(target,
      { pythonExecutable: options.pythonExecutable });
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

const options = parseArgs(process.argv.slice(2));
await acquire(options);
