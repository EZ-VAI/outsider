# Stage 0.5 governed-training intake diagnostic

Status: the local first-party Stage 0.5 corpus is source-replayable, but no row
currently satisfies the governed-training admission contract. No model was
trained and no third-party Wave5 row was substituted.

## Exact result

The frozen diagnostic recursively discovers only files named
`stage05-supervised-experience.json` under the local artifacts root. It exports
aggregate counts and set commitments, never raw paths, prompts, source payloads,
session identifiers, or direct identifiers.

| Gate or observation | Count |
| --- | ---: |
| First-party sidecar candidates | 494 |
| Hash-valid unique supervised records | 494 |
| Full Stage 0.5 run directories replayed | 494 |
| Sidecars bound to replayed runs | 494 |
| Current extractor exact rebuilds | 16 |
| Older extractor/projection drift | 478 |
| Canonical observation times | 329 |
| Source-replayed sealed causal outcomes | 375 |
| Complete five-root identities | 494 |
| Explicit owner-controlled training rights | 0 |
| Explicit frozen pre-action snapshots | 0 |
| Complete governed-trainer feature vectors | 0 |
| Explicit training privacy permission | 0 |
| Admissible rows | 0 |

All 494 records are connected into one known-root component because they share
the same `authorityRefHash`. A train/calibration/test component split is
therefore impossible even before the other missing gates are considered.

Every record has a valid nonnegative `nSteps`, but all 494 lack each of:
`costUsd`, `costVsPeer`, `claimedPass`, `claimedDone`, `ranTestClaim`,
`world.reversible`, and `world.externality`. Missing cost was not changed to
zero and missing cost-vs-peer was not changed to one.

The labels are completed-run retrospective derivations: 184/310 true/false for
`fakedSuccess` and 417/77 for `neededCorrection`. They were not represented as
prospectively frozen predictors. The local hashes and event chains make the
existing observations replayable; they do not establish an independent
external outcome authority.

## Why training was refused

The exact decision is `REFUSE_TRAINING_NO_ADMISSIBLE_ROWS`. The diagnostic sets:

```text
governedTrainerInvoked = false
preregistrationCreated = false
trainingReport = null
modelArtifact = null
targetQuotedPrice = null
pricePermission = false
responsibilityUseEligible = false
operationalAuthorityGranted = false
```

Local possession and public availability are not silently treated as training
authorization. A backdated preregistration or a feature projection created
after outcomes would not repair the missing pre-action boundary.

## Required next capture

The machine-readable diagnostic includes a prospective capture contract. Each
new row must bind the sealed Stage 0.5 manifest and event chain to:

- explicit owner-controlled training authorization and privacy-review receipts;
- an externally timestamped, outcome-blind preregistration;
- a hash-sealed complete feature snapshot strictly before action begins and
  excluding label fields;
- a source-replayed sealed outcome plus independent verifier receipt and a
  label/feature overlap audit; and
- a complete correlation-root attestation.

The cohort must have at least 60 rows and 12 known-root components, preserve
components across a strict time-ordered train/calibration/test split, provide at
least three positive-bearing and three negative-bearing components in every
split, and reserve a genuinely unseen test domain. These are intake floors, not
evidence that a future trained model is fit for pricing or responsibility.

## Frozen artifact

```text
path = artifacts/stage05-governed-training-intake-20260822/final-v1/diagnostic.json
generatedAt = 2026-08-22T09:00:00.000Z
artifactHash = sha256:cfec99c676390cbfc0d4af2b66e2baac2a71dd8e37c869b8d0c87ee11061b44b
fileSha256 = ac01a5471ac70f619af093af441408aa94ba3e82ff77e7efcceaaea1c6dbbf19
fileBytes = 7341
```

Build or source-verify without clobbering an existing output:

```sh
node scripts/stage05-governed-training-intake.mjs build \
  --artifacts-root artifacts \
  --out artifacts/stage05-governed-training-intake-20260822/final-v1/diagnostic.json

node scripts/stage05-governed-training-intake.mjs verify \
  --artifact artifacts/stage05-governed-training-intake-20260822/final-v1/diagnostic.json \
  --artifacts-root artifacts
```

Focused tests:

```sh
node --test test/outsider-stage05-governed-training-intake.test.js
```
