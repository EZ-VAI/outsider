# Stage 2 typed pricing progress

`src/outsider-stage2-progress-projection.js` is the current machine-readable
Stage 2 progress seam. It consumes the exact pinned RMA historical-loss-cost
`final-v4` artifact and keeps source-domain evidence separate from target-domain
pricing and permission:

```text
sourceDomainHistoricalLossCostIndication = NONZERO
targetTechnicalPremium                  = null
targetQuotedPrice                       = null
pricePermission                         = false
trainingPermission                      = false
targetPriceState                        = NULL_NOT_ZERO
```

The source indication contains publisher-recorded USDA RMA indemnity and
matched 2024 exposure arithmetic. It is descriptive historical loss cost, not
cash-paid or independently adjudicated target economic loss, a prospective
forecast, an individual policy price, or an AI-agent/robot quote.

The indication is explicitly a temporal-quarantine reference. The projection
pins RMA `final-v4`, current-chain contract `final-v4`, and temporal-audit
`final-v2`, while reporting that this projection call itself replays neither
the RMA raw source nor the current-chain bytes:

```text
readinessStatus                                   = HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY
pinnedReceiptCount                                = 16
temporallyOrderedCurrentReceiptCount              = 9
temporalQuarantineReceiptCount                    = 7
temporalQuarantineReferenceFactorCount            = 40
factorsAdmittedForCurrentCoverage                 = 0
rmaParentTemporalQuarantineReferenceOnly          = true
rmaParentCurrentCoverage                          = false
currentChainCanonicalBytesVerifiedByThisProjection = false
```

The projection references `src/outsider-real-loss-calibration-shadow.js` and
its CAS Schedule-P diagnostics as method-development and missingness references.
It does not pool RMA and CAS numeric amounts, assert their domains are
comparable, or use either as a target-domain transfer estimate.

This projection is progress reporting only. It is not imported by the Stage 3
quote or authority gates, is not a Stage 4 settlement input, moves no funds,
and grants no pricing, underwriting, capital, guarantee, settlement or
responsibility authority.

Build and verify it against the pinned artifact:

```js
import path from "node:path";
import {
  buildStage2ProgressProjection,
  verifyStage2ProgressProjection,
} from "./src/outsider-stage2-progress-projection.js";
import {
  STAGE2_RMA_SHADOW_PRICING_CANONICAL,
} from "./src/outsider-stage2-rma-shadow-pricing.js";

const rmaShadowPricingArtifactPath = path.resolve(
  STAGE2_RMA_SHADOW_PRICING_CANONICAL.repositoryRelativePath,
);
const projection = buildStage2ProgressProjection({
  rmaShadowPricingArtifactPath,
});
const verification = verifyStage2ProgressProjection(projection, {
  rmaShadowPricingArtifactPath,
});
```

The verifier stable-reads and exact-byte checks the canonical RMA `final-v4`
receipt. It does not replay the raw RMA source or the current Stage2 transitive
source chain, and reports that narrower verification level explicitly.
