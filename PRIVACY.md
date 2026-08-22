# Privacy policy

Outsider runs locally by default. Installing the software does not enable
telemetry and does not upload a run. Contribution requires a separate explicit
opt-in (`outsider share enable`) and an explicit send for each run
(`outsider share send`). Automatic upload is not supported.

## Optional external supervisor

An ordinary install does not start an external semantic supervisor. Without
both a configured command (`OUTSIDER_SUPERVISOR` or
`OUTSIDER_SUPERVISOR_ARGV`) and the separate
`OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR=1` consent bit, attached mode stays
local-only, permits bounded read-only diagnosis, and fails closed for potential
world changes. Headless `outsider run` enforces the equivalent command plus
`--allow-external-supervisor` pair before it starts a worker.

`outsider install --scope user --supervisor... --allow-external-supervisor`
persists the same two-part choice in the Claude/Codex hook command and, on
macOS, the Cowork helper. The command must contain only supervisor executable
and argument identity. Inline tokens, passwords, private-key material and URLs
with query credentials are refused; authenticate the selected supervisor using
its own protected login or credential store. Malformed, non-regular or
symlinked host settings fail closed and remain unchanged. A successful update
keeps the previous bytes in a unique mode-`0600` hidden backup next to the
settings file.

When the operator enables this boundary, the selected command receives a
bounded recursive projection used for semantic review. Sensitive-path evidence
objects and binary/non-plain objects are omitted, common credential blocks,
authorization values and URL queries are redacted, and the child environment is
an allowlist rather than the controller's ambient environment. The projection
may still contain non-sensitive source excerpts, the task prompt, structural
tool evidence and acceptance output needed for review. Redaction is defense in
depth, not a proof that every future secret format is recognizable. Whether the
selected command invokes a remote provider, and that provider's processing and
retention terms, remain the operator's responsibility.

This supervisor consent is separate from Experience contribution consent. It
does not enable telemetry, contribution, or historical sends.

Standalone/legacy host adapters, including the unverified CodeBuddy surface,
never obtain command authority from repository-writable `.outsider/run.json`
or `.outsider/contract.json`. Only the authenticated controller/RunStore path
may execute acceptance or invoke a configured supervisor; standalone adapters
remain non-executing observers/gates.

Local compliance diagnostics are also off by default. To create the bounded
local `.outsider/shadow.jsonl` ledger for an explicitly consented experiment,
set `OUTSIDER_COMPLIANCE_LEDGER=1` in that hook process. The ledger contains
only hashed action/path identifiers and allowlisted structural fields; commands,
paths, prompts, source, output and credentials are excluded. Its default local
retention is 7 days (operator-configurable from 1 to 30 with
`OUTSIDER_COMPLIANCE_RETENTION_DAYS`), the directory is mode `0700`, and the
file is mode `0600`. It is never uploaded automatically.

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
outsider compliance-ledger status
outsider compliance-ledger erase
```

Disabling stops future sends. Revocation requests deletion of an already sent
record. Privacy questions may be submitted through the repository's private
security-reporting channel without attaching raw run data.
