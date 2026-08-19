# Outsider 1.3.37

Private-beta candidate that freezes the post-R3/R4 deterministic work without
promoting any older run into evidence for this source closure.

The candidate adds three bounded capabilities:

1. Non-certifying R5 evaluation smoke cannot create `Agent` or shared `Task*`
   work, is capped at 20 supervisor calls, and can never satisfy the formal
   endurance result field.  This prevents the previous smoke's control-plane
   amplification from silently becoming a paid multi-agent workload.
2. Every sealed Stage 0.5 terminal run exports a hash-bound
   `outsider/supervised-experience/v2` derivative.  Delivery, Outsider causal
   contribution, correction-effect eligibility, and observed-only risk/capacity
   fields are separate; no event classification establishes loss or liability.
3. The DeepSeek Harness research adapter now has a pinned two-clock correction
   protocol and framework-neutral plugin core.  A delivery acknowledgement
   requires the exact durable message id, content hash, and plugin-source hash.
   The adapter remains outside the release closure until an authenticated
   gateway, pinned upstream build, and live canary exist.

Deterministic verification before this version bump: package tests 345/345,
corpus 125/125, Outsiderf bridge 255/255.  Those numbers are code verification,
not multi-hour endurance or production actuarial evidence.

R1–R4 artifacts remain immutable and version-scoped to 1.3.32/1.3.36.  R5 is
not passed.  This release establishes no stable public readiness, DeepSeek live
actuation, production reliability probability, financial price, reserve,
coverage, or payout authority.
