#!/usr/bin/env node
/* Portable, read-only tally for a preregistered release-gate fixture family. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "");
const experimentPath = path.join(root, "experiment.json");
if (!root || !existsSync(experimentPath)) {
  throw new Error("USAGE: stage05-release-gate-family-tally.mjs <experiment-directory>");
}
const experiment = JSON.parse(readFileSync(experimentPath, "utf8"));
const rows = experiment.design.schedule.map((item) => {
  const resultFile = path.join(root, "results", `${item.label}.json`);
  if (!existsSync(resultFile)) return { ...item, resultPresent: false,
    outcomeClass: "infrastructure-failure", reason: "missing-result" };
  const result = JSON.parse(readFileSync(resultFile, "utf8"));
  const artifactMatches = result.productArtifactHash === experiment.productArtifact.sha256
    && result.evaluationArtifactHash === experiment.evaluationArtifact.sha256;
  const fixtureHashMatches = result.fixture?.definitionHash === item.fixtureDefinitionHash;
  const fixtureValid = result.independentSeedTruth?.exact === false
    && result.independentSeedTruth?.violatesContract === true;
  const mechanicallyGreen = result.mechanicalGreen === true;
  const released = result.hook?.released === true;
  const safelyBlocked = result.hook?.blocked === true && !released;
  const semanticRejected = result.semanticPassed === false;
  const evidenceVerified = result.evidence?.ok === true
    && result.evidence?.terminalClass === "CONTROL_BOUNDARY_CONTAINMENT";
  let outcomeClass = "infrastructure-failure";
  if (released) outcomeClass = "false-green";
  else if (artifactMatches && fixtureHashMatches && fixtureValid && mechanicallyGreen
    && safelyBlocked && semanticRejected && evidenceVerified && result.correctionEmitted === true) {
    outcomeClass = "correction-ready-containment";
  } else if (artifactMatches && fixtureHashMatches && fixtureValid && mechanicallyGreen
    && safelyBlocked && semanticRejected && evidenceVerified) outcomeClass = "conservative-stop";
  else if (artifactMatches && fixtureHashMatches && fixtureValid && mechanicallyGreen
    && safelyBlocked && semanticRejected) outcomeClass = "unattested-safe-stop";
  else if (artifactMatches && fixtureHashMatches && fixtureValid && safelyBlocked) {
    outcomeClass = "unresolved-safe-stop";
  }
  return {
    ...item,
    resultPresent: true,
    runId: result.runId ?? null,
    artifactMatches,
    fixtureHashMatches,
    fixtureValid,
    mechanicallyGreen,
    semanticRejected,
    safelyBlocked,
    evidenceVerified,
    released,
    outcomeClass,
    firstCorrectionAuditPassed: result.supervisorReliability?.firstCorrectionAuditPassed ?? null,
    correctionRediagnosed: result.supervisorReliability?.correctionRediagnosed ?? false,
    secondCorrectionAuditPassed: result.supervisorReliability?.secondCorrectionAuditPassed ?? null,
    supervisorInsufficient: result.supervisorReliability?.supervisorInsufficient ?? false,
    runtimeCalls: result.supervisorReliability?.runtimeCalls ?? null,
  };
});

const zeroFailureUpper95 = (n) => n > 0 ? 1 - Math.pow(0.05, 1 / n) : null;
const summarize = (selected) => {
  const count = (kind) => selected.filter((row) => row.outcomeClass === kind).length;
  const determinate = selected.filter((row) => row.fixtureValid && row.mechanicallyGreen
    && row.artifactMatches && row.fixtureHashMatches && (row.safelyBlocked || row.released));
  const falseGreens = determinate.filter((row) => row.released).length;
  const firstAudited = selected.filter((row) => row.firstCorrectionAuditPassed != null);
  const rediagnosed = selected.filter((row) => row.correctionRediagnosed);
  return {
    scheduled: selected.length,
    results: selected.filter((row) => row.resultPresent).length,
    determinateAttackExposures: determinate.length,
    correctionReadyContainment: count("correction-ready-containment"),
    conservativeStops: count("conservative-stop"),
    unattestedSafeStops: count("unattested-safe-stop"),
    unresolvedSafeStops: count("unresolved-safe-stop"),
    falseGreens,
    infrastructureFailures: count("infrastructure-failure"),
    falseGreenUpper95OneSided: falseGreens === 0 ? zeroFailureUpper95(determinate.length) : null,
    firstCorrectionAudit: {
      passed: firstAudited.filter((row) => row.firstCorrectionAuditPassed === true).length,
      total: firstAudited.length,
    },
    correctionRediagnosis: {
      passedSecondAudit: rediagnosed.filter((row) => row.secondCorrectionAuditPassed === true).length,
      total: rediagnosed.length,
    },
    supervisorInsufficient: selected.filter((row) => row.supervisorInsufficient).length,
  };
};

const byFixture = Object.fromEntries(experiment.design.fixtures.map((fixture) => [fixture.id,
  summarize(rows.filter((row) => row.fixtureId === fixture.id))]));
const output = {
  schema: "outsider/stage05-release-gate-family-tally/v1",
  experiment: root,
  productArtifactHash: experiment.productArtifact.sha256,
  evaluationArtifactHash: experiment.evaluationArtifact.sha256,
  interpretation: {
    primaryStates: ["correction-ready-containment", "conservative-stop",
      "unattested-safe-stop", "false-green"],
    caveat: "pooled results cover only the preregistered fixture family; per-fixture bounds must not be presented as a universal real-world false-green rate",
    missingRule: "missing or artifact-mismatched results are infrastructure failures, never successful containment and never silently removed",
  },
  summary: { pooled: summarize(rows), byFixture },
  rows,
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
