# Outsider 1.3.55

1.3.55 is a private-beta candidate that closes a cost-policy hole discovered by the real R2 Agent Team canary.

- Formal Agent Team evaluations now require every named Agent call to explicitly set `model="sonnet"`.
- The evaluation hook blocks a missing or different teammate model before the host may spawn it.
- The sealed host evidence records the requested model and privacy-safe runtime model names derived from each teammate transcript.
- R2/R3 conformance fails unless every required teammate is independently observed running a Sonnet model.

The earlier 1.3.54 R2 protocol result remains useful identity/task evidence, but it is not cost-policy conformant: its lead used Sonnet while its two teammates inherited the account's Opus default. Do not use that run as the final R2 release gate.

This release does not change public readiness. R1 passed on 1.3.54; R2 and R3 must be rerun on this immutable version, and R5 endurance remains outstanding.
