# Outsider 1.3.40

Private-beta evidence candidate superseding 1.3.39. It does not inherit a
runtime PASS from an earlier product hash.

The R5 evaluator now freezes every acceptance-control path in a separate,
hash-only protected-path set. The bounded source-body packet can no longer omit
an otherwise protected test, protocol, checkpoint, or package file and thereby
grant an invalid correction authority. A truncated protected-path set fails
closed.

The endurance protocol now makes its single semantic-patrol warmup explicit.
That warmup is not a witness-due turn, cannot satisfy the measured duration,
and may only read the four named frozen controls and run the frozen acceptance
without writing a checkpoint. This removes a contradiction between the
pre-registered evaluator and the worker contract.

Workspace trust is now recorded as one of two honest host dispositions:
`EXPLICIT_PROMPT_CONFIRMED` when an actual trust screen was observed and
confirmed, or `HOST_DID_NOT_REQUIRE_PROMPT` when the first real boundary arrived
without that screen. The evaluator never sends an unprompted Enter key and no
longer marks an already-trusted workspace as a product failure.

The 1.3.39 smoke at `r5-smoke-1.3.39-20260815-d` produced a real monotonic
witness, generation-2 recovery, an audited correction, observed effect,
independent outcome approval, complete causal proof, sealed evidence, and an
Experience-v2 record eligible for correction-effect learning. Its old wrapper
reported false solely because it required the trust screen to appear. That run
is diagnostic evidence for these fixes, not a 1.3.40 release PASS.

DeepSeek Harness remains an optional source integration. The TypeScript adapter
compiles against exact npm package versions and records an authenticated,
content-addressed correction acknowledgement, but no source-to-package
equivalence or live Harness effect is claimed yet.

This candidate remains private beta until fresh immutable R1-R5, real Cowork,
multi-hour endurance, and independent-machine evidence pass. The actuarial and
clearing layers remain `ABSTAIN`: no production price, reserve, coverage,
capital, or payout authority is granted.
