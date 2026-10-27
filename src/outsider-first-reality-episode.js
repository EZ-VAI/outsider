/*
 * First Reality Episode readiness contract.
 *
 * This is a composition layer, not another evidence ontology.  It freezes the
 * joins that must exist before a real remote or physical action arrives and
 * points each join at the executable protocol that already owns it.  Adapters
 * continue to emit their native, source-replayable artifacts; a future
 * promotion verifier must bind those artifacts, this plan, and an externally
 * produced attempt-census slot.  Nulls here mean evidence has not arrived.
 * They are never caller-upgradable trust flags.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  TRACE_SCHEMA,
  WORLD_KINDS,
} from "./outsider-execution-trace.js";
import {
  STAGE1_LIFECYCLE_SCHEMAS,
  STAGE1_PROVIDER_CAPABILITIES,
  STAGE1_PROVIDER_INTERFACES,
} from "./outsider-stage1-lifecycle-frontier.js";
import {
  CURATE_REFUSALS,
  CURATE_SCHEMAS,
} from "./outsider-curate-core.js";
import {
  REALITY_STEWARDSHIP_SCHEMAS,
  describeStewardshipGap,
} from "./outsider-reality-stewardship.js";
import {
  DEVICE_STREAM_ADAPTER_OUTPUT_SCHEMA_HASH,
  DEVICE_STREAM_PHYSICS_SCHEMAS,
  futureDeviceAdapterContract,
} from "./outsider-device-stream-physics-frontier.js";
import {
  PHYSICAL_DELEGATION_ENVELOPE_SCHEMA,
  PRIMITIVE_ATTEMPT_SCHEMA,
} from "./outsider-physical-delegation.js";
import {
  PHYSICAL_TELEMETRY_SCHEMAS,
} from "./outsider-physical-telemetry.js";
import {
  LOSS_EXPOSURE_SCHEMAS,
} from "./outsider-loss-exposure-evidence.js";
import {
  STAGE2_PRE_ACTION_FACTOR_POLICY_HASH,
  STAGE2_QUOTE_FRONTIER_SCHEMAS,
  describeStage2QuoteFrontier,
} from "./outsider-stage2-quote-frontier.js";
import {
  defaultAnchorPolicy as defaultRunCensusAnchorPolicy,
} from "./outsider-run-census.js";

export const FIRST_REALITY_EPISODE_SCHEMAS = Object.freeze({
  plan: "outsider/first-reality-episode-plan/v1",
  preflight: "outsider/first-reality-episode-preflight/v1",
});

export const FIRST_REALITY_EPISODE_PROFILES = Object.freeze({
  REMOTE_ACTION: "REMOTE_ACTION",
  PHYSICAL_ACTION: "PHYSICAL_ACTION",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const PROFILE_SET = new Set(Object.values(FIRST_REALITY_EPISODE_PROFILES));

function fail(code) {
  throw new Error(`FIRST_REALITY_EPISODE_${code}`);
}

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function nativeCanonicalHash(value) {
  return `sha256:${createHash("sha256")
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function token(value, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(code);
  return value;
}

function normalizeHorizons(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 32) {
    fail("OBSERVATION_HORIZONS_INVALID");
  }
  if (Object.keys(value).length !== value.length
    || !Array.from({ length: value.length }, (_, index) => index)
      .every((index) => Object.hasOwn(value, index))) {
    fail("OBSERVATION_HORIZONS_MUST_BE_DENSE");
  }
  const horizons = value.map((horizon) => {
    if (!exactKeys(horizon, ["horizonId", "closesAfterMs", "mandatory"])) {
      fail("OBSERVATION_HORIZON_SHAPE_INVALID");
    }
    if (!Number.isSafeInteger(horizon.closesAfterMs) || horizon.closesAfterMs < 0) {
      fail("OBSERVATION_HORIZON_DURATION_INVALID");
    }
    if (horizon.mandatory !== true) fail("OBSERVATION_HORIZON_MUST_BE_MANDATORY");
    return {
      horizonId: token(horizon.horizonId, "OBSERVATION_HORIZON_ID_INVALID"),
      closesAfterMs: horizon.closesAfterMs,
      mandatory: true,
    };
  }).sort((left, right) => left.closesAfterMs - right.closesAfterMs
    || left.horizonId.localeCompare(right.horizonId));
  if (new Set(horizons.map((item) => item.horizonId)).size !== horizons.length) {
    fail("OBSERVATION_HORIZON_DUPLICATE");
  }
  if (!horizons.some((item) => item.closesAfterMs === 0)
    || !horizons.some((item) => item.closesAfterMs > 0)) {
    fail("OBSERVATION_HORIZONS_IMMEDIATE_AND_DELAYED_REQUIRED");
  }
  return horizons;
}

function fixedAuthority() {
  return {
    claimAuthority: false,
    admissionAuthority: false,
    actionAuthority: false,
    outcomeAuthority: false,
    trainingAuthority: false,
    pricingAuthority: false,
    guaranteeAuthority: false,
    settlementAuthority: false,
    financialAuthority: false,
    productionAuthority: false,
    callerBooleanCanElevate: false,
    causalExperienceUnits: 0,
    price: null,
    premium: null,
    capital: null,
    coverage: null,
    guarantee: null,
    settlement: null,
  };
}

const ROSBAG2_CONTRACT = futureDeviceAdapterContract("ROSBAG2");
const MCAP_CONTRACT = futureDeviceAdapterContract("MCAP");

function remoteProfileContract() {
  return {
    profile: FIRST_REALITY_EPISODE_PROFILES.REMOTE_ACTION,
    adapterRoute: {
      module: "outsider-execution-trace.js",
      registryEntrypoint: "registerAdapter",
      normalizationEntrypoint: "normalizeExecution",
      requiredCallOrder: ["registerAdapter", "normalizeExecution"],
      inputForm: "RAW_SOURCE_REFERENCE_OPENED_BY_REGISTERED_ADAPTER",
      outputSchema: TRACE_SCHEMA,
      defaultWorldKindUntilAdapterEvidence: "unknown",
      unknownWorldFailsSafe: same(WORLD_KINDS.unknown,
        { reversible: false, externality: true }),
      adapterNameHintRequiredAtNormalization: true,
      adapterImplementationCommitmentRequired: true,
      adapterSourceSchemaCommitmentRequired: true,
      worksheetMayPreShapeMakeExecutionTraceInput: false,
      directMakeExecutionTraceEntrypointPermitted: false,
    },
    sourceRequirements: [
      "RAW_SOURCE_REFERENCE_REGISTERED_ADAPTER_HINT_AND_IMPLEMENTATION_COMMITMENT",
      "SOURCE_NATIVE_ACTION_ID_AND_IDEMPOTENCY_COMMITMENT",
      "ACTOR_IDENTITY_AND_AUTHORITY_COMMITMENT",
      "PRE_ACTION_REMOTE_STATE_COMMITMENT",
      "SERVER_ACKNOWLEDGEMENT_COMMITMENT",
      "POST_ACTION_REMOTE_STATE_COMMITMENT",
      "ROLLBACK_OR_RECOVERY_EVIDENCE_COMMITMENT",
    ],
    routingBoundary: {
      logsAuthorizeAction: false,
      acknowledgementsAreIndependentOutcomes: false,
      worksheetTraceShapedFieldsAuthorizeNormalization: false,
      remoteSuccessMayBePromotedByThisPlan: false,
    },
  };
}

function physicalProfileContract() {
  return {
    profile: FIRST_REALITY_EPISODE_PROFILES.PHYSICAL_ACTION,
    adapterRoute: {
      module: "outsider-device-stream-physics-frontier.js",
      registryEntrypoint: "DeviceStreamAdapterRegistry.register",
      replayEntrypoint: "DeviceStreamAdapterRegistry.replay",
      adapterDescriptorSchema: DEVICE_STREAM_PHYSICS_SCHEMAS.adapterDescriptor,
      immutableSourceManifestSchema: DEVICE_STREAM_PHYSICS_SCHEMAS.sourceManifest,
      platformParameterManifestSchema: DEVICE_STREAM_PHYSICS_SCHEMAS.platformManifest,
      adapterOutputSchema: DEVICE_STREAM_PHYSICS_SCHEMAS.adapterOutput,
      requiredAdapterOutputSchemaHash: DEVICE_STREAM_ADAPTER_OUTPUT_SCHEMA_HASH,
      executionTraceSchema: TRACE_SCHEMA,
      defaultWorldKind: "physical",
    },
    sourceRequirements: [
      "PHYSICAL_DELEGATION_ENVELOPE_PRIMITIVE_ATTEMPT_AND_TELEMETRY_ASSESSMENT",
      "IMMUTABLE_SOURCE_OBJECT_OR_EXPLICIT_LIVE_CAPTURE_ROOT",
      "SOURCE_CLOCK_AND_UNCERTAINTY_COMMITMENT",
      "ACTION_OBSERVATION_PAIRING",
      "EXPLICIT_SENSOR_MISSINGNESS",
      "COORDINATE_FRAME_AND_UNIT_EXPLICIT_PLATFORM_MANIFEST",
      "CALIBRATION_AND_PARAMETER_SOURCE_COMMITMENTS",
      "ABORT_ESTOP_HANDOFF_AND_RECOVERY_COMMITMENTS",
    ],
    knownUnimplementedFormatContracts: [
      { formatFamily: MCAP_CONTRACT.formatFamily,
        contractHash: MCAP_CONTRACT.contractHash,
        parserStatus: MCAP_CONTRACT.parserStatus },
      { formatFamily: ROSBAG2_CONTRACT.formatFamily,
        contractHash: ROSBAG2_CONTRACT.contractHash,
        parserStatus: ROSBAG2_CONTRACT.parserStatus },
    ],
    routingBoundary: {
      sourceNativeOutcomeIsIndependentConsequence: false,
      physicsTruthExternallyVerifiedByLocalReplay: false,
      liveCaptureMayBeInferredFromCallerBoolean: false,
      physicalSuccessMayBePromotedByThisPlan: false,
    },
  };
}

const PROFILE_CONTRACTS = deepFreeze({
  REMOTE_ACTION: remoteProfileContract(),
  PHYSICAL_ACTION: physicalProfileContract(),
});

function profileContract(profile) {
  if (!PROFILE_SET.has(profile)) fail("PROFILE_INVALID");
  return clone(PROFILE_CONTRACTS[profile]);
}

function compositionContract() {
  const stewardship = describeStewardshipGap();
  const stage2 = describeStage2QuoteFrontier();
  /* Pure projection: defaultRunCensusAnchorPolicy performs no host I/O. */
  const runCensusAnchorPolicy = defaultRunCensusAnchorPolicy();
  const body = {
    executionTrace: {
      schema: TRACE_SCHEMA,
      worldKindsHash: digest("outsider/execution-trace-world-kinds/v1", WORLD_KINDS),
    },
    attest: {
      schemasHash: digest("outsider/stage1-lifecycle-schemas/v1", STAGE1_LIFECYCLE_SCHEMAS),
      providerCapabilities: Object.values(STAGE1_PROVIDER_CAPABILITIES).sort(),
      providerInterfacesHash: digest("outsider/stage1-provider-interfaces/v1",
        STAGE1_PROVIDER_INTERFACES),
    },
    curate: {
      schemasHash: digest("outsider/curate-schemas/v1", CURATE_SCHEMAS),
      noProspectiveCausalDesignRefusal: CURATE_REFUSALS.noProspectiveCausalDesign,
    },
    realityStewardship: {
      schemasHash: digest("outsider/reality-stewardship-schemas/v1",
        REALITY_STEWARDSHIP_SCHEMAS),
      gapMapHash: stewardship.gapMapHash,
      boundaryHash: digest("outsider/reality-stewardship-fixed-boundary/v1",
        stewardship.boundary),
    },
    deviceStream: {
      schemasHash: digest("outsider/device-stream-physics-schemas/v1",
        DEVICE_STREAM_PHYSICS_SCHEMAS),
      adapterOutputSchemaHash: DEVICE_STREAM_ADAPTER_OUTPUT_SCHEMA_HASH,
    },
    runCensus: {
      module: "outsider-run-census.js",
      primitiveStatus:
        "LOCAL_TAMPER_EVIDENT_CENSUS_PRIMITIVE_PRODUCT_KERNEL_PATH_PRESENT",
      defaultAnchorPolicySchema: runCensusAnchorPolicy.schema,
      defaultAnchorPolicyHash: nativeCanonicalHash(runCensusAnchorPolicy),
      realPreActionRegistrationEstablished: false,
      realPreActionContractBindingEstablished: false,
      productKernelIntegrationEstablishedByThisPlan: false,
    },
    stage2: {
      quoteFrontierSchemasHash: digest("outsider/stage2-quote-frontier-schemas/v1",
        STAGE2_QUOTE_FRONTIER_SCHEMAS),
      preActionFactorPolicyHash: STAGE2_PRE_ACTION_FACTOR_POLICY_HASH,
      lossExposureSchemasHash: digest("outsider/loss-exposure-schemas/v1",
        LOSS_EXPOSURE_SCHEMAS),
      boundaryHash: digest("outsider/stage2-fixed-no-authority-boundary/v1", {
        quote: stage2.quote,
        outputs: stage2.outputs,
        authority: stage2.authority,
      }),
    },
  };
  return { ...body, compositionHash: digest(
    "outsider/first-reality-episode-composition/v1", body) };
}

function attemptCensusContract(attemptCensusSlotCommitmentHash) {
  return {
    attemptCensusSlotCommitmentHash,
    producer: "FUTURE_EXTERNAL_PREACTION_CENSUS_PROMOTION_VERIFIER",
    primitiveStatus: "LOCAL_CENSUS_PRIMITIVE_AND_PRODUCT_KERNEL_PATH_PRESENT",
    productKernelIntegrationEstablishedByThisPlan: false,
    realPreActionSlotEstablished: false,
    ledgerHash: null,
    attemptIdentityHash: null,
    scheduledPopulationHash: null,
    inclusionDisposition: null,
    verifierRequirement: {
      status:
        "PRODUCT_KERNEL_CENSUS_PATH_PRESENT_REAL_EPISODE_PREACTION_SLOT_AND_PROMOTION_JOIN_UNPROVEN",
      mustSourceReplayExternalLedger: true,
      mustBindPlanHash: true,
      mustBindSlotCommitmentHash: true,
      mustBindAttemptIdentityBeforeOutcome: true,
      mustPreserveRejectedAbortedTimedOutAndMissingAttempts: true,
      callerLedgerClosedBooleanAccepted: false,
      callerInclusionBooleanAccepted: false,
    },
  };
}

function evidenceSlots() {
  return {
    claimWayWorld: {
      executionTraceSchema: TRACE_SCHEMA,
      claimHash: null,
      wayHash: null,
      worldHash: null,
      executionTraceHash: null,
    },
    sourceAcquisition: {
      adapterDescriptorHash: null,
      adapterImplementationHash: null,
      adapterSourceSchemaHash: null,
      immutableSourceManifestHash: null,
      acquisitionRootHash: null,
      normalizedAdapterOutputHash: null,
      sourceReplayReceiptHash: null,
    },
    measurement: {
      clock: {
        sourceClockId: null,
        sourceTimestampUnit: null,
        clockUncertaintyNs: null,
        clockSyncEvidenceHash: null,
      },
      units: { unitAndCoordinateManifestHash: null },
      calibration: { calibrationAndParameterManifestHash: null },
      missingness: { missingnessLedgerHash: null },
    },
    monitorRegime: {
      monitorDisclosure: null,
      monitorIdentityHash: null,
      monitorIndependenceEvidenceHash: null,
      agentMonitorKnowledge: null,
      evaluationTriggerFactorsHash: null,
      monitorPolicyVersionHash: null,
      attackAdaptivity: null,
      traceVisibility: null,
      selectionMechanismHash: null,
      counterfactualTargetRegimeHash: null,
      transportabilityAssumptionsHash: null,
    },
    independentOutcome: {
      outcomeDefinitionHash: null,
      outcomeAdjudicatorRootHash: null,
      adjudicationPolicyHash: null,
      observationRootHash: null,
      outcomeHash: null,
      sourceNativeOutcomeAcceptedAsIndependent: false,
    },
  };
}

function stewardshipSlots() {
  return {
    boundarySchema: REALITY_STEWARDSHIP_SCHEMAS.boundary,
    claimSchema: REALITY_STEWARDSHIP_SCHEMAS.claim,
    consequenceStateSchema: REALITY_STEWARDSHIP_SCHEMAS.consequenceState,
    resourceOwnerRootHash: null,
    affectedPartyRegisterRootHash: null,
    standingAndConsentEvidenceHash: null,
    experienceRightsHash: null,
    recoveryPlanHash: null,
    responsibilityRootHash: null,
    cumulativeRealityBudgetLedgerHash: null,
    realityBoundaryHash: null,
    stewardshipClaimHash: null,
    budgetCommitmentHash: null,
    assessmentHash: null,
    executionReceiptHash: null,
    consequenceStateHash: null,
  };
}

function attestSlots() {
  return {
    lifecycleStateSchema: STAGE1_LIFECYCLE_SCHEMAS.state,
    sourceReplayReceiptHash: null,
    timestampProviderReceiptHash: null,
    membershipProviderReceiptHash: null,
    revocationProviderReceiptHash: null,
    retentionProviderReceiptHash: null,
    lifecycleEvaluationHash: null,
    rightsEstablished: false,
  };
}

function curateSlots() {
  return {
    episodeSchema: CURATE_SCHEMAS.episode,
    clearanceSchema: CURATE_SCHEMAS.clearance,
    sourceEpisodeHash: null,
    clearanceHash: null,
    checkpointHash: null,
    inclusionProofHash: null,
    fitToLearnDecisionHash: null,
    automaticTraining: false,
    causalExperienceUnits: 0,
  };
}

function stage2TargetContract() {
  return {
    factorPolicyHash: STAGE2_PRE_ACTION_FACTOR_POLICY_HASH,
    preAction: {
      observationCutoff: null,
      proposedActionAt: null,
      factorReceiptHash: null,
      missingMaskHash: null,
    },
    validityDomain: {
      targetDomainHash: null,
      monitoredRegimeHash: null,
      targetDeploymentRegimeHash: null,
      transportabilityEstimandHash: null,
      transportabilityAssumptionsHash: null,
    },
    exposureAndLoss: {
      exposureUnit: null,
      unitDefinitionHash: null,
      exposureWindowPolicyHash: null,
      eventIdentityPolicyHash: null,
      lossIdentityPolicyHash: null,
      claimIdentityPolicyHash: null,
      occurrenceClockPolicyHash: null,
      reportClockPolicyHash: null,
      adjudicationClockPolicyHash: null,
      recoveryClockPolicyHash: null,
      reopenClockPolicyHash: null,
      zeroLossWindowPolicyHash: null,
      censoringAndMaturityPolicyHash: null,
      dependenceRootPolicyHash: null,
      temporalOperatorCustomerHoldoutPolicyHash: null,
      independentOutcomeAdjudicationPolicyHash: null,
    },
    admission: {
      targetPreActionRowsAdmitted: 0,
      targetModelComponentsFitted: 0,
      targetDomainTransferEstablished: false,
      decision: "NON_BINDING_ABSTAIN",
    },
    outputs: {
      frequency: null,
      severity: null,
      tail: null,
      price: null,
      premium: null,
      capital: null,
      coverage: null,
    },
  };
}

function delayedConsequenceContract(observationHorizons) {
  return {
    semantics: "REALITY_STEWARDSHIP_MANDATORY_OBSERVATION_HORIZONS",
    observationHorizons,
    reportSlots: observationHorizons.map((horizon) => ({
      horizonId: horizon.horizonId,
      closesAfterMs: horizon.closesAfterMs,
      consequenceReportHash: null,
      challengeStateHash: null,
      recoveryEvidenceHash: null,
      closureEvidenceHash: null,
    })),
    immediateSuccessClosesEpisode: false,
    reopeningRequiredWhenLaterEvidenceArrives: true,
  };
}

function commonProtocolBindings() {
  return [
    {
      bindingId: "MONITOR_REGIME",
      source: { planSlot: "monitorRegime" },
      requiredFields: [
        "monitorDisclosure", "monitorIdentityHash", "monitorIndependenceEvidenceHash",
        "agentMonitorKnowledge", "evaluationTriggerFactorsHash", "monitorPolicyVersionHash",
        "attackAdaptivity", "traceVisibility", "selectionMechanismHash",
        "counterfactualTargetRegimeHash", "transportabilityAssumptionsHash",
      ],
      temporalRequirement: "FREEZE_APPLICABLE_FIELDS_BEFORE_ACTION",
      authorityGranted: false,
    },
    {
      bindingId: "REALITY_STEWARDSHIP_RIGHTS_BUDGET_RESPONSIBILITY",
      module: "outsider-reality-stewardship.js",
      entrypoints: [
        "createRealityBoundary", "createStewardshipClaim",
        "createRealityBudgetCommitment", "assessRealityStewardship",
        "createRealityExecutionReceipt",
      ],
      artifactSchemas: [
        REALITY_STEWARDSHIP_SCHEMAS.boundary,
        REALITY_STEWARDSHIP_SCHEMAS.claim,
        REALITY_STEWARDSHIP_SCHEMAS.commitment,
        REALITY_STEWARDSHIP_SCHEMAS.assessment,
        REALITY_STEWARDSHIP_SCHEMAS.execution,
      ],
      source: { planSlot: "stewardship" },
      requiredPlanSlots: [
        "resourceOwnerRootHash", "affectedPartyRegisterRootHash",
        "standingAndConsentEvidenceHash", "experienceRightsHash",
        "responsibilityRootHash", "cumulativeRealityBudgetLedgerHash",
        "recoveryPlanHash", "budgetCommitmentHash", "assessmentHash",
        "executionReceiptHash",
      ],
      temporalRequirement: "BOUNDARY_RIGHTS_BUDGET_AND_RESPONSIBILITY_PRE_ACTION",
      authorityGranted: false,
    },
    {
      bindingId: "ATTEST_SOURCE_REPLAY_AND_LIFECYCLE",
      module: "outsider-stage1-lifecycle-frontier.js",
      entrypoints: [
        "replaySealedStage05Source", "createStage1SourceVerifierReceipt",
        "createStage1LifecycleState",
      ],
      artifactSchemas: [
        STAGE1_LIFECYCLE_SCHEMAS.sourceReceipt,
        STAGE1_LIFECYCLE_SCHEMAS.providerReceipt,
        STAGE1_LIFECYCLE_SCHEMAS.state,
        STAGE1_LIFECYCLE_SCHEMAS.evaluation,
      ],
      source: { planSlot: "attest" },
      temporalRequirement: "SOURCE_REPLAY_AND_PROVIDER_RECEIPTS_BEFORE_PROMOTION",
      authorityGranted: false,
    },
    {
      bindingId: "CURATE_CLEARANCE_AND_LEARNING_DECISION",
      module: "outsider-curate-core.js",
      entrypoints: [
        "normalizeCurateEpisode", "clearCurateEpisode", "buildCurateCheckpoint",
        "createCurateInclusionProof", "evaluateCurateFitToLearn",
      ],
      artifactSchemas: [
        CURATE_SCHEMAS.episode,
        CURATE_SCHEMAS.clearance,
        CURATE_SCHEMAS.checkpoint,
        CURATE_SCHEMAS.inclusionProof,
        CURATE_SCHEMAS.fitToLearnDecision,
      ],
      source: { planSlot: "curate" },
      temporalRequirement: "AFTER_SOURCE_REPLAY_BEFORE_ANY_LEARNING_PROMOTION",
      authorityGranted: false,
    },
    {
      bindingId: "DELAYED_CONSEQUENCE_OBLIGATIONS",
      module: "outsider-reality-stewardship.js",
      entrypoints: [
        "createConsequenceReport", "createStewardshipChallenge", "buildConsequenceState",
      ],
      artifactSchemas: [
        REALITY_STEWARDSHIP_SCHEMAS.consequence,
        REALITY_STEWARDSHIP_SCHEMAS.challenge,
        REALITY_STEWARDSHIP_SCHEMAS.consequenceState,
      ],
      source: { planSlot: "delayedConsequence" },
      temporalRequirement: "POST_ACTION_EACH_MANDATORY_HORIZON_AND_REOPENING",
      immediateSuccessClosesObligation: false,
      authorityGranted: false,
    },
    {
      bindingId: "STAGE2_PRE_ACTION_TARGET_CONTRACT",
      module: "outsider-stage2-quote-frontier.js",
      entrypoint: "buildStage2QuoteFrontier",
      artifactSchema: STAGE2_QUOTE_FRONTIER_SCHEMAS.frontier,
      factorPolicyHash: STAGE2_PRE_ACTION_FACTOR_POLICY_HASH,
      source: { planSlot: "stage2TargetContract" },
      temporalRequirement: "TARGET_FACTORS_AND_EXPOSURE_CONTRACT_PRE_ACTION",
      quoteAdmission: "NON_BINDING_ABSTAIN",
      authorityGranted: false,
    },
  ];
}

function remoteProtocolBindings() {
  return [
    {
      bindingId: "REMOTE_RAW_SOURCE_ADAPTER_NORMALIZATION",
      module: "outsider-execution-trace.js",
      orderedEntrypoints: ["registerAdapter", "normalizeExecution"],
      inputForm: "RAW_SOURCE_REFERENCE_PLUS_ADAPTER_HINT_AND_COMMITMENTS",
      outputSchema: TRACE_SCHEMA,
      source: { planSlot: "sourceAcquisition" },
      requiredPlanSlots: [
        "adapterDescriptorHash", "adapterImplementationHash", "adapterSourceSchemaHash",
        "immutableSourceManifestHash", "acquisitionRootHash", "normalizedAdapterOutputHash",
        "sourceReplayReceiptHash",
      ],
      worksheetMaySupplyMakeExecutionTraceInput: false,
      directMakeExecutionTraceEntrypointPermitted: false,
      temporalRequirement: "REGISTER_ADAPTER_BEFORE_NORMALIZE_EXECUTION",
      authorityGranted: false,
    },
    ...commonProtocolBindings(),
  ];
}

function physicalProtocolBindings() {
  return [
    {
      bindingId: "DEVICE_STREAM_ADAPTER_SOURCE_REPLAY",
      module: "outsider-device-stream-physics-frontier.js",
      entrypoints: [
        "DeviceStreamAdapterRegistry.register", "DeviceStreamAdapterRegistry.replay",
      ],
      artifactSchemas: [
        DEVICE_STREAM_PHYSICS_SCHEMAS.adapterDescriptor,
        DEVICE_STREAM_PHYSICS_SCHEMAS.sourceManifest,
        DEVICE_STREAM_PHYSICS_SCHEMAS.platformManifest,
        DEVICE_STREAM_PHYSICS_SCHEMAS.adapterOutput,
      ],
      requiredAdapterOutputSchemaHash: DEVICE_STREAM_ADAPTER_OUTPUT_SCHEMA_HASH,
      temporalRequirement: "SOURCE_REPLAY_BEFORE_PHYSICAL_PROMOTION",
      authorityGranted: false,
    },
    {
      bindingId: "PHYSICAL_DELEGATION_ENVELOPE",
      module: "outsider-physical-delegation.js",
      entrypoint: "createPhysicalDelegationEnvelope",
      artifactSchema: PHYSICAL_DELEGATION_ENVELOPE_SCHEMA,
      temporalRequirement: "PRE_ACTION",
      authorityGranted: false,
    },
    {
      bindingId: "PHYSICAL_PRIMITIVE_ATTEMPT",
      module: "outsider-physical-delegation.js",
      entrypoint: "createPrimitiveAttempt",
      artifactSchema: PRIMITIVE_ATTEMPT_SCHEMA,
      temporalRequirement: "ATTEMPT_LINEAGE_DURING_OR_AFTER_ACTION",
      authorityGranted: false,
    },
    {
      bindingId: "PHYSICAL_TELEMETRY_ASSESSMENT",
      module: "outsider-physical-telemetry.js",
      entrypoint: "createPhysicalTelemetryAssessment",
      artifactSchema: PHYSICAL_TELEMETRY_SCHEMAS.assessment,
      temporalRequirement: "ATTEMPT_BOUND_POST_ACTION_MEASUREMENT",
      missingTelemetryImputedAsZero: false,
      authorityGranted: false,
    },
    ...commonProtocolBindings(),
  ];
}

function adapterJoinContract(profile) {
  return {
    profile,
    adapterArtifactsRemainSeparateSourceReplayableRecords: true,
    coreMutationRequiredForNewAdapter: false,
    promotionVerifierStatus:
      "CENSUS_PRIMITIVE_PRESENT_CROSS_PROTOCOL_PROMOTION_VERIFIER_UNPROVEN",
    bindingStatus: "WAITING_FOR_EXTERNAL_ARTIFACTS",
    allRequiredBindingsSatisfied: false,
    readyForPromotion: false,
    requiredBindings: {
      commitmentSlots: [
        "PLAN_HASH",
        "PROFILE_CONTRACT_HASH",
        "ATTEMPT_CENSUS_SLOT_COMMITMENT_HASH",
        "ATTEMPT_IDENTITY_HASH",
        "SOURCE_ACQUISITION_ROOT",
        "ADAPTER_IMPLEMENTATION_AND_SCHEMA_HASHES",
        "CLAIM_WAY_WORLD_HASHES",
        "INDEPENDENT_OUTCOME_OR_EXPLICIT_ABSENCE",
      ],
      protocolArtifacts: profile === FIRST_REALITY_EPISODE_PROFILES.REMOTE_ACTION
        ? remoteProtocolBindings() : physicalProtocolBindings(),
    },
    callerVerifiedBooleanAccepted: false,
    callerAuthorityBooleanAccepted: false,
  };
}

function planBody(input) {
  if (!exactKeys(input, ["planId", "profile", "attemptCensusSlotCommitmentHash",
    "observationHorizons"])) fail("PLAN_INPUT_SHAPE_INVALID");
  const profile = token(input.profile, "PROFILE_INVALID");
  if (!PROFILE_SET.has(profile)) fail("PROFILE_INVALID");
  const horizons = normalizeHorizons(input.observationHorizons);
  if (input.attemptCensusSlotCommitmentHash !== null) {
    fail("REAL_PREACTION_CENSUS_SLOT_NOT_ESTABLISHED_MUST_REMAIN_NULL");
  }
  const contract = profileContract(profile);
  const contractHash = digest("outsider/first-reality-episode-profile-contract/v1", contract);
  const slots = evidenceSlots();
  return {
    schema: FIRST_REALITY_EPISODE_SCHEMAS.plan,
    schemaVersion: "1.0.0",
    planId: token(input.planId, "PLAN_ID_INVALID"),
    profile,
    status: "WAITING_FOR_EXTERNAL_EVIDENCE",
    composition: compositionContract(),
    profileContract: contract,
    profileContractHash: contractHash,
    attemptCensus: attemptCensusContract(null),
    claimWayWorld: slots.claimWayWorld,
    sourceAcquisition: slots.sourceAcquisition,
    measurement: slots.measurement,
    monitorRegime: slots.monitorRegime,
    stewardship: stewardshipSlots(),
    attest: attestSlots(),
    curate: curateSlots(),
    independentOutcome: slots.independentOutcome,
    delayedConsequence: delayedConsequenceContract(horizons),
    stage2TargetContract: stage2TargetContract(),
    adapterJoin: adapterJoinContract(profile),
    authority: fixedAuthority(),
  };
}

/**
 * Freeze the no-authority plan before external evidence arrives.  Version 1
 * requires the future external census-slot commitment to remain null until a
 * real pre-action registration/binding integration exists.  No caller trust,
 * success, admission, or authority boolean is accepted.
 */
export function createFirstRealityEpisodePlan(input = {}) {
  const body = planBody(input);
  return deepFreeze({ ...body, planHash: digest(FIRST_REALITY_EPISODE_SCHEMAS.plan, body) });
}

export function verifyFirstRealityEpisodePlan(plan) {
  try {
    if (!plain(plan) || !HASH.test(String(plan.planHash ?? ""))) {
      fail("PLAN_HASH_OR_STRUCTURE_INVALID");
    }
    const rebuilt = createFirstRealityEpisodePlan({
      planId: plan.planId,
      profile: plan.profile,
      attemptCensusSlotCommitmentHash:
        plan.attemptCensus?.attemptCensusSlotCommitmentHash ?? null,
      observationHorizons: plan.delayedConsequence?.observationHorizons,
    });
    if (!same(plan, rebuilt)) fail("PLAN_DERIVATION_INVALID");
    return deepFreeze({
      ok: true,
      verificationLevel: "FIXED_COMPOSITION_AND_NULL_SLOT_REDERIVED",
      planHash: plan.planHash,
      profile: plan.profile,
      profileContractHash: plan.profileContractHash,
      compositionHash: plan.composition.compositionHash,
      attemptCensusSlotCommitmentPresent:
        plan.attemptCensus.attemptCensusSlotCommitmentHash !== null,
      externalFactsReverified: false,
      sourceArtifactsReplayed: false,
      readyForRealAction: false,
      authority: fixedAuthority(),
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "INVALID",
      externalFactsReverified: false,
      sourceArtifactsReplayed: false,
      readyForRealAction: false,
      authority: fixedAuthority(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const COMMON_MISSING_REQUIREMENTS = Object.freeze([
  "CLAIM_WAY_WORLD_SOURCE_BOUND_TRACE",
  "SOURCE_AND_ACQUISITION_ROOT",
  "CLOCK_UNIT_CALIBRATION_AND_MISSINGNESS_EVIDENCE",
  "MONITOR_REGIME_AND_TARGET_REGIME_DECLARATION",
  "STAGE1_SOURCE_REPLAY_AND_LIFECYCLE_PROVIDER_RECEIPTS",
  "STAGE15_CLEARANCE_CHECKPOINT_AND_LEARNING_DECISION",
  "RESOURCE_OWNER_AFFECTED_PARTY_RIGHTS_AND_REALITY_BUDGET",
  "INDEPENDENT_OUTCOME_DEFINITION_SENSING_AND_ADJUDICATION",
  "MANDATORY_DELAYED_CONSEQUENCE_REPORTS_AND_RECOVERY_STATE",
  "STAGE2_PRE_ACTION_EXPOSURE_LOSS_CENSORING_DEPENDENCE_AND_HOLDOUT_CONTRACTS",
  "EXTERNAL_PROMOTION_VERIFIER",
]);

/**
 * Structural preflight.  This deliberately never returns READY: its subject is
 * a pre-data plan whose empirical slots are null.  The result says whether an
 * adapter can be developed against the frozen joins, not whether any action is
 * authorized.
 */
export function preflightFirstRealityEpisode(plan) {
  const checked = verifyFirstRealityEpisodePlan(plan);
  if (!checked.ok) {
    return deepFreeze({
      schema: FIRST_REALITY_EPISODE_SCHEMAS.preflight,
      ok: false,
      status: "INVALID_PLAN",
      readyForAdapterIntegration: false,
      readyForRealAction: false,
      causalExperienceUnits: 0,
      authority: fixedAuthority(),
      error: checked.error,
    });
  }
  const missingRequirements = [
    "EXTERNALLY_PRODUCED_ATTEMPT_CENSUS_SLOT_COMMITMENT",
    ...COMMON_MISSING_REQUIREMENTS,
    ...plan.profileContract.sourceRequirements,
  ].sort();
  const body = {
    schema: FIRST_REALITY_EPISODE_SCHEMAS.preflight,
    schemaVersion: "1.0.0",
    ok: true,
    planHash: plan.planHash,
    profile: plan.profile,
    status: "WAITING_FOR_EXTERNAL_EVIDENCE",
    readyForAdapterIntegration: true,
    readyForRealAction: false,
    coreMutationRequiredForNewAdapter: false,
    missingRequirements,
    evidenceSlotsFilled: 0,
    externalFactsReverified: false,
    sourceArtifactsReplayed: false,
    causalExperienceUnits: 0,
    price: null,
    premium: null,
    capital: null,
    authority: fixedAuthority(),
  };
  return deepFreeze({ ...body, preflightHash: digest(
    FIRST_REALITY_EPISODE_SCHEMAS.preflight, body) });
}
