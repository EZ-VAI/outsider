# Outsider 1.3.73

1.3.73 closes an intervention-continuity failure discovered by the immutable
1.3.72 R3 gate. The first R3 correction was audited, delivered, observed, and
changed the intended integration file. Before its native TaskCompleted retry
could validate and resolve that intervention, a due periodic semantic patrol
opened a second intervention for the same actor. The final delivery was safe
and the second chain was complete, but strict R3 attribution to the injected
drift was lost. The failed 1.3.72 run is retained and does not certify this
release.

## Native-boundary intervention continuity

- A periodic patrol may still replace an unobserved mechanical hypothesis.
- Once an audited correction has been observed by the worker, periodic patrols
  keep their clock and record a deterministic deferral, but cannot replace the
  open intervention while its effect or resolution is pending.
- An effected correction created at `Stop` or `TaskCompleted` is settled at
  that same native lifecycle boundary. Generic PreToolUse follow-up cannot
  steal its identity, authority hash, acceptance, or outcome.
- Ordinary PreToolUse corrections retain the existing bounded independent
  follow-up path; the change does not turn a failed correction into a permanent
  lock.

## Regression boundary

The new regression exercises an observed and effected TaskCompleted correction
across seven due patrol boundaries. It requires one supervisor dose, the same
open intervention id, a resolution-pending patrol deferral, and a native
TaskCompleted follow-up deferral. Existing tests still prove that an unobserved
mechanical correction can be superseded and that a genuinely ineffective
ordinary correction is independently replanned.

Historical 1.3.72 results do not certify 1.3.73. Every R1-R5 claim must bind to
the exact immutable 1.3.73 artifact. All paid evaluation calls remain pinned to
Sonnet/low. Do not hot-upgrade an active controlled session.
