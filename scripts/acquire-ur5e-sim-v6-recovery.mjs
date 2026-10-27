#!/usr/bin/env node

import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  UR5E_SIM_V6_ARTIFACT_SCHEMA, UR5E_SIM_V6_ID, UR5E_SIM_V6_PROFILE,
  UR5E_SIM_V6_REVISION, acquirePinnedUr5eSimV6Source,
  buildUr5eSimV6ArtifactFromSource, ur5eSimV6Sha256,
  verifyUr5eSimV6Artifact, verifyUr5eSimV6SourceDirectory,
} from "../src/outsider-ur5e-sim-v6-recovery.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-ur5e-sim-v6-recovery-20260830-v1";
const STAGING_SCHEMA =
  "outsider/ur5e-sim-v6-recovery-artifact-checkpoint/v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `UR5E_SIM_V6_CLI_${code}`
    : `UR5E_SIM_V6_CLI_${code}:${detail}`);
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
    sha256: ur5eSimV6Sha256(bytes) };
}

function checkpointMarker(target) {
  return { schema: STAGING_SCHEMA, target, dataset: UR5E_SIM_V6_ID,
    revision: UR5E_SIM_V6_REVISION,
    selectedBytes: UR5E_SIM_V6_PROFILE.selectedBytes };
}

function ensureFreshOrCheckpoint(target) {
  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("OUTPUT_UNSAFE", target);
    const entries = readdirSync(target).sort();
    if (entries.length !== 1 || entries[0] !== "source") fail("OUTPUT_EXISTS", target);
    const checked = verifyUr5eSimV6SourceDirectory(path.join(target, "source"));
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
  return ur5eSimV6Sha256(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

export async function runUr5eSimV6Acquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-ur5e-sim-v6-recovery.mjs",
      "    [--output <new-dir>] [--python <python>]",
      "",
      "Acquires the fixed all-episode semantic no-video closure (seven files,",
      "84,162,060 bytes). All 39 video files remain byte-exact recursive-tree",
      "inventory and contribute zero selected bytes.",
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
    source = verifyUr5eSimV6SourceDirectory(sourceDirectory);
    if (!source.ok) fail("CHECKPOINT_SOURCE_INVALID", source.error);
  } else {
    source = await acquirePinnedUr5eSimV6Source(sourceDirectory, {
      checkpointDirectory: path.join(stage, "source.checkpoint"),
    });
  }
  const artifact = buildUr5eSimV6ArtifactFromSource(sourceDirectory,
    { pythonExecutable: args.python });
  const standalone = verifyUr5eSimV6Artifact(artifact);
  if (!standalone.ok) fail("ARTIFACT_INVALID", standalone.error);
  const report = writeCanonicalStable(path.join(stage,
    "ur5e-sim-v6-recovery.json"), artifact);
  const manifestBody = {
    schema: "outsider/ur5e-sim-v6-recovery-artifact-manifest/v1",
    reportSchema: UR5E_SIM_V6_ARTIFACT_SCHEMA, report,
    reportHash: artifact.artifactHash,
    sourceManifestHash: source.manifest.manifestHash,
    sourceRoot: source.manifest.sourceRoot,
    sourceClosure: source.manifest.closure,
    typedDenominators: artifact.typedDenominators,
    publisherNamingBoundary: artifact.publisherNamingBoundary,
    semantics: artifact.semantics, rights: artifact.rights,
    privacy: artifact.privacy, boundary: artifact.boundary,
  };
  const artifactManifest = { ...manifestBody,
    manifestHash: domainHash(
      "outsider/ur5e-sim-v6-recovery-artifact-manifest/v1", manifestBody) };
  writeCanonicalStable(path.join(stage, "artifact-manifest.json"), artifactManifest);
  if (markerFile !== null) unlinkSync(markerFile);
  const receiptBody = {
    schema: "outsider/ur5e-sim-v6-recovery-receipt/v1",
    artifactHash: artifact.artifactHash,
    artifactManifestHash: artifactManifest.manifestHash,
    sourceManifestHash: source.manifest.manifestHash,
    sourceRoot: source.manifest.sourceRoot,
    selectedFiles: 7, selectedBytes: 84_162_060,
    terminalDispositionFiles: 46,
    verificationLevel:
      "FULL_PARQUET_EPISODE_TASK_STATS_AND_VIDEO_METADATA_WINDOW_REPLAY",
  };
  const receipt = { ...receiptBody,
    receiptHash: domainHash(
      "outsider/ur5e-sim-v6-recovery-receipt/v1", receiptBody) };
  // Receipt is deliberately the final file written into the staged artifact.
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
    episodes: artifact.replay.episodes.rows,
    actionStateFrames: artifact.replay.data.rows,
    videoInventoryFiles: artifact.replay.videoMetadataOnly.inventoryFiles,
    selectedVideoBytes: artifact.replay.videoMetadataOnly.videoBytesAcquired,
    artifactHash: artifact.artifactHash,
    artifactManifestHash: artifactManifest.manifestHash,
    receiptHash: receipt.receiptHash,
    sourceManifestHash: source.manifest.manifestHash,
    sourceRoot: source.manifest.sourceRoot,
    privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
    publisherOutcome: 0, reliableOutcome: 0, independentOutcome: 0,
    directCausalEffect: 0, recovery: 0, attemptCensus: 0,
  };
  process.stdout.write(`${canonicalizeStrict(summary)}\n`);
  return summary;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked !== null && invoked === fileURLToPath(import.meta.url)) {
  runUr5eSimV6Acquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
