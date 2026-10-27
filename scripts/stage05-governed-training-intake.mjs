#!/usr/bin/env node

import {
  closeSync, constants, fstatSync, fsyncSync, mkdirSync, openSync,
  readFileSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  buildStage05GovernedTrainingIntakeDiagnostic,
  verifyStage05GovernedTrainingIntakeAgainstSources,
  verifyStage05GovernedTrainingIntakeCanonicalStructure,
} from "../src/outsider-stage05-governed-training-intake.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/stage05-governed-training-intake.mjs build --artifacts-root <artifacts> --out <diagnostic.json>",
    "  node scripts/stage05-governed-training-intake.mjs verify --artifact <diagnostic.json> --artifacts-root <artifacts>",
    "  node scripts/stage05-governed-training-intake.mjs verify-canonical --artifact <canonical.json>",
    "",
    "This command audits first-party Stage 0.5 completed-run sidecars.",
    "It does not train, import Wave5 rows, emit raw sources, or grant pricing.",
  ].join("\n");
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const action = argv[0];
  if (!["build", "verify", "verify-canonical"].includes(action)) {
    throw new Error("STAGE05_GOVERNED_INTAKE_CLI_ACTION_INVALID");
  }
  const allowed = new Set(["--artifact", "--artifacts-root", "--out"]);
  const options = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith("--")) {
      throw new Error(`STAGE05_GOVERNED_INTAKE_CLI_ARGUMENT_INVALID:${key ?? "missing"}`);
    }
    if (Object.hasOwn(options, key)) {
      throw new Error(`STAGE05_GOVERNED_INTAKE_CLI_ARGUMENT_DUPLICATE:${key}`);
    }
    options[key] = value;
  }
  if (action === "build" && (!options["--artifacts-root"] || !options["--out"])) {
    throw new Error("STAGE05_GOVERNED_INTAKE_CLI_BUILD_ARGUMENT_REQUIRED");
  }
  if (action === "verify"
    && (!options["--artifact"] || !options["--artifacts-root"])) {
    throw new Error("STAGE05_GOVERNED_INTAKE_CLI_VERIFY_ARGUMENT_REQUIRED");
  }
  if (action === "verify-canonical" && !options["--artifact"]) {
    throw new Error("STAGE05_GOVERNED_INTAKE_CLI_ARTIFACT_REQUIRED");
  }
  if (action === "build" && options["--artifact"]
    || action !== "build" && options["--out"]
    || action === "verify-canonical" && options["--artifacts-root"]) {
    throw new Error("STAGE05_GOVERNED_INTAKE_CLI_ARGUMENT_NOT_ALLOWED");
  }
  return options;
}

function resolved(value, code) {
  const target = path.resolve(value);
  if (target === path.parse(target).root) throw new Error(`${code}_TOO_BROAD`);
  return target;
}

function stableRead(filePath, maximumBytes = 8 * 1024 * 1024) {
  const descriptor = openSync(filePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n
      || before.size > BigInt(maximumBytes)) {
      throw new Error("STAGE05_GOVERNED_INTAKE_CLI_ARTIFACT_SIZE_INVALID");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || BigInt(bytes.length) !== after.size) {
      throw new Error("STAGE05_GOVERNED_INTAKE_CLI_ARTIFACT_CHANGED");
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function writeNoClobber(filePath, artifact) {
  const output = resolved(filePath, "STAGE05_GOVERNED_INTAKE_CLI_OUTPUT");
  mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const descriptor = openSync(output, constants.O_WRONLY | constants.O_CREAT
    | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  return output;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  if (options.action === "build") {
    const artifact = buildStage05GovernedTrainingIntakeDiagnostic({
      artifactsRootPath: resolved(options["--artifacts-root"],
        "STAGE05_GOVERNED_INTAKE_CLI_ARTIFACTS_ROOT"),
    });
    const output = writeNoClobber(options["--out"], artifact);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      output,
      artifactHash: artifact.artifactHash,
      candidatesDiscovered: artifact.sourceSet.candidatesDiscovered,
      sourceRunsReplayed:
        artifact.verificationAccounting.fullStage05RunDirectoryReplayed,
      sealedCausalOutcomes:
        artifact.verificationAccounting.sourceReplayedSealedCausalOutcome,
      completeFeatureVectors:
        artifact.admissionAccounting.completeGovernedTrainerFeatureVectors,
      explicitTrainingRights:
        artifact.admissionAccounting.explicitOwnerControlledTrainingRights,
      explicitPreActionSnapshots:
        artifact.admissionAccounting.explicitFrozenPreActionFeatureSnapshots,
      knownRootConnectedComponents:
        artifact.dependenceAccounting.knownRootConnectedComponents,
      admissibleRows:
        artifact.admissionAccounting.allRequiredGatesSatisfiedRows,
      governedTrainerInvoked:
        artifact.admissibilityConclusion.governedTrainerInvoked,
      targetQuotedPrice: artifact.targetBoundary.targetQuotedPrice,
      pricePermission: artifact.targetBoundary.pricePermission,
    }, null, 2)}\n`);
  } else if (options.action === "verify") {
    const artifact = JSON.parse(stableRead(resolved(options["--artifact"],
      "STAGE05_GOVERNED_INTAKE_CLI_ARTIFACT")).toString("utf8"));
    const checked = verifyStage05GovernedTrainingIntakeAgainstSources(artifact, {
      artifactsRootPath: resolved(options["--artifacts-root"],
        "STAGE05_GOVERNED_INTAKE_CLI_ARTIFACTS_ROOT"),
    });
    process.stdout.write(`${JSON.stringify(checked, null, 2)}\n`);
    if (!checked.ok) process.exitCode = 1;
  } else {
    const checked = verifyStage05GovernedTrainingIntakeCanonicalStructure(
      resolved(options["--artifact"], "STAGE05_GOVERNED_INTAKE_CLI_ARTIFACT"),
    );
    process.stdout.write(`${JSON.stringify(checked, null, 2)}\n`);
    if (!checked.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
