#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  CLINICALTRIALS_FROZEN_SOURCE_20260822,
  clinicalTrialsExpectedAcquisitionManifest,
} from "../src/outsider-clinicaltrials-posted-results-evidence.js";

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function usage() {
  return "node scripts/acquire-clinicaltrials-posted-results-evidence.mjs --out-dir <dir>";
}
function parse(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  if (argv.length !== 2 || argv[0] !== "--out-dir" || !argv[1]
    || argv[1].startsWith("--")) throw new Error("CLINICALTRIALS_ACQUIRE_USAGE");
  const outDirectory = path.resolve(argv[1]);
  if (outDirectory === path.parse(outDirectory).root) {
    throw new Error("CLINICALTRIALS_ACQUIRE_OUT_TOO_BROAD");
  }
  return { outDirectory };
}
function requireSafeDirectory(directory) {
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("CLINICALTRIALS_ACQUIRE_OUT_UNSAFE");
  }
  const allowed = new Set([
    ...CLINICALTRIALS_FROZEN_SOURCE_20260822.files.map((file) => file.name),
    "acquisition.json",
  ]);
  for (const name of readdirSync(directory)) {
    if (!allowed.has(name)) throw new Error(`CLINICALTRIALS_ACQUIRE_EXTRA_SOURCE:${name}`);
  }
}
function stableExisting(target, expected) {
  const pathBefore = lstatSync(target, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink()
    || pathBefore.size !== BigInt(expected.bytes)) {
    throw new Error(`CLINICALTRIALS_ACQUIRE_EXISTING_UNSAFE:${expected.name}`);
  }
  const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const pathAfter = lstatSync(target, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathBefore[field]
        || before[field] !== pathAfter[field]) {
        throw new Error(`CLINICALTRIALS_ACQUIRE_EXISTING_CHANGED:${expected.name}`);
      }
    }
    if (sha256(bytes) !== expected.sha256) {
      throw new Error(`CLINICALTRIALS_ACQUIRE_EXISTING_PIN_MISMATCH:${expected.name}`);
    }
    return bytes;
  } finally { closeSync(fd); }
}
async function download(expected) {
  let response;
  try {
    response = await fetch(expected.url, {
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
      headers: {
        accept: expected.contentType,
        "user-agent": "OutsiderEvidenceFreeze/1.0",
      },
    });
  } catch (error) {
    throw new Error(`CLINICALTRIALS_ACQUIRE_NETWORK_DEFER:${expected.name}:${
      error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok || response.url !== expected.url) {
    throw new Error(`CLINICALTRIALS_ACQUIRE_HTTP_PROFILE_MISMATCH:${expected.name}:${response.status}`);
  }
  const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim();
  if (contentType !== expected.contentType) {
    throw new Error(`CLINICALTRIALS_ACQUIRE_CONTENT_TYPE_MISMATCH:${expected.name}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
    throw new Error(`CLINICALTRIALS_ACQUIRE_PIN_MISMATCH_MACHINE_DEFER:${expected.name}`);
  }
  return bytes;
}
function writeExact(target, bytes, expected) {
  if (existsSync(target)) {
    const existing = stableExisting(target, expected);
    if (!existing.equals(bytes)) throw new Error(`CLINICALTRIALS_ACQUIRE_EXISTING_MISMATCH:${expected.name}`);
    return "EXACT_EXISTING";
  }
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  return "DOWNLOADED_EXACT_PIN";
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${usage()}\n`); process.exit(0); }
  mkdirSync(options.outDirectory, { recursive: true, mode: 0o700 });
  requireSafeDirectory(options.outDirectory);

  // Download and validate everything before writing a new member.  A changed
  // live registry or incomplete page chain therefore fails closed.
  const captures = [];
  for (const expected of CLINICALTRIALS_FROZEN_SOURCE_20260822.files) {
    const target = path.join(options.outDirectory, expected.name);
    const bytes = existsSync(target) ? stableExisting(target, expected) : await download(expected);
    captures.push({ expected, bytes });
  }
  const receipts = captures.map(({ expected, bytes }) => ({
    name: expected.name,
    status: writeExact(path.join(options.outDirectory, expected.name), bytes, expected),
    bytes: bytes.length,
    sha256: expected.sha256,
    url: expected.url,
  }));
  const manifest = Buffer.from(`${JSON.stringify(clinicalTrialsExpectedAcquisitionManifest(), null, 2)}\n`);
  const manifestExpected = { name: "acquisition.json", bytes: manifest.length, sha256: sha256(manifest) };
  const manifestStatus = writeExact(path.join(options.outDirectory, "acquisition.json"),
    manifest, manifestExpected);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outDirectory: options.outDirectory,
    sourceId: CLINICALTRIALS_FROZEN_SOURCE_20260822.sourceId,
    sourceCount: receipts.length,
    sourceBytes: receipts.reduce((sum, receipt) => sum + receipt.bytes, 0),
    acquisitionManifestSha256: sha256(manifest),
    manifestStatus,
    receipts,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
  process.exitCode = 1;
}
