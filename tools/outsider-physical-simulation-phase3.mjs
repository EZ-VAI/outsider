#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import { LIBERO_MAX_SOURCE_BYTES } from "../src/outsider-libero-ingress.js";
import {
  preparePhysicalSimulationPhase3Evidence,
} from "../src/outsider-physical-simulation-phase3-fixture.js";
import {
  createPhysicalSimulationPhase3Report,
  verifyPhysicalSimulationPhase3Report,
} from "../src/outsider-physical-simulation-phase3.js";

const REQUIRED = Object.freeze([
  "--state-root", "--libero-projection-input", "--task-map-input",
  "--benchmark-input", "--readme-input", "--license-input", "--output",
]);
const OPTIONAL_VALUE = Object.freeze(["--trusted-pin-input"]);
const OPTIONAL_FLAG = Object.freeze(["--report"]);
const MAX_PROJECTION_BYTES = 4 * 1024 * 1024;
const MAX_PIN_BYTES = 256 * 1024;

function usage() {
  return [
    "Usage: node tools/outsider-physical-simulation-phase3.mjs \\",
    "  --state-root ABSOLUTE_PRIVATE_DIRECTORY \\",
    "  --libero-projection-input ABSOLUTE_PATH \\",
    "  --task-map-input ABSOLUTE_PATH --benchmark-input ABSOLUTE_PATH \\",
    "  --readme-input ABSOLUTE_PATH --license-input ABSOLUTE_PATH \\",
    "  --output ABSOLUTE_PATH [--trusted-pin-input ABSOLUTE_PATH] [--report]",
    "",
    "Registers the exact 20-slot synthetic cohort before trace materialization,",
    "closes every slot conservatively, replays the LIBERO manifest projection,",
    "and writes one 0600 report without overwrite. It runs no benchmark or robot.",
  ].join("\n");
}

function options(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) return { help: true };
  const values = Object.create(null);
  let report = false;
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (OPTIONAL_FLAG.includes(key)) {
      if (report) throw new Error("PHYSICAL_SIMULATION_PHASE3_CLI_ARGUMENTS_INVALID");
      report = true;
      continue;
    }
    if (![...REQUIRED, ...OPTIONAL_VALUE].includes(key) || Object.hasOwn(values, key)) {
      throw new Error("PHYSICAL_SIMULATION_PHASE3_CLI_ARGUMENTS_INVALID");
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      throw new Error("PHYSICAL_SIMULATION_PHASE3_CLI_ARGUMENTS_INVALID");
    }
    values[key] = value;
    index += 1;
  }
  if (!REQUIRED.every((key) => Object.hasOwn(values, key))) {
    throw new Error("PHYSICAL_SIMULATION_PHASE3_CLI_ARGUMENTS_INVALID");
  }
  for (const key of [...REQUIRED, ...OPTIONAL_VALUE]) {
    if (Object.hasOwn(values, key) && !isAbsolute(values[key])) {
      throw new Error("PHYSICAL_SIMULATION_PHASE3_CLI_PATH_NOT_ABSOLUTE");
    }
  }
  return { values, report };
}

function boundedStableRead(path, label, maximum) {
  if (!Number.isInteger(constants.O_NOFOLLOW)) {
    throw new Error("PHYSICAL_SIMULATION_PHASE3_CLI_NOFOLLOW_UNAVAILABLE");
  }
  let descriptor;
  try {
    try {
      descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch {
      throw new Error(`PHYSICAL_SIMULATION_PHASE3_CLI_${label}_INPUT_INVALID`);
    }
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(maximum)) {
      throw new Error(`PHYSICAL_SIMULATION_PHASE3_CLI_${label}_INPUT_INVALID`);
    }
    const output = Buffer.allocUnsafe(Number(before.size));
    let offset = 0;
    while (offset < output.length) {
      const count = readSync(descriptor, output, offset, output.length - offset, null);
      if (count === 0) {
        throw new Error(`PHYSICAL_SIMULATION_PHASE3_CLI_${label}_INPUT_CHANGED`);
      }
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, null) !== 0) {
      throw new Error(`PHYSICAL_SIMULATION_PHASE3_CLI_${label}_INPUT_CHANGED`);
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (after.dev !== before.dev || after.ino !== before.ino
      || after.size !== before.size || after.mtimeNs !== before.mtimeNs
      || after.ctimeNs !== before.ctimeNs) {
      throw new Error(`PHYSICAL_SIMULATION_PHASE3_CLI_${label}_INPUT_CHANGED`);
    }
    return output;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`PHYSICAL_SIMULATION_PHASE3_CLI_${label}_JSON_INVALID`);
  }
}

function assertOutputAvailable(path) {
  if (existsSync(path)) throw new Error("PHYSICAL_SIMULATION_PHASE3_CLI_OUTPUT_EXISTS");
  const parent = dirname(path);
  const stat = lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(parent) !== parent) {
    throw new Error("PHYSICAL_SIMULATION_PHASE3_CLI_OUTPUT_PARENT_UNSAFE");
  }
}

function exclusivePrivateWrite(path, bytes) {
  if (!Number.isInteger(constants.O_NOFOLLOW)) {
    throw new Error("PHYSICAL_SIMULATION_PHASE3_CLI_NOFOLLOW_UNAVAILABLE");
  }
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error) {
    if (descriptor === undefined) {
      throw new Error(`PHYSICAL_SIMULATION_PHASE3_CLI_OUTPUT_CREATE_INVALID:${
        error?.code ?? "UNKNOWN"}`);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function summary(report, fileSha256) {
  return {
    ok: true,
    artifactClass: report.artifactClass,
    reportHash: report.reportHash,
    fileSha256,
    outputCreated: true,
    census: report.metrics.census,
    syntheticTelemetryConformance: report.metrics.syntheticTelemetryConformance,
    publicManifest: report.metrics.publicManifest,
    testFixtureManifest: report.metrics.testFixtureManifest,
    publicManifestIntegrated: report.conclusions.publicManifestIntegrated,
    publicDatasetWasRun: false,
    publicDatasetOutcomeEstablished: false,
    realObservedAttemptDenominator:
      report.metrics.realExecutionObservability.observedAttemptDenominator,
    realWorldRatesAreNull: report.limitations.realWorldRatesAreNull,
    independentExternalPreselectionEstablished: false,
    runtimeReleaseAttestationEstablished: false,
    physicalSafetyEstablished: false,
    successClaimAuthorized: false,
  };
}

try {
  const parsed = options(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const args = parsed.values;
  assertOutputAvailable(args["--output"]);
  const liberoProjection = parseJson(boundedStableRead(
    args["--libero-projection-input"], "LIBERO_PROJECTION", MAX_PROJECTION_BYTES),
  "LIBERO_PROJECTION");
  const liberoReplayInput = {
    taskMapBytes: boundedStableRead(args["--task-map-input"], "TASK_MAP",
      LIBERO_MAX_SOURCE_BYTES),
    benchmarkBytes: boundedStableRead(args["--benchmark-input"], "BENCHMARK",
      LIBERO_MAX_SOURCE_BYTES),
    readmeBytes: boundedStableRead(args["--readme-input"], "README",
      LIBERO_MAX_SOURCE_BYTES),
    licenseBytes: boundedStableRead(args["--license-input"], "LICENSE",
      LIBERO_MAX_SOURCE_BYTES),
  };
  if (args["--trusted-pin-input"] !== undefined) {
    liberoReplayInput.trustedPin = parseJson(boundedStableRead(
      args["--trusted-pin-input"], "TRUSTED_PIN", MAX_PIN_BYTES), "TRUSTED_PIN");
  }
  const input = preparePhysicalSimulationPhase3Evidence({
    stateRoot: args["--state-root"],
    liberoProjection,
    liberoReplayInput,
  });
  const report = createPhysicalSimulationPhase3Report(input);
  const checked = verifyPhysicalSimulationPhase3Report(report, input);
  if (!checked.ok) {
    throw new Error(`PHYSICAL_SIMULATION_PHASE3_CLI_REPLAY_INVALID:${checked.error}`);
  }
  const bytes = Buffer.from(`${canonicalizeStrict(report)}\n`, "utf8");
  const fileSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  exclusivePrivateWrite(args["--output"], bytes);
  process.stdout.write(parsed.report ? bytes
    : `${canonicalizeStrict(summary(report, fileSha256))}\n`);
} catch (error) {
  process.stderr.write(`${String(error?.message ?? error)}\n`);
  process.exitCode = 2;
}
