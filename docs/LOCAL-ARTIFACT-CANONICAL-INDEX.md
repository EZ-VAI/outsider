# Local artifact canonical index

The local research workspace contains raw sources, intermediate reports and
multiple no-clobber `final-vN` releases. Directory naming alone is not selection
authority. `local-canonical-artifacts.json` is the reviewed schema-v2
declaration of the current release and canonical JSON file for each versioned
artifact family, plus any exact cross-family lineage edge.

`scripts/local-artifact-canonical-index.mjs` independently walks the actual
local bytes, rejects symlinks and changing files, requires every older release
to reach the declared release through a schema-bound authoritative
supersession field, and commits the marker and release bytes. It also hashes
every source/intermediate directory inside a declared family, every unversioned
directory and every regular file at the artifact root as noncanonical
quarantine. Thus every regular byte under `artifacts/` is either in a declared
release or a byte-bound quarantine; quarantine never becomes selection
authority. The generated index does not replay source adapters or establish
source truth; the lane-specific source-aware verifier remains required for
that stronger claim.

```bash
node scripts/local-artifact-canonical-index.mjs build \
  --declaration local-canonical-artifacts.json \
  --out artifact-index/local-canonical-index-20260822/final-v9/index.json

node scripts/local-artifact-canonical-index.mjs verify \
  --declaration local-canonical-artifacts.json \
  --artifact artifact-index/local-canonical-index-20260822/final-v9/index.json
```

Current local release: `final-v9` (index schema v4), indexed at
`2026-08-28T11:38:44.962Z`. It commits 33 reviewed versioned families. The
2026-08-28 chain selects catalog `final-v18`, flywheel `final-v16`, math
diagnostics `final-v14`, architecture `final-v11`, Stage2 current-chain
contract `final-v4`, RMA historical loss-cost `final-v4`, and temporal audit
`final-v2`. The corrected NTSB/BLS evidence is selected through the standard
same-family `final-v2`, whose bytes exactly equal the source-replayed hardening
candidate. Its index hash is
`sha256:27e3c1337ad20b1e4325f57a0f678c02d570e0d9b96ac8ea07f8f6b414eff870`;
its serialized file is 273464 bytes with SHA-256
`sha256:f97dfdb6885166b1046a6613d7b89c80d67b25b977818a324d92a60b660f17e8`.

Declaration v2 contains five exact cross-family lineages. The old
`actuarial-model-evolution-20260822/final-v7` is an archived predecessor, not a
current artifact. Its exact artifact and `SUPERSEDED.json` marker route to
`actuarial-model-evolution-20260828/final-v8`; same-family markers then route
v8→v9→v10→v11. The old catalog final-v11, flywheel final-v10, math final-v10,
and Stage2 current-chain final-v1 families are likewise archived and route
only to the first version-number-continuous successor in their 2026-08-28
families; their same-family markers then reach final-v18, final-v16, final-v14,
and final-v4 respectively. Every source artifact, marker and entry target is pinned by
semantic hash, file hash and byte length; foreign-family paths remain rejected
unless one of those exact declaration edges authorizes it. The bridges grant
no source truth, training admission, pricing admission, or authority.
The Wave5 intake canonical leaf is `final-v3/snapshot.json` with
`snapshotHash=sha256:2d40c4e44a7d9edb37ce15b526c8aa07bdca694db7cece8e9b3437c8307192ad`.
`registry-verification.json` remains byte-committed in the same release as the
registry-state verification sidecar; it is not a second canonical evidence
leaf. This matches the flywheel, math diagnostics, Stage2 source graph and
source-aware verifier inputs.

The `final-v7` supersession marker binds the exact old and new index hashes,
serialized hashes and byte lengths and seals its own non-hash fields under a
domain-separated `markerHash` of
`sha256:6fd7bcb3de0bac0d1aeadde997e271a71bae492702d1df9a2917f766388dc9b5`.
The marker is 1697 bytes, mode 0600, with file SHA-256
`sha256:3f3f5cede97bda1b4b574c13b365f073464639f49bd47a39f4e0d2d41e28ffea`.
The preserved `final-v7/index.json` remains exactly 218967 bytes with SHA-256
`sha256:a62c4c145cdaad86e200136c9f30b0df92d717f88e773995fbeea0889c36d190`.
The marker and index do not replay sources, establish source truth, establish
target-domain training or grant target quoting or pricing permission. After
final-v9 was issued, this v7→v8 receipt verifies v8 as a historical self-hashed
successor, not as the current selection; the separately pinned v8→v9 receipt
is required to reach the current exact rebuild.

The same-family `final-v8` index marker routes exactly to `final-v9`; marker
hash `sha256:290816baf918f7cb9e56aa42dc0cff33de38d5d9a7d2444c2890d274457c5d23`,
file SHA-256 `sha256:3c66281768e96915bd2861d68fa73869271858ddc532543e8b18353e5eb8e207`,
1623 bytes. A stale parallel
`artifact-index/local-canonical-index-20260828/final-v8/index.json` remains
byte-preserved but is explicitly rejected by a cross-family receipt pointing
to the same `final-v9`; marker hash
`sha256:b6a973bfc58df1fbbb5e68c6754ea27873511972f084ed1158aee38dd6ee3270`,
file SHA-256 `sha256:8ccc788c4e33173d0c74bafd2731a0789926df4f0577134ad4297c7f60cfd70f`,
1676 bytes. Neither marker replays sources or grants evidence currentness.

Finder `.DS_Store` metadata is forbidden anywhere below `artifacts/`. The
builder and verifier fail closed when one appears instead of silently ignoring
it or committing nondeterministic desktop metadata. Historical `final-v6`
differed from `final-v5` only by removing those non-evidence files and enforcing
that rule; `final-v7` is the first release to add the three reviewed pricing and
training-intake lanes described above.

The generated index deliberately lives outside the indexed `artifacts/` root;
otherwise it would need to authenticate its own not-yet-written bytes. Both
roots remain local and gitignored. Build is no-clobber. A new canonical lane or corrected artifact therefore
requires a new declaration, a new index release and an explicit supersession
marker; it must never overwrite historical bytes. Publication uses a random,
private, no-follow temporary file and an atomic no-clobber hard link, so an
existing output or output symlink is refused rather than replaced. Every
existing output-parent component is checked as a real directory, ancestor
symlinks are rejected, and schema-supported supersession target paths must stay
inside the same declared family and name the declared canonical file whenever
they name a file, except for a declaration-v2 exact cross-family edge whose
source, marker and target identities all verify and whose graph is acyclic and
version-forward.
