# Outsider 1.3.1 private beta notes

This release repairs the Stage 0.5 → ATTEST evidence boundary. It does not add a detector or another LLM judge.

## Fixed

- A recovered attached controller can no longer be sealed before its process exits and lease is released.
- `run_finalized` and `gate_containment_finalized` are true terminal events. A watchdog cannot append a recovery generation after them.
- The evidence manifest is written last as an atomic commit marker. Once present, RunStore rejects all event, state and lease writes.
- The deterministic release gate now produces `CONTROL_BOUNDARY_CONTAINMENT` evidence. It is attestable, but never counted as safe delivery.
- A duplicated host session identity crossing repository roots is recorded and fails closed instead of silently mixing trajectories.
- `outsider install --scope project` writes only the current repository's Claude settings. User-scope installation now prints its exact
  target and warns against installing from a live session.

## Known private-beta edge

Claude's synchronous hook timeout is 900 seconds; Outsider's internal budget is 890 seconds. This ordering guarantees a visible deny if the
sidecar stalls, but a single tool or Stop boundary can appear paused for roughly 15 minutes. Run `outsider doctor` from another terminal;
do not reinstall from the blocked session.

## Evidence semantics

- `SAFE_DELIVERY`: independent mechanical and semantic acceptance plus the required causal proof.
- `CONTROL_BOUNDARY_CONTAINMENT`: a mechanically green, independently false artifact was held at the real control boundary.
- `CONSERVATIVE_STOP`: no unsafe delivery was released, but the full delivery proof is incomplete.

These classes are separate loss outcomes. Containment results may enter ATTEST, but cannot be quoted as unattended completion.
