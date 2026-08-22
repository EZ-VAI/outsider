# Outsider 1.3.98

1.3.98 is a new open-source beta identity for the reviewed Stage 0.5 public
runtime. It does not reuse the tagged 1.3.97 identity or artifacts.

## Install surfaces

- Adds a validated repository marketplace and universal plugin package for
  ChatGPT and Codex.
- Adds complete English and Simplified Chinese README files with reciprocal
  language links.
- Includes the exact Apache-2.0 `LICENSE` in both the Claude archive and the
  ChatGPT/Codex universal plugin package.
- Verifies a clean Codex 0.144.5 local marketplace add, plugin discovery,
  installation, and enabled `1.3.98` identity inside an isolated `CODEX_HOME`;
  this proves packaging/installability, not runtime control.
- Keeps surface capabilities explicit: ChatGPT receives the Outsider skill but
  no universal lifecycle interception; Codex requires the companion runtime,
  exact `/hooks` trust, and a real conformance receipt before any controlled
  claim.
- Keeps Claude Code/Desktop Code and Cowork install paths separate; Cowork
  still requires the matching plugin archive and local helper handshake.

## Safety and privacy

- External semantic supervision remains disabled unless the operator supplies
  both a supervisor command and independent external-disclosure consent.
- Supervisor evidence is recursively minimized; sensitive-path evidence
  units, binary/non-plain values, common credential blocks, authorization
  values, and URL queries are excluded or redacted.
- Repository-writable legacy run/contract files cannot grant command authority.
- Host settings and helper files use private, no-symlink, stable-identity,
  no-clobber publication paths.

## Release boundary

The root workspace remains private and intentionally unpackable. The release
builder stages only the reviewed Stage 0.5 dependency closure, exact-compares
the packed npm member set, and validates every Claude plugin archive member by
path, byte count, and SHA-256. Stage 1–4, Reality Stewardship, governed model,
actuarial, outreach, acquisition, raw source, and canonical research artifacts
remain local.

This release remains beta. Plugin visibility, successful installation, hook
configuration, hook trust, runtime observation, and controlled status are
separate evidence states.
