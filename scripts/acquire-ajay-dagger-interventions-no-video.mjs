#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  readFileSync, readdirSync, renameSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildAjayDaggerReportFromSource,
  createAjayDaggerReceipt,
  createAjayDaggerSourceManifestFromDirectory,
  serializeAjayDaggerArtifact,
  verifyAjayDaggerArtifactDirectory,
  verifyAjayDaggerSourceDirectory,
} from "../src/outsider-ajay-dagger-interventions-no-video.js";

const ORIGIN = "https://huggingface.co";
const ATTEMPTS = 5;
const TIMEOUT_MS = 300_000;
const CONCURRENCY = 16;
const MAX_API_BYTES = 4 * 1024 * 1024;
const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "..");
const DEFAULT_SOURCE = path.join(tmpdir(), "outsider-ajay-dagger-interventions-no-video-source-20260830-v1");
const DEFAULT_REPLAY = path.join(tmpdir(), "ajay-dagger-replay.json");
const DEFAULT_OUTPUT = path.join(workspace, "artifacts",
  "outsider-ajay-dagger-interventions-no-video-20260830-v1");

const REPOSITORIES = Object.freeze([
  Object.freeze({ key: "derived",
    id: "ajaysri/route_subtasks_dual_overhead_pi05_448_dagger_interventions_balanced",
    revision: "05af6eeb8c525f76cc1b7b9c0f156cf546adf71e",
    entries: 3_585, files: 3_575, directories: 10, bytes: 740_445_997,
    videoFiles: 2_852, videoBytes: 704_955_105,
    noVideoFiles: 723, noVideoBytes: 35_490_892,
    parquetFiles: 713, parquetBytes: 30_305_026 }),
  Object.freeze({ key: "base", id: "ajaysri/route_subtasks_dual_overhead_pi05_448",
    revision: "2c95bea69a0aa9874669548ba3e506e71ff936de",
    entries: 2_989, files: 2_979, directories: 10, bytes: 649_845_522,
    videoFiles: 1_980, videoBytes: 613_490_034,
    noVideoFiles: 999, noVideoBytes: 36_355_488,
    parquetFiles: 495 }),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `AJAY_DAGGER_ACQUIRE_${code}`
    : `AJAY_DAGGER_ACQUIRE_${code}:${detail}`);
}
function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function gitOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes).digest("hex");
}
function digest(domain, value) {
  return sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}
function serialize(value) { return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"); }
function parseArgs(argv) {
  const result = { sourceDir: DEFAULT_SOURCE, replayFile: DEFAULT_REPLAY,
    outputDir: DEFAULT_OUTPUT, sourceOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source-dir" && argv[index + 1]) result.sourceDir = argv[++index];
    else if (argument === "--replay-file" && argv[index + 1]) result.replayFile = argv[++index];
    else if (argument === "--output-dir" && argv[index + 1]) result.outputDir = argv[++index];
    else if (argument === "--source-only") result.sourceOnly = true;
    else if (["--help", "-h"].includes(argument)) {
      process.stdout.write("Usage: node scripts/acquire-ajay-dagger-interventions-no-video.mjs [--source-dir <dir>] [--replay-file <json>] [--output-dir <new-dir>] [--source-only]\n");
      process.exit(0);
    } else fail("ARGUMENT", argument);
  }
  return result;
}
function safeOutput(value) {
  const target = path.resolve(value); const relation = path.relative(workspace, target);
  if (!relation || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  return target;
}
function safeSource(value) {
  const target = path.resolve(value);
  if ([path.parse(target).root, "/private/tmp", workspace].includes(target)) {
    fail("SOURCE_TOO_BROAD", target);
  }
  return target;
}
function mkdirPrivate(directory) {
  if (!existsSync(directory)) {
    try { mkdirSync(directory, { mode: 0o700 }); }
    catch (error) { if (!existsSync(directory)) throw error; }
  }
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink()) fail("DIRECTORY", directory);
  chmodSync(directory, 0o700);
}
function ensureParents(file, stop) {
  const missing = []; let cursor = path.dirname(file);
  while (cursor !== stop && !existsSync(cursor)) { missing.push(cursor); cursor = path.dirname(cursor); }
  for (const directory of missing.reverse()) mkdirPrivate(directory);
}
function writeOrMatch(file, bytes, root) {
  ensureParents(file, root);
  if (existsSync(file)) {
    const status = lstatSync(file);
    if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600
      || status.size !== bytes.length || !readFileSync(file).equals(bytes)) {
      fail("CHECKPOINT_CHANGED", file);
    }
    return;
  }
  const temporary = `${file}.part-${process.pid}`;
  writeFileSync(temporary, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(temporary, 0o600); renameSync(temporary, file);
}
async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function retry(operation, code) {
  let last;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      last = error;
      if (attempt + 1 < ATTEMPTS) await delay(300 * (2 ** attempt));
    }
  }
  fail(code, last?.message ?? String(last));
}
async function readBounded(response, maximumBytes, exactBytes = null) {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > maximumBytes) fail("BODY_TOO_LARGE");
  const chunks = []; let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maximumBytes) fail("BODY_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  if (exactBytes !== null && total !== exactBytes) fail("BODY_SIZE", `${total}:${exactBytes}`);
  return Buffer.concat(chunks, total);
}
async function fetchApi(url) {
  return retry(async () => {
    const response = await fetch(url, { headers: { accept: "application/json",
      "accept-encoding": "identity", "user-agent": "outsider-ajay-dagger-source/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
      fail("API_HTTP", `${response.status}:${url}`);
    }
    return { bytes: await readBounded(response, MAX_API_BYTES),
      header: { url, status: response.status, contentType: response.headers.get("content-type"),
        etag: response.headers.get("etag"), link: response.headers.get("link"),
        date: response.headers.get("date") } };
  }, "API_FETCH");
}
function nextLink(value) {
  if (value === null) return null;
  const match = value.match(/^<([^>]+)>; rel="next"$/u);
  if (!match) fail("LINK", value);
  const url = new URL(match[1]);
  if (url.protocol !== "https:" || url.hostname !== "huggingface.co"
    || url.username || url.password) fail("LINK_URL", match[1]);
  return url.href;
}
async function fetchTree(specification) {
  let url = `${ORIGIN}/api/datasets/${specification.id}/tree/`
    + `${specification.revision}?recursive=true&limit=1000`;
  const pages = []; const entries = [];
  while (url !== null) {
    const page = await fetchApi(url); const parsed = JSON.parse(page.bytes);
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 1000) fail("TREE_PAGE");
    pages.push(page); entries.push(...parsed); url = nextLink(page.header.link);
    if (pages.length > 10) fail("TREE_PAGES");
  }
  return { pages, entries };
}
function projectTree(specification, entries) {
  const files = entries.filter((item) => item.type === "file");
  const directories = entries.filter((item) => item.type === "directory");
  const video = files.filter((item) => item.path.endsWith(".mp4"));
  const noVideo = files.filter((item) => !item.path.endsWith(".mp4"));
  const parquet = noVideo.filter((item) => item.path.endsWith(".parquet"));
  const sum = (rows) => rows.reduce((total, item) => total + item.size, 0);
  if (entries.length !== specification.entries || files.length !== specification.files
    || directories.length !== specification.directories || sum(files) !== specification.bytes
    || video.length !== specification.videoFiles || sum(video) !== specification.videoBytes
    || noVideo.length !== specification.noVideoFiles || sum(noVideo) !== specification.noVideoBytes
    || parquet.length !== specification.parquetFiles
    || specification.parquetBytes !== undefined && sum(parquet) !== specification.parquetBytes) {
    fail("TREE_CENSUS", specification.key);
  }
  const projection = entries.map((item) => ({ type: item.type, path: item.path,
    oid: item.oid, size: item.size, lfs: item.lfs ?? null, xetHash: item.xetHash ?? null }));
  return { treeRoot: digest("outsider/ajay-dagger-tree/v1", projection), files,
    noVideo: noVideo.sort((left, right) => left.path.localeCompare(right.path)),
    summary: { entries: entries.length, files: files.length, directories: directories.length,
      bytes: sum(files), videoFiles: video.length, videoBytes: sum(video),
      noVideoFiles: noVideo.length, noVideoBytes: sum(noVideo),
      parquetFiles: parquet.length, parquetBytes: sum(parquet) } };
}
function validateRecord(specification, bytes, filePaths) {
  const record = JSON.parse(bytes); const siblings = (record.siblings ?? [])
    .map((item) => item.rfilename).sort();
  if (record.id !== specification.id || record.sha !== specification.revision
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.cardData?.license !== "apache-2.0" || siblings.length !== specification.files
    || canonicalizeStrict(siblings) !== canonicalizeStrict([...filePaths].sort())) {
    fail("RECORD", specification.key);
  }
  return { recordRoot: digest("outsider/ajay-dagger-record/v1", {
    id: record.id, sha: record.sha, private: record.private, gated: record.gated,
    disabled: record.disabled, license: record.cardData.license,
    usedStorage: record.usedStorage, siblings }), usedStorage: record.usedStorage };
}
async function fetchObject(specification, item) {
  return retry(async () => {
    const url = `${ORIGIN}/datasets/${specification.id}/resolve/`
      + `${specification.revision}/${item.path}?download=true`;
    const response = await fetch(url, { headers: { accept: "application/octet-stream",
      "accept-encoding": "identity", "user-agent": "outsider-ajay-dagger-source/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
      fail("OBJECT_HTTP", `${response.status}:${item.path}`);
    }
    const final = new URL(response.url);
    if (final.protocol !== "https:" || final.username || final.password) fail("OBJECT_URL");
    const bytes = await readBounded(response, Math.max(item.size, 1), item.size);
    const hash = sha256(bytes);
    if (item.lfs?.oid && hash !== `sha256:${item.lfs.oid}`) fail("LFS_HASH", item.path);
    if (!item.lfs && gitOid(bytes) !== item.oid) fail("GIT_HASH", item.path);
    return { bytes, sha256: hash };
  }, `OBJECT_FETCH:${item.path}`);
}
function verifyCheckpoint(file, item) {
  if (!existsSync(file)) return null;
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600
    || status.size !== item.size) fail("OBJECT_CHECKPOINT", item.path);
  const bytes = readFileSync(file); const hash = sha256(bytes);
  if (item.lfs?.oid && hash !== `sha256:${item.lfs.oid}`) fail("OBJECT_CHECKPOINT_HASH", item.path);
  if (!item.lfs && gitOid(bytes) !== item.oid) fail("OBJECT_CHECKPOINT_GIT", item.path);
  return hash;
}
async function acquireObjects(root, specification, items) {
  const results = new Array(items.length); let cursor = 0; let completed = 0;
  async function worker() {
    while (true) {
      const index = cursor; cursor += 1; if (index >= items.length) return;
      const item = items[index]; const destination = path.join(root, "files", specification.key, item.path);
      let hash = verifyCheckpoint(destination, item);
      if (hash === null) {
        const fetched = await fetchObject(specification, item);
        writeOrMatch(destination, fetched.bytes, root); hash = fetched.sha256;
      }
      results[index] = { path: item.path, bytes: item.size, oid: item.oid,
        lfs: item.lfs ?? null, xetHash: item.xetHash ?? null, sha256: hash };
      completed += 1;
      if (completed % 50 === 0 || completed === items.length) {
        process.stderr.write(`${specification.key} no-video ${completed}/${items.length}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker())); return results;
}
function writeTreeBracket(root, specification, phase, tree) {
  tree.pages.forEach((page, index) => {
    const stem = `metadata/${specification.key}-tree-${phase}-page-${String(index + 1).padStart(3, "0")}`;
    writeOrMatch(path.join(root, `${stem}.json`), page.bytes, root);
    writeOrMatch(path.join(root, `${stem}.headers.json`), serialize(page.header), root);
  });
}

function copyPrivateTree(source, destination) {
  mkdirPrivate(destination);
  for (const name of readdirSync(source).sort()) {
    const from = path.join(source, name); const to = path.join(destination, name);
    const status = lstatSync(from);
    if (status.isSymbolicLink()) fail("SOURCE_SYMLINK", from);
    if (status.isDirectory()) copyPrivateTree(from, to);
    else if (status.isFile()) {
      copyFileSync(from, to, constants.COPYFILE_EXCL); chmodSync(to, 0o600);
    } else fail("SOURCE_TYPE", from);
  }
}
function finalizeSource(sourceRoot, replayFile) {
  const manifestFile = path.join(sourceRoot, "source-manifest.json");
  if (existsSync(manifestFile)) {
    const checked = verifyAjayDaggerSourceDirectory(sourceRoot);
    if (!checked.ok) fail("EXISTING_SOURCE_INVALID", checked.error);
    return checked;
  }
  const replay = path.resolve(replayFile); const status = lstatSync(replay);
  if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600
    || status.size > 2 * 1024 * 1024) fail("REPLAY_FILE");
  writeOrMatch(path.join(sourceRoot, "replay-evidence.json"), readFileSync(replay), sourceRoot);
  const manifest = createAjayDaggerSourceManifestFromDirectory(sourceRoot);
  writeOrMatch(manifestFile, serializeAjayDaggerArtifact(manifest), sourceRoot);
  const checked = verifyAjayDaggerSourceDirectory(sourceRoot);
  if (!checked.ok) fail("SOURCE_VERIFY", checked.error);
  return checked;
}
function buildArtifact(sourceRoot, outputRoot) {
  if (existsSync(outputRoot)) fail("OUTPUT_EXISTS", outputRoot);
  mkdirPrivate(path.dirname(outputRoot));
  const stage = `${outputRoot}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  mkdirPrivate(stage);
  try {
    copyPrivateTree(sourceRoot, path.join(stage, "source"));
    const report = buildAjayDaggerReportFromSource(path.join(stage, "source"));
    writeOrMatch(path.join(stage, "report.json"), serializeAjayDaggerArtifact(report), stage);
    const receipt = createAjayDaggerReceipt(report);
    writeOrMatch(path.join(stage, "receipt.json"), serializeAjayDaggerArtifact(receipt), stage);
    const checked = verifyAjayDaggerArtifactDirectory(stage);
    if (!checked.ok) fail("ARTIFACT_VERIFY", checked.error);
    renameSync(stage, outputRoot); return verifyAjayDaggerArtifactDirectory(outputRoot);
  } catch (error) {
    process.stderr.write(`Incomplete staging directory retained: ${stage}\n`); throw error;
  }
}

async function main() {
  const arguments_ = parseArgs(process.argv.slice(2));
  const sourceRoot = safeSource(arguments_.sourceDir); mkdirPrivate(sourceRoot);
  const completedIndex = path.join(sourceRoot, "acquisition-index.json");
  if (existsSync(completedIndex)) {
    process.stdout.write(`checkpointComplete=${completedIndex}\n`);
  } else {
    const repositoryResults = [];
    for (const specification of REPOSITORIES) {
    const recordUrl = `${ORIGIN}/api/datasets/${specification.id}/revision/${specification.revision}`;
    const beforeRecord = await fetchApi(recordUrl); const beforeTree = await fetchTree(specification);
    const before = projectTree(specification, beforeTree.entries);
    const beforeRecordProjection = validateRecord(specification, beforeRecord.bytes,
      before.files.map((item) => item.path));
    writeOrMatch(path.join(sourceRoot, `metadata/${specification.key}-record-before.json`),
      beforeRecord.bytes, sourceRoot);
    writeOrMatch(path.join(sourceRoot, `metadata/${specification.key}-record-before.headers.json`),
      serialize(beforeRecord.header), sourceRoot);
    writeTreeBracket(sourceRoot, specification, "before", beforeTree);
    const objects = await acquireObjects(sourceRoot, specification, before.noVideo);
    const afterRecord = await fetchApi(recordUrl); const afterTree = await fetchTree(specification);
    const after = projectTree(specification, afterTree.entries);
    const afterRecordProjection = validateRecord(specification, afterRecord.bytes,
      after.files.map((item) => item.path));
    if (before.treeRoot !== after.treeRoot
      || beforeRecordProjection.recordRoot !== afterRecordProjection.recordRoot) {
      fail("BRACKET_DRIFT", specification.key);
    }
    writeOrMatch(path.join(sourceRoot, `metadata/${specification.key}-record-after.json`),
      afterRecord.bytes, sourceRoot);
    writeOrMatch(path.join(sourceRoot, `metadata/${specification.key}-record-after.headers.json`),
      serialize(afterRecord.header), sourceRoot);
    writeTreeBracket(sourceRoot, specification, "after", afterTree);
    repositoryResults.push({ key: specification.key, id: specification.id,
      revision: specification.revision, beforePages: beforeTree.pages.length,
      afterPages: afterTree.pages.length, treeRoot: before.treeRoot,
      recordRoot: beforeRecordProjection.recordRoot,
      recordUsedStorageBytes: beforeRecordProjection.usedStorage,
      recordBeforeAfterByteIdentical: beforeRecord.bytes.equals(afterRecord.bytes),
      treeSummary: before.summary, objects });
      process.stderr.write(`${specification.key} bracket complete\n`);
    }
    const body = { schema: "outsider/ajay-dagger-interventions-no-video-acquisition/v1",
      completeDerivedNoVideo: true, completeBaseNoVideo: true,
      videoPayloadFilesAcquired: 0, publisherCodeExecuted: false,
      repositories: repositoryResults };
    const index = { ...body, acquisitionHash: digest("outsider/ajay-dagger-acquisition/v1", body) };
    writeOrMatch(completedIndex, serialize(index), sourceRoot);
    process.stdout.write(`acquisitionHash=${index.acquisitionHash}\n`);
  }
  if (arguments_.sourceOnly) return;
  const source = finalizeSource(sourceRoot, arguments_.replayFile);
  process.stdout.write(`sourceManifestHash=${source.manifest.manifestHash}\n`);
  process.stdout.write(`sourceRoot=${source.manifest.sourceRoot}\n`);
  const artifact = buildArtifact(sourceRoot, safeOutput(arguments_.outputDir));
  if (!artifact.ok) fail("FINAL_VERIFY", artifact.error);
  process.stdout.write(`reportHash=${artifact.report.artifactHash}\n`);
  process.stdout.write(`receiptHash=${artifact.receipt.receiptHash}\n`);
}

main().catch((error) => { process.stderr.write(`${error?.stack ?? error}\n`); process.exitCode = 1; });
