# Outsider 1.3.20

Private-beta reliability build after the immutable 1.3.19 R3 field batch
exposed a bounded-control-plane liveness defect.

- Default worker and supervisor launches now use direct executable argv rather
  than `/bin/zsh -lc`. The judge timeout therefore owns the Claude process and
  cannot leave a shell child holding stdout after the nominal deadline.
- Claude's runtime `403 Request not allowed` shape is classified as transient
  control-plane capacity loss after a valid local authentication preflight. It
  remains fail-closed and retryable; it is not mislabeled as a semantic defect
  or a permanent credential failure.
- Supervisor failure events carry a deterministic failure category. Sealed
  supervised Experience maps control-plane outages to
  `CONTROL_PLANE_CAPACITY_LOSS`, counts observed capacity exhaustion, and
  explicitly does not establish loss or liability.
- The formal R3 evaluator binds integration correction through structured
  `interventionId` and `correctionAuthorityHash`, not brittle trigger prose.
- No new LLM judge, detector, authority, or financial decision was added.

The immutable 1.3.19 R3-v2 batch remains historical evidence: 2 audited causal
deliveries, 1 conservative control-plane-capacity failure, and 0 false greens.
It is not pooled with 1.3.20.

R1 through R5 must be regenerated on the immutable 1.3.20 artifact. Do not
hot-upgrade an active controlled session. During a control-plane outage,
Outsider may conservatively pause or terminate a run, but it must not authorize
an unverified delivery.
