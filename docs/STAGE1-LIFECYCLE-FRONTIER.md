# Stage 1 lifecycle and source-reverification frontier

This frontier closes a local engineering interface; it does not manufacture an
external trust institution. It keeps six questions separate:

| Question | What the frontier can establish | What it does not establish |
|---|---|---|
| Cryptography | Exact Ed25519 receipt integrity and key identity | Institutional standing or independence |
| Source replay | Direct replay of the sealed Stage 0.5 directory, or an exact operator-side replay receipt produced from that directory | That an arbitrary caller hash or `sourceReplay: true` label is a replay |
| Freshness | Receipt age, validity window, policy window, challenge window and provider-stream sequence | Freshness when a required live provider is missing or failing |
| Membership/revocation/retention | Provider-specific payload semantics through a registered, versioned and profile-hashed verifier interface | That locally configured provider keys are governed by an independent institution |
| Rights | Nothing beyond preserving the fact that rights are unresolved | A licence, consent conclusion, training right or legal conclusion |
| Authority | Nothing | CEU credit, training, model deployment, PRICE, guarantee or settlement authority |

The environment in which evidence was recorded is a separate fact. Real
physical and real software observations remain empirical observations. A
`HOLD`, descriptive-only use, or shadow-use limit restricts what Outsider may
infer or do with that evidence; it does not relabel the originating environment
as unreal or synthetic.

## Source paths

`DIRECT_SEALED_RUN` calls `verifyStage05RunDirectory` before a lifecycle poll
and again after all provider verifiers run. Any file, manifest, event-chain or
Merkle-root change is rejected as a source TOCTOU event.

`OPERATOR_VERIFIER_RECEIPT` accepts only
`outsider/stage1-source-replay-receipt/v1`. The receipt binds the exact run,
contract, binding, manifest, projection, public derivative, private Merkle
root, public Merkle root, event chain and terminal class. The signer,
implementation hash, adapter version, policy hash, validity window and receipt
stream sequence must all match the pinned local policy. The helper that creates
this receipt first performs the direct sealed-directory replay. This permits a
central intake to verify a privacy-preserving receipt without receiving the raw
run directory.

A receipt signature can be valid and trusted by a configured local policy
without being institutionally trusted. The output reports those properties
separately.

## Provider interfaces and current-use decision

The built-in registry contains distinct interfaces for:

- timestamp plus witnessed log root;
- subject membership plus membership epoch;
- revocation status plus registry epoch; and
- retention status plus policy reference.

Every configured provider pins its provider ID, one capability, interface ID,
adapter version, interface-profile hash, maximum age and time-scoped key
history. This supports planned signer rotation: the receipt observation time
must fall inside the selected key's validity window and before its revocation
time. A generic signature, standalone hash, unknown interface, wrong profile,
wrong version or caller-supplied status remains an unverified submission.

All required provider capabilities must be present and fresh for the bounded
Stage 1 lifecycle admission to become true. Missing live polling, a partial
provider failure, inactive membership, unknown or positive revocation, expired
retention, stale evidence, or any invalid submission produces `HOLD`.
Regardless of admission, the following values are invariant:

- `causalExperienceUnits = 0`;
- `automaticTraining = false`;
- `productionModelUpdate = false`;
- `pricingEligible = false`; and
- `authority = none`.

## Replay, rollback, concurrency and TOCTOU

Each poll challenge binds the policy hash, exact source commitment, source
evidence hash, state hash, state sequence, nonce and expiry. Provider receipts
bind that challenge. Compare-and-swap state commits reject two evaluations
built from the same state. Per-provider and source-verifier watermarks require
strictly increasing sequences, exact prior receipt hashes and nondecreasing
observation times. Receipt hashes and poll IDs cannot be reused. A recorded
revocation is monotonic and cannot be undone by a later `NOT_REVOKED` receipt.
Commit also requires the original source, challenge, provider receipts and
verifier registry, then reproduces the complete evaluation before advancing
state. Rehashing a caller-edited evaluation therefore cannot create an
admission.

These checks detect receipt-stream rollback and stale concurrent state. They do
not claim that an old locally stored state snapshot cannot be restored by an
operator with filesystem control. External or hardware-backed head anchoring
remains a separate deployment requirement.

## Combined seven-set corpus registry

Ordinary registry verification and source replay intentionally remain distinct.
For the current local combined registry, ordinary verification rechecks the
signed configuration, event log, index, artifact-set signatures, D1/D2 state,
revocation state, retention state and configured timestamp receipts, but
returns:

```text
sourceArtifactsReverified = false
sourceReplayStatus = NOT_PERFORMED_BY_ORDINARY_REGISTRY_VERIFY
```

Run that read-only check with:

```bash
node scripts/stage1-lifecycle-frontier.mjs verify-corpus \
  --dir artifacts/stage1-curate-corpus-registry-all-evidence-v2-nhtsa-20260821 \
  --now 2026-08-21T11:00:08.000Z
```

The direct replay command invokes every known source adapter itself. It does
not accept a caller-supplied replay result, infer a profile from the registry,
or silently accept an optional source. `--expected-profile` is mandatory and
selects one immutable exact profile:

| Profile | Exact sets | Candidates | D2 groups | Full source | Metadata only | Profile hash |
|---|---:|---:|---:|---:|---:|---|
| `SIX_SET_V1` | 6 | 11,318 | 6 | 5 / 11,046 | 1 / 272 | `sha256:dd79635cfef9a60f9e82830925b754d0bc75cf1cbf811b87aba85ca5c59fc917` |
| `SEVEN_SET_NHTSA_V2` | 7 | 12,642 | 7 | 6 / 12,370 | 1 / 272 | `sha256:476cf01dc6298e58ea86fc34655ac9b8e3fe297ed4ac792a6c87fad8c0d824e0` |

Each profile freezes the exact source-kind set and per-kind candidate count,
stage/stream, completeness class, verification level, instrument/version,
dataset and licence identifiers, rights-basis/status, total active/revoked/
expired artifact counts, D2 count, full/metadata/privacy partition and the
zero-authority boundary. A validly re-signed registry still fails if any of
those fields differ. The seven-set profile rejects a missing NHTSA set or
missing CSV/dictionary replay path; the six-set profile is accepted only when
named explicitly. A seven-set registry cannot be replayed under the six-set
profile, and the prior six-set registry cannot be replayed under the seven-set
profile.

Current seven-set replay:

```bash
node scripts/stage1-lifecycle-frontier.mjs replay-corpus \
  --expected-profile SEVEN_SET_NHTSA_V2 \
  --dir artifacts/stage1-curate-corpus-registry-all-evidence-v2-nhtsa-20260821 \
  --agent-artifact-dir artifacts/public-agent-corpus-20260820 \
  --wave2-source-root artifacts/public-agent-wave2-20260821/source \
  --robotics-source-root artifacts/curate-public-robotics-20260820/source \
  --droid-artifact-dir artifacts/curate-droid100-20260820/real-pilot-v2-registry-final \
  --droid-source-root artifacts/curate-droid100-20260819/source \
  --wave4-source-root artifacts/public-agent-wave4-20260821/source/agentrx-tau \
  --wave3-source-root artifacts/public-agent-wave3-20260821/source/cuarewardbench \
  --nhtsa-csv artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv \
  --nhtsa-data-dictionary artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf \
  --now 2026-08-21T11:00:08.000Z \
  --out artifacts/stage1-lifecycle-frontier-v3-profiled-nhtsa-20260821/combined-source-replay.json
```

For a deliberate replay of the retained prior registry, use the same six
source paths but omit the NHTSA paths and pass:

```text
--expected-profile SIX_SET_V1
--dir artifacts/stage1-curate-corpus-registry-all-evidence-20260821
```

Output creation is no-clobber (`wx`, mode `0600`). The verified local snapshot
contains 7 artifact sets and 12,642 identities: 6 full-source sets with 12,370
identities and one metadata-only set with 272 identities. The NHTSA set adds
1,324 source-replayed, real-world physical incident-report identities; it does
not add an exposure denominator, adjudicated economic loss, reuse rights or
pricing authority. Full-source and metadata-only evidence remain separate in
the output. The replay does not convert metadata-only evidence into trace
evidence and does not grant rights or authority. The prior six-set snapshot is
retained under its original path and is not overwritten. A successful replay
binds `profileId`, `profileHash`, and `profileExact = true` both in the snapshot
and its source commitment. Ordinary `verify-corpus` remains an operator-signed
claim/structure check and intentionally has no source-profile replay claim.

## Files and tests

- `src/outsider-stage1-lifecycle-frontier.js`
- `scripts/stage1-lifecycle-frontier.mjs`
- `test/outsider-stage1-lifecycle-frontier.test.js`

The focused suite covers direct source replay, privacy-preserving replay
receipts, source tampering, stale receipts, key rotation, missing live polling,
generic hash submissions, cryptographically valid but semantically invalid
provider payloads, partial provider failure, receipt replay, sequence rollback,
concurrent stale bases, wall-clock rollback, revocation monotonicity, retention
expiry, source TOCTOU, combined-registry read-only verification and no-clobber
snapshot output. Corpus-profile coverage also includes omitted-profile,
six-to-seven and seven-to-six downgrade, optional NHTSA path, and validly
re-signed source/profile mutation attacks.
