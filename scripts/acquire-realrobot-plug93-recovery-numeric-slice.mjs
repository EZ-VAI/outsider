#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  PLUG93_RECOVERY_DATASET_ID, PLUG93_RECOVERY_RANGE_PLAN,
  PLUG93_RECOVERY_REVISION,
  buildPlug93RecoveryArtifactFromSourceDirectory,
  createPlug93RecoveryReceipt,
  createPlug93RecoverySourceManifestFromDirectory,
  serializePlug93RecoveryArtifact,
  verifyPlug93RecoveryArtifactDirectory,
} from "../src/outsider-realrobot-plug93-recovery-numeric-slice.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-realrobot-plug93-recovery-numeric-slice-20260830-v1";
const RANGE_ACQUISITION_SCHEMA =
  "outsider/realrobot-plug93-range-acquisition/v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `PLUG93_RECOVERY_ACQUIRE_${code}`
    : `PLUG93_RECOVERY_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = {
    outputDir: DEFAULT_OUTPUT, reuseSupportDir: null,
    reuseBracketBeforeDir: null, reuseBracketAfterDir: null,
    reuseRangeCache: null, pythonExecutable: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--reuse-support-dir" && argv[index + 1]) {
      result.reuseSupportDir = argv[++index];
    } else if (argument === "--reuse-bracket-before-dir" && argv[index + 1]) {
      result.reuseBracketBeforeDir = argv[++index];
    } else if (argument === "--reuse-bracket-after-dir" && argv[index + 1]) {
      result.reuseBracketAfterDir = argv[++index];
    } else if (argument === "--reuse-range-cache" && argv[index + 1]) {
      result.reuseRangeCache = argv[++index];
    } else if (argument === "--python" && argv[index + 1]) {
      result.pythonExecutable = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-realrobot-plug93-recovery-numeric-slice.mjs [options]",
        "",
        "Options:",
        "  --output-dir <new-dir>",
        "  --reuse-support-dir <fixed-revision-support-files>",
        "  --reuse-bracket-before-dir <record-and-two-tree-pages-dir>",
        "  --reuse-bracket-after-dir <record-and-two-tree-pages-dir>",
        "  --reuse-range-cache <strict-206-fragment-cache-dir>",
        "  --python <python-with-pyarrow-and-numpy>",
        "",
        "Acquires all non-image Parquet column chunks for the publisher-declared",
        "17-episode recovery group. Embedded camera chunks are never requested.",
      ].join("\n") + "\n");
      process.exit(0);
    } else fail("ARGUMENT_INVALID", argument);
  }
  return result;
}

function mkdirPrivate(directory) {
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
}

function ensurePrivateDirectory(directory) {
  if (existsSync(directory)) {
    const status = lstatSync(directory);
    if (!status.isDirectory() || status.isSymbolicLink()
      || (status.mode & 0o777) !== 0o700) fail("DIRECTORY_UNSAFE", directory);
    return;
  }
  ensurePrivateDirectory(path.dirname(directory));
  mkdirPrivate(directory);
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function replacePrivate(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  const temporary = `${file}.replace-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    writePrivate(temporary, bytes);
    renameSync(temporary, file);
    chmodSync(file, 0o600);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function validateTarget(workspace, target, checkpoint) {
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || existsSync(target)) {
    fail("OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE", target);
  }
  let cursor = path.dirname(target);
  const missing = [];
  while (cursor !== workspace) {
    const relation = path.relative(workspace, cursor);
    if (relation === ".." || relation.startsWith(`..${path.sep}`)) {
      fail("OUTPUT_PARENT_OUTSIDE_WORKSPACE");
    }
    if (!existsSync(cursor)) missing.push(cursor);
    cursor = path.dirname(cursor);
  }
  for (const directory of missing.reverse()) mkdirPrivate(directory);
  if (existsSync(checkpoint)) {
    const status = lstatSync(checkpoint);
    if (!status.isDirectory() || status.isSymbolicLink()
      || (status.mode & 0o777) !== 0o700) fail("CHECKPOINT_UNSAFE");
  }
}

function existingPrivateFile(file, exactBytes = null, expectedSha256 = null) {
  if (!existsSync(file)) return false;
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink()
    || (status.mode & 0o777) !== 0o600
    || exactBytes !== null && status.size !== exactBytes) {
    fail("CHECKPOINT_FILE_INVALID", file);
  }
  if (expectedSha256 !== null
    && sha256(readFileSync(file)) !== expectedSha256) {
    fail("CHECKPOINT_FILE_HASH_INVALID", file);
  }
  return true;
}

function copyPrivate(source, destination, exactBytes = null,
  expectedSha256 = null) {
  const resolved = path.resolve(source);
  const status = lstatSync(resolved);
  if (!status.isFile() || status.isSymbolicLink()
    || exactBytes !== null && status.size !== exactBytes) {
    fail("REUSE_SOURCE_INVALID", resolved);
  }
  if (expectedSha256 !== null
    && sha256(readFileSync(resolved)) !== expectedSha256) {
    fail("REUSE_SOURCE_HASH_INVALID", resolved);
  }
  if (existingPrivateFile(destination, status.size, expectedSha256)) return;
  ensurePrivateDirectory(path.dirname(destination));
  const temporary = `${destination}.copy-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    copyFileSync(resolved, temporary, constants.COPYFILE_EXCL);
    chmodSync(temporary, 0o600);
    renameSync(temporary, destination);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function checkedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password
    || url.hostname !== "huggingface.co") fail("URL_INVALID", value);
  return url.href;
}

async function fetchResponse(url, options = {}) {
  let last = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      const response = await fetch(checkedUrl(url), {
        redirect: "follow", headers: {
          "Accept-Encoding": "identity",
          "User-Agent": "outsider-realrobot-plug93-recovery-numeric-slice/1.0",
          ...(options.headers ?? {}),
        }, signal: AbortSignal.timeout((options.maximumSeconds ?? 600) * 1_000),
      });
      if (!response.url.startsWith("https://")) fail("REDIRECT_PROTOCOL_INVALID");
      const bytes = Buffer.from(await response.arrayBuffer());
      return { response, bytes };
    } catch (error) {
      last = error;
      if (attempt < 6) await new Promise((resolve) => setTimeout(resolve,
        Math.min(8_000, 500 * (2 ** attempt))));
    }
  }
  fail("DOWNLOAD_FAILED", last instanceof Error ? last.message : String(last));
}

async function download(file, url, exactBytes = null) {
  if (existingPrivateFile(file, exactBytes)) return;
  ensurePrivateDirectory(path.dirname(file));
  const { response, bytes } = await fetchResponse(url);
  if (!response.ok) fail("HTTP_STATUS_INVALID", String(response.status));
  if (exactBytes !== null && bytes.length !== exactBytes) {
    fail("DOWNLOAD_SIZE_INVALID", file);
  }
  const temporary = `${file}.download-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    writePrivate(temporary, bytes);
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

function encodeRepoPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

const encodedId = PLUG93_RECOVERY_DATASET_ID.split("/")
  .map(encodeURIComponent).join("/");
const apiBase = `https://huggingface.co/api/datasets/${encodedId}`;
const recordUrl = `${apiBase}/revision/${PLUG93_RECOVERY_REVISION}`;
const treeFirstUrl = `${apiBase}/tree/${PLUG93_RECOVERY_REVISION}`
  + "?recursive=true&expand=true&limit=100";
const resolveBase = `https://huggingface.co/datasets/${encodedId}`
  + `/resolve/${PLUG93_RECOVERY_REVISION}`;

function nextLink(headers) {
  const value = headers.get("link") ?? "";
  const match = value.match(/<([^>]+)>;\s*rel="next"/u);
  if (!match) fail("TREE_NEXT_LINK_MISSING");
  return checkedUrl(match[1]);
}

async function acquireBracket(checkpoint, suffix, reuseDirectory) {
  const metadata = path.join(checkpoint, "metadata");
  ensurePrivateDirectory(metadata);
  const recordTarget = path.join(metadata, `hf-record-${suffix}.json`);
  const page1Target = path.join(metadata, `hf-tree-page1-${suffix}.json`);
  const page2Target = path.join(metadata, `hf-tree-page2-${suffix}.json`);
  if (reuseDirectory !== null) {
    const root = path.resolve(reuseDirectory);
    copyPrivate(path.join(root, "record.json"), recordTarget);
    copyPrivate(path.join(root, "tree-page1.json"), page1Target);
    copyPrivate(path.join(root, "tree-page2.json"), page2Target);
    return;
  }
  await download(recordTarget, recordUrl);
  if (!existingPrivateFile(page1Target)) {
    const first = await fetchResponse(treeFirstUrl);
    if (!first.response.ok) fail("TREE_PAGE1_HTTP_INVALID", first.response.status);
    writePrivate(page1Target, first.bytes);
    const second = await fetchResponse(nextLink(first.response.headers));
    if (!second.response.ok) fail("TREE_PAGE2_HTTP_INVALID", second.response.status);
    writePrivate(page2Target, second.bytes);
  } else if (!existingPrivateFile(page2Target)) {
    fail("PARTIAL_TREE_BRACKET_REQUIRES_REACQUISITION", suffix);
  }
}

function readTreeEntries(checkpoint) {
  const page1 = JSON.parse(readFileSync(path.join(checkpoint,
    "metadata/hf-tree-page1-before.json"), "utf8"));
  const page2 = JSON.parse(readFileSync(path.join(checkpoint,
    "metadata/hf-tree-page2-before.json"), "utf8"));
  const entries = [...page1, ...page2];
  if (entries.length !== 106) fail("TREE_ENTRY_COUNT_INVALID");
  return entries;
}

async function acquireSupport(checkpoint, reuseDirectory) {
  const entries = readTreeEntries(checkpoint).filter((entry) =>
    entry.type === "file" && !entry.path.startsWith("data/"));
  if (entries.length !== 8
    || entries.reduce((sum, entry) => sum + entry.size, 0) !== 602_378) {
    fail("SUPPORT_TREE_PROFILE_INVALID");
  }
  for (const entry of entries) {
    const target = path.join(checkpoint, "files", ...entry.path.split("/"));
    const expected = entry.lfs?.oid ? `sha256:${entry.lfs.oid}` : null;
    if (reuseDirectory !== null) {
      copyPrivate(path.join(path.resolve(reuseDirectory),
        ...entry.path.split("/")), target, entry.size, expected);
    } else {
      await download(target,
        `${resolveBase}/${encodeRepoPath(entry.path)}?download=true`, entry.size);
      if (expected !== null && sha256(readFileSync(target)) !== expected) {
        fail("SUPPORT_LFS_HASH_INVALID", entry.path);
      }
    }
  }
}

function fragmentRelative(item, range) {
  const end = range.endExclusive - 1;
  return `file-${String(item.episode).padStart(3, "0")}`
    + `/range-${String(range.start).padStart(12, "0")}`
    + `-${String(end).padStart(12, "0")}.bin`;
}

function rangeDescriptors() {
  return PLUG93_RECOVERY_RANGE_PLAN.files.flatMap((item) =>
    item.selectedRanges.map((range) => ({ item, range,
      relative: fragmentRelative(item, range) })));
}

function normalizedRangeRecord(record) {
  return {
    episode: record.episode, path: record.path, fileBytes: record.fileBytes,
    lfsOid: record.lfsOid, rangeIndex: record.rangeIndex,
    start: record.start, endInclusive: record.endInclusive,
    bytes: record.bytes, sha256: record.sha256, status: record.status,
    contentRange: record.contentRange, contentLength: record.contentLength,
  };
}

function sortedRangeRecords(records) {
  return [...records].sort((left, right) =>
    left.episode - right.episode || left.rangeIndex - right.rangeIndex);
}

function rangeAcquisitionBytes(records) {
  return serializePlug93RecoveryArtifact({ schema: RANGE_ACQUISITION_SCHEMA,
    records: sortedRangeRecords(records).map(normalizedRangeRecord) });
}

async function acquireRanges(checkpoint, reuseCache) {
  const targetRecord = path.join(checkpoint, "range-acquisition.json");
  const descriptors = rangeDescriptors();
  if (reuseCache !== null) {
    const cache = path.resolve(reuseCache);
    const value = JSON.parse(readFileSync(path.join(cache,
      "range-acquisition.json"), "utf8"));
    if (!Array.isArray(value.records) || value.records.length !== 34) {
      fail("REUSE_RANGE_RECORD_INVALID");
    }
    const records = sortedRangeRecords(value.records).map(normalizedRangeRecord);
    for (const descriptor of descriptors) {
      const record = records.find((candidate) =>
        candidate.episode === descriptor.item.episode
        && candidate.rangeIndex === descriptor.range.index);
      if (!record) fail("REUSE_RANGE_RECORD_MISSING", descriptor.relative);
      copyPrivate(path.join(cache, descriptor.relative),
        path.join(checkpoint, "ranges", descriptor.relative),
        descriptor.range.bytes, record.sha256);
    }
    if (!existsSync(targetRecord)) writePrivate(targetRecord,
      rangeAcquisitionBytes(records));
    return;
  }
  let records = existsSync(targetRecord)
    ? JSON.parse(readFileSync(targetRecord, "utf8")).records ?? [] : [];
  for (const descriptor of descriptors) {
    const { item, range, relative } = descriptor;
    const target = path.join(checkpoint, "ranges", relative);
    const prior = records.find((record) => record.episode === item.episode
      && record.rangeIndex === range.index);
    if (prior && existingPrivateFile(target, range.bytes, prior.sha256)) continue;
    if (existsSync(target) || prior) fail("PARTIAL_RANGE_RECORD_INVALID", relative);
    ensurePrivateDirectory(path.dirname(target));
    const endInclusive = range.endExclusive - 1;
    const fetched = await fetchResponse(
      `${resolveBase}/${encodeRepoPath(item.path)}?download=true`, {
        headers: { Range: `bytes=${range.start}-${endInclusive}` },
      });
    const contentRange = fetched.response.headers.get("content-range");
    const contentLength = Number(fetched.response.headers.get("content-length"));
    if (fetched.response.status !== 206
      || contentRange !== `bytes ${range.start}-${endInclusive}/${item.fileBytes}`
      || contentLength !== range.bytes || fetched.bytes.length !== range.bytes) {
      fail("STRICT_206_INVALID", `${item.episode}:${range.index}`);
    }
    writePrivate(target, fetched.bytes);
    records.push({ episode: item.episode, path: item.path,
      fileBytes: item.fileBytes, lfsOid: item.lfsOid,
      rangeIndex: range.index, start: range.start, endInclusive,
      bytes: range.bytes, sha256: sha256(fetched.bytes), status: 206,
      contentRange, contentLength });
    replacePrivate(targetRecord, rangeAcquisitionBytes(records));
  }
}

async function acquireSource(checkpoint, options) {
  ensurePrivateDirectory(checkpoint);
  await acquireBracket(checkpoint, "before", options.reuseBracketBeforeDir);
  await acquireSupport(checkpoint, options.reuseSupportDir);
  const planFile = path.join(checkpoint, "range-plan.json");
  const planBytes = serializePlug93RecoveryArtifact(PLUG93_RECOVERY_RANGE_PLAN);
  if (!existingPrivateFile(planFile, planBytes.length)) writePrivate(planFile, planBytes);
  else if (!readFileSync(planFile).equals(planBytes)) fail("CHECKPOINT_PLAN_INVALID");
  await acquireRanges(checkpoint, options.reuseRangeCache);
  await acquireBracket(checkpoint, "after", options.reuseBracketAfterDir);
}

async function acquire(options) {
  const workspace = path.resolve(".");
  const target = path.resolve(options.outputDir);
  const checkpoint = `${target}.source-checkpoint`;
  validateTarget(workspace, target, checkpoint);
  let sourceMoved = false;
  try {
    await acquireSource(checkpoint, options);
    if (sorted(readdirSync(checkpoint)).join("\0") ===
      ["files", "metadata", "range-acquisition.json", "range-plan.json",
        "ranges"].join("\0")) {
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializePlug93RecoveryArtifact(
          createPlug93RecoverySourceManifestFromDirectory(checkpoint)));
    }
    const built = buildPlug93RecoveryArtifactFromSourceDirectory(checkpoint, {
      pythonExecutable: options.pythonExecutable,
    });
    const manifestBytes = serializePlug93RecoveryArtifact(built.sourceManifest);
    const reportBytes = serializePlug93RecoveryArtifact(built.report);
    const receipt = createPlug93RecoveryReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializePlug93RecoveryArtifact(receipt));
    const checked = verifyPlug93RecoveryArtifactDirectory(target, {
      pythonExecutable: options.pythonExecutable,
    });
    if (!checked.ok) fail("PUBLISHED_ARTIFACT_REPLAY_FAILED", checked.error);
    process.stdout.write(`${JSON.stringify({ ok: true, outputDir: target,
      artifactHash: checked.report.artifactHash,
      receiptHash: checked.receipt.receiptHash })}\n`);
  } catch (error) {
    if (sourceMoved && existsSync(path.join(target, "source"))
      && !existsSync(checkpoint)) {
      renameSync(path.join(target, "source"), checkpoint);
    }
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    throw error;
  }
}

await acquire(parseArgs(process.argv.slice(2)));
