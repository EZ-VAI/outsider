#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  MOBILE_AGENT_FAILURE_DATASET_ID, MOBILE_AGENT_FAILURE_DATASET_REVISION,
  buildMobileAgentFailureCensusFromSourceDirectory,
  createMobileAgentFailureReceipt,
  createMobileAgentFailureSourceManifestFromDirectory,
  serializeMobileAgentFailureArtifact,
  verifyMobileAgentFailureArtifactDirectory,
} from "../src/outsider-mobile-agent-failure-census.js";

const DEFAULT_OUTPUT = "artifacts/outsider-mobile-agent-failure-census-20260829-v1";
const MAX_METADATA_BYTES = 8 * 1024 * 1024;

const PYTHON_ACQUIRE = String.raw`
from huggingface_hub import HfApi, snapshot_download
import json, os, pathlib, sys

repo_id, revision, destination, projection_path = sys.argv[1:]
api = HfApi()
items = list(api.list_repo_tree(repo_id=repo_id, repo_type='dataset',
    revision=revision, recursive=True, expand=True))
rows = []
for item in items:
    if hasattr(item, 'size'):
        lfs = None if not item.lfs else {'oid': item.lfs.sha256, 'size': item.lfs.size}
        rows.append({'path': item.path, 'type': 'file', 'oid': item.blob_id,
            'size': item.size, 'lfs': lfs})
    else:
        rows.append({'path': item.path, 'type': 'directory', 'oid': item.tree_id})
flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
descriptor = os.open(projection_path, flags, 0o600)
with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
    json.dump(rows, output, sort_keys=True, separators=(',', ':'))
snapshot_download(repo_id=repo_id, repo_type='dataset', revision=revision,
    local_dir=destination, max_workers=8)
`;

function fail(code, detail = null) {
  throw new Error(detail === null ? `MOBILE_AGENT_ACQUIRE_${code}`
    : `MOBILE_AGENT_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  if (argv.includes("--help")) {
    process.stdout.write("Usage:\n  node scripts/acquire-mobile-agent-failure-census.mjs [--output-dir <new-dir>]\n\nAcquires the complete pinned 52-trajectory mobile-agent failure dataset.\n");
    process.exit(0);
  }
  let outputDir = DEFAULT_OUTPUT;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output-dir" && typeof argv[index + 1] === "string") {
      outputDir = argv[index + 1]; index += 1;
    } else fail("ARGUMENT_INVALID", argv[index]);
  }
  return { outputDir };
}

function mkdirPrivate(directory) {
  mkdirSync(directory, { mode: 0o700 }); chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { mode: 0o600, flag: "wx" }); chmodSync(file, 0o600);
}

function makePrivate(root) {
  const status = lstatSync(root);
  if (status.isSymbolicLink()) fail("SOURCE_SYMLINK", root);
  if (status.isDirectory()) {
    chmodSync(root, 0o700);
    for (const name of readdirSync(root)) makePrivate(path.join(root, name));
  } else if (status.isFile()) chmodSync(root, 0o600);
  else fail("SOURCE_SPECIAL_FILE", root);
}

function validateTarget(workspace, target, checkpoint) {
  const relative = path.relative(workspace, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail("OUTPUT_PATH_INVALID");
  }
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  if (existsSync(checkpoint)) {
    const names = readdirSync(checkpoint).sort();
    const withoutManifest = ["repo", "metadata"].sort().join("\0");
    const withManifest = ["repo", "metadata", "source-manifest.json"]
      .sort().join("\0");
    if (![withoutManifest, withManifest].includes(names.join("\0"))) {
      fail("CHECKPOINT_LAYOUT_INVALID");
    }
  }
}

function boundedCurl(url, maximumBytes) {
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

function acquireSnapshot(repo, projection) {
  return new Promise((resolve, reject) => {
    const child = spawn("/opt/anaconda3/bin/python", ["-c", PYTHON_ACQUIRE,
      MOBILE_AGENT_FAILURE_DATASET_ID, MOBILE_AGENT_FAILURE_DATASET_REVISION,
      repo, projection], { stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, HF_HUB_DISABLE_PROGRESS_BARS: "1",
        HF_XET_HIGH_PERFORMANCE: "1", HF_HUB_DOWNLOAD_TIMEOUT: "300" } });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 1024 * 1024) stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`snapshot ${code}: ${stderr.trim()}`));
      else resolve();
    });
  });
}

async function acquireSource(checkpoint, staging) {
  mkdirPrivate(staging);
  const source = path.join(staging, "source");
  const repo = path.join(source, "repo");
  const metadata = path.join(source, "metadata");
  mkdirPrivate(source); mkdirPrivate(repo); mkdirPrivate(metadata);
  const api = `https://huggingface.co/api/datasets/${MOBILE_AGENT_FAILURE_DATASET_ID}`;
  writePrivate(path.join(metadata, "dataset-record-before.json"),
    await boundedCurl(api, MAX_METADATA_BYTES));
  await acquireSnapshot(repo, path.join(metadata, "tree-projection.json"));
  const cache = path.join(repo, ".cache");
  if (existsSync(cache)) rmSync(cache, { recursive: true, force: true });
  makePrivate(repo); chmodSync(path.join(metadata, "tree-projection.json"), 0o600);
  writePrivate(path.join(metadata, "dataset-record-after.json"),
    await boundedCurl(api, MAX_METADATA_BYTES));
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
    if (!existsSync(path.join(checkpoint, "source-manifest.json"))) {
      const manifest = createMobileAgentFailureSourceManifestFromDirectory(checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeMobileAgentFailureArtifact(manifest));
    }
    const built = buildMobileAgentFailureCensusFromSourceDirectory(checkpoint);
    const manifestBytes = serializeMobileAgentFailureArtifact(built.sourceManifest);
    const reportBytes = serializeMobileAgentFailureArtifact(built.report);
    const receipt = createMobileAgentFailureReceipt(built.report,
      reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source")); sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeMobileAgentFailureArtifact(receipt));
    const checked = verifyMobileAgentFailureArtifactDirectory(target);
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
