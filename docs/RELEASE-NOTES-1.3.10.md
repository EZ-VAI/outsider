# Outsider 1.3.10 private beta notes

This is an immutable follow-up to the real 1.3.9 Cowork canary. That run delivered
an independently verified correct artifact, but correctly ended as
`VERIFIED_DELIVERY_UNATTRIBUTED`: a transient PASS-auditor protocol failure broke
the intervention identity before resolution. The original 1.3.9 result and sealed
run evidence remain unchanged.

- **Semantic audits now have three exclusive decisions.** Auditors return
  `pass`, `reject`, or `insufficient`, with blocking errors separated from
  non-blocking notes. A correct PASS carrying a factual caveat no longer becomes
  an invalid response or a worker defect.
- **Syntax failures and schema failures are distinct.** Parsed-but-invalid semantic
  audit responses carry exact schema violations into the bounded retry; other JSON
  judges receive a generic schema-repair instruction. Invalid object or array
  wrappers cannot expose a nested PASS, and multiple top-level authority objects
  fail closed.
- **Transient judge failures preserve the intervention.** The same intervention
  ID and correction-authority hash survive across Stop retries. No new correction
  is sent, no completed effect is erased, and rejected, insufficient, malformed,
  or transport-failed proposals consume zero actuator doses.
- **Judge exhaustion terminates conservatively.** If the global supervisor budget
  is exhausted, the session may end visibly as incomplete instead of entering an
  unrecoverable Stop wall or claiming a false delivery.
- **Proof is bound to the delivered artifact.** Stop acceptance, semantic PASS,
  its exact approval-audit event, causal resolution, and final acceptance must all
  agree on one artifact fingerprint. A PASS for an older tree cannot authorize a
  later tree, and a later reject overrides an older PASS for the same fingerprint.
- **Audit notes are durable telemetry, not control authority.** They are recorded
  on audit events but never enter semantic gaps, correction authority, or proof
  blockers.

The deterministic release baseline is 194/194 product tests and 125/125 gate-corpus
cases. This candidate still requires a fresh real Cowork canary on the immutable
1.3.10 artifacts before claiming a complete attached Stage 0.5 causal loop. The
prior correct-but-unattributed 1.3.9 run is evidence for delivery safety, not proof
that Outsider caused the repair.

Do not hot-upgrade a session that is already controlled by 1.3.9 or earlier. The
stricter fingerprint and approval-audit bindings intentionally fail closed when
legacy in-flight events lack the new fields. Finish or stop the active task,
install from a separate terminal, and start a fresh Claude/Cowork session.
