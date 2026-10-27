# Data and evidence

Outsider includes both an execution kernel and a research foundation for outcome evidence, recovery, responsibility, loss and risk. This source release preserves that broader foundation: its acquisition adapters, parsers, build and verification tools, tests, research documentation, source pins and canonical lineage declarations.

## What is included

The public evidence subset contains **310 files, 27,795,674 bytes (about 27.8 MB)**, selected from the retained local artifact collection. It includes:

- Derived research reports, aggregate measurements, source manifests and acquisition receipts.
- Available canonical `final-v*` artifacts and supersession markers, preserving their historical lineage.
- Engineering source baselines and selected test logs.

These files keep their original contents and relative paths under `evidence/artifacts/` (indexed by `evidence/index.json`). A retained manifest or report records what was measured at the time; it does not by itself reproduce the source data, refresh a quote, establish current provider availability, or confer permission to execute a real transaction. Evidence dates and expiry fields remain historical.

`local-canonical-artifacts.json` and `artifact-index/` preserve the original declarations of selected releases. A declaration can point to a source that is absent from this release; it is not an availability guarantee. See the missing-file list below.

## What remains outside the repository

The retained local collection is roughly 4.69 GB. Raw upstream trajectories, Parquet files, screenshots, videos, compressed data archives, browser profiles, credentials, private account state and live execution bundles are not included in this public subset. Seven retained raw files exceed GitHub's 100 MiB file limit. File size is only one consideration: raw research sources have distinct licenses, attribution duties, upstream dependencies and privacy conditions.

The source includes acquisition/build/verify scripts so contributors can reproduce a named research lane without downloading the entire collection. Use the corresponding lane's documentation to locate the pinned upstream revision or object, download it into the documented local artifact directory, and verify the frozen hashes and byte counts before rebuilding a report. Source acquisition is an explicit operation; ordinary tests should not silently download data or contact live accounts.

For example, the RMA temporal loss benchmark describes its official source files, Data.gov rights declaration, exact object pins, acquisition command and verification command in [RMA temporal loss pricing](RMA-TEMPORAL-LOSS-PRICING-BENCHMARK.md). That lane's current local canonical artifact is among the missing files listed below, so this release does not claim to have replayed it from the retained desktop collection.

## Licenses, attribution and privacy

The repository's code license applies to project code, subject to any retained third-party notices. **It does not relicense external datasets or grant rights over omitted raw source material.** Preserve the original publisher, source URL, revision, license declaration and any attribution notice when acquiring or redistributing third-party bytes.

The existing [public evidence ontology](PUBLIC-EVIDENCE-ONTOLOGY.md) records separate source and rights boundaries. Its catalog includes MIT, Apache-2.0 and CC-BY-4.0 declarations, as well as sources for which dataset-wide rights remain unresolved. The [delegation data scout](DELEGATION-DATA-SCOUT.md) also identifies metadata-only, gated and mixed-license sources. Public availability alone does not settle redistribution or training rights. The RMA benchmark records the frozen Data.gov CC0 1.0 declaration rather than inferring a license from download access.

Some derived reports explicitly say that they do not authorize redistribution, commercial use or training of their underlying source data. Those statements concern the source data and remain intact in the report. They should not be read as a new license grant from Outsider. Raw user conversations, screenshots and private reasoning are not part of the public evidence subset.

Private live-run originals should remain private. If a public example requires a redacted account or resource record, publish a clearly labeled projection with its own identity. Do not edit a hash-bound original in place and continue to claim its original hash.

## What the tests establish

The project contains self-contained unit/integration tests and data-dependent research replay tests. **A passing offline kernel suite does not mean that every research source was downloaded or that every historical result was replayed.** Some existing research tests detect absent data and skip; others require the named artifact/source files directly. Run a research test after restoring its documented input data, and report missing-data skips separately from successful replay.

The initial inventory found 161 test files with explicit `artifacts/` references. That count includes tests for manifests, source verification and historical canonical lineage, not just raw-data analysis. Keep the acquisition and verification tests even when their datasets are optional. Do not substitute invented fixtures for a historical empirical replay result.

## Canonical artifacts not recovered in this release

The following 17 current entries from `local-canonical-artifacts.json` were not found in the retained desktop artifact collection during release preparation. Their declarations and code remain available; the missing outputs are not reconstructed or represented as verified by this release. Paths below are relative to `artifacts/`.

- `ca-dmv-av-outcome-sensing-20260821/final-v3/outcome-sensing.json`
- `cdi-ncigf-real-rate-guaranty-20260821/final-v1/evidence.json`
- `clinicaltrials-posted-results-evidence-20260822/final-v3/evidence.json`
- `fra-phmsa-safety-20260821/final-v2/evidence.json`
- `ncua-pbgc-msha-real-experience-20260821/final-v1/evidence.json`
- `ntsb-bls-real-outcome-20260821/final-v2/outcome-evidence.json`
- `public-agent-wave2-20260821/final-v1/run-receipt.json`
- `public-agent-wave3-20260821/final-v1/run-receipt.json`
- `public-agent-wave4-20260821/final-v2/run-receipt.json`
- `real-case-gap-evidence-catalog-20260821/final-v11/catalog.json`
- `real-evidence-stage-progress-20260821/final-v1/progress.json`
- `rma-temporal-loss-pricing-2010-2020/final-v2/artifact.json`
- `stage0-evidence-chain-current-20260828/final-v1/manifest.json`
- `stage0-source-temporal-audit-20260828/final-v2/manifest.json`
- `stage05-governed-training-intake-20260822/final-v1/diagnostic.json`
- `stage2-current-chain-admission-20260822/final-v1/contract.json`
- `stage2-current-chain-admission-20260828/final-v4/contract.json`

To contribute a recovered artifact, supply its exact original bytes or a reproducible rebuild, source/provenance pins, the applicable rights/attribution record, and the corresponding verification result. A new acquisition or changed source revision should produce a new clearly identified artifact rather than overwrite historical evidence.
