#!/usr/bin/env node

import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  KELIN_KEWANG_LINEAGE_ARTIFACT_SCHEMA, KELIN_KEWANG_LINEAGE_PROFILE,
  KELIN_KEWANG_SOURCES, acquirePinnedKelinKewangLineageSource,
  buildKelinKewangLineageArtifactFromSource, kelinKewangLineageSha256,
  verifyKelinKewangLineageArtifact,
  verifyKelinKewangLineageSourceDirectory,
} from "../src/outsider-kelin-kewang-intervention-lineage.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-kelin-kewang-intervention-lineage-20260830-v1";
const DEFAULT_KE_ARTIFACT =
  "artifacts/outsider-peg-intervention-20260830-v1";
const STAGING_SCHEMA =
  "outsider/kelin-kewang-intervention-lineage-artifact-checkpoint/v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `KELIN_KEWANG_LINEAGE_CLI_${code}`
    : `KELIN_KEWANG_LINEAGE_CLI_${code}:${detail}`);
}

function parseArgs(argv) {
  const result = { output: DEFAULT_OUTPUT, keArtifact: DEFAULT_KE_ARTIFACT,
    python: ".venv/bin/python", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      if (!argv[index + 1]) fail("OUTPUT_ARGUMENT_MISSING");
      result.output = argv[++index];
    } else if (argument === "--ke-artifact") {
      if (!argv[index + 1]) fail("KE_ARTIFACT_ARGUMENT_MISSING");
      result.keArtifact = argv[++index];
    } else if (argument === "--python") {
      if (!argv[index + 1]) fail("PYTHON_ARGUMENT_MISSING");
      result.python = argv[++index];
    } else if (argument === "--help" || argument === "-h") result.help = true;
    else fail("ARGUMENT_UNKNOWN", argument);
  }
  return result;
}

function workspaceTarget(value, label) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (target === path.parse(target).root || relative === "" || relative === ".."
    || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${label}_OUTSIDE_WORKSPACE`, target);
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
    sha256: kelinKewangLineageSha256(bytes) };
}

function checkpointMarker(target) {
  return { schema: STAGING_SCHEMA, target,
    sources: KELIN_KEWANG_SOURCES.map((source) => ({
      id: source.id, revision: source.revision })),
    acquiredNoVideoBytes: KELIN_KEWANG_LINEAGE_PROFILE.acquiredNoVideoBytes };
}

function ensureFreshOrCheckpoint(target, keArtifactDirectory) {
  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("OUTPUT_UNSAFE", target);
    const entries = readdirSync(target).sort();
    if (entries.length !== 1 || entries[0] !== "source") fail("OUTPUT_EXISTS", target);
    const checked = verifyKelinKewangLineageSourceDirectory(
      path.join(target, "source"), { keArtifactDirectory });
    if (!checked.ok) fail("OUTPUT_EXISTS_INVALID_SOURCE", checked.error);
    chmodSync(target, 0o700);
    return { stage: target, markerFile: null, recoveredSourceOnlyTarget: true };
  }
  const stage = `${target}.checkpoint`;
  if (!existsSync(stage)) mkdirSync(stage, { recursive: true, mode: 0o700 });
  const stat = lstatSync(stage);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("STAGING_UNSAFE", stage);
  const markerFile = path.join(stage, "artifact-checkpoint.json");
  const existing = readdirSync(stage).sort();
  if (!existsSync(markerFile) && existing.length > 0) fail("STAGING_MARKER_MISSING", stage);
  writeCanonicalStable(markerFile, checkpointMarker(target));
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
  return kelinKewangLineageSha256(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

export async function runKelinKewangLineageAcquisition(
  argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-kelin-kewang-intervention-lineage.mjs",
      "    [--output <new-dir>] [--ke-artifact <existing-dir>]",
      "    [--python <python>]",
      "",
      "Acquires both fixed Kelin no-video closures (14 files, 6,973,328",
      "bytes), inventories all base video, and cross-binds both hand videos",
      "to the existing source-verified KeWang artifact without duplication.",
    ].join("\n") + "\n");
    return null;
  }
  const target = workspaceTarget(args.output, "OUTPUT");
  const keArtifactDirectory = workspaceTarget(args.keArtifact, "KE_ARTIFACT");
  const parent = path.dirname(target);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
  const parentStat = lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    fail("OUTPUT_PARENT_UNSAFE", parent);
  }
  const { stage, markerFile, recoveredSourceOnlyTarget } =
    ensureFreshOrCheckpoint(target, keArtifactDirectory);
  const sourceDirectory = path.join(stage, "source");
  let source;
  if (existsSync(sourceDirectory)) {
    source = verifyKelinKewangLineageSourceDirectory(sourceDirectory,
      { keArtifactDirectory });
    if (!source.ok) fail("CHECKPOINT_SOURCE_INVALID", source.error);
  } else {
    source = await acquirePinnedKelinKewangLineageSource(sourceDirectory, {
      checkpointDirectory: path.join(stage, "source.checkpoint"),
      keArtifactDirectory,
    });
  }
  const replayOptions = { pythonExecutable: args.python, keArtifactDirectory };
  const artifact = buildKelinKewangLineageArtifactFromSource(sourceDirectory,
    replayOptions);
  const standalone = verifyKelinKewangLineageArtifact(artifact);
  if (!standalone.ok) fail("ARTIFACT_INVALID", standalone.error);
  const report = writeCanonicalStable(path.join(stage,
    "kelin-kewang-intervention-lineage.json"), artifact);
  const manifestBody = {
    schema: "outsider/kelin-kewang-intervention-lineage-artifact-manifest/v1",
    reportSchema: KELIN_KEWANG_LINEAGE_ARTIFACT_SCHEMA, report,
    reportHash: artifact.artifactHash,
    sourceManifestHash: source.manifest.manifestHash,
    sourceRoot: source.manifest.sourceRoot,
    sourceClosure: source.manifest.closure,
    typedDenominators: artifact.typedDenominators,
    denominatorBoundary: artifact.denominatorBoundary,
    lineageBoundary: artifact.lineageBoundary,
    semantics: artifact.semantics, rights: artifact.rights,
    privacy: artifact.privacy, boundary: artifact.boundary,
  };
  const artifactManifest = { ...manifestBody,
    manifestHash: domainHash(
      "outsider/kelin-kewang-intervention-lineage-artifact-manifest/v1",
      manifestBody) };
  writeCanonicalStable(path.join(stage, "artifact-manifest.json"), artifactManifest);
  if (markerFile !== null) unlinkSync(markerFile);
  const receiptBody = {
    schema: "outsider/kelin-kewang-intervention-lineage-receipt/v1",
    artifactHash: artifact.artifactHash,
    artifactManifestHash: artifactManifest.manifestHash,
    sourceManifestHash: source.manifest.manifestHash,
    sourceRoot: source.manifest.sourceRoot,
    acquiredNoVideoFiles: 14, acquiredNoVideoBytes: 6_973_328,
    crossBoundHandVideoFiles: 2, newlyAcquiredHandVideoBytes: 0,
    terminalDispositionFiles: 21,
    verificationLevel:
      "FULL_TWO_PART_PARQUET_OFFSET_JOIN_PLUS_NESTED_KE_SELF_REPLAY",
  };
  const receipt = { ...receiptBody,
    receiptHash: domainHash(
      "outsider/kelin-kewang-intervention-lineage-receipt/v1", receiptBody) };
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
    acquiredNoVideoFiles: 14, acquiredNoVideoBytes: 6_973_328,
    crossBoundHandVideoFiles: 2, newlyAcquiredHandVideoBytes: 0,
    sourceEpisodeOccurrences: 106, uniqueMergedEpisodes: 106,
    nestedKeAddsUniqueEpisodes: 0,
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
  runKelinKewangLineageAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
