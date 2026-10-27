#!/usr/bin/env node

import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  PEG_INTERVENTION_ARTIFACT_SCHEMA, PEG_INTERVENTION_ID,
  PEG_INTERVENTION_PROFILE, PEG_INTERVENTION_REVISION,
  acquirePinnedPegInterventionSource, buildPegInterventionArtifactFromSource,
  pegInterventionSha256, verifyPegInterventionArtifact,
  verifyPegInterventionSourceDirectory,
} from "../src/outsider-peg-intervention.js";

const DEFAULT_OUTPUT = "artifacts/outsider-peg-intervention-20260830-v1";
const STAGING_SCHEMA = "outsider/peg-intervention-artifact-checkpoint/v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `PEG_INTERVENTION_CLI_${code}`
    : `PEG_INTERVENTION_CLI_${code}:${detail}`);
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
    sha256: pegInterventionSha256(bytes) };
}

function checkpointMarker(target) {
  return { schema: STAGING_SCHEMA, target, dataset: PEG_INTERVENTION_ID,
    revision: PEG_INTERVENTION_REVISION,
    selectedBytes: PEG_INTERVENTION_PROFILE.selectedBytes };
}

function ensureFreshOrCheckpoint(target) {
  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("OUTPUT_UNSAFE", target);
    const entries = readdirSync(target).sort();
    if (entries.length !== 1 || entries[0] !== "source") fail("OUTPUT_EXISTS", target);
    const checked = verifyPegInterventionSourceDirectory(path.join(target, "source"));
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
  return pegInterventionSha256(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

export async function runPegInterventionAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-peg-intervention.mjs",
      "    [--output <new-dir>] [--python <python>]",
      "",
      "Acquires all seven semantic no-video objects and the complete two-file",
      "hand-camera modality (nine files, 291,674,372 bytes). The five larger",
      "base-camera files remain exact full-tree terminal dispositions.",
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
    source = verifyPegInterventionSourceDirectory(sourceDirectory);
    if (!source.ok) fail("CHECKPOINT_SOURCE_INVALID", source.error);
  } else {
    source = await acquirePinnedPegInterventionSource(sourceDirectory, {
      checkpointDirectory: path.join(stage, "source.checkpoint"),
    });
  }
  const artifact = buildPegInterventionArtifactFromSource(sourceDirectory,
    { pythonExecutable: args.python });
  const standalone = verifyPegInterventionArtifact(artifact);
  if (!standalone.ok) fail("ARTIFACT_INVALID", standalone.error);
  const report = writeCanonicalStable(path.join(stage,
    "peg-intervention.json"), artifact);
  const manifestBody = {
    schema: "outsider/peg-intervention-artifact-manifest/v1",
    reportSchema: PEG_INTERVENTION_ARTIFACT_SCHEMA, report,
    reportHash: artifact.artifactHash,
    sourceManifestHash: source.manifest.manifestHash,
    sourceRoot: source.manifest.sourceRoot,
    sourceClosure: source.manifest.closure,
    typedDenominators: artifact.typedDenominators,
    outcomeDenominatorBoundary: artifact.outcomeDenominatorBoundary,
    semantics: artifact.semantics,
    sourceDiscrepancyBoundary: artifact.sourceDiscrepancyBoundary,
    rights: artifact.rights, privacy: artifact.privacy, boundary: artifact.boundary,
  };
  const artifactManifest = { ...manifestBody,
    manifestHash: domainHash(
      "outsider/peg-intervention-artifact-manifest/v1", manifestBody) };
  writeCanonicalStable(path.join(stage, "artifact-manifest.json"), artifactManifest);
  if (markerFile !== null) unlinkSync(markerFile);
  const receiptBody = {
    schema: "outsider/peg-intervention-receipt/v1",
    artifactHash: artifact.artifactHash,
    artifactManifestHash: artifactManifest.manifestHash,
    sourceManifestHash: source.manifest.manifestHash,
    sourceRoot: source.manifest.sourceRoot,
    selectedFiles: 9, selectedBytes: 291_674_372,
    terminalDispositionFiles: 14,
    verificationLevel:
      "FULL_PARQUET_EPISODE_INTERVENTION_SUCCESS_STATS_AND_HAND_MP4_SAMPLE_REPLAY",
  };
  const receipt = { ...receiptBody,
    receiptHash: domainHash("outsider/peg-intervention-receipt/v1", receiptBody) };
  // Receipt remains the final file written in the staged artifact.
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
    actionStateQvelFrames: artifact.replay.data.rows,
    interventionTrueFrames: artifact.replay.nativeSemantics.interventionTrueFrames,
    interventionSegments: artifact.replay.nativeSemantics.interventionSegments,
    publisherSuccessEpisodes:
      artifact.replay.nativeSemantics.publisherSuccessEpisodeCount,
    publisherFailureEpisodes:
      artifact.replay.nativeSemantics.publisherFailureEpisodeCount,
    handVideoSamples: artifact.replay.video.totalSamples,
    artifactHash: artifact.artifactHash,
    artifactManifestHash: artifactManifest.manifestHash,
    receiptHash: receipt.receiptHash,
    sourceManifestHash: source.manifest.manifestHash,
    sourceRoot: source.manifest.sourceRoot,
    privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
    publisherOutcome: 1, reliableOutcome: 0, independentOutcome: 0,
    directCausalEffect: 0, recovery: 0, attemptCensus: 0,
  };
  process.stdout.write(`${canonicalizeStrict(summary)}\n`);
  return summary;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked !== null && invoked === fileURLToPath(import.meta.url)) {
  runPegInterventionAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
