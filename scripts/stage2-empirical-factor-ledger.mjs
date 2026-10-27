#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildEmpiricalFactorLedger, replayEmpiricalFactorLedger,
} from "../src/outsider-empirical-factor-ledger.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaults = Object.freeze({
  wave3SourceDirectory: path.join(repositoryRoot,
    "artifacts/public-agent-wave3-20260821/source/cuarewardbench"),
  wave4SourceDirectory: path.join(repositoryRoot,
    "artifacts/public-agent-wave4-20260821/source/agentrx-tau"),
  botFailsSourceDirectory: path.join(repositoryRoot,
    "artifacts/curate-public-robotics-20260820/source/botfails"),
  ur5SourceDirectory: path.join(repositoryRoot,
    "artifacts/curate-public-robotics-20260820/source/ur5fail-execution"),
  droidArtifactDirectory: path.join(repositoryRoot,
    "artifacts/curate-droid100-20260902/real-pilot-v7-scoped-canonical-replay"),
  droidSourceDirectory: path.join(repositoryRoot,
    "artifacts/curate-droid100-20260819/source"),
  nhtsaRegistryDirectory: path.join(repositoryRoot,
    "artifacts/stage1-curate-corpus-registry-all-evidence-v6-scoped-replay-20260902"),
  nhtsaCsvPath: path.join(repositoryRoot,
    "artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv"),
  nhtsaDataDictionaryPath: path.join(repositoryRoot,
    "artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf"),
  nhtsaReplayAt: "2026-09-02T14:20:08.000Z",
});

function usage() {
  return [
    "Usage:",
    "  node scripts/stage2-empirical-factor-ledger.mjs [options]",
    "  node scripts/stage2-empirical-factor-ledger.mjs --replay <ledger.json> [options]",
    "",
    "Options:",
    "  --output <file>             create a new deterministic ledger JSON file",
    "  --replay <file>             verify a ledger by rebuilding all six sources",
    "  --wave3-source <dir>",
    "  --wave4-source <dir>",
    "  --botfails-source <dir>",
    "  --ur5-source <dir>",
    "  --droid-artifacts <dir>",
    "  --droid-source <dir>",
    "  --nhtsa-registry <dir>",
    "  --nhtsa-csv <file>",
    "  --nhtsa-data-dictionary <file>",
    "  --nhtsa-replay-at <ISO>",
    "  --help",
    "",
    "Without --output, the full ledger is written to stdout.",
  ].join("\n");
}

function parse(argv) {
  const options = { ...defaults, output: null, replay: null };
  const mapping = {
    "--output": "output",
    "--replay": "replay",
    "--wave3-source": "wave3SourceDirectory",
    "--wave4-source": "wave4SourceDirectory",
    "--botfails-source": "botFailsSourceDirectory",
    "--ur5-source": "ur5SourceDirectory",
    "--droid-artifacts": "droidArtifactDirectory",
    "--droid-source": "droidSourceDirectory",
    "--nhtsa-registry": "nhtsaRegistryDirectory",
    "--nhtsa-csv": "nhtsaCsvPath",
    "--nhtsa-data-dictionary": "nhtsaDataDictionaryPath",
    "--nhtsa-replay-at": "nhtsaReplayAt",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") return { help: true };
    const key = mapping[arg];
    if (!key || !argv[index + 1] || argv[index + 1].startsWith("--")) {
      throw new Error(`EMPIRICAL_LEDGER_ARGUMENT_INVALID:${arg}`);
    }
    options[key] = key === "nhtsaReplayAt" ? argv[index + 1]
      : path.resolve(argv[index + 1]);
    index += 1;
  }
  return options;
}

function sourceOptions(options) {
  return {
    wave3SourceDirectory: options.wave3SourceDirectory,
    wave4SourceDirectory: options.wave4SourceDirectory,
    botFailsSourceDirectory: options.botFailsSourceDirectory,
    ur5SourceDirectory: options.ur5SourceDirectory,
    droidArtifactDirectory: options.droidArtifactDirectory,
    nhtsaRegistryDirectory: options.nhtsaRegistryDirectory,
    nhtsaCsvPath: options.nhtsaCsvPath,
    nhtsaDataDictionaryPath: options.nhtsaDataDictionaryPath,
    nhtsaReplayAt: options.nhtsaReplayAt,
    droidSource: {
      objectListBytes: readFileSync(path.join(options.droidSourceDirectory, "gcs-objects.json")),
      datasetInfoBytes: readFileSync(path.join(options.droidSourceDirectory, "dataset_info.json")),
      featureBytes: readFileSync(path.join(options.droidSourceDirectory, "features.json")),
      shardBytes: readFileSync(path.join(options.droidSourceDirectory,
        "r2d2_faceblur-train.tfrecord-00000-of-00031")),
    },
  };
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const sources = sourceOptions(options);
  if (options.replay) {
    const ledger = JSON.parse(readFileSync(options.replay, "utf8"));
    const result = replayEmpiricalFactorLedger(ledger, sources);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } else {
    const ledger = buildEmpiricalFactorLedger(sources);
    const serialized = `${JSON.stringify(ledger, null, 2)}\n`;
    if (options.output) {
      mkdirSync(path.dirname(options.output), { recursive: true });
      writeFileSync(options.output, serialized, { flag: "wx", mode: 0o600 });
      process.stdout.write(`${JSON.stringify({ ok: true, output: options.output,
        ledgerHash: ledger.ledgerHash, accounting: ledger.accounting }, null, 2)}\n`);
    } else process.stdout.write(serialized);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
