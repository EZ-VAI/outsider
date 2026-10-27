# ClinicalTrials.gov posted registry/results evidence

This lane treats ClinicalTrials.gov registrations and posted aggregate results as real-world records. They do not become “mere research” because Outsider obtained them through a public API. The evidence boundary follows what the records actually are: study sponsors or investigators submit registration and aggregate result information; the National Library of Medicine performs a bounded quality-control review for apparent validity, meaningful entries, logic, internal consistency, and formatting, but does not establish scientific accuracy or independently adjudicate outcomes.

The lane therefore admits the exact frozen population as real sponsor-posted registry, participant-flow, outcome-measure, baseline-characteristic, and adverse-event experience. It does not reinterpret adverse-event timing as intervention causality, enrollment as target-domain exposure, a clinical outcome as economic loss, or NLM QC as independent adjudication. It also does not establish affected-party receipt, target transfer, a prospective Outsider holdout, pricing, capital sufficiency, coverage, settlement, or responsibility authority.

## Official scope and frozen population

- API documentation: <https://clinicaltrials.gov/data-api/api>
- Machine-readable API version: <https://clinicaltrials.gov/api/v2/version>
- Machine-readable field metadata: <https://clinicaltrials.gov/api/v2/studies/metadata>
- Machine-readable search areas: <https://clinicaltrials.gov/api/v2/studies/search-areas>
- Study data structure: <https://clinicaltrials.gov/data-api/about-api/study-data-structure>
- Result definitions: <https://clinicaltrials.gov/policy/results-definitions>
- Disclaimer: <https://clinicaltrials.gov/about-site/disclaimer>
- Terms and conditions: <https://clinicaltrials.gov/about-site/terms-conditions>
- API version: `2.0.5`
- Frozen data timestamp: `2026-08-21T09:00:05`
- Complete closed query: `AREA[ResultsFirstPostDate]RANGE[2026-07-01, 2026-07-01]`
- Explicit sort: `StudyFirstPostDate:asc`
- Page size: `7`; exact page row counts: `7, 7, 4`
- Population: all 18 records whose results were first posted on July 1, 2026 at the frozen data timestamp
- Frozen source objects: version, field metadata, search-area metadata, and three exact response pages; 6 objects and 2,044,546 bytes
- Acquisition-manifest SHA-256: `50a1bceba404de66969cb99b7bf0cbc6b817caf915855452d70bd011c77bb1a9`
- Source-set hash: `sha256:34199d825412cb9931378ebed6146a003e04e5788a492f8df3041a46d4fe6910`
- Ordered-population commitment: `sha256:fb6aacb161ffd5851cd3a08bf06195d1865e5d9e4ff21c94d239da12b1ba1987`
- Canonical artifact: `artifacts/clinicaltrials-posted-results-evidence-20260822/final-v3/evidence.json` (gitignored)
- Artifact hash: `sha256:93ae703761d069b7adbdc8ad781cc2ebb1d91b836aa21e027a5f6657f84840a6`
- Serialized artifact: 81,982 bytes; SHA-256 `cc6a3847ca58003db1cf91ba3fdc6cb365152c3c7ca82bb9c6be4b42f491f210`

The official page documents an OpenAPI URL, but that URL returned HTTP 404 at capture time. The lane records that fact and does not pretend the specification was captured. It instead pins the working official API version, official field metadata, official search-area metadata, exact request URLs, every pagination token, and every decoded HTTP response body. Any change causes acquisition to machine-defer.

## Privacy-minimized fixed projection

The request deliberately excludes contacts, investigator names, email, phone, locations, documents, IPD-sharing URLs, and participant-level data. The frozen request did include the lead-sponsor name field, and the raw `0600` source pages can therefore contain public individual as well as organization sponsor names. The privacy-minimized derived artifact does not copy, hash, or otherwise commit sponsor names. It retains only the registry's sponsor class, plus study design and enrollment, conditions and interventions, registered outcomes, and four aggregate result modules:

- participant flow;
- baseline characteristics;
- outcome measures;
- adverse events.

ClinicalTrials.gov states that posted summary results do not contain individual participant data. The frozen result modules can still contain sponsor-supplied aggregate free text, group labels, and study-level descriptions. Raw API pages remain in the gitignored source directory; the derived artifact keeps NCT identifiers, bounded study summaries, aggregate group safety counts, and commitments over only the privacy-minimized study summaries. A fixture containing an individual sponsor name is required to prove that neither the value nor a raw-record commitment survives projection.

## Observed posted experience

All 18 records are interventional studies. At the frozen timestamp, 14 were completed, two active but not recruiting, and two terminated. Lead-sponsor classes were six industry, one NIH, and 11 other. Every record contained posted outcome measures and an adverse-events module.

The fixed population contains 242 posted outcome-measure rows, 409 serious-adverse-event term rows, and 514 other-adverse-event term rows. These are real posted aggregate result rows. The artifact does not pool affected counts across terms or studies, calculate a cross-study rate, or treat registered enrollment as a uniform adverse-event denominator; people can appear in more than one adverse-event term, study designs and follow-up differ, and the records remain sponsor/investigator supplied.

## Data quality, rights, and admission

The terms-and-conditions and disclaimer URLs are recorded as advisory URL references only. Their page bytes were not included in this frozen six-object source set and are not replayed by the verifier. Consequently this artifact establishes no data-availability, attribution, processed-date, modification-disclosure, email-marketing, or third-party-copyright term: `rightsDetermination` is `NOT_ESTABLISHED_URL_ONLY_NOT_REPLAYED`. The API projection requests no email addresses. Public visibility preserves the record's reality but does not establish a reuse or behavior-model training right. `admittedTrainingRows` remains zero until rights, label-unit, target-transfer, and evaluation contracts are separately satisfied.

The admitted decision is `ADMIT_REAL_SPONSOR_POSTED_AGGREGATE_REFERENCE_ONLY`. It advances Stage 1 real-case registry coverage, Stage 1.5 structured posted-outcome sensing, and Stage 2 adverse-event reference coverage. It contributes zero target exposure–loss pairs and no Stage 3 guarantee or Stage 4 payment/remedy/recovery cases. `TRAIN`, `PRICE`, `UNDERWRITE`, `CAPITAL`, `COVERAGE`, `SETTLE`, and `GUARANTEE` remain false.

## Acquisition, build, and replay

```sh
node scripts/acquire-clinicaltrials-posted-results-evidence.mjs \
  --out-dir artifacts/clinicaltrials-posted-results-evidence-20260822/source

node scripts/clinicaltrials-posted-results-evidence.mjs build \
  --source artifacts/clinicaltrials-posted-results-evidence-20260822/source \
  --out artifacts/clinicaltrials-posted-results-evidence-20260822/final-v3/evidence.json

node scripts/clinicaltrials-posted-results-evidence.mjs verify \
  --artifact artifacts/clinicaltrials-posted-results-evidence-20260822/final-v3/evidence.json

node scripts/clinicaltrials-posted-results-evidence.mjs verify-source \
  --artifact artifacts/clinicaltrials-posted-results-evidence-20260822/final-v3/evidence.json \
  --source artifacts/clinicaltrials-posted-results-evidence-20260822/source

node --test test/outsider-clinicaltrials-posted-results-evidence.test.js
```

Standalone verification is a code-fixed canonical projection and cannot authenticate source bytes. Full verification safely reads the exact six-object data-API source directory with no-follow and stable-stat checks, rebuilds the artifact, and requires canonical equality. Its level is `FULL_EXACT_OFFICIAL_DATA_API_SOURCE_REPLAY_RIGHTS_TERMS_NOT_REPLAYED`; it explicitly does not attest or replay rights pages. The verifier rejects extra source members, symlinks, source substitution, pagination drift, query-window drift, unknown projected fields, non-frozen clocks, coherent rights promotion or other reseals, erased prerequisites, and authority escalation.
