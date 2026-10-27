import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
  networkIntakeDigest,
} from "./outsider-network-intake.js";

const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const DateConstructor = Date;
const SetConstructor = Set;
const uncurryThis = (method) => Function.prototype.call.bind(method);
const DateToISOString = uncurryThis(Date.prototype.toISOString);
const RegExpTest = uncurryThis(RegExp.prototype.test);
const SetAdd = uncurryThis(Set.prototype.add);
const SetHas = uncurryThis(Set.prototype.has);

export const PROSPECTIVE_EPISODE_CENSUS_SCHEMAS = ObjectFreeze({
  source: "outsider/prospective-episode-census-source/v1",
  projection: "outsider/prospective-episode-census-projection/v1",
  verification: "outsider/prospective-episode-census-verification/v1",
});

export const PROSPECTIVE_EPISODE_CENSUS_BOUNDARY = deepFreeze({
  status: "HOLD",
  timingBasis: "LOCAL_CANONICAL_ORDER_NOT_EXTERNAL_TIME_ATTESTATION",
  sourceReplayRequired: true,
  externalTimeAnchorVerified: false,
  prospectivityEstablishedAtNetworkEdge: false,
  scientificCensusCompletenessEstablishedAtNetworkEdge: false,
  actorIdentityEstablished: false,
  authority: "NONE",
  actionReady: false,
  executable: false,
  automaticTraining: false,
  trainingRows: 0,
  causalExperienceUnits: 0,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

function fail(code) {
  throw new Error(`PROSPECTIVE_EPISODE_CENSUS_${code}`);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
  }
  return ObjectFreeze(value);
}

function rejectProxyTree(value, state = { seen: new SetConstructor(), nodes: 0 }, depth = 0) {
  if (value === null || typeof value !== "object") return;
  if (depth > 128 || state.nodes > 10_000) fail("INPUT_TREE_TOO_LARGE");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(state.seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(state.seen, value);
  state.nodes += 1;
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && "value" in descriptor) rejectProxyTree(descriptor.value, state, depth + 1);
  }
}

function exactObject(value, fields, label) {
  if (value === null || typeof value !== "object" || isProxy(value)
    || ObjectGetPrototypeOf(value) !== ObjectPrototype) fail(`${label}_OBJECT_INVALID`);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  if (keys.length !== fields.length) fail(`${label}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const descriptor = descriptors[field];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      fail(`${label}_FIELDS_INVALID`);
    }
  }
  return value;
}

function exactHash(value, label) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${label}_INVALID`);
  return value;
}

function nullableHash(value, label) {
  if (value === null) return null;
  return exactHash(value, label);
}

function canonicalTime(value, label) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)
    || DateToISOString(new DateConstructor(value)) !== value) fail(`${label}_INVALID`);
  return value;
}

function normalizeBindings(value) {
  exactObject(value, ["claimHash", "wayHash", "worldHash", "cohortHash",
    "censusSlotHash"], "BINDINGS");
  return {
    claimHash: exactHash(value.claimHash, "CLAIM_HASH"),
    wayHash: exactHash(value.wayHash, "WAY_HASH"),
    worldHash: exactHash(value.worldHash, "WORLD_HASH"),
    cohortHash: exactHash(value.cohortHash, "COHORT_HASH"),
    censusSlotHash: exactHash(value.censusSlotHash, "CENSUS_SLOT_HASH"),
  };
}

function normalizeRegistration(value) {
  exactObject(value, ["registeredAt", "plannedNotBefore", "plannedNotAfter",
    "preActionRegistrationReferenceHash", "externalTimeAnchorHash"], "REGISTRATION");
  const result = {
    registeredAt: canonicalTime(value.registeredAt, "REGISTERED_AT"),
    plannedNotBefore: canonicalTime(value.plannedNotBefore, "PLANNED_NOT_BEFORE"),
    plannedNotAfter: canonicalTime(value.plannedNotAfter, "PLANNED_NOT_AFTER"),
    preActionRegistrationReferenceHash: exactHash(value.preActionRegistrationReferenceHash,
      "PRE_ACTION_REGISTRATION_REFERENCE_HASH"),
    externalTimeAnchorHash: nullableHash(value.externalTimeAnchorHash,
      "EXTERNAL_TIME_ANCHOR_HASH"),
  };
  if (!(result.registeredAt < result.plannedNotBefore
    && result.plannedNotBefore < result.plannedNotAfter)) {
    fail("LOCAL_PRE_ACTION_ORDER_INVALID");
  }
  return result;
}

function normalizeDesign(value) {
  exactObject(value, ["eligibilityRuleHash", "assignmentPolicyHash", "instrumentPlanHash",
    "outcomePlanHash", "stoppingPolicyHash", "monitorPlanHash",
    "stewardshipPlanHash"], "DESIGN");
  return {
    eligibilityRuleHash: exactHash(value.eligibilityRuleHash, "ELIGIBILITY_RULE_HASH"),
    assignmentPolicyHash: exactHash(value.assignmentPolicyHash, "ASSIGNMENT_POLICY_HASH"),
    instrumentPlanHash: exactHash(value.instrumentPlanHash, "INSTRUMENT_PLAN_HASH"),
    outcomePlanHash: exactHash(value.outcomePlanHash, "OUTCOME_PLAN_HASH"),
    stoppingPolicyHash: exactHash(value.stoppingPolicyHash, "STOPPING_POLICY_HASH"),
    monitorPlanHash: exactHash(value.monitorPlanHash, "MONITOR_PLAN_HASH"),
    stewardshipPlanHash: exactHash(value.stewardshipPlanHash, "STEWARDSHIP_PLAN_HASH"),
  };
}

function sourceBody(input) {
  exactObject(input, ["bindings", "registration", "design"], "SOURCE_INPUT");
  return {
    schema: PROSPECTIVE_EPISODE_CENSUS_SCHEMAS.source,
    bindings: normalizeBindings(input.bindings),
    registration: normalizeRegistration(input.registration),
    design: normalizeDesign(input.design),
    boundary: PROSPECTIVE_EPISODE_CENSUS_BOUNDARY,
  };
}

function exactSource(record) {
  rejectProxyTree(record);
  canonicalizeStrict(record);
  exactObject(record, ["schema", "bindings", "registration", "design", "boundary",
    "sourceHash"], "SOURCE");
  if (record.schema !== PROSPECTIVE_EPISODE_CENSUS_SCHEMAS.source
    || canonicalizeStrict(record.boundary)
      !== canonicalizeStrict(PROSPECTIVE_EPISODE_CENSUS_BOUNDARY)) {
    fail("SOURCE_STATE_INVALID");
  }
  const body = sourceBody({ bindings: record.bindings, registration: record.registration,
    design: record.design });
  const sourceHash = networkIntakeDigest(PROSPECTIVE_EPISODE_CENSUS_SCHEMAS.source, body);
  const rebuilt = { ...body, sourceHash };
  if (record.sourceHash !== sourceHash
    || canonicalizeStrict(record) !== canonicalizeStrict(rebuilt)) {
    fail("SOURCE_REPLAY_INVALID");
  }
  return rebuilt;
}

function projectionBody(source) {
  const instrumentBundleHash = networkIntakeDigest(
    "outsider/prospective-episode-instrument-bundle/v1", source.design);
  const subject = {
    claimHash: source.bindings.claimHash,
    wayHash: source.bindings.wayHash,
    worldHash: source.bindings.worldHash,
    episodeHash: null,
    attemptHash: null,
    actorIdentityEnvelopeHash: null,
    accountableDeploymentSubjectHash: null,
    attemptActorSubjectHash: null,
    cohortHash: source.bindings.cohortHash,
    censusSlotHash: source.bindings.censusSlotHash,
  };
  const payload = {
    schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.PROSPECTIVE_CENSUS,
    cohortCommitmentHash: source.bindings.cohortHash,
    censusSlotCommitmentHash: source.bindings.censusSlotHash,
    eligibilityRuleHash: source.design.eligibilityRuleHash,
    assignmentPolicyHash: source.design.assignmentPolicyHash,
    instrumentPlanHash: source.design.instrumentPlanHash,
    preActionRegistrationReferenceHash:
      source.registration.preActionRegistrationReferenceHash,
    externalTimeAnchorHash: source.registration.externalTimeAnchorHash,
    prospectiveRegistrationEstablishedAtNetworkEdge: false,
    scientificCensusCompletenessEstablishedAtNetworkEdge: false,
  };
  return {
    schema: PROSPECTIVE_EPISODE_CENSUS_SCHEMAS.projection,
    sourceHash: source.sourceHash,
    bindings: source.bindings,
    registration: source.registration,
    design: source.design,
    instrumentBundleHash,
    networkProjection: {
      lane: "PROSPECTIVE_CENSUS",
      payloadSchema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.PROSPECTIVE_CENSUS,
      subject,
      payload,
    },
    decision: "HOLD",
    boundary: PROSPECTIVE_EPISODE_CENSUS_BOUNDARY,
  };
}

export function createProspectiveEpisodeCensusSource(input = {}) {
  rejectProxyTree(input);
  canonicalizeStrict(input);
  const body = sourceBody(input);
  return deepFreeze({ ...body, sourceHash: networkIntakeDigest(
    PROSPECTIVE_EPISODE_CENSUS_SCHEMAS.source, body) });
}

export function buildProspectiveEpisodeCensusProjection(source) {
  const checked = exactSource(source);
  const body = projectionBody(checked);
  return deepFreeze({ ...body, projectionHash: networkIntakeDigest(
    PROSPECTIVE_EPISODE_CENSUS_SCHEMAS.projection, body) });
}

export function verifyProspectiveEpisodeCensusProjection(record, { source,
  expectedSourceHash = null, expectedProjectionHash = null } = {}) {
  try {
    rejectProxyTree(record);
    canonicalizeStrict(record);
    exactObject(record, ["schema", "sourceHash", "bindings", "registration", "design",
      "instrumentBundleHash", "networkProjection", "decision", "boundary",
      "projectionHash"], "PROJECTION");
    const checkedSource = exactSource(source);
    if (expectedSourceHash !== null
      && checkedSource.sourceHash !== exactHash(expectedSourceHash, "EXPECTED_SOURCE_HASH")) {
      fail("EXPECTED_SOURCE_HASH_MISMATCH");
    }
    const expected = buildProspectiveEpisodeCensusProjection(checkedSource);
    if (expectedProjectionHash !== null
      && expected.projectionHash !== exactHash(expectedProjectionHash,
        "EXPECTED_PROJECTION_HASH")) fail("EXPECTED_PROJECTION_HASH_MISMATCH");
    if (canonicalizeStrict(record) !== canonicalizeStrict(expected)) {
      fail("PROJECTION_REPLAY_INVALID");
    }
    return deepFreeze({ schema: PROSPECTIVE_EPISODE_CENSUS_SCHEMAS.verification,
      ok: true, sourceReplayComplete: true, projectionHash: expected.projectionHash,
      decision: "HOLD", networkQuarantineEligible: true,
      boundary: PROSPECTIVE_EPISODE_CENSUS_BOUNDARY });
  } catch (error) {
    return deepFreeze({ schema: PROSPECTIVE_EPISODE_CENSUS_SCHEMAS.verification,
      ok: false, sourceReplayComplete: false, projectionHash: null, decision: "HOLD",
      networkQuarantineEligible: false, error: error instanceof Error ? error.message
        : "PROSPECTIVE_EPISODE_CENSUS_UNKNOWN_FAILURE",
      boundary: PROSPECTIVE_EPISODE_CENSUS_BOUNDARY });
  }
}
