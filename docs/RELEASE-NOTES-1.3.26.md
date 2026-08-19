# Outsider 1.3.26

Periodic-patrol attribution repair after the immutable 1.3.25 R3 field batch
exposed a control-plane race.

- Once an independently audited correction has been observed by the worker,
  a due periodic semantic patrol no longer replaces it before the worker gets
  its first bounded opportunity to produce an effect.
- The patrol clock remains live and records
  `semantic_patrol_deferred_pending_correction_effect`; the existing bounded
  follow-up review still takes over if the worker does not act.
- An unobserved intervention can still be superseded by a semantic patrol, so
  the change does not disable patrols while another intervention is open.
- Supervised Experience v2 records the new deferral count as observed host
  capacity. It is telemetry, not a loss, liability, causal-success, or pricing
  label.
- A regression reproduces the race and proves that intervention id, correction
  authority hash, and delivery channel remain stable through the first effect
  opportunity.
- No detector, LLM judge, worker permission, proof threshold, or pricing
  authority was added.

The 1.3.25 R3 batch remains immutable evidence: three formal passes, one
evaluator-only serial-resume mismatch, one conservative control-plane capacity
failure, and one later run that exposed this attribution race. None of those
runs is relabeled as 1.3.26 evidence. R1 through R5 must be regenerated against
the immutable 1.3.26 artifacts.
