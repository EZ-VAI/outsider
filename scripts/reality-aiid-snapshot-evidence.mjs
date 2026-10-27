#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { link, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  AIID_FROZEN_SOURCE_20260817,
  buildAiidSnapshotEvidenceDiff,
  buildAiidSnapshotEvidenceFromArchive,
  verifyAiidSnapshotEvidence,
  verifyAiidSnapshotEvidenceDiff,
  verifyAiidSnapshotEvidenceFromArchive,
} from "../src/outsider-aiid-snapshot-evidence.js";

function usage() {
  return [
    "usage:",
    "  node scripts/reality-aiid-snapshot-evidence.mjs build --archive PATH --terms-html PATH --out PATH [--generated-at ISO] [--allow-unpinned]",
    "  node scripts/reality-aiid-snapshot-evidence.mjs verify --archive PATH --terms-html PATH --artifact PATH",
    "  node scripts/reality-aiid-snapshot-evidence.mjs diff --previous-artifact PATH --current-artifact PATH --out PATH [--generated-at ISO]",
  ].join("\n");
}

function parse(argv) {
  const [command, ...rest] = argv;
  if (!["build", "verify", "diff"].includes(command)) throw new Error(usage());
  const options = { command, generatedAt: null, allowUnpinned: false };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (key === "--allow-unpinned") { options.allowUnpinned = true; continue; }
    const value = rest[index + 1];
    if (!value || !["--archive", "--terms-html", "--artifact", "--out", "--generated-at",
      "--previous-artifact", "--current-artifact"].includes(key)) throw new Error(usage());
    index += 1;
    if (key === "--archive") options.archive = value;
    if (key === "--terms-html") options.termsHtml = value;
    if (key === "--artifact") options.artifact = value;
    if (key === "--out") options.out = value;
    if (key === "--generated-at") options.generatedAt = value;
    if (key === "--previous-artifact") options.previousArtifact = value;
    if (key === "--current-artifact") options.currentArtifact = value;
  }
  if (command === "build" && (!options.archive || !options.termsHtml || !options.out)) {
    throw new Error(usage());
  }
  if (command === "verify" && (!options.archive || !options.termsHtml || !options.artifact)) {
    throw new Error(usage());
  }
  if (command === "diff" && (!options.previousArtifact || !options.currentArtifact
    || !options.out)) throw new Error(usage());
  return options;
}

async function jsonFile(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function publishExclusive(outputPath, bytes) {
  const resolved = path.resolve(outputPath);
  if (resolved === path.parse(resolved).root) throw new Error("AIID_SNAPSHOT_OUTPUT_TOO_BROAD");
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

async function build(options) {
  const artifact = buildAiidSnapshotEvidenceFromArchive(options.archive, {
    termsSnapshotPath: options.termsHtml,
    generatedAt: options.generatedAt ?? AIID_FROZEN_SOURCE_20260817.snapshotAt,
  });
  const verification = verifyAiidSnapshotEvidenceFromArchive(artifact, options.archive,
    options.termsHtml);
  if (!verification.ok || (!options.allowUnpinned && !verification.officialFrozenSourceReproduced)) {
    throw new Error("AIID_SNAPSHOT_SOURCE_VERIFY_FAILED");
  }
  const output = await publishExclusive(options.out, `${JSON.stringify(artifact, null, 2)}\n`);
  return { ok: true, command: "build", output, artifactHash: artifact.artifactHash,
    sourceCommitmentHash: artifact.sourceCommitmentHash, counts: artifact.counts,
    sourceArtifactsReverified: verification.sourceArtifactsReverified,
    termsSnapshotReverified: verification.termsSnapshotReverified,
    officialFrozenSourceReproduced: verification.officialFrozenSourceReproduced,
    forbiddenMembersExtractedOrParsed: false };
}

async function verify(options) {
  const artifact = await jsonFile(options.artifact);
  return { command: "verify",
    ...verifyAiidSnapshotEvidenceFromArchive(artifact, options.archive, options.termsHtml) };
}

async function diff(options) {
  const previous = await jsonFile(options.previousArtifact);
  const current = await jsonFile(options.currentArtifact);
  if (!verifyAiidSnapshotEvidence(previous).ok || !verifyAiidSnapshotEvidence(current).ok) {
    throw new Error("AIID_SNAPSHOT_DIFF_ARTIFACT_VERIFY_FAILED");
  }
  const artifact = buildAiidSnapshotEvidenceDiff(previous, current, {
    generatedAt: options.generatedAt ?? current.generatedAt,
  });
  const verification = verifyAiidSnapshotEvidenceDiff(artifact, previous, current);
  if (!verification.ok) throw new Error("AIID_SNAPSHOT_DIFF_VERIFY_FAILED");
  const output = await publishExclusive(options.out, `${JSON.stringify(artifact, null, 2)}\n`);
  return { ok: true, command: "diff", output, diffHash: artifact.diffHash,
    changes: artifact.changes, permitsAutomaticPromotion: false,
    forbiddenMembersExtractedOrParsed: false };
}

try {
  const options = parse(process.argv.slice(2));
  const result = options.command === "build" ? await build(options)
    : options.command === "verify" ? await verify(options) : await diff(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
}
