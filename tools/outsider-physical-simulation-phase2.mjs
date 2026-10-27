#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  createPhysicalSimulationPhase2Fixture,
} from "../src/outsider-physical-simulation-fixture.js";
import {
  createPhysicalSimulationPhase2Report,
  verifyPhysicalSimulationPhase2Report,
} from "../src/outsider-physical-simulation-phase2.js";

function usage() {
  return [
    "Usage: node tools/outsider-physical-simulation-phase2.mjs [--report] [--output ABSOLUTE_PATH]",
    "",
    "Builds only Outsider's deterministic synthetic Phase 2 conformance fixture.",
    "It does not run Harness/LIBERO, access a robot, use a network, or establish safety.",
    "--report writes the full canonical report to stdout; default stdout is a summary.",
    "--output writes the full report once with mode 0600 and refuses overwrite/symlinks.",
  ].join("\n");
}

function parseArgs(argv) {
  const parsed = { report: false, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--report") parsed.report = true;
    else if (arg === "--output") {
      if (parsed.output !== null || typeof argv[index + 1] !== "string") {
        throw new Error("PHYSICAL_SIMULATION_PHASE2_CLI_OUTPUT_INVALID");
      }
      parsed.output = argv[index + 1];
      index += 1;
    } else throw new Error("PHYSICAL_SIMULATION_PHASE2_CLI_ARGUMENT_INVALID");
  }
  return parsed;
}

function writeOnce0600(path, bytes) {
  if (!isAbsolute(path)) throw new Error("PHYSICAL_SIMULATION_PHASE2_CLI_OUTPUT_NOT_ABSOLUTE");
  const parent = dirname(path);
  const parentStat = lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()
    || realpathSync(parent) !== parent) {
    throw new Error("PHYSICAL_SIMULATION_PHASE2_CLI_OUTPUT_PARENT_UNSAFE");
  }
  const noFollow = constants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow)) {
    throw new Error("PHYSICAL_SIMULATION_PHASE2_CLI_NOFOLLOW_UNAVAILABLE");
  }
  const fd = openSync(path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow, 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function summary(report, fileSha256 = null, outputPath = null) {
  return {
    ok: true,
    artifactClass: report.artifactClass,
    reportHash: report.reportHash,
    fileSha256,
    outputPath,
    frozenRolloutSlots: report.metrics.denominator.frozenRolloutSlots,
    materializedRolloutRows: report.metrics.denominator.materializedRolloutRows,
    cohort: {
      accepted: report.metrics.denominator.accepted,
      rejected: report.metrics.denominator.rejected,
      missing: report.metrics.denominator.missing,
      retriesInCanonicallyAdmittedTraces:
        report.metrics.denominator.retriesInCanonicallyAdmittedTraces,
      terminalFailuresInCanonicallyAdmittedTraces:
        report.metrics.denominator.terminalFailuresInCanonicallyAdmittedTraces,
      abandonedInCanonicallyAdmittedTraces:
        report.metrics.denominator.abandonedInCanonicallyAdmittedTraces,
      budgetExhaustedInCanonicallyAdmittedTraces:
        report.metrics.denominator.budgetExhaustedInCanonicallyAdmittedTraces,
      unresolvedRows: report.metrics.denominator.unresolvedRows,
      rejectedOrMissingAttemptCountsKnownComplete:
        report.metrics.denominator
          .primitiveAttemptDenominatorCompleteForRejectedOrMissingRows,
    },
    injectedFaults: report.evidence.faultReport.summary,
    releaseSignals: {
      definedSyntheticDeclaredPins: report.metrics.releaseIntegrity.definedSignals,
      syntheticDeclaredPinMismatchesDetected:
        report.metrics.releaseIntegrity.detectedSignals,
      independentReleasePrecommitEstablished: false,
      runtimeReleaseAttestationEstablished: false,
    },
    physicalFaultRatesEstablished: false,
    physicalSafetyEstablished: false,
    successClaimAuthorized: false,
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const fixture = createPhysicalSimulationPhase2Fixture();
  const report = createPhysicalSimulationPhase2Report(fixture);
  const verified = verifyPhysicalSimulationPhase2Report(report, fixture);
  if (!verified.ok) throw new Error("PHYSICAL_SIMULATION_PHASE2_CLI_REPLAY_INVALID");
  const bytes = Buffer.from(`${canonicalizeStrict(report)}\n`, "utf8");
  const fileSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (args.output !== null) writeOnce0600(args.output, bytes);
  if (args.report) process.stdout.write(bytes);
  else process.stdout.write(`${canonicalizeStrict(summary(report,
    args.output === null ? null : fileSha256, args.output))}\n`);
} catch (error) {
  process.stderr.write(`${String(error?.message ?? error)}\n`);
  process.exit(2);
}
