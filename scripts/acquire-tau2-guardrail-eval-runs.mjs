#!/usr/bin/env node

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync,
  rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
  TAU2_GUARDRAIL_DATASET_ID,
  TAU2_GUARDRAIL_REVISION,
  TAU2_GUARDRAIL_SOURCE_OBJECTS,
  buildTau2GuardrailArtifactFromSourceDirectory,
  createTau2GuardrailReceipt,
  createTau2GuardrailSourceManifestFromDirectory,
  serializeTau2GuardrailArtifact,
  verifyTau2GuardrailArtifactDirectory,
} from "../src/outsider-tau2-guardrail-eval-runs.js";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT = "artifacts/outsider-tau2-guardrail-eval-runs-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `TAU2_GUARDRAIL_ACQUIRE_${code}`
    : `TAU2_GUARDRAIL_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-tau2-guardrail-eval-runs.mjs [--output-dir <new-dir>]",
        "",
        "Acquires every fixed-revision τ2 evaluation results file (about 81 MB).",
        "A complete private source checkpoint survives local replay failures.",
      ].join("\n") + "\n");
      process.exit(0);
    } else {
      fail("ARGUMENT_INVALID", argument);
    }
  }
  return result;
}

function mkdirPrivate(directory) {
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirPrivate(directory);
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink()
    || (status.mode & 0o777) !== 0o700) fail("DIRECTORY_UNSAFE", directory);
}

function ensureParents(root, relative) {
  let cursor = root;
  for (const part of relative.split("/").slice(0, -1)) {
    if (!part || part === "." || part === "..") fail("SOURCE_PATH_INVALID", relative);
    cursor = path.join(cursor, part);
    ensurePrivateDirectory(cursor);
  }
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
  if (existsSync(checkpoint)) ensurePrivateDirectory(checkpoint);
}

function pinnedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "huggingface.co"
    || url.username !== "" || url.password !== ""
    || !decodeURIComponent(url.pathname).includes(TAU2_GUARDRAIL_REVISION)) {
    fail("URL_INVALID", value);
  }
  return url.href;
}

async function download(file, value, exactBytes = null, maximumSeconds = 1_800) {
  const url = pinnedUrl(value);
  await execFileAsync("/usr/bin/curl", [
    "--fail", "--location", "--silent", "--show-error", "--http1.1",
    "--proto", "=https", "--proto-redir", "=https",
    "--retry", "8", "--retry-all-errors", "--retry-delay", "1",
    "--retry-max-time", String(maximumSeconds),
    "--connect-timeout", "30", "--max-time", String(maximumSeconds),
    "--continue-at", "-", "--header", "Accept-Encoding: identity",
    "--user-agent", "outsider-tau2-guardrail/1.0", "--output", file, url,
  ], { timeout: (maximumSeconds + 60) * 1_000, maxBuffer: 1024 * 1024 });
  chmodSync(file, 0o600);
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink() || status.size < 1
    || exactBytes !== null && status.size !== exactBytes) {
    fail("DOWNLOAD_SIZE_INVALID", file);
  }
}

async function mapConcurrent(values, concurrency, callback) {
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      await callback(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
}

const encodedId = TAU2_GUARDRAIL_DATASET_ID.split("/")
  .map(encodeURIComponent).join("/");
const api = `https://huggingface.co/api/datasets/${encodedId}`;
const resolve = `https://huggingface.co/datasets/${encodedId}/resolve/${TAU2_GUARDRAIL_REVISION}`;

async function acquireSource(checkpoint, staging) {
  mkdirPrivate(staging);
  const source = path.join(staging, "source");
  const files = path.join(source, "files");
  const metadata = path.join(source, "metadata");
  mkdirPrivate(source);
  mkdirPrivate(files);
  mkdirPrivate(metadata);
  const recordUrl = `${api}/revision/${TAU2_GUARDRAIL_REVISION}`;
  const treeUrl = `${api}/tree/${TAU2_GUARDRAIL_REVISION}`
    + "?recursive=true&expand=true";
  await download(path.join(metadata, "dataset-record-before.json"), recordUrl,
    null, 180);
  await download(path.join(metadata, "full-tree-before.json"), treeUrl,
    null, 180);
  await mapConcurrent(TAU2_GUARDRAIL_SOURCE_OBJECTS, 3, async (object) => {
    ensureParents(files, object.path);
    await download(path.join(files, object.path),
      `${resolve}/${object.path.split("/").map(encodeURIComponent).join("/")}?download=true`,
      object.bytes, object.bytes > 10_000_000 ? 1_800 : 300);
  });
  await download(path.join(metadata, "full-tree-after.json"), treeUrl,
    null, 180);
  await download(path.join(metadata, "dataset-record-after.json"), recordUrl,
    null, 180);
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
    if (sorted(readdirSync(checkpoint)).join("\0") === ["files", "metadata"].join("\0")) {
      const manifest = createTau2GuardrailSourceManifestFromDirectory(checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeTau2GuardrailArtifact(manifest));
    }
    const built = buildTau2GuardrailArtifactFromSourceDirectory(checkpoint);
    const manifestBytes = serializeTau2GuardrailArtifact(built.sourceManifest);
    const reportBytes = serializeTau2GuardrailArtifact(built.report);
    const receipt = createTau2GuardrailReceipt(built.report,
      reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeTau2GuardrailArtifact(receipt));
    const checked = verifyTau2GuardrailArtifactDirectory(target);
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

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

const options = parseArgs(process.argv.slice(2));
await acquire(options.outputDir);

