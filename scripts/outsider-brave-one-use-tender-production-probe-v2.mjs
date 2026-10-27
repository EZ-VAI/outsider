#!/usr/bin/env node

/*
 * 0600 production CLI for one Brave request and one unified seller-origin
 * read-only probe. It accepts the existing v1 compiled input and capability
 * formats. No POST or payment branch exists.
 */

import {
  closeSync,
  constants,
  existsSync,
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
import { runBraveOneUseTenderProductionProbeV2 }
  from "../src/outsider-brave-one-use-tender-production-probe-v2.js";

const PREFIX = "OUTSIDER_BRAVE_ONE_USE_TENDER_PRODUCTION_PROBE_CLI_V2_";
const HELP = `Usage:
  outsider-brave-one-use-tender-production-probe-v2.mjs probe \\
    --input VERSIONED_0600_JSON --capability BRAVE_0600_JSON \\
    --transcript APPEND_ONLY_0600_JSONL

This command accepts the existing v1 compiled probe input. It performs at
most one Brave search, consumes one seller-origin lease once, checks
/.well-known/outsider, and only if needed inspects the seller Web root. It
performs zero tender POSTs, zero email sends, and zero payments.`;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { command: "help", flags: {} };
  }
  if (argv[0] !== "probe" || argv.length !== 7) fail("ARGUMENTS_INVALID");
  const flags = {};
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!["--input", "--capability", "--transcript"].includes(name)
      || typeof value !== "string" || value.length < 1
      || Object.hasOwn(flags, name)) fail("ARGUMENTS_INVALID");
    flags[name] = value;
  }
  if (Object.keys(flags).length !== 3) fail("ARGUMENTS_INVALID");
  return { command: "probe", flags };
}

function secureRegularFile(filename, maximumBytes, code) {
  const absolute = path.resolve(filename);
  let stat;
  try { stat = lstatSync(absolute, { bigint: true }); }
  catch { fail(`${code}_UNREADABLE`); }
  if (!stat.isFile() || stat.isSymbolicLink()
    || Number(stat.mode & 0o777n) !== 0o600
    || stat.size < 2n || stat.size > BigInt(maximumBytes)
    || realpathSync(absolute) !== absolute
    || (typeof process.getuid === "function"
      && stat.uid !== BigInt(process.getuid()))) fail(`${code}_SAFETY_INVALID`);
  return absolute;
}

function secureJson(filename, maximumBytes, code) {
  const absolute = secureRegularFile(filename, maximumBytes, code);
  const bytes = readFileSync(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { bytes.fill(0); fail(`${code}_JSON_INVALID`); }
  bytes.fill(0);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${code}_JSON_INVALID`);
  }
  return value;
}

function braveCapability(filename) {
  const value = secureJson(filename, 16 * 1024, "CAPABILITY_FILE");
  const keys = Object.keys(value);
  const versioned = keys.length === 3
    && keys.includes("schema") && keys.includes("schemaVersion")
    && keys.includes("apiToken")
    && value.schema === "outsider/brave-search-api-capability/v1"
    && value.schemaVersion === "1.0.0";
  const legacyMinimal = keys.length === 1 && keys[0] === "apiToken";
  if ((!versioned && !legacyMinimal) || typeof value.apiToken !== "string"
    || value.apiToken.length < 1 || value.apiToken.length > 4_096
    || /[\r\n\u0000]/u.test(value.apiToken)) fail("CAPABILITY_FILE_INVALID");
  return value;
}

function transcript(filename) {
  const absolute = path.resolve(filename);
  const parent = path.dirname(absolute);
  let parentStat;
  try { parentStat = lstatSync(parent, { bigint: true }); }
  catch { fail("TRANSCRIPT_PARENT_INVALID"); }
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()
    || realpathSync(parent) !== parent
    || (typeof process.getuid === "function"
      && parentStat.uid !== BigInt(process.getuid()))) {
    fail("TRANSCRIPT_PARENT_INVALID");
  }
  let descriptor;
  if (existsSync(absolute)) {
    secureRegularFile(absolute, 64 * 1024 * 1024, "TRANSCRIPT_FILE");
    descriptor = openSync(absolute,
      constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
  } else {
    descriptor = openSync(absolute, constants.O_WRONLY | constants.O_APPEND
      | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  }
  return {
    append(value) {
      const line = `${canonicalizeStrict(value)}\n`;
      writeSync(descriptor, line, null, "utf8");
      fsyncSync(descriptor);
    },
    close() {
      if (descriptor === null) return;
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = null;
    },
  };
}

function publicFailure(error) {
  const raw = typeof error?.outsiderCode === "string"
    ? error.outsiderCode : typeof error?.message === "string"
        && /^OUTSIDER_[A-Z0-9_]+$/u.test(error.message)
      ? error.message : "UNEXPECTED_FAILURE";
  return Object.freeze({
    schema: "outsider/brave-one-use-tender-production-probe-failure/v2",
    schemaVersion: "2.0.0", status: "FAILED_CLOSED", failureCode: raw,
    braveRequestAttemptCount:
      error?.braveRequestAttemptCount === 0 ? 0 : null,
    sellerOriginLeaseClaimCount: null,
    secondBraveSearchRequestCount: 0,
    sellerDescriptorProbeInvocationCount: null,
    sellerWebNativeFallbackInvocationCount: null,
    tenderPostAttemptCount: 0, paymentAttemptCount: 0,
    humanQueueCreated: false,
    formationDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    authority: "NONE", decisionState: "HOLD",
  });
}

export async function main(argv, dependencies = {}) {
  const writeOutput = dependencies.writeOutput
    ?? ((text) => process.stdout.write(text));
  const writeError = dependencies.writeError
    ?? ((text) => process.stderr.write(text));
  if (typeof writeOutput !== "function" || typeof writeError !== "function") {
    fail("OUTPUT_INVALID");
  }
  const parsed = parse(argv);
  if (parsed.command === "help") {
    writeOutput(`${HELP}\n`);
    return null;
  }
  const input = secureJson(parsed.flags["--input"], 32 * 1024 * 1024,
    "INPUT_FILE");
  const capability = braveCapability(parsed.flags["--capability"]);
  const journal = transcript(parsed.flags["--transcript"]);
  try {
    const result = await runBraveOneUseTenderProductionProbeV2(input, {
      apiToken: capability.apiToken,
      braveFetchImpl: dependencies.braveFetchImpl ?? globalThis.fetch,
      braveTimeoutMs: dependencies.braveTimeoutMs ?? 8_000,
      descriptorTransportConfig: dependencies.descriptorTransportConfig ?? {},
      descriptorTimeoutMs: dependencies.descriptorTimeoutMs ?? 15_000,
    });
    journal.append(result);
    writeOutput(`${canonicalizeStrict(result)}\n`);
    return result;
  } catch (error) {
    const failure = publicFailure(error);
    journal.append(failure);
    writeError(`${failure.failureCode}\n`);
    throw error;
  } finally {
    capability.apiToken = "";
    journal.close();
  }
}

if (process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => { process.exitCode = 1; });
}
