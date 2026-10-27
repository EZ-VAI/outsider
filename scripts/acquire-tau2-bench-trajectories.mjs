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
  TAU2_TRAJECTORIES_AUDIT_SCHEMA, TAU2_TRAJECTORIES_ID,
  TAU2_TRAJECTORIES_REVISION, acquirePinnedTau2TrajectoriesSource,
  buildTau2TrajectoriesAuditFromSource, tau2TrajectoriesSha256,
  verifyTau2TrajectoriesAudit, verifyTau2TrajectoriesAuditWithSource,
} from "../src/outsider-tau2-bench-trajectories.js";

const DEFAULT_OUTPUT = "artifacts/outsider-tau2-bench-trajectories-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `TAU2_TRAJECTORIES_CLI_${code}`
    : `TAU2_TRAJECTORIES_CLI_${code}:${detail}`);
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
    sha256: tau2TrajectoriesSha256(bytes) };
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

export async function runTau2TrajectoriesAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-tau2-bench-trajectories.mjs [--output <new-dir>] [--python <python>]",
      "",
      "Acquires all 32 pinned repository objects (30 model JSONL files) and",
      "replays aggregate task, message, tool-call and publisher-evaluator structure.",
      "Raw dialogue remains private in the source closure.",
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
    const acquired = await acquirePinnedTau2TrajectoriesSource(
      path.join(temporary, "source"));
    const artifact = buildTau2TrajectoriesAuditFromSource(acquired.sourceDirectory,
      { pythonExecutable: args.python });
    const standalone = verifyTau2TrajectoriesAudit(artifact);
    if (!standalone.ok) {
      process.stderr.write(`${canonicalizeStrict({
        error: standalone.error,
        files: artifact.replay.files,
        matrix: artifact.replay.matrix,
        publisherEvaluation: artifact.replay.publisherEvaluation,
        anomalies: artifact.replay.anomalies,
        perModelCoverage: artifact.replay.perModel.map((entry) => ({
          model: entry.model, rows: entry.rows,
          uniqueTaskIdentities: entry.uniqueTaskIdentities,
          missingTasksFromUnion: entry.missingTasksFromUnion,
          anomalies: entry.anomalies.total,
        })),
      })}\n`);
      fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
    }
    const sourceBound = verifyTau2TrajectoriesAuditWithSource(artifact,
      acquired.sourceDirectory, { pythonExecutable: args.python });
    if (!sourceBound.ok || sourceBound.verificationLevel
      !== "FULL_TAU2_JSONL_MESSAGE_TOOL_EVAL_AND_TASK_MATRIX_REPLAY") {
      fail("FULL_REPLAY_FAILED", sourceBound.error);
    }
    const report = writeCanonicalOnce(path.join(temporary,
      "tau2-bench-trajectories.json"), artifact);
    const manifestBody = {
      schema: "outsider/tau2-bench-trajectories-artifact-manifest/v1",
      reportSchema: TAU2_TRAJECTORIES_AUDIT_SCHEMA,
      report, reportHash: artifact.artifactHash,
      repository: { id: TAU2_TRAJECTORIES_ID,
        revision: TAU2_TRAJECTORIES_REVISION },
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
      manifestHash: tau2TrajectoriesSha256(Buffer.from(
        `outsider/tau2-bench-trajectories-artifact-manifest/v1\0${
          canonicalizeStrict(manifestBody)}`, "utf8")) };
    writeCanonicalOnce(path.join(temporary, "artifact-manifest.json"),
      artifactManifest);
    privateTree(temporary);
    renameSync(temporary, target);
    chmodSync(target, 0o700);
    const summary = { status: artifact.status, admission: artifact.admission,
      output: path.relative(process.cwd(), target), selectedObjects: 32,
      selectedBytes: 289_780_557,
      models: artifact.replay.files.jsonlFiles,
      totalRows: artifact.replay.matrix.totalRows,
      unionTasks: artifact.replay.matrix.unionTasks,
      intersectionTasks: artifact.replay.matrix.intersectionTasks,
      messages: artifact.replay.messages.total,
      toolCalls: artifact.replay.messages.toolCalls,
      scoreClasses: artifact.replay.publisherEvaluation.scoreClasses,
      anomalyEvents: artifact.replay.anomalies.schemaAnomalyEvents,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: acquired.manifest.manifestHash,
      sourceRoot: acquired.manifest.sourceRoot,
      independentOutcome: 0, recovery: false, attemptCensus: false,
      training: 0, network: 0, authority: 0, action: 0 };
    process.stdout.write(`${canonicalizeStrict(summary)}\n`);
    return summary;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked !== null && invoked === fileURLToPath(import.meta.url)) {
  runTau2TrajectoriesAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
