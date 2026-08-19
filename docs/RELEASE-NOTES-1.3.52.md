# Outsider 1.3.52

1.3.52 is a private-beta endurance candidate. It replaces the internally
contradictory 1.3.51 smoke schedule with one frozen, finite initial shift: four
separate source reads, mechanical acceptance, the first checkpoint, and a
final protocol read that makes the first semantic patrol due only after every
initial obligation is observable.

The fresh supervisor now receives the same deterministic rule already enforced
by the mechanical controller: exact checks inside an active, evaluator-owned
bounded shift are required measurement actions, not worker polling or token
waste. A fallback patrol warmup contains exactly one patrol cadence of bounded
actions, records no time checkpoint, and cannot satisfy endurance duration.

No detector, semantic judge, or execution authority was added. The change
aligns the evaluator, frozen contract, and semantic evidence. Deterministic
verification before the version bump: package tests 378/378 and corpus 125/125.
R1-R5 must be rerun on the immutable 1.3.52 artifact before any release claim
is upgraded.
