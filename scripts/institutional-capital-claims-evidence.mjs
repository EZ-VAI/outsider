#!/usr/bin/env node

import {
  closeSync, constants, fsyncSync, mkdirSync, openSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  buildInstitutionalCapitalClaimsEvidenceFromSource,
  verifyInstitutionalCapitalClaimsEvidenceAgainstSource,
  verifyInstitutionalCapitalClaimsEvidenceCanonicalFile,
} from "../src/outsider-institutional-capital-claims-evidence.js";

function fail(code) { throw new Error(`INSTITUTIONAL_CAPITAL_CLI_${code}`); }

function usage() {
  return [
    "Usage:",
    "  node scripts/institutional-capital-claims-evidence.mjs build --source-dir <directory> --out <artifact.json>",
    "  node scripts/institutional-capital-claims-evidence.mjs verify --source-dir <directory> --artifact <artifact.json>",
    "",
    "Build and full-source verify the frozen FDIC, Treasury, SEC, and ASB evidence lane.",
    "The output carries zero Outsider issuer, capital, custody, price, guarantee, claim, payment, or closure authority.",
  ].join("\n");
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const action = argv[0];
  if (!new Set(["build", "verify"]).has(action)) fail("ACTION_INVALID");
  const allowed = new Set(["--source-dir", "--out", "--artifact"]);
  const parsed = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith("--")) fail("ARGUMENT_INVALID");
    if (Object.hasOwn(parsed, key)) fail("ARGUMENT_DUPLICATE");
    parsed[key] = value;
  }
  if (!parsed["--source-dir"]) fail("SOURCE_DIR_REQUIRED");
  if (action === "build" && !parsed["--out"]) fail("OUTPUT_REQUIRED");
  if (action === "verify" && !parsed["--artifact"]) fail("ARTIFACT_REQUIRED");
  if ((action === "build" && parsed["--artifact"])
    || (action === "verify" && parsed["--out"])) {
    fail("ARGUMENT_NOT_ALLOWED");
  }
  return parsed;
}

function resolved(value, code) {
  const target = path.resolve(value);
  if (target === path.parse(target).root) fail(`${code}_TOO_BROAD`);
  return target;
}

function writeNoClobber(file, value) {
  const output = resolved(file, "OUTPUT");
  mkdirSync(path.dirname(output), { recursive: true });
  const descriptor = openSync(output,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(descriptor);
  } finally { closeSync(descriptor); }
  return output;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const input = { sourceDirectory: resolved(options["--source-dir"], "SOURCE_DIR") };
  if (options.action === "build") {
    const buildStartedAt = new Date().toISOString();
    const artifact = buildInstitutionalCapitalClaimsEvidenceFromSource(input,
      { generatedAt: buildStartedAt });
    const verification = verifyInstitutionalCapitalClaimsEvidenceAgainstSource(artifact, input);
    if (!verification.ok || !verification.sourceArtifactsReverified) fail("BUILD_VERIFY_FAILED");
    const output = writeNoClobber(options["--out"], artifact);
    const canonicalVerification =
      verifyInstitutionalCapitalClaimsEvidenceCanonicalFile(output, input);
    if (!canonicalVerification.ok
      || canonicalVerification.canonicalArtifactStableRead !== true
      || canonicalVerification.canonicalGeneratedAtNoLaterThanStableFileMtime !== true) {
      fail("BUILD_CANONICAL_FILE_VERIFY_FAILED");
    }
    process.stdout.write(`${JSON.stringify({
      ok: true, output, artifactHash: artifact.artifactHash,
      buildStartedAt,
      diagnosticCommitmentHash: artifact.diagnosticCommitmentHash,
      gapSourceMatrixHash: artifact.gapSourceMatrixHash,
      sourceSetHash: artifact.sourceManifest.sourceSetHash,
      sourceObjects: artifact.sourceManifest.sourceObjects.length,
      sourceBytes: artifact.sourceManifest.sourceBytes,
      failureRows: artifact.diagnostics.fdicFailures.endpointAccounting.publishedRows,
      dividendRows: artifact.diagnostics.fdicReceivershipDividends.endpointAccounting.publishedRows,
      readinessGaps: artifact.gapSourceMatrix.totalGaps,
      externalGapsClosed: 0,
      verificationLevel: canonicalVerification.verificationLevel,
      productionReady: false,
    }, null, 2)}\n`);
  } else {
    const artifactPath = resolved(options["--artifact"], "ARTIFACT");
    const verification = verifyInstitutionalCapitalClaimsEvidenceCanonicalFile(
      artifactPath, input);
    process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
    if (!verification.ok || !verification.sourceArtifactsReverified) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
