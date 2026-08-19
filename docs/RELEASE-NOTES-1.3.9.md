# Outsider 1.3.9 private beta notes

This release is an immutable follow-up to the failed 1.3.8 Cowork canary. The
failure and its raw interpretation remain recorded in
`artifacts/cowork-conformance-20260811/FINAL-1.3.8-CANARY-RESULT.md`; 1.3.8 is not
silently rebuilt or relabeled as conformed.

- **A standalone operator-named subdirectory now preserves project identity.**
  Cowork users may select a broad folder and say `final-fixture 子目录` without
  including a slash. The resolver recognizes only names explicitly qualified as
  a directory/folder/repository, requires the candidate to stay under the selected
  root, and requires exactly one repository-owned acceptance command. It does not
  scan siblings, ask a model, or guess from arbitrary prose.
- **Observer-only degradation is visible.** If no repository-owned acceptance can
  be frozen, the first tool boundary injects one explicit `OUTSIDER_OBSERVER_ONLY`
  disclosure and Stop approves with a user-visible message that no controlled loop
  or independent delivery proof exists. It remains unattended-safe: no defer,
  confirmation prompt, or unrecoverable Stop wall is introduced.

The deterministic release baseline is 172/172 product tests and 125/125 gate-corpus
cases. A fresh real Cowork canary is still required before claiming that 1.3.9
completed transparent Stage 0.5 delivery or a typed active-intervention chain on
the host.
