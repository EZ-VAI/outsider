# Outsider 1.3.81

1.3.81 fixes release-test isolation discovered during the final 1.3.80 audit.
Several `startKernelRun()` tests exercised the production default state root
instead of an isolated temporary root. Running `npm test` could therefore add
synthetic, stopped-controller run directories to the user's real
`~/.outsider/runs` ledger. The synthetic worker PID and unfinished status made
the records distinguishable, but user state must never be an implicit test
fixture.

Every affected kernel test now receives a unique temporary `stateRoot`. A
focused before/after regression ran all six affected test cases with the real
local controller transport: 6/6 passed and the count of directories in the
user's state root remained byte-for-byte unchanged.

No runtime controller decision, semantic judge, hook authority, acceptance
policy, causal-proof rule or reliability threshold changed. Nevertheless, the
test files and package version are part of the immutable release artifact, so
1.3.80 field evidence is not relabeled as 1.3.81 evidence. R1–R5, Desktop
Cowork and independent-second-host claims must bind to the new artifact.

The historical synthetic directories are retained rather than silently
deleted. They are not sealed evidence and are not eligible for ATTEST or
supervised-experience export.
