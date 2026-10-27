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
  HABIT_AUDIT_SCHEMA, HABIT_DATASET_ID, HABIT_REQUESTED_REVISION, HABIT_REVISION,
  acquirePinnedHabitSampleSource, buildHabitSampleAuditFromSource, habitSha256,
  verifyHabitSampleAuditArtifact, verifyHabitSampleAuditArtifactWithSource,
} from "../src/outsider-habit-sample-audit.js";

const DEFAULT_OUTPUT = "artifacts/outsider-habit-sample-audit-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail == null ? `HABIT_SAMPLE_CLI_${code}`
    : `HABIT_SAMPLE_CLI_${code}:${detail}`);
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
  return { path: path.basename(file), bytes: bytes.length, sha256: habitSha256(bytes) };
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

export async function runHabitSampleAuditAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-habit-sample-audit.mjs [--output <new-dir>] [--python <pyarrow-python>]",
      "",
      "Acquires the complete pinned HABIT sample no-video closure: 60 episode",
      "Parquets, all seven sample metadata files, and the root README. The 40",
      "Parquets on the first expanded API page are explicitly treated as a",
      "pagination prefix, not as the complete sample. Full-dataset and video",
      "bytes remain excluded; privacy, independent outcome, and authority stay zero.",
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
    const acquisition = await acquirePinnedHabitSampleSource(path.join(temporary, "source"));
    const artifact = buildHabitSampleAuditFromSource(acquisition.sourceDirectory,
      { pythonExecutable: args.python });
    const standalone = verifyHabitSampleAuditArtifact(artifact);
    if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
    const sourceBound = verifyHabitSampleAuditArtifactWithSource(artifact,
      acquisition.sourceDirectory, { pythonExecutable: args.python });
    if (!sourceBound.ok || sourceBound.verificationLevel
      !== "FULL_PINNED_SAMPLE_SOURCE_BYTE_AND_PYARROW_REPLAY") {
      fail("FULL_SOURCE_REPLAY_FAILED", sourceBound.error);
    }
    const report = writeCanonicalOnce(path.join(temporary, "habit-sample-audit.json"), artifact);
    const manifestBody = {
      schema: "outsider/habit-sample-audit-artifact-manifest/v1",
      datasetId: HABIT_DATASET_ID,
      requestedRevisionPrefix: HABIT_REQUESTED_REVISION,
      revision: HABIT_REVISION,
      reportSchema: HABIT_AUDIT_SCHEMA,
      report,
      reportHash: artifact.artifactHash,
      sourceManifestHash: acquisition.manifest.manifestHash,
      sourceRoot: acquisition.manifest.sourceRoot,
      sourceClosure: acquisition.manifest.sourceClosure,
      verification: sourceBound,
      admission: artifact.admission,
      visualReplay: false,
      privacy: artifact.privacy,
      rights: artifact.rights,
      boundary: artifact.boundary,
    };
    const artifactManifest = { ...manifestBody,
      manifestHash: habitSha256(Buffer.from(
        `outsider/habit-sample-audit-artifact-manifest/v1\0${
          canonicalizeStrict(manifestBody)}`, "utf8")) };
    writeCanonicalOnce(path.join(temporary, "artifact-manifest.json"), artifactManifest);
    enforcePrivateTree(temporary);
    renameSync(temporary, target);
    chmodSync(target, 0o700);
    const summary = {
      status: artifact.status,
      admission: artifact.admission,
      output: path.relative(process.cwd(), target),
      datasetId: HABIT_DATASET_ID,
      requestedRevisionPrefix: HABIT_REQUESTED_REVISION,
      revision: HABIT_REVISION,
      selectedObjects: acquisition.manifest.sourceClosure.selectedObjects,
      selectedBytes: acquisition.manifest.sourceClosure.selectedBytes,
      episodesReplayed: artifact.replay.episodesReplayed,
      framesReplayed: artifact.replay.framesReplayed,
      metadataTaskRows: artifact.replay.metadata.sampleTaskRows,
      firstPageDataFiles: 40,
      completeSampleDataFiles: 60,
      intervention: artifact.replay.signals.intervention,
      error: artifact.replay.signals.error,
      highJerk: artifact.replay.signals.highJerk,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: acquisition.manifest.manifestHash,
      sourceRoot: acquisition.manifest.sourceRoot,
      visualReplay: false,
      completeFullDataset: false,
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
  runHabitSampleAuditAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
