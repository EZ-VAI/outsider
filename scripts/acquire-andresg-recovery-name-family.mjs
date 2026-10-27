#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  readFileSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  ANDRESG_RECOVERY_SOURCES,
  buildAndresgRecoveryArtifactFromSourceDirectory,
  createAndresgRecoveryReceipt,
  createAndresgRecoverySourceManifestFromDirectory,
  serializeAndresgRecoveryArtifact,
  verifyAndresgRecoveryArtifactDirectory,
} from "../src/outsider-andresg-recovery-name-family.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-andresg-recovery-name-family-20260830-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `ANDRESG_RECOVERY_ACQUIRE_${code}`
    : `ANDRESG_RECOVERY_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, reuseRepos: new Map(),
    reuseBracketBeforeDir: null, reuseBracketAfterDir: null,
    pythonExecutable: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--reuse-repo" && argv[index + 1]) {
      const value = argv[++index];
      const separator = value.indexOf("=");
      if (separator <= 0 || separator === value.length - 1) {
        fail("REUSE_REPO_INVALID", value);
      }
      const key = value.slice(0, separator);
      if (!ANDRESG_RECOVERY_SOURCES.some((spec) => spec.key === key)
        || result.reuseRepos.has(key)) fail("REUSE_REPO_KEY_INVALID", key);
      result.reuseRepos.set(key, value.slice(separator + 1));
    } else if (argument === "--reuse-bracket-before-dir" && argv[index + 1]) {
      result.reuseBracketBeforeDir = argv[++index];
    } else if (argument === "--reuse-bracket-after-dir" && argv[index + 1]) {
      result.reuseBracketAfterDir = argv[++index];
    } else if (argument === "--python" && argv[index + 1]) {
      result.pythonExecutable = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-andresg-recovery-name-family.mjs [options]",
        "",
        "Options:",
        "  --output-dir <new-dir>",
        "  --reuse-repo <key=complete-no-video-root>  (repeatable)",
        "  --reuse-bracket-before-dir <normalized-bracket-root>",
        "  --reuse-bracket-after-dir <normalized-bracket-root>",
        "  --python <python-with-pyarrow-and-numpy>",
        "",
        "Acquires the complete seven-object no-video closure for all eleven",
        "fixed repositories selected from the official author listing by a",
        "literal recovery ID match. The 22 videos are inventoried only.",
      ].join("\n") + "\n");
      process.exit(0);
    } else fail("ARGUMENT_INVALID", argument);
  }
  return result;
}

function mkdirPrivate(directory) {
  mkdirSync(directory, { mode: 0o700 }); chmodSync(directory, 0o700);
}

function ensurePrivateDirectory(directory) {
  if (existsSync(directory)) {
    const status = lstatSync(directory);
    if (!status.isDirectory() || status.isSymbolicLink()
      || (status.mode & 0o777) !== 0o700) fail("DIRECTORY_UNSAFE", directory);
    return;
  }
  ensurePrivateDirectory(path.dirname(directory)); mkdirPrivate(directory);
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 }); chmodSync(file, 0o600);
}

function validateTarget(workspace, target, checkpoint) {
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || existsSync(target)) {
    fail("OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE", target);
  }
  let cursor = path.dirname(target); const missing = [];
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
  const resolved = path.resolve(source); const status = lstatSync(resolved);
  if (!status.isFile() || status.isSymbolicLink()
    || exactBytes !== null && status.size !== exactBytes) {
    fail("REUSE_SOURCE_INVALID", resolved);
  }
  if (existingPrivateFile(destination, status.size)) return;
  ensurePrivateDirectory(path.dirname(destination));
  const temporary = `${destination}.copy-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    copyFileSync(resolved, temporary, constants.COPYFILE_EXCL);
    chmodSync(temporary, 0o600); renameSync(temporary, destination);
  } finally { if (existsSync(temporary)) rmSync(temporary, { force: true }); }
}

function checkedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password
    || url.hostname !== "huggingface.co") fail("URL_INVALID", value);
  return url.href;
}

async function fetchBytes(url, maximumSeconds = 900) {
  let last = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      const response = await fetch(checkedUrl(url), { redirect: "follow",
        headers: { "Accept-Encoding": "identity",
          "User-Agent": "outsider-andresg-recovery-name-family/1.0" },
        signal: AbortSignal.timeout(maximumSeconds * 1_000) });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      if (!response.url.startsWith("https://")) fail("REDIRECT_PROTOCOL_INVALID");
      return Buffer.from(await response.arrayBuffer());
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
  const temporary = `${file}.download-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    const bytes = await fetchBytes(url);
    if (exactBytes !== null && bytes.length !== exactBytes) {
      fail("DOWNLOAD_SIZE_INVALID", file);
    }
    writePrivate(temporary, bytes); renameSync(temporary, file);
  } finally { if (existsSync(temporary)) rmSync(temporary, { force: true }); }
}

async function mapLimit(items, limit, callback) {
  let next = 0;
  async function worker() { while (next < items.length) await callback(items[next++]); }
  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, worker));
}

function encodeRepoPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function sourceUrls(spec) {
  const encodedId = spec.id.split("/").map(encodeURIComponent).join("/");
  const api = `https://huggingface.co/api/datasets/${encodedId}`;
  return {
    record: `${api}/revision/${spec.revision}`,
    tree: `${api}/tree/${spec.revision}?recursive=true&expand=true&limit=100`,
    resolve: `https://huggingface.co/datasets/${encodedId}/resolve/${spec.revision}`,
  };
}

const AUTHOR_URL =
  "https://huggingface.co/api/datasets?author=Andresg324&full=true&limit=1000";

async function acquireAuthorList(checkpoint, suffix, reuseDirectory) {
  const target = path.join(checkpoint, "metadata", `hf-author-list-${suffix}.json`);
  if (reuseDirectory !== null) {
    copyPrivate(path.join(path.resolve(reuseDirectory), "author-list.json"), target);
  } else await download(target, AUTHOR_URL);
}

async function acquireRepositoryBracket(checkpoint, suffix, reuseDirectory) {
  await mapLimit(ANDRESG_RECOVERY_SOURCES, 4, async (spec) => {
    const prefix = path.join(checkpoint, "metadata", spec.key);
    const recordTarget = path.join(prefix, `hf-record-${suffix}.json`);
    const treeTarget = path.join(prefix, `hf-tree-${suffix}.json`);
    if (reuseDirectory !== null) {
      const base = path.join(path.resolve(reuseDirectory), spec.key);
      copyPrivate(path.join(base, "record.json"), recordTarget);
      copyPrivate(path.join(base, "tree.json"), treeTarget);
    } else {
      const urls = sourceUrls(spec);
      await Promise.all([download(recordTarget, urls.record),
        download(treeTarget, urls.tree)]);
    }
  });
}

function selectedEntries(checkpoint, spec) {
  const entries = JSON.parse(readFileSync(path.join(checkpoint, "metadata",
    spec.key, "hf-tree-before.json"), "utf8"));
  const selected = entries.filter((entry) => entry.type === "file"
    && !entry.path.endsWith(".mp4"));
  if (entries.length !== 19 || selected.length !== 7
    || selected.reduce((sum, entry) => sum + entry.size, 0) !== spec.selectedBytes) {
    fail("SELECTED_TREE_PROFILE_INVALID", spec.key);
  }
  return selected;
}

async function acquireFiles(checkpoint, options) {
  const jobs = ANDRESG_RECOVERY_SOURCES.flatMap((spec) =>
    selectedEntries(checkpoint, spec).map((entry) => ({ spec, entry })));
  await mapLimit(jobs, 6, async ({ spec, entry }) => {
    const target = path.join(checkpoint, "repos", spec.key,
      ...entry.path.split("/"));
    if (options.reuseRepos.has(spec.key)) {
      copyPrivate(path.join(path.resolve(options.reuseRepos.get(spec.key)),
        ...entry.path.split("/")), target, entry.size);
    } else {
      const urls = sourceUrls(spec);
      await download(target,
        `${urls.resolve}/${encodeRepoPath(entry.path)}?download=true`, entry.size);
    }
  });
}

async function acquireSource(checkpoint, options) {
  ensurePrivateDirectory(checkpoint);
  await acquireAuthorList(checkpoint, "before", options.reuseBracketBeforeDir);
  await acquireRepositoryBracket(checkpoint, "before",
    options.reuseBracketBeforeDir);
  await acquireFiles(checkpoint, options);
  await acquireRepositoryBracket(checkpoint, "after", options.reuseBracketAfterDir);
  await acquireAuthorList(checkpoint, "after", options.reuseBracketAfterDir);
}

async function acquire(options) {
  const workspace = path.resolve("."); const target = path.resolve(options.outputDir);
  const checkpoint = `${target}.source-checkpoint`;
  validateTarget(workspace, target, checkpoint); let sourceMoved = false;
  try {
    await acquireSource(checkpoint, options);
    if (!existsSync(path.join(checkpoint, "source-manifest.json"))) {
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeAndresgRecoveryArtifact(
          createAndresgRecoverySourceManifestFromDirectory(checkpoint)));
    }
    const built = buildAndresgRecoveryArtifactFromSourceDirectory(checkpoint, {
      pythonExecutable: options.pythonExecutable,
    });
    const manifestBytes = serializeAndresgRecoveryArtifact(built.sourceManifest);
    const reportBytes = serializeAndresgRecoveryArtifact(built.report);
    const receipt = createAndresgRecoveryReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target); renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeAndresgRecoveryArtifact(receipt));
    const checked = verifyAndresgRecoveryArtifactDirectory(target, {
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
