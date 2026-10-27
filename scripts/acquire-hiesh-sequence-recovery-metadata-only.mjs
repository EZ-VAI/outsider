#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync,
  readdirSync, renameSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  HIESH_SEQUENCE_RECOVERY_REPOSITORIES,
  buildHieshSequenceRecoveryReportFromSource,
  createHieshSequenceRecoveryReceipt,
  createHieshSequenceRecoverySourceManifestFromDirectory,
  hieshSequenceRecoverySha256,
  serializeHieshSequenceRecoveryArtifact,
  verifyHieshSequenceRecoveryArtifactDirectory,
  verifyHieshSequenceRecoverySourceDirectory,
} from "../src/outsider-hiesh-sequence-recovery-metadata-only.js";

const ORIGIN = "https://huggingface.co";
const ATTEMPTS = 4;
const TIMEOUT_MS = 180_000;
const MAX_API_BYTES = 2 * 1024 * 1024;
const MAX_SMALL_BYTES = 64 * 1024;
const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "..");
const DEFAULT_SOURCE =
  path.join(tmpdir(), "outsider-hiesh-sequence-recovery-metadata-only-source-20260830-v1");
const DEFAULT_EVIDENCE = path.join(tmpdir(), "hiesh-terminal-evidence.json");
const DEFAULT_OUTPUT = path.join(workspace, "artifacts",
  "outsider-hiesh-sequence-recovery-metadata-only-20260830-v1");

function fail(code, detail = null) {
  throw new Error(detail === null ? `HIESH_SEQUENCE_RECOVERY_ACQUIRE_${code}`
    : `HIESH_SEQUENCE_RECOVERY_ACQUIRE_${code}:${detail}`);
}
function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, sourceDir: DEFAULT_SOURCE,
    evidenceFile: DEFAULT_EVIDENCE, sourceOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) result.outputDir = argv[++index];
    else if (argument === "--source-dir" && argv[index + 1]) result.sourceDir = argv[++index];
    else if (argument === "--evidence-file" && argv[index + 1]) {
      result.evidenceFile = argv[++index];
    } else if (argument === "--source-only") result.sourceOnly = true;
    else if (["--help", "-h"].includes(argument)) {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-hiesh-sequence-recovery-metadata-only.mjs [options]",
        "", "Options:", "  --source-only", "  --source-dir <new-or-valid-dir>",
        "  --evidence-file <payload-free-terminal-json>", "  --output-dir <new-dir>",
        "", "Acquires only fixed-revision records, complete trees, support bytes,",
        "selected-object HEAD identities, and payload-free terminal evidence.",
        "It never downloads a whole HDF5 object or republishes exploratory ranges.",
      ].join("\n") + "\n"); process.exit(0);
    } else fail("ARGUMENT_INVALID", argument);
  }
  return result;
}
function safeSource(value) {
  const target = path.resolve(value);
  if ([path.parse(target).root, "/private/tmp", workspace].includes(target)) {
    fail("SOURCE_TOO_BROAD", target);
  }
  return target;
}
function safeOutput(value) {
  const target = path.resolve(value); const relation = path.relative(workspace, target);
  if (!relation || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  return target;
}
function mkdirPrivate(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}
function ensureParents(file, stop) {
  const missing = []; let cursor = path.dirname(file);
  while (cursor !== stop && !existsSync(cursor)) { missing.push(cursor); cursor = path.dirname(cursor); }
  for (const directory of missing.reverse()) mkdirPrivate(directory);
}
function writePrivate(file, bytes, root) {
  ensureParents(file, root); writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}
function writeOrMatch(file, bytes, root) {
  ensureParents(file, root);
  if (existsSync(file)) {
    const status = lstatSync(file);
    if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600
      || !readFileSync(file).equals(bytes)) fail("CHECKPOINT_CHANGED", file);
  } else writePrivate(file, bytes, root);
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
      if (attempt + 1 < ATTEMPTS) await delay(250 * (2 ** attempt));
    }
  }
  fail(code, last?.message ?? String(last));
}
async function readBounded(response, maximumBytes) {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > maximumBytes) fail("BODY_TOO_LARGE");
  const chunks = []; let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length; if (total > maximumBytes) fail("BODY_TOO_LARGE");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, total);
}
async function fetchBody(url, maximumBytes) {
  return retry(async () => {
    const response = await fetch(url, { headers: { accept: "application/json,text/plain,*/*",
      "accept-encoding": "identity", "user-agent": "outsider-hiesh-terminal-source/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
      fail("HTTP", `${response.status}:${url}`);
    }
    return readBounded(response, maximumBytes);
  }, "FETCH_FAILED");
}
async function fetchSelectedHead(specification) {
  return retry(async () => {
    const url = `${ORIGIN}/datasets/${specification.datasetId}/resolve/`
      + `${specification.revision}/${specification.selected.path}?download=true`;
    const response = await fetch(url, { method: "HEAD", redirect: "manual", headers: {
      accept: "application/octet-stream", "accept-encoding": "identity",
      "user-agent": "outsider-hiesh-terminal-source/1.0",
    }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (![200, 302, 307].includes(response.status)) fail("HEAD_HTTP", response.status);
    return { datasetId: specification.datasetId, revision: specification.revision,
      path: specification.selected.path, status: response.status,
      xRepoCommit: response.headers.get("x-repo-commit"),
      xLinkedSize: response.headers.get("x-linked-size"),
      xLinkedEtag: response.headers.get("x-linked-etag"),
      xXetHash: response.headers.get("x-xet-hash"),
      locationPersisted: false };
  }, "HEAD_FAILED");
}
function apiUrls(specification) {
  const base = `${ORIGIN}/api/datasets/${specification.datasetId}`;
  return { record: `${base}/revision/${specification.revision}`,
    tree: `${base}/tree/${specification.revision}?recursive=true` };
}
function fileUrl(specification, relative) {
  return `${ORIGIN}/datasets/${specification.datasetId}/resolve/`
    + `${specification.revision}/${relative}?download=true`;
}

async function acquireSource(sourceRoot, evidenceFile) {
  if (existsSync(path.join(sourceRoot, "source-manifest.json"))) {
    const checked = verifyHieshSequenceRecoverySourceDirectory(sourceRoot);
    if (!checked.ok) fail("EXISTING_SOURCE_INVALID", checked.error);
    return checked;
  }
  mkdirPrivate(sourceRoot);
  const evidenceStatus = lstatSync(evidenceFile);
  if (!evidenceStatus.isFile() || evidenceStatus.isSymbolicLink()
    || (evidenceStatus.mode & 0o777) !== 0o600 || evidenceStatus.size > 24 * 1024 * 1024) {
    fail("TERMINAL_EVIDENCE_INVALID");
  }
  const evidence = readFileSync(evidenceFile);
  for (const specification of HIESH_SEQUENCE_RECOVERY_REPOSITORIES) {
    const urls = apiUrls(specification); const key = specification.key;
    const beforeRecord = await fetchBody(urls.record, MAX_API_BYTES);
    const beforeTree = await fetchBody(urls.tree, MAX_API_BYTES);
    writeOrMatch(path.join(sourceRoot, `metadata/${key}-record-before.json`), beforeRecord, sourceRoot);
    writeOrMatch(path.join(sourceRoot, `metadata/${key}-tree-before.json`), beforeTree, sourceRoot);
    const readme = await fetchBody(fileUrl(specification, "README.md"), MAX_SMALL_BYTES);
    const attributes = await fetchBody(fileUrl(specification, ".gitattributes"), MAX_SMALL_BYTES);
    if (readme.length !== specification.readmeBytes
      || hieshSequenceRecoverySha256(readme) !== specification.readmeSha256) {
      fail("README_PIN", key);
    }
    writeOrMatch(path.join(sourceRoot, `files/${key}/README.md`), readme, sourceRoot);
    writeOrMatch(path.join(sourceRoot, `files/${key}/.gitattributes`), attributes, sourceRoot);
    const head = await fetchSelectedHead(specification);
    writeOrMatch(path.join(sourceRoot, `metadata/${key}-selected-h5-head.json`),
      serializeHieshSequenceRecoveryArtifact(head), sourceRoot);
    const afterRecord = await fetchBody(urls.record, MAX_API_BYTES);
    const afterTree = await fetchBody(urls.tree, MAX_API_BYTES);
    writeOrMatch(path.join(sourceRoot, `metadata/${key}-record-after.json`), afterRecord, sourceRoot);
    writeOrMatch(path.join(sourceRoot, `metadata/${key}-tree-after.json`), afterTree, sourceRoot);
    process.stderr.write(`${key} fixed-revision bracket acquired\n`);
  }
  writeOrMatch(path.join(sourceRoot, "terminal-evidence.json"), evidence, sourceRoot);
  const manifest = createHieshSequenceRecoverySourceManifestFromDirectory(sourceRoot);
  writePrivate(path.join(sourceRoot, "source-manifest.json"),
    serializeHieshSequenceRecoveryArtifact(manifest), sourceRoot);
  const checked = verifyHieshSequenceRecoverySourceDirectory(sourceRoot);
  if (!checked.ok) fail("SOURCE_VERIFY", checked.error);
  return checked;
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
function buildArtifact(sourceRoot, outputRoot) {
  if (existsSync(outputRoot)) fail("OUTPUT_EXISTS", outputRoot);
  mkdirPrivate(path.dirname(outputRoot));
  const stage = `${outputRoot}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  mkdirPrivate(stage);
  try {
    copyPrivateTree(sourceRoot, path.join(stage, "source"));
    const report = buildHieshSequenceRecoveryReportFromSource(path.join(stage, "source"));
    writePrivate(path.join(stage, "report.json"),
      serializeHieshSequenceRecoveryArtifact(report), stage);
    const receipt = createHieshSequenceRecoveryReceipt(report);
    writePrivate(path.join(stage, "receipt.json"),
      serializeHieshSequenceRecoveryArtifact(receipt), stage);
    const checked = verifyHieshSequenceRecoveryArtifactDirectory(stage);
    if (!checked.ok) fail("ARTIFACT_VERIFY", checked.error);
    renameSync(stage, outputRoot);
    return verifyHieshSequenceRecoveryArtifactDirectory(outputRoot);
  } catch (error) {
    process.stderr.write(`Incomplete staging directory retained: ${stage}\n`); throw error;
  }
}

async function main() {
  const arguments_ = parseArgs(process.argv.slice(2));
  const sourceRoot = safeSource(arguments_.sourceDir);
  const evidenceFile = path.resolve(arguments_.evidenceFile);
  if ([path.parse(evidenceFile).root, "/private/tmp", workspace].includes(evidenceFile)) {
    fail("EVIDENCE_TOO_BROAD");
  }
  const source = await acquireSource(sourceRoot, evidenceFile);
  process.stdout.write(`sourceManifestHash=${source.manifest.manifestHash}\n`);
  process.stdout.write(`sourceRoot=${source.manifest.sourceRoot}\n`);
  if (arguments_.sourceOnly) return;
  const artifact = buildArtifact(sourceRoot, safeOutput(arguments_.outputDir));
  if (!artifact.ok) fail("FINAL_VERIFY", artifact.error);
  process.stdout.write(`reportHash=${artifact.report.artifactHash}\n`);
  process.stdout.write(`receiptHash=${artifact.receipt.receiptHash}\n`);
}

main().catch((error) => { process.stderr.write(`${error?.stack ?? error}\n`); process.exitCode = 1; });
