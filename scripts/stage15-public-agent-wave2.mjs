#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync }
  from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  PUBLIC_AGENT_WAVE2_CANONICAL_GENERATED_AT,
  verifyPublicAgentWave2Manifest,
  verifyPublicAgentWave2RecordSet,
  verifyPublicAgentWave2Source,
} from "../src/outsider-public-agent-wave2.js";

const DEFAULT_SOURCE = "artifacts/public-agent-wave2-20260821/source";
const DEFAULT_OUTPUT = "artifacts/public-agent-wave2-20260821/final-v1";

function fail(code) { throw new Error(code); }

function parseArgs(argv) {
  const output = { sourceDirectory: DEFAULT_SOURCE, outputDirectory: DEFAULT_OUTPUT,
    generatedAt: PUBLIC_AGENT_WAVE2_CANONICAL_GENERATED_AT };
  const fields = new Map([["--source-dir", "sourceDirectory"],
    ["--output-dir", "outputDirectory"], ["--generated-at", "generatedAt"]]);
  for (let index = 0; index < argv.length; index += 1) {
    const field = fields.get(argv[index]);
    if (!field || !argv[index + 1]) fail(`PUBLIC_AGENT_WAVE2_CLI_ARGUMENT_INVALID:${argv[index]}`);
    output[field] = argv[++index];
  }
  if (new Date(output.generatedAt).toISOString() !== output.generatedAt) {
    fail("PUBLIC_AGENT_WAVE2_CLI_GENERATED_AT_INVALID");
  }
  return output;
}

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function jsonl(values) { return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`; }

function fileHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(value, domain) {
  return `sha256:${createHash("sha256").update(`${domain}\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function atomicDirectory(outputDirectory, files) {
  const target = path.resolve(outputDirectory);
  if (existsSync(target)) fail("PUBLIC_AGENT_WAVE2_CLI_OUTPUT_EXISTS");
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
  const sourceDirectory = path.resolve(args.sourceDirectory);
  const result = verifyPublicAgentWave2Source(sourceDirectory,
    { generatedAt: args.generatedAt });
  if (!verifyPublicAgentWave2Manifest(result.manifest).ok
    || !verifyPublicAgentWave2RecordSet(result.records, { manifest: result.manifest }).ok
    || result.summary.interpretation.economicLossRows !== 0
    || result.summary.interpretation.causalExperienceUnits !== 0
    || result.summary.interpretation.pricingEligibleRows !== 0
    || result.summary.interpretation.automaticTraining !== false) {
    fail("PUBLIC_AGENT_WAVE2_CLI_BOUNDARY_INVALID");
  }

  const files = {
    "acquisition-manifest.json": serialize(result.manifest),
    "normalized-records.jsonl": jsonl(result.records),
    "record-set.json": serialize(result.recordSet),
    "effect-summary.json": serialize(result.summary),
    "candidate-decision.json": serialize(result.candidateDecision),
    "full-source-verification.json": serialize(result.verification),
  };
  const receiptBody = {
    schema: "outsider/public-agent-wave2-run-receipt/v1", schemaVersion: "1.0.0",
    sourceDirectoryHash: digest({ sourceObjectHashes: result.verification.sourceObjectHashes },
      "outsider/public-agent-wave2/source-directory/v1"),
    manifestHash: result.manifest.manifestHash,
    recordSetHash: result.recordSet.recordSetHash,
    summaryHash: result.summary.summaryHash,
    candidateDecisionHash: result.candidateDecision.decisionHash,
    verificationHash: result.verification.verificationHash,
    outputContentHashes: Object.fromEntries(Object.entries(files).map(([name, contents]) =>
      [name, fileHash(contents)]).sort(([left], [right]) => left.localeCompare(right))),
    counts: { records: result.records.length,
      sourceRows: result.summary.sourceRows,
      correlationComponents: result.summary.correlationComponents,
      acquiredBytes: result.verification.acquiredBytes,
      dataObjectBytes: result.verification.dataObjectBytes },
    boundary: { economicLossRows: 0, causalExperienceUnits: 0, pricingEligibleRows: 0,
      automaticTraining: false, financialEffect: "none" },
  };
  const receipt = { ...receiptBody, receiptHash: digest(receiptBody,
    "outsider/public-agent-wave2-run-receipt/v1") };
  files["run-receipt.json"] = serialize(receipt);
  const outputDirectory = atomicDirectory(args.outputDirectory, files);

  for (const [name, expected] of Object.entries(receipt.outputContentHashes)) {
    if (fileHash(readFileSync(path.join(outputDirectory, name))) !== expected) {
      fail("PUBLIC_AGENT_WAVE2_CLI_PERSISTED_CONTENT_MISMATCH");
    }
  }
  process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory,
    records: result.records.length, sourceRows: result.summary.sourceRows,
    correlationComponents: result.summary.correlationComponents,
    manifestHash: result.manifest.manifestHash,
    recordSetHash: result.recordSet.recordSetHash,
    summaryHash: result.summary.summaryHash,
    verificationHash: result.verification.verificationHash,
    candidateDecisionHash: result.candidateDecision.decisionHash,
    receiptHash: receipt.receiptHash, economicLossRows: 0, causalExperienceUnits: 0,
    pricingEligibleRows: 0, automaticTraining: false })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
