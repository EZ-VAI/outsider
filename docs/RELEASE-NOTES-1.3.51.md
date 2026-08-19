# Outsider 1.3.51

1.3.51 is a private-beta endurance candidate. It retains the 1.3.50
hash-bound deletion authority and removes a deterministic smoke-harness
measurement collision: the initial smoke turn and the evaluator patrol warmup
both required the same four source reads, causing the semantic patrol to spend
its budget debating evaluator-mandated duplicate work.

The initial non-certifying smoke turn now performs only the frozen acceptance
and first checkpoint. The single evaluator-owned warmup performs the first four
source reads and triggers the real patrol after the initial obligations are
already complete. Formal R5 Agent Team choreography, recovery drill, duration,
checkpoint, and causal-proof requirements are unchanged.

This is an evaluator liveness fix, not R5 evidence. R1-R5 must be rerun on the
immutable 1.3.51 artifact before any release claim is upgraded.
