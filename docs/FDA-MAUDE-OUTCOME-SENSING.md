# FDA MAUDE outcome sensing

This lane admits a frozen slice of real FDA passive-surveillance reports into Stage 1.5 outcome sensing and Stage 2 device/consequence correlation. It does **not** call an MDR row an incident, an independently observed outcome, device causality, an adjudicated loss, or exposure.

## Frozen scope

The 2026-08-21 snapshot contains FDA's current monthly **add** and **change** streams, not the full MAUDE historical population. It intentionally excludes narrative, patient, and problem-code files. The two pinned FDA pages establish the file meanings, linking key, privacy treatment, and the publisher's limitations.

| Local source | Bytes | SHA-256 |
| --- | ---: | --- |
| `mdr-data-files-20260821.html` | 86,238 | `d398fd3db492484ae5c126fba1586a17ed951e7e2230778a9cdcee45707e5d8c` |
| `maude-about-20260821.html` | 56,703 | `0b7c74c3926e2dd557095a8eb4bd1aaa91ca310d933584a0af45dfff75ebcee4` |
| `mdrfoiadd.zip` | 11,548,269 | `1f0525ac706e741e5951948e9ca5946829d7c5ac66321a4588f541b02c9325fb` |
| `mdrfoichange.zip` | 30,078,879 | `6e3657c226494941f76bbea76a82ed3a71bd7aaf3fd5b8cd1c4bdb1686ef07e0` |
| `deviceadd.zip` | 11,624,514 | `c5f2e20160e3362589f05b0cc51d21d6c117e4e3c5b9801197934348e08b8a51` |
| `devicechange.zip` | 29,192,523 | `b50911a00c2efa9ad16aefc5096b6de422dcce99b8f7d25df559bb1872976fbd` |

Total frozen source bytes: **82,587,126**. The official URLs are pinned in `FDA_MAUDE_FROZEN_SOURCE_20260821`.

The publisher's webpage numbers are mutable and described as approximate. Outsider therefore reports counts reparsed from the exact ZIP bytes. Some records contain physical newlines inside fields; the parser preserves the newline and reconstructs a logical row only when it reaches the exact 86-column base or 34-column device delimiter boundary, then validates ZIP entry size and CRC. Base add/change contain 49/121 such logical rows; device add/change contain 1/6. There are exactly as many extra physical lines, so no record contains more than one embedded physical newline. The adapter never treats physical line count as record count and never silently trims or space-normalizes the affected field.

## Exact result

The logical source counts are:

| Stream | Rows | Unique primary keys | Within-stream duplicate keys |
| --- | ---: | ---: | ---: |
| Base add | 344,157 | 344,157 | 0 |
| Base change | 771,511 | 771,511 | 0 |
| Device add | 344,154 | 344,154 | 0 |
| Device change | 771,545 | 771,545 | 0 |

For base records, 336,371 `MDR_REPORT_KEY` values occur in both streams. The change stream has publisher-declared precedence; 38 of those pairs differ in content. The resulting projection has **779,297 MDR report keys**. The raw file exposes no numeric version column, so the adapter does not invent one. It retains `TYPE_OF_REPORT`, supplement-date fields, and `DATE_CHANGED` as available revision evidence: **231,310** effective reports have follow-up/supplement evidence.

The reported event-type categories are D 3,405; IN 222,744; M 552,845; O 303. These are submitter/FDA report categories, not verified causal outcomes. Reporter-source codes are M 751,169; D 25,397; P 2,010; U 721. The manufacturer-link flag is Y on 751,170 effective reports.

Important duplicate and missingness boundaries:

- All 779,297 effective rows lack `EVENT_KEY` in these streams. Cross-reporter event deduplication is therefore not possible with that root.
- 779,297 rows have a report number, but only 737,976 distinct values; 5,613 distinct values repeat. The adapter preserves this warning and does not collapse them into incidents.
- 1,465 rows are summary reports. `NOE_SUMMARIZED` is present on all 1,465, but those amounts are not added to row counts or used as an event denominator.
- 41,813 rows lack event date; 46,816 lack report date.
- `NUMBER_DEVICES_IN_EVENT` and `NUMBER_PATIENTS_IN_EVENT` are blank on all 779,297 effective base rows in this snapshot.

The device join yields **1,115,698** effective device rows, all linked to an effective MDR key; 779,294 reports have at least one device row and 336,400 have multiple device rows. Device stream identity is the tuple `(MDR_REPORT_KEY, DEVICE_EVENT_KEY-or-missing, DEVICE_SEQUENCE_NO-or-missing)`. Neither stream contains a within-stream composite collision, and no row lacks both secondary roots. Exactly one composite occurs in both add and change; its content is identical, so the union removes one exact overlap and records zero changed-content collisions. Product code is present on all device rows; UDI-DI is present on 748,493 and UDI-Public on 678,738. Manufacturer-evaluation values are Y 378,506, N 499,354, other/missing 237,838. “Evaluated by manufacturer” is explicitly not “independently observed.”

AccessGUDID was not replayed. A daily delta is not treated as a complete device population. Until an exact full AccessGUDID release and its official checksum are pinned, device identity remains unresolved beyond MAUDE's own roots.

## Source trust and API

- `buildFdaMaudeOutcomeSensingFromBytes(files, { generatedAt })` computes all commitments from bytes. Nonmatching inputs are explicitly caller-provided fixtures with null publisher, no rights, and no admission.
- `buildFdaMaudeOutcomeSensingFromSourceDirectory(directory, { generatedAt })` accepts only the exact six filenames, rejects symlinks and extra files, uses `O_NOFOLLOW`, and compares inode/size/timestamps before and after each read.
- `verifyFdaMaudeOutcomeSensing(artifact)` checks exact structure, self-hash, ontology, rights, readiness, and false authority. It always returns `STRUCTURE_ONLY`, `sourceArtifactsReverified=false`, and `decision=null`.
- `verifyFdaMaudeOutcomeSensingWithSource(artifact, directory)` re-reads and reparses all six source files, rebuilds the artifact, exact-compares it, and only then returns `FULL_OFFICIAL_FDA_MAUDE_SOURCE_REPLAYED`.

There are no verifier callbacks, caller verification booleans, source-hash overrides, or caller-mintable full-source results. `PRICE`, `GUARANTEE`, `SETTLE`, `TRAIN`, `CLOSE`, and `EXECUTE` remain false.

## Privacy and rights

FDA states that public records receive FOIA/Privacy Act redactions, but some demographics remain releasable. Outsider applies an additional minimization layer: it acquires no narrative or patient table and projects no raw MDR key, name, address, phone, manufacturer contact, or raw UDI. The 32 deterministic case projections use domain hashes plus non-personal report categories and bounded product-code roots. Those hashes are explicitly **pseudonymous and potentially linkable**, not anonymous: the public hash domain and low-entropy sequential MDR keys can be enumerated offline. They therefore cannot satisfy a verified privacy gate for training.

Official public download and exact source replay are established. Raw redistribution, commercial use, automatic training rights, and a legal conclusion are **not** established. Permitted use is therefore bounded to descriptive source replay and shadow outcome sensing.

## Artifact and operation

Canonical local artifact:

- `artifacts/fda-maude-outcome-sensing-20260821/final-v2/outcome-sensing.json`
- artifact hash: `sha256:450da676c54f9e8781cff0589618e5f8fbbbf66286c0b38316ae4eb95f643c73`
- file bytes: 21,368
- file SHA-256: `21478252c218b2732417ab5a1c8b554198c8d52b5b8b6cbdd259d3fb2a164cd5`

`final-v1` is superseded because it described deterministic case fingerprints
without explicitly recording their offline linkability.

```sh
node scripts/acquire-fda-maude-outcome-sensing.mjs --out-dir artifacts/fda-maude-outcome-sensing-20260821/source
node scripts/fda-maude-outcome-sensing.mjs build \
  --source-dir artifacts/fda-maude-outcome-sensing-20260821/source \
  --out artifacts/fda-maude-outcome-sensing-20260821/final-v2/outcome-sensing.json
node scripts/fda-maude-outcome-sensing.mjs verify \
  --artifact artifacts/fda-maude-outcome-sensing-20260821/final-v2/outcome-sensing.json \
  --source-dir artifacts/fda-maude-outcome-sensing-20260821/source
```

## What progressed and what did not

Stage 1.5 gained a real, revision-aware passive-surveillance report sensor. Stage 2 gained reported consequence categories and device correlation roots. No external readiness gap closed: underreporting, report error, multiple-reporter duplication, absent device-use exposure, unverified causality, and no adjudicated loss still block incidence, trend, cross-device comparisons, frequency/severity calibration, pricing, guarantees, training, settlement, or execution.
