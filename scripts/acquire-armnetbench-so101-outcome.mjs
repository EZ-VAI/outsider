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
  ARMNETBENCH_SO101_DATASET_ID,
  ARMNETBENCH_SO101_OUTCOME_SCHEMA,
  ARMNETBENCH_SO101_REVISION,
  acquirePinnedArmnetBenchSo101Source,
  armnetBenchSo101Sha256,
  buildArmnetBenchSo101OutcomeFromSource,
  verifyArmnetBenchSo101OutcomeArtifact,
  verifyArmnetBenchSo101OutcomeArtifactWithSource,
} from "../src/outsider-armnetbench-so101-outcome.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-armnetbench-so101-outcome-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail == null ? `ARMNETBENCH_SO101_CLI_${code}`
    : `ARMNETBENCH_SO101_CLI_${code}:${detail}`);
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
    sha256: armnetBenchSo101Sha256(bytes) };
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

export async function runArmnetBenchSo101Acquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-armnetbench-so101-outcome.mjs [--output <new-dir>] [--python <pyarrow-python>]",
      "",
      "Acquires the frozen ArmnetBench v0.1 SO-101 README, all 120 data Parquet",
      "objects, and four metadata objects. Videos are never fetched or replayed.",
      "The resulting artifact grants no training, network, CEU, authority, action,",
      "opportunity, delegation, independent-outcome, or longitudinal-outcome status.",
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
    const acquisition = await acquirePinnedArmnetBenchSo101Source(
      path.join(temporary, "source"));
    const artifact = buildArmnetBenchSo101OutcomeFromSource(acquisition.sourceDirectory,
      { pythonExecutable: args.python });
    const standalone = verifyArmnetBenchSo101OutcomeArtifact(artifact);
    if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
    const replay = verifyArmnetBenchSo101OutcomeArtifactWithSource(artifact,
      acquisition.sourceDirectory, { pythonExecutable: args.python });
    if (!replay.ok
      || replay.verificationLevel !== "FULL_PINNED_SOURCE_BYTE_AND_PYARROW_REPLAY") {
      fail("FULL_SOURCE_REPLAY_FAILED", replay.error);
    }
    const reportDescriptor = writeCanonicalOnce(
      path.join(temporary, "armnetbench-so101-outcome.json"), artifact);
    const artifactManifestBody = {
      schema: "outsider/armnetbench-so101-outcome-artifact-manifest/v1",
      datasetId: ARMNETBENCH_SO101_DATASET_ID,
      revision: ARMNETBENCH_SO101_REVISION,
      reportSchema: ARMNETBENCH_SO101_OUTCOME_SCHEMA,
      report: reportDescriptor,
      reportHash: artifact.artifactHash,
      sourceManifestHash: acquisition.manifest.manifestHash,
      sourceRoot: acquisition.manifest.sourceRoot,
      sourceClosure: acquisition.manifest.sourceClosure,
      verification: replay,
      visualReplay: false,
      boundary: artifact.boundary,
    };
    const artifactManifest = { ...artifactManifestBody,
      manifestHash: armnetBenchSo101Sha256(Buffer.from(
        `outsider/armnetbench-so101-outcome-artifact-manifest/v1\0${
          canonicalizeStrict(artifactManifestBody)}`, "utf8")) };
    writeCanonicalOnce(path.join(temporary, "artifact-manifest.json"), artifactManifest);
    enforcePrivateTree(temporary);
    renameSync(temporary, target);
    chmodSync(target, 0o700);
    const summary = {
      status: "ACQUIRED_AND_FULLY_REPLAYED_NO_VIDEO",
      output: path.relative(process.cwd(), target),
      datasetId: ARMNETBENCH_SO101_DATASET_ID,
      revision: ARMNETBENCH_SO101_REVISION,
      selectedObjects: acquisition.manifest.sourceClosure.selectedObjects,
      selectedBytes: acquisition.manifest.sourceClosure.selectedBytes,
      episodes: artifact.replay.episodesReplayed,
      frames: artifact.replay.framesReplayed,
      outcomes: artifact.replay.outcomeCounts,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: acquisition.manifest.manifestHash,
      sourceRoot: acquisition.manifest.sourceRoot,
      visualReplay: false,
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
  runArmnetBenchSo101Acquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
