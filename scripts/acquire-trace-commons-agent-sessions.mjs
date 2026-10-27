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
  TRACE_COMMONS_DATASET_ID,
  TRACE_COMMONS_REVISION,
  buildTraceCommonsAgentSessionsArtifactFromSourceDirectory,
  createTraceCommonsAgentSessionsReceipt,
  createTraceCommonsAgentSessionsSourceManifestFromDirectory,
  serializeTraceCommonsAgentSessionsArtifact,
  verifyTraceCommonsAgentSessionsArtifactDirectory,
} from "../src/outsider-trace-commons-agent-sessions.js";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT =
  "artifacts/outsider-trace-commons-agent-sessions-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `TRACE_COMMONS_AGENT_SESSIONS_ACQUIRE_${code}`
    : `TRACE_COMMONS_AGENT_SESSIONS_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-trace-commons-agent-sessions.mjs [--output-dir <new-dir>]",
        "",
        "Acquires the complete fixed Trace Commons agent-traces repository.",
        "Raw donated sessions remain private and are never executed or projected.",
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
  if (url.protocol !== "https:" || url.hostname !== "huggingface.co"
    || url.username !== "" || url.password !== "") fail("URL_INVALID", value);
  const decoded = decodeURIComponent(url.pathname);
  if (!decoded.includes(TRACE_COMMONS_DATASET_ID)
    || decoded !== `/api/datasets/${TRACE_COMMONS_DATASET_ID}/revision/${TRACE_COMMONS_REVISION}`
      && !decoded.includes(TRACE_COMMONS_REVISION)) fail("URL_INVALID", value);
  return url.href;
}

async function download(file, value, maximumSeconds = 900) {
  const url = pinnedUrl(value);
  ensurePrivateDirectory(path.dirname(file));
  await execFileAsync("/usr/bin/curl", [
    "--fail", "--location", "--silent", "--show-error",
    "--proto", "=https", "--proto-redir", "=https",
    "--retry", "6", "--retry-all-errors", "--retry-delay", "1",
    "--retry-max-time", String(maximumSeconds),
    "--connect-timeout", "30", "--max-time", String(maximumSeconds),
    "--header", "Accept-Encoding: identity",
    "--user-agent", "outsider-trace-commons-agent-sessions/1.0",
    "--output", file, url,
  ], { timeout: (maximumSeconds + 30) * 1_000, maxBuffer: 1024 * 1024 });
  chmodSync(file, 0o600);
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink()) fail("DOWNLOAD_INVALID", file);
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

const encodedId = TRACE_COMMONS_DATASET_ID.split("/")
  .map(encodeURIComponent).join("/");
const api = `https://huggingface.co/api/datasets/${encodedId}`;
const recordUrl = `${api}/revision/${TRACE_COMMONS_REVISION}`;
const treeUrl = `${api}/tree/${TRACE_COMMONS_REVISION}?recursive=true&limit=1000`;
const resolve =
  `https://huggingface.co/datasets/${encodedId}/resolve/${TRACE_COMMONS_REVISION}`;

async function acquireSource(checkpoint, staging) {
  mkdirPrivate(staging);
  const source = path.join(staging, "source");
  const files = path.join(source, "files");
  const metadata = path.join(source, "metadata");
  mkdirPrivate(source);
  mkdirPrivate(files);
  mkdirPrivate(metadata);
  await download(path.join(metadata, "dataset-record-before.json"), recordUrl, 180);
  await download(path.join(metadata, "full-tree-before.json"), treeUrl, 180);
  const tree = JSON.parse(readFileSync(
    path.join(metadata, "full-tree-before.json"), "utf8"));
  const plan = tree.filter((entry) => entry.type === "file");
  if (plan.length !== 37) fail("TREE_FILE_COUNT_INVALID");
  await mapLimit(plan, 5, async (entry) => {
    const target = path.join(files, ...entry.path.split("/"));
    ensurePrivateDirectory(path.dirname(target));
    if (entry.size === 0) writePrivate(target, Buffer.alloc(0));
    else await download(target,
      `${resolve}/${encodeRepoPath(entry.path)}?download=true`, 900);
  });
  await download(path.join(metadata, "full-tree-after.json"), treeUrl, 180);
  await download(path.join(metadata, "dataset-record-after.json"), recordUrl, 180);
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
      const manifest = createTraceCommonsAgentSessionsSourceManifestFromDirectory(
        checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeTraceCommonsAgentSessionsArtifact(manifest));
    }
    const built = buildTraceCommonsAgentSessionsArtifactFromSourceDirectory(checkpoint);
    const manifestBytes = serializeTraceCommonsAgentSessionsArtifact(
      built.sourceManifest);
    const reportBytes = serializeTraceCommonsAgentSessionsArtifact(built.report);
    const receipt = createTraceCommonsAgentSessionsReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeTraceCommonsAgentSessionsArtifact(receipt));
    const checked = verifyTraceCommonsAgentSessionsArtifactDirectory(target);
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

