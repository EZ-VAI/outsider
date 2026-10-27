#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync }
  from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  PUBLIC_AGENT_WAVE3_CANONICAL_GENERATED_AT,
  verifyPublicAgentWave3Manifest,
  verifyPublicAgentWave3MetadataRecord,
  verifyPublicAgentWave3RecordSet,
  verifyPublicAgentWave3Source,
} from "../src/outsider-public-agent-wave3.js";

const DEFAULT_SOURCE = "artifacts/public-agent-wave3-20260821/source/cuarewardbench";
const DEFAULT_OUTPUT = "artifacts/public-agent-wave3-20260821/final-v1";

function fail(code) { throw new Error(code); }
function parseArgs(argv) {
  const output = { sourceDirectory: DEFAULT_SOURCE, outputDirectory: DEFAULT_OUTPUT,
    generatedAt: PUBLIC_AGENT_WAVE3_CANONICAL_GENERATED_AT };
  const fields = new Map([["--source-dir", "sourceDirectory"],
    ["--output-dir", "outputDirectory"], ["--generated-at", "generatedAt"]]);
  for (let index = 0; index < argv.length; index += 1) {
    const field = fields.get(argv[index]);
    if (!field || !argv[index + 1]) fail(`PUBLIC_AGENT_WAVE3_CLI_ARGUMENT_INVALID:${argv[index]}`);
    output[field] = argv[++index];
  }
  if (new Date(output.generatedAt).toISOString() !== output.generatedAt) {
    fail("PUBLIC_AGENT_WAVE3_CLI_GENERATED_AT_INVALID");
  }
  return output;
}
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function jsonl(values) { return `${values.map((value) => JSON.stringify(value)).join("\n")}\n`; }
function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function digest(value, domain) {
  return sha256(`${domain}\0${canonicalizeStrict(value)}`);
}
function atomicDirectory(outputDirectory, files) {
  const target = path.resolve(outputDirectory);
  if (existsSync(target)) fail("PUBLIC_AGENT_WAVE3_CLI_OUTPUT_EXISTS");
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
  const result = verifyPublicAgentWave3Source(path.resolve(args.sourceDirectory),
    { generatedAt: args.generatedAt });
  const setCheck = verifyPublicAgentWave3RecordSet(result.records,
    { manifest: result.manifest });
  if (!verifyPublicAgentWave3Manifest(result.manifest).ok || !setCheck.ok
    || result.records.some((record) => !verifyPublicAgentWave3MetadataRecord(record).ok)
    || result.verification.status !== "PINNED_METADATA_ONLY_REPRODUCED"
    || result.verification.sourceCompleteness !== "QUARANTINED_NO_TRACE_BYTES"
    || result.verification.traceBytesAcquired !== 0
    || result.summary.counts.trajectoryTruthUsableRows !== 0
    || result.summary.counts.causalExperienceUnits !== 0
    || result.summary.counts.economicLossRows !== 0
    || result.summary.counts.pricingEligibleRows !== 0
    || result.summary.interpretation.automaticTraining !== false) {
    fail("PUBLIC_AGENT_WAVE3_CLI_BOUNDARY_INVALID");
  }
  const files = {
    "metadata-manifest.json": serialize(result.manifest),
    "normalized-labels.jsonl": jsonl(result.records),
    "record-set.json": serialize(result.recordSet),
    "metadata-summary.json": serialize(result.summary),
    "candidate-decision.json": serialize(result.candidateDecision),
    "metadata-verification.json": serialize(result.verification),
  };
  const receiptBody = {
    schema: "outsider/public-agent-wave3-run-receipt/v1",
    schemaVersion: "1.0.0",
    manifestHash: result.manifest.manifestHash,
    recordSetHash: result.recordSet.recordSetHash,
    summaryHash: result.summary.summaryHash,
    candidateDecisionHash: result.candidateDecision.decisionHash,
    verificationHash: result.verification.verificationHash,
    outputContentHashes: Object.fromEntries(Object.entries(files).map(([name, contents]) =>
      [name, sha256(contents)]).sort(([left], [right]) => left.localeCompare(right))),
    counts: { records: result.records.length,
      taskCorrelationComponents: result.summary.counts.taskCorrelationComponents,
      acquiredObjects: result.verification.acquiredObjects,
      acquiredBytes: result.verification.acquiredBytes,
      referencedTraceBytes: result.verification.referencedTraceBytes,
      traceBytesAcquired: 0 },
    boundary: { status: "METADATA_ONLY_QUARANTINED_NO_TRACE_BYTES",
      trajectoryTruthUsableRows: 0, causalExperienceUnits: 0,
      economicLossRows: 0, pricingEligibleRows: 0, automaticTraining: false },
  };
  const receipt = { ...receiptBody,
    receiptHash: digest(receiptBody, "outsider/public-agent-wave3-run-receipt/v1") };
  files["run-receipt.json"] = serialize(receipt);
  const outputDirectory = atomicDirectory(args.outputDirectory, files);
  for (const [name, expected] of Object.entries(receipt.outputContentHashes)) {
    if (sha256(readFileSync(path.join(outputDirectory, name))) !== expected) {
      fail("PUBLIC_AGENT_WAVE3_CLI_PERSISTED_CONTENT_MISMATCH");
    }
  }
  process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory,
    records: result.records.length,
    taskCorrelationComponents: result.summary.counts.taskCorrelationComponents,
    manifestHash: result.manifest.manifestHash,
    recordSetHash: result.recordSet.recordSetHash,
    summaryHash: result.summary.summaryHash,
    verificationHash: result.verification.verificationHash,
    candidateDecisionHash: result.candidateDecision.decisionHash,
    receiptHash: receipt.receiptHash,
    sourceCompleteness: result.verification.sourceCompleteness,
    traceBytesAcquired: 0, trajectoryTruthUsableRows: 0,
    causalExperienceUnits: 0, economicLossRows: 0,
    pricingEligibleRows: 0, automaticTraining: false })}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
