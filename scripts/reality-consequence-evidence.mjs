#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { link, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  buildOshaSirRobotConsequenceBookFromZip,
  OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821,
  verifyOshaSirRobotConsequenceBookFromZip,
} from "../src/outsider-reality-consequence-evidence.js";

function usage() {
  return "usage: node scripts/reality-consequence-evidence.mjs --osha-zip PATH --out PATH [--generated-at ISO]";
}

function parse(argv) {
  const result = { generatedAt: OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.pinnedAt };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!value || !["--osha-zip", "--out", "--generated-at"].includes(key)) {
      throw new Error(usage());
    }
    if (key === "--osha-zip") result.oshaZip = value;
    if (key === "--out") result.out = value;
    if (key === "--generated-at") result.generatedAt = value;
  }
  if (!result.oshaZip || !result.out) throw new Error(usage());
  return result;
}

async function publishExclusive(outputPath, bytes) {
  const resolved = path.resolve(outputPath);
  if (resolved === path.parse(resolved).root) throw new Error("REALITY_CONSEQUENCE_OUTPUT_TOO_BROAD");
  await mkdir(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(resolved),
    `.${path.basename(resolved)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
    await link(temporary, resolved);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
  return resolved;
}

try {
  const options = parse(process.argv.slice(2));
  const zipBytes = await readFile(path.resolve(options.oshaZip));
  const artifact = buildOshaSirRobotConsequenceBookFromZip(zipBytes, {
    generatedAt: options.generatedAt,
  });
  const verified = verifyOshaSirRobotConsequenceBookFromZip(artifact, zipBytes);
  if (!verified.ok || !verified.officialFrozenSourceReproduced) {
    throw new Error("REALITY_CONSEQUENCE_OFFICIAL_SOURCE_VERIFY_FAILED");
  }
  const output = await publishExclusive(options.out, `${JSON.stringify(artifact, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, output, artifactHash: artifact.artifactHash,
    sourceCommitmentHash: artifact.sourceCommitmentHash, counts: artifact.counts,
    sourceArtifactsReverified: true, officialFrozenSourceReproduced: true })}\n`);
} catch (error) {
  process.stderr.write(`${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
}
