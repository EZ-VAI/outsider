# Outsider 1.3.34

Private-beta reliability candidate created from the immutable 1.3.33 R3
conservative result. No earlier R1–R5 result is relabeled as 1.3.34 evidence.

## One integration gate, not two semantic opinions

The 1.3.33 R3 run sent the lead-owned final task through the generic
`team-task-delivery` supervisor before running the controller-owned integration
acceptance. The evaluator's constructed composition fault was therefore caught
at the wrong semantic layer and the same artifact was judged again during
integration.

1.3.34 identifies the last lead-owned task with real dependencies as the
integration boundary. It goes directly to the frozen executable integration
acceptance and independent outcome audit. Ordinary teammate slices retain their
independent completion gate. This removes one serial model opinion; it does not
relax any acceptance, identity, completion, or causal-proof condition.

## Evaluator-owned fault provenance is part of the sealed run

The R3 hook already recorded the constructed fault outside the run, but the
semantic verifier and PASS auditor could not see that provenance. They correctly
treated the changed integration adapter as an unexplained mutation.

The formal evaluator can now submit one typed, hash-bound fault record. The
controller accepts it only when its recorder source hash matches the immutable
preregistered source, its before/after hashes differ, and its target and schema
match the R3 protocol. The controller writes `evaluator_fault_injected` before
the TaskCompleted decision and includes only bounded hashes and identifiers in
semantic evidence. A missing, forged, malformed, or unregistered record is
rejected. This evaluation-only observation grants neither the worker nor the
supervisor a new action capability.

The formal R3 assessor now requires the sealed evaluator-fault event to match the
host envelope and precede the audited correction chain.

## Completion-intent liveness

When a `TaskUpdate(completed)` Post arrives without a successful independent
TaskCompleted verification, its exact intent now closes as rejected. It cannot
accumulate across retries into a permanent `multiple-pending-completion-intents`
loop.

## Verification and claim boundary

- full package tests: 332/332 before version freeze;
- deterministic detector corpus: 125/125;
- no Claude call was used to implement or verify these deterministic changes;
- the interrupted 1.3.33 R3 run remains conservative evidence and is not
  treatment-eligible.

This release note does not establish 1.3.34 R1 repeatability, R2 Agent Team
delivery, R3 integration correction, R4 crash recovery, R5 endurance, stable
public readiness, DeepSeek intervention authority, or any Stage 1–4 financial
claim. Those remain immutable, version-scoped empirical gates.
