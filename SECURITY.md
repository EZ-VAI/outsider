# Security policy

Outsider installs Claude hooks and, on supported macOS Cowork surfaces, a
user-level helper. Treat defects in hook admission, controller authentication,
evidence sealing, privacy projection, contribution signing, or uninstall as
security-sensitive.

## Reporting

Please use GitHub's private vulnerability reporting for the repository rather
than opening a public issue. Include the affected version, host surface,
minimal reproduction, and whether the problem can cause an unauthorized allow,
an unrecoverable block, evidence tampering, or private-data disclosure.

Do not include source code, prompts, transcripts, credentials, private keys, or
raw Outsider run directories in a report. A maintainer will provide a private
transfer method if those bytes are genuinely required.

## Supported release

Security fixes target the newest GitHub release. Older betas may receive a
backport only when the evidence format permits it without invalidating sealed
runs.

## Trust boundary

Outsider Stage 0.5 is an open-source beta, not an OS sandbox, insurer, or
guarantee. It controls only host surfaces whose lifecycle hooks have passed
runtime conformance. Ordinary Claude Chat, remote surfaces that cannot reach
the local helper, Codex, and Trae are not silently promoted to controlled mode.
