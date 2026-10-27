# USDA RMA 2010–2020 source-domain historical loss-cost benchmark

## Outcome

This lane closes one specific Stage 2 research gap: the earlier RMA lane had one
mutable 2024 cross-section, so it could calculate real aggregate loss cost but
could not test a method out of time. The new lane freezes and replays every
published State/County/Crop/Coverage row for commodity years 2010–2020, fits one
auditable source-domain rolling benchmark, and evaluates later years strictly
from earlier years.

It does **not** train a target-domain Outsider model and does not quote a price.
The `final-v2` canonical fields are intentionally simultaneous:

- `sourceDomainBenchmarkFitted: true`;
- `targetDomainModelTrained: false`;
- `automaticTraining: false` (boolean);
- `trainingPermission: false` and `pricePermission: false` (booleans);
- `targetQuotedPrice: null` with `targetPriceState: NULL_NOT_ZERO`.

## Official sources and rights

- USDA RMA publishes the
  [State/County/Crop/Coverage files](https://www.rma.usda.gov/tools-reports/summary-of-business/state-county-crop-summary-business)
  as downloadable pipe-delimited ZIP files under one 1989-forward record layout.
- The official
  [record layout](https://pubfs-rma.fpac.usda.gov/pub/Web_Data_Files/Summary_of_Business/state_county_crop/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf)
  defines the exact exposure and monetary meanings.
- RMA's [historical page](https://legacy.rma.usda.gov/data/sob.html) says the most
  recent five years are refreshed weekly and older years are no longer updated.
- The federal [Data.gov catalog record](https://catalog.data.gov/dataset/summary-of-business)
  identifies the dataset as `USDA-RMA-0004`, access level `public`, with
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) as the published
  license. The lane freezes and replays the raw catalog metadata bytes rather
  than inferring rights from download availability.

The exact source population is all 11 published files from 2010 through 2020.
It is not a sample and has no random row split. Every ZIP, the common layout PDF,
and the Data.gov raw metadata object has an exact byte count and SHA-256 pin in
`src/outsider-rma-temporal-loss-pricing-benchmark.js`.

The `final-v2` identity timestamp is frozen at `2026-08-22T09:26:00.000Z`,
after this bounded acquisition and the v1 red-team review, and before the v2
canonical build and source replay. It cannot be supplied or changed by a caller;
alternate and future timestamps fail verification even if the envelope is
rehashed. The retained final-v1 bytes are not rewritten.

All loss-cost amount fields say `PerEarningPolicyCellDollars`; no field implies
that an aggregate source cell is a unique policyholder. Standalone self-hash
inspection always returns `ok:false` and `SOURCE_REPLAY_REQUIRED`. Only an exact
canonical path/byte pin plus full reconstruction from the frozen official source
objects can return `ok:true`.

## Exact pricing-relevant fields

At the source cell grain—commodity year, state, county, crop, insurance plan,
coverage category, delivery type, coverage level, and quantity type—the files
contain:

- policies and units earning premium (exposure);
- policies and units indemnified (reported-loss counts);
- liability (maximum dollar insurance for the crop-unit line item);
- total premium before subsidy;
- indemnity (publisher-defined total amount of loss);
- coverage level and its plan-dependent deductible complement;
- subsidy and discount fields, preserved but not used as loss or exposure.

The full frozen series contains 1,468,223 aggregate rows, 12,714,852 earning-policy
cells, 27,227,916 earning-unit cells, $1,186,414,993,675 liability,
$111,824,412,025 total premium, and $96,101,509,280 indemnity. It preserves
500,734 exposure cells with zero reported loss. Every year has zero duplicate
semantic cells and complete material monetary aggregates.

The audit found and fixed one real parser defect: a handful of no-exposure rows
in 2011–2018 leave optional subsidy/discount cells blank. They are now preserved
as `null`; policy, premium, liability, and indemnity constraints were not relaxed.

## Frozen temporal method and result

The split is by commodity year, never by random row:

- fit/development: 2010–2017 (8 years);
- calibration: 2018–2019 (2 years);
- one-time retrospective test: 2020 (1 year).

The sole method is a trailing-three-year, exposure-weighted aggregate loss cost:

\[
\widehat{LC}_{t}
= \frac{\sum_{y=t-3}^{t-1} \text{indemnity}_y}
        {\sum_{y=t-3}^{t-1} \text{policies earning premium}_y}.
\]

It is deterministically refit using only years before each target year. No model
family was selected using the 2020 test. The method, fit/calibration/test lists,
and split policy each have separate hashes in the canonical artifact.

Results:

| Evaluation | Indication | Actual | Error / calibration |
| --- | ---: | ---: | ---: |
| 2018–2019 calibration mean | — | — | MAPE 40.433123%; mean indication/actual 0.59566878 |
| 2020 one-time retrospective test | $6,996.62 | $7,829.81 | APE 10.641259%; indication/actual 0.89358741 |
| 2021 source-domain shadow | $8,007.93 | not evaluated in this frozen lane | nonzero indication; `quote:null` |

The weak 2018–2019 calibration is not hidden. It shows the simple rolling
aggregate is materially under-responsive to changing crop-loss experience.
The 2020 result is useful evidence about this exact baseline, not proof that it
will remain calibrated and not permission to price a different domain.

## Quality and transfer limits

- Indemnity is an aggregate “total amount of loss”; it is not established here
  as cash paid, case reserve, or ultimate loss.
- These are aggregate policy cells, not individual claim severities or proven
  unique policyholders across cells.
- 2018–2020 have publisher count anomalies where reported-loss counts exceed
  the matching earning count in some cells. Those years remain valid for
  aggregate indemnity/premium/liability diagnostics, but frequency fitting is
  quarantined.
- Dollars are nominal. Inflation, crop/plan/coverage/geography mix shifts,
  dependence, catastrophe regime, and development-to-ultimate are not adjusted.
- The test is historical and one-time, not a prospective target-domain holdout.
- CC0 supports source-domain analytical reuse; it does not create insurer
  standing, capital, custody, coverage, settlement, or Outsider pricing authority.

This improves Stage 2 by providing real, reproducible loss/exposure/premium data,
an auditable nonzero source-domain indication, and visible out-of-time error. A
real Outsider price still requires matched prospective target exposure and loss,
coverage/limit/deductible/expense definitions, target calibration, dependence and
capital/risk-margin work, and an authorized issuer.

## Reproduction

Acquire a fresh copy of the frozen objects (the command fails if any current
publisher byte differs from the pins):

```sh
node scripts/acquire-rma-temporal-loss-pricing.mjs \
  --out-dir artifacts/rma-temporal-loss-pricing-2010-2020/source-new
```

Build and verify offline:

```sh
node scripts/rma-temporal-loss-pricing-benchmark.mjs build \
  --source-dir artifacts/rma-temporal-loss-pricing-2010-2020/source \
  --out artifacts/rma-temporal-loss-pricing-2010-2020/final-v2/artifact.json

node scripts/rma-temporal-loss-pricing-benchmark.mjs verify \
  --source-dir artifacts/rma-temporal-loss-pricing-2010-2020/source \
  --artifact artifacts/rma-temporal-loss-pricing-2010-2020/final-v2/artifact.json
```

The artifact root and subdirectories are mode `0700`; source and canonical files
are `0600`. Acquisition and build use no-clobber writes, and replay rejects
symlinked/permissive source roots or files.

## Next official candidate

The next non-duplicative pricing lane should be the CMS 2024 Medical Loss Ratio
Public Use File. Its official ZIP contains matched premium/claims, MLR/rebate,
header/exposure, and data-dictionary objects. It is stronger for market/issuer
segmentation, but one 2024 file alone does not improve temporal validation as
directly as this 11-year RMA series; it should be acquired as a separate
multi-year lane rather than pooled with crop insurance.
