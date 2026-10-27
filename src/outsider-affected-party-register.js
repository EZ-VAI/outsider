/*
 * HOLD-only affected-party review source and register.
 *
 * The source embeds a complete effect-consequence review record plus the full
 * capability/effect-radius context needed to rebuild it.  Its channel and
 * mandatory-horizon rows are therefore deterministic review hypotheses, not
 * real effect closure.  Identities remain hash-only; unknown and potential
 * bystander classes are unresolved coverage classes and can never establish
 * standing, completeness, authority, closure, or permission.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  buildEffectConsequenceReviewProjection,
  verifyEffectConsequenceReviewProjection,
} from "./outsider-effect-consequence-review.js";

export const AFFECTED_PARTY_REGISTER_SCHEMAS = Object.freeze({
  source: "outsider/affected-party-review-source/v1",
  register: "outsider/affected-party-review-register/v1",
  verification: "outsider/affected-party-review-register-verification/v1",
  channelBinding: "outsider/effect-review-channel-binding/v1",
  horizonBinding: "outsider/effect-review-mandatory-horizon-binding/v1",
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
const RegExpPrototypeTest = Function.prototype.call.bind(RegExp.prototype.test);
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const StringConstructor = String;
const ErrorConstructor = Error;
const TypeErrorConstructor = TypeError;

const HASH = /^sha256:[a-f0-9]{64}$/u;
const REVIEW_ID = /^[A-Z][A-Z0-9_]{0,159}$/u;
const MAX_REVIEW_REFS = 4096;
const MAX_COVERAGE_SUBJECTS = 256;
const MAX_HYPOTHESES = 2048;

const PARTY_CLASSES = Object.freeze([
  "DIRECT_AFFECTED_PARTY",
  "INDIRECT_AFFECTED_PARTY",
  "POTENTIAL_BYSTANDER_CLASS",
  "UNKNOWN_AFFECTED_CLASS",
  "ENVIRONMENTAL_INTEREST_CLASS",
]);

export const AFFECTED_PARTY_REGISTER_NO_AUTHORITY = deepFreeze({
  providerApplicabilityEstablished: false,
  effectClosureEstablished: false,
  affectedPartyCompletenessEstablished: false,
  standingEstablished: false,
  externalAuthorityEstablished: false,
  closureEstablished: false,
  actionReady: false,
  executable: false,
  callerAssertionsAcceptedAsAuthority: false,
  hashesAcceptedAsAuthority: false,
  reviewCoverageAcceptedAsRealEffect: false,
  callbacksAccepted: false,
});

function fail(code) {
  throw new TypeErrorConstructor(`AFFECTED_PARTY_REGISTER_${code}`);
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
      const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
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

function normalizeStringSet(value, code, { nonempty = false } = {}) {
  denseArray(value, code, MAX_HYPOTHESES, { nonempty });
  const normalized = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string" || value[index].length === 0
      || value[index].length > 256) fail(`${code}_VALUE_INVALID`);
    append(normalized, value[index]);
  }
  ArraySort(normalized);
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1]) fail(`${code}_DUPLICATE`);
  }
  return normalized;
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

function projectionSubjectBindings(projection) {
  return {
    claimHash: projection.bindings.claimWayWorld.claimHash,
    wayHash: projection.bindings.claimWayWorld.wayHash,
    worldHash: projection.bindings.claimWayWorld.worldHash,
    episodeHash: projection.bindings.run.episodeHash,
    attemptHash: projection.bindings.run.attemptHash,
    censusHash: projection.bindings.run.censusHash,
  };
}

function normalizeEffectReview(projection, context) {
  canonicalizeStrict(projection);
  canonicalizeStrict(context);
  exactObject(context, ["capabilityRadius", "effectRadius"],
    "EFFECT_REVIEW_CONTEXT");
  const expectedProjectionHash = hash(projection.projectionHash,
    "EFFECT_CONSEQUENCE_REVIEW_PROJECTION_HASH");
  const checked = verifyEffectConsequenceReviewProjection(projection, {
    capabilityRadius: context.capabilityRadius,
    effectRadius: context.effectRadius,
    expectedProjectionHash,
  });
  if (!checked.ok || checked.decision !== "HOLD"
    || checked.providerApplicabilityEstablished !== false
    || checked.effectClosure !== false || checked.affectedPartyCompleteness !== false
    || checked.evidenceCoverage !== false || checked.responsibilityCoverage !== false
    || checked.authority !== false || checked.actionReady !== false
    || checked.executable !== false || checked.trainingRows !== 0
    || checked.causalExperienceUnits !== 0) {
    fail(`EFFECT_REVIEW_SOURCE_REBUILD_FAILED:${checked.error ?? "BOUNDARY_INVALID"}`);
  }
  const rebuilt = buildEffectConsequenceReviewProjection({
    bindings: projection.bindings,
    capabilityRadius: context.capabilityRadius,
    effectRadius: context.effectRadius,
    selectedProviderEntityIds: projection.selectedProviderEntityIds,
    selectedOfficialSourceCandidateIds: projection.selectedOfficialSourceCandidateIds,
  });
  if (!same(projection, rebuilt)) fail("EFFECT_REVIEW_REBUILD_MISMATCH");
  return {
    projection: rebuilt,
    context: {
      capabilityRadius: cloneCanonical(context.capabilityRadius),
      effectRadius: cloneCanonical(context.effectRadius),
    },
  };
}

function deriveHypothesisRows(projection, beforeStateHash) {
  const channelIds = normalizeStringSet(projection.channelHypotheses,
    "EFFECT_CHANNEL_HYPOTHESES", { nonempty: true });
  const horizonIds = normalizeStringSet(projection.horizonHypotheses,
    "EFFECT_HORIZON_HYPOTHESES", { nonempty: true });
  const channels = new ArrayConstructor();
  const horizons = new ArrayConstructor();
  for (let index = 0; index < channelIds.length; index += 1) {
    const channelId = channelIds[index];
    append(channels, { channelId, channelHash: digest(
      AFFECTED_PARTY_REGISTER_SCHEMAS.channelBinding, {
        effectConsequenceReviewProjectionHash: projection.projectionHash,
        beforeStateHash,
        channelId,
      }) });
  }
  for (let index = 0; index < horizonIds.length; index += 1) {
    const horizonId = horizonIds[index];
    append(horizons, { horizonId, mandatory: true, horizonHash: digest(
      AFFECTED_PARTY_REGISTER_SCHEMAS.horizonBinding, {
        effectConsequenceReviewProjectionHash: projection.projectionHash,
        beforeStateHash,
        horizonId,
        mandatory: true,
      }) });
  }
  return { channels, horizons };
}

function channelById(rows, id) {
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].channelId === id) return rows[index];
  }
  return null;
}

function coverageSubjectKind(partyClass) {
  return partyClass === "DIRECT_AFFECTED_PARTY"
    || partyClass === "INDIRECT_AFFECTED_PARTY" ? "PARTY" : "UNRESOLVED_CLASS";
}

function normalizeCoverageDeclarations(value, channels) {
  denseArray(value, "COVERAGE_SUBJECTS", MAX_COVERAGE_SUBJECTS);
  const normalized = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    const declaration = value[index];
    exactObject(declaration, ["coverageSubjectRefHash", "partyClass",
      "standingBasisReviewRefHash", "channelIds"], "COVERAGE_SUBJECT");
    const partyClass = oneOf(declaration.partyClass, PARTY_CLASSES, "PARTY_CLASS");
    const kind = coverageSubjectKind(partyClass);
    let standingBasisReviewRefHash = declaration.standingBasisReviewRefHash;
    if (standingBasisReviewRefHash !== null) {
      standingBasisReviewRefHash = hash(standingBasisReviewRefHash,
        "STANDING_BASIS_REVIEW_REF_HASH");
    }
    if (kind === "UNRESOLVED_CLASS" && standingBasisReviewRefHash !== null) {
      fail("UNRESOLVED_CLASS_CANNOT_CARRY_STANDING_BASIS");
    }
    const channelIds = normalizeStringSet(declaration.channelIds,
      "COVERAGE_SUBJECT_CHANNEL_IDS");
    const channelHashes = new ArrayConstructor();
    for (let channelIndex = 0; channelIndex < channelIds.length; channelIndex += 1) {
      const row = channelById(channels, channelIds[channelIndex]);
      if (!row) fail("COVERAGE_SUBJECT_CHANNEL_OUTSIDE_EFFECT_REVIEW");
      append(channelHashes, row.channelHash);
    }
    append(normalized, {
      coverageSubjectRefHash: hash(declaration.coverageSubjectRefHash,
        "COVERAGE_SUBJECT_REF_HASH"),
      partyClass,
      coverageSubjectKind: kind,
      standingBasisReviewRefHash,
      channelIds,
      channelHashes,
    });
  }
  ArraySort(normalized, (left, right) => (
    left.coverageSubjectRefHash < right.coverageSubjectRefHash ? -1
      : left.coverageSubjectRefHash > right.coverageSubjectRefHash ? 1 : 0
  ));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].coverageSubjectRefHash
      === normalized[index - 1].coverageSubjectRefHash) {
      fail("COVERAGE_SUBJECT_REF_DUPLICATE");
    }
  }
  return normalized;
}

function deriveCoverageRows(channels, declarations) {
  const rows = new ArrayConstructor();
  for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
    const channel = channels[channelIndex];
    const partyCandidateRefHashes = new ArrayConstructor();
    const unresolvedClassRefHashes = new ArrayConstructor();
    for (let subjectIndex = 0; subjectIndex < declarations.length; subjectIndex += 1) {
      const subject = declarations[subjectIndex];
      if (!contains(subject.channelHashes, channel.channelHash)) continue;
      if (subject.coverageSubjectKind === "PARTY") {
        append(partyCandidateRefHashes, subject.coverageSubjectRefHash);
      } else {
        append(unresolvedClassRefHashes, subject.coverageSubjectRefHash);
      }
    }
    ArraySort(partyCandidateRefHashes);
    ArraySort(unresolvedClassRefHashes);
    append(rows, {
      channelId: channel.channelId,
      channelHash: channel.channelHash,
      partyCandidateRefHashes,
      unresolvedClassRefHashes,
    });
  }
  return rows;
}

function sourceInputDeclarations(sourceDeclarations) {
  const result = new ArrayConstructor();
  for (let index = 0; index < sourceDeclarations.length; index += 1) {
    const row = sourceDeclarations[index];
    append(result, {
      coverageSubjectRefHash: row.coverageSubjectRefHash,
      partyClass: row.partyClass,
      standingBasisReviewRefHash: row.standingBasisReviewRefHash,
      channelIds: row.channelIds,
    });
  }
  return result;
}

function makeSource(input) {
  const subjectBindings = normalizeSubjectBindings(input.subjectBindings);
  const beforeStateHash = hash(input.beforeStateHash, "BEFORE_STATE_HASH");
  const effect = normalizeEffectReview(input.effectConsequenceReviewProjection,
    input.effectReviewContext);
  if (!same(subjectBindings, projectionSubjectBindings(effect.projection))) {
    fail("EFFECT_REVIEW_SUBJECT_BINDING_MISMATCH");
  }
  if (effect.projection.bindings.action.beforeStateHash !== beforeStateHash) {
    fail("EFFECT_REVIEW_BEFORE_STATE_BINDING_MISMATCH");
  }
  const hypotheses = deriveHypothesisRows(effect.projection, beforeStateHash);
  const coverageSubjectDeclarations = normalizeCoverageDeclarations(
    input.coverageSubjects, hypotheses.channels);
  const reviewRefs = {
    providerReviews: normalizeReviewTuples(
      effect.projection.dependencyBindings.providerReviewProjectionHashes,
      "PROVIDER"),
    realityReviews: normalizeReviewTuples(
      effect.projection.dependencyBindings.officialSourceReviewProjectionHashes,
      "REALITY"),
    matraixReviews: normalizeReviewTuples(input.matraixReviewRefs, "MATRAIX"),
  };
  const body = {
    schema: AFFECTED_PARTY_REGISTER_SCHEMAS.source,
    schemaVersion: "1.0.0",
    sourceClass: "HOLD_REVIEW_SOURCE_NOT_REAL_EFFECT_OR_PARTY_COMPLETENESS",
    subjectBindings,
    beforeStateHash,
    effectConsequenceReviewProjectionHash: effect.projection.projectionHash,
    capabilityRadiusHash: effect.projection.capabilityRadiusHash,
    effectRadiusHash: effect.projection.effectRadiusHash,
    effectConsequenceReviewProjection: effect.projection,
    effectReviewContext: effect.context,
    reviewRefs,
    effectChannelRows: hypotheses.channels,
    mandatoryHorizonRows: hypotheses.horizons,
    coverageSubjectDeclarations,
    coverageRows: deriveCoverageRows(hypotheses.channels,
      coverageSubjectDeclarations),
    identityMode: "HASH_ONLY_NO_RAW_PII",
  };
  return deepFreeze({ ...body, sourceHash: digest(
    AFFECTED_PARTY_REGISTER_SCHEMAS.source, body) });
}

export function createAffectedPartyRegisterSource(input = {}) {
  canonicalizeStrict(input);
  exactObject(input, ["subjectBindings", "beforeStateHash",
    "effectConsequenceReviewProjection", "effectReviewContext",
    "matraixReviewRefs", "coverageSubjects"], "SOURCE_INPUT");
  return makeSource(input);
}

function exactSourceRecord(value) {
  canonicalizeStrict(value);
  exactObject(value, ["schema", "schemaVersion", "sourceClass", "subjectBindings",
    "beforeStateHash", "effectConsequenceReviewProjectionHash",
    "capabilityRadiusHash", "effectRadiusHash", "effectConsequenceReviewProjection",
    "effectReviewContext", "reviewRefs", "effectChannelRows",
    "mandatoryHorizonRows", "coverageSubjectDeclarations", "coverageRows",
    "identityMode", "sourceHash"], "SOURCE");
  if (value.schema !== AFFECTED_PARTY_REGISTER_SCHEMAS.source
    || value.schemaVersion !== "1.0.0"
    || value.sourceClass
      !== "HOLD_REVIEW_SOURCE_NOT_REAL_EFFECT_OR_PARTY_COMPLETENESS"
    || value.identityMode !== "HASH_ONLY_NO_RAW_PII") fail("SOURCE_STATE_INVALID");
  hash(value.sourceHash, "SOURCE_HASH");
  return value;
}

function replaySource(value, expectedSourceHash) {
  exactSourceRecord(value);
  const rebuilt = createAffectedPartyRegisterSource({
    subjectBindings: value.subjectBindings,
    beforeStateHash: value.beforeStateHash,
    effectConsequenceReviewProjection: value.effectConsequenceReviewProjection,
    effectReviewContext: value.effectReviewContext,
    matraixReviewRefs: value.reviewRefs.matraixReviews,
    coverageSubjects: sourceInputDeclarations(value.coverageSubjectDeclarations),
  });
  if (!same(value, rebuilt)) fail("SOURCE_DERIVATION_INVALID");
  if (rebuilt.sourceHash !== hash(expectedSourceHash, "EXPECTED_SOURCE_HASH")) {
    fail("EXPECTED_SOURCE_HASH_MISMATCH");
  }
  return rebuilt;
}

function registerAccounting(source) {
  let partyCandidateEntries = 0;
  let unresolvedClassEntries = 0;
  let potentialBystanderClassEntries = 0;
  let unknownAffectedClassEntries = 0;
  let partyCandidatesWithoutStandingBasis = 0;
  let assignedChannelRows = 0;
  for (let index = 0; index < source.coverageSubjectDeclarations.length; index += 1) {
    const subject = source.coverageSubjectDeclarations[index];
    if (subject.coverageSubjectKind === "PARTY") {
      partyCandidateEntries += 1;
      if (subject.standingBasisReviewRefHash === null) {
        partyCandidatesWithoutStandingBasis += 1;
      }
    } else {
      unresolvedClassEntries += 1;
    }
    if (subject.partyClass === "POTENTIAL_BYSTANDER_CLASS") {
      potentialBystanderClassEntries += 1;
    }
    if (subject.partyClass === "UNKNOWN_AFFECTED_CLASS") {
      unknownAffectedClassEntries += 1;
    }
  }
  for (let index = 0; index < source.coverageRows.length; index += 1) {
    const row = source.coverageRows[index];
    if (row.partyCandidateRefHashes.length > 0
      || row.unresolvedClassRefHashes.length > 0) assignedChannelRows += 1;
  }
  return {
    coverageSubjectEntries: source.coverageSubjectDeclarations.length,
    partyCandidateEntries,
    unresolvedClassEntries,
    potentialBystanderClassEntries,
    unknownAffectedClassEntries,
    partyCandidatesWithoutStandingBasis,
    effectChannelHypothesisRows: source.effectChannelRows.length,
    assignedChannelRows,
    mandatoryHorizonRows: source.mandatoryHorizonRows.length,
  };
}

function registerGapReasons(accounting) {
  const gaps = new ArrayConstructor();
  if (accounting.coverageSubjectEntries === 0) {
    append(gaps, "EMPTY_AFFECTED_PARTY_REVIEW_REGISTER");
  }
  if (accounting.potentialBystanderClassEntries === 0
    && accounting.unknownAffectedClassEntries === 0) {
    append(gaps, "AFFECTED_CLASS_COVERAGE_PLACEHOLDER_OMITTED");
  }
  if (accounting.unknownAffectedClassEntries > 0) {
    append(gaps, "UNKNOWN_AFFECTED_CLASS_PRESENT_AS_UNRESOLVED_CLASS_ONLY");
  }
  if (accounting.partyCandidateEntries === 0) {
    append(gaps, "NO_AFFECTED_PARTY_CANDIDATE_PRESENT");
  }
  if (accounting.partyCandidatesWithoutStandingBasis > 0) {
    append(gaps, "PARTY_CANDIDATE_STANDING_BASIS_REVIEW_MISSING");
  }
  if (accounting.assignedChannelRows < accounting.effectChannelHypothesisRows) {
    append(gaps, "EFFECT_CHANNEL_HYPOTHESIS_COVERAGE_UNASSIGNED");
  }
  append(gaps, "EFFECT_CHANNELS_ARE_REVIEW_HYPOTHESES_NOT_SOURCE_TRUTH");
  append(gaps, "EFFECT_CLOSURE_NOT_ESTABLISHED");
  append(gaps, "EXTERNAL_AFFECTED_PARTY_COMPLETENESS_NOT_ESTABLISHED");
  append(gaps, "AFFECTED_PARTY_STANDING_NOT_ESTABLISHED");
  ArraySort(gaps);
  return gaps;
}

function buildFromReplayedSource(source) {
  const accounting = registerAccounting(source);
  const body = {
    schema: AFFECTED_PARTY_REGISTER_SCHEMAS.register,
    schemaVersion: "1.0.0",
    registerClass: "HOLD_REVIEW_COVERAGE_NOT_SEMANTIC_CLOSURE",
    sourceHash: source.sourceHash,
    subjectBindings: source.subjectBindings,
    beforeStateHash: source.beforeStateHash,
    effectConsequenceReviewProjectionHash:
      source.effectConsequenceReviewProjectionHash,
    capabilityRadiusHash: source.capabilityRadiusHash,
    effectRadiusHash: source.effectRadiusHash,
    reviewRefs: source.reviewRefs,
    effectChannelRows: source.effectChannelRows,
    mandatoryHorizonRows: source.mandatoryHorizonRows,
    coverageSubjects: source.coverageSubjectDeclarations,
    coverageRows: source.coverageRows,
    accounting,
    gapReasons: registerGapReasons(accounting),
    sourceReplayComplete: true,
    effectReviewSourceRebuildComplete: true,
    identityMode: "HASH_ONLY_NO_RAW_PII",
    rawPiiAccepted: false,
    providerApplicabilityEstablished: false,
    effectClosureEstablished: false,
    affectedPartyCompletenessEstablished: false,
    standingEstablished: false,
    externalAuthorityEstablished: false,
    closureEstablished: false,
    semanticClosureEligible: false,
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    causalExperienceUnits: 0,
    callbacksInvoked: 0,
    authority: AFFECTED_PARTY_REGISTER_NO_AUTHORITY,
  };
  return deepFreeze({ ...body, affectedPartyRootHash: digest(
    AFFECTED_PARTY_REGISTER_SCHEMAS.register, body) });
}

export function buildAffectedPartyRegister(source) {
  canonicalizeStrict(source);
  exactSourceRecord(source);
  return buildFromReplayedSource(replaySource(source, source.sourceHash));
}

function exactRegisterRecord(value) {
  canonicalizeStrict(value);
  exactObject(value, ["schema", "schemaVersion", "registerClass", "sourceHash",
    "subjectBindings", "beforeStateHash", "effectConsequenceReviewProjectionHash",
    "capabilityRadiusHash", "effectRadiusHash", "reviewRefs", "effectChannelRows",
    "mandatoryHorizonRows", "coverageSubjects", "coverageRows", "accounting",
    "gapReasons", "sourceReplayComplete", "effectReviewSourceRebuildComplete",
    "identityMode", "rawPiiAccepted", "providerApplicabilityEstablished",
    "effectClosureEstablished", "affectedPartyCompletenessEstablished",
    "standingEstablished", "externalAuthorityEstablished", "closureEstablished",
    "semanticClosureEligible", "decisionState", "actionReady", "executable",
    "causalExperienceUnits", "callbacksInvoked", "authority",
    "affectedPartyRootHash"], "REGISTER");
  if (value.schema !== AFFECTED_PARTY_REGISTER_SCHEMAS.register
    || value.schemaVersion !== "1.0.0"
    || value.registerClass !== "HOLD_REVIEW_COVERAGE_NOT_SEMANTIC_CLOSURE") {
    fail("REGISTER_SCHEMA_INVALID");
  }
  hash(value.affectedPartyRootHash, "AFFECTED_PARTY_ROOT_HASH");
  return value;
}

function verificationFailure(error) {
  return deepFreeze({
    schema: AFFECTED_PARTY_REGISTER_SCHEMAS.verification,
    ok: false,
    sourceReplayComplete: false,
    effectReviewSourceRebuildComplete: false,
    affectedPartyRootHash: null,
    providerApplicabilityEstablished: false,
    effectClosureEstablished: false,
    affectedPartyCompletenessEstablished: false,
    standingEstablished: false,
    externalAuthorityEstablished: false,
    closureEstablished: false,
    semanticClosureEligible: false,
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    causalExperienceUnits: 0,
    authority: AFFECTED_PARTY_REGISTER_NO_AUTHORITY,
    error: error instanceof ErrorConstructor ? error.message : "UNKNOWN_FAILURE",
  });
}

export function verifyAffectedPartyRegister(record, options = {}) {
  try {
    /* Canonical descriptor validation deliberately precedes every field read. */
    canonicalizeStrict(record);
    canonicalizeStrict(options);
    exactRegisterRecord(record);
    exactObject(options, ["source", "expectedSourceHash",
      "expectedAffectedPartyRootHash"], "VERIFY_OPTIONS");
    const expectedSourceHash = hash(options.expectedSourceHash,
      "EXPECTED_SOURCE_HASH");
    const expectedRootHash = hash(options.expectedAffectedPartyRootHash,
      "EXPECTED_AFFECTED_PARTY_ROOT_HASH");
    const source = replaySource(options.source, expectedSourceHash);
    const rebuilt = buildFromReplayedSource(source);
    if (rebuilt.affectedPartyRootHash !== expectedRootHash) {
      fail("EXPECTED_AFFECTED_PARTY_ROOT_HASH_MISMATCH");
    }
    if (!same(record, rebuilt)) fail("REGISTER_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({
      schema: AFFECTED_PARTY_REGISTER_SCHEMAS.verification,
      ok: true,
      sourceReplayComplete: true,
      effectReviewSourceRebuildComplete: true,
      affectedPartyRootHash: rebuilt.affectedPartyRootHash,
      effectConsequenceReviewProjectionHash:
        rebuilt.effectConsequenceReviewProjectionHash,
      gapReasons: rebuilt.gapReasons,
      providerApplicabilityEstablished: false,
      effectClosureEstablished: false,
      affectedPartyCompletenessEstablished: false,
      standingEstablished: false,
      externalAuthorityEstablished: false,
      closureEstablished: false,
      semanticClosureEligible: false,
      decisionState: "HOLD",
      actionReady: false,
      executable: false,
      causalExperienceUnits: 0,
      authority: AFFECTED_PARTY_REGISTER_NO_AUTHORITY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
