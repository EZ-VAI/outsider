/*
 * Resource-owner actual-write-path gate conformance frontier.
 *
 * Production entrypoints in this module can only derive and replay a HOLD.
 * They bind the current ActionAdmission + Reality-obligation composition to
 * the mechanics a future, externally adopted owner gate must implement.  They
 * do not verify principal/resource-owner standing, owner adoption, revocation
 * freshness, policy/entity completeness, an exclusive write path, or an
 * actual resource mutation.
 *
 * The explicitly named test fixture harness exercises only single-process,
 * in-memory one-use/CAS/expiry/revocation/bypass mechanics.  It exposes no
 * callback, resource locator, command, credential, network operation, or
 * execution token.  Fixture integrity is never production authority.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  ACTION_ADMISSION_NO_AUTHORITY,
} from "./outsider-action-admission.js";
import {
  verifyActionObligationHoldComposition,
} from "./outsider-action-obligation-hold-composition.js";

export const OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS = Object.freeze({
  hold: "outsider/owner-write-gate-conformance-hold/v1",
  fixtureState: "outsider/owner-write-gate-conformance-state/test-fixture/v1",
  fixtureCommand: "outsider/owner-write-gate-conformance-command/test-fixture/v1",
  fixtureEvent: "outsider/owner-write-gate-conformance-event/test-fixture/v1",
  fixtureAuditCycle: "outsider/owner-write-gate-bypass-audit/test-fixture/v1",
});

export const OWNER_WRITE_GATE_NO_AUTHORITY = Object.freeze({
  authorityEstablished: false,
  principalStandingEstablished: false,
  resourceOwnerStandingEstablished: false,
  ownerAdoptionEstablished: false,
  revocationFreshnessEstablished: false,
  cedarAllowAcceptedAsStanding: false,
  callerBooleanAccepted: false,
  callerHashAcceptedAsAuthority: false,
  callerKeyAcceptedAsAuthority: false,
  localSignatureAcceptedAsAuthority: false,
  fixtureMechanicsAcceptedAsProductionAuthority: false,
  alternateWritePathsExcluded: false,
  actualWritePathVerified: false,
  actionReady: false,
  executable: false,
});

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const JSONParse = JSON.parse;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectCreate = Object.create;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const PromiseResolve = Promise.resolve.bind(Promise);
const ReflectOwnKeys = Reflect.ownKeys;
const StringConstructor = String;
const ErrorConstructor = Error;
const TypeErrorConstructor = TypeError;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const uncurryThis = (method) => Function.prototype.call.bind(method);
const ArrayEvery = uncurryThis(Array.prototype.every);
const ArrayIncludes = uncurryThis(Array.prototype.includes);
const ArrayJoin = uncurryThis(Array.prototype.join);
const ArrayPush = uncurryThis(Array.prototype.push);
const ArraySort = uncurryThis(Array.prototype.sort);
const PromiseThen = uncurryThis(Promise.prototype.then);

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const PROBE_ID = /^[A-Z][A-Z0-9_]{0,63}$/u;
const MAX_BYPASS_PROBES = 32;
const MAX_EVENTS = 2;
const CONSTRUCT_FIXTURE = Symbol("OwnerWriteGateFixtureHarnessForTests.construct");

const FIXTURE_COMMAND_KINDS = ObjectFreeze([
  "AUDIT_BYPASS_PATHS",
  "PRESENT_ONCE",
  "REVOKE",
  "SWEEP_EXPIRY",
]);
const FIXTURE_AUDIT_OUTCOMES = ObjectFreeze([
  "PASS_NO_BYPASS_OBSERVED",
  "BYPASS_OBSERVED",
  "ERROR",
]);

function fail(code) {
  throw new TypeErrorConstructor(`OWNER_WRITE_GATE_CONFORMANCE_${code}`);
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

function safeClone(value, code) {
  try {
    return JSONParse(canonicalizeStrict(value));
  } catch {
    fail(`${code}_CANONICAL_DATA_REQUIRED`);
  }
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== "object" || ArrayIsArray(value)
    || (ObjectGetPrototypeOf(value) !== ObjectPrototype
      && ObjectGetPrototypeOf(value) !== null)) {
    fail(`${code}_PLAIN_DATA_OBJECT_REQUIRED`);
  }
  const actual = ReflectOwnKeys(value);
  const expected = new ArrayConstructor(keys.length);
  for (let index = 0; index < keys.length; index += 1) expected[index] = keys[index];
  ArraySort(actual);
  ArraySort(expected);
  if (actual.length !== expected.length
    || !ArrayEvery(actual, (key, index) => typeof key === "string"
      && key === expected[index]
      && ObjectHasOwn(ObjectGetOwnPropertyDescriptor(value, key), "value"))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function denseArray(value, code, { nonempty = false, maximum = MAX_EVENTS } = {}) {
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
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC_INSTANT, value)) {
    fail(`${code}_INVALID`);
  }
  const millis = DateParse(value);
  if (!NumberIsFinite(millis) || DateToISOString(new DateConstructor(millis)) !== value) {
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

function normalizedProbeIds(value, code) {
  denseArray(value, code, { nonempty: true, maximum: MAX_BYPASS_PROBES });
  const normalized = new ArrayConstructor(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const probeId = value[index];
    if (typeof probeId !== "string" || !RegExpTest(PROBE_ID, probeId)) {
      fail(`${code}_ID_INVALID`);
    }
    normalized[index] = probeId;
  }
  ArraySort(normalized);
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] !== value[index]) fail(`${code}_SORTED_UNIQUE_REQUIRED`);
    if (index > 0 && normalized[index - 1] === normalized[index]) {
      fail(`${code}_SORTED_UNIQUE_REQUIRED`);
    }
  }
  return normalized;
}

function fixedDecision() {
  return {
    state: "HOLD",
    productionEligible: false,
    admitted: false,
    actionReady: false,
    executable: false,
    executionToken: null,
    liveActionConnected: false,
    actualResourceWrite: false,
    authorityEstablished: false,
    fixtureMechanicsVerified: false,
    fixtureMechanicsVerifiedIsProductionAuthority: false,
  };
}

function fixedCedarBoundary() {
  return {
    semanticsReference: "CEDAR_PARC_AUTHORIZATION_SEMANTICS_ONLY",
    officialDocumentation: "https://docs.cedarpolicy.com/auth/authorization.html",
    requestTuple: "PRINCIPAL_ACTION_RESOURCE_CONTEXT",
    defaultDenyRequired: true,
    forbidOverridesPermitRequired: true,
    policyEvaluationErrorDisposition: "HOLD_NOT_SKIP",
    incompletePolicyOrEntitySliceDisposition: "HOLD",
    cedarExecutedByThisModule: false,
    cedarCodeImportedByThisModule: false,
    allowCanEstablishOnlySnapshotEvaluation: true,
    allowEstablishesPrincipalStanding: false,
    allowEstablishesResourceOwnerStanding: false,
    allowEstablishesOwnerAdoption: false,
    allowEstablishesRevocationFreshness: false,
    allowEstablishesActualWritePath: false,
    allowAuthorityEffect: "NONE",
  };
}

function fixedProductionChecks() {
  return {
    externalPrincipalStandingVerified: false,
    externalResourceOwnerStandingVerified: false,
    providerSpecificAuthorityVerifierIntegrated: false,
    exactParcRequestSourceReplayed: false,
    policySnapshotComplete: false,
    entitySnapshotComplete: false,
    authorizationDiagnosticsClear: false,
    ownerAdoptionSourceReplayed: false,
    revocationFreshAtConsumption: false,
    ownerGateActualWritePathVerified: false,
    alternateWritePathsExcluded: false,
    crossProcessAtomicConsumptionVerified: false,
  };
}

function noAuthorityVerification(error) {
  const output = {
    ok: false,
    verificationLevel: "INVALID",
    decisionState: "HOLD",
    decision: fixedDecision(),
    productionEligible: false,
    fixtureMechanicsVerified: false,
    fixtureMechanicsVerifiedIsProductionAuthority: false,
    ownerAdoptionEstablished: false,
    alternateWritePathsExcluded: false,
    actualWritePathVerified: false,
    authorityEstablished: false,
    actionReady: false,
    executable: false,
    authority: OWNER_WRITE_GATE_NO_AUTHORITY,
  };
  if (error !== undefined) output.error = error;
  return deepFreeze(output);
}

function requireComposition(input) {
  const checked = verifyActionObligationHoldComposition(input);
  if (checked.referenceIntegrityVerified !== true
    || checked.structuralCompositionVerified !== false
    || checked.decisionState !== "HOLD"
    || checked.admitted !== false
    || checked.actionReady !== false
    || checked.executable !== false
    || checked.authorityEstablished !== false
    || checked.liveActionConnected !== false
    || checked.executionToken !== null
    || !same(checked.authority, ACTION_ADMISSION_NO_AUTHORITY)) {
    fail(`COMPOSITION_V1_REFERENCE_REPLAY_REQUIRED:${checked.error ?? "INVALID"}`);
  }
  return checked;
}

function minimumRadiusValidityEnd(compositionInput) {
  const source = compositionInput.admissionSource;
  const candidates = [
    source.capabilityRadius.validity.validUntil,
    source.effectRadius.validity.validUntil,
    source.referencedAuthority.radius.validity.validUntil,
    source.evidence.radius.validity.validUntil,
    source.responsibility.radius.validity.validUntil,
  ];
  let minimum = candidates[0];
  for (let index = 0; index < candidates.length; index += 1) {
    instant(candidates[index], "SOURCE_RADIUS_VALID_UNTIL");
    if (DateParse(candidates[index]) < DateParse(minimum)) minimum = candidates[index];
  }
  return minimum;
}

/**
 * Derive the current production frontier.  Integrity may verify; authority,
 * adoption, action readiness, and execution cannot.
 */
export function buildOwnerWriteGateConformanceHold(input = {}) {
  const source = safeClone(input, "BUILD_INPUT");
  exactObject(source, ["compositionInput", "createdAt", "expiresAt",
    "requiredBypassProbeIds"], "BUILD_INPUT");
  const compositionInput = safeClone(source.compositionInput, "COMPOSITION_INPUT");
  const composition = requireComposition(compositionInput);
  const createdAt = instant(source.createdAt, "CREATED_AT");
  const expiresAt = instant(source.expiresAt, "EXPIRES_AT");
  if (DateParse(createdAt) >= DateParse(expiresAt)) fail("INVALID_VALIDITY_WINDOW");
  const evaluatedAt = instant(
    compositionInput.admissionRequest.bindings.validity.evaluatedAt,
    "ADMISSION_EVALUATED_AT",
  );
  if (DateParse(createdAt) < DateParse(evaluatedAt)) {
    fail("CREATED_BEFORE_ADMISSION_EVALUATION");
  }
  if (DateParse(expiresAt) > DateParse(minimumRadiusValidityEnd(compositionInput))) {
    fail("EXPIRY_OUTSIDE_ADMISSION_RADIUS_VALIDITY");
  }
  const requiredBypassProbeIds = normalizedProbeIds(source.requiredBypassProbeIds,
    "REQUIRED_BYPASS_PROBES");
  const admission = compositionInput.admissionRequest;
  const body = {
    schema: OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.hold,
    schemaVersion: "1.0.0",
    createdAt,
    expiresAt,
    bindings: {
      claimWayWorld: safeClone(admission.bindings.claimWayWorld,
        "CLAIM_WAY_WORLD_BINDING"),
      run: safeClone(admission.bindings.run, "RUN_BINDING"),
      admissionRequestHash: admission.admissionRequestHash,
      responsibilityCommitmentHash: admission.responsibilityCommitmentHash,
      radiusBindings: safeClone(admission.radiusBindings, "RADIUS_BINDINGS"),
      beforeStateHash: admission.bindings.state.beforeStateHash,
      ownerGateSlotHash: admission.bindings.governance.ownerGateSlotHash,
      adoptionSlotHash: admission.bindings.governance.adoptionSlotHash,
      revocationStatusSlotHash:
        admission.bindings.governance.revocationStatusSlotHash,
      obligationGenesisHash: composition.obligation.genesisHash,
      obligationStateHash: composition.obligation.stateHash,
      obligationResponsibilityRefHash: composition.obligation.responsibilityRefHash,
    },
    composition: {
      schemaVersionBound: "ACTION_OBLIGATION_HOLD_COMPOSITION_V1",
      verificationLevel: composition.verificationLevel,
      referenceIntegrityVerified: true,
      structuralCompositionVerified: false,
      semanticCompositionEstablished: false,
      productionBlockers: safeClone(composition.productionBlockers,
        "COMPOSITION_PRODUCTION_BLOCKERS"),
    },
    cedarBoundary: fixedCedarBoundary(),
    requiredBypassProbeIds,
    productionChecks: fixedProductionChecks(),
    fixtureBoundary: {
      mechanicsAvailableForTests: true,
      mode: "SINGLE_PROCESS_IN_MEMORY_FIXTURE_ONLY",
      crossProcessAtomicityEstablished: false,
      requiredProbesAreCompleteAlternativePathCoverage: false,
      allProbePassesCanEstablishAlternatePathsExcluded: false,
      fixtureCapabilityScopeSourceReplayed: false,
      canAcceptActionCallback: false,
      canAcceptActionTargetLocator: false,
      canAcceptResourceMutationCommandOrCredential: false,
      canPerformNetworkAction: false,
      canPerformFilesystemResourceWrite: false,
      fixtureMechanicsVerifiedIsProductionAuthority: false,
    },
    decisionState: "HOLD",
    productionEligible: false,
    fixtureMechanicsVerified: false,
    fixtureMechanicsVerifiedIsProductionAuthority: false,
    ownerAdoptionEstablished: false,
    alternateWritePathsExcluded: false,
    actualWritePathVerified: false,
    authorityEstablished: false,
    actionReady: false,
    executable: false,
    decision: fixedDecision(),
    authority: OWNER_WRITE_GATE_NO_AUTHORITY,
  };
  return deepFreeze({ ...body,
    conformanceHash: digest(OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.hold, body) });
}

/** Full source replay; ok:true means only that the exact HOLD was rederived. */
export function verifyOwnerWriteGateConformanceHold(record, context = {}) {
  try {
    const checkedRecord = safeClone(record, "HOLD_RECORD");
    const checkedContext = safeClone(context, "VERIFY_CONTEXT");
    exactObject(checkedContext, ["source", "expectedConformanceHash"],
      "VERIFY_CONTEXT");
    const expected = hash(checkedContext.expectedConformanceHash,
      "EXPECTED_CONFORMANCE_HASH");
    const rebuilt = buildOwnerWriteGateConformanceHold(checkedContext.source);
    if (!same(checkedRecord, rebuilt)) fail("HOLD_SOURCE_REPLAY_MISMATCH");
    if (rebuilt.conformanceHash !== expected) fail("EXPECTED_CONFORMANCE_HASH_MISMATCH");
    return deepFreeze({
      ok: true,
      verificationLevel:
        "ACTION_ADMISSION_AND_OBLIGATION_V1_REFERENCE_REPLAYED_HOLD_ONLY",
      conformanceHash: rebuilt.conformanceHash,
      decisionState: "HOLD",
      decision: fixedDecision(),
      productionEligible: false,
      fixtureMechanicsVerified: false,
      fixtureMechanicsVerifiedIsProductionAuthority: false,
      ownerAdoptionEstablished: false,
      alternateWritePathsExcluded: false,
      actualWritePathVerified: false,
      authorityEstablished: false,
      actionReady: false,
      executable: false,
      authority: OWNER_WRITE_GATE_NO_AUTHORITY,
    });
  } catch (error) {
    return noAuthorityVerification(error instanceof ErrorConstructor
      ? error.message : StringConstructor(error));
  }
}

function fixtureDecision(mechanicsVerified) {
  return {
    state: "HOLD",
    productionEligible: false,
    admitted: false,
    actionReady: false,
    executable: false,
    executionToken: null,
    liveActionConnected: false,
    actualResourceWrite: false,
    authorityEstablished: false,
    fixtureMechanicsVerified: mechanicsVerified,
    fixtureMechanicsVerifiedIsProductionAuthority: false,
  };
}

function initialFixtureState(hold, input) {
  const body = {
    schema: OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureState,
    schemaVersion: "1.0.0",
    fixtureOnly: true,
    processBoundary: "SINGLE_PROCESS_IN_MEMORY_HARNESS_ONLY",
    decisionState: "HOLD",
    productionEligible: false,
    ownerAdoptionEstablished: false,
    alternateWritePathsExcluded: false,
    actualWritePathVerified: false,
    authorityEstablished: false,
    actionReady: false,
    executable: false,
    conformanceHash: hold.conformanceHash,
    candidate: {
      candidateIdHash: hash(input.candidateIdHash, "FIXTURE_CANDIDATE_ID_HASH"),
      capabilityScopeHash: hash(input.capabilityScopeHash,
        "FIXTURE_CAPABILITY_SCOPE_HASH"),
      beforeStateHash: hash(input.beforeStateHash, "FIXTURE_BEFORE_STATE_HASH"),
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      oneUse: true,
      beforeStateBound: true,
      presentationCount: 0,
      presentedAt: null,
      lastObservedBeforeStateHash: null,
      actualResourceWrite: false,
    },
    requiredBypassProbeIds: safeClone(hold.requiredBypassProbeIds,
      "FIXTURE_REQUIRED_BYPASS_PROBES"),
    revision: 0,
    updatedAt: input.createdAt,
    lifecycle: {
      status: "ACTIVE_HOLD",
      revokedAt: null,
      expiredAt: null,
      terminalReason: null,
    },
    audit: {
      status: "NOT_RUN_FAIL_CLOSED",
      occurredAt: null,
      results: [],
      auditCycleHash: null,
      alternateWritePathsExcluded: false,
      trustedAsAuthority: false,
    },
    events: [],
    mechanics: {
      singleProcessInMemorySerialization: true,
      crossProcessAtomicityEstablished: false,
      revisionAndStateHashCasRequired: true,
      oneUseBeforeStateBindingRequired: true,
      expiryAndRevocationFailClosed: true,
      capabilityScopeSourceReplayed: false,
      bypassProbePassCanEstablishAlternativePathCompleteness: false,
      actualWritePathVerified: false,
    },
    decision: fixtureDecision(false),
    authority: OWNER_WRITE_GATE_NO_AUTHORITY,
  };
  return sealFixtureState(body);
}

function sealFixtureState(body) {
  return deepFreeze({ ...body,
    stateHash: digest(OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureState, body) });
}

function fixtureStateBody(record) {
  const clone = safeClone(record, "FIXTURE_STATE");
  exactObject(clone, ["schema", "schemaVersion", "fixtureOnly", "processBoundary",
    "decisionState", "productionEligible", "conformanceHash", "candidate",
    "ownerAdoptionEstablished", "alternateWritePathsExcluded",
    "actualWritePathVerified", "authorityEstablished", "actionReady", "executable",
    "requiredBypassProbeIds", "revision", "updatedAt", "lifecycle", "audit",
    "events", "mechanics", "decision", "authority", "stateHash"],
  "FIXTURE_STATE");
  const { stateHash, ...body } = clone;
  return { clone, body, stateHash };
}

function validateFixtureState(record, hold) {
  const { clone, body, stateHash } = fixtureStateBody(record);
  if (clone.schema !== OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureState
    || clone.schemaVersion !== "1.0.0" || clone.fixtureOnly !== true
    || clone.processBoundary !== "SINGLE_PROCESS_IN_MEMORY_HARNESS_ONLY"
    || clone.decisionState !== "HOLD" || clone.productionEligible !== false
    || clone.ownerAdoptionEstablished !== false
    || clone.alternateWritePathsExcluded !== false
    || clone.actualWritePathVerified !== false
    || clone.authorityEstablished !== false || clone.actionReady !== false
    || clone.executable !== false
    || clone.conformanceHash !== hold.conformanceHash
    || stateHash !== digest(OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureState, body)
    || !same(clone.requiredBypassProbeIds, hold.requiredBypassProbeIds)
    || !same(clone.authority, OWNER_WRITE_GATE_NO_AUTHORITY)) {
    fail("FIXTURE_STATE_BOUNDARY_INVALID");
  }
  exactObject(clone.candidate, ["candidateIdHash", "capabilityScopeHash",
    "beforeStateHash", "createdAt", "expiresAt", "oneUse", "beforeStateBound",
    "presentationCount", "presentedAt", "lastObservedBeforeStateHash",
    "actualResourceWrite"], "FIXTURE_CANDIDATE");
  hash(clone.candidate.candidateIdHash, "FIXTURE_CANDIDATE_ID_HASH");
  hash(clone.candidate.capabilityScopeHash, "FIXTURE_CAPABILITY_SCOPE_HASH");
  hash(clone.candidate.beforeStateHash, "FIXTURE_BEFORE_STATE_HASH");
  instant(clone.candidate.createdAt, "FIXTURE_CREATED_AT");
  instant(clone.candidate.expiresAt, "FIXTURE_EXPIRES_AT");
  if (DateParse(clone.candidate.createdAt) >= DateParse(clone.candidate.expiresAt)
    || DateParse(clone.candidate.createdAt) < DateParse(hold.createdAt)
    || DateParse(clone.candidate.expiresAt) > DateParse(hold.expiresAt)
    || clone.candidate.beforeStateHash !== hold.bindings.beforeStateHash
    || clone.candidate.oneUse !== true || clone.candidate.beforeStateBound !== true
    || !ArrayIncludes([0, 1], clone.candidate.presentationCount)
    || clone.candidate.actualResourceWrite !== false) {
    fail("FIXTURE_CANDIDATE_BOUNDARY_INVALID");
  }
  if (clone.candidate.presentationCount === 0
    && (clone.candidate.presentedAt !== null
      || clone.candidate.lastObservedBeforeStateHash !== null)) {
    fail("FIXTURE_PRESENTATION_STATE_INVALID");
  }
  if (clone.candidate.presentationCount === 1
    && (instant(clone.candidate.presentedAt, "FIXTURE_PRESENTED_AT")
      !== clone.candidate.presentedAt
      || DateParse(clone.candidate.presentedAt) >= DateParse(clone.candidate.expiresAt)
      || clone.candidate.lastObservedBeforeStateHash !== clone.candidate.beforeStateHash)) {
    fail("FIXTURE_PRESENTATION_STATE_INVALID");
  }
  if (!NumberIsSafeInteger(clone.revision) || clone.revision < 0
    || instant(clone.updatedAt, "FIXTURE_UPDATED_AT") !== clone.updatedAt
    || DateParse(clone.updatedAt) < DateParse(clone.candidate.createdAt)) {
    fail("FIXTURE_REVISION_OR_TIME_INVALID");
  }
  exactObject(clone.lifecycle, ["status", "revokedAt", "expiredAt", "terminalReason"],
    "FIXTURE_LIFECYCLE");
  if (!ArrayIncludes(["ACTIVE_HOLD", "PRESENTED_ONCE_HOLD", "REVOKED_HOLD",
    "EXPIRED_HOLD"], clone.lifecycle.status)) fail("FIXTURE_LIFECYCLE_INVALID");
  if (clone.lifecycle.status === "ACTIVE_HOLD"
    && (clone.lifecycle.revokedAt !== null || clone.lifecycle.expiredAt !== null
      || clone.lifecycle.terminalReason !== null || clone.candidate.presentationCount !== 0)) {
    fail("FIXTURE_ACTIVE_STATE_INVALID");
  }
  if (clone.lifecycle.status === "PRESENTED_ONCE_HOLD"
    && (clone.lifecycle.revokedAt !== null || clone.lifecycle.expiredAt !== null
      || clone.lifecycle.terminalReason !== "FIXTURE_PRESENTED_ONCE_NO_WRITE"
      || clone.candidate.presentationCount !== 1)) fail("FIXTURE_PRESENTED_STATE_INVALID");
  if (clone.lifecycle.status === "REVOKED_HOLD"
    && (instant(clone.lifecycle.revokedAt, "FIXTURE_REVOKED_AT")
      !== clone.lifecycle.revokedAt || clone.lifecycle.expiredAt !== null
      || typeof clone.lifecycle.terminalReason !== "string"
      || clone.candidate.presentationCount !== 0)) fail("FIXTURE_REVOKED_STATE_INVALID");
  if (clone.lifecycle.status === "EXPIRED_HOLD"
    && (instant(clone.lifecycle.expiredAt, "FIXTURE_EXPIRED_AT")
      !== clone.lifecycle.expiredAt || clone.lifecycle.revokedAt !== null
      || DateParse(clone.lifecycle.expiredAt) < DateParse(clone.candidate.expiresAt)
      || clone.lifecycle.terminalReason !== "FIXTURE_EXPIRY_REACHED"
      || clone.candidate.presentationCount !== 0)) fail("FIXTURE_EXPIRED_STATE_INVALID");
  exactObject(clone.audit, ["status", "occurredAt", "results", "auditCycleHash",
    "alternateWritePathsExcluded", "trustedAsAuthority"], "FIXTURE_AUDIT");
  if (!ArrayIncludes(["NOT_RUN_FAIL_CLOSED", "PASSED_LOCAL_DIAGNOSTIC_ONLY",
    "FAILED_TERMINAL_REVOKE"], clone.audit.status)
    || clone.audit.alternateWritePathsExcluded !== false
    || clone.audit.trustedAsAuthority !== false) fail("FIXTURE_AUDIT_BOUNDARY_INVALID");
  denseArray(clone.audit.results, "FIXTURE_AUDIT_RESULTS",
    { maximum: MAX_BYPASS_PROBES });
  if (clone.audit.status === "NOT_RUN_FAIL_CLOSED"
    && (clone.audit.occurredAt !== null || clone.audit.auditCycleHash !== null
      || clone.audit.results.length !== 0)) fail("FIXTURE_EMPTY_AUDIT_INVALID");
  if (clone.audit.status !== "NOT_RUN_FAIL_CLOSED") {
    instant(clone.audit.occurredAt, "FIXTURE_AUDIT_OCCURRED_AT");
    if (DateParse(clone.audit.occurredAt) <= DateParse(clone.candidate.createdAt)
      || DateParse(clone.audit.occurredAt) >= DateParse(clone.candidate.expiresAt)) {
      fail("FIXTURE_AUDIT_TIME_OUTSIDE_CANDIDATE_WINDOW");
    }
    hash(clone.audit.auditCycleHash, "FIXTURE_AUDIT_CYCLE_HASH");
    if (clone.audit.results.length !== clone.requiredBypassProbeIds.length) {
      fail("FIXTURE_AUDIT_EXACT_PROBE_COVERAGE_REQUIRED");
    }
    for (let index = 0; index < clone.audit.results.length; index += 1) {
      const result = clone.audit.results[index];
      exactObject(result, ["probeId", "outcome", "evidenceHash", "errorHash"],
        "FIXTURE_AUDIT_RESULT");
      if (result.probeId !== clone.requiredBypassProbeIds[index]
        || !(ArrayIncludes(FIXTURE_AUDIT_OUTCOMES, result.outcome)
          || result.outcome === "MISSING")
        || !(result.evidenceHash === null || RegExpTest(HASH, result.evidenceHash))
        || !(result.errorHash === null || RegExpTest(HASH, result.errorHash))) {
        fail("FIXTURE_AUDIT_RESULT_INVALID");
      }
    }
    const allPass = ArrayEvery(clone.audit.results, (result) =>
      result.outcome === "PASS_NO_BYPASS_OBSERVED" && result.evidenceHash !== null
        && result.errorHash === null);
    if ((allPass && clone.audit.status !== "PASSED_LOCAL_DIAGNOSTIC_ONLY")
      || (!allPass && clone.audit.status !== "FAILED_TERMINAL_REVOKE")) {
      fail("FIXTURE_AUDIT_STATUS_INVALID");
    }
    const auditBody = {
      schema: OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureAuditCycle,
      occurredAt: clone.audit.occurredAt,
      requiredBypassProbeIds: clone.requiredBypassProbeIds,
      results: clone.audit.results,
      status: clone.audit.status,
      alternateWritePathsExcluded: false,
      trustedAsAuthority: false,
    };
    if (clone.audit.auditCycleHash !== digest(
      OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureAuditCycle, auditBody)) {
      fail("FIXTURE_AUDIT_HASH_INVALID");
    }
  }
  denseArray(clone.events, "FIXTURE_EVENTS", { maximum: MAX_EVENTS });
  if (clone.events.length !== clone.revision) fail("FIXTURE_EVENT_COUNT_INVALID");
  let previousEventHash = null;
  let previousOccurredAt = clone.candidate.createdAt;
  const commandIds = ObjectCreate(null);
  for (let index = 0; index < clone.events.length; index += 1) {
    const event = clone.events[index];
    exactObject(event, ["schema", "revision", "commandIdHash", "commandHash", "kind",
      "occurredAt", "previousStateHash", "previousEventHash", "outcome", "eventHash"],
    "FIXTURE_EVENT");
    if (event.schema !== OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureEvent
      || event.revision !== index + 1 || !RegExpTest(HASH, event.commandIdHash)
      || !RegExpTest(HASH, event.commandHash)
      || !ArrayIncludes(FIXTURE_COMMAND_KINDS, event.kind)
      || instant(event.occurredAt, "FIXTURE_EVENT_OCCURRED_AT") !== event.occurredAt
      || DateParse(event.occurredAt) <= DateParse(previousOccurredAt)
      || !RegExpTest(HASH, event.previousStateHash)
      || event.previousEventHash !== previousEventHash
      || typeof event.outcome !== "string" || commandIds[event.commandIdHash] === true) {
      fail("FIXTURE_EVENT_INVALID");
    }
    if ((event.kind === "PRESENT_ONCE"
        && event.outcome !== "FIXTURE_PRESENTED_ONCE_HOLD_NO_RESOURCE_WRITE")
      || (event.kind === "REVOKE" && event.outcome !== "FIXTURE_HOLD_REVOKED")
      || (event.kind === "SWEEP_EXPIRY"
        && event.outcome !== "FIXTURE_HOLD_EXPIRED")) {
      fail("FIXTURE_EVENT_OUTCOME_INVALID");
    }
    const { eventHash, ...eventBody } = event;
    if (eventHash !== digest(OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureEvent,
      eventBody)) fail("FIXTURE_EVENT_HASH_INVALID");
    commandIds[event.commandIdHash] = true;
    previousEventHash = event.eventHash;
    previousOccurredAt = event.occurredAt;
  }
  if (clone.events.length > 0
    && clone.updatedAt !== clone.events[clone.events.length - 1].occurredAt) {
    fail("FIXTURE_EVENT_HEAD_TIME_INVALID");
  }
  if (clone.events.length > 0) {
    const initial = initialFixtureState(hold, {
      candidateIdHash: clone.candidate.candidateIdHash,
      capabilityScopeHash: clone.candidate.capabilityScopeHash,
      beforeStateHash: clone.candidate.beforeStateHash,
      createdAt: clone.candidate.createdAt,
      expiresAt: clone.candidate.expiresAt,
    });
    if (clone.events[0].previousStateHash !== initial.stateHash) {
      fail("FIXTURE_EVENT_CHAIN_NOT_INITIAL_STATE_BOUND");
    }
  }
  const eventKinds = new ArrayConstructor(clone.events.length);
  for (let index = 0; index < clone.events.length; index += 1) {
    eventKinds[index] = clone.events[index].kind;
  }
  const sequence = ArrayJoin(eventKinds, ",");
  const auditEvent = clone.events[0]?.kind === "AUDIT_BYPASS_PATHS"
    ? clone.events[0] : null;
  if (clone.audit.status === "NOT_RUN_FAIL_CLOSED" && auditEvent !== null) {
    fail("FIXTURE_EVENT_AUDIT_STATE_MISMATCH");
  }
  if (clone.audit.status !== "NOT_RUN_FAIL_CLOSED"
    && (auditEvent === null || auditEvent.occurredAt !== clone.audit.occurredAt)) {
    fail("FIXTURE_EVENT_AUDIT_STATE_MISMATCH");
  }
  if (clone.audit.status === "PASSED_LOCAL_DIAGNOSTIC_ONLY"
    && auditEvent.outcome
      !== "FIXTURE_HOLD_LOCAL_DIAGNOSTIC_PASS_NO_PATH_OR_AUTHORITY_PROOF") {
    fail("FIXTURE_EVENT_AUDIT_OUTCOME_MISMATCH");
  }
  if (clone.audit.status === "FAILED_TERMINAL_REVOKE"
    && auditEvent.outcome !== "FIXTURE_HOLD_AUDIT_FAILED_TERMINAL_REVOKE") {
    fail("FIXTURE_EVENT_AUDIT_OUTCOME_MISMATCH");
  }
  if (clone.lifecycle.status === "ACTIVE_HOLD"
    && !((clone.audit.status === "NOT_RUN_FAIL_CLOSED" && sequence === "")
      || (clone.audit.status === "PASSED_LOCAL_DIAGNOSTIC_ONLY"
        && sequence === "AUDIT_BYPASS_PATHS"))) {
    fail("FIXTURE_ACTIVE_EVENT_SEQUENCE_INVALID");
  }
  if (clone.lifecycle.status === "PRESENTED_ONCE_HOLD"
    && (clone.audit.status !== "PASSED_LOCAL_DIAGNOSTIC_ONLY"
      || sequence !== "AUDIT_BYPASS_PATHS,PRESENT_ONCE"
      || clone.events[1].outcome !== "FIXTURE_PRESENTED_ONCE_HOLD_NO_RESOURCE_WRITE")) {
    fail("FIXTURE_PRESENT_EVENT_SEQUENCE_INVALID");
  }
  if (clone.lifecycle.status === "REVOKED_HOLD") {
    const failedAudit = clone.audit.status === "FAILED_TERMINAL_REVOKE"
      && sequence === "AUDIT_BYPASS_PATHS"
      && clone.events[0].outcome === "FIXTURE_HOLD_AUDIT_FAILED_TERMINAL_REVOKE";
    const directRevoke = clone.audit.status === "NOT_RUN_FAIL_CLOSED"
      && sequence === "REVOKE";
    const postAuditRevoke = clone.audit.status === "PASSED_LOCAL_DIAGNOSTIC_ONLY"
      && sequence === "AUDIT_BYPASS_PATHS,REVOKE";
    if (!failedAudit && !directRevoke && !postAuditRevoke) {
      fail("FIXTURE_REVOKED_EVENT_SEQUENCE_INVALID");
    }
    if (failedAudit
      && clone.lifecycle.terminalReason !== "BYPASS_AUDIT_FAILED_OR_INCOMPLETE") {
      fail("FIXTURE_REVOKED_REASON_INVALID");
    }
    if ((directRevoke || postAuditRevoke)
      && clone.lifecycle.terminalReason !== "EXPLICIT_FIXTURE_REVOCATION") {
      fail("FIXTURE_REVOKED_REASON_INVALID");
    }
  }
  if (clone.lifecycle.status === "EXPIRED_HOLD") {
    const directExpiry = clone.audit.status === "NOT_RUN_FAIL_CLOSED"
      && sequence === "SWEEP_EXPIRY";
    const postAuditExpiry = clone.audit.status === "PASSED_LOCAL_DIAGNOSTIC_ONLY"
      && sequence === "AUDIT_BYPASS_PATHS,SWEEP_EXPIRY";
    if (!directExpiry && !postAuditExpiry) fail("FIXTURE_EXPIRED_EVENT_SEQUENCE_INVALID");
  }
  exactObject(clone.mechanics, ["singleProcessInMemorySerialization",
    "crossProcessAtomicityEstablished", "revisionAndStateHashCasRequired",
    "oneUseBeforeStateBindingRequired", "expiryAndRevocationFailClosed",
    "capabilityScopeSourceReplayed",
    "bypassProbePassCanEstablishAlternativePathCompleteness",
    "actualWritePathVerified"], "FIXTURE_MECHANICS");
  if (clone.mechanics.singleProcessInMemorySerialization !== true
    || clone.mechanics.crossProcessAtomicityEstablished !== false
    || clone.mechanics.revisionAndStateHashCasRequired !== true
    || clone.mechanics.oneUseBeforeStateBindingRequired !== true
    || clone.mechanics.expiryAndRevocationFailClosed !== true
    || clone.mechanics.capabilityScopeSourceReplayed !== false
    || clone.mechanics.bypassProbePassCanEstablishAlternativePathCompleteness !== false
    || clone.mechanics.actualWritePathVerified !== false
    || !same(clone.decision, fixtureDecision(clone.lifecycle.status
      === "PRESENTED_ONCE_HOLD"))
    || clone.decision.fixtureMechanicsVerifiedIsProductionAuthority !== false) {
    fail("FIXTURE_MECHANICS_OR_DECISION_INVALID");
  }
  return deepFreeze(clone);
}

function commandSpec(command) {
  const cloned = safeClone(command, "FIXTURE_COMMAND");
  exactObject(cloned, ["kind", "commandIdHash", "occurredAt", "expectedRevision",
    "expectedStateHash", "payload"], "FIXTURE_COMMAND");
  if (!ArrayIncludes(FIXTURE_COMMAND_KINDS, cloned.kind)) fail("FIXTURE_COMMAND_KIND_INVALID");
  hash(cloned.commandIdHash, "FIXTURE_COMMAND_ID_HASH");
  instant(cloned.occurredAt, "FIXTURE_COMMAND_OCCURRED_AT");
  if (!NumberIsSafeInteger(cloned.expectedRevision) || cloned.expectedRevision < 0) {
    fail("FIXTURE_COMMAND_EXPECTED_REVISION_INVALID");
  }
  hash(cloned.expectedStateHash, "FIXTURE_COMMAND_EXPECTED_STATE_HASH");
  safeClone(cloned.payload, "FIXTURE_COMMAND_PAYLOAD");
  return cloned;
}

function normalizeAuditResults(payload, requiredProbeIds) {
  exactObject(payload, ["results"], "FIXTURE_AUDIT_PAYLOAD");
  denseArray(payload.results, "FIXTURE_AUDIT_INPUT_RESULTS",
    { maximum: MAX_BYPASS_PROBES });
  const byId = ObjectCreate(null);
  let prior = null;
  for (let index = 0; index < payload.results.length; index += 1) {
    const result = payload.results[index];
    exactObject(result, ["probeId", "outcome", "evidenceHash", "errorHash"],
      "FIXTURE_AUDIT_INPUT_RESULT");
    if (!ArrayIncludes(requiredProbeIds, result.probeId)
      || prior !== null && result.probeId <= prior
      || !ArrayIncludes(FIXTURE_AUDIT_OUTCOMES, result.outcome)
      || !(result.evidenceHash === null || RegExpTest(HASH, result.evidenceHash))
      || !(result.errorHash === null || RegExpTest(HASH, result.errorHash))) {
      fail("FIXTURE_AUDIT_INPUT_RESULT_INVALID");
    }
    if (result.outcome === "PASS_NO_BYPASS_OBSERVED"
      && (result.evidenceHash === null || result.errorHash !== null)) {
      fail("FIXTURE_AUDIT_PASS_EVIDENCE_REQUIRED");
    }
    if (result.outcome === "BYPASS_OBSERVED"
      && (result.evidenceHash === null || result.errorHash !== null)) {
      fail("FIXTURE_AUDIT_BYPASS_EVIDENCE_REQUIRED");
    }
    if (result.outcome === "ERROR"
      && (result.evidenceHash !== null || result.errorHash === null)) {
      fail("FIXTURE_AUDIT_ERROR_HASH_REQUIRED");
    }
    byId[result.probeId] = result;
    prior = result.probeId;
  }
  const normalized = new ArrayConstructor(requiredProbeIds.length);
  for (let index = 0; index < requiredProbeIds.length; index += 1) {
    const probeId = requiredProbeIds[index];
    normalized[index] = byId[probeId] ?? {
      probeId, outcome: "MISSING", evidenceHash: null, errorHash: null,
    };
  }
  return normalized;
}

function appendFixtureEvent(state, previousStateHash, command, commandHash, outcome) {
  const eventBody = {
    schema: OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureEvent,
    revision: state.revision + 1,
    commandIdHash: command.commandIdHash,
    commandHash,
    kind: command.kind,
    occurredAt: command.occurredAt,
    previousStateHash,
    previousEventHash: state.events.length === 0
      ? null : state.events[state.events.length - 1].eventHash,
    outcome,
  };
  ArrayPush(state.events, { ...eventBody,
    eventHash: digest(OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureEvent, eventBody) });
  state.revision += 1;
  state.updatedAt = command.occurredAt;
}

function transitionFixtureState(current, hold, untrustedCommand) {
  const verified = validateFixtureState(current, hold);
  const command = commandSpec(untrustedCommand);
  const commandHash = digest(OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureCommand,
    command);
  for (let index = 0; index < verified.events.length; index += 1) {
    const event = verified.events[index];
    if (event.commandIdHash !== command.commandIdHash) continue;
    if (event.commandHash !== commandHash) fail("FIXTURE_IDEMPOTENCY_KEY_COLLISION");
    return { state: verified, idempotentReplay: true, outcome: event.outcome };
  }
  if (command.expectedRevision !== verified.revision
    || command.expectedStateHash !== verified.stateHash) fail("FIXTURE_CAS_MISMATCH");
  if (DateParse(command.occurredAt) <= DateParse(verified.updatedAt)) {
    fail("FIXTURE_COMMAND_TIME_NOT_STRICTLY_MONOTONIC");
  }
  const { stateHash: ignoredStateHash, ...stateBody } = safeClone(verified,
    "FIXTURE_TRANSITION_STATE");
  void ignoredStateHash;
  let outcome;

  if (command.kind === "AUDIT_BYPASS_PATHS") {
    if (stateBody.lifecycle.status !== "ACTIVE_HOLD"
      || stateBody.audit.status !== "NOT_RUN_FAIL_CLOSED") {
      fail("FIXTURE_AUDIT_NOT_AVAILABLE");
    }
    if (DateParse(command.occurredAt) >= DateParse(stateBody.candidate.expiresAt)) {
      fail("FIXTURE_AUDIT_AT_OR_AFTER_EXPIRY");
    }
    const results = normalizeAuditResults(command.payload,
      stateBody.requiredBypassProbeIds);
    const allPass = ArrayEvery(results, (result) =>
      result.outcome === "PASS_NO_BYPASS_OBSERVED" && result.evidenceHash !== null
        && result.errorHash === null);
    const status = allPass
      ? "PASSED_LOCAL_DIAGNOSTIC_ONLY" : "FAILED_TERMINAL_REVOKE";
    const auditBody = {
      schema: OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureAuditCycle,
      occurredAt: command.occurredAt,
      requiredBypassProbeIds: stateBody.requiredBypassProbeIds,
      results,
      status,
      alternateWritePathsExcluded: false,
      trustedAsAuthority: false,
    };
    stateBody.audit = { status, occurredAt: command.occurredAt, results,
      auditCycleHash: digest(OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureAuditCycle,
        auditBody), alternateWritePathsExcluded: false, trustedAsAuthority: false };
    if (!allPass) {
      stateBody.lifecycle = { status: "REVOKED_HOLD",
        revokedAt: command.occurredAt, expiredAt: null,
        terminalReason: "BYPASS_AUDIT_FAILED_OR_INCOMPLETE" };
      outcome = "FIXTURE_HOLD_AUDIT_FAILED_TERMINAL_REVOKE";
    } else outcome = "FIXTURE_HOLD_LOCAL_DIAGNOSTIC_PASS_NO_PATH_OR_AUTHORITY_PROOF";
  } else if (command.kind === "PRESENT_ONCE") {
    exactObject(command.payload, ["observedBeforeStateHash"],
      "FIXTURE_PRESENT_PAYLOAD");
    if (stateBody.lifecycle.status !== "ACTIVE_HOLD"
      || stateBody.candidate.presentationCount !== 0) fail("FIXTURE_ONE_USE_UNAVAILABLE");
    if (stateBody.audit.status !== "PASSED_LOCAL_DIAGNOSTIC_ONLY"
      || stateBody.audit.results.length !== stateBody.requiredBypassProbeIds.length
      || !ArrayEvery(stateBody.audit.results, (result) =>
        result.outcome === "PASS_NO_BYPASS_OBSERVED" && result.evidenceHash !== null
          && result.errorHash === null)) fail("FIXTURE_EXACT_BYPASS_PROBE_PASS_REQUIRED");
    if (DateParse(command.occurredAt) >= DateParse(stateBody.candidate.expiresAt)) {
      fail("FIXTURE_PRESENT_AT_OR_AFTER_EXPIRY");
    }
    if (hash(command.payload.observedBeforeStateHash,
      "FIXTURE_OBSERVED_BEFORE_STATE_HASH") !== stateBody.candidate.beforeStateHash) {
      fail("FIXTURE_BEFORE_STATE_MISMATCH");
    }
    stateBody.candidate.presentationCount = 1;
    stateBody.candidate.presentedAt = command.occurredAt;
    stateBody.candidate.lastObservedBeforeStateHash
      = command.payload.observedBeforeStateHash;
    stateBody.lifecycle = { status: "PRESENTED_ONCE_HOLD", revokedAt: null,
      expiredAt: null, terminalReason: "FIXTURE_PRESENTED_ONCE_NO_WRITE" };
    outcome = "FIXTURE_PRESENTED_ONCE_HOLD_NO_RESOURCE_WRITE";
  } else if (command.kind === "REVOKE") {
    exactObject(command.payload, ["reasonHash"], "FIXTURE_REVOKE_PAYLOAD");
    hash(command.payload.reasonHash, "FIXTURE_REVOCATION_REASON_HASH");
    if (stateBody.lifecycle.status !== "ACTIVE_HOLD") {
      fail("FIXTURE_ALREADY_TERMINAL");
    }
    if (DateParse(command.occurredAt) >= DateParse(stateBody.candidate.expiresAt)) {
      fail("FIXTURE_REVOCATION_AT_OR_AFTER_EXPIRY_USE_SWEEP");
    }
    stateBody.lifecycle = { status: "REVOKED_HOLD", revokedAt: command.occurredAt,
      expiredAt: null, terminalReason: "EXPLICIT_FIXTURE_REVOCATION" };
    outcome = "FIXTURE_HOLD_REVOKED";
  } else if (command.kind === "SWEEP_EXPIRY") {
    exactObject(command.payload, [], "FIXTURE_SWEEP_PAYLOAD");
    if (stateBody.lifecycle.status !== "ACTIVE_HOLD") fail("FIXTURE_ALREADY_TERMINAL");
    if (DateParse(command.occurredAt) < DateParse(stateBody.candidate.expiresAt)) {
      fail("FIXTURE_EXPIRY_NOT_REACHED");
    }
    stateBody.lifecycle = { status: "EXPIRED_HOLD", revokedAt: null,
      expiredAt: command.occurredAt, terminalReason: "FIXTURE_EXPIRY_REACHED" };
    outcome = "FIXTURE_HOLD_EXPIRED";
  }
  appendFixtureEvent(stateBody, verified.stateHash, command, commandHash, outcome);
  stateBody.decision = fixtureDecision(
    stateBody.lifecycle.status === "PRESENTED_ONCE_HOLD");
  const next = sealFixtureState(stateBody);
  validateFixtureState(next, hold);
  return { state: next, idempotentReplay: false, outcome };
}

function requireVerifiedHold(hold, holdSource, expectedConformanceHash) {
  const checked = verifyOwnerWriteGateConformanceHold(hold, {
    source: holdSource,
    expectedConformanceHash,
  });
  if (!checked.ok || checked.productionEligible !== false
    || checked.authorityEstablished !== false || checked.actionReady !== false
    || checked.executable !== false) fail("VERIFIED_HOLD_REQUIRED");
  return safeClone(hold, "VERIFIED_HOLD");
}

/**
 * Test-only harness.  Its queue serializes only this object in this process;
 * it establishes no filesystem/database/distributed atomicity.
 */
export class OwnerWriteGateFixtureHarnessForTests {
  #hold;
  #state;
  #tail;

  constructor(construct, hold, state) {
    if (construct !== CONSTRUCT_FIXTURE) fail("FIXTURE_USE_STATIC_CREATE");
    this.#hold = deepFreeze(safeClone(hold, "FIXTURE_HOLD"));
    this.#state = validateFixtureState(state, this.#hold);
    this.#tail = PromiseResolve();
  }

  static create(input = {}) {
    const source = safeClone(input, "FIXTURE_CREATE_INPUT");
    exactObject(source, ["hold", "holdSource", "expectedConformanceHash",
      "candidateIdHash", "capabilityScopeHash", "beforeStateHash", "createdAt",
      "expiresAt"], "FIXTURE_CREATE_INPUT");
    const hold = requireVerifiedHold(source.hold, source.holdSource,
      source.expectedConformanceHash);
    const createdAt = instant(source.createdAt, "FIXTURE_CREATED_AT");
    const expiresAt = instant(source.expiresAt, "FIXTURE_EXPIRES_AT");
    if (DateParse(createdAt) < DateParse(hold.createdAt)
      || DateParse(createdAt) >= DateParse(expiresAt)
      || DateParse(expiresAt) > DateParse(hold.expiresAt)) {
      fail("FIXTURE_VALIDITY_OUTSIDE_HOLD_WINDOW");
    }
    if (hash(source.beforeStateHash, "FIXTURE_BEFORE_STATE_HASH")
      !== hold.bindings.beforeStateHash) fail("FIXTURE_BEFORE_STATE_NOT_HOLD_BOUND");
    const state = initialFixtureState(hold, { ...source, createdAt, expiresAt });
    return new OwnerWriteGateFixtureHarnessForTests(CONSTRUCT_FIXTURE, hold, state);
  }

  snapshot() {
    return deepFreeze(safeClone(this.#state, "FIXTURE_SNAPSHOT"));
  }

  transition(command) {
    const copiedCommand = safeClone(command, "FIXTURE_TRANSITION_COMMAND");
    const work = PromiseThen(this.#tail, () => {
      const result = transitionFixtureState(this.#state, this.#hold, copiedCommand);
      this.#state = result.state;
      return deepFreeze({
        ...result,
        decisionState: "HOLD",
        decision: fixtureDecision(
          result.state.lifecycle.status === "PRESENTED_ONCE_HOLD"),
        productionEligible: false,
        fixtureMechanicsVerifiedIsProductionAuthority: false,
        ownerAdoptionEstablished: false,
        alternateWritePathsExcluded: false,
        actualWritePathVerified: false,
        authorityEstablished: false,
        actionReady: false,
        executable: false,
        authority: OWNER_WRITE_GATE_NO_AUTHORITY,
      });
    });
    this.#tail = PromiseThen(work, () => undefined, () => undefined);
    return work;
  }
}

export function verifyOwnerWriteGateFixtureSnapshotForTests(record, context = {}) {
  try {
    const checkedContext = safeClone(context, "FIXTURE_VERIFY_CONTEXT");
    exactObject(checkedContext, ["hold", "holdSource", "expectedConformanceHash",
      "expectedStateHash"], "FIXTURE_VERIFY_CONTEXT");
    const hold = requireVerifiedHold(checkedContext.hold, checkedContext.holdSource,
      checkedContext.expectedConformanceHash);
    const state = validateFixtureState(record, hold);
    if (state.stateHash !== hash(checkedContext.expectedStateHash,
      "EXPECTED_FIXTURE_STATE_HASH")) fail("EXPECTED_FIXTURE_STATE_HASH_MISMATCH");
    const mechanicsVerified = state.lifecycle.status === "PRESENTED_ONCE_HOLD";
    return deepFreeze({
      ok: true,
      verificationLevel: "SINGLE_PROCESS_IN_MEMORY_FIXTURE_STATE_CHAIN_ONLY",
      stateHash: state.stateHash,
      revision: state.revision,
      lifecycleStatus: state.lifecycle.status,
      fixtureMechanicsVerified: mechanicsVerified,
      decisionState: "HOLD",
      decision: fixtureDecision(mechanicsVerified),
      productionEligible: false,
      fixtureMechanicsVerifiedIsProductionAuthority: false,
      crossProcessAtomicityEstablished: false,
      capabilityScopeSourceReplayed: false,
      ownerAdoptionEstablished: false,
      alternateWritePathsExcluded: false,
      actualWritePathVerified: false,
      authorityEstablished: false,
      actionReady: false,
      executable: false,
      authority: OWNER_WRITE_GATE_NO_AUTHORITY,
    });
  } catch (error) {
    return noAuthorityVerification(error instanceof ErrorConstructor
      ? error.message : StringConstructor(error));
  }
}
