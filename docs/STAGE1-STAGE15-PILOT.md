# Stage 1 Registry and Stage 1.5 DROID Pilot

Status: implemented evidence path with no pricing, guarantee, settlement, or
production authority. Its physical inputs are empirical observations collected
from real robots. The authority restriction does not make those observations
synthetic; it restricts what Outsider may infer or do with them.

This document describes only the code currently in this repository. Stage 1 admits privacy-minimized Stage 0.5 exports containing individually verified records and receipts into an offline evidence registry. Stage 1.5 admits a strict local projection of the public DROID 100 corpus into quarantined physical-AI clearances. A shadow evidence book can bind both streams without pooling them or using them for training or financial decisions.

## Observed data boundary

The live contribution gateway reported **0 records** at `2026-08-19T16:04:14.421Z`. Nothing below claims external user, customer, production, loss, or exposure data. Unit and integration tests use generated fixtures. The DROID path targets a publicly released real-physical robotics corpus, not customer production data; “publicly released for research” describes its distribution context, not an unreal collection environment.

## Stage 1: Evidence Registry v1

### Flow

1. The gateway exports a non-empty `outsider/quarantine-export/v1` page.
2. `registry import` verifies every contribution record, its server-pinned Ed25519 receipt, the content-addressed ingress entry, receipt retention, and the chain links present in the page.
3. The registry derives one `outsider/evidence-record/v1` per exact D2 group, discloses duplicates under D1, and seals the full state with `registryHash`.
4. The registry may also be signed with an Ed25519 private key. A signed registry must be updated or pruned with the same key.
5. `registry verify` re-derives the state and rechecks retention at the requested use time. `registry report` exposes counts, groups, outcomes, correlation roots, duplicates, tombstones, and claim boundaries.

```bash
outsider registry import quarantine-export.json \
  --state evidence-registry.json \
  --server-public-key gateway-ed25519-public.pem

outsider registry verify --state evidence-registry.json
outsider registry report --state evidence-registry.json
outsider verify evidence-registry.json
```

The import command also accepts optional `--signing-key registry-ed25519-private.pem` and `--registry-id outsider-stage1` flags.

Imports are offline and state-file based. The CLI uses a lock file, refuses a symlink as the registry state target, and replaces the state through a new temporary file. Reimporting the exact same export is idempotent.

### D1: duplicate disclosure

D1 deduplicates by the canonical `contributionRecordHash`. `nCandidates` counts all admitted occurrences; `nUnique` counts distinct records; duplicates remain explicitly listed in each EvidenceRecord and in the registry-wide `duplicateDisclosure`. A duplicate is not silently counted as another successful run.

### D2: exact measurement grouping

Stage 1 never combines records unless all eight instrument fields match exactly:

- `extractorId`
- `productVersion`
- `controllerImplementationHash`
- `hostProtocol`
- `wayHash`
- `claimRefHash`
- `worldRefHash`
- `authorityRefHash`

Each group has its own hash-bound EvidenceRecord. `independenceClaimed` is always `false`; controller, Way, claim, world, authority, gateway-key, and contributor-key roots are retained as correlation roots.

### Signing, retention, and revocation boundary

- Source receipts are verified against the explicitly supplied gateway public key. Optional registry signing protects the derived registry bytes, but the embedded registry key is not automatically trusted by an external policy. Machine output therefore separates `signatureCryptographicallyValid: true` from `signatureTrustedByPolicy: false`.
- Eligibility is time-sensitive: verification rejects an imported payload once its receipt retention window expires.
- Retention cleanup is deliberately manual:

```bash
outsider registry prune-expired \
  --state evidence-registry.json
```

Add `--signing-key registry-ed25519-private.pem` when pruning a signed registry.

If any receipt in an immutable imported page has expired, the command conservatively removes the whole copied page and retains a hash-only retention tombstone. This prevents Outsider from rewriting a source export and presenting the rewritten bytes as the original export.

The current registry does **not** authenticate a complete live gateway membership snapshot and does **not** query revocations after import. Its revocation status is `AS_OF_SOURCE_EXPORT_ONLY`, and its retention mode is `MANUAL_PRUNE_REQUIRED`. Therefore an EvidenceRecord is not standalone proof and is not admissible for pricing.

## Stage 1.5: DROID 100 CURATE pilot

### Acquisition manifest

The adapter accepts a saved GCS object-list JSON and requires the exact `r2d2_faceblur` / `droid_100` v1.0.0 set: `dataset_info.json`, `features.json`, and 31 named TFRecord shards. It binds URI, generation, size, MD5, and CRC32C for every object into domain-separated leaves and a Merkle root. License status is recorded narrowly as declared by the official paper, not verified by GCS object metadata.

```bash
node scripts/stage15-droid100-inspect.mjs \
  --object-list artifacts/curate-droid100-20260819/source/gcs-objects.json

node scripts/stage15-droid100-inspect.mjs \
  --object-list artifacts/curate-droid100-20260819/source/gcs-objects.json \
  --plan
```

These commands perform no network access and download no corpus bytes.

### Real first-shard pilot

The real-pilot command requires local copies of the object list, TFDS descriptors, and the pinned first shard. It verifies the manifest member checksums, descriptor schemas, exact shard size/MD5/CRC32C, TFRecord framing CRCs, and the exact TensorFlow Example feature set. The first shard must decode to exactly two episodes.

```bash
node scripts/stage15-droid100-real-pilot.mjs \
  --output-dir artifacts/curate-droid100-20260820/real-pilot
```

The defaults read from `artifacts/curate-droid100-20260819/source`. Optional overrides are `--object-list`, `--dataset-info`, `--features`, `--shard`, and `--license-id`. The output directory must not already exist. A successful run writes `manifest.json`, `episodes.json`, `clearances.json`, `checkpoint.json`, and `report.json` atomically.

### Privacy projection and instrument D2

Raw JPEGs, language strings, source paths, and collector-identifying metadata may be read locally for validation but are not written into normalized episode or pilot-output artifacts. The normalized projection contains:

- hashed episode, observation, image, and source commitments;
- numeric observation, commanded-action, and recorded-outcome features;
- image format and dimensions, without image bytes;
- explicit `isFirst`, `isLast`, and `isTerminal` boundaries.

A normalized episode needs at least two contiguous steps, and every step must
contain at least one finite numeric observation feature or one image commitment.
A bare self-chosen commitment cannot be counted as a physical episode.

The source shard remains a caller-managed input file; the pilot does not delete it.

Stage 1.5 D2 is the exact four-field instrument identity: `extractorId`, `extractorVersion`, `extractorImplementationHash`, and `featureSchemaHash`. Clearance history rejects a different instrument, and a checkpoint refuses mixed-instrument clearances.

### Clearance, Merkle proof, and causal refusal

Each episode clearance records strict structure, monotonic-time availability, within-episode duplication, cross-episode replay, observation-mean drift, and explicit skipped checks where a platform kinematic model or standardized cross-sensor/energy fields do not exist. Alerts are unlabelled observations; the code claims no precision or recall.

Every DROID episode remains:

- provenance: `historical-public-dataset / declared-unverified`;
- disposition: `QUARANTINED`;
- learning decision: `hold-for-judgment`;
- refusal: `NO_PROSPECTIVE_CAUSAL_DESIGN`;
- causal experience units: **0**.

Clearance hashes are sealed into a domain-separated Merkle checkpoint. The core module can create and verify inclusion proofs, and the checkpoint binds the one allowed instrument. None of these artifacts permits automatic training, PRICE, GUARANTEE, or SETTLE.

## Shared shadow evidence book

The shadow book requires a non-empty, currently valid Stage 1 registry plus a fully reverified CURATE checkpoint, its exact clearances, and their exact source episodes:

```bash
node scripts/stage1-shadow-evidence-book.mjs \
  --registry evidence-registry.json \
  --checkpoint artifacts/curate-droid100-20260820/real-pilot/checkpoint.json \
  --clearances artifacts/curate-droid100-20260820/real-pilot/clearances.json \
  --episodes artifacts/curate-droid100-20260820/real-pilot/episodes.json \
  --out artifacts/shadow-evidence-book.json

outsider verify artifacts/shadow-evidence-book.json
```

The book binds both streams under one source commitment but keeps them separate: coding-agent outcomes and historical robot observations are not pooled into one risk class, no correlation discount is applied, and no independent domain is claimed.

The model entrance is intentionally strict:

- mode: `SHADOW_ONLY`;
- decision: `ABSTAIN_NO_ADMISSIBLE_L3_L4`;
- frozen Outsiderf schema: 36 factors;
- measured factor coverage: **0 of 36**;
- adjudicated loss rows: 0;
- adjudicated exposure rows: 0;
- external holdout rows: 0;
- automatic training: false;
- price, capital, and coverage: null.

The shadow book therefore proves that the two evidence paths can be verified and jointly committed. It does not prove risk, causation, insurability, or production readiness. With the observed live gateway count still at zero, a book built from real external contribution data is not yet available.

## Real-pilot result hashes

These values come from the successful `2026-08-20` run in
`artifacts/curate-droid100-20260820/real-pilot`. The post-write verifier reported
`FULL_SOURCE_REPRODUCED`: it rebuilt the projection from the exact object list,
TFDS descriptors, and whole first-shard bytes before accepting the artifact graph.

| Field | Value |
| --- | --- |
| acquisition `manifestHash` | `sha256:74efe8bbb9a55f00a36344993a223cdcc6af24d6aef7f8f7d32bc3cf2950a107` |
| acquisition Merkle root | `sha256:b2a11a33574cccd841db2c591fa546b91839f03435d33f0c96eb38ee185cba60` |
| first-shard SHA-256 | `sha256:37d04d3586fbde386d14122320d8f7d866b37007ff7a8d96625e72a3994dda70` |
| first-shard MD5 / CRC32C | `IQoCwa04u58UpSOzKsS/6g==` / `zgQNQw==` |
| dataset-info validation hash | `sha256:de61dce13b72b9472a3ce12d49432e4aeace75e6226602a6ef5c8b402c9882a7` |
| feature-schema validation hash | `sha256:5fdfbbdb523b9da84e141222d9195030a24945c316a8d336b91e9ad270f597d0` |
| CURATE instrument hash | `sha256:49018032b0bdecc1b0cb3d729b670f51a85aea0304221647936ad967035b8db6` |
| episode hashes (2) | `sha256:5b32937c6849540b032c699e09b613abe53e33e249aca98c788eac40c4e1afbe`; `sha256:7c839a0989ef6580009e2f7774ac0496d55cc29d2201d6e81a224994ce4065a8` |
| clearance hashes (2) | `sha256:ddf60f5d307a9bcab3e29ff7241f7a063c0933e7ccc7facf8b56b9be95244b8a`; `sha256:529c1bfb18b65cde7e1527f2bf34ad30bbd4cf009c19cb67c0138e33f45b3ae7` |
| checkpoint hash / Merkle root | `sha256:6d9073046f16ecb5d3b042f26280bb65258b07a290141bdff143fb38de076aba` / `sha256:77f67a92c025b2af532dcad8087a75a45f43fe003e0eaed462a48457d30b005e` |
| report hash / artifact-set hash | `sha256:e3af1bd6d8275accbc870ed06123cafd440befacce8457e63da25762b67dee68` / `sha256:4a747e22ef07da81e52c85413af4f21d4969ceadea6007ad3a0af26f2634cdf0` |
| decoded steps / image commitments | `404` / `1,212` |

Both episodes remain quarantined historical observations. The result contains
`causalExperienceUnits: 0` and grants no automatic training or financial authority.
