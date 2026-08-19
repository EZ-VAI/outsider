# Outsider 1.3.96

1.3.96 is the first source tree prepared for an open-source GitHub beta. It
does not inherit stable-release field evidence from 1.3.95 or earlier builds.

## Public-release changes

- adds an Apache-2.0 license, public package metadata, CI, security,
  contribution, and privacy policies;
- pins Wrangler 4.124.0 and adds independently deployable Cloudflare Workers
  for the quarantine-only Experience gateway and the real-run product demo;
- ships the pinned DeepSeek Harness references needed by the published canary;
- adds a browser-verifiable demo projection from a sealed, preregistered Claude
  Agent Team intervention run;
- adds reproducible, privacy-projected release metadata and checksums for public
  artifacts.

## Claim boundary

This release may be described as an **open-source beta** after its exact archive
passes the deterministic release build and certificate. It must not be called a
stable or production-ready release unless that exact certificate reports
`stablePublicReleaseReady: true`. Contributions remain disabled by default,
require explicit per-run consent, and enter quarantine rather than pricing,
guarantee, or settlement.

## Exact artifact validation

- product tests: 466/466;
- deterministic command corpus: 125/125;
- clean npm archive install and clean-package test replay: pass;
- hosted Cowork plugin archive validation: pass;
- Cloudflare contribution gateway and product demo dry-runs: pass;
- release decision: `PRIVATE_BETA_READY`;
- stable public release: `false` (field gates remain version-bound and are not
  inherited from earlier artifacts).
