#!/usr/bin/env node

/*
 * Offline CLI for the source-bound Reality Stewardship seam.
 *
 * It reads local Stage 0.5, ATTEST and CURATE artifacts, replays them through
 * their existing verifiers, and emits only a no-authority advisory artifact.
 */

import { open, readFile } from "node:fs/promises";
import path from "node:path";

import {
  createRealityCurateEvidenceIntent,
  createSourceBoundRealityAdvisoryEnvelope,
  verifySourceBoundRealityAdvisoryEnvelope,
} from "../src/outsider-reality-stewardship-integration.js";

function usage(stream = process.stderr) {
  stream.write(
    "usage:\n"
    + "  node scripts/reality-stewardship-bind.mjs intent --spec <curate-spec.json> [--out <intent.json>]\n"
    + "  node scripts/reality-stewardship-bind.mjs build --spec <envelope-spec.json> [--out <envelope.json>]\n"
    + "  node scripts/reality-stewardship-bind.mjs verify --spec <envelope-spec.json> --envelope <envelope.json>\n",
  );
}

function options(values) {
  const output = {};
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (!name.startsWith("--")) throw new Error(`UNKNOWN_ARGUMENT:${name}`);
    const value = values[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`ARGUMENT_VALUE_REQUIRED:${name}`);
    output[name.slice(2)] = value;
    index += 1;
  }
  return output;
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function fileFrom(base, value, code) {
  if (typeof value !== "string" || value.length === 0) throw new Error(code);
  return path.resolve(base, value);
}

async function curateSourceFrom(spec, base) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error("CURATE_SOURCE_SPEC_INVALID");
  }
  const historyFiles = spec.historyFiles ?? [];
  const checkpointClearanceFiles = spec.checkpointClearanceFiles ?? [];
  if (!Array.isArray(historyFiles) || !Array.isArray(checkpointClearanceFiles)
    || checkpointClearanceFiles.length === 0) {
    throw new Error("CURATE_SOURCE_FILE_SET_INVALID");
  }
  return {
    episode: await json(fileFrom(base, spec.episodeFile, "CURATE_EPISODE_FILE_REQUIRED")),
    history: await Promise.all(historyFiles.map((file) => json(path.resolve(base, file)))),
    clearance: await json(fileFrom(base, spec.clearanceFile,
      "CURATE_CLEARANCE_FILE_REQUIRED")),
    checkpoint: await json(fileFrom(base, spec.checkpointFile,
      "CURATE_CHECKPOINT_FILE_REQUIRED")),
    checkpointClearances: await Promise.all(checkpointClearanceFiles
      .map((file) => json(path.resolve(base, file)))),
    inclusionProof: await json(fileFrom(base, spec.inclusionProofFile,
      "CURATE_INCLUSION_PROOF_FILE_REQUIRED")),
  };
}

async function envelopeSourcesFrom(spec, base) {
  if (spec?.schema !== "outsider/reality-source-bound-input-spec/v1") {
    throw new Error("REALITY_SOURCE_BOUND_INPUT_SPEC_INVALID");
  }
  if (!Array.isArray(spec.priorCommitmentEntries)) {
    throw new Error("REALITY_PRIOR_COMMITMENT_FILE_SET_INVALID");
  }
  const curateSource = await curateSourceFrom(spec.curateSource, base);
  return {
    boundary: await json(fileFrom(base, spec.boundaryFile, "REALITY_BOUNDARY_FILE_REQUIRED")),
    claim: await json(fileFrom(base, spec.claimFile, "REALITY_CLAIM_FILE_REQUIRED")),
    assessment: await json(fileFrom(base, spec.assessmentFile,
      "REALITY_ASSESSMENT_FILE_REQUIRED")),
    priorCommitmentEntries: await Promise.all(spec.priorCommitmentEntries.map(async (entry) => ({
      commitment: await json(fileFrom(base, entry?.commitmentFile,
        "REALITY_PRIOR_COMMITMENT_FILE_REQUIRED")),
      claim: await json(fileFrom(base, entry?.claimFile,
        "REALITY_PRIOR_CLAIM_FILE_REQUIRED")),
    }))),
    currentCommitment: await json(fileFrom(base, spec.currentCommitmentFile,
      "REALITY_CURRENT_COMMITMENT_FILE_REQUIRED")),
    execution: await json(fileFrom(base, spec.executionFile,
      "REALITY_EXECUTION_FILE_REQUIRED")),
    curateIntent: await json(fileFrom(base, spec.curateIntentFile,
      "REALITY_CURATE_INTENT_FILE_REQUIRED")),
    curateSource,
    stage05Source: {
      runDirectory: fileFrom(base, spec.stage05?.runDirectory,
        "REALITY_STAGE05_RUN_DIRECTORY_REQUIRED"),
      attestation: await json(fileFrom(base, spec.stage05?.attestationFile,
        "REALITY_ATTESTATION_FILE_REQUIRED")),
    },
  };
}

async function emit(value, output) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (!output) {
    process.stdout.write(bytes);
    return;
  }
  const handle = await open(path.resolve(output), "wx", 0o600);
  try { await handle.writeFile(bytes, "utf8"); } finally { await handle.close(); }
}

const command = process.argv[2];
if (["--help", "-h"].includes(command)) {
  usage(process.stdout);
  process.exit(0);
}
let args;
try {
  args = options(process.argv.slice(3));
  if (!command || !args.spec) throw new Error("COMMAND_AND_SPEC_REQUIRED");
  const specFile = path.resolve(args.spec);
  const base = path.dirname(specFile);
  const spec = await json(specFile);
  if (command === "intent") {
    if (spec.schema !== "outsider/reality-curate-intent-input-spec/v1") {
      throw new Error("REALITY_CURATE_INTENT_INPUT_SPEC_INVALID");
    }
    const intent = createRealityCurateEvidenceIntent({
      curateSource: await curateSourceFrom(spec.curateSource, base),
    });
    await emit(intent, args.out);
  } else if (command === "build") {
    const sources = await envelopeSourcesFrom(spec, base);
    const envelope = createSourceBoundRealityAdvisoryEnvelope({
      ...sources,
      createdAt: spec.createdAt,
    });
    await emit(envelope, args.out);
  } else if (command === "verify") {
    if (!args.envelope) throw new Error("REALITY_ENVELOPE_FILE_REQUIRED");
    const sources = await envelopeSourcesFrom(spec, base);
    const envelope = await json(path.resolve(args.envelope));
    const checked = verifySourceBoundRealityAdvisoryEnvelope(envelope, sources);
    await emit(checked, null);
    if (!checked.ok) process.exitCode = 1;
  } else {
    throw new Error(`UNKNOWN_COMMAND:${command}`);
  }
} catch (error) {
  usage();
  process.stderr.write(`${String(error?.message ?? error)}\n`);
  process.exitCode = 1;
}
