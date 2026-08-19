# Outsider 1.3.39

Private-beta candidate superseding the unrun 1.3.38 closure.

It retains the atomic Sonnet/low evaluation budget ledger and finite R5 model
process ceilings introduced in 1.3.38.  It also fixes the interactive Claude
launch argv: `--disallowed-tools` is a variadic option in Claude Code 2.1.219,
so the old argument order consumed the positional task prompt as tool names.
The prompt now precedes options and denied tools occupy one comma-delimited
argument.  The invalid 1.3.38 R5 smoke never crossed the first worker boundary
and is not counted as evidence.

The DeepSeek Harness reference integration now includes an authenticated local
gateway.  It accepts only a pinned handshake and an already-audited,
content-addressed correction, sends no raw session or agent identity, and
records an idempotent acknowledgement only after the exact durable Harness
message is observed.  It still cannot establish effect, outcome, loss, or
liability.  A pinned upstream compile and live Harness canary remain required.

This candidate remains private beta until fresh 1.3.39 R1–R5, Cowork, and
second-machine evidence exists.  It establishes no production actuarial price,
reserve, coverage, or payout authority.
