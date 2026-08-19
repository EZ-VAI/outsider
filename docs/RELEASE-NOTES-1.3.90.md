# Outsider 1.3.90

1.3.90 repairs a state-projection failure exposed by the formal R5 endurance run.

The 1.3.89 controller successfully formed a real three-node Agent Team, confined
the two named teammates to their frozen source slices, independently verified both
completions, and caught a deep expired-lease bug after the public suite was green.
Its supervisor then proposed the correct narrow repair in `src/index.js`. However,
correction-authority v2 unconditionally prepended the frozen team bootstrap actions
to every later correction. That would have reopened completed tasks and respawned
already-bound teammates, so both independent factual audits correctly rejected the
authority and the run ended conservatively.

This release makes coordination projection state-aware:

- a correction adds `ensureTask` only when the corresponding owner, slice and
  dependency structure are still missing from the observed shared task graph;
- it adds `spawnTeammate` only when that named teammate has not already been bound
  or independently completed its owned task;
- late code repairs therefore preserve completed teammate work instead of turning a
  narrow diagnosis into a full team restart;
- direct model-requested task/spawn actions are subject to the same observed-state
  filter as controller-derived frozen coordination actions;
- the factual auditor remains unchanged and fail-closed. This is a liveness and
  authority-minimization repair, not a relaxation of the causal proof.

The exact regression reproduces the R5 state: both teammate slices are completed,
the lead integration task is established, and the only authorized actions are the
lead edit, frozen acceptance, and semantic re-verification. No task reopen, teammate
respawn, or setup prose survives projection.

Verification on release source: 444/444 unit and integration tests plus 125/125
deterministic gate-corpus cases. R5 endurance evidence remains version-scoped and
must be produced by this immutable 1.3.90 artifact; this note does not pre-claim it.
