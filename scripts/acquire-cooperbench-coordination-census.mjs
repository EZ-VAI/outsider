#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  COOPERBENCH_DATASET_ID, COOPERBENCH_DATASET_REVISION,
  buildCooperbenchCoordinationCensusFromSourceDirectory,
  createCooperbenchCoordinationReceipt,
  createCooperbenchCoordinationSourceManifestFromDirectory,
  serializeCooperbenchCoordinationArtifact,
  verifyCooperbenchCoordinationArtifactDirectory,
} from "../src/outsider-cooperbench-coordination-census.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-cooperbench-coordination-census-20260829-v1";
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const ARCHIVES = [
  "cmp-flash-msa-coopgit.tar.gz",
  "cmp-flash-msa-solo.tar.gz",
  "cmp-full-coopgit.tar.gz",
  "cmp-full-solo.tar.gz",
  "cmp-full-team-noproto.tar.gz",
  "cmp-full-team.tar.gz",
];

function fail(code, detail = null) {
  throw new Error(detail === null ? `COOPERBENCH_ACQUIRE_${code}`
    : `COOPERBENCH_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  if (argv.includes("--help")) {
    process.stdout.write("Usage:\n  node scripts/acquire-cooperbench-coordination-census.mjs [--output-dir <new-dir>]\n\nAcquires all six pinned CooperBench coordination trajectory archives.\n");
    process.exit(0);
  }
  let outputDir = DEFAULT_OUTPUT;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output-dir" && typeof argv[index + 1] === "string") {
      outputDir = argv[index + 1];
      index += 1;
    } else fail("ARGUMENT_INVALID", argv[index]);
  }
  return { outputDir };
}

function mkdirPrivate(directory) {
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { mode: 0o600, flag: "wx" });
  chmodSync(file, 0o600);
}

function validateTarget(workspace, target, checkpoint) {
  const relative = path.relative(workspace, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail("OUTPUT_PATH_INVALID");
  }
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  if (existsSync(checkpoint)) {
    const names = readdirSync(checkpoint).sort();
    if (names.join("\0") !== ["files", "metadata", "source-manifest.json"]
      .sort().join("\0")) fail("CHECKPOINT_LAYOUT_INVALID");
  }
}

async function boundedFetch(url, maximumBytes) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/curl", ["--fail", "--location", "--silent",
      "--show-error", "--retry", "4", "--retry-delay", "2",
      "--connect-timeout", "30", "--max-time", "300", url],
    { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let total = 0;
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      total += chunk.length;
      if (total > maximumBytes) child.kill("SIGTERM");
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`curl ${code}: ${stderr.trim()}`));
      else if (total < 2 || total > maximumBytes) reject(new Error("metadata size invalid"));
      else resolve(Buffer.concat(chunks, total));
    });
  });
}

function download(url, output) {
  writePrivate(output, Buffer.alloc(0));
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/curl", ["--fail", "--location", "--silent",
      "--show-error", "--retry", "4", "--retry-delay", "2",
      "--connect-timeout", "30", "--max-time", "1200",
      "--continue-at", "-", "--output", output, url],
    { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`curl ${code}: ${stderr.trim()}`));
      else { chmodSync(output, 0o600); resolve(); }
    });
  });
}

async function acquireSource(checkpoint, staging) {
  mkdirPrivate(staging);
  const source = path.join(staging, "source");
  const files = path.join(source, "files");
  const metadata = path.join(source, "metadata");
  mkdirPrivate(source); mkdirPrivate(files); mkdirPrivate(metadata);
  const apiBase = `https://huggingface.co/api/datasets/${COOPERBENCH_DATASET_ID}`;
  const rawBase = `https://huggingface.co/datasets/${COOPERBENCH_DATASET_ID}/resolve/${COOPERBENCH_DATASET_REVISION}`;
  writePrivate(path.join(metadata, "dataset-record-before.json"),
    await boundedFetch(apiBase, MAX_METADATA_BYTES));
  writePrivate(path.join(metadata, "tree.json"),
    await boundedFetch(`${apiBase}/tree/${COOPERBENCH_DATASET_REVISION}?recursive=true&expand=true`,
      MAX_METADATA_BYTES));
  writePrivate(path.join(files, "README.md"),
    await boundedFetch(`${rawBase}/README.md`, MAX_METADATA_BYTES));
  for (let index = 0; index < ARCHIVES.length; index += 3) {
    await Promise.all(ARCHIVES.slice(index, index + 3).map((name) => download(
      `${rawBase}/${name}?download=true`, path.join(files, name))));
  }
  writePrivate(path.join(metadata, "dataset-record-after.json"),
    await boundedFetch(apiBase, MAX_METADATA_BYTES));
  const manifest = createCooperbenchCoordinationSourceManifestFromDirectory(source);
  writePrivate(path.join(source, "source-manifest.json"),
    serializeCooperbenchCoordinationArtifact(manifest));
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
    const built = buildCooperbenchCoordinationCensusFromSourceDirectory(checkpoint);
    const manifestBytes = serializeCooperbenchCoordinationArtifact(built.sourceManifest);
    const reportBytes = serializeCooperbenchCoordinationArtifact(built.report);
    const receipt = createCooperbenchCoordinationReceipt(built.report,
      reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeCooperbenchCoordinationArtifact(receipt));
    const checked = verifyCooperbenchCoordinationArtifactDirectory(target);
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
