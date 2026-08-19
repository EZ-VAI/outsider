# Public release procedure

Outsider releases are artifact-bound. A Git tag, npm archive, Claude plugin,
release certificate and checksum list must all describe the same frozen source
tree. Do not reuse a version after any packaged file changes; bump the version,
rebuild, and recertify the new artifact.

## Required release assets

- `outsider-guard-<version>.tgz`
- `outsider-guard-<version>-claude.plugin.zip`
- `release-certificate-public-<version>.json`
- `SHA256SUMS`

The public certificate is a privacy projection of the exact internal release
certificate. It may disclose the product/version, artifact and evaluator
hashes, named gate statuses, release decision, claim boundaries and the hash of
the full certificate. It must not disclose local paths, hostname, account
identity, prompts, transcripts, command output, raw events, private keys or
unredacted stdout/stderr. Publishing a hand-edited projection without a
reproducible generator is not sufficient.

`SHA256SUMS` covers every downloadable asset above. The archive checksum must
equal the artifact hash in both the exact certificate and its public
projection. A release is described as **open-source beta** unless the exact
certificate says `stablePublicReleaseReady: true`; passing deterministic tests
alone does not permit the stable claim.

## Freeze and publish

1. Freeze source and bump `package.json` to a version not used by any earlier
   artifact.
2. Run `npm ci`, `npm test`, `npm run test:corpus`, and both Cloudflare dry-run
   commands.
3. Build the npm and Cowork plugin archives, then certify those exact bytes with
   all applicable immutable field-evidence directories.
4. Generate the public certificate and `SHA256SUMS`; independently recompute
   every checksum.
5. Inspect the Git tree and archives for generated run directories, credentials,
   private evidence, local paths and account identifiers.
6. Push the source tag, create the GitHub Release, attach the four assets, and
   state unsupported surfaces and any `NOT_RUN` gates in the release notes.
7. Only after deployment verification, publish the demo URL and the contribution
   gateway endpoint plus pinned server public key in the tagged GitHub Release
   metadata.

The deterministic metadata step is:

```bash
npm run release:metadata -- \
  --certificate dist/release-certificate-<version>.json \
  --artifact dist/outsider-guard-<version>.tgz \
  --plugin dist/outsider-guard-<version>-claude.plugin.zip
```

It refuses a package/version mismatch or an npm archive whose SHA-256 differs
from the exact certificate. Claim-boundary prose is also an explicit allowlist:
adding a new public claim requires a reviewed generator change rather than
silently copying arbitrary certificate strings.
