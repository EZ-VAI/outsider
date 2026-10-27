#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  PUBLIC_EVIDENCE_WAVE5_CANONICAL_GENERATED_AT,
  verifyPublicEvidenceWave5Manifest,
  verifyPublicEvidenceWave5Record,
  verifyPublicEvidenceWave5RecordSet,
  verifyPublicEvidenceWave5Summary,
  verifyPublicEvidenceWave5Source,
  verifyPublicEvidenceWave5Verification,
} from "../src/outsider-public-evidence-wave5.js";

const DEFAULT_SOURCE = "artifacts/public-evidence-wave5-20260821/source";
const DEFAULT_OUTPUT = "artifacts/public-evidence-wave5-20260821/final-v3";

function fail(code) { throw new Error(code); }
function parseArgs(argv) {
  const output = { sourceDirectory: DEFAULT_SOURCE, outputDirectory: DEFAULT_OUTPUT,
    generatedAt: PUBLIC_EVIDENCE_WAVE5_CANONICAL_GENERATED_AT };
  const fields = new Map([["--source-dir", "sourceDirectory"],
    ["--output-dir", "outputDirectory"], ["--generated-at", "generatedAt"]]);
  for (let index = 0; index < argv.length; index += 1) {
    const field = fields.get(argv[index]);
    if (!field || !argv[index + 1]) {
      fail(`PUBLIC_EVIDENCE_WAVE5_CLI_ARGUMENT_INVALID:${argv[index]}`);
    }
    output[field] = argv[++index];
  }
  if (new Date(output.generatedAt).toISOString() !== output.generatedAt) {
    fail("PUBLIC_EVIDENCE_WAVE5_CLI_GENERATED_AT_INVALID");
  }
  return output;
}
function serialize(value) { return `${canonicalizeStrict(value)}\n`; }
function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function write(target, name, value) {
  const bytes = Buffer.from(typeof value === "string" ? value : serialize(value));
  writeFileSync(path.join(target, name), bytes, { flag: "wx", mode: 0o600 });
  return { path: name, sizeBytes: bytes.length, sha256: sha256(bytes) };
}

const args = parseArgs(process.argv.slice(2));
const source = path.resolve(args.sourceDirectory);
const output = path.resolve(args.outputDirectory);
if (source === output || output === path.parse(output).root || existsSync(output)) {
  fail("PUBLIC_EVIDENCE_WAVE5_CLI_OUTPUT_EXISTS_OR_TOO_BROAD");
}
const result = verifyPublicEvidenceWave5Source({
  traceCommonsDirectory: path.join(source, "trace-commons"),
  robustRosDirectory: path.join(source, "robust-ros"),
  generatedAt: args.generatedAt,
});
if (!verifyPublicEvidenceWave5Manifest(result.manifest).ok
  || !result.records.every((record) => verifyPublicEvidenceWave5Record(record).ok)
  || !verifyPublicEvidenceWave5RecordSet(result.recordSet,
    { manifest: result.manifest, records: result.records }).ok
  || !verifyPublicEvidenceWave5Summary(result.summary, { manifest: result.manifest,
    recordSet: result.recordSet, records: result.records }).ok
  || !verifyPublicEvidenceWave5Verification(result.verification,
    { manifest: result.manifest, recordSet: result.recordSet, summary: result.summary,
      records: result.records }).ok) {
  fail("PUBLIC_EVIDENCE_WAVE5_CLI_POST_DERIVATION_VERIFY_FAILED");
}
mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
const temporary = path.join(path.dirname(output),
  `.${path.basename(output)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
mkdirSync(temporary, { mode: 0o700 });
try {
  const files = [
    write(temporary, "manifest.json", result.manifest),
    write(temporary, "records.jsonl", result.records.map(serialize).join("")),
    write(temporary, "record-set.json", result.recordSet),
    write(temporary, "summary.json", result.summary),
    write(temporary, "verification.json", result.verification),
  ];
  renameSync(temporary, output);
  process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory: output,
    records: result.summary.counts.records,
    organicAgentSessions: result.summary.counts.organicAgentSessions,
    robustRobotSoftwareBugs: result.summary.counts.robustRobotSoftwareBugs,
    agentToolCalls: result.summary.counts.agentToolCalls,
    agentSourceNativeToolErrors: result.summary.counts.agentSourceNativeToolErrors,
    sourceArtifactsReverified: result.verification.sourceArtifactsReverified,
    sourceNativeRowsReparsed: result.verification.sourceNativeRowsReparsed,
    causalExperienceUnits: result.summary.counts.causalExperienceUnits,
    economicLossRows: result.summary.counts.economicLossRows,
    pricingEligibleRows: result.summary.counts.pricingEligibleRows,
    automaticTraining: result.summary.interpretation.automaticTraining,
    manifestHash: result.manifest.manifestHash,
    recordSetHash: result.recordSet.recordSetHash,
    summaryHash: result.summary.summaryHash,
    verificationHash: result.verification.verificationHash,
    files })}\n`);
} catch (error) {
  rmSync(temporary, { recursive: true, force: true });
  throw error;
}
