#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  bridgePublicAgentSource,
  bridgePublicAgentWave2Source,
  bridgePublicRoboticsSource,
  evaluateCrossDatasetUnits,
  verifyCrossDatasetEvaluationReport,
} from "../src/outsider-cross-dataset-eval.js";

const DEFAULT_AGENT_ARTIFACT = "artifacts/public-agent-corpus-20260820";
const DEFAULT_AGENT_WAVE2_SOURCE = "artifacts/public-agent-wave2-20260821/source";
const DEFAULT_ROBOT_SOURCE = "artifacts/curate-public-robotics-20260820/source";
const DEFAULT_OUTPUT =
  "artifacts/cross-dataset-public-eval-20260820/trusted-v3-wave2-final";

function fail(code) { throw new Error(code); }

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    process.stdout.write("Usage: node scripts/stage15-cross-dataset-eval.mjs [--agent-artifact-dir DIR] [--agent-wave2-source-dir DIR] [--robot-source-dir DIR] [--output-dir DIR]\n");
    process.exit(0);
  }
  const output = { agentArtifactDirectory: DEFAULT_AGENT_ARTIFACT,
    agentWave2SourceDirectory: DEFAULT_AGENT_WAVE2_SOURCE,
    robotSourceDirectory: DEFAULT_ROBOT_SOURCE, outputDirectory: DEFAULT_OUTPUT };
  const fields = new Map([
    ["--agent-artifact-dir", "agentArtifactDirectory"],
    ["--agent-wave2-source-dir", "agentWave2SourceDirectory"],
    ["--robot-source-dir", "robotSourceDirectory"],
    ["--output-dir", "outputDirectory"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const field = fields.get(argv[index]);
    if (!field || !argv[index + 1]) fail(`CROSS_DATASET_CLI_ARGUMENT_INVALID:${argv[index]}`);
    output[field] = argv[++index];
  }
  return output;
}

function digest(value, domain) {
  return `sha256:${createHash("sha256").update(`${domain}\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }

function atomicDirectory(outputDirectory, files) {
  const target = path.resolve(outputDirectory);
  if (existsSync(target)) fail("CROSS_DATASET_CLI_OUTPUT_EXISTS");
  const parent = path.dirname(target);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const temporary = path.join(parent, `.${path.basename(target)}.tmp-${process.pid}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(path.join(temporary, name), contents, { flag: "wx", mode: 0o600 });
    }
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return target;
}

function sourceBindings(units) {
  return [...new Map(units.map((unit) => {
    const binding = unit.sourceBinding;
    const key = `${unit.dataset.id}\0${binding.sourceManifestHash}`;
    return [key, { datasetId: unit.dataset.id, revision: unit.dataset.revision,
      sourceManifestHash: binding.sourceManifestHash, adapterId: binding.adapterId,
      adapterVersion: binding.adapterVersion,
      adapterImplementationHash: binding.adapterImplementationHash,
      trustClass: binding.trustClass }];
  })).values()].sort((left, right) => left.datasetId.localeCompare(right.datasetId));
}

try {
  const args = parseArgs(process.argv.slice(2));
  const agentArtifactDirectory = path.resolve(args.agentArtifactDirectory);
  const agentSourceDirectory = path.join(agentArtifactDirectory, "source");
  const agentWave2SourceDirectory = path.resolve(args.agentWave2SourceDirectory);
  const robotSourceDirectory = path.resolve(args.robotSourceDirectory);

  const agentUnits = await bridgePublicAgentSource({ sourceDirectory: agentSourceDirectory,
    artifactDirectory: agentArtifactDirectory });
  const agentWave2Units = bridgePublicAgentWave2Source({
    sourceDirectory: agentWave2SourceDirectory,
  });
  const botFailsUnits = bridgePublicRoboticsSource({ dataset: "BOTFAILS",
    sourceDirectory: path.join(robotSourceDirectory, "botfails") });
  const ur5Units = bridgePublicRoboticsSource({ dataset: "UR5FAIL_EXECUTION",
    sourceDirectory: path.join(robotSourceDirectory, "ur5fail-execution") });
  const candidates = [...agentUnits, ...agentWave2Units, ...botFailsUnits, ...ur5Units];
  if (candidates.some((unit) => unit.sourceBinding.trustClass !== "FULL_SOURCE_REPLAY_BOUND"
    || unit.detectorOutputs.length !== 0)) fail("CROSS_DATASET_CLI_UNTRUSTED_CANDIDATE");

  const report = evaluateCrossDatasetUnits(candidates);
  const verified = verifyCrossDatasetEvaluationReport(report, { candidates });
  if (agentUnits.length !== 9_381 || agentWave2Units.length !== 1_474
    || botFailsUnits.length !== 20 || ur5Units.length !== 140
    || candidates.length !== 11_015
    || report.sampleAccounting.uniqueEvaluationUnits !== 11_015
    || report.sampleAccounting.trustedSourceRowsObserved !== 378_826
    || report.sampleAccounting.correlationComponents !== 211
    || !verified.ok
    || report.boundary.observedEffectKinds.length !== 1
    || report.boundary.observedEffectKinds[0] !== "COVERAGE"
    || report.detectorAssessments.some((assessment) =>
      !assessment.decision.startsWith("ABSTAIN_"))
    || report.authority.establishesCausality !== false
    || report.authority.establishesLossOrLiability !== false
    || report.authority.admissibleForPricing !== false) {
    fail("CROSS_DATASET_CLI_REPORT_BOUNDARY_INVALID");
  }

  const reportBytes = serialize(report);
  const receiptBody = {
    schema: "outsider/cross-dataset-public-eval-receipt/v2",
    schemaVersion: "2.0.0",
    reportHash: report.reportHash,
    reportFileContentHash: `sha256:${createHash("sha256").update(reportBytes).digest("hex")}`,
    verifierInvocation: {
      ok: true,
      method: "SAME_PROCESS_FULL_SOURCE_BRIDGES_AND_REPORT_REPRODUCTION",
      persistedReportRequiresSourceReplay: true,
    },
    evaluator: report.evaluator,
    candidates: {
      evaluationUnits: candidates.length,
      agentUnits: agentUnits.length,
      agentWave2Units: agentWave2Units.length,
      botFailsUnits: botFailsUnits.length,
      ur5FailUnits: ur5Units.length,
      unitSetHash: digest(candidates.map((unit) => unit.unitHash).sort(),
        "outsider/cross-dataset-public-eval/unit-set/v1"),
      sourceBindings: sourceBindings(candidates),
    },
    sampleAccounting: {
      sourceRows: report.sampleAccounting.trustedSourceRowsObserved,
      uniqueNormalizedUnits: report.sampleAccounting.uniqueEvaluationUnits,
      structuralCorrelationComponents: report.sampleAccounting.correlationComponents,
      sourceRowsUsedAsIndependentSamples: false,
      independenceClaimed: false,
    },
    effect: {
      kinds: report.boundary.observedEffectKinds,
      uniqueEvaluationUnits: report.sampleAccounting.uniqueEvaluationUnits,
      trustedSourceRowsObserved: report.sampleAccounting.trustedSourceRowsObserved,
      sourceRowsUsedAsIndependentSamples:
        report.sampleAccounting.sourceRowsUsedAsIndependentSamples,
      correlationComponents: report.sampleAccounting.correlationComponents,
      truthReadiness: report.truthReadiness.map((item) => ({
        target: item.target,
        decision: item.decision,
        qualifyingEvaluationUnits: item.qualifyingEvaluationUnits,
        qualifyingClassCounts: item.qualifyingClassCounts,
        qualifyingCorrelationComponents: item.qualifyingCorrelationComponents,
      })),
      detectorAssessments: report.detectorAssessments.map((assessment) => ({
        target: assessment.target, decision: assessment.decision,
      })),
    },
    boundary: { causalExperienceUnits: 0, lossEvidenceUnits: 0,
      discriminationClaimed: false, calibrationClaimed: false,
      financialEffect: "none", automaticTraining: false },
  };
  const receipt = { ...receiptBody, receiptHash: digest(receiptBody,
    "outsider/cross-dataset-public-eval-receipt/v2") };
  const outputDirectory = atomicDirectory(args.outputDirectory, {
    "report.json": reportBytes,
    "run-receipt.json": serialize(receipt),
  });
  process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory,
    reportHash: report.reportHash, receiptHash: receipt.receiptHash,
    evaluationUnits: candidates.length,
    trustedSourceRowsObserved: report.sampleAccounting.trustedSourceRowsObserved,
    correlationComponents: report.sampleAccounting.correlationComponents,
    effects: report.boundary.observedEffectKinds,
    detectorDecisions: receipt.effect.detectorAssessments,
    causalExperienceUnits: 0, lossEvidenceUnits: 0, financialEffect: "none" })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
