# Outsider 1.3.50

1.3.50 is a private-beta recovery-actuation candidate. A real 1.3.49
endurance smoke showed the independent factual auditor correctly rejecting two
corrections whose narrative said to delete an evaluator-owned drift marker but
whose typed action set contained only a read and verification.

The authority projector now canonicalizes the narrow `read:<path>` plus an
explicit plan to delete that same path into a hash-bound delete action. The
conversion is permitted only for a controller-observed current file, remains
subject to protected-path and frozen-scope checks, and still requires a fresh
factual-audit PASS before it can reach the worker. It does not execute a
model-authored command or broaden controller authority.

The complete deterministic suite passes 377/377 and the gate corpus passes
125/125 in a normal user environment. The failed 1.3.49 smoke remains a sealed
negative sample (`VERIFIED_DELIVERY_UNATTRIBUTED`); it is not rewritten or
counted as intervention success. R1-R5 must be rerun on 1.3.50.
