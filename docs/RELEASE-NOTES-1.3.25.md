# Outsider 1.3.25

Agent Team task-completion transaction repair after the immutable 1.3.24 R2
field canary exposed a host/controller deadlock.

- A teammate's `TaskUpdate(status=completed)` now remains a two-phase
  transaction: PreToolUse durably records the exact completion intent,
  TaskCompleted independently audits the owned slice, and only the matching
  successful PostToolUse commits `completed`.
- Supervisor and clearance-audit evidence explicitly identify the
  `before-host-task-update-commit` phase. An expected `in_progress` or
  `awaiting-verification` state can no longer be misdiagnosed as a missing
  completion or trigger a request to repeat TaskUpdate.
- The gate still rejects missing, ambiguous, stale-generation, mismatched-
  identity, failed-host, out-of-scope, or unverified completion attempts.
- A regression reproduces the real host order and proves the append-only chain
  `intent -> independently verified pending host -> successful PostToolUse ->
  team_task_completed`.
- No detector, LLM judge, worker permission, proof threshold, or pricing
  authority was added.

The immutable 1.3.24 R2 run remains a conservative failure and a valid
operational-risk Experience record. It is not pooled with 1.3.25. R1 through
R5 must be regenerated on the immutable 1.3.25 artifact and preregistered
evaluator hashes.
