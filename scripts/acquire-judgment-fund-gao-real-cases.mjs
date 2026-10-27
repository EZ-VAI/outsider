#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  JUDGMENT_FUND_GAO_SOURCE_PINS,
  serializeJudgmentFundGaoAcquisitionManifest,
} from "../src/outsider-judgment-fund-gao-real-cases.js";

function fail(code, detail = null) {
  throw new Error(detail === null ? `JUDGMENT_FUND_GAO_ACQUIRE_${code}`
    : `JUDGMENT_FUND_GAO_ACQUIRE_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function parse(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--out-dir", "--staging-dir"].includes(flag) || !value
      || value.startsWith("--") || Object.hasOwn(options, flag)) fail("USAGE");
    options[flag] = path.resolve(value);
  }
  if (!options["--out-dir"]) fail("USAGE");
  for (const value of Object.values(options)) {
    if (value === path.parse(value).root) fail("PATH_TOO_BROAD");
  }
  if (options["--out-dir"] === options["--staging-dir"]) fail("DIRECTORIES_MUST_DIFFER");
  return { outDirectory: options["--out-dir"],
    stagingDirectory: options["--staging-dir"] ?? null };
}

function requireDirectory(directory, code) {
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code);
}

function exactRead(target, pin) {
  const pathStat = lstatSync(target, { bigint: true });
  if (!pathStat.isFile() || pathStat.isSymbolicLink()
    || pathStat.size !== BigInt(pin.sizeBytes)) fail("FILE_UNSAFE", pin.path);
  const descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathStat[field]) {
        fail("FILE_CHANGED", pin.path);
      }
    }
    if (bytes.length !== pin.sizeBytes || sha256(bytes) !== pin.sha256) {
      fail("PIN_MISMATCH", pin.path);
    }
    return bytes;
  } finally { closeSync(descriptor); }
}

async function acquire(pin, stagingDirectory) {
  if (stagingDirectory) return {
    bytes: exactRead(path.join(stagingDirectory, pin.path), pin),
    method: "EXACT_LOCAL_STAGING_IMPORT",
  };
  if (pin.captureRepresentation.startsWith("BROWSER_")) {
    fail("BROWSER_CAPTURE_REQUIRED", pin.path);
  }
  const response = await fetch(pin.url, { redirect: "follow", headers: {
    "user-agent": "Mozilla/5.0 (compatible; OutsiderOfficialSourceFreeze/1.0)",
    accept: "*/*",
  } });
  if (!response.ok) fail(`HTTP_${response.status}`, pin.path);
  const contentLength = response.headers.get("content-length");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (contentLength !== null && Number(contentLength) !== bytes.length) {
    fail("CONTENT_LENGTH_MISMATCH", pin.path);
  }
  if (bytes.length !== pin.sizeBytes || sha256(bytes) !== pin.sha256) {
    fail("PIN_MISMATCH", pin.path);
  }
  return { bytes, method: "OFFICIAL_URL_EXACT_PIN_DOWNLOAD" };
}

function writeOrMatch(target, bytes, pin) {
  if (existsSync(target)) {
    exactRead(target, pin);
    return "EXACT_EXISTING";
  }
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  exactRead(target, pin);
  return "WRITTEN_EXACT_PIN";
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("node scripts/acquire-judgment-fund-gao-real-cases.mjs --out-dir <dir> [--staging-dir <exact-source-dir>]\n");
    process.exit(0);
  }
  mkdirSync(options.outDirectory, { recursive: true, mode: 0o700 });
  requireDirectory(options.outDirectory, "OUT_DIRECTORY_UNSAFE");
  if (options.stagingDirectory) requireDirectory(options.stagingDirectory,
    "STAGING_DIRECTORY_UNSAFE");
  const allowedBefore = new Set(["acquisition.json",
    ...JUDGMENT_FUND_GAO_SOURCE_PINS.map((pin) => pin.path)]);
  for (const name of readdirSync(options.outDirectory)) {
    if (!allowedBefore.has(name)) fail("OUT_DIRECTORY_EXTRA_FILE", name);
  }
  const receipts = [];
  for (const pin of JUDGMENT_FUND_GAO_SOURCE_PINS) {
    const target = path.join(options.outDirectory, pin.path);
    if (existsSync(target)) {
      exactRead(target, pin);
      receipts.push({ path: pin.path, method: "EXACT_EXISTING",
        status: "EXACT_EXISTING", sizeBytes: pin.sizeBytes, sha256: pin.sha256 });
      continue;
    }
    const acquired = await acquire(pin, options.stagingDirectory);
    receipts.push({ path: pin.path, method: acquired.method,
      status: writeOrMatch(target, acquired.bytes, pin),
      sizeBytes: pin.sizeBytes, sha256: pin.sha256 });
  }
  const manifestBytes = serializeJudgmentFundGaoAcquisitionManifest();
  const manifestTarget = path.join(options.outDirectory, "acquisition.json");
  if (existsSync(manifestTarget)) {
    const stat = lstatSync(manifestTarget);
    if (!stat.isFile() || stat.isSymbolicLink()
      || !readFileSync(manifestTarget).equals(manifestBytes)) fail("MANIFEST_MISMATCH");
  } else writeFileSync(manifestTarget, manifestBytes, { flag: "wx", mode: 0o600 });
  const expectedFinal = ["acquisition.json",
    ...JUDGMENT_FUND_GAO_SOURCE_PINS.map((pin) => pin.path)].sort();
  if (JSON.stringify(readdirSync(options.outDirectory).sort()) !== JSON.stringify(expectedFinal)) {
    fail("FINAL_FILE_SET_INVALID");
  }
  process.stdout.write(`${JSON.stringify({ ok: true,
    outDirectory: options.outDirectory,
    sourceCount: receipts.length,
    sourceBytes: receipts.reduce((sum, receipt) => sum + receipt.sizeBytes, 0),
    acquisitionManifestBytes: manifestBytes.length,
    acquisitionManifestSha256: sha256(manifestBytes),
    receipts }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
