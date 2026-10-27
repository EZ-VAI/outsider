#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  readFileSync, readdirSync, renameSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  DELTA_CORN_REPOSITORIES,
  buildDeltaCornReportFromSource,
  createDeltaCornReceipt,
  createDeltaCornSourceManifestFromDirectory,
  deltaCornSelectedSpecifications,
  deltaCornSha256,
  inspectDeltaCornRepositoryMetadata,
  serializeDeltaCornArtifact,
  verifyDeltaCornArtifactDirectory,
  verifyDeltaCornSourceDirectory,
} from "../src/outsider-delta-corn-failure-recovery-linked-family.js";

const ORIGIN = "https://huggingface.co";
const FETCH_ATTEMPTS = 4;
const FETCH_TIMEOUT_MS = 900_000;
const MAX_API_BYTES = 2 * 1024 * 1024;
const MAX_OBJECT_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_WORKERS = 4;
const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "..");
const DEFAULT_OUTPUT = path.join(workspace, "artifacts",
  "outsider-delta-corn-failure-recovery-linked-family-20260830-v1");
const DEFAULT_SOURCE =
  path.join(tmpdir(), "outsider-delta-corn-failure-recovery-linked-family-source-20260830-v1");

function fail(code, detail = null) {
  throw new Error(detail === null ? `DELTA_CORN_ACQUIRE_${code}`
    : `DELTA_CORN_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-delta-corn-failure-recovery-linked-family.mjs --source-only",
        "  node scripts/acquire-delta-corn-failure-recovery-linked-family.mjs [--output-dir <new-dir>]",
        "", "Pins three publisher repositories for the same Delta corn task.",
        "Acquires every no-video file plus all ten cam_high episodes per repository.",
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
  const missing = []; let cursor = path.dirname(file);
  while (cursor !== stop && !existsSync(cursor)) { missing.push(cursor); cursor = path.dirname(cursor); }
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
  if (!response.body || response.headers.get("content-encoding") !== null) fail("FETCH_BODY_INVALID");
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
      await reader.cancel("bounded source limit"); fail("FETCH_BODY_TOO_LARGE", String(total));
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1 || exactBytes !== null && total !== exactBytes) {
    fail("FETCH_BODY_SIZE_INVALID", String(total));
  }
  return Buffer.concat(chunks, total);
}
function endpoints(repo) {
  const api = `${ORIGIN}/api/datasets/${repo.datasetId}`;
  return { record: `${api}/revision/${repo.revision}`,
    tree: `${api}/tree/${repo.revision}?recursive=true&expand=true&limit=100`,
    resolve: `${ORIGIN}/datasets/${repo.datasetId}/resolve/${repo.revision}` };
}
function validateApiUrl(value, repo) {
  const url = new URL(value);
  if (url.origin !== ORIGIN || url.username || url.password
    || !decodeURIComponent(url.pathname).includes(repo.revision)) fail("API_URL_INVALID", value);
  return url;
}
async function fetchApi(value, repo) {
  return retry(async () => {
    const url = validateApiUrl(value, repo);
    const response = await fetch(url, { redirect: "error", headers: {
      accept: "application/json", "accept-encoding": "identity",
      "user-agent": "outsider-delta-corn-source/1.0",
    }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.status !== 200 || response.headers.get("content-encoding") !== null
      || response.headers.get("link") !== null) fail("API_HTTP_OR_PAGINATION", String(response.status));
    return readBounded(response, MAX_API_BYTES);
  }, "API_DOWNLOAD_FAILED");
}
function allowedDownloadHost(hostname) {
  return hostname === "huggingface.co" || hostname.endsWith(".huggingface.co")
    || hostname === "hf.co" || hostname.endsWith(".hf.co")
    || hostname === "xethub.hf.co" || hostname.endsWith(".xethub.hf.co")
    || hostname.endsWith(".cloudfront.net") || hostname.endsWith(".amazonaws.com");
}
async function fetchObject(repo, specification) {
  const encoded = specification.path.split("/").map(encodeURIComponent).join("/");
  const initial = new URL(`${endpoints(repo).resolve}/${encoded}?download=true`);
  return retry(async () => {
    let url = initial; let initialStatus = null; let initialHeaders = null;
    for (let redirects = 0; redirects < 8; redirects += 1) {
      if (url.protocol !== "https:" || url.username || url.password
        || !allowedDownloadHost(url.hostname)) fail("OBJECT_URL_INVALID", url.hostname);
      const response = await fetch(url, { redirect: "manual", headers: {
        accept: "application/octet-stream", "accept-encoding": "identity",
        "user-agent": "outsider-delta-corn-source/1.0",
      }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (initialHeaders === null) {
        initialStatus = response.status;
        initialHeaders = { xRepoCommit: response.headers.get("x-repo-commit"),
          xLinkedSize: response.headers.get("x-linked-size"),
          xLinkedEtag: response.headers.get("x-linked-etag"),
          xXetHash: response.headers.get("x-xet-hash") };
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) fail("OBJECT_REDIRECT_MISSING", specification.path);
        if (response.body) await response.body.cancel(); url = new URL(location, url); continue;
      }
      if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
        fail("OBJECT_HTTP", `${response.status}:${specification.path}`);
      }
      const bytes = await readBounded(response, MAX_OBJECT_BYTES, specification.bytes);
      if (specification.sha256 !== null && deltaCornSha256(bytes) !== specification.sha256) {
        fail("OBJECT_DIGEST_INVALID", `${repo.key}:${specification.path}`);
      }
      return { bytes, header: { repositoryKey: repo.key, path: specification.path,
        status: initialStatus, headers: initialHeaders } };
    }
    fail("OBJECT_REDIRECT_LIMIT", specification.path);
  }, "OBJECT_DOWNLOAD_FAILED");
}
async function workerPool(items, worker) {
  let cursor = 0; let completed = 0;
  async function run() {
    while (cursor < items.length) {
      const item = items[cursor++]; await worker(item); completed += 1;
      process.stderr.write(`Payload checkpoint ${completed}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_WORKERS, items.length) }, run));
}
function repoRoot(sourceRoot, repo) { return path.join(sourceRoot, "repositories", repo.key); }
function headerRelative(specification) {
  return `metadata/object-response-headers/${specification.path}.headers.json`;
}
async function acquireSource(sourceRoot) {
  mkdirPrivate(sourceRoot);
  const manifestFile = path.join(sourceRoot, "source-manifest.json");
  if (existsSync(manifestFile)) {
    const checked = verifyDeltaCornSourceDirectory(sourceRoot);
    if (!checked.ok) fail("EXISTING_SOURCE_INVALID", checked.error);
    return checked;
  }
  mkdirPrivate(path.join(sourceRoot, "repositories"));
  const contexts = [];
  for (const repo of DELTA_CORN_REPOSITORIES) {
    const root = repoRoot(sourceRoot, repo); mkdirPrivate(root);
    const recordFile = path.join(root, "metadata/record-before.json");
    const treeFile = path.join(root, "metadata/tree-before.json");
    let record; let tree;
    if (existsSync(recordFile) && existsSync(treeFile)) {
      record = readFileSync(recordFile); tree = readFileSync(treeFile);
      inspectDeltaCornRepositoryMetadata(record, tree, repo.key);
      process.stderr.write(`Before bracket reused ${repo.key}\n`);
    } else if (existsSync(recordFile) || existsSync(treeFile)) {
      fail("BEFORE_BRACKET_PARTIAL", repo.key);
    } else {
      record = await fetchApi(endpoints(repo).record, repo);
      tree = await fetchApi(endpoints(repo).tree, repo);
      inspectDeltaCornRepositoryMetadata(record, tree, repo.key);
      writeOrMatch(recordFile, record, sourceRoot); writeOrMatch(treeFile, tree, sourceRoot);
      process.stderr.write(`Before bracket checkpointed ${repo.key}\n`);
    }
    contexts.push({ repo, root, record, tree,
      specifications: deltaCornSelectedSpecifications(tree, repo.key) });
  }
  const jobs = contexts.flatMap((context) => context.specifications.map((specification) =>
    ({ ...context, specification })));
  await workerPool(jobs, async ({ repo, root, specification }) => {
    const destination = path.join(root, "files", specification.path);
    const headerFile = path.join(root, headerRelative(specification));
    const payloadExists = existsSync(destination); const headerExists = existsSync(headerFile);
    if (payloadExists && headerExists) {
      const bytes = readFileSync(destination);
      if (bytes.length !== specification.bytes
        || specification.sha256 !== null && deltaCornSha256(bytes) !== specification.sha256) {
        fail("CHECKPOINT_OBJECT_INVALID", `${repo.key}:${specification.path}`);
      }
      return;
    }
    const fetched = await fetchObject(repo, specification);
    writeOrMatch(destination, fetched.bytes, sourceRoot);
    writeOrMatch(headerFile, serializeDeltaCornArtifact(fetched.header), sourceRoot);
  });
  for (const context of contexts) {
    const { repo, root, record, tree } = context;
    const recordFile = path.join(root, "metadata/record-after.json");
    const treeFile = path.join(root, "metadata/tree-after.json");
    let afterRecord; let afterTree;
    if (existsSync(recordFile) && existsSync(treeFile)) {
      afterRecord = readFileSync(recordFile); afterTree = readFileSync(treeFile);
      process.stderr.write(`After bracket reused ${repo.key}\n`);
    } else if (existsSync(recordFile) || existsSync(treeFile)) {
      fail("AFTER_BRACKET_PARTIAL", repo.key);
    } else {
      afterRecord = await fetchApi(endpoints(repo).record, repo);
      afterTree = await fetchApi(endpoints(repo).tree, repo);
      inspectDeltaCornRepositoryMetadata(afterRecord, afterTree, repo.key);
      if (!record.equals(afterRecord) || !tree.equals(afterTree)) {
        fail("FIXED_REVISION_BRACKET_CHANGED", repo.key);
      }
      writeOrMatch(recordFile, afterRecord, sourceRoot); writeOrMatch(treeFile, afterTree, sourceRoot);
      process.stderr.write(`After bracket checkpointed ${repo.key}\n`);
    }
    if (!record.equals(afterRecord) || !tree.equals(afterTree)) {
      fail("FIXED_REVISION_BRACKET_CHANGED", repo.key);
    }
  }
  const manifest = createDeltaCornSourceManifestFromDirectory(sourceRoot);
  writeOrMatch(manifestFile, serializeDeltaCornArtifact(manifest), sourceRoot);
  const checked = verifyDeltaCornSourceDirectory(sourceRoot);
  if (!checked.ok) fail("SOURCE_INVALID", checked.error);
  return checked;
}
function copyPrivateTree(source, target) {
  const status = lstatSync(source);
  if (status.isSymbolicLink()) fail("COPY_SOURCE_SYMLINK", source);
  if (status.isDirectory()) {
    mkdirSync(target, { mode: 0o700 }); chmodSync(target, 0o700);
    for (const name of readdirSync(source).sort()) {
      copyPrivateTree(path.join(source, name), path.join(target, name));
    }
  } else if (status.isFile()) {
    copyFileSync(source, target, constants.COPYFILE_EXCL); chmodSync(target, 0o600);
  } else fail("COPY_SOURCE_TYPE", source);
}
function publishArtifact(output, sourceRoot) {
  if (existsSync(output)) fail("OUTPUT_EXISTS", output);
  const report = buildDeltaCornReportFromSource(sourceRoot);
  const receipt = createDeltaCornReceipt(report);
  const staging = path.join(path.dirname(output),
    `.${path.basename(output)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirPrivate(path.dirname(output)); mkdirPrivate(staging);
  copyPrivateTree(sourceRoot, path.join(staging, "source"));
  writePrivate(path.join(staging, "report.json"), serializeDeltaCornArtifact(report));
  writePrivate(path.join(staging, "run-receipt.json"), serializeDeltaCornArtifact(receipt));
  renameSync(staging, output);
  const checked = verifyDeltaCornArtifactDirectory(output);
  if (!checked.ok) fail("ARTIFACT_INVALID", checked.error);
  return checked;
}

const args = parseArgs(process.argv.slice(2));
const sourceRoot = safeSource(args.sourceCandidate);
const source = await acquireSource(sourceRoot);
if (args.sourceOnly) {
  process.stdout.write(`${JSON.stringify({ ok: true, sourceRoot,
    sourceManifestHash: source.sourceManifest.manifestHash,
    sourceContentRoot: source.sourceManifest.sourceRoot })}\n`);
} else {
  const output = safeOutput(args.outputDir); const checked = publishArtifact(output, sourceRoot);
  process.stdout.write(`${JSON.stringify({ ok: true, output,
    artifactHash: checked.report.artifactHash, receiptHash: checked.receipt.receiptHash,
    verificationLevel: checked.verificationLevel })}\n`);
}
