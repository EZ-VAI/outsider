# Outsider 1.3.11 private beta notes

This is an immutable follow-up to the real 1.3.10 Cowork canary. That run proved
real attached control, semantic false-green detection, independent final delivery
verification and stable sealed evidence. It correctly did **not** claim a complete
causal loop: the supervisor withheld a correction because controller evidence used
the selected macOS path while Cowork command telemetry used a `/sessions/.../mnt`
path and the packet did not state which evidence owned artifact identity. The
original 1.3.10 run and result remain unchanged.

- **Workspace identity is controller-owned and frozen.** Every new run records a
  hashed `workspace-identity.json` bound to the contract seal, canonical cwd,
  selected workspace root and host resolution source. Recovery verifies the same
  identity before a replacement controller may continue.
- **Artifact evidence and execution telemetry have different authority.** Source
  bytes, snapshots, diffs and acceptance results captured from the canonical cwd
  may establish an artifact defect. Worker command strings remain useful ordered
  telemetry but cannot redefine which artifact the controller inspected.
- **No sandbox alias is invented.** Current Cowork host metadata proves the local
  selected folder but does not publish its sandbox mount mapping. The evidence
  therefore records `sandboxPathAlias.status = not-asserted`; supervisors are told
  neither to claim the two paths are identical nor to discard direct canonical
  evidence merely because that supplementary alias is unavailable.
- **The identity survives settlement.** The run state commits its workspace
  identity hash, the final evidence manifest verifies it against the contract and
  cwd, and the private evidence inventory gives it the dedicated role
  `CONTROLLER_WORKSPACE_IDENTITY`.
- **The real failure shape is a regression.** Tests retain a canonical local
  source/acceptance view alongside `/sessions/.../mnt` Bash telemetry and require
  the former to remain authoritative without deleting the latter.

The deterministic release baseline is 195/195 product tests and 125/125 gate-corpus
cases. This candidate still requires a fresh real Cowork canary on the immutable
1.3.11 artifacts. The release claim is intentionally narrow: this change removes
the specific evidence-identity ambiguity that prevented the 1.3.10 supervisor from
issuing an otherwise grounded correction; only a real correction → observation →
effect → independently audited PASS → resolution chain can establish the attached
Stage 0.5 causal claim.

Do not hot-upgrade an active controlled session. Finish or stop the task, install
from a separate terminal, and start a fresh Cowork session so one run never mixes
controller implementations or workspace-identity schemas.
