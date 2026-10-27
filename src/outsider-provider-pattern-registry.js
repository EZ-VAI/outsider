/*
 * Maintainer-reviewed provider pattern registry.
 *
 * The registry learns design requirements from public company/project
 * structures without importing their runtimes, payloads, credentials, model
 * outputs, or vendor claims as evidence.  A pattern may widen the list of
 * consequences Outsider must cover.  It can never widen authority, make an
 * action executable, close a Reality obligation, or admit training rows.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

export const PROVIDER_PATTERN_REGISTRY_SCHEMA
  = "outsider/provider-pattern-registry/v1";
export const PROVIDER_PATTERN_REVIEW_SCHEMA
  = "outsider/provider-pattern-review-projection/v1";

const REVIEWED_AT = "2026-08-27T08:00:00.000Z";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const StructuredClone = globalThis.structuredClone;
const ArrayIsArray = Array.isArray;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const ObjectFreeze = Object.freeze;
const ObjectIsFrozen = Object.isFrozen;
const ObjectValues = Object.values;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  const children = ObjectValues(value);
  for (let index = 0; index < children.length; index += 1) {
    deepFreeze(children[index]);
  }
  return ObjectFreeze(value);
}

function pattern(id, evidenceRequirements, responsibilityRequirements,
  minimumControls, boundary) {
  return { id, evidenceRequirements, responsibilityRequirements,
    minimumControls, boundary };
}

const PATTERNS = deepFreeze(ArraySort([
  pattern("GENERATED_WORLD_ARTIFACT_TRACE",
    ["INPUT_AND_PROMPT_HASH", "MODEL_OR_RUNTIME_REVISION", "SEED_AND_ASSET_HASHES",
      "INTERMEDIATE_REPRESENTATION", "OUTPUT_ARTIFACT_HASH", "SIMULATION_LABEL"],
    ["NO_PHYSICAL_OR_HUMAN_OUTCOME_INFERENCE", "SOURCE_CLASS_PRESERVATION"],
    ["SIMULATION_ONLY", "NO_REALITY_DENOMINATOR", "NO_ACTION_AUTHORITY"],
    "SYNTHETIC_OR_SIMULATED_ARTIFACTS_ONLY"),
  pattern("OUTBOUND_RECIPIENT_PURPOSE_PRIVACY_ENVELOPE",
    ["RECIPIENT_SET", "PURPOSE", "PAYLOAD_PROJECTION", "PII_AND_SECRET_SCAN",
      "DELIVERY_ATTEMPT", "DELIVERY_RESULT"],
    ["DATA_SUBJECT_CHANNEL", "WITHDRAWAL_OR_REMEDY", "RETENTION_AND_DELETION"],
    ["ONE_USE_OWNER_AUTHORITY", "DEFAULT_DENY_RECIPIENT_EXPANSION",
      "NO_INSTRUCTION_ONLY_PRIVACY_CLAIM"],
    "EVERY_EXTERNAL_SEND_IS_EFFECTFUL"),
  pattern("PHYSICAL_ACTUATION_SAFETY_ENVELOPE",
    ["DEVICE_IDENTITY", "WORKSPACE", "SPEED_FORCE_ENERGY_LIMITS", "CALIBRATION",
      "E_STOP", "COMMAND_ATTEMPT", "TELEMETRY", "IMMEDIATE_AND_DELAYED_OUTCOME"],
    ["OWNER", "AFFECTED_PARTIES", "BYSTANDERS", "RECOVERY",
      "DELAYED_HORIZONS", "CHALLENGE_AND_REOPEN"],
    ["PHYSICAL_ACTUATE_AUTHORITY", "ONE_USE_COMMAND", "ABORT_AND_E_STOP",
      "CONSERVATIVE_EFFECT_CLOSURE"],
    "PHYSICAL_CAPABILITY_NEVER_IMPLIES_PERMISSION"),
  pattern("TIME_ALIGNED_MULTIMODAL_OBSERVATION",
    ["CLOCK_AND_SYNCHRONIZATION", "SENSOR_AND_MODALITY_IDENTITY", "DROPOUT",
      "MISSINGNESS", "SOURCE_PROVENANCE", "TASK_AND_EPISODE_DENOMINATOR"],
    ["CONSENT_OR_LAWFUL_BASIS", "SUBJECT_AND_BYSTANDER_PRIVACY",
      "RETENTION", "REUSE_RIGHTS"],
    ["OBSERVATION_ONLY", "NO_ROBOT_POLICY_TRANSFER", "NO_OUTCOME_INFERENCE"],
    "HUMAN_OBSERVATION_IS_NOT_ROBOT_AUTHORITY"),
  pattern("ASYNC_JOB_STATUS_ARTIFACT",
    ["REQUEST_HASH", "JOB_ID", "STATE_TRANSITIONS", "POLL_ATTEMPTS",
      "TERMINAL_STATUS", "ARTIFACT_HASH", "ERROR_AND_TIMEOUT"],
    ["CANCELLATION", "RESOURCE_CLEANUP", "ARTIFACT_RETENTION"],
    ["IDEMPOTENCY", "TERMINAL_STATE_REQUIRED", "NO_SUCCESS_FROM_POLLING_GAP"],
    "JOB_STATUS_IS_NOT_OUTCOME_TRUTH"),
  pattern("TOOL_SNAPSHOT_CHECKPOINT_APPROVAL",
    ["TOOL_REQUEST", "PRE_STATE_HASH", "POST_STATE_HASH", "DIFF",
      "SNAPSHOT_ID", "APPROVAL_SOURCE", "SCHEDULED_TASK_STATE"],
    ["ROLLBACK", "CHECKPOINT_EXPIRY", "REOPEN_AFTER_LATE_EFFECT"],
    ["EXTERNAL_OWNER_AUTHORITY_REQUIRED", "SELF_REVIEW_IS_NOT_INDEPENDENT",
      "GREEN_TESTS_DO_NOT_AUTHORIZE_DEPLOY"],
    "UI_APPROVAL_IS_A_CANDIDATE_NOT_AUTHORITY"),
  pattern("ORDERED_RUNTIME_EVENT_RESUME",
    ["PROGRESS_EVENTS", "CONTROL_EVENTS", "MONITOR_EVENTS", "WAL_HEAD",
      "CHECKPOINT", "FORK_LINEAGE", "FAILURE_AND_PARTIAL_EFFECTS"],
    ["PENDING_EFFECT_RECONCILIATION", "QUIESCENCE", "CLEANUP"],
    ["DEFAULT_DENY_UNKNOWN_EFFECT", "NO_YOLO_OR_PERMISSION_BYPASS",
      "RESUME_DOES_NOT_ERASE_PRIOR_EFFECTS"],
    "ORDERED_LOGS_ARE_NOT_INDEPENDENT_OBSERVATION"),
  pattern("CONTEXT_CAPTURE_PROVENANCE",
    ["SOURCE_APPLICATION", "CAPTURE_TRIGGER", "PURPOSE", "EXCLUSION_STATE",
      "DROPPED_CAPTURE", "DERIVATION", "RETENTION"],
    ["DATA_SUBJECT_AND_BYSTANDER", "WITHDRAWAL", "DELETION", "CHALLENGE"],
    ["MINIMUM_NECESSARY", "NO_RAW_SCREENSHOT_INGRESS", "NO_ENTER_KEY_CONSENT"],
    "LOCAL_FIRST_DOES_NOT_PROVE_NO_EXTERNAL_PROCESSING"),
  pattern("SANDBOX_DIFF_ACCEPT_REJECT",
    ["SANDBOX_IDENTITY", "TOOL_AND_SUBAGENT_LIFECYCLE", "DIFF",
      "ACCEPT_OR_REJECT", "HOST_SIDE_ACTIONS", "TERMINAL_AND_USAGE"],
    ["ROLLBACK", "BYPASS_DETECTION", "HOST_EFFECT_RECONCILIATION"],
    ["HOST_EFFECTS_OUTSIDE_SANDBOX_COUNT", "ACCEPT_IS_NOT_EXTERNAL_AUTHORITY",
      "SELF_REVIEW_IS_NOT_INDEPENDENT"],
    "CONTAINMENT_IS_NOT_ATTESTATION"),
  pattern("PERSONA_MISSINGNESS_COHORT_STRESS",
    ["SCHEMA_TOPOLOGY", "EXPLICIT_MISSINGNESS", "SOURCE_COMPOSITION",
      "ELIGIBLE_SET", "SEED", "ATTEMPT_DENOMINATOR", "TASK_VERDICT"],
    ["NO_INDIVIDUAL_ATTRIBUTION", "SOURCE_RIGHTS_MATRIX",
      "AFFECTED_PARTY_HYPOTHESIS_ONLY"],
    ["SIMULATED_DERIVED", "CEU_ZERO", "NO_REALITY_CENSUS",
      "NO_TRAINING_WITH_UNRESOLVED_RIGHTS"],
    "PERSONA_ADHERENCE_IS_NOT_HUMAN_VALIDITY"),
], (left, right) => left.id < right.id ? -1 : 1));

function source(id, sourceClass, url, revision, licenseStatus, license,
  relationship) {
  return { id, sourceClass, url, revision, licenseStatus, license, relationship,
    sourceBytesReplayedByThisModule: false, codeExecutedByThisModule: false };
}

function entity(id, displayName, website, identityStatus, sourceReality,
  patternIds, sources, prohibitedUses) {
  return { id, displayName, website, identityStatus, sourceReality, patternIds,
    sources, prohibitedUses, integration: {
      mode: "CLEAN_ROOM_PATTERN_REVIEW_ONLY",
      payloadIngress: false,
      thirdPartyCodeImported: false,
      thirdPartyCodeExecuted: false,
      credentialsUsed: false,
      networkActionConnected: false,
    } };
}

const ENTITIES = deepFreeze(ArraySort([
  entity("ACEIILAB_A1", "Aceii One / AceiiLab A1", "https://aceiilab.com/",
    "OFFICIAL_SITE_ONLY_NO_PUBLIC_REPOSITORY", "VENDOR_CLAIM",
    ["PHYSICAL_ACTUATION_SAFETY_ENVELOPE"],
    [source("aceiilab-site", "OFFICIAL_VENDOR_PAGE", "https://aceiilab.com/", null,
      "ABSENT", null, "OWN_PRODUCT")],
    ["NO_CODE_OR_DATA_AVAILABLE_FOR_INGRESS", "NO_PHYSICAL_AUTHORITY_FROM_VENDOR_CLAIMS"]),
  entity("AIRJELLY", "AirJelly / Low Entropy AI", "https://www.airjelly.ai/",
    "OFFICIAL_SITE_WITH_SEPARATE_HISTORICAL_AND_ECOSYSTEM_ASSETS", "VENDOR_CLAIM",
    ["CONTEXT_CAPTURE_PROVENANCE"], [
      source("airjelly-site", "OFFICIAL_VENDOR_PAGE", "https://www.airjelly.ai/", null,
        "ABSENT", null, "OWN_PRODUCT"),
      source("minecontext", "RELATED_OPEN_SOURCE", "https://github.com/volcengine/MineContext",
        "171c7a9ea8091e326ddcf0f10718aa1b58c83c65", "VERIFIED", "Apache-2.0",
        "HISTORICAL_TEAM_ASSET_NOT_AIRJELLY_PRODUCT_SOURCE"),
      source("openclaw", "ECOSYSTEM_REFERENCE", "https://github.com/openclaw/openclaw",
        "0b0cff180bedb7e8c628549e201efcc4488f752a", "VERIFIED", "MIT",
        "ECOSYSTEM_ONLY_NOT_AIRJELLY_OWNERSHIP"),
    ], ["NO_RAW_SCREENSHOT_OR_PERSONAL_CONTEXT_INGRESS",
      "NO_OWNERSHIP_INFERENCE_FROM_HISTORICAL_OR_ECOSYSTEM_ASSETS"]),
  entity("BRIDGE_AFK", "Bridge / AFK", "https://bridge.surf/",
    "OFFICIAL_ORGANIZATION_OPEN_IMPLEMENTATION_NOT_HOSTED_PRODUCT_EQUIVALENCE",
    "VENDOR_CLAIM", ["TOOL_SNAPSHOT_CHECKPOINT_APPROVAL",
      "ORDERED_RUNTIME_EVENT_RESUME", "SANDBOX_DIFF_ACCEPT_REJECT"], [
      source("openbridge", "OFFICIAL_OPEN_SOURCE", "https://github.com/AFK-surf/OpenBridge",
        "a9ca905547309a7db9d6e9f246c554c4cc416a3c", "VERIFIED", "MIT",
        "OFFICIAL_OPEN_IMPLEMENTATION_NOT_HOSTED_PRODUCT_EQUIVALENCE"),
      source("kwwk-vendored", "VENDORED_DEPENDENCY",
        "https://github.com/EYHN/kwwk/tree/a63283af97e723ab2934eb847d58dbf4f482fb57",
        "a63283af97e723ab2934eb847d58dbf4f482fb57", "VERIFIED", "MIT",
        "INDEPENDENT_OWNER_VENDORED_GITLINK"),
      source("kwwk-upstream-head", "RELATED_OPEN_SOURCE", "https://github.com/EYHN/kwwk",
        "8cd3402af375c383aa2730ea629665f8b6cb84c1", "VERIFIED", "MIT",
        "CURRENT_UPSTREAM_HEAD_NOT_VENDORED_REVISION"),
    ], ["NO_REAL_CREDENTIAL_OR_HOST_ACTION_CONNECTION", "NO_SELF_REVIEW_AS_INDEPENDENT_EVIDENCE",
      "NO_SANDBOX_ACCEPT_AS_OWNER_AUTHORITY_OR_RESPONSIBILITY_CLOSURE"]),
  entity("EIGENFLUX", "EigenFlux / Phronesis AI", null,
    "OFFICIAL_REPOSITORY_PINNED", "VENDOR_CLAIM",
    ["OUTBOUND_RECIPIENT_PURPOSE_PRIVACY_ENVELOPE"], [
      source("eigenflux", "OFFICIAL_OPEN_SOURCE", "https://github.com/phronesis-io/eigenflux",
        "8d9679a7c89d9d87d5e580c610a4abebd541f296", "CUSTOM",
        "LicenseRef-EigenFlux-2026", "OWN_PRODUCT"),
    ], ["DO_NOT_RELABEL_CUSTOM_LICENSE_AS_APACHE_2_0",
      "NO_INSTRUCTION_BASED_PRIVACY_CLAIM_AS_CONTROL_EVIDENCE"]),
  entity("KRUNTIME_SHAREAI", "KRuntime / ShareAI Lab", null,
    "PRODUCT_NAME_NOT_MAPPED_TO_PUBLIC_REPOSITORY", "VENDOR_CLAIM",
    ["ORDERED_RUNTIME_EVENT_RESUME"], [
      source("kode-cli", "RELATED_OFFICIAL_LAB_ASSET", "https://github.com/shareAI-lab/Kode-CLI",
        "12457e7436d4f52e34e3d518ae5255e9aa444cfc", "VERIFIED", "Apache-2.0",
        "NOT_IDENTITY_PROOF_FOR_KRUNTIME"),
      source("kode-agent-sdk", "RELATED_OFFICIAL_LAB_ASSET",
        "https://github.com/shareAI-lab/kode-agent-sdk",
        "2596118805d8968c7e33cc437e440721833e9689", "VERIFIED", "MIT",
        "NOT_IDENTITY_PROOF_FOR_KRUNTIME"),
    ], ["NO_KODE_EQUALS_KRUNTIME_INFERENCE", "NO_YOLO_OR_PERMISSION_BYPASS"]),
  entity("MATRAIX", "MatrAIx Persona", "https://matraix.ai/",
    "OFFICIAL_CODE_AND_DATASET_METADATA_PINNED", "SIMULATION",
    ["PERSONA_MISSINGNESS_COHORT_STRESS"], [
      source("matraix-code", "OFFICIAL_OPEN_SOURCE",
        "https://github.com/MatrAIx-ai/MatrAIx-Persona-8B",
        "39d850270917db25535dac3f7aa2561732050e82", "VERIFIED", "MIT",
        "SOFTWARE_ONLY_NOT_DATASET_RIGHTS"),
      source("matraix-persona-1m", "OFFICIAL_DATASET",
        "https://huggingface.co/datasets/MatrAIx2026/MatrAIx_Persona_1M",
        "74f1edf9c9d024e6d3e412c3fda0efccfb2029c7", "UNRESOLVED", null,
        "CURRENT_REPOSITORY_HEAD_PAYLOAD_RIGHTS_UNRESOLVED"),
    ], ["NO_PERSONA_OUTCOME_AS_REALITY", "NO_POPULATION_REPRESENTATIVENESS_CLAIM",
      "NO_TRAINING_UNTIL_PER_SOURCE_RIGHTS_AND_PRIVACY_REPLAY"]),
  entity("MICROFEEL_ECHOSHELL", "MICROFEEL / ECHOSHELL", "https://3dmicrofeel.com/",
    "OFFICIAL_SITE_ONLY_NO_PUBLIC_REPOSITORY", "SIMULATION",
    ["GENERATED_WORLD_ARTIFACT_TRACE", "PHYSICAL_ACTUATION_SAFETY_ENVELOPE"],
    [source("microfeel-site", "OFFICIAL_VENDOR_PAGE", "https://3dmicrofeel.com/", null,
      "ABSENT", null, "OWN_PRODUCT")],
    ["NO_PRODUCT_CODE_OR_DATA_INGRESS", "NO_SIMULATION_AS_PHYSICAL_OUTCOME"]),
  entity("ROPEDIA", "Ropedia / Xperience-10M / HOMIE", null,
    "OFFICIAL_REPOSITORY_AND_DATASET_METADATA_PINNED", "REAL_OBSERVATION",
    ["TIME_ALIGNED_MULTIMODAL_OBSERVATION"], [
      source("homie-toolkit", "OFFICIAL_OPEN_SOURCE", "https://github.com/Ropedia/HOMIE-toolkit",
        "5605e95fe20caac753b30fc74641b08d4dc06311", "VERIFIED", "MIT", "OWN_ASSET"),
      source("xperience-sample", "OFFICIAL_DATASET",
        "https://huggingface.co/datasets/ropedia-ai/xperience-10m-sample",
        "2d80b5af8085a18ffe702e1420968308007f6204", "VERIFIED", "CC-BY-NC-4.0",
        "NON_COMMERCIAL_SAMPLE"),
      source("xperience-full", "GATED_OFFICIAL_DATASET",
        "https://huggingface.co/datasets/ropedia-ai/Xperience-10M",
        "ce943cf271a758b60240084892d05cf6dc12dd90", "GATED", null,
        "MANUAL_ACCESS_EXTERNAL_AGREEMENT"),
    ], ["NO_GATED_PAYLOAD_REQUEST", "NO_NON_COMMERCIAL_DATA_IN_COMMERCIAL_TRAINING",
      "NO_HUMAN_TRAJECTORY_AS_ROBOT_AUTHORITY_OR_OUTCOME_TRUTH"]),
  entity("SEELE", "SEELE / SeeleAgent", null,
    "OFFICIAL_PRODUCT_WRAPPER_AND_OPEN_RESEARCH_RELEASE_PINNED", "SIMULATION",
    ["GENERATED_WORLD_ARTIFACT_TRACE", "ASYNC_JOB_STATUS_ARTIFACT"], [
      source("seele-game-gen", "OFFICIAL_API_WRAPPER", "https://github.com/SeeleAI/seele-game-gen",
        "c2a21e2d896d3392b94faeb533dfaddebc467ca7", "ABSENT", null, "OWN_ASSET"),
      source("openeva", "OFFICIAL_OPEN_SOURCE", "https://github.com/SeeleAI/OpenEVA",
        "9cdd493872363e355ef35718076379c2dbff5fa2", "VERIFIED", "Apache-2.0",
        "UNDERSTANDING_SIDE_PUBLIC_RELEASE"),
      source("eva01-full", "OFFICIAL_MODEL", "https://huggingface.co/SEELE-AI/EVA01-2B-Instruct",
        "9c3f825ce5ff5af007b92bb9ab95b85576ea7370", "VERIFIED", "Apache-2.0",
        "UNDERSTANDING_SIDE_CHECKPOINT"),
      source("eva01-lora", "OFFICIAL_MODEL",
        "https://huggingface.co/SEELE-AI/EVA01-2B-Instruct-LoRA",
        "14b0899b42455591bd3d739311bd1e2dd256670d", "VERIFIED", "Apache-2.0",
        "UNDERSTANDING_SIDE_CHECKPOINT"),
    ], ["NO_COPY_FROM_UNLICENSED_SEELE_GAME_GEN", "NO_GENERATION_OR_DATA_RELEASE_CLAIM",
      "NO_MODEL_JUDGE_AS_PHYSICAL_OUTCOME"]),
  entity("SURETHING", "SureThing / OpenCockpit", "https://surething.io/",
    "OFFICIAL_PRODUCT_SITE_AND_SIBLING_OPEN_SOURCE_PINNED", "VENDOR_CLAIM",
    ["TOOL_SNAPSHOT_CHECKPOINT_APPROVAL"], [
      source("surething-site", "OFFICIAL_VENDOR_PAGE", "https://surething.io/", null,
        "ABSENT", null, "OWN_PRODUCT"),
      source("open-cockpit", "OFFICIAL_OPEN_SOURCE", "https://github.com/Surething-io/cockpit",
        "555d1509cdc71b5927e48e441b4430c60b82f136", "VERIFIED", "MIT",
        "OFFICIAL_SIBLING_NOT_CLOUD_PRODUCT_SOURCE"),
    ], ["NO_CLOUD_PRODUCT_EQUIVALENCE_CLAIM", "NO_LIVE_BROWSER_DATABASE_OR_CREDENTIAL_CONNECTION",
      "NO_UI_APPROVAL_AS_EXTERNAL_AUTHORITY"]),
  entity("TAP8_SIGMAZ", "Tap8 / SigmaZ AI", "https://tap8.ai/",
    "OFFICIAL_SITE_ONLY_NO_PUBLIC_REPOSITORY", "SIMULATION",
    ["GENERATED_WORLD_ARTIFACT_TRACE"],
    [source("tap8-site", "OFFICIAL_VENDOR_PAGE", "https://tap8.ai/", null,
      "ABSENT", null, "OWN_PRODUCT")],
    ["NO_VENDOR_SCALE_OR_FEEDBACK_CLAIM_AS_INDEPENDENT_EVIDENCE",
      "NO_GENERATED_WORLD_AS_REALITY_OUTCOME"]),
], (left, right) => left.id < right.id ? -1 : 1));

function findById(records, id) {
  for (let index = 0; index < records.length; index += 1) {
    if (records[index].id === id) return records[index];
  }
  return null;
}

function uniqueSortedProjection(selected, key) {
  const output = [];
  for (let rowIndex = 0; rowIndex < selected.length; rowIndex += 1) {
    const values = selected[rowIndex][key];
    for (let valueIndex = 0; valueIndex < values.length; valueIndex += 1) {
      const value = values[valueIndex];
      let seen = false;
      for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
        if (output[outputIndex] === value) { seen = true; break; }
      }
      if (!seen) output[output.length] = value;
    }
  }
  return ArraySort(output, (left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function registryBody() {
  return {
    schema: PROVIDER_PATTERN_REGISTRY_SCHEMA,
    reviewedAt: REVIEWED_AT,
    reviewMode: "MAINTAINER_REVIEWED_OFFICIAL_METADATA_NOT_SOURCE_BYTE_REPLAYED_BY_THIS_MODULE",
    patternDefinitions: StructuredClone(PATTERNS),
    entities: StructuredClone(ENTITIES),
    accounting: { entities: ENTITIES.length, patterns: PATTERNS.length,
      importedCodeAssets: 0, executedThirdPartyAssets: 0, ingestedPayloadRows: 0,
      admittedTrainingRows: 0, causalExperienceUnits: 0, authorityGrants: 0 },
    northStarBoundary: {
      mayExpandReviewRequirements: true,
      mayExpandEvidenceOrResponsibilityCoverageClaims: false,
      mayExpandCapability: false,
      mayExpandAuthority: false,
      mayCloseObligation: false,
      actionReady: false,
    },
  };
}

export function buildProviderPatternRegistry() {
  const body = registryBody();
  return deepFreeze({ ...body,
    registryHash: digest(PROVIDER_PATTERN_REGISTRY_SCHEMA, body) });
}

export function verifyProviderPatternRegistry(record) {
  try {
    if (!record || typeof record !== "object" || ArrayIsArray(record)) {
      return { ok: false, error: "PROVIDER_PATTERN_REGISTRY_INVALID" };
    }
    const actualCanonical = canonicalizeStrict(record);
    const expected = buildProviderPatternRegistry();
    if (!RegExpTest(HASH, record.registryHash ?? "")
      || actualCanonical !== canonicalizeStrict(expected)) {
      return { ok: false, error: "PROVIDER_PATTERN_REGISTRY_INVALID" };
    }
    return { ok: true, registryHash: expected.registryHash,
      actionReady: false, authorityEstablished: false };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message
      : "PROVIDER_PATTERN_REGISTRY_INVALID" };
  }
}

export function listProviderPatternEntities() {
  const ids = [];
  for (let index = 0; index < ENTITIES.length; index += 1) {
    ids[index] = ENTITIES[index].id;
  }
  return ids;
}

export function providerPatternEntity(id) {
  const found = findById(ENTITIES, id);
  if (!found) throw new Error("PROVIDER_PATTERN_ENTITY_UNKNOWN");
  return deepFreeze(StructuredClone(found));
}

export function buildProviderPatternReviewProjection(entityId) {
  const entityRecord = providerPatternEntity(entityId);
  const selected = [];
  for (let index = 0; index < entityRecord.patternIds.length; index += 1) {
    const id = entityRecord.patternIds[index];
    const found = findById(PATTERNS, id);
    if (!found) throw new Error("PROVIDER_PATTERN_DEFINITION_MISSING");
    selected[index] = StructuredClone(found);
  }
  const body = {
    schema: PROVIDER_PATTERN_REVIEW_SCHEMA,
    registryHash: buildProviderPatternRegistry().registryHash,
    entityId,
    sourceReality: entityRecord.sourceReality,
    patternIds: entityRecord.patternIds,
    evidenceRequirements: uniqueSortedProjection(selected, "evidenceRequirements"),
    responsibilityRequirements: uniqueSortedProjection(selected,
      "responsibilityRequirements"),
    minimumControls: uniqueSortedProjection(selected, "minimumControls"),
    interpretation: "CONSERVATIVE_REVIEW_REQUIREMENTS_NOT_COVERAGE_OR_EFFECT_PROOF",
    sourceCompletenessEstablished: false,
    effectClosureEstablished: false,
    affectedPartyCompletenessEstablished: false,
    evidenceCoverageEstablished: false,
    responsibilityCoverageEstablished: false,
    authorityEstablished: false,
    actionReady: false,
    executable: false,
    admittedTrainingRows: 0,
    causalExperienceUnits: 0,
  };
  return deepFreeze({ ...body,
    projectionHash: digest(PROVIDER_PATTERN_REVIEW_SCHEMA, body) });
}

export function verifyProviderPatternReviewProjection(record) {
  try {
    if (!record || typeof record !== "object" || ArrayIsArray(record)) {
      return { ok: false, error: "PROVIDER_PATTERN_REVIEW_INVALID" };
    }
    const actualCanonical = canonicalizeStrict(record);
    if (typeof record.entityId !== "string"
      || !RegExpTest(HASH, record.projectionHash ?? "")) {
      return { ok: false, error: "PROVIDER_PATTERN_REVIEW_INVALID" };
    }
    const expected = buildProviderPatternReviewProjection(record.entityId);
    if (actualCanonical !== canonicalizeStrict(expected)) {
      return { ok: false, error: "PROVIDER_PATTERN_REVIEW_INVALID" };
    }
    return { ok: true, projectionHash: expected.projectionHash,
      interpretation: expected.interpretation, authorityEstablished: false,
      actionReady: false };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message
      : "PROVIDER_PATTERN_REVIEW_INVALID" };
  }
}
