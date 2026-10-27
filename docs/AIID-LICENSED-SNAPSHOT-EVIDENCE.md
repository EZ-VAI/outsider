# AIID licensed snapshot evidence

## Outcome

This lane replays a complete official AI Incident Database (AIID) MongoDB
snapshot while extracting and parsing only four terms-licensed collections:
`incidents`, `taxa`, `classifications`, and `entities`.  The archive's
`reports` and `submissions` collections and CSV files are never requested from
`tar`, extracted, parsed, or retained.

AIID publishes weekly point-in-time database snapshots in MongoDB, JSON and CSV
formats on its [official snapshots page](https://incidentdatabase.ai/research/snapshots/).
The [official Terms of Use](https://incidentdatabase.ai/terms-of-use/) (effective
2025-08-07) name the four admitted collections under CC BY-SA 4.0 and expressly
exclude `submissions`, `reports.text`, and content outside the snapshots.  The
terms also warn that third-party content must not be assumed factually correct,
reviewed, approved, or endorsed.  The adapter therefore treats these records as
publisher-curated alleged incidents and reviewer taxonomies—not independent
observation, adjudication, causation, loss, recovery, closure, or a denominator.

These are reports about real-world environments, not synthetic research
fixtures.  `DESCRIPTIVE` is an authority ceiling on what Outsider may infer; it
does not erase their real-world origin.

## Frozen source and artifact

Canonical local files are selected only through
`artifacts/reality-consequence-aiid-20260817/artifact-index.json`.

| Object | Bytes | SHA-256 |
|---|---:|---|
| Official `backup-20260817101120.tar.bz2` | 108,531,086 | `77d0971443e3e100fc0a79662a57fdf3cfbbd6a4fcea74ee6e6155e0ea4b7913` |
| Official Terms capture `terms-of-use-20260821.html` | 344,822 | `661559de6390ffe0103d498ce99cf11bcad456df63c1b972bb917845174dbf92` |
| Canonical `evidence-book-v1-canonical-p1-origin.json` | 31,334,808 | `deb4790a72a784307935d654ff6fff3706231bb6623fd8b8c9bd9bfb740e2d01` |

Machine commitments:

```text
artifactHash:         sha256:0d884cc2ecd2838424f38e7ab28f3107d82ef5bdcf5152acfb7392327563c304
sourceCommitmentHash: sha256:f297fa30a8cf01cb04a9965e920d1f0c8f345504e4eb859ec8d283dc7ff2db27
```

The prior `evidence-book-v1-canonical.json` is machine-marked `SUPERSEDED` in
the local index.  Consumers must select only the indexed canonical artifact.

The admitted BSON members are independently pinned:

| Collection | BSON bytes | BSON SHA-256 |
|---|---:|---|
| `incidents` | 18,660,922 | `cf39eb9c21fabf1943dd790a6c81def607c9e09021adabfd24c0843b3fb9dbc7` |
| `taxa` | 302,256 | `cfbd9db41f894405c756447a5f03f0fc07845d22fa94219c397b6329eb9e7ee8` |
| `classifications` | 7,709,993 | `933383b859d4e00ed3fcff086bac2c1e69650f0cb16bf0c94a3ca33bb7519160` |
| `entities` | 770,265 | `9771cfdbf5f4d21cdf0fe64efb026972c0a3328f129f4e765ca830a8b0b2d6a8` |

The artifact's `allowedMemberManifest` additionally pins all four Mongo
metadata files and the archive's 193-byte license notice.

## Exact projection and counts

| Source/projection unit | Count |
|---|---:|
| Incident documents / projections | 1,632 / 1,632 |
| Incident report references (IDs not retained) | 6,432 |
| Taxonomy documents / source fields | 7 / 303 |
| Explicit-public / explicit-private / unmarked taxonomy fields | 219 / 20 / 64 |
| Classification documents | 2,623 |
| Published admitted / unpublished excluded classifications | 2,307 / 316 |
| Admitted public classification attributes | 40,319 |
| Dropped non-public or unmarked classification attributes | 11,732 |
| Missing `value_json` fields represented only as missing commitments | 1,787 |
| Entity documents / projections | 7,016 / 7,016 |
| Incident-to-entity role references joined / unjoined | 15,283 / 33 |
| Classification-to-incident references joined / unjoined | 2,307 / 0 |

Incident titles, descriptions, entity IDs/names, report-reference IDs,
classification values and reviewer notes are not persisted.  The projection
keeps hashes, month-level incident dates, role/reference counts, explicit-public
taxonomy field names and types, and content commitments.  Unpublished
classifications are counted but never projected.  Only fields whose taxonomy
metadata says `public:true` are admitted; `public:false` and unmarked fields are
dropped.  `reports.text` and `submissions` have zero adapter accesses.

## Rights and authority boundary

The artifact records CC BY-SA 4.0 as the publisher's declaration for the four
admitted collections, together with attribution and ShareAlike obligations.  It
does not extend that declaration to report text, submissions, external media or
linked third-party content, grants no additional rights, and is not legal
advice.  Hashing does not remove source-term obligations.

The artifact permanently denies:

```text
EXPOSURE_DENOMINATOR / FREQUENCY / CAUSAL_ATTRIBUTION / ECONOMIC_LOSS
PRICE / GUARANTEE / SETTLE / AUTOMATIC_TRAINING / RECOVERY / CLOSURE
```

Taxonomy labels such as harm or lives lost remain publisher/reviewer factor
schema.  Their hashed classification values are not admitted as observed loss,
causal truth, an affected-party statement, or adjudication.

## Source-aware APIs and verification levels

`src/outsider-aiid-snapshot-evidence.js` exports:

- `buildAiidSnapshotEvidenceFromSources({ archivePath, termsSnapshotPath }, options)`;
- `verifyAiidSnapshotEvidenceFromSources(artifact, { archivePath, termsSnapshotPath })`;
- archive-compatible wrappers `buildAiidSnapshotEvidenceFromArchive` and
  `verifyAiidSnapshotEvidenceFromArchive`;
- `adaptAiidAllowedSnapshotMembers` for an already-separated exact allowlist;
- `validateAiidTermsSnapshotBytes`;
- `buildAiidSnapshotEvidenceDiff` and `verifyAiidSnapshotEvidenceDiff`.

`verifyAiidSnapshotEvidence` is `SELF_SEALED_STRUCTURE_ONLY`: it validates
content hashes, exact projection shapes and fixed refusal boundaries, but does
not reopen source bytes.  Official identity is origin-bound, not shape-bound.
Only the exact frozen archive/member manifest and exact frozen Terms bytes,
replayed through the source-aware builder, may receive
`OFFICIAL_AIID_FROZEN_SOURCE_REPLAY`, AIID publisher/URLs,
`ORGANIC`/`REAL_MIXED`, `PUBLISHER_DECLARED`/`SOURCE_REPLAYED`, or the
four-collection CC BY-SA declaration.  Well-shaped BSON plus copied Terms
phrases receives `CALLER_ASSERTED_SHAPED_FIXTURE`, no AIID identity, publisher,
URLs, real-public environment class, source-replayed authority, or licensed
collection claim.

The official source-aware verifier is
`FULL_OFFICIAL_AIID_SOURCE_AND_TERMS_REPRODUCED_ALLOWLIST_ONLY`: it rereads the
exact archive without following symlinks, extracts the nine exact allowlisted
members into an isolated temporary directory, replays the pinned Terms bytes,
rebuilds the artifact, and requires byte-equivalent canonical content.  The
frozen run returned all of:

```text
sourceArtifactsReverified: true
termsSnapshotReverified: true
officialFrozenSourceReproduced: true
forbiddenMembersExtractedOrParsed: false
```

A generic fixture replay can establish only
`CALLER_ASSERTED_FIXTURE_BYTES_REPRODUCED_ALLOWLIST_ONLY`; although its caller
bytes may reproduce, it reports `sourceArtifactsReverified:false`,
`termsSnapshotReverified:false`, and
`officialFrozenSourceReproduced:false`.

## CLI

```bash
node scripts/reality-aiid-snapshot-evidence.mjs build \
  --archive artifacts/reality-consequence-aiid-20260817/backup-20260817101120.tar.bz2 \
  --terms-html artifacts/reality-consequence-aiid-20260817/terms-of-use-20260821.html \
  --out artifacts/reality-consequence-aiid-20260817/evidence-book-v1-canonical-p1-origin.json \
  --generated-at 2026-08-17T10:11:20.000Z
```

The CLI also supports `verify` with both source paths and `diff` over two
structurally verified artifacts.  Output is exclusive-create and never
overwrites an existing artifact.

## Snapshot-diff flywheel

The diff correlates stable hashed keys across incidents, taxonomies,
classifications and entities.  It reports added, removed and changed key hashes
plus unchanged counts.  Its disposition is always
`SOURCE_CHANGE_DISCOVERY_AND_HUMAN_TAXONOMY_REVIEW_ONLY`; it cannot promote data
into training, pricing, guarantees or settlement.

The next bounded step is to pin the next weekly snapshot and a fresh Terms
capture, replay both, diff the safe projections, and human-review changes to
affected-party classes and consequence channels.  Those findings should update
the prospective owner-bound measurement schema; only later affected-party,
recovery and independent-review observations can raise an authority ceiling.
