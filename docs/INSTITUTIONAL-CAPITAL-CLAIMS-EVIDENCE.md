# Institutional capital, custody, reserve, claims, and review evidence

This lane connects real institutional evidence to the 67-row readiness gap
ledger without granting any readiness closure credit. It answers a narrow
question: what can frozen public source bytes establish about real capital,
collateral custody, solvency disclosure, reserve accounting, receivership
claims payments, and professional review structure while institution-specific
Outsider resources are not yet available?

It does **not** answer whether Outsider is an issuer, has capital, controls a
custodian or payment rail, may quote a price, guarantees an outcome, adjudicates
a claim, settles an obligation, or is production-ready. Every one of those
authorities is fixed to `false`.

## Frozen source set

The source adapter accepts one exact 14-object source set. It reopens each
regular file without following symlinks, checks size and SHA-256 before parsing,
validates the acquisition manifest, rebuilds every diagnostic, and exact-compares
the result during full verification.

| File | Bytes | SHA-256 |
|---|---:|---|
| `fdic-failures.json` | 1,349,551 | `4f1efa1011326cf6d5dacc2b407d4a20a42c603ec79cb02a62ba26d1ff73fb3f` |
| `fdic-failures-swagger.yaml` | 34,749 | `854500ae68d77185a12fc9260e0bbc0194e3848df0e54086f828656ea508852b` |
| `fdic-failure-properties.yaml` | 14,728 | `7e3137fb6fc93dd49371b4d032f48fad403efd3d9a7f5cc8ca5480c00807364c` |
| `fdic-dividends.html` | 12,976 | `e63c280e548aba441a332221bfcb4ccf4e57db5afd1941a54912430ba43173d4` |
| `fdic-dividends.json` | 930,766 | `21f79ac746296613a8c0df48993c7be2f692feb117c21ba44b464f9cb9ce6206` |
| `fdic-dividends-repeat.json` | 930,766 | `00198c08f3c3b0a59151683ffb7786a50d2bc4de1d651dbc7cdfd8c0125d2c45` |
| `fdic-dividends-app.js` | 4,724 | `1ffb80fec775d4a2b50c4f4a3841d788931673de198d2fff453db4e0b15dc76f` |
| `treasury-tcmm.html` | 118,700 | `2095ed9a9ad42c360328d2b844363651040d3a77b2812ed32cd041dcae29e4ba` |
| `rli-edgar-index.json` | 11,754 | `97c2b2a6731abd7fb5b416a94d8a9e204cba13560511fe824564054a36d8148b` |
| `rli-2025-10k.html` | 8,558,265 | `a01661c1abfb9880fe8a6452a5e17d1cf407ba2bff5ed44cdf4c5aee4ee1e853` |
| `asop-23-data-quality.html` | 115,940 | `fa25a7aab95bcd5eec55db5c57197db5788cbd6f35edb8ada3be0f4059d0fb32` |
| `asop-36-reserve-opinion.html` | 141,053 | `a5f2fa8807fa1083d484336683b42f1eaa3cf123f035504d52a319595a81bddd` |
| `asop-53-future-costs.html` | 108,333 | `b97c0cd7ec5fccb4c3dda86908a65ec21d8839c4e01d7c1af3414c9eab594a5f` |
| `asop-55-capital-adequacy.html` | 133,774 | `8c5df1297e90b32974ba5aac6c501b03d88263d605279fb92ca83a2d220cf89c` |

Total frozen source bytes: **12,466,079**. The official entry points are the
[FDIC BankFind API](https://api.fdic.gov/banks/docs/),
[FDIC failed-bank dividends](https://closedbanks.fdic.gov/dividends/),
[Treasury TCMM](https://fiscal.treasury.gov/payments-to-government/treasury-collateral-management-monitoring-tcmm),
[RLI 2025 Form 10-K in SEC EDGAR](https://www.sec.gov/Archives/edgar/data/84246/000110465926018013/rli-20251231x10k.htm),
and the adopted ASB standards [23](https://www.actuarialstandardsboard.org/asops/data-quality/),
[36](https://www.actuarialstandardsboard.org/asops/asop-no-36-statements-of-actuarial-opinion-regarding-property-casualty-loss-loss-adjustment-expense-or-other-reserves/),
[53](https://www.actuarialstandardsboard.org/asops/estimating-future-costs-prospective-propertycasualty-risk-transfer-risk-retention/),
and [55](https://www.actuarialstandardsboard.org/asops/capital-adequacy-assessment/).

The FDIC dividends endpoint does not return a stable row order. Two requests
produced byte-distinct responses with the same 2,385-row multiset. Both raw
responses are frozen. A later live request is a new source version and is never
allowed to overwrite this version. The acquisition command therefore supports
verified import of the already captured exact bytes:

```sh
node scripts/acquire-institutional-capital-claims-evidence.mjs \
  --from-dir /path/to/captured-source --output /path/to/new/source
```

`transportAttested` remains false. Exact byte replay establishes the frozen
input and derivation, not when or by whom a network transfer occurred.

## One quality gate, not an “official source” shortcut

Publisher identity is not a score. Every source group is evaluated on the same
nine dimensions: reality, completeness, measurement, selection bias,
correlation, revision, independent review, rights, and source replay.

| Source group | Admission | Main strength | Binding limitation |
|---|---|---|---|
| FDIC failures | Real source-domain descriptive | 4,115 real failure/assistance records with documented amounts and resolution codes | Only failed/assisted institutions; no active-bank denominator; `COST` is a revised estimate |
| FDIC dividends | Real payment-lifecycle descriptive | Real receivership dividend events, priorities, repeat payments, and long latency | No individual claim amounts, denied claims, transfer receipts, fraud files, or full-recovery proof |
| Treasury TCMM | Structural governance only | Real collateral, valuation, custody, and possession roles | No pledged-asset ledger, transaction population, Outsider contract, or payment rail |
| SEC RLI 10-K | Real issuer disclosure descriptive | Replayable Inline XBRL reserve, capital, RBC, and restricted-deposit facts | One selected issuer; mixed entity/accounting scopes; not Outsider resources |
| ASOP 23/36/53/55 | Structural professional standard only | Adopted data, reserve-opinion, future-cost, and capital-assessment requirements | Standards do not perform an independent review of Outsider |

Public access is observed. Copyright ownership, raw redistribution, commercial
reuse, and training rights are not concluded. `TRAIN=false`.

## FDIC failure and resolution diagnostics

The pinned API response accounts exactly for 4,115 rows, its metadata total,
and its totals count. It spans April 19, 1934 through May 1, 2026.

- 3,522 rows are coded `FAILURE`; 593 are `ASSISTANCE`.
- Resolution subtype counts are preserved separately: `PA` 2,105, `A/A` 579,
  `PO` 573, `IDT` 386, `P&A` 251, `PI` 143, and smaller source codes.
- Deposit is missing in 2 rows and zero in 2; asset is missing in 154.
- Estimated resolution loss (`COST`) is missing in 638 rows, negative in 12,
  zero in 90, and positive in 3,375.
- Before 1986, 599 of 1,128 rows lack `COST`; from 1986 onward, 39 of 2,987
  rows lack it. This matches the source dictionary’s stated historical gap.
- Row-level cost/deposit ratios have 3,475 eligible denominators: median
  0.21118274, p90 0.49181455, p99 1.08887550, maximum 3.63480114.
- Row-level cost/asset ratios have 3,477 eligible denominators: median
  0.19813502, p90 0.48474524, p99 1.52781996, maximum 10.87100999.

Ratios are calculated per row with exact integer inputs and half-up rounding to
eight decimal places before nearest-rank quantiles. They are not pooled across
years/programs. Negative and greater-than-one estimates remain visible. These
are selected failed-institution resolution-loss diagnostics—not failure
frequency, paid claims, an insurance reserve, an AI-agent severity prior, or an
Outsider capital model.

## FDIC receivership payment lifecycle

The primary endpoint has 2,385 published rows and 2,382 distinct rows. The
adapter preserves three exact duplicate rows, 133 fund values with whitespace,
two funds with multiple institution-name strings, six raw dividend-type labels,
six raw priority labels, one unrecognized priority row, and one unrecognized
dividend-type row.

Within `trim(fund) + normalized priority` only:

- 578 groups are observed;
- five groups contain a downward cumulative-percent revision;
- duplicates are excluded only from latency and ordered-sequence diagnostics;
- percentages are never summed across funds or priorities.

Closure-to-payment latency across 2,382 distinct valid rows is 0 to 7,014 days:
median 1,336, p90 3,758, p95 4,375, and p99 5,260 days. This is payment-event
latency, not the time until an affected person’s harm was repaired.

There are 496 `FINAL` rows. Only four show cumulative `total_paid` of 100%; 492
are below 100%. The median final cumulative percentage is 74.098% and p90 is
91.102%. The source defines a final dividend as the last dividend from remaining
receivership proceeds. The adapter therefore fixes:

- final event ≠ full claim recovery;
- cash distribution ≠ individual bank-transfer receipt;
- payment ≠ restoration of reality;
- receivership claim proof ≠ Outsider adjudication, fraud review, or appeal.

## SEC reserve, capital, and restricted-deposit facts

The adapter reads SEC EDGAR Inline XBRL attributes—concept, context, USD unit,
display value, and scale—rather than scraping a formatted table.

For the current consolidated 2025 context:

| Fact | USD |
|---|---:|
| Gross claims and claim-adjustment liability | 2,886,819,000 |
| Reinsurance recoverable for unpaid claims | 746,798,000 |
| Net unpaid claims and claim-adjustment liability | 2,140,021,000 |

`gross - recoverable - net = 0` exactly. The recoverable is 0.25869235 of gross,
but it is not cash already collected.

The filing also reports:

- exact aggregate insurance-subsidiary statutory capital and surplus of
  1,846,615,000 USD;
- principal RLI Insurance Company authorized-control-level RBC of
  306,000,000 USD; and
- 107,000,000 USD of restricted investments, with filing text stating fixed
  income securities were deposited with regulatory authorities as required by
  law.

The exact surplus and exact RBC facts have different entity scopes. The adapter
refuses to calculate their ratio. It also refuses reserve-to-capital transfer,
accounting-basis transfer, population representativeness, or any inference that
these resources are available to Outsider. The filing contains independent
auditor-report text, but this lane does not independently map every projected
fact to the auditor’s scope.

## Custody and independent-review structure

Treasury TCMM establishes a real structural pattern in its own scope: public
money above deposit-insurance protection is collateralized; specified
individual-surety assets are held by a Federal Reserve Bank; TCMM provides
acceptability/valuation guidance and may take possession of pledged assets.
This helps name the missing roles—depository, collateral monitor/valuer,
custodian, contracting officer—but supplies no Outsider agreement or
transaction receipt.

The four adopted ASOPs make the review gap more precise:

- ASOP 23: selection, review and use of data, reliance, and disclosure;
- ASOP 36: reserve-opinion types, materiality, adverse deviation, supporting
  assets, recoverables, reliance, and documentation;
- ASOP 53: future-cost scope, exposure bases, history adjustments, credibility,
  catastrophes/infrequent events, reinsurance, profit/capital, and funding;
- ASOP 55: capital targets/thresholds, cash-flow timing, dependence,
  concentration, scenario/stress tests, management actions, valuation basis,
  multiple regimes, and disclosure.

They are standards, not reviews. A named independent actuary and counsel still
must apply the relevant standards to Outsider’s exact data, model, product,
contracts, capital, and governance.

## Gap-to-source matrix

The artifact binds the exact readiness ledger hash
`sha256:4a17b6959f085a4b1db7f10351bd4525d978a837f1a81acc45bdbf35dce5109a`
and emits all 67 rows:

- 31 `SATISFIED_INTERNAL` rows stay internal;
- all 36 external rows stay `BLOCKED_EXTERNAL`;
- every row has `closureCredit=false` and
  `sourceDomainTransferAuthorized=false`.

The new sources illuminate 19 external gaps. Examples include real estimated
resolution-loss structure for `S2_ADJUDICATED_ECONOMIC_LOSS_SEVERITY`, review
requirements for `S2_INDEPENDENT_ACTUARIAL_REVIEW`, real capital/restricted
deposit/collateral roles for `S3_CAPITAL_CUSTODY_POLICY_COUNTERPARTIES`, and
real partial/final dividend histories for `S4_PAYMENT_AND_RECOVERY_EVIDENCE`.
In every case, the matrix states why the analogy does not close the target gap.

The 36 external gaps reduce to eight externally closable work bundles, without
claiming that any bundle is easy:

1. Native worker/platform control plus multi-machine, multi-repository evidence.
2. Consented runs, device roots, rights/time governance, owners, and independent outcomes.
3. Target-domain exposure, adjudicated loss, external holdout/dependence, and prospective factors.
4. Independent actuarial, legal-product, adjudication, and fraud review of the exact system.
5. Authorized issuer, resource-owner adoption, and binding affected-party standing.
6. A funded reserve/capital/custody contract, named counterparties, and a real failure exercise.
7. A real covered claim with independent adjudication, appeal, challenge, closure, and reopening.
8. An authorized payment rail, transfer receipts, recovery evidence, and longitudinal consequence maturity.

## Sources researched but not admitted

The matrix records useful candidates without pretending they were integrated:

- The NAIC Financial Data Repository would provide broad statutory insurer
  cohorts but bulk access requires licensing/institutional resources.
- The [NAIC Receivership and Insolvency Task Force](https://content.naic.org/committees/e/receivership-insolvency-tf)
  publishes useful Uniform Data Standards and report structures, but this lane
  found no public claim-row cohort to admit.
- The [NCIGF Assessment Liability Report](https://www.ncigf.org/assessment-liability-information)
  is highly relevant to guaranty-fund capacity and assessments, but its page
  expressly says the underlying data/estimates were not independently verified;
  reuse rights for the workbooks were not cleared.
- The [California DOI Virtual Viewing Room](https://www.insurance.ca.gov/0250-insurers/0800-rate-filings/0050-viewing-room/)
  exposes real rate filings, but an unbiased deterministic cohort was not yet
  selected and access passes through interactive SERFF terms.
- CFPB complaints were not treated as statistical loss samples or adjudicated
  claims. FEMA arbitration evidence is routed to the separate NFIP/FEMA lane.

This is deliberate quality control, not a judgment based on publisher prestige.

## Build and verify

```sh
node scripts/institutional-capital-claims-evidence.mjs build \
  --source-dir artifacts/institutional-capital-claims-20260821/source \
  --out artifacts/institutional-capital-claims-20260821/evidence.json

node scripts/institutional-capital-claims-evidence.mjs verify \
  --source-dir artifacts/institutional-capital-claims-20260821/source \
  --artifact artifacts/institutional-capital-claims-20260821/evidence.json

node --test test/outsider-institutional-capital-claims-evidence.test.js
```

Standalone verification returns `SELF_SEALED_UNTRUSTED_ENVELOPE` and
`sourceArtifactsReverified=false`. It checks the schema, fixed false authority,
quality gate, gap matrix, and self-seal, but it cannot establish the diagnostic
derivation. Full verification rebuilds only from the exact raw source directory,
accepts no caller result/callback/trust boolean, exact-compares the artifact, and
returns `FULL_OFFICIAL_FDIC_TREASURY_SEC_ASB_SOURCE_REPLAYED`.

The tests include coherent math resealing, authority promotion, publisher-based
quality promotion, same-size byte tamper, source substitution, callback/result
injection, and no-clobber CLI attacks.
