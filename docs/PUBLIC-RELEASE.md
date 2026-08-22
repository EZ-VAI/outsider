# Public release procedure

Outsider releases are artifact-bound. A Git tag, npm archive, Claude plugin,
ChatGPT/Codex repo marketplace plugin, release certificate and checksum list
must all describe the same frozen source tree. Do not reuse a version after any
packaged file changes; bump the version, rebuild, and recertify the new artifact.

The repository is a mixed local research workspace and is deliberately marked
`private: true`; direct `npm pack`/publish is refused. The public Stage 0.5
runtime is first staged from the machine-reviewed `release-public-files.json`
dependency closure. Its manifest hashes every member and the extracted package
must contain exactly that set—no missing files and no unmanifested extras. The
same boundary is applied to the Claude hosted-plugin runtime. Stage 1–4,
Reality Stewardship research, governed responsibility/actuarial models,
outreach, acquisition code, raw sources and canonical research artifacts stay
local and are not silently swept into the runtime archive. Stage 0.5 runtime
policy/heuristic modules and explicitly documented legacy behavior utilities do
remain public because the installed controller depends on them.

The repository marketplace at `.agents/plugins/marketplace.json` and its
`plugins/outsider-stage05/` source are part of the reviewed public closure.
Their plugin version must equal the npm and Claude-plugin version. Release smoke
must reject missing or extra plugin members and must keep these two facts false:
ChatGPT global lifecycle interception established; Codex controlled by
installation alone. Publication in OpenAI's universal public Plugins Directory
is a separate submission/review event and must not be claimed from a repo
marketplace build.
Both independently distributed plugin trees carry the repository's exact
Apache-2.0 `LICENSE`, and their exact-member validators reject its omission or
byte drift.

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

The public certificate reports universal-plugin package validation separately
from ChatGPT live installation, new-chat skill evaluation, Plugins Directory
publication, and Codex lifecycle control. Package validation may pass while all
four host or publication gates remain `NOT_RUN` or `NOT_ESTABLISHED`.
`stablePublicReleaseReady` additionally requires PASS evidence for Codex
lifecycle control and for ChatGPT live install plus new-chat skill evaluation;
Plugins Directory publication remains a separate optional distribution event.

## Freeze and publish

1. Freeze source and bump `package.json` to a version not used by any earlier
   artifact.
2. Run `npm ci`, `npm test`, `npm run test:corpus`, and both Cloudflare dry-run
   commands in the source workspace.
3. Run `npm run release:build`. It stages the reviewed public closure, packs only
   that directory, exact-checks both npm and plugin member manifests, and runs
   package-specific smoke/corpus checks inside the extracted archive. Direct
   root-workspace packing is an intentional error.
4. Certify those exact npm and Cowork plugin bytes with
   all applicable immutable field-evidence directories.
5. Generate the public certificate and `SHA256SUMS`; independently recompute
   every checksum.
6. Inspect the Git tree and archives for generated run directories, credentials,
   private evidence, local paths and account identifiers.
7. Push the source tag, create the GitHub Release, attach the four assets, and
   state unsupported surfaces and any `NOT_RUN` gates in the release notes.
8. Only after deployment verification, publish the demo URL and the contribution
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
