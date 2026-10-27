#!/usr/bin/env node

import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  NAVWARESET_ARTIFACT_SCHEMA, NAVWARESET_DOI, NAVWARESET_PROJECT_REVISION,
  NAVWARESET_TUTORIAL_REVISION, acquirePinnedNavWareSetPoseSource,
  buildNavWareSetPoseArtifactFromSource, navWareSetSha256,
  verifyNavWareSetPoseArtifact, verifyNavWareSetPoseArtifactWithSource,
  verifyNavWareSetPoseSourceDirectory,
} from "../src/outsider-navwareset-pose-closure.js";

const DEFAULT_OUTPUT = "artifacts/outsider-navwareset-pose-closure-20260829-v1";
const STAGING_SCHEMA = "outsider/navwareset-pose-artifact-checkpoint/v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `NAVWARESET_CLI_${code}`
    : `NAVWARESET_CLI_${code}:${detail}`);
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
    if (!readFileSync(file).equals(bytes)) fail("CHECKPOINT_FILE_MISMATCH", file);
  } else writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  return { path: path.basename(file), bytes: bytes.length,
    sha256: navWareSetSha256(bytes) };
}

function marker(target) {
  return { schema: STAGING_SCHEMA, target,
    doi: NAVWARESET_DOI, projectRevision: NAVWARESET_PROJECT_REVISION,
    tutorialRevision: NAVWARESET_TUTORIAL_REVISION };
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

export async function runNavWareSetPoseAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-navwareset-pose-closure.mjs",
      "    [--output <new-dir>] [--python <python>]",
      "",
      "Acquires all 43 official NavWareSet pose ZIPs plus the portal README,",
      "bracketed by the complete 185-file catalogue and pinned publisher repos.",
      "TB-scale annotated/GRS/robot archives are inventory-only. Human pose",
      "coordinates remain in a 0700/0600 source tree and are never projected.",
      "Interrupted network transfers resume from a no-clobber checkpoint.",
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
    const checked = verifyNavWareSetPoseSourceDirectory(sourceDirectory);
    if (!checked.ok) fail("CHECKPOINT_SOURCE_INVALID", checked.error);
    sourceManifest = checked.manifest;
  } else {
    const acquired = await acquirePinnedNavWareSetPoseSource(sourceDirectory,
      { checkpointDirectory: path.join(stage, "source.checkpoint") });
    sourceManifest = acquired.manifest;
  }
  const options = { pythonExecutable: args.python };
  const artifact = buildNavWareSetPoseArtifactFromSource(sourceDirectory, options);
  const standalone = verifyNavWareSetPoseArtifact(artifact);
  if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
  const sourceBound = verifyNavWareSetPoseArtifactWithSource(artifact,
    sourceDirectory, options);
  if (!sourceBound.ok || sourceBound.verificationLevel
    !== "FULL_43_ZIP_43_CSV_43_OCCUPANCY_AND_185_FILE_CATALOGUE_REPLAY") {
    fail("SOURCE_REPLAY_FAILED", sourceBound.error);
  }
  const report = writeCanonicalStable(path.join(stage,
    "navwareset-pose-closure.json"), artifact);
  const body = {
    schema: "outsider/navwareset-pose-closure-artifact-manifest/v1",
    reportSchema: NAVWARESET_ARTIFACT_SCHEMA,
    report, reportHash: artifact.artifactHash,
    sourceManifestHash: sourceManifest.manifestHash,
    sourceRoot: sourceManifest.sourceRoot,
    doi: NAVWARESET_DOI,
    projectRevision: NAVWARESET_PROJECT_REVISION,
    tutorialRevision: NAVWARESET_TUTORIAL_REVISION,
    sourceClosure: sourceManifest.closure,
    verification: sourceBound,
    admission: artifact.admission,
    typedDenominators: artifact.replay.typedDenominators,
    sceneSemantics: artifact.sceneSemantics,
    rights: artifact.rights, privacy: artifact.privacy,
    boundary: artifact.boundary,
  };
  const manifest = { ...body, manifestHash: navWareSetSha256(Buffer.from(
    `outsider/navwareset-pose-closure-artifact-manifest/v1\0${
      canonicalizeStrict(body)}`, "utf8")) };
  writeCanonicalStable(path.join(stage, "artifact-manifest.json"), manifest);
  unlinkSync(markerFile);
  enforcePrivateTree(stage);
  renameSync(stage, target);
  chmodSync(target, 0o700);
  const summary = {
    status: artifact.status, admission: artifact.admission,
    output: path.relative(process.cwd(), target),
    catalogueFiles: sourceManifest.closure.catalogueInventoriedFiles,
    poseArchives: artifact.replay.archives.files,
    poseArchiveBytes: sourceManifest.closure.poseArchiveBytes,
    poseRows: artifact.replay.csv.rows,
    participantPositionObservations:
      artifact.replay.csv.participantPositionObservations,
    occupancyPoints: artifact.replay.occupancy.points,
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
  runNavWareSetPoseAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
