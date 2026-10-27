#!/usr/bin/env node

import {
  closeSync, constants as fsConstants, fstatSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  buildNcuaPbgcMshaRealExperienceFromSourceDirectory,
  verifyNcuaPbgcMshaRealExperience,
  verifyNcuaPbgcMshaRealExperienceWithSource,
} from "../src/outsider-ncua-pbgc-msha-real-experience.js";

function fail(code) { throw new Error(`NCUA_PBGC_MSHA_CLI_${code}`); }
function usage() {
  return [
    "Usage:",
    "  node scripts/ncua-pbgc-msha-real-experience.mjs build --source-dir <dir> --out <artifact.json> [--generated-at <ISO>]",
    "  node scripts/ncua-pbgc-msha-real-experience.mjs verify --artifact <artifact.json>",
    "  node scripts/ncua-pbgc-msha-real-experience.mjs verify-source --artifact <artifact.json> --source-dir <dir>",
    "",
    "Standalone verify checks only the sealed structure. verify-source replays all 15 exact pinned official objects",
    "and exact-compares the rebuilt artifact. No command grants PRICE, GUARANTEE, SETTLE, TRAIN, or authority.",
  ].join("\n");
}
function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const action = argv[0];
  if (!new Set(["build", "verify", "verify-source"]).has(action)) fail("ACTION_INVALID");
  const allowed = new Set(["--source-dir", "--out", "--artifact", "--generated-at"]);
  const parsed = { action };
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || !value || value.startsWith("--") || Object.hasOwn(parsed, flag)) {
      fail("ARGUMENT_INVALID");
    }
    parsed[flag] = value;
  }
  if (action === "build") {
    if (!parsed["--source-dir"] || !parsed["--out"] || parsed["--artifact"]) fail("BUILD_ARGUMENTS_INVALID");
  } else if (action === "verify") {
    if (!parsed["--artifact"] || parsed["--source-dir"] || parsed["--out"] || parsed["--generated-at"]) {
      fail("VERIFY_ARGUMENTS_INVALID");
    }
  } else if (!parsed["--artifact"] || !parsed["--source-dir"] || parsed["--out"] || parsed["--generated-at"]) {
    fail("VERIFY_SOURCE_ARGUMENTS_INVALID");
  }
  return parsed;
}
function resolved(value, code) {
  const target = path.resolve(value);
  if (target === path.parse(target).root) fail(`${code}_TOO_BROAD`);
  return target;
}
function readStableJson(file) {
  const pathStat = lstatSync(file, { bigint: true });
  if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.size <= 0n || pathStat.size > 10_000_000n) {
    fail("ARTIFACT_UNSAFE");
  }
  const descriptor = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathStat[field]) fail("ARTIFACT_CHANGED");
    }
    if (BigInt(bytes.length) !== after.size) fail("ARTIFACT_SHORT_READ");
    try { return JSON.parse(bytes.toString("utf8")); }
    catch { fail("ARTIFACT_JSON_INVALID"); }
  } finally { closeSync(descriptor); }
}
function writeNoClobber(file, artifact) {
  const output = resolved(file, "OUTPUT");
  mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  const descriptor = openSync(output, fsConstants.O_WRONLY | fsConstants.O_CREAT
    | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(artifact, null, 2)}\n`);
    fsyncSync(descriptor);
  } finally { closeSync(descriptor); }
  return output;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  if (options.action === "build") {
    const artifact = buildNcuaPbgcMshaRealExperienceFromSourceDirectory(
      resolved(options["--source-dir"], "SOURCE_DIR"),
      options["--generated-at"] ? { generatedAt: options["--generated-at"] } : undefined,
    );
    const verification = verifyNcuaPbgcMshaRealExperienceWithSource(
      artifact, resolved(options["--source-dir"], "SOURCE_DIR"));
    if (!verification.ok || !verification.candidateArtifactExactlyRebuilt) fail("BUILD_REPLAY_FAILED");
    const output = writeNoClobber(options["--out"], artifact);
    process.stdout.write(`${JSON.stringify({ ok: true, output,
      artifactHash: artifact.artifactHash, sourceSetHash: artifact.source.sourceSetHash,
      acquisitionManifestHash: artifact.source.acquisitionManifestHash,
      sourceCount: artifact.source.sourceCount, sourceBytes: artifact.source.sourceBytes,
      mshaPhysicalDataRows: artifact.lanes.msha.sourceAccounting.physicalDataRows,
      verificationLevel: verification.verificationLevel,
      operationalReadinessCredit: 0 }, null, 2)}\n`);
  } else {
    const artifact = readStableJson(resolved(options["--artifact"], "ARTIFACT"));
    const result = options.action === "verify"
      ? verifyNcuaPbgcMshaRealExperience(artifact)
      : verifyNcuaPbgcMshaRealExperienceWithSource(
        artifact, resolved(options["--source-dir"], "SOURCE_DIR"));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
