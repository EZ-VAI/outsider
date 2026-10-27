#!/usr/bin/env node

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
  TERMINAL_BENCH_LEADERBOARD_DATASET_ID,
  TERMINAL_BENCH_LEADERBOARD_REVISION,
  TERMINAL_BENCH_SELECTED_TASK,
  TERMINAL_BENCH_SELECTED_TASK_TREE,
  TERMINAL_BENCH_TASK_COMMIT,
  TERMINAL_BENCH_TASK_REPOSITORY,
  TERMINAL_BENCH_TASK_ROOT_TREE,
  buildTerminalBenchAdaptiveTrialsArtifactFromSourceDirectory,
  createTerminalBenchAdaptiveTrialsReceipt,
  createTerminalBenchAdaptiveTrialsSourceManifestFromDirectory,
  serializeTerminalBenchAdaptiveTrialsArtifact,
  verifyTerminalBenchAdaptiveTrialsArtifactDirectory,
} from "../src/outsider-terminal-bench-adaptive-trials.js";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT =
  "artifacts/outsider-terminal-bench-adaptive-trials-20260829-v1";
const SUBMISSION = "Terminus2__DeepSeek-V3.2";
const RUN = "2026-02-07__07-47-43";
const BASE = `submissions/terminal-bench/2.0/${SUBMISSION}`;
const RUN_BASE = `${BASE}/${RUN}`;
const TRIAL_IDS = ["j2dYmiT", "psAuVJK", "qdhwC4A", "vKShZVu", "wEPyjMJ"];

function fail(code, detail = null) {
  throw new Error(detail === null ? `TERMINAL_BENCH_ADAPTIVE_ACQUIRE_${code}`
    : `TERMINAL_BENCH_ADAPTIVE_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-terminal-bench-adaptive-trials.mjs [--output-dir <new-dir>]",
        "",
        "Acquires one complete five-trial Terminal-Bench 2 same-task group and",
        "the exact task Git commit. Source commands and scripts are never executed.",
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

function pinnedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== ""
    || !["huggingface.co", "api.github.com", "raw.githubusercontent.com"]
      .includes(url.hostname)) fail("URL_INVALID", value);
  const decoded = decodeURIComponent(url.pathname);
  if (url.hostname === "huggingface.co") {
    if (!decoded.includes(TERMINAL_BENCH_LEADERBOARD_DATASET_ID)
      || decoded !== `/api/datasets/${TERMINAL_BENCH_LEADERBOARD_DATASET_ID}/revision/${TERMINAL_BENCH_LEADERBOARD_REVISION}`
        && !decoded.includes(TERMINAL_BENCH_LEADERBOARD_REVISION)) {
      fail("URL_INVALID", value);
    }
  } else if (url.hostname === "api.github.com") {
    if (!decoded.startsWith(`/repos/${TERMINAL_BENCH_TASK_REPOSITORY}/git/`)
      || !decoded.includes(TERMINAL_BENCH_TASK_COMMIT)
        && !decoded.includes(TERMINAL_BENCH_TASK_ROOT_TREE)
        && !decoded.includes(TERMINAL_BENCH_SELECTED_TASK_TREE)) {
      fail("URL_INVALID", value);
    }
  } else if (!decoded.startsWith(
    `/${TERMINAL_BENCH_TASK_REPOSITORY}/${TERMINAL_BENCH_TASK_COMMIT}/${TERMINAL_BENCH_SELECTED_TASK}/`)) {
    fail("URL_INVALID", value);
  }
  return url.href;
}

async function download(file, value, maximumSeconds = 600) {
  const url = pinnedUrl(value);
  ensurePrivateDirectory(path.dirname(file));
  await execFileAsync("/usr/bin/curl", [
    "--fail", "--location", "--silent", "--show-error",
    "--proto", "=https", "--proto-redir", "=https",
    "--retry", "6", "--retry-all-errors", "--retry-delay", "1",
    "--retry-max-time", String(maximumSeconds),
    "--connect-timeout", "30", "--max-time", String(maximumSeconds),
    "--header", "Accept-Encoding: identity",
    "--header", "Accept: application/vnd.github+json",
    "--header", "X-GitHub-Api-Version: 2022-11-28",
    "--user-agent", "outsider-terminal-bench-adaptive-trials/1.0",
    "--output", file, url,
  ], { timeout: (maximumSeconds + 30) * 1_000, maxBuffer: 1024 * 1024 });
  chmodSync(file, 0o600);
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink() || status.size < 1) {
    fail("DOWNLOAD_INVALID", file);
  }
}

async function mapLimit(items, limit, callback) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function encodeRepoPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

const encodedDataset = TERMINAL_BENCH_LEADERBOARD_DATASET_ID
  .split("/").map(encodeURIComponent).join("/");
const hfApi = `https://huggingface.co/api/datasets/${encodedDataset}`;
const hfTree = `${hfApi}/tree/${TERMINAL_BENCH_LEADERBOARD_REVISION}`;
const hfResolve =
  `https://huggingface.co/datasets/${encodedDataset}/resolve/${TERMINAL_BENCH_LEADERBOARD_REVISION}`;
const githubApi = `https://api.github.com/repos/${TERMINAL_BENCH_TASK_REPOSITORY}`;
const githubRaw =
  `https://raw.githubusercontent.com/${TERMINAL_BENCH_TASK_REPOSITORY}/${TERMINAL_BENCH_TASK_COMMIT}`;

function metadataUrls() {
  return new Map([
    ["leaderboard-record",
      `${hfApi}/revision/${TERMINAL_BENCH_LEADERBOARD_REVISION}`],
    ["leaderboard-root-tree", `${hfTree}?limit=1000`],
    ["leaderboard-submissions-tree", `${hfTree}/submissions?limit=1000`],
    ["leaderboard-terminal-tree",
      `${hfTree}/submissions/terminal-bench?limit=1000`],
    ["leaderboard-v2-tree",
      `${hfTree}/submissions/terminal-bench/2.0?limit=1000`],
    ["leaderboard-submission-tree", `${hfTree}/${BASE}?limit=1000`],
    ["leaderboard-run-tree", `${hfTree}/${RUN_BASE}?limit=1000`],
    ...TRIAL_IDS.map((id) => [
      `leaderboard-trial-${id}-tree`,
      `${hfTree}/${RUN_BASE}/${TERMINAL_BENCH_SELECTED_TASK}__${id}?recursive=true&limit=1000`,
    ]),
    ["task-commit", `${githubApi}/git/commits/${TERMINAL_BENCH_TASK_COMMIT}`],
    ["task-root-tree", `${githubApi}/git/trees/${TERMINAL_BENCH_TASK_ROOT_TREE}`],
    ["task-selected-tree",
      `${githubApi}/git/trees/${TERMINAL_BENCH_SELECTED_TASK_TREE}?recursive=1`],
  ]);
}

function parseTree(file) {
  const value = JSON.parse(readFileSync(file, "utf8"));
  return Array.isArray(value) ? value : value.tree;
}

function sourcePlan(metadata) {
  const values = new Map();
  for (const [name] of metadataUrls()) {
    values.set(name, parseTree(path.join(metadata, `${name}-before.json`)));
  }
  const files = [];
  const find = (name, repoPath) => {
    const entry = values.get(name).find((item) => item.path === repoPath
      && ["file", "blob"].includes(item.type));
    if (!entry) fail("SOURCE_PLAN_ENTRY_MISSING", repoPath);
    files.push({ namespace: "leaderboard", repoPath });
  };
  find("leaderboard-root-tree", "README.md");
  find("leaderboard-submission-tree", `${BASE}/metadata.yaml`);
  find("leaderboard-run-tree", `${RUN_BASE}/config.json`);
  find("leaderboard-run-tree", `${RUN_BASE}/result.json`);
  for (const id of TRIAL_IDS) {
    for (const entry of values.get(`leaderboard-trial-${id}-tree`)) {
      if (entry.type === "file") files.push({ namespace: "leaderboard",
        repoPath: entry.path });
    }
  }
  for (const entry of values.get("task-selected-tree")) {
    if (entry.type === "blob") files.push({ namespace: "task",
      repoPath: `${TERMINAL_BENCH_SELECTED_TASK}/${entry.path}` });
  }
  if (files.length !== 347) fail("SOURCE_PLAN_COUNT_INVALID", files.length);
  return files;
}

async function acquireSource(checkpoint, staging) {
  mkdirPrivate(staging);
  const source = path.join(staging, "source");
  const files = path.join(source, "files");
  const metadata = path.join(source, "metadata");
  mkdirPrivate(source);
  mkdirPrivate(files);
  mkdirPrivate(metadata);
  const urls = metadataUrls();
  for (const [name, url] of urls) {
    await download(path.join(metadata, `${name}-before.json`), url, 180);
  }
  const plan = sourcePlan(metadata);
  await mapLimit(plan, 6, async (item) => {
    const local = path.join(files, item.namespace, ...item.repoPath.split("/"));
    const url = item.namespace === "leaderboard"
      ? `${hfResolve}/${encodeRepoPath(item.repoPath)}?download=true`
      : `${githubRaw}/${encodeRepoPath(item.repoPath)}`;
    await download(local, url, 900);
  });
  for (const [name, url] of [...urls].reverse()) {
    await download(path.join(metadata, `${name}-after.json`), url, 180);
  }
  renameSync(source, checkpoint);
}

async function acquire(outputDir) {
  const workspace = path.resolve(".");
  const target = path.resolve(outputDir);
  const checkpoint = `${target}.source-checkpoint`;
  validateTarget(workspace, target, checkpoint);
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  let sourceMoved = false;
  try {
    if (!existsSync(checkpoint)) await acquireSource(checkpoint, staging);
    const names = sorted(readdirSync(checkpoint));
    if (names.join("\0") === ["files", "metadata"].join("\0")) {
      const manifest = createTerminalBenchAdaptiveTrialsSourceManifestFromDirectory(
        checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeTerminalBenchAdaptiveTrialsArtifact(manifest));
    }
    const built = buildTerminalBenchAdaptiveTrialsArtifactFromSourceDirectory(checkpoint);
    const manifestBytes = serializeTerminalBenchAdaptiveTrialsArtifact(
      built.sourceManifest);
    const reportBytes = serializeTerminalBenchAdaptiveTrialsArtifact(built.report);
    const receipt = createTerminalBenchAdaptiveTrialsReceipt(
      built.report, reportBytes, manifestBytes);

    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeTerminalBenchAdaptiveTrialsArtifact(receipt));
    const checked = verifyTerminalBenchAdaptiveTrialsArtifactDirectory(target);
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
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  }
}

const options = parseArgs(process.argv.slice(2));
await acquire(options.outputDir);

