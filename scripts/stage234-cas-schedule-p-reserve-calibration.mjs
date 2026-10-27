#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildCasSchedulePReserveCalibration,
  CAS_SCHEDULE_P_FROZEN_FILES,
  CAS_SCHEDULE_P_SOURCE_PAGE,
  verifyCasSchedulePReserveCalibrationWithSource,
} from "../src/outsider-cas-schedule-p-reserve-calibration.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/stage234-cas-schedule-p-reserve-calibration.mjs build --source-dir <six-csv-directory> --page <frozen-source-page.html> --out <artifact.json> [--generated-at <ISO>]",
    "  node scripts/stage234-cas-schedule-p-reserve-calibration.mjs verify --artifact <artifact.json> --source-dir <six-csv-directory> --page <frozen-source-page.html>",
    "",
    "The command is offline, requires the exact frozen CAS files, and never emits a price or reserve instruction.",
  ].join("\n");
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const action = argv[0];
  if (!["build", "verify"].includes(action)) throw new Error("CAS_CLI_ACTION_INVALID");
  const allowed = new Set(["--source-dir", "--page", "--out", "--artifact",
    "--generated-at"]);
  const values = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith("--")) {
      throw new Error(`CAS_CLI_ARGUMENT_INVALID:${key ?? "missing"}`);
    }
    if (Object.hasOwn(values, key)) throw new Error(`CAS_CLI_ARGUMENT_DUPLICATE:${key}`);
    values[key] = value;
  }
  for (const key of ["--source-dir", "--page"]) {
    if (!values[key]) throw new Error(`CAS_CLI_ARGUMENT_REQUIRED:${key}`);
  }
  if (action === "build" && !values["--out"]) {
    throw new Error("CAS_CLI_ARGUMENT_REQUIRED:--out");
  }
  if (action === "verify" && !values["--artifact"]) {
    throw new Error("CAS_CLI_ARGUMENT_REQUIRED:--artifact");
  }
  if (action === "build" && values["--artifact"]
    || action === "verify" && (values["--out"] || values["--generated-at"])) {
    throw new Error("CAS_CLI_ARGUMENT_NOT_ALLOWED_FOR_ACTION");
  }
  return values;
}

function resolved(value, code) {
  const target = path.resolve(value);
  if (target === path.parse(target).root) throw new Error(`${code}_TOO_BROAD`);
  return target;
}

function readSources(directory) {
  return Object.fromEntries(CAS_SCHEDULE_P_FROZEN_FILES.map((source) => [
    source.fileName, readFileSync(path.join(directory, source.fileName)),
  ]));
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const sourceDirectory = resolved(options["--source-dir"], "CAS_CLI_SOURCE_DIRECTORY");
  const pagePath = resolved(options["--page"], "CAS_CLI_SOURCE_PAGE_PATH");
  const sourceFiles = readSources(sourceDirectory);
  const sourcePage = readFileSync(pagePath);
  if (options.action === "build") {
    const artifact = buildCasSchedulePReserveCalibration(sourceFiles, sourcePage, {
      generatedAt: options["--generated-at"] ?? CAS_SCHEDULE_P_SOURCE_PAGE.accessedAt,
    });
    if (!artifact.source.officialFrozenSourceVerified
      || !artifact.source.sourceArtifactsReverified) {
      throw new Error("CAS_CLI_OFFICIAL_FROZEN_SOURCE_NOT_VERIFIED");
    }
    const output = resolved(options["--out"], "CAS_CLI_OUTPUT_PATH");
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, {
      flag: "wx", mode: 0o600,
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      output,
      artifactHash: artifact.artifactHash,
      source: artifact.source,
      accounting: artifact.accounting,
      aggregateHoldoutBacktest: artifact.aggregateHoldoutBacktest,
      sourceDomainCalibration: artifact.sourceDomainCalibration,
      outsiderModelEntrance: artifact.outsiderModelEntrance,
    }, null, 2)}\n`);
  } else {
    const artifactPath = resolved(options["--artifact"], "CAS_CLI_ARTIFACT_PATH");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    const checked = verifyCasSchedulePReserveCalibrationWithSource(
      artifact, sourceFiles, sourcePage);
    process.stdout.write(`${JSON.stringify(checked, null, 2)}\n`);
    if (!checked.ok || !checked.sourceArtifactsReverified) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
