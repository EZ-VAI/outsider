# Outsider 1.3.17

Evaluation-closure correction after the 1.3.16 R4 attempt.

The product passed R4 lanes 1–4. Lane 5 recovered the same attached run and
observed the same correction, but the evaluator's subsequent synthetic tool
events omitted the original `session_id`. The daemon correctly treated those
events as a second, uncontrolled transcript session and denied them. The R4
runner now carries the exact session identity through every post-recovery
boundary and requires the recovered intervention/authority pair to reach
`intervention_resolved` before lane 5 can pass.

No runtime control rule was relaxed. The failed 1.3.16 attempt is retained as an
evaluator-quality negative sample and is not pooled with 1.3.17.
