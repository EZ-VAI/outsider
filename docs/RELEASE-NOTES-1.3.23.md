# Outsider 1.3.23

R1 evaluator alignment after the immutable 1.3.22 field batch.

- R1 now requires exactly one complete, strictly ordered, authority-bound
  correction chain. An earlier correction that was explicitly marked
  unresolved no longer invalidates a later fresh intervention that independently
  reaches acceptance, semantic PASS, and resolution.
- Two complete chains still fail closed as ambiguous attribution. Missing links,
  authority mismatch, duplicate terminal events, or incomplete final proof are
  unchanged failures.
- This matches the product's existing `validateCausalProof` semantics; no
  controller proof rule, LLM judge, detector, authority, or threshold changed.
- The immutable 1.3.22 R1 result remains 4 complete deliveries plus 1 evaluator
  conservative stop, 0 false greens. Its aggregate evidence is not relabeled or
  pooled with 1.3.23.

R1 through R5 must be regenerated on the immutable 1.3.23 artifact and its
preregistered evaluator hashes.
