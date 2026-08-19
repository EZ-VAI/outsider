# Outsider 1.3.18

Private-beta reliability build for the R1 pre-worker JSON repair failure found
in the immutable 1.3.17 repeatability batch.

- Contract compilation and independent contract audit still receive at most one
  bounded retry. The retry now includes the exact JSON/schema repair feedback
  produced by the typed response parser instead of repeating the identical
  prompt.
- Invalid JSON remains fail-closed. This change does not add a judge, widen the
  contract, or allow prose to authorize a worker.
- The 1.3.17 R1 experiment remains a versioned negative result: two complete
  causal deliveries followed by one pre-worker invalid-JSON infrastructure
  failure. It is not deleted, retried in place, or pooled with 1.3.18.
- R1 through R5 field evidence must be regenerated against the immutable
  1.3.18 artifact before it can support a same-version reliability claim.

Do not hot-upgrade a running controlled session. Finish or stop it, then install
the new artifact and begin a fresh task.
