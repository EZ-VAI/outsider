#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync,
  readdirSync, renameSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  FR3_RECOVERY_DATASET_ID,
  FR3_RECOVERY_REVISION,
  buildFr3RecoveryReportFromSource,
  createFr3RecoveryReceipt,
  createFr3RecoverySourceManifestFromDirectory,
  fr3RecoveryPayloadSpecifications,
  fr3RecoverySha256,
  inspectFr3RecoveryMetadata,
  serializeFr3RecoveryArtifact,
  verifyFr3RecoveryArtifactDirectory,
  verifyFr3RecoverySourceDirectory,
} from "../src/outsider-fr3-pickplace-recovery-no-video.js";

const ORIGIN = "https://huggingface.co";
const API_BASE = `${ORIGIN}/api/datasets/${FR3_RECOVERY_DATASET_ID}`;
const RECORD_URL = `${API_BASE}/revision/${FR3_RECOVERY_REVISION}`;
const TREE_URL = `${API_BASE}/tree/${FR3_RECOVERY_REVISION}?recursive=true&expand=true`;
const RESOLVE_BASE = `${ORIGIN}/datasets/${FR3_RECOVERY_DATASET_ID}/resolve/${FR3_RECOVERY_REVISION}`;
const FETCH_ATTEMPTS = 4;
const FETCH_TIMEOUT_MS = 900_000;
const MAX_API_BYTES = 2 * 1024 * 1024;
const MAX_OBJECT_BYTES = 8 * 1024 * 1024;
const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "..");
const DEFAULT_OUTPUT = path.join(workspace, "artifacts",
  "outsider-fr3-pickplace-recovery-no-video-20260830-v1");
const DEFAULT_SOURCE =
  path.join(tmpdir(), "outsider-fr3-pickplace-recovery-no-video-source-20260830-v1");
const SEEDS = Object.freeze({
  ".gitattributes": path.join(tmpdir(), "fr3-gitattributes"),
  "README.md": path.join(tmpdir(), "fr3-README.md"),
  "data/chunk-000/file-000.parquet": path.join(tmpdir(), "fr3-data.parquet"),
  "meta/episodes/chunk-000/file-000.parquet": path.join(tmpdir(), "fr3-episodes.parquet"),
  "meta/info.json": path.join(tmpdir(), "fr3-info.json"),
  "meta/stats.json": path.join(tmpdir(), "fr3-stats.json"),
  "meta/tasks.parquet": path.join(tmpdir(), "fr3-tasks.parquet"),
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `FR3_RECOVERY_ACQUIRE_${code}`
    : `FR3_RECOVERY_ACQUIRE_${code}:${detail}`);
}
function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, sourceCandidate: DEFAULT_SOURCE,
    sourceOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) result.outputDir = argv[++index];
    else if (argument === "--source-candidate" && argv[index + 1]) {
      result.sourceCandidate = argv[++index];
    } else if (argument === "--source-only") result.sourceOnly = true;
    else if (["--help", "-h"].includes(argument)) {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-fr3-pickplace-recovery-no-video.mjs --source-only",
        "  node scripts/acquire-fr3-pickplace-recovery-no-video.mjs [--output-dir <new-dir>]",
        "", `Pins ${FR3_RECOVERY_DATASET_ID}@${FR3_RECOVERY_REVISION}.`,
        "Reuses exact verified temporary-directory payload checkpoints when present; formal",
        "fixed-revision record/tree and object-resolution headers are reacquired.",
      ].join("\n") + "\n"); process.exit(0);
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
  const missing = []; let cursor = path.dirname(file);
  while (cursor !== stop && !existsSync(cursor)) {
    missing.push(cursor); cursor = path.dirname(cursor);
  }
  for (const directory of missing.reverse()) mkdirPrivate(directory);
}
function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 }); chmodSync(file, 0o600);
}
function writeOrMatch(file, bytes, sourceRoot) {
  ensurePrivateParents(file, sourceRoot);
  if (existsSync(file)) {
    const status = lstatSync(file);
    if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600
      || !readFileSync(file).equals(bytes)) fail("CHECKPOINT_CHANGED", file);
  } else writePrivate(file, bytes);
}
function safeOutput(value) {
  const target = path.resolve(value); const relation = path.relative(workspace, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation) || target === path.parse(target).root) {
    fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  }
  return target;
}
function safeSource(value) {
  const target = path.resolve(value);
  if ([path.parse(target).root, "/private/tmp", workspace].includes(target)) {
    fail("SOURCE_TOO_BROAD", target);
  }
  return target;
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
      if (attempt < FETCH_ATTEMPTS - 1) await delay(Math.min(10_000, 500 * (2 ** attempt)));
    }
  }
  fail(code, lastError instanceof Error ? lastError.message : String(lastError));
}
async function readBounded(response, maximumBytes, exactBytes = null) {
  if (!response.body || response.headers.get("content-encoding") !== null) {
    fail("FETCH_BODY_INVALID");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maximumBytes
    || exactBytes !== null && Number(declared) !== exactBytes)) {
    fail("CONTENT_LENGTH_INVALID", String(declared));
  }
  const chunks = []; let total = 0; const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > maximumBytes || exactBytes !== null && total > exactBytes) {
      await reader.cancel("bounded limit"); fail("FETCH_BODY_TOO_LARGE", String(total));
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1 || exactBytes !== null && total !== exactBytes) {
    fail("FETCH_BODY_SIZE_INVALID", String(total));
  }
  return Buffer.concat(chunks, total);
}
function validateApiUrl(value) {
  const url = new URL(value);
  if (url.origin !== ORIGIN || url.username || url.password
    || !decodeURIComponent(url.pathname).includes(FR3_RECOVERY_REVISION)) {
    fail("API_URL_INVALID", value);
  }
  return url;
}
async function fetchApi(value) {
  return retry(async () => {
    const response = await fetch(validateApiUrl(value), { redirect: "error", headers: {
      accept: "application/json", "accept-encoding": "identity",
      "user-agent": "outsider-fr3-recovery-source/1.0",
    }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
      fail("API_HTTP", String(response.status));
    }
    if (response.headers.get("link") !== null) fail("API_PAGINATION_UNEXPECTED");
    return readBounded(response, MAX_API_BYTES);
  }, "API_DOWNLOAD_FAILED");
}
function allowedDownloadHost(hostname) {
  return hostname === "huggingface.co" || hostname.endsWith(".huggingface.co")
    || hostname === "hf.co" || hostname.endsWith(".hf.co")
    || hostname === "xethub.hf.co" || hostname.endsWith(".xethub.hf.co")
    || hostname.endsWith(".cloudfront.net") || hostname.endsWith(".amazonaws.com");
}
function initialObjectUrl(specification) {
  const encoded = specification.path.split("/").map(encodeURIComponent).join("/");
  return new URL(`${RESOLVE_BASE}/${encoded}?download=true`);
}
function objectHeader(response, specification) {
  return { path: specification.path, status: response.status, headers: {
    xRepoCommit: response.headers.get("x-repo-commit"),
    xLinkedSize: response.headers.get("x-linked-size"),
    xLinkedEtag: response.headers.get("x-linked-etag"),
    xXetHash: response.headers.get("x-xet-hash"),
  } };
}
async function fetchObjectResolutionHeader(specification) {
  return retry(async () => {
    const url = initialObjectUrl(specification);
    const response = await fetch(url, { method: "HEAD", redirect: "manual", headers: {
      accept: "application/octet-stream", "accept-encoding": "identity",
      "user-agent": "outsider-fr3-recovery-source/1.0",
    }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (![200, 302, 307].includes(response.status)) {
      fail("OBJECT_HEAD_HTTP", `${response.status}:${specification.path}`);
    }
    return objectHeader(response, specification);
  }, "OBJECT_HEAD_FAILED");
}
async function fetchObject(specification) {
  return retry(async () => {
    let url = initialObjectUrl(specification); let initialHeader = null;
    for (let redirects = 0; redirects < 8; redirects += 1) {
      if (url.protocol !== "https:" || url.username || url.password
        || !allowedDownloadHost(url.hostname)) fail("OBJECT_URL_INVALID", url.hostname);
      const response = await fetch(url, { redirect: "manual", headers: {
        accept: "application/octet-stream", "accept-encoding": "identity",
        "user-agent": "outsider-fr3-recovery-source/1.0",
      }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      initialHeader ??= objectHeader(response, specification);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) fail("OBJECT_REDIRECT_MISSING", specification.path);
        if (response.body) await response.body.cancel(); url = new URL(location, url); continue;
      }
      if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
        fail("OBJECT_HTTP", `${response.status}:${specification.path}`);
      }
      const bytes = await readBounded(response, MAX_OBJECT_BYTES, specification.bytes);
      if (fr3RecoverySha256(bytes) !== specification.sha256) {
        fail("OBJECT_DIGEST_INVALID", specification.path);
      }
      return { bytes, header: initialHeader };
    }
    fail("OBJECT_REDIRECT_LIMIT", specification.path);
  }, "OBJECT_DOWNLOAD_FAILED");
}
function verifiedSeed(specification) {
  const seed = SEEDS[specification.path];
  if (!seed || !existsSync(seed)) return null;
  const status = lstatSync(seed);
  if (!status.isFile() || status.isSymbolicLink() || status.size !== specification.bytes) {
    fail("SEED_INVALID", specification.path);
  }
  const bytes = readFileSync(seed);
  if (fr3RecoverySha256(bytes) !== specification.sha256) fail("SEED_DIGEST_INVALID", specification.path);
  return bytes;
}
async function acquireSource(sourceRoot) {
  mkdirPrivate(sourceRoot); const manifestFile = path.join(sourceRoot, "source-manifest.json");
  if (existsSync(manifestFile)) {
    const checked = verifyFr3RecoverySourceDirectory(sourceRoot);
    if (!checked.ok) fail("EXISTING_SOURCE_INVALID", checked.error);
    return checked;
  }
  const beforeRecordFile = path.join(sourceRoot, "metadata/dataset-record-before.json");
  const beforeTreeFile = path.join(sourceRoot, "metadata/full-tree-before.json");
  let beforeRecord; let beforeTree;
  if (existsSync(beforeRecordFile) && existsSync(beforeTreeFile)) {
    beforeRecord = readFileSync(beforeRecordFile); beforeTree = readFileSync(beforeTreeFile);
    inspectFr3RecoveryMetadata(beforeRecord, beforeTree); process.stderr.write("Before bracket reused\n");
  } else if (existsSync(beforeRecordFile) || existsSync(beforeTreeFile)) fail("BEFORE_BRACKET_PARTIAL");
  else {
    beforeRecord = await fetchApi(RECORD_URL); beforeTree = await fetchApi(TREE_URL);
    inspectFr3RecoveryMetadata(beforeRecord, beforeTree);
    writeOrMatch(beforeRecordFile, beforeRecord, sourceRoot);
    writeOrMatch(beforeTreeFile, beforeTree, sourceRoot);
    process.stderr.write("Before bracket checkpointed\n");
  }
  const specifications = fr3RecoveryPayloadSpecifications(); let completed = 0;
  for (const specification of specifications) {
    const destination = path.join(sourceRoot, "files", specification.path);
    const headerFile = path.join(sourceRoot,
      `metadata/object-response-headers/${specification.path}.headers.json`);
    if (existsSync(destination) && existsSync(headerFile)) {
      const bytes = readFileSync(destination);
      if (bytes.length !== specification.bytes || fr3RecoverySha256(bytes) !== specification.sha256) {
        fail("CHECKPOINT_OBJECT_INVALID", specification.path);
      }
    } else if (existsSync(destination) || existsSync(headerFile)) fail("OBJECT_CHECKPOINT_PARTIAL", specification.path);
    else {
      const seed = verifiedSeed(specification);
      if (seed !== null) {
        const header = await fetchObjectResolutionHeader(specification);
        writeOrMatch(destination, seed, sourceRoot);
        writeOrMatch(headerFile, serializeFr3RecoveryArtifact(header), sourceRoot);
        process.stderr.write(`Verified seed reused: ${specification.path}\n`);
      } else {
        const fetched = await fetchObject(specification);
        writeOrMatch(destination, fetched.bytes, sourceRoot);
        writeOrMatch(headerFile, serializeFr3RecoveryArtifact(fetched.header), sourceRoot);
      }
    }
    completed += 1; process.stderr.write(`Payload checkpoint ${completed}/${specifications.length}\n`);
  }
  const afterRecordFile = path.join(sourceRoot, "metadata/dataset-record-after.json");
  const afterTreeFile = path.join(sourceRoot, "metadata/full-tree-after.json");
  let afterRecord; let afterTree;
  if (existsSync(afterRecordFile) && existsSync(afterTreeFile)) {
    afterRecord = readFileSync(afterRecordFile); afterTree = readFileSync(afterTreeFile);
    inspectFr3RecoveryMetadata(afterRecord, afterTree); process.stderr.write("After bracket reused\n");
  } else if (existsSync(afterRecordFile) || existsSync(afterTreeFile)) fail("AFTER_BRACKET_PARTIAL");
  else {
    afterRecord = await fetchApi(RECORD_URL); afterTree = await fetchApi(TREE_URL);
    inspectFr3RecoveryMetadata(afterRecord, afterTree);
    if (!beforeRecord.equals(afterRecord) || !beforeTree.equals(afterTree)) {
      fail("FIXED_REVISION_BRACKET_CHANGED");
    }
    writeOrMatch(afterRecordFile, afterRecord, sourceRoot);
    writeOrMatch(afterTreeFile, afterTree, sourceRoot);
    process.stderr.write("After bracket checkpointed\n");
  }
  if (!beforeRecord.equals(afterRecord) || !beforeTree.equals(afterTree)) {
    fail("FIXED_REVISION_BRACKET_CHANGED");
  }
  const manifest = createFr3RecoverySourceManifestFromDirectory(sourceRoot);
  writePrivate(manifestFile, serializeFr3RecoveryArtifact(manifest));
  const checked = verifyFr3RecoverySourceDirectory(sourceRoot);
  if (!checked.ok) fail("SOURCE_VERIFY_FAILED", checked.error);
  return checked;
}
function copyPrivateTree(source, destination) {
  mkdirPrivate(destination);
  for (const name of readdirSync(source).sort()) {
    const from = path.join(source, name); const to = path.join(destination, name);
    const status = lstatSync(from);
    if (status.isSymbolicLink()) fail("COPY_SYMLINK", from);
    if (status.isDirectory()) copyPrivateTree(from, to);
    else if (status.isFile()) {
      copyFileSync(from, to, 0); chmodSync(to, 0o600);
    } else fail("COPY_TYPE_INVALID", from);
  }
}
function publishArtifact(sourceRoot, outputRoot) {
  if (existsSync(outputRoot)) fail("OUTPUT_EXISTS", outputRoot);
  const parent = path.dirname(outputRoot); if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  const stage = path.join(parent,
    `.${path.basename(outputRoot)}.stage-${process.pid}-${randomBytes(6).toString("hex")}`);
  if (existsSync(stage)) fail("STAGE_EXISTS", stage);
  mkdirPrivate(stage); copyPrivateTree(sourceRoot, path.join(stage, "source"));
  const report = buildFr3RecoveryReportFromSource(path.join(stage, "source"));
  writePrivate(path.join(stage, "report.json"), serializeFr3RecoveryArtifact(report));
  const receipt = createFr3RecoveryReceipt(report);
  writePrivate(path.join(stage, "run-receipt.json"), serializeFr3RecoveryArtifact(receipt));
  renameSync(stage, outputRoot); chmodSync(outputRoot, 0o700);
  const verified = verifyFr3RecoveryArtifactDirectory(outputRoot);
  if (!verified.ok) fail("ARTIFACT_VERIFY_FAILED", verified.error);
  return verified;
}

const options = parseArgs(process.argv.slice(2));
const sourceRoot = safeSource(options.sourceCandidate); const source = await acquireSource(sourceRoot);
if (options.sourceOnly) {
  process.stdout.write(`${JSON.stringify({ sourceRoot,
    manifestHash: source.sourceManifest.manifestHash,
    sourceMerkleRoot: source.sourceManifest.sourceRoot }, null, 2)}\n`);
} else {
  const outputRoot = safeOutput(options.outputDir); const result = publishArtifact(sourceRoot, outputRoot);
  process.stdout.write(`${JSON.stringify({ artifactDirectory: outputRoot,
    artifactHash: result.report.artifactHash, receiptHash: result.receipt.receiptHash,
    sourceManifestHash: result.report.source.sourceManifestHash,
    sourceRoot: result.report.source.sourceRoot }, null, 2)}\n`);
}
