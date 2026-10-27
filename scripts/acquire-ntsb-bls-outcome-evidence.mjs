#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync,
  mkdirSync, openSync, readFileSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { NTSB_BLS_FROZEN_SOURCE_20260821 } from "../src/outsider-ntsb-bls-outcome-evidence.js";

function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function parse(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--out-dir", "--ntsb-dir", "--bls-dir"].includes(flag)
      || !value || value.startsWith("--") || Object.hasOwn(options, flag)) {
      throw new Error("NTSB_BLS_ACQUIRE_USAGE");
    }
    options[flag] = path.resolve(value);
  }
  if (!options["--out-dir"]) throw new Error("NTSB_BLS_ACQUIRE_USAGE");
  for (const value of Object.values(options)) {
    if (value === path.parse(value).root) throw new Error("NTSB_BLS_ACQUIRE_PATH_TOO_BROAD");
  }
  return { out: options["--out-dir"], ntsb: options["--ntsb-dir"] ?? null,
    bls: options["--bls-dir"] ?? null };
}

function exactLocalRead(directory, expected) {
  const target = path.join(directory, expected.name);
  const pathBefore = lstatSync(target, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.size !== BigInt(expected.bytes)) {
    throw new Error(`NTSB_BLS_ACQUIRE_LOCAL_UNSAFE:${expected.name}`);
  }
  const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathBefore[field]) {
        throw new Error(`NTSB_BLS_ACQUIRE_LOCAL_CHANGED:${expected.name}`);
      }
    }
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
      throw new Error(`NTSB_BLS_ACQUIRE_LOCAL_PIN_MISMATCH:${expected.name}`);
    }
    return bytes;
  } finally { closeSync(fd); }
}

function requireSafeDirectory(directory, code) {
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code);
}

async function download(expected) {
  if (expected.kind === "BROWSER_RENDERED_DOM_SNAPSHOT") {
    throw new Error(`NTSB_BLS_ACQUIRE_BROWSER_CAPTURE_REQUIRED:${expected.name}`);
  }
  const response = await fetch(expected.url, { redirect: "follow", headers: {
    "user-agent": "Mozilla/5.0 (compatible; OutsiderSourceFreeze/1.0)",
    accept: "*/*",
  } });
  if (!response.ok) throw new Error(`NTSB_BLS_ACQUIRE_HTTP_${response.status}:${expected.name}`);
  const contentLength = response.headers.get("content-length");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (contentLength !== null && Number(contentLength) !== bytes.length) {
    throw new Error(`NTSB_BLS_ACQUIRE_CONTENT_LENGTH_MISMATCH:${expected.name}`);
  }
  if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
    throw new Error(`NTSB_BLS_ACQUIRE_PIN_MISMATCH:${expected.name}`);
  }
  return bytes;
}

function writeExact(target, bytes, expected) {
  if (existsSync(target)) {
    const stat = lstatSync(target, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`NTSB_BLS_ACQUIRE_EXISTING_UNSAFE:${expected.name}`);
    }
    const existing = readFileSync(target);
    if (existing.length !== expected.bytes || sha256(existing) !== expected.sha256) {
      throw new Error(`NTSB_BLS_ACQUIRE_EXISTING_MISMATCH:${expected.name}`);
    }
    return "EXACT_EXISTING";
  }
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  return "WRITTEN_EXACT_PIN";
}

function manifest() {
  const files = NTSB_BLS_FROZEN_SOURCE_20260821.files.map((file) => ({
    name: file.name, lane: file.lane, kind: file.kind, url: file.url,
    bytes: file.bytes, sha256: file.sha256,
    captureRepresentation: file.kind === "BROWSER_RENDERED_DOM_SNAPSHOT"
      ? "BROWSER_RENDERED_DOCUMENT_OUTER_HTML" : "EXACT_PUBLISHER_FILE_BYTES",
  }));
  return {
    schema: "outsider/ntsb-bls-source-acquisition/v1",
    sourceId: NTSB_BLS_FROZEN_SOURCE_20260821.sourceId,
    frozenAt: NTSB_BLS_FROZEN_SOURCE_20260821.frozenAt,
    sourceCount: files.length,
    sourceBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    transportAttested: false,
    browserRenderedDomSnapshotsAreOriginalResponseBytes: false,
    files,
  };
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("node scripts/acquire-ntsb-bls-outcome-evidence.mjs --out-dir <dir> [--ntsb-dir <exact-staging>] [--bls-dir <exact-staging>]\n");
    process.exit(0);
  }
  mkdirSync(options.out, { recursive: true, mode: 0o700 });
  requireSafeDirectory(options.out, "NTSB_BLS_ACQUIRE_OUT_UNSAFE");
  for (const [lane, directory] of [["NTSB", options.ntsb], ["BLS", options.bls]]) {
    if (!directory) continue;
    requireSafeDirectory(directory, `NTSB_BLS_ACQUIRE_${lane}_DIR_UNSAFE`);
    if (directory === options.out) throw new Error(`NTSB_BLS_ACQUIRE_${lane}_DIR_EQUALS_OUT`);
  }
  const receipts = [];
  for (const expected of NTSB_BLS_FROZEN_SOURCE_20260821.files) {
    const localDirectory = expected.lane === "NTSB" ? options.ntsb : options.bls;
    const bytes = localDirectory ? exactLocalRead(localDirectory, expected) : await download(expected);
    const status = writeExact(path.join(options.out, expected.name), bytes, expected);
    receipts.push({ name: expected.name, lane: expected.lane,
      acquisition: localDirectory ? "EXACT_LOCAL_IMPORT" : "OFFICIAL_URL_DOWNLOAD",
      status, bytes: bytes.length, sha256: expected.sha256 });
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest(), null, 2)}\n`);
  const manifestTarget = path.join(options.out, "acquisition.json");
  if (existsSync(manifestTarget)) {
    const stat = lstatSync(manifestTarget, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error("NTSB_BLS_ACQUIRE_EXISTING_MANIFEST_UNSAFE");
    }
    const existing = readFileSync(manifestTarget);
    if (!existing.equals(manifestBytes)) throw new Error("NTSB_BLS_ACQUIRE_EXISTING_MANIFEST_MISMATCH");
  } else {
    writeFileSync(manifestTarget, manifestBytes, { flag: "wx", mode: 0o600 });
  }
  process.stdout.write(`${JSON.stringify({ ok: true,
    sourceId: NTSB_BLS_FROZEN_SOURCE_20260821.sourceId, outDirectory: options.out,
    sourceCount: receipts.length, sourceBytes: receipts.reduce((sum, receipt) => sum + receipt.bytes, 0),
    acquisitionManifestSha256: sha256(manifestBytes), receipts }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
