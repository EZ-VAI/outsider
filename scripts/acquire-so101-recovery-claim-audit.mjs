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
  SO101_RECOVERY_AUDIT_SCHEMA, SO101_RECOVERY_DATASET_ID,
  SO101_RECOVERY_DATASET_REVISION, SO101_RECOVERY_MODEL_ID,
  SO101_RECOVERY_MODEL_REVISION, acquirePinnedSo101RecoverySource,
  buildSo101RecoveryClaimAuditFromSource, so101RecoverySha256,
  verifySo101RecoveryClaimAudit, verifySo101RecoveryClaimAuditWithSource,
} from "../src/outsider-so101-recovery-claim-audit.js";

const DEFAULT_OUTPUT = "artifacts/outsider-so101-recovery-claim-audit-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail == null ? `SO101_RECOVERY_CLI_${code}`
    : `SO101_RECOVERY_CLI_${code}:${detail}`);
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
  if (target === path.parse(target).root || relative === ""
    || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  return target;
}

function writeCanonicalOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
  return { path: path.basename(file), bytes: bytes.length,
    sha256: so101RecoverySha256(bytes) };
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

export async function runSo101RecoveryClaimAcquisition(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-so101-recovery-claim-audit.mjs [--output <new-dir>] [--python <pyarrow-python>]",
      "",
      "Acquires the complete pinned dataset no-video closure plus the exact",
      "publisher model-card README. It replays 143 episodes but keeps the",
      "120-clean/23-failure-then-recovery statement as a publisher claim because",
      "the dataset bytes expose no recovery or outcome field.",
    ].join("\n") + "\n");
    return null;
  }
  const target = insideWorkspace(args.output);
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
    const acquired = await acquirePinnedSo101RecoverySource(path.join(temporary, "source"));
    const artifact = buildSo101RecoveryClaimAuditFromSource(acquired.sourceDirectory,
      { pythonExecutable: args.python });
    const standalone = verifySo101RecoveryClaimAudit(artifact);
    if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED", standalone.error);
    const sourceBound = verifySo101RecoveryClaimAuditWithSource(artifact,
      acquired.sourceDirectory, { pythonExecutable: args.python });
    if (!sourceBound.ok || sourceBound.verificationLevel
      !== "FULL_DATASET_NO_VIDEO_AND_PINNED_MODEL_CARD_REPLAY") {
      fail("FULL_REPLAY_FAILED", sourceBound.error);
    }
    const report = writeCanonicalOnce(path.join(temporary,
      "so101-recovery-claim-audit.json"), artifact);
    const manifestBody = {
      schema: "outsider/so101-recovery-claim-audit-artifact-manifest/v1",
      reportSchema: SO101_RECOVERY_AUDIT_SCHEMA,
      report, reportHash: artifact.artifactHash,
      dataset: { id: SO101_RECOVERY_DATASET_ID,
        revision: SO101_RECOVERY_DATASET_REVISION },
      publisherModelCard: { id: SO101_RECOVERY_MODEL_ID,
        revision: SO101_RECOVERY_MODEL_REVISION },
      sourceManifestHash: acquired.manifest.manifestHash,
      sourceRoot: acquired.manifest.sourceRoot,
      sourceClosure: acquired.manifest.closure,
      verification: sourceBound,
      admission: artifact.admission,
      visualReplay: false,
      rights: artifact.rights,
      boundary: artifact.boundary,
    };
    const artifactManifest = { ...manifestBody,
      manifestHash: so101RecoverySha256(Buffer.from(
        `outsider/so101-recovery-claim-audit-artifact-manifest/v1\0${
          canonicalizeStrict(manifestBody)}`, "utf8")) };
    writeCanonicalOnce(path.join(temporary, "artifact-manifest.json"), artifactManifest);
    privateTree(temporary);
    renameSync(temporary, target);
    chmodSync(target, 0o700);
    const summary = {
      status: artifact.status,
      admission: artifact.admission,
      output: path.relative(process.cwd(), target),
      episodes: artifact.replay.episodes,
      frames: artifact.replay.frames,
      selectedObjects: acquired.manifest.closure.selectedObjects,
      selectedBytes: acquired.manifest.closure.selectedBytes,
      publisherClaim: { clean: artifact.publisher.modelCardClaimsCleanEpisodes,
        failureThenRecovery:
          artifact.publisher.modelCardClaimsFailureThenRecoveryEpisodes },
      recoveryEpisodeIdentitiesByteProven:
        artifact.recoveryClaimConclusion.recoveryEpisodeIdentitiesByteProven,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: acquired.manifest.manifestHash,
      sourceRoot: acquired.manifest.sourceRoot,
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
  runSo101RecoveryClaimAcquisition().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}

