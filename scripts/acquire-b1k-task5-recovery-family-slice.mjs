#!/usr/bin/env node

import {
  chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync,
  readdirSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  B1K_RECOVERY_DATASET_ID,
  B1K_RECOVERY_REVISION,
  b1kRecoveryPayloadSpecifications,
  b1kRecoverySha256,
  buildB1kRecoveryArtifactFromSourceDirectory,
  createB1kRecoveryReceipt,
  createB1kRecoverySourceManifestFromDirectory,
  serializeB1kRecoveryArtifact,
  verifyB1kRecoveryArtifactDirectory,
  verifyB1kRecoverySourceDirectory,
} from "../src/outsider-b1k-task5-recovery-family-slice.js";

const ORIGIN = "https://huggingface.co";
const API_BASE = `${ORIGIN}/api/datasets/${B1K_RECOVERY_DATASET_ID}`;
const RESOLVE_BASE = `${ORIGIN}/datasets/${B1K_RECOVERY_DATASET_ID}/resolve/${B1K_RECOVERY_REVISION}`;
const RECORD_URL = `${API_BASE}/revision/${B1K_RECOVERY_REVISION}`;
const FETCH_ATTEMPTS = 4;
const FETCH_TIMEOUT_MS = 180_000;
const MAX_API_BYTES = 12 * 1024 * 1024;
const MAX_TREE_PAGE_BYTES = 512 * 1024;
const MAX_OBJECT_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_WORKERS = 4;
const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, "..");
const DEFAULT_OUTPUT = path.join(workspace, "artifacts",
  "outsider-b1k-task5-recovery-family-slice-20260829-v1");

function fail(code, detail = null) {
  throw new Error(detail === null ? `B1K_RECOVERY_ACQUIRE_${code}`
    : `B1K_RECOVERY_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, sourceCandidate: null, sourceOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) result.outputDir = argv[++index];
    else if (argument === "--source-candidate" && argv[index + 1]) {
      result.sourceCandidate = argv[++index];
    } else if (argument === "--source-only") result.sourceOnly = true;
    else if (["--help", "-h"].includes(argument)) {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-b1k-task5-recovery-family-slice.mjs --source-candidate <dir> --source-only",
        "  node scripts/acquire-b1k-task5-recovery-family-slice.mjs --source-candidate <dir> [--output-dir <new-dir>]",
        "",
        `Pins ${B1K_RECOVERY_DATASET_ID}@${B1K_RECOVERY_REVISION}.`,
        "Acquires the full task5 metadata closure and one complete episode per source family.",
        "Also brackets the 24-page task5 tree and retains task31 terminal metadata only.",
      ].join("\n") + "\n");
      process.exit(0);
    } else fail("ARGUMENT_INVALID", argument);
  }
  if (result.sourceCandidate === null) {
    result.sourceCandidate = path.join("/private/tmp",
      "outsider-b1k-task5-recovery-family-source-20260829-v1");
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

function writeOrMatch(file, bytes, sourceRoot) {
  ensurePrivateParents(file, sourceRoot);
  if (existsSync(file)) {
    const status = lstatSync(file);
    if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600
      || !readFileSync(file).equals(bytes)) fail("CHECKPOINT_CHANGED", file);
  } else writePrivate(file, bytes);
}

function safeOutput(value) {
  const target = path.resolve(value);
  const relation = path.relative(workspace, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation) || target === path.parse(target).root) {
    fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  }
  return target;
}

function safeSourceCandidate(value) {
  const target = path.resolve(value);
  if ([path.parse(target).root, "/private/tmp", workspace].includes(target)) {
    fail("SOURCE_CANDIDATE_TOO_BROAD", target);
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
      if (attempt < FETCH_ATTEMPTS - 1) {
        await delay(Math.min(10_000, 500 * (2 ** attempt)));
      }
    }
  }
  fail(code, lastError instanceof Error ? lastError.message : String(lastError));
}

async function readBounded(response, maximumBytes, exactBytes = null) {
  if (!response.body || response.headers.get("content-encoding") !== null) {
    fail("FETCH_BODY_INVALID");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared)
    || Number(declared) > maximumBytes
    || exactBytes !== null && Number(declared) !== exactBytes)) {
    fail("CONTENT_LENGTH_INVALID", declared);
  }
  const chunks = []; let total = 0;
  const reader = response.body.getReader();
  for (;;) {
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

function validateApiUrl(value) {
  const url = new URL(value);
  if (url.origin !== ORIGIN || url.username || url.password
    || !decodeURIComponent(url.pathname).includes(B1K_RECOVERY_REVISION)) {
    fail("API_URL_INVALID", value);
  }
  return url;
}

async function fetchApi(value, maximumBytes = MAX_API_BYTES) {
  return retry(async () => {
    const url = validateApiUrl(value);
    const response = await fetch(url, { redirect: "error", headers: {
      accept: "application/json", "accept-encoding": "identity",
      "user-agent": "outsider-b1k-recovery-source/1.0",
    }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
      fail("API_HTTP", String(response.status));
    }
    const bytes = await readBounded(response, maximumBytes);
    const declared = response.headers.get("content-length");
    const headers = {
      requestUrl: url.href, status: response.status,
      etag: response.headers.get("etag"),
      contentLength: declared === null ? bytes.length : Number(declared),
      nextUrl: (() => {
        const link = response.headers.get("link");
        if (link === null) return null;
        const match = /^<([^>]+)>; rel="next"$/u.exec(link);
        if (!match) fail("API_LINK_INVALID", link);
        return validateApiUrl(match[1]).href;
      })(),
    };
    if (typeof headers.etag !== "string" || headers.contentLength !== bytes.length) {
      fail("API_HEADERS_INVALID");
    }
    return { bytes, headers };
  }, "API_DOWNLOAD_FAILED");
}

function treeUrl(repositoryPath, recursive, limit = null) {
  const encoded = repositoryPath === "" ? ""
    : `/${encodeURIComponent(repositoryPath)}`;
  const url = new URL(`${API_BASE}/tree/${B1K_RECOVERY_REVISION}${encoded}`);
  url.searchParams.set("expand", "false");
  url.searchParams.set("recursive", recursive ? "true" : "false");
  if (limit !== null) url.searchParams.set("limit", String(limit));
  return url.href;
}

function allowedDownloadHost(hostname) {
  return hostname === "huggingface.co" || hostname.endsWith(".huggingface.co")
    || hostname === "hf.co" || hostname.endsWith(".hf.co")
    || hostname === "xethub.hf.co" || hostname.endsWith(".xethub.hf.co")
    || hostname.endsWith(".hf.co") || hostname.endsWith(".cloudfront.net")
    || hostname.endsWith(".amazonaws.com");
}

async function fetchObject(specification) {
  const encoded = specification.path.split("/").map(encodeURIComponent).join("/");
  const initial = new URL(`${RESOLVE_BASE}/${encoded}?download=true`);
  return retry(async () => {
    let url = initial; let initialHeaders = null; let initialStatus = null;
    for (let redirects = 0; redirects < 8; redirects += 1) {
      if (url.protocol !== "https:" || url.username || url.password
        || !allowedDownloadHost(url.hostname)) fail("OBJECT_URL_INVALID", url.hostname);
      const response = await fetch(url, { redirect: "manual", headers: {
        accept: "application/octet-stream", "accept-encoding": "identity",
        "user-agent": "outsider-b1k-recovery-source/1.0",
      }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (initialHeaders === null) {
        initialStatus = response.status;
        initialHeaders = {
          xRepoCommit: response.headers.get("x-repo-commit"),
          xLinkedSize: response.headers.get("x-linked-size"),
          xLinkedEtag: response.headers.get("x-linked-etag"),
          xXetHash: response.headers.get("x-xet-hash"),
        };
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
      if (b1kRecoverySha256(bytes) !== specification.sha256) {
        fail("OBJECT_DIGEST_INVALID", specification.path);
      }
      return { bytes, header: { path: specification.path, status: initialStatus,
        headers: initialHeaders } };
    }
    fail("OBJECT_REDIRECT_LIMIT", specification.path);
  }, "OBJECT_DOWNLOAD_FAILED");
}

async function acquireInventory(sourceRoot, bracket) {
  let url = treeUrl("task5/Demo+Recovery+Success", true, 1000);
  for (let index = 0; index < 24; index += 1) {
    const name = `page-${String(index).padStart(3, "0")}`;
    const pageFile = path.join(sourceRoot, "metadata", `task5-full-tree-${bracket}`,
      `${name}.json`);
    const headerFile = path.join(sourceRoot, "metadata", `task5-full-tree-${bracket}`,
      `${name}.headers.json`);
    const pageExists = existsSync(pageFile); const headerExists = existsSync(headerFile);
    if (pageExists !== headerExists) fail("INVENTORY_PARTIAL_CHECKPOINT", `${bracket}:${index}`);
    let result;
    if (pageExists) {
      const bytes = readFileSync(pageFile);
      const headers = JSON.parse(readFileSync(headerFile, "utf8"));
      if (headers.requestUrl !== url || headers.contentLength !== bytes.length
        || headers.status !== 200) fail("INVENTORY_CHECKPOINT_INVALID", `${bracket}:${index}`);
      result = { bytes, headers };
      process.stderr.write(`Tree ${bracket} reused ${index + 1}/24\n`);
    } else {
      result = await fetchApi(url, MAX_TREE_PAGE_BYTES);
      writeOrMatch(pageFile, result.bytes, sourceRoot);
      writeOrMatch(headerFile, serializeB1kRecoveryArtifact(result.headers), sourceRoot);
      process.stderr.write(`Tree ${bracket} checkpoint ${index + 1}/24\n`);
    }
    if (index < 23 && result.headers.nextUrl === null
      || index === 23 && result.headers.nextUrl !== null) {
      fail("INVENTORY_PAGE_COUNT_INVALID", `${bracket}:${index}`);
    }
    url = result.headers.nextUrl;
  }
}

async function workerPool(items, worker) {
  let cursor = 0; let completed = 0;
  async function run() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item); completed += 1;
      process.stderr.write(`Payload checkpoint ${completed}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_WORKERS, items.length) }, run));
}

async function acquireSource(sourceRoot) {
  mkdirPrivate(sourceRoot);
  const manifestFile = path.join(sourceRoot, "source-manifest.json");
  if (existsSync(manifestFile)) {
    const verified = verifyB1kRecoverySourceDirectory(sourceRoot);
    if (!verified.ok) fail("EXISTING_SOURCE_INVALID", verified.error);
    return verified;
  }
  const recordBeforeFile = path.join(sourceRoot, "metadata/dataset-record-before.json");
  if (!existsSync(recordBeforeFile)) {
    const recordBefore = await fetchApi(RECORD_URL);
    if (recordBefore.headers.nextUrl !== null) fail("RECORD_LINK_UNEXPECTED");
    writeOrMatch(recordBeforeFile, recordBefore.bytes, sourceRoot);
  } else process.stderr.write("Record before reused\n");
  const supports = [
    ["metadata/root-tree.json", treeUrl("", false)],
    ["metadata/task5-tree.json", treeUrl("task5", false)],
    ["metadata/task5-group-tree.json", treeUrl("task5/Demo+Recovery+Success", false)],
    ["metadata/task5-meta-tree.json", treeUrl("task5/Demo+Recovery+Success/meta", true)],
    ["metadata/task31-tree.json", treeUrl("task31", false)],
    ["metadata/task31-segmented-meta-tree.json",
      treeUrl("task31/b1k_task31_human+segmented_success/meta", true)],
    ["metadata/task31-success-meta-tree.json",
      treeUrl("task31/b1k_task31_human+success/meta", true)],
  ];
  for (const [relative, url] of supports) {
    const target = path.join(sourceRoot, relative);
    if (existsSync(target)) {
      process.stderr.write(`Support reused ${relative}\n`); continue;
    }
    const fetched = await fetchApi(url);
    if (fetched.headers.nextUrl !== null) fail("SUPPORT_TREE_PAGINATION", relative);
    writeOrMatch(target, fetched.bytes, sourceRoot);
  }
  await acquireInventory(sourceRoot, "before");
  const specifications = b1kRecoveryPayloadSpecifications();
  const objectHeadersFile = path.join(sourceRoot, "metadata/object-response-headers.json");
  if (existsSync(objectHeadersFile)
    && specifications.every((item) => existsSync(path.join(sourceRoot, "files", item.path)))) {
    process.stderr.write(`Payload checkpoint reused ${specifications.length}/${specifications.length}\n`);
  } else {
    const headers = new Array(specifications.length);
    await workerPool(specifications.map((specification, index) => ({ specification, index })),
      async ({ specification, index }) => {
        const fetched = await fetchObject(specification);
        writeOrMatch(path.join(sourceRoot, "files", specification.path),
          fetched.bytes, sourceRoot);
        headers[index] = fetched.header;
      });
    writeOrMatch(objectHeadersFile, serializeB1kRecoveryArtifact(headers), sourceRoot);
  }
  const recordAfterFile = path.join(sourceRoot, "metadata/dataset-record-after.json");
  if (!existsSync(recordAfterFile)) {
    const recordAfter = await fetchApi(RECORD_URL);
    writeOrMatch(recordAfterFile, recordAfter.bytes, sourceRoot);
  } else process.stderr.write("Record after reused\n");
  await acquireInventory(sourceRoot, "after");
  const manifest = createB1kRecoverySourceManifestFromDirectory(sourceRoot);
  writeOrMatch(manifestFile, serializeB1kRecoveryArtifact(manifest), sourceRoot);
  const verified = verifyB1kRecoverySourceDirectory(sourceRoot);
  if (!verified.ok) fail("SOURCE_INVALID", verified.error);
  return verified;
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
    copyFileSync(source, target, constants.COPYFILE_EXCL);
    chmodSync(target, 0o600);
  } else fail("COPY_SOURCE_TYPE", source);
}

function writeArtifact(output, sourceCandidate) {
  if (existsSync(output)) fail("OUTPUT_EXISTS", output);
  const built = buildB1kRecoveryArtifactFromSourceDirectory(sourceCandidate);
  const receipt = createB1kRecoveryReceipt(built.report);
  mkdirPrivate(path.dirname(output));
  mkdirSync(output, { mode: 0o700 }); chmodSync(output, 0o700);
  copyPrivateTree(sourceCandidate, path.join(output, "source"));
  writePrivate(path.join(output, "report.json"), serializeB1kRecoveryArtifact(built.report));
  writePrivate(path.join(output, "run-receipt.json"),
    serializeB1kRecoveryArtifact(receipt));
  const verified = verifyB1kRecoveryArtifactDirectory(output);
  if (!verified.ok) fail("ARTIFACT_INVALID", verified.error);
  return verified;
}

const args = parseArgs(process.argv.slice(2));
const sourceCandidate = safeSourceCandidate(args.sourceCandidate);
const source = await acquireSource(sourceCandidate);
if (args.sourceOnly) {
  process.stdout.write(`${JSON.stringify({ ok: true, sourceCandidate,
    sourceManifestHash: source.sourceManifest.manifestHash })}\n`);
} else {
  const output = safeOutput(args.outputDir);
  const verified = writeArtifact(output, sourceCandidate);
  process.stdout.write(`${JSON.stringify({ ok: true, output,
    artifactHash: verified.report.artifactHash,
    receiptHash: verified.receipt.receiptHash })}\n`);
}
