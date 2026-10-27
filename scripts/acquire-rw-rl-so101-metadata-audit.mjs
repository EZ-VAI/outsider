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
  RW_RL_DATASET_ID,
  RW_RL_REVISION,
  RW_RL_SO101_AUDIT_SCHEMA,
  acquirePinnedRwRlSo101Source,
  buildRwRlSo101MetadataAuditFromSource,
  rwRlSo101Sha256,
  verifyRwRlSo101MetadataAuditArtifact,
  verifyRwRlSo101MetadataAuditArtifactWithSource,
} from "../src/outsider-rw-rl-so101-metadata-audit.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-rw-rl-so101-metadata-audit-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail == null ? `RW_RL_SO101_CLI_${code}`
    : `RW_RL_SO101_CLI_${code}:${detail}`);
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
    sha256: rwRlSo101Sha256(bytes) };
}

function enforcePrivateTree(root) {
  const checked = lstatSync(root);
  if (checked.isSymbolicLink() || !checked.isDirectory()) {
    fail("DIRECTORY_UNSAFE", root);
  }
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) enforcePrivateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

export async function runRwRlSo101MetadataAuditAcquisition(
  argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-rw-rl-so101-metadata-audit.mjs [--output <new-dir>] [--python <pyarrow-python>]",
      "",
      "Inventories every pinned RW-RL SO101 task; acquires every SO101 metadata",
      "object, the smallest complete no-video task, and one complete episode",
      "Parquet schema probe from every other SO101 task. Videos are never fetched.",
      "The dataset has no declared data license and selected bytes have no",
      "intervention/reward/done/regime/outcome fields, so admission is always",
      "QUARANTINE_EVAL and all authority/action/training promotions remain zero.",
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
    const acquisition = await acquirePinnedRwRlSo101Source(
      path.join(temporary, "source"));
    const artifact = buildRwRlSo101MetadataAuditFromSource(
      acquisition.sourceDirectory, { pythonExecutable: args.python });
    const standalone = verifyRwRlSo101MetadataAuditArtifact(artifact);
    if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
    const replay = verifyRwRlSo101MetadataAuditArtifactWithSource(artifact,
      acquisition.sourceDirectory, { pythonExecutable: args.python });
    if (!replay.ok || replay.verificationLevel
      !== "FULL_PINNED_SOURCE_BYTE_METADATA_AND_BOUNDED_PYARROW_REPLAY") {
      fail("FULL_SOURCE_REPLAY_FAILED", replay.error);
    }
    const reportDescriptor = writeCanonicalOnce(
      path.join(temporary, "rw-rl-so101-metadata-audit.json"), artifact);
    const manifestBody = {
      schema: "outsider/rw-rl-so101-metadata-audit-artifact-manifest/v1",
      datasetId: RW_RL_DATASET_ID,
      revision: RW_RL_REVISION,
      reportSchema: RW_RL_SO101_AUDIT_SCHEMA,
      report: reportDescriptor,
      reportHash: artifact.artifactHash,
      sourceManifestHash: acquisition.manifest.manifestHash,
      sourceRoot: acquisition.manifest.sourceRoot,
      sourceClosure: acquisition.manifest.sourceClosure,
      verification: replay,
      admission: "QUARANTINE_EVAL",
      visualReplay: false,
      rights: artifact.rights,
      boundary: artifact.boundary,
    };
    const artifactManifest = { ...manifestBody,
      manifestHash: rwRlSo101Sha256(Buffer.from(
        `outsider/rw-rl-so101-metadata-audit-artifact-manifest/v1\0${
          canonicalizeStrict(manifestBody)}`, "utf8")) };
    writeCanonicalOnce(path.join(temporary, "artifact-manifest.json"),
      artifactManifest);
    enforcePrivateTree(temporary);
    renameSync(temporary, target);
    chmodSync(target, 0o700);
    const summary = {
      status: artifact.status,
      admission: artifact.admission,
      output: path.relative(process.cwd(), target),
      datasetId: RW_RL_DATASET_ID,
      revision: RW_RL_REVISION,
      selectedObjects: acquisition.manifest.sourceClosure.selectedObjects,
      selectedBytes: acquisition.manifest.sourceClosure.selectedBytes,
      allSo101EpisodesInventoried: artifact.allSo101Inventory.totals.dataFiles,
      completeTaskEpisodesReplayed: artifact.replay.completeTask.episodesReplayed,
      completeTaskFramesReplayed: artifact.replay.completeTask.framesReplayed,
      actualOutcomeFieldsAvailable: false,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: acquisition.manifest.manifestHash,
      sourceRoot: acquisition.manifest.sourceRoot,
      visualReplay: false,
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
  runRwRlSo101MetadataAuditAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}

