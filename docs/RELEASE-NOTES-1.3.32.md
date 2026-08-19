# Outsider 1.3.32

Status: immutable Stage 0.5 candidate prepared after the first real R2 Agent Team run found a
host-lifecycle fingerprint defect. R1–R5 evidence from other versions does not transfer to this
candidate.

## Delivered artifact identity

Claude's interactive `ScheduleWakeup` surface creates `.claude/scheduled_tasks.lock` while the
worker is alive and removes it during normal teardown. 1.3.31 included that host-owned lock in the
workspace fingerprint, so an unchanged, independently approved Agent Team delivery acquired a new
fingerprint between Stop and finalization. The final verifier and approval audit both passed, but
the strict proof correctly refused to treat a post-exit verdict as Stop control.

1.3.32 excludes exactly `.claude/scheduled_tasks.lock` from workspace snapshots. Other `.claude`
files remain evidence. A regression proves the lock cannot change the fingerprint while a
project-owned Claude configuration file still can.

## DeepSeek Harness observation integration

This candidate begins the new Way integration at an intentionally narrow authority boundary:

- `outsider observe-dsh <session-events.json|jsonl> --out <observation.json>` imports the durable
  DeepSeek Harness v0 session envelope pinned to upstream commit
  `47f943859bef60e4160492346772ded9b24f765a`;
- the adapter pairs tool calls/results and hook invocations/results, records bounded capacity,
  token, retry and compaction facts, and rejects unknown required events;
- raw session ids, commands and tool output are not copied into the observation;
- the record is hash-bound and verifiable with `outsider verify`;
- its authority is explicitly `OBSERVATION_ONLY`: it establishes neither Stage 0.5 delivery nor
  Outsider causal contribution, loss, liability, pricing, or settlement.

The native Harness intervention plugin and a real DSH causal canary remain future gates.

## Evaluation cost guard

The evaluation-only Claude wrapper remains Sonnet/low-only. Its finite maximum may now be set as
high as 24 processes because the real R2 path demonstrated that contract review, two teammate
completion gates, integration review, and final independent verification can legitimately exceed
16. Individual headless calls retain their dollar cap; interactive R2/R3/R5 still require explicit
uncapped-credit acknowledgement.

## Claim boundary

These changes remove a deterministic false-negative and add an observation adapter. They do not by
themselves establish R1 repeatability, R2 Agent Team delivery, R3 multi-agent correction, R4 crash
recovery, R5 endurance, public stability, DeepSeek intervention authority, or any Stage 1–4
pricing/guarantee/settlement claim. Those remain evidence gates over this exact immutable version.
