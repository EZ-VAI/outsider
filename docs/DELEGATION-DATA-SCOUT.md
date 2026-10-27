# Delegation-radius data scout

The scout is a reviewed discovery queue, not a dataset verifier and not a
trainer. Its job is to preserve the distinction between finding useful public
material and earning the right to use its bytes.

The frozen 2026-08-27 catalog currently routes seventeen sources:

- CUAStepBench and RoboFAC enter metadata-first quarantine. Their publisher
  counts and revisions are useful, but full object replay, upstream rights,
  privacy review, correlation roots, and target-domain splits remain open.
- AgentHazard contributes only safe taxonomy/count metadata. Raw harmful tasks,
  payloads, and trajectories are neither reproduced nor executed.
- REAL contributes task-definition references only. The reviewed public release
  does not contain the paper's robot episodes, training trajectories,
  checkpoints, or weights.
- RAPT remains simulation-only. Claims about real runs do not enter through the
  public simulation dataset.
- BotFails already has a source-aware selected-scope adapter and is referenced
  rather than duplicated. Its observations remain descriptive and add zero
  automatic-training rows.
- Orchard adds a large software-engineering success/failure denominator and a
  smaller GUI-success subset. The GUI judge labels are not independent outcomes;
  its 409 task identities but 408 last-turn rows require replay, and repository
  and upstream benchmark rights remain unresolved.
- AgentHorizon adds long-horizon GUI success/failure pairs, including coherent
  sibling-task mismatches. Its card declares no data license, so only metadata
  enters the catalog.
- ViFailback adds a promising real ALOHA failure denominator, but its 513 GB
  payload, task/platform correlation, HDF5 denominator, and camera-alignment
  caveat must be replayed before row-level use. The published four-category
  percentages total only 87.37%, so the unexplained remainder stays explicit.
- ManipArena is metadata-only: the payload is gated by a research/competition
  agreement, mixes real and simulated demonstrations, and is not requested by
  this scout.
- AutoResearchEval keeps both successful and failed sandboxed research-agent
  runs. Its 70×8 open-ended grid has 559 rather than 560 rollouts, and its two
  subset task counts sum to 101 while the title says 100; both remain explicit
  replay gaps rather than being silently reconciled.
- Computer Agent Arena contributes a 4,641-trajectory human-evaluation
  denominator. Publisher consent/de-identification claims still require replay;
  raw screenshots and private reasoning text remain outside training.
- OSWorld 2.0 contributes a long-horizon checkpoint/side-effect evaluator
  structure and bounded simulated-user pattern. Its task assets are gated, so
  the catalog records only the public release structure and does not request the
  payload.
- RoboProcessBench contributes process-QA and outcome-prediction schemas, while
  preserving its mixed upstream licenses, unknown binary-label orientation, and
  a manifest/file-name mismatch as explicit replay blockers.
- NVIDIA Open-H-Embodiment contributes only aggregate failure/recovery slice
  metadata. The 299-episode failure-only slice is a future holdout candidate;
  the 714 claimed recovery episodes lack per-episode outcome fields and cannot
  yet form a recovery denominator.
- AgentDojo contributes the separation between user authority and untrusted tool
  data, plus the crucial regression that a blocked proposed tool call is neither
  an executed action nor an achieved effect. Injection strings are not run.
- Agent Safety Bench contributes aggregate safety/fulfillability taxonomy for
  offline HOLD classification. Its labels are task labels, not outcomes; its
  executable Python fields are never executed and no training split is admitted.

Every candidate moves through the same one-way gates:

1. discover and pin an official revision;
2. acquire exact bytes into quarantine;
3. replay the declared file denominator and provenance;
4. review per-source rights, privacy, PII, and affected-party implications;
5. freeze correlation roots and a target-domain holdout before labels are used;
6. CURATE for one named use;
7. train only if that named use is authorized;
8. evaluate once on the frozen holdout;
9. promote or reject without changing action or delegation authority.

Data may expand the evidence radius. It cannot create owner standing, action
authority, target transfer, causal truth, PRICE, GUARANTEE, SETTLE, or closure.
