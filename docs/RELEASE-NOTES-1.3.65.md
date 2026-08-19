# Outsider 1.3.65

1.3.65 supersedes the failed 1.3.64 R5 candidate. The 1.3.64 run is preserved
as a sealed, non-certifying failure: it proved correct delivery, a real
two-member Agent Team, controller recovery, and one complete audited
correction-to-effect chain, but it did not reach the preregistered two-hour
witness because the evaluator deadlocked before checkpoint continuation.

## Recovery continuation liveness

- A resolved recovery correction now unlocks its one-shot checkpoint
  continuation from the same independently approved Stop that produced the
  green acceptance and outcome verdict.
- The controller's real event order is explicitly enforced as
  `effect -> Stop -> acceptance green -> outcome pass -> intervention_resolved`.
  The old evaluator incorrectly required a second Stop after resolution while
  also withholding the only wake that could produce that Stop.
- The continuation remains one-shot, marker-absence gated, and bound to the
  audited intervention and authority hash. It cannot run before repair or
  without an independently approved outcome.

## Recovery evidence attribution

- Certification no longer freezes the first correction proposal forever when
  the injected defect remains present and a later Stop issues a fresh repair.
- A later retry receives recovery-drill credit only when its audited authority
  names the exact preregistered marker path and preimage, and its observed
  effect matches that same typed delete action.
- Unrelated later corrections, missing effect matches, and incomplete proposals
  remain ineligible. Explicit semantic-patrol supersession remains supported.

## Honest evaluator telemetry

- Worker shell-loop violations and evaluator aborts are now separate fields.
  A signal, infrastructure failure, or evaluation failure still blocks the
  release, but is no longer mislabeled as worker misconduct.

## Verification and claim boundary

- Complete deterministic suite: 405/405.
- Gate corpus: 125/125.
- The failed 1.3.64 run consumed 23 bounded headless Sonnet/low calls (nominal
  ceiling `$13.80`) plus one unmetered interactive worker. It reached 20m50s
  and one external checkpoint, so it is not multi-hour endurance evidence.
- Its sealed Stage 0.5 proof and supervised Experience remain valid within
  their narrower delivery/causal boundary, but they do not become R5 evidence.
- `stablePublicReleaseReady` remains false until this exact immutable artifact
  passes a fresh formal R5 and the other release-certificate field gates.
- Do not hot-upgrade an active controlled session.
