#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync,
  unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  buildRealEvidenceStageProgressFromSources,
  REAL_EVIDENCE_STAGE_PROGRESS_GENERATED_AT,
  verifyRealEvidenceStageProgress,
  verifyRealEvidenceStageProgressAgainstSources,
} from "../src/outsider-real-evidence-stage-progress.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/real-evidence-stage-progress.mjs build --wave5-source-dir PATH --osha-zip PATH --aiid-archive PATH --aiid-terms PATH --institutional-source-dir PATH --rma-zip PATH --rma-layout PATH --cas-source-dir PATH --out PATH [--generated-at ISO]",
    "  node scripts/real-evidence-stage-progress.mjs verify --artifact PATH --wave5-source-dir PATH --osha-zip PATH --aiid-archive PATH --aiid-terms PATH --institutional-source-dir PATH --rma-zip PATH --rma-layout PATH --cas-source-dir PATH",
    "",
    "All six lanes are replayed offline. The artifact never grants pricing, training, execution, settlement, or closure authority.",
  ].join("\n");
}

const SOURCE_ARGUMENTS = Object.freeze([
  "--wave5-source-dir", "--osha-zip", "--aiid-archive", "--aiid-terms",
  "--institutional-source-dir", "--rma-zip", "--rma-layout", "--cas-source-dir",
]);

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const command = argv[0];
  if (!new Set(["build", "verify"]).has(command)) throw new Error("COMMAND_INVALID");
  const allowed = new Set([...SOURCE_ARGUMENTS, "--out", "--artifact", "--generated-at"]);
  const options = { command };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || typeof value !== "string" || value.length === 0
      || value.startsWith("--")) throw new Error(`ARGUMENT_INVALID:${key ?? "missing"}`);
    if (Object.hasOwn(options, key)) throw new Error(`ARGUMENT_DUPLICATE:${key}`);
    options[key] = value;
  }
  for (const key of SOURCE_ARGUMENTS) {
    if (!options[key]) throw new Error(`ARGUMENT_REQUIRED:${key}`);
  }
  if (command === "build" && !options["--out"]) throw new Error("ARGUMENT_REQUIRED:--out");
  if (command === "verify" && !options["--artifact"]) {
    throw new Error("ARGUMENT_REQUIRED:--artifact");
  }
  if (command === "build" && options["--artifact"]
    || command === "verify" && (options["--out"] || options["--generated-at"])) {
    throw new Error("ARGUMENT_NOT_ALLOWED_FOR_COMMAND");
  }
  return options;
}

function resolved(value, code) {
  const result = path.resolve(value);
  if (result === path.parse(result).root) throw new Error(`${code}_TOO_BROAD`);
  return result;
}

function sources(options) {
  const wave5 = resolved(options["--wave5-source-dir"], "WAVE5_SOURCE");
  const cas = resolved(options["--cas-source-dir"], "CAS_SOURCE");
  return {
    wave5: {
      traceCommonsDirectory: path.join(wave5, "trace-commons"),
      robustRosDirectory: path.join(wave5, "robust-ros"),
    },
    osha: { archivePath: resolved(options["--osha-zip"], "OSHA_ARCHIVE") },
    aiid: {
      archivePath: resolved(options["--aiid-archive"], "AIID_ARCHIVE"),
      termsSnapshotPath: resolved(options["--aiid-terms"], "AIID_TERMS"),
    },
    institutionalRemedies: {
      sourceDirectory: resolved(options["--institutional-source-dir"],
        "INSTITUTIONAL_SOURCE"),
    },
    rma: {
      archivePath: resolved(options["--rma-zip"], "RMA_ARCHIVE"),
      recordLayoutPath: resolved(options["--rma-layout"], "RMA_LAYOUT"),
    },
    cas: {
      sourceDirectory: cas,
      sourcePagePath: path.join(cas, "source-page.html"),
    },
  };
}

function publishExclusive(outputPath, value) {
  const target = resolved(outputPath, "OUTPUT");
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(target),
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, target);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch {}
  }
  return target;
}

try {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  const sourcePaths = sources(options);
  if (options.command === "build") {
    const artifact = buildRealEvidenceStageProgressFromSources({
      sources: sourcePaths,
      generatedAt: options["--generated-at"] ?? REAL_EVIDENCE_STAGE_PROGRESS_GENERATED_AT,
    });
    const checked = verifyRealEvidenceStageProgress(artifact);
    if (!checked.ok || checked.sourceArtifactsReverified !== false) {
      throw new Error("BUILT_ARTIFACT_STRUCTURE_FAILED");
    }
    const output = publishExclusive(options["--out"], artifact);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      command: "build",
      output,
      artifactHash: artifact.artifactHash,
      verificationLevel: "ALL_SIX_SOURCES_REPLAYED_DURING_BUILD",
      sourceArtifactsReplayedDuringBuild: true,
      artifactAloneProvesSourceReplay: false,
      externalReadinessGapsClosed: false,
      authority: artifact.authority,
    })}\n`);
  } else {
    const artifact = JSON.parse(readFileSync(resolved(options["--artifact"],
      "ARTIFACT"), "utf8"));
    const checked = verifyRealEvidenceStageProgressAgainstSources(artifact, {
      sources: sourcePaths,
    });
    process.stdout.write(`${JSON.stringify({ command: "verify", ...checked })}\n`);
    if (!checked.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
