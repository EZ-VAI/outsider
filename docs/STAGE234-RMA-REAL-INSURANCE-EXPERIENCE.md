# Stage 2–4 USDA RMA real insurance-experience lane

## Status

This lane adds real insurance experience, not a benchmark reward and not
synthetic “research data.” The source is the USDA Risk Management Agency's
administrative [State/County/Crop/Coverage Summary of Business](https://www.rma.usda.gov/tools-reports/summary-of-business/state-county-crop-summary-business)
for commodity year 2024. The current permitted inference is deliberately
narrower than the reality of the observations: source-domain aggregate
calibration is admitted; Outsider pricing, coverage, reserve, guarantee, and
settlement remain `ABSTAIN`/`false`.

Implementation:

- `src/outsider-rma-crop-insurance-experience.js`
- `scripts/stage234-rma-crop-insurance-experience.mjs`
- `test/outsider-rma-crop-insurance-experience.test.js`

## Exact source and meanings

The source ZIP is the complete published 2024
State/County/Crop/Coverage-level file. Its companion
[record layout](https://pubfs-rma.fpac.usda.gov/pub/Web_Data_Files/Summary_of_Business/state_county_crop/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf)
defines:

- `Policies Earning Premium`: policies for which acreage was reported to RMA;
- `Policies Indemnified`: policies for which losses were reported to RMA;
- `Units Earning Premium` and `Units Indemnified`: the corresponding crop-unit
  counts;
- `Liability`: maximum insurance amount for the crop-unit line item;
- `Total Premium`: premium before subsidy;
- `Indemnity`: total amount of loss;
- `Loss Ratio`: indemnity divided by total premium.

The adapter reopens the exact ZIP and PDF bytes, safely parses the single ZIP
text member, verifies CRC, validates all 28 fields, separately preserves
zero-reported-loss cells with exposure and empty cells without exposure,
quarantines loss counts above their denominators, detects duplicate semantic
cells, and commits every row without
copying raw source rows into the derived JSON.

Source identity is a hard admission gate. A different self-hashed ZIP and a
PDF-shaped file can exercise the parser, but the resulting artifact is marked
`CALLER_ASSERTED_RMA_SHAPED_FIXTURE`, has no publisher or RMA rights claim, and
is always quarantined from source-domain calibration. Only the exact pinned
ZIP, layout PDF, URLs, year, sizes, and hashes receive
`OFFICIAL_USDA_RMA_FROZEN_SOURCE_REPLAY` and source-domain admission.

Standalone verification deliberately returns
`SELF_SEALED_UNTRUSTED_ENVELOPE`: it checks a bounded envelope schema and
self-hash, but it does not certify nested arithmetic, metric derivation,
authority, or source bytes. The source-aware CLI reopens both pinned objects
and is the only path that can return
`FULL_OFFICIAL_USDA_RMA_SOURCE_REPLAYED` and
`sourceArtifactsReverified:true`.

RMA says its most recent five years are refreshed weekly with business accepted
through the preceding week. The frozen object is consequently a complete
published snapshot, not a final/ultimate claim universe. The adapter records
that the two frozen objects were directly downloadable. The separate RMA
web-policy statement about distribution/copying remains only a
`distributionAndCopyingWebPolicyCuratorAssertionNotReplayed`; those policy
bytes are not part of this source replay. No broader legal conclusion about
model training is manufactured.

## What the mathematics may use now

Within the source domain, the following aggregate diagnostics are reproducible
from real financial and exposure records:

\[
q_p = \frac{\text{policies with reported losses}}
            {\text{policies earning premium}},
\qquad
q_u = \frac{\text{units with reported losses}}
            {\text{units earning premium}},
\]

\[
\bar I_p = \frac{\text{aggregate indemnity}}
                 {\text{policies earning premium}},
\qquad
LR = \frac{\text{aggregate indemnity}}{\text{total premium}},
\qquad
IR = \frac{\text{aggregate indemnity}}{\text{liability}}.
\]

All amounts are summed with `BigInt`; ratios are emitted as deterministic
decimal strings. The two `q` values are disclosed diagnostics but are not
frequency-model inputs in the frozen 2024 snapshot: 265 policy cells and 28
unit cells have a reported-loss count above the same cell's earning count.
Those source-internal inconsistencies are preserved and force
`reportedLossFrequencyDescriptiveStatisticEligible:false`.

The remaining values are historical aggregate diagnostics. They are not a
quoted premium, an ultimate-loss estimate, or an individual severity sample.
In particular, `indemnity / policies indemnified` is labelled an aggregate
amount per reported-loss policy cell and cannot enter TVaR as though it were a
claim-level severity distribution.

The unit is also deliberately called a *policy cell*. The public aggregation
is by state, county, crop, plan, coverage category, delivery type, coverage
level, and quantity type; it does not prove unique policyholders across cells.

## Claim and authority separation

The derived artifact keeps each requested concept separate:

| Concept | What this source establishes |
| --- | --- |
| Exposure | Publisher-recorded policies/units earning premium in every published cell, including zero-reported-loss cells |
| Reported loss | Publisher count of policies/units for which losses were reported |
| Indemnity | Publisher-recorded aggregate total amount of loss in dollars |
| Allegation | No individual allegation record or allegation identity |
| Adjudicated claim | Not established |
| Cash paid | Not distinguished from the aggregate indemnity field |
| Case reserve / IBNR | Not present |
| Recovery / salvage / subrogation | Not present |
| Fraud review / appeal | Not present |
| Issuer, capital, custody, coverage authority | Not established |
| Agent/robot transfer | Explicitly false |

This moves Stage 2 from a purely empty external denominator toward an empirical
source-domain calibration lane. It also gives Stage 3 and Stage 4 real
accounting magnitudes and invariant fixtures, but it does **not** close their
reserve, custody, adjudication, or settlement gates.

## Frozen 2024 result

- official ZIP: `3,119,562` bytes;
- ZIP SHA-256:
  `sha256:5731366e8e50abb6af977dc2eeabda2900659e07542ba2a78de9d81c293e3e05`;
- extracted text: `27,991,663` bytes;
- extracted SHA-256:
  `sha256:a644df069daf0a1f4db50bedd65a07de7b715edc83d12a6fb4ed12a9404833da`;
- official layout PDF: `84,719` bytes;
- layout SHA-256:
  `sha256:fd62972c8219e1e6cb90c4b1ae2f7ad3ada3e759c12c007b2b379da55e606307`;
- 152,383 source rows / 152,383 unique semantic cells / zero duplicates;
- adapter specification hash:
  `sha256:cc844fa6abcc52ac79918a092b7f0ffc647f0ce65174e6ee572dc344b06cb63b`;
- 50 states or territories and 32 insurance plans;
- 97,782 cells with policy or unit exposure;
- 41,792 zero-reported-loss cells with exposure preserved;
- 54,421 no-exposure/no-reported-loss cells separately disclosed;
- 1,218,360 earning-policy cells and 535,551 reported-loss policy cells;
- 2,866,899 earning-unit cells and 1,168,394 reported-loss unit cells;
- `$158,673,917,761` publisher-recorded liability;
- `$15,882,764,266` total premium;
- `$15,163,448,979` publisher-recorded indemnity;
- 25 negative-indemnity adjustment cells;
- 265 policy and 28 unit cells with numerator-above-denominator anomalies;
- aggregate indemnity/premium diagnostic: `0.95471095`;
- aggregate indemnity/liability diagnostic: `0.09556359`;
- artifact hash:
  `sha256:5ed89ea0108b403095dd1a8ca609fe6d2fb7c505a0d8865adef73f8de5446dce`;
- file SHA-256:
  `548314566c6b1855adc25a17e2910265b6f1cb26c402dd6412e6b2471decff8a`;
- source-domain decision:
  `ADMIT_AGGREGATE_INDEMNITY_ONLY_FREQUENCY_QUARANTINED`;
- Outsider decision:
  `ABSTAIN_SOURCE_DOMAIN_AGGREGATE_EXPERIENCE_ONLY`.

One published row has missing liability, premium, and loss-ratio fields, but
that row has zero earning policies, zero earning units, and zero indemnity. The
artifact reports the missing fields while confirming zero material monetary
missingness for exposed or indemnified cells.

## Offline build and replay

```sh
node scripts/stage234-rma-crop-insurance-experience.mjs build \
  --zip artifacts/stage234-rma-crop-insurance-2024/source/sobcov_2024.zip \
  --layout artifacts/stage234-rma-crop-insurance-2024/source/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf \
  --out artifacts/stage234-rma-crop-insurance-2024/experience-v2-rights-boundary.json \
  --generated-at 2026-08-21T07:30:00.000Z

node scripts/stage234-rma-crop-insurance-experience.mjs verify \
  --artifact artifacts/stage234-rma-crop-insurance-2024/experience-v2-rights-boundary.json \
  --zip artifacts/stage234-rma-crop-insurance-2024/source/sobcov_2024.zip \
  --layout artifacts/stage234-rma-crop-insurance-2024/source/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf
```

The CLI has no network behavior, writes with `wx`, and refuses a source that
does not match the frozen official hash, size, URL, year, and record-layout
commitment.

### Canonical-artifact disambiguation

`experience-v2-rights-boundary.json` is the only canonical local artifact.
The older `experience.json` bytes are intentionally preserved, but current
source-aware verification rejects that artifact: it labeled an unreplayed RMA
web-policy statement as established permission. The current artifact instead
separates observed public access from a curator assertion about an unfrozen
policy page and sets `webPolicyBytesReplayed:false`. The machine-readable
`artifact-index.json` and adjacent `experience.json.superseded.json` pointer
record both file hashes and both artifact hashes. A supersession pointer is
only local routing metadata; it explicitly sets
`sourceArtifactsReverifiedByThisMarker:false` and cannot replace the full
ZIP/PDF replay.

## Machine-readable next wave

The artifact carries `nextWaveCalibrationSources`; discovery is not left as a
prose TODO:

1. [CAS loss-reserving data from NAIC Schedule P](https://www.casact.org/publications-research/research/research-resources/loss-reserving-data-pulled-naic-schedule-p): six U.S. P&C lines with earned premium, incurred and cumulative paid triangles, bulk/IBNR, posted reserve, and lower-triangle outcomes. This is the next Stage 3 reserve-development and out-of-time-validation lane, locked to the Schedule P domain.
2. [OpenFEMA](https://www.fema.gov/about/openfema) NFIP redacted claims and policies v3: the next paid-loss plus policy-exposure cohort, with source lag and non-official-report caveats preserved.
3. [FEMA Public Assistance Appeals](https://www.fema.gov/assistance/public/appeals): real first/second appeal and final-agency-decision state transitions for a Stage 4 adjudication-lifecycle taxonomy. Public-assistance adjudication is not automatically insurance-claim adjudication.

Every next-wave source remains unable to grant Outsider issuer standing,
capital, custody, coverage, or settlement authority by itself.
