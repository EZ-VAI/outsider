# Outsider 1.3.16

Second R4 repair build. It preserves 1.3.15 clean-EOF handling and closes a
watchdog readiness race found by the next immutable R4 attempt.

`waitUntilReady()` previously treated an IPC-connected child as ready. Directly
after SIGKILL, the old child could still appear connected until Node delivered
its exit event, so the caller retried against a socket that had already died.
Readiness now requires a successful authenticated controller ping and waits
through the bounded generation replacement. It never uses a blind sleep and
never accepts a process ID alone as a live authority boundary.

The failed 1.3.14 and 1.3.15 attempts remain version-scoped negative operational
experience. Neither is included in the 1.3.16 success denominator.
