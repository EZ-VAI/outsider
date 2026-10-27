#!/usr/bin/env node

import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  RRC2020_ARTIFACT_SCHEMA, RRC2020_JOB_ID, RRC2020_PROFILE,
  acquirePinnedRrc2020JobSource, buildRrc2020JobArtifactFromSource,
  rrc2020Sha256, verifyRrc2020JobArtifact, verifyRrc2020JobArtifactWithSource,
  verifyRrc2020JobSourceDirectory,
} from "../src/outsider-rrc2020-job-19422.js";

const DEFAULT_OUTPUT = "artifacts/outsider-rrc2020-job-19422-20260829-v1";
const STAGING_SCHEMA = "outsider/rrc2020-job-artifact-checkpoint/v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `RRC2020_CLI_${code}`
    : `RRC2020_CLI_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { output: DEFAULT_OUTPUT, python: ".venv/bin/python",
    bloscLibrary: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      if (!argv[index + 1]) fail("OUTPUT_ARGUMENT_MISSING");
      result.output = argv[++index];
    } else if (argument === "--python") {
      if (!argv[index + 1]) fail("PYTHON_ARGUMENT_MISSING");
      result.python = argv[++index];
    } else if (argument === "--blosc-library") {
      if (!argv[index + 1]) fail("BLOSC_ARGUMENT_MISSING");
      result.bloscLibrary = argv[++index];
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
    if (!readFileSync(file).equals(bytes)) fail("CHECKPOINT_FILE_MISMATCH", file);
  } else writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  return { path: path.basename(file), bytes: bytes.length,
    sha256: rrc2020Sha256(bytes) };
}

function marker(target) {
  return { schema: STAGING_SCHEMA, target, jobId: RRC2020_JOB_ID,
    zarrBytes: RRC2020_PROFILE.zarrZipBytes,
    zarrEtag: RRC2020_PROFILE.zarrEtag };
}

function ensureStage(target) {
  const stage = `${target}.checkpoint`;
  const markerFile = path.join(stage, "artifact-checkpoint.json");
  if (!existsSync(stage)) mkdirSync(stage, { recursive: true, mode: 0o700 });
  const stat = lstatSync(stage);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("STAGING_UNSAFE", stage);
  if (!existsSync(markerFile)) writeCanonicalStable(markerFile, marker(target));
  else if (canonicalizeStrict(JSON.parse(readFileSync(markerFile, "utf8")))
    !== canonicalizeStrict(marker(target))) fail("STAGING_MARKER_INVALID", stage);
  chmodSync(stage, 0o700);
  return { stage, markerFile };
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

export async function runRrc2020JobAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-rrc2020-job-19422.mjs",
      "    [--output <new-dir>] [--python <python>] [--blosc-library <path>]",
      "",
      "Acquires the complete official 299,208,343-byte Zarr ZIP for RRC 2020",
      "job 19422 with strict resumable HTTP Range receipts, plus bracketed",
      "official page and SQLite index bytes. Every ZIP and Zarr chunk is replayed",
      "as inert data; publisher Python and pickle/code payloads never execute.",
    ].join("\n") + "\n");
    return null;
  }
  const target = workspaceTarget(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  const parent = path.dirname(target);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
  const parentStat = lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    fail("OUTPUT_PARENT_UNSAFE", parent);
  }
  const { stage, markerFile } = ensureStage(target);
  const sourceDirectory = path.join(stage, "source");
  const options = { pythonExecutable: args.python,
    ...(args.bloscLibrary ? { bloscLibrary: args.bloscLibrary } : {}) };
  let sourceManifest;
  if (existsSync(sourceDirectory)) {
    const checked = verifyRrc2020JobSourceDirectory(sourceDirectory, options);
    if (!checked.ok) fail("CHECKPOINT_SOURCE_INVALID", checked.error);
    sourceManifest = checked.manifest;
  } else {
    const acquired = await acquirePinnedRrc2020JobSource(sourceDirectory,
      { ...options, checkpointDirectory: path.join(stage, "source.checkpoint") });
    sourceManifest = acquired.manifest;
  }
  const artifact = buildRrc2020JobArtifactFromSource(sourceDirectory, options);
  const standalone = verifyRrc2020JobArtifact(artifact);
  if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
  const sourceBound = verifyRrc2020JobArtifactWithSource(artifact,
    sourceDirectory, options);
  if (!sourceBound.ok || sourceBound.verificationLevel
    !== "FULL_SQLITE_ZIP_ZARR_ARRAY_CHUNK_ATTRIBUTE_AND_SEQUENCE_REPLAY") {
    fail("SOURCE_REPLAY_FAILED", sourceBound.error);
  }
  const report = writeCanonicalStable(path.join(stage, "rrc2020-job-19422.json"),
    artifact);
  const body = {
    schema: "outsider/rrc2020-job-19422-artifact-manifest/v1",
    reportSchema: RRC2020_ARTIFACT_SCHEMA,
    report, reportHash: artifact.artifactHash,
    sourceManifestHash: sourceManifest.manifestHash,
    sourceRoot: sourceManifest.sourceRoot,
    jobId: RRC2020_JOB_ID, sourceClosure: sourceManifest.closure,
    verification: sourceBound, admission: artifact.admission,
    metricCrosswalk: artifact.metricCrosswalk,
    runSemantics: artifact.runSemantics,
    rights: artifact.rights, privacy: artifact.privacy,
    boundary: artifact.boundary,
  };
  const manifest = { ...body, manifestHash: rrc2020Sha256(Buffer.from(
    `outsider/rrc2020-job-19422-artifact-manifest/v1\0${
      canonicalizeStrict(body)}`, "utf8")) };
  writeCanonicalStable(path.join(stage, "artifact-manifest.json"), manifest);
  unlinkSync(markerFile);
  enforcePrivateTree(stage);
  renameSync(stage, target);
  chmodSync(target, 0o700);
  const summary = {
    status: artifact.status, admission: artifact.admission,
    output: path.relative(process.cwd(), target), jobId: RRC2020_JOB_ID,
    zarrZipBytes: sourceManifest.closure.zarrZipBytes,
    rangeChunks: sourceManifest.closure.zarrRangeChunks,
    zipEntries: artifact.replay.zip.entries,
    zarrArrays: artifact.replay.zarr.arrays,
    zarrChunks: artifact.replay.zarr.chunkEntries,
    robotSteps: artifact.replay.sequences.robotSteps,
    cameraFrames: artifact.replay.sequences.cameraFrames,
    artifactHash: artifact.artifactHash,
    sourceManifestHash: sourceManifest.manifestHash,
    sourceRoot: sourceManifest.sourceRoot,
    privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
    independentOutcome: 0, recovery: 0,
  };
  process.stdout.write(`${canonicalizeStrict(summary)}\n`);
  return summary;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked !== null && invoked === fileURLToPath(import.meta.url)) {
  runRrc2020JobAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
