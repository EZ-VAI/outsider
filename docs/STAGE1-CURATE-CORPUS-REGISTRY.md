# Durable Stage 1 / CURATE corpus registry

Status: implemented as a local, append-only, signed evidence index. It remains
descriptive infrastructure with `authority: none`, zero CEU, zero loss evidence,
and `pricingEligible: false`.

## Gap audit

Before this registry, the public agent, DROID, BotFails, and Guardian/UR5 pilots
were reproducible artifact directories, but the operator still had to assemble
and compare reports by hand. The existing Stage 1 Evidence Registry solves
signed quarantine-export aggregation, while CURATE core solves deterministic
episode/clearance/checkpoint construction. Neither one was a durable,
cross-batch inventory for independently produced Stage 1 and Stage 1.5 public
corpora.

| Gap | Closure | Remaining boundary |
| --- | --- | --- |
| Hand-managed artifact directories | Full-source migration creates a signed hash-only artifact set | Registry does not store or serve raw source data |
| Consented Stage 0.5 runs stopped at quarantine | A signed Evidence Registry can be reverified into incremental hash-only artifact sets | The central registry has the signed privacy projection, not the original sealed run |
| No durable cross-batch D1 | All retained identity hashes are checked across every registered batch | Identity quality still depends on the source-bound adapter |
| D2 could drift between batches | Exact instrument id, version, implementation hash, and feature-schema hash form each group | Different instruments are disclosed, never treated as one homogeneous group |
| Current state could be edited | Canonical event-chain log plus Ed25519-signed, reproducible index | A copied older local snapshot can still be replayed without an external anchor |
| Local dates looked stronger than they were | Every local time is explicitly `SELF_ASSERTED_LOCAL_TIME` | No external-time claim exists until a trusted receipt verifies |
| No revocation/retention lifecycle | Append-only revocation and expiry events retain hash-only tombstones | No live upstream revocation polling and no claim of upstream erasure |
| Robotics records omitted an explicit pricing flag | Robotics schema now carries `pricingEligible: false` | Public labels remain descriptive, not loss or causal evidence |

## Files and trust boundary

`src/outsider-corpus-registry.js` implements the registry. A registry directory
contains:

```text
config.json                 signed registry policy and public key
events.jsonl                canonical append-only hash chain
index.json                  signed, fully derivable materialized view
artifact-sets/<sha256>.json signed hash-only artifact sets
```

The registry opens state through `O_NOFOLLOW` file descriptors and verifies
device/inode/size/mtime/ctime stability before and after each bounded read; it
also refuses symlinked directories. It uses a process lock, fsyncs event
appends, and atomically replaces the materialized index. If a crash
lands after a valid event append but before index replacement, `repair` accepts
only an already-valid signed prefix and signs the uniquely derived suffix. It
does not “repair” a modified index.

An artifact set contains dataset and license identifiers, exact instrument
identity, source-verification commitments, record identity/hash commitments,
correlation roots, and lifecycle boundaries. It does not contain prompts,
trajectories, task text, images, video, source rows, loss observations, or model
training authority.

The registry signature proves control of the configured Ed25519 key. It does
not, by itself, prove institutional independence, third-party endorsement, or
that the source bytes named by a signed artifact set were actually replayed.
Generic admission is therefore an operator-signed claim ledger. Ordinary
`verify` checks the signatures, canonical derivation, event chain, lifecycle,
D1, and D2, but always returns `sourceArtifactsReverified: false` and
`fullSourceArtifactSetsReverified: 0`. Its index counts are deliberately named
`operatorSignedFullSourceClaims` and
`operatorSignedPrivacyProjectionClaims`; they are not source-replay counts.

`verify-sources` is the separate source-aware boundary. It requires explicit
paths for the four baseline public source families and for every recognized
optional full-source claim present in the registry, reruns their frozen
builders, and compares every reproduced artifact body and hash canonically
with the signed registry object. A missing path, missing baseline source
family, unrecognized full-source kind, duplicate kind, or body/hash mismatch
fails closed. Signed privacy projections are never relabeled as full-source
replay.

## D1 and D2 across incremental batches

D1 is evaluated over all retained hash identities, including hash tombstones:

- Same instrument + same identity + same record hash: admitted and explicitly
  counted as an exact duplicate.
- Same instrument + same identity + different record hash: rejected atomically
  as a conflict.
- Different instrument + same identity: admitted only with a cross-instrument
  reuse disclosure; it is never silently pooled.

D2 groups active artifact sets only when these four fields match exactly:

1. `instrumentId`
2. `instrumentVersion`
3. `implementationHash`
4. `featureSchemaHash`

Changing adapter code therefore starts a new instrument group instead of
silently mixing measurement regimes.

## Full-source migration

`src/outsider-corpus-registry-intake.js` does not trust the old summary JSON.
It invokes each frozen source-bound verifier again, derives records from pinned
source bytes, enforces the zero-economic-authority boundary, then emits only the
hash projection.

The current migrations are:

- Public agent corpus: 9,381 forward-chain Stage 1 records from four public
  agent datasets, admitted as `ATTEST / FORWARD_ACTION_EVIDENCE`.
- Public agent wave 2: 1,474 records from four additional pinned source
  objects, reproduced as `FULL_SELECTED_SOURCE_OBJECTS_REPRODUCED` and admitted
  as a separate exact D2 instrument group.
- DROID 100 source-bound pilot: two real robot episodes reconstructed from the
  exact pinned first RLDS shard and admitted as descriptive CURATE evidence.
- BotFails + Guardian/UR5: 160 backward-chain records, admitted as
  `CURATE / BACKWARD_EXPERIENCE_EVIDENCE`.
- Optional NHTSA SGO ADS intake: 1,324 latest report identities from 1,365
  reporting-entity submissions/versions, admitted as a separate descriptive
  incident-taxonomy D2 group with unresolved rights, 41 superseded versions,
  and no independent-event, exposure, loss, CEU, model, or pricing status. See
  `docs/NHTSA-STAGE1-CURATE-INTAKE.md`.

All public migrations require full-source success. None converts public labels
into CEU, economic loss, liability, PRICE eligibility, GUARANTEE, or SETTLE.
Dataset license identifiers are provenance fields, not a grant of rights by
Outsider. In particular, the DROID pilot preserves the adapter's explicit
boundary that CC-BY-4.0 is declared by the official paper and is not present in
the GCS object metadata.

## Consented Stage 0.5 contribution intake

`src/outsider-stage05-corpus-registry-intake.js` closes the live contribution
path from `outsider/evidence-registry/v1` into this durable registry. Admission
requires two explicit key allowlists: the signer of the Evidence Registry and
every source contribution server represented in the selected import suffix.
The adapter then re-verifies the signed registry, every signed server receipt,
every bounded contribution record, current retention eligibility, the source
D2 groups, and the correlation roots before creating signed artifact sets.

This is deliberately a **signed privacy-projection** intake, not a full-source
claim. The Evidence Registry contains the hash-addressed
`outsider/supervised-experience/v2` projection and signed receipts, but not the
original sealed run directory. Machine-readable status therefore says:

- `signedStage05ContributionProjectionSupported: true`
- `sealedStage05RunArtifactReverificationAtIntake: false`
- `stage05RevocationFreshness: AS_OF_SOURCE_EXPORT_ONLY`
- `liveSourceRevocationPolling: false`

The artifact expires at the earliest contributing receipt's retention time and
keeps only a hash tombstone after expiry. Consent and receipt hashes are
preserved as the rights basis; the corpus registry does not itself grant data
rights. `VERIFIED_DELIVERY_UNATTRIBUTED` is explicitly refused if a source
tries to relabel it as Outsider causal success. In all cases the registry
assigns zero causal-experience units, zero loss evidence, and zero PRICE
eligibility.

Intake is repeatable and incremental. The result returns
`selection.completeThroughImportHash`; pass that value as `--after-import-hash`
on the next signed Evidence Registry snapshot. Replaying the same snapshot is
deterministically idempotent. Accidental overlap remains visible through D1
duplicate disclosure rather than being silently credited twice.

## CLI

Initialize with an operator-controlled Ed25519 private key:

```sh
outsider corpus-registry init \
  --dir .outsider/stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem
```

Incrementally ingest the frozen public artifacts:

```sh
outsider corpus-registry ingest-public-agent \
  --dir .outsider/stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem \
  --artifact-dir artifacts/public-agent-corpus-20260820

outsider corpus-registry ingest-public-robotics \
  --dir .outsider/stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem \
  --source-root artifacts/curate-public-robotics-20260820/source

outsider corpus-registry ingest-public-agent-wave2 \
  --dir .outsider/stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem \
  --source-root artifacts/public-agent-wave2-20260821/source

outsider corpus-registry ingest-public-evidence-wave5-taxonomy \
  --dir .outsider/stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem \
  --source-root artifacts/public-evidence-wave5-20260821/source

outsider corpus-registry ingest-droid100 \
  --dir .outsider/stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem \
  --artifact-dir artifacts/curate-droid100-20260820/real-pilot-v2-registry-final \
  --source-root artifacts/curate-droid100-20260819/source

outsider corpus-registry ingest-stage05-registry \
  --dir .outsider/stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem \
  --evidence-registry /secure/path/signed-evidence-registry.json \
  --trust-store /secure/path/stage05-intake-trust.json

# Later snapshots add: --after-import-hash sha256:...

outsider corpus-registry verify \
  --dir .outsider/stage1-curate-registry

# Source-aware verification is intentionally explicit and read-only.
outsider corpus-registry verify-sources \
  --dir .outsider/stage1-curate-registry \
  --agent-artifact-dir artifacts/public-agent-corpus-20260820 \
  --wave2-source-root artifacts/public-agent-wave2-20260821/source \
  --wave4-source-root artifacts/public-agent-wave4-20260821/source/agentrx-tau \
  --wave5-source-root artifacts/public-evidence-wave5-20260821/source \
  --robotics-source-root artifacts/curate-public-robotics-20260820/source \
  --droid-artifact-dir artifacts/curate-droid100-20260820/real-pilot-v2-registry-final \
  --droid-source-root artifacts/curate-droid100-20260819/source \
  --nhtsa-csv artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv \
  --nhtsa-data-dictionary artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf

# Metadata-only source replay remains a separate operation.
outsider corpus-registry verify-wave3-metadata-source \
  --dir .outsider/stage1-curate-registry \
  --source-root artifacts/public-agent-wave3-20260821/source/cuarewardbench

outsider corpus-registry verify-public-evidence-wave5-taxonomy-source \
  --dir .outsider/stage1-curate-registry \
  --source-root artifacts/public-evidence-wave5-20260821/source
```

The earlier 2026-08-21 migration baseline contains four operator-signed
full-source claims. An explicit four-source replay verifies all four canonical
artifact bodies and all 11,017 hash identities. Its signed index hash is
`sha256:a54a50e08690f8efd6ce461b9e1e219a3eb79a96213f6001c3e4d62654545be3`;
its source-aware replay hash is
`sha256:d4a9de42fab34e59381d77dc33bf045c4f9873e8456100c72d82900442e0271a`.
That baseline and prior snapshots are preserved at
`artifacts/stage1-curate-corpus-registry-20260821-superseded-v1` rather than
being overwritten, and at
`artifacts/stage1-curate-corpus-registry-20260821-superseded-v2-source-claim-semantics`
for the final source-claim terminology migration.

The current unified local registry is
`artifacts/stage1-curate-corpus-registry-all-evidence-v2-nhtsa-20260821`.
It contains 7 sets, 12,642 unique identities, 7 exact D2 instrument groups and
zero conflicts. Six full-source sets contribute 12,370 identities; the
separate CUARewardBench metadata-only quarantine contributes 272. Its signed
index is
`sha256:66837aaa4d584e0842a86d6bb355e12aa60346cde6f46abbabb997265ed4d567`;
the six-source replay hash is
`sha256:d9bd84638cebd60fbd63288313202177e12f67da5b28870b10e8babbbef48dcc`;
and the metadata-only replay hash is
`sha256:be8455b9c0b53be1d43253e0a349d71af75616b15b0c593927429f82f004fcf6`.
The added NHTSA set is real-world incident-report evidence, but it has no
complete exposure denominator, independent adjudication, observed economic
loss or established reuse rights. It therefore remains descriptive and cannot
enter loss frequency, training, PRICE, GUARANTEE or SETTLE.

The code-level additive lifecycle profile
`EIGHT_SET_NHTSA_WAVE5_V3` extends that seven-set profile with 49 exact Wave5
hash identities: three Trace Commons session-shape records and 46 ROBUST ROS
bug/fix taxonomy records. It requires full source replay and freezes the mixed
rights state as unresolved public-access-only. All 49 rows are retrospective,
unavailable pre-action, missing independent outcome/exposure/loss, and admit
zero trainer rows, target predictors, PRICE inputs, or authority. The preserved
seven-set signed registry above is not silently rewritten or re-signed; a real
operator key and a new append event are required to materialize the eighth set.

All versions contain **zero live user-contribution artifact sets**. The live
flywheel path is implemented and tested, but no real user Evidence Registry was
fabricated merely to raise that count. All registries keep CEU, loss, training
and PRICE authority at zero.

The private operator key is intentionally kept under the git-ignored
`.outsider/` state tree; deleting it makes this registry read-only and prevents
future revocation signatures.

Use a new `--artifact-set-id` for a genuinely new batch. Re-ingesting the exact
same signed set is idempotent. Reusing an id for different content is rejected.

Revocation and expiry are append-only state transitions:

```sh
outsider corpus-registry revoke sha256:... \
  --dir .outsider/stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem \
  --reason INTEGRITY_CONCERN --evidence-hash sha256:...

outsider corpus-registry expire-due \
  --dir .outsider/stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem \
  --now 2030-01-01T00:00:00.000Z
```

## External timestamp interface

The registry can be initialized with a JSON list of trusted timestamp authority
public keys. `timestamp-request` creates a request bound to the artifact-set hash
and a random nonce. A receipt counts as external time only when:

- it binds the exact request hash and subject hash;
- its canonical time is not before the request;
- its Ed25519 signature verifies under a configured provider/key pair; and
- the receipt is appended to the signed registry history.

```sh
outsider corpus-registry timestamp-request sha256:... \
  --dir .outsider/stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem \
  --out timestamp-request.json

outsider corpus-registry timestamp-attach timestamp-receipt.json \
  --dir .outsider/stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem
```

Without such a receipt, all timestamps remain explicitly local and unverified.
Choosing a provider key in local policy also does not, on its own, establish the
provider's institutional independence. A future deployment should use an
external RFC 3161/transparency-log bridge and separately governed trust policy.

## Security tests

The focused suite covers cross-batch duplicate disclosure, conflict rejection,
D2 isolation, artifact-signature tampering, event modification and partial
tails, index forgery, signed-prefix crash recovery, forged timestamp receipts,
revocation, expiry tombstones, already-expired admission, two-process
initialization races, CLI ingestion, full-source public agent/robot
registration, Stage 0.5 signer/server trust, retention expiry, deterministic
incremental replay, complete-original-instrument D2 isolation, stable-fd
symlink refusal, adversarial relabeling of unattributed delivery, and a
same-signer fake `FULL_SOURCE` reseal that ordinary verification reports only
as an operator claim and source-aware verification rejects.
