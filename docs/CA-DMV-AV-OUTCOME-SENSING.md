# California DMV AV outcome and exposure sensing

This lane binds real California DMV autonomous-vehicle regulatory documents, permit snapshots, legacy aggregate mileage, reporting templates, and four DMV-hosted collision forms. It keeps the central distinction explicit: a collision form is a **manufacturer-submitted regulatory report**, not an independent observation, causal finding, or adjudicated loss.

## Frozen scope

Fourteen official first-party DMV files total **3,687,679 bytes**:

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| Permit-holder snapshot | 90,872 | `c7f4f42359445bbf98a9cd29965125a8790199d9f3b1218aa21b2111d6bbf1c1` |
| Regulations index | 91,302 | `bfa3aca6256b095cbcac8c929cb9f00cab78e1c54c3d7aaf62d31bdd2929d0ff` |
| Incident-reporting index | 79,070 | `06a4a60f27ee51c9d8260c1107adf01f18c780cec28cc66ab31cfcd909faf2ef` |
| Permit-resource index | 81,537 | `c9e6b44d0e409f9facac3ffd80ff3a837e5131e858800b8a56222c38f0422773` |
| 2022-23 exact-mileage release | 75,087 | `6577c41b71d11a4d9e5ca0e92ebad1a62898a936c226da4699280a6e097ec7da` |
| 2023-24 exact-mileage release | 73,358 | `fd1c54f8ad614e4e284acf7772b5ce771f5e099c6ff5ff44e0c473cd05796e8e` |
| 2024-25 lower-bound-mileage release | 88,035 | `1dfe314f08d5e26687c6f2cb3534ac923ad4677092e8d71fc4712e9f38386b33` |
| AVIM 2026-001A reporting memo | 221,264 | `e10b48066ce9bdf918894f836517149b99c8af39b619b253ff5b812324f91943` |
| Collision CSV template | 250,462 | `3532bbc2baf8aa581bc3b1f6829840943375bba7aebf65c5d1a5870c868de989` |
| VMT CSV template | 146,013 | `484dc2d3bf3538bbc5bd70290db908c55afcf56154de129e5ffcea319ad05e47` |
| Waymo 2025-05 collision form | 672,031 | `936029b843083a7081d29a5b35191f0ca2a0b0a92b5f135b76de6f51a2de2b9c` |
| Nuro 2026-04 collision form | 793,505 | `b2def9f994f78f545015fe0b2c8e794bdc192075348f923297621a93159655c7` |
| Zoox 2022-03 collision form | 513,422 | `fd05b90d231337e78dbd8410f7dc2addf367afc452783fa11ec7961c95db7993` |
| Mercedes-Benz 2023-05 collision form | 511,721 | `ccd169e6d2f92e8ba939a4e8ee2d20d91fb98f49b7788df27ea309fe6c5c7c29` |

The official URLs and exact local filenames are in `CA_DMV_AV_FROZEN_SOURCE_20260821`.

## Reporting-regime boundary

The legacy annual disengagement regime covers public-road testing and excludes private roads, out-of-state testing, systems below SAE Level 3, simulation, and deployment disengagements. DMV says those reports are not designed for company comparison.

AVIM 2026-001A establishes the enhanced regime:

- effective April 28, 2026;
- collision reporting begins immediately;
- monthly CSV reporting begins August 26, 2026;
- the first quarterly report is due no later than September 30, 2026.

The snapshot date is August 21, 2026. Therefore the honest new-regime observation is **zero monthly CSV rows and zero quarterly CSV rows**. The collision and VMT templates are requirements/schema roots, not observations. The adapter never fills the pre-deadline gap with synthetic data.

Legacy and enhanced records cannot be naively pooled: coverage, cadence, fields, permit categories, revision handling, and denominator scope changed.

## Permit and exposure evidence

The exact official permit page yields:

- 28 testing-with-driver entities as of August 12, 2026;
- 6 driverless-testing entities, updated April 3, 2026;
- 3 deployment entities as of November 21, 2025.

These are authorization snapshots, not active-vehicle, time-at-risk, trip, or mileage denominators.

The legacy 2022-12-01 through 2023-11-30 release reports exactly 9,068,861 autonomous public-road test miles: 5,801,069 with a safety driver and 3,267,792 driverless. The next exact cohort, 2023-12-01 through 2024-11-30, reports 4,498,066 miles: 3,945,171 with a safety driver and 552,895 driverless. The 2024-12-01 through 2025-11-30 release publishes only “more than 9 million” miles, represented as an exclusive lower bound rather than the exact integer 9,000,000. No cohort includes all operating contexts or is matched to the four collision documents. No collision or disengagement rate is calculated.

## Collision cases are correctly named

The four PDFs form a `CURATOR_FIXED_NONPROBABILITY_SAMPLE`, not a population. The pinned official pages do not supply a complete, versioned document manifest, so completeness, withdrawals, corrections, and cross-report duplicates cannot be established.

Every projected case is labeled:

- manufacturer-submitted collision report;
- hosted by California DMV;
- legacy OL 316 revision 7/2020;
- not independently observed;
- no causal adjudication;
- no observed loss amount;
- no population-frequency or manufacturer-comparison support.

The neutral quality gate deliberately quarantines narrative-derived mode, injury, responsibility, and severity fields until a source-complete manifest and a deterministic parser can apply the same rule to every report. It does not grant more trust to a report because of the reporting company or the government host.

## Privacy and rights

The raw forms contain fields for names, addresses, phone numbers, VINs, plates, exact location, witnesses, and narratives. Local source files are mode `0600` and gitignored. The artifact republishes none of those fields; it retains public regulated-organization names, month-level report time, form revision, and a document-hash-derived case fingerprint.

Official public access and exact byte replay are established. Raw redistribution, commercial use, automatic training rights, and a legal conclusion are not. The admitted use is descriptive source replay plus shadow outcome/exposure sensing.

## Source trust and API

- `buildCaDmvAvOutcomeSensingFromBytes(files, { generatedAt })` derives commitments from bytes. A nonmatching input is a fixture with null publisher and no admission.
- `buildCaDmvAvOutcomeSensingFromSourceDirectory(directory, { generatedAt })` requires the exact 14-file profile, rejects symlinks/extra files, uses `O_NOFOLLOW`, and checks inode/size/timestamps before and after each read.
- `verifyCaDmvAvOutcomeSensing(artifact)` is structure/self-hash only and always returns `sourceArtifactsReverified=false`, `decision=null`.
- `verifyCaDmvAvOutcomeSensingWithSource(artifact, directory)` re-reads every source, rebuilds, exact-compares, and only then returns `FULL_OFFICIAL_CA_DMV_AV_SOURCE_REPLAYED`.

Human-reviewed PDF transcription is bound to exact official byte hashes and is declared as such; it is not represented as machine-reparsed PDF semantics. No callbacks, caller truth flags, hash overrides, or standalone full-source claims exist. `PRICE`, `GUARANTEE`, `SETTLE`, `TRAIN`, `CLOSE`, and `EXECUTE` are fixed false.

## Artifact and operation

Canonical local artifact:

- `artifacts/ca-dmv-av-outcome-sensing-20260821/final-v3/outcome-sensing.json`
- artifact hash: `sha256:1894ff1026062b9459cd532a3f75c49c8544d8e87c7aec3e76cfb01389e79138`
- file bytes: 14,355
- file SHA-256: `ecaab3ebfe7b4989c7c587f4506605f1920bcbacf6da6bfcd3d1b803fd14c5cd`

`final-v1` and `final-v2` are not canonical. Machine-readable supersession
markers point consumers to `final-v3`: `final-v2` added the official 2023-24
exact-mileage release; `final-v3` additionally machine-checks every transcribed
permit-holder fragment and table row count against the pinned HTML.

```sh
node scripts/acquire-ca-dmv-av-outcome-sensing.mjs --out-dir artifacts/ca-dmv-av-outcome-sensing-20260821/source
node scripts/ca-dmv-av-outcome-sensing.mjs build \
  --source-dir artifacts/ca-dmv-av-outcome-sensing-20260821/source \
  --out artifacts/ca-dmv-av-outcome-sensing-20260821/final-v3/outcome-sensing.json
node scripts/ca-dmv-av-outcome-sensing.mjs verify \
  --artifact artifacts/ca-dmv-av-outcome-sensing-20260821/final-v3/outcome-sensing.json \
  --source-dir artifacts/ca-dmv-av-outcome-sensing-20260821/source
```

## Snapshot-diff next actions

On or after August 26, discover and pin the first official monthly CSV only if DMV publishes it, then require an official manifest, schema hash, `REPORT_ID`/`REPORT_VERSION` deduplication, and late/revision policy. On or after September 30, do the same for quarterly VMT and other reports, preserving permit-type cohort and denominator scope. Until an official collision manifest exists, keep the four PDFs a nonprobability source sample.

Stage 1.5 gained real regulatory case sensing and a regime-aware outcome schema. Stage 2 gained real aggregate public-road test miles plus permit/ODD roots. No causal, rate, severity, loss, pricing, guarantee, training, settlement, or execution readiness gap closed.
