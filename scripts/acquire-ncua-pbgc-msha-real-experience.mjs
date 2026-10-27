#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync,
  mkdirSync, openSync, readFileSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  NCUA_PBGC_MSHA_REAL_EXPERIENCE_FROZEN_AT,
  NCUA_PBGC_MSHA_SOURCE_PINS_20260821,
} from "../src/outsider-ncua-pbgc-msha-real-experience.js";

function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function parse(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--out-dir", "--local-dir"].includes(flag) || !value || value.startsWith("--")
      || Object.hasOwn(options, flag)) throw new Error("NCUA_PBGC_MSHA_ACQUIRE_USAGE");
    options[flag] = path.resolve(value);
  }
  if (!options["--out-dir"] || Object.values(options).some((value) => value === path.parse(value).root)) {
    throw new Error("NCUA_PBGC_MSHA_ACQUIRE_USAGE");
  }
  return { out: options["--out-dir"], local: options["--local-dir"] ?? null };
}
function requireDirectory(directory, code) {
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
}
function exactLocalRead(directory, expected) {
  const target = path.join(directory, expected.name);
  const pathBefore = lstatSync(target, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.size !== BigInt(expected.bytes)) {
    throw new Error(`NCUA_PBGC_MSHA_ACQUIRE_LOCAL_UNSAFE:${expected.name}`);
  }
  const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathBefore[field]) {
        throw new Error(`NCUA_PBGC_MSHA_ACQUIRE_LOCAL_CHANGED:${expected.name}`);
      }
    }
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
      throw new Error(`NCUA_PBGC_MSHA_ACQUIRE_LOCAL_PIN_MISMATCH:${expected.name}`);
    }
    return bytes;
  } finally { closeSync(fd); }
}
async function download(expected) {
  const response = await fetch(expected.url, { redirect: "follow", headers: {
    "user-agent": "Mozilla/5.0 (compatible; OutsiderSourceFreeze/1.0)", accept: "*/*" } });
  if (!response.ok) throw new Error(`NCUA_PBGC_MSHA_ACQUIRE_HTTP_${response.status}:${expected.name}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) !== bytes.length) {
    throw new Error(`NCUA_PBGC_MSHA_ACQUIRE_CONTENT_LENGTH_MISMATCH:${expected.name}`);
  }
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
    throw new Error(`NCUA_PBGC_MSHA_ACQUIRE_PIN_MISMATCH:${expected.name}`);
  }
  return bytes;
}
function writeExact(target, bytes, expected) {
  if (existsSync(target)) {
    const stat = lstatSync(target, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`NCUA_PBGC_MSHA_ACQUIRE_EXISTING_UNSAFE:${expected.name}`);
    const existing = readFileSync(target);
    if (existing.length !== expected.bytes || sha256(existing) !== expected.sha256) {
      throw new Error(`NCUA_PBGC_MSHA_ACQUIRE_EXISTING_MISMATCH:${expected.name}`);
    }
    return "EXACT_EXISTING";
  }
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  return "WRITTEN_EXACT_PIN";
}
function manifest() {
  const files = NCUA_PBGC_MSHA_SOURCE_PINS_20260821.map((pin) => ({
    name: pin.name, lane: pin.lane, kind: pin.kind, url: pin.url,
    bytes: pin.bytes, sha256: pin.sha256, captureRepresentation: "EXACT_PUBLISHER_FILE_BYTES",
  }));
  return { schema: "outsider/ncua-pbgc-msha-source-acquisition/v1",
    sourceId: "NCUA_PBGC_MSHA_20260821", frozenAt: NCUA_PBGC_MSHA_REAL_EXPERIENCE_FROZEN_AT,
    sourceCount: files.length, sourceBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    transportAttested: false, files };
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("node scripts/acquire-ncua-pbgc-msha-real-experience.mjs --out-dir <dir> [--local-dir <exact-pinned-dir>]\n");
    process.exit(0);
  }
  mkdirSync(options.out, { recursive: true, mode: 0o700 });
  requireDirectory(options.out, "NCUA_PBGC_MSHA_ACQUIRE_OUT_UNSAFE");
  if (options.local) requireDirectory(options.local, "NCUA_PBGC_MSHA_ACQUIRE_LOCAL_DIR_UNSAFE");
  const receipts = [];
  for (const expected of NCUA_PBGC_MSHA_SOURCE_PINS_20260821) {
    const bytes = options.local ? exactLocalRead(options.local, expected) : await download(expected);
    receipts.push({ name: expected.name, lane: expected.lane,
      acquisition: options.local ? "EXACT_LOCAL_IMPORT" : "OFFICIAL_URL_DOWNLOAD",
      status: writeExact(path.join(options.out, expected.name), bytes, expected),
      bytes: bytes.length, sha256: expected.sha256 });
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest(), null, 2)}\n`);
  const target = path.join(options.out, "acquisition.json");
  if (existsSync(target)) {
    const stat = lstatSync(target, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink() || !readFileSync(target).equals(manifestBytes)) {
      throw new Error("NCUA_PBGC_MSHA_ACQUIRE_EXISTING_MANIFEST_MISMATCH");
    }
  } else writeFileSync(target, manifestBytes, { flag: "wx", mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ ok: true, sourceId: "NCUA_PBGC_MSHA_20260821",
    outDirectory: options.out, sourceCount: receipts.length,
    sourceBytes: receipts.reduce((sum, receipt) => sum + receipt.bytes, 0),
    acquisitionManifestSha256: sha256(manifestBytes), receipts }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
