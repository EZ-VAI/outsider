#!/usr/bin/env node

import {
  chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync,
  readdirSync, renameSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  acquirePinnedUciRoboticsSource,
  buildUciRoboticsMicroCorpusFromSource,
  buildUciRoboticsMicroCorpusRunReceipt,
  uciRoboticsSha256Bytes,
  verifyUciRoboticsMicroCorpusReport,
  verifyUciRoboticsMicroCorpusRunReceipt,
  verifyUciRoboticsMicroCorpusWithSource,
  verifyUciRoboticsSourceDirectory,
} from "../src/outsider-uci-robotics-micro-corpus.js";
import { publishPrivateArtifact } from "../src/outsider-private-artifact-publication.js";
import { canonicalizeStrict } from "../src/canonical.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ARTIFACTS_ROOT = path.join(ROOT, "artifacts");
const DEFAULT_OUTPUT = path.join(ARTIFACTS_ROOT,
  "outsider-uci-robotics-micro-corpus-20260829-v1");
const REPORT_NAME = "uci-robotics-micro-corpus.json";
const RECEIPT_NAME = "run-receipt.json";

function usage() {
  return [
    "Usage:",
    "  node scripts/acquire-uci-robotics-micro-corpus.mjs [--output DIR] [--python PATH]",
    "  node scripts/acquire-uci-robotics-micro-corpus.mjs verify --artifact DIR",
    "  node scripts/acquire-uci-robotics-micro-corpus.mjs verify-source --artifact DIR [--python PATH]",
    "",
    "Acquires the exact five-dataset UCI API/archive closure and publishes a",
    "private, no-clobber, non-additive robotics micro-corpus artifact.",
    "",
  ].join("\n");
}

function parseArgs(argv) {
  const args = [...argv];
  let command = "acquire";
  if (["verify", "verify-source"].includes(args[0])) command = args.shift();
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  const parsed = {
    command,
    output: DEFAULT_OUTPUT,
    artifact: null,
    pythonExecutable: ".venv/bin/python",
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!["--output", "--artifact", "--python"].includes(flag) || value == null) {
      throw new Error("UCI_ROBOTICS_CLI_ARGUMENT_INVALID:" + flag);
    }
    if (flag === "--output") parsed.output = path.resolve(value);
    if (flag === "--artifact") parsed.artifact = path.resolve(value);
    if (flag === "--python") parsed.pythonExecutable = value;
    index += 1;
  }
  if (command === "acquire" && parsed.artifact !== null) {
    throw new Error("UCI_ROBOTICS_CLI_ARTIFACT_ONLY_FOR_VERIFY");
  }
  if (command !== "acquire" && parsed.artifact === null) {
    throw new Error("UCI_ROBOTICS_CLI_ARTIFACT_REQUIRED");
  }
  return parsed;
}

function canonicalBytes(value) {
  return Buffer.from(canonicalizeStrict(value) + "\n");
}

function insideArtifacts(target) {
  const relative = path.relative(ARTIFACTS_ROOT, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep)
    && !path.isAbsolute(relative);
}

function assertOutputTarget(output) {
  if (!insideArtifacts(output) || path.dirname(output) !== ARTIFACTS_ROOT) {
    throw new Error("UCI_ROBOTICS_CLI_OUTPUT_MUST_BE_DIRECT_ARTIFACT_CHILD");
  }
  if (existsSync(output)) throw new Error("UCI_ROBOTICS_CLI_OUTPUT_EXISTS");
  const root = lstatSync(ARTIFACTS_ROOT);
  if (!root.isDirectory() || root.isSymbolicLink()) {
    throw new Error("UCI_ROBOTICS_CLI_ARTIFACTS_ROOT_UNSAFE");
  }
}

function assertArtifactModes(artifact) {
  const walk = (directory) => {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) {
      throw new Error("UCI_ROBOTICS_CLI_DIRECTORY_MODE_INVALID:" + directory);
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("UCI_ROBOTICS_CLI_SYMLINK:" + child);
      if (entry.isDirectory()) walk(child);
      else {
        const childStat = lstatSync(child);
        if (!childStat.isFile() || (childStat.mode & 0o777) !== 0o600) {
          throw new Error("UCI_ROBOTICS_CLI_FILE_MODE_INVALID:" + child);
        }
      }
    }
  };
  walk(artifact);
}

function readArtifactFiles(artifact) {
  const reportBytes = readFileSync(path.join(artifact, REPORT_NAME));
  const receiptBytes = readFileSync(path.join(artifact, RECEIPT_NAME));
  let report;
  let receipt;
  try {
    report = JSON.parse(reportBytes.toString("utf8"));
    receipt = JSON.parse(receiptBytes.toString("utf8"));
  } catch {
    throw new Error("UCI_ROBOTICS_CLI_ARTIFACT_JSON_INVALID");
  }
  return { reportBytes, receiptBytes, report, receipt };
}

async function acquire(parsed) {
  assertOutputTarget(parsed.output);
  const staging = mkdtempSync(path.join(tmpdir(), "outsider-uci-robotics-"));
  chmodSync(staging, 0o700);
  let targetClaimed = false;
  try {
    const sourceStage = path.join(staging, "source");
    const acquired = await acquirePinnedUciRoboticsSource(sourceStage);
    const replayOptions = { pythonExecutable: parsed.pythonExecutable };
    const report = buildUciRoboticsMicroCorpusFromSource(sourceStage, replayOptions);
    const full = verifyUciRoboticsMicroCorpusWithSource(report, sourceStage, replayOptions);
    if (!full.ok) {
      throw new Error("UCI_ROBOTICS_CLI_REBUILD_FAILED:" + full.errors.join(","));
    }
    const reportBytes = canonicalBytes(report);
    const receipt = buildUciRoboticsMicroCorpusRunReceipt(report, reportBytes,
      acquired.manifest.manifestHash);
    const receiptBytes = canonicalBytes(receipt);
    if (!verifyUciRoboticsMicroCorpusRunReceipt(receipt, reportBytes).ok) {
      throw new Error("UCI_ROBOTICS_CLI_RECEIPT_INVALID");
    }

    mkdirSync(parsed.output, { recursive: false, mode: 0o700 });
    chmodSync(parsed.output, 0o700);
    targetClaimed = true;
    renameSync(sourceStage, path.join(parsed.output, "source"));
    publishPrivateArtifact(path.join(parsed.output, REPORT_NAME), reportBytes,
      { trustedRoot: ARTIFACTS_ROOT });
    // Receipt publication is deliberately last.
    publishPrivateArtifact(path.join(parsed.output, RECEIPT_NAME), receiptBytes,
      { trustedRoot: ARTIFACTS_ROOT });
    assertArtifactModes(parsed.output);
    const sourceChecked = verifyUciRoboticsSourceDirectory(path.join(parsed.output, "source"));
    const finalFiles = readArtifactFiles(parsed.output);
    if (!verifyUciRoboticsMicroCorpusReport(finalFiles.report).ok
      || !verifyUciRoboticsMicroCorpusRunReceipt(finalFiles.receipt,
        finalFiles.reportBytes).ok) {
      throw new Error("UCI_ROBOTICS_CLI_FINAL_VERIFY_FAILED");
    }
    return {
      ok: true,
      artifact: parsed.output,
      reportFileSha256: uciRoboticsSha256Bytes(finalFiles.reportBytes),
      reportArtifactHash: finalFiles.report.artifactHash,
      receiptHash: finalFiles.receipt.receiptHash,
      sourceManifestHash: sourceChecked.manifest.manifestHash,
      selectedDatasets: 5,
      selectedRemoteFiles: 15,
      selectedRemoteBytes: 4_600_773,
      typedPopulations: 5,
      crossDomainTotal: null,
      authorizedTrainingRows: 0,
      authorityRecords: 0,
    };
  } catch (error) {
    // A claimed candidate is retained for inspection; it is never overwritten or removed.
    if (!targetClaimed) rmSync(staging, { recursive: true, force: true });
    throw error;
  } finally {
    if (!targetClaimed || !existsSync(path.join(staging, "source"))) {
      rmSync(staging, { recursive: true, force: true });
    }
  }
}

function verifyArtifact(parsed, withSource) {
  assertArtifactModes(parsed.artifact);
  const files = readArtifactFiles(parsed.artifact);
  const reportCheck = withSource
    ? verifyUciRoboticsMicroCorpusWithSource(files.report,
      path.join(parsed.artifact, "source"),
      { pythonExecutable: parsed.pythonExecutable })
    : verifyUciRoboticsMicroCorpusReport(files.report);
  const receiptCheck = verifyUciRoboticsMicroCorpusRunReceipt(files.receipt,
    files.reportBytes);
  if (!reportCheck.ok || !receiptCheck.ok) {
    throw new Error("UCI_ROBOTICS_CLI_VERIFY_FAILED:"
      + [...reportCheck.errors, ...receiptCheck.errors].join(","));
  }
  return {
    ok: true,
    artifact: parsed.artifact,
    withSource,
    reportFileSha256: uciRoboticsSha256Bytes(files.reportBytes),
    reportArtifactHash: files.report.artifactHash,
    receiptHash: files.receipt.receiptHash,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    process.stdout.write(usage());
    return;
  }
  const result = parsed.command === "acquire"
    ? await acquire(parsed)
    : verifyArtifact(parsed, parsed.command === "verify-source");
  process.stdout.write(JSON.stringify(result) + "\n");
}

const invoked = process.argv[1] && path.resolve(process.argv[1])
  === fileURLToPath(import.meta.url);
if (invoked) main().catch((error) => {
  process.stderr.write(String(error?.message ?? error) + "\n");
  process.exitCode = 1;
});
