#!/usr/bin/env node

/*
 * V3 first-reality CLI. Ordinary commands retain v2 semantics. The new
 * emergency commands first capture a live legacy driver, issue a stopped
 * lease after it exits, then require a separate proposal and exact confirm.
 */

import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { canonicalizeStrict } from "../src/canonical.js";
import { createFirstCommittedDigitalRealityProductionLauncherV3 }
  from "../src/outsider-first-committed-digital-reality-production-launcher-v3.js";
import { publicOutcomeRunViewV1 }
  from "../src/outsider-production-outcome-runner-v1.js";

const HELP = `Usage:
  outsider-first-committed-reality-production-v3.mjs goal --request FILE --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v3.mjs proposal --request-id ID --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v3.mjs confirm --request-id ID --program-hash HASH --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v3.mjs confirm-and-drive --request-id ID --program-hash HASH --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v3.mjs resume --request-id ID --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v3.mjs inspect --program-id ID --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v3.mjs observe-legacy-driver --observation-id ID --request-id ID --program-id ID --program-hash HASH --driver-pid PID --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v3.mjs finalize-driver-stop --observation-id ID --authorization-evidence-hash HASH --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v3.mjs emergency-proposal --request FILE --profile-dir DIR --runtime-dir DIR
  outsider-first-committed-reality-production-v3.mjs emergency-confirm --intervention-id ID --emergency-request-hash HASH --authorization-evidence-hash HASH --profile-dir DIR --runtime-dir DIR

Observe accepts only the exact v2 resume command launched under Node
--inspect-brk, paused before user/provider code. Stop that migration-only
sentinel outside this CLI, then finalize-driver-stop. The resulting lease
and exact final journal head go into the mode-0600 emergency request.
Emergency-proposal makes no provider mutation. Emergency-confirm must repeat
its exact request hash and separately binds authorization evidence. It never
writes witness success; closure/release reuse v2 adapters and v1 operation IDs.`;

function fail(code) {
  const error = new TypeError(
    `OUTSIDER_FIRST_COMMITTED_REALITY_PRODUCTION_CLI_V3_${code}`);
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

function privateJsonFile(file) {
  const resolved = path.resolve(file);
  let metadata;
  try { metadata = lstatSync(resolved); }
  catch { fail("EMERGENCY_REQUEST_FILE_MISSING"); }
  if (!metadata.isFile() || metadata.isSymbolicLink()
    || (metadata.mode & 0o777) !== 0o600
    || metadata.size < 2 || metadata.size > 64 * 1024) {
    fail("EMERGENCY_REQUEST_FILE_NOT_PRIVATE_REGULAR_FILE");
  }
  return jsonFile(resolved);
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
    "observe-legacy-driver": ["observation-id", "request-id", "program-id",
      "program-hash", "driver-pid", "profile-dir", "runtime-dir"],
    "finalize-driver-stop": ["observation-id", "authorization-evidence-hash",
      "profile-dir", "runtime-dir"],
    "emergency-proposal": ["request", "profile-dir", "runtime-dir"],
    "emergency-confirm": ["intervention-id", "emergency-request-hash",
      "authorization-evidence-hash", "profile-dir", "runtime-dir"],
  };
  if (!Object.hasOwn(commandFlags, command)) fail("COMMAND_INVALID");
  exactFlags(flags, commandFlags[command]);
  const launcher = createFirstCommittedDigitalRealityProductionLauncherV3({
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
  if (command === "observe-legacy-driver") {
    const driverPid = Number(flags["driver-pid"]);
    if (!Number.isSafeInteger(driverPid) || driverPid < 1) {
      fail("DRIVER_PID_INVALID");
    }
    output(await launcher.observeLegacyDriver({
      observationId: flags["observation-id"],
      requestId: flags["request-id"],
      programId: flags["program-id"],
      programHash: flags["program-hash"],
      driverPid,
    }));
    return;
  }
  if (command === "finalize-driver-stop") {
    output(await launcher.finalizeStoppedDriver({
      observationId: flags["observation-id"],
      stopAuthorizationEvidenceHash: flags["authorization-evidence-hash"],
    }));
    return;
  }
  if (command === "emergency-proposal") {
    output(await launcher.requestEmergencyFailClose(
      privateJsonFile(flags.request)));
    return;
  }
  if (command === "emergency-confirm") {
    output(publicOutcomeRunViewV1(
      await launcher.confirmEmergencyFailClose({
        interventionId: flags["intervention-id"],
        emergencyRequestHash: flags["emergency-request-hash"],
        authorizationEvidenceHash: flags["authorization-evidence-hash"],
      })));
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
    `OUTSIDER_FIRST_COMMITTED_REALITY_PRODUCTION_CLI_V3_ERROR:${code}\n`);
  process.exitCode = 1;
});
