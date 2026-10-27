#!/usr/bin/env node

/* Prepare one canonical 0600 input for the read-only Brave production probe. */

import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { compileBraveProductionProbeInputV1 }
  from "../src/outsider-brave-production-probe-input-compiler-v1.js";

const PREFIX = "OUTSIDER_BRAVE_PRODUCTION_PROBE_INPUT_CLI_V1_";
const HELP = `Usage:
  outsider-brave-production-probe-input-v1.mjs prepare \\
    --request REQUEST_0600_JSON --output NEW_PROBE_INPUT_JSON

Compiles locally only. It reads no API token, performs no network request,
does not post a tender, and creates the output once with mode 0600.`;

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return null;
  }
  if (argv.length !== 5 || argv[0] !== "prepare") fail("ARGUMENTS_INVALID");
  const flags = {};
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    if (!["--request", "--output"].includes(name)
      || Object.hasOwn(flags, name) || !argv[index + 1]) {
      fail("ARGUMENTS_INVALID");
    }
    flags[name] = argv[index + 1];
  }
  if (!flags["--request"] || !flags["--output"]) {
    fail("ARGUMENTS_INVALID");
  }
  return flags;
}

function privateRequest(filename) {
  const absolute = path.resolve(filename);
  let metadata;
  try { metadata = lstatSync(absolute, { bigint: true }); }
  catch { fail("REQUEST_FILE_UNREADABLE"); }
  if (!metadata.isFile() || metadata.isSymbolicLink()
    || Number(metadata.mode & 0o777n) !== 0o600
    || metadata.size < 2n || metadata.size > 4n * 1024n * 1024n
    || realpathSync(absolute) !== absolute
    || (typeof process.getuid === "function"
      && metadata.uid !== BigInt(process.getuid()))) {
    fail("REQUEST_FILE_NOT_PRIVATE_REGULAR_FILE");
  }
  let value;
  try { value = JSON.parse(readFileSync(absolute, "utf8")); }
  catch { fail("REQUEST_FILE_JSON_INVALID"); }
  return value;
}

function writeNewPrivateFile(filename, value) {
  const absolute = path.resolve(filename);
  const parent = path.dirname(absolute);
  let parentMetadata;
  try { parentMetadata = lstatSync(parent, { bigint: true }); }
  catch { fail("OUTPUT_PARENT_INVALID"); }
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()
    || realpathSync(parent) !== parent
    || (typeof process.getuid === "function"
      && parentMetadata.uid !== BigInt(process.getuid()))) {
    fail("OUTPUT_PARENT_INVALID");
  }
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(absolute, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error) {
    if (error?.code === "EEXIST") fail("OUTPUT_ALREADY_EXISTS");
    throw error;
  } finally {
    bytes.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return absolute;
}

export function main(argv, dependencies = {}) {
  const writeOutput = dependencies.writeOutput
    ?? ((text) => process.stdout.write(text));
  const flags = parse(argv);
  if (flags === null) {
    writeOutput(`${HELP}\n`);
    return null;
  }
  const compiled = compileBraveProductionProbeInputV1(
    privateRequest(flags["--request"]));
  const output = writeNewPrivateFile(flags["--output"], compiled);
  const receipt = Object.freeze({
    schema: "outsider/brave-production-probe-input-prepare-receipt/v1",
    schemaVersion: "1.0.0",
    output,
    mode: compiled.mode,
    programHash: compiled.program.programHash,
    tenderHash: compiled.tender.tenderHash,
    networkIoPerformed: false,
    tenderPostPerformed: false,
    paymentPerformed: false,
  });
  writeOutput(`${canonicalizeStrict(receipt)}\n`);
  return receipt;
}

if (process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${error?.message ?? "PREPARE_FAILED"}\n`);
    process.exitCode = 1;
  }
}
