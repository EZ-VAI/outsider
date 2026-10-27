#!/usr/bin/env node

/*
 * Acquire the bounded Microsoft AgentRx / tau-retail Wave 4 source scope.
 *
 * The selected scope contains the complete released JSON container for 29
 * failed tau-retail executions, the matching manual root-cause annotations,
 * the domain policy/tool schema, and the repository license/readme.  Every
 * object is tied to a frozen Git commit and tree entry.  Nothing is fetched
 * from a mutable branch and no benchmark value is interpreted here.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";

const REPOSITORY = "microsoft/AgentRx";
const REVISION = "f228165bfec60a801fd5fedd9d8ffe0f9de0c69d";
const TREE = "d08e8e454cd027aac69f07b172a20cffd9ecd2ff";
const LINKED_DATASET_REVISION = "88e871fecb58b2d090449f37ec80b8865594e0b5";
const LINKED_DATASET_CARD = Object.freeze({ sizeBytes: 2490,
  sha256: "sha256:2b29f65760747e34364e5f84174573b5741bff2a949d4e136e5da0b50cc1ab5c" });
const DEFAULT_OUTPUT = "artifacts/public-agent-wave4-20260821/source/agentrx-tau";

const FILES = Object.freeze([
  ["LICENSE.txt", "LICENSE.txt", 32 * 1024],
  ["README.md", "README.md", 128 * 1024],
  ["ground-truth.json", "data/ground_truth/tau_ground_truth.json", 512 * 1024],
  ["failure-trajectories.json", "data/tau_retail/tau_dataset_failed.json", 4 * 1024 * 1024],
  ["retail-policy.txt", "data/policies/retail_policy.txt", 128 * 1024],
  ["tool-schema.json", "data/tool_schemas/tools_structure.json", 512 * 1024],
]);

function fail(code, detail = null) {
  throw new Error(detail == null ? `PUBLIC_AGENT_WAVE4_ACQUIRE_${code}`
    : `PUBLIC_AGENT_WAVE4_ACQUIRE_${code}:${detail}`);
}
function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
function parseArgs(argv) {
  if (argv.length === 0) return { output: DEFAULT_OUTPUT };
  if (argv.length !== 2 || argv[0] !== "--output" || !argv[1]) fail("ARGUMENT_INVALID");
  return { output: argv[1] };
}
async function boundedFetch(url, maximumBytes) {
  const response = await fetch(url, { headers: { accept: "application/vnd.github+json",
    "user-agent": "outsider-public-agent-wave4-acquirer/1.0" } });
  if (!response.ok) fail(`FETCH_${response.status}`, url);
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/.test(declared)
    || Number(declared) > maximumBytes)) fail("FETCH_DECLARED_SIZE_INVALID", url);
  const reader = response.body?.getReader();
  if (!reader) fail("FETCH_BODY_MISSING", url);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      fail("FETCH_SIZE_INVALID", url);
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1) fail("FETCH_SIZE_INVALID", url);
  return Buffer.concat(chunks, total);
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
    2 * 1024 * 1024), "COMMIT_JSON_INVALID");
  const commitObject = JSON.parse(commit.toString("utf8"));
  if (commitObject.sha !== REVISION || commitObject.tree?.sha !== TREE) {
    fail("COMMIT_REVISION_INVALID");
  }
  const tree = canonicalJson(await boundedFetch(`${apiRoot}/git/trees/${TREE}?recursive=1`,
    32 * 1024 * 1024), "TREE_JSON_INVALID");
  const treeObject = JSON.parse(tree.toString("utf8"));
  if (treeObject.sha !== TREE || treeObject.truncated !== false
    || !Array.isArray(treeObject.tree)) fail("TREE_INVALID");
  writeFileSync(path.join(temporary, "repository-commit.json"), commit,
    { flag: "wx", mode: 0o600 });
  writeFileSync(path.join(temporary, "repository-tree.json"), tree,
    { flag: "wx", mode: 0o600 });
  const objects = [
    { path: "repository-commit.json", sizeBytes: commit.length, sha256: sha256(commit) },
    { path: "repository-tree.json", sizeBytes: tree.length, sha256: sha256(tree) },
  ];
  for (const [localName, upstreamPath, maximumBytes] of FILES) {
    const entry = treeObject.tree.find((candidate) => candidate?.path === upstreamPath);
    if (entry?.type !== "blob" || !Number.isSafeInteger(entry.size)
      || entry.size < 1 || entry.size > maximumBytes) fail("TREE_OBJECT_INVALID", upstreamPath);
    const bytes = await boundedFetch(`${rawRoot}/${upstreamPath}`, maximumBytes);
    if (bytes.length !== entry.size || gitBlobOid(bytes) !== entry.sha) {
      fail("TREE_OBJECT_BINDING_INVALID", upstreamPath);
    }
    writeFileSync(path.join(temporary, localName), bytes, { flag: "wx", mode: 0o600 });
    objects.push({ path: localName, upstreamPath, gitBlobOid: entry.sha,
      sizeBytes: bytes.length, sha256: sha256(bytes) });
  }
  const linkedDatasetCardUrl = `https://huggingface.co/datasets/microsoft/AgentRx/resolve/${LINKED_DATASET_REVISION}/README.md`;
  const linkedDatasetCard = await boundedFetch(linkedDatasetCardUrl, 32 * 1024);
  if (linkedDatasetCard.length !== LINKED_DATASET_CARD.sizeBytes
    || sha256(linkedDatasetCard) !== LINKED_DATASET_CARD.sha256
    || !/^---\nlicense: cc-by-4\.0\n/m.test(linkedDatasetCard.toString("utf8"))) {
    fail("LINKED_DATASET_CARD_PIN_INVALID");
  }
  writeFileSync(path.join(temporary, "linked-dataset-card.md"), linkedDatasetCard,
    { flag: "wx", mode: 0o600 });
  objects.push({ path: "linked-dataset-card.md",
    upstreamPath: "microsoft/AgentRx/README.md",
    revision: LINKED_DATASET_REVISION,
    sizeBytes: linkedDatasetCard.length,
    sha256: sha256(linkedDatasetCard) });
  renameSync(temporary, target);
  process.stdout.write(`${JSON.stringify({ ok: true, repository: REPOSITORY,
    revision: REVISION, tree: TREE, outputDirectory: target,
    selectedTrajectoryContainers: 1, selectedAnnotationContainers: 1,
    objects: objects.sort((left, right) => left.path.localeCompare(right.path)) })}\n`);
} catch (error) {
  rmSync(temporary, { recursive: true, force: true });
  throw error;
}
