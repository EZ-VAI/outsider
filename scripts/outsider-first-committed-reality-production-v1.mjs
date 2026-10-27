#!/usr/bin/env node

/*
 * Dedicated first-production-milestone entrance. Provider secrets are read
 * only from the fixed 0600 credentials file in --profile-dir. There are no
 * token, password, API-key, or environment-secret inputs.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { canonicalizeStrict } from "../src/canonical.js";
import { createFirstCommittedDigitalRealityProductionLauncherV1 }
  from "../src/outsider-first-committed-digital-reality-production-launcher-v1.js";
import { publicOutcomeRunViewV1 }
  from "../src/outsider-production-outcome-runner-v1.js";

const HELP = `Usage:
  outsider-first-committed-reality-production-v1.mjs goal --request FILE --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v1.mjs proposal --request-id ID --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v1.mjs confirm --request-id ID --program-hash HASH --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v1.mjs confirm-and-drive --request-id ID --program-hash HASH --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v1.mjs resume --request-id ID --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v1.mjs inspect --program-id ID --profile-dir DIR --runtime-dir DIR

Profile directory files (both JSON/config and artifact must be mode 0600):
  outsider-first-reality-profile-v1.json
  outsider-first-reality-credentials-v1.json  (needed only after exact confirm)

The goal command makes no provider call. Confirm requires the exact proposal
programHash and prints only the secret-free public run view. Confirm-and-drive
waits for retryAfter and resumes autonomously without another confirmation.`;

function fail(code) {
  const error = new TypeError(
    `OUTSIDER_FIRST_COMMITTED_REALITY_PRODUCTION_CLI_V1_${code}`);
  error.outsiderCode = code;
  throw error;
}

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { command: "help", flags: {} };
  }
  const flags = {};
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (typeof name !== "string" || !/^--[a-z][a-z-]*$/u.test(name)
      || typeof value !== "string" || value.length < 1
      || Object.hasOwn(flags, name.slice(2))) fail("ARGUMENTS_INVALID");
    flags[name.slice(2)] = value;
  }
  return { command: argv[0], flags };
}

function exactFlags(flags, expected) {
  if (canonicalizeStrict(Object.keys(flags).sort())
    !== canonicalizeStrict([...expected].sort())) fail("FLAGS_INVALID");
}

function jsonFile(file) {
  let input;
  try { input = JSON.parse(readFileSync(path.resolve(file), "utf8")); }
  catch { fail("REQUEST_FILE_INVALID"); }
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    fail("REQUEST_FILE_INVALID");
  }
  return input;
}

function output(value) {
  process.stdout.write(`${canonicalizeStrict(value)}\n`);
}

async function main(argv) {
  const { command, flags } = parse(argv);
  if (command === "help") {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const commandFlags = {
    goal: ["request", "profile-dir", "runtime-dir"],
    proposal: ["request-id", "profile-dir", "runtime-dir"],
    confirm: ["request-id", "program-hash", "profile-dir", "runtime-dir"],
    "confirm-and-drive": [
      "request-id", "program-hash", "profile-dir", "runtime-dir"],
    resume: ["request-id", "profile-dir", "runtime-dir"],
    inspect: ["program-id", "profile-dir", "runtime-dir"],
  };
  if (!Object.hasOwn(commandFlags, command)) fail("COMMAND_INVALID");
  exactFlags(flags, commandFlags[command]);
  const launcher = createFirstCommittedDigitalRealityProductionLauncherV1({
    profileDirectory: flags["profile-dir"],
    runtimeDirectory: flags["runtime-dir"],
  });
  if (command === "goal") {
    output(await launcher.requestOutcome(jsonFile(flags.request)));
    return;
  }
  if (command === "proposal") {
    output(launcher.proposal(flags["request-id"]));
    return;
  }
  if (command === "confirm" || command === "confirm-and-drive") {
    const confirmation = {
      requestId: flags["request-id"],
      programHash: flags["program-hash"],
    };
    const result = command === "confirm"
      ? await launcher.confirmOutcome(confirmation)
      : await launcher.confirmAndDrive(confirmation);
    output(publicOutcomeRunViewV1(result));
    return;
  }
  if (command === "resume") {
    output(publicOutcomeRunViewV1(
      await launcher.resumeConfirmed(flags["request-id"])));
    return;
  }
  output(publicOutcomeRunViewV1(launcher.inspectProgram(flags["program-id"])));
}

main(process.argv.slice(2)).catch((error) => {
  const code = typeof error?.outsiderCode === "string" ? error.outsiderCode
    : typeof error?.message === "string"
        && /^OUTSIDER_[A-Z0-9_]+$/u.test(error.message)
      ? error.message : "UNEXPECTED_FAILURE";
  process.stderr.write(
    `OUTSIDER_FIRST_COMMITTED_REALITY_PRODUCTION_CLI_ERROR:${code}\n`);
  process.exitCode = 1;
});
