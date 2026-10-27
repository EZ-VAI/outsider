#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, createReadStream, createWriteStream, existsSync,
  fchmodSync, fstatSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import {
  PUBLIC_AGENT_PINS,
  buildPublicAgentAcquisitionManifest,
  buildPublicAgentProvenanceProof,
  normalizeComputerAgentArenaRow,
  normalizeNebiusOpenHandsRow,
  normalizeOpenHandsFeedbackRow,
  normalizeTraceLabSession,
  parseComputerAgentArenaSessionsCsv,
  publicAgentDigest,
  summarizePublicAgentRecords,
  traceLabUserTurnCount,
  verifyPublicAgentAcquisitionManifest,
  verifyPublicAgentRecord,
} from "../src/outsider-public-agent-corpus.js";
import { PUBLIC_AGENT_SOURCE_OBJECT_PINS, verifyPublicAgentArtifactsAgainstSource } from
  "../src/outsider-public-agent-artifacts.js";

const DEFAULT_OUTPUT = "artifacts/public-agent-corpus-20260820";
const HF_ROWS = "https://datasets-server.huggingface.co/rows";
const OPENHANDS_TOTAL = 275;
const NEBIUS_TOTAL = 67074;
const NEBIUS_QUOTA = 100;

function parseArgs(argv) {
  const args = { outputDir: DEFAULT_OUTPUT, acquire: true, finalize: true,
    normalizeRowsOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output-dir" && argv[index + 1]) args.outputDir = argv[++index];
    else if (value === "--acquire-only") args.finalize = false;
    else if (value === "--finalize-only") args.acquire = false;
    else if (value === "--normalize-rows-only") {
      args.acquire = false; args.finalize = false; args.normalizeRowsOnly = true;
    }
    else if (value === "--help" || value === "-h") {
      args.help = true;
    } else throw new Error(`PUBLIC_AGENT_ARGUMENT_INVALID:${value}`);
  }
  return args;
}

const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function ensurePrivateRoot(directory, trustedAncestor = process.cwd()) {
  const absolute = resolve(directory);
  const ancestor = resolve(trustedAncestor);
  const ancestorStat = lstatSync(ancestor, { bigint: true });
  if (ancestorStat.isSymbolicLink() || !ancestorStat.isDirectory()) {
    throw new Error(`PUBLIC_AGENT_TRUSTED_ANCESTOR_UNSAFE:${ancestor}`);
  }
  const rootRelative = relative(ancestor, absolute);
  if (rootRelative === ".." || rootRelative.startsWith(`..${sep}`)
    || isAbsolute(rootRelative)) {
    throw new Error(`PUBLIC_AGENT_OUTPUT_ROOT_OUTSIDE_TRUSTED_ANCESTOR:${absolute}`);
  }
  let cursor = ancestor;
  for (const segment of rootRelative.split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    if (existsSync(cursor)) {
      const candidate = lstatSync(cursor);
      if (candidate.isSymbolicLink() || !candidate.isDirectory()) {
        throw new Error(`PUBLIC_AGENT_DIRECTORY_UNSAFE:${cursor}`);
      }
    } else mkdirSync(cursor, { mode: 0o700 });
  }
  const stat = lstatSync(absolute, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`PUBLIC_AGENT_DIRECTORY_UNSAFE:${absolute}`);
  }
  chmodSync(absolute, 0o700);
  const ancestorAfter = lstatSync(ancestor, { bigint: true });
  if (ancestorAfter.isSymbolicLink() || ancestorAfter.dev !== ancestorStat.dev
    || ancestorAfter.ino !== ancestorStat.ino) {
    throw new Error(`PUBLIC_AGENT_TRUSTED_ANCESTOR_CHANGED:${ancestor}`);
  }
  return { absolute, dev: stat.dev, ino: stat.ino, trustedAncestor: ancestor };
}

function ensurePrivateDirectory(directory, outputRoot, trustedAncestor = process.cwd()) {
  const root = ensurePrivateRoot(outputRoot, trustedAncestor);
  const absolute = resolve(directory);
  const relativePath = relative(root.absolute, absolute);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)) {
    throw new Error(`PUBLIC_AGENT_PATH_OUTSIDE_OUTPUT_ROOT:${absolute}`);
  }
  let cursor = root.absolute;
  for (const segment of relativePath.split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    if (existsSync(cursor)) {
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`PUBLIC_AGENT_DIRECTORY_UNSAFE:${cursor}`);
      }
    } else mkdirSync(cursor, { mode: 0o700 });
    chmodSync(cursor, 0o700);
  }
  const after = lstatSync(root.absolute, { bigint: true });
  if (after.isSymbolicLink() || !after.isDirectory()
    || after.dev !== root.dev || after.ino !== root.ino) {
    throw new Error(`PUBLIC_AGENT_OUTPUT_ROOT_CHANGED:${root.absolute}`);
  }
  return root;
}

function safeReadFile(file) {
  const absolute = resolve(file);
  const initial = lstatSync(absolute, { bigint: true });
  if (initial.isSymbolicLink() || !initial.isFile()) {
    throw new Error(`PUBLIC_AGENT_FILE_UNSAFE:${absolute}`);
  }
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || initial.dev !== before.dev || initial.ino !== before.ino
      || before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || bytes.length !== Number(before.size)) {
      throw new Error(`PUBLIC_AGENT_FILE_CHANGED_DURING_READ:${absolute}`);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function safeFileSize(file) {
  const absolute = resolve(file);
  const initial = lstatSync(absolute, { bigint: true });
  if (initial.isSymbolicLink() || !initial.isFile()) {
    throw new Error(`PUBLIC_AGENT_FILE_UNSAFE:${absolute}`);
  }
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || initial.dev !== opened.dev || initial.ino !== opened.ino
      || initial.size !== opened.size || initial.mtimeNs !== opened.mtimeNs
      || initial.ctimeNs !== opened.ctimeNs) {
      throw new Error(`PUBLIC_AGENT_FILE_IDENTITY_CHANGED:${absolute}`);
    }
    return Number(opened.size);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writePrivateFile(file, value, outputRoot, trustedAncestor = process.cwd()) {
  const absolute = resolve(file);
  ensurePrivateDirectory(dirname(absolute), outputRoot, trustedAncestor);
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  if (existsSync(absolute)) {
    const existing = safeReadFile(absolute);
    if (!existing.equals(bytes)) throw new Error(`PUBLIC_AGENT_OUTPUT_EXISTS:${absolute}`);
    chmodSync(absolute, 0o600);
    return;
  }
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    writeFileSync(descriptor, bytes);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function privateWriteStream(file, outputRoot, trustedAncestor = process.cwd()) {
  const absolute = resolve(file);
  ensurePrivateDirectory(dirname(absolute), outputRoot, trustedAncestor);
  const descriptor = openSync(absolute, constants.O_WRONLY | constants.O_CREAT
    | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  return createWriteStream(absolute, { fd: descriptor, autoClose: true });
}

function inspectFile(path, { outputRoot = null, trustedAncestor = process.cwd(),
  makePrivate = false } = {}) {
  return new Promise((resolveHash, reject) => {
    const absolute = resolve(path);
    const root = outputRoot == null ? null
      : ensurePrivateDirectory(dirname(absolute), outputRoot, trustedAncestor);
    const initial = lstatSync(absolute, { bigint: true });
    if (initial.isSymbolicLink() || !initial.isFile()) {
      reject(new Error(`PUBLIC_AGENT_FILE_UNSAFE:${absolute}`));
      return;
    }
    let descriptor;
    try {
      descriptor = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch (error) { reject(error); return; }
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || initial.dev !== before.dev || initial.ino !== before.ino) {
      closeSync(descriptor);
      reject(new Error(`PUBLIC_AGENT_FILE_IDENTITY_CHANGED:${absolute}`));
      return;
    }
    const hash = createHash("sha256");
    const stream = createReadStream(absolute, { fd: descriptor, autoClose: false });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", (error) => { closeSync(descriptor); reject(error); });
    stream.on("end", () => {
      try {
        const after = fstatSync(descriptor, { bigint: true });
        if (before.dev !== after.dev || before.ino !== after.ino
          || before.size !== after.size || before.mtimeNs !== after.mtimeNs
          || before.ctimeNs !== after.ctimeNs) {
          throw new Error(`PUBLIC_AGENT_FILE_CHANGED_DURING_READ:${absolute}`);
        }
        if (makePrivate) fchmodSync(descriptor, 0o600);
        const pathname = lstatSync(absolute, { bigint: true });
        if (pathname.isSymbolicLink() || pathname.dev !== after.dev
          || pathname.ino !== after.ino) {
          throw new Error(`PUBLIC_AGENT_FILE_PATH_CHANGED:${absolute}`);
        }
        if (root) {
          const rootAfter = lstatSync(root.absolute, { bigint: true });
          if (rootAfter.isSymbolicLink() || rootAfter.dev !== root.dev
            || rootAfter.ino !== root.ino) {
            throw new Error(`PUBLIC_AGENT_OUTPUT_ROOT_CHANGED:${root.absolute}`);
          }
        }
        resolveHash({ sha256: `sha256:${hash.digest("hex")}`,
          sizeBytes: Number(after.size) });
      } catch (error) { reject(error); }
      finally { closeSync(descriptor); }
    });
  });
}

async function hashFile(path) {
  return (await inspectFile(path)).sha256;
}

export async function fetchToFile(url, target,
  { expectedSha256 = null, expectedBytes = null, outputRoot = null,
    trustedAncestor = process.cwd() } = {}) {
  if (typeof outputRoot !== "string" || outputRoot.length === 0) {
    throw new Error("PUBLIC_AGENT_OUTPUT_ROOT_REQUIRED");
  }
  const absoluteTarget = resolve(target);
  ensurePrivateDirectory(dirname(absoluteTarget), outputRoot, trustedAncestor);
  if (!existsSync(absoluteTarget)) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const partial = `${absoluteTarget}.partial.${process.pid}.${attempt}.${
        randomBytes(8).toString("hex")}`;
      try {
        const response = await fetch(url, { redirect: "follow",
          headers: { "user-agent": "outsider-public-agent-intake/1.0" },
          signal: AbortSignal.timeout(15 * 60 * 1000) });
        if (!response.ok || !response.body) throw new Error(`HTTP_${response.status}`);
        await pipeline(Readable.fromWeb(response.body),
          privateWriteStream(partial, outputRoot, trustedAncestor));
        ensurePrivateDirectory(dirname(absoluteTarget), outputRoot, trustedAncestor);
        linkSync(partial, absoluteTarget);
        unlinkSync(partial);
        lastError = null;
        break;
      } catch (error) {
        try {
          if (existsSync(partial) && !lstatSync(partial).isSymbolicLink()) unlinkSync(partial);
        } catch { /* the private partial is best-effort cleanup only */ }
        lastError = error;
        if (attempt === 3) throw new Error(`PUBLIC_AGENT_FETCH_FAILED:${url}:${error.message}`);
      }
    }
    if (lastError) throw lastError;
  }
  const inspected = await inspectFile(absoluteTarget,
    { outputRoot, trustedAncestor, makePrivate: true });
  const { sizeBytes } = inspected;
  const objectHash = inspected.sha256;
  if (expectedBytes != null && sizeBytes !== expectedBytes) {
    throw new Error(`PUBLIC_AGENT_SIZE_MISMATCH:${target}:${sizeBytes}:${expectedBytes}`);
  }
  if (expectedSha256 != null && objectHash !== expectedSha256) {
    throw new Error(`PUBLIC_AGENT_SHA256_MISMATCH:${target}`);
  }
  return { path: absoluteTarget, sizeBytes, sha256: objectHash, url };
}

function jsonFile(path) {
  return JSON.parse(safeReadFile(path).toString("utf8"));
}

function hfRepoApi(id) {
  return `https://huggingface.co/api/datasets/${id}`;
}

function hfRaw(id, revision, path) {
  return `https://huggingface.co/datasets/${id}/resolve/${revision}/${path}?download=true`;
}

function rowsUrl(id, offset, length) {
  const query = new URLSearchParams({ dataset: id, config: "default", split: "train",
    offset: String(offset), length: String(length) });
  return `${HF_ROWS}?${query}`;
}

function requireRepoPin(path, pin) {
  const metadata = jsonFile(path);
  if (metadata.id !== pin.id || metadata.sha !== pin.revision) {
    throw new Error(`PUBLIC_AGENT_REPO_PIN_MISMATCH:${pin.id}`);
  }
  return metadata;
}

async function acquireCAAProvenance(sourceDir) {
  const pin = PUBLIC_AGENT_PINS.computerAgentArena;
  const directory = join(sourceDir, "computer-agent-arena");
  const files = PUBLIC_AGENT_SOURCE_OBJECT_PINS.computerAgentArenaProvenance;
  const expected = (value) => ({ expectedBytes: value.sizeBytes,
    expectedSha256: value.sha256, outputRoot: sourceDir });
  return Promise.all([
    fetchToFile(`https://huggingface.co/api/datasets/${pin.id}/revision/${pin.revision}`,
      join(directory, "repository-revision.json"),
      expected(files["computer-agent-arena/repository-revision.json"])),
    fetchToFile(`https://huggingface.co/api/datasets/${pin.id}/tree/${pin.revision}?recursive=true&expand=true`,
      join(directory, "repository-tree.json"),
      expected(files["computer-agent-arena/repository-tree.json"])),
    fetchToFile(hfRaw(pin.id, pin.revision, "README.md"), join(directory, "README.md"),
      expected(files["computer-agent-arena/README.md"])),
  ]);
}

async function acquireTraceLabProvenance(sourceDir) {
  const pin = PUBLIC_AGENT_PINS.traceLab;
  const files = PUBLIC_AGENT_SOURCE_OBJECT_PINS.traceLabProvenance;
  const expected = (value) => ({ expectedBytes: value.sizeBytes,
    expectedSha256: value.sha256, outputRoot: sourceDir });
  const urls = {
    "tracelab.commit.json": `https://api.github.com/repos/uw-syfi/TraceLab/git/commits/${pin.revision}`,
    "tracelab.tag-v0.0.1.json": `https://api.github.com/repos/uw-syfi/TraceLab/git/ref/tags/${pin.release}`,
    "tracelab.release-v0.0.1.json": `https://api.github.com/repos/uw-syfi/TraceLab/releases/tags/${pin.release}`,
    "tracelab.README.md": `https://raw.githubusercontent.com/uw-syfi/TraceLab/${pin.revision}/README.md`,
    "tracelab.LICENSE-DATASET.md": `https://raw.githubusercontent.com/uw-syfi/TraceLab/${pin.revision}/LICENSE-DATASET.md`,
    "tracelab.NOTICE": `https://raw.githubusercontent.com/uw-syfi/TraceLab/${pin.revision}/NOTICE`,
  };
  return Promise.all(Object.entries(urls).map(([name, url]) =>
    fetchToFile(url, join(sourceDir, name), expected(files[name]))));
}

async function acquireOpenHands(sourceDir) {
  const pin = PUBLIC_AGENT_PINS.openhandsFeedback;
  const repoPath = join(sourceDir, "openhands-feedback.repo.json");
  const readmePath = join(sourceDir, "openhands-feedback.README.md");
  const repoObject = await fetchToFile(hfRepoApi(pin.id), repoPath, { outputRoot: sourceDir });
  requireRepoPin(repoPath, pin);
  const readmeObject = await fetchToFile(hfRaw(pin.id, pin.revision, "README.md"), readmePath,
    { outputRoot: sourceDir });
  const requests = [];
  for (let offset = 0; offset < OPENHANDS_TOTAL; offset += 100) {
    const length = Math.min(100, OPENHANDS_TOTAL - offset);
    const path = join(sourceDir,
      `openhands-feedback.rows-${String(offset).padStart(3, "0")}-${String(offset + length - 1).padStart(3, "0")}.json`);
    requests.push({ offset, length, path });
  }
  const pages = await Promise.all(requests.map(async ({ offset, length, path }) => {
    const object = await fetchToFile(rowsUrl(pin.id, offset, length), path,
      { outputRoot: sourceDir });
    const page = jsonFile(path);
    if (page.partial !== false || page.num_rows_total !== OPENHANDS_TOTAL
      || !Array.isArray(page.rows) || page.rows.length !== length
      || page.rows.some((item) => Array.isArray(item.truncated_cells)
        && item.truncated_cells.length > 0)) {
      throw new Error(`PUBLIC_AGENT_OPENHANDS_PAGE_INCOMPLETE:${offset}`);
    }
    return { ...object, offset, length };
  }));
  const afterPath = join(sourceDir, "openhands-feedback.repo-after.json");
  const after = await fetchToFile(hfRepoApi(pin.id), afterPath, { outputRoot: sourceDir });
  requireRepoPin(afterPath, pin);
  return { repoObject, readmeObject, after, pages };
}

function nebiusOffsets() {
  const windows = 40;
  const width = 10;
  return Array.from({ length: windows }, (_, index) =>
    Math.floor(index * (NEBIUS_TOTAL - width) / (windows - 1)));
}

async function acquireNebius(sourceDir) {
  const pin = PUBLIC_AGENT_PINS.nebiusOpenHands;
  const repoPath = join(sourceDir, "nebius-openhands.repo.json");
  const readmePath = join(sourceDir, "nebius-openhands.README.md");
  const licensePath = join(sourceDir, "nebius-openhands.LICENSE");
  const repoObject = await fetchToFile(hfRepoApi(pin.id), repoPath, { outputRoot: sourceDir });
  requireRepoPin(repoPath, pin);
  const readmeObject = await fetchToFile(hfRaw(pin.id, pin.revision, "README.md"), readmePath,
    { outputRoot: sourceDir });
  const licenseObject = await fetchToFile(hfRaw(pin.id, pin.revision, "LICENSE"), licensePath,
    { outputRoot: sourceDir });
  const selected = { resolved: [], unresolved: [] };
  const pageObjects = [];
  const offsets = nebiusOffsets();
  for (let start = 0; start < offsets.length; start += 8) {
    const batch = await Promise.all(offsets.slice(start, start + 8).map(async (offset) => {
      const path = join(sourceDir, `nebius.rows-${String(offset).padStart(5, "0")}.json`);
      const object = await fetchToFile(rowsUrl(pin.id, offset, 10), path,
        { outputRoot: sourceDir });
      const page = jsonFile(path);
      if (page.partial !== false || page.num_rows_total !== NEBIUS_TOTAL
        || !Array.isArray(page.rows) || page.rows.length !== 10
        || page.rows.some((item) => Array.isArray(item.truncated_cells)
          && item.truncated_cells.length > 0)) {
        throw new Error(`PUBLIC_AGENT_NEBIUS_PAGE_INCOMPLETE:${offset}`);
      }
      return { offset, path, object, page };
    }));
    for (const { offset, path, object, page } of batch.sort((a, b) => a.offset - b.offset)) {
      pageObjects.push({ ...object, offset, length: 10 });
      for (const item of page.rows) {
        const bucket = Number(item.row?.resolved) === 1 ? selected.resolved : selected.unresolved;
        if (bucket.length < NEBIUS_QUOTA) bucket.push({ row_idx: item.row_idx, row: item.row,
          sourceObjectHash: object.sha256, sourcePath: relative(sourceDir, path) });
      }
    }
    if (selected.resolved.length >= NEBIUS_QUOTA
      && selected.unresolved.length >= NEBIUS_QUOTA) break;
  }
  if (selected.resolved.length < NEBIUS_QUOTA || selected.unresolved.length < NEBIUS_QUOTA) {
    throw new Error(`PUBLIC_AGENT_NEBIUS_QUOTA_MISSING:${selected.resolved.length}:${selected.unresolved.length}`);
  }
  const selectionPath = join(sourceDir, "nebius-stratified-selection.json");
  const selection = {
    schema: "outsider/public-agent-nebius-sampling/v1",
    populationRows: NEBIUS_TOTAL,
    rule: "forty-evenly-spaced-index-windows-width-10; retain first 100 rows per resolved class",
    rowsApiRevisionBinding: "repository SHA checked before and after; API rows are not an independent proof of the pinned Parquet LFS object",
    prevalenceEligible: false,
    quota: { resolved: NEBIUS_QUOTA, unresolved: NEBIUS_QUOTA },
    selected: [...selected.resolved, ...selected.unresolved]
      .sort((left, right) => left.row_idx - right.row_idx),
  };
  if (existsSync(selectionPath)) {
    const existing = jsonFile(selectionPath);
    if (publicAgentDigest(existing) !== publicAgentDigest(selection)) {
      throw new Error("PUBLIC_AGENT_NEBIUS_SELECTION_CHANGED");
    }
  } else writePrivateFile(selectionPath, `${JSON.stringify(selection)}\n`, sourceDir);
  const selectionObject = await fetchToFile(`local://${relative(process.cwd(), selectionPath)}`,
    selectionPath, { outputRoot: sourceDir });
  const afterPath = join(sourceDir, "nebius-openhands.repo-after.json");
  const after = await fetchToFile(hfRepoApi(pin.id), afterPath, { outputRoot: sourceDir });
  requireRepoPin(afterPath, pin);
  return { repoObject, readmeObject, licenseObject, after, pageObjects,
    selectionObject, selection };
}

async function normalizeOpenHands(sourceDir, outputDir) {
  const output = join(outputDir, "normalized-openhands-feedback.jsonl");
  const stream = privateWriteStream(output, outputDir);
  const records = [];
  for (let offset = 0; offset < OPENHANDS_TOTAL; offset += 100) {
    const length = Math.min(100, OPENHANDS_TOTAL - offset);
    const path = join(sourceDir,
      `openhands-feedback.rows-${String(offset).padStart(3, "0")}-${String(offset + length - 1).padStart(3, "0")}.json`);
    const sourceObjectHash = await hashFile(path);
    for (const item of jsonFile(path).rows) {
      const record = normalizeOpenHandsFeedbackRow(item.row,
        { rowIndex: item.row_idx, sourceObjectHash });
      records.push(record);
      stream.write(`${JSON.stringify(record)}\n`);
    }
  }
  await new Promise((resolveDone) => stream.end(resolveDone));
  return records;
}

async function normalizeNebius(sourceDir, outputDir) {
  const selection = jsonFile(join(sourceDir, "nebius-stratified-selection.json"));
  const records = selection.selected.map((item) => normalizeNebiusOpenHandsRow(item.row,
    { rowIndex: item.row_idx, sourceObjectHash: item.sourceObjectHash }));
  writePrivateFile(join(outputDir, "normalized-nebius-openhands.jsonl"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, outputDir);
  return records;
}

function descriptiveStats(records) {
  const mean = (field) => records.length === 0 ? null
    : records.reduce((sum, record) => sum + record.episode[field], 0) / records.length;
  return { records: records.length, meanSteps: mean("stepCount"),
    meanToolCalls: mean("toolCallCount"), meanToolResults: mean("toolResultCount"),
    meanLexicalErrorMentions: mean("errorCount") };
}

async function normalizeRowsOnly(sourceDir, outputDir) {
  const openhands = await normalizeOpenHands(sourceDir, outputDir);
  const nebius = await normalizeNebius(sourceDir, outputDir);
  const groups = (records) => Object.fromEntries([...new Set(records.map((record) =>
    String(record.labels.nativeOutcomeValue)))].sort().map((value) => [value,
    descriptiveStats(records.filter((record) => String(record.labels.nativeOutcomeValue) === value))]));
  const body = {
    schema: "outsider/public-agent-partial-effect-summary/v1",
    schemaVersion: "1.0.0",
    datasets: {
      [PUBLIC_AGENT_PINS.openhandsFeedback.id]: { ...descriptiveStats(openhands),
        nativeOutcomeGroups: groups(openhands), sampling: "complete-275-logical-rows" },
      [PUBLIC_AGENT_PINS.nebiusOpenHands.id]: { ...descriptiveStats(nebius),
        nativeOutcomeGroups: groups(nebius),
        sampling: "case-control-100-resolved-100-unresolved-prevalence-invalid" },
    },
    interpretation: { descriptiveAssociationOnly: true, causalEffectClaimed: false,
      prevalenceValidForNebiusSample: false, economicLossRows: 0, pricingEligibleRows: 0 },
  };
  const summary = { ...body,
    summaryHash: publicAgentDigest(body, body.schema) };
  writePrivateFile(join(outputDir, "effect-summary-openhands-nebius.json"),
    `${JSON.stringify(summary, null, 2)}\n`, outputDir);
  return { schema: "outsider/public-agent-row-normalization-result/v1",
    records: openhands.length + nebius.length,
    counts: { openhands: openhands.length, nebius: nebius.length },
    summaryHash: summary.summaryHash,
    artifacts: ["normalized-openhands-feedback.jsonl", "normalized-nebius-openhands.jsonl",
      "effect-summary-openhands-nebius.json"] };
}

async function normalizeCAA(sourceDir, outputDir) {
  const path = join(sourceDir, "computer-agent-arena", "agent_arena_data.jsonl");
  const sessionsPath = join(sourceDir, "computer-agent-arena", "sessions.csv");
  if (!existsSync(path)) throw new Error("PUBLIC_AGENT_CAA_SOURCE_REQUIRED");
  const hash = await hashFile(path);
  if (hash !== PUBLIC_AGENT_PINS.computerAgentArena.upstreamObject.sha256
    || safeFileSize(path) !== PUBLIC_AGENT_PINS.computerAgentArena.upstreamObject.sizeBytes) {
    throw new Error("PUBLIC_AGENT_CAA_SOURCE_MISMATCH");
  }
  const input = readline.createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  const contexts = parseComputerAgentArenaSessionsCsv(safeReadFile(sessionsPath).toString("utf8"));
  const output = privateWriteStream(join(outputDir, "normalized-computer-agent-arena.jsonl"),
    outputDir);
  const records = [];
  let index = 0;
  for await (const line of input) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const correlation = contexts.get(String(row.task_id));
    if (!correlation) throw new Error(`PUBLIC_AGENT_CAA_SESSION_CONTEXT_MISSING:${row.task_id}`);
    const record = normalizeComputerAgentArenaRow(row,
      { rowIndex: index++, sourceObjectHash: hash, correlation });
    records.push(record);
    output.write(`${JSON.stringify(record)}\n`);
  }
  await new Promise((resolveDone) => output.end(resolveDone));
  return records;
}

function traceSessionId(row, index) {
  const candidate = row.session_id ?? row.sessionId ?? row.session ?? row.conversation_id
    ?? (typeof row.trace_key === "string" ? row.trace_key.split(":")[0] : null);
  return candidate == null ? `unkeyed-round-${index}` : String(candidate);
}

function traceTimestamp(row) {
  const candidates = [row.timestamp, row.started_at, row.round_started_at,
    ...(Array.isArray(row.timing_events) ? row.timing_events.map((event) =>
      event.timestamp ?? event.at ?? event.emitted_at) : [])];
  return candidates.map((value) => Date.parse(value ?? "")).find(Number.isFinite) ?? null;
}

async function normalizeTraceLab(sourceDir, outputDir) {
  const path = join(sourceDir, "syfi_coding_trace.jsonl.gz");
  if (!existsSync(path)) throw new Error("PUBLIC_AGENT_TRACELAB_SOURCE_REQUIRED");
  const hash = await hashFile(path);
  if (hash !== PUBLIC_AGENT_PINS.traceLab.upstreamObject.sha256
    || safeFileSize(path) !== PUBLIC_AGENT_PINS.traceLab.upstreamObject.sizeBytes) {
    throw new Error("PUBLIC_AGENT_TRACELAB_SOURCE_MISMATCH");
  }
  const lines = readline.createInterface({ input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity });
  const sessions = new Map();
  let index = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const sessionId = traceSessionId(row, index++);
    const item = sessions.get(sessionId) ?? { sessionId,
      userId: String(row.user ?? row.user_id ?? row.pseudonymous_user ?? "unknown"),
      roundCount: 0, toolCallCount: 0, toolResultCount: 0, errorCount: 0,
      userTurnCount: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0,
      providers: new Set(), minTime: null, maxTime: null };
    item.roundCount += 1;
    if (row.provider != null) item.providers.add(String(row.provider));
    const tools = Array.isArray(row.tools) ? row.tools : [];
    item.toolCallCount += tools.length;
    item.toolResultCount += tools.filter((tool) => tool?.result_chars != null
      || tool?.result_at != null).length;
    item.errorCount += tools.filter((tool) => tool?.is_error === true).length;
    item.userTurnCount += traceLabUserTurnCount(row);
    item.inputTokens += Number(row.input_tokens_total ?? row.input_tokens ?? 0) || 0;
    item.outputTokens += Number(row.output_tokens ?? 0) || 0;
    item.cachedInputTokens += Number(row.prefix_tokens ?? row.cache_read_input_tokens ?? 0) || 0;
    const time = traceTimestamp(row);
    if (time != null) {
      item.minTime = item.minTime == null ? time : Math.min(item.minTime, time);
      item.maxTime = item.maxTime == null ? time : Math.max(item.maxTime, time);
    }
    sessions.set(sessionId, item);
  }
  const records = [...sessions.values()].sort((a, b) => a.sessionId.localeCompare(b.sessionId))
    .map((item) => normalizeTraceLabSession({ ...item, providers: [...item.providers].sort(),
      durationMs: item.minTime == null || item.maxTime == null ? null : item.maxTime - item.minTime },
    { sourceObjectHash: hash }));
  writePrivateFile(join(outputDir, "normalized-tracelab.jsonl"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, outputDir);
  return records;
}

async function object(path, root, extras = {}) {
  return { path: relative(root, path), sizeBytes: safeFileSize(path),
    sha256: await hashFile(path), ...extras };
}

function license(pin, declarationUrl) {
  return { identifier: pin.licenseId, declarationUrl,
    adapterGrantsRights: false, attributionRequired: pin.licenseId === "CC-BY-4.0" };
}

async function finalize(outputDir) {
  const sourceDir = join(outputDir, "source");
  const sourceFiles = {
    caa: [join(sourceDir, "computer-agent-arena", "agent_arena_data.jsonl"),
      join(sourceDir, "computer-agent-arena", "sessions.csv"),
      join(sourceDir, "computer-agent-arena", "repository-revision.json"),
      join(sourceDir, "computer-agent-arena", "repository-tree.json"),
      join(sourceDir, "computer-agent-arena", "README.md")],
    trace: [join(sourceDir, "syfi_coding_trace.jsonl.gz"),
      ...Object.keys(PUBLIC_AGENT_SOURCE_OBJECT_PINS.traceLabProvenance)
        .map((name) => join(sourceDir, name))],
    openhands: [join(sourceDir, "openhands-feedback.repo.json"),
      join(sourceDir, "openhands-feedback.repo-after.json"),
      join(sourceDir, "openhands-feedback.README.md"),
      ...[0, 100, 200].map((offset) => join(sourceDir,
        `openhands-feedback.rows-${String(offset).padStart(3, "0")}-${String(Math.min(offset + 99, 274)).padStart(3, "0")}.json`))],
    nebius: [join(sourceDir, "nebius-openhands.repo.json"),
      join(sourceDir, "nebius-openhands.repo-after.json"),
      join(sourceDir, "nebius-openhands.README.md"), join(sourceDir, "nebius-openhands.LICENSE"),
      join(sourceDir, "nebius-stratified-selection.json")],
  };
  const missing = Object.values(sourceFiles).flat().filter((path) => !existsSync(path));
  if (missing.length) throw new Error(`PUBLIC_AGENT_FINALIZE_SOURCES_MISSING:${missing.join(",")}`);

  const sources = [
    { pin: PUBLIC_AGENT_PINS.computerAgentArena, files: sourceFiles.caa,
      licenseUrl: "https://huggingface.co/datasets/xlangai/computer-agent-arena/blob/897b9f45287c516a44f9e79879b14bc3c1bc5b0a/README.md",
      sampling: { kind: "complete-structured-trajectory-file", expectedRows: 4641,
        imagesDownloaded: false }, correlationPolicy: "same task root is dependent",
      proofPaths: {
        byteObjectPaths: ["source/computer-agent-arena/agent_arena_data.jsonl"],
        revisionObjectPaths: ["source/computer-agent-arena/repository-revision.json",
          "source/computer-agent-arena/repository-tree.json"],
        licenseObjectPaths: ["source/computer-agent-arena/README.md"],
      } },
    { pin: PUBLIC_AGENT_PINS.traceLab, files: sourceFiles.trace,
      licenseUrl: "https://github.com/uw-syfi/TraceLab/blob/fc061574a0f9700ccf88be33112adc8e86b425fa/LICENSE-DATASET.md",
      sampling: { kind: "complete-sanitized-jsonl-gzip", expectedRounds: 357161 },
      correlationPolicy: "same pseudonymous contributor root is dependent",
      proofPaths: {
        byteObjectPaths: ["source/syfi_coding_trace.jsonl.gz",
          "source/tracelab.release-v0.0.1.json"],
        revisionObjectPaths: ["source/tracelab.commit.json",
          "source/tracelab.release-v0.0.1.json", "source/tracelab.tag-v0.0.1.json"],
        licenseObjectPaths: ["source/tracelab.LICENSE-DATASET.md",
          "source/tracelab.NOTICE", "source/tracelab.README.md"],
      } },
    { pin: PUBLIC_AGENT_PINS.openhandsFeedback, files: sourceFiles.openhands,
      licenseUrl: "https://huggingface.co/datasets/OpenHands/openhands-feedback/blob/facf45600d625510b98222ec584a8c9ac59272a2/README.md",
      sampling: { kind: "complete-logical-rows-via-datasets-server", expectedRows: 275,
        revisionBinding: "repo SHA checked before/after; not independent Parquet inclusion proof" },
      correlationPolicy: "all rows share one public-submission collector root",
      proofPaths: {
        byteObjectPaths: ["source/openhands-feedback.rows-000-099.json",
          "source/openhands-feedback.rows-100-199.json",
          "source/openhands-feedback.rows-200-274.json"],
        revisionObjectPaths: ["source/openhands-feedback.repo-after.json",
          "source/openhands-feedback.repo.json"],
        licenseObjectPaths: ["source/openhands-feedback.README.md"],
      } },
    { pin: PUBLIC_AGENT_PINS.nebiusOpenHands, files: [
      ...sourceFiles.nebius,
      ...readdirSync(sourceDir).filter((name) => /^nebius\.rows-[0-9]{5}\.json$/.test(name))
        .sort().map((name) => join(sourceDir, name)),
    ], licenseUrl: "https://huggingface.co/datasets/nebius/SWE-rebench-openhands-trajectories/blob/35455389ab51bf5e2306bfd436ef72d0f98bf882/LICENSE",
      sampling: { kind: "case-control-even-index-window-sample", resolvedRows: 100,
        unresolvedRows: 100, prevalenceEligible: false,
        revisionBinding: "repo SHA checked before/after; not independent Parquet inclusion proof" },
      correlationPolicy: "same repository and issue roots are dependent",
      proofPaths: {
        byteObjectPaths: ["source/nebius-stratified-selection.json",
          ...readdirSync(sourceDir).filter((name) => /^nebius\.rows-[0-9]{5}\.json$/.test(name))
            .sort().map((name) => `source/${name}`)],
        revisionObjectPaths: ["source/nebius-openhands.repo-after.json",
          "source/nebius-openhands.repo.json"],
        licenseObjectPaths: ["source/nebius-openhands.LICENSE"],
      } },
  ];
  const manifestSources = [];
  for (const source of sources) {
    manifestSources.push({ id: source.pin.id, revision: source.pin.revision,
      sourceClass: source.pin.sourceClass,
      upstreamObject: source.pin.upstreamObject,
      license: license(source.pin, source.licenseUrl),
      provenanceProof: buildPublicAgentProvenanceProof({ datasetId: source.pin.id,
        ...source.proofPaths }),
      sampling: source.sampling,
      correlationPolicy: source.correlationPolicy,
      acquiredObjects: await Promise.all(source.files
        .filter((path, index, all) => all.indexOf(path) === index)
        .map((path) => object(path, outputDir))),
    });
  }
  const manifest = buildPublicAgentAcquisitionManifest({ generatedAt: new Date().toISOString(),
    sources: manifestSources });
  if (!verifyPublicAgentAcquisitionManifest(manifest).ok) {
    throw new Error("PUBLIC_AGENT_MANIFEST_SELF_VERIFY_FAILED");
  }
  writePrivateFile(join(outputDir, "acquisition-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`, outputDir);

  const groups = await Promise.all([
    normalizeCAA(sourceDir, outputDir),
    normalizeTraceLab(sourceDir, outputDir),
    normalizeOpenHands(sourceDir, outputDir),
    normalizeNebius(sourceDir, outputDir),
  ]);
  const records = groups.flat();
  if (records.some((record) => !verifyPublicAgentRecord(record).ok)) {
    throw new Error("PUBLIC_AGENT_NORMALIZED_RECORD_SELF_VERIFY_FAILED");
  }
  const normalizedPath = join(outputDir, "normalized-records.jsonl");
  writePrivateFile(normalizedPath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, outputDir);
  const summary = summarizePublicAgentRecords(records, { manifestHash: manifest.manifestHash });
  writePrivateFile(join(outputDir, "effect-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`, outputDir);
  const verification = await verifyPublicAgentArtifactsAgainstSource({
    sourceDirectory: sourceDir,
    artifactDirectory: outputDir,
  });
  if (!verification.ok) {
    throw new Error(`PUBLIC_AGENT_FULL_SOURCE_VERIFY_FAILED:${verification.error}`);
  }
  writePrivateFile(join(outputDir, "full-source-verification.json"),
    `${JSON.stringify(verification.attestation, null, 2)}\n`, outputDir);
  const result = { schema: "outsider/public-agent-intake-result/v1",
    generatedAt: manifest.generatedAt,
    manifestHash: manifest.manifestHash,
    summaryHash: summary.summaryHash,
    normalizedRecords: records.length,
    sourceBytes: manifest.sources.reduce((sum, source) => sum
      + source.acquiredObjects.reduce((inner, item) => inner + item.sizeBytes, 0), 0),
    recordSetHash: verification.recordSetProof.recordSetHash,
    fullSourceStatus: verification.status,
    artifacts: { manifest: "acquisition-manifest.json", normalized: "normalized-records.jsonl",
      summary: "effect-summary.json", verification: "full-source-verification.json" },
    boundary: { nativeLabelsAreEconomicLoss: false, pricingEligibleRows: 0 },
  };
  writePrivateFile(join(outputDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`,
    outputDir);
  return result;
}

export async function main(argv = process.argv.slice(2)) {
try {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write("Usage: node scripts/stage15-public-agent-corpus.mjs [--output-dir DIR] [--acquire-only|--finalize-only|--normalize-rows-only]\n");
    return 0;
  }
  const outputDir = resolve(args.outputDir);
  const sourceDir = join(outputDir, "source");
  ensurePrivateRoot(outputDir);
  ensurePrivateDirectory(sourceDir, outputDir);
  if (args.acquire) {
    await Promise.all([acquireCAAProvenance(sourceDir), acquireTraceLabProvenance(sourceDir),
      acquireOpenHands(sourceDir), acquireNebius(sourceDir)]);
  }
  const result = args.normalizeRowsOnly ? await normalizeRowsOnly(sourceDir, outputDir)
    : args.finalize ? await finalize(outputDir) : {
    schema: "outsider/public-agent-acquisition-progress/v1",
    outputDir,
    acquired: ["OpenHands/openhands-feedback", "nebius/SWE-rebench-openhands-trajectories"],
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  return 1;
}
}

if (process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main();
}
