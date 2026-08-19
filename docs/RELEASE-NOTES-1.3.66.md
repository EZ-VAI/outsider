# Outsider 1.3.66

1.3.66 turns the R1–R5 reliability suite into a release-certificate input,
instead of leaving verified field runs as disconnected artifact directories.

## Exact artifact binding

- Formal R2/R3 Agent Team probes now require `--artifact`.
- Before any interactive worker starts, the evaluator extracts the npm package,
  verifies its complete file closure against the executing runtime, copies the
  same bytes into the experiment directory and preregisters the artifact hash,
  package version, byte length and content-manifest hash.
- A source checkout, package version string or old Agent Team run can no longer
  stand in for the immutable release artifact.

## Verifiable field-evidence ingestion

- `release:certify` accepts `--r1-run`, `--r2-run`, `--r3-run`, `--r4-run` and
  the existing `--endurance-run`.
- R1 is rechecked as five independent exact causal deliveries with stable
  manifests, verified Experience, per-run attestations and one aggregate
  attestation.
- R2/R3 are rechecked against the sealed run, host/kernel cross-ledger proof,
  exact runtime/evaluator hashes and, for R3, the constructed integration
  correction chain.
- R4 is rechecked as exactly five named crash lanes, with no orphan judge,
  matching run/contract identity, verified manifests and attestations.
- Missing, handwritten, cross-version or hash-mismatched inputs produce `FAIL`;
  there is no manual `PASS` flag.

## Evidence boundary

- The 1.3.65 package passed all five deterministic R4 lanes and remained sealed
  after the 120-second window. That evidence remains valid for 1.3.65, not this
  new artifact.
- 1.3.66 must receive its own exact-artifact R1–R5, Desktop Cowork and independent
  second-machine results before `stablePublicReleaseReady` can become true.
- The deterministic package remains eligible for private beta after clean-build
  certification. Do not hot-upgrade an active controlled session.

