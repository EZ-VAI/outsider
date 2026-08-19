# Outsider 1.3.84

1.3.84 closes a multi-agent control-timing defect found by two independent
1.3.83 R2 field samples.

## Finding

Both samples kept unsafe delivery closed, but the lead edited teammate-owned
files before creating the shared task graph. In the stronger sample it later
spawned two real teammates and asked them only to test the lead's completed
work. Outsider correctly rejected both TaskCompleted attempts because the
teammates had no confirmed file effects. This was safe containment, not a valid
Agent Team completion.

## Frozen slice ownership

- A formal Agent Team policy is now persisted in controller configuration and
  committed to the event stream before the worker starts.
- When that policy explicitly assigns a file to a teammate, a lead, another
  teammate, or an unbound subagent cannot use Edit/Write on the slice.
- The denial is deterministic and names the required shared-task and named
  Agent recovery path. It uses no additional LLM judge and does not affect runs
  without an explicit frozen Agent Team policy.
- The already-existing host receipt, identity binding, task ownership and
  confirmed effect checks remain the authority for successful teammate work.
  A late teammate that only reruns tests still cannot pass conformance.

## Evidence boundary

The two 1.3.83 R2 results remain sealed conservative-failure supervision; they
are not relabeled. 1.3.84 needs fresh exact-artifact R1-R5 results. The release
still cannot claim stable-public readiness before those live gates and exact
Cowork conformance pass.

Deterministic verification at freeze: 433/433 product tests and 125/125 policy
corpus cases.
