#!/usr/bin/env node

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
  RBY1_FOLD_HIL_DATASET_ID,
  RBY1_FOLD_HIL_REVISION,
  buildRby1FoldHilArtifactFromSourceDirectory,
  createRby1FoldHilReceipt,
  createRby1FoldHilSourceManifestFromDirectory,
  serializeRby1FoldHilArtifact,
  verifyRby1FoldHilArtifactDirectory,
} from "../src/outsider-rby1-fold-hil-correction-slice.js";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT =
  "artifacts/outsider-rby1-fold-hil-correction-slice-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `RBY1_FOLD_HIL_ACQUIRE_${code}`
    : `RBY1_FOLD_HIL_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, reuseNoVideoDir: null,
    pythonExecutable: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--reuse-no-video-dir" && argv[index + 1]) {
      result.reuseNoVideoDir = argv[++index];
    } else if (argument === "--python" && argv[index + 1]) {
      result.pythonExecutable = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-rby1-fold-hil-correction-slice.mjs [options]",
        "",
        "Options:",
        "  --output-dir <new-dir>",
        "  --reuse-no-video-dir <exact-fixed-revision-files>",
        "  --python <python-with-pyarrow-and-numpy>",
        "",
        "Acquires all nine non-video objects from the pinned RB-Y1 v1.1 tree.",
        "MP4 payloads are excluded; telemetry and annotations remain inert data.",
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
    || !pathname.includes(RBY1_FOLD_HIL_DATASET_ID)
    || !pathname.includes(RBY1_FOLD_HIL_REVISION)) fail("URL_INVALID", value);
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

async function download(file, value, maximumSeconds = 300, exactBytes = null) {
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
      "--user-agent", "outsider-rby1-fold-hil-correction-slice/1.0",
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

function copyPrivate(source, destination, exactBytes) {
  const sourceStatus = lstatSync(source);
  if (!sourceStatus.isFile() || sourceStatus.isSymbolicLink()
    || sourceStatus.size !== exactBytes) fail("REUSE_SOURCE_INVALID", source);
  if (existingPrivateFile(destination, exactBytes)) return;
  ensurePrivateDirectory(path.dirname(destination));
  const temporary = `${destination}.copy-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    copyFileSync(source, temporary, constants.COPYFILE_EXCL);
    chmodSync(temporary, 0o600);
    const copied = lstatSync(temporary);
    if (!copied.isFile() || copied.isSymbolicLink()
      || copied.size !== exactBytes) fail("COPY_INVALID", destination);
    renameSync(temporary, destination);
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

function encodeRepoPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

const encodedId = RBY1_FOLD_HIL_DATASET_ID.split("/")
  .map(encodeURIComponent).join("/");
const api = `https://huggingface.co/api/datasets/${encodedId}`;
const recordUrl = `${api}/revision/${RBY1_FOLD_HIL_REVISION}`;
const treeUrl = `${api}/tree/${RBY1_FOLD_HIL_REVISION}?recursive=true&limit=1000`;
const resolve =
  `https://huggingface.co/datasets/${encodedId}/resolve/${RBY1_FOLD_HIL_REVISION}`;

async function acquireSource(checkpoint, options) {
  ensurePrivateDirectory(checkpoint);
  await mapLimit([
    ["metadata/dataset-record-before.json", recordUrl, 8_267],
    ["metadata/full-tree-before.json", treeUrl, 31_817],
  ], 2, async ([relative, url, bytes]) => {
    await download(path.join(checkpoint, relative), url, 240, bytes);
  });
  const tree = JSON.parse(readFileSync(
    path.join(checkpoint, "metadata/full-tree-before.json"), "utf8"));
  const files = tree.filter((entry) => entry.type === "file");
  const selected = files.filter((entry) => !entry.path.endsWith(".mp4"));
  const excluded = files.filter((entry) => entry.path.endsWith(".mp4"));
  if (tree.length !== 106 || files.length !== 93 || selected.length !== 9
    || selected.reduce((sum, entry) => sum + entry.size, 0) !== 12_020_956
    || excluded.length !== 84
    || excluded.reduce((sum, entry) => sum + entry.size, 0) !== 3_886_601_917) {
    fail("TREE_PROFILE_INVALID");
  }
  await mapLimit(selected, 6, async (entry) => {
    if (typeof entry.path !== "string" || !Number.isSafeInteger(entry.size)
      || entry.size < 0) fail("TREE_ENTRY_INVALID");
    const target = path.join(checkpoint, "files", ...entry.path.split("/"));
    if (options.reuseNoVideoDir !== null) {
      copyPrivate(path.join(path.resolve(options.reuseNoVideoDir),
        ...entry.path.split("/")), target, entry.size);
    } else {
      await download(target,
        `${resolve}/${encodeRepoPath(entry.path)}?download=true`, 600, entry.size);
    }
  });
  await mapLimit([
    ["metadata/full-tree-after.json", treeUrl, 31_817],
    ["metadata/dataset-record-after.json", recordUrl, 8_267],
  ], 2, async ([relative, url, bytes]) => {
    await download(path.join(checkpoint, relative), url, 240, bytes);
  });
}

async function acquire(options) {
  const workspace = path.resolve(".");
  const target = path.resolve(options.outputDir);
  const checkpoint = `${target}.source-checkpoint`;
  validateTarget(workspace, target, checkpoint);
  let sourceMoved = false;
  try {
    await acquireSource(checkpoint, options);
    const names = sorted(readdirSync(checkpoint));
    if (names.join("\0") === ["files", "metadata"].join("\0")) {
      const manifest = createRby1FoldHilSourceManifestFromDirectory(checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeRby1FoldHilArtifact(manifest));
    }
    const built = buildRby1FoldHilArtifactFromSourceDirectory(checkpoint,
      { pythonExecutable: options.pythonExecutable });
    const manifestBytes = serializeRby1FoldHilArtifact(built.sourceManifest);
    const reportBytes = serializeRby1FoldHilArtifact(built.report);
    const receipt = createRby1FoldHilReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeRby1FoldHilArtifact(receipt));
    const checked = verifyRby1FoldHilArtifactDirectory(target,
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
