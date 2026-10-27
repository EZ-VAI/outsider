/*
 * Reviewed discovery catalog for delegation-radius evidence sources.
 *
 * This is deliberately not a network verifier or a dataset adapter. It freezes
 * the small set of publisher claims and revisions reviewed on 2026-08-27 so a
 * later acquisition job can detect drift and build source-specific replay.
 * Discovery, public access, and a license label never admit bytes to training.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

export const DELEGATION_DATA_SCOUT_SCHEMA
  = "outsider/delegation-data-scout-catalog/v1";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const REVIEWED_AT = "2026-08-27T06:00:00.000Z";

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function boundary({ catalogUse, taxonomyUse = false, taskDefinitionUse = false } = {}) {
  return {
    catalogUse,
    taxonomyUse,
    taskDefinitionUse,
    rawPayloadIngress: false,
    automaticTraining: false,
    governedTraining: false,
    targetTransfer: false,
    productionModel: false,
    price: false,
    guarantee: false,
    settle: false,
    actionAuthority: false,
    delegationAuthority: false,
    causalExperienceUnits: 0,
  };
}

function sharedRights(declaredLicense, declarationSource) {
  return {
    declaredLicense,
    declarationSource,
    publisherDeclarationReplayedByThisModule: false,
    perObjectRightsReviewed: false,
    upstreamSourceRightsResolved: false,
    privacyReviewComplete: false,
    adapterGrantsRights: false,
    legalConclusion: false,
  };
}

function candidate(input) {
  return {
    id: input.id,
    officialUrl: input.officialUrl,
    sourceClass: input.sourceClass,
    revision: input.revision,
    revisionKind: input.revisionKind,
    revisionObservedAt: input.revisionObservedAt,
    access: input.access,
    publisherClaims: input.publisherClaims,
    evidenceBoundary: input.evidenceBoundary,
    rightsBoundary: input.rightsBoundary,
    sourceReplay: input.sourceReplay,
    disposition: input.disposition,
    nextGate: input.nextGate,
  };
}

const CANDIDATES = deepFreeze([
  candidate({
    id: "InternRobotics/REAL",
    officialUrl: "https://github.com/InternRobotics/REAL",
    sourceClass: "EMBODIED_TASK_DEFINITIONS_AND_RUNTIME_CODE",
    revision: "9c362043786af2d609fbaa5b680b27a00463e07b",
    revisionKind: "GITHUB_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: null },
    publisherClaims: {
      taskDefinitions: 241,
      publicTrajectories: null,
      publicTrainingRows: null,
      publicCheckpoints: null,
      realRobotEpisodesClaimedInPaper: 60,
      realRobotEpisodesPresentInPublicRelease: false,
    },
    evidenceBoundary: boundary({ catalogUse: true, taskDefinitionUse: true }),
    rightsBoundary: sharedRights("MIT", "GITHUB_ROOT_LICENSE"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "TASK_DEFINITION_REFERENCE_ONLY",
    nextGate: "PIN_TASK_YAML_SET_AND_SEPARATE_TASK_SCHEMA_FROM_UNRELEASED_TRAJECTORIES",
  }),
  candidate({
    id: "MINT-SJTU/RoboFAC-dataset",
    officialUrl: "https://huggingface.co/datasets/MINT-SJTU/RoboFAC-dataset",
    sourceClass: "MIXED_SIMULATION_AND_REAL_ROBOT_FAILURE_VQA",
    revision: "d18353ab36db82ff888ebc9e8485c9fa77e1b25b",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: 25_800_000_000 },
    publisherClaims: {
      erroneousTrajectories: 9_440,
      successfulReferenceTrajectories: 1_282,
      questionAnswerPairs: 78_623,
      tasks: 16,
      scenes: 53,
      realSimulationPartitionPublishedInReviewedCard: false,
    },
    evidenceBoundary: boundary({ catalogUse: true }),
    rightsBoundary: sharedRights("MIT", "HF_CARD_DATA"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "QUARANTINE_METADATA_FIRST",
    nextGate: "REPLAY_MANIFEST_AND_PARTITION_REAL_VS_SIM_BEFORE_ANY_ROW_LEVEL_USE",
  }),
  candidate({
    id: "Yunhao-Feng/AgentHazard",
    officialUrl: "https://github.com/Yunhao-Feng/AgentHazard",
    sourceClass: "SYNTHETIC_AND_EXECUTION_FILTERED_COMPUTER_USE_SAFETY_BENCHMARK",
    revision: "0ea6aabc77d697ee3c3c61af63d839cbeb2d5709",
    revisionKind: "GITHUB_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: null },
    publisherClaims: {
      instances: 2_653,
      riskCategories: 10,
      attackStrategies: 10,
      trajectories: "MORE_THAN_10000",
      construction: "LLM_GENERATED_EXECUTION_FILTERED_LLM_JUDGED_HUMAN_CURATED",
      researchUseNotice: true,
    },
    evidenceBoundary: boundary({ catalogUse: true, taxonomyUse: true }),
    rightsBoundary: sharedRights("MIT_WITH_RESEARCH_USE_NOTICE", "GITHUB_LICENSE_AND_README"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "TAXONOMY_ONLY_DO_NOT_EXECUTE_OR_REPRODUCE_RAW_HARMFUL_PAYLOADS",
    nextGate: "INGEST_ONLY_CATEGORY_COUNTS_AND_SAFE_TEST_LABELS_AFTER_SECURITY_REVIEW",
  }),
  candidate({
    id: "ZJUSCL/CUAStepBench",
    officialUrl: "https://huggingface.co/datasets/ZJUSCL/CUAStepBench",
    sourceClass: "HUMAN_ANNOTATED_REAL_GUI_AGENT_TRAJECTORIES",
    revision: "c7ccee6b414e862caf92735ee25c6c6224219736",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: 3_690_000_000 },
    publisherClaims: {
      trajectories: 278,
      humanTrajectoryVerdicts: true,
      humanPerStepLabels: true,
      sourceBenchmarks: 7,
      environments: ["DESKTOP", "MOBILE", "WEB"],
    },
    evidenceBoundary: boundary({ catalogUse: true }),
    rightsBoundary: sharedRights("MIT", "HF_CARD_DATA"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "QUARANTINE_METADATA_FIRST",
    nextGate: "REPLAY_278_TASK_DIRECTORIES_AND_REVIEW_SEVEN_UPSTREAM_BENCHMARK_RIGHTS",
  }),
  candidate({
    id: "hmunn/rapt-g1-ood",
    officialUrl: "https://huggingface.co/datasets/hmunn/rapt-g1-ood",
    sourceClass: "SIMULATION_HUMANOID_OOD_BENCHMARK",
    revision: "d40fa1f893cc4519d67abff142428ea0f0c4a1eb",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: null },
    publisherClaims: {
      publicDatasetReality: "SIMULATION",
      realRobotRunsClaimedInPaper: 78,
      realRobotRunsPresentInPublicDataset: false,
      officialCodeRevision: "d745668ffdb0e26877b1de4c9b2126af7bda5b03",
    },
    evidenceBoundary: boundary({ catalogUse: true }),
    rightsBoundary: sharedRights("BSD-3-Clause", "HF_CARD_DATA_AND_GITHUB_LICENSE"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "SIMULATION_ONLY_NO_TARGET_TRANSFER",
    nextGate: "PIN_PUBLIC_SIMULATION_SPLITS_AND_KEEP_REAL_RUN_CLAIMS_OUT_OF_INGRESS",
  }),
  candidate({
    id: "kantine/BotFails",
    officialUrl: "https://huggingface.co/datasets/kantine/BotFails",
    sourceClass: "REAL_ROBOT_TELEOPERATION_FAILURE_OBSERVATIONS",
    revision: "3478e49d91e1737eb76dfee2d81bb22617039c13",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: 9_170_000_000 },
    publisherClaims: {
      annotatedAnomalousEpisodes: 144,
      platformCount: 1,
      controlledLabCollection: true,
      selectedSourceReplayedEpisodesInOutsider: 20,
    },
    evidenceBoundary: boundary({ catalogUse: true }),
    rightsBoundary: sharedRights("Apache-2.0", "HF_CARD_DATA_AND_PINNED_README"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: false,
      existingAdapter: "src/outsider-public-robotics-adapter.js",
      selectedScopeDenominatorFrozen: true,
    },
    disposition: "ALREADY_SOURCE_REPLAYED_DESCRIPTIVE_ONLY",
    nextGate: "DO_NOT_DUPLICATE_ADAPTER_KEEP_EXISTING_ZERO_TRAINING_BOUNDARY",
  }),
  candidate({
    id: "microsoft/Orchard",
    officialUrl: "https://huggingface.co/datasets/microsoft/Orchard",
    sourceClass: "SANDBOXED_SOFTWARE_ENGINEERING_AND_GUI_AGENT_TRAJECTORIES",
    revision: "70c05ec1f20f823ae6adc60374922e9271bb74e2",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: 10_970_000_000 },
    publisherClaims: {
      softwareEngineeringTrajectories: 107_185,
      resolvedByHiddenTests: 74_649,
      unresolvedByHiddenTests: 32_536,
      uniqueRepositories: 2_788,
      guiDecisionPointRows: 3_070,
      guiUniqueTasks: 409,
      guiLastTurnRows: 408,
      guiTaskLastTurnDenominatorMismatchRequiresReplay: true,
      guiSuccessfulOnly: true,
      guiJudgeVerifiedNotIndependentOutcome: true,
      anonymizationClaimLimitedToSoftwareEngineeringTrajectoryText: true,
    },
    evidenceBoundary: boundary({ catalogUse: true }),
    rightsBoundary: sharedRights("MIT", "HF_CARD_DATA"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "QUARANTINE_METADATA_FIRST",
    nextGate: "REPLAY_SUBSET_SHARDS_REVIEW_UPSTREAM_REPOSITORY_RIGHTS_AND_FREEZE_REPO_CORRELATION_ROOTS",
  }),
  candidate({
    id: "ServiceNow/AgentHorizon",
    officialUrl: "https://huggingface.co/datasets/ServiceNow/AgentHorizon",
    sourceClass: "LONG_HORIZON_GUI_JUDGE_SUCCESS_FAILURE_BENCHMARK",
    revision: "a16cbf7b4e9f2aa06b0588b0ef917789efe40f7c",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: 43_000_000_000 },
    publisherClaims: {
      hardItems: 605,
      hardPositive: 287,
      hardNegative: 318,
      simpleItems: 768,
      simplePositive: 236,
      simpleNegative: 532,
      totalTrajectoryLabels: 1_373,
      totalPositive: 523,
      totalNegative: 850,
      splitsNonOverlapping: true,
      negativeConstruction: "SIBLING_INSTRUCTION_TRAJECTORY_MISMATCH",
      longHorizonSteps: "OFTEN_100_TO_MORE_THAN_300",
    },
    evidenceBoundary: boundary({ catalogUse: true }),
    rightsBoundary: sharedRights(null, "HF_CARD_LICENSE_NOT_DECLARED"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "METADATA_ONLY_LICENSE_UNDECLARED",
    nextGate: "OBTAIN_DATA_LICENSE_THEN_REPLAY_1373_LABEL_ROWS_AND_TRAJECTORY_MEDIA_DENOMINATOR",
  }),
  candidate({
    id: "sii-rhos-ai/ViFailback-Dataset",
    officialUrl: "https://huggingface.co/datasets/sii-rhos-ai/ViFailback-Dataset",
    sourceClass: "REAL_ROBOT_MANIPULATION_FAILURE_AND_RECOVERY_VQA",
    revision: "888a6c4dd88746a5822a122de5ed858998892932",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: 513_000_000_000 },
    publisherClaims: {
      realRobotTrajectories: 5_202,
      successfulTrajectories: 657,
      failedTrajectories: 4_545,
      questionAnswerPairs: 58_128,
      tasks: 100,
      failureCategories: 4,
      publishedFailureCategoryPercentTotal: "87.37",
      publishedFailureTaxonomyRemainderUnexplainedPercent: "12.63",
      platform: "ALOHA_DUAL_ARM",
      rgbDepthSpatialAlignmentKnownFalseForDabaiCameras: true,
    },
    evidenceBoundary: boundary({ catalogUse: true, taxonomyUse: true }),
    rightsBoundary: sharedRights("MIT", "HF_CARD_DATA"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "QUARANTINE_METADATA_FIRST",
    nextGate: "REPLAY_5202_HDF5_EPISODES_FREEZE_TASK_PLATFORM_CAMERA_AND_FAILURE_LABEL_CORRELATION_ROOTS",
  }),
  candidate({
    id: "ManipArena/maniparena-dataset",
    officialUrl: "https://huggingface.co/datasets/ManipArena/maniparena-dataset",
    sourceClass: "GATED_REAL_AND_SIM_BIMANUAL_MANIPULATION_DEMONSTRATIONS",
    revision: "2bbd124d4554bccbf12a2ec115176cca09612c55",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: true,
      publisherDisplayedApproximateBytes: 253_000_000_000 },
    publisherClaims: {
      realRobotTasks: 20,
      realRobotEpisodes: 10_812,
      simulationTasks: 3,
      refreshedSimulationEpisodes: 1_662,
      synchronizedCameraStreams: 3,
      recordingFrequencyHz: 20,
      researchAndCompetitionUseAgreementRequired: true,
    },
    evidenceBoundary: boundary({ catalogUse: true }),
    rightsBoundary: {
      ...sharedRights("Apache-2.0", "HF_CARD_DATA"),
      gatedUseAgreementReviewed: true,
      declaredUseRestriction: "RESEARCH_AND_COMPETITION_ONLY",
    },
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "METADATA_ONLY_GATED_PAYLOAD",
    nextGate: "DO_NOT_REQUEST_PAYLOAD_UNTIL_NAMED_USE_RIGHTS_PRIVACY_STORAGE_AND_253GB_ACQUISITION_BUDGET_ARE_APPROVED",
  }),
  candidate({
    id: "PrentisAI/AutoResearchEval",
    officialUrl: "https://huggingface.co/datasets/PrentisAI/AutoResearchEval",
    sourceClass: "SANDBOXED_AI_FOR_SCIENCE_AGENT_TRAJECTORIES",
    revision: "412fb4908a3a7b98dd50cfa3e5c6cd40750d2d4f",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: 722_000_000 },
    publisherClaims: {
      openEndedTasks: 70,
      openEndedModels: 8,
      openEndedRollouts: 559,
      openEndedCartesianExpectation: 560,
      openEndedDenominatorMismatchRequiresReplay: true,
      optimizationTasks: 31,
      optimizationModels: 8,
      optimizationRollouts: 247,
      optimizationSuccess: 195,
      optimizationNonSuccess: 52,
      taskCountFromSubsets: 101,
      titleClaimedTasks: 100,
      titleSubsetTaskCountMismatchRequiresReplay: true,
      executionEnvironment: "ISOLATED_CONTAINER_WITH_HOST_SIDE_EVALUATION_SERVICE",
    },
    evidenceBoundary: boundary({ catalogUse: true, taxonomyUse: true }),
    rightsBoundary: sharedRights("CC-BY-4.0", "HF_CARD_DATA"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "QUARANTINE_METADATA_FIRST",
    nextGate: "REPLAY_806_ROLLOUT_INDEX_AND_SOURCE_PAPER_PROVENANCE_KEEP_SANDBOX_RESULTS_OUT_OF_REALITY_OUTCOME_LANE",
  }),
  candidate({
    id: "xlangai/computer-agent-arena",
    officialUrl: "https://huggingface.co/datasets/xlangai/computer-agent-arena",
    sourceClass: "CONTROLLED_GUI_AGENT_TRAJECTORIES_WITH_HUMAN_EVALUATION",
    revision: "897b9f45287c516a44f9e79879b14bc3c1bc5b0a",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: 25_500_000_000 },
    publisherClaims: {
      trajectories: 4_641,
      averageStepsPerTrajectory: "APPROXIMATELY_8_TO_15",
      screenshots: "APPROXIMATELY_65000",
      taskOutcomeField: "human_eval_correctness",
      environment: "CONTROLLED_UBUNTU_DESKTOP",
      participantConsentClaimed: true,
      identifyingInformationFilteredClaimed: true,
      privacyClaimsIndependentlyReplayed: false,
      humanEvaluationSubjectivityAcknowledged: true,
    },
    evidenceBoundary: boundary({ catalogUse: true }),
    rightsBoundary: sharedRights("CC-BY-4.0", "HF_CARD_DATA"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "QUARANTINE_METADATA_FIRST",
    nextGate: "REPLAY_4641_TRAJECTORY_INDEX_REVIEW_SCREENSHOT_PRIVACY_AND_EXCLUDE_RAW_THOUGHT_TEXT_FROM_TRAINING",
  }),
  candidate({
    id: "xlang-ai/OSWorld-V2",
    officialUrl: "https://github.com/xlang-ai/OSWorld-V2",
    sourceClass: "LONG_HORIZON_GUI_WORKFLOWS_WITH_CHECKPOINT_AND_SIDE_EFFECT_EVALUATION",
    revision: "2b9b7b4eb73243d557bdbf2998fe18d8e18e19c6",
    revisionKind: "GITHUB_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: true,
      publisherDisplayedApproximateBytes: null },
    publisherClaims: {
      releaseTag: "v2026.06.24",
      longHorizonWorkflows: 108,
      safetyAnalysisTrajectories: 216,
      averageCheckpointsPerWorkflow: "27.25",
      sideEffectCheckClasses: 8,
      strongestReportedBinaryCompletionRatePercent: "20.6",
      repairAndRecoveryActionBudgetPercentLessThan: 7,
      taskAssetsRequireGatedTerms: true,
    },
    evidenceBoundary: boundary({ catalogUse: true, taskDefinitionUse: true }),
    rightsBoundary: sharedRights(
      "Apache-2.0_CODE_ONLY_DATA_ASSETS_GATED_TERMS_UNREVIEWED",
      "GITHUB_LICENSE_AND_GATED_DATA_NOTICE"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "PUBLIC_STRUCTURE_ONLY_GATED_TASK_PAYLOAD_NOT_REQUESTED",
    nextGate: "PIN_PUBLIC_RELEASE_MANIFEST_CHECKPOINT_AND_SIDE_EFFECT_SCHEMAS_WITHOUT_REQUESTING_GATED_ASSETS",
  }),
  candidate({
    id: "ProcessBench-2026/RoboProcessBench",
    officialUrl: "https://huggingface.co/datasets/ProcessBench-2026/RoboProcessBench",
    sourceClass: "ROBOT_MANIPULATION_PROCESS_QA_WITH_MIXED_UPSTREAM_RIGHTS",
    revision: "1121d7d530635b306bd3475641b9da30bbf72330",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: null },
    publisherClaims: {
      totalQuestionAnswerRows: 57_892,
      supervisedRows: 48_841,
      evaluationRows: 9_051,
      taskFamilies: 12,
      manipulationTasks: 260,
      outcomePredictionRows: 793,
      outcomePredictionBinaryCounts: [398, 395],
      outcomeLabelOrientationDeclaredInLightweightMetadata: false,
      evalManifestPathMismatchObserved: true,
    },
    evidenceBoundary: boundary({ catalogUse: true, taxonomyUse: true }),
    rightsBoundary: sharedRights(
      "OTHER_MIXED_UPSTREAM_MIT_CC_BY_CC_BY_SA_AND_CC_BY_NC",
      "HF_CARD_AND_ASSET_LICENSE_MANIFEST"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "METADATA_AND_SCHEMA_ONLY_MIXED_RIGHTS",
    nextGate: "REPLAY_MANIFEST_PATHS_ASSET_LICENSE_MATRIX_AND_T7_LABEL_ORIENTATION_BEFORE_PAYLOAD_USE",
  }),
  candidate({
    id: "nvidia/PhysicalAI-Robotics-Open-H-Embodiment",
    officialUrl: "https://huggingface.co/datasets/nvidia/PhysicalAI-Robotics-Open-H-Embodiment",
    sourceClass: "LARGE_EMBODIED_ROBOTICS_COLLECTION_WITH_FAILURE_AND_RECOVERY_SLICES",
    revision: "ed5537127318c86e9a9af34f1bfef6748a4ade4e",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: 4_540_000_000_000 },
    publisherClaims: {
      ucsdRetractionFailureEpisodes: 299,
      ucsdRetractionFailureOnly: true,
      ucsdRetractionHours: "0.62",
      obudaRecoverySliceEpisodes: 714,
      obudaNeedleThreadingEpisodes: 196,
      obudaPegTransferEpisodes: 216,
      obudaRollercoasterEpisodes: 95,
      obudaSeaspikeEpisodes: 207,
      obudaPerEpisodeOutcomeFieldPresent: false,
      tabletopPhantomNotClinicalOrExVivo: true,
    },
    evidenceBoundary: boundary({ catalogUse: true, taxonomyUse: true }),
    rightsBoundary: sharedRights("CC-BY-4.0", "HF_CARD_AND_SUBSET_METADATA"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "AGGREGATE_METADATA_ONLY_DO_NOT_DOWNLOAD_MULTI_TERABYTE_PAYLOAD",
    nextGate: "PIN_FAILURE_ONLY_SLICE_AS_FUTURE_HOLDOUT_AND_REQUIRE_EPISODE_OUTCOME_LABELS_FOR_RECOVERY_SLICES",
  }),
  candidate({
    id: "ethz-spylab/agentdojo",
    officialUrl: "https://github.com/ethz-spylab/agentdojo",
    sourceClass: "TOOL_AGENT_TASKS_WITH_UNTRUSTED_DATA_AND_SECURITY_CASES",
    revision: "089ed468cf3ed0322acc66b0211f26d9d90dbf60",
    revisionKind: "GITHUB_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: null },
    publisherClaims: {
      paperFrozenTasks: 97,
      paperFrozenSecurityCases: 629,
      paperFrozenTools: 70,
      stableReleaseTag: "v0.1.35",
      stableReleaseCommitFullyPinnedByThisReview: false,
      headDenominatorMayDifferFromPaper: true,
      guardBlockedCallMustNotCountAsExecutedEffect: true,
    },
    evidenceBoundary: boundary({ catalogUse: true, taxonomyUse: true }),
    rightsBoundary: sharedRights("MIT", "GITHUB_LICENSE"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "STRUCTURE_AND_FIXTURE_METADATA_ONLY_DO_NOT_EXECUTE_INJECTION_CONTENT",
    nextGate: "PIN_RELEASE_SPECIFIC_DENOMINATOR_AND_ADD_PROPOSED_BLOCKED_COMMITTED_ACHIEVED_EFFECT_REGRESSION",
  }),
  candidate({
    id: "aradhye/agent-safety-bench",
    officialUrl: "https://huggingface.co/datasets/aradhye/agent-safety-bench",
    sourceClass: "SYNTHETIC_TOOL_TASK_SAFETY_AND_FULFILLABILITY_LABELS",
    revision: "b7761ca4c4e7a5937f0b6ad11dd24ce19163c454",
    revisionKind: "HUGGING_FACE_COMMIT",
    revisionObservedAt: REVIEWED_AT,
    access: { metadataPublic: true, payloadGated: false,
      publisherDisplayedApproximateBytes: null },
    publisherClaims: {
      defaultRows: 3_464,
      unsafeRows: 1_948,
      safeRows: 1_516,
      unfulfillableRows: 2_232,
      fulfillableRows: 1_232,
      augmentedRows: 756,
      totalRows: 4_220,
      labelsAreTaskLabelsNotExecutionOutcomes: true,
      officialHeldOutSplitPresent: false,
      augmentedExecutablePythonFieldsPresent: true,
    },
    evidenceBoundary: boundary({ catalogUse: true, taxonomyUse: true }),
    rightsBoundary: sharedRights("Apache-2.0", "HF_CARD_DATA"),
    sourceReplay: {
      moduleReplaysBytes: false,
      reviewedProjectionOnly: true,
      existingAdapter: null,
      selectedScopeDenominatorFrozen: false,
    },
    disposition: "AGGREGATES_AND_TAXONOMY_ONLY_NEVER_EXECUTE_PYTHON_CODES",
    nextGate: "PII_SCRUB_FREEZE_ISOLATED_HOLDOUT_AND_KEEP_TASK_LABELS_OUT_OF_AUTHORITY_OR_OUTCOME_LANES",
  }),
].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

function body() {
  return {
    schema: DELEGATION_DATA_SCOUT_SCHEMA,
    schemaVersion: "1.0.0",
    catalogId: "delegation-radius-public-data-scout-20260827",
    reviewedAt: REVIEWED_AT,
    evidenceMode: "MAINTAINER_REVIEWED_PUBLIC_METADATA_NOT_SOURCE_BYTE_REPLAYED_BY_THIS_MODULE",
    northStarBoundary: {
      dataMayExpandEvidenceRadius: true,
      dataMayExpandUnprovenAuthorityRadius: false,
      trainingMayExpandActionAuthority: false,
      publicAccessImpliesTrainingRights: false,
      publisherSuccessImpliesIndependentOutcome: false,
    },
    candidates: structuredClone(CANDIDATES),
    accounting: {
      candidates: CANDIDATES.length,
      alreadySourceReplayed: CANDIDATES.filter((entry) =>
        entry.sourceReplay.existingAdapter !== null).length,
      metadataFirst: CANDIDATES.filter((entry) =>
        entry.disposition === "QUARANTINE_METADATA_FIRST").length,
      automaticTrainingRows: 0,
      actionAuthorityGrants: 0,
      causalExperienceUnits: 0,
    },
    authority: {
      catalogIntegrityOnly: true,
      sourceTruthIndependentlyEstablished: false,
      trainingAuthorized: false,
      targetTransferEstablished: false,
      actionReady: false,
    },
  };
}

export function buildDelegationDataScoutCatalog() {
  const value = body();
  return deepFreeze({ ...value,
    catalogHash: digest(DELEGATION_DATA_SCOUT_SCHEMA, value) });
}

export function verifyDelegationDataScoutCatalog(record) {
  try {
    const expected = buildDelegationDataScoutCatalog();
    if (!record || typeof record !== "object" || Array.isArray(record)
      || !HASH.test(record.catalogHash ?? "")
      || canonicalizeStrict(record) !== canonicalizeStrict(expected)) {
      return { ok: false, error: "DELEGATION_DATA_SCOUT_CATALOG_INVALID" };
    }
    return { ok: true, catalogHash: expected.catalogHash,
      authority: structuredClone(expected.authority) };
  } catch (error) {
    return { ok: false, error: error?.message ?? "DELEGATION_DATA_SCOUT_CATALOG_INVALID" };
  }
}

export function listDelegationDataScoutCandidates() {
  return CANDIDATES.map((entry) => entry.id);
}

export function delegationDataScoutDisposition(id) {
  const record = CANDIDATES.find((entry) => entry.id === id);
  if (!record) throw new Error("DELEGATION_DATA_SCOUT_SOURCE_UNKNOWN");
  if (!COMMIT.test(record.revision)) {
    throw new Error("DELEGATION_DATA_SCOUT_REVISION_INVALID");
  }
  return deepFreeze(structuredClone(record));
}
