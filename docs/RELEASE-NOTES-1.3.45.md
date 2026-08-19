# Outsider 1.3.45

1.3.45 is a private-beta reliability candidate. It closes a cost-policy hole
in the live R1, R2 and R3 evaluators: configuring the supervisor as Sonnet/low
did not previously constrain the owned worker, which could inherit a costly
interactive-account default. Every model-bearing process in these canaries is
now launched through one bounded evaluation guard. The guard rejects Opus or
elevated effort before the process starts, records the selected model and
effort, and enforces a finite process ceiling. R5 already used the same guard.

The release also contains the 1.3.44 control fixes:

- controller-owned red Stop acceptance cannot be cleared by an empty
  `onTrack:true` diagnosis;
- an exact post-baseline file addition may be deleted only when its path and
  preimage are controller evidence and it is outside protected/output paths;
- provider-neutral signed federation packets and the bounded global monitor
  support Codex, DeepSeek Harness, Claude and Trae without pooling credentials
  or overstating each surface's authority;
- every sealed Stage 0.5 run exports a hash-bound supervised Experience record
  that separates delivery success from Outsider causal contribution.

Deterministic release checks and the 125-case command corpus pass. R1-R5 must be
rerun against the immutable 1.3.45 package before any reliability claim is
made. The version remains private beta: it is not a stable public release, an
insurance quote, a guarantee, a settlement instruction, or proof of an
independent second-machine installation. Do not hot-upgrade an active session.
