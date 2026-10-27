# Waymo Safety Impact source-aware evidence

This lane treats Waymo's published Rider-Only mileage and SGO-linked outcome experience as real operational data. It does not relabel those records as mere research because Outsider did not collect them. It also does not treat publisher provenance as independent adjudication, loss truth, permission for behavior-model training, or evidence that a target system inherited Waymo's results.

The result is a bounded source-domain outcome/exposure reference for Stage 1/1.5/2 calibration work. It is not an admitted target-domain rate, a prospective holdout, or an automatic model update.

## Official source and frozen profile

- Publisher data hub: <https://waymo.com/safety/impact/>.
- Underlying regulator program context: <https://www.nhtsa.gov/laws-regulations/standing-general-order-crash-reporting>.
- Publisher release date: 2026-06-24.
- CSV1–CSV3 window: through March 2026; CSV4 spatial benchmark inputs: through March 2025.
- Captured objects: data-hub page, four CSVs, and release-notes PDF; 6 objects and 3,309,107 bytes.
- Acquisition manifest SHA-256: `2652bed0585dffb0d3f6b63b7970d83d8b2b4384b5f3fbb74a12cf3a76fc26d2`.
- Source-set hash: `sha256:c51bf261e81088a4faf1ca02736c4d7bb7c562c3573dcc852f80e33a85d35d7f`.
- Canonical artifact: `artifacts/waymo-safety-impact-evidence-20260822/final-v5/evidence.json` (gitignored).
- Artifact hash: `sha256:edccce782d93f0f8f6f01c14f427d44e4137d0b1cf5c040a0c84d0ada9da0a7a`.
- Serialized artifact: 29,849 bytes, SHA-256 `5bbb3c40d373551b5f3eeccc1521bd06c62ec0b46a23c8e0de7dda09313169bd`.

Every source URL, byte count, and SHA-256 pin is frozen in the adapter. The release is a living dataset and remains subject to publisher revision.

## Exposure and outcome accounting

CSV1 publishes 11 geography rows and a displayed all-location point of 220.613 million Rider-Only miles. The eight non-overlapping leaf geography display points sum to the displayed total; San Francisco Bay Area, Atlanta Area, and all-location rows are explicitly treated as overlapping aggregates and are not double-counted.

The three-decimal display has a 1,000-mile resolution, so `220613000` is stored as a displayed-point conversion—not asserted as exact unrounded exposure. The 16 all-location/all-crash CSV3 rates imply exposure within half a display unit of the CSV1 point, but this is marked as a rounding-sensitivity diagnostic rather than a claim about Waymo's unpublished rounding method.

CSV2 contains 1,664 rows: 1,662 SGO-linked rows, two unavailable/pre-SGO rows, and 1,659 unique SGO report IDs. Three duplicate ID+version pairs are quarantined:

- two pairs have conflicting outcome flags;
- one pair has conflicting suppressed location text;
- no raw SGO IDs, exact dates, addresses, or ZIP codes are persisted in the artifact;
- the commitment binds hashed identity/version, amendment, month, state/county, road/crash type, all eight outcome flags, and fingerprints of the suppressed fields;
- row-level outcome memberships are not presented as deduplicated independent crash counts.

The calendar split has 1,390 rows through December 2025 and 274 rows from January through March 2026. Because the split was declared after all outcomes occurred, it is explicitly retrospective—not prospective.

## Publisher anomalies retained rather than repaired

CSV3 contains 2,078 comparison rows. Its literal `NaN` values are parsed as JSON `null` plus separate non-finite counters, never as JavaScript `NaN`:

- `Waymo Percent Reduction CI Upper`: 82;
- `Waymo Rate Ratio CI Upper`: 82;
- total publisher non-finite tokens: 164.

Blank numeric fields are counted separately. Arbitrary tokens such as `Infinity` remain invalid. Waymo and benchmark confidence-interval ordering have independent checks; the frozen release has zero violations in each.

CSV4 contains 17,176 rows and 2,079 distinct S2 cells. At `(state, county, S2 cell, outcome)` granularity it has 16,632 distinct keys, 544 duplicate keys/extra rows, and 489 keys whose duplicate rows disagree on `Benchmark Crash Count`. The remaining 55 duplicate keys repeat the benchmark count. All rows and conflicts are retained; benchmark counts are neither deduplicated nor aggregated. HPMS/Waymo exposure fields have zero conflicting cell keys in this capture. CSV4's March 2025 window remains separate from the March 2026 CSV1–CSV3 window.

## Admission and responsibility boundary

The `calibrationReference` contract admits the exact publisher release only as `ADMIT_BOUNDED_WAYMO_PUBLISHED_REFERENCE_ONLY`. It establishes no target transfer, actual Outsider model calibration, or statistical capability improvement. Public download is not treated as a model-training grant, so the training candidate has zero rows and behavior training remains off.

The lane does not establish independent crash adjudication, fault, causality, economic loss, affected-party receipt/recovery, cross-manufacturer comparability, or matched target-platform/ODD/reporting-regime exposure. It also does not resolve duplicate SGO event units or independently validate Waymo's benchmark/location-adjustment method. `TRAIN`, `PRICE`, `CAPITAL`, `COVERAGE`, and `SETTLE` remain false.

## API and replay

- `buildWaymoSafetyImpactEvidenceFromBytes(files, options)` parses caller-shaped bytes but cannot confer official source status.
- `buildWaymoSafetyImpactEvidenceFromSourceDirectory(directory, options)` requires the exact frozen source profile and pins.
- `verifyWaymoSafetyImpactEvidence(artifact)` accepts only the code-fixed canonical projection and cannot establish source truth, calibration, training admission, or authority. Its recursive shape fingerprint and fixed semantic hash reject added or missing fields, changed source lists, erased prerequisites, and coherently resealed authority-like values.
- `verifyWaymoSafetyImpactEvidenceWithSource(artifact, directory)` internally rebuilds the artifact from pinned bytes and requires canonical exact equality. It can establish exact publisher-source replay and admission as real published operational experience; `underlyingWorldTruthEstablished` remains false.

```sh
node scripts/acquire-waymo-safety-impact-evidence.mjs --import-dir <captures> --out-dir <source>
node scripts/waymo-safety-impact-evidence.mjs build --source <source> --out <artifact.json>
node scripts/waymo-safety-impact-evidence.mjs verify --artifact <artifact.json>
node scripts/waymo-safety-impact-evidence.mjs verify-source --artifact <artifact.json> --source <source>
node --test test/outsider-waymo-safety-impact-evidence.test.js
```
