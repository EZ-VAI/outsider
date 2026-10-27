#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync, constants, existsSync, fstatSync, mkdirSync, openSync, readFileSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory,
  CDI_NCIGF_RATE_GUARANTY_FROZEN_AT,
  verifyCdiNcigfRateGuarantyEvidence,
  verifyCdiNcigfRateGuarantyEvidenceWithSource,
} from "../src/outsider-cdi-ncigf-real-rate-guaranty-evidence.js";

const DEFAULT_SOURCE = "artifacts/cdi-ncigf-real-rate-guaranty-20260821/source";
const DEFAULT_OUTPUT = "artifacts/cdi-ncigf-real-rate-guaranty-20260821/final-v1";

function fail(code) { throw new Error(`CDI_NCIGF_CLI_${code}`); }
function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parsePairs(argv, allowed, defaults) {
  if (argv.length % 2 !== 0) fail("ARGUMENT_INVALID");
  const result = { ...defaults };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const key = allowed.get(argv[index]);
    if (!key || seen.has(key) || !argv[index + 1]) fail("ARGUMENT_INVALID");
    seen.add(key);
    result[key] = argv[index + 1];
  }
  return result;
}

function readBoundedJson(file) {
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 2n || before.size > 8_000_000n) fail("JSON_FILE_INVALID");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      fail("JSON_FILE_CHANGED");
    }
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CDI_NCIGF_CLI_")) throw error;
    fail("JSON_PARSE_INVALID");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function runVerify(argv) {
  const options = parsePairs(argv,
    new Map([["--artifact", "artifact"], ["--source-dir", "sourceDirectory"]]),
    { artifact: path.join(DEFAULT_OUTPUT, "evidence.json"), sourceDirectory: null });
  const artifactFile = path.resolve(options.artifact);
  const artifact = readBoundedJson(artifactFile);
  const result = options.sourceDirectory === null
    ? verifyCdiNcigfRateGuarantyEvidence(artifact)
    : verifyCdiNcigfRateGuarantyEvidenceWithSource(artifact, path.resolve(options.sourceDirectory));
  if (!result.ok) fail("VERIFICATION_FAILED");
  process.stdout.write(`${JSON.stringify({ ...result, command: "verify", artifactFile })}\n`);
}

function runBuild(argv) {
  const options = parsePairs(argv,
    new Map([["--source-dir", "sourceDirectory"], ["--output-dir", "outputDirectory"],
      ["--generated-at", "generatedAt"]]),
    { sourceDirectory: DEFAULT_SOURCE, outputDirectory: DEFAULT_OUTPUT,
      generatedAt: CDI_NCIGF_RATE_GUARANTY_FROZEN_AT });
  const sourceDirectory = path.resolve(options.sourceDirectory);
  const outputDirectory = path.resolve(options.outputDirectory);
  if (outputDirectory === path.parse(outputDirectory).root || existsSync(outputDirectory)) {
    fail("OUTPUT_EXISTS_OR_TOO_BROAD");
  }
  const artifact = buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(sourceDirectory,
    { generatedAt: options.generatedAt });
  const structure = verifyCdiNcigfRateGuarantyEvidence(artifact);
  const replay = verifyCdiNcigfRateGuarantyEvidenceWithSource(artifact, sourceDirectory);
  if (!structure.ok || !replay.ok || !replay.exactOfficialBytesReplayed
    || !replay.candidateArtifactExactlyRebuilt) fail("VERIFICATION_FAILED");
  mkdirSync(path.dirname(outputDirectory), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(outputDirectory),
    `.${path.basename(outputDirectory)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const artifactBytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
    const verificationBytes = Buffer.from(`${JSON.stringify(replay, null, 2)}\n`);
    writeFileSync(path.join(temporary, "evidence.json"), artifactBytes,
      { flag: "wx", mode: 0o600 });
    writeFileSync(path.join(temporary, "verification.json"), verificationBytes,
      { flag: "wx", mode: 0o600 });
    const receipt = {
      schema: "outsider/cdi-ncigf-real-rate-guaranty-run-receipt/v1",
      generatedAt: artifact.generatedAt, artifactHash: artifact.artifactHash,
      sourceSetHash: artifact.source.officialSourceSetHash,
      files: { evidence: { path: "evidence.json", sizeBytes: artifactBytes.length,
        sha256: sha256(artifactBytes) },
      verification: { path: "verification.json", sizeBytes: verificationBytes.length,
        sha256: sha256(verificationBytes) } },
      result: { sourceObjects: artifact.source.suppliedObjectCount,
        sourceBytes: artifact.source.suppliedBytes,
        realSourceDomainExperienceAdmitted: true,
        underlyingWorldTruthIndependentlyEstablished: false,
        filingAcceptedMeansApproved: false, proposedOrApprovedRateMeansChargedPrice: false,
        ncigfIndependentlyVerifiedPublisherCompilation: false,
        assessmentCapacityMeansOutsiderCapital: false,
        reportingGuidelinesSemantics: "MACHINE_DEFERRED",
        TRAIN: false, PRICE: false, GUARANTEE: false, COVER: false,
        CAPITAL: false, CUSTODY: false, SETTLE: false },
    };
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    writeFileSync(path.join(temporary, "run-receipt.json"), receiptBytes,
      { flag: "wx", mode: 0o600 });
    renameSync(temporary, outputDirectory);
    process.stdout.write(`${JSON.stringify({ ok: true, command: "build", outputDirectory,
      artifactHash: artifact.artifactHash, sourceSetHash: artifact.source.officialSourceSetHash,
      evidenceFileSha256: sha256(artifactBytes), result: receipt.result })}\n`);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

const [command, ...argv] = process.argv.slice(2);
if (command === "verify") runVerify(argv);
else if (command === "build") runBuild(argv);
else if (command === "--help") {
  process.stdout.write(`Usage:
  node scripts/cdi-ncigf-real-rate-guaranty-evidence.mjs build [--source-dir DIR] [--output-dir DIR]
  node scripts/cdi-ncigf-real-rate-guaranty-evidence.mjs verify [--artifact FILE] [--source-dir DIR]
`);
} else if (command === undefined) runBuild([]);
else fail("COMMAND_INVALID");
