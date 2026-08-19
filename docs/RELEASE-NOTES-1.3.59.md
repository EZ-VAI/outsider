# Outsider 1.3.59

1.3.59 is a private-beta release candidate that fixes a deterministic semantic-evidence budget failure found by the first formal 1.3.58 R5 attempt. It is not a stable-release claim: this exact artifact has not yet completed a fresh multi-hour live run.

## Changed

- Outcome evidence is now content-addressed before it is sent to a semantic verifier or PASS auditor. Exact duplicate source bodies in the frozen acceptance definition and final diff are replaced with references to `currentSourceEvidence`.
- Successful native Read/Edit observation tails are omitted only when the same file body remains present in current source evidence. Test output, non-zero exits, unmatched bodies, action ordering and hashes remain available to the verifier.
- Null-only controller and execution fields are removed without changing event order or meaning.
- On the captured 1.3.58 formal failure packet this projection reduced minified evidence from 135,761 bytes to 82,718 bytes (39.1%) while retaining unmatched frozen tests, unmatched diff bodies and every failed-command output.
- Stable-release certification now requires explicit PASS fields for R1 repeatability, R2 Agent Team delivery, R3 integration correction and R4 crash recovery. A generic live canary can no longer stand in for those four distinct claims.

## Live evidence and cost boundary

- 1.3.58 non-certifying Sonnet/low smoke: SAFE delivery, complete audited intervention chain, controller crash recovery, four external checkpoints and permanently verifiable sealed evidence.
- 1.3.58 formal attempt: real two-member Agent Team identity, owned file effects, task completion and controller recovery were observed. It conservatively stopped after the semantic verifier repeatedly exhausted its per-process `$0.50` budget on duplicated evidence. The run sealed successfully and is retained as capacity-loss supervision, not as an R5 pass.
- The two runs used Sonnet/low only. Their aggregate nominal per-process budget envelope was `$15.90`; actual Max-plan credit consumption is not exposed by the CLI.
- No paid retry is included in this release. A fresh operator-authorized run is required after artifact freeze.

## Verification boundary

- Deterministic product suite: 398/398.
- Gate corpus: 125/125.
- Historical 1.3.58 evidence is not silently inherited by 1.3.59. It explains the fix but cannot certify this artifact.
- `stablePublicReleaseReady` must remain false until one immutable 1.3.59 artifact passes the exact-version live R1-R5 gates, including multi-hour endurance, Desktop Cowork conformance and an independent second-machine install.
- Do not hot-upgrade an active controlled session. Finish or conservatively terminate it before installing this version.
