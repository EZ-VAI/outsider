#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync,
  mkdirSync, openSync, readFileSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  FRA_PHMSA_FROZEN_SOURCE_20260821, fraPhmsaExpectedAcquisitionManifest,
} from "../src/outsider-fra-phmsa-safety-evidence.js";

function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function usage() {
  return "node scripts/acquire-fra-phmsa-safety-evidence.mjs --out-dir <dir> --fra-dir <exact-staging> --phmsa-dir <exact-browser-download-dir>";
}
function parse(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--out-dir", "--fra-dir", "--phmsa-dir"].includes(flag) || !value
      || value.startsWith("--") || Object.hasOwn(options, flag)) throw new Error("FRA_PHMSA_ACQUIRE_USAGE");
    options[flag] = path.resolve(value);
  }
  if (!options["--out-dir"] || !options["--fra-dir"] || !options["--phmsa-dir"]
    || Object.values(options).some((value) => value === path.parse(value).root)) {
    throw new Error("FRA_PHMSA_ACQUIRE_USAGE");
  }
  return { out: options["--out-dir"], fra: options["--fra-dir"], phmsa: options["--phmsa-dir"] };
}
function requireDirectory(directory, code) {
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
}
function exactRead(directory, expected) {
  const target = path.join(directory, expected.name);
  const beforePath = lstatSync(target, { bigint: true });
  if (!beforePath.isFile() || beforePath.isSymbolicLink() || beforePath.size !== BigInt(expected.bytes)) {
    throw new Error(`FRA_PHMSA_ACQUIRE_LOCAL_UNSAFE:${expected.name}`);
  }
  const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== beforePath[field]) {
        throw new Error(`FRA_PHMSA_ACQUIRE_LOCAL_CHANGED:${expected.name}`);
      }
    }
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
      throw new Error(`FRA_PHMSA_ACQUIRE_LOCAL_PIN_MISMATCH:${expected.name}`);
    }
    return bytes;
  } finally { closeSync(fd); }
}
function writeExact(target, bytes, expected) {
  if (existsSync(target)) {
    const stat = lstatSync(target, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || !readFileSync(target).equals(bytes)) {
      throw new Error(`FRA_PHMSA_ACQUIRE_EXISTING_MISMATCH:${expected.name}`);
    }
    return "EXACT_EXISTING";
  }
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  return "WRITTEN_EXACT_PIN";
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${usage()}\n`); process.exit(0); }
  requireDirectory(options.fra, "FRA_PHMSA_ACQUIRE_FRA_DIR_UNSAFE");
  requireDirectory(options.phmsa, "FRA_PHMSA_ACQUIRE_PHMSA_DIR_UNSAFE");
  mkdirSync(options.out, { recursive: true, mode: 0o700 });
  requireDirectory(options.out, "FRA_PHMSA_ACQUIRE_OUT_DIR_UNSAFE");
  if (options.out === options.fra || options.out === options.phmsa) {
    throw new Error("FRA_PHMSA_ACQUIRE_SOURCE_EQUALS_OUT");
  }
  const receipts = [];
  for (const expected of FRA_PHMSA_FROZEN_SOURCE_20260821.files) {
    const directory = expected.lane === "FRA" ? options.fra : options.phmsa;
    const bytes = exactRead(directory, expected);
    receipts.push({ name: expected.name, lane: expected.lane,
      status: writeExact(path.join(options.out, expected.name), bytes, expected),
      bytes: bytes.length, sha256: expected.sha256,
      acquisition: expected.lane === "PHMSA" ? "EXACT_BROWSER_DOWNLOAD_IMPORT" : "EXACT_API_CAPTURE_IMPORT" });
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(fraPhmsaExpectedAcquisitionManifest(), null, 2)}\n`);
  const manifestPath = path.join(options.out, "acquisition.json");
  if (existsSync(manifestPath)) {
    const stat = lstatSync(manifestPath, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || !readFileSync(manifestPath).equals(manifestBytes)) {
      throw new Error("FRA_PHMSA_ACQUIRE_EXISTING_MANIFEST_MISMATCH");
    }
  } else writeFileSync(manifestPath, manifestBytes, { flag: "wx", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ ok: true, outDirectory: options.out,
    sourceId: FRA_PHMSA_FROZEN_SOURCE_20260821.sourceId, sourceCount: receipts.length,
    sourceBytes: receipts.reduce((total, receipt) => total + receipt.bytes, 0),
    acquisitionManifestSha256: sha256(manifestBytes), receipts }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
  process.exitCode = 1;
}
