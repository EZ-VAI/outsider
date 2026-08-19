# Outsider 1.3.94

## Experience Contribution Gateway v1

1.3.94 adds the first consented path from sealed Stage 0.5 evidence into the
future clearing data plane.

- Sharing remains absent/off after installation. There is no background
  telemetry uploader.
- `outsider share preview` renders the exact privacy allowlist projection and
  performs no network request.
- `share enable` requires an HTTPS endpoint, a pinned server Ed25519 public key
  and the explicit `--accept-policy` flag. It creates a local device key and a
  hash-bound consent record; it still does not send data.
- `share send` uses a one-time signed server challenge, a device-signed single-
  run ATTEST and a device-signed contribution envelope. The signed server
  receipt is pinned and persisted locally.
- Uploaded records exclude source, prompt, transcript, paths, command output,
  credentials and raw events. Exact nested-field and bounded-value validation
  prevents unknown content from hitchhiking in a rehashed record.
- The durable reference ingress consumes nonces once, deduplicates by Experience
  contribution hash and records a hash-chained registry.
- Every ingress receipt is `QUARANTINED`; pricing, guarantee and settlement
  permissions remain false. Recognized-instrument self-attestation is L2
  research evidence, not owner confirmation, adjudication or loss evidence.

The included HTTP service is a quarantine-only protocol reference. It does not
claim that an Outsider production cloud, erasure pipeline, CURATE service or
pricing backend has been deployed.

## Verification

- Experience Contribution focused suite: 6/6.
- Full protocol suite: 458/458 before the final value-bound tightening; the
  release build reruns the complete suite from source and from the packed npm
  artifact.
- Gate corpus: 125/125.
