# Stage 2 RMA historical loss-cost receipt

Status: a non-zero, source-domain historical loss-cost reference is frozen as
`final-v4`. It is held behind the Stage 0 temporal-authenticity quarantine. It
is not a prospective premium, target-domain quote, actuarial opinion,
insurance offer, training admission, or responsibility commitment.

## Why final-v4 exists

`final-v1` accepted a caller-selected `generatedAt`, so arbitrary or future
times could verify while resembling a canonical release. It also used pricing
terminology that could be mistaken for a prospective quote. The original file
is preserved byte-for-byte for auditability; `final-v2` supersedes it without
clobbering it.

The old release directory contains the schema-supported marker
`final-v1/superseded-by.json`. Its exact 999 bytes and mode 0600 are pinned; it
binds the preserved v1 artifact identity to the exact v2 artifact and file
hashes. The marker itself does not replay RMA sources or rights terms.

`final-v2` fixed the caller-controlled time and terminology. `final-v3`
rebound the then-current Stage 2 contract. `final-v4` is the no-clobber
successor that binds current-chain `final-v4`, temporal-audit `final-v2`, and
the exact 16-receipt split: nine temporally ordered references and seven
temporal quarantines. All older artifact bytes remain preserved and exact
machine-readable markers route v1→v2→v3→v4.

`final-v4` keeps the target result typed as:

```text
targetQuotedPrice = null
targetQuotedPriceType = NO_TARGET_ESTIMATE
targetQuotedPriceRepresentsNumericZero = false
pricePermission = false
trainingPermission = false
```

There is no mixed numeric/permission `PRICE` field in the v4 artifact or its
v4 verification receipts.

## Evidence and calculation

The build replays the pinned USDA Risk Management Agency 2024
State/County/Crop/Coverage Summary of Business ZIP and official record layout.
It also stable-reads the exact canonical Stage 2 current-chain contract. The
RMA source bytes are replayed; the current chain's transitive sources are not
replayed by this RMA call.

The RMA lane belongs to the `CROSS_STAGE_SIX_LANE_PROGRESS` receipt. The exact
parent bytes are source-replayed but their local timestamp authenticity is not
established. Consequently this artifact records:

```text
readiness.status                         = HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY
rmaParentTemporalQuarantineReferenceOnly = true
rmaParentCurrentCoverage                  = false
factorsAdmittedForCurrentCoverage         = 0
factorsAdmittedForCurrentRouting          = 0
trainingPermission                        = false
pricePermission                           = false
operationalAuthorityGranted               = false
```

The frozen national source portfolio mix contains:

| Measure | Value |
| --- | ---: |
| Published rows | 152,383 |
| Exposure cells | 97,782 |
| Zero-reported-loss exposure cells | 41,792 |
| Policies-earning-premium cell count | 1,218,360 |
| Liability | $158,673,917,761 |
| Observed program premium | $15,882,764,266 |
| Publisher-recorded indemnity | $15,163,448,979 |

The normalized descriptive results are:

| Historical source-domain measure | Value |
| --- | ---: |
| Indemnity / liability | 0.09556359 |
| Loss cost per $1,000 liability | $95.56 |
| Indemnity / observed premium | 0.95471095 |
| Loss cost per earning-policy cell | $12,445.79 |

The last number is divided by a count summed across published cells. It is not
a unique contract, policy, or policyholder quote. `indemnity` is the
publisher-recorded total amount of loss; this lane does not upgrade it to
confirmed cash paid, ultimate loss, case reserve, recovery, or independently
adjudicated claim value.

The measures describe only the heterogeneous frozen 2024 RMA portfolio mix.
They do not establish transfer to AI-agent/robot risk or to an individual RMA
cell. Trend, credibility, expenses, risk margin, catastrophe, capital, and
target loss-ratio selections remain `null`.

## Verification semantics

The source-aware v4 receipt reports these facts separately:

```text
rmaSourceArtifactsReverified = true
currentChainSourcesReplayed = false
currentChainCanonicalBytesVerified = true
historicalLossCostDerivationVerified = true
```

The standalone structure verifier truthfully reports the actual verification
performed by that call:

```text
artifactClaimsRmaSourceArtifactsReverified = true
rmaSourceArtifactsReverified = false
currentChainSourcesReplayed = false
currentChainCanonicalBytesVerified = false
historicalLossCostDerivationVerified = false
```

The canonical verifier additionally requires the exact repository path,
stable-read file identity, fixed projection, and all of these pins:

```text
generatedAt = 2026-08-28T10:49:33.521Z
artifactHash = sha256:d51252880264d2ba8dc546d715876f864f85da00b29b709c2b154d0f42807f1c
fileSha256 = sha256:e812c35df7fc55c2ff6dc8bf7e0f4ecd43d46fe6270b5140842d8ea3b118a31f
fileBytes = 10208
```

## Reproduce and verify

Rebuild a non-canonical candidate at a fresh exclusive-create, mode-0600 path.
The command samples build start before reading sources and reports
`canonicalRoutingEligible=false`:

```sh
node scripts/stage2-rma-shadow-pricing.mjs build-candidate-v4 \
  --rma-artifact artifacts/stage234-rma-crop-insurance-2024/experience-v2-rights-boundary.json \
  --rma-zip artifacts/stage234-rma-crop-insurance-2024/source/sobcov_2024.zip \
  --rma-layout artifacts/stage234-rma-crop-insurance-2024/source/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf \
  --current-chain-contract artifacts/stage2-current-chain-admission-20260828/final-v4/contract.json \
  --out scratch/rma-shadow-candidate-v4.json
```

Verify the frozen canonical bytes and replay the RMA source:

```sh
node scripts/stage2-rma-shadow-pricing.mjs verify-canonical \
  --artifact artifacts/stage2-rma-shadow-pricing-20260822/final-v4/historical-loss-cost.json \
  --rma-artifact artifacts/stage234-rma-crop-insurance-2024/experience-v2-rights-boundary.json \
  --rma-zip artifacts/stage234-rma-crop-insurance-2024/source/sobcov_2024.zip \
  --rma-layout artifacts/stage234-rma-crop-insurance-2024/source/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf \
  --current-chain-contract artifacts/stage2-current-chain-admission-20260828/final-v4/contract.json
```

Focused tests:

```sh
node --test test/outsider-stage2-rma-shadow-pricing.test.js
```

The tests include direct and coherently resealed 2035 timestamp attacks,
semantic/authority promotion attacks, exact final-v1 preservation, exact
final-v4 identity, v3 byte preservation and marker routing, source replay,
mode-0600 output, build-start time ordering, and no-clobber behavior.

Public access to the RMA download was observed. The RMA web-policy bytes were
not replayed and model-training rights were not legally concluded. This lane
trains no model and grants no rights or operational authority.
