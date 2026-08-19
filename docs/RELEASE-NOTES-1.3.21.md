# Outsider 1.3.21

Evaluation-closure correction for the immutable 1.3.20 build.

- R1 now transports its supervisor command as typed argv through the packaged
  recovery canary. It no longer reconstructs a shell string that bypasses the
  product's bounded direct-process timeout.
- R4's deterministic recovery oracle and the release-gate default likewise use
  direct argv. Explicit operator-supplied legacy string commands remain
  supported and are disclosed as operator configuration.
- The 1.3.20 artifact remains a valid private-beta product build, but no R1–R5
  field claim is made from it because its formal R1 evaluator did not exercise
  the new timeout transport.
- No controller decision, LLM judge, detector, or model threshold changed from
  1.3.20.

R1 through R5 must use one immutable 1.3.21 artifact and the preregistered
evaluator hashes. Do not pool 1.3.19, 1.3.20, or 1.3.21 field runs.
