#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildRmaCropInsuranceExperience,
  RMA_SOB_COVERAGE_FROZEN_SOURCE_2024,
  verifyRmaCropInsuranceExperienceWithSource,
} from "../src/outsider-rma-crop-insurance-experience.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/stage234-rma-crop-insurance-experience.mjs build --zip <official.zip> --layout <official.pdf> --out <artifact.json> [--generated-at <ISO>]",
    "  node scripts/stage234-rma-crop-insurance-experience.mjs verify --artifact <artifact.json> --zip <official.zip> --layout <official.pdf>",
    "",
    "The command is offline. It does not download data and never emits a price.",
  ].join("\n");
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const action = argv[0];
  if (!["build", "verify"].includes(action)) throw new Error("RMA_CLI_ACTION_INVALID");
  const allowed = new Set(["--zip", "--layout", "--out", "--artifact", "--generated-at"]);
  const values = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith("--")) {
      throw new Error(`RMA_CLI_ARGUMENT_INVALID:${key ?? "missing"}`);
    }
    if (Object.hasOwn(values, key)) throw new Error(`RMA_CLI_ARGUMENT_DUPLICATE:${key}`);
    values[key] = value;
  }
  for (const key of ["--zip", "--layout"]) {
    if (!values[key]) throw new Error(`RMA_CLI_ARGUMENT_REQUIRED:${key}`);
  }
  if (action === "build" && !values["--out"]) {
    throw new Error("RMA_CLI_ARGUMENT_REQUIRED:--out");
  }
  if (action === "verify" && !values["--artifact"]) {
    throw new Error("RMA_CLI_ARGUMENT_REQUIRED:--artifact");
  }
  if (action === "build" && values["--artifact"]
    || action === "verify" && (values["--out"] || values["--generated-at"])) {
    throw new Error("RMA_CLI_ARGUMENT_NOT_ALLOWED_FOR_ACTION");
  }
  return values;
}

function resolved(value, code) {
  const target = path.resolve(value);
  if (target === path.parse(target).root) throw new Error(`${code}_TOO_BROAD`);
  return target;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const zipPath = resolved(options["--zip"], "RMA_CLI_ZIP_PATH");
  const layoutPath = resolved(options["--layout"], "RMA_CLI_LAYOUT_PATH");
  const zip = readFileSync(zipPath);
  const layout = readFileSync(layoutPath);
  if (options.action === "build") {
    const artifact = buildRmaCropInsuranceExperience(zip, layout, {
      sourceObjectHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectHash,
      recordLayoutHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutHash,
      generatedAt: options["--generated-at"]
        ?? RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.frozenAt,
    });
    if (!artifact.source.officialFrozenSourceVerified) {
      throw new Error("RMA_CLI_OFFICIAL_FROZEN_SOURCE_NOT_VERIFIED");
    }
    const output = resolved(options["--out"], "RMA_CLI_OUTPUT_PATH");
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, {
      flag: "wx", mode: 0o600,
    });
    process.stdout.write(`${JSON.stringify({ ok: true, output,
      artifactHash: artifact.artifactHash, source: artifact.source,
      accounting: artifact.accounting, national: artifact.national,
      sourceDomainCalibration: artifact.sourceDomainCalibration,
      outsiderModelEntrance: artifact.outsiderModelEntrance }, null, 2)}\n`);
  } else {
    const artifactPath = resolved(options["--artifact"], "RMA_CLI_ARTIFACT_PATH");
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    const checked = verifyRmaCropInsuranceExperienceWithSource(artifact, zip, layout);
    process.stdout.write(`${JSON.stringify(checked, null, 2)}\n`);
    if (!checked.ok || !checked.officialFrozenSourceVerified) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
