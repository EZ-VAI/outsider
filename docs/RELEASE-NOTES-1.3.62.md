# Outsider 1.3.62

1.3.62 is the immutable private-beta candidate produced from the first formal
1.3.61 R5 endurance attempt.  That run proved a real Agent Team, controller
recovery and an audited correction-to-effect chain, but it did not complete the
two-hour endurance protocol.  The 1.3.61 run remains a failed R5 sample and is
not inherited as a 1.3.62 pass.

## Recovery-shift liveness

- A resolved recovery correction can no longer strand the evaluator before its
  required post-recovery checkpoint.  When the artifact is repaired, the
  controller is idle at a newer approved Stop and the exact audited causal chain
  is complete, the evaluator dispatches one checkpoint-only continuation.
- The continuation is deterministic evaluation plumbing.  It cannot diagnose,
  edit or grant correction authority; it only asks the worker to execute the
  preregistered recovery checkpoint command.
- The continuation is idempotent and content-bound.  It is refused while drift
  remains, when the repair is unattributed, after a checkpoint already exists,
  or after a prior continuation dispatch.
- The scheduled shift is moved past the continuation boundary so an older Stop
  cannot prematurely close the recovery drill.

## Semantic-call budget and deterministic contradictions

- A supervisor clearance claiming `onTrack:true` while controller-owned
  mechanical or semantic acceptance is red is now rejected deterministically.
  The append-only audit record remains, but no redundant clearance-auditor LLM
  call is purchased.  Prose-only consistency questions still require the
  independent auditor.
- Formal R5 now preregisters at least four usable patrol verdicts and a maximum
  of 25 controller calls / 28 total model processes.  With the planned `$0.60`
  per-process cap, the headless nominal ceiling is `$16.20`; the one interactive
  worker remains an explicitly disclosed, host-metered exception.
- These changes preserve the factual-audit requirement before any correction
  receives actuator authority.  They remove redundant serial judgment rather
  than weakening the closed loop.

## Evidence from the stopped 1.3.61 run

- Two host-bound teammates changed their exact preregistered files and passed
  their exact slice checks; the lead completed the integration task.
- A real controller SIGKILL recovered as generation 2 with the same run and
  frozen contract.
- Injected evaluator drift made acceptance red.  A false clearance was safely
  rejected; the later correction passed factual audit, was emitted, observed,
  changed behavior, passed acceptance and outcome review, and resolved.
- The run sealed with `proof.complete:true` and valid evidence, but only one
  checkpoint and no post-recovery patrol.  Therefore it is proof of the inner
  causal loop, not proof of multi-hour endurance.

## Verification and claim boundary

- Deterministic product suite: 402/402.
- Gate corpus: 125/125.
- Historical projection shows that supplying only the missing recovery
  checkpoint and shift-completion evidence closes the recovery-drill predicate;
  it is a diagnosis check, not live certification.
- `stablePublicReleaseReady` remains false until this exact 1.3.62 artifact
  passes the formal two-hour R5 gate plus the other release-certificate field
  requirements.
- Do not hot-upgrade an active controlled session.
