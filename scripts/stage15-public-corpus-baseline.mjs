#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  evaluatePublicCorpusBaselineFromSource, verifyPublicCorpusBaselineReport,
} from "../src/outsider-public-corpus-baseline.js";

const DEFAULT_INPUT = "artifacts/public-agent-corpus-20260820";

function parseArgs(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    process.stdout.write("Usage: node scripts/stage15-public-corpus-baseline.mjs [--input-dir DIR] --output-dir DIR\n");
    process.exit(0);
  }
  const output = { inputDir: DEFAULT_INPUT, outputDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--input-dir", "--output-dir"].includes(argument) || !argv[index + 1]) {
      throw new Error(`PUBLIC_CORPUS_BASELINE_ARGUMENT_INVALID:${argument}`);
    }
    output[argument === "--input-dir" ? "inputDir" : "outputDir"] = argv[++index];
  }
  if (!output.outputDir) throw new Error("PUBLIC_CORPUS_BASELINE_OUTPUT_DIR_REQUIRED");
  return output;
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function atomicDirectory(outputDir, files) {
  const target = path.resolve(outputDir);
  if (existsSync(target)) throw new Error("PUBLIC_CORPUS_BASELINE_OUTPUT_EXISTS");
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

try {
  const args = parseArgs(process.argv.slice(2));
  const inputDir = path.resolve(args.inputDir);
  const sourceDirectory = path.join(inputDir, "source");
  const report = await evaluatePublicCorpusBaselineFromSource({
    sourceDirectory,
    artifactDirectory: inputDir,
  });
  const verified = await verifyPublicCorpusBaselineReport(report, {
    sourceDirectory,
    artifactDirectory: inputDir,
  });
  if (!verified.ok) throw new Error(`PUBLIC_CORPUS_BASELINE_REPORT_VERIFY_FAILED:${verified.error}`);
  const reportSerialized = serialize(report);
  const inputs = {
    mode: "FULL_SOURCE_REDERIVED",
    sourceRecordCount: report.sourceTrust.sourceRecordCount,
    fullSourceVerificationHash: report.sourceTrust.fullSourceVerificationHash,
    manifestHash: report.sourceTrust.manifestHash,
    recordSetHash: report.sourceTrust.recordSetHash,
    verifiedSourceObjectSetHash: report.sourceTrust.verifiedSourceObjectSetHash,
  };
  const receiptBody = {
    schema: "outsider/public-corpus-baseline-run-receipt/v1",
    inputs,
    reportHash: report.reportHash,
    reportFileContentHash: sha256(reportSerialized),
    result: Object.fromEntries(report.assessments.map((assessment) => [assessment.target, {
      decision: assessment.decision,
      holdoutRecords: assessment.holdout?.records ?? null,
      holdoutGroups: assessment.holdout?.groups ?? null,
      metrics: assessment.holdout?.metrics ?? null,
    }])),
    boundary: report.boundary,
  };
  const receipt = { ...receiptBody,
    receiptHash: sha256(`outsider/public-corpus-baseline-run-receipt/v1\0${
      canonicalizeStrict(receiptBody)}`) };
  const outputDir = atomicDirectory(args.outputDir, {
    "report.json": reportSerialized,
    "run-receipt.json": serialize(receipt),
  });
  process.stdout.write(`${JSON.stringify({ ok: true, outputDir,
    records: report.sourceTrust.sourceRecordCount, reportHash: report.reportHash,
    receiptHash: receipt.receiptHash,
    fullSourceVerificationHash: report.sourceTrust.fullSourceVerificationHash,
    result: receipt.result,
    causalExperienceUnits: 0, lossEvidenceUnits: 0, automaticTraining: false })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
