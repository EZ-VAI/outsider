#!/usr/bin/env node

/*
 * Local, no-network publication runner for one exact Globalping observation
 * bridge record.  A complete 0600 file is fsynced before an O_EXCL-equivalent
 * hard-link publishes bridge.json into a newly created 0700 directory.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, fchmodSync, fstatSync, fsyncSync, linkSync,
  lstatSync, mkdirSync, openSync, readFileSync, realpathSync, readdirSync,
  unlinkSync, writeSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createGlobalpingWitnessObservationBridgeV1,
} from "../src/outsider-globalping-witness-observation-bridge-v1.js";

const PREFIX = "OUTSIDER_GLOBALPING_WITNESS_OBSERVATION_BRIDGE_RUNNER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_CONFIG_BYTES = 1024 * 1024;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || keys.some((key) => typeof key !== "string" || !fields.includes(key))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function readPrivateCanonicalFile(file, expected, code) {
  const absolute = path.resolve(file);
  let before;
  try { before = lstatSync(absolute, { bigint: true }); }
  catch { fail(`${code}_UNREADABLE`); }
  if (!before.isFile() || before.isSymbolicLink()
    || Number(before.mode & 0o777n) !== 0o600 || before.size < 2n
    || before.size > BigInt(MAX_CONFIG_BYTES) || realpathSync(absolute) !== absolute
    || (typeof process.getuid === "function"
      && before.uid !== BigInt(process.getuid()))) fail(`${code}_UNSAFE`);
  let descriptor;
  try {
    descriptor = openSync(absolute,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size) fail(`${code}_IDENTITY_CHANGED`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (after.size !== opened.size || after.mtimeNs !== opened.mtimeNs
      || after.ctimeNs !== opened.ctimeNs) fail(`${code}_CHANGED_DURING_READ`);
    if (expected !== null && (bytes.length !== expected.bytes
      || sha256(bytes) !== expected.sha256)) fail(`${code}_PIN_MISMATCH`);
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); }
    catch { fail(`${code}_JSON_INVALID`); }
    if (!bytes.equals(canonicalBytes(value))) fail(`${code}_NOT_CANONICAL`);
    return Object.freeze({ absolute, bytes, value, sha256: sha256(bytes) });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function sourceReference(value) {
  exactObject(value, ["path", "bytes", "sha256"], "SOURCE_INPUT_FILE");
  if (typeof value.path !== "string" || value.path.length < 1
    || value.path.includes("\0") || !Number.isSafeInteger(value.bytes)
    || value.bytes < 2 || typeof value.sha256 !== "string"
    || !HASH.test(value.sha256)) fail("SOURCE_INPUT_FILE_INVALID");
  return value;
}

function resolveReference(configFile, reference) {
  return path.resolve(path.dirname(configFile), reference);
}

function fsyncDirectory(directory) {
  const descriptor = openSync(directory,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function newOutputDirectory(outputDirectory) {
  const absolute = path.resolve(outputDirectory);
  const parent = realpathSync(path.dirname(absolute));
  if (path.dirname(absolute) !== parent || absolute === parent) {
    fail("OUTPUT_PARENT_NON_CANONICAL");
  }
  try {
    lstatSync(absolute);
    fail("OUTPUT_DIRECTORY_ALREADY_EXISTS");
  } catch (error) {
    if (error?.outsiderCode === "OUTPUT_DIRECTORY_ALREADY_EXISTS") throw error;
    if (error?.code !== "ENOENT") fail("OUTPUT_DIRECTORY_UNAVAILABLE");
  }
  mkdirSync(absolute, { mode: 0o700 });
  chmodSync(absolute, 0o700);
  fsyncDirectory(parent);
  if (realpathSync(absolute) !== absolute || readdirSync(absolute).length !== 0) {
    fail("OUTPUT_DIRECTORY_UNSAFE");
  }
  return absolute;
}

function publishAtomicCanonicalRecord(directory, value) {
  const bytes = canonicalBytes(value);
  const suffix = randomBytes(16).toString("hex");
  const temporary = path.join(directory, `.bridge-${suffix}.tmp`);
  const finalFile = path.join(directory, "bridge.json");
  let descriptor;
  try {
    descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  try {
    linkSync(temporary, finalFile);
    fsyncDirectory(directory);
  } catch {
    fail("BRIDGE_RECORD_ATOMIC_PUBLISH_FAILED");
  } finally {
    try { unlinkSync(temporary); } catch { /* best-effort private temp cleanup */ }
  }
  fsyncDirectory(directory);
  const published = readPrivateCanonicalFile(finalFile, {
    bytes: bytes.length,
    sha256: sha256(bytes),
  }, "PUBLISHED_BRIDGE_RECORD");
  if (readdirSync(directory).length !== 1
    || readdirSync(directory)[0] !== "bridge.json") {
    fail("OUTPUT_DIRECTORY_MEMBERS_INVALID");
  }
  return Object.freeze({
    name: "bridge.json",
    bytes: published.bytes.length,
    sha256: published.sha256,
    mode: "0600",
  });
}

function parseConfig(configFile) {
  const read = readPrivateCanonicalFile(configFile, null, "CONFIG");
  const value = exactObject(read.value, ["schema", "schemaVersion", "sourceRun",
    "expected", "observedAt", "formationDeadline"], "CONFIG");
  if (value.schema
    !== "outsider/globalping-witness-observation-bridge-run-config/v1"
    || value.schemaVersion !== "1.0.0") fail("CONFIG_SCHEMA_INVALID");
  exactObject(value.sourceRun, ["inputFile", "episodeDirectory"], "SOURCE_RUN");
  const inputFile = sourceReference(value.sourceRun.inputFile);
  if (typeof value.sourceRun.episodeDirectory !== "string"
    || value.sourceRun.episodeDirectory.length < 1
    || value.sourceRun.episodeDirectory.includes("\0")) {
    fail("SOURCE_EPISODE_DIRECTORY_INVALID");
  }
  const sourceInputPath = resolveReference(read.absolute, inputFile.path);
  const sourceInput = readPrivateCanonicalFile(sourceInputPath, inputFile,
    "SOURCE_INPUT");
  exactObject(sourceInput.value, ["executionBinding", "planInput"],
    "SOURCE_INPUT");
  const episodeDirectory = resolveReference(read.absolute,
    value.sourceRun.episodeDirectory);
  if (sourceInput.value.executionBinding?.privateEpisodeDirectory
    !== episodeDirectory) fail("SOURCE_EPISODE_CROSS_BINDING_INVALID");
  return Object.freeze({
    configFile: read,
    bridgeInput: {
      globalpingPlanInput: sourceInput.value.planInput,
      privateEpisodeDirectory: episodeDirectory,
      expected: value.expected,
      observedAt: value.observedAt,
      formationDeadline: value.formationDeadline,
    },
  });
}

export function runGlobalpingWitnessObservationBridgeV1(input = {}) {
  exactObject(input, ["configFile", "outputDirectory"], "RUN_INPUT");
  if (typeof input.configFile !== "string"
    || typeof input.outputDirectory !== "string") fail("RUN_PATH_INVALID");
  const config = parseConfig(path.resolve(input.configFile));
  const bridge = createGlobalpingWitnessObservationBridgeV1(config.bridgeInput);
  const outputDirectory = newOutputDirectory(input.outputDirectory);
  const bridgeFile = publishAtomicCanonicalRecord(outputDirectory, bridge);
  return Object.freeze({
    schema: "outsider/globalping-witness-observation-bridge-run/v1",
    bridgeHash: bridge.bridgeHash,
    sourceBindingHash: bridge.sourceBindingHash,
    recordClass: bridge.recordClass,
    disposition: bridge.disposition,
    outputDirectory,
    bridgeFile,
    configFileBytes: config.configFile.bytes.length,
    configFileSha256: config.configFile.sha256,
    outputDirectoryMode: "0700",
    networkIoPerformed: false,
    paymentPerformed: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
}

function args(argv) {
  if (argv.length !== 4 || argv[0] !== "--config"
    || argv[2] !== "--output-directory") fail("ARGS_INVALID");
  return { configFile: argv[1], outputDirectory: argv[3] };
}

async function main() {
  try {
    const result = runGlobalpingWitnessObservationBridgeV1(
      args(process.argv.slice(2)));
    process.stdout.write(`${canonicalizeStrict(result)}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

