#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import { verifyCeuReuseFrontierDirectory } from "../src/outsider-ceu-reuse-frontier.js";

function usage() {
  return [
    "Usage: node scripts/stage15-ceu-reuse-frontier.mjs --directory DIR",
    "  --governance-policy FILE --pinned-governance-key-id KEY_ID [options]",
    "",
    "Options:",
    "  --as-of ISO_TIME   Evaluate current rights state at this canonical instant",
    "  --out FILE         Write canonical JSON with no clobber instead of stdout",
  ].join("\n");
}

function parse(argv) {
  const output = { pins: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") return { help: true };
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`MISSING_VALUE:${flag}`);
    index += 1;
    if (flag === "--directory") output.directory = value;
    else if (flag === "--governance-policy") output.policyFile = value;
    else if (flag === "--pinned-governance-key-id") output.pins.push(value);
    else if (flag === "--as-of") output.asOf = value;
    else if (flag === "--out") output.out = value;
    else throw new Error(`UNKNOWN_OPTION:${flag}`);
  }
  if (!output.directory || !output.policyFile || output.pins.length === 0) {
    throw new Error("DIRECTORY_POLICY_AND_PIN_REQUIRED");
  }
  return output;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const governancePolicy = JSON.parse(readFileSync(path.resolve(options.policyFile), "utf8"));
  const checked = verifyCeuReuseFrontierDirectory({
    directory: path.resolve(options.directory), governancePolicy,
    pinnedGovernanceKeyIds: options.pins,
    asOf: options.asOf ?? new Date().toISOString(),
  });
  if (!checked.ok) throw new Error(checked.error);
  const output = `${canonicalizeStrict(checked.report)}\n`;
  if (options.out) writeFileSync(path.resolve(options.out), output,
    { flag: "wx", mode: 0o600 });
  else process.stdout.write(output);
} catch (error) {
  process.stderr.write(`stage15-ceu-reuse-frontier: ${error?.message ?? String(error)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exit(1);
}
