/*
 * Outcome Product foundation composition v1.
 *
 * This is the deliberately thin seam between a private natural-language goal
 * and Outcome Product Runtime v2. An injected model may propose a closed,
 * provider-neutral plan. Existing deterministic Outcome Tender and
 * OutcomeProgram compilers then normalize, hash, freeze and verify it. The
 * result is a three-role formation request that a production composition can
 * route through account-local/API/MCP/web transaction nodes.
 *
 * Neither generative inference nor optional retrospective/logistic ordering
 * establishes identity, authority, contact permission, capacity, price,
 * outcome truth, or permission to act. Historical models may only change the
 * order in which already-discovered candidates are probed in shadow mode.
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { createOutsiderOutcomeProductRuntimeV2 }
  from "./outsider-outcome-product-runtime-v2.js";
import { compileOutcomeProgramV1, verifyOutcomeProgramV1 }
  from "./outsider-outcome-program-v1.js";
import {
  compileOutsiderOutcomeTenderV1,
  verifyOutsiderOutcomeTenderV1,
} from "./outsider-outcome-tender-v1.js";

const PREFIX = "OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const AMOUNT = /^(?:0|[1-9]\d{0,30})$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const ROUTE_KINDS = Object.freeze([
  "USER_HELD_ACCOUNT",
  "OFFICIAL_API",
  "APPROVED_MCP",
  "MARKETPLACE_BUYER_ENTRY",
  "PROVIDER_OWNED_PUBLIC_ENTRY",
  "STANDING_CAPACITY_GRANT",
]);
const ROUTE_KIND_SET = new Set(ROUTE_KINDS);
const COMPARATORS = new Set([
  "EQUAL", "GREATER_THAN_OR_EQUAL", "LESS_THAN_OR_EQUAL",
]);
const TARGET_KINDS = new Set(["BOOLEAN", "INTEGER", "STATE_CODE"]);
const OBSERVATION_MODES = new Set(["AT_COMPLETION", "LONGITUDINAL"]);
const FORBIDDEN_INFERENCE_KEY
  = /(?:authority|authorization|credential|secret|token|cookie|payment|provider(?:id|name|url|origin|endpoint)|seller(?:id|name|url|origin|endpoint)|vendor(?:id|name|url|origin|endpoint))/iu;
const FORBIDDEN_INFERENCE_TEXT = /(?:https?:\/\/|mailto:|[^\s@]+@[^\s@]+\.[^\s@]+)/iu;

export const OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
  = Object.freeze({
    modelRequest: "outsider/private-outcome-formation-model-request/v1",
    modelDraft: "outsider/private-outcome-formation-model-draft/v1",
    frozenOutcome: "outsider/private-frozen-outcome/v1",
    formationRequirements:
      "outsider/outcome-product-formation-requirements/v1",
    candidateRoutingRequest:
      "outsider/private-order-scoped-candidate-routing-request/v1",
    compilation: "outsider/private-outcome-product-foundation-compilation/v1",
    shadowOrdering: "outsider/private-candidate-shadow-ordering/v1",
  });

export const OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_BOUNDARY
  = Object.freeze({
    position: "PRIVATE_GOAL_TO_VERIFIED_OUTCOME_TENDER_PROGRAM_COMPOSITION",
    providerOrVerticalHardcoded: false,
    modelInferenceInjected: true,
    modelOutputClosedShapeVerified: true,
    existingOutcomeTenderCompilerReused: true,
    existingOutcomeProgramCompilerReused: true,
    identityDelegationAndRightsReferencesResolvedOutsideModel: true,
    structuralReferencePresenceEstablishesAuthority: false,
    modelOutputEstablishesAuthority: false,
    modelOutputEstablishesCapacity: false,
    modelOutputEstablishesOutcomeTruth: false,
    modelOutputPermitsPaymentOrAction: false,
    retrospectiveAndLogisticModelsPermittedUse:
      "OPTIONAL_SHADOW_DISCOVERY_PROBE_ORDER_ONLY",
    shadowOrderingCanAdmitCandidate: false,
    shadowOrderingCanRejectCandidate: false,
    shadowOrderingCanEstablishAuthorityOrCapacity: false,
    shadowOrderingCanAuthorizeAction: false,
    baselineOnInvalidShadowOutput: "KEEP_BASELINE",
    providerRegistryRequired: false,
    outsiderStaffTouchLimit: 0,
    humanQueuePermitted: false,
  });

export const OUTSIDER_OUTCOME_PRODUCT_MODEL_DRAFT_CONTRACT_V1
  = Object.freeze({
    schema: OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
      .modelDraft,
    requiredTopLevelFields: Object.freeze([
      "schema", "outcomeKindCode", "conditions", "acceptance", "routes",
    ]),
    exactlyThreeRoutes: Object.freeze([
      "primary", "recovery", "independentWitness",
    ]),
    providerIdentityUrlContactAuthorityAndPaymentFieldsForbidden: true,
    arbitraryOutcomeDomainAllowed: true,
    routeKinds: ROUTE_KINDS,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function clone(value, codeName) {
  try { return JSON.parse(canonicalizeStrict(value)); } catch {
    fail(`${codeName}_NOT_CANONICAL_JSON`);
  }
}

function exact(value, fields, codeName) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${codeName}_FIELDS_INVALID`);
  }
  return value;
}

function text(value, maximumBytes, codeName) {
  if (typeof value !== "string" || value.length < 1
    || Buffer.byteLength(value, "utf8") > maximumBytes
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    fail(`${codeName}_INVALID`);
  }
  return value;
}

function identifier(value, codeName) {
  if (typeof value !== "string" || !ID.test(value)) fail(`${codeName}_INVALID`);
  return value;
}

function publicCode(value, codeName) {
  if (typeof value !== "string" || !CODE.test(value)) fail(`${codeName}_INVALID`);
  return value;
}

function hash(value, codeName) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${codeName}_INVALID`);
  return value;
}

function instant(value, codeName) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${codeName}_INVALID`);
  }
  return value;
}

function rejectInferenceEscalation(value, key = null, seen = new Set()) {
  if (key !== null && FORBIDDEN_INFERENCE_KEY.test(String(key))) {
    fail("MODEL_DRAFT_FORBIDDEN_CONTROL_FIELD");
  }
  if (typeof value === "string" && FORBIDDEN_INFERENCE_TEXT.test(value)) {
    fail("MODEL_DRAFT_URL_OR_CONTACT_FORBIDDEN");
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) fail("MODEL_DRAFT_SHARED_OR_CYCLIC_VALUE");
  seen.add(value);
  for (const childKey of Reflect.ownKeys(value)) {
    rejectInferenceEscalation(value[childKey], childKey, seen);
  }
  seen.delete(value);
}

function normalizeTarget(value, comparator) {
  exact(value, ["valueKind", "booleanValue", "integerValue", "stateCode",
    "unitCode"], "MODEL_TARGET");
  if (!TARGET_KINDS.has(value.valueKind)) fail("MODEL_TARGET_KIND_INVALID");
  if (value.valueKind === "BOOLEAN") {
    if (typeof value.booleanValue !== "boolean" || value.integerValue !== null
      || value.stateCode !== null || value.unitCode !== null
      || comparator !== "EQUAL") fail("MODEL_BOOLEAN_TARGET_INVALID");
  } else if (value.valueKind === "INTEGER") {
    if (!Number.isSafeInteger(value.integerValue)
      || Object.is(value.integerValue, -0) || value.booleanValue !== null
      || value.stateCode !== null || value.unitCode === null) {
      fail("MODEL_INTEGER_TARGET_INVALID");
    }
    publicCode(value.unitCode, "MODEL_TARGET_UNIT_CODE");
  } else if (value.booleanValue !== null || value.integerValue !== null
    || value.unitCode !== null || comparator !== "EQUAL") {
    fail("MODEL_STATE_TARGET_INVALID");
  } else {
    publicCode(value.stateCode, "MODEL_TARGET_STATE_CODE");
  }
  return clone(value, "MODEL_TARGET");
}

function normalizeDiscovery(value, role) {
  exact(value, ["queryTerms", "routeKinds", "maximumCandidates"],
    `${role}_DISCOVERY`);
  if (!Array.isArray(value.queryTerms) || value.queryTerms.length < 1
    || value.queryTerms.length > 16) fail(`${role}_QUERY_TERMS_INVALID`);
  const queryTerms = value.queryTerms.map((item) =>
    text(item.trim(), 512, `${role}_QUERY_TERM`));
  if (new Set(queryTerms).size !== queryTerms.length) {
    fail(`${role}_QUERY_TERMS_DUPLICATE`);
  }
  if (!Array.isArray(value.routeKinds) || value.routeKinds.length < 1
    || value.routeKinds.length > ROUTE_KINDS.length
    || value.routeKinds.some((item) => !ROUTE_KIND_SET.has(item))
    || new Set(value.routeKinds).size !== value.routeKinds.length) {
    fail(`${role}_ROUTE_KINDS_INVALID`);
  }
  if (!Number.isSafeInteger(value.maximumCandidates)
    || value.maximumCandidates < 1 || value.maximumCandidates > 64) {
    fail(`${role}_MAXIMUM_CANDIDATES_INVALID`);
  }
  return { queryTerms, routeKinds: [...value.routeKinds],
    maximumCandidates: value.maximumCandidates };
}

function normalizeRoute(value, role) {
  exact(value, ["capability", "classCode", "quantity", "unitCode",
    "constraints", "discovery", "observationMode", "maximumAttempts"], role);
  const observationMode = value.observationMode;
  const maximumAttempts = value.maximumAttempts;
  if (role === "INDEPENDENT_WITNESS") {
    if (!OBSERVATION_MODES.has(observationMode) || maximumAttempts !== null) {
      fail("WITNESS_ROUTE_FIELDS_INVALID");
    }
  } else if (role === "RECOVERY") {
    if (observationMode !== null || !Number.isSafeInteger(maximumAttempts)
      || maximumAttempts < 1 || maximumAttempts > 16) {
      fail("RECOVERY_ROUTE_FIELDS_INVALID");
    }
  } else if (observationMode !== null || maximumAttempts !== null) {
    fail("PRIMARY_ROUTE_FIELDS_INVALID");
  }
  if (!Number.isSafeInteger(value.quantity) || value.quantity < 1
    || value.quantity > 1_000_000) fail(`${role}_QUANTITY_INVALID`);
  return {
    capability: text(value.capability, 512, `${role}_CAPABILITY`),
    classCode: publicCode(value.classCode, `${role}_CLASS_CODE`),
    quantity: value.quantity,
    unitCode: publicCode(value.unitCode, `${role}_UNIT_CODE`),
    constraints: clone(value.constraints, `${role}_CONSTRAINTS`),
    discovery: normalizeDiscovery(value.discovery, role),
    observationMode,
    maximumAttempts,
  };
}

function normalizeModelDraft(value, request) {
  rejectInferenceEscalation(value);
  const draft = clone(value, "MODEL_DRAFT");
  exact(draft, ["schema", "outcomeKindCode", "conditions", "acceptance",
    "routes"], "MODEL_DRAFT");
  if (draft.schema
      !== OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
        .modelDraft) fail("MODEL_DRAFT_SCHEMA_INVALID");
  publicCode(draft.outcomeKindCode, "MODEL_OUTCOME_KIND_CODE");
  if (!Array.isArray(draft.conditions) || draft.conditions.length < 1
    || draft.conditions.length > 64) fail("MODEL_CONDITIONS_INVALID");
  const conditions = draft.conditions.map((condition, index) => {
    exact(condition, ["metricCode", "comparator", "target",
      "observationWindowMs"], "MODEL_CONDITION");
    publicCode(condition.metricCode, "MODEL_CONDITION_METRIC_CODE");
    if (!COMPARATORS.has(condition.comparator)) {
      fail("MODEL_CONDITION_COMPARATOR_INVALID");
    }
    if (!Number.isSafeInteger(condition.observationWindowMs)
      || condition.observationWindowMs < 0
      || condition.observationWindowMs
        > Date.parse(request.completionDeadline) - Date.parse(request.requestedAt)) {
      fail("MODEL_CONDITION_WINDOW_INVALID");
    }
    return { metricCode: condition.metricCode, comparator: condition.comparator,
      target: normalizeTarget(condition.target, condition.comparator),
      observationWindowMs: condition.observationWindowMs, index };
  });
  if (!Array.isArray(draft.acceptance) || draft.acceptance.length < 1
    || draft.acceptance.length > 64) fail("MODEL_ACCEPTANCE_INVALID");
  const ids = new Set();
  const acceptance = draft.acceptance.map((criterion) => {
    exact(criterion, ["criterionId", "comparator", "subject", "expected"],
      "MODEL_ACCEPTANCE_CRITERION");
    const criterionId = identifier(criterion.criterionId,
      "MODEL_ACCEPTANCE_CRITERION_ID");
    if (ids.has(criterionId)) fail("MODEL_ACCEPTANCE_CRITERION_ID_DUPLICATE");
    ids.add(criterionId);
    return { criterionId,
      comparator: text(criterion.comparator, 128,
        "MODEL_ACCEPTANCE_COMPARATOR"),
      subject: text(criterion.subject, 1_024, "MODEL_ACCEPTANCE_SUBJECT"),
      expected: clone(criterion.expected, "MODEL_ACCEPTANCE_EXPECTED") };
  });
  exact(draft.routes, ["primary", "recovery", "independentWitness"],
    "MODEL_ROUTES");
  return deepFreeze({ schema: draft.schema,
    outcomeKindCode: draft.outcomeKindCode,
    conditions,
    acceptance,
    routes: {
      primary: normalizeRoute(draft.routes.primary, "PRIMARY"),
      recovery: normalizeRoute(draft.routes.recovery, "RECOVERY"),
      independentWitness: normalizeRoute(draft.routes.independentWitness,
        "INDEPENDENT_WITNESS"),
    } });
}

const FOUNDATION_FIELDS = Object.freeze([
  "workOrderHash", "typedGraph", "authorizationBinding", "subjectRefHash",
  "regionRefHash", "consequenceEnvelopeRefHash", "affectedChannelRefHashes",
  "maximumConsequence",
]);

function normalizeFoundationBindings(value) {
  const bindings = clone(value, "FOUNDATION_BINDINGS");
  exact(bindings, FOUNDATION_FIELDS, "FOUNDATION_BINDINGS");
  hash(bindings.workOrderHash, "WORK_ORDER_HASH");
  hash(bindings.subjectRefHash, "SUBJECT_REF_HASH");
  hash(bindings.regionRefHash, "REGION_REF_HASH");
  hash(bindings.consequenceEnvelopeRefHash, "CONSEQUENCE_ENVELOPE_REF_HASH");
  if (!Array.isArray(bindings.affectedChannelRefHashes)
    || bindings.affectedChannelRefHashes.length < 1
    || bindings.affectedChannelRefHashes.some((item) => !HASH.test(item))) {
    fail("AFFECTED_CHANNEL_REF_HASHES_INVALID");
  }
  exact(bindings.maximumConsequence,
    ["consequenceClassCode", "measureCode", "maximumValue", "unitCode"],
    "MAXIMUM_CONSEQUENCE");
  publicCode(bindings.maximumConsequence.consequenceClassCode,
    "CONSEQUENCE_CLASS_CODE");
  publicCode(bindings.maximumConsequence.measureCode,
    "CONSEQUENCE_MEASURE_CODE");
  publicCode(bindings.maximumConsequence.unitCode, "CONSEQUENCE_UNIT_CODE");
  if (!Number.isSafeInteger(bindings.maximumConsequence.maximumValue)
    || bindings.maximumConsequence.maximumValue < 0) {
    fail("CONSEQUENCE_MAXIMUM_VALUE_INVALID");
  }
  return deepFreeze(bindings);
}

function validateRequest(value) {
  exact(value, ["requestId", "goal", "budget", "completionDeadline",
    "context", "requestedAt"], "REQUEST");
  identifier(value.requestId, "REQUEST_ID");
  text(value.goal, 32_768, "GOAL");
  exact(value.budget, ["currency", "maximumAmountMinor"], "BUDGET");
  if (!CURRENCY.test(value.budget.currency)
    || !AMOUNT.test(value.budget.maximumAmountMinor)) fail("BUDGET_INVALID");
  instant(value.requestedAt, "REQUESTED_AT");
  instant(value.completionDeadline, "COMPLETION_DEADLINE");
  const duration = Date.parse(value.completionDeadline)
    - Date.parse(value.requestedAt);
  if (duration < 2 || duration > 365 * 24 * 60 * 60 * 1_000) {
    fail("COMPLETION_WINDOW_INVALID");
  }
  clone(value.context, "REQUEST_CONTEXT");
  return value;
}

function opaqueId(prefix, scope) {
  return `${prefix}_${createHash("sha256").update(scope, "utf8")
    .digest("hex").slice(0, 32)}`;
}

function prepareOutcomeCompilation(request, draft, formationWindowMs) {
  const scopeHash = digest("outsider/outcome-product-foundation-scope/v1", {
    requestId: request.requestId,
    goal: request.goal,
    budget: request.budget,
    completionDeadline: request.completionDeadline,
    context: request.context,
  });
  const formationDeadlineMs = Math.min(
    Date.parse(request.requestedAt) + formationWindowMs,
    Date.parse(request.completionDeadline) - 1,
  );
  if (formationDeadlineMs <= Date.parse(request.requestedAt)) {
    fail("FORMATION_WINDOW_NOT_AVAILABLE");
  }
  const formationDeadline = new Date(formationDeadlineMs).toISOString();
  const conditionRows = draft.conditions.map((condition) => {
    const semantic = { metricCode: condition.metricCode,
      comparator: condition.comparator, target: condition.target,
      observationWindowMs: condition.observationWindowMs };
    return {
      conditionId: opaqueId("condition",
        `${scopeHash}\0${condition.index}\0${canonicalizeStrict(semantic)}`),
      ...semantic,
      conditionRefHash: digest(
        "outsider/outcome-product-condition-reference/v1", {
          scopeHash, conditionIndex: condition.index, condition: semantic,
        }),
      mandatory: true,
    };
  });
  const frozenOutcomeBody = {
    schema: OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
      .frozenOutcome,
    schemaVersion: "1.0.0",
    requestId: request.requestId,
    statement: request.goal,
    budget: clone(request.budget, "OUTCOME_BUDGET"),
    completionDeadline: request.completionDeadline,
    outcomeKindCode: draft.outcomeKindCode,
    acceptance: draft.acceptance,
    conditions: conditionRows.map(({ conditionRefHash, mandatory, ...row }) =>
      row),
  };
  const frozenOutcome = deepFreeze({ ...frozenOutcomeBody,
    outcomeHash: digest(
      OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS.frozenOutcome,
      frozenOutcomeBody) });
  return deepFreeze({ scopeHash, formationDeadline, conditionRows,
    frozenOutcome });
}

function buildCompilation(request, draft, bindings, formationWindowMs,
  preparedOutcome = null) {
  const prepared = preparedOutcome
    ?? prepareOutcomeCompilation(request, draft, formationWindowMs);
  const { scopeHash, formationDeadline, conditionRows, frozenOutcome }
    = prepared;
  const requirementIds = {
    primary: opaqueId("resource", `${scopeHash}\0PRIMARY`),
    recovery: opaqueId("recovery", `${scopeHash}\0RECOVERY`),
    independentWitness: opaqueId("evidence",
      `${scopeHash}\0INDEPENDENT_WITNESS`),
  };
  const routes = draft.routes;
  const tender = compileOutsiderOutcomeTenderV1({
    tenderId: opaqueId("tender", scopeHash),
    compiledAt: request.requestedAt,
    lineage: { revision: 0, predecessorTenderHash: null,
      supersedesTenderHash: null },
    workOrderHash: bindings.workOrderHash,
    typedGraph: bindings.typedGraph,
    authorizationBinding: bindings.authorizationBinding,
    exactOutcome: {
      outcomeKindCode: draft.outcomeKindCode,
      outcomeSpecRefHash: frozenOutcome.outcomeHash,
      subjectRefHash: bindings.subjectRefHash,
      acceptanceCriteriaRefHash: digest(
        "outsider/outcome-product-acceptance-criteria/v1", {
          scopeHash, acceptance: draft.acceptance,
        }),
      conditions: conditionRows,
      deadline: request.completionDeadline,
    },
    formationDeadline,
    resourceRequirements: [{
      resourceRequirementId: requirementIds.primary,
      resourceClassCode: routes.primary.classCode,
      capabilityRefHash: digest(
        "outsider/outcome-product-primary-capability/v1", {
          scopeHash, capability: routes.primary.capability,
          constraints: routes.primary.constraints,
        }),
      quantity: routes.primary.quantity,
      unitCode: routes.primary.unitCode,
      regionRefHash: bindings.regionRefHash,
      requiredBy: request.completionDeadline,
      mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: requirementIds.independentWitness,
      evidenceClassCode: routes.independentWitness.classCode,
      evidenceRequirementRefHash: digest(
        "outsider/outcome-product-independent-witness-requirement/v1", {
          scopeHash, capability: routes.independentWitness.capability,
          constraints: routes.independentWitness.constraints,
        }),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: routes.independentWitness.observationMode,
      dueBy: request.completionDeadline,
      mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: requirementIds.recovery,
      triggerRefHash: digest("outsider/outcome-product-recovery-trigger/v1",
        { scopeHash, outcomeHash: frozenOutcome.outcomeHash }),
      recoveryOutcomeRefHash: frozenOutcome.outcomeHash,
      resourceClassCode: routes.recovery.classCode,
      maximumAttempts: routes.recovery.maximumAttempts,
      completionDeadline: request.completionDeadline,
      recoveryEvidenceRequirementId: requirementIds.independentWitness,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED",
      mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: bindings.consequenceEnvelopeRefHash,
      ...bindings.maximumConsequence,
      affectedChannelRefHashes: bindings.affectedChannelRefHashes,
      irreversibleHarmAllowed: false,
      unboundedConsequenceAllowed: false,
    },
    zeroInternalOps: {
      outsiderStaffInterventionsAllowed: 0,
      internalManualSourcingAllowed: false,
      internalManualCoordinationAllowed: false,
      internalManualVerificationAllowed: false,
      internalManualRecoveryAllowed: false,
      humanQueueFallbackAllowed: false,
      failureDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    },
  });
  const tenderVerification = verifyOutsiderOutcomeTenderV1(tender, {
    expectedTenderHash: tender.tenderHash,
  });
  if (tenderVerification.ok !== true
    || tenderVerification.authorizationEstablished !== false
    || tenderVerification.actionReady !== false) fail("TENDER_VERIFY_FAILED");
  const minimumReservationMs = Math.max(1,
    Date.parse(request.completionDeadline) - Date.parse(request.requestedAt));
  const program = compileOutcomeProgramV1({
    programId: opaqueId("program", scopeHash),
    orderId: request.requestId,
    createdAt: request.requestedAt,
    formationDeadline,
    completionDeadline: request.completionDeadline,
    tenderHash: tender.tenderHash,
    outcome: { statement: request.goal, acceptance: draft.acceptance,
      budget: request.budget },
    requirements: [
      { requirementId: "primary", role: "PRIMARY",
        capability: routes.primary.capability,
        constraints: { ...routes.primary.constraints,
          frozenOutcomeHash: frozenOutcome.outcomeHash,
          tenderRequirementId: requirementIds.primary },
        minimumReservationMs, dependsOnRequirementIds: [] },
      { requirementId: "recovery", role: "RECOVERY",
        capability: routes.recovery.capability,
        constraints: { ...routes.recovery.constraints,
          frozenOutcomeHash: frozenOutcome.outcomeHash,
          tenderRequirementId: requirementIds.recovery },
        minimumReservationMs, dependsOnRequirementIds: [] },
      { requirementId: "independent_witness", role: "INDEPENDENT_WITNESS",
        capability: routes.independentWitness.capability,
        constraints: { ...routes.independentWitness.constraints,
          frozenOutcomeHash: frozenOutcome.outcomeHash,
          tenderRequirementId: requirementIds.independentWitness },
        minimumReservationMs,
        dependsOnRequirementIds: ["primary", "recovery"] },
    ],
    nodes: [{
      nodeId: "deliver_requested_outcome",
      kind: "EFFECT",
      dependsOn: [],
      primaryRequirementId: "primary",
      recoveryRequirementId: "recovery",
      witnessRequirementId: "independent_witness",
      input: { frozenOutcomeHash: frozenOutcome.outcomeHash },
      acceptance: draft.acceptance.map(({ criterionId }) => criterionId),
    }],
    obligations: [
      ["release_primary", "primary"],
      ["release_recovery", "recovery"],
      ["release_independent_witness", "independent_witness"],
    ].map(([obligationId, targetRequirementId]) => ({
      obligationId,
      trigger: "ALWAYS",
      targetRequirementId,
      nodeId: "deliver_requested_outcome",
      action: "RELEASE_ORDER_SCOPED_RESOURCE",
      input: {},
      deadline: request.completionDeadline,
    })),
    zeroInternalOps: { staffTouchLimit: 0, humanQueueFallback: false },
  });
  verifyOutcomeProgramV1(program);
  const routeRows = [
    ["PRIMARY", "primary", "RESOURCE", requirementIds.primary,
      routes.primary],
    ["RECOVERY", "recovery", "RECOVERY", requirementIds.recovery,
      routes.recovery],
    ["INDEPENDENT_WITNESS", "independent_witness", "EVIDENCE",
      requirementIds.independentWitness, routes.independentWitness],
  ];
  const formationRequirementsBody = {
    schema: OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
      .formationRequirements,
    schemaVersion: "1.0.0",
    requestId: request.requestId,
    outcomeHash: frozenOutcome.outcomeHash,
    tenderHash: tender.tenderHash,
    programHash: program.programHash,
    formationDeadline,
    slots: routeRows.map(([routeRole, programRequirementId,
      tenderRequirementKind, tenderRequirementId, route]) => ({
      routeRole, programRequirementId, tenderRequirementKind,
      tenderRequirementId, capability: route.capability,
      constraints: route.constraints,
      minimumReservationMs,
    })),
    allThreeRolesRequired: true,
    atomicCommitRequired: true,
    cartsCountAsReservations: false,
  };
  const formationRequirements = deepFreeze({ ...formationRequirementsBody,
    formationRequirementsHash: digest(
      OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
        .formationRequirements, formationRequirementsBody) });
  const candidateRoutingBody = {
    schema: OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
      .candidateRoutingRequest,
    schemaVersion: "1.0.0",
    requestId: request.requestId,
    outcomeHash: frozenOutcome.outcomeHash,
    tenderHash: tender.tenderHash,
    programHash: program.programHash,
    formationRequirementsHash:
      formationRequirements.formationRequirementsHash,
    formationDeadline,
    strategy: "ORDER_SCOPED_FEDERATED_BUYER_NATIVE_TRANSACTION_SURFACES",
    providerRegistryRequired: false,
    jobs: routeRows.map(([routeRole, programRequirementId,
      tenderRequirementKind, tenderRequirementId, route]) => ({
      routeRole, programRequirementId, tenderRequirementKind,
      tenderRequirementId, capability: route.capability,
      constraints: route.constraints,
      queryTerms: route.discovery.queryTerms,
      routeKinds: route.discovery.routeKinds,
      maximumCandidates: route.discovery.maximumCandidates,
    })),
    rankingPolicy: "OPTIONAL_SHADOW_ORDER_ONLY_KEEP_BASELINE_ON_FAILURE",
    sellerReplyRequired: false,
    authority: "NONE",
    actionReady: false,
  };
  const candidateRoutingRequest = deepFreeze({ ...candidateRoutingBody,
    candidateRoutingRequestHash: digest(
      OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
        .candidateRoutingRequest, candidateRoutingBody) });
  const body = {
    schema: OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
      .compilation,
    schemaVersion: "1.0.0",
    requestId: request.requestId,
    requestScopeHash: scopeHash,
    modelDraftHash: digest(
      OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS.modelDraft,
      draft),
    foundationBindingsHash: digest(
      "outsider/outcome-product-foundation-bindings/v1", bindings),
    modelDraft: draft,
    frozenOutcome,
    tender,
    program,
    formationRequirements,
    candidateRoutingRequest,
    inferenceAuthority: "NONE",
    actionReady: false,
    capacityEstablished: false,
  };
  return deepFreeze({ ...body,
    compilationHash: digest(
      OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS.compilation,
      body) });
}

/** Create the small, production-callable natural-goal foundation compiler. */
export function createOutcomeProductFoundationCompilerV1(options = {}) {
  exact(options, ["modelInference", "resolveFoundationBindings",
    "formationWindowMs"], "COMPILER_OPTIONS");
  if (typeof options.modelInference !== "function"
    || typeof options.resolveFoundationBindings !== "function"
    || !Number.isSafeInteger(options.formationWindowMs)
    || options.formationWindowMs < 1
    || options.formationWindowMs > 24 * 60 * 60 * 1_000) {
    fail("COMPILER_OPTIONS_INVALID");
  }
  return Object.freeze({
    async compile(requestInput) {
      const request = validateRequest(clone(requestInput, "REQUEST"));
      const modelRequest = deepFreeze({
        schema: OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
          .modelRequest,
        schemaVersion: "1.0.0",
        requestId: request.requestId,
        goal: request.goal,
        budget: request.budget,
        completionDeadline: request.completionDeadline,
        context: request.context,
        outputContract:
          OUTSIDER_OUTCOME_PRODUCT_MODEL_DRAFT_CONTRACT_V1,
        authority: "NONE",
        actionPermitted: false,
      });
      const rawDraft = await options.modelInference(modelRequest);
      const draft = normalizeModelDraft(rawDraft, request);
      const preparedOutcome = prepareOutcomeCompilation(request, draft,
        options.formationWindowMs);
      /* Identity, delegation and Work Order resolution follows outcome
         compilation so the existing typed graph can bind the exact frozen
         outcome instead of racing a model result it has never seen. */
      const rawBindings = await options.resolveFoundationBindings(deepFreeze({
        ...clone(request, "FOUNDATION_REQUEST"),
        modelDraft: draft,
        frozenOutcome: preparedOutcome.frozenOutcome,
        formationDeadline: preparedOutcome.formationDeadline,
      }));
      const bindings = normalizeFoundationBindings(rawBindings);
      return buildCompilation(request, draft, bindings,
        options.formationWindowMs, preparedOutcome);
    },
  });
}

export function verifyOutcomeProductFoundationCompilationV1(value) {
  const record = clone(value, "COMPILATION");
  const compilationHash = record.compilationHash;
  hash(compilationHash, "COMPILATION_HASH");
  delete record.compilationHash;
  if (digest(
    OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS.compilation,
    record) !== compilationHash
    || record.schema
      !== OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
        .compilation
    || record.frozenOutcome?.outcomeHash
      !== digest(
        OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
          .frozenOutcome,
        Object.fromEntries(Object.entries(record.frozenOutcome)
          .filter(([key]) => key !== "outcomeHash")))
    || record.tender?.tenderHash !== record.program?.tenderHash
    || record.frozenOutcome?.outcomeHash
      !== record.formationRequirements?.outcomeHash
    || record.formationRequirements?.formationRequirementsHash
      !== record.candidateRoutingRequest?.formationRequirementsHash
    || record.inferenceAuthority !== "NONE"
    || record.actionReady !== false || record.capacityEstablished !== false) {
    fail("COMPILATION_VERIFY_FAILED");
  }
  const tenderCheck = verifyOutsiderOutcomeTenderV1(record.tender, {
    expectedTenderHash: record.tender.tenderHash,
  });
  if (tenderCheck.ok !== true) fail("COMPILATION_TENDER_VERIFY_FAILED");
  verifyOutcomeProgramV1(record.program);
  return deepFreeze({ ...record, compilationHash });
}

function stem(requestId) {
  return createHash("sha256").update(requestId, "utf8").digest("hex");
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeCompilation(directory, compilation) {
  const file = path.join(directory,
    `${stem(compilation.requestId)}.foundation.v1.json`);
  if (existsSync(file)) {
    const existing = readCompilation(directory, compilation.requestId);
    if (existing.compilationHash !== compilation.compilationHash) {
      fail("COMPILATION_REPLAY_MISMATCH");
    }
    return;
  }
  const bytes = Buffer.from(`${canonicalizeStrict(compilation)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  let directoryDescriptor;
  try {
    directoryDescriptor = openSync(directory, "r");
    fsyncSync(directoryDescriptor);
  } finally {
    if (directoryDescriptor !== undefined) closeSync(directoryDescriptor);
  }
}

function readCompilation(directory, requestId) {
  identifier(requestId, "REQUEST_ID");
  const file = path.join(directory, `${stem(requestId)}.foundation.v1.json`);
  if (!existsSync(file)) fail("COMPILATION_NOT_FOUND");
  const info = statSync(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0) {
    fail("COMPILATION_RECORD_NOT_PRIVATE");
  }
  const bytes = readFileSync(file);
  if (bytes.length < 3 || bytes.at(-1) !== 0x0a) {
    fail("COMPILATION_RECORD_PARTIAL");
  }
  let record;
  try { record = JSON.parse(bytes.toString("utf8")); } catch {
    fail("COMPILATION_RECORD_INVALID");
  }
  if (`${canonicalizeStrict(record)}\n` !== bytes.toString("utf8")) {
    fail("COMPILATION_RECORD_NOT_CANONICAL");
  }
  return verifyOutcomeProductFoundationCompilationV1(record);
}

/**
 * Direct Outcome Product Runtime v2 factory. The production preparation
 * callback receives `foundationCompilation` in addition to the native v2
 * request/program/authorization fields.
 */
export function createFoundationIntegratedOutcomeProductRuntimeV2(
  options = {}) {
  const required = ["directory", "modelInference", "resolveFoundationBindings",
    "formationWindowMs", "prepareFormation", "restoreCoordinator", "clock"];
  const allowed = new Set([...required, "formationEventSink"]);
  if (options === null || typeof options !== "object" || Array.isArray(options)
    || Buffer.isBuffer(options)
    || required.some((field) => !Object.hasOwn(options, field))
    || Reflect.ownKeys(options).some((field) => !allowed.has(field))
    || typeof options.directory !== "string" || options.directory.length < 1
    || typeof options.prepareFormation !== "function"
    || (options.formationEventSink !== undefined
      && options.formationEventSink !== null
      && typeof options.formationEventSink !== "function")) {
    fail("RUNTIME_OPTIONS_INVALID");
  }
  const directory = path.resolve(options.directory);
  const foundationDirectory = path.join(directory, "formation-foundation-v1");
  mkdirSync(foundationDirectory, { recursive: true, mode: 0o700 });
  if ((statSync(foundationDirectory).mode & 0o077) !== 0) {
    fail("FOUNDATION_DIRECTORY_NOT_PRIVATE");
  }
  const compiler = createOutcomeProductFoundationCompilerV1({
    modelInference: options.modelInference,
    resolveFoundationBindings: options.resolveFoundationBindings,
    formationWindowMs: options.formationWindowMs,
  });
  const runtime = createOutsiderOutcomeProductRuntimeV2({
    directory,
    clock: options.clock,
    restoreCoordinator: options.restoreCoordinator,
    formationEventSink: options.formationEventSink,
    async compileGoal(request) {
      const compilation = await compiler.compile(request);
      writeCompilation(foundationDirectory, compilation);
      return compilation.program;
    },
    async prepareFormation(input) {
      const foundationCompilation = readCompilation(foundationDirectory,
        input.request.requestId);
      if (foundationCompilation.program.programHash !== input.program.programHash
        || foundationCompilation.frozenOutcome.statement !== input.request.goal
        || foundationCompilation.frozenOutcome.completionDeadline
          !== input.request.completionDeadline) {
        fail("RUNTIME_FOUNDATION_BINDING_MISMATCH");
      }
      return options.prepareFormation(Object.freeze({
        ...input,
        foundationCompilation,
      }));
    },
  });
  return Object.freeze({
    ...runtime,
    inspectFoundation(requestId) {
      return readCompilation(foundationDirectory, requestId);
    },
  });
}

/**
 * Apply an optional retrospective/logistic model as shadow ordering only.
 * Invalid/throwing rankers produce the unchanged baseline order.
 */
export async function orderCandidateRoutesWithShadowModelV1(input = {},
  dependencies = {}) {
  exact(input, ["candidateRoutingRequest", "candidates"], "SHADOW_INPUT");
  exact(dependencies, ["rankCandidates"], "SHADOW_DEPENDENCIES");
  if (typeof dependencies.rankCandidates !== "function"
    || input.candidateRoutingRequest?.schema
      !== OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
        .candidateRoutingRequest
    || !Array.isArray(input.candidates) || input.candidates.length > 512) {
    fail("SHADOW_INPUT_INVALID");
  }
  const candidates = clone(input.candidates, "SHADOW_CANDIDATES");
  const allowedRoles = new Set(["PRIMARY", "RECOVERY", "INDEPENDENT_WITNESS"]);
  const refs = new Set();
  for (const candidate of candidates) {
    exact(candidate, ["candidateRefHash", "routeRole", "features"],
      "SHADOW_CANDIDATE");
    hash(candidate.candidateRefHash, "SHADOW_CANDIDATE_REF_HASH");
    if (!allowedRoles.has(candidate.routeRole)
      || refs.has(candidate.candidateRefHash)) fail("SHADOW_CANDIDATE_INVALID");
    refs.add(candidate.candidateRefHash);
    clone(candidate.features, "SHADOW_FEATURES");
  }
  const baseline = candidates.map(({ candidateRefHash }) => candidateRefHash);
  let ordered = baseline;
  let decision = "KEEP_BASELINE";
  try {
    const response = await dependencies.rankCandidates(deepFreeze({
      mode: "SHADOW_DISCOVERY_PROBE_ORDER_ONLY",
      candidateRoutingRequest: clone(input.candidateRoutingRequest,
        "CANDIDATE_ROUTING_REQUEST"),
      candidates,
      authority: "NONE",
    }));
    exact(response, ["orderedCandidateRefHashes"], "SHADOW_RESPONSE");
    if (!Array.isArray(response.orderedCandidateRefHashes)
      || response.orderedCandidateRefHashes.length !== baseline.length
      || new Set(response.orderedCandidateRefHashes).size !== refs.size
      || response.orderedCandidateRefHashes.some((item) => !refs.has(item))) {
      throw new TypeError("INVALID_SHADOW_ORDER");
    }
    ordered = [...response.orderedCandidateRefHashes];
    decision = "USE_SHADOW_ORDER_FOR_DISCOVERY_PROBES_ONLY";
  } catch {
    ordered = baseline;
  }
  const body = {
    schema: OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
      .shadowOrdering,
    schemaVersion: "1.0.0",
    candidateRoutingRequestHash:
      input.candidateRoutingRequest.candidateRoutingRequestHash,
    decision,
    orderedCandidateRefHashes: ordered,
    candidatesAdmitted: 0,
    candidatesRejected: 0,
    authority: "NONE",
    capacityEstablished: false,
    actionAuthorized: false,
  };
  return deepFreeze({ ...body,
    shadowOrderingHash: digest(
      OUTSIDER_OUTCOME_PRODUCT_FOUNDATION_COMPOSITION_V1_SCHEMAS
        .shadowOrdering, body) });
}
