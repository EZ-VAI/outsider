# NTSB/BLS real outcome and exposure evidence

This lane treats high-quality public records according to what they are. NTSB
completed investigations are real investigated cases. BLS SOII and CFOI data
are real occupational outcome and exposure experience. Their public origin
does not demote them to “research only,” and Outsider's collection does not
upgrade their authority, population fit, causal meaning, or reuse rights.

The frozen source contains 38 official objects and 26,162,708 source bytes:

- 24 NTSB objects: one [partial-automation investigation index](https://www.ntsb.gov/Advocacy/SafetyIssues/Pages/Partial%20Automation.aspx), six completed investigation pages, six exact public-docket index pages, five adopted final-report PDFs covering six cases, and six selected factual-report PDFs.
- 14 BLS objects: five [SOII 2024](https://www.bls.gov/iif/nonfatal-injuries-and-illnesses-tables/soii-summary-historical.htm) workbooks, five [CFOI 2024](https://www.bls.gov/iif/fatal-injuries-tables.htm) workbooks, the [OIICS 3.03 manual](https://www.bls.gov/iif/definitions/occupational-injuries-and-illnesses-classification-manual.htm), and three official-page DOM captures.

The three HTML captures are explicitly recorded as browser-rendered
`document.documentElement.outerHTML`, not original HTTP response bytes. No
transport receipt is claimed.

## NTSB case lane

The frozen NTSB index identified these six completed partial-automation
investigations:

| Case | Event date | Location | Adopted report | Selected factual report | Docket links |
| --- | --- | --- | --- | --- | ---: |
| HWY24FH008 | 2024-03-03 | Philadelphia, PA | HIR2602 | Vehicle automation | 17 |
| HWY24FH006 | 2024-02-24 | San Antonio, TX | HIR2602 | Vehicle automation | 22 |
| HWY19FH008 | 2019-03-01 | Delray Beach, FL | HAB2001 | Video study | 40 |
| HWY18FH011 | 2018-03-23 | Mountain View, CA | HAR2001 | Automation/data summary | 59 |
| HWY18FH004 | 2018-01-22 | Culver City, CA | HAB1907 | Automation/data summary | 15 |
| HWY16FH018 | 2016-05-07 | Williston, FL | HAR1702 | Driver-assistance systems | 46 |

Each PDF must pass all of the following before admission: exact byte length and
SHA-256, `%PDF-` header, physical-tail `startxref` and `%%EOF`, an in-bounds
xref target, full Poppler parse, exact page count, and full-document text
extraction with page coverage. This specifically rejects the earlier truncated
5.1 MB copy of HIR2602. The admitted HIR2602 is 10,061,229 bytes and 128 pages.

The six docket files are exact docket indexes. Their 199 links are preserved,
but the adapter does not claim to contain all 199 linked document bytes.

HIR2602 covers two cases. Its binding uses the official index, both case pages,
both dockets, and PDF title/keywords. Two publisher defects are quarantined and
never used as primary identifiers:

- the HWY24FH008 page's visible link label says `Final Report HWY2602`, while
  its href, docket, and PDF identify HIR2602;
- HIR2602 page 128 says `HWY24FH006 and HWYFH008`, omitting `24` in the second
  ID, while the PDF metadata/title/body and official case roots identify
  HWY24FH006 and HWY24FH008.

NTSB probable cause, factual findings, recommendations, and adopted-report
status are preserved as agency records. They do not assign fault or blame,
determine rights or liabilities, or authorize settlement. The artifact also
preserves the report's 49 USC 1154(b) civil-damages evidence boundary. The
snapshot does not automatically observe later corrections, supersession, or
recommendation-status changes.

## BLS experience lane

### SOII 2024

SOII is employer-reported survey experience, not a census and not an
independently adjudicated claim set. Rates, counts, their RSE tables, and hours
are parsed as separate but correlated tables.

- Rates, rate RSE, counts, and count RSE each preserve 1,070 ordered industry
  rows and the same row-sequence commitment. The 1,047 normalized keys include
  23 repeated rows; duplicates are not discarded.
- The hours table preserves 1,062 detail rows, 1,034 normalized keys, and its
  distinct denominator frame. It has 1,026 keys in common with the main frame,
  21 main-only keys, and 8 hours-only keys. A positional join is forbidden.
- Published suppression symbols are never coerced to zero. The five workbook
  suppression counts are 228, 170, 228, 170, and 14.
- Percent RSE measures sampling error; it is not represented as total error or
  a covariance/dependence model.

The private-industry check preserves 2,488.4 thousand total recordable cases,
213,077,936 thousand employee-hours, a published 2.3 rate per 100 FTE, 0.5%
count RSE, 0.4% rate RSE, and 0.2% hours RSE. The denominator identity is
`cases × 200,000 / employee-hours`; agreement is checked only at the published
one-decimal rounding level.

### CFOI 2024

CFOI fatality counts are census counts, but its hours-based rates use
CPS-estimated exposure. Four count tables independently preserve the same
national total of 5,070; the industry/event table records 4,616 private-industry
fatalities. Suppression remains distinct from zero, including the different raw
symbols used by the workbooks.

The rate formula is `(N / EH) × 200,000,000`, yielding fatalities per 100,000
FTE. A critical denominator boundary is enforced:

- workers under 16, volunteers, and resident military are excluded from rate
  calculations for CPS consistency;
- the displayed 5,070 total fatal injuries is the count before those rate
  exclusions, so `5070 / published total hours` must not be used to reconstruct
  the published 3.3 rate;
- published categories require at least 5 fatalities and 40 million hours;
- a dash combines “no data reported” and “does not meet publication criteria”;
- the published margin of error measures employment variance, not fatal-count
  variation, and small fatal counts can fluctuate across years.

The rate workbook also preserves the NAICS 2022 fatal-numerator versus NAICS
2017 CPS-exposure comparability boundary. Occupations use SOC 2018.

### OIICS 3.03

All 13 sheets of the OIICS 3.03 workbook are CRC-checked and parsed. Version
3.03 was issued in May 2026 and implemented for reference year 2024. The 2023
OIICS 3.0 change is a break from earlier series; 3.03 is a minor clarification
release with no major code, title, or definition taxonomy change. Cross-series
pooling without explicit version handling is forbidden.

## Stable interface

Frozen canonical commitments:

- generated at: `2026-08-21T11:30:00.000Z`
- source directory: `artifacts/ntsb-bls-real-outcome-20260821/source`
- selected artifact: `artifacts/ntsb-bls-real-outcome-20260821/final-v2/outcome-evidence.json`
- source-set hash: `sha256:7567c6af079ae204d58a7dc0cfada7b939524665b819da02d42fbccebcb42214`
- NTSB source-set hash: `sha256:3d9f17ec43f3e7e259b11dee6f8b1e9ba4271e8bfb006f908457b3635a6d5690`
- BLS source-set hash: `sha256:9efcb83bb30f0230065ae69046a958a92928a0a13d9c305bd3f7ca939027a802`
- acquisition-manifest hash: `sha256:82985d454d454a7953fa09682c587e02780dd2938955d2e7dea9ff08ca86e8e7`
- internal artifact hash: `sha256:da933b03d6ed8c3c56cc80561373f03bb2060b93adce45995eb88f13c8ff4792`
- serialized artifact: 46,469 bytes, `sha256:1b1b57250becd399ef0a698d7273275fe0f21e8b99bf7b9d5a15597835f399af`

Final-v2 is a no-clobber full-source rebuild and is byte-identical to the
preserved 20260828 canonical-hardening candidate. Final-v1 remains preserved
behind an exact same-family marker; the marker establishes routing and byte
identity only, not publisher authority or source truth.

The module exports:

- `NTSB_BLS_OUTCOME_EVIDENCE_SCHEMA`
- `NTSB_BLS_FROZEN_SOURCE_20260821`
- `buildNtsbBlsOutcomeEvidenceFromBytes(files, options)`
- `buildNtsbBlsOutcomeEvidenceFromSourceDirectory(directory, options)`
- `verifyNtsbBlsOutcomeEvidence(artifact)`
- `verifyNtsbBlsOutcomeEvidenceWithSource(artifact, directory)`

The generic bytes builder intentionally cannot self-attest, even if a caller
passes byte-identical official files. It returns no real-case, real-experience,
publisher, or rights admission. Only the source-directory builder validates the
exact frozen acquisition manifest, all 38 byte pins, XLSX ZIP/CRC structure,
semantic invariants, and complete PDF parser gates.

Standalone verification is `STRUCTURE_ONLY`. It never establishes source
truth, publisher authority, or admission. Source-aware verification performs
an exact rebuild and may reproduce the frozen official source profile and its
publisher-record status. Even a successful replay does not establish
underlying world truth or institutional authority beyond the records.

```sh
node scripts/acquire-ntsb-bls-outcome-evidence.mjs \
  --out-dir artifacts/ntsb-bls-real-outcome-20260821/source \
  --ntsb-dir artifacts/ntsb-bls-real-outcome-20260821/ntsb-staging \
  --bls-dir artifacts/ntsb-bls-real-outcome-20260821/browser-staging

node scripts/ntsb-bls-outcome-evidence.mjs build \
  --source artifacts/ntsb-bls-real-outcome-20260821/source \
  --out artifact-candidates/ntsb-bls-real-outcome/replay/outcome-evidence.json \
  --generated-at 2026-08-21T11:30:00.000Z

node scripts/ntsb-bls-outcome-evidence.mjs verify \
  --artifact artifacts/ntsb-bls-real-outcome-20260821/final-v2/outcome-evidence.json

node scripts/ntsb-bls-outcome-evidence.mjs verify-source \
  --artifact artifacts/ntsb-bls-real-outcome-20260821/final-v2/outcome-evidence.json \
  --source artifacts/ntsb-bls-real-outcome-20260821/source
```

## Non-authority boundary

This wave adds outcome sensing and source-domain denominator experience. It
does not identify a transferable causal effect, fit tail/dependence, observe
economic loss or payment, establish data-reuse rights, or authorize training,
pricing, guarantee issuance, settlement, claim closure, execution, fault
assignment, or legal-liability determination. All of those authority bits are
false.
