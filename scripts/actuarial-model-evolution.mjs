#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, fstatSync, fsyncSync, linkSync, mkdirSync, openSync,
  readFileSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  ACTUARIAL_MODEL_EVOLUTION_GENERATED_AT,
  buildActuarialModelEvolutionCandidateFromSources,
  buildActuarialModelEvolutionFromSources,
  buildActuarialModelEvolutionProjection,
  describeActuarialModelEvolution,
  verifyActuarialModelEvolution,
  verifyActuarialModelEvolutionAgainstSources,
} from "../src/outsider-actuarial-model-evolution.js";

function fail(code) {
  throw new Error(`ACTUARIAL_MODEL_EVOLUTION_CLI_${code}`);
}

function usage() {
  return [
    "Usage:",
    "  node scripts/actuarial-model-evolution.mjs describe",
    "  node scripts/actuarial-model-evolution.mjs build-projection --out PATH",
    "  node scripts/actuarial-model-evolution.mjs verify-structure --artifact PATH",
    "  node scripts/actuarial-model-evolution.mjs build --math-artifact PATH --math-sources PATH --out PATH",
    "  node scripts/actuarial-model-evolution.mjs build-candidate-v11 --math-artifact PATH --math-sources PATH --out PATH",
    "  node scripts/actuarial-model-evolution.mjs verify --math-artifact PATH --math-sources PATH --artifact PATH",
    "",
    "--math-sources is a JSON object containing the exact path-only source profile accepted by the real-responsibility math source builder. It is routing input, not a caller assertion or verification receipt.",
    `The only accepted generated-at is ${ACTUARIAL_MODEL_EVOLUTION_GENERATED_AT}.`,
    "build-projection and verify-structure are explicitly structure-only. Full build/verify authenticates the frozen math canonical and rebuilds its complete source graph in the same invocation.",
  ].join("\n");
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const command = argv[0];
  if (!new Set(["describe", "build-projection", "verify-structure", "build",
    "build-candidate-v11", "verify"])
    .has(command)) fail("COMMAND_INVALID");
  const options = { command };
  const allowed = new Set(["--out", "--artifact", "--math-artifact", "--math-sources"]);
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!allowed.has(key) || typeof value !== "string" || value.length === 0
      || value.startsWith("--") || Object.hasOwn(options, key)) {
      fail(`ARGUMENT_INVALID:${key ?? "missing"}`);
    }
    options[key] = value;
  }
  if (command === "describe" && Object.keys(options).length !== 1) fail("DESCRIBE_ARGUMENTS");
  if (command === "build-projection" && (!options["--out"]
    || Object.keys(options).length !== 2)) fail("BUILD_PROJECTION_ARGUMENTS");
  if (command === "verify-structure" && (!options["--artifact"]
    || Object.keys(options).length !== 2)) fail("VERIFY_STRUCTURE_ARGUMENTS");
  if ((command === "build" || command === "build-candidate-v11")
    && (!options["--math-artifact"] || !options["--math-sources"]
    || !options["--out"] || Object.keys(options).length !== 4)) fail("BUILD_ARGUMENTS");
  if (command === "verify" && (!options["--math-artifact"] || !options["--math-sources"]
    || !options["--artifact"] || Object.keys(options).length !== 4)) fail("VERIFY_ARGUMENTS");
  return options;
}

function resolved(value, code) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) fail(code);
  const target = path.resolve(value);
  if (target === path.parse(target).root) fail(`${code}_TOO_BROAD`);
  return target;
}

function readJson(file, code, maximum = 32 * 1024 * 1024) {
  const target = resolved(file, code);
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 2n || before.size > BigInt(maximum)) fail(`${code}_FILE`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || bytes.length !== Number(before.size)) fail(`${code}_CHANGED`);
    try {
      const value = JSON.parse(bytes.toString("utf8"));
      if (code === "ARTIFACT" && (typeof value.generatedAt !== "string"
        || !Number.isFinite(Date.parse(value.generatedAt))
        || BigInt(Date.parse(value.generatedAt)) * 1_000_000n > before.mtimeNs)) {
        fail("ARTIFACT_GENERATED_AT_AFTER_FILE_MTIME");
      }
      return value;
    }
    catch (error) {
      if (error?.message?.includes("ARTIFACT_GENERATED_AT_AFTER_FILE_MTIME")) {
        throw error;
      }
      fail(`${code}_JSON`);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function publishExclusive(file, value, buildStartedAt) {
  const target = resolved(file, "OUTPUT_PATH");
  if (typeof value.generatedAt !== "string"
    || !Number.isFinite(Date.parse(value.generatedAt))
    || typeof buildStartedAt !== "string"
    || !Number.isFinite(Date.parse(buildStartedAt))
    || new Date(buildStartedAt).toISOString() !== buildStartedAt
    || Date.parse(buildStartedAt) > Date.now()
    || Date.parse(value.generatedAt) > Date.parse(buildStartedAt)) {
    fail("GENERATED_AT_AFTER_BUILD_START");
  }
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(target), 0o700);
  const temporary = path.join(path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
    const published = fstatSync(descriptor, { bigint: true });
    if (BigInt(Date.parse(value.generatedAt)) * 1_000_000n > published.mtimeNs) {
      fail("GENERATED_AT_AFTER_ARTIFACT_MTIME");
    }
    closeSync(descriptor); descriptor = undefined;
    linkSync(temporary, target);
  } catch (error) {
    if (error?.code === "EEXIST") fail("OUTPUT_EXISTS");
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch {}
  }
}

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.help) { console.log(usage()); return; }
  if (options.command === "describe") {
    console.log(JSON.stringify(describeActuarialModelEvolution(), null, 2));
    return;
  }
  if (options.command === "build-projection") {
    const buildStartedAt = new Date().toISOString();
    const artifact = buildActuarialModelEvolutionProjection();
    publishExclusive(options["--out"], artifact, buildStartedAt);
    console.log(JSON.stringify({ ok: true,
      verificationLevel: "STRUCTURE_ONLY_FIXED_PROJECTION_NO_SOURCE_AUTHENTICATION",
      artifactHash: artifact.artifactHash }));
    return;
  }
  const artifact = options["--artifact"]
    ? readJson(options["--artifact"], "ARTIFACT") : null;
  if (options.command === "verify-structure") {
    const receipt = verifyActuarialModelEvolution(artifact);
    console.log(JSON.stringify(receipt, null, 2));
    if (!receipt.ok) process.exitCode = 1;
    return;
  }
  const mathSources = readJson(options["--math-sources"], "MATH_SOURCES", 1024 * 1024);
  const sourceOptions = {
    mathArtifactPath: resolved(options["--math-artifact"], "MATH_ARTIFACT"),
    mathSources,
  };
  if (options.command === "build" || options.command === "build-candidate-v11") {
    const candidateBuild = options.command === "build-candidate-v11";
    const buildStartedAt = new Date().toISOString();
    const built = candidateBuild
      ? await buildActuarialModelEvolutionCandidateFromSources({
          ...sourceOptions, generatedAt: buildStartedAt,
        })
      : await buildActuarialModelEvolutionFromSources(sourceOptions);
    publishExclusive(options["--out"], built, buildStartedAt);
    const structure = candidateBuild ? null : verifyActuarialModelEvolution(built);
    const receipt = candidateBuild ? {
      ok: true,
      verificationLevel:
        "FULL_SOURCE_REPLAYED_REFERENCE_ARCHITECTURE_WITH_MATH_TEMPORAL_QUARANTINE_CANDIDATE_NOT_CANONICAL",
      candidateOnly: true,
      canonicalRoutingEligible: false,
      buildStartedAt,
      artifactHash: built.artifactHash,
      sourceArtifactsReverified: true,
      frozenMathExactlyRebuiltFromSources: true,
      readinessStatus: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
      pinnedReceiptCount: 16,
      temporallyOrderedCurrentReceiptCount: 9,
      temporalQuarantineReceiptCount: 7,
      temporalQuarantineReferenceFactorCount: 40,
      temporallyOrderedReceiptReferenceFactorCount: 62,
      factorsAdmittedForCurrentCoverage: 0,
      factorsAdmittedForCurrentRouting: 0,
      targetTrainingRowsAdmitted: 0,
      targetModelComponentsFitted: 0,
      operationalAuthorityGranted: false,
    } : structure.ok ? {
      ...structure,
      verificationLevel:
        "FULL_SOURCE_REPLAYED_REFERENCE_ARCHITECTURE_WITH_MATH_TEMPORAL_QUARANTINE_DURING_BUILD",
      sourceArtifactsReverified: true,
      frozenMathCanonicalStableRead: true,
      frozenMathCanonicalFileHashVerified: true,
      frozenMathExactlyRebuiltFromSources: true,
    } : structure;
    console.log(JSON.stringify(receipt, null, 2));
    if (!receipt.ok) process.exitCode = 1;
    return;
  }
  const receipt = await verifyActuarialModelEvolutionAgainstSources(artifact, sourceOptions);
  console.log(JSON.stringify(receipt, null, 2));
  if (!receipt.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
