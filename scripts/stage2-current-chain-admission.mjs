#!/usr/bin/env node

/*
 * Freeze the source-only Stage 2 current-chain admission contract.
 *
 * This command has no quote/frontier input. It fully replays the pinned
 * catalog/flywheel/math/architecture source chain, then writes the single
 * fixed canonical path with exclusive directory and file creation.
 */

import { createHash } from "node:crypto";
import {
  existsSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync,
  closeSync, readFileSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildStage2CurrentChainAdmissionContract,
  buildStage2CurrentChainAdmissionContractCandidate,
  STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL,
  STAGE2_CURRENT_CHAIN_PINS,
  verifyStage2CurrentChainAdmissionContractStructure,
} from "../src/outsider-stage2-current-chain-admission.js";

function fail(code) {
  throw new Error(`STAGE2_CURRENT_CHAIN_CLI_${code}`);
}

function requireRealDirectory(directory, code) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code);
}

if (process.argv.length !== 3 || ![
  "freeze-contract", "freeze-candidate-v4",
].includes(process.argv[2])) {
  process.stderr.write(
    "usage: node scripts/stage2-current-chain-admission.mjs "
      + "<freeze-contract|freeze-candidate-v4>\n",
  );
  process.exitCode = 1;
} else {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), "..",
  );
  process.chdir(repositoryRoot);
  const output = path.resolve(
    repositoryRoot,
    STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.repositoryRelativePath,
  );
  const releaseDirectory = path.dirname(output);
  const artifactDirectory = path.dirname(releaseDirectory);
  const artifactsRoot = path.dirname(artifactDirectory);
  if (existsSync(output) || existsSync(releaseDirectory)) {
    fail("CANONICAL_RELEASE_ALREADY_EXISTS_NO_CLOBBER");
  }
  requireRealDirectory(repositoryRoot, "REPOSITORY_ROOT_INVALID");
  requireRealDirectory(artifactsRoot, "ARTIFACTS_ROOT_INVALID");
  if (!existsSync(artifactDirectory)) mkdirSync(artifactDirectory, { mode: 0o700 });
  requireRealDirectory(artifactDirectory, "ARTIFACT_DIRECTORY_INVALID");

  const buildStartedAt = new Date().toISOString();
  const sourceProfile = JSON.parse(readFileSync(
    "artifacts/actuarial-model-evolution-20260828/source-profile-v11.json", "utf8",
  ));
  const sourceInput = {
    mathArtifactPath: path.resolve(
      STAGE2_CURRENT_CHAIN_PINS.math.repositoryRelativePath,
    ),
    architectureArtifactPath: path.resolve(
      STAGE2_CURRENT_CHAIN_PINS.architecture.repositoryRelativePath,
    ),
    mathSources: sourceProfile,
  };
  const candidateOnly = process.argv[2] === "freeze-candidate-v4";
  const contract = candidateOnly
    ? await buildStage2CurrentChainAdmissionContractCandidate(sourceInput, {
        generatedAt: buildStartedAt,
      })
    : await buildStage2CurrentChainAdmissionContract(sourceInput);
  const structural = candidateOnly
    ? null : verifyStage2CurrentChainAdmissionContractStructure(contract);
  if (!candidateOnly && !structural.ok) fail("BUILT_CONTRACT_INVALID");
  if (Date.parse(contract.generatedAt) > Date.parse(buildStartedAt)) {
    fail("GENERATED_AT_AFTER_BUILD_START");
  }
  const bytes = Buffer.from(`${JSON.stringify(contract, null, 2)}\n`, "utf8");

  const temporary = path.resolve(artifactDirectory,
    `.stage2-current-chain-${process.pid}-${Date.now()}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    const published = fstatSync(descriptor, { bigint: true });
    if (!published.isFile() || published.size !== BigInt(bytes.length)) {
      fail("PUBLISHED_ARTIFACT_IDENTITY_INVALID");
    }
    if (BigInt(Date.parse(contract.generatedAt)) * 1_000_000n
      > published.mtimeNs) {
      fail("GENERATED_AT_AFTER_ARTIFACT_MTIME");
    }
    closeSync(descriptor); descriptor = undefined;
    mkdirSync(releaseDirectory, { mode: 0o700 });
    linkSync(temporary, output);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch {}
  }
  const fileHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  process.stdout.write(`${JSON.stringify({
    schema: contract.schema,
    canonicalRelease:
      STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.canonicalRelease,
    repositoryRelativePath:
      STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.repositoryRelativePath,
    contractHash: contract.contractHash,
    artifactFileHash: fileHash,
    artifactFileBytes: bytes.length,
    buildStartedAt,
    candidateOnly,
    canonicalRoutingEligible: !candidateOnly,
    readinessStatus: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
    pinnedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    temporalQuarantineReferenceFactorCount: 40,
    temporallyOrderedReceiptReferenceFactorCount: 62,
    factorsAdmittedForCurrentCoverage: 0,
    factorsAdmittedForCurrentRouting: 0,
    targetPreActionRowsAdmitted: 0,
    PRICE: null,
    capital: null,
    readyToBearResponsibility: false,
    operationalAuthorityGranted: false,
  }, null, 2)}\n`);
}
