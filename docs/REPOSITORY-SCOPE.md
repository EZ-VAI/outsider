# Repository scope

This repository contains the mutual agent layer and its underlying coordination infrastructure. See [source provenance](SOURCE-PROVENANCE.json) for the archive fingerprint and import scope.

- `src/`: reusable execution, coordination, evidence, identity, responsibility and research modules.
- `test/`: local mechanism tests and source-backed research replays.
- `examples/`: small executable integrations, including the two-agent shared page.
- `scripts/` and `tools/`: configurable build, acquisition, verification and explicit live-operation entry points.
- `docs/`: architecture, source/domain notes and research methodology.
- `evidence/`: an indexed, reviewed subset of historical public reports and source manifests.

`npm test` runs the original public suite and the listed deterministic foundation tests. `npm run test:research` runs the remaining research suite; many of those tests require separately acquired, pinned raw sources. The repository does not claim complete source replay from the included evidence subset.

Application-specific customer, commercial order, payment and private account workflows are excluded. Machine-specific historical launchers are also excluded. The original local archive is preserved.

The root remains a source repository. Existing Stage 0.5 release staging and the network SDK staging scripts keep their narrower package boundaries. GitHub source publication does not publish an npm package, deploy a service or enable a financial permission.
