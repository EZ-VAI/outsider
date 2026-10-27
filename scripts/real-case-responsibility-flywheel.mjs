#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  closeSync, constants, fstatSync, fsyncSync, linkSync, mkdirSync, openSync,
  readFileSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  buildRealCaseResponsibilityFlywheelCandidateFromSources,
  buildRealCaseResponsibilityFlywheelFromSources,
  REAL_CASE_RESPONSIBILITY_FLYWHEEL_GENERATED_AT,
  verifyRealCaseResponsibilityFlywheel,
  verifyRealCaseResponsibilityFlywheelAgainstSources,
} from "../src/outsider-real-case-responsibility-flywheel.js";

function usage() {
  return [
    "Usage:",
    "  node scripts/real-case-responsibility-flywheel.mjs build [source arguments] --out PATH [--generated-at ISO]",
    "  node scripts/real-case-responsibility-flywheel.mjs verify [source arguments] --artifact PATH",
    "",
    "Required source arguments:",
    "  --progress-artifact PATH --wave5-intake-artifact PATH --wave5-source-dir PATH --osha-zip PATH",
    "  --aiid-archive PATH --aiid-terms PATH --institutional-remedy-source-dir PATH",
    "  --rma-zip PATH --rma-layout PATH --cas-source-dir PATH",
    "  --maude-artifact PATH --maude-source-dir PATH",
    "  --dmv-artifact PATH --dmv-source-dir PATH",
    "  --capital-artifact PATH --capital-source-dir PATH",
    "  --fema-artifact PATH --fema-source-dir PATH",
    "  --remedy-artifact PATH --remedy-source-dir PATH",
    "  --ntsb-bls-artifact PATH --ntsb-bls-source-dir PATH",
    "  --judgment-gao-artifact PATH --judgment-gao-source-dir PATH",
    "  --ncua-pbgc-msha-artifact PATH --ncua-pbgc-msha-source-dir PATH",
    "  --cdi-ncigf-artifact PATH --cdi-ncigf-source-dir PATH",
    "  --fra-phmsa-artifact PATH --fra-phmsa-source-dir PATH",
    "  --nhtsa-recall-remedy-artifact PATH --nhtsa-recall-remedy-source-dir PATH",
    "  --bridgedata-v2-artifact PATH --bridgedata-v2-source-dir PATH",
    "  --waymo-safety-impact-artifact PATH --waymo-safety-impact-source-dir PATH",
    "  --clinicaltrials-artifact PATH --clinicaltrials-source-dir PATH",
    "",
    "Every required lane is rebuilt by its canonical source-aware verifier in the same invocation.",
    `The code-fixed canonical generated-at is ${REAL_CASE_RESPONSIBILITY_FLYWHEEL_GENERATED_AT}; other times are rejected.`,
    "The artifact is reference evidence only and grants no training, price, guarantee, capital, custody, payment, settlement, execution, or closure authority.",
  ].join("\n");
}

const SOURCE_ARGS = Object.freeze([
  "--temporal-audit-manifest",
  "--progress-artifact", "--wave5-intake-artifact", "--wave5-source-dir", "--osha-zip", "--aiid-archive",
  "--aiid-terms", "--institutional-remedy-source-dir", "--rma-zip", "--rma-layout",
  "--cas-source-dir", "--maude-artifact", "--maude-source-dir", "--dmv-artifact",
  "--dmv-source-dir", "--capital-artifact", "--capital-source-dir", "--fema-artifact",
  "--fema-source-dir", "--remedy-artifact", "--remedy-source-dir",
  "--ntsb-bls-artifact", "--ntsb-bls-source-dir",
  "--judgment-gao-artifact", "--judgment-gao-source-dir",
  "--ncua-pbgc-msha-artifact", "--ncua-pbgc-msha-source-dir",
  "--cdi-ncigf-artifact", "--cdi-ncigf-source-dir",
  "--fra-phmsa-artifact", "--fra-phmsa-source-dir",
  "--nhtsa-recall-remedy-artifact", "--nhtsa-recall-remedy-source-dir",
  "--bridgedata-v2-artifact", "--bridgedata-v2-source-dir",
  "--waymo-safety-impact-artifact", "--waymo-safety-impact-source-dir",
  "--clinicaltrials-artifact", "--clinicaltrials-source-dir",
]);

function fail(code) { throw new Error(`RESPONSIBILITY_FLYWHEEL_CLI_${code}`); }

function parse(argv) {
  if (argv.length === 0 || argv.includes("--help")) return { help: true };
  const command = argv[0];
  if (!new Set(["build", "build-candidate-v15", "build-candidate-v16", "verify"])
    .has(command)) {
    fail("COMMAND_INVALID");
  }
  const allowed = new Set([...SOURCE_ARGS, "--out", "--artifact", "--generated-at"]);
  const options = { command };
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || typeof value !== "string" || value.length === 0
      || value.startsWith("--")) fail(`ARGUMENT_INVALID:${key ?? "missing"}`);
    if (Object.hasOwn(options, key)) fail(`ARGUMENT_DUPLICATE:${key}`);
    options[key] = value;
  }
  for (const key of SOURCE_ARGS) if (!options[key]) fail(`ARGUMENT_REQUIRED:${key}`);
  if ((command === "build" || command === "build-candidate-v15"
      || command === "build-candidate-v16")
    && !options["--out"]) fail("ARGUMENT_REQUIRED:--out");
  if (command === "verify" && !options["--artifact"]) {
    fail("ARGUMENT_REQUIRED:--artifact");
  }
  if ((command === "build" || command === "build-candidate-v15"
      || command === "build-candidate-v16")
      && options["--artifact"]
    || command === "verify" && (options["--out"] || options["--generated-at"])) {
    fail("ARGUMENT_NOT_ALLOWED_FOR_COMMAND");
  }
  if (options["--generated-at"]
    && options["--generated-at"] !== REAL_CASE_RESPONSIBILITY_FLYWHEEL_GENERATED_AT) {
    fail("CANONICAL_GENERATED_AT_MISMATCH");
  }
  if (command.startsWith("build-candidate-") && options["--generated-at"]) {
    fail("CANDIDATE_TIME_IS_SAMPLED_AT_BUILD_ENTRY");
  }
  return options;
}

function resolved(value, code) {
  const target = path.resolve(value);
  if (target === path.parse(target).root) fail(`${code}_TOO_BROAD`);
  return target;
}

function sourceProfile(options) {
  const wave5 = resolved(options["--wave5-source-dir"], "WAVE5_SOURCE");
  const cas = resolved(options["--cas-source-dir"], "CAS_SOURCE");
  return {
    temporalAudit: {
      manifestPath: resolved(options["--temporal-audit-manifest"],
        "STAGE0_SOURCE_TEMPORAL_AUDIT_MANIFEST"),
    },
    progress: {
      artifactPath: resolved(options["--progress-artifact"], "PROGRESS_ARTIFACT"),
      sources: {
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
          sourceDirectory: resolved(options["--institutional-remedy-source-dir"],
            "INSTITUTIONAL_REMEDY_SOURCE"),
        },
        rma: {
          archivePath: resolved(options["--rma-zip"], "RMA_ARCHIVE"),
          recordLayoutPath: resolved(options["--rma-layout"], "RMA_LAYOUT"),
        },
        cas: { sourceDirectory: cas, sourcePagePath: path.join(cas, "source-page.html") },
      },
    },
    wave5Intake: {
      artifactPath: resolved(options["--wave5-intake-artifact"],
        "WAVE5_INTAKE_ARTIFACT"),
      sourceDirectory: wave5,
    },
    fdaMaude: {
      artifactPath: resolved(options["--maude-artifact"], "MAUDE_ARTIFACT"),
      sourceDirectory: resolved(options["--maude-source-dir"], "MAUDE_SOURCE"),
    },
    caDmvAv: {
      artifactPath: resolved(options["--dmv-artifact"], "DMV_ARTIFACT"),
      sourceDirectory: resolved(options["--dmv-source-dir"], "DMV_SOURCE"),
    },
    institutionalCapitalClaims: {
      artifactPath: resolved(options["--capital-artifact"], "CAPITAL_ARTIFACT"),
      sourceDirectory: resolved(options["--capital-source-dir"], "CAPITAL_SOURCE"),
    },
    femaRealCases: {
      artifactPath: resolved(options["--fema-artifact"], "FEMA_ARTIFACT"),
      sourceDirectory: resolved(options["--fema-source-dir"], "FEMA_SOURCE"),
    },
    remedyPaymentRecovery: {
      artifactPath: resolved(options["--remedy-artifact"], "REMEDY_ARTIFACT"),
      sourceDirectory: resolved(options["--remedy-source-dir"], "REMEDY_SOURCE"),
    },
    ntsbBlsOutcome: {
      artifactPath: resolved(options["--ntsb-bls-artifact"], "NTSB_BLS_ARTIFACT"),
      sourceDirectory: resolved(options["--ntsb-bls-source-dir"], "NTSB_BLS_SOURCE"),
    },
    judgmentFundGao: {
      artifactPath: resolved(options["--judgment-gao-artifact"], "JUDGMENT_GAO_ARTIFACT"),
      sourceDirectory: resolved(options["--judgment-gao-source-dir"],
        "JUDGMENT_GAO_SOURCE"),
    },
    ncuaPbgcMsha: {
      artifactPath: resolved(options["--ncua-pbgc-msha-artifact"],
        "NCUA_PBGC_MSHA_ARTIFACT"),
      sourceDirectory: resolved(options["--ncua-pbgc-msha-source-dir"],
        "NCUA_PBGC_MSHA_SOURCE"),
    },
    cdiNcigf: {
      artifactPath: resolved(options["--cdi-ncigf-artifact"], "CDI_NCIGF_ARTIFACT"),
      sourceDirectory: resolved(options["--cdi-ncigf-source-dir"], "CDI_NCIGF_SOURCE"),
    },
    fraPhmsa: {
      artifactPath: resolved(options["--fra-phmsa-artifact"], "FRA_PHMSA_ARTIFACT"),
      sourceDirectory: resolved(options["--fra-phmsa-source-dir"], "FRA_PHMSA_SOURCE"),
    },
    nhtsaRecallRemedy: {
      artifactPath: resolved(options["--nhtsa-recall-remedy-artifact"],
        "NHTSA_RECALL_REMEDY_ARTIFACT"),
      sourceDirectory: resolved(options["--nhtsa-recall-remedy-source-dir"],
        "NHTSA_RECALL_REMEDY_SOURCE"),
    },
    bridgeDataV2: {
      artifactPath: resolved(options["--bridgedata-v2-artifact"],
        "BRIDGEDATA_V2_ARTIFACT"),
      sourceDirectory: resolved(options["--bridgedata-v2-source-dir"],
        "BRIDGEDATA_V2_SOURCE"),
    },
    waymoSafetyImpact: {
      artifactPath: resolved(options["--waymo-safety-impact-artifact"],
        "WAYMO_SAFETY_IMPACT_ARTIFACT"),
      sourceDirectory: resolved(options["--waymo-safety-impact-source-dir"],
        "WAYMO_SAFETY_IMPACT_SOURCE"),
    },
    clinicalTrials: {
      artifactPath: resolved(options["--clinicaltrials-artifact"],
        "CLINICALTRIALS_ARTIFACT"),
      sourceDirectory: resolved(options["--clinicaltrials-source-dir"],
        "CLINICALTRIALS_SOURCE"),
    },
  };
}

function stableJson(file) {
  const target = resolved(file, "ARTIFACT");
  const descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 2n || before.size > 32n * 1024n * 1024n) {
      fail("ARTIFACT_FILE_INVALID");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || bytes.length !== Number(after.size)) fail("ARTIFACT_FILE_CHANGED");
    try {
      const value = JSON.parse(bytes.toString("utf8"));
      if (typeof value.generatedAt !== "string"
        || !Number.isFinite(Date.parse(value.generatedAt))
        || BigInt(Date.parse(value.generatedAt)) * 1_000_000n > before.mtimeNs) {
        fail("ARTIFACT_GENERATED_AT_AFTER_FILE_MTIME");
      }
      return value;
    } catch (error) {
      if (error?.message?.includes("ARTIFACT_GENERATED_AT_AFTER_FILE_MTIME")) throw error;
      fail("ARTIFACT_JSON_INVALID");
    }
  } finally { closeSync(descriptor); }
}

function publishExclusive(outputPath, value) {
  const target = resolved(outputPath, "OUTPUT");
  if (typeof value.generatedAt !== "string"
    || !Number.isFinite(Date.parse(value.generatedAt))
    || Date.parse(value.generatedAt) > Date.now()) {
    fail("GENERATED_AT_AFTER_BUILD_START");
  }
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(target),
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(descriptor);
    const published = fstatSync(descriptor, { bigint: true });
    if (BigInt(Date.parse(value.generatedAt)) * 1_000_000n > published.mtimeNs) {
      fail("GENERATED_AT_AFTER_ARTIFACT_MTIME");
    }
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
  const sources = sourceProfile(options);
  if (options.command === "build" || options.command.startsWith("build-candidate-")) {
    const candidateBuild = options.command.startsWith("build-candidate-");
    const buildStartedAt = new Date().toISOString();
    const artifact = candidateBuild
      ? await buildRealCaseResponsibilityFlywheelCandidateFromSources({
          sources, generatedAt: buildStartedAt,
        })
      : await buildRealCaseResponsibilityFlywheelFromSources({
          sources,
          generatedAt: options["--generated-at"]
            ?? REAL_CASE_RESPONSIBILITY_FLYWHEEL_GENERATED_AT,
        });
    if (!candidateBuild) {
      const standalone = verifyRealCaseResponsibilityFlywheel(artifact);
      if (!standalone.ok || standalone.sourceArtifactsReverified !== false) {
        fail("BUILT_ARTIFACT_STRUCTURE_INVALID");
      }
    }
    const output = publishExclusive(options["--out"], artifact);
    const written = stableJson(output);
    if (written.artifactHash !== artifact.artifactHash
      || written.generatedAt !== artifact.generatedAt) {
      fail("WRITTEN_ARTIFACT_CANDIDATE_MISMATCH");
    }
    process.stdout.write(`${JSON.stringify({
      ok: true,
      command: options.command,
      output,
      buildStartedAt,
      artifactHash: artifact.artifactHash,
      verificationLevel: candidateBuild
        ? "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE_CANDIDATE_NOT_CANONICAL"
        : "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE_DURING_BUILD",
      canonicalRoutingEligible: !candidateBuild,
      sourceArtifactsReplayedDuringBuild: true,
      artifactAloneProvesSourceReplay: false,
      laneCount: artifact.lanes.length,
      readinessGapRows: artifact.gapReferences.counts.readinessExternalGaps,
      targetSpecificGapClosureCredit: 0,
      authority: artifact.authority,
    })}\n`);
  } else {
    const artifact = stableJson(options["--artifact"]);
    const checked = await verifyRealCaseResponsibilityFlywheelAgainstSources(artifact,
      { sources });
    process.stdout.write(`${JSON.stringify({ command: "verify", ...checked })}\n`);
    if (!checked.ok) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
