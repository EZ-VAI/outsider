#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fchmodSync, fstatSync, lstatSync,
  mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  buildCuaVerifierBenchTrainingArtifactsFromSource,
  CUA_VERIFIER_BENCH_PIN,
  normalizeCuaVerifierBenchSource,
  verifyCuaVerifierBenchSourceReplay,
  verifyCuaVerifierBenchTrainingArtifactsFromSource,
} from "../src/outsider-cua-verifier-bench.js";

const DEFAULT_OUTPUT = "artifacts/cua-verifier-bench-20260828";
const ROWS_ENDPOINT = "https://datasets-server.huggingface.co/rows";
const ALLOWED_HOSTS = new Set(["datasets-server.huggingface.co", "huggingface.co"]);

function parseArgs(argv) {
  const args = { outputDir: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output-dir" && argv[index + 1]) args.outputDir = argv[++index];
    else if (["--help", "-h"].includes(argv[index])) args.help = true;
    else throw new Error(`CUA_VERIFIER_BENCH_ARGUMENT_INVALID:${argv[index]}`);
  }
  return args;
}

function ensureInsideWorkspace(pathname) {
  const workspace = resolve(process.cwd());
  const target = resolve(pathname);
  const child = relative(workspace, target);
  if (child === "" || child === ".." || child.startsWith(`..${sep}`)
    || isAbsolute(child)) {
    throw new Error(`CUA_VERIFIER_BENCH_OUTPUT_OUTSIDE_WORKSPACE:${target}`);
  }
  return target;
}

function ensureDirectory(directory, outputRoot) {
  const root = ensureInsideWorkspace(outputRoot);
  const workspace = resolve(process.cwd());
  const rootRelative = relative(workspace, root);
  let rootCursor = workspace;
  for (const segment of rootRelative.split(sep).filter(Boolean)) {
    rootCursor = join(rootCursor, segment);
    if (!existsSync(rootCursor)) mkdirSync(rootCursor, { mode: 0o700 });
    const component = lstatSync(rootCursor);
    if (component.isSymbolicLink() || !component.isDirectory()) {
      throw new Error(`CUA_VERIFIER_BENCH_DIRECTORY_UNSAFE:${rootCursor}`);
    }
  }
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`CUA_VERIFIER_BENCH_DIRECTORY_UNSAFE:${root}`);
  }
  chmodSync(root, 0o700);
  const target = resolve(directory);
  const child = relative(root, target);
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`CUA_VERIFIER_BENCH_PATH_OUTSIDE_OUTPUT:${target}`);
  }
  let cursor = root;
  for (const segment of child.split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) mkdirSync(cursor, { mode: 0o700 });
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`CUA_VERIFIER_BENCH_DIRECTORY_UNSAFE:${cursor}`);
    }
    chmodSync(cursor, 0o700);
  }
}

function safeRead(file, maximumBytes = 128 * 1024 * 1024) {
  const target = resolve(file);
  const pathname = lstatSync(target, { bigint: true });
  if (pathname.isSymbolicLink() || !pathname.isFile()
    || pathname.size > BigInt(maximumBytes)) {
    throw new Error(`CUA_VERIFIER_BENCH_FILE_UNSAFE:${target}`);
  }
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.dev !== pathname.dev || before.ino !== pathname.ino
      || before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || bytes.length !== Number(before.size)) {
      throw new Error(`CUA_VERIFIER_BENCH_FILE_CHANGED_DURING_READ:${target}`);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeOnce(file, bytes, outputRoot) {
  const target = resolve(file);
  ensureDirectory(dirname(target), outputRoot);
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), "utf8");
  if (existsSync(target)) {
    const existing = safeRead(target, Math.max(body.length, 1));
    if (!existing.equals(body)) throw new Error(`CUA_VERIFIER_BENCH_OUTPUT_EXISTS:${target}`);
    chmodSync(target, 0o600);
    return;
  }
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), 0o600);
    writeFileSync(descriptor, body);
    fchmodSync(descriptor, 0o600);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function replaceDerivedAtomically(file, bytes, outputRoot) {
  const target = resolve(file);
  ensureDirectory(dirname(target), outputRoot);
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), "utf8");
  if (existsSync(target)) {
    const existing = safeRead(target, Math.max(body.length, 16 * 1024 * 1024));
    if (existing.equals(body)) {
      chmodSync(target, 0o600);
      return;
    }
  }
  const temporary = `${target}.replacement-${process.pid}-${randomBytes(8).toString("hex")}`;
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    writeFileSync(descriptor, body);
    fchmodSync(descriptor, 0o600);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, target);
    chmodSync(target, 0o600);
    if (!safeRead(target, Math.max(body.length, 16 * 1024 * 1024)).equals(body)) {
      throw new Error(`CUA_VERIFIER_BENCH_DERIVED_REPLACEMENT_MISMATCH:${target}`);
    }
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary) && !lstatSync(temporary).isSymbolicLink()) {
      unlinkSync(temporary);
    }
    throw error;
  }
}

function checkedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)
    || url.username !== "" || url.password !== "") {
    throw new Error(`CUA_VERIFIER_BENCH_FETCH_URL_INVALID:${value}`);
  }
  return url;
}

async function fetchBytes(value, { maximumBytes, accept }) {
  const url = checkedUrl(value);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "error",
        headers: { accept, "user-agent": "outsider-cua-verifier-bench-intake/1.0" },
        signal: AbortSignal.timeout(120_000),
      });
      if (response.status !== 200 || !response.body) {
        throw new Error(`HTTP_${response.status}`);
      }
      checkedUrl(response.url);
      const declared = response.headers.get("content-length");
      if (declared !== null && (!/^\d+$/.test(declared)
        || Number(declared) > maximumBytes)) {
        throw new Error("CONTENT_LENGTH_LIMIT_EXCEEDED");
      }
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > maximumBytes) {
          await reader.cancel("size limit exceeded");
          throw new Error("STREAM_SIZE_LIMIT_EXCEEDED");
        }
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks, size);
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
    }
  }
  throw new Error(`CUA_VERIFIER_BENCH_FETCH_FAILED:${url}:${lastError?.message ?? lastError}`);
}

function rowsUrl(config, split, offset, length) {
  const query = new URLSearchParams({
    dataset: CUA_VERIFIER_BENCH_PIN.id,
    config,
    split,
    offset: String(offset),
    length: String(length),
  });
  return `${ROWS_ENDPOINT}?${query}`;
}

function pageName(config, offset, length) {
  const finish = offset + length - 1;
  return `${config}.rows-${String(offset).padStart(3, "0")}-${
    String(finish).padStart(3, "0")}.json`;
}

function json(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error(code); }
}

function repositoryPin(bytes, code) {
  const value = json(bytes, `${code}_JSON_INVALID`);
  if (value.id !== CUA_VERIFIER_BENCH_PIN.id
    || value.sha !== CUA_VERIFIER_BENCH_PIN.revision
    || String(value.cardData?.license ?? "").toLowerCase() !== "mit") {
    throw new Error(`${code}_PIN_MISMATCH`);
  }
}

function rawSource(path, url, bytes, fields = {}) {
  return { path, url, bytes, ...fields };
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonl(values) {
  return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function acquire(outputRoot) {
  const sourceRoot = join(outputRoot, "source");
  ensureDirectory(sourceRoot, outputRoot);
  const repositoryUrl = `https://huggingface.co/api/datasets/${
    CUA_VERIFIER_BENCH_PIN.id}`;
  const readmeUrl = `https://huggingface.co/datasets/${CUA_VERIFIER_BENCH_PIN.id}/raw/${
    CUA_VERIFIER_BENCH_PIN.revision}/README.md`;

  const coreNames = ["repository-before.json", "README.md", "repository-after.json",
    ...CUA_VERIFIER_BENCH_PIN.trajectories.pages.map((page) =>
      pageName(CUA_VERIFIER_BENCH_PIN.trajectories.config, page.offset, page.length)),
    ...CUA_VERIFIER_BENCH_PIN.annotations.pages.map((page) =>
      pageName(CUA_VERIFIER_BENCH_PIN.annotations.config, page.offset, page.length))];
  const existingCore = coreNames.filter((name) => existsSync(join(sourceRoot, name))).length;
  if (existingCore !== 0 && existingCore !== coreNames.length) {
    throw new Error(`CUA_VERIFIER_BENCH_PARTIAL_CORE_SOURCE_SET:${existingCore}:${
      coreNames.length}`);
  }
  const replayExisting = existingCore === coreNames.length;
  const obtain = async (name, url, options) => {
    const path = join(sourceRoot, name);
    if (replayExisting) {
      const bytes = safeRead(path, options.maximumBytes);
      chmodSync(path, 0o600);
      return bytes;
    }
    const bytes = await fetchBytes(url, options);
    writeOnce(path, bytes, outputRoot);
    return bytes;
  };

  const beforeBytes = await obtain("repository-before.json", repositoryUrl,
    { maximumBytes: 4 * 1024 * 1024, accept: "application/json" });
  repositoryPin(beforeBytes, "CUA_VERIFIER_BENCH_REPOSITORY_BEFORE");

  const readmeBytes = await obtain("README.md", readmeUrl,
    { maximumBytes: 1024 * 1024, accept: "text/plain" });

  const trajectoryPages = [];
  for (const page of CUA_VERIFIER_BENCH_PIN.trajectories.pages) {
    const url = rowsUrl(CUA_VERIFIER_BENCH_PIN.trajectories.config,
      CUA_VERIFIER_BENCH_PIN.trajectories.split, page.offset, page.length);
    const name = pageName(CUA_VERIFIER_BENCH_PIN.trajectories.config,
      page.offset, page.length);
    const bytes = await obtain(name, url,
      { maximumBytes: 64 * 1024 * 1024, accept: "application/json" });
    trajectoryPages.push(rawSource(`source/${name}`, url, bytes, page));
  }

  const annotationPages = [];
  for (const page of CUA_VERIFIER_BENCH_PIN.annotations.pages) {
    const url = rowsUrl(CUA_VERIFIER_BENCH_PIN.annotations.config,
      CUA_VERIFIER_BENCH_PIN.annotations.split, page.offset, page.length);
    const name = pageName(CUA_VERIFIER_BENCH_PIN.annotations.config,
      page.offset, page.length);
    const bytes = await obtain(name, url,
      { maximumBytes: 16 * 1024 * 1024, accept: "application/json" });
    annotationPages.push(rawSource(`source/${name}`, url, bytes, page));
  }

  const afterBytes = await obtain("repository-after.json", repositoryUrl,
    { maximumBytes: 4 * 1024 * 1024, accept: "application/json" });
  repositoryPin(afterBytes, "CUA_VERIFIER_BENCH_REPOSITORY_AFTER");

  const parquetPin = CUA_VERIFIER_BENCH_PIN.localAnnotationParquetCrossCheck;
  const parquetPath = join(outputRoot, parquetPin.path);
  let annotationParquetCrossCheck = null;
  if (existsSync(parquetPath)) {
    const bytes = safeRead(parquetPath, parquetPin.sizeBytes);
    if (bytes.length !== parquetPin.sizeBytes || sha256(bytes) !== parquetPin.sha256) {
      throw new Error("CUA_VERIFIER_BENCH_ANNOTATION_PARQUET_CROSS_CHECK_MISMATCH");
    }
    chmodSync(parquetPath, 0o600);
    annotationParquetCrossCheck = { path: parquetPin.path, bytes };
  }
  return {
    repositoryBefore: rawSource("source/repository-before.json", repositoryUrl, beforeBytes),
    repositoryAfter: rawSource("source/repository-after.json", repositoryUrl, afterBytes),
    readme: rawSource("source/README.md", readmeUrl, readmeBytes),
    trajectoryPages,
    annotationPages,
    annotationParquetCrossCheck,
  };
}

function replayInput(outputRoot, generatedAt) {
  const sourceRoot = join(outputRoot, "source");
  const repositoryUrl = `https://huggingface.co/api/datasets/${
    CUA_VERIFIER_BENCH_PIN.id}`;
  const readmeUrl = `https://huggingface.co/datasets/${CUA_VERIFIER_BENCH_PIN.id}/raw/${
    CUA_VERIFIER_BENCH_PIN.revision}/README.md`;
  const trajectoryPages = CUA_VERIFIER_BENCH_PIN.trajectories.pages.map((page) => {
    const name = pageName(CUA_VERIFIER_BENCH_PIN.trajectories.config,
      page.offset, page.length);
    return rawSource(`source/${name}`, rowsUrl(CUA_VERIFIER_BENCH_PIN.trajectories.config,
      CUA_VERIFIER_BENCH_PIN.trajectories.split, page.offset, page.length),
    safeRead(join(sourceRoot, name), 64 * 1024 * 1024), page);
  });
  const annotationPages = CUA_VERIFIER_BENCH_PIN.annotations.pages.map((page) => {
    const name = pageName(CUA_VERIFIER_BENCH_PIN.annotations.config,
      page.offset, page.length);
    return rawSource(`source/${name}`, rowsUrl(CUA_VERIFIER_BENCH_PIN.annotations.config,
      CUA_VERIFIER_BENCH_PIN.annotations.split, page.offset, page.length),
    safeRead(join(sourceRoot, name), 16 * 1024 * 1024), page);
  });
  const parquetPin = CUA_VERIFIER_BENCH_PIN.localAnnotationParquetCrossCheck;
  const parquetPath = join(outputRoot, parquetPin.path);
  return {
    generatedAt,
    repositoryBefore: rawSource("source/repository-before.json", repositoryUrl,
      safeRead(join(sourceRoot, "repository-before.json"), 4 * 1024 * 1024)),
    repositoryAfter: rawSource("source/repository-after.json", repositoryUrl,
      safeRead(join(sourceRoot, "repository-after.json"), 4 * 1024 * 1024)),
    readme: rawSource("source/README.md", readmeUrl,
      safeRead(join(sourceRoot, "README.md"), 1024 * 1024)),
    trajectoryPages,
    annotationPages,
    annotationParquetCrossCheck: existsSync(parquetPath)
      ? { path: parquetPin.path, bytes: safeRead(parquetPath, parquetPin.sizeBytes) } : null,
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Usage: node scripts/acquire-cua-verifier-bench.mjs [--output-dir DIR]\n");
    process.exit(0);
  }
  const outputRoot = ensureInsideWorkspace(args.outputDir);
  ensureDirectory(outputRoot, outputRoot);
  const acquired = await acquire(outputRoot);
  const manifestPath = join(outputRoot, "source-manifest.json");
  let generatedAt = new Date().toISOString();
  if (existsSync(manifestPath)) {
    const existing = json(safeRead(manifestPath, 8 * 1024 * 1024),
      "CUA_VERIFIER_BENCH_EXISTING_MANIFEST_INVALID");
    if (typeof existing.generatedAt !== "string") {
      throw new Error("CUA_VERIFIER_BENCH_EXISTING_MANIFEST_TIME_INVALID");
    }
    generatedAt = existing.generatedAt;
  }
  const bundle = normalizeCuaVerifierBenchSource({ ...acquired, generatedAt });
  writeOnce(manifestPath, serialize(bundle.manifest), outputRoot);
  writeOnce(join(outputRoot, "normalized-episodes.jsonl"), jsonl(bundle.episodes), outputRoot);
  writeOnce(join(outputRoot, "effect-summary.json"), serialize(bundle.summary), outputRoot);
  writeOnce(join(outputRoot, "full-source-verification.json"),
    serialize(bundle.verification), outputRoot);

  const storedBundle = {
    manifest: json(safeRead(manifestPath, 8 * 1024 * 1024),
      "CUA_VERIFIER_BENCH_STORED_MANIFEST_INVALID"),
    episodes: safeRead(join(outputRoot, "normalized-episodes.jsonl"), 64 * 1024 * 1024)
      .toString("utf8").trim().split("\n").map((line) => JSON.parse(line)),
    summary: json(safeRead(join(outputRoot, "effect-summary.json"), 8 * 1024 * 1024),
      "CUA_VERIFIER_BENCH_STORED_SUMMARY_INVALID"),
    verification: json(safeRead(join(outputRoot, "full-source-verification.json"),
      8 * 1024 * 1024), "CUA_VERIFIER_BENCH_STORED_VERIFICATION_INVALID"),
  };
  const rawReplayInput = replayInput(outputRoot, generatedAt);
  const verified = verifyCuaVerifierBenchSourceReplay(storedBundle, rawReplayInput);
  if (!verified.ok) {
    throw new Error(`CUA_VERIFIER_BENCH_FULL_SOURCE_VERIFY_FAILED:${verified.error}`);
  }
  const training = buildCuaVerifierBenchTrainingArtifactsFromSource(rawReplayInput,
    storedBundle.manifest);
  const modelReportPath = join(outputRoot, "model-report.json");
  const trainingReceiptPath = join(outputRoot, "training-run-receipt.json");
  replaceDerivedAtomically(modelReportPath, serialize(training.report), outputRoot);
  replaceDerivedAtomically(trainingReceiptPath, serialize(training.receipt), outputRoot);
  const storedTraining = {
    report: json(safeRead(modelReportPath, 16 * 1024 * 1024),
      "CUA_VERIFIER_BENCH_STORED_MODEL_REPORT_INVALID"),
    receipt: json(safeRead(trainingReceiptPath, 4 * 1024 * 1024),
      "CUA_VERIFIER_BENCH_STORED_TRAINING_RECEIPT_INVALID"),
  };
  const trainingVerified = verifyCuaVerifierBenchTrainingArtifactsFromSource(storedTraining,
    rawReplayInput, storedBundle.manifest);
  if (!trainingVerified.ok) {
    throw new Error(`CUA_VERIFIER_BENCH_TRAINING_VERIFY_FAILED:${trainingVerified.error}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, outputDir: outputRoot,
    status: verified.status, records: verified.records,
    manifestHash: verified.manifestHash, recordSetHash: verified.recordSetHash,
    summaryHash: verified.summaryHash, verificationHash: verified.verificationHash,
    sourceObjectSetHash: bundle.manifest.sourceObjectSetHash,
    sourceApiObjectHashes: bundle.manifest.sourceObjects
      .filter((object) => object.role === "HF_DATASETS_SERVER_LOGICAL_ROWS")
      .map((object) => ({ path: object.path, sha256: object.sha256,
        sizeBytes: object.sizeBytes })),
    training: {
      reportPath: modelReportPath,
      receiptPath: trainingReceiptPath,
      reportHash: trainingVerified.reportHash,
      modelSetHash: trainingVerified.modelSetHash,
      receiptHash: trainingVerified.receiptHash,
      split: training.report.split,
      result: Object.fromEntries(training.report.assessments.map((assessment) =>
        [assessment.target, { sampleAccounting: assessment.sampleAccounting,
          baselineHoldout: assessment.baseline?.holdoutMetrics ?? null,
          optimizedHoldout: assessment.optimized?.holdoutMetrics ?? null,
          decision: assessment.selection.decision,
          reasons: assessment.selection.reasons }])),
    },
    hold: true, causalExperienceUnits: 0, automaticTraining: false,
    modelDeploymentAuthorized: false })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
