# Outsider 1.3.85

1.3.85 fixes two fail-closed evaluator wiring defects exposed by the first
successful 1.3.84 real Agent Team delivery.

## Field evidence

The 1.3.84 run created exactly three shared tasks, spawned two real Sonnet
teammates, bound distinct host identities, recorded one changed file effect and
one successful slice check per teammate, independently verified both task
completions, ran the lead integration check, and sealed a correct
`SAFE_DELIVERY`. The product proof was complete, but the external R2 evaluator
returned false. That historical result is not relabeled.

## Repairs

- A required named Agent may now make one initial delegation attempt that
  Outsider denies before spawn, then retry with the byte-bound shared-task
  prompt. The evaluator accepts that retry only when the unmatched PreToolUse
  is bound to the exact `team_delegation_binding_required` event, teammate name
  hash and tool-use hash. Extra, unnamed or unbound Agent attempts still fail.
- PostToolUse now reads the same frozen Agent Team policy used by PreToolUse.
  Exact teammate checks and the lead integration check—including only the
  frozen workspace `cd` wrapper—therefore carry their preregistered check hash
  into the event chain.

## Evidence boundary

These changes repair measurement of an already-observed successful product
path; they do not convert the 1.3.84 run into 1.3.85 release evidence. Stable
public readiness still requires fresh exact-artifact R1-R5 results.

Deterministic verification at freeze: 435/435 product tests and 125/125 policy
corpus cases.
