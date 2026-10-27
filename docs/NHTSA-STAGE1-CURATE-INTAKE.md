# NHTSA SGO Stage 1 / CURATE intake

Status: implemented and source-replayable, but not added to the existing local
combined registry. The integration is a seventh, independent D2 source group
when an operator explicitly ingests it into a new or chosen registry.

## What the source is

The frozen source is empirical real-environment evidence: reporting entities
submitted reports about physical incidents, and NHTSA published the official
CSV. Calling the permitted use “descriptive only” does not make those reports
synthetic or unreal. It limits what Outsider may infer or do with them.

The four dimensions remain separate:

| Dimension | NHTSA classification |
| --- | --- |
| Environment | `ORGANIC + REAL_PHYSICAL` |
| Evidence authority | self-reported, publisher-declared, exact source replayed; not independently adjudicated |
| Rights | official public access; no dataset licence or record-level reuse/training right established |
| Permitted use | incident taxonomy and source discovery only |

Accordingly, neither a report nor a projected row is treated as an independent
incident-event truth, a causal-experience unit, an exposure denominator, a
monetary-loss row, or a model-training row.
Machine-readable profiles therefore say that a real physical incident report
was recorded, while keeping direct independent observation of the underlying
execution false.

## Exact frozen scope

- Official ADS incident CSV: 2,374,527 bytes,
  `sha256:7ed5b160593b1eca85a199a0ae31cd694c952b5adfb99ba9692769d1596e114c`.
- Official data-dictionary PDF: 578,494 bytes,
  `sha256:1dd54d93302e8f022e4f703fc902c6ceb9450a6748bf0e4ade9cc1f8cced6da7`.
- Raw report versions: 1,365.
- Latest report identities retained: 1,324.
- Superseded or duplicate versions: 41.
- Reporting-entity correlation roots: 16.

The PDF is pinned as the exact dictionary object. This adapter does not claim
that merely hashing the PDF performs a semantic interpretation of every
dictionary field.

Each retained unit contains only four hashes: the stable report-ID identity,
the latest privacy-projected incident-taxonomy record, the frozen dataset
revision, and the dataset/reporting-entity/reporting-regime correlation roots.
The record commitment covers report type and period, automation engagement,
incident-date presence/unknown status, alleged injury-severity category,
airbag/tow/crash-with categories, source-row hash, and the explicit privacy
projection. It stores no VIN, narrative, coordinates, street address, exact
incident time, prompt, trajectory, image, loss amount, or source row.

Reports sharing a reporting entity or reporting regime remain correlated. The
registry does not convert 1,324 report identities into 1,324 independent
actuarial observations.

## Source replay versus ordinary verification

Ordinary `verify` authenticates the configured operator signature, append-only
event chain, exact D1/D2 derivation, and fixed zero-authority boundary. It still
returns:

```text
sourceArtifactsReverified = false
fullSourceArtifactSetsReverified = 0
```

The dedicated NHTSA verifier reopens both exact objects, reruns
`verifyNhtsaSgoIncidentQuarantine`, rebuilds all 1,324 units, binds the public
evidence ontology reference, and compares the complete unsigned artifact body
and artifact hash with the signed registry claim. A source relabel, false
licence, added/removed/duplicated row, changed taxonomy projection, or changed
instrument fails that comparison.

The source reads hold `O_NOFOLLOW` descriptors open through derivation and
compare device, inode, size, mtime and ctime before returning. Same-size byte
tampering, incomplete dictionary objects, symlink substitution, and in-build
TOCTOU mutation fail closed.

## Commands

These commands mutate only the registry named by `--dir`. Use a new directory
if the existing six-set combined snapshot must remain frozen.

```sh
node scripts/stage1-curate-corpus-registry.mjs ingest-nhtsa-sgo-incidents \
  --dir /path/to/new-stage1-curate-registry \
  --signing-key /secure/path/operator-private.pem \
  --csv artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv \
  --data-dictionary artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf \
  --at 2026-08-21T10:00:07.000Z

# Structural/operator-claim verification only.
node scripts/stage1-curate-corpus-registry.mjs verify \
  --dir /path/to/new-stage1-curate-registry \
  --now 2026-08-21T10:00:08.000Z

# Exact NHTSA source replay.
node scripts/stage1-curate-corpus-registry.mjs verify-nhtsa-sgo-incident-source \
  --dir /path/to/new-stage1-curate-registry \
  --csv artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv \
  --data-dictionary artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf \
  --now 2026-08-21T10:00:08.000Z
```

For a registry that already contains the four baseline full-source groups and
optionally Wave 4, the aggregate `verify-sources` command also detects the NHTSA
source kind and then requires both `--nhtsa-csv` and
`--nhtsa-data-dictionary`. Those paths are optional only when no NHTSA claim is
present.

## Boundary

The generated artifact set is always:

- `CURATE / BACKWARD_EXPERIENCE_EVIDENCE`;
- `RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY` with an empty `licenseIds` list;
- `registryGrantsRights: false`;
- zero CEU, loss evidence, economic-loss rows, exposure rows, and model rows;
- `automaticTraining: false`, `productionModelUpdate: false`, and
  `pricingEligible: false`; and
- no PRICE, COVERAGE, GUARANTEE, SETTLE, or fund-moving authority.

The public-evidence ontology permits only `DESCRIPTIVE`; it does not permit
shadow modelling for this source under the current rights and denominator
boundary.

Implementation and focused tests:

- `src/outsider-nhtsa-corpus-registry-intake.js`
- `test/outsider-nhtsa-corpus-registry-intake.test.js`
