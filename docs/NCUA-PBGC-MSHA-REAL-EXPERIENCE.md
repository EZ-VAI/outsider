# NCUA, PBGC, and MSHA real-experience intake

This lane admits three kinds of real-world evidence without relabeling them as
mere research because they were found online:

- NCUA's real institutional operation and audited 2025 Share Insurance Fund
  financial experience;
- PBGC's real pension-insurance operations, balance-sheet, benefit-payment,
  financial-assistance, and recovery experience; and
- MSHA's real operator/contractor-reported accident, injury, illness, employment,
  and hours-worked records.

Reality is not a publisher score. Public origin does not downgrade a record,
and collecting a record ourselves would not upgrade it. The adapter keeps
source reality, publisher role, audit scope, coverage frame, denominator,
revision, correlation, privacy, rights, target transfer, and operational
authority as separate dimensions.

## Frozen source set

The 2026-08-21 version accepts exactly 15 complete official objects totaling
129,422,288 compressed/source bytes. Every object is size- and SHA-256-pinned;
the acquisition manifest is also exact. The source directory may contain no
extra files or symlinks.

| Lane | Frozen object | Bytes | SHA-256 |
|---|---|---:|---|
| NCUA | `ncua-annual-report-2025.pdf` | 2,411,372 | `96525a998e26871aaf3da4e5ac0c3b26d1c79783a21ba76e795959a5803338df` |
| NCUA | `ncua-december-2025-share-insurance-highlights.html` | 61,781 | `5ae2b8fb38b9ceeab91e91dc96486fa6c1bdca508de18c4dd72192f476e7991a` |
| PBGC | `pbgc-pension-insurance-data.html` | 83,504 | `ba3e2807cc97ae353ab7bec50941e7e7e480c2c6b80e46fd83046e8ef482cd9d` |
| PBGC | `pbgc-2024-pension-data-tables.pdf` | 2,850,162 | `1ece72d658056b7310883a7bc75d2dbabd13aef7ac3acac0415d2d6137804d51` |
| PBGC | `pbgc-2024-pension-data-tables.xlsx` | 1,282,942 | `a4d2a029de3e69a5e43c928beea77c943108683dc2129a63775f889c5608ca01` |
| PBGC | `pbgc-annual-report-2025.pdf` | 3,511,185 | `9c81c3dc011665db740331b6157188526a7a44f091bcc4e61f2abb20513170da` |
| MSHA | `msha-open-government-data.html` | 30,491 | `8e0c198aeba3f688c0928df5fecdf3c890db1ca113ee2427d0a1330a35dc159b` |
| MSHA | `msha-accidents.zip` | 52,121,983 | `6241a7db7119dd64fe70d661a47689eee523d59885caa99969d5ca6d278ae366` |
| MSHA | `msha-accidents-definitions.txt` | 10,214 | `c7681808dd372b6c5bd95fdf70b01e856e0d2501b7e5d7cc9185f4c4e1f876e5` |
| MSHA | `msha-mines-prod-quarterly.zip` | 53,931,298 | `29af7b8d15562d352f2260c251bc0785450f0937ac5dea823367bb43000ced85` |
| MSHA | `msha-mines-prod-quarterly-definitions.txt` | 2,055 | `9177770776652a8f3c3a120ab973799a69d333c5f0aa7b5eb51b5150d08e19f3` |
| MSHA | `msha-contractor-prod-quarterly.zip` | 9,525,950 | `e26fa0f7c6551d41e69fa55527b6427b38d722dbc0b53482e80e771096eefa6d` |
| MSHA | `msha-contractor-prod-quarterly-definitions.txt` | 1,983 | `cd5cc19bd91c48ea9d35969817c18e402dfe3e7954f498edd53231861bdd8391` |
| MSHA | `msha-part50-yellow-jacket.pdf` | 3,585,200 | `640699fcf0e2e3ce60a92272fe830e44d1d84a5d8f13ca3ee6bd8e846fa9c69c` |
| MSHA | `msha-source-scope.html` | 12,168 | `87792da2eded71aaa5e2f4474cd8472edbfcffd9ea3920a36b6437d3b2acc6fd` |

Official entry points are the [NCUA 2025 Annual Report](https://ncua.gov/news/publication-search/annual-report/2025-annual-report),
[NCUA December 2025 fund highlights](https://ncua.gov/news/publication-search/share-insurance-fund/december-2025-share-insurance-fund-financial-highlights),
[PBGC Pension Insurance Data Tables](https://www.pbgc.gov/about/reports/pension-insurance-data),
[PBGC FY2025 Annual Report](https://www.pbgc.gov/sites/default/files/documents/pbgc-annual-report-2025.pdf),
and [MSHA Open Government Data](https://arlweb.msha.gov/OpenGovernmentData/OGIMSHA.asp).

The acquisition receipt records the exact publisher URLs and bytes but sets
`transportAttested=false`: replay proves the frozen object and derivation, not
who performed the network transfer. A future changing weekly MSHA export is a
new version, never a silent replacement.

Once a live URL has advanced, preserve/reconstruct this frozen version only
from an already retained exact source directory; the acquirer rechecks every
pin before copying and never launders local bytes into a transport claim:

```sh
node scripts/acquire-ncua-pbgc-msha-real-experience.mjs \
  --local-dir /path/to/retained/exact-source \
  --out-dir artifacts/ncua-pbgc-msha-real-experience-20260821/source
```

## What the complete replay establishes

### NCUA

The complete 194-page report is parsed. The lane preserves KPMG's unmodified
opinion scope and the report's explicit boundary that reasonable assurance is
not absolute assurance. For the Share Insurance Fund at 2025-12-31 it records,
in thousands of USD, total assets of 24,105,761; total liabilities of 241,770;
net position of 23,863,991; insurance-and-guarantee-program liabilities of
234,026; and provision for insurance losses of 4,888.

The separately published December highlights remain preliminary and unaudited.
Their $234.0 million reserve headline and $14.1 million December insurance-loss
reduction are not silently substituted into audited fields. A reserve is not a
paid-claim loss, audit assurance is not a guarantee, and NCUA assets are not
Outsider capital or custody.

### PBGC

The full 36-sheet XLSX, its 37-page PDF, the current data index, and the
complete 149-page FY2025 report are parsed. Cross-representation agreement is
not inferred from matching source titles or a few PDF phrases. Twelve declared
`GLANCE` bindings mechanically require the exact XLSX row label and cells to
match the corresponding PDF label plus displayed value sequence. The binding
set covers net position, assets, liabilities, insured plans and participants,
change in claims, direct/traditional/SFA payees or participants, and the three
benefit/assistance payment rows. Currency cells retain exact XLSX decimals and
declare the PDF's nearest-whole-million display transformation (for example,
6,151.99 becomes `$6,152`); counts, footnotes, `N/A`, and program-column order
have separate explicit rules. The artifact records all 12 receipts and binding
set hash `sha256:8e5469cb08371f4089837bf9632216dd2a7e96abe3cf6ffa3efa788f1298448a`.
Label or displayed-value mismatch fails source replay. Selected cells are also
required to be non-formula values rather than formula caches.

The denominator years stay explicit: Form 5500 data are plan-year 2023,
premium filings are plan-year 2024, and operational data are fiscal-year 2025.
This is the 2024 first installment; individual tables have heterogeneous end
years and later installments are expected.

The lane keeps direct benefit payments, traditional financial assistance,
special financial assistance, and retrospective repayments separate. For
example, it records 6,426.16 million USD of single-employer direct benefits,
169 million USD of multiemployer traditional assistance, and 6,151.99 million
USD of special financial assistance from the data workbook. The annual report's
119.5 million USD of retrospective death-audit repayments is not relabeled as
ordinary claim recovery. PBGC's chart definition of “claims” is not paid-claim
severity, and PBGC assets do not transfer to Outsider.

### MSHA

All three ZIP entries are streamed in full, not sampled. The replay accounts
for 115,579,231 compressed bytes, 616,179,387 decompressed bytes, and 4,397,266
physical data rows:

| Dataset | Rows | Current endpoint | Preserved quality facts |
|---|---:|---|---|
| Reported accidents/injuries/illnesses | 274,448 | 2026 Q3; latest event date 2026-08-19 | 274,448 unique document numbers; current quarter right-censored |
| Mine quarterly employment/exposure | 2,761,063 | 2026 Q2 | 4 invalid-hours rows; zero-hour rows remain real published values |
| Contractor quarterly employment/exposure | 1,361,755 | 2026 Q2 | 3 malformed rows and 11 invalid-hours rows are preserved |

The source publishes a rate definition based on category count × 200,000 ÷
employee-hours. This artifact intentionally emits no derived incidence rate:
current accidents reach Q3 while exposure reaches only Q2, and the
reportability, operator/contractor, and cohort rules have not been frozen.
Shared identifier/year roots are correlation affordances, not a proved
one-to-one event-to-exposure link or causal adjudication.

MSHA records are mandatory operator/contractor reports under Part 50. They are
real reported cases, but they are not automatically an independent sensor and
document-number uniqueness is not proof that every underlying event is
complete. That publisher/self-report boundary does not make the records
fictional or “only research.”

The raw accident export contains potentially sensitive row-level narrative,
occupation, experience, injury, and return-to-work fields. Raw sources and
canonical artifacts stay under the gitignored `artifacts/` tree. Tracked code,
tests, documentation, and generated aggregate artifacts contain no person- or
mine-linked rows, names, or narratives. Public access is observed, but exact
reuse licensing, affected-person consent, privacy clearance for training, and
model-training rights are not concluded. `TRAIN=false`.

## Stable build and verification API

The module exports two intentionally different verification levels:

- `verifyNcuaPbgcMshaRealExperience(artifact)` validates the sealed envelope
  and fixed no-authority boundaries only. It never establishes source truth.
- `verifyNcuaPbgcMshaRealExperienceWithSource(artifact, sourceDirectory)`
  reopens the exact directory, checks every pin and manifest, fully reparses all
  PDF/XLSX/HTML/TXT/ZIP objects, rebuilds the artifact with the candidate's
  timestamp, and exact-compares it in the same call.

Caller-provided buffers are always built as `UNATTESTED_CALLER_BYTES`, even if
their hashes happen to match every frozen pin. They cannot self-attest as an
official replay.

Full PDF replay requires the `pdfinfo` and `pdftotext` executables from Poppler.
The adapter searches the normal executable path and Codex's bundled dependency
layout. If complete structural and text extraction is unavailable, replay
fails closed; it does not substitute a partial parser.

```sh
node scripts/acquire-ncua-pbgc-msha-real-experience.mjs \
  --out-dir artifacts/ncua-pbgc-msha-real-experience-20260821/source

node scripts/ncua-pbgc-msha-real-experience.mjs build \
  --source-dir artifacts/ncua-pbgc-msha-real-experience-20260821/source \
  --out artifacts/ncua-pbgc-msha-real-experience-20260821/final-v1/evidence.json

node scripts/ncua-pbgc-msha-real-experience.mjs verify \
  --artifact artifacts/ncua-pbgc-msha-real-experience-20260821/final-v1/evidence.json

node scripts/ncua-pbgc-msha-real-experience.mjs verify-source \
  --artifact artifacts/ncua-pbgc-msha-real-experience-20260821/final-v1/evidence.json \
  --source-dir artifacts/ncua-pbgc-msha-real-experience-20260821/source
```

## Machine deferrals

This lane supplies replayable source-domain factors; it does not pool these
three population frames, derive a global loss rate, validate target-domain
transfer, or close an operational gap. It machine-defers current-quarter
alignment, cohort/reportability rules, independent outcome sensing, causal
adjudication, rights/consent, target-domain validation, licensed issuance,
Outsider capital and custody, and the actual payment-remedy-recovery lifecycle.

Every operational authority remains false: `PRICE`, `GUARANTEE`, `SETTLE`,
`TRAIN`, `ADJUDICATE`, `PAY`, `CUSTODY`, `CLOSE`, and `REOPEN`. Operational
readiness credit is exactly zero.
