# Outsider 1.3.19

Private-beta reliability build for the remaining R1 availability failures in
the immutable 1.3.18 batch.

- Every pre-worker outcome verifier and required PASS auditor now shares one
  bounded typed-repair retry. A transient JSON/schema failure receives the
  parser's exact repair instruction; a second failure remains fail-closed.
- A supervisor proposal whose prose contains only verification steps can no
  longer erase an already-audited edit obligation. When the independent
  semantic outcome names a defect and the typed expected actions contain an
  in-scope edit, the authority deterministically states that the file must be
  repaired to eliminate that claim. It does not invent replacement source or
  execute a model-authored command.
- No LLM judge or retry stage was added. The controller still permits at most
  two calls per pre-worker typed judge and still withholds any correction that
  fails factual audit.
- The 1.3.18 field batch remains negative evidence: 2 causal deliveries, 1
  verified-but-unattributed delivery, 1 pre-worker JSON failure, and 0 false
  greens. It is not pooled with 1.3.19.

R1 through R5 must be regenerated on the immutable 1.3.19 artifact. Do not
hot-upgrade an active controlled session.
