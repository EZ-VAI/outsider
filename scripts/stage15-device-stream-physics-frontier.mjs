#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildDeviceStreamPhysicsFrontierReport,
  futureDeviceAdapterContract,
  replayDroid100RetrospectiveDeviceEvidence,
  replayFutureDeviceFormat,
} from "../src/outsider-device-stream-physics-frontier.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/stage15-device-stream-physics-frontier.mjs --future-contract ROSBAG2|MCAP",
    "  node scripts/stage15-device-stream-physics-frontier.mjs --require-live ROSBAG2|MCAP",
    "  node scripts/stage15-device-stream-physics-frontier.mjs --droid-artifacts DIR",
    "    --droid-source DIR --platform-manifest FILE [--out FILE]",
    "",
    "The future-contract command is descriptive only. ROSBAG2/MCAP parsers and",
    "live stream handles are not implemented. DROID mode reopens all exact source",
    "objects in-process and never accepts a caller --verified flag.",
  ].join("\n");
}

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") return { help: true };
    if (flag === "--verified") throw new Error("CALLER_VERIFIED_FLAG_FORBIDDEN");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`MISSING_VALUE:${flag}`);
    index += 1;
    if (flag === "--future-contract") options.futureContract = value;
    else if (flag === "--require-live") options.requireLive = value;
    else if (flag === "--droid-artifacts") options.droidArtifacts = value;
    else if (flag === "--droid-source") options.droidSource = value;
    else if (flag === "--platform-manifest") options.platformManifest = value;
    else if (flag === "--out") options.out = value;
    else throw new Error(`UNKNOWN_OPTION:${flag}`);
  }
  const modes = [options.futureContract, options.requireLive, options.droidArtifacts]
    .filter(Boolean).length;
  if (modes !== 1) throw new Error("EXACTLY_ONE_MODE_REQUIRED");
  if (options.droidArtifacts && (!options.droidSource || !options.platformManifest)) {
    throw new Error("DROID_SOURCE_AND_PLATFORM_MANIFEST_REQUIRED");
  }
  return options;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  let result;
  if (options.futureContract) {
    result = futureDeviceAdapterContract(options.futureContract);
  } else if (options.requireLive) {
    result = replayFutureDeviceFormat({ formatFamily: options.requireLive });
  } else {
    const platformManifest = JSON.parse(readFileSync(
      path.resolve(options.platformManifest), "utf8",
    ));
    const replayReceipt = replayDroid100RetrospectiveDeviceEvidence({
      artifactDirectory: path.resolve(options.droidArtifacts),
      sourceRoot: path.resolve(options.droidSource),
      platformManifest,
    });
    result = buildDeviceStreamPhysicsFrontierReport({ replayReceipt });
  }
  const output = `${canonicalizeStrict(result)}\n`;
  if (options.out) writeFileSync(path.resolve(options.out), output,
    { flag: "wx", mode: 0o600 });
  else process.stdout.write(output);
} catch (error) {
  process.stderr.write(`stage15-device-stream-physics-frontier: ${error?.message ?? String(error)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exit(1);
}
