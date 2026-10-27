#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  replayStage1CorpusRegistryLifecycleSources,
  verifyStage1CorpusRegistryLifecycleStructure,
} from "../src/outsider-stage1-lifecycle-frontier.js";

function usage() {
  return [
    "Outsider Stage 1 lifecycle/source-reverification frontier",
    "",
    "  node scripts/stage1-lifecycle-frontier.mjs verify-corpus --dir <registry> [--now <ISO>] [--out <new.json>]",
    "  node scripts/stage1-lifecycle-frontier.mjs replay-corpus --expected-profile <SIX_SET_V1|SEVEN_SET_NHTSA_V2|EIGHT_SET_NHTSA_WAVE5_V3> --dir <registry> --agent-artifact-dir <dir> --wave2-source-root <dir> --robotics-source-root <dir> --droid-artifact-dir <dir> --droid-source-root <dir> --wave4-source-root <dir> [--wave3-source-root <dir>] [--nhtsa-csv <official.csv> --nhtsa-data-dictionary <official.pdf>] [--wave5-source-root <dir>] [--now <ISO>] [--out <new.json>]",
  ].join("\n");
}

function parse(argv) {
  const [command, ...tokens] = argv;
  if (!["verify-corpus", "replay-corpus"].includes(command)) throw new Error("COMMAND_INVALID");
  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value == null || value.startsWith("--")) {
      throw new Error("OPTION_INVALID");
    }
    const key = flag.slice(2);
    if (options[key] != null) throw new Error(`OPTION_DUPLICATED:${flag}`);
    options[key] = value;
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`OPTION_REQUIRED:--${name}`);
  return value;
}

function emit(result, output) {
  const bytes = `${canonicalizeStrict(result)}\n`;
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
  const allowed = new Set(command === "verify-corpus"
    ? ["dir", "now", "out"]
    : ["expected-profile", "dir", "agent-artifact-dir", "wave2-source-root", "robotics-source-root",
      "droid-artifact-dir", "droid-source-root", "wave4-source-root", "wave3-source-root",
      "nhtsa-csv", "nhtsa-data-dictionary", "wave5-source-root", "now", "out"]);
  const unknown = Object.keys(options).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`OPTION_UNKNOWN:--${unknown}`);
  const common = { directory: requireOption(options, "dir"),
    now: options.now ?? new Date().toISOString() };
  const result = command === "verify-corpus"
    ? verifyStage1CorpusRegistryLifecycleStructure(common)
    : await replayStage1CorpusRegistryLifecycleSources({ ...common,
      expectedProfile: requireOption(options, "expected-profile"),
      agentArtifactDirectory: requireOption(options, "agent-artifact-dir"),
      wave2SourceRoot: requireOption(options, "wave2-source-root"),
      roboticsSourceRoot: requireOption(options, "robotics-source-root"),
      droidArtifactDirectory: requireOption(options, "droid-artifact-dir"),
      droidSourceRoot: requireOption(options, "droid-source-root"),
      wave4SourceRoot: requireOption(options, "wave4-source-root"),
      wave3SourceRoot: options["wave3-source-root"] ?? null,
      nhtsaCsvPath: options["nhtsa-csv"] ?? null,
      nhtsaDataDictionaryPath: options["nhtsa-data-dictionary"] ?? null,
      wave5SourceRoot: options["wave5-source-root"] ?? null });
  emit(result, options.out);
  if (result.ok === false) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
  process.exitCode = 1;
}
