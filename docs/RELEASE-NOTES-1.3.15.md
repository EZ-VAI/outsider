# Outsider 1.3.15

R4 repair build. It preserves every 1.3.14 recovery and supervised-data change,
and fixes a crash-liveness defect found by the first immutable R4 field attempt.

When a controller was SIGKILLed after persisting judge state but before sending
an RPC response, macOS could report a clean EOF instead of a socket error. The
hook-side RPC promise then waited for its full timeout even though generation 2
had already recovered the same run. `requestController()` now rejects a closed
peer immediately when no complete response exists, allowing the next bounded
hook retry to resume the exact intervention and authority journal.

The failed 1.3.14 R4 attempt is retained as negative operational experience and
is not counted in the 1.3.15 denominator. No 1.3.14 artifact is overwritten.
