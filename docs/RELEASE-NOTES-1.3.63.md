# Outsider 1.3.63

1.3.63 supersedes the unrun 1.3.62 private-beta candidate.  The first 1.3.62
formal command stopped before launching Claude because the R5 preregistration
requested 28 bounded model processes while the executable guard still enforced
an older product-wide maximum of 24.  No model process ran and no live evidence
was produced; 1.3.62 is not an R5 result.

## One budget contract

- The evaluator builder and the executable Claude launch guard now import one
  finite `MAX_EVALUATION_MODEL_PROCESSES` value.
- The shared ceiling is exactly 28.  R5 may preregister 28; 29 is rejected both
  while materializing the runtime and at the executable boundary.
- Per-process dollar caps, Sonnet/low enforcement, the append-only invocation
  ledger and the requirement to acknowledge the one unmetered interactive
  worker are unchanged.
- Regression coverage runs all 28 dry-run reservations, rejects reservation 29
  and rejects a requested product ceiling of 29.  A source-level declaration
  alone is no longer considered evidence that the runtime can launch.

## Inherited 1.3.62 changes

- A resolved audited recovery repair receives at most one deterministic
  checkpoint-only continuation when its preregistered recovery checkpoint is
  still missing.
- A clearance that contradicts controller-owned red acceptance is rejected
  deterministically without purchasing a redundant LLM auditor call.
- Formal R5 requires four usable patrol verdicts and retains the 25-controller /
  28-total-process finite ceiling.

## Verification and claim boundary

- Focused budget/endurance tests: 27/27.
- Gate corpus: 125/125.
- The complete suite and packaged-artifact replay must pass before the 1.3.63
  artifact is frozen.
- `stablePublicReleaseReady` remains false until this exact artifact passes the
  formal two-hour R5 and the remaining release-certificate field gates.
- Historical 1.3.61/1.3.62 evidence cannot be inherited as a 1.3.63 pass.
- Do not hot-upgrade an active controlled session.
