# Outsider 1.3.77

1.3.77 preserves the stable-public evidence ingress introduced in 1.3.76 and
fixes one R5 evaluator false rejection observed in a real formal run.

The external witness received a valid, run-bound checkpoint, but Claude Code
reported the command as the evaluator-owned `cd` wrapper plus
`2>&1 | tail -20`. The old policy rejected every suffix even though this one
neither waited nor manufactured elapsed time. The policy now accepts only an
optional bounded output tail of 1–200 lines after the exact checkpoint command.
Arbitrary directories, extra commands, `tail -f`, sleeps, polling loops and
larger tails still fail closed. The external monotonic witness remains the
authority for whether a checkpoint actually occurred.

The failed 1.3.76 R5 run is retained as non-certifying evidence. All R1–R5 and
field gates for this release must bind the immutable 1.3.77 artifact; no
earlier version is pooled.
