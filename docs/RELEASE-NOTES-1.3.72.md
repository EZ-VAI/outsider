# Outsider 1.3.72

1.3.72 closes an evidence-projection and release-gate gap discovered by the
exact-artifact 1.3.71 R3 run. The live controller produced a real, complete
integration correction chain, but the supervised Experience exporter only
recognized Stop-phase acceptance and outcome events. The immutable 1.3.71 R3
result therefore reported protocol success while its learning record correctly
remained unattributed. That run is retained as evaluator-negative evidence and
does not certify this release.

## Integration-phase causal evidence

- Supervised Experience accepts both `stop` and `integration` acceptance and
  outcome phases, but requires the chosen outcome to use the same phase as the
  chosen acceptance.
- Resolution remains the authority: reconstruction starts from the exact
  `intervention_resolved.causalEffectSeq`, authority hash, and final artifact
  fingerprint. Earlier effects and unrelated self-repair cannot receive causal
  credit.
- The fix was replayed against the sealed 1.3.71 R3 run and selected the exact
  seq 202 effect, seq 206 integration acceptance, seq 213 semantic outcome, and
  seq 214 resolution. The derived label is
  `AUDITED_INTERVENTION_COMPLETE`; three earlier incomplete interventions stay
  incomplete.

## R3 release-gate hardening

- R3 reconstruction now anchors on the exact resolved effect and its delivered
  fingerprint instead of accepting the first matching effect.
- A formal R3 pass also requires a sealed `outsider/supervised-experience/v2`
  record with `SAFE_DELIVERY`, a complete causal chain, and explicit correction
  treatment eligibility.
- Runtime protocol success and learning-data correctness are separate reported
  fields and both must pass.

Historical 1.3.71 gate results do not certify 1.3.72. Every R1-R5 claim must
bind to the exact immutable 1.3.72 artifact. All paid evaluation calls remain
pinned to Sonnet/low. Do not hot-upgrade an active controlled session.
