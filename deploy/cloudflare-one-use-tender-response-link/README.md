# Outsider one-use tender response link v1

This Worker exposes a registration-free response page at
`GET|POST /r/v1/:responseToken`. One SQLite Durable Object is selected by the
hash of the 32–64 byte random token. Its synchronous compare-and-append
transaction permits exactly one `OFFER`, `DECLINE`, or administrative
revocation after issuance, including across isolate restarts.

Production response tokens are 64 bytes: 32 bytes of caller-supplied secure
random entropy plus an HMAC-SHA-256 tag created by
`createCloudflareOneUseTenderResponseTokenV1`. The Worker verifies the tag with
one of the 1–8 keys in the JSON-array secret
`RESPONSE_LINK_TOKEN_MAC_KEYRING_JSON` before any Durable Object lookup, so a
random anonymous URL cannot allocate persistent objects. Keep an old key in
the keyring until all links it signed have expired.

Workers KV is intentionally absent. It is eventually consistent and cannot be
the consume-once authority. A future KV external-head copy may publish only a
post-commit digest and must remain HOLD evidence.

Administrative routes (Bearer `ADMIN_BEARER_TOKEN`, minimum 32 characters):

- `PUT /internal/v1/response-links/:responseToken` initializes the frozen link.
  The JSON body is the input to
  `createOneUseTenderResponseLinkDefinitionV1`, excluding `responseToken`.
- `POST /internal/v1/response-links/:responseToken/revoke` takes exactly
  `{ "expectedTenderHash", "reasonCode" }`.
- `GET /internal/v1/response-links/:responseToken/source` retrieves the exact
  persisted response event, body bytes (base64), hashes, and normalized source
  after a response. It returns `202` while awaiting a response and `404` when
  revoked/expired without one. This authenticated read remains `HOLD` evidence.
- `GET /internal/v1/response-link-sources/:tokenHash` performs the same private
  retrieval by the already-stored token hash. It lets account-native replay
  recover historical responses after a MAC signing key leaves the overlap
  keyring, without retaining the bearer token.

`GET /healthz` is stateless and returns only the service version and
`mode: "HOLD"`; it does not read or expose a token, definition, or secret.

Cloudflare request observability is disabled in the deployment manifest so the
bearer URL is not intentionally retained in Worker invocation logs.

The public response and all administrative projections omit the raw token,
order summary, and raw seller response. A recorded response proves only that a
response occurred through the hosted bearer link. It remains `HOLD`; it does
not establish respondent identity, owner authority, capacity, price truth,
payment, or outcome truth.

Before deployment, set the secret in the target Cloudflare account and deploy
from this directory with Wrangler. Deployment is deliberately not performed by
the repository test suite.
