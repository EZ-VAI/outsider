# Outsider 1.3.35

Private-beta R3 protocol candidate created from the immutable 1.3.34 run.

That run was a genuine `SAFE_DELIVERY`: two real teammates completed bound
tasks, the evaluator fault was sealed, an audited correction was observed and
changed the integration artifact, independent integration and Stop approval
passed, and the exported Experience is eligible for correction-effect learning.
It is nevertheless not relabeled as a formal R3 pass because the correction was
delivered by `PreToolUse.deny`, not the preregistered `TaskCompleted.exit2`
channel.

The cause was deterministic: the periodic patrol became due on the same
`PreToolUse(TaskUpdate completed)` boundary that immediately enters the
actor-bound TaskCompleted gate. It bought a duplicate semantic opinion and won
the race against the dedicated integration gate.

1.3.35 preserves the patrol clock but defers a due patrol on completion-intent
boundaries to TaskCompleted. Ordinary actions still receive periodic patrols;
ordinary teammate completion still receives independent slice verification;
lead integration still requires frozen executable acceptance and independent
outcome approval. No judge, detector, permission, or acceptance condition was
added or relaxed.

Verification before freeze: package tests 333/333 and deterministic corpus
125/125. The 1.3.34 run remains valid supervised data for audited causal
delivery, but not a formal R3 protocol success.

R1–R5 remain immutable, version-scoped empirical gates. This note establishes
no stable public readiness, DeepSeek intervention authority, or Stage 1–4
financial claim.
