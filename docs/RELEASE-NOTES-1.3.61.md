# Outsider 1.3.61

1.3.61 is the immutable private-beta candidate containing the safety and
Agent-Team proof fixes derived from the stopped 1.3.59 formal endurance run.
It supersedes the unrun 1.3.60 candidate; neither older artifact's live
evidence is inherited as a 1.3.61 pass.

## Safety

- A substantive semantic RED is sticky for the exact workspace fingerprint.
  A later model sample cannot turn unchanged bytes green; an actual artifact
  change is required before semantic verification can pass.
- The controller emits a deterministic `outcome_conflict_sticky_red` and
  preserves the original bounded gaps and evidence without another model call.

## Agent Team proof

- Canonical teammate file effects retain the exact persisted host spawn
  `identityBindingHash`, including after controller recovery.
- Successful preregistered checks may be executed as the exact command or as
  one narrow controller-verified form: `cd "<exact workspace>" && <command>`.
  The lead may also execute the exact preregistered slice checks followed by
  the exact integration check in one `&&` suite.
- These variants are accepted only through a controller-created hash binding
  the canonical actor and the complete ordered command list.  Alternate cwd,
  pipes, suffixes, extra commands and unregistered checks receive no proof.
- Replaying the stopped 1.3.59 host events with only these new deterministic
  evidence fields closes both teammate task chains and the lead integration
  chain.  It does not change the run's semantic RED or terminal result.

## Verification and claim boundary

- Deterministic product suite: 401/401.
- Gate corpus: 125/125.
- The stopped 1.3.59 run used 18 Sonnet processes: 17 bounded judges with a
  `$10.20` aggregate nominal ceiling plus one interactive worker whose actual
  Max-plan credit use is not exposed by Claude CLI.
- `stablePublicReleaseReady` remains false until this exact 1.3.61 artifact
  passes live R1-R5, Desktop Cowork conformance and an independent
  second-machine install.
- Do not hot-upgrade an active controlled session.
