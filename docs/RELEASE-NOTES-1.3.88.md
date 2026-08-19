# Outsider 1.3.88

1.3.88 fixes one real Cowork release blocker found by a natural read-only task.

A repository may advertise `npm test` while its local test runner is not installed.
Outsider already allowed a narrow set of diagnostic Read/Glob/Grep calls after that
preflight failure and continued to deny every mutation. However, the final Stop was
still blocked, leaving a harmless repository review unable to return an answer.

This release adds an explicit terminal class for that exact state:

- only the existing diagnostic reader allow-list may execute;
- every mutating tool remains denied;
- Stop is approved instead of becoming a permanent wall;
- the session is recorded as `read-only-unverified` with
  `proofComplete=false`, `deliveryComplete=false`, and `evidenceComplete=false`;
- the user sees that the answer is unverified read-only advice, not an Outsider
  Stage 0.5 delivery proof;
- a later task automatically retries controlled mode after the project acceptance
  environment is repaired.

No semantic judge, R5 evaluator, authority, or release threshold changed. The release
therefore improves normal Claude/Cowork usability without weakening fail-closed
behavior for work that can change the world.

Verification on the release source: 441/441 unit and integration tests, plus the
125/125 deterministic gate corpus. These counts are deterministic checks, not a
claim that the outstanding multi-hour, multi-agent, and second-host stable-release
gates have passed.
