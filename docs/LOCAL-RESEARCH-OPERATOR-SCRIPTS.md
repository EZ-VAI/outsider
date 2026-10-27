# Local research operator scripts

The mixed local workspace contains acquisition, source-pinning and diagnostic
programs that are deliberately absent from the public Stage 0.5 runtime. They
are indexed in `scripts/research-operator-scripts.json` so useful evidence work
does not become unreachable folklore and a historical recovery script cannot be
mistaken for a normal product command.

The registry is classification, not admission. `SUPPORTED_LOCAL_*` means the
entry is discoverable and its help path is side-effect free. It does not make an
output canonical, grant data rights, establish target transfer, or admit rows to
a production trainer. `SUPERSEDED_FOR_CURRENT_MODEL_USE` keeps a reproducibility
path while directing current consumers to the newer source-aware lane.
`HISTORICAL_EVALUATION_ONLY_LIVE_RETRY` is narrower still: it is retained only
for the exact frozen evaluation amendment encoded by the program.

Every indexed program must continue to provide `--help` without creating or
modifying an artifact. Current canonical selection is handled separately by the
artifact lifecycle index; the two registries must not be conflated.

`stage15-public-agent-corpus.mjs` treats `--output-dir` as a private acquisition
root. It must resolve beneath the operator's current working-directory trust
root; an external absolute directory or any intermediate/descendant symlink is
rejected. The writer uses private modes, single-descriptor hashing and an
atomic no-clobber publication path. Operators who need another volume must
first change into a deliberately chosen trusted root rather than route the
writer through a symlink.
