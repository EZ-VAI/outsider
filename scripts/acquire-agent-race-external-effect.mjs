#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  AGENT_RACE_DATASET_ID,
  AGENT_RACE_DATASET_REVISION,
  AGENT_RACE_RUNS,
  AGENT_RACE_UPSTREAM_DATASET_ID,
  AGENT_RACE_UPSTREAM_DATASET_REVISION,
  buildAgentRaceExternalEffectFromSourceDirectory,
  createAgentRaceRunReceipt,
  createAgentRaceSourceManifestFromSourceDirectory,
  serializeAgentRaceArtifact,
  verifyAgentRaceArtifactDirectory,
} from "../src/outsider-agent-race-external-effect.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-agent-race-external-effect-20260829-v1";
const SOURCE_FILES = Object.freeze([
  ".gitattributes", "README.md", "claude-code.jsonl",
  "ml-intern-claude-opus.jsonl", "ml-intern-kimi.jsonl", "pi-kimi.jsonl",
]);
const MODEL_PREFIXES = Object.freeze([
  ["claude-code", AGENT_RACE_RUNS[0]],
  ["ml-intern-claude-opus", AGENT_RACE_RUNS[1]],
  ["ml-intern-kimi", AGENT_RACE_RUNS[2]],
  ["pi-kimi", AGENT_RACE_RUNS[3]],
]);
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_METADATA_BYTES = 4 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENT_RACE_ACQUIRE_${code}`
    : `AGENT_RACE_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-agent-race-external-effect.mjs [--output-dir <new-dir>]",
        "",
        "Acquires the complete pinned four-trace Agent Race repository plus",
        "fixed-revision upstream/model metadata. Raw traces remain private and",
        "the result stays quarantine/evaluation-only with zero training rows.",
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

function validateTarget(workspace, target) {
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || target === path.parse(target).root
    || existsSync(target)) fail("OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE", target);
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
}

function officialUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== ""
    || url.hostname !== "huggingface.co") fail("URL_INVALID", value);
  const decoded = decodeURIComponent(url.pathname);
  const pinned = [AGENT_RACE_DATASET_REVISION,
    AGENT_RACE_UPSTREAM_DATASET_REVISION,
    ...AGENT_RACE_RUNS.map((run) => run.targetRevision)]
    .some((revision) => decoded.includes(revision));
  if (!pinned) fail("URL_NOT_REVISION_PINNED", value);
  return url;
}

async function fetchOnce(value, maximumBytes) {
  const url = officialUrl(value);
  const response = await fetch(url, {
    redirect: "error",
    headers: { accept: "application/json,text/plain;q=0.9,*/*;q=0.1",
      "accept-encoding": "identity",
      "user-agent": "outsider-agent-race-external-effect/1.0" },
    signal: AbortSignal.timeout(120_000),
  });
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
      await reader.cancel("source byte limit exceeded");
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
      if (message.startsWith("AGENT_RACE_ACQUIRE_") || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

function datasetApi(id, revision) {
  return `https://huggingface.co/api/datasets/${id}/revision/${revision}`;
}

function datasetTreeApi(id, revision) {
  return `https://huggingface.co/api/datasets/${id}/tree/${revision}?recursive=true&expand=true`;
}

function datasetRaw(id, revision, file) {
  return `https://huggingface.co/datasets/${id}/raw/${revision}/${encodeURIComponent(file)}`;
}

function modelApi(id, revision) {
  return `https://huggingface.co/api/models/${id}/revision/${revision}`;
}

function modelTreeApi(id, revision) {
  return `https://huggingface.co/api/models/${id}/tree/${revision}?recursive=true&expand=true`;
}

async function acquire(outputDir) {
  const workspace = path.resolve(".");
  const target = path.resolve(outputDir);
  validateTarget(workspace, target);
  const parent = path.dirname(target);
  const staging = path.join(parent,
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  let targetClaimed = false;
  try {
    mkdirPrivate(staging);
    const source = path.join(staging, "source");
    const files = path.join(source, "files");
    const metadata = path.join(source, "metadata");
    mkdirPrivate(source);
    mkdirPrivate(files);
    mkdirPrivate(metadata);

    const before = await boundedFetch(datasetApi(AGENT_RACE_DATASET_ID,
      AGENT_RACE_DATASET_REVISION), MAX_METADATA_BYTES);
    writePrivate(path.join(metadata, "dataset-record-before.json"), before);
    const tree = await boundedFetch(datasetTreeApi(AGENT_RACE_DATASET_ID,
      AGENT_RACE_DATASET_REVISION), MAX_METADATA_BYTES);
    writePrivate(path.join(metadata, "dataset-tree.json"), tree);
    for (const file of SOURCE_FILES) {
      const bytes = await boundedFetch(datasetRaw(AGENT_RACE_DATASET_ID,
        AGENT_RACE_DATASET_REVISION, file), MAX_SOURCE_BYTES);
      writePrivate(path.join(files, file), bytes);
    }
    writePrivate(path.join(metadata, "upstream-dataset-record.json"),
      await boundedFetch(datasetApi(AGENT_RACE_UPSTREAM_DATASET_ID,
        AGENT_RACE_UPSTREAM_DATASET_REVISION), MAX_METADATA_BYTES));
    for (const [prefix, run] of MODEL_PREFIXES) {
      writePrivate(path.join(metadata, `model-${prefix}-record.json`),
        await boundedFetch(modelApi(run.targetRepository, run.targetRevision),
          MAX_METADATA_BYTES));
      writePrivate(path.join(metadata, `model-${prefix}-tree.json`),
        await boundedFetch(modelTreeApi(run.targetRepository, run.targetRevision),
          MAX_METADATA_BYTES));
    }
    const after = await boundedFetch(datasetApi(AGENT_RACE_DATASET_ID,
      AGENT_RACE_DATASET_REVISION), MAX_METADATA_BYTES);
    writePrivate(path.join(metadata, "dataset-record-after.json"), after);

    const manifest = createAgentRaceSourceManifestFromSourceDirectory(source);
    const manifestBytes = serializeAgentRaceArtifact(manifest);
    writePrivate(path.join(source, "source-manifest.json"), manifestBytes);
    const built = buildAgentRaceExternalEffectFromSourceDirectory(source);
    const reportBytes = serializeAgentRaceArtifact(built.report);
    const receipt = createAgentRaceRunReceipt(built.report, reportBytes, manifestBytes);
    const receiptBytes = serializeAgentRaceArtifact(receipt);
    writePrivate(path.join(staging, "report.json"), reportBytes);
    writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);

    mkdirPrivate(target);
    targetClaimed = true;
    renameSync(source, path.join(target, "source"));
    renameSync(path.join(staging, "report.json"), path.join(target, "report.json"));
    renameSync(path.join(staging, "run-receipt.json"),
      path.join(target, "run-receipt.json"));
    const checked = verifyAgentRaceArtifactDirectory(target);
    if (!checked.ok) fail("PUBLISHED_ARTIFACT_REPLAY_FAILED", checked.error);
    process.stdout.write(`${JSON.stringify({ ok: true, outputDir: target,
      artifactHash: checked.report.artifactHash,
      receiptHash: checked.receipt.receiptHash })}\n`);
  } catch (error) {
    if (targetClaimed && existsSync(target)) rmSync(target, { recursive: true, force: true });
    throw error;
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  }
}

const options = parseArgs(process.argv.slice(2));
await acquire(options.outputDir);
