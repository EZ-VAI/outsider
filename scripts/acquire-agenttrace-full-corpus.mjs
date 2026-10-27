#!/usr/bin/env node

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
  AGENTTRACE_DATASET_ID,
  AGENTTRACE_PRODUCER_COMMIT,
  AGENTTRACE_PRODUCER_TREE,
  AGENTTRACE_REVISION,
  buildAgentTraceFullCorpusArtifactFromSourceDirectory,
  createAgentTraceFullCorpusReceipt,
  createAgentTraceFullCorpusSourceManifestFromDirectory,
  serializeAgentTraceFullCorpusArtifact,
  verifyAgentTraceFullCorpusArtifactDirectory,
} from "../src/outsider-agenttrace-full-corpus.js";

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT = "artifacts/outsider-agenttrace-full-corpus-20260829-v1";
const MBPP_ID = "google-research-datasets/mbpp";
const MBPP_REVISION = "4bb6404fdc6cacfda99d4ac4205087b89d32030c";
const NL2BASH_ID = "epinnock/intercode-nl2bash-curated";
const NL2BASH_REVISION = "019dd0389e872d8b075efbbd94a14d089e5c9f26";
const INTERCODE_COMMIT = "c3e46d827cfc9d4c704ec078f7abf9f41e3191d8";
const INTERCODE_TREE = "2e85c05a8f23ffea6028314caa7a986ab2c26c0b";

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENTTRACE_FULL_CORPUS_ACQUIRE_${code}`
    : `AGENTTRACE_FULL_CORPUS_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT, pythonExecutable: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--python" && argv[index + 1]) {
      result.pythonExecutable = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-agenttrace-full-corpus.mjs [--output-dir <new-dir>] [--python <python>]",
        "",
        "Acquires the complete fixed AgentTrace repository and primary rights metadata.",
        "Downloaded code and trace tool inputs are retained privately and never executed.",
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
  if (existsSync(directory)) return;
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
  const parent = lstatSync(path.dirname(target));
  if (!parent.isDirectory() || parent.isSymbolicLink()) fail("OUTPUT_PARENT_UNSAFE");
  if (existsSync(checkpoint)) {
    const status = lstatSync(checkpoint);
    if (!status.isDirectory() || status.isSymbolicLink()
      || (status.mode & 0o777) !== 0o700) fail("CHECKPOINT_UNSAFE");
  }
}

function checkedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    fail("URL_INVALID", value);
  }
  const pathname = decodeURIComponent(url.pathname);
  if (url.hostname === "huggingface.co") {
    const allowedRevision = [AGENTTRACE_REVISION, MBPP_REVISION, NL2BASH_REVISION]
      .some((revision) => pathname.includes(revision));
    const allowedId = [AGENTTRACE_DATASET_ID, MBPP_ID, NL2BASH_ID]
      .some((id) => pathname.includes(id));
    if (!allowedRevision || !allowedId) fail("URL_INVALID", value);
  } else if (url.hostname === "api.github.com") {
    if (!pathname.startsWith("/repos/pagarsky/agent-trace")
      && !pathname.startsWith("/repos/princeton-nlp/intercode")) {
      fail("URL_INVALID", value);
    }
  } else if (url.hostname === "raw.githubusercontent.com") {
    if (!pathname.includes(AGENTTRACE_PRODUCER_COMMIT)
      && !pathname.includes(INTERCODE_COMMIT)) fail("URL_INVALID", value);
  } else fail("URL_INVALID", value);
  return url.href;
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

async function download(file, value, maximumSeconds = 900, exactBytes = null) {
  if (existingPrivateFile(file, exactBytes)) return;
  const url = checkedUrl(value);
  ensurePrivateDirectory(path.dirname(file));
  const temporary = `${file}.download-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    await execFileAsync("/usr/bin/curl", [
      "--fail", "--location", "--silent", "--show-error",
      "--proto", "=https", "--proto-redir", "=https",
      "--retry", "6", "--retry-all-errors", "--retry-delay", "1",
      "--retry-max-time", String(maximumSeconds),
      "--connect-timeout", "30", "--max-time", String(maximumSeconds),
      "--header", "Accept-Encoding: identity",
      "--user-agent", "outsider-agenttrace-full-corpus/1.0",
      "--output", temporary, url,
    ], { timeout: (maximumSeconds + 30) * 1_000, maxBuffer: 1024 * 1024 });
    chmodSync(temporary, 0o600);
    const status = lstatSync(temporary);
    if (!status.isFile() || status.isSymbolicLink()
      || exactBytes !== null && status.size !== exactBytes) {
      fail("DOWNLOAD_INVALID", file);
    }
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { force: true });
  }
}

async function mapLimit(items, limit, callback) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      await callback(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function encodeId(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function encodeRepoPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function hfUrls(id, revision) {
  const encoded = encodeId(id);
  const api = `https://huggingface.co/api/datasets/${encoded}`;
  return {
    record: `${api}/revision/${revision}`,
    tree: `${api}/tree/${revision}?recursive=true&limit=1000`,
    resolve: `https://huggingface.co/datasets/${encoded}/resolve/${revision}`,
  };
}

const agenttrace = hfUrls(AGENTTRACE_DATASET_ID, AGENTTRACE_REVISION);
const mbpp = hfUrls(MBPP_ID, MBPP_REVISION);
const nl2bash = hfUrls(NL2BASH_ID, NL2BASH_REVISION);

async function acquireSource(checkpoint) {
  ensurePrivateDirectory(checkpoint);
  const files = path.join(checkpoint, "files");
  ensurePrivateDirectory(files);

  const metadataDownloads = [
    ["metadata/dataset-record-before.json", agenttrace.record],
    ["metadata/full-tree-before.json", agenttrace.tree],
    ["producer/repo.json", "https://api.github.com/repos/pagarsky/agent-trace"],
    ["producer/commit.json", `https://api.github.com/repos/pagarsky/agent-trace/commits/${AGENTTRACE_PRODUCER_COMMIT}`],
    ["producer/tree-before.json", `https://api.github.com/repos/pagarsky/agent-trace/git/trees/${AGENTTRACE_PRODUCER_TREE}?recursive=1`],
    ["producer/github-readme.md", `https://raw.githubusercontent.com/pagarsky/agent-trace/${AGENTTRACE_PRODUCER_COMMIT}/README.md`, 4_503],
    ["producer/github-license", `https://raw.githubusercontent.com/pagarsky/agent-trace/${AGENTTRACE_PRODUCER_COMMIT}/LICENSE`, 11_357],
    ["upstream/mbpp/record-before.json", mbpp.record],
    ["upstream/mbpp/tree-before.json", mbpp.tree],
    ["upstream/mbpp/README.md", `${mbpp.resolve}/README.md`, 9_058],
    ["upstream/nl2bash/record-before.json", nl2bash.record],
    ["upstream/nl2bash/tree-before.json", nl2bash.tree],
    ["upstream/nl2bash/README.md", `${nl2bash.resolve}/README.md`, 554],
    ["upstream/intercode/repo.json", "https://api.github.com/repos/princeton-nlp/intercode"],
    ["upstream/intercode/commit.json", `https://api.github.com/repos/princeton-nlp/intercode/commits/${INTERCODE_COMMIT}`],
    ["upstream/intercode/tree.json", `https://api.github.com/repos/princeton-nlp/intercode/git/trees/${INTERCODE_TREE}?recursive=1`],
    ["upstream/intercode/license.md", `https://raw.githubusercontent.com/princeton-nlp/intercode/${INTERCODE_COMMIT}/LICENSE.md`, 1_093],
  ];
  await mapLimit(metadataDownloads, 5, async ([relative, url, exactBytes]) => {
    await download(path.join(checkpoint, relative), url, 240, exactBytes ?? null);
  });

  const tree = JSON.parse(readFileSync(
    path.join(checkpoint, "metadata/full-tree-before.json"), "utf8"));
  const plan = tree.filter((entry) => entry.type === "file");
  if (plan.length !== 72) fail("TREE_FILE_COUNT_INVALID");
  await mapLimit(plan, 5, async (entry) => {
    const target = path.join(files, ...entry.path.split("/"));
    ensurePrivateDirectory(path.dirname(target));
    if (entry.size === 0) {
      if (!existingPrivateFile(target, 0)) writePrivate(target, Buffer.alloc(0));
    } else {
      await download(target,
        `${agenttrace.resolve}/${encodeRepoPath(entry.path)}?download=true`,
        900, entry.size);
    }
  });

  const afterDownloads = [
    ["producer/tree-after.json", `https://api.github.com/repos/pagarsky/agent-trace/git/trees/${AGENTTRACE_PRODUCER_TREE}?recursive=1`],
    ["upstream/mbpp/tree-after.json", mbpp.tree],
    ["upstream/mbpp/record-after.json", mbpp.record],
    ["upstream/nl2bash/tree-after.json", nl2bash.tree],
    ["upstream/nl2bash/record-after.json", nl2bash.record],
    ["metadata/full-tree-after.json", agenttrace.tree],
    ["metadata/dataset-record-after.json", agenttrace.record],
  ];
  await mapLimit(afterDownloads, 4, async ([relative, url]) => {
    await download(path.join(checkpoint, relative), url, 240);
  });
}

async function acquire(options) {
  const workspace = path.resolve(".");
  const target = path.resolve(options.outputDir);
  const checkpoint = `${target}.source-checkpoint`;
  validateTarget(workspace, target, checkpoint);
  let sourceMoved = false;
  try {
    await acquireSource(checkpoint);
    const names = sorted(readdirSync(checkpoint));
    if (names.join("\0") === ["files", "metadata", "producer", "upstream"].join("\0")) {
      const manifest = createAgentTraceFullCorpusSourceManifestFromDirectory(checkpoint);
      writePrivate(path.join(checkpoint, "source-manifest.json"),
        serializeAgentTraceFullCorpusArtifact(manifest));
    }
    const built = buildAgentTraceFullCorpusArtifactFromSourceDirectory(checkpoint,
      { pythonExecutable: options.pythonExecutable });
    const manifestBytes = serializeAgentTraceFullCorpusArtifact(built.sourceManifest);
    const reportBytes = serializeAgentTraceFullCorpusArtifact(built.report);
    const receipt = createAgentTraceFullCorpusReceipt(
      built.report, reportBytes, manifestBytes);
    mkdirPrivate(target);
    renameSync(checkpoint, path.join(target, "source"));
    sourceMoved = true;
    writePrivate(path.join(target, "report.json"), reportBytes);
    writePrivate(path.join(target, "run-receipt.json"),
      serializeAgentTraceFullCorpusArtifact(receipt));
    const checked = verifyAgentTraceFullCorpusArtifactDirectory(target,
      { pythonExecutable: options.pythonExecutable });
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

const options = parseArgs(process.argv.slice(2));
await acquire(options);
