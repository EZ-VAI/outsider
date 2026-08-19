# Outsider 1.3.79

1.3.79 fixes a deterministic release-gate startup contradiction found before
the formal R5 worker launched.  Formal endurance preregisters 61 possible
Sonnet/low processes (31 on the expected no-retry path, plus one retry for
every JSON judge), while the shared executable guard still rejected every
value above the historical 28-process ceiling.

- The product-wide evaluation guard ceiling is now 64.
- Formal R5 remains individually capped at 61 processes and $0.60 per
  headless process; the interactive worker remains explicitly acknowledged as
  not dollar-hard-capped.
- Regression coverage proves the exact 61-process R5 envelope can be
  materialized and 65 is rejected.

This is an evaluator-instrument change.  Evidence from 1.3.78 is not pooled
into 1.3.79 release claims; R1-R5 must be rerun against the new immutable
artifact.
