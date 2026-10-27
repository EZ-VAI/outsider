# Source-bound Reality Stewardship integration

## What changed

The Reality Stewardship kernel is no longer only a synthetic protocol demo.
`src/outsider-reality-stewardship-integration.js` creates a deterministic seam
across the implemented product path:

```text
replayed CURATE episode / clearance / checkpoint / inclusion proof
  -> CURATE evidence-intent hash
  -> exact Experience Claim operation + declared-rights reference
  -> pre-action Stage 0.5 binding for that Claim, Way and World
  -> sealed Stage 0.5 manifest and public evidence
  -> exact single-run signed ATTEST
  -> execution receipt preserving every responsibility root
  -> source-bound advisory envelope with open consequence obligations
```

This is an engineering join, not a promotion in authority. The envelope is
always `HOLD_EXTERNAL_OWNER_LEDGER_AND_OPEN_CONSEQUENCES`. Its machine
boundary also fixes `ownerGateInputEligible`, `executionAuthorized`,
`priceAuthorized` and `closureAuthorized` to `false`; these are not caller
options.

## Why the evidence-intent comes first

A valid CURATE clearance can still describe the wrong episode. To prevent a
caller from attaching any convenient physical-AI record after execution, the
integration first derives `outsider/reality-curate-evidence-intent/v1` by
replaying all of the following:

- the normalized episode;
- the exact history used by its clearance;
- the clearance derivation;
- the complete checkpoint record set; and
- the clearance's Merkle inclusion proof.

The later Stewardship Claim must:

- have purpose `EXPERIENCE`;
- contain the intent hash in `operationHashes`; and
- use the intent's declared experience-rights reference as its
  `experienceRightsHash`.

That rights hash binds the declared dataset, source object, license,
attribution and clearance. It does **not** prove that the license is valid,
that the source bytes are authentic, or that every affected party granted the
right to create or reuse the experience. Those external facts remain false in
the machine boundary.

## Stage 0.5 and ATTEST binding

The envelope accepts only a locally reverified sealed run whose pre-action
Stage 0.5 binding uses:

- `EXACT_CLAIM` with the Stewardship `claimHash`;
- `EXACT_WAY_REFERENCE` with the Claim's `wayHash`;
- `EXACT_WORLD` with the Reality Boundary's `worldHash`; and
- `createdBeforeFirstAction:true`.

It then rebuilds the exact one-run ATTEST body from the run directory and
requires a valid Ed25519 signature. The envelope commits the binding,
manifest, canonical projection, public evidence, local/private Merkle root,
public derivative root, event chain, supervised Experience, ATTEST and signer
key hashes. The signer is still marked
`attestationSignerExternallyTrusted:false`: a valid self-signature is
integrity evidence, not institutional authority.

The Reality execution receipt must use the exact Stage 0.5
`publicEvidenceHash` as `executionEvidenceHash`. Its provider must remain in
the responsibility-root set, and every responsibility root in the Claim must
survive provider replacement.

## Budget and affected-party closure

The integration replays the assessment with the exact prior `{commitment,
claim}` entries. It refuses:

- a repeated commitment hash;
- two reservations for the same Claim;
- a current commitment that differs from the Claim's request;
- an omitted constraint channel;
- an assessment other than
  `STRUCTURALLY_READY_PENDING_EXTERNAL_LEDGER_AND_OWNER_GATE`; or
- an affected party omitted from representation.

Every channel row binds its unit, cap, aggregation, affected parties, prior
usage, requested amount, current reservation and projected usage. The ledger
class remains `OPERATOR_OBSERVED_NOT_EXTERNALLY_COMPLETE`, so a locally clean
budget cannot authorize execution.

## Delayed obligations

Every mandatory horizon in the Reality Boundary becomes an explicit open row
bound to one source-evidence anchor. A row is either `OPEN_UNTIL_DUE` or
`REPORT_DUE_OR_OVERDUE`; it never silently becomes a zero-impact report. The
initial envelope fixes:

```text
allConsequenceReportsBound: false
obligationOpen: true
canClose: false
externalClosureRequired: true
externalClosureEligibilityVerified: false
```

Consequence reports, affected-party challenges, recovery and externally
governed closure continue through the core Reality Stewardship protocol. A
successful Stage 0.5 terminal result is not consequence closure.

## Verification levels

Standalone verification is `SELF_CHECK_ONLY`. It validates canonical shape,
content hashes, internal coverage and the permanent no-authority boundary. A
caller who changes source hashes and recomputes every local hash can at most
create another self-checking projection.

Supplying the original run directory, signed ATTEST, CURATE derivation, Claim,
Boundary, assessment, budget entries and execution receipt produces
`LOCAL_PROTOCOL_SOURCES_REPLAYED`. That means the local protocol bytes and
derivations matched. It still reports all of the following as false:

- raw CURATE source-object bytes reverified;
- external ledger completeness;
- external owner adoption;
- affected-party standing;
- execution authorization;
- PRICE authorization; and
- closure authorization.

## CLI

Create an intent before making the Experience Claim:

```bash
node scripts/reality-stewardship-bind.mjs intent \
  --spec curate-intent-spec.json \
  --out curate-intent.json
```

`curate-intent-spec.json` has this shape (paths are relative to the spec):

```json
{
  "schema": "outsider/reality-curate-intent-input-spec/v1",
  "curateSource": {
    "episodeFile": "episode.json",
    "historyFiles": [],
    "clearanceFile": "clearance.json",
    "checkpointFile": "checkpoint.json",
    "checkpointClearanceFiles": ["clearance.json"],
    "inclusionProofFile": "proof.json"
  }
}
```

After the exact Claim-bound Stage 0.5 run is sealed and attested, build the
advisory envelope:

```bash
node scripts/reality-stewardship-bind.mjs build \
  --spec source-bound-spec.json \
  --out advisory-envelope.json
```

The envelope spec is:

```json
{
  "schema": "outsider/reality-source-bound-input-spec/v1",
  "boundaryFile": "reality-boundary.json",
  "claimFile": "stewardship-claim.json",
  "assessmentFile": "stewardship-assessment.json",
  "priorCommitmentEntries": [
    { "commitmentFile": "prior-commitment.json", "claimFile": "prior-claim.json" }
  ],
  "currentCommitmentFile": "current-commitment.json",
  "executionFile": "execution-receipt.json",
  "curateIntentFile": "curate-intent.json",
  "curateSource": {
    "episodeFile": "episode.json",
    "historyFiles": [],
    "clearanceFile": "clearance.json",
    "checkpointFile": "checkpoint.json",
    "checkpointClearanceFiles": ["clearance.json"],
    "inclusionProofFile": "proof.json"
  },
  "stage05": {
    "runDirectory": "stage05-run",
    "attestationFile": "stage05-attestation.json"
  },
  "createdAt": "2026-08-21T00:00:10.500Z"
}
```

Reverify it against every source:

```bash
node scripts/reality-stewardship-bind.mjs verify \
  --spec source-bound-spec.json \
  --envelope advisory-envelope.json
```

The CLI writes new artifacts with exclusive-create semantics and will not
overwrite an existing output file.
