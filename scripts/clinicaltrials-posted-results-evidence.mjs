#!/usr/bin/env node

import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, mkdirSync,
  openSync, readFileSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  buildClinicalTrialsPostedResultsEvidenceFromSourceDirectory,
  verifyClinicalTrialsPostedResultsEvidence,
  verifyClinicalTrialsPostedResultsEvidenceWithSource,
} from "../src/outsider-clinicaltrials-posted-results-evidence.js";

const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
function usage() {
  return [
    "Usage:",
    "  node scripts/clinicaltrials-posted-results-evidence.mjs build --source <dir> --out <artifact.json>",
    "  node scripts/clinicaltrials-posted-results-evidence.mjs verify --artifact <artifact.json>",
    "  node scripts/clinicaltrials-posted-results-evidence.mjs verify-source --artifact <artifact.json> --source <dir>",
    "",
    "The lane preserves real sponsor-posted aggregate records; it does not infer causality, independent adjudication, target transfer, training rights, PRICE, or authority.",
  ].join("\n");
}
function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const action = argv[0];
  if (!["build", "verify", "verify-source"].includes(action)) {
    throw new Error("CLINICALTRIALS_CLI_ACTION_INVALID");
  }
  const allowed = new Set(["--source", "--out", "--artifact"]);
  const values = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!allowed.has(flag) || !value || value.startsWith("--") || Object.hasOwn(values, flag)) {
      throw new Error(`CLINICALTRIALS_CLI_ARGUMENT_INVALID:${flag ?? "missing"}`);
    }
    const resolved = path.resolve(value);
    if (resolved === path.parse(resolved).root) throw new Error("CLINICALTRIALS_CLI_PATH_TOO_BROAD");
    values[flag] = resolved;
  }
  if (action === "build" && (!values["--source"] || !values["--out"] || values["--artifact"])
    || action === "verify" && (!values["--artifact"] || values["--source"] || values["--out"])
    || action === "verify-source" && (!values["--artifact"] || !values["--source"] || values["--out"])) {
    throw new Error("CLINICALTRIALS_CLI_ARGUMENT_PROFILE_INVALID");
  }
  return values;
}
function stableReadJson(file) {
  const pathBefore = lstatSync(file, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.size <= 0n
    || pathBefore.size > BigInt(MAX_ARTIFACT_BYTES)) throw new Error("CLINICALTRIALS_CLI_ARTIFACT_UNSAFE");
  const fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const pathAfter = lstatSync(file, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathBefore[field]
        || before[field] !== pathAfter[field]) throw new Error("CLINICALTRIALS_CLI_ARTIFACT_CHANGED");
    }
    try { return JSON.parse(bytes.toString("utf8")); }
    catch { throw new Error("CLINICALTRIALS_CLI_ARTIFACT_JSON_INVALID"); }
  } finally { closeSync(fd); }
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${usage()}\n`); process.exit(0); }
  if (options.action === "build") {
    const artifact = buildClinicalTrialsPostedResultsEvidenceFromSourceDirectory(options["--source"]);
    mkdirSync(path.dirname(options["--out"]), { recursive: true, mode: 0o700 });
    writeFileSync(options["--out"], `${JSON.stringify(artifact, null, 2)}\n`, {
      flag: "wx", mode: 0o600,
    });
    process.stdout.write(`${JSON.stringify({
      ok: true, out: options["--out"], artifactHash: artifact.artifactHash,
      observedStudyRecords: artifact.population.observedStudyRecords,
      admittedStudyRecords: artifact.calibrationReference.admittedStudyRecords,
      decision: artifact.calibrationReference.decision,
    }, null, 2)}\n`);
  } else {
    const artifact = stableReadJson(options["--artifact"]);
    const result = options.action === "verify"
      ? verifyClinicalTrialsPostedResultsEvidence(artifact)
      : verifyClinicalTrialsPostedResultsEvidenceWithSource(artifact, options["--source"]);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
  process.exitCode = 1;
}
