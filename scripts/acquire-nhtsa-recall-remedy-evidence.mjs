#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync,
  mkdirSync, openSync, readFileSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821,
  nhtsaRecallRemedyExpectedAcquisitionManifest,
} from "../src/outsider-nhtsa-recall-remedy-evidence.js";

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function usage() {
  return "node scripts/acquire-nhtsa-recall-remedy-evidence.mjs --import-dir <exact-downloads> --out-dir <dir>";
}

function parse(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--import-dir", "--out-dir"].includes(flag) || !value || value.startsWith("--")
      || Object.hasOwn(options, flag)) throw new Error("NHTSA_RECALL_REMEDY_ACQUIRE_USAGE");
    options[flag] = path.resolve(value);
  }
  if (!options["--import-dir"] || !options["--out-dir"]
    || Object.values(options).some((value) => value === path.parse(value).root)) {
    throw new Error("NHTSA_RECALL_REMEDY_ACQUIRE_USAGE");
  }
  return { importDirectory: options["--import-dir"], outDirectory: options["--out-dir"] };
}

function requireDirectory(directory, code) {
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
}

function readExact(directory, pin) {
  const target = path.join(directory, pin.name);
  const pathBefore = lstatSync(target, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink()
    || pathBefore.size !== BigInt(pin.bytes)) {
    throw new Error(`NHTSA_RECALL_REMEDY_ACQUIRE_LOCAL_UNSAFE:${pin.name}`);
  }
  const descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const pathAfter = lstatSync(target, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathBefore[field]
        || before[field] !== pathAfter[field]) {
        throw new Error(`NHTSA_RECALL_REMEDY_ACQUIRE_LOCAL_CHANGED:${pin.name}`);
      }
    }
    if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) {
      throw new Error(`NHTSA_RECALL_REMEDY_ACQUIRE_LOCAL_PIN_MISMATCH:${pin.name}`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function writeExact(target, bytes, name) {
  if (existsSync(target)) {
    const stat = lstatSync(target, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || !readFileSync(target).equals(bytes)) {
      throw new Error(`NHTSA_RECALL_REMEDY_ACQUIRE_EXISTING_MISMATCH:${name}`);
    }
    return "EXACT_EXISTING";
  }
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  return "WRITTEN_EXACT_PIN";
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${usage()}\n`); process.exit(0); }
  requireDirectory(options.importDirectory, "NHTSA_RECALL_REMEDY_ACQUIRE_IMPORT_DIR_UNSAFE");
  mkdirSync(options.outDirectory, { recursive: true, mode: 0o700 });
  requireDirectory(options.outDirectory, "NHTSA_RECALL_REMEDY_ACQUIRE_OUT_DIR_UNSAFE");
  if (options.importDirectory === options.outDirectory) {
    throw new Error("NHTSA_RECALL_REMEDY_ACQUIRE_SOURCE_EQUALS_OUT");
  }
  const receipts = [];
  for (const pin of NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.files) {
    const bytes = readExact(options.importDirectory, pin);
    receipts.push({
      name: pin.name,
      status: writeExact(path.join(options.outDirectory, pin.name), bytes, pin.name),
      bytes: bytes.length,
      sha256: pin.sha256,
      acquisition: "EXACT_HTTPS_CAPTURE_IMPORT",
      transportAttested: false,
    });
  }
  const manifest = Buffer.from(`${JSON.stringify(
    nhtsaRecallRemedyExpectedAcquisitionManifest(), null, 2)}\n`);
  writeExact(path.join(options.outDirectory, "acquisition.json"), manifest, "acquisition.json");
  process.stdout.write(`${JSON.stringify({
    ok: true,
    sourceId: NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.sourceId,
    outDirectory: options.outDirectory,
    sourceCount: receipts.length,
    sourceBytes: receipts.reduce((total, receipt) => total + receipt.bytes, 0),
    acquisitionManifestSha256: sha256(manifest),
    receipts,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
  process.exitCode = 1;
}
