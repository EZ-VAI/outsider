# Outsider 1.3.7 private beta notes

This release fixes a real Claude Desktop/Cowork P0 observed on 1.3.6.

- The macOS LaunchAgent now receives a deterministic executable `PATH` containing the Node directory, the installer's PATH, common
  Homebrew/npm locations, and system paths. In 1.3.6, launchd's default `/usr/bin:/bin:/usr/sbin:/sbin` made a repository-owned
  `npm test` disappear even though it worked in the user's terminal.
- Acceptance preflight errors now retain the actual missing-command exit and output. The 1.3.6 branch correctly noticed exit 127 but
  incorrectly reported the generic `acceptance did not run`, hiding the actionable cause.
- A bootstrap failure no longer turns every tool into the same permanent denial loop. Mutating tools and Stop remain fail-closed, while
  named read-only diagnostic tools are allowed in an explicitly degraded state. The daemon retries bootstrap with bounded exponential
  backoff and returns to controlled mode without merging or relabeling the failed attempt.
- Regression coverage reproduces the exact LaunchAgent PATH shape and proves diagnostic-read access, hot-loop suppression, mutation
  denial, and autonomous recovery. The release baseline is 161/161 product tests and 125/125 gate-corpus cases.

This does not convert a degraded task into a successful Stage 0.5 run. Until bootstrap recovers and a sealed controller run exists,
Outsider continues to block state-changing tools and completion and makes no delivery claim.
