/*
 * Three-axis ontology for public agent and physical-AI evidence.
 *
 * Environment reality, evidence authority, and permitted use are deliberately
 * independent. A recorded execution in a simulator is empirical without being
 * a real-world consequence. A real physical observation is not automatically
 * causal, loss, pricing, or control evidence. SHADOW_RESEARCH is a permitted
 * use, never a statement about source reality.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const PUBLIC_EVIDENCE_ONTOLOGY_SCHEMAS = Object.freeze({
  classification: "outsider/public-evidence-ontology-classification/v1",
  catalog: "outsider/public-evidence-ontology-catalog/v1",
  reference: "outsider/public-evidence-ontology-reference/v1",
});

export const ENVIRONMENT_REALITY_CLASSES = Object.freeze([
  "ORGANIC", "REAL_PHYSICAL", "REAL_SOFTWARE", "CONTROLLED_REAL_APP",
  "SIMULATION", "SYNTHETIC",
]);

export const EVIDENCE_AUTHORITY_LEVELS = Object.freeze([
  "SELF_REPORTED", "PUBLISHER_DECLARED", "HUMAN_REVIEWED", "SOURCE_REPLAYED",
  "PROSPECTIVE", "ADJUDICATED",
]);

export const OBSERVATION_ORIGINS = Object.freeze([
  "RECORDED_EXECUTION", "RECORDED_INTERACTION", "RECORDED_PHYSICAL_OBSERVATION",
  "PUBLISHER_INCIDENT_REPORT", "METADATA_ONLY", "GENERATED_BENCHMARK",
]);

export const EMPIRICAL_STATUSES = Object.freeze([
  "EMPIRICAL_RECORDED", "PUBLISHER_METADATA_ONLY", "GENERATED_SYNTHETIC",
]);

export const COLLECTION_MODES = Object.freeze([
  "ORGANIC", "CONTROLLED", "SIMULATED", "GENERATED",
]);

export const RIGHTS_BOUNDARY_FIELDS = Object.freeze([
  "licenseDeclaration", "sourceBytesRightsBasis", "consentOrCollectionAuthority",
  "reuseOrTrainingRights", "adapterGrantsRights", "legalConclusion",
]);

export const PERMITTED_USE_CLASSES = Object.freeze([
  "DESCRIPTIVE", "SHADOW_RESEARCH", "CAUSAL", "LOSS", "PRICE",
  "PRODUCTION_MODEL", "AUTOMATIC_TRAINING", "CONTROL", "GUARANTEE", "SETTLE",
]);

export const PUBLIC_EVIDENCE_ONTOLOGY_INVARIANTS = Object.freeze([
  "ENVIRONMENT_REALITY_DOES_NOT_GRANT_EVIDENCE_AUTHORITY",
  "SOURCE_REPLAY_PROVES_DECLARED_SCOPE_BYTES_OR_DERIVATION_NOT_SOURCE_TRUTH",
  "HUMAN_REVIEW_DOES_NOT_IMPLY_FORMAL_ADJUDICATION",
  "EMPIRICAL_RECORDED_DOES_NOT_IMPLY_REAL_WORLD_CONSEQUENCE",
  "SHADOW_RESEARCH_IS_PERMITTED_USE_NOT_SOURCE_REALITY",
  "RIGHTS_BOUNDARY_DOES_NOT_GRANT_EVIDENCE_OR_PRODUCTION_AUTHORITY",
  "LICENSE_OR_PUBLIC_ACCESS_DOES_NOT_GRANT_CAUSAL_LOSS_PRICE_OR_CONTROL_AUTHORITY",
]);

const ALLOWED_USES = Object.freeze(["DESCRIPTIVE", "SHADOW_RESEARCH"]);

const SOURCE_DEFINITIONS = Object.freeze([
  source({
    id: "OpenHands/openhands-feedback",
    revision: "facf45600d625510b98222ec584a8c9ac59272a2",
    family: "PUBLIC_AGENT_WAVE1",
    legacySourceClass: "organic-user-agent-interaction-feedback",
    classes: ["ORGANIC", "REAL_SOFTWARE"], primaryClass: "ORGANIC",
    liveActionSubstrate: true, collectionMode: "ORGANIC",
    observationOrigin: "RECORDED_INTERACTION", empiricalStatus: "EMPIRICAL_RECORDED",
    consequenceObservation: "NATIVE_FEEDBACK_ONLY",
    basis: "PUBLISHER_RECORDS_AND_SELECTED_LOGICAL_REPLAY",
    levels: ["SELF_REPORTED", "PUBLISHER_DECLARED", "SOURCE_REPLAYED"],
    sourceReplayScope: "SELECTED_LOGICAL_PROJECTION",
    humanReviewScope: null,
    descriptiveScope: "ORGANIC_AGENT_INTERACTION_AND_USER_PREFERENCE_COUNTS",
    shadowScope: "NON_PRODUCTION_INTERACTION_PATTERN_RESEARCH",
  }),
  source({
    id: "xlangai/computer-agent-arena",
    revision: "897b9f45287c516a44f9e79879b14bc3c1bc5b0a",
    family: "PUBLIC_AGENT_WAVE1",
    legacySourceClass: "real-user-task-controlled-agent-evaluation",
    classes: ["REAL_SOFTWARE", "CONTROLLED_REAL_APP"],
    primaryClass: "CONTROLLED_REAL_APP",
    liveActionSubstrate: true, collectionMode: "CONTROLLED",
    observationOrigin: "RECORDED_EXECUTION", empiricalStatus: "EMPIRICAL_RECORDED",
    consequenceObservation: "HUMAN_REVIEWED_TASK_LABEL",
    basis: "PINNED_SOURCE_REPLAY_AND_PUBLISHER_DOCUMENTATION",
    levels: ["PUBLISHER_DECLARED", "HUMAN_REVIEWED", "SOURCE_REPLAYED"],
    sourceReplayScope: "FULL_SELECTED_SOURCE_OBJECTS",
    humanReviewScope: "TASK_CORRECTNESS_LABELS_PUBLISHER_DECLARED_NOT_ADJUDICATED",
    descriptiveScope: "CONTROLLED_REAL_APP_ACTION_AND_HUMAN_CORRECTNESS_COUNTS",
    shadowScope: "NON_PRODUCTION_TASK_OUTCOME_ASSOCIATION_RESEARCH",
  }),
  source({
    id: "uw-syfi/TraceLab",
    revision: "fc061574a0f9700ccf88be33112adc8e86b425fa",
    family: "PUBLIC_AGENT_WAVE1",
    legacySourceClass: "organic-sanitized-agent-telemetry",
    classes: ["ORGANIC", "REAL_SOFTWARE"], primaryClass: "ORGANIC",
    liveActionSubstrate: true, collectionMode: "ORGANIC",
    observationOrigin: "RECORDED_INTERACTION", empiricalStatus: "EMPIRICAL_RECORDED",
    consequenceObservation: "NO_TASK_OUTCOME",
    basis: "PINNED_RELEASE_SOURCE_REPLAY_AND_PUBLISHER_DOCUMENTATION",
    levels: ["PUBLISHER_DECLARED", "SOURCE_REPLAYED"],
    sourceReplayScope: "FULL_SELECTED_SOURCE_OBJECTS",
    humanReviewScope: null,
    descriptiveScope: "ORGANIC_SANITIZED_AGENT_TELEMETRY_COUNTS",
    shadowScope: "NON_PRODUCTION_USAGE_AND_TRACE_SHAPE_RESEARCH",
  }),
  source({
    id: "nebius/SWE-rebench-openhands-trajectories",
    revision: "35455389ab51bf5e2306bfd436ef72d0f98bf882",
    family: "PUBLIC_AGENT_WAVE1",
    legacySourceClass: "benchmark-agent-rollout-on-real-github-issue",
    classes: ["REAL_SOFTWARE", "CONTROLLED_REAL_APP"],
    primaryClass: "CONTROLLED_REAL_APP",
    liveActionSubstrate: true, collectionMode: "CONTROLLED",
    observationOrigin: "RECORDED_EXECUTION", empiricalStatus: "EMPIRICAL_RECORDED",
    consequenceObservation: "BENCHMARK_OUTCOME_ONLY",
    basis: "PUBLISHER_RECORDS_AND_SELECTED_LOGICAL_REPLAY",
    levels: ["PUBLISHER_DECLARED", "SOURCE_REPLAYED"],
    sourceReplayScope: "SELECTED_LOGICAL_PROJECTION",
    humanReviewScope: null,
    descriptiveScope: "REAL_REPOSITORY_CONTROLLED_ROLLOUT_AND_TEST_OUTCOME_COUNTS",
    shadowScope: "NON_PRODUCTION_SOFTWARE_TASK_PROXY_RESEARCH",
  }),
  source({
    id: "AI45Research/ATBench-Codex",
    revision: "0991350e2f7ad174fae5fb8f7b6f5ec5a171a609",
    family: "PUBLIC_AGENT_WAVE2",
    legacySourceClass: "synthetic-codex-safety-benchmark",
    classes: ["SYNTHETIC"], primaryClass: "SYNTHETIC",
    liveActionSubstrate: false, collectionMode: "GENERATED",
    observationOrigin: "GENERATED_BENCHMARK", empiricalStatus: "GENERATED_SYNTHETIC",
    consequenceObservation: "BENCHMARK_OUTCOME_ONLY",
    basis: "PINNED_SOURCE_REPLAY_AND_GENERATOR_DECLARATION",
    levels: ["PUBLISHER_DECLARED", "SOURCE_REPLAYED"],
    sourceReplayScope: "FULL_SELECTED_SOURCE_OBJECTS",
    humanReviewScope: null,
    descriptiveScope: "SYNTHETIC_CODEX_SAFETY_TRACE_COUNTS",
    shadowScope: "NON_PRODUCTION_SYNTHETIC_SAFETY_PROXY_RESEARCH",
  }),
  source({
    id: "AI45Research/ATBench-Claw",
    revision: "75f70f4bfd8305e33e22006e1e6eeb668684d3f2",
    family: "PUBLIC_AGENT_WAVE2",
    legacySourceClass: "generated-openclaw-safety-benchmark",
    classes: ["SYNTHETIC"], primaryClass: "SYNTHETIC",
    liveActionSubstrate: false, collectionMode: "GENERATED",
    observationOrigin: "GENERATED_BENCHMARK", empiricalStatus: "GENERATED_SYNTHETIC",
    consequenceObservation: "BENCHMARK_OUTCOME_ONLY",
    basis: "PINNED_SOURCE_REPLAY_AND_PUBLISHER_GENERATION_DESCRIPTION",
    levels: ["PUBLISHER_DECLARED", "SOURCE_REPLAYED"],
    sourceReplayScope: "FULL_SELECTED_SOURCE_OBJECTS",
    humanReviewScope: null,
    descriptiveScope: "GENERATED_OPENCLAW_SAFETY_TRACE_COUNTS",
    shadowScope: "NON_PRODUCTION_GENERATED_SAFETY_PROXY_RESEARCH",
  }),
  source({
    id: "sierra-research/tau2-bench",
    revision: "a2c024725189473d2d7cea3a5cfdbcc67478e41f",
    family: "PUBLIC_AGENT_WAVE2",
    legacySourceClass: "simulated-dual-control-agent-benchmark",
    classes: ["SIMULATION"], primaryClass: "SIMULATION",
    liveActionSubstrate: false, collectionMode: "SIMULATED",
    observationOrigin: "RECORDED_EXECUTION", empiricalStatus: "EMPIRICAL_RECORDED",
    consequenceObservation: "BENCHMARK_OUTCOME_ONLY",
    basis: "PINNED_SIMULATION_EXECUTION_REPLAY_AND_PUBLISHER_DOCUMENTATION",
    levels: ["PUBLISHER_DECLARED", "SOURCE_REPLAYED"],
    sourceReplayScope: "FULL_SELECTED_SOURCE_OBJECTS",
    humanReviewScope: null,
    descriptiveScope: "RECORDED_STATEFUL_SIMULATION_ACTION_OUTCOME_AND_API_SPEND_COUNTS",
    shadowScope: "NON_PRODUCTION_SIMULATED_OUTCOME_PROXY_RESEARCH",
  }),
  source({
    id: "kimdanny/matm",
    revision: "2fb906b1a572f9ced0177741dee44be70ef1223c",
    family: "PUBLIC_AGENT_WAVE2",
    legacySourceClass: "population-agent-environment-benchmark",
    classes: ["SIMULATION"], primaryClass: "SIMULATION",
    liveActionSubstrate: false, collectionMode: "SIMULATED",
    observationOrigin: "RECORDED_EXECUTION", empiricalStatus: "EMPIRICAL_RECORDED",
    consequenceObservation: "BENCHMARK_OUTCOME_ONLY",
    basis: "PINNED_ALFWORLD_SIMULATION_RESULT_REPLAY_AND_PUBLISHER_DOCUMENTATION",
    levels: ["PUBLISHER_DECLARED", "SOURCE_REPLAYED"],
    sourceReplayScope: "FULL_SELECTED_SOURCE_OBJECTS",
    humanReviewScope: null,
    descriptiveScope: "RECORDED_ALFWORLD_SIMULATION_ACTION_OBSERVATION_OUTCOME_COUNTS",
    shadowScope: "NON_PRODUCTION_SIMULATED_ENVIRONMENT_PROXY_RESEARCH",
  }),
  source({
    id: "Tencent/CUARewardBench",
    revision: "33a04c96b86cea643f9d396e4879f778717fb923",
    family: "PUBLIC_AGENT_WAVE3",
    legacySourceClass: "controlled-osworld-human-annotation-metadata",
    classes: ["REAL_SOFTWARE", "CONTROLLED_REAL_APP"],
    primaryClass: "CONTROLLED_REAL_APP",
    liveActionSubstrate: true, collectionMode: "CONTROLLED",
    observationOrigin: "METADATA_ONLY", empiricalStatus: "PUBLISHER_METADATA_ONLY",
    consequenceObservation: "HUMAN_REVIEWED_METADATA_ONLY",
    basis: "PINNED_METADATA_REPLAY_AND_PUBLISHER_ENVIRONMENT_DECLARATION",
    levels: ["PUBLISHER_DECLARED", "HUMAN_REVIEWED", "SOURCE_REPLAYED"],
    sourceReplayScope: "PINNED_METADATA_ONLY",
    humanReviewScope: "PROCESS_AND_OUTCOME_LABEL_METADATA_NO_TRACE_BYTES",
    descriptiveScope: "CONTROLLED_REAL_APP_LABEL_METADATA_COUNTS_ONLY",
    shadowScope: "NON_PRODUCTION_METADATA_AUDIT_ONLY_NO_TRAJECTORY_MODEL",
  }),
  source({
    id: "microsoft/AgentRx:tau_retail",
    revision: "f228165bfec60a801fd5fedd9d8ffe0f9de0c69d",
    family: "PUBLIC_AGENT_WAVE4",
    legacySourceClass: "manually-annotated-failed-agent-structured-api-sandbox",
    classes: ["SIMULATION"], primaryClass: "SIMULATION",
    liveActionSubstrate: false, collectionMode: "SIMULATED",
    observationOrigin: "RECORDED_EXECUTION", empiricalStatus: "EMPIRICAL_RECORDED",
    consequenceObservation: "HUMAN_REVIEWED_FAILURE_LABEL",
    basis: "PINNED_SANDBOX_EXECUTION_AND_MANUAL_LABEL_SOURCE_REPLAY",
    levels: ["PUBLISHER_DECLARED", "HUMAN_REVIEWED", "SOURCE_REPLAYED"],
    sourceReplayScope: "FULL_SELECTED_SOURCE_OBJECTS",
    humanReviewScope: "FAILURE_CHAIN_AND_ROOT_CAUSE_PUBLISHER_DECLARED_NOT_ADJUDICATED",
    descriptiveScope: "RECORDED_SIMULATION_TRACE_SHAPE_AND_FAILURE_TAXONOMY_COUNTS",
    shadowScope: "NON_PRODUCTION_FAILURE_LOCALIZATION_RESEARCH",
  }),
  source({
    id: "kantine/BotFails",
    revision: "3478e49d91e1737eb76dfee2d81bb22617039c13",
    family: "PUBLIC_ROBOTICS",
    legacySourceClass: "REAL_ROBOT_TELEOPERATION",
    classes: ["REAL_PHYSICAL"], primaryClass: "REAL_PHYSICAL",
    liveActionSubstrate: true, collectionMode: "CONTROLLED",
    observationOrigin: "RECORDED_PHYSICAL_OBSERVATION",
    empiricalStatus: "EMPIRICAL_RECORDED",
    consequenceObservation: "HUMAN_REVIEWED_FRAME_ANOMALY_LABEL",
    basis: "PINNED_REAL_ROBOT_SOURCE_REPLAY_AND_PUBLISHER_DOCUMENTATION",
    levels: ["PUBLISHER_DECLARED", "HUMAN_REVIEWED", "SOURCE_REPLAYED"],
    sourceReplayScope: "FULL_SELECTED_SOURCE_OBJECTS",
    humanReviewScope: "MANUAL_PER_FRAME_ANOMALY_LABELS_NOT_ADJUDICATED",
    descriptiveScope: "REAL_ROBOT_TELEOPERATION_AND_FRAME_ANOMALY_COUNTS",
    shadowScope: "NON_PRODUCTION_PHYSICAL_ANOMALY_RESEARCH",
  }),
  source({
    id: "paulpacaud/Guardian-FailCoT-OOD-datasets",
    revision: "bd2b24224e4da833a8d42ca694d839622e54bb48",
    family: "PUBLIC_ROBOTICS",
    legacySourceClass: "REAL_ROBOT_AUTONOMOUS_POLICY_EXECUTION",
    classes: ["REAL_PHYSICAL"], primaryClass: "REAL_PHYSICAL",
    liveActionSubstrate: true, collectionMode: "CONTROLLED",
    observationOrigin: "RECORDED_PHYSICAL_OBSERVATION",
    empiricalStatus: "EMPIRICAL_RECORDED",
    consequenceObservation: "HUMAN_REVIEWED_SUBTASK_LABEL",
    basis: "PINNED_REAL_ROBOT_SOURCE_REPLAY_AND_PUBLISHER_DOCUMENTATION",
    levels: ["PUBLISHER_DECLARED", "HUMAN_REVIEWED", "SOURCE_REPLAYED"],
    sourceReplayScope: "FULL_SELECTED_SOURCE_OBJECTS",
    humanReviewScope: "MANUAL_BINARY_SUBTASK_LABEL_NOT_ADJUDICATED",
    descriptiveScope: "REAL_ROBOT_POLICY_EXECUTION_AND_MANUAL_SUBTASK_COUNTS",
    shadowScope: "NON_PRODUCTION_PHYSICAL_POLICY_FAILURE_RESEARCH",
  }),
  source({
    id: "r2d2_faceblur",
    revision: "droid_100/1.0.0",
    family: "DROID100",
    legacySourceClass: "IN_THE_WILD_REAL_ROBOT_MANIPULATION",
    classes: ["REAL_PHYSICAL"], primaryClass: "REAL_PHYSICAL",
    liveActionSubstrate: true, collectionMode: "CONTROLLED",
    observationOrigin: "RECORDED_PHYSICAL_OBSERVATION",
    empiricalStatus: "EMPIRICAL_RECORDED",
    consequenceObservation: "PUBLISHER_NATIVE_EPISODE_FIELDS",
    basis: "PINNED_SHARD_AND_EPISODE_DERIVATION_WITH_PUBLISHER_DOCUMENTATION",
    levels: ["PUBLISHER_DECLARED", "SOURCE_REPLAYED"],
    sourceReplayScope: "PINNED_SHARD_AND_EPISODE_DERIVATION",
    humanReviewScope: null,
    descriptiveScope: "REAL_PHYSICAL_ACTION_OBSERVATION_SEQUENCE_COUNTS",
    shadowScope: "NON_PRODUCTION_PHYSICAL_SEQUENCE_AND_COVERAGE_RESEARCH",
  }),
  source({
    id: "NHTSA_SGO_ADS_CRASH_REPORTS",
    revision: "sha256:7ed5b160593b1eca85a199a0ae31cd694c952b5adfb99ba9692769d1596e114c",
    family: "PUBLIC_INCIDENT_QUARANTINE",
    legacySourceClass: "REPORTING_ENTITY_SUBMITTED_REAL_PHYSICAL_INCIDENT_REPORT",
    classes: ["ORGANIC", "REAL_PHYSICAL"], primaryClass: "REAL_PHYSICAL",
    liveActionSubstrate: true, collectionMode: "ORGANIC",
    observationOrigin: "PUBLISHER_INCIDENT_REPORT",
    empiricalStatus: "EMPIRICAL_RECORDED",
    consequenceObservation: "REPORTING_ENTITY_INCIDENT_ALLEGATION",
    basis: "PINNED_OFFICIAL_CSV_REPLAY_WITH_REPORTING_ENTITY_SUBMISSIONS",
    levels: ["SELF_REPORTED", "PUBLISHER_DECLARED", "SOURCE_REPLAYED"],
    sourceReplayScope: "FULL_SELECTED_SOURCE_OBJECTS",
    humanReviewScope: null,
    descriptiveScope: "INCIDENT_TAXONOMY_AND_SOURCE_DISCOVERY_ONLY",
    shadowScope: null,
    allowedUses: ["DESCRIPTIVE"],
  }),
]);

const DEFINITIONS_BY_ID = new Map(SOURCE_DEFINITIONS.map((definition) =>
  [definition.id, definition]));

const RIGHTS_BY_ID = new Map([
  ["OpenHands/openhands-feedback", rights(
    "PINNED_MIT_DECLARATION_BYTES_VERIFIED",
    "PINNED_REPOSITORY_DECLARATION_FOR_SELECTED_PUBLIC_ROWS",
    "ROWS_MARKED_PUBLIC_WITH_PUBLISHER_COLLECTION_BASIS",
  )],
  ["xlangai/computer-agent-arena", rights(
    "PINNED_CC_BY_4_0_DECLARATION_BYTES_VERIFIED",
    "PINNED_DATASET_DECLARATION_FOR_SELECTED_SOURCE_OBJECT",
    "PUBLISHER_DECLARED_USER_TASK_AND_EVALUATION_COLLECTION",
  )],
  ["uw-syfi/TraceLab", rights(
    "PINNED_CC_BY_4_0_DATASET_LICENSE_BYTES_VERIFIED",
    "PINNED_RELEASE_DECLARATION_FOR_SELECTED_SANITIZED_ASSET",
    "PUBLISHER_DECLARED_SANITIZED_PUBLIC_TELEMETRY_RELEASE",
  )],
  ["nebius/SWE-rebench-openhands-trajectories", rights(
    "PINNED_CC_BY_4_0_DECLARATION_BYTES_VERIFIED",
    "PINNED_DATASET_DECLARATION_FOR_SELECTED_LOGICAL_ROWS",
    "PUBLISHER_DECLARED_BENCHMARK_COLLECTION",
  )],
  ["AI45Research/ATBench-Codex", rights(
    "PINNED_APACHE_2_0_DECLARATION_BYTES_VERIFIED",
    "PINNED_DATASET_DECLARATION_FOR_COMPLETE_SELECTED_OBJECT",
    "PUBLISHER_DECLARED_GENERATED_BENCHMARK_COLLECTION",
  )],
  ["AI45Research/ATBench-Claw", rights(
    "PINNED_APACHE_2_0_DECLARATION_BYTES_VERIFIED",
    "PINNED_DATASET_DECLARATION_FOR_COMPLETE_SELECTED_OBJECT",
    "PUBLISHER_DECLARED_GENERATED_BENCHMARK_COLLECTION",
  )],
  ["sierra-research/tau2-bench", rights(
    "PINNED_MIT_DECLARATION_BYTES_VERIFIED",
    "PINNED_REPOSITORY_DECLARATION_FOR_SELECTED_RUN_OBJECT",
    "PUBLISHER_DECLARED_SIMULATION_BENCHMARK_COLLECTION",
  )],
  ["kimdanny/matm", rights(
    "PINNED_APACHE_2_0_DECLARATION_BYTES_VERIFIED",
    "PINNED_REPOSITORY_DECLARATION_FOR_SELECTED_RESULT_OBJECT",
    "PUBLISHER_DECLARED_SIMULATION_BENCHMARK_COLLECTION",
  )],
  ["Tencent/CUARewardBench", rights(
    "PINNED_APACHE_2_0_METADATA_AND_ANNOTATION_DECLARATION_BYTES_VERIFIED",
    "METADATA_AND_ANNOTATIONS_ONLY_UPSTREAM_TRAJECTORY_RIGHTS_NOT_CLAIMED",
    "PUBLISHER_DECLARED_HUMAN_ANNOTATION_COLLECTION",
  )],
  ["microsoft/AgentRx:tau_retail", rights(
    "PINNED_GITHUB_MIT_DECLARATION_HF_CC_BY_4_0_CARD_RECORDED_SEPARATELY",
    "GITHUB_SELECTED_BYTES_USE_MIT_DECLARATION_HF_GATED_BYTE_EQUIVALENCE_UNESTABLISHED",
    "PUBLISHER_DECLARED_MANUAL_ANNOTATION_AND_BENCHMARK_COLLECTION",
  )],
  ["kantine/BotFails", rights(
    "PINNED_APACHE_2_0_HF_CARD_AND_README_DECLARATIONS_AGREE",
    "PINNED_DATASET_DECLARATION_FOR_COMPLETE_SELECTED_OBJECTS",
    "PUBLISHER_DECLARED_REAL_ROBOT_TELEOPERATION_COLLECTION",
  )],
  ["paulpacaud/Guardian-FailCoT-OOD-datasets", rights(
    "PINNED_APACHE_2_0_HF_CARD_AND_README_DECLARATIONS_AGREE",
    "PINNED_DATASET_DECLARATION_FOR_COMPLETE_SELECTED_OBJECT",
    "PUBLISHER_DECLARED_REAL_ROBOT_POLICY_COLLECTION",
  )],
  ["r2d2_faceblur", rights(
    "OFFICIAL_PAPER_DECLARES_CC_BY_4_0_GCS_OBJECT_METADATA_HAS_NO_LICENSE_FIELD",
    "OFFICIAL_PAPER_DECLARATION_FOR_DROID_DATASET_SELECTED_OBJECT_SCOPE_REQUIRES_REVIEW",
    "PUBLISHER_DECLARED_IN_THE_WILD_ROBOT_COLLECTION",
  )],
  ["NHTSA_SGO_ADS_CRASH_REPORTS", rights(
    "NO_DATASET_LICENSE_ESTABLISHED_OFFICIAL_PUBLICATION_ONLY",
    "OFFICIAL_PUBLIC_CSV_ACCESS_IS_NOT_A_REUSE_OR_TRAINING_RIGHTS_GRANT",
    "REGULATORY_REPORTING_AUTHORITY_PUBLISHES_REPORTING_ENTITY_SUBMISSIONS",
    "RECORD_LEVEL_REUSE_OR_TRAINING_RIGHTS_NOT_ESTABLISHED",
  )],
]);

function source(definition) { return Object.freeze({ ...definition }); }
function rights(licenseDeclaration, sourceBytesRightsBasis, consentOrCollectionAuthority,
  reuseOrTrainingRights = "LICENSE_DECLARATION_RECORDED_REVIEW_TERMS_SOURCE_SCOPE_AND_ATTRIBUTION_BEFORE_REUSE") {
  return Object.freeze({ licenseDeclaration, sourceBytesRightsBasis,
    consentOrCollectionAuthority, reuseOrTrainingRights,
    adapterGrantsRights: false, legalConclusion: false });
}
function digest(value, domain) {
  return `sha256:${createHash("sha256").update(`${domain}\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}
function same(left, right) { return canonicalizeStrict(left) === canonicalizeStrict(right); }
function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && same(Object.keys(value).sort(), [...keys].sort());
}
function ordered(values, order) {
  return [...new Set(values)].sort((left, right) => order.indexOf(left) - order.indexOf(right));
}
function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}

function validateSeparation(classification) {
  const environment = classification.environmentReality;
  const authority = classification.evidenceAuthority;
  const use = classification.permittedUse;
  const rightsBoundary = classification.rightsBoundary;
  const classes = environment.classes;
  if (!exactKeys(environment, ["classes", "primaryClass", "liveActionSubstrate",
    "collectionMode", "observationOrigin", "empiricalStatus", "consequenceObservation",
    "basis", "notEquivalentToCausalAuthority"])
    || !Array.isArray(classes) || classes.length < 1
    || !same(classes, ordered(classes, ENVIRONMENT_REALITY_CLASSES))
    || classes.some((value) => !ENVIRONMENT_REALITY_CLASSES.includes(value))
    || !classes.includes(environment.primaryClass)
    || typeof environment.liveActionSubstrate !== "boolean"
    || !COLLECTION_MODES.includes(environment.collectionMode)
    || !OBSERVATION_ORIGINS.includes(environment.observationOrigin)
    || !EMPIRICAL_STATUSES.includes(environment.empiricalStatus)
    || typeof environment.consequenceObservation !== "string"
    || environment.consequenceObservation.length < 1
    || typeof environment.basis !== "string" || environment.basis.length < 1) {
    fail("ONTOLOGY_ENVIRONMENT_CLASSES_INVALID");
  }
  const hasSynthetic = classes.includes("SYNTHETIC");
  const hasSimulation = classes.includes("SIMULATION");
  const hasReal = classes.some((value) => ["ORGANIC", "REAL_PHYSICAL", "REAL_SOFTWARE",
    "CONTROLLED_REAL_APP"].includes(value));
  if ((hasSynthetic || hasSimulation) && hasReal || hasSynthetic && hasSimulation
    || classes.includes("ORGANIC") && !classes.some((value) =>
      ["REAL_PHYSICAL", "REAL_SOFTWARE"].includes(value))
    || classes.includes("CONTROLLED_REAL_APP") && !classes.includes("REAL_SOFTWARE")) {
    fail("ONTOLOGY_ENVIRONMENT_COMBINATION_INVALID");
  }
  if (environment.notEquivalentToCausalAuthority !== true
    || hasReal !== environment.liveActionSubstrate
    || environment.empiricalStatus === "EMPIRICAL_RECORDED"
      && environment.observationOrigin === "GENERATED_BENCHMARK"
    || hasSynthetic && (environment.empiricalStatus !== "GENERATED_SYNTHETIC"
      || environment.observationOrigin !== "GENERATED_BENCHMARK"
      || environment.collectionMode !== "GENERATED")
    || hasSimulation && environment.observationOrigin !== "RECORDED_EXECUTION"
    || hasSimulation && environment.empiricalStatus !== "EMPIRICAL_RECORDED"
    || hasSimulation && environment.collectionMode !== "SIMULATED"
    || environment.observationOrigin === "METADATA_ONLY"
      && environment.empiricalStatus !== "PUBLISHER_METADATA_ONLY"
    || environment.empiricalStatus === "PUBLISHER_METADATA_ONLY"
      && environment.observationOrigin !== "METADATA_ONLY"
    || environment.observationOrigin === "RECORDED_PHYSICAL_OBSERVATION"
      && !classes.includes("REAL_PHYSICAL")
    || environment.observationOrigin === "PUBLISHER_INCIDENT_REPORT"
      && !classes.includes("REAL_PHYSICAL")) {
    fail("ONTOLOGY_ENVIRONMENT_SEMANTICS_INVALID");
  }
  if (!exactKeys(authority, ["levels", "sourceReplayScope", "humanReviewScope",
    "prospectiveCollectionByOutsider", "formalAdjudicationEstablished",
    "collectionTimeAttestationEstablished", "sourceTruthIndependentlyEstablished"])
    || !Array.isArray(authority.levels)
    || !same(authority.levels, ordered(authority.levels, EVIDENCE_AUTHORITY_LEVELS))
    || authority.levels.some((value) => !EVIDENCE_AUTHORITY_LEVELS.includes(value))
    || !authority.levels.includes("PUBLISHER_DECLARED")
    || !authority.levels.includes("SOURCE_REPLAYED")
    || authority.prospectiveCollectionByOutsider !== false
    || authority.formalAdjudicationEstablished !== false
    || authority.collectionTimeAttestationEstablished !== false
    || authority.sourceTruthIndependentlyEstablished !== false
    || authority.levels.includes("PROSPECTIVE") || authority.levels.includes("ADJUDICATED")
    || authority.levels.includes("HUMAN_REVIEWED") !== (authority.humanReviewScope !== null)
    || typeof authority.sourceReplayScope !== "string"
    || authority.sourceReplayScope.length < 1
    || authority.humanReviewScope !== null
      && (typeof authority.humanReviewScope !== "string"
        || authority.humanReviewScope.length < 1)) {
    fail("ONTOLOGY_AUTHORITY_SEMANTICS_INVALID");
  }
  const usePartition = ordered([...use.allowed, ...use.denied], PERMITTED_USE_CLASSES);
  if (!exactKeys(use, ["allowed", "descriptiveScope", "shadowScope", "denied",
    "productionAuthority", "automaticPromotion"])
    || !Array.isArray(use.allowed) || !Array.isArray(use.denied)
    || !same(use.allowed, ordered(use.allowed, PERMITTED_USE_CLASSES))
    || !same(use.denied, ordered(use.denied, PERMITTED_USE_CLASSES))
    || !same(usePartition, PERMITTED_USE_CLASSES)
    || new Set([...use.allowed, ...use.denied]).size !== PERMITTED_USE_CLASSES.length
    || use.allowed.some((value) => !ALLOWED_USES.includes(value))
    || !use.allowed.includes("DESCRIPTIVE")
    || use.allowed.includes("SHADOW_RESEARCH") !== (use.shadowScope !== null)
    || typeof use.descriptiveScope !== "string" || use.descriptiveScope.length < 1
    || use.shadowScope !== null
      && (typeof use.shadowScope !== "string" || use.shadowScope.length < 1)
    || use.productionAuthority !== "NONE" || use.automaticPromotion !== false
    || use.allowed.some((value) => !PERMITTED_USE_CLASSES.includes(value))
    || use.denied.some((value) => !PERMITTED_USE_CLASSES.includes(value))) {
    fail("ONTOLOGY_PERMITTED_USE_SEMANTICS_INVALID");
  }
  if (!exactKeys(rightsBoundary, RIGHTS_BOUNDARY_FIELDS)
    || [rightsBoundary.licenseDeclaration, rightsBoundary.sourceBytesRightsBasis,
      rightsBoundary.consentOrCollectionAuthority, rightsBoundary.reuseOrTrainingRights]
      .some((value) => typeof value !== "string" || value.length < 1)
    || rightsBoundary.adapterGrantsRights !== false
    || rightsBoundary.legalConclusion !== false) {
    fail("ONTOLOGY_RIGHTS_BOUNDARY_INVALID");
  }
  return true;
}

function classificationBody(definition) {
  const rightsBoundary = RIGHTS_BY_ID.get(definition.id);
  if (!rightsBoundary) fail("ONTOLOGY_RIGHTS_BOUNDARY_MISSING", definition.id);
  const allowed = ordered(definition.allowedUses ?? ALLOWED_USES, PERMITTED_USE_CLASSES);
  const denied = PERMITTED_USE_CLASSES.filter((use) => !allowed.includes(use));
  const body = {
    schema: PUBLIC_EVIDENCE_ONTOLOGY_SCHEMAS.classification,
    schemaVersion: "1.0.0",
    source: { id: definition.id, revision: definition.revision,
      family: definition.family, legacySourceClass: definition.legacySourceClass },
    environmentReality: {
      classes: ordered(definition.classes, ENVIRONMENT_REALITY_CLASSES),
      primaryClass: definition.primaryClass,
      liveActionSubstrate: definition.liveActionSubstrate,
      collectionMode: definition.collectionMode,
      observationOrigin: definition.observationOrigin,
      empiricalStatus: definition.empiricalStatus,
      consequenceObservation: definition.consequenceObservation,
      basis: definition.basis,
      notEquivalentToCausalAuthority: true,
    },
    evidenceAuthority: {
      levels: ordered(definition.levels, EVIDENCE_AUTHORITY_LEVELS),
      sourceReplayScope: definition.sourceReplayScope,
      humanReviewScope: definition.humanReviewScope,
      prospectiveCollectionByOutsider: false,
      formalAdjudicationEstablished: false,
      collectionTimeAttestationEstablished: false,
      sourceTruthIndependentlyEstablished: false,
    },
    rightsBoundary,
    permittedUse: {
      allowed,
      descriptiveScope: definition.descriptiveScope,
      shadowScope: definition.shadowScope,
      denied,
      productionAuthority: "NONE",
      automaticPromotion: false,
    },
  };
  validateSeparation(body);
  return body;
}

export function listPublicEvidenceOntologySources() {
  return Object.freeze(SOURCE_DEFINITIONS.map((definition) => definition.id).sort());
}

export function buildPublicEvidenceOntologyClassification(sourceId) {
  const definition = DEFINITIONS_BY_ID.get(sourceId);
  if (!definition) fail("ONTOLOGY_SOURCE_UNKNOWN", sourceId);
  const body = classificationBody(definition);
  return Object.freeze({ ...body,
    classificationHash: digest(body, PUBLIC_EVIDENCE_ONTOLOGY_SCHEMAS.classification) });
}

export function publicEvidenceOntologyReference(sourceId) {
  const classification = buildPublicEvidenceOntologyClassification(sourceId);
  const body = {
    schema: PUBLIC_EVIDENCE_ONTOLOGY_SCHEMAS.reference,
    schemaVersion: "1.0.0",
    sourceId: classification.source.id,
    sourceRevision: classification.source.revision,
    classificationHash: classification.classificationHash,
    environmentRealityClasses: classification.environmentReality.classes,
    observationOrigin: classification.environmentReality.observationOrigin,
    empiricalStatus: classification.environmentReality.empiricalStatus,
    evidenceAuthorityLevels: classification.evidenceAuthority.levels,
    rightsBoundaryHash: digest(classification.rightsBoundary,
      "outsider/public-evidence-ontology/rights-boundary/v1"),
    permittedUses: classification.permittedUse.allowed,
  };
  return Object.freeze({ ...body,
    referenceHash: digest(body, PUBLIC_EVIDENCE_ONTOLOGY_SCHEMAS.reference) });
}

export function buildPublicEvidenceOntologyCatalog() {
  const classifications = listPublicEvidenceOntologySources()
    .map(buildPublicEvidenceOntologyClassification);
  const countMembership = (field, values) => Object.fromEntries(values.map((value) => [value,
    classifications.filter((classification) => field(classification).includes(value)).length]));
  const body = {
    schema: PUBLIC_EVIDENCE_ONTOLOGY_SCHEMAS.catalog,
    schemaVersion: "1.0.0",
    classifications,
    counts: {
      sources: classifications.length,
      environmentClassMemberships: countMembership(
        (classification) => classification.environmentReality.classes,
        ENVIRONMENT_REALITY_CLASSES,
      ),
      authorityLevelMemberships: countMembership(
        (classification) => classification.evidenceAuthority.levels,
        EVIDENCE_AUTHORITY_LEVELS,
      ),
      permittedUseMemberships: countMembership(
        (classification) => classification.permittedUse.allowed,
        PERMITTED_USE_CLASSES,
      ),
    },
    invariants: [...PUBLIC_EVIDENCE_ONTOLOGY_INVARIANTS],
  };
  return Object.freeze({ ...body,
    catalogHash: digest(body, PUBLIC_EVIDENCE_ONTOLOGY_SCHEMAS.catalog) });
}

export function verifyPublicEvidenceOntologyClassification(classification) {
  try {
    validateSeparation(classification);
    const expected = buildPublicEvidenceOntologyClassification(classification?.source?.id);
    return Object.freeze({ ok: same(classification, expected),
      classificationHash: classification?.classificationHash ?? null });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyPublicEvidenceOntologyReference(reference) {
  try {
    const expected = publicEvidenceOntologyReference(reference?.sourceId);
    return Object.freeze({ ok: same(reference, expected),
      referenceHash: reference?.referenceHash ?? null });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyPublicEvidenceOntologyCatalog(catalog) {
  try {
    for (const classification of catalog?.classifications ?? []) {
      if (!verifyPublicEvidenceOntologyClassification(classification).ok) {
        fail("ONTOLOGY_CATALOG_CLASSIFICATION_INVALID", classification?.source?.id);
      }
    }
    const expected = buildPublicEvidenceOntologyCatalog();
    return Object.freeze({ ok: same(catalog, expected),
      catalogHash: catalog?.catalogHash ?? null, sources: catalog?.counts?.sources ?? 0 });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}
