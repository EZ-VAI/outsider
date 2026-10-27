#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  readFileSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  GONGSTA_TSHIRT_SOURCE,
  buildGongstaTshirtArtifactFromSourceDirectory,
  createGongstaTshirtReceipt,
  createGongstaTshirtSourceManifestFromDirectory,
  serializeGongstaTshirtArtifact,
  verifyGongstaTshirtArtifactDirectory,
} from "../src/outsider-gongsta-tshirt-corrections-lineage.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-gongsta-tshirt-corrections-lineage-20260830-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `GONGSTA_TSHIRT_ACQUIRE_${code}`
    : `GONGSTA_TSHIRT_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, reuseReleaseDir: null,
    reuseBracketBeforeDir: null, reuseBracketAfterDir: null,
    pythonExecutable: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--reuse-release-dir" && argv[index + 1]) {
      result.reuseReleaseDir = argv[++index];
    } else if (argument === "--reuse-bracket-before-dir" && argv[index + 1]) {
      result.reuseBracketBeforeDir = argv[++index];
    } else if (argument === "--reuse-bracket-after-dir" && argv[index + 1]) {
      result.reuseBracketAfterDir = argv[++index];
    } else if (argument === "--python" && argv[index + 1]) {
      result.pythonExecutable = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-gongsta-tshirt-corrections-lineage.mjs [options]",
        "",
        "Options:",
        "  --output-dir <new-dir>",
        "  --reuse-release-dir <complete-no-video-root>",
        "  --reuse-bracket-before-dir <record-and-six-tree-pages-dir>",
        "  --reuse-bracket-after-dir <record-and-six-tree-pages-dir>",
        "  --python <python-with-pyarrow-and-numpy>",
        "",
        "Acquires all 40 no-video objects and inventories all 278 video",
        "objects from the six-page fixed-revision official tree.",
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

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
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

function existingPrivateFile(file, exactBytes = null) {
  if (!existsSync(file)) return false;
  const status = lstatSync(file);
  if (!status.isFile() || status.isSymbolicLink()
    || (status.mode & 0o777) !== 0o600
    || exactBytes !== null && status.size !== exactBytes) {
    fail("CHECKPOINT_FILE_INVALID", file);
  }
  return true;
}

function copyPrivate(source, destination, exactBytes = null) {
  const resolved = path.resolve(source);
  const status = lstatSync(resolved);
  if (!status.isFile() || status.isSymbolicLink()
    || exactBytes !== null && status.size !== exactBytes) {
    fail("REUSE_SOURCE_INVALID", resolved);
  }
  if (existingPrivateFile(destination, status.size)) return;
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

async function fetchResponse(url, maximumSeconds = 900) {
  let last = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      const response = await fetch(checkedUrl(url), { redirect: "follow",
        headers: { "Accept-Encoding": "identity",
          "User-Agent": "outsider-gongsta-tshirt-corrections-lineage/1.0" },
        signal: AbortSignal.timeout(maximumSeconds * 1_000) });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      if (!response.url.startsWith("https://")) fail("REDIRECT_PROTOCOL_INVALID");
      return { bytes: Buffer.from(await response.arrayBuffer()),
        link: response.headers.get("link") };
    } catch (error) {
      last = error;
      if (attempt < 6) await new Promise((resolve) => setTimeout(resolve,
        Math.min(8_000, 500 * (2 ** attempt))));
    }
  }
  fail("DOWNLOAD_FAILED", last instanceof Error ? last.message : String(last));
}

async function fetchBytes(url, maximumSeconds = 900) {
  return (await fetchResponse(url, maximumSeconds)).bytes;
}

async function download(file, url, exactBytes = null) {
  if (existingPrivateFile(file, exactBytes)) return;
  ensurePrivateDirectory(path.dirname(file));
  const temporary = `${file}.download-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    const bytes = await fetchBytes(url);
    if (exactBytes !== null && bytes.length !== exactBytes) {
      fail("DOWNLOAD_SIZE_INVALID", file);
    }
    writePrivate(temporary, bytes);
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

async function mapLimit(items, limit, callback) {
  let next = 0;
  async function worker() {
    while (next < items.length) await callback(items[next++]);
  }
  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, worker));
}

function encodeRepoPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function sourceUrls() {
  const encodedId = GONGSTA_TSHIRT_SOURCE.id.split("/")
    .map(encodeURIComponent).join("/");
  const api = `https://huggingface.co/api/datasets/${encodedId}`;
  return {
    record: `${api}/revision/${GONGSTA_TSHIRT_SOURCE.revision}`,
    tree: `${api}/tree/${GONGSTA_TSHIRT_SOURCE.revision}?recursive=true&expand=true&limit=100`,
    resolve: `https://huggingface.co/datasets/${encodedId}/resolve/${GONGSTA_TSHIRT_SOURCE.revision}`,
  };
}

function nextLink(value) {
  if (value === null) return null;
  for (const part of value.split(",")) {
    const match = part.match(/^\s*<([^>]+)>;\s*rel="next"\s*$/u);
    if (match) return checkedUrl(match[1]);
  }
  return null;
}

async function fetchTreePages() {
  const pages = [];
  let url = sourceUrls().tree;
  while (url !== null) {
    if (pages.length >= 6) fail("TREE_PAGINATION_OVERFLOW");
    const response = await fetchResponse(url);
    let parsed;
    try { parsed = JSON.parse(response.bytes.toString("utf8")); }
    catch { fail("TREE_PAGE_JSON_INVALID"); }
    if (!Array.isArray(parsed)) fail("TREE_PAGE_NOT_ARRAY");
    pages.push(response.bytes);
    url = nextLink(response.link);
  }
  if (pages.length !== 6
    || pages.map((bytes) => JSON.parse(bytes.toString("utf8")).length)
      .join(",") !== "100,100,100,100,100,70") {
    fail("TREE_PAGINATION_PROFILE_INVALID");
  }
  return pages;
}

async function acquireBracket(checkpoint, suffix, reuseDirectory) {
  const metadata = path.join(checkpoint, "metadata");
  const recordTarget = path.join(metadata, `hf-record-${suffix}.json`);
  const pageTargets = Array.from({ length: 6 }, (_, index) => path.join(metadata,
    `hf-tree-${suffix}-page-${String(index + 1).padStart(3, "0")}.json`));
  if (reuseDirectory !== null) {
    const reuse = path.resolve(reuseDirectory);
    copyPrivate(path.join(reuse, "record.json"), recordTarget);
    for (let index = 0; index < 6; index += 1) {
      copyPrivate(path.join(reuse, `tree-page-${String(index + 1).padStart(3, "0")}.json`),
        pageTargets[index]);
    }
    return;
  }
  await download(recordTarget, sourceUrls().record);
  if (pageTargets.every((file) => existingPrivateFile(file))) return;
  const pages = await fetchTreePages();
  for (let index = 0; index < pages.length; index += 1) {
    if (!existingPrivateFile(pageTargets[index])) writePrivate(pageTargets[index], pages[index]);
  }
}

function selectedEntries(checkpoint) {
  const entries = [];
  for (let index = 0; index < 6; index += 1) {
    const page = JSON.parse(readFileSync(path.join(checkpoint, "metadata",
      `hf-tree-before-page-${String(index + 1).padStart(3, "0")}.json`), "utf8"));
    entries.push(...page);
  }
  const selected = entries.filter((entry) => entry.type === "file"
    && !entry.path.endsWith(".mp4"));
  if (entries.length !== 570 || selected.length !== 40
    || selected.reduce((sum, entry) => sum + entry.size, 0) !== 23_179_179) {
    fail("SELECTED_TREE_PROFILE_INVALID");
  }
  return selected;
}

async function acquireFiles(checkpoint, options) {
  const entries = selectedEntries(checkpoint);
  await mapLimit(entries, 4, async (entry) => {
    const target = path.join(checkpoint, "repo", ...entry.path.split("/"));
    if (options.reuseReleaseDir !== null) {
      copyPrivate(path.join(path.resolve(options.reuseReleaseDir),
        ...entry.path.split("/")), target, entry.size);
    } else {
      await download(target,
        `${sourceUrls().resolve}/${encodeRepoPath(entry.path)}?download=true`, entry.size);
    }
  });
}

async function acquireSource(checkpoint, options) {
  ensurePrivateDirectory(checkpoint);
  await acquireBracket(checkpoint, "before", options.reuseBracketBeforeDir);
  await acquireFiles(checkpoint, options);
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
    if (!existsSync(path.join(checkpoint, "source-manifest.json"))) {
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeGongstaTshirtArtifact(
          createGongstaTshirtSourceManifestFromDirectory(checkpoint)));
    }
    const built = buildGongstaTshirtArtifactFromSourceDirectory(checkpoint, {
      pythonExecutable: options.pythonExecutable,
    });
    const manifestBytes = serializeGongstaTshirtArtifact(built.sourceManifest);
    const reportBytes = serializeGongstaTshirtArtifact(built.report);
    const receipt = createGongstaTshirtReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeGongstaTshirtArtifact(receipt));
    const checked = verifyGongstaTshirtArtifactDirectory(target, {
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
