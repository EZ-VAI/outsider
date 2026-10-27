#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync,
  rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
  HF_ROBOT_INTERVENTION_QUERIES,
  buildHfRobotInterventionArtifactFromSourceDirectory,
  createHfRobotInterventionCoverageSnapshot,
  createHfRobotInterventionReceipt,
  createHfRobotInterventionSourceManifestFromDirectory,
  serializeHfRobotInterventionArtifact,
  verifyHfRobotInterventionArtifactDirectory,
} from "../src/outsider-hf-robot-intervention-declared-scope-ledger.js";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT =
  "artifacts/outsider-hf-robot-intervention-declared-scope-ledger-20260830-v1";
const HF_API = "https://huggingface.co/api/datasets";

function fail(code, detail = null) {
  throw new Error(detail === null ? `HF_ROBOT_INTERVENTION_ACQUIRE_${code}`
    : `HF_ROBOT_INTERVENTION_ACQUIRE_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, reuseLivePrefix: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--reuse-live-prefix" && argv[index + 1]) {
      result.reuseLivePrefix = path.resolve(argv[++index]);
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-hf-robot-intervention-declared-scope-ledger.mjs [--output-dir <new-dir>] [--reuse-live-prefix <prefix>]",
        "",
        "Captures exact before/after JSON for three official Hugging Face full searches.",
        "The optional prefix reads <prefix>-<key>-live-{before,after}.json after",
        "strict fixed-byte verification. No dataset payload or active content is run.",
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
  if (!parent.isDirectory() || parent.isSymbolicLink()) {
    fail("OUTPUT_PARENT_UNSAFE");
  }
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
  if (url.origin !== "https://huggingface.co"
    || url.pathname !== "/api/datasets"
    || url.searchParams.get("search") !== query.term
    || url.searchParams.get("full") !== "true"
    || url.searchParams.get("limit") !== "1000"
    || [...url.searchParams.keys()].some((key) =>
      !["search", "full", "limit"].includes(key))) {
    fail("QUERY_URL_INVALID");
  }
  return url.href;
}

function validateQueryBytes(bytes, query, phase) {
  if (bytes.length !== query.expectedBytes
    || sha256(bytes) !== query.expectedSha256) {
    fail("QUERY_BYTES_INVALID", `${query.key}:${phase}`);
  }
  let parsed;
  try { parsed = JSON.parse(bytes); } catch { fail("QUERY_JSON_INVALID", query.key); }
  if (!Array.isArray(parsed) || parsed.length !== query.expectedRecords) {
    fail("QUERY_COUNT_INVALID", `${query.key}:${phase}`);
  }
}

function existingPrivateFile(file, query, phase) {
  if (!existsSync(file)) return false;
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink()
    || (status.mode & 0o777) !== 0o600) {
    fail("CHECKPOINT_FILE_INVALID", file);
  }
  validateQueryBytes(readFileSync(file), query, phase);
  return true;
}

async function downloadQuery(file, query, phase) {
  if (existingPrivateFile(file, query, phase)) return;
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
      "--user-agent", "outsider-hf-robot-intervention-ledger/1.0",
      "--output", temporary, queryUrl(query),
    ], { timeout: 240_000, maxBuffer: 1024 * 1024 });
    chmodSync(temporary, 0o600);
    const bytes = readFileSync(temporary);
    validateQueryBytes(bytes, query, phase);
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function reuseQuery(file, prefix, query, phase) {
  if (existingPrivateFile(file, query, phase)) return;
  ensurePrivateDirectory(path.dirname(file));
  const source = `${prefix}-${query.key}-live-${phase}.json`;
  const status = lstatSync(source);
  if (!status.isFile() || status.isSymbolicLink()) {
    fail("REUSE_SOURCE_INVALID", source);
  }
  const bytes = readFileSync(source);
  validateQueryBytes(bytes, query, phase);
  writePrivate(file, bytes);
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

async function acquireBracket(checkpoint, options, phase) {
  await mapLimit(HF_ROBOT_INTERVENTION_QUERIES, 3, async (query) => {
    const target = path.join(checkpoint, "queries", `${query.key}-${phase}.json`);
    if (options.reuseLivePrefix === null) {
      await downloadQuery(target, query, phase);
    } else reuseQuery(target, options.reuseLivePrefix, query, phase);
  });
}

async function acquireSource(workspace, checkpoint, options) {
  ensurePrivateDirectory(checkpoint);
  await acquireBracket(checkpoint, options, "before");
  const coveragePath = path.join(checkpoint, "worktree-coverage-snapshot.json");
  if (!existsSync(coveragePath)) {
    const coverage = createHfRobotInterventionCoverageSnapshot(workspace);
    writePrivate(coveragePath, serializeHfRobotInterventionArtifact(coverage));
  }
  await acquireBracket(checkpoint, options, "after");
  const manifestPath = path.join(checkpoint, "source-manifest.json");
  if (!existsSync(manifestPath)) {
    const manifest = createHfRobotInterventionSourceManifestFromDirectory(checkpoint);
    writePrivate(manifestPath, serializeHfRobotInterventionArtifact(manifest));
  }
}

async function acquire(options) {
  const workspace = path.resolve(".");
  const target = path.resolve(options.outputDir);
  const checkpoint = `${target}.source-checkpoint`;
  validateTarget(workspace, target, checkpoint);
  let sourceMoved = false;
  try {
    await acquireSource(workspace, checkpoint, options);
    const built = buildHfRobotInterventionArtifactFromSourceDirectory(checkpoint);
    const manifestBytes = readFileSync(path.join(checkpoint, "source-manifest.json"));
    const reportBytes = serializeHfRobotInterventionArtifact(built.report);
    const receipt = createHfRobotInterventionReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeHfRobotInterventionArtifact(receipt));
    const checked = verifyHfRobotInterventionArtifactDirectory(target);
    if (!checked.ok) fail("PUBLISHED_ARTIFACT_INVALID", checked.error);
    process.stdout.write(`${JSON.stringify({ ok: true,
      outputDirectory: target,
      unionDatasetRecords: checked.report.discovery.unionDatasetRecords,
      terminalDatasetRecords: checked.report.discovery.terminalDatasetRecords,
      declaredScopeExhausted: true, globalExhaustion: false,
      sourceUniverseExhausted: false,
      dispositionCounts: checked.report.discovery.dispositionCounts,
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
