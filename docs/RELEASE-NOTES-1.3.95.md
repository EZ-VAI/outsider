# Outsider 1.3.95

1.3.95 turns the consented Experience contribution protocol into a deployable
quarantine service while preserving the Stage 0.5 authority boundary.

## Added

- Cloudflare Worker public ingress with an SQLite-backed Durable Object as the
  strongly consistent single writer;
- strict request size/type checks, public and per-device rate limits, signed
  nonce challenges, one-use replay protection, content-hash deduplication, and
  a durable append-only hash chain;
- server signing material declared as a required Cloudflare Secret, never a
  source/config value;
- daily retention deletion for stored envelopes, contribution records, and
  attestations;
- signed revocation acknowledgments and future-use blocking through
  `outsider share revoke --send`;
- a deployment dry-run that bundles the actual Stage 0.5 verifier into the
  Worker rather than maintaining a second permissive parser.

## Authority boundary

Every accepted contribution remains `QUARANTINED`. An empty instrument
allowlist makes all public submissions L1 unrecognized by default. Even a
recognized L2 instrument is self-attested and is ineligible for PRICE,
GUARANTEE, or SETTLE until later CURATE and independent adjudication.

## Validation

- local contribution protocol: 7/7;
- full product suite on normal macOS permissions: 460/460;
- deterministic command corpus: 125/125;
- Cloudflare Wrangler 4.124 production bundle dry-run: success.

The repository contains a production-ready deployment artifact. Public cloud
activation still requires the operator to complete Cloudflare OAuth and set the
server signing secret; neither step is delegated to the Worker or stored in the
repository.
