#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, renameSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  VIFAILBACK_DATASET_ID,
  VIFAILBACK_REVISION,
  VIFAILBACK_SUBTREE,
  acquirePinnedVifailbackCutSausageSource,
  buildVifailbackCutSausageReceipt,
  buildVifailbackCutSausageReportFromSource,
  publishVifailbackCutSausageArtifactDirectory,
  verifyVifailbackCutSausageArtifactDirectory,
  verifyVifailbackCutSausageReceipt,
  verifyVifailbackCutSausageReport,
  verifyVifailbackCutSausageReportWithSource,
  verifyVifailbackCutSausageSourceDirectory,
} from "../src/outsider-vifailback-cut-sausage-morphology.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-vifailback-cut-sausage-morphology-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `VIFAILBACK_MORPHOLOGY_CLI_${code}`
    : `VIFAILBACK_MORPHOLOGY_CLI_${code}:${detail}`);
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
      "  node scripts/acquire-vifailback-cut-sausage-morphology.mjs [--output <new-dir>]",
      "",
      `Pins ${VIFAILBACK_DATASET_ID}@${VIFAILBACK_REVISION}.`,
      `Enumerates the complete ${VIFAILBACK_SUBTREE} subtree before and after acquisition.`,
      "Downloads only one annotation JSON plus 597 JPEGs (42,016,007 bytes);",
      "all 33 MP4 objects (157,431,339 bytes) remain excluded.",
      "Publisher failure/correction morphology is quarantine evaluation evidence only:",
      "no raw trajectory, independent outcome, verified recovery effect, training, network,",
      "CEU, pricing, or execution authority is created.",
    ].join("\n") + "\n");
    return { ok: true, help: true };
  }
  const target = targetInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  requireSafeParent(path.dirname(target));
  const checkpoint = `${target}.source-checkpoint`;
  let sourceAcquiredThisRun = false;
  if (existsSync(checkpoint)) {
    const checked = verifyVifailbackCutSausageSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_BOUNDED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_INVALID", checkpoint);
    }
  } else {
    process.stderr.write("Acquiring pinned ViFailback cut_sausage no-video closure...\n");
    await acquirePinnedVifailbackCutSausageSource(checkpoint);
    sourceAcquiredThisRun = true;
    const checked = verifyVifailbackCutSausageSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_BOUNDED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_REPLAY_FAILED", checkpoint);
    }
  }
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  process.stderr.write("Building source-rederived failure/correction morphology report...\n");
  const report = buildVifailbackCutSausageReportFromSource(checkpoint);
  const standalone = verifyVifailbackCutSausageReport(report);
  if (!standalone.ok) fail("STANDALONE_REPORT_INVALID", standalone.error);
  const replay = verifyVifailbackCutSausageReportWithSource(report, checkpoint);
  if (!replay.ok || replay.verificationLevel !== "FULL_BOUNDED_SOURCE_REDERIVED") {
    fail("FULL_SOURCE_REPLAY_FAILED", replay.error);
  }
  const reportBytes = canonicalBytes(report);
  const receipt = buildVifailbackCutSausageReceipt(report, reportBytes);
  const receiptBytes = canonicalBytes(receipt);
  if (!verifyVifailbackCutSausageReceipt(receipt, report, reportBytes).ok) {
    fail("RUN_RECEIPT_INVALID");
  }
  writePrivate(path.join(staging, "report.json"), reportBytes);
  writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
  renameSync(checkpoint, path.join(staging, "source"));
  publishVifailbackCutSausageArtifactDirectory(staging, target);
  const artifact = verifyVifailbackCutSausageArtifactDirectory(target);
  if (!artifact.ok) fail("PUBLISHED_ARTIFACT_REPLAY_FAILED", artifact.error);
  const result = { ok: true, outputDirectory: target, sourceAcquiredThisRun,
    datasetId: VIFAILBACK_DATASET_ID, pinnedRevision: VIFAILBACK_REVISION,
    subtree: VIFAILBACK_SUBTREE, selectedNoVideoFiles: 598,
    selectedNoVideoBytes: 42_016_007, excludedMp4Files: 33,
    excludedVideoBytes: 157_431_339, publisherAnnotatedEpisodes: 33,
    publisherFailureAnnotations: 31, publisherNoFailureAnnotations: 2,
    publisherCorrectionMorphologies: 31,
    artifactHash: report.artifactHash, receiptHash: receipt.receiptHash,
    reportFileSha256: receipt.reportFileSha256,
    sourceManifestHash: report.source.manifestHash,
    sourceManifestFileSha256: report.source.manifestFileSha256,
    sourceRoot: report.source.sourceRoot,
    verificationLevel: artifact.verificationLevel,
    independentOutcomeUnits: 0, executableRecoverySuffixUnits: 0,
    verifiedRecoveryEffectUnits: 0, governedTrainingRows: 0,
    networkAdmissionRows: 0, CEU: 0, pricingUnits: 0, authorityUnits: 0 };
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
