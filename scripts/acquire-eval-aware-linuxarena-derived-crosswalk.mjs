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
  EVAL_AWARE_LINUXARENA_DATASET_ID,
  EVAL_AWARE_LINUXARENA_HISTORICAL_ALIAS,
  EVAL_AWARE_LINUXARENA_REVISION,
  buildEvalAwareLinuxArenaArtifactFromSourceDirectory,
  createEvalAwareLinuxArenaReceipt,
  createEvalAwareLinuxArenaSourceManifestFromDirectory,
  serializeEvalAwareLinuxArenaArtifact,
  verifyEvalAwareLinuxArenaArtifactDirectory,
} from "../src/outsider-eval-aware-linuxarena-derived-crosswalk.js";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT =
  "artifacts/outsider-eval-aware-linuxarena-derived-crosswalk-20260829-v1";
const DEFAULT_RAW_ARTIFACT =
  "artifacts/outsider-linuxarena-haiku-honest-run-20260829-v1";
const PARQUET_RELATIVE = "data/train-00000-of-00001.parquet";
const RAW_PREFIX = "crosswalk/linuxarena-haiku-honest-artifact";
const RAW_FILES = Object.freeze([
  "report.json",
  "run-receipt.json",
  "source/boundary/line201-prefix.bin",
  "source/metadata/boundary-range-response.json",
  "source/metadata/dataset-record-after.json",
  "source/metadata/dataset-record-before.json",
  "source/metadata/full-tree-after.json",
  "source/metadata/full-tree-before.json",
  "source/metadata/honest-range-response.json",
  "source/selection/haiku-honest.jsonl",
  "source/source-manifest.json",
  "source/support/README.md",
  "source/support/croissant.json",
  "source/support/croissant_rai.json",
  "source/support/manifest.json",
  "source/support/scripts/build_sample.py",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `EVAL_AWARE_LINUXARENA_ACQUIRE_${code}`
    : `EVAL_AWARE_LINUXARENA_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = {
    outputDir: DEFAULT_OUTPUT,
    rawArtifact: DEFAULT_RAW_ARTIFACT,
    reuseParquet: null,
    pythonExecutable: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--raw-artifact" && argv[index + 1]) {
      result.rawArtifact = argv[++index];
    } else if (argument === "--reuse-parquet" && argv[index + 1]) {
      result.reuseParquet = argv[++index];
    } else if (argument === "--python" && argv[index + 1]) {
      result.pythonExecutable = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-eval-aware-linuxarena-derived-crosswalk.mjs [options]",
        "",
        "Options:",
        "  --output-dir <new-dir>",
        "  --raw-artifact <verified-haiku-honest-artifact>",
        "  --reuse-parquet <exact-local-parquet>",
        "  --python <python-with-pyarrow>",
        "",
        "Acquires the complete pinned derived repository and nests the separate",
        "raw-200 artifact for an execution-identity-safe crosswalk. Trajectory",
        "commands, arguments, outputs, and reasoning are never executed.",
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
  const allowedDataset = pathname.includes(EVAL_AWARE_LINUXARENA_DATASET_ID)
    || pathname.includes(EVAL_AWARE_LINUXARENA_HISTORICAL_ALIAS);
  if (url.protocol !== "https:" || url.hostname !== "huggingface.co"
    || url.username !== "" || url.password !== "" || !allowedDataset
    || !pathname.includes(EVAL_AWARE_LINUXARENA_REVISION)) {
    fail("URL_INVALID", value);
  }
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
      "--user-agent", "outsider-eval-aware-linuxarena-crosswalk/1.0",
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

function copyPrivate(source, destination, exactBytes = null) {
  const sourceStatus = lstatSync(source);
  if (!sourceStatus.isFile() || sourceStatus.isSymbolicLink()
    || exactBytes !== null && sourceStatus.size !== exactBytes) {
    fail("REUSE_SOURCE_INVALID", source);
  }
  if (existingPrivateFile(destination, exactBytes ?? sourceStatus.size)) return;
  ensurePrivateDirectory(path.dirname(destination));
  const temporary = `${destination}.copy-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    copyFileSync(source, temporary, constants.COPYFILE_EXCL);
    chmodSync(temporary, 0o600);
    const copied = lstatSync(temporary);
    if (!copied.isFile() || copied.isSymbolicLink()
      || copied.size !== sourceStatus.size) fail("COPY_INVALID", destination);
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

function encodeId(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function encodeRepoPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

const encodedId = encodeId(EVAL_AWARE_LINUXARENA_DATASET_ID);
const encodedAlias = encodeId(EVAL_AWARE_LINUXARENA_HISTORICAL_ALIAS);
const api = `https://huggingface.co/api/datasets/${encodedId}`;
const aliasApi = `https://huggingface.co/api/datasets/${encodedAlias}`;
const recordUrl = `${api}/revision/${EVAL_AWARE_LINUXARENA_REVISION}`;
const aliasRecordUrl = `${aliasApi}/revision/${EVAL_AWARE_LINUXARENA_REVISION}`;
const treeUrl = `${api}/tree/${EVAL_AWARE_LINUXARENA_REVISION}?recursive=true&limit=1000`;
const resolve =
  `https://huggingface.co/datasets/${encodedId}/resolve/${EVAL_AWARE_LINUXARENA_REVISION}`;

async function acquireSource(checkpoint, options) {
  ensurePrivateDirectory(checkpoint);
  await mapLimit([
    ["metadata/dataset-record-before.json", recordUrl, 1_661],
    ["metadata/alias-record-before.json", aliasRecordUrl, 1_661],
    ["metadata/full-tree-before.json", treeUrl, 609],
  ], 3, async ([relative, url, bytes]) => {
    await download(path.join(checkpoint, relative), url, 240, bytes);
  });

  const tree = JSON.parse(readFileSync(
    path.join(checkpoint, "metadata/full-tree-before.json"), "utf8"));
  const files = tree.filter((entry) => entry.type === "file");
  if (tree.length !== 4 || files.length !== 3
    || files.reduce((sum, entry) => sum + entry.size, 0) !== 123_664_935) {
    fail("TREE_PROFILE_INVALID");
  }
  for (const entry of files) {
    if (typeof entry.path !== "string" || !Number.isSafeInteger(entry.size)
      || entry.size < 0) fail("TREE_ENTRY_INVALID");
    const target = path.join(checkpoint, "files", ...entry.path.split("/"));
    if (entry.path === PARQUET_RELATIVE && options.reuseParquet !== null) {
      copyPrivate(path.resolve(options.reuseParquet), target, 123_656_922);
    } else {
      await download(target,
        `${resolve}/${encodeRepoPath(entry.path)}?download=true`,
        entry.path === PARQUET_RELATIVE ? 1_200 : 240, entry.size);
    }
  }

  const rawArtifact = path.resolve(options.rawArtifact);
  const rawStatus = lstatSync(rawArtifact);
  if (!rawStatus.isDirectory() || rawStatus.isSymbolicLink()
    || (rawStatus.mode & 0o777) !== 0o700) fail("RAW_ARTIFACT_DIRECTORY_UNSAFE");
  for (const relative of RAW_FILES) {
    copyPrivate(path.join(rawArtifact, ...relative.split("/")),
      path.join(checkpoint, RAW_PREFIX, ...relative.split("/")));
  }

  await mapLimit([
    ["metadata/full-tree-after.json", treeUrl, 609],
    ["metadata/dataset-record-after.json", recordUrl, 1_661],
    ["metadata/alias-record-after.json", aliasRecordUrl, 1_661],
  ], 3, async ([relative, url, bytes]) => {
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
    if (names.join("\0") === ["crosswalk", "files", "metadata"].join("\0")) {
      const manifest = createEvalAwareLinuxArenaSourceManifestFromDirectory(
        checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeEvalAwareLinuxArenaArtifact(manifest));
    }
    const built = buildEvalAwareLinuxArenaArtifactFromSourceDirectory(
      checkpoint, { pythonExecutable: options.pythonExecutable });
    const manifestBytes = serializeEvalAwareLinuxArenaArtifact(
      built.sourceManifest);
    const reportBytes = serializeEvalAwareLinuxArenaArtifact(built.report);
    const receipt = createEvalAwareLinuxArenaReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeEvalAwareLinuxArenaArtifact(receipt));
    const checked = verifyEvalAwareLinuxArenaArtifactDirectory(target,
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
