#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";
import {
  buildDroid100AcquisitionManifest,
  createDroid100ImportPlan,
} from "../src/outsider-droid100-adapter.js";

const MAX_METADATA_BYTES = 8 * 1024 * 1024;

function usage() {
  return [
    "Usage:",
    "  node scripts/stage15-droid100-inspect.mjs --object-list <gcs-metadata.json> [--plan]",
    "",
    "This command performs no network access and downloads no corpus bytes.",
    "It validates the fixed DROID 100 object set and writes JSON to stdout.",
  ].join("\n");
}

function parseArgs(argv) {
  let objectList = null;
  let plan = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--object-list") {
      if (objectList != null || !argv[index + 1]) throw new Error("DROID100_OBJECT_LIST_ARGUMENT_INVALID");
      objectList = argv[index + 1];
      index += 1;
    } else if (arg === "--plan") {
      plan = true;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      throw new Error(`DROID100_ARGUMENT_UNKNOWN:${arg}`);
    }
  }
  if (!objectList) throw new Error("DROID100_OBJECT_LIST_ARGUMENT_REQUIRED");
  return { objectList, plan };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const size = statSync(args.objectList).size;
  if (size <= 0 || size > MAX_METADATA_BYTES) throw new Error("DROID100_METADATA_FILE_SIZE_INVALID");
  const manifest = buildDroid100AcquisitionManifest(readFileSync(args.objectList));
  const output = args.plan ? createDroid100ImportPlan(manifest) : manifest;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
  process.exitCode = 1;
}
