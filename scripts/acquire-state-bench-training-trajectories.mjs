#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync,
  rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  STATE_BENCH_COMMIT,
  STATE_BENCH_REPOSITORY,
  STATE_BENCH_TREE,
  buildStateBenchTrainingArtifactFromSourceDirectory,
  createStateBenchTrainingReceipt,
  createStateBenchTrainingSourceManifestFromDirectory,
  serializeStateBenchTrainingArtifact,
  verifyStateBenchTrainingArtifactDirectory,
} from "../src/outsider-state-bench-training-trajectories.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-state-bench-training-trajectories-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `STATE_BENCH_TRAINING_ACQUIRE_${code}`
    : `STATE_BENCH_TRAINING_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-state-bench-training-trajectories.mjs [--output-dir <new-dir>]",
        "",
        "Acquires and replays the complete fixed STATE-Bench Git commit, including",
        "all 300 published synthetic training trajectories. Raw conversations remain private.",
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
  if (url.protocol !== "https:" || url.username !== "" || url.password !== ""
    || !["api.github.com", "codeload.github.com"].includes(url.hostname)) {
    fail("URL_INVALID", value);
  }
  if (url.hostname === "api.github.com") {
    const expectedPrefix = `/repos/${STATE_BENCH_REPOSITORY}`;
    if (!url.pathname.startsWith(expectedPrefix)) fail("URL_INVALID", value);
  } else if (url.pathname
    !== `/${STATE_BENCH_REPOSITORY}/tar.gz/${STATE_BENCH_COMMIT}`) {
    fail("URL_INVALID", value);
  }
  return url.href;
}

function download(file, value, maximumSeconds = 300) {
  const url = pinnedUrl(value);
  execFileSync("/usr/bin/curl", [
    "--fail", "--location", "--silent", "--show-error",
    "--proto", "=https", "--proto-redir", "=https",
    "--retry", "5", "--retry-all-errors", "--retry-delay", "1",
    "--retry-max-time", String(maximumSeconds),
    "--connect-timeout", "30", "--max-time", String(maximumSeconds),
    "--header", "Accept-Encoding: identity",
    "--header", "Accept: application/vnd.github+json",
    "--header", "X-GitHub-Api-Version: 2022-11-28",
    "--user-agent", "outsider-state-bench-training/1.0",
    "--output", file, url,
  ], { stdio: "inherit", timeout: (maximumSeconds + 30) * 1_000 });
  chmodSync(file, 0o600);
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink() || status.size < 1) {
    fail("DOWNLOAD_INVALID", file);
  }
}

const repositoryUrl = `https://api.github.com/repos/${STATE_BENCH_REPOSITORY}`;
const commitUrl = `${repositoryUrl}/git/commits/${STATE_BENCH_COMMIT}`;
const treeUrl = `${repositoryUrl}/git/trees/${STATE_BENCH_TREE}?recursive=1`;
const archiveUrl =
  `https://codeload.github.com/${STATE_BENCH_REPOSITORY}/tar.gz/${STATE_BENCH_COMMIT}`;

function acquireSource(checkpoint, staging) {
  mkdirPrivate(staging);
  const source = path.join(staging, "source");
  const files = path.join(source, "files");
  const metadata = path.join(source, "metadata");
  mkdirPrivate(source);
  mkdirPrivate(files);
  mkdirPrivate(metadata);

  download(path.join(metadata, "repository-before.json"), repositoryUrl, 180);
  download(path.join(metadata, "commit-before.json"), commitUrl, 180);
  download(path.join(metadata, "tree-before.json"), treeUrl, 180);
  download(path.join(files, "state-bench-5644.tar.gz"), archiveUrl, 300);
  download(path.join(metadata, "tree-after.json"), treeUrl, 180);
  download(path.join(metadata, "commit-after.json"), commitUrl, 180);
  download(path.join(metadata, "repository-after.json"), repositoryUrl, 180);
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
      const manifest = createStateBenchTrainingSourceManifestFromDirectory(checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeStateBenchTrainingArtifact(manifest));
    }
    const built = buildStateBenchTrainingArtifactFromSourceDirectory(checkpoint);
    const manifestBytes = serializeStateBenchTrainingArtifact(built.sourceManifest);
    const reportBytes = serializeStateBenchTrainingArtifact(built.report);
    const receipt = createStateBenchTrainingReceipt(
      built.report, reportBytes, manifestBytes);

    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeStateBenchTrainingArtifact(receipt));
    const checked = verifyStateBenchTrainingArtifactDirectory(target);
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
