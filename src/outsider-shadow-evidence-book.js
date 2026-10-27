/*
 * Stage 1 + Stage 1.5 -> one non-financial shadow evidence entrance.
 *
 * The two streams remain intentionally separate:
 *   - Stage 1 records verified, privacy-projected supervised-run outcomes.
 *   - Stage 1.5 records quarantined, historical physical-AI observations.
 *
 * A shared commitment makes them jointly addressable for later research, but
 * neither stream supplies adjudicated loss/exposure data and they are never
 * pooled into one risk class.  The only admissible model decision is ABSTAIN.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import { verifyEvidenceRegistry } from "./outsider-evidence-registry.js";
import {
  verifyCurateCheckpoint, verifyCurateClearance, verifyCurateEpisode,
} from "./outsider-curate-core.js";
import {
  OUTSIDERF_RISK_SCHEMA_SNAPSHOT, RISK_FACTOR_IDS_V1,
} from "./outsider-risk-factor-shadow.js";

export const SHADOW_EVIDENCE_BOOK_SCHEMA = "outsider/shadow-evidence-book/v1";

const HASH = /^sha256:[a-f0-9]{64}$/;
const TERMINALS = Object.freeze([
  "SAFE_DELIVERY",
  "VERIFIED_DELIVERY_UNATTRIBUTED",
  "CONTROL_BOUNDARY_CONTAINMENT",
  "CONSERVATIVE_STOP",
  "UNFINALIZED",
]);
const MISSING_REQUIREMENTS = Object.freeze([
  "EXTERNALLY_ADJUDICATED_LOSS_AND_EXPOSURE_ROWS",
  "CORRELATION_SAFE_INDEPENDENT_DOMAINS",
  "PROSPECTIVE_TEMPORAL_HOLDOUT",
  "FRAUD_AND_CLAIMS_REVIEW",
  "QUALIFIED_INDEPENDENT_MODEL_REVIEW",
  "LICENSED_CAPITAL_CUSTODY_AND_ADJUDICATION",
]);

function digest(value) {
  return `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function canonicalTime(value) {
  const input = value instanceof Date ? value.toISOString() : value;
  if (typeof input !== "string" || input.length > 40 || !Number.isFinite(Date.parse(input))) {
    throw new Error("SHADOW_EVIDENCE_BOOK_TIME_INVALID");
  }
  const normalized = new Date(input).toISOString();
  if (normalized !== input) throw new Error("SHADOW_EVIDENCE_BOOK_TIME_NON_CANONICAL");
  return normalized;
}

function terminalTotals(records) {
  return Object.fromEntries(TERMINALS.map((terminal) => [terminal,
    records.reduce((sum, record) => sum + Number(record.outcomes?.[terminal] ?? 0), 0)]));
}

function checkSources({ evidenceRegistry, curateCheckpoint, curateClearances,
  curateEpisodes, at }) {
  if (!Array.isArray(curateClearances) || !Array.isArray(curateEpisodes)) {
    throw new Error("SHADOW_EVIDENCE_BOOK_CURATE_SOURCE_SET_REQUIRED");
  }
  const registry = verifyEvidenceRegistry(evidenceRegistry, { now: at });
  if (!registry.ok) {
    throw new Error(`SHADOW_EVIDENCE_BOOK_REGISTRY_INVALID:${registry.error}`);
  }
  const checkpoint = verifyCurateCheckpoint(curateCheckpoint,
    { clearances: curateClearances });
  if (!checkpoint.ok || checkpoint.recordsVerified !== true) {
    throw new Error(`SHADOW_EVIDENCE_BOOK_CHECKPOINT_INVALID:${checkpoint.error ?? "UNBOUND"}`);
  }
  if (evidenceRegistry.counts.imports < 1 || evidenceRegistry.counts.nUnique < 1
    || evidenceRegistry.counts.groups < 1 || evidenceRegistry.evidenceRecords.length < 1) {
    throw new Error("SHADOW_EVIDENCE_BOOK_STAGE1_EMPTY");
  }
  if (curateClearances.length < 1 || curateCheckpoint.treeSize !== curateClearances.length) {
    throw new Error("SHADOW_EVIDENCE_BOOK_STAGE15_EMPTY");
  }
  const episodes = new Map();
  const sourceIdentities = new Map();
  for (const episode of curateEpisodes) {
    const checked = verifyCurateEpisode(episode);
    if (!checked.ok || episodes.has(episode.episodeHash)) {
      throw new Error(`SHADOW_EVIDENCE_BOOK_EPISODE_INVALID:${checked.error ?? "DUPLICATE"}`);
    }
    const sourceIdentity = digest({ datasetManifestHash: episode.source.datasetManifestHash,
      sourceObjectHash: episode.source.sourceObjectHash,
      episodeIdHash: episode.episodeIdHash });
    const prior = sourceIdentities.get(sourceIdentity);
    if (prior && prior !== episode.episodeHash) {
      throw new Error("SHADOW_EVIDENCE_BOOK_SOURCE_EPISODE_IDENTITY_CONFLICT");
    }
    sourceIdentities.set(sourceIdentity, episode.episodeHash);
    episodes.set(episode.episodeHash, episode);
  }
  const sourceEpisodeHashes = new Set();
  for (const clearance of curateClearances) {
    if (sourceEpisodeHashes.has(clearance.sourceEpisodeHash)) {
      throw new Error("SHADOW_EVIDENCE_BOOK_DUPLICATE_SOURCE_EPISODE");
    }
    sourceEpisodeHashes.add(clearance.sourceEpisodeHash);
    const episode = episodes.get(clearance.sourceEpisodeHash);
    const history = clearance.historyEpisodeHashes.map((hash) => episodes.get(hash));
    if (!episode || history.some((item) => item === undefined)) {
      throw new Error("SHADOW_EVIDENCE_BOOK_EPISODE_DEPENDENCY_MISSING");
    }
    const checked = verifyCurateClearance(clearance, { episode, history });
    if (!checked.ok || checked.derivationsVerified !== true) {
      throw new Error(`SHADOW_EVIDENCE_BOOK_CLEARANCE_INVALID:${checked.error}`);
    }
  }
  if (episodes.size !== sourceEpisodeHashes.size
    || [...episodes.keys()].some((hash) => !sourceEpisodeHashes.has(hash))) {
    throw new Error("SHADOW_EVIDENCE_BOOK_EPISODE_SET_NOT_EXACT");
  }
  return { registry, checkpoint };
}

function buildBody({ evidenceRegistry, curateCheckpoint, curateClearances, curateEpisodes,
  generatedAt }) {
  const clearances = [...curateClearances]
    .sort((left, right) => left.clearanceHash.localeCompare(right.clearanceHash));
  const stage1Records = [...evidenceRegistry.evidenceRecords]
    .sort((left, right) => left.evidenceRecordHash.localeCompare(right.evidenceRecordHash));
  const alertCodes = [...new Set(clearances.flatMap((clearance) => (
    clearance.consistency.alertCodes
  )))].sort();
  const checked = clearances.reduce((sum, clearance) => sum
    + clearance.consistency.checks.filter((item) => item.status !== "SKIPPED").length, 0);
  const skipped = clearances.reduce((sum, clearance) => sum
    + clearance.consistency.checks.filter((item) => item.status === "SKIPPED").length, 0);
  const stage1 = {
    artifactType: "outsider/evidence-registry/v1",
    registryHash: evidenceRegistry.registryHash,
    signature: {
      present: evidenceRegistry.signature !== null,
      keyId: evidenceRegistry.signature?.keyId ?? null,
      validity: "SOURCE_ARTIFACT_REVERIFY_REQUIRED",
      trustedByPolicy: false,
    },
    imports: evidenceRegistry.counts.imports,
    candidates: evidenceRegistry.counts.candidates,
    uniqueRuns: evidenceRegistry.counts.nUnique,
    duplicatesDisclosed: evidenceRegistry.counts.duplicates,
    instrumentGroups: evidenceRegistry.counts.groups,
    evidenceRecordHashes: stage1Records.map((record) => record.evidenceRecordHash),
    groupKeyHashes: stage1Records.map((record) => record.groupKeyHash).sort(),
    correlationRoots: [...new Set(stage1Records.flatMap((record) => (
      record.correlation.correlationRoots
    )))].sort(),
    outcomes: terminalTotals(stage1Records),
    independenceClaimed: false,
    sourceDisposition: "QUARANTINED",
    sourceBoundary: {
      membershipAuthenticated: evidenceRegistry.claimBoundary
        .sourceRegistryMembershipAuthenticated,
      liveRevocationVerified: evidenceRegistry.claimBoundary.verifiesLiveRevocationAfterImport,
      revocationFreshness: evidenceRegistry.claimBoundary.revocationFreshness,
      retentionEnforcement: evidenceRegistry.claimBoundary.retentionEnforcement,
      expiredPayloadUseRejected: evidenceRegistry.claimBoundary.expiredPayloadUseRejected,
    },
  };
  const episodeHashes = [...curateEpisodes.map((episode) => episode.episodeHash)].sort();
  const stage15 = {
    artifactType: "outsider/curate-checkpoint/v1",
    checkpointHash: curateCheckpoint.checkpointHash,
    instrumentHash: curateCheckpoint.instrumentHash,
    merkleRoot: curateCheckpoint.merkleRoot,
    clearanceSetHash: curateCheckpoint.clearanceSetHash,
    episodeHashes,
    clearanceHashes: clearances.map((clearance) => clearance.clearanceHash),
    historicalEpisodes: clearances.length,
    quarantined: clearances.length,
    checksExecuted: checked,
    checksSkipped: skipped,
    observedAlertCodes: alertCodes,
    precisionRecallClaimed: false,
    causalExperienceUnits: 0,
    fitToLearn: "HOLD_FOR_JUDGMENT",
  };
  const sourceCommitment = digest({
    stage1RegistryHash: stage1.registryHash,
    stage1EvidenceRecordHashes: stage1.evidenceRecordHashes,
    stage1GroupKeyHashes: stage1.groupKeyHashes,
    stage1CorrelationRoots: stage1.correlationRoots,
    stage15CheckpointHash: stage15.checkpointHash,
    stage15InstrumentHash: stage15.instrumentHash,
    stage15EpisodeHashes: stage15.episodeHashes,
    stage15ClearanceHashes: stage15.clearanceHashes,
  });
  return {
    schema: SHADOW_EVIDENCE_BOOK_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt,
    sourceCommitment,
    streams: { supervisedActions: stage1, physicalExperience: stage15 },
    separation: {
      pooledAsOneRiskClass: false,
      correlationDiscountApplied: false,
      independentDomainsClaimed: 0,
      reason: "HETEROGENEOUS_EVIDENCE_WITHOUT_ADJUDICATED_LOSS_OR_EXPOSURE",
    },
    modelEntrance: {
      mode: "SHADOW_ONLY",
      frozenFactorSchema: structuredClone(OUTSIDERF_RISK_SCHEMA_SNAPSHOT),
      productionEligible: false,
      automaticTraining: false,
      decision: "ABSTAIN_NO_ADMISSIBLE_L3_L4",
      adjudicatedLossRows: 0,
      adjudicatedExposureRows: 0,
      externalHoldoutRows: 0,
      factorCoverage: {
        measuredFactorIds: [],
        missingFactorIds: [...RISK_FACTOR_IDS_V1],
        productionHeadCanRun: false,
      },
      missingRequirements: [...MISSING_REQUIREMENTS],
    },
    authority: {
      mode: "none",
      establishesLossSeverityFraudOrLiability: false,
      permitsCuratePromotion: false,
      permitsPricing: false,
      permitsGuarantee: false,
      permitsSettlement: false,
      price: null,
      capital: null,
      coverage: null,
    },
  };
}

export function buildShadowEvidenceBook({ evidenceRegistry, curateCheckpoint,
  curateClearances, curateEpisodes, generatedAt = new Date() } = {}) {
  const at = canonicalTime(generatedAt);
  checkSources({ evidenceRegistry, curateCheckpoint, curateClearances, curateEpisodes, at });
  const body = buildBody({ evidenceRegistry, curateCheckpoint, curateClearances,
    curateEpisodes, generatedAt: at });
  return Object.freeze({ ...body, bookHash: digest(body) });
}

function validateStructure(book) {
  if (!exactKeys(book, ["schema", "schemaVersion", "generatedAt", "sourceCommitment",
    "streams", "separation", "modelEntrance", "authority", "bookHash"])
    || book.schema !== SHADOW_EVIDENCE_BOOK_SCHEMA || book.schemaVersion !== "1.0.0"
    || canonicalTime(book.generatedAt) !== book.generatedAt
    || !HASH.test(book.sourceCommitment ?? "") || !HASH.test(book.bookHash ?? "")
    || !exactKeys(book.streams, ["supervisedActions", "physicalExperience"])
    || !exactKeys(book.separation, ["pooledAsOneRiskClass", "correlationDiscountApplied",
      "independentDomainsClaimed", "reason"])
    || book.separation.pooledAsOneRiskClass !== false
    || book.separation.correlationDiscountApplied !== false
    || book.separation.independentDomainsClaimed !== 0
    || book.separation.reason
      !== "HETEROGENEOUS_EVIDENCE_WITHOUT_ADJUDICATED_LOSS_OR_EXPOSURE"
    || !exactKeys(book.modelEntrance, ["mode", "frozenFactorSchema", "productionEligible",
      "automaticTraining", "decision", "adjudicatedLossRows", "adjudicatedExposureRows",
      "externalHoldoutRows", "factorCoverage", "missingRequirements"])
    || book.modelEntrance.mode !== "SHADOW_ONLY"
    || book.modelEntrance.productionEligible !== false
    || book.modelEntrance.automaticTraining !== false
    || book.modelEntrance.decision !== "ABSTAIN_NO_ADMISSIBLE_L3_L4"
    || book.modelEntrance.adjudicatedLossRows !== 0
    || book.modelEntrance.adjudicatedExposureRows !== 0
    || book.modelEntrance.externalHoldoutRows !== 0
    || !exactKeys(book.modelEntrance.factorCoverage, ["measuredFactorIds",
      "missingFactorIds", "productionHeadCanRun"])
    || canonicalizeStrict(book.modelEntrance.factorCoverage.measuredFactorIds)
      !== canonicalizeStrict([])
    || canonicalizeStrict(book.modelEntrance.factorCoverage.missingFactorIds)
      !== canonicalizeStrict(RISK_FACTOR_IDS_V1)
    || book.modelEntrance.factorCoverage.productionHeadCanRun !== false
    || canonicalizeStrict(book.modelEntrance.frozenFactorSchema)
      !== canonicalizeStrict(OUTSIDERF_RISK_SCHEMA_SNAPSHOT)
    || canonicalizeStrict(book.modelEntrance.missingRequirements)
      !== canonicalizeStrict(MISSING_REQUIREMENTS)
    || !exactKeys(book.authority, ["mode", "establishesLossSeverityFraudOrLiability",
      "permitsCuratePromotion", "permitsPricing", "permitsGuarantee", "permitsSettlement",
      "price", "capital", "coverage"])
    || book.authority.mode !== "none"
    || book.authority.establishesLossSeverityFraudOrLiability !== false
    || book.authority.permitsCuratePromotion !== false
    || book.authority.permitsPricing !== false
    || book.authority.permitsGuarantee !== false
    || book.authority.permitsSettlement !== false
    || book.authority.price !== null || book.authority.capital !== null
    || book.authority.coverage !== null) {
    throw new Error("SHADOW_EVIDENCE_BOOK_STRUCTURE_INVALID");
  }
  const supervised = book.streams.supervisedActions;
  const physical = book.streams.physicalExperience;
  if (!exactKeys(supervised, ["artifactType", "registryHash", "signature", "imports",
    "candidates", "uniqueRuns", "duplicatesDisclosed", "instrumentGroups",
    "evidenceRecordHashes", "groupKeyHashes", "correlationRoots", "outcomes",
    "independenceClaimed", "sourceDisposition", "sourceBoundary"])
    || supervised.artifactType !== "outsider/evidence-registry/v1"
    || !HASH.test(supervised.registryHash ?? "")
    || !exactKeys(supervised.signature, ["present", "keyId", "validity", "trustedByPolicy"])
    || typeof supervised.signature.present !== "boolean"
    || supervised.signature.keyId !== null && !HASH.test(supervised.signature.keyId)
    || supervised.signature.present !== (supervised.signature.keyId !== null)
    || supervised.signature.validity !== "SOURCE_ARTIFACT_REVERIFY_REQUIRED"
    || supervised.signature.trustedByPolicy !== false
    || [supervised.imports, supervised.candidates, supervised.uniqueRuns,
      supervised.duplicatesDisclosed, supervised.instrumentGroups]
      .some((value) => !Number.isSafeInteger(value) || value < 0)
    || !Array.isArray(supervised.evidenceRecordHashes)
    || supervised.evidenceRecordHashes.some((value) => !HASH.test(value))
    || new Set(supervised.evidenceRecordHashes).size !== supervised.evidenceRecordHashes.length
    || canonicalizeStrict(supervised.evidenceRecordHashes)
      !== canonicalizeStrict([...supervised.evidenceRecordHashes].sort())
    || !Array.isArray(supervised.groupKeyHashes)
    || supervised.groupKeyHashes.some((value) => !HASH.test(value))
    || new Set(supervised.groupKeyHashes).size !== supervised.groupKeyHashes.length
    || canonicalizeStrict(supervised.groupKeyHashes)
      !== canonicalizeStrict([...supervised.groupKeyHashes].sort())
    || !Array.isArray(supervised.correlationRoots)
    || supervised.correlationRoots.some((value) => !HASH.test(value))
    || new Set(supervised.correlationRoots).size !== supervised.correlationRoots.length
    || supervised.correlationRoots.length < 1
    || canonicalizeStrict(supervised.correlationRoots)
      !== canonicalizeStrict([...supervised.correlationRoots].sort())
    || !exactKeys(supervised.outcomes, TERMINALS)
    || Object.values(supervised.outcomes)
      .some((value) => !Number.isSafeInteger(value) || value < 0)
    || supervised.independenceClaimed !== false
    || supervised.sourceDisposition !== "QUARANTINED"
    || !exactKeys(supervised.sourceBoundary, ["membershipAuthenticated",
      "liveRevocationVerified", "revocationFreshness", "retentionEnforcement",
      "expiredPayloadUseRejected"])
    || supervised.sourceBoundary.membershipAuthenticated !== false
    || supervised.sourceBoundary.liveRevocationVerified !== false
    || supervised.sourceBoundary.revocationFreshness !== "AS_OF_SOURCE_EXPORT_ONLY"
    || supervised.sourceBoundary.retentionEnforcement !== "MANUAL_PRUNE_REQUIRED"
    || supervised.sourceBoundary.expiredPayloadUseRejected !== true
    || !exactKeys(physical, ["artifactType", "checkpointHash", "instrumentHash", "merkleRoot",
      "clearanceSetHash", "episodeHashes", "clearanceHashes", "historicalEpisodes", "quarantined",
      "checksExecuted", "checksSkipped", "observedAlertCodes", "precisionRecallClaimed",
      "causalExperienceUnits", "fitToLearn"])
    || physical.artifactType !== "outsider/curate-checkpoint/v1"
    || [physical.checkpointHash, physical.instrumentHash, physical.merkleRoot,
      physical.clearanceSetHash]
      .some((value) => !HASH.test(value ?? ""))
    || !Array.isArray(physical.episodeHashes)
    || physical.episodeHashes.some((value) => !HASH.test(value))
    || new Set(physical.episodeHashes).size !== physical.episodeHashes.length
    || canonicalizeStrict(physical.episodeHashes)
      !== canonicalizeStrict([...physical.episodeHashes].sort())
    || !Array.isArray(physical.clearanceHashes)
    || physical.clearanceHashes.some((value) => !HASH.test(value))
    || new Set(physical.clearanceHashes).size !== physical.clearanceHashes.length
    || canonicalizeStrict(physical.clearanceHashes)
      !== canonicalizeStrict([...physical.clearanceHashes].sort())
    || [physical.historicalEpisodes, physical.quarantined, physical.checksExecuted,
      physical.checksSkipped].some((value) => !Number.isSafeInteger(value) || value < 0)
    || physical.historicalEpisodes !== physical.clearanceHashes.length
    || physical.historicalEpisodes !== physical.episodeHashes.length
    || physical.quarantined !== physical.historicalEpisodes
    || !Array.isArray(physical.observedAlertCodes)
    || physical.precisionRecallClaimed !== false
    || physical.causalExperienceUnits !== 0
    || physical.fitToLearn !== "HOLD_FOR_JUDGMENT") {
    throw new Error("SHADOW_EVIDENCE_BOOK_STREAM_INVALID");
  }
  const outcomeTotal = Object.values(supervised.outcomes)
    .reduce((sum, value) => sum + value, 0);
  const expectedCommitment = digest({
    stage1RegistryHash: supervised.registryHash,
    stage1EvidenceRecordHashes: supervised.evidenceRecordHashes,
    stage1GroupKeyHashes: supervised.groupKeyHashes,
    stage1CorrelationRoots: supervised.correlationRoots,
    stage15CheckpointHash: physical.checkpointHash,
    stage15InstrumentHash: physical.instrumentHash,
    stage15EpisodeHashes: physical.episodeHashes,
    stage15ClearanceHashes: physical.clearanceHashes,
  });
  if (supervised.imports < 1 || supervised.uniqueRuns < 1
    || supervised.instrumentGroups < 1
    || supervised.candidates !== supervised.uniqueRuns + supervised.duplicatesDisclosed
    || supervised.instrumentGroups !== supervised.evidenceRecordHashes.length
    || supervised.instrumentGroups !== supervised.groupKeyHashes.length
    || outcomeTotal !== supervised.uniqueRuns
    || physical.historicalEpisodes < 1
    || physical.checksExecuted + physical.checksSkipped !== 8 * physical.historicalEpisodes
    || physical.observedAlertCodes.some((value) => typeof value !== "string"
      || !/^[A-Z][A-Z0-9_]{0,95}$/.test(value))
    || canonicalizeStrict(physical.observedAlertCodes)
      !== canonicalizeStrict([...new Set(physical.observedAlertCodes)].sort())
    || book.sourceCommitment !== expectedCommitment) {
    throw new Error("SHADOW_EVIDENCE_BOOK_INTERNAL_INVARIANT_INVALID");
  }
}

export function verifyShadowEvidenceBook(book, {
  evidenceRegistry = null, curateCheckpoint = null, curateClearances = null,
  curateEpisodes = null, now = new Date(),
} = {}) {
  try {
    validateStructure(book);
    const { bookHash, ...body } = book;
    if (bookHash !== digest(body)) throw new Error("SHADOW_EVIDENCE_BOOK_HASH_INVALID");
    const checkedAt = canonicalTime(now);
    if (Date.parse(checkedAt) < Date.parse(book.generatedAt)) {
      throw new Error("SHADOW_EVIDENCE_BOOK_VERIFY_PRECEDES_GENERATION");
    }
    const allSourcesProvided = evidenceRegistry !== null && curateCheckpoint !== null
      && curateClearances !== null && curateEpisodes !== null;
    const noSourcesProvided = evidenceRegistry === null && curateCheckpoint === null
      && curateClearances === null && curateEpisodes === null;
    if (!allSourcesProvided && !noSourcesProvided) {
      throw new Error("SHADOW_EVIDENCE_BOOK_PARTIAL_SOURCE_SET");
    }
    if (allSourcesProvided) {
      checkSources({ evidenceRegistry, curateCheckpoint, curateClearances, curateEpisodes,
        at: checkedAt });
      const expected = buildShadowEvidenceBook({ evidenceRegistry, curateCheckpoint,
        curateClearances, curateEpisodes, generatedAt: book.generatedAt });
      if (canonicalizeStrict(expected) !== canonicalizeStrict(book)) {
        throw new Error("SHADOW_EVIDENCE_BOOK_SOURCE_BINDING_INVALID");
      }
    }
    return Object.freeze({ ok: true, bookHash, sourceCommitmentInternallyConsistent: true,
      sourceArtifactsReverified: allSourcesProvided,
      curateDerivationsReverified: allSourcesProvided,
      retentionCheckedAt: allSourcesProvided ? checkedAt : null,
      liveRevocationVerified: false, decision: book.modelEntrance.decision });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}
