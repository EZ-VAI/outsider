# Outsider 1.3.70

1.3.70 fixes a causal-attribution false positive discovered by the first
exact-artifact 1.3.69 formal R5 run. That sample safely rejected a shallow
multi-agent integration and the worker later repaired the artifact, but the
old proof logic could credit the repair to an audited correction that had only
asked the worker to rerun acceptance. The aborted sample is retained as
negative supervised evidence and does not certify this release.

## Authority-matched effects

- A workspace diff is now a correction effect only when its path matches a
  typed edit/delete action frozen into that correction authority. Other
  post-correction changes are recorded as
  `unattributed_workspace_change_observed`, never as treatment effects.
- Executed `runRef:frozenAcceptance` actions are matched as an exact contiguous
  shell-command sequence. A normal leading `cd <workspace> &&` is accepted;
  prose, partial commands, reordered commands and failed exits are not.
- Every authoritative effect carries the exact artifact fingerprint observed
  after that action.

## Delivered-fingerprint causality

- `intervention_resolved` now requires an authority-matched effect on the same
  fingerprint that passes final mechanical and semantic acceptance.
- A later independent worker repair may still produce a verified delivery, but
  it is classified `VERIFIED_DELIVERY_UNATTRIBUTED` rather than a successful
  Outsider intervention.
- The causal-proof verifier independently enforces the same action and
  fingerprint binding. A controller event alone cannot manufacture causal
  credit.

## Learning and clearing data

- Supervised Experience adds `UNATTRIBUTED_WORKSPACE_CHANGE` and
  `CAUSAL_ATTRIBUTION_UNRESOLVED` risk observations.
- Each intervention chain now publishes a deterministic `causalIntegrity`
  result. `sealedComplete` is per-intervention and requires the matched effect,
  acceptance, outcome and resolution to share one artifact fingerprint and
  authority.
- This prevents self-repairs, later unrelated edits and valid-but-ineffective
  corrections from entering correction-effect training or future pricing as a
  successful treatment.

## Verification discipline

- Source regression: 415/415 tests and 125/125 corpus checks, with zero false
  interruptions and zero slips, before the immutable artifact build.
- Historical 1.3.69 gate results do not certify 1.3.70. R1–R5 and remaining
  host gates must run against the exact 1.3.70 artifact.
- All paid evaluation calls remain pinned to Sonnet/low. Do not hot-upgrade an
  active controlled session.
