# Stage 2–4 CAS/NAIC Schedule P reserve-development calibration

## Status

This lane freezes and replays six real U.S. property/casualty loss triangles
published by the [Casualty Actuarial Society](https://www.casact.org/publications-research/research/research-resources/loss-reserving-data-pulled-naic-schedule-p).
CAS says S&P Global Market Intelligence compiled the files for CAS from NAIC
Schedule P. The page invites reserving research and asks researchers to
acknowledge CAS and S&P in resulting publications.

This is real historical insurance experience, not a benchmark reward or
synthetic research fixture. The admitted inference is nevertheless narrow:
historical Schedule P reserve-development arithmetic and an out-of-time
lower-triangle backtest. It is not an AI/robot loss prior, a production reserve,
a price, an insurance contract, issuer standing, capital, custody, or settlement
authority.

Implementation:

- `src/outsider-cas-schedule-p-reserve-calibration.js`
- `scripts/stage234-cas-schedule-p-reserve-calibration.mjs`
- `test/outsider-cas-schedule-p-reserve-calibration.test.js`
- local replay artifact:
  `artifacts/stage234-cas-schedule-p-2025/reserve-calibration.json`

The raw CAS files and derived artifact stay under the gitignored `artifacts/`
directory. Public direct download and the page's research-use invitation are
recorded; the adapter does not conclude raw redistribution or commercial-use
rights.

## Frozen sources

| Line | Local file | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Private passenger auto liability/medical (`B`) | `ppauto.csv` | 1,026,762 | `6e838f1e44c67218133ef1c8e28ca2b34b9f21ba4ee94de408c412638f798d96` |
| Workers compensation (`D`) | `wkcomp.csv` | 907,835 | `8d0b02bed0939e932f9078f65266e9a398f580f90e5227cde053dd5b520affef` |
| Commercial auto/truck liability/medical (`C`) | `comauto.csv` | 1,097,152 | `5012bd4c9048e300669e2f4fc915850449099e159481b4c3349b574f6f00afe1` |
| Medical malpractice, claims-made (`F2`) | `medmal.csv` | 246,302 | `50ea237914797562661b82996765e40b1fd09784a63130463bbd4972f74dbba3` |
| Product liability, occurrence (`R1`) | `prodliab.csv` | 430,765 | `f1070b5a95658bfeb6719fdf4ffdabc8b7e3f97771cdb4b3f503eb7d6e486f01` |
| Other liability, occurrence (`H1`) | `othliab.csv` | 1,609,342 | `f514136de4be7b5ac114346709c309cd2464861e9fbb683051849f9fa6eadc50` |

The frozen CAS explanation page is 153,047 bytes with SHA-256
`dbf2c60c79b9422f814b4a049ed9b427c64562b41e2bff6310a618ae9ab64e72`.

The six CSVs contain 71,650 rows and 71,650 unique
`line × entity × accident-year × development-lag` cells. There are 40,445
upper-triangle cells and 31,205 lower-triangle cells. Every observed
entity/accident-year cohort has all ten development lags, but only 665 entity
triangles contain all ten accident years; 107 entities omit one or more
accident years. The adapter preserves this sampling fact instead of calling
every entity a complete 10×10 panel.

## Three axes and temporal holdout

The axes are bound by

\[
\text{calendar year}
=\text{accident year}+\text{development lag}-1.
\]

- accident years: 1998–2007;
- development lags: 1–10;
- training information set: calendar year at or before 2007;
- holdout outcome: calendar year after 2007;
- target: observed cumulative paid or incurred amount at lag 10.

For every line and adjacent development lag, the adapter forms a matched,
volume-weighted factor from upper-triangle cells only:

\[
f_k=\frac{\sum C_{a,k+1}}{\sum C_{a,k}}.
\]

For each accident year after 1998, the latest amount visible at year-end 2007
is developed to lag 10 with the line-specific factor product. The lower
triangle is never used to fit a factor. Predictions are rounded half-up once
per entity/accident-year cohort to a whole source amount unit and compared
with the later recorded lag-10 value.

CAS's page does not declare the numeric scale of the amount columns, so the
artifact uses `SOURCE_AMOUNT_UNIT`; it does not silently label the values as
dollars or thousands of dollars.

## Frozen empirical backtest

| Target | Candidate cohorts | Evaluated | Negative endpoints quarantined | Lag-10 aggregate bias | Lag-10 weighted absolute error | Future-development aggregate bias | Future-development weighted absolute error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Cumulative paid | 6,393 | 6,304 | 89 | -0.752258% | 4.003796% | -4.554156% | 24.174083% |
| Incurred | 6,393 | 6,321 | 72 | +1.319465% | 3.183432% | -83.157659% | 103.523077% |

The apparently small aggregate lag-10 errors do not establish a production
reserve model. Real adjustment behavior is material:

- 2,127 cells decrease cumulative paid from the preceding lag;
- 23,874 cells decrease incurred from the preceding lag;
- 233 evaluated paid cohorts have negative post-2007 development;
- 2,665 evaluated incurred cohorts have negative post-2007 development;
- medical-malpractice paid lag-10 bias is -30.793182%, much worse than the
  all-line aggregate;
- 193 entity codes occur in more than one line of business.

Those facts make a pooled-IID or independence assumption unsafe. The artifact
retains calendar-year diagonals and cross-line entity overlap, but has no
catastrophe/common-shock identifiers and therefore does not claim a validated
correlation model.

## Accounting and claim-language boundary

| Field or concept | Permitted meaning |
| --- | --- |
| `IncurredLosses` | Net incurred losses and allocated expenses reported at year end; not cash paid |
| `CumPaidLoss` | Net cumulative paid losses and allocated expenses reported at year end |
| `BulkLoss` | Bulk and IBNR on net losses and defense/cost-containment expense; not an individual case reserve |
| `PostedReserves2007` | UIE Part 2A year-end 2007 unpaid loss and loss-adjustment-expense field |
| Lower-triangle value | A later reported Schedule P outcome; not an independently adjudicated claim |
| Recovery/salvage/subrogation | Not separately observed |
| Claim identity, coverage disposition, fraud, appeal | Not observed |

`PostedReserves2007` is not reconciled to the 1998–2007 cohort: the public
description does not establish that its scope contains only those accident
years. Lag 10 is also not declared ultimate, and no development beyond lag 10
is present. Posted-reserve reconciliation, tail factors, TVaR, individual
severity, and production-reserve eligibility therefore remain false.

## Source substitution and replay boundary

A caller can provide six CSV-shaped fixtures to test parsing and arithmetic,
but the result is always
`CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE`. It has no CAS publisher, S&P
compiler, NAIC source-chain, public-access, research-use, or empirical-backtest
claim and receives
`QUARANTINE_CALLER_ASSERTED_SCHEDULE_P_SHAPED_FIXTURE`.

Only the exact six pinned CSVs plus the exact frozen CAS page can receive:

- `OFFICIAL_CAS_HOSTED_SP_COMPILED_NAIC_SCHEDULE_P_REPLAY`;
- `FULL_OFFICIAL_CAS_SCHEDULE_P_SOURCE_REPLAYED`;
- `sourceArtifactsReverified:true`;
- `ADMIT_SCHEDULE_P_HISTORICAL_RESERVE_BACKTEST_ONLY`.

`verifyCasSchedulePReserveCalibration(artifact)` is standalone and deliberately
returns `SELF_SEALED_UNTRUSTED_ENVELOPE`: it checks a bounded envelope schema
and self-hash, but it does not certify nested triangle arithmetic, backtest
metrics, authority, or source bytes. It always returns
`sourceArtifactsReverified:false` and no verified calibration decision.
`verifyCasSchedulePReserveCalibrationWithSource(artifact, files, page)` reopens
the supplied bytes and is the stable source-aware replay API.

## Artifact identity and replay

- artifact hash:
  `sha256:649653b6b901ed29247d99194b1efcfd141f144adf462574ababd56c71023a38`;
- artifact file SHA-256:
  `78558130d7eb8927b913ad0f54358d02136cff6475d19321892be9ba3c4b52d1`;
- source-domain decision:
  `ADMIT_SCHEDULE_P_HISTORICAL_RESERVE_BACKTEST_ONLY`;
- Outsider decision:
  `ABSTAIN_SCHEDULE_P_DOMAIN_CALIBRATION_ONLY`.

```sh
npm run stage234:cas-reserve -- build \
  --source-dir artifacts/stage234-cas-schedule-p-2025/source \
  --page artifacts/stage234-cas-schedule-p-2025/source/source-page.html \
  --out artifacts/stage234-cas-schedule-p-2025/reserve-calibration.json \
  --generated-at 2026-08-21T07:54:00.000Z

npm run stage234:cas-reserve -- verify \
  --artifact artifacts/stage234-cas-schedule-p-2025/reserve-calibration.json \
  --source-dir artifacts/stage234-cas-schedule-p-2025/source \
  --page artifacts/stage234-cas-schedule-p-2025/source/source-page.html
```

The admitted gate is a real historical reserve-development backtest. The
remaining external gates are AI/robot-domain exposure-to-claim linkage,
claim-level paid/case-reserve/recovery and coverage states, a validated tail,
calendar/common-shock correlation, prospective validation, independent
actuarial and legal review, and licensed issuer/capital/custody/settlement.
