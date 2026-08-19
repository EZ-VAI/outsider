# Outsider 1.3.89

1.3.89 repairs a real controller-authority failure exposed by formal R5.

The frozen task required a three-node shared task graph and two named Sonnet
teammates with exclusive source-file ownership. The semantic supervisor correctly
diagnosed that the worker had skipped that structure, but correction-authority v1
could encode only edit/read/run actions. It therefore authorized main to edit all
four files while mentioning the required team only in non-authoritative prose.
The final semantic verifier rejected the result, but by then Outsider had failed
its central promise: a correct diagnosis had not become a structurally faithful
intervention.

This release makes coordination part of the control protocol:

- correction-authority v2 can bind shared-task owners/dependencies, named teammate
  spawns and every file action to a specific actor;
- the independent factual auditor checks those identity and ordering fields;
- the controller observes successful host TaskUpdate and Agent receipts as causal
  effects but never executes model-authored commands;
- main cannot substitute for a teammate-owned edit, and lead cannot begin its own
  implementation until the audited task/spawn prerequisites have real host evidence;
- formal R5 freezes one identical ownership policy into the live controller and
  post-run certifier before the worker starts;
- an audited lead repair can cross an ownership boundary only after the original
  teammate really produced and independently completed that slice. An audited main
  implementation of an untouched teammate slice now fails immediately.

Verification on the release source: 443/443 unit and integration tests plus the
125/125 deterministic gate corpus. The R5 endurance result is version-scoped and
must come from the immutable 1.3.89 artifact; this note does not pre-claim it.
