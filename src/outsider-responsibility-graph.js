/*
 * HOLD-only responsibility review graph.
 *
 * The graph is downstream of a source-replayed affected-party review register.
 * It covers the canonical cross product of each assigned effect-channel
 * hypothesis, PARTY/UNRESOLVED_CLASS coverage subject, and mandatory review
 * horizon.  Duty edges retain source, policy, budget, recovery, and challenge
 * hashes, but no edge or complete structural cross product is external duty
 * acceptance, real effect closure, standing, authority, or permission.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyAffectedPartyRegister,
} from "./outsider-affected-party-register.js";

export const RESPONSIBILITY_GRAPH_SCHEMAS = Object.freeze({
  source: "outsider/responsibility-review-graph-source/v1",
  graph: "outsider/responsibility-review-graph/v1",
  verification: "outsider/responsibility-review-graph-verification/v1",
});

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ObjectPrototype = Object.prototype;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ReflectOwnKeys = Reflect.ownKeys;
const NumberIsSafeInteger = Number.isSafeInteger;
const RegExpPrototypeTest = Function.prototype.call.bind(RegExp.prototype.test);
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const MapConstructor = Map;
const MapGet = Function.prototype.call.bind(Map.prototype.get);
const MapHas = Function.prototype.call.bind(Map.prototype.has);
const MapSet = Function.prototype.call.bind(Map.prototype.set);
const SetConstructor = Set;
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const ErrorConstructor = Error;
const TypeErrorConstructor = TypeError;

const HASH = /^sha256:[a-f0-9]{64}$/u;
const REVIEW_ID = /^[A-Z][A-Z0-9_]{0,159}$/u;
const MAX_REVIEW_REFS = 4096;
const MAX_DUTIES = 100_000;
const MAX_CANONICAL_ROWS = 100_000;

const DUTY_KINDS = Object.freeze([
  "MONITOR",
  "PRESERVE_EVIDENCE",
  "NOTIFY",
  "REMEDIATE",
  "COMPENSATE",
  "ESCALATE",
  "HALT",
  "UNRESOLVED_DUTY",
]);

const COVERAGE_SUBJECT_KINDS = Object.freeze(["PARTY", "UNRESOLVED_CLASS"]);

export const RESPONSIBILITY_GRAPH_NO_AUTHORITY = deepFreeze({
  providerApplicabilityEstablished: false,
  effectClosureEstablished: false,
  affectedPartyCompletenessEstablished: false,
  responsibilityCompletenessEstablished: false,
  externalDutyAcceptanceEstablished: false,
  standingEstablished: false,
  externalAuthorityEstablished: false,
  closureEstablished: false,
  actionReady: false,
  executable: false,
  callerAssertionsAcceptedAsAuthority: false,
  hashesAcceptedAsAuthority: false,
  graphCoverageAcceptedAsDutyAcceptance: false,
  callbacksAccepted: false,
});

function fail(code) {
  throw new TypeErrorConstructor(`RESPONSIBILITY_GRAPH_${code}`);
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

function denseArray(value, code, maximum, { nonempty = false } = {}) {
  canonicalizeStrict(value);
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum || (nonempty && value.length === 0)) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpPrototypeTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function reviewId(value, code) {
  if (typeof value !== "string" || !RegExpPrototypeTest(REVIEW_ID, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function oneOf(value, allowed, code) {
  for (let index = 0; index < allowed.length; index += 1) {
    if (value === allowed[index]) return value;
  }
  fail(`${code}_INVALID`);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function contains(values, candidate) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === candidate) return true;
  }
  return false;
}

function normalizeSubjectBindings(value) {
  exactObject(value, ["claimHash", "wayHash", "worldHash", "episodeHash",
    "attemptHash", "censusHash"], "SUBJECT_BINDINGS");
  return {
    claimHash: hash(value.claimHash, "CLAIM_HASH"),
    wayHash: hash(value.wayHash, "WAY_HASH"),
    worldHash: hash(value.worldHash, "WORLD_HASH"),
    episodeHash: hash(value.episodeHash, "EPISODE_HASH"),
    attemptHash: hash(value.attemptHash, "ATTEMPT_HASH"),
    censusHash: hash(value.censusHash, "CENSUS_HASH"),
  };
}

function normalizeReviewTuples(value, kind) {
  denseArray(value, `${kind}_REVIEW_REFS`, MAX_REVIEW_REFS, { nonempty: true });
  const idField = kind === "PROVIDER" ? "entityId" : "sourceId";
  const normalized = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    const tuple = value[index];
    exactObject(tuple, [idField, "projectionHash"], `${kind}_REVIEW_REF`);
    append(normalized, {
      [idField]: reviewId(tuple[idField], `${kind}_REVIEW_ID`),
      projectionHash: hash(tuple.projectionHash, `${kind}_PROJECTION_HASH`),
    });
  }
  ArraySort(normalized, (left, right) => {
    if (left[idField] < right[idField]) return -1;
    if (left[idField] > right[idField]) return 1;
    if (left.projectionHash < right.projectionHash) return -1;
    if (left.projectionHash > right.projectionHash) return 1;
    return 0;
  });
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index][idField] === normalized[index - 1][idField]) {
      if (normalized[index].projectionHash === normalized[index - 1].projectionHash) {
        fail(`${kind}_REVIEW_REF_DUPLICATE`);
      }
      fail(`${kind}_REVIEW_ID_CONFLICTING_PROJECTIONS`);
    }
  }
  return normalized;
}

function normalizeReviewRefs(value) {
  exactObject(value, ["providerReviews", "realityReviews", "matraixReviews"],
    "REVIEW_REFS");
  return {
    providerReviews: normalizeReviewTuples(value.providerReviews, "PROVIDER"),
    realityReviews: normalizeReviewTuples(value.realityReviews, "REALITY"),
    matraixReviews: normalizeReviewTuples(value.matraixReviews, "MATRAIX"),
  };
}

function normalizeDuties(value) {
  denseArray(value, "DUTIES", MAX_DUTIES);
  const normalized = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    const duty = value[index];
    exactObject(duty, ["dutyRefHash", "dutyKind", "responsiblePartyRefHash",
      "coverageSubjectKind", "coverageSubjectRefHash", "channelHash",
      "horizonHash", "dutySourceRefHash", "policyRefHash", "budgetRefHash",
      "recoveryRefHash", "challengeRefHash"], "DUTY");
    append(normalized, {
      dutyRefHash: hash(duty.dutyRefHash, "DUTY_REF_HASH"),
      dutyKind: oneOf(duty.dutyKind, DUTY_KINDS, "DUTY_KIND"),
      responsiblePartyRefHash: hash(duty.responsiblePartyRefHash,
        "RESPONSIBLE_PARTY_REF_HASH"),
      coverageSubjectKind: oneOf(duty.coverageSubjectKind,
        COVERAGE_SUBJECT_KINDS, "COVERAGE_SUBJECT_KIND"),
      coverageSubjectRefHash: hash(duty.coverageSubjectRefHash,
        "COVERAGE_SUBJECT_REF_HASH"),
      channelHash: hash(duty.channelHash, "CHANNEL_HASH"),
      horizonHash: hash(duty.horizonHash, "HORIZON_HASH"),
      dutySourceRefHash: hash(duty.dutySourceRefHash, "DUTY_SOURCE_REF_HASH"),
      policyRefHash: hash(duty.policyRefHash, "POLICY_REF_HASH"),
      budgetRefHash: hash(duty.budgetRefHash, "BUDGET_REF_HASH"),
      recoveryRefHash: hash(duty.recoveryRefHash, "RECOVERY_REF_HASH"),
      challengeRefHash: hash(duty.challengeRefHash, "CHALLENGE_REF_HASH"),
    });
  }
  ArraySort(normalized, (left, right) => (
    left.dutyRefHash < right.dutyRefHash ? -1
      : left.dutyRefHash > right.dutyRefHash ? 1 : 0
  ));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].dutyRefHash === normalized[index - 1].dutyRefHash) {
      fail("DUTY_REF_DUPLICATE");
    }
  }
  return normalized;
}

export function createResponsibilityGraphSource(input = {}) {
  canonicalizeStrict(input);
  exactObject(input, ["affectedPartyRegisterSourceHash", "affectedPartyRootHash",
    "effectConsequenceReviewProjectionHash", "beforeStateHash", "subjectBindings",
    "reviewRefs", "duties"], "SOURCE_INPUT");
  const body = {
    schema: RESPONSIBILITY_GRAPH_SCHEMAS.source,
    schemaVersion: "1.0.0",
    sourceClass: "HOLD_REVIEW_SOURCE_NOT_EXTERNAL_DUTY_ACCEPTANCE",
    affectedPartyRegisterSourceHash: hash(input.affectedPartyRegisterSourceHash,
      "AFFECTED_PARTY_REGISTER_SOURCE_HASH"),
    affectedPartyRootHash: hash(input.affectedPartyRootHash,
      "AFFECTED_PARTY_ROOT_HASH"),
    effectConsequenceReviewProjectionHash: hash(
      input.effectConsequenceReviewProjectionHash,
      "EFFECT_CONSEQUENCE_REVIEW_PROJECTION_HASH"),
    beforeStateHash: hash(input.beforeStateHash, "BEFORE_STATE_HASH"),
    subjectBindings: normalizeSubjectBindings(input.subjectBindings),
    reviewRefs: normalizeReviewRefs(input.reviewRefs),
    duties: normalizeDuties(input.duties),
    identityMode: "HASH_ONLY_NO_RAW_PII",
  };
  return deepFreeze({ ...body, sourceHash: digest(
    RESPONSIBILITY_GRAPH_SCHEMAS.source, body) });
}

function exactSourceRecord(value) {
  canonicalizeStrict(value);
  exactObject(value, ["schema", "schemaVersion", "sourceClass",
    "affectedPartyRegisterSourceHash", "affectedPartyRootHash",
    "effectConsequenceReviewProjectionHash", "beforeStateHash", "subjectBindings",
    "reviewRefs", "duties", "identityMode", "sourceHash"], "SOURCE");
  if (value.schema !== RESPONSIBILITY_GRAPH_SCHEMAS.source
    || value.schemaVersion !== "1.0.0"
    || value.sourceClass !== "HOLD_REVIEW_SOURCE_NOT_EXTERNAL_DUTY_ACCEPTANCE"
    || value.identityMode !== "HASH_ONLY_NO_RAW_PII") fail("SOURCE_STATE_INVALID");
  hash(value.sourceHash, "SOURCE_HASH");
  return value;
}

function replaySource(value, expectedSourceHash) {
  exactSourceRecord(value);
  const rebuilt = createResponsibilityGraphSource({
    affectedPartyRegisterSourceHash: value.affectedPartyRegisterSourceHash,
    affectedPartyRootHash: value.affectedPartyRootHash,
    effectConsequenceReviewProjectionHash:
      value.effectConsequenceReviewProjectionHash,
    beforeStateHash: value.beforeStateHash,
    subjectBindings: value.subjectBindings,
    reviewRefs: value.reviewRefs,
    duties: value.duties,
  });
  if (!same(value, rebuilt)) fail("SOURCE_DERIVATION_INVALID");
  if (rebuilt.sourceHash !== hash(expectedSourceHash, "EXPECTED_SOURCE_HASH")) {
    fail("EXPECTED_SOURCE_HASH_MISMATCH");
  }
  return rebuilt;
}

function tupleKey(kind, refHash, channelHash, horizonHash) {
  return `${kind}\0${refHash}\0${channelHash}\0${horizonHash}`;
}

function buildCanonicalRows(register) {
  let channelSubjectAssignments = 0;
  for (let index = 0; index < register.coverageRows.length; index += 1) {
    const row = register.coverageRows[index];
    channelSubjectAssignments += row.partyCandidateRefHashes.length;
    channelSubjectAssignments += row.unresolvedClassRefHashes.length;
  }
  const rowCount = channelSubjectAssignments * register.mandatoryHorizonRows.length;
  if (!NumberIsSafeInteger(rowCount) || rowCount > MAX_CANONICAL_ROWS) {
    fail("CANONICAL_RESPONSIBILITY_ROW_LIMIT_EXCEEDED");
  }
  const rows = new ArrayConstructor();
  const rowByKey = new MapConstructor();
  for (let channelIndex = 0; channelIndex < register.coverageRows.length;
    channelIndex += 1) {
    const channel = register.coverageRows[channelIndex];
    for (let kindIndex = 0; kindIndex < COVERAGE_SUBJECT_KINDS.length;
      kindIndex += 1) {
      const kind = COVERAGE_SUBJECT_KINDS[kindIndex];
      const refs = kind === "PARTY" ? channel.partyCandidateRefHashes
        : channel.unresolvedClassRefHashes;
      for (let refIndex = 0; refIndex < refs.length; refIndex += 1) {
        for (let horizonIndex = 0;
          horizonIndex < register.mandatoryHorizonRows.length; horizonIndex += 1) {
          const horizon = register.mandatoryHorizonRows[horizonIndex];
          if (horizon.mandatory !== true) fail("NON_MANDATORY_HORIZON_IN_REGISTER");
          const row = {
            coverageSubjectKind: kind,
            coverageSubjectRefHash: refs[refIndex],
            channelHash: channel.channelHash,
            horizonHash: horizon.horizonHash,
            dutyRefHashes: new ArrayConstructor(),
          };
          const key = tupleKey(kind, refs[refIndex], channel.channelHash,
            horizon.horizonHash);
          MapSet(rowByKey, key, row);
          append(rows, row);
        }
      }
    }
  }
  ArraySort(rows, (left, right) => {
    const leftKey = tupleKey(left.coverageSubjectKind,
      left.coverageSubjectRefHash, left.channelHash, left.horizonHash);
    const rightKey = tupleKey(right.coverageSubjectKind,
      right.coverageSubjectRefHash, right.channelHash, right.horizonHash);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return { rows, rowByKey };
}

function analyze(register, duties) {
  const canonical = buildCanonicalRows(register);
  const subjectKinds = new MapConstructor();
  const channels = new SetConstructor();
  const horizons = new SetConstructor();
  for (let index = 0; index < register.coverageSubjects.length; index += 1) {
    const subject = register.coverageSubjects[index];
    MapSet(subjectKinds, subject.coverageSubjectRefHash,
      subject.coverageSubjectKind);
  }
  for (let index = 0; index < register.effectChannelRows.length; index += 1) {
    SetAdd(channels, register.effectChannelRows[index].channelHash);
  }
  for (let index = 0; index < register.mandatoryHorizonRows.length; index += 1) {
    SetAdd(horizons, register.mandatoryHorizonRows[index].horizonHash);
  }

  let dutyEdgesOutsideCanonicalRows = 0;
  let unknownCoverageSubjectDutyEdges = 0;
  let coverageSubjectKindMismatchEdges = 0;
  let channelOutsideEffectReviewEdges = 0;
  let horizonOutsideMandatoryReviewEdges = 0;
  let unresolvedDutyEdges = 0;
  for (let index = 0; index < duties.length; index += 1) {
    const duty = duties[index];
    const registeredKind = MapGet(subjectKinds, duty.coverageSubjectRefHash);
    if (registeredKind === undefined) unknownCoverageSubjectDutyEdges += 1;
    else if (registeredKind !== duty.coverageSubjectKind) {
      coverageSubjectKindMismatchEdges += 1;
    }
    if (!SetHas(channels, duty.channelHash)) channelOutsideEffectReviewEdges += 1;
    if (!SetHas(horizons, duty.horizonHash)) {
      horizonOutsideMandatoryReviewEdges += 1;
    }
    if (duty.dutyKind === "UNRESOLVED_DUTY") unresolvedDutyEdges += 1;
    const key = tupleKey(duty.coverageSubjectKind, duty.coverageSubjectRefHash,
      duty.channelHash, duty.horizonHash);
    if (!MapHas(canonical.rowByKey, key)) {
      dutyEdgesOutsideCanonicalRows += 1;
      continue;
    }
    append(MapGet(canonical.rowByKey, key).dutyRefHashes, duty.dutyRefHash);
  }

  let coveredCanonicalRows = 0;
  for (let index = 0; index < canonical.rows.length; index += 1) {
    ArraySort(canonical.rows[index].dutyRefHashes);
    if (canonical.rows[index].dutyRefHashes.length > 0) coveredCanonicalRows += 1;
  }
  return {
    canonicalResponsibilityRows: canonical.rows,
    accounting: {
      effectChannelHypothesisRows: register.effectChannelRows.length,
      assignedChannelRows: register.accounting.assignedChannelRows,
      mandatoryHorizonRows: register.mandatoryHorizonRows.length,
      coverageSubjectEntries: register.coverageSubjects.length,
      canonicalResponsibilityRows: canonical.rows.length,
      coveredCanonicalRows,
      missingCanonicalRows: canonical.rows.length - coveredCanonicalRows,
      dutyEdges: duties.length,
      dutyEdgesOutsideCanonicalRows,
      unknownCoverageSubjectDutyEdges,
      coverageSubjectKindMismatchEdges,
      channelOutsideEffectReviewEdges,
      horizonOutsideMandatoryReviewEdges,
      unresolvedDutyEdges,
    },
  };
}

function addGap(gaps, code) {
  if (!contains(gaps, code)) append(gaps, code);
}

function graphGapReasons(register, accounting) {
  const gaps = new ArrayConstructor();
  if (accounting.dutyEdges === 0) addGap(gaps, "EMPTY_RESPONSIBILITY_REVIEW_GRAPH");
  if (accounting.missingCanonicalRows > 0) {
    addGap(gaps, "CANONICAL_RESPONSIBILITY_ROW_DUTY_COVERAGE_MISSING");
  }
  if (accounting.dutyEdgesOutsideCanonicalRows > 0) {
    addGap(gaps, "DUTY_EDGE_OUTSIDE_CANONICAL_REVIEW_ROW");
  }
  if (accounting.unknownCoverageSubjectDutyEdges > 0) {
    addGap(gaps, "UNKNOWN_COVERAGE_SUBJECT_DUTY_EDGE");
  }
  if (accounting.coverageSubjectKindMismatchEdges > 0) {
    addGap(gaps, "COVERAGE_SUBJECT_KIND_MISMATCH");
  }
  if (accounting.channelOutsideEffectReviewEdges > 0) {
    addGap(gaps, "DUTY_CHANNEL_OUTSIDE_EFFECT_REVIEW");
  }
  if (accounting.horizonOutsideMandatoryReviewEdges > 0) {
    addGap(gaps, "DUTY_HORIZON_OUTSIDE_MANDATORY_REVIEW");
  }
  if (accounting.unresolvedDutyEdges > 0) addGap(gaps, "UNRESOLVED_DUTY_PRESENT");
  if (register.accounting.assignedChannelRows
    < register.accounting.effectChannelHypothesisRows) {
    addGap(gaps, "REGISTER_EFFECT_CHANNEL_HYPOTHESIS_COVERAGE_UNASSIGNED");
  }
  if (register.accounting.unknownAffectedClassEntries > 0) {
    addGap(gaps, "UNKNOWN_AFFECTED_CLASS_REMAINS_UNRESOLVED");
  }
  if (register.accounting.potentialBystanderClassEntries === 0
    && register.accounting.unknownAffectedClassEntries === 0) {
    addGap(gaps, "AFFECTED_CLASS_COVERAGE_PLACEHOLDER_OMITTED");
  }
  addGap(gaps, "EFFECT_CHANNELS_ARE_REVIEW_HYPOTHESES_NOT_SOURCE_TRUTH");
  addGap(gaps, "EFFECT_CLOSURE_NOT_ESTABLISHED");
  addGap(gaps, "EXTERNAL_DUTY_ACCEPTANCE_NOT_ESTABLISHED");
  addGap(gaps, "EXTERNAL_RESPONSIBILITY_COMPLETENESS_NOT_ESTABLISHED");
  addGap(gaps, "AFFECTED_PARTY_STANDING_NOT_ESTABLISHED");
  ArraySort(gaps);
  return gaps;
}

function buildFromReplayedSource(source, affectedPartyRegister,
  affectedPartyRegisterSource) {
  const registerVerification = verifyAffectedPartyRegister(affectedPartyRegister, {
    source: affectedPartyRegisterSource,
    expectedSourceHash: source.affectedPartyRegisterSourceHash,
    expectedAffectedPartyRootHash: source.affectedPartyRootHash,
  });
  if (!registerVerification.ok) {
    fail(`AFFECTED_PARTY_SOURCE_REPLAY_FAILED:${registerVerification.error ?? "INVALID"}`);
  }
  if (source.effectConsequenceReviewProjectionHash
    !== affectedPartyRegister.effectConsequenceReviewProjectionHash) {
    fail("EFFECT_REVIEW_PROJECTION_BINDING_MISMATCH");
  }
  if (source.beforeStateHash !== affectedPartyRegister.beforeStateHash) {
    fail("BEFORE_STATE_BINDING_MISMATCH");
  }
  if (!same(source.subjectBindings, affectedPartyRegister.subjectBindings)) {
    fail("SUBJECT_BINDING_MISMATCH");
  }
  if (!same(source.reviewRefs, affectedPartyRegister.reviewRefs)) {
    fail("REVIEW_REF_BINDING_MISMATCH");
  }
  const analysis = analyze(affectedPartyRegister, source.duties);
  const body = {
    schema: RESPONSIBILITY_GRAPH_SCHEMAS.graph,
    schemaVersion: "1.0.0",
    graphClass: "HOLD_REVIEW_GRAPH_NOT_SEMANTIC_CLOSURE_OR_DUTY_ACCEPTANCE",
    sourceHash: source.sourceHash,
    affectedPartyRegisterSourceHash: source.affectedPartyRegisterSourceHash,
    affectedPartyRootHash: source.affectedPartyRootHash,
    effectConsequenceReviewProjectionHash:
      source.effectConsequenceReviewProjectionHash,
    beforeStateHash: source.beforeStateHash,
    subjectBindings: source.subjectBindings,
    reviewRefs: source.reviewRefs,
    duties: source.duties,
    canonicalResponsibilityRows: analysis.canonicalResponsibilityRows,
    accounting: analysis.accounting,
    gapReasons: graphGapReasons(affectedPartyRegister, analysis.accounting),
    graphSourceReplayComplete: true,
    affectedPartyRegisterSourceReplayComplete: true,
    effectReviewSourceRebuildComplete: true,
    identityMode: "HASH_ONLY_NO_RAW_PII",
    rawPiiAccepted: false,
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
    actionReady: false,
    executable: false,
    causalExperienceUnits: 0,
    callbacksInvoked: 0,
    authority: RESPONSIBILITY_GRAPH_NO_AUTHORITY,
  };
  return deepFreeze({ ...body, responsibilityGraphHash: digest(
    RESPONSIBILITY_GRAPH_SCHEMAS.graph, body) });
}

export function buildResponsibilityGraph(input = {}) {
  canonicalizeStrict(input);
  exactObject(input, ["source", "affectedPartyRegister",
    "affectedPartyRegisterSource"], "BUILD_INPUT");
  const source = replaySource(input.source, input.source.sourceHash);
  return buildFromReplayedSource(source, input.affectedPartyRegister,
    input.affectedPartyRegisterSource);
}

function exactGraphRecord(value) {
  canonicalizeStrict(value);
  exactObject(value, ["schema", "schemaVersion", "graphClass", "sourceHash",
    "affectedPartyRegisterSourceHash", "affectedPartyRootHash",
    "effectConsequenceReviewProjectionHash", "beforeStateHash", "subjectBindings",
    "reviewRefs", "duties", "canonicalResponsibilityRows", "accounting",
    "gapReasons", "graphSourceReplayComplete",
    "affectedPartyRegisterSourceReplayComplete", "effectReviewSourceRebuildComplete",
    "identityMode", "rawPiiAccepted", "providerApplicabilityEstablished",
    "effectClosureEstablished", "affectedPartyCompletenessEstablished",
    "responsibilityCompletenessEstablished", "externalDutyAcceptanceEstablished",
    "standingEstablished", "externalAuthorityEstablished", "closureEstablished",
    "semanticClosureEligible", "decisionState", "actionReady", "executable",
    "causalExperienceUnits", "callbacksInvoked", "authority",
    "responsibilityGraphHash"], "GRAPH");
  if (value.schema !== RESPONSIBILITY_GRAPH_SCHEMAS.graph
    || value.schemaVersion !== "1.0.0"
    || value.graphClass
      !== "HOLD_REVIEW_GRAPH_NOT_SEMANTIC_CLOSURE_OR_DUTY_ACCEPTANCE") {
    fail("GRAPH_SCHEMA_INVALID");
  }
  hash(value.responsibilityGraphHash, "RESPONSIBILITY_GRAPH_HASH");
  return value;
}

function verificationFailure(error) {
  return deepFreeze({
    schema: RESPONSIBILITY_GRAPH_SCHEMAS.verification,
    ok: false,
    graphSourceReplayComplete: false,
    affectedPartyRegisterSourceReplayComplete: false,
    effectReviewSourceRebuildComplete: false,
    responsibilityGraphHash: null,
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
    actionReady: false,
    executable: false,
    causalExperienceUnits: 0,
    authority: RESPONSIBILITY_GRAPH_NO_AUTHORITY,
    error: error instanceof ErrorConstructor ? error.message : "UNKNOWN_FAILURE",
  });
}

export function verifyResponsibilityGraph(record, options = {}) {
  try {
    /* Canonical descriptor validation deliberately precedes every field read. */
    canonicalizeStrict(record);
    canonicalizeStrict(options);
    exactGraphRecord(record);
    exactObject(options, ["source", "affectedPartyRegister",
      "affectedPartyRegisterSource", "expectedSourceHash",
      "expectedResponsibilityGraphHash"], "VERIFY_OPTIONS");
    const expectedSourceHash = hash(options.expectedSourceHash,
      "EXPECTED_SOURCE_HASH");
    const expectedGraphHash = hash(options.expectedResponsibilityGraphHash,
      "EXPECTED_RESPONSIBILITY_GRAPH_HASH");
    const source = replaySource(options.source, expectedSourceHash);
    const rebuilt = buildFromReplayedSource(source, options.affectedPartyRegister,
      options.affectedPartyRegisterSource);
    if (rebuilt.responsibilityGraphHash !== expectedGraphHash) {
      fail("EXPECTED_RESPONSIBILITY_GRAPH_HASH_MISMATCH");
    }
    if (!same(record, rebuilt)) fail("GRAPH_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({
      schema: RESPONSIBILITY_GRAPH_SCHEMAS.verification,
      ok: true,
      graphSourceReplayComplete: true,
      affectedPartyRegisterSourceReplayComplete: true,
      effectReviewSourceRebuildComplete: true,
      responsibilityGraphHash: rebuilt.responsibilityGraphHash,
      affectedPartyRootHash: rebuilt.affectedPartyRootHash,
      effectConsequenceReviewProjectionHash:
        rebuilt.effectConsequenceReviewProjectionHash,
      gapReasons: rebuilt.gapReasons,
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
      actionReady: false,
      executable: false,
      causalExperienceUnits: 0,
      authority: RESPONSIBILITY_GRAPH_NO_AUTHORITY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
