/*
 * Fail-closed Stage 2 actuarial model architecture over the frozen, source-aware
 * real-responsibility math layer.
 *
 * The existing factor dictionary is valuable evidence, but it is not a design
 * matrix: every one of its 102 entries is retrospective and none is admitted as
 * a target-domain pre-action predictor.  This module makes that distinction
 * executable, defines an estimand-first component DAG, benchmarks the missing
 * components against actuarial/statistical reference architectures, and adds a
 * bounded source-domain Poisson adequacy diagnostic for FRA calendar-year
 * incident counts with matched train-mile exposure.
 *
 * No path through this module emits a target estimate, premium, price, capital
 * requirement, coverage decision, or operational authority.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, openSync, readFileSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { buildRealCaseGapEvidenceCatalog } from "./outsider-real-case-gap-evidence-catalog.js";
import { createReadinessGapLedger } from "./outsider-readiness-gap-ledger.js";
import {
  buildRealResponsibilityMathDiagnosticsFromSources,
  buildRealResponsibilityMathDiagnosticsProjection,
  REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_GENERATED_AT,
  verifyRealResponsibilityMathDiagnostics,
} from "./outsider-real-responsibility-math-diagnostics.js";

export const ACTUARIAL_MODEL_EVOLUTION_SCHEMA
  = "outsider/actuarial-model-evolution/v1";
export const ACTUARIAL_MODEL_EVOLUTION_GENERATED_AT
  = "2026-08-28T09:23:48.582Z";
export const ACTUARIAL_MODEL_EVOLUTION_CANONICAL_RELEASE = "final-v11";

export const ACTUARIAL_MODEL_EVOLUTION_SUPERSEDED_RELEASES = Object.freeze([
  Object.freeze({ canonicalRelease: "final-v1",
    repositoryRelativePath:
      "artifacts/actuarial-model-evolution-20260822/final-v1/architecture.json",
    artifactHash: "sha256:a5a9a324e1b47c43501f03d4a05c2c0b4b3e552681f6888d9dc7e3da5904f1ee",
    artifactFileHash: "sha256:67dc5c5375336088b9df86e038493fbab246ee3d037ae6b0faa72d44e4103906",
    artifactFileBytes: 80078 }),
  Object.freeze({ canonicalRelease: "final-v2",
    repositoryRelativePath:
      "artifacts/actuarial-model-evolution-20260822/final-v2/architecture.json",
    artifactHash: "sha256:9050c4a339bbdab2a842c87adf8ff458cde0271aebec2891a3a99ba758b94994",
    artifactFileHash: "sha256:77ce0b9654e510a632899a16dbec26c6c738e56025cbda643552b515dee44331",
    artifactFileBytes: 80335 }),
  Object.freeze({ canonicalRelease: "final-v3",
    repositoryRelativePath:
      "artifacts/actuarial-model-evolution-20260822/final-v3/architecture.json",
    artifactHash: "sha256:84a1facbef396e7377150151799763119dffa186b8a6cdbc894f901fdf7a1724",
    artifactFileHash: "sha256:a9888340812f5d2a4c6134e08faee7fcc0ebdcd3573f31a7626b5f5e1026eb24",
    artifactFileBytes: 188142 }),
  Object.freeze({ canonicalRelease: "final-v4",
    repositoryRelativePath:
      "artifacts/actuarial-model-evolution-20260822/final-v4/architecture.json",
    artifactHash: "sha256:ab9a506dabb32bc449d4ada3b9edc51b02e352dc7eb926c5a9b47bf63567afdb",
    artifactFileHash: "sha256:31669d7edc006a3e737a3b7a4bd2fad1d652781b0baf62d8c3455392dd97c945",
    artifactFileBytes: 189804 }),
  Object.freeze({ canonicalRelease: "final-v5",
    repositoryRelativePath:
      "artifacts/actuarial-model-evolution-20260822/final-v5/architecture.json",
    artifactHash: "sha256:ab509051a9c143a21e61ea64cace700da263d0b839b45b897a8cb19057a033f8",
    artifactFileHash: "sha256:197a627349ddb6fc1c96c5dfe3dfd555c7aa2ee066a3f3dd9c37f0441e3b01f2",
    artifactFileBytes: 199230 }),
  Object.freeze({ canonicalRelease: "final-v6",
    repositoryRelativePath:
      "artifacts/actuarial-model-evolution-20260822/final-v6/architecture.json",
    artifactHash: "sha256:e058ac336b7c0fff4512c4bac4943b230430cfe8ba0ecd4f77d57a172b664d9c",
    artifactFileHash: "sha256:6c7197564d50e74ea37b0227f2fba1898198ebf56a1fc6bdb60db42960ce75df",
    artifactFileBytes: 201886 }),
  Object.freeze({ canonicalRelease: "final-v7",
    repositoryRelativePath:
      "artifacts/actuarial-model-evolution-20260822/final-v7/architecture.json",
    artifactHash: "sha256:d39afcb0c65be66636d16cf69c5410f0ea123af326e68a4afae9ab1bbc52dc6f",
    artifactFileHash: "sha256:4297b0c04585d98500bfd2ade0df4e7a32a01f03016041a8a295471d0fefc719",
    artifactFileBytes: 202291 }),
  Object.freeze({ canonicalRelease: "final-v8",
    repositoryRelativePath:
      "artifacts/actuarial-model-evolution-20260828/final-v8/architecture.json",
    artifactHash: "sha256:e5885bf1c52e727d69cfdf1f7441e6d8aa6f73c461372dbe77c5287fa94b10d6",
    artifactFileHash: "sha256:1d4f4b95fedde33652526ef8df4bc883cc8e7f31e598df42f1f27b699c9ad14e",
    artifactFileBytes: 202695 }),
  Object.freeze({ canonicalRelease: "final-v9",
    repositoryRelativePath:
      "artifacts/actuarial-model-evolution-20260828/final-v9/architecture.json",
    artifactHash: "sha256:dd2aa8891a8cd7c5050d00667eb7d554be2b7f6083abc979e8ca2a6c5f76f100",
    artifactFileHash: "sha256:b9b0114f0db1edb235cf834b3abf187bbea04037e77192e573cbfd429c59aab9",
    artifactFileBytes: 203099 }),
  Object.freeze({ canonicalRelease: "final-v10",
    repositoryRelativePath:
      "artifacts/actuarial-model-evolution-20260828/final-v10/architecture.json",
    artifactHash: "sha256:896ede627df32fbb4d2dd43855fbdc23c19d9337b56602db21e0c6c5d603cd2d",
    artifactFileHash: "sha256:2d69b3f472ed2523fc66a7943ec673fdec39494aa8cc4a09f3e5439c533d9be1",
    artifactFileBytes: 203505 }),
]);

export const ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH = Object.freeze({
  repositoryRelativePath:
    "artifacts/real-responsibility-math-diagnostics-20260828/final-v14/diagnostics.json",
  artifactPathRole:
    "FROZEN_CANONICAL_REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_TEMPORAL_QUARANTINE_HOLD_JSON",
  generatedAt: REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_GENERATED_AT,
  artifactHash: "sha256:201199fbaec303e82ae41ea3b5555cbffdc24173536a8a1a33e347e95d01655e",
  artifactFileHash: "sha256:4e582303848e304500344121fbd0a7b415df430db29fb6ba6ab60320b87a70c8",
  artifactFileBytes: 539149,
  factorDictionaryHash:
    "sha256:64edf882a2b06b7050e0c5ec934fc40c3c5838ae114ab975377fb61d203e9456",
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail === null ? `ACTUARIAL_MODEL_EVOLUTION_${code}`
    : `ACTUARIAL_MODEL_EVOLUTION_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail("TIME_INVALID");
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail("TIME_NON_CANONICAL");
  return normalized;
}

function fixedTime(value) {
  const normalized = canonicalTime(value);
  if (normalized !== ACTUARIAL_MODEL_EVOLUTION_GENERATED_AT) {
    fail("GENERATED_AT_NOT_CANONICAL_FIXED_VALUE");
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
    descriptor = openSync(resolved,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size < 2n
      || before.size > BigInt(MAX_ARTIFACT_BYTES)) {
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
    } catch {
      fail("ARTIFACT_JSON_INVALID", code);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function frozenMathProjection() {
  const math = buildRealResponsibilityMathDiagnosticsProjection({
    generatedAt: ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH.generatedAt,
  });
  if (math.artifactHash !== ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH.artifactHash
    || math.factorDictionary.dictionaryHash
      !== ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH.factorDictionaryHash) {
    fail("FROZEN_MATH_CODE_PROJECTION_MISMATCH");
  }
  return math;
}

function readFrozenMathCanonical(filePath) {
  const loaded = stableReadJson(filePath, "FROZEN_MATH_CANONICAL");
  const artifact = loaded.value;
  if (!plain(artifact)
    || artifact.generatedAt !== ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH.generatedAt
    || artifact.artifactHash !== ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH.artifactHash
    || loaded.fileHash !== ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH.artifactFileHash
    || loaded.fileBytes !== ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH.artifactFileBytes
    || artifact.readiness?.status !== "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY"
    || artifact.readiness?.pinnedReceiptCount !== 16
    || artifact.readiness?.temporallyOrderedCurrentReceiptCount !== 9
    || artifact.readiness?.temporalQuarantineReceiptCount !== 7
    || artifact.readiness?.currentCoverageReceiptCount !== 9
    || artifact.readiness?.allPinnedReceiptsTemporallyCurrent !== false
    || artifact.factorAdmissionDiagnostics?.temporalQuarantineReferenceFactorCount !== 40
    || artifact.factorAdmissionDiagnostics?.temporallyOrderedReceiptReferenceFactorCount !== 62
    || artifact.factorAdmissionDiagnostics?.factorsAdmittedForCurrentCoverage !== 0
    || artifact.factorAdmissionDiagnostics?.factorsAdmittedForCurrentRouting !== 0) {
    fail("FROZEN_MATH_CANONICAL_HASH_MISMATCH");
  }
  const checked = verifyRealResponsibilityMathDiagnostics(artifact);
  if (!checked.ok || checked.sourceArtifactsReverified !== false
    || !same(artifact, frozenMathProjection())) {
    fail("FROZEN_MATH_CANONICAL_STRUCTURE_MISMATCH",
      checked.error ?? checked.verificationLevel);
  }
  return artifact;
}

const REFERENCE_SOURCES = deepFreeze([
  {
    referenceId: "ASOP_23_DATA_QUALITY",
    sourceClass: "ADOPTED_ACTUARIAL_STANDARD",
    url: "https://www.actuarialstandardsboard.org/asops/data-quality/",
    designUse: "DATA_SELECTION_REVIEW_LIMITATIONS_AND_DISCLOSURE",
  },
  {
    referenceId: "ASOP_25_CREDIBILITY",
    sourceClass: "ADOPTED_ACTUARIAL_STANDARD",
    url: "https://www.actuarialstandardsboard.org/asops/credibility-procedures/",
    designUse: "RELEVANT_EXPERIENCE_HOMOGENEITY_AND_CREDIBILITY_PROCEDURES",
  },
  {
    referenceId: "ASOP_43_UNPAID_CLAIMS",
    sourceClass: "ADOPTED_ACTUARIAL_STANDARD",
    url: "https://www.actuarialstandardsboard.org/asops/propertycasualty-unpaid-claim-estimates/",
    designUse: "RESERVE_METHOD_MODEL_DATA_RECOVERABLE_AND_EXTERNAL_CONDITION_SCOPE",
  },
  {
    referenceId: "ASOP_53_FUTURE_COSTS",
    sourceClass: "ADOPTED_ACTUARIAL_STANDARD",
    url: "https://www.actuarialstandardsboard.org/asops/estimating-future-costs-prospective-propertycasualty-risk-transfer-risk-retention/",
    designUse: "PROSPECTIVE_COST_ESTIMAND_AND_INTENDED_MEASURE_BOUNDARY",
  },
  {
    referenceId: "ASOP_56_MODELING",
    sourceClass: "ADOPTED_ACTUARIAL_STANDARD",
    url: "https://www.actuarialstandardsboard.org/asops/modeling-3/",
    designUse: "INTENDED_PURPOSE_SPECIFICATION_GOVERNANCE_HOLDOUT_AND_MODEL_RISK",
  },
  {
    referenceId: "CAS_MONOGRAPH_5_GLMS",
    sourceClass: "PROFESSIONAL_PRIMARY_MONOGRAPH",
    url: "https://www.casact.org/publications-research/publications/flagship-publications/cas-monographs",
    designUse: "FREQUENCY_SEVERITY_GLMS_OFFSETS_DIAGNOSTICS_AND_VALIDATION",
  },
  {
    referenceId: "CAS_MONOGRAPHS_3_4_8_RESERVING",
    sourceClass: "PROFESSIONAL_PRIMARY_MONOGRAPH_SERIES",
    url: "https://www.casact.org/publications-research/publications/flagship-publications/cas-monographs",
    designUse: "GLM_ODP_BOOTSTRAP_MACK_BAYESIAN_RESERVING_AND_PREDICTIVE_TESTING",
  },
  {
    referenceId: "MACK_1993_CHAIN_LADDER_MSEP",
    sourceClass: "PRIMARY_PEER_REVIEWED_PAPER",
    url: "https://doi.org/10.2143/AST.23.2.2005092",
    designUse: "DISTRIBUTION_FREE_CHAIN_LADDER_PREDICTION_ERROR",
  },
  {
    referenceId: "BUHLMANN_1967_CREDIBILITY",
    sourceClass: "PRIMARY_PEER_REVIEWED_PAPER",
    url: "https://doi.org/10.1017/S0515036100008989",
    designUse: "HETEROGENEITY_AND_CREDIBILITY_ARCHITECTURE",
  },
  {
    referenceId: "WOOD_2011_GAM_REML",
    sourceClass: "PRIMARY_PEER_REVIEWED_PAPER",
    url: "https://doi.org/10.1111/j.1467-9868.2010.00749.x",
    designUse: "PENALIZED_NONLINEAR_EFFECTS_AND_SMOOTHNESS_SELECTION",
  },
  {
    referenceId: "KAPLAN_MEIER_1958",
    sourceClass: "PRIMARY_PEER_REVIEWED_PAPER",
    url: "https://doi.org/10.1080/01621459.1958.10501452",
    designUse: "RIGHT_CENSORING_AND_TIME_TO_EVENT_ESTIMATION",
  },
  {
    referenceId: "GNEITING_RAFTERY_2007",
    sourceClass: "PRIMARY_PEER_REVIEWED_PAPER",
    url: "https://doi.org/10.1198/016214506000001437",
    designUse: "STRICTLY_PROPER_PROBABILISTIC_FORECAST_SCORING",
  },
]);

function benchmarkFamilies() {
  return deepFreeze([
    {
      familyId: "FREQUENCY_GLM_GAM",
      canonicalForm:
        "log(E[N_i|x_i])=beta_0+x_i^T beta+s(x_i)+log(exposure_i); log(exposure_i) is an offset only under the log link",
      candidateModelsAndDiagnostics: ["POISSON", "NEGATIVE_BINOMIAL", "QUASI_POISSON"],
      laboratoryControls: ["OFFSET", "DISPERSION", "RESIDUALS", "NONLINEARITY",
        "ROOT_DISJOINT_OUT_OF_TIME_VALIDATION"],
      outsiderCurrentState: "SOURCE_DOMAIN_AGGREGATE_ADEQUACY_DIAGNOSTIC_ONLY",
      fitAuthorized: false,
    },
    {
      familyId: "CONDITIONAL_SEVERITY_AND_COMPOUND_LOSS",
      canonicalForm:
        "S=sum_{j=1}^{N}Y_j; generally E[S|x]=sum_n P(N=n|x)sum_{j=1}^n E[Y_j|N=n,x]; only with conditional identical means or exchangeability may the inner sum reduce to nE[Y|N=n,x], and only with conditional mean-independence of N may this further factor as E[N|x]E[Y|x]",
      candidateModelsAndDiagnostics: ["GAMMA", "LOGNORMAL", "TWEEDIE", "MIXTURE_OR_HURDLE"],
      laboratoryControls: ["UNIQUE_LOSS_UNIT", "DEDUCTIBLE_LIMIT_INFLATION_BASIS",
        "TRUNCATION_CENSORING", "TAIL_DIAGNOSTICS", "FREQUENCY_SEVERITY_DEPENDENCE"],
      outsiderCurrentState: "REAL_PAYMENT_FRAGMENTS_NOT_MODEL_READY_SEVERITIES",
      fitAuthorized: false,
    },
    {
      familyId: "CREDIBILITY_HIERARCHICAL",
      canonicalForm: "theta_g~population; observations_g|theta_g with exposure-weighted partial pooling",
      candidateModelsAndDiagnostics: ["BUHLMANN_STRAUB", "GLMM", "BAYESIAN_HIERARCHICAL"],
      laboratoryControls: ["RELEVANT_EXPERIENCE", "HOMOGENEITY", "GROUP_ROOTS",
        "VOLUME_AND_VARIANCE", "TRANSFER_SENSITIVITY"],
      outsiderCurrentState: "NO_TARGET_SUBJECT_EXPERIENCE_AND_NO_ADMISSIBLE_RELEVANT_POOL",
      fitAuthorized: false,
    },
    {
      familyId: "DELAY_SURVIVAL_MULTI_STATE",
      canonicalForm: "S(t)=product_{t_j<=t}(1-d_j/n_j); event->report->pay->close->reopen states",
      candidateModelsAndDiagnostics: ["KAPLAN_MEIER", "COX", "AFT", "COMPETING_RISKS"],
      laboratoryControls: ["INDIVIDUAL_TIME_ORIGIN", "RIGHT_CENSOR_FLAG", "LEFT_TRUNCATION",
        "STATE_TRANSITIONS", "INFORMATIVE_CENSORING_SENSITIVITY"],
      outsiderCurrentState: "AGGREGATE_LATENCY_AND_CENSORING_DESCRIPTIONS_ONLY",
      fitAuthorized: false,
    },
    {
      familyId: "STOCHASTIC_RESERVING",
      canonicalForm: "incremental triangle with accident/development/calendar effects and predictive MSEP",
      candidateModelsAndDiagnostics: ["MACK_CHAIN_LADDER", "ODP_BOOTSTRAP", "RESERVING_GLM",
        "BAYESIAN_MCMC"],
      laboratoryControls: ["TRIANGLE_SCALE", "TAIL", "CALENDAR_EFFECTS", "DEPENDENCE",
        "PAID_INCURRED_RECONCILIATION", "OUT_OF_TIME_BACKTEST"],
      outsiderCurrentState: "CAS_SOURCE_BACKTEST_ONLY_NO_TARGET_TRIANGLE_OR_TAIL",
      fitAuthorized: false,
    },
    {
      familyId: "TAIL_AND_DEPENDENCE",
      canonicalForm: "P(Y-u<=y|Y>u) approximated by GPD; joint roots modeled separately from marginals",
      candidateModelsAndDiagnostics: ["PEAKS_OVER_THRESHOLD_GPD", "COPULA", "SHARED_SHOCK",
        "CATASTROPHE_SCENARIO"],
      laboratoryControls: ["THRESHOLD_STABILITY", "TAIL_SAMPLE_SIZE", "CLUSTER_DECLUSTERING",
        "TAIL_DEPENDENCE", "STRESS_AND_MODEL_RISK"],
      outsiderCurrentState: "NO_ADMISSIBLE_TARGET_TAIL_OR_DEPENDENCE_SAMPLE",
      fitAuthorized: false,
    },
    {
      familyId: "PROBABILISTIC_VALIDATION_UNCERTAINTY_DRIFT",
      canonicalForm: "predict full F_i; score only on preregistered future dependence-root-disjoint outcomes",
      candidateModelsAndDiagnostics: ["LOG_SCORE", "CRPS", "PIT_OR_RANDOMIZED_PIT",
        "INTERVAL_COVERAGE", "CALIBRATION_CURVE"],
      laboratoryControls: ["TRAIN_CALIBRATION_TEST_SEPARATION", "PROPER_SCORE",
        "CALIBRATION_AND_SHARPNESS", "ALEATORIC_PARAMETER_MODEL_DATA_TRANSFER_UNCERTAINTY",
        "DRIFT_THRESHOLDS_AND_RECALIBRATION_GOVERNANCE"],
      outsiderCurrentState: "NO_PREDICTIONS_OR_PROSPECTIVE_TARGET_HOLDOUT",
      fitAuthorized: false,
    },
  ]);
}

function factorRole(factor) {
  if (factor.preActionAvailable === true && factor.outcomeDerived === false) {
    return "PRE_ACTION_PREDICTOR_CANDIDATE";
  }
  if (factor.outcomeDerived === true) {
    return "POST_OUTCOME_LABEL_OR_RETROSPECTIVE_DIAGNOSTIC";
  }
  if (factor.category === "EXPOSURE") {
    return "SOURCE_DOMAIN_EXPOSURE_OFFSET_DESCRIPTOR";
  }
  if (factor.category === "REVISION") {
    return "DATA_REGIME_IDENTITY_OR_DEDUP_CONTROL";
  }
  if (factor.category === "MISSINGNESS") {
    return "SOURCE_DOMAIN_DATA_QUALITY_OR_MISSINGNESS_CONTROL";
  }
  if (factor.category === "CAPITAL" || factor.category === "CUSTODY") {
    return "RESPONSIBILITY_GOVERNANCE_CONSTRAINT";
  }
  fail("FACTOR_ROLE_UNCLASSIFIED", factor.factorId);
}

function factorRoleAudit(math) {
  const dictionary = math.factorDictionary;
  if (dictionary.dictionaryHash
      !== ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH.factorDictionaryHash
    || dictionary.factors.length !== 102
    || math.factorAdmissionDiagnostics.factorCount !== 102
    || math.factorAdmissionDiagnostics.admittedForStatedSourceDomainRetrospectiveUse !== 102
    || math.factorAdmissionDiagnostics.temporalQuarantineReferenceFactorCount !== 40
    || math.factorAdmissionDiagnostics.temporallyOrderedReceiptReferenceFactorCount !== 62
    || math.factorAdmissionDiagnostics.factorsAdmittedForCurrentCoverage !== 0
    || math.factorAdmissionDiagnostics.factorsAdmittedForCurrentRouting !== 0) {
    fail("FACTOR_DICTIONARY_PROFILE_MISMATCH");
  }
  const admission = new Map(math.factorAdmissionDiagnostics.rows
    .map((row) => [row.factorId, row]));
  const rows = dictionary.factors.map((factor) => {
    const admitted = admission.get(factor.factorId);
    if (!admitted || admitted.admittedForStatedSourceDomainRetrospectiveUse !== true
      || admitted.targetDomainUseAdmitted !== false
      || typeof admitted.upstreamArtifactId !== "string"
      || typeof admitted.temporalStatus !== "string"
      || typeof admitted.temporalAuthenticityEstablished !== "boolean"
      || typeof admitted.temporalQuarantineReferenceOnly !== "boolean"
      || admitted.currentCoverageAdmitted !== false
      || admitted.currentRoutingAdmitted !== false
      || factor.targetPredictorEligible !== false || factor.targetPriceEligible !== false) {
      fail("FACTOR_ADMISSION_PROFILE_MISMATCH", factor.factorId);
    }
    const architectureRole = factorRole(factor);
    return {
      factorId: factor.factorId,
      sourceDomain: factor.sourceDomain,
      sourceLaneId: factor.sourceLaneId,
      originalCategory: factor.category,
      temporality: factor.temporality,
      outcomeDerived: factor.outcomeDerived,
      upstreamArtifactId: admitted.upstreamArtifactId,
      temporalStatus: admitted.temporalStatus,
      temporalAuthenticityEstablished: admitted.temporalAuthenticityEstablished,
      temporalQuarantineReferenceOnly: admitted.temporalQuarantineReferenceOnly,
      currentCoverageAdmitted: false,
      currentRoutingAdmitted: false,
      sourceDomainRetrospectiveReferenceUseAdmitted: true,
      sourceSnapshotLabelsDoNotEstablishTemporalCurrentness: true,
      architectureRole,
      usableAsTargetPreActionPredictor: false,
      leakageIfUsedAsTargetPreActionPredictor: factor.outcomeDerived,
      targetTransferEstablished: false,
    };
  });
  const roleCounts = Object.fromEntries([...new Set(rows.map((row) => row.architectureRole))]
    .sort().map((role) => [role, rows.filter((row) => row.architectureRole === role).length]));
  return {
    priorLabel: "TYPED_RETROSPECTIVE_SOURCE_DOMAIN_FACTORS",
    correctedArchitectureMeaning:
      "EVIDENCE_AND_DIAGNOSTIC_FIELDS_NOT_A_TARGET_MODEL_DESIGN_MATRIX",
    factorCount: rows.length,
    sourceDomainRetrospectiveReferenceUsesAdmitted: rows.length,
    temporalQuarantineReferenceFactorCount:
      rows.filter((row) => row.temporalQuarantineReferenceOnly).length,
    temporallyOrderedReceiptReferenceFactorCount:
      rows.filter((row) => !row.temporalQuarantineReferenceOnly).length,
    factorsAdmittedForCurrentCoverage: 0,
    factorsAdmittedForCurrentRouting: 0,
    targetPreActionPredictorCandidatesAdmitted: 0,
    targetPriceFactorsAdmitted: 0,
    postOutcomeLeakageRows: rows.filter((row) => row.leakageIfUsedAsTargetPreActionPredictor).length,
    roleCounts,
    rows,
  };
}

function finiteFixed(value, digits = 9) {
  if (!Number.isFinite(value)) fail("NUMERIC_DIAGNOSTIC_NONFINITE");
  return value.toFixed(digits);
}

function fraPoissonAdequacy(math) {
  const fra = math.sourceDomainDiagnostics.fraCalendarOutcomeExposureRates;
  const annual = fra.annual;
  if (!Array.isArray(annual) || annual.length !== 5
    || fra.pooled.years !== 5 || fra.pooled.uniqueReportedIncidents !== 10449
    || fra.pooled.totalTrainMiles !== "3529396874"
    || fra.pooled.incidentRatePerMillionTrainMilesRecomputed !== "2.960562491"
    || fra.revisionDedupAndDependence.yearsAndOperatorsAssumedIid !== false
    || fra.inferenceBoundary.targetDomainTransferPermitted !== false) {
    fail("FRA_DIAGNOSTIC_PROFILE_MISMATCH");
  }
  const totalCount = annual.reduce((sum, row) => sum + row.uniqueReportedIncidents, 0);
  const totalExposure = annual.reduce((sum, row) => sum + Number(row.totalTrainMiles), 0);
  if (!Number.isSafeInteger(totalCount) || !Number.isSafeInteger(totalExposure)
    || totalCount !== fra.pooled.uniqueReportedIncidents
    || String(totalExposure) !== fra.pooled.totalTrainMiles) {
    fail("FRA_DIAGNOSTIC_AGGREGATE_MISMATCH");
  }
  let pearson = 0;
  let deviance = 0;
  const cells = annual.map((row) => {
    const expected = totalCount * Number(row.totalTrainMiles) / totalExposure;
    const residual = row.uniqueReportedIncidents - expected;
    pearson += residual * residual / expected;
    deviance += 2 * (row.uniqueReportedIncidents
      * Math.log(row.uniqueReportedIncidents / expected) - residual);
    return {
      calendarRoot: row.year,
      observedReportedIncidents: row.uniqueReportedIncidents,
      trainMileExposure: row.totalTrainMiles,
      interceptOnlyPoissonExpected: finiteFixed(expected),
      pearsonResidualContribution: finiteFixed(residual * residual / expected),
    };
  });
  const residualDf = annual.length - 1;
  return {
    diagnosticId: "FRA_INTERCEPT_ONLY_POISSON_EXPOSURE_OFFSET_ADEQUACY",
    sourceDomain: fra.sourceDomain,
    estimand: "PUBLISHER_REPORTED_ABOVE_THRESHOLD_INCIDENT_COUNT_PER_TRAIN_MILE",
    modelUnderDiagnostic:
      "N_y~Poisson(mu_y); log(mu_y)=beta_0+log(train_miles_y)",
    fittedParameterCount: 1,
    calendarRootCount: annual.length,
    totalObservedReportedIncidents: totalCount,
    totalTrainMileExposure: String(totalExposure),
    pooledRatePerMillionTrainMiles: fra.pooled.incidentRatePerMillionTrainMilesRecomputed,
    nominalResidualDf: residualDf,
    pearsonChiSquare: finiteFixed(pearson),
    poissonDispersionPearsonOverNominalDf: finiteFixed(pearson / residualDf),
    poissonDeviance: finiteFixed(deviance),
    cells,
    inferencePValue: null,
    inferencePValueWithheldBecauseCalendarRootsAreNotEstablishedIid: true,
    equidispersedPoissonAdequateClaimed: false,
    negativeBinomialOrTrendFitPerformed: false,
    whyNoEscalatedFit: [
      "ONLY_FIVE_CORRELATED_CALENDAR_ROOTS",
      "ABOVE_THRESHOLD_OPERATOR_REPORTED_POPULATION",
      "NO_OPERATOR_LEVEL_PRE_ACTION_FEATURE_MATRIX_IN_FROZEN_MATH",
      "NO_PROSPECTIVE_ROOT_DISJOINT_HOLDOUT",
      "NO_TARGET_DOMAIN_TRANSFER",
    ],
    admittedUse:
      "SOURCE_DOMAIN_MODEL_MISSPECIFICATION_WARNING_AND_FUTURE_DATA_CONTRACT_DESIGN",
    targetFrequencyEstimate: null,
    priceInput: null,
  };
}

const DAG_NODES = deepFreeze([
  { nodeId: "TARGET_OBSERVATION_CONTRACT", nodeType: "DATA",
    currentState: "MISSING",
    requiredEvidence: "UNIQUE_TARGET_UNIT_EXPOSURE_WINDOW_OUTCOME_REVISION_AND_AS_OF_KEYS" },
  { nodeId: "TARGET_PRE_ACTION_FEATURE_CONTRACT", nodeType: "DATA",
    currentState: "MISSING",
    requiredEvidence: "PROSPECTIVELY_FROZEN_FEATURES_AVAILABLE_BEFORE_ACTION_AND_OUTCOME" },
  { nodeId: "TARGET_DEPENDENCE_ROOT_CONTRACT", nodeType: "DATA",
    currentState: "MISSING",
    requiredEvidence: "SHARED_AGENT_PROVIDER_TASK_TIME_CATASTROPHE_AND_AFFECTED_PARTY_ROOTS" },
  { nodeId: "TARGET_ECONOMIC_LOSS_CONTRACT", nodeType: "DATA",
    currentState: "MISSING",
    requiredEvidence: "UNIQUE_ADJUDICATED_GROSS_RECOVERY_NET_PAYMENT_AND_CURRENCY_BASIS" },
  { nodeId: "TARGET_MULTI_CLOCK_CONTRACT", nodeType: "DATA",
    currentState: "MISSING",
    requiredEvidence: "EVENT_REPORT_ADJUDICATION_PAYMENT_CLOSE_REOPEN_TIMES_AND_CENSOR_FLAGS" },
  { nodeId: "TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE", nodeType: "GOVERNANCE",
    currentState: "MISSING",
    requiredEvidence:
      "DATA_SUBJECT_NOTICE_LAWFUL_BASIS_CONSENT_WITHDRAWAL_AND_OBJECTION_WHERE_APPLICABLE_MINIMIZATION_RETENTION_DELETION_SECURITY_PURPOSE_LIMITATION_AND_REUSE_LICENSE" },
  { nodeId: "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    nodeType: "DATA_GOVERNANCE", currentState: "MISSING",
    requiredEvidence:
      "TARGET_OUTCOME_IDS_INDEPENDENT_SENSOR_PROVENANCE_COMPLETE_SENSOR_COVERAGE_AND_DENOMINATOR_REVISION_AND_DEDUP_CHAIN_CAUSAL_ATTRIBUTION_OR_EXPLICIT_NONCAUSAL_OBLIGATION_BASIS_ADJUDICATION_AND_APPEAL_FINALITY_AFFECTED_PARTY_EVIDENCE_AND_CHALLENGE_LINKAGE" },
  { nodeId: "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    nodeType: "DATA_GOVERNANCE", currentState: "MISSING",
    requiredEvidence:
      "SOURCE_AWARE_EXACT_BYTES_ENTITY_DEVICE_EXECUTION_AND_NATIVE_ITEM_IDENTITY_BINDING_EXTERNAL_OR_PREREGISTERED_TIME_KEY_HISTORY_VERSION_AND_REVISION_LINEAGE_AND_THIRD_PARTY_CHAIN_RECEIPT" },
  { nodeId: "FREQUENCY_MODEL", nodeType: "MODEL", currentState: "BLOCKED",
    requiredEvidence: "MATCHED_COMPLETE_EXPOSURE_AND_ZERO_OUTCOME_WINDOWS_WITH_OFFSET" },
  { nodeId: "SEVERITY_MODEL", nodeType: "MODEL", currentState: "BLOCKED",
    requiredEvidence: "UNIQUE_LOSS_AMOUNTS_WITH_LIMIT_DEDUCTIBLE_INFLATION_AND_TRUNCATION" },
  { nodeId: "DELAY_SURVIVAL_MODEL", nodeType: "MODEL", currentState: "BLOCKED",
    requiredEvidence: "INDIVIDUAL_MULTI_STATE_TIMES_AND_CENSORING_MECHANISM" },
  { nodeId: "RESERVE_MODEL", nodeType: "MODEL", currentState: "BLOCKED",
    requiredEvidence: "TARGET_PAID_INCURRED_TRIANGLES_TAIL_SCALE_CALENDAR_AND_RECOVERABLES" },
  { nodeId: "TAIL_MODEL", nodeType: "MODEL", currentState: "BLOCKED",
    requiredEvidence: "TARGET_TAIL_SAMPLE_THRESHOLD_STABILITY_DECLUSTERING_AND_STRESS" },
  { nodeId: "DEPENDENCE_MODEL", nodeType: "MODEL", currentState: "BLOCKED",
    requiredEvidence: "JOINT_OUTCOMES_AND_STABLE_SHARED_ROOTS_NOT_ROW_COUNT_PROXIES" },
  { nodeId: "PREDICTIVE_DISTRIBUTION", nodeType: "MODEL", currentState: "BLOCKED",
    requiredEvidence: "JOINT_FREQUENCY_SEVERITY_DELAY_TAIL_DEPENDENCE_UNCERTAINTY" },
  { nodeId: "PROSPECTIVE_VALIDATION", nodeType: "VALIDATION", currentState: "MISSING",
    requiredEvidence: "PREREGISTERED_TEMPORAL_DEPENDENCE_ROOT_DISJOINT_HOLDOUT_AND_PROPER_SCORES" },
  { nodeId: "DRIFT_AND_RECALIBRATION", nodeType: "CONTROL", currentState: "MISSING",
    requiredEvidence: "PREREGISTERED_INPUT_LABEL_CALIBRATION_DRIFT_LIMITS_AND_CHANGE_AUTHORITY" },
  { nodeId: "INDEPENDENT_ACTUARIAL_REVIEW", nodeType: "GOVERNANCE", currentState: "MISSING",
    requiredEvidence:
      "QUALIFIED_INDEPENDENT_REVIEW_OF_DATA_MODEL_ASSUMPTIONS_PREDICTIVE_OUTPUT_AND_PROPOSED_PRICE_COVERAGE_CONTRACT_CAPITAL_METHODS_AND_LIMITS" },
  { nodeId: "LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY", nodeType: "GOVERNANCE",
    currentState: "MISSING",
    requiredEvidence:
      "LICENSED_ISSUER_CONTRACT_FORM_CAPITAL_AND_CUSTODY_AUTHORITY_ADJUDICATOR_AND_PAYMENT_EXECUTION_AUTHORITY_DOES_NOT_ESTABLISH_CAPITAL_ADEQUACY_OR_ACTUAL_FUNDING" },
  { nodeId: "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION", nodeType: "DECISION_CONTRACT",
    currentState: "MISSING",
    requiredEvidence:
      "VERIFIED_PREDICTIVE_LOSS_DISTRIBUTION_LIMIT_ATTACHMENT_RETENTION_COVERAGE_EXPENSE_TAX_RISK_MARGIN_AND_CONTRACT_PRICE_DECISION_RULE" },
  { nodeId: "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY", nodeType: "FINANCIAL_GOVERNANCE",
    currentState: "MISSING",
    requiredEvidence:
      "PREREGISTERED_SOLVENCY_HORIZON_CONFIDENCE_STRESS_DEPENDENCE_AND_REQUIRED_CAPITAL_METHOD_PLUS_ACTUAL_FUNDED_SEGREGATED_CUSTODY" },
  { nodeId: "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT", nodeType: "GOVERNANCE",
    currentState: "MISSING",
    requiredEvidence:
      "OWNER_ADOPTION_AUTHENTICATED_PREACTION_GATE_NATIVE_ITEM_BINDING_CORRECTION_DELIVERY_REVOCATION_AND_BYPASS_FAIL_CLOSED_AFFECTED_PARTY_STANDING_CHALLENGE_NONCOMPENSABLE_CONSTRAINTS_CUMULATIVE_BUDGET_CAUSAL_ATTRIBUTION_OR_EXPLICIT_NONCAUSAL_OBLIGATION_CONTINUITY_RECOVERY_REOPEN_AND_CLOSURE" },
  { nodeId: "RESPONSIBILITY_BEARING_DECISION", nodeType: "DECISION", currentState: "BLOCKED",
    requiredEvidence: "ALL_UPSTREAM_COMPONENTS_VERIFIED_FOR_EXACT_INTENDED_PURPOSE" },
]);

const DAG_EDGES = deepFreeze([
  ["TARGET_OBSERVATION_CONTRACT", "FREQUENCY_MODEL"],
  ["TARGET_PRE_ACTION_FEATURE_CONTRACT", "FREQUENCY_MODEL"],
  ["TARGET_DEPENDENCE_ROOT_CONTRACT", "FREQUENCY_MODEL"],
  ["TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE", "FREQUENCY_MODEL"],
  ["TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT", "FREQUENCY_MODEL"],
  ["TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION", "FREQUENCY_MODEL"],
  ["TARGET_OBSERVATION_CONTRACT", "SEVERITY_MODEL"],
  ["TARGET_ECONOMIC_LOSS_CONTRACT", "SEVERITY_MODEL"],
  ["TARGET_PRE_ACTION_FEATURE_CONTRACT", "SEVERITY_MODEL"],
  ["TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE", "SEVERITY_MODEL"],
  ["TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT", "SEVERITY_MODEL"],
  ["TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION", "SEVERITY_MODEL"],
  ["TARGET_OBSERVATION_CONTRACT", "DELAY_SURVIVAL_MODEL"],
  ["TARGET_MULTI_CLOCK_CONTRACT", "DELAY_SURVIVAL_MODEL"],
  ["TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE", "DELAY_SURVIVAL_MODEL"],
  ["TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    "DELAY_SURVIVAL_MODEL"],
  ["TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "DELAY_SURVIVAL_MODEL"],
  ["TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    "TARGET_ECONOMIC_LOSS_CONTRACT"],
  ["TARGET_ECONOMIC_LOSS_CONTRACT", "RESERVE_MODEL"],
  ["TARGET_MULTI_CLOCK_CONTRACT", "RESERVE_MODEL"],
  ["TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE", "RESERVE_MODEL"],
  ["TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION", "RESERVE_MODEL"],
  ["SEVERITY_MODEL", "TAIL_MODEL"],
  ["TARGET_DEPENDENCE_ROOT_CONTRACT", "TAIL_MODEL"],
  ["TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE", "TAIL_MODEL"],
  ["TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION", "TAIL_MODEL"],
  ["FREQUENCY_MODEL", "DEPENDENCE_MODEL"],
  ["SEVERITY_MODEL", "DEPENDENCE_MODEL"],
  ["TARGET_DEPENDENCE_ROOT_CONTRACT", "DEPENDENCE_MODEL"],
  ["TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE", "DEPENDENCE_MODEL"],
  ["TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "DEPENDENCE_MODEL"],
  ["FREQUENCY_MODEL", "PREDICTIVE_DISTRIBUTION"],
  ["SEVERITY_MODEL", "PREDICTIVE_DISTRIBUTION"],
  ["DELAY_SURVIVAL_MODEL", "PREDICTIVE_DISTRIBUTION"],
  ["RESERVE_MODEL", "PREDICTIVE_DISTRIBUTION"],
  ["TAIL_MODEL", "PREDICTIVE_DISTRIBUTION"],
  ["DEPENDENCE_MODEL", "PREDICTIVE_DISTRIBUTION"],
  ["TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE", "PREDICTIVE_DISTRIBUTION"],
  ["PREDICTIVE_DISTRIBUTION", "PROSPECTIVE_VALIDATION"],
  ["TARGET_DEPENDENCE_ROOT_CONTRACT", "PROSPECTIVE_VALIDATION"],
  ["TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    "PROSPECTIVE_VALIDATION"],
  ["TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "PROSPECTIVE_VALIDATION"],
  ["PROSPECTIVE_VALIDATION", "DRIFT_AND_RECALIBRATION"],
  ["PREDICTIVE_DISTRIBUTION", "INDEPENDENT_ACTUARIAL_REVIEW"],
  ["PROSPECTIVE_VALIDATION", "INDEPENDENT_ACTUARIAL_REVIEW"],
  ["PREDICTIVE_DISTRIBUTION", "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"],
  ["TAIL_MODEL", "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"],
  ["DEPENDENCE_MODEL", "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"],
  ["LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY",
    "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"],
  ["PROSPECTIVE_VALIDATION", "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"],
  ["INDEPENDENT_ACTUARIAL_REVIEW", "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"],
  ["DRIFT_AND_RECALIBRATION", "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"],
  ["PREDICTIVE_DISTRIBUTION", "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"],
  ["RESERVE_MODEL", "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"],
  ["TAIL_MODEL", "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"],
  ["DEPENDENCE_MODEL", "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"],
  ["TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION", "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"],
  ["LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY", "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"],
  ["PROSPECTIVE_VALIDATION", "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"],
  ["INDEPENDENT_ACTUARIAL_REVIEW", "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"],
  ["DRIFT_AND_RECALIBRATION", "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"],
  ["DRIFT_AND_RECALIBRATION", "RESPONSIBILITY_BEARING_DECISION"],
  ["INDEPENDENT_ACTUARIAL_REVIEW", "RESPONSIBILITY_BEARING_DECISION"],
  ["LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY", "RESPONSIBILITY_BEARING_DECISION"],
  ["TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE",
    "RESPONSIBILITY_BEARING_DECISION"],
  ["TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    "RESPONSIBILITY_BEARING_DECISION"],
  ["TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "RESPONSIBILITY_BEARING_DECISION"],
  ["TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION", "RESPONSIBILITY_BEARING_DECISION"],
  ["CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY", "RESPONSIBILITY_BEARING_DECISION"],
  ["REALITY_STEWARDSHIP_OBLIGATION_CONTRACT",
    "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"],
  ["REALITY_STEWARDSHIP_OBLIGATION_CONTRACT", "RESPONSIBILITY_BEARING_DECISION"],
]);

const GAP_GATE_ASSIGNMENTS = deepFreeze({
  S05_CURRENT_ARTIFACT_R1_R5_CONFORMANCE: [
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "PROSPECTIVE_VALIDATION",
  ],
  S05_EXTERNAL_USER_REPOSITORIES_AND_SECOND_MACHINES: [
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "PROSPECTIVE_VALIDATION",
  ],
  S05_CORRECTION_EFFECT_AND_FALSE_INTERRUPTION_RATES: [
    "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    "PROSPECTIVE_VALIDATION",
  ],
  S05_CODEX_NATIVE_ITEM_BINDING_AND_CORRECTION_DELIVERY: [
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT",
  ],
  S05_OTHER_WORKER_NATIVE_CONTROL_SURFACES: [
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT",
  ],
  S1_REAL_CONTRIBUTED_RUNS: ["TARGET_OBSERVATION_CONTRACT",
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE"],
  S1_THIRD_PARTY_CHAIN_VERIFICATION: [
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "INDEPENDENT_ACTUARIAL_REVIEW",
  ],
  S1_EXTERNALLY_GOVERNED_TRUST_TIME_RIGHTS_REGISTRY: [
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE",
  ],
  S15_REAL_PROSPECTIVE_DEVICE_CONTROLS: ["TARGET_OBSERVATION_CONTRACT",
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT", "PROSPECTIVE_VALIDATION"],
  S15_INDEPENDENT_OUTCOME_SENSING_AND_PLATFORM_PARAMETERS: [
    "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    "TARGET_OBSERVATION_CONTRACT",
  ],
  S15_DATASET_AND_EXPERIENCE_RIGHTS_EVIDENCE: [
    "TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE",
  ],
  S15_DEVICE_ACQUISITION_ROOT: [
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
  ],
  S15_OWNER_AFFECTED_PARTY_EXPERIMENT_GOVERNANCE: [
    "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT",
    "TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE",
  ],
  S15_RIGHTS_REUSE_GOVERNANCE: ["TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE",
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION"],
  S15_REAL_CAUSAL_JUDGE_SURVIVAL_EVIDENCE: [
    "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    "DELAY_SURVIVAL_MODEL", "PROSPECTIVE_VALIDATION"],
  S2_COMPLETE_ZERO_LOSS_EXPOSURE_WINDOWS: ["TARGET_OBSERVATION_CONTRACT",
    "FREQUENCY_MODEL"],
  S2_ADJUDICATED_ECONOMIC_LOSS_SEVERITY: ["TARGET_ECONOMIC_LOSS_CONTRACT",
    "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT", "SEVERITY_MODEL"],
  S2_EXTERNAL_HOLDOUT_AND_CORRELATION_VALIDATION: ["TARGET_DEPENDENCE_ROOT_CONTRACT",
    "PROSPECTIVE_VALIDATION"],
  S2_PROSPECTIVE_PREACTION_FACTOR_STREAM: ["TARGET_PRE_ACTION_FEATURE_CONTRACT",
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION"],
  S2_INDEPENDENT_ACTUARIAL_REVIEW: ["INDEPENDENT_ACTUARIAL_REVIEW"],
  S2_EXTERNAL_ADJUDICATION_FRAUD_TRUST: [
    "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    "LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY"],
  S2_LEGAL_PRODUCT_CLASSIFICATION: ["LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY",
    "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"],
  S3_REAL_FUNDED_SHADOW_PILOT: ["TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION",
    "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY", "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT",
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION"],
  S3_GATE_BYPASS_REVOCATION_FAILURE_EVIDENCE: [
    "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT", "DRIFT_AND_RECALIBRATION"],
  S3_STANDING_ISSUER_AND_LEGAL_AUTHORITY: ["LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY"],
  S3_RESOURCE_OWNER_ADOPTION: ["REALITY_STEWARDSHIP_OBLIGATION_CONTRACT"],
  S3_CAPITAL_CUSTODY_POLICY_COUNTERPARTIES: ["CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY",
    "LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY"],
  S3_AFFECTED_PARTY_STANDING_POLICY_TERMS: ["REALITY_STEWARDSHIP_OBLIGATION_CONTRACT",
    "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"],
  S4_REAL_EXECUTION_LOSS_CLAIM: ["TARGET_OBSERVATION_CONTRACT",
    "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION",
    "TARGET_ECONOMIC_LOSS_CONTRACT",
    "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT"],
  S4_FINAL_ADJUDICATION_APPEAL_EVIDENCE: [
    "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    "LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY"],
  S4_PAYMENT_AND_RECOVERY_EVIDENCE: ["LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY",
    "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT", "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"],
  S4_LONGITUDINAL_CONSEQUENCE_MATURITY: ["TARGET_MULTI_CLOCK_CONTRACT",
    "DELAY_SURVIVAL_MODEL", "RESERVE_MODEL", "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT"],
  S4_INDEPENDENT_CLAIMS_ADJUDICATOR: ["LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY",
    "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT"],
  S4_CUSTODIAN_PAYMENT_RAIL: ["LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY",
    "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"],
  S4_CLOSURE_REOPENING_AUTHORITY: ["TARGET_MULTI_CLOCK_CONTRACT",
    "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT", "LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY"],
  S4_AFFECTED_PARTY_CHALLENGE_INSTITUTION: ["REALITY_STEWARDSHIP_OBLIGATION_CONTRACT",
    "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT",
    "LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY"],
});

function verifyDag(nodes, edges) {
  const ids = new Set(nodes.map((node) => node.nodeId));
  if (ids.size !== nodes.length) fail("DAG_DUPLICATE_NODE");
  const edgeKeys = new Set(edges.map((edge) => Array.isArray(edge) && edge.length === 2
    ? `${edge[0]}\0${edge[1]}` : "INVALID"));
  if (edgeKeys.size !== edges.length) fail("DAG_DUPLICATE_EDGE");
  const indegree = new Map([...ids].map((id) => [id, 0]));
  const next = new Map([...ids].map((id) => [id, []]));
  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 2
      || !ids.has(edge[0]) || !ids.has(edge[1]) || edge[0] === edge[1]) {
      fail("DAG_EDGE_INVALID");
    }
    next.get(edge[0]).push(edge[1]);
    indegree.set(edge[1], indegree.get(edge[1]) + 1);
  }
  const queue = [...ids].filter((id) => indegree.get(id) === 0).sort();
  const order = [];
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const child of next.get(id)) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) {
        queue.push(child);
        queue.sort();
      }
    }
  }
  if (order.length !== nodes.length) fail("DAG_CYCLE");
  return { acyclic: true, nodeCount: nodes.length, edgeCount: edges.length,
    topologicalOrder: order };
}

function pathExists(edges, from, to) {
  const next = new Map();
  for (const [left, right] of edges) {
    if (!next.has(left)) next.set(left, []);
    next.get(left).push(right);
  }
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === to) return true;
    for (const child of next.get(current) ?? []) {
      if (!seen.has(child)) { seen.add(child); queue.push(child); }
    }
  }
  return false;
}

function gapGateCoverage(math) {
  const frozenCatalog = math.upstreamFlywheelReceipt?.frozenCatalog;
  if (!plain(frozenCatalog) || !HASH.test(frozenCatalog.catalogHash ?? "")
    || typeof frozenCatalog.asOf !== "string") {
    fail("GAP_GATE_CATALOG_BINDING_INVALID");
  }
  const catalog = buildRealCaseGapEvidenceCatalog({ asOf: frozenCatalog.asOf });
  const ledger = createReadinessGapLedger({ asOf: frozenCatalog.asOf });
  const externalLedgerGaps = ledger.gaps
    .filter((gap) => gap.category !== "INTERNAL_ENGINEERING");
  const catalogGapIds = catalog.gaps.map((gap) => gap.gapId).sort();
  const ledgerGapIds = externalLedgerGaps.map((gap) => gap.gapId).sort();
  const assignmentGapIds = Object.keys(GAP_GATE_ASSIGNMENTS).sort();
  if (catalog.catalogHash !== frozenCatalog.catalogHash || catalog.gaps.length !== 36
    || externalLedgerGaps.length !== 36 || !same(catalogGapIds, ledgerGapIds)
    || !same(catalogGapIds, assignmentGapIds)) {
    fail("GAP_GATE_CATALOG_OR_ASSIGNMENT_MISMATCH");
  }
  const nodeIds = new Set(DAG_NODES.map((node) => node.nodeId));
  const finalNode = "RESPONSIBILITY_BEARING_DECISION";
  const ownerClasses = {
    EXTERNAL_EVIDENCE: "EXTERNAL_EVIDENCE_PRODUCER_OR_INDEPENDENT_OBSERVER",
    EXTERNAL_INSTITUTION_AUTHORITY: "AUTHORIZED_EXTERNAL_INSTITUTION",
    EXTERNAL_PLATFORM_CAPABILITY: "PLATFORM_PROVIDER",
  };
  const gapContractNodes = [];
  const gapContractEdges = [];
  const mappings = catalog.gaps.map((gap) => {
    const ledgerGap = externalLedgerGaps.find((row) => row.gapId === gap.gapId);
    const prerequisiteNodeIds = [...GAP_GATE_ASSIGNMENTS[gap.gapId]].sort();
    const closureOwnerClass = ownerClasses[gap.readinessCategory];
    if (!ledgerGap || ledgerGap.stage !== gap.stage
      || ledgerGap.category !== gap.readinessCategory
      || ledgerGap.status !== gap.readinessStatus
      || typeof ledgerGap.title !== "string" || ledgerGap.title.length === 0
      || typeof ledgerGap.closureEvidence !== "string" || ledgerGap.closureEvidence.length === 0
      || typeof ledgerGap.acceptedClosureInterface !== "string"
      || ledgerGap.acceptedClosureInterface.length === 0
      || ledgerGap.genericCallerBooleanAccepted !== false
      || typeof closureOwnerClass !== "string" || prerequisiteNodeIds.length === 0
      || new Set(prerequisiteNodeIds).size !== prerequisiteNodeIds.length
      || prerequisiteNodeIds.some((nodeId) => !nodeIds.has(nodeId)
        || nodeId === finalNode || !pathExists(DAG_EDGES, nodeId, finalNode))) {
      fail("GAP_GATE_PATH_INVALID", gap.gapId);
    }
    const gapContractNodeId = `READINESS_GAP_CONTRACT__${gap.gapId}`;
    const contractBody = {
      gapId: gap.gapId,
      stage: gap.stage,
      readinessCategory: gap.readinessCategory,
      readinessStatus: gap.readinessStatus,
      closureOwnerClass,
      title: ledgerGap.title,
      closureEvidence: ledgerGap.closureEvidence,
      acceptedClosureInterface: ledgerGap.acceptedClosureInterface,
      genericCallerBooleanAccepted: false,
      catalogContributionKind: gap.contributionKind,
      catalogTargetSpecificRemainder: gap.targetSpecificRemainder,
      frozenCatalogHash: catalog.catalogHash,
    };
    const gapContractHash = digest("outsider/actuarial-readiness-gap-contract/v1",
      contractBody);
    gapContractNodes.push({
      nodeId: gapContractNodeId,
      nodeType: "EXTERNAL_READINESS_GAP_CONTRACT",
      currentState: "MISSING",
      requiredEvidence: ledgerGap.closureEvidence,
      acceptedClosureInterface: ledgerGap.acceptedClosureInterface,
      closureOwnerClass,
      genericCallerBooleanAccepted: false,
      gapId: gap.gapId,
      gapContractHash,
    });
    for (const prerequisiteNodeId of prerequisiteNodeIds) {
      gapContractEdges.push([gapContractNodeId, prerequisiteNodeId]);
    }
    return {
      gapId: gap.gapId,
      stage: gap.stage,
      readinessCategory: gap.readinessCategory,
      readinessStatus: gap.readinessStatus,
      closureOwnerClass,
      title: ledgerGap.title,
      exactClosureEvidence: ledgerGap.closureEvidence,
      acceptedClosureInterface: ledgerGap.acceptedClosureInterface,
      genericCallerBooleanAccepted: false,
      catalogContributionKind: gap.contributionKind,
      catalogTargetSpecificRemainder: gap.targetSpecificRemainder,
      gapContractNodeId,
      gapContractHash,
      prerequisiteNodeIds,
      gapClosureClaimedByArchitectureMapping: false,
      outsiderSpecificGapClosed: false,
      everyMappedNodePrecedesResponsibilityDecision: true,
    };
  });
  const allEdges = [...DAG_EDGES, ...gapContractEdges];
  if (gapContractNodes.length !== 36
    || gapContractNodes.some((node) => !pathExists(allEdges, node.nodeId, finalNode))) {
    fail("GAP_SPECIFIC_CONTRACT_PATH_INVALID");
  }
  const coverage = {
    frozenCatalogHash: catalog.catalogHash,
    frozenCatalogAsOf: catalog.asOf,
    catalogGapCount: catalog.gaps.length,
    mappedGapCount: mappings.length,
    gapSpecificContractNodeCount: gapContractNodes.length,
    gapSpecificContractEdgeCount: gapContractEdges.length,
    mappingMeaning:
      "EXACT_FROZEN_LEDGER_CLOSURE_CONTRACT_TO_DAG_DEPENDENCY_ROUTING_NOT_EVIDENCE_CLOSURE_AUTHORITY_OR_PROGRESS_SCORE",
    nodeCompletionSemantics: "ALL_INCOMING_PREREQUISITES_REQUIRED",
    mappings,
    unmappedGapIds: [],
    gapsOutsideResponsibilityArchitectureScope: [],
    everyCatalogGapMappedToAtLeastOneNonFinalPrerequisite: true,
    everyGapHasExactLedgerClosureEvidenceAndAcceptedInterface: true,
    everyGapHasGapSpecificMissingContractNode: true,
    everyMappedPrerequisiteExistsInDag: true,
    everyMappedPrerequisitePrecedesResponsibilityDecision: true,
    everyGapSpecificContractNodePrecedesResponsibilityDecision: true,
    currentOutsiderSpecificGapsClosedByArchitecture: 0,
    gapContractBundleHash: digest("outsider/actuarial-gap-contract-bundle/v1",
      gapContractNodes),
    mappingHash: digest("outsider/actuarial-gap-gate-coverage/v2", mappings),
  };
  return { coverage, gapContractNodes, gapContractEdges };
}

function sourceLaneContributions(math) {
  const d = math.sourceDomainDiagnostics;
  const contributions = [
    {
      lane: "WAVE5_REAL_SOFTWARE",
      contribution:
        "SOURCE_REPLAYED_SESSION_SHAPE_AND_ROS_BUG_FIX_TAXONOMY_WITH_EXPLICIT_RIGHTS_AND_MISSINGNESS",
      modelComponentsAdvanced: [
        "SOURCE_TAXONOMY_AND_MISSINGNESS_CONTRACT_REFERENCE",
      ],
      blocker: d.wave5SourceAwareTaxonomy.rightsAndAdmissionBoundary
        .preActionAvailableRows === 0
        && d.wave5SourceAwareTaxonomy.rightsAndAdmissionBoundary.trainerRowsEnqueued === 0
        ? "RETROSPECTIVE_SOURCE_ONLY_NO_PRE_ACTION_OUTCOME_EXPOSURE_LOSS_TARGET_TRANSFER_OR_REUSE_RIGHTS"
        : "INVALID",
    },
    {
      lane: "FRA_FORM54_FORM55_2015_2019",
      contribution: "MATCHED_CALENDAR_YEAR_REPORTED_INCIDENT_AND_TRAIN_MILE_RATE_DIAGNOSTIC",
      modelComponentsAdvanced: ["SOURCE_DOMAIN_FREQUENCY_ADEQUACY_DIAGNOSTIC"],
      blocker: "FIVE_CORRELATED_ABOVE_THRESHOLD_AGGREGATES_NO_TARGET_TRANSFER",
    },
    {
      lane: "USDA_RMA_CROP_INSURANCE_2024",
      contribution: "REAL_EXPOSURE_PREMIUM_LIABILITY_AND_AGGREGATE_INDEMNITY",
      modelComponentsAdvanced: ["EXPOSURE_AND_AGGREGATE_LOSS_DATA_CONTRACT_REFERENCE"],
      blocker: d.rmaAggregateIndemnity.countQuarantine.reportedLossFrequency === null
        ? "COUNT_ANOMALIES_NONUNIQUE_POLICYHOLDERS_AND_NO_INDIVIDUAL_SEVERITY" : "INVALID",
    },
    {
      lane: "CAS_SCHEDULE_P",
      contribution: "REAL_TRIANGLES_AND_OUT_OF_TIME_LAG10_BACKTEST",
      modelComponentsAdvanced: ["RESERVE_BACKTEST_REFERENCE"],
      blocker: d.casReserveBacktest.boundary.tailFactorFitted === false
        ? "NO_POST_LAG10_TAIL_SCALE_CALENDAR_SHOCK_OR_CROSS_ENTITY_DEPENDENCE" : "INVALID",
    },
    {
      lane: "NFIP_NC_2024_CLAIM_TRANSACTIONS",
      contribution: "REAL_PAYMENT_RECOVERY_AND_EMPIRICAL_TRANSACTION_AMOUNT_DISTRIBUTION",
      modelComponentsAdvanced: ["SEVERITY_AND_PAYMENT_DATA_CONTRACT_REFERENCE"],
      blocker: d.nfipPaymentAndExposure.denominatorBoundary.currentExposureMatchedToHistoricalLoss
        === false ? "UNIQUE_LOSS_UNOBSERVED_AND_2026_EXPOSURE_NOT_MATCHED_TO_2024" : "INVALID",
    },
    {
      lane: "FEMA_PUBLIC_ASSISTANCE_SECOND_APPEALS",
      contribution: "REAL_RIGHT_CENSORING_PENDING_BOUNDS_AND_SIGNED_DECISION_LATENCY",
      modelComponentsAdvanced: ["SURVIVAL_AND_ADJUDICATION_DATA_CONTRACT_REFERENCE"],
      blocker: d.femaAppealAdjudication.rightCensoring.survivalCurveEstimated === false
        ? "FROZEN_MATH_RETAINS_AGGREGATES_NOT_INDIVIDUAL_MULTI_STATE_SURVIVAL_INPUT" : "INVALID",
    },
    {
      lane: "NHTSA_RECALL_REMEDY_2026_08_21",
      contribution: "REAL_CUMULATIVE_REMEDY_STATUS_REVISION_CENSORING_AND_ANOMALIES",
      modelComponentsAdvanced: ["LONGITUDINAL_STATUS_AND_QUALITY_DATA_CONTRACT_REFERENCE"],
      blocker: "MANUFACTURER_STATUS_NOT_INDEPENDENT_REPAIR_RECEIPT_LOSS_OR_CLOSED_COHORT",
    },
    {
      lane: "FDA_MAUDE_PASSIVE_SURVEILLANCE",
      contribution: "REAL_PASSIVE_REPORT_REVISION_MISSINGNESS_AND_EVENT_TYPE_COMPOSITION",
      modelComponentsAdvanced: ["OUTCOME_SENSING_AND_REVISION_DATA_CONTRACT_REFERENCE"],
      blocker: d.maudePassiveOutcomeSensing.boundary.deviceUseDenominatorObserved === false
        ? "NO_DEVICE_USE_DENOMINATOR_CAUSALITY_OR_UNDERREPORTING_RESOLUTION" : "INVALID",
    },
    {
      lane: "CA_DMV_AV_REPORTING",
      contribution: "REAL_REGIME_DATES_LEGACY_MILES_PERMITS_AND_SELECTED_FORMS",
      modelComponentsAdvanced: ["ROBOT_EXPOSURE_REGIME_DATA_CONTRACT_REFERENCE"],
      blocker: d.dmvRegimeExposure.collisionBoundary.completeCollisionManifestObserved === false
        ? "SELECTED_FORMS_NOT_COMPLETE_MANIFEST_OR_PAIRED_NUMERATOR" : "INVALID",
    },
  ];
  const factorLaneByContribution = {
    WAVE5_REAL_SOFTWARE: "WAVE5_REAL_SOFTWARE",
    FRA_FORM54_FORM55_2015_2019: "FRA_FORM54_FORM55_2015_2019",
    USDA_RMA_CROP_INSURANCE_2024: "USDA_RMA_CROP_INSURANCE_EXPERIENCE",
    CAS_SCHEDULE_P: "CAS_SCHEDULE_P_RESERVE_BACKTEST",
    NFIP_NC_2024_CLAIM_TRANSACTIONS: "FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS",
    FEMA_PUBLIC_ASSISTANCE_SECOND_APPEALS: "FEMA_NFIP_CLAIMS_EXPOSURE_APPEALS",
    NHTSA_RECALL_REMEDY_2026_08_21: "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE",
    FDA_MAUDE_PASSIVE_SURVEILLANCE: "FDA_MAUDE_PASSIVE_REPORTS",
    CA_DMV_AV_REPORTING: "CA_DMV_AV_PERMIT_COLLISION_EXPOSURE",
  };
  return contributions.map(({ modelComponentsAdvanced, ...row }) => {
    const factorLane = factorLaneByContribution[row.lane];
    const admission = math.factorAdmissionDiagnostics.rows.find(
      (candidate) => candidate.sourceLaneId === factorLane);
    if (!admission) fail("SOURCE_LANE_TEMPORAL_ADMISSION_MISSING", row.lane);
    return {
      ...row,
      sourceLaneId: factorLane,
      upstreamArtifactId: admission.upstreamArtifactId,
      temporalStatus: admission.temporalStatus,
      temporalAuthenticityEstablished: admission.temporalAuthenticityEstablished,
      temporalQuarantineReferenceOnly: admission.temporalQuarantineReferenceOnly,
      sourceDomainReferenceComponentsSpecified: modelComponentsAdvanced,
      currentModelComponentsAdvanced: [],
      currentModelComponentAdvanced: false,
      currentCoverageAdmitted: false,
      currentRoutingAdmitted: false,
      targetModelAdmission: false,
    };
  });
}

function architectureDefects() {
  return [
    {
      defectId: "FACTOR_LEDGER_CONFLATED_WITH_DESIGN_MATRIX",
      priorFailureMode:
        "102_RETROSPECTIVE_EVIDENCE_ITEMS_COULD_BE_MISREAD_AS_102_MODEL_FEATURES",
      correction: "EXECUTABLE_FACTOR_ROLE_AUDIT_WITH_ZERO_TARGET_PRE_ACTION_PREDICTORS",
    },
    {
      defectId: "NO_EXPLICIT_ESTIMAND_COMPONENT_DAG",
      priorFailureMode: "BOOLEAN_MISSING_REQUIREMENTS_DID_NOT_ENCODE_MODEL_DEPENDENCIES",
      correction: "ACYCLIC_ESTIMAND_DATA_MODEL_VALIDATION_GOVERNANCE_GRAPH",
    },
    {
      defectId: "NO_FORMAL_OBSERVATION_AND_MULTI_CLOCK_CONTRACT",
      priorFailureMode: "EVENT_REPORT_PAYMENT_CLOSE_AND_REOPEN_TIME_COULD_BE_COLLAPSED",
      correction: "SEPARATE_TARGET_OBSERVATION_ECONOMIC_LOSS_AND_MULTI_CLOCK_ROOT_NODES",
    },
    {
      defectId: "NO_DISTRIBUTION_ADEQUACY_TEST",
      priorFailureMode: "DESCRIPTIVE_RATE_COULD_BE_MISTAKEN_FOR_A_POISSON_MODEL",
      correction: "FRA_INTERCEPT_ONLY_EXPOSURE_OFFSET_PEARSON_AND_DEVIANCE_DIAGNOSTIC",
    },
    {
      defectId: "NO_LABORATORY_MODEL_FAMILY_BENCHMARK",
      priorFailureMode: "GLM_GAM_CREDIBILITY_SURVIVAL_RESERVE_TAIL_AND_VALIDATION_GAPS_NOT_COMPARABLE",
      correction: "SEVEN_FAMILY_SPECIFICATION_REQUIREMENT_AND_STATE_MATRIX",
    },
    {
      defectId: "UNCERTAINTY_NOT_COMPONENTIZED",
      priorFailureMode: "NO_EXPLICIT_ALEATORIC_PARAMETER_MODEL_DATA_AND_TRANSFER_UNCERTAINTY_CONTRACT",
      correction: "PREDICTIVE_DISTRIBUTION_AND_PROSPECTIVE_PROPER_SCORE_GATE",
    },
    {
      defectId: "PROMOTION_PREREQUISITES_NOT_EXPLICITLY_DEPENDENCY_BOUND",
      priorFailureMode: "MORE_SOURCE_FACTORS_COULD_APPEAR_TO_ADVANCE_PRICE_READINESS",
      correction:
        "EXPLICIT_CURRENT_OPEN_PREREQUISITES_WITHOUT_CUT_SET_OR_MINIMALITY_CLAIM_AND_NO_FACTOR_COUNT_CREDIT",
    },
    {
      defectId: "ACTUARIAL_READINESS_COULD_BYPASS_REALITY_STEWARDSHIP",
      priorFailureMode:
        "MODEL_REVIEW_CAPITAL_CUSTODY_AND_CLAIMS_AUTHORITY_WERE_SUFFICIENT_GRAPH_PREDECESSORS_TO_RESPONSIBILITY",
      correction:
        "FINAL_RESPONSIBILITY_REQUIRES_OWNER_ADOPTED_AFFECTED_PARTY_CONSTRAINT_ATTRIBUTION_OBLIGATION_CONTINUITY_RECOVERY_REOPEN_AND_CLOSURE_CONTRACT",
    },
    {
      defectId: "RESPONSIBILITY_COULD_BYPASS_TARGET_DATA_RIGHTS",
      priorFailureMode:
        "FINAL_RESPONSIBILITY_DID_NOT_REQUIRE_NOTICE_LAWFUL_BASIS_CONSENT_WITHDRAWAL_OBJECTION_MINIMIZATION_RETENTION_DELETION_OR_REUSE_RIGHTS",
      correction:
        "INDEPENDENT_TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GATE_PRECEDES_EVERY_TARGET_COMPONENT_MODEL_PREDICTIVE_DISTRIBUTION_AND_FINAL_RESPONSIBILITY",
    },
    {
      defectId: "RESPONSIBILITY_COULD_BYPASS_PRICE_CONTRACT_AND_FUNDED_CAPITAL",
      priorFailureMode:
        "LEGAL_CAPITAL_OR_CUSTODY_AUTHORITY_COULD_BE_MISTAKEN_FOR_ADEQUATE_CALCULATED_AND_ACTUALLY_FUNDED_CAPITAL",
      correction:
        "SEPARATE_PRICE_COVERAGE_CONTRACT_DECISION_AND_CAPITAL_ADEQUACY_FUNDED_CUSTODY_NODES_REQUIRE_VALIDATED_REVIEWED_DRIFT_GOVERNED_PREDICTIVE_TAIL_DEPENDENCE_RESERVE_AND_LEGAL_PREDECESSORS",
    },
    {
      defectId: "MODEL_BENCHMARK_FORMULAS_HID_LINK_AND_DEPENDENCE_ASSUMPTIONS",
      priorFailureMode:
        "GENERIC_LINK_OFFSET_AND_TESTED_DEPENDENCE_WORDING_COULD_LICENSE_INVALID_FREQUENCY_SEVERITY_FACTORIZATION",
      correction:
        "LOG_OFFSET_IS_LOG_LINK_SPECIFIC_AND_COMPOUND_MEAN_USES_THE_GENERAL_N_AND_CLAIM_INDEX_EXPECTATION_SUM_WITH_EXCHANGEABILITY_AND_MEAN_INDEPENDENCE_REQUIRED_FOR_SUCCESSIVE_REDUCTIONS",
    },
    {
      defectId: "TARGET_SELF_REPORTS_COULD_IMPERSONATE_INDEPENDENT_OUTCOMES",
      priorFailureMode:
        "OBSERVATION_KEYS_AND_MODEL_REVIEW_DID_NOT_ESTABLISH_INDEPENDENT_SENSING_DEDUP_ADJUDICATION_APPEAL_OR_AFFECTED_PARTY_EVIDENCE",
      correction:
        "INDEPENDENT_TARGET_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT_PRECEDES_LOSS_FREQUENCY_SEVERITY_DELAY_VALIDATION_AND_FINAL_RESPONSIBILITY",
    },
    {
      defectId: "TARGET_RECORDS_LACKED_PROVENANCE_IDENTITY_TIME_TRUST_ROOT",
      priorFailureMode:
        "SELF_REPORTED_OR_POST_HOC_REWRITTEN_RECORDS_COULD_SATISFY_SCHEMA_ONLY_DATA_CONTRACTS",
      correction:
        "SOURCE_AWARE_BYTES_ENTITY_DEVICE_EXECUTION_NATIVE_ITEM_EXTERNAL_TIME_KEY_VERSION_REVISION_AND_THIRD_PARTY_CHAIN_ATTESTATION_PRECEDES_EVERY_TARGET_MODEL_VALIDATION_AND_FINAL_RESPONSIBILITY",
    },
    {
      defectId: "THIRTY_SIX_READINESS_GAPS_NOT_MACHINE_MAPPED_TO_FINAL_PREREQUISITES",
      priorFailureMode:
        "POINT_FIXES_COULD_LEAVE_AN_UNAUDITED_EXTERNAL_EVIDENCE_PLATFORM_OR_INSTITUTIONAL_AUTHORITY_BYPASS",
      correction:
        "FROZEN_CATALOG_AND_LEDGER_BOUND_EXACT_GAP_CONTRACT_NODES_REQUIRE_ALL_THIRTY_SIX_CLOSURE_REQUIREMENTS_INTERFACES_AND_OWNER_CLASSES_TO_FEED_EXISTING_NONFINAL_NODES_WITH_PATHS_TO_FINAL_RESPONSIBILITY",
    },
  ];
}

function modernActuarialContracts() {
  const unavailable = "NO_QUALIFIED_TARGET_RECORDS";
  return {
    typedAssumptionsAndEstimands: {
      contractType: "TARGET_SHIFT_AND_OVERLAP",
      targetPopulationDefined: false,
      targetPolicyDefined: false,
      sourceToTargetOverlapEstimated: false,
      overlapEstimate: null,
      effectiveTargetSampleSize: null,
      supportViolationRate: null,
      strata: [
        { stratum: "RANDOM_ROW", definition:
          "DEPENDENCE_ROOT_DISJOINT_RANDOM_TARGET_ROW_FROM_A_PREREGISTERED_TARGET_FRAME",
        qualifiedRecords: 0, estimand: null, status: unavailable },
        { stratum: "OBSERVED_KNOWN_COMPONENT", definition:
          "PREDECLARED_COMPONENT_CLASS_OBSERVED_BEFORE_ACTION_IN_THE_TARGET_DOMAIN",
        qualifiedRecords: 0, estimand: null, status: unavailable },
        { stratum: "NEW_COMPONENT", definition:
          "COMPONENT_CLASS_ABSENT_FROM_TARGET_TRAINING_BUT_INSIDE_THE_DECLARED_TARGET_DOMAIN",
        qualifiedRecords: 0, estimand: null, status: unavailable },
        { stratum: "NEW_DOMAIN", definition:
          "DOMAIN_OUTSIDE_THE_TARGET_TRAINING_SUPPORT_WITH_SEPARATE_TRANSFER_ASSUMPTIONS",
        qualifiedRecords: 0, estimand: null, status: unavailable },
      ],
      covariateShiftAssumed: false,
      labelShiftAssumed: false,
      conceptInvarianceAssumed: false,
      transportabilityEstablished: false,
      targetEstimate: null,
    },
    fourSegmentConformalRiskControl: {
      contractType: "FOUR_SEGMENT_CRC_BOUNDARY",
      dependenceRootDisjointRequired: true,
      splitDeclaredBeforeOutcomesRequired: true,
      segments: [
        { segment: "TRAIN", qualifiedRows: 0, locked: false, role: "MODEL_FIT_ONLY" },
        { segment: "PROBABILITY_CALIBRATION", qualifiedRows: 0, locked: false,
          role: "PROBABILITY_OR_DISTRIBUTION_CALIBRATION_ONLY" },
        { segment: "RISK_CONTROL_CALIBRATION", qualifiedRows: 0, locked: false,
          role: "NONCONFORMITY_THRESHOLD_AND_RISK_BUDGET_ONLY" },
        { segment: "FINAL_TEST", qualifiedRows: 0, locked: false,
          role: "ONE_WAY_FINAL_EVALUATION_NO_REFIT" },
      ],
      exchangeabilityEstablished: false,
      riskControlGuaranteeEstablished: false,
      calibratedRiskBound: null,
      finalTestScore: null,
    },
    anytimeValidMonitoring: {
      contractType: "APPEND_ONLY_ANYTIME_VALID_MONITOR",
      appendOnlyEventLedgerRequired: true,
      externalSequenceAndTimeAttestationRequired: true,
      predictableBettingOrESupermartingaleRequired: true,
      optionalStoppingSafeClaimEstablished: false,
      alphaSpendingOrEValueRulePredeclared: false,
      monitorStarted: false,
      observations: 0,
      eValue: null,
      confidenceSequence: null,
      alertAuthority: false,
      recalibrationAuthority: false,
    },
    targetCausalAndOffPolicyEvaluation: {
      contractType: "TARGET_CAUSAL_OPE",
      treatmentOrPolicyDefined: false,
      potentialOutcomeEstimandDefined: false,
      consistencyEstablished: false,
      positivityEstablished: false,
      sequentialExchangeabilityEstablished: false,
      interferenceExcludedOrModeled: false,
      behaviorPolicyKnownOrEstimated: false,
      importanceWeightsAudited: false,
      doublyRobustEstimatorEligible: false,
      causalEffectEstimate: null,
      offPolicyValueEstimate: null,
      policyImprovementClaim: false,
    },
    multiStateCompetingRisk: {
      contractType: "AALEN_JOHANSEN_MULTI_STATE_COMPETING_RISK",
      individualStateTransitionsObserved: false,
      leftTruncationModeled: false,
      intervalCensoringModeled: false,
      competingEventsMutuallyTyped: false,
      censoringIndependentOrSensitivityBounded: false,
      transitionIntensityEstimate: null,
      cumulativeIncidenceEstimate: null,
      stateOccupationProbabilityEstimate: null,
      targetDelayOrClosureEstimate: null,
    },
    extremeValueAndTailDependence: {
      contractType: "POT_GPD_AND_TAIL_DEPENDENCE",
      targetThresholdPredeclared: false,
      thresholdStabilityEstablished: false,
      declusteringRuleEstablished: false,
      exceedanceSampleSize: 0,
      gpdShapeEstimate: null,
      gpdScaleEstimate: null,
      returnLevelEstimate: null,
      upperTailDependenceCoefficient: null,
      multivariateTailModelValidated: false,
      targetTailEstimate: null,
    },
    distributionallyRobustSensitivity: {
      contractType: "DRO_SENSITIVITY_NOT_POINT_IDENTIFICATION",
      ambiguitySetType: null,
      ambiguityRadius: null,
      radiusSelectionRulePredeclared: false,
      shiftClassLinkedToTargetEvidence: false,
      worstCaseRiskBound: null,
      robustDecisionValue: null,
      sensitivityOnly: true,
      priceOrAuthorityGranted: false,
    },
    typedUncertaintyDecomposition: {
      contractType: "TYPED_UQ_DECOMPOSITION",
      components: [
        { component: "ALEATORIC", estimate: null, established: false },
        { component: "PARAMETER", estimate: null, established: false },
        { component: "MODEL_FORM", estimate: null, established: false },
        { component: "DATA_QUALITY_AND_MEASUREMENT", estimate: null, established: false },
        { component: "TARGET_TRANSFER", estimate: null, established: false },
        { component: "POLICY_AND_CAUSAL_IDENTIFICATION", estimate: null, established: false },
        { component: "TAIL_AND_DEPENDENCE", estimate: null, established: false },
      ],
      aggregationRule: null,
      totalPredictiveUncertainty: null,
      targetRiskMeasure: null,
      targetEstimate: null,
      price: null,
    },
    globalNullBoundary: {
      qualifiedTargetRecords: 0,
      targetEstimate: null,
      targetModel: null,
      targetLossDistribution: null,
      price: null,
      PRICE: null,
      responsibilityDecision: null,
      responsibility: null,
      authority: false,
      targetTransferEstablished: false,
      trainingAuthorized: false,
      pricingAuthorized: false,
      responsibilityAuthorized: false,
      operationalAuthorityGranted: false,
    },
  };
}

function buildBody(generatedAt, math) {
  const roles = factorRoleAudit(math);
  const benchmarks = benchmarkFamilies();
  const fra = fraPoissonAdequacy(math);
  const gapGraph = gapGateCoverage(math);
  const dagNodes = [...DAG_NODES, ...gapGraph.gapContractNodes];
  const dagEdges = [...DAG_EDGES, ...gapGraph.gapContractEdges];
  const dagCheck = verifyDag(dagNodes, dagEdges);
  const openPrerequisites = DAG_NODES.filter((node) => node.nodeType === "DATA"
    || node.nodeId === "PROSPECTIVE_VALIDATION"
    || node.nodeId === "DRIFT_AND_RECALIBRATION"
    || node.nodeId === "INDEPENDENT_ACTUARIAL_REVIEW"
    || node.nodeId === "LEGAL_CAPITAL_CUSTODY_CLAIMS_AUTHORITY"
    || node.nodeId === "TARGET_DATA_RIGHTS_PRIVACY_AND_REUSE_GOVERNANCE"
    || node.nodeId === "TARGET_INDEPENDENT_OUTCOME_SENSING_AND_ADJUDICATION_CONTRACT"
    || node.nodeId === "TARGET_PROVENANCE_IDENTITY_EXTERNAL_TIME_AND_REVISION_ATTESTATION"
    || node.nodeId === "TARGET_PRICE_COVERAGE_AND_CONTRACT_DECISION"
    || node.nodeId === "CAPITAL_ADEQUACY_AND_FUNDED_CUSTODY"
    || node.nodeId === "REALITY_STEWARDSHIP_OBLIGATION_CONTRACT")
    .map((node) => node.nodeId);
  return {
    schema: ACTUARIAL_MODEL_EVOLUTION_SCHEMA,
    schemaVersion: "2.6.0",
    generatedAt,
    generatedAtTrust:
      "CODE_FIXED_ARCHITECTURE_SNAPSHOT_AS_OF_NOT_BUILD_COMPLETION_OR_EXTERNAL_TIME_ATTESTATION",
    artifactLifecycle: {
      status: "CANONICAL_LOCAL_MODEL_ARCHITECTURE_DIAGNOSTIC_WITH_UPSTREAM_TEMPORAL_HOLD",
      routingStatus: "CANONICAL_RELEASE_TEMPORAL_QUARANTINE_HOLD",
      canonicalRelease: ACTUARIAL_MODEL_EVOLUTION_CANONICAL_RELEASE,
      canonicalRepositoryRelativePath:
        `artifacts/actuarial-model-evolution-20260828/${
          ACTUARIAL_MODEL_EVOLUTION_CANONICAL_RELEASE}/architecture.json`,
      selectionAuthority:
        "CODE_FIXED_RELEASE_PLUS_BYTE_PRESERVING_ADJACENT_SUPERSESSION_MARKERS",
      supersedes: clone(ACTUARIAL_MODEL_EVOLUTION_SUPERSEDED_RELEASES),
      supersededArtifactBytesMustRemainUnmodified: true,
      embeddedLifecycleClaimsInSupersededArtifactsAreOverriddenByAdjacentMarkers: true,
      rawAndCanonicalArtifactsRemainGitignored: true,
      sourceCodeTestsAndDocumentationArePackageEligible: true,
    },
    upstreamMathBinding: {
      ...clone(ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH),
      readinessStatus: math.readiness.status,
      pinnedReceiptCount: math.readiness.pinnedReceiptCount,
      temporallyOrderedCurrentReceiptCount:
        math.readiness.temporallyOrderedCurrentReceiptCount,
      temporalQuarantineReceiptCount: math.readiness.temporalQuarantineReceiptCount,
      currentCoverageReceiptCount: math.readiness.currentCoverageReceiptCount,
      allPinnedReceiptsTemporallyCurrent:
        math.readiness.allPinnedReceiptsTemporallyCurrent,
      temporalAuditManifestHash:
        math.upstreamFlywheelReceipt.temporalAuditBinding.manifestHash,
      temporalQuarantineReferenceFactorCount:
        math.factorAdmissionDiagnostics.temporalQuarantineReferenceFactorCount,
      temporallyOrderedReceiptReferenceFactorCount:
        math.factorAdmissionDiagnostics.temporallyOrderedReceiptReferenceFactorCount,
      factorsAdmittedForCurrentCoverage:
        math.factorAdmissionDiagnostics.factorsAdmittedForCurrentCoverage,
      factorsAdmittedForCurrentRouting:
        math.factorAdmissionDiagnostics.factorsAdmittedForCurrentRouting,
      receiptCurrentCoverageMeaning:
        "ROUTING_RECEIPT_COVERAGE_ONLY_NOT_FACTOR_MODEL_TARGET_OR_WORLD_TRUTH_ADMISSION",
      temporalQuarantineClosureCredit: 0,
      temporalQuarantineCausalExperienceUnits: 0,
      temporalQuarantineTrainingAdmission: 0,
      temporalQuarantinePricingAdmission: 0,
      temporalQuarantineOperationalAuthority: 0,
      standaloneMathProjectionReproduced: true,
      fullSourceReplayRequiredForFullVerification: true,
    },
    epistemicPolicy: {
      realWorldCasesRemainRealWorldEvidence: true,
      collectorOriginIsNotAQualityRank: true,
      evidenceUseAndOperationalAuthorityAreSeparate: true,
      sourceDomainEvidenceDoesNotTransferBySimilarityAlone: true,
      factorQuantityDoesNotCreatePredictiveReadiness: true,
      noSourceLanePooling: true,
      noTargetEstimateOrPriceFromReferenceEvidence: true,
      temporallyQuarantinedReceiptsRemainFrozenReferenceOnly: true,
      temporalQuarantineCannotAdvanceCurrentCoverageRoutingOrModelState: true,
    },
    benchmarkReferenceBoundary: {
      references: clone(REFERENCE_SOURCES),
      browsedReferenceDocumentsAreArchitectureCitationsNotEmpiricalTrainingRows: true,
      referenceCitationDoesNotClaimProfessionalConformanceOrIndependentReview: true,
      currentStandardsMustBeRecheckedAtAnyOperationalUseDate: true,
    },
    architectureDefectsAndCorrections: architectureDefects(),
    readinessGapToPrerequisiteCoverage: gapGraph.coverage,
    factorRoleAudit: roles,
    laboratoryModelFamilyBenchmark: clone(benchmarks),
    modernActuarialContracts: modernActuarialContracts(),
    sourceDomainModelAdequacyDiagnostics: { fraInterceptOnlyPoisson: fra },
    sourceLaneComponentContributions: sourceLaneContributions(math),
    estimandComponentGraph: {
      graphMeaning: "REQUIRED_DEPENDENCIES_NOT_A_PROGRESS_SCORE",
      nodeCompletionSemantics: "ALL_INCOMING_PREREQUISITES_REQUIRED",
      nodes: clone(dagNodes),
      edges: clone(dagEdges),
      verification: dagCheck,
      coreArchitectureNodeCount: DAG_NODES.length,
      gapSpecificContractNodeCount: gapGraph.gapContractNodes.length,
      allTargetNodesClosed: false,
      responsibilityDecisionBlocked: true,
    },
    promotionProtocol: {
      states: ["REAL_SOURCE_REFERENCE", "SOURCE_DOMAIN_DIAGNOSTIC",
        "SOURCE_DOMAIN_MODEL_CANDIDATE", "TARGET_SHADOW_CANDIDATE",
        "PROSPECTIVELY_VALIDATED_TARGET_MODEL", "INDEPENDENTLY_REVIEWED_MODEL",
        "RESPONSIBILITY_AUTHORIZED"],
      currentHighestState: "SOURCE_DOMAIN_DIAGNOSTIC",
      stateIsFrozenReferenceDiagnosticNotCurrentModelCapability: true,
      temporalQuarantineCanAdvanceState: false,
      factorCountCanAdvanceState: false,
      eachTransitionRequiresExactEstimandDataAndGovernanceEvidence: true,
      currentOpenPrerequisites: openPrerequisites,
      currentOpenPrerequisiteCount: openPrerequisites.length,
      currentOpenGapContractPrerequisites:
        gapGraph.gapContractNodes.map((node) => node.nodeId).sort(),
      currentOpenGapContractCount: gapGraph.gapContractNodes.length,
      totalExplicitOpenPrerequisiteNodes:
        openPrerequisites.length + gapGraph.gapContractNodes.length,
      currentOpenPrerequisiteSelection:
        "OPEN_TARGET_DATA_RIGHTS_INDEPENDENT_OUTCOME_PROVENANCE_IDENTITY_TIME_CONTRACTS_PLUS_VALIDATION_DRIFT_REVIEW_LEGAL_PRICE_CONTRACT_FUNDED_CAPITAL_AND_REALITY_STEWARDSHIP_GATES",
      graphTheoreticCutSetComputed: false,
      minimalityClaimed: false,
      targetModelComponentsFitted: 0,
      targetModelComponentsValidated: 0,
      targetModelComponentsIndependentlyReviewed: 0,
      targetModelComponentsAuthorized: 0,
    },
    trainingBoundary: {
      automaticallyAdmittedTargetTrainingRows: 0,
      automaticallyAdmittedTargetPredictors: 0,
      temporalQuarantineReferenceFactors: 40,
      temporallyOrderedReceiptReferenceFactors: 62,
      factorsAdmittedForCurrentCoverage: 0,
      factorsAdmittedForCurrentRouting: 0,
      postOutcomeLeakageRowsPrevented: roles.postOutcomeLeakageRows,
      sourceReferenceFactsRemainAvailableForSchemaAnomalyAndMeasurementDesign: true,
      useAsTargetSupervisionRequiresSeparateClaimSpecificAdmission: true,
    },
    outputs: {
      targetFrequencyEstimate: null,
      targetSeverityEstimate: null,
      targetDelayDistribution: null,
      targetReserveEstimate: null,
      targetTailEstimate: null,
      targetDependenceEstimate: null,
      targetPredictiveDistribution: null,
      premium: null,
      price: null,
      capital: null,
      coverage: null,
      guarantee: null,
    },
    readiness: {
      status: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
      pinnedReceiptCount: 16,
      temporallyOrderedCurrentReceiptCount: 9,
      temporalQuarantineReceiptCount: 7,
      temporalQuarantineReferenceFactorCount: 40,
      temporallyOrderedReceiptReferenceFactorCount: 62,
      currentFactorCoverageAdmission: 0,
      currentFactorRoutingAdmission: 0,
      currentTargetModelAdmission: 0,
      temporalQuarantineClosureCredit: 0,
      temporalQuarantineCausalExperienceUnits: 0,
      temporalQuarantineTrainingAdmission: 0,
      temporalQuarantinePricingAdmission: 0,
      temporalQuarantineOperationalAuthority: 0,
      factorRoleArchitectureEvolved: true,
      estimandComponentDagImplemented: true,
      laboratoryBenchmarkImplemented: true,
      sourceDomainPoissonAdequacyDiagnosticImplemented: true,
      frozenSourceDomainReferenceArchitectureAdvancedWithoutPromotingQuarantinedReceipts:
        true,
      targetObservationContractComplete: false,
      targetPreActionFeatureContractComplete: false,
      targetDataRightsPrivacyAndReuseGovernanceComplete: false,
      targetIndependentOutcomeSensingAndAdjudicationComplete: false,
      targetProvenanceIdentityExternalTimeAndRevisionAttestationComplete: false,
      targetProspectiveHoldoutComplete: false,
      targetModelCalibrated: false,
      targetPriceCoverageAndContractDecisionComplete: false,
      capitalAdequacyAndFundedCustodyComplete: false,
      readyToPrice: false,
      readyToBearResponsibility: false,
    },
    authority: {
      professionalActuarialOpinion: false,
      independentActuarialReview: false,
      targetDomainTransfer: false,
      priceAuthority: false,
      underwritingAuthority: false,
      capitalAuthority: false,
      custodyAuthority: false,
      claimsAuthority: false,
      paymentAuthority: false,
      operationalAuthorityGranted: false,
    },
  };
}

function projectionAt(generatedAt) {
  const fixed = canonicalTime(generatedAt);
  if (Date.parse(fixed) < Date.parse(ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH.generatedAt)) {
    fail("GENERATED_AT_PRECEDES_FROZEN_MATH");
  }
  const math = frozenMathProjection();
  const body = buildBody(fixed, math);
  return deepFreeze({ ...body,
    artifactHash: digest(ACTUARIAL_MODEL_EVOLUTION_SCHEMA, body) });
}

function projection() {
  return projectionAt(fixedTime(ACTUARIAL_MODEL_EVOLUTION_GENERATED_AT));
}

export function buildActuarialModelEvolutionProjection(options = {}) {
  const keys = Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [];
  if (!exactKeys(options, keys)) fail("PROJECTION_OPTIONS_INVALID");
  if (Object.hasOwn(options, "generatedAt")) fixedTime(options.generatedAt);
  return projection();
}

/**
 * Full construction accepts only paths plus the exact math source-path profile.
 * It authenticates the frozen math file and rebuilds the complete upstream math
 * projection from its sources in the same invocation before returning this
 * architecture projection.
 */
async function buildFromSourcesAt(options, generatedAt) {
  const normalizedGeneratedAt = canonicalTime(generatedAt);
  if (Date.parse(normalizedGeneratedAt)
    < Date.parse(ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH.generatedAt)) {
    fail("GENERATED_AT_PRECEDES_FROZEN_MATH");
  }
  const frozen = readFrozenMathCanonical(options.mathArtifactPath);
  const rebuilt = await buildRealResponsibilityMathDiagnosticsFromSources({
    sources: options.mathSources,
    generatedAt: ACTUARIAL_MODEL_EVOLUTION_FROZEN_MATH.generatedAt,
  });
  if (!same(frozen, rebuilt)) fail("FULL_SOURCE_MATH_REBUILD_MISMATCH");
  return projectionAt(normalizedGeneratedAt);
}

export async function buildActuarialModelEvolutionFromSources(options = {}) {
  const keys = Object.hasOwn(options, "generatedAt")
    ? ["mathArtifactPath", "mathSources", "generatedAt"]
    : ["mathArtifactPath", "mathSources"];
  if (!exactKeys(options, keys) || !plain(options.mathSources)) {
    fail("SOURCE_BUILD_OPTIONS_INVALID");
  }
  const generatedAt = fixedTime(
    options.generatedAt ?? ACTUARIAL_MODEL_EVOLUTION_GENERATED_AT);
  return buildFromSourcesAt(options, generatedAt);
}

export async function buildActuarialModelEvolutionCandidateFromSources(options = {}) {
  if (!exactKeys(options, ["mathArtifactPath", "mathSources", "generatedAt"])
    || !plain(options.mathSources)) {
    fail("CANDIDATE_SOURCE_BUILD_OPTIONS_INVALID");
  }
  const generatedAt = canonicalTime(options.generatedAt);
  if (Date.parse(generatedAt) > Date.now()) fail("CANDIDATE_TIME_IN_FUTURE");
  return buildFromSourcesAt(options, generatedAt);
}

export function verifyActuarialModelEvolution(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== ACTUARIAL_MODEL_EVOLUTION_SCHEMA
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_INVALID");
    fixedTime(artifact.generatedAt);
    const expected = projection();
    if (!same(artifact, expected)) fail("FIXED_PROJECTION_MISMATCH");
    return deepFreeze({
      ok: true,
      verificationLevel: "STRUCTURE_ONLY_FIXED_PROJECTION_NO_SOURCE_AUTHENTICATION",
      artifactStructureVerified: true,
      frozenMathProjectionReproduced: true,
      factorRolesRecomputed: true,
      estimandDagRecomputedAndAcyclic: true,
      fraPoissonAdequacyRecomputed: true,
      benchmarkArchitectureReproduced: true,
      typedFactorCount: artifact.factorRoleAudit.factorCount,
      targetPreActionPredictorsAdmitted:
        artifact.factorRoleAudit.targetPreActionPredictorCandidatesAdmitted,
      postOutcomeLeakageRowsPrevented: artifact.factorRoleAudit.postOutcomeLeakageRows,
      targetModelComponentsFitted: 0,
      readinessStatus: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
      pinnedReceiptCount: 16,
      temporallyOrderedCurrentReceiptCount: 9,
      temporalQuarantineReceiptCount: 7,
      temporalQuarantineReferenceFactorCount: 40,
      temporallyOrderedReceiptReferenceFactorCount: 62,
      factorsAdmittedForCurrentCoverage: 0,
      factorsAdmittedForCurrentRouting: 0,
      targetTrainingRowsAdmitted: 0,
      temporalQuarantineClosureCredit: 0,
      temporalQuarantineCausalExperienceUnits: 0,
      temporalQuarantineTrainingAdmission: 0,
      temporalQuarantinePricingAdmission: 0,
      temporalQuarantineOperationalAuthority: 0,
      sourceArtifactsReverified: false,
      frozenMathCanonicalStableRead: false,
      frozenMathCanonicalFileHashVerified: false,
      frozenMathExactlyRebuiltFromSources: false,
      targetDomainTransferEstablished: false,
      operationalAuthorityGranted: false,
      artifactHash: artifact.artifactHash,
    });
  } catch (error) {
    return deepFreeze({
      ok: false, verificationLevel: "INVALID", artifactStructureVerified: false,
      frozenMathProjectionReproduced: false, factorRolesRecomputed: false,
      estimandDagRecomputedAndAcyclic: false, fraPoissonAdequacyRecomputed: false,
      benchmarkArchitectureReproduced: false, sourceArtifactsReverified: false,
      frozenMathCanonicalStableRead: false,
      frozenMathCanonicalFileHashVerified: false,
      frozenMathExactlyRebuiltFromSources: false,
      targetDomainTransferEstablished: false, operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function verifyActuarialModelEvolutionAgainstSources(artifact, options = {}) {
  const standalone = verifyActuarialModelEvolution(artifact);
  if (!standalone.ok) return standalone;
  try {
    if (!exactKeys(options, ["mathArtifactPath", "mathSources"])) {
      fail("SOURCE_VERIFY_OPTIONS_INVALID");
    }
    const rebuilt = await buildActuarialModelEvolutionFromSources({
      mathArtifactPath: options.mathArtifactPath,
      mathSources: options.mathSources,
      generatedAt: artifact.generatedAt,
    });
    if (!same(artifact, rebuilt)) fail("FULL_SOURCE_REBUILD_MISMATCH");
    return deepFreeze({
      ok: true,
      verificationLevel:
        "FULL_SOURCE_REPLAYED_REFERENCE_ARCHITECTURE_WITH_MATH_TEMPORAL_QUARANTINE",
      artifactStructureVerified: true,
      frozenMathProjectionReproduced: true,
      factorRolesRecomputed: true,
      estimandDagRecomputedAndAcyclic: true,
      fraPoissonAdequacyRecomputed: true,
      benchmarkArchitectureReproduced: true,
      typedFactorCount: artifact.factorRoleAudit.factorCount,
      targetPreActionPredictorsAdmitted: 0,
      postOutcomeLeakageRowsPrevented: artifact.factorRoleAudit.postOutcomeLeakageRows,
      targetModelComponentsFitted: 0,
      sourceArtifactsReverified: true,
      frozenMathCanonicalStableRead: true,
      frozenMathCanonicalFileHashVerified: true,
      frozenMathExactlyRebuiltFromSources: true,
      readinessStatus: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
      pinnedReceiptCount: 16,
      temporallyOrderedCurrentReceiptCount: 9,
      temporalQuarantineReceiptCount: 7,
      temporalQuarantineReferenceFactorCount: 40,
      temporallyOrderedReceiptReferenceFactorCount: 62,
      factorsAdmittedForCurrentCoverage: 0,
      factorsAdmittedForCurrentRouting: 0,
      targetTrainingRowsAdmitted: 0,
      temporalQuarantineClosureCredit: 0,
      temporalQuarantineCausalExperienceUnits: 0,
      temporalQuarantineTrainingAdmission: 0,
      temporalQuarantinePricingAdmission: 0,
      temporalQuarantineOperationalAuthority: 0,
      staleOrSupersededMathAccepted: false,
      crossDomainPoolingPerformed: false,
      targetDomainTransferEstablished: false,
      operationalAuthorityGranted: false,
      artifactHash: artifact.artifactHash,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "FULL_SOURCE_REPLAYED_ACTUARIAL_ARCHITECTURE_FAILED",
      artifactStructureVerified: true,
      frozenMathProjectionReproduced: true,
      factorRolesRecomputed: true,
      estimandDagRecomputedAndAcyclic: true,
      fraPoissonAdequacyRecomputed: true,
      benchmarkArchitectureReproduced: true,
      sourceArtifactsReverified: false,
      frozenMathCanonicalStableRead: false,
      frozenMathCanonicalFileHashVerified: false,
      frozenMathExactlyRebuiltFromSources: false,
      targetDomainTransferEstablished: false,
      operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function describeActuarialModelEvolution() {
  const artifact = projection();
  return deepFreeze({
    schema: artifact.schema,
    schemaVersion: artifact.schemaVersion,
    generatedAt: artifact.generatedAt,
    artifactHash: artifact.artifactHash,
    typedRetrospectiveEvidenceFactors: artifact.factorRoleAudit.factorCount,
    targetPreActionPredictorsAdmitted: 0,
    laboratoryBenchmarkFamilies: artifact.laboratoryModelFamilyBenchmark.length,
    estimandGraphNodes: artifact.estimandComponentGraph.verification.nodeCount,
    coreArchitectureNodes: artifact.estimandComponentGraph.coreArchitectureNodeCount,
    gapSpecificContractNodes:
      artifact.estimandComponentGraph.gapSpecificContractNodeCount,
    readinessGapsMappedToExactPrerequisites:
      artifact.readinessGapToPrerequisiteCoverage.mappedGapCount,
    readinessGapsClosedByArchitecture: 0,
    sourceDomainAdequacyDiagnostics:
      Object.keys(artifact.sourceDomainModelAdequacyDiagnostics).length,
    currentHighestPromotionState: artifact.promotionProtocol.currentHighestState,
    targetModelComponentsFitted: 0,
    targetPrice: null,
    readyToBearResponsibility: false,
  });
}
