# Remedy, payment, recovery, and closure real cases

This lane admits real public institutional experience into Stage 3 and Stage 4. Public origin is not a downgrade, and Outsider collection would not be an upgrade. Source identity, publisher authority, completeness, revision handling, correlation, missingness, and semantic precision decide what the evidence can support.

## Frozen official snapshot

| Source object | Declared scope | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| [CFPB Civil Penalty Fund and Bureau-Administered Redress FY2025 annual report](https://files.consumerfinance.gov/f/documents/cfpb_fy2025-cpf-bar-annual-report_2026-03.pdf) | Complete FY2025 tables used below | 213,295 | `4f1c870f694db3c2fb8111e081aaa9caee5d6ecab7e6ca4f5330a957bdc48ef2` |
| [FTC 2024 Annual Report on Refunds to Consumers](https://www.ftc.gov/system/files/ftc_gov/pdf/ftc-refunds-consumers-2024.pdf) | Complete CY2024 closed-program table plus published distribution aggregates | 660,571 | `14cb059063eda15e5de03cb651a340296a9a20ae2ac4aa31b2c1a342e67fea84` |
| [CPSC Monthly Progress Reports](https://www.cpsc.gov/Data/Monthly-Progress-Reports) | Current visible `MPR` sheet, stated current as of 2026-07-13 | 129,631 | `29be30d806f82fb4fcd41fd7ca74ad4711882741694cdc34534244cbf02f9808` |
| [CPSC Recalls API](https://www.cpsc.gov/Recalls/CPSC-Recalls-Application-Program-Interface-API-Information) | Complete declared recall-date slice 2022-08-01 through 2026-07-13 | 4,727,858 | `c140f33584499674626bd3d2c067343339fd3daf5313498bcfe340b7fbf39a14` |

The raw sources and generated evidence book live under `artifacts/remedy-payment-recovery-20260821/`, which is gitignored. The adapter ships only source pins, parsing rules, admitted projections, and tests.

## What the real cases establish

### CFPB fund, custody, allocation, payment, and conclusion events

The FY2025 report yields separately typed events:

- 8 Civil Penalty Fund allocation events, totaling $260,774,803. Allocation means funds were set aside; it is not a payment or receipt.
- 7 distribution-initiated case rows. The report lists $2,195,752,140 allocated, $2,060,054,937 distributed, and 4,581,067 reported payments made.
- 6 distribution-concluded case rows. They list $80,288,827 allocated, $35,805,076 distributed, and 71,727 reported payments made.
- 2 Bureau-Administered Redress distribution-initiated rows, with $61,505 distributed and 66 reported payments made. The report states that this relief is treated as fiduciary funds in the Treasury's Legal or Equitable Relief Fund.

`allocatedUsdCents`, `distributedUsdCents`, payment count, claimed percentage, and program conclusion remain different fields. A concluded distribution is a real institutional conclusion event; it does not establish that every affected person received full recovery or accepted closure.

### FTC sent, cashed, recovered, and closed-program events

The complete table of 25 refund programs closed in 2024 records:

- total fund: $163,866,338.26;
- returned to consumers: $148,337,472.49;
- administration: $6,728,657.08;
- leftover funds: $8,800,208.69;
- consumers sent a payment: 1,770,214;
- consumers who cashed at least one payment: 1,162,743.

The adapter reconciles the first four amounts exactly and retains all 25 case rows. It also retains the report's aggregate first- and additional-distribution figures, but does not merge aggregates whose scopes differ.

`sent`, `cashed at least one`, and `full compensation` are not synonyms. The FTC closed-program status is a real program-level outcome. It is not evidence that every affected consumer was found, paid, made whole, or agreed that recovery was complete.

### CPSC recall remedy progress

The current visible MPR sheet contains 38 recall rows. Every row correlates to one of the 1,492 unique CPSC Recall API records in the complete date slice by normalized recall number and exact recall date:

- 38/38 exact date agreements;
- 35/38 exact title agreements and 38/38 normalized title agreements;
- 35 rows with a recalled-unit count;
- 17 rows with complete manufacturer/distributor/retailer/consumer correction counts and a total; all 17 arithmetic totals agree;
- 21 rows with at least one missing core MPR field.

The full API slice exposes two malformed publisher URL values. They are counted as source-quality anomalies instead of silently repaired. Neither anomaly is in the 38 correlated MPR cases.

The workbook says firms submit the MPRs and gives mixed reasons for blanks: data may not yet be due, not yet be provided, still be processed, or be barred from disclosure. Therefore:

- blanks remain `null`, never zero;
- firm-reported corrections are not labeled independent outcome sensing;
- the 38-row MPR sheet is not treated as all recalls or a representative sample;
- the recalled-unit field is recall scope, not a population-at-risk denominator;
- publisher percentages are preserved but not recomputed with invented denominators;
- hidden older worksheets are excluded from the current projection;
- correction is not equated with complete recovery.

## Quality and rights boundary

The two PDF reports are exact-byte replayed. Their admitted table rows are code-declared manual transcriptions whose official totals are mechanically reconciled. The adapter explicitly reports that the PDF table values were not machine-reparsed and were not independently double-transcribed. Updating a PDF requires review and a new byte pin, not automatic ingestion.

The CPSC XLSX central directory and CRCs are parsed in Node without a spreadsheet dependency. The adapter first reads `xl/workbook.xml`, resolves the named `MPR` sheet's `r:id` through `xl/_rels/workbook.xml.rels`, and only then opens the mapped worksheet member; it never assumes `sheet1.xml`. The selected sheet's headers, notes, rows, native identifiers, and cached values are then parsed. The Recall API JSON is checked for exact slice size, unique `RecallID`, unique `RecallNumber`, date bounds, and row shape before correlation.

Public access and official U.S. government publishers are recorded. This adapter does not claim that legal reuse rights for automatic training have been reviewed, and does not grant rights beyond the publishers' terms. Raw source bytes are not packaged.

No lane output grants Outsider `PRICE`, `GUARANTEE`, `SETTLE`, `CUSTODY`, `PAY`, `CLOSE`, or `REOPEN`. It does not estimate incident frequency, economic-loss severity, causal effect, target-domain price, or full-recovery rate.

## Stage 3 and Stage 4 contribution

Stage 3 gains real institutional precedents for collecting funds, final-order gating, allocation, fiduciary handling, distribution administrators, payment counts, and unused-fund disposition. These precedents specify mechanisms and observable states; they do not make Outsider a custodian, issuer, or payment rail.

Stage 4 gains real case-level payment, cash-participation, resend, additional-distribution, program-conclusion, and recall-remedy-progress states. The remaining target-specific work is adopting an authorized payment rail, claim adjudicator, affected-party standing, reopening authority, and a target-domain recovery definition.

## Stable API and replay

The module `src/outsider-remedy-payment-recovery-evidence.js` exports:

- `REMEDY_PAYMENT_RECOVERY_SOURCE_PINS`;
- `extractXlsxEntry`;
- `resolveWorkbookWorksheetMember`;
- `buildRemedyPaymentRecoveryEvidenceProjection`;
- `buildRemedyPaymentRecoveryEvidenceFromSource`;
- `verifyRemedyPaymentRecoveryEvidence`;
- `verifyRemedyPaymentRecoveryEvidenceAgainstSource`.

Reacquire the exact admitted snapshot:

```sh
node scripts/acquire-remedy-payment-recovery-evidence.mjs
```

Build and source-replay the evidence book:

```sh
node scripts/remedy-payment-recovery-evidence.mjs
```

Independently verify an existing book against the pinned source directory without writing output:

```sh
node scripts/remedy-payment-recovery-evidence.mjs verify \
  --source-dir artifacts/remedy-payment-recovery-20260821/source \
  --book artifacts/remedy-payment-recovery-20260821/evidence-book-final-v1/book.json
```

Run focused tests:

```sh
node --test test/outsider-remedy-payment-recovery-evidence.test.js
```

The frozen source-replayed book has commitment `sha256:0d27c736a6c1a9ca6473b5656ea603f26593ef51a3cc154bedbbc660328a9997`. Its serialized `book.json` is `sha256:eb5a57cb442a95076de41feeff9a403c86befc5bf18b8c03740709f8e66b1e34`; the run receipt is `sha256:a30c6e66239ab59ee378f26d89622bbc56b4cdb78ef9cb60183c0d4b319afea1`.

## Update flywheel

Upstream revisions intentionally fail the acquisition pin. A reviewed update should:

1. acquire candidate bytes without replacing the admitted artifact;
2. diff native case keys, revision dates, amounts, counts, status, missingness, and source anomalies;
3. investigate removals, duplicate keys, date or title correlation failures, and denominator changes;
4. update source pins and expected totals only after the candidate passes quality review;
5. rerun source replay, tamper tests, authority tests, and downstream calibration;
6. preserve the previous frozen snapshot for longitudinal change analysis.
