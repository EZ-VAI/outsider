import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildStage2ProgressProjection,
  describeStage2ProgressProjectionBoundary,
  STAGE2_PROGRESS_PROJECTION_SCHEMA,
  STAGE2_TARGET_PRICE_STATE,
  verifyStage2ProgressProjection,
} from "../src/outsider-stage2-progress-projection.js";
import {
  STAGE2_RMA_SHADOW_PRICING_CANONICAL,
  STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1,
} from "../src/outsider-stage2-rma-shadow-pricing.js";
import * as cycleFreeProgressBoundary from
  "../src/outsider-stage2-progress-boundary.js";

const RMA_CANONICAL = path.resolve(
  STAGE2_RMA_SHADOW_PRICING_CANONICAL.repositoryRelativePath,
);

function reseal(value) {
  const body = structuredClone(value);
  delete body.projectionHash;
  return { ...body, projectionHash: `sha256:${createHash("sha256")
    .update(`${STAGE2_PROGRESS_PROJECTION_SCHEMA}\0${canonicalizeStrict(body)}`,
      "utf8").digest("hex")}` };
}

test("typed progress separates nonzero source loss cost from a null target price", () => {
  const projection = buildStage2ProgressProjection({
    rmaShadowPricingArtifactPath: RMA_CANONICAL,
  });
  assert.equal(projection.sourceDomainHistoricalLossCostIndication.status,
    "NONZERO");
  assert.equal(projection.sourceDomainHistoricalLossCostIndication
    .publisherRecordedIndemnityDollars, "15163448979");
  assert.equal(projection.sourceDomainHistoricalLossCostIndication
    .historicalLossCostPerEarningPolicyCellDollars, "12445.79");
  assert.equal(projection.targetTechnicalPremium, null);
  assert.equal(projection.targetQuotedPrice, null);
  assert.equal(projection.pricePermission, false);
  assert.equal(projection.trainingPermission, false);
  assert.equal(projection.targetPriceState, STAGE2_TARGET_PRICE_STATE);
  assert.equal(projection.targetPriceState, "NULL_NOT_ZERO");
  assert.equal(projection.readyToPriceTargetDomain, false);
  assert.equal(projection.readyToBearResponsibility, false);
  assert.equal(projection.sourceReceipt.readinessStatus,
    "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.equal(projection.sourceReceipt.pinnedReceiptCount, 16);
  assert.equal(projection.sourceReceipt.temporallyOrderedCurrentReceiptCount, 9);
  assert.equal(projection.sourceReceipt.temporalQuarantineReceiptCount, 7);
  assert.equal(projection.sourceReceipt.temporalQuarantineReferenceFactorCount, 40);
  assert.equal(projection.sourceReceipt.factorsAdmittedForCurrentCoverage, 0);
  assert.equal(projection.sourceReceipt.rmaParentReceiptId,
    "CROSS_STAGE_SIX_LANE_PROGRESS");
  assert.equal(projection.sourceReceipt.rmaParentTemporalQuarantineReferenceOnly,
    true);
  assert.equal(projection.sourceReceipt.rmaParentCurrentCoverage, false);
  assert.equal(projection.sourceReceipt.rmaParentTrainingAdmission, false);
  assert.equal(projection.sourceReceipt.temporalQuarantineClosureCredit, 0);
  assert.equal(projection.sourceReceipt.currentChainContractHash,
    "sha256:f132e191a2e53b87f677983b85dadb25c3f9c4693254e4e8e4c24856caeb0a33");
  assert.equal(projection.sourceReceipt.currentChainArtifactFileHash,
    "sha256:17b2ff445dd7042f59700a599a4b8a368c53a1bb6e9213ac55135278b68c093a");
  assert.equal(projection.sourceReceipt.currentChainArtifactFileBytes, 19_833);
  assert.equal(projection.sourceReceipt
    .currentChainCanonicalBytesVerifiedByThisProjection, false);
  assert.equal(projection.sourceDomainHistoricalLossCostIndication
    .temporalQuarantineReferenceOnly, true);
  assert.equal(projection.sourceDomainHistoricalLossCostIndication
    .currentCoverageAdmitted, false);
});

test("cycle-free readiness description is explicitly non-evidentiary", () => {
  const boundary = describeStage2ProgressProjectionBoundary();
  assert.equal(boundary.referenceSemantics, "NON_EVIDENTIARY_CODE_REFERENCE_ONLY");
  assert.equal(boundary.rmaReceiptHashDisclosedHere, false);
  assert.equal(Object.hasOwn(boundary, "canonicalRmaShadowPricingArtifactHash"), false);
  assert.equal(Object.hasOwn(cycleFreeProgressBoundary,
    "STAGE2_PROGRESS_CANONICAL_RMA_SHADOW_PRICING_ARTIFACT_HASH"), false);
  assert.equal(boundary.sourceArtifactsReverified, false);
  assert.equal(boundary.currentChainEstablished, false);
  assert.equal(boundary.temporalAuthenticityEstablished, false);
  assert.equal(boundary.temporalQuarantineReferenceOnly, true);
  assert.equal(boundary.closureCredit, false);
  assert.equal(boundary.pricePermission, false);
  assert.equal(boundary.trainingPermission, false);
  assert.equal(boundary.operationalAuthorityGranted, false);
});

test("post-import Object intrinsic poisoning cannot change the frozen readiness boundary", () => {
  const moduleUrl = new URL("../src/outsider-stage2-progress-boundary.js", import.meta.url).href;
  const script = `
    import { describeStage2ProgressProjectionBoundary } from ${JSON.stringify(moduleUrl)};
    const before = JSON.stringify(describeStage2ProgressProjectionBoundary());
    Object.freeze = () => { throw new Error("POISON_FREEZE"); };
    Object.isFrozen = () => false;
    Object.values = () => { throw new Error("POISON_VALUES"); };
    const after = JSON.stringify(describeStage2ProgressProjectionBoundary());
    process.stdout.write(String(before === after));
  `;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "true");
});

test("the projection references CAS diagnostics without numeric pooling", () => {
  const projection = buildStage2ProgressProjection({
    rmaShadowPricingArtifactPath: RMA_CANONICAL,
  });
  const reference = projection.supportingDiagnosticReferences
    .realLossAndCasCalibrationShadow;
  assert.equal(reference.rmaAndCasNumericAmountsPooled, false);
  assert.equal(reference.casLineAmountsPooled, false);
  assert.equal(reference.sourceAmountsComparableAcrossDomainsEstablished, false);
  assert.equal(reference.targetDomainTransferEstimated, false);
  assert.equal(reference.selectedAsTargetPricingInput, false);
  assert.equal(projection.stage34Boundary.stage3QuoteInput, false);
  assert.equal(projection.stage34Boundary.stage3AuthorityInput, false);
  assert.equal(projection.stage34Boundary.stage4SettlementInput, false);
});

test("verification re-reads the pinned final-v4 receipt and rejects coherent promotion", () => {
  const projection = buildStage2ProgressProjection({
    rmaShadowPricingArtifactPath: RMA_CANONICAL,
  });
  const checked = verifyStage2ProgressProjection(projection, {
    rmaShadowPricingArtifactPath: RMA_CANONICAL,
  });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.targetQuotedPrice, null);
  assert.equal(checked.pricePermission, false);
  assert.equal(checked.trainingPermission, false);
  assert.equal(checked.readinessStatus,
    "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.equal(checked.temporalQuarantineReceiptCount, 7);
  assert.equal(checked.temporalQuarantineReferenceFactorCount, 40);
  assert.equal(checked.factorsAdmittedForCurrentCoverage, 0);
  assert.equal(checked.rmaParentTemporalQuarantineReferenceOnly, true);
  assert.equal(checked.currentChainContractHash,
    "sha256:f132e191a2e53b87f677983b85dadb25c3f9c4693254e4e8e4c24856caeb0a33");
  assert.equal(checked.currentChainCanonicalBytesVerifiedByThisProjection, false);
  assert.equal(checked.stage3QuoteInput, false);

  const forged = structuredClone(projection);
  forged.targetQuotedPrice = "95.56";
  forged.pricePermission = true;
  forged.stage34Boundary.stage3QuoteInput = true;
  const rejected = verifyStage2ProgressProjection(reseal(forged), {
    rmaShadowPricingArtifactPath: RMA_CANONICAL,
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.targetQuotedPrice, null);
  assert.equal(rejected.pricePermission, false);
  assert.equal(rejected.stage3QuoteInput, false);
});

test("the preserved final-v1 path cannot stand in for canonical final-v4", () => {
  assert.throws(() => buildStage2ProgressProjection({
    rmaShadowPricingArtifactPath: path.resolve(
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.repositoryRelativePath,
    ),
  }), /CANONICAL_RMA_RECEIPT_INVALID/u);
});
