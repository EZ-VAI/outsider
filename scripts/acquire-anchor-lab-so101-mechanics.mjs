#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ANCHOR_LAB_DATASET_ID,
  ANCHOR_LAB_REVISION,
  acquirePinnedAnchorLabSo101Source,
  buildAnchorLabSo101MechanicsFromSource,
  buildAnchorLabSo101RunReceipt,
  publishAnchorLabSo101ArtifactDirectory,
  verifyAnchorLabSo101ArtifactDirectory,
  verifyAnchorLabSo101MechanicsArtifact,
  verifyAnchorLabSo101MechanicsArtifactWithSource,
  verifyAnchorLabSo101RunReceipt,
} from "../src/outsider-anchor-lab-so101-mechanics.js";
import { canonicalizeStrict } from "../src/canonical.js";

const DEFAULT_OUTPUT = "artifacts/outsider-anchor-lab-so101-mechanics-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `ANCHOR_LAB_SO101_CLI_${code}`
    : `ANCHOR_LAB_SO101_CLI_${code}:${detail}`);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = { output: DEFAULT_OUTPUT, python: ".venv/bin/python" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output" && argv[index + 1]) parsed.output = argv[++index];
    else if (argument === "--python" && argv[index + 1]) parsed.python = argv[++index];
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
    const stat = lstatSync(cursor, { bigint: true });
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
      "  node scripts/acquire-anchor-lab-so101-mechanics.mjs [--output <new-dir>] [--python <pyarrow-python>]",
      "",
      `Acquires only ${ANCHOR_LAB_DATASET_ID}@${ANCHOR_LAB_REVISION}:`,
      "README.md plus all 50 data/so101_arm_50motion Parquet traces.",
      "This is offline mechanical analysis only and grants zero action or training authority.",
    ].join("\n") + "\n");
    return { ok: true, help: true };
  }
  const target = targetInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  requireSafeParent(path.dirname(target));
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  let published = false;
  try {
    const acquisition = await acquirePinnedAnchorLabSo101Source(path.join(staging, "source"));
    const report = buildAnchorLabSo101MechanicsFromSource(acquisition.sourceDirectory,
      { pythonExecutable: args.python });
    const standalone = verifyAnchorLabSo101MechanicsArtifact(report);
    if (!standalone.ok) fail("STANDALONE_REPORT_INVALID", standalone.error);
    const replay = verifyAnchorLabSo101MechanicsArtifactWithSource(report,
      acquisition.sourceDirectory, { pythonExecutable: args.python });
    if (!replay.ok || replay.verificationLevel !== "FULL_SOURCE_REDERIVED") {
      fail("FULL_SOURCE_REPLAY_FAILED", replay.error);
    }
    const reportBytes = canonicalBytes(report);
    const receipt = buildAnchorLabSo101RunReceipt(report, reportBytes);
    const receiptBytes = canonicalBytes(receipt);
    if (!verifyAnchorLabSo101RunReceipt(receipt, report, reportBytes).ok) {
      fail("RUN_RECEIPT_INVALID");
    }
    writePrivate(path.join(staging, "report.json"), reportBytes);
    writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
    publishAnchorLabSo101ArtifactDirectory(staging, target);
    published = true;
    const directoryReplay = verifyAnchorLabSo101ArtifactDirectory(target,
      { pythonExecutable: args.python });
    if (!directoryReplay.ok) fail("PUBLISHED_ARTIFACT_REPLAY_FAILED", directoryReplay.error);
    const result = {
      ok: true,
      outputDirectory: target,
      datasetId: ANCHOR_LAB_DATASET_ID,
      revision: ANCHOR_LAB_REVISION,
      artifactHash: report.artifactHash,
      receiptHash: receipt.receiptHash,
      reportFileSha256: receipt.reportFileSha256,
      sourceManifestHash: report.source.manifestHash,
      sourceManifestFileSha256: report.source.manifestFileSha256,
      sourceRoot: report.source.sourceRoot,
      sourceObjects: report.source.sourceObjects,
      sourceBytes: report.source.sourceBytes,
      mechanicalSystemIdentificationTraces: report.denominator.units,
      trainFilenameSplitTraces: report.denominator.trainFilenameSplitTraces,
      heldoutFilenameSplitTraces: report.denominator.heldoutFilenameSplitTraces,
      rowsParsed: report.replay.rowsParsed,
      fieldCount: report.replay.schema.aggregateFieldSet.length,
      motionFamilySignals: report.replay.motionFamilies.observedFilenameSignals,
      verificationLevel: directoryReplay.verificationLevel,
      status: report.useBoundary.status,
      trainingRows: 0,
      networkAdmissionRows: 0,
      CEU: 0,
      pricingUnits: 0,
      authorityUnits: 0,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  } catch (error) {
    if (!published && existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
