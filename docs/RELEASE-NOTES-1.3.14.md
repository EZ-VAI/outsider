# Outsider 1.3.14

Private-beta reliability build for R4 crash recovery and supervised risk data.

## Runtime recovery

- gives each controller generation its own process group and terminates orphaned
  semantic-judge descendants before a successor takes authority;
- reconciles the narrow crash window after the unique final `run_finalized`
  event without appending, re-running a judge or changing the declared proof;
- makes attached daemon plus controller restart reuse the same run ID, contract
  seal and lease lineage instead of silently bootstrapping a second run;
- drains accepted RPC work before finalization, fences late callbacks and
  releases the controller lease before evidence sealing;
- adds evaluation-only, schema-guarded failpoints. They are inert unless the
  explicit evaluation guard and preregistered marker are both present.

## R4 executable protocol

`npm run canary:r4 -- --artifact <tgz> --output <fresh-dir> --execute-live`
executes five deterministic process-failure lanes. The evaluator first proves
that every packaged file used at runtime is byte-identical to the named tarball.
Each lane must preserve identity and causal authority, reach complete proof,
produce Experience v2 plus ATTEST v2, release its lease, seal once, and remain
byte-stable for at least 120 seconds. The deterministic oracle isolates process
recovery from LLM reliability; it is not model-quality or endurance evidence.

## Supervised experience and risk shadow

Every newly sealed terminal run exports `outsider/supervised-experience/v2`.
Delivery success and Outsider causal contribution are separate labels; only a
sealed ordered intervention chain is eligible for correction-effect learning.
R1–R5 capacity observations are recorded as observed-only data and never as
loss or liability findings.

`npm run risk:shadow -- --input <experience-or-directory> --output <report>`
maps admissible sealed records into the frozen 36-factor Outsiderf schema. It
does not impute missing factors and always returns
`ABSTAIN_NO_ADMISSIBLE_L3_L4`: no price, coverage, capital or financial effect.
It is a data-compatibility and shadow-measurement bridge, not an insurance
model promotion.

Do not hot-upgrade a running session. Earlier R1/R2 evidence remains valid for
the exact historical artifacts that produced it, but cannot be pooled into a
1.3.14 reliability rate. R1–R5 field status for this immutable build is reported
separately after each preregistered live protocol completes.
