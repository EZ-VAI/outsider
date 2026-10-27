# Outsider

[English](README.md) | [简体中文](README.zh-CN.md)

**A mutual layer for agents from different providers to operate on the same interface or device toward one or multiple goals.**

Outsider starts with a simple idea: a person describes something they want to happen, with a budget and an expectation of completion. Software should organize the resources, carry the work through failure, and preserve responsibility until the result is resolved.

This repository contains the reusable infrastructure behind that idea: outcome planning and durable execution, evidence and attestation, actor and delegation records, recovery coordination, and research modules for pricing, guarantees, claims, and settlement. It excludes the separate HapNex application and its product interfaces.

## What you can build

- **Durable agent workflows.** Compile a defined result into an `OutcomeProgram`, execute its dependency graph, resume after interruption, and activate an already-bound recovery route when the primary fails.
- **Resource coordination.** Plan over declared capabilities, costs, time windows, and shared capacity. Bind execution to owner-controlled adapters and evaluate results through the configured observation path.
- **Multi-agent shared-resource access.** Coordinate agents editing the same page or operating the same resource through a lease, fencing token, version check, and idempotent command. An uncertain external effect must be reconciled before the next command proceeds.
- **Shared goals across providers.** Personal, company, and coding agents can connect through an authenticated HTTP protocol, claim parallel work, hand off verified dependency outputs, and coordinate access across multiple goals. The existing OutcomeProgram runtime schedules the work.
- **Evidence and responsibility records.** Preserve source-bound observations, actor/delegation bindings, attempts, challenges, and continuing obligations across agent or provider replacement.
- **Risk and settlement research.** Explore curated evidence, loss/exposure models, non-binding quotes, guarantee gates, and claims lifecycles without treating local records as financial authority.

For example, a personal agent writes a page heading, a company agent supplies the terms, and a coding agent publishes their combined result. A second goal can update the same page's branding through the same gateway. Run the four-process example below: it includes a lost write response and recovery without duplicate execution. The same adapter pattern supports a device; each real interface/device needs its owner's control and reconciliation integration.

## Current implementation

| Area | Available in this repository |
| --- | --- |
| Outcome planning | Bounded world-state planning over supplied actions/resources, goal interpretation against a capability catalog, and compilation into the existing program format. |
| Durable execution | Primary/recovery/witness bindings, dependency-aware execution, durable operation identities, restart recovery, observation, and resource lifecycle handling. |
| Shared resources | A generic coordination mechanism for cooperating agents and an owner-controlled executor boundary. Actual pages and devices need their own adapters. |
| Shared agent layer | Multiple goals, task claims/renewal, verified dependency handoff, HTTP client/worker, task-scoped resource access, cross-goal contention, restart and uncertain-effect recovery. |
| Evidence and responsibility | Local integrity verification, lifecycle/source re-verification, actor/delegation records, network intake/conformance, and durable obligation tracking. |
| Pricing | Research and shadow analysis. The Stage 2 quote frontier returns `NON_BINDING_ABSTAIN`. |
| Guarantees and settlement | Local accounting, source-binding gates, and candidate claims workflows. Commercial coverage, custody, payment execution, adjudication, and final discharge require actual external integrations. |

Development records include a digital publication run that exercised primary failure, a recovery route, external observation, and resource release. It is evidence for that adapter composition. The open test suite supplies reproducible local checks; it does not require a live cloud account or move money.

## Get started

Use **Node.js 22 or newer**; Node.js 24 LTS is recommended.

```bash
npm ci
npm test
npm run demo:shared-goals
```

Start with the local planner and orchestrator tests to understand an outcome's lifecycle:

```bash
node --test test/outsider-world-state-resource-planner.test.js
node --test test/outsider-durable-outcome-program-orchestrator-v1.test.js
```

Tests and examples use explicit fixture adapters. Live provider operations are separate: configure an adapter, supply the relevant owner authorization, and choose the intended action explicitly. Keep credentials and live run directories outside version control.

This is a source contribution repository. Modules are ES modules in `src/`; versioned filenames preserve existing contracts while newer compositions evolve. See [Architecture](docs/ARCHITECTURE.md) for the component map and [Contributing](CONTRIBUTING.md) for focused starting points.


Start with the [mutual agent layer](docs/MUTUAL-AGENT-LAYER.md) for the V3–V4 composition, HTTP protocol, and provider integration. The underlying lease/adapter contract is in [shared-resource coordination](docs/SHARED-RESOURCE-COORDINATION.md). See [data and evidence](docs/DATA-AND-EVIDENCE.md) for source replay and dataset licenses. `npm run test:research` runs the additional research suite and requires its documented source data.

## Two views of the system

The execution stack has three layers:

1. **Outcome OS:** define, coordinate, observe, and replay a result.
2. **Formation and recovery:** bind usable capabilities and a contingency, including trigger, expiry, cost, and exercise conditions.
3. **Outcome commitment:** admit a bounded commitment only when the required reservations, authority, observation, and financial gates are present.

The evidence-to-settlement pipeline describes a different axis:

| Stage | Purpose | Present boundary |
| --- | --- | --- |
| 0.5 — MEASURE | Capture the task contract and agent execution evidence; support lifecycle supervision on configured hosts. | Exact host hooks and runtime conformance determine control coverage. |
| 1 — ATTEST | Verify integrity, source replay, and evidence lifecycle. | A verified signature establishes a key-bound statement, not institutional standing. |
| 1.5 — CURATE | Organize evidence with provenance, rights, and reuse constraints. | Intake and curation do not automatically authorize training or financial use. |
| 2 — PRICE | Study prospective risk, exposure, loss, and pricing. | Research/non-binding outputs; no executable insurance quote. |
| 3 — GUARANTEE | Check source bindings, request accounting, and one-use capability gates. | No policy issuance, proven reserve, custody, or fund transfer. |
| 4 — CLAIMS / SETTLE | Preserve claims, challenges, receipts, and settlement candidates. | Current frontier remains `HOLD`; it does not move funds or finally close obligations. |

These stage names describe components and a development direction. They are not a claim that a global financial clearing network is operating.

## Contribute

Useful contributions include a small provider adapter with reconciliation tests, a planner constraint, a shared-resource concurrency case, a reproducible restart/recovery scenario, a source verifier, or a clearer example. Please start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE).
