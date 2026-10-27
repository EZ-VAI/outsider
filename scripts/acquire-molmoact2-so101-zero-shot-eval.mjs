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
  MOLMOACT2_SO101_AUDIT_SCHEMA, MOLMOACT2_SO101_ID,
  MOLMOACT2_SO101_REVISION, acquirePinnedMolmoact2So101Source,
  buildMolmoact2So101AuditFromSource, molmoact2So101Sha256,
  verifyMolmoact2So101Audit, verifyMolmoact2So101AuditWithSource,
} from "../src/outsider-molmoact2-so101-zero-shot-eval.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-molmoact2-so101-zero-shot-eval-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `MOLMOACT2_SO101_CLI_${code}`
    : `MOLMOACT2_SO101_CLI_${code}:${detail}`);
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

function insideWorkspace(value) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (target === path.parse(target).root || relative === "" || relative === ".."
    || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  }
  return target;
}

function writeCanonicalOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  return { path: path.basename(file), bytes: bytes.length,
    sha256: molmoact2So101Sha256(bytes) };
}

function privateTree(root) {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", root);
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) privateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

export async function runMolmoact2So101Acquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-molmoact2-so101-zero-shot-eval.mjs [--output <new-dir>] [--python <pyarrow-python>]",
      "",
      "Acquires all nine files in the pinned public repository: two raw event",
      "logs, two run metadata files, both GIF previews and the image Parquet.",
      "Transport/action evidence remains publisher-native and task failures are",
      "not promoted to network failure or independent outcome.",
    ].join("\n") + "\n");
    return null;
  }
  const target = insideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  const parent = path.dirname(target);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (lstatSync(parent).isSymbolicLink() || !lstatSync(parent).isDirectory()) {
    fail("OUTPUT_PARENT_UNSAFE", parent);
  }
  const temporary = path.join(parent,
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const acquired = await acquirePinnedMolmoact2So101Source(
      path.join(temporary, "source"));
    const artifact = buildMolmoact2So101AuditFromSource(acquired.sourceDirectory,
      { pythonExecutable: args.python });
    const standalone = verifyMolmoact2So101Audit(artifact);
    if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
    const sourceBound = verifyMolmoact2So101AuditWithSource(artifact,
      acquired.sourceDirectory, { pythonExecutable: args.python });
    if (!sourceBound.ok || sourceBound.verificationLevel
      !== "FULL_COMPLETE_REPOSITORY_EVENT_PARQUET_AND_GIF_STRUCTURE_REPLAY") {
      fail("FULL_REPLAY_FAILED", sourceBound.error);
    }
    const report = writeCanonicalOnce(path.join(temporary,
      "molmoact2-so101-zero-shot-eval.json"), artifact);
    const manifestBody = {
      schema: "outsider/molmoact2-so101-zero-shot-artifact-manifest/v1",
      reportSchema: MOLMOACT2_SO101_AUDIT_SCHEMA,
      report, reportHash: artifact.artifactHash,
      repository: { id: MOLMOACT2_SO101_ID, revision: MOLMOACT2_SO101_REVISION },
      sourceManifestHash: acquired.manifest.manifestHash,
      sourceRoot: acquired.manifest.sourceRoot,
      sourceClosure: acquired.manifest.closure,
      verification: sourceBound,
      admission: artifact.admission,
      rights: artifact.rights,
      privacy: artifact.privacy,
      boundary: artifact.boundary,
    };
    const artifactManifest = { ...manifestBody,
      manifestHash: molmoact2So101Sha256(Buffer.from(
        `outsider/molmoact2-so101-zero-shot-artifact-manifest/v1\0${
          canonicalizeStrict(manifestBody)}`, "utf8")) };
    writeCanonicalOnce(path.join(temporary, "artifact-manifest.json"), artifactManifest);
    privateTree(temporary);
    renameSync(temporary, target);
    chmodSync(target, 0o700);
    const summary = {
      status: artifact.status,
      admission: artifact.admission,
      output: path.relative(process.cwd(), target),
      selectedObjects: acquired.manifest.closure.selectedObjects,
      selectedBytes: acquired.manifest.closure.selectedBytes,
      traces: artifact.taskOutcome.publishedTraces,
      failedTraces: artifact.taskOutcome.failureTraces,
      parquetRows: artifact.replay.parquet.rows,
      observationEvents: artifact.replay.totals.observationEvents,
      actionChunkEvents: artifact.replay.totals.actionChunkEvents,
      appliedActionEvents: artifact.replay.totals.appliedActionEvents,
      gifFrames: artifact.replay.totals.gifFrames,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: acquired.manifest.manifestHash,
      sourceRoot: acquired.manifest.sourceRoot,
      independentOutcome: 0,
      completeAttemptCensus: false,
      training: 0,
      network: 0,
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
  runMolmoact2So101Acquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
