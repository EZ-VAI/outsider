# Outsider 1.3.24

Bounded semantic-judge process-tree termination after the immutable 1.3.23 R1
field batch exposed a real deadline overrun.

- JSON judges now execute in a controller-owned detached process group. At the
  configured deadline Outsider kills the complete group and closes inherited
  output pipes after a bounded grace period.
- This fixes the real Claude CLI shape where `execFileSync({ timeout: 240s })`
  signalled the immediate process but a descendant retained stdout, so the
  controller did not regain control for roughly twenty minutes.
- A regression now creates a judge grandchild that inherits stdout and proves
  the call returns as typed `control-plane-capacity` within the hard deadline.
- JSON authority parsing, semantic decisions, correction authority, proof
  thresholds, and worker permissions are unchanged. No detector or LLM judge
  was added.
- The immutable 1.3.23 R1 batch remains a failed 5/5 release gate after one
  conservative timeout/budget exhaustion. It is preserved as capacity-loss
  supervision and is not pooled with 1.3.24.

R1 through R5 must be regenerated on the immutable 1.3.24 artifact and its
preregistered evaluator hashes.
