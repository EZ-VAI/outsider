# Outsider 1.3.53

1.3.53 is a private-beta endurance candidate. The aborted 1.3.52 smoke proved
that its first semantic patrol and real controller SIGKILL/recovery worked, but
also exposed an evaluator-only protocol mismatch: the warmup prompt and
preregistration contained eight actions while the generated frozen protocol
still described five.

The warmup action list is now one executable source of truth. The worker prompt,
generated `ENDURANCE-PROTOCOL.md`, and preregistration all derive from the same
five-read/three-command list; a regression requires those projections to stay
connected. The 1.3.52 smoke is retained as invalid evaluator evidence and is not
counted as R5.

No product authority, detector, semantic judge, or certification threshold was
changed. R1-R5 must be rerun on the immutable 1.3.53 artifact before any release
claim is upgraded.
