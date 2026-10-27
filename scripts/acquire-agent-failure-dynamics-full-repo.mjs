#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  AGENT_FAILURE_DYNAMICS_DATASET_ID,
  AGENT_FAILURE_DYNAMICS_DISPOSITION,
  AGENT_FAILURE_DYNAMICS_REVISION,
  buildAgentFailureDynamicsArtifactFromSourceDirectory,
  createAgentFailureDynamicsReceipt,
  createAgentFailureDynamicsSourceManifestFromDirectory,
  inspectAgentFailureDynamicsMetadata,
  serializeAgentFailureDynamicsArtifact,
  verifyAgentFailureDynamicsArtifactDirectory,
} from "../src/outsider-agent-failure-dynamics-full-repo.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-agent-failure-dynamics-full-repo-20260829-v1";
const ORIGIN = "https://huggingface.co";
const ENCODED_DATASET = AGENT_FAILURE_DYNAMICS_DATASET_ID.split("/")
  .map(encodeURIComponent).join("/");
const RECORD_URL = `${ORIGIN}/api/datasets/${ENCODED_DATASET}/revision/${AGENT_FAILURE_DYNAMICS_REVISION}`;
const TREE_URL = `${ORIGIN}/api/datasets/${ENCODED_DATASET}/tree/${AGENT_FAILURE_DYNAMICS_REVISION}?recursive=true&expand=false&limit=1000`;
const RESOLVE_BASE = `${ORIGIN}/datasets/${ENCODED_DATASET}/resolve/${AGENT_FAILURE_DYNAMICS_REVISION}`;
const MAX_API_BYTES = 2 * 1024 * 1024;
const MAX_OBJECT_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 180_000;
const FETCH_ATTEMPTS = 7;
const DOWNLOAD_WORKERS = 8;

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENT_FAILURE_DYNAMICS_ACQUIRE_${code}`
    : `AGENT_FAILURE_DYNAMICS_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, sourceOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--source-only") result.sourceOnly = true;
    else if (["--help", "-h"].includes(argument)) {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-agent-failure-dynamics-full-repo.mjs [--output-dir <new-dir>] [--source-only]",
        "",
        `Pins ${AGENT_FAILURE_DYNAMICS_DATASET_ID}@${AGENT_FAILURE_DYNAMICS_REVISION}.`,
        "Acquires all 39 repository files and brackets the complete tree.",
        "evaluate.py, figures, and all source payloads remain inert private bytes.",
      ].join("\n") + "\n");
      process.exit(0);
    } else fail("ARGUMENT_INVALID", argument);
  }
  return result;
}

function mkdirPrivate(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function ensurePrivateParents(file, stop) {
  const missing = [];
  let cursor = path.dirname(file);
  while (cursor !== stop && !existsSync(cursor)) {
    missing.push(cursor); cursor = path.dirname(cursor);
  }
  for (const directory of missing.reverse()) mkdirPrivate(directory);
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function safeOutput(workspace, value) {
  const target = path.resolve(value);
  const relation = path.relative(workspace, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation) || target === path.parse(target).root) {
    fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  }
  return target;
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retry(operation, code) {
  let lastError;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (attempt < FETCH_ATTEMPTS - 1) {
        await delay(Math.min(12_000, 500 * (2 ** attempt)));
      }
    }
  }
  fail(code, lastError instanceof Error ? lastError.message : String(lastError));
}

async function readBounded(response, maximumBytes, exactBytes = null) {
  if (!response.body) fail("FETCH_BODY_MISSING");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared)
    || Number(declared) > maximumBytes
    || exactBytes !== null && Number(declared) !== exactBytes)) {
    fail("FETCH_CONTENT_LENGTH_INVALID", declared);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes || exactBytes !== null && total > exactBytes) {
      await reader.cancel("bounded source limit exceeded");
      fail("FETCH_BODY_TOO_LARGE", String(total));
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1 || exactBytes !== null && total !== exactBytes) {
    fail("FETCH_BODY_SIZE_INVALID", String(total));
  }
  return Buffer.concat(chunks, total);
}

async function fetchApi(url, kind) {
  return retry(async () => {
    const parsed = new URL(url);
    if (parsed.origin !== ORIGIN || parsed.username || parsed.password
      || !decodeURIComponent(parsed.pathname).includes(AGENT_FAILURE_DYNAMICS_REVISION)) {
      fail("API_URL_INVALID", url);
    }
    const response = await fetch(parsed, { redirect: "error", headers: {
      accept: "application/json", "accept-encoding": "identity",
      "user-agent": "outsider-agent-failure-dynamics/1.0",
    }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
      fail(`${kind}_HTTP_${response.status}`);
    }
    if (kind.startsWith("TREE") && response.headers.get("link") !== null) {
      fail("TREE_PAGINATION_UNEXPECTED");
    }
    return readBounded(response, MAX_API_BYTES);
  }, `${kind}_DOWNLOAD_FAILED`);
}

function allowedDownloadHost(hostname) {
  return hostname === "huggingface.co" || hostname.endsWith(".huggingface.co")
    || hostname === "hf.co" || hostname.endsWith(".hf.co")
    || hostname === "xethub.hf.co" || hostname.endsWith(".xethub.hf.co")
    || hostname.endsWith(".cloudfront.net") || hostname.endsWith(".amazonaws.com");
}

async function fetchObject(relative, exactBytes) {
  if (exactBytes < 1 || exactBytes > MAX_OBJECT_BYTES) {
    fail("OBJECT_EXPECTED_SIZE_INVALID", relative);
  }
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  const initial = new URL(`${RESOLVE_BASE}/${encoded}?download=true`);
  return retry(async () => {
    let url = initial;
    for (let redirects = 0; redirects < 6; redirects += 1) {
      if (url.protocol !== "https:" || url.username || url.password
        || !allowedDownloadHost(url.hostname)) fail("OBJECT_URL_INVALID", url.href);
      const response = await fetch(url, { redirect: "manual", headers: {
        accept: "application/octet-stream", "accept-encoding": "identity",
        "user-agent": "outsider-agent-failure-dynamics/1.0",
      }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) fail("OBJECT_REDIRECT_MISSING", relative);
        url = new URL(location, url);
        continue;
      }
      if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
        fail(`OBJECT_HTTP_${response.status}`, relative);
      }
      return readBounded(response, exactBytes, exactBytes);
    }
    fail("OBJECT_REDIRECT_LIMIT", relative);
  }, "OBJECT_DOWNLOAD_FAILED");
}

function writeOrMatch(file, bytes) {
  if (existsSync(file)) {
    const status = lstatSync(file);
    if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600
      || !readFileSync(file).equals(bytes)) fail("CHECKPOINT_METADATA_CHANGED", file);
  } else writePrivate(file, bytes);
}

function validateExistingObject(file, entry) {
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600
    || status.size !== entry.size) fail("CHECKPOINT_FILE_UNSAFE", entry.path);
  const bytes = readFileSync(file);
  if (entry.lfs === null && gitBlobOid(bytes) !== entry.oid
    || entry.lfs !== null && sha256(bytes) !== entry.lfs.oid) {
    fail("CHECKPOINT_FILE_HASH_INVALID", entry.path);
  }
}

async function downloadOne(sourceRoot, entry) {
  const file = path.join(sourceRoot, "files", ...entry.path.split("/"));
  ensurePrivateParents(file, sourceRoot);
  if (existsSync(file)) {
    validateExistingObject(file, entry); return;
  }
  const bytes = await fetchObject(entry.path, entry.size);
  if (entry.lfs === null && gitBlobOid(bytes) !== entry.oid
    || entry.lfs !== null && sha256(bytes) !== entry.lfs.oid) {
    fail("OBJECT_HASH_INVALID", entry.path);
  }
  writePrivate(file, bytes);
}

async function workerPool(items, worker) {
  let cursor = 0;
  let completed = 0;
  async function run() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
      completed += 1;
      if (completed % 8 === 0 || completed === items.length) {
        process.stderr.write(`Source checkpoint ${completed}/${items.length}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_WORKERS, items.length) }, run));
}

async function acquireSource(sourceRoot) {
  mkdirPrivate(sourceRoot);
  const metadata = path.join(sourceRoot, "metadata");
  const files = path.join(sourceRoot, "files");
  mkdirPrivate(metadata); mkdirPrivate(files);
  const recordBeforeFile = path.join(metadata, "dataset-record-before.json");
  const treeBeforeFile = path.join(metadata, "full-tree-before.json");
  const recordBefore = existsSync(recordBeforeFile)
    ? readFileSync(recordBeforeFile) : await fetchApi(RECORD_URL, "RECORD_BEFORE");
  const treeBefore = existsSync(treeBeforeFile)
    ? readFileSync(treeBeforeFile) : await fetchApi(TREE_URL, "TREE_BEFORE");
  writeOrMatch(recordBeforeFile, recordBefore);
  writeOrMatch(treeBeforeFile, treeBefore);
  const snapshot = inspectAgentFailureDynamicsMetadata(recordBefore, treeBefore);
  process.stderr.write(`Pinned complete tree: ${snapshot.tree.entries.length} entries; acquiring all ${snapshot.tree.files.length} files (${snapshot.tree.fileBytes} bytes)...\n`);
  await workerPool(snapshot.tree.files, async (entry) => downloadOne(sourceRoot, entry));
  const recordAfter = await fetchApi(RECORD_URL, "RECORD_AFTER");
  const treeAfter = await fetchApi(TREE_URL, "TREE_AFTER");
  const checked = inspectAgentFailureDynamicsMetadata(recordAfter, treeAfter);
  if (snapshot.record.siblingPathRoot !== checked.record.siblingPathRoot
    || snapshot.tree.root !== checked.tree.root) fail("FIXED_REVISION_STATE_CHANGED");
  writeOrMatch(path.join(metadata, "dataset-record-after.json"), recordAfter);
  writeOrMatch(path.join(metadata, "full-tree-after.json"), treeAfter);
  const manifestFile = path.join(sourceRoot, "source-manifest.json");
  if (!existsSync(manifestFile)) {
    const manifest = createAgentFailureDynamicsSourceManifestFromDirectory(sourceRoot);
    writePrivate(manifestFile, serializeAgentFailureDynamicsArtifact(manifest));
  }
  return snapshot;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const workspace = path.resolve(process.cwd());
  const target = safeOutput(workspace, args.outputDir);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  ensurePrivateParents(target, workspace);
  const checkpoint = `${target}.source-checkpoint`;
  const checkpointManifest = path.join(checkpoint, "source-manifest.json");
  let snapshot;
  if (existsSync(checkpointManifest)) {
    const metadata = path.join(checkpoint, "metadata");
    snapshot = inspectAgentFailureDynamicsMetadata(
      readFileSync(path.join(metadata, "dataset-record-before.json")),
      readFileSync(path.join(metadata, "full-tree-before.json")));
  } else snapshot = await acquireSource(checkpoint);
  if (args.sourceOnly) {
    const manifest = JSON.parse(readFileSync(checkpointManifest, "utf8"));
    const result = {
      ok: true, sourceOnly: true, checkpoint,
      datasetId: AGENT_FAILURE_DYNAMICS_DATASET_ID,
      revision: AGENT_FAILURE_DYNAMICS_REVISION,
      fullTreeEntries: snapshot.tree.entries.length,
      fullTreeFiles: snapshot.tree.files.length,
      fullTreeBytes: snapshot.tree.fileBytes,
      sourceManifestHash: manifest.sourceManifestHash,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  const built = buildAgentFailureDynamicsArtifactFromSourceDirectory(checkpoint);
  const reportBytes = serializeAgentFailureDynamicsArtifact(built.report);
  const manifestBytes = readFileSync(checkpointManifest);
  const receipt = createAgentFailureDynamicsReceipt(
    built.report, reportBytes, manifestBytes);
  const receiptBytes = serializeAgentFailureDynamicsArtifact(receipt);
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirPrivate(staging);
  writePrivate(path.join(staging, "report.json"), reportBytes);
  renameSync(checkpoint, path.join(staging, "source"));
  writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
  renameSync(staging, target);
  const verified = verifyAgentFailureDynamicsArtifactDirectory(target);
  if (!verified.ok) fail("PUBLISHED_ARTIFACT_INVALID", verified.error);
  const result = {
    ok: true, outputDirectory: target,
    datasetId: AGENT_FAILURE_DYNAMICS_DATASET_ID,
    revision: AGENT_FAILURE_DYNAMICS_REVISION,
    fullRepositoryFiles: 39, fullRepositoryBytes: 4_526_823,
    visibleDerivedSequenceRows: 5_072, visibleRawTrajectoryRows: 0,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    authorizedTrainingRows: 0, authorityRows: 0,
    disposition: AGENT_FAILURE_DYNAMICS_DISPOSITION,
    sourceManifestHash: built.sourceManifest.sourceManifestHash,
    sourceRoot: built.sourceManifest.sourceRoot,
    artifactHash: built.report.artifactHash,
    receiptHash: receipt.receiptHash,
    verificationLevel: verified.verificationLevel,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

