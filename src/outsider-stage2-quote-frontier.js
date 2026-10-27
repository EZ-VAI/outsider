/*
 * Stage 2 pre-action/model/quote frontier.
 *
 * This module joins exact, source-replayed ATTEST, CURATE, Reality,
 * empirical-factor, and loss/exposure artifacts.  The join is deliberately a
 * frontier, not a pricing engine: current sources can describe observations
 * and protocol conformance, but they do not establish a prospective factor
 * vector, externally governed exposure/loss evidence, an external holdout, or
 * financial authority.  Every quote therefore remains NON_BINDING_ABSTAIN.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyAttestationV2,
  verifyStage05RunDirectory,
} from "./outsider-stage05-evidence.js";
import {
  verifyRealityCurateEvidenceIntent,
  verifySourceBoundRealityAdvisoryEnvelope,
} from "./outsider-reality-stewardship-integration.js";
import {
  EMPIRICAL_FACTOR_DICTIONARIES,
  replayEmpiricalFactorLedger,
} from "./outsider-empirical-factor-ledger.js";
import {
  verifyLossExposureShadowBook,
} from "./outsider-loss-exposure-evidence.js";

export const STAGE2_QUOTE_FRONTIER_SCHEMAS = Object.freeze({
  factorPolicy: "outsider/stage2-pre-action-factor-policy/v1",
  frontier: "outsider/stage2-model-quote-frontier/v1",
  quoteCandidate: "outsider/stage2-non-binding-quote-candidate/v1",
});

const DOMAINS = Object.freeze({
  factorPolicy: STAGE2_QUOTE_FRONTIER_SCHEMAS.factorPolicy,
  validityDomain: "outsider/stage2-validity-domain/v1",
  modelDomain: "outsider/stage2-model-domain/v1",
  evidenceSet: "outsider/stage2-evidence-set/v1",
  frontier: STAGE2_QUOTE_FRONTIER_SCHEMAS.frontier,
  quoteIdentity: "outsider/stage2-quote-identity/v1",
  priorQuoteSet: "outsider/stage2-prior-quote-set/v1",
  quoteCandidate: STAGE2_QUOTE_FRONTIER_SCHEMAS.quoteCandidate,
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,255}$/;

function fail(code, detail = null) {
  throw new Error(detail === null ? code : `${code}:${detail}`);
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
  try { return canonicalizeStrict(left) === canonicalizeStrict(right); }
  catch { return false; }
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function iso(value, code) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    fail(code);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail(code);
  return normalized;
}

function sortedUnique(values, code, { minimum = 0, maximum = 100_000 } = {}) {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum
    || values.some((value) => typeof value !== "string")) fail(code);
  const sorted = [...values].sort();
  if (new Set(sorted).size !== sorted.length) fail(`${code}_DUPLICATE`);
  return sorted;
}

function allFactors() {
  return Object.values(EMPIRICAL_FACTOR_DICTIONARIES)
    .flatMap((dictionary) => dictionary.factors.map((factor) => ({ dictionary, factor })))
    .sort((left, right) => left.factor.domain.localeCompare(right.factor.domain)
      || left.factor.id.localeCompare(right.factor.id));
}

function factorAdmission(factor) {
  if (factor.outcomeDerived === true || String(factor.temporality).startsWith("POST_OUTCOME")) {
    return "FORBIDDEN_POST_OUTCOME_OR_LABEL_DERIVED";
  }
  if (factor.preActionAvailable !== true) return "UNAVAILABLE_BEFORE_ACTION";
  return "ELIGIBLE_ONLY_WITH_SOURCE_REPLAYED_PROSPECTIVE_RECEIPT";
}

function makePreActionPolicy() {
  const body = {
    schema: STAGE2_QUOTE_FRONTIER_SCHEMAS.factorPolicy,
    schemaVersion: "1.0.0",
    policyVersion: "1.0.0",
    timingRule: {
      observationTimestampRequired: true,
      observationMustPrecedeAction: true,
      actionTimestampRequired: true,
      sourceReplayRequired: true,
      sourceDefinitionMustDeclarePreActionAvailable: true,
      outcomeDerivedFactorsForbidden: true,
      publisherLabelDerivedFactorsForbidden: true,
      missingValuesRequireExplicitMask: true,
      zeroImputationPermitted: false,
    },
    factors: allFactors().map(({ dictionary, factor }) => ({
      dictionaryId: dictionary.id,
      dictionaryHash: dictionary.dictionaryHash,
      factorId: factor.id,
      domain: factor.domain,
      valueType: factor.valueType,
      unit: factor.unit,
      sourceTemporality: factor.temporality,
      sourceDefinitionPreActionAvailable: factor.preActionAvailable,
      outcomeDerived: factor.outcomeDerived,
      admission: factorAdmission(factor),
      missingPolicy: "EXPLICIT_MASK_NEVER_ZERO_IMPUTE",
    })),
  };
  return deepFreeze({ ...body, policyHash: digest(DOMAINS.factorPolicy, body) });
}

export const STAGE2_PRE_ACTION_FACTOR_POLICY = makePreActionPolicy();
export const STAGE2_PRE_ACTION_FACTOR_POLICY_HASH =
  STAGE2_PRE_ACTION_FACTOR_POLICY.policyHash;

const SOURCE_KEYS = Object.freeze([
  "realityEnvelope", "realitySources", "empiricalLedger",
  "empiricalSourceOptions", "lossExposureBook", "lossExposureSources",
]);
const LOSS_SOURCE_KEYS = Object.freeze([
  "quarantine", "quarantineLineage", "adjudications", "trustStore", "now",
]);
const REALITY_SOURCE_KEYS = Object.freeze([
  "boundary", "claim", "assessment", "priorCommitmentEntries", "currentCommitment",
  "execution", "curateIntent", "curateSource", "stage05Source",
]);
const CURATE_SOURCE_KEYS = Object.freeze([
  "episode", "history", "clearance", "checkpoint", "checkpointClearances",
  "inclusionProof",
]);
const EMPIRICAL_SOURCE_OPTION_KEYS = Object.freeze([
  "wave3SourceDirectory", "wave4SourceDirectory", "botFailsSourceDirectory",
  "ur5SourceDirectory", "droidArtifactDirectory", "droidSource",
  "nhtsaRegistryDirectory", "nhtsaCsvPath", "nhtsaDataDictionaryPath",
  "nhtsaReplayAt",
]);

function replaySources(sources) {
  if (!exactKeys(sources, SOURCE_KEYS)) fail("STAGE2_SOURCE_SET_SCHEMA_INVALID");
  if (!exactKeys(sources.realitySources, REALITY_SOURCE_KEYS)
    || !exactKeys(sources.realitySources.curateSource, CURATE_SOURCE_KEYS)
    || !exactKeys(sources.realitySources.stage05Source,
      ["runDirectory", "attestation"])) {
    fail("STAGE2_REALITY_SOURCE_SET_SCHEMA_INVALID");
  }
  if (!exactKeys(sources.empiricalSourceOptions, EMPIRICAL_SOURCE_OPTION_KEYS)
    || !exactKeys(sources.empiricalSourceOptions.droidSource,
      ["objectListBytes", "datasetInfoBytes", "featureBytes", "shardBytes"])) {
    fail("STAGE2_EMPIRICAL_SOURCE_SET_SCHEMA_INVALID");
  }
  if (!exactKeys(sources.lossExposureSources, LOSS_SOURCE_KEYS)) {
    fail("STAGE2_LOSS_SOURCE_SET_SCHEMA_INVALID");
  }
  const stage05Source = sources.realitySources?.stage05Source;
  const stage05 = verifyStage05RunDirectory(stage05Source?.runDirectory);
  if (!stage05.ok) fail("STAGE2_STAGE05_SOURCE_REPLAY_FAILED", stage05.error);
  const attestation = verifyAttestationV2(stage05Source?.attestation);
  if (!attestation.ok || attestation.signed !== true) {
    fail("STAGE2_SIGNED_ATTEST_SOURCE_REPLAY_FAILED", attestation.error ?? "UNSIGNED");
  }
  const curate = verifyRealityCurateEvidenceIntent(
    sources.realitySources?.curateIntent,
    { curateSource: sources.realitySources?.curateSource },
  );
  if (!curate.ok || curate.curateProtocolInputsReplayed !== true) {
    fail("STAGE2_CURATE_SOURCE_REPLAY_FAILED", curate.error);
  }
  const reality = verifySourceBoundRealityAdvisoryEnvelope(
    sources.realityEnvelope, sources.realitySources,
  );
  if (!reality.ok || reality.localProtocolSourcesReplayed !== true) {
    fail("STAGE2_REALITY_SOURCE_REPLAY_FAILED", reality.error);
  }
  const empirical = replayEmpiricalFactorLedger(
    sources.empiricalLedger, sources.empiricalSourceOptions,
  );
  if (!empirical.ok || empirical.verificationLevel !== "FULL_SIX_SOURCE_REPRODUCED"
    || empirical.sourceArtifactsReverified !== true
    || empirical.empiricalValuesSourceReverified !== true) {
    fail("STAGE2_EMPIRICAL_SOURCE_REPLAY_FAILED", empirical.error);
  }
  const loss = verifyLossExposureShadowBook(
    sources.lossExposureBook, sources.lossExposureSources,
  );
  if (!loss.ok || loss.sourceArtifactsReverified !== true
    || loss.derivationsVerified !== true) {
    fail("STAGE2_LOSS_EXPOSURE_SOURCE_REPLAY_FAILED",
      (loss.failures ?? []).join(","));
  }
  if (sources.realityEnvelope.sources.stage05.manifestHash
      !== stage05.manifest.manifestHash
    || sources.realityEnvelope.sources.stage05.attestationHash
      !== stage05Source.attestation.attestationHash
    || sources.realityEnvelope.sources.curate.intentHash
      !== sources.realitySources.curateIntent.intentHash
    || sources.realityEnvelope.sources.curate.checkpointHash
      !== sources.realitySources.curateIntent.curate.checkpointHash) {
    fail("STAGE2_ATTEST_CURATE_REALITY_CROSS_BINDING_INVALID");
  }
  return { stage05, attestation, curate, reality, empirical, loss };
}

function fixedAuthority() {
  return {
    mode: "none",
    bindingQuote: false,
    permitsPrice: false,
    permitsPremium: false,
    permitsCapital: false,
    permitsCoverage: false,
    permitsGuarantee: false,
    permitsSettlement: false,
    movesFunds: false,
    automaticTraining: false,
    automaticDeployment: false,
  };
}

function preActionState() {
  const eligible = STAGE2_PRE_ACTION_FACTOR_POLICY.factors
    .filter((factor) => factor.admission
      === "ELIGIBLE_ONLY_WITH_SOURCE_REPLAYED_PROSPECTIVE_RECEIPT");
  const excluded = STAGE2_PRE_ACTION_FACTOR_POLICY.factors
    .filter((factor) => factor.admission
      !== "ELIGIBLE_ONLY_WITH_SOURCE_REPLAYED_PROSPECTIVE_RECEIPT")
    .map((factor) => ({ factorId: factor.factorId, reason: factor.admission }));
  return {
    policyHash: STAGE2_PRE_ACTION_FACTOR_POLICY_HASH,
    observationCutoff: null,
    proposedActionAt: null,
    admittedValues: [],
    missingMask: eligible.map((factor) => ({
      factorId: factor.factorId,
      missing: true,
      reason: "NO_SOURCE_REPLAYED_PROSPECTIVE_CANDIDATE_RECEIPT",
    })),
    excludedFactors: excluded,
    postOutcomeOrLabelDerivedValuesAdmitted: 0,
    zeroImputedValues: 0,
    decision: "ABSTAIN_NO_SOURCE_REPLAYED_PROSPECTIVE_FACTOR_RECEIPT",
  };
}

function modelCellDomains(book) {
  return book.modelCells.map((cell) => ({
    modelCellHash: cell.modelCellHash,
    instrumentHash: cell.key.instrumentHash,
    policyHash: cell.key.policyHash,
    exposureUnit: cell.key.exposureUnit,
    unitDefinitionHash: cell.key.unitDefinitionHash,
    reportingCurrency: cell.key.reportingCurrency,
    exposureWindows: cell.counts.exposureWindows,
    zeroLossWindows: cell.counts.zeroLossWindows,
    confirmedIncidents: cell.counts.confirmedIncidents,
    correlationComponents: cell.counts.correlationComponents,
  })).sort((left, right) => left.modelCellHash.localeCompare(right.modelCellHash));
}

function modelPipeline(book) {
  const domains = modelCellDomains(book);
  const currencies = [...new Set(domains.map((domain) => domain.reportingCurrency))].sort();
  const units = [...new Set(domains.map((domain) => domain.exposureUnit))].sort();
  const unitDefinitionHashes = [...new Set(domains
    .map((domain) => domain.unitDefinitionHash))].sort();
  const localCompleteRows = book.counts.researchRows;
  const localZeroLossWindows = book.counts.zeroLossWindows;
  const localAdjudicatedSeveritySamples = domains.reduce((sum, domain) => (
    sum + domain.confirmedIncidents
  ), 0);
  const pending = book.counts.pendingWindows;
  const missingRequirements = [
    "EXTERNALLY_GOVERNED_COMPLETE_ZERO_LOSS_EXPOSURE_WINDOWS",
    "EXTERNALLY_GOVERNED_ADJUDICATED_MONETARY_SEVERITY",
    "EXTERNAL_TEMPORAL_HOLDOUT_WITH_DEPENDENCE_ROOT_ISOLATION",
    "CENSORING_AND_REPORTING_MATURITY_POLICY",
    "PROSPECTIVE_DRIFT_MONITOR_AND_RECALIBRATION_AUTHORITY",
    "INDEPENDENT_MODEL_REVIEW",
    "LEGAL_RATE_CAPITAL_AND_COVERAGE_AUTHORITY",
  ];
  if (currencies.length > 1) missingRequirements.push("CURRENCY_DOMAINS_REQUIRE_SEPARATE_MODELS");
  if (units.length > 1 || unitDefinitionHashes.length > 1) {
    missingRequirements.push("EXPOSURE_UNIT_DOMAINS_REQUIRE_SEPARATE_MODELS");
  }
  return {
    modelPolicyVersion: "1.0.0",
    factorPolicyHash: STAGE2_PRE_ACTION_FACTOR_POLICY_HASH,
    modelCellDomains: domains,
    domainCompatibility: {
      currencies,
      exposureUnits: units,
      unitDefinitionHashes,
      currencyConversionPerformed: false,
      exposureUnitConversionPerformed: false,
      crossCellPoolingPermitted: false,
    },
    frequency: {
      localClosedExposureWindows: localCompleteRows,
      localZeroLossWindowsIncluded: localZeroLossWindows,
      externallyGovernedCompleteWindows: 0,
      externallyGovernedZeroLossWindows: 0,
      completeDenominatorEstablished: false,
      posteriorComputed: false,
      estimate: null,
    },
    severity: {
      localAdjudicatedMonetarySamples: localAdjudicatedSeveritySamples,
      externallyGovernedAdjudicatedMonetarySamples: 0,
      currencyAndUnitDomainCompatibleForPooling:
        currencies.length <= 1 && units.length <= 1 && unitDefinitionHashes.length <= 1,
      severityDistributionComputed: false,
      estimate: null,
      tailValueAtRisk: null,
    },
    censoring: {
      pendingLocalWindows: pending,
      completeZeroLossWindowsRequired: true,
      delayedReportingMaturityExternallyVerified: false,
      truncationAndCensoringPolicyExternallyVerified: false,
      censoringAdjustmentComputed: false,
    },
    dependence: {
      independenceClaimed: false,
      correlationDiscountApplied: false,
      connectedComponentCount: book.correlation.connectedComponents.length,
      structuralIndependentUpperBound: book.correlation.structuralIndependentUpperBound,
      splitPolicy: book.correlation.splitPolicy,
      trainCalibrationHoldoutAssigned: false,
      dependenceRootsPreserved: true,
    },
    driftAndHoldout: {
      prospectiveTemporalHoldoutPresent: false,
      externalHoldoutPresent: false,
      holdoutDependenceRootsDisjoint: false,
      preRegisteredDriftThresholdsPresent: false,
      recalibrationAuthorityEstablished: false,
    },
    missingRequirements: [...new Set(missingRequirements)].sort(),
    decision: "ABSTAIN_MODEL_EVIDENCE_AND_AUTHORITY_INCOMPLETE",
    outputs: {
      frequencyEstimate: null,
      severityEstimate: null,
      premium: null,
      capital: null,
      price: null,
      coverage: null,
    },
  };
}

function validityDomain(sources) {
  const boundary = sources.realitySources.boundary;
  const claim = sources.realitySources.claim;
  const body = {
    claimHash: claim.claimHash,
    wayHash: claim.wayHash,
    worldHash: boundary.worldHash,
    boundaryHash: boundary.boundaryHash,
    worldPolicyHash: boundary.policyHash,
    validFrom: boundary.validFrom,
    validUntil: boundary.validUntil,
    generalizesBeyondExactClaimWayWorld: false,
    generalizesAcrossEmpiricalSources: false,
    generalizesAcrossCurrenciesOrExposureUnits: false,
  };
  return { ...body, validityDomainHash: digest(DOMAINS.validityDomain, body) };
}

function bindings(sources, replayed, pipeline, validity) {
  const envelope = sources.realityEnvelope;
  const intent = sources.realitySources.curateIntent;
  const empirical = sources.empiricalLedger;
  const book = sources.lossExposureBook;
  const modelDomainHash = digest(DOMAINS.modelDomain, {
    validityDomainHash: validity.validityDomainHash,
    factorPolicyHash: STAGE2_PRE_ACTION_FACTOR_POLICY_HASH,
    modelCellDomains: pipeline.modelCellDomains,
  });
  const result = {
    attest: {
      manifestHash: replayed.stage05.manifest.manifestHash,
      projectionHash: replayed.stage05.projection.projectionHash,
      publicEvidenceHash: replayed.stage05.publicEvidence.publicEvidenceHash,
      attestationHash: sources.realitySources.stage05Source.attestation.attestationHash,
      signatureVerified: true,
      signerExternallyTrusted: false,
    },
    registry: {
      registryHash: intent.curate.checkpointHash,
      episodeHash: intent.curate.episodeHash,
      clearanceHash: intent.curate.clearanceHash,
      checkpointHash: intent.curate.checkpointHash,
      inclusionProofHash: intent.curate.inclusionProofHash,
      datasetManifestHash: intent.curate.datasetManifestHash,
      sourceObjectHash: intent.curate.sourceObjectHash,
      disposition: "QUARANTINED",
      causalExperienceUnits: 0,
    },
    reality: {
      envelopeHash: envelope.envelopeHash,
      sourceEvidenceAnchorHash: envelope.sourceEvidenceAnchorHash,
      boundaryHash: envelope.boundaryHash,
      claimHash: envelope.claimHash,
      wayHash: envelope.constitutionalBindings.wayHash,
      worldHash: envelope.constitutionalBindings.worldHash,
      executionHash: envelope.executionHash,
      obligationSetHash: envelope.consequenceObligations.obligationSetHash,
      consequenceObligationOpen: true,
    },
    empirical: {
      ledgerHash: empirical.ledgerHash,
      sourceProfileHashes: empirical.sourceProfiles.map((profile) => profile.profileHash).sort(),
      dictionaryHashes: Object.values(empirical.factorDictionaries)
        .map((dictionary) => dictionary.dictionaryHash).sort(),
      sourceRows: empirical.accounting.sourceRows,
      frequencyDenominatorsAdmitted: 0,
      economicLossRowsAdmitted: 0,
    },
    lossExposure: {
      bookHash: book.bookHash,
      sourceCommitmentHash: book.sources.sourceCommitmentHash,
      quarantineHash: book.sources.quarantineHash,
      adjudicationHashes: [...book.sources.adjudicationHashes],
      localResearchRows: book.counts.researchRows,
      externallyGovernedRows: 0,
      priceAuthority: false,
    },
    rights: {
      declaredExperienceRightsReferenceHash:
        envelope.constitutionalBindings.declaredExperienceRightsReferenceHash,
      sourceObjectRightsExternallyVerified: false,
      pricingUseExternallyVerified: false,
      coverageUseExternallyVerified: false,
      automaticTrainingPermitted: false,
      legalConclusion: false,
    },
    model: {
      factorPolicyHash: STAGE2_PRE_ACTION_FACTOR_POLICY_HASH,
      modelDomainHash,
      validityDomainHash: validity.validityDomainHash,
      modelVersion: "UNFIT_NO_MODEL",
      modelHash: null,
      calibrationHash: null,
      externalHoldoutHash: null,
    },
  };
  const evidenceHashes = [
    result.attest.manifestHash, result.attest.projectionHash,
    result.attest.publicEvidenceHash, result.attest.attestationHash,
    result.registry.registryHash, result.registry.episodeHash,
    result.registry.clearanceHash, result.registry.inclusionProofHash,
    result.registry.datasetManifestHash, result.registry.sourceObjectHash,
    result.reality.envelopeHash, result.reality.sourceEvidenceAnchorHash,
    result.reality.boundaryHash, result.reality.claimHash, result.reality.wayHash,
    result.reality.worldHash, result.reality.executionHash,
    result.reality.obligationSetHash, result.empirical.ledgerHash,
    ...result.empirical.sourceProfileHashes, ...result.empirical.dictionaryHashes,
    result.lossExposure.bookHash, result.lossExposure.sourceCommitmentHash,
    result.lossExposure.quarantineHash, ...result.lossExposure.adjudicationHashes,
    result.rights.declaredExperienceRightsReferenceHash,
    result.model.factorPolicyHash, result.model.modelDomainHash,
    result.model.validityDomainHash,
  ];
  result.evidenceHashes = sortedUnique(evidenceHashes,
    "STAGE2_EVIDENCE_HASH_SET_INVALID", { minimum: 1 });
  result.evidenceSetHash = digest(DOMAINS.evidenceSet, result.evidenceHashes);
  return result;
}

function sourceReplayReceipt() {
  return {
    stage05BytesReplayed: true,
    signedAttestationReplayed: true,
    curateDerivationReplayed: true,
    realityGraphReplayed: true,
    empiricalSixSourceLedgerReplayed: true,
    lossExposureSourcesAndDerivationsReplayed: true,
    callerTrustFlagsAccepted: false,
  };
}

const SOURCE_REPLAY_RECEIPT_KEYS = Object.freeze([
  "stage05BytesReplayed", "signedAttestationReplayed",
  "curateDerivationReplayed", "realityGraphReplayed",
  "empiricalSixSourceLedgerReplayed",
  "lossExposureSourcesAndDerivationsReplayed", "callerTrustFlagsAccepted",
]);

const FRONTIER_KEYS = Object.freeze([
  "schema", "schemaVersion", "createdAt", "sourceReplay", "bindings",
  "factorPolicy", "preAction", "validityDomain", "modelPipeline", "quoteBoundary",
  "authority", "frontierHash",
]);

export function buildStage2QuoteFrontier(input) {
  if (!exactKeys(input, ["createdAt", "sources"])) fail("STAGE2_FRONTIER_INPUT_SCHEMA_INVALID");
  const createdAt = iso(input.createdAt, "STAGE2_FRONTIER_TIME_INVALID");
  const replayed = replaySources(input.sources);
  const policy = STAGE2_PRE_ACTION_FACTOR_POLICY;
  const preAction = preActionState();
  const model = modelPipeline(input.sources.lossExposureBook);
  const validity = validityDomain(input.sources);
  if (Date.parse(createdAt) < Date.parse(input.sources.realityEnvelope.createdAt)
    || Date.parse(createdAt) < Date.parse(validity.validFrom)
    || Date.parse(createdAt) >= Date.parse(validity.validUntil)) {
    fail("STAGE2_FRONTIER_OUTSIDE_SOURCE_AND_VALIDITY_TIME");
  }
  const bound = bindings(input.sources, replayed, model, validity);
  const body = {
    schema: STAGE2_QUOTE_FRONTIER_SCHEMAS.frontier,
    schemaVersion: "1.0.0",
    createdAt,
    sourceReplay: sourceReplayReceipt(),
    bindings: bound,
    factorPolicy: policy,
    preAction,
    validityDomain: validity,
    modelPipeline: model,
    quoteBoundary: {
      decision: "NON_BINDING_ABSTAIN",
      reason: "NO_PROSPECTIVE_FACTOR_VECTOR_OR_EXTERNALLY_GOVERNED_MODEL_EVIDENCE",
      price: null,
      premium: null,
      capital: null,
      currency: null,
      coverage: null,
      guarantee: false,
      settle: false,
      quoteEligible: false,
      binding: false,
    },
    authority: fixedAuthority(),
  };
  const frontier = deepFreeze({ ...body, frontierHash: digest(DOMAINS.frontier, body) });
  const checked = verifyStage2QuoteFrontierStructure(frontier);
  if (!checked.ok) fail("STAGE2_FRONTIER_SELF_VERIFICATION_FAILED", checked.error);
  return frontier;
}

function validHashSet(values, { minimum = 0 } = {}) {
  try {
    return same(values, sortedUnique(values, "HASH_SET", { minimum }))
      && values.every((value) => HASH.test(value));
  } catch { return false; }
}

function expectedBindingEvidenceHashes(bound) {
  return [
    bound.attest.manifestHash, bound.attest.projectionHash,
    bound.attest.publicEvidenceHash, bound.attest.attestationHash,
    bound.registry.registryHash, bound.registry.episodeHash,
    bound.registry.clearanceHash, bound.registry.inclusionProofHash,
    bound.registry.datasetManifestHash, bound.registry.sourceObjectHash,
    bound.reality.envelopeHash, bound.reality.sourceEvidenceAnchorHash,
    bound.reality.boundaryHash, bound.reality.claimHash, bound.reality.wayHash,
    bound.reality.worldHash, bound.reality.executionHash,
    bound.reality.obligationSetHash, bound.empirical.ledgerHash,
    ...bound.empirical.sourceProfileHashes, ...bound.empirical.dictionaryHashes,
    bound.lossExposure.bookHash, bound.lossExposure.sourceCommitmentHash,
    bound.lossExposure.quarantineHash, ...bound.lossExposure.adjudicationHashes,
    bound.rights.declaredExperienceRightsReferenceHash,
    bound.model.factorPolicyHash, bound.model.modelDomainHash,
    bound.model.validityDomainHash,
  ].sort().filter((value, index, values) => index === 0 || value !== values[index - 1]);
}

function fixedQuoteBoundary() {
  return {
    decision: "NON_BINDING_ABSTAIN",
    reason: "NO_PROSPECTIVE_FACTOR_VECTOR_OR_EXTERNALLY_GOVERNED_MODEL_EVIDENCE",
    price: null,
    premium: null,
    capital: null,
    currency: null,
    coverage: null,
    guarantee: false,
    settle: false,
    quoteEligible: false,
    binding: false,
  };
}

function frontierBindingReceipt(frontier) {
  return deepFreeze({
    frontierHash: frontier.frontierHash,
    claimHash: frontier.bindings.reality.claimHash,
    wayHash: frontier.bindings.reality.wayHash,
    worldHash: frontier.bindings.reality.worldHash,
    registryHash: frontier.bindings.registry.registryHash,
    realityEnvelopeHash: frontier.bindings.reality.envelopeHash,
    factorPolicyHash: frontier.bindings.model.factorPolicyHash,
    modelDomainHash: frontier.bindings.model.modelDomainHash,
    validityDomainHash: frontier.bindings.model.validityDomainHash,
    rightsReferenceHash: frontier.bindings.rights.declaredExperienceRightsReferenceHash,
    evidenceSetHash: frontier.bindings.evidenceSetHash,
    empiricalLedgerHash: frontier.bindings.empirical.ledgerHash,
    lossExposureBookHash: frontier.bindings.lossExposure.bookHash,
  });
}

function validateBindings(bound) {
  if (!exactKeys(bound, ["attest", "registry", "reality", "empirical",
    "lossExposure", "rights", "model", "evidenceHashes", "evidenceSetHash"])
    || !exactKeys(bound.attest, ["manifestHash", "projectionHash", "publicEvidenceHash",
      "attestationHash", "signatureVerified", "signerExternallyTrusted"])
    || [bound.attest.manifestHash, bound.attest.projectionHash,
      bound.attest.publicEvidenceHash, bound.attest.attestationHash]
      .some((value) => !HASH.test(value ?? ""))
    || bound.attest.signatureVerified !== true
    || bound.attest.signerExternallyTrusted !== false
    || !exactKeys(bound.registry, ["registryHash", "episodeHash", "clearanceHash",
      "checkpointHash", "inclusionProofHash", "datasetManifestHash", "sourceObjectHash",
      "disposition", "causalExperienceUnits"])
    || [bound.registry.registryHash, bound.registry.episodeHash,
      bound.registry.clearanceHash, bound.registry.checkpointHash,
      bound.registry.inclusionProofHash, bound.registry.datasetManifestHash,
      bound.registry.sourceObjectHash].some((value) => !HASH.test(value ?? ""))
    || bound.registry.registryHash !== bound.registry.checkpointHash
    || bound.registry.disposition !== "QUARANTINED"
    || bound.registry.causalExperienceUnits !== 0
    || !exactKeys(bound.reality, ["envelopeHash", "sourceEvidenceAnchorHash", "boundaryHash",
      "claimHash", "wayHash", "worldHash", "executionHash", "obligationSetHash",
      "consequenceObligationOpen"])
    || [bound.reality.envelopeHash, bound.reality.sourceEvidenceAnchorHash,
      bound.reality.boundaryHash, bound.reality.claimHash, bound.reality.wayHash,
      bound.reality.worldHash, bound.reality.executionHash,
      bound.reality.obligationSetHash].some((value) => !HASH.test(value ?? ""))
    || bound.reality.consequenceObligationOpen !== true
    || !exactKeys(bound.empirical, ["ledgerHash", "sourceProfileHashes", "dictionaryHashes",
      "sourceRows", "frequencyDenominatorsAdmitted", "economicLossRowsAdmitted"])
    || !HASH.test(bound.empirical.ledgerHash ?? "")
    || !validHashSet(bound.empirical.sourceProfileHashes, { minimum: 1 })
    || !validHashSet(bound.empirical.dictionaryHashes, { minimum: 1 })
    || !plain(bound.empirical.sourceRows)
    || bound.empirical.frequencyDenominatorsAdmitted !== 0
    || bound.empirical.economicLossRowsAdmitted !== 0
    || !exactKeys(bound.lossExposure, ["bookHash", "sourceCommitmentHash",
      "quarantineHash", "adjudicationHashes", "localResearchRows",
      "externallyGovernedRows", "priceAuthority"])
    || [bound.lossExposure.bookHash, bound.lossExposure.sourceCommitmentHash,
      bound.lossExposure.quarantineHash].some((value) => !HASH.test(value ?? ""))
    || !validHashSet(bound.lossExposure.adjudicationHashes)
    || !Number.isSafeInteger(bound.lossExposure.localResearchRows)
    || bound.lossExposure.localResearchRows < 0
    || bound.lossExposure.externallyGovernedRows !== 0
    || bound.lossExposure.priceAuthority !== false
    || !exactKeys(bound.rights, ["declaredExperienceRightsReferenceHash",
      "sourceObjectRightsExternallyVerified", "pricingUseExternallyVerified",
      "coverageUseExternallyVerified", "automaticTrainingPermitted", "legalConclusion"])
    || !HASH.test(bound.rights.declaredExperienceRightsReferenceHash ?? "")
    || Object.entries(bound.rights).filter(([key]) =>
      key !== "declaredExperienceRightsReferenceHash")
      .some(([, value]) => value !== false)
    || !exactKeys(bound.model, ["factorPolicyHash", "modelDomainHash",
      "validityDomainHash", "modelVersion", "modelHash", "calibrationHash",
      "externalHoldoutHash"])
    || [bound.model.factorPolicyHash, bound.model.modelDomainHash,
      bound.model.validityDomainHash].some((value) => !HASH.test(value ?? ""))
    || bound.model.factorPolicyHash !== STAGE2_PRE_ACTION_FACTOR_POLICY_HASH
    || bound.model.modelVersion !== "UNFIT_NO_MODEL"
    || bound.model.modelHash !== null || bound.model.calibrationHash !== null
    || bound.model.externalHoldoutHash !== null
    || !validHashSet(bound.evidenceHashes, { minimum: 1 })
    || !same(bound.evidenceHashes, expectedBindingEvidenceHashes(bound))
    || !HASH.test(bound.evidenceSetHash ?? "")
    || bound.evidenceSetHash !== digest(DOMAINS.evidenceSet, bound.evidenceHashes)) {
    fail("STAGE2_FRONTIER_BINDING_INVALID");
  }
}

function validatePreAction(preAction) {
  const expected = preActionState();
  if (!same(preAction, expected)) fail("STAGE2_PRE_ACTION_BOUNDARY_INVALID");
}

function validateValidity(validity, bound) {
  if (!exactKeys(validity, ["claimHash", "wayHash", "worldHash", "boundaryHash",
    "worldPolicyHash", "validFrom", "validUntil", "generalizesBeyondExactClaimWayWorld",
    "generalizesAcrossEmpiricalSources", "generalizesAcrossCurrenciesOrExposureUnits",
    "validityDomainHash"])
    || [validity.claimHash, validity.wayHash, validity.worldHash, validity.boundaryHash,
      validity.worldPolicyHash, validity.validityDomainHash]
      .some((value) => !HASH.test(value ?? ""))
    || validity.claimHash !== bound.reality.claimHash
    || validity.wayHash !== bound.reality.wayHash
    || validity.worldHash !== bound.reality.worldHash
    || validity.boundaryHash !== bound.reality.boundaryHash
    || validity.validityDomainHash !== bound.model.validityDomainHash
    || [validity.generalizesBeyondExactClaimWayWorld,
      validity.generalizesAcrossEmpiricalSources,
      validity.generalizesAcrossCurrenciesOrExposureUnits].some((value) => value !== false)) {
    fail("STAGE2_VALIDITY_DOMAIN_INVALID");
  }
  iso(validity.validFrom, "STAGE2_VALIDITY_FROM_INVALID");
  iso(validity.validUntil, "STAGE2_VALIDITY_UNTIL_INVALID");
  const { validityDomainHash, ...body } = validity;
  if (validityDomainHash !== digest(DOMAINS.validityDomain, body)
    || Date.parse(validity.validUntil) <= Date.parse(validity.validFrom)) {
    fail("STAGE2_VALIDITY_DOMAIN_HASH_OR_WINDOW_INVALID");
  }
}

function validateModelPipeline(model, bound, validity) {
  const keys = ["modelPolicyVersion", "factorPolicyHash", "modelCellDomains",
    "domainCompatibility", "frequency", "severity", "censoring", "dependence",
    "driftAndHoldout", "missingRequirements", "decision", "outputs"];
  if (!exactKeys(model, keys) || model.modelPolicyVersion !== "1.0.0"
    || model.factorPolicyHash !== STAGE2_PRE_ACTION_FACTOR_POLICY_HASH
    || !Array.isArray(model.modelCellDomains)
    || new Set(model.modelCellDomains.map((cell) => cell.modelCellHash)).size
      !== model.modelCellDomains.length
    || !same(model.modelCellDomains, [...model.modelCellDomains]
      .sort((left, right) => left.modelCellHash.localeCompare(right.modelCellHash)))
    || !exactKeys(model.domainCompatibility, ["currencies", "exposureUnits",
      "unitDefinitionHashes", "currencyConversionPerformed",
      "exposureUnitConversionPerformed", "crossCellPoolingPermitted"])
    || !same(model.domainCompatibility.currencies,
      [...new Set(model.modelCellDomains.map((cell) => cell.reportingCurrency))].sort())
    || !same(model.domainCompatibility.exposureUnits,
      [...new Set(model.modelCellDomains.map((cell) => cell.exposureUnit))].sort())
    || !same(model.domainCompatibility.unitDefinitionHashes,
      [...new Set(model.modelCellDomains.map((cell) => cell.unitDefinitionHash))].sort())
    || model.domainCompatibility.currencyConversionPerformed !== false
    || model.domainCompatibility.exposureUnitConversionPerformed !== false
    || model.domainCompatibility.crossCellPoolingPermitted !== false
    || !exactKeys(model.frequency, ["localClosedExposureWindows",
      "localZeroLossWindowsIncluded", "externallyGovernedCompleteWindows",
      "externallyGovernedZeroLossWindows", "completeDenominatorEstablished",
      "posteriorComputed", "estimate"])
    || model.frequency.externallyGovernedCompleteWindows !== 0
    || model.frequency.externallyGovernedZeroLossWindows !== 0
    || !Number.isSafeInteger(model.frequency.localClosedExposureWindows)
    || model.frequency.localClosedExposureWindows < 0
    || !Number.isSafeInteger(model.frequency.localZeroLossWindowsIncluded)
    || model.frequency.localZeroLossWindowsIncluded < 0
    || model.frequency.completeDenominatorEstablished !== false
    || model.frequency.posteriorComputed !== false || model.frequency.estimate !== null
    || !exactKeys(model.severity, ["localAdjudicatedMonetarySamples",
      "externallyGovernedAdjudicatedMonetarySamples",
      "currencyAndUnitDomainCompatibleForPooling", "severityDistributionComputed",
      "estimate", "tailValueAtRisk"])
    || model.severity.externallyGovernedAdjudicatedMonetarySamples !== 0
    || !Number.isSafeInteger(model.severity.localAdjudicatedMonetarySamples)
    || model.severity.localAdjudicatedMonetarySamples < 0
    || model.severity.severityDistributionComputed !== false
    || model.severity.estimate !== null || model.severity.tailValueAtRisk !== null
    || !exactKeys(model.censoring, ["pendingLocalWindows",
      "completeZeroLossWindowsRequired", "delayedReportingMaturityExternallyVerified",
      "truncationAndCensoringPolicyExternallyVerified", "censoringAdjustmentComputed"])
    || model.censoring.completeZeroLossWindowsRequired !== true
    || !Number.isSafeInteger(model.censoring.pendingLocalWindows)
    || model.censoring.pendingLocalWindows < 0
    || model.censoring.delayedReportingMaturityExternallyVerified !== false
    || model.censoring.truncationAndCensoringPolicyExternallyVerified !== false
    || model.censoring.censoringAdjustmentComputed !== false
    || !exactKeys(model.dependence, ["independenceClaimed",
      "correlationDiscountApplied", "connectedComponentCount",
      "structuralIndependentUpperBound", "splitPolicy", "trainCalibrationHoldoutAssigned",
      "dependenceRootsPreserved"])
    || model.dependence.independenceClaimed !== false
    || model.dependence.correlationDiscountApplied !== false
    || model.dependence.trainCalibrationHoldoutAssigned !== false
    || model.dependence.dependenceRootsPreserved !== true
    || !exactKeys(model.driftAndHoldout, ["prospectiveTemporalHoldoutPresent",
      "externalHoldoutPresent", "holdoutDependenceRootsDisjoint",
      "preRegisteredDriftThresholdsPresent", "recalibrationAuthorityEstablished"])
    || Object.values(model.driftAndHoldout).some((value) => value !== false)
    || !same(model.missingRequirements,
      sortedUnique(model.missingRequirements, "STAGE2_MODEL_REQUIREMENTS_INVALID",
        { minimum: 1 }))
    || ["EXTERNALLY_GOVERNED_COMPLETE_ZERO_LOSS_EXPOSURE_WINDOWS",
      "EXTERNALLY_GOVERNED_ADJUDICATED_MONETARY_SEVERITY",
      "EXTERNAL_TEMPORAL_HOLDOUT_WITH_DEPENDENCE_ROOT_ISOLATION",
      "CENSORING_AND_REPORTING_MATURITY_POLICY",
      "PROSPECTIVE_DRIFT_MONITOR_AND_RECALIBRATION_AUTHORITY",
      "INDEPENDENT_MODEL_REVIEW", "LEGAL_RATE_CAPITAL_AND_COVERAGE_AUTHORITY"]
      .some((requirement) => !model.missingRequirements.includes(requirement))
    || model.decision !== "ABSTAIN_MODEL_EVIDENCE_AND_AUTHORITY_INCOMPLETE"
    || !exactKeys(model.outputs, ["frequencyEstimate", "severityEstimate", "premium",
      "capital", "price", "coverage"])
    || Object.values(model.outputs).some((value) => value !== null)) {
    fail("STAGE2_MODEL_PIPELINE_BOUNDARY_INVALID");
  }
  for (const cell of model.modelCellDomains) {
    if (!exactKeys(cell, ["modelCellHash", "instrumentHash", "policyHash", "exposureUnit",
      "unitDefinitionHash", "reportingCurrency", "exposureWindows", "zeroLossWindows",
      "confirmedIncidents", "correlationComponents"])
      || [cell.modelCellHash, cell.instrumentHash, cell.policyHash,
        cell.unitDefinitionHash].some((value) => !HASH.test(value ?? ""))
      || !TOKEN.test(cell.exposureUnit ?? "") || !/^[A-Z]{3}$/.test(cell.reportingCurrency ?? "")
      || [cell.exposureWindows, cell.zeroLossWindows, cell.confirmedIncidents,
        cell.correlationComponents].some((value) => !Number.isSafeInteger(value) || value < 0)
      || cell.zeroLossWindows > cell.exposureWindows) {
      fail("STAGE2_MODEL_CELL_DOMAIN_INVALID");
    }
  }
  const exposureWindows = model.modelCellDomains.reduce((sum, cell) =>
    sum + cell.exposureWindows, 0);
  const zeroLossWindows = model.modelCellDomains.reduce((sum, cell) =>
    sum + cell.zeroLossWindows, 0);
  const confirmedIncidents = model.modelCellDomains.reduce((sum, cell) =>
    sum + cell.confirmedIncidents, 0);
  const compatible = model.domainCompatibility.currencies.length <= 1
    && model.domainCompatibility.exposureUnits.length <= 1
    && model.domainCompatibility.unitDefinitionHashes.length <= 1;
  if (model.frequency.localClosedExposureWindows !== exposureWindows
    || model.frequency.localZeroLossWindowsIncluded !== zeroLossWindows
    || model.severity.localAdjudicatedMonetarySamples !== confirmedIncidents
    || model.severity.currencyAndUnitDomainCompatibleForPooling !== compatible) {
    fail("STAGE2_MODEL_LOCAL_ACCOUNTING_OR_DOMAIN_INVALID");
  }
  const expectedModelDomainHash = digest(DOMAINS.modelDomain, {
    validityDomainHash: validity.validityDomainHash,
    factorPolicyHash: STAGE2_PRE_ACTION_FACTOR_POLICY_HASH,
    modelCellDomains: model.modelCellDomains,
  });
  if (bound.model.modelDomainHash !== expectedModelDomainHash) {
    fail("STAGE2_MODEL_DOMAIN_BINDING_INVALID");
  }
}

export function verifyStage2QuoteFrontierStructure(frontier) {
  try {
    if (!exactKeys(frontier, FRONTIER_KEYS)
      || frontier.schema !== STAGE2_QUOTE_FRONTIER_SCHEMAS.frontier
      || frontier.schemaVersion !== "1.0.0"
      || !HASH.test(frontier.frontierHash ?? "")) fail("STAGE2_FRONTIER_SCHEMA_INVALID");
    iso(frontier.createdAt, "STAGE2_FRONTIER_TIME_INVALID");
    if (!exactKeys(frontier.sourceReplay, SOURCE_REPLAY_RECEIPT_KEYS)
      || !same(frontier.sourceReplay, sourceReplayReceipt())) {
      fail("STAGE2_SOURCE_REPLAY_RECEIPT_INVALID");
    }
    if (!same(frontier.factorPolicy, STAGE2_PRE_ACTION_FACTOR_POLICY)) {
      fail("STAGE2_FACTOR_POLICY_INVALID");
    }
    validateBindings(frontier.bindings);
    validatePreAction(frontier.preAction);
    validateValidity(frontier.validityDomain, frontier.bindings);
    if (Date.parse(frontier.createdAt) < Date.parse(frontier.validityDomain.validFrom)
      || Date.parse(frontier.createdAt) >= Date.parse(frontier.validityDomain.validUntil)) {
      fail("STAGE2_FRONTIER_OUTSIDE_VALIDITY_DOMAIN");
    }
    validateModelPipeline(frontier.modelPipeline, frontier.bindings,
      frontier.validityDomain);
    if (!same(frontier.quoteBoundary, fixedQuoteBoundary())
      || !same(frontier.authority, fixedAuthority())) {
      fail("STAGE2_QUOTE_OR_AUTHORITY_BOUNDARY_INVALID");
    }
    const { frontierHash, ...body } = frontier;
    if (frontierHash !== digest(DOMAINS.frontier, body)) {
      fail("STAGE2_FRONTIER_HASH_INVALID");
    }
    return deepFreeze({ ok: true, verificationLevel: "SELF_SEALED_STRUCTURE_ONLY",
      sourceReverified: false, sourceArtifactsReplayed: false,
      bindingHashes: frontierBindingReceipt(frontier), pricingEligible: false,
      bindingQuote: false, price: null, premium: null, capital: null });
  } catch (error) {
    return deepFreeze({ ok: false, error: error instanceof Error ? error.message : String(error),
      verificationLevel: "INVALID", sourceArtifactsReplayed: false,
      sourceReverified: false,
      pricingEligible: false, bindingQuote: false,
      price: null, premium: null, capital: null });
  }
}

export function verifyStage2QuoteFrontier(frontier, sources) {
  const structural = verifyStage2QuoteFrontierStructure(frontier);
  if (!structural.ok) return structural;
  try {
    const rebuilt = buildStage2QuoteFrontier({ createdAt: frontier.createdAt, sources });
    if (!same(rebuilt, frontier)) fail("STAGE2_FRONTIER_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true,
      verificationLevel: "FULL_ATTEST_CURATE_REALITY_EMPIRICAL_LOSS_SOURCES_REPLAYED",
      sourceReverified: true, sourceArtifactsReplayed: true,
      bindingHashes: frontierBindingReceipt(frontier), stage05BytesReplayed: true,
      signedAttestationReplayed: true, curateDerivationReplayed: true,
      realityGraphReplayed: true, empiricalLedgerReplayed: true,
      lossExposureDerivationsReplayed: true, pricingEligible: false,
      bindingQuote: false, price: null, premium: null, capital: null });
  } catch (error) {
    return deepFreeze({ ok: false, error: error instanceof Error ? error.message : String(error),
      verificationLevel: "INVALID", sourceArtifactsReplayed: false,
      sourceReverified: false,
      pricingEligible: false, bindingQuote: false,
      price: null, premium: null, capital: null });
  }
}

const QUOTE_KEYS = Object.freeze([
  "schema", "schemaVersion", "requestedAt", "validFrom", "validUntil",
  "frontierHash", "identity", "quoteIdentityHash", "priorQuoteHashes",
  "priorQuoteSetHash", "bindings", "decision", "financialOutputs",
  "permissions", "authority", "candidateHash",
]);

function quoteIdentity(frontier) {
  return {
    claimHash: frontier.bindings.reality.claimHash,
    wayHash: frontier.bindings.reality.wayHash,
    worldHash: frontier.bindings.reality.worldHash,
    registryHash: frontier.bindings.registry.registryHash,
    realityEnvelopeHash: frontier.bindings.reality.envelopeHash,
    modelDomainHash: frontier.bindings.model.modelDomainHash,
    factorPolicyHash: frontier.bindings.model.factorPolicyHash,
    validityDomainHash: frontier.bindings.model.validityDomainHash,
    rightsReferenceHash: frontier.bindings.rights.declaredExperienceRightsReferenceHash,
    evidenceSetHash: frontier.bindings.evidenceSetHash,
  };
}

function quoteBindings(frontier) {
  return {
    claimWayWorld: {
      claimHash: frontier.bindings.reality.claimHash,
      wayHash: frontier.bindings.reality.wayHash,
      worldHash: frontier.bindings.reality.worldHash,
    },
    registry: {
      registryHash: frontier.bindings.registry.registryHash,
      clearanceHash: frontier.bindings.registry.clearanceHash,
      disposition: "QUARANTINED",
      causalExperienceUnits: 0,
    },
    reality: {
      envelopeHash: frontier.bindings.reality.envelopeHash,
      sourceEvidenceAnchorHash: frontier.bindings.reality.sourceEvidenceAnchorHash,
      consequenceObligationOpen: true,
    },
    model: {
      modelVersion: "UNFIT_NO_MODEL",
      modelHash: null,
      modelDomainHash: frontier.bindings.model.modelDomainHash,
      factorPolicyHash: frontier.bindings.model.factorPolicyHash,
      validityDomainHash: frontier.bindings.model.validityDomainHash,
      externalHoldoutHash: null,
    },
    rights: {
      referenceHash: frontier.bindings.rights.declaredExperienceRightsReferenceHash,
      externallyVerified: false,
      pricingUseVerified: false,
    },
    evidence: {
      evidenceSetHash: frontier.bindings.evidenceSetHash,
      evidenceHashes: [...frontier.bindings.evidenceHashes],
    },
  };
}

function fixedQuoteDecision() {
  return {
    status: "NON_BINDING_ABSTAIN",
    reasonCodes: [
      "EXTERNAL_HOLDOUT_MISSING",
      "EXTERNALLY_GOVERNED_LOSS_EXPOSURE_MISSING",
      "NO_FITTED_MODEL",
      "NO_PROSPECTIVE_PRE_ACTION_FACTOR_VECTOR",
      "PRICING_COVERAGE_AND_CAPITAL_AUTHORITY_MISSING",
      "RIGHTS_NOT_EXTERNALLY_VERIFIED_FOR_PRICING",
    ],
    quoteEligible: false,
    binding: false,
  };
}

function nullFinancialOutputs() {
  return {
    currency: null,
    frequencyEstimate: null,
    severityEstimate: null,
    premium: null,
    capital: null,
    price: null,
    coverage: null,
    guarantee: null,
    settlementInstruction: null,
  };
}

function zeroPermissions() {
  return {
    PRICE: false,
    PREMIUM: false,
    CAPITAL: false,
    COVERAGE: false,
    GUARANTEE: false,
    SETTLE: false,
    MOVE_FUNDS: false,
    TRAIN: false,
    DEPLOY: false,
  };
}

function quoteBindingReceipt(candidate) {
  return deepFreeze({
    candidateHash: candidate.candidateHash,
    quoteIdentityHash: candidate.quoteIdentityHash,
    frontierHash: candidate.frontierHash,
    claimHash: candidate.identity.claimHash,
    wayHash: candidate.identity.wayHash,
    worldHash: candidate.identity.worldHash,
    registryHash: candidate.identity.registryHash,
    realityEnvelopeHash: candidate.identity.realityEnvelopeHash,
    factorPolicyHash: candidate.identity.factorPolicyHash,
    modelDomainHash: candidate.identity.modelDomainHash,
    validityDomainHash: candidate.identity.validityDomainHash,
    rightsReferenceHash: candidate.identity.rightsReferenceHash,
    evidenceSetHash: candidate.identity.evidenceSetHash,
  });
}

export function buildStage2QuoteCandidate(input) {
  if (!exactKeys(input, ["frontier", "sources", "requestedAt", "validFrom",
    "validUntil", "priorCandidates"])) fail("STAGE2_QUOTE_INPUT_SCHEMA_INVALID");
  const verified = verifyStage2QuoteFrontier(input.frontier, input.sources);
  if (!verified.ok || verified.sourceArtifactsReplayed !== true) {
    fail("STAGE2_QUOTE_FRONTIER_SOURCE_REPLAY_REQUIRED", verified.error);
  }
  const requestedAt = iso(input.requestedAt, "STAGE2_QUOTE_REQUEST_TIME_INVALID");
  const validFrom = iso(input.validFrom, "STAGE2_QUOTE_VALID_FROM_INVALID");
  const validUntil = iso(input.validUntil, "STAGE2_QUOTE_VALID_UNTIL_INVALID");
  if (Date.parse(validFrom) < Date.parse(requestedAt)
    || Date.parse(validUntil) <= Date.parse(validFrom)) {
    fail("STAGE2_QUOTE_VALIDITY_WINDOW_INVALID");
  }
  if (Date.parse(requestedAt) < Date.parse(input.frontier.createdAt)
    || Date.parse(validFrom) < Date.parse(input.frontier.validityDomain.validFrom)
    || Date.parse(validUntil) > Date.parse(input.frontier.validityDomain.validUntil)) {
    fail("STAGE2_QUOTE_OUTSIDE_FRONTIER_VALIDITY_DOMAIN");
  }
  if (!Array.isArray(input.priorCandidates) || input.priorCandidates.length > 100_000) {
    fail("STAGE2_PRIOR_QUOTE_SET_INVALID");
  }
  const identity = quoteIdentity(input.frontier);
  const quoteIdentityHash = digest(DOMAINS.quoteIdentity, identity);
  for (const prior of input.priorCandidates) {
    const checked = verifyStage2QuoteCandidateStructure(prior);
    if (!checked.ok) fail("STAGE2_PRIOR_QUOTE_INVALID", checked.error);
    if (prior.quoteIdentityHash === quoteIdentityHash) fail("STAGE2_QUOTE_REPLAY");
  }
  const priorQuoteHashes = sortedUnique(input.priorCandidates
    .map((candidate) => candidate.candidateHash), "STAGE2_PRIOR_QUOTE_HASH_SET_INVALID");
  const priorQuoteSetHash = digest(DOMAINS.priorQuoteSet, priorQuoteHashes);
  const body = {
    schema: STAGE2_QUOTE_FRONTIER_SCHEMAS.quoteCandidate,
    schemaVersion: "1.0.0",
    requestedAt,
    validFrom,
    validUntil,
    frontierHash: input.frontier.frontierHash,
    identity,
    quoteIdentityHash,
    priorQuoteHashes,
    priorQuoteSetHash,
    bindings: quoteBindings(input.frontier),
    decision: fixedQuoteDecision(),
    financialOutputs: nullFinancialOutputs(),
    permissions: zeroPermissions(),
    authority: fixedAuthority(),
  };
  const candidate = deepFreeze({ ...body,
    candidateHash: digest(DOMAINS.quoteCandidate, body) });
  const checked = verifyStage2QuoteCandidateStructure(candidate,
    { frontier: input.frontier, priorCandidates: input.priorCandidates });
  if (!checked.ok) fail("STAGE2_QUOTE_SELF_VERIFICATION_FAILED", checked.error);
  return candidate;
}

function validateQuoteBindings(bound, frontier) {
  if (!exactKeys(bound, ["claimWayWorld", "registry", "reality", "model", "rights",
    "evidence"])
    || !exactKeys(bound.claimWayWorld, ["claimHash", "wayHash", "worldHash"])
    || !exactKeys(bound.registry, ["registryHash", "clearanceHash", "disposition",
      "causalExperienceUnits"])
    || !exactKeys(bound.reality, ["envelopeHash", "sourceEvidenceAnchorHash",
      "consequenceObligationOpen"])
    || !exactKeys(bound.model, ["modelVersion", "modelHash", "modelDomainHash",
      "factorPolicyHash", "validityDomainHash", "externalHoldoutHash"])
    || !exactKeys(bound.rights, ["referenceHash", "externallyVerified",
      "pricingUseVerified"])
    || !exactKeys(bound.evidence, ["evidenceSetHash", "evidenceHashes"])
    || [bound.claimWayWorld.claimHash, bound.claimWayWorld.wayHash,
      bound.claimWayWorld.worldHash, bound.registry.registryHash,
      bound.registry.clearanceHash, bound.reality.envelopeHash,
      bound.reality.sourceEvidenceAnchorHash, bound.model.modelDomainHash,
      bound.model.factorPolicyHash, bound.model.validityDomainHash,
      bound.rights.referenceHash, bound.evidence.evidenceSetHash]
      .some((value) => !HASH.test(value ?? ""))
    || bound.registry.disposition !== "QUARANTINED"
    || bound.registry.causalExperienceUnits !== 0
    || bound.reality.consequenceObligationOpen !== true
    || bound.model.modelVersion !== "UNFIT_NO_MODEL" || bound.model.modelHash !== null
    || bound.model.externalHoldoutHash !== null
    || bound.rights.externallyVerified !== false
    || bound.rights.pricingUseVerified !== false
    || !validHashSet(bound.evidence.evidenceHashes, { minimum: 1 })
    || bound.evidence.evidenceSetHash
      !== digest(DOMAINS.evidenceSet, bound.evidence.evidenceHashes)) {
    fail("STAGE2_QUOTE_BINDING_INVALID");
  }
  if (frontier !== null && !same(bound, quoteBindings(frontier))) {
    fail("STAGE2_QUOTE_FRONTIER_BINDING_MISMATCH");
  }
}

export function verifyStage2QuoteCandidateStructure(candidate, context = null) {
  try {
    if (!exactKeys(candidate, QUOTE_KEYS)
      || candidate.schema !== STAGE2_QUOTE_FRONTIER_SCHEMAS.quoteCandidate
      || candidate.schemaVersion !== "1.0.0"
      || !HASH.test(candidate.frontierHash ?? "")
      || !HASH.test(candidate.quoteIdentityHash ?? "")
      || !HASH.test(candidate.priorQuoteSetHash ?? "")
      || !HASH.test(candidate.candidateHash ?? "")) {
      fail("STAGE2_QUOTE_SCHEMA_INVALID");
    }
    const requestedAt = iso(candidate.requestedAt, "STAGE2_QUOTE_REQUEST_TIME_INVALID");
    const validFrom = iso(candidate.validFrom, "STAGE2_QUOTE_VALID_FROM_INVALID");
    const validUntil = iso(candidate.validUntil, "STAGE2_QUOTE_VALID_UNTIL_INVALID");
    if (Date.parse(validFrom) < Date.parse(requestedAt)
      || Date.parse(validUntil) <= Date.parse(validFrom)) {
      fail("STAGE2_QUOTE_VALIDITY_WINDOW_INVALID");
    }
    if (!exactKeys(candidate.identity, ["claimHash", "wayHash", "worldHash",
      "registryHash", "realityEnvelopeHash", "modelDomainHash", "factorPolicyHash",
      "validityDomainHash", "rightsReferenceHash", "evidenceSetHash"])
      || Object.values(candidate.identity).some((value) => !HASH.test(value ?? ""))
      || candidate.quoteIdentityHash !== digest(DOMAINS.quoteIdentity, candidate.identity)
      || !validHashSet(candidate.priorQuoteHashes)
      || candidate.priorQuoteSetHash !== digest(DOMAINS.priorQuoteSet,
        candidate.priorQuoteHashes)) {
      fail("STAGE2_QUOTE_IDENTITY_OR_PREFIX_INVALID");
    }
    let frontier = null;
    let priorCandidates = null;
    if (context !== null) {
      if (!exactKeys(context, ["frontier", "priorCandidates"])) {
        fail("STAGE2_QUOTE_VERIFY_CONTEXT_SCHEMA_INVALID");
      }
      frontier = context.frontier;
      priorCandidates = context.priorCandidates;
      const frontierCheck = verifyStage2QuoteFrontierStructure(frontier);
      if (!frontierCheck.ok || candidate.frontierHash !== frontier.frontierHash
        || !same(candidate.identity, quoteIdentity(frontier))) {
        fail("STAGE2_QUOTE_FRONTIER_INVALID_OR_MISMATCH");
      }
      if (Date.parse(candidate.requestedAt) < Date.parse(frontier.createdAt)
        || Date.parse(candidate.validFrom) < Date.parse(frontier.validityDomain.validFrom)
        || Date.parse(candidate.validUntil) > Date.parse(frontier.validityDomain.validUntil)) {
        fail("STAGE2_QUOTE_OUTSIDE_FRONTIER_VALIDITY_DOMAIN");
      }
      if (!Array.isArray(priorCandidates)
        || priorCandidates.some((prior) => prior.candidateHash === candidate.candidateHash)
        || !same(candidate.priorQuoteHashes,
          priorCandidates.map((prior) => prior.candidateHash).sort())) {
        fail("STAGE2_QUOTE_PRIOR_PREFIX_MISMATCH");
      }
      for (const prior of priorCandidates) {
        const checked = verifyStage2QuoteCandidateStructure(prior);
        if (!checked.ok || prior.quoteIdentityHash === candidate.quoteIdentityHash) {
          fail("STAGE2_QUOTE_REPLAY_OR_INVALID_PRIOR");
        }
      }
    }
    validateQuoteBindings(candidate.bindings, frontier);
    if (!same(candidate.decision, fixedQuoteDecision())
      || !same(candidate.financialOutputs, nullFinancialOutputs())
      || !same(candidate.permissions, zeroPermissions())
      || !same(candidate.authority, fixedAuthority())) {
      fail("STAGE2_QUOTE_AUTHORITY_PROMOTION");
    }
    const { candidateHash, ...body } = candidate;
    if (candidateHash !== digest(DOMAINS.quoteCandidate, body)) {
      fail("STAGE2_QUOTE_HASH_INVALID");
    }
    return deepFreeze({ ok: true, verificationLevel: context === null
      ? "SELF_SEALED_STRUCTURE_ONLY" : "FRONTIER_AND_LOCAL_PREFIX_REPLAYED",
    sourceReverified: false, sourceArtifactsReplayed: false,
    bindingHashes: quoteBindingReceipt(candidate), decision: "NON_BINDING_ABSTAIN",
    binding: false, price: null, premium: null, capital: null,
    permitsCoverage: false, permitsGuarantee: false, permitsSettlement: false });
  } catch (error) {
    return deepFreeze({ ok: false, error: error instanceof Error ? error.message : String(error),
      verificationLevel: "INVALID", sourceArtifactsReplayed: false,
      sourceReverified: false,
      decision: "NON_BINDING_ABSTAIN", binding: false,
      price: null, premium: null, capital: null,
      permitsCoverage: false, permitsGuarantee: false, permitsSettlement: false });
  }
}

export function verifyStage2QuoteCandidate(candidate, context) {
  if (!exactKeys(context, ["frontier", "sources", "priorCandidates"])) {
    return deepFreeze({ ok: false, error: "STAGE2_QUOTE_FULL_CONTEXT_SCHEMA_INVALID",
      verificationLevel: "INVALID", sourceReverified: false, sourceArtifactsReplayed: false,
      decision: "NON_BINDING_ABSTAIN", binding: false,
      price: null, premium: null, capital: null });
  }
  const structural = verifyStage2QuoteCandidateStructure(candidate, {
    frontier: context.frontier, priorCandidates: context.priorCandidates,
  });
  if (!structural.ok) return structural;
  try {
    const rebuilt = buildStage2QuoteCandidate({
      frontier: context.frontier,
      sources: context.sources,
      requestedAt: candidate.requestedAt,
      validFrom: candidate.validFrom,
      validUntil: candidate.validUntil,
      priorCandidates: context.priorCandidates,
    });
    if (!same(rebuilt, candidate)) fail("STAGE2_QUOTE_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true,
      verificationLevel: "FULL_SOURCE_FRONTIER_AND_LOCAL_PREFIX_REPLAYED",
      sourceReverified: true, sourceArtifactsReplayed: true,
      bindingHashes: quoteBindingReceipt(candidate), decision: "NON_BINDING_ABSTAIN",
      binding: false, price: null, premium: null, capital: null,
      permitsCoverage: false, permitsGuarantee: false, permitsSettlement: false });
  } catch (error) {
    return deepFreeze({ ok: false, error: error instanceof Error ? error.message : String(error),
      verificationLevel: "INVALID", sourceArtifactsReplayed: false,
      sourceReverified: false,
      decision: "NON_BINDING_ABSTAIN", binding: false,
      price: null, premium: null, capital: null,
      permitsCoverage: false, permitsGuarantee: false, permitsSettlement: false });
  }
}

export function describeStage2QuoteFrontier() {
  return deepFreeze({
    sources: "exact ATTEST + CURATE + Reality + empirical-factor + loss/exposure replay",
    preAction: "prospective timestamped source-replayed receipt required; currently absent",
    model: "complete externally governed zero-loss exposure, adjudicated severity, censoring, dependence, drift and external holdout required",
    quote: "NON_BINDING_ABSTAIN",
    outputs: nullFinancialOutputs(),
    authority: fixedAuthority(),
  });
}
