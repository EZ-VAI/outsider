#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  OPENHANDS_EVAL_DATASET_ID,
  OPENHANDS_EVAL_REVISION,
  acquirePinnedOpenHandsEvaluationSource,
  buildOpenHandsEvaluationReceipt,
  buildOpenHandsEvaluationReportFromSource,
  publishOpenHandsEvaluationArtifactDirectory,
  verifyOpenHandsEvaluationArtifactDirectory,
  verifyOpenHandsEvaluationReceipt,
  verifyOpenHandsEvaluationReport,
  verifyOpenHandsEvaluationReportWithSource,
  verifyOpenHandsEvaluationSourceDirectory,
} from "../src/outsider-openhands-evaluation-paired-runs.js";

const DEFAULT_OUTPUT = "artifacts/outsider-openhands-evaluation-paired-runs-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `OPENHANDS_EVAL_CLI_${code}`
    : `OPENHANDS_EVAL_CLI_${code}:${detail}`);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = { output: DEFAULT_OUTPUT, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output" && argv[index + 1]) parsed.output = argv[++index];
    else if (["--help", "-h"].includes(argument)) parsed.help = true;
    else fail("ARGUMENT_INVALID", argument);
  }
  return parsed;
}

function targetInsideWorkspace(value) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || target === path.parse(target).root) {
    fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  }
  return target;
}

function requireSafeParent(directory) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(directory);
  const relative = path.relative(workspace, target);
  let cursor = workspace;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (!existsSync(cursor)) mkdirSync(cursor, { mode: 0o700 });
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("PARENT_UNSAFE", cursor);
  }
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-openhands-evaluation-paired-runs.mjs [--output <new-dir>]",
      "",
      `Pins ${OPENHANDS_EVAL_DATASET_ID}@${OPENHANDS_EVAL_REVISION}.`,
      "Enumerates and brackets the complete official tree, then downloads two",
      "complete SWE-bench Lite run directories (600 rows / 300 shared instances).",
      "Raw prompts, messages, tool outputs, patches, and configuration values remain",
      "mode-0600 private source bytes. Publisher `resolved` labels are not promoted",
      "to independent outcome, real-world outcome, recovery, or attempt-census truth.",
    ].join("\n") + "\n");
    return { ok: true, help: true };
  }

  const target = targetInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  requireSafeParent(path.dirname(target));
  const checkpoint = `${target}.source-checkpoint`;
  let sourceAcquiredThisRun = false;
  if (existsSync(checkpoint)) {
    const checked = verifyOpenHandsEvaluationSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_SELECTED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_INVALID", checked.error);
    }
  } else {
    process.stderr.write("Acquiring pinned official OpenHands paired-run closure...\n");
    await acquirePinnedOpenHandsEvaluationSource(checkpoint);
    sourceAcquiredThisRun = true;
    const checked = verifyOpenHandsEvaluationSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_SELECTED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_REPLAY_FAILED", checked.error);
    }
  }

  process.stderr.write("Building source-rederived privacy-preserving OpenHands report...\n");
  const report = buildOpenHandsEvaluationReportFromSource(checkpoint);
  const standalone = verifyOpenHandsEvaluationReport(report);
  if (!standalone.ok) fail("STANDALONE_REPORT_INVALID", standalone.error);
  const replay = verifyOpenHandsEvaluationReportWithSource(report, checkpoint);
  if (!replay.ok || replay.verificationLevel !== "FULL_SELECTED_SOURCE_REDERIVED") {
    fail("FULL_SOURCE_REPLAY_FAILED", replay.error);
  }
  const reportBytes = canonicalBytes(report);
  const receipt = buildOpenHandsEvaluationReceipt(report, reportBytes);
  const receiptBytes = canonicalBytes(receipt);
  if (!verifyOpenHandsEvaluationReceipt(receipt, report, reportBytes).ok) {
    fail("RECEIPT_INVALID");
  }

  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  writePrivate(path.join(staging, "report.json"), reportBytes);
  renameSync(checkpoint, path.join(staging, "source"));
  // Receipt is deliberately the final file written before atomic publication.
  writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
  publishOpenHandsEvaluationArtifactDirectory(staging, target);

  const artifact = verifyOpenHandsEvaluationArtifactDirectory(target);
  if (!artifact.ok) fail("PUBLISHED_ARTIFACT_INVALID", artifact.error);
  const result = { ok: true, outputDirectory: target, sourceAcquiredThisRun,
    datasetId: OPENHANDS_EVAL_DATASET_ID, pinnedRevision: OPENHANDS_EVAL_REVISION,
    completeTreeEntries: 119, completeTreeFiles: 91, completeTreeBytes: 4_608_334_624,
    selectedFiles: 11, selectedBytes: 114_939_223,
    completeRunDirectories: 2, evaluationRows: 600, sharedInstances: 300,
    publisherResolvedTrueRows: 132, publisherResolvedFalseRows: 276,
    publisherResolvedNullRows: 192, explicitTrueFalseContrasts: 21,
    selectedContrastInstance: "astropy__astropy-14995",
    independentOutcomeUnits: 0, recoveryUnits: 0,
    completeAttemptCensusEstablished: false,
    artifactHash: report.artifactHash, receiptHash: receipt.receiptHash,
    reportFileSha256: artifact.reportFileSha256,
    receiptFileSha256: artifact.receiptFileSha256,
    sourceRoot: report.source.sourceRoot,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: report.source.sourceManifestFileSha256,
    verificationLevel: artifact.verificationLevel,
    authorizedTrainingRows: 0, networkAdmissionRows: 0,
    CEU: 0, pricingUnits: 0, authorityUnits: 0 };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
