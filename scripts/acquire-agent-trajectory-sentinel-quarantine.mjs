#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  AGENT_TRAJECTORY_SENTINEL_DISPOSITION,
  AGENT_TRAJECTORY_SENTINEL_EPISODE_IDS,
  AGENT_TRAJECTORY_SENTINEL_EXPECTED_DATA_BYTES,
  AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT,
  AGENT_TRAJECTORY_SENTINEL_GITHUB_RESULTS_TREE,
  AGENT_TRAJECTORY_SENTINEL_GITHUB_RETRY_TREE,
  AGENT_TRAJECTORY_SENTINEL_GITHUB_ROOT_TREE,
  AGENT_TRAJECTORY_SENTINEL_GITHUB_TABLES_TREE,
  AGENT_TRAJECTORY_SENTINEL_GITHUB_TRACES_TREE,
  AGENT_TRAJECTORY_SENTINEL_HF_REVISION,
  AGENT_TRAJECTORY_SENTINEL_RECOVERY_TREE,
  AGENT_TRAJECTORY_SENTINEL_SOURCE_TREE,
  buildAgentTrajectorySentinelQuarantineFromDirectory,
  publishAgentTrajectorySentinelArtifactDirectory,
  verifyAgentTrajectorySentinelArtifactDirectory,
  verifyAgentTrajectorySentinelQuarantine,
} from "../src/outsider-agent-trajectory-sentinel-quarantine.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-agent-trajectory-sentinel-quarantine-20260829-v2";
const REPOSITORY = "sunnydubey1111/agent-trajectory-sentinel";
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_DATA_FILE_BYTES = 128 * 1024;
const CONCURRENCY = 4;

const URLS = Object.freeze({
  metadata: Object.freeze({
    "github-commit.json": `https://api.github.com/repos/${REPOSITORY}/git/commits/${AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT}`,
    "github-root-tree.json": `https://api.github.com/repos/${REPOSITORY}/git/trees/${AGENT_TRAJECTORY_SENTINEL_GITHUB_ROOT_TREE}`,
    "github-traces-tree.json": `https://api.github.com/repos/${REPOSITORY}/git/trees/${AGENT_TRAJECTORY_SENTINEL_GITHUB_TRACES_TREE}`,
    "github-retry-tree.json": `https://api.github.com/repos/${REPOSITORY}/git/trees/${AGENT_TRAJECTORY_SENTINEL_GITHUB_RETRY_TREE}`,
    "github-results-tree.json": `https://api.github.com/repos/${REPOSITORY}/git/trees/${AGENT_TRAJECTORY_SENTINEL_GITHUB_RESULTS_TREE}`,
    "github-tables-tree.json": `https://api.github.com/repos/${REPOSITORY}/git/trees/${AGENT_TRAJECTORY_SENTINEL_GITHUB_TABLES_TREE}`,
    "github-source-tree.json": `https://api.github.com/repos/${REPOSITORY}/git/trees/${AGENT_TRAJECTORY_SENTINEL_SOURCE_TREE}`,
    "github-recovery-tree.json": `https://api.github.com/repos/${REPOSITORY}/git/trees/${AGENT_TRAJECTORY_SENTINEL_RECOVERY_TREE}`,
    "hf-revision.json": `https://huggingface.co/api/datasets/${REPOSITORY}/revision/${AGENT_TRAJECTORY_SENTINEL_HF_REVISION}`,
  }),
  rights: Object.freeze({
    "github-README.md": `https://raw.githubusercontent.com/${REPOSITORY}/${AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT}/README.md`,
    "github-DATA_CARD.md": `https://raw.githubusercontent.com/${REPOSITORY}/${AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT}/DATA_CARD.md`,
    "github-LICENSE": `https://raw.githubusercontent.com/${REPOSITORY}/${AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT}/LICENSE`,
    "github-NOTICE": `https://raw.githubusercontent.com/${REPOSITORY}/${AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT}/NOTICE`,
    "hf-README.md": `https://huggingface.co/datasets/${REPOSITORY}/raw/${AGENT_TRAJECTORY_SENTINEL_HF_REVISION}/README.md`,
    "hf-LICENSING.md": `https://huggingface.co/datasets/${REPOSITORY}/raw/${AGENT_TRAJECTORY_SENTINEL_HF_REVISION}/LICENSING.md`,
  }),
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `ATS_QUARANTINE_ACQUIRE_${code}`
    : `ATS_QUARANTINE_ACQUIRE_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function serialize(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-agent-trajectory-sentinel-quarantine.mjs [--output-dir <new-dir>]",
        "",
        "Downloads exactly 55 pinned source traces, 55 located-r1 recovery traces,",
        "their source manifest and repair_policies.csv. Raw files stay local/private.",
        "GitHub root and intermediate tree objects are recomputed and ancestry-bound.",
        "The result is QUARANTINE_EVALUATION_ONLY with zero training/admission rows.",
      ].join("\n") + "\n");
      process.exit(0);
    } else fail("ARGUMENT_INVALID", argument);
  }
  return result;
}

function checkedOfficialUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== ""
    || !["api.github.com", "raw.githubusercontent.com", "huggingface.co"]
      .includes(url.hostname)) fail("URL_HOST_INVALID", value);
  const decodedPath = decodeURIComponent(url.pathname);
  const pinPresent = decodedPath.includes(AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT)
    || decodedPath.includes(AGENT_TRAJECTORY_SENTINEL_GITHUB_ROOT_TREE)
    || decodedPath.includes(AGENT_TRAJECTORY_SENTINEL_GITHUB_TRACES_TREE)
    || decodedPath.includes(AGENT_TRAJECTORY_SENTINEL_GITHUB_RETRY_TREE)
    || decodedPath.includes(AGENT_TRAJECTORY_SENTINEL_GITHUB_RESULTS_TREE)
    || decodedPath.includes(AGENT_TRAJECTORY_SENTINEL_GITHUB_TABLES_TREE)
    || decodedPath.includes(AGENT_TRAJECTORY_SENTINEL_SOURCE_TREE)
    || decodedPath.includes(AGENT_TRAJECTORY_SENTINEL_RECOVERY_TREE)
    || decodedPath.includes(AGENT_TRAJECTORY_SENTINEL_HF_REVISION);
  if (!pinPresent || !decodedPath.includes("sunnydubey1111/agent-trajectory-sentinel")) {
    fail("URL_NOT_REVISION_PINNED", value);
  }
  return url;
}

async function boundedFetchOnce(value, { maximumBytes, expectedBytes = null } = {}) {
  const url = checkedOfficialUrl(value);
  const response = await fetch(url, {
    redirect: "error",
    headers: {
      accept: "application/json,text/plain;q=0.9,*/*;q=0.1",
      "accept-encoding": "identity",
      "user-agent": "outsider-agent-trajectory-sentinel-quarantine/2.0",
    },
    signal: AbortSignal.timeout(120_000),
  });
  if (response.status !== 200 || !response.body || response.url !== url.href) {
    fail(`HTTP_${response.status}`, url.hostname);
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/u.test(declared)
    || Number(declared) > maximumBytes
    || expectedBytes !== null && Number(declared) !== expectedBytes)) {
    fail("CONTENT_LENGTH_INVALID", url.pathname);
  }
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    total += chunk.byteLength;
    if (total > maximumBytes || expectedBytes !== null && total > expectedBytes) {
      await reader.cancel("bounded source size exceeded");
      fail("SOURCE_SIZE_BOUND_EXCEEDED", url.pathname);
    }
    chunks.push(Buffer.from(chunk));
  }
  if (total < 1 || expectedBytes !== null && total !== expectedBytes) {
    fail("SOURCE_SIZE_INVALID", url.pathname);
  }
  return Buffer.concat(chunks, total);
}

async function boundedFetch(value, bounds) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await boundedFetchOnce(value, bounds);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("ATS_QUARANTINE_ACQUIRE_") || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

function parseJson(bytes, code) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(code); }
}

function gitObjectOid(type, bytes) {
  const header = Buffer.from(`${type} ${bytes.length}\0`, "utf8");
  return createHash("sha1").update(header).update(bytes).digest("hex");
}

function exactTreeMap(bytes, expectedSha, code) {
  const tree = parseJson(bytes, `${code}_JSON_INVALID`);
  if (tree.sha !== expectedSha || tree.truncated !== false
    || !Array.isArray(tree.tree)) fail(`${code}_INVALID`);
  const result = new Map();
  const chunks = [];
  const entries = [...tree.tree].sort((left, right) => Buffer.compare(
    Buffer.from(`${left.path}${left.type === "tree" ? "/" : ""}`, "utf8"),
    Buffer.from(`${right.path}${right.type === "tree" ? "/" : ""}`, "utf8"),
  ));
  for (const entry of entries) {
    const isBlob = entry?.type === "blob";
    const isTree = entry?.type === "tree";
    const expectedKeys = isBlob
      ? ["mode", "path", "sha", "size", "type", "url"]
      : ["mode", "path", "sha", "type", "url"];
    const actualKeys = entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.keys(entry).sort() : [];
    const expectedUrl = `https://api.github.com/repos/${REPOSITORY}/git/${
      isBlob ? "blobs" : "trees"}/${entry?.sha}`;
    if (actualKeys.join("\0") !== expectedKeys.join("\0")
      || !/^(?!\.{1,2}$)[^/\0]+$/u.test(entry.path)
      || entry.mode !== (isBlob ? "100644" : isTree ? "040000" : null)
      || !/^[a-f0-9]{40}$/u.test(entry.sha) || entry.url !== expectedUrl
      || isBlob && (!Number.isSafeInteger(entry.size) || entry.size < 1)
      || result.has(entry.path)) fail(`${code}_ENTRY_INVALID`);
    result.set(entry.path, entry);
    chunks.push(Buffer.from(`${isTree ? "40000" : entry.mode} ${entry.path}\0`, "utf8"));
    chunks.push(Buffer.from(entry.sha, "hex"));
  }
  if (gitObjectOid("tree", Buffer.concat(chunks)) !== expectedSha) {
    fail(`${code}_OBJECT_HASH_MISMATCH`);
  }
  return result;
}

function requireMember(tree, memberPath, type, sha, code, size = undefined) {
  const entry = tree.get(memberPath);
  if (!entry || entry.type !== type || entry.sha !== sha
    || size !== undefined && entry.size !== size) fail(code);
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function mkdirPrivate(directory) {
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
}

function validateWorkspaceTarget(workspace, target) {
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || target === path.parse(target).root || existsSync(target)) {
    fail("OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE", target);
  }
  let cursor = path.dirname(target);
  const chain = [];
  while (cursor !== workspace) {
    const relation = path.relative(workspace, cursor);
    if (relation === ".." || relation.startsWith(`..${path.sep}`)) {
      fail("OUTPUT_PARENT_OUTSIDE_WORKSPACE");
    }
    chain.push(cursor);
    cursor = path.dirname(cursor);
  }
  chain.reverse();
  for (const directory of chain) {
    if (!existsSync(directory)) mkdirPrivate(directory);
    const status = lstatSync(directory);
    if (!status.isDirectory() || status.isSymbolicLink()) fail("OUTPUT_PARENT_UNSAFE", directory);
  }
}

async function mapConcurrent(items, concurrency, operation) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await operation(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

const args = parseArgs(process.argv.slice(2));
const workspace = path.resolve(process.cwd());
const target = path.resolve(args.outputDir);
validateWorkspaceTarget(workspace, target);
const targetParent = path.dirname(target);
const staging = path.join(targetParent,
  `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
mkdirPrivate(staging);

try {
  const sourceRoot = path.join(staging, "source");
  const metadataDirectory = path.join(sourceRoot, "metadata");
  const rightsDirectory = path.join(sourceRoot, "rights");
  const rawDirectory = path.join(sourceRoot, "raw");
  const rawSourceDirectory = path.join(rawDirectory, "source");
  const rawRecoveryDirectory = path.join(rawDirectory, "recovery");
  for (const directory of [sourceRoot, metadataDirectory, rightsDirectory,
    rawDirectory, rawSourceDirectory, rawRecoveryDirectory]) mkdirPrivate(directory);

  const metadataPairs = await Promise.all(Object.entries(URLS.metadata).map(async ([name, url]) =>
    [name, await boundedFetch(url, { maximumBytes: MAX_METADATA_BYTES })]));
  const metadata = Object.fromEntries(metadataPairs);
  const rootTree = exactTreeMap(metadata["github-root-tree.json"],
    AGENT_TRAJECTORY_SENTINEL_GITHUB_ROOT_TREE, "ROOT_TREE");
  const tracesTree = exactTreeMap(metadata["github-traces-tree.json"],
    AGENT_TRAJECTORY_SENTINEL_GITHUB_TRACES_TREE, "TRACES_TREE");
  const retryTree = exactTreeMap(metadata["github-retry-tree.json"],
    AGENT_TRAJECTORY_SENTINEL_GITHUB_RETRY_TREE, "RETRY_TREE");
  const resultsTree = exactTreeMap(metadata["github-results-tree.json"],
    AGENT_TRAJECTORY_SENTINEL_GITHUB_RESULTS_TREE, "RESULTS_TREE");
  const tablesTree = exactTreeMap(metadata["github-tables-tree.json"],
    AGENT_TRAJECTORY_SENTINEL_GITHUB_TABLES_TREE, "TABLES_TREE");
  const sourceTree = exactTreeMap(metadata["github-source-tree.json"],
    AGENT_TRAJECTORY_SENTINEL_SOURCE_TREE, "SOURCE_TREE");
  const recoveryTree = exactTreeMap(metadata["github-recovery-tree.json"],
    AGENT_TRAJECTORY_SENTINEL_RECOVERY_TREE, "RECOVERY_TREE");
  if (sourceTree.size !== 121 || recoveryTree.size !== 55) fail("TREE_DENOMINATOR_MISMATCH");
  requireMember(rootTree, "traces", "tree",
    AGENT_TRAJECTORY_SENTINEL_GITHUB_TRACES_TREE, "ROOT_TO_TRACES_MISMATCH");
  requireMember(tracesTree, "organic_demo7b_cold", "tree",
    AGENT_TRAJECTORY_SENTINEL_SOURCE_TREE, "TRACES_TO_SOURCE_MISMATCH");
  requireMember(tracesTree, "organic_demo7b_cold_retry", "tree",
    AGENT_TRAJECTORY_SENTINEL_GITHUB_RETRY_TREE, "TRACES_TO_RETRY_MISMATCH");
  requireMember(retryTree, "located-r1", "tree",
    AGENT_TRAJECTORY_SENTINEL_RECOVERY_TREE, "RETRY_TO_RECOVERY_MISMATCH");
  requireMember(rootTree, "results", "tree",
    AGENT_TRAJECTORY_SENTINEL_GITHUB_RESULTS_TREE, "ROOT_TO_RESULTS_MISMATCH");
  requireMember(resultsTree, "tables", "tree",
    AGENT_TRAJECTORY_SENTINEL_GITHUB_TABLES_TREE, "RESULTS_TO_TABLES_MISMATCH");
  requireMember(tablesTree, "repair_policies.csv", "blob",
    "ff5d3c48312e58af2842917c731760f5f0d3f959", "TABLES_TO_CSV_MISMATCH", 115_955);
  const expectedNames = AGENT_TRAJECTORY_SENTINEL_EPISODE_IDS.map((id) => `${id}.jsonl`);
  if (expectedNames.some((name) => !sourceTree.has(name) || !recoveryTree.has(name))
    || [...recoveryTree.keys()].sort().join("\0") !== [...expectedNames].sort().join("\0")) {
    fail("PAIR_TREE_SET_MISMATCH");
  }
  const sourceTraceBytes = expectedNames.reduce((sum, name) => sum + sourceTree.get(name).size, 0);
  const recoveryTraceBytes = expectedNames.reduce((sum, name) => sum + recoveryTree.get(name).size, 0);
  if (sourceTraceBytes !== 675_606 || recoveryTraceBytes !== 704_924
    || sourceTraceBytes + recoveryTraceBytes + 39_709 + 115_955
      !== AGENT_TRAJECTORY_SENTINEL_EXPECTED_DATA_BYTES) fail("PREDECLARED_BYTES_MISMATCH");

  for (const [name, bytes] of metadataPairs) writePrivate(path.join(metadataDirectory, name), bytes);
  const rightsPairs = await Promise.all(Object.entries(URLS.rights).map(async ([name, url]) =>
    [name, await boundedFetch(url, { maximumBytes: MAX_METADATA_BYTES })]));
  for (const [name, bytes] of rightsPairs) writePrivate(path.join(rightsDirectory, name), bytes);

  const manifestUrl = `https://raw.githubusercontent.com/${REPOSITORY}/${AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT}/traces/organic_demo7b_cold/manifest.json`;
  const csvUrl = `https://raw.githubusercontent.com/${REPOSITORY}/${AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT}/results/tables/repair_policies.csv`;
  const [manifestBytes, csvBytes] = await Promise.all([
    boundedFetch(manifestUrl, { maximumBytes: MAX_DATA_FILE_BYTES, expectedBytes: 39_709 }),
    boundedFetch(csvUrl, { maximumBytes: MAX_DATA_FILE_BYTES, expectedBytes: 115_955 }),
  ]);
  writePrivate(path.join(rawSourceDirectory, "manifest.json"), manifestBytes);
  writePrivate(path.join(rawDirectory, "repair_policies.csv"), csvBytes);

  const tracePairs = await mapConcurrent(expectedNames, CONCURRENCY, async (name) => {
    const sourceEntry = sourceTree.get(name);
    const recoveryEntry = recoveryTree.get(name);
    const sourceUrl = `https://raw.githubusercontent.com/${REPOSITORY}/${AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT}/traces/organic_demo7b_cold/${name}`;
    const recoveryUrl = `https://raw.githubusercontent.com/${REPOSITORY}/${AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT}/traces/organic_demo7b_cold_retry/located-r1/${name}`;
    const [sourceBytes, recoveryBytes] = await Promise.all([
      boundedFetch(sourceUrl, { maximumBytes: MAX_DATA_FILE_BYTES,
        expectedBytes: sourceEntry.size }),
      boundedFetch(recoveryUrl, { maximumBytes: MAX_DATA_FILE_BYTES,
        expectedBytes: recoveryEntry.size }),
    ]);
    return { name, sourceBytes, recoveryBytes };
  });
  for (const pair of tracePairs) {
    writePrivate(path.join(rawSourceDirectory, pair.name), pair.sourceBytes);
    writePrivate(path.join(rawRecoveryDirectory, pair.name), pair.recoveryBytes);
  }

  const report = buildAgentTrajectorySentinelQuarantineFromDirectory(sourceRoot);
  const reportBytes = serialize(report);
  writePrivate(path.join(staging, "report.json"), reportBytes);
  const verified = verifyAgentTrajectorySentinelQuarantine(report,
    { sourceDirectory: sourceRoot });
  if (!verified.ok) fail("SOURCE_REPLAY_FAILED", verified.error);
  const receiptBody = {
    schema: "outsider/agent-trajectory-sentinel-quarantine-run-receipt/v2",
    datasetId: REPOSITORY,
    githubCommit: AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT,
    huggingFaceRevision: AGENT_TRAJECTORY_SENTINEL_HF_REVISION,
    disposition: AGENT_TRAJECTORY_SENTINEL_DISPOSITION,
    reportHash: report.reportHash,
    reportFileSha256: sha256(reportBytes),
    sourceRoot: report.boundedSlice.sourceRoot,
    pairingRoot: report.boundedSlice.pairingRoot,
    pairedEpisodes: report.boundedSlice.pairedEpisodes,
    sourceEpisodesReplayed: report.boundedSlice.sourceEpisodes,
    recoveryEpisodesReplayed: report.boundedSlice.recoveryEpisodes,
    rawDataObjects: report.boundedSlice.rawDataObjects,
    rawDataBytes: report.boundedSlice.rawDataBytes,
    publisherNowCorrectTrue: report.replayedPublisherClaims.publisherNowCorrectTrue,
    publisherNowCorrectFalse: report.replayedPublisherClaims.publisherNowCorrectFalse,
    trainingRows: 0,
    networkAdmissionRows: 0,
    networkProjectionRows: 0,
    CEU: 0,
    authorityUnits: 0,
  };
  const receipt = { ...receiptBody,
    receiptHash: sha256(Buffer.from(`outsider/agent-trajectory-sentinel-run-receipt/v2\0${
      canonicalizeStrict(receiptBody)}`, "utf8")) };
  writePrivate(path.join(staging, "run-receipt.json"), serialize(receipt));
  const stagedVerified = verifyAgentTrajectorySentinelArtifactDirectory(staging);
  if (!stagedVerified.ok) fail("STAGED_ARTIFACT_REPLAY_FAILED", stagedVerified.error);
  publishAgentTrajectorySentinelArtifactDirectory(staging, target);
  const artifactVerified = verifyAgentTrajectorySentinelArtifactDirectory(target);
  if (!artifactVerified.ok) fail("PUBLISHED_ARTIFACT_REPLAY_FAILED", artifactVerified.error);
  process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory: target,
    disposition: report.disposition, githubCommit: AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT,
    huggingFaceRevision: AGENT_TRAJECTORY_SENTINEL_HF_REVISION,
    sourceEpisodes: report.boundedSlice.sourceEpisodes,
    recoveryEpisodes: report.boundedSlice.recoveryEpisodes,
    pairedEpisodes: report.boundedSlice.pairedEpisodes,
    rawDataObjects: report.boundedSlice.rawDataObjects,
    rawDataBytes: report.boundedSlice.rawDataBytes,
    publisherNowCorrectTrue: report.replayedPublisherClaims.publisherNowCorrectTrue,
    publisherNowCorrectFalse: report.replayedPublisherClaims.publisherNowCorrectFalse,
    privacyReview: report.privacy.reviewDecision,
    rightsGate: report.rights.rightsGate,
    trainingRows: 0, networkAdmissionRows: 0, networkProjectionRows: 0,
    reportHash: report.reportHash, reportFileSha256: sha256(reportBytes),
    sourceRoot: report.boundedSlice.sourceRoot,
    pairingRoot: report.boundedSlice.pairingRoot }, null, 2)}\n`);
} catch (error) {
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
