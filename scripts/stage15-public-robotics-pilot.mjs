#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  convertBotFailsPilot, convertUr5FailExecution, verifyPublicRoboticsRecord,
  verifyPublicRoboticsRecordSetAgainstSource, verifyPublicRoboticsSourceDirectory,
} from "../src/outsider-public-robotics-adapter.js";

const DEFAULT_SOURCE = "artifacts/curate-public-robotics-20260820/source";
const DEFAULT_DROID = "artifacts/curate-droid100-20260820/real-pilot/report.json";

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    process.stdout.write("Usage: node scripts/stage15-public-robotics-pilot.mjs [--source-root DIR] [--droid-report FILE] --output-dir DIR\n");
    process.exit(0);
  }
  const output = { sourceRoot: DEFAULT_SOURCE, droidReport: DEFAULT_DROID, outputDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!["--source-root", "--droid-report", "--output-dir"].includes(name)
      || !argv[index + 1]) throw new Error(`PUBLIC_ROBOTICS_ARGUMENT_INVALID:${name}`);
    const key = name === "--source-root" ? "sourceRoot"
      : name === "--droid-report" ? "droidReport" : "outputDir";
    output[key] = argv[++index];
  }
  if (!output.outputDir) throw new Error("PUBLIC_ROBOTICS_OUTPUT_DIR_REQUIRED");
  return output;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function contentHash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function atomicWriteDirectory(outputDir, serialized) {
  const target = path.resolve(outputDir);
  if (existsSync(target)) throw new Error("PUBLIC_ROBOTICS_OUTPUT_DIR_EXISTS");
  const parent = path.dirname(target);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const temporary = path.join(parent, `.${path.basename(target)}.tmp-${process.pid}`);
  if (existsSync(temporary)) throw new Error("PUBLIC_ROBOTICS_OUTPUT_TEMP_EXISTS");
  mkdirSync(temporary, { mode: 0o700 });
  try {
    for (const [name, value] of Object.entries(serialized)) {
      writeFileSync(path.join(temporary, name), value, { mode: 0o600, flag: "wx" });
    }
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return target;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(args.sourceRoot);
  const bot = convertBotFailsPilot(path.join(sourceRoot, "botfails"));
  const ur5 = convertUr5FailExecution(path.join(sourceRoot, "ur5fail-execution"));
  const botSourceCheck = verifyPublicRoboticsSourceDirectory(
    bot.manifest, path.join(sourceRoot, "botfails"),
  );
  const ur5SourceCheck = verifyPublicRoboticsSourceDirectory(
    ur5.manifest, path.join(sourceRoot, "ur5fail-execution"),
  );
  const botRecordCheck = verifyPublicRoboticsRecordSetAgainstSource(bot.records, {
    manifest: bot.manifest, sourceDir: path.join(sourceRoot, "botfails"),
  });
  const ur5RecordCheck = verifyPublicRoboticsRecordSetAgainstSource(ur5.records, {
    manifest: ur5.manifest, sourceDir: path.join(sourceRoot, "ur5fail-execution"),
  });
  if (!botSourceCheck.ok || !ur5SourceCheck.ok
    || !botRecordCheck.ok || !ur5RecordCheck.ok
    || botSourceCheck.repositoryProvenanceVerified !== true
    || ur5SourceCheck.repositoryProvenanceVerified !== true
    || botRecordCheck.repositoryProvenanceVerified !== true
    || ur5RecordCheck.repositoryProvenanceVerified !== true
    || [...bot.records, ...ur5.records].some((record) => !verifyPublicRoboticsRecord(record).ok)) {
    throw new Error("PUBLIC_ROBOTICS_PREWRITE_VERIFICATION_FAILED");
  }
  const core = {
    "botfails-manifest.json": serialize(bot.manifest),
    "botfails-records.json": serialize(bot.records),
    "botfails-effect-summary.json": serialize(bot.summary),
    "ur5fail-execution-manifest.json": serialize(ur5.manifest),
    "ur5fail-execution-records.json": serialize(ur5.records),
    "ur5fail-execution-effect-summary.json": serialize(ur5.summary),
  };
  const artifactContentHashes = Object.fromEntries(Object.entries(core)
    .map(([name, value]) => [name, contentHash(value)]));
  const droidPath = path.resolve(args.droidReport);
  const droidBytes = existsSync(droidPath) ? readFileSync(droidPath) : null;
  const combined = {
    schema: "outsider/public-robotics-pilot-artifact-set/v2",
    datasets: {
      botfails: {
        records: bot.records.length, manifestHash: bot.manifest.manifestHash,
        summaryHash: bot.summary.summaryHash, verifiedSourceObjects: botSourceCheck.verifiedObjects,
        verifiedSourceBytes: botSourceCheck.verifiedBytes,
        sourceVerification: botSourceCheck,
        recordVerification: botRecordCheck,
      },
      ur5failExecution: {
        records: ur5.records.length, manifestHash: ur5.manifest.manifestHash,
        summaryHash: ur5.summary.summaryHash, verifiedSourceObjects: ur5SourceCheck.verifiedObjects,
        verifiedSourceBytes: ur5SourceCheck.verifiedBytes,
        sourceVerification: ur5SourceCheck,
        recordVerification: ur5RecordCheck,
      },
    },
    droidPilotReuse: droidBytes ? {
      duplicatedDownload: false,
      existingReportPath: path.relative(process.cwd(), droidPath),
      existingReportContentHash: contentHash(droidBytes),
    } : {
      duplicatedDownload: false, existingReportPath: null, existingReportContentHash: null,
    },
    totals: {
      records: bot.records.length + ur5.records.length,
      causalExperienceUnits: 0, lossEvidenceUnits: 0, detectorOutputs: 0,
    },
    artifactContentHashes,
  };
  const outputDir = atomicWriteDirectory(args.outputDir, {
    ...core, "combined-summary.json": serialize(combined),
  });
  process.stdout.write(`${JSON.stringify({
    ok: true, outputDir, botFailsRecords: bot.records.length,
    ur5FailExecutionRecords: ur5.records.length,
    verifiedSourceBytes: botSourceCheck.verifiedBytes + ur5SourceCheck.verifiedBytes,
    repositoryProvenanceVerified: true,
    causalExperienceUnits: 0, lossEvidenceUnits: 0, detectorOutputs: 0,
  })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
