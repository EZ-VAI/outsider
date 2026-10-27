#!/usr/bin/env node

import path from "node:path";
import {
  publishEpisodeDataEnginePublicSourceArtifactFromSource,
  verifyEpisodeDataEnginePublicSourceArtifactDirectory,
} from "../src/outsider-episode-data-engine-public-source-binding.js";

const DEFAULTS = Object.freeze({
  inputDir: "artifacts/public-agent-corpus-20260820",
  cuaInputDir: "artifacts/cua-verifier-bench-20260828",
  rebootInputDir: "artifacts/outsider-reboot-recovery-pilot-20260828-v1",
  sentinelInputDir:
    "artifacts/outsider-agent-trajectory-sentinel-quarantine-20260829-v2",
  staleConstraintInputDir:
    "artifacts/outsider-stale-constraint-episodes-20260828-v2",
  publicSourceWorkspaceRoot: ".",
  outputDir: null,
});

const FLAGS = Object.freeze({
  "--input-dir": "inputDir",
  "--cua-input-dir": "cuaInputDir",
  "--reboot-input-dir": "rebootInputDir",
  "--sentinel-input-dir": "sentinelInputDir",
  "--stale-constraint-input-dir": "staleConstraintInputDir",
  "--public-source-workspace-root": "publicSourceWorkspaceRoot",
  "--output-dir": "outputDir",
});

function usage() {
  return "Usage: node scripts/outsider-episode-data-engine-public-source-binding.mjs --output-dir DIR [--input-dir DIR] [--cua-input-dir DIR] [--reboot-input-dir DIR] [--sentinel-input-dir DIR] [--stale-constraint-input-dir DIR] [--public-source-workspace-root DIR]\n";
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    process.stdout.write(usage());
    process.exit(0);
  }
  const result = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const key = FLAGS[argv[index]];
    if (!key || typeof argv[index + 1] !== "string"
      || argv[index + 1].length === 0) {
      throw new Error(`EPISODE_DATA_ENGINE_PUBLIC_SOURCE_ARGUMENT_INVALID:${
        argv[index] ?? "<missing>"}`);
    }
    result[key] = argv[++index];
  }
  if (!result.outputDir) {
    throw new Error("EPISODE_DATA_ENGINE_PUBLIC_SOURCE_OUTPUT_DIR_REQUIRED");
  }
  return result;
}

function sourceOptions(args) {
  const artifactDirectory = path.resolve(args.inputDir);
  const rebootArtifactDirectory = path.resolve(args.rebootInputDir);
  return {
    sourceDirectory: path.join(artifactDirectory, "source"),
    artifactDirectory,
    cuaArtifactDirectory: path.resolve(args.cuaInputDir),
    rebootArtifactDirectory,
    rebootSourceDirectory: path.join(rebootArtifactDirectory, "source"),
    sentinelArtifactDirectory: path.resolve(args.sentinelInputDir),
    staleConstraintArtifactDirectory:
      path.resolve(args.staleConstraintInputDir),
    publicSourceWorkspaceRoot: path.resolve(args.publicSourceWorkspaceRoot),
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const outputDirectory = path.resolve(args.outputDir);
  const options = sourceOptions(args);
  const published = await publishEpisodeDataEnginePublicSourceArtifactFromSource({
    ...options,
    trustedRoot: path.dirname(outputDirectory),
    outputDirectory,
  });
  const verified = await verifyEpisodeDataEnginePublicSourceArtifactDirectory(
    outputDirectory, options);
  if (!verified.ok) {
    throw new Error(`EPISODE_DATA_ENGINE_PUBLIC_SOURCE_POST_PUBLISH_VERIFY_FAILED:${
      verified.error}`);
  }
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputDirectory,
    bindingHash: verified.bindingHash,
    receiptHash: verified.receiptHash,
    receiptFileSha256: published.receiptFileSha256,
    engineReportHash: verified.engineReportHash,
    sourceLedgerHash: verified.sourceLedgerHash,
    catalogHash: verified.catalogHash,
    profileId: verified.profileId,
    engineFullSourceReplayEstablished:
      verified.engineFullSourceReplayEstablished,
    fixedProfileWorkspaceRebuildEstablished:
      verified.fixedProfileWorkspaceRebuildEstablished,
    declaredVerificationRadiusReplayEstablished:
      verified.declaredVerificationRadiusReplayEstablished,
    allCatalogSourcesFullPayloadReplayEstablished:
      verified.allCatalogSourcesFullPayloadReplayEstablished,
    metadataOnlySourceIds: verified.metadataOnlySourceIds,
    exactFileSetEstablished: verified.exactFileSetEstablished,
    receiptWrittenLastEstablished: verified.receiptWrittenLastEstablished,
    authorizedTrainingRowsAdded: verified.authorizedTrainingRowsAdded,
    networkAdmissionRowsAdded: verified.networkAdmissionRowsAdded,
    delegationAuthorityUnitsAdded: verified.delegationAuthorityUnitsAdded,
    causalExperienceUnitsAdded: verified.causalExperienceUnitsAdded,
  })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
