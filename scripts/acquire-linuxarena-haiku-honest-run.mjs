#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
  LINUXARENA_DATASET_ID,
  LINUXARENA_REVISION,
  buildLinuxArenaHaikuHonestArtifactFromSourceDirectory,
  createLinuxArenaHaikuHonestReceipt,
  createLinuxArenaHaikuHonestSourceManifestFromDirectory,
  serializeLinuxArenaHaikuHonestArtifact,
  verifyLinuxArenaHaikuHonestArtifactDirectory,
} from "../src/outsider-linuxarena-haiku-honest-run.js";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT =
  "artifacts/outsider-linuxarena-haiku-honest-run-20260829-v1";
const SAMPLE_BYTES = 704_485_115;
const SAMPLE_LFS_SHA =
  "sha256:0b1e469ad48d93ccfec986f7cbafee43d49afb93bae730437d02c16233e7cfdb";
const SELECTED_BYTES = 62_762_384;
const SELECTED_SHA =
  "sha256:b5c7201e75f08a597db187d535be7c20d71df1693aec6885606e4ef8bfb99787";
const BOUNDARY_BYTES = 241;
const BOUNDARY_SHA =
  "sha256:919553d3d52f6fb0314320ac516fb0b17277544bbe73330a60c1d82499228c6a";

function fail(code, detail = null) {
  throw new Error(detail === null ? `LINUXARENA_HAIKU_HONEST_ACQUIRE_${code}`
    : `LINUXARENA_HAIKU_HONEST_ACQUIRE_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, pythonExecutable: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--python" && argv[index + 1]) {
      result.pythonExecutable = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-linuxarena-haiku-honest-run.mjs [--output-dir <new-dir>] [--python <python>]",
        "",
        "Acquires the exact Haiku honest run byte range and a header-only next-run proof.",
        "No trajectory tool input, command, code, or output is executed.",
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

function checkedUrl(value) {
  const url = new URL(value);
  const pathname = decodeURIComponent(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "huggingface.co"
    || url.username !== "" || url.password !== ""
    || !pathname.includes(LINUXARENA_DATASET_ID)
    || !pathname.includes(LINUXARENA_REVISION)) fail("URL_INVALID", value);
  return url.href;
}

function existingPrivateFile(file, exactBytes = null) {
  if (!existsSync(file)) return false;
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink()
    || (status.mode & 0o777) !== 0o600
    || exactBytes !== null && status.size !== exactBytes) {
    fail("CHECKPOINT_FILE_INVALID", file);
  }
  return true;
}

async function download(file, value, maximumSeconds = 240, exactBytes = null) {
  if (existingPrivateFile(file, exactBytes)) return;
  const url = checkedUrl(value);
  ensurePrivateDirectory(path.dirname(file));
  const temporary = `${file}.download-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    await execFileAsync("/usr/bin/curl", [
      "--fail", "--location", "--silent", "--show-error",
      "--proto", "=https", "--proto-redir", "=https",
      "--retry", "6", "--retry-all-errors", "--retry-delay", "1",
      "--retry-max-time", String(maximumSeconds),
      "--connect-timeout", "30", "--max-time", String(maximumSeconds),
      "--header", "Accept-Encoding: identity",
      "--user-agent", "outsider-linuxarena-haiku-honest/1.0",
      "--output", temporary, url,
    ], { timeout: (maximumSeconds + 30) * 1_000, maxBuffer: 1024 * 1024 });
    chmodSync(temporary, 0o600);
    const status = lstatSync(temporary);
    if (!status.isFile() || status.isSymbolicLink()
      || exactBytes !== null && status.size !== exactBytes) {
      fail("DOWNLOAD_INVALID", file);
    }
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function parseHeaderBlocks(bytes) {
  const text = bytes.toString("latin1");
  const blocks = text.split(/\r?\n\r?\n/gu).map((block) => block.trim())
    .filter((block) => block.startsWith("HTTP/"));
  return blocks.map((block) => {
    const lines = block.split(/\r?\n/gu);
    const statusMatch = lines[0].match(/^HTTP\/\S+\s+(\d{3})/u);
    const headers = {};
    for (const line of lines.slice(1)) {
      const split = line.indexOf(":");
      if (split <= 0) continue;
      headers[line.slice(0, split).trim().toLowerCase()] =
        line.slice(split + 1).trim();
    }
    return { status: Number(statusMatch?.[1]), headers };
  });
}

async function downloadRange({ file, receiptFile, url, first, last,
  expectedBytes, expectedSha, maximumSeconds = 900 }) {
  const fileExists = existingPrivateFile(file, expectedBytes);
  const receiptExists = existingPrivateFile(receiptFile);
  if (fileExists && receiptExists) return;
  if (fileExists !== receiptExists) {
    if (existsSync(file)) rmSync(file, { force: true });
    if (existsSync(receiptFile)) rmSync(receiptFile, { force: true });
  }
  ensurePrivateDirectory(path.dirname(file));
  ensurePrivateDirectory(path.dirname(receiptFile));
  const suffix = `${process.pid}-${randomBytes(6).toString("hex")}`;
  const temporary = `${file}.download-${suffix}`;
  const headersFile = `${file}.headers-${suffix}`;
  const receiptTemporary = `${receiptFile}.download-${suffix}`;
  try {
    await execFileAsync("/usr/bin/curl", [
      "--fail", "--location", "--silent", "--show-error",
      "--proto", "=https", "--proto-redir", "=https",
      "--retry", "6", "--retry-all-errors", "--retry-delay", "1",
      "--retry-max-time", String(maximumSeconds),
      "--connect-timeout", "30", "--max-time", String(maximumSeconds),
      "--header", "Accept-Encoding: identity",
      "--user-agent", "outsider-linuxarena-haiku-honest/1.0",
      "--range", `${first}-${last}`, "--dump-header", headersFile,
      "--output", temporary, checkedUrl(url),
    ], { timeout: (maximumSeconds + 30) * 1_000, maxBuffer: 1024 * 1024 });
    chmodSync(temporary, 0o600);
    const status = lstatSync(temporary);
    const bytes = readFileSync(temporary);
    if (!status.isFile() || status.isSymbolicLink() || status.size !== expectedBytes
      || bytes.length !== expectedBytes || sha256(bytes) !== expectedSha) {
      fail("RANGE_BYTES_INVALID", `${first}-${last}`);
    }
    const blocks = parseHeaderBlocks(readFileSync(headersFile));
    const final = [...blocks].reverse().find((block) => block.status === 206);
    if (!final || final.headers["content-range"]
      !== `bytes ${first}-${last}/${SAMPLE_BYTES}`
      || Number(final.headers["content-length"]) !== expectedBytes
      || final.headers["accept-ranges"] !== "bytes") {
      fail("STRICT_HTTP_206_INVALID", `${first}-${last}`);
    }
    const linkedCommit = blocks.find(
      (block) => block.headers["x-repo-commit"])?.headers["x-repo-commit"];
    const linkedSize = blocks.find(
      (block) => block.headers["x-linked-size"])?.headers["x-linked-size"];
    const linkedEtag = blocks.find(
      (block) => block.headers["x-linked-etag"])?.headers["x-linked-etag"];
    if (linkedCommit !== undefined && linkedCommit !== LINUXARENA_REVISION
      || linkedSize !== undefined && Number(linkedSize) !== SAMPLE_BYTES
      || linkedEtag !== undefined
        && linkedEtag.replace(/^"|"$/gu, "") !== SAMPLE_LFS_SHA.slice(7)) {
      fail("LINKED_OBJECT_IDENTITY_INVALID", `${first}-${last}`);
    }
    const receipt = {
      schema: "outsider/http-byte-range-receipt/v1",
      datasetId: LINUXARENA_DATASET_ID, revision: LINUXARENA_REVISION,
      sourcePath: "data/sample.jsonl", requestedFirstByte: first,
      requestedLastByte: last, responseStatus: 206,
      contentRange: `bytes ${first}-${last}/${SAMPLE_BYTES}`,
      responseBytes: expectedBytes, wholeObjectBytes: SAMPLE_BYTES,
      linkedSha256Claim: SAMPLE_LFS_SHA, responseFileSha256: expectedSha,
    };
    writeFileSync(receiptTemporary,
      serializeLinuxArenaHaikuHonestArtifact(receipt), { flag: "wx", mode: 0o600 });
    chmodSync(receiptTemporary, 0o600);
    renameSync(temporary, file);
    renameSync(receiptTemporary, receiptFile);
  } finally {
    for (const candidate of [temporary, headersFile, receiptTemporary]) {
      if (existsSync(candidate)) rmSync(candidate, { force: true });
    }
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

const encodedId = LINUXARENA_DATASET_ID.split("/")
  .map(encodeURIComponent).join("/");
const api = `https://huggingface.co/api/datasets/${encodedId}`;
const recordUrl = `${api}/revision/${LINUXARENA_REVISION}`;
const treeUrl = `${api}/tree/${LINUXARENA_REVISION}?recursive=true&limit=1000`;
const resolve =
  `https://huggingface.co/datasets/${encodedId}/resolve/${LINUXARENA_REVISION}`;
const sampleUrl = `${resolve}/data/sample.jsonl?download=true`;

async function acquireSource(checkpoint) {
  ensurePrivateDirectory(checkpoint);
  const initial = [
    ["metadata/dataset-record-before.json", recordUrl],
    ["metadata/full-tree-before.json", treeUrl],
    ["support/README.md", `${resolve}/README.md`, 5_942],
    ["support/manifest.json", `${resolve}/manifest.json`, 983],
    ["support/scripts/build_sample.py", `${resolve}/scripts/build_sample.py`, 2_156],
    ["support/croissant.json", `${resolve}/croissant.json`, 32_323],
    ["support/croissant_rai.json", `${resolve}/croissant_rai.json`, 2_587],
  ];
  await mapLimit(initial, 5, async ([relative, url, exactBytes]) => {
    await download(path.join(checkpoint, relative), url, 240, exactBytes ?? null);
  });

  await downloadRange({
    file: path.join(checkpoint, "selection/haiku-honest.jsonl"),
    receiptFile: path.join(checkpoint, "metadata/honest-range-response.json"),
    url: sampleUrl, first: 0, last: SELECTED_BYTES - 1,
    expectedBytes: SELECTED_BYTES, expectedSha: SELECTED_SHA,
  });
  await downloadRange({
    file: path.join(checkpoint, "boundary/line201-prefix.bin"),
    receiptFile: path.join(checkpoint, "metadata/boundary-range-response.json"),
    url: sampleUrl, first: SELECTED_BYTES,
    last: SELECTED_BYTES + BOUNDARY_BYTES - 1,
    expectedBytes: BOUNDARY_BYTES, expectedSha: BOUNDARY_SHA,
    maximumSeconds: 240,
  });

  await mapLimit([
    ["metadata/full-tree-after.json", treeUrl],
    ["metadata/dataset-record-after.json", recordUrl],
  ], 2, async ([relative, url]) => {
    await download(path.join(checkpoint, relative), url, 240);
  });
}

async function acquire(options) {
  const workspace = path.resolve(".");
  const target = path.resolve(options.outputDir);
  const checkpoint = `${target}.source-checkpoint`;
  validateTarget(workspace, target, checkpoint);
  let sourceMoved = false;
  try {
    await acquireSource(checkpoint);
    const names = sorted(readdirSync(checkpoint));
    if (names.join("\0") === ["boundary", "metadata", "selection", "support"].join("\0")) {
      const manifest = createLinuxArenaHaikuHonestSourceManifestFromDirectory(
        checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeLinuxArenaHaikuHonestArtifact(manifest));
    }
    const built = buildLinuxArenaHaikuHonestArtifactFromSourceDirectory(
      checkpoint, { pythonExecutable: options.pythonExecutable });
    const manifestBytes = serializeLinuxArenaHaikuHonestArtifact(
      built.sourceManifest);
    const reportBytes = serializeLinuxArenaHaikuHonestArtifact(built.report);
    const receipt = createLinuxArenaHaikuHonestReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeLinuxArenaHaikuHonestArtifact(receipt));
    const checked = verifyLinuxArenaHaikuHonestArtifactDirectory(target,
      { pythonExecutable: options.pythonExecutable });
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
  }
}

const options = parseArgs(process.argv.slice(2));
await acquire(options);
