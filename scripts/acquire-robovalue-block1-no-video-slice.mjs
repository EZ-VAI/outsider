#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  ROBOVALUE_BLOCK1_DATASET_ID,
  ROBOVALUE_BLOCK1_GITHUB_COMMIT,
  ROBOVALUE_BLOCK1_GITHUB_REPOSITORY,
  ROBOVALUE_BLOCK1_GITHUB_TREE,
  ROBOVALUE_BLOCK1_REVISION,
  buildRoboValueBlock1ArtifactFromSourceDirectory,
  createRoboValueBlock1Receipt,
  createRoboValueBlock1SourceManifestFromDirectory,
  serializeRoboValueBlock1Artifact,
  verifyRoboValueBlock1ArtifactDirectory,
} from "../src/outsider-robovalue-block1-no-video-slice.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-robovalue-block1-no-video-slice-20260829-v1";
const GITHUB_EVIDENCE = Object.freeze([
  "README.md",
  "robo_valuerl/config/data_config.py",
  "robo_valuerl/config/lerobot_features.py",
  "robo_valuerl/config/value_config.py",
  "robo_valuerl/convert_online_buffer_to_lerobot_multi.py",
  "robo_valuerl/generate_action_quality/generate_quality.py",
  "robo_valuerl/translate_dataset_to_lerobot/translate_x_humanoid_three_camera_with_quality.py",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `ROBOVALUE_BLOCK1_ACQUIRE_${code}`
    : `ROBOVALUE_BLOCK1_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, reuseBlock1Dir: null,
    reuseHfSupportDir: null, reuseGithubEvidenceDir: null,
    pythonExecutable: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--reuse-block1-dir" && argv[index + 1]) {
      result.reuseBlock1Dir = argv[++index];
    } else if (argument === "--reuse-hf-support-dir" && argv[index + 1]) {
      result.reuseHfSupportDir = argv[++index];
    } else if (argument === "--reuse-github-evidence-dir" && argv[index + 1]) {
      result.reuseGithubEvidenceDir = argv[++index];
    } else if (argument === "--python" && argv[index + 1]) {
      result.pythonExecutable = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-robovalue-block1-no-video-slice.mjs [options]",
        "",
        "Options:",
        "  --output-dir <new-dir>",
        "  --reuse-block1-dir <exact-block_data/block_1-parent>",
        "  --reuse-hf-support-dir <directory-containing-root-README-and-gitattributes>",
        "  --reuse-github-evidence-dir <directory-containing-repository-commit-tree-files>",
        "  --python <python-with-pyarrow-and-numpy>",
        "",
        "Acquires all 522 non-video block_1 objects at the pinned revision.",
        "The 777 MP4s and all downloaded publisher code remain unexecuted.",
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
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    fail("URL_INVALID", value);
  }
  const allowed = url.hostname === "huggingface.co"
    || url.hostname === "api.github.com"
    || url.hostname === "raw.githubusercontent.com";
  if (!allowed) fail("URL_HOST_INVALID", value);
  if (url.hostname === "huggingface.co"
    && (!decodeURIComponent(url.pathname).includes(ROBOVALUE_BLOCK1_DATASET_ID)
      || !decodeURIComponent(url.pathname).includes(ROBOVALUE_BLOCK1_REVISION))) {
    fail("HF_URL_PIN_INVALID", value);
  }
  if ((url.hostname === "api.github.com" || url.hostname === "raw.githubusercontent.com")
    && !decodeURIComponent(url.pathname).includes(ROBOVALUE_BLOCK1_GITHUB_REPOSITORY)) {
    fail("GITHUB_URL_REPOSITORY_INVALID", value);
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

async function fetchBytes(url, maximumSeconds) {
  let lastError = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      const response = await fetch(checkedUrl(url), {
        redirect: "follow",
        headers: { "Accept-Encoding": "identity",
          "User-Agent": "outsider-robovalue-block1-no-video-slice/1.0" },
        signal: AbortSignal.timeout(maximumSeconds * 1_000),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      if (!response.url.startsWith("https://")) fail("REDIRECT_PROTOCOL_INVALID");
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 6) await new Promise((resolve) => setTimeout(resolve,
        Math.min(8_000, 500 * (2 ** attempt))));
    }
  }
  fail("DOWNLOAD_FAILED", lastError instanceof Error ? lastError.message : String(lastError));
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
  const sourceStatus = lstatSync(source);
  if (!sourceStatus.isFile() || sourceStatus.isSymbolicLink()
    || sourceStatus.size !== exactBytes) fail("REUSE_SOURCE_INVALID", source);
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

const encodedId = ROBOVALUE_BLOCK1_DATASET_ID.split("/")
  .map(encodeURIComponent).join("/");
const hfApi = `https://huggingface.co/api/datasets/${encodedId}`;
const hfResolve = `https://huggingface.co/datasets/${encodedId}/resolve/${ROBOVALUE_BLOCK1_REVISION}`;
const recordUrl = `${hfApi}/revision/${ROBOVALUE_BLOCK1_REVISION}`;
const rootTreeUrl = `${hfApi}/tree/${ROBOVALUE_BLOCK1_REVISION}?recursive=false&limit=1000`;
const blockTreeBase = `${hfApi}/tree/${ROBOVALUE_BLOCK1_REVISION}/block_data%2Fblock_1?expand=false&recursive=true&limit=1000`;
const page2Cursor = "ZXlKbWFXeGxYMjVoYldVaU9pSmliRzlqYTE5a1lYUmhMMkpzYjJOclh6RXZkbWxrWlc5ekwyTm9kVzVyTFRBd01DOXZZbk5sY25aaGRHbHZiaTVwYldGblpTNXNaV1owTDJWd2FYTnZaR1ZmTURBd01qQTVMbTF3TkNJc0luUnlaV1ZmYjJsa0lqb2laVFUyT1RRMU16a3pOVGhqWkRFNVpUUXpNemd3WWpZeU9XUXdZVFZpWkdaa05qQTNaRFJtT0NKOToxMDAw";
const blockTreeUrls = [blockTreeBase, `${blockTreeBase}&cursor=${page2Cursor}`];
const githubApi = `https://api.github.com/repos/${ROBOVALUE_BLOCK1_GITHUB_REPOSITORY}`;
const githubRaw = `https://raw.githubusercontent.com/${ROBOVALUE_BLOCK1_GITHUB_REPOSITORY}/${ROBOVALUE_BLOCK1_GITHUB_COMMIT}`;

async function acquireBracket(checkpoint, suffix) {
  await mapLimit([
    [`metadata/hf-record-${suffix}.json`, recordUrl, null],
    [`metadata/hf-root-tree-${suffix}.json`, rootTreeUrl, 395],
    [`metadata/hf-block1-tree-page-1-${suffix}.json`, blockTreeUrls[0], 292_056],
    [`metadata/hf-block1-tree-page-2-${suffix}.json`, blockTreeUrls[1], 110_524],
  ], 4, async ([relative, url, bytes]) => {
    await download(path.join(checkpoint, relative), url, bytes, 900);
  });
}

function combineTree(checkpoint) {
  const pages = [1, 2].flatMap((page) => JSON.parse(readFileSync(path.join(
    checkpoint, `metadata/hf-block1-tree-page-${page}-before.json`), "utf8")));
  const files = pages.filter((entry) => entry.type === "file");
  const selected = files.filter((entry) => !entry.path.endsWith(".mp4"));
  const excluded = files.filter((entry) => entry.path.endsWith(".mp4"));
  if (pages.length !== 1_308 || files.length !== 1_299 || selected.length !== 522
    || selected.reduce((sum, entry) => sum + entry.size, 0) !== 45_362_943
    || excluded.length !== 777
    || excluded.reduce((sum, entry) => sum + entry.size, 0) !== 3_406_736_817) {
    fail("TREE_PROFILE_INVALID");
  }
  return selected;
}

async function acquireHfObjects(checkpoint, selected, options) {
  await mapLimit([
    [".gitattributes", 2_504], ["README.md", 4_346],
  ], 2, async ([itemPath, bytes]) => {
    const target = path.join(checkpoint, "hf-root", itemPath);
    if (options.reuseHfSupportDir !== null) {
      copyPrivate(path.join(path.resolve(options.reuseHfSupportDir), itemPath),
        target, bytes);
    } else {
      await download(target, `${hfResolve}/${encodeRepoPath(itemPath)}?download=true`,
        bytes, 600);
    }
  });
  await mapLimit(selected, 12, async (entry) => {
    if (typeof entry.path !== "string" || !Number.isSafeInteger(entry.size)) {
      fail("TREE_ENTRY_INVALID");
    }
    const target = path.join(checkpoint, "files", ...entry.path.split("/"));
    if (options.reuseBlock1Dir !== null) {
      copyPrivate(path.join(path.resolve(options.reuseBlock1Dir),
        ...entry.path.split("/")), target, entry.size);
    } else {
      await download(target,
        `${hfResolve}/${encodeRepoPath(entry.path)}?download=true`, entry.size, 900);
    }
  });
}

async function acquireGithub(checkpoint, options) {
  const metadata = [
    ["repository.json", `${githubApi}`, null],
    ["commit.json", `${githubApi}/commits/${ROBOVALUE_BLOCK1_GITHUB_COMMIT}`, null],
    ["tree.json", `${githubApi}/git/trees/${ROBOVALUE_BLOCK1_GITHUB_TREE}?recursive=1`, 278_446],
  ];
  if (options.reuseGithubEvidenceDir !== null) {
    for (const [name, , exactBytes] of metadata) {
      const source = path.join(path.resolve(options.reuseGithubEvidenceDir), name);
      copyPrivate(source, path.join(checkpoint, "github", name),
        exactBytes ?? lstatSync(source).size);
    }
    for (const evidencePath of GITHUB_EVIDENCE) {
      const source = path.join(path.resolve(options.reuseGithubEvidenceDir),
        "files", ...evidencePath.split("/"));
      copyPrivate(source, path.join(checkpoint, "github/files",
        ...evidencePath.split("/")), lstatSync(source).size);
    }
    return;
  }
  await mapLimit(metadata, 3, async ([name, url, bytes]) => {
    await download(path.join(checkpoint, "github", name), url, bytes, 600);
  });
  const tree = JSON.parse(readFileSync(path.join(checkpoint, "github/tree.json"), "utf8"));
  await mapLimit(GITHUB_EVIDENCE, 7, async (evidencePath) => {
    const entry = tree.tree.find((candidate) => candidate.type === "blob"
      && candidate.path === evidencePath);
    if (!entry) fail("GITHUB_EVIDENCE_MISSING", evidencePath);
    await download(path.join(checkpoint, "github/files",
      ...evidencePath.split("/")), `${githubRaw}/${encodeRepoPath(evidencePath)}`,
    entry.size, 600);
  });
}

async function acquireSource(checkpoint, options) {
  ensurePrivateDirectory(checkpoint);
  await acquireBracket(checkpoint, "before");
  const selected = combineTree(checkpoint);
  await Promise.all([
    acquireHfObjects(checkpoint, selected, options),
    acquireGithub(checkpoint, options),
  ]);
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
    const names = sorted(readdirSync(checkpoint));
    if (names.join("\0") === ["files", "github", "hf-root", "metadata"].join("\0")) {
      const manifest = createRoboValueBlock1SourceManifestFromDirectory(checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeRoboValueBlock1Artifact(manifest));
    }
    const built = buildRoboValueBlock1ArtifactFromSourceDirectory(checkpoint,
      { pythonExecutable: options.pythonExecutable });
    const manifestBytes = serializeRoboValueBlock1Artifact(built.sourceManifest);
    const reportBytes = serializeRoboValueBlock1Artifact(built.report);
    const receipt = createRoboValueBlock1Receipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeRoboValueBlock1Artifact(receipt));
    const checked = verifyRoboValueBlock1ArtifactDirectory(target,
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
