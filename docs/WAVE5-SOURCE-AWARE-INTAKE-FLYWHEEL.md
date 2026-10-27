# Wave 5 Source-Aware Stage 1 / 1.5 Intake Flywheel

This frontier turns the frozen Wave 5 source replay into a source-aware Stage 1
/ 1.5 intake seam. The original durable snapshot registry remains intact, and
the same 49 rows now also have a coded bridge into the shared Stage 1 corpus
registry, lifecycle profile, evidence catalog, responsibility flywheel, math
diagnostics, and actuarial architecture. That bridge preserves the source,
rights, missingness, temporality, and use boundary; it does not promote a
retrospective row into a trainer, target, price, or authority input.

The seam has two—and only two—projection lanes:

| Source | Admitted projection | Explicitly not inferred |
| --- | --- | --- |
| Trace Commons | `ORGANIC_AGENT_SESSION_SHAPE`: harness, event/tool counts, preserved result/state coverage, source-native tool errors, write-like calls, follow-up count, and bounded tool-family counts | success, recovery, error rate, causal effect, economic consequence, exposure frequency, training permission |
| ROBUST ROS | `ROS_BUG_FIX_MECHANISM_TAXONOMY`: source-native fault/failure codes, phase, bounded metadata categories, issue/PR presence, fix-commit count, and publisher physical-classification marker | physical execution, sensor evidence, incident frequency, consequence adjudication, loss, causal effect, training permission |

The inputs are records from real software environments. `SHADOW_RESEARCH` is a
permitted-use label, not a claim that the records are synthetic. Conversely,
real source provenance does not by itself create causal or financial authority.

## Intake sequence

```text
immutable full-source bytes
  -> coded Wave 5 full-source replay
  -> narrow source-specific projection
  -> content-addressed snapshot
  -> predecessor-bound snapshot diff
  -> source-bound registry admission with caller-held expected head
  -> explicit human review before any separate downstream admission
```

The provider is fixed as `PUBLIC_EVIDENCE_WAVE5_FULL_SOURCE_V1` version 1.1.0.
Its build input is a source directory. It accepts neither caller-supplied
verification callbacks nor a caller-materialized Wave 5 result as proof. A
future source or revision must add a coded source verifier and a new provider ID
under code review. Supplying a row, callback, re-sealed result, or later snapshot
never grants authority.

## Full-source proof is not a JSON property

The manifest, record, record-set, summary, verification-object, and composite
result verifiers check canonical schema, semantic invariants, and hash
consistency. Their return value is always explicit:

```json
{"ok":true,"verificationLevel":"STRUCTURE_ONLY","sourceArtifactsReverified":false}
```

This remains true when the verification object contains the historical field
`sourceArtifactsReverified: true`. That field reports what the source-directory
producer did; a copied JSON object cannot prove the action occurred.

Full-source status is established only when `buildWave5IntakeSnapshot`, the
source-aware form of `verifyWave5IntakeSnapshot`, or registry `append` directly
calls `verifyPublicEvidenceWave5Source` over the pinned source directory. A
successful source-aware snapshot check returns `FULL_SOURCE_REPLAY`; a failed
source binding returns `FULL_SOURCE_REPLAY_FAILED` and never endorses the
snapshot's source claim.

The formal API is:

```js
const snapshot = buildWave5IntakeSnapshot({
  sourceDirectory,
  generatedAt,
  predecessorSnapshot,
});

verifyWave5IntakeSnapshot(snapshot, { sourceDirectory });

registry.append(snapshot, {
  expectedHeadSnapshotHash,
  recordedAt,
  sourceDirectory,
});
```

Calling `verifyWave5IntakeSnapshot(snapshot)` without a directory is useful for
offline content/chain checks but returns `STRUCTURE_ONLY` and
`sourceArtifactsReverified: false`.

## Fields preserved per row

Every projection retains:

- source ID, immutable revision, source kind, source root, source-record hash,
  and source-record seal;
- the exact outcome-blind selection rule and stratum;
- environment reality, evidence authority, rights evidence, and Outsider's
  permitted-use axis as separate objects;
- publisher-declared human-review provenance, the lack of independently
  verified reviewer identity, `outsiderProjectionReviewed: false`, and an
  explicit downstream-human-review requirement;
- a unique D1 identity root and conservative D2 correlation root;
- source-specific missingness; and
- a zero-authority boundary for causal experience, independent outcome,
  exposure denominator, economic loss, population frequency, production
  modeling, pricing, guarantees, settlement, and automatic training.

The D2 policy intentionally over-groups when the source lacks safe linkage:

- all three selected Trace Commons sessions share one dataset-level D2 because
  donor/project linkage is not projected;
- ROBUST rows share D2 within the Motoman or Universal Robot namespace because
  rows can share codebase, issue, and curation context.

No row is marked as an independent exposure unit. The 49 D1 roots therefore
produce only three conservative D2 groups, not 49 independent observations.

## Missingness is data, not an omission

Trace Commons rows distinguish complete call/result pairing, missing tool
results, and completed-tool-state-only evidence by harness. Every row records
that common native success, terminal recovery, independent replay, independent
outcome, exposure denominator, and economic loss are missing.

ROBUST rows preserve whether issue, pull-request, and fix-commit references are
missing. Every row records that no physical execution stream, independently
replayed bug environment, independent consequence adjudication, exposure
denominator, or economic loss was acquired.

This prevents absence from being silently converted to zero and prevents a
publisher `#PHYSICAL` taxonomy marker from becoming a physical sensor event.

## Snapshot diff and append seam

`buildWave5IntakeSnapshotDiff(previous, current)` compares projection IDs and
row hashes, reports added/removed/changed/unchanged rows, source revision,
record-set, rights and selection changes, row-kind deltas, and missingness
deltas. Every diff has `automaticPromotion: false`.

`DurableWave5IntakeRegistry.append` requires all of the following:

1. the pinned Wave 5 source directory, replayed again inside `append` by the
   coded verifier;
2. exact row and source-verification binding between that replay and the
   snapshot;
3. a predecessor equal to the current registry head; and
4. a caller-supplied expected head for compare-and-swap admission.

The registry persists canonical content-addressed snapshots and diffs, an
append-only hash-chained event log, and a derived state file. It rejects stale
heads, wrong predecessors, partial event tails, non-canonical JSON, content
mutation, and orphan snapshot/diff files.

Its rollback scope is intentionally honest. Offline verification establishes
local content and chain integrity after source-bound admission. The registry
has no external checkpoint, signature authority, transparency log, or trusted
timestamp. A caller that retains the expected head can detect stale admission,
but restoring the entire directory to an earlier self-consistent version is
not externally detectable by this seam alone.

Accordingly, `registry.verify()` reports
`LOCAL_CHAIN_STRUCTURE_ONLY / sourceArtifactsReverified: false`. Only a
successful `append` invocation that has just replayed the source directory
returns an admission-time `FULL_SOURCE_REPLAY` receipt, and that copied receipt
is itself marked as not being standalone proof.

## Canonical replay

```sh
node scripts/stage15-wave5-intake-taxonomy-frontier.mjs \
  --source-dir artifacts/public-evidence-wave5-20260821/source \
  --output-dir artifacts/public-evidence-wave5-intake-20260821/final-v3
```

The canonical artifact contains:

- 49 projections: three organic-agent session-shape rows and 46 ROS
  bug/fix-mechanism taxonomy rows;
- 49 source-review-declared rows, zero Outsider-reviewed projections, and 49
  rows requiring downstream human review;
- 49 unique D1 roots and three conservative D2 groups;
- 12 missing issue references, five missing pull-request references, and one
  missing fix commit among ROBUST rows;
- 57 source objects / 576,071 bytes reverified and 49 native rows reparsed;
- zero CEU, independent outcomes, exposure denominators, loss, frequency,
  model, PRICE, guarantee, settlement, and automatic-training authority.

Canonical identifiers:

- snapshot:
  `sha256:2d40c4e44a7d9edb37ce15b526c8aa07bdca694db7cece8e9b3437c8307192ad`;
- bootstrap diff:
  `sha256:ddb9b034027a2a76c9e6569dc4f1099e13c775debebde295c8966d2aca924a45`;
- registry state:
  `sha256:8c4178da549e0d7c4f133785d84ff098389bf54df5315213f5daad56b08306b1`;
- projection JSONL bytes:
  `sha256:2c7e37806fba5f80f22a0df48ca7b4c2beebf822b7daaf05e11a14041129d3d5`;
- summary bytes:
  `sha256:6b847b105e8583cd89ac71b41e3b9621490eddc30d05d7466647252f6ef9e0aa`.

The projection contains hashes, counts, bounded categories, review provenance,
and missingness. It contains no raw prompt, assistant prose, tool payload,
tool output, bug title, or bug description.

## Shared Stage 1 and downstream chain

`buildPublicEvidenceWave5CorpusArtifactSetFromSource` replays the full source
directory and emits 49 hash-only `CURATE / BACKWARD_EXPERIENCE_EVIDENCE`
candidates under source kind
`PUBLIC_EVIDENCE_WAVE5_SOURCE_AWARE_TAXONOMY`. The mixed rights state is
conservatively frozen as `RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY`: Trace Commons'
compilation is CC-BY-4.0, but embedded-material rights are not uniformly
verified, and no root license was detected for the pinned ROBUST tree. No
automatic training right is inferred.

The additive lifecycle profile is
`EIGHT_SET_NHTSA_WAVE5_V3`. It preserves the earlier seven-set profile and adds
exactly 49 full-source Wave5 identities. The profile records zero causal
experience units, zero independent outcomes, zero exposure/loss rows, zero
pre-action predictors, zero trainer rows, zero PRICE eligibility, and no
operational authority.

```sh
node scripts/stage1-curate-corpus-registry.mjs \
  ingest-public-evidence-wave5-taxonomy \
  --dir .outsider/stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem \
  --source-root artifacts/public-evidence-wave5-20260821/source

node scripts/stage1-curate-corpus-registry.mjs \
  verify-public-evidence-wave5-taxonomy-source \
  --dir .outsider/stage1-curate-registry \
  --source-root artifacts/public-evidence-wave5-20260821/source
```

The downstream current chain binds the same snapshot by semantic hash,
serialized hash, byte count, manifest hash, record-set hash, and full-source
verification commitment. Catalog, flywheel, math, and architecture use it only
as a source-domain taxonomy and missingness reference. Retrospective session or
bug/fix rows never become target predictors, labels, prices, or authority.

## Verification

```sh
node --test test/outsider-wave5-intake-taxonomy-frontier.test.js
node --test test/outsider-wave5-stage1-chain-integration.test.js
```

The focused suite covers exact full-source binding, lane separation, the four
axes, human-review state, D1/D2 correlation, missingness, re-sealed authority
promotion attempts, the four-layer `sourceEvents` re-seal attack, source-result
proof rejection, bootstrap and no-change diffs, future append mechanics,
compare-and-swap enforcement, registry file-set tampering, deterministic CLI
output, and raw-text exclusion.
