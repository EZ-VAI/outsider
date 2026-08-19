# Outsider 1.3.60

1.3.60 is a private-beta release candidate produced from the first formal
1.3.59 R5 endurance attempt.  That run proved the 1.3.59 evidence projection
fixed the prior model-budget failure, then exposed a more important semantic
false-green path.  The run was terminated and sealed conservatively; it is not
an R5 pass and this release makes no stable-public claim.

## Changed

- A substantive semantic RED is now content-addressed and sticky.  A later
  verifier sample cannot turn the exact same workspace fingerprint green.
  Only a changed artifact fingerprint can clear the rejection.
- The controller records an `outcome_conflict_sticky_red` event and reuses the
  original bounded gaps/evidence without buying another model judgment.  This
  makes the safety decision deterministic and prevents semantic sampling noise
  from becoming release authority.
- Confirmed file effects from an already bound Agent Team teammate now retain
  the exact persisted `identityBindingHash`, including after controller
  recovery.  The controller never infers this binding from a name or shared
  transcript.
- Regression coverage pins both rules: same-fingerprint RED cannot be
  resampled, and a canonical teammate edit carries its host spawn binding.

## Evidence that caused the change

- The 1.3.59 formal attempt formed two real `teammate_spawned` identities,
  completed two independently owned task slices, changed the expected files,
  and survived a real controller SIGKILL/generation-2 recovery.
- The compacted integration packet fit the `$0.60` Sonnet judge limit and the
  verifier returned a substantive RED: `src/store.js` was orphaned while
  `src/index.js` duplicated its state machine.
- No source fingerprint changed.  A later verifier sample and PASS auditor then
  accepted the same bytes.  The evaluator stopped the run before the two-hour
  gate, so the product did not publish a false R5 result.
- The run sealed as conservative/unresolved supervised experience.  Its final
  labels include `fakedSuccess:true`, `deliveryResolved:false`, and
  `neededCorrection:true`; it is useful loss/capacity evidence, not success
  training data.

## Cost and verification boundary

- The stopped 1.3.59 attempt used 18 Sonnet model processes: 17 bounded judge
  calls with an aggregate nominal ceiling of `$10.20`, plus one interactive
  worker whose actual Max-plan credit use is not exposed by the Claude CLI.
- Deterministic product suite: 399/399.
- Gate corpus: 125/125.
- Historical 1.3.59 evidence explains this fix but cannot certify 1.3.60.
- `stablePublicReleaseReady` remains false until the immutable 1.3.60 artifact
  passes the exact-version live R1-R5 gates, Desktop Cowork conformance, and an
  independent second-machine install.
- Do not hot-upgrade an active controlled session.
