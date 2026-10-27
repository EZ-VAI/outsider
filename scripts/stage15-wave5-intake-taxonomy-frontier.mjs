#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  PUBLIC_EVIDENCE_WAVE5_CANONICAL_GENERATED_AT,
} from "../src/outsider-public-evidence-wave5.js";
import {
  DurableWave5IntakeRegistry,
  PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER,
  buildWave5IntakeSnapshot,
  buildWave5IntakeSnapshotDiff,
  verifyWave5IntakeSnapshot,
  verifyWave5IntakeSnapshotDiff,
} from "../src/outsider-wave5-intake-taxonomy-frontier.js";

const DEFAULT_SOURCE = "artifacts/public-evidence-wave5-20260821/source";
const DEFAULT_OUTPUT = "artifacts/public-evidence-wave5-intake-20260821/final-v3";

function fail(code) { throw new Error(code); }
function parseArgs(argv) {
  const parsed = { sourceDirectory: DEFAULT_SOURCE, outputDirectory: DEFAULT_OUTPUT,
    generatedAt: PUBLIC_EVIDENCE_WAVE5_CANONICAL_GENERATED_AT };
  const fields = new Map([
    ["--source-dir", "sourceDirectory"],
    ["--output-dir", "outputDirectory"],
    ["--generated-at", "generatedAt"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const field = fields.get(argv[index]);
    if (!field || !argv[index + 1]) {
      fail(`WAVE5_INTAKE_CLI_ARGUMENT_INVALID:${argv[index]}`);
    }
    parsed[field] = argv[++index];
  }
  if (!Number.isFinite(Date.parse(parsed.generatedAt))
    || new Date(parsed.generatedAt).toISOString() !== parsed.generatedAt) {
    fail("WAVE5_INTAKE_CLI_GENERATED_AT_INVALID");
  }
  return parsed;
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
  fail("WAVE5_INTAKE_CLI_OUTPUT_EXISTS_OR_TOO_BROAD");
}

const snapshot = buildWave5IntakeSnapshot({
  sourceDirectory: source,
  generatedAt: args.generatedAt,
});
const bootstrapDiff = buildWave5IntakeSnapshotDiff(null, snapshot);
const fullSourceCheck = verifyWave5IntakeSnapshot(snapshot, { sourceDirectory: source });
if (!fullSourceCheck.ok || fullSourceCheck.verificationLevel !== "FULL_SOURCE_REPLAY"
  || fullSourceCheck.sourceArtifactsReverified !== true
  || !verifyWave5IntakeSnapshotDiff(bootstrapDiff, null, snapshot).ok) {
  fail("WAVE5_INTAKE_CLI_POST_PROJECTION_VERIFY_FAILED");
}

mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
const temporary = path.join(path.dirname(output),
  `.${path.basename(output)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
mkdirSync(temporary, { mode: 0o700 });
try {
  const registry = new DurableWave5IntakeRegistry({
    directory: path.join(temporary, "registry"),
    registryId: "outsider-wave5-source-aware-intake",
    createdAt: args.generatedAt,
  });
  const admission = registry.append(snapshot, {
    expectedHeadSnapshotHash: null,
    recordedAt: args.generatedAt,
    sourceDirectory: source,
  });
  const registryCheck = registry.verify();
  if (!registryCheck.ok || registryCheck.state.revision !== 1
    || registryCheck.state.headSnapshotHash !== snapshot.snapshotHash) {
    fail("WAVE5_INTAKE_CLI_REGISTRY_VERIFY_FAILED");
  }
  const registryVerification = {
    ok: true,
    registryId: registryCheck.state.registryId,
    revision: registryCheck.state.revision,
    headSnapshotHash: registryCheck.state.headSnapshotHash,
    eventHeadHash: registryCheck.state.eventHeadHash,
    stateHash: registryCheck.state.stateHash,
    admittedSnapshotHash: admission.snapshotHash,
    admittedDiffHash: admission.diffHash,
    rollbackResistance: registryCheck.state.rollbackResistance,
    externalCheckpointEstablished: registryCheck.state.externalCheckpointEstablished,
    offlineVerificationScope: "LOCAL_CONTENT_AND_CHAIN_INTEGRITY_AFTER_SOURCE_BOUND_ADMISSION",
    sourceReplayRequiredForFutureAdmission: true,
    authority: "NONE",
  };
  const artifactSummary = {
    generatedAt: args.generatedAt,
    providerId: PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER.providerId,
    snapshotHash: snapshot.snapshotHash,
    bootstrapDiffHash: bootstrapDiff.diffHash,
    sourceVerification: snapshot.sourceVerification,
    sources: snapshot.sources,
    counts: snapshot.summary,
    registry: registryVerification,
    interpretation: {
      traceCommonsUse: "ORGANIC_AGENT_SESSION_SHAPE_ONLY",
      robustUse: "ROS_BUG_FIX_MECHANISM_TAXONOMY_ONLY",
      humanReviewRequiredBeforeAnyDownstreamAdmission: true,
      automaticPromotion: false,
      causalExperienceUnits: 0,
      economicLossRows: 0,
      populationFrequencyEligibleRows: 0,
      pricingEligibleRows: 0,
      automaticTrainingRows: 0,
    },
  };
  const files = [
    write(temporary, "snapshot.json", snapshot),
    write(temporary, "bootstrap-diff.json", bootstrapDiff),
    write(temporary, "projection.jsonl", snapshot.rows.map(serialize).join("")),
    write(temporary, "summary.json", artifactSummary),
    write(temporary, "registry-verification.json", registryVerification),
  ];
  renameSync(temporary, output);
  process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory: output,
    snapshotHash: snapshot.snapshotHash, bootstrapDiffHash: bootstrapDiff.diffHash,
    rows: snapshot.summary.rows,
    organicAgentSessionShapeRows: snapshot.summary.organicAgentSessionShapeRows,
    rosBugFixMechanismTaxonomyRows:
      snapshot.summary.rosBugFixMechanismTaxonomyRows,
    conservativeD2CorrelationGroups:
      snapshot.summary.conservativeD2CorrelationGroups,
    registryRevision: registryCheck.state.revision,
    causalExperienceUnits: 0, economicLossRows: 0,
    populationFrequencyEligibleRows: 0, pricingEligibleRows: 0,
    automaticTrainingRows: 0, files })}\n`);
} catch (error) {
  rmSync(temporary, { recursive: true, force: true });
  throw error;
}
