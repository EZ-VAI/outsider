# Outsider 1.3.76

1.3.76 makes the stable-public certificate reachable without weakening any
gate. Earlier certifiers could verify R1–R5 but hard-coded Desktop Cowork as
`PACKAGED_NOT_CONFORMED` and an independent machine as `NOT_RUN`; no amount of
valid field evidence could produce `stablePublicReleaseReady:true`.

The certifier now accepts two typed evidence paths:

- a real Cowork state root and exact workspace. It reopens the completed run,
  verifies the permanent Stage 0.5 seal and SAFE_DELIVERY causal proof, checks
  real Pre/PostToolUse boundaries and prompt preservation, and compares all
  runtime hashes with the candidate artifact;
- an Ed25519-signed second-host clean-install record. It must bind the exact
  artifact and packaged evaluator closure, pass install/version/help/doctor/
  tests/corpus/project-install checks, and commit a host identity different
  from the certifying machine. This is explicitly cooperative evidence rather
  than hardware remote attestation.

The documented second-host flow uses a Node-native Ed25519 key generator, so
it also works on supported macOS releases whose bundled LibreSSL lacks
`genpkey ED25519`.

The certifier also verifies its own source closure against the clean-installed
candidate. A modified checkout-side certifier cannot promote the package.

This release includes the 1.3.74 endurance capacity fix: every PTY stdout chunk
is parsed before tail truncation, so a Claude session-limit banner remains
latched even if a later terminal redraw exceeds 32 KB. The failed 1.3.73 and
aborted 1.3.74 runs remain historical non-certifying evidence. Every field gate
for 1.3.76 must bind to the exact immutable 1.3.76 artifact. Paid evaluations
remain pinned to Sonnet with low effort.
