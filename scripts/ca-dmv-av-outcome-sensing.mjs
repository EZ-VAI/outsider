#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildCaDmvAvOutcomeSensingFromSourceDirectory,
  verifyCaDmvAvOutcomeSensingWithSource,
} from "../src/outsider-ca-dmv-av-outcome-sensing.js";

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const action = argv[0];
  if (!["build", "verify"].includes(action)) throw new Error("CA_DMV_AV_CLI_ACTION_INVALID");
  const allowed = new Set(["--source-dir", "--out", "--artifact", "--generated-at"]);
  const values = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!allowed.has(key) || !value || value.startsWith("--") || Object.hasOwn(values, key)) {
      throw new Error(`CA_DMV_AV_CLI_ARGUMENT_INVALID:${key ?? "missing"}`);
    }
    values[key] = value;
  }
  if (!values["--source-dir"]) throw new Error("CA_DMV_AV_CLI_SOURCE_DIR_REQUIRED");
  if (action === "build" && !values["--out"]) throw new Error("CA_DMV_AV_CLI_OUT_REQUIRED");
  if (action === "verify" && !values["--artifact"]) throw new Error("CA_DMV_AV_CLI_ARTIFACT_REQUIRED");
  if (action === "build" && values["--artifact"]
    || action === "verify" && (values["--out"] || values["--generated-at"])) {
    throw new Error("CA_DMV_AV_CLI_ARGUMENT_NOT_ALLOWED");
  }
  return values;
}

function resolved(value, code) {
  const target = path.resolve(value);
  if (target === path.parse(target).root) throw new Error(`${code}_TOO_BROAD`);
  return target;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/ca-dmv-av-outcome-sensing.mjs build --source-dir <dir> --out <artifact.json> [--generated-at <ISO>]",
    "  node scripts/ca-dmv-av-outcome-sensing.mjs verify --artifact <artifact.json> --source-dir <dir>",
    "",
    "Offline after acquisition. Keeps legacy and 2026 reporting regimes separate.",
  ].join("\n");
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${usage()}\n`); process.exit(0); }
  const sourceDirectory = resolved(options["--source-dir"], "CA_DMV_AV_CLI_SOURCE_DIR");
  if (options.action === "build") {
    const artifact = buildCaDmvAvOutcomeSensingFromSourceDirectory(sourceDirectory,
      options["--generated-at"] ? { generatedAt: options["--generated-at"] } : {});
    if (!artifact.source.profileMatchedAtBuild) throw new Error("CA_DMV_AV_CLI_OFFICIAL_PROFILE_REQUIRED");
    const out = resolved(options["--out"], "CA_DMV_AV_CLI_OUT");
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ ok: true, out, artifactHash: artifact.artifactHash,
      permitCounts: { drivered: artifact.permitSnapshot.drivered.count,
        driverless: artifact.permitSnapshot.driverless.count,
        deployment: artifact.permitSnapshot.deployment.count },
      fixedCollisionCases: artifact.collisionCases.cases.length,
      admission: artifact.admission }, null, 2)}\n`);
  } else {
    const artifact = JSON.parse(readFileSync(resolved(options["--artifact"],
      "CA_DMV_AV_CLI_ARTIFACT"), "utf8"));
    const result = verifyCaDmvAvOutcomeSensingWithSource(artifact, sourceDirectory);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
