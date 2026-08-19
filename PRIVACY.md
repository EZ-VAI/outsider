# Privacy policy for contributed experience

Outsider runs locally by default. Installing the software does not enable
telemetry and does not upload a run. Contribution requires a separate explicit
opt-in (`outsider share enable`) and an explicit send for each run
(`outsider share send`). Automatic upload is not supported.

## Data that may be contributed

The contribution envelope contains a signed, privacy-minimized derivative of a
sealed run: product and instrument identifiers, terminal class, bounded event
type/count commitments, correlation roots, causal-chain coverage, and
cryptographic hashes. It is used for quarantine research on controller
reliability, correlation, and evidence quality.

The client rejects raw source code, prompts, transcripts, credentials, file
paths, command output, raw event streams, and arbitrary extra fields. These stay
on the user's machine.

## Processing and retention

The public gateway is hosted on Cloudflare Workers. Cloudflare may process
network metadata needed to serve and rate-limit requests. Accepted envelopes
enter a quarantine registry; they do not become loss records and cannot
automatically enter PRICE, GUARANTEE, or SETTLE.

The contributor selects a retention period in the signed consent. Expired
payloads are purged. A signed revocation deletes stored contribution envelopes,
records, and attestations and blocks future use of that record. To preserve the
integrity of the append-only registry, content hashes, receipt hashes, registry
commitments, and the signed erasure acknowledgment may remain.

## User control

```bash
outsider share status
outsider share disable
outsider share revoke --send --reason USER_REQUEST
```

Disabling stops future sends. Revocation requests deletion of an already sent
record. Privacy questions may be submitted through the repository's private
security-reporting channel without attaching raw run data.
