# Outsider 1.3.91

1.3.91 is the single consolidated repair release derived from the complete,
sealed 1.3.90 formal R5 failure corpus. It does not change the R5 evaluator or
relax any release criterion.

The 1.3.90 run formed a real Agent Team, enforced exclusive teammate slices,
survived an injected controller crash, independently completed both teammate
tasks, and caught a hidden status-alphabet violation after public and sealed
acceptance were green. It then exposed five connected controller defects before
being evaluator-aborted and permanently sealed:

- supervisor narrative prose could upgrade a typed `edit`/`read` into destructive
  `delete` authority merely by mentioning deletion;
- arbitrary model plan prose was copied into the worker correction channel,
  allowing stale setup instructions to regain control authority;
- the state-aware authority projection could miss an already-established lead
  task because its exact paths were present in the task description rather than
  its abbreviated subject;
- lead-owned integration files and the integration task could start before both
  frozen teammate dependencies had independently completed;
- a post-correction, host-confirmed `teammate_spawned` identity binding was not
  credited as the causal effect of its matching spawn action; and a red
  integration branch incorrectly retained `independentlyVerified=true`.

This release fixes the complete set together:

- destructive authority now requires an explicit typed `delete:` action. Drift
  and plan prose are durable telemetry only and can never escalate an action;
- worker repair instructions are deterministic projections of audited typed
  actions and frozen defect claims. Model-authored plan prose is no longer sent
  as control-plane authority;
- coordination evidence carries bounded task descriptions, and task reuse checks
  subject, description, touched paths, owner, dependencies and completion state;
- the controller deterministically blocks lead integration writes and
  `in_progress`/`running` task transitions until the exact shared graph exists and
  every dependency has completed its independent gate;
- a successful host identity binding after correction observation emits exactly
  one hash-bound expected-action/effect pair on the original intervention;
- integration corrections leave the task honestly blocked and unverified, with
  no completion timestamp; duplicate projected probe authority is removed.

New regressions reproduce each R5 event shape, including narrative references to
a prior wrong deletion, description-only lead paths, pre-graph lead writes,
blocked task startup, post-observation teammate binding, duplicate probes, and red
integration state. Verification on release source is 448/448 unit/integration/
SIGKILL recovery tests plus 125/125 deterministic gate-corpus cases.

R5 endurance evidence remains version-scoped and must be produced by this exact
immutable 1.3.91 artifact. This note does not pre-claim a two-hour PASS or stable
public-release readiness.
