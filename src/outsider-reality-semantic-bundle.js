/*
 * Source-replayed Reality semantic binding.
 *
 * This module binds the conservative effect review to its affected-party
 * register, responsibility graph, an explicit review-to-obligation horizon
 * plan, and an untouched production Reality-obligation genesis.  Structural
 * replay success is deliberately not effect closure, affected-party or
 * responsibility completeness, duty acceptance, standing, authority,
 * admission, execution, or a causal experience unit.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { verifyEffectConsequenceReviewProjection } from
  "./outsider-effect-consequence-review.js";
import { verifyAffectedPartyRegister } from
  "./outsider-affected-party-register.js";
import { verifyResponsibilityGraph } from "./outsider-responsibility-graph.js";
import {
  RealityObligationStore,
  verifyRealityObligationStore,
} from "./outsider-reality-obligation-store.js";

export const REALITY_SEMANTIC_BUNDLE_SCHEMAS = Object.freeze({
  plan: "outsider/reality-semantic-obligation-plan/v1",
  obligationTemplate: "outsider/reality-semantic-obligation-template/v1",
  bundle: "outsider/reality-semantic-bound-bundle/v1",
  verification: "outsider/reality-semantic-bound-bundle-verification/v1",
  horizonCommitment: "outsider/reality-obligation-horizon-commitment/v1",
});

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ObjectPrototype = Object.prototype;
const ObjectCreate = Object.create;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const DateParse = Date.parse;
const DateConstructor = Date;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ErrorConstructor = Error;
const TypeErrorConstructor = TypeError;
const StringConstructor = String;

const HASH = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_HORIZONS = 64;
const MAX_HORIZON_MS = 100 * 365 * 24 * 60 * 60 * 1_000;
const PRODUCTION_CAPABILITY =
  "PRODUCTION_EXTERNAL_CLOSURE_UNREACHABLE_NO_PROVIDER_REGISTRY";

export const REALITY_SEMANTIC_BUNDLE_NO_AUTHORITY = deepFreeze({
  providerApplicabilityEstablished: false,
  effectClosureEstablished: false,
  affectedPartyCompletenessEstablished: false,
  responsibilityCompletenessEstablished: false,
  externalDutyAcceptanceEstablished: false,
  standingEstablished: false,
  externalAuthorityEstablished: false,
  closureEstablished: false,
  authorityEstablished: false,
  admitted: false,
  actionReady: false,
  executable: false,
  liveActionConnected: false,
  callerAssertionsAcceptedAsAuthority: false,
  hashesAcceptedAsAuthority: false,
  callbacksAccepted: false,
});

function fail(code) {
  throw new TypeErrorConstructor(`REALITY_SEMANTIC_BUNDLE_${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, writable: true, enumerable: true, configurable: true,
  });
  return array;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (descriptor && ObjectHasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return ObjectFreeze(value);
}

function cloneCanonicalValue(value) {
  if (!value || typeof value !== "object") return value;
  if (ArrayIsArray(value)) {
    const output = new ArrayConstructor();
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = ObjectGetOwnPropertyDescriptor(value,
        StringConstructor(index));
      append(output, cloneCanonicalValue(descriptor.value));
    }
    return output;
  }
  const prototype = ObjectGetPrototypeOf(value);
  const output = ObjectCreate(prototype === null ? null : ObjectPrototype);
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    ObjectDefineProperty(output, keys[index], {
      value: cloneCanonicalValue(descriptor.value),
      writable: true, enumerable: true, configurable: true,
    });
  }
  return output;
}

function cloneCanonical(value) {
  canonicalizeStrict(value);
  return cloneCanonicalValue(value);
}

function exactObject(value, expectedKeys, code) {
  canonicalizeStrict(value);
  if (!value || typeof value !== "object" || ArrayIsArray(value)) {
    fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  }
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
    fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  }
  const actual = ReflectOwnKeys(value);
  if (actual.length !== expectedKeys.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < actual.length; index += 1) {
    let found = false;
    for (let expectedIndex = 0; expectedIndex < expectedKeys.length;
      expectedIndex += 1) {
      if (actual[index] === expectedKeys[expectedIndex]) found = true;
    }
    if (!found) fail(`${code}_FIELDS_INVALID`);
    const descriptor = ObjectGetOwnPropertyDescriptor(value, actual[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DATA_FIELDS_REQUIRED`);
  }
  return value;
}

function denseArray(value, code, { nonempty = false,
  maximum = MAX_HORIZONS } = {}) {
  canonicalizeStrict(value);
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum || (nonempty && value.length === 0)) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function identifier(value, code) {
  if (typeof value !== "string" || !RegExpTest(IDENTIFIER, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function timestamp(value, code) {
  if (typeof value !== "string") fail(`${code}_INVALID`);
  const millis = DateParse(value);
  if (!NumberIsFinite(millis)
    || DateToISOString(new DateConstructor(millis)) !== value) fail(`${code}_INVALID`);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sortedHashes(values, code) {
  denseArray(values, code, { nonempty: true, maximum: 4096 });
  const result = new ArrayConstructor();
  for (let index = 0; index < values.length; index += 1) {
    append(result, hash(values[index], code));
  }
  ArraySort(result);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] === result[index - 1]) fail(`${code}_DUPLICATE`);
  }
  return result;
}

function subjectFromEffect(projection) {
  return {
    claimHash: projection.bindings.claimWayWorld.claimHash,
    wayHash: projection.bindings.claimWayWorld.wayHash,
    worldHash: projection.bindings.claimWayWorld.worldHash,
    episodeHash: projection.bindings.run.episodeHash,
    attemptHash: projection.bindings.run.attemptHash,
    censusHash: projection.bindings.run.censusHash,
  };
}

function requireNoPositiveBoundary(value, code) {
  const falseFields = [
    "providerApplicabilityEstablished",
    "effectClosureEstablished",
    "affectedPartyCompletenessEstablished",
    "responsibilityCompletenessEstablished",
    "externalDutyAcceptanceEstablished",
    "standingEstablished",
    "externalAuthorityEstablished",
    "closureEstablished",
    "semanticClosureEligible",
    "actionReady",
    "executable",
  ];
  for (let index = 0; index < falseFields.length; index += 1) {
    const field = falseFields[index];
    if (ObjectHasOwn(value, field) && value[field] !== false) {
      fail(`${code}_${field.toUpperCase()}_ESCALATION`);
    }
  }
  if (ObjectHasOwn(value, "causalExperienceUnits")
    && value.causalExperienceUnits !== 0) fail(`${code}_CEU_ESCALATION`);
  if (ObjectHasOwn(value, "decisionState") && value.decisionState !== "HOLD") {
    fail(`${code}_DECISION_ESCALATION`);
  }
}

function replaySemanticSources(input) {
  const effect = input.effectConsequenceReviewProjection;
  const effectChecked = verifyEffectConsequenceReviewProjection(effect, {
    capabilityRadius: input.effectReviewContext.capabilityRadius,
    effectRadius: input.effectReviewContext.effectRadius,
    expectedProjectionHash: effect.projectionHash,
  });
  if (!effectChecked.ok) {
    fail(`EFFECT_SOURCE_REPLAY_FAILED:${effectChecked.error ?? "INVALID"}`);
  }
  requireNoPositiveBoundary(effect, "EFFECT_REVIEW");

  const registerChecked = verifyAffectedPartyRegister(input.affectedPartyRegister, {
    source: input.affectedPartyRegisterSource,
    expectedSourceHash: input.affectedPartyRegisterSource.sourceHash,
    expectedAffectedPartyRootHash:
      input.affectedPartyRegister.affectedPartyRootHash,
  });
  if (!registerChecked.ok) {
    fail(`AFFECTED_PARTY_SOURCE_REPLAY_FAILED:${registerChecked.error ?? "INVALID"}`);
  }
  requireNoPositiveBoundary(input.affectedPartyRegister,
    "AFFECTED_PARTY_REGISTER");

  const graphChecked = verifyResponsibilityGraph(input.responsibilityGraph, {
    source: input.responsibilityGraphSource,
    affectedPartyRegister: input.affectedPartyRegister,
    affectedPartyRegisterSource: input.affectedPartyRegisterSource,
    expectedSourceHash: input.responsibilityGraphSource.sourceHash,
    expectedResponsibilityGraphHash:
      input.responsibilityGraph.responsibilityGraphHash,
  });
  if (!graphChecked.ok) {
    fail(`RESPONSIBILITY_GRAPH_SOURCE_REPLAY_FAILED:${graphChecked.error ?? "INVALID"}`);
  }
  requireNoPositiveBoundary(input.responsibilityGraph, "RESPONSIBILITY_GRAPH");

  const subjectBindings = subjectFromEffect(effect);
  if (!same(subjectBindings, input.affectedPartyRegister.subjectBindings)
    || !same(subjectBindings, input.responsibilityGraph.subjectBindings)) {
    fail("CROSS_STAGE_SUBJECT_BINDING_MISMATCH");
  }
  const beforeStateHash = effect.bindings.action.beforeStateHash;
  if (input.affectedPartyRegister.beforeStateHash !== beforeStateHash
    || input.responsibilityGraph.beforeStateHash !== beforeStateHash) {
    fail("CROSS_STAGE_BEFORE_STATE_BINDING_MISMATCH");
  }
  if (input.affectedPartyRegister.effectConsequenceReviewProjectionHash
      !== effect.projectionHash
    || input.responsibilityGraph.effectConsequenceReviewProjectionHash
      !== effect.projectionHash) fail("CROSS_STAGE_EFFECT_HASH_MISMATCH");
  if (input.responsibilityGraph.affectedPartyRootHash
    !== input.affectedPartyRegister.affectedPartyRootHash) {
    fail("CROSS_STAGE_AFFECTED_PARTY_ROOT_MISMATCH");
  }
  const registerAccounting = input.affectedPartyRegister.accounting;
  if (registerAccounting.assignedChannelRows
    !== registerAccounting.effectChannelHypothesisRows) {
    fail("STRUCTURAL_CHANNEL_ASSIGNMENT_INCOMPLETE");
  }
  const graphAccounting = input.responsibilityGraph.accounting;
  if (graphAccounting.canonicalResponsibilityRows < 1
    || graphAccounting.missingCanonicalRows !== 0
    || graphAccounting.coveredCanonicalRows
      !== graphAccounting.canonicalResponsibilityRows
    || graphAccounting.dutyEdgesOutsideCanonicalRows !== 0
    || graphAccounting.unknownCoverageSubjectDutyEdges !== 0
    || graphAccounting.coverageSubjectKindMismatchEdges !== 0
    || graphAccounting.channelOutsideEffectReviewEdges !== 0
    || graphAccounting.horizonOutsideMandatoryReviewEdges !== 0) {
    fail("STRUCTURAL_RESPONSIBILITY_CROSS_PRODUCT_INCOMPLETE");
  }
  return { effect, subjectBindings, beforeStateHash };
}

function normalizeObligationSpec(value) {
  exactObject(value, ["obligationId", "budgetCommitmentHash",
    "recoveryPolicyHash", "challengePolicyHash", "createdAt",
    "horizonCrosswalk"], "OBLIGATION_SPEC");
  return {
    obligationId: identifier(value.obligationId, "OBLIGATION_ID"),
    budgetCommitmentHash: hash(value.budgetCommitmentHash,
      "BUDGET_COMMITMENT_HASH"),
    recoveryPolicyHash: hash(value.recoveryPolicyHash, "RECOVERY_POLICY_HASH"),
    challengePolicyHash: hash(value.challengePolicyHash,
      "CHALLENGE_POLICY_HASH"),
    createdAt: timestamp(value.createdAt, "CREATED_AT"),
    horizonCrosswalk: value.horizonCrosswalk,
  };
}

function plannedHorizonCommitment(obligation) {
  return digest(REALITY_SEMANTIC_BUNDLE_SCHEMAS.horizonCommitment, obligation);
}

function normalizeHorizonCrosswalk(inputRows, reviewRows) {
  denseArray(inputRows, "HORIZON_CROSSWALK", { nonempty: true });
  denseArray(reviewRows, "REVIEW_HORIZON_ROWS", { nonempty: true });
  if (inputRows.length !== reviewRows.length) {
    fail("HORIZON_CROSSWALK_MUST_COVER_EXACT_REVIEW_SET");
  }
  const normalized = new ArrayConstructor();
  for (let reviewIndex = 0; reviewIndex < reviewRows.length; reviewIndex += 1) {
    const review = reviewRows[reviewIndex];
    let candidate = null;
    let matches = 0;
    for (let candidateIndex = 0; candidateIndex < inputRows.length;
      candidateIndex += 1) {
      const row = inputRows[candidateIndex];
      exactObject(row, ["reviewHorizonId", "reviewHorizonHash",
        "obligation"], "HORIZON_CROSSWALK_ROW");
      if (row.reviewHorizonId === review.horizonId
        && row.reviewHorizonHash === review.horizonHash) {
        candidate = row;
        matches += 1;
      }
    }
    if (matches !== 1) fail("HORIZON_CROSSWALK_REVIEW_ROW_MISSING_OR_DUPLICATE");
    exactObject(candidate.obligation, ["horizonId", "dueAfterMs",
      "observationRequirementHash", "mandatory"], "OBLIGATION_HORIZON");
    const dueAfterMs = candidate.obligation.dueAfterMs;
    if (!NumberIsSafeInteger(dueAfterMs) || dueAfterMs < 0
      || dueAfterMs > MAX_HORIZON_MS) fail("OBLIGATION_HORIZON_DELAY_INVALID");
    if (candidate.obligation.mandatory !== true || review.mandatory !== true) {
      fail("HORIZON_MUST_BE_MANDATORY");
    }
    const obligation = {
      horizonId: identifier(candidate.obligation.horizonId,
        "OBLIGATION_HORIZON_ID"),
      dueAfterMs,
      observationRequirementHash: hash(
        candidate.obligation.observationRequirementHash,
        "OBSERVATION_REQUIREMENT_HASH"),
      mandatory: true,
    };
    append(normalized, {
      reviewHorizonId: identifier(review.horizonId, "REVIEW_HORIZON_ID"),
      reviewHorizonHash: hash(review.horizonHash, "REVIEW_HORIZON_HASH"),
      obligation,
      plannedHorizonCommitmentHash: plannedHorizonCommitment(obligation),
    });
  }
  ArraySort(normalized, (left, right) => (
    left.reviewHorizonHash < right.reviewHorizonHash ? -1
      : left.reviewHorizonHash > right.reviewHorizonHash ? 1 : 0
  ));
  let hasImmediate = false;
  let hasDelayed = false;
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index].obligation.dueAfterMs === 0) hasImmediate = true;
    if (normalized[index].obligation.dueAfterMs > 0) hasDelayed = true;
    for (let other = index + 1; other < normalized.length; other += 1) {
      if (normalized[index].obligation.horizonId
        === normalized[other].obligation.horizonId) {
        fail("OBLIGATION_HORIZON_ID_DUPLICATE");
      }
    }
  }
  if (!hasImmediate || !hasDelayed) {
    fail("IMMEDIATE_AND_DELAYED_OBLIGATION_HORIZONS_REQUIRED");
  }
  return normalized;
}

function channelPlan(register) {
  denseArray(register.effectChannelRows, "EFFECT_CHANNEL_ROWS", {
    nonempty: true, maximum: 4096,
  });
  const rows = new ArrayConstructor();
  const hashes = new ArrayConstructor();
  for (let index = 0; index < register.effectChannelRows.length; index += 1) {
    const row = register.effectChannelRows[index];
    append(rows, {
      channelId: identifier(row.channelId, "REVIEW_CHANNEL_ID"),
      reviewChannelHash: hash(row.channelHash, "REVIEW_CHANNEL_HASH"),
      obligationConsequenceChannelHash: row.channelHash,
    });
    append(hashes, row.channelHash);
  }
  ArraySort(rows, (left, right) => (
    left.reviewChannelHash < right.reviewChannelHash ? -1
      : left.reviewChannelHash > right.reviewChannelHash ? 1 : 0
  ));
  return { rows, hashes: sortedHashes(hashes, "CONSEQUENCE_CHANNEL_HASH") };
}

function makePlan(input) {
  const replayed = replaySemanticSources(input);
  const spec = normalizeObligationSpec(input.obligation);
  const channels = channelPlan(input.affectedPartyRegister);
  const horizonCrosswalk = normalizeHorizonCrosswalk(spec.horizonCrosswalk,
    input.affectedPartyRegister.mandatoryHorizonRows);
  const mandatoryHorizons = new ArrayConstructor();
  for (let index = 0; index < horizonCrosswalk.length; index += 1) {
    append(mandatoryHorizons, cloneCanonical(horizonCrosswalk[index].obligation));
  }
  ArraySort(mandatoryHorizons, (left, right) => (
    left.dueAfterMs - right.dueAfterMs
      || (left.horizonId < right.horizonId ? -1
        : left.horizonId > right.horizonId ? 1 : 0)
  ));
  const obligationBindings = {
    claimHash: replayed.subjectBindings.claimHash,
    wayHash: replayed.subjectBindings.wayHash,
    worldHash: replayed.subjectBindings.worldHash,
    episodeHash: replayed.subjectBindings.episodeHash,
    attemptHash: replayed.subjectBindings.attemptHash,
    censusRegistrationHash: replayed.subjectBindings.censusHash,
    responsibilityGraphHash:
      input.responsibilityGraph.responsibilityGraphHash,
    affectedPartyRootHash: input.affectedPartyRegister.affectedPartyRootHash,
    budgetCommitmentHash: spec.budgetCommitmentHash,
    recoveryPolicyHash: spec.recoveryPolicyHash,
    challengePolicyHash: spec.challengePolicyHash,
  };
  const obligationGenesisTemplate = {
    obligationId: spec.obligationId,
    bindings: obligationBindings,
    consequenceChannelHashes: channels.hashes,
    mandatoryHorizons,
    createdAt: spec.createdAt,
  };
  const obligationGenesisTemplateHash = digest(
    REALITY_SEMANTIC_BUNDLE_SCHEMAS.obligationTemplate,
    obligationGenesisTemplate);
  const body = {
    schema: REALITY_SEMANTIC_BUNDLE_SCHEMAS.plan,
    schemaVersion: "1.0.0",
    planClass: "HOLD_SOURCE_REPLAYED_SEMANTIC_PLAN_NOT_REALITY_CLOSURE",
    subjectBindings: replayed.subjectBindings,
    beforeStateHash: replayed.beforeStateHash,
    effectConsequenceReviewProjectionHash:
      input.effectConsequenceReviewProjection.projectionHash,
    affectedPartyRegisterSourceHash:
      input.affectedPartyRegisterSource.sourceHash,
    affectedPartyRootHash: input.affectedPartyRegister.affectedPartyRootHash,
    responsibilityGraphSourceHash: input.responsibilityGraphSource.sourceHash,
    responsibilityGraphHash:
      input.responsibilityGraph.responsibilityGraphHash,
    channelCrosswalk: channels.rows,
    horizonCrosswalk,
    obligationGenesisTemplate,
    obligationGenesisTemplateHash,
    sourceReplay: {
      effectReviewSourceRebuildComplete: true,
      affectedPartyRegisterSourceReplayComplete: true,
      responsibilityGraphSourceReplayComplete: true,
    },
    structuralReviewCoverage: {
      allEffectChannelsAssigned: true,
      allCanonicalResponsibilityRowsLocallyCovered: true,
      exactChannelProjectionPlanned: true,
      exactMandatoryHorizonCrosswalkPlanned: true,
    },
    providerApplicabilityEstablished: false,
    effectClosureEstablished: false,
    affectedPartyCompletenessEstablished: false,
    responsibilityCompletenessEstablished: false,
    externalDutyAcceptanceEstablished: false,
    standingEstablished: false,
    externalAuthorityEstablished: false,
    closureEstablished: false,
    semanticClosureEligible: false,
    decisionState: "HOLD",
    admitted: false,
    actionReady: false,
    executable: false,
    liveActionConnected: false,
    causalExperienceUnits: 0,
    authority: REALITY_SEMANTIC_BUNDLE_NO_AUTHORITY,
  };
  return deepFreeze({ ...body, semanticPlanHash: digest(
    REALITY_SEMANTIC_BUNDLE_SCHEMAS.plan, body) });
}

export function createRealitySemanticPlan(input = {}) {
  canonicalizeStrict(input);
  exactObject(input, ["effectConsequenceReviewProjection", "effectReviewContext",
    "affectedPartyRegisterSource", "affectedPartyRegister",
    "responsibilityGraphSource", "responsibilityGraph", "obligation"],
  "PLAN_INPUT");
  exactObject(input.effectReviewContext, ["capabilityRadius", "effectRadius"],
    "EFFECT_REVIEW_CONTEXT");
  return makePlan(input);
}

function exactPlanRecord(value) {
  canonicalizeStrict(value);
  exactObject(value, ["schema", "schemaVersion", "planClass",
    "subjectBindings", "beforeStateHash",
    "effectConsequenceReviewProjectionHash", "affectedPartyRegisterSourceHash",
    "affectedPartyRootHash", "responsibilityGraphSourceHash",
    "responsibilityGraphHash", "channelCrosswalk", "horizonCrosswalk",
    "obligationGenesisTemplate", "obligationGenesisTemplateHash",
    "sourceReplay", "structuralReviewCoverage",
    "providerApplicabilityEstablished", "effectClosureEstablished",
    "affectedPartyCompletenessEstablished", "responsibilityCompletenessEstablished",
    "externalDutyAcceptanceEstablished", "standingEstablished",
    "externalAuthorityEstablished", "closureEstablished",
    "semanticClosureEligible", "decisionState", "admitted", "actionReady",
    "executable", "liveActionConnected", "causalExperienceUnits", "authority",
    "semanticPlanHash"], "SEMANTIC_PLAN");
  if (value.schema !== REALITY_SEMANTIC_BUNDLE_SCHEMAS.plan
    || value.schemaVersion !== "1.0.0"
    || value.planClass
      !== "HOLD_SOURCE_REPLAYED_SEMANTIC_PLAN_NOT_REALITY_CLOSURE") {
    fail("SEMANTIC_PLAN_SCHEMA_INVALID");
  }
  hash(value.semanticPlanHash, "SEMANTIC_PLAN_HASH");
  hash(value.obligationGenesisTemplateHash, "OBLIGATION_TEMPLATE_HASH");
  requireNoPositiveBoundary(value, "SEMANTIC_PLAN");
  if (value.admitted !== false || value.liveActionConnected !== false) {
    fail("SEMANTIC_PLAN_ACTION_ESCALATION");
  }
  return value;
}

function replayPlan(plan, source) {
  exactPlanRecord(plan);
  const rebuilt = createRealitySemanticPlan(source);
  if (!same(plan, rebuilt)) fail("SEMANTIC_PLAN_SOURCE_REPLAY_MISMATCH");
  return rebuilt;
}

export function createRealitySemanticObligation(input = {}) {
  canonicalizeStrict(input);
  exactObject(input, ["semanticPlan", "semanticPlanSource", "directory"],
    "CREATE_OBLIGATION_INPUT");
  if (typeof input.directory !== "string" || input.directory.length === 0) {
    fail("OBLIGATION_DIRECTORY_REQUIRED");
  }
  const plan = replayPlan(input.semanticPlan, input.semanticPlanSource);
  const template = cloneCanonical(plan.obligationGenesisTemplate);
  return RealityObligationStore.create({ directory: input.directory,
    ...template }).snapshot();
}

function requireProductionRevisionZero(snapshot) {
  if (snapshot.schema !== "outsider/reality-obligation-snapshot/v1"
    || snapshot.revision !== 0 || snapshot.state.revision !== 0
    || snapshot.state.status !== "PRECOMMITTED"
    || snapshot.state.workflowOpen !== true
    || snapshot.state.obligationOutstanding !== true
    || snapshot.state.fixtureScenarioClosed !== false
    || snapshot.state.productionClosureEstablished !== false
    || snapshot.state.liveActionConnected !== false
    || snapshot.state.causalExperienceUnits !== 0
    || snapshot.state.lastEventHash !== snapshot.genesis.genesisHash
    || snapshot.state.genesisHash !== snapshot.genesis.genesisHash
    || snapshot.state.lastOccurredAt !== snapshot.genesis.createdAt
    || snapshot.genesis.closureCapability !== PRODUCTION_CAPABILITY
    || snapshot.verification.sourceReplayComplete !== true
    || snapshot.verification.immutableEventChainConsistent !== true
    || snapshot.verification.testFixtureLedger !== false
    || snapshot.verification.externalClosureVerified !== false
    || snapshot.verification.productionClosureEstablished !== false
    || snapshot.verification.liveActionConnected !== false
    || snapshot.verification.actionReady !== false) {
    fail("PRODUCTION_PRECOMMITTED_REVISION_ZERO_OBLIGATION_REQUIRED");
  }
  const authorities = [snapshot.genesis.authority, snapshot.state.authority,
    snapshot.verification.authority];
  for (let index = 0; index < authorities.length; index += 1) {
    const keys = ReflectOwnKeys(authorities[index]);
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const value = authorities[index][keys[keyIndex]];
      if (typeof value === "boolean" && value !== false) {
        fail("OBLIGATION_AUTHORITY_ESCALATION");
      }
    }
  }
  return snapshot;
}

function obligationSubject(snapshot) {
  return {
    claimHash: snapshot.genesis.bindings.claimHash,
    wayHash: snapshot.genesis.bindings.wayHash,
    worldHash: snapshot.genesis.bindings.worldHash,
    episodeHash: snapshot.genesis.bindings.episodeHash,
    attemptHash: snapshot.genesis.bindings.attemptHash,
    censusHash: snapshot.genesis.bindings.censusRegistrationHash,
  };
}

function actualHorizonCrosswalk(plan, snapshot) {
  const actualRows = snapshot.genesis.mandatoryHorizons;
  if (actualRows.length !== plan.horizonCrosswalk.length) {
    fail("OBLIGATION_HORIZON_SET_NOT_EXACT");
  }
  const result = new ArrayConstructor();
  for (let planIndex = 0; planIndex < plan.horizonCrosswalk.length;
    planIndex += 1) {
    const planned = plan.horizonCrosswalk[planIndex];
    let actual = null;
    let matches = 0;
    for (let actualIndex = 0; actualIndex < actualRows.length;
      actualIndex += 1) {
      if (actualRows[actualIndex].horizonId === planned.obligation.horizonId) {
        actual = actualRows[actualIndex];
        matches += 1;
      }
    }
    if (matches !== 1) fail("OBLIGATION_HORIZON_MISSING_OR_DUPLICATE");
    const actualTuple = {
      horizonId: actual.horizonId,
      dueAfterMs: actual.dueAfterMs,
      observationRequirementHash: actual.observationRequirementHash,
      mandatory: actual.mandatory,
    };
    if (!same(actualTuple, planned.obligation)
      || actual.horizonCommitmentHash
        !== planned.plannedHorizonCommitmentHash) {
      fail("OBLIGATION_HORIZON_TUPLE_OR_COMMITMENT_MISMATCH");
    }
    append(result, {
      reviewHorizonId: planned.reviewHorizonId,
      reviewHorizonHash: planned.reviewHorizonHash,
      obligation: {
        ...actualTuple,
        horizonCommitmentHash: actual.horizonCommitmentHash,
      },
    });
  }
  return result;
}

function bindBundle(input) {
  const plan = replayPlan(input.semanticPlan, input.semanticPlanSource);
  if (typeof input.obligationDirectory !== "string"
    || input.obligationDirectory.length === 0) fail("OBLIGATION_DIRECTORY_REQUIRED");
  const snapshot = requireProductionRevisionZero(
    verifyRealityObligationStore(input.obligationDirectory));
  if (!same(obligationSubject(snapshot), plan.subjectBindings)) {
    fail("OBLIGATION_SUBJECT_BINDING_MISMATCH");
  }
  if (!same(snapshot.genesis.bindings,
    plan.obligationGenesisTemplate.bindings)
    || snapshot.genesis.obligationId
      !== plan.obligationGenesisTemplate.obligationId
    || snapshot.genesis.createdAt !== plan.obligationGenesisTemplate.createdAt) {
    fail("OBLIGATION_GENESIS_SEMANTIC_PLAN_BINDING_MISMATCH");
  }
  if (!same(snapshot.genesis.consequenceChannelHashes,
    plan.obligationGenesisTemplate.consequenceChannelHashes)) {
    fail("OBLIGATION_CHANNEL_SET_NOT_EXACT");
  }
  const horizonCrosswalk = actualHorizonCrosswalk(plan, snapshot);
  const body = {
    schema: REALITY_SEMANTIC_BUNDLE_SCHEMAS.bundle,
    schemaVersion: "1.0.0",
    bundleClass:
      "HOLD_SOURCE_REPLAYED_SEMANTIC_BINDING_NOT_CLOSURE_OR_AUTHORITY",
    semanticPlanHash: plan.semanticPlanHash,
    obligationGenesisTemplateHash: plan.obligationGenesisTemplateHash,
    subjectBindings: plan.subjectBindings,
    beforeStateHash: plan.beforeStateHash,
    effectConsequenceReviewProjectionHash:
      plan.effectConsequenceReviewProjectionHash,
    affectedPartyRegisterSourceHash: plan.affectedPartyRegisterSourceHash,
    affectedPartyRootHash: plan.affectedPartyRootHash,
    responsibilityGraphSourceHash: plan.responsibilityGraphSourceHash,
    responsibilityGraphHash: plan.responsibilityGraphHash,
    obligation: {
      obligationId: snapshot.genesis.obligationId,
      genesisHash: snapshot.genesis.genesisHash,
      stateHash: snapshot.stateHash,
      revision: snapshot.revision,
      status: snapshot.state.status,
      obligationOutstanding: snapshot.state.obligationOutstanding,
    },
    channelCrosswalk: plan.channelCrosswalk,
    horizonCrosswalk,
    checks: {
      effectReviewSourceRebuilt: true,
      affectedPartyRegisterSourceReplayed: true,
      responsibilityGraphSourceReplayed: true,
      exactClaimWayWorldEpisodeAttemptCensus: true,
      exactBeforeStateTransitivelyBoundBySemanticPlan: true,
      exactEffectChannelSetBoundToProductionGenesis: true,
      exactReviewHorizonToObligationTupleCrosswalkBound: true,
      realObligationHorizonCommitmentHashesBound: true,
      productionObligationLedger: true,
      obligationPrecommittedAtRevisionZero: true,
    },
    providerApplicabilityEstablished: false,
    effectClosureEstablished: false,
    affectedPartyCompletenessEstablished: false,
    responsibilityCompletenessEstablished: false,
    externalDutyAcceptanceEstablished: false,
    standingEstablished: false,
    externalAuthorityEstablished: false,
    closureEstablished: false,
    semanticClosureEligible: false,
    decisionState: "HOLD",
    admitted: false,
    actionReady: false,
    executable: false,
    liveActionConnected: false,
    executionToken: null,
    causalExperienceUnits: 0,
    authority: REALITY_SEMANTIC_BUNDLE_NO_AUTHORITY,
  };
  return deepFreeze({ ...body, bundleHash: digest(
    REALITY_SEMANTIC_BUNDLE_SCHEMAS.bundle, body) });
}

export function buildRealitySemanticBundle(input = {}) {
  canonicalizeStrict(input);
  exactObject(input, ["semanticPlan", "semanticPlanSource",
    "obligationDirectory"], "BUILD_BUNDLE_INPUT");
  return bindBundle(input);
}

function exactBundleRecord(value) {
  canonicalizeStrict(value);
  exactObject(value, ["schema", "schemaVersion", "bundleClass",
    "semanticPlanHash", "obligationGenesisTemplateHash", "subjectBindings",
    "beforeStateHash", "effectConsequenceReviewProjectionHash",
    "affectedPartyRegisterSourceHash", "affectedPartyRootHash",
    "responsibilityGraphSourceHash", "responsibilityGraphHash", "obligation",
    "channelCrosswalk", "horizonCrosswalk", "checks",
    "providerApplicabilityEstablished", "effectClosureEstablished",
    "affectedPartyCompletenessEstablished", "responsibilityCompletenessEstablished",
    "externalDutyAcceptanceEstablished", "standingEstablished",
    "externalAuthorityEstablished", "closureEstablished",
    "semanticClosureEligible", "decisionState", "admitted", "actionReady",
    "executable", "liveActionConnected", "executionToken",
    "causalExperienceUnits", "authority", "bundleHash"], "BUNDLE");
  if (value.schema !== REALITY_SEMANTIC_BUNDLE_SCHEMAS.bundle
    || value.schemaVersion !== "1.0.0"
    || value.bundleClass
      !== "HOLD_SOURCE_REPLAYED_SEMANTIC_BINDING_NOT_CLOSURE_OR_AUTHORITY") {
    fail("BUNDLE_SCHEMA_INVALID");
  }
  hash(value.bundleHash, "BUNDLE_HASH");
  requireNoPositiveBoundary(value, "BUNDLE");
  if (value.admitted !== false || value.liveActionConnected !== false
    || value.executionToken !== null) fail("BUNDLE_ACTION_ESCALATION");
  return value;
}

function failure(error) {
  return deepFreeze({
    schema: REALITY_SEMANTIC_BUNDLE_SCHEMAS.verification,
    ok: false,
    verificationLevel: "INVALID",
    semanticSourceReplayComplete: false,
    productionObligationSourceReplayComplete: false,
    exactSemanticBindingVerified: false,
    providerApplicabilityEstablished: false,
    effectClosureEstablished: false,
    affectedPartyCompletenessEstablished: false,
    responsibilityCompletenessEstablished: false,
    externalDutyAcceptanceEstablished: false,
    standingEstablished: false,
    externalAuthorityEstablished: false,
    closureEstablished: false,
    semanticClosureEligible: false,
    decisionState: "HOLD",
    admitted: false,
    actionReady: false,
    executable: false,
    liveActionConnected: false,
    executionToken: null,
    causalExperienceUnits: 0,
    authority: REALITY_SEMANTIC_BUNDLE_NO_AUTHORITY,
    error: error instanceof ErrorConstructor ? error.message
      : StringConstructor(error),
  });
}

export function verifyRealitySemanticBundle(record, options = {}) {
  try {
    canonicalizeStrict(record);
    canonicalizeStrict(options);
    exactBundleRecord(record);
    exactObject(options, ["semanticPlan", "semanticPlanSource",
      "obligationDirectory", "expectedSemanticPlanHash",
      "expectedObligationGenesisHash", "expectedObligationStateHash",
      "expectedBundleHash"], "VERIFY_OPTIONS");
    const expectedSemanticPlanHash = hash(options.expectedSemanticPlanHash,
      "EXPECTED_SEMANTIC_PLAN_HASH");
    const expectedObligationGenesisHash = hash(
      options.expectedObligationGenesisHash,
      "EXPECTED_OBLIGATION_GENESIS_HASH");
    const expectedObligationStateHash = hash(options.expectedObligationStateHash,
      "EXPECTED_OBLIGATION_STATE_HASH");
    const expectedBundleHash = hash(options.expectedBundleHash,
      "EXPECTED_BUNDLE_HASH");
    const rebuilt = bindBundle({
      semanticPlan: options.semanticPlan,
      semanticPlanSource: options.semanticPlanSource,
      obligationDirectory: options.obligationDirectory,
    });
    if (rebuilt.semanticPlanHash !== expectedSemanticPlanHash) {
      fail("EXPECTED_SEMANTIC_PLAN_HASH_MISMATCH");
    }
    if (rebuilt.obligation.genesisHash !== expectedObligationGenesisHash) {
      fail("EXPECTED_OBLIGATION_GENESIS_HASH_MISMATCH");
    }
    if (rebuilt.obligation.stateHash !== expectedObligationStateHash) {
      fail("EXPECTED_OBLIGATION_STATE_HASH_MISMATCH");
    }
    if (rebuilt.bundleHash !== expectedBundleHash) {
      fail("EXPECTED_BUNDLE_HASH_MISMATCH");
    }
    if (!same(record, rebuilt)) fail("BUNDLE_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({
      schema: REALITY_SEMANTIC_BUNDLE_SCHEMAS.verification,
      ok: true,
      verificationLevel:
        "FULL_SOURCE_REPLAY_EXPECTED_HASHES_AND_PRODUCTION_REV0_BOUND",
      semanticSourceReplayComplete: true,
      productionObligationSourceReplayComplete: true,
      exactSemanticBindingVerified: true,
      semanticPlanHash: rebuilt.semanticPlanHash,
      obligationGenesisHash: rebuilt.obligation.genesisHash,
      obligationStateHash: rebuilt.obligation.stateHash,
      bundleHash: rebuilt.bundleHash,
      subjectBindings: rebuilt.subjectBindings,
      beforeStateHash: rebuilt.beforeStateHash,
      providerApplicabilityEstablished: false,
      effectClosureEstablished: false,
      affectedPartyCompletenessEstablished: false,
      responsibilityCompletenessEstablished: false,
      externalDutyAcceptanceEstablished: false,
      standingEstablished: false,
      externalAuthorityEstablished: false,
      closureEstablished: false,
      semanticClosureEligible: false,
      decisionState: "HOLD",
      admitted: false,
      actionReady: false,
      executable: false,
      liveActionConnected: false,
      executionToken: null,
      causalExperienceUnits: 0,
      authority: REALITY_SEMANTIC_BUNDLE_NO_AUTHORITY,
    });
  } catch (error) {
    return failure(error);
  }
}
