# Outsider 1.3.8 private beta notes

This release closes two failures exposed by the first real 1.3.7 Cowork semantic-containment run. It does not lower the Stage 0.5 causal-proof bar.

- **Correction authority is now smaller than supervisor prose.** The controller projects an independent semantic gap, bounded repair
  instructions, protected-file hashes and a closed set of typed worker actions. `drift`, `acceptanceRisk` and narrative counts remain
  telemetry and cannot withhold or steer an otherwise valid correction.
- **No model-authored command is executed by the controller.** A typed `runRef` may reference only the t=0 frozen acceptance. New probes
  are declarative worker requests and still pass through normal host tool boundaries.
- **Audit and effect are content-bound.** One canonical correction-authority hash now binds the supervisor verdict, factual audit,
  correction delivery, transcript observation, observed effect and final resolution. Causal proof requires strict event order and an
  explicit `intervention_resolved`; an assembled, substituted or out-of-order chain cannot pass.
- **Correct outcome and causal attribution are distinct terminal claims.** `VERIFIED_DELIVERY_UNATTRIBUTED` means final mechanical
  acceptance, semantic verification and PASS audit succeeded, but Outsider cannot prove its correction caused the result. It is
  attestable and releasable, but never counted as `SAFE_DELIVERY` or Cowork Stage 0.5 conformance.
- **A finalized run can no longer create a permanent Stop wall.** Once `run_finalized` exists and the controller is gone, Stop exits with
  an explicit SAFE / unattributed / conservative disclosure. Repeated Stop is idempotent. A conservative red terminal is not called a
  delivery, but it also cannot demand work from a controller that no longer exists.
- **Evidence capture no longer hides valid source containing NUL.** Known UTF-8 source types preserve literal NUL bytes; every uncaptured
  file records whether the cause was invalid UTF-8, an unknown NUL-bearing file type, file-size limit or workspace-byte budget. Tool
  observations now carry bounded tails and hashes into semantic evidence.

The deterministic release baseline is 169/169 product tests and 125/125 gate-corpus cases. The 1.3.7 real Cowork artifact remains
immutable historical evidence: it is correctly classified as verified delivery without causal attribution. A new real Cowork canary is
still required before claiming that 1.3.8 completed the correction-emitted → observed → effect → resolved chain on the host.
