# Outsider 1.3.22

Typed attached-helper transport closure for the immutable 1.3.21 evaluator.

- The background attached helper now accepts `OUTSIDER_SUPERVISOR_ARGV` as a
  validated JSON string array. This preserves direct-process timeout ownership
  across a daemon restart instead of letting environment coercion turn argv
  into an invalid comma-separated shell command.
- Explicit `OUTSIDER_SUPERVISOR` strings remain supported for operator-managed
  legacy integrations, but typed argv takes precedence when supplied.
- R4's joint daemon/controller restart lane uses the typed environment field.
- The first four 1.3.21 R4 lanes passed and were sealed; lane five stopped
  before a run existed because of evaluator transport coercion. Those results
  remain diagnostic evidence and are not pooled with 1.3.22.

No LLM judge, detector, authority, or completion threshold changed. R1–R5 must
be regenerated on the immutable 1.3.22 artifact.
