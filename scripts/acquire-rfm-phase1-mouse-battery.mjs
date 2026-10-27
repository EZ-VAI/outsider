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
  RFM_PHASE1_AUDIT_SCHEMA, RFM_PHASE1_ID, RFM_PHASE1_REVISION,
  acquirePinnedRfmPhase1Source, buildRfmPhase1AuditFromSource,
  rfmPhase1Sha256, verifyRfmPhase1Audit, verifyRfmPhase1AuditWithSource,
} from "../src/outsider-rfm-phase1-mouse-battery.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-rfm-phase1-mouse-battery-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `RFM_PHASE1_CLI_${code}`
    : `RFM_PHASE1_CLI_${code}:${detail}`);
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
    sha256: rfmPhase1Sha256(bytes) };
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

export async function runRfmPhase1Acquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-rfm-phase1-mouse-battery.mjs [--output <new-dir>] [--python <pyarrow-python>]",
      "",
      "Binds all 13 full-tree pages before and after, then acquires the complete",
      "insert-mouse-battery failure and success/HIL Parquet+meta closure without",
      "videos. CC-BY-NC, privacy, outcome and robot-type discrepancies stay bounded.",
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
    const acquired = await acquirePinnedRfmPhase1Source(path.join(temporary, "source"));
    const artifact = buildRfmPhase1AuditFromSource(acquired.sourceDirectory,
      { pythonExecutable: args.python });
    const standalone = verifyRfmPhase1Audit(artifact);
    if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
    const sourceBound = verifyRfmPhase1AuditWithSource(artifact,
      acquired.sourceDirectory, { pythonExecutable: args.python });
    if (!sourceBound.ok || sourceBound.verificationLevel
      !== "FULL_289_PARQUET_META_AND_13_PAGE_TREE_REPLAY") {
      fail("FULL_REPLAY_FAILED", sourceBound.error);
    }
    const report = writeCanonicalOnce(path.join(temporary,
      "rfm-phase1-mouse-battery.json"), artifact);
    const manifestBody = {
      schema: "outsider/rfm-phase1-mouse-battery-artifact-manifest/v1",
      reportSchema: RFM_PHASE1_AUDIT_SCHEMA,
      report, reportHash: artifact.artifactHash,
      repository: { id: RFM_PHASE1_ID, revision: RFM_PHASE1_REVISION },
      sourceManifestHash: acquired.manifest.manifestHash,
      sourceRoot: acquired.manifest.sourceRoot,
      fullRepository: acquired.manifest.fullRepository,
      sourceClosure: acquired.manifest.closure,
      verification: sourceBound,
      admission: artifact.admission,
      rights: artifact.rights,
      privacy: artifact.privacy,
      boundary: artifact.boundary,
    };
    const artifactManifest = { ...manifestBody,
      manifestHash: rfmPhase1Sha256(Buffer.from(
        `outsider/rfm-phase1-mouse-battery-artifact-manifest/v1\0${
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
      treePages: acquired.manifest.fullRepository.treePages,
      treeLogicalBytes: acquired.manifest.fullRepository.treeLogicalBytes,
      usedStorageBytes: acquired.manifest.fullRepository.usedStorageBytes,
      failureEpisodes: artifact.replay.failure.episodes,
      failureFrames: artifact.replay.failure.frames,
      successHilEpisodes: artifact.replay.successHil.episodes,
      successHilFrames: artifact.replay.successHil.frames,
      sourceNativeHilEpisodes: artifact.replay.successHil.hilEpisodes,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: acquired.manifest.manifestHash,
      sourceRoot: acquired.manifest.sourceRoot,
      independentOutcome: 0,
      completeAttemptCensus: false,
      visualReplay: false,
      commercialUse: false,
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
  runRfmPhase1Acquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
