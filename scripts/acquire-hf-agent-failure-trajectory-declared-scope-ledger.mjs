#!/usr/bin/env node

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync,
  rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
  HF_AGENT_FAILURE_TRAJECTORY_QUERIES,
  buildHfAgentFailureTrajectoryArtifactFromSourceDirectory,
  createHfAgentFailureTrajectoryCoverageSnapshot,
  createHfAgentFailureTrajectoryReceipt,
  createHfAgentFailureTrajectorySourceManifestFromDirectory,
  serializeHfAgentFailureTrajectoryArtifact,
  verifyHfAgentFailureTrajectoryArtifactDirectory,
} from "../src/outsider-hf-agent-failure-trajectory-declared-scope-ledger.js";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT =
  "artifacts/outsider-hf-agent-failure-trajectory-declared-scope-ledger-20260829-v1";
const HF_API = "https://huggingface.co/api/datasets";

function fail(code, detail = null) {
  throw new Error(detail === null ? `HF_AGENT_TRAJECTORY_ACQUIRE_${code}`
    : `HF_AGENT_TRAJECTORY_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-hf-agent-failure-trajectory-declared-scope-ledger.mjs [--output-dir <new-dir>]",
        "",
        "Captures exact before/after raw JSON for four fixed Hugging Face searches.",
        "No dataset payload, command, tool input, or trajectory content is executed.",
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

function queryUrl(query) {
  const url = new URL(HF_API);
  url.searchParams.set("search", query.term);
  url.searchParams.set("full", "true");
  url.searchParams.set("limit", "1000");
  if (url.origin !== "https://huggingface.co" || url.pathname !== "/api/datasets"
    || url.searchParams.get("search") !== query.term
    || url.searchParams.get("full") !== "true"
    || url.searchParams.get("limit") !== "1000"
    || [...url.searchParams.keys()].some((key) =>
      !["search", "full", "limit"].includes(key))) fail("QUERY_URL_INVALID");
  return url.href;
}

function existingPrivateFile(file, query) {
  if (!existsSync(file)) return false;
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink()
    || (status.mode & 0o777) !== 0o600 || status.size !== query.expectedBytes) {
    fail("CHECKPOINT_FILE_INVALID", file);
  }
  return true;
}

async function downloadQuery(file, query) {
  if (existingPrivateFile(file, query)) return;
  ensurePrivateDirectory(path.dirname(file));
  const temporary = `${file}.download-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    await execFileAsync("/usr/bin/curl", [
      "--fail", "--location", "--silent", "--show-error",
      "--proto", "=https", "--proto-redir", "=https",
      "--retry", "6", "--retry-all-errors", "--retry-delay", "1",
      "--retry-max-time", "180", "--connect-timeout", "30", "--max-time", "210",
      "--header", "Accept: application/json",
      "--header", "Accept-Encoding: identity",
      "--user-agent", "outsider-hf-agent-trajectory-ledger/1.0",
      "--output", temporary, queryUrl(query),
    ], { timeout: 240_000, maxBuffer: 1024 * 1024 });
    chmodSync(temporary, 0o600);
    const status = lstatSync(temporary);
    if (!status.isFile() || status.isSymbolicLink()
      || status.size !== query.expectedBytes) fail("QUERY_DOWNLOAD_SIZE_INVALID", query.key);
    renameSync(temporary, file);
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

async function acquireSource(workspace, checkpoint) {
  ensurePrivateDirectory(checkpoint);
  await mapLimit(HF_AGENT_FAILURE_TRAJECTORY_QUERIES, 4, async (query) => {
    await downloadQuery(path.join(checkpoint, "queries", `${query.key}-before.json`),
      query);
  });
  const coveragePath = path.join(checkpoint, "worktree-coverage-snapshot.json");
  if (!existsSync(coveragePath)) {
    const coverage = createHfAgentFailureTrajectoryCoverageSnapshot(workspace);
    writePrivate(coveragePath, serializeHfAgentFailureTrajectoryArtifact(coverage));
  }
  await mapLimit(HF_AGENT_FAILURE_TRAJECTORY_QUERIES, 4, async (query) => {
    await downloadQuery(path.join(checkpoint, "queries", `${query.key}-after.json`),
      query);
  });
  const manifestPath = path.join(checkpoint, "source-manifest.json");
  if (!existsSync(manifestPath)) {
    const manifest = createHfAgentFailureTrajectorySourceManifestFromDirectory(checkpoint);
    writePrivate(manifestPath, serializeHfAgentFailureTrajectoryArtifact(manifest));
  }
}

async function acquire(options) {
  const workspace = path.resolve(".");
  const target = path.resolve(options.outputDir);
  const checkpoint = `${target}.source-checkpoint`;
  validateTarget(workspace, target, checkpoint);
  let sourceMoved = false;
  try {
    await acquireSource(workspace, checkpoint);
    const built = buildHfAgentFailureTrajectoryArtifactFromSourceDirectory(checkpoint);
    const manifestBytes = readFileSync(path.join(checkpoint, "source-manifest.json"));
    const reportBytes = serializeHfAgentFailureTrajectoryArtifact(built.report);
    const receipt = createHfAgentFailureTrajectoryReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeHfAgentFailureTrajectoryArtifact(receipt));
    const checked = verifyHfAgentFailureTrajectoryArtifactDirectory(target);
    if (!checked.ok) fail("PUBLISHED_ARTIFACT_INVALID", checked.error);
    process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory: target,
      unionDatasetRecords: checked.report.discovery.unionDatasetRecords,
      terminalDatasetRecords: checked.report.discovery.terminalDatasetRecords,
      declaredScopeExhausted: true, globalExhaustion: false,
      sourceUniverseExhausted: false,
      priorityQueueRecords: checked.report.priorityQueue.queuedDatasetRecords,
      dispositionCounts: checked.report.discovery.dispositionCounts,
      artifactHash: checked.report.artifactHash,
      receiptHash: checked.receipt.receiptHash })}\n`);
  } catch (error) {
    if (sourceMoved && existsSync(path.join(target, "source"))
      && !existsSync(checkpoint)) renameSync(path.join(target, "source"), checkpoint);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

const options = parseArgs(process.argv.slice(2));
await acquire(options);
