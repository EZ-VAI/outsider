#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildCausalJudgeSurvivalReport, verifyCausalJudgeSurvivalReport,
} from "../src/outsider-causal-judge-survival.js";

function usage() {
  return [
    "Usage: node scripts/stage15-causal-judge-survival.mjs --input FILE",
    "  --source-map FILE --pinned-governance-key-id KEY_ID [options]",
    "",
    "Input JSON: { policy, bundles, mechanismCandidates, createdAt }",
    "Source-map JSON: { sourceId: \"relative/path/to/exact-source-bytes\" }",
    "Options:",
    "  --out FILE   Write canonical report with no clobber instead of stdout",
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
    if (flag === "--input") output.input = value;
    else if (flag === "--source-map") output.sourceMap = value;
    else if (flag === "--pinned-governance-key-id") output.pins.push(value);
    else if (flag === "--out") output.out = value;
    else throw new Error(`UNKNOWN_OPTION:${flag}`);
  }
  if (!output.input || !output.sourceMap || output.pins.length < 1) {
    throw new Error("INPUT_SOURCE_MAP_AND_PIN_REQUIRED");
  }
  return output;
}

function loadSources(filename) {
  const absoluteMap = path.resolve(filename);
  const base = path.dirname(absoluteMap);
  const mapping = JSON.parse(readFileSync(absoluteMap, "utf8"));
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new Error("SOURCE_MAP_INVALID");
  }
  return Object.fromEntries(Object.entries(mapping).map(([id, relative]) => {
    if (typeof relative !== "string" || path.isAbsolute(relative)) {
      throw new Error(`SOURCE_PATH_MUST_BE_RELATIVE:${id}`);
    }
    const resolved = path.resolve(base, relative);
    if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
      throw new Error(`SOURCE_PATH_ESCAPES_MAP_DIRECTORY:${id}`);
    }
    return [id, readFileSync(resolved)];
  }));
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) { process.stdout.write(`${usage()}\n`); process.exit(0); }
  const input = JSON.parse(readFileSync(path.resolve(options.input), "utf8"));
  const sources = loadSources(options.sourceMap);
  const report = buildCausalJudgeSurvivalReport(input,
    { pinnedGovernanceKeyIds: options.pins, sources });
  const checked = verifyCausalJudgeSurvivalReport(report, {
    policy: input.policy, pinnedGovernanceKeyIds: options.pins,
    bundles: input.bundles ?? [], mechanismCandidates: input.mechanismCandidates ?? [], sources,
  });
  if (!checked.ok) throw new Error(checked.error);
  const output = `${canonicalizeStrict(report)}\n`;
  if (options.out) writeFileSync(path.resolve(options.out), output, { flag: "wx", mode: 0o600 });
  else process.stdout.write(output);
} catch (error) {
  process.stderr.write(`stage15-causal-judge-survival: ${error?.message ?? String(error)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exit(1);
}
