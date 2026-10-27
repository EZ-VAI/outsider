# NHTSA Recall and Remedy-Status Evidence

This lane freezes real NHTSA recall and manufacturer status-report records. Public origin does not lower their reality, and an official publisher does not automatically prove every underlying fact. Admission depends on exact source bytes, the published dictionaries, campaign-level deduplication, revision/missingness handling, privacy minimization, and explicit inference limits.

Current canonical artifact:

- `artifacts/nhtsa-recall-remedy-evidence-20260821/final-v6/evidence.json`
- artifact hash: `sha256:afad74141571a82e40564f7b43bcacb0ccea2671684f3809e4bf4717af069034`
- serialized file SHA-256: `sha256:47ff5b8ccb8f780efe235d39bcf21c890917a54baa4f1de1114881af1fad628e`
- source-set hash: `sha256:b4552ffd3ebb2bc1d05b368c0bca3d6ccd42ac97d21f360b7eef63c3bfea5bb1`
- acquisition-manifest SHA-256: `sha256:b20bc43b921c08db9b7d646e591e69f53e3db05ee99c9946093fac89a1237d82`

`final-v1` through `final-v5` are explicitly superseded. The current artifact adds explicit inference boundaries, source-preserving population reconciliation, an enforcement-order scope boundary, and a canonical generated-at lock; underlying source bytes are unchanged.

The source and canonical artifact are intentionally local-only, gitignored evidence. They are not tracked by Git and are not promised as npm package members. A consumer without the six exact local source objects can run only structure verification on a separately supplied artifact; full source admission requires reconstructing the pinned local source directory. The paths below document the workspace freeze, not a portable package attachment.

## Exact source population

The source directory contains six exact official objects totaling 16,452,753 compressed/document bytes:

- the NHTSA recall, quarterly-status, and annual-status dictionaries;
- the named post-2010 recall archive;
- the complete published quarterly-status archive; and
- the complete published annual-status archive.

The three archives expand to 319,978,059 bytes. The parser verifies each compressed file SHA-256, ZIP structure, entry name, decompressed byte count, CRC-32, and decompressed SHA-256 before using a row. The official source URLs are under `https://static.nhtsa.gov/odi/ffdd/rcl/`; NHTSA documents the downloads at [NHTSA Datasets and APIs](https://www.nhtsa.gov/nhtsa-datasets-and-apis) and describes the recall process at [NHTSA Recalls](https://www.nhtsa.gov/recalls).

Transport is not cryptographically attested, and NHTSA did not publish a checksum beside these files. The pinned SHA-256 values are local capture identities, not publisher checksums.

## What the real records establish

The frozen source contains:

- 244,499 post-2010 recall records and 15,197 distinct NHTSA campaigns;
- 699,086,836 potentially affected units after counting the repeated population field once per campaign, not once per make/model/component row;
- 75,624 quarterly status rows across 11,834 campaigns; and
- 5,875 annual status rows across 2,796 campaigns.

For a descriptive latest-observed snapshot, the adapter selects the maximum submission date, then report number, period, and row hash per campaign. It does not replace a malformed latest row with an older valid row. The resulting published-status references are:

- quarterly: 487,232,535 involved and 295,629,360 remedied (`0.606752092202`); and
- annual: 108,749,786 involved and 72,493,743 remedied (`0.666610442801`).

These two ratios are not directly comparable: the annual table has an explicit eligibility rule and therefore a different cohort. Neither ratio is a frequency, severity, actuarial, unique-repair, or consumer-receipt rate.

The latest quarterly `INVOLVED` value exactly matches the main recall `POTAFF` value in 11,780 of 11,833 linked campaigns. It is greater in 17 campaigns and lower in 36, with an aggregate absolute difference of 316,960. The adapter retains every difference and adjusts neither field. The annual latest snapshot matches all 2,796 linked main-campaign populations, but this still does not make either field a current in-service exposure denominator.

## Source-quality anomalies retained

No source anomaly is repaired or silently normalized:

- two quarterly period values violate the dictionary's `YYYY-Q` form: `2099-` and `2022`;
- one quarterly row reports involved `0`, remedied `22`, unreachable `0`, and removed `584`; and
- 2026 is incomplete at the freeze, while the status files can continue to be revised.

The artifact keeps deterministic row hashes and domain-separated campaign fingerprints for these anomalies. Raw descriptions, contact details, manufacturer names, and campaign identifiers are not emitted. An anomalous latest row would machine-defer that campaign; an older anomaly remains visible but cannot enter a latest-observed aggregate merely by being replaced with an earlier row.

## Consumer contract

Full source-aware verification admits only:

`ADMIT_REAL_NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE_ONLY`

It establishes that the frozen official records exist and that the artifact is their exact deterministic aggregate. It does not establish:

- independent defect causality or legal liability;
- an enforcement action, consent order, or enforcement-order merits record;
- that an affected party received a notice, repair, refund, or recovery;
- individually audited complete repairs;
- unique current vehicles in service or cross-campaign vehicle deduplication;
- paid, incurred, or ultimate losses;
- target-domain transfer, model-training rights, PRICE input, production readiness; or
- Outsider `PRICE`, `GUARANTEE`, `SETTLE`, `TRAIN`, `CLOSE`, or `EXECUTE` authority.

Standalone verification is structure-only and establishes none of the source admission above.

The canonical `generatedAt` identity is fixed at `2026-08-21T15:45:00.000Z`. The builder rejects any other supplied timestamp, standalone verification requires exact equality, and full source verification rebuilds with the internal constant rather than a candidate-controlled value. Resealed artifacts using 2000 or 2099 therefore fail before source admission.

## Commands

```sh
node scripts/acquire-nhtsa-recall-remedy-evidence.mjs \
  --import-dir <exact-downloads> \
  --out-dir artifacts/nhtsa-recall-remedy-evidence-20260821/source

node scripts/nhtsa-recall-remedy-evidence.mjs build \
  --source artifacts/nhtsa-recall-remedy-evidence-20260821/source \
  --out artifacts/nhtsa-recall-remedy-evidence-20260821/final-v6/evidence.json

node scripts/nhtsa-recall-remedy-evidence.mjs verify \
  --artifact artifacts/nhtsa-recall-remedy-evidence-20260821/final-v6/evidence.json

node scripts/nhtsa-recall-remedy-evidence.mjs verify-source \
  --artifact artifacts/nhtsa-recall-remedy-evidence-20260821/final-v6/evidence.json \
  --source artifacts/nhtsa-recall-remedy-evidence-20260821/source
```

Library API:

- `buildNhtsaRecallRemedyEvidenceFromSourceDirectory(sourceDirectory, options?)`
- `verifyNhtsaRecallRemedyEvidence(artifact)`
- `verifyNhtsaRecallRemedyEvidenceWithSource(artifact, sourceDirectory)`
- `nhtsaRecallRemedyExpectedAcquisitionManifest()`

## Bounded triage of the eight previously browsable-only sources

This wave intentionally stops after the highest-value bounded source completes. The other entries remain real sources; “deferred” describes the current machine-use boundary, not a lower reality grade.

| Source | Current bounded decision | Auditable reason |
|---|---|---|
| `NHTSA_RECALLS_ENFORCEMENT` | exact source replay complete | Small official recall + quarterly + annual archives form a bounded campaign/remedy-status chain with dictionaries and exact bytes. |
| `FDA_GUDID` | machine-defer to a separate linkage wave | On 2026-08-21 AccessGUDID listed a 516 MB full release with 5,182,695 device identifiers and an MD5. Daily/weekly files are deltas and cannot be substituted for the full identity population. Exact full-release parsing, version precedence, MAUDE UDI normalization, linkage coverage, and rights need their own bounded run. See [AccessGUDID Downloads](https://accessgudid.nlm.nih.gov/download). |
| `CFPB_COMPLAINTS` | machine-defer to a structured, narrative-free slice | Complaints and company responses are a real affected-party reporting channel. CFPB states that recent publication is incomplete for the response window, narratives are consent-dependent and scrubbed but can be opted out, complaints are not independently verified, and the database is not representative. A future freeze should exclude narratives/ZIP codes and pin a complete declared date slice plus release notes. See [Consumer Complaint Database](https://www.consumerfinance.gov/data-research/consumer-complaints/) and [How CFPB shares complaint data](https://www.consumerfinance.gov/complaint/data-use/). |
| `SIGSTORE_REKOR` | machine-defer | A transparency-log checkpoint and inclusion proof can evidence publication integrity, but it cannot evidence an Outsider outcome or remedy unless an Outsider chain is actually logged. No such chain is in scope. |
| `NAIC_FDR_SBS` | machine-defer | The infrastructure is real, but detailed bulk solvency/licensing data can require licensed or paid access. Public pages alone are not an exact solvency population or a rights grant. |
| `FDIC_CALL_REPORTS` | machine-defer to a separate capital-denominator wave | Official quarterly bank filings are downloadable, but schema vintages, amendments, bank identity history, and banking-to-Outsider transfer require a dedicated source-aware cohort. They do not establish insurance capital custody. |
| `TREASURY_FISCAL_DATA` | machine-defer to a named-dataset wave | The API is real and versioned, but a generic API entry is not a bounded payment/custody population. A future run must choose a named dataset, full query, revision policy, units, and accounting denominator. |
| `CLINICALTRIALS_GOV` | machine-defer | The API provides real prospective protocol/results records, but its biomedical protocol unit and adverse-event reporting regime are not NHTSA remedy records or Outsider target evidence. A named device cohort and version history would be required. |

This triage does not claim exhaustive closure of the internet. It records why only one bounded source family was safe to turn into a frozen consumer contract in this wave.
