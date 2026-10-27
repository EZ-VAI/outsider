#!/usr/bin/env node

import {
  existsSync, mkdirSync, renameSync, rmSync, rmdirSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  buildEpisodeDataEngineRunReceipt,
  evaluateEpisodeDataEngineFromSource,
  verifyEpisodeDataEngineRunReceipt,
} from "../src/outsider-episode-data-engine.js";

const DEFAULT_INPUT = "artifacts/public-agent-corpus-20260820";
const DEFAULT_CUA_INPUT = "artifacts/cua-verifier-bench-20260828";
const DEFAULT_REBOOT_INPUT = "artifacts/outsider-reboot-recovery-pilot-20260828-v1";
const DEFAULT_SENTINEL_INPUT =
  "artifacts/outsider-agent-trajectory-sentinel-quarantine-20260829-v2";
const DEFAULT_STALE_CONSTRAINT_INPUT =
  "artifacts/outsider-stale-constraint-episodes-20260828-v2";

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    process.stdout.write("Usage: node scripts/outsider-episode-data-engine.mjs [--input-dir DIR] [--cua-input-dir DIR] [--reboot-input-dir DIR] [--sentinel-input-dir DIR] [--stale-constraint-input-dir DIR] --output-dir DIR\n");
    process.exit(0);
  }
  const output = { inputDir: DEFAULT_INPUT, cuaInputDir: DEFAULT_CUA_INPUT,
    rebootInputDir: DEFAULT_REBOOT_INPUT, sentinelInputDir: DEFAULT_SENTINEL_INPUT,
    staleConstraintInputDir: DEFAULT_STALE_CONSTRAINT_INPUT, outputDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--input-dir", "--cua-input-dir", "--reboot-input-dir",
      "--sentinel-input-dir", "--stale-constraint-input-dir", "--output-dir"]
      .includes(argument) || !argv[index + 1]) {
      throw new Error(`EPISODE_DATA_ENGINE_ARGUMENT_INVALID:${argument}`);
    }
    const key = { "--input-dir": "inputDir", "--cua-input-dir": "cuaInputDir",
      "--reboot-input-dir": "rebootInputDir",
      "--sentinel-input-dir": "sentinelInputDir",
      "--stale-constraint-input-dir": "staleConstraintInputDir",
      "--output-dir": "outputDir" }[argument];
    output[key] = argv[++index];
  }
  if (!output.outputDir) throw new Error("EPISODE_DATA_ENGINE_OUTPUT_DIR_REQUIRED");
  return output;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function atomicDirectory(outputDir, files) {
  const target = path.resolve(outputDir);
  if (existsSync(target)) throw new Error("EPISODE_DATA_ENGINE_OUTPUT_EXISTS");
  const parent = path.dirname(target);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const temporary = path.join(parent, `.${path.basename(target)}.tmp-${process.pid}`);
  if (existsSync(temporary)) throw new Error("EPISODE_DATA_ENGINE_TEMPORARY_OUTPUT_EXISTS");
  mkdirSync(temporary, { mode: 0o700 });
  try {
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(path.join(temporary, name), contents, { flag: "wx", mode: 0o600 });
    }
    /* Claim the final name atomically. A sibling rename could replace an
     * attacker-created empty directory on some platforms; mkdir cannot. */
    try {
      mkdirSync(target, { mode: 0o700 });
    } catch {
      throw new Error("EPISODE_DATA_ENGINE_OUTPUT_EXISTS_OR_CLAIM_FAILED");
    }
    const names = Object.keys(files).filter((name) => name !== "run-receipt.json");
    if (Object.hasOwn(files, "run-receipt.json")) names.push("run-receipt.json");
    for (const name of names) {
      renameSync(path.join(temporary, name), path.join(target, name));
    }
    rmdirSync(temporary);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return target;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const requestedOutputDirectory = path.resolve(args.outputDir);
  if (existsSync(requestedOutputDirectory)) {
    throw new Error("EPISODE_DATA_ENGINE_OUTPUT_EXISTS");
  }
  const inputDir = path.resolve(args.inputDir);
  const sourceDirectory = path.join(inputDir, "source");
  const cuaArtifactDirectory = path.resolve(args.cuaInputDir);
  const rebootArtifactDirectory = path.resolve(args.rebootInputDir);
  const rebootSourceDirectory = path.join(rebootArtifactDirectory, "source");
  const sentinelArtifactDirectory = path.resolve(args.sentinelInputDir);
  const staleConstraintArtifactDirectory = path.resolve(args.staleConstraintInputDir);
  const report = await evaluateEpisodeDataEngineFromSource({
    sourceDirectory,
    artifactDirectory: inputDir,
    cuaArtifactDirectory,
    rebootArtifactDirectory,
    rebootSourceDirectory,
    sentinelArtifactDirectory,
    staleConstraintArtifactDirectory,
  });
  const receipt = buildEpisodeDataEngineRunReceipt(report);
  const verified = await verifyEpisodeDataEngineRunReceipt(receipt, report, {
    sourceDirectory,
    artifactDirectory: inputDir,
    cuaArtifactDirectory,
    rebootArtifactDirectory,
    rebootSourceDirectory,
    sentinelArtifactDirectory,
    staleConstraintArtifactDirectory,
  });
  if (!verified.ok) {
    throw new Error(`EPISODE_DATA_ENGINE_RUN_RECEIPT_VERIFY_FAILED:${verified.error}`);
  }
  const reportSerialized = serialize(report);
  const result = receipt.result;
  const outputDir = atomicDirectory(requestedOutputDirectory, {
    "report.json": reportSerialized,
    "run-receipt.json": serialize(receipt),
  });
  process.stdout.write(`${JSON.stringify({ ok: true, outputDir,
    reportHash: report.reportHash, receiptHash: receipt.receiptHash,
    sourceRecords: report.runSummary.sourceRecordsReplayed,
    sourceDenominatorRegistry: report.runSummary.sourceDenominatorRegistry,
    crossDomainSourceUnitTotal: null,
    crossDomainSourceUnitAdditionProhibited: true,
    constructedEpisodeByteCommitments:
      report.runSummary.constructedEpisodeByteCommitmentsReplayed,
    pairedRecoveryEvaluationPairs:
      report.runSummary.pairedRecoveryEvaluationPairsReplayed,
    offlineModelFitsPerformedInEngine:
      report.runSummary.offlineModelFitsPerformedInEngine,
    offlineModelFitsReplayedFromVerifiedSupplements:
      report.runSummary.offlineModelFitsReplayedFromVerifiedSupplements,
    authorizedTrainingPerformed: false,
    authorizedTrainingRows: 0,
    authorizedTrainingJobs: 0,
    optimizedCandidatesSelected: report.runSummary.optimizedCandidatesSelected,
    feederCandidatesDispatched: 0,
    completeEpisodeIntersectionCount: 0,
    result,
    boundary: report.boundary })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
