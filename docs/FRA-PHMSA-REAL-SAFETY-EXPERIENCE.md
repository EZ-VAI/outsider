# FRA / PHMSA real safety experience

This wave admits one bounded FRA source-domain diagnostic and preserves one
real PHMSA incident snapshot as a machine-deferred receipt. The distinction is
about fitness for a use, not about whether public data is "only research."

The FRA and PHMSA records describe real-world reports submitted by regulated
operators and published by federal agencies. Their public origin does not
demote them. Outsider's act of freezing them also does not turn reported cause
codes into adjudicated causality, reported damage into paid loss, or a source
snapshot into authority to train, price, guarantee, settle, or assume
liability.

## Frozen result

- Source directory: `artifacts/fra-phmsa-safety-20260821/source-v2`
- Canonical artifact:
  `artifacts/fra-phmsa-safety-20260821/final-v2/evidence.json`
- Official objects: 12
- Canonical FRA query-response receipts: 7
- Pinned source bytes: 2,400,987
- Source-set hash:
  `sha256:ee6c751b15db415b08b5eddb481a59ed4ca0f33ab6c2a44cd911743654f79f56`
- Acquisition-manifest hash:
  `sha256:322b8a8446bbffb738edb102a02b03bd722624d84e695d23b56366cfef978e52`
- Artifact semantic hash:
  `sha256:faf6c83de86433ad2e97abfb63fca2a1b6045692acd39a8ff56916fcd9082836`
- Serialized artifact hash:
  `sha256:97326061fffefe20cb06c6640ea0f1c28e55a2edc2cd8a211ecb8dd1db4ba7ff`
- Verification level:
  `FULL_OFFICIAL_FRA_PHMSA_SOURCE_REPLAYED`

The earlier `source/` and `final-v1/evidence.json` bytes are preserved for
audit, but are not canonical: that profile did not bind five derived FRA
responses to their complete SoQL. Their adjacent machine-readable
supersession pointers direct consumers to `source-v2/` and
`final-v2/evidence.json`. A pointer never re-verifies source bytes.

Raw objects and the generated artifact are gitignored. No accident narrative,
street address, individual identity, operator row, or operator identifier is
embedded in source code, tests, documentation, or the canonical aggregate
artifact.

## Canonical FRA query chain

The v2 source profile does not use descriptive `bounded-query` labels. Every
aggregate response is bound to its real Socrata dataset ID, the full canonical
SoQL text, a SHA-256 of that text, the exact ordered response schema, the full
API URL, and the response byte count and SHA-256. These bindings appear in the
tracked module, the ignored acquisition manifest, the artifact source
projection, and the source-set hash.

| response receipt | dataset | bounded computation | bytes | canonical SoQL hash |
|---|---:|---|---:|---|
| `fra54-canonical-count.json` | `85tf-25kj` | selected rows, distinct incidents, `JOINTCD` and year completeness | 108 | `cb9770f317d250ed818ba75becc746f87dc40c104bd452b745601971ed1e949c` |
| `fra54-canonical-annual.json` | `85tf-25kj` | annual outcomes and observed-field counts | 1,811 | `03fc841bb03f67913c9c52347a9e3553c0784ae130ea0ced0d2f4651d19cd8e7` |
| `fra54-canonical-cause-type.json` | `85tf-25kj` | annual cause/type cells with explicit unreported coalescing | 208,555 | `826773b5542ae305645c77119d8cdeceee9319e88a06790cc4a1c8454bc8e796` |
| `fra55-canonical-count.json` | `m8i6-zdsy` | published rows, year and total-mile completeness | 83 | `bb6a8e3532a70930d8b1591ab646d55797953e2c91e6d25e380855b3327ad423` |
| `fra55-canonical-annual.json` | `m8i6-zdsy` | annual operational denominators and observed-field counts | 2,646 | `ae6d65c5e026a44a92a16f53ac885ca757ce8a753dcc6e98df95f404b9d1177f` |
| `fra55-canonical-duplicate-groups.json` | `m8i6-zdsy` | duplicate composite-key group count | 87 | `88a22e1fec6fc4a0e12ee232fd10fa53e00a1dd2df4a84bf75625114c85267be` |
| `fra55-canonical-duplicate-metrics.json` | `m8i6-zdsy` | privacy-safe identical-metric projection for correction | 282 | `d37129472472b2a0166dc775095867d9fd275ea69047ae7cdfb0aacbfdba88dd` |

The loader verifies every response row against its pinned aliases before use.
It then independently reconciles the bounded count response to the annual
rows, the cause/type total to the Form 54 selected population, observed-field
counts to their annual population, the Form 55 train-mile components to total
miles, the duplicate-group response to the privacy-safe metric response, and
all emitted annual and pooled ratios. This is a reconstruction from official
aggregate API response bytes; the full underlying FRA row population was not
downloaded in this wave.

The captured HTTPS transport itself is not independently attested. The
artifact therefore says `transportAttested: false`, even when byte pins,
dataset metadata, exact query receipts, response schemas, and local aggregate
reconstruction all pass. Full replay proves the pinned computation chain, not
that a separate witness observed the original transport.

## FRA: admitted source-domain outcome/exposure diagnostic

The bounded period is 2015 through 2019. It was chosen so that all five years
were outside the FRA portal's stated five-year routine edit window at the 2026
freeze. This does not mean later correction is impossible; the artifact is an
exact as-captured snapshot, not a publisher-issued immutable release.

The outcome side comes from FRA Form 6180.54. FRA explains that multiple
railroads can file reports for one accident and that the full dataset must not
be counted as one row per accident. This adapter therefore uses the published
`JOINTCD=1` representative-record rule and independently verifies that the
10,449 selected rows equal 10,449 distinct incident keys. The official unique
accident view was not silently substituted: at freeze time it returned a
schema-drift error, which is byte-pinned and recorded as
`DEFERRED_UPSTREAM_SCHEMA_DRIFT`.

The exposure side comes from FRA Form 6180.55 monthly operational reports. The
48,843 published rows contain train miles, employee hours, passenger miles,
and passengers transported. A composite railroad-year-month audit found one
duplicate group. Its two selected metric projections were exactly equal, so
one duplicate projection was removed. No operator value is emitted. Component
train miles reconcile exactly to total train miles after that removal.

The five-year aggregate is:

- 10,449 unique reported Form 54 incidents;
- 3,529,396,874 deduplicated Form 55 train miles;
- 2,207,526,721 employee hours;
- 213 official fatality counts and 2,277 official injury counts from the FRA
  fields specified for unique-accident summation;
- $1,573,388,754 in reported accident damage cost;
- 2.960562491 reported incidents per million train miles; and
- $0.445795361 reported accident damage per train mile.

Those last two values are source-domain descriptive ratios. They are not a
target quote, expected claim frequency, actuarial indication, paid-loss ratio,
causal effect, or permission to pool an Outsider target with the railroad
population. Form 54 publication is also conditioned on the applicable annual
reporting threshold, so this is not a census of every railroad mishap.

The cause/type cells are retained only as operator-reported representative
record classifications. Agency publication is true; independent review of
every underlying fact, causal adjudication, and legal adjudication are all
false.

Official FRA references:

- [FRA Safety Data](https://railroads.dot.gov/safety-data)
- [Form 54 data-download explanation](https://data.transportation.gov/stories/s/Form-54-Data-Downloads/pk4v-772c/)
- [Form 54 full dataset](https://data.transportation.gov/Railroads/Rail-Equipment-Accident-Incident-Data/85tf-25kj)
- [Form 55 data-download explanation](https://data.transportation.gov/stories/s/vfi4-ceay)
- [Form 55 operational dataset](https://data.transportation.gov/Railroads/Injury-Illness-Summary-Operational-Data/m8i6-zdsy)
- [Operational-data description](https://data.transportation.gov/stories/s/Operational-Data-Reports-Landing-Page/jufd-yprb/)

## PHMSA: real receipt, model-input defer

The exact PHMSA gas-distribution incident ZIP is real operator-submitted,
agency-published experience:

- ZIP bytes: 1,599,619
- ZIP SHA-256:
  `5850554f7498e5fb6faf97274416f06c8305a48e0689845ae29b898a7e747426`
- schema member: Form PHMSA F 7100.1 revision 9-2023 PDF;
- data member: 4,395,199 bytes, 468 columns, 1,589 reported rows;
- observed report years: 2010 through 2026; and
- original, original-final, supplemental, and supplemental-final statuses are
  counted separately.

This wave did not obtain a matching exact PHMSA annual-report mileage/facility
ZIP. The current-file endpoint is mutable, a publisher version identifier was
not pinned, and a PHMSA reuse/training-rights instrument was not byte-pinned.
Consequently the receipt remains
`DEFERRED_MISSING_MATCHED_ANNUAL_EXPOSURE_RIGHTS_AND_VERSION_BINDING`.
No PHMSA frequency, severity, exposure/loss link, cause model, training input,
or price factor is emitted. A real source remains real even when a particular
use is deferred.

Official PHMSA references:

- [PHMSA source data](https://www.phmsa.dot.gov/data-and-statistics/pipeline/source-data)
- [PHMSA incident/accident downloads](https://www.phmsa.dot.gov/data-and-statistics/pipeline/distribution-transmission-gathering-lng-and-liquid-accident-and-incident-data)
- [PHMSA annual-report downloads](https://www.phmsa.dot.gov/data-and-statistics/pipeline/gas-distribution-gas-gathering-gas-transmission-hazardous-liquids)
- [PHMSA national performance-measure boundaries](https://www.phmsa.dot.gov/data-and-statistics/pipeline/national-pipeline-performance-measures)

## Rebuild and verification

The acquisition command imports only already captured files that match every
frozen byte count and SHA-256 pin. It will not replace a missing PHMSA annual
denominator with a webpage rate or a changed current-file download.

```sh
node scripts/acquire-fra-phmsa-safety-evidence.mjs \
  --out-dir artifacts/fra-phmsa-safety-20260821/source-v2 \
  --fra-dir <exact-fra-staging> \
  --phmsa-dir <exact-browser-download-dir>

node scripts/fra-phmsa-safety-evidence.mjs build \
  --source artifacts/fra-phmsa-safety-20260821/source-v2 \
  --out artifacts/fra-phmsa-safety-20260821/final-v2/evidence.json

node scripts/fra-phmsa-safety-evidence.mjs verify-source \
  --artifact artifacts/fra-phmsa-safety-20260821/final-v2/evidence.json \
  --source artifacts/fra-phmsa-safety-20260821/source-v2

node --test test/outsider-fra-phmsa-safety-evidence.test.js
```

Standalone verification is deliberately `STRUCTURE_ONLY`. Only source-aware
verification can reproduce the official byte profile, ZIP members, schemas,
canonical query chain, response aliases, population counts, deduplication,
derivations, and exact candidate artifact.
Even a successful full replay establishes neither every underlying fact nor
institutional authority.
