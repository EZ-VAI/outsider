/*
 * Non-additive bridge between the immutable Episode Data Engine v4 evidence
 * product and the frozen public-source catalog/profile.
 *
 * This module deliberately wraps rather than edits v4.  Public catalog
 * populations never become v4 source-ledger entries, model rows, evaluation
 * rows, denominators, authority, or causal-experience units.  The bridge makes
 * catalog coverage visible as an advisory, source-ID-only view and binds both
 * source-replayed products into one independently reproducible receipt.
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  EPISODE_DATA_ENGINE_RUN_RECEIPT_SCHEMA,
  EPISODE_DATA_ENGINE_SCHEMA,
  buildEpisodeDataEngineRunReceipt,
  evaluateEpisodeDataEngineFromSource,
  verifyEpisodeDataEngineRunReceipt,
} from "./outsider-episode-data-engine.js";
import {
  EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY,
  EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA,
  EPISODE_DATA_PUBLIC_SOURCE_SEGMENTS,
  verifyEpisodeDataPublicSourceCatalog,
} from "./outsider-episode-data-public-source-catalog.js";
import {
  EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID,
  buildFrozenEpisodeDataPublicSourceProfile,
  verifyFrozenEpisodeDataPublicSourceProfile,
} from "./outsider-episode-data-public-source-profile.js";
import {
  publishPrivateArtifact,
} from "./outsider-private-artifact-publication.js";
import {
  EPISODE_DATA_SEGMENTS,
  EPISODE_DATA_SOURCE_LEDGER_SCHEMA,
} from "./outsider-episode-data-source-ledger.js";

export const EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BUNDLE_SCHEMA =
  "outsider/episode-data-engine-public-source-bundle/v1";
export const EPISODE_DATA_ENGINE_PUBLIC_SOURCE_ENVELOPE_SCHEMA =
  "outsider/episode-data-engine-public-source-envelope/v1";
export const EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_RECEIPT_SCHEMA =
  "outsider/episode-data-engine-public-source-binding-receipt/v1";
export const EPISODE_DATA_ENGINE_PUBLIC_SOURCE_PUBLICATION_SCHEMA =
  "outsider/episode-data-engine-public-source-publication/v1";
export const EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES = Object.freeze({
  engineReport: "engine-report.json",
  engineRunReceipt: "engine-run-receipt.json",
  publicSourceCatalog: "public-source-catalog.json",
  bindingEnvelope: "binding-envelope.json",
  bindingReceipt: "run-receipt.json",
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const ENVELOPE_DOMAIN = EPISODE_DATA_ENGINE_PUBLIC_SOURCE_ENVELOPE_SCHEMA;
const RECEIPT_DOMAIN =
  EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_RECEIPT_SCHEMA;
const SOURCE_RECEIPT_SET_DOMAIN =
  "outsider/episode-data-engine-public-source/source-receipt-set/v1";
const SOURCE_ARTIFACT_SET_DOMAIN =
  "outsider/episode-data-engine-public-source/source-artifact-set/v1";
const DISCOVERY_SCOPE_SET_DOMAIN =
  "outsider/episode-data-engine-public-source/discovery-scope-set/v1";
const COVERAGE_BRIDGE_DOMAIN =
  "outsider/episode-data-engine-public-source/coverage-bridge/v1";
const USE_BOUNDARY_DOMAIN =
  "outsider/episode-data-engine-public-source/use-boundary/v1";
const IMPLEMENTATION_CLOSURE_DOMAIN =
  "outsider/episode-data-engine-public-source/implementation-closure/v1";
const ACTUAL_PUBLICATION_FILE_SET_DOMAIN =
  "outsider/episode-data-engine-public-source/actual-publication-file-set/v1";

const NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const DIRECTORY = constants.O_DIRECTORY ?? 0;
const PUBLICATION_FILE_ORDER = Object.freeze([
  "engineReport", "engineRunReceipt", "publicSourceCatalog",
  "bindingEnvelope", "bindingReceipt",
]);
const PUBLICATION_SERIALIZATION_BY_ROLE = Object.freeze({
  engineReport: "PRETTY_JSON_2_SPACE_LF",
  engineRunReceipt: "PRETTY_JSON_2_SPACE_LF",
  publicSourceCatalog: "CANONICAL_JSON_LF",
  bindingEnvelope: "CANONICAL_JSON_LF",
  bindingReceipt: "CANONICAL_JSON_LF",
});

const ENGINE_DIRECTORY_KEYS = Object.freeze([
  "sourceDirectory",
  "artifactDirectory",
  "cuaArtifactDirectory",
  "rebootArtifactDirectory",
  "rebootSourceDirectory",
  "sentinelArtifactDirectory",
  "staleConstraintArtifactDirectory",
]);

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(value, domain) {
  return sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function prettyBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(code, detail = null) {
  throw new Error(detail === null
    ? `EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_${code}`
    : `EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_${code}:${detail}`);
}

const BINDING_MODULE_FILE_HASH = sha256(readFileSync(new URL(import.meta.url)));
const PROFILE_MODULE_FILE_HASH = sha256(readFileSync(new URL(
  "./outsider-episode-data-public-source-profile.js", import.meta.url)));
const CATALOG_MODULE_FILE_HASH = sha256(readFileSync(new URL(
  "./outsider-episode-data-public-source-catalog.js", import.meta.url)));
const CANONICAL_MODULE_FILE_HASH = sha256(readFileSync(new URL(
  "./canonical.js", import.meta.url)));
const PRIVATE_PUBLICATION_MODULE_FILE_HASH = sha256(readFileSync(new URL(
  "./outsider-private-artifact-publication.js", import.meta.url)));

function exactKeys(value, expected) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && same(Object.keys(value).sort(), [...expected].sort());
}

function engineDirectories(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    fail("OPTIONS_REQUIRED");
  }
  const result = {};
  for (const key of ENGINE_DIRECTORY_KEYS) {
    if (typeof options[key] !== "string" || options[key].length === 0) {
      fail("ENGINE_SOURCE_DIRECTORY_REQUIRED", key);
    }
    result[key] = options[key];
  }
  return result;
}

function publicWorkspace(options) {
  if (typeof options?.publicSourceWorkspaceRoot !== "string"
    || options.publicSourceWorkspaceRoot.length === 0) {
    fail("PUBLIC_SOURCE_WORKSPACE_ROOT_REQUIRED");
  }
  return options.publicSourceWorkspaceRoot;
}

function validateEnginePair(report, receipt) {
  if (!report || report.schema !== EPISODE_DATA_ENGINE_SCHEMA
    || report.schemaVersion !== "4.0.0" || !HASH.test(report.reportHash ?? "")
    || report.sourceLedger?.schema !== EPISODE_DATA_SOURCE_LEDGER_SCHEMA
    || !HASH.test(report.sourceLedger?.ledgerHash ?? "")
    || report.sourceTrust?.sourceLedgerHash !== report.sourceLedger.ledgerHash
    || !receipt || receipt.schema !== EPISODE_DATA_ENGINE_RUN_RECEIPT_SCHEMA
    || receipt.schemaVersion !== "4.0.0" || !HASH.test(receipt.receiptHash ?? "")) {
    fail("ENGINE_V4_PAIR_INVALID");
  }
  const rebuilt = buildEpisodeDataEngineRunReceipt(report);
  if (!same(rebuilt, receipt)
    || receipt.input.sourceLedgerHash !== report.sourceLedger.ledgerHash
    || receipt.input.unifiedSourceSetHash
      !== report.sourceTrust.unifiedSourceSetHash
    || receipt.output.reportHash !== report.reportHash) {
    fail("ENGINE_V4_RECEIPT_BINDING_INVALID");
  }
  if (EPISODE_DATA_SEGMENTS.includes("intervention")) {
    fail("LEGACY_SEGMENT_ENUM_UNEXPECTEDLY_CONTAINS_INTERVENTION");
  }
}

function validateCatalog(catalog) {
  if (!catalog || catalog.schema !== EPISODE_DATA_PUBLIC_SOURCE_CATALOG_SCHEMA
    || !HASH.test(catalog.catalogHash ?? "")
    || !Array.isArray(catalog.sources) || catalog.sources.length === 0
    || !Array.isArray(catalog.discovery?.scopes)
    || catalog.discovery.scopes.length === 0) {
    fail("PUBLIC_SOURCE_CATALOG_INVALID");
  }
  const checked = verifyEpisodeDataPublicSourceCatalog(catalog, {
    discoveryScopes: catalog.discovery.scopes,
    sources: catalog.sources,
  });
  if (!checked.ok || checked.catalogHash !== catalog.catalogHash) {
    fail("PUBLIC_SOURCE_CATALOG_REPRODUCTION_INVALID", checked.error ?? null);
  }
  if (checked.sourceReplayEstablished !== false
    || checked.attestationTrustBoundary
      !== EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY
    || catalog.sourceSummary?.allArtifactAttestationsStructurallyBound !== true
    || catalog.sourceSummary?.sourceReplayTrustEstablishedByCatalogAlone !== false
    || !Number.isSafeInteger(
      catalog.sourceSummary?.nonDuplicateLedgerEntryCount)
    || !catalog.sourceSummary?.ledgerEntryPhysicalityCounts
    || !catalog.sourceSummary?.nonDuplicateLedgerEntryPhysicalityCounts) {
    fail("PUBLIC_SOURCE_CATALOG_TRUST_BOUNDARY_INVALID");
  }
  if (catalog.populationRegistry?.crossPopulationTotal !== null
    || catalog.populationRegistry?.crossPopulationAdditionProhibited !== true
    || catalog.populationRegistry?.crossSourceDisjointnessEstablished !== false
    || catalog.segmentCoverage?.completeEpisodeIntersectionCount !== 0
    || catalog.segmentCoverage?.completeEpisodeIntersectionEstablished !== false
    || catalog.segmentCoverage?.crossSegmentAdditionProhibited !== true
    || catalog.discovery?.sourceUniverseExhausted !== false
    || catalog.discovery?.undiscoveredSourcesRuledOut !== false
    || catalog.discovery?.globalExhaustion !== false
    || catalog.useBoundary?.authorizedTrainingSources !== 0
    || catalog.useBoundary?.productionTrainingRows !== 0
    || catalog.useBoundary?.networkAdmissionSources !== 0
    || catalog.useBoundary?.delegationAuthoritySources !== 0
    || catalog.useBoundary?.actionAuthorityUnits !== 0
    || catalog.useBoundary?.causalExperienceUnits !== 0
    || catalog.useBoundary?.closureCredit !== 0
    || catalog.useBoundary?.pricingAuthorized !== false
    || catalog.useBoundary?.guaranteeAuthorized !== false
    || catalog.useBoundary?.settlementAuthorized !== false
    || catalog.populationRegistry?.analyticPopulationFromCatalogSumEstablished
      !== false) {
    fail("PUBLIC_SOURCE_CATALOG_BOUNDARY_INVALID");
  }
  if (!same(Object.keys(catalog.segmentCoverage.segments).sort(),
    [...EPISODE_DATA_PUBLIC_SOURCE_SEGMENTS].sort())
    || !EPISODE_DATA_PUBLIC_SOURCE_SEGMENTS.includes("intervention")) {
    fail("PUBLIC_SOURCE_SEGMENT_SET_INVALID");
  }
  for (const source of catalog.sources) {
    if (source.verification?.attestationStructurallyAccepted !== true
      || source.verification.attestationTrustBoundary
        !== EPISODE_DATA_PUBLIC_SOURCE_ATTESTATION_TRUST_BOUNDARY
      || source.verification.artifactHash !== source.artifact?.artifactHash
      || source.verification.sourceBindingHash
        !== source.artifact?.sourceBindingHash
      || source.verification.sourceBindingKind
        !== source.artifact?.sourceBindingKind
      || source.clearances?.rights?.productionTrainingAuthorized !== false
      || source.clearances?.use?.authorizedTrainingAllowed !== false
      || source.clearances?.use?.networkAdmissionAllowed !== false
      || source.clearances?.use?.delegationAuthorityAllowed !== false) {
      fail("PUBLIC_SOURCE_RECEIPT_OR_USE_BINDING_INVALID", source.sourceId);
    }
    for (const segment of Object.values(source.segments)) {
      if (segment.crossAttributionAdditionPermitted !== false
        || segment.additiveTotal !== null) {
        fail("PUBLIC_SOURCE_SEGMENT_ADDITION_BOUNDARY_INVALID", source.sourceId);
      }
    }
  }
}

function sourceVerificationReceiptSet(catalog) {
  return catalog.sources.map((source) => ({
    sourceId: source.sourceId,
    receipt: structuredClone(source.verification),
  })).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function sourceArtifactSet(catalog) {
  return catalog.sources.map((source) => ({
    sourceId: source.sourceId,
    directoryBasename: source.artifact.directoryBasename,
    reportRelativePath: source.artifact.reportRelativePath,
    reportSchema: source.artifact.reportSchema,
    reportFileSha256: source.artifact.reportFileSha256,
    artifactHash: source.artifact.artifactHash,
    sourceBindingHash: source.artifact.sourceBindingHash,
    sourceBindingKind: source.artifact.sourceBindingKind,
  })).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function discoveryScopeSet(catalog) {
  return [...catalog.discovery.scopes].map((scope) => ({
    scopeId: scope.scopeId,
    channel: scope.channel,
    queryOrDeclaration: scope.queryOrDeclaration,
    cutoff: scope.cutoff,
    evidenceHash: scope.evidenceHash,
    candidateCount: scope.candidateCount,
    terminalCount: scope.terminalCount,
    declaredScopeExhausted: scope.declaredScopeExhausted,
    sourceUniverseExhausted: scope.sourceUniverseExhausted,
    globalExhaustion: scope.globalExhaustion,
  })).sort((left, right) => left.scopeId.localeCompare(right.scopeId));
}

function buildCoverageBridge(catalog) {
  const segments = Object.fromEntries(EPISODE_DATA_PUBLIC_SOURCE_SEGMENTS.map(
    (segmentId) => {
      const source = catalog.segmentCoverage.segments[segmentId];
      const legacySegmentId = EPISODE_DATA_SEGMENTS.includes(segmentId)
        ? segmentId : null;
      return [segmentId, {
        legacySegmentId,
        mapping: legacySegmentId === null
          ? "CATALOG_ONLY_ADDITIONAL_SEGMENT"
          : "ADVISORY_SAME_NAME_NO_COUNT_UNION",
        catalogSourceNativeSourceIds: sorted(source.sourceNativeSourceIds),
        catalogIndependentSourceIds: sorted(source.independentSourceIds),
        catalogSourceNativeCrossSourceTotal: null,
        catalogIndependentCrossSourceTotal: null,
        addToLegacySourceNativeCount: false,
        addToLegacyIndependentCount: false,
        closesLegacyGap: false,
        changesLegacyEvaluation: false,
        changesLegacyControlPlane: false,
      }];
    }));
  if (segments.intervention.legacySegmentId !== null
    || segments.intervention.mapping !== "CATALOG_ONLY_ADDITIONAL_SEGMENT") {
    fail("INTERVENTION_MAPPING_INVALID");
  }
  const body = {
    mode: "ADVISORY_SOURCE_ID_PRESENCE_ONLY",
    segmentOrder: [...EPISODE_DATA_PUBLIC_SOURCE_SEGMENTS],
    catalogOnlySegments: ["intervention"],
    segments,
    catalogCompleteEpisodeIntersectionCount:
      catalog.segmentCoverage.completeEpisodeIntersectionCount,
    catalogCompleteEpisodeIntersectionEstablished:
      catalog.segmentCoverage.completeEpisodeIntersectionEstablished,
    crossCatalogAndLedgerAdditionPermitted: false,
    crossSystemDisjointnessEstablished: false,
    legacySourceLedgerMutation: false,
    legacyGapTotalsMutation: false,
    automaticControlPlaneProjection: false,
  };
  return deepFreeze({ ...body,
    coverageBridgeHash: digest(body, COVERAGE_BRIDGE_DOMAIN) });
}

function semanticFirewall() {
  return {
    engineV4ReportMutated: false,
    engineV4RunReceiptMutated: false,
    legacySourceLedgerMutated: false,
    legacySourceLedgerEntriesAdded: 0,
    legacyCandidateRowsAdded: 0,
    legacySourceRecordsAdded: 0,
    legacyDenominatorUnitsAdded: 0,
    legacyIssueFinderRowsAdded: 0,
    offlineModelFitRowsAdded: 0,
    modelEvaluationRowsAdded: 0,
    offlineModelFitsAdded: 0,
    publisherLabelRowsPromotedToPseudoLabels: 0,
    pseudoLabelRowsAdded: 0,
    pseudoLabelingAuthorized: false,
    modelSelectionRowsAdded: 0,
    modelSelectionDecisionsAdded: 0,
    modelSelectionAuthorized: false,
    reviewQueueRowsAdded: 0,
    reviewQueuePriorityChanges: 0,
    reviewDispatchesAdded: 0,
    controlPlaneRowsAdded: 0,
    controlPlaneProjectionChanges: 0,
    controlPlaneMutationAuthorized: false,
    authorizedTrainingSourcesAdded: 0,
    authorizedTrainingRowsAdded: 0,
    authorizedTrainingJobsAdded: 0,
    productionTrainingRowsAdded: 0,
    productionModelsPromoted: 0,
    networkAdmissionSourcesAdded: 0,
    networkAdmissionRowsAdded: 0,
    networkProjectionRowsAdded: 0,
    delegationAuthoritySourcesAdded: 0,
    delegationAuthorityUnitsAdded: 0,
    actionAuthorityUnitsAdded: 0,
    causalExperienceUnitsAdded: 0,
    interventionRowsPromotedToAuthority: 0,
    interventionSourcesPromotedToAuthority: 0,
    interventionImpliesDelegationAuthority: false,
    interventionImpliesActionAuthority: false,
    closureCreditAdded: 0,
    actionAuthorized: false,
    automaticAcquisitionDispatched: false,
    priceAuthorized: false,
    guaranteeAuthorized: false,
    settlementAuthorized: false,
  };
}

function validateSemanticFirewall(catalog, coverageBridge, firewall) {
  for (const [field, value] of Object.entries(firewall)) {
    if ((typeof value === "number" && value !== 0)
      || (typeof value === "boolean" && value !== false)
      || (typeof value !== "number" && typeof value !== "boolean")) {
      fail("SEMANTIC_FIREWALL_NONZERO_OR_INVALID", field);
    }
  }
  const interventionIds = coverageBridge.segments.intervention
    .catalogSourceNativeSourceIds;
  const sourceById = new Map(catalog.sources.map((source) =>
    [source.sourceId, source]));
  if (interventionIds.some((sourceId) =>
    sourceById.get(sourceId)?.clearances?.use?.delegationAuthorityAllowed
      !== false
      || sourceById.get(sourceId)?.segments?.delegationAuthorization
        ?.sourceNativeCount !== 0
      || sourceById.get(sourceId)?.segments?.delegationAuthorization
        ?.independentCount !== 0)
    || catalog.segmentCoverage.segments.delegationAuthorization
      .sourceNativeSourceIds.length !== 0
    || catalog.segmentCoverage.segments.delegationAuthorization
      .independentSourceIds.length !== 0
    || catalog.sources.some((source) =>
      source.clearances.rights.productionTrainingAuthorized !== false
      || source.clearances.use.authorizedTrainingAllowed !== false
      || source.clearances.use.networkAdmissionAllowed !== false
      || source.clearances.use.delegationAuthorityAllowed !== false)
    || catalog.useBoundary.authorizedTrainingSources !== 0
    || catalog.useBoundary.productionTrainingRows !== 0
    || catalog.useBoundary.networkAdmissionSources !== 0
    || catalog.useBoundary.delegationAuthoritySources !== 0
    || catalog.useBoundary.actionAuthorityUnits !== 0
    || catalog.useBoundary.causalExperienceUnits !== 0
    || catalog.useBoundary.closureCredit !== 0
    || catalog.useBoundary.pricingAuthorized !== false
    || catalog.useBoundary.guaranteeAuthorized !== false
    || catalog.useBoundary.settlementAuthorized !== false) {
    fail("SEMANTIC_FIREWALL_INVALID");
  }
}

function implementationClosure() {
  const body = {
    bindingImplementationHash: BINDING_MODULE_FILE_HASH,
    profileImplementationHash: PROFILE_MODULE_FILE_HASH,
    catalogImplementationHash: CATALOG_MODULE_FILE_HASH,
    canonicalImplementationHash: CANONICAL_MODULE_FILE_HASH,
    privateArtifactPublicationImplementationHash:
      PRIVATE_PUBLICATION_MODULE_FILE_HASH,
  };
  return deepFreeze({ ...body,
    implementationClosureHash: digest(body, IMPLEMENTATION_CLOSURE_DOMAIN) });
}

function publicProfileBinding(catalog) {
  const receipts = sourceVerificationReceiptSet(catalog);
  const artifacts = sourceArtifactSet(catalog);
  const scopes = discoveryScopeSet(catalog);
  return {
    profileId: EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID,
    catalogSchema: catalog.schema,
    catalogHash: catalog.catalogHash,
    catalogCanonicalFileSha256: sha256(canonicalBytes(catalog)),
    sourceCount: catalog.sourceSummary.sourceCount,
    populationEntryCount: catalog.populationRegistry.entryCount,
    discoveryScopeCount: catalog.discovery.scopeCount,
    exhaustedDeclaredScopeCount: catalog.discovery.exhaustedDeclaredScopeCount,
    allDeclaredScopesExhausted: catalog.discovery.allDeclaredScopesExhausted,
    sourceUniverseExhausted: false,
    globalExhaustion: false,
    genericCatalogVerificationEstablishesSourceReplay: false,
    fixedProfileWorkspaceRebuildRequired: true,
    allCatalogSourcesFullPayloadReplayEstablished: false,
    metadataOnlySourceIds: metadataOnlySourceIds(catalog),
    sourceVerificationReceiptSet: receipts,
    sourceVerificationReceiptSetRoot: digest(receipts,
      SOURCE_RECEIPT_SET_DOMAIN),
    sourceArtifactRootSet: artifacts,
    sourceArtifactRootSetRoot: digest(artifacts, SOURCE_ARTIFACT_SET_DOMAIN),
    discoveryScopeSet: scopes,
    discoveryScopeSetRoot: digest(scopes, DISCOVERY_SCOPE_SET_DOMAIN),
    catalogUseBoundaryHash: digest(catalog.useBoundary, USE_BOUNDARY_DOMAIN),
    profileImplementationHash: PROFILE_MODULE_FILE_HASH,
    catalogImplementationHash: CATALOG_MODULE_FILE_HASH,
    bindingImplementationHash: BINDING_MODULE_FILE_HASH,
    canonicalImplementationHash: CANONICAL_MODULE_FILE_HASH,
    privateArtifactPublicationImplementationHash:
      PRIVATE_PUBLICATION_MODULE_FILE_HASH,
  };
}

function buildEnvelope(engineReport, engineRunReceipt, catalog) {
  validateEnginePair(engineReport, engineRunReceipt);
  validateCatalog(catalog);
  const coverageBridge = buildCoverageBridge(catalog);
  const firewall = semanticFirewall();
  validateSemanticFirewall(catalog, coverageBridge, firewall);
  const closure = implementationClosure();
  const body = {
    schema: EPISODE_DATA_ENGINE_PUBLIC_SOURCE_ENVELOPE_SCHEMA,
    schemaVersion: "1.0.0",
    mode: "ENGINE_V4_IMMUTABLE_PLUS_PUBLIC_SOURCE_ADVISORY_BINDING",
    engine: {
      reportSchema: engineReport.schema,
      reportHash: engineReport.reportHash,
      reportPrettyFileSha256: sha256(prettyBytes(engineReport)),
      runReceiptSchema: engineRunReceipt.schema,
      runReceiptHash: engineRunReceipt.receiptHash,
      runReceiptPrettyFileSha256: sha256(prettyBytes(engineRunReceipt)),
      implementationHash: engineReport.engine.implementationHash,
      sourceLedgerSchema: engineReport.sourceLedger.schema,
      sourceLedgerHash: engineReport.sourceLedger.ledgerHash,
      legacyUnifiedSourceSetHash: engineReport.sourceTrust.unifiedSourceSetHash,
      legacySourceCount: engineReport.sourceLedger.sources.length,
      legacySourceRecordCount: engineReport.runSummary.sourceRecordsReplayed,
      legacyOfflineModelFitsPerformedInEngine:
        engineReport.runSummary.offlineModelFitsPerformedInEngine,
      legacyOfflineModelFitsReplayedFromVerifiedSupplements:
        engineReport.runSummary.offlineModelFitsReplayedFromVerifiedSupplements,
      legacyAuthorizedTrainingRows: engineReport.runSummary.authorizedTrainingRows,
      legacyProductionModelsPromoted:
        engineReport.runSummary.productionModelsPromoted,
    },
    publicSourceProfile: publicProfileBinding(catalog),
    coverageBridge,
    semanticFirewall: firewall,
    implementationClosure: closure,
  };
  return deepFreeze({ ...body, bindingHash: digest(body, ENVELOPE_DOMAIN) });
}

function publicationPayloadBytes(engineReport, engineRunReceipt, catalog,
  envelope) {
  return {
    engineReport: prettyBytes(engineReport),
    engineRunReceipt: prettyBytes(engineRunReceipt),
    publicSourceCatalog: canonicalBytes(catalog),
    bindingEnvelope: canonicalBytes(envelope),
  };
}

function buildPublicationManifest(engineReport, engineRunReceipt, catalog,
  envelope) {
  const payloads = publicationPayloadBytes(engineReport, engineRunReceipt,
    catalog, envelope);
  const files = PUBLICATION_FILE_ORDER.map((role) => role === "bindingReceipt"
    ? {
      role,
      fileName: EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role],
      serialization: PUBLICATION_SERIALIZATION_BY_ROLE[role],
      sizeBytes: null,
      sha256: null,
      fileHashBoundByBindingReceipt: false,
    }
    : {
      role,
      fileName: EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role],
      serialization: PUBLICATION_SERIALIZATION_BY_ROLE[role],
      sizeBytes: payloads[role].length,
      sha256: sha256(payloads[role]),
      fileHashBoundByBindingReceipt: true,
    });
  return deepFreeze({
    schema: EPISODE_DATA_ENGINE_PUBLIC_SOURCE_PUBLICATION_SCHEMA,
    expectedDirectoryMode: "0700",
    expectedFileMode: "0600",
    exactFileSetRequired: true,
    extraFilesAllowed: false,
    symlinksAllowed: false,
    noClobber: true,
    expectedFileCount: PUBLICATION_FILE_ORDER.length,
    publicationOrder: PUBLICATION_FILE_ORDER.map((role) =>
      EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role]),
    receiptFileName:
      EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES.bindingReceipt,
    receiptWrittenLast: true,
    receiptFileSelfHashEmbedded: false,
    files,
  });
}

function buildBindingReceipt(engineReport, engineRunReceipt, catalog, envelope) {
  const body = {
    schema: EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_RECEIPT_SCHEMA,
    schemaVersion: "1.0.0",
    engineReportHash: engineReport.reportHash,
    engineReportPrettyFileSha256: sha256(prettyBytes(engineReport)),
    engineRunReceiptHash: engineRunReceipt.receiptHash,
    engineRunReceiptPrettyFileSha256: sha256(prettyBytes(engineRunReceipt)),
    sourceLedgerHash: engineReport.sourceLedger.ledgerHash,
    legacyUnifiedSourceSetHash: engineReport.sourceTrust.unifiedSourceSetHash,
    profileId: EPISODE_DATA_PUBLIC_SOURCE_PROFILE_ID,
    catalogHash: catalog.catalogHash,
    catalogCanonicalFileSha256: sha256(canonicalBytes(catalog)),
    sourceVerificationReceiptSetRoot:
      envelope.publicSourceProfile.sourceVerificationReceiptSetRoot,
    sourceArtifactRootSetRoot:
      envelope.publicSourceProfile.sourceArtifactRootSetRoot,
    discoveryScopeSetRoot:
      envelope.publicSourceProfile.discoveryScopeSetRoot,
    catalogUseBoundaryHash:
      envelope.publicSourceProfile.catalogUseBoundaryHash,
    coverageBridgeHash: envelope.coverageBridge.coverageBridgeHash,
    implementationClosureHash:
      envelope.implementationClosure.implementationClosureHash,
    bindingHash: envelope.bindingHash,
    envelopeCanonicalFileSha256: sha256(canonicalBytes(envelope)),
    semanticFirewall: semanticFirewall(),
    publication: buildPublicationManifest(engineReport, engineRunReceipt,
      catalog, envelope),
    receiptWrittenLastRequiredForPublication: true,
  };
  return deepFreeze({ ...body, receiptHash: digest(body, RECEIPT_DOMAIN) });
}

function buildBundle(engineReport, engineRunReceipt, catalog) {
  const envelope = buildEnvelope(engineReport, engineRunReceipt, catalog);
  const receipt = buildBindingReceipt(
    engineReport, engineRunReceipt, catalog, envelope);
  return deepFreeze({
    schema: EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BUNDLE_SCHEMA,
    engineReport,
    engineRunReceipt,
    publicSourceCatalog: catalog,
    envelope,
    receipt,
  });
}

function validateBundleShape(bundle) {
  if (!exactKeys(bundle, [
    "schema", "engineReport", "engineRunReceipt", "publicSourceCatalog",
    "envelope", "receipt",
  ]) || bundle.schema !== EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BUNDLE_SCHEMA
    || bundle.envelope?.schema
      !== EPISODE_DATA_ENGINE_PUBLIC_SOURCE_ENVELOPE_SCHEMA
    || bundle.receipt?.schema
      !== EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_RECEIPT_SCHEMA) {
    fail("BUNDLE_SHAPE_INVALID");
  }
}

function verifyStructure(bundle) {
  validateBundleShape(bundle);
  const rebuilt = buildBundle(bundle.engineReport, bundle.engineRunReceipt,
    bundle.publicSourceCatalog);
  if (!same(rebuilt, bundle)) fail("BUNDLE_REPRODUCTION_MISMATCH");
  return rebuilt;
}

function lstatOrNull(target) {
  try {
    return lstatSync(target, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function sameNode(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && (left.mode & 0o170000n) === (right.mode & 0o170000n);
}

function sameStableStat(left, right) {
  return sameNode(left, right) && left.mode === right.mode
    && left.size === right.size && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs && left.nlink === right.nlink;
}

function privateDirectorySnapshot(directory) {
  const target = path.resolve(directory);
  if (target === path.parse(target).root) fail("PUBLICATION_DIRECTORY_TOO_BROAD");
  const initial = lstatOrNull(target);
  if (!initial || initial.isSymbolicLink() || !initial.isDirectory()
    || (initial.mode & 0o7777n) !== 0o700n) {
    fail("PUBLICATION_DIRECTORY_INVALID", target);
  }
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | DIRECTORY | NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isDirectory() || !sameStableStat(initial, before)) {
      fail("PUBLICATION_DIRECTORY_IDENTITY_CHANGED", target);
    }
    const entries = readdirSync(target, { withFileTypes: true });
    const after = fstatSync(descriptor, { bigint: true });
    const final = lstatOrNull(target);
    if (!final || !sameStableStat(before, after)
      || !sameStableStat(before, final)) {
      fail("PUBLICATION_DIRECTORY_CHANGED_DURING_READ", target);
    }
    return { target, stat: after, entries };
  } finally {
    if (descriptor != null) closeSync(descriptor);
  }
}

function readPrivatePublicationFile(directory, fileName) {
  if (typeof fileName !== "string" || path.basename(fileName) !== fileName
    || fileName === "." || fileName === "..") {
    fail("PUBLICATION_FILE_NAME_INVALID", String(fileName));
  }
  const target = path.join(directory, fileName);
  const initial = lstatOrNull(target);
  if (!initial || initial.isSymbolicLink() || !initial.isFile()
    || (initial.mode & 0o7777n) !== 0o600n || initial.nlink !== 1n) {
    fail("PUBLICATION_FILE_INVALID", fileName);
  }
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || !sameStableStat(initial, before)) {
      fail("PUBLICATION_FILE_IDENTITY_CHANGED", fileName);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const final = lstatOrNull(target);
    if (!final || !sameStableStat(before, after)
      || !sameStableStat(before, final)) {
      fail("PUBLICATION_FILE_CHANGED_DURING_READ", fileName);
    }
    return { fileName, bytes, stat: after, sha256: sha256(bytes) };
  } finally {
    if (descriptor != null) closeSync(descriptor);
  }
}

function parseJsonFile(file) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    return JSON.parse(text);
  } catch {
    fail("PUBLICATION_JSON_INVALID", file.fileName);
  }
}

function validatePublicationManifest(receipt) {
  const publication = receipt?.publication;
  if (!exactKeys(publication, [
    "schema", "expectedDirectoryMode", "expectedFileMode",
    "exactFileSetRequired", "extraFilesAllowed", "symlinksAllowed",
    "noClobber", "expectedFileCount", "publicationOrder",
    "receiptFileName", "receiptWrittenLast", "receiptFileSelfHashEmbedded",
    "files",
  ]) || publication.schema
      !== EPISODE_DATA_ENGINE_PUBLIC_SOURCE_PUBLICATION_SCHEMA
    || publication.expectedDirectoryMode !== "0700"
    || publication.expectedFileMode !== "0600"
    || publication.exactFileSetRequired !== true
    || publication.extraFilesAllowed !== false
    || publication.symlinksAllowed !== false
    || publication.noClobber !== true
    || publication.expectedFileCount !== PUBLICATION_FILE_ORDER.length
    || publication.receiptFileName
      !== EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES.bindingReceipt
    || publication.receiptWrittenLast !== true
    || publication.receiptFileSelfHashEmbedded !== false
    || !same(publication.publicationOrder,
      PUBLICATION_FILE_ORDER.map((role) =>
        EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role]))
    || !Array.isArray(publication.files)
    || publication.files.length !== PUBLICATION_FILE_ORDER.length) {
    fail("PUBLICATION_MANIFEST_INVALID");
  }
  for (let index = 0; index < PUBLICATION_FILE_ORDER.length; index += 1) {
    const role = PUBLICATION_FILE_ORDER[index];
    const file = publication.files[index];
    if (!exactKeys(file, [
      "role", "fileName", "serialization", "sizeBytes", "sha256",
      "fileHashBoundByBindingReceipt",
    ]) || file.role !== role
      || file.fileName !== EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role]
      || file.serialization !== PUBLICATION_SERIALIZATION_BY_ROLE[role]) {
      fail("PUBLICATION_MANIFEST_FILE_INVALID", role);
    }
    if (role === "bindingReceipt") {
      if (file.sizeBytes !== null || file.sha256 !== null
        || file.fileHashBoundByBindingReceipt !== false) {
        fail("PUBLICATION_RECEIPT_SELF_REFERENCE_INVALID");
      }
    } else if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0
      || !HASH.test(file.sha256 ?? "")
      || file.fileHashBoundByBindingReceipt !== true) {
      fail("PUBLICATION_PAYLOAD_FILE_HASH_INVALID", role);
    }
  }
  return publication;
}

function readPublicationFiles(directory) {
  const before = privateDirectorySnapshot(directory);
  const actualNames = before.entries.map((entry) => entry.name).sort();
  const expectedNames = PUBLICATION_FILE_ORDER.map((role) =>
    EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role]).sort();
  if (!same(actualNames, expectedNames)
    || before.entries.some((entry) => !entry.isFile()
      || entry.isSymbolicLink())) {
    fail("PUBLICATION_EXACT_FILE_SET_INVALID");
  }
  const receiptFile = readPrivatePublicationFile(before.target,
    EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES.bindingReceipt);
  const receipt = parseJsonFile(receiptFile);
  if (!receipt || receipt.schema
      !== EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_RECEIPT_SCHEMA
    || receipt.schemaVersion !== "1.0.0"
    || !receipt.receiptWrittenLastRequiredForPublication
    || !serializeEpisodeDataEnginePublicSourceBindingReceipt(receipt)
      .equals(receiptFile.bytes)) {
    fail("PUBLICATION_RECEIPT_BYTES_INVALID");
  }
  const publication = validatePublicationManifest(receipt);
  const files = new Map([["bindingReceipt", receiptFile]]);
  for (const role of PUBLICATION_FILE_ORDER) {
    if (role === "bindingReceipt") continue;
    files.set(role, readPrivatePublicationFile(before.target,
      EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role]));
  }
  for (const expected of publication.files) {
    if (expected.role === "bindingReceipt") continue;
    const actual = files.get(expected.role);
    if (actual.bytes.length !== expected.sizeBytes
      || actual.sha256 !== expected.sha256) {
      fail("PUBLICATION_ACTUAL_FILE_HASH_MISMATCH", expected.role);
    }
    const parsed = parseJsonFile(actual);
    const serialized = expected.serialization === "PRETTY_JSON_2_SPACE_LF"
      ? prettyBytes(parsed) : canonicalBytes(parsed);
    if (!serialized.equals(actual.bytes)) {
      fail("PUBLICATION_DECLARED_SERIALIZATION_MISMATCH", expected.role);
    }
  }
  for (const [role, file] of files) {
    if (role === "bindingReceipt") continue;
    if (receiptFile.stat.mtimeNs < file.stat.mtimeNs
      || receiptFile.stat.ctimeNs < file.stat.ctimeNs) {
      fail("PUBLICATION_RECEIPT_TIMESTAMP_OLDER_THAN_PAYLOAD", role);
    }
  }
  const after = privateDirectorySnapshot(before.target);
  if (!sameStableStat(before.stat, after.stat)
    || !same(after.entries.map((entry) => entry.name).sort(), expectedNames)) {
    fail("PUBLICATION_DIRECTORY_CHANGED_DURING_VERIFICATION");
  }
  return { directory: before.target, directoryStat: before.stat, receipt,
    files };
}

function actualFileProjection(read) {
  return PUBLICATION_FILE_ORDER.map((role) => {
    const file = read.files.get(role);
    return {
      role,
      fileName: file.fileName,
      sizeBytes: file.bytes.length,
      sha256: file.sha256,
    };
  });
}

function actualFileSetHash(read) {
  return digest(actualFileProjection(read), ACTUAL_PUBLICATION_FILE_SET_DOMAIN);
}

function readPublishedBundleStructure(directory) {
  const read = readPublicationFiles(directory);
  const engineReport = parseJsonFile(read.files.get("engineReport"));
  const engineRunReceipt = parseJsonFile(read.files.get("engineRunReceipt"));
  const publicSourceCatalog = parseJsonFile(
    read.files.get("publicSourceCatalog"));
  const envelope = parseJsonFile(read.files.get("bindingEnvelope"));
  if (!prettyBytes(engineReport).equals(read.files.get("engineReport").bytes)
    || !prettyBytes(engineRunReceipt)
      .equals(read.files.get("engineRunReceipt").bytes)
    || !canonicalBytes(publicSourceCatalog)
      .equals(read.files.get("publicSourceCatalog").bytes)
    || !serializeEpisodeDataEnginePublicSourceEnvelope(envelope)
      .equals(read.files.get("bindingEnvelope").bytes)) {
    fail("PUBLICATION_PAYLOAD_SERIALIZATION_INVALID");
  }
  const bundle = {
    schema: EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BUNDLE_SCHEMA,
    engineReport,
    engineRunReceipt,
    publicSourceCatalog,
    envelope,
    receipt: read.receipt,
  };
  return { ...read, bundle: verifyStructure(bundle) };
}

function publicationOutput(options) {
  if (typeof options?.outputDirectory !== "string"
    || options.outputDirectory.length === 0
    || typeof options?.trustedRoot !== "string"
    || options.trustedRoot.length === 0) {
    fail("PUBLICATION_OUTPUT_OPTIONS_REQUIRED");
  }
  const outputDirectory = path.resolve(options.outputDirectory);
  const trustedRoot = path.resolve(options.trustedRoot);
  const rootStat = lstatOrNull(trustedRoot);
  if (trustedRoot === path.parse(trustedRoot).root || !rootStat
    || rootStat.isSymbolicLink() || !rootStat.isDirectory()
    || path.dirname(outputDirectory) !== trustedRoot) {
    fail("PUBLICATION_TRUSTED_ROOT_OR_OUTPUT_INVALID");
  }
  if (lstatOrNull(outputDirectory)) {
    fail("PUBLICATION_OUTPUT_DIRECTORY_EXISTS", outputDirectory);
  }
  return { outputDirectory, trustedRoot, trustedRootStat: rootStat };
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory,
      constants.O_RDONLY | DIRECTORY | NOFOLLOW);
    const status = fstatSync(descriptor, { bigint: true });
    if (!status.isDirectory()) fail("PUBLICATION_FSYNC_DIRECTORY_INVALID");
    fsyncSync(descriptor);
  } finally {
    if (descriptor != null) closeSync(descriptor);
  }
}

function assertClaimedPublicationDirectory(directory, claimed) {
  const current = lstatOrNull(directory);
  if (!current || current.isSymbolicLink() || !current.isDirectory()
    || !sameNode(current, claimed) || (current.mode & 0o7777n) !== 0o700n) {
    fail("PUBLICATION_OUTPUT_DIRECTORY_IDENTITY_CHANGED");
  }
}

function assertClaimedTrustedRoot(trustedRoot, claimed) {
  const current = lstatOrNull(trustedRoot);
  if (!current || current.isSymbolicLink() || !current.isDirectory()
    || !sameNode(current, claimed) || current.mode !== claimed.mode) {
    fail("PUBLICATION_TRUSTED_ROOT_IDENTITY_CHANGED");
  }
}

/**
 * Structural verification only.  This is useful for local diagnostics but is
 * deliberately not a trusted source verification result.
 */
export function verifyEpisodeDataEnginePublicSourceBundleStructure(bundle) {
  try {
    const rebuilt = verifyStructure(bundle);
    return deepFreeze({ ok: true, sourceReplayEstablished: false,
      bindingHash: rebuilt.envelope.bindingHash,
      receiptHash: rebuilt.receipt.receiptHash,
      engineReportHash: rebuilt.engineReport.reportHash,
      sourceLedgerHash: rebuilt.engineReport.sourceLedger.ledgerHash,
      catalogHash: rebuilt.publicSourceCatalog.catalogHash });
  } catch (error) {
    return deepFreeze({ ok: false, sourceReplayEstablished: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Receipt-to-actual-file verification only.  A coherently resealed directory
 * can pass this layer, so the result explicitly establishes no source replay.
 */
export function verifyEpisodeDataEnginePublicSourcePublicationFiles(directory) {
  try {
    const read = readPublicationFiles(directory);
    return deepFreeze({
      ok: true,
      receiptToActualFileByteBindingEstablished: true,
      declaredPayloadSerializationEstablished: true,
      completeBindingReceiptStructureEstablished: false,
      sourceReplayEstablished: false,
      receiptHash: read.receipt.receiptHash,
      receiptFileSha256: read.files.get("bindingReceipt").sha256,
      receiptTimestampOrderingEstablished: true,
      exactFileSetEstablished: true,
      actualFiles: actualFileProjection(read),
      actualFileSetHash: actualFileSetHash(read),
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      receiptToActualFileByteBindingEstablished: false,
      declaredPayloadSerializationEstablished: false,
      completeBindingReceiptStructureEstablished: false,
      receiptTimestampOrderingEstablished: false,
      sourceReplayEstablished: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Bundle-level structural verification from the exact private file set. */
export function verifyEpisodeDataEnginePublicSourceArtifactDirectoryStructure(
  directory,
) {
  try {
    const read = readPublishedBundleStructure(directory);
    return deepFreeze({
      ok: true,
      receiptToActualFileByteBindingEstablished: true,
      declaredPayloadSerializationEstablished: true,
      completeBindingReceiptStructureEstablished: true,
      bundleStructuralConsistencyEstablished: true,
      receiptTimestampOrderingEstablished: true,
      sourceReplayEstablished: false,
      bindingHash: read.bundle.envelope.bindingHash,
      receiptHash: read.bundle.receipt.receiptHash,
      engineReportHash: read.bundle.engineReport.reportHash,
      sourceLedgerHash: read.bundle.engineReport.sourceLedger.ledgerHash,
      catalogHash: read.bundle.publicSourceCatalog.catalogHash,
      receiptFileSha256: read.files.get("bindingReceipt").sha256,
      actualFiles: actualFileProjection(read),
      actualFileSetHash: actualFileSetHash(read),
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      receiptToActualFileByteBindingEstablished: false,
      declaredPayloadSerializationEstablished: false,
      completeBindingReceiptStructureEstablished: false,
      bundleStructuralConsistencyEstablished: false,
      receiptTimestampOrderingEstablished: false,
      sourceReplayEstablished: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Canonical integrated entrypoint.  Both products are rebuilt from their
 * source directories; caller-supplied report or catalog JSON is never used.
 */
export async function evaluateEpisodeDataEngineWithPublicSourceProfileFromSource(
  options = {},
) {
  const directories = engineDirectories(options);
  const workspaceRoot = publicWorkspace(options);
  const engineReport = await evaluateEpisodeDataEngineFromSource(directories);
  const engineRunReceipt = buildEpisodeDataEngineRunReceipt(engineReport);
  const publicSourceCatalog = buildFrozenEpisodeDataPublicSourceProfile({
    workspaceRoot,
  });
  return buildBundle(engineReport, engineRunReceipt, publicSourceCatalog);
}

/**
 * Full-source rebuild followed by private, no-clobber five-file publication.
 * The binding receipt is the final file written.  A partial claimed directory
 * is intentionally left in place on failure and is never resumed or replaced.
 */
export async function publishEpisodeDataEnginePublicSourceArtifactFromSource(
  options = {},
) {
  const publication = publicationOutput(options);
  const bundle = await
    evaluateEpisodeDataEngineWithPublicSourceProfileFromSource(options);
  assertClaimedTrustedRoot(publication.trustedRoot,
    publication.trustedRootStat);
  if (lstatOrNull(publication.outputDirectory)) {
    fail("PUBLICATION_OUTPUT_DIRECTORY_EXISTS_AFTER_REPLAY",
      publication.outputDirectory);
  }
  try {
    mkdirSync(publication.outputDirectory, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail("PUBLICATION_OUTPUT_DIRECTORY_EXISTS_AFTER_REPLAY",
        publication.outputDirectory);
    }
    throw error;
  }
  const claimed = lstatOrNull(publication.outputDirectory);
  if (!claimed || claimed.isSymbolicLink() || !claimed.isDirectory()
    || (claimed.mode & 0o7777n) !== 0o700n) {
    fail("PUBLICATION_OUTPUT_DIRECTORY_CLAIM_INVALID");
  }
  assertClaimedTrustedRoot(publication.trustedRoot,
    publication.trustedRootStat);
  fsyncDirectory(publication.trustedRoot);
  assertClaimedPublicationDirectory(publication.outputDirectory, claimed);
  const payloads = publicationPayloadBytes(bundle.engineReport,
    bundle.engineRunReceipt, bundle.publicSourceCatalog, bundle.envelope);
  for (const role of PUBLICATION_FILE_ORDER) {
    if (role === "bindingReceipt") continue;
    assertClaimedTrustedRoot(publication.trustedRoot,
      publication.trustedRootStat);
    assertClaimedPublicationDirectory(publication.outputDirectory, claimed);
    publishPrivateArtifact(path.join(publication.outputDirectory,
      EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role]), payloads[role], {
      trustedRoot: publication.trustedRoot,
      allowExistingIdentical: false,
    });
    const actual = readPrivatePublicationFile(publication.outputDirectory,
      EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES[role]);
    const expected = bundle.receipt.publication.files.find((file) =>
      file.role === role);
    if (actual.sha256 !== expected.sha256
      || actual.bytes.length !== expected.sizeBytes) {
      fail("PUBLICATION_POST_WRITE_HASH_MISMATCH", role);
    }
    assertClaimedTrustedRoot(publication.trustedRoot,
      publication.trustedRootStat);
    assertClaimedPublicationDirectory(publication.outputDirectory, claimed);
  }
  assertClaimedTrustedRoot(publication.trustedRoot,
    publication.trustedRootStat);
  assertClaimedPublicationDirectory(publication.outputDirectory, claimed);
  publishPrivateArtifact(path.join(publication.outputDirectory,
    EPISODE_DATA_ENGINE_PUBLIC_SOURCE_FILES.bindingReceipt),
  serializeEpisodeDataEnginePublicSourceBindingReceipt(bundle.receipt), {
    trustedRoot: publication.trustedRoot,
    allowExistingIdentical: false,
  });
  assertClaimedTrustedRoot(publication.trustedRoot,
    publication.trustedRootStat);
  assertClaimedPublicationDirectory(publication.outputDirectory, claimed);
  const checked = readPublishedBundleStructure(publication.outputDirectory);
  assertClaimedTrustedRoot(publication.trustedRoot,
    publication.trustedRootStat);
  assertClaimedPublicationDirectory(publication.outputDirectory, claimed);
  if (!same(checked.bundle, bundle)) {
    fail("PUBLICATION_POST_WRITE_BUNDLE_MISMATCH");
  }
  return deepFreeze({
    ok: true,
    outputDirectory: publication.outputDirectory,
    bundle,
    receiptFileSha256: checked.files.get("bindingReceipt").sha256,
    actualFiles: actualFileProjection(checked),
    actualFileSetHash: actualFileSetHash(checked),
    receiptWrittenLastEstablished: true,
    receiptTimestampOrderingEstablished: true,
    noClobber: true,
  });
}

function metadataOnlySourceIds(catalog) {
  const ids = catalog.sources.filter((source) =>
    source.verification.attestedPayloadReplay === false
      || source.verification.attestation?.replayClass === "METADATA_ONLY")
    .map((source) => source.sourceId).sort();
  for (const sourceId of ids) {
    const source = catalog.sources.find((item) => item.sourceId === sourceId);
    if (source.disposition !== "METADATA_ONLY"
      || source.verification.attestedPayloadReplay !== false
      || source.verification.attestation.replayClass !== "METADATA_ONLY") {
      fail("METADATA_ONLY_TRUST_RADIUS_INCONSISTENT", sourceId);
    }
  }
  return ids;
}

/**
 * Trusted verification: the v4 engine receipt is fully source-replayed and
 * the frozen public profile's declared verification radius is independently
 * rebuilt before the binding is accepted. Metadata-only catalog entries stay
 * explicit and prevent any aggregate full-payload-replay claim. A self-resealed
 * bundle without all source directories fails.
 */
export async function verifyEpisodeDataEnginePublicSourceEnvelope(
  bundle, options = {},
) {
  let engineFullSourceReplayEstablished = false;
  let fixedProfileWorkspaceRebuildEstablished = false;
  let declaredVerificationRadiusReplayEstablished = false;
  let metadataOnlyIds = [];
  try {
    validateBundleShape(bundle);
    const directories = engineDirectories(options);
    const workspaceRoot = publicWorkspace(options);
    verifyStructure(bundle);
    metadataOnlyIds = metadataOnlySourceIds(bundle.publicSourceCatalog);
    const engineChecked = await verifyEpisodeDataEngineRunReceipt(
      bundle.engineRunReceipt, bundle.engineReport, directories);
    if (!engineChecked.ok) {
      fail("ENGINE_V4_FULL_SOURCE_REPLAY_FAILED", engineChecked.error);
    }
    engineFullSourceReplayEstablished = true;
    const profileChecked = verifyFrozenEpisodeDataPublicSourceProfile(
      bundle.publicSourceCatalog, {
      workspaceRoot,
    });
    if (!profileChecked.ok
      || profileChecked.fixedProfileWorkspaceRebuildEstablished !== true
      || profileChecked.declaredVerificationRadiusReplayEstablished !== true
      || !same(profileChecked.metadataOnlySourceIds ?? [], metadataOnlyIds)
      || profileChecked.allCatalogSourcesFullPayloadReplayEstablished
        !== (metadataOnlyIds.length === 0)) {
      fail("PUBLIC_SOURCE_PROFILE_REPRODUCTION_MISMATCH",
        profileChecked.error ?? null);
    }
    fixedProfileWorkspaceRebuildEstablished = true;
    declaredVerificationRadiusReplayEstablished = true;
    const rebuilt = buildBundle(bundle.engineReport, bundle.engineRunReceipt,
      bundle.publicSourceCatalog);
    if (!same(rebuilt, bundle)) fail("BOUND_ENVELOPE_REPRODUCTION_MISMATCH");
    return deepFreeze({
      ok: true,
      engineFullSourceReplayEstablished,
      fixedProfileWorkspaceRebuildEstablished,
      declaredVerificationRadiusReplayEstablished,
      allCatalogSourcesFullPayloadReplayEstablished:
        profileChecked.allCatalogSourcesFullPayloadReplayEstablished,
      metadataOnlySourceIds: metadataOnlyIds,
      bindingHash: rebuilt.envelope.bindingHash,
      receiptHash: rebuilt.receipt.receiptHash,
      engineReportHash: rebuilt.engineReport.reportHash,
      engineRunReceiptHash: rebuilt.engineRunReceipt.receiptHash,
      sourceLedgerHash: rebuilt.engineReport.sourceLedger.ledgerHash,
      catalogHash: rebuilt.publicSourceCatalog.catalogHash,
      profileId: rebuilt.envelope.publicSourceProfile.profileId,
      sourceVerificationReceiptSetRoot:
        rebuilt.envelope.publicSourceProfile.sourceVerificationReceiptSetRoot,
      sourceArtifactRootSetRoot:
        rebuilt.envelope.publicSourceProfile.sourceArtifactRootSetRoot,
      discoveryScopeSetRoot:
        rebuilt.envelope.publicSourceProfile.discoveryScopeSetRoot,
      legacySourceLedgerEntriesAdded: 0,
      modelFitRowsAdded: 0,
      modelEvaluationRowsAdded: 0,
      authorizedTrainingSourcesAdded: 0,
      authorizedTrainingRowsAdded: 0,
      productionTrainingRowsAdded: 0,
      networkAdmissionSourcesAdded: 0,
      networkAdmissionRowsAdded: 0,
      delegationAuthoritySourcesAdded: 0,
      delegationAuthorityUnitsAdded: 0,
      actionAuthorityUnitsAdded: 0,
      causalExperienceUnitsAdded: 0,
    });
  } catch (error) {
    return deepFreeze({ ok: false,
      engineFullSourceReplayEstablished,
      fixedProfileWorkspaceRebuildEstablished,
      declaredVerificationRadiusReplayEstablished,
      allCatalogSourcesFullPayloadReplayEstablished: false,
      metadataOnlySourceIds: metadataOnlyIds,
      legacySourceLedgerEntriesAdded: 0,
      modelFitRowsAdded: 0,
      modelEvaluationRowsAdded: 0,
      authorizedTrainingSourcesAdded: 0,
      authorizedTrainingRowsAdded: 0,
      productionTrainingRowsAdded: 0,
      networkAdmissionSourcesAdded: 0,
      networkAdmissionRowsAdded: 0,
      delegationAuthoritySourcesAdded: 0,
      delegationAuthorityUnitsAdded: 0,
      actionAuthorityUnitsAdded: 0,
      causalExperienceUnitsAdded: 0,
      error: error instanceof Error ? error.message : String(error) });
  }
}

/** Exact private directory verification followed by both trusted replays. */
export async function verifyEpisodeDataEnginePublicSourceArtifactDirectory(
  directory, options = {},
) {
  try {
    const read = readPublishedBundleStructure(directory);
    const initialFileSetHash = actualFileSetHash(read);
    const trusted = await verifyEpisodeDataEnginePublicSourceEnvelope(
      read.bundle, options);
    const current = readPublishedBundleStructure(directory);
    if (!sameStableStat(read.directoryStat, current.directoryStat)
      || initialFileSetHash !== actualFileSetHash(current)
      || !same(read.bundle, current.bundle)) {
      fail("PUBLICATION_CHANGED_DURING_TRUSTED_REPLAY");
    }
    return deepFreeze({
      ...trusted,
      receiptToActualFileByteBindingEstablished: true,
      declaredPayloadSerializationEstablished: true,
      completeBindingReceiptStructureEstablished: true,
      bundleStructuralConsistencyEstablished: true,
      exactFileSetEstablished: true,
      receiptTimestampOrderingEstablished: true,
      receiptFileSha256: current.files.get("bindingReceipt").sha256,
      actualFiles: actualFileProjection(current),
      actualFileSetHash: actualFileSetHash(current),
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      engineFullSourceReplayEstablished: false,
      fixedProfileWorkspaceRebuildEstablished: false,
      declaredVerificationRadiusReplayEstablished: false,
      allCatalogSourcesFullPayloadReplayEstablished: false,
      metadataOnlySourceIds: [],
      receiptToActualFileByteBindingEstablished: false,
      declaredPayloadSerializationEstablished: false,
      completeBindingReceiptStructureEstablished: false,
      bundleStructuralConsistencyEstablished: false,
      exactFileSetEstablished: false,
      receiptTimestampOrderingEstablished: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function serializeEpisodeDataEnginePublicSourceEnvelope(value) {
  if (!value || value.schema !== EPISODE_DATA_ENGINE_PUBLIC_SOURCE_ENVELOPE_SCHEMA) {
    fail("ENVELOPE_SERIALIZATION_REFUSED");
  }
  const { bindingHash, ...body } = value;
  if (!HASH.test(bindingHash ?? "")
    || bindingHash !== digest(body, ENVELOPE_DOMAIN)) {
    fail("ENVELOPE_SERIALIZATION_HASH_MISMATCH");
  }
  return canonicalBytes(value);
}

export function serializeEpisodeDataEnginePublicSourceBindingReceipt(value) {
  if (!value
    || value.schema
      !== EPISODE_DATA_ENGINE_PUBLIC_SOURCE_BINDING_RECEIPT_SCHEMA) {
    fail("RECEIPT_SERIALIZATION_REFUSED");
  }
  const { receiptHash, ...body } = value;
  if (!HASH.test(receiptHash ?? "")
    || receiptHash !== digest(body, RECEIPT_DOMAIN)) {
    fail("RECEIPT_SERIALIZATION_HASH_MISMATCH");
  }
  return canonicalBytes(value);
}

export function episodeDataEnginePublicSourceBindingDigest(value,
  domain = ENVELOPE_DOMAIN) {
  return digest(value, domain);
}
