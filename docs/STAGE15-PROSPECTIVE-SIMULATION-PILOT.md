# Stage 1.5 prospective physical protocol-conformance pilot

Status: local simulation-conformance vertical slice. The executions are
empirically recorded inside the declared simulator; they are not real-physical
robot consequences. This is **not** a robot deployment and does not contain
real-device evidence.

## What this pilot proves

The pilot executes the complete prospective evidence graph against a small,
deterministic scalar-state simulator:

1. a researcher-signed preregistration freezes the enrolled population,
   assignment-seed commitment, outcome, fixed stopping/attrition rule,
   confounder register, cost bearer and applicability bounds;
2. a different scheduler key signs a balanced control/intervention manifest.
   Each assignment binds experiment and policy hashes, unit and episode hashes,
   arm, propensity, nonce and issue time;
3. a different executor key records every scheduled simulation window. Each
   execution binds the assignment, synthetic device identity, monotonic step
   sequence and exact deterministic replay; each executor-recorded outcome binds
   the execution and preregistered outcome specification;
4. a fourth key adjudicates the closed graph and recomputes the intention-to-treat
   contrast inside the declared simulator bounds; and
5. the CEU decision and second-learning-loop receipt are generated and verified.

This demonstrates `protocolConformance=true`. The source class is recomputed as
`SYNTHETIC_CONFORMANCE`, so the result is always:

- `causalExperienceUnits=0`;
- `realProspectiveExecutions=0`;
- `realRobotEvidence=false`;
- `automaticTraining=false`;
- `authority=none`; and
- `PRICE=false`, `GUARANTEE=false`, `SETTLE=false`.

The four locally generated keys demonstrate cryptographic role separation only.
They do not demonstrate organizational independence. Outcomes are explicitly
labelled executor-recorded, not independently sensed.

## Source-class boundary

Source class is derived from evidence structure, never accepted from a caller
label. The module currently recognizes strict deterministic simulator evidence
as `SYNTHETIC_CONFORMANCE` and strict CURATE historical episode evidence as
`HISTORICAL_OBSERVATION`. There is deliberately no callable
`REAL_PROSPECTIVE_DEVICE` construction or verification path in this module.

A future real-device gate must be backed by an externally administered,
pre-pinned acquisition/device trust root. Local key generation, self-enrollment,
hash-shaped strings and resealed JSON cannot satisfy that gate.

## Run and verify

```sh
node scripts/stage15-prospective-simulation-pilot.mjs run \
  --output-dir artifacts/prospective-simulation-20260820 \
  --units 12

node scripts/stage15-prospective-simulation-pilot.mjs verify \
  --output-dir artifacts/prospective-simulation-20260820
```

The CLI writes one exact, no-clobber seven-file artifact set:

- `preregistration.json`
- `scheduler-manifest.json`
- `execution-ledger.json`
- `adjudication.json`
- `ceu-decision.json`
- `learning-receipt.json`
- `report.json`

Private keys are ephemeral and are not persisted. Public keys and signatures are
inside their artifacts. Seed reveals are intentionally persisted so a verifier
can replay assignment and simulator outputs exactly; their commitments were
already frozen in the signed preregistration.

The formal local run at
`artifacts/prospective-simulation-20260820` verified with report hash
`sha256:fc67706eeaeef0e517d3d0e97bb4a7f2c42450967481f86fa190c05d9f17c3ab`.

## What remains before any real CEU

The machine-readable CEU decision refuses minting until all missing requirements
are supplied, including:

- an externally pinned device/acquisition root and real device execution
  attestation;
- an external timestamp or append-only preregistration registry;
- an external precommitted randomness beacon for real assignment;
- organizational role independence and independent outcome sensing;
- a real-world cost bearer and consequence;
- prospective power and minimum-independent-domain review;
- a global CEU duplicate-credit ledger; and
- externally adjudicated loss and exposure rows.

The stable simulator correlation root is preserved across experiment IDs, so
re-running the fixture cannot manufacture independent physical domains.

## Second learning loop

The learning receipt proves that a verified result can reach the second-loop
interface, but it consumes only protocol-conformance observations. It holds the
real-world learning loop, performs no automatic fitting, and does not update a
production or pricing model. This keeps the interface testable without turning a
simulation into evidence about shared reality.

Implementation:

- `src/outsider-prospective-physical-simulation.js`
- `scripts/stage15-prospective-simulation-pilot.mjs`
- `test/outsider-prospective-physical-simulation.test.js`
