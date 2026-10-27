#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  AGENTLENS_SOURCE_OBJECT_SPECS,
  buildAgentLensMetadataDispositionReceipt,
  buildAgentLensMetadataDispositionReportFromSource,
  buildAgentLensMetadataSourceManifest,
  publishAgentLensMetadataDispositionArtifactDirectory,
  verifyAgentLensMetadataDispositionArtifactDirectory,
} from "../src/outsider-agentlens-metadata-disposition.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-agentlens-metadata-disposition-20260829-v1";
const FETCH_ATTEMPTS = 4;
const FETCH_TIMEOUT_MS = 240_000;
const USER_AGENT = "outsider-microsoft-agentlens-metadata-disposition/1.0";

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENTLENS_METADATA_ACQUIRE_${code}`
    : `AGENTLENS_METADATA_ACQUIRE_${code}:${detail}`);
}

function canonicalBytes(value) {
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
        "  node scripts/acquire-agentlens-metadata-disposition.mjs [--output-dir <new-dir>]",
        "",
        "Preserves the official Microsoft/arXiv AgentLens metadata, pinned v3 paper,",
        "and bracketed GitHub/Hugging Face public-availability checks. No trajectory,",
        "dialogue, tool-content, label, PTA, or score payload is downloaded. The",
        "terminal result is METADATA_ONLY with zero training and authority.",
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

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function validateWorkspaceTarget(workspace, target) {
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || target === path.parse(target).root || existsSync(target)) {
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
  const parent = path.dirname(target);
  const stat = lstatSync(parent);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("OUTPUT_PARENT_UNSAFE", parent);
}

function checkedUrl(spec) {
  const url = new URL(spec.source);
  const allowedHosts = new Set([
    "www.microsoft.com", "arxiv.org", "export.arxiv.org",
    "api.github.com", "huggingface.co",
  ]);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== ""
    || !allowedHosts.has(url.hostname) || url.toString() !== spec.source) {
    fail("SOURCE_URL_INVALID", spec.label);
  }
  return url;
}

async function readBoundedResponse(response, maximumBytes) {
  if (!response.body) fail("RESPONSE_BODY_MISSING");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared)
    || Number(declared) < 1 || Number(declared) > maximumBytes)) {
    fail("CONTENT_LENGTH_INVALID", declared);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("bounded AgentLens source limit exceeded");
      fail("SOURCE_SIZE_BOUND_EXCEEDED", String(total));
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1) fail("SOURCE_EMPTY");
  return Buffer.concat(chunks, total);
}

async function fetchOnce(spec) {
  const url = checkedUrl(spec);
  const response = await fetch(url, { redirect: "error",
    headers: { accept: spec.contentType === "application/pdf"
      ? "application/pdf" : `${spec.contentType},*/*;q=0.1`,
    "accept-encoding": "identity", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const responseUrl = response.url;
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0].trim().toLowerCase();
  if (response.status !== spec.status || responseUrl !== spec.responseUrl
    || contentType !== spec.contentType) {
    try { await response.body?.cancel("unexpected AgentLens response metadata"); }
    catch { /* best effort */ }
    fail("RESPONSE_METADATA_INVALID",
      `${spec.label}:${response.status}:${contentType}:${responseUrl}`);
  }
  const bytes = await readBoundedResponse(response, spec.maximumBytes);
  return { bytes, observation: { label: spec.label, source: spec.source,
    responseUrl, status: response.status, contentType,
    observedAt: new Date().toISOString() } };
}

async function fetchBounded(spec) {
  let lastError;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try { return await fetchOnce(spec); }
    catch (error) {
      lastError = error;
      if (attempt + 1 === FETCH_ATTEMPTS) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function acquireBracket(specs) {
  return Promise.all(specs.map((spec) => fetchBounded(spec)));
}

async function main() {
  const { outputDir } = parseArgs(process.argv.slice(2));
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(workspace, outputDir);
  validateWorkspaceTarget(workspace, target);
  const parent = path.dirname(target);
  const staging = path.join(parent,
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  if (existsSync(staging)) fail("STAGING_COLLISION");
  mkdirPrivate(staging);
  const source = path.join(staging, "source");
  mkdirPrivate(source);
  mkdirPrivate(path.join(source, "control"));
  mkdirPrivate(path.join(source, "paper"));

  try {
    const beforeSpecs = AGENTLENS_SOURCE_OBJECT_SPECS.filter(
      (item) => item.bracket === "before");
    const afterSpecs = AGENTLENS_SOURCE_OBJECT_SPECS.filter(
      (item) => item.bracket === "after");
    const pdfSpec = AGENTLENS_SOURCE_OBJECT_SPECS.find(
      (item) => item.bracket === "single");
    const before = await acquireBracket(beforeSpecs);
    const pdf = await fetchBounded(pdfSpec);
    const after = await acquireBracket(afterSpecs);
    const fetchedByLabel = new Map([...before, pdf, ...after].map((item) =>
      [item.observation.label, item]));
    for (const spec of AGENTLENS_SOURCE_OBJECT_SPECS) {
      const fetched = fetchedByLabel.get(spec.label);
      if (!fetched) fail("FETCH_RESULT_MISSING", spec.label);
      writePrivate(path.join(source, spec.path), fetched.bytes);
    }
    const observations = AGENTLENS_SOURCE_OBJECT_SPECS.map((spec) =>
      fetchedByLabel.get(spec.label).observation);
    const manifest = buildAgentLensMetadataSourceManifest(source, observations);
    writePrivate(path.join(source, "source-manifest.json"), canonicalBytes(manifest));

    const report = buildAgentLensMetadataDispositionReportFromSource(source);
    const reportBytes = canonicalBytes(report);
    const receipt = buildAgentLensMetadataDispositionReceipt(report, reportBytes);
    writePrivate(path.join(staging, "agentlens-metadata-disposition.json"), reportBytes);
    writePrivate(path.join(staging, "run-receipt.json"), canonicalBytes(receipt));
    const checked = verifyAgentLensMetadataDispositionArtifactDirectory(staging);
    if (!checked.ok) fail("STAGING_VERIFICATION_FAILED", checked.error);
    publishAgentLensMetadataDispositionArtifactDirectory(staging, target);
    process.stdout.write(`${JSON.stringify({ output: target,
      disposition: checked.disposition,
      verificationLevel: checked.verificationLevel,
      artifactHash: checked.artifactHash,
      reportFileSha256: checked.reportFileSha256,
      receiptHash: checked.receipt.receiptHash,
      receiptFileSha256: checked.receiptFileSha256,
      sourceRoot: checked.report.source.sourceRoot,
      sourceManifestHash: checked.report.source.sourceManifestHash,
      sourceManifestFileSha256: checked.report.source.sourceManifestFileSha256,
      observedFrom: checked.report.source.observedFrom,
      observedThrough: checked.report.source.observedThrough,
      officialMetadataObjects: checked.report.source.officialMetadataObjects,
      publicPayloadFiles: checked.report.source.publicPayloadFiles,
      publisherClaimedCorpusTrajectories:
        checked.publisherClaimedCorpusTrajectories,
      publisherClaimedBenchTrajectories:
        checked.publisherClaimedBenchTrajectories,
      sourceNativeTrajectoryRows: checked.sourceNativeTrajectoryRows,
      independentOutcomeUnits: checked.independentOutcomeUnits,
      causalWasteUnits: checked.causalWasteUnits,
      authorizedTrainingRows: checked.authorizedTrainingRows,
      authorityUnits: checked.authorityUnits }, null, 2)}\n`);
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

await main();

