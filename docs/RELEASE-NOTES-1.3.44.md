# Outsider 1.3.44

1.3.44 is a private-beta control-kernel release. It closes two fail-closed
gaps exposed by the first formal R5 endurance attempt:

- a Stop boundary with controller-owned red acceptance or red semantic outcome
  can no longer receive a successful `onTrack:true` clearance, even when a
  semantic clearance auditor incorrectly approves the proposal; it is rejected
  deterministically and sent through fresh re-diagnosis;
- a typed correction may delete a controller-hashed file added after the frozen
  baseline, even when that path was omitted from the compiler's edit scope. The
  exception is delete-only, requires the exact diff `afterSha`, and never applies
  to protected or explicitly out-of-scope paths.

The failed 1.3.43 R5 attempt remains immutable evidence: controller recovery and
safe repair succeeded, but the repair arrived through mechanical acceptance
fallback rather than an audited correction, so it did not establish Stage 0.5
causal actuation. It must not be counted as an endurance pass.

The multi-provider Global Outsider federation remains a research-preview
surface. It signs and verifies provider-neutral Ways, bilateral handoffs and
live checkpoints across Codex, DeepSeek Harness, Claude and Trae, while keeping
provider credentials and execution authority local. It produces supervision
and routing evidence only; it does not claim cross-company control, pricing,
guarantee or settlement authority.

Do not hot-upgrade an active controlled session. Finish or conservatively stop
the existing session, install 1.3.44, and start a new one.
