#!/usr/bin/env node

import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  FACTORYBENCH_ARTIFACT_SCHEMA, FACTORYBENCH_ID, FACTORYBENCH_PROFILE,
  FACTORYBENCH_REVISION, acquirePinnedFactoryBenchSource,
  buildFactoryBenchArtifactFromSource, factoryBenchSha256,
  verifyFactoryBenchArtifact, verifyFactoryBenchSourceDirectory,
} from "../src/outsider-factorybench-bounded-slice.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-factorybench-bounded-slice-20260829-v1";
const STAGING_SCHEMA = "outsider/factorybench-artifact-checkpoint/v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `FACTORYBENCH_CLI_${code}`
    : `FACTORYBENCH_CLI_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { output: DEFAULT_OUTPUT, python: ".venv/bin/python", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      if (!argv[index + 1]) fail("OUTPUT_ARGUMENT_MISSING");
      result.output = argv[++index];
    } else if (argument === "--python") {
      if (!argv[index + 1]) fail("PYTHON_ARGUMENT_MISSING");
      result.python = argv[++index];
    } else if (argument === "--help" || argument === "-h") result.help = true;
    else fail("ARGUMENT_UNKNOWN", argument);
  }
  return result;
}

function workspaceTarget(value) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (target === path.parse(target).root || relative === "" || relative === ".."
    || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  }
  return target;
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function writeCanonicalStable(file, value) {
  const bytes = canonicalBytes(value);
  if (existsSync(file)) {
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()
      || !readFileSync(file).equals(bytes)) fail("CHECKPOINT_FILE_MISMATCH", file);
  } else writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  return { path: path.basename(file), bytes: bytes.length,
    sha256: factoryBenchSha256(bytes) };
}

function checkpointMarker(target) {
  return { schema: STAGING_SCHEMA, target, dataset: FACTORYBENCH_ID,
    revision: FACTORYBENCH_REVISION, selectedBytes: FACTORYBENCH_PROFILE.selectedBytes };
}

function ensureFreshOrCheckpoint(target) {
  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("OUTPUT_UNSAFE", target);
    const entries = readdirSync(target).sort();
    if (entries.length !== 1 || entries[0] !== "source") {
      fail("OUTPUT_EXISTS", target);
    }
    const checked = verifyFactoryBenchSourceDirectory(path.join(target, "source"));
    if (!checked.ok) fail("OUTPUT_EXISTS_INVALID_SOURCE", checked.error);
    chmodSync(target, 0o700);
    return { stage: target, markerFile: null, recoveredSourceOnlyTarget: true };
  }
  const stage = `${target}.checkpoint`;
  if (!existsSync(stage)) mkdirSync(stage, { recursive: true, mode: 0o700 });
  const stat = lstatSync(stage);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("STAGING_UNSAFE", stage);
  const markerFile = path.join(stage, "artifact-checkpoint.json");
  const marker = checkpointMarker(target);
  const existing = readdirSync(stage).sort();
  if (!existsSync(markerFile) && existing.length > 0) fail("STAGING_MARKER_MISSING", stage);
  writeCanonicalStable(markerFile, marker);
  chmodSync(stage, 0o700);
  return { stage, markerFile, recoveredSourceOnlyTarget: false };
}

function enforcePrivateTree(root) {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", root);
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) enforcePrivateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

function domainHash(domain, value) {
  return factoryBenchSha256(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

export async function runFactoryBenchAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-factorybench-bounded-slice.mjs",
      "    [--output <new-dir>] [--python <python>]",
      "",
      "Acquires the fixed 291,800,891-byte FactoryBench natural slice,",
      "captures the complete repository tree before and after, and fully",
      "replays all selected JSONL, Parquet, knowledge-graph, and join bytes.",
      "Alternate QA and signal tables remain exact tree-bound inventory.",
    ].join("\n") + "\n");
    return null;
  }
  const target = workspaceTarget(args.output);
  const parent = path.dirname(target);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
  const parentStat = lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    fail("OUTPUT_PARENT_UNSAFE", parent);
  }
  const { stage, markerFile, recoveredSourceOnlyTarget } =
    ensureFreshOrCheckpoint(target);
  const sourceDirectory = path.join(stage, "source");
  let source;
  if (existsSync(sourceDirectory)) {
    source = verifyFactoryBenchSourceDirectory(sourceDirectory);
    if (!source.ok) fail("CHECKPOINT_SOURCE_INVALID", source.error);
  } else {
    source = await acquirePinnedFactoryBenchSource(sourceDirectory, {
      checkpointDirectory: path.join(stage, "source.checkpoint"),
    });
  }
  const artifact = buildFactoryBenchArtifactFromSource(sourceDirectory,
    { pythonExecutable: args.python });
  const standalone = verifyFactoryBenchArtifact(artifact);
  if (!standalone.ok) fail("ARTIFACT_INVALID", standalone.error);
  const report = writeCanonicalStable(path.join(stage,
    "factorybench-bounded-slice.json"), artifact);
  const manifestBody = {
    schema: "outsider/factorybench-bounded-slice-artifact-manifest/v1",
    reportSchema: FACTORYBENCH_ARTIFACT_SCHEMA, report,
    reportHash: artifact.artifactHash,
    sourceManifestHash: source.manifest.manifestHash,
    sourceRoot: source.manifest.sourceRoot,
    sourceClosure: source.manifest.closure,
    typedDenominators: artifact.typedDenominators,
    sourceDrift: artifact.sourceDrift,
    urSignalCoverage: artifact.urSignalCoverage,
    semantics: artifact.semantics, rights: artifact.rights,
    privacy: artifact.privacy, boundary: artifact.boundary,
  };
  const artifactManifest = { ...manifestBody,
    manifestHash: domainHash(
      "outsider/factorybench-bounded-slice-artifact-manifest/v1", manifestBody) };
  writeCanonicalStable(path.join(stage, "artifact-manifest.json"), artifactManifest);
  if (markerFile !== null) unlinkSync(markerFile);
  const receiptBody = {
    schema: "outsider/factorybench-bounded-slice-receipt/v1",
    artifactHash: artifact.artifactHash,
    artifactManifestHash: artifactManifest.manifestHash,
    sourceManifestHash: source.manifest.manifestHash,
    sourceRoot: source.manifest.sourceRoot,
    selectedFiles: 11, selectedBytes: 291_800_891,
    terminalDispositionFiles: 18,
    verificationLevel:
      "FULL_JSONL_PARQUET_SIGNAL_EPISODE_FLOW_KG_AND_PROVENANCE_REPLAY",
  };
  const receipt = { ...receiptBody,
    receiptHash: domainHash("outsider/factorybench-bounded-slice-receipt/v1",
      receiptBody) };
  writeCanonicalStable(path.join(stage, "receipt.json"), receipt);
  enforcePrivateTree(stage);
  if (!recoveredSourceOnlyTarget) {
    renameSync(stage, target);
    chmodSync(target, 0o700);
  }
  const summary = {
    status: artifact.status, admission: artifact.admission,
    output: path.relative(process.cwd(), target),
    selectedFiles: source.manifest.closure.selectedFiles,
    selectedBytes: source.manifest.closure.selectedBytes,
    treeFiles: source.manifest.closure.recursiveTreeFiles,
    qaLiteRows: artifact.replay.qaLite.rows,
    signalRows: artifact.replay.urSignals10Hz.rows,
    signalFields: artifact.replay.urSignals10Hz.fields,
    signalEpisodes: artifact.replay.urSignals10Hz.uniqueEpisodes,
    episodeMetadataRows: artifact.replay.episodes.rows,
    artifactHash: artifact.artifactHash,
    artifactManifestHash: artifactManifest.manifestHash,
    receiptHash: receipt.receiptHash,
    sourceManifestHash: source.manifest.manifestHash,
    sourceRoot: source.manifest.sourceRoot,
    privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
    reliableOutcome: 0, independentOutcome: 0, directCausalEffect: 0,
    recovery: 0,
  };
  process.stdout.write(`${canonicalizeStrict(summary)}\n`);
  return summary;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked !== null && invoked === fileURLToPath(import.meta.url)) {
  runFactoryBenchAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
