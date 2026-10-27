#!/usr/bin/env node

/*
 * Thin production CLI over the domain-neutral outcome runner.
 *
 * Provider secrets are intentionally not accepted as CLI flags or read from
 * the environment here. A trusted composition module creates credential-
 * bearing adapters and returns only their public adapter surfaces.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createProductionOutcomeRunnerV1,
  publicOutcomeRunViewV1,
} from "../src/outsider-production-outcome-runner-v1.js";

const HELP = `Usage:
  outsider-production-outcome-v1.mjs propose --program FILE --runtime-dir DIR
  outsider-production-outcome-v1.mjs request --request FILE --runtime-dir DIR --composition MODULE
  outsider-production-outcome-v1.mjs confirm --request-id ID --program-hash HASH --runtime-dir DIR --composition MODULE
  outsider-production-outcome-v1.mjs resume --request-id ID --runtime-dir DIR --composition MODULE
  outsider-production-outcome-v1.mjs proposal --request-id ID --runtime-dir DIR
  outsider-production-outcome-v1.mjs inspect --program-id ID --runtime-dir DIR --composition MODULE

Composition MODULE exports createOutsiderProductionCompositionV1(context),
or a default function/object with { adapters, discover?, compileGoal? }.
The CLI has no token/password/API-key flags and never prints adapter state.`;

function cliError(code) {
  const error = new TypeError(`OUTSIDER_PRODUCTION_OUTCOME_CLI_V1_${code}`);
  error.outsiderCode = code;
  throw error;
}

function parseArguments(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { command: "help", flags: Object.freeze({}) };
  }
  const command = argv[0];
  const flags = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (typeof key !== "string" || !/^--[a-z][a-z-]*$/u.test(key)
      || typeof value !== "string" || value.length === 0
      || Object.hasOwn(flags, key.slice(2))) cliError("ARGUMENTS_INVALID");
    flags[key.slice(2)] = value;
  }
  return { command, flags: Object.freeze(flags) };
}

function exactFlags(flags, required) {
  const actual = Object.keys(flags).sort();
  const expected = [...required].sort();
  if (canonicalizeStrict(actual) !== canonicalizeStrict(expected)) {
    cliError("FLAGS_INVALID");
  }
}

function jsonFile(file, code) {
  try {
    const parsed = JSON.parse(readFileSync(path.resolve(file), "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      cliError(code);
    }
    return parsed;
  } catch (error) {
    if (error?.outsiderCode) throw error;
    cliError(code);
  }
}

async function loadComposition(file, runtimeDirectory, command) {
  if (file === undefined) return { adapters: Object.freeze({}) };
  const namespace = await import(pathToFileURL(path.resolve(file)).href);
  const exported = namespace.createOutsiderProductionCompositionV1
    ?? namespace.default;
  const composition = typeof exported === "function"
    ? await exported(Object.freeze({ runtimeDirectory, command }))
    : exported;
  if (composition === null || typeof composition !== "object") {
    cliError("COMPOSITION_INVALID");
  }
  return composition;
}

function writePublic(value) {
  process.stdout.write(`${canonicalizeStrict(value)}\n`);
}

async function main(argv) {
  const { command, flags } = parseArguments(argv);
  if (command === "help") {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const flagSets = {
    propose: ["program", "runtime-dir"],
    request: ["request", "runtime-dir", "composition"],
    confirm: ["request-id", "program-hash", "runtime-dir", "composition"],
    resume: ["request-id", "runtime-dir", "composition"],
    proposal: ["request-id", "runtime-dir"],
    inspect: ["program-id", "runtime-dir", "composition"],
  };
  if (!Object.hasOwn(flagSets, command)) cliError("COMMAND_INVALID");
  exactFlags(flags, flagSets[command]);
  const composition = await loadComposition(
    flags.composition, flags["runtime-dir"], command);
  const runner = createProductionOutcomeRunnerV1({
    directory: flags["runtime-dir"],
    composition,
  });

  if (command === "propose") {
    writePublic(await runner.proposeProgram(
      jsonFile(flags.program, "PROGRAM_FILE_INVALID")));
    return;
  }
  if (command === "request") {
    writePublic(await runner.requestOutcome(
      jsonFile(flags.request, "REQUEST_FILE_INVALID")));
    return;
  }
  if (command === "confirm") {
    const projection = await runner.confirmOutcome({
      requestId: flags["request-id"],
      programHash: flags["program-hash"],
    }, composition.runOptions ?? {});
    writePublic(publicOutcomeRunViewV1(projection));
    return;
  }
  if (command === "resume") {
    const projection = await runner.resumeConfirmed(
      flags["request-id"], composition.runOptions ?? {});
    writePublic(publicOutcomeRunViewV1(projection));
    return;
  }
  if (command === "proposal") {
    writePublic(runner.proposal(flags["request-id"]));
    return;
  }
  writePublic(publicOutcomeRunViewV1(
    runner.inspectProgram(flags["program-id"])));
}

main(process.argv.slice(2)).catch((error) => {
  const code = typeof error?.outsiderCode === "string"
    ? error.outsiderCode
    : typeof error?.message === "string"
        && /^OUTSIDER_[A-Z0-9_]+$/u.test(error.message)
      ? error.message
      : "UNEXPECTED_FAILURE";
  process.stderr.write(`OUTSIDER_PRODUCTION_OUTCOME_CLI_ERROR:${code}\n`);
  process.exitCode = 1;
});
