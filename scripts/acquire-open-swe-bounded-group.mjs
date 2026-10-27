#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, createReadStream, existsSync, fstatSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync,
  writeFileSync, writeSync,
} from "node:fs";
import path from "node:path";

const DATASET_ID = "nvidia/Open-SWE-Traces";
const REVISION = "dfc5bbcc46b36de773b68e286e59e537ab41d379";
const DEFAULT_OUTPUT =
  "artifacts/outsider-open-swe-bounded-group-20260829-v1";
const BLOCK_BYTES = 1_048_576;
const PARTITION = "data/sweagent/qwen35_122b/swe-rebench-v2";
const FILES = Object.freeze([
  { ordinal: 0, size: 234_461_442, sha256: "56958e94dced93728952f86ee955a4090513784e59f4c04a438398c07cf0bf41", blocks: [0, 212_860_928, 233_832_448] },
  { ordinal: 1, size: 230_946_933, sha256: "c02dd1bd39d96e1c2958aeadb1b821177c2d6ed91f68fb391fdfd843e99fe509", full: true },
  { ordinal: 2, size: 241_786_701, sha256: "85d36393dd69306c2d75b05b9740c02118ecbd20a8354ed40e97f75c6bb182d1", blocks: [0, 212_860_928, 241_172_480] },
  { ordinal: 3, size: 235_349_716, sha256: "9143dbc2d66ac65215ace43839c172917d8677118c179dc0f466d19338d64e8d", blocks: [0, 212_860_928, 234_881_024] },
  { ordinal: 4, size: 233_470_814, sha256: "2c34be8461c624fc248c52e354a6ab926a939708c3b447312916ab1b211a9e67", blocks: [0, 212_860_928, 232_783_872] },
  { ordinal: 5, size: 235_480_561, sha256: "5769771db79163f4f26e3772681edf31f681e56f980427c5b162701592aeaa45", blocks: [0, 212_860_928, 234_881_024] },
  { ordinal: 6, size: 243_578_790, sha256: "3d6ae2db9c68b1ee8f607c234535ea904ae3f4986f932737ef61cd3ae36e73fd", blocks: [0, 217_055_232, 243_269_632] },
  { ordinal: 7, size: 243_808_405, sha256: "979f2ae69918c17f66cab0f6adbfa2fffbd8d25f87276df2147b4b66c070d808", blocks: [0, 222_298_112, 243_269_632] },
  { ordinal: 8, size: 32_649_682, sha256: "4fe7805a22d42b9903419b5a0aa9e12a52c34c7f3e21590c7909b1bbecf1c9f9", full: true },
].map((entry) => Object.freeze({
  ...entry,
  path: `${PARTITION}/train-${String(entry.ordinal).padStart(5, "0")}-of-00009.parquet`,
})));

function fail(code, detail = null) {
  throw new Error(detail === null ? `OPEN_SWE_ACQUIRE_${code}`
    : `OPEN_SWE_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, sourceOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argv[index] === "--source-only") result.sourceOnly = true;
    else if (argv[index] === "--help" || argv[index] === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-open-swe-bounded-group.mjs [--output-dir <new-dir>] [--source-only]",
        "",
        "Acquires an exact two-trajectory mixed-outcome group plus bounded",
        "column-range closure proofs from a fixed Open-SWE-Traces revision.",
      ].join("\n") + "\n");
      process.exit(0);
    } else fail("ARGUMENT_INVALID", argv[index]);
  }
  return result;
}

function mkdirPrivate(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function ensureParents(file, stop) {
  const missing = [];
  let cursor = path.dirname(file);
  while (cursor !== stop && !existsSync(cursor)) {
    missing.push(cursor);
    cursor = path.dirname(cursor);
  }
  for (const directory of missing.reverse()) mkdirPrivate(directory);
}

function validateTarget(workspace, target, checkpoint) {
  const relation = path.relative(workspace, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation) || existsSync(target)) {
    fail("OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE", target);
  }
  ensureParents(target, workspace);
  if (existsSync(checkpoint)) {
    const status = lstatSync(checkpoint);
    if (!status.isDirectory() || status.isSymbolicLink()
      || (status.mode & 0o777) !== 0o700) fail("CHECKPOINT_UNSAFE");
  } else mkdirPrivate(checkpoint);
}

function sourceUrl(relative, mode = "resolve") {
  const encoded = DATASET_ID.split("/").map(encodeURIComponent).join("/");
  return `https://huggingface.co/datasets/${encoded}/${mode}/${REVISION}/${relative}`;
}

async function retry(operation, code) {
  let last;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      last = error;
      if (attempt < 7) await new Promise((resolve) => setTimeout(resolve,
        Math.min(8_000, 500 * (2 ** attempt))));
    }
  }
  fail(code, last?.message ?? "unknown");
}

async function fetchSmall(url, maximumBytes) {
  return retry(async () => {
    const response = await fetch(url, { headers: {
      "Accept-Encoding": "identity", "User-Agent": "outsider-open-swe/1.0",
    }, redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1 || bytes.length > maximumBytes) {
      throw new Error(`SIZE_${bytes.length}`);
    }
    return bytes;
  }, "SMALL_DOWNLOAD_FAILED");
}

async function downloadSmall(file, url, maximumBytes) {
  if (existsSync(file)) return;
  const bytes = await fetchSmall(url, maximumBytes);
  writePrivate(file, bytes);
}

async function signedLocation(entry) {
  const url = `${sourceUrl(entry.path)}?download=true`;
  return retry(async () => {
    const response = await fetch(url, { method: "HEAD", redirect: "manual",
      headers: { "Accept-Encoding": "identity",
        "User-Agent": "outsider-open-swe/1.0" } });
    if (response.status !== 302
      || response.headers.get("x-repo-commit") !== REVISION
      || Number(response.headers.get("x-linked-size")) !== entry.size
      || response.headers.get("x-linked-etag")?.replaceAll('"', "") !== entry.sha256) {
      throw new Error(`PIN_HEADERS_${response.status}`);
    }
    const location = response.headers.get("location");
    const parsed = new URL(location);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password
      || !(parsed.hostname.endsWith(".hf.co")
        || parsed.hostname.endsWith(".huggingface.co"))) {
      throw new Error("SIGNED_LOCATION_INVALID");
    }
    return location;
  }, "SIGNED_LOCATION_FAILED");
}

async function rangeBytes(location, start, end, total) {
  return retry(async () => {
    const response = await fetch(location, { headers: {
      Range: `bytes=${start}-${end}`, "Accept-Encoding": "identity",
      "User-Agent": "outsider-open-swe/1.0",
    }, redirect: "error" });
    const expected = end - start + 1;
    if (response.status !== 206
      || response.headers.get("content-range") !== `bytes ${start}-${end}/${total}`
      || Number(response.headers.get("content-length")) !== expected) {
      throw new Error(`RANGE_HEADERS_${start}_${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== expected) throw new Error(`RANGE_SIZE_${start}`);
    return bytes;
  }, "RANGE_DOWNLOAD_FAILED");
}

async function sha256File(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function downloadFull(root, entry) {
  const destination = path.join(root, "files", entry.path);
  ensureParents(destination, root);
  if (existsSync(destination)) {
    const status = lstatSync(destination);
    if (status.isFile() && !status.isSymbolicLink() && status.size === entry.size
      && await sha256File(destination) === entry.sha256) return;
    fail("EXISTING_FULL_FILE_INVALID", entry.path);
  }
  const chunkDirectory = path.join(root, ".chunks", String(entry.ordinal));
  mkdirPrivate(path.join(root, ".chunks"));
  mkdirPrivate(chunkDirectory);
  const location = await signedLocation(entry);
  const starts = [];
  for (let start = 0; start < entry.size; start += BLOCK_BYTES) starts.push(start);
  let cursor = 0;
  const workers = Array.from({ length: 8 }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= starts.length) return;
      const start = starts[index];
      const end = Math.min(entry.size - 1, start + BLOCK_BYTES - 1);
      const part = path.join(chunkDirectory,
        `${String(start).padStart(12, "0")}.bin`);
      if (existsSync(part)) {
        const status = lstatSync(part);
        if (status.isFile() && !status.isSymbolicLink()
          && status.size === end - start + 1) continue;
        fail("EXISTING_CHUNK_INVALID", part);
      }
      writePrivate(part, await rangeBytes(location, start, end, entry.size));
    }
  });
  await Promise.all(workers);
  const temporary = `${destination}.part-${process.pid}-${randomBytes(4).toString("hex")}`;
  const descriptor = openSync(temporary, "wx", 0o600);
  const hash = createHash("sha256");
  try {
    for (const start of starts) {
      const part = path.join(chunkDirectory,
        `${String(start).padStart(12, "0")}.bin`);
      const bytes = readFileSync(part);
      const expected = Math.min(BLOCK_BYTES, entry.size - start);
      if (bytes.length !== expected) fail("CHUNK_SIZE_CHANGED", part);
      writeSync(descriptor, bytes, 0, bytes.length, start);
      hash.update(bytes);
    }
    const status = fstatSync(descriptor);
    if (status.size !== entry.size || hash.digest("hex") !== entry.sha256) {
      fail("FULL_FILE_HASH_INVALID", entry.path);
    }
  } finally { closeSync(descriptor); }
  chmodSync(temporary, 0o600);
  renameSync(temporary, destination);
  rmSync(chunkDirectory, { recursive: true, force: true });
}

async function downloadProofRanges(root, entry) {
  const missing = [];
  for (const start of entry.blocks) {
    const end = Math.min(entry.size - 1, start + BLOCK_BYTES - 1);
    const destination = path.join(root, "proof-ranges",
      String(entry.ordinal), `${String(start).padStart(12, "0")}.bin`);
    ensureParents(destination, root);
    if (existsSync(destination)) {
      const status = lstatSync(destination);
      if (status.isFile() && !status.isSymbolicLink()
        && status.size === end - start + 1) continue;
      fail("EXISTING_PROOF_RANGE_INVALID", destination);
    }
    missing.push({ start, end, destination });
  }
  if (missing.length === 0) return;
  const location = await signedLocation(entry);
  for (const { start, end, destination } of missing) {
    writePrivate(destination,
      await rangeBytes(location, start, end, entry.size));
  }
}

const encodedId = DATASET_ID.split("/").map(encodeURIComponent).join("/");
const api = `https://huggingface.co/api/datasets/${encodedId}`;
const recordUrl = `${api}/revision/${REVISION}`;
const treeUrl = `${api}/tree/${REVISION}?recursive=true&limit=1000`;

async function acquireSource(root) {
  mkdirPrivate(path.join(root, "metadata"));
  mkdirPrivate(path.join(root, "files"));
  await downloadSmall(path.join(root, "metadata/dataset-record-before.json"),
    recordUrl, 4 * 1024 * 1024);
  await downloadSmall(path.join(root, "metadata/full-tree-before.json"),
    treeUrl, 4 * 1024 * 1024);
  await downloadSmall(path.join(root, "files/.gitattributes"),
    sourceUrl(".gitattributes", "raw"), 64 * 1024);
  await downloadSmall(path.join(root, "files/README.md"),
    sourceUrl("README.md", "raw"), 2 * 1024 * 1024);
  for (const entry of FILES.filter((item) => item.full)) {
    await downloadFull(root, entry);
  }
  for (const entry of FILES.filter((item) => !item.full)) {
    await downloadProofRanges(root, entry);
  }
  if (existsSync(path.join(root, ".chunks"))) {
    const names = readdirSync(path.join(root, ".chunks"));
    if (names.length !== 0) fail("INCOMPLETE_CHUNK_CHECKPOINT");
    rmSync(path.join(root, ".chunks"), { recursive: true, force: true });
  }
  await downloadSmall(path.join(root, "metadata/full-tree-after.json"),
    treeUrl, 4 * 1024 * 1024);
  await downloadSmall(path.join(root, "metadata/dataset-record-after.json"),
    recordUrl, 4 * 1024 * 1024);
}

async function main(options) {
  const workspace = path.resolve(".");
  const target = path.resolve(options.outputDir);
  const checkpoint = `${target}.source-checkpoint`;
  validateTarget(workspace, target, checkpoint);
  await acquireSource(checkpoint);
  if (options.sourceOnly) {
    process.stdout.write(`${JSON.stringify({ ok: true, sourceOnly: true,
      checkpoint })}\n`);
    return;
  }
  let sourceMoved = false;
  try {
    const module = await import("../src/outsider-open-swe-bounded-group.js");
    if (readdirSync(checkpoint).sort().join("\0")
      === ["files", "metadata", "proof-ranges"].sort().join("\0")) {
      const manifest = module.createOpenSweBoundedGroupSourceManifestFromDirectory(
        checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        module.serializeOpenSweBoundedGroupArtifact(manifest));
    }
    const built = module.buildOpenSweBoundedGroupArtifactFromSourceDirectory(
      checkpoint);
    const manifestBytes = module.serializeOpenSweBoundedGroupArtifact(
      built.sourceManifest);
    const reportBytes = module.serializeOpenSweBoundedGroupArtifact(built.report);
    const receipt = module.createOpenSweBoundedGroupReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      module.serializeOpenSweBoundedGroupArtifact(receipt));
    const checked = module.verifyOpenSweBoundedGroupArtifactDirectory(target);
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

await main(parseArgs(process.argv.slice(2)));
