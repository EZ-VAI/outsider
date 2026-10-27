#!/usr/bin/env node

/*
 * Acquire the bounded, metadata-only CUARewardBench source scope.
 *
 * This deliberately does not download any trajectory, screenshot, upstream
 * archive, or model output.  The resulting directory can prove the annotation
 * and manifest bytes at one Git revision; it cannot prove the referenced
 * trajectory bytes exist locally.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";

const REVISION = "33a04c96b86cea643f9d396e4879f778717fb923";
const REPOSITORY = "Tencent/CUARewardBench";
const DEFAULT_OUTPUT = "artifacts/public-agent-wave3-20260821/source/cuarewardbench";

const FILES = Object.freeze([
  ["README.md", "README.md", 512 * 1024],
  ["LICENSE", "LICENSE", 128 * 1024],
  ["dataset-card.md", "docs/dataset_card.md", 512 * 1024],
  ["annotation-protocol.md", "docs/annotation_protocol.md", 512 * 1024],
  ["download-data.sh", "scripts/download_data.sh", 512 * 1024],
  ["prepare-downloaded-trajs.py", "scripts/prepare_downloaded_trajs.py", 1024 * 1024],
  ["verify-data.py", "scripts/verify_data.py", 512 * 1024],
  ["annotations.json", "data/annotations/cuarewardbench-v0.4.json", 4 * 1024 * 1024],
  ["trajectory-manifest.jsonl", "data/manifest.jsonl", 4 * 1024 * 1024],
]);

function fail(code) { throw new Error(`PUBLIC_AGENT_WAVE3_ACQUIRE_${code}`); }
function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    process.stdout.write("Usage: node scripts/acquire-stage15-public-agent-wave3.mjs [--output DIR]\n");
    process.exit(0);
  }
  if (argv.length === 0) return { output: DEFAULT_OUTPUT };
  if (argv.length !== 2 || argv[0] !== "--output" || !argv[1]) fail("ARGUMENT_INVALID");
  return { output: argv[1] };
}
async function boundedFetch(url, maximumBytes) {
  const response = await fetch(url, { headers: { accept: "application/vnd.github+json",
    "user-agent": "outsider-public-agent-wave3-acquirer/1.0" } });
  if (!response.ok) fail(`FETCH_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1 || bytes.length > maximumBytes) fail("FETCH_SIZE_INVALID");
  return bytes;
}
function canonicalJson(bytes, code) {
  try { return Buffer.from(`${canonicalizeStrict(JSON.parse(bytes.toString("utf8")))}\n`); }
  catch { fail(code); }
}

const { output } = parseArgs(process.argv.slice(2));
const target = path.resolve(output);
if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_TOO_BROAD");
mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
const temporary = path.join(path.dirname(target),
  `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
mkdirSync(temporary, { mode: 0o700 });

try {
  const apiRoot = `https://api.github.com/repos/${REPOSITORY}`;
  const rawRoot = `https://raw.githubusercontent.com/${REPOSITORY}/${REVISION}`;
  const commit = canonicalJson(await boundedFetch(`${apiRoot}/git/commits/${REVISION}`,
    1024 * 1024), "COMMIT_JSON_INVALID");
  const commitObject = JSON.parse(commit.toString("utf8"));
  if (commitObject.sha !== REVISION || typeof commitObject.tree?.sha !== "string") {
    fail("COMMIT_REVISION_INVALID");
  }
  const tree = canonicalJson(await boundedFetch(
    `${apiRoot}/git/trees/${commitObject.tree.sha}?recursive=1`, 16 * 1024 * 1024),
  "TREE_JSON_INVALID");
  writeFileSync(path.join(temporary, "repository-commit.json"), commit,
    { flag: "wx", mode: 0o600 });
  writeFileSync(path.join(temporary, "repository-tree.json"), tree,
    { flag: "wx", mode: 0o600 });
  const objects = [
    { path: "repository-commit.json", sizeBytes: commit.length, sha256: sha256(commit) },
    { path: "repository-tree.json", sizeBytes: tree.length, sha256: sha256(tree) },
  ];
  for (const [localName, upstreamPath, maximumBytes] of FILES) {
    const bytes = await boundedFetch(`${rawRoot}/${upstreamPath}`, maximumBytes);
    writeFileSync(path.join(temporary, localName), bytes, { flag: "wx", mode: 0o600 });
    objects.push({ path: localName, upstreamPath, sizeBytes: bytes.length, sha256: sha256(bytes) });
  }
  renameSync(temporary, target);
  process.stdout.write(`${JSON.stringify({ ok: true, repository: REPOSITORY, revision: REVISION,
    outputDirectory: target, trajectoryBytesDownloaded: 0,
    objects: objects.sort((a, b) => a.path.localeCompare(b.path)) })}\n`);
} catch (error) {
  rmSync(temporary, { recursive: true, force: true });
  throw error;
}
