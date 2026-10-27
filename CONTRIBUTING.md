# Contributing to Outsider

Thank you for helping make outcome coordination usable across agents and resources. A focused change with a reproducible example is a useful contribution, whether it improves an adapter, a verifier, a planner, a recovery path, or documentation.

## Local setup

Use Node.js 22 or newer; Node.js 24 LTS is recommended.

```bash
npm ci
npm test
```

Run the relevant test file during development, then the default suite before submitting. Default tests must work without personal credentials, a paid account, or a live external effect. Keep live integration checks explicit and separate.

## Choose a small starting point

- Add a planner constraint and demonstrate a feasible and an infeasible plan.
- Add an adapter for one owner-controlled resource, with tests for duplicate requests, ambiguous responses, and reconciliation.
- Exercise shared-page/resource coordination with two agents: lease expiry, a stale fencing token, version conflict, or a restart during an external write.
- Add a durable execution scenario where the primary fails, recovery runs, the witness observes, and the program resumes after interruption.
- Add a source verifier with provenance, validity, and revocation cases.
- Improve actor/delegation or obligation lifecycle examples.
- Make one public API or fixture easier to understand.

For a major new protocol, a change to a versioned contract, or a new financial execution path, open an issue describing the concrete use case and affected boundary before building the larger change. Bug fixes and small improvements can go straight to a pull request.

## Implementation conventions

Use the existing ES module style and Node's standard library where practical. Reuse the canonicalization, hashing, durable operation identities, and existing record types rather than defining parallel protocols for the same facts.

A versioned record should keep its existing meaning. If semantics change, add an explicit successor or migration; do not silently reinterpret stored history. Record observations with their original source and time. An estimated fact should remain distinguishable from an observed fact.

External effects belong in adapters. The adapter's owner supplies actual authorization and resource access. The coordinator controls the ordering of cooperating callers; it cannot stop an unconnected administrator or external client from changing the underlying resource. A provider write should carry the provider's own conditional-write/version mechanism where available.

For every effectful adapter, explain:

1. What resource and actions it can control, and whose authority it uses.
2. How operation identities are preserved across retries and restarts.
3. How it detects an accepted action after an uncertain response.
4. Which observation establishes the resulting state.
5. How expiry, cancellation, and recovery work.

Do not include account identifiers, private transcripts, addresses, tokens, credential stores, or raw live run directories in a contribution. Use small synthetic fixtures or a deliberately reviewed public projection.

## Tests that matter

Test observable behavior and the failure the change addresses. For coordination and execution changes, useful cases include stale state, duplicate commands, partial reservation, restart after provider acceptance, uncertain effect, and recovery exhaustion. For evidence changes, verify source bindings, expiry/revocation, and changed payloads.

A passing fixture establishes behavior within its stated assumptions. Document when a live adapter or external institutional integration is still needed. In particular, local signatures and accounting records do not create coverage, custody, settlement authority, or legal discharge.

## Pull requests

Describe the problem and resulting behavior, the relevant validation, and any adapter assumptions. Include a short before/after example when it helps. Keep generated output out of the diff unless it is a small, intentional fixture needed to reproduce the change.

This repository focuses on Outsider's reusable infrastructure. HapNex product interfaces and business workflows are maintained separately; please keep contributions applicable to the core.

## License

By contributing, you agree that your contribution is licensed under this repository's [Apache License 2.0](LICENSE). Preserve existing copyright notices and identify any third-party material and its license.
