# Outsider 1.3.80

1.3.80 resolves a contradiction exposed by the first frozen 1.3.79 R5 run.
The semantic outcome auditor correctly found a post-integration defect in a
teammate-owned file and emitted a factually audited correction to the lead.
The lead applied the exact correction, but the endurance evaluator treated
every cross-owner write as protocol drift and terminated the otherwise safe
repair.

The initial teammate slice remains exclusive.  A lead repair is now accepted
only when all of the following are hash-bound in the sealed event stream:

- a passing factual audit and its exact intervention/authority hash;
- a correction emitted and observed by the same lead actor;
- an expected edit whose path and preimage match the confirmed write;
- the same tool-use id at the successful expected action and observed effect;
- strict audit → emit → observe → write → expected-action → effect order.

Missing or mismatched evidence still triggers
`AGENT_TEAM_EXCLUSIVE_FILE_OWNERSHIP_VIOLATED`.  The failed 1.3.79 run remains
immutable conservative-stop supervision and is not pooled into 1.3.80 release
claims.
