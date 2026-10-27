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
  AGENT_LAUNCH_PAD_DATASET_ID,
  AGENT_LAUNCH_PAD_REVISION,
  agentLaunchPadPayloadSpecifications,
  agentLaunchPadSha256,
  buildAgentLaunchPadReportFromSource,
  createAgentLaunchPadReceipt,
  createAgentLaunchPadSourceManifestFromDirectory,
  inspectAgentLaunchPadMetadata,
  serializeAgentLaunchPadArtifact,
  verifyAgentLaunchPadArtifactDirectory,
  verifyAgentLaunchPadSourceDirectory,
} from "../src/outsider-agent-launch-pad-full-repo.js";

const ORIGIN = "https://huggingface.co";
const API_BASE = `${ORIGIN}/api/datasets/${AGENT_LAUNCH_PAD_DATASET_ID}`;
const RECORD_URL = `${API_BASE}/revision/${AGENT_LAUNCH_PAD_REVISION}`;
const TREE_URL = `${API_BASE}/tree/${AGENT_LAUNCH_PAD_REVISION}?recursive=true&expand=true`;
const RESOLVE_BASE = `${ORIGIN}/datasets/${AGENT_LAUNCH_PAD_DATASET_ID}/resolve/${AGENT_LAUNCH_PAD_REVISION}`;
const FETCH_ATTEMPTS = 4;
const FETCH_TIMEOUT_MS = 900_000;
const MAX_API_BYTES = 2 * 1024 * 1024;
const MAX_OBJECT_BYTES = 90 * 1024 * 1024;
const DOWNLOAD_WORKERS = 3;
const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "..");
const DEFAULT_OUTPUT = path.join(workspace, "artifacts",
  "outsider-agent-launch-pad-full-repo-20260829-v1");
const DEFAULT_SOURCE = path.join(tmpdir(), "outsider-agent-launch-pad-full-repo-source-20260829-v1");

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENT_LAUNCH_PAD_ACQUIRE_${code}`
    : `AGENT_LAUNCH_PAD_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-agent-launch-pad-full-repo.mjs --source-only",
        "  node scripts/acquire-agent-launch-pad-full-repo.mjs [--output-dir <new-dir>]",
        "", `Pins ${AGENT_LAUNCH_PAD_DATASET_ID}@${AGENT_LAUNCH_PAD_REVISION}.`,
        "Acquires all six fixed-revision files and replays both conflicting corpus versions.",
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
    || !decodeURIComponent(url.pathname).includes(AGENT_LAUNCH_PAD_REVISION)) {
    fail("API_URL_INVALID", value);
  }
  return url;
}

async function fetchApi(value) {
  return retry(async () => {
    const url = validateApiUrl(value);
    const response = await fetch(url, { redirect: "error", headers: {
      accept: "application/json", "accept-encoding": "identity",
      "user-agent": "outsider-agent-launch-pad-source/1.0",
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

async function fetchObject(specification) {
  const encoded = specification.path.split("/").map(encodeURIComponent).join("/");
  const initial = new URL(`${RESOLVE_BASE}/${encoded}?download=true`);
  return retry(async () => {
    let url = initial; let initialStatus = null; let initialHeaders = null;
    for (let redirects = 0; redirects < 8; redirects += 1) {
      if (url.protocol !== "https:" || url.username || url.password
        || !allowedDownloadHost(url.hostname)) fail("OBJECT_URL_INVALID", url.hostname);
      const response = await fetch(url, { redirect: "manual", headers: {
        accept: "application/octet-stream", "accept-encoding": "identity",
        "user-agent": "outsider-agent-launch-pad-source/1.0",
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
        if (response.body) await response.body.cancel();
        url = new URL(location, url); continue;
      }
      if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
        fail("OBJECT_HTTP", `${response.status}:${specification.path}`);
      }
      const bytes = await readBounded(response, MAX_OBJECT_BYTES, specification.bytes);
      if (agentLaunchPadSha256(bytes) !== specification.sha256) {
        fail("OBJECT_DIGEST_INVALID", specification.path);
      }
      return { bytes, header: { path: specification.path, status: initialStatus,
        headers: initialHeaders } };
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

function headerRelative(specification) {
  return `metadata/object-response-headers/${specification.path}.headers.json`;
}

async function acquireSource(sourceRoot) {
  mkdirPrivate(sourceRoot);
  const manifestFile = path.join(sourceRoot, "source-manifest.json");
  if (existsSync(manifestFile)) {
    const checked = verifyAgentLaunchPadSourceDirectory(sourceRoot);
    if (!checked.ok) fail("EXISTING_SOURCE_INVALID", checked.error);
    return checked;
  }
  const beforeRecordFile = path.join(sourceRoot, "metadata/dataset-record-before.json");
  const beforeTreeFile = path.join(sourceRoot, "metadata/full-tree-before.json");
  let beforeRecord; let beforeTree;
  if (existsSync(beforeRecordFile) && existsSync(beforeTreeFile)) {
    beforeRecord = readFileSync(beforeRecordFile); beforeTree = readFileSync(beforeTreeFile);
    inspectAgentLaunchPadMetadata(beforeRecord, beforeTree);
    process.stderr.write("Before bracket reused\n");
  } else if (existsSync(beforeRecordFile) || existsSync(beforeTreeFile)) {
    fail("BEFORE_BRACKET_PARTIAL");
  } else {
    beforeRecord = await fetchApi(RECORD_URL); beforeTree = await fetchApi(TREE_URL);
    inspectAgentLaunchPadMetadata(beforeRecord, beforeTree);
    writeOrMatch(beforeRecordFile, beforeRecord, sourceRoot);
    writeOrMatch(beforeTreeFile, beforeTree, sourceRoot);
    process.stderr.write("Before bracket checkpointed\n");
  }
  const specifications = agentLaunchPadPayloadSpecifications();
  await workerPool(specifications, async (specification) => {
    const destination = path.join(sourceRoot, "files", specification.path);
    const headerFile = path.join(sourceRoot, headerRelative(specification));
    const payloadExists = existsSync(destination); const headerExists = existsSync(headerFile);
    if (payloadExists && headerExists) {
      const bytes = readFileSync(destination);
      if (bytes.length !== specification.bytes
        || agentLaunchPadSha256(bytes) !== specification.sha256) {
        fail("CHECKPOINT_OBJECT_INVALID", specification.path);
      }
      return;
    }
    const fetched = await fetchObject(specification);
    writeOrMatch(destination, fetched.bytes, sourceRoot);
    writeOrMatch(headerFile, serializeAgentLaunchPadArtifact(fetched.header), sourceRoot);
  });
  const afterRecordFile = path.join(sourceRoot, "metadata/dataset-record-after.json");
  const afterTreeFile = path.join(sourceRoot, "metadata/full-tree-after.json");
  let afterRecord; let afterTree;
  if (existsSync(afterRecordFile) && existsSync(afterTreeFile)) {
    afterRecord = readFileSync(afterRecordFile); afterTree = readFileSync(afterTreeFile);
    process.stderr.write("After bracket reused\n");
  } else if (existsSync(afterRecordFile) || existsSync(afterTreeFile)) {
    fail("AFTER_BRACKET_PARTIAL");
  } else {
    afterRecord = await fetchApi(RECORD_URL); afterTree = await fetchApi(TREE_URL);
    inspectAgentLaunchPadMetadata(afterRecord, afterTree);
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
  const manifest = createAgentLaunchPadSourceManifestFromDirectory(sourceRoot);
  writeOrMatch(manifestFile, serializeAgentLaunchPadArtifact(manifest), sourceRoot);
  const checked = verifyAgentLaunchPadSourceDirectory(sourceRoot);
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
  const report = buildAgentLaunchPadReportFromSource(sourceRoot);
  const receipt = createAgentLaunchPadReceipt(report);
  const staging = path.join(path.dirname(output),
    `.${path.basename(output)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirPrivate(path.dirname(output)); mkdirPrivate(staging);
  copyPrivateTree(sourceRoot, path.join(staging, "source"));
  writePrivate(path.join(staging, "report.json"), serializeAgentLaunchPadArtifact(report));
  writePrivate(path.join(staging, "run-receipt.json"),
    serializeAgentLaunchPadArtifact(receipt));
  renameSync(staging, output);
  const checked = verifyAgentLaunchPadArtifactDirectory(output);
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
  const output = safeOutput(args.outputDir);
  const checked = publishArtifact(output, sourceRoot);
  process.stdout.write(`${JSON.stringify({ ok: true, output,
    artifactHash: checked.report.artifactHash,
    receiptHash: checked.receipt.receiptHash,
    verificationLevel: checked.verificationLevel })}\n`);
}
