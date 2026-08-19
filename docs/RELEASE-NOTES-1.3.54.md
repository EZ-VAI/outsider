# Outsider 1.3.54

1.3.54 is a private-beta candidate with two bounded changes.

First, the endurance evaluator now publishes the active controller-owned shift
as a deterministic temporal fact. Diagnosis, clearance audit and outcome
verification see the same completed steps, proposed step and expected next
step. Future preregistered steps are explicitly not current omissions. Warmup
dispatch also closes on its matching completion event. This fixes the evaluator
ambiguity observed in the aborted 1.3.53 smoke without adding a judge or
loosening proof.

Second, Global Outsider now has a provider-neutral signed task-plan layer. A
plan freezes each task's operator, instrument, Way, dependencies, scope,
expected inputs and maximum claim. It grants no execution authority. Each
operator accepts by signing its own task-bound checkpoint. The durable monitor
rejects premature dependencies, run forks, ownership substitution and artifact
substitution. Task-bound bilateral handoffs require both parties to verify the
same frozen plan before signing. Monitor output includes a content-addressed
routing/liveness supervision record that is explicitly ineligible for causal
effect, reliability, loss, pricing, guarantee or settlement learning.

Deterministic verification for the frozen source candidate is 385/385 product
tests and 125/125 corpus cases. This is not evidence that four independent
companies completed a real provider chain, and it does not replace immutable
R1–R5 field runs. Stable public release remains blocked until those
version-scoped runtime gates, including multi-hour endurance, pass.
