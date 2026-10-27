#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  RECAP_LINEAGE_SCHEMA, RECAP_PROFILE, RECAP_REPOSITORIES,
  acquirePinnedRecapSource, buildRecapLinkedLineageFromSource, recapSha256,
  verifyRecapLinkedLineageArtifact, verifyRecapLinkedLineageArtifactWithSource,
} from "../src/outsider-recap-so101-linked-lineage.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-recap-so101-linked-lineage-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail == null ? `RECAP_SO101_CLI_${code}`
    : `RECAP_SO101_CLI_${code}:${detail}`);
}

function parseArgs(argv) {
  const parsed = { output: DEFAULT_OUTPUT, python: ".venv/bin/python", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      if (!argv[index + 1]) fail("OUTPUT_ARGUMENT_MISSING");
      parsed.output = argv[++index];
    } else if (argument === "--python") {
      if (!argv[index + 1]) fail("PYTHON_ARGUMENT_MISSING");
      parsed.python = argv[++index];
    } else if (argument === "--help" || argument === "-h") parsed.help = true;
    else fail("ARGUMENT_UNKNOWN", argument);
  }
  return parsed;
}

function ensureInsideWorkspace(value) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (target === path.parse(target).root || relative === ""
    || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  return target;
}

function writeCanonicalOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  return { path: path.basename(file), bytes: bytes.length, sha256: recapSha256(bytes) };
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

export async function runRecapAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-recap-so101-linked-lineage.mjs [--output <new-dir>] [--python <pyarrow-python>]",
      "",
      "Captures the fixed 13-repository apaszynska/recap declared scope before",
      "and after download, acquires complete no-video bytes for the primary",
      "rollout and H264 merged datasets plus bounded lineage support, then",
      "replays episode/frame labels and exact crosswalks. Videos, independent",
      "outcomes, recovery semantics, training and authority remain excluded.",
    ].join("\n") + "\n");
    return null;
  }
  const target = ensureInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  const parent = path.dirname(target);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
  const parentStat = lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    fail("OUTPUT_PARENT_UNSAFE", parent);
  }
  const temporary = path.join(parent,
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const acquisition = await acquirePinnedRecapSource(path.join(temporary, "source"));
    const artifact = buildRecapLinkedLineageFromSource(acquisition.sourceDirectory,
      { pythonExecutable: args.python });
    const standalone = verifyRecapLinkedLineageArtifact(artifact);
    if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
    const sourceBound = verifyRecapLinkedLineageArtifactWithSource(artifact,
      acquisition.sourceDirectory, { pythonExecutable: args.python });
    if (!sourceBound.ok || sourceBound.verificationLevel
      !== "FULL_DECLARED_SCOPE_PRIMARY_BYTE_AND_PYARROW_REPLAY") {
      fail("FULL_SOURCE_REPLAY_FAILED", sourceBound.error);
    }
    const report = writeCanonicalOnce(path.join(temporary,
      "recap-so101-linked-lineage.json"), artifact);
    const manifestBody = {
      schema: "outsider/recap-so101-linked-lineage-artifact-manifest/v1",
      reportSchema: RECAP_LINEAGE_SCHEMA,
      report,
      reportHash: artifact.artifactHash,
      sourceManifestHash: acquisition.manifest.manifestHash,
      sourceRoot: acquisition.manifest.sourceRoot,
      repositoryPins: RECAP_REPOSITORIES.map(({ id, revision }) => ({ id, revision })),
      sourceClosure: acquisition.manifest.closure,
      verification: sourceBound,
      admission: artifact.admission,
      visualReplay: false,
      rights: artifact.rights,
      privacy: artifact.privacy,
      boundary: artifact.boundary,
    };
    const artifactManifest = { ...manifestBody,
      manifestHash: recapSha256(Buffer.from(
        `outsider/recap-so101-linked-lineage-artifact-manifest/v1\0${
          canonicalizeStrict(manifestBody)}`, "utf8")) };
    writeCanonicalOnce(path.join(temporary, "artifact-manifest.json"), artifactManifest);
    enforcePrivateTree(temporary);
    renameSync(temporary, target);
    chmodSync(target, 0o700);
    const summary = {
      status: artifact.status,
      admission: artifact.admission,
      output: path.relative(process.cwd(), target),
      declaredRepositories: RECAP_PROFILE.declaredRepositories,
      selectedObjects: acquisition.manifest.closure.selectedObjects,
      selectedBytes: acquisition.manifest.closure.selectedBytes,
      rolloutEpisodes: artifact.replay.primaryRollout.episodes,
      rolloutFrames: artifact.replay.primaryRollout.frames,
      mergedEpisodes: artifact.replay.mergedH264.episodes,
      mergedFrames: artifact.replay.mergedH264.frames,
      exactMappedEpisodes: artifact.lineageConclusion.exactMappedEpisodes,
      exactMappedFrames: artifact.lineageConclusion.exactMappedFrames,
      legacyMissingEpisode: artifact.legacyMetadataConclusion.exactMissingEpisode,
      derivativeRightsFailClosed: artifact.supportConclusion.derivativeRightsFailClosed,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: acquisition.manifest.manifestHash,
      sourceRoot: acquisition.manifest.sourceRoot,
      visualReplay: false,
      independentOutcome: 0,
      training: 0,
      authority: 0,
      action: 0,
    };
    process.stdout.write(`${canonicalizeStrict(summary)}\n`);
    return summary;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked !== null && invoked === fileURLToPath(import.meta.url)) {
  runRecapAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}

