# Outsider 1.3.58

1.3.58 is a private-beta release candidate for the R5 endurance gate. It is not a stable-release claim: the new artifact has not yet completed a fresh multi-hour live run.

## Changed

- Exact, successful, controller-preregistered checkpoint shifts may reuse the prior independently audited Stop outcome for the same intervention and content fingerprint. Recovery drills, edits, failures, unclassified actions, and fingerprint changes still require fresh semantic judgment.
- Final outcome evidence now carries the bounded controller-owned repair chain: failed sealed acceptance, pause, diagnosis authority hash, factual audit, correction delivery and observation, measured effect, and green re-acceptance. Supervisor prose and unbounded raw logs are not promoted into authority.
- Candidate corrections no longer require an earlier `OUTSIDER_INTERVENTION` to authorize themselves. A candidate becomes an intervention only after its own fresh factual audit passes; `delete:` is now an explicit typed expected-action prefix.
- The endurance recovery protocol forbids a worker from re-reading, hashing, or statting an evaluator marker after the factual auditor has already validated its exact preimage.
- Active checkpoint evidence records exact completion count, unmapped actions, and PostTool success; content-addressed reuse fails closed unless the sequence is complete and exact.
- Evaluator shutdown is now a bounded two-stage process-group operation: TERM is followed by SIGKILL only if the exact PTY worker group remains alive. SIGINT/SIGTERM no longer leave an orphan Claude process consuming credits.

## Verification boundary

- Deterministic product suite: 395/395.
- Gate corpus: 125/125.
- R1-R4 live evidence exists for 1.3.57 and is historical evidence only; it is not silently inherited by this artifact.
- R5 smoke runs exposed and motivated the changes above, but the post-fix paid smoke and multi-hour endurance run remain `NOT_RUN` because the configured credit stop required renewed operator authorization.
- `stablePublicReleaseReady` must remain false until a fresh immutable 1.3.58 artifact passes the live R1-R5 gates, including the multi-hour endurance witness.
- Do not hot-upgrade an active controlled session. Finish or conservatively terminate it before installing this version.
