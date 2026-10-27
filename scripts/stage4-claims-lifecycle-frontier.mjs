#!/usr/bin/env node

import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  DurableStage4ClaimsLifecycleFrontier,
} from "../src/outsider-stage4-claims-lifecycle-frontier.js";

function usage() {
  return [
    "Outsider Stage 4 durable claims-lifecycle frontier",
    "",
    "  node scripts/stage4-claims-lifecycle-frontier.mjs verify --directory <registry> [--required-checkpoint <json>] [--out <new.json>]",
    "  node scripts/stage4-claims-lifecycle-frontier.mjs report --directory <registry> [--as-of <ISO>] [--out <new.json>]",
    "  node scripts/stage4-claims-lifecycle-frontier.mjs checkpoint --directory <registry> --operator-private-key <pem> [--created-at <ISO>] [--out <new.json>]",
    "",
    "The CLI verifies or reports the local signed frontier. It never pays, settles,",
    "establishes coverage/custody, or closes an obligation.",
  ].join("\n");
}

function parse(argv) {
  const [command, ...tokens] = argv;
  if (!["verify", "report", "checkpoint"].includes(command)) {
    throw new Error("COMMAND_INVALID");
  }
  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value == null || value.startsWith("--")) {
      throw new Error("OPTION_INVALID");
    }
    const key = flag.slice(2);
    if (options[key] !== undefined) throw new Error(`OPTION_DUPLICATED:${flag}`);
    options[key] = value;
  }
  const allowed = new Set(command === "verify"
    ? ["directory", "required-checkpoint", "out"]
    : command === "report" ? ["directory", "as-of", "out"]
      : ["directory", "operator-private-key", "created-at", "out"]);
  const unknown = Object.keys(options).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`OPTION_UNKNOWN:--${unknown}`);
  return { command, options };
}

function required(options, name) {
  if (typeof options[name] !== "string" || options[name].length === 0) {
    throw new Error(`OPTION_REQUIRED:--${name}`);
  }
  return options[name];
}

function regularFile(file, label) {
  const stats = lstatSync(file);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 4 * 1024 * 1024) {
    throw new Error(`${label}_INVALID`);
  }
}

function readJson(file, label) {
  const target = path.resolve(file);
  regularFile(target, label);
  let value;
  try { value = JSON.parse(readFileSync(target, "utf8")); }
  catch { throw new Error(`${label}_JSON_INVALID`); }
  return value;
}

function emit(value, output) {
  const bytes = `${canonicalizeStrict(value)}\n`;
  if (output) {
    const target = path.resolve(output);
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  }
  process.stdout.write(bytes);
}

if (["--help", "-h"].includes(process.argv[2])) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

try {
  const { command, options } = parse(process.argv.slice(2));
  const directory = path.resolve(required(options, "directory"));
  const privateKeyFile = options["operator-private-key"];
  if (privateKeyFile) regularFile(path.resolve(privateKeyFile), "OPERATOR_PRIVATE_KEY");
  const ledger = new DurableStage4ClaimsLifecycleFrontier({
    directory,
    initializeIfMissing: false,
    operatorPrivateKeyPem: privateKeyFile
      ? readFileSync(path.resolve(privateKeyFile), "utf8") : null,
  });
  let result;
  if (command === "verify") {
    const checkpointFile = options["required-checkpoint"];
    result = ledger.verify({
      requiredCheckpoint: checkpointFile ? readJson(checkpointFile, "CHECKPOINT") : null,
    });
  } else if (command === "report") {
    result = ledger.report({ asOf: options["as-of"] ?? new Date() });
  } else {
    required(options, "operator-private-key");
    result = ledger.createCheckpoint({ createdAt: options["created-at"] ?? new Date() });
  }
  emit(result, options.out);
  if (result.ok === false) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error?.message ?? String(error)}\n\n${usage()}\n`);
  process.exitCode = 1;
}
