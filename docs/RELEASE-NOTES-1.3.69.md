# Outsider 1.3.69

1.3.69 fixes two fail-closed evidence-harness defects found by the first
exact-artifact 1.3.68 formal R5 attempt. The controller in that run detected
and repaired both semantic drifts, survived a real SIGKILL, independently
verified the delivery, and sealed a complete causal proof. The sample remains
non-certifying because its external duration and strict team choreography did
not satisfy the preregistered R5 claim.

## Recovery checkpoint wake is monotonic-clock gated

- A recovery correction may finish shortly before the next external
  checkpoint is due. The one-shot checkpoint continuation is now dispatched
  only after the witness's monotonic minimum interval has elapsed.
- A too-early continuation can no longer consume its sole dispatch and leave
  the evaluator waiting forever with an unsatisfied checkpoint count.
- The gate uses the controller-external monotonic witness; it does not trust
  worker prose, wall-clock edits, or a workspace file.

## Strict Agent Team samples fail early on exclusive-file drift

- Formal R5 preregisters one exclusive source file per teammate. A confirmed
  lead or different canonical teammate mutation of that file now terminates
  the sample immediately as
  `AGENT_TEAM_EXCLUSIVE_FILE_OWNERSHIP_VIOLATED`.
- Reverting the bytes can repair the artifact but cannot retroactively make the
  promised division of work true. The certifier remains strict; the new rule
  only prevents a doomed sample from consuming the remaining two-hour budget.
- Raw pre-binding host identities are not guessed. Their append-only
  teammate-spawn reconciliation remains the authority for the host race.

## Verification discipline

- Source regression: 412/412 tests and 125/125 corpus checks, with zero false
  interruptions and zero slips, before the immutable artifact build.
- Historical 1.3.68 R1–R4 successes do not certify 1.3.69. R1–R5 and the
  remaining host gates must run against the exact 1.3.69 artifact.
- All paid evaluation calls remain pinned to Sonnet/low. Do not hot-upgrade an
  active controlled session.
