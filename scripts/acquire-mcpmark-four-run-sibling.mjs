#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  MCPMARK_DATASET_ID, MCPMARK_DATASET_REVISION, MCPMARK_GROUP, MCPMARK_TASK,
  buildMcpmarkFourRunSiblingFromSourceDirectory,
  createMcpmarkFourRunReceipt,
  createMcpmarkFourRunSourceManifestFromDirectory,
  serializeMcpmarkFourRunArtifact,
  verifyMcpmarkFourRunArtifactDirectory,
} from "../src/outsider-mcpmark-four-run-sibling.js";

const DEFAULT_OUTPUT = "artifacts/outsider-mcpmark-four-run-sibling-20260829-v1";
const MAX_SOURCE_BYTES = 256 * 1024;
const MAX_METADATA_BYTES = 4 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail === null ? `MCPMARK_ACQUIRE_${code}`
    : `MCPMARK_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-mcpmark-four-run-sibling.mjs [--output-dir <new-dir>]",
        "",
        "Acquires all four fresh GPT-4.1/filesystem runs for one fixed MCPMark task,",
        "including messages, ordered execution logs, meta, and full-run summaries.",
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
}

function pinnedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "huggingface.co"
    || url.username !== "" || url.password !== ""
    || !decodeURIComponent(url.pathname).includes(MCPMARK_DATASET_REVISION)) {
    fail("URL_INVALID", value);
  }
  return url;
}

async function fetchOnce(value, maximumBytes) {
  const url = pinnedUrl(value);
  const response = await fetch(url, { redirect: "error",
    headers: { accept: "application/json,text/plain;q=0.9,*/*;q=0.1",
      "accept-encoding": "identity", "user-agent": "outsider-mcpmark-four-run/1.0" },
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
      await reader.cancel("bounded source limit exceeded");
      fail("SOURCE_SIZE_BOUND_EXCEEDED", url.pathname);
    }
    chunks.push(Buffer.from(chunk));
  }
  if (total < 1) fail("SOURCE_EMPTY", url.pathname);
  return { bytes: Buffer.concat(chunks, total), link: response.headers.get("link") };
}

async function boundedFetch(value, maximumBytes) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetchOnce(value, maximumBytes); }
    catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("MCPMARK_ACQUIRE_") || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

const api = `https://huggingface.co/api/datasets/${MCPMARK_DATASET_ID}`;
const raw = `https://huggingface.co/datasets/${MCPMARK_DATASET_ID}/raw/${MCPMARK_DATASET_REVISION}`;
const base = `mcpmark-v1-0905/${MCPMARK_GROUP}`;

async function fetchRootPages(metadata) {
  let next = `${api}/tree/${MCPMARK_DATASET_REVISION}/mcpmark-v1-0905?expand=true`;
  for (let page = 1; page <= 3; page += 1) {
    const response = await boundedFetch(next, MAX_METADATA_BYTES);
    writePrivate(path.join(metadata, `root-tree-page-0${page}.json`), response.bytes);
    const match = response.link?.match(/<([^>]+)>; rel="next"/u);
    next = match?.[1] ?? null;
    if (page < 3 && next === null || page === 3 && next !== null) {
      fail("ROOT_TREE_PAGINATION_INVALID", page);
    }
  }
}

async function acquire(outputDir) {
  const workspace = path.resolve(".");
  const target = path.resolve(outputDir);
  validateTarget(workspace, target);
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  let claimed = false;
  try {
    mkdirPrivate(staging);
    const source = path.join(staging, "source");
    const files = path.join(source, "files");
    const metadata = path.join(source, "metadata");
    mkdirPrivate(source);
    mkdirPrivate(files);
    mkdirPrivate(metadata);
    const recordUrl = `${api}/revision/${MCPMARK_DATASET_REVISION}`;
    writePrivate(path.join(metadata, "dataset-record-before.json"),
      (await boundedFetch(recordUrl, MAX_METADATA_BYTES)).bytes);
    writePrivate(path.join(metadata, "top-tree.json"),
      (await boundedFetch(`${api}/tree/${MCPMARK_DATASET_REVISION}?expand=true`,
        MAX_METADATA_BYTES)).bytes);
    await fetchRootPages(metadata);
    writePrivate(path.join(metadata, "group-tree.json"),
      (await boundedFetch(`${api}/tree/${MCPMARK_DATASET_REVISION}/${base}?expand=true`,
        MAX_METADATA_BYTES)).bytes);
    writePrivate(path.join(files, "README.md"),
      (await boundedFetch(`${raw}/README.md`, MAX_SOURCE_BYTES)).bytes);
    for (let run = 1; run <= 4; run += 1) {
      const runPath = `${base}/run-${run}`;
      writePrivate(path.join(metadata, `run-${run}-tree.json`),
        (await boundedFetch(`${api}/tree/${MCPMARK_DATASET_REVISION}/${runPath}?expand=true`,
          MAX_METADATA_BYTES)).bytes);
      writePrivate(path.join(metadata, `run-${run}-task-tree.json`),
        (await boundedFetch(`${api}/tree/${MCPMARK_DATASET_REVISION}/${runPath}/${MCPMARK_TASK}?expand=true`,
          MAX_METADATA_BYTES)).bytes);
      writePrivate(path.join(files, `run-${run}-summary.json`),
        (await boundedFetch(`${raw}/${runPath}/summary.json`, MAX_SOURCE_BYTES)).bytes);
      for (const name of ["execution.log", "messages.json", "meta.json"]) {
        writePrivate(path.join(files, `run-${run}-${name}`),
          (await boundedFetch(`${raw}/${runPath}/${MCPMARK_TASK}/${name}`,
            MAX_SOURCE_BYTES)).bytes);
      }
    }
    writePrivate(path.join(metadata, "dataset-record-after.json"),
      (await boundedFetch(recordUrl, MAX_METADATA_BYTES)).bytes);
    const manifest = createMcpmarkFourRunSourceManifestFromDirectory(source);
    const manifestBytes = serializeMcpmarkFourRunArtifact(manifest);
    writePrivate(path.join(source, "source-manifest.json"), manifestBytes);
    const built = buildMcpmarkFourRunSiblingFromSourceDirectory(source);
    const reportBytes = serializeMcpmarkFourRunArtifact(built.report);
    const receipt = createMcpmarkFourRunReceipt(built.report, reportBytes, manifestBytes);
    writePrivate(path.join(staging, "report.json"), reportBytes);
    writePrivate(path.join(staging, "run-receipt.json"),
      serializeMcpmarkFourRunArtifact(receipt));
    mkdirPrivate(target);
    claimed = true;
    renameSync(source, path.join(target, "source"));
    renameSync(path.join(staging, "report.json"), path.join(target, "report.json"));
    renameSync(path.join(staging, "run-receipt.json"),
      path.join(target, "run-receipt.json"));
    const checked = verifyMcpmarkFourRunArtifactDirectory(target);
    if (!checked.ok) fail("PUBLISHED_ARTIFACT_REPLAY_FAILED", checked.error);
    process.stdout.write(`${JSON.stringify({ ok: true, outputDir: target,
      artifactHash: checked.report.artifactHash,
      receiptHash: checked.receipt.receiptHash })}\n`);
  } catch (error) {
    if (claimed && existsSync(target)) rmSync(target, { recursive: true, force: true });
    throw error;
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  }
}

const options = parseArgs(process.argv.slice(2));
await acquire(options.outputDir);
