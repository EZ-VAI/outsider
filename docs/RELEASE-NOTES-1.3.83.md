# Outsider 1.3.83

1.3.83 closes a process-ownership defect discovered while independently
checking the 1.3.82 R4 evidence.

## Runtime process ownership

- Every detached runtime semantic judge now writes a private, atomic ownership
  record before it can run. The record binds the controller owner and
  generation to the judge PID, process group, platform session field, process
  start identity, and command hash.
- After a controller crash, the watchdog verifies the exact OS identity and
  kills only process groups owned by the replaced generation before starting a
  successor. A malformed record, PID reuse, identity mismatch, or surviving
  process fails recovery closed.
- Normal completion and timeout remove the ownership record. Recovery records
  the number inspected, terminated, stale, and remaining without exposing raw
  command text in public evidence.

## Honest R4 evidence

- The R4 evaluator no longer hard-codes `orphanJudgeProcesses: 0`.
- In-flight audit lanes read the real blocked oracle PID, require the recovered
  controller to report its termination, check the OS process table at lane
  completion, and check again after the two-minute stability window.
- A lane cannot pass with a live judge or a remaining ownership record. The
  batch result cannot pass merely because five result objects exist.

## Evidence boundary

The 1.3.82 R4 result is not release evidence: its orphan-process field was an
unmeasured constant. 1.3.83 requires a fresh immutable artifact and fresh
R1-R5 results. No previous field result is relabeled.

Deterministic verification at freeze: 432/432 product tests and 125/125 policy
corpus cases. Stable-public readiness still depends on fresh field gates for
this exact artifact.
