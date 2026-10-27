# FEMA / NFIP real-case evidence lane

This lane treats official public records according to what they are: **real administrative cases and real operational experience**. Discovering them on the public web does not demote them to synthetic or merely hypothetical research data. Source reality, data quality, use rights, domain transfer, and decision authority are separate questions.

The adapter admits exact paid-loss, recovery, current exposure, appeal-lifecycle, and adjudication facts while preventing those facts from silently becoming permission to price, guarantee, settle, hold capital, train a model, decide individual rights, or close a case.

## Frozen official scope

The local frozen source is `artifacts/fema-real-cases-20260821/source-v3/` (ignored by Git because it contains 6.36 MB of reproducible source evidence). It was acquired at `2026-08-21T11:00:27.000Z` only from `www.fema.gov` and `www.cbca.gov`.

- 51 files, 6,358,150 bytes.
- Acquisition manifest: 46,598 bytes; `sha256:c5c5426d375dbccc118f68cbbe3fc79bc339834a35fdc50db75c320394944728`.
- Source commitment: `sha256:a7f8c9fc4cb6a2b3b88dda24de3edaf6b434dab86b10a97a75e9c2a6e7853405`.
- OpenFEMA NFIP Claims v3: every row returned by `yearOfLoss eq 2024 and state eq 'NC'`, ordered by `id ASC`, 34 pages and 3,341 publisher transaction records. The last page has 41 rows. The first page's records were fetched again after pagination and were unchanged.
- OpenFEMA NFIP Residential Penetration Rates v1: complete 3,159-row JSONL snapshot.
- OpenFEMA Public Assistance Second Appeals Tracker v1: complete 1,726-row JSONL snapshot.
- Two complete official FEMA second-appeal HTML decision bodies and the complete two-page July 2024 appeals fact sheet.
- Complete CBCA FEMA decision index snapshot: 349 unique decision-PDF URLs for 2009–2026; complete rules PDF; two complete decision PDFs with monetary outcomes.
- Complete OpenFEMA Terms and Conditions page and publisher dataset/field metadata used by the adapter.

The primary official references are [OpenFEMA](https://www.fema.gov/about/openfema), [OpenFEMA Terms and Conditions](https://www.fema.gov/about/openfema/terms-conditions), [NFIP Claims v3](https://www.fema.gov/openfema-data-page/nfip-redacted-claims-v3), [NFIP Policies v3](https://www.fema.gov/openfema-data-page/nfip-redacted-policies-v3), [NFIP Residential Penetration Rates v1](https://www.fema.gov/openfema-data-page/nfip-residential-penetration-rates-v1), and the [PA Second Appeals Tracker v1](https://www.fema.gov/openfema-data-page/public-assistance-second-appeals-tracker-v1).

The adjudication references are FEMA's [PA Appeals fact sheet](https://www.fema.gov/sites/default/files/documents/fema_pa-appeals-fact-sheet_2024.pdf), the fixed [denied Napa case](https://www.fema.gov/appeal/codes-and-standards-10), the fixed [partially granted Seminole case](https://www.fema.gov/appeal/result-declared-incident-allowable-costs-and-reasonable-costs), the [CBCA FEMA index](https://www.cbca.gov/decisions/fema.html), and [CBCA Rules 601–613](https://www.cbca.gov/howto/rules/CBCA%20Rules%20of%20Procedure%20-%20FEMA%20Arbitrations%20Under%2042%20U.S.C.%205189a(d).pdf).

## Facts admitted

### NFIP paid loss and recovery

The 3,341 North Carolina 2024 loss-year records have an OpenFEMA `asOfDate` of 2026-08-03. Loss dates range from 2024-01-02 through 2024-12-29.

| Fact | Exact value |
|---|---:|
| Net building payment | $220,793,775.11 |
| Net contents payment | $39,313,491.74 |
| Net ICC payment | $320,837.87 |
| Net total payment | $260,428,104.72 |
| Gross reported payment | $260,522,191.98 |
| Recorded component recovery | $94,087.26 |
| Claim-reported building + contents coverage | $1,070,871,600.00 |
| Records with a payment date | 3,191 |
| Records with a recovery date | 2 |
| Records with zero recorded net payment | 526 |

The adapter verifies separately for building, contents, and ICC that gross reported payment minus the corresponding claim-payment recovery equals net payment. Recovery consists of $89,953.35 building and $4,133.91 contents recovery; ICC, salvage, and subrogation are zero in this slice.

The record-level net-payment distribution is real descriptive experience: mean $77,949.15, p50 $25,280.15, p90 $222,833.94, p95 $311,296.41, p99 $560,390.08, maximum $1,000,000.00. Payment latency from loss date to most recent payment date has p50 110 days, p90 300, p95 388, and maximum 870.

These are publisher **claim transaction records**, not proven statistically independent unique losses. The 3,341 records carry a summed `policyCount` of 3,946 because multi-unit contracts can represent multiple insured units. Neither number is admitted as an all-policy exposure denominator. `mostRecentPaymentDate` is not a closure date, and zero net payment is not relabeled as denial or closure.

### Current residential exposure

The 2026-08-03 penetration snapshot contains real NFIP residential contracts-in-force plus an NSI-derived estimate of residential structures.

- National non-null contracts-in-force sum: 3,161,236; 194 cells have missing contracts-in-force.
- National non-null estimated residential structures sum: 109,326,879; 15 cells are missing.
- 27 SFHA penetration cells exceed 1.0 and are flagged rather than used; FEMA explains that NSI incompleteness can inflate those rates.
- North Carolina has 100 complete known-FIPS county rows plus one unknown-county row. Known-FIPS totals are 106,560 contracts and 4,056,295 estimated structures, ratio `0.02627028`. SFHA totals are 60,527 contracts and 113,606 estimated structures, ratio `0.53277996`.

This is current real exposure, but it is **not contemporaneous 2024 Hurricane Helene exposure**. The adapter permits the 2026 exposure and 2024 loss experience to be reported side by side, not divided to invent claim frequency.

OpenFEMA publishes 74,349,525 NFIP policy **transaction** rows. Only their metadata and field definitions are frozen here. That transaction count is explicitly prohibited from being relabeled as policies in force or an exposure denominator.

### PA appeal lifecycle and adjudication

The full tracker has 1,726 records: 1,355 denied, 146 granted, 128 partially granted, 17 remanded, 16 withdrawn, 7 rescinded, 2 `N/A`, and 55 under review. The raw 128 `Partially Granted ` values include trailing whitespace; the adapter records and normalizes this defect.

- 1,671 rows have signed decisions; the 55 under-review rows do not.
- 1,629 rows carry merits outcomes (denied, granted, or partially granted); 42 carry procedural or non-merits statuses; 55 are pending.
- Signed-decision elapsed calendar days from HQ receipt: minimum 5, p50 87, p90 271, p95 432, maximum 938.
- Counts over 90/180/365 days are 670/308/115. These are not declared deadline violations because RFI pauses, tolling, and complete legal-clock context are absent.
- Pending rows are right-censored and excluded from completed-duration quantiles, so the duration distribution is completion-conditioned.
- One hundred rows record an RFI sent, 79 an RFI received, and 9 a received date later than the published due date. The adapter does not infer fault from those nine records.
- Composite correlation roots contain 12 additional rows beyond one per root. Publisher IDs remain distinct records, but the field dictionary says those IDs do not persist across refreshes; neither IDs nor rows may be assumed IID or used as longitudinal revision keys.

The tracker has no disputed-amount or awarded-amount field. Two official decision bodies supply amount-linked cases without inventing a bulk amount join:

- `FEMA_4193_PW_191`: $127,586.63 was obligated before appeal; the additional $1,851,876.29 second-appeal amount was denied; the body identifies the determination as final.
- `FEMA_4337_GMP_27317`: initial request $697,180.18; revised second-appeal amount $547,067.66; partially granted. The same official page reports $546,471.14 in its brief/letter and $546,471.40 in its analysis conclusion. The adapter preserves both, records the $0.26 conflict, and admits no single approved amount pending a publisher correction or superseding record.

That discrepancy is deliberate evidence of the quality rule: official provenance raises authority, but it never bypasses field-level consistency checks.

The FEMA fact sheet says second appeal decisions are final agency decisions. Its complete two pages were read with `pypdf 6.1.1`; the PDF bytes are mechanically pinned, but the JavaScript adapter does not pretend to mechanically replay that semantic transcription.

### CBCA arbitration

The complete official index has 349 unique FEMA decision links. Only two decision bodies are downloaded and semantically extracted, so outcome-body coverage is `2/349`, not a complete CBCA outcome corpus.

- CBCA 7244/7245: initially requested project amounts $2,655,460.30 and $1,259,974.87; labor claim no longer pursued; debris-recovery base $2,678,767.20; 20% discount $535,753.44; final grant $2,143,013.76.
- CBCA 7872: arbitration request $1,372,059.63; reported first-appeal eligibility $668,996.50; majority reimbursement $1,105,082.26; separate opinion present.

Rules 601–613 state impartial dispute resolution, final Executive Branch action, final administrative action, limited review, and no merits reconsideration. The lane establishes a real adjudicating panel external to FEMA. It does **not** infer full institutional independence from the Executive Branch from these sources alone. PDF amount/rule transcriptions are byte-anchored human readouts and are not labeled mechanically replayed.

## Quality, revision, privacy, and rights gates

- Every frozen byte is size- and SHA-256-pinned. The reader rejects symlinks, path escapes, added files, missing files, byte mutation, and file changes during read.
- OpenFEMA start/end metadata are semantically identical after excluding the API request `rundate`; the raw bytes differ because that request timestamp differs. The gate does not mislabel byte inequality as a data revision.
- Claims pagination is ordered, contiguous by offset, strictly increasing by publisher ID, exhausted by a short final page, and checked by a post-pagination first-page record replay. Offset pagination still cannot prove that an unseen middle-page insert/delete never occurred; the source snapshot is exact, and that residual acquisition risk remains explicit.
- All claim and tracker raw IDs, Census block-group GEOIDs, individual rows, applicant IDs, appellant names, project numbers, and addresses are omitted from the derived artifact. County output uses a minimum cell size of 11; 42 small cells containing 128 claim records are suppressed.
- OpenFEMA describes NFIP data as lagging the system of record and claims/policies/appeals as not official federal reports; the appeal tracker also warns of a small percentage of human error. These qualifications affect fitness for a use, not whether the records came from reality.
- The frozen OpenFEMA metadata has a null `license` field. The separate Terms snapshot permits statistical research, reporting records, and program-management decisions; prohibits reidentification and decisions affecting an individual's rights or benefit eligibility; requires attribution/non-endorsement; and allows FEMA to request cessation/destruction. Public access is not treated as an unrestricted license or model-training grant.
- The frozen CBCA sources establish public web access but contain no explicit reuse license. This lane therefore does not infer downstream redistribution or model-training authority for CBCA material. That CBCA-specific rights uncertainty is separate from OpenFEMA's terms and from the records' reality classification.

The required attribution/non-endorsement language must be taken from the frozen [OpenFEMA Terms](https://www.fema.gov/about/openfema/terms-conditions) when publishing a downstream product.

## Stable API and replay

The module [`src/outsider-fema-real-cases-evidence.js`](../src/outsider-fema-real-cases-evidence.js) exports:

- `buildFemaRealCasesEvidence(sourceDirectory, options?)`
- `verifyFemaRealCasesEvidence(artifact)`
- `verifyFemaRealCasesEvidenceWithSource(artifact, sourceDirectory)`
- `FEMA_REAL_CASES_SCHEMA`
- `FEMA_REAL_CASES_FROZEN_SOURCE_20260821`

The canonical local derived artifact is `artifacts/fema-real-cases-20260821/evidence-v1.0.0.json`: 22,847 bytes, serialized-file SHA-256 `60a4ecdd871d22a3c515f41a65c125ca766d5580074208acae968f19bbee3fb7`, internal domain-separated artifact hash `sha256:8e4a0c2c6e170e69f9bcaf1f2c6c8715956a367999d2d48412c14e76b94e6e5c`.

The older `evidence-v1.json` and
`evidence-v1.0.0-pre-source-rights-scope.json` bytes remain intact for audit
history, but neither is canonical and both fail a current `source-v3` exact
rebuild. Each has an adjacent `*.superseded.json` machine pointer containing
its old file/artifact hashes and the canonical file/artifact/source hashes.
Likewise, `source/SUPERSEDED-SOURCE.json` and
`source-v2/SUPERSEDED-SOURCE.json` route stale source snapshots to
`source-v3`. The first source lacks three appeal objects; `source-v2` has the
same file count as `source-v3` but different pinned publisher response bytes.
These pointer files all state `sourceArtifactsReverifiedByThisMarker:false`:
they prevent ambiguous selection but confer no verification authority.

Standalone verification only proves a self-sealed envelope and returns `SELF_SEALED_UNTRUSTED_ENVELOPE`; a caller can recompute its own hash. Only source-aware verification exact-rebuilds the artifact and returns `FULL_FEMA_CBCA_FROZEN_SOURCE_REPLAY`.

Source-aware verification reports JSON/JSONL metrics as mechanically verified and official PDFs as byte-verified, while keeping `pdfSemanticReadoutMechanicallyVerified: false`. A caller-resealed authority mutation or source substitution fails full replay.

Build and verify offline:

```sh
node scripts/fema-real-cases-evidence.mjs build \
  --source-dir artifacts/fema-real-cases-20260821/source-v3 \
  --out artifacts/fema-real-cases-20260821/evidence-v1.0.0.json

node scripts/fema-real-cases-evidence.mjs verify \
  --source-dir artifacts/fema-real-cases-20260821/source-v3 \
  --artifact artifacts/fema-real-cases-20260821/evidence-v1.0.0.json
```

Reacquire from official hosts into a new, non-existing directory:

```sh
node scripts/acquire-fema-real-cases.mjs \
  --out artifacts/fema-real-cases-YYYYMMDD/source \
  --acquired-at <current-canonical-UTC-time>
```

The acquisition time must be canonical UTC and within five minutes of invocation. Acquisition never overwrites an existing directory.

## Authority boundary and remaining gaps

This lane grants only observation, source-domain description, and source-domain shadow calibration. `PRICE`, `GUARANTEE`, `SETTLE`, `COVERAGE`, `CAPITAL`, `CUSTODY`, `TRAIN`, and `CLOSE` remain false.

It does not close these gaps:

- 2024 loss matched to contemporaneous policy exposure and a defensible claim-frequency denominator;
- unique-loss linkage and dependence clusters across claim transaction records;
- fitted tail/dependence validation and prospective holdout;
- complete FEMA decision-body amount extraction and complete CBCA decision-body outcome extraction;
- source correction for the Seminole $0.26 internal conflict;
- independent affected-party standing, independent claims administration, licensed issuance, capital custody, or a real payment-remedy-recovery-reopen-close loop;
- demonstrated transfer from flood/PA source domains to AI-agent or robotics liability.

Those are real external or modeling gaps. They are not hidden by downgrading the records to “research,” and they are not falsely closed merely because the records are official.
