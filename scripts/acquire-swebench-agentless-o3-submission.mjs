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
  SWEBENCH_AGENTLESS_O3_AUDIT_SCHEMA, SWEBENCH_AGENTLESS_O3_PROFILE,
  SWEBENCH_AGENTLESS_O3_REPOSITORY, SWEBENCH_AGENTLESS_O3_REVISION,
  SWEBENCH_AGENTLESS_O3_SUBMISSION, acquirePinnedSwebenchAgentlessO3Source,
  buildSwebenchAgentlessO3AuditFromSource, swebenchAgentlessO3Sha256,
  verifySwebenchAgentlessO3Audit, verifySwebenchAgentlessO3AuditWithSource,
} from "../src/outsider-swebench-agentless-o3-submission.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-swebench-agentless-o3-submission-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `SWEBENCH_AGENTLESS_O3_CLI_${code}`
    : `SWEBENCH_AGENTLESS_O3_CLI_${code}:${detail}`);
}

function parseArgs(argv) {
  const value = { output: DEFAULT_OUTPUT, seed: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      if (!argv[index + 1]) fail("OUTPUT_ARGUMENT_MISSING");
      value.output = argv[++index];
    } else if (argument === "--seed") {
      if (!argv[index + 1]) fail("SEED_ARGUMENT_MISSING");
      value.seed = path.resolve(argv[++index]);
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
    sha256: swebenchAgentlessO3Sha256(bytes) };
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

export async function runSwebenchAgentlessO3Acquisition(
  argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-swebench-agentless-o3-submission.mjs [--output <new-dir>] [--seed <private-prefix-dir>]",
      "",
      "Acquires the complete official 300-task Agentless Lite + O3 Mini",
      "submission prefix: 300 trajectories, 294 predictions and 294 complete",
      "harness groups. Raw completions, patches and test output remain private.",
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
    const acquired = await acquirePinnedSwebenchAgentlessO3Source(
      path.join(temporary, "source"), {
        downloadConcurrency: 8,
        s3Transport: "aws-cli",
        s3SeedDirectory: args.seed,
        progress: ({ completed, total, range = null }) => {
          if (range === null) process.stderr.write(`swebench-s3 ${completed}/${total}\n`);
          else process.stderr.write(`swebench-range ${range.completed}/${range.total}\n`);
        },
      });
    const artifact = buildSwebenchAgentlessO3AuditFromSource(
      acquired.sourceDirectory);
    const standalone = verifySwebenchAgentlessO3Audit(artifact);
    if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
    const sourceBound = verifySwebenchAgentlessO3AuditWithSource(artifact,
      acquired.sourceDirectory);
    if (!sourceBound.ok || sourceBound.verificationLevel
      !== "FULL_SWEBENCH_TRAJECTORY_PREDICTION_PATCH_REPORT_TEST_OUTPUT_REPLAY") {
      fail("FULL_REPLAY_FAILED", sourceBound.error);
    }
    const report = writeCanonicalOnce(path.join(temporary,
      "swebench-agentless-o3-submission.json"), artifact);
    const manifestBody = {
      schema: "outsider/swebench-agentless-o3-artifact-manifest/v1",
      reportSchema: SWEBENCH_AGENTLESS_O3_AUDIT_SCHEMA,
      report, reportHash: artifact.artifactHash,
      repository: { id: SWEBENCH_AGENTLESS_O3_REPOSITORY,
        revision: SWEBENCH_AGENTLESS_O3_REVISION,
        submission: SWEBENCH_AGENTLESS_O3_SUBMISSION },
      sourceManifestHash: acquired.manifest.manifestHash,
      sourceRoot: acquired.manifest.sourceRoot,
      sourceClosure: acquired.manifest.closure,
      verification: sourceBound,
      admission: artifact.admission, rights: artifact.rights,
      privacy: artifact.privacy, boundary: artifact.boundary,
    };
    const artifactManifest = { ...manifestBody,
      manifestHash: swebenchAgentlessO3Sha256(Buffer.from(
        `outsider/swebench-agentless-o3-artifact-manifest/v1\0${
          canonicalizeStrict(manifestBody)}`, "utf8")) };
    writeCanonicalOnce(path.join(temporary, "artifact-manifest.json"),
      artifactManifest);
    privateTree(temporary);
    renameSync(temporary, target);
    chmodSync(target, 0o700);
    const summary = { status: artifact.status, admission: artifact.admission,
      output: path.relative(process.cwd(), target),
      submissionObjects: SWEBENCH_AGENTLESS_O3_PROFILE.submissionObjects,
      submissionBytes: SWEBENCH_AGENTLESS_O3_PROFILE.submissionBytes,
      tasks: artifact.replay.census.declaredTasks,
      resolved: artifact.replay.census.resolved,
      unresolved: artifact.replay.census.unresolved,
      noGeneration: artifact.replay.census.noGeneration,
      generationApiResponses: artifact.replay.generation.trajectoryApiResponses,
      exactPatchBindings: artifact.replay.harness.exactPredictionPatchBindings,
      artifactHash: artifact.artifactHash,
      replayHash: artifact.replay.replayHash,
      sourceManifestHash: acquired.manifest.manifestHash,
      sourceRoot: acquired.manifest.sourceRoot,
      training: 0, network: 0, authority: 0, action: 0,
      independentOutcome: 0, recovery: false };
    process.stdout.write(`${canonicalizeStrict(summary)}\n`);
    return summary;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked !== null && invoked === fileURLToPath(import.meta.url)) {
  runSwebenchAgentlessO3Acquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
