#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  AGENTCHORD_COMMIT,
  AGENTCHORD_REPOSITORY,
  acquireAgentChordRealRearrangementSource,
  buildAgentChordRealRearrangementReceipt,
  buildAgentChordRealRearrangementReportFromSource,
  publishAgentChordRealRearrangementArtifact,
  verifyAgentChordRealRearrangementArtifact,
  verifyAgentChordRealRearrangementReport,
  verifyAgentChordRealRearrangementWithSource,
} from "../src/outsider-agentchord-real-rearrangement-recovery.js";
import { canonicalizeStrict } from "../src/canonical.js";

const DEFAULT_OUTPUT
  = "artifacts/outsider-agentchord-real-rearrangement-recovery-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENTCHORD_CLI_${code}`
    : `AGENTCHORD_CLI_${code}:${detail}`);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = { command: "acquire", output: DEFAULT_OUTPUT };
  let commandSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!commandSeen && ["acquire", "verify"].includes(argument)) {
      parsed.command = argument;
      commandSeen = true;
    } else if (argument === "--output" && argv[index + 1]) parsed.output = argv[++index];
    else if (["--help", "-h", "help"].includes(argument)) parsed.help = true;
    else fail("ARGUMENT_INVALID", argument);
  }
  return parsed;
}

function safeTarget(value, requireAbsent = false) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || target === path.parse(target).root
    || requireAbsent && existsSync(target)) fail("PATH_INVALID", target);
  return target;
}

function safeParent(directory) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(directory);
  const relative = path.relative(workspace, target);
  let cursor = workspace;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (!existsSync(cursor)) mkdirSync(cursor, { mode: 0o700 });
    const info = lstatSync(cursor);
    if (info.isSymbolicLink() || !info.isDirectory()) fail("PARENT_UNSAFE", cursor);
  }
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return value;
}

async function acquire(args) {
  const target = safeTarget(args.output, true);
  safeParent(path.dirname(target));
  const staging = path.join(path.dirname(target), `.${path.basename(target)}.staging-`
    + `${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  try {
    const source = path.join(staging, "source");
    const manifest = await acquireAgentChordRealRearrangementSource({ directory: source });
    const report = buildAgentChordRealRearrangementReportFromSource(source);
    const reportCheck = verifyAgentChordRealRearrangementReport(report);
    if (!reportCheck.ok) fail("REPORT_INVALID", reportCheck.errors.join(","));
    const replay = verifyAgentChordRealRearrangementWithSource(report, source);
    if (!replay.ok || replay.verificationLevel !== "FULL_SELECTED_SOURCE_REDERIVED") {
      fail("SOURCE_REPLAY_INVALID", replay.errors.join(","));
    }
    const reportBytes = canonicalBytes(report);
    const receipt = buildAgentChordRealRearrangementReceipt(report, reportBytes);
    writePrivate(path.join(staging, "agentchord-real-rearrangement-recovery.json"),
      reportBytes);
    // Receipt publication is deliberately last.
    writePrivate(path.join(staging, "run-receipt.json"), canonicalBytes(receipt));
    publishAgentChordRealRearrangementArtifact(staging, target);
    const checked = verifyAgentChordRealRearrangementArtifact(target);
    if (!checked.ok) fail("PUBLISHED_ARTIFACT_INVALID", checked.errors.join(","));
    return print({ ok: true, outputDirectory: target,
      repository: AGENTCHORD_REPOSITORY, commit: AGENTCHORD_COMMIT,
      selectedRealWorldVideoRollouts: 4,
      selectedBytes: manifest.selection.bytes,
      verificationLevel: checked.verificationLevel,
      artifactHash: report.artifactHash,
      reportFileSha256: checked.reportFileSha256,
      receiptHash: receipt.receiptHash,
      receiptFileSha256: checked.receiptFileSha256,
      independentOutcomeRecords: 0, completeAttemptCensusRecords: 0,
      authorizedTrainingRows: 0, networkContributionRecords: 0,
      CEURecords: 0, authorityDelta: 0 });
  } catch (error) {
    const suffix = `:RECOVERABLE_STAGING=${staging}`;
    if (error instanceof Error) error.message += suffix;
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) return print({ ok: true, usage: [
    "node scripts/acquire-agentchord-real-rearrangement-recovery.mjs acquire [--output <new-dir>]",
    "node scripts/acquire-agentchord-real-rearrangement-recovery.mjs verify [--output <artifact-dir>]",
  ], boundary: "Four publisher-labeled real-world rearrangement videos; visual recovery morphology, not independent outcome or robot action trace." });
  if (args.command === "verify") {
    const checked = verifyAgentChordRealRearrangementArtifact(safeTarget(args.output));
    if (!checked.ok) fail("VERIFY_FAILED", checked.errors.join(","));
    return print({ ok: true, outputDirectory: path.resolve(args.output),
      verificationLevel: checked.verificationLevel,
      reportFileSha256: checked.reportFileSha256,
      receiptFileSha256: checked.receiptFileSha256 });
  }
  return acquire(args);
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
