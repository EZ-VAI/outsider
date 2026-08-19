#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { verifyCoworkConformance } from "../src/outsider-cowork-conformance.js";

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const workspace = valueAfter("--workspace");
const stateRoot = valueAfter("--state-root")
  ?? process.env.OUTSIDER_STATE_ROOT
  ?? path.join(process.env.HOME, ".outsider", "attached");
const promptFile = valueAfter("--expected-prompt-file");
if (!workspace) {
  process.stderr.write("usage: stage05-cowork-conformance --workspace <path> [--state-root <path>] [--expected-prompt-file <path>]\n");
  process.exit(64);
}
const result = verifyCoworkConformance({
  stateRoot: path.resolve(stateRoot),
  workspace: path.resolve(workspace),
  expectedPrompt: promptFile ? readFileSync(path.resolve(promptFile), "utf8").trim() : null,
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.ok ? 0 : 1;
