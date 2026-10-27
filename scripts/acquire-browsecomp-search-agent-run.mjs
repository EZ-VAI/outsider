#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync,
  statSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  BROWSECOMP_SEARCH_DATASET_ID,
  BROWSECOMP_SEARCH_DATASET_REVISION,
  BROWSECOMP_SEARCH_RUN_ID,
  buildBrowsecompSearchRunFromSourceDirectory,
  createBrowsecompSearchRunReceipt,
  createBrowsecompSearchRunSourceManifestFromDirectory,
  serializeBrowsecompSearchRunArtifact,
  verifyBrowsecompSearchRunArtifactDirectory,
} from "../src/outsider-browsecomp-search-agent-run.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-browsecomp-search-agent-run-20260829-v1";
const TRAJECTORY_BYTES = 277_075_664;
const MAX_METADATA_BYTES = 4 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail === null ? `BROWSECOMP_SEARCH_ACQUIRE_${code}`
    : `BROWSECOMP_SEARCH_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-browsecomp-search-agent-run.mjs [--output-dir <new-dir>]",
        "",
        "Acquires one complete pinned 830-question BrowseComp-Plus search-agent run.",
        "A completed private source checkpoint is retained if local replay fails.",
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

function pinnedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "huggingface.co"
    || url.username !== "" || url.password !== ""
    || !decodeURIComponent(url.pathname).includes(BROWSECOMP_SEARCH_DATASET_REVISION)) {
    fail("URL_INVALID", value);
  }
  return url;
}

async function fetchOnce(value, maximumBytes) {
  const url = pinnedUrl(value);
  const response = await fetch(url, { redirect: "error",
    headers: { accept: "application/json,text/plain;q=0.9,*/*;q=0.1",
      "accept-encoding": "identity", "user-agent": "outsider-browsecomp-search/1.0" },
    signal: AbortSignal.timeout(120_000) });
  if (response.status !== 200 || !response.body || response.url !== url.href) {
    fail(`HTTP_${response.status}`, url.pathname);
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/u.test(declared)
    || Number(declared) > maximumBytes)) fail("CONTENT_LENGTH_INVALID", url.pathname);
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    total += chunk.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("bounded metadata limit exceeded");
      fail("SOURCE_SIZE_BOUND_EXCEEDED", url.pathname);
    }
    chunks.push(Buffer.from(chunk));
  }
  if (total < 1) fail("SOURCE_EMPTY", url.pathname);
  return Buffer.concat(chunks, total);
}

async function boundedFetch(value, maximumBytes) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetchOnce(value, maximumBytes); }
    catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("BROWSECOMP_SEARCH_ACQUIRE_") || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

function downloadTrajectory(file) {
  const url = `https://huggingface.co/datasets/${BROWSECOMP_SEARCH_DATASET_ID}/resolve/${BROWSECOMP_SEARCH_DATASET_REVISION}/${BROWSECOMP_SEARCH_RUN_ID}/predictions.jsonl?download=true`;
  pinnedUrl(url);
  execFileSync("/usr/bin/curl", ["--fail", "--location", "--silent", "--show-error",
    "--retry", "5", "--retry-all-errors", "--retry-delay", "1",
    "--retry-max-time", "1800", "--connect-timeout", "30", "--max-time", "1800",
    "--continue-at", "-", "--user-agent", "outsider-browsecomp-search/1.0",
    "--output", file, url], { stdio: "inherit" });
  chmodSync(file, 0o600);
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink() || status.size !== TRAJECTORY_BYTES) {
    fail("TRAJECTORY_DOWNLOAD_SIZE_INVALID");
  }
}

const api = `https://huggingface.co/api/datasets/${BROWSECOMP_SEARCH_DATASET_ID}`;
const raw = `https://huggingface.co/datasets/${BROWSECOMP_SEARCH_DATASET_ID}/raw/${BROWSECOMP_SEARCH_DATASET_REVISION}`;

async function acquireSource(checkpoint, staging) {
  mkdirPrivate(staging);
  const source = path.join(staging, "source");
  const files = path.join(source, "files");
  const metadata = path.join(source, "metadata");
  mkdirPrivate(source);
  mkdirPrivate(files);
  mkdirPrivate(metadata);
  const recordUrl = `${api}/revision/${BROWSECOMP_SEARCH_DATASET_REVISION}`;
  writePrivate(path.join(metadata, "dataset-record-before.json"),
    await boundedFetch(recordUrl, MAX_METADATA_BYTES));
  writePrivate(path.join(metadata, "root-tree.json"),
    await boundedFetch(`${api}/tree/${BROWSECOMP_SEARCH_DATASET_REVISION}?expand=true`,
      MAX_METADATA_BYTES));
  writePrivate(path.join(metadata, "full-tree.json"),
    await boundedFetch(`${api}/tree/${BROWSECOMP_SEARCH_DATASET_REVISION}?recursive=true&expand=true`,
      MAX_METADATA_BYTES));
  writePrivate(path.join(metadata, "run-tree.json"),
    await boundedFetch(`${api}/tree/${BROWSECOMP_SEARCH_DATASET_REVISION}/${BROWSECOMP_SEARCH_RUN_ID}?expand=true`,
      MAX_METADATA_BYTES));
  writePrivate(path.join(files, "README.md"),
    await boundedFetch(`${raw}/README.md`, MAX_METADATA_BYTES));
  writePrivate(path.join(files, "manifest.json"),
    await boundedFetch(`${raw}/manifest.json`, MAX_METADATA_BYTES));
  downloadTrajectory(path.join(files, "predictions.jsonl"));
  writePrivate(path.join(metadata, "dataset-record-after.json"),
    await boundedFetch(recordUrl, MAX_METADATA_BYTES));
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
    const names = readdirSync(checkpoint).sort();
    if (names.join("\0") === ["files", "metadata"].sort().join("\0")) {
      const manifest = createBrowsecompSearchRunSourceManifestFromDirectory(checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeBrowsecompSearchRunArtifact(manifest));
    }
    const built = buildBrowsecompSearchRunFromSourceDirectory(checkpoint);
    const manifestBytes = serializeBrowsecompSearchRunArtifact(built.sourceManifest);
    const reportBytes = serializeBrowsecompSearchRunArtifact(built.report);
    const receipt = createBrowsecompSearchRunReceipt(built.report,
      reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeBrowsecompSearchRunArtifact(receipt));
    const checked = verifyBrowsecompSearchRunArtifactDirectory(target);
    if (!checked.ok) fail("PUBLISHED_ARTIFACT_REPLAY_FAILED", checked.error);
    process.stdout.write(`${JSON.stringify({ ok: true, outputDir: target,
      artifactHash: checked.report.artifactHash,
      receiptHash: checked.receipt.receiptHash })}\n`);
  } catch (error) {
    if (sourceMoved && existsSync(path.join(target, "source")) && !existsSync(checkpoint)) {
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
