#!/usr/bin/env node

import {
  chmodSync, closeSync, existsSync, fchmodSync, fsyncSync, lstatSync,
  mkdirSync, openSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildStage0SourceTemporalAuditManifest,
  inspectStage0SourceTemporalAuditCandidate,
  STAGE0_SOURCE_TEMPORAL_AUDIT_PATH,
  verifyStage0SourceTemporalAuditManifest,
} from "../src/outsider-stage0-source-temporal-audit.js";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FINAL_V2_CANDIDATE_PATH =
  "artifacts/stage0-source-temporal-audit-20260828/final-v2/manifest.json";

function fail(code) {
  throw new Error(`STAGE0_SOURCE_TEMPORAL_AUDIT_CLI_${code}`);
}

function options(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!["--out", "--manifest"].includes(key)
      || !argv[index + 1] || argv[index + 1].startsWith("--")) fail("ARGUMENT_INVALID");
    parsed[key.slice(2)] = argv[++index];
  }
  return parsed;
}

function ensurePrivateParent(target) {
  const parent = path.dirname(target);
  const relative = path.relative(REPOSITORY_ROOT, parent);
  if (relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("OUTPUT_OUTSIDE_REPOSITORY");
  let cursor = REPOSITORY_ROOT;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    if (existsSync(cursor)) {
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) fail("OUTPUT_PARENT_UNSAFE");
    } else {
      mkdirSync(cursor, { mode: 0o700 });
      chmodSync(cursor, 0o700);
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const [command, ...rest] = argv;
    const parsed = options(rest);
    if (command === "build" || command === "build-candidate-v2") {
      const canonicalBuild = command === "build";
      const expectedPath = canonicalBuild
        ? STAGE0_SOURCE_TEMPORAL_AUDIT_PATH : FINAL_V2_CANDIDATE_PATH;
      const relative = parsed.out ?? expectedPath;
      if (relative !== expectedPath) fail("OUTPUT_PATH_MISMATCH");
      const target = path.resolve(REPOSITORY_ROOT, relative);
      if (existsSync(target)) fail("OUTPUT_EXISTS_NO_CLOBBER");
      ensurePrivateParent(target);
      const buildStartedAt = new Date().toISOString();
      const manifest = await buildStage0SourceTemporalAuditManifest({
        createdAt: buildStartedAt,
      });
      const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      let descriptor;
      try {
        descriptor = openSync(target, "wx", 0o600);
        writeFileSync(descriptor, bytes);
        fchmodSync(descriptor, 0o600);
        fsyncSync(descriptor);
      } finally { if (descriptor !== undefined) closeSync(descriptor); }
      const checked = canonicalBuild
        ? await verifyStage0SourceTemporalAuditManifest(relative)
        : inspectStage0SourceTemporalAuditCandidate(relative, manifest);
      if (!checked.ok) fail(`WRITTEN_MANIFEST_VERIFY_FAILED:${checked.error}`);
      process.stdout.write(`${JSON.stringify({ ok: true, output: target,
        createdAt: buildStartedAt, manifestHash: manifest.manifestHash,
        artifactFileHash: checked.artifactFileHash,
        bytes: bytes.length, verificationLevel: checked.verificationLevel,
        canonicalRoutingEligible: checked.canonicalRoutingEligible ?? true })}\n`);
      return 0;
    }
    if (command === "verify") {
      const relative = parsed.manifest ?? STAGE0_SOURCE_TEMPORAL_AUDIT_PATH;
      const checked = await verifyStage0SourceTemporalAuditManifest(relative);
      process.stdout.write(`${JSON.stringify(checked, null, 2)}\n`);
      return checked.ok ? 0 : 1;
    }
    fail("COMMAND_INVALID");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
