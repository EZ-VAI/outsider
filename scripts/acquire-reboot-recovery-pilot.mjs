#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  REBOOT_DATASET_ID,
  REBOOT_REVISION,
  acquirePinnedRebootSource,
  buildRebootRecoveryPilotFromSource,
  rebootRecoveryOpaqueReference,
  rebootRecoveryProjectionForNetwork,
  verifyRebootRecoveryPilotArtifact,
  verifyRebootRecoveryPilotArtifactWithSource,
} from "../src/outsider-reboot-recovery-pilot.js";

const DEFAULT_OUTPUT = "artifacts/outsider-reboot-recovery-pilot-20260828-v1";

function fail(code, detail = null) {
  throw new Error(detail == null ? `REBOOT_RECOVERY_CLI_${code}`
    : `REBOOT_RECOVERY_CLI_${code}:${detail}`);
}
function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`);
}
function writeCanonical(root, filename, value) {
  const bytes = canonicalBytes(value);
  const target = path.join(root, filename);
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(target, 0o600);
  return { path: filename, sizeBytes: bytes.length, sha256: sha256(bytes) };
}
function parseArgs(argv) {
  const parsed = { output: DEFAULT_OUTPUT, python: ".venv/bin/python" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      if (!argv[index + 1]) fail("OUTPUT_ARGUMENT_MISSING");
      parsed.output = argv[++index];
    } else if (argument === "--python") {
      if (!argv[index + 1]) fail("PYTHON_ARGUMENT_MISSING");
      parsed.python = argv[++index];
    } else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-reboot-recovery-pilot.mjs [--output <new-dir>] [--python <pyarrow-python>]",
        "",
        "Acquires only pinned REBOOT metadata and 60 action/state Parquet files.",
        "It never fetches videos and never grants action or authority.",
      ].join("\n") + "\n");
      process.exit(0);
    } else fail("ARGUMENT_UNKNOWN", argument);
  }
  return parsed;
}

const args = parseArgs(process.argv.slice(2));
const target = path.resolve(args.output);
if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_TOO_BROAD");
mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
const temporary = path.join(path.dirname(target),
  `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
mkdirSync(temporary, { mode: 0o700 });

try {
  const acquisition = await acquirePinnedRebootSource(path.join(temporary, "source"));
  const artifact = buildRebootRecoveryPilotFromSource(acquisition.sourceDirectory,
    { pythonExecutable: args.python });
  const standalone = verifyRebootRecoveryPilotArtifact(artifact);
  if (!standalone.ok) fail("STANDALONE_VERIFICATION_FAILED");
  const sourceReplay = verifyRebootRecoveryPilotArtifactWithSource(artifact,
    acquisition.sourceDirectory, { pythonExecutable: args.python });
  if (!sourceReplay.ok || sourceReplay.verificationLevel !== "FULL_SOURCE_REPLAY") {
    fail("FULL_SOURCE_REPLAY_FAILED");
  }
  const projection = {
    schema: "outsider/reboot-recovery-safe-episode-projection/v1",
    sourceArtifactHash: artifact.artifactHash,
    privacyBoundary: artifact.episodeProjection.privacyBoundary,
    projectionHash: artifact.episodeProjection.projectionHash,
    quality: artifact.quality,
    episodes: artifact.episodeProjection.episodes,
    authorityDelta: 0,
  };
  const model = {
    schema: "outsider/reboot-recovery-acquisition-model/v1",
    sourceArtifactHash: artifact.artifactHash,
    training: artifact.training,
    useBoundary: artifact.controlPlaneProjection,
    authority: artifact.authority,
  };
  const networkProjection = rebootRecoveryProjectionForNetwork(artifact,
    acquisition.sourceDirectory, { pythonExecutable: args.python });
  const opaqueReference = rebootRecoveryOpaqueReference(artifact);
  const files = [
    writeCanonical(temporary, "report.json", artifact),
    writeCanonical(temporary, "episode-projection.json", projection),
    writeCanonical(temporary, "model.json", model),
    writeCanonical(temporary, "network-control-plane-projection.json", networkProjection),
    writeCanonical(temporary, "opaque-reference.json", opaqueReference),
  ];
  const receipt = {
    schema: "outsider/reboot-recovery-pilot-run-receipt/v1",
    datasetId: REBOOT_DATASET_ID,
    revision: REBOOT_REVISION,
    outputDirectory: target,
    sourceManifestFileSha256: acquisition.manifestFileSha256,
    artifactHash: artifact.artifactHash,
    episodeProjectionHash: artifact.episodeProjection.projectionHash,
    trainingDecision: artifact.training.decision,
    baselineMetrics: artifact.training.baseline.metrics,
    candidateMetrics: artifact.training.candidate.metrics,
    exploratoryEpisodeOnlyMetrics: {
      baseline: artifact.training.exploratoryEpisodeOnlyDiagnostic.baseline.metrics,
      candidate: artifact.training.exploratoryEpisodeOnlyDiagnostic.candidate.metrics,
      promotionEligible: false,
    },
    selectedSourceObjects: artifact.source.selectedObjects.length,
    actionStateEpisodeFiles: artifact.quality.realRobotActionStateParquetFilesReplayed,
    framesObserved: artifact.quality.framesObserved,
    sourceReplay,
    zeroAuthority: true,
    mediaFetched: false,
    generatedFiles: files,
  };
  const receiptFile = writeCanonical(temporary, "run-receipt.json", receipt);
  renameSync(temporary, target);
  process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory: target,
    datasetId: REBOOT_DATASET_ID, revision: REBOOT_REVISION,
    artifactHash: artifact.artifactHash,
    episodeProjectionHash: artifact.episodeProjection.projectionHash,
    decision: artifact.training.decision,
    baseline: artifact.training.baseline.metrics,
    candidate: artifact.training.candidate.metrics,
    exploratoryEpisodeOnlyDiagnostic: artifact.training.exploratoryEpisodeOnlyDiagnostic,
    quality: artifact.quality,
    sourceObjects: artifact.source.selectedObjects.length,
    receiptFile }, null, 2)}\n`);
} catch (error) {
  rmSync(temporary, { recursive: true, force: true });
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
