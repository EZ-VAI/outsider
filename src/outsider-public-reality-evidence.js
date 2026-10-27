/* Closed, source-bound reality evidence for reviewed public robotics data. */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalizeStrict } from "./canonical.js";
import {
  REALITY_EVIDENCE_CLAIM_TYPES,
  REALITY_EVIDENCE_DEFINITION_HASH,
  REALITY_EVIDENCE_IMPLEMENTATION_SOURCE_HASHES,
  createRealityEvidenceAssessment,
  createRealityEvidenceProfile,
  verifyRealityEvidenceAssessment,
} from "./outsider-reality-evidence.js";
import {
  BRIDGEDATA_V2_DATASET,
  BRIDGEDATA_V2_OFFICIAL_PIN,
  REAL_ROBOT_SOURCE_BYTE_LIMITS,
  createRealRobotObservationProjection,
  verifyRealRobotObservationProjection,
} from "./outsider-real-robot-ingress.js";
import {
  LIBERO_DATASET,
  LIBERO_MAX_DEEP_BUNDLE_BYTES,
  LIBERO_MAX_DEEP_TREE_BYTES,
  LIBERO_MAX_SOURCE_BYTES,
  LIBERO_OFFICIAL_DEEP_PIN,
  LIBERO_OFFICIAL_PIN,
  createLiberoDeepManifestProjection,
  verifyLiberoDeepManifestProjection,
} from "./outsider-libero-ingress.js";

export const PUBLIC_REALITY_SCHEMAS = Object.freeze({
  registry: "outsider/public-reality-evidence-registry/v1",
  source: "outsider/public-reality-evidence-source/v1",
  receipt: "outsider/public-reality-evidence-receipt/v1",
});

export const PUBLIC_REALITY_SOURCE_BYTE_LIMITS = Object.freeze({
  bridgeProjectPage: REAL_ROBOT_SOURCE_BYTE_LIMITS.projectPage,
  bridgeTrajectoryIndex: REAL_ROBOT_SOURCE_BYTE_LIMITS.trajectoryIndex,
  bridgeDatasetInfo: REAL_ROBOT_SOURCE_BYTE_LIMITS.datasetInfo,
  bridgeFeatures: REAL_ROBOT_SOURCE_BYTE_LIMITS.features,
  bridgeActionProprioStats: REAL_ROBOT_SOURCE_BYTE_LIMITS.actionProprioStats,
  bridgeCodeReadme: REAL_ROBOT_SOURCE_BYTE_LIMITS.codeReadme,
  bridgeCodeLicense: REAL_ROBOT_SOURCE_BYTE_LIMITS.codeLicense,
  bridgeSampleInitial: REAL_ROBOT_SOURCE_BYTE_LIMITS.sampleInitial,
  bridgeSampleFinal: REAL_ROBOT_SOURCE_BYTE_LIMITS.sampleFinal,
  liberoTaskMap: LIBERO_MAX_SOURCE_BYTES,
  liberoBenchmark: LIBERO_MAX_SOURCE_BYTES,
  liberoReadme: LIBERO_MAX_SOURCE_BYTES,
  liberoLicense: LIBERO_MAX_SOURCE_BYTES,
  liberoSourceTree: LIBERO_MAX_DEEP_TREE_BYTES,
  liberoSourceByteBundle: LIBERO_MAX_DEEP_BUNDLE_BYTES,
});

const BRIDGE_INPUTS = Object.freeze({
  projectPageBytes: "bridgeProjectPage",
  trajectoryIndexBytes: "bridgeTrajectoryIndex",
  datasetInfoBytes: "bridgeDatasetInfo",
  featuresBytes: "bridgeFeatures",
  actionProprioStatsBytes: "bridgeActionProprioStats",
  codeReadmeBytes: "bridgeCodeReadme",
  codeLicenseBytes: "bridgeCodeLicense",
  sampleInitialBytes: "bridgeSampleInitial",
  sampleFinalBytes: "bridgeSampleFinal",
});
const LIBERO_INPUTS = Object.freeze({
  taskMapBytes: "liberoTaskMap",
  benchmarkBytes: "liberoBenchmark",
  readmeBytes: "liberoReadme",
  licenseBytes: "liberoLicense",
  sourceTreeBytes: "liberoSourceTree",
  sourceByteBundleBytes: "liberoSourceByteBundle",
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CLAIMS = [...REALITY_EVIDENCE_CLAIM_TYPES];
const HIGH_BY_SOURCE = Object.freeze({
  "bridgedata-v2": Object.freeze(["SOURCE_FACT", "TAXONOMY", "WORLD_PHENOMENON"]),
  "libero-deep": Object.freeze([
    "SOURCE_DEFINED_TASK_UNIVERSE", "SOURCE_FACT", "TAXONOMY",
  ]),
});

function fail(code) { throw new TypeError(`PUBLIC_REALITY_${code}`); }
function plain(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}
function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}
function bytesHash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
export function hashPublicRealityEvidenceValue(domain, value) {
  if (typeof domain !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(domain)) {
    fail("HASH_DOMAIN_INVALID");
  }
  return `sha256:${createHash("sha256")
    .update(`outsider:public-reality-evidence:${domain}:v1\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function clonedGroup(value, shape, label) {
  if (!exactKeys(value, Object.keys(shape))) fail(`${label}_INPUT_SHAPE_INVALID`);
  const output = {};
  for (const [key, limitKey] of Object.entries(shape)) {
    const candidate = value[key];
    if (typeof SharedArrayBuffer !== "undefined" && candidate != null
      && candidate.buffer instanceof SharedArrayBuffer) {
      fail("SHARED_ARRAY_BUFFER_REJECTED");
    }
    if (!Buffer.isBuffer(candidate)) fail(`${label}_${key.toUpperCase()}_BUFFER_REQUIRED`);
    const limit = PUBLIC_REALITY_SOURCE_BYTE_LIMITS[limitKey];
    if (candidate.length === 0 || candidate.length > limit) {
      fail(`${label}_${key.toUpperCase()}_SIZE_INVALID`);
    }
    output[key] = Buffer.from(candidate);
  }
  return output;
}
function cloneInput(input) {
  if (!exactKeys(input, ["bridgeData", "libero"])) fail("INPUT_SHAPE_INVALID");
  return {
    bridgeData: clonedGroup(input.bridgeData, BRIDGE_INPUTS, "BRIDGEDATA"),
    libero: clonedGroup(input.libero, LIBERO_INPUTS, "LIBERO"),
  };
}

function noAuthorityBoundary() {
  return {
    lane: "STAGE_0_5_RESEARCH_ONLY",
    artifactClass: "OFFLINE_EXACT_SOURCE_REPLAY_RECEIPTS",
    authority: "none",
    scalarScore: null,
    crossSourceWeightAggregation: false,
    crossClaimWeightTransfer: false,
    sourceBytesRequiredForVerification: true,
    sourceBytesEmbeddedInRegistry: false,
    selfHashIsSignature: false,
    verifierSignaturePresent: false,
    independentExternalAnchorPresent: false,
    publisherIdentityCryptographicallyVerified: false,
    ownOutsiderOutcomeEstablished: false,
    outsiderCausalEffectEstablished: false,
    targetPriceEstablished: false,
    permits: { EXECUTE: false, PRICE: false, GUARANTEE: false, SETTLE: false,
      CLOSE: false },
  };
}

const sourceHash = (name) => bytesHash(readFileSync(new URL(name, import.meta.url)));
const IMPLEMENTATION_SOURCE_HASHES = deepFreeze({
  publicRealityModule: sourceHash("./outsider-public-reality-evidence.js"),
  realityCoreModule: REALITY_EVIDENCE_IMPLEMENTATION_SOURCE_HASHES.realityEvidenceModule,
  canonicalizerModule: REALITY_EVIDENCE_IMPLEMENTATION_SOURCE_HASHES.canonicalizerModule,
  bridgeIngressModule: sourceHash("./outsider-real-robot-ingress.js"),
  liberoIngressModule: sourceHash("./outsider-libero-ingress.js"),
});
const ADAPTERS = deepFreeze({
  "bridgedata-v2": {
    adapterId: "outsider/public-reality/bridgedata-v2/v1",
    sourceId: "bridgedata-v2",
    sourcePinHash: BRIDGEDATA_V2_OFFICIAL_PIN.pinHash,
    sourceClass: "REAL_PHYSICAL",
    maximumRoles: ["SCHEMA_REFERENCE", "TAXONOMY_EVIDENCE",
      "WORLD_PHENOMENON_EVIDENCE"],
    highWeightClaimAllowlist: [...HIGH_BY_SOURCE["bridgedata-v2"]].sort(),
    realityCeiling:
      "PUBLISHER_SCOPED_HISTORICAL_PHYSICAL_OBSERVATION_NOT_TRAJECTORY_OUTCOME",
    derivationVersion: "1.0.0",
  },
  "libero-deep": {
    adapterId: "outsider/public-reality/libero-deep/v1",
    sourceId: "libero-deep",
    sourcePinHash: LIBERO_OFFICIAL_DEEP_PIN.pinHash,
    sourceClass: "CONTROLLED_SIMULATION",
    maximumRoles: ["SCHEMA_REFERENCE", "TAXONOMY_EVIDENCE",
      "TASK_UNIVERSE_REFERENCE"],
    highWeightClaimAllowlist: [...HIGH_BY_SOURCE["libero-deep"]].sort(),
    realityCeiling:
      "EXACT_OFFICIAL_TASK_AND_ARTIFACT_INVENTORY_NOT_DECODED_STATE_OR_EXECUTION",
    derivationVersion: "1.0.0",
  },
});
const DEFINITION_BODY = deepFreeze({
  schema: "outsider/public-reality-evidence-definition/v1",
  schemaVersion: "1.0.0",
  coreDefinitionHash: REALITY_EVIDENCE_DEFINITION_HASH,
  implementationSourceHashes: IMPLEMENTATION_SOURCE_HASHES,
  adapters: ADAPTERS,
  claimTypes: CLAIMS,
  receiptPolicy: {
    sourceReplayRequiredThisInvocation: true,
    exactClaimBodyDerivationRequired: true,
    genericCallerProfilesCanPromote: false,
    highWeightReceiptCount: 6,
    deniedOrNotEstablishedReceiptCount: 12,
    selfHashIsSignature: false,
  },
});
export const PUBLIC_REALITY_DEFINITION_HASH =
  hashPublicRealityEvidenceValue("definition", DEFINITION_BODY);
function definition() {
  return { ...DEFINITION_BODY, definitionHash: PUBLIC_REALITY_DEFINITION_HASH };
}

function bridgeUpstream(input) {
  const projection = createRealRobotObservationProjection({
    ...input,
    source: {
      datasetId: BRIDGEDATA_V2_DATASET,
      repositoryRevision: BRIDGEDATA_V2_OFFICIAL_PIN.repositoryRevision,
      datasetVersion: BRIDGEDATA_V2_OFFICIAL_PIN.datasetVersion,
    },
  });
  const verified = verifyRealRobotObservationProjection(projection, input);
  if (!verified.ok
    || projection.source.pinHash !== BRIDGEDATA_V2_OFFICIAL_PIN.pinHash
    || projection.authority.officialBytesMatchedTrustedPinAndReplayed !== true
    || projection.evidentiaryWeight.realRobotSensorBytesReplayed !== true) {
    throw new Error(`PUBLIC_REALITY_SOURCE_REPLAY_INVALID:${verified.error ?? "BRIDGE"}`);
  }
  return { projection, verified };
}

function liberoUpstream(input) {
  const projection = createLiberoDeepManifestProjection({
    ...input,
    source: { datasetId: LIBERO_DATASET, revision: LIBERO_OFFICIAL_PIN.revision },
  });
  const verified = verifyLiberoDeepManifestProjection(projection, input);
  if (!verified.ok
    || projection.source.pinHash !== LIBERO_OFFICIAL_PIN.pinHash
    || projection.commitments.deepPinHash !== LIBERO_OFFICIAL_DEEP_PIN.pinHash
    || projection.authority.exactOfficialRecursiveTreeBytesReplayed !== true
    || projection.authority.exactSelectedGitBlobBytesReplayed !== true) {
    throw new Error(`PUBLIC_REALITY_SOURCE_REPLAY_INVALID:${verified.error ?? "LIBERO"}`);
  }
  return { projection, verified };
}

function bridgeProjection(projection) {
  return {
    schema: projection.schema,
    source: projection.source,
    evidentiaryWeight: projection.evidentiaryWeight,
    license: projection.license,
    coverage: projection.coverage,
    observation: projection.observation,
    outcome: projection.outcome,
    quality: projection.quality,
    privacy: projection.privacy,
    authority: projection.authority,
    upstreamProjectionHash: projection.projectionHash,
  };
}

function liberoProjection(projection) {
  return {
    schema: projection.schema,
    source: projection.source,
    baseManifest: projection.baseManifest,
    evidenceRoleWeighting: projection.evidenceRoleWeighting,
    authority: projection.authority,
    license: projection.license,
    privacy: projection.privacy,
    denominator: projection.denominator,
    commitments: projection.commitments,
    executionEvidence: projection.executionEvidence,
    observability: projection.observability,
    upstreamProjectionHash: projection.projectionHash,
  };
}

function sourceVerification(adapter, artifactHashes, projectionHash) {
  const adapterDefinitionHash = hashPublicRealityEvidenceValue(
    "adapter-definition", adapter);
  const claimDerivationSetHash = hashPublicRealityEvidenceValue(
    "claim-derivation-set", {
      adapterId: adapter.adapterId,
      claimTypes: CLAIMS,
      highWeightClaimAllowlist: adapter.highWeightClaimAllowlist,
      derivationVersion: adapter.derivationVersion,
      publicRealityModuleHash: IMPLEMENTATION_SOURCE_HASHES.publicRealityModule,
    });
  const verifierDefinitionHash = adapter.sourceId === "bridgedata-v2"
    ? IMPLEMENTATION_SOURCE_HASHES.bridgeIngressModule
    : IMPLEMENTATION_SOURCE_HASHES.liberoIngressModule;
  const body = {
    schema: "outsider/public-reality-source-verification/v1",
    adapterId: adapter.adapterId,
    adapterDefinitionHash,
    verifierDefinitionHash,
    canonicalizerDefinitionHash: IMPLEMENTATION_SOURCE_HASHES.canonicalizerModule,
    coreDefinitionHash: REALITY_EVIDENCE_DEFINITION_HASH,
    sourcePinHash: adapter.sourcePinHash,
    sourceArtifactHashes: [...new Set(artifactHashes)].sort(),
    projectionHash,
    claimDerivationSetHash,
    sourceBytesReplayedThisInvocation: true,
    selfHashIsSignature: false,
  };
  return { ...body, sourceVerificationHash:
    hashPublicRealityEvidenceValue("source-verification", body) };
}

function blankBindings({ artifactHashes, sourceVerificationHash, sourceDomainHash,
  observerIdentityHash, outcomeEvidenceHash, denominatorDefinitionHash }) {
  return {
    sourceArtifactHashes: [...new Set(artifactHashes)].sort(),
    sourceVerificationHash,
    sourceDomainHash,
    targetDomainHash: null,
    cohortManifestHash: null,
    outcomeEvidenceHash,
    observerIdentityHash,
    denominatorDefinitionHash,
    transferValidationHash: null,
    causalDesignHash: null,
    judgeDefinitionHash: null,
    pricingDefinitionHash: null,
    authorityGrantHash: null,
  };
}

function bridgeClaimBody(claimType, projection) {
  const base = { sourceId: "bridgedata-v2", claimType,
    upstreamProjectionHash: projection.projectionHash };
  if (claimType === "SOURCE_FACT") return {
    ...base, claimKind: "PINNED_SOURCE_FACT",
    datasetId: projection.source.datasetId,
    repositoryRevision: projection.source.repositoryRevision,
    dataLicenseSpdx: projection.license.dataSpdx,
    exactSourceArtifactsReplayed: 9,
    physicalObservationScope:
      "TWO_CAMERA_FRAMES_PLUS_PINNED_METADATA_INDEX_AND_AGGREGATES",
  };
  if (claimType === "WORLD_PHENOMENON") return {
    ...base, claimKind: "PUBLISHER_SCOPED_HISTORICAL_PHYSICAL_OBSERVATION",
    robotPlatform: projection.observation.robotPlatform,
    selectedTrajectoryRecords: 1,
    replayedCameraFrames: projection.coverage.replayedObservationSubset.cameraFrames,
    framePairHash: projection.observation.sample.framePairHash,
    framesAreByteDistinct: projection.observation.sample.framesAreByteDistinct,
    completeActionTrajectories: 0,
    completeProprioTrajectories: 0,
    selectedTaskOutcome: null,
    outsiderOutcomeDenominator: 0,
    causalAttributionEstablished: false,
  };
  if (claimType === "TAXONOMY") return {
    ...base, claimKind: "PINNED_PUBLISHER_SOURCE_TAXONOMY",
    reportedRobotPlatform: projection.observation.robotPlatform,
    reportedEnvironmentCategories: 4,
    reportedEnvironments: projection.coverage.publisherPage.claimedEnvironments,
    reportedSkills: projection.coverage.publisherPage.claimedSkills,
    empiricalFrequencyOrTargetDistributionEstablished: false,
  };
  if (claimType === "SOURCE_DOMAIN_RATE") return {
    ...base, claimKind: "SOURCE_RATE_NOT_ESTABLISHED",
    publisherClaimedTrajectories: 60_096,
    tfdsMetadataExamples: 60_064,
    browserIndexRows: 43_592,
    globallyCompleteDenominator: false,
    numerator: null, denominator: null, rate: null,
  };
  if (claimType === "SOURCE_DEFINED_TASK_UNIVERSE") return {
    ...base, claimKind: "TASK_UNIVERSE_NOT_ESTABLISHED",
    publisherClaimedTrajectories: 60_096,
    manifestDefinedTaskUniverse: null,
    executionDenominator: 0,
  };
  return {
    ...base, claimKind: "CLAIM_NOT_ESTABLISHED",
    ownOutsiderOutcomeDenominator: 0,
    causalEffect: null,
    targetPrice: null,
    externalGrantDocument: null,
    authority: "none",
  };
}

function liberoClaimBody(claimType, projection) {
  const base = { sourceId: "libero-deep", claimType,
    upstreamProjectionHash: projection.projectionHash };
  if (claimType === "SOURCE_FACT") return {
    ...base, claimKind: "PINNED_SOURCE_ARTIFACT_INVENTORY",
    datasetId: projection.source.datasetId,
    repositoryRevision: projection.source.revision,
    selectedSourceFiles: 380,
    selectedSourceBytes: 12_913_625,
    omittedSelectedSourceFiles: 0,
    bddlSemanticAstParsed: false,
    initStatePayloadDeserialized: false,
  };
  if (claimType === "TAXONOMY") return {
    ...base, claimKind: "PINNED_SOURCE_DEFINED_SUITE_TAXONOMY",
    suiteTaskDefinitionCounts: Object.fromEntries(
      projection.denominator.suiteDenominators.map((entry) =>
        [entry.suite, entry.taskDefinitions])),
    empiricalFrequencyOrTargetDistributionEstablished: false,
    physicalWorldSemanticsEstablished: false,
  };
  if (claimType === "SOURCE_DEFINED_TASK_UNIVERSE") return {
    ...base, claimKind: "SOURCE_DEFINED_TASK_AND_ARTIFACT_UNIVERSE",
    sourceDefinedTaskArtifactRecords: 130,
    selectedSourceFiles: 380,
    fileBreakdown: { bddl: 130, prunedInit: 130, fullInit: 120 },
    selectedSourceBytes: 12_913_625,
    attempted: 0, completed: 0, outcomesObserved: 0,
    notRun: 130, noOutcome: 130,
    successRate: null, failureRate: null,
    bddlSemanticAstParsed: false,
    initStatePayloadDeserialized: false,
  };
  if (claimType === "SOURCE_DOMAIN_RATE") return {
    ...base, claimKind: "SOURCE_RATE_NOT_ESTABLISHED",
    taskArtifactRecords: 130,
    executionRecords: 0,
    numerator: null, denominator: null, rate: null,
  };
  return {
    ...base, claimKind: "CLAIM_NOT_ESTABLISHED",
    environmentClass: "CONTROLLED_SIMULATION",
    benchmarkRun: false,
    ownOutsiderOutcomeDenominator: 0,
    causalEffect: null,
    targetPrice: null,
    externalGrantDocument: null,
    authority: "none",
  };
}

function makeReceipt({ adapter, profile, claimType, claimBody,
  sourceVerificationHash, verifiedCoordinateWeights }) {
  const claimBodyHash = hashPublicRealityEvidenceValue("claim-body", claimBody);
  const genericAssessment = createRealityEvidenceAssessment({ profile, claimType,
    claimBodyHash });
  const genericVerification = verifyRealityEvidenceAssessment(genericAssessment,
    { profile, claimBodyHash });
  if (!genericVerification.ok) fail("GENERIC_ASSESSMENT_REPLAY_INVALID");
  const highWeightAuthorized = adapter.highWeightClaimAllowlist.includes(claimType);
  if (highWeightAuthorized
    && genericAssessment.decision.status !== "ELIGIBLE_PENDING_SOURCE_REPLAY") {
    fail("HIGH_WEIGHT_GENERIC_GATE_NOT_ELIGIBLE");
  }
  const derivationBody = {
    id: `${adapter.adapterId}/claim/${claimType.toLowerCase()}`,
    version: adapter.derivationVersion,
    adapterDefinitionHash: hashPublicRealityEvidenceValue("adapter-definition", adapter),
    publicRealityModuleHash: IMPLEMENTATION_SOURCE_HASHES.publicRealityModule,
    coreDefinitionHash: REALITY_EVIDENCE_DEFINITION_HASH,
  };
  const body = {
    schema: PUBLIC_REALITY_SCHEMAS.receipt,
    adapterId: adapter.adapterId,
    sourceId: adapter.sourceId,
    claimType,
    claimBody,
    claimBodyHash,
    derivation: { ...derivationBody, definitionHash:
      hashPublicRealityEvidenceValue("claim-derivation", derivationBody) },
    genericAssessment,
    genericVerification,
    sourceBinding: {
      sourceVerificationHash,
      sourceBytesReplayedThisInvocation: true,
      claimBodyDerivedFromReplayedProjection: true,
      builtInAdapter: true,
    },
    verifiedCoordinateWeights,
    status: highWeightAuthorized ? "HIGH_WEIGHT_SUPPORT" : "NOT_ESTABLISHED",
    claimWeight: highWeightAuthorized ? "HIGH" : "NONE",
    highWeightAuthorized,
    crossClaimPromotionAllowed: false,
    authority: "none",
  };
  return { ...body, receiptHash:
    hashPublicRealityEvidenceValue("claim-receipt", body) };
}

function bridgeSource(upstream) {
  const projection = upstream.projection;
  const adapter = ADAPTERS["bridgedata-v2"];
  const artifactHashes = Object.values(projection.source.files)
    .map((entry) => entry.sha256);
  const verification = sourceVerification(adapter, artifactHashes,
    projection.projectionHash);
  const denominatorDefinitionHash = hashPublicRealityEvidenceValue(
    "bridge-denominator-definition", projection.coverage.denominatorReconciliation);
  const sourceDomainHash = hashPublicRealityEvidenceValue("source-domain", {
    sourceId: adapter.sourceId, datasetId: projection.source.datasetId,
    robotPlatform: projection.observation.robotPlatform,
  });
  const observerIdentityHash = hashPublicRealityEvidenceValue("publisher-identity", {
    sourceId: adapter.sourceId,
    publisherScope: "RAIL_BERKELEY_PROJECT_PAGE_AND_PINNED_REPOSITORY",
    cryptographicallyVerified: false,
  });
  const outcomeEvidenceHash = hashPublicRealityEvidenceValue(
    "physical-observation-evidence", {
      framePairHash: projection.observation.sample.framePairHash,
      trajectoryIndexManifestRootHash: projection.observation.trajectoryIndexManifestRootHash,
      aggregateStatisticsHash: projection.observation.aggregateStatistics.artifactHash,
      taskOutcomeEstablished: false,
    });
  const profile = createRealityEvidenceProfile({
    sourceRefHash: projection.projectionHash,
    roles: [...adapter.maximumRoles].sort(),
    coordinates: {
      environmentReality: "REAL_PHYSICAL",
      empiricalStatus: "EMPIRICAL_RECORDED",
      sourceIntegrity: "PINNED_REPLAY_VERIFIED",
      observationExternality: "PUBLISHER_REPORTED_EXTERNAL_TO_OUTSIDER",
      temporalBinding: "POST_OUTCOME",
      targetAlignment: "SOURCE_DOMAIN_ONLY",
      denominatorClosure: "PARTIAL",
      causalIdentification: "OBSERVATIONAL_ONLY",
      priceGrounding: "NONE",
      authorityBasis: "NONE",
    },
    bindings: blankBindings({ artifactHashes,
      sourceVerificationHash: verification.sourceVerificationHash,
      sourceDomainHash, observerIdentityHash, outcomeEvidenceHash,
      denominatorDefinitionHash }),
  });
  const verifiedCoordinateWeights = {
    environmentReality: "HIGH", empiricalStatus: "HIGH",
    sourceIntegrity: "HIGH", observationExternality: "HIGH",
    temporalBinding: "LOW", targetAlignment: "LOW",
    denominatorClosure: "MEDIUM", causalIdentification: "LOW",
    priceGrounding: "NONE", authorityBasis: "NONE",
  };
  const claimReceipts = CLAIMS.map((claimType) => makeReceipt({ adapter, profile,
    claimType, claimBody: bridgeClaimBody(claimType, projection),
    sourceVerificationHash: verification.sourceVerificationHash,
    verifiedCoordinateWeights }));
  const body = {
    schema: PUBLIC_REALITY_SCHEMAS.source,
    sourceId: adapter.sourceId,
    adapterId: adapter.adapterId,
    sourcePinHash: adapter.sourcePinHash,
    projection: bridgeProjection(projection),
    sourceVerification: verification,
    verifiedCoordinates: profile.coordinates,
    profile,
    denominators: projection.coverage,
    outcomes: projection.outcome,
    claimReceipts,
  };
  return { ...body, sourceEntryHash:
    hashPublicRealityEvidenceValue("source-entry", body) };
}

function liberoSource(upstream) {
  const projection = upstream.projection;
  const adapter = ADAPTERS["libero-deep"];
  const artifactHashes = [
    ...Object.values(projection.source.files).map((entry) => entry.sha256),
    projection.commitments.recursiveTreeBytesHash,
    projection.commitments.replayBundleBytesHash,
  ];
  const verification = sourceVerification(adapter, artifactHashes,
    projection.projectionHash);
  const denominatorDefinitionHash = hashPublicRealityEvidenceValue(
    "libero-denominator-definition", {
      selectedSourceFiles: projection.denominator.selectedSourceFiles,
      selectedSourceBytes: projection.denominator.selectedSourceBytes,
      taskArtifactRecords: projection.denominator.taskArtifactRecords,
      suiteDenominators: projection.denominator.suiteDenominators,
      omittedSelectedSourceFiles: projection.denominator.omittedSelectedSourceFiles,
    });
  const sourceDomainHash = hashPublicRealityEvidenceValue("source-domain", {
    sourceId: adapter.sourceId, datasetId: projection.source.datasetId,
    substrate: projection.evidenceRoleWeighting.substrate,
  });
  const observerIdentityHash = hashPublicRealityEvidenceValue("publisher-identity", {
    sourceId: adapter.sourceId,
    publisherScope: "LIFELONG_ROBOT_LEARNING_PINNED_REPOSITORY",
    cryptographicallyVerified: false,
  });
  const profile = createRealityEvidenceProfile({
    sourceRefHash: projection.projectionHash,
    roles: [...adapter.maximumRoles].sort(),
    coordinates: {
      environmentReality: "CONTROLLED_SIMULATION",
      empiricalStatus: "MANIFEST_DEFINITION",
      sourceIntegrity: "PINNED_REPLAY_VERIFIED",
      observationExternality: "PUBLISHER_REPORTED_EXTERNAL_TO_OUTSIDER",
      temporalBinding: "NOT_APPLICABLE",
      targetAlignment: "SOURCE_DOMAIN_ONLY",
      denominatorClosure: "COMPLETE",
      causalIdentification: "NONE",
      priceGrounding: "NONE",
      authorityBasis: "NONE",
    },
    bindings: blankBindings({ artifactHashes,
      sourceVerificationHash: verification.sourceVerificationHash,
      sourceDomainHash, observerIdentityHash, outcomeEvidenceHash: null,
      denominatorDefinitionHash }),
  });
  const verifiedCoordinateWeights = {
    environmentReality: "MEDIUM", empiricalStatus: "MEDIUM",
    sourceIntegrity: "HIGH", observationExternality: "HIGH",
    temporalBinding: "NONE", targetAlignment: "LOW",
    denominatorClosure: "HIGH", causalIdentification: "NONE",
    priceGrounding: "NONE", authorityBasis: "NONE",
  };
  const claimReceipts = CLAIMS.map((claimType) => makeReceipt({ adapter, profile,
    claimType, claimBody: liberoClaimBody(claimType, projection),
    sourceVerificationHash: verification.sourceVerificationHash,
    verifiedCoordinateWeights }));
  const body = {
    schema: PUBLIC_REALITY_SCHEMAS.source,
    sourceId: adapter.sourceId,
    adapterId: adapter.adapterId,
    sourcePinHash: adapter.sourcePinHash,
    projection: liberoProjection(projection),
    sourceVerification: verification,
    verifiedCoordinates: profile.coordinates,
    profile,
    denominators: projection.denominator,
    outcomes: projection.executionEvidence,
    claimReceipts,
  };
  return { ...body, sourceEntryHash:
    hashPublicRealityEvidenceValue("source-entry", body) };
}

export function createPublicRealityEvidenceRegistry(input = {}) {
  const cloned = cloneInput(input);
  const sources = [
    bridgeSource(bridgeUpstream(cloned.bridgeData)),
    liberoSource(liberoUpstream(cloned.libero)),
  ].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const highWeightClaimsBySource = Object.fromEntries(sources.map((entry) =>
    [entry.sourceId, entry.claimReceipts.filter((item) => item.claimWeight === "HIGH")
      .map((item) => item.claimType).sort()]));
  const body = {
    schema: PUBLIC_REALITY_SCHEMAS.registry,
    schemaVersion: "1.0.0",
    definition: definition(),
    sources,
    summary: {
      sourceCount: 2,
      receiptCount: 18,
      highWeightReceiptCount: 6,
      noneWeightReceiptCount: 12,
      highWeightClaimsBySource,
      sourceBytesReplayedThisInvocation: true,
      realPhysicalObservationSources: 1,
      controlledSimulationManifestSources: 1,
      ownOutsiderOutcomeDenominator: 0,
      outsiderCausalEffect: null,
      targetPrice: null,
      scalarRealityScore: null,
    },
    boundary: noAuthorityBoundary(),
  };
  return deepFreeze({ ...body, registryHash:
    hashPublicRealityEvidenceValue("registry", body) });
}

export function verifyPublicRealityEvidenceRegistry(registry, input = {}) {
  try {
    if (!plain(registry) || registry.schema !== PUBLIC_REALITY_SCHEMAS.registry
      || registry.schemaVersion !== "1.0.0"
      || !HASH.test(String(registry.registryHash ?? ""))) {
      fail("REGISTRY_SHAPE_INVALID");
    }
    const rebuilt = createPublicRealityEvidenceRegistry(input);
    if (!same(registry, rebuilt)) fail("CANONICAL_REPLAY_MISMATCH");
    return {
      ok: true,
      registryHash: registry.registryHash,
      definitionHash: registry.definition.definitionHash,
      sourceCount: registry.summary.sourceCount,
      receiptCount: registry.summary.receiptCount,
      highWeightReceiptCount: registry.summary.highWeightReceiptCount,
      sourceBytesReplayedThisInvocation: true,
      scalarScore: null,
      authority: "none",
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
