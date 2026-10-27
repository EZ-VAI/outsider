/*
 * Real public-projection -> recovery admission bridge v1.
 *
 * This user-held bridge consumes only the already-redacted, content-addressed
 * SparkFun v1 and Target v3 public projections.  It never accepts raw seller
 * response bytes, address/contact fields, credentials, or payment material.
 * The projection facts are mapped into the append-only evidence stream owned
 * by outsider-recovery-portfolio-admission-gate-v1.
 *
 * The currently supported projections are intentionally non-promoting:
 * SparkFun has all-in price but no structured ETA or capacity reservation;
 * Target has seller date/ATP observations but no exact specification match,
 * all-in total, or capacity reservation.  Mapping cannot upgrade those facts.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_RECOVERY_CANDIDATE_EVIDENCE_GENESIS_V1,
  createRecoveryCandidateEvidenceEventV1,
  selectRecoveryPortfolioCandidatesV1,
} from "./outsider-recovery-portfolio-admission-gate-v1.js";

const PREFIX = "OUTSIDER_REAL_ROUTE_PROJECTION_ADMISSION_BRIDGE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const MAX_ROUTES = 32;

export const OUTSIDER_REAL_ROUTE_PROJECTION_ADMISSION_BRIDGE_V1_ROUTE_KINDS
  = Object.freeze(["SPARKFUN_PUBLIC_PROJECTION_V1", "TARGET_REDSKY_V3"]);

export const OUTSIDER_REAL_ROUTE_PROJECTION_ADMISSION_BRIDGE_V1_BOUNDARY
  = deepFreeze({
    position: "USER_HELD_REDACTED_REAL_PROJECTION_TO_RECOVERY_HARD_GATE",
    acceptedProjectionSchemas: Object.freeze([
      "outsider/sparkfun-full-address-prepayment-public-projection/v1",
      "outsider/target-redsky-read-only-route-assessment/v3",
    ]),
    projectionContentHashRecomputed: true,
    projectionShapeClosed: true,
    rawProviderResponseBytesAccepted: false,
    rawPrivateInputAccepted: false,
    addressAccepted: false,
    contactAccepted: false,
    coordinatesAccepted: false,
    credentialsAccepted: false,
    paymentMaterialAccepted: false,
    publicProjectionNegativeFactsPreserved: true,
    atpObservationAcceptedAsCapacityReservation: false,
    readyForPaymentAcceptedAsCapacityReservation: false,
    sellerClaimAcceptedAsIndependentOutcomeTruth: false,
    serverAcknowledgementAcceptedAsIndependentOutcomeTruth: false,
    projectionAcceptedAsIndependentOutcomeTruth: false,
    mappingMintsAuthority: false,
    mappingCommitsOutcome: false,
    networkIoPerformed: false,
    browserInteractionPerformed: false,
    paymentPerformed: false,
    orderSubmitted: false,
    authority: "NONE",
    actionReady: false,
    executable: false,
  });

const INPUT_FIELDS = Object.freeze([
  "outcomeLifecycleEvents", "routeProposalRegistryEvents",
  "recoveryPortfolio", "evaluatedAt", "frozenConstraints", "routes",
]);
const ROUTE_FIELDS = Object.freeze([
  "routeKind", "occurrenceRefHash", "recoveryOptionRefHash",
  "evidenceValidUntil", "projection",
]);
const CONSTRAINT_FIELDS = Object.freeze([
  "acceptancePredicateHash", "maximumLossConstraintHash", "currency",
  "maximumAllInMinorUnits", "completionDeadline",
]);
const SPARKFUN_FIELDS = Object.freeze([
  "schema", "schemaVersion", "provider", "executionClass", "observedAt",
  "completionDeadline", "outcomeIntentRefHash", "destinationRefHash",
  "privateInputBytesHash", "privateInputBytes", "rawPrivateInputProjected",
  "product", "budget", "selectedShippingMethod", "finalTotalMinor",
  "budgetSatisfied", "structuredEtaAvailable", "deliveryDeadlineProven",
  "capacityReserved", "providerSourceEstablishesCapacity",
  "readyForPaymentAuthorization", "paymentAuthorized",
  "paymentMethodSelected", "paymentPerformed", "orderAuthorized",
  "orderSubmitted", "userResultCommitted", "runState", "nextGate",
  "counters", "stages", "projectionHash",
]);
const SPARKFUN_PRODUCT_FIELDS = Object.freeze([
  "productId", "sku", "catalogPath", "quantity",
]);
const SPARKFUN_BUDGET_FIELDS = Object.freeze([
  "currency", "maximumAmountMinor",
]);
const SPARKFUN_SHIPPING_FIELDS = Object.freeze([
  "carrierCode", "methodCode", "sourceQuotedAmountMinor",
]);
const SPARKFUN_COUNTER_FIELDS = Object.freeze([
  "liveHttpRequestCount", "getRequestCount", "postRequestCount",
  "interactiveBrowserActionCount", "modelCallCount", "employeeTouchCount",
  "paymentEndpointAttemptCount", "orderEndpointAttemptCount",
]);
const SPARKFUN_STAGE_FIELDS = Object.freeze([
  "stageId", "operation", "operationState", "runtimeState", "sourceState",
  "sourceOccurrenceHash", "sourceBytesHash", "sourceBytesLength",
  "retryPermitted",
]);
const TARGET_FIELDS = Object.freeze([
  "schema", "schemaVersion", "predecessor", "observedAt", "routeRole",
  "executionClass", "frozenOutcomeAcceptance", "constraints",
  "productEvidence", "structuredSellerEvidence", "routeAssessment",
  "sourceOccurrences", "externalEffects", "privacyBoundary", "boundary",
  "projectionHash",
]);
const TARGET_PREDECESSOR_FIELDS = Object.freeze(["schema", "projectionHash"]);
const TARGET_ACCEPTANCE_FIELDS = Object.freeze([
  "contractRefHash", "condition", "connectorA", "connectorB",
  "dataRequired", "fiveVoltPowerRequired", "minimumLengthMm",
  "maximumLengthMm", "quantity",
]);
const TARGET_CONSTRAINT_FIELDS = Object.freeze([
  "maximumAmountMinor", "requestedDeliveryDate", "quantity",
]);
const TARGET_PRODUCT_EVIDENCE_FIELDS = Object.freeze([
  "tcin", "explicit5vClaim", "exactAcceptanceSatisfied", "acceptanceGaps",
  "standardShippingRouteState",
]);
const TARGET_SELLER_FIELDS = Object.freeze([
  "availabilityStatus", "availableToPromiseQuantity",
  "selectedSourceService", "itemPlusScheduledDeliveryFeeBeforeTaxMinor",
  "sourceAtpSatisfiesQuantity", "sourceDateMeetsRequestedDeadline",
]);
const TARGET_SERVICE_FIELDS = Object.freeze([
  "shippingMethodId", "serviceLevelDescription", "shortDescription",
  "minDeliveryDate", "maxDeliveryDate", "cutoff", "isBaseShippingMethod",
  "isTwoDayShipping",
]);
const TARGET_ASSESSMENT_FIELDS = Object.freeze([
  "state", "reasonCode", "exactProductRequirementsSatisfied",
  "sourceAtpSatisfiesQuantity", "sourceDateMeetsRequestedDeadline",
  "fullAddressAllInTotalProven", "standardShippingBudgetPotentiallyFeasible",
  "capacityReserved", "commitEligible",
]);
const TARGET_OCCURRENCES_FIELDS = Object.freeze(["pdp", "fulfillment"]);
const TARGET_OCCURRENCE_FIELDS = Object.freeze([
  "occurrenceHash", "bytesHash", "byteLength",
]);
const TARGET_EFFECT_FIELDS = Object.freeze([
  "publicReadRequests", "accountOnlySameDayRequests", "cartMutations",
  "checkoutSubmissions", "paymentAttempts", "orderSubmissions",
]);
const TARGET_PRIVACY_FIELDS = Object.freeze([
  "streetAddressProjected", "postalCodeProjected", "coordinatesProjected",
  "contactProjected",
]);
const TARGET_BOUNDARY_FIELDS = Object.freeze([
  "descendsFrom", "provider", "transport", "routeRole",
  "permittedHttpMethods", "publicPdpGetCount", "publicFulfillmentGetCount",
  "accountOnlySameDayPathAllowed", "cartMutationAllowed", "checkoutAllowed",
  "paymentAllowed", "orderAllowed", "capacityReservationAllowed",
  "rawSellerBytesProjected", "rawDestinationProjected", "authorityMinted",
  "independentOutcomeTruthEstablished", "outcomeCommitted",
]);

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== fields.length) {
    fail(`${code}_FIELDS_INVALID`);
  }
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  canonicalizeStrict(value);
  return value;
}

function dense(value, maximum, code, allowEmpty = false) {
  if (!Array.isArray(value) || isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > maximum || (!allowEmpty && value.length === 0)
    || Reflect.ownKeys(value).length !== value.length + 1) fail(`${code}_INVALID`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC.test(value)
    || !Number.isSafeInteger(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function dateOnly(value, code) {
  if (typeof value !== "string" || !DATE_ONLY.test(value)
    || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10)
      !== value) fail(`${code}_INVALID`);
  return value;
}

function integer(value, code, maximum = 1_000_000_000) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function integerString(value, code) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,11})$/u.test(value)) {
    fail(`${code}_INVALID`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail(`${code}_INVALID`);
  return parsed;
}

function bool(value, code) {
  if (typeof value !== "boolean") fail(`${code}_INVALID`);
  return value;
}

function token(value, code, maximum = 512) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum
    || /[\r\n\0]/u.test(value)) fail(`${code}_INVALID`);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function projectionHash(value) {
  const { projectionHash: claimed, ...body } = value;
  const rebuilt = digest(value.schema, body);
  if (hash(claimed, "PROJECTION_HASH") !== rebuilt) {
    fail("PROJECTION_HASH_REPLAY_INVALID");
  }
  return claimed;
}

function constraints(value) {
  exact(value, CONSTRAINT_FIELDS, "FROZEN_CONSTRAINTS");
  if (typeof value.currency !== "string" || !CURRENCY.test(value.currency)) {
    fail("FROZEN_CURRENCY_INVALID");
  }
  return deepFreeze({
    acceptancePredicateHash: hash(value.acceptancePredicateHash,
      "ACCEPTANCE_PREDICATE_HASH"),
    maximumLossConstraintHash: hash(value.maximumLossConstraintHash,
      "MAXIMUM_LOSS_CONSTRAINT_HASH"),
    currency: value.currency,
    maximumAllInMinorUnits: integer(value.maximumAllInMinorUnits,
      "MAXIMUM_ALL_IN_MINOR_UNITS", 1_000_000_000_000),
    completionDeadline: instant(value.completionDeadline,
      "COMPLETION_DEADLINE"),
  });
}

function stage(value, index) {
  exact(value, SPARKFUN_STAGE_FIELDS, "SPARKFUN_STAGE");
  token(value.stageId, "SPARKFUN_STAGE_ID");
  token(value.operation, "SPARKFUN_STAGE_OPERATION");
  token(value.operationState, "SPARKFUN_STAGE_OPERATION_STATE");
  token(value.runtimeState, "SPARKFUN_STAGE_RUNTIME_STATE");
  token(value.sourceState, "SPARKFUN_STAGE_SOURCE_STATE");
  hash(value.sourceOccurrenceHash, "SPARKFUN_SOURCE_OCCURRENCE_HASH");
  hash(value.sourceBytesHash, "SPARKFUN_SOURCE_BYTES_HASH");
  integer(value.sourceBytesLength, "SPARKFUN_SOURCE_BYTES_LENGTH",
    64 * 1024 * 1024);
  bool(value.retryPermitted, "SPARKFUN_RETRY_PERMITTED");
  if (value.operationState !== "SOURCE_OCCURRENCE_OBSERVED"
    || value.retryPermitted !== false || index > 3) {
    fail("SPARKFUN_STAGE_BOUNDARY_INVALID");
  }
  return value;
}

function sparkFunProjection(value, frozen) {
  exact(value, SPARKFUN_FIELDS, "SPARKFUN_PROJECTION");
  if (value.schema
      !== "outsider/sparkfun-full-address-prepayment-public-projection/v1"
    || value.schemaVersion !== "1.0.0"
    || value.provider !== "SPARKFUN_MAGENTO_GUEST_CART"
    || value.executionClass !== "INJECTED_HTTPS_TRANSPORT") {
    fail("SPARKFUN_PROJECTION_IDENTITY_INVALID");
  }
  const observedAt = instant(value.observedAt, "SPARKFUN_OBSERVED_AT");
  if (instant(value.completionDeadline, "SPARKFUN_COMPLETION_DEADLINE")
      !== frozen.completionDeadline) fail("SPARKFUN_DEADLINE_BINDING_INVALID");
  hash(value.outcomeIntentRefHash, "SPARKFUN_OUTCOME_INTENT_REF_HASH");
  hash(value.destinationRefHash, "SPARKFUN_DESTINATION_REF_HASH");
  hash(value.privateInputBytesHash, "SPARKFUN_PRIVATE_INPUT_BYTES_HASH");
  integer(value.privateInputBytes, "SPARKFUN_PRIVATE_INPUT_BYTES", 64 * 1024);
  exact(value.product, SPARKFUN_PRODUCT_FIELDS, "SPARKFUN_PRODUCT");
  token(value.product.productId, "SPARKFUN_PRODUCT_ID");
  token(value.product.sku, "SPARKFUN_SKU");
  token(value.product.catalogPath, "SPARKFUN_CATALOG_PATH");
  if (integer(value.product.quantity, "SPARKFUN_QUANTITY") !== 1) {
    fail("SPARKFUN_QUANTITY_INVALID");
  }
  exact(value.budget, SPARKFUN_BUDGET_FIELDS, "SPARKFUN_BUDGET");
  if (value.budget.currency !== frozen.currency
    || integerString(value.budget.maximumAmountMinor,
      "SPARKFUN_MAXIMUM_AMOUNT") !== frozen.maximumAllInMinorUnits) {
    fail("SPARKFUN_BUDGET_BINDING_INVALID");
  }
  exact(value.selectedShippingMethod, SPARKFUN_SHIPPING_FIELDS,
    "SPARKFUN_SHIPPING");
  token(value.selectedShippingMethod.carrierCode,
    "SPARKFUN_SHIPPING_CARRIER");
  token(value.selectedShippingMethod.methodCode,
    "SPARKFUN_SHIPPING_METHOD");
  integerString(value.selectedShippingMethod.sourceQuotedAmountMinor,
    "SPARKFUN_SHIPPING_AMOUNT");
  const allIn = integerString(value.finalTotalMinor,
    "SPARKFUN_FINAL_TOTAL_MINOR");
  exact(value.counters, SPARKFUN_COUNTER_FIELDS, "SPARKFUN_COUNTERS");
  for (const [key, counter] of Object.entries(value.counters)) {
    integer(counter, `SPARKFUN_${key.toUpperCase()}`);
  }
  const stages = dense(value.stages, 4, "SPARKFUN_STAGES");
  if (stages.length !== 4) fail("SPARKFUN_STAGE_COUNT_INVALID");
  stages.forEach(stage);
  if (new Set(stages.map((item) => item.sourceOccurrenceHash)).size !== 4) {
    fail("SPARKFUN_SOURCE_OCCURRENCE_DUPLICATE");
  }
  for (const field of ["rawPrivateInputProjected", "structuredEtaAvailable",
    "deliveryDeadlineProven", "capacityReserved",
    "providerSourceEstablishesCapacity", "paymentAuthorized",
    "paymentMethodSelected", "paymentPerformed", "orderAuthorized",
    "orderSubmitted", "userResultCommitted"]) {
    if (bool(value[field], `SPARKFUN_${field.toUpperCase()}`) !== false) {
      fail("SPARKFUN_FIXED_NON_PROMOTING_BOUNDARY_INVALID");
    }
  }
  if (bool(value.readyForPaymentAuthorization,
      "SPARKFUN_READY_FOR_PAYMENT") !== true
    || bool(value.budgetSatisfied, "SPARKFUN_BUDGET_SATISFIED")
      !== (allIn <= frozen.maximumAllInMinorUnits)
    || value.runState
      !== "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN_HOLD"
    || value.nextGate
      !== "NEEDS_STRUCTURED_ETA_AND_SEPARATE_PAYMENT_AUTHORIZATION"
    || value.counters.interactiveBrowserActionCount !== 0
    || value.counters.modelCallCount !== 0
    || value.counters.employeeTouchCount !== 0
    || value.counters.paymentEndpointAttemptCount !== 0
    || value.counters.orderEndpointAttemptCount !== 0
    || value.counters.liveHttpRequestCount
      !== value.counters.getRequestCount + value.counters.postRequestCount) {
    fail("SPARKFUN_EXECUTION_BOUNDARY_INVALID");
  }
  return deepFreeze({ projectionHash: projectionHash(value), observedAt,
    allInMinorUnits: allIn,
    sourceOccurrences: stages.map((item) => item.sourceOccurrenceHash) });
}

function targetSourceOccurrence(value, code) {
  exact(value, TARGET_OCCURRENCE_FIELDS, code);
  hash(value.occurrenceHash, `${code}_OCCURRENCE_HASH`);
  hash(value.bytesHash, `${code}_BYTES_HASH`);
  integer(value.byteLength, `${code}_BYTE_LENGTH`, 64 * 1024 * 1024);
  return value.occurrenceHash;
}

function targetProjection(value, frozen) {
  exact(value, TARGET_FIELDS, "TARGET_PROJECTION");
  if (value.schema !== "outsider/target-redsky-read-only-route-assessment/v3"
    || value.schemaVersion !== "3.0.0" || value.routeRole !== "RECOVERY_CANDIDATE"
    || value.executionClass !== "LIVE_MACHINE_HTTPS") {
    fail("TARGET_PROJECTION_IDENTITY_INVALID");
  }
  const observedAt = instant(value.observedAt, "TARGET_OBSERVED_AT");
  exact(value.predecessor, TARGET_PREDECESSOR_FIELDS, "TARGET_PREDECESSOR");
  token(value.predecessor.schema, "TARGET_PREDECESSOR_SCHEMA");
  hash(value.predecessor.projectionHash, "TARGET_PREDECESSOR_HASH");
  exact(value.frozenOutcomeAcceptance, TARGET_ACCEPTANCE_FIELDS,
    "TARGET_ACCEPTANCE");
  hash(value.frozenOutcomeAcceptance.contractRefHash,
    "TARGET_ACCEPTANCE_CONTRACT_REF_HASH");
  for (const field of ["condition", "connectorA", "connectorB"]) {
    token(value.frozenOutcomeAcceptance[field], `TARGET_${field.toUpperCase()}`);
  }
  for (const field of ["dataRequired", "fiveVoltPowerRequired"]) {
    bool(value.frozenOutcomeAcceptance[field], `TARGET_${field.toUpperCase()}`);
  }
  for (const field of ["minimumLengthMm", "maximumLengthMm", "quantity"]) {
    integer(value.frozenOutcomeAcceptance[field], `TARGET_${field.toUpperCase()}`);
  }
  exact(value.constraints, TARGET_CONSTRAINT_FIELDS, "TARGET_CONSTRAINTS");
  const maximum = integerString(value.constraints.maximumAmountMinor,
    "TARGET_MAXIMUM_AMOUNT");
  if (maximum !== frozen.maximumAllInMinorUnits
    || integer(value.constraints.quantity, "TARGET_CONSTRAINT_QUANTITY") !== 1) {
    fail("TARGET_CONSTRAINT_BINDING_INVALID");
  }
  dateOnly(value.constraints.requestedDeliveryDate,
    "TARGET_REQUESTED_DELIVERY_DATE");
  exact(value.productEvidence, TARGET_PRODUCT_EVIDENCE_FIELDS,
    "TARGET_PRODUCT_EVIDENCE");
  token(value.productEvidence.tcin, "TARGET_TCIN");
  bool(value.productEvidence.explicit5vClaim, "TARGET_EXPLICIT_5V_CLAIM");
  bool(value.productEvidence.exactAcceptanceSatisfied,
    "TARGET_EXACT_ACCEPTANCE_SATISFIED");
  const gaps = dense(value.productEvidence.acceptanceGaps, 64,
    "TARGET_ACCEPTANCE_GAPS", true);
  for (const gap of gaps) token(gap, "TARGET_ACCEPTANCE_GAP");
  token(value.productEvidence.standardShippingRouteState,
    "TARGET_STANDARD_SHIPPING_ROUTE_STATE");
  exact(value.structuredSellerEvidence, TARGET_SELLER_FIELDS,
    "TARGET_SELLER_EVIDENCE");
  token(value.structuredSellerEvidence.availabilityStatus,
    "TARGET_AVAILABILITY_STATUS");
  integer(value.structuredSellerEvidence.availableToPromiseQuantity,
    "TARGET_AVAILABLE_TO_PROMISE");
  exact(value.structuredSellerEvidence.selectedSourceService,
    TARGET_SERVICE_FIELDS, "TARGET_SOURCE_SERVICE");
  for (const field of ["shippingMethodId", "serviceLevelDescription",
    "shortDescription", "cutoff"]) {
    token(value.structuredSellerEvidence.selectedSourceService[field],
      `TARGET_SERVICE_${field.toUpperCase()}`);
  }
  const etaDate = dateOnly(
    value.structuredSellerEvidence.selectedSourceService.maxDeliveryDate,
    "TARGET_MAX_DELIVERY_DATE");
  dateOnly(value.structuredSellerEvidence.selectedSourceService.minDeliveryDate,
    "TARGET_MIN_DELIVERY_DATE");
  bool(value.structuredSellerEvidence.selectedSourceService.isBaseShippingMethod,
    "TARGET_BASE_SHIPPING_METHOD");
  bool(value.structuredSellerEvidence.selectedSourceService.isTwoDayShipping,
    "TARGET_TWO_DAY_SHIPPING");
  const partialTotal = integer(
    value.structuredSellerEvidence.itemPlusScheduledDeliveryFeeBeforeTaxMinor,
    "TARGET_PARTIAL_TOTAL", 1_000_000_000_000);
  for (const field of ["sourceAtpSatisfiesQuantity",
    "sourceDateMeetsRequestedDeadline"]) {
    bool(value.structuredSellerEvidence[field], `TARGET_${field.toUpperCase()}`);
  }
  exact(value.routeAssessment, TARGET_ASSESSMENT_FIELDS,
    "TARGET_ROUTE_ASSESSMENT");
  token(value.routeAssessment.state, "TARGET_ASSESSMENT_STATE");
  token(value.routeAssessment.reasonCode, "TARGET_ASSESSMENT_REASON");
  for (const field of TARGET_ASSESSMENT_FIELDS.slice(2)) {
    bool(value.routeAssessment[field], `TARGET_ASSESSMENT_${field.toUpperCase()}`);
  }
  if (value.routeAssessment.exactProductRequirementsSatisfied
      !== value.productEvidence.exactAcceptanceSatisfied
    || value.routeAssessment.sourceAtpSatisfiesQuantity
      !== value.structuredSellerEvidence.sourceAtpSatisfiesQuantity
    || value.routeAssessment.sourceDateMeetsRequestedDeadline
      !== value.structuredSellerEvidence.sourceDateMeetsRequestedDeadline
    || value.routeAssessment.capacityReserved !== false
    || value.routeAssessment.commitEligible !== false
    || value.routeAssessment.fullAddressAllInTotalProven !== false) {
    fail("TARGET_ASSESSMENT_CONSISTENCY_INVALID");
  }
  exact(value.sourceOccurrences, TARGET_OCCURRENCES_FIELDS,
    "TARGET_SOURCE_OCCURRENCES");
  const pdp = targetSourceOccurrence(value.sourceOccurrences.pdp,
    "TARGET_PDP_SOURCE");
  const fulfillment = targetSourceOccurrence(value.sourceOccurrences.fulfillment,
    "TARGET_FULFILLMENT_SOURCE");
  if (pdp === fulfillment) fail("TARGET_SOURCE_OCCURRENCE_DUPLICATE");
  exact(value.externalEffects, TARGET_EFFECT_FIELDS, "TARGET_EFFECTS");
  for (const [key, counter] of Object.entries(value.externalEffects)) {
    integer(counter, `TARGET_EFFECT_${key.toUpperCase()}`);
  }
  if (value.externalEffects.publicReadRequests !== 2
    || Object.entries(value.externalEffects).some(([key, counter]) =>
      key !== "publicReadRequests" && counter !== 0)) {
    fail("TARGET_EXTERNAL_EFFECT_BOUNDARY_INVALID");
  }
  exact(value.privacyBoundary, TARGET_PRIVACY_FIELDS, "TARGET_PRIVACY");
  if (Object.values(value.privacyBoundary).some((item) =>
    bool(item, "TARGET_PRIVACY_FLAG") !== false)) {
    fail("TARGET_PRIVACY_BOUNDARY_INVALID");
  }
  exact(value.boundary, TARGET_BOUNDARY_FIELDS, "TARGET_BOUNDARY");
  if (value.boundary.descendsFrom !== "outsider/target-redsky-read-only-live/v2"
    || value.boundary.provider !== "TARGET_REDSKY_PUBLIC_WEB"
    || value.boundary.transport !== "MACHINE_HTTPS"
    || value.boundary.routeRole !== "RECOVERY_CANDIDATE"
    || !Array.isArray(value.boundary.permittedHttpMethods)
    || value.boundary.permittedHttpMethods.length !== 1
    || value.boundary.permittedHttpMethods[0] !== "GET"
    || value.boundary.publicPdpGetCount !== 1
    || value.boundary.publicFulfillmentGetCount !== 1
    || TARGET_BOUNDARY_FIELDS.slice(7).some((field) =>
      bool(value.boundary[field], `TARGET_BOUNDARY_${field.toUpperCase()}`)
        !== false)) {
    fail("TARGET_FIXED_BOUNDARY_INVALID");
  }
  return deepFreeze({ projectionHash: projectionHash(value), observedAt,
    specificationMatches:
      value.routeAssessment.exactProductRequirementsSatisfied,
    partialTotalMinorUnits: partialTotal,
    estimatedCompletionAt: `${etaDate}T23:59:59.999Z`,
    sourceOccurrences: [pdp, fulfillment] });
}

function evidenceStream(binding, frozen, mapped) {
  let previousEventHash = OUTSIDER_RECOVERY_CANDIDATE_EVIDENCE_GENESIS_V1;
  const replayReceipt = digest(
    "outsider/real-route-public-projection-local-replay-receipt/v1", {
      schema: binding.projection.schema,
      projectionHash: mapped.projectionHash,
    });
  const kinds = binding.routeKind === "SPARKFUN_PUBLIC_PROJECTION_V1"
    ? [
      ["SPECIFICATION", mapped.sourceOccurrences[0], {
        frozenPredicateHash: frozen.acceptancePredicateHash,
        evaluationRefHash: digest(
          "outsider/sparkfun-projection-specification-evaluation/v1", {
            projectionHash: mapped.projectionHash,
            outcomeIntentRefHash: binding.projection.outcomeIntentRefHash,
            runState: binding.projection.runState,
          }),
        status: "MATCH",
      }],
      ["ALL_IN_PRICE", mapped.sourceOccurrences[3], {
        constraintRefHash: frozen.maximumLossConstraintHash,
        currency: frozen.currency,
        allInMinorUnits: mapped.allInMinorUnits,
        includesItemTaxShippingAndFees: true,
        status: "COMPLETE",
      }],
      ["ETA", mapped.sourceOccurrences[3], {
        completionDeadline: frozen.completionDeadline,
        estimatedCompletionAt: null,
        status: "UNAVAILABLE",
      }],
      ["CAPACITY", mapped.sourceOccurrences[3], {
        capacityLifecycleRefHash: null,
        capacityLifecycleHeadHash: null,
        reservedFrom: null,
        reservedUntil: null,
        status: "UNRESERVED",
        sourceClass: "UNVERIFIED",
      }],
    ] : [
      ["SPECIFICATION", mapped.sourceOccurrences[0], {
        frozenPredicateHash: frozen.acceptancePredicateHash,
        evaluationRefHash: digest(
          "outsider/target-v3-projection-specification-evaluation/v1", {
            projectionHash: mapped.projectionHash,
            frozenOutcomeAcceptance: binding.projection.frozenOutcomeAcceptance,
            exactProductRequirementsSatisfied: mapped.specificationMatches,
          }),
        status: mapped.specificationMatches ? "MATCH" : "MISMATCH",
      }],
      ["ALL_IN_PRICE", mapped.sourceOccurrences[1], {
        constraintRefHash: frozen.maximumLossConstraintHash,
        currency: frozen.currency,
        allInMinorUnits: mapped.partialTotalMinorUnits,
        includesItemTaxShippingAndFees: false,
        status: "PARTIAL",
      }],
      ["ETA", mapped.sourceOccurrences[1], {
        completionDeadline: frozen.completionDeadline,
        estimatedCompletionAt: mapped.estimatedCompletionAt,
        status: "STRUCTURED",
      }],
      ["CAPACITY", mapped.sourceOccurrences[1], {
        capacityLifecycleRefHash: null,
        capacityLifecycleHeadHash: null,
        reservedFrom: null,
        reservedUntil: null,
        status: "UNRESERVED",
        sourceClass: "SELLER_SERVER_ACK_ONLY",
      }],
    ];
  return kinds.map(([evidenceKind, sourceOccurrenceRefHash, payload], index) => {
    const event = createRecoveryCandidateEvidenceEventV1({
      routeProposalRefHash: mapped.projectionHash,
      recoveryOptionRefHash: binding.recoveryOptionRefHash,
      ordinal: index + 1,
      previousEventHash,
      observedAt: mapped.observedAt,
      validUntil: binding.evidenceValidUntil,
      evidenceKind,
      evidenceOccurrenceRefHash: digest(
        "outsider/real-route-projection-evidence-occurrence/v1", {
          projectionHash: mapped.projectionHash,
          evidenceKind,
          ordinal: index + 1,
        }),
      sourceOccurrenceRefHash,
      sourceArtifactHash: mapped.projectionHash,
      sourceReplayReceiptHash: replayReceipt,
      payload,
    });
    previousEventHash = event.eventHash;
    return event;
  });
}

/** Map one verified public projection without performing any external I/O. */
export function mapRealRouteProjectionToRecoveryCandidateV1(route = {},
  frozenConstraints = {}) {
  exact(route, ROUTE_FIELDS, "ROUTE");
  const frozen = constraints(frozenConstraints);
  if (!OUTSIDER_REAL_ROUTE_PROJECTION_ADMISSION_BRIDGE_V1_ROUTE_KINDS
    .includes(route.routeKind)) fail("ROUTE_KIND_INVALID");
  const normalized = {
    routeKind: route.routeKind,
    occurrenceRefHash: hash(route.occurrenceRefHash, "OCCURRENCE_REF_HASH"),
    recoveryOptionRefHash: hash(route.recoveryOptionRefHash,
      "RECOVERY_OPTION_REF_HASH"),
    evidenceValidUntil: instant(route.evidenceValidUntil,
      "EVIDENCE_VALID_UNTIL"),
    projection: route.projection,
  };
  const mapped = route.routeKind === "SPARKFUN_PUBLIC_PROJECTION_V1"
    ? sparkFunProjection(route.projection, frozen)
    : targetProjection(route.projection, frozen);
  if (Date.parse(mapped.observedAt) >= Date.parse(normalized.evidenceValidUntil)) {
    fail("PROJECTION_EVIDENCE_VALIDITY_INVALID");
  }
  return deepFreeze({
    routeProposalRefHash: mapped.projectionHash,
    occurrenceRefHash: normalized.occurrenceRefHash,
    recoveryOptionRefHash: normalized.recoveryOptionRefHash,
    evidenceEvents: evidenceStream(normalized, frozen, mapped),
  });
}

/** Map all routes and pass them through the existing source-replayed hard gate. */
export function selectRealRouteProjectionRecoveryCandidatesV1(input = {}) {
  exact(input, INPUT_FIELDS, "INPUT");
  const routes = dense(input.routes, MAX_ROUTES, "ROUTES");
  const candidates = routes.map((route) =>
    mapRealRouteProjectionToRecoveryCandidateV1(route,
      input.frozenConstraints));
  return selectRecoveryPortfolioCandidatesV1({
    outcomeLifecycleEvents: input.outcomeLifecycleEvents,
    routeProposalRegistryEvents: input.routeProposalRegistryEvents,
    recoveryPortfolio: input.recoveryPortfolio,
    evaluatedAt: input.evaluatedAt,
    frozenConstraints: input.frozenConstraints,
    candidates,
  });
}
