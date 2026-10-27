/*
 * Unified, source-aware responsibility flywheel for real cases and real
 * experience.
 *
 * This file deliberately keeps four questions separate:
 *   1. Did the recorded case or aggregate come from the real world?
 *   2. Which quality dimensions are supported by the frozen bytes?
 *   3. For which descriptive/source-domain claim may those facts be used?
 *   4. Who, if anyone, has authority to train, price, guarantee, execute,
 *      settle, hold capital, move funds, or close/reopen an obligation?
 *
 * Public discovery never downgrades a real case. Outsider collection never
 * upgrades one. Full verification is intentionally expensive: in one call it
 * reads every pinned upstream artifact, invokes every upstream source-aware
 * verifier (which rebuilds from source), and exact-compares the resulting
 * artifact. The JSON flywheel alone is a fixed, self-sealed projection and is
 * not source proof.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, openSync, readFileSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {verifyPublicEvidenceWave5Source} from "./outsider-public-evidence-wave5.js";
import {
  verifyRealEvidenceStageProgress,
  verifyRealEvidenceStageProgressAgainstSources,
} from "./outsider-real-evidence-stage-progress.js";
import { verifyWave5IntakeSnapshot } from
  "./outsider-wave5-intake-taxonomy-frontier.js";
import {
  verifyFdaMaudeOutcomeSensing,
  verifyFdaMaudeOutcomeSensingWithSource,
} from "./outsider-fda-maude-outcome-sensing.js";
import {
  verifyCaDmvAvOutcomeSensing,
  verifyCaDmvAvOutcomeSensingWithSource,
} from "./outsider-ca-dmv-av-outcome-sensing.js";
import {
  verifyInstitutionalCapitalClaimsEvidence,
  verifyInstitutionalCapitalClaimsEvidenceAgainstSource,
} from "./outsider-institutional-capital-claims-evidence.js";
import {
  verifyFemaRealCasesEvidence,
  verifyFemaRealCasesEvidenceWithSource,
} from "./outsider-fema-real-cases-evidence.js";
import {
  verifyRemedyPaymentRecoveryEvidence,
  verifyRemedyPaymentRecoveryEvidenceAgainstSource,
} from "./outsider-remedy-payment-recovery-evidence.js";
import {
  verifyNtsbBlsOutcomeEvidence,
  verifyNtsbBlsOutcomeEvidenceWithSource,
} from "./outsider-ntsb-bls-outcome-evidence.js";
import {
  verifyJudgmentFundGaoRealCasesEvidence,
  verifyJudgmentFundGaoRealCasesEvidenceWithSource,
} from "./outsider-judgment-fund-gao-real-cases.js";
import {
  verifyNcuaPbgcMshaRealExperience,
  verifyNcuaPbgcMshaRealExperienceWithSource,
} from "./outsider-ncua-pbgc-msha-real-experience.js";
import {
  verifyCdiNcigfRateGuarantyEvidence,
  verifyCdiNcigfRateGuarantyEvidenceWithSource,
} from "./outsider-cdi-ncigf-real-rate-guaranty-evidence.js";
import {
  verifyFraPhmsaSafetyEvidence,
  verifyFraPhmsaSafetyEvidenceWithSource,
} from "./outsider-fra-phmsa-safety-evidence.js";
import {
  verifyNhtsaRecallRemedyEvidence,
  verifyNhtsaRecallRemedyEvidenceWithSource,
} from "./outsider-nhtsa-recall-remedy-evidence.js";
import {
  verifyBridgeDataV2TrainingEvidence,
  verifyBridgeDataV2TrainingEvidenceWithSource,
} from "./outsider-bridgedata-v2-training-evidence.js";
import {
  verifyWaymoSafetyImpactEvidence,
  verifyWaymoSafetyImpactEvidenceWithSource,
} from "./outsider-waymo-safety-impact-evidence.js";
import {
  verifyClinicalTrialsPostedResultsEvidence,
  verifyClinicalTrialsPostedResultsEvidenceWithSource,
} from "./outsider-clinicaltrials-posted-results-evidence.js";
import {
  createRealCaseQualityAssessment,
  QUALITY_DIMENSIONS,
  verifyRealCaseQualityAssessment,
} from "./outsider-real-case-quality-gate.js";
import {
  buildRealCaseGapEvidenceCatalog,
  verifyRealCaseGapEvidenceCatalog,
} from "./outsider-real-case-gap-evidence-catalog.js";
import { createReadinessGapLedger } from "./outsider-readiness-gap-ledger.js";
import {
  STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL,
  STAGE0_SOURCE_TEMPORAL_AUDIT_PATH,
  STAGE0_SOURCE_TEMPORAL_QUARANTINE_RECEIPTS,
  verifyStage0SourceTemporalAuditManifest,
} from "./outsider-stage0-source-temporal-audit.js";

export const REAL_CASE_RESPONSIBILITY_FLYWHEEL_SCHEMA
  = "outsider/real-case-responsibility-flywheel/v1";
export const REAL_CASE_RESPONSIBILITY_FLYWHEEL_GENERATED_AT
  = "2026-08-28T08:40:00.720Z";

const REAL_CASE_GAP_CATALOG_AS_OF = "2026-08-28T08:23:57.560Z";
const REAL_CASE_GAP_CATALOG_HASH
  = "sha256:b690ddeb4a9a01b94938f6558dfe565e4f6703d16eb22e0b05fb88d9c32d6f66";
const REAL_CASE_GAP_CATALOG_FILE_HASH
  = "sha256:cce91100a329ad2d8687945d48e3c8774aa6f9a4ed6ccdc077fe5b9b9fc20eb0";
const REAL_CASE_GAP_CATALOG_FILE_BYTES = 69059;

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CURRENT_SEMANTIC_TOKEN = /(?:^|[^A-Z0-9])CURRENT(?:[^A-Z0-9]|$)/u;
const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail == null ? `RESPONSIBILITY_FLYWHEEL_${code}`
    : `RESPONSIBILITY_FLYWHEEL_${code}:${detail}`);
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNoCurrentSemanticTokenInValues(value, receiptId) {
  if (typeof value === "string") {
    if (CURRENT_SEMANTIC_TOKEN.test(value)) {
      fail("TEMPORAL_QUARANTINE_CURRENT_TOKEN", receiptId);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) {
    assertNoCurrentSemanticTokenInValues(child, receiptId);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function canonicalTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("TIME_INVALID");
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail("TIME_NON_CANONICAL");
  return normalized;
}

function requireCanonicalFlywheelTime(value) {
  const normalized = canonicalTime(value);
  if (normalized !== REAL_CASE_RESPONSIBILITY_FLYWHEEL_GENERATED_AT) {
    fail("CANONICAL_GENERATED_AT_MISMATCH");
  }
  return normalized;
}

function requiredPath(value, code) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail("PATH_INVALID", code);
  }
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) fail("PATH_TOO_BROAD", code);
  return resolved;
}

function stableReadJson(filePath, code) {
  const resolved = requiredPath(filePath, code);
  let descriptor;
  try {
    descriptor = openSync(resolved, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 2n || before.size > BigInt(MAX_ARTIFACT_BYTES)) {
      fail("ARTIFACT_FILE_INVALID", code);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || bytes.length !== Number(before.size)) {
      fail("ARTIFACT_FILE_CHANGED", code);
    }
    try {
      return {
        value: JSON.parse(bytes.toString("utf8")),
        fileBytes: bytes.length,
        fileHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      };
    } catch { fail("ARTIFACT_JSON_INVALID", code); }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function progressSourcePathProfile(value) {
  if (!exactKeys(value, ["wave5", "osha", "aiid", "institutionalRemedies", "rma", "cas"])
    || !exactKeys(value.wave5, ["traceCommonsDirectory", "robustRosDirectory"])
    || !exactKeys(value.osha, ["archivePath"])
    || !exactKeys(value.aiid, ["archivePath", "termsSnapshotPath"])
    || !exactKeys(value.institutionalRemedies, ["sourceDirectory"])
    || !exactKeys(value.rma, ["archivePath", "recordLayoutPath"])
    || !exactKeys(value.cas, ["sourceDirectory", "sourcePagePath"])) {
    fail("PROGRESS_SOURCE_PATH_PROFILE_INVALID");
  }
  return {
    wave5: {
      traceCommonsDirectory: requiredPath(value.wave5.traceCommonsDirectory,
        "PROGRESS_WAVE5_TRACE_SOURCE"),
      robustRosDirectory: requiredPath(value.wave5.robustRosDirectory,
        "PROGRESS_WAVE5_ROBUST_SOURCE"),
    },
    osha: { archivePath: requiredPath(value.osha.archivePath, "PROGRESS_OSHA_SOURCE") },
    aiid: {
      archivePath: requiredPath(value.aiid.archivePath, "PROGRESS_AIID_ARCHIVE"),
      termsSnapshotPath: requiredPath(value.aiid.termsSnapshotPath, "PROGRESS_AIID_TERMS"),
    },
    institutionalRemedies: {
      sourceDirectory: requiredPath(value.institutionalRemedies.sourceDirectory,
        "PROGRESS_INSTITUTIONAL_REMEDY_SOURCE"),
    },
    rma: {
      archivePath: requiredPath(value.rma.archivePath, "PROGRESS_RMA_ARCHIVE"),
      recordLayoutPath: requiredPath(value.rma.recordLayoutPath, "PROGRESS_RMA_LAYOUT"),
    },
    cas: {
      sourceDirectory: requiredPath(value.cas.sourceDirectory, "PROGRESS_CAS_SOURCE"),
      sourcePagePath: requiredPath(value.cas.sourcePagePath, "PROGRESS_CAS_PAGE"),
    },
  };
}

function sourcePathProfile(value) {
  const top = ["temporalAudit", "progress", "wave5Intake", "fdaMaude", "caDmvAv", "institutionalCapitalClaims",
    "femaRealCases", "remedyPaymentRecovery", "ntsbBlsOutcome", "judgmentFundGao",
    "ncuaPbgcMsha", "cdiNcigf", "fraPhmsa", "nhtsaRecallRemedy", "bridgeDataV2",
    "waymoSafetyImpact", "clinicalTrials"];
  if (!exactKeys(value, top)
    || !exactKeys(value.temporalAudit, ["manifestPath"])
    || !exactKeys(value.progress, ["artifactPath", "sources"])
    || !exactKeys(value.wave5Intake, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.fdaMaude, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.caDmvAv, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.institutionalCapitalClaims, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.femaRealCases, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.remedyPaymentRecovery, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.ntsbBlsOutcome, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.judgmentFundGao, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.ncuaPbgcMsha, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.cdiNcigf, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.fraPhmsa, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.nhtsaRecallRemedy, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.bridgeDataV2, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.waymoSafetyImpact, ["artifactPath", "sourceDirectory"])
    || !exactKeys(value.clinicalTrials, ["artifactPath", "sourceDirectory"])) {
    fail("SOURCE_PATH_PROFILE_INVALID");
  }
  return deepFreeze({
    temporalAudit: {
      manifestPath: requiredPath(value.temporalAudit.manifestPath,
        "STAGE0_SOURCE_TEMPORAL_AUDIT_MANIFEST"),
    },
    progress: {
      artifactPath: requiredPath(value.progress.artifactPath, "PROGRESS_ARTIFACT"),
      sources: progressSourcePathProfile(value.progress.sources),
    },
    wave5Intake: {
      artifactPath: requiredPath(value.wave5Intake.artifactPath,
        "WAVE5_INTAKE_ARTIFACT"),
      sourceDirectory: requiredPath(value.wave5Intake.sourceDirectory,
        "WAVE5_INTAKE_SOURCE"),
    },
    fdaMaude: {
      artifactPath: requiredPath(value.fdaMaude.artifactPath, "FDA_MAUDE_ARTIFACT"),
      sourceDirectory: requiredPath(value.fdaMaude.sourceDirectory, "FDA_MAUDE_SOURCE"),
    },
    caDmvAv: {
      artifactPath: requiredPath(value.caDmvAv.artifactPath, "CA_DMV_ARTIFACT"),
      sourceDirectory: requiredPath(value.caDmvAv.sourceDirectory, "CA_DMV_SOURCE"),
    },
    institutionalCapitalClaims: {
      artifactPath: requiredPath(value.institutionalCapitalClaims.artifactPath,
        "INSTITUTIONAL_CAPITAL_ARTIFACT"),
      sourceDirectory: requiredPath(value.institutionalCapitalClaims.sourceDirectory,
        "INSTITUTIONAL_CAPITAL_SOURCE"),
    },
    femaRealCases: {
      artifactPath: requiredPath(value.femaRealCases.artifactPath, "FEMA_ARTIFACT"),
      sourceDirectory: requiredPath(value.femaRealCases.sourceDirectory, "FEMA_SOURCE"),
    },
    remedyPaymentRecovery: {
      artifactPath: requiredPath(value.remedyPaymentRecovery.artifactPath, "REMEDY_ARTIFACT"),
      sourceDirectory: requiredPath(value.remedyPaymentRecovery.sourceDirectory,
        "REMEDY_SOURCE"),
    },
    ntsbBlsOutcome: {
      artifactPath: requiredPath(value.ntsbBlsOutcome.artifactPath, "NTSB_BLS_ARTIFACT"),
      sourceDirectory: requiredPath(value.ntsbBlsOutcome.sourceDirectory, "NTSB_BLS_SOURCE"),
    },
    judgmentFundGao: {
      artifactPath: requiredPath(value.judgmentFundGao.artifactPath,
        "JUDGMENT_FUND_GAO_ARTIFACT"),
      sourceDirectory: requiredPath(value.judgmentFundGao.sourceDirectory,
        "JUDGMENT_FUND_GAO_SOURCE"),
    },
    ncuaPbgcMsha: {
      artifactPath: requiredPath(value.ncuaPbgcMsha.artifactPath,
        "NCUA_PBGC_MSHA_ARTIFACT"),
      sourceDirectory: requiredPath(value.ncuaPbgcMsha.sourceDirectory,
        "NCUA_PBGC_MSHA_SOURCE"),
    },
    cdiNcigf: {
      artifactPath: requiredPath(value.cdiNcigf.artifactPath,
        "CDI_NCIGF_ARTIFACT"),
      sourceDirectory: requiredPath(value.cdiNcigf.sourceDirectory,
        "CDI_NCIGF_SOURCE"),
    },
    fraPhmsa: {
      artifactPath: requiredPath(value.fraPhmsa.artifactPath,
        "FRA_PHMSA_ARTIFACT"),
      sourceDirectory: requiredPath(value.fraPhmsa.sourceDirectory,
        "FRA_PHMSA_SOURCE"),
    },
    nhtsaRecallRemedy: {
      artifactPath: requiredPath(value.nhtsaRecallRemedy.artifactPath,
        "NHTSA_RECALL_REMEDY_ARTIFACT"),
      sourceDirectory: requiredPath(value.nhtsaRecallRemedy.sourceDirectory,
        "NHTSA_RECALL_REMEDY_SOURCE"),
    },
    bridgeDataV2: {
      artifactPath: requiredPath(value.bridgeDataV2.artifactPath,
        "BRIDGEDATA_V2_ARTIFACT"),
      sourceDirectory: requiredPath(value.bridgeDataV2.sourceDirectory,
        "BRIDGEDATA_V2_SOURCE"),
    },
    waymoSafetyImpact: {
      artifactPath: requiredPath(value.waymoSafetyImpact.artifactPath,
        "WAYMO_SAFETY_IMPACT_ARTIFACT"),
      sourceDirectory: requiredPath(value.waymoSafetyImpact.sourceDirectory,
        "WAYMO_SAFETY_IMPACT_SOURCE"),
    },
    clinicalTrials: {
      artifactPath: requiredPath(value.clinicalTrials.artifactPath,
        "CLINICALTRIALS_ARTIFACT"),
      sourceDirectory: requiredPath(value.clinicalTrials.sourceDirectory,
        "CLINICALTRIALS_SOURCE"),
    },
  });
}

const TEMPORAL_QUARANTINE_RECEIPT_SET = new Set(
  STAGE0_SOURCE_TEMPORAL_QUARANTINE_RECEIPTS);

const ARTIFACT_RECEIPTS = deepFreeze([
  {
    artifactId: "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY",
    artifactPathRole: "CURRENT_CANONICAL_WAVE5_INTAKE_FINAL_V3_SNAPSHOT_JSON",
    sourcePathRole: "EXACT_FIFTY_SEVEN_OBJECT_WAVE5_SOURCE_DIRECTORY",
    artifactHash: "sha256:2d40c4e44a7d9edb37ce15b526c8aa07bdca694db7cece8e9b3437c8307192ad",
    artifactFileHash: "sha256:b42a912a7a9ffcd31f9a0bf9670c078b71741edfb61ea722a203d22cd4f98ed5",
    artifactFileBytes: 208570,
    hashField: "snapshotHash",
    verifierLevel: "FULL_SOURCE_REPLAY",
    containedLaneIds: ["WAVE5_REAL_SOFTWARE"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [
      "sha256:60849386032e4a10c8c1327188d4a154356dc0526388d10c2bde304f10005f48",
    ],
    sourceCommitment: "sha256:60849386032e4a10c8c1327188d4a154356dc0526388d10c2bde304f10005f48",
    sourceCommitmentMeaning:
      "WAVE5_FULL_SOURCE_VERIFICATION_HASH_FOR_49_SOURCE_AWARE_TAXONOMY_ROWS",
  },
  {
    artifactId: "CROSS_STAGE_SIX_LANE_PROGRESS",
    artifactPathRole: "TEMPORAL_QUARANTINE_CROSS_STAGE_PROGRESS_JSON_REFERENCE_ONLY",
    sourcePathRole: "EXACT_SIX_LANE_SOURCE_PROFILE",
    artifactHash: "sha256:33e814497547ed4c49bd7c7e05f238915cd19cd71a6280ae20276364ba3a2b41",
    artifactFileHash: "sha256:a48ec04b872e0ea4215c0b20d697effb0a817c287d583fadbd2cd4de70540e7a",
    artifactFileBytes: 20848,
    hashField: "artifactHash",
    verifierLevel: "FULL_SIX_LANE_FROZEN_SOURCE_REPLAY",
    containedLaneIds: [
      "WAVE5_REAL_SOFTWARE", "OSHA_ROBOT_SEVERE_INJURY_REPORTS",
      "AIID_LICENSED_INCIDENT_TAXONOMY", "INSTITUTIONAL_AI_REMEDIES",
      "USDA_RMA_CROP_INSURANCE_EXPERIENCE", "CAS_SCHEDULE_P_RESERVE_BACKTEST",
    ],
    upstreamArtifactHashes: [
      "sha256:93b030c608f0534b5a655bc784d67b63b975755b122f64c4571bb7ab8127c3c0",
      "sha256:0d884cc2ecd2838424f38e7ab28f3107d82ef5bdcf5152acfb7392327563c304",
      "sha256:9d8692811ef20225d31503c9c2c6c2d37d8925b47ac78882bc4b09d442096c1b",
      "sha256:5ed89ea0108b403095dd1a8ca609fe6d2fb7c505a0d8865adef73f8de5446dce",
      "sha256:649653b6b901ed29247d99194b1efcfd141f144adf462574ababd56c71023a38",
    ],
    upstreamBindingHashes: [
      "sha256:60849386032e4a10c8c1327188d4a154356dc0526388d10c2bde304f10005f48",
      "sha256:93b030c608f0534b5a655bc784d67b63b975755b122f64c4571bb7ab8127c3c0",
      "sha256:0d884cc2ecd2838424f38e7ab28f3107d82ef5bdcf5152acfb7392327563c304",
      "sha256:9d8692811ef20225d31503c9c2c6c2d37d8925b47ac78882bc4b09d442096c1b",
      "sha256:5ed89ea0108b403095dd1a8ca609fe6d2fb7c505a0d8865adef73f8de5446dce",
      "sha256:649653b6b901ed29247d99194b1efcfd141f144adf462574ababd56c71023a38",
    ],
    sourceCommitment: "sha256:1a3999bffc91d47fba284f48ae306c9f78326331a612e8b6c043aa879aaddf26",
    sourceCommitmentMeaning:
      "FLYWHEEL_COMMITMENT_TO_PROGRESS_ARTIFACT_AND_ITS_SIX_FIXED_SOURCE_PROFILES",
  },
  {
    artifactId: "FDA_MAUDE_OUTCOME_SENSING",
    artifactPathRole: "CURRENT_CANONICAL_FDA_MAUDE_FINAL_V2_JSON",
    sourcePathRole: "EXACT_SIX_OBJECT_FDA_MAUDE_SOURCE_DIRECTORY",
    artifactHash: "sha256:450da676c54f9e8781cff0589618e5f8fbbbf66286c0b38316ae4eb95f643c73",
    artifactFileHash: "sha256:21478252c218b2732417ab5a1c8b554198c8d52b5b8b6cbdd259d3fb2a164cd5",
    artifactFileBytes: 21368,
    hashField: "artifactHash",
    verifierLevel: "FULL_OFFICIAL_FDA_MAUDE_SOURCE_REPLAYED",
    containedLaneIds: ["FDA_MAUDE_PASSIVE_REPORTS"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:54cd3cf336d125f6508653196160a26b163d5e8e51ef420752db24eff583bda3",
    sourceCommitmentMeaning:
      "FLYWHEEL_COMMITMENT_TO_SIX_PINNED_FDA_MONTHLY_INDEX_LIMITATION_BASE_AND_DEVICE_OBJECTS",
  },
  {
    artifactId: "CA_DMV_AV_OUTCOME_SENSING",
    artifactPathRole: "CURRENT_CANONICAL_CA_DMV_FINAL_V3_JSON",
    sourcePathRole: "EXACT_FOURTEEN_OBJECT_CA_DMV_SOURCE_DIRECTORY",
    artifactHash: "sha256:1894ff1026062b9459cd532a3f75c49c8544d8e87c7aec3e76cfb01389e79138",
    artifactFileHash: "sha256:ecaab3ebfe7b4989c7c587f4506605f1920bcbacf6da6bfcd3d1b803fd14c5cd",
    artifactFileBytes: 14355,
    hashField: "artifactHash",
    verifierLevel: "FULL_OFFICIAL_CA_DMV_AV_SOURCE_REPLAYED",
    containedLaneIds: ["CA_DMV_AV_PERMIT_COLLISION_EXPOSURE"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:0f0a06a41059d2557eaa37b4a824f61ee8626c5df1f09a732d9fa21f216a281f",
    sourceCommitmentMeaning:
      "FLYWHEEL_COMMITMENT_TO_FOURTEEN_PINNED_CA_DMV_HTML_PDF_AND_REPORTING_REGIME_OBJECTS",
  },
  {
    artifactId: "INSTITUTIONAL_CAPITAL_CLAIMS",
    artifactPathRole:
      "TEMPORAL_QUARANTINE_INSTITUTIONAL_CAPITAL_CLAIMS_FINAL_V4_REFERENCE_ONLY",
    sourcePathRole: "EXACT_FOURTEEN_OBJECT_FDIC_TREASURY_SEC_ASB_SOURCE_DIRECTORY",
    artifactHash: "sha256:43028caffe868adf1a6019a47ca99513bb964f632de761bb9e64ebe5c3447c7c",
    artifactFileHash: "sha256:e9db5d063f9b4ad4fecf589f759ea6234479b69497fb51cd4a78746595aad62c",
    artifactFileBytes: 74377,
    hashField: "artifactHash",
    verifierLevel: "FULL_OFFICIAL_FDIC_TREASURY_SEC_ASB_SOURCE_REPLAYED",
    containedLaneIds: ["INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:057079002eeb216ef4dc047b9268d990d9dbf847f112967ae145605c72434f89",
    sourceCommitmentMeaning: "UPSTREAM_FOURTEEN_OBJECT_SOURCE_SET_HASH",
  },
  {
    artifactId: "FEMA_REAL_CASES",
    artifactPathRole: "CURRENT_CANONICAL_FEMA_EVIDENCE_V1_0_0_JSON",
    sourcePathRole: "EXACT_FIFTY_ONE_OBJECT_FEMA_SOURCE_V3_DIRECTORY",
    artifactHash: "sha256:8e4a0c2c6e170e69f9bcaf1f2c6c8715956a367999d2d48412c14e76b94e6e5c",
    artifactFileHash: "sha256:60a4ecdd871d22a3c515f41a65c125ca766d5580074208acae968f19bbee3fb7",
    artifactFileBytes: 22847,
    hashField: "artifactHash",
    verifierLevel: "FULL_FEMA_CBCA_FROZEN_SOURCE_REPLAY",
    containedLaneIds: ["FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:a7f8c9fc4cb6a2b3b88dda24de3edaf6b434dab86b10a97a75e9c2a6e7853405",
    sourceCommitmentMeaning: "UPSTREAM_FIFTY_ONE_OBJECT_SOURCE_COMMITMENT_HASH",
  },
  {
    artifactId: "REMEDY_PAYMENT_RECOVERY",
    artifactPathRole: "TEMPORAL_QUARANTINE_REMEDY_PAYMENT_FINAL_V1_REFERENCE_ONLY",
    sourcePathRole: "EXACT_FOUR_OBJECT_CFPB_FTC_CPSC_SOURCE_DIRECTORY",
    artifactHash: "sha256:0d27c736a6c1a9ca6473b5656ea603f26593ef51a3cc154bedbbc660328a9997",
    artifactFileHash: "sha256:eb5a57cb442a95076de41feeff9a403c86befc5bf18b8c03740709f8e66b1e34",
    artifactFileBytes: 160720,
    hashField: "bookHash",
    verifierLevel: "FULL_PINNED_OFFICIAL_SOURCE_SET_AND_PROJECTION_REPRODUCED",
    containedLaneIds: ["CFPB_FTC_CPSC_PAYMENT_REMEDY_RECOVERY"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:92e370b8123a7fbdf9bc93c4382988ac4ced13cfdb093589f12273788c1edbf5",
    sourceCommitmentMeaning: "UPSTREAM_FOUR_OBJECT_SOURCE_SET_HASH",
  },
  {
    artifactId: "NTSB_BLS_REAL_OUTCOME_EXPERIENCE",
    artifactPathRole: "CURRENT_CANONICAL_NTSB_BLS_FINAL_V2_CANONICAL_HARDENING_JSON",
    sourcePathRole: "EXACT_THIRTY_EIGHT_OBJECT_PLUS_MANIFEST_NTSB_BLS_SOURCE_DIRECTORY",
    artifactHash: "sha256:da933b03d6ed8c3c56cc80561373f03bb2060b93adce45995eb88f13c8ff4792",
    artifactFileHash: "sha256:1b1b57250becd399ef0a698d7273275fe0f21e8b99bf7b9d5a15597835f399af",
    artifactFileBytes: 46469,
    hashField: "artifactHash",
    verifierLevel: "FULL_OFFICIAL_NTSB_BLS_SOURCE_REPLAYED",
    containedLaneIds: ["NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
      "BLS_IIF_2024_SOII_CFOI_OIICS"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:7567c6af079ae204d58a7dc0cfada7b939524665b819da02d42fbccebcb42214",
    sourceCommitmentMeaning:
      "UPSTREAM_THIRTY_EIGHT_OBJECT_SOURCE_SET_HASH_WITH_SEPARATE_ACQUISITION_MANIFEST",
  },
  {
    artifactId: "JUDGMENT_FUND_GAO_REAL_CASES",
    artifactPathRole: "CURRENT_CANONICAL_JUDGMENT_FUND_GAO_FINAL_V1_JSON",
    sourcePathRole: "EXACT_THIRTY_ONE_OBJECT_PLUS_MANIFEST_TREASURY_GAO_SOURCE_DIRECTORY",
    artifactHash: "sha256:e10699896cd8e7de3ca420f4f7092d4871324110a0a299e8cd9c07f19263109e",
    artifactFileHash: "sha256:85277537539f6ed38d08a29b5b320c9c4572f237d7d440bebbcf3a5d7c676c09",
    artifactFileBytes: 99103,
    hashField: "artifactHash",
    verifierLevel: "FULL_PINNED_TREASURY_GAO_SOURCE_REPLAY_AND_EXACT_ARTIFACT_COMPARE",
    containedLaneIds: ["TREASURY_JUDGMENT_FUND", "GAO_BID_PROTEST"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:0073a8cf314aeadda25d281aa1d89db6ac00b5214093fcbb50069f29c8d81fe5",
    sourceCommitmentMeaning:
      "UPSTREAM_THIRTY_ONE_OBJECT_TREASURY_GAO_SOURCE_OBJECT_SET_HASH_WITH_SEPARATE_ACQUISITION_MANIFEST",
  },
  {
    artifactId: "NCUA_PBGC_MSHA_REAL_EXPERIENCE",
    artifactPathRole: "CURRENT_CANONICAL_NCUA_PBGC_MSHA_FINAL_V1_JSON",
    sourcePathRole: "EXACT_FIFTEEN_OBJECT_PLUS_MANIFEST_NCUA_PBGC_MSHA_SOURCE_DIRECTORY",
    artifactHash: "sha256:ddc277d4548b097e7053487ae8572385046e7162246175f2a664d1f87be14973",
    artifactFileHash: "sha256:42cc5a07643dd638569e4ef6de7e0c81fc196ebcda516040db9cb9ca849d38e4",
    artifactFileBytes: 35972,
    hashField: "artifactHash",
    verifierLevel: "FULL_PINNED_NCUA_PBGC_MSHA_SOURCE_REPLAY_AND_EXACT_ARTIFACT_COMPARE",
    containedLaneIds: ["NCUA_NCUSIF_2025_AUDITED_EXPERIENCE",
      "PBGC_PENSION_INSURANCE_2024_2025_EXPERIENCE",
      "MSHA_ACCIDENT_AND_EMPLOYMENT_2000_2026"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:2d83821edcda7ab79668a45c04f53991379167b48a68e9783578fa756a1af089",
    sourceCommitmentMeaning:
      "UPSTREAM_FIFTEEN_OBJECT_NCUA_PBGC_MSHA_SOURCE_SET_HASH_WITH_SEPARATE_ACQUISITION_MANIFEST",
  },
  {
    artifactId: "CDI_NCIGF_REAL_RATE_GUARANTY",
    artifactPathRole: "TEMPORAL_QUARANTINE_CDI_NCIGF_FINAL_V1_REFERENCE_ONLY",
    sourcePathRole: "EXACT_THIRTEEN_OBJECT_CDI_NCIGF_SOURCE_DIRECTORY",
    artifactHash: "sha256:2ee3625eac2c35e1be5113a78477ac1128d6a663d2e2ee6c66e53570d09b086a",
    artifactFileHash: "sha256:2ea48baea38c71f7fe9aeb1029ea2bc00484eb65620a2f43db20e6bfec4a6823",
    artifactFileBytes: 27832,
    hashField: "artifactHash",
    verifierLevel: "FULL_EXACT_OFFICIAL_SOURCE_REPLAYED",
    containedLaneIds: ["CDI_RATE_FILING_AND_REGISTRY_EXPERIENCE",
      "NCIGF_ASSESSMENT_CAPACITY_EXPERIENCE"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:9502869817e5fa942baba01351b18ae852179bdf516aa345c4f0435d878daaf5",
    sourceCommitmentMeaning: "UPSTREAM_THIRTEEN_OBJECT_CDI_NCIGF_OFFICIAL_SOURCE_SET_HASH",
  },
  {
    artifactId: "FRA_PHMSA_REAL_SAFETY_EVIDENCE",
    artifactPathRole: "CURRENT_CANONICAL_FRA_PHMSA_FINAL_V2_JSON",
    sourcePathRole: "EXACT_TWELVE_OBJECT_PLUS_MANIFEST_FRA_PHMSA_SOURCE_V2_DIRECTORY",
    artifactHash: "sha256:faf6c83de86433ad2e97abfb63fca2a1b6045692acd39a8ff56916fcd9082836",
    artifactFileHash: "sha256:97326061fffefe20cb06c6640ea0f1c28e55a2edc2cd8a211ecb8dd1db4ba7ff",
    artifactFileBytes: 33606,
    hashField: "artifactHash",
    verifierLevel: "FULL_OFFICIAL_FRA_PHMSA_SOURCE_REPLAYED",
    containedLaneIds: ["FRA_FORM54_FORM55_2015_2019",
      "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:ee6c751b15db415b08b5eddb481a59ed4ca0f33ab6c2a44cd911743654f79f56",
    acquisitionManifestHash:
      "sha256:322b8a8446bbffb738edb102a02b03bd722624d84e695d23b56366cfef978e52",
    sourceCommitmentMeaning:
      "UPSTREAM_TWELVE_OBJECT_FRA_PHMSA_SOURCE_SET_HASH_WITH_SEPARATE_ACQUISITION_MANIFEST",
  },
  {
    artifactId: "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE",
    artifactPathRole: "CURRENT_CANONICAL_NHTSA_RECALL_REMEDY_FINAL_V6_JSON",
    sourcePathRole: "EXACT_SIX_OBJECT_PLUS_MANIFEST_NHTSA_RECALL_REMEDY_SOURCE_DIRECTORY",
    artifactHash: "sha256:afad74141571a82e40564f7b43bcacb0ccea2671684f3809e4bf4717af069034",
    artifactFileHash: "sha256:47ff5b8ccb8f780efe235d39bcf21c890917a54baa4f1de1114881af1fad628e",
    artifactFileBytes: 15646,
    hashField: "artifactHash",
    verifierLevel:
      "FULL_PINNED_NHTSA_RECALL_REMEDY_SOURCE_REPLAY_AND_EXACT_ARTIFACT_COMPARE",
    containedLaneIds: ["NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:b4552ffd3ebb2bc1d05b368c0bca3d6ccd42ac97d21f360b7eef63c3bfea5bb1",
    acquisitionManifestHash:
      "sha256:b20bc43b921c08db9b7d646e591e69f53e3db05ee99c9946093fac89a1237d82",
    sourceCommitmentMeaning:
      "UPSTREAM_SIX_OBJECT_NHTSA_RECALL_REMEDY_SOURCE_SET_HASH_WITH_SEPARATE_ACQUISITION_MANIFEST",
  },
  {
    artifactId: "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE",
    artifactPathRole: "TEMPORAL_QUARANTINE_BRIDGEDATA_V2_FINAL_V5_REFERENCE_ONLY",
    sourcePathRole: "EXACT_NINE_OBJECT_PLUS_MANIFEST_BRIDGEDATA_V2_SOURCE_V1_DIRECTORY",
    artifactHash: "sha256:1db2d9b893cdb6cfc604154a787d70092b5a6c03d2122f2b81f56fa9e79e97c2",
    artifactFileHash: "sha256:c5eaba1e0e910733ab6fad1007d90839762a6e8ae97ee68e9ddeb4266da5f25f",
    artifactFileBytes: 36204,
    hashField: "artifactHash",
    verifierLevel: "FULL_SOURCE_REPLAY",
    containedLaneIds: ["BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORY_CANDIDATE"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:546495e05d3777562bd8dd9f70325bd4e4e1b07778ac8324178e629a36e6ef4d",
    sourceCommitmentMeaning:
      "UPSTREAM_NINE_OBJECT_BRIDGEDATA_V2_SOURCE_SET_WITH_EXACT_ONE_RECORD_RANGE_AND_SEPARATE_ACQUISITION_MANIFEST",
  },
  {
    artifactId: "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE",
    artifactPathRole: "TEMPORAL_QUARANTINE_WAYMO_SAFETY_IMPACT_FINAL_V5_REFERENCE_ONLY",
    sourcePathRole: "EXACT_SIX_OBJECT_PLUS_MANIFEST_WAYMO_SAFETY_IMPACT_SOURCE_V1_DIRECTORY",
    artifactHash: "sha256:edccce782d93f0f8f6f01c14f427d44e4137d0b1cf5c040a0c84d0ada9da0a7a",
    artifactFileHash: "sha256:5bbb3c40d373551b5f3eeccc1521bd06c62ec0b46a23c8e0de7dda09313169bd",
    artifactFileBytes: 29849,
    hashField: "artifactHash",
    verifierLevel: "FULL_SOURCE_REPLAY",
    containedLaneIds: ["WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:c51bf261e81088a4faf1ca02736c4d7bb7c562c3573dcc852f80e33a85d35d7f",
    sourceCommitmentMeaning:
      "UPSTREAM_SIX_OBJECT_WAYMO_SAFETY_IMPACT_SOURCE_SET_WITH_SEPARATE_ACQUISITION_MANIFEST",
  },
  {
    artifactId: "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE",
    artifactPathRole:
      "TEMPORAL_QUARANTINE_CLINICALTRIALS_POSTED_RESULTS_FINAL_V3_REFERENCE_ONLY",
    sourcePathRole: "EXACT_SIX_OBJECT_PLUS_MANIFEST_CLINICALTRIALS_API_V2_SOURCE_DIRECTORY",
    artifactHash: "sha256:93ae703761d069b7adbdc8ad781cc2ebb1d91b836aa21e027a5f6657f84840a6",
    artifactFileHash: "sha256:cc6a3847ca58003db1cf91ba3fdc6cb365152c3c7ca82bb9c6be4b42f491f210",
    artifactFileBytes: 81982,
    hashField: "artifactHash",
    verifierLevel: "FULL_EXACT_OFFICIAL_DATA_API_SOURCE_REPLAY_RIGHTS_TERMS_NOT_REPLAYED",
    containedLaneIds: ["CLINICALTRIALS_SPONSOR_POSTED_AGGREGATE_RESULTS_REFERENCE"],
    upstreamArtifactHashes: [],
    upstreamBindingHashes: [],
    sourceCommitment: "sha256:34199d825412cb9931378ebed6146a003e04e5788a492f8df3041a46d4fe6910",
    acquisitionManifestHash:
      "sha256:50a1bceba404de66969cb99b7bf0cbc6b817caf915855452d70bd011c77bb1a9",
    sourceCommitmentMeaning:
      "UPSTREAM_SIX_OBJECT_CLINICALTRIALS_API_V2_SOURCE_SET_WITH_SEPARATE_ACQUISITION_MANIFEST",
  },
].map((row) => {
  const temporalQuarantine = TEMPORAL_QUARANTINE_RECEIPT_SET.has(row.artifactId);
  const receiptRow = {
    ...row,
    sourceBytesReplayed: true,
    sourceBytesReplayedClaimBasis:
      "PINNED_TEMPORAL_AUDIT_FINAL_V2_RECORDED_RESULT_NOT_FLYWHEEL_ARTIFACT_ALONE",
    temporalAuthenticityEstablished: !temporalQuarantine,
    temporalStatus: temporalQuarantine
      ? "PINNED_SOURCE_REPLAYED_TEMPORAL_AUTHENTICITY_UNESTABLISHED"
      : "PINNED_SOURCE_REPLAYED_TEMPORALLY_ORDERED_CURRENT_REFERENCE",
    currentRoutingEligible: !temporalQuarantine,
    currentCoverage: !temporalQuarantine,
    currentTruth: !temporalQuarantine,
    currentTruthMeaning: temporalQuarantine
      ? "TEMPORAL_AUTHENTICITY_UNESTABLISHED_QUARANTINED_REFERENCE_ONLY"
      : "CURRENT_RECEIPT_BYTES_AND_TEMPORAL_ORDER_ONLY_NOT_UNDERLYING_WORLD_TRUTH",
    closureCredit: false,
    causalExperienceUnits: 0,
    trainingAdmission: false,
    pricingAdmission: false,
    operationalAuthorityGranted: false,
  };
  if (temporalQuarantine) {
    assertNoCurrentSemanticTokenInValues(receiptRow, row.artifactId);
  }
  return receiptRow;
}));

function lane(id, artifactId, realityStatus, collectionRelationship, observationUnit,
  units, denominatorBoundary, missingness, rightsBoundary, correlationBoundary,
  descriptiveMeasurements, qualityOverrides, nextSnapshot) {
  return { laneId: id, artifactId, realityStatus, collectionRelationship, observationUnit,
    units, denominatorBoundary, missingness, rightsBoundary, correlationBoundary,
    descriptiveMeasurements, qualityOverrides, nextSnapshot };
}

/*
 * All numbers below retain their publisher-native unit. They are never summed
 * or used as one another's denominator.
 */
const LANE_SPECS = deepFreeze([
  lane("WAVE5_REAL_SOFTWARE", "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY",
    "REAL_CASE_RECORDED", "THIRD_PARTY_PUBLIC", "RECORDED_AGENT_SESSION_OR_SOFTWARE_FIX_ROW",
    ["RECORDED_AGENT_SESSION_STRUCTURE", "ROBOT_SOFTWARE_BUG_FIX_METADATA"],
    "THREE_ORGANIC_SESSIONS_AND_FORTY_SIX_BUG_ROWS_ARE_SELECTED_ROWS_NOT_AN_EXPOSURE_DENOMINATOR",
    ["INDEPENDENT_OUTCOME", "ECONOMIC_LOSS", "PHYSICAL_EXECUTION", "UNIFORM_EMBEDDED_RIGHTS"],
    "TRACE_COMPILATION_CC_BY_4_0; EMBEDDED_TRACE_RIGHTS_AND_ROBUST_ROS_ROOT_LICENSE_NOT_UNIFORMLY_ESTABLISHED; NO_AUTOMATIC_TRAINING",
    "SESSION_AND_REPOSITORY_ROOTS_RETAINED; NO_IID_OR_CROSS_SOURCE_INDEPENDENCE_ASSUMED",
    { organicAgentSessions: 3, robotSoftwareBugFixRecords: 46, agentToolCalls: 61,
      agentNativeToolErrors: 6 },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      measurementDefinition: "PARTIAL", privacyProjection: "PARTIAL" },
    "PIN_NEXT_REVISIONS; KEEP_SELECTION_OUTCOME_BLIND; DIFF_STABLE_RECORD_HASHES"),
  lane("OSHA_ROBOT_SEVERE_INJURY_REPORTS", "CROSS_STAGE_SIX_LANE_PROGRESS",
    "REAL_CASE_RECORDED", "SUBJECT_REPORTED_TO_REGULATOR", "EMPLOYER_REPORTED_REGULATORY_ROW",
    ["EMPLOYER_REPORTED_SEVERE_INJURY_ROW", "REPORTED_AFFECTED_WORKER_COUNT"],
    "105996_SOURCE_ROWS_WITH_116_TEXT_SELECTED_ROBOT_OR_AGV_ROWS; NO_WORKER_HOUR_MACHINE_HOUR_OR_TASK_EXPOSURE",
    ["STATE_PLAN_STATE_REPORTS", "FATALITIES", "INDEPENDENT_CAUSAL_ADJUDICATION",
      "ECONOMIC_LOSS", "RECOVERY_AND_CLOSURE"],
    "PUBLIC_DOWNLOAD_OBSERVED; DATASET_LICENSE_AND_REUSE_OR_TRAINING_RIGHTS_NOT_ESTABLISHED",
    "FIVE_DUPLICATE_NATIVE_IDS_AND_UPA_CORRELATION_KEYS_RETAINED; REPORT_ROWS_NOT_ASSUMED_IID",
    { sourceReportRows: 105996, selectedRobotOrAgvRows: 116,
      reportsWithHospitalization: 77, reportsWithAmputation: 46 },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      outcomeSensing: "PARTIAL", privacyProjection: "VERIFIED" },
    "PIN_NEXT_OSHA_ZIP; DIFF_NATIVE_ID_AND_CORRELATION_ROOTS; DO_NOT TREAT TEXT SELECTION AS POPULATION"),
  lane("AIID_LICENSED_INCIDENT_TAXONOMY", "CROSS_STAGE_SIX_LANE_PROGRESS",
    "REAL_CASE_RECORDED", "THIRD_PARTY_PUBLIC", "PUBLISHER_CURATED_INCIDENT_OR_CLASSIFICATION",
    ["PUBLISHER_CURATED_INCIDENT", "PUBLIC_TAXONOMY_CLASSIFICATION", "ENTITY_PROJECTION"],
    "1632_INCIDENT_DOCUMENTS_AND_2623_CLASSIFICATION_DOCUMENTS_ARE_ALLOWED_COLLECTION_COUNTS_NOT_AN_EXPOSURE_DENOMINATOR",
    ["DIRECT_AFFECTED_PARTY_REPORT", "INDEPENDENT_ADJUDICATION", "ECONOMIC_LOSS",
      "LONGITUDINAL_RECOVERY_AND_CLOSURE"],
    "PINNED_PUBLISHER_TERMS_STATE_CC_BY_SA_4_0_FOR_ALLOWED_COLLECTIONS; ATTRIBUTION_AND_SHARE_ALIKE_REQUIRED; LINKED_CONTENT_RIGHTS_NOT_INFERRED",
    "INCIDENT_REPORT_REFERENCES_AND_ENTITY_ROLE_ROOTS_RETAINED; 33_UNJOINED_REFERENCES_NOT_FORCED",
    { incidentDocuments: 1632, incidentReportReferences: 6432,
      admittedPublishedClassifications: 2307, publicClassificationAttributes: 40319 },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      outcomeSensing: "PARTIAL", rightsAndConsent: "PARTIAL", privacyProjection: "VERIFIED" },
    "PIN_NEXT_SNAPSHOT_AND_TERMS; ALLOWLIST_DIFF_ONLY; NEVER INFER LINKED_CONTENT_RIGHTS"),
  lane("INSTITUTIONAL_AI_REMEDIES", "CROSS_STAGE_SIX_LANE_PROGRESS",
    "REAL_INSTITUTIONAL_OPERATION", "HUMAN_ADJUDICATED_PUBLIC_RECORD",
    "INSTITUTIONAL_CASE_REMEDY_OBLIGATION_OR_MONITORING_DOCUMENT",
    ["INSTITUTIONAL_CASE", "REMEDY_OBLIGATION", "PUBLISHED_MONITORING_DOCUMENT"],
    "TWO_SELECTED_CASES_AND_THIRTEEN_OBLIGATIONS; NOT_A_POPULATION_OF_AI_HARMS_OR_REMEDIES",
    ["MERITS_ADMISSION", "PAYMENT_RECEIPT", "IMPLEMENTATION_PERFORMANCE",
      "AFFECTED_PARTY_ACCEPTANCE", "DELAYED_RECURRENCE", "EXTERNAL_CLOSURE_OR_REOPENING"],
    "PUBLIC_ACCESS_OBSERVED; TRAINING_AND_THIRD_PARTY_REPORT_REUSE_RIGHTS_NOT RESOLVED",
    "CASE_AND_DOCUMENT_ROOTS_RETAINED; DOCUMENT_COUNT_NOT_TREATED_AS_INDEPENDENT_CASE_COUNT",
    { cases: 2, remedyObligations: 13, publishedMonitoringDocuments: 5,
      paymentExecutionVerifiedRows: 0, closureEstablishedRows: 0 },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      outcomeSensing: "PARTIAL", adjudicationFinality: "PARTIAL",
      longitudinalMaturity: "PARTIAL", privacyProjection: "VERIFIED" },
    "REPLAY_NEW_OFFICIAL_DOCUMENTS; REQUEST IMPLEMENTATION PAYMENT AFFECTED_PARTY RECOVERY AND REOPENING EVIDENCE"),
  lane("USDA_RMA_CROP_INSURANCE_EXPERIENCE", "CROSS_STAGE_SIX_LANE_PROGRESS",
    "REAL_EXPERIENCE_AGGREGATE", "REGULATOR_PUBLISHED", "STATE_COUNTY_CROP_COVERAGE_CELL",
    ["STATE_COUNTY_CROP_COVERAGE_CELL", "PUBLISHER_RECORDED_DOLLAR"],
    "97782_EXPOSURE_CELLS_INCLUDE_41792_ZERO_REPORTED_LOSS_CELLS; POLICY_AND_UNIT_NUMERATOR_ANOMALIES_QUARANTINE_FREQUENCY",
    ["UNIQUE_POLICYHOLDER_DENOMINATOR", "CLAIM_IDENTITY_AND_SEVERITY",
      "PAID_CASE_RESERVE_AND_RECOVERY", "APPEAL_AND_FRAUD_STATUS", "TARGET_DOMAIN_LINKAGE"],
    "PUBLIC_ACCESS_OBSERVED; WEB_POLICY_BYTES_NOT_REPLAYED; MODEL_TRAINING_RIGHTS_NOT_LEGALLY_CONCLUDED",
    "STATE_COUNTY_CROP_COVERAGE_CELL_IS_THE_ROOT; NO_IID_CLAIM_ASSUMPTION_OR_CROSS_CROP_POOLING",
    { sourceRows: 152383, exposureCells: 97782, zeroReportedLossExposureCells: 41792,
      liabilityDollars: "158673917761", indemnityDollars: "15163448979" },
    { populationFrame: "PARTIAL", recordCompleteness: "VERIFIED",
      revisionAndDedup: "VERIFIED", measurementDefinition: "VERIFIED",
      temporalOrdering: "PARTIAL", exposureDenominator: "PARTIAL",
      outcomeSensing: "PARTIAL", economicAmount: "VERIFIED",
      dependenceStructure: "PARTIAL", privacyProjection: "VERIFIED" },
    "PIN_NEXT_COMMODITY_YEAR_OR_MUTABLE_REFRESH; DIFF_CELLS; PRESERVE_COUNT_ANOMALY_QUARANTINE"),
  lane("CAS_SCHEDULE_P_RESERVE_BACKTEST", "CROSS_STAGE_SIX_LANE_PROGRESS",
    "REAL_EXPERIENCE_AGGREGATE", "THIRD_PARTY_PUBLIC",
    "COMPANY_LINE_ACCIDENT_YEAR_DEVELOPMENT_CELL",
    ["COMPANY_LINE_ACCIDENT_YEAR_DEVELOPMENT_CELL", "UNSCALED_SOURCE_AMOUNT_UNIT"],
    "6304_PAID_AND_6321_INCURRED_HOLDOUT_COHORTS_WITHIN_SOURCE_TRIANGLES; NOT_TARGET_EXPOSURE",
    ["DEVELOPMENT_BEYOND_LAG_10", "VALIDATED_TAIL_FACTOR", "POSTED_RESERVE_SCOPE",
      "CROSS_ENTITY_CORRELATION_AND_CALENDAR_SHOCK", "CLAIM_ADJUDICATION_AND_RECOVERY",
      "TARGET_DOMAIN_LINKAGE", "SOURCE_AMOUNT_SCALE"],
    "PUBLIC_DOWNLOAD_AND_RESEARCH_INVITATION_OBSERVED; RAW_REDISTRIBUTION_COMMERCIAL_USE_AND_AUTOMATIC_TRAINING_NOT_CONCLUDED",
    "COMPANY_LINE_ACCIDENT_YEAR_ROOTS_RETAINED; CROSS_ENTITY_AND_CALENDAR_SHOCK_DEPENDENCE_UNESTABLISHED",
    { sourceRows: 71650, cumulativePaidEvaluatedCohorts: 6304,
      cumulativePaidLag10WeightedAbsoluteErrorRatio: "0.04003796",
      incurredEvaluatedCohorts: 6321,
      incurredLag10WeightedAbsoluteErrorRatio: "0.03183432" },
    { populationFrame: "PARTIAL", recordCompleteness: "VERIFIED",
      revisionAndDedup: "VERIFIED", measurementDefinition: "PARTIAL",
      temporalOrdering: "VERIFIED", economicAmount: "PARTIAL",
      dependenceStructure: "PARTIAL", privacyProjection: "VERIFIED" },
    "PIN_PUBLISHER_REFRESH; RUN_TEMPORALLY_SEPARATE_SOURCE_DOMAIN_HOLDOUT; ADD_TAIL_AND_DEPENDENCE_STUDY"),
  lane("FDA_MAUDE_PASSIVE_REPORTS", "FDA_MAUDE_OUTCOME_SENSING",
    "REAL_CASE_RECORDED", "SUBJECT_REPORTED_TO_REGULATOR", "MDR_REPORT_KEY_AFTER_ADD_CHANGE_PRECEDENCE",
    ["PASSIVE_SURVEILLANCE_REPORT_ROW", "CORRELATED_DEVICE_ROW"],
    "779297_EFFECTIVE_MONTHLY_ADD_CHANGE_REPORT_KEYS; FDA_DISCLOSES_NO_DEVICE_USE_DENOMINATOR; REPORTS_ARE_NOT_INCIDENTS",
    ["FULL_HISTORICAL_POPULATION", "UNDERREPORTING", "REPORT_ACCURACY", "DEVICE_CAUSALITY",
      "USE_DENOMINATOR", "DUPLICATION_BEYOND_AVAILABLE_KEYS", "INDEPENDENT_OUTCOME_REVIEW"],
    "OFFICIAL_PUBLIC_DOWNLOAD_OBSERVED; RAW_REDISTRIBUTION_COMMERCIAL_USE_AND_AUTOMATIC_TRAINING_NOT_CONCLUDED",
    "CHANGE_PRECEDENCE_APPLIED; 336371_BASE_OVERLAPS; MULTIPLE_REPORTER_DUPLICATE_RISK_RETAINED; PSEUDONYMOUS_KEYS_REMAIN_LINKABLE",
    { effectiveReportRows: 779297, deathTypeReports: 3405, injuryTypeReports: 222744,
      malfunctionTypeReports: 552845, effectiveDeviceRows: 1115698,
      reportsWithFollowupEvidence: 231310 },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      temporalOrdering: "PARTIAL", outcomeSensing: "PARTIAL",
      privacyProjection: "PARTIAL", longitudinalMaturity: "PARTIAL" },
    "PIN_NEXT_MONTHLY_ADD_CHANGE_AND_LIMITATION_PAGES; DIFF_KEYS; REASSESS_LINKAGE_RISK; NEVER COMPUTE_RATE_WITHOUT USE DENOMINATOR"),
  lane("CA_DMV_AV_PERMIT_COLLISION_EXPOSURE", "CA_DMV_AV_OUTCOME_SENSING",
    "REAL_EXPERIENCE_AGGREGATE", "SUBJECT_REPORTED_TO_REGULATOR",
    "REGIME_BOUND_PERMIT_HOLDER_COLLISION_FORM_OR_REPORTED_MILE_COHORT",
    ["AUTHORIZED_ENTITY_SNAPSHOT", "MANUFACTURER_SUBMITTED_COLLISION_FORM",
      "AUTONOMOUS_PUBLIC_ROAD_TEST_MILE"],
    "EXACT_2023_AND_2024_LEGACY_MILE_COHORTS_ARE_NOT_PAIRED_TO_THE_FOUR_NONPROBABILITY_COLLISION_FORMS; PERMITS_ARE_NOT_ACTIVE_VEHICLES_OR_MILES",
    ["COMPLETE_COLLISION_MANIFEST", "INDEPENDENT_OBSERVATION", "DEPLOYMENT_EXPOSURE",
      "COLLISION_REVISION_KEYS", "CURRENT_2026_MONTHLY_AND_QUARTERLY_ROWS", "CAUSALITY_AND_SEVERITY"],
    "OFFICIAL_PUBLIC_ACCESS_AND_EXACT_BYTE_REPLAY_OBSERVED; RAW_REDISTRIBUTION_COMMERCIAL_USE_AND_AUTOMATIC_TRAINING_NOT_CONCLUDED",
    "REGIMES_NEVER_POOLED; FOUR_PDFS_ARE_A_CURATOR_FIXED_NONPROBABILITY_SAMPLE; ORGANIZATION NAMES ONLY",
    { driveredPermitHolders: 28, driverlessPermitHolders: 6, deploymentPermitHolders: 3,
      legacy2023Miles: 9068861, legacy2024Miles: 4498066, selectedCollisionPdfs: 4,
      observed2026MonthlyCsvRows: 0 },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      temporalOrdering: "VERIFIED", exposureDenominator: "PARTIAL",
      outcomeSensing: "PARTIAL", privacyProjection: "VERIFIED" },
    "ACQUIRE_FIRST_2026_MONTHLY_RELEASE_AFTER_2026_08_26_AND_QUARTERLY_RELEASE_AFTER_2026_09_30; PRESERVE_REGIME_ROOTS"),
  lane("INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE", "INSTITUTIONAL_CAPITAL_CLAIMS",
    "REAL_INSTITUTIONAL_OPERATION", "REGULATOR_PUBLISHED",
    "SOURCE_DOMAIN_FAILURE_DIVIDEND_RESERVE_CAPITAL_STANDARD_OR_CUSTODY_POLICY_FACT",
    ["FAILED_BANK_ROW", "RECEIVERSHIP_DIVIDEND_EVENT", "SELECTED_INSURER_USD",
      "ADOPTED_ACTUARIAL_STANDARD", "FEDERAL_COLLATERAL_POLICY"],
    "FAILED_OR_ASSISTED_BANKS_HAVE_NO_ACTIVE_BANK_DENOMINATOR; SELECTED_INSURER_AND_RECEIVERSHIP_FACTS_ARE_NOT_OUTSIDER_CAPITAL_OR_CUSTODY",
    ["ACTIVE_INSTITUTION_EXPOSURE", "OUTSIDER_CLAIM_OR_PAYMENT", "TRANSACTION_LEDGER",
      "CUSTODIAN_ACK", "EXACT_OUTSIDER_MODEL_REVIEW", "CROSS_DOMAIN_TRANSFER"],
    "PUBLIC_ACCESS_OBSERVED; COPYRIGHT_RAW_REDISTRIBUTION_COMMERCIAL_REUSE_AND_AUTOMATIC_TRAINING_NOT CONCLUDED",
    "DUPLICATE_DIVIDENDS_DOWNWARD_REVISIONS_FUND_PRIORITY_ROOTS_AND_ENTITY_SCOPE_RETAINED; NO CROSS_PROGRAM_POOLING",
    { fdicFailureRows: 4115, failuresWithEligibleCostDepositRatio: 3475,
      dividendRows: 2385, distinctDividendRows: 2382, finalDividendRows: 496,
      finalDividendRowsBelow100Percent: 492, selectedInsurerGrossLiabilityUsd: "2886819000",
      selectedInsurerRecoverableUsd: "746798000", adoptedActuarialStandards: 4 },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "VERIFIED", measurementDefinition: "VERIFIED",
      temporalOrdering: "VERIFIED", economicAmount: "VERIFIED",
      dependenceStructure: "PARTIAL", capitalMeasurement: "PARTIAL",
      custodyExecution: "UNESTABLISHED", privacyProjection: "VERIFIED",
      longitudinalMaturity: "PARTIAL" },
    "REFRESH_FDIC_ENDPOINTS_AND_FILINGS; DIFF_REVISIONS; ADD_TRANSACTION_LEVEL_CUSTODY_ACK_ONLY_WHEN AUTHORIZED SOURCE EXISTS"),
  lane("FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS", "FEMA_REAL_CASES",
    "REAL_INSTITUTIONAL_OPERATION", "REGULATOR_PUBLISHED",
    "NFIP_CLAIM_TRANSACTION_EXPOSURE_SNAPSHOT_APPEAL_OR_ARBITRATION_RECORD",
    ["PUBLISHER_CLAIM_TRANSACTION", "PUBLISHER_RECORDED_USD", "CURRENT_CONTRACT_SNAPSHOT",
      "APPEAL_TRACKER_ROW", "PINNED_DECISION_BODY"],
    "3341_NC_2024_CLAIM_TRANSACTION_ROWS_ARE_COMPLETE_WITHIN_FILTER; 2026_EXPOSURE_SNAPSHOT_IS_NOT_A_2024_DENOMINATOR; 74349525_POLICY_TRANSACTIONS_ARE_NOT_POLICIES_IN_FORCE",
    ["UNIQUE_LOSS_IDENTITY", "CONTEMPORANEOUS_EXPOSURE", "WHOLE_US_CORPUS",
      "ALL_APPEAL_AND_CBCA_DECISION_BODIES", "STABLE_REVISION_KEYS", "INDEPENDENT_PDF_SEMANTIC_REVIEW"],
    "OPENFEMA_PUBLIC_ACCESS_HAS_REIDENTIFICATION_INDIVIDUAL_RIGHTS_ATTRIBUTION_CESSATION_LIMITS; TRAINING_NOT_GRANTED; CBCA_REUSE_AND_TRAINING NOT ESTABLISHED",
    "CLAIM_RECORD_NOT_ASSUMED_UNIQUE_LOSS_OR_IID; 12_ADDITIONAL_APPEAL_ROWS_SHARE_COMPOSITE_ROOT; MONEY_AND_UNITS_NEVER_POOLED",
    { nfipClaimTransactionRows: 3341, netPaidDollars: "260428104.72",
      recordedRecoveryDollars: "94087.26", p95PaymentLatencyDays: 388,
      currentNcContractsInForce: "106560", appealRows: 1726,
      signedAppealDecisionRows: 1671, pendingRightCensoredRows: 55,
      cbcaIndexEntries: 349, acquiredCbcaDecisionBodies: 2 },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      temporalOrdering: "VERIFIED", exposureDenominator: "PARTIAL",
      outcomeSensing: "VERIFIED", independentOutcomeReview: "PARTIAL",
      economicAmount: "VERIFIED", adjudicationFinality: "PARTIAL",
      affectedPartyStanding: "PARTIAL", rightsAndConsent: "PARTIAL",
      privacyProjection: "VERIFIED", longitudinalMaturity: "PARTIAL" },
    "REFRESH_OPENFEMA_WITH_START_END_DIFF; ACQUIRE_REMAINING_APPEAL_AND_CBCA_BODIES; KEEP CURRENT_EXPOSURE_SEPARATE_FROM_2024_LOSSES"),
  lane("CFPB_FTC_CPSC_PAYMENT_REMEDY_RECOVERY", "REMEDY_PAYMENT_RECOVERY",
    "REAL_INSTITUTIONAL_OPERATION", "REGULATOR_PUBLISHED",
    "PUBLISHER_ALLOCATION_REFUND_PROGRAM_OR_RECALL_REMEDY_PROGRESS_CASE",
    ["USD_CENT_ANNUAL_REPORT_TABLE_ROW", "CONSUMER_COUNT", "RECALL_REMEDY_PROGRESS_CASE"],
    "COMPLETE_DECLARED_CFPB_AND_FTC_TABLES_AND_DATE_BOUNDED_CPSC_API_SLICE; NO COMPLETE AFFECTED_POPULATION OR ELIGIBLE_RECIPIENT_DENOMINATOR",
    ["INDIVIDUAL_RECEIPT", "COMPLETE_AFFECTED_POPULATION", "INDEPENDENT_CPSC_CORRECTION_CHECK",
      "LONGITUDINAL_REVISION_HISTORY", "FULL_RECOVERY", "CROSS_PUBLISHER_CASE_LINKAGE"],
    "PUBLIC_GOVERNMENT_ACCESS_OBSERVED; LEGAL_AUTOMATIC_TRAINING_REUSE_NOT VERIFIED; RAW_SOURCES_NOT_DISTRIBUTED",
    "SAME_NAME_DIFFERENT_EVENT_TYPES_NOT_COLLAPSED; CPSC_JOIN_USES_TITLE_AND_DATE; ACTIVE_ROWS_RIGHT_CENSORED; NO CROSS_PUBLISHER LINK",
    { cfpbAllocationEvents: 8, cfpbConcludedCaseRows: 6,
      ftcClosedProgramRows: 25, ftcConsumersSentPayment: 1770214,
      ftcConsumersCashedAtLeastOnePayment: 1162743, cpscMprRows: 38,
      cpscRowsWithCompleteCorrectionComponents: 17,
      cpscRowsWithMissingCoreField: 21 },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      temporalOrdering: "PARTIAL", outcomeSensing: "PARTIAL",
      independentOutcomeReview: "PARTIAL", economicAmount: "PARTIAL",
      adjudicationFinality: "PARTIAL", affectedPartyStanding: "PARTIAL",
      privacyProjection: "VERIFIED", longitudinalMaturity: "PARTIAL" },
    "REFRESH_ANNUAL_REPORTS_RECALL_API_AND_MPR; DIFF_CASE_ROOTS; SEEK INDIVIDUAL_RECEIPT INDEPENDENT_RECOVERY AND REOPENING EVIDENCE"),
  lane("NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
    "NTSB_BLS_REAL_OUTCOME_EXPERIENCE",
    "REAL_INSTITUTIONAL_OPERATION", "HUMAN_ADJUDICATED_PUBLIC_RECORD",
    "COMPLETED_NTSB_PARTIAL_AUTOMATION_INVESTIGATION_CASE_OR_SOURCE_BOUND_FINAL_FINDING",
    ["COMPLETED_INVESTIGATION_CASE", "ADOPTED_FINAL_SAFETY_REPORT",
      "SELECTED_FACTUAL_DOCKET_REPORT"],
    "SIX_COMPLETED_CASES_ARE_THE_EXACT_FROZEN_ADVOCACY_INDEX_SELECTION; THEY_ARE_NOT_A_STATISTICAL_POPULATION REPRESENTATIVE_SAMPLE OR FREQUENCY_DENOMINATOR",
    ["COMPLETE_DOCKET_DOCUMENT_BYTES", "ONGOING_INVESTIGATIONS",
      "POST_FREEZE_RECOMMENDATION_STATUS", "ECONOMIC_LOSS", "CIVIL_LIABILITY_OR_CLAIM",
      "TARGET_DOMAIN_TRANSFER"],
    "OFFICIAL_PUBLIC_ACCESS_OBSERVED; 49_USC_1154B_RESTRICTS_USE_OF_NTSB_REPORTS_IN_CIVIL_DAMAGES_ACTIONS; REDISTRIBUTION COMMERCIAL REUSE AND AUTOMATIC TRAINING NOT CONCLUDED",
    "HIR2602_BINDS_TWO_CASES; DOCUMENTS_ARE_NOT_CASES; CASE REPORT DOCKET AND TYPO_ROOTS_RETAINED; SIX_SELECTED_CASES_NOT_ASSUMED_IID_OR_POOLED_WITH_BLS",
    { completedCases: 6, finalReportFiles: 5, finalReportCaseCoverage: 6,
      selectedFactualReportFiles: 6, docketIndexPages: 6, docketDocumentLinks: 199,
      completeDocketDocumentBytesCaptured: false, ongoingCasesIncluded: 0 },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "VERIFIED", measurementDefinition: "VERIFIED",
      temporalOrdering: "VERIFIED", outcomeSensing: "VERIFIED",
      independentOutcomeReview: "VERIFIED", adjudicationFinality: "PARTIAL",
      causalDesign: "PARTIAL", rightsAndConsent: "PARTIAL",
      privacyProjection: "VERIFIED", longitudinalMaturity: "PARTIAL" },
    "PIN_NEW_COMPLETED_AND_ONGOING_STATUS; ACQUIRE_FULL_DOCKETS_AND_RECOMMENDATION_STATUS; DIFF_CASE_REPORT_DOCUMENT_ROOTS; RETAIN_49_USC_1154B_SCOPE"),
  lane("BLS_IIF_2024_SOII_CFOI_OIICS", "NTSB_BLS_REAL_OUTCOME_EXPERIENCE",
    "REAL_EXPERIENCE_AGGREGATE", "REGULATOR_PUBLISHED",
    "BLS_2024_SOII_SURVEY_ESTIMATE_CFOI_CENSUS_COUNT_OR_OIICS_CLASSIFICATION",
    ["CASES_PER_100_FULL_TIME_EQUIVALENT_WORKERS", "THOUSANDS_OF_CASES",
      "THOUSANDS_OF_EMPLOYEE_HOURS", "RELATIVE_STANDARD_ERROR_PERCENT",
      "FATAL_INJURIES_PER_100000_FULL_TIME_EQUIVALENT_WORKERS",
      "MILLIONS_OF_HOURS_WORKED", "OIICS_CLASSIFICATION_CODE"],
    "BLS_DEFINED_SOURCE_FRAMES_AND_FORMULAS_APPLY; SOII_HOURS_ARE_SURVEY_ESTIMATES AND_CFOI_RATE_HOURS_ARE_CPS_ESTIMATES; DISPLAYED_TOTALS_WITH_EXCLUSIONS_CANNOT_BE_FREELY_RECOMPUTED",
    ["CROSS_ROW_AND_CROSS_COLUMN_COVARIANCE", "NONSAMPLING_ERROR_NOT_COVERED_BY_RSE",
      "SUPPRESSED_EXACT_VALUES", "ECONOMIC_LOSS", "LOSS_SEVERITY", "CAUSAL_EFFECT",
      "TARGET_DOMAIN_TRANSFER"],
    "OFFICIAL_PUBLIC_ACCESS_OBSERVED; THREE_HTML_OBJECTS_ARE_BROWSER_RENDERED_DOM_NOT_ORIGINAL_RESPONSE_BYTES AND_TRANSPORT_IS_UNATTESTED; REUSE AND_AUTOMATIC_TRAINING RIGHTS_NOT CONCLUDED",
    "REPEATED_NORMALIZED_ROWS_RETAINED; HOURS_USE_A_SEPARATE_FRAME_WITH_NO_POSITIONAL_JOIN; COVARIANCE_ABSENT; OIICS_NAICS_SOC_VERSION_ROOTS_RETAINED",
    { soiiMainRows: 1070, soiiUniqueNormalizedKeys: 1047,
      soiiRepeatedNormalizedRows: 23, soiiHoursRows: 1062,
      soiiHoursUniqueKeys: 1034, soiiUniqueKeyOverlap: 1026,
      privateTotalRecordableRatePer100Fte: "2.3",
      privateTotalRecordableCasesThousands: "2488.4",
      privateEmployeeHoursThousands: "213077936",
      privateTotalRecordableRateRsePercent: "0.4",
      privateTotalRecordableCountRsePercent: "0.5",
      cfoiAllFatalOccupationalInjuries: 5070, cfoiPrivateIndustryFatalInjuries: 4616,
      cfoiTotalHoursWorkedMillions: "297600", cfoiTotalRatePer100000Fte: "3.3",
      oiicsVersion: "3.03", oiicsWorkbookSheets: 13 },
    { populationFrame: "VERIFIED", recordCompleteness: "VERIFIED",
      revisionAndDedup: "VERIFIED", measurementDefinition: "VERIFIED",
      temporalOrdering: "VERIFIED", exposureDenominator: "VERIFIED",
      outcomeSensing: "VERIFIED", independentOutcomeReview: "PARTIAL",
      economicAmount: "NOT_APPLICABLE", adjudicationFinality: "NOT_APPLICABLE",
      dependenceStructure: "UNESTABLISHED", rightsAndConsent: "PARTIAL",
      privacyProjection: "VERIFIED", longitudinalMaturity: "PARTIAL" },
    "PIN_NEXT_ANNUAL_SOII_CFOI_AND_OIICS_RELEASES; PRESERVE_RSE_SUPPRESSION_SEPARATE_FRAMES_CLASSIFICATION_VERSIONS_AND_ABSENT_COVARIANCE; NEVER_SILENTLY_POOL_SERIES_BREAKS"),
  lane("TREASURY_JUDGMENT_FUND", "JUDGMENT_FUND_GAO_REAL_CASES",
    "REAL_INSTITUTIONAL_OPERATION", "REGULATOR_PUBLISHED",
    "TREASURY_PUBLISHED_PAYMENT_COMPONENT_ROW_OR_CERTIFICATION_DISBURSEMENT_PROCESS_FACT",
    ["PUBLISHED_PAYMENT_COMPONENT_ROW", "USD_CENT", "BIWEEKLY_REPORT_INTERVAL",
      "RESPONSIBLE_AGENCY_AGGREGATE", "SUBMITTING_AGENCY_AGGREGATE",
      "PRINCIPAL_CITATION_AGGREGATE"],
    "16154_PAYMENT_COMPONENT_ROWS_COVER_FOURTEEN_CONTIGUOUS_PUBLISHED_INTERVALS_THROUGH_2026_07_31; COMPONENT_ROWS_ARE_NOT_UNIQUE_CLAIMS_LOSSES_RECIPIENTS_OR_EXPOSURE",
    ["CONTROL_NUMBER_FOR_CROSS_COMPONENT_LINKAGE", "CROSS_INTERVAL_CLAIM_LINKAGE",
      "PUBLISHER_REVISION_HISTORY_AND_VERSION_IDS", "RECIPIENT_BANK_SETTLEMENT",
      "CLAIMANT_RECEIPT_OR_ACCEPTANCE", "COMPLETE_RECOVERY", "AFFECTED_POPULATION",
      "TARGET_DOMAIN_TRANSFER"],
    "PUBLIC_DISCLOSURE_IS_OFFICIAL_AND_STATUTORILY_REFERENCED; RAW_REPORTS_CAN_RETAIN_ENTITY_OR_COUNSEL_FIELDS_BUT_ARTIFACT_PERSISTS_NO_CLAIMANT_COUNSEL_NARRATIVE_OR_ROW_FINGERPRINT; AUTOMATIC_TRAINING_AND_RAW_REDISTRIBUTION_RIGHTS_NOT_ESTABLISHED",
    "10927_EXACT_REPEATED_RAW_ROW_OCCURRENCES_ARE_PRESERVED_NOT_DEDUPLICATED_BECAUSE_ROWS_MAY_BE_DISTINCT_COMPONENTS_OR_PAYEES; AGENCY_CITATION_AND_INTERVAL_ROOTS_REMAIN_SEPARATE; NO_CROSS_INTERVAL_CLAIM_JOIN",
    { reportIntervals: 14, paymentComponentRows: 16154,
      totalPublishedAmountCents: "317493066734", zeroTotalPublishedAmountRows: 10966,
      rowsOutsideWorkbookFilter: 2487, rawNumericCellsWithMoreThanTwoDecimalPlaces: 214,
      exactRepeatedRawRowOccurrences: 10927, responsibleAgencyAggregates: 93,
      submittingAgencyAggregates: 49, principalCitationAggregates: 52,
      rightCensoredAfter: "2026-07-31" },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      temporalOrdering: "VERIFIED", outcomeSensing: "VERIFIED",
      independentOutcomeReview: "PARTIAL", economicAmount: "VERIFIED",
      adjudicationFinality: "PARTIAL", dependenceStructure: "PARTIAL",
      capitalMeasurement: "PARTIAL", custodyExecution: "PARTIAL",
      institutionalAuthority: "VERIFIED", affectedPartyStanding: "PARTIAL",
      rightsAndConsent: "PARTIAL", privacyProjection: "VERIFIED",
      longitudinalMaturity: "PARTIAL" },
    "PIN_EACH_NEXT_BIWEEKLY_REPORT_AND_PROCESS_PAGE; DIFF_INTERVAL_AGENCY_CITATION_AND_RAW_REPEAT_ROOTS; RETAIN_CURRENT_SNAPSHOT_RIGHT_CENSORING_AND_NEVER_EQUATE_CERTIFICATION_DISBURSEMENT_SETTLEMENT_ACCEPTANCE_OR_RECOVERY"),
  lane("GAO_BID_PROTEST", "JUDGMENT_FUND_GAO_REAL_CASES",
    "REAL_INSTITUTIONAL_OPERATION", "HUMAN_ADJUDICATED_PUBLIC_RECORD",
    "GAO_FISCAL_YEAR_BID_PROTEST_DOCKET_AGGREGATE_MERIT_DECISION_OR_REPORTED_NONIMPLEMENTATION_INSTANCE",
    ["GAO_CASE_DOCKET", "MERIT_DECISION", "SUSTAINED_DECISION",
      "PUBLISHER_ROUNDED_PERCENT", "REPORTED_NONIMPLEMENTATION_INSTANCE"],
    "FY2025_FILED_AND_CLOSED_DOCKET_AGGREGATES_USE_DIFFERENT_COHORTS; 53_SUSTAINS_OVER_380_MERIT_DECISIONS_SUPPORTS_ONLY_THE_PUBLISHER_ROUNDED_14_PERCENT_SUSTAIN_RATE",
    ["ROUTINE_DISMISSAL_DECISIONS", "COMPLETE_PUBLIC_CLOSURE_CORPUS",
      "EFFECTIVENESS_RATE_NUMERATOR", "ADR_SUCCESS_NUMERATOR", "HEARING_DENOMINATOR",
      "CORRECTIVE_ACTION_REASONS", "OUTCOME_NEUTRAL_DECISION_SAMPLE",
      "RECOMMENDATION_IMPLEMENTATION", "ECONOMIC_RECOVERY", "TARGET_DOMAIN_TRANSFER"],
    "GAO_GOVERNMENT_PRODUCTS_HAVE_A_US_COPYRIGHT_BOUNDARY_WITH_THIRD_PARTY_MATERIAL_CAVEAT; RENDERED_DOM_OBJECTS_ARE_NOT_ORIGINAL_HTTP_RESPONSE_BYTES; PUBLIC_ACCESS_IS_NOT_AUTOMATIC_TRAINING_PERMISSION",
    "CASES_ARE_DOCKET_NUMBERS_NOT_UNIQUE_PROCUREMENTS; PROTEST_COST_CLAIM_AND_RECONSIDERATION_TYPES_RETAINED; FILED_AND_CLOSED_COHORTS_DIFFER; DECISIONS_NOT_ASSUMED_IID",
    { casesFiled: 1688, casesClosed: 1737, meritDecisions: 380, sustains: 53,
      publisherRoundedSustainRatePercent: "14",
      publisherEffectivenessRatePercent: "52", adrCasesUsed: 53,
      publisherRoundedAdrSuccessRatePercent: "91", hearings: 3,
      publisherRoundedHearingsPercent: "0.5", finalDecisionsOverOneHundredDays: 0,
      agencyNonimplementationInstancesReported: 1, decisionSampleIncluded: false },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      temporalOrdering: "VERIFIED", outcomeSensing: "VERIFIED",
      independentOutcomeReview: "VERIFIED", adjudicationFinality: "PARTIAL",
      dependenceStructure: "PARTIAL", institutionalAuthority: "VERIFIED",
      affectedPartyStanding: "PARTIAL", rightsAndConsent: "PARTIAL",
      privacyProjection: "VERIFIED", longitudinalMaturity: "PARTIAL" },
    "PIN_NEXT_FISCAL_YEAR_ANNUAL_REPORT_AND_OFFICIAL_PROCESS_PAGES; MECHANICALLY_REPARSE_TABLES; SEEK_COMPLETE_OUTCOME_NEUTRAL_DECISION_AND_IMPLEMENTATION_CORPUS_WITHOUT_TREATING_RECOMMENDATION_AS_RECOVERY_OR_JUDICIAL_FINALITY"),
  lane("NCUA_NCUSIF_2025_AUDITED_EXPERIENCE", "NCUA_PBGC_MSHA_REAL_EXPERIENCE",
    "REAL_INSTITUTIONAL_OPERATION", "REGULATOR_PUBLISHED",
    "NCUSIF_2025_AUDITED_FINANCIAL_STATEMENT_LINE_OR_SEPARATE_PRELIMINARY_COMPARATOR",
    ["THOUSANDS_USD", "MILLIONS_USD", "PUBLISHED_PERCENT",
      "INDIVIDUAL_ACCOUNT_COVERAGE_CAP_USD"],
    "THE_AUDIT_COVERS_THE_DEFINED_2025_NCUSIF_FINANCIAL_STATEMENTS; INSURED_SHARES_ARE_A_ROUNDED_1_9_TRILLION_EXPOSURE_HEADLINE_AND_THE_1_30_PERCENT_EQUITY_RATIO_USES_ITS_PUBLISHED_SOURCE_DOMAIN_DEFINITION",
    ["TRANSACTION_LEVEL_CLAIMS", "PAID_CLAIM_LOSS_SEVERITY",
      "EVERY_UNDERLYING_EVENT_TRUTH", "ALL_SUPPLEMENTARY_INFORMATION_AUDIT_SCOPE",
      "CREDIT_UNION_TO_OUTSIDER_POPULATION_TRANSFER", "OUTSIDER_CAPITAL_OR_CUSTODY"],
    "OFFICIAL_PUBLIC_ACCESS_OBSERVED; EXACT_REUSE_AND_AUTOMATIC_TRAINING_RIGHTS_NOT_ESTABLISHED; AUDIT_STATUS_DOES_NOT_CHANGE_RIGHTS_OR_GRANT_OUTSIDER_AUTHORITY",
    "AUDITED_2025_STATEMENT_AND_SAME_DATE_PRELIMINARY_UNAUDITED_HIGHLIGHTS_REMAIN_SEPARATE; MONTHLY_INSURANCE_LOSS_REDUCTION_IS_NOT_ANNUAL_PROVISION_OR_PAID_CLAIM; ACCOUNTING_LINES_ARE_NOT_IID_EVENTS",
    { accountingPeriodEnd: "2025-12-31", totalAssetsThousandsUsd: "24105761",
      totalLiabilitiesThousandsUsd: "241770", netPositionThousandsUsd: "23863991",
      insuranceAndGuaranteeProgramLiabilitiesThousandsUsd: "234026",
      provisionForInsuranceLossesThousandsUsd: "4888",
      publishedInsuredSharesRounded: "$1.9_TRILLION", publishedEquityRatio: "1.30%",
      individualAccountCoverageCapUsd: "250000",
      preliminaryReserveHeadlineMillionsUsd: "234",
      preliminaryDecemberMonthlyInsuranceLossReductionMillionsUsd: "14.1",
      auditOpinion: "UNMODIFIED_PRESENTS_FAIRLY_IN_ALL_MATERIAL_RESPECTS" },
    { populationFrame: "VERIFIED", recordCompleteness: "PARTIAL",
      revisionAndDedup: "VERIFIED", measurementDefinition: "VERIFIED",
      temporalOrdering: "VERIFIED", exposureDenominator: "PARTIAL",
      outcomeSensing: "PARTIAL", independentOutcomeReview: "VERIFIED",
      economicAmount: "VERIFIED", adjudicationFinality: "NOT_APPLICABLE",
      dependenceStructure: "PARTIAL", capitalMeasurement: "VERIFIED",
      custodyExecution: "UNESTABLISHED", institutionalAuthority: "VERIFIED",
      rightsAndConsent: "PARTIAL", privacyProjection: "VERIFIED",
      longitudinalMaturity: "PARTIAL" },
    "PIN_NEXT_AUDITED_NCUSIF_REPORT_AND_MONTHLY_HIGHLIGHTS; DIFF_ACCOUNTING_LINES_AND_AUDIT_SCOPE; KEEP_PRELIMINARY_UNAUDITED_VALUES_SEPARATE_AND_NEVER_EQUATE_RESERVE_WITH_PAID_LOSS_OR_OUTSIDER_CAPITAL"),
  lane("PBGC_PENSION_INSURANCE_2024_2025_EXPERIENCE",
    "NCUA_PBGC_MSHA_REAL_EXPERIENCE", "REAL_INSTITUTIONAL_OPERATION",
    "REGULATOR_PUBLISHED",
    "PBGC_PROGRAM_YEAR_TABLE_FISCAL_FINANCIAL_LINE_PAYEE_OR_ASSISTANCE_AGGREGATE",
    ["MILLIONS_USD", "INSURED_PLAN_COUNT", "MILLIONS_OF_INSURED_PARTICIPANTS",
      "PAYEE_OR_PLAN_PARTICIPANT_COUNT"],
    "FORM_5500_PLAN_YEAR_2023_PREMIUM_PLAN_YEAR_2024_AND_OPERATIONAL_FISCAL_YEAR_2025_ARE_HETEROGENEOUS_FRAMES; THE_2024_TABLES_ARE_FIRST_INSTALLMENT_NOT_A_COMPLETE_EDITION",
    ["LATER_2024_TABLE_INSTALLMENTS", "COMMON_SINGLE_YEAR_DENOMINATOR",
      "INDIVIDUAL_BENEFIT_RECEIPT_OR_ACCEPTANCE", "PAID_CLAIM_SEVERITY",
      "CLAIM_LEVEL_RECOVERY", "PENSION_TO_OUTSIDER_POPULATION_TRANSFER",
      "OUTSIDER_CUSTODY"],
    "OFFICIAL_PUBLIC_ACCESS_OBSERVED; EXACT_REUSE_AND_AUTOMATIC_TRAINING_RIGHTS_NOT_ESTABLISHED; PUBLIC_AGGREGATES_DO_NOT_ESTABLISH_AFFECTED_PERSON_CONSENT",
    "SINGLE_EMPLOYER_AND_MULTIEMPLOYER_PROGRAMS_REMAIN_SEPARATE; DIRECT_BENEFITS_TRADITIONAL_ASSISTANCE_AND_SPECIAL_FINANCIAL_ASSISTANCE_ARE_NOT_POOLED; RETROSPECTIVE_DEATH_AUDIT_REPAYMENT_IS_NOT_ORDINARY_CLAIM_RECOVERY",
    { workbookEdition: "2024_FIRST_INSTALLMENT", workbookSheetCount: 36,
      xlsxPdfBoundKeyMetrics: 12, singleEmployerNetPositionMillionsUsd: "62213",
      singleEmployerInsuredPlans: 22196, singleEmployerInsuredParticipantsMillions: "18.4",
      singleEmployerChangeInClaimsMillionsUsd: "593.23", directPayees: 911776,
      directBenefitPaymentsMillionsUsd: "6426.16",
      multiemployerNetPositionMillionsUsd: "2648", multiemployerInsuredPlans: 1304,
      multiemployerInsuredParticipantsMillions: "11.1",
      traditionalAssistancePayees: 60244, sfaPlanParticipants: 444902,
      traditionalFinancialAssistanceMillionsUsd: "169",
      specialFinancialAssistanceMillionsUsd: "6151.99",
      retrospectiveDeathAuditRepaymentsMillionsUsd: "119.5" },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "VERIFIED", measurementDefinition: "VERIFIED",
      temporalOrdering: "PARTIAL", exposureDenominator: "PARTIAL",
      outcomeSensing: "VERIFIED", independentOutcomeReview: "VERIFIED",
      economicAmount: "VERIFIED", adjudicationFinality: "NOT_APPLICABLE",
      dependenceStructure: "PARTIAL", capitalMeasurement: "VERIFIED",
      custodyExecution: "UNESTABLISHED", institutionalAuthority: "VERIFIED",
      affectedPartyStanding: "PARTIAL", rightsAndConsent: "PARTIAL",
      privacyProjection: "VERIFIED", longitudinalMaturity: "PARTIAL" },
    "PIN_LATER_PENSION_TABLE_INSTALLMENTS_AND_NEXT_AUDITED_REPORT; PRESERVE_PLAN_YEAR_FISCAL_YEAR_PROGRAM_PAYMENT_ASSISTANCE_AND_REPAYMENT_ROOTS; NEVER_TREAT_PBGC_CLAIMS_AS_OUTSIDER_PAID_SEVERITY"),
  lane("MSHA_ACCIDENT_AND_EMPLOYMENT_2000_2026", "NCUA_PBGC_MSHA_REAL_EXPERIENCE",
    "REAL_CASE_RECORDED", "SUBJECT_REPORTED_TO_REGULATOR",
    "MSHA_OPERATOR_OR_CONTRACTOR_REPORTED_ACCIDENT_ROW_OR_QUARTERLY_EMPLOYMENT_EXPOSURE_ROW",
    ["REPORTED_ACCIDENT_DOCUMENT_ROW", "EMPLOYEE_HOUR", "REPORTING_IDENTIFIER_QUARTER",
      "DEGREE_OF_INJURY_CODE"],
    "274448_ACCIDENT_ROWS_EXTEND_TO_2026_Q3_WHILE_MINE_AND_CONTRACTOR_EMPLOYMENT_EXPOSURE_END_AT_2026_Q2; THE_CURRENT_WINDOWS_ARE_NOT_ALIGNED_AND_NO_DERIVED_INCIDENCE_RATE_IS_ADMITTED",
    ["INDEPENDENT_SENSOR_OBSERVATION", "CAUSAL_ADJUDICATION",
      "ALIGNED_CURRENT_ACCIDENT_AND_EXPOSURE_WINDOW", "FROZEN_REPORTABILITY_COHORT_RULE",
      "UNDERLYING_EVENT_COMPLETENESS", "STABLE_HISTORICAL_REVISION_IDENTIFIERS",
      "ROW_LEVEL_SENSITIVE_NARRATIVES", "TARGET_DOMAIN_TRANSFER"],
    "OFFICIAL_PUBLIC_ACCESS_OBSERVED; RAW_ROWS_CONTAIN_NARRATIVE_OCCUPATION_EXPERIENCE_INJURY_AND_RETURN_TO_WORK_FIELDS; FLYWHEEL_ADMITS_ONLY_AGGREGATES_AND_NO_TRAINING_RIGHT_OR_AFFECTED_PERSON_CONSENT",
    "MINE_ID_AND_YEAR_AND_CONTRACTOR_ID_AND_YEAR_ROOTS_ARE_AVAILABLE_BUT_NO_ROW_LEVEL_ONE_TO_ONE_ACCIDENT_EXPOSURE_JOIN_IS_ESTABLISHED; OPERATOR_AND_CONTRACTOR_FRAMES_REMAIN_SEPARATE; ROWS_NOT_ASSUMED_IID",
    { accidentRows: 274448, uniqueDocumentNumbers: 274448,
      duplicateOrMissingDocumentNumberRows: 0, zeroReportedInjuryRows: 30535,
      positiveReportedInjuryRows: 243913, mineQuarterlyExposureRows: 2761063,
      mineDistinctReportingIdentifiers: 35996, mine2025HoursWorked: "445694835",
      mineInvalidHoursRows: 4, contractorQuarterlyExposureRows: 1361755,
      contractorDistinctReportingIdentifiers: 38892,
      contractor2025HoursWorked: "112823786", contractorInvalidHoursRows: 11,
      contractorMalformedRows: 3, derivedIncidenceRate: null,
      currentAccidentQuarter: "2026_Q3_RIGHT_CENSORED",
      currentEmploymentQuarter: "2026_Q2" },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      temporalOrdering: "VERIFIED", exposureDenominator: "PARTIAL",
      outcomeSensing: "PARTIAL", independentOutcomeReview: "UNESTABLISHED",
      economicAmount: "NOT_APPLICABLE", adjudicationFinality: "NOT_APPLICABLE",
      dependenceStructure: "PARTIAL", causalDesign: "UNESTABLISHED",
      affectedPartyStanding: "NOT_APPLICABLE", rightsAndConsent: "PARTIAL",
      privacyProjection: "VERIFIED", longitudinalMaturity: "PARTIAL" },
    "PIN_EACH_FRIDAY_REFRESH_WITH_REVISION_DIFF; ALIGN_COMPLETE_ACCIDENT_AND_EXPOSURE_QUARTERS_AND_FREEZE_REPORTABILITY_CLASSES_BEFORE_ANY_SOURCE_DOMAIN_RATE; KEEP_RAW_PERSON_LINKABLE_FIELDS_OUT_OF_FLYWHEEL"),
  lane("CDI_RATE_FILING_AND_REGISTRY_EXPERIENCE", "CDI_NCIGF_REAL_RATE_GUARANTY",
    "REAL_INSTITUTIONAL_OPERATION", "REGULATOR_PUBLISHED",
    "CDI_FILED_ACTUARIAL_YEAR_REGISTRY_ROW_PUBLIC_NOTICE_OR_COMPANY_HEALTH_MARKET_AGGREGATE",
    ["EARNED_EXPOSURE", "USD", "USD_PER_EXPOSURE", "PUBLISHED_PERCENT",
      "REGULATORY_FILING_ROW", "SUBSCRIBER", "COVERED_LIFE", "USD_PMPM"],
    "THE_2001_2010_MEDICAL_MALPRACTICE_EXPERIENCE_IS_ONE_FILED_COHORT; THE_2025_APPROVAL_CLOSED_LIST_EXCLUDES_OPEN_FILINGS; ONE_WEEKLY_NOTICE_IS_NOT_A_PROBABILITY_SAMPLE; THE_HEALTH_AGGREGATE_IS_A_DIFFERENT_COMPANY_LINE_AND_FRAME",
    ["DISPOSITION_OR_APPROVAL_OF_FILING_11_5668", "CHARGED_POLICY_PRICE",
      "COMPLETE_OPEN_AND_CLOSED_SERFF_CORPUS", "POLICY_OR_CLAIM_LEVEL_JOIN",
      "ACTUARIAL_CERTIFICATION_IN_THIS_FILING", "INDEPENDENT_FORMULA_RECALCULATION",
      "PROSPECTIVE_CALIBRATION_HOLDOUT", "TARGET_DOMAIN_TRANSFER"],
    "OFFICIAL_PUBLIC_ACCESS_AND_A_TERMS_ACCEPTANCE_STEP_ARE_OBSERVED; RAW_REDISTRIBUTION_COMMERCIAL_USE_AUTOMATIC_TRAINING_AND_PERSONAL_DATA_REUSE_RIGHTS_ARE_NOT_CONCLUDED",
    "CALENDAR_YEARS_WITHIN_THE_FILING_ARE_CORRELATED_NOT_IID; REGISTRY_AND_NOTICE_JOIN_IS_ADMINISTRATIVE_IDENTITY_NOT_CAUSAL_OR_POLICY_LEVEL; PUBLISHER_FORMULA_CACHES_ARE_REPORTED_VALUES; THE_PUBLISHED_TRENDED_LOSS_TOTAL_ONE_DOLLAR_DIFFERENCE_IS_PRESERVED",
    { filingPages: 129, filingStateTrackingNumber: "11-5668",
      filingSerffTrackingNumber: "DENT-127302198", filingStateStatus: "ACCEPTED",
      filingDispositionObserved: false, approvedRateObserved: false,
      chargedPolicyPriceObserved: false, proposedOverallChangePct: "-7.70%",
      filedExperienceYears: 10, filedEarnedExposures: 111547,
      filedAdjustedPremiumUsd: "214901630", filedTrendedLossAndDcceUsd: "183934789",
      filedCurrentRatePremiumPerExposureUsd: "1926.56",
      filedLossAndDccePerExposureUsd: "1648.95", filedLossAndDcceRatioPct: "85.59",
      publishedLossTotalShortByUsd: "1", registryPublishedRows: 3144,
      registryApprovedRows: 2484, registryClosedRows: 660,
      registryPairedRequestedApprovedRows: 1277,
      registryRequestedApprovedDifferentRows: 234, publicNoticeRows: 30,
      publicNoticeRowsJoinedByStateFileNumber: 27,
      healthCoveredLives: 18378, healthAverageRateChangePct: "0.0000",
      healthAveragePremiumPmpmUsd: "668.970167", completeSerffCorpusAdmitted: false },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      temporalOrdering: "VERIFIED", exposureDenominator: "PARTIAL",
      outcomeSensing: "PARTIAL", independentOutcomeReview: "UNESTABLISHED",
      economicAmount: "VERIFIED", adjudicationFinality: "PARTIAL",
      dependenceStructure: "PARTIAL", causalDesign: "UNESTABLISHED",
      capitalMeasurement: "NOT_APPLICABLE", custodyExecution: "NOT_APPLICABLE",
      institutionalAuthority: "VERIFIED", affectedPartyStanding: "UNESTABLISHED",
      rightsAndConsent: "PARTIAL", privacyProjection: "VERIFIED",
      longitudinalMaturity: "PARTIAL" },
    "PIN_NEXT_CDI_APPROVAL_CLOSED_REGISTRY_PUBLIC_NOTICE_HEALTH_AGGREGATE_AND_RELEVANT_COMPLETE_FILINGS; DIFF_STABLE_IDENTITIES_AND_RETAIN_STATUS_DISPOSITION_PRICE_CERTIFICATION_FORMULA_FRAME_AND_ONE_DOLLAR_RECONCILIATION_BOUNDARIES"),
  lane("NCIGF_ASSESSMENT_CAPACITY_EXPERIENCE", "CDI_NCIGF_REAL_RATE_GUARANTY",
    "REAL_EXPERIENCE_AGGREGATE", "THIRD_PARTY_PUBLIC",
    "STATE_GUARANTY_FUND_ACCOUNT_REPORTING_ROW_ACCOUNT_YEAR_OR_PUBLISHED_ASSESSMENT_REFUND_AGGREGATE",
    ["USD", "STATE_FUND_ACCOUNT_REPORTING_ROW", "ACCOUNT_YEAR",
      "PUBLISHED_ASSESSMENT", "PUBLISHED_REFUND", "STATUTORY_CALLING_CAPACITY"],
    "THE_2026_Q2_LIABILITY_REPORT_IS_PARTIAL_YEAR_WITH_85_OF_126_ROWS_MISSING_OR_UNAVAILABLE_2025_PREMIUM; CAPACITY_UNDERSTATES_UNLIMITED_OR_PREFUNDED_FUNDS; FIVE_YEAR_ACCOUNT_YEARS_AND_INCEPTION_VIEWS_ARE_SEPARATE_FRAMES",
    ["COMPLETE_2026_PREMIUM_AND_CAPACITY", "CASH_HELD_OR_TRANSFERRED",
      "INDEPENDENT_AUDIT_OR_VERIFICATION", "STABLE_REVISION_HISTORY",
      "RANDOM_MISSINGNESS", "COMPLETE_STATE_FUND_YEAR_COVERAGE",
      "SEMANTIC_EXTRACTION_OF_REPORTING_GUIDELINES", "TAIL_OR_DEPENDENCE_MODEL",
      "TARGET_DOMAIN_TRANSFER"],
    "PUBLIC_ACCESS_IS_OBSERVED_BUT_THE_WORKBOOK_STATES_A_SOLE_ACCOUNTING_LIABILITY_PURPOSE; NCIGF_DISCLOSES_THIRD_PARTY_INPUTS_ESTIMATES_NO_INDEPENDENT_VERIFICATION_AND_AN_ACCURACY_DISCLAIMER; OUTSIDE_USE_REDISTRIBUTION_AND_AUTOMATIC_TRAINING_ARE_NOT_ADMITTED",
    "STATE_FUND_ACCOUNT_AND_ACCOUNT_YEAR_ROWS_ARE_CORRELATED_NOT_IID; FOUR_ADDITIONAL_ALL_ZERO_ROWS_DIFFER_BETWEEN_INCEPTION_VIEWS; NONZERO_TUPLES_AND_TOTALS_MATCH_AFTER_EXPLICIT_BLANK_TO_ZERO_NORMALIZATION; KNOWN_YEAR_GAPS_ARE_NOT_ASSUMED_RANDOM",
    { quarterlyReportingRows: 126, unavailable2025PremiumRows: 85,
      netAssessablePremium2024Usd: "860257065514",
      maximumAssessmentCapacity2025Usd: "16959476645.26",
      netAssessablePremium2025ReportedToDateUsd: "421399702134",
      maximumAssessmentCapacity2026ReportedToDateUsd: "7600879728.72",
      priorYearAssessmentsCalledIn2026Usd: "147845729",
      totalAuthorized2026Usd: "37750000", refundsAuthorized2026Usd: "16637677",
      netAssessmentsAuthorized2026Usd: "21112323",
      totalProjectedAuthorizedAssessments2026Usd: "91626787",
      fiveYearAccountYears: 620, fiveYearPositiveAccountYears: 90,
      fiveYearPositiveAccountYearFraction: "0.145161290323",
      inceptionAssessmentsAuthorizedUsd: "23471640910.761",
      inceptionRefundsAuthorizedUsd: "2578384077.060",
      inceptionNetAssessmentsUsd: "20893256833.701",
      inceptionAbatementsUsd: "780196659.000",
      inceptionNonzeroRows: 1514, inceptionAdditionalAllZeroRowsByYear: 4,
      inceptionNonzeroMultisetExactlyMatches: true, tailOrDependenceModelFitted: false },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      temporalOrdering: "PARTIAL", exposureDenominator: "PARTIAL",
      outcomeSensing: "PARTIAL", independentOutcomeReview: "UNESTABLISHED",
      economicAmount: "VERIFIED", adjudicationFinality: "NOT_APPLICABLE",
      dependenceStructure: "PARTIAL", causalDesign: "UNESTABLISHED",
      capitalMeasurement: "PARTIAL", custodyExecution: "UNESTABLISHED",
      institutionalAuthority: "PARTIAL", affectedPartyStanding: "UNESTABLISHED",
      rightsAndConsent: "PARTIAL", privacyProjection: "VERIFIED",
      longitudinalMaturity: "PARTIAL" },
    "PIN_EACH_NEXT_QUARTERLY_LIABILITY_FIVE_YEAR_AND_INCEPTION_WORKBOOK_WITH_PUBLISHER_DISCLAIMER_AND_PURPOSE; DIFF_STATE_FUND_ACCOUNT_YEAR_ROOTS_AND_NEVER_EQUATE_CAPACITY_AUTHORIZATION_OR_CALL_WITH_CASH_CAPITAL_CUSTODY_COVERAGE_OR_OUTSIDER_GUARANTEE"),
  lane("FRA_FORM54_FORM55_2015_2019", "FRA_PHMSA_REAL_SAFETY_EVIDENCE",
    "REAL_EXPERIENCE_AGGREGATE", "SUBJECT_REPORTED_TO_REGULATOR",
    "FRA_FORM54_JOINTCD_ONE_REPRESENTATIVE_INCIDENT_OR_FORM55_RAILROAD_CALENDAR_MONTH_OPERATIONAL_ROW",
    ["REPORTED_INCIDENT", "REPORTED_DAMAGE_USD", "OFFICIAL_FATALITY",
      "OFFICIAL_INJURY", "HAZMAT_RELEASED_CAR", "PERSON_EVACUATED",
      "TRAIN_MILE", "EMPLOYEE_HOUR", "INCIDENT_PER_MILLION_TRAIN_MILES",
      "REPORTED_DAMAGE_USD_PER_TRAIN_MILE"],
    "THE_2015_2019_FORM54_FRAME_HAS_10449_JOINTCD_ONE_REPRESENTATIVE_ROWS_ABOVE_THE_ANNUAL_REPORTING_THRESHOLD_AND_EXCLUDES_BELOW_THRESHOLD_ACCOUNTABLE_ACCIDENTS; FORM55_CALENDAR_YEAR_MILES_ALIGN_BY_YEAR_BUT_NOT_BY_INCIDENT_OR_OPERATOR_ROW",
    ["BELOW_THRESHOLD_ACCOUNTABLE_ACCIDENTS", "RAW_FORM54_AND_FORM55_ROW_POPULATIONS",
      "PUBLISHER_VERSIONED_STATIC_RELEASE_AND_COMPLETE_REVISION_HISTORY",
      "TRANSPORT_ATTESTATION", "OPERATOR_IDENTIFIER_IN_THE_FLYWHEEL",
      "INDEPENDENT_SENSOR_OR_CAUSAL_ADJUDICATION", "PAID_INCURRED_OR_ULTIMATE_LOSS",
      "RECOVERY_SALVAGE_OR_SETTLEMENT", "INFLATION_AND_THRESHOLD_NORMALIZATION",
      "TAIL_OR_DEPENDENCE_MODEL", "TARGET_DOMAIN_TRANSFER"],
    "FRA_METADATA_DECLARES_PUBLIC_DOMAIN_STATUS; THE_FLYWHEEL RETAINS_ONLY_AGGREGATES_AND_NO_OPERATOR_IDENTIFIER; LEGAL_CONCLUSIONS_PERSONAL_DATA_REUSE_AND_AUTOMATIC_TRAINING_PERMISSION_ARE_NOT_INFERRED_FROM_PUBLIC_ACCESS",
    "FORM54_JOINTCD_ONE_ROWS_ARE_REPRESENTATIVE_REPORTS_AND_FORM55_RAILROAD_MONTH_ROWS_SHARE_OPERATOR_AND_TIME_ROOTS; ONE_IDENTICAL_FORM55_METRIC_DUPLICATE_IS_REMOVED_BY_THE_PINNED_COMPOSITE_PROJECTION; YEARS_AND_OPERATORS_ARE_NOT_ASSUMED_IID; CALENDAR_ALIGNMENT_IS_NOT_ROW_LINKAGE",
    { startYear: 2015, endYear: 2019, canonicalQueryReceiptCount: 7,
      rawRowPopulationDownloaded: false, form54JointCdOneRows: 10449,
      form54DistinctIncidentKeys: 10449, form55PublishedRows: 48843,
      form55DeduplicatedMonthlyRailroadRows: 48842,
      form55DuplicateCompositeKeyGroups: 1, form55IdenticalDuplicateRowsRemoved: 1,
      fiveYearUniqueReportedIncidents: 10449,
      fiveYearTotalReportedDamageDollars: "1573388754",
      fiveYearOfficialFatalities: 213, fiveYearOfficialInjuries: 2277,
      fiveYearTotalTrainMiles: "3529396874", fiveYearEmployeeHours: "2207526721",
      fiveYearIncidentRatePerMillionTrainMiles: "2.960562491",
      fiveYearReportedDamageDollarsPerTrainMile: "0.445795361",
      reportedDamageIsPaidIncurredOrUltimateLoss: false,
      causalEffectsIdentified: false, tailOrDependenceModelFitted: false },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      temporalOrdering: "VERIFIED", exposureDenominator: "PARTIAL",
      outcomeSensing: "PARTIAL", independentOutcomeReview: "UNESTABLISHED",
      economicAmount: "VERIFIED", adjudicationFinality: "UNESTABLISHED",
      dependenceStructure: "PARTIAL", causalDesign: "UNESTABLISHED",
      capitalMeasurement: "NOT_APPLICABLE", custodyExecution: "NOT_APPLICABLE",
      institutionalAuthority: "VERIFIED", affectedPartyStanding: "UNESTABLISHED",
      rightsAndConsent: "PARTIAL", privacyProjection: "VERIFIED",
      longitudinalMaturity: "PARTIAL" },
    "PIN_THE_NEXT_IDENTICAL_CANONICAL_QUERY_CHAIN_METADATA_AND_SCHEMA_SNAPSHOT; DIFF_ONLY_STABLE_FRA_KEYS; RETAIN_THRESHOLD_REVISION_DUPLICATE_OPERATOR_CALENDAR_LINKAGE_DAMAGE_AND_CAUSAL_BOUNDARIES_BEFORE_ANY_SOURCE_DOMAIN_UPDATE"),
  lane("PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE",
    "FRA_PHMSA_REAL_SAFETY_EVIDENCE", "REAL_CASE_RECORDED",
    "SUBJECT_REPORTED_TO_REGULATOR",
    "BYTE_PINNED_PHMSA_OPERATOR_SUBMITTED_GAS_DISTRIBUTION_INCIDENT_FILE_RECEIPT_AND_SCHEMA_PROFILE",
    ["CAPTURED_ARCHIVE_BYTE", "CAPTURED_DATA_ROW", "HEADER_COLUMN",
      "REPORT_YEAR", "REPORT_STATUS"],
    "THE_MUTABLE_PRESENT_FILE_CONTAINS_1589_REPORTED_ROWS_AND_ORIGINAL_SUPPLEMENTAL_STATUS_RECORDS; WITHOUT_MATCHED_ANNUAL_MILEAGE_EXPOSURE_OR_INCIDENT_LINKAGE_THE_ROW_COUNT_IS_NOT_A_FREQUENCY_DENOMINATOR_AND_NO_SEVERITY_DENOMINATOR_IS_ADMITTED",
    ["PUBLISHER_VERSION_IDENTIFIER", "LATEST_POPULATION_COMPLETENESS",
      "STABLE_REVISION_AND_INCIDENT_IDENTITY_RESOLUTION", "MATCHED_ANNUAL_REPORT_ARCHIVE",
      "MILEAGE_OR_FACILITY_EXPOSURE", "INCIDENT_TO_EXPOSURE_LINKAGE",
      "ADMITTED_COST_OR_CLAIM_LOSS_SEMANTICS", "FREQUENCY_OR_SEVERITY_RATE",
      "INDEPENDENT_OUTCOME_OR_LIABILITY_ADJUDICATION", "REUSE_AND_TRAINING_RIGHTS",
      "TARGET_DOMAIN_TRANSFER"],
    "OFFICIAL_PUBLIC_DOWNLOAD_IS_OBSERVED_BUT_NO_PUBLIC_DOMAIN_OR_REUSE_LICENSE_BYTE_IS_PINNED; REDISTRIBUTION_COMMERCIAL_PERSONAL_DATA_AND_MODEL_TRAINING_USES_ARE_NOT_CONCLUDED",
    "ORIGINAL_FINAL_SUPPLEMENTAL_AND_SUPPLEMENTAL_FINAL_ROWS_CAN_BE_REVISIONS_OR_RELATED_REPORTS_AND_ARE_NOT_ASSUMED_UNIQUE_EVENTS_OR_IID; THE_CAPTURE_HAS_NO_ADMITTED_INCIDENT_IDENTITY_DEDUPLICATION_EXPOSURE_JOIN_OR_CROSS_LANE_POOLING",
    { sourceReceiptOnly: true, zipBytes: 1599619,
      zipHash: "sha256:5850554f7498e5fb6faf97274416f06c8305a48e0689845ae29b898a7e747426",
      archiveMemberCount: 2, schemaPdfBytes: 477717,
      schemaPdfHash: "sha256:706c2a603e435d530ebb2ebaee7d566b9fae6e89607794a06a7b4afce2f8160d",
      formRevision: "9-2023", dataBytes: 4395199,
      dataHash: "sha256:6f1f3bb7fa4502c93ae66855d2ea11fbcd38edf06abde3172ae3a518cd95404f",
      headerColumns: 468,
      headerHash: "sha256:2c04994e67fdc28e72b49038186de3118b8b5bb02037b7210265b9eaf4ae07e5",
      reportedRows: 1589, originalRows: 127, originalFinalRows: 438,
      supplementalRows: 53, supplementalFinalRows: 971,
      latestPopulationCompletenessEstablished: false,
      matchedAnnualExposureCaptured: false, frequencyOrSeverityRateCalculated: false,
      outcomeOrActuarialModelInputAdmitted: false, pricingInputAdmitted: false },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "PARTIAL",
      temporalOrdering: "PARTIAL", exposureDenominator: "UNESTABLISHED",
      outcomeSensing: "PARTIAL", independentOutcomeReview: "UNESTABLISHED",
      economicAmount: "UNESTABLISHED", adjudicationFinality: "UNESTABLISHED",
      dependenceStructure: "UNESTABLISHED", causalDesign: "UNESTABLISHED",
      capitalMeasurement: "NOT_APPLICABLE", custodyExecution: "NOT_APPLICABLE",
      institutionalAuthority: "PARTIAL", affectedPartyStanding: "UNESTABLISHED",
      rightsAndConsent: "UNESTABLISHED", privacyProjection: "VERIFIED",
      longitudinalMaturity: "PARTIAL" },
    "PIN_A_PUBLISHER_VERSION_OR_REPEATABLE_REVISION_SERIES_MATCHED_ANNUAL_EXPOSURE_AND_EXPLICIT_RIGHTS_BEFORE_RECONSIDERING_DEFERRED_STATUS; UNTIL_THEN_REFRESH_ONLY_THE_RECEIPT_HASH_SCHEMA_ROW_STATUS_AND_MISSINGNESS_PROFILE_WITH_ZERO_MODEL_FREQUENCY_SEVERITY_OR_PRICE_ADMISSION"),
  lane("NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE",
    "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE", "REAL_INSTITUTIONAL_OPERATION",
    "SUBJECT_REPORTED_TO_REGULATOR",
    "NHTSA_RECALL_CAMPAIGN_MANUFACTURER_QUARTERLY_OR_ANNUAL_STATUS_ROW_AND_PUBLISHER_RECORD_LINKAGE",
    ["RECALL_FLAT_FILE_RECORD", "RECALL_CAMPAIGN", "MANUFACTURER_STATUS_REPORT_ROW",
      "POTENTIALLY_AFFECTED_COUNT", "INVOLVED_COUNT", "REMEDIED_COUNT",
      "UNREACHABLE_COUNT", "REMOVED_COUNT", "DESCRIPTIVE_STATUS_RATIO"],
    "THE_OFFICIAL_NAMED_POST_2010_SLICE_HAS_244499_PRODUCT_ROWS_DEDUPLICATED_TO_15197_CAMPAIGNS; POTENTIALLY_AFFECTED_IS_NOT_CURRENT_IN_SERVICE_EXPOSURE; QUARTERLY_ROWS_ARE_REPEATED_CUMULATIVE_STATUS_AND_ANNUAL_ROWS_HAVE_PUBLISHER_ELIGIBILITY_SELECTION; 2026_IS_RIGHT_CENSORED_AT_FREEZE",
    ["ALL_HISTORICAL_PRE_2010_CAMPAIGNS", "CURRENT_IN_SERVICE_EXPOSURE",
      "CROSS_CAMPAIGN_UNIQUE_VEHICLE_DEDUPLICATION", "LATEST_STATUS_AFTER_FREEZE",
      "AFFECTED_PARTY_RECEIPT_OR_ACCEPTANCE", "INDEPENDENT_REPAIR_AUDIT_POPULATION",
      "INDIVIDUALLY_VERIFIED_COMPLETE_REPAIR", "INDEPENDENT_CAUSAL_FINDING",
      "PAID_INCURRED_OR_ULTIMATE_LOSS", "ENFORCEMENT_ACTION_OR_CONSENT_ORDER_BODIES",
      "PAYMENT_RECOVERY_REOPENING_OR_CLOSURE_CHAIN", "TARGET_DOMAIN_TRANSFER"],
    "OFFICIAL_PUBLIC_DOWNLOAD_AND_EXACT_SOURCE_REPLAY_ARE_OBSERVED; RAW_REDISTRIBUTION_COMMERCIAL_USE_MODEL_TRAINING_AND_LEGAL_USE_RIGHTS_ARE_NOT_CONCLUDED; THE_FLYWHEEL EMITS_NO_MANUFACTURER_NAME_OR_RAW_CAMPAIGN_IDENTIFIER",
    "PRODUCT_ROWS_SHARE_CAMPAIGNS; QUARTERLY_AND_ANNUAL_ROWS_REPEAT_CUMULATIVE_MANUFACTURER_STATUS_AND_ARE_NOT_INDEPENDENT_REPAIR_EVENTS; CROSS_CAMPAIGN_VEHICLE_OVERLAP_IS_UNRESOLVED; PUBLISHER_CAMPAIGN_LINKAGE_IS_NOT_CAUSAL_OR_CONSUMER_RECEIPT_PROOF; POPULATION_MISMATCHES_AND_ANOMALIES_ARE_RETAINED",
    { recallRows: 244499, recallExpectedColumns: 29, uniqueRecallRecordIds: 244499,
      uniqueCampaigns: 15197, zeroPopulationCampaigns: 7,
      totalPotentialAffectedSummedOncePerCampaign: "699086836",
      actualExposureOrUniqueVehiclesOnRoadEstablished: false,
      campaignsWithCorrectiveActionText: 15197,
      correctiveActionTextEstablishesRepairCompleted: false,
      ownerNotificationDateEstablishesConsumerReceipt: false,
      quarterlyStatusRows: 75624, quarterlyUniqueCampaigns: 11834,
      quarterlyInvalidPeriodRows: 2,
      quarterlyInvalidPeriodExamples: ["2099-", "2022"],
      quarterlyZeroInvolvedRows: 1, quarterlyComponentSumExceedsInvolvedRows: 1,
      retainedArithmeticAnomaly: { involved: "0", remedied: "22", removed: "584" },
      quarterlyLatestSelectedCampaigns: 11834,
      quarterlyLatestCampaignsLinkedToPost2010Recall: 11833,
      quarterlyLatestInvolved: "487232535", quarterlyLatestRemedied: "295629360",
      quarterlyLatestRemediedToInvolvedRatio: "0.606752092202",
      annualStatusRows: 5875, annualUniqueCampaigns: 2796,
      annualLatestInvolved: "108749786", annualLatestRemedied: "72493743",
      annualLatestRemediedToInvolvedRatio: "0.666610442801",
      campaignsWithQuarterlyStatus: 11833, campaignsWithAnnualStatus: 2796,
      campaignsWithBothQuarterlyAndAnnualStatus: 2796,
      quarterlyStatusCampaignsOutsideCapturedRecallPopulation: 1,
      quarterlyPopulationExactMatches: 11780,
      quarterlyStatusInvolvedGreaterCampaigns: 17,
      quarterlyRecallPotentialAffectedGreaterCampaigns: 36,
      quarterlyPopulationTotalAbsoluteDifference: "316960",
      current2026PeriodIncompleteAtFreeze: true,
      completeRepairChainEstablished: false,
      enforcementActionOrConsentOrderBodiesCaptured: false },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "VERIFIED",
      temporalOrdering: "PARTIAL", exposureDenominator: "PARTIAL",
      outcomeSensing: "PARTIAL", independentOutcomeReview: "UNESTABLISHED",
      economicAmount: "NOT_APPLICABLE", adjudicationFinality: "UNESTABLISHED",
      dependenceStructure: "PARTIAL", causalDesign: "UNESTABLISHED",
      capitalMeasurement: "NOT_APPLICABLE", custodyExecution: "NOT_APPLICABLE",
      institutionalAuthority: "PARTIAL", affectedPartyStanding: "UNESTABLISHED",
      rightsAndConsent: "PARTIAL", privacyProjection: "VERIFIED",
      longitudinalMaturity: "PARTIAL" },
    "PIN_EACH_NEXT_RECALL_QUARTERLY_AND_ANNUAL_STATUS_RELEASE_WITH_REVISION_DIFF; RETAIN_MANUFACTURER_REPORTING_RIGHT_CENSORING_POPULATION_MISMATCH_2099_2022_AND_ZERO_22_584_ANOMALIES; SEEK_INDEPENDENT_REPAIR_RECEIPT_CAUSE_LOSS_AND_ENFORCEMENT_BODIES_BEFORE_ANY_STRONGER_ADMISSION"),
  lane("BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORY_CANDIDATE",
    "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE", "CONTROLLED_REAL_EXECUTION",
    "THIRD_PARTY_PUBLIC",
    "ONE_COMPLETE_BYTE_RANGE_CAPTURED_TFRECORD_FROM_THE_FIRST_PUBLISHED_TRAIN_PARENT_SHARD",
    ["COMPLETE_TFRECORD", "TRAJECTORY_TIMESTEP", "FLOAT_ACTION_OR_STATE_VALUE",
      "JPEG_OBSERVATION", "LANGUAGE_INSTRUCTION", "PUBLISHER_TFDS_EXAMPLE_OR_SHARD_COUNT"],
    "EXACTLY_ONE_COMPLETE_RECORD_IS_CAPTURED; 53192_TRAIN_EXAMPLES_AND_1024_TRAIN_SHARDS_ARE_PUBLISHER_METADATA; ZERO_COMPLETE_TRAIN_SHARDS_AND_NO_FULL_CORPUS_ARE_CAPTURED; THESE_COUNTS_ARE_NOT_OUTCOME_EXPOSURE_OR_TRAINER_ROWS",
    ["REMAINING_53191_PUBLISHED_TRAIN_EXAMPLES", "ALL_1024_COMPLETE_TRAIN_SHARDS",
      "VALIDATION_RECORD_BYTES", "FULL_CORPUS_SCHEMA_CONFORMANCE",
      "RECORD_LEVEL_SEMANTIC_AND_DUMMY_VALUE_AUDIT",
      "TRAJECTORY_ENVIRONMENT_OBJECT_AND_COLLECTION_CORRELATION_GROUPS",
      "TELEOPERATED_VERSUS_SCRIPTED_RECORD_PROVENANCE", "FAILURE_OR_NEGATIVE_OUTCOMES",
      "OUTCOME_ASSIGNMENT_OR_SURVIVAL_EVIDENCE", "TARGET_ROBOT_TRANSFER",
      "LEGAL_AND_THIRD_PARTY_CONTENT_REVIEW"],
    "THE_PUBLISHER_CC_BY_4_0_STATEMENT_IS_BYTE_PINNED_WITH_ATTRIBUTION_AND_CHANGE_NOTICE; LEGAL_REVIEW_RECORD_LEVEL_THIRD_PARTY_CONTENT_REVIEW_AND_FINAL_PRODUCTION_TRAINING_RIGHT_ADJUDICATION_ARE_NOT_COMPLETE; ZERO_ROWS_ENTER_TRAINING",
    "THE_ONE_RECORD_COMES_FROM_THE_FIRST_PARENT_SHARD_AND_IS_NOT_RANDOM_OR_REPRESENTATIVE; TRAJECTORY_ENVIRONMENT_OBJECT_AND_COLLECTION_CLUSTERS_ARE_NOT_MATERIALIZED; NO_IID_FULL_CORPUS_OR_TARGET_CORRELATION_CLAIM_IS_ADMITTED",
    { capturedWholeRecords: 1, capturedWholeCorpus: false,
      publishedTrainExamples: 53192, publishedTrainShards: 1024,
      capturedCompleteTrainShards: 0, sampledTimesteps: 28,
      sampledActionValues: 196, sampledStateValues: 196,
      sampledLanguageEmbeddingValues: 14336,
      trainingCandidateDecision: "HOLD_FOR_SEMANTIC_CONTENT_AND_GOVERNANCE_REVIEW",
      trainerRowsEnqueued: 0, automaticTraining: false,
      fullCorpusSchemaConformanceEstablished: false,
      fullSemanticContractEstablished: false,
      trajectoryCorrelationClustersMaterialized: false,
      outcomeFailureAssignmentOrSurvivalEvidenceEstablished: false,
      targetRobotTransferEstablished: false },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "UNESTABLISHED", measurementDefinition: "PARTIAL",
      temporalOrdering: "PARTIAL", exposureDenominator: "UNESTABLISHED",
      outcomeSensing: "UNESTABLISHED", independentOutcomeReview: "UNESTABLISHED",
      economicAmount: "NOT_APPLICABLE", adjudicationFinality: "NOT_APPLICABLE",
      dependenceStructure: "UNESTABLISHED", causalDesign: "UNESTABLISHED",
      capitalMeasurement: "NOT_APPLICABLE", custodyExecution: "NOT_APPLICABLE",
      institutionalAuthority: "UNESTABLISHED", affectedPartyStanding: "NOT_APPLICABLE",
      rightsAndConsent: "PARTIAL", targetDomainTransfer: "UNESTABLISHED",
      privacyProjection: "PARTIAL", longitudinalMaturity: "UNESTABLISHED" },
    "PIN_ADDITIONAL_COMPLETE_RECORDS_ONLY_AFTER_OUTCOME_BLIND_SELECTION; MATERIALIZE_CORRELATION_AND_PROVENANCE_ROOTS; AUDIT_SEMANTICS_FAILURES_AND_THIRD_PARTY_CONTENT; KEEP_TRAINING_ON_HOLD_AND_TRAINER_ROWS_AT_ZERO_UNTIL_RIGHTS_GOVERNANCE_AND_TARGET_HOLDOUT_GATES_PASS"),
  lane("WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE",
    "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE", "REAL_EXPERIENCE_AGGREGATE",
    "THIRD_PARTY_PUBLIC",
    "PUBLISHER_GEOGRAPHY_EXPOSURE_ROW_SGO_LINKED_OUTCOME_MEMBERSHIP_ROW_OR_BENCHMARK_COMPARISON_ROW",
    ["DISPLAYED_ROUNDED_RIDER_ONLY_MILE", "SGO_LINKED_PUBLISHER_ROW",
      "PUBLISHER_OUTCOME_MEMBERSHIP_FLAG", "PUBLISHED_RATE_OR_CONFIDENCE_BOUND",
      "DYNAMIC_BENCHMARK_CELL_ROW"],
    "220613000_IS_THE_DISPLAYED_ROUNDED_ALL_LOCATION_RIDER_ONLY_POINT_MILE_TOTAL_NOT_EXACT_UNROUNDED_EXPOSURE; COMPOSITE_GEOGRAPHIES_OVERLAP_AND_ARE_NOT_ADDED; 1664_SGO_ROWS_AND_1659_UNIQUE_IDS_ARE_NOT_INDEPENDENT_ADJUDICATED_CRASH_COUNTS",
    ["EXACT_UNROUNDED_RIDER_ONLY_MILES", "INDEPENDENT_REPLAY_OF_MATCHED_NHTSA_SGO_VERSIONS",
      "DUPLICATE_SGO_EVENT_UNIT_RESOLUTION", "INDEPENDENT_CRASH_FACT_OR_CAUSAL_ADJUDICATION",
      "ECONOMIC_LOSS", "AFFECTED_PARTY_RECEIPT_OR_RECOVERY",
      "CROSS_MANUFACTURER_COMPARABILITY", "CSV4_TO_CSV1_CSV3_WINDOW_ALIGNMENT",
      "PROSPECTIVE_OR_EXTERNAL_TARGET_HOLDOUT", "TARGET_PLATFORM_ODD_AND_VERSION_MATCH",
      "TRAINING_RIGHTS", "TARGET_DOMAIN_TRANSFER"],
    "PUBLIC_DOWNLOAD_AND_EXACT_PUBLISHER_SOURCE_REPLAY_ARE_OBSERVED; PUBLIC_DOWNLOAD_DOES_NOT_GRANT_BEHAVIOR_MODEL_TRAINING; REDISTRIBUTION_TRAINING_TARGET_TRANSFER_AND_TARGET_PRICE_RIGHTS_OR_AUTHORITY_ARE_NOT_ESTABLISHED",
    "SGO_ROWS_SHARE_REPORT_IDENTIFIERS_VERSIONS_TIME_LOCATIONS_AND_PUBLISHER_OUTCOME_GROUPS; THREE_DUPLICATE_ID_VERSION_PAIRS_ARE_QUARANTINED_WITH_TWO_OUTCOME_AND_ONE_LOCATION_CONFLICT; CSV4_HAS_544_DUPLICATE_COMPOSITE_ROWS_AND_489_BENCHMARK_COUNT_CONFLICT_KEYS; NO_ROWS_OR_MILES_ARE_POOLED_WITH_OTHER_LANES",
    { displayedRoundedRiderOnlyMiles: "220613000",
      displayedExposureIsExactUnroundedMiles: false,
      sgoOutcomeMembershipRows: 1664, uniqueSgoReportIds: 1659,
      duplicateSgoReportIds: 3, duplicateSgoIdVersionPairs: 3,
      duplicatePairsWithOutcomeFlagConflicts: 2,
      duplicatePairsWithSuppressedLocationTextConflicts: 1,
      publishedLiteralNanTokens: 164,
      csv4DuplicateCompositeRows: 544,
      csv4BenchmarkCrashCountConflictKeys: 489,
      csv4WindowThrough: "2025-03", exposureOutcomeWindowThrough: "2026-03",
      retrospectiveCalendarSplitOnly: true,
      prospectiveOrExternalTargetHoldoutEstablished: false,
      independentOutcomeTruthEstablished: false,
      underlyingWorldTruthEstablished: false,
      independentAdjudicationEstablished: false,
      targetTransferEstablished: false, targetPriceEstablished: false,
      trainerRowsEnqueued: 0 },
    { populationFrame: "PARTIAL", recordCompleteness: "PARTIAL",
      revisionAndDedup: "PARTIAL", measurementDefinition: "PARTIAL",
      temporalOrdering: "PARTIAL", exposureDenominator: "PARTIAL",
      outcomeSensing: "PARTIAL", independentOutcomeReview: "UNESTABLISHED",
      economicAmount: "UNESTABLISHED", adjudicationFinality: "UNESTABLISHED",
      dependenceStructure: "PARTIAL", causalDesign: "UNESTABLISHED",
      capitalMeasurement: "NOT_APPLICABLE", custodyExecution: "NOT_APPLICABLE",
      institutionalAuthority: "UNESTABLISHED", affectedPartyStanding: "UNESTABLISHED",
      rightsAndConsent: "UNESTABLISHED", targetDomainTransfer: "UNESTABLISHED",
      privacyProjection: "VERIFIED", longitudinalMaturity: "PARTIAL" },
    "PIN_EACH_NEXT_WAYMO_SAFETY_IMPACT_RELEASE; DIFF_EXPOSURE_SGO_VERSION_OUTCOME_LOCATION_NAN_AND_BENCHMARK_CONFLICT_KEYS; KEEP_CSV4_WINDOW_SEPARATE_AND_REQUIRE_INDEPENDENT_SGO_ADJUDICATION_TARGET_MATCH_RIGHTS_AND_PROSPECTIVE_HOLDOUT_BEFORE_ANY_MODEL_OR_PRICE_ADMISSION"),
  lane("CLINICALTRIALS_SPONSOR_POSTED_AGGREGATE_RESULTS_REFERENCE",
    "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE", "REAL_INSTITUTIONAL_OPERATION",
    "SUBJECT_REPORTED_TO_REGULATOR",
    "CLINICALTRIALS_GOV_STUDY_RECORD_WITH_POSTED_AGGREGATE_RESULTS",
    ["STUDY_RECORD", "POSTED_OUTCOME_MEASURE_ROW", "POSTED_ADVERSE_EVENT_TERM_ROW",
      "POSTED_ADVERSE_EVENT_GROUP_COUNT"],
    "EIGHTEEN_STUDIES_ARE_THE_COMPLETE_RESULTS_FIRST_POSTED_2026_07_01_QUERY_WINDOW_AT_THE_FROZEN_DATA_TIMESTAMP; ENROLLMENT_AND_GROUP_AT_RISK_COUNTS_HAVE_STUDY_AND_PERIOD_SPECIFIC_MEANINGS_AND_ARE_NEVER_POOLED_ACROSS_STUDIES_TERMS_OR_GROUPS",
    ["INDEPENDENT_OUTCOME_TRUTH", "SCIENTIFIC_ACCURACY_ADJUDICATION",
      "INTERVENTION_CAUSALITY", "INDIVIDUAL_PARTICIPANT_DATA", "ECONOMIC_LOSS",
      "AFFECTED_PARTY_RECEIPT", "TARGET_DOMAIN_TRANSFER", "TRAINING_RIGHTS"],
    "TERMS_AND_DISCLAIMER_ARE_URL_ONLY_AND_NOT_IN_THE_FROZEN_SOURCE_REPLAY; DATA_AVAILABILITY_ATTRIBUTION_PROCESSED_DATE_MODIFICATION_DISCLOSURE_EMAIL_MARKETING_AND_THIRD_PARTY_COPYRIGHT_TERMS_ARE_NOT_ESTABLISHED; AUTOMATIC_BEHAVIOR_MODEL_TRAINING_RIGHT_IS_NOT_CONCLUDED",
    "NCT_ID_IS_THE_STUDY_ROOT; OUTCOME_ROWS_ADVERSE_EVENT_TERMS_AND_GROUP_COUNTS_WITHIN_A_STUDY_ARE_CORRELATED; NO_STUDY_TERM_GROUP_OR_RATE_POOLING_AND_NO_IID_ASSUMPTION",
    { completeFrozenQueryStudyRecords: 18, studiesWithPostedOutcomeMeasures: 18,
      studiesWithPostedAdverseEvents: 18, totalPostedOutcomeMeasureRows: 242,
      totalPostedSeriousAdverseEventTermRows: 409,
      totalPostedOtherAdverseEventTermRows: 514,
      crossStudyAffectedCountsPooled: false, crossStudyRatesCalculated: false,
      independentOutcomeTruthEstablished: false, causalEffectEstablished: false,
      targetTransferEstablished: false, trainerRowsEnqueued: 0 },
    { populationFrame: "VERIFIED", recordCompleteness: "VERIFIED",
      revisionAndDedup: "VERIFIED", measurementDefinition: "PARTIAL",
      temporalOrdering: "PARTIAL", exposureDenominator: "PARTIAL",
      outcomeSensing: "PARTIAL", independentOutcomeReview: "UNESTABLISHED",
      economicAmount: "NOT_APPLICABLE", adjudicationFinality: "UNESTABLISHED",
      dependenceStructure: "PARTIAL", causalDesign: "UNESTABLISHED",
      capitalMeasurement: "NOT_APPLICABLE", custodyExecution: "NOT_APPLICABLE",
      institutionalAuthority: "UNESTABLISHED", affectedPartyStanding: "UNESTABLISHED",
      rightsAndConsent: "UNESTABLISHED", targetDomainTransfer: "UNESTABLISHED",
      privacyProjection: "VERIFIED", longitudinalMaturity: "PARTIAL" },
    "PIN_NEXT_COMPLETE_RESULTS_FIRST_POSTED_WINDOW; DIFF_NCT_STUDY_AND_PAGE_ROOTS; PRESERVE_SPONSOR_POSTED_AND_NLM_QC_BOUNDARIES; NEVER_POOL_STUDIES_TERMS_OR_GROUPS; REQUIRE_INDEPENDENT_LABEL_CAUSAL_TARGET_RIGHTS_AND_PROSPECTIVE_HOLDOUT_CONTRACTS_BEFORE_ANY_TRAINING_OR_PRICE_USE"),
]);

const SOURCE_TO_LANE = deepFreeze({
  TRACE_COMMONS_WAVE5: "WAVE5_REAL_SOFTWARE",
  ROBUST_ROS_WAVE5_TAXONOMY: "WAVE5_REAL_SOFTWARE",
  OSHA_SIR_ROBOT_AGV: "OSHA_ROBOT_SEVERE_INJURY_REPORTS",
  AIID_ALLOWED_COLLECTIONS: "AIID_LICENSED_INCIDENT_TAXONOMY",
  USDA_RMA_2024: "USDA_RMA_CROP_INSURANCE_EXPERIENCE",
  CAS_SCHEDULE_P_2025: "CAS_SCHEDULE_P_RESERVE_BACKTEST",
  DOJ_EEOC_AI_REMEDY: "INSTITUTIONAL_AI_REMEDIES",
  OPENFEMA_NFIP: "FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS",
  FEMA_PA_APPEALS: "FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS",
  CBCA_FEMA_ARBITRATIONS: "FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS",
  FDA_MAUDE: "FDA_MAUDE_PASSIVE_REPORTS",
  CA_DMV_AV: "CA_DMV_AV_PERMIT_COLLISION_EXPOSURE",
  CFPB_HARMED_CONSUMER_PAYMENTS: "CFPB_FTC_CPSC_PAYMENT_REMEDY_RECOVERY",
  FTC_CONSUMER_REFUNDS: "CFPB_FTC_CPSC_PAYMENT_REMEDY_RECOVERY",
  CPSC_RECALLS_AND_MPR: "CFPB_FTC_CPSC_PAYMENT_REMEDY_RECOVERY",
  ASB_ASOPS: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE",
  SEC_EDGAR_INSURER_XBRL: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE",
  FDIC_FAILURES_AND_RECEIVERSHIP_DIVIDENDS: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE",
  TREASURY_TCMM_COLLATERAL: "INSTITUTIONAL_CAPITAL_CLAIMS_REFERENCE",
  NTSB_ACCIDENT_INVESTIGATIONS: "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
  BLS_IIF: "BLS_IIF_2024_SOII_CFOI_OIICS",
  TREASURY_JUDGMENT_FUND_CERTIFICATION: "TREASURY_JUDGMENT_FUND",
  TREASURY_JUDGMENT_FUND_BIWEEKLY_PAYMENTS: "TREASURY_JUDGMENT_FUND",
  GAO_BID_PROTESTS: "GAO_BID_PROTEST",
  NCUA_SHARE_INSURANCE_FUND: "NCUA_NCUSIF_2025_AUDITED_EXPERIENCE",
  PBGC_PENSION_INSURANCE: "PBGC_PENSION_INSURANCE_2024_2025_EXPERIENCE",
  MSHA_ACCIDENT_INJURY_EMPLOYMENT: "MSHA_ACCIDENT_AND_EMPLOYMENT_2000_2026",
  CA_DOI_SERFF_RATE_FILINGS: "CDI_RATE_FILING_AND_REGISTRY_EXPERIENCE",
  NCIGF_ASSESSMENT_LIABILITY: "NCIGF_ASSESSMENT_CAPACITY_EXPERIENCE",
  FRA_SAFETY_DATA: "FRA_FORM54_FORM55_2015_2019",
  PHMSA_PIPELINE_SAFETY: "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE",
  NHTSA_RECALLS_ENFORCEMENT: "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE",
  BERKELEY_RAIL_BRIDGEDATA_V2_TFDS_1_0_0_MINIMAL_RECORD_20260822:
    "BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORY_CANDIDATE",
  WAYMO_SAFETY_IMPACT_DATA_HUB_20260624_CAPTURED_20260822:
    "WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE",
  CLINICALTRIALS_GOV: "CLINICALTRIALS_SPONSOR_POSTED_AGGREGATE_RESULTS_REFERENCE",
});

const NULL_CATALOG_HASH_BOUND_BY_NESTED_PROGRESS_PROFILE = new Set([]);

const STATUS_BASIS = deepFreeze({
  VERIFIED: "FROZEN_SOURCE_ADAPTER_DIRECTLY_SUPPORTS_THIS_DIMENSION_WITHIN_THE_STATED_SOURCE_DOMAIN_LANE_SCOPE; VERIFIED_INSTITUTIONAL_AUTHORITY_NEVER_TRANSFERS_AUTHORITY_TO_OUTSIDER",
  PARTIAL: "FROZEN_SOURCE_ADAPTER_SUPPORTS_ONLY_THE_EXPLICITLY_BOUNDED_PART_OF_THIS_DIMENSION",
  UNESTABLISHED: "NO_ADMISSIBLE_SUPPORT_FOR_THIS_DIMENSION_IN_THIS_LANE",
  CONTRADICTED: "FROZEN_SOURCE_EXPLICITLY_CONTRADICTS_THIS_DIMENSION",
  NOT_APPLICABLE: "DIMENSION_IS_NOT_APPLICABLE_TO_THIS_OBSERVATION_UNIT",
});

function receipt(id) {
  const found = ARTIFACT_RECEIPTS.find((item) => item.artifactId === id);
  if (!found) fail("ARTIFACT_RECEIPT_MISSING", id);
  return found;
}

function qualityDimensions(spec) {
  const binding = receipt(spec.artifactId);
  const hashes = [binding.artifactHash, binding.sourceCommitment];
  const base = {
    byteIdentity: "VERIFIED",
    sourceProvenance: "VERIFIED",
    realityLink: "VERIFIED",
    populationFrame: "UNESTABLISHED",
    recordCompleteness: "UNESTABLISHED",
    revisionAndDedup: "UNESTABLISHED",
    measurementDefinition: "UNESTABLISHED",
    temporalOrdering: "UNESTABLISHED",
    exposureDenominator: "UNESTABLISHED",
    outcomeSensing: "UNESTABLISHED",
    independentOutcomeReview: "UNESTABLISHED",
    economicAmount: "UNESTABLISHED",
    adjudicationFinality: "UNESTABLISHED",
    dependenceStructure: "UNESTABLISHED",
    causalDesign: "UNESTABLISHED",
    capitalMeasurement: "UNESTABLISHED",
    custodyExecution: "UNESTABLISHED",
    institutionalAuthority: "UNESTABLISHED",
    affectedPartyStanding: "UNESTABLISHED",
    rightsAndConsent: "UNESTABLISHED",
    targetDomainTransfer: "UNESTABLISHED",
    privacyProjection: "UNESTABLISHED",
    longitudinalMaturity: "UNESTABLISHED",
    ...spec.qualityOverrides,
  };
  if (!exactKeys(base, QUALITY_DIMENSIONS)) fail("QUALITY_DIMENSION_PROFILE_INVALID", spec.laneId);
  return Object.fromEntries(QUALITY_DIMENSIONS.map((id) => [id, {
    status: base[id],
    basis: `${STATUS_BASIS[base[id]]}; ${spec.laneId}`,
    evidenceHashes: base[id] === "UNESTABLISHED" || base[id] === "NOT_APPLICABLE"
      ? [] : [...hashes],
  }]));
}

function qualityAssessment(spec) {
  const binding = receipt(spec.artifactId);
  return createRealCaseQualityAssessment({
    sourceId: spec.laneId,
    sourceRevision: binding.artifactHash,
    observationUnit: spec.observationUnit,
    realityStatus: spec.realityStatus,
    collectionRelationship: spec.collectionRelationship,
    dimensions: qualityDimensions(spec),
  });
}

function gapReferenceMatrix(asOf) {
  /* The catalog has its own canonical snapshot time. Do not silently reseal
   * the catalog under a different flywheel or catalog generatedAt value. */
  const catalog = buildRealCaseGapEvidenceCatalog({ asOf: REAL_CASE_GAP_CATALOG_AS_OF });
  const catalogCheck = verifyRealCaseGapEvidenceCatalog(catalog);
  if (!catalogCheck.ok || catalogCheck.sourceArtifactsReverified !== false
    || catalog.catalogHash !== REAL_CASE_GAP_CATALOG_HASH) {
    fail("GAP_CATALOG_INVALID");
  }
  const readiness = createReadinessGapLedger({ asOf });
  const external = readiness.gaps.filter((item) => item.category !== "INTERNAL_ENGINEERING");
  if (external.length !== 36 || catalog.gaps.length !== 36) fail("GAP_COUNT_INVALID");
  const catalogSources = new Map(catalog.sources.map((source) => [source.sourceId, source]));
  const sourceReceiptBinding = (sourceId) => {
    if (!Object.hasOwn(SOURCE_TO_LANE, sourceId)) return null;
    const source = catalogSources.get(sourceId);
    if (!source || source.state !== "ADAPTER_SOURCE_REPLAYED_LOCAL") return null;
    if (source.localArtifactHash === null) {
      return NULL_CATALOG_HASH_BOUND_BY_NESTED_PROGRESS_PROFILE.has(sourceId)
        ? receipt("CROSS_STAGE_SIX_LANE_PROGRESS") : null;
    }
    const spec = LANE_SPECS.find(({ laneId }) => laneId === SOURCE_TO_LANE[sourceId]);
    if (!spec) return null;
    const binding = receipt(spec.artifactId);
    return binding.artifactHash === source.localArtifactHash
      || binding.upstreamBindingHashes.includes(source.localArtifactHash)
      ? binding : null;
  };
  const sourceIsBoundByReplayedReceipt = (sourceId) =>
    sourceReceiptBinding(sourceId) !== null;
  const sourceIsBoundByTemporallyCurrentReceipt = (sourceId) =>
    sourceReceiptBinding(sourceId)?.currentCoverage === true;
  const replayedCatalogSourceRows = catalog.sources.filter(({ sourceId }) =>
    sourceIsBoundByReplayedReceipt(sourceId));
  const temporallyCurrentCatalogSourceRows = replayedCatalogSourceRows.filter(({ sourceId }) =>
    sourceIsBoundByTemporallyCurrentReceipt(sourceId));
  const temporalQuarantineCatalogSourceRows = replayedCatalogSourceRows.filter(({ sourceId }) =>
    !sourceIsBoundByTemporallyCurrentReceipt(sourceId));
  if (replayedCatalogSourceRows.length !== 35
    || temporallyCurrentCatalogSourceRows.length !== 18
    || temporalQuarantineCatalogSourceRows.length !== 17) {
    fail("CATALOG_TEMPORAL_SOURCE_COUNTS_INVALID",
      `${replayedCatalogSourceRows.length}/${temporallyCurrentCatalogSourceRows.length}/${temporalQuarantineCatalogSourceRows.length}`);
  }
  const rows = catalog.gaps.map((gap) => {
    const replayedSourceIds = gap.sourceIds.filter(sourceIsBoundByReplayedReceipt);
    const replayedLaneIds = [...new Set(replayedSourceIds.map((id) => SOURCE_TO_LANE[id]))]
      .sort();
    const temporallyCurrentSourceIds = replayedSourceIds
      .filter(sourceIsBoundByTemporallyCurrentReceipt);
    const temporallyCurrentLaneIds = [...new Set(temporallyCurrentSourceIds
      .map((id) => SOURCE_TO_LANE[id]))].sort();
    const temporalQuarantineSourceIds = replayedSourceIds
      .filter((sourceId) => !sourceIsBoundByTemporallyCurrentReceipt(sourceId));
    const notReplayedByFlywheelSourceIds = gap.sourceIds
      .filter((sourceId) => !sourceIsBoundByReplayedReceipt(sourceId));
    return {
      gapId: gap.gapId,
      stage: gap.stage,
      readinessCategory: gap.readinessCategory,
      readinessStatus: gap.readinessStatus,
      contributionKind: gap.contributionKind,
      catalogSourceIds: [...gap.sourceIds],
      sourceReplayedByThisFlywheelSourceIds: replayedSourceIds,
      sourceReplayedByThisFlywheelLaneIds: replayedLaneIds,
      temporallyCurrentSourceReplayedByThisFlywheelSourceIds: temporallyCurrentSourceIds,
      temporallyCurrentSourceReplayedByThisFlywheelLaneIds: temporallyCurrentLaneIds,
      temporalQuarantineSourceReplayedByThisFlywheelSourceIds:
        temporalQuarantineSourceIds,
      catalogReferencesNotReplayedByThisFlywheel: notReplayedByFlywheelSourceIds,
      referenceEvidenceCoverage: replayedLaneIds.length > 0
        ? "SOURCE_REPLAYED_REFERENCE_PHENOMENON_PRESENT"
        : gap.sourceIds.length > 0
          ? "CATALOGED_BROWSABLE_OR_OTHER_ADAPTER_REFERENCE_ONLY"
          : "NO_WEB_SUBSTITUTE_FOR_TARGET_EXECUTION",
      temporallyCurrentReferenceCoverage: temporallyCurrentLaneIds.length > 0
        ? "TEMPORALLY_ORDERED_CURRENT_REFERENCE_PHENOMENON_PRESENT"
        : temporalQuarantineSourceIds.length > 0
          ? "TEMPORAL_QUARANTINE_REFERENCE_PHENOMENON_ONLY_NOT_CURRENT_COVERAGE"
          : "NO_TEMPORALLY_CURRENT_SOURCE_REPLAYED_REFERENCE",
      publicEvidenceCanEstablish: gap.publicEvidenceCanEstablish,
      targetSpecificRemainder: gap.targetSpecificRemainder,
      sourceDomainReferenceEvidenceIsTargetAdoption: false,
      sourceDomainReferenceEvidenceIsGapClosure: false,
      closureCredit: false,
      targetTransferEstablished: false,
      authorityGranted: false,
    };
  });
  if (rows.filter((row) => row.temporallyCurrentSourceReplayedByThisFlywheelLaneIds
    .length > 0).length !== 24) {
    fail("TEMPORALLY_CURRENT_GAP_REFERENCE_COUNT_INVALID");
  }
  return {
    catalogAsOf: catalog.asOf,
    catalogHash: catalog.catalogHash,
    catalogVerificationLevel: catalogCheck.verificationLevel,
    catalogArtifactFileHash: REAL_CASE_GAP_CATALOG_FILE_HASH,
    catalogArtifactFileBytes: REAL_CASE_GAP_CATALOG_FILE_BYTES,
    catalogSourceArtifactsReverifiedByCatalogAlone: false,
    temporalAuditBinding: {
      canonicalRelease: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.canonicalRelease,
      repositoryRelativePath:
        STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.repositoryRelativePath,
      manifestHash: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.manifestHash,
      artifactFileHash: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.artifactFileHash,
      artifactFileBytes: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.artifactFileBytes,
      pinnedReceiptCount: 16,
      temporalQuarantineReceiptCount: 7,
      temporallyOrderedCurrentReceiptCount: 9,
      currentCoverageReceiptCount: 9,
      currentCoverageMeaning: "RECEIPT_ROUTING_ONLY_NOT_GAP_CLOSURE_OR_WORLD_TRUTH",
      sourceBytesReplayedByFlywheelArtifactAlone: false,
      temporalAuditReverifiedByFlywheelArtifactAlone: false,
      closureCredit: false,
      operationalAuthorityGranted: false,
    },
    catalogSearchScope: clone(catalog.searchScope),
    catalogSourceCounts: clone(catalog.counts),
    rows,
    counts: {
      readinessExternalGaps: 36,
      gapsWithSourceReplayedReferenceFromThisFlywheel:
        rows.filter((row) => row.sourceReplayedByThisFlywheelLaneIds.length > 0).length,
      gapsWithTemporallyCurrentSourceReplayedReference:
        rows.filter((row) => row.temporallyCurrentSourceReplayedByThisFlywheelLaneIds
          .length > 0).length,
      replayedCatalogSourceRows: replayedCatalogSourceRows.length,
      temporallyCurrentCatalogSourceRows: temporallyCurrentCatalogSourceRows.length,
      temporalQuarantineCatalogSourceRows: temporalQuarantineCatalogSourceRows.length,
      gapsWithOnlyOtherCatalogReference:
        rows.filter((row) => row.sourceReplayedByThisFlywheelLaneIds.length === 0
          && row.catalogSourceIds.length > 0).length,
      gapsWithNoWebSubstitute: rows.filter((row) => row.catalogSourceIds.length === 0).length,
      targetSpecificGapsClosed: 0,
      institutionalAuthorityGapsClosed: 0,
    },
  };
}

function stageReferenceProgress(gapReferences) {
  const stages = [
    { stage: "MEASURE", stageNumber: "0.5" },
    { stage: "ATTEST", stageNumber: "1" },
    { stage: "CURATE", stageNumber: "1.5" },
    { stage: "PRICE", stageNumber: "2" },
    { stage: "GUARANTEE", stageNumber: "3" },
    { stage: "SETTLE", stageNumber: "4" },
  ];
  return stages.map(({ stage, stageNumber }) => {
    const rows = gapReferences.rows.filter((row) => row.stage === stage);
    return {
      stage,
      stageNumber,
      nonLocalGapRows: rows.length,
      gapsWithSourceReplayedReferencePhenomena:
        rows.filter((row) => row.sourceReplayedByThisFlywheelLaneIds.length > 0).length,
      gapsWithTemporallyCurrentSourceReplayedReferencePhenomena:
        rows.filter((row) => row.temporallyCurrentSourceReplayedByThisFlywheelLaneIds
          .length > 0).length,
      gapsWithCatalogReferenceButNoFlywheelReplay:
        rows.filter((row) => row.sourceReplayedByThisFlywheelLaneIds.length === 0
          && row.catalogSourceIds.length > 0).length,
      gapsWithNoWebSubstitute: rows.filter((row) => row.catalogSourceIds.length === 0).length,
      sourceDomainFactorAndQualityModelCanBeRefined: rows.some((row) => (
        row.sourceReplayedByThisFlywheelLaneIds.length > 0
      )),
      targetSpecificReadinessGapsClosed: 0,
      targetDomainTransferEstablished: false,
      responsibilityBearingAuthorityGranted: false,
      stageTransitionAuthorized: false,
    };
  });
}

const AUTHORITY = deepFreeze({
  PRICE: false,
  GUARANTEE: false,
  SETTLE: false,
  TRAIN: false,
  CLOSE: false,
  REOPEN: false,
  EXECUTE: false,
  COVER: false,
  CAPITAL: false,
  CUSTODY: false,
  CONTROL: false,
  PAY: false,
  MOVES_FUNDS: false,
  BINDS_COUNTERPARTY: false,
  ownerGateInputEligible: false,
  productionReady: false,
  readyToBearResponsibility: false,
});

const EVIDENCE_PRINCIPLE = deepFreeze({
  realCasesRemainRealCases: true,
  realExperienceRemainsRealExperience: true,
  publicOriginAutomaticallyDowngradesEvidence: false,
  outsiderCollectionAutomaticallyUpgradesEvidence: false,
  collectorRelationshipUsedAsQualityScore: false,
  sourceRealityAdmissionDependsOnRights: false,
  operationalOrReuseAdmissionDependsOnClaimSpecificQualityProvenanceReliabilityCompletenessAndRights: true,
  officialPublisherIdentityAloneIsSufficientQualityProof: false,
  sourceReplayAuthenticatesBytesNotUnderlyingTruth: true,
  realWorldRealityGrantsCausalityOrTargetTransfer: false,
  researchOrShadowDescribesPermittedUseAndInferenceBoundaryNotSourceReality: true,
});

const REALITY_STEWARDSHIP_BOUNDARY = deepFreeze({
  role: "EXTERNAL_REALITY_EVIDENCE_REFRESH_FLYWHEEL",
  tracks: ["OBSERVATIONS", "MISSINGNESS", "RESPONSIBILITY_CASE_REFERENCES"],
  realCaseOrExperienceRealityIsNotDowngradedByPublicOrigin: true,
  collectorPrestigeChangesRealityStatus: false,
  sourceSpecificQualityAndReliabilityScreeningRequired: true,
  evidenceRowsWithUnresolvedQualityAreQuarantinedRatherThanSilentlyPromoted: true,
  ownerAuthority: false,
  adjudicatorAuthority: false,
  closureOrReopenAuthority: false,
  modifiesRealityStewardshipCoreAuthorityApi: false,
});

const QUANTITATIVE_BOUNDARY = deepFreeze({
  heterogeneousLanesPooled: false,
  dollarsPooledAcrossDomains: false,
  recordCountsPooledAcrossDomains: false,
  ratesPooledAcrossDomains: false,
  currentExposureDividedIntoHistoricalLoss: false,
  selfReportsTreatedAsIndependentOutcomes: false,
  documentsTreatedAsIndependentCases: false,
  missingValuesTreatedAsZero: false,
  censoredRowsTreatedAsClosed: false,
  finalPaymentTreatedAsRestorationOrRealityClosure: false,
  crossLaneDollarTotal: null,
  crossLaneRecordTotal: null,
  crossLaneFrequency: null,
  targetDomainLossEstimate: null,
  targetDomainPrice: null,
});

const SOURCE_VERIFICATION_BOUNDARY = deepFreeze({
  standaloneVerificationLevel: "FIXED_STRUCTURE_QUALITY_POLICY_AND_GAP_MAPPING_ONLY",
  standaloneSourceArtifactsReverified: false,
  embeddedReceiptIsSourceProof: false,
  fullVerificationMustReadPinnedUpstreamArtifacts: true,
  fullVerificationMustInvokeEveryUpstreamSourceAwareVerifier: true,
  fullVerificationMustRebuildAndExactCompareEveryRequiredArtifact: true,
  fullVerificationMustReplayExactStage0TemporalAudit: true,
  fullVerificationLevel:
    "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE",
  callerVerificationBooleanAccepted: false,
  callerVerificationResultAccepted: false,
  callerVerificationCallbackAccepted: false,
  missingArtifactAccepted: false,
  supersededArtifactAccepted: false,
  unknownExtensionAccepted: false,
  callerSelectedGeneratedAtAccepted: false,
  candidateGeneratedAtUsedForStandaloneRebuild: false,
  candidateGeneratedAtUsedForFullSourceRebuild: false,
  coherentPastOrFutureTimeResealAccepted: false,
});

const CANONICAL_TIME_BOUNDARY = deepFreeze({
  generatedAt: REAL_CASE_RESPONSIBILITY_FLYWHEEL_GENERATED_AT,
  catalogAsOf: REAL_CASE_GAP_CATALOG_AS_OF,
  generatedAtIsCodeFixed: true,
  generatedAtIsExternalAttestation: false,
  arbitraryCanonicalIsoAcceptedByBuilder: false,
  candidateGeneratedAtReplayedByVerifier: false,
  pastOrFutureCoherentResealAccepted: false,
  catalogCanHaveOtherStructureOnlySnapshots: true,
  thisFlywheelBindsCatalogHashAtExactCatalogAsOf: REAL_CASE_GAP_CATALOG_HASH,
  thisFlywheelBindsCatalogArtifactFileHash: REAL_CASE_GAP_CATALOG_FILE_HASH,
  thisFlywheelBindsCatalogArtifactFileBytes: REAL_CASE_GAP_CATALOG_FILE_BYTES,
});

const TEMPORAL_AUTHENTICITY_BOUNDARY = deepFreeze({
  status: "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE",
  auditCanonicalRelease: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.canonicalRelease,
  auditRepositoryRelativePath:
    STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.repositoryRelativePath,
  auditManifestHash: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.manifestHash,
  auditArtifactFileHash: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.artifactFileHash,
  auditArtifactFileBytes: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.artifactFileBytes,
  pinnedReceiptCount: 16,
  sourceBytesReplayedReceiptCount: 16,
  temporallyOrderedCurrentReceiptCount: 9,
  temporalQuarantineReceiptCount: 7,
  currentCoverageReceiptCount: 9,
  allPinnedReceiptsTemporallyCurrent: false,
  temporalQuarantineIsReferenceEvidenceNotCurrentCoverage: true,
  temporalQuarantineCurrentCoverage: 0,
  temporalQuarantineClosureCredit: 0,
  temporalQuarantineCausalExperienceUnits: 0,
  temporalQuarantineTrainingAdmission: 0,
  temporalQuarantinePricingAdmission: 0,
  temporalQuarantineOperationalAuthority: 0,
  localFilesystemMtimeIsExternalAttestation: false,
  sourceReplayEstablishesUnderlyingWorldTruth: false,
});

const EXTENSION_FRONTIER = deepFreeze({
  extensionLanesIncluded: ["NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
    "BLS_IIF_2024_SOII_CFOI_OIICS", "TREASURY_JUDGMENT_FUND", "GAO_BID_PROTEST",
    "NCUA_NCUSIF_2025_AUDITED_EXPERIENCE",
    "PBGC_PENSION_INSURANCE_2024_2025_EXPERIENCE",
    "MSHA_ACCIDENT_AND_EMPLOYMENT_2000_2026",
    "CDI_RATE_FILING_AND_REGISTRY_EXPERIENCE",
    "NCIGF_ASSESSMENT_CAPACITY_EXPERIENCE", "FRA_FORM54_FORM55_2015_2019",
    "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE",
    "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE",
    "BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORY_CANDIDATE",
    "WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE",
    "CLINICALTRIALS_SPONSOR_POSTED_AGGREGATE_RESULTS_REFERENCE"],
  ntsbBls: {
    status: "SOURCE_AWARE_FROZEN_EXTENSION_INCLUDED",
    includedLaneIds: ["NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS",
      "BLS_IIF_2024_SOII_CFOI_OIICS"],
    satisfiedInterface: [
      "EXACT_PINNED_SOURCE_DIRECTORY_PROFILE",
      "STRUCTURE_ONLY_STANDALONE_VERIFIER",
      "FULL_SOURCE_REBUILD_AND_EXACT_ARTIFACT_COMPARE",
      "CANONICAL_ARTIFACT_HASH_AND_SOURCE_SET_COMMITMENT",
      "QUALITY_DIMENSIONS_WITH_DENOMINATOR_RSE_SUPPRESSION_FINALITY_AND_REVISION_BOUNDARIES",
    ],
    sourceDomainEvidenceIncludedInFixedProjection: true,
    sourceReplayClaimedByArtifactAlone: false,
    underlyingWorldTruthBeyondPublisherRecordClaimed: false,
    institutionalAuthorityClaimed: false,
  },
  judgmentFundGao: {
    status: "SOURCE_AWARE_FROZEN_EXTENSION_INCLUDED",
    includedLaneIds: ["TREASURY_JUDGMENT_FUND", "GAO_BID_PROTEST"],
    satisfiedInterface: [
      "EXACT_PINNED_SOURCE_DIRECTORY_PROFILE",
      "STRUCTURE_ONLY_STANDALONE_VERIFIER",
      "FULL_SOURCE_REBUILD_AND_EXACT_ARTIFACT_COMPARE",
      "CANONICAL_ARTIFACT_HASH_AND_SOURCE_OBJECT_SET_COMMITMENT",
      "PAYMENT_COMPONENT_CLAIM_LINKAGE_PRIVACY_FINALITY_IMPLEMENTATION_AND_RIGHTS_BOUNDARIES",
    ],
    sourceDomainEvidenceIncludedInFixedProjection: true,
    sourceReplayClaimedByArtifactAlone: false,
    paymentSettlementRecoveryEquivalenceClaimed: false,
    recommendationImplementationEquivalenceClaimed: false,
    institutionalAuthorityTransferredToOutsider: false,
  },
  ncuaPbgcMsha: {
    status: "SOURCE_AWARE_FROZEN_EXTENSION_INCLUDED",
    includedLaneIds: ["NCUA_NCUSIF_2025_AUDITED_EXPERIENCE",
      "PBGC_PENSION_INSURANCE_2024_2025_EXPERIENCE",
      "MSHA_ACCIDENT_AND_EMPLOYMENT_2000_2026"],
    satisfiedInterface: [
      "EXACT_PINNED_SOURCE_DIRECTORY_PROFILE",
      "STRUCTURE_ONLY_STANDALONE_VERIFIER",
      "FULL_SOURCE_REBUILD_AND_EXACT_ARTIFACT_COMPARE",
      "CANONICAL_ARTIFACT_HASH_AND_SOURCE_SET_COMMITMENT",
      "AUDIT_INSTALLMENT_TIME_FRAME_CORRELATION_PRIVACY_RIGHTS_AND_REVISION_BOUNDARIES",
    ],
    sourceDomainEvidenceIncludedInFixedProjection: true,
    sourceReplayClaimedByArtifactAlone: false,
    auditedStatementIsGuaranteeClaimed: false,
    currentMshaIncidenceRateClaimed: false,
    institutionalAuthorityTransferredToOutsider: false,
  },
  cdiNcigf: {
    status: "SOURCE_AWARE_FROZEN_EXTENSION_INCLUDED",
    includedLaneIds: ["CDI_RATE_FILING_AND_REGISTRY_EXPERIENCE",
      "NCIGF_ASSESSMENT_CAPACITY_EXPERIENCE"],
    satisfiedInterface: [
      "EXACT_PINNED_SOURCE_DIRECTORY_PROFILE",
      "STRUCTURE_ONLY_STANDALONE_VERIFIER",
      "FULL_SOURCE_REBUILD_AND_EXACT_ARTIFACT_COMPARE",
      "CANONICAL_ARTIFACT_HASH_AND_SOURCE_SET_COMMITMENT",
      "STATUS_PRICE_DENOMINATOR_FORMULA_PURPOSE_DISCLAIMER_MISSINGNESS_AND_CORRELATION_BOUNDARIES",
    ],
    sourceDomainEvidenceIncludedInFixedProjection: true,
    sourceReplayClaimedByArtifactAlone: false,
    acceptedFilingTreatedAsApprovedOrChargedPrice: false,
    guarantyFundCapacityTreatedAsOutsiderCashCapitalOrCustody: false,
    crossLanePoolingPerformed: false,
    institutionalAuthorityTransferredToOutsider: false,
  },
  fraPhmsa: {
    status: "SOURCE_AWARE_FROZEN_EXTENSION_INCLUDED",
    includedLaneIds: ["FRA_FORM54_FORM55_2015_2019",
      "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE"],
    satisfiedInterface: [
      "EXACT_PINNED_SOURCE_DIRECTORY_PROFILE",
      "STRUCTURE_ONLY_STANDALONE_VERIFIER",
      "FULL_SOURCE_REBUILD_AND_EXACT_ARTIFACT_COMPARE",
      "CANONICAL_ARTIFACT_HASH_SOURCE_SET_AND_CANONICAL_QUERY_COMMITMENTS",
      "REPORTING_THRESHOLD_DUPLICATE_REVISION_OPERATOR_CORRELATION_DAMAGE_LOSS_EXPOSURE_RIGHTS_AND_DEFERRED_MODEL_BOUNDARIES",
    ],
    fraSourceDomainOutcomeExposureDiagnosticsIncluded: true,
    phmsaRealSourceReceiptIncluded: true,
    phmsaOutcomeOrActuarialModelInputAdmitted: false,
    phmsaFrequencyOrSeverityRateAdmitted: false,
    phmsaPricingInputAdmitted: false,
    fraAndPhmsaPoolingPerformed: false,
    sourceReplayClaimedByArtifactAlone: false,
    institutionalAuthorityTransferredToOutsider: false,
  },
  nhtsaRecallRemedy: {
    status: "SOURCE_AWARE_FROZEN_EXTENSION_INCLUDED",
    includedLaneIds: ["NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE"],
    satisfiedInterface: [
      "EXACT_PINNED_SOURCE_DIRECTORY_PROFILE",
      "STRUCTURE_ONLY_STANDALONE_VERIFIER",
      "FULL_SOURCE_REBUILD_AND_EXACT_ARTIFACT_COMPARE",
      "CANONICAL_ARTIFACT_HASH_SOURCE_SET_AND_ACQUISITION_MANIFEST_COMMITMENTS",
      "MANUFACTURER_REPORT_RIGHT_CENSOR_REVISION_POPULATION_LINKAGE_ANOMALY_RECEIPT_REPAIR_CAUSE_LOSS_ENFORCEMENT_RIGHTS_AND_AUTHORITY_BOUNDARIES",
    ],
    sourceDomainRecallAndRemedyStatusReferenceIncluded: true,
    affectedPartyReceiptEstablished: false,
    completeRepairEstablished: false,
    independentCausalityEstablished: false,
    lossCalibrationEstablished: false,
    enforcementOrConsentOrderBodyCaptured: false,
    outsiderRemedyEstablished: false,
    targetTransferEstablished: false,
    trainingInputAdmitted: false,
    pricingInputAdmitted: false,
    sourceReplayClaimedByArtifactAlone: false,
    institutionalAuthorityTransferredToOutsider: false,
  },
  bridgeDataV2: {
    status: "SOURCE_AWARE_FROZEN_EXTENSION_INCLUDED",
    includedLaneIds: ["BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORY_CANDIDATE"],
    satisfiedInterface: [
      "EXACT_PINNED_SOURCE_DIRECTORY_PROFILE",
      "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION_WITH_NESTED_SHAPE_FINGERPRINT",
      "FULL_SOURCE_REBUILD_AND_EXACT_ARTIFACT_COMPARE",
      "CANONICAL_ARTIFACT_HASH_AND_SOURCE_SET_COMMITMENT",
      "ONE_RECORD_FULL_CORPUS_SEMANTIC_CORRELATION_RIGHTS_TRANSFER_AND_TRAINING_BOUNDARIES",
    ],
    realLabRobotTrajectoryReferenceIncluded: true,
    capturedWholeRecords: 1,
    publisherTrainExamples: 53192,
    publisherTrainShards: 1024,
    trainingCandidateDecision: "HOLD_FOR_SEMANTIC_CONTENT_AND_GOVERNANCE_REVIEW",
    trainerRowsEnqueued: 0,
    fullCorpusReplayed: false,
    semanticContractEstablished: false,
    correlationStructureEstablished: false,
    targetTransferEstablished: false,
    trainingInputAdmitted: false,
    sourceReplayClaimedByArtifactAlone: false,
    institutionalAuthorityTransferredToOutsider: false,
  },
  waymoSafetyImpact: {
    status: "SOURCE_AWARE_FROZEN_EXTENSION_INCLUDED",
    includedLaneIds: ["WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE"],
    satisfiedInterface: [
      "EXACT_PINNED_SOURCE_DIRECTORY_PROFILE",
      "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION_WITH_NESTED_SHAPE_FINGERPRINT",
      "FULL_SOURCE_REBUILD_AND_EXACT_ARTIFACT_COMPARE",
      "CANONICAL_ARTIFACT_HASH_AND_SOURCE_SET_COMMITMENT",
      "DISPLAY_ROUNDING_SGO_DUPLICATE_OUTCOME_LOCATION_NAN_BENCHMARK_WINDOW_ADJUDICATION_TRANSFER_AND_PRICE_BOUNDARIES",
    ],
    nonPooledOutcomeExposureReferenceIncluded: true,
    displayedRoundedRiderOnlyMiles: "220613000",
    publishedLiteralNanTokens: 164,
    duplicateOutcomeLocationAndBenchmarkConflictsRetained: true,
    publisherSourceReplayEstablishedOnlyByFullVerifier: true,
    underlyingWorldTruthEstablished: false,
    independentAdjudicationEstablished: false,
    prospectiveOrExternalTargetHoldoutEstablished: false,
    targetTransferEstablished: false,
    trainingInputAdmitted: false,
    pricingInputAdmitted: false,
    sourceReplayClaimedByArtifactAlone: false,
    institutionalAuthorityTransferredToOutsider: false,
  },
  clinicalTrials: {
    status: "SOURCE_AWARE_FROZEN_EXTENSION_INCLUDED",
    includedLaneIds: ["CLINICALTRIALS_SPONSOR_POSTED_AGGREGATE_RESULTS_REFERENCE"],
    satisfiedInterface: [
      "EXACT_PINNED_SOURCE_DIRECTORY_PROFILE",
      "STRUCTURE_ONLY_STANDALONE_VERIFIER",
      "FULL_EXACT_OFFICIAL_DATA_API_SOURCE_REBUILD_AND_ARTIFACT_COMPARE_WITH_RIGHTS_TERMS_EXCLUDED",
      "CANONICAL_ARTIFACT_HASH_SOURCE_SET_AND_ACQUISITION_MANIFEST_COMMITMENTS",
      "DERIVED_ARTIFACT_STRIPS_SPONSOR_PERSON_NAMES_AND_RAW_RECORD_NAME_COMMITMENTS",
      "RIGHTS_TERMS_URL_ONLY_NOT_REPLAYED_AND_RIGHTS_NOT_ESTABLISHED",
      "SPONSOR_POSTING_NLM_QC_STUDY_CORRELATION_CAUSALITY_TRANSFER_TRAINING_PRICE_AND_AUTHORITY_BOUNDARIES",
    ],
    completeResultsFirstPostedWindowStudyRecords: 18,
    crossStudyOrTermPoolingPerformed: false,
    sponsorOrPersonNamesPersistedInDerivedArtifact: false,
    rightsTermsSourceReplayed: false,
    rightsDetermination: "NOT_ESTABLISHED_URL_ONLY_NOT_REPLAYED",
    independentOutcomeTruthEstablished: false,
    causalEffectEstablished: false,
    targetTransferEstablished: false,
    trainingInputAdmitted: false,
    pricingInputAdmitted: false,
    sourceReplayClaimedByArtifactAlone: false,
    institutionalAuthorityTransferredToOutsider: false,
  },
});

function projectionAt(generatedAt) {
  const asOf = canonicalTime(generatedAt);
  if (Date.parse(asOf) < Date.parse(REAL_CASE_GAP_CATALOG_AS_OF)) {
    fail("GENERATED_AT_PRECEDES_CATALOG_AS_OF");
  }
  const qualityAssessments = LANE_SPECS.map((spec) => qualityAssessment(spec));
  for (const assessment of qualityAssessments) {
    const checked = verifyRealCaseQualityAssessment(assessment);
    if (!checked.ok || checked.sourceArtifactsReverified !== false) {
      fail("QUALITY_ASSESSMENT_INVALID", assessment.sourceId);
    }
  }
  const gapReferences = gapReferenceMatrix(asOf);
  const body = {
    schema: REAL_CASE_RESPONSIBILITY_FLYWHEEL_SCHEMA,
    schemaVersion: "1.7.0",
    generatedAt: asOf,
    generatedAtTrust: "CODE_FIXED_CANONICAL_TIME_NOT_EXTERNAL_ATTESTATION",
    canonicalTimeBoundary: {
      ...clone(CANONICAL_TIME_BOUNDARY),
      generatedAt: asOf,
    },
    temporalAuthenticityBoundary: clone(TEMPORAL_AUTHENTICITY_BOUNDARY),
    evidencePrinciple: clone(EVIDENCE_PRINCIPLE),
    realityStewardshipBoundary: clone(REALITY_STEWARDSHIP_BOUNDARY),
    artifactReceipts: clone(ARTIFACT_RECEIPTS).map((row) => ({
      ...row,
      sourceReplayClaimedByArtifactAlone: false,
      exactArtifactComparedByArtifactAlone: false,
    })),
    lanes: LANE_SPECS.map((spec) => ({
      laneId: spec.laneId,
      artifactId: spec.artifactId,
      realityStatus: spec.realityStatus,
      collectionRelationship: spec.collectionRelationship,
      observationUnit: spec.observationUnit,
      units: clone(spec.units),
      denominatorBoundary: spec.denominatorBoundary,
      missingness: clone(spec.missingness),
      rightsBoundary: spec.rightsBoundary,
      correlationBoundary: spec.correlationBoundary,
      descriptiveMeasurements: clone(spec.descriptiveMeasurements),
      candidateUseAfterFullSourceReplayAndApplicableRightsReview:
        spec.laneId === "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE"
          ? ["SOURCE_RECEIPT_DESCRIPTION", "RECEIPT_QUALITY_AND_MISSINGNESS_REFINEMENT"]
          : spec.laneId === "BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORY_CANDIDATE"
            ? ["SOURCE_DOMAIN_STRUCTURAL_DESCRIPTION",
              "TRAINING_CANDIDATE_QUALITY_AND_MISSINGNESS_REFINEMENT"]
          : ["SOURCE_DOMAIN_DESCRIPTION", "REFERENCE_FACTOR_HYPOTHESIS_GENERATION",
            "QUALITY_AND_MISSINGNESS_MODEL_REFINEMENT"],
      ...(spec.laneId === "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE"
        ? {
            sourceReceiptOnly: true,
            outcomeOrActuarialModelInputAdmitted: false,
            frequencyOrSeverityRateAdmitted: false,
            pricingInputAdmitted: false,
          } : {}),
      ...(spec.laneId === "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE"
        ? {
            sourceDomainRecallAndRemedyStatusReferenceOnly: true,
            manufacturerReportedStatus: true,
            rightCensored: true,
            affectedPartyReceiptEstablished: false,
            completeRepairEstablished: false,
            independentCausalityEstablished: false,
            lossCalibrationEstablished: false,
            enforcementOrderBodyCaptured: false,
            consentOrderBodyCaptured: false,
            outsiderRemedyEstablished: false,
            trainingInputAdmitted: false,
            pricingInputAdmitted: false,
          } : {}),
      ...(spec.laneId === "BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORY_CANDIDATE"
        ? {
            realLabRobotTrajectoryReferenceOnly: true,
            trainingCandidateOnHold: true,
            trainerRowsEnqueued: 0,
            fullCorpusReplayed: false,
            semanticContractEstablished: false,
            correlationStructureEstablished: false,
            outcomeFailureAssignmentOrSurvivalEvidenceEstablished: false,
            trainingInputAdmitted: false,
            pricingInputAdmitted: false,
          } : {}),
      ...(spec.laneId === "WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE"
        ? {
            nonPooledOutcomeExposureReferenceOnly: true,
            displayedExposureIsExactUnroundedMiles: false,
            publisherSourceReplayClaimedByArtifactAlone: false,
            underlyingWorldTruthEstablished: false,
            independentAdjudicationEstablished: false,
            prospectiveOrExternalTargetHoldoutEstablished: false,
            trainingInputAdmitted: false,
            pricingInputAdmitted: false,
          } : {}),
      targetDomainTransferEstablished: false,
      targetDomainCalibrationAdmitted: false,
      crossLanePoolingPermitted: false,
      operationalAuthorityGranted: false,
      nextSnapshot: spec.nextSnapshot,
    })),
    qualityAssessments,
    qualityBindingBoundary: {
      assessmentCount: qualityAssessments.length,
      assessmentsAreCollectorNeutral: true,
      assessmentsAreSingleNumericScores: false,
      assessmentStandaloneVerificationLevel: "SELF_SEALED_DECLARED_QUALITY_FACTS",
      assessmentStandaloneSourceArtifactsReverified: false,
      fullFlywheelReplayBindsDeclaredDimensionsToExactFrozenLaneArtifacts: true,
      fullFlywheelReplayAuthenticatesUnderlyingWorldTruthBeyondSources: false,
      fullFlywheelReplayGrantsOperationalAuthority: false,
    },
    gapReferences,
    stageReferenceProgress: stageReferenceProgress(gapReferences),
    quantitativeBoundary: clone(QUANTITATIVE_BOUNDARY),
    flywheel: {
      automaticPromotion: false,
      automaticTraining: false,
      stages: [
        "DISCOVER_PRIMARY_REAL_CASE_AND_REAL_EXPERIENCE_SOURCES",
        "FREEZE_BYTES_TERMS_REGIME_AND_ACQUISITION_MANIFEST",
        "REBUILD_SOURCE_ADAPTER_AND_EXACT_COMPARE_CANONICAL_ARTIFACT",
        "ASSESS_CLAIM_SPECIFIC_QUALITY_WITHOUT_COLLECTOR_PRESTIGE",
        "QUARANTINE_MISSING_DUPLICATE_CONFLICTING_CENSORED_OR_RIGHTS_UNRESOLVED_ROWS",
        "DIFF_ONLY_WITHIN_STABLE_LANE_KEYS_AND_REGIMES",
        "REFINE_FACTORS_AND_LOSS_COMPONENTS_ONLY_INSIDE_ADMITTED_SOURCE_DOMAIN",
        "SEEK_TARGET_EXECUTION_HOLDOUT_STANDING_AUTHORITY_CAPITAL_CUSTODY_AND_RECOVERY",
        "REQUIRE_NEW_FULL_SOURCE_REPLAY_BEFORE_ANY_UPDATED_PROJECTION",
      ],
      nextSnapshots: LANE_SPECS.map(({ laneId, nextSnapshot }) => ({ laneId, action: nextSnapshot })),
      nextWaveCatalogReferences: [],
      snapshotDiffMustPreserveUnitsDenominatorsMissingnessRightsAndCorrelationRoots: true,
      evidenceCanImproveQualityModelWithoutClosingTargetSpecificGap: true,
      sourceDomainDescriptiveMathMayAdvance: true,
      crossDomainTargetEstimateMayAdvanceAutomatically: false,
    },
    extensionFrontier: clone(EXTENSION_FRONTIER),
    authority: clone(AUTHORITY),
    readiness: {
      status: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
      allRequiredFrozenLanesPresentInFixedProjection: true,
      allPinnedReceiptsTemporallyCurrent: false,
      pinnedReceiptCount: 16,
      temporallyOrderedCurrentReceiptCount: 9,
      temporalQuarantineReceiptCount: 7,
      sourceArtifactsReverifiedByArtifactAlone: false,
      targetSpecificGapClosureCredit: 0,
      readyForAutomaticTraining: false,
      readyForTargetDomainPrice: false,
      readyToIssueGuarantee: false,
      readyToExecuteOrSettleClaim: false,
      readyToHoldCapitalOrCustodyFunds: false,
      readyToCloseOrReopenRealityObligation: false,
      readyToBearResponsibility: false,
    },
    sourceVerificationBoundary: clone(SOURCE_VERIFICATION_BOUNDARY),
  };
  return deepFreeze({ ...body,
    artifactHash: digest(REAL_CASE_RESPONSIBILITY_FLYWHEEL_SCHEMA, body) });
}

function projection() {
  return projectionAt(requireCanonicalFlywheelTime(
    REAL_CASE_RESPONSIBILITY_FLYWHEEL_GENERATED_AT));
}

function expectedReceipt(id) {
  return receipt(id);
}

function requirePinnedArtifact(loaded, artifactId) {
  const expected = expectedReceipt(artifactId);
  const artifact = loaded?.value;
  if (artifact == null || typeof artifact !== "object" || Array.isArray(artifact)
    || artifact[expected.hashField] !== expected.artifactHash
    || loaded.fileHash !== expected.artifactFileHash
    || loaded.fileBytes !== expected.artifactFileBytes) {
    fail("PINNED_ARTIFACT_HASH_MISMATCH", artifactId);
  }
}

function computedSourceCommitment(artifact, artifactId) {
  if (artifactId === "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY") {
    return artifact.sourceVerification?.wave5VerificationHash;
  }
  if (artifactId === "CROSS_STAGE_SIX_LANE_PROGRESS") {
    return digest("outsider/real-case-responsibility-flywheel/source-profile/v1", {
      artifactId,
      artifactHash: artifact.artifactHash,
      sourceProfiles: artifact.lanes?.map(({ laneId, sourceProfile }) => ({
        laneId, sourceProfile,
      })),
    });
  }
  if (artifactId === "FDA_MAUDE_OUTCOME_SENSING"
    || artifactId === "CA_DMV_AV_OUTCOME_SENSING") {
    return digest("outsider/real-case-responsibility-flywheel/source-profile/v1", {
      artifactId,
      artifactHash: artifact.artifactHash,
      sourceFiles: artifact.source?.files?.map(({ name, kind, bytes, sha256 }) => ({
        name, kind, bytes, sha256,
      })),
    });
  }
  if (artifactId === "INSTITUTIONAL_CAPITAL_CLAIMS") {
    return artifact.sourceManifest?.sourceSetHash;
  }
  if (artifactId === "FEMA_REAL_CASES") return artifact.source?.sourceCommitmentHash;
  if (artifactId === "REMEDY_PAYMENT_RECOVERY") {
    return artifact.sourceManifest?.sourceObjectSetHash;
  }
  if (artifactId === "NTSB_BLS_REAL_OUTCOME_EXPERIENCE") {
    return artifact.source?.sourceSetHash;
  }
  if (artifactId === "JUDGMENT_FUND_GAO_REAL_CASES") {
    return artifact.sourceBinding?.sourceObjectSetHash;
  }
  if (artifactId === "NCUA_PBGC_MSHA_REAL_EXPERIENCE") {
    return artifact.source?.sourceSetHash;
  }
  if (artifactId === "CDI_NCIGF_REAL_RATE_GUARANTY") {
    return artifact.source?.officialSourceSetHash;
  }
  if (artifactId === "FRA_PHMSA_REAL_SAFETY_EVIDENCE") {
    return artifact.source?.sourceSetHash;
  }
  if (artifactId === "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE") {
    return artifact.source?.sourceSetHash;
  }
  if (artifactId === "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE"
    || artifactId === "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE"
    || artifactId === "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE") {
    return artifact.source?.sourceSetHash;
  }
  fail("SOURCE_COMMITMENT_ADAPTER_MISSING", artifactId);
}

function requireSourceCommitment(artifact, artifactId) {
  const actual = computedSourceCommitment(artifact, artifactId);
  const expected = expectedReceipt(artifactId).sourceCommitment;
  if (actual !== expected) fail("SOURCE_COMMITMENT_MISMATCH", artifactId);
}

function requireAcquisitionManifest(artifact, artifactId) {
  const expected = expectedReceipt(artifactId).acquisitionManifestHash;
  if (!expected) return;
  const actual = artifactId === "FRA_PHMSA_REAL_SAFETY_EVIDENCE"
    ? artifact.source?.acquisitionManifestHash
    : artifactId === "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE"
      ? artifact.source?.acquisitionManifestSha256 : null;
  if (actual !== expected) fail("ACQUISITION_MANIFEST_MISMATCH", artifactId);
}

function receiptPathBinding(paths, artifactId) {
  if (artifactId === "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY") {
    return {
      artifactPath: paths.wave5Intake.artifactPath,
      sourceProfile: { sourceDirectory: paths.wave5Intake.sourceDirectory },
    };
  }
  if (artifactId === "CROSS_STAGE_SIX_LANE_PROGRESS") {
    return {
      artifactPath: paths.progress.artifactPath,
      sourceProfile: clone(paths.progress.sources),
    };
  }
  const lanePath = {
    FDA_MAUDE_OUTCOME_SENSING: paths.fdaMaude,
    CA_DMV_AV_OUTCOME_SENSING: paths.caDmvAv,
    INSTITUTIONAL_CAPITAL_CLAIMS: paths.institutionalCapitalClaims,
    FEMA_REAL_CASES: paths.femaRealCases,
    REMEDY_PAYMENT_RECOVERY: paths.remedyPaymentRecovery,
    NTSB_BLS_REAL_OUTCOME_EXPERIENCE: paths.ntsbBlsOutcome,
    JUDGMENT_FUND_GAO_REAL_CASES: paths.judgmentFundGao,
    NCUA_PBGC_MSHA_REAL_EXPERIENCE: paths.ncuaPbgcMsha,
    CDI_NCIGF_REAL_RATE_GUARANTY: paths.cdiNcigf,
    FRA_PHMSA_REAL_SAFETY_EVIDENCE: paths.fraPhmsa,
    NHTSA_RECALL_REMEDY_STATUS_EVIDENCE: paths.nhtsaRecallRemedy,
    BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE: paths.bridgeDataV2,
    WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE: paths.waymoSafetyImpact,
    CLINICALTRIALS_POSTED_RESULTS_EVIDENCE: paths.clinicalTrials,
  }[artifactId];
  if (!lanePath) fail("SOURCE_PATH_RECEIPT_ADAPTER_MISSING", artifactId);
  return { artifactPath: lanePath.artifactPath, sourceProfile: {
    sourceDirectory: lanePath.sourceDirectory,
  } };
}

export function requireNcuaPbgcMshaFullReceipt(receipt) {
  if (!receipt?.ok || receipt.sourceArtifactsReverified !== true
    || receipt.verificationLevel !== expectedReceipt(
      "NCUA_PBGC_MSHA_REAL_EXPERIENCE").verifierLevel
    || receipt.frozenPublisherRecordRealityEstablished !== true
    || receipt.sourceTruthEstablished !== false
    || receipt.underlyingEventTruthEstablished !== false
    || receipt.publisherAuthorityEstablished !== false
    || receipt.operationalAuthorityEstablished !== false
    || receipt.officialSourceProfileReproduced !== true
    || receipt.candidateArtifactExactlyRebuilt !== true
    || receipt.realCaseOrExperienceAdmissionEstablished !== true
    || receipt.sourceSetHash !== expectedReceipt(
      "NCUA_PBGC_MSHA_REAL_EXPERIENCE").sourceCommitment
    || receipt.artifactHash !== expectedReceipt(
      "NCUA_PBGC_MSHA_REAL_EXPERIENCE").artifactHash
    || receipt.decision?.sourceDomainEvidenceAdmitted !== true
    || receipt.decision?.targetUseAuthorized !== false
    || receipt.decision?.modelTrainingAuthorized !== false
    || receipt.decision?.operationalReadinessCredit !== 0) {
    fail("NCUA_PBGC_MSHA_SOURCE_REPLAY_FAILED",
      receipt?.error ?? receipt?.verificationLevel ?? "RECEIPT_BOUNDARY_INVALID");
  }
}

async function replayAll(paths) {
  /* Authenticate every required canonical artifact before starting any of the
   * expensive source replays. A missing or superseded late lane therefore
   * fails closed before earlier adapters consume minutes of work. */
  const progressLoaded = stableReadJson(paths.progress.artifactPath, "PROGRESS_ARTIFACT");
  const wave5IntakeLoaded = stableReadJson(paths.wave5Intake.artifactPath,
    "WAVE5_INTAKE_ARTIFACT");
  const maudeLoaded = stableReadJson(paths.fdaMaude.artifactPath, "FDA_MAUDE_ARTIFACT");
  const dmvLoaded = stableReadJson(paths.caDmvAv.artifactPath, "CA_DMV_ARTIFACT");
  const capitalLoaded = stableReadJson(paths.institutionalCapitalClaims.artifactPath,
    "INSTITUTIONAL_CAPITAL_ARTIFACT");
  const femaLoaded = stableReadJson(paths.femaRealCases.artifactPath, "FEMA_ARTIFACT");
  const remedyLoaded = stableReadJson(paths.remedyPaymentRecovery.artifactPath,
    "REMEDY_ARTIFACT");
  const ntsbBlsLoaded = stableReadJson(paths.ntsbBlsOutcome.artifactPath,
    "NTSB_BLS_ARTIFACT");
  const judgmentGaoLoaded = stableReadJson(paths.judgmentFundGao.artifactPath,
    "JUDGMENT_FUND_GAO_ARTIFACT");
  const ncuaPbgcMshaLoaded = stableReadJson(paths.ncuaPbgcMsha.artifactPath,
    "NCUA_PBGC_MSHA_ARTIFACT");
  const cdiNcigfLoaded = stableReadJson(paths.cdiNcigf.artifactPath,
    "CDI_NCIGF_ARTIFACT");
  const fraPhmsaLoaded = stableReadJson(paths.fraPhmsa.artifactPath,
    "FRA_PHMSA_ARTIFACT");
  const nhtsaRecallRemedyLoaded = stableReadJson(paths.nhtsaRecallRemedy.artifactPath,
    "NHTSA_RECALL_REMEDY_ARTIFACT");
  const bridgeDataV2Loaded = stableReadJson(paths.bridgeDataV2.artifactPath,
    "BRIDGEDATA_V2_ARTIFACT");
  const waymoSafetyImpactLoaded = stableReadJson(paths.waymoSafetyImpact.artifactPath,
    "WAYMO_SAFETY_IMPACT_ARTIFACT");
  const clinicalTrialsLoaded = stableReadJson(paths.clinicalTrials.artifactPath,
    "CLINICALTRIALS_ARTIFACT");
  const progressArtifact = progressLoaded.value;
  const wave5IntakeArtifact = wave5IntakeLoaded.value;
  const maudeArtifact = maudeLoaded.value;
  const dmvArtifact = dmvLoaded.value;
  const capitalArtifact = capitalLoaded.value;
  const femaArtifact = femaLoaded.value;
  const remedyArtifact = remedyLoaded.value;
  const ntsbBlsArtifact = ntsbBlsLoaded.value;
  const judgmentGaoArtifact = judgmentGaoLoaded.value;
  const ncuaPbgcMshaArtifact = ncuaPbgcMshaLoaded.value;
  const cdiNcigfArtifact = cdiNcigfLoaded.value;
  const fraPhmsaArtifact = fraPhmsaLoaded.value;
  const nhtsaRecallRemedyArtifact = nhtsaRecallRemedyLoaded.value;
  const bridgeDataV2Artifact = bridgeDataV2Loaded.value;
  const waymoSafetyImpactArtifact = waymoSafetyImpactLoaded.value;
  const clinicalTrialsArtifact = clinicalTrialsLoaded.value;

  requirePinnedArtifact(wave5IntakeLoaded, "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY");
  requireSourceCommitment(wave5IntakeArtifact,
    "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY");
  requirePinnedArtifact(progressLoaded, "CROSS_STAGE_SIX_LANE_PROGRESS");
  requireSourceCommitment(progressArtifact, "CROSS_STAGE_SIX_LANE_PROGRESS");
  requirePinnedArtifact(maudeLoaded, "FDA_MAUDE_OUTCOME_SENSING");
  requireSourceCommitment(maudeArtifact, "FDA_MAUDE_OUTCOME_SENSING");
  requirePinnedArtifact(dmvLoaded, "CA_DMV_AV_OUTCOME_SENSING");
  requireSourceCommitment(dmvArtifact, "CA_DMV_AV_OUTCOME_SENSING");
  requirePinnedArtifact(capitalLoaded, "INSTITUTIONAL_CAPITAL_CLAIMS");
  requireSourceCommitment(capitalArtifact, "INSTITUTIONAL_CAPITAL_CLAIMS");
  requirePinnedArtifact(femaLoaded, "FEMA_REAL_CASES");
  requireSourceCommitment(femaArtifact, "FEMA_REAL_CASES");
  requirePinnedArtifact(remedyLoaded, "REMEDY_PAYMENT_RECOVERY");
  requireSourceCommitment(remedyArtifact, "REMEDY_PAYMENT_RECOVERY");
  requirePinnedArtifact(ntsbBlsLoaded, "NTSB_BLS_REAL_OUTCOME_EXPERIENCE");
  requireSourceCommitment(ntsbBlsArtifact, "NTSB_BLS_REAL_OUTCOME_EXPERIENCE");
  requirePinnedArtifact(judgmentGaoLoaded, "JUDGMENT_FUND_GAO_REAL_CASES");
  requireSourceCommitment(judgmentGaoArtifact, "JUDGMENT_FUND_GAO_REAL_CASES");
  requirePinnedArtifact(ncuaPbgcMshaLoaded, "NCUA_PBGC_MSHA_REAL_EXPERIENCE");
  requireSourceCommitment(ncuaPbgcMshaArtifact, "NCUA_PBGC_MSHA_REAL_EXPERIENCE");
  requirePinnedArtifact(cdiNcigfLoaded, "CDI_NCIGF_REAL_RATE_GUARANTY");
  requireSourceCommitment(cdiNcigfArtifact, "CDI_NCIGF_REAL_RATE_GUARANTY");
  requirePinnedArtifact(fraPhmsaLoaded, "FRA_PHMSA_REAL_SAFETY_EVIDENCE");
  requireSourceCommitment(fraPhmsaArtifact, "FRA_PHMSA_REAL_SAFETY_EVIDENCE");
  requireAcquisitionManifest(fraPhmsaArtifact, "FRA_PHMSA_REAL_SAFETY_EVIDENCE");
  requirePinnedArtifact(nhtsaRecallRemedyLoaded, "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE");
  requireSourceCommitment(nhtsaRecallRemedyArtifact,
    "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE");
  requireAcquisitionManifest(nhtsaRecallRemedyArtifact,
    "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE");
  requirePinnedArtifact(bridgeDataV2Loaded,
    "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE");
  requireSourceCommitment(bridgeDataV2Artifact,
    "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE");
  requirePinnedArtifact(waymoSafetyImpactLoaded,
    "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE");
  requireSourceCommitment(waymoSafetyImpactArtifact,
    "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE");
  requirePinnedArtifact(clinicalTrialsLoaded, "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE");
  requireSourceCommitment(clinicalTrialsArtifact,
    "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE");

  if (paths.temporalAudit.manifestPath !== path.resolve(
    STAGE0_SOURCE_TEMPORAL_AUDIT_PATH)) {
    fail("TEMPORAL_AUDIT_PATH_NOT_CANONICAL");
  }
  // Reject altered caller-selected source bytes before replaying the much
  // larger canonical temporal chain. Full replay below still runs on success.
  try { verifyPublicEvidenceWave5Source(paths.progress.sources.wave5); }
  catch { fail("PROGRESS_SOURCE_REPLAY_FAILED"); }
  const temporalAuditFull = await verifyStage0SourceTemporalAuditManifest(
    STAGE0_SOURCE_TEMPORAL_AUDIT_PATH);
  if (!temporalAuditFull.ok
    || temporalAuditFull.verificationLevel
      !== "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE"
    || temporalAuditFull.manifestHash
      !== STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.manifestHash
    || temporalAuditFull.artifactFileHash
      !== STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.artifactFileHash
    || temporalAuditFull.artifactFileBytes
      !== STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.artifactFileBytes
    || temporalAuditFull.temporalQuarantineReceiptCount !== 7
    || temporalAuditFull.temporallyOrderedCurrentReceiptCount !== 9
    || temporalAuditFull.currentCoverageReceiptCount !== 9
    || temporalAuditFull.closureCredit !== false
    || temporalAuditFull.operationalAuthorityGranted !== false) {
    fail("TEMPORAL_AUDIT_FULL_REPLAY_INVALID",
      temporalAuditFull.error ?? temporalAuditFull.verificationLevel);
  }

  const wave5IntakeStandalone = verifyWave5IntakeSnapshot(wave5IntakeArtifact);
  if (!wave5IntakeStandalone.ok
    || wave5IntakeStandalone.verificationLevel !== "STRUCTURE_ONLY"
    || wave5IntakeStandalone.sourceArtifactsReverified !== false) {
    fail("WAVE5_INTAKE_STANDALONE_INVALID");
  }
  const wave5IntakeFull = verifyWave5IntakeSnapshot(wave5IntakeArtifact,
    { sourceDirectory: paths.wave5Intake.sourceDirectory });
  if (!wave5IntakeFull.ok || wave5IntakeFull.sourceArtifactsReverified !== true
    || wave5IntakeFull.verificationLevel !== expectedReceipt(
      "WAVE5_SOURCE_AWARE_INTAKE_TAXONOMY").verifierLevel
    || wave5IntakeArtifact.summary?.rows !== 49
    || wave5IntakeArtifact.summary?.automaticTrainingRows !== 0
    || wave5IntakeArtifact.summary?.pricingEligibleRows !== 0
    || wave5IntakeArtifact.summary?.causalExperienceUnits !== 0) {
    fail("WAVE5_INTAKE_SOURCE_REPLAY_FAILED");
  }

  const progressStandalone = verifyRealEvidenceStageProgress(progressArtifact);
  if (!progressStandalone.ok || progressStandalone.sourceArtifactsReverified !== false) {
    fail("PROGRESS_STANDALONE_INVALID");
  }
  const progressFull = verifyRealEvidenceStageProgressAgainstSources(progressArtifact,
    { sources: paths.progress.sources });
  if (!progressFull.ok || progressFull.sourceArtifactsReverified !== true
    || progressFull.verificationLevel !== expectedReceipt(
      "CROSS_STAGE_SIX_LANE_PROGRESS").verifierLevel) fail("PROGRESS_SOURCE_REPLAY_FAILED");

  const maudeStandalone = verifyFdaMaudeOutcomeSensing(maudeArtifact);
  if (!maudeStandalone.ok || maudeStandalone.sourceArtifactsReverified !== false) {
    fail("FDA_MAUDE_STANDALONE_INVALID");
  }
  const maudeFull = await verifyFdaMaudeOutcomeSensingWithSource(maudeArtifact,
    paths.fdaMaude.sourceDirectory);
  if (!maudeFull.ok || maudeFull.sourceArtifactsReverified !== true
    || maudeFull.verificationLevel !== expectedReceipt(
      "FDA_MAUDE_OUTCOME_SENSING").verifierLevel) fail("FDA_MAUDE_SOURCE_REPLAY_FAILED");

  const dmvStandalone = verifyCaDmvAvOutcomeSensing(dmvArtifact);
  if (!dmvStandalone.ok || dmvStandalone.sourceArtifactsReverified !== false) {
    fail("CA_DMV_STANDALONE_INVALID");
  }
  const dmvFull = verifyCaDmvAvOutcomeSensingWithSource(dmvArtifact,
    paths.caDmvAv.sourceDirectory);
  if (!dmvFull.ok || dmvFull.sourceArtifactsReverified !== true
    || dmvFull.verificationLevel !== expectedReceipt(
      "CA_DMV_AV_OUTCOME_SENSING").verifierLevel) fail("CA_DMV_SOURCE_REPLAY_FAILED");

  const capitalStandalone = verifyInstitutionalCapitalClaimsEvidence(capitalArtifact);
  if (!capitalStandalone.ok || capitalStandalone.sourceArtifactsReverified !== false) {
    fail("INSTITUTIONAL_CAPITAL_STANDALONE_INVALID");
  }
  const capitalFull = verifyInstitutionalCapitalClaimsEvidenceAgainstSource(capitalArtifact,
    { sourceDirectory: paths.institutionalCapitalClaims.sourceDirectory });
  if (!capitalFull.ok || capitalFull.sourceArtifactsReverified !== true
    || capitalFull.verificationLevel !== expectedReceipt(
      "INSTITUTIONAL_CAPITAL_CLAIMS").verifierLevel) {
    fail("INSTITUTIONAL_CAPITAL_SOURCE_REPLAY_FAILED");
  }

  const femaStandalone = verifyFemaRealCasesEvidence(femaArtifact);
  if (!femaStandalone.ok || femaStandalone.sourceArtifactsReverified !== false) {
    fail("FEMA_STANDALONE_INVALID");
  }
  const femaFull = verifyFemaRealCasesEvidenceWithSource(femaArtifact,
    paths.femaRealCases.sourceDirectory);
  if (!femaFull.ok || femaFull.sourceArtifactsReverified !== true
    || femaFull.verificationLevel !== expectedReceipt("FEMA_REAL_CASES").verifierLevel) {
    fail("FEMA_SOURCE_REPLAY_FAILED");
  }

  const remedyStandalone = verifyRemedyPaymentRecoveryEvidence(remedyArtifact);
  if (!remedyStandalone.ok || remedyStandalone.sourceArtifactsReverified !== false) {
    fail("REMEDY_STANDALONE_INVALID");
  }
  const remedyFull = verifyRemedyPaymentRecoveryEvidenceAgainstSource(remedyArtifact,
    { sourceDirectory: paths.remedyPaymentRecovery.sourceDirectory });
  if (!remedyFull.ok || remedyFull.sourceArtifactsReverified !== true
    || remedyFull.verificationLevel !== expectedReceipt(
      "REMEDY_PAYMENT_RECOVERY").verifierLevel) fail("REMEDY_SOURCE_REPLAY_FAILED");

  const ntsbBlsStandalone = verifyNtsbBlsOutcomeEvidence(ntsbBlsArtifact);
  if (!ntsbBlsStandalone.ok || ntsbBlsStandalone.sourceArtifactsReverified !== false
    || ntsbBlsStandalone.candidateArtifactExactlyRebuilt !== false
    || ntsbBlsStandalone.underlyingWorldTruthEstablished !== false
    || ntsbBlsStandalone.institutionalAuthorityEstablished !== false) {
    fail("NTSB_BLS_STANDALONE_INVALID");
  }
  const ntsbBlsFull = verifyNtsbBlsOutcomeEvidenceWithSource(ntsbBlsArtifact,
    paths.ntsbBlsOutcome.sourceDirectory);
  if (!ntsbBlsFull.ok || ntsbBlsFull.sourceArtifactsReverified !== true
    || ntsbBlsFull.verificationLevel !== expectedReceipt(
      "NTSB_BLS_REAL_OUTCOME_EXPERIENCE").verifierLevel
    || ntsbBlsFull.officialSourceProfileReproduced !== true
    || ntsbBlsFull.publisherRecordStatusReproduced !== true
    || ntsbBlsFull.candidateArtifactExactlyRebuilt !== true
    || ntsbBlsFull.sourceTruthEstablished !== false
    || ntsbBlsFull.publisherAuthorityEstablished !== false
    || ntsbBlsFull.underlyingWorldTruthEstablished !== false
    || ntsbBlsFull.institutionalAuthorityEstablished !== false) {
    fail("NTSB_BLS_SOURCE_REPLAY_FAILED");
  }

  const judgmentGaoStandalone = verifyJudgmentFundGaoRealCasesEvidence(judgmentGaoArtifact);
  if (!judgmentGaoStandalone.ok
    || judgmentGaoStandalone.sourceArtifactsReverified !== false
    || judgmentGaoStandalone.publisherIdentityReverified !== false
    || judgmentGaoStandalone.realityStatusReverified !== false
    || judgmentGaoStandalone.authorityEstablished !== false) {
    fail("JUDGMENT_FUND_GAO_STANDALONE_INVALID");
  }
  const judgmentGaoFull = verifyJudgmentFundGaoRealCasesEvidenceWithSource(
    judgmentGaoArtifact, paths.judgmentFundGao.sourceDirectory);
  if (!judgmentGaoFull.ok || judgmentGaoFull.sourceArtifactsReverified !== true
    || judgmentGaoFull.verificationLevel !== expectedReceipt(
      "JUDGMENT_FUND_GAO_REAL_CASES").verifierLevel
    || judgmentGaoFull.publisherIdentityReverified !== true
    || judgmentGaoFull.realityStatusReverified !== true
    || judgmentGaoFull.reportWorkbookRelationshipsAndCellTypesReparsed !== true
    || judgmentGaoFull.formulaCachesUsed !== false
    || judgmentGaoFull.gaoAnnualAggregateParsedFromPinnedOfficialPage !== true
    || judgmentGaoFull.rightsBoundaryReverified !== true
    || judgmentGaoFull.authorityBoundaryVerified !== true
    || judgmentGaoFull.authorityEstablished !== false
    || judgmentGaoFull.sourceObjectSetHash !== expectedReceipt(
      "JUDGMENT_FUND_GAO_REAL_CASES").sourceCommitment
    || judgmentGaoFull.artifactHash !== expectedReceipt(
      "JUDGMENT_FUND_GAO_REAL_CASES").artifactHash) {
    fail("JUDGMENT_FUND_GAO_SOURCE_REPLAY_FAILED");
  }

  const ncuaPbgcMshaStandalone = verifyNcuaPbgcMshaRealExperience(ncuaPbgcMshaArtifact);
  if (!ncuaPbgcMshaStandalone.ok
    || ncuaPbgcMshaStandalone.sourceArtifactsReverified !== false
    || ncuaPbgcMshaStandalone.frozenPublisherRecordRealityEstablished !== false
    || ncuaPbgcMshaStandalone.sourceTruthEstablished !== false
    || ncuaPbgcMshaStandalone.underlyingEventTruthEstablished !== false
    || ncuaPbgcMshaStandalone.publisherAuthorityEstablished !== false
    || ncuaPbgcMshaStandalone.operationalAuthorityEstablished !== false
    || ncuaPbgcMshaStandalone.officialSourceProfileReproduced !== false
    || ncuaPbgcMshaStandalone.candidateArtifactExactlyRebuilt !== false
    || ncuaPbgcMshaStandalone.realCaseOrExperienceAdmissionEstablished !== false) {
    fail("NCUA_PBGC_MSHA_STANDALONE_INVALID");
  }
  const ncuaPbgcMshaFull = verifyNcuaPbgcMshaRealExperienceWithSource(
    ncuaPbgcMshaArtifact, paths.ncuaPbgcMsha.sourceDirectory);
  requireNcuaPbgcMshaFullReceipt(ncuaPbgcMshaFull);

  const cdiNcigfStandalone = verifyCdiNcigfRateGuarantyEvidence(cdiNcigfArtifact);
  if (!cdiNcigfStandalone.ok
    || cdiNcigfStandalone.verificationLevel !== "STRUCTURE_ONLY"
    || cdiNcigfStandalone.sourceArtifactsReverified !== false
    || cdiNcigfStandalone.exactOfficialBytesReplayed !== false
    || cdiNcigfStandalone.candidateArtifactExactlyRebuilt !== false
    || cdiNcigfStandalone.publisherRecordStatusReproduced !== false
    || cdiNcigfStandalone.underlyingWorldTruthIndependentlyEstablished !== false
    || cdiNcigfStandalone.outsiderAuthorityEstablished !== false
    || cdiNcigfStandalone.outsiderCapitalCustodyOrCoverageEstablished !== false
    || cdiNcigfStandalone.realSourceDomainExperienceAdmissionEstablished !== false
    || cdiNcigfStandalone.decision !== null) {
    fail("CDI_NCIGF_STANDALONE_INVALID");
  }
  const cdiNcigfFull = verifyCdiNcigfRateGuarantyEvidenceWithSource(
    cdiNcigfArtifact, paths.cdiNcigf.sourceDirectory);
  if (!cdiNcigfFull.ok || cdiNcigfFull.sourceArtifactsReverified !== true
    || cdiNcigfFull.verificationLevel !== expectedReceipt(
      "CDI_NCIGF_REAL_RATE_GUARANTY").verifierLevel
    || cdiNcigfFull.exactOfficialBytesReplayed !== true
    || cdiNcigfFull.candidateArtifactExactlyRebuilt !== true
    || cdiNcigfFull.publisherRecordStatusReproduced !== true
    || cdiNcigfFull.underlyingWorldTruthIndependentlyEstablished !== false
    || cdiNcigfFull.outsiderAuthorityEstablished !== false
    || cdiNcigfFull.outsiderCapitalCustodyOrCoverageEstablished !== false
    || cdiNcigfFull.realSourceDomainExperienceAdmissionEstablished !== true
    || cdiNcigfFull.decision
      !== "ADMIT_REAL_SOURCE_DOMAIN_RATE_FILING_AND_GUARANTY_FUND_DESCRIPTIVE_EXPERIENCE"
    || cdiNcigfFull.sourceSetHash !== expectedReceipt(
      "CDI_NCIGF_REAL_RATE_GUARANTY").sourceCommitment
    || cdiNcigfFull.artifactHash !== expectedReceipt(
      "CDI_NCIGF_REAL_RATE_GUARANTY").artifactHash) {
    fail("CDI_NCIGF_SOURCE_REPLAY_FAILED");
  }

  const fraPhmsaStandalone = verifyFraPhmsaSafetyEvidence(fraPhmsaArtifact);
  if (!fraPhmsaStandalone.ok
    || fraPhmsaStandalone.verificationLevel !== "STRUCTURE_ONLY"
    || fraPhmsaStandalone.sourceArtifactsReverified !== false
    || fraPhmsaStandalone.sourceTruthEstablished !== false
    || fraPhmsaStandalone.canonicalQueryChainReproduced !== false
    || fraPhmsaStandalone.transportAttested !== false
    || fraPhmsaStandalone.officialSourceProfileReproduced !== false
    || fraPhmsaStandalone.candidateArtifactExactlyRebuilt !== false
    || fraPhmsaStandalone.institutionalAuthorityEstablished !== false
    || fraPhmsaStandalone.realCaseOrExperienceAdmissionEstablished !== false
    || fraPhmsaStandalone.decision !== null) {
    fail("FRA_PHMSA_STANDALONE_INVALID");
  }
  const fraPhmsaFull = verifyFraPhmsaSafetyEvidenceWithSource(
    fraPhmsaArtifact, paths.fraPhmsa.sourceDirectory);
  if (!fraPhmsaFull.ok || fraPhmsaFull.sourceArtifactsReverified !== true
    || fraPhmsaFull.verificationLevel !== expectedReceipt(
      "FRA_PHMSA_REAL_SAFETY_EVIDENCE").verifierLevel
    || fraPhmsaFull.sourceTruthEstablished !== false
    || fraPhmsaFull.canonicalQueryChainReproduced !== true
    || fraPhmsaFull.transportAttested !== false
    || fraPhmsaFull.officialSourceProfileReproduced !== true
    || fraPhmsaFull.candidateArtifactExactlyRebuilt !== true
    || fraPhmsaFull.institutionalAuthorityEstablished !== false
    || fraPhmsaFull.realCaseOrExperienceAdmissionEstablished !== true
    || fraPhmsaFull.decision
      !== "ADMIT_REAL_FRA_SOURCE_DOMAIN_OUTCOME_EXPOSURE_DIAGNOSTICS_AND_DEFER_PHMSA_MODEL_INPUT"
    || fraPhmsaFull.sourceSetHash !== expectedReceipt(
      "FRA_PHMSA_REAL_SAFETY_EVIDENCE").sourceCommitment
    || fraPhmsaFull.acquisitionManifestHash !== expectedReceipt(
      "FRA_PHMSA_REAL_SAFETY_EVIDENCE").acquisitionManifestHash
    || fraPhmsaFull.artifactHash !== expectedReceipt(
      "FRA_PHMSA_REAL_SAFETY_EVIDENCE").artifactHash) {
    fail("FRA_PHMSA_SOURCE_REPLAY_FAILED");
  }

  const nhtsaStandalone = verifyNhtsaRecallRemedyEvidence(nhtsaRecallRemedyArtifact);
  if (!nhtsaStandalone.ok
    || nhtsaStandalone.verificationLevel !== "STRUCTURE_ONLY"
    || nhtsaStandalone.sourceArtifactsReverified !== false
    || nhtsaStandalone.officialSourceProfileReproduced !== false
    || nhtsaStandalone.candidateArtifactExactlyRebuilt !== false
    || nhtsaStandalone.realInstitutionalRecordAdmissionEstablished !== false
    || nhtsaStandalone.underlyingWorldTruthEstablished !== false
    || nhtsaStandalone.affectedPartyReceiptEstablished !== false
    || nhtsaStandalone.institutionalAuthorityEstablished !== false
    || nhtsaStandalone.decision !== null) {
    fail("NHTSA_RECALL_REMEDY_STANDALONE_INVALID");
  }
  const nhtsaFull = await verifyNhtsaRecallRemedyEvidenceWithSource(
    nhtsaRecallRemedyArtifact, paths.nhtsaRecallRemedy.sourceDirectory);
  if (!nhtsaFull.ok || nhtsaFull.sourceArtifactsReverified !== true
    || nhtsaFull.verificationLevel !== expectedReceipt(
      "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE").verifierLevel
    || nhtsaFull.officialSourceProfileReproduced !== true
    || nhtsaFull.candidateArtifactExactlyRebuilt !== true
    || nhtsaFull.canonicalGeneratedAtReproduced !== true
    || nhtsaFull.realInstitutionalRecordAdmissionEstablished !== true
    || nhtsaFull.underlyingWorldTruthEstablished !== false
    || nhtsaFull.independentCausalityEstablished !== false
    || nhtsaFull.affectedPartyReceiptEstablished !== false
    || nhtsaFull.completeRepairEstablished !== false
    || nhtsaFull.lossCalibrationEstablished !== false
    || nhtsaFull.institutionalAuthorityEstablished !== false
    || nhtsaFull.decision !== "ADMIT_REAL_NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE_ONLY"
    || nhtsaFull.artifactHash !== expectedReceipt(
      "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE").artifactHash) {
    fail("NHTSA_RECALL_REMEDY_SOURCE_REPLAY_FAILED");
  }

  const bridgeStandalone = verifyBridgeDataV2TrainingEvidence(bridgeDataV2Artifact);
  if (!bridgeStandalone.ok || bridgeStandalone.verificationLevel
      !== "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION"
    || bridgeStandalone.sourceArtifactsReverified !== false
    || bridgeStandalone.realCaseOrExperienceAdmissionEstablished !== false
    || bridgeStandalone.trainingAdmissionEstablished !== false
    || bridgeStandalone.authorityEstablished !== false) {
    fail("BRIDGEDATA_V2_STANDALONE_INVALID");
  }
  const bridgeFull = verifyBridgeDataV2TrainingEvidenceWithSource(
    bridgeDataV2Artifact, paths.bridgeDataV2.sourceDirectory);
  if (!bridgeFull.ok || bridgeFull.sourceArtifactsReverified !== true
    || bridgeFull.verificationLevel !== expectedReceipt(
      "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE").verifierLevel
    || bridgeFull.sourceProfileReproduced !== true
    || bridgeFull.candidateArtifactExactlyRebuilt !== true
    || bridgeFull.exactPublisherSourceReplayEstablished !== true
    || bridgeFull.realCaseOrExperienceAdmissionEstablished !== true
    || bridgeFull.realPublishedRobotExperienceAdmissionEstablished !== true
    || bridgeFull.independentExperimentalTruthEstablished !== false
    || bridgeFull.underlyingWorldTruthEstablished !== false
    || bridgeFull.trainingAdmissionEstablished !== false
    || bridgeFull.authorityEstablished !== false
    || bridgeDataV2Artifact.sample?.capturedWholeRecords !== 1
    || bridgeDataV2Artifact.sample?.capturedWholeCorpus !== false
    || bridgeDataV2Artifact.dataset?.tfds?.splits?.find(({ name }) => name === "train")
      ?.examples !== 53192
    || bridgeDataV2Artifact.dataset?.tfds?.splits?.find(({ name }) => name === "train")
      ?.shards !== 1024
    || bridgeDataV2Artifact.trainingCandidate?.decision
      !== "HOLD_FOR_SEMANTIC_CONTENT_AND_GOVERNANCE_REVIEW"
    || bridgeDataV2Artifact.trainingCandidate?.trainerRowsEnqueued !== 0
    || bridgeDataV2Artifact.trainingCandidate?.automaticTraining !== false
    || bridgeDataV2Artifact.quality?.fullCorpusSchemaConformanceEstablished !== false
    || bridgeDataV2Artifact.quality?.fullSchemaAndSemanticContractEstablished !== false
    || bridgeDataV2Artifact.quality?.trajectoryCorrelationClustersMaterialized !== false
    || bridgeDataV2Artifact.stage15Evidence?.targetRobotTransferEstablished !== false
    || bridgeDataV2Artifact.modelEntrance?.TRAIN !== false
    || bridgeDataV2Artifact.modelEntrance?.targetDomainFactorAdmission !== false) {
    fail("BRIDGEDATA_V2_SOURCE_REPLAY_FAILED");
  }

  const waymoStandalone = verifyWaymoSafetyImpactEvidence(waymoSafetyImpactArtifact);
  if (!waymoStandalone.ok || waymoStandalone.verificationLevel
      !== "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION"
    || waymoStandalone.sourceArtifactsReverified !== false
    || waymoStandalone.realCaseOrExperienceAdmissionEstablished !== false
    || waymoStandalone.calibrationEstablished !== false
    || waymoStandalone.trainingAdmissionEstablished !== false
    || waymoStandalone.authorityEstablished !== false) {
    fail("WAYMO_SAFETY_IMPACT_STANDALONE_INVALID");
  }
  const waymoFull = verifyWaymoSafetyImpactEvidenceWithSource(
    waymoSafetyImpactArtifact, paths.waymoSafetyImpact.sourceDirectory);
  const waymoNanTokens = Object.values(
    waymoSafetyImpactArtifact.benchmarkComparisons?.publishedNonfiniteNumericTokens ?? {})
    .reduce((sum, count) => sum + count, 0);
  if (!waymoFull.ok || waymoFull.sourceArtifactsReverified !== true
    || waymoFull.verificationLevel !== expectedReceipt(
      "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE").verifierLevel
    || waymoFull.sourceProfileReproduced !== true
    || waymoFull.candidateArtifactExactlyRebuilt !== true
    || waymoFull.exactPublisherSourceReplayEstablished !== true
    || waymoFull.realCaseOrExperienceAdmissionEstablished !== true
    || waymoFull.realPublishedOperationalExperienceAdmissionEstablished !== true
    || waymoFull.independentOutcomeTruthEstablished !== false
    || waymoFull.underlyingWorldTruthEstablished !== false
    || waymoFull.calibrationEstablished !== false
    || waymoFull.trainingAdmissionEstablished !== false
    || waymoFull.authorityEstablished !== false
    || waymoSafetyImpactArtifact.exposure?.displayedRoundedTotalRiderOnlyMiles
      !== "220613000"
    || waymoSafetyImpactArtifact.exposure?.displayedExposureIsExactUnroundedMiles !== false
    || waymoSafetyImpactArtifact.outcomes?.rows !== 1664
    || waymoSafetyImpactArtifact.outcomes?.uniqueSgoReportIds !== 1659
    || waymoSafetyImpactArtifact.outcomes?.duplicateSgoIdVersionPairs !== 3
    || waymoSafetyImpactArtifact.outcomes?.duplicatePairQuarantine
      ?.pairsWithOutcomeFlagConflicts !== 2
    || waymoSafetyImpactArtifact.outcomes?.duplicatePairQuarantine
      ?.pairsWithSuppressedLocationTextConflicts !== 1
    || waymoNanTokens !== 164
    || waymoSafetyImpactArtifact.dynamicBenchmarkInputs
      ?.benchmarkCrashCountConflictKeys !== 489
    || waymoSafetyImpactArtifact.quality?.csv4WindowMismatchPreserved !== true
    || waymoSafetyImpactArtifact.quality?.temporalHoldoutIsRetrospectiveNotProspective
      !== true
    || waymoSafetyImpactArtifact.calibrationReference?.targetTransfer !== false
    || waymoSafetyImpactArtifact.modelEntrance?.PRICE !== false
    || waymoSafetyImpactArtifact.trainingCandidate?.trainerRowsEnqueued !== 0) {
    fail("WAYMO_SAFETY_IMPACT_SOURCE_REPLAY_FAILED");
  }

  const clinicalTrialsStandalone = verifyClinicalTrialsPostedResultsEvidence(
    clinicalTrialsArtifact);
  if (!clinicalTrialsStandalone.ok
    || clinicalTrialsStandalone.verificationLevel
      !== "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION"
    || clinicalTrialsStandalone.sourceArtifactsReverified !== false
    || clinicalTrialsStandalone.realPostedExperienceAdmissionEstablished !== false
    || clinicalTrialsStandalone.independentOutcomeTruthEstablished !== false
    || clinicalTrialsStandalone.targetTransferEstablished !== false
    || clinicalTrialsStandalone.trainingAllowed !== false
    || clinicalTrialsStandalone.authorityEstablished !== false) {
    fail("CLINICALTRIALS_STANDALONE_INVALID");
  }
  const clinicalTrialsFull = verifyClinicalTrialsPostedResultsEvidenceWithSource(
    clinicalTrialsArtifact, paths.clinicalTrials.sourceDirectory);
  if (!clinicalTrialsFull.ok || clinicalTrialsFull.sourceArtifactsReverified !== true
    || clinicalTrialsFull.verificationLevel !== expectedReceipt(
      "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE").verifierLevel
    || clinicalTrialsFull.sourceProfileReproduced !== true
    || clinicalTrialsFull.dataApiSourceProfileReproduced !== true
    || clinicalTrialsFull.rightsTermsSourceReplayed !== false
    || clinicalTrialsFull.candidateArtifactExactlyRebuilt !== true
    || clinicalTrialsFull.realPostedExperienceAdmissionEstablished !== true
    || clinicalTrialsFull.independentOutcomeTruthEstablished !== false
    || clinicalTrialsFull.targetTransferEstablished !== false
    || clinicalTrialsFull.trainingAllowed !== false
    || clinicalTrialsFull.authorityEstablished !== false
    || clinicalTrialsFull.artifactHash !== expectedReceipt(
      "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE").artifactHash
    || clinicalTrialsArtifact.source?.sourceSetHash !== expectedReceipt(
      "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE").sourceCommitment
    || clinicalTrialsArtifact.population?.observedStudyRecords !== 18
    || clinicalTrialsArtifact.population?.completeClosedQueryWindow !== true
    || clinicalTrialsArtifact.realPostedExperience?.studiesWithPostedOutcomeMeasures !== 18
    || clinicalTrialsArtifact.realPostedExperience?.studiesWithPostedAdverseEvents !== 18
    || clinicalTrialsArtifact.realPostedExperience?.crossStudyAffectedCountsPooled !== false
    || clinicalTrialsArtifact.realPostedExperience?.crossStudyRatesCalculated !== false
    || clinicalTrialsArtifact.quality?.sponsorNamesPersistedInDerivedArtifact !== false
    || clinicalTrialsArtifact.quality?.personNamesPersistedInDerivedArtifact !== false
    || clinicalTrialsArtifact.rights?.rightsTermsSourceReplayed !== false
    || clinicalTrialsArtifact.rights?.rightsDetermination
      !== "NOT_ESTABLISHED_URL_ONLY_NOT_REPLAYED"
    || clinicalTrialsArtifact.rights?.attributionRequirementEstablishedByThisArtifact !== false
    || clinicalTrialsArtifact.calibrationReference?.causalEffectEstablished !== false
    || clinicalTrialsArtifact.calibrationReference?.targetDomainTransferEstablished !== false
    || clinicalTrialsArtifact.trainingCandidate?.admittedTrainingRows !== 0
    || clinicalTrialsArtifact.authority?.PRICE !== false) {
    fail("CLINICALTRIALS_SOURCE_REPLAY_FAILED");
  }
}

/** Build the fixed projection without reading sources. Never describes source replay. */
export function buildRealCaseResponsibilityFlywheelProjection(options = {}) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    fail("PROJECTION_OPTIONS_INVALID");
  }
  if (Object.hasOwn(options, "generatedAt")) {
    requireCanonicalFlywheelTime(options.generatedAt);
  }
  return projection();
}

/**
 * Read pinned upstream artifacts, replay every source-aware verifier in this
 * invocation, exact-compare each artifact, and only then return the fixed
 * projection. No caller result, trust boolean, or callback is accepted.
 */
export async function buildRealCaseResponsibilityFlywheelFromSources(options = {}) {
  const keys = Object.hasOwn(options, "generatedAt")
    ? ["sources", "generatedAt"] : ["sources"];
  if (!exactKeys(options, keys)) fail("SOURCE_BUILD_OPTIONS_INVALID");
  if (Object.hasOwn(options, "generatedAt")) {
    requireCanonicalFlywheelTime(options.generatedAt);
  }
  const paths = sourcePathProfile(options.sources);
  await replayAll(paths);
  return projection();
}

/**
 * No-clobber release construction boundary. This accepts one build-entry time
 * so a successor can be materialized before its exact identity becomes the
 * canonical constant. The returned artifact is not canonical until the fixed
 * projection and verifier are updated to its exact time and bytes.
 */
export async function buildRealCaseResponsibilityFlywheelCandidateFromSources(
  options = {}) {
  if (!exactKeys(options, ["sources", "generatedAt"])) {
    fail("CANDIDATE_SOURCE_BUILD_OPTIONS_INVALID");
  }
  const generatedAt = canonicalTime(options.generatedAt);
  if (Date.parse(generatedAt) > Date.now()) fail("CANDIDATE_TIME_IN_FUTURE");
  const paths = sourcePathProfile(options.sources);
  await replayAll(paths);
  return projectionAt(generatedAt);
}

export function verifyRealCaseResponsibilityFlywheel(artifact) {
  try {
    if (artifact == null || typeof artifact !== "object" || Array.isArray(artifact)
      || artifact.schema !== REAL_CASE_RESPONSIBILITY_FLYWHEEL_SCHEMA
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_INVALID");
    requireCanonicalFlywheelTime(artifact.generatedAt);
    const expected = projection();
    if (!same(artifact, expected)) fail("FIXED_PROJECTION_MISMATCH");
    return deepFreeze({
      ok: true,
      verificationLevel: "FIXED_STRUCTURE_QUALITY_POLICY_AND_GAP_MAPPING_ONLY",
      artifactStructureVerified: true,
      qualityPolicyReproduced: true,
      allThirtySixGapMappingsReproduced: true,
      sourceArtifactsReverified: false,
      upstreamArtifactsExactCompared: false,
      fullLaneSourceReplayCompleted: false,
      sourceDomainReferenceEvidenceBound: false,
      targetSpecificGapClosureCredit: 0,
      operationalAuthorityGranted: false,
      artifactHash: artifact.artifactHash,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "INVALID",
      artifactStructureVerified: false,
      qualityPolicyReproduced: false,
      allThirtySixGapMappingsReproduced: false,
      sourceArtifactsReverified: false,
      upstreamArtifactsExactCompared: false,
      fullLaneSourceReplayCompleted: false,
      sourceDomainReferenceEvidenceBound: false,
      targetSpecificGapClosureCredit: 0,
      operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function verifyRealCaseResponsibilityFlywheelAgainstSources(
  artifact, options = {}) {
  const standalone = verifyRealCaseResponsibilityFlywheel(artifact);
  if (!standalone.ok) return standalone;
  try {
    if (!exactKeys(options, ["sources"])) fail("SOURCE_VERIFY_OPTIONS_INVALID");
    const paths = sourcePathProfile(options.sources);
    await replayAll(paths);
    const rebuilt = projection();
    if (!same(artifact, rebuilt)) fail("FULL_SOURCE_REPLAY_ARTIFACT_MISMATCH");
    return deepFreeze({
      ok: true,
      verificationLevel: "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE",
      artifactStructureVerified: true,
      qualityPolicyReproduced: true,
      allThirtySixGapMappingsReproduced: true,
      sourceArtifactsReverified: true,
      upstreamArtifactsExactCompared: true,
      fullLaneSourceReplayCompleted: true,
      replayedArtifactIds: ARTIFACT_RECEIPTS.map(({ artifactId }) => artifactId),
      replayedLaneIds: LANE_SPECS.map(({ laneId }) => laneId),
      replayedReceipts: ARTIFACT_RECEIPTS.map((binding) => ({
        artifactId: binding.artifactId,
        containedLaneIds: [...binding.containedLaneIds],
        artifactPathRole: binding.artifactPathRole,
        sourcePathRole: binding.sourcePathRole,
        ...receiptPathBinding(paths, binding.artifactId),
        artifactFileHash: binding.artifactFileHash,
        artifactFileBytes: binding.artifactFileBytes,
        artifactHash: binding.artifactHash,
        sourceCommitment: binding.sourceCommitment,
        sourceBytesReplayed: true,
        temporalAuthenticityEstablished: binding.temporalAuthenticityEstablished,
        temporalStatus: binding.temporalStatus,
        currentRoutingEligible: binding.currentRoutingEligible,
        currentCoverage: binding.currentCoverage,
        currentTruth: binding.currentTruth,
        currentTruthMeaning: binding.currentTruthMeaning,
        closureCredit: false,
        causalExperienceUnits: 0,
        trainingAdmission: false,
        pricingAdmission: false,
        operationalAuthorityGranted: false,
        ...(binding.acquisitionManifestHash
          ? { acquisitionManifestHash: binding.acquisitionManifestHash } : {}),
        verificationLevel: binding.verifierLevel,
        sourcePathProfileExactMatched: true,
        sourceArtifactsReverified: true,
        canonicalArtifactBytesMatched: true,
        candidateArtifactExactlyRebuilt: true,
      })),
      catalogBinding: {
        catalogHash: rebuilt.gapReferences.catalogHash,
        catalogArtifactFileHash: rebuilt.gapReferences.catalogArtifactFileHash,
        catalogArtifactFileBytes: rebuilt.gapReferences.catalogArtifactFileBytes,
        verificationLevel: rebuilt.gapReferences.catalogVerificationLevel,
        codeFixedCatalogProjectionReproducedInThisCall: true,
        catalogSourceArtifactsReverifiedByCatalogAlone: false,
        catalogLocalArtifactHashesMatchedToFlywheelReceipts: true,
        catalogTemporalQuarantineRowsExcludedFromCurrentCoverage: true,
      },
      temporalAuditBinding: {
        verificationLevel: "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE",
        canonicalRelease: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.canonicalRelease,
        repositoryRelativePath:
          STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.repositoryRelativePath,
        manifestHash: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.manifestHash,
        artifactFileHash: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.artifactFileHash,
        artifactFileBytes: STAGE0_SOURCE_TEMPORAL_AUDIT_CANONICAL.artifactFileBytes,
        sourceArtifactsReverifiedInThisCall: true,
        pinnedReceiptCount: 16,
        sourceReplayedReceiptCount: 16,
        temporallyOrderedCurrentReceiptCount: 9,
        temporalQuarantineReceiptCount: 7,
        currentCoverageReceiptCount: 9,
        temporalQuarantineCurrentCoverage: 0,
        temporalQuarantineClosureCredit: 0,
        temporalQuarantineCausalExperienceUnits: 0,
        temporalQuarantineTrainingAdmission: 0,
        temporalQuarantinePricingAdmission: 0,
        temporalQuarantineOperationalAuthority: 0,
      },
      sourceDomainReferenceEvidenceBound: true,
      underlyingWorldTruthBeyondPublisherSourcesAuthenticated: false,
      targetDomainTransferEstablished: false,
      targetSpecificGapClosureCredit: 0,
      allPinnedReceiptsTemporallyCurrent: false,
      currentCoverageReceiptCount: 9,
      temporalQuarantineReceiptCount: 7,
      operationalAuthorityGranted: false,
      callerVerificationAccepted: false,
      artifactHash: artifact.artifactHash,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "FULL_REQUIRED_LANE_SOURCE_REPLAY_FAILED",
      artifactStructureVerified: true,
      qualityPolicyReproduced: true,
      allThirtySixGapMappingsReproduced: true,
      sourceArtifactsReverified: false,
      upstreamArtifactsExactCompared: false,
      fullLaneSourceReplayCompleted: false,
      sourceDomainReferenceEvidenceBound: false,
      targetSpecificGapClosureCredit: 0,
      operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const REAL_CASE_RESPONSIBILITY_FLYWHEEL_ARTIFACT_RECEIPTS = ARTIFACT_RECEIPTS;
export const REAL_CASE_RESPONSIBILITY_FLYWHEEL_LANE_SPECS = LANE_SPECS;
