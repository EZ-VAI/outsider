#!/usr/bin/env node

/* Offline operator surface for the First Reality Episode readiness contract. */

import { readFileSync } from "node:fs";
import {
  FIRST_REALITY_EPISODE_PROFILES,
  createFirstRealityEpisodePlan,
  preflightFirstRealityEpisode,
  verifyFirstRealityEpisodePlan,
} from "../src/outsider-first-reality-episode.js";

const DEFAULT_HORIZONS = Object.freeze([
  Object.freeze({ horizonId: "IMMEDIATE", closesAfterMs: 0, mandatory: true }),
  Object.freeze({ horizonId: "DELAYED_24H", closesAfterMs: 86_400_000, mandatory: true }),
  Object.freeze({ horizonId: "RECOVERY_30D", closesAfterMs: 2_592_000_000,
    mandatory: true }),
]);

function usage(stream = process.stdout) {
  stream.write([
    "usage:",
    "  node tools/outsider-first-reality-episode.mjs profiles",
    "  node tools/outsider-first-reality-episode.mjs plan --plan-id ID --profile REMOTE_ACTION|PHYSICAL_ACTION [--horizons-json JSON]",
    "  node tools/outsider-first-reality-episode.mjs verify --input FILE|-",
    "  node tools/outsider-first-reality-episode.mjs preflight --input FILE|-",
    "",
    "The command is offline and writes JSON only to stdout. A missing census slot",
    "is represented as null and preflights to WAITING; it is not auto-generated.",
    "",
  ].join("\n"));
}

function fail(code) {
  throw new Error(`FIRST_REALITY_EPISODE_CLI_${code}`);
}

function parseFlags(args, allowed) {
  const output = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!flag.startsWith("--") || !allowed.has(flag)) fail("ARGUMENT_INVALID");
    if (index + 1 >= args.length || args[index + 1].startsWith("--")) {
      fail("ARGUMENT_VALUE_REQUIRED");
    }
    if (Object.hasOwn(output, flag)) fail("ARGUMENT_DUPLICATE");
    output[flag] = args[index + 1];
    index += 1;
  }
  return output;
}

function parseJson(text, code) {
  try { return JSON.parse(text); }
  catch { fail(code); }
}

function readJsonInput(value) {
  if (typeof value !== "string") fail("INPUT_REQUIRED");
  const bytes = value === "-" ? readFileSync(0) : readFileSync(value);
  return parseJson(bytes.toString("utf8"), "INPUT_JSON_INVALID");
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const [command, ...args] = process.argv.slice(2);

try {
  if (command === undefined || command === "--help" || command === "-h") {
    usage();
  } else if (command === "profiles") {
    if (args.length !== 0) fail("ARGUMENT_INVALID");
    emit({ profiles: Object.values(FIRST_REALITY_EPISODE_PROFILES) });
  } else if (command === "plan") {
    const flags = parseFlags(args, new Set([
      "--plan-id", "--profile", "--horizons-json",
    ]));
    if (flags["--plan-id"] === undefined || flags["--profile"] === undefined) {
      fail("PLAN_ID_AND_PROFILE_REQUIRED");
    }
    const horizons = flags["--horizons-json"] === undefined
      ? DEFAULT_HORIZONS : parseJson(flags["--horizons-json"], "HORIZONS_JSON_INVALID");
    emit(createFirstRealityEpisodePlan({
      planId: flags["--plan-id"],
      profile: flags["--profile"],
      attemptCensusSlotCommitmentHash: null,
      observationHorizons: horizons,
    }));
  } else if (command === "verify" || command === "preflight") {
    const flags = parseFlags(args, new Set(["--input"]));
    const plan = readJsonInput(flags["--input"]);
    const result = command === "verify"
      ? verifyFirstRealityEpisodePlan(plan)
      : preflightFirstRealityEpisode(plan);
    emit(result);
    if (result.ok === false) process.exitCode = 1;
  } else {
    fail("COMMAND_INVALID");
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
