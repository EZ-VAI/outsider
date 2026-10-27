# BridgeData V2 source-aware training-candidate evidence

This lane treats the captured BridgeData V2 trajectory as real robot experience. It does not downgrade the record because it was published by another lab. Admission depends on byte identity, schema/representation checks, rights boundaries, selection coverage, and target relevance—not on who ran the experiment.

The lane is intentionally narrow. It validates one complete TFRecord selected as the first record of the first training shard. It proves that Outsider can replay and inspect this source shape; it does not prove that the sample represents the corpus or that any model became more capable.

## Official source and frozen profile

- Publisher: UC Berkeley Robotic AI & Learning Lab.
- Project and license page: <https://rail-berkeley.github.io/bridgedata/>
- TFDS 1.0.0 directory: <https://rail.eecs.berkeley.edu/datasets/bridge_release/data/tfds/bridge_dataset/1.0.0/>
- Captured objects: 9 objects, 3,477,496 bytes.
- Acquisition manifest SHA-256: `a8d71e781fc27120619049c19cc37fd46867aba70e097a05fb5c88a67263dc44`.
- Source-set hash: `sha256:546495e05d3777562bd8dd9f70325bd4e4e1b07778ac8324178e629a36e6ef4d`.
- Parent shard: 108,381,239 bytes; captured HTTP range `bytes=0-3092033`.
- Captured record: 3,092,034 framed bytes; 3,092,018 payload bytes; both TFRecord CRC32C fields verified.
- Canonical artifact: `artifacts/bridgedata-v2-training-evidence-20260822/final-v5/evidence.json` (gitignored).
- Artifact hash: `sha256:1db2d9b893cdb6cfc604154a787d70092b5a6c03d2122f2b81f56fa9e79e97c2`.
- Serialized artifact: 36,204 bytes, SHA-256 `c5eaba1e0e910733ab6fad1007d90839762a6e8ae97ee68e9ddeb4266da5f25f`.

The checked-in frozen profile contains every URL, byte count, and SHA-256 pin. The acquisition CLI imports already captured HTTPS bytes into an exact source directory; it does not claim transport attestation.

## What the replay establishes

The project page describes 60,096 trajectories: 50,365 teleoperated demonstrations and 9,731 scripted rollouts, across 24 environments and 13 skills, on a WidowX 250 at 5 Hz. TFDS metadata instead accounts for 60,064 examples: 53,192 training examples in 1,024 shards and 6,872 validation examples in 128 shards. The unexplained difference of 32 is preserved.

The selected record has 28 timesteps. Its 20 TF Example feature keys exactly match `features.json`. The replay additionally checks declared dtype, shape, and encoding against the actual Example representation:

- action: 28 × 7 = 196 finite float32 values;
- state: 28 × 7 = 196 finite float32 values;
- language embedding: 28 × 512 = 14,336 finite float32 values;
- reward, discount, and boundary flags: one value per timestep;
- four image streams: 28 JPEG values each, every JPEG header reporting 256 × 256 × 3;
- declared boolean fields: only 0/1 values in the sample.

These are sample-level structural and representation checks. Full-corpus schema conformance and the semantic language-action-observation contract remain false.

## Training-candidate contract

The project page's statement that all data is under CC BY 4.0 is byte-pinned. Attribution and indication-of-change obligations are explicit. Legal review, record-level third-party-content review, and final production-training-right adjudication remain incomplete.

The machine-readable `trainingCandidate` contract therefore returns `HOLD_FOR_SEMANTIC_CONTENT_AND_GOVERNANCE_REVIEW`. It exposes one candidate whole record but enqueues zero trainer rows. `TRAIN`, `PRICE`, `CAPITAL`, `COVERAGE`, and `SETTLE` all remain false.

Before trainer admission, the contract requires resolution of the 32-record count discrepancy; action/state description-versus-shape contradictions; record-level dummy/missing values; correlation groups; teleoperated-versus-scripted provenance; failure/negative-example policy; attribution and third-party-content review; and a target-robot holdout/transfer gate.

## Selection and quality boundaries

- Coverage is one of 52 records in the parent shard and one of 53,192 TFDS training examples.
- Zero complete train shards and zero validation records were captured.
- Selection was not random, and representativeness is not established.
- The project mentions RGBD, while the captured TFDS schema exposes no depth feature.
- The TFDS description and citation contain `TODO(example_dataset)` placeholders.
- `features.json` declares seven action/state dimensions while its prose descriptions enumerate ten components; both contradictions are retained.
- No per-record failure/negative-outcome label, temporal split, prospective holdout, target transfer, or statistical capability improvement is established.

Machine-readable deferrals also retain why Open X-Embodiment, Waymo Open Dataset, and NASA ASRS/UAS were not silently promoted into this lane: component-level rights, non-commercial/unlabeled-mode constraints, or self-selection/validation/denominator limits require separate handling.

## API and replay

- `buildBridgeDataV2TrainingEvidenceFromBytes(files, options)` parses caller-shaped bytes without allowing them to self-attest official source status.
- `buildBridgeDataV2TrainingEvidenceFromSourceDirectory(directory, options)` requires the exact frozen directory profile and byte pins.
- `verifyBridgeDataV2TrainingEvidence(artifact)` accepts only the code-fixed canonical projection and establishes neither source admission nor training authority. Its recursive shape fingerprint and fixed semantic hash reject added or missing fields, changed source lists, erased prerequisites, and coherently resealed authority-like values.
- `verifyBridgeDataV2TrainingEvidenceWithSource(artifact, directory)` rebuilds internally from pinned source bytes and requires canonical exact equality. It can establish exact publisher-source replay and admission as real published robot experience; `underlyingWorldTruthEstablished` remains false.

```sh
node scripts/acquire-bridgedata-v2-training-evidence.mjs --import-dir <captures> --out-dir <source>
node scripts/bridgedata-v2-training-evidence.mjs build --source <source> --out <artifact.json>
node scripts/bridgedata-v2-training-evidence.mjs verify --artifact <artifact.json>
node scripts/bridgedata-v2-training-evidence.mjs verify-source --artifact <artifact.json> --source <source>
node --test test/outsider-bridgedata-v2-training-evidence.test.js
```
