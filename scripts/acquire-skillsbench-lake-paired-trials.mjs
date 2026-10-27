#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  SKILLSBENCH_DATASET_ID, SKILLSBENCH_EXPECTED,
  SKILLSBENCH_PRIMARY_REVISION, SKILLSBENCH_REGISTRY_REPOSITORY,
  SKILLSBENCH_REGISTRY_REVISION, SKILLSBENCH_TASK,
  SKILLSBENCH_TASK_REVISION, SKILLSBENCH_TRIAL_REVISION,
  buildSkillsbenchLakePairedReportFromSource,
  createSkillsbenchLakePairedReceipt,
  createSkillsbenchSourceManifestFromDirectory,
  deriveSkillsbenchSelectedTrialEntries,
  serializeSkillsbenchArtifact, skillsbenchSha256,
  verifySkillsbenchLakePairedArtifactDirectory,
  verifySkillsbenchSourceDirectory,
} from "../src/outsider-skillsbench-lake-paired-trials.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-skillsbench-lake-paired-trials-20260829-v1";
const REGISTRY_ROOT_TREE = "13b376cf432035cd8e55d8fd323fae0eed187402";
const TASK_ROOT_TREE = "dcd76dc41b51321083008826be93e0476a2e98dc";
const TASKS_TREE = "126e896fd0efb3f5319bf13674d55e49cb242f11";
const SELECTED_TASK_TREE = SKILLSBENCH_EXPECTED.taskTree;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_NETWORK_BYTES = 300_000_000;
const MAX_TREE_PAGE_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 180_000;
const FETCH_ATTEMPTS = 4;
const HF = "https://huggingface.co";
const HF_API = `${HF}/api/datasets/${SKILLSBENCH_DATASET_ID}`;
const HF_RESOLVE = `${HF}/datasets/${SKILLSBENCH_DATASET_ID}/resolve`;
const GITHUB_API = `https://api.github.com/repos/${SKILLSBENCH_REGISTRY_REPOSITORY}`;
const GITHUB_RAW = `https://raw.githubusercontent.com/${SKILLSBENCH_REGISTRY_REPOSITORY}`;

let networkBytes = 0;

function fail(code, detail = null) {
  throw new Error(detail === null ? `SKILLSBENCH_ACQUIRE_${code}`
    : `SKILLSBENCH_ACQUIRE_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { output: DEFAULT_OUTPUT, mainTreeSeed: null,
    trialTreeSeed: null, trialObjectSeed: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) result.output = argv[++index];
    else if (argument === "--main-tree-seed" && argv[index + 1]) {
      result.mainTreeSeed = path.resolve(argv[++index]);
    } else if (argument === "--trial-tree-seed" && argv[index + 1]) {
      result.trialTreeSeed = path.resolve(argv[++index]);
    } else if (argument === "--trial-object-seed" && argv[index + 1]) {
      result.trialObjectSeed = path.resolve(argv[++index]);
    } else if (["--help", "-h"].includes(argument)) result.help = true;
    else fail("ARGUMENT_INVALID", argument);
  }
  return result;
}

function mkdirPrivate(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function ensureParents(file) {
  const missing = [];
  let cursor = path.dirname(file);
  while (!existsSync(cursor)) {
    missing.push(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) fail("PARENT_ROOT_REACHED", file);
    cursor = parent;
  }
  for (const directory of missing.reverse()) mkdirPrivate(directory);
}

function writePrivateOnce(file, bytes) {
  ensureParents(file);
  if (existsSync(file)) {
    const status = lstatSync(file);
    if (!status.isFile() || status.isSymbolicLink()
      || (status.mode & 0o777) !== 0o600
      || !readFileSync(file).equals(bytes)) fail("CHECKPOINT_CONFLICT", file);
    return false;
  }
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  return true;
}

function canonicalBytes(value) {
  return serializeSkillsbenchArtifact(value);
}

function targetInsideWorkspace(value) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || target === path.parse(target).root) {
    fail("OUTPUT_OUTSIDE_WORKSPACE", target);
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
  return target;
}

function allowedInitial(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== ""
    || !["huggingface.co", "api.github.com", "raw.githubusercontent.com"]
      .includes(url.hostname)) fail("URL_REFUSED", value);
  return url;
}

function allowedFinal(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== ""
    || !(url.hostname === "huggingface.co" || url.hostname === "api.github.com"
      || url.hostname === "raw.githubusercontent.com" || url.hostname.endsWith(".hf.co")
      || url.hostname.endsWith(".xethub.hf.co")
      || url.hostname.endsWith(".xethub.hf.space"))) fail("FINAL_URL_REFUSED", value);
  return url;
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readBounded(response, maximumBytes) {
  if (!response.body) fail("BODY_MISSING");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/u.test(declared)
    || Number(declared) > maximumBytes)) fail("CONTENT_LENGTH_INVALID", declared);
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("bounded download exceeded");
      fail("BODY_BOUND_EXCEEDED", String(total));
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1) fail("BODY_EMPTY");
  networkBytes += total;
  if (networkBytes > MAX_TOTAL_NETWORK_BYTES) fail("TOTAL_NETWORK_BOUND_EXCEEDED");
  return Buffer.concat(chunks, total);
}

async function fetchOnce(value, maximumBytes) {
  const initial = allowedInitial(value);
  const response = await fetch(initial, { redirect: "follow",
    headers: { accept: "application/json,text/plain;q=0.9,*/*;q=0.1",
      "accept-encoding": "identity", "user-agent": "outsider-skillsbench-intake/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (response.status !== 200) {
    const error = new Error(`HTTP_${response.status}`);
    error.retryable = response.status === 408 || response.status === 429
      || response.status >= 500;
    throw error;
  }
  allowedFinal(response.url || initial.href);
  return { bytes: await readBounded(response, maximumBytes),
    etag: response.headers.get("etag") ?? "NO_ETAG",
    link: response.headers.get("link"), responseUrl: response.url || initial.href };
}

async function boundedFetch(value, maximumBytes) {
  let lastError;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try { return await fetchOnce(value, maximumBytes); }
    catch (error) {
      lastError = error;
      const text = String(error?.message ?? error);
      const retryable = error?.retryable === true || error?.name === "TimeoutError"
        || error?.name === "AbortError"
        || /(?:fetch failed|network|timeout|ECONN|ENOTFOUND|EAI_AGAIN)/iu.test(text);
      if (!retryable || attempt === FETCH_ATTEMPTS - 1) throw error;
      await delay(500 * (2 ** attempt));
    }
  }
  throw lastError;
}

async function checkpointRemote(file, url, maximumBytes = MAX_RESPONSE_BYTES) {
  if (existsSync(file)) {
    const status = lstatSync(file);
    if (!status.isFile() || status.isSymbolicLink()
      || (status.mode & 0o777) !== 0o600 || status.size < 1
      || status.size > maximumBytes) fail("CHECKPOINT_FILE_UNSAFE", file);
    return readFileSync(file);
  }
  const fetched = await boundedFetch(url, maximumBytes);
  writePrivateOnce(file, fetched.bytes);
  return fetched.bytes;
}

function treeFirstUrl(revision) {
  return `${HF_API}/tree/${revision}?recursive=true&limit=1000`;
}

function treePageStem(directory, page) {
  return path.join(directory, `page-${String(page).padStart(3, "0")}`);
}

function existingTreePage(directory, revision, page, requestUrl) {
  const stem = treePageStem(directory, page);
  const bodyFile = `${stem}.json`;
  const metaFile = `${stem}.meta.json`;
  if (!existsSync(bodyFile) || !existsSync(metaFile)) return null;
  const body = readFileSync(bodyFile);
  const meta = JSON.parse(readFileSync(metaFile));
  if (lstatSync(bodyFile).isSymbolicLink() || lstatSync(metaFile).isSymbolicLink()
    || (lstatSync(bodyFile).mode & 0o777) !== 0o600
    || (lstatSync(metaFile).mode & 0o777) !== 0o600
    || meta.schema !== "outsider/skillsbench-hf-tree-page/v1"
    || meta.revision !== revision || meta.page !== page
    || meta.requestUrl !== requestUrl || meta.bodyBytes !== body.length
    || meta.bodySha256 !== skillsbenchSha256(body)) fail("TREE_CHECKPOINT_INVALID", page);
  return meta.nextUrl;
}

async function acquireTreePhase(directory, revision, expectedPages) {
  mkdirPrivate(directory);
  let next = treeFirstUrl(revision);
  for (let page = 1; page <= expectedPages; page += 1) {
    const existingNext = existingTreePage(directory, revision, page, next);
    if (existingNext !== null || page === expectedPages && existingNext === null
      && existsSync(`${treePageStem(directory, page)}.meta.json`)) {
      next = existingNext;
      process.stderr.write(`skillsbench-tree resume ${page}/${expectedPages}\n`);
      continue;
    }
    const fetched = await boundedFetch(next, MAX_TREE_PAGE_BYTES);
    let rows;
    try { rows = JSON.parse(fetched.bytes); }
    catch { fail("TREE_PAGE_JSON_INVALID", page); }
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 1_000) {
      fail("TREE_PAGE_ROWS_INVALID", page);
    }
    const match = fetched.link?.match(/<([^>]+)>; rel="next"/u);
    const nextUrl = match?.[1] ?? null;
    const meta = { schema: "outsider/skillsbench-hf-tree-page/v1", revision,
      page, requestUrl: next, responseUrl: fetched.responseUrl,
      etag: fetched.etag, entries: rows.length, nextUrl,
      bodyBytes: fetched.bytes.length, bodySha256: skillsbenchSha256(fetched.bytes) };
    const stem = treePageStem(directory, page);
    writePrivateOnce(`${stem}.json`, fetched.bytes);
    writePrivateOnce(`${stem}.meta.json`, canonicalBytes(meta));
    next = nextUrl;
    if (page < expectedPages && next === null
      || page === expectedPages && next !== null) fail("TREE_PAGE_TERMINUS_INVALID", page);
    process.stderr.write(`skillsbench-tree network ${page}/${expectedPages}\n`);
  }
}

function seedPageFiles(seed) {
  const status = lstatSync(seed);
  if (!status.isDirectory() || status.isSymbolicLink()) fail("TREE_SEED_UNSAFE", seed);
  const pages = readdirSync(seed).filter((name) => /^page-[0-9]+\.json$/u.test(name))
    .map((name) => ({ name, page: Number(name.match(/[0-9]+/u)[0]) }))
    .sort((left, right) => left.page - right.page);
  return pages;
}

function importTreeSeed(seed, directory, revision, expectedPages) {
  mkdirPrivate(directory);
  const pages = seedPageFiles(seed);
  if (pages.length !== expectedPages || pages.some((item, index) => item.page !== index + 1)) {
    fail("TREE_SEED_PAGE_COUNT_INVALID", seed);
  }
  let expectedUrl = treeFirstUrl(revision);
  for (const item of pages) {
    const body = readFileSync(path.join(seed, item.name));
    const legacyMetaName = `meta-${String(item.page).padStart(2, "0")}.json`;
    const legacyMeta = JSON.parse(readFileSync(path.join(seed, legacyMetaName)));
    const requestUrl = legacyMeta.requestUrl ?? legacyMeta.url;
    const nextUrl = legacyMeta.nextUrl !== undefined ? legacyMeta.nextUrl : legacyMeta.next;
    const rows = JSON.parse(body);
    if (requestUrl !== expectedUrl || !Array.isArray(rows)
      || rows.length !== legacyMeta.entries || rows.length < 1 || rows.length > 1_000
      || typeof legacyMeta.etag !== "string") fail("TREE_SEED_PAGE_INVALID", item.page);
    const meta = { schema: "outsider/skillsbench-hf-tree-page/v1", revision,
      page: item.page, requestUrl, responseUrl: requestUrl, etag: legacyMeta.etag,
      entries: rows.length, nextUrl: nextUrl ?? null, bodyBytes: body.length,
      bodySha256: skillsbenchSha256(body) };
    const stem = treePageStem(directory, item.page);
    writePrivateOnce(`${stem}.json`, body);
    writePrivateOnce(`${stem}.meta.json`, canonicalBytes(meta));
    expectedUrl = meta.nextUrl;
  }
  if (expectedUrl !== null) fail("TREE_SEED_TERMINUS_INVALID", seed);
}

function remotePathUrl(base, remotePath) {
  return `${base}/${remotePath.split("/").map(encodeURIComponent).join("/")}`;
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes).digest("hex");
}

function verifySeedObject(bytes, entry) {
  if (bytes.length !== entry.size) fail("TRIAL_SEED_SIZE_INVALID", entry.path);
  if (entry.lfs) {
    if (skillsbenchSha256(bytes) !== `sha256:${entry.lfs.oid}`) {
      fail("TRIAL_SEED_LFS_INVALID", entry.path);
    }
  } else if (gitBlobOid(bytes) !== entry.oid) fail("TRIAL_SEED_OID_INVALID", entry.path);
}

async function acquireTrialObjects(source, seed) {
  const entries = deriveSkillsbenchSelectedTrialEntries(
    path.join(source, "trial/tree-before"));
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const target = path.join(source, "trial/objects", ...entry.path.split("/"));
    if (existsSync(target)) {
      verifySeedObject(readFileSync(target), entry);
      continue;
    }
    let bytes;
    if (seed !== null) {
      const seeded = path.join(seed, ...entry.path.split("/"));
      if (existsSync(seeded)) bytes = readFileSync(seeded);
    }
    if (bytes === undefined) {
      bytes = (await boundedFetch(remotePathUrl(
        `${HF_RESOLVE}/${SKILLSBENCH_TRIAL_REVISION}`, entry.path),
      Math.min(MAX_RESPONSE_BYTES, entry.size))).bytes;
    }
    verifySeedObject(bytes, entry);
    writePrivateOnce(target, bytes);
    process.stderr.write(`skillsbench-trial ${index + 1}/${entries.length}\n`);
  }
}

async function acquireHfSupport(source) {
  const main = {
    "README.md": "main/support/README.md",
    "analysis/experiment_final_selected_manifest.json":
      "main/support/experiment-final-selected-manifest.json",
    "analysis/experiment_final_selected_summary.md":
      "main/support/experiment-final-selected-summary.md",
  };
  const trial = {
    ".gitattributes": "trial/support/.gitattributes", "README.md": "trial/support/README.md",
    [`submissions/skillsbench/v1.1/openhands-no-skills__minimax-MiniMax-M3/metadata.yaml`]:
      "trial/support/metadata-without.yaml",
    [`submissions/skillsbench/v1.1/openhands-with-skills__minimax-MiniMax-M3/metadata.yaml`]:
      "trial/support/metadata-with.yaml",
  };
  for (const [remotePath, localPath] of Object.entries(main)) {
    await checkpointRemote(path.join(source, localPath), remotePathUrl(
      `${HF_RESOLVE}/${SKILLSBENCH_PRIMARY_REVISION}`, remotePath), 8 * 1024 * 1024);
  }
  for (const [remotePath, localPath] of Object.entries(trial)) {
    await checkpointRemote(path.join(source, localPath), remotePathUrl(
      `${HF_RESOLVE}/${SKILLSBENCH_TRIAL_REVISION}`, remotePath));
  }
}

async function acquireGithub(source) {
  const github = path.join(source, "github");
  mkdirPrivate(github);
  const registryCommitUrl = `${GITHUB_API}/commits/${SKILLSBENCH_REGISTRY_REVISION}`;
  const taskCommitUrl = `${GITHUB_API}/commits/${SKILLSBENCH_TASK_REVISION}`;
  await checkpointRemote(path.join(github, "registry-commit-before.json"),
    registryCommitUrl, 2 * 1024 * 1024);
  await checkpointRemote(path.join(github, "registry-root-tree-before.json"),
    `${GITHUB_API}/git/trees/${REGISTRY_ROOT_TREE}`, 2 * 1024 * 1024);
  for (const name of ["registry.json", "LICENSE", "README.md"]) {
    await checkpointRemote(path.join(github, "registry-files", name),
      `${GITHUB_RAW}/${SKILLSBENCH_REGISTRY_REVISION}/${name}`, 2 * 1024 * 1024);
  }
  await checkpointRemote(path.join(github, "task-commit-before.json"),
    taskCommitUrl, 2 * 1024 * 1024);
  await checkpointRemote(path.join(github, "task-root-tree-before.json"),
    `${GITHUB_API}/git/trees/${TASK_ROOT_TREE}`, 2 * 1024 * 1024);
  await checkpointRemote(path.join(github, "tasks-tree-before.json"),
    `${GITHUB_API}/git/trees/${TASKS_TREE}`, 2 * 1024 * 1024);
  const taskTreeBytes = await checkpointRemote(path.join(github,
    "selected-task-tree-before.json"),
  `${GITHUB_API}/git/trees/${SELECTED_TASK_TREE}?recursive=1`, 2 * 1024 * 1024);
  const taskTree = JSON.parse(taskTreeBytes);
  if (!Array.isArray(taskTree.tree) || taskTree.sha !== SELECTED_TASK_TREE) {
    fail("TASK_TREE_INVALID");
  }
  for (const entry of taskTree.tree.filter((item) => item.type === "blob")) {
    const target = path.join(github, "task-objects", ...entry.path.split("/"));
    await checkpointRemote(target, remotePathUrl(
      `${GITHUB_RAW}/${SKILLSBENCH_TASK_REVISION}/tasks/${SKILLSBENCH_TASK}`,
      entry.path), Math.min(MAX_RESPONSE_BYTES, entry.size));
  }
  await checkpointRemote(path.join(github, "selected-task-tree-after.json"),
    `${GITHUB_API}/git/trees/${SELECTED_TASK_TREE}?recursive=1`, 2 * 1024 * 1024);
  await checkpointRemote(path.join(github, "tasks-tree-after.json"),
    `${GITHUB_API}/git/trees/${TASKS_TREE}`, 2 * 1024 * 1024);
  await checkpointRemote(path.join(github, "task-root-tree-after.json"),
    `${GITHUB_API}/git/trees/${TASK_ROOT_TREE}`, 2 * 1024 * 1024);
  await checkpointRemote(path.join(github, "task-commit-after.json"),
    taskCommitUrl, 2 * 1024 * 1024);
  await checkpointRemote(path.join(github, "registry-root-tree-after.json"),
    `${GITHUB_API}/git/trees/${REGISTRY_ROOT_TREE}`, 2 * 1024 * 1024);
  await checkpointRemote(path.join(github, "registry-commit-after.json"),
    registryCommitUrl, 2 * 1024 * 1024);
}

async function acquireSource(source, args) {
  mkdirPrivate(source);
  mkdirPrivate(path.join(source, "main"));
  mkdirPrivate(path.join(source, "trial"));
  const mainRecordUrl = `${HF_API}/revision/${SKILLSBENCH_PRIMARY_REVISION}`;
  const trialRecordUrl = `${HF_API}/revision/${SKILLSBENCH_TRIAL_REVISION}`;
  await checkpointRemote(path.join(source, "main/record-before.json"),
    mainRecordUrl, 8 * 1024 * 1024);
  if (args.mainTreeSeed !== null && !existsSync(path.join(source,
    "main/tree-before/page-001.json"))) {
    importTreeSeed(args.mainTreeSeed, path.join(source, "main/tree-before"),
      SKILLSBENCH_PRIMARY_REVISION, SKILLSBENCH_EXPECTED.primary.pages);
  }
  await acquireTreePhase(path.join(source, "main/tree-before"),
    SKILLSBENCH_PRIMARY_REVISION, SKILLSBENCH_EXPECTED.primary.pages);
  await checkpointRemote(path.join(source, "trial/record-before.json"),
    trialRecordUrl, 8 * 1024 * 1024);
  if (args.trialTreeSeed !== null && !existsSync(path.join(source,
    "trial/tree-before/page-001.json"))) {
    importTreeSeed(args.trialTreeSeed, path.join(source, "trial/tree-before"),
      SKILLSBENCH_TRIAL_REVISION, SKILLSBENCH_EXPECTED.trial.pages);
  }
  await acquireTreePhase(path.join(source, "trial/tree-before"),
    SKILLSBENCH_TRIAL_REVISION, SKILLSBENCH_EXPECTED.trial.pages);
  await acquireHfSupport(source);
  await acquireTrialObjects(source, args.trialObjectSeed);
  await acquireGithub(source);
  await acquireTreePhase(path.join(source, "trial/tree-after"),
    SKILLSBENCH_TRIAL_REVISION, SKILLSBENCH_EXPECTED.trial.pages);
  await checkpointRemote(path.join(source, "trial/record-after.json"),
    trialRecordUrl, 8 * 1024 * 1024);
  await acquireTreePhase(path.join(source, "main/tree-after"),
    SKILLSBENCH_PRIMARY_REVISION, SKILLSBENCH_EXPECTED.primary.pages);
  await checkpointRemote(path.join(source, "main/record-after.json"),
    mainRecordUrl, 8 * 1024 * 1024);
  const manifest = createSkillsbenchSourceManifestFromDirectory(source);
  writePrivateOnce(path.join(source, "source-manifest.json"), canonicalBytes(manifest));
  const verified = verifySkillsbenchSourceDirectory(source);
  if (!verified.ok) fail("SOURCE_REPLAY_FAILED", verified.error);
}

function privateTree(root) {
  const status = lstatSync(root);
  if (status.isSymbolicLink()) fail("PUBLISH_SYMLINK_REFUSED", root);
  if (status.isDirectory()) {
    chmodSync(root, 0o700);
    for (const name of readdirSync(root)) privateTree(path.join(root, name));
  } else if (status.isFile()) chmodSync(root, 0o600);
  else fail("PUBLISH_SPECIAL_FILE_REFUSED", root);
}

export async function runSkillsbenchLakeAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-skillsbench-lake-paired-trials.mjs [--output-dir <new-dir>]",
      "    [--main-tree-seed <checkpoint-pages>] [--trial-tree-seed <checkpoint-pages>]",
      "    [--trial-object-seed <remote-path-root>]",
      "",
      "Acquires the full requested main inventory before/after, the official PR5",
      "pre-selection inventory before/after, all seven source-native fresh trials",
      "for the smallest complete OpenHands task/model pair, and its pinned v1.1",
      "task/Skill closure. Raw trajectories, commands, prompts, and Skills stay 0600",
      "private and are never executed. A resumable source checkpoint is retained on",
      "network or replay failure.",
    ].join("\n") + "\n");
    return { ok: true, help: true };
  }
  const target = targetInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  const checkpoint = `${target}.source-checkpoint`;
  if (!existsSync(checkpoint)) mkdirPrivate(checkpoint);
  if (existsSync(path.join(checkpoint, "source-manifest.json"))) {
    const checked = verifySkillsbenchSourceDirectory(checkpoint);
    if (!checked.ok) fail("EXISTING_CHECKPOINT_INVALID", checked.error);
  } else await acquireSource(checkpoint, args);

  const report = buildSkillsbenchLakePairedReportFromSource(checkpoint);
  const reportBytes = canonicalBytes(report);
  const manifestBytes = readFileSync(path.join(checkpoint, "source-manifest.json"));
  const receipt = createSkillsbenchLakePairedReceipt(report, reportBytes, manifestBytes);
  const receiptBytes = canonicalBytes(receipt);
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  let sourceMoved = false;
  try {
    mkdirPrivate(staging);
    writePrivateOnce(path.join(staging, "report.json"), reportBytes);
    renameSync(checkpoint, path.join(staging, "source"));
    sourceMoved = true;
    // Receipt is deliberately the final file written before atomic publication.
    writePrivateOnce(path.join(staging, "run-receipt.json"), receiptBytes);
    privateTree(staging);
    renameSync(staging, target);
    sourceMoved = false;
    const verified = verifySkillsbenchLakePairedArtifactDirectory(target);
    if (!verified.ok) fail("PUBLISHED_ARTIFACT_INVALID", verified.error);
    const summary = { ok: true, outputDirectory: target,
      primaryRevision: SKILLSBENCH_PRIMARY_REVISION,
      trialRevision: SKILLSBENCH_TRIAL_REVISION,
      primaryTreeEntries: report.source.primaryInventory.entries,
      primaryTreeFiles: report.source.primaryInventory.files,
      trialTreeEntries: report.source.trialInventory.entries,
      eligiblePairs: report.boundedSelection.eligibleTaskModelPairs,
      selectedTask: SKILLSBENCH_TASK,
      attempts: report.boundedSelection.attemptDenominator,
      withSkillTrials: report.boundedSelection.withSkillTrials,
      noSkillTrials: report.boundedSelection.noSkillTrials,
      timeouts: report.replay.timeoutTrials,
      partialTrajectories: report.replay.partialTrajectories,
      publisherPass: report.replay.publisherPass,
      selectedTrialBytes: report.boundedSelection.selectedBytes,
      artifactHash: report.artifactHash, receiptHash: receipt.receiptHash,
      sourceManifestHash: report.source.sourceManifestHash,
      sourceRoot: report.source.sourceRoot, networkBytes,
      authorizedTrainingRows: 0, offlineModelFittingRows: 0,
      productionTrainingRows: 0, independentOutcomeUnits: 0,
      recoveryUnits: 0, authorityUnits: 0 };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  } catch (error) {
    if (sourceMoved && existsSync(path.join(staging, "source"))
      && !existsSync(checkpoint)) renameSync(path.join(staging, "source"), checkpoint);
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  runSkillsbenchLakeAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}

