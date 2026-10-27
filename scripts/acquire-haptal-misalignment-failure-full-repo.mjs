#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  HAPTAL_MISALIGNMENT_DATASET_ID,
  HAPTAL_MISALIGNMENT_DISPOSITION,
  HAPTAL_MISALIGNMENT_REVISION,
  buildHaptalMisalignmentReportFromSource,
  createHaptalMisalignmentReceipt,
  createHaptalMisalignmentSourceManifestFromDirectory,
  haptalMisalignmentSha256,
  inspectHaptalMisalignmentMetadata,
  serializeHaptalMisalignmentArtifact,
  verifyHaptalMisalignmentArtifactDirectory,
  verifyHaptalMisalignmentSourceDirectory,
} from "../src/outsider-haptal-misalignment-failure-full-repo.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-haptal-misalignment-failure-full-repo-20260829-v1";
const ORIGIN = "https://huggingface.co";
const ENCODED_DATASET = HAPTAL_MISALIGNMENT_DATASET_ID.split("/")
  .map(encodeURIComponent).join("/");
const RECORD_URL = `${ORIGIN}/api/datasets/${ENCODED_DATASET}/revision/${HAPTAL_MISALIGNMENT_REVISION}`;
const TREE_URL = `${ORIGIN}/api/datasets/${ENCODED_DATASET}/tree/${HAPTAL_MISALIGNMENT_REVISION}?recursive=true&expand=false&limit=1000`;
const RESOLVE_BASE = `${ORIGIN}/datasets/${ENCODED_DATASET}/resolve/${HAPTAL_MISALIGNMENT_REVISION}`;
const FETCH_ATTEMPTS = 6;
const FETCH_TIMEOUT_MS = 180_000;
const MAX_API_BYTES = 2 * 1024 * 1024;
const MAX_OBJECT_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_WORKERS = 4;

const FILES = Object.freeze([
  Object.freeze({ path: ".gitattributes", bytes: 1_053,
    sha256: "sha256:868cbec616368b65365fc88cd9e9eab79fcb01d936aab207500a12bcf6a31ea8" }),
  Object.freeze({ path: "README.md", bytes: 12_598,
    sha256: "sha256:f9ecfb054ca1df4387bc2e787de00c507be52e8dd20a01ee77c0e0243f5d08a8" }),
  Object.freeze({ path: "baseline.py", bytes: 13_173,
    sha256: "sha256:9dfcdca0f4744943a4ba6445b5ef0f199bb3caa68ed854902eb92726ea06f49c" }),
  Object.freeze({ path: "episodes.parquet", bytes: 14_392_520,
    sha256: "sha256:dbb7b0c57743ecd2f80b15ebf6cc894f5e6370d51ea297a9fedfb4f0a9fef5a4" }),
  Object.freeze({ path: "generate_misalignment_dataset.py", bytes: 16_484,
    sha256: "sha256:a7fb080198ca80651829784e64df556d036a933f97166017f3a04f3b38783a01" }),
  Object.freeze({ path: "labels.parquet", bytes: 5_455,
    sha256: "sha256:908c2c8875aa3a866e705b301c5dc8daa87eb170397de01c9f730225e2b68588" }),
  Object.freeze({ path: "score.py", bytes: 4_175,
    sha256: "sha256:210f6f280367b95c56bd209d223a27c1c7c66326004d3392cfdb4b411705a0c3" }),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `HAPTAL_MISALIGNMENT_ACQUIRE_${code}`
    : `HAPTAL_MISALIGNMENT_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, sourceOnly: false,
    sourceCandidate: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--source-candidate" && argv[index + 1]) {
      result.sourceCandidate = argv[++index];
    } else if (argument === "--source-only") result.sourceOnly = true;
    else if (["--help", "-h"].includes(argument)) {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-haptal-misalignment-failure-full-repo.mjs [--output-dir <new-dir>] [--source-only]",
        "  node scripts/acquire-haptal-misalignment-failure-full-repo.mjs --source-candidate <complete-dir> [--output-dir <new-dir>]",
        "",
        `Pins ${HAPTAL_MISALIGNMENT_DATASET_ID}@${HAPTAL_MISALIGNMENT_REVISION}.`,
        "Acquires all seven fixed-revision files with record/tree brackets.",
        "Generator, baseline, scorer, and Parquet payloads remain inert private bytes.",
      ].join("\n") + "\n");
      process.exit(0);
    } else fail("ARGUMENT_INVALID", argument);
  }
  return result;
}

function mkdirPrivate(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    fail("DIRECTORY_UNSAFE", directory);
  }
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
  if (!response.body || response.headers.get("content-encoding") !== null) {
    fail("FETCH_BODY_INVALID");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared)
    || Number(declared) > maximumBytes
    || exactBytes !== null && Number(declared) !== exactBytes)) {
    fail("CONTENT_LENGTH_INVALID", declared);
  }
  const chunks = [];
  let total = 0;
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

async function fetchApi(url, kind) {
  return retry(async () => {
    const parsed = new URL(url);
    if (parsed.origin !== ORIGIN || parsed.username || parsed.password
      || !decodeURIComponent(parsed.pathname).includes(HAPTAL_MISALIGNMENT_REVISION)) {
      fail("API_URL_INVALID", url);
    }
    const response = await fetch(parsed, { redirect: "error", headers: {
      accept: "application/json", "accept-encoding": "identity",
      "user-agent": "outsider-haptal-misalignment-source/1.0",
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

async function fetchObject(specification) {
  const encoded = specification.path.split("/").map(encodeURIComponent).join("/");
  const initial = new URL(`${RESOLVE_BASE}/${encoded}?download=true`);
  return retry(async () => {
    let url = initial;
    for (let redirects = 0; redirects < 7; redirects += 1) {
      if (url.protocol !== "https:" || url.username || url.password
        || !allowedDownloadHost(url.hostname)) fail("OBJECT_URL_INVALID", url.href);
      const response = await fetch(url, { redirect: "manual", headers: {
        accept: "application/octet-stream", "accept-encoding": "identity",
        "user-agent": "outsider-haptal-misalignment-source/1.0",
      }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) fail("OBJECT_REDIRECT_MISSING", specification.path);
        url = new URL(location, url); continue;
      }
      if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
        fail(`OBJECT_HTTP_${response.status}`, specification.path);
      }
      const bytes = await readBounded(response, MAX_OBJECT_BYTES,
        specification.bytes);
      if (haptalMisalignmentSha256(bytes) !== specification.sha256) {
        fail("OBJECT_DIGEST_INVALID", specification.path);
      }
      return bytes;
    }
    fail("OBJECT_REDIRECT_LIMIT", specification.path);
  }, "OBJECT_DOWNLOAD_FAILED");
}

function writeOrMatch(file, bytes) {
  if (existsSync(file)) {
    const status = lstatSync(file);
    if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600
      || !readFileSync(file).equals(bytes)) fail("CHECKPOINT_CHANGED", file);
  } else writePrivate(file, bytes);
}

async function workerPool(items, worker) {
  let cursor = 0;
  let completed = 0;
  async function run() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item); completed += 1;
      process.stderr.write(`Source checkpoint ${completed}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_WORKERS, items.length) },
    run));
}

function finalizeSource(sourceRoot) {
  const manifestFile = path.join(sourceRoot, "source-manifest.json");
  if (!existsSync(manifestFile)) {
    const manifest = createHaptalMisalignmentSourceManifestFromDirectory(sourceRoot);
    writePrivate(manifestFile, serializeHaptalMisalignmentArtifact(manifest));
  }
  const checked = verifyHaptalMisalignmentSourceDirectory(sourceRoot);
  if (!checked.ok) fail("SOURCE_INVALID", checked.error);
  return checked;
}

async function acquireSource(sourceRoot) {
  mkdirPrivate(sourceRoot);
  mkdirPrivate(path.join(sourceRoot, "metadata"));
  mkdirPrivate(path.join(sourceRoot, "files"));
  const beforeRecord = await fetchApi(RECORD_URL, "RECORD_BEFORE");
  const beforeTree = await fetchApi(TREE_URL, "TREE_BEFORE");
  inspectHaptalMisalignmentMetadata(beforeRecord, beforeTree);
  writeOrMatch(path.join(sourceRoot, "metadata/dataset-record-before.json"),
    beforeRecord);
  writeOrMatch(path.join(sourceRoot, "metadata/full-tree-before.json"), beforeTree);
  await workerPool(FILES, async (specification) => {
    const destination = path.join(sourceRoot, "files", specification.path);
    if (existsSync(destination)) {
      const bytes = readFileSync(destination);
      if (bytes.length !== specification.bytes
        || haptalMisalignmentSha256(bytes) !== specification.sha256) {
        fail("CHECKPOINT_OBJECT_INVALID", specification.path);
      }
      return;
    }
    writePrivate(destination, await fetchObject(specification));
  });
  const afterRecord = await fetchApi(RECORD_URL, "RECORD_AFTER");
  const afterTree = await fetchApi(TREE_URL, "TREE_AFTER");
  inspectHaptalMisalignmentMetadata(afterRecord, afterTree);
  if (!beforeRecord.equals(afterRecord) || !beforeTree.equals(afterTree)) {
    fail("FIXED_REVISION_BRACKET_CHANGED");
  }
  writeOrMatch(path.join(sourceRoot, "metadata/dataset-record-after.json"),
    afterRecord);
  writeOrMatch(path.join(sourceRoot, "metadata/full-tree-after.json"), afterTree);
  return finalizeSource(sourceRoot);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const workspace = path.resolve(process.cwd());
  const target = safeOutput(workspace, args.outputDir);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  ensurePrivateParents(target, workspace);
  let sourceRoot;
  let sourceVerification;
  if (args.sourceCandidate !== null) {
    sourceRoot = path.resolve(args.sourceCandidate);
    sourceVerification = verifyHaptalMisalignmentSourceDirectory(sourceRoot);
    if (!sourceVerification.ok) {
      fail("SOURCE_CANDIDATE_INVALID", sourceVerification.error);
    }
  } else {
    sourceRoot = `${target}.source-checkpoint`;
    sourceVerification = existsSync(path.join(sourceRoot, "source-manifest.json"))
      ? finalizeSource(sourceRoot) : await acquireSource(sourceRoot);
  }
  if (args.sourceOnly) {
    const result = { ok: true, sourceOnly: true, sourceDirectory: sourceRoot,
      datasetId: HAPTAL_MISALIGNMENT_DATASET_ID,
      revision: HAPTAL_MISALIGNMENT_REVISION,
      fixedTreeFiles: 7, fixedTreeBytes: 14_445_458,
      sourceManifestHash: sourceVerification.sourceManifest.sourceManifestHash,
      sourceRoot: sourceVerification.sourceManifest.sourceRoot };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  const report = buildHaptalMisalignmentReportFromSource(sourceRoot);
  const reportBytes = serializeHaptalMisalignmentArtifact(report);
  const manifestBytes = readFileSync(path.join(sourceRoot, "source-manifest.json"));
  const receipt = createHaptalMisalignmentReceipt(report, reportBytes, manifestBytes);
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirPrivate(staging);
  writePrivate(path.join(staging, "report.json"), reportBytes);
  renameSync(sourceRoot, path.join(staging, "source"));
  writePrivate(path.join(staging, "run-receipt.json"),
    serializeHaptalMisalignmentArtifact(receipt));
  renameSync(staging, target);
  const verified = verifyHaptalMisalignmentArtifactDirectory(target);
  if (!verified.ok) fail("PUBLISHED_ARTIFACT_INVALID", verified.error);
  const result = { ok: true, outputDirectory: target,
    datasetId: HAPTAL_MISALIGNMENT_DATASET_ID,
    revision: HAPTAL_MISALIGNMENT_REVISION,
    fixedTreeFiles: 7, fixedTreeBytes: 14_445_458,
    syntheticEpisodes: 150, syntheticTimestepRows: 51_172,
    publisherInjectedLabelRows: 150, independentOutcomeRows: 0,
    completePhysicalEpisodeRows: 0, recoveryRows: 0,
    authorizedTrainingRows: 0, authorityDelta: 0,
    disposition: HAPTAL_MISALIGNMENT_DISPOSITION,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceRoot: report.source.sourceRoot, artifactHash: report.artifactHash,
    receiptHash: receipt.receiptHash,
    verificationLevel: verified.verificationLevel };
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
