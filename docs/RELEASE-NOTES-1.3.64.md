# Outsider 1.3.64

1.3.64 supersedes the failed 1.3.63 R5 private-beta candidate. The 1.3.63
formal run launched one interactive worker and two bounded Sonnet/low headless
calls, then failed before producing R5 evidence. It is preserved as a failed
evaluation run and must not be pooled with successful evidence.

## Evaluator prompt isolation

- The initial worker mandate no longer describes the path, contents, preimage,
  or required mutation of a future controller-owned recovery fault.
- A later recovery action is authorized only by a live, audited correction
  carrying its own evidence. The initial task grants no standing repair
  authority.
- The synthetic fault remains controller-owned and is still measured by the
  same sealed recovery-chain requirements; this change removes answer leakage,
  not the recovery requirement.

## Bounded evaluator liveness

- Evaluator-owned telemetry now uses one explicit five-minute bounded RPC
  deadline. It can wait behind the controller's synchronous semantic judge
  instead of failing at the watchdog's ordinary ten-second hook deadline.
- The monitor promise receives a rejection handler immediately. If it fails
  while the main task is waiting for the interactive worker, the evaluator
  terminates that worker process group at once and rethrows through the normal
  result/cleanup path.
- Regression tests prohibit direct evaluator `run.record(...)` calls, require
  the extended deadline, and require monitor failure to own immediate worker
  cleanup.

## Verification and claim boundary

- Complete deterministic suite: 404/404.
- Gate corpus: 125/125.
- The initial-prompt isolation and evaluator-liveness regressions pass.
- The 1.3.63 attempt consumed at most $1.20 of bounded headless budget plus one
  briefly running unmetered interactive worker. It did not establish safety,
  endurance, multi-agent reliability, or release evidence for 1.3.64.
- `stablePublicReleaseReady` remains false until this exact immutable artifact
  passes the formal two-hour R5 and the remaining release-certificate field
  gates. Historical versions cannot supply that pass.
- Do not hot-upgrade an active controlled session.
