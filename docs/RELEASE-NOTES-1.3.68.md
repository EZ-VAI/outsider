# Outsider 1.3.68

1.3.68 fixes a liveness failure found by the first exact-artifact formal R5
endurance attempt. That failed 1.3.67 run remains preserved as non-certifying
supervision data.

## Red acceptance must receive an actionable correction

- When a controller-owned evaluator shift has completed every preregistered
  action but frozen acceptance is still red, a read/rerun-only correction can
  no longer obtain authority even if a model factual auditor says PASS.
- The deterministic floor requires an artifact mutation (`edit` or `delete`)
  before the proposal can be delivered. The supervisor receives the exact
  rejection and may rediagnose within the existing correction node; no new LLM
  judge was added.
- Normal run-only verification corrections and ephemeral probe artifacts remain
  supported outside this exact completed-shift/red-acceptance state.

## Endurance evaluator cannot wait forever on a lost causal chain

- An R5 recovery drill now terminates with the explicit non-certifying reason
  `RECOVERY_DRILL_DELIVERED_CORRECTION_UNRESOLVED` when every delivered
  correction is durably unresolved and a later unattributed green outcome
  proves that the old intervention can no longer close.
- This is a fail-fast evidence failure, not a false green and not a claim that
  the artifact is wrong.

## Verification discipline

- Source regression: 411/411 tests and 125/125 corpus checks, with zero false
  interruptions and zero slips, before the immutable artifact build.
- Historical R1–R4 results for 1.3.67 do not certify 1.3.68. R1–R5 and the
  remaining host gates must run against the exact 1.3.68 artifact.
- All paid evaluation calls remain pinned to Sonnet/low. Do not hot-upgrade an
  active controlled session.
