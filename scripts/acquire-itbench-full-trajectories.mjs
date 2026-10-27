#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ITBENCH_DATASET_ID,
  ITBENCH_FULL_DISPOSITION,
  ITBENCH_REVISION,
  buildItBenchFullArtifactFromSourceDirectory,
  createItBenchFullReceipt,
  createItBenchFullSourceManifestFromDirectory,
  inspectItBenchMetadataSnapshot,
  serializeItBenchFullArtifact,
  verifyItBenchFullArtifactDirectory,
} from "../src/outsider-itbench-full-trajectories.js";

const DEFAULT_OUTPUT = "artifacts/outsider-itbench-full-trajectories-20260829-v1";
const ORIGIN = "https://huggingface.co";
const ENCODED_DATASET = ITBENCH_DATASET_ID.split("/").map(encodeURIComponent).join("/");
const RECORD_URL = `${ORIGIN}/api/datasets/${ENCODED_DATASET}/revision/${ITBENCH_REVISION}`;
const TREE_URL = `${ORIGIN}/api/datasets/${ENCODED_DATASET}/tree/${ITBENCH_REVISION}?expand=false&recursive=true&limit=100`;
const RESOLVE_BASE = `${ORIGIN}/datasets/${ENCODED_DATASET}/resolve/${ITBENCH_REVISION}`;
const MAX_API_BYTES = 4 * 1024 * 1024;
const MAX_OBJECT_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 180_000;
const FETCH_ATTEMPTS = 7;
const DOWNLOAD_WORKERS = 10;

function fail(code, detail = null) {
  throw new Error(detail === null ? `ITBENCH_FULL_ACQUIRE_${code}`
    : `ITBENCH_FULL_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-itbench-full-trajectories.mjs [--output-dir <new-dir>] [--source-only]",
        "",
        `Pins ${ITBENCH_DATASET_ID}@${ITBENCH_REVISION}.`,
        "Brackets all six recursive tree pages and acquires all 389 repository",
        "files. Session commands and generated Python remain inert mode-0600 bytes.",
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
    missing.push(cursor);
    cursor = path.dirname(cursor);
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

function checkedApiUrl(value) {
  const url = new URL(value);
  if (url.origin !== ORIGIN || url.username || url.password
    || !decodeURIComponent(url.pathname).includes(ITBENCH_REVISION)) {
    fail("API_URL_INVALID", value);
  }
  return url;
}

async function fetchApi(url, kind) {
  return retry(async () => {
    const parsed = checkedApiUrl(url);
    const response = await fetch(parsed, { redirect: "error", headers: {
      accept: "application/json", "accept-encoding": "identity",
      "user-agent": "outsider-itbench-full/1.0",
    }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
      fail(`${kind}_HTTP_${response.status}`);
    }
    return { bytes: await readBounded(response, MAX_API_BYTES),
      link: response.headers.get("link") };
  }, `${kind}_DOWNLOAD_FAILED`);
}

function nextLink(value) {
  if (value === null) return null;
  const match = /<([^>]+)>;\s*rel="next"/u.exec(value);
  if (match === null) fail("TREE_LINK_INVALID");
  return checkedApiUrl(match[1]).href;
}

async function fetchTreePages() {
  const pages = [];
  let url = TREE_URL;
  for (let page = 1; page <= 6; page += 1) {
    const fetched = await fetchApi(url, `TREE_PAGE_${page}`);
    pages.push(fetched.bytes);
    const next = nextLink(fetched.link);
    if (page < 6 && next === null) fail("TREE_PAGE_MISSING", String(page + 1));
    if (page === 6 && next !== null) fail("TREE_PAGE_SEVEN_UNEXPECTED");
    url = next;
  }
  return pages;
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
        "user-agent": "outsider-itbench-full/1.0",
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

function writeMetadataSnapshot(metadata, when, record, pages) {
  writeOrMatch(path.join(metadata, `dataset-record-${when}.json`), record);
  pages.forEach((bytes, index) => writeOrMatch(path.join(metadata,
    `full-tree-${when}-page${index + 1}.json`), bytes));
}

function readMetadataSnapshot(metadata, when) {
  const recordFile = path.join(metadata, `dataset-record-${when}.json`);
  const pageFiles = Array.from({ length: 6 }, (_, index) => path.join(metadata,
    `full-tree-${when}-page${index + 1}.json`));
  const present = [recordFile, ...pageFiles].filter(existsSync).length;
  if (present === 0) return null;
  if (present !== 7) fail("PARTIAL_METADATA_SNAPSHOT", when);
  return { record: readFileSync(recordFile),
    pages: pageFiles.map((file) => readFileSync(file)) };
}

function validateExistingObject(file, entry) {
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600
    || status.size !== entry.size) fail("CHECKPOINT_FILE_UNSAFE", entry.path);
  if (gitBlobOid(readFileSync(file)) !== entry.oid) {
    fail("CHECKPOINT_FILE_HASH_INVALID", entry.path);
  }
}

async function downloadOne(sourceRoot, entry) {
  const file = path.join(sourceRoot, "files", ...entry.path.split("/"));
  ensurePrivateParents(file, sourceRoot);
  if (existsSync(file)) {
    validateExistingObject(file, entry);
    return;
  }
  const bytes = await fetchObject(entry.path, entry.size);
  if (gitBlobOid(bytes) !== entry.oid) fail("OBJECT_GIT_OID_INVALID", entry.path);
  writePrivate(file, bytes);
}

async function workerPool(items, worker) {
  let cursor = 0;
  let completed = 0;
  async function run() {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
      completed += 1;
      if (completed % 25 === 0 || completed === items.length) {
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
  mkdirPrivate(metadata);
  mkdirPrivate(files);
  let before = readMetadataSnapshot(metadata, "before");
  if (before === null) {
    const record = (await fetchApi(RECORD_URL, "RECORD_BEFORE")).bytes;
    const pages = await fetchTreePages();
    inspectItBenchMetadataSnapshot(record, pages);
    writeMetadataSnapshot(metadata, "before", record, pages);
    before = { record, pages };
  }
  const snapshot = inspectItBenchMetadataSnapshot(before.record, before.pages);
  process.stderr.write(`Pinned six-page tree: ${snapshot.tree.entries.length} entries; acquiring all ${snapshot.tree.files.length} files (${snapshot.tree.fileBytes} bytes)...\n`);
  await workerPool(snapshot.tree.files, async (entry) => downloadOne(sourceRoot, entry));

  let after = readMetadataSnapshot(metadata, "after");
  if (after === null) {
    const record = (await fetchApi(RECORD_URL, "RECORD_AFTER")).bytes;
    const pages = await fetchTreePages();
    const checked = inspectItBenchMetadataSnapshot(record, pages);
    if (snapshot.record.siblingPathRoot !== checked.record.siblingPathRoot
      || snapshot.tree.root !== checked.tree.root) fail("FIXED_REVISION_STATE_CHANGED");
    writeMetadataSnapshot(metadata, "after", record, pages);
    after = { record, pages };
  }
  const checkedAfter = inspectItBenchMetadataSnapshot(after.record, after.pages);
  if (snapshot.record.siblingPathRoot !== checkedAfter.record.siblingPathRoot
    || snapshot.tree.root !== checkedAfter.tree.root) fail("FIXED_REVISION_STATE_CHANGED");
  const manifestFile = path.join(sourceRoot, "source-manifest.json");
  if (!existsSync(manifestFile)) {
    const manifest = createItBenchFullSourceManifestFromDirectory(sourceRoot);
    writePrivate(manifestFile, serializeItBenchFullArtifact(manifest));
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
    const before = readMetadataSnapshot(metadata, "before");
    snapshot = inspectItBenchMetadataSnapshot(before.record, before.pages);
  } else snapshot = await acquireSource(checkpoint);
  if (args.sourceOnly) {
    const manifest = JSON.parse(readFileSync(checkpointManifest, "utf8"));
    const result = {
      ok: true, sourceOnly: true, checkpoint,
      datasetId: ITBENCH_DATASET_ID, revision: ITBENCH_REVISION,
      fullTreePages: snapshot.tree.pages,
      fullTreeEntries: snapshot.tree.entries.length,
      fullTreeFiles: snapshot.tree.files.length,
      fullTreeBytes: snapshot.tree.fileBytes,
      scenarios: snapshot.tree.inventory.scenarioIds.length,
      freshRuns: snapshot.tree.inventory.runs.length,
      sourceManifestHash: manifest.sourceManifestHash,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  const built = buildItBenchFullArtifactFromSourceDirectory(checkpoint);
  const reportBytes = serializeItBenchFullArtifact(built.report);
  const manifestBytes = readFileSync(checkpointManifest);
  const receipt = createItBenchFullReceipt(built.report, reportBytes, manifestBytes);
  const receiptBytes = serializeItBenchFullArtifact(receipt);
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirPrivate(staging);
  writePrivate(path.join(staging, "report.json"), reportBytes);
  renameSync(checkpoint, path.join(staging, "source"));
  // Receipt is deliberately written last before atomic publication.
  writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
  renameSync(staging, target);
  const verified = verifyItBenchFullArtifactDirectory(target);
  if (!verified.ok) fail("PUBLISHED_ARTIFACT_INVALID", verified.error);
  const result = {
    ok: true, outputDirectory: target,
    datasetId: ITBENCH_DATASET_ID, revision: ITBENCH_REVISION,
    fullRepositoryFiles: 389, fullRepositoryBytes: 23_173_423,
    scenarios: 35, freshRuns: 105, sessions: 105,
    agentOutputs: 90, judgeOutputs: 90, generatedCodeFiles: 102,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    authorizedTrainingRows: 0, authorityRows: 0,
    disposition: ITBENCH_FULL_DISPOSITION,
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
