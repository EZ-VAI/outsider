#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildKnownSourceFactorPredictiveShadow,
  verifyFactorPredictiveShadowReport,
  verifyKnownSourceFactorPredictiveShadowReport,
} from "../src/outsider-factor-predictive-shadow.js";
import { PUBLIC_AGENT_WAVE2_CANONICAL_GENERATED_AT }
  from "../src/outsider-public-agent-wave2.js";
import { PUBLIC_AGENT_WAVE3_CANONICAL_GENERATED_AT }
  from "../src/outsider-public-agent-wave3.js";
import { publishPrivateArtifact } from "../src/outsider-private-artifact-publication.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  return [
    "usage: node scripts/stage2-factor-predictive-shadow.mjs [--output PATH]",
    "",
    "Without --output, writes a private content-addressed receipt below",
    "artifacts/factor-predictive-shadow-20260821/receipts/.",
    "An explicit output must be in a subdirectory of the current working directory",
    "and must not already exist.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) return { help: true };
  if (argv.length === 0) return { help: false, output: null };
  if (argv.length === 2 && argv[0] === "--output" && argv[1]) {
    return { help: false, output: path.resolve(argv[1]) };
  }
  if (argv.length === 1 && argv[0].startsWith("--output=")
    && argv[0].slice("--output=".length)) {
    return { help: false, output: path.resolve(argv[0].slice("--output=".length)) };
  }
  throw new Error(usage());
}

function contentAddressedOutput(reportHash) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(reportHash)) {
    throw new Error("FACTOR_PREDICTIVE_REPORT_HASH_INVALID");
  }
  return path.join(root, "artifacts/factor-predictive-shadow-20260821/receipts",
    `report-${reportHash.slice("sha256:".length)}.json`);
}

const droidSourceDirectory = path.join(root, "artifacts/curate-droid100-20260819/source");
function knownSourceOptions() {
  return {
    wave1SourceDirectory: path.join(root, "artifacts/public-agent-corpus-20260820/source"),
    wave1ArtifactDirectory: path.join(root, "artifacts/public-agent-corpus-20260820"),
    wave2SourceDirectory: path.join(root, "artifacts/public-agent-wave2-20260821/source"),
    wave2GeneratedAt: PUBLIC_AGENT_WAVE2_CANONICAL_GENERATED_AT,
    botFailsSourceDirectory:
      path.join(root, "artifacts/curate-public-robotics-20260820/source/botfails"),
    ur5SourceDirectory:
      path.join(root, "artifacts/curate-public-robotics-20260820/source/ur5fail-execution"),
    droidArtifactDirectory:
      path.join(root, "artifacts/curate-droid100-20260902/real-pilot-v7-scoped-canonical-replay"),
    droidSource: {
      objectListBytes: readFileSync(path.join(droidSourceDirectory, "gcs-objects.json")),
      datasetInfoBytes: readFileSync(path.join(droidSourceDirectory, "dataset_info.json")),
      featureBytes: readFileSync(path.join(droidSourceDirectory, "features.json")),
      shardBytes: readFileSync(path.join(droidSourceDirectory,
        "r2d2_faceblur-train.tfrecord-00000-of-00031")),
    },
    wave3SourceDirectory:
      path.join(root, "artifacts/public-agent-wave3-20260821/source/cuarewardbench"),
    wave3GeneratedAt: PUBLIC_AGENT_WAVE3_CANONICAL_GENERATED_AT,
  };
}
export async function main(argv = process.argv.slice(2), io = process) {
  const options = parseArgs(argv);
  if (options.help) { io.stdout.write(`${usage()}\n`); return 0; }

  const sourceOptions = knownSourceOptions();
  const report = await buildKnownSourceFactorPredictiveShadow(sourceOptions);
  const verification = verifyFactorPredictiveShadowReport(report);
  if (!verification.ok) throw new Error(`factor predictive report invalid: ${verification.error}`);
  const sourceVerification = await verifyKnownSourceFactorPredictiveShadowReport(
    report, sourceOptions);
  if (!sourceVerification.ok || !sourceVerification.metricDerivationVerified) {
    throw new Error(`factor predictive source replay invalid: ${sourceVerification.error}`);
  }
  const output = options.output ?? contentAddressedOutput(report.reportHash);
  const publication = publishPrivateArtifact(output, `${JSON.stringify(report, null, 2)}\n`, {
    trustedRoot: options.output ? process.cwd() : root,
    allowExistingIdentical: !options.output,
  });
  io.stdout.write(`${JSON.stringify({ output, publication: publication.created
    ? "CREATED" : "REUSED_IDENTICAL", reportHash: report.reportHash,
  rowsObserved: report.rowsObserved, nativeProxyRows: report.nativeProxyRows,
  cohorts: report.cohorts.length, evaluatedCohorts: report.evaluatedCohorts,
  abstainedCohorts: report.abstainedCohorts,
  evaluated: report.cohorts.filter((cohort) => cohort.status !== "ABSTAIN")
    .map((cohort) => ({ datasetId: cohort.datasetId, target: cohort.target,
      rows: cohort.rows, components: cohort.disclosedRootComponents,
      factors: cohort.selectedFactorIds, auc: cohort.outOfFold.auc,
      baselineAuc: cohort.jeffreysSmoothedTrainingFoldPrevalenceOutOfFold.auc,
      brier: cohort.outOfFold.sampleBrier,
      baselineBrier:
        cohort.jeffreysSmoothedTrainingFoldPrevalenceOutOfFold.sampleBrier })),
  sourceVerificationLevel: sourceVerification.verificationLevel,
  metricDerivationVerified: sourceVerification.metricDerivationVerified,
  priceAuthority: report.authority.PRICE, productionReady: report.readiness.ready }, null, 2)}\n`);
  return 0;
}

if (process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
