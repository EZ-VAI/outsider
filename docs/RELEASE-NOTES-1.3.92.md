# Outsider 1.3.92

1.3.92 is one consolidated product repair derived from the complete, sealed
1.3.91 formal R5 run. The run was allowed to reach its own bounded red terminal;
no source, evaluator, threshold or fixture was changed while it was live, and no
second R5 was started during this repair cycle.

The 1.3.91 run provided substantial positive evidence: it formed a real two-member
Sonnet Agent Team, enforced three frozen tasks and exclusive teammate slices,
survived an injected controller SIGKILL, independently completed both teammate
tasks, passed integration, and permanently sealed its terminal evidence. It did
not pass R5. It ended conservatively after 18 minutes 55 seconds with 28/28
semantic calls consumed and no complete recovery-intervention causal chain. The
final artifact was not released as a false green.

The complete failure cluster had four connected product causes:

- the supervisor evidence did not include the controller's deterministic
  `TaskUpdate.addBlocks` semantics, allowing a correct dependency update to be
  read backwards and factually audited as drift;
- late recovery authority inferred frozen team topology from incidental reads and
  evaluator-owned marker files, attempting to rebuild completed tasks, respawn
  teammates or route verification reads back to locked owners;
- Stop could run acceptance and semantic diagnosis before every exact step of an
  already-dispatched evaluator shift had completed;
- after factual audit rejected a correction, the generic acceptance-output
  fallback still told the worker to repair the artifact, creating mechanical
  repair authority outside the required audited Outsider intervention chain.

This release fixes the cluster as one control-plane change:

- every proposed `TaskUpdate` now carries a bounded deterministic preview with
  the exact `addBlockedBy`/`addBlocks` meanings and resulting graph into diagnosis;
- team topology authority derives only from the frozen Agent Team policy and
  controller-owned coordination state. Completed slices are not reopened or
  respawned, and lead verification reads remain with the active lead;
- an in-progress controller shift is completed step-by-step before acceptance or
  any semantic repair call. The continuation is explicitly measurement-only and
  grants no mutation authority;
- when the frozen protocol requires an audited recovery, rejected or unavailable
  correction proposals remain held for fresh diagnosis. Acceptance output is not
  converted into edit/delete instructions and `acceptance_rework_emitted` is not
  used as a repair channel.

The strict proof rules are unchanged: a correction must still be factually
audited, delivered, observed, have a matching effect on the final artifact
fingerprint, pass independent outcome review, and resolve under the same
intervention and authority hashes.

Verification on release source is 452/452 unit, integration, authenticated IPC,
Agent Team and SIGKILL recovery tests plus 125/125 deterministic gate-corpus
cases. The sealed 1.3.91 R5 failure remains independently verifiable and is
retained as supervised conservative-failure experience.

R5 endurance evidence is version-scoped. A fresh, uninterrupted two-hour R5 on
the immutable 1.3.92 artifact is still required before stable public-release
readiness can be claimed. This release note deliberately does not pre-claim it.
