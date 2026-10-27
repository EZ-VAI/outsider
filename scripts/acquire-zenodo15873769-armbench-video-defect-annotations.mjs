#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, lstatSync, mkdirSync,
  openSync, readFileSync, readSync, renameSync, writeFileSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ZENODO_15873769_DISPOSITION,
  ZENODO_15873769_DOI,
  ZENODO_15873769_RECORD_ID,
  buildZenodo15873769AnnotationReportFromSource,
  createZenodo15873769AnnotationReceipt,
  createZenodo15873769SourceMaterialFromDirectory,
  serializeZenodo15873769AnnotationArtifact,
  verifyZenodo15873769AnnotationArtifactDirectory,
  verifyZenodo15873769SourceDirectory,
} from "../src/outsider-zenodo15873769-armbench-video-defect-annotations.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-zenodo15873769-armbench-video-defect-annotations-20260829-v1";
const RECORD_URL = `https://zenodo.org/api/records/${ZENODO_15873769_RECORD_ID}`;
const FETCH_ATTEMPTS = 5;
const FETCH_TIMEOUT_MS = 180_000;
const RANGE_WORKERS = 32;
const RANGE_BYTES = 5_242_880;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

const OFFICIAL_FILES = Object.freeze([
  Object.freeze({ name: "ARMBench.zip", bytes: 166_841_298,
    sha256: "d346ad8fbc925971f479f4a0237be4d7d6f0bcae1ae21ab5c6675014bd361fbc",
    url: `https://zenodo.org/api/records/${ZENODO_15873769_RECORD_ID}/files/ARMBench.zip/content` }),
  Object.freeze({ name: "FAILURE.zip", bytes: 73_299,
    sha256: "faedcf91cac3da6b67d946165e99d32a07a3e7d5b0c0927e9353f10eec093e25",
    url: `https://zenodo.org/api/records/${ZENODO_15873769_RECORD_ID}/files/FAILURE.zip/content` }),
]);

const LINEAGE_FILES = Object.freeze([
  Object.freeze({ name: "code-repo-record.json", bytes: 6_092,
    url: "https://api.github.com/repos/sthoduka/using_task_knowledge" }),
  Object.freeze({ name: "code-commit.json", bytes: 5_054,
    url: "https://api.github.com/repos/sthoduka/using_task_knowledge/commits/8e92c98b677ffdeb48822440dfac856e6b4ec20c" }),
  Object.freeze({ name: "code-tree.json", bytes: 6_958,
    url: "https://api.github.com/repos/sthoduka/using_task_knowledge/git/trees/d7d4da0ec875cc3dfe7819e7509ddded219270b5?recursive=1" }),
  Object.freeze({ name: "code-readme.md", bytes: 4_012,
    url: "https://raw.githubusercontent.com/sthoduka/using_task_knowledge/8e92c98b677ffdeb48822440dfac856e6b4ec20c/README.md" }),
  Object.freeze({ name: "code-armbench-dataset.py", bytes: 35_813,
    url: "https://raw.githubusercontent.com/sthoduka/using_task_knowledge/8e92c98b677ffdeb48822440dfac856e6b4ec20c/datasets/armbench_dataset.py" }),
  Object.freeze({ name: "code-failure-dataset.py", bytes: 14_270,
    url: "https://raw.githubusercontent.com/sthoduka/using_task_knowledge/8e92c98b677ffdeb48822440dfac856e6b4ec20c/datasets/failure_dataset.py" }),
  Object.freeze({ name: "project-page.html", bytes: 4_973,
    url: "https://sthoduka.github.io/using_task_knowledge/" }),
  Object.freeze({ name: "paper-arxiv-record.xml", bytes: 3_115,
    url: "https://export.arxiv.org/api/query?id_list=2508.18705" }),
  Object.freeze({ name: "paper-crossref-record.json", bytes: 7_145,
    url: "https://api.crossref.org/works/10.1109%2FECMR65884.2025.11162998" }),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `ZENODO_15873769_ACQUIRE_${code}`
    : `ZENODO_15873769_ACQUIRE_${code}:${detail}`);
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
        "  node scripts/acquire-zenodo15873769-armbench-video-defect-annotations.mjs [--output-dir <new-dir>] [--source-only]",
        "  node scripts/acquire-zenodo15873769-armbench-video-defect-annotations.mjs --source-candidate <complete-dir> [--output-dir <new-dir>]",
        "",
        `Pins Zenodo ${ZENODO_15873769_DOI} revision 10 and both complete ZIP files.`,
        "Large-file acquisition uses bounded, exact Content-Range checkpoints.",
        "All Python, ZIP members, and annotation payloads remain inert private bytes.",
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

function sha256File(file) {
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600) {
    fail("FILE_UNSAFE", file);
  }
  const descriptor = openSync(file, O_RDONLY | O_NOFOLLOW);
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(256 * 1024);
  let total = 0;
  try {
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count)); total += count;
    }
  } finally { closeSync(descriptor); }
  return { bytes: total, sha256: hash.digest("hex") };
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

function allowedHost(hostname) {
  return hostname === "zenodo.org" || hostname.endsWith(".zenodo.org")
    || hostname === "api.github.com" || hostname === "raw.githubusercontent.com"
    || hostname === "sthoduka.github.io" || hostname === "export.arxiv.org"
    || hostname === "api.crossref.org" || hostname.endsWith(".amazonaws.com");
}

function validateResponseUrl(response) {
  const resolved = new URL(response.url);
  if (resolved.protocol !== "https:" || resolved.username || resolved.password
    || !allowedHost(resolved.hostname)) fail("RESPONSE_URL_INVALID", response.url);
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

async function fetchExact(url, exactBytes, kind) {
  return retry(async () => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password
      || !allowedHost(parsed.hostname)) fail("SOURCE_URL_INVALID", url);
    const response = await fetch(parsed, { redirect: "follow", headers: {
      "accept-encoding": "identity",
      "user-agent": "outsider-zenodo-15873769-source/1.0",
    }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    validateResponseUrl(response);
    if (response.status !== 200) fail(`${kind}_HTTP_${response.status}`);
    return readBounded(response, exactBytes, exactBytes);
  }, `${kind}_DOWNLOAD_FAILED`);
}

async function fetchRange(specification, start, end) {
  const expectedBytes = end - start + 1;
  return retry(async () => {
    const response = await fetch(specification.url, { redirect: "follow", headers: {
      range: `bytes=${start}-${end}`,
      "accept-encoding": "identity",
      "user-agent": "outsider-zenodo-15873769-source/1.0",
    }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    validateResponseUrl(response);
    const expectedRange = `bytes ${start}-${end}/${specification.bytes}`;
    if (response.status !== 206
      || response.headers.get("content-range") !== expectedRange) {
      fail("RANGE_RESPONSE_INVALID", `${response.status}/${response.headers.get("content-range")}`);
    }
    return readBounded(response, expectedBytes, expectedBytes);
  }, "RANGE_DOWNLOAD_FAILED");
}

async function workerPool(items, worker, workers) {
  let cursor = 0;
  let completed = 0;
  async function run() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
      completed += 1;
      process.stderr.write(`Range checkpoint ${completed}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, run));
}

async function downloadRanged(specification, destination, checkpointDirectory) {
  if (existsSync(destination)) {
    const measured = sha256File(destination);
    if (measured.bytes === specification.bytes
      && measured.sha256 === specification.sha256) return;
    fail("EXISTING_ARCHIVE_INVALID", specification.name);
  }
  mkdirPrivate(checkpointDirectory);
  const ranges = [];
  for (let start = 0, index = 0; start < specification.bytes;
    start += RANGE_BYTES, index += 1) {
    const end = Math.min(specification.bytes - 1, start + RANGE_BYTES - 1);
    ranges.push({ index, start, end });
  }
  await workerPool(ranges, async (range) => {
    const part = path.join(checkpointDirectory,
      `part-${String(range.index).padStart(3, "0")}`);
    const expected = range.end - range.start + 1;
    if (existsSync(part)) {
      const status = lstatSync(part);
      if (!status.isFile() || status.isSymbolicLink()
        || (status.mode & 0o777) !== 0o600 || status.size !== expected) {
        fail("RANGE_CHECKPOINT_INVALID", part);
      }
      return;
    }
    writePrivate(part, await fetchRange(specification, range.start, range.end));
  }, RANGE_WORKERS);
  const descriptor = openSync(destination, constants.O_CREAT | constants.O_EXCL
    | constants.O_WRONLY | O_NOFOLLOW, 0o600);
  try {
    for (const range of ranges) {
      const part = path.join(checkpointDirectory,
        `part-${String(range.index).padStart(3, "0")}`);
      const bytes = readFileSync(part);
      let offset = 0;
      while (offset < bytes.length) {
        offset += writeSync(descriptor, bytes, offset, bytes.length - offset, null);
      }
    }
  } finally { closeSync(descriptor); }
  chmodSync(destination, 0o600);
  const measured = sha256File(destination);
  if (measured.bytes !== specification.bytes
    || measured.sha256 !== specification.sha256) fail("ARCHIVE_HASH_INVALID");
}

function writeOrMatch(file, bytes) {
  if (existsSync(file)) {
    const status = lstatSync(file);
    if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600
      || !readFileSync(file).equals(bytes)) fail("CHECKPOINT_CHANGED", file);
  } else writePrivate(file, bytes);
}

function finalizeSource(sourceRoot) {
  const manifestFile = path.join(sourceRoot, "source-manifest.json");
  const inventoryFile = path.join(sourceRoot, "source-support/zip-inventory.json");
  if (existsSync(manifestFile) || existsSync(inventoryFile)) {
    if (!existsSync(manifestFile) || !existsSync(inventoryFile)) {
      fail("PARTIAL_SOURCE_MATERIAL");
    }
    const checked = verifyZenodo15873769SourceDirectory(sourceRoot);
    if (!checked.ok) fail("SOURCE_INVALID", checked.error);
    return checked;
  }
  const material = createZenodo15873769SourceMaterialFromDirectory(sourceRoot);
  writePrivate(inventoryFile, material.inventoryBytes);
  writePrivate(manifestFile, material.sourceManifestBytes);
  const checked = verifyZenodo15873769SourceDirectory(sourceRoot);
  if (!checked.ok) fail("SOURCE_INVALID", checked.error);
  return checked;
}

async function acquireSource(sourceRoot, rangeCheckpointRoot) {
  mkdirPrivate(sourceRoot);
  for (const directory of ["metadata", "raw", "lineage", "source-support"]) {
    mkdirPrivate(path.join(sourceRoot, directory));
  }
  const before = await fetchExact(RECORD_URL, 4_667, "RECORD_BEFORE");
  writeOrMatch(path.join(sourceRoot, "metadata/record-before.json"), before);
  for (const specification of OFFICIAL_FILES) {
    const destination = path.join(sourceRoot, "raw", specification.name);
    if (specification.bytes > RANGE_BYTES) {
      await downloadRanged(specification, destination,
        path.join(rangeCheckpointRoot, specification.name));
    } else {
      writeOrMatch(destination,
        await fetchExact(specification.url, specification.bytes, specification.name));
    }
  }
  for (const specification of LINEAGE_FILES) {
    writeOrMatch(path.join(sourceRoot, "lineage", specification.name),
      await fetchExact(specification.url, specification.bytes, specification.name));
  }
  const after = await fetchExact(RECORD_URL, 4_667, "RECORD_AFTER");
  if (!before.equals(after)) fail("RECORD_BRACKET_CHANGED");
  writeOrMatch(path.join(sourceRoot, "metadata/record-after.json"), after);
  return finalizeSource(sourceRoot);
}

function assertCandidate(candidate) {
  const root = path.resolve(candidate);
  const checked = verifyZenodo15873769SourceDirectory(root);
  if (!checked.ok) fail("SOURCE_CANDIDATE_INVALID", checked.error);
  return { root, checked };
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
    ({ root: sourceRoot, checked: sourceVerification } =
      assertCandidate(args.sourceCandidate));
  } else {
    sourceRoot = `${target}.source-checkpoint`;
    const manifest = path.join(sourceRoot, "source-manifest.json");
    if (existsSync(manifest)) sourceVerification = finalizeSource(sourceRoot);
    else sourceVerification = await acquireSource(sourceRoot,
      `${target}.range-checkpoints`);
  }
  if (args.sourceOnly) {
    const result = { ok: true, sourceOnly: true, sourceDirectory: sourceRoot,
      recordId: ZENODO_15873769_RECORD_ID, doi: ZENODO_15873769_DOI,
      officialArchiveFiles: 2, officialArchiveBytes: 166_914_597,
      sourceManifestHash: sourceVerification.sourceManifest.sourceManifestHash,
      sourceRoot: sourceVerification.sourceManifest.sourceRoot };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  const report = buildZenodo15873769AnnotationReportFromSource(sourceRoot);
  const reportBytes = serializeZenodo15873769AnnotationArtifact(report);
  const manifestBytes = readFileSync(path.join(sourceRoot, "source-manifest.json"));
  const receipt = createZenodo15873769AnnotationReceipt(report, reportBytes,
    manifestBytes);
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirPrivate(staging);
  writePrivate(path.join(staging, "report.json"), reportBytes);
  renameSync(sourceRoot, path.join(staging, "source"));
  writePrivate(path.join(staging, "run-receipt.json"),
    serializeZenodo15873769AnnotationArtifact(receipt));
  renameSync(staging, target);
  const verified = verifyZenodo15873769AnnotationArtifactDirectory(target);
  if (!verified.ok) fail("PUBLISHED_ARTIFACT_INVALID", verified.error);
  const result = { ok: true, outputDirectory: target,
    recordId: ZENODO_15873769_RECORD_ID, doi: ZENODO_15873769_DOI,
    officialArchiveFiles: 2, officialArchiveBytes: 166_914_597,
    armbenchTrialUniverse: 20_008, failureNpyFiles: 229,
    independentOutcomeRows: 0, completeEpisodeRows: 0, recoveryRows: 0,
    authorizedTrainingRows: 0, networkAdmissionRows: 0, authorityDelta: 0,
    disposition: ZENODO_15873769_DISPOSITION,
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
