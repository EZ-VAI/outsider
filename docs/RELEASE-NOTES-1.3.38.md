# Outsider 1.3.38

Private-beta candidate for bounded live and endurance evaluation.  It does not
promote any older R1–R5 run into evidence for this source closure.

The evaluation runtime now enforces one shared launch ledger across worker and
supervisor processes.  Every model-bearing launch is pinned to Sonnet with low
effort.  Headless launches are limited to at most USD 2 per process.  The
generic live canary allows at most 16 model processes; R5 smoke allows 20 and
formal endurance allows 24.  Slot reservation is atomic, so concurrent starts
cannot exceed the registered ceiling.

Interactive Claude does not expose an enforceable dollar budget.  R5 therefore
continues to require explicit acknowledgement and records the honest boundary:
model, effort, model-process count, and wall clock are bounded, but aggregate
dollars are not a hard guarantee.

The former R5 controller ceiling of 96 calls is removed.  Smoke is limited to
16 runtime supervisor calls and formal endurance to 20.  Exhaustion is a
conservative incomplete run, never a successful delivery.

Deterministic verification before the version bump: package tests 348/348 and
the gate corpus 125/125.  R1–R4 evidence remains version-scoped to older
artifacts and R5 remains unpassed until a new immutable 1.3.38 run succeeds.
This release establishes no stable public readiness, production actuarial
probability, financial price, reserve, coverage, or payout authority.
