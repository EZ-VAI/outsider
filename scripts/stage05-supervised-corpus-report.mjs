#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { summarizeSupervisedExperience } from "../src/outsider-supervised-corpus.js";

const argv = process.argv.slice(2);
const value = (flag, fallback) => {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : fallback;
};
const root = path.resolve(value("--root", "artifacts"));
const output = path.resolve(value("--out", path.join(root, "supervised-corpus-report.json")));

function collect(directory, out = []) {
  for (const name of readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    const stat = statSync(file);
    if (stat.isDirectory()) collect(file, out);
    else if (name === "stage05-supervised-experience.json") out.push(file);
  }
  return out;
}

const files = collect(root);
const records = [];
const parseRefusals = [];
for (const file of files) {
  try { records.push(JSON.parse(readFileSync(file, "utf8"))); }
  catch (error) { parseRefusals.push({ pathHashOnly: true, reason: String(error?.message ?? error) }); }
}
const report = summarizeSupervisedExperience(records);
report.counts.parseRefused = parseRefusals.length;
report.claimBoundary = {
  rootHashOnly: true,
  note: "paths and raw prompts are not exported; the report is a local L1 corpus inventory",
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ output, ...report.counts }, null, 2));

