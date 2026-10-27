#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildKnownSourceActuarialMechanismShadowReport,
  compactActuarialMechanismShadowReport,
  verifyActuarialMechanismShadowReport,
  verifyCompactActuarialMechanismShadowReport,
}
  from "../src/outsider-actuarial-mechanism-shadow.js";
import { PUBLIC_AGENT_WAVE2_CANONICAL_GENERATED_AT }
  from "../src/outsider-public-agent-wave2.js";
import {
  CUAREWARDBENCH_WAVE3_PIN,
  PUBLIC_AGENT_WAVE3_CANONICAL_GENERATED_AT,
} from "../src/outsider-public-agent-wave3.js";
import { publishPrivateArtifact } from "../src/outsider-private-artifact-publication.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  return [
    "usage: node scripts/stage2-actuarial-mechanism-shadow.mjs [--output PATH]",
    "",
    "Without --output, writes a private content-addressed receipt below",
    "artifacts/actuarial-mechanism-shadow-20260821/receipts/.",
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

function contentAddressedOutput(compactReportHash) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(compactReportHash)) {
    throw new Error("ACTUARIAL_MECHANISM_COMPACT_REPORT_HASH_INVALID");
  }
  return path.join(root, "artifacts/actuarial-mechanism-shadow-20260821/receipts",
    `report-${compactReportHash.slice("sha256:".length)}.json`);
}

const droidSource = path.join(root, "artifacts/curate-droid100-20260819/source");
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
      objectListBytes: readFileSync(path.join(droidSource, "gcs-objects.json")),
      datasetInfoBytes: readFileSync(path.join(droidSource, "dataset_info.json")),
      featureBytes: readFileSync(path.join(droidSource, "features.json")),
      shardBytes: readFileSync(path.join(droidSource,
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
  const report = await buildKnownSourceActuarialMechanismShadowReport(sourceOptions);
  const wave3Coverage = report.deferredSources.find((source) =>
    source.datasetId === CUAREWARDBENCH_WAVE3_PIN.id);
  if (report.measurement.rows !== 11_017
    || report.observations.some((row) => row.datasetId === CUAREWARDBENCH_WAVE3_PIN.id)
    || report.consequenceModels.some((model) =>
      model.datasetId === CUAREWARDBENCH_WAVE3_PIN.id)
    || wave3Coverage?.rows !== 0
    || wave3Coverage?.factorCoverage !== "MISSING_NOT_INGESTED"
    || wave3Coverage?.metadataRows !== CUAREWARDBENCH_WAVE3_PIN.annotationRows
    || wave3Coverage?.metadataTaskRoots !== CUAREWARDBENCH_WAVE3_PIN.uniqueTaskComponents
    || wave3Coverage?.traceBytesAcquired !== 0
    || wave3Coverage?.metadataLabelsUsedAsFactors !== false
    || wave3Coverage?.outcomeRowsAdmitted !== 0
    || wave3Coverage?.recoveryRowsAdmitted !== 0
    || wave3Coverage?.causalExperienceUnits !== 0
    || wave3Coverage?.economicLossRows !== 0
    || wave3Coverage?.pricingEligibleRows !== 0
    || wave3Coverage?.trainingRowsAdmitted !== 0) {
    throw new Error("wave3 metadata-only actuarial admission boundary failed");
  }
  const compact = compactActuarialMechanismShadowReport(report);
  const reportVerification = verifyActuarialMechanismShadowReport(report);
  const compactVerification = verifyCompactActuarialMechanismShadowReport(compact,
    { fullReport: report });
  if (!reportVerification.ok || !compactVerification.ok) {
    throw new Error("actuarial shadow report verification failed");
  }

  const output = options.output ?? contentAddressedOutput(compact.compactReportHash);
  const publication = publishPrivateArtifact(output, `${JSON.stringify(compact, null, 2)}\n`, {
    trustedRoot: options.output ? process.cwd() : root,
    allowExistingIdentical: !options.output,
  });
  io.stdout.write(`${JSON.stringify({ output, publication: publication.created
    ? "CREATED" : "REUSED_IDENTICAL", reportHash: report.reportHash,
  compactReportHash: compact.compactReportHash,
  rows: report.measurement.rows, datasets: report.measurement.datasets,
  disclosedRootComponents: report.measurement.disclosedRootComponents,
  modelDisclosedRootComponents:
    report.consequenceModelAdmission.modelDisclosedRootComponents,
  consequenceModels: report.consequenceModels.length,
  economicLossModeled: report.economicLossModel.observed,
  priceAuthority: report.authority.PRICE,
  productionReady: report.productionReadiness.ready }, null, 2)}\n`);
  return 0;
}

if (process.argv[1]
  && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
