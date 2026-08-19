# Outsider 1.3.12 private beta candidate notes

This release turns each sealed Stage 0.5 run into a deterministic, hash-bound
supervisory Experience record and adds the protocol machinery needed to measure
R1–R5. The immutable 1.3.12 package subsequently passed the preregistered R1
five-run field gate. R2–R5 remain unproven.

## Supervisory Experience enters the evidence chain

- Finalizing a verified Stage 0.5 run automatically derives exactly one
  `outsider/supervised-experience/v2` sidecar at
  `stage05-supervised-experience.json`. The adapter re-verifies the sealed
  manifest, projection and event chain; it is not another semantic judge and
  cannot change the terminal result.
- A content-addressed copy is written once into the local sibling
  `.supervised-experience-v2/` corpus. Re-export is idempotent, while a hash
  mismatch or attempted replacement fails closed.
- ATTEST v2 commits the exact supervised Experience `recordHash` and uses the
  same controller/Way/Claim/World/authority grouping boundary. Evidence from a
  different artifact, protocol, Claim or World is not silently pooled.
- The derived record carries bounded event references, deterministic risk-class
  mappings, causal-stage references and observed host-capacity measurements.
  It does not copy the operator's raw prompt into the learning corpus and it
  explicitly states that observed risk evidence does not establish production
  loss or liability.
- Existing Experience and feed adapters accept the verified v2 envelope by
  extracting its nested `outsider/experience/v1` model input. This connects new
  runs to the learning pipeline without treating historical or self-reported
  success as ground truth.

The learning label is deliberately split three ways:

- `deliveryResolved` means the artifact reached an independently verified
  delivery terminal;
- `outsiderCausalContribution` means a complete audited intervention chain is
  sealed for that delivery;
- `eligibleForCorrectionEffectLearning` is true only when that causal
  contribution is proven.

A `VERIFIED_DELIVERY_UNATTRIBUTED` run may teach delivery reliability, but it can
never become a positive correction-effect example. Gate containment,
conservative stop and capacity exhaustion likewise retain their own classes.

## Reliability protocol implementation since 1.3.11

These are deterministic implementation and evaluator changes, not field-PASS
claims:

- **Terminal sealing and recovery:** the controller drains accepted work behind
  a finalization fence, makes the terminal event the last causal event, prevents
  post-seal lease/state/event mutation, and preserves intervention identity and
  authority across controller generations. Recovery journals distinguish judge
  in-flight, audited correction persisted, delivery observed, effect observed
  and outcome-audit in-flight states so retries do not mint a second dose or a
  second intervention.
- **Agent Team identity and task ownership:** conformance requires the real host
  result `teammate_spawned`, append-only receipt/start bindings, one frozen
  mandate before each teammate's first action, content-changing teammate-owned
  effects from frozen file hashes, executable checks and successful host task
  completion. Requested names, shared session IDs, inbox paths and
  `async_launched` remain insufficient identity evidence.
- **Integration and completion:** dependency ordering, task-generation fences,
  host completion intents and controller-owned integration fingerprints are
  checked deterministically. A ceremonial teammate edit or a lead-owned
  preimplementation cannot satisfy the teammate causal chain.
- **R1 evaluator:** the named `missing-role-default` fixture now has an exact
  ordered-chain evaluator and canonical Claim/Way/World references for a future
  five-run, source-identical repeatability batch.
- **R2 probe:** the formal Agent Team probe uses the real interactive PTY
  protocol and retains headless `-p` as a negative control; inability to prove
  host identity is `UNSUPPORTED_HOST_PROTOCOL`, never a guessed PASS.
- **R3/R4/R5 evaluators:** integration fingerprint binding, deterministic
  in-flight crash lanes, external monotonic checkpoint witnesses, host capacity
  exhaustion, pre/post-recovery semantic patrol evidence and generation
  monotonicity have executable checks. These checks only decide the named gate
  after its preregistered real run exists.

## Field-gate status for 1.3.12

| Gate | Status | What is still required |
|---|---|---|
| R1 — five-run repeatability | **PASS** | 5/5 exact causal deliveries; 0 false green; five manifests stable after 120 seconds; exact result in `FIELD-RESULT-R1-1.3.12.md` |
| R2 — real Agent Team protocol | **NOT_RUN** | Run the two-teammate interactive host probe and prove receipt/start/task ownership bindings |
| R3 — multi-agent correction | **NOT_RUN** | Run the constructed integration failure five times with complete audited correction chains |
| R4 — in-flight crash recovery | **NOT_RUN** | Inject and pass all five named live failpoint lanes |
| R5 — multi-hour endurance | **NOT_RUN** | Only after R1–R4: run the two-hour minimum protocol; long-term repeatability requires three preregistered passes |

The prior single-agent Cowork causal result remains evidence for its exact
1.3.11 artifact and host. The 1.3.12 R1 result is a separate, constructed
single-agent Claude Code repeatability class; it does not silently upgrade the
Cowork result or prove R2–R5. Older stress runs, synthetic Agent Team tests and
idle recovery tests are not relabeled as stricter field evidence.

## Claim boundary

1.3.12 remains a **private beta**. The new corpus is an evidence-routing layer,
not a production loss table, PRICE decision, guarantee, insurance policy,
reserve, payout promise or WorldConstitution authority. It does not establish
cross-host reliability, Codex/Trae control or universal semantic correctness.

Do not hot-upgrade an active controlled session. Finish or stop the task,
install from a separate terminal, and start a fresh Claude/Cowork session so one
run never mixes controller implementations, evidence schemas or Experience
extractors.
