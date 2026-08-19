# Outsider 1.3.47

1.3.47 is a private-beta reliability candidate. It preserves every 1.3.46
model-cost, repeatability, Agent Team, recovery and evidence boundary, and fixes
one conservative control-flow failure exposed by the formal endurance run.

When an `onTrack=true` clearance is already contradicted by controller-owned red
acceptance or semantic evidence, a transient clearance-auditor failure can no
longer fall back to mechanical rework. The controller deterministically rejects
that clearance and requests a fresh diagnosis, so a worker cannot silently
self-repair without the correction→observation→effect causal chain required by
Stage 0.5.

The full deterministic suite is 374/374 and the frozen corpus is 125/125.
R1–R5 must be rerun on the immutable 1.3.47 artifact. This remains a private
beta; stable release still requires the declared real-runtime gates and an
independent second-machine installation.
