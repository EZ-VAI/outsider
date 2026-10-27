#!/usr/bin/env node

import { closeSync, existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  buildStage0EvidenceChainCurrentManifest,
  STAGE0_EVIDENCE_CURRENT_PATHS,
  verifyStage0EvidenceChainCurrentManifest,
} from "../src/outsider-stage0-evidence-current.js";

function fail(code) {
  throw new Error(`STAGE0_EVIDENCE_CURRENT_CLI_${code}`);
}

function options(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!["--out", "--manifest", "--created-at"].includes(key)
      || !argv[index + 1] || argv[index + 1].startsWith("--")) fail("ARGUMENT_INVALID");
    parsed[key.slice(2)] = argv[++index];
  }
  return parsed;
}

try {
  const [command, ...argv] = process.argv.slice(2);
  const parsed = options(argv);
  if (command === "build") {
    const relative = parsed.out ?? STAGE0_EVIDENCE_CURRENT_PATHS.manifest;
    if (relative !== STAGE0_EVIDENCE_CURRENT_PATHS.manifest) fail("OUTPUT_PATH_MISMATCH");
    const target = path.resolve(relative);
    if (existsSync(target)) fail("OUTPUT_EXISTS_NO_CLOBBER");
    const manifest = await buildStage0EvidenceChainCurrentManifest({
      createdAt: parsed["created-at"] ?? "2026-09-02T14:30:09.000Z",
    });
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    let descriptor;
    try {
      descriptor = openSync(target, "wx", 0o600);
      writeFileSync(descriptor, bytes);
    } finally { if (descriptor !== undefined) closeSync(descriptor); }
    process.stdout.write(`${JSON.stringify({ ok: true, output: target,
      manifestHash: manifest.manifestHash, bytes: bytes.length })}\n`);
  } else if (command === "verify") {
    const relative = parsed.manifest ?? STAGE0_EVIDENCE_CURRENT_PATHS.manifest;
    const result = await verifyStage0EvidenceChainCurrentManifest(relative);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } else fail("COMMAND_INVALID");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
