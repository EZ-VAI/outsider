#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, renameSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  AIRLAB_ARCHIVE_BYTES,
  AIRLAB_ARCHIVE_ETAG,
  AIRLAB_ARCHIVE_URL,
  AIRLAB_REPOSITORY,
  AIRLAB_REPOSITORY_COMMIT,
  acquirePinnedAirlabFailureSource,
  buildAirlabFailureReceipt,
  buildAirlabFailureReportFromSource,
  publishAirlabFailureArtifactDirectory,
  verifyAirlabFailureArtifactDirectory,
  verifyAirlabFailureReceipt,
  verifyAirlabFailureReport,
  verifyAirlabFailureReportWithSource,
  verifyAirlabFailureSourceDirectory,
} from "../src/outsider-airlab-failure-bounded-pair.js";

const DEFAULT_OUTPUT = "artifacts/outsider-airlab-failure-bounded-pair-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `AIRLAB_FAILURE_CLI_${code}`
    : `AIRLAB_FAILURE_CLI_${code}:${detail}`);
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
      "  node scripts/acquire-airlab-failure-bounded-pair.mjs [--output <new-dir>]",
      "",
      `Pins ${AIRLAB_REPOSITORY}@${AIRLAB_REPOSITORY_COMMIT}.`,
      `Enumerates ${AIRLAB_ARCHIVE_URL} (${AIRLAB_ARCHIVE_BYTES} bytes, ETag ${AIRLAB_ARCHIVE_ETAG})`,
      "without downloading the full archive, then strict-Range extracts the complete",
      "put_in/49 publisher-failure and put_in/50 publisher-success multimodal pair.",
      "Dataset rights fail closed; plain-HTTP provenance remains HOLD; labels are not",
      "independent outcomes and establish no recovery, training, network, or authority.",
    ].join("\n") + "\n");
    return { ok: true, help: true };
  }
  const target = targetInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  requireSafeParent(path.dirname(target));
  const checkpoint = `${target}.source-checkpoint`;
  let sourceAcquiredThisRun = false;
  if (existsSync(checkpoint)) {
    const checked = verifyAirlabFailureSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_BOUNDED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_INVALID", checkpoint);
    }
  } else {
    process.stderr.write("Acquiring AIRLAB FAILURE central inventory and bounded pair...\n");
    await acquirePinnedAirlabFailureSource(checkpoint);
    sourceAcquiredThisRun = true;
    const checked = verifyAirlabFailureSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_BOUNDED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_REPLAY_FAILED", checkpoint);
    }
  }
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  process.stderr.write("Building the source-rederived quarantine evaluation report...\n");
  const report = buildAirlabFailureReportFromSource(checkpoint);
  const standalone = verifyAirlabFailureReport(report);
  if (!standalone.ok) fail("STANDALONE_REPORT_INVALID", standalone.error);
  const replay = verifyAirlabFailureReportWithSource(report, checkpoint);
  if (!replay.ok || replay.verificationLevel !== "FULL_BOUNDED_SOURCE_REDERIVED") {
    fail("FULL_SOURCE_REPLAY_FAILED", replay.error);
  }
  const reportBytes = canonicalBytes(report);
  const receipt = buildAirlabFailureReceipt(report, reportBytes);
  const receiptBytes = canonicalBytes(receipt);
  if (!verifyAirlabFailureReceipt(receipt, report, reportBytes).ok) {
    fail("RUN_RECEIPT_INVALID");
  }
  writePrivate(path.join(staging, "report.json"), reportBytes);
  writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
  renameSync(checkpoint, path.join(staging, "source"));
  publishAirlabFailureArtifactDirectory(staging, target);
  const artifact = verifyAirlabFailureArtifactDirectory(target);
  if (!artifact.ok) fail("PUBLISHED_ARTIFACT_REPLAY_FAILED", artifact.error);
  const result = { ok: true, outputDirectory: target, sourceAcquiredThisRun,
    repository: AIRLAB_REPOSITORY, pinnedCommit: AIRLAB_REPOSITORY_COMMIT,
    archiveUrl: AIRLAB_ARCHIVE_URL, archiveBytes: AIRLAB_ARCHIVE_BYTES,
    archiveEtag: AIRLAB_ARCHIVE_ETAG,
    boundedExecutions: 2, publisherSuccessLabel0Units: 1,
    publisherFailureLabel1Units: 1, selectedFiles: 236,
    selectedCompressedBytes: 46_704_177, selectedUncompressedBytes: 93_021_329,
    artifactHash: report.artifactHash, receiptHash: receipt.receiptHash,
    reportFileSha256: receipt.reportFileSha256,
    sourceManifestHash: report.source.manifestHash,
    sourceManifestFileSha256: report.source.manifestFileSha256,
    sourceRoot: report.source.sourceRoot,
    verificationLevel: artifact.verificationLevel,
    plainHttpProvenanceHold: true, datasetRightsFailClosed: true,
    independentOutcomeUnits: 0, recoveryUnits: 0, governedTrainingRows: 0,
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
