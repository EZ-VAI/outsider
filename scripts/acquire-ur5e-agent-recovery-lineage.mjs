#!/usr/bin/env node

import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  UR5E_AGENT_ARTIFACT_SCHEMA, UR5E_AGENT_PROFILE, UR5E_AGENT_REPOSITORIES,
  acquirePinnedUr5eAgentLineageSource, buildUr5eAgentLineageFromSource,
  ur5eAgentSha256, verifyUr5eAgentLineageArtifact,
  verifyUr5eAgentLineageArtifactWithSource,
  verifyUr5eAgentLineageSourceDirectory,
} from "../src/outsider-ur5e-agent-recovery-lineage.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-ur5e-agent-recovery-lineage-20260829-v1";
const STAGING_SCHEMA = "outsider/ur5e-agent-recovery-artifact-checkpoint/v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `UR5E_AGENT_CLI_${code}`
    : `UR5E_AGENT_CLI_${code}:${detail}`);
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

function markerValue(target) {
  return { schema: STAGING_SCHEMA, target,
    pins: UR5E_AGENT_REPOSITORIES.map(({ id, revision }) => ({ id, revision })) };
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function writeCanonicalStable(file, value) {
  const bytes = canonicalBytes(value);
  if (existsSync(file)) {
    const existing = readFileSync(file);
    if (!existing.equals(bytes)) fail("CHECKPOINT_FILE_MISMATCH", file);
  } else {
    writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  }
  chmodSync(file, 0o600);
  return { path: path.basename(file), bytes: bytes.length,
    sha256: ur5eAgentSha256(bytes) };
}

function ensureStaging(target) {
  const stage = `${target}.checkpoint`;
  const markerFile = path.join(stage, "artifact-checkpoint.json");
  if (!existsSync(stage)) {
    mkdirSync(stage, { recursive: true, mode: 0o700 });
    writeCanonicalStable(markerFile, markerValue(target));
  } else {
    const stat = lstatSync(stage);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("STAGING_UNSAFE", stage);
    const marker = JSON.parse(readFileSync(markerFile, "utf8"));
    if (canonicalizeStrict(marker) !== canonicalizeStrict(markerValue(target))) {
      fail("STAGING_MARKER_INVALID", stage);
    }
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

export async function runUr5eAgentLineageAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-ur5e-agent-recovery-lineage.mjs",
      "    [--output <new-dir>] [--python <pyarrow-python>]",
      "",
      "Freezes twelve public UR5e repositories, captures each complete recursive",
      "tree before and after, acquires every non-MP4 object, inventories all MP4",
      "objects, and replays all 36 Parquet files. Interrupted network work resumes",
      "from a private checkpoint. Publisher name tokens do not establish outcome,",
      "recovery, effect, chronology, rights, privacy, training or authority.",
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
  const { stage, markerFile } = ensureStaging(target);
  const sourceDirectory = path.join(stage, "source");
  let sourceManifest;
  if (existsSync(sourceDirectory)) {
    const verified = verifyUr5eAgentLineageSourceDirectory(sourceDirectory);
    if (!verified.ok) fail("CHECKPOINT_SOURCE_INVALID", verified.error);
    sourceManifest = verified.manifest;
  } else {
    const acquired = await acquirePinnedUr5eAgentLineageSource(sourceDirectory,
      { checkpointDirectory: path.join(stage, "source.checkpoint") });
    sourceManifest = acquired.manifest;
  }
  const artifact = buildUr5eAgentLineageFromSource(sourceDirectory,
    { pythonExecutable: args.python });
  const standalone = verifyUr5eAgentLineageArtifact(artifact);
  if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
  const sourceBound = verifyUr5eAgentLineageArtifactWithSource(artifact,
    sourceDirectory, { pythonExecutable: args.python });
  if (!sourceBound.ok || sourceBound.verificationLevel
    !== "FULL_12_REPOSITORY_NO_VIDEO_BYTE_AND_PYARROW_REPLAY") {
    fail("SOURCE_REPLAY_FAILED", sourceBound.error);
  }
  const report = writeCanonicalStable(path.join(stage,
    "ur5e-agent-recovery-lineage.json"), artifact);
  const manifestBody = {
    schema: "outsider/ur5e-agent-recovery-lineage-artifact-manifest/v1",
    reportSchema: UR5E_AGENT_ARTIFACT_SCHEMA,
    report, reportHash: artifact.artifactHash,
    sourceManifestHash: sourceManifest.manifestHash,
    sourceRoot: sourceManifest.sourceRoot,
    repositoryPins: UR5E_AGENT_REPOSITORIES.map(({ id, revision }) => ({ id, revision })),
    sourceClosure: sourceManifest.closure,
    verification: sourceBound,
    admission: artifact.admission,
    rights: artifact.rights,
    privacy: artifact.privacy,
    boundary: artifact.boundary,
  };
  const artifactManifest = { ...manifestBody,
    manifestHash: ur5eAgentSha256(Buffer.from(
      `outsider/ur5e-agent-recovery-lineage-artifact-manifest/v1\0${
        canonicalizeStrict(manifestBody)}`, "utf8")) };
  writeCanonicalStable(path.join(stage, "artifact-manifest.json"), artifactManifest);
  unlinkSync(markerFile);
  enforcePrivateTree(stage);
  renameSync(stage, target);
  chmodSync(target, 0o700);
  const summary = {
    status: artifact.status, admission: artifact.admission,
    output: path.relative(process.cwd(), target),
    repositories: UR5E_AGENT_PROFILE.repositories,
    noVideoObjects: sourceManifest.closure.noVideoObjects,
    noVideoBytes: sourceManifest.closure.noVideoBytes,
    videosInventoried: sourceManifest.closure.videosInventoried,
    videoBytesInventoried: sourceManifest.closure.videoBytesInventoried,
    parquetFilesRead: artifact.replay.parquetFilesRead,
    episodes: artifact.replay.episodes, frames: artifact.replay.frames,
    tasks: Object.keys(artifact.replay.taskCounts).length,
    reportFiles: artifact.replay.reportFiles.length,
    artifactHash: artifact.artifactHash,
    sourceManifestHash: sourceManifest.manifestHash,
    sourceRoot: sourceManifest.sourceRoot,
    rightsDisposition: artifact.rights.rightsDisposition,
    visualReplay: false, directOutcome: 0, recovery: 0,
    privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
  };
  process.stdout.write(`${canonicalizeStrict(summary)}\n`);
  return summary;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked !== null && invoked === fileURLToPath(import.meta.url)) {
  runUr5eAgentLineageAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
