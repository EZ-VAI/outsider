#!/usr/bin/env node

import {
  closeSync, constants, fstatSync, fsyncSync, mkdirSync, openSync,
  readFileSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  buildStage2RmaShadowPricing,
  buildStage2RmaShadowPricingCandidate,
  STAGE2_RMA_SHADOW_PRICING_CANONICAL,
  verifyStage2RmaShadowPricingAgainstSources,
  verifyStage2RmaShadowPricingCanonicalAgainstSources,
} from "../src/outsider-stage2-rma-shadow-pricing.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/stage2-rma-shadow-pricing.mjs build --rma-artifact <experience.json> --rma-zip <official.zip> --rma-layout <official.pdf> --current-chain-contract <contract.json> --out <historical-loss-cost.json>",
    "  node scripts/stage2-rma-shadow-pricing.mjs build-candidate-v4 --rma-artifact <experience.json> --rma-zip <official.zip> --rma-layout <official.pdf> --current-chain-contract <contract.json> --out <historical-loss-cost.json>",
    "  node scripts/stage2-rma-shadow-pricing.mjs verify --artifact <historical-loss-cost.json> --rma-artifact <experience.json> --rma-zip <official.zip> --rma-layout <official.pdf> --current-chain-contract <contract.json>",
    "  node scripts/stage2-rma-shadow-pricing.mjs verify-canonical --artifact <canonical-final-v4.json> --rma-artifact <experience.json> --rma-zip <official.zip> --rma-layout <official.pdf> --current-chain-contract <contract.json>",
    "",
    "The output contains a non-zero RMA source-domain historical loss cost.",
    "It never emits an AI/robot target quote or price permission.",
    "generatedAt is fixed by code; caller-supplied timestamps are rejected.",
  ].join("\n");
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const action = argv[0];
  if (!["build", "build-candidate-v4", "verify", "verify-canonical"]
    .includes(action)) {
    throw new Error("STAGE2_RMA_SHADOW_CLI_ACTION_INVALID");
  }
  const allowed = new Set(["--artifact", "--rma-artifact", "--rma-zip",
    "--rma-layout", "--current-chain-contract", "--out"]);
  const options = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith("--")) {
      throw new Error(`STAGE2_RMA_SHADOW_CLI_ARGUMENT_INVALID:${key ?? "missing"}`);
    }
    if (Object.hasOwn(options, key)) {
      throw new Error(`STAGE2_RMA_SHADOW_CLI_ARGUMENT_DUPLICATE:${key}`);
    }
    options[key] = value;
  }
  for (const key of ["--rma-artifact", "--rma-zip", "--rma-layout",
    "--current-chain-contract"]) {
    if (!options[key]) {
      throw new Error(`STAGE2_RMA_SHADOW_CLI_ARGUMENT_REQUIRED:${key}`);
    }
  }
  const buildAction = action === "build" || action === "build-candidate-v4";
  if (buildAction && !options["--out"]) {
    throw new Error("STAGE2_RMA_SHADOW_CLI_ARGUMENT_REQUIRED:--out");
  }
  if (!buildAction && !options["--artifact"]) {
    throw new Error("STAGE2_RMA_SHADOW_CLI_ARGUMENT_REQUIRED:--artifact");
  }
  if (buildAction && options["--artifact"]
    || !buildAction && options["--out"]) {
    throw new Error("STAGE2_RMA_SHADOW_CLI_ARGUMENT_NOT_ALLOWED_FOR_ACTION");
  }
  return options;
}

function resolved(value, code) {
  const target = path.resolve(value);
  if (target === path.parse(target).root) throw new Error(`${code}_TOO_BROAD`);
  return target;
}

function readStableFile(filePath, code, maximumBytes = 64 * 1024 * 1024) {
  const descriptor = openSync(filePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n
      || before.size > BigInt(maximumBytes)) throw new Error(`${code}_SIZE_INVALID`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || BigInt(bytes.length) !== after.size) {
      throw new Error(`${code}_CHANGED_DURING_READ`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function sourceInput(options) {
  return {
    rmaArtifactBytes: readStableFile(resolved(options["--rma-artifact"],
      "STAGE2_RMA_SHADOW_CLI_RMA_ARTIFACT"),
    "STAGE2_RMA_SHADOW_CLI_RMA_ARTIFACT", 2 * 1024 * 1024),
    rmaZipBytes: readStableFile(resolved(options["--rma-zip"],
      "STAGE2_RMA_SHADOW_CLI_RMA_ZIP"),
    "STAGE2_RMA_SHADOW_CLI_RMA_ZIP"),
    rmaRecordLayoutBytes: readStableFile(resolved(options["--rma-layout"],
      "STAGE2_RMA_SHADOW_CLI_RMA_LAYOUT"),
    "STAGE2_RMA_SHADOW_CLI_RMA_LAYOUT", 8 * 1024 * 1024),
    currentChainContractPath: resolved(options["--current-chain-contract"],
      "STAGE2_RMA_SHADOW_CLI_CURRENT_CHAIN_CONTRACT"),
  };
}

function writeNoClobber(filePath, artifact, buildStartedAt) {
  const output = resolved(filePath, "STAGE2_RMA_SHADOW_CLI_OUTPUT");
  if (typeof artifact.generatedAt !== "string"
    || !Number.isFinite(Date.parse(artifact.generatedAt))
    || typeof buildStartedAt !== "string"
    || !Number.isFinite(Date.parse(buildStartedAt))
    || Date.parse(artifact.generatedAt) > Date.parse(buildStartedAt)) {
    throw new Error("STAGE2_RMA_SHADOW_CLI_GENERATED_AT_AFTER_BUILD_START");
  }
  mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const descriptor = openSync(output, constants.O_WRONLY | constants.O_CREAT
    | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
    const published = fstatSync(descriptor, { bigint: true });
    if (BigInt(Date.parse(artifact.generatedAt)) * 1_000_000n > published.mtimeNs) {
      throw new Error("STAGE2_RMA_SHADOW_CLI_GENERATED_AT_AFTER_ARTIFACT_MTIME");
    }
  } finally {
    closeSync(descriptor);
  }
  return output;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  // Sample once before any stable source read. This is local build ordering,
  // never an external time attestation.
  const buildStartedAt = new Date().toISOString();
  const sources = sourceInput(options);
  if (options.action === "build" || options.action === "build-candidate-v4") {
    const candidateOnly = options.action === "build-candidate-v4";
    const artifact = candidateOnly
      ? buildStage2RmaShadowPricingCandidate(sources, {
          generatedAt: buildStartedAt,
        })
      : buildStage2RmaShadowPricing(sources);
    const output = writeNoClobber(options["--out"], artifact, buildStartedAt);
    const canonicalRoutingEligible = !candidateOnly
      && output === path.resolve(
        STAGE2_RMA_SHADOW_PRICING_CANONICAL.repositoryRelativePath,
      )
      && artifact.artifactHash
        === STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactHash;
    process.stdout.write(`${JSON.stringify({
      ok: true,
      output,
      artifactHash: artifact.artifactHash,
      generatedAt: artifact.generatedAt,
      buildStartedAt,
      candidateOnly,
      canonicalRoutingEligible,
      readinessStatus: artifact.readiness.status,
      pinnedReceiptCount: artifact.readiness.pinnedReceiptCount,
      temporallyOrderedCurrentReceiptCount:
        artifact.readiness.temporallyOrderedCurrentReceiptCount,
      temporalQuarantineReceiptCount:
        artifact.readiness.temporalQuarantineReceiptCount,
      temporalQuarantineReferenceFactorCount:
        artifact.readiness.temporalQuarantineReferenceFactorCount,
      factorsAdmittedForCurrentCoverage:
        artifact.readiness.factorsAdmittedForCurrentCoverage,
      publisherRecordedIndemnityDollars:
        artifact.matchedHistoricalExperience.publisherRecordedIndemnityDollars,
      historicalLossCostAggregateDollars:
        artifact.sourceDomainHistoricalLossCost.historicalLossCostAggregateDollars,
      historicalLossCostPer1000LiabilityDollars:
        artifact.sourceDomainHistoricalLossCost
          .historicalLossCostPer1000LiabilityDollars,
      historicalLossRateOnLiability:
        artifact.sourceDomainHistoricalLossCost.historicalLossRateOnLiability,
      targetQuotedPrice: artifact.targetPricingBoundary.targetQuotedPrice,
      targetQuotedPriceType:
        artifact.targetPricingBoundary.targetQuotedPriceType,
      pricePermission: artifact.permissions.pricePermission,
      readyToBearResponsibility: artifact.readiness.readyToBearResponsibility,
    }, null, 2)}\n`);
  } else {
    const artifactPath = resolved(options["--artifact"],
      "STAGE2_RMA_SHADOW_CLI_ARTIFACT");
    let checked;
    if (options.action === "verify-canonical") {
      checked = verifyStage2RmaShadowPricingCanonicalAgainstSources(
        artifactPath, sources,
      );
    } else {
      const artifact = JSON.parse(readStableFile(artifactPath,
        "STAGE2_RMA_SHADOW_CLI_ARTIFACT", 2 * 1024 * 1024).toString("utf8"));
      checked = verifyStage2RmaShadowPricingAgainstSources(artifact, sources);
    }
    process.stdout.write(`${JSON.stringify(checked, null, 2)}\n`);
    if (!checked.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
