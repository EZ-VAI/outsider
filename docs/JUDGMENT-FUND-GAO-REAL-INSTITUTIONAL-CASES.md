# Judgment Fund + GAO real institutional cases

This lane treats qualifying public records according to what they are: real Treasury payment-operation records and real GAO administrative-adjudication experience. Public discovery does not demote them to synthetic research, and Outsider collection does not promote them beyond the facts the publishers actually establish.

The frozen lane has two deliberately separate domains:

- `TREASURY_JUDGMENT_FUND`: actual U.S. Treasury Judgment Fund biweekly payment reports, 2026-01-01 through 2026-07-31.
- `GAO_BID_PROTEST`: the complete official GAO FY2025 annual aggregate and current official process/reference material.

They are not pooled into one outcome distribution. Treasury payment components do not supply a GAO denominator, and GAO dispositions do not establish financial recovery.

## Frozen source scope

Freeze date: 2026-08-21. The [Treasury biweekly report index](https://fiscal.treasury.gov/payments-from-government/judgment-fund/bi-weekly-payment-report) was last updated 2026-08-13 and listed 14 contiguous intervals from 2026-01-01 through 2026-07-31. No August 1–15 report was listed at freeze, so the machine artifact is explicitly right-censored after July 31.

The exact source set contains 31 objects and 4,703,400 bytes:

- 14 exact publisher XLSX payment-report files. Each was independently downloaded twice and was byte-identical at freeze.
- Treasury’s current [payment process](https://fiscal.treasury.gov/payments-from-government/judgment-fund/award-payment-process), [FAQ](https://fiscal.treasury.gov/payments-from-government/judgment-fund/faqs), [electronic filing and Form 197 page](https://fiscal.treasury.gov/payments-from-government/judgment-fund/forms), [offset guidance](https://fiscal.treasury.gov/payments-from-government/judgment-fund/offsets), [regulations and guidance](https://fiscal.treasury.gov/payments-from-government/judgment-fund/regulations), Judgment Fund home page, Treasury Financial Manual page, exact 31 CFR Part 256 PDF/text, and exact current Form 197 PDF.
- The [GAO FY2025 annual report](https://www.gao.gov/products/gao-26-900695) rendered page and exact official PDF; GAO’s current [FAQ](https://www.gao.gov/legal/bid-protests/faqs), [filing process](https://www.gao.gov/legal/bid-protests/file-a-bid-protest), [reference materials](https://www.gao.gov/legal/bid-protests/reference-materials), and copyright page rendered DOM snapshots.

The 17 support objects have exact byte pins but were not independently redownloaded twice, so their machine field says byte stability was *not established*, not that they were unstable. GAO HTML captures are explicitly identified as browser-rendered `document.outerHTML`, not original HTTP response bodies. The GAO PDF and Treasury files have exact file-byte pins.

The legacy URL ending in `form-196.pdf` was excluded: at freeze it redirected to an HTML Judgment Fund home page. A search index’s older PDF extraction was not admitted as current official file bytes. Current Treasury regulations still preserve Form 196’s setoff role as process evidence, while the current forms page says Form 197 is the accepted form.

The search was systematic across relevant official primary-source pages and data surfaces; it is not represented as a literal exhaustive search of the entire internet.

## Treasury projection and exact measurements

The source-aware parser validates the ZIP central directory, CRCs, member bounds, workbook sheet declaration, `r:id` relationship, worksheet target, shared-string references, cell types, and the single semantic sheet. Formulas and cached formula values are prohibited rather than trusted. Inline strings, errors, booleans, external worksheet targets, macros, external links, unexpected value-bearing columns, and unsupported types fail closed.

Rows are identified from every nonblank row after the exact header. The one exact publisher privacy footnote is the only non-payment exception. A row with a missing responsible agency, submitting agency, or any of the four amount cells fails the build; it is not silently filtered out. Publisher AutoFilter ranges are diagnostic only because three workbooks place valid semantic rows outside that range.

Frozen measurements:

- 14 reports and 16,154 published payment-component rows.
- Principal: 314,631,622,284 cents.
- Attorney fees: 1,283,791,346 cents.
- Costs: 81,217,399 cents.
- Interest: 1,496,435,705 cents.
- Total published amount: 317,493,066,734 cents ($3,174,930,667.34).
- 10,966 zero-total rows, retained rather than removed.
- 2,487 semantic rows beyond publisher workbook filter endpoints, retained and counted.
- 214 raw numeric cells with more than two decimal places that reconcile exactly to cents; raw binary-float text is not treated as sub-cent precision.
- 10,927 repeated occurrences beyond the first within exact full raw-row equality groups. They are counted only; they are neither persisted nor deduplicated because identical rows can be separate components or payees.
- 93 responsible-agency aggregates, 49 submitting-agency aggregates, and 52 principal-citation aggregates. Claimant, counsel, and fact text is not projected.

Treasury’s FAQ says very large claims can be split into components under one control number. The reports do not expose the control number in the projected columns. Therefore a workbook row is a published payment component, never a unique claim, person, harm event, or exposure unit.

## Certification, offset, disbursement, and consequence

The machine boundary follows Treasury’s official process:

1. The submitting agency determines that no other legal funding source exists and submits a final judgment or settlement.
2. Fiscal Service administers the Fund and does not review or evaluate the underlying merits.
3. The Judgment Fund Section checks the proper funding source and finality and certifies a voucher.
4. Judgment-debt setoff occurs at the certification level.
5. Administrative offset is a distinct later operation at the disbursing-official level, after certification.
6. The disbursing official pays according to the voucher.

Certification is not disbursement. A reported/disbursed payment is not evidence of recipient bank settlement, claimant acceptance, harm recovery, restoration, or case closure. This lane is a real reference for public payment operation and amount components; it is not Outsider custody, a payment rail, or capital adequacy.

## GAO FY2025 annual aggregate

The artifact preserves the official FY2025 aggregate without manufacturing per-case observations:

- 1,688 cases filed: 1,617 protests, 24 cost claims, and 47 reconsideration requests.
- 1,737 cases closed: 1,676 protests, 20 cost claims, and 41 reconsideration requests.
- 359 task-order cases closed.
- 380 merit decisions and 53 sustains; exact recomputation 13.94736842105263%, publisher-rounded 14%.
- Publisher effectiveness rate 52%.
- ADR used in 53 cases; publisher-rounded success rate 91%.
- 3 hearings; publisher-rounded 0.5% of fully developed cases.
- Zero final decisions over 100 days.
- One reported agency nonimplementation instance.

Filed and closed cohorts need not contain the same docket numbers. Cases are docket numbers, not unique procurements. The annual table does not publish the effectiveness numerator, ADR-success numerator, or hearing denominator, so they are not reverse-engineered from rounded percentages.

No decision-level sample is admitted. GAO does not publish routine dismissals, and annual-report exemplars are outcome-selected sustains. A convenient sample would therefore introduce outcome leakage and a false closure denominator.

GAO is external to the procuring agency, but it is not an Article III court. A sustain is a recommendation, not self-executing judicial finality. Agencies must report whether they will comply, and FY2025 contains a real nonimplementation counterexample. Recommendation, corrective action, relief, implementation, and full economic recovery remain distinct states.

## Privacy, rights, and authority

Raw XLSX files remain under the gitignored `artifacts/` tree. They contain claimant and counsel columns; publisher redaction does not eliminate every entity or counsel name. The derived artifact preserves agencies, statutory citation categories, amounts, timing, and counts, but removes claimant names, counsel names, fact narratives, raw rows, raw-row hashes, and deterministic case pseudonyms. It therefore creates no hidden cross-report claimant-linkage surface.

Reality classification and reuse rights are separate. Public access is not recorded as automatic model-training permission. GAO notes that U.S. government products are generally not protected by U.S. copyright while warning that third-party material may be; the artifact consequently keeps training eligibility false. Raw source redistribution is not granted by this lane.

All Outsider action authority remains false: `PRICE`, `GUARANTEE`, `CAPITALIZE`, `CUSTODY`, `PAY`, `SETTLE`, `CLOSE`, and `REOPEN`. No affected-party standing, owner-gate input, licensed issuer status, or institutional authority is inferred.

## Deterministic replay

Stable API:

- `buildJudgmentFundGaoRealCasesFromSourceDirectory(sourceDir, { generatedAt? })`
- `verifyJudgmentFundGaoRealCasesEvidence(artifact)`
- `verifyJudgmentFundGaoRealCasesEvidenceWithSource(artifact, sourceDir)`
- `inspectGenericJudgmentFundWorkbookShape(workbookBytes)`

Acquisition/import:

```sh
node scripts/acquire-judgment-fund-gao-real-cases.mjs \
  --out-dir artifacts/judgment-fund-gao-real-cases-20260821/source \
  --staging-dir /path/to/exact-browser-and-file-captures
```

Build and verify:

```sh
node scripts/judgment-fund-gao-real-cases.mjs build \
  --source-dir artifacts/judgment-fund-gao-real-cases-20260821/source \
  --out artifacts/judgment-fund-gao-real-cases-20260821/final-v1/evidence.json

node scripts/judgment-fund-gao-real-cases.mjs verify \
  --artifact artifacts/judgment-fund-gao-real-cases-20260821/final-v1/evidence.json

node scripts/judgment-fund-gao-real-cases.mjs verify-source \
  --artifact artifacts/judgment-fund-gao-real-cases-20260821/final-v1/evidence.json \
  --source-dir artifacts/judgment-fund-gao-real-cases-20260821/source
```

Standalone verification is explicitly `STRUCTURE_ONLY_SELF_SEALED_NO_SOURCE_TRUTH`: it checks the fixed schema, arithmetic, immutable epistemic boundaries, exact pinned source declarations, and self-seal, but returns source/publisher/reality/rights verification false. Full verification rereads the exact inventory through no-follow file descriptors, detects file changes, reparses every workbook and official-page semantic gate, rebuilds the artifact, and exact-compares it.

Frozen source commitments:

- Source-object-set hash: `sha256:0073a8cf314aeadda25d281aa1d89db6ac00b5214093fcbb50069f29c8d81fe5`
- Acquisition manifest: 14,960 bytes; `sha256:59db45ff6ef406ad2be7151082333d917353cc1920b59085b28c6370fc5acab8`
- Semantic artifact hash: `sha256:e10699896cd8e7de3ca420f4f7092d4871324110a0a299e8cd9c07f19263109e`
- Canonical pretty-JSON file: 99,103 bytes; `sha256:85277537539f6ed38d08a29b5b320c9c4572f237d7d440bebbcf3a5d7c676c09`

The tests cover exact replay, source substitution, extra files, symlinks, caller overrides, unknown nested keys, authority forgery, privacy projection, formula-cache injection, unsupported cell types, external relationship substitution, generic-fixture non-inheritance, CLI no-clobber behavior, and exact arithmetic.
