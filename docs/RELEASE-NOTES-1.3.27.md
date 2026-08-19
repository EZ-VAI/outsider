# Outsider 1.3.27

Supervisor-insufficiency protocol repair after the immutable 1.3.26 R1 batch
measured four exact causal deliveries and one conservative causal stop.

- `insufficient` is now explicitly an exclusive control conclusion: it is for
  evidence missing from the decision, repair, or observable next actions, not
  for incidental provenance uncertainty.
- When a controller-owned semantic outcome is red and the same supervisor
  response already contains a complete off-track diagnosis, repair plan, and
  expected actions, a simultaneous `insufficient` note is recorded as
  `supervisor_insufficiency_reclassified_as_advisory` and the existing factual
  audit grades the typed correction authority.
- Incomplete verdicts, or verdicts without an independent semantic-red basis,
  remain fail-closed, spend no actuator dose, and continue to emit
  `supervisor_insufficient`.
- Supervised Experience v2 records both true insufficiency and advisory
  reclassification counts as observed judgment capacity. Neither field is a
  loss, liability, pricing, or causal-success label.
- No additional LLM call, judge, detector, worker permission, proof threshold,
  or pricing authority was added.

The 1.3.26 R1 batch is immutable: 4/5 strict causal deliveries, 5/5 exact final
artifacts, zero false greens, and one conservative stop caused by the now-fixed
protocol ambiguity. It is not relabeled as 1.3.27 evidence.
