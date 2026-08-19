# Outsider 1.3.6 private beta notes

This release turns the real Claude Desktop/Cowork conformance findings into product invariants.

- Cowork now requires the explicit user LaunchAgent installed by `outsider install --scope user`. The Hosted Plugin is a thin
  authenticated hook client. It never launches a misleading supervisor inside a sandbox that cannot read the macOS Keychain.
- Compatible system helpers survive plugin cache-path and version changes; ordinary Claude Code retains its lazy embedded sidecar.
- Transparent attached runs freeze operator words directly. This removes the serial compiler/auditor/rewrite chain that delayed the
  first real Cowork tool boundary by roughly nine minutes while still ending in the lossless fallback contract.
- Runtime patrols and task checks can no longer spend the eight calls reserved for Stop diagnosis, semantic outcome verification,
  and PASS approval audit.
- The last completed team task now triggers independent integration verification even when teammates correctly own different files.
  A same-file conflict is additional evidence, no longer the prerequisite for proving the composed result.
- The Cowork conformance checker now accepts the canonical `RESEARCH + capabilityRequired:false` authority lane and verifies a
  content-addressed Stop verdict reused at finalization.
- A new prompt clears stale `sessionEndedAt` state.

Real Cowork conformance on 1.3.5 reached `SAFE_DELIVERY` with zero unattended interaction attempts, a byte-preserved operator
prompt, real Pre/PostTool boundaries, independent outcome verification, frozen acceptance, and a permanently verifiable evidence
manifest. The 3h24m endurance run proved wall-clock endurance, two delegated workers, controller crash recovery, and final sealed
mechanical acceptance, but correctly ended `CONSERVATIVE_STOP`: the worker left explicit team tasks incomplete. Those workers were
subagents, so that run is not evidence of Claude Agent Team coordination. This release does not relabel the conservative stop as a
successful long-run delivery; the replacement canary explicitly requires two named Agent Team teammates.
