# Outsider Experience Gateway — Cloudflare deployment

This is the production quarantine edge for explicitly consented Stage 0.5
experience contributions. It is not CURATE, PRICE, GUARANTEE, or SETTLE.

The Worker uses one SQLite-backed Durable Object as a strongly consistent,
single-writer registry. It verifies the server challenge, device signature,
single-run ATTEST v2, exact privacy projection, consent, and audience before it
stores anything. Record hashes are unique, nonces are single-use, receipts are
server-signed, and every accepted record is appended to a hash chain.

Only `SERVER_PRIVATE_KEY_PEM` is secret. Never place it in this directory or in
`wrangler.jsonc`:

```bash
cd deploy/cloudflare-experience-gateway
npx wrangler@4.124.0 secret put SERVER_PRIVATE_KEY_PEM
npx wrangler@4.124.0 deploy
```

After deployment, pin the public key returned by:

```bash
curl https://YOUR-WORKER.workers.dev/v1/contributions/info
```

The public client remains opt-in and explicit-send-only:

```bash
outsider share enable \
  --endpoint https://YOUR-WORKER.workers.dev \
  --server-public-key server-public.pem \
  --accept-policy
outsider share preview RUN_ID
outsider share send RUN_ID
```

Signed erasure and future-use blocking:

```bash
outsider share revoke --send --reason USER_REQUEST
```

The service deletes stored contribution envelopes, records, and attestations.
It retains only content hashes, receipt hashes, the append-only registry chain,
and a signed erasure acknowledgment. Expired payloads are purged by the daily
scheduled trigger.

`ACCEPTED_INSTRUMENT_HASHES` must only contain audited release instrument
hashes. Empty means every submission remains L1 unrecognized. Recognition is
still quarantine-only and never authorizes pricing, guarantees, or settlement.
