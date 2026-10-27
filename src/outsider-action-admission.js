/*
 * Unified North Star action-admission scaffold.
 *
 * This module keeps four things deliberately separate:
 *   1. the capability an agent proposes to exercise;
 *   2. the radius referenced by an unresolved external-authority slot;
 *   3. the evidence radius committed before the attempt; and
 *   4. the responsibility radius committed before the attempt.
 *
 * It can prove contractions and describe gaps. It cannot verify institutional
 * authority, issue an execution token, or make an action ready. The only local
 * authority-slot constructor is unresolved by construction. A production
 * external verifier must be integrated as a different trust boundary later.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  delegationRadiusLeq,
  verifyDelegationRadius,
} from "./outsider-delegation-radius.js";

/* Capture the ambient intrinsics used by this trust boundary once.  Radius
 * and coverage checks must not adopt prototype replacements made after module
 * import. */
const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ObjectPrototype = Object.prototype;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ReflectOwnKeys = Reflect.ownKeys;
const NumberIsFinite = Number.isFinite;
const DateConstructor = Date;
const DateParse = Date.parse;
const StringConstructor = String;
const ErrorConstructor = Error;
const TypeErrorConstructor = TypeError;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const ArrayPush = Function.prototype.call.bind(Array.prototype.push);
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);

export const ACTION_ADMISSION_SCHEMAS = ObjectFreeze({
  authoritySlot: "outsider/external-authority-verifier-slot/v1",
  evidenceCommitment: "outsider/action-evidence-commitment/v1",
  responsibilityCommitment: "outsider/action-responsibility-commitment/v1",
  request: "outsider/action-admission-request/v1",
});

export const ACTION_ADMISSION_NO_AUTHORITY = deepFreeze({
  authorityEstablished: false,
  callerBooleanAccepted: false,
  callerKeyAccepted: false,
  localSignatureAccepted: false,
  hashOnlyProofAccepted: false,
  evidenceAcceptedAsAuthority: false,
  outcomeAcceptedAsAuthority: false,
  executable: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_COVERAGE_REFS = 1024;

function fail(code) {
  throw new TypeErrorConstructor(`ACTION_ADMISSION_${code}`);
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

function plainDataObject(value) {
  if (!value || typeof value !== "object" || ArrayIsArray(value)) return false;
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) return false;
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string") return false;
    const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !ObjectHasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      return false;
    }
  }
  return true;
}

function exactObject(value, keys, code) {
  if (!plainDataObject(value)) fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  const actual = ReflectOwnKeys(value);
  const expected = new ArrayConstructor(keys.length);
  for (let index = 0; index < keys.length; index += 1) expected[index] = keys[index];
  ArraySort(actual);
  ArraySort(expected);
  if (actual.length !== expected.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function exactOptions(value, allowed, code) {
  if (!plainDataObject(value)) fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  const actual = ReflectOwnKeys(value);
  for (let index = 0; index < actual.length; index += 1) {
    let found = false;
    for (let allowedIndex = 0; allowedIndex < allowed.length; allowedIndex += 1) {
      if (actual[index] === allowed[allowedIndex]) {
        found = true;
        break;
      }
    }
    if (!found) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function denseArray(value, code, { maximum = MAX_COVERAGE_REFS, nonempty = false } = {}) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum || (nonempty && value.length === 0)) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  const lengthDescriptor = ObjectGetOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !ObjectHasOwn(lengthDescriptor, "value")) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(`${code}_DENSE_ARRAY_REQUIRED`);
    }
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function iso(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC_INSTANT, value)
    || !NumberIsFinite(DateParse(value))
    || DateToISOString(new DateConstructor(value)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function seal(schema, body, hashField) {
  return deepFreeze({ ...body, [hashField]: digest(schema, body) });
}

function normalizeHashSet(value, code) {
  denseArray(value, code, { nonempty: true });
  const normalized = new ArrayConstructor(value.length);
  for (let index = 0; index < value.length; index += 1) {
    normalized[index] = hash(value[index], `${code}_HASH`);
  }
  ArraySort(normalized);
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1]) fail(`${code}_DUPLICATE`);
  }
  return normalized;
}

function requireRadius(radius, code, { nonempty = true } = {}) {
  const checked = verifyDelegationRadius(radius, { expectedRadiusHash: radius?.radiusHash });
  if (!checked.ok) fail(`${code}_INVALID:${checked.error}`);
  if (nonempty && checked.empty) fail(`${code}_EMPTY`);
  return radius;
}

/**
 * Make a local reference to a future external authority-verifier decision.
 * There is intentionally no authorityEstablished input and no local path to a
 * true value. Hashes identify slots; they do not prove authority.
 */
export function createUnresolvedExternalAuthoritySlot(input = {}) {
  exactObject(input, ["externalVerifierContractHash", "authorityArtifactRefHash",
    "authorityRadiusHash"], "AUTHORITY_SLOT_INPUT");
  const body = {
    schema: ACTION_ADMISSION_SCHEMAS.authoritySlot,
    schemaVersion: "1.0.0",
    externalVerifierContractHash: hash(input.externalVerifierContractHash,
      "EXTERNAL_VERIFIER_CONTRACT_HASH"),
    authorityArtifactRefHash: hash(input.authorityArtifactRefHash,
      "AUTHORITY_ARTIFACT_REF_HASH"),
    authorityRadiusHash: hash(input.authorityRadiusHash, "AUTHORITY_RADIUS_HASH"),
    slotState: "AWAITING_EXTERNAL_VERIFIER",
    authorityEstablished: false,
    externalVerificationReceiptHash: null,
    localConstructorCanEstablishAuthority: false,
    authority: ACTION_ADMISSION_NO_AUTHORITY,
  };
  return seal(ACTION_ADMISSION_SCHEMAS.authoritySlot, body, "authoritySlotHash");
}

function authoritySlotSpec(record) {
  exactObject(record, ["schema", "schemaVersion", "externalVerifierContractHash",
    "authorityArtifactRefHash", "authorityRadiusHash", "slotState",
    "authorityEstablished", "externalVerificationReceiptHash",
    "localConstructorCanEstablishAuthority", "authority", "authoritySlotHash"],
  "AUTHORITY_SLOT");
  if (record.schema !== ACTION_ADMISSION_SCHEMAS.authoritySlot
    || record.schemaVersion !== "1.0.0"
    || record.slotState !== "AWAITING_EXTERNAL_VERIFIER"
    || record.authorityEstablished !== false
    || record.externalVerificationReceiptHash !== null
    || record.localConstructorCanEstablishAuthority !== false
    || !same(record.authority, ACTION_ADMISSION_NO_AUTHORITY)) {
    fail("AUTHORITY_SLOT_STATE_INVALID");
  }
  hash(record.authoritySlotHash, "AUTHORITY_SLOT_HASH");
  return {
    externalVerifierContractHash: record.externalVerifierContractHash,
    authorityArtifactRefHash: record.authorityArtifactRefHash,
    authorityRadiusHash: record.authorityRadiusHash,
  };
}

export function verifyUnresolvedExternalAuthoritySlot(record, options = {}) {
  try {
    exactOptions(options, ["expectedAuthoritySlotHash"], "AUTHORITY_SLOT_VERIFY_OPTIONS");
    const rebuilt = createUnresolvedExternalAuthoritySlot(authoritySlotSpec(record));
    if (!same(record, rebuilt)) fail("AUTHORITY_SLOT_DERIVATION_INVALID");
    if (ObjectHasOwn(options, "expectedAuthoritySlotHash")
      && record.authoritySlotHash !== hash(options.expectedAuthoritySlotHash,
        "EXPECTED_AUTHORITY_SLOT_HASH")) fail("EXPECTED_AUTHORITY_SLOT_HASH_MISMATCH");
    return deepFreeze({ ok: true, authoritySlotHash: record.authoritySlotHash,
      authorityEstablished: false, executable: false, authority: ACTION_ADMISSION_NO_AUTHORITY });
  } catch (error) {
    return deepFreeze({ ok: false, authorityEstablished: false, executable: false,
      authority: ACTION_ADMISSION_NO_AUTHORITY,
      error: error instanceof ErrorConstructor ? error.message : StringConstructor(error) });
  }
}

function createCommitment(kind, input) {
  const isEvidence = kind === "evidence";
  const partyField = isEvidence ? "custodianRefHashes" : "responsiblePartyRefHashes";
  exactObject(input, ["commitmentRefHash", "radius", "affectedChannelHashes",
    "horizonHashes", partyField], `${kind.toUpperCase()}_COMMITMENT_INPUT`);
  const radius = requireRadius(input.radius, `${kind.toUpperCase()}_COMMITMENT_RADIUS`);
  const schema = isEvidence ? ACTION_ADMISSION_SCHEMAS.evidenceCommitment
    : ACTION_ADMISSION_SCHEMAS.responsibilityCommitment;
  const body = {
    schema,
    schemaVersion: "1.0.0",
    commitmentKind: isEvidence ? "EVIDENCE" : "RESPONSIBILITY",
    commitmentRefHash: hash(input.commitmentRefHash,
      `${kind.toUpperCase()}_COMMITMENT_REF_HASH`),
    radiusHash: radius.radiusHash,
    affectedChannelHashes: normalizeHashSet(input.affectedChannelHashes,
      `${kind.toUpperCase()}_AFFECTED_CHANNELS`),
    horizonHashes: normalizeHashSet(input.horizonHashes,
      `${kind.toUpperCase()}_HORIZONS`),
    [partyField]: normalizeHashSet(input[partyField],
      `${kind.toUpperCase()}_${isEvidence ? "CUSTODIANS" : "RESPONSIBLE_PARTIES"}`),
    commitmentState: "STRUCTURAL_COMMITMENT_ONLY",
    authorityEstablished: false,
    authorityEffect: "NONE",
    authority: ACTION_ADMISSION_NO_AUTHORITY,
  };
  return seal(schema, body, isEvidence ? "evidenceCommitmentHash"
    : "responsibilityCommitmentHash");
}

export function createActionEvidenceCommitment(input = {}) {
  return createCommitment("evidence", input);
}

export function createActionResponsibilityCommitment(input = {}) {
  return createCommitment("responsibility", input);
}

function commitmentSpec(record, kind) {
  const isEvidence = kind === "evidence";
  const schema = isEvidence ? ACTION_ADMISSION_SCHEMAS.evidenceCommitment
    : ACTION_ADMISSION_SCHEMAS.responsibilityCommitment;
  const hashField = isEvidence ? "evidenceCommitmentHash" : "responsibilityCommitmentHash";
  const partyField = isEvidence ? "custodianRefHashes" : "responsiblePartyRefHashes";
  exactObject(record, ["schema", "schemaVersion", "commitmentKind", "commitmentRefHash",
    "radiusHash", "affectedChannelHashes", "horizonHashes", partyField,
    "commitmentState", "authorityEstablished", "authorityEffect", "authority", hashField],
  `${kind.toUpperCase()}_COMMITMENT`);
  if (record.schema !== schema || record.schemaVersion !== "1.0.0"
    || record.commitmentKind !== (isEvidence ? "EVIDENCE" : "RESPONSIBILITY")
    || record.commitmentState !== "STRUCTURAL_COMMITMENT_ONLY"
    || record.authorityEstablished !== false || record.authorityEffect !== "NONE"
    || !same(record.authority, ACTION_ADMISSION_NO_AUTHORITY)) {
    fail(`${kind.toUpperCase()}_COMMITMENT_STATE_INVALID`);
  }
  hash(record[hashField], `${kind.toUpperCase()}_COMMITMENT_HASH`);
  return {
    commitmentRefHash: record.commitmentRefHash,
    affectedChannelHashes: record.affectedChannelHashes,
    horizonHashes: record.horizonHashes,
    [partyField]: record[partyField],
  };
}

function verifyCommitment(record, radius, kind, expectedHash) {
  try {
    const spec = commitmentSpec(record, kind);
    if (record.radiusHash !== radius?.radiusHash) fail(`${kind.toUpperCase()}_RADIUS_BINDING_MISMATCH`);
    const rebuilt = createCommitment(kind, { ...spec, radius });
    if (!same(record, rebuilt)) fail(`${kind.toUpperCase()}_COMMITMENT_DERIVATION_INVALID`);
    const hashField = kind === "evidence" ? "evidenceCommitmentHash"
      : "responsibilityCommitmentHash";
    if (expectedHash !== undefined && record[hashField] !== hash(expectedHash,
      `EXPECTED_${kind.toUpperCase()}_COMMITMENT_HASH`)) {
      fail(`EXPECTED_${kind.toUpperCase()}_COMMITMENT_HASH_MISMATCH`);
    }
    return deepFreeze({ ok: true, [hashField]: record[hashField],
      authorityEstablished: false, executable: false, authority: ACTION_ADMISSION_NO_AUTHORITY });
  } catch (error) {
    return deepFreeze({ ok: false, authorityEstablished: false, executable: false,
      authority: ACTION_ADMISSION_NO_AUTHORITY,
      error: error instanceof ErrorConstructor ? error.message : StringConstructor(error) });
  }
}

export function verifyActionEvidenceCommitment(record, context = {}) {
  try {
    exactOptions(context, ["radius", "expectedEvidenceCommitmentHash"],
      "EVIDENCE_VERIFY_CONTEXT");
    if (!ObjectHasOwn(context, "radius")) fail("EVIDENCE_VERIFY_RADIUS_REQUIRED");
    return verifyCommitment(record, context.radius, "evidence",
      context.expectedEvidenceCommitmentHash);
  } catch (error) {
    return deepFreeze({ ok: false, authorityEstablished: false, executable: false,
      authority: ACTION_ADMISSION_NO_AUTHORITY,
      error: error instanceof ErrorConstructor ? error.message : StringConstructor(error) });
  }
}

export function verifyActionResponsibilityCommitment(record, context = {}) {
  try {
    exactOptions(context, ["radius", "expectedResponsibilityCommitmentHash"],
      "RESPONSIBILITY_VERIFY_CONTEXT");
    if (!ObjectHasOwn(context, "radius")) fail("RESPONSIBILITY_VERIFY_RADIUS_REQUIRED");
    return verifyCommitment(record, context.radius, "responsibility",
      context.expectedResponsibilityCommitmentHash);
  } catch (error) {
    return deepFreeze({ ok: false, authorityEstablished: false, executable: false,
      authority: ACTION_ADMISSION_NO_AUTHORITY,
      error: error instanceof ErrorConstructor ? error.message : StringConstructor(error) });
  }
}

function normalizeBindings(value) {
  exactObject(value, ["claimWayWorld", "run", "governance", "state", "validity"],
    "BINDINGS");
  exactObject(value.claimWayWorld, ["claimHash", "wayHash", "worldHash"],
    "CLAIM_WAY_WORLD_BINDINGS");
  exactObject(value.run, ["episodeHash", "attemptHash", "censusHash"], "RUN_BINDINGS");
  exactObject(value.governance, ["ownerGateSlotHash", "adoptionSlotHash",
    "revocationStatusSlotHash"], "GOVERNANCE_BINDINGS");
  exactObject(value.state, ["beforeStateHash"], "STATE_BINDINGS");
  exactObject(value.validity, ["validitySlotHash", "evaluatedAt"], "VALIDITY_BINDINGS");
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
    governance: {
      ownerGateSlotHash: hash(value.governance.ownerGateSlotHash, "OWNER_GATE_SLOT_HASH"),
      adoptionSlotHash: hash(value.governance.adoptionSlotHash, "ADOPTION_SLOT_HASH"),
      revocationStatusSlotHash: hash(value.governance.revocationStatusSlotHash,
        "REVOCATION_STATUS_SLOT_HASH"),
    },
    state: { beforeStateHash: hash(value.state.beforeStateHash, "BEFORE_STATE_HASH") },
    validity: {
      validitySlotHash: hash(value.validity.validitySlotHash, "VALIDITY_SLOT_HASH"),
      evaluatedAt: iso(value.validity.evaluatedAt, "EVALUATED_AT"),
    },
  };
}

function normalizeEnvelope(value) {
  exactObject(value, ["affectedChannelHashes", "horizonHashes"], "CONSEQUENCE_ENVELOPE");
  return {
    affectedChannelHashes: normalizeHashSet(value.affectedChannelHashes,
      "CONSEQUENCE_AFFECTED_CHANNELS"),
    horizonHashes: normalizeHashSet(value.horizonHashes, "CONSEQUENCE_HORIZONS"),
  };
}

function subset(candidate, ceiling) {
  for (let candidateIndex = 0; candidateIndex < candidate.length; candidateIndex += 1) {
    let found = false;
    for (let ceilingIndex = 0; ceilingIndex < ceiling.length; ceilingIndex += 1) {
      if (candidate[candidateIndex] === ceiling[ceilingIndex]) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

function coversInstant(radius, instant) {
  if (radius.empty || radius.validity === null) return false;
  const time = DateParse(instant);
  return time >= DateParse(radius.validity.validFrom)
    && time < DateParse(radius.validity.validUntil);
}

function requireAuthorityBundle(value) {
  exactObject(value, ["radius", "externalVerifierSlot"], "REFERENCED_AUTHORITY_INPUT");
  const radius = requireRadius(value.radius, "REFERENCED_AUTHORITY_RADIUS");
  const checked = verifyUnresolvedExternalAuthoritySlot(value.externalVerifierSlot,
    { expectedAuthoritySlotHash: value.externalVerifierSlot?.authoritySlotHash });
  if (!checked.ok) fail(`REFERENCED_AUTHORITY_SLOT_INVALID:${checked.error}`);
  if (value.externalVerifierSlot.authorityRadiusHash !== radius.radiusHash) {
    fail("REFERENCED_AUTHORITY_RADIUS_SLOT_MISMATCH");
  }
  return { radius, externalVerifierSlot: value.externalVerifierSlot };
}

function requireCommitment(record, radius, kind) {
  const checked = kind === "evidence"
    ? verifyActionEvidenceCommitment(record, { radius,
      expectedEvidenceCommitmentHash: record?.evidenceCommitmentHash })
    : verifyActionResponsibilityCommitment(record, { radius,
      expectedResponsibilityCommitmentHash: record?.responsibilityCommitmentHash });
  if (!checked.ok) fail(`${kind.toUpperCase()}_COMMITMENT_INVALID:${checked.error}`);
  return record;
}

function holdReasons(checks) {
  const reasons = [];
  if (!checks.capabilityWithinReferencedAuthorityRadius) {
    ArrayPush(reasons, "CAPABILITY_OUTSIDE_REFERENCED_AUTHORITY_RADIUS");
  }
  if (!checks.capabilityWithinConservativeEffectRadius) {
    ArrayPush(reasons, "EFFECT_RADIUS_UNDERSTATES_CAPABILITY");
  }
  if (!checks.effectWithinEvidenceRadius) {
    ArrayPush(reasons, "EVIDENCE_RADIUS_LAGS_EFFECT_RADIUS");
  }
  if (!checks.effectWithinResponsibilityRadius) {
    ArrayPush(reasons, "RESPONSIBILITY_RADIUS_LAGS_EFFECT_RADIUS");
  }
  if (!checks.evidenceCoversAffectedChannels) {
    ArrayPush(reasons, "EVIDENCE_AFFECTED_CHANNEL_GAP");
  }
  if (!checks.evidenceCoversHorizons) ArrayPush(reasons, "EVIDENCE_HORIZON_GAP");
  if (!checks.responsibilityCoversAffectedChannels) {
    ArrayPush(reasons, "RESPONSIBILITY_AFFECTED_CHANNEL_GAP");
  }
  if (!checks.responsibilityCoversHorizons) {
    ArrayPush(reasons, "RESPONSIBILITY_HORIZON_GAP");
  }
  if (!checks.allRadiusValiditiesCoverEvaluation) ArrayPush(reasons, "VALIDITY_WINDOW_GAP");
  ArrayPush(reasons, "EXTERNAL_AUTHORITY_UNESTABLISHED");
  return reasons;
}

/**
 * Build a content-addressed admission/expansion request. This function has no
 * branch that admits, executes, or returns actionReady=true.
 */
export function requestActionAdmission(input = {}) {
  exactObject(input, ["bindings", "capabilityRadius", "effectRadius", "referencedAuthority",
    "evidence", "responsibility", "consequenceEnvelope"], "REQUEST_INPUT");
  const bindings = normalizeBindings(input.bindings);
  const capabilityRadius = requireRadius(input.capabilityRadius, "CAPABILITY_RADIUS");
  const effectRadius = requireRadius(input.effectRadius, "EFFECT_RADIUS");
  const referencedAuthority = requireAuthorityBundle(input.referencedAuthority);
  exactObject(input.evidence, ["radius", "commitment"], "EVIDENCE_INPUT");
  const evidenceRadius = requireRadius(input.evidence.radius, "EVIDENCE_RADIUS");
  const evidenceCommitment = requireCommitment(input.evidence.commitment,
    evidenceRadius, "evidence");
  exactObject(input.responsibility, ["radius", "commitment"], "RESPONSIBILITY_INPUT");
  const responsibilityRadius = requireRadius(input.responsibility.radius,
    "RESPONSIBILITY_RADIUS");
  const responsibilityCommitment = requireCommitment(input.responsibility.commitment,
    responsibilityRadius, "responsibility");
  const consequenceEnvelope = normalizeEnvelope(input.consequenceEnvelope);
  const checks = {
    capabilityWithinReferencedAuthorityRadius: delegationRadiusLeq({
      candidate: capabilityRadius, ceiling: referencedAuthority.radius,
    }),
    capabilityWithinConservativeEffectRadius: delegationRadiusLeq({
      candidate: capabilityRadius, ceiling: effectRadius,
    }),
    effectWithinEvidenceRadius: delegationRadiusLeq({
      candidate: effectRadius, ceiling: evidenceRadius,
    }),
    effectWithinResponsibilityRadius: delegationRadiusLeq({
      candidate: effectRadius, ceiling: responsibilityRadius,
    }),
    evidenceCoversAffectedChannels: subset(consequenceEnvelope.affectedChannelHashes,
      evidenceCommitment.affectedChannelHashes),
    evidenceCoversHorizons: subset(consequenceEnvelope.horizonHashes,
      evidenceCommitment.horizonHashes),
    responsibilityCoversAffectedChannels: subset(consequenceEnvelope.affectedChannelHashes,
      responsibilityCommitment.affectedChannelHashes),
    responsibilityCoversHorizons: subset(consequenceEnvelope.horizonHashes,
      responsibilityCommitment.horizonHashes),
    allRadiusValiditiesCoverEvaluation:
      coversInstant(capabilityRadius, bindings.validity.evaluatedAt)
      && coversInstant(effectRadius, bindings.validity.evaluatedAt)
      && coversInstant(referencedAuthority.radius, bindings.validity.evaluatedAt)
      && coversInstant(evidenceRadius, bindings.validity.evaluatedAt)
      && coversInstant(responsibilityRadius, bindings.validity.evaluatedAt),
    externalAuthorityEstablished: false,
  };
  const structuralChecks = checks.capabilityWithinReferencedAuthorityRadius === true
    && checks.capabilityWithinConservativeEffectRadius === true
    && checks.effectWithinEvidenceRadius === true
    && checks.effectWithinResponsibilityRadius === true
    && checks.evidenceCoversAffectedChannels === true
    && checks.evidenceCoversHorizons === true
    && checks.responsibilityCoversAffectedChannels === true
    && checks.responsibilityCoversHorizons === true
    && checks.allRadiusValiditiesCoverEvaluation === true;
  const reasons = holdReasons(checks);
  const body = {
    schema: ACTION_ADMISSION_SCHEMAS.request,
    schemaVersion: "1.0.0",
    bindings,
    radiusBindings: {
      capabilityRadiusHash: capabilityRadius.radiusHash,
      referencedAuthorityRadiusHash: referencedAuthority.radius.radiusHash,
      conservativeEffectRadiusHash: effectRadius.radiusHash,
      evidenceRadiusHash: evidenceRadius.radiusHash,
      responsibilityRadiusHash: responsibilityRadius.radiusHash,
    },
    externalAuthoritySlotHash: referencedAuthority.externalVerifierSlot.authoritySlotHash,
    evidenceCommitmentHash: evidenceCommitment.evidenceCommitmentHash,
    responsibilityCommitmentHash: responsibilityCommitment.responsibilityCommitmentHash,
    consequenceEnvelope,
    checks,
    structuralChecksSatisfied: structuralChecks,
    reviewRequestKind: structuralChecks
      ? "ADMISSION_REVIEW_REQUEST" : "EXPANSION_AND_ADMISSION_REVIEW_REQUEST",
    holdReasons: reasons,
    decision: {
      state: "HOLD",
      admissionRequested: true,
      expansionRequested: !structuralChecks,
      admitted: false,
      actionReady: false,
      executable: false,
      executionToken: null,
      authorityEstablished: false,
    },
    productionBlockers: [
      "EXTERNAL_AUTHORITY_VERIFIER_NOT_INTEGRATED",
      "CLAIM_WAY_WORLD_AND_CENSUS_BINDINGS_NOT_SOURCE_REPLAYED_BY_THIS_MODULE",
      "OWNER_ADOPTION_REVOCATION_SLOTS_ARE_OPAQUE_BINDINGS_ONLY",
      "EVIDENCE_AND_RESPONSIBILITY_COMMITMENTS_ARE_STRUCTURAL_ONLY",
      "NO_RUNTIME_EXECUTION_BRIDGE_BY_DESIGN",
    ],
    authority: ACTION_ADMISSION_NO_AUTHORITY,
  };
  return seal(ACTION_ADMISSION_SCHEMAS.request, body, "admissionRequestHash");
}

/**
 * Rebuild from exact source artifacts. There is no hash-only verification mode,
 * and success still means only that a HOLD request was rederived.
 */
export function verifyActionAdmissionRequest(record, context = {}) {
  try {
    exactOptions(context, ["source", "expectedAdmissionRequestHash"],
      "REQUEST_VERIFY_CONTEXT");
    if (!ObjectHasOwn(context, "source")
      || !ObjectHasOwn(context, "expectedAdmissionRequestHash")) {
      fail("REQUEST_VERIFY_SOURCE_AND_EXPECTED_HASH_REQUIRED");
    }
    const rebuilt = requestActionAdmission(context.source);
    if (!same(record, rebuilt)) fail("REQUEST_DERIVATION_INVALID");
    const expected = hash(context.expectedAdmissionRequestHash,
      "EXPECTED_ADMISSION_REQUEST_HASH");
    if (record.admissionRequestHash !== expected) fail("EXPECTED_ADMISSION_REQUEST_HASH_MISMATCH");
    return deepFreeze({
      ok: true,
      verificationLevel: "SOURCE_ARTIFACTS_REDERIVED_EXPECTED_HASH_BOUND",
      admissionRequestHash: record.admissionRequestHash,
      decisionState: "HOLD",
      authorityEstablished: false,
      admitted: false,
      actionReady: false,
      executable: false,
      authority: ACTION_ADMISSION_NO_AUTHORITY,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "INVALID",
      authorityEstablished: false,
      admitted: false,
      actionReady: false,
      executable: false,
      authority: ACTION_ADMISSION_NO_AUTHORITY,
      error: error instanceof ErrorConstructor ? error.message : StringConstructor(error),
    });
  }
}
