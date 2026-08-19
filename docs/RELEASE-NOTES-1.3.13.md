# Outsider 1.3.13

Private-beta reliability build for R3 multi-Agent integration correction.

- runs the frozen controller-owned acceptance at the lead integration
  `TaskCompleted` boundary instead of treating local teammate checks as global
  evidence;
- binds the integration task, dependency task IDs, acceptance exit, artifact
  fingerprint, outcome PASS audit and any intervention authority into
  `multi_agent_integration_verified`;
- refuses an `onTrack` clearance while executable integration evidence remains
  red;
- resolves a real TaskCompleted correction only after the same authority is
  observed, produces a matching effect, and the integration acceptance and
  semantic PASS audit are green;
- adds an evaluation-only, one-shot R3 mode whose composition failure is
  structurally injected at the integration boundary and sealed with the host
  protocol evidence. It does not add a product detector or model judge.

Do not hot-upgrade an active 1.3.12 session. R1 and R2 evidence produced by
1.3.12 remains valid for that immutable artifact but cannot be pooled into a
1.3.13 reliability rate. R1–R3 must be rerun on this closure before R4/R5.
