import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildStage2RmaShadowPricing,
  buildStage2RmaShadowPricingCandidate,
  STAGE2_RMA_SHADOW_PRICING_CANONICAL,
  STAGE2_RMA_SHADOW_PRICING_SCHEMA,
  STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1,
  STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3,
  verifyStage2RmaShadowPricingAgainstSources,
  verifyStage2RmaShadowPricingCanonicalAgainstSources,
  verifyStage2RmaShadowPricingCanonicalStructure,
  verifyStage2RmaShadowPricingStructure,
  verifyStage2RmaShadowPricingSupersessionMarker,
  verifyStage2RmaShadowPricingV3SupersessionMarker,
} from "../src/outsider-stage2-rma-shadow-pricing.js";
import {
  STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL,
} from "../src/outsider-stage2-current-chain-admission.js";
import {
  buildLocalArtifactCanonicalIndex,
  LOCAL_ARTIFACT_DECLARATION_SCHEMA,
} from "../scripts/local-artifact-canonical-index.mjs";

const RMA_ARTIFACT = path.resolve(
  STAGE2_RMA_SHADOW_PRICING_CANONICAL.rmaArtifactRepositoryRelativePath);
const RMA_ZIP = path.resolve(
  "artifacts/stage234-rma-crop-insurance-2024/source/sobcov_2024.zip");
const RMA_LAYOUT = path.resolve(
  "artifacts/stage234-rma-crop-insurance-2024/source/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf");
const CURRENT_CHAIN = path.resolve(
  STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.repositoryRelativePath);
const CANONICAL = path.resolve(
  STAGE2_RMA_SHADOW_PRICING_CANONICAL.repositoryRelativePath);
const PRESERVED_V1 = path.resolve(
  STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.repositoryRelativePath);
const SUPERSESSION_MARKER = path.resolve(
  STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1
    .supersessionMarkerRepositoryRelativePath);
const PRESERVED_V3 = path.resolve(
  STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.repositoryRelativePath);
const V3_SUPERSESSION_MARKER = path.resolve(
  STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3
    .supersessionMarkerRepositoryRelativePath);

let input;
let artifact;
let temporary;

function reseal(value) {
  const body = structuredClone(value);
  delete body.artifactHash;
  return { ...body, artifactHash: `sha256:${createHash("sha256")
    .update(`${STAGE2_RMA_SHADOW_PRICING_SCHEMA}\0${canonicalizeStrict(body)}`,
      "utf8").digest("hex")}` };
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function allKeys(value, output = []) {
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    output.push(key);
    allKeys(child, output);
  }
  return output;
}

before(() => {
  input = {
    rmaArtifactBytes: readFileSync(RMA_ARTIFACT),
    rmaZipBytes: readFileSync(RMA_ZIP),
    rmaRecordLayoutBytes: readFileSync(RMA_LAYOUT),
    currentChainContractPath: CURRENT_CHAIN,
  };
  artifact = buildStage2RmaShadowPricing(input);
  temporary = mkdtempSync(path.join(tmpdir(), "outsider-stage2-rma-shadow-v4-"));
}, { timeout: 30_000 });

after(() => {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

test("publisher-recorded indemnity produces a non-zero historical loss cost", () => {
  assert.equal(artifact.schema, STAGE2_RMA_SHADOW_PRICING_SCHEMA);
  assert.equal(artifact.generatedAt,
    STAGE2_RMA_SHADOW_PRICING_CANONICAL.generatedAt);
  assert.equal(artifact.matchedHistoricalExperience
    .publisherRecordedIndemnityDollars, "15163448979");
  assert.equal(artifact.matchedHistoricalExperience.liabilityDollars,
    "158673917761");
  assert.equal(artifact.sourceDomainHistoricalLossCost
    .historicalLossCostAggregateDollars, "15163448979");
  assert.equal(artifact.sourceDomainHistoricalLossCost
    .historicalLossCostPerEarningPolicyCellDollars, "12445.79");
  assert.equal(artifact.sourceDomainHistoricalLossCost
    .historicalLossCostPer1000LiabilityDollars, "95.56");
  assert.equal(artifact.sourceDomainHistoricalLossCost
    .historicalLossRateOnLiability, "0.09556359");
  assert.equal(artifact.sourceDomainHistoricalLossCost
    .historicalIndemnityToObservedPremiumRatio, "0.95471095");
  assert.equal(artifact.sourceDomainHistoricalLossCost
    .historicalLossCostIsNumericZero, false);
  assert.equal(artifact.sourceDomainHistoricalLossCost.prospectiveForecast,
    false);
  assert.equal(allKeys(artifact).includes("PRICE"), false);
  assert.equal(JSON.stringify(artifact).includes("technicalPurePremium"), false);
  assert.equal(JSON.stringify(artifact).includes("realLoss"), false);
});

test("the historical number never becomes a target quote or permission", () => {
  assert.equal(artifact.targetPricingBoundary.targetQuotedPrice, null);
  assert.equal(artifact.targetPricingBoundary.targetQuotedPriceType,
    "NO_TARGET_ESTIMATE");
  assert.equal(artifact.targetPricingBoundary
    .targetQuotedPriceRepresentsNumericZero, false);
  assert.equal(artifact.targetPricingBoundary
    .historicalSourceLossCostIsTargetPrice, false);
  assert.equal(artifact.targetPricingBoundary.pricePermission, false);
  assert.equal(artifact.permissions.pricePermission, false);
  assert.equal(artifact.readiness.readyToPriceTargetDomain, false);
  assert.equal(artifact.readiness.readyToBearResponsibility, false);
  assert.equal(artifact.authority.operationalAuthorityGranted, false);
  assert.equal(artifact.readiness.status,
    "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.equal(artifact.readiness.pinnedReceiptCount, 16);
  assert.equal(artifact.readiness.temporallyOrderedCurrentReceiptCount, 9);
  assert.equal(artifact.readiness.temporalQuarantineReceiptCount, 7);
  assert.equal(artifact.readiness.temporalQuarantineReferenceFactorCount, 40);
  assert.equal(artifact.readiness.temporallyOrderedReceiptReferenceFactorCount, 62);
  assert.equal(artifact.readiness.factorsAdmittedForCurrentCoverage, 0);
  assert.equal(artifact.readiness.factorsAdmittedForCurrentRouting, 0);
  assert.equal(artifact.sourceDomainEvidence.temporalQuarantineReferenceOnly, true);
  assert.equal(artifact.sourceDomainEvidence.currentCoverage, false);
  assert.equal(artifact.sourceDomainEvidence.trainingAdmission, false);
});

test("standalone receipt distinguishes artifact claims from actual verification", () => {
  const checked = verifyStage2RmaShadowPricingStructure(artifact);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "FIXED_FINAL_V4_STRUCTURE_ONLY_NO_SOURCE_AUTHENTICATION");
  assert.equal(checked.artifactClaimsRmaSourceArtifactsReverified, true);
  assert.equal(checked.rmaSourceArtifactsReverified, false);
  assert.equal(checked.currentChainSourcesReplayed, false);
  assert.equal(checked.currentChainCanonicalBytesVerified, false);
  assert.equal(checked.historicalLossCostDerivationVerified, false);
  assert.equal(checked.targetQuotedPrice, null);
  assert.equal(checked.pricePermission, false);
  assert.equal(checked.trainingPermission, false);
  assert.equal(checked.rmaParentReceiptId, "CROSS_STAGE_SIX_LANE_PROGRESS");
  assert.equal(checked.rmaParentTemporalQuarantineReferenceOnly, true);
  assert.equal(checked.rmaParentCurrentCoverage, false);
  assert.equal(checked.temporalQuarantineOperationalAuthority, 0);
});

test("full receipt replays RMA while only authenticating current-chain bytes", {
  timeout: 30_000,
}, () => {
  const checked = verifyStage2RmaShadowPricingAgainstSources(artifact, input);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "FULL_RMA_SOURCE_REPLAYED_HISTORICAL_LOSS_COST_WITH_PINNED_TEMPORAL_QUARANTINE_HOLD_CONTRACT_BYTES");
  assert.equal(checked.rmaSourceArtifactsReverified, true);
  assert.equal(checked.currentChainSourcesReplayed, false);
  assert.equal(checked.currentChainCanonicalBytesVerified, true);
  assert.equal(checked.historicalLossCostDerivationVerified, true);
  assert.equal(checked.targetQuotedPrice, null);
  assert.equal(checked.pricePermission, false);
});

test("caller time injection and a coherently resealed 2035 time fail closed", {
  timeout: 30_000,
}, () => {
  assert.throws(() => buildStage2RmaShadowPricing({
    ...input,
    generatedAt: "2035-01-01T00:00:00.000Z",
  }), /BUILD_INPUT_SCHEMA_INVALID/u);

  const future = structuredClone(artifact);
  future.generatedAt = "2035-01-01T00:00:00.000Z";
  const checked = verifyStage2RmaShadowPricingStructure(reseal(future));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /FIXED_CANONICAL_PROJECTION_OR_HASH_INVALID/u);
  assert.equal(checked.targetQuotedPrice, null);
  assert.equal(checked.pricePermission, false);
});

test("candidate time is validated before source parsing or replay", () => {
  assert.throws(() => buildStage2RmaShadowPricingCandidate({}, {
    generatedAt: "2026-08-28T09:00:00.000Z",
  }), /GENERATED_AT_NOT_AFTER_CURRENT_CHAIN_CONTRACT/u);
  assert.throws(() => buildStage2RmaShadowPricingCandidate({}, {
    generatedAt: "2035-01-01T00:00:00.000Z",
  }), /CANDIDATE_GENERATED_AT_IN_FUTURE/u);
});

test("stale RMA envelopes and unpinned current-chain paths fail closed", {
  timeout: 30_000,
}, () => {
  assert.throws(() => buildStage2RmaShadowPricing({
    ...input,
    rmaArtifactBytes: readFileSync(path.resolve(
      "artifacts/stage234-rma-crop-insurance-2024/experience.json")),
  }), /RMA_CANONICAL_ARTIFACT_EXACT_BYTES_INVALID/u);
  assert.throws(() => buildStage2RmaShadowPricing({
    ...input,
    currentChainContractPath: RMA_ARTIFACT,
  }), /CURRENT_STAGE2_CANONICAL_BOUNDARY_INVALID/u);
});

test("coherent reseals cannot promote loss cost, target price, or authority", () => {
  const attacks = [
    (value) => {
      value.sourceDomainHistoricalLossCost
        .historicalLossCostPer1000LiabilityDollars = "1.00";
    },
    (value) => { value.targetPricingBoundary.targetQuotedPrice = "95.56"; },
    (value) => {
      value.targetPricingBoundary.targetQuotedPriceRepresentsNumericZero = true;
    },
    (value) => { value.targetPricingBoundary.pricePermission = true; },
    (value) => { value.permissions.pricePermission = true; },
    (value) => { value.readiness.readyToPriceTargetDomain = true; },
    (value) => { value.authority.operationalAuthorityGranted = true; },
  ];
  for (const attack of attacks) {
    const forged = structuredClone(artifact);
    attack(forged);
    const checked = verifyStage2RmaShadowPricingStructure(reseal(forged));
    assert.equal(checked.ok, false);
    assert.equal(checked.targetQuotedPrice, null);
    assert.equal(checked.pricePermission, false);
    assert.equal(checked.operationalAuthorityGranted, false);
  }
  const extra = structuredClone(artifact);
  extra.callerClaimsActuarialReview = true;
  assert.equal(verifyStage2RmaShadowPricingStructure(reseal(extra)).ok, false);
});

test("superseded final-v1 remains byte-for-byte preserved", () => {
  const bytes = readFileSync(PRESERVED_V1);
  const prior = JSON.parse(bytes.toString("utf8"));
  assert.equal(bytes.length,
    STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.artifactFileBytes);
  assert.equal(sha256(bytes),
    STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.artifactFileHash);
  assert.equal(prior.artifactHash,
    STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.artifactHash);
});

test("final-v1 has an exact mode-0600 schema-supported supersession marker", () => {
  const checked = verifyStage2RmaShadowPricingSupersessionMarker(
    SUPERSESSION_MARKER,
  );
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.markerSchema, "outsider/artifact-supersession/v1");
  assert.equal(checked.markerExactBytesVerified, true);
  assert.equal(checked.markerMode0600Verified, true);
  assert.equal(checked.supersededArtifactBytesPreserved, true);
  assert.equal(checked.replacementArtifactExactBytesVerified, true);
  assert.equal(checked.sourceArtifactsReverifiedByMarker, false);
  assert.equal(checked.targetQuotedPrice, null);
  assert.equal(checked.pricePermission, false);
});

test("final-v3 bytes are preserved and exact mode-0600 marker routes to final-v4", () => {
  const bytes = readFileSync(PRESERVED_V3);
  assert.equal(bytes.length,
    STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.artifactFileBytes);
  assert.equal(sha256(bytes),
    STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.artifactFileHash);
  const checked = verifyStage2RmaShadowPricingV3SupersessionMarker(
    V3_SUPERSESSION_MARKER,
  );
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.markerExactBytesVerified, true);
  assert.equal(checked.markerMode0600Verified, true);
  assert.equal(checked.supersededArtifactBytesPreserved, true);
  assert.equal(checked.replacementArtifactExactBytesVerified, true);
  assert.equal(checked.trainingPermission, false);
  assert.equal(checked.pricePermission, false);
});

test("canonical index accepts all markers and resolves final-v4", () => {
  const family = "stage2-rma-shadow-pricing-20260822";
  const isolatedRoot = path.join(temporary, "isolated-artifacts");
  mkdirSync(isolatedRoot, { recursive: true });
  cpSync(path.resolve("artifacts", family), path.join(isolatedRoot, family), {
    recursive: true,
    preserveTimestamps: true,
  });
  const declaration = {
    schema: LOCAL_ARTIFACT_DECLARATION_SCHEMA,
    indexedAt: "2026-08-28T10:55:00.000Z",
    entries: [{
      family,
      currentRelease: "final-v4",
      canonicalFile: "historical-loss-cost.json",
      semanticHashField: "artifactHash",
    }],
    crossFamilyLineages: [],
  };
  const index = buildLocalArtifactCanonicalIndex({
    declaration,
    artifactsRoot: isolatedRoot,
    now: new Date("2026-08-28T11:00:00.000Z"),
  });
  assert.equal(index.entries[0].currentRelease, "final-v4");
  assert.equal(index.entries[0].supersessionChainEstablished, true);
  assert.equal(index.entries[0].supersededReleaseHistory[0].markerSchema,
    "outsider/artifact-supersession/v1");
  assert.deepEqual(index.entries[0].supersededReleaseHistory
    .map((release) => release.resolvedTargetRelease),
  ["final-v2", "final-v3", "final-v4"]);
});

test("canonical final-v4 exact bytes and source receipt verify", {
  timeout: 45_000,
}, () => {
  const structural = verifyStage2RmaShadowPricingCanonicalStructure(CANONICAL);
  assert.equal(structural.ok, true, structural.error);
  assert.equal(structural.canonicalGeneratedAtVerified, true);
  assert.equal(structural.canonicalArtifactExactBytesVerified, true);
  assert.equal(structural.canonicalArtifactMode0600Verified, true);
  assert.equal(structural.rmaSourceArtifactsReverified, false);
  assert.equal(structural.currentChainSourcesReplayed, false);
  assert.equal(structural.currentChainCanonicalBytesVerified, false);
  assert.equal(structural.artifactFileHash,
    STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactFileHash);
  assert.equal(structural.artifactFileBytes,
    STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactFileBytes);

  const full = verifyStage2RmaShadowPricingCanonicalAgainstSources(
    CANONICAL, input,
  );
  assert.equal(full.ok, true, full.error);
  assert.equal(full.verificationLevel,
    "FULL_PINNED_FINAL_V4_BYTES_RMA_SOURCE_REPLAYED_WITH_TEMPORAL_QUARANTINE_HOLD_CONTRACT_BYTES");
  assert.equal(full.rmaSourceArtifactsReverified, true);
  assert.equal(full.currentChainSourcesReplayed, false);
  assert.equal(full.currentChainCanonicalBytesVerified, true);
  assert.equal(full.readinessStatus,
    "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.equal(full.rmaParentTemporalQuarantineReferenceOnly, true);
  assert.equal(full.trainingPermission, false);
});

test("CLI writes mode-0600 no-clobber output and rejects generatedAt", {
  timeout: 60_000,
}, () => {
  const output = path.join(temporary, "historical-loss-cost.json");
  const common = [
    "--rma-artifact", RMA_ARTIFACT,
    "--rma-zip", RMA_ZIP,
    "--rma-layout", RMA_LAYOUT,
    "--current-chain-contract", CURRENT_CHAIN,
  ];
  const script = path.resolve("scripts/stage2-rma-shadow-pricing.mjs");
  const built = spawnSync(process.execPath, [
    script, "build", ...common, "--out", output,
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(built.status, 0, built.stderr);
  assert.equal(statSync(output).mode & 0o777, 0o600);
  const summary = JSON.parse(built.stdout);
  assert.equal(summary.publisherRecordedIndemnityDollars, "15163448979");
  assert.equal(summary.historicalLossCostAggregateDollars, "15163448979");
  assert.equal(summary.historicalLossCostPer1000LiabilityDollars, "95.56");
  assert.equal(summary.targetQuotedPrice, null);
  assert.equal(summary.pricePermission, false);
  assert.equal(summary.readinessStatus,
    "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.equal(summary.candidateOnly, false);
  assert.equal(summary.canonicalRoutingEligible, false);

  const noClobber = spawnSync(process.execPath, [
    script, "build", ...common, "--out", output,
  ], { encoding: "utf8", timeout: 30_000 });
  assert.notEqual(noClobber.status, 0);
  assert.match(noClobber.stderr, /EEXIST/u);

  const injectedTime = spawnSync(process.execPath, [
    script, "build", ...common, "--out", path.join(temporary, "future.json"),
    "--generated-at", "2035-01-01T00:00:00.000Z",
  ], { encoding: "utf8", timeout: 30_000 });
  assert.notEqual(injectedTime.status, 0);
  assert.match(injectedTime.stderr, /CLI_ARGUMENT_INVALID:--generated-at/u);

  const verified = spawnSync(process.execPath, [
    script, "verify", ...common, "--artifact", output,
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(verified.status, 0, verified.stderr);
  const check = JSON.parse(verified.stdout);
  assert.equal(check.rmaSourceArtifactsReverified, true);
  assert.equal(check.currentChainSourcesReplayed, false);
  assert.equal(check.currentChainCanonicalBytesVerified, true);
  assert.equal(check.historicalLossCostDerivationVerified, true);

  const candidateOutput = path.join(temporary, "candidate-v4.json");
  const candidate = spawnSync(process.execPath, [
    script, "build-candidate-v4", ...common, "--out", candidateOutput,
  ], { encoding: "utf8", timeout: 30_000 });
  assert.equal(candidate.status, 0, candidate.stderr);
  const candidateSummary = JSON.parse(candidate.stdout);
  assert.equal(candidateSummary.candidateOnly, true);
  assert.equal(candidateSummary.canonicalRoutingEligible, false);
  assert.equal(candidateSummary.readinessStatus,
    "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.ok(Date.parse(candidateSummary.generatedAt)
    <= statSync(candidateOutput).mtimeMs);
});
