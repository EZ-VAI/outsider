# Architecture

Outsider coordinates work around a durable definition of a result. Agents propose or execute work, resource owners expose capabilities, and observers supply evidence. Replacing an agent or provider should preserve the outcome's identity, execution history, and outstanding obligations.

This document maps the reusable code in this repository. HapNex is a separate application built above parts of this infrastructure; its user interface and business workflows are outside this distribution.

## Execution path

```text
User / application / agent
            |
            v
Goal + acceptance criteria + budget + deadline
            |
            v
Capability catalog -> world-state resource planner
            |
            v
OutcomeProgram compiler
            |
            v
Durable orchestrator
   | primary   | recovery   | witness
   v           v            v
Owner-controlled execution and observation adapters
            |
            v
Evidence, resource lifecycle, and continuing obligations
```

### 1. Define and plan

The goal compiler matches a request to targets in a supplied capability catalog. The planner searches over declared actions, preconditions, effects, durations, costs, windows, and resource claims. Its bounds keep computation finite. A planned effect is a requirement to achieve and observe; it is not an observation that the effect occurred.

The program compiler binds a selected plan to the existing `OutcomeProgram` format. Provider capabilities, observation requirements, and authorization come from explicit bindings. Compilation does not create capacity or execution authority.

Entry points:

- `src/outsider-world-state-goal-compiler.js`
- `src/outsider-world-state-resource-planner.js`
- `src/outsider-world-state-program-compiler.js`
- `src/outsider-outcome-program-v1.js`

### 2. Form, execute, and recover

The durable orchestrator reserves requirements, executes independent dependency branches, activates a bound recovery route after an explicit primary failure, and presents the effective result to the bound witness. The program's record separates an execution result, an observation, and lifecycle closure.

An external action has a deterministic operation identity. The process can stop after a provider accepts the action but before the local completion record is written, so adapters must reconcile the same identity rather than issue a second effect. An inconclusive observation pauses progression and can be observed again. Preconditions with an explicit freshness contract are re-observed before a new effect.

Entry points:

- `src/outsider-durable-outcome-program-orchestrator-v1.js`
- `src/outsider-outcome-product-runtime-v2.js`
- `src/outsider-transaction-surface-adapter-contract-v1.js`
- `src/outsider-external-capacity-reservation-protocol-v1.js`

Development records include a digital publication composition that ran a failed primary, recovery route, external observation, and resource release. Generic behavior is exercised through local adapters in the test suite; each live provider still needs its own tested effect and reconciliation implementation.

### 3. Coordinate shared resources

Several agents may share a browser page, document, device, or provider account. The shared-resource coordinator orders cooperating callers using an expiring lease, a monotonically advancing fencing token, a resource version, and an idempotency key. Its owner-controlled executor checks the current grant before dispatching an effect.

For a shared page, the flow is:

1. Agent A obtains the lease and reads the current version.
2. A submits an authorized command with its fencing token, expected version, and operation identity.
3. The owner adapter performs the conditional write and returns a public receipt.
4. The coordinator records the result before allowing the next operation.
5. If the response is uncertain, the resource remains blocked pending reconciliation of that operation.
6. Agent B can continue once the prior action is resolved and it holds a current lease/version.

This mechanism establishes one coordinator's ordering over connected callers. It does not acquire ownership of a resource, serialize unrelated external writers, or make several independent coordinator instances a distributed consensus service. Provider-side conditional writes and provider-native idempotency improve the boundary where available. Page and device adapters are separate integrations.

### 4. Preserve identity, delegation, and obligations

Actor identity envelopes and responsibility/delegation records connect work to the configured parties and authority scope. A transport identity or agent brand alone is not an accountable real-world person.

The obligation store records open obligations, observation horizons, recovery due, challenges, and reopening. A success report, payment report, expired grant, or provider replacement is a non-closing fact. The current production store does not supply an external final-discharge provider.

The Node SDK describes compatible intake and adapter evidence. Its present conformance projection remains quarantined and compatibility-only; it does not itself execute a resource or establish identity, delegation authority, or outcome truth.

Entry points:

- `src/outsider-actor-identity-envelope.js`
- `src/outsider-responsibility-graph.js`
- `src/outsider-delegation-radius.js`
- `src/outsider-reality-obligation-store.js`
- `src/outsider-network-node-sdk.js`
- `src/outsider-network-node-contract-conformance.js`

## Service layers

These layers describe how much of a result's lifecycle a composition takes on:

| Layer | Purpose | Additional requirement |
| --- | --- | --- |
| Outcome OS | Definition, coordination, evidence, and replay. | Explicit contract and the observations needed for its status. |
| Formation + recovery | Bind primary capability and an executable contingency or held option. | Trigger, authority, cost, expiry, and remaining deadline feasibility. |
| Outcome commitment | Accept a bounded external commitment. | Current reservations, independent observation, accountable authority, financial backing, and challenge/remedy paths. |

An internal `COMMIT` or `PROGRAM_COMMITTED` state describes a protocol transition. A public commercial guarantee needs the complete external composition; the state name alone does not issue one.

## Evidence-to-settlement pipeline

The stage pipeline concerns what may be concluded or authorized from evidence. It is separate from the execution layers above.

| Stage | Main implementation | Function and current boundary |
| --- | --- | --- |
| 0.5 — MEASURE | Lifecycle controller and `outsider-stage05-evidence.js` | Contract-bound run evidence and configured host supervision. Control coverage depends on the exact runtime surface. |
| 1 — ATTEST | `outsider-stage1-lifecycle-frontier.js` | Source replay, integrity, membership/revocation/retention lifecycle under a pinned policy. Local key verification is distinct from external institutional standing. |
| 1.5 — CURATE | `outsider-curate-core.js`, corpus registry and intake | Provenance-bound organization and admission of evidence with reuse constraints. Quarantined intake does not automatically become training data. |
| 2 — PRICE | `outsider-stage2-quote-frontier.js`, actuarial/shadow modules | Join evidence and study prospective risk, loss, and exposure. The current quote frontier produces `NON_BINDING_ABSTAIN`. |
| 3 — GUARANTEE | `outsider-stage3-guarantee-gate.js` | Durable local accounting and source-bound one-use candidates. It does not issue a policy, establish reserve/custody, or move funds. |
| 4 — CLAIMS / SETTLE | `outsider-stage4-claims-lifecycle-frontier.js` | Signed append-only candidate workflow for claims, notices, challenges, receipts, and payment instructions. Outputs remain `HOLD`; no fund movement or final obligation closure. |

Evidence may enter these modules at different strengths. Preserve whether a record is declared, source-replayed, observed, externally authorized, or a research candidate. Do not promote it by renaming a field or signing it locally.

## Adapter boundary

The core owns ordering, durable state, bindings, and verification logic. An owner adapter owns actual provider access, effect authorization, native idempotency/conditional writes, and reconciliation. A witness owns its configured observation method and receipt. Sensitive credentials stay with the execution owner; durable public receipts must be redacted.

Useful adapter tests include duplicate delivery, expiry before action, provider acceptance followed by local failure, unknown response, cancellation, witness disagreement, and restart. A generic schema cannot substitute for a provider's actual behavior.

## Reading and contributing

Start with the world-state planner test, then the durable orchestrator test and the product runtime v2 test. They demonstrate the contracts without requiring a live account. Shared-resource concurrency and adapter reconciliation are useful focused contributions. For evidence work, start with the relevant stage module and its matching test.

Prefer improving an existing composition over adding a parallel record family. Version changes that alter stored semantics explicitly. See [Contributing](../CONTRIBUTING.md) for the development workflow.
