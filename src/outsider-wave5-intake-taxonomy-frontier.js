/*
 * Source-aware Stage 1 / 1.5 intake seam for public-evidence Wave 5.
 *
 * This module deliberately remains separate from the shared corpus registry
 * and empirical ledger.  It projects full-source-replayed Wave 5 records into
 * two narrow lanes, emits content-addressed snapshots and diffs, and provides
 * a local append-only registry seam.  It never promotes the rows to causal
 * experience, loss, population frequency, training, pricing, guarantee, or
 * settlement authority.
 */

import { createHash, randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, renameSync, unlinkSync, writeSync }
  from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import {
  PUBLIC_EVIDENCE_WAVE5_CANONICAL_GENERATED_AT,
  ROBUST_ROS_WAVE5_PIN,
  TRACE_COMMONS_WAVE5_PIN,
  verifyPublicEvidenceWave5Source,
  verifyPublicEvidenceWave5Record,
  verifyPublicEvidenceWave5Result,
} from "./outsider-public-evidence-wave5.js";

export const WAVE5_INTAKE_SCHEMAS = Object.freeze({
  provider: "outsider/wave5-source-intake-provider/v1",
  row: "outsider/wave5-empirical-taxonomy-row/v1",
  snapshot: "outsider/wave5-source-aware-intake-snapshot/v1",
  diff: "outsider/wave5-source-aware-intake-diff/v1",
  registryEvent: "outsider/wave5-intake-registry-event/v1",
  registryState: "outsider/wave5-intake-registry-state/v1",
});

export const PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER = Object.freeze({
  schema: WAVE5_INTAKE_SCHEMAS.provider,
  providerId: "PUBLIC_EVIDENCE_WAVE5_FULL_SOURCE_V1",
  providerVersion: "1.1.0",
  sourceKinds: Object.freeze([
    TRACE_COMMONS_WAVE5_PIN.sourceKind,
    ROBUST_ROS_WAVE5_PIN.sourceKind,
  ]),
  derivationMode: "CODED_FULL_SOURCE_REPLAY",
  buildInput: "SOURCE_DIRECTORY_ONLY",
  acceptsCallerVerificationCallbacks: false,
  acceptsCallerMaterializedResultAsProof: false,
  futureAppendContract: Object.freeze({
    predecessorSnapshotRequiredAfterGenesis: true,
    compareAndSwapHeadRequired: true,
    newProviderRequiresCodedSourceVerifierAndNewProviderId: true,
    callerSuppliedRowsAcquireAuthority: false,
  }),
  authority: "NONE",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const TAXONOMY_CODE = /^[A-Z][A-Z0-9_-]*(?::[A-Z0-9_-]+)+$/;
const GENESIS = digest("genesis", "outsider/wave5-intake-registry/genesis/v1");

function fail(code, detail = null) {
  throw new Error(detail == null ? `WAVE5_INTAKE_${code}`
    : `WAVE5_INTAKE_${code}:${detail}`);
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
function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function digest(value, domain) {
  return sha256(`${domain}\0${typeof value === "string"
    ? value : canonicalizeStrict(value)}`);
}
function canonicalTime(value, code) {
  const text = value instanceof Date ? value.toISOString() : value;
  if (typeof text !== "string" || text.length > 40
    || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) {
    fail(`${code}_INVALID`);
  }
  return text;
}
function nonnegative(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function boundary() {
  return {
    disposition: "SOURCE_AWARE_DESCRIPTIVE_INTAKE_ONLY",
    sourceRealityPreserved: true,
    sourceReplayDoesNotCreateAuthority: true,
    causalExperienceUnits: 0,
    independentOutcomeUnits: 0,
    exposureDenominatorRows: 0,
    economicLossRows: 0,
    populationFrequencyEligible: false,
    automaticTraining: false,
    productionModelEligible: false,
    pricingEligible: false,
    permits: { CEU: false, MODEL: false, LOSS: false, PRICE: false,
      GUARANTEE: false, SETTLE: false },
  };
}
function expectedTraceAxes() {
  return {
    reality: {
      class: "REAL_SOFTWARE",
      observationOrigin: "VOLUNTARILY_DONATED_RECORDED_SESSION",
      empiricalStatus: "EMPIRICAL_RECORDED",
      organicInteractionPublisherDeclared: true,
      executionIndependentlyReplayed: false,
    },
    authority: {
      publisherDeclared: true,
      contributorReviewedBeforeSubmission: true,
      maintainerReviewedBeforeMerge: true,
      reviewIdentityIndependentlyVerifiedPerRow: false,
      outcomeIndependentlyAdjudicated: false,
    },
    rights: {
      compilationLicenseId: TRACE_COMMONS_WAVE5_PIN.licenseId,
      compilationPublisherPermitsTrainingWithAttribution: true,
      embeddedMaterialLicensesUniformlyVerified: false,
      contributorRightToPublishCertifiedNotIndependentlyReverified: true,
      outsiderGrantsNoAdditionalRights: true,
    },
    permittedUse: {
      outsiderUses: ["DESCRIPTIVE", "SHADOW_RESEARCH"],
      rawTextPersistedInProjection: false,
      automaticTraining: false,
    },
  };
}
function expectedRobustAxes() {
  return {
    reality: {
      class: "REAL_SOFTWARE",
      observationOrigin: "ORGANIC_OPEN_SOURCE_ISSUE_AND_FIX_METADATA",
      empiricalStatus: "EMPIRICAL_RECORDED_METADATA",
      physicalRobotContext: true,
      physicalExecutionStreamAcquired: false,
      bugEnvironmentIndependentlyReplayed: false,
    },
    authority: {
      publisherDeclared: true,
      manuallyCuratedTaxonomyPublisherDeclared: true,
      sourceIssueAndFixReferencesPresent: true,
      coderIdentityIndependentlyVerifiedPerRow: false,
      outcomeIndependentlyAdjudicated: false,
    },
    rights: {
      repositoryPubliclyAccessible: true,
      rootLicenseOrCopyingFileDetectedAtPinnedTree: false,
      githubLicenseMetadataDeclared: false,
      licenseId: ROBUST_ROS_WAVE5_PIN.licenseId,
      outsiderGrantsNoAdditionalRights: true,
    },
    permittedUse: {
      outsiderUses: ["DESCRIPTIVE_SOURCE_REPLAY"],
      rawDescriptionPersistedInProjection: false,
      automaticTraining: false,
    },
  };
}
function seal(body, field, domain) {
  return { ...body, [field]: digest(body, domain) };
}
function verifySeal(value, field, domain) {
  if (!plain(value) || !HASH.test(value[field] ?? "")) return false;
  const body = { ...value };
  delete body[field];
  return value[field] === digest(body, domain);
}
function structureOnlyResult(ok) {
  return { ok, verificationLevel: "STRUCTURE_ONLY",
    sourceArtifactsReverified: false };
}
function fullSourceResult(ok) {
  return { ok, verificationLevel: ok ? "FULL_SOURCE_REPLAY"
    : "FULL_SOURCE_REPLAY_FAILED", sourceArtifactsReverified: ok };
}
function registryStructureResult(ok, detail = {}) {
  return { ok, verificationLevel: "LOCAL_CHAIN_STRUCTURE_ONLY",
    sourceArtifactsReverified: false, ...detail };
}
function replayWave5SourceDirectory(sourceDirectory, generatedAt) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length < 1) {
    fail("SOURCE_DIRECTORY_REQUIRED");
  }
  const root = path.resolve(sourceDirectory);
  return verifyPublicEvidenceWave5Source({
    traceCommonsDirectory: path.join(root, "trace-commons"),
    robustRosDirectory: path.join(root, "robust-ros"),
    generatedAt,
  });
}

function traceMissingness(record) {
  const harness = record.selection.harness;
  return {
    sourceToolEvidenceCoverage: harness === "claude_code"
      ? "COMPLETE_CALL_RESULT_PAIRING"
      : harness === "cursor" ? "TOOL_RESULTS_NOT_PRESERVED"
        : "COMPLETE_TOOL_STATE_ONLY",
    rawPromptOrToolPayloadProjected: false,
    nativeSuccessLabelMissing: true,
    terminalRecoveryLabelMissing: true,
    independentExecutionReplayMissing: true,
    independentOutcomeMissing: true,
    exposureDenominatorMissing: true,
    economicLossMissing: true,
  };
}

function robustMissingness(record) {
  return {
    issueReferenceMissing: !record.observations.issueReferencePresent,
    pullRequestReferenceMissing: !record.observations.pullRequestReferencePresent,
    fixCommitMissing: record.observations.fixCommitCount === 0,
    rawIssueAndDescriptionProjected: false,
    physicalExecutionStreamMissing: true,
    independentBugEnvironmentReplayMissing: true,
    independentConsequenceAdjudicationMissing: true,
    exposureDenominatorMissing: true,
    economicLossMissing: true,
  };
}

function humanReview(rowKind) {
  return {
    sourceReviewMode: rowKind === "ORGANIC_AGENT_SESSION_SHAPE"
      ? "CONTRIBUTOR_REVIEW_PLUS_MAINTAINER_PR_REVIEW_PUBLISHER_DECLARED"
      : "MANUALLY_CURATED_TAXONOMY_PUBLISHER_DECLARED",
    sourceReviewPresent: true,
    sourceReviewEvidenceBasis: "PUBLISHER_DECLARED",
    reviewIdentityIndependentlyVerifiedPerRow: false,
    outsiderProjectionReviewed: false,
    downstreamHumanReviewRequired: true,
    automaticDownstreamAdmission: false,
  };
}

function rowIdentity(record, rowKind) {
  const projectionId = digest({ sourceRoot: record.identity.sourceRoot,
    sourceRecordHash: record.identity.sourceRecordHash, rowKind },
  "outsider/wave5-intake/projection-id/v1");
  const isTrace = rowKind === "ORGANIC_AGENT_SESSION_SHAPE";
  return {
    projectionId,
    sourceRecordHash: record.identity.sourceRecordHash,
    d1IdentityRoot: digest({ projectionId, sourceRecordHash: record.identity.sourceRecordHash },
      "outsider/wave5-intake/d1-identity/v1"),
    d2CorrelationRoot: digest(isTrace
      ? { sourceRoot: record.identity.sourceRoot,
        policy: "CONSERVATIVE_ALL_SELECTED_TRACE_COMMONS" }
      : { sourceRoot: record.identity.sourceRoot, system: record.observations.system,
        policy: "CONSERVATIVE_ROS_SYSTEM_NAMESPACE" },
    "outsider/wave5-intake/d2-correlation/v1"),
    d2CorrelationPolicy: isTrace
      ? "CONSERVATIVE_DATASET_LEVEL_DONOR_PROJECT_LINKAGE_NOT_PROJECTED"
      : "CONSERVATIVE_SYSTEM_NAMESPACE_SHARED_ISSUE_AND_CODEBASE_CONTEXT",
    sourceNativeCorrelationComplete: false,
    independentExposureUnit: false,
  };
}

function traceEmpirical(record) {
  const observations = record.observations;
  return {
    harness: record.selection.harness,
    sourceEvents: observations.sourceEvents,
    humanPromptTextBlocks: observations.humanPromptTextBlocks,
    assistantTextBlocks: observations.assistantTextBlocks,
    toolCalls: observations.toolCalls,
    toolResultsOrStatesPreserved: observations.toolResults,
    sourceNativeToolErrors: observations.sourceNativeToolErrors,
    writeLikeToolCalls: observations.writeLikeToolCalls,
    humanFollowupPromptCount: observations.humanFollowupPromptCount,
    continuedAfterObservedToolError: observations.continuedAfterObservedToolError,
    toolFamilyCounts: structuredClone(observations.toolFamilyCounts),
    shapeOnly: true,
    errorRateClaimed: false,
    recoveryClaimed: false,
    successClaimed: false,
  };
}

function robustEmpirical(record) {
  const observations = record.observations;
  return {
    system: observations.system,
    severity: observations.severity,
    phase: observations.phase,
    specificity: observations.specificity,
    architecturalLocation: observations.architecturalLocation,
    subsystem: observations.subsystem,
    detectedBy: observations.detectedBy,
    reportedBy: observations.reportedBy,
    reproducibility: observations.reproducibility,
    issueReferencePresent: observations.issueReferencePresent,
    issueReferenceHash: observations.issueReferenceHash,
    pullRequestReferencePresent: observations.pullRequestReferencePresent,
    pullRequestReferenceHash: observations.pullRequestReferenceHash,
    fixCommitCount: observations.fixCommitCount,
    fixCommitSetHash: observations.fixCommitSetHash,
    faultCodes: structuredClone(observations.faultCodes),
    failureCodes: structuredClone(observations.failureCodes),
    publisherPhysicalClassificationMarker:
      observations.publisherPhysicalClassificationMarker,
    mechanismTaxonomyOnly: true,
    physicalExecutionClaimed: false,
    populationFrequencyClaimed: false,
    lossClaimed: false,
  };
}

export function projectPublicEvidenceWave5IntakeRow(record) {
  if (!verifyPublicEvidenceWave5Record(record).ok) fail("SOURCE_RECORD_INVALID");
  const isTrace = record.recordType === "ORGANIC_AGENT_SESSION_STRUCTURE";
  const rowKind = isTrace ? "ORGANIC_AGENT_SESSION_SHAPE"
    : "ROS_BUG_FIX_MECHANISM_TAXONOMY";
  const body = {
    schema: WAVE5_INTAKE_SCHEMAS.row,
    rowKind,
    source: {
      datasetId: record.dataset.id,
      revision: record.dataset.revision,
      sourceKind: record.dataset.sourceKind,
      sourceRoot: record.identity.sourceRoot,
      sourceRecordHash: record.identity.sourceRecordHash,
      sourceRecordSeal: record.recordHash,
    },
    identity: rowIdentity(record, rowKind),
    selection: {
      rule: record.selection.rule,
      outcomeBlind: record.selection.outcomeBlind,
      stratum: isTrace ? record.selection.harness : record.selection.namespace,
    },
    reality: structuredClone(record.axes.environmentReality),
    authority: structuredClone(record.axes.evidenceAuthority),
    rights: structuredClone(record.axes.rights),
    permittedUse: structuredClone(record.axes.permittedUse),
    humanReview: humanReview(rowKind),
    missingness: isTrace ? traceMissingness(record) : robustMissingness(record),
    empirical: isTrace ? traceEmpirical(record) : robustEmpirical(record),
    boundary: boundary(),
  };
  return seal(body, "rowHash", "outsider/wave5-intake/row/v1");
}

function verifyHashOrNull(value) {
  return value === null || HASH.test(value);
}

function verifyTraceRow(row) {
  const empiricalKeys = ["harness", "sourceEvents", "humanPromptTextBlocks",
    "assistantTextBlocks", "toolCalls", "toolResultsOrStatesPreserved",
    "sourceNativeToolErrors", "writeLikeToolCalls", "humanFollowupPromptCount",
    "continuedAfterObservedToolError", "toolFamilyCounts", "shapeOnly",
    "errorRateClaimed", "recoveryClaimed", "successClaimed"];
  const missingnessKeys = ["sourceToolEvidenceCoverage",
    "rawPromptOrToolPayloadProjected", "nativeSuccessLabelMissing",
    "terminalRecoveryLabelMissing", "independentExecutionReplayMissing",
    "independentOutcomeMissing", "exposureDenominatorMissing", "economicLossMissing"];
  const empirical = row.empirical;
  const missing = row.missingness;
  const coverageByHarness = {
    claude_code: "COMPLETE_CALL_RESULT_PAIRING",
    cursor: "TOOL_RESULTS_NOT_PRESERVED",
    opencode: "COMPLETE_TOOL_STATE_ONLY",
  };
  if (row.source.datasetId !== TRACE_COMMONS_WAVE5_PIN.id
    || row.source.revision !== TRACE_COMMONS_WAVE5_PIN.revision
    || row.source.sourceKind !== TRACE_COMMONS_WAVE5_PIN.sourceKind
    || !TRACE_COMMONS_WAVE5_PIN.selectedHarnesses.includes(row.selection.stratum)
    || row.selection.rule !== TRACE_COMMONS_WAVE5_PIN.selectionRule
    || row.identity.d2CorrelationPolicy
      !== "CONSERVATIVE_DATASET_LEVEL_DONOR_PROJECT_LINKAGE_NOT_PROJECTED"
    || !exactKeys(empirical, empiricalKeys)
    || empirical.harness !== row.selection.stratum
    || !empiricalKeys.slice(1, 9).every((key) => nonnegative(empirical[key]))
    || !plain(empirical.toolFamilyCounts)
    || Object.values(empirical.toolFamilyCounts).some((value) => !nonnegative(value))
    || Object.values(empirical.toolFamilyCounts).reduce((sum, value) => sum + value, 0)
      !== empirical.toolCalls
    || empirical.toolResultsOrStatesPreserved > empirical.toolCalls
    || empirical.sourceNativeToolErrors > empirical.toolResultsOrStatesPreserved
    || empirical.writeLikeToolCalls > empirical.toolCalls
    || empirical.humanFollowupPromptCount
      !== Math.max(0, empirical.humanPromptTextBlocks - 1)
    || typeof empirical.continuedAfterObservedToolError !== "boolean"
    || empirical.shapeOnly !== true || empirical.errorRateClaimed !== false
    || empirical.recoveryClaimed !== false || empirical.successClaimed !== false
    || !exactKeys(missing, missingnessKeys)
    || !["COMPLETE_CALL_RESULT_PAIRING", "TOOL_RESULTS_NOT_PRESERVED",
      "COMPLETE_TOOL_STATE_ONLY"].includes(missing.sourceToolEvidenceCoverage)
    || missing.sourceToolEvidenceCoverage !== coverageByHarness[empirical.harness]
    || Object.entries(missing).filter(([key]) => key !== "sourceToolEvidenceCoverage")
      .some(([, value]) => typeof value !== "boolean")
    || missing.rawPromptOrToolPayloadProjected !== false
    || ["nativeSuccessLabelMissing", "terminalRecoveryLabelMissing",
      "independentExecutionReplayMissing", "independentOutcomeMissing",
      "exposureDenominatorMissing", "economicLossMissing"]
      .some((key) => missing[key] !== true)
    || !same({ reality: row.reality, authority: row.authority, rights: row.rights,
      permittedUse: row.permittedUse }, expectedTraceAxes())) return false;
  return true;
}

function boundedNullable(value) {
  return value === null || (typeof value === "string" && value.length <= 160
    && !/[\r\n]/.test(value));
}

function verifyRobustRow(row) {
  const empiricalKeys = ["system", "severity", "phase", "specificity",
    "architecturalLocation", "subsystem", "detectedBy", "reportedBy",
    "reproducibility", "issueReferencePresent", "issueReferenceHash",
    "pullRequestReferencePresent", "pullRequestReferenceHash", "fixCommitCount",
    "fixCommitSetHash", "faultCodes", "failureCodes",
    "publisherPhysicalClassificationMarker", "mechanismTaxonomyOnly",
    "physicalExecutionClaimed", "populationFrequencyClaimed", "lossClaimed"];
  const missingnessKeys = ["issueReferenceMissing", "pullRequestReferenceMissing",
    "fixCommitMissing", "rawIssueAndDescriptionProjected", "physicalExecutionStreamMissing",
    "independentBugEnvironmentReplayMissing",
    "independentConsequenceAdjudicationMissing", "exposureDenominatorMissing",
    "economicLossMissing"];
  const empirical = row.empirical;
  const missing = row.missingness;
  if (row.source.datasetId !== ROBUST_ROS_WAVE5_PIN.id
    || row.source.revision !== ROBUST_ROS_WAVE5_PIN.revision
    || row.source.sourceKind !== ROBUST_ROS_WAVE5_PIN.sourceKind
    || !ROBUST_ROS_WAVE5_PIN.namespaces.includes(row.selection.stratum)
    || row.selection.rule !== ROBUST_ROS_WAVE5_PIN.selectionRule
    || row.identity.d2CorrelationPolicy
      !== "CONSERVATIVE_SYSTEM_NAMESPACE_SHARED_ISSUE_AND_CODEBASE_CONTEXT"
    || !exactKeys(empirical, empiricalKeys)
    || empirical.system !== row.selection.stratum
    || !/^[a-z][a-z0-9_-]{0,63}$/.test(empirical.severity ?? "")
    || !["build", "runtime", "startup"].includes(empirical.phase)
    || ![empirical.specificity, empirical.architecturalLocation, empirical.subsystem,
      empirical.detectedBy, empirical.reportedBy, empirical.reproducibility]
      .every(boundedNullable)
    || typeof empirical.issueReferencePresent !== "boolean"
    || empirical.issueReferencePresent !== HASH.test(empirical.issueReferenceHash ?? "")
    || typeof empirical.pullRequestReferencePresent !== "boolean"
    || empirical.pullRequestReferencePresent
      !== HASH.test(empirical.pullRequestReferenceHash ?? "")
    || !nonnegative(empirical.fixCommitCount) || !HASH.test(empirical.fixCommitSetHash ?? "")
    || !Array.isArray(empirical.faultCodes) || !Array.isArray(empirical.failureCodes)
    || !same(empirical.faultCodes, [...new Set(empirical.faultCodes)].sort())
    || !same(empirical.failureCodes, [...new Set(empirical.failureCodes)].sort())
    || ![...empirical.faultCodes, ...empirical.failureCodes]
      .every((value) => TAXONOMY_CODE.test(value))
    || typeof empirical.publisherPhysicalClassificationMarker !== "boolean"
    || empirical.mechanismTaxonomyOnly !== true
    || empirical.physicalExecutionClaimed !== false
    || empirical.populationFrequencyClaimed !== false || empirical.lossClaimed !== false
    || !exactKeys(missing, missingnessKeys)
    || missing.issueReferenceMissing !== !empirical.issueReferencePresent
    || missing.pullRequestReferenceMissing !== !empirical.pullRequestReferencePresent
    || missing.fixCommitMissing !== (empirical.fixCommitCount === 0)
    || missing.rawIssueAndDescriptionProjected !== false
    || ["physicalExecutionStreamMissing", "independentBugEnvironmentReplayMissing",
      "independentConsequenceAdjudicationMissing", "exposureDenominatorMissing",
      "economicLossMissing"].some((key) => missing[key] !== true)
    || !same({ reality: row.reality, authority: row.authority, rights: row.rights,
      permittedUse: row.permittedUse }, expectedRobustAxes())) return false;
  return true;
}

export function verifyWave5IntakeRow(row) {
  try {
    const topKeys = ["schema", "rowKind", "source", "identity", "selection", "reality",
      "authority", "rights", "permittedUse", "humanReview", "missingness", "empirical",
      "boundary", "rowHash"];
    if (!verifySeal(row, "rowHash", "outsider/wave5-intake/row/v1")
      || !exactKeys(row, topKeys) || row.schema !== WAVE5_INTAKE_SCHEMAS.row
      || !exactKeys(row.source, ["datasetId", "revision", "sourceKind", "sourceRoot",
        "sourceRecordHash", "sourceRecordSeal"])
      || !TOKEN.test(row.source.sourceKind ?? "")
      || ![row.source.sourceRoot, row.source.sourceRecordHash,
        row.source.sourceRecordSeal].every((value) => HASH.test(value ?? ""))
      || row.source.sourceRoot !== digest({ id: row.source.datasetId,
        revision: row.source.revision },
      "outsider/public-evidence-wave5/source-root/v1")
      || !exactKeys(row.identity, ["projectionId", "sourceRecordHash", "d1IdentityRoot",
        "d2CorrelationRoot", "d2CorrelationPolicy", "sourceNativeCorrelationComplete",
        "independentExposureUnit"])
      || ![row.identity.projectionId, row.identity.sourceRecordHash,
        row.identity.d1IdentityRoot, row.identity.d2CorrelationRoot]
        .every((value) => HASH.test(value ?? ""))
      || row.identity.sourceRecordHash !== row.source.sourceRecordHash
      || row.identity.projectionId !== digest({ sourceRoot: row.source.sourceRoot,
        sourceRecordHash: row.source.sourceRecordHash, rowKind: row.rowKind },
      "outsider/wave5-intake/projection-id/v1")
      || row.identity.d1IdentityRoot !== digest({
        projectionId: row.identity.projectionId,
        sourceRecordHash: row.source.sourceRecordHash,
      }, "outsider/wave5-intake/d1-identity/v1")
      || row.identity.d2CorrelationRoot !== digest(
        row.rowKind === "ORGANIC_AGENT_SESSION_SHAPE"
          ? { sourceRoot: row.source.sourceRoot,
            policy: "CONSERVATIVE_ALL_SELECTED_TRACE_COMMONS" }
          : row.rowKind === "ROS_BUG_FIX_MECHANISM_TAXONOMY"
            ? { sourceRoot: row.source.sourceRoot, system: row.empirical?.system,
              policy: "CONSERVATIVE_ROS_SYSTEM_NAMESPACE" }
            : { invalid: true },
      "outsider/wave5-intake/d2-correlation/v1")
      || row.identity.sourceNativeCorrelationComplete !== false
      || row.identity.independentExposureUnit !== false
      || !exactKeys(row.selection, ["rule", "outcomeBlind", "stratum"])
      || row.selection.outcomeBlind !== true
      || !plain(row.reality) || !plain(row.authority) || !plain(row.rights)
      || !plain(row.permittedUse) || row.permittedUse.automaticTraining !== false
      || !same(row.humanReview, humanReview(row.rowKind))
      || !same(row.boundary, boundary())) return structureOnlyResult(false);
    const valid = row.rowKind === "ORGANIC_AGENT_SESSION_SHAPE"
      ? verifyTraceRow(row) : row.rowKind === "ROS_BUG_FIX_MECHANISM_TAXONOMY"
        ? verifyRobustRow(row) : false;
    return structureOnlyResult(valid);
  } catch { return structureOnlyResult(false); }
}

function frequency(rows, select) {
  const counts = new Map();
  for (const row of rows) {
    const values = select(row);
    for (const value of Array.isArray(values) ? values : [values]) {
      if (value == null) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right)));
}

function snapshotSummary(rows) {
  const trace = rows.filter((row) => row.rowKind === "ORGANIC_AGENT_SESSION_SHAPE");
  const robust = rows.filter((row) => row.rowKind === "ROS_BUG_FIX_MECHANISM_TAXONOMY");
  return {
    rows: rows.length,
    organicAgentSessionShapeRows: trace.length,
    rosBugFixMechanismTaxonomyRows: robust.length,
    uniqueD1IdentityRoots: new Set(rows.map((row) => row.identity.d1IdentityRoot)).size,
    conservativeD2CorrelationGroups: new Set(rows.map((row) =>
      row.identity.d2CorrelationRoot)).size,
    traceHarnesses: frequency(trace, (row) => row.empirical.harness),
    traceToolEvidenceCoverage: frequency(trace,
      (row) => row.missingness.sourceToolEvidenceCoverage),
    traceToolCalls: trace.reduce((sum, row) => sum + row.empirical.toolCalls, 0),
    traceSourceNativeToolErrors: trace.reduce((sum, row) =>
      sum + row.empirical.sourceNativeToolErrors, 0),
    robustSystems: frequency(robust, (row) => row.empirical.system),
    robustPhases: frequency(robust, (row) => row.empirical.phase),
    robustFaultCodes: frequency(robust, (row) => row.empirical.faultCodes),
    robustFailureCodes: frequency(robust, (row) => row.empirical.failureCodes),
    robustIssueReferenceMissing: robust.filter((row) =>
      row.missingness.issueReferenceMissing).length,
    robustPullRequestReferenceMissing: robust.filter((row) =>
      row.missingness.pullRequestReferenceMissing).length,
    robustFixCommitMissing: robust.filter((row) => row.missingness.fixCommitMissing).length,
    sourceHumanReviewDeclaredRows: rows.filter((row) =>
      row.humanReview.sourceReviewPresent).length,
    outsiderProjectionReviewedRows: rows.filter((row) =>
      row.humanReview.outsiderProjectionReviewed).length,
    downstreamHumanReviewRequiredRows: rows.filter((row) =>
      row.humanReview.downstreamHumanReviewRequired).length,
    rowsMissingIndependentOutcome: rows.length,
    rowsMissingExposureDenominator: rows.length,
    rowsWithEconomicLoss: 0,
    causalExperienceUnits: 0,
    populationFrequencyEligibleRows: 0,
    pricingEligibleRows: 0,
    automaticTrainingRows: 0,
  };
}

function sourceVerification(result) {
  return {
    mode: "FULL_SOURCE_REPRODUCED_BY_CODED_PROVIDER",
    claimVerificationMode: "SOURCE_DIRECTORY_REPLAY_REQUIRED",
    callerMaterializedResultAcceptedAsProof: false,
    structureVerifiersCanEstablishSourceReplay: false,
    providerId: PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER.providerId,
    wave5ManifestHash: result.manifest.manifestHash,
    wave5RecordSetHash: result.recordSet.recordSetHash,
    wave5SummaryHash: result.summary.summaryHash,
    wave5VerificationHash: result.verification.verificationHash,
    sourceArtifactsReverified: result.verification.sourceArtifactsReverified,
    selectedSourceObjectsReverified: result.verification.selectedSourceObjectsReverified,
    selectedSourceBytesReverified: result.verification.selectedSourceBytesReverified,
    sourceNativeRowsReparsed: result.verification.sourceNativeRowsReparsed,
  };
}

function sourceDescriptors(rows) {
  const byKind = new Map();
  for (const row of rows) {
    const bucket = byKind.get(row.source.sourceKind) ?? [];
    bucket.push(row);
    byKind.set(row.source.sourceKind, bucket);
  }
  return [...byKind].sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceKind, sourceRows]) => {
      const first = sourceRows[0];
      const trace = sourceKind === TRACE_COMMONS_WAVE5_PIN.sourceKind;
      return {
        datasetId: first.source.datasetId,
        revision: first.source.revision,
        sourceKind,
        sourceRoot: first.source.sourceRoot,
        recordCount: sourceRows.length,
        sourceRecordSetHash: digest(sourceRows.map((row) => row.source.sourceRecordHash).sort(),
          "outsider/wave5-intake/source-record-set/v1"),
        selectionRule: first.selection.rule,
        selectionOutcomeBlind: true,
        realityClass: first.reality.class,
        rights: structuredClone(first.rights),
        permittedUse: structuredClone(first.permittedUse),
        humanReview: structuredClone(first.humanReview),
        correlationPolicy: first.identity.d2CorrelationPolicy,
        sourceNativeCorrelationComplete: false,
        missingnessPolicy: trace
          ? "SESSION_SHAPE_ONLY_NO_COMMON_OUTCOME_OR_DENOMINATOR"
          : "BUG_FIX_TAXONOMY_ONLY_NO_PHYSICAL_STREAM_OUTCOME_OR_DENOMINATOR",
      };
    });
}

export function buildWave5IntakeSnapshot(options = {}) {
  if (!plain(options) || Object.keys(options).some((key) =>
    !["sourceDirectory", "generatedAt", "predecessorSnapshot"].includes(key))) {
    fail("BUILD_ARGUMENT_INVALID");
  }
  const { sourceDirectory,
    generatedAt = PUBLIC_EVIDENCE_WAVE5_CANONICAL_GENERATED_AT,
    predecessorSnapshot = null } = options;
  const time = canonicalTime(generatedAt, "SNAPSHOT_TIME");
  const result = replayWave5SourceDirectory(sourceDirectory, time);
  if (!verifyPublicEvidenceWave5Result(result).ok) fail("FULL_SOURCE_REPLAY_INVALID");
  if (predecessorSnapshot !== null && !verifyWave5IntakeSnapshot(predecessorSnapshot).ok) {
    fail("PREDECESSOR_SNAPSHOT_INVALID");
  }
  const rows = result.records.map(projectPublicEvidenceWave5IntakeRow)
    .sort((left, right) => left.identity.projectionId.localeCompare(right.identity.projectionId));
  const body = {
    schema: WAVE5_INTAKE_SCHEMAS.snapshot,
    generatedAt: time,
    provider: structuredClone(PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER),
    predecessorSnapshotHash: predecessorSnapshot?.snapshotHash ?? null,
    sourceVerification: sourceVerification(result),
    sources: sourceDescriptors(rows),
    rows,
    summary: snapshotSummary(rows),
    boundary: boundary(),
  };
  return seal(body, "snapshotHash", "outsider/wave5-intake/snapshot/v1");
}

export function verifyWave5IntakeSnapshot(snapshot, options = {}) {
  if (!plain(options) || Object.keys(options).some((key) => key !== "sourceDirectory")) {
    return structureOnlyResult(false);
  }
  const sourceDirectory = Object.hasOwn(options, "sourceDirectory")
    ? options.sourceDirectory : null;
  const fullSourceRequested = sourceDirectory !== null;
  try {
    const topKeys = ["schema", "generatedAt", "provider", "predecessorSnapshotHash",
      "sourceVerification", "sources", "rows", "summary", "boundary", "snapshotHash"];
    if (!verifySeal(snapshot, "snapshotHash", "outsider/wave5-intake/snapshot/v1")
      || !exactKeys(snapshot, topKeys) || snapshot.schema !== WAVE5_INTAKE_SCHEMAS.snapshot
      || canonicalTime(snapshot.generatedAt, "SNAPSHOT_TIME") !== snapshot.generatedAt
      || !same(snapshot.provider, PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER)
      || !verifyHashOrNull(snapshot.predecessorSnapshotHash)
      || !exactKeys(snapshot.sourceVerification, ["mode", "claimVerificationMode",
        "callerMaterializedResultAcceptedAsProof",
        "structureVerifiersCanEstablishSourceReplay", "providerId",
        "wave5ManifestHash", "wave5RecordSetHash", "wave5SummaryHash",
        "wave5VerificationHash", "sourceArtifactsReverified",
        "selectedSourceObjectsReverified", "selectedSourceBytesReverified",
        "sourceNativeRowsReparsed"])
      || snapshot.sourceVerification.mode !== "FULL_SOURCE_REPRODUCED_BY_CODED_PROVIDER"
      || snapshot.sourceVerification.claimVerificationMode
        !== "SOURCE_DIRECTORY_REPLAY_REQUIRED"
      || snapshot.sourceVerification.callerMaterializedResultAcceptedAsProof !== false
      || snapshot.sourceVerification.structureVerifiersCanEstablishSourceReplay !== false
      || snapshot.sourceVerification.providerId
        !== PUBLIC_EVIDENCE_WAVE5_INTAKE_PROVIDER.providerId
      || ![snapshot.sourceVerification.wave5ManifestHash,
        snapshot.sourceVerification.wave5RecordSetHash,
        snapshot.sourceVerification.wave5SummaryHash,
        snapshot.sourceVerification.wave5VerificationHash].every((value) => HASH.test(value ?? ""))
      || snapshot.sourceVerification.sourceArtifactsReverified !== true
      || snapshot.sourceVerification.selectedSourceObjectsReverified !== 57
      || snapshot.sourceVerification.selectedSourceBytesReverified !== 576_071
      || snapshot.sourceVerification.sourceNativeRowsReparsed !== 49
      || !Array.isArray(snapshot.rows) || snapshot.rows.length !== 49
      || !snapshot.rows.every((row) => verifyWave5IntakeRow(row).ok)
      || !same(snapshot.rows, [...snapshot.rows].sort((left, right) =>
        left.identity.projectionId.localeCompare(right.identity.projectionId)))
      || new Set(snapshot.rows.map((row) => row.identity.projectionId)).size !== 49
      || !same(snapshot.sources, sourceDescriptors(snapshot.rows))
      || !same(snapshot.summary, snapshotSummary(snapshot.rows))
      || !same(snapshot.boundary, boundary())) {
      return fullSourceRequested ? fullSourceResult(false) : structureOnlyResult(false);
    }
    if (fullSourceRequested) {
      const replayed = replayWave5SourceDirectory(sourceDirectory, snapshot.generatedAt);
      if (!verifyPublicEvidenceWave5Result(replayed).ok) return fullSourceResult(false);
      const expectedRows = replayed.records.map(projectPublicEvidenceWave5IntakeRow)
        .sort((left, right) => left.identity.projectionId.localeCompare(right.identity.projectionId));
      if (!same(snapshot.rows, expectedRows)
        || !same(snapshot.sourceVerification, sourceVerification(replayed))) {
        return fullSourceResult(false);
      }
      return fullSourceResult(true);
    }
    return structureOnlyResult(true);
  } catch {
    return fullSourceRequested ? fullSourceResult(false) : structureOnlyResult(false);
  }
}

function deltaMap(previous, current) {
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort();
  return Object.fromEntries(keys.map((key) => [key, (current[key] ?? 0) - (previous[key] ?? 0)]));
}

function missingnessCounts(snapshot) {
  if (snapshot === null) return {
    rows: 0, issueReferenceMissing: 0, pullRequestReferenceMissing: 0,
    fixCommitMissing: 0, independentOutcomeMissing: 0,
    exposureDenominatorMissing: 0, economicLossMissing: 0,
  };
  const robust = snapshot.rows.filter((row) =>
    row.rowKind === "ROS_BUG_FIX_MECHANISM_TAXONOMY");
  return {
    rows: snapshot.rows.length,
    issueReferenceMissing: robust.filter((row) => row.missingness.issueReferenceMissing).length,
    pullRequestReferenceMissing: robust.filter((row) =>
      row.missingness.pullRequestReferenceMissing).length,
    fixCommitMissing: robust.filter((row) => row.missingness.fixCommitMissing).length,
    independentOutcomeMissing: snapshot.rows.length,
    exposureDenominatorMissing: snapshot.rows.length,
    economicLossMissing: snapshot.rows.length,
  };
}

export function buildWave5IntakeSnapshotDiff(previousSnapshot, currentSnapshot) {
  if (previousSnapshot !== null && !verifyWave5IntakeSnapshot(previousSnapshot).ok) {
    fail("DIFF_PREVIOUS_INVALID");
  }
  if (!verifyWave5IntakeSnapshot(currentSnapshot).ok) fail("DIFF_CURRENT_INVALID");
  if ((previousSnapshot?.snapshotHash ?? null) !== currentSnapshot.predecessorSnapshotHash) {
    fail("DIFF_PREDECESSOR_LINK_INVALID");
  }
  const previousRows = new Map((previousSnapshot?.rows ?? []).map((row) =>
    [row.identity.projectionId, row]));
  const currentRows = new Map(currentSnapshot.rows.map((row) =>
    [row.identity.projectionId, row]));
  const ids = [...new Set([...previousRows.keys(), ...currentRows.keys()])].sort();
  const added = [], removed = [], changed = [], unchanged = [];
  for (const id of ids) {
    const before = previousRows.get(id), after = currentRows.get(id);
    if (!before) added.push(id);
    else if (!after) removed.push(id);
    else if (before.rowHash !== after.rowHash) changed.push({ projectionId: id,
      previousRowHash: before.rowHash, currentRowHash: after.rowHash });
    else unchanged.push(id);
  }
  const previousSources = new Map((previousSnapshot?.sources ?? []).map((source) =>
    [source.sourceKind, source]));
  const currentSources = new Map(currentSnapshot.sources.map((source) =>
    [source.sourceKind, source]));
  const sourceKinds = [...new Set([...previousSources.keys(), ...currentSources.keys()])].sort();
  const sourceChanges = sourceKinds.map((sourceKind) => {
    const before = previousSources.get(sourceKind), after = currentSources.get(sourceKind);
    return { sourceKind, change: !before ? "ADDED" : !after ? "REMOVED"
      : before.revision !== after.revision ? "REVISION_CHANGED"
        : before.sourceRecordSetHash !== after.sourceRecordSetHash ? "RECORD_SET_CHANGED"
          : !same(before.rights, after.rights) ? "RIGHTS_CHANGED"
            : before.selectionRule !== after.selectionRule ? "SELECTION_CHANGED" : "UNCHANGED" };
  });
  const body = {
    schema: WAVE5_INTAKE_SCHEMAS.diff,
    previousSnapshotHash: previousSnapshot?.snapshotHash ?? null,
    currentSnapshotHash: currentSnapshot.snapshotHash,
    changes: {
      counts: { added: added.length, removed: removed.length, changed: changed.length,
        unchanged: unchanged.length },
      addedProjectionIds: added,
      removedProjectionIds: removed,
      changed,
      unchangedProjectionIds: unchanged,
    },
    sourceChanges,
    rowKindDelta: deltaMap(previousSnapshot === null ? {}
      : frequency(previousSnapshot.rows, (row) => row.rowKind),
    frequency(currentSnapshot.rows, (row) => row.rowKind)),
    missingnessDelta: deltaMap(missingnessCounts(previousSnapshot),
      missingnessCounts(currentSnapshot)),
    disposition: "SOURCE_DISCOVERY_AND_TAXONOMY_REVIEW_ONLY",
    automaticPromotion: false,
    boundary: boundary(),
  };
  return seal(body, "diffHash", "outsider/wave5-intake/diff/v1");
}

export function verifyWave5IntakeSnapshotDiff(diff, previousSnapshot, currentSnapshot) {
  try {
    if (!verifySeal(diff, "diffHash", "outsider/wave5-intake/diff/v1")
      || !exactKeys(diff, ["schema", "previousSnapshotHash", "currentSnapshotHash",
        "changes", "sourceChanges", "rowKindDelta", "missingnessDelta", "disposition",
        "automaticPromotion", "boundary", "diffHash"])
      || diff.schema !== WAVE5_INTAKE_SCHEMAS.diff
      || diff.disposition !== "SOURCE_DISCOVERY_AND_TAXONOMY_REVIEW_ONLY"
      || diff.automaticPromotion !== false || !same(diff.boundary, boundary())) {
      return structureOnlyResult(false);
    }
    const expected = buildWave5IntakeSnapshotDiff(previousSnapshot, currentSnapshot);
    return structureOnlyResult(same(diff, expected));
  } catch { return structureOnlyResult(false); }
}

function fsyncDirectory(directory) {
  let descriptor;
  try { descriptor = openSync(directory, "r"); fsyncSync(descriptor); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
function canonicalBytes(value) { return Buffer.from(`${canonicalizeStrict(value)}\n`); }
function atomicJson(file, value, { exclusive = false } = {}) {
  const directory = path.dirname(file);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory,
    `.${path.basename(file)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  const bytes = canonicalBytes(value);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor); descriptor = undefined;
    if (exclusive && existsSync(file)) fail("ATOMIC_TARGET_EXISTS", file);
    renameSync(temporary, file);
    fsyncDirectory(directory);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}
function readCanonicalJson(file, code) {
  let bytes;
  try { bytes = readFileSync(file); } catch { fail(`${code}_MISSING`); }
  if (bytes.length < 2 || bytes.length > 64 * 1024 * 1024
    || bytes.at(-1) !== 0x0a) fail(`${code}_BYTES_INVALID`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  if (!bytes.equals(canonicalBytes(value))) fail(`${code}_NON_CANONICAL`);
  return value;
}
function parseEvents(file) {
  const text = readFileSync(file, "utf8");
  if (text === "") return [];
  if (!text.endsWith("\n")) fail("EVENT_LOG_PARTIAL_TAIL");
  return text.slice(0, -1).split("\n").map((line, index) => {
    let value;
    try { value = JSON.parse(line); } catch { fail("EVENT_LOG_JSON_INVALID", index); }
    if (canonicalizeStrict(value) !== line) fail("EVENT_LOG_NON_CANONICAL", index);
    return value;
  });
}
function appendEvent(file, event) {
  const descriptor = openSync(file, "a", 0o600);
  try { writeSync(descriptor, `${canonicalizeStrict(event)}\n`); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  fsyncDirectory(path.dirname(file));
}
function stateBody({ registryId, revision, createdAt, updatedAt,
  headSnapshotHash, eventHeadHash }) {
  return { schema: WAVE5_INTAKE_SCHEMAS.registryState, registryId, revision,
    createdAt, updatedAt, headSnapshotHash, eventHeadHash, snapshotCount: revision,
    rollbackResistance: "LOCAL_CHAIN_PLUS_CALLER_HELD_EXPECTED_HEAD",
    externalCheckpointEstablished: false, boundary: boundary() };
}
function sealState(body) {
  return seal(body, "stateHash", "outsider/wave5-intake/registry-state/v1");
}
function eventBody({ registryId, sequence, recordedAt, previousEventHash,
  previousSnapshotHash, snapshotHash, diffHash }) {
  return { schema: WAVE5_INTAKE_SCHEMAS.registryEvent, registryId, sequence, recordedAt,
    previousEventHash, previousSnapshotHash, snapshotHash, diffHash,
    authority: "NONE", boundary: boundary() };
}
function sealEvent(body) {
  return seal(body, "eventHash", "outsider/wave5-intake/registry-event/v1");
}

export class DurableWave5IntakeRegistry {
  constructor({ directory, registryId = "outsider-wave5-intake",
    createdAt = PUBLIC_EVIDENCE_WAVE5_CANONICAL_GENERATED_AT } = {}) {
    if (typeof directory !== "string" || directory.length < 1 || !TOKEN.test(registryId)) {
      fail("REGISTRY_ARGUMENT_INVALID");
    }
    this.directory = path.resolve(directory);
    this.registryId = registryId;
    this.eventsFile = path.join(this.directory, "events.jsonl");
    this.stateFile = path.join(this.directory, "state.json");
    this.snapshotsDirectory = path.join(this.directory, "snapshots");
    this.diffsDirectory = path.join(this.directory, "diffs");
    this.lockFile = path.join(this.directory, ".write.lock");
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    mkdirSync(this.snapshotsDirectory, { recursive: true, mode: 0o700 });
    mkdirSync(this.diffsDirectory, { recursive: true, mode: 0o700 });
    for (const directoryPath of [this.directory, this.snapshotsDirectory,
      this.diffsDirectory]) {
      const stat = lstatSync(directoryPath);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail("REGISTRY_DIRECTORY_INVALID");
    }
    const present = [existsSync(this.eventsFile), existsSync(this.stateFile)];
    if (present.some(Boolean) && !present.every(Boolean)) fail("REGISTRY_PARTIAL_INITIALIZATION");
    if (!present[0]) {
      const time = canonicalTime(createdAt, "REGISTRY_CREATED_AT");
      const descriptor = openSync(this.eventsFile, "wx", 0o600);
      fsyncSync(descriptor); closeSync(descriptor);
      atomicJson(this.stateFile, sealState(stateBody({ registryId, revision: 0,
        createdAt: time, updatedAt: time, headSnapshotHash: null,
        eventHeadHash: null })), { exclusive: true });
    }
    const checked = this.verify();
    if (!checked.ok || checked.state.registryId !== registryId) fail("REGISTRY_INVALID");
  }

  snapshotPath(hash) {
    if (!HASH.test(hash ?? "")) fail("SNAPSHOT_HASH_INVALID");
    return path.join(this.snapshotsDirectory, `${hash.slice(7)}.json`);
  }
  diffPath(hash) {
    if (!HASH.test(hash ?? "")) fail("DIFF_HASH_INVALID");
    return path.join(this.diffsDirectory, `${hash.slice(7)}.json`);
  }
  #withLock(operation) {
    let descriptor;
    try {
      try { descriptor = openSync(this.lockFile, "wx", 0o600); }
      catch (error) { if (error?.code === "EEXIST") fail("REGISTRY_LOCKED"); throw error; }
      return operation();
    } finally {
      if (descriptor !== undefined) { closeSync(descriptor); unlinkSync(this.lockFile); }
    }
  }
  verify() {
    try {
      const state = readCanonicalJson(this.stateFile, "REGISTRY_STATE");
      if (!verifySeal(state, "stateHash", "outsider/wave5-intake/registry-state/v1")
        || !exactKeys(state, ["schema", "registryId", "revision", "createdAt", "updatedAt",
          "headSnapshotHash", "eventHeadHash", "snapshotCount", "rollbackResistance",
          "externalCheckpointEstablished", "boundary", "stateHash"])
        || state.schema !== WAVE5_INTAKE_SCHEMAS.registryState || !TOKEN.test(state.registryId)
        || !nonnegative(state.revision) || state.snapshotCount !== state.revision
        || canonicalTime(state.createdAt, "REGISTRY_CREATED_AT") !== state.createdAt
        || canonicalTime(state.updatedAt, "REGISTRY_UPDATED_AT") !== state.updatedAt
        || !verifyHashOrNull(state.headSnapshotHash) || !verifyHashOrNull(state.eventHeadHash)
        || state.rollbackResistance !== "LOCAL_CHAIN_PLUS_CALLER_HELD_EXPECTED_HEAD"
        || state.externalCheckpointEstablished !== false || !same(state.boundary, boundary())) {
        return registryStructureResult(false, { error: "STATE_INVALID" });
      }
      const events = parseEvents(this.eventsFile);
      if (events.length !== state.revision) {
        return registryStructureResult(false, { error: "EVENT_COUNT_MISMATCH" });
      }
      let previousEventHash = GENESIS;
      let previousSnapshot = null;
      const snapshotHashes = [], diffHashes = [];
      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        if (!verifySeal(event, "eventHash", "outsider/wave5-intake/registry-event/v1")
          || !exactKeys(event, ["schema", "registryId", "sequence", "recordedAt",
            "previousEventHash", "previousSnapshotHash", "snapshotHash", "diffHash",
            "authority", "boundary", "eventHash"])
          || event.schema !== WAVE5_INTAKE_SCHEMAS.registryEvent
          || event.registryId !== state.registryId || event.sequence !== index + 1
          || canonicalTime(event.recordedAt, "EVENT_TIME") !== event.recordedAt
          || event.previousEventHash !== previousEventHash
          || event.previousSnapshotHash !== (previousSnapshot?.snapshotHash ?? null)
          || event.authority !== "NONE" || !same(event.boundary, boundary())) {
          return registryStructureResult(false, { error: "EVENT_INVALID" });
        }
        const snapshot = readCanonicalJson(this.snapshotPath(event.snapshotHash), "SNAPSHOT");
        const diff = readCanonicalJson(this.diffPath(event.diffHash), "DIFF");
        if (snapshot.snapshotHash !== event.snapshotHash
          || !verifyWave5IntakeSnapshot(snapshot).ok
          || snapshot.predecessorSnapshotHash !== event.previousSnapshotHash
          || diff.diffHash !== event.diffHash
          || !verifyWave5IntakeSnapshotDiff(diff, previousSnapshot, snapshot).ok) {
          return registryStructureResult(false, { error: "ARTIFACT_CHAIN_INVALID" });
        }
        previousEventHash = event.eventHash;
        previousSnapshot = snapshot;
        snapshotHashes.push(event.snapshotHash);
        diffHashes.push(event.diffHash);
      }
      const expectedState = sealState(stateBody({ registryId: state.registryId,
        revision: events.length, createdAt: state.createdAt,
        updatedAt: events.at(-1)?.recordedAt ?? state.createdAt,
        headSnapshotHash: previousSnapshot?.snapshotHash ?? null,
        eventHeadHash: events.at(-1)?.eventHash ?? null }));
      if (!same(state, expectedState)) {
        return registryStructureResult(false, { error: "STATE_DERIVATION_MISMATCH" });
      }
      const snapshotFiles = readdirSync(this.snapshotsDirectory).sort();
      const diffFiles = readdirSync(this.diffsDirectory).sort();
      if (!same(snapshotFiles, snapshotHashes.map((hash) => `${hash.slice(7)}.json`).sort())
        || !same(diffFiles, diffHashes.map((hash) => `${hash.slice(7)}.json`).sort())) {
        return registryStructureResult(false, { error: "ARTIFACT_FILE_SET_MISMATCH" });
      }
      return registryStructureResult(true,
        { state, events, headSnapshot: previousSnapshot });
    } catch (error) {
      return registryStructureResult(false,
        { error: error instanceof Error ? error.message : String(error) });
    }
  }
  append(snapshot, options = {}) {
    if (!plain(options) || Object.keys(options).some((key) =>
      !["expectedHeadSnapshotHash", "recordedAt", "sourceDirectory"].includes(key))) {
      fail("APPEND_ARGUMENT_INVALID");
    }
    const { expectedHeadSnapshotHash,
      recordedAt = PUBLIC_EVIDENCE_WAVE5_CANONICAL_GENERATED_AT,
      sourceDirectory } = options;
    const sourceCheck = verifyWave5IntakeSnapshot(snapshot, { sourceDirectory });
    if (expectedHeadSnapshotHash === undefined
      || !verifyHashOrNull(expectedHeadSnapshotHash)
      || !sourceCheck.ok || sourceCheck.verificationLevel !== "FULL_SOURCE_REPLAY"
      || sourceCheck.sourceArtifactsReverified !== true) {
      fail("APPEND_ARGUMENT_INVALID");
    }
    return this.#withLock(() => {
      const current = this.verify();
      if (!current.ok) fail("REGISTRY_INVALID", current.error);
      if (current.state.headSnapshotHash !== expectedHeadSnapshotHash) {
        fail("COMPARE_AND_SWAP_HEAD_MISMATCH");
      }
      if (snapshot.predecessorSnapshotHash !== current.state.headSnapshotHash) {
        fail("SNAPSHOT_PREDECESSOR_MISMATCH");
      }
      const time = canonicalTime(recordedAt, "EVENT_TIME");
      if (Date.parse(time) < Date.parse(current.state.updatedAt)) fail("EVENT_TIME_REGRESSION");
      const diff = buildWave5IntakeSnapshotDiff(current.headSnapshot, snapshot);
      const snapshotFile = this.snapshotPath(snapshot.snapshotHash);
      const diffFile = this.diffPath(diff.diffHash);
      if (existsSync(snapshotFile) || existsSync(diffFile)) fail("CONTENT_ADDRESS_COLLISION");
      const event = sealEvent(eventBody({ registryId: this.registryId,
        sequence: current.events.length + 1, recordedAt: time,
        previousEventHash: current.events.at(-1)?.eventHash ?? GENESIS,
        previousSnapshotHash: current.state.headSnapshotHash,
        snapshotHash: snapshot.snapshotHash, diffHash: diff.diffHash }));
      atomicJson(snapshotFile, snapshot, { exclusive: true });
      atomicJson(diffFile, diff, { exclusive: true });
      appendEvent(this.eventsFile, event);
      const nextState = sealState(stateBody({ registryId: this.registryId,
        revision: event.sequence, createdAt: current.state.createdAt, updatedAt: time,
        headSnapshotHash: snapshot.snapshotHash, eventHeadHash: event.eventHash }));
      atomicJson(this.stateFile, nextState);
      const checked = this.verify();
      if (!checked.ok) fail("POST_APPEND_VERIFY_FAILED", checked.error);
      return { appended: true, snapshotHash: snapshot.snapshotHash, diffHash: diff.diffHash,
        eventHash: event.eventHash, stateHash: nextState.stateHash, revision: nextState.revision,
        admissionVerificationLevel: "FULL_SOURCE_REPLAY",
        sourceArtifactsReverifiedAtAdmission: true,
        admissionClaimIsNotStandaloneProof: true,
        boundary: boundary() };
    });
  }
}
