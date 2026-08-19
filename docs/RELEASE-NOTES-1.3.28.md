# Outsider 1.3.28

Temporal-authority repair after the immutable 1.3.27 R1 batch exposed a second,
independent misuse of `insufficient` in the correction factual auditor.

The controller now distinguishes an older worker trajectory from the later
controller-owned snapshot at the paused boundary. When all of the following
are cryptographically bound, unknown mutation provenance is recorded as an
advisory instead of suppressing an otherwise factual correction:

- the correction originates in an independent semantic red verdict;
- every edit action's `preSha256` matches current source evidence;
- the canonical artifact fingerprint matches `diff.afterFingerprint`;
- frozen protected paths remain unchanged; and
- the auditor reports no blocking or factual error and independently verifies
  at least one proposal fact.

The rule never promotes a factual reject, a read-only or hashless proposal, a
fresh-supervisor-only diagnosis, a mismatched source snapshot, or a changed
protected path. The original auditor decision and advisory remain durable in
`correction_audit_insufficiency_reclassified_as_advisory` telemetry.

`outsider/supervised-experience/v2` records this class separately under
`hostCapacity.semanticJudgment`; it is observational supervision data, not a
loss label or an automatic pricing input.

The 1.3.27 R1 artifacts remain immutable and retain their original 1/1
conservative result. They are not relabeled as 1.3.28 evidence. R1 through R5
must be generated against the immutable 1.3.28 artifacts.

