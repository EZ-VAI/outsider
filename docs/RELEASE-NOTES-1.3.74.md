# Outsider 1.3.74

1.3.74 fixes an endurance-evaluator evidence loss found by the immutable
1.3.73 R5 run. Claude displayed an explicit session-capacity banner, then its
interactive terminal redrew more than the evaluator's 32 KB polling window
before the next sample. The run was safely stopped and correctly did not pass,
but its durable result recorded the operator SIGINT instead of the earlier host
capacity failure.

The evaluator now parses every stdout chunk before truncating its bounded TUI
tail and latches the first normalized capacity observation. A later terminal
redraw cannot erase that evidence. Raw terminal output is not added to the
public or supervised evidence record; the endurance ledger stores only a
bounded classification, normalized reset/deadline fields, and commitments.

The regression recreates the exact failure shape: a valid session-limit banner
followed in the same chunk by 40 KB of healthy-looking redraw. The bounded tail
no longer contains the banner, while the first capacity observation remains
latched and release-blocking.

The failed 1.3.73 R5 run remains immutable and does not certify 1.3.74. Every
R1-R5 claim for this release must bind to the exact 1.3.74 artifact. Paid
evaluation calls remain pinned to Sonnet with low effort.
