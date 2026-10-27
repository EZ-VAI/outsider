# Public Evidence Wave 5: Organic Agent Sessions and ROS Bug–Fix Records

Wave 5 moves Stage 1 / 1.5 toward more consequential evidence without
pretending that every public record has the same authority.  It adds two
bounded, immutable source scopes:

1. three voluntarily donated coding-agent sessions from
   [Trace Commons](https://huggingface.co/datasets/trace-commons/agent-traces);
2. 46 admitted industrial-arm software bug/fix records from the
   [ROBUST ROS dataset](https://github.com/robust-rosin/robust), backed by the
   project authors' [peer-reviewed study](https://doi.org/10.1007/s10664-024-10440-0).

These are empirical records from real software environments.  Calling their
permitted use `SHADOW_RESEARCH` does **not** make them synthetic.  At the same
time, source reality does not create independent outcome authority, economic
loss, causal units, data rights, or permission to price.

## Four independent axes

| Source | Environment/source reality | Evidence authority | Rights evidence | Outsider permitted use |
| --- | --- | --- | --- | --- |
| Trace Commons | `REAL_SOFTWARE`; recorded sessions voluntarily donated from public open-source work; organic status is publisher/contributor declared and the executions were not independently replayed by Outsider | publisher declaration; contributor review before submission and maintainer review before merge are declared by the pinned dataset card; no per-row independent reviewer identity or outcome adjudication | compilation declares CC-BY-4.0 and says training is allowed with attribution; embedded code/content can retain other licenses and is not uniformly reverified | descriptive structure + shadow analysis; no raw text in the projection; no automatic training |
| ROBUST industrial-arm scope | `REAL_SOFTWARE`; organic issue/fix metadata from Motoman and Universal Robot projects; the systems have physical-robot context, but Wave 5 acquires no physical execution stream | researcher-curated fault/failure taxonomy with issue, pull-request and commit linkage where present; no independent row adjudication or environment replay | repository is public, but the pinned tree has no root `LICENSE`/`COPYING` and GitHub exposes no license metadata; Outsider grants no rights | descriptive source replay only; no training or model truth |

The Trace Commons card explicitly says that individual traces can contain
material with its own original licensing and that provenance/license is not
reverified by maintainers.  Wave 5 therefore preserves the compilation's
CC-BY-4.0 declaration while refusing to upgrade all embedded material to a
uniformly verified license.

ROBUST is even narrower.  Public accessibility is a source-access fact, not a
license grant.  Its records remain useful empirical evidence for consequence
taxonomy, but Outsider does not use them for automatic training while the
formal dataset-license boundary is unresolved.

## Frozen selection

### Trace Commons

Repository revision:

`112ebd4d03ce852b00e935d523107c3d0c9a65bf`

The outcome-blind rule is:

> For every nonempty harness at the pinned revision, choose the
> lexicographically first raw session whose source byte size is between 16 KiB
> and 256 KiB.

This selects one session each for Claude Code, Cursor, and OpenCode.  Empty
placeholder directories for Codex and Pi do not produce records.  The rule is
derived from the pinned tree; it does not inspect errors, success, content,
severity, or human feedback when choosing the files.

The full selected source scope is 323,840 raw session bytes plus the README and
two canonical acquisition projections.  Each session is bound to both its Git
blob OID and SHA-256 digest.

### ROBUST

Repository commit:

`521fe75319c256995fae6f5a4b756f0bfa4bf65e`

Tree:

`70f8f66e9e81bf7f119829857d0e58ad18bbd760`

The outcome-blind rule admits every `.bug` record under the complete `motoman`
and `universal_robot` namespaces, except a record with an adjacent
`NOT_A_BUG` marker.  It does not select on severity, failure code, physical
marker, reproducibility, issue availability, or presence of a fix.

The pinned tree contains 47 candidate `.bug` files and one `NOT_A_BUG` marker,
leaving 46 admitted records:

- Motoman: 21;
- Universal Robot: 25.

All 47 candidates, the exclusion marker, the README, and canonical commit/tree
projections are present in the isolated source snapshot.  Every selected byte
object is checked against its Git blob OID before parsing.

## Reproduced observations

The three Trace Commons sessions contain:

- 116 source-native events/messages;
- 61 tool calls;
- 27 preserved tool-result or completed-tool-state observations;
- 6 source-native tool errors;
- 8 calls to the bounded `Write`/`Edit`-like tool-name set;
- 4 human prompts after an initial prompt across the selected sessions; and
- one selected Claude Code session that continues making tool calls after an
  observed tool error.

“Continues after error” is deliberately not called “recovered.”  The selected
sessions have no common independently adjudicated terminal-success label, and
the Cursor projection does not preserve tool results.  These three sessions
cannot estimate a population tool-error, correction, recovery, or success
rate.

The 46 admitted ROBUST records contain:

- phases: 17 build, 16 runtime, 13 startup;
- 34 records with an issue reference;
- 45 records with at least one fix commit;
- 12 publisher `#PHYSICAL` classification markers;
- 46 source-native fault/failure taxonomy records; and
- failure categories including behavioral failure, build failure, crashing,
  loss of functionality, unresponsiveness, monitoring, and incorrect behavior.

A `#PHYSICAL` or `SYSTEM:*` label is a publisher taxonomy observation.  It is
not a robot sensor stream or proof that Outsider replayed a physical event.
Similarly, the number of curated bugs is not an exposure denominator and does
not estimate incident probability in deployed robots.

## Enforced non-authority boundary

For all 49 records:

| Quantity / permission | Value |
| --- | ---: |
| Empirical source records | 49 |
| Causal experience units | 0 |
| Independently adjudicated outcome units | 0 |
| Economic-loss rows | 0 |
| Exposure-denominator rows | 0 |
| Pricing-eligible rows | 0 |
| Production-model-eligible rows | 0 |
| Automatic training | false |
| `CEU`, `MODEL`, `LOSS`, `PRICE`, `GUARANTEE`, `SETTLE` | all false |

This is not a statement that the sources are “only research.”  It means the
real observations can refine descriptive factors and candidate consequence
taxonomies while their current authority is insufficient for causal learning,
capital decisions, guarantees, claims, or prices.

## Privacy-preserving projection

The normalized record set retains source-object hashes, session or bug identity
hashes, tool-family counts, bounded source-native categories, failure-code
sets, and issue/fix-link presence.  It does not persist:

- raw prompts, assistant prose, reasoning, tool arguments, or tool output;
- raw bug titles or descriptions;
- source issue or pull-request URLs; or
- source-native session IDs and ROBUST IDs in clear text.

The raw source bytes stay in the isolated, gitignored acquisition directory.

## Acquisition and deterministic replay

```sh
node scripts/acquire-stage15-public-evidence-wave5.mjs \
  --output artifacts/public-evidence-wave5-20260821/source

node scripts/stage15-public-evidence-wave5.mjs \
  --source-dir artifacts/public-evidence-wave5-20260821/source \
  --output-dir artifacts/public-evidence-wave5-20260821/final-v3
```

The committed acquirer refuses a pre-existing output directory, fetches only
immutable revisions, derives both selections from pinned trees, bounds every
response, checks Git blob identities, and publishes atomically.

The standalone manifest, record, record-set, summary, verification, and
composite-result functions are semantic and hash-structure verifiers only.
Even for an artifact whose historical report says
`sourceArtifactsReverified: true`, their result is
explicitly `verificationLevel: STRUCTURE_ONLY` and
`sourceArtifactsReverified: false`. A copied and consistently re-sealed object
cannot prove that source bytes were read. Only
`verifyPublicEvidenceWave5Source`, called with the pinned Trace Commons and
ROBUST source directories, establishes the source replay for that invocation.

The source-aware Stage 1 / 1.5 intake therefore never accepts a caller-provided
materialized Wave 5 result as proof. Its build, full verification, and registry
admission paths replay the source directory internally.

The canonical replay reports:

- 57 selected/support source objects reverified;
- 576,071 source bytes reverified;
- 49 source-native rows reparsed;
- manifest hash
  `sha256:358724f389a6746e599deec9705c376aa946e228e77a7777fc91ebf30d82dcce`;
- record-set hash
  `sha256:c9ac0aebbf70429db0d4a07c94c3b7dd1833faa2a7df72470e6fb08c3a9c4939`;
- summary hash
  `sha256:c6f40d7d9433c656dc9b9e4cb15fc4b420fbfdd1043cf9356223b32dc43b9b2c`;
- verification hash
  `sha256:60849386032e4a10c8c1327188d4a154356dc0526388d10c2bde304f10005f48`;
- normalized `records.jsonl` SHA-256
  `sha256:74eb5ddf8a20f3850db659653c08145d1653edabdbbde796d4544e3c2984d8e8`.

## Deferred candidates

- [SWE-chat](https://huggingface.co/datasets/SALT-NLP/SWE-chat) is highly
  relevant organic coding-agent evidence, but the files require a logged-in
  user to accept access conditions and share contact information.  Its public
  card is not equivalent to authorized file access, so Wave 5 does not claim
  those rows were acquired.
- [Microsoft Orchard](https://huggingface.co/datasets/microsoft/Orchard) has
  large success/failure-labeled software trajectories, but they are
  teacher-generated in controlled sandboxes.  Existing Outsider waves already
  contain multiple controlled benchmark sources, so its marginal source-reality
  value is lower than Trace Commons.
- Large physical-stream datasets remain candidates for a later device-stream
  acquisition wave.  A paper, card, or metadata manifest alone will not be
  counted as decoded physical telemetry.
