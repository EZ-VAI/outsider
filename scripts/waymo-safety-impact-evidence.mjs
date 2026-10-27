#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildWaymoSafetyImpactEvidenceFromSourceDirectory,
  verifyWaymoSafetyImpactEvidence, verifyWaymoSafetyImpactEvidenceWithSource,
} from "../src/outsider-waymo-safety-impact-evidence.js";

function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function usage() {
  return [
    "node scripts/waymo-safety-impact-evidence.mjs build --source <dir> --out <json> [--generated-at <ISO>]",
    "node scripts/waymo-safety-impact-evidence.mjs verify --artifact <json>",
    "node scripts/waymo-safety-impact-evidence.mjs verify-source --artifact <json> --source <dir>",
  ].join("\n");
}
function parse(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const command = argv[0];
  if (!["build", "verify", "verify-source"].includes(command)) throw new Error("WAYMO_CLI_USAGE");
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!["--source", "--out", "--generated-at", "--artifact"].includes(flag)
      || !value || value.startsWith("--") || Object.hasOwn(options, flag)) throw new Error("WAYMO_CLI_USAGE");
    options[flag] = value;
  }
  const keys = Object.keys(options).sort();
  const expected = command === "build"
    ? (Object.hasOwn(options, "--generated-at") ? ["--generated-at", "--out", "--source"] : ["--out", "--source"])
    : command === "verify" ? ["--artifact"] : ["--artifact", "--source"];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error("WAYMO_CLI_USAGE");
  return { command, source: options["--source"] ? path.resolve(options["--source"]) : null,
    out: options["--out"] ? path.resolve(options["--out"]) : null,
    artifact: options["--artifact"] ? path.resolve(options["--artifact"]) : null,
    generatedAt: options["--generated-at"] ?? null };
}
function readArtifact(target) {
  const bytes = readFileSync(target);
  if (bytes.length <= 0 || bytes.length > 4 * 1024 * 1024) throw new Error("WAYMO_CLI_ARTIFACT_SIZE_INVALID");
  return JSON.parse(bytes.toString("utf8"));
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${usage()}\n`); process.exit(0); }
  if (options.command === "build") {
    const artifact = buildWaymoSafetyImpactEvidenceFromSourceDirectory(options.source,
      options.generatedAt ? { generatedAt: options.generatedAt } : {});
    const bytes = Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`);
    mkdirSync(path.dirname(options.out), { recursive: true, mode: 0o700 });
    if (existsSync(options.out)) {
      const stat = lstatSync(options.out);
      if (!stat.isFile() || stat.isSymbolicLink() || !readFileSync(options.out).equals(bytes)) {
        throw new Error("WAYMO_CLI_OUT_EXISTS_DIFFERENT");
      }
    } else writeFileSync(options.out, bytes, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ ok: true, command: "build", out: options.out,
      artifactHash: artifact.artifactHash, sourceSetHash: artifact.source.sourceSetHash,
      exposureDisplayedPointMiles: artifact.exposure.displayedRoundedTotalRiderOnlyMiles,
      sgoOutcomeRows: artifact.outcomes.rows, serializedBytes: bytes.length,
      serializedSha256: sha256(bytes) }, null, 2)}\n`);
  } else {
    const artifact = readArtifact(options.artifact);
    const result = options.command === "verify" ? verifyWaymoSafetyImpactEvidence(artifact)
      : verifyWaymoSafetyImpactEvidenceWithSource(artifact, options.source);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
  process.exitCode = 1;
}
