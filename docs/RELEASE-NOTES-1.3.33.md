# Outsider 1.3.33

Private-beta reliability candidate created from one conservative R3 Agent Team
failure on immutable 1.3.32. No earlier R1–R5 result is relabeled as 1.3.33
evidence.

## Bound teammate completion remains attributable

Claude 2.1.219 can emit `SubagentStop` for a real teammate before that member
has issued its own `TaskUpdate(completed)` transaction. 1.3.32's generic
subagent fallback could then mark the owned task complete after a semantic
clearance. A later lead-side reconciliation did not prove that the teammate
itself completed the task, so strict R3 conformance correctly failed.

1.3.33 makes this host protocol deterministic. A canonical `teammate:*` actor
cannot use `SubagentStop` as a completion shortcut. It receives a visible
exit-2 continuation requiring the same member to complete the ordered
`TaskUpdate(completed) → TaskCompleted → successful PostToolUse` transaction.
No new LLM detector or judge is involved.

## Content-addressed integration verdict reuse

The same R3 run independently approved the repaired integration fingerprint,
then spent the last two model calls re-verifying that unchanged tree at Stop.
The finite evaluation budget expired on the duplicate call and the run ended
conservatively.

When Stop observes the exact same intervention ID and artifact fingerprint as
an earlier controller-owned green integration acceptance, PASS outcome, and
independent approval audit, 1.3.33 now reuses that immutable evidence. It emits
a new Stop-phase verdict linked to the original outcome, acceptance, and audit
sequences so strict causal ordering remains explicit. A different fingerprint,
intervention, missing audit, red/insufficient verdict, or merely green command
cannot use this path.

## Verification and evidence boundary

- full package tests: 330/330 before version freeze;
- deterministic detector corpus: 125/125;
- focused regressions prove both completion enforcement and same-fingerprint
  reuse while retaining stale-fingerprint and unbound-TaskCompleted failures;
- the failed 1.3.32 R3 directory remains a sealed `CONSERVATIVE_STOP` Experience
  record and is not training-eligible correction success.

This release note does not establish 1.3.33 R1 repeatability, R2 Agent Team
delivery, R3 integration correction, R4 crash recovery, R5 endurance, stable
public readiness, DeepSeek intervention authority, or any Stage 1–4 financial
claim. Those remain version-scoped empirical gates.
