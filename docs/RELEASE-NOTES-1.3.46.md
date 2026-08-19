# Outsider 1.3.46

1.3.46 is a private-beta reliability candidate. It retains the 1.3.45
Sonnet/low launch guard for every R1–R5 worker and semantic judge, and fixes a
strict R1 evaluator timing edge found by the first immutable 1.3.45 run.

All five 1.3.45 workers produced exact artifacts and complete causal chains,
but one run's measured 120-second post-seal observation was a few milliseconds
short of the preregistered minimum. The evaluator correctly refused the batch.
1.3.46 waits one additional second while still recording actual elapsed time;
it never rounds or rewrites evidence.

R1–R5 must be rerun on the immutable 1.3.46 artifact. This remains a private
beta, not a stable public release, pricing result, guarantee, settlement
instruction, or independent-second-machine proof. Do not hot-upgrade an active
session.
