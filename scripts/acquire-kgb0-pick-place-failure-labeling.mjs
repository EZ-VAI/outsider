#!/usr/bin/env node

import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  KGB0_FAILURE_ARTIFACT_SCHEMA, KGB0_FAILURE_ID, KGB0_FAILURE_REVISION,
  acquirePinnedKgb0FailureSource, buildKgb0FailureArtifactFromSource,
  kgb0FailureSha256, verifyKgb0FailureArtifact,
  verifyKgb0FailureArtifactWithSource, verifyKgb0FailureSourceDirectory,
} from "../src/outsider-kgb0-pick-place-failure-labeling.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-kgb0-pick-place-failure-labeling-20260829-v1";
const STAGING_SCHEMA = "outsider/kgb0-failure-artifact-checkpoint/v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `KGB0_FAILURE_CLI_${code}`
    : `KGB0_FAILURE_CLI_${code}:${detail}`);
}

function parseArgs(argv) {
  const value = { output: DEFAULT_OUTPUT, python: ".venv/bin/python", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      if (!argv[index + 1]) fail("OUTPUT_ARGUMENT_MISSING");
      value.output = argv[++index];
    } else if (argument === "--python") {
      if (!argv[index + 1]) fail("PYTHON_ARGUMENT_MISSING");
      value.python = argv[++index];
    } else if (argument === "--help" || argument === "-h") value.help = true;
    else fail("ARGUMENT_UNKNOWN", argument);
  }
  return value;
}

function workspaceTarget(value) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (target === path.parse(target).root || relative === ""
    || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  return target;
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function marker(target) {
  return { schema: STAGING_SCHEMA, target,
    datasetId: KGB0_FAILURE_ID, revision: KGB0_FAILURE_REVISION };
}

function writeCanonicalStable(file, value) {
  const bytes = canonicalBytes(value);
  if (existsSync(file)) {
    if (!readFileSync(file).equals(bytes)) fail("CHECKPOINT_FILE_MISMATCH", file);
  } else writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  return { path: path.basename(file), bytes: bytes.length,
    sha256: kgb0FailureSha256(bytes) };
}

function ensureStage(target) {
  const stage = `${target}.checkpoint`;
  const markerFile = path.join(stage, "artifact-checkpoint.json");
  if (!existsSync(stage)) {
    mkdirSync(stage, { recursive: true, mode: 0o700 });
    writeCanonicalStable(markerFile, marker(target));
  } else {
    const stat = lstatSync(stage);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("STAGING_UNSAFE", stage);
    if (canonicalizeStrict(JSON.parse(readFileSync(markerFile, "utf8")))
      !== canonicalizeStrict(marker(target))) fail("STAGING_MARKER_INVALID", stage);
  }
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

export async function runKgb0FailureAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-kgb0-pick-place-failure-labeling.mjs",
      "    [--output <new-dir>] [--python <pyarrow-python>]",
      "",
      "Acquires the complete 236 MB no-video group at the fixed revision:",
      "194 Parquets, 194 matching .pt sidecars, all metadata and root reports.",
      "All 388 MP4s remain a complete tree-bound inventory. Parquets are fully",
      "replayed; .pt zip structure is inspected but pickle/tensor payloads never",
      "execute. Publisher failure labels are not promoted to outcomes/recovery.",
      "Interrupted downloads resume from a private no-clobber checkpoint.",
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
  let sourceManifest;
  if (existsSync(sourceDirectory)) {
    const checked = verifyKgb0FailureSourceDirectory(sourceDirectory);
    if (!checked.ok) fail("CHECKPOINT_SOURCE_INVALID", checked.error);
    sourceManifest = checked.manifest;
  } else {
    const acquired = await acquirePinnedKgb0FailureSource(sourceDirectory,
      { checkpointDirectory: path.join(stage, "source.checkpoint") });
    sourceManifest = acquired.manifest;
  }
  const options = { pythonExecutable: args.python };
  const artifact = buildKgb0FailureArtifactFromSource(sourceDirectory, options);
  const standalone = verifyKgb0FailureArtifact(artifact);
  if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
  const sourceBound = verifyKgb0FailureArtifactWithSource(artifact,
    sourceDirectory, options);
  if (!sourceBound.ok || sourceBound.verificationLevel
    !== "FULL_194_PARQUET_194_PT_METADATA_AND_388_VIDEO_INVENTORY_REPLAY") {
    fail("SOURCE_REPLAY_FAILED", sourceBound.error);
  }
  const report = writeCanonicalStable(path.join(stage,
    "kgb0-pick-place-failure-labeling.json"), artifact);
  const body = {
    schema: "outsider/kgb0-pick-place-failure-labeling-artifact-manifest/v1",
    reportSchema: KGB0_FAILURE_ARTIFACT_SCHEMA,
    report, reportHash: artifact.artifactHash,
    sourceManifestHash: sourceManifest.manifestHash,
    sourceRoot: sourceManifest.sourceRoot,
    datasetId: KGB0_FAILURE_ID, revision: KGB0_FAILURE_REVISION,
    sourceClosure: sourceManifest.closure,
    verification: sourceBound,
    admission: artifact.admission,
    selectionSemantics: artifact.selectionSemantics,
    labelSemantics: artifact.labelSemantics,
    embeddingSafety: artifact.embeddingSafety,
    rights: artifact.rights, privacy: artifact.privacy,
    boundary: artifact.boundary,
  };
  const manifest = { ...body,
    manifestHash: kgb0FailureSha256(Buffer.from(
      `outsider/kgb0-pick-place-failure-labeling-artifact-manifest/v1\0${
        canonicalizeStrict(body)}`, "utf8")) };
  writeCanonicalStable(path.join(stage, "artifact-manifest.json"), manifest);
  unlinkSync(markerFile);
  enforcePrivateTree(stage);
  renameSync(stage, target);
  chmodSync(target, 0o700);
  const summary = {
    status: artifact.status, admission: artifact.admission,
    output: path.relative(process.cwd(), target),
    noVideoObjects: sourceManifest.closure.selectedObjects,
    noVideoBytes: sourceManifest.closure.selectedBytes,
    videosInventoried: sourceManifest.closure.videosInventoried,
    videoBytesInventoried: sourceManifest.closure.videoBytesInventoried,
    parquetFiles: artifact.replay.parquet.files,
    embeddingFiles: artifact.replay.embeddings.files,
    episodes: artifact.replay.info.totalEpisodes,
    frames: artifact.replay.parquet.frames,
    labelIntervals: artifact.replay.annotations.intervals,
    failureLabeledFrames: artifact.replay.annotations.failureLabeledFrames,
    artifactHash: artifact.artifactHash,
    sourceManifestHash: sourceManifest.manifestHash,
    sourceRoot: sourceManifest.sourceRoot,
    independentOutcome: 0, recovery: 0, privacy: 0,
    training: 0, network: 0, authority: 0, CEU: 0,
  };
  process.stdout.write(`${canonicalizeStrict(summary)}\n`);
  return summary;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked !== null && invoked === fileURLToPath(import.meta.url)) {
  runKgb0FailureAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
