#!/usr/bin/env node

import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync,
  readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  MCP_TRAJECTORY_ARTIFACT_SCHEMA, MCP_TRAJECTORY_ID, MCP_TRAJECTORY_REVISION,
  acquirePinnedMcpTrajectorySource, buildMcpTrajectoryArtifactFromSource,
  mcpTrajectorySha256, verifyMcpTrajectoryArtifact,
  verifyMcpTrajectoryArtifactWithSource, verifyMcpTrajectorySourceDirectory,
} from "../src/outsider-mcp-agent-trajectory-benchmark.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-mcp-agent-trajectory-benchmark-20260829-v1";
const STAGING_SCHEMA = "outsider/mcp-agent-trajectory-artifact-checkpoint/v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `MCP_TRAJECTORY_CLI_${code}`
    : `MCP_TRAJECTORY_CLI_${code}:${detail}`);
}

function parseArgs(argv) {
  const value = { output: DEFAULT_OUTPUT, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      if (!argv[index + 1]) fail("OUTPUT_ARGUMENT_MISSING");
      value.output = argv[++index];
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
    datasetId: MCP_TRAJECTORY_ID, revision: MCP_TRAJECTORY_REVISION };
}

function writeCanonicalStable(file, value) {
  const bytes = canonicalBytes(value);
  if (existsSync(file)) {
    if (!readFileSync(file).equals(bytes)) fail("CHECKPOINT_FILE_MISMATCH", file);
  } else writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  return { path: path.basename(file), bytes: bytes.length,
    sha256: mcpTrajectorySha256(bytes) };
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

export async function runMcpTrajectoryAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-mcp-agent-trajectory-benchmark.mjs [--output <new-dir>]",
      "",
      "Acquires all 413 files at the fixed revision and replays JSON, JSONL,",
      "trajectory schemas, tool-call/result crosswalks and train summaries as",
      "inert data. Python servers, commands and tool payloads are never executed.",
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
    const checked = verifyMcpTrajectorySourceDirectory(sourceDirectory);
    if (!checked.ok) fail("CHECKPOINT_SOURCE_INVALID", checked.error);
    sourceManifest = checked.manifest;
  } else {
    const acquired = await acquirePinnedMcpTrajectorySource(sourceDirectory,
      { checkpointDirectory: path.join(stage, "source.checkpoint") });
    sourceManifest = acquired.manifest;
  }
  const artifact = buildMcpTrajectoryArtifactFromSource(sourceDirectory);
  const standalone = verifyMcpTrajectoryArtifact(artifact);
  if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
  const sourceBound = verifyMcpTrajectoryArtifactWithSource(artifact, sourceDirectory);
  if (!sourceBound.ok || sourceBound.verificationLevel
    !== "FULL_413_FILE_INERT_SCHEMA_AND_TRACE_REPLAY") {
    fail("SOURCE_REPLAY_FAILED", sourceBound.error);
  }
  const report = writeCanonicalStable(path.join(stage,
    "mcp-agent-trajectory-benchmark.json"), artifact);
  const body = {
    schema: "outsider/mcp-agent-trajectory-benchmark-artifact-manifest/v1",
    reportSchema: MCP_TRAJECTORY_ARTIFACT_SCHEMA,
    report, reportHash: artifact.artifactHash,
    sourceManifestHash: sourceManifest.manifestHash,
    sourceRoot: sourceManifest.sourceRoot,
    datasetId: MCP_TRAJECTORY_ID, revision: MCP_TRAJECTORY_REVISION,
    sourceClosure: sourceManifest.closure,
    verification: sourceBound,
    admission: artifact.admission, executionSafety: artifact.executionSafety,
    rights: artifact.rights, privacy: artifact.privacy, boundary: artifact.boundary,
  };
  const manifest = { ...body,
    manifestHash: mcpTrajectorySha256(Buffer.from(
      `outsider/mcp-agent-trajectory-benchmark-artifact-manifest/v1\0${
        canonicalizeStrict(body)}`, "utf8")) };
  writeCanonicalStable(path.join(stage, "artifact-manifest.json"), manifest);
  unlinkSync(markerFile);
  enforcePrivateTree(stage);
  renameSync(stage, target);
  chmodSync(target, 0o700);
  const summary = { status: artifact.status, admission: artifact.admission,
    output: path.relative(process.cwd(), target), files: artifact.replay.filesRead,
    bytes: artifact.replay.bytesRead,
    trajectoryFiles: artifact.replay.trajectories.files,
    standardAtifFiles: artifact.replay.trajectories.standardFiles,
    multiConversationFiles: artifact.replay.trajectories.multiConversationFiles,
    sessionLikeRootUnits: artifact.replay.trajectories.sessionLikeRootUnits,
    standardSteps: artifact.replay.trajectories.standardSteps,
    standardToolCalls: artifact.replay.trajectories.standardToolCalls,
    standardToolResults: artifact.replay.trajectories.standardToolResults,
    publisherSuccessTrue: artifact.replay.trajectories.publisherSuccessTrue,
    publisherSuccessFalse: artifact.replay.trajectories.publisherSuccessFalse,
    pythonFilesPresent: artifact.replay.python.files, pythonFilesExecuted: 0,
    artifactHash: artifact.artifactHash,
    sourceManifestHash: sourceManifest.manifestHash,
    sourceRoot: sourceManifest.sourceRoot,
    noPii: false, training: 0, network: 0, authority: 0,
    outcome: 0, recovery: 0,
  };
  process.stdout.write(`${canonicalizeStrict(summary)}\n`);
  return summary;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked !== null && invoked === fileURLToPath(import.meta.url)) {
  runMcpTrajectoryAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
