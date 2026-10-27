#!/usr/bin/env node

import {
  existsSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  RMPD_RECORD_ID,
  RMPD_EXPECTED_FILES,
  publishRmpdArtifactFromSeed,
} from "../src/outsider-rmpd-robot-motion-sample.js";

function usage() {
  return "usage: acquire-rmpd-robot-motion-sample.mjs --output DIR [--source-dir DIR]";
}

function args(argv) {
  let output = null;
  let sourceDirectory = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output") output = argv[++index];
    else if (argv[index] === "--source-dir") sourceDirectory = argv[++index];
    else if (argv[index] === "--help") return { help: true };
    else throw new Error(`RMPD_ARGUMENT_INVALID:${argv[index]}`);
  }
  if (!output) throw new Error("RMPD_OUTPUT_REQUIRED");
  return { output: path.resolve(output),
    sourceDirectory: sourceDirectory === null ? null : path.resolve(sourceDirectory) };
}

async function fetchBytes(url, expectedBytes = null) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(180_000) });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (expectedBytes !== null && bytes.length !== expectedBytes) {
        throw new Error(`BYTES_${bytes.length}_${expectedBytes}`);
      }
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error(`RMPD_FETCH_FAILED:${url}:${lastError instanceof Error
    ? lastError.message : String(lastError)}`);
}

async function acquireSeed(directory) {
  mkdirSync(directory, { mode: 0o700 });
  const recordUrl = `https://zenodo.org/api/records/${RMPD_RECORD_ID}`;
  const before = await fetchBytes(recordUrl);
  writeFileSync(path.join(directory, "record-before.json"), before, { mode: 0o600, flag: "wx" });
  for (const name of ["samples.zip", "schema_rmpd.sql"]) {
    const bytes = await fetchBytes(`${recordUrl}/files/${name}/content`,
      RMPD_EXPECTED_FILES[name].bytes);
    writeFileSync(path.join(directory, name), bytes, { mode: 0o600, flag: "wx" });
  }
  const after = await fetchBytes(recordUrl);
  writeFileSync(path.join(directory, "record-after.json"), after, { mode: 0o600, flag: "wx" });
  chmodSync(directory, 0o700);
}

async function main() {
  const options = args(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${usage()}\n`); return; }
  if (existsSync(options.output)) throw new Error("RMPD_OUTPUT_EXISTS");
  const parent = path.dirname(options.output);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const seedOwned = options.sourceDirectory === null;
  const seed = options.sourceDirectory ?? mkdtempSync(path.join(os.tmpdir(), "rmpd-seed-"));
  const staging = `${options.output}.staging-${process.pid}`;
  if (existsSync(staging)) throw new Error("RMPD_STAGING_EXISTS");
  try {
    if (seedOwned) {
      rmSync(seed, { recursive: true, force: true });
      await acquireSeed(seed);
    }
    const result = publishRmpdArtifactFromSeed(seed, staging, options.output);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    if (seedOwned && existsSync(seed)) rmSync(seed, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
