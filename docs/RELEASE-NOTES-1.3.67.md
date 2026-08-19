# Outsider 1.3.67

1.3.67 closes the last exact-artifact gap in the formal R5 endurance protocol.

## One artifact, all reliability gates

- R2, R3 and formal R5 now share one deterministic artifact-freezing utility.
- Formal R5 refuses to start without `--artifact`. It extracts the tarball,
  compares every packaged file with the executing runtime, copies the exact
  bytes into the experiment directory, and seals the artifact identity in the
  endurance preregistration before any worker or supervisor starts.
- The artifact-binding implementation itself is included in the evaluator hash
  closure, so changing the freezer invalidates the experiment.
- Release certification requires the endurance evidence's frozen artifact hash
  and package version, in addition to the existing controller/runner/hook/
  contract/outcome runtime hashes.

## Verification

- The previous 1.3.66 package passed 408/408 tests, 125/125 corpus checks and all
  five exact-artifact R4 crash lanes. Those results remain historical evidence
  for 1.3.66 only.
- 1.3.67 must pass its own deterministic suite, package certification and R4.
  R1–R3, Desktop Cowork, R5 and an independent second machine remain field gates
  for stable public release.
- No model call or credit spend is needed to build or execute R4. Do not
  hot-upgrade an active controlled session.

