#!/usr/bin/env node

import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  buildRealLossCalibrationShadow,
  verifyRealLossCalibrationShadowWithSource,
} from "../src/outsider-real-loss-calibration-shadow.js";
import {
  CAS_SCHEDULE_P_FROZEN_FILES,
} from "../src/outsider-cas-schedule-p-reserve-calibration.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/real-loss-calibration-shadow.mjs build --rma-zip <official.zip> --rma-layout <official.pdf> --cas-dir <six-csv-directory> --cas-page <official-page.html> --out <artifact.json> [--generated-at <ISO>]",
    "  node scripts/real-loss-calibration-shadow.mjs verify --artifact <artifact.json> --rma-zip <official.zip> --rma-layout <official.pdf> --cas-dir <six-csv-directory> --cas-page <official-page.html>",
    "",
    "Offline only. The command rebuilds and full-source verifies both frozen lanes.",
    "It emits source-domain diagnostics, never an AI/robot prior, price, reserve, or authority.",
  ].join("\n");
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const action = argv[0];
  if (!new Set(["build", "verify"]).has(action)) {
    throw new Error("REAL_LOSS_CLI_ACTION_INVALID");
  }
  const allowed = new Set(["--rma-zip", "--rma-layout", "--cas-dir", "--cas-page",
    "--out", "--artifact", "--generated-at"]);
  const options = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith("--")) {
      throw new Error(`REAL_LOSS_CLI_ARGUMENT_INVALID:${key ?? "missing"}`);
    }
    if (Object.hasOwn(options, key)) {
      throw new Error(`REAL_LOSS_CLI_ARGUMENT_DUPLICATE:${key}`);
    }
    options[key] = value;
  }
  for (const key of ["--rma-zip", "--rma-layout", "--cas-dir", "--cas-page"]) {
    if (!options[key]) throw new Error(`REAL_LOSS_CLI_ARGUMENT_REQUIRED:${key}`);
  }
  if (action === "build" && !options["--out"]) {
    throw new Error("REAL_LOSS_CLI_ARGUMENT_REQUIRED:--out");
  }
  if (action === "verify" && !options["--artifact"]) {
    throw new Error("REAL_LOSS_CLI_ARGUMENT_REQUIRED:--artifact");
  }
  if ((action === "build" && options["--artifact"])
    || (action === "verify" && (options["--out"] || options["--generated-at"]))) {
    throw new Error("REAL_LOSS_CLI_ARGUMENT_NOT_ALLOWED_FOR_ACTION");
  }
  return options;
}

function resolved(value, code) {
  const target = path.resolve(value);
  if (target === path.parse(target).root) throw new Error(`${code}_TOO_BROAD`);
  return target;
}

function readStableFile(filePath, code) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const descriptor = openSync(filePath, constants.O_RDONLY | noFollow);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n) throw new Error(`${code}_NOT_REGULAR_FILE`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || BigInt(bytes.length) !== after.size) {
      throw new Error(`${code}_CHANGED_DURING_READ`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function readSources(options) {
  const casDirectory = resolved(options["--cas-dir"], "REAL_LOSS_CLI_CAS_DIR");
  return {
    rmaZipBytes: readStableFile(
      resolved(options["--rma-zip"], "REAL_LOSS_CLI_RMA_ZIP"),
      "REAL_LOSS_CLI_RMA_ZIP",
    ),
    rmaRecordLayoutBytes: readStableFile(
      resolved(options["--rma-layout"], "REAL_LOSS_CLI_RMA_LAYOUT"),
      "REAL_LOSS_CLI_RMA_LAYOUT",
    ),
    casSourceFiles: Object.fromEntries(CAS_SCHEDULE_P_FROZEN_FILES.map((source) => (
      [source.fileName, readStableFile(
        path.join(casDirectory, source.fileName),
        `REAL_LOSS_CLI_CAS_${source.lineCode}`,
      )]
    ))),
    casSourcePageBytes: readStableFile(
      resolved(options["--cas-page"], "REAL_LOSS_CLI_CAS_PAGE"),
      "REAL_LOSS_CLI_CAS_PAGE",
    ),
  };
}

function writeNoClobber(filePath, value) {
  const output = resolved(filePath, "REAL_LOSS_CLI_OUTPUT");
  mkdirSync(path.dirname(output), { recursive: true });
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const descriptor = openSync(output,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
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
  const sources = readSources(options);
  if (options.action === "build") {
    const artifact = buildRealLossCalibrationShadow(sources, options["--generated-at"]
      ? { generatedAt: options["--generated-at"] } : {});
    const output = writeNoClobber(options["--out"], artifact);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      output,
      artifactHash: artifact.artifactHash,
      diagnosticCommitmentHash: artifact.diagnosticCommitmentHash,
      sourceReplay: artifact.sourceReplay,
      rma: artifact.diagnostics.rma,
      cas: {
        sourceDomain: artifact.diagnostics.cas.sourceDomain,
        accounting: artifact.diagnostics.cas.accounting,
        lineOrder: artifact.diagnostics.cas.lineOrder,
        aggregateAcrossLineBacktest:
          artifact.diagnostics.cas.aggregateAcrossLineBacktest,
      },
      outputBoundary: artifact.outputBoundary,
    }, null, 2)}\n`);
  } else {
    const artifactPath = resolved(
      options["--artifact"], "REAL_LOSS_CLI_ARTIFACT");
    const artifact = JSON.parse(readStableFile(
      artifactPath, "REAL_LOSS_CLI_ARTIFACT").toString("utf8"));
    const verification = verifyRealLossCalibrationShadowWithSource(artifact, sources);
    process.stdout.write(`${JSON.stringify(verification, null, 2)}\n`);
    if (!verification.ok || !verification.sourceArtifactsReverified) {
      process.exitCode = 1;
    }
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
