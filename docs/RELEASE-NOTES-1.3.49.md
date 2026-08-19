# Outsider 1.3.49

1.3.49 is a private-beta endurance candidate. It preserves the 1.3.48
controller behavior and changes the formal R5 evaluator in two fail-closed ways:

- a run stops spending immediately when its preregistered exact Agent Team task
  or teammate-binding cardinality is irreversibly exceeded;
- the initial public queue test exposes lease-expiry replay, leaving the sealed
  probe and the evaluator-owned recovery drill to test deeper behavior and
  causal intervention instead of repeatedly consuming the long-run budget on
  an undisclosed setup defect.

The Agent Team mandate now also states that the lead must repair integration
failures itself or follow an audited Outsider correction. Recruiting a third
verifier/helper is a protocol failure, not a successful recovery.

The complete deterministic suite passes 377/377 and the gate corpus passes
125/125 in a normal user environment. R1-R5 must be rerun on this immutable
artifact. These changes do not by themselves constitute R5 endurance evidence
or stable-public-release evidence.
