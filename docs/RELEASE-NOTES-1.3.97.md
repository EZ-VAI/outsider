# Outsider 1.3.97

1.3.97 is the first open-source GitHub beta prepared for publication under the
authenticated `EZ-VAI/outsider` repository. It supersedes the unpublished
1.3.96 build, whose package metadata pointed at the wrong GitHub owner.

## Public-release contents

- Apache-2.0 source release with CI, security, contribution, and privacy
  policies;
- native Claude Code and Desktop Cowork attached supervision packages;
- independently deployable Cloudflare Workers for the quarantine-only
  Experience gateway and real-run product demo;
- browser-verifiable evidence from a sealed, preregistered Claude Agent Team
  intervention run;
- privacy-projected public release certificate and reproducible checksums;
- DeepSeek Harness observation integration with no implied control authority.

## Claim boundary

This release is an **open-source beta** and may be published only after its exact
archive passes the deterministic release build and certificate. It is not a
stable or production-ready release unless that exact certificate reports
`stablePublicReleaseReady: true`. Contributions remain disabled by default,
require explicit per-run consent, and enter quarantine rather than pricing,
guarantee, or settlement.

## Validation target

- product tests: 469/469;
- deterministic command corpus: 125/125;
- clean npm archive install and clean-package test replay;
- hosted Cowork plugin archive validation;
- Cloudflare contribution gateway and product demo dry-runs;
- release decision: `PRIVATE_BETA_READY`;
- stable public release: `false`.

## Public services

- product demo: `https://outsider-stage05-demo.outsider-guard.workers.dev`;
- opt-in contribution gateway:
  `https://outsider-experience-gateway.outsider-guard.workers.dev`;
- gateway key id:
  `sha256:d4d51c3560764ed18f47b121721f4f4c9a3594d634e5dbcb00442300f39b6bad`.

The contribution gateway is quarantine-only. It does not automatically train a
model or promote self-attested records into pricing, guarantees, or settlement.
