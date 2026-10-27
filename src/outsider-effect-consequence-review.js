/*
 * Conservative effect-to-consequence review projector.
 *
 * Provider patterns and official-source candidates may widen the questions a
 * reviewer must answer. They are not source truth, effect closure, affected-
 * party completeness, evidence coverage, responsibility coverage, authority,
 * or permission to act. This module performs no network access, payload
 * ingestion, third-party execution, training, or Reality-obligation closure.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  DELEGATION_RADIUS_ATOMS,
  delegationRadiusLeq,
  verifyDelegationRadius,
} from "./outsider-delegation-radius.js";
import {
  buildProviderPatternRegistry,
  buildProviderPatternReviewProjection,
  listProviderPatternEntities,
  verifyProviderPatternRegistry,
  verifyProviderPatternReviewProjection,
} from "./outsider-provider-pattern-registry.js";
import {
  buildRealitySourceReviewProjection,
  buildRealitySourceScout,
  listRealitySourceCandidates,
  verifyRealitySourceReviewProjection,
  verifyRealitySourceScout,
} from "./outsider-reality-source-scout.js";

export const EFFECT_CONSEQUENCE_REVIEW_SCHEMA
  = "outsider/effect-consequence-review-projection/v1";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_SELECTIONS = 128;

/* Capture the intrinsics used at this boundary. canonicalizeStrict separately
 * captures its traversal primitives, so post-import global mutation cannot
 * turn accessors, sparse arrays, or exotic objects into accepted input. */
const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ObjectPrototype = Object.prototype;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectIsFrozen = Object.isFrozen;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const ErrorConstructor = Error;
const StringConstructor = String;

function fail(code) {
  throw new TypeError(`EFFECT_CONSEQUENCE_REVIEW_${code}`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] === "length") continue;
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
  }
  return ObjectFreeze(value);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function denseArray(value, code, { nonempty = false, maximum = MAX_SELECTIONS } = {}) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum || (nonempty && value.length === 0)) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1 || keys[keys.length - 1] !== "length") {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (keys[index] !== StringConstructor(index)) fail(`${code}_DENSE_ARRAY_REQUIRED`);
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      fail(`${code}_DENSE_ARRAY_REQUIRED`);
    }
  }
  return value;
}

function plainDataObject(value) {
  if (!value || typeof value !== "object" || ArrayIsArray(value)) return false;
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) return false;
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== "string") return false;
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      return false;
    }
  }
  return true;
}

function exactObject(value, expectedKeys, code) {
  if (!plainDataObject(value)) fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  const actual = ReflectOwnKeys(value);
  if (actual.length !== expectedKeys.length) fail(`${code}_FIELDS_INVALID`);
  for (let expectedIndex = 0; expectedIndex < expectedKeys.length; expectedIndex += 1) {
    let found = false;
    for (let actualIndex = 0; actualIndex < actual.length; actualIndex += 1) {
      if (actual[actualIndex] === expectedKeys[expectedIndex]) {
        found = true;
        break;
      }
    }
    if (!found) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function exactOptions(value, allowedKeys, code) {
  if (!plainDataObject(value)) fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  const actual = ReflectOwnKeys(value);
  for (let index = 0; index < actual.length; index += 1) {
    let allowed = false;
    for (let allowedIndex = 0; allowedIndex < allowedKeys.length; allowedIndex += 1) {
      if (actual[index] === allowedKeys[allowedIndex]) {
        allowed = true;
        break;
      }
    }
    if (!allowed) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function sortStrings(values) {
  return ArraySort(values, (left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function sortedUnique(values) {
  sortStrings(values);
  const result = new ArrayConstructor();
  for (let index = 0; index < values.length; index += 1) {
    if (index === 0 || values[index] !== values[index - 1]) {
      result[result.length] = values[index];
    }
  }
  return result;
}

function append(target, values) {
  for (let index = 0; index < values.length; index += 1) {
    if (typeof values[index] !== "string" || values[index].length === 0) {
      fail("DEPENDENCY_REQUIREMENT_INVALID");
    }
    target[target.length] = values[index];
  }
}

function normalizeIdSet(value, code) {
  denseArray(value, code, { nonempty: true });
  const result = new ArrayConstructor(value.length);
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string" || value[index].length === 0
      || value[index].length > 160) fail(`${code}_ID_INVALID`);
    result[index] = value[index];
  }
  sortStrings(result);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] === result[index - 1]) fail(`${code}_DUPLICATE`);
  }
  return result;
}

function normalizeBindings(value) {
  exactObject(value, ["claimWayWorld", "run", "action"], "BINDINGS");
  exactObject(value.claimWayWorld, ["claimHash", "wayHash", "worldHash"],
    "CLAIM_WAY_WORLD_BINDINGS");
  exactObject(value.run, ["episodeHash", "attemptHash", "censusHash"],
    "RUN_BINDINGS");
  exactObject(value.action, ["proposedActionHash", "beforeStateHash",
    "adapterDescriptorHash", "resourceTopologyHash", "projectorPolicyHash"],
  "ACTION_BINDINGS");
  return {
    claimWayWorld: {
      claimHash: hash(value.claimWayWorld.claimHash, "CLAIM_HASH"),
      wayHash: hash(value.claimWayWorld.wayHash, "WAY_HASH"),
      worldHash: hash(value.claimWayWorld.worldHash, "WORLD_HASH"),
    },
    run: {
      episodeHash: hash(value.run.episodeHash, "EPISODE_HASH"),
      attemptHash: hash(value.run.attemptHash, "ATTEMPT_HASH"),
      censusHash: hash(value.run.censusHash, "CENSUS_HASH"),
    },
    action: {
      proposedActionHash: hash(value.action.proposedActionHash,
        "PROPOSED_ACTION_HASH"),
      beforeStateHash: hash(value.action.beforeStateHash, "BEFORE_STATE_HASH"),
      adapterDescriptorHash: hash(value.action.adapterDescriptorHash,
        "ADAPTER_DESCRIPTOR_HASH"),
      resourceTopologyHash: hash(value.action.resourceTopologyHash,
        "RESOURCE_TOPOLOGY_HASH"),
      projectorPolicyHash: hash(value.action.projectorPolicyHash,
        "PROJECTOR_POLICY_HASH"),
    },
  };
}

function requireRadius(value, code) {
  canonicalizeStrict(value);
  const radiusHash = plainDataObject(value) ? value.radiusHash : null;
  const checked = verifyDelegationRadius(value, {
    expectedRadiusHash: hash(radiusHash, `${code}_HASH`),
  });
  if (!checked.ok) fail(`${code}_INVALID:${checked.error}`);
  if (checked.empty) fail(`${code}_EMPTY`);
  return value;
}

function sameStringArray(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function requireAllReviewedSelections(providerEntityIds, officialSourceIds) {
  const allProviders = normalizeIdSet(listProviderPatternEntities(),
    "CURRENT_PROVIDER_ENTITY_IDS");
  const allSources = normalizeIdSet(listRealitySourceCandidates(),
    "CURRENT_OFFICIAL_SOURCE_IDS");
  if (!sameStringArray(providerEntityIds, allProviders)) {
    fail("PROVIDER_SELECTION_MUST_EQUAL_ALL_REVIEWED_ENTITIES");
  }
  if (!sameStringArray(officialSourceIds, allSources)) {
    fail("SOURCE_SELECTION_MUST_EQUAL_ALL_REVIEWED_CANDIDATES");
  }
}

function requirementFloor(atom, evidence, responsibility, controls, channels, horizons) {
  return { atom, evidence, responsibility, controls, channels, horizons };
}

const EFFECT_ATOM_FLOORS = deepFreeze([
  requirementFloor("OBSERVE",
    ["CAPTURE_ATTEMPT", "MISSINGNESS_AND_DROPOUT", "OBSERVATION_SOURCE_IDENTITY"],
    ["DATA_SUBJECT_AND_BYSTANDER", "RETENTION_AND_REUSE_OWNER"],
    ["MINIMUM_NECESSARY_OBSERVATION", "NO_OUTCOME_INFERENCE_FROM_OBSERVATION"],
    ["OBSERVATION_CONTENT", "PRIVACY", "RETENTION"],
    ["CAPTURE_TIME", "RETENTION_EXPIRY"]),
  requirementFloor("PROPOSE",
    ["ACCEPT_OR_REJECT", "DECISION_USE", "PROPOSAL_CONTENT", "RECIPIENT"],
    ["DECISION_OWNER", "RELIANT_PARTY"],
    ["NO_RELIANCE_WITHOUT_OWNER_ADOPTION", "PROPOSAL_IS_NOT_ACTION"],
    ["PROPOSAL_DELIVERY", "RELIANCE"],
    ["BEFORE_RELIANCE", "POST_DECISION_REVIEW"]),
  requirementFloor("WRITE_REVERSIBLE",
    ["DIFF", "POST_STATE_HASH", "PRE_STATE_HASH", "ROLLBACK_ATTEMPT_AND_RESULT"],
    ["DOWNSTREAM_STATE_OWNER", "ROLLBACK_OWNER"],
    ["OWNER_APPROVAL_BEFORE_COMMIT", "ROLLBACK_PATH_PROVEN_BEFORE_WRITE"],
    ["REVERSIBLE_STATE_CHANGE", "ROLLBACK"],
    ["POST_WRITE_VERIFICATION", "ROLLBACK_EXPIRY"]),
  requirementFloor("WRITE_IRREVERSIBLE",
    ["DESTINATION_IDENTITY", "IRREVERSIBILITY_BOUNDARY", "RECEIPT", "WRITE_RESULT"],
    ["COMPENSATION_OWNER", "DESTINATION_OWNER", "REMEDY_OWNER"],
    ["EXPLICIT_IRREVERSIBLE_OWNER_AUTHORITY", "NO_ROLLBACK_CLAIM"],
    ["IRREVERSIBLE_STATE_CHANGE", "REMEDY_OR_COMPENSATION"],
    ["DELIVERY_FINALITY", "LONG_TAIL_REMEDY"]),
  requirementFloor("PHYSICAL_ACTUATE",
    ["CALIBRATION", "COMMAND_ATTEMPT", "DEVICE_IDENTITY", "E_STOP",
      "IMMEDIATE_AND_DELAYED_OUTCOME", "SPEED_FORCE_ENERGY_LIMITS", "TELEMETRY"],
    ["BYSTANDERS", "DEVICE_OWNER", "PHYSICAL_RECOVERY_OWNER"],
    ["ABORT_AND_E_STOP", "CONSERVATIVE_PHYSICAL_EFFECT_ENVELOPE",
      "ONE_USE_PHYSICAL_COMMAND"],
    ["BYSTANDER_HARM", "DEVICE_STATE", "PHYSICAL_ENVIRONMENT", "RECOVERY"],
    ["PRE_ACTUATION_CALIBRATION", "IMMEDIATE_PHYSICAL_OUTCOME",
      "DELAYED_PHYSICAL_OUTCOME"]),
  requirementFloor("DELEGATE",
    ["CHILD_RADIUS", "DELEGATION_ATTEMPT", "FORK_LINEAGE", "PARENT_BUDGET_DEBIT"],
    ["CHILD_EFFECT_RECONCILIATION_OWNER", "PARENT_DELEGATOR"],
    ["CHILD_RADIUS_CONTRACTION", "NO_AUTHORITY_BY_DELEGATION_HASH"],
    ["CHILD_ACTION", "CHILD_PARTIAL_EFFECT", "PARENT_BUDGET"],
    ["CHILD_START", "CHILD_QUIESCENCE", "CHILD_LATE_EFFECT"]),
  requirementFloor("PERSIST",
    ["DELETION_RESULT", "PERSISTED_CONTENT_HASH", "RETENTION_POLICY", "STORE_IDENTITY"],
    ["DATA_CUSTODIAN", "DATA_SUBJECT", "DELETION_OWNER"],
    ["MINIMUM_RETENTION", "OWNER_AUTHORITY_FOR_STORAGE"],
    ["DATA_PERSISTENCE", "DELETION", "REUSE"],
    ["PERSISTENCE_CONFIRMATION", "RETENTION_EXPIRY", "DELETION_VERIFICATION"]),
  requirementFloor("SCHEDULE",
    ["CANCELLATION_STATE", "SCHEDULE_ID", "TRIGGER_CONDITION", "TRIGGER_RESULT"],
    ["FUTURE_AFFECTED_PARTY", "SCHEDULE_OWNER"],
    ["AUTHORITY_RECHECK_AT_TRIGGER", "CANCEL_BEFORE_EFFECT"],
    ["FUTURE_EXECUTION", "SCHEDULE_CANCELLATION"],
    ["SCHEDULE_CREATION", "TRIGGER_TIME", "POST_TRIGGER_RECONCILIATION"]),
  requirementFloor("TRAIN",
    ["DATA_PROVENANCE", "EVALUATION_DENOMINATOR", "MODEL_ARTIFACT_HASH",
      "PRIVACY_REVIEW", "TRAINING_ATTEMPT", "TRAINING_RIGHTS"],
    ["DATA_SUBJECT", "MODEL_DEPLOYER", "RIGHTSHOLDER"],
    ["NO_TRAINING_WITH_UNRESOLVED_RIGHTS", "NO_TRAINING_ROW_FROM_REVIEW_METADATA"],
    ["DATA_REUSE", "MODEL_BEHAVIOR", "PRIVACY_OR_RIGHTS_HARM"],
    ["PRE_TRAINING_ADMISSION", "POST_TRAINING_EVALUATION", "POST_DEPLOYMENT_MONITORING"]),
  requirementFloor("PRICE",
    ["COUNTERPARTY", "PRICE_BASIS", "QUOTE_ATTEMPT", "QUOTE_RESULT"],
    ["CUSTOMER_OR_COUNTERPARTY", "PRICING_OWNER"],
    ["NO_PRICE_FROM_UNCALIBRATED_REVIEW_SOURCE", "OWNER_ADOPTION_OF_PRICE"],
    ["PRICE_QUOTE", "RELIANCE_OR_ACCEPTANCE"],
    ["QUOTE_TIME", "ACCEPTANCE_WINDOW", "POST_TRANSACTION_REVIEW"]),
  requirementFloor("GUARANTEE",
    ["BENEFICIARY", "GUARANTEE_TERMS", "RESERVE_OR_BACKING", "TRIGGER_CONDITION"],
    ["BENEFICIARY", "GUARANTOR", "LOSS_BEARER"],
    ["EXTERNAL_GUARANTEE_AUTHORITY", "NO_GUARANTEE_FROM_MODEL_CONFIDENCE"],
    ["GUARANTEED_EVENT", "LOSS", "PAYOUT_OR_REMEDY"],
    ["GUARANTEE_ISSUANCE", "CLAIM_WINDOW", "TAIL_CLAIM_REOPEN"]),
  requirementFloor("SETTLE",
    ["AMOUNT_OR_TERMS", "FINALITY_BOUNDARY", "PARTY_ACKNOWLEDGEMENTS",
      "SETTLEMENT_ATTEMPT", "SETTLEMENT_RESULT"],
    ["AFFECTED_CLAIMANT", "SETTLEMENT_PARTIES", "SETTLEMENT_REVIEW_OWNER"],
    ["EXTERNAL_SETTLEMENT_AUTHORITY", "LATE_FACT_REOPEN"],
    ["CLAIM_RESOLUTION", "PAYMENT_OR_PERFORMANCE", "WAIVER_OR_RELEASE"],
    ["SETTLEMENT_TIME", "PERFORMANCE_DUE", "LATE_FACT_REVIEW"]),
  requirementFloor("MOVE_FUNDS",
    ["AMOUNT_AND_CURRENCY", "FUNDS_MOVEMENT_ATTEMPT", "PAYEE_IDENTITY",
      "PAYER_IDENTITY", "PROVIDER_RESULT"],
    ["ACCOUNT_OWNER", "BENEFICIARY", "DISPUTE_AND_REVERSAL_OWNER"],
    ["EXTERNAL_FUNDS_AUTHORITY", "PAYEE_ALLOWLIST", "ONE_USE_TRANSFER"],
    ["BALANCE_CHANGE", "FEE", "FUNDS_TRANSFER", "REVERSAL_OR_DISPUTE"],
    ["PRE_TRANSFER", "PROVIDER_FINALITY", "REVERSAL_WINDOW"]),
  requirementFloor("CLOSE_OBLIGATION",
    ["ADJUDICATOR_IDENTITY", "ALL_MANDATORY_HORIZONS", "CLOSURE_ATTEMPT",
      "CLOSURE_BASIS", "LATE_FACT_CHANNEL"],
    ["AFFECTED_PARTY_CHALLENGE", "CLOSURE_ADJUDICATOR", "REOPEN_OWNER"],
    ["NO_LOCAL_SUCCESS_CLOSURE", "PRODUCTION_CLOSE_API_ABSENT", "REOPEN_ON_LATE_FACT"],
    ["OBLIGATION_CLOSURE", "REOPEN", "UNRESOLVED_CONSEQUENCE"],
    ["MANDATORY_HORIZON_COMPLETION", "CLOSURE_REVIEW", "POST_CLOSURE_LATE_FACT"]),
]);

const BASE = deepFreeze({
  evidence: ["ATTEMPT_RECORD", "BEFORE_STATE_HASH", "EFFECT_RADIUS_HASH",
    "PARTIAL_EFFECT_RECORD", "TERMINAL_OR_TIMEOUT_STATE"],
  responsibility: ["AFFECTED_PARTY_REGISTER", "CHALLENGE_AND_REOPEN_OWNER",
    "REMEDIATION_OWNER", "RESOURCE_OWNER"],
  controls: ["DEFAULT_DENY_UNMODELED_EFFECT", "EXTERNAL_OWNER_AUTHORITY_REQUIRED",
    "ONE_USE_DECISION_REQUIRED", "REVOCATION_CHECK_REQUIRED"],
  channels: ["ACTION_ATTEMPT", "PARTIAL_EFFECT", "REMEDIATION", "STATE_CHANGE"],
  horizons: ["CHALLENGE_AND_REOPEN", "DELAYED_RECONCILIATION",
    "IMMEDIATE_TERMINAL", "PRE_ATTEMPT"],
  missingGates: ["AFFECTED_PARTY_REGISTER_NOT_SOURCE_REPLAYED",
    "EFFECT_CLOSURE_NOT_SOURCE_REPLAYED", "EVIDENCE_COVERAGE_NOT_COMMITTED",
    "EXTERNAL_AUTHORITY_UNESTABLISHED", "NO_EXECUTION_GATE_IN_REVIEW_PROJECTOR",
    "OFFICIAL_SOURCE_PAYLOADS_NOT_REPLAYED", "OWNER_ADOPTION_UNESTABLISHED",
    "PROVIDER_APPLICABILITY_OR_BYPASS_INVENTORY_INCOMPLETE",
    "PROVIDER_PATTERNS_NOT_SOURCE_TRUTH", "RESPONSIBILITY_COVERAGE_NOT_COMMITTED",
    "SOURCE_TRUTH_UNESTABLISHED"],
});

function atomFloor(atom) {
  for (let index = 0; index < EFFECT_ATOM_FLOORS.length; index += 1) {
    if (EFFECT_ATOM_FLOORS[index].atom === atom) return EFFECT_ATOM_FLOORS[index];
  }
  fail("EFFECT_ATOM_FLOOR_MISSING");
}

function activeAtoms(radius) {
  const result = new ArrayConstructor();
  for (let index = 0; index < DELEGATION_RADIUS_ATOMS.length; index += 1) {
    if (radius.cells[index].atom !== DELEGATION_RADIUS_ATOMS[index]) {
      fail("EFFECT_RADIUS_CELL_ORDER_INVALID");
    }
    if (radius.cells[index].budget.limit !== "0") {
      result[result.length] = DELEGATION_RADIUS_ATOMS[index];
    }
  }
  if (result.length === 0) fail("EFFECT_RADIUS_EMPTY");
  return result;
}

function dependencySelections(providerEntityIds, officialSourceIds,
  evidence, responsibility, controls, channels, missingGates) {
  const providerRegistry = buildProviderPatternRegistry();
  const providerChecked = verifyProviderPatternRegistry(providerRegistry);
  if (!providerChecked.ok) fail("PROVIDER_PATTERN_REGISTRY_INVALID");
  const providerReviews = new ArrayConstructor(providerEntityIds.length);
  for (let index = 0; index < providerEntityIds.length; index += 1) {
    const review = buildProviderPatternReviewProjection(providerEntityIds[index]);
    const checked = verifyProviderPatternReviewProjection(review);
    if (!checked.ok || review.sourceCompletenessEstablished !== false
      || review.effectClosureEstablished !== false
      || review.authorityEstablished !== false || review.actionReady !== false
      || review.executable !== false || review.admittedTrainingRows !== 0
      || review.causalExperienceUnits !== 0) {
      fail("PROVIDER_PATTERN_REVIEW_BOUNDARY_INVALID");
    }
    append(evidence, review.evidenceRequirements);
    append(responsibility, review.responsibilityRequirements);
    append(controls, review.minimumControls);
    providerReviews[index] = {
      entityId: providerEntityIds[index], projectionHash: review.projectionHash,
    };
  }

  const sourceScout = buildRealitySourceScout();
  const sourceChecked = verifyRealitySourceScout(sourceScout);
  if (!sourceChecked.ok) fail("REALITY_SOURCE_SCOUT_INVALID");
  const sourceReviews = new ArrayConstructor(officialSourceIds.length);
  for (let index = 0; index < officialSourceIds.length; index += 1) {
    const review = buildRealitySourceReviewProjection(officialSourceIds[index]);
    const checked = verifyRealitySourceReviewProjection(review);
    if (!checked.ok || review.sourceTruthEstablished !== false
      || review.evidenceCoverageEstablished !== false
      || review.responsibilityCoverageEstablished !== false
      || review.causalityEstablished !== false || review.authorityEstablished !== false
      || review.actionReady !== false || review.trainingRows !== 0
      || review.causalExperienceUnits !== 0) {
      fail("REALITY_SOURCE_REVIEW_BOUNDARY_INVALID");
    }
    append(channels, review.channelHypotheses);
    append(missingGates, review.requiredHoldGates);
    sourceReviews[index] = {
      sourceId: officialSourceIds[index], projectionHash: review.projectionHash,
    };
  }

  return {
    providerPatternRegistryHash: providerRegistry.registryHash,
    providerReviewProjectionHashes: providerReviews,
    realitySourceScoutCatalogHash: sourceScout.catalogHash,
    officialSourceReviewProjectionHashes: sourceReviews,
  };
}

function buildBody(input) {
  canonicalizeStrict(input);
  exactObject(input, ["bindings", "capabilityRadius", "effectRadius",
    "selectedProviderEntityIds", "selectedOfficialSourceCandidateIds"], "INPUT");
  const bindings = normalizeBindings(input.bindings);
  const capabilityRadius = requireRadius(input.capabilityRadius, "CAPABILITY_RADIUS");
  const effectRadius = requireRadius(input.effectRadius, "EFFECT_RADIUS");
  if (!delegationRadiusLeq({ candidate: capabilityRadius, ceiling: effectRadius })) {
    fail("CAPABILITY_RADIUS_OUTSIDE_EFFECT_RADIUS");
  }
  const providerEntityIds = normalizeIdSet(input.selectedProviderEntityIds,
    "PROVIDER_ENTITY_IDS");
  const officialSourceIds = normalizeIdSet(input.selectedOfficialSourceCandidateIds,
    "OFFICIAL_SOURCE_IDS");
  requireAllReviewedSelections(providerEntityIds, officialSourceIds);
  const atoms = activeAtoms(effectRadius);

  const evidence = new ArrayConstructor();
  const responsibility = new ArrayConstructor();
  const controls = new ArrayConstructor();
  const channels = new ArrayConstructor();
  const horizons = new ArrayConstructor();
  const missingGates = new ArrayConstructor();
  append(evidence, BASE.evidence);
  append(responsibility, BASE.responsibility);
  append(controls, BASE.controls);
  append(channels, BASE.channels);
  append(horizons, BASE.horizons);
  append(missingGates, BASE.missingGates);
  for (let index = 0; index < atoms.length; index += 1) {
    const floor = atomFloor(atoms[index]);
    append(evidence, floor.evidence);
    append(responsibility, floor.responsibility);
    append(controls, floor.controls);
    append(channels, floor.channels);
    append(horizons, floor.horizons);
  }
  const dependencyBindings = dependencySelections(providerEntityIds, officialSourceIds,
    evidence, responsibility, controls, channels, missingGates);

  return {
    schema: EFFECT_CONSEQUENCE_REVIEW_SCHEMA,
    schemaVersion: "1.0.0",
    decision: "HOLD",
    bindings,
    capabilityRadiusHash: capabilityRadius.radiusHash,
    effectRadiusHash: effectRadius.radiusHash,
    activeEffectAtoms: atoms,
    selectionMode: "ALL_REVIEWED_SOURCES_CONSERVATIVE_FLOOR",
    selectedProviderEntityIds: providerEntityIds,
    selectedOfficialSourceCandidateIds: officialSourceIds,
    dependencyBindings,
    requiredEvidence: sortedUnique(evidence),
    requiredResponsibility: sortedUnique(responsibility),
    requiredControls: sortedUnique(controls),
    channelHypotheses: sortedUnique(channels),
    horizonHypotheses: sortedUnique(horizons),
    missingGates: sortedUnique(missingGates),
    interpretation:
      "CONSERVATIVE_REVIEW_HYPOTHESES_ONLY_NOT_SOURCE_TRUTH_COVERAGE_AUTHORITY_OR_PERMISSION",
    providerApplicabilityEstablished: false,
    sourceTruth: false,
    effectClosure: false,
    affectedPartyCompleteness: false,
    evidenceCoverage: false,
    responsibilityCoverage: false,
    authority: false,
    actionReady: false,
    executable: false,
    networkReads: 0,
    thirdPartyCodeExecuted: 0,
    payloadRowsIngested: 0,
    trainingRows: 0,
    causalExperienceUnits: 0,
  };
}

/** Build a deterministic review artifact. There is no execution branch. */
export function buildEffectConsequenceReviewProjection(input = {}) {
  const body = buildBody(input);
  return deepFreeze({ ...body,
    projectionHash: digest(EFFECT_CONSEQUENCE_REVIEW_SCHEMA, body) });
}

/**
 * Rebuild from caller-supplied full capability/effect radii and current
 * registries. The record's own radius hashes are never sufficient proof.
 */
export function verifyEffectConsequenceReviewProjection(record, context = {}) {
  try {
    canonicalizeStrict(record);
    canonicalizeStrict(context);
    exactOptions(context, ["capabilityRadius", "effectRadius", "expectedProjectionHash"],
      "VERIFY_CONTEXT");
    const contextKeys = ReflectOwnKeys(context);
    let hasCapabilityRadius = false;
    let hasRadius = false;
    for (let index = 0; index < contextKeys.length; index += 1) {
      if (contextKeys[index] === "capabilityRadius") hasCapabilityRadius = true;
      if (contextKeys[index] === "effectRadius") hasRadius = true;
    }
    if (!hasCapabilityRadius) fail("VERIFY_CAPABILITY_RADIUS_REQUIRED");
    if (!hasRadius) fail("VERIFY_EFFECT_RADIUS_REQUIRED");
    exactObject(record, ["schema", "schemaVersion", "decision", "bindings",
      "capabilityRadiusHash", "effectRadiusHash", "activeEffectAtoms", "selectionMode",
      "selectedProviderEntityIds", "selectedOfficialSourceCandidateIds",
      "dependencyBindings", "requiredEvidence",
      "requiredResponsibility", "requiredControls", "channelHypotheses",
      "horizonHypotheses", "missingGates", "interpretation", "sourceTruth",
      "providerApplicabilityEstablished", "effectClosure",
      "affectedPartyCompleteness", "evidenceCoverage",
      "responsibilityCoverage", "authority", "actionReady", "executable",
      "networkReads", "thirdPartyCodeExecuted", "payloadRowsIngested", "trainingRows",
      "causalExperienceUnits", "projectionHash"], "RECORD");
    if (record.schema !== EFFECT_CONSEQUENCE_REVIEW_SCHEMA
      || record.schemaVersion !== "1.0.0" || record.decision !== "HOLD"
      || record.selectionMode !== "ALL_REVIEWED_SOURCES_CONSERVATIVE_FLOOR") {
      fail("RECORD_SCHEMA_OR_DECISION_INVALID");
    }
    const rebuilt = buildEffectConsequenceReviewProjection({
      bindings: record.bindings,
      capabilityRadius: context.capabilityRadius,
      effectRadius: context.effectRadius,
      selectedProviderEntityIds: record.selectedProviderEntityIds,
      selectedOfficialSourceCandidateIds: record.selectedOfficialSourceCandidateIds,
    });
    if (canonicalizeStrict(record) !== canonicalizeStrict(rebuilt)) {
      fail("RECORD_DERIVATION_INVALID");
    }
    let expectedProvided = false;
    for (let index = 0; index < contextKeys.length; index += 1) {
      if (contextKeys[index] === "expectedProjectionHash") expectedProvided = true;
    }
    if (expectedProvided && record.projectionHash !== hash(context.expectedProjectionHash,
      "EXPECTED_PROJECTION_HASH")) fail("EXPECTED_PROJECTION_HASH_MISMATCH");
    return deepFreeze({
      ok: true,
      verificationLevel: expectedProvided ? "EXPECTED_HASH_BOUND" : "CANONICAL_REBUILD_ONLY",
      projectionHash: record.projectionHash,
      decision: "HOLD",
      providerApplicabilityEstablished: false,
      sourceTruth: false,
      effectClosure: false,
      affectedPartyCompleteness: false,
      evidenceCoverage: false,
      responsibilityCoverage: false,
      authority: false,
      actionReady: false,
      executable: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      decision: "HOLD",
      providerApplicabilityEstablished: false,
      sourceTruth: false,
      effectClosure: false,
      affectedPartyCompleteness: false,
      evidenceCoverage: false,
      responsibilityCoverage: false,
      authority: false,
      actionReady: false,
      executable: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      error: error instanceof ErrorConstructor ? error.message : StringConstructor(error),
    });
  }
}
