# Outsider 1.3.82

1.3.82 closes an authority mismatch discovered by the first formal 1.3.81
endurance attempt. The lead created a correct shared scheduler task, then
spawned its teammate with a contradictory direct Agent prompt. Outsider caught
the mismatch at TaskCompleted and delivered three factually audited
corrections, but the teammate rationally treated the lower-priority hook text
as prompt injection because its principal Agent prompt said otherwise.

Named Agent launches with an owned shared task now use a deterministic,
model-free delegation handshake. TaskCreated freezes the shared task definition.
Before the Agent can spawn, its direct prompt must be byte-identical to a
controller-generated envelope binding the contract seal, task definition,
generation, owner, and task text. A missing, altered, ambiguous, or oversized
binding is denied before the teammate exists and cannot create a ghost delegated
task. The host may retry the same Agent using the exact returned envelope.

The append-only evidence chain now records and verifies
`team_delegation_bound → team_spawn_requested → teammate_spawned identity →
owned effect → verification → completion`. Supervised Experience records the
number of binding challenges, successful direct bindings, and definition or
binding conflicts without treating a normal handshake as semantic drift.

The protocol adds no LLM judge and grants no new execution authority. The
regression suite is 429/429 and the deterministic corpus is 125/125. Because
the controller, conformance assessor, evaluation prompts, tests, and package
bytes changed, all 1.3.81 R1–R5 and field evidence remain historical and are
not relabeled as 1.3.82 evidence.
