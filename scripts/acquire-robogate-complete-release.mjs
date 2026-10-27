#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  ROBOGATE_DATASET_ID, ROBOGATE_GITHUB_COMMIT,
  ROBOGATE_GITHUB_REPOSITORY, ROBOGATE_GITHUB_TREE, ROBOGATE_REVISION,
  buildRoboGateArtifactFromSourceDirectory, createRoboGateReceipt,
  createRoboGateSourceManifestFromDirectory, serializeRoboGateArtifact,
  verifyRoboGateArtifactDirectory,
} from "../src/outsider-robogate-complete-release.js";

const DEFAULT_OUTPUT = "artifacts/outsider-robogate-complete-release-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `ROBOGATE_ACQUIRE_${code}`
    : `ROBOGATE_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, reuseReleaseDir: null,
    reuseGithubEvidenceDir: null, pythonExecutable: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--reuse-release-dir" && argv[index + 1]) {
      result.reuseReleaseDir = argv[++index];
    } else if (argument === "--reuse-github-evidence-dir" && argv[index + 1]) {
      result.reuseGithubEvidenceDir = argv[++index];
    } else if (argument === "--python" && argv[index + 1]) {
      result.pythonExecutable = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-robogate-complete-release.mjs [options]",
        "",
        "Options:",
        "  --output-dir <new-dir>",
        "  --reuse-release-dir <exact-fixed-revision-files>",
        "  --reuse-github-evidence-dir <repository-commit-tree-files>",
        "  --python <python-with-pyarrow-and-numpy>",
        "",
        "Acquires all 28 files in the pinned 14,835,474-byte RoboGate tree.",
        "All JSON and Parquet payloads remain inert data and are never executed.",
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
  if (url.protocol !== "https:" || url.username || url.password) {
    fail("URL_INVALID", value);
  }
  const allowed = ["huggingface.co", "api.github.com",
    "raw.githubusercontent.com"].includes(url.hostname);
  if (!allowed) fail("URL_HOST_INVALID", value);
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
          "User-Agent": "outsider-robogate-complete-release/1.0" },
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

const encodedId = ROBOGATE_DATASET_ID.split("/").map(encodeURIComponent).join("/");
const hfApi = `https://huggingface.co/api/datasets/${encodedId}`;
const recordUrl = `${hfApi}/revision/${ROBOGATE_REVISION}`;
const treeUrl = `${hfApi}/tree/${ROBOGATE_REVISION}?recursive=true&limit=1000`;
const resolveUrl = `https://huggingface.co/datasets/${encodedId}/resolve/${ROBOGATE_REVISION}`;
const githubApi = `https://api.github.com/repos/${ROBOGATE_GITHUB_REPOSITORY}`;
const githubRaw = `https://raw.githubusercontent.com/${ROBOGATE_GITHUB_REPOSITORY}/${ROBOGATE_GITHUB_COMMIT}`;

async function acquireBracket(checkpoint, suffix) {
  await mapLimit([
    [`metadata/hf-record-${suffix}.json`, recordUrl, null],
    [`metadata/hf-tree-${suffix}.json`, treeUrl, 5_805],
  ], 2, async ([relative, url, bytes]) => {
    await download(path.join(checkpoint, relative), url, bytes, 600);
  });
}

async function acquireFiles(checkpoint, options) {
  const tree = JSON.parse(readFileSync(
    path.join(checkpoint, "metadata/hf-tree-before.json"), "utf8"));
  const files = tree.filter((entry) => entry.type === "file");
  if (tree.length !== 33 || files.length !== 28
    || files.reduce((sum, entry) => sum + entry.size, 0) !== 14_835_474) {
    fail("TREE_PROFILE_INVALID");
  }
  await mapLimit(files, 10, async (entry) => {
    const target = path.join(checkpoint, "files", ...entry.path.split("/"));
    if (options.reuseReleaseDir !== null) {
      copyPrivate(path.join(path.resolve(options.reuseReleaseDir),
        ...entry.path.split("/")), target, entry.size);
    } else {
      await download(target,
        `${resolveUrl}/${encodeRepoPath(entry.path)}?download=true`, entry.size, 600);
    }
  });
}

async function acquireGithub(checkpoint, options) {
  const metadata = [
    ["repository.json", githubApi, null],
    ["commit.json", `${githubApi}/commits/${ROBOGATE_GITHUB_COMMIT}`, null],
    ["tree.json", `${githubApi}/git/trees/${ROBOGATE_GITHUB_TREE}?recursive=1`, 3_050],
  ];
  if (options.reuseGithubEvidenceDir !== null) {
    for (const [name, , exact] of metadata) {
      const source = path.join(path.resolve(options.reuseGithubEvidenceDir), name);
      copyPrivate(source, path.join(checkpoint, "github", name),
        exact ?? lstatSync(source).size);
    }
    for (const name of ["LICENSE", "README.md"]) {
      const source = path.join(path.resolve(options.reuseGithubEvidenceDir), "files", name);
      copyPrivate(source, path.join(checkpoint, "github/files", name),
        lstatSync(source).size);
    }
    return;
  }
  await mapLimit(metadata, 3, async ([name, url, bytes]) => {
    await download(path.join(checkpoint, "github", name), url, bytes, 600);
  });
  const tree = JSON.parse(readFileSync(path.join(checkpoint, "github/tree.json"), "utf8"));
  await mapLimit(["LICENSE", "README.md"], 2, async (name) => {
    const entry = tree.tree.find((candidate) => candidate.path === name);
    if (!entry) fail("GITHUB_FILE_MISSING", name);
    await download(path.join(checkpoint, "github/files", name),
      `${githubRaw}/${name}`, entry.size, 600);
  });
}

async function acquireSource(checkpoint, options) {
  ensurePrivateDirectory(checkpoint);
  await acquireBracket(checkpoint, "before");
  await Promise.all([acquireFiles(checkpoint, options),
    acquireGithub(checkpoint, options)]);
  await acquireBracket(checkpoint, "after");
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
      ["files", "github", "metadata"].join("\0")) {
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeRoboGateArtifact(
          createRoboGateSourceManifestFromDirectory(checkpoint)));
    }
    const built = buildRoboGateArtifactFromSourceDirectory(checkpoint,
      { pythonExecutable: options.pythonExecutable });
    const manifestBytes = serializeRoboGateArtifact(built.sourceManifest);
    const reportBytes = serializeRoboGateArtifact(built.report);
    const receipt = createRoboGateReceipt(built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeRoboGateArtifact(receipt));
    const checked = verifyRoboGateArtifactDirectory(target,
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

await acquire(parseArgs(process.argv.slice(2)));
