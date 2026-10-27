/*
 * Claim-scoped empirical factor ledger.
 *
 * This module keeps three questions independent:
 *   1. What kind of environment produced the observation?
 *   2. What does the available evidence actually establish?
 *   3. What uses are permitted for the selected bytes?
 *
 * A source can therefore contribute a failure category or physical factor
 * without being promoted into frequency, causality, economic loss, pricing,
 * coverage, guarantee, settlement, or automatic deployment authority.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, openSync, readFileSync,
} from "node:fs";
import path from "node:path";
import {
  canonicalizeStrict,
  canonicalizeStrictBoundedArtifact,
} from "./canonical.js";
import {
  verifyPublicAgentWave3Source,
} from "./outsider-public-agent-wave3.js";
import {
  AGENTRX_TAU_WAVE4_PIN, verifyPublicAgentWave4Source,
} from "./outsider-public-agent-wave4.js";
import {
  convertBotFailsPilot, convertUr5FailExecution,
} from "./outsider-public-robotics-adapter.js";
import {
  verifyDroid100PilotArtifactDirectory,
} from "./outsider-droid100-pilot-artifacts.js";
import {
  publicEvidenceOntologyReference, verifyPublicEvidenceOntologyReference,
} from "./outsider-public-evidence-ontology.js";
import {
  NHTSA_SGO_STAGE1_FROZEN_SCOPE,
  verifyNhtsaSgoIncidentCorpusRegistrySource,
} from "./outsider-nhtsa-corpus-registry-intake.js";
import {
  adaptNhtsaSgoAdsCsv, verifyNhtsaSgoIncidentQuarantine,
} from "./outsider-public-risk-source-adapters.js";

export const EMPIRICAL_FACTOR_LEDGER_SCHEMAS = Object.freeze({
  ledger: "outsider/empirical-factor-ledger/v2",
  sourceProfile: "outsider/empirical-source-profile/v1",
  factorDictionary: "outsider/empirical-factor-dictionary/v1",
  factorRow: "outsider/empirical-factor-row/v1",
  mechanismEvidence: "outsider/empirical-mechanism-evidence/v1",
  consequenceEvidence: "outsider/empirical-consequence-evidence/v1",
  incidentTaxonomyObservation: "outsider/empirical-incident-taxonomy-observation/v1",
});

export const EMPIRICAL_CAPABILITIES = Object.freeze([
  "TAXONOMY_UPDATE",
  "FACTOR_SCHEMA_UPDATE",
  "FACTOR_COVERAGE",
  "DESCRIPTIVE_COMPOSITION",
  "DESCRIPTIVE_ASSOCIATION",
  "OUTCOME_DISCRIMINATION",
  "FREQUENCY_CALIBRATION",
  "CAUSAL_EFFECT",
  "ECONOMIC_SEVERITY",
  "PRICE",
  "COVERAGE",
  "GUARANTEE",
  "SETTLE",
  "AUTOMATIC_DEPLOY",
]);

export const EMPIRICAL_ADMISSION_STATUSES = Object.freeze([
  "ADMITTED", "ABSTAIN", "FORBIDDEN", "UNRESOLVED_PERMISSION",
]);

const SOURCE_IDS = Object.freeze({
  wave3: "Tencent/CUARewardBench",
  wave4: "microsoft/AgentRx:tau_retail",
  botfails: "kantine/BotFails",
  ur5: "paulpacaud/Guardian-FailCoT-OOD-datasets",
  droid: "r2d2_faceblur",
  nhtsa: "NHTSA_SGO_ADS_CRASH_REPORTS",
});
const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,255}$/;
const FAILURE_CATEGORIES = Object.freeze([
  "Instruction Adherence Failure",
  "Intent Not Supported",
  "Intent Plan Misalignment",
  "Invalid Invocation",
  "Misinterpretation of Tool Output",
  "System Failure",
  "Underspecified User Intent",
]);
const HARD_CLOSED_CAPABILITIES = Object.freeze([
  "FREQUENCY_CALIBRATION", "CAUSAL_EFFECT", "ECONOMIC_SEVERITY",
  "PRICE", "COVERAGE", "GUARANTEE", "SETTLE", "AUTOMATIC_DEPLOY",
]);
const SOURCE_FACTOR_ALLOWLISTS = Object.freeze({
  [SOURCE_IDS.wave3]: new Set([
    "publisher_annotation_step_count", "publisher_process_label_count",
    "publisher_key_good_in_success_count", "publisher_key_bad_in_success_count",
    "publisher_key_good_after_bad_in_success_count", "publisher_key_bad_in_fail_count",
    "publisher_key_good_before_bad_in_fail_count",
    "publisher_labeled_good_after_bad_pattern_present", "publisher_annotation_density",
    "referenced_screenshot_object_count", "referenced_trajectory_object_count",
    "trace_bytes_acquired",
  ]),
  [SOURCE_IDS.wave4]: new Set([
    "agent_trajectory_turn_count", "agent_tool_call_count",
    "agent_tool_result_pairing_ratio", "agent_write_like_tool_call_count",
    "agent_write_like_tool_fraction", "publisher_annotated_failure_event_count",
    "publisher_designated_root_cause_step_fraction",
    "publisher_failures_before_designated_root_count",
    "publisher_designated_root_cause_actor",
    "publisher_designated_root_cause_category",
    "publisher_designated_root_after_prior_failure",
  ]),
  [SOURCE_IDS.botfails]: new Set([
    "physical_execution_control_mode", "robot_platform_class", "policy_identity_class",
    "collection_process_class", "declared_frame_count", "control_frequency_hz",
    "declared_frame_span_ms", "sensor_payload_decoded_ratio",
    "image_payload_verified_ratio", "manual_anomaly_positive_frame_fraction",
    "manual_anomaly_first_onset_fraction", "manual_anomaly_positive_run_count",
    "manual_label_coverage_ratio",
  ]),
  [SOURCE_IDS.ur5]: new Set([
    "physical_execution_control_mode", "robot_platform_class", "policy_identity_class",
    "collection_process_class", "image_reference_count", "sensor_payload_decoded_ratio",
    "image_payload_verified_ratio", "source_native_subtask_failure_mode",
  ]),
  [SOURCE_IDS.droid]: new Set([
    "robot_platform_class", "collection_process_class", "physical_step_count",
    "action_observation_pairing_ratio", "terminal_boundary_observed",
    "image_sensor_stream_count", "numeric_observation_feature_count",
    "sensor_payload_decoded_ratio", "image_payload_verified_ratio",
    "same_step_command_observation_joint_position_delta_rms",
    "same_step_command_observation_cartesian_translation_delta_rms",
    "same_step_command_observation_cartesian_rotation_delta_rms",
    "peak_abs_commanded_joint_velocity",
    "peak_abs_commanded_cartesian_translation_velocity",
    "peak_abs_commanded_cartesian_rotation_velocity",
    "commanded_joint_position_step_delta_l2_peak",
    "commanded_cartesian_translation_step_delta_l2_peak",
    "commanded_cartesian_rotation_step_delta_l2_peak",
    "gripper_command_transition_count", "observation_index_gap_max_steps",
  ]),
});
const SOURCE_CONSEQUENCE_SEMANTICS = Object.freeze({
  [SOURCE_IDS.wave3]: Object.freeze({ layer: "SOURCE_NATIVE_OUTCOME_METADATA",
    kind: "HUMAN_REVIEWED_BENCHMARK_RESULT_METADATA_PROXY" }),
  [SOURCE_IDS.wave4]: Object.freeze({ layer: "SOURCE_NATIVE_OUTCOME",
    kind: "BENCHMARK_TASK_FAILURE_PROXY" }),
  [SOURCE_IDS.botfails]: Object.freeze({ layer: "SOURCE_NATIVE_PHYSICAL_ANOMALY_PROXY",
    kind: "MANUAL_FRAME_ANOMALY_PROXY" }),
  [SOURCE_IDS.ur5]: Object.freeze({ layer: "SOURCE_NATIVE_PHYSICAL_SUBTASK_PROXY",
    kind: "MANUAL_SUBTASK_OUTCOME_PROXY" }),
  [SOURCE_IDS.droid]: Object.freeze({ layer: "SOURCE_NATIVE_OUTCOME_UNINTERPRETED",
    kind: "RECORDED_REWARD_UNINTERPRETED" }),
});

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}
function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}
function exactKeys(value, keys) {
  return plain(value) && same(Object.keys(value).sort(), [...keys].sort());
}
function digest(value, domain) {
  return `sha256:${createHash("sha256").update(`${domain}\0`)
    .update(typeof value === "string" || Buffer.isBuffer(value)
      ? value : canonicalizeStrict(value)).digest("hex")}`;
}

/* The complete empirical ledger is a bounded, versioned artifact containing
 * 1,324 NHTSA taxonomy projections plus the other source lanes.  Its sealed
 * body legitimately exceeds the ordinary canonical member budget.  Only the
 * full ledger envelope receives the explicit artifact budget; every row and
 * generic comparison remains on canonicalizeStrict. */
function ledgerDigest(value) {
  return `sha256:${createHash("sha256")
    .update(`${EMPIRICAL_FACTOR_LEDGER_SCHEMAS.ledger}\0`)
    .update(canonicalizeStrictBoundedArtifact(value)).digest("hex")}`;
}

function sameLedgerArtifact(left, right) {
  return canonicalizeStrictBoundedArtifact(left)
    === canonicalizeStrictBoundedArtifact(right);
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
function sortedUnique(values) {
  return [...new Set(values)].sort();
}
function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function ratio(numerator, denominator) {
  if (!finite(numerator) || !finite(denominator) || denominator <= 0) {
    fail("EMPIRICAL_FACTOR_RATIO_INPUT_INVALID");
  }
  return numerator / denominator;
}

function definition({ id, domain, valueType, unit, measurementScope,
  sourceModalities, minimumEvidence, temporality, outcomeDerived = false,
  preActionAvailable = false, eligibleUses = ["FACTOR_COVERAGE"],
  missingPolicy = "OMIT_WITH_EXPLICIT_REASON_NEVER_ZERO_IMPUTE",
  poolingBoundary = "SOURCE_SCOPED_NO_CROSS_SOURCE_POOLING_WITHOUT_COMPATIBILITY_PROOF",
  interpretationBoundary = null }) {
  return Object.freeze({ id, domain, valueType, unit, measurementScope,
    sourceModalities: Object.freeze([...sourceModalities]), minimumEvidence,
    temporality, outcomeDerived, preActionAvailable,
    eligibleUses: Object.freeze([...eligibleUses].sort()), missingPolicy,
    poolingBoundary, interpretationBoundary });
}

const AGENT_FACTOR_DEFINITIONS = Object.freeze([
  definition({ id: "agent_trajectory_turn_count", domain: "AGENT",
    valueType: "INTEGER", unit: "count", measurementScope: "TRAJECTORY",
    sourceModalities: ["TRACE"], minimumEvidence: "VERIFIED_COMPLETE_SELECTED_TRACE",
    temporality: "FULL_TRAJECTORY", eligibleUses: ["FACTOR_COVERAGE", "DESCRIPTIVE_ASSOCIATION"] }),
  definition({ id: "agent_tool_call_count", domain: "AGENT", valueType: "INTEGER",
    unit: "count", measurementScope: "TRAJECTORY", sourceModalities: ["TRACE"],
    minimumEvidence: "VERIFIED_COMPLETE_SELECTED_TRACE", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE", "DESCRIPTIVE_ASSOCIATION"] }),
  definition({ id: "agent_tool_result_pairing_ratio", domain: "AGENT", valueType: "NUMBER",
    unit: "ratio_0_1", measurementScope: "TRAJECTORY", sourceModalities: ["TRACE"],
    minimumEvidence: "VERIFIED_TOOL_CALL_RESULT_JOIN", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE", "DESCRIPTIVE_ASSOCIATION"] }),
  definition({ id: "agent_write_like_tool_call_count", domain: "AGENT", valueType: "INTEGER",
    unit: "count", measurementScope: "TRAJECTORY", sourceModalities: ["TRACE", "TOOL_SCHEMA"],
    minimumEvidence: "VERIFIED_TRACE_AND_BOUNDED_TOOL_NAME_LIST", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE", "DESCRIPTIVE_ASSOCIATION"],
    interpretationBoundary: "TOOL_NAME_CLASSIFICATION_NOT_EXTERNAL_SIDE_EFFECT_PROOF" }),
  definition({ id: "agent_write_like_tool_fraction", domain: "AGENT", valueType: "NUMBER",
    unit: "ratio_0_1", measurementScope: "TRAJECTORY", sourceModalities: ["TRACE", "TOOL_SCHEMA"],
    minimumEvidence: "VERIFIED_TRACE_AND_BOUNDED_TOOL_NAME_LIST", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE", "DESCRIPTIVE_ASSOCIATION"],
    interpretationBoundary: "TOOL_NAME_CLASSIFICATION_NOT_EXTERNAL_SIDE_EFFECT_PROOF" }),
  definition({ id: "publisher_annotated_failure_event_count", domain: "AGENT",
    valueType: "INTEGER", unit: "count", measurementScope: "TRAJECTORY",
    sourceModalities: ["PUBLISHER_ANNOTATION"], minimumEvidence: "PINNED_MANUAL_ANNOTATION_ROW",
    temporality: "POST_OUTCOME", outcomeDerived: true,
    eligibleUses: ["TAXONOMY_UPDATE", "FACTOR_COVERAGE", "DESCRIPTIVE_COMPOSITION"] }),
  definition({ id: "publisher_designated_root_cause_step_fraction", domain: "AGENT",
    valueType: "NUMBER", unit: "ratio_0_1", measurementScope: "TRAJECTORY",
    sourceModalities: ["TRACE", "PUBLISHER_ANNOTATION"],
    minimumEvidence: "PINNED_TRACE_ANNOTATION_EXACT_JOIN", temporality: "POST_OUTCOME",
    outcomeDerived: true, eligibleUses: ["TAXONOMY_UPDATE", "FACTOR_COVERAGE", "DESCRIPTIVE_ASSOCIATION"],
    interpretationBoundary: "PUBLISHER_DESIGNATION_NOT_CAUSAL_EFFECT" }),
  definition({ id: "publisher_failures_before_designated_root_count", domain: "AGENT",
    valueType: "INTEGER", unit: "count", measurementScope: "TRAJECTORY",
    sourceModalities: ["PUBLISHER_ANNOTATION"], minimumEvidence: "PINNED_MANUAL_ANNOTATION_ROW",
    temporality: "POST_OUTCOME", outcomeDerived: true,
    eligibleUses: ["TAXONOMY_UPDATE", "FACTOR_COVERAGE", "DESCRIPTIVE_ASSOCIATION"] }),
  definition({ id: "publisher_designated_root_cause_actor", domain: "AGENT",
    valueType: "CATEGORY", unit: "category", measurementScope: "TRAJECTORY",
    sourceModalities: ["PUBLISHER_ANNOTATION"], minimumEvidence: "PINNED_MANUAL_ANNOTATION_ROW",
    temporality: "POST_OUTCOME", outcomeDerived: true,
    eligibleUses: ["TAXONOMY_UPDATE", "FACTOR_COVERAGE", "DESCRIPTIVE_COMPOSITION"] }),
  definition({ id: "publisher_designated_root_cause_category", domain: "AGENT",
    valueType: "CATEGORY", unit: "category", measurementScope: "TRAJECTORY",
    sourceModalities: ["PUBLISHER_ANNOTATION"], minimumEvidence: "PINNED_MANUAL_ANNOTATION_ROW",
    temporality: "POST_OUTCOME", outcomeDerived: true,
    eligibleUses: ["TAXONOMY_UPDATE", "FACTOR_COVERAGE", "DESCRIPTIVE_COMPOSITION"] }),
  definition({ id: "publisher_designated_root_after_prior_failure", domain: "AGENT",
    valueType: "BOOLEAN", unit: "boolean", measurementScope: "TRAJECTORY",
    sourceModalities: ["PUBLISHER_ANNOTATION"], minimumEvidence: "PINNED_MANUAL_ANNOTATION_ROW",
    temporality: "POST_OUTCOME", outcomeDerived: true,
    eligibleUses: ["TAXONOMY_UPDATE", "FACTOR_COVERAGE", "DESCRIPTIVE_COMPOSITION"] }),
  definition({ id: "publisher_annotation_step_count", domain: "AGENT",
    valueType: "INTEGER", unit: "count", measurementScope: "METADATA_ROW",
    sourceModalities: ["PUBLISHER_METADATA"], minimumEvidence: "PINNED_ANNOTATION_METADATA",
    temporality: "POST_OUTCOME_METADATA", outcomeDerived: true,
    eligibleUses: ["FACTOR_SCHEMA_UPDATE", "FACTOR_COVERAGE"] }),
  ...["publisher_process_label_count", "publisher_key_good_in_success_count",
    "publisher_key_bad_in_success_count", "publisher_key_good_after_bad_in_success_count",
    "publisher_key_bad_in_fail_count", "publisher_key_good_before_bad_in_fail_count"]
    .map((id) => definition({ id, domain: "AGENT", valueType: "INTEGER", unit: "count",
      measurementScope: "METADATA_ROW", sourceModalities: ["PUBLISHER_METADATA"],
      minimumEvidence: "PINNED_ANNOTATION_METADATA", temporality: "POST_OUTCOME_METADATA",
      outcomeDerived: true, eligibleUses: ["FACTOR_SCHEMA_UPDATE", "FACTOR_COVERAGE", "DESCRIPTIVE_COMPOSITION"] })),
  definition({ id: "publisher_labeled_good_after_bad_pattern_present", domain: "AGENT",
    valueType: "BOOLEAN", unit: "boolean", measurementScope: "METADATA_ROW",
    sourceModalities: ["PUBLISHER_METADATA"], minimumEvidence: "PINNED_ANNOTATION_METADATA",
    temporality: "POST_OUTCOME_METADATA", outcomeDerived: true,
    eligibleUses: ["FACTOR_SCHEMA_UPDATE", "FACTOR_COVERAGE"],
    interpretationBoundary: "PUBLISHER_LABEL_PATTERN_NOT_TRACE_ESTABLISHED_RECOVERY" }),
  definition({ id: "publisher_annotation_density", domain: "AGENT", valueType: "NUMBER",
    unit: "labels_per_declared_step", measurementScope: "METADATA_ROW",
    sourceModalities: ["PUBLISHER_METADATA"], minimumEvidence: "PINNED_ANNOTATION_METADATA",
    temporality: "POST_OUTCOME_METADATA", outcomeDerived: true,
    eligibleUses: ["FACTOR_SCHEMA_UPDATE", "FACTOR_COVERAGE"],
    interpretationBoundary: "ANNOTATION_DENSITY_NOT_ERROR_RATE" }),
  definition({ id: "referenced_screenshot_object_count", domain: "AGENT", valueType: "INTEGER",
    unit: "count", measurementScope: "METADATA_ROW", sourceModalities: ["OBJECT_MANIFEST"],
    minimumEvidence: "PINNED_REFERENCE_MANIFEST", temporality: "METADATA_ONLY",
    eligibleUses: ["FACTOR_SCHEMA_UPDATE", "FACTOR_COVERAGE"],
    interpretationBoundary: "REFERENCED_OBJECTS_NOT_ACQUIRED_BYTES" }),
  definition({ id: "referenced_trajectory_object_count", domain: "AGENT", valueType: "INTEGER",
    unit: "count", measurementScope: "METADATA_ROW", sourceModalities: ["OBJECT_MANIFEST"],
    minimumEvidence: "PINNED_REFERENCE_MANIFEST", temporality: "METADATA_ONLY",
    eligibleUses: ["FACTOR_SCHEMA_UPDATE", "FACTOR_COVERAGE"],
    interpretationBoundary: "REFERENCED_OBJECTS_NOT_ACQUIRED_BYTES" }),
  definition({ id: "trace_bytes_acquired", domain: "AGENT", valueType: "INTEGER",
    unit: "bytes", measurementScope: "METADATA_ROW", sourceModalities: ["OBJECT_MANIFEST"],
    minimumEvidence: "PINNED_ACQUISITION_MANIFEST", temporality: "METADATA_ONLY",
    eligibleUses: ["FACTOR_COVERAGE"] }),
]);

const PHYSICAL_FACTOR_DEFINITIONS = Object.freeze([
  ...[
    ["physical_execution_control_mode", "CATEGORY", "category"],
    ["robot_platform_class", "CATEGORY", "category"],
    ["policy_identity_class", "CATEGORY", "category"],
    ["collection_process_class", "CATEGORY", "category"],
  ].map(([id, valueType, unit]) => definition({ id, domain: "PHYSICAL", valueType, unit,
    measurementScope: "EPISODE_OR_SUBTASK", sourceModalities: ["SOURCE_METADATA"],
    minimumEvidence: "PINNED_SOURCE_METADATA", temporality: "CONTEXT",
    preActionAvailable: true, eligibleUses: ["FACTOR_SCHEMA_UPDATE", "FACTOR_COVERAGE"] })),
  definition({ id: "physical_step_count", domain: "PHYSICAL", valueType: "INTEGER",
    unit: "count", measurementScope: "EPISODE", sourceModalities: ["ACTION", "OBSERVATION"],
    minimumEvidence: "VERIFIED_DECODED_EPISODE", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE"] }),
  definition({ id: "declared_frame_count", domain: "PHYSICAL", valueType: "INTEGER",
    unit: "count", measurementScope: "FRAME_SEQUENCE", sourceModalities: ["SOURCE_METADATA"],
    minimumEvidence: "PINNED_SOURCE_METADATA", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE"] }),
  definition({ id: "control_frequency_hz", domain: "PHYSICAL", valueType: "NUMBER",
    unit: "hertz", measurementScope: "FRAME_SEQUENCE", sourceModalities: ["SOURCE_METADATA"],
    minimumEvidence: "PINNED_DECLARED_FREQUENCY", temporality: "CONTEXT",
    preActionAvailable: true, eligibleUses: ["FACTOR_COVERAGE"] }),
  definition({ id: "declared_frame_span_ms", domain: "PHYSICAL", valueType: "NUMBER",
    unit: "milliseconds", measurementScope: "FRAME_SEQUENCE", sourceModalities: ["SOURCE_METADATA"],
    minimumEvidence: "PINNED_FRAME_COUNT_AND_DECLARED_FREQUENCY", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE"],
    interpretationBoundary: "DERIVED_DECLARED_SPAN_NOT_MEASURED_WALL_CLOCK_DURATION" }),
  definition({ id: "trajectory_duration_ms", domain: "PHYSICAL", valueType: "NUMBER",
    unit: "milliseconds", measurementScope: "EPISODE", sourceModalities: ["TIMESTAMP"],
    minimumEvidence: "VERIFIED_MONOTONIC_TIMESTAMPS", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE"] }),
  definition({ id: "action_observation_pairing_ratio", domain: "PHYSICAL", valueType: "NUMBER",
    unit: "ratio_0_1", measurementScope: "EPISODE", sourceModalities: ["ACTION", "OBSERVATION"],
    minimumEvidence: "VERIFIED_DECODED_EPISODE", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE"] }),
  definition({ id: "terminal_boundary_observed", domain: "PHYSICAL", valueType: "BOOLEAN",
    unit: "boolean", measurementScope: "EPISODE", sourceModalities: ["BOUNDARY"],
    minimumEvidence: "VERIFIED_DECODED_EPISODE", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE"] }),
  definition({ id: "image_sensor_stream_count", domain: "PHYSICAL", valueType: "INTEGER",
    unit: "count", measurementScope: "EPISODE", sourceModalities: ["IMAGE_SCHEMA"],
    minimumEvidence: "VERIFIED_DECODED_EPISODE", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE"] }),
  definition({ id: "numeric_observation_feature_count", domain: "PHYSICAL", valueType: "INTEGER",
    unit: "count", measurementScope: "EPISODE", sourceModalities: ["OBSERVATION"],
    minimumEvidence: "VERIFIED_DECODED_EPISODE", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE"] }),
  definition({ id: "sensor_payload_decoded_ratio", domain: "PHYSICAL", valueType: "NUMBER",
    unit: "ratio_0_1", measurementScope: "EPISODE_OR_SUBTASK", sourceModalities: ["SOURCE_BYTES"],
    minimumEvidence: "PINNED_SOURCE_AND_EXPLICIT_DECODE_ACCOUNTING", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE"] }),
  definition({ id: "image_reference_count", domain: "PHYSICAL", valueType: "INTEGER",
    unit: "count", measurementScope: "SUBTASK", sourceModalities: ["SOURCE_METADATA"],
    minimumEvidence: "PINNED_REFERENCE_METADATA", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE"],
    interpretationBoundary: "IMAGE_REFERENCE_NOT_ACQUIRED_IMAGE_BYTES" }),
  definition({ id: "image_payload_verified_ratio", domain: "PHYSICAL", valueType: "NUMBER",
    unit: "ratio_0_1", measurementScope: "EPISODE_OR_SUBTASK", sourceModalities: ["IMAGE"],
    minimumEvidence: "EXACT_IMAGE_PAYLOAD_OR_VERIFIED_DECODE_COMMITMENT_ACCOUNTING",
    temporality: "FULL_TRAJECTORY", eligibleUses: ["FACTOR_COVERAGE"] }),
  ...[
    ["manual_anomaly_positive_frame_fraction", "NUMBER", "ratio_0_1"],
    ["manual_anomaly_first_onset_fraction", "NUMBER", "ratio_0_1"],
    ["manual_anomaly_positive_run_count", "INTEGER", "count"],
    ["manual_label_coverage_ratio", "NUMBER", "ratio_0_1"],
  ].map(([id, valueType, unit]) => definition({ id, domain: "PHYSICAL", valueType, unit,
    measurementScope: "FRAME_SEQUENCE", sourceModalities: ["PUBLISHER_MANUAL_LABEL"],
    minimumEvidence: "PINNED_MANUAL_FRAME_LABEL_SEQUENCE", temporality: "POST_OUTCOME",
    outcomeDerived: true, eligibleUses: ["TAXONOMY_UPDATE", "FACTOR_COVERAGE", "DESCRIPTIVE_COMPOSITION"],
    interpretationBoundary: "WITHIN_SELECTED_LABELED_EPISODE_MORPHOLOGY_NOT_ANOMALY_INCIDENCE" })),
  definition({ id: "source_native_subtask_failure_mode", domain: "PHYSICAL",
    valueType: "CATEGORY", unit: "category", measurementScope: "SUBTASK",
    sourceModalities: ["PUBLISHER_MANUAL_LABEL"], minimumEvidence: "PINNED_MANUAL_SUBTASK_LABEL",
    temporality: "POST_OUTCOME", outcomeDerived: true,
    eligibleUses: ["TAXONOMY_UPDATE", "FACTOR_COVERAGE", "DESCRIPTIVE_COMPOSITION"],
    interpretationBoundary: "SOURCE_CATEGORY_UNMAPPED_AND_NOT_CAUSAL_ATTRIBUTION" }),
  ...[
    ["same_step_command_observation_joint_position_delta_rms", "source-native-unverified"],
    ["same_step_command_observation_cartesian_translation_delta_rms", "source-native-unverified"],
    ["same_step_command_observation_cartesian_rotation_delta_rms", "source-native-unverified"],
    ["peak_abs_commanded_joint_velocity", "source-native-unverified"],
    ["peak_abs_commanded_cartesian_translation_velocity", "source-native-unverified"],
    ["peak_abs_commanded_cartesian_rotation_velocity", "source-native-unverified"],
    ["commanded_joint_position_step_delta_l2_peak", "source-native-unverified"],
    ["commanded_cartesian_translation_step_delta_l2_peak", "source-native-unverified"],
    ["commanded_cartesian_rotation_step_delta_l2_peak", "source-native-unverified"],
  ].map(([id, unit]) => definition({ id, domain: "PHYSICAL", valueType: "NUMBER", unit,
    measurementScope: "EPISODE", sourceModalities: ["ACTION", "OBSERVATION"],
    minimumEvidence: "VERIFIED_DECODED_NUMERIC_EPISODE", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE", "DESCRIPTIVE_ASSOCIATION"],
    interpretationBoundary: id.startsWith("same_step_")
      ? "SAME_STEP_NUMERIC_DIFFERENCE_NOT_TRACKING_ERROR_WITHOUT_TIMING_ALIGNMENT"
      : "SOURCE_UNITS_UNVERIFIED_NO_CROSS_PLATFORM_POOLING" })),
  definition({ id: "gripper_command_transition_count", domain: "PHYSICAL",
    valueType: "INTEGER", unit: "count", measurementScope: "EPISODE",
    sourceModalities: ["ACTION"], minimumEvidence: "VERIFIED_DECODED_NUMERIC_EPISODE",
    temporality: "FULL_TRAJECTORY", eligibleUses: ["FACTOR_COVERAGE", "DESCRIPTIVE_ASSOCIATION"] }),
  definition({ id: "observation_index_gap_max_steps", domain: "PHYSICAL",
    valueType: "INTEGER", unit: "steps", measurementScope: "EPISODE",
    sourceModalities: ["OBSERVATION"], minimumEvidence: "VERIFIED_CONTIGUOUS_STEP_INDEX",
    temporality: "FULL_TRAJECTORY", eligibleUses: ["FACTOR_COVERAGE"] }),
  definition({ id: "joint_limit_proximity_min", domain: "PHYSICAL", valueType: "NUMBER",
    unit: "configured_joint_unit", measurementScope: "EPISODE", sourceModalities: ["OBSERVATION", "ROBOT_CONFIGURATION"],
    minimumEvidence: "VERIFIED_JOINT_LIMIT_CONFIGURATION_AND_UNITS", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE", "DESCRIPTIVE_ASSOCIATION"] }),
  definition({ id: "workspace_boundary_proximity_min", domain: "PHYSICAL", valueType: "NUMBER",
    unit: "configured_workspace_unit", measurementScope: "EPISODE", sourceModalities: ["OBSERVATION", "ROBOT_CONFIGURATION"],
    minimumEvidence: "VERIFIED_WORKSPACE_BOUNDARY_COORDINATE_FRAME_AND_UNITS", temporality: "FULL_TRAJECTORY",
    eligibleUses: ["FACTOR_COVERAGE", "DESCRIPTIVE_ASSOCIATION"] }),
]);

function dictionary(id, domain, factors) {
  const sorted = [...factors].sort((left, right) => left.id.localeCompare(right.id));
  if (new Set(sorted.map((item) => item.id)).size !== sorted.length) {
    fail("EMPIRICAL_FACTOR_DICTIONARY_ID_DUPLICATED", id);
  }
  const body = { schema: EMPIRICAL_FACTOR_LEDGER_SCHEMAS.factorDictionary,
    schemaVersion: "1.0.0", id, domain, factors: sorted };
  return deepFreeze({ ...body,
    dictionaryHash: digest(body, EMPIRICAL_FACTOR_LEDGER_SCHEMAS.factorDictionary) });
}

export const EMPIRICAL_FACTOR_DICTIONARIES = Object.freeze({
  agent: dictionary("outsider-agent-empirical-factor-dictionary", "AGENT",
    AGENT_FACTOR_DEFINITIONS),
  physical: dictionary("outsider-physical-empirical-factor-dictionary", "PHYSICAL",
    PHYSICAL_FACTOR_DEFINITIONS),
});

const FACTOR_BY_ID = new Map(Object.values(EMPIRICAL_FACTOR_DICTIONARIES)
  .flatMap((item) => item.factors).map((item) => [item.id, item]));

function decision(status, ...reasonCodes) {
  if (!EMPIRICAL_ADMISSION_STATUSES.includes(status) || reasonCodes.length < 1
    || reasonCodes.some((reason) => !TOKEN.test(reason))) {
    fail("EMPIRICAL_CAPABILITY_DECISION_INVALID");
  }
  return Object.freeze({ status, reasonCodes: Object.freeze(sortedUnique(reasonCodes)) });
}

function closedDecisions() {
  return Object.fromEntries(HARD_CLOSED_CAPABILITIES.map((capability) => [capability,
    decision("FORBIDDEN", capability === "FREQUENCY_CALIBRATION"
      ? "NO_POPULATION_EXPOSURE_DENOMINATOR"
      : capability === "CAUSAL_EFFECT" ? "NO_INTERVENTION_OR_CAUSAL_IDENTIFICATION"
        : capability === "ECONOMIC_SEVERITY" ? "NO_ADJUDICATED_ECONOMIC_LOSS"
          : "NO_UPSTREAM_AUTHORITY_OR_ADMISSIBLE_ECONOMIC_MODEL") ]));
}

export function empiricalCapabilityAdmissions(sourceId) {
  const closed = closedDecisions();
  let open;
  if (sourceId === SOURCE_IDS.wave4) {
    open = {
      TAXONOMY_UPDATE: decision("ADMITTED", "PINNED_PUBLISHER_FAILURE_CATEGORIES"),
      FACTOR_SCHEMA_UPDATE: decision("ADMITTED", "FULL_SELECTED_TRACE_SHAPE"),
      FACTOR_COVERAGE: decision("ADMITTED", "FULL_SELECTED_TRACE_AND_ANNOTATION_JOIN"),
      DESCRIPTIVE_COMPOSITION: decision("ADMITTED", "CONDITIONAL_ON_PUBLISHER_SELECTED_FAILED_SPLIT"),
      DESCRIPTIVE_ASSOCIATION: decision("ADMITTED", "WITHIN_SELECTED_FAILURES_ONLY", "NO_POPULATION_INFERENCE"),
      OUTCOME_DISCRIMINATION: decision("ABSTAIN", "ONE_CLASS_FAILED_ONLY_SAMPLE"),
    };
  } else if (sourceId === SOURCE_IDS.wave3) {
    open = {
      TAXONOMY_UPDATE: decision("ADMITTED", "PINNED_PUBLISHER_PROCESS_LABEL_TOPOLOGY"),
      FACTOR_SCHEMA_UPDATE: decision("ADMITTED", "PINNED_METADATA_FIELDS"),
      FACTOR_COVERAGE: decision("ADMITTED", "METADATA_ONLY_COVERAGE_EXPLICIT"),
      DESCRIPTIVE_COMPOSITION: decision("ADMITTED", "CONDITIONAL_ON_PINNED_METADATA_SCOPE"),
      DESCRIPTIVE_ASSOCIATION: decision("ABSTAIN", "NO_TRACE_BYTES"),
      OUTCOME_DISCRIMINATION: decision("ABSTAIN", "NO_TRACE_DERIVED_PREDICTORS"),
    };
  } else if (sourceId === SOURCE_IDS.botfails) {
    open = {
      TAXONOMY_UPDATE: decision("ADMITTED", "MANUAL_ANOMALY_MORPHOLOGY_ONLY"),
      FACTOR_SCHEMA_UPDATE: decision("ADMITTED", "REAL_PHYSICAL_FRAME_LABEL_SCHEMA"),
      FACTOR_COVERAGE: decision("ADMITTED", "REAL_PHYSICAL_CONTEXT_AND_LABEL_COVERAGE"),
      DESCRIPTIVE_COMPOSITION: decision("ADMITTED", "WITHIN_SELECTED_LABELED_ANOMALY_EPISODES_ONLY"),
      DESCRIPTIVE_ASSOCIATION: decision("ABSTAIN", "SENSOR_PAYLOAD_NOT_DECODED"),
      OUTCOME_DISCRIMINATION: decision("ABSTAIN", "NOMINAL_TRAIN_IS_NOT_SUCCESS_ADJUDICATION"),
    };
  } else if (sourceId === SOURCE_IDS.ur5) {
    open = {
      TAXONOMY_UPDATE: decision("ADMITTED", "SOURCE_NATIVE_SUBTASK_FAILURE_CATEGORIES"),
      FACTOR_SCHEMA_UPDATE: decision("ADMITTED", "REAL_PHYSICAL_SUBTASK_METADATA_SCHEMA"),
      FACTOR_COVERAGE: decision("ADMITTED", "REAL_PHYSICAL_CONTEXT_AND_REFERENCE_COVERAGE"),
      DESCRIPTIVE_COMPOSITION: decision("ADMITTED", "WITHIN_SELECTED_CORRELATED_SUBTASK_ROWS_ONLY"),
      DESCRIPTIVE_ASSOCIATION: decision("ABSTAIN", "IMAGE_BYTES_NOT_ACQUIRED", "CORRELATED_SUBTASK_ROWS"),
      OUTCOME_DISCRIMINATION: decision("ABSTAIN", "NO_TRACE_DERIVED_PREDICTORS"),
    };
  } else if (sourceId === SOURCE_IDS.droid) {
    open = {
      TAXONOMY_UPDATE: decision("ABSTAIN", "NO_ADJUDICATED_FAILURE_CATEGORY"),
      FACTOR_SCHEMA_UPDATE: decision("ADMITTED", "REAL_PHYSICAL_NUMERIC_ACTION_OBSERVATION_SCHEMA"),
      FACTOR_COVERAGE: decision("ADMITTED", "FULL_SOURCE_REPRODUCED_NUMERIC_EPISODES"),
      DESCRIPTIVE_COMPOSITION: decision("ABSTAIN", "RECORDED_REWARD_SEMANTICS_UNADJUDICATED"),
      DESCRIPTIVE_ASSOCIATION: decision("ABSTAIN", "NO_ADJUDICATED_OUTCOME_TARGET"),
      OUTCOME_DISCRIMINATION: decision("ABSTAIN", "NO_ADJUDICATED_OUTCOME_TARGET"),
    };
  } else if (sourceId === SOURCE_IDS.nhtsa) {
    open = {
      TAXONOMY_UPDATE: decision("ADMITTED", "SOURCE_REPLAYED_PUBLISHER_INCIDENT_TAXONOMY"),
      FACTOR_SCHEMA_UPDATE: decision("ADMITTED", "DESCRIPTIVE_TAXONOMY_SCHEMA_DISCOVERY_ONLY"),
      FACTOR_COVERAGE: decision("ABSTAIN", "INCIDENT_REPORT_NOT_FACTOR_PREDICTOR_ROW"),
      DESCRIPTIVE_COMPOSITION: decision("ADMITTED", "WITHIN_FROZEN_REPORTED_INCIDENT_SET_ONLY"),
      DESCRIPTIVE_ASSOCIATION: decision("ABSTAIN", "NO_INDEPENDENT_EVENT_UNITS_OR_DENOMINATOR"),
      OUTCOME_DISCRIMINATION: decision("ABSTAIN", "NO_ADJUDICATED_OUTCOME_TARGET"),
    };
  } else fail("EMPIRICAL_SOURCE_ID_UNSUPPORTED", sourceId);
  const output = Object.freeze({ ...open, ...closed });
  if (!same(Object.keys(output).sort(), [...EMPIRICAL_CAPABILITIES].sort())) {
    fail("EMPIRICAL_CAPABILITY_SET_INVALID", sourceId);
  }
  return output;
}

function permission(status, reason) {
  const statuses = ["DECLARED_ALLOWED_SCOPE", "DENIED_BY_POLICY", "UNRESOLVED"];
  if (!statuses.includes(status) || !TOKEN.test(reason)) {
    fail("EMPIRICAL_USE_PERMISSION_INVALID");
  }
  return Object.freeze({ status, reason });
}

function usePermission({ licenseIdentifiers, rightsScope, declarationBinding,
  byteEquivalence, rawRedistributionReason = "RAW_REDISTRIBUTION_NOT_REVIEWED" }) {
  return Object.freeze({
    licenseIdentifiers: Object.freeze([...licenseIdentifiers]),
    rightsScope,
    declarationBinding,
    byteEquivalence,
    legalConclusion: false,
    permissions: Object.freeze({
      PERSIST_NORMALIZED: permission("DECLARED_ALLOWED_SCOPE", "SELECTED_DECLARED_LICENSE_SCOPE"),
      PERSIST_RAW: permission("DENIED_BY_POLICY", "PRIVACY_MINIMIZED_LEDGER"),
      COMPUTE_AGGREGATES: permission("DECLARED_ALLOWED_SCOPE", "SELECTED_DECLARED_LICENSE_SCOPE"),
      BUILD_TAXONOMY: permission("DECLARED_ALLOWED_SCOPE", "SELECTED_DECLARED_LICENSE_SCOPE"),
      FIT_DESCRIPTIVE_MECHANISM: permission("DECLARED_ALLOWED_SCOPE", "SELECTED_DECLARED_LICENSE_SCOPE"),
      FIT_PREDICTIVE_MODEL: permission("DECLARED_ALLOWED_SCOPE", "LICENSE_SCOPE_ONLY_EVIDENCE_GATE_SEPARATE"),
      AUTOMATIC_TRAINING: permission("DENIED_BY_POLICY", "PUBLIC_EVIDENCE_NO_AUTOMATIC_TRAINING"),
      REDISTRIBUTE_DERIVED: permission("DECLARED_ALLOWED_SCOPE", "ATTRIBUTION_AND_NOTICE_REMAIN_REQUIRED"),
      REDISTRIBUTE_RAW: permission("UNRESOLVED", rawRedistributionReason),
      COMMERCIAL_USE: permission("UNRESOLVED", "LEGAL_REVIEW_NOT_PERFORMED"),
    }),
  });
}

function unresolvedPublicAccessPermission() {
  const unresolved = (reason) => permission("UNRESOLVED", reason);
  return Object.freeze({
    licenseIdentifiers: Object.freeze([]),
    rightsScope: "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY",
    declarationBinding: "OFFICIAL_PUBLICATION_IS_NOT_REUSE_OR_TRAINING_RIGHTS_GRANT",
    byteEquivalence: "EXACT_PUBLIC_CSV_AND_DICTIONARY_REPLAYED_RIGHTS_NOT_ESTABLISHED",
    legalConclusion: false,
    permissions: Object.freeze({
      PERSIST_NORMALIZED: unresolved("RECORD_LEVEL_REUSE_RIGHTS_NOT_ESTABLISHED"),
      PERSIST_RAW: permission("DENIED_BY_POLICY", "PRIVACY_MINIMIZED_LEDGER"),
      COMPUTE_AGGREGATES: unresolved("DESCRIPTIVE_USE_DOES_NOT_ESTABLISH_REUSE_RIGHTS"),
      BUILD_TAXONOMY: unresolved("DESCRIPTIVE_USE_DOES_NOT_ESTABLISH_REUSE_RIGHTS"),
      FIT_DESCRIPTIVE_MECHANISM: permission("DENIED_BY_POLICY", "INCIDENT_TAXONOMY_IS_NOT_MECHANISM_TRUTH"),
      FIT_PREDICTIVE_MODEL: permission("DENIED_BY_POLICY", "NO_FACTOR_PREDICTOR_OR_MODEL_AUTHORITY"),
      AUTOMATIC_TRAINING: permission("DENIED_BY_POLICY", "PUBLIC_ACCESS_NO_AUTOMATIC_TRAINING"),
      REDISTRIBUTE_DERIVED: unresolved("DERIVED_REDISTRIBUTION_RIGHTS_NOT_ESTABLISHED"),
      REDISTRIBUTE_RAW: unresolved("RAW_REDISTRIBUTION_RIGHTS_NOT_ESTABLISHED"),
      COMMERCIAL_USE: unresolved("COMMERCIAL_USE_RIGHTS_NOT_ESTABLISHED"),
    }),
  });
}

function claimSupport(overrides = {}) {
  const base = {
    MECHANISM_OCCURRENCE: "UNSUPPORTED",
    FAILURE_TAXONOMY: "UNSUPPORTED",
    WITHIN_SELECTED_SCOPE_COMPOSITION: "DESCRIPTIVE_ONLY",
    FACTOR_OUTCOME_ASSOCIATION: "UNSUPPORTED",
    FREQUENCY: "UNSUPPORTED",
    CAUSAL_EFFECT: "UNSUPPORTED",
    PHYSICAL_CONSEQUENCE: "UNSUPPORTED",
    ECONOMIC_LOSS: "UNSUPPORTED",
    LIABILITY: "UNSUPPORTED",
  };
  const allowed = new Set(["SUPPORTED", "DESCRIPTIVE_ONLY", "UNSUPPORTED", "NOT_EVALUATED"]);
  const output = { ...base, ...overrides };
  if (Object.values(output).some((value) => !allowed.has(value))) {
    fail("EMPIRICAL_CLAIM_SUPPORT_INVALID");
  }
  return Object.freeze(output);
}

function sourceProfile({ sourceId, sourceBinding, sourceReality, evidenceAuthority,
  rights }) {
  const ontologyReference = publicEvidenceOntologyReference(sourceId);
  const checked = verifyPublicEvidenceOntologyReference(ontologyReference);
  if (!checked.ok) fail("EMPIRICAL_ONTOLOGY_REFERENCE_INVALID", checked.error);
  const body = {
    schema: EMPIRICAL_FACTOR_LEDGER_SCHEMAS.sourceProfile,
    schemaVersion: "1.0.0",
    sourceId,
    ontologyReference,
    sourceBinding,
    sourceReality,
    evidenceAuthority,
    usePermission: rights,
    capabilityAdmissions: empiricalCapabilityAdmissions(sourceId),
    statisticalBoundary: {
      correlationRootCompletenessEstablished: false,
      provenanceRootsAreStatisticalDependenceRoots: false,
      rowCountIsIndependentExposureCount: false,
      exposureDenominatorObserved: false,
      populationFrequencyEstimable: false,
      causalEffectIdentified: false,
      economicLossObserved: false,
    },
  };
  return deepFreeze({ ...body,
    profileHash: digest(body, EMPIRICAL_FACTOR_LEDGER_SCHEMAS.sourceProfile) });
}

function buildSourceProfiles({ wave3, wave4, botfails, ur5, droid, nhtsa }) {
  return Object.freeze([
    sourceProfile({
      sourceId: SOURCE_IDS.wave3,
      sourceBinding: { manifestHash: wave3.manifest.manifestHash,
        recordSetHash: wave3.recordSet.recordSetHash,
        verificationHash: wave3.verification.verificationHash,
        selectedRows: wave3.records.length },
      sourceReality: {
        executionEnvironment: "CONTROLLED_REAL_APP_METADATA",
        executionObservation: "METADATA_ONLY",
        selectedScope: "COMPLETE_PINNED_METADATA_SCOPE",
        samplingDesign: "PUBLISHER_BENCHMARK_METADATA_SCOPE",
        outcomeAscertainment: "SOURCE_NATIVE_METADATA_LABEL",
        traceBytesAcquired: 0,
        referencedTraceBytesAreAcquiredBytes: false,
        realPhysicalExecutionRecorded: false,
        liveProductionSideEffectEstablished: false,
      },
      evidenceAuthority: {
        sourceByteIdentity: "PINNED_METADATA_BYTES_AND_GIT_TREE_VERIFIED",
        labelAuthority: "PUBLISHER_DECLARED_HUMAN_REVIEWED_METADATA",
        independentAnnotatorIdentityVerified: false,
        executionReplayed: false,
        traceDerivedMechanismEstablished: false,
        claimSupport: claimSupport({ FAILURE_TAXONOMY: "DESCRIPTIVE_ONLY" }),
      },
      rights: usePermission({ licenseIdentifiers: ["Apache-2.0"],
        rightsScope: "REPOSITORY_AUTHORED_CODE_ANNOTATIONS_METADATA_AND_DOCUMENTATION_ONLY",
        declarationBinding: "PINNED_DECLARATION_BYTES_VERIFIED",
        byteEquivalence: "UPSTREAM_TRACE_BYTES_NOT_ACQUIRED_OR_COVERED",
        rawRedistributionReason: "UPSTREAM_TRACE_RIGHTS_UNRESOLVED" }),
    }),
    sourceProfile({
      sourceId: SOURCE_IDS.wave4,
      sourceBinding: { manifestHash: wave4.manifest.manifestHash,
        recordSetHash: wave4.recordSet.recordSetHash,
        verificationHash: wave4.verification.verificationHash,
        selectedRows: wave4.records.length },
      sourceReality: {
        executionEnvironment: "STRUCTURED_API_SANDBOX",
        executionObservation: "FULL_SELECTED_TRACE_BYTES_VERIFIED",
        selectedScope: "COMPLETE_PINNED_TAU_FAILED_SPLIT_SELECTION",
        samplingDesign: "OUTCOME_CONDITIONED_FAILED_ONLY",
        outcomeAscertainment: "BENCHMARK_FAILURE_ONLY",
        traceBytesAcquired: AGENTRX_TAU_WAVE4_PIN.trajectoryContainerBytes,
        referencedTraceBytesAreAcquiredBytes: true,
        realPhysicalExecutionRecorded: false,
        liveProductionSideEffectEstablished: false,
      },
      evidenceAuthority: {
        sourceByteIdentity: "PINNED_BYTES_GIT_TREE_AND_EXACT_ROW_JOIN_VERIFIED",
        labelAuthority: "PUBLISHER_MANUAL_FAILURE_ANNOTATION",
        independentAnnotatorIdentityVerified: false,
        executionReplayed: false,
        traceDerivedMechanismEstablished: "PUBLISHER_ANNOTATED_ONLY",
        claimSupport: claimSupport({ MECHANISM_OCCURRENCE: "DESCRIPTIVE_ONLY",
          FAILURE_TAXONOMY: "SUPPORTED", FACTOR_OUTCOME_ASSOCIATION: "DESCRIPTIVE_ONLY" }),
      },
      rights: usePermission({ licenseIdentifiers: ["MIT", "CC-BY-4.0-LINKED-CARD"],
        rightsScope: "SELECTED_GITHUB_BYTES_MIT_DECLARATION_ONLY",
        declarationBinding: "PINNED_REPOSITORY_AND_LINKED_CARD_DECLARATIONS_VERIFIED",
        byteEquivalence: "GITHUB_TO_GATED_DATASET_EQUIVALENCE_NOT_ESTABLISHED",
        rawRedistributionReason: "GATED_DATASET_EQUIVALENCE_AND_PRIVACY_REVIEW_UNRESOLVED" }),
    }),
    sourceProfile({
      sourceId: SOURCE_IDS.botfails,
      sourceBinding: { manifestHash: botfails.manifest.manifestHash,
        summaryHash: botfails.summary.summaryHash, selectedRows: botfails.records.length },
      sourceReality: {
        executionEnvironment: "REAL_ROBOT_TELEOPERATION",
        executionObservation: "SELECTED_PARQUET_AND_MANUAL_LABEL_BYTES_VERIFIED",
        selectedScope: "SINGLE_TASK_TEN_ANOMALY_AND_TEN_NOMINAL_TRAIN_EPISODES",
        samplingDesign: "CONVENIENCE_SELECTED_SPLITS",
        outcomeAscertainment: "MANUAL_LABELS_FOR_ANOMALY_SPLIT_ONLY",
        traceBytesAcquired: 0,
        sensorPayloadDecoded: false,
        realPhysicalExecutionRecorded: true,
        physicalHarmOrLossEstablished: false,
      },
      evidenceAuthority: {
        sourceByteIdentity: "PINNED_REPOSITORY_SOURCE_REDERIVED",
        labelAuthority: "PUBLISHER_MANUAL_FRAME_ANOMALY_LABEL",
        independentAnnotatorIdentityVerified: false,
        executionReplayed: false,
        traceDerivedMechanismEstablished: false,
        claimSupport: claimSupport({ MECHANISM_OCCURRENCE: "DESCRIPTIVE_ONLY",
          FAILURE_TAXONOMY: "DESCRIPTIVE_ONLY", PHYSICAL_CONSEQUENCE: "DESCRIPTIVE_ONLY" }),
      },
      rights: usePermission({ licenseIdentifiers: ["Apache-2.0"],
        rightsScope: "PINNED_SELECTED_REPOSITORY_BYTES",
        declarationBinding: "HF_CARD_AND_PINNED_README_DECLARATION_VERIFIED",
        byteEquivalence: "SELECTED_OBJECT_BINDING_VERIFIED" }),
    }),
    sourceProfile({
      sourceId: SOURCE_IDS.ur5,
      sourceBinding: { manifestHash: ur5.manifest.manifestHash,
        summaryHash: ur5.summary.summaryHash, selectedRows: ur5.records.length },
      sourceReality: {
        executionEnvironment: "REAL_ROBOT_AUTONOMOUS_POLICY_EXECUTION",
        executionObservation: "PINNED_SUBTASK_METADATA_ONLY_IMAGE_REFERENCES_NOT_ACQUIRED",
        selectedScope: "ALL_140_SELECTED_EXECUTION_METADATA_ROWS",
        samplingDesign: "PUBLISHER_BENCHMARK_CORRELATED_SUBTASK_ROWS",
        outcomeAscertainment: "SOURCE_NATIVE_MANUAL_SUBTASK_LABEL",
        traceBytesAcquired: 0,
        imageBytesAcquired: 0,
        realPhysicalExecutionRecorded: true,
        physicalHarmOrLossEstablished: false,
      },
      evidenceAuthority: {
        sourceByteIdentity: "PINNED_REPOSITORY_SOURCE_REDERIVED",
        labelAuthority: "PUBLISHER_MANUAL_SUBTASK_LABEL",
        independentAnnotatorIdentityVerified: false,
        executionReplayed: false,
        traceDerivedMechanismEstablished: false,
        claimSupport: claimSupport({ MECHANISM_OCCURRENCE: "DESCRIPTIVE_ONLY",
          FAILURE_TAXONOMY: "SUPPORTED", PHYSICAL_CONSEQUENCE: "DESCRIPTIVE_ONLY" }),
      },
      rights: usePermission({ licenseIdentifiers: ["Apache-2.0"],
        rightsScope: "PINNED_SELECTED_REPOSITORY_METADATA_BYTES",
        declarationBinding: "HF_CARD_AND_PINNED_README_DECLARATION_VERIFIED",
        byteEquivalence: "REFERENCED_IMAGE_BYTES_NOT_ACQUIRED" }),
    }),
    sourceProfile({
      sourceId: SOURCE_IDS.droid,
      sourceBinding: { manifestHash: droid.artifacts.manifest.manifestHash,
        reportHash: droid.reportHash, artifactSetHash: droid.artifactSetHash,
        checkpointHash: droid.checkpointHash, selectedRows: droid.episodeCount },
      sourceReality: {
        executionEnvironment: "REAL_ROBOT_HISTORICAL_PUBLIC_DATASET",
        executionObservation: "FULL_SOURCE_REPRODUCED_NUMERIC_EPISODE_PROJECTION",
        selectedScope: "FIRST_SHARD_TWO_EPISODE_CONVENIENCE_SLICE",
        samplingDesign: "CONVENIENCE_FIRST_SHARD",
        outcomeAscertainment: "RECORDED_REWARD_SEMANTICS_UNADJUDICATED",
        traceBytesAcquired: droid.artifacts.report.source.transport.verifiedWholeObject
          ? droid.artifacts.manifest.objects.find((item) => item.role === "TFRECORD_SHARD")?.sizeBytes ?? 0 : 0,
        numericSensorPayloadDecoded: true,
        imagePayloadDecodedForCommitment: true,
        realPhysicalExecutionRecorded: true,
        physicalHarmOrLossEstablished: false,
      },
      evidenceAuthority: {
        sourceByteIdentity: "PINNED_SHARD_FULL_SOURCE_REPRODUCED",
        labelAuthority: "SOURCE_NATIVE_REWARD_UNINTERPRETED",
        independentAnnotatorIdentityVerified: false,
        executionReplayed: false,
        traceDerivedMechanismEstablished: false,
        claimSupport: claimSupport({ PHYSICAL_CONSEQUENCE: "NOT_EVALUATED" }),
      },
      rights: usePermission({ licenseIdentifiers: ["CC-BY-4.0"],
        rightsScope: "OFFICIAL_PAPER_DECLARATION_FOR_DROID_DATASET",
        declarationBinding: "DECLARED_BY_OFFICIAL_PAPER_NOT_GCS_OBJECT_METADATA",
        byteEquivalence: "PINNED_GCS_SHARD_IDENTITY_VERIFIED_LICENSE_OBJECT_METADATA_ABSENT",
        rawRedistributionReason: "RAW_MEDIA_REDISTRIBUTION_AND_ATTRIBUTION_REVIEW_UNRESOLVED" }),
    }),
    sourceProfile({
      sourceId: SOURCE_IDS.nhtsa,
      sourceBinding: {
        registryId: nhtsa.replay.registryId,
        registryIndexHash: nhtsa.replay.registryIndexHash,
        registryArtifactSetHash: nhtsa.replay.artifactSetHash,
        sourceReplayVerificationHash: nhtsa.replay.verificationHash,
        csvHash: NHTSA_SGO_STAGE1_FROZEN_SCOPE.csv.sha256,
        dataDictionaryHash: NHTSA_SGO_STAGE1_FROZEN_SCOPE.dataDictionary.sha256,
        incidentTaxonomySetHash: nhtsa.incidentTaxonomySetHash,
        selectedRows: nhtsa.quarantine.reports.length,
        rawReportVersions: nhtsa.quarantine.counts.rawReportRows,
        supersededOrDuplicateVersions:
          nhtsa.quarantine.counts.historicalOrDuplicateVersions,
      },
      sourceReality: {
        executionEnvironment: "REAL_WORLD_PHYSICAL_INCIDENT_REPORTING",
        executionObservation: "REPORTING_ENTITY_SUBMISSION_PRIVACY_PROJECTION",
        selectedScope: "LATEST_VERSION_PER_NATIVE_REPORT_ID_IN_FROZEN_OFFICIAL_CSV",
        samplingDesign: "REGULATORY_REPORTING_SUBMISSIONS_NO_COMPLETE_EXPOSURE_FRAME",
        outcomeAscertainment: "PUBLISHER_REPORTED_INCIDENT_ALLEGATION",
        traceBytesAcquired: 0,
        realPhysicalIncidentReportRecorded: true,
        underlyingExecutionIndependentlyObserved: false,
        independentIncidentEventEstablished: false,
        physicalHarmOrLossEstablished: false,
      },
      evidenceAuthority: {
        sourceByteIdentity: "PINNED_OFFICIAL_CSV_AND_DATA_DICTIONARY_SOURCE_REPLAYED",
        labelAuthority: "PUBLISHER_REPORTED_ALLEGED_NOT_INDEPENDENTLY_ADJUDICATED",
        independentAnnotatorIdentityVerified: false,
        executionReplayed: false,
        traceDerivedMechanismEstablished: false,
        claimSupport: claimSupport({ FAILURE_TAXONOMY: "DESCRIPTIVE_ONLY" }),
      },
      rights: unresolvedPublicAccessPermission(),
    }),
  ].sort((left, right) => left.sourceId.localeCompare(right.sourceId)));
}

function validateFactorValue(definitionValue, value) {
  if (definitionValue.valueType === "INTEGER") {
    return Number.isSafeInteger(value) && value >= 0;
  }
  if (definitionValue.valueType === "NUMBER") {
    return finite(value) && (!definitionValue.unit.startsWith("ratio_") || value >= 0 && value <= 1);
  }
  if (definitionValue.valueType === "BOOLEAN") return typeof value === "boolean";
  if (definitionValue.valueType === "CATEGORY") {
    return typeof value === "string" && value.length > 0 && value.length <= 256;
  }
  return false;
}

function factorRow({ sourceId, unitIdHash, sourceRecordHash, measurementScope,
  provenanceRoots, dependenceRoots, factorValues, missing = {} }) {
  if (!HASH.test(unitIdHash ?? "") || !HASH.test(sourceRecordHash ?? "")
    || !TOKEN.test(measurementScope ?? "") || !plain(factorValues) || !plain(missing)) {
    fail("EMPIRICAL_FACTOR_ROW_INPUT_INVALID", sourceId);
  }
  const values = Object.fromEntries(Object.entries(factorValues)
    .sort(([left], [right]) => left.localeCompare(right)));
  const absent = Object.fromEntries(Object.entries(missing)
    .sort(([left], [right]) => left.localeCompare(right)));
  for (const [id, value] of Object.entries(values)) {
    const factor = FACTOR_BY_ID.get(id);
    if (!factor || !validateFactorValue(factor, value) || Object.hasOwn(absent, id)) {
      fail("EMPIRICAL_FACTOR_VALUE_INVALID", id);
    }
  }
  for (const [id, reason] of Object.entries(absent)) {
    if (!FACTOR_BY_ID.has(id) || !TOKEN.test(reason) || Object.hasOwn(values, id)) {
      fail("EMPIRICAL_FACTOR_MISSINGNESS_INVALID", id);
    }
  }
  const body = {
    schema: EMPIRICAL_FACTOR_LEDGER_SCHEMAS.factorRow,
    schemaVersion: "1.0.0",
    sourceId,
    unitIdHash,
    sourceRecordHash,
    measurementScope,
    provenanceRoots: sortedUnique(provenanceRoots),
    dependenceRoots: sortedUnique(dependenceRoots),
    factorValues: values,
    missing: absent,
    interpretation: {
      provenanceRootsAreStatisticalDependenceRoots: false,
      preActionPredictorEligibilityInferred: false,
      missingValuesZeroImputed: false,
      crossSourceUnitCompatibilityEstablished: false,
    },
  };
  return deepFreeze({ ...body,
    rowHash: digest(body, EMPIRICAL_FACTOR_LEDGER_SCHEMAS.factorRow) });
}

function buildWave3FactorRows(wave3) {
  return wave3.records.map((record) => {
    const counts = {
      publisher_key_good_in_success_count: record.labels.keyGoodInSuccess.length,
      publisher_key_bad_in_success_count: record.labels.keyBadInSuccess.length,
      publisher_key_good_after_bad_in_success_count: record.labels.keyGoodAfterBadInSuccess.length,
      publisher_key_bad_in_fail_count: record.labels.keyBadInFail.length,
      publisher_key_good_before_bad_in_fail_count: record.labels.keyGoodBeforeBadInFail.length,
    };
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return factorRow({
      sourceId: SOURCE_IDS.wave3,
      unitIdHash: record.identity.identityHash,
      sourceRecordHash: record.recordHash,
      measurementScope: "METADATA_ROW",
      provenanceRoots: [record.identity.datasetRoot],
      dependenceRoots: [record.identity.taskRoot, record.identity.modelRoot,
        record.identity.taskTypeRoot],
      factorValues: {
        publisher_annotation_step_count: record.labels.stepCount,
        publisher_process_label_count: total,
        ...counts,
        publisher_labeled_good_after_bad_pattern_present:
          record.labels.keyGoodAfterBadInSuccess.length > 0,
        publisher_annotation_density: total / record.labels.stepCount,
        referenced_screenshot_object_count: record.sourceBinding.referencedScreenshotObjects,
        referenced_trajectory_object_count: record.sourceBinding.referencedTrajectoryObjects,
        trace_bytes_acquired: record.sourceBinding.traceBytesAcquired,
      },
      missing: {
        agent_trajectory_turn_count: "TRACE_BYTES_NOT_ACQUIRED",
        agent_tool_call_count: "TRACE_BYTES_NOT_ACQUIRED",
        agent_tool_result_pairing_ratio: "TRACE_BYTES_NOT_ACQUIRED",
      },
    });
  });
}

function buildWave4FactorRows(wave4) {
  return wave4.records.map((record) => factorRow({
    sourceId: SOURCE_IDS.wave4,
    unitIdHash: record.identity.identityHash,
    sourceRecordHash: record.recordHash,
    measurementScope: "TRAJECTORY",
    provenanceRoots: [record.identity.datasetRoot],
    dependenceRoots: [record.identity.taskRoot, record.identity.sourceRoot],
    factorValues: {
      agent_trajectory_turn_count: record.sourceBinding.turnCount,
      agent_tool_call_count: record.sourceBinding.toolCallCount,
      agent_tool_result_pairing_ratio: 1,
      agent_write_like_tool_call_count: record.sourceBinding.writeLikeToolCallCount,
      agent_write_like_tool_fraction: record.sourceBinding.toolCallCount === 0
        ? 0 : record.sourceBinding.writeLikeToolCallCount / record.sourceBinding.toolCallCount,
      publisher_annotated_failure_event_count: record.labels.annotatedFailureCount,
      publisher_designated_root_cause_step_fraction:
        record.labels.rootCauseStep / record.sourceBinding.turnCount,
      publisher_failures_before_designated_root_count: record.labels.failuresBeforeRootCause,
      publisher_designated_root_cause_actor: record.labels.rootCauseFailedAgent,
      publisher_designated_root_cause_category: record.labels.rootCauseCategory,
      publisher_designated_root_after_prior_failure: record.labels.failuresBeforeRootCause > 0,
    },
  }));
}

function buildBotFailsFactorRows(botfails) {
  return botfails.records.map((record) => {
    const labels = record.truth.frameLabels;
    const factorValues = {
      physical_execution_control_mode: "TELEOPERATION",
      robot_platform_class: record.collection.robot,
      policy_identity_class: record.collection.policy,
      collection_process_class: "CONTROLLED_PUBLIC_DATASET",
      declared_frame_count: record.commitments.declaredFrameCount,
      control_frequency_hz: record.collection.fps,
      declared_frame_span_ms: (record.commitments.declaredFrameCount - 1)
        / record.collection.fps * 1_000,
      sensor_payload_decoded_ratio: record.commitments.sensorPayloadDecoded ? 1 : 0,
      image_payload_verified_ratio: record.commitments.videoDownloaded ? 1 : 0,
    };
    const missing = {
      trajectory_duration_ms: "MEASURED_TIMESTAMPS_NOT_ACQUIRED",
      image_reference_count: "SOURCE_PARQUET_PAYLOAD_NOT_DECODED",
    };
    if (labels) {
      factorValues.manual_anomaly_positive_frame_fraction =
        labels.positiveCount / labels.frameCount;
      if (labels.firstPositiveIndex === null) {
        missing.manual_anomaly_first_onset_fraction = "NO_POSITIVE_FRAME_LABEL";
      } else {
        factorValues.manual_anomaly_first_onset_fraction =
          labels.firstPositiveIndex / labels.frameCount;
      }
      factorValues.manual_anomaly_positive_run_count = labels.positiveRuns;
      factorValues.manual_label_coverage_ratio = labels.frameCount / labels.declaredFrameCount;
    } else {
      for (const id of ["manual_anomaly_positive_frame_fraction",
        "manual_anomaly_first_onset_fraction", "manual_anomaly_positive_run_count",
        "manual_label_coverage_ratio"]) missing[id] = "NO_MANUAL_LABEL_FOR_NOMINAL_TRAIN_MEMBERSHIP";
    }
    return factorRow({
      sourceId: SOURCE_IDS.botfails,
      unitIdHash: record.recordIdHash,
      sourceRecordHash: record.recordHash,
      measurementScope: labels ? "FRAME_SEQUENCE" : "EPISODE",
      provenanceRoots: [record.correlation.datasetRoot],
      dependenceRoots: [record.correlation.taskRoot, record.correlation.robotRoot,
        record.correlation.policyRoot, record.correlation.episodeRoot],
      factorValues,
      missing,
    });
  });
}

function buildUr5FactorRows(ur5) {
  return ur5.records.map((record) => {
    const failed = record.truth.value === "SUBTASK_FAILURE";
    return factorRow({
      sourceId: SOURCE_IDS.ur5,
      unitIdHash: record.recordIdHash,
      sourceRecordHash: record.recordHash,
      measurementScope: "SUBTASK",
      provenanceRoots: [record.correlation.datasetRoot],
      dependenceRoots: [record.correlation.taskRoot, record.correlation.robotRoot,
        record.correlation.policyRoot, record.correlation.episodeRoot],
      factorValues: {
        physical_execution_control_mode: "AUTONOMOUS_POLICY_EXECUTION",
        robot_platform_class: record.collection.robot,
        policy_identity_class: record.collection.policy,
        collection_process_class: "CONTROLLED_PUBLIC_DATASET",
        image_reference_count: record.commitments.imageReferenceCount,
        sensor_payload_decoded_ratio: 0,
        image_payload_verified_ratio: record.commitments.imageBytesDownloaded ? 1 : 0,
        ...(failed ? { source_native_subtask_failure_mode: record.truth.failureMode } : {}),
      },
      missing: {
        physical_step_count: "TRAJECTORY_BYTES_NOT_ACQUIRED",
        trajectory_duration_ms: "TRAJECTORY_BYTES_NOT_ACQUIRED",
        ...(!failed ? { source_native_subtask_failure_mode: "NOT_A_SOURCE_LABELED_FAILURE_ROW" } : {}),
      },
    });
  });
}

function vector(step, container, prefix, dimensions) {
  return Array.from({ length: dimensions }, (_, index) => {
    const value = step[container].features[`${prefix}_${index}`];
    if (!finite(value)) fail("EMPIRICAL_DROID_VECTOR_INVALID", `${prefix}_${index}`);
    return value;
  });
}
function l2(values) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}
function rms(values) {
  return values.length === 0 ? 0 : Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0) / values.length,
  );
}
function peakAbsolute(vectors) {
  return Math.max(...vectors.flat().map((value) => Math.abs(value)));
}
function peakStepDelta(vectors) {
  let peak = 0;
  for (let index = 1; index < vectors.length; index += 1) {
    peak = Math.max(peak, l2(vectors[index].map((value, offset) => value - vectors[index - 1][offset])));
  }
  return peak;
}

function buildDroidFactorRows(droid) {
  return droid.artifacts.episodes.map((episode) => {
    const steps = episode.steps;
    if (steps.length < 1 || steps.some((step, index) => step.index !== index)) {
      fail("EMPIRICAL_DROID_STEP_SEQUENCE_INVALID");
    }
    const commandedJoint = steps.map((step) => vector(step, "action", "commanded_joint_position", 7));
    const observedJoint = steps.map((step) => vector(step, "observation", "joint_position", 7));
    const commandedCartesian = steps.map((step) => vector(step, "action", "commanded_cartesian_position", 6));
    const observedCartesian = steps.map((step) => vector(step, "observation", "cartesian_position", 6));
    const jointVelocity = steps.map((step) => vector(step, "action", "commanded_joint_velocity", 7));
    const cartesianVelocity = steps.map((step) => vector(step, "action", "commanded_cartesian_velocity", 6));
    const gripper = steps.map((step) => {
      const value = step.action.features.commanded_gripper_position;
      if (!finite(value)) fail("EMPIRICAL_DROID_GRIPPER_INVALID");
      return value;
    });
    const imageCounts = sortedUnique(steps.map((step) => step.observation.images.length));
    const observationCounts = sortedUnique(steps.map(
      (step) => Object.keys(step.observation.features).length));
    if (imageCounts.length !== 1 || observationCounts.length !== 1) {
      fail("EMPIRICAL_DROID_MODALITY_COUNT_INCONSISTENT");
    }
    const jointDifference = commandedJoint.flatMap((row, index) =>
      row.map((value, offset) => value - observedJoint[index][offset]));
    const cartesianTranslationDifference = commandedCartesian.flatMap((row, index) =>
      row.slice(0, 3).map((value, offset) => value - observedCartesian[index][offset]));
    const cartesianRotationDifference = commandedCartesian.flatMap((row, index) =>
      row.slice(3, 6).map((value, offset) => value - observedCartesian[index][offset + 3]));
    let gripperTransitions = 0;
    for (let index = 1; index < gripper.length; index += 1) {
      if (gripper[index] !== gripper[index - 1]) gripperTransitions += 1;
    }
    return factorRow({
      sourceId: SOURCE_IDS.droid,
      unitIdHash: episode.episodeIdHash,
      sourceRecordHash: episode.episodeHash,
      measurementScope: "EPISODE",
      provenanceRoots: [episode.source.datasetManifestHash, episode.source.sourceObjectHash,
        episode.instrument.extractorImplementationHash],
      dependenceRoots: [episode.episodeHash],
      factorValues: {
        robot_platform_class: episode.platformClass,
        collection_process_class: "HISTORICAL_PUBLIC_DATASET",
        physical_step_count: steps.length,
        action_observation_pairing_ratio: 1,
        terminal_boundary_observed: steps.at(-1).boundary.isTerminal === true,
        image_sensor_stream_count: imageCounts[0],
        numeric_observation_feature_count: observationCounts[0],
        sensor_payload_decoded_ratio: 1,
        image_payload_verified_ratio: 1,
        same_step_command_observation_joint_position_delta_rms: rms(jointDifference),
        same_step_command_observation_cartesian_translation_delta_rms:
          rms(cartesianTranslationDifference),
        same_step_command_observation_cartesian_rotation_delta_rms:
          rms(cartesianRotationDifference),
        peak_abs_commanded_joint_velocity: peakAbsolute(jointVelocity),
        peak_abs_commanded_cartesian_translation_velocity:
          peakAbsolute(cartesianVelocity.map((row) => row.slice(0, 3))),
        peak_abs_commanded_cartesian_rotation_velocity:
          peakAbsolute(cartesianVelocity.map((row) => row.slice(3, 6))),
        commanded_joint_position_step_delta_l2_peak: peakStepDelta(commandedJoint),
        commanded_cartesian_translation_step_delta_l2_peak:
          peakStepDelta(commandedCartesian.map((row) => row.slice(0, 3))),
        commanded_cartesian_rotation_step_delta_l2_peak:
          peakStepDelta(commandedCartesian.map((row) => row.slice(3, 6))),
        gripper_command_transition_count: gripperTransitions,
        observation_index_gap_max_steps: 0,
      },
      missing: {
        physical_execution_control_mode: "NOT_ESTABLISHED_BY_PROJECTED_ARTIFACT",
        policy_identity_class: "NOT_ESTABLISHED_BY_PROJECTED_ARTIFACT",
        control_frequency_hz: "TIMESTAMPS_UNAVAILABLE",
        trajectory_duration_ms: "TIMESTAMPS_UNAVAILABLE",
        joint_limit_proximity_min: "VERIFIED_ROBOT_JOINT_LIMITS_AND_UNITS_UNAVAILABLE",
        workspace_boundary_proximity_min: "VERIFIED_WORKSPACE_FRAME_AND_BOUNDARY_UNAVAILABLE",
      },
    });
  });
}

function stablePinnedJson(file, { sizeBytes, sha256, maximumBytes = 4 * 1024 * 1024 } = {}) {
  let descriptor = null;
  try {
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(maximumBytes)
      || Number(before.size) !== sizeBytes) fail("EMPIRICAL_PINNED_SOURCE_FILE_INVALID");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const ordinary = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || ordinary !== sha256) fail("EMPIRICAL_PINNED_SOURCE_FILE_CHANGED_OR_MISMATCHED");
    try { return JSON.parse(bytes.toString("utf8")); }
    catch { fail("EMPIRICAL_PINNED_SOURCE_JSON_INVALID"); }
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function stablePinnedBytes(file, { sizeBytes, sha256,
  maximumBytes = 4 * 1024 * 1024 } = {}) {
  let descriptor = null;
  try {
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(maximumBytes)
      || Number(before.size) !== sizeBytes) fail("EMPIRICAL_PINNED_SOURCE_FILE_INVALID");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const ordinary = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || ordinary !== sha256) fail("EMPIRICAL_PINNED_SOURCE_FILE_CHANGED_OR_MISMATCHED");
    return bytes;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function mechanismEvidence({ sourceId, unitIdHash, eventIdHash, sourceRecordHash,
  mechanismNamespace, sourceCategory, eventRole, actorClass, stepOrdinal,
  publisherAnnotationOrdinal, priorAnnotatedFailureCount, selectionDesign,
  evidenceAuthority }) {
  const body = {
    schema: EMPIRICAL_FACTOR_LEDGER_SCHEMAS.mechanismEvidence,
    schemaVersion: "1.0.0",
    sourceId,
    unitIdHash,
    eventIdHash,
    sourceRecordHash,
    mechanism: {
      namespace: mechanismNamespace,
      sourceCategory,
      normalizedCategory: null,
      mappingAuthority: "SOURCE_NATIVE_UNMAPPED",
      eventRole,
      actorClass,
      stepOrdinal,
      publisherAnnotationOrdinal,
      priorAnnotatedFailureCount,
    },
    selection: selectionDesign,
    evidenceAuthority,
    claims: {
      failureMechanismObserved: "PUBLISHER_ANNOTATED_OR_LABELED",
      causalMechanismEstablished: false,
      populationFrequencyEstimated: false,
      physicalHarmEstablished: false,
      economicLossObserved: false,
      liabilityEstablished: false,
    },
  };
  return deepFreeze({ ...body,
    eventHash: digest(body, EMPIRICAL_FACTOR_LEDGER_SCHEMAS.mechanismEvidence) });
}

function buildWave4MechanismEvents(wave4SourceDirectory, wave4) {
  const acquired = wave4.manifest.acquiredScope.acquiredObjects.find(
    (object) => object.path === "ground-truth.json",
  );
  if (!acquired) fail("EMPIRICAL_WAVE4_ANNOTATION_OBJECT_MISSING");
  const annotations = stablePinnedJson(path.join(wave4SourceDirectory, "ground-truth.json"), {
    sizeBytes: acquired.sizeBytes,
    sha256: acquired.sha256,
  });
  if (!Array.isArray(annotations) || annotations.length !== wave4.records.length) {
    fail("EMPIRICAL_WAVE4_ANNOTATION_SCOPE_INVALID");
  }
  const byTask = new Map(wave4.records.map((record) => [record.sourceBinding.taskId, record]));
  const events = [];
  for (const annotation of annotations) {
    const record = byTask.get(annotation?.trajectory_id);
    if (!record || !Array.isArray(annotation.failures)
      || annotation.failures.length !== record.labels.annotatedFailureCount
      || !plain(annotation.root_cause)) fail("EMPIRICAL_WAVE4_ANNOTATION_JOIN_INVALID");
    const ids = new Set();
    let rootFound = false;
    let lastStep = 0;
    annotation.failures.forEach((event, annotationOrdinal) => {
      if (!Number.isSafeInteger(event?.failure_id) || ids.has(event.failure_id)
        || !Number.isSafeInteger(event.step_number) || event.step_number < 1
        || event.step_number > record.sourceBinding.turnCount || event.step_number < lastStep
        || !FAILURE_CATEGORIES.includes(event.failure_category)
        || !["Assistant", "User"].includes(event.failed_agent)) {
        fail("EMPIRICAL_WAVE4_FAILURE_EVENT_INVALID");
      }
      ids.add(event.failure_id);
      lastStep = event.step_number;
      const isRoot = event.failure_id === annotation.root_cause.failure_id;
      rootFound ||= isRoot;
      if (isRoot && (event.step_number !== record.labels.rootCauseStep
        || event.failure_category !== record.labels.rootCauseCategory
        || event.failed_agent.toUpperCase() !== record.labels.rootCauseFailedAgent
        || annotationOrdinal !== record.labels.failuresBeforeRootCause)) {
        fail("EMPIRICAL_WAVE4_ROOT_EVENT_BINDING_INVALID");
      }
      const eventIdHash = digest({ annotationRowRoot: record.sourceBinding.annotationRowRoot,
        failureId: event.failure_id }, "outsider/empirical-factor-ledger/agentrx-event-id/v1");
      events.push(mechanismEvidence({
        sourceId: SOURCE_IDS.wave4,
        unitIdHash: record.identity.identityHash,
        eventIdHash,
        sourceRecordHash: record.recordHash,
        mechanismNamespace: "microsoft/agentrx/tau_retail",
        sourceCategory: event.failure_category,
        eventRole: isRoot ? "PUBLISHER_DESIGNATED_ROOT_CAUSE" : "PUBLISHER_ANNOTATED_FAILURE",
        actorClass: event.failed_agent.toUpperCase(),
        stepOrdinal: event.step_number,
        publisherAnnotationOrdinal: annotationOrdinal,
        priorAnnotatedFailureCount: annotationOrdinal,
        selectionDesign: {
          design: "OUTCOME_CONDITIONED_FAILED_ONLY",
          conditionedOutcome: "BENCHMARK_FAILURE",
          selectedRows: wave4.records.length,
          observedNonfailureRows: 0,
          exposureDenominatorObserved: false,
          compositionInterpretation: "P_CATEGORY_GIVEN_PUBLISHER_SELECTED_FAILED_SPLIT_ONLY",
        },
        evidenceAuthority: "PINNED_PUBLISHER_MANUAL_ANNOTATION_SOURCE_REPLAYED",
      }));
    });
    if (!rootFound) fail("EMPIRICAL_WAVE4_ROOT_EVENT_MISSING");
  }
  if (events.length !== AGENTRX_TAU_WAVE4_PIN.failureEvents
    || new Set(events.map((event) => event.eventIdHash)).size !== events.length) {
    fail("EMPIRICAL_WAVE4_EVENT_ACCOUNTING_INVALID");
  }
  return events;
}

function buildUr5MechanismEvents(ur5) {
  return ur5.records.filter((record) => record.truth.value === "SUBTASK_FAILURE")
    .map((record) => mechanismEvidence({
      sourceId: SOURCE_IDS.ur5,
      unitIdHash: record.recordIdHash,
      eventIdHash: digest({ recordHash: record.recordHash,
        failureMode: record.truth.failureMode }, "outsider/empirical-factor-ledger/ur5-event-id/v1"),
      sourceRecordHash: record.recordHash,
      mechanismNamespace: "paulpacaud/guardian-failcot/ur5fail",
      sourceCategory: record.truth.failureMode,
      eventRole: "SOURCE_NATIVE_SUBTASK_FAILURE_CATEGORY",
      actorClass: null,
      stepOrdinal: null,
      publisherAnnotationOrdinal: null,
      priorAnnotatedFailureCount: null,
      selectionDesign: {
        design: "PUBLISHER_BENCHMARK_CORRELATED_SUBTASK_ROWS",
        conditionedOutcome: null,
        selectedRows: ur5.records.length,
        observedNonfailureRows: ur5.records.filter(
          (candidate) => candidate.truth.value === "SUBTASK_SUCCESS").length,
        exposureDenominatorObserved: false,
        compositionInterpretation: "SELECTED_CORRELATED_SUBTASK_ROWS_ONLY",
      },
      evidenceAuthority: "PINNED_PUBLISHER_MANUAL_SUBTASK_LABEL_SOURCE_REPLAYED",
    }));
}

function consequenceEvidence({ sourceId, unitIdHash, sourceRecordHash, layer,
  kind, observedValue, evidenceAuthority, admittedUses }) {
  const body = {
    schema: EMPIRICAL_FACTOR_LEDGER_SCHEMAS.consequenceEvidence,
    schemaVersion: "1.0.0",
    sourceId,
    unitIdHash,
    sourceRecordHash,
    consequence: {
      layer,
      kind,
      observedValue,
      evidenceAuthority,
      affectedPartyObserved: false,
      physicalEffectMagnitudeEstablished: false,
      causalAttributionEstablished: false,
      counterfactualEstablished: false,
      economicLossObserved: false,
      monetaryAmountMinorUnits: null,
      currency: null,
      liabilityAdjudicated: false,
      exposureDenominatorRef: null,
    },
    admittedUses: sortedUnique(admittedUses),
    upwardPromotion: {
      toPhysicalHarm: false,
      toEconomicLoss: false,
      toLiability: false,
      toPriceOrCoverage: false,
    },
  };
  return deepFreeze({ ...body,
    consequenceHash: digest(body, EMPIRICAL_FACTOR_LEDGER_SCHEMAS.consequenceEvidence) });
}

function buildConsequenceEvidence({ wave3, wave4, botfails, ur5, droid }) {
  const output = [];
  for (const record of wave3.records) {
    output.push(consequenceEvidence({
      sourceId: SOURCE_IDS.wave3,
      unitIdHash: record.identity.identityHash,
      sourceRecordHash: record.recordHash,
      layer: "SOURCE_NATIVE_OUTCOME_METADATA",
      kind: "HUMAN_REVIEWED_BENCHMARK_RESULT_METADATA_PROXY",
      observedValue: record.labels.benchmarkSuccess ? "BENCHMARK_SUCCESS" : "BENCHMARK_FAILURE",
      evidenceAuthority: "PUBLISHER_METADATA_SOURCE_REPLAYED_NO_TRACE_BYTES",
      admittedUses: ["DESCRIPTIVE_COMPOSITION"],
    }));
  }
  for (const record of wave4.records) {
    output.push(consequenceEvidence({
      sourceId: SOURCE_IDS.wave4,
      unitIdHash: record.identity.identityHash,
      sourceRecordHash: record.recordHash,
      layer: "SOURCE_NATIVE_OUTCOME",
      kind: "BENCHMARK_TASK_FAILURE_PROXY",
      observedValue: "BENCHMARK_FAILURE",
      evidenceAuthority: "PUBLISHER_SELECTED_FAILED_TRACE_SOURCE_REPLAYED",
      admittedUses: ["DESCRIPTIVE_COMPOSITION", "DESCRIPTIVE_ASSOCIATION"],
    }));
  }
  for (const record of botfails.records.filter((candidate) => candidate.truth.frameLabels)) {
    output.push(consequenceEvidence({
      sourceId: SOURCE_IDS.botfails,
      unitIdHash: record.recordIdHash,
      sourceRecordHash: record.recordHash,
      layer: "SOURCE_NATIVE_PHYSICAL_ANOMALY_PROXY",
      kind: "MANUAL_FRAME_ANOMALY_PROXY",
      observedValue: {
        label: record.truth.value,
        positiveFrames: record.truth.frameLabels.positiveCount,
        labeledFrames: record.truth.frameLabels.frameCount,
      },
      evidenceAuthority: "PINNED_PUBLISHER_MANUAL_FRAME_LABEL_SOURCE_REPLAYED",
      admittedUses: ["DESCRIPTIVE_COMPOSITION"],
    }));
  }
  for (const record of ur5.records) {
    output.push(consequenceEvidence({
      sourceId: SOURCE_IDS.ur5,
      unitIdHash: record.recordIdHash,
      sourceRecordHash: record.recordHash,
      layer: "SOURCE_NATIVE_PHYSICAL_SUBTASK_PROXY",
      kind: "MANUAL_SUBTASK_OUTCOME_PROXY",
      observedValue: record.truth.value,
      evidenceAuthority: "PINNED_PUBLISHER_MANUAL_SUBTASK_LABEL_SOURCE_REPLAYED",
      admittedUses: ["DESCRIPTIVE_COMPOSITION"],
    }));
  }
  for (const episode of droid.artifacts.episodes) {
    const rewards = episode.steps.map((step) => step.outcome.features.reward);
    output.push(consequenceEvidence({
      sourceId: SOURCE_IDS.droid,
      unitIdHash: episode.episodeIdHash,
      sourceRecordHash: episode.episodeHash,
      layer: "SOURCE_NATIVE_OUTCOME_UNINTERPRETED",
      kind: "RECORDED_REWARD_UNINTERPRETED",
      observedValue: {
        steps: rewards.length,
        positiveRewardSteps: rewards.filter((value) => value > 0).length,
        terminalReward: rewards.at(-1),
      },
      evidenceAuthority: "PINNED_SHARD_SOURCE_REPLAYED_REWARD_SEMANTICS_UNADJUDICATED",
      admittedUses: [],
    }));
  }
  return output;
}

const NHTSA_INCIDENT_TAXONOMY_ADMITTED_USES = Object.freeze([
  "DESCRIPTIVE_COMPOSITION", "FACTOR_SCHEMA_UPDATE", "TAXONOMY_UPDATE",
]);

const NHTSA_INCIDENT_TAXONOMY_BOUNDARY = Object.freeze({
  independentEventUnit: false,
  factorPredictorEstablished: false,
  mechanismOccurrenceEstablished: false,
  mechanismCausalityEstablished: false,
  consequenceTruthEstablished: false,
  exposureDenominatorObserved: false,
  populationFrequencyEstimable: false,
  economicLossObserved: false,
  modelEligible: false,
  trainingEligible: false,
  priceEligible: false,
  coverageEligible: false,
  guaranteeEligible: false,
  settlementEligible: false,
});

const NHTSA_INCIDENT_TAXONOMY_RIGHTS = Object.freeze({
  status: "UNRESOLVED_PUBLIC_ACCESS_ONLY",
  reuseRightsEstablished: false,
  trainingRightsEstablished: false,
  commercialUseRightsEstablished: false,
  sourceReplayGrantsRights: false,
});

function incidentTaxonomyObservation({ report, datasetRevisionRoot,
  reportingRegimeRoot }) {
  const body = {
    schema: EMPIRICAL_FACTOR_LEDGER_SCHEMAS.incidentTaxonomyObservation,
    schemaVersion: "1.0.0",
    sourceId: SOURCE_IDS.nhtsa,
    unitIdHash: report.reportIdHash,
    sourceRecordHash: report.projectionHash,
    sourceRowHash: report.sourceRowHash,
    reportingContext: {
      reportVersion: report.reportVersion,
      reportType: report.reportType,
      reportPeriod: { month: report.reportMonth, year: report.reportYear },
      incidentDate: {
        present: report.incidentDatePresent,
        markedUnknown: report.incidentDateMarkedUnknown,
      },
      latestVersionRule: "HIGHEST_NUMERIC_REPORT_VERSION_PER_NATIVE_REPORT_ID",
    },
    publisherReportedTaxonomy: {
      automationSystemEngaged: report.automationSystemEngaged,
      engagementStatus: report.engagementStatus,
      highestInjurySeverityAlleged: report.highestInjurySeverityAlleged,
      airbagsDeployed: report.airbagsDeployed,
      vehicleTowed: report.vehicleTowed,
      crashWith: report.crashWith,
    },
    privacyProjection: report.privacyProjection,
    correlationRoots: {
      datasetRevisionRoot,
      reportingEntityRoot: report.reportingEntityHash,
      reportingRegimeRoot,
    },
    evidenceAuthority: {
      observationClass: "PUBLISHER_REPORTED_INCIDENT_ALLEGATION",
      publisherReported: true,
      alleged: true,
      independentlyAdjudicated: false,
      sourceRecordReplayed: true,
    },
    admittedUses: NHTSA_INCIDENT_TAXONOMY_ADMITTED_USES,
    boundary: NHTSA_INCIDENT_TAXONOMY_BOUNDARY,
    rights: NHTSA_INCIDENT_TAXONOMY_RIGHTS,
  };
  return deepFreeze({ ...body,
    observationHash: digest(body,
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.incidentTaxonomyObservation) });
}

function incidentTaxonomySetHash(observations) {
  return digest(observations.map((observation) => ({
    unitIdHash: observation.unitIdHash,
    sourceRecordHash: observation.sourceRecordHash,
    observationHash: observation.observationHash,
  })), "outsider/empirical-incident-taxonomy-set/v1");
}

function buildNhtsaEvidence({ nhtsaRegistryDirectory, nhtsaCsvPath,
  nhtsaDataDictionaryPath, nhtsaReplayAt }) {
  const replay = verifyNhtsaSgoIncidentCorpusRegistrySource({
    directory: nhtsaRegistryDirectory,
    csvPath: nhtsaCsvPath,
    dataDictionaryPath: nhtsaDataDictionaryPath,
    now: nhtsaReplayAt,
  });
  const counts = NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts;
  if (!replay.ok || replay.sourceArtifactsReverified !== true
    || replay.canonicalBodyExact !== true
    || replay.allowedUse !== "INCIDENT_TAXONOMY_AND_SOURCE_DISCOVERY_ONLY"
    || replay.rightsStatus !== "NOT_ESTABLISHED_PUBLIC_ACCESS_ONLY"
    || replay.counts?.rawReportVersions !== counts.rawReportVersions
    || replay.counts?.latestReportIdentities !== counts.latestReportIdentities
    || replay.counts?.supersededOrDuplicateVersions
      !== counts.supersededOrDuplicateVersions
    || replay.counts?.independentIncidentEvents !== 0
    || replay.counts?.exposureDenominatorRows !== 0
    || replay.counts?.monetaryLossRows !== 0
    || replay.counts?.modelRows !== 0
    || replay.boundary?.rightsEstablished !== false
    || replay.boundary?.automaticTraining !== false
    || replay.boundary?.permitsPrice !== false) {
    fail("EMPIRICAL_NHTSA_SOURCE_REPLAY_REQUIRED", replay.error);
  }
  const csvBytes = stablePinnedBytes(nhtsaCsvPath, {
    sizeBytes: NHTSA_SGO_STAGE1_FROZEN_SCOPE.csv.bytes,
    sha256: NHTSA_SGO_STAGE1_FROZEN_SCOPE.csv.sha256,
  });
  stablePinnedBytes(nhtsaDataDictionaryPath, {
    sizeBytes: NHTSA_SGO_STAGE1_FROZEN_SCOPE.dataDictionary.bytes,
    sha256: NHTSA_SGO_STAGE1_FROZEN_SCOPE.dataDictionary.sha256,
  });
  const quarantine = adaptNhtsaSgoAdsCsv(csvBytes, {
    sourceObjectHash: NHTSA_SGO_STAGE1_FROZEN_SCOPE.csv.sha256,
    dataDictionaryHash: NHTSA_SGO_STAGE1_FROZEN_SCOPE.dataDictionary.sha256,
    generatedAt: replay.checkedAt,
  });
  const quarantineCheck = verifyNhtsaSgoIncidentQuarantine(quarantine, csvBytes);
  if (!quarantineCheck.ok || quarantineCheck.sourceReproduced !== true
    || quarantine.reports.length !== counts.latestReportIdentities
    || quarantine.counts.rawReportRows !== counts.rawReportVersions
    || quarantine.counts.historicalOrDuplicateVersions
      !== counts.supersededOrDuplicateVersions
    || quarantine.counts.reportingEntities !== counts.reportingEntities
    || quarantine.counts.admittedExposureRows !== 0
    || quarantine.counts.admittedLossRows !== 0
    || quarantine.counts.externallyAdjudicatedRows !== 0) {
    fail("EMPIRICAL_NHTSA_QUARANTINE_REPLAY_INVALID",
      quarantineCheck.failures?.join(","));
  }
  const datasetRevisionRoot = digest({
    csvHash: NHTSA_SGO_STAGE1_FROZEN_SCOPE.csv.sha256,
    dataDictionaryHash: NHTSA_SGO_STAGE1_FROZEN_SCOPE.dataDictionary.sha256,
    sourceCommitmentHash: quarantine.sourceCommitmentHash,
  }, "outsider/nhtsa-sgo-corpus/dataset-revision/v1");
  const reportingRegimeRoot = digest({
    sourceId: SOURCE_IDS.nhtsa,
    reportingBasis: quarantine.source.reportingBasis,
    sourceUrl: quarantine.source.sourceUrl,
  }, "outsider/nhtsa-sgo-corpus/reporting-regime/v1");
  const observations = quarantine.reports.map((report) =>
    incidentTaxonomyObservation({ report, datasetRevisionRoot, reportingRegimeRoot }))
    .sort((left, right) => left.unitIdHash.localeCompare(right.unitIdHash));
  const setHash = incidentTaxonomySetHash(observations);
  return deepFreeze({ replay, quarantine, observations,
    incidentTaxonomySetHash: setHash });
}

function ledgerAccounting({ profiles, factorRows, mechanismEvents, consequences,
  incidentTaxonomyObservations }) {
  const countBySource = (rows) => Object.fromEntries(SOURCE_IDS_SORTED.map((sourceId) => [sourceId,
    rows.filter((row) => row.sourceId === sourceId).length]));
  const sourceRows = Object.fromEntries(profiles.map((profile) =>
    [profile.sourceId, profile.sourceBinding.selectedRows]));
  return Object.freeze({
    sourceProfiles: profiles.length,
    sourceRows,
    factorRows: factorRows.length,
    factorRowsBySource: countBySource(factorRows),
    mechanismEvents: mechanismEvents.length,
    mechanismEventsBySource: countBySource(mechanismEvents),
    consequenceObservations: consequences.length,
    consequenceObservationsBySource: countBySource(consequences),
    incidentTaxonomyObservations: incidentTaxonomyObservations.length,
    incidentTaxonomyObservationsBySource: countBySource(incidentTaxonomyObservations),
    incidentTaxonomyRawReportVersions:
      NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.rawReportVersions,
    incidentTaxonomyLatestReportIdentities:
      NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.latestReportIdentities,
    incidentTaxonomySupersededOrDuplicateVersions:
      NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.supersededOrDuplicateVersions,
    incidentTaxonomyReportingEntityRoots:
      NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.reportingEntities,
    independentIncidentEventUnits: 0,
    preActionPredictorEligibleRows: 0,
    mechanismCausalityRows: 0,
    consequenceTruthRows: 0,
    admittedEconomicLossRows: 0,
    admittedFrequencyDenominators: 0,
    modelEligibleRows: 0,
    automaticTrainingEligibleRows: 0,
    pricingEligibleRows: 0,
    automaticDeploymentEligibleRows: 0,
  });
}

const SOURCE_IDS_SORTED = Object.freeze(Object.values(SOURCE_IDS).sort());
const FIXED_LEDGER_BOUNDARY = Object.freeze({
  mode: "CLAIM_SCOPED_EMPIRICAL_DESCRIPTIVE_LEDGER_V2",
  legacyRiskFactorDictionaryModified: false,
  realWorldIncidentTaxonomyIsEmpiricalEvidence: true,
  incidentTaxonomyIsolatedFromFactorMechanismConsequenceTruthLanes: true,
  incidentTaxonomyIndependentEventUnits: 0,
  incidentTaxonomyFactorPredictorRows: 0,
  incidentTaxonomyMechanismCausalityRows: 0,
  incidentTaxonomyConsequenceTruthRows: 0,
  populationFrequencyEstimated: false,
  causalEffectEstimated: false,
  physicalHarmEstablished: false,
  economicLossObserved: false,
  pricingAuthority: false,
  coverageAuthority: false,
  guaranteeAuthority: false,
  settlementAuthority: false,
  automaticTraining: false,
  automaticDeployment: false,
});

/**
 * Build the ledger only after exact source-aware replay of every selected
 * source. No artifact-only DROID verification is accepted.
 */
export function buildEmpiricalFactorLedger({
  wave3SourceDirectory,
  wave4SourceDirectory,
  botFailsSourceDirectory,
  ur5SourceDirectory,
  droidArtifactDirectory,
  droidSource,
  nhtsaRegistryDirectory,
  nhtsaCsvPath,
  nhtsaDataDictionaryPath,
  nhtsaReplayAt = "2026-08-21T11:00:08.000Z",
} = {}) {
  for (const [name, value] of Object.entries({ wave3SourceDirectory,
    wave4SourceDirectory, botFailsSourceDirectory, ur5SourceDirectory,
    droidArtifactDirectory, nhtsaRegistryDirectory, nhtsaCsvPath,
    nhtsaDataDictionaryPath })) {
    if (typeof value !== "string" || value.length < 1) {
      fail("EMPIRICAL_LEDGER_SOURCE_PATH_REQUIRED", name);
    }
  }
  if (!exactKeys(droidSource, ["objectListBytes", "datasetInfoBytes", "featureBytes",
    "shardBytes"])) fail("EMPIRICAL_LEDGER_DROID_SOURCE_SET_REQUIRED");
  const wave3 = verifyPublicAgentWave3Source(wave3SourceDirectory);
  const wave4 = verifyPublicAgentWave4Source(wave4SourceDirectory);
  const botfails = convertBotFailsPilot(botFailsSourceDirectory);
  const ur5 = convertUr5FailExecution(ur5SourceDirectory);
  const droid = verifyDroid100PilotArtifactDirectory(droidArtifactDirectory, {
    source: droidSource,
  });
  if (!droid.ok || droid.verificationLevel !== "FULL_SOURCE_REPRODUCED"
    || droid.recordsVerified !== true || droid.causalExperienceUnits !== 0
    || droid.automaticTraining !== false) {
    fail("EMPIRICAL_LEDGER_DROID_FULL_SOURCE_REPLAY_REQUIRED", droid.error);
  }
  if (typeof nhtsaReplayAt !== "string"
    || new Date(nhtsaReplayAt).toISOString() !== nhtsaReplayAt) {
    fail("EMPIRICAL_LEDGER_NHTSA_REPLAY_TIME_INVALID");
  }
  const nhtsa = buildNhtsaEvidence({ nhtsaRegistryDirectory, nhtsaCsvPath,
    nhtsaDataDictionaryPath, nhtsaReplayAt });
  const sourceSet = { wave3, wave4, botfails, ur5, droid, nhtsa };
  const profiles = buildSourceProfiles(sourceSet);
  const factorRows = [
    ...buildWave3FactorRows(wave3),
    ...buildWave4FactorRows(wave4),
    ...buildBotFailsFactorRows(botfails),
    ...buildUr5FactorRows(ur5),
    ...buildDroidFactorRows(droid),
  ].sort((left, right) => left.sourceId.localeCompare(right.sourceId)
    || left.unitIdHash.localeCompare(right.unitIdHash));
  const mechanismEvents = [
    ...buildWave4MechanismEvents(wave4SourceDirectory, wave4),
    ...buildUr5MechanismEvents(ur5),
  ].sort((left, right) => left.sourceId.localeCompare(right.sourceId)
    || left.eventIdHash.localeCompare(right.eventIdHash));
  const consequences = buildConsequenceEvidence(sourceSet)
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId)
      || left.unitIdHash.localeCompare(right.unitIdHash));
  const incidentTaxonomyObservations = nhtsa.observations;
  const accounting = ledgerAccounting({ profiles, factorRows, mechanismEvents, consequences,
    incidentTaxonomyObservations });
  const body = {
    schema: EMPIRICAL_FACTOR_LEDGER_SCHEMAS.ledger,
    schemaVersion: "2.0.0",
    ontologyReferences: profiles.map((profile) => profile.ontologyReference),
    factorDictionaries: EMPIRICAL_FACTOR_DICTIONARIES,
    sourceProfiles: profiles,
    factorRows,
    mechanismEvents,
    consequenceObservations: consequences,
    incidentTaxonomyObservations,
    accounting,
    boundary: FIXED_LEDGER_BOUNDARY,
  };
  const ledger = deepFreeze({ ...body, ledgerHash: ledgerDigest(body) });
  const checked = verifyEmpiricalFactorLedger(ledger);
  if (!checked.ok) fail("EMPIRICAL_LEDGER_SELF_VERIFICATION_FAILED", checked.error);
  return ledger;
}

function verifyProfile(profile) {
  if (!exactKeys(profile, ["schema", "schemaVersion", "sourceId", "ontologyReference",
    "sourceBinding", "sourceReality", "evidenceAuthority", "usePermission",
    "capabilityAdmissions", "statisticalBoundary", "profileHash"])
    || profile.schema !== EMPIRICAL_FACTOR_LEDGER_SCHEMAS.sourceProfile
    || profile.schemaVersion !== "1.0.0" || !SOURCE_IDS_SORTED.includes(profile.sourceId)) {
    fail("EMPIRICAL_SOURCE_PROFILE_STRUCTURE_INVALID");
  }
  const ontologyCheck = verifyPublicEvidenceOntologyReference(profile.ontologyReference);
  if (!ontologyCheck.ok || profile.ontologyReference.sourceId !== profile.sourceId) {
    fail("EMPIRICAL_SOURCE_PROFILE_ONTOLOGY_INVALID", ontologyCheck.error);
  }
  if (!same(profile.capabilityAdmissions, empiricalCapabilityAdmissions(profile.sourceId))) {
    fail("EMPIRICAL_SOURCE_PROFILE_ADMISSION_INVALID", profile.sourceId);
  }
  if (!Array.isArray(profile.ontologyReference.permittedUses)
    || profile.ontologyReference.permittedUses.some((use) =>
      !["DESCRIPTIVE", "SHADOW_RESEARCH"].includes(use))) {
    fail("EMPIRICAL_SOURCE_PROFILE_ONTOLOGY_USE_INVALID", profile.sourceId);
  }
  const supports = profile.evidenceAuthority?.claimSupport;
  if (!exactKeys(supports, ["MECHANISM_OCCURRENCE", "FAILURE_TAXONOMY",
    "WITHIN_SELECTED_SCOPE_COMPOSITION", "FACTOR_OUTCOME_ASSOCIATION", "FREQUENCY",
    "CAUSAL_EFFECT", "PHYSICAL_CONSEQUENCE", "ECONOMIC_LOSS", "LIABILITY"])
    || supports.FREQUENCY !== "UNSUPPORTED" || supports.CAUSAL_EFFECT !== "UNSUPPORTED"
    || supports.ECONOMIC_LOSS !== "UNSUPPORTED" || supports.LIABILITY !== "UNSUPPORTED") {
    fail("EMPIRICAL_SOURCE_PROFILE_CLAIM_AUTHORITY_INVALID", profile.sourceId);
  }
  const realityClasses = profile.ontologyReference.environmentRealityClasses;
  if (profile.sourceId === SOURCE_IDS.wave4
    && (!realityClasses.includes("SIMULATION")
      || profile.sourceReality.executionEnvironment !== "STRUCTURED_API_SANDBOX"
      || profile.sourceReality.liveProductionSideEffectEstablished !== false)
    || profile.sourceId === SOURCE_IDS.wave3
      && (profile.sourceReality.executionObservation !== "METADATA_ONLY"
        || profile.sourceReality.traceBytesAcquired !== 0)
    || [SOURCE_IDS.botfails, SOURCE_IDS.ur5, SOURCE_IDS.droid].includes(profile.sourceId)
      && (!realityClasses.includes("REAL_PHYSICAL")
        || profile.sourceReality.realPhysicalExecutionRecorded !== true
        || profile.sourceReality.physicalHarmOrLossEstablished !== false)
    || profile.sourceId === SOURCE_IDS.nhtsa
      && (!same(realityClasses, ["ORGANIC", "REAL_PHYSICAL"])
        || profile.sourceReality.executionEnvironment
          !== "REAL_WORLD_PHYSICAL_INCIDENT_REPORTING"
        || profile.sourceReality.outcomeAscertainment
          !== "PUBLISHER_REPORTED_INCIDENT_ALLEGATION"
        || profile.sourceReality.realPhysicalIncidentReportRecorded !== true
        || profile.sourceReality.underlyingExecutionIndependentlyObserved !== false
        || profile.sourceReality.independentIncidentEventEstablished !== false
        || profile.sourceReality.physicalHarmOrLossEstablished !== false
        || !same(profile.ontologyReference.permittedUses, ["DESCRIPTIVE"]))) {
    fail("EMPIRICAL_SOURCE_PROFILE_REALITY_INVALID", profile.sourceId);
  }
  const permissions = profile.usePermission?.permissions;
  if (!exactKeys(permissions, ["PERSIST_NORMALIZED", "PERSIST_RAW", "COMPUTE_AGGREGATES",
    "BUILD_TAXONOMY", "FIT_DESCRIPTIVE_MECHANISM", "FIT_PREDICTIVE_MODEL",
    "AUTOMATIC_TRAINING", "REDISTRIBUTE_DERIVED", "REDISTRIBUTE_RAW", "COMMERCIAL_USE"])
    || permissions.PERSIST_RAW.status !== "DENIED_BY_POLICY"
    || permissions.AUTOMATIC_TRAINING.status !== "DENIED_BY_POLICY"
    || permissions.REDISTRIBUTE_RAW.status !== "UNRESOLVED"
    || permissions.COMMERCIAL_USE.status !== "UNRESOLVED") {
    fail("EMPIRICAL_SOURCE_PROFILE_PERMISSION_INVALID", profile.sourceId);
  }
  if (profile.sourceId === SOURCE_IDS.nhtsa
    && (!exactKeys(profile.sourceBinding, ["registryId", "registryIndexHash",
      "registryArtifactSetHash", "sourceReplayVerificationHash", "csvHash",
      "dataDictionaryHash", "incidentTaxonomySetHash", "selectedRows",
      "rawReportVersions", "supersededOrDuplicateVersions"])
      || !exactKeys(profile.sourceReality, ["executionEnvironment", "executionObservation",
        "selectedScope", "samplingDesign", "outcomeAscertainment", "traceBytesAcquired",
        "realPhysicalIncidentReportRecorded", "underlyingExecutionIndependentlyObserved",
        "independentIncidentEventEstablished", "physicalHarmOrLossEstablished"])
      || !exactKeys(profile.evidenceAuthority, ["sourceByteIdentity", "labelAuthority",
        "independentAnnotatorIdentityVerified", "executionReplayed",
        "traceDerivedMechanismEstablished", "claimSupport"])
      || !exactKeys(profile.usePermission, ["licenseIdentifiers", "rightsScope",
        "declarationBinding", "byteEquivalence", "legalConclusion", "permissions"])
      || profile.usePermission.rightsScope !== "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY"
      || profile.usePermission.licenseIdentifiers.length !== 0
      || profile.usePermission.permissions.PERSIST_NORMALIZED.status !== "UNRESOLVED"
      || profile.usePermission.permissions.BUILD_TAXONOMY.status !== "UNRESOLVED"
      || profile.usePermission.permissions.FIT_DESCRIPTIVE_MECHANISM.status
        !== "DENIED_BY_POLICY"
      || profile.usePermission.permissions.FIT_PREDICTIVE_MODEL.status
        !== "DENIED_BY_POLICY"
      || profile.usePermission.permissions.REDISTRIBUTE_DERIVED.status !== "UNRESOLVED"
      || profile.evidenceAuthority.labelAuthority
        !== "PUBLISHER_REPORTED_ALLEGED_NOT_INDEPENDENTLY_ADJUDICATED"
      || profile.sourceBinding.selectedRows
        !== NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.latestReportIdentities
      || profile.sourceBinding.rawReportVersions
        !== NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.rawReportVersions
      || profile.sourceBinding.supersededOrDuplicateVersions
        !== NHTSA_SGO_STAGE1_FROZEN_SCOPE.counts.supersededOrDuplicateVersions
      || !HASH.test(profile.sourceBinding.incidentTaxonomySetHash ?? "")
      || !HASH.test(profile.sourceBinding.registryIndexHash ?? "")
      || !HASH.test(profile.sourceBinding.registryArtifactSetHash ?? "")
      || !HASH.test(profile.sourceBinding.sourceReplayVerificationHash ?? ""))) {
    fail("EMPIRICAL_NHTSA_SOURCE_PROFILE_BOUNDARY_INVALID");
  }
  for (const capability of HARD_CLOSED_CAPABILITIES) {
    if (profile.capabilityAdmissions[capability].status !== "FORBIDDEN") {
      fail("EMPIRICAL_SOURCE_PROFILE_HARD_GATE_OPEN", `${profile.sourceId}/${capability}`);
    }
  }
  if (profile.usePermission?.legalConclusion !== false
    || profile.usePermission?.permissions?.AUTOMATIC_TRAINING?.status !== "DENIED_BY_POLICY"
    || profile.statisticalBoundary?.provenanceRootsAreStatisticalDependenceRoots !== false
    || profile.statisticalBoundary?.rowCountIsIndependentExposureCount !== false
    || profile.statisticalBoundary?.exposureDenominatorObserved !== false
    || profile.statisticalBoundary?.populationFrequencyEstimable !== false
    || profile.statisticalBoundary?.causalEffectIdentified !== false
    || profile.statisticalBoundary?.economicLossObserved !== false) {
    fail("EMPIRICAL_SOURCE_PROFILE_BOUNDARY_INVALID", profile.sourceId);
  }
  const { profileHash, ...body } = profile;
  if (profileHash !== digest(body, EMPIRICAL_FACTOR_LEDGER_SCHEMAS.sourceProfile)) {
    fail("EMPIRICAL_SOURCE_PROFILE_HASH_INVALID", profile.sourceId);
  }
}

function verifyFactorRow(row, sourceIds) {
  if (!exactKeys(row, ["schema", "schemaVersion", "sourceId", "unitIdHash",
    "sourceRecordHash", "measurementScope", "provenanceRoots", "dependenceRoots",
    "factorValues", "missing", "interpretation", "rowHash"])
    || row.schema !== EMPIRICAL_FACTOR_LEDGER_SCHEMAS.factorRow
    || row.schemaVersion !== "1.0.0" || !sourceIds.has(row.sourceId)
    || !HASH.test(row.unitIdHash ?? "") || !HASH.test(row.sourceRecordHash ?? "")
    || !Array.isArray(row.provenanceRoots) || !Array.isArray(row.dependenceRoots)
    || !same(row.provenanceRoots, sortedUnique(row.provenanceRoots))
    || !same(row.dependenceRoots, sortedUnique(row.dependenceRoots))
    || row.provenanceRoots.some((root) => !HASH.test(root))
    || row.dependenceRoots.some((root) => !HASH.test(root))
    || row.provenanceRoots.some((root) => row.dependenceRoots.includes(root))
    || !plain(row.factorValues) || Object.keys(row.factorValues).length < 1
    || !plain(row.missing)) fail("EMPIRICAL_FACTOR_ROW_STRUCTURE_INVALID");
  for (const [id, value] of Object.entries(row.factorValues)) {
    const factor = FACTOR_BY_ID.get(id);
    if (!factor || !SOURCE_FACTOR_ALLOWLISTS[row.sourceId]
      || !SOURCE_FACTOR_ALLOWLISTS[row.sourceId].has(id)
      || !validateFactorValue(factor, value) || Object.hasOwn(row.missing, id)) {
      fail("EMPIRICAL_FACTOR_ROW_VALUE_INVALID", id);
    }
    if (factor.outcomeDerived && factor.preActionAvailable) {
      fail("EMPIRICAL_FACTOR_TEMPORALITY_INVALID", id);
    }
  }
  for (const [id, reason] of Object.entries(row.missing)) {
    if (!FACTOR_BY_ID.has(id) || !TOKEN.test(reason) || Object.hasOwn(row.factorValues, id)) {
      fail("EMPIRICAL_FACTOR_ROW_MISSING_INVALID", id);
    }
  }
  if (!same(row.interpretation, {
    provenanceRootsAreStatisticalDependenceRoots: false,
    preActionPredictorEligibilityInferred: false,
    missingValuesZeroImputed: false,
    crossSourceUnitCompatibilityEstablished: false,
  })) fail("EMPIRICAL_FACTOR_ROW_INTERPRETATION_INVALID");
  const { rowHash, ...body } = row;
  if (rowHash !== digest(body, EMPIRICAL_FACTOR_LEDGER_SCHEMAS.factorRow)) {
    fail("EMPIRICAL_FACTOR_ROW_HASH_INVALID");
  }
}

function verifyMechanismEvent(event, sourceIds) {
  const fixedClaims = {
    failureMechanismObserved: "PUBLISHER_ANNOTATED_OR_LABELED",
    causalMechanismEstablished: false,
    populationFrequencyEstimated: false,
    physicalHarmEstablished: false,
    economicLossObserved: false,
    liabilityEstablished: false,
  };
  if (!exactKeys(event, ["schema", "schemaVersion", "sourceId", "unitIdHash",
    "eventIdHash", "sourceRecordHash", "mechanism", "selection",
    "evidenceAuthority", "claims", "eventHash"])
    || event.schema !== EMPIRICAL_FACTOR_LEDGER_SCHEMAS.mechanismEvidence
    || event.schemaVersion !== "1.0.0" || !sourceIds.has(event.sourceId)
    || ![SOURCE_IDS.wave4, SOURCE_IDS.ur5].includes(event.sourceId)
    || !HASH.test(event.unitIdHash ?? "") || !HASH.test(event.eventIdHash ?? "")
    || !HASH.test(event.sourceRecordHash ?? "") || !plain(event.mechanism)
    || event.mechanism.normalizedCategory !== null
    || event.mechanism.mappingAuthority !== "SOURCE_NATIVE_UNMAPPED"
    || typeof event.mechanism.sourceCategory !== "string"
    || !plain(event.selection) || event.selection.exposureDenominatorObserved !== false
    || !same(event.claims, fixedClaims)) {
    fail("EMPIRICAL_MECHANISM_EVENT_BOUNDARY_INVALID");
  }
  if (event.sourceId === SOURCE_IDS.wave4) {
    if (!FAILURE_CATEGORIES.includes(event.mechanism.sourceCategory)
      || event.selection.design !== "OUTCOME_CONDITIONED_FAILED_ONLY"
      || event.selection.conditionedOutcome !== "BENCHMARK_FAILURE"
      || event.selection.observedNonfailureRows !== 0
      || event.selection.compositionInterpretation
        !== "P_CATEGORY_GIVEN_PUBLISHER_SELECTED_FAILED_SPLIT_ONLY") {
      fail("EMPIRICAL_WAVE4_MECHANISM_BOUNDARY_INVALID");
    }
    if (!["PUBLISHER_ANNOTATED_FAILURE", "PUBLISHER_DESIGNATED_ROOT_CAUSE"]
      .includes(event.mechanism.eventRole)
      || !["ASSISTANT", "USER"].includes(event.mechanism.actorClass)
      || !Number.isSafeInteger(event.mechanism.stepOrdinal)
      || !Number.isSafeInteger(event.mechanism.publisherAnnotationOrdinal)
      || event.mechanism.priorAnnotatedFailureCount
        !== event.mechanism.publisherAnnotationOrdinal
      || event.selection.selectedRows !== 29) {
      fail("EMPIRICAL_WAVE4_MECHANISM_SHAPE_INVALID");
    }
  } else if (event.selection.design !== "PUBLISHER_BENCHMARK_CORRELATED_SUBTASK_ROWS"
    || event.selection.conditionedOutcome !== null || event.selection.selectedRows !== 140
    || event.selection.observedNonfailureRows !== 69
    || event.selection.compositionInterpretation !== "SELECTED_CORRELATED_SUBTASK_ROWS_ONLY"
    || event.mechanism.eventRole !== "SOURCE_NATIVE_SUBTASK_FAILURE_CATEGORY"
    || event.mechanism.actorClass !== null || event.mechanism.stepOrdinal !== null
    || event.mechanism.publisherAnnotationOrdinal !== null
    || event.mechanism.priorAnnotatedFailureCount !== null) {
    fail("EMPIRICAL_UR5_MECHANISM_BOUNDARY_INVALID");
  }
  const { eventHash, ...body } = event;
  if (eventHash !== digest(body, EMPIRICAL_FACTOR_LEDGER_SCHEMAS.mechanismEvidence)) {
    fail("EMPIRICAL_MECHANISM_EVENT_HASH_INVALID");
  }
}

function verifyConsequence(observation, sourceIds) {
  const semantics = SOURCE_CONSEQUENCE_SEMANTICS[observation?.sourceId];
  if (!exactKeys(observation, ["schema", "schemaVersion", "sourceId", "unitIdHash",
    "sourceRecordHash", "consequence", "admittedUses", "upwardPromotion",
    "consequenceHash"])
    || observation.schema !== EMPIRICAL_FACTOR_LEDGER_SCHEMAS.consequenceEvidence
    || observation.schemaVersion !== "1.0.0" || !sourceIds.has(observation.sourceId)
    || !HASH.test(observation.unitIdHash ?? "") || !HASH.test(observation.sourceRecordHash ?? "")
    || observation.consequence?.affectedPartyObserved !== false
    || observation.consequence?.physicalEffectMagnitudeEstablished !== false
    || observation.consequence?.causalAttributionEstablished !== false
    || observation.consequence?.counterfactualEstablished !== false
    || observation.consequence?.economicLossObserved !== false
    || observation.consequence?.monetaryAmountMinorUnits !== null
    || observation.consequence?.currency !== null
    || observation.consequence?.liabilityAdjudicated !== false
    || observation.consequence?.exposureDenominatorRef !== null
    || !semantics || observation.consequence?.layer !== semantics.layer
    || observation.consequence?.kind !== semantics.kind
    || !same(observation.upwardPromotion, { toPhysicalHarm: false,
      toEconomicLoss: false, toLiability: false, toPriceOrCoverage: false })
    || !Array.isArray(observation.admittedUses)
    || observation.admittedUses.some((capability) =>
      !["DESCRIPTIVE_COMPOSITION", "DESCRIPTIVE_ASSOCIATION"].includes(capability))) {
    fail("EMPIRICAL_CONSEQUENCE_BOUNDARY_INVALID");
  }
  const { consequenceHash, ...body } = observation;
  if (consequenceHash !== digest(body, EMPIRICAL_FACTOR_LEDGER_SCHEMAS.consequenceEvidence)) {
    fail("EMPIRICAL_CONSEQUENCE_HASH_INVALID");
  }
}

function verifyIncidentTaxonomyObservation(observation) {
  const boundedText = (value, maximum = 256) => typeof value === "string"
    && value.length > 0 && value.length <= maximum;
  const textOrNull = (value, maximum = 256) => value === null
    || boundedText(value, maximum);
  if (!exactKeys(observation, ["schema", "schemaVersion", "sourceId", "unitIdHash",
    "sourceRecordHash", "sourceRowHash", "reportingContext",
    "publisherReportedTaxonomy", "privacyProjection", "correlationRoots",
    "evidenceAuthority", "admittedUses", "boundary", "rights", "observationHash"])
    || observation.schema !== EMPIRICAL_FACTOR_LEDGER_SCHEMAS.incidentTaxonomyObservation
    || observation.schemaVersion !== "1.0.0" || observation.sourceId !== SOURCE_IDS.nhtsa
    || !HASH.test(observation.unitIdHash ?? "")
    || !HASH.test(observation.sourceRecordHash ?? "")
    || !HASH.test(observation.sourceRowHash ?? "")
    || !exactKeys(observation.reportingContext, ["reportVersion", "reportType",
      "reportPeriod", "incidentDate", "latestVersionRule"])
    || !Number.isSafeInteger(observation.reportingContext.reportVersion)
    || observation.reportingContext.reportVersion < 1
    || !boundedText(observation.reportingContext.reportType)
    || !exactKeys(observation.reportingContext.reportPeriod, ["month", "year"])
    || !textOrNull(observation.reportingContext.reportPeriod.month, 2)
    || !textOrNull(observation.reportingContext.reportPeriod.year, 4)
    || !exactKeys(observation.reportingContext.incidentDate, ["present", "markedUnknown"])
    || typeof observation.reportingContext.incidentDate.present !== "boolean"
    || typeof observation.reportingContext.incidentDate.markedUnknown !== "boolean"
    || observation.reportingContext.latestVersionRule
      !== "HIGHEST_NUMERIC_REPORT_VERSION_PER_NATIVE_REPORT_ID"
    || !exactKeys(observation.publisherReportedTaxonomy,
      ["automationSystemEngaged", "engagementStatus", "highestInjurySeverityAlleged",
        "airbagsDeployed", "vehicleTowed", "crashWith"])
    || Object.values(observation.publisherReportedTaxonomy).some(
      (value) => !boundedText(value))
    || !exactKeys(observation.privacyProjection, ["vinPersisted", "serialNumberPersisted",
      "narrativePersisted", "coordinatesPersisted", "addressPersisted",
      "cityStateZipPersisted", "exactIncidentTimePersisted"])
    || Object.values(observation.privacyProjection).some((value) => value !== false)
    || !exactKeys(observation.correlationRoots,
      ["datasetRevisionRoot", "reportingEntityRoot", "reportingRegimeRoot"])
    || Object.values(observation.correlationRoots).some((root) => !HASH.test(root))
    || new Set(Object.values(observation.correlationRoots)).size !== 3
    || !same(observation.evidenceAuthority, {
      observationClass: "PUBLISHER_REPORTED_INCIDENT_ALLEGATION",
      publisherReported: true,
      alleged: true,
      independentlyAdjudicated: false,
      sourceRecordReplayed: true,
    })
    || !same(observation.admittedUses, NHTSA_INCIDENT_TAXONOMY_ADMITTED_USES)
    || !same(observation.boundary, NHTSA_INCIDENT_TAXONOMY_BOUNDARY)
    || !same(observation.rights, NHTSA_INCIDENT_TAXONOMY_RIGHTS)) {
    fail("EMPIRICAL_INCIDENT_TAXONOMY_BOUNDARY_INVALID");
  }
  const { observationHash, ...body } = observation;
  if (observationHash !== digest(body,
    EMPIRICAL_FACTOR_LEDGER_SCHEMAS.incidentTaxonomyObservation)) {
    fail("EMPIRICAL_INCIDENT_TAXONOMY_HASH_INVALID");
  }
}

export function verifyEmpiricalFactorLedger(ledger) {
  try {
    if (!exactKeys(ledger, ["schema", "schemaVersion", "ontologyReferences",
      "factorDictionaries", "sourceProfiles", "factorRows", "mechanismEvents",
      "consequenceObservations", "incidentTaxonomyObservations", "accounting",
      "boundary", "ledgerHash"])
      || ledger.schema !== EMPIRICAL_FACTOR_LEDGER_SCHEMAS.ledger
      || ledger.schemaVersion !== "2.0.0"
      || !same(ledger.factorDictionaries, EMPIRICAL_FACTOR_DICTIONARIES)
      || !Array.isArray(ledger.sourceProfiles) || ledger.sourceProfiles.length !== 6
      || !Array.isArray(ledger.factorRows) || !Array.isArray(ledger.mechanismEvents)
      || !Array.isArray(ledger.consequenceObservations)
      || !Array.isArray(ledger.incidentTaxonomyObservations)
      || !same(ledger.boundary, FIXED_LEDGER_BOUNDARY)) {
      fail("EMPIRICAL_LEDGER_STRUCTURE_INVALID");
    }
    const sourceIds = new Set(ledger.sourceProfiles.map((profile) => profile.sourceId));
    if (!same([...sourceIds].sort(), SOURCE_IDS_SORTED)) fail("EMPIRICAL_LEDGER_SOURCE_SET_INVALID");
    ledger.sourceProfiles.forEach(verifyProfile);
    if (!same(ledger.ontologyReferences,
      ledger.sourceProfiles.map((profile) => profile.ontologyReference))) {
      fail("EMPIRICAL_LEDGER_ONTOLOGY_REFERENCE_SET_INVALID");
    }
    ledger.factorRows.forEach((row) => verifyFactorRow(row, sourceIds));
    ledger.mechanismEvents.forEach((event) => verifyMechanismEvent(event, sourceIds));
    ledger.consequenceObservations.forEach((observation) =>
      verifyConsequence(observation, sourceIds));
    ledger.incidentTaxonomyObservations.forEach(verifyIncidentTaxonomyObservation);
    if (new Set(ledger.factorRows.map((row) => row.rowHash)).size !== ledger.factorRows.length
      || new Set(ledger.factorRows.map((row) => `${row.sourceId}\0${row.unitIdHash}`)).size
        !== ledger.factorRows.length
      || new Set(ledger.mechanismEvents.map((event) => event.eventIdHash)).size
        !== ledger.mechanismEvents.length
      || new Set(ledger.consequenceObservations.map((event) => event.consequenceHash)).size
        !== ledger.consequenceObservations.length
      || new Set(ledger.incidentTaxonomyObservations.map(
        (observation) => observation.observationHash)).size
        !== ledger.incidentTaxonomyObservations.length
      || new Set(ledger.incidentTaxonomyObservations.map(
        (observation) => observation.unitIdHash)).size
        !== ledger.incidentTaxonomyObservations.length) {
      fail("EMPIRICAL_LEDGER_DUPLICATE_RECORD");
    }
    const accounting = ledgerAccounting({ profiles: ledger.sourceProfiles,
      factorRows: ledger.factorRows, mechanismEvents: ledger.mechanismEvents,
      consequences: ledger.consequenceObservations,
      incidentTaxonomyObservations: ledger.incidentTaxonomyObservations });
    if (!same(ledger.accounting, accounting)
      || accounting.sourceRows[SOURCE_IDS.wave3] !== 272
      || accounting.sourceRows[SOURCE_IDS.wave4] !== 29
      || accounting.sourceRows[SOURCE_IDS.botfails] !== 20
      || accounting.sourceRows[SOURCE_IDS.ur5] !== 140
      || accounting.sourceRows[SOURCE_IDS.droid] !== 2
      || accounting.sourceRows[SOURCE_IDS.nhtsa] !== 1_324
      || accounting.factorRows !== 463
      || SOURCE_IDS_SORTED.filter((sourceId) => sourceId !== SOURCE_IDS.nhtsa)
        .some((sourceId) => accounting.factorRowsBySource[sourceId]
          !== accounting.sourceRows[sourceId])
      || accounting.factorRowsBySource[SOURCE_IDS.nhtsa] !== 0
      || accounting.mechanismEvents !== 110
      || accounting.mechanismEventsBySource[SOURCE_IDS.wave4] !== 39
      || accounting.mechanismEventsBySource[SOURCE_IDS.ur5] !== 71
      || accounting.mechanismEventsBySource[SOURCE_IDS.nhtsa] !== 0
      || ledger.mechanismEvents.filter((event) => event.sourceId === SOURCE_IDS.wave4
        && event.mechanism.eventRole === "PUBLISHER_DESIGNATED_ROOT_CAUSE").length !== 29
      || accounting.consequenceObservations !== 453
      || accounting.consequenceObservationsBySource[SOURCE_IDS.wave3] !== 272
      || accounting.consequenceObservationsBySource[SOURCE_IDS.wave4] !== 29
      || accounting.consequenceObservationsBySource[SOURCE_IDS.botfails] !== 10
      || accounting.consequenceObservationsBySource[SOURCE_IDS.ur5] !== 140
      || accounting.consequenceObservationsBySource[SOURCE_IDS.droid] !== 2
      || accounting.consequenceObservationsBySource[SOURCE_IDS.nhtsa] !== 0
      || accounting.incidentTaxonomyObservations !== 1_324
      || accounting.incidentTaxonomyObservationsBySource[SOURCE_IDS.nhtsa] !== 1_324
      || SOURCE_IDS_SORTED.filter((sourceId) => sourceId !== SOURCE_IDS.nhtsa)
        .some((sourceId) =>
          accounting.incidentTaxonomyObservationsBySource[sourceId] !== 0)
      || accounting.incidentTaxonomyRawReportVersions !== 1_365
      || accounting.incidentTaxonomyLatestReportIdentities !== 1_324
      || accounting.incidentTaxonomySupersededOrDuplicateVersions !== 41
      || accounting.incidentTaxonomyReportingEntityRoots !== 16
      || accounting.independentIncidentEventUnits !== 0
      || accounting.preActionPredictorEligibleRows !== 0
      || accounting.mechanismCausalityRows !== 0
      || accounting.consequenceTruthRows !== 0
      || accounting.admittedEconomicLossRows !== 0
      || accounting.admittedFrequencyDenominators !== 0
      || accounting.modelEligibleRows !== 0
      || accounting.automaticTrainingEligibleRows !== 0
      || accounting.pricingEligibleRows !== 0) {
      fail("EMPIRICAL_LEDGER_ACCOUNTING_INVALID");
    }
    const nhtsaProfile = ledger.sourceProfiles.find(
      (profile) => profile.sourceId === SOURCE_IDS.nhtsa);
    if (!nhtsaProfile
      || nhtsaProfile.sourceBinding.incidentTaxonomySetHash
        !== incidentTaxonomySetHash(ledger.incidentTaxonomyObservations)
      || new Set(ledger.incidentTaxonomyObservations.map(
        (observation) => observation.correlationRoots.datasetRevisionRoot)).size !== 1
      || new Set(ledger.incidentTaxonomyObservations.map(
        (observation) => observation.correlationRoots.reportingEntityRoot)).size !== 16
      || new Set(ledger.incidentTaxonomyObservations.map(
        (observation) => observation.correlationRoots.reportingRegimeRoot)).size !== 1) {
      fail("EMPIRICAL_NHTSA_INCIDENT_SET_BINDING_INVALID");
    }
    const wave4RootUnits = new Set(ledger.mechanismEvents.filter((event) =>
      event.sourceId === SOURCE_IDS.wave4
      && event.mechanism.eventRole === "PUBLISHER_DESIGNATED_ROOT_CAUSE")
      .map((event) => event.unitIdHash));
    const wave4FactorUnits = new Set(ledger.factorRows.filter((row) =>
      row.sourceId === SOURCE_IDS.wave4).map((row) => row.unitIdHash));
    const ur5MechanismUnits = new Set(ledger.mechanismEvents.filter((event) =>
      event.sourceId === SOURCE_IDS.ur5).map((event) => event.unitIdHash));
    if (!same([...wave4RootUnits].sort(), [...wave4FactorUnits].sort())
      || ur5MechanismUnits.size !== 71) {
      fail("EMPIRICAL_LEDGER_MECHANISM_UNIT_COVERAGE_INVALID");
    }
    const factorByUnit = new Map(ledger.factorRows.map((row) =>
      [`${row.sourceId}\0${row.unitIdHash}`, row]));
    for (const event of ledger.mechanismEvents) {
      const factor = factorByUnit.get(`${event.sourceId}\0${event.unitIdHash}`);
      if (!factor || factor.sourceRecordHash !== event.sourceRecordHash) {
        fail("EMPIRICAL_LEDGER_MECHANISM_SOURCE_RECORD_JOIN_INVALID");
      }
    }
    const consequenceByUnit = new Map(ledger.consequenceObservations.map((observation) =>
      [`${observation.sourceId}\0${observation.unitIdHash}`, observation]));
    if (consequenceByUnit.size !== ledger.consequenceObservations.length) {
      fail("EMPIRICAL_LEDGER_CONSEQUENCE_UNIT_DUPLICATED");
    }
    for (const row of ledger.factorRows) {
      const consequence = consequenceByUnit.get(`${row.sourceId}\0${row.unitIdHash}`);
      if (consequence && consequence.sourceRecordHash !== row.sourceRecordHash) {
        fail("EMPIRICAL_LEDGER_CONSEQUENCE_SOURCE_RECORD_JOIN_INVALID");
      }
      if (row.sourceId !== SOURCE_IDS.botfails && !consequence) {
        fail("EMPIRICAL_LEDGER_FACTOR_CONSEQUENCE_JOIN_MISSING", row.sourceId);
      }
      if (row.sourceId === SOURCE_IDS.botfails
        && (row.measurementScope === "FRAME_SEQUENCE") !== Boolean(consequence)) {
        fail("EMPIRICAL_BOTFAILS_LABEL_CONSEQUENCE_JOIN_INVALID");
      }
      if (row.sourceId === SOURCE_IDS.ur5) {
        const failed = consequence?.consequence?.observedValue === "SUBTASK_FAILURE";
        if (failed !== Object.hasOwn(row.factorValues, "source_native_subtask_failure_mode")) {
          fail("EMPIRICAL_UR5_FAILURE_FACTOR_OUTCOME_JOIN_INVALID");
        }
      }
    }
    const wave3Consequences = ledger.consequenceObservations.filter(
      (observation) => observation.sourceId === SOURCE_IDS.wave3);
    const wave4Consequences = ledger.consequenceObservations.filter(
      (observation) => observation.sourceId === SOURCE_IDS.wave4);
    const ur5Consequences = ledger.consequenceObservations.filter(
      (observation) => observation.sourceId === SOURCE_IDS.ur5);
    if (wave3Consequences.some((observation) =>
      !["BENCHMARK_SUCCESS", "BENCHMARK_FAILURE"].includes(observation.consequence.observedValue))
      || wave4Consequences.some((observation) =>
        observation.consequence.observedValue !== "BENCHMARK_FAILURE")
      || ur5Consequences.some((observation) =>
        !["SUBTASK_SUCCESS", "SUBTASK_FAILURE"].includes(observation.consequence.observedValue))) {
      fail("EMPIRICAL_LEDGER_SOURCE_NATIVE_OUTCOME_INVALID");
    }
    const wave3Rows = ledger.factorRows.filter((row) => row.sourceId === SOURCE_IDS.wave3);
    if (wave3Rows.some((row) => row.factorValues.trace_bytes_acquired !== 0)) {
      fail("EMPIRICAL_WAVE3_TRACE_BYTES_FALSE_PROMOTION");
    }
    const botFailsNominal = ledger.factorRows.filter((row) => row.sourceId === SOURCE_IDS.botfails
      && row.measurementScope === "EPISODE");
    if (botFailsNominal.some((row) => Object.hasOwn(row.factorValues,
      "manual_anomaly_positive_frame_fraction"))) {
      fail("EMPIRICAL_BOTFAILS_NOMINAL_AS_SUCCESS_OR_LABEL_INVALID");
    }
    const { ledgerHash, ...body } = ledger;
    if (ledgerHash !== ledgerDigest(body)) {
      fail("EMPIRICAL_LEDGER_HASH_INVALID");
    }
    return Object.freeze({ ok: true,
      verificationLevel: "SELF_SEALED_STRUCTURE_ONLY",
      sourceArtifactsReverified: false,
      empiricalValuesSourceReverified: false,
      ledgerHash, ...accounting });
  } catch (error) {
    return Object.freeze({ ok: false,
      verificationLevel: "SELF_SEALED_STRUCTURE_ONLY",
      sourceArtifactsReverified: false,
      empiricalValuesSourceReverified: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

/** Rebuild from exact bytes and require byte-for-byte canonical equality. */
export function replayEmpiricalFactorLedger(ledger, sourceOptions) {
  try {
    const rebuilt = buildEmpiricalFactorLedger(sourceOptions);
    if (!sameLedgerArtifact(rebuilt, ledger)) {
      fail("EMPIRICAL_LEDGER_SOURCE_REPLAY_MISMATCH");
    }
    return Object.freeze({ ok: true, verificationLevel: "FULL_SIX_SOURCE_REPRODUCED",
      sourceArtifactsReverified: true, empiricalValuesSourceReverified: true,
      ledgerHash: rebuilt.ledgerHash, accounting: rebuilt.accounting });
  } catch (error) {
    return Object.freeze({ ok: false,
      sourceArtifactsReverified: false, empiricalValuesSourceReverified: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}
