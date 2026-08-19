# Outsider 1.3.36

Private-beta R3 protocol candidate focused on deterministic multi-Agent
continuation and evaluation cost control.

The immutable 1.3.35 formal run terminated conservatively before the planned
integration fault. Its worker graph was still unfinished, but the controller
spent semantic-supervisor calls asking whether that mechanically visible fact
was on track. The artifact was not released and no causal-success label was
created. That run remains useful capacity and conservative-stop Experience; it
is not an R3 success.

1.3.36 makes an explicitly unfinished Team graph a deterministic continuation.
At Stop, the controller lists the existing task owners, dependencies and open
conflicts, directs the lead to continue those tasks, and records
`coordination_continuation_emitted` with
`authority: deterministic-task-graph` and `modelCallUsed: false`. It does not
create replacement tasks, add a semantic judge, relax acceptance, or permit an
unfinished graph to complete. A due periodic patrol on a completion-intent
boundary remains deferred to the actor-bound TaskCompleted gate.

On the observed R3 path this removes roughly four to six redundant Sonnet/low
control-plane calls per run. Any real R3 run is still subject to the separate
aggregate process guard and nominal per-process budget; no uncapped rerun is
authorized by this release.

Verification before freeze: package tests 334/334 and deterministic corpus
125/125. The immutable 1.3.34 run remains a valid audited-causal supervised
Experience but not a formal R3 protocol pass because its correction used the
periodic `PreToolUse.deny` channel rather than the preregistered
`TaskCompleted.exit2` channel.

R1–R5 remain immutable, version-scoped empirical gates. This note establishes
no stable public readiness, DeepSeek intervention authority, Stage 1–4
financial claim, or long-duration reliability result.
