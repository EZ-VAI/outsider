# Real-loss calibration shadow

Status: **real source-domain calibration diagnostics; not production pricing or responsibility authority**.

This lane joins two frozen insurance evidence adapters at the verification layer:

- the 2024 [USDA RMA State/County/Crop/Coverage Summary of Business](https://www.rma.usda.gov/tools-reports/summary-of-business/state-county-crop-summary-business); and
- the [CAS-hosted, S&P-compiled NAIC Schedule P loss-reserving files](https://www.casact.org/publications-research/research/research-resources/loss-reserving-data-pulled-naic-schedule-p).

The word “shadow” describes the permitted use of the output. It does **not**
mean the inputs are synthetic or merely laboratory data. Both inputs record
real administrative or regulated insurance experience. The current limit is
that neither source establishes transfer to AI-agent or robot risk, nor gives
Outsider legal, actuarial, issuer, capital, custody, pricing, guarantee, or
settlement authority.

## Trust path

`buildRealLossCalibrationShadow` accepts exactly four raw-source inputs:

1. the frozen RMA ZIP;
2. the frozen RMA record-layout PDF;
3. the exact six frozen CAS CSVs; and
4. the frozen CAS source page.

It does not accept caller-created upstream artifacts, verifier results,
callbacks, or admission decisions. Construction performs these steps inside
the module:

1. copy the caller's byte views into local byte snapshots;
2. rebuild the RMA artifact using the exact official object, layout, URL,
   byte-count, and SHA-256 pins;
3. invoke `verifyRmaCropInsuranceExperienceWithSource` and require
   `FULL_OFFICIAL_USDA_RMA_SOURCE_REPLAYED`;
4. require canonical RMA artifact hash
   `sha256:5ed89ea0108b403095dd1a8ca609fe6d2fb7c505a0d8865adef73f8de5446dce`;
5. rebuild the CAS artifact from the exact page and six file pins;
6. invoke `verifyCasSchedulePReserveCalibrationWithSource` and require
   `FULL_OFFICIAL_CAS_SCHEDULE_P_SOURCE_REPLAYED`;
7. require canonical CAS artifact hash
   `sha256:649653b6b901ed29247d99194b1efcfd141f144adf462574ababd56c71023a38`;
8. reproduce the shadow diagnostics and seal them.

The standalone verifier deliberately returns
`SELF_SEALED_UNTRUSTED_ENVELOPE`, with `sourceArtifactsReverified=false` and
`diagnosticDerivationVerified=false`. Recomputing an artifact hash cannot
create source trust. Only the full verifier rereads the raw sources, executes
the entire construction path, and exact-compares the expected artifact.

## Measurement dictionary v1.0.0

Every output is bound to a versioned dictionary. Its measurements are:

| Family | Measurement | Definition and boundary |
| --- | --- | --- |
| RMA | Published-snapshot cell completeness | `semantic cells = source rows` and zero duplicate semantic cells; this is file accounting, not proof of a complete claim universe. |
| RMA | Exposure-cell share | Exposure-bearing cells divided by source rows; not a unique-policyholder frequency denominator. |
| RMA | Zero-reported-loss exposure window | Exposure exists while policies indemnified, units indemnified, and indemnity are all zero in the frozen mutable snapshot; not zero ultimate loss. |
| RMA | Count-anomaly quarantine | Policy and unit numerator-over-denominator anomalies remain separate; any observed anomaly blocks reported-loss frequency calibration. |
| RMA | Indemnity/premium | Publisher-recorded indemnity divided by total premium, eight-decimal half-up arithmetic. |
| RMA | Indemnity/liability | Publisher-recorded indemnity divided by liability, eight-decimal half-up arithmetic. |
| CAS | Accident year | Year in which the claim cohort was incurred, 1998–2007. |
| CAS | Development lag | One-based year-end age, lags 1–10. |
| CAS | Calendar year | `accident year + development lag - 1`. |
| CAS | Paid path | Net cumulative paid loss and allocated expense field; not recovery or total economic consequence. |
| CAS | Incurred path | Net incurred loss and allocated expense field; not cash paid. Bulk/IBNR is not relabeled as case reserve. |
| CAS | Negative revisions | Paid and incurred decreases from the prior lag are counted by line and never clipped. |
| CAS | Upper-triangle fit | Line-specific matched volume-weighted link ratios using only calendar years through 2007. |
| CAS | Lower-triangle holdout | Later calendar-year cells are outcomes only and never enter factor fitting. |
| CAS | Tail missingness | No development beyond lag 10; lag 10 is not asserted ultimate and no tail/TVaR calibration is admitted. |
| CAS | Correlation missingness | Calendar diagonals exist, but shock/catastrophe identifiers and independence evidence do not. Entity overlap is not a correlation estimate. |

All ratios use exact integer inputs and half-up rounding to eight decimal
places. The shadow independently checks every projected CAS link factor and
the aggregate-bias arithmetic in every per-line paid and incurred holdout.
Weighted absolute error metrics are preserved from the fully replayed upstream
backtest; they are not re-derived from a lossy summary.

## Frozen observed diagnostics

### RMA 2024

- 152,383 source rows and 152,383 unique semantic cells; zero duplicates.
- 97,782 exposure-bearing cells.
- 41,792 exposure-bearing cells with zero reported loss in the frozen
  snapshot; the share is `0.42739973`.
- 265 policy numerator-over-denominator cells and 28 unit
  numerator-over-denominator cells. They remain separate, so frequency is
  quarantined.
- liability: `$158,673,917,761`.
- total premium: `$15,882,764,266`.
- publisher-recorded indemnity: `$15,163,448,979`.
- historical indemnity/premium: `0.95471095`.
- historical indemnity/liability: `0.09556359`.
- 25 negative indemnity adjustment cells are preserved.

These are aggregate crop-insurance source-domain measurements. “Indemnity” is
not promoted to verified cash paid, recovery, individual severity, or an
AI/robot loss.

### CAS Schedule P

The six lines contain 71,650 cells: 40,445 upper-triangle fitting cells and
31,205 later lower-triangle outcome cells. Factors and holdouts remain
line-specific. The shadow intentionally omits the upstream across-line
aggregate backtest values, while binding them through the upstream artifact
hash.

| Line | Rows | Upper | Lower | Paid decreases | Incurred decreases | Paid lag-10 WAE | Incurred lag-10 WAE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B — private passenger auto | 13,250 | 7,513 | 5,737 | 724 | 5,394 | 0.01482537 | 0.00976544 |
| D — workers compensation | 12,100 | 6,849 | 5,251 | 261 | 4,120 | 0.07613850 | 0.09830782 |
| C — commercial auto/truck | 14,640 | 8,255 | 6,385 | 419 | 4,924 | 0.07044425 | 0.06591178 |
| F2 — claims-made medical malpractice | 3,290 | 1,822 | 1,468 | 67 | 1,061 | 0.34402221 | 0.16671026 |
| R1 — occurrence product liability | 6,350 | 3,603 | 2,747 | 109 | 1,396 | 0.15598074 | 0.17109553 |
| H1 — occurrence other liability | 22,020 | 12,403 | 9,617 | 547 | 6,979 | 0.20679183 | 0.11906867 |

The material variation between lines is one reason the shadow does not pool
their dollars, factors, or holdout scores. It also keeps paid and incurred
paths separate inside every line.

## Non-pooling and rights boundaries

The artifact fixes the following policies to machine-verifiable values:

- RMA and CAS domains are separate; no amounts are summed or treated as
  comparable.
- CAS line amounts are not pooled. Every line retains its own factors and
  holdout metrics.
- No target-domain transfer coefficient is estimated.
- RMA public access is observed. The distribution/copying web-policy statement
  remains curator-asserted and its policy bytes were not replayed.
- Neither the RMA adapter nor this shadow concludes model-training rights.
- CAS public download and the page's research invitation are observed, while
  raw redistribution and commercial-use rights remain unconcluded.
- The adapter grants no additional rights.

## Fixed target and authority boundary

The following values are fixed to `false` and exact-schema checked:

- AI-agent/robot `frequency` and `severity`;
- `PRICE`, `GUARANTEE`, `SETTLE`, `CAPITAL`, `CUSTODY`, and `TRAIN`;
- source-to-target transfer; and
- `productionReady`.

Price, reserve, coverage, guarantee, settlement, capital, and custody outputs
are fixed to `null`. The decision is always
`ABSTAIN_REAL_INSURANCE_SOURCE_DOMAIN_CALIBRATION_SHADOW_ONLY`.

This evidence improves Outsider's factor definitions, denominator discipline,
development-lag math, and empirical error measurement. Becoming ready to bear
responsibility still requires linked AI/robot exposure and claim outcomes,
claim-level paid/reserve/recovery states, tail and dependence evidence,
prospective validation, independent actuarial and legal review, and actual
issuer/capital/custody/settlement institutions.

## Offline commands

Build a deterministic, no-clobber artifact:

```sh
node scripts/real-loss-calibration-shadow.mjs build \
  --rma-zip artifacts/stage234-rma-crop-insurance-2024/source/sobcov_2024.zip \
  --rma-layout artifacts/stage234-rma-crop-insurance-2024/source/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf \
  --cas-dir artifacts/stage234-cas-schedule-p-2025/source \
  --cas-page artifacts/stage234-cas-schedule-p-2025/source/source-page.html \
  --out artifacts/real-loss-calibration-shadow-20260821/calibration-shadow.json
```

Full source-aware verification:

```sh
node scripts/real-loss-calibration-shadow.mjs verify \
  --artifact artifacts/real-loss-calibration-shadow-20260821/calibration-shadow.json \
  --rma-zip artifacts/stage234-rma-crop-insurance-2024/source/sobcov_2024.zip \
  --rma-layout artifacts/stage234-rma-crop-insurance-2024/source/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf \
  --cas-dir artifacts/stage234-cas-schedule-p-2025/source \
  --cas-page artifacts/stage234-cas-schedule-p-2025/source/source-page.html
```

The CLI uses stable regular-file snapshots with no-follow reads. Output is
created with exclusive no-clobber semantics. It does not download data.

## Attack coverage

The focused test suite covers:

- exact frozen source replay and canonical upstream artifact pins;
- every RMA ratio and every per-line CAS development factor;
- accident/development/calendar axes and upper/lower separation;
- direct hash tampering;
- a coherently resealed metric forgery that passes only the explicitly
  untrusted structural verifier and fails full source replay;
- coherent authority promotion and extra-field injection;
- one-byte source substitution; and
- caller attempts to inject verifier results or admission callbacks.
