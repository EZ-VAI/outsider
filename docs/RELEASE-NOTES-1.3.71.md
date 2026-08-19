# Outsider 1.3.71

1.3.71 retains the authority-matched effect and delivered-fingerprint causal
proof introduced in 1.3.70, and fixes the supervised Experience projection
failure discovered by the exact-artifact 1.3.70 R1 gate.

All five 1.3.70 R1 workers independently delivered exact artifacts and the
kernel produced complete causal proofs. The immutable Experience exporter,
however, selected the first valid effect in an intervention even when
`intervention_resolved.causalEffectSeq` identified a later validation effect.
It consequently refused all five samples as treatment evidence. The failed
batch is retained as evaluator-negative evidence and does not certify this
release.

## Resolution-anchored Experience

- Experience reconstruction now starts from the sealed
  `intervention_resolved` event and its exact `causalEffectSeq`, authority hash
  and delivered fingerprint.
- It rebuilds the same intervention backwards through observed, emitted,
  factual-audit, verdict and pause, then forwards through acceptance and
  semantic outcome.
- Multiple legitimate effects remain visible. Only the effect explicitly
  referenced by resolution can confer causal treatment eligibility.
- A fallback diagnostic projection remains fail-closed and cannot create a
  sealed complete chain when the resolution anchor is absent or inconsistent.

## Verification discipline

- The regression fixture now includes two valid effects and asserts that the
  exported chain selects the second, resolution-referenced effect.
- The patch was replayed against a real sealed 1.3.70 R1 run: it selected seq
  50 rather than the earlier seq 45 and classified the chain
  `AUDITED_INTERVENTION_COMPLETE`.
- Historical 1.3.70 gate results do not certify 1.3.71. Every release gate must
  bind to the exact 1.3.71 artifact.
- All paid evaluation calls remain pinned to Sonnet/low. Do not hot-upgrade an
  active controlled session.
