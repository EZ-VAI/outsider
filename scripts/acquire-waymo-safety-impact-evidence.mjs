#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync,
  mkdirSync, openSync, readFileSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822, waymoSafetyImpactExpectedAcquisitionManifest,
} from "../src/outsider-waymo-safety-impact-evidence.js";

function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function usage() { return "node scripts/acquire-waymo-safety-impact-evidence.mjs --import-dir <exact-captures> --out-dir <dir>"; }
function parse(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    if (!["--import-dir", "--out-dir"].includes(flag) || !value || value.startsWith("--")
      || Object.hasOwn(options, flag)) throw new Error("WAYMO_ACQUIRE_USAGE");
    options[flag] = path.resolve(value);
  }
  if (!options["--import-dir"] || !options["--out-dir"]
    || Object.values(options).some((value) => value === path.parse(value).root)) throw new Error("WAYMO_ACQUIRE_USAGE");
  return { importDirectory: options["--import-dir"], outDirectory: options["--out-dir"] };
}
function requireDirectory(directory, code) {
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
}
function exactRead(directory, expected) {
  const target = path.join(directory, expected.name);
  const pathBefore = lstatSync(target, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.size !== BigInt(expected.bytes)) {
    throw new Error(`WAYMO_ACQUIRE_LOCAL_UNSAFE:${expected.name}`);
  }
  const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const pathAfter = lstatSync(target, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathBefore[field]
        || before[field] !== pathAfter[field]) throw new Error(`WAYMO_ACQUIRE_LOCAL_CHANGED:${expected.name}`);
    }
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
      throw new Error(`WAYMO_ACQUIRE_LOCAL_PIN_MISMATCH:${expected.name}`);
    }
    return bytes;
  } finally { closeSync(fd); }
}
function writeExact(target, bytes, name) {
  if (existsSync(target)) {
    const stat = lstatSync(target, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || !readFileSync(target).equals(bytes)) {
      throw new Error(`WAYMO_ACQUIRE_EXISTING_MISMATCH:${name}`);
    }
    return "EXACT_EXISTING";
  }
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  return "WRITTEN_EXACT_PIN";
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${usage()}\n`); process.exit(0); }
  requireDirectory(options.importDirectory, "WAYMO_ACQUIRE_IMPORT_DIR_UNSAFE");
  mkdirSync(options.outDirectory, { recursive: true, mode: 0o700 });
  requireDirectory(options.outDirectory, "WAYMO_ACQUIRE_OUT_DIR_UNSAFE");
  if (options.importDirectory === options.outDirectory) throw new Error("WAYMO_ACQUIRE_SOURCE_EQUALS_OUT");
  const receipts = [];
  for (const expected of WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822.files) {
    const bytes = exactRead(options.importDirectory, expected);
    receipts.push({ name: expected.name,
      status: writeExact(path.join(options.outDirectory, expected.name), bytes, expected.name),
      bytes: bytes.length, sha256: expected.sha256, acquisition: "EXACT_HTTPS_CAPTURE_IMPORT" });
  }
  const manifest = Buffer.from(`${JSON.stringify(waymoSafetyImpactExpectedAcquisitionManifest(), null, 2)}\n`);
  writeExact(path.join(options.outDirectory, "acquisition.json"), manifest, "acquisition.json");
  process.stdout.write(`${JSON.stringify({ ok: true, outDirectory: options.outDirectory,
    sourceId: WAYMO_SAFETY_IMPACT_FROZEN_SOURCE_20260822.sourceId, sourceCount: receipts.length,
    sourceBytes: receipts.reduce((total, receipt) => total + receipt.bytes, 0),
    acquisitionManifestSha256: sha256(manifest), receipts }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
  process.exitCode = 1;
}

