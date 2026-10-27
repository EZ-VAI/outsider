# Shared-resource coordination

Several personal or company agents can coordinate writes to one owner-managed page or device through `createSharedResourceCoordinator`. The coordinator provides leases, fencing generations, observed-state checks, durable operation identities, and reconciliation after an uncertain effect.

The owner must route **all participating writers through one gateway**. This implementation coordinates one resource on one host. It does not control an arbitrary website, stop unrelated external writers, or provide consensus between independent hosts.

## Run the shared-page example

```bash
npm run demo:shared-page -- --once
npm run demo:shared-page
```

`--once` runs two authenticated agents: the second receives `SHARED_RESOURCE_BUSY` while the first holds the lease, then both update the page in sequence. The server mode prints a localhost origin, two temporary bearer credentials, and the state directory. Open the origin to see the current heading. Keep the printed credentials local.

The example is in [`examples/shared-page.mjs`](../examples/shared-page.mjs). It is an owner-managed local page with an actual file-backed write path. Integrating a browser service or device requires replacing that adapter with the owner's real API.

## Configure the owner gateway

```js
import { createSharedResourceCoordinator }
  from './src/outsider-shared-resource-coordinator.js';

const coordinator = createSharedResourceCoordinator({
  directory: '/absolute/private/coordination-directory',
  resourceId: 'shared-page',
  authorize: async ({ resourceId, actorId, operation, action }) => {
    return ownerPolicyAllows({ resourceId, actorId, operation, action });
  },
  adapter: ownerAdapter,
});
```

Here `ownerPolicyAllows` and `ownerAdapter` are supplied by the integration. The directory must be absolute; `resourceId`, `actorId`, and `operationId` use letters, numbers, `.`, `_`, `:`, or `-`, start with a letter/number, and contain at most 128 characters. The optional `clock` returns epoch milliseconds and defaults to `Date.now`.

Authenticate the caller before invoking these methods. The owner gateway supplies `actorId` from that authenticated identity; a client-supplied JSON field is not authentication. The example resolves a bearer credential to an actor, then uses `{ ...input, actorId }` so the authenticated identity overrides the request body. The authorization callback must return exactly `true` to allow an operation.

## Public methods

All methods are asynchronous. Times are ISO timestamps; `ttlMs` is an integer from 100 to 300,000. A lease defaults to 30,000 ms.

| Method | Input | Result / behavior |
| --- | --- | --- |
| `observe` | `{ actorId }` | `{ resourceId, version, stateHash, state }` from the adapter. Updates the observed version when the canonical state changes. |
| `acquire` | `{ actorId, ttlMs? }` | `{ actorId, leaseId, fencingToken, expiresAt, snapshot }`. An active different holder gets `BUSY`; an unresolved operation blocks acquisition even after expiry. |
| `renew` | `{ actorId, leaseId, fencingToken, ttlMs }` | Extends a current, unexpired lease; returns its fields without a snapshot. It uses the `ACQUIRE` authorization operation. |
| `execute` | `{ actorId, leaseId, fencingToken, operationId, action, expectedVersion, expectedStateHash }` | Returns the durable operation record with status `APPLIED`, `NOT_APPLIED`, or `RECONCILIATION_REQUIRED`. |
| `reconcile` | `{ actorId, operationId }` | Queries the original operation through the adapter and returns its current record. Requires `RECONCILE` authorization, not a live lease. |
| `release` | `{ actorId, leaseId, fencingToken }` | Releases a current lease; refuses while an operation is unresolved. |
| `inspect` | `{ actorId }` | Coordination view: version/hash, lease summary, pending operation ID, and audit head hash. It does not read the provider's current state. |

`observe` and `inspect` use `OBSERVE` authorization. Other methods use `ACQUIRE`, `EXECUTE`, `RECONCILE`, or `RELEASE` as above. `EXECUTE` also supplies the copied action to the authorization callback.

For a local HTTP example, save the following as an `.mjs` file at the repository root:

```js
import { startSharedPage } from './examples/shared-page.mjs';
const runtime = await startSharedPage();
const call = async (method, input = {}) => {
  const response = await fetch(`${runtime.origin}/v1/${method}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${runtime.actors['personal-agent']}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
};
try {
  const lease = await call('acquire', { ttlMs: 30_000 });
  const leaseFields = { leaseId: lease.leaseId, fencingToken: lease.fencingToken };
  const result = await call('execute', {
    ...leaseFields,
    operationId: 'draft-heading-1',
    action: { heading: 'Drafted by the personal agent' },
    expectedVersion: lease.snapshot.version,
    expectedStateHash: lease.snapshot.stateHash,
  });
  console.log(result);
  if (result.status !== 'RECONCILIATION_REQUIRED') {
    await call('release', leaseFields);
  } else {
    console.log(await call('reconcile', { operationId: 'draft-heading-1' }));
  }
} finally {
  await runtime.close();
}
```

## Adapter contract and write boundary

The owner provides these methods:

- `observe({ resourceId })`: return the canonicalizable, non-secret state to compare and expose to callers.
- `execute({ resourceId, operationId, actorId, action, fencingToken, expectedStateHash })`: perform the authorized action and return `{ status: 'APPLIED' }` or `{ status: 'NOT_APPLIED' }`, optionally with public receipt fields.
- `reconcile({ resourceId, operationId, fencingToken })`: determine whether that original operation applied, using durable provider state or an authoritative receipt. Return the same two terminal statuses, or `{ status: 'UNKNOWN' }` while uncertain.

**Check fencing and compare-and-swap at the actual write boundary.** A coordinator check before dispatch cannot prevent a delayed adapter from applying a stale write. Persist the highest accepted fencing generation and reject older generations. Compare `expectedStateHash` against the actual state being changed, using provider-native conditional writes/transactions where available. The coordinator's `version` is its own observed-state counter, not a provider revision; only the hash is passed to the adapter.

Preserve `operationId` across retries and commit its result with the effect, or use the provider's equivalent idempotency mechanism. The shared-page example saves the page change, fencing generation, and operation receipt together in one atomic file replacement. Its `reconcile` can therefore distinguish an applied action from one absent from that file. Other providers may need to keep returning `UNKNOWN`.

A repeated identical `execute` returns its existing record without another effect, including after lease expiry. Reusing its operation ID with a changed actor, action, expected version, or expected hash raises `OPERATION_ID_CONFLICT`. Use a new operation ID for a genuinely new action.

## Unknown effects, restart, and scope

The coordinator persists intent before calling the adapter. An exception, `UNKNOWN`, or other non-terminal result leaves `pendingOperationId` set. If a write succeeds but its resulting state cannot be read, the intent also remains pending. A lease timeout does **not** make either case safe to take over: new acquisition and execution stay blocked until `reconcile` establishes `APPLIED` or `NOT_APPLIED` and observation succeeds.

Restart with the same directory and `resourceId`, reconstruct the owner adapter, inspect the pending operation, and reconcile its original identity. Keep provider operation receipts across the restart too. Do not clear the pending record, create a fresh directory, or resend the write under a new ID to bypass uncertainty.

The implementation resolves the directory with `realpath`, so symlink aliases of the same directory share the resource lock. Separate directories remain separate coordination domains. Keep the state directory private and on the single host; copying it to another machine does not create a distributed lock service.

This coordinator is a reusable execution primitive alongside the existing `OutcomeProgram`, actor/delegation, and obligation layers. It does not automatically create a strict delegation, reserve a primary/recovery/witness network, issue a guarantee, or discharge responsibility. A composition must explicitly bind its owner-authorized adapter and operation receipts into those existing lifecycle contracts. Lease release means access is available again; outcome acceptance and outstanding obligations remain separate decisions.
