# CDI/NCIGF real rate and guaranty-fund evidence

This lane treats public records according to what they are. The California filing is real filed
actuarial experience. The CDI lists are real administrative filing and disposition records. The
NCIGF workbooks are real publisher-compiled guaranty-fund assessment reports. Public origin does
not reduce any of them to “research only,” and Outsider downloading them does not make them more
authoritative than their publishers say they are.

The adapter remains separate from the public package entry points and readiness authority. Its
frozen source-aware receipt is now bound into the local real-case catalog, responsibility flywheel,
and source-domain math diagnostics. That integration advances source-domain evidence without
granting Outsider an operational power, target-domain transfer, or pricing authority.

## Frozen source set

The snapshot contains 13 official objects totaling 4,480,455 bytes:

- one complete 129-page California public SERFF filing;
- one 2025 CDI approval/closed registry and one weekly public-notice registry;
- one 2025 California individual-market company aggregate workbook;
- the CDI health rate spreadsheet schema, health rate guidance, and SERFF viewing-room boundary;
- NCIGF's 2026 Q2 assessment-liability workbook, 2021–2025 history, and two inception views;
- the NCIGF assessment page and two-page reporting-guidelines document.

Every object is bound by URL, byte length, and SHA-256. Real-source admission requires all exact
bytes, the expected PDF/XLS/XLSX/HTML schema, and an exact full rebuild. A caller-provided byte map
is always a fixture with no official identity—even if its bytes happen to match the pins.

The interactive SERFF/APEX result corpus is not a stable static pin. It remains machine-deferred.
The reporting-guidelines PDF has exact bytes and a verified two-page PDF envelope, but its semantics
remain machine-deferred because this lane does not admit a portable semantic parser for that file.

## What is admitted

The CDI filing records a proposed overall rate change of -7.70%, requested effective date of
July 1, 2012, adjusted earned premium of $28,472,808, projected earned premium of $26,280,402,
and 2001–2010 exposure/loss experience. Its SERFF status is `ASSIGNED`, state status is `ACCEPTED`,
and disposition fields are blank. The adapter therefore records neither an approved rate nor a
charged policy price.

The 2025 CDI disposition workbook contains 2,484 `APPROVED` and 660 `CLOSED` records. Its approved
rate-change field remains an administrative filing value, not a policy-level charged price. The
weekly notice contains 30 rows; 27 join to the year-to-date disposition list by state file number.
That join is administrative identity, not a causal, claim-level, or policy-level link.

The California health workbook records 18,378 covered lives and a $668.970167 grandfathered
off-exchange average monthly premium per member. It reports zero filings effective in the reporting
year and a zero weighted rate change; neither means zero premium. Formula caches are publisher
reported values and are not represented as an Outsider recalculation.

The NCIGF 2026 Q2 workbook reports $16,959,476,645.26 of 2025 maximum assessment capacity and
$7,600,879,728.72 of 2026 capacity reported to date. It also reports $21,112,323 of net assessments
authorized in 2026. These are guaranty-fund statutory/reporting quantities. They are not cash held,
capital transferred to Outsider, custody, coverage, or an Outsider guarantee.

The inception-by-fund and inception-by-year workbooks contain 4,013 and 4,017 data rows. After
explicitly normalizing blank numeric cells to zero, each has the same 1,514 nonzero state/account/year
tuples and the same $20,893,256,833.701 reported net-assessment total. The four extra by-year rows are
all-zero rows. Rows are correlated within state, account, and year; they are not IID observations.

## Source quality preserved rather than cleaned away

The complete filing's ten annual loss-and-DCCE rows sum to $183,934,790, while its printed total is
$183,934,789. The one-dollar discrepancy is retained and flagged. It is not silently corrected.

The NCIGF five-year workbook's headers say 2021–2025, while its total row says `2006 Total` and two
bottom labels say `2020-2024`. Its 90/620 calculation is an account-year fraction even though the
publisher label describes accounts. These internal label drifts are retained as quality evidence.

NCIGF states that the compilation includes third-party or derived data, was not independently
verified by NCIGF, and can include estimates. The quarterly workbook also states a limited accounting
liability purpose. The adapter binds those qualifications byte-for-byte through schema markers and a
disclaimer hash. It concludes no commercial-use, redistribution, personal-data reuse, or training
right.

Known coverage gaps—including limited New York reporting, the Arizona workers' compensation start,
Puerto Rico missing years, DNR markers, partial 2026 premium availability, and capacity omitted for
some prefunded/unlimited arrangements—are encoded. Missingness is not assumed random. No prospective
holdout, tail/dependence fit, causal identification, or target-domain transfer is performed.

## Privacy and authority

Raw files are gitignored. The canonical projection retains company-level and aggregate values,
document/field hashes, and public institutional URLs. It does not retain filing contacts, signatures,
personal email addresses, or raw extracted PDF text.

All of the following remain false: `TRAIN`, `PRICE`, `GUARANTEE`, `COVER`, `CAPITAL`, `CUSTODY`,
`SETTLE`, `PAY`, `ISSUE`, and `APPROVE_RATE`. Standalone verification is structure-only and never
admits source reality. Only exact source replay admits the real source-domain descriptive experience,
and even full replay does not establish independent world truth or Outsider authority.

## Rebuild

```sh
node scripts/acquire-cdi-ncigf-real-rate-guaranty-evidence.mjs --from-dir /path/to/exact-pinned-files
node scripts/cdi-ncigf-real-rate-guaranty-evidence.mjs build
node scripts/cdi-ncigf-real-rate-guaranty-evidence.mjs verify \
  --artifact artifacts/cdi-ncigf-real-rate-guaranty-20260821/final-v1/evidence.json
node scripts/cdi-ncigf-real-rate-guaranty-evidence.mjs verify \
  --artifact artifacts/cdi-ncigf-real-rate-guaranty-20260821/final-v1/evidence.json \
  --source-dir artifacts/cdi-ncigf-real-rate-guaranty-20260821/source
```

Acquisition and build outputs are no-clobber. Online acquisition fails closed if any publisher byte
has changed; a revised publication requires a newly reviewed snapshot rather than inheriting this
snapshot's semantics.

Official entry points:

- [California public rate-filing lists](https://www.insurance.ca.gov/0250-insurers/0800-rate-filings/0100-rate-filing-lists/public-notices/)
- [California health rate filing guidance](https://www.insurance.ca.gov/0250-insurers/0500-legal-info/0200-regulations/HealthGuidance/RateFileFm2.cfm)
- [California virtual viewing room](https://www.insurance.ca.gov/0250-insurers/0800-rate-filings/0050-viewing-room/)
- [NCIGF assessment liability information](https://www.ncigf.org/assessment-liability-information)
