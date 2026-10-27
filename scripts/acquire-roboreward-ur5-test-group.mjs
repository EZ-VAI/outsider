#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  ROBOREWARD_UR5_DATASET_ID, ROBOREWARD_UR5_GROUP,
  ROBOREWARD_UR5_REVISION,
  buildRoboRewardUr5ArtifactFromSourceDirectory,
  createRoboRewardUr5Receipt,
  createRoboRewardUr5SourceManifestFromDirectory,
  serializeRoboRewardUr5Artifact,
  verifyRoboRewardUr5ArtifactDirectory,
} from "../src/outsider-roboreward-ur5-test-group.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-roboreward-ur5-test-group-20260830-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `ROBOREWARD_UR5_ACQUIRE_${code}`
    : `ROBOREWARD_UR5_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, reuseReleaseDir: null,
    reuseBracketBeforeDir: null, reuseBracketAfterDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--reuse-release-dir" && argv[index + 1]) {
      result.reuseReleaseDir = argv[++index];
    } else if (argument === "--reuse-bracket-before-dir" && argv[index + 1]) {
      result.reuseBracketBeforeDir = argv[++index];
    } else if (argument === "--reuse-bracket-after-dir" && argv[index + 1]) {
      result.reuseBracketAfterDir = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-roboreward-ur5-test-group.mjs [options]",
        "",
        "Options:",
        "  --output-dir <new-dir>",
        "  --reuse-release-dir <fixed-revision-selected-files>",
        "  --reuse-bracket-before-dir <record-root-test-group-json-dir>",
        "  --reuse-bracket-after-dir <record-root-test-group-json-dir>",
        "",
        "Acquires the complete 100-video test/berkeley_autolab_ur5 group,",
        "complete test metadata, and root support at one pinned revision.",
        "Downloaded videos and text remain inert private data.",
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
  if (existsSync(checkpoint)) {
    const status = lstatSync(checkpoint);
    if (!status.isDirectory() || status.isSymbolicLink()
      || (status.mode & 0o777) !== 0o700) fail("CHECKPOINT_UNSAFE");
  }
}

function checkedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password
    || url.hostname !== "huggingface.co") fail("URL_INVALID", value);
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

async function fetchBytes(url, maximumSeconds) {
  let last = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      const response = await fetch(checkedUrl(url), { redirect: "follow",
        headers: { "Accept-Encoding": "identity",
          "User-Agent": "outsider-roboreward-ur5-test-group/1.0" },
        signal: AbortSignal.timeout(maximumSeconds * 1_000) });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      if (!response.url.startsWith("https://")) fail("REDIRECT_PROTOCOL_INVALID");
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      last = error;
      if (attempt < 6) await new Promise((resolve) => setTimeout(resolve,
        Math.min(8_000, 500 * (2 ** attempt))));
    }
  }
  fail("DOWNLOAD_FAILED", last instanceof Error ? last.message : String(last));
}

async function download(file, url, exactBytes = null, maximumSeconds = 600) {
  if (existingPrivateFile(file, exactBytes)) return;
  ensurePrivateDirectory(path.dirname(file));
  const temporary = `${file}.download-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    const bytes = await fetchBytes(url, maximumSeconds);
    if (exactBytes !== null && bytes.length !== exactBytes) {
      fail("DOWNLOAD_SIZE_INVALID", file);
    }
    writePrivate(temporary, bytes);
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function copyPrivate(source, destination, exactBytes) {
  const status = lstatSync(source);
  if (!status.isFile() || status.isSymbolicLink() || status.size !== exactBytes) {
    fail("REUSE_SOURCE_INVALID", source);
  }
  if (existingPrivateFile(destination, exactBytes)) return;
  ensurePrivateDirectory(path.dirname(destination));
  const temporary = `${destination}.copy-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    copyFileSync(source, temporary, constants.COPYFILE_EXCL);
    chmodSync(temporary, 0o600);
    renameSync(temporary, destination);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

async function mapLimit(items, limit, callback) {
  let next = 0;
  async function worker() {
    while (next < items.length) await callback(items[next++]);
  }
  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, worker));
}

function encodeRepoPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

const encodedId = ROBOREWARD_UR5_DATASET_ID.split("/")
  .map(encodeURIComponent).join("/");
const hfApi = `https://huggingface.co/api/datasets/${encodedId}`;
const recordUrl = `${hfApi}/revision/${ROBOREWARD_UR5_REVISION}`;
const treeBase = `${hfApi}/tree/${ROBOREWARD_UR5_REVISION}`;
const resolveBase = `https://huggingface.co/datasets/${encodedId}/resolve/${ROBOREWARD_UR5_REVISION}`;
const bracket = Object.freeze([
  ["record.json", recordUrl, 5_848_348],
  ["root-tree.json", `${treeBase}?limit=1000`, 477],
  ["test-tree.json", `${treeBase}/test?limit=1000`, 2_998],
  ["group-tree.json", `${treeBase}/${ROBOREWARD_UR5_GROUP}?limit=1000`, 36_822],
]);

async function acquireBracket(checkpoint, suffix, reuseDirectory) {
  await mapLimit(bracket, 4, async ([name, url, bytes]) => {
    const target = path.join(checkpoint, "metadata",
      `hf-${name.replace(".json", "")}-${suffix}.json`);
    if (reuseDirectory !== null) {
      copyPrivate(path.join(path.resolve(reuseDirectory), name), target, bytes);
    } else await download(target, url, bytes, 600);
  });
}

function selectedEntries(checkpoint) {
  const root = JSON.parse(readFileSync(path.join(checkpoint,
    "metadata/hf-root-tree-before.json"), "utf8"));
  const test = JSON.parse(readFileSync(path.join(checkpoint,
    "metadata/hf-test-tree-before.json"), "utf8"));
  const group = JSON.parse(readFileSync(path.join(checkpoint,
    "metadata/hf-group-tree-before.json"), "utf8"));
  const entries = [...root, ...test, ...group].filter((entry) => entry.type === "file");
  if (entries.length !== 103
    || entries.reduce((sum, entry) => sum + entry.size, 0) !== 76_659_779) {
    fail("SELECTED_TREE_PROFILE_INVALID");
  }
  return entries;
}

async function acquireFiles(checkpoint, options) {
  const entries = selectedEntries(checkpoint);
  await mapLimit(entries, 8, async (entry) => {
    const target = path.join(checkpoint, "files", ...entry.path.split("/"));
    if (options.reuseReleaseDir !== null) {
      copyPrivate(path.join(path.resolve(options.reuseReleaseDir),
        ...entry.path.split("/")), target, entry.size);
    } else {
      await download(target,
        `${resolveBase}/${encodeRepoPath(entry.path)}?download=true`, entry.size, 600);
    }
  });
}

async function acquireSource(checkpoint, options) {
  ensurePrivateDirectory(checkpoint);
  await acquireBracket(checkpoint, "before", options.reuseBracketBeforeDir);
  await acquireFiles(checkpoint, options);
  await acquireBracket(checkpoint, "after", options.reuseBracketAfterDir);
}

async function acquire(options) {
  const workspace = path.resolve(".");
  const target = path.resolve(options.outputDir);
  const checkpoint = `${target}.source-checkpoint`;
  validateTarget(workspace, target, checkpoint);
  let sourceMoved = false;
  try {
    await acquireSource(checkpoint, options);
    if (sorted(readdirSync(checkpoint)).join("\0") ===
      ["files", "metadata"].join("\0")) {
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeRoboRewardUr5Artifact(
          createRoboRewardUr5SourceManifestFromDirectory(checkpoint)));
    }
    const built = buildRoboRewardUr5ArtifactFromSourceDirectory(checkpoint);
    const manifestBytes = serializeRoboRewardUr5Artifact(built.sourceManifest);
    const reportBytes = serializeRoboRewardUr5Artifact(built.report);
    const receipt = createRoboRewardUr5Receipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeRoboRewardUr5Artifact(receipt));
    const checked = verifyRoboRewardUr5ArtifactDirectory(target);
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

await acquire(parseArgs(process.argv.slice(2)));
