# Outsider 1.3.31

This candidate turns the post-1.3.30 reliability work into an auditable R1–R5
evaluation surface. It does not claim those gates have passed merely because
their harnesses exist.

## Causal and terminal integrity

- transient semantic-audit transport/schema failures retain the same
  intervention id and correction-authority hash instead of silently breaking
  attribution;
- final delivery proof is bound to the final workspace fingerprint and its
  exact PASS audit, so a stale earlier verdict cannot authorize a changed tree;
- controller finalization drains admitted hook work, fences late work, releases
  its lease and only then seals an event stream whose terminal event is final;
- verified delivery without causal attribution remains a distinct terminal
  state and never counts as Stage 0.5 intervention success.

## Multi-agent and recovery evidence

- Agent Team identity requires a host teammate-spawn receipt joined with the
  matching lifecycle registration/context; ordinary async subagents cannot be
  promoted by shared transcript lineage;
- task ownership, successful file effects, per-slice checks, completion and
  lead integration are bound to exact actor/tool/task identities;
- recovery journals preserve intervention and authority identity across
  controller SIGKILL windows without treating a persisted message as observed.

## Supervision data and cost control

- every sealed terminal run exports a hash-bound
  `outsider/supervised-experience/v2` derivative with separate delivery and
  Outsider-causal labels; risk/capacity fields are observation-only and do not
  establish loss or liability;
- R1–R5 evaluators default to Sonnet with low effort instead of inheriting an
  expensive account default;
- headless evaluation publishes a per-process and aggregate nominal budget;
  interactive Agent Team/endurance runs require an explicit acknowledgement
  that Claude's PTY surface does not enforce a dollar hard cap;
- an evaluation-only Claude launch guard rejects Opus/elevated effort and
  enforces preregistered process and per-process limits before launch.

## Claim boundary

The deterministic test suite and packaging checks establish implementation
integrity only. R1 repeatability, R2/R3 real Agent Team conformance, R4 crash
recovery and R5 multi-hour endurance remain version-scoped empirical gates and
must be reported from immutable 1.3.31 artifacts.
