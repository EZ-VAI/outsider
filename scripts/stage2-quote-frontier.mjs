#!/usr/bin/env node

/*
 * Offline Stage 2 pre-action/model/quote frontier CLI.
 *
 * The spec points to exact local source artifacts.  Build and verify both
 * reopen the six-source empirical ledger (including the isolated NHTSA lane)
 * and emit the exact six-source replay receipt; no CLI flag can assert trust,
 * FULL_SOURCE, pricing, coverage, capital, guarantee, or settlement authority.
 */

import { open, readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildStage2QuoteCandidate,
  buildStage2QuoteFrontier,
  verifyStage2QuoteCandidate,
  verifyStage2QuoteFrontier,
} from "../src/outsider-stage2-quote-frontier.js";

const SPEC_SCHEMA = "outsider/stage2-model-quote-input-spec/v1";

function fail(code) { throw new Error(code); }

function plain(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function usage(stream = process.stderr) {
  stream.write(
    "usage:\n"
    + "  node scripts/stage2-quote-frontier.mjs build --spec <spec.json> [--out <frontier.json>]\n"
    + "  node scripts/stage2-quote-frontier.mjs verify --spec <spec.json> --frontier <frontier.json>\n"
    + "  node scripts/stage2-quote-frontier.mjs quote --spec <spec.json> --frontier <frontier.json> [--out <quote.json>]\n"
    + "  node scripts/stage2-quote-frontier.mjs verify-quote --spec <spec.json> --frontier <frontier.json> --quote <quote.json>\n",
  );
}

function options(values) {
  const output = {};
  for (let index = 0; index < values.length; index += 1) {
    const name = values[index];
    if (!["--spec", "--out", "--frontier", "--quote"].includes(name)) {
      fail(`STAGE2_CLI_UNKNOWN_ARGUMENT:${name}`);
    }
    if (Object.hasOwn(output, name)) fail(`STAGE2_CLI_DUPLICATE_ARGUMENT:${name}`);
    const value = values[index + 1];
    if (!value || value.startsWith("--")) fail(`STAGE2_CLI_VALUE_REQUIRED:${name}`);
    output[name] = value;
    index += 1;
  }
  return output;
}

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function resolveFile(base, value, code) {
  if (typeof value !== "string" || value.length === 0) fail(code);
  return path.resolve(base, value);
}

async function curateSourceFrom(spec, base) {
  if (!exactKeys(spec, ["episodeFile", "historyFiles", "clearanceFile",
    "checkpointFile", "checkpointClearanceFiles", "inclusionProofFile"])
    || !Array.isArray(spec.historyFiles)
    || !Array.isArray(spec.checkpointClearanceFiles)
    || spec.checkpointClearanceFiles.length === 0) {
    fail("STAGE2_CLI_CURATE_SOURCE_SPEC_INVALID");
  }
  return {
    episode: await json(resolveFile(base, spec.episodeFile,
      "STAGE2_CLI_CURATE_EPISODE_FILE_REQUIRED")),
    history: await Promise.all(spec.historyFiles.map((file) =>
      json(resolveFile(base, file, "STAGE2_CLI_CURATE_HISTORY_FILE_REQUIRED")))),
    clearance: await json(resolveFile(base, spec.clearanceFile,
      "STAGE2_CLI_CURATE_CLEARANCE_FILE_REQUIRED")),
    checkpoint: await json(resolveFile(base, spec.checkpointFile,
      "STAGE2_CLI_CURATE_CHECKPOINT_FILE_REQUIRED")),
    checkpointClearances: await Promise.all(spec.checkpointClearanceFiles.map((file) =>
      json(resolveFile(base, file, "STAGE2_CLI_CURATE_CHECKPOINT_CLEARANCE_REQUIRED")))),
    inclusionProof: await json(resolveFile(base, spec.inclusionProofFile,
      "STAGE2_CLI_CURATE_PROOF_FILE_REQUIRED")),
  };
}

async function realitySourcesFrom(specFile) {
  const file = path.resolve(specFile);
  const base = path.dirname(file);
  const spec = await json(file);
  if (!exactKeys(spec, ["schema", "boundaryFile", "claimFile", "assessmentFile",
    "priorCommitmentEntries", "currentCommitmentFile", "executionFile",
    "curateIntentFile", "curateSource", "stage05", "createdAt"])
    || spec.schema !== "outsider/reality-source-bound-input-spec/v1"
    || !Array.isArray(spec.priorCommitmentEntries)
    || !exactKeys(spec.stage05, ["runDirectory", "attestationFile"])) {
    fail("STAGE2_CLI_REALITY_SOURCE_SPEC_INVALID");
  }
  return {
    boundary: await json(resolveFile(base, spec.boundaryFile,
      "STAGE2_CLI_REALITY_BOUNDARY_REQUIRED")),
    claim: await json(resolveFile(base, spec.claimFile,
      "STAGE2_CLI_REALITY_CLAIM_REQUIRED")),
    assessment: await json(resolveFile(base, spec.assessmentFile,
      "STAGE2_CLI_REALITY_ASSESSMENT_REQUIRED")),
    priorCommitmentEntries: await Promise.all(spec.priorCommitmentEntries.map(async (entry) => {
      if (!exactKeys(entry, ["commitmentFile", "claimFile"])) {
        fail("STAGE2_CLI_REALITY_PRIOR_COMMITMENT_SPEC_INVALID");
      }
      return {
        commitment: await json(resolveFile(base, entry.commitmentFile,
          "STAGE2_CLI_REALITY_PRIOR_COMMITMENT_REQUIRED")),
        claim: await json(resolveFile(base, entry.claimFile,
          "STAGE2_CLI_REALITY_PRIOR_CLAIM_REQUIRED")),
      };
    })),
    currentCommitment: await json(resolveFile(base, spec.currentCommitmentFile,
      "STAGE2_CLI_REALITY_CURRENT_COMMITMENT_REQUIRED")),
    execution: await json(resolveFile(base, spec.executionFile,
      "STAGE2_CLI_REALITY_EXECUTION_REQUIRED")),
    curateIntent: await json(resolveFile(base, spec.curateIntentFile,
      "STAGE2_CLI_REALITY_CURATE_INTENT_REQUIRED")),
    curateSource: await curateSourceFrom(spec.curateSource, base),
    stage05Source: {
      runDirectory: resolveFile(base, spec.stage05.runDirectory,
        "STAGE2_CLI_STAGE05_RUN_DIRECTORY_REQUIRED"),
      attestation: await json(resolveFile(base, spec.stage05.attestationFile,
        "STAGE2_CLI_ATTESTATION_REQUIRED")),
    },
  };
}

async function empiricalSourcesFrom(spec, base) {
  if (!exactKeys(spec, ["ledgerFile", "wave3SourceDirectory", "wave4SourceDirectory",
    "botFailsSourceDirectory", "ur5SourceDirectory", "droidArtifactDirectory",
    "droidSourceDirectory", "nhtsaRegistryDirectory", "nhtsaCsvPath",
    "nhtsaDataDictionaryPath", "nhtsaReplayAt"])) {
    fail("STAGE2_CLI_EMPIRICAL_SPEC_INVALID");
  }
  const sourceDirectory = resolveFile(base, spec.droidSourceDirectory,
    "STAGE2_CLI_DROID_SOURCE_DIRECTORY_REQUIRED");
  return {
    ledger: await json(resolveFile(base, spec.ledgerFile,
      "STAGE2_CLI_EMPIRICAL_LEDGER_REQUIRED")),
    options: {
      wave3SourceDirectory: resolveFile(base, spec.wave3SourceDirectory,
        "STAGE2_CLI_WAVE3_SOURCE_REQUIRED"),
      wave4SourceDirectory: resolveFile(base, spec.wave4SourceDirectory,
        "STAGE2_CLI_WAVE4_SOURCE_REQUIRED"),
      botFailsSourceDirectory: resolveFile(base, spec.botFailsSourceDirectory,
        "STAGE2_CLI_BOTFAILS_SOURCE_REQUIRED"),
      ur5SourceDirectory: resolveFile(base, spec.ur5SourceDirectory,
        "STAGE2_CLI_UR5_SOURCE_REQUIRED"),
      droidArtifactDirectory: resolveFile(base, spec.droidArtifactDirectory,
        "STAGE2_CLI_DROID_ARTIFACTS_REQUIRED"),
      nhtsaRegistryDirectory: resolveFile(base, spec.nhtsaRegistryDirectory,
        "STAGE2_CLI_NHTSA_REGISTRY_REQUIRED"),
      nhtsaCsvPath: resolveFile(base, spec.nhtsaCsvPath,
        "STAGE2_CLI_NHTSA_CSV_REQUIRED"),
      nhtsaDataDictionaryPath: resolveFile(base, spec.nhtsaDataDictionaryPath,
        "STAGE2_CLI_NHTSA_DATA_DICTIONARY_REQUIRED"),
      nhtsaReplayAt: spec.nhtsaReplayAt,
      droidSource: {
        objectListBytes: await readFile(path.join(sourceDirectory, "gcs-objects.json")),
        datasetInfoBytes: await readFile(path.join(sourceDirectory, "dataset_info.json")),
        featureBytes: await readFile(path.join(sourceDirectory, "features.json")),
        shardBytes: await readFile(path.join(sourceDirectory,
          "r2d2_faceblur-train.tfrecord-00000-of-00031")),
      },
    },
  };
}

async function lossSourcesFrom(spec, base) {
  if (!exactKeys(spec, ["bookFile", "quarantineFile", "quarantineLineageFiles",
    "adjudicationFiles", "trustStoreFile", "now"])
    || !Array.isArray(spec.quarantineLineageFiles)
    || !Array.isArray(spec.adjudicationFiles)) {
    fail("STAGE2_CLI_LOSS_EXPOSURE_SPEC_INVALID");
  }
  return {
    book: await json(resolveFile(base, spec.bookFile,
      "STAGE2_CLI_LOSS_BOOK_REQUIRED")),
    sources: {
      quarantine: await json(resolveFile(base, spec.quarantineFile,
        "STAGE2_CLI_LOSS_QUARANTINE_REQUIRED")),
      quarantineLineage: await Promise.all(spec.quarantineLineageFiles.map((file) =>
        json(resolveFile(base, file, "STAGE2_CLI_LOSS_LINEAGE_REQUIRED")))),
      adjudications: await Promise.all(spec.adjudicationFiles.map((file) =>
        json(resolveFile(base, file, "STAGE2_CLI_LOSS_ADJUDICATION_REQUIRED")))),
      trustStore: await json(resolveFile(base, spec.trustStoreFile,
        "STAGE2_CLI_LOSS_TRUST_STORE_REQUIRED")),
      now: spec.now,
    },
  };
}

async function sourceSetFrom(spec, base) {
  const reality = await realitySourcesFrom(resolveFile(base,
    spec.reality.sourceSpecFile, "STAGE2_CLI_REALITY_SPEC_REQUIRED"));
  const empirical = await empiricalSourcesFrom(spec.empirical, base);
  const loss = await lossSourcesFrom(spec.lossExposure, base);
  return {
    realityEnvelope: await json(resolveFile(base, spec.reality.envelopeFile,
      "STAGE2_CLI_REALITY_ENVELOPE_REQUIRED")),
    realitySources: reality,
    empiricalLedger: empirical.ledger,
    empiricalSourceOptions: empirical.options,
    lossExposureBook: loss.book,
    lossExposureSources: loss.sources,
  };
}

async function loadSpec(file) {
  const absolute = path.resolve(file);
  const base = path.dirname(absolute);
  const spec = await json(absolute);
  if (!exactKeys(spec, ["schema", "createdAt", "reality", "empirical",
    "lossExposure", "quote"])
    || spec.schema !== SPEC_SCHEMA
    || !exactKeys(spec.reality, ["envelopeFile", "sourceSpecFile"])
    || !(spec.quote === null || exactKeys(spec.quote,
      ["requestedAt", "validFrom", "validUntil", "priorCandidateFiles"]))
    || (spec.quote !== null && !Array.isArray(spec.quote.priorCandidateFiles))) {
    fail("STAGE2_CLI_INPUT_SPEC_INVALID");
  }
  return { spec, base, sources: await sourceSetFrom(spec, base) };
}

async function priorCandidates(spec, base) {
  if (spec.quote === null) fail("STAGE2_CLI_QUOTE_SPEC_REQUIRED");
  return Promise.all(spec.quote.priorCandidateFiles.map((file) =>
    json(resolveFile(base, file, "STAGE2_CLI_PRIOR_QUOTE_FILE_REQUIRED"))));
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

try {
  const args = options(process.argv.slice(3));
  if (!command || !args["--spec"]) fail("STAGE2_CLI_COMMAND_AND_SPEC_REQUIRED");
  const loaded = await loadSpec(args["--spec"]);
  if (command === "build") {
    if (args["--frontier"] || args["--quote"]) fail("STAGE2_CLI_BUILD_ARGUMENT_INVALID");
    const frontier = buildStage2QuoteFrontier({
      createdAt: loaded.spec.createdAt,
      sources: loaded.sources,
    });
    await emit(frontier, args["--out"]);
  } else if (command === "verify") {
    if (!args["--frontier"] || args["--out"] || args["--quote"]) {
      fail("STAGE2_CLI_VERIFY_ARGUMENT_INVALID");
    }
    const frontier = await json(path.resolve(args["--frontier"]));
    const checked = verifyStage2QuoteFrontier(frontier, loaded.sources);
    await emit(checked, null);
    if (!checked.ok) process.exitCode = 1;
  } else if (command === "quote") {
    if (!args["--frontier"] || args["--quote"]) fail("STAGE2_CLI_QUOTE_ARGUMENT_INVALID");
    const frontier = await json(path.resolve(args["--frontier"]));
    const priors = await priorCandidates(loaded.spec, loaded.base);
    const candidate = buildStage2QuoteCandidate({
      frontier,
      sources: loaded.sources,
      requestedAt: loaded.spec.quote.requestedAt,
      validFrom: loaded.spec.quote.validFrom,
      validUntil: loaded.spec.quote.validUntil,
      priorCandidates: priors,
    });
    await emit(candidate, args["--out"]);
  } else if (command === "verify-quote") {
    if (!args["--frontier"] || !args["--quote"] || args["--out"]) {
      fail("STAGE2_CLI_VERIFY_QUOTE_ARGUMENT_INVALID");
    }
    const [frontier, quote, priors] = await Promise.all([
      json(path.resolve(args["--frontier"])),
      json(path.resolve(args["--quote"])),
      priorCandidates(loaded.spec, loaded.base),
    ]);
    const checked = verifyStage2QuoteCandidate(quote, {
      frontier, sources: loaded.sources, priorCandidates: priors,
    });
    await emit(checked, null);
    if (!checked.ok) process.exitCode = 1;
  } else fail(`STAGE2_CLI_UNKNOWN_COMMAND:${command}`);
} catch (error) {
  usage();
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
