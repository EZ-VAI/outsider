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
  SO101_HIL_RL_LINEAGE_SCHEMA,
  SO101_HIL_RL_REPOSITORIES,
  acquirePinnedSo101HilRlSource,
  buildSo101HilRlLineageFromSource,
  so101HilRlSha256,
  verifySo101HilRlLineageArtifact,
  verifySo101HilRlLineageArtifactWithSource,
} from "../src/outsider-so101-hil-rl-lineage.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-so101-hil-rl-linked-lineage-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail == null ? `SO101_HIL_RL_CLI_${code}`
    : `SO101_HIL_RL_CLI_${code}:${detail}`);
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

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
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
  const bytes = canonicalBytes(value);
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  return { path: path.basename(file), bytes: bytes.length,
    sha256: so101HilRlSha256(bytes) };
}

function enforcePrivateTree(root) {
  const checked = lstatSync(root);
  if (checked.isSymbolicLink() || !checked.isDirectory()) fail("DIRECTORY_UNSAFE", root);
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) enforcePrivateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

export async function runSo101HilRlLinkedLineageAcquisition(
  argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-so101-hil-rl-linked-lineage.mjs [--output <new-dir>] [--python <pyarrow-python>]",
      "",
      "Acquires and fully replays every data and metadata object in the pinned",
      "TakuyaHiraoka SO101 HIL round-1 and linked RL round-1 repositories.",
      "Videos and images are never fetched. Operator outcomes are not promoted",
      "to independent outcomes; discarded attempts and policy bytes remain absent.",
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
    const acquisition = await acquirePinnedSo101HilRlSource(
      path.join(temporary, "source"));
    const artifact = buildSo101HilRlLineageFromSource(acquisition.sourceDirectory,
      { pythonExecutable: args.python });
    const standalone = verifySo101HilRlLineageArtifact(artifact);
    if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
    const sourceBound = verifySo101HilRlLineageArtifactWithSource(artifact,
      acquisition.sourceDirectory, { pythonExecutable: args.python });
    if (!sourceBound.ok || sourceBound.verificationLevel
      !== "FULL_TWO_REPOSITORY_PINNED_BYTE_AND_PYARROW_REPLAY") {
      fail("FULL_SOURCE_REPLAY_FAILED", sourceBound.error);
    }
    const report = writeCanonicalOnce(path.join(temporary,
      "so101-hil-rl-linked-lineage.json"), artifact);
    const manifestBody = {
      schema: "outsider/so101-hil-rl-linked-lineage-artifact-manifest/v1",
      repositories: Object.fromEntries(Object.entries(SO101_HIL_RL_REPOSITORIES)
        .map(([key, value]) => [key, {
          datasetId: value.datasetId, revision: value.revision,
        }])),
      reportSchema: SO101_HIL_RL_LINEAGE_SCHEMA,
      report,
      reportHash: artifact.artifactHash,
      sourceManifestHash: acquisition.manifest.manifestHash,
      sourceRoot: acquisition.manifest.sourceRoot,
      sourceClosure: acquisition.manifest.sourceClosure,
      verification: sourceBound,
      admission: artifact.admission,
      visualReplay: false,
      rights: artifact.rights,
      boundary: artifact.boundary,
    };
    const artifactManifest = { ...manifestBody,
      manifestHash: so101HilRlSha256(Buffer.from(
        `outsider/so101-hil-rl-linked-lineage-artifact-manifest/v1\0${
          canonicalizeStrict(manifestBody)}`, "utf8")) };
    writeCanonicalOnce(path.join(temporary, "artifact-manifest.json"), artifactManifest);
    enforcePrivateTree(temporary);
    renameSync(temporary, target);
    chmodSync(target, 0o700);
    const summary = {
      status: artifact.status,
      admission: artifact.admission,
      output: path.relative(process.cwd(), target),
      repositories: artifact.repositories,
      selectedObjects: acquisition.manifest.sourceClosure.selectedObjects,
      selectedBytes: acquisition.manifest.sourceClosure.selectedBytes,
      episodesReplayed: artifact.replay.combined.episodesReplayed,
      framesReplayed: artifact.replay.combined.framesReplayed,
      rlOutcomes: { success: artifact.outcome.rlSuccessfulEpisodes,
        failure: artifact.outcome.rlFailedEpisodes },
      interventionFrames: artifact.recovery.interventionFrames,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: acquisition.manifest.manifestHash,
      sourceRoot: acquisition.manifest.sourceRoot,
      visualReplay: false,
      completeAttemptCensus: false,
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
  runSo101HilRlLinkedLineageAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
