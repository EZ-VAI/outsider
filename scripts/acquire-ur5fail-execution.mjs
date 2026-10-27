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
  UR5FAIL_AUDIT_SCHEMA, UR5FAIL_ID, UR5FAIL_REVISION,
  acquirePinnedUr5failSource, buildUr5failAuditFromSource, ur5failSha256,
  verifyUr5failAudit, verifyUr5failAuditWithSource,
} from "../src/outsider-ur5fail-execution.js";

const DEFAULT_OUTPUT = "artifacts/outsider-ur5fail-execution-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `UR5FAIL_CLI_${code}`
    : `UR5FAIL_CLI_${code}:${detail}`);
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
    sha256: ur5failSha256(bytes) };
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

export async function runUr5failAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-ur5fail-execution.mjs [--output <new-dir>] [--python <python>]",
      "",
      "Acquires the complete pinned repository and replays 140 execution labels",
      "against 840 start/end image references in the tar without extracting it.",
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
    const acquired = await acquirePinnedUr5failSource(path.join(temporary, "source"));
    const artifact = buildUr5failAuditFromSource(acquired.sourceDirectory,
      { pythonExecutable: args.python });
    const standalone = verifyUr5failAudit(artifact);
    if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
    const sourceBound = verifyUr5failAuditWithSource(artifact,
      acquired.sourceDirectory, { pythonExecutable: args.python });
    if (!sourceBound.ok || sourceBound.verificationLevel
      !== "FULL_UR5FAIL_METADATA_TAR_PNG_AND_DERIVED_REFERENCE_REPLAY") {
      fail("FULL_REPLAY_FAILED", sourceBound.error);
    }
    const report = writeCanonicalOnce(path.join(temporary,
      "ur5fail-execution.json"), artifact);
    const manifestBody = {
      schema: "outsider/ur5fail-execution-artifact-manifest/v1",
      reportSchema: UR5FAIL_AUDIT_SCHEMA,
      report, reportHash: artifact.artifactHash,
      repository: { id: UR5FAIL_ID, revision: UR5FAIL_REVISION },
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
      manifestHash: ur5failSha256(Buffer.from(
        `outsider/ur5fail-execution-artifact-manifest/v1\0${
          canonicalizeStrict(manifestBody)}`, "utf8")) };
    writeCanonicalOnce(path.join(temporary, "artifact-manifest.json"), artifactManifest);
    privateTree(temporary);
    renameSync(temporary, target);
    chmodSync(target, 0o700);
    const summary = { status: artifact.status, admission: artifact.admission,
      output: path.relative(process.cwd(), target), selectedObjects: 9,
      selectedBytes: 56_243_131,
      executionSamples: artifact.replay.execution.samples,
      executionImageReferences: artifact.replay.execution.imageReferences,
      executionUniqueImages: artifact.replay.execution.uniqueImages,
      executionSuccesses: artifact.replay.execution.successes,
      executionFailures: artifact.replay.execution.failures,
      archivePngs: artifact.replay.archive.regularPngFiles,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: acquired.manifest.manifestHash,
      sourceRoot: acquired.manifest.sourceRoot,
      continuousTrajectory: false, recovery: false,
      independentOutcome: 0, training: 0, network: 0,
      authority: 0, action: 0 };
    process.stdout.write(`${canonicalizeStrict(summary)}\n`);
    return summary;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invoked !== null && invoked === fileURLToPath(import.meta.url)) {
  runUr5failAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
