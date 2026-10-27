#!/usr/bin/env node

/*
 * Acquire the bounded Wave 5 Trace Commons and ROBUST source scopes.
 *
 * Both repositories are addressed only through immutable revisions.  The
 * acquirer derives the selection from the pinned tree, verifies every raw
 * object's Git blob OID, and atomically publishes a no-clobber directory.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";

const DEFAULT_OUTPUT = "artifacts/public-evidence-wave5-20260821/source";
const TRACE = Object.freeze({
  id: "trace-commons/agent-traces",
  revision: "112ebd4d03ce852b00e935d523107c3d0c9a65bf",
  licenseId: "CC-BY-4.0",
  selectionRule: "per nonempty harness at pinned revision: lexicographically first raw session whose byte size is 16KiB..256KiB",
  selected: Object.freeze([
    Object.freeze({ harness: "claude_code",
      path: "sessions/claude_code/0ca72c0c-ac42-400a-8ca6-cc31a787225f.jsonl",
      oid: "00ca9fa9962904a912f82584aa078980d511f2d2", sizeBytes: 200_514 }),
    Object.freeze({ harness: "cursor",
      path: "sessions/cursor/debaa898-grafana-loki-monitoring.jsonl",
      oid: "48b158f18bfdabd071d8776e20ff960fa2e6aa6a", sizeBytes: 25_429 }),
    Object.freeze({ harness: "opencode",
      path: "sessions/opencode/ses_129b55f7effeSKRtimLg9wxpXa.json",
      oid: "2647ae3504b450b200e076aad1d61109c31089a9", sizeBytes: 97_897 }),
  ]),
});
const ROBUST = Object.freeze({
  repository: "robust-rosin/robust",
  revision: "521fe75319c256995fae6f5a4b756f0bfa4bf65e",
  tree: "70f8f66e9e81bf7f119829857d0e58ad18bbd760",
  namespaces: Object.freeze(["motoman", "universal_robot"]),
  candidateBugFiles: 47,
  notABugMarkers: 1,
});
const BUG_PATH = /^(motoman|universal_robot)\/([a-f0-9]{7})\/\2\.bug$/;
const NOT_A_BUG_PATH = /^(motoman|universal_robot)\/([a-f0-9]{7})\/NOT_A_BUG$/;

function fail(code, detail = null) {
  throw new Error(detail == null ? `PUBLIC_EVIDENCE_WAVE5_ACQUIRE_${code}`
    : `PUBLIC_EVIDENCE_WAVE5_ACQUIRE_${code}:${detail}`);
}
function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}
function canonicalJson(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`);
}
function parseArgs(argv) {
  if (argv.length === 0) return { output: DEFAULT_OUTPUT };
  if (argv.length !== 2 || argv[0] !== "--output" || !argv[1]) fail("ARGUMENT_INVALID");
  return { output: argv[1] };
}
async function boundedFetch(url, maximumBytes, { allowEmpty = false } = {}) {
  const response = await fetch(url, { headers: { accept: "application/json",
    "user-agent": "outsider-public-evidence-wave5-acquirer/1.0" } });
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
  if (!allowEmpty && total < 1) fail("FETCH_SIZE_INVALID", url);
  return Buffer.concat(chunks, total);
}
async function jsonFetch(url, maximumBytes) {
  const bytes = await boundedFetch(url, maximumBytes);
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail("FETCH_JSON_INVALID", url); }
}
function writeObject(root, localPath, bytes) {
  const target = path.join(root, localPath);
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  return { path: localPath, sizeBytes: bytes.length, sha256: sha256(bytes) };
}
async function mapConcurrent(values, width, operation) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      output[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, values.length) }, worker));
  return output;
}

async function acquireTrace(root) {
  const api = `https://huggingface.co/api/datasets/${TRACE.id}`;
  const metadata = await jsonFetch(api, 2 * 1024 * 1024);
  if (metadata.id !== TRACE.id || metadata.sha !== TRACE.revision || metadata.private !== false
    || metadata.gated !== false || metadata.disabled !== false
    || String(metadata.cardData?.license).toUpperCase() !== TRACE.licenseId) {
    fail("TRACE_REVISION_METADATA_INVALID");
  }
  const tree = await jsonFetch(`${api}/tree/${TRACE.revision}?recursive=true&expand=true`,
    16 * 1024 * 1024);
  if (!Array.isArray(tree)) fail("TRACE_TREE_INVALID");
  const files = tree.filter((entry) => entry?.type === "file"
    && typeof entry.path === "string" && Number.isSafeInteger(entry.size)
    && /^[a-f0-9]{40}$/.test(entry.oid ?? ""));
  const candidates = files.filter((entry) => /^sessions\/[^/]+\/[^/]+\.(jsonl|json)$/.test(entry.path)
    && entry.size >= 16 * 1024 && entry.size <= 256 * 1024);
  const harnesses = [...new Set(candidates.map((entry) => entry.path.split("/")[1]))].sort();
  const selected = harnesses.map((harness) => {
    const entry = candidates.filter((candidate) => candidate.path.split("/")[1] === harness)
      .sort((left, right) => left.path.localeCompare(right.path))[0];
    return { harness, path: entry.path, oid: entry.oid, sizeBytes: entry.size };
  });
  if (!same(selected, TRACE.selected)) fail("TRACE_SELECTION_DERIVATION_CHANGED");
  const readmeEntry = files.find((entry) => entry.path === "README.md");
  if (!readmeEntry || readmeEntry.size !== 7_793
    || readmeEntry.oid !== "5ac038aa379c4504acead354cc2edf269b144383") {
    fail("TRACE_README_TREE_ENTRY_INVALID");
  }
  const revisionProjection = canonicalJson({ id: TRACE.id, revision: TRACE.revision,
    private: false, gated: false, disabled: false, licenseId: TRACE.licenseId });
  const treeProjection = canonicalJson({ id: TRACE.id, revision: TRACE.revision,
    selectionRule: TRACE.selectionRule, selected });
  const objects = [
    writeObject(root, "repository-revision.json", revisionProjection),
    writeObject(root, "selected-tree.json", treeProjection),
  ];
  const rawRoot = `https://huggingface.co/datasets/${TRACE.id}/resolve/${TRACE.revision}`;
  const rawEntries = [readmeEntry, ...selected.map((selection) =>
    files.find((entry) => entry.path === selection.path))];
  const downloaded = await mapConcurrent(rawEntries, 4, async (entry) => {
    if (!entry) fail("TRACE_SELECTED_ENTRY_MISSING");
    const bytes = await boundedFetch(`${rawRoot}/${entry.path}?download=true`, entry.size);
    if (bytes.length !== entry.size || gitBlobOid(bytes) !== entry.oid) {
      fail("TRACE_OBJECT_BINDING_INVALID", entry.path);
    }
    return { ...writeObject(root, entry.path, bytes), gitBlobOid: entry.oid };
  });
  objects.push(...downloaded);
  return { source: TRACE.id, revision: TRACE.revision, selectedSessions: selected.length,
    selectedHarnesses: harnesses, objects: objects.sort((left, right) =>
      left.path.localeCompare(right.path)) };
}

async function acquireRobust(root) {
  const api = `https://api.github.com/repos/${ROBUST.repository}`;
  const commit = await jsonFetch(`${api}/git/commits/${ROBUST.revision}`, 2 * 1024 * 1024);
  if (commit.sha !== ROBUST.revision || commit.tree?.sha !== ROBUST.tree) {
    fail("ROBUST_COMMIT_INVALID");
  }
  const tree = await jsonFetch(`${api}/git/trees/${ROBUST.tree}?recursive=1`,
    16 * 1024 * 1024);
  if (tree.sha !== ROBUST.tree || tree.truncated !== false || !Array.isArray(tree.tree)) {
    fail("ROBUST_TREE_INVALID");
  }
  const projectedCommit = canonicalJson({ sha: commit.sha,
    tree: { sha: commit.tree.sha },
    parents: commit.parents.map(({ sha }) => ({ sha })),
    author: { date: commit.author?.date ?? null },
    committer: { date: commit.committer?.date ?? null },
    verification: { verified: commit.verification?.verified === true,
      reason: commit.verification?.reason ?? null } });
  const projectedTreeValue = { sha: tree.sha, truncated: false,
    tree: tree.tree.map(({ path: objectPath, mode, type, sha, size }) => ({
      path: objectPath, mode, type, sha, ...(Number.isSafeInteger(size) ? { size } : {}),
    })).sort((left, right) => left.path.localeCompare(right.path)) };
  const projectedTree = canonicalJson(projectedTreeValue);
  const objects = [
    writeObject(root, "repository-commit.json", projectedCommit),
    writeObject(root, "repository-tree.json", projectedTree),
  ];
  const entries = projectedTreeValue.tree.filter((entry) => entry.type === "blob"
    && (BUG_PATH.test(entry.path) || NOT_A_BUG_PATH.test(entry.path)));
  const bugCount = entries.filter((entry) => BUG_PATH.test(entry.path)).length;
  const markerCount = entries.filter((entry) => NOT_A_BUG_PATH.test(entry.path)).length;
  if (bugCount !== ROBUST.candidateBugFiles || markerCount !== ROBUST.notABugMarkers) {
    fail("ROBUST_SELECTION_COUNT_INVALID");
  }
  const rootLicense = projectedTreeValue.tree.some((entry) => entry.type === "blob"
    && !entry.path.includes("/") && /^(LICENSE|LICENSE\..*|COPYING|COPYING\..*)$/i.test(entry.path));
  if (rootLicense) fail("ROBUST_RIGHTS_BOUNDARY_CHANGED");
  const readmeEntry = projectedTreeValue.tree.find((entry) => entry.path === "README.md");
  if (readmeEntry?.type !== "blob" || readmeEntry.size !== 4_792
    || readmeEntry.sha !== "e56492fbd2408d414d3559b352ea20f41aa4ac6d") {
    fail("ROBUST_README_TREE_ENTRY_INVALID");
  }
  const rawRoot = `https://raw.githubusercontent.com/${ROBUST.repository}/${ROBUST.revision}`;
  const downloaded = await mapConcurrent([readmeEntry, ...entries], 8, async (entry) => {
    const bytes = await boundedFetch(`${rawRoot}/${entry.path}`,
      Math.max(1, entry.size), { allowEmpty: entry.size === 0 });
    if (bytes.length !== entry.size || gitBlobOid(bytes) !== entry.sha) {
      fail("ROBUST_OBJECT_BINDING_INVALID", entry.path);
    }
    return { ...writeObject(root, entry.path, bytes), gitBlobOid: entry.sha };
  });
  objects.push(...downloaded);
  return { source: ROBUST.repository, revision: ROBUST.revision, tree: ROBUST.tree,
    candidateBugFiles: bugCount, excludedNotABugMarkers: markerCount,
    rootLicenseDetected: false,
    objects: objects.sort((left, right) => left.path.localeCompare(right.path)) };
}

const { output } = parseArgs(process.argv.slice(2));
const target = path.resolve(output);
if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_TOO_BROAD");
mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
const temporary = path.join(path.dirname(target),
  `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
mkdirSync(temporary, { mode: 0o700 });

try {
  const [trace, robust] = await Promise.all([
    acquireTrace(path.join(temporary, "trace-commons")),
    acquireRobust(path.join(temporary, "robust-ros")),
  ]);
  renameSync(temporary, target);
  process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory: target,
    sources: [trace, robust] })}\n`);
} catch (error) {
  rmSync(temporary, { recursive: true, force: true });
  throw error;
}
