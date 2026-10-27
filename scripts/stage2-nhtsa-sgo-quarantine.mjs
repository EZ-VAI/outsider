#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { link, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import {
  adaptNhtsaSgoAdsCsv,
  NHTSA_SGO_FROZEN_SOURCE_20260820,
  verifyNhtsaSgoIncidentQuarantine,
} from "../src/outsider-public-risk-source-adapters.js";

function usage() {
  return "usage: node scripts/stage2-nhtsa-sgo-quarantine.mjs --csv PATH --output PATH [--generated-at ISO]";
}

function argumentsFor(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const result = { csv: null, output: null,
    generatedAt: NHTSA_SGO_FROZEN_SOURCE_20260820.frozenAt };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index], value = argv[index + 1];
    if (!["--csv", "--output", "--generated-at"].includes(flag) || value == null) {
      throw new Error(usage());
    }
    if (flag === "--csv") result.csv = value;
    if (flag === "--output") result.output = value;
    if (flag === "--generated-at") result.generatedAt = value;
    index += 1;
  }
  if (!result.csv || !result.output) throw new Error(usage());
  return result;
}

async function publishExclusive(outputPath, bytes) {
  const resolved = path.resolve(outputPath);
  if (resolved === path.parse(resolved).root) throw new Error("NHTSA_OUTPUT_PATH_TOO_BROAD");
  await mkdir(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(resolved),
    `.${path.basename(resolved)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await link(temporary, resolved);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
  return resolved;
}

const options = argumentsFor(process.argv.slice(2));
const csvBytes = await readFile(path.resolve(options.csv));
const artifact = adaptNhtsaSgoAdsCsv(csvBytes, {
  sourceObjectHash: NHTSA_SGO_FROZEN_SOURCE_20260820.sourceObjectHash,
  dataDictionaryHash: NHTSA_SGO_FROZEN_SOURCE_20260820.dataDictionaryHash,
  generatedAt: options.generatedAt,
});
const checked = verifyNhtsaSgoIncidentQuarantine(artifact, csvBytes);
if (!checked.ok) throw new Error(`NHTSA_ARTIFACT_SELF_VERIFY_FAILED:${checked.failures.join(",")}`);
const output = await publishExclusive(options.output,
  `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  output,
  artifactHash: artifact.artifactHash,
  sourceCommitmentHash: artifact.sourceCommitmentHash,
  counts: artifact.counts,
  decision: artifact.modelEntrance.decision,
  sourceReproduced: checked.sourceReproduced,
})}\n`);
