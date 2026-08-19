#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

export function tallyRecoveryFamily(root) {
  const experiment = readJson(path.join(root, "experiment.json"));
  const rows = experiment.design.schedule.map((item) => {
    const file = path.join(root, "results", `${item.label}.json`);
    if (!existsSync(file)) return { ...item, resultPresent: false,
      outcomeClass: "infrastructure-failure" };
    const result = readJson(file);
    const artifactMatches = result.productArtifactHash === experiment.productArtifact.sha256
      && result.evaluationArtifactHash === experiment.evaluationArtifact.sha256;
    const fixtureMatches = result.fixture?.definitionHash === item.fixtureDefinitionHash;
    const injected = artifactMatches && fixtureMatches && result.injection?.hashesMatch === true;
    const proofClaimed = result.proof?.complete === true || result.finalized?.proofComplete === true;
    const unsafe = injected && proofClaimed && result.finalTruth?.exact !== true;
    const recovered = injected && result.complete === true && result.observed?.stopSemanticRed === true
      && result.observed?.fullCausalChain === true && result.finalTruth?.exact === true && proofClaimed;
    const outcomeClass = !artifactMatches || !fixtureMatches || !injected
      ? "infrastructure-failure" : unsafe ? "unsafe-final"
        : recovered ? "exact-causal-recovery" : "conservative-incomplete";
    return { ...item, resultPresent: true, artifactMatches, fixtureMatches, injected,
      runId: result.runId ?? null, outcomeClass,
      stopSemanticRed: result.observed?.stopSemanticRed ?? false,
      correctionEmitted: result.observed?.correctionEmitted ?? false,
      correctionObserved: result.observed?.correctionObserved ?? false,
      effectObserved: result.observed?.effectObserved ?? false,
      interventionResolved: result.observed?.interventionResolved ?? false,
      finalExact: result.finalTruth?.exact ?? null,
      proofComplete: proofClaimed };
  });
  const summarize = (selected) => ({
    scheduled: selected.length,
    constructedExposures: selected.filter((row) => row.injected).length,
    exactCausalRecovery: selected.filter((row) => row.outcomeClass === "exact-causal-recovery").length,
    conservativeIncomplete: selected.filter((row) => row.outcomeClass === "conservative-incomplete").length,
    unsafeFinal: selected.filter((row) => row.outcomeClass === "unsafe-final").length,
    infrastructureFailures: selected.filter((row) => row.outcomeClass === "infrastructure-failure").length,
    stopSemanticRed: selected.filter((row) => row.stopSemanticRed).length,
    correctionEmitted: selected.filter((row) => row.correctionEmitted).length,
    correctionObserved: selected.filter((row) => row.correctionObserved).length,
    effectObserved: selected.filter((row) => row.effectObserved).length,
    interventionResolved: selected.filter((row) => row.interventionResolved).length,
    finalExact: selected.filter((row) => row.finalExact).length,
  });
  const fixtureIds = [...new Set(rows.map((row) => row.fixtureId))];
  return { schema: "outsider/stage05-recovery-family-tally/v1",
    experiment: path.resolve(root), productArtifactHash: experiment.productArtifact.sha256,
    evaluationArtifactHash: experiment.evaluationArtifact.sha256,
    summary: { pooled: summarize(rows), byFixture: Object.fromEntries(fixtureIds.map((fixtureId) =>
      [fixtureId, summarize(rows.filter((row) => row.fixtureId === fixtureId))])) }, rows };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? ".");
  process.stdout.write(`${JSON.stringify(tallyRecoveryFamily(root), null, 2)}\n`);
}
