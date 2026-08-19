# Outsider 1.3.86

1.3.86 fixes two deterministic endurance-control defects exposed by the first
exact-artifact 1.3.85 R5 attempt.

## Field evidence

The 1.3.85 run created a real two-member Agent Team, completed both independently
owned slices, passed lead integration, recovered from an injected controller
SIGKILL, and completed one factually audited correction chain through
`intervention_resolved`. Its artifact proof and sealed evidence were complete.
It did not certify endurance: a controller-owned recovery checkpoint repeated an
already audited Stop outcome, then the interactive Claude session lost
authentication before a later Stop could be delivered. The historical run
remains a failed R5 sample and is not relabeled.

## Repairs

- An exact recovery-checkpoint continuation now consumes only its one frozen
  checkpoint command and may reuse the prior content-addressed green acceptance
  and independent PASS audit. It cannot reuse a verdict after an edit, failed or
  unexpected tool action, fingerprint change, different intervention, or absent
  approval audit.
- Claude `/login`, authentication-required and authenticated `403 Request not
  allowed` output now terminate the endurance evaluator immediately as
  `CLAUDE_SESSION_AUTHENTICATION_INTERRUPTED`. This is explicitly classified as
  a host-capacity failure, not a product failure or an indefinitely running job.

## Evidence boundary

These changes preserve the strict Stage 0.5 proof requirement and reduce
unnecessary Sonnet calls; they do not turn 1.3.85 evidence into 1.3.86 evidence.
Stable public readiness still requires fresh exact-artifact R1-R5, Desktop
Cowork conformance and a signed distinct-host installation result.

Deterministic verification at freeze: 437/437 product tests and 125/125 policy
corpus cases.
