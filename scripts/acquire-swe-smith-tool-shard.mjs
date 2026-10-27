#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync,
  rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  SWE_SMITH_DATASET_ID,
  SWE_SMITH_REVISION,
  buildSweSmithToolShardArtifactFromSourceDirectory,
  createSweSmithToolShardReceipt,
  createSweSmithToolShardSourceManifestFromDirectory,
  serializeSweSmithToolShardArtifact,
  verifySweSmithToolShardArtifactDirectory,
} from "../src/outsider-swe-smith-tool-shard.js";

const DEFAULT_OUTPUT = "artifacts/outsider-swe-smith-tool-shard-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `SWE_SMITH_TOOL_SHARD_ACQUIRE_${code}`
    : `SWE_SMITH_TOOL_SHARD_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-swe-smith-tool-shard.mjs [--output-dir <new-dir>]",
        "",
        "Acquires one complete fixed-revision physical `tool` shard and inventories",
        "all four eight-file repository representations. Raw trajectories stay private.",
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
  const encodedId = SWE_SMITH_DATASET_ID.split("/").map(encodeURIComponent).join("/");
  if (url.protocol !== "https:" || url.hostname !== "huggingface.co"
    || url.username !== "" || url.password !== "") fail("URL_INVALID", value);
  const decoded = decodeURIComponent(url.pathname);
  if (!decoded.includes(SWE_SMITH_DATASET_ID)
    || decoded !== `/api/datasets/${SWE_SMITH_DATASET_ID}`
      && !decoded.includes(SWE_SMITH_REVISION)) fail("URL_INVALID", value);
  if (!url.pathname.includes(encodedId) && !decoded.includes(SWE_SMITH_DATASET_ID)) {
    fail("URL_INVALID", value);
  }
  return url.href;
}

function download(file, value, maximumSeconds = 600) {
  const url = pinnedUrl(value);
  execFileSync("/usr/bin/curl", [
    "--fail", "--location", "--silent", "--show-error",
    "--proto", "=https", "--proto-redir", "=https",
    "--retry", "6", "--retry-all-errors", "--retry-delay", "1",
    "--retry-max-time", String(maximumSeconds),
    "--connect-timeout", "30", "--max-time", String(maximumSeconds),
    "--header", "Accept-Encoding: identity",
    "--user-agent", "outsider-swe-smith-tool-shard/1.0",
    "--output", file, url,
  ], { stdio: "inherit", timeout: (maximumSeconds + 30) * 1_000 });
  chmodSync(file, 0o600);
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink() || status.size < 1) {
    fail("DOWNLOAD_INVALID", file);
  }
}

const encodedId = SWE_SMITH_DATASET_ID.split("/").map(encodeURIComponent).join("/");
const api = `https://huggingface.co/api/datasets/${encodedId}`;
const recordUrl = `${api}/revision/${SWE_SMITH_REVISION}`;
const treeUrl = `${api}/tree/${SWE_SMITH_REVISION}?recursive=true&limit=1000`;
const raw = `https://huggingface.co/datasets/${encodedId}/raw/${SWE_SMITH_REVISION}`;
const resolve = `https://huggingface.co/datasets/${encodedId}/resolve/${SWE_SMITH_REVISION}`;

function acquireSource(checkpoint, staging) {
  mkdirPrivate(staging);
  const source = path.join(staging, "source");
  const files = path.join(source, "files");
  const data = path.join(files, "data");
  const metadata = path.join(source, "metadata");
  mkdirPrivate(source);
  mkdirPrivate(files);
  mkdirPrivate(data);
  mkdirPrivate(metadata);

  download(path.join(metadata, "dataset-record-before.json"), recordUrl, 180);
  download(path.join(metadata, "full-tree-before.json"), treeUrl, 180);
  download(path.join(files, ".gitattributes"), `${raw}/.gitattributes`, 180);
  download(path.join(files, "README.md"), `${raw}/README.md`, 180);
  download(path.join(data, "tool-00004-of-00008.parquet"),
    `${resolve}/data/tool-00004-of-00008.parquet?download=true`, 900);
  download(path.join(metadata, "full-tree-after.json"), treeUrl, 180);
  download(path.join(metadata, "dataset-record-after.json"), recordUrl, 180);
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
    if (!existsSync(checkpoint)) acquireSource(checkpoint, staging);
    const names = sorted(readdirSync(checkpoint));
    if (names.join("\0") === ["files", "metadata"].join("\0")) {
      const manifest = createSweSmithToolShardSourceManifestFromDirectory(checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeSweSmithToolShardArtifact(manifest));
    }
    const built = buildSweSmithToolShardArtifactFromSourceDirectory(checkpoint);
    const manifestBytes = serializeSweSmithToolShardArtifact(built.sourceManifest);
    const reportBytes = serializeSweSmithToolShardArtifact(built.report);
    const receipt = createSweSmithToolShardReceipt(
      built.report, reportBytes, manifestBytes);

    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeSweSmithToolShardArtifact(receipt));
    const checked = verifySweSmithToolShardArtifactDirectory(target);
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
