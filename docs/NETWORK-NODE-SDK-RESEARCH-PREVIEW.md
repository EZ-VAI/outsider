# Outsider Network Node SDK — local research preview

This package is a local, independently staged release candidate for mapping a
node's existing records into the Outsider quarantine network. It is not part of
the Stage 0.5 public runtime package and is not authorized for npm publication
or public deployment.

The package exposes these ESM entrypoints:

```js
import * as sdk from "@outsider/network-node-sdk/sdk";
import * as client from "@outsider/network-node-sdk/client";
import * as intake from "@outsider/network-node-sdk/intake";
```

The root export is a stable alias for `./sdk`. The reviewed runtime dependency
closure contains exactly:

- `src/canonical.js`
- `src/outsider-network-intake.js`
- `src/outsider-provider-pattern-registry.js`
- `src/outsider-network-node-sdk.js`
- `src/outsider-network-node-client.js`

There are no npm runtime dependencies. The client has no default transport and
persists neither keys nor records. A caller must inject `fetch` explicitly and
manage any private material outside this package.

Conformance establishes typed quarantine compatibility only. It does not
establish actor identity, owner authority, safety effectiveness, independent
outcome truth, causal attribution, training eligibility, CEU, pricing,
guarantee, or settlement. Every package and module boundary remains
`HOLD`/`QUARANTINED`, with `publicDeploymentReady:false`, `authority:"NONE"`,
and all action, training, CEU, and economic permissions false or zero.

## Build and verify locally

Use a new destination directory; staging is no-clobber:

```bash
node scripts/network-node-sdk-package.mjs --out /absolute/new/stage-directory
node scripts/network-node-sdk-package-smoke.mjs \
  --package-root /absolute/new/stage-directory \
  --expected-manifest-hash sha256:MANIFEST_HASH_FROM_THE_BUILD_RESULT
```

The smoke command creates a local tarball, installs it into a clean temporary
consumer with npm offline and lifecycle scripts disabled, and imports the SDK,
client, and intake by package name. It never publishes the package.
