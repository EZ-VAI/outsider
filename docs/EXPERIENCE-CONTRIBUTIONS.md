# Experience Contribution Gateway

## Product boundary

The gateway turns a sealed local Stage 0.5 run into an explicitly authorized,
privacy-minimized research contribution. It does not turn downloads into
surveillance and it does not turn self-attested runs into insurance evidence.

Default behavior:

- no contribution configuration exists after ordinary installation;
- no automatic uploader or background telemetry sender runs;
- source code, prompts, transcripts, paths, command output, credentials and the
  raw event stream remain local;
- `outsider share preview` makes no network request;
- `outsider share send` is the only data-sending command in v1.

The sent contribution is a strict allowlist projection of
`outsider/supervised-experience/v2`. Unknown nested fields are rejected even if
an untrusted client recomputes a hash. The projection contains instrument and
evidence commitments, terminal dimensions, causal labels, aggregate risk
classes, aggregate host-capacity observations and bounded trajectory features.

## Client workflow

Obtain the contribution service's HTTPS endpoint and Ed25519 public key from
the operator. Then:

```bash
outsider share preview <run-id|run-directory>

outsider share enable \
  --endpoint https://contributions.example.com \
  --server-public-key ./server-public.pem \
  --purposes stage05-reliability,supervisor-research,routing-research \
  --retention-days 365 \
  --accept-policy

outsider share send <run-id|run-directory>
outsider share status
```

`enable` creates a local Ed25519 device key (`0600`), pins the server key and
writes a hash-bound consent record. It never sends a run. `send` performs:

1. local verification of the sealed evidence manifest and supervised record;
2. deterministic privacy projection;
3. server nonce challenge retrieval and pinned-key verification;
4. single-run ATTEST v2 signing with the device key;
5. signed contribution-envelope submission;
6. pinned verification and local persistence of the server receipt.

`disable` stops future sends but is not a deletion request. `revoke` creates a
signed local revocation request and disables sending. `revoke --send` sends it
to the configured production gateway, verifies the server-signed erasure
acknowledgment, and stores that acknowledgment locally. The local reference
service remains transport-only and does not implement remote erasure.

## Reference quarantine ingress

The repository includes a transport reference, not a production cloud:

```bash
npm run experience:serve -- \
  --state-root /secure/outsider-contributions \
  --audience http://localhost:8787 \
  --host 127.0.0.1 \
  --port 8787 \
  --init \
  --accepted-instrument-hashes sha256:...
```

`--init` generates `server-private.pem` (`0600`) and `server-public.pem`.
Production operators should supply a managed signing key instead. The service
implements:

- `GET /v1/contributions/info`
- `POST /v1/contributions/challenge`
- `POST /v1/contributions`

Ingress verifies the nonce, audience, device signature, ATTEST signature,
Experience/manifest binding and exact contribution schema. It consumes each
nonce once, deduplicates on the contribution-record hash, records a hash-chained
registry entry and returns a signed receipt.

Every receipt is `QUARANTINED`. A recognized release instrument produces the
class `L2_RECOGNIZED_INSTRUMENT_SELF_ATTESTED`; an unknown instrument remains
`L1_UNRECOGNIZED_INSTRUMENT_SELF_ATTESTED`. Both carry:

- `OWNER_CONFIRMATION_ABSENT`
- `EXTERNAL_ADJUDICATION_ABSENT`
- `CORRELATION_NOT_YET_DISCOUNTED`
- `PENDING_CURATE_REVIEW`

and cannot enter pricing, guarantees or settlement.

This reference server intentionally omits production rate limiting, operator
authentication, KMS integration, regional data residency, erasure jobs, abuse
response and the CURATE promotion workflow. It must not be exposed to the
public internet unchanged. The production Cloudflare Worker in
`deploy/cloudflare-experience-gateway` adds a rate-limited public edge, a
strongly consistent SQLite Durable Object registry, replay protection,
deduplication, signed erasure acknowledgments, future-use blocking, retention
purges, and sealed quarantine receipts. Its signing key is a Worker secret,
never repository configuration.

## The path into the clearing stack

```text
sealed Stage 0.5 run
  -> privacy projection + explicit consent
  -> challenge-bound ATTEST
  -> quarantine ingress + D1 dedup
  -> D2 instrument/version separation
  -> correlation discount + poisoning/anomaly checks
  -> Stage 1.5 CURATE eligibility decision
  -> Experience Registry
  -> shadow behavior models
  -> only externally adjudicated loss evidence may approach PRICE
```

Downloads are not samples. Active installations are not samples. Runs are not
independent samples. Only verified, consented, deduplicated and correctly
grouped contribution records enter the research denominator. A delivery label
is not a treatment-effect label; `VERIFIED_DELIVERY_UNATTRIBUTED` stays excluded
from correction-effect learning.
