/*
 * First physical-outcome production composition v1.
 *
 * This is an order-scoped composition, not a provider registry. It binds one
 * compiled OutcomeProgram/routing request to two buyer-native transaction
 * surfaces and an injected witness-readiness source. Formation may create
 * isolated guest carts and estimate a postal destination. It cannot reserve
 * stock, submit checkout, pay, place an order, or claim delivery.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync,
  readFileSync, statSync, writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  createAtomicBuyerNativeTemporaryNetworkCoordinatorV1,
  issueCurrentUserTransactionAuthorityV1,
  pinAtomicBuyerNativeFrozenArtifactV1,
} from "./outsider-atomic-buyer-native-temporary-network-coordinator-v1.js";
import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
  issueBuyerNativeTransactionAccountCapabilityV1,
} from "./outsider-buyer-native-transaction-capability-v1.js";
import {
  createAdafruitGuestShopperCommandBytesV1,
  issueAdafruitGuestShopperBuyerNativeCapabilityV1,
} from "./outsider-adafruit-guest-shopper-adapter-v1.js";
import {
  createOrderScopedBuyerNativeHttpsTransportV1,
} from "./outsider-order-scoped-buyer-native-https-transport-v1.js";
import { compileOutcomeProgramV1 }
  from "./outsider-outcome-program-v1.js";
import { createOutsiderOutcomeProductRuntimeV2 }
  from "./outsider-outcome-product-runtime-v2.js";
import {
  createSparkFunMagentoDestinationQuoteCommandBytesV1,
  issueSparkFunMagentoDestinationQuoteCapabilityV1,
  issueSparkFunPrivatePostalDestinationQuoteGrantV1,
} from "./outsider-sparkfun-magento-destination-quote-stage-v1.js";
import {
  createSparkFunMagentoGuestCartCommandBytesV1,
  issueSparkFunMagentoGuestCartBuyerNativeCapabilityV1,
} from "./outsider-sparkfun-magento-guest-cart-adapter-v1.js";
import {
  createTargetRedskyCandidateCommandBytesV1,
  issueTargetRedskyCandidateBuyerNativeCapabilityV1,
  normalizeTargetRedskyFulfillmentSourceV1,
  normalizeTargetRedskyPdpSourceV1,
} from "./outsider-target-redsky-candidate-route-v1.js";
import {
  createBestBuyBuyerNativeCandidateCommandBytesV1,
  issueBestBuyBuyerNativeCandidateCapabilityV1,
  normalizeBestBuyCartSourceV1,
  normalizeBestBuyGuestCheckoutSourceV1,
  normalizeBestBuyProductSourceV1,
} from "./outsider-bestbuy-buyer-native-candidate-route-v1.js";

const PREFIX = "OUTSIDER_FIRST_PHYSICAL_OUTCOME_PRODUCTION_COMPOSITION_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

export const OUTSIDER_FIRST_PHYSICAL_OUTCOME_PRODUCTION_COMPOSITION_V1_SCHEMA
  = "outsider/first-physical-outcome-production-composition/v1";

export const OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1
  = "Deliver one new USB-A male to USB-C male cable, 0.9–1.1 m, capable of data and 5 V power, quantity 1, to the authorized destination by the completion deadline.";

export const OUTSIDER_FIRST_PHYSICAL_OUTCOME_DESTINATION_INPUT_V1
  = Object.freeze({
    schema: "outsider/postal-destination-quote-input/v1",
    requiredFields: Object.freeze([
      Object.freeze({ name: "countryCode", format: "ISO_3166_1_ALPHA_2" }),
      Object.freeze({ name: "postalCode", format: "POSTAL_CODE" }),
    ]),
    optionalFields: Object.freeze([
      Object.freeze({ name: "region", format: "REGION_NAME" }),
      Object.freeze({ name: "regionId", format: "PROVIDER_REGION_ID" }),
      Object.freeze({ name: "city", format: "CITY_NAME" }),
    ]),
    permittedUse: "SHIPPING_RATE_AND_LANDED_TOTAL_ESTIMATE_ONLY",
    fullStreetAddressRequested: false,
    contactEmailRequested: false,
    paymentAuthorized: false,
    orderAuthorized: false,
  });

export const OUTSIDER_FIRST_PHYSICAL_OUTCOME_FULL_DELIVERY_INPUT_V1
  = Object.freeze({
    schema: "outsider/full-delivery-formation-input/v1",
    requiredFields: Object.freeze([
      "contactEmail", "recipientName", "streetAddress", "city", "region",
      "postalCode", "countryCode",
    ]),
    permittedUse: "DELIVERABILITY_TAX_AND_DEADLINE_FORMATION_ONLY",
    paymentAuthorized: false,
    orderAuthorized: false,
  });

export const OUTSIDER_FIRST_PHYSICAL_OUTCOME_PRODUCTION_COMPOSITION_V1_BOUNDARY
  = Object.freeze({
    orderScopedCandidateBinding: true,
    globalProviderRegistryRequired: false,
    buyerNativeTransportUsed: true,
    providerRepliesRequired: false,
    sellerMessagesSent: false,
    cartReadyCountsAsReservation: false,
    postalQuoteCountsAsReservation: false,
    parallelCandidateSignalsMayAlterAtomicCommit: false,
    targetRedskyCandidateIsSelectedRoute: false,
    targetRedskyCandidateCanMutateCart: false,
    targetCandidateLocalityResolvedByInjectedOrderScopedBinding: true,
    targetCandidateLocalityHardcodedInCoreComposition: false,
    bestBuyCandidateBindingAndSourceReaderInjectedPerOrder: true,
    bestBuyCandidateSkuOrLocalityHardcodedInCoreComposition: false,
    bestBuySurplusRequiresSeparateUserAuthorization: true,
    paymentImplemented: false,
    orderSubmissionImplemented: false,
    independentWitnessReadinessInjected: true,
    witnessReadinessEstablishesOutcomeTruth: false,
    humanQueuePermitted: false,
    outsiderStaffTouchLimit: 0,
    authority: "FORMATION_ONLY",
    decisionState: "HOLD",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function addMs(instantValue, milliseconds) {
  return new Date(Date.parse(instantValue) + milliseconds).toISOString();
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = statSync(directory);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) {
    fail("PRIVATE_DIRECTORY_INVALID");
  }
}

function foundationFile(directory, requestId) {
  return path.join(directory,
    `${createHash("sha256").update(requestId, "utf8").digest("hex")}.json`);
}

function readPrivateCanonicalRecord(file, code) {
  if (!existsSync(file)) return null;
  const info = statSync(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0) fail(`${code}_NOT_PRIVATE`);
  const bytes = readFileSync(file);
  if (bytes.length < 3 || bytes.at(-1) !== 0x0a) fail(`${code}_PARTIAL`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_INVALID`); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail(`${code}_NOT_CANONICAL`);
  }
  return deepFreeze(value);
}

function persistFoundationCompilation(directory, requestId, value) {
  const file = foundationFile(directory, requestId);
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  if (existsSync(file)) {
    const existing = readFileSync(file);
    if (!existing.equals(bytes)) fail("FOUNDATION_COMPILATION_REPLAY_MISMATCH");
    return;
  }
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

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function appendPrivateCartState(directory, key, kind, value) {
  hash(key, "PRIVATE_CART_STATE_KEY");
  const file = path.join(directory, `${key.slice(7)}.jsonl`);
  const existing = readPrivateCartLog(file);
  const sequence = existing.records.length + 1;
  const body = {
    schema: "outsider/private-cart-state-event/v1",
    schemaVersion: "1.0.0",
    sequence,
    previousEventHash: existing.headHash,
    kind,
    value,
  };
  const event = { ...body, eventHash: digest(body.schema, body) };
  let descriptor;
  try {
    descriptor = openSync(file, "a", 0o600);
    chmodSync(file, 0o600);
    writeAll(descriptor, Buffer.from(`${canonicalizeStrict(event)}\n`, "utf8"));
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

function readPrivateCartLog(file) {
  if (!existsSync(file)) return { records: [], headHash: null, value: null };
  const info = statSync(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0) {
    fail("PRIVATE_CART_STATE_NOT_PRIVATE");
  }
  const source = readFileSync(file, "utf8");
  if (!source.endsWith("\n")) fail("PRIVATE_CART_STATE_TRUNCATED");
  const records = source.slice(0, -1).split("\n").map((line) => {
    let value;
    try { value = JSON.parse(line); } catch { fail("PRIVATE_CART_STATE_INVALID"); }
    if (canonicalizeStrict(value) !== line) fail("PRIVATE_CART_STATE_NOT_CANONICAL");
    return value;
  });
  let previous = null;
  let current = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const { eventHash, ...body } = record;
    if (record.sequence !== index + 1 || record.previousEventHash !== previous
      || !["SET", "CLEAR"].includes(record.kind)
      || eventHash !== digest(record.schema, body)) {
      fail("PRIVATE_CART_STATE_CHAIN_INVALID");
    }
    previous = eventHash;
    current = record.kind === "SET" ? record.value : null;
  }
  return { records, headHash: previous, value: current };
}

function createPrivateCartStore(directory) {
  ensurePrivateDirectory(directory);
  return Object.freeze({
    async load(key) {
      hash(key, "PRIVATE_CART_STATE_KEY");
      const file = path.join(directory, `${key.slice(7)}.jsonl`);
      const value = readPrivateCartLog(file).value;
      return value === null ? null : JSON.parse(canonicalizeStrict(value));
    },
    async store(key, value) {
      canonicalizeStrict(value);
      appendPrivateCartState(directory, key, "SET", value);
    },
    async clear(key) {
      appendPrivateCartState(directory, key, "CLEAR", null);
    },
  });
}

function requestPrivateDirectory(root, requestId) {
  return path.join(root,
    digest("outsider/physical-request-directory/v1", requestId).slice(7));
}

function destinationStateLocation(requestDirectory, requestId) {
  const stateDirectory = path.join(requestDirectory,
    "destination-formation-state");
  const key = digest("outsider/destination-formation-state/v1", requestId);
  return { stateDirectory, key,
    file: path.join(stateDirectory, `${key.slice(7)}.jsonl`) };
}

function persistDestinationState(requestDirectory, requestId, value) {
  const location = destinationStateLocation(requestDirectory, requestId);
  ensurePrivateDirectory(location.stateDirectory);
  const current = readPrivateCartLog(location.file).value;
  if (current !== null
    && canonicalizeStrict(current) === canonicalizeStrict(value)) return;
  appendPrivateCartState(location.stateDirectory, location.key, "SET", value);
}

function loadDestinationState(requestDirectory, requestId) {
  const location = destinationStateLocation(requestDirectory, requestId);
  if (!existsSync(location.file)) return null;
  return readPrivateCartLog(location.file).value;
}

function targetCandidateStateLocation(requestDirectory, requestId) {
  const stateDirectory = path.join(requestDirectory, "target-candidate-state");
  const key = digest("outsider/target-candidate-state/v1", requestId);
  return { stateDirectory, key,
    file: path.join(stateDirectory, `${key.slice(7)}.jsonl`) };
}

function persistTargetCandidateState(requestDirectory, requestId, value) {
  const location = targetCandidateStateLocation(requestDirectory, requestId);
  ensurePrivateDirectory(location.stateDirectory);
  const current = readPrivateCartLog(location.file).value;
  if (current !== null
    && canonicalizeStrict(current) === canonicalizeStrict(value)) return;
  appendPrivateCartState(location.stateDirectory, location.key, "SET", value);
}

function loadTargetCandidateState(requestDirectory, requestId) {
  const location = targetCandidateStateLocation(requestDirectory, requestId);
  if (!existsSync(location.file)) return null;
  return readPrivateCartLog(location.file).value;
}

function bestBuyCandidateStateLocation(requestDirectory, requestId) {
  const stateDirectory = path.join(requestDirectory,
    "bestbuy-candidate-state");
  const key = digest("outsider/bestbuy-candidate-state/v1", requestId);
  return { stateDirectory, key,
    file: path.join(stateDirectory, `${key.slice(7)}.jsonl`) };
}

function persistBestBuyCandidateState(requestDirectory, requestId, value) {
  const location = bestBuyCandidateStateLocation(requestDirectory, requestId);
  ensurePrivateDirectory(location.stateDirectory);
  const current = readPrivateCartLog(location.file).value;
  if (current !== null
    && canonicalizeStrict(current) === canonicalizeStrict(value)) return;
  appendPrivateCartState(location.stateDirectory, location.key, "SET", value);
}

function loadBestBuyCandidateState(requestDirectory, requestId) {
  const location = bestBuyCandidateStateLocation(requestDirectory, requestId);
  if (!existsSync(location.file)) return null;
  return readPrivateCartLog(location.file).value;
}

function defaultFoundationCompilation(request, formationDeadline,
  cleanupDeadline) {
  const frozenOutcomeBody = {
    schema: "outsider/first-physical-outcome/v1",
    statement: request.goal,
    product: {
      quantity: 1,
      connectorA: "USB_A_MALE",
      connectorB: "USB_C_MALE",
      lengthMeters: { minimum: 0.9, maximum: 1.1 },
      functions: ["DATA", "5V_POWER"],
      condition: "NEW",
    },
    budget: request.budget,
    completionDeadline: request.completionDeadline,
  };
  const frozenOutcome = deepFreeze({ ...frozenOutcomeBody,
    outcomeHash: digest(frozenOutcomeBody.schema, frozenOutcomeBody) });
  const tender = deepFreeze({
    schema: "outsider/first-physical-outcome-one-use-tender/v1",
    outcome: frozenOutcome,
    requiredRoles: ["PRIMARY", "RECOVERY", "INDEPENDENT_WITNESS"],
    zeroInternalOps: { staffTouchLimit: 0, humanQueueFallback: false },
  });
  const tenderHash = pinAtomicBuyerNativeFrozenArtifactV1("TENDER", tender);
  const program = compileOutcomeProgramV1({
    programId: `physical_${request.requestId}`,
    orderId: request.requestId,
    createdAt: request.requestedAt,
    formationDeadline,
    completionDeadline: request.completionDeadline,
    tenderHash,
    outcome: {
      statement: request.goal,
      acceptance: [
        { criterionId: "exact_item", comparator: "ALL_FIELDS_EQUAL",
          subject: "delivered item identity, quantity and condition",
          expected: frozenOutcome.product },
        { criterionId: "delivered_by_deadline", comparator: "AT_OR_BEFORE",
          subject: "independently observed delivery time",
          expected: request.completionDeadline },
        { criterionId: "recipient_observation", comparator: "PASS",
          subject: "independent recipient inspection of data and 5 V power",
          expected: true },
      ],
      budget: request.budget,
    },
    requirements: [
      { requirementId: "primary_purchase", role: "PRIMARY",
        capability: "PURCHASE_AND_DELIVER_MATCHING_ITEM",
        constraints: { product: frozenOutcome.product,
          frozenOutcomeHash: frozenOutcome.outcomeHash,
          completionDeadline: request.completionDeadline },
        minimumReservationMs: 60_000, dependsOnRequirementIds: [] },
      { requirementId: "recovery_purchase", role: "RECOVERY",
        capability: "ALTERNATE_PURCHASE_AND_DELIVERY_ROUTE",
        constraints: { product: frozenOutcome.product,
          frozenOutcomeHash: frozenOutcome.outcomeHash,
          distinctSellerFrom: "primary_purchase" },
        minimumReservationMs: 60_000, dependsOnRequirementIds: [] },
      { requirementId: "independent_delivery_witness",
        role: "INDEPENDENT_WITNESS",
        capability: "INDEPENDENT_DELIVERY_AND_ITEM_OBSERVATION",
        constraints: { criteria: ["exact_item", "delivered_by_deadline",
          "recipient_observation"], providerSelfReportSufficient: false,
          frozenOutcomeHash: frozenOutcome.outcomeHash },
        minimumReservationMs: 60_000,
        dependsOnRequirementIds: ["primary_purchase", "recovery_purchase"] },
    ],
    nodes: [
      { nodeId: "form_transaction_network", kind: "CHECKPOINT", dependsOn: [],
        primaryRequirementId: "primary_purchase",
        recoveryRequirementId: "recovery_purchase",
        witnessRequirementId: "independent_delivery_witness",
        input: { requireExactLandedTerms: true }, acceptance: [] },
      { nodeId: "deliver_item", kind: "EFFECT",
        dependsOn: ["form_transaction_network"],
        primaryRequirementId: "primary_purchase",
        recoveryRequirementId: "recovery_purchase",
        witnessRequirementId: "independent_delivery_witness",
        input: { quantity: 1 },
        acceptance: ["exact_item", "delivered_by_deadline"] },
      { nodeId: "observe_and_close", kind: "OBSERVATION",
        dependsOn: ["deliver_item"], primaryRequirementId: null,
        recoveryRequirementId: null,
        witnessRequirementId: "independent_delivery_witness",
        input: { providerSelfReportSufficient: false },
        acceptance: ["recipient_observation"] },
    ],
    obligations: [
      { obligationId: "cancel_unused_primary", trigger: "ON_FAILURE",
        targetRequirementId: "primary_purchase", nodeId: "deliver_item",
        action: "CANCEL_OR_RETURN_PRIMARY", input: {},
        deadline: cleanupDeadline },
      { obligationId: "cancel_unused_recovery", trigger: "ALWAYS",
        targetRequirementId: "recovery_purchase", nodeId: "deliver_item",
        action: "CANCEL_UNUSED_RECOVERY", input: {}, deadline: cleanupDeadline },
      { obligationId: "close_witness", trigger: "ALWAYS",
        targetRequirementId: "independent_delivery_witness",
        nodeId: "observe_and_close", action: "CLOSE_WITNESS_WINDOW",
        input: {}, deadline: cleanupDeadline },
    ],
    zeroInternalOps: { staffTouchLimit: 0, humanQueueFallback: false },
  });
  const candidateRoutingRequest = deepFreeze({
    schema: "outsider/candidate-routing-request/v1",
    programHash: program.programHash,
    jobs: program.requirements.map((requirement) => ({
      routeRole: requirement.role,
      programRequirementId: requirement.requirementId,
      tenderRequirementKind: requirement.role === "INDEPENDENT_WITNESS"
        ? "EVIDENCE" : requirement.role === "RECOVERY" ? "RECOVERY" : "RESOURCE",
      tenderRequirementId: requirement.requirementId,
      capability: requirement.capability,
      constraints: requirement.constraints,
      queryTerms: [],
      routeKinds: ["BUYER_NATIVE"],
      maximumCandidates: 8,
    })),
  });
  const formationRequirementSlots = program.requirements.map((requirement) => ({
    routeRole: requirement.role,
    programRequirementId: requirement.requirementId,
    tenderRequirementKind: requirement.role === "INDEPENDENT_WITNESS"
      ? "EVIDENCE" : requirement.role === "RECOVERY" ? "RECOVERY" : "RESOURCE",
    tenderRequirementId: requirement.requirementId,
    capability: requirement.capability,
    constraints: requirement.constraints,
    minimumReservationMs: requirement.minimumReservationMs,
  }));
  const formationRequirementsBody = {
    schema: "outsider/outcome-product-formation-requirements/v1",
    programHash: program.programHash,
    slots: formationRequirementSlots,
  };
  const formationRequirements = deepFreeze({ ...formationRequirementsBody,
    formationRequirementsHash: digest(formationRequirementsBody.schema,
      formationRequirementsBody) });
  return deepFreeze({ frozenOutcome, tender, program,
    formationRequirements, candidateRoutingRequest });
}

export function validateFirstPhysicalOutcomeFoundationCompilationV1(value,
  request) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || value.program?.programHash === undefined
    || value.program.orderId !== request.requestId
    || value.program.outcome?.statement !== request.goal
    || value.program.completionDeadline !== request.completionDeadline
    || value.program.outcome?.budget?.currency !== request.budget.currency
    || value.program.outcome?.budget?.maximumAmountMinor
      !== request.budget.maximumAmountMinor
    || value.frozenOutcome === undefined || value.tender === undefined
    || !Object.isFrozen(value.frozenOutcome) || !Object.isFrozen(value.tender)
    || value.frozenOutcome.statement !== request.goal
    || value.frozenOutcome.completionDeadline !== request.completionDeadline
    || !Array.isArray(value.candidateRoutingRequest?.jobs)
    || value.candidateRoutingRequest.programHash !== value.program.programHash) {
    fail("FOUNDATION_COMPILATION_INVALID");
  }
  if (value.program.tenderHash !== null && value.tender?.tenderHash !== undefined
    && value.program.tenderHash !== value.tender.tenderHash) {
    fail("FOUNDATION_TENDER_PROGRAM_BINDING_INVALID");
  }
  const programRequirements = new Map(value.program.requirements.map((item) =>
    [item.requirementId, item]));
  const expectedCapabilities = new Map([
    ["PRIMARY", "PURCHASE_AND_DELIVER_MATCHING_ITEM"],
    ["RECOVERY", "ALTERNATE_PURCHASE_AND_DELIVERY_ROUTE"],
    ["INDEPENDENT_WITNESS", "INDEPENDENT_DELIVERY_AND_ITEM_OBSERVATION"],
  ]);
  for (const requirement of programRequirements.values()) {
    if (requirement.capability !== expectedCapabilities.get(requirement.role)
      || (value.frozenOutcome.outcomeHash !== undefined
        && requirement.constraints?.frozenOutcomeHash
          !== value.frozenOutcome.outcomeHash)) {
      fail("FOUNDATION_NOT_BOUND_TO_FIXED_PHYSICAL_ROUTES");
    }
  }
  const roles = new Set(value.candidateRoutingRequest.jobs.map((job) =>
    job.routeRole));
  for (const role of ["PRIMARY", "RECOVERY", "INDEPENDENT_WITNESS"]) {
    if (!roles.has(role)) fail("FOUNDATION_ROUTING_ROLE_MISSING");
  }
  for (const job of value.candidateRoutingRequest.jobs) {
    const requirement = programRequirements.get(job.programRequirementId);
    if (requirement === undefined || requirement.role !== job.routeRole
      || requirement.capability !== job.capability) {
      fail("FOUNDATION_ROUTING_PROGRAM_BINDING_INVALID");
    }
  }
  const slots = value.formationRequirements?.slots;
  if (!Array.isArray(slots) || slots.length < 3
    || value.formationRequirements.programHash !== value.program.programHash) {
    fail("FOUNDATION_FORMATION_REQUIREMENTS_INVALID");
  }
  for (const slot of slots) {
    const requirement = programRequirements.get(slot.programRequirementId);
    if (requirement === undefined || requirement.role !== slot.routeRole
      || requirement.capability !== slot.capability) {
      fail("FOUNDATION_REQUIREMENT_PROGRAM_BINDING_INVALID");
    }
  }
  canonicalizeStrict(value.program);
  canonicalizeStrict(value.candidateRoutingRequest);
  return value;
}

function witnessCapability(metadata, requestImpl, revalidateImpl,
  sourceOccurrenceSink) {
  return issueBuyerNativeTransactionAccountCapabilityV1(metadata, {
    revalidateImpl,
    sourceOccurrenceSink,
    async requestImpl(request) {
      const response = await requestImpl(request);
      if (response === null || typeof response !== "object") {
        fail("WITNESS_READINESS_RESPONSE_INVALID");
      }
      return response;
    },
  });
}

function routePlan(role, commandBytes) {
  const witness = role === "INDEPENDENT_WITNESS";
  return {
    quoteBytes: commandBytes,
    holdBytes: witness ? null : commandBytes,
    readinessStatusBytes: commandBytes,
    reserveBytes: commandBytes,
    commitBytes: role === "PRIMARY" ? commandBytes : null,
    executionStatusBytes: witness ? null : commandBytes,
    cancelBytes: commandBytes,
    recoverBytes: role === "RECOVERY" ? commandBytes : null,
  };
}

function routeTransactionHash(networkId, role) {
  return digest("outsider/atomic-network-transaction/v1", { networkId, role });
}

function destinationSummary(receipt, result) {
  return Object.freeze({
    sourceOccurrenceHash: result.publicProjection.sourceOccurrenceHash,
    sourceBytesHash: result.publicProjection.sourceBytesHash,
    lifecycleState: receipt.lifecycleState,
    nextGate: receipt.nextGate,
    normalized: receipt.normalized,
    capacityReserved: false,
    deliveryDeadlineProven: false,
    paymentPerformed: false,
    orderSubmitted: false,
  });
}

/**
 * Bind one physical order to two selected transaction candidates. The
 * optional compileFoundation dependency is the direct seam for the model /
 * compute / data integrator; its verified bundle is consumed without a
 * provider name or URL being added to the routing request.
 */
export function createFirstPhysicalOutcomeProductionCompositionV1(input = {},
  dependencies = {}) {
  exact(input, ["directory", "formationWindowMs", "cleanupWindowMs"],
    "INPUT");
  const requiredDependencies = ["clock", "fetchImpl", "compileFoundation",
    "resolveRouteRequests", "revalidateTransactionAuthority",
    "witnessReadinessImpl", "selectShippingRate"];
  const allowedDependencies = new Set([...requiredDependencies,
    "formationEventSink", "buyerNativeSourceOccurrenceSink",
    "resolveTargetCandidateBinding", "resolveBestBuyCandidateBinding",
    "bestBuyCandidateSourceRead"]);
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies) || Buffer.isBuffer(dependencies)
    || requiredDependencies.some((field) =>
      !Object.hasOwn(dependencies, field))
    || Reflect.ownKeys(dependencies).some((field) =>
      !allowedDependencies.has(field))) fail("DEPENDENCIES_FIELDS_INVALID");
  if (typeof input.directory !== "string" || input.directory.length < 1
    || !Number.isSafeInteger(input.formationWindowMs)
    || input.formationWindowMs < 1_000
    || !Number.isSafeInteger(input.cleanupWindowMs)
    || input.cleanupWindowMs < 1_000
    || typeof dependencies.clock !== "function"
    || typeof dependencies.fetchImpl !== "function"
    || (dependencies.compileFoundation !== null
      && typeof dependencies.compileFoundation !== "function")
    || (dependencies.resolveRouteRequests !== null
      && typeof dependencies.resolveRouteRequests !== "function")
    || typeof dependencies.revalidateTransactionAuthority !== "function"
    || typeof dependencies.witnessReadinessImpl !== "function"
    || (dependencies.selectShippingRate !== null
      && typeof dependencies.selectShippingRate !== "function")
    || (dependencies.resolveTargetCandidateBinding !== undefined
      && dependencies.resolveTargetCandidateBinding !== null
      && typeof dependencies.resolveTargetCandidateBinding !== "function")
    || (dependencies.resolveBestBuyCandidateBinding !== undefined
      && dependencies.resolveBestBuyCandidateBinding !== null
      && typeof dependencies.resolveBestBuyCandidateBinding !== "function")
    || (dependencies.bestBuyCandidateSourceRead !== undefined
      && dependencies.bestBuyCandidateSourceRead !== null
      && typeof dependencies.bestBuyCandidateSourceRead !== "function")
    || ((dependencies.resolveBestBuyCandidateBinding === null
      || dependencies.resolveBestBuyCandidateBinding === undefined)
      !== (dependencies.bestBuyCandidateSourceRead === null
        || dependencies.bestBuyCandidateSourceRead === undefined))
    || (dependencies.formationEventSink !== undefined
      && dependencies.formationEventSink !== null
      && typeof dependencies.formationEventSink !== "function")
    || (dependencies.buyerNativeSourceOccurrenceSink !== undefined
      && dependencies.buyerNativeSourceOccurrenceSink !== null
      && typeof dependencies.buyerNativeSourceOccurrenceSink !== "function")) {
    fail("CONFIG_INVALID");
  }
  const directory = path.resolve(input.directory);
  ensurePrivateDirectory(directory);
  const foundationDirectory = path.join(directory, "foundation-compilation");
  ensurePrivateDirectory(foundationDirectory);
  const bundles = new Map();
  const privateInputs = new Map();
  const contexts = new Map();

  function now() { return instant(dependencies.clock(), "CLOCK"); }

  async function compileGoal(request) {
    if (request.goal !== OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1) {
      fail("GOAL_NOT_APPROVED_FIRST_PHYSICAL_MILESTONE");
    }
    const persisted = readPrivateCanonicalRecord(
      foundationFile(foundationDirectory, request.requestId),
      "FOUNDATION_COMPILATION");
    if (persisted !== null) {
      const bundle = validateFirstPhysicalOutcomeFoundationCompilationV1(
        persisted, request);
      bundles.set(request.requestId, bundle);
      return bundle.program;
    }
    const formationDeadlineCandidate = addMs(request.requestedAt,
      input.formationWindowMs);
    const formationDeadline = Date.parse(formationDeadlineCandidate)
      < Date.parse(request.completionDeadline)
      ? formationDeadlineCandidate
      : addMs(request.completionDeadline, -1);
    if (Date.parse(formationDeadline) <= Date.parse(request.requestedAt)) {
      fail("FORMATION_WINDOW_UNAVAILABLE");
    }
    const cleanupDeadline = addMs(request.completionDeadline,
      input.cleanupWindowMs);
    const bundle = validateFirstPhysicalOutcomeFoundationCompilationV1(
      dependencies.compileFoundation === null
        ? defaultFoundationCompilation(request, formationDeadline,
          cleanupDeadline)
        : await dependencies.compileFoundation(request), request);
    bundles.set(request.requestId, bundle);
    persistFoundationCompilation(foundationDirectory, request.requestId,
      bundle);
    return bundle.program;
  }

  async function makeContext(request, program) {
    const privateInput = privateInputs.get(request.requestId);
    if (privateInput === undefined) fail("PRIVATE_FORMATION_INPUT_MISSING");
    const loadedBundle = bundles.get(request.requestId)
      ?? readPrivateCanonicalRecord(foundationFile(foundationDirectory,
        request.requestId), "FOUNDATION_COMPILATION");
    if (loadedBundle === null || loadedBundle === undefined
      || loadedBundle.program.programHash !== program.programHash) {
      fail("FOUNDATION_COMPILATION_NOT_BOUND");
    }
    const bundle = validateFirstPhysicalOutcomeFoundationCompilationV1(
      loadedBundle, request);
    bundles.set(request.requestId, bundle);
    const requestDirectory = requestPrivateDirectory(directory,
      request.requestId);
    ensurePrivateDirectory(requestDirectory);
    const networkId = `network_${digest("outsider/physical-network/v1", {
      requestId: request.requestId, programHash: program.programHash,
    }).slice(7, 39)}`;
    const outcomeHash = pinAtomicBuyerNativeFrozenArtifactV1("OUTCOME",
      bundle.frozenOutcome);
    const tenderHash = pinAtomicBuyerNativeFrozenArtifactV1("TENDER",
      bundle.tender);
    /* The generic foundation compiler's tenderHash uses the Outcome Tender
       domain. The atomic coordinator intentionally creates its own pin over
       the same frozen tender, so these two domain-separated hashes need not
       be byte-equal. */
    const proof = privateInput.transactionAuthority;
    exact(proof, ["authorityRefHash", "principalEpochRefHash", "issuedAt",
      "expiresAt"], "TRANSACTION_AUTHORITY");
    const authority = issueCurrentUserTransactionAuthorityV1({
      authorityRefHash: hash(proof.authorityRefHash, "AUTHORITY_REF_HASH"),
      principalEpochRefHash: hash(proof.principalEpochRefHash,
        "PRINCIPAL_EPOCH_REF_HASH"),
      outcomeHash, tenderHash,
      issuedAt: instant(proof.issuedAt, "AUTHORITY_ISSUED_AT"),
      expiresAt: instant(proof.expiresAt, "AUTHORITY_EXPIRES_AT"),
    }, {
      revalidateImpl: (entry) => dependencies.revalidateTransactionAuthority(
        Object.freeze({ ...entry, authorityProof: proof })),
    });
    const fetchClock = () => Date.parse(now());
    const primaryTransport = createOrderScopedBuyerNativeHttpsTransportV1({
      privateStateDirectory: path.join(requestDirectory, "adafruit-http"),
      orderRefHash: digest("outsider/adafruit-http-order/v1", request.requestId),
      allowedOrigins: ["https://www.adafruit.com"], timeoutMs: 20_000,
      maximumResponseBytes: 768 * 1024,
    }, { fetchImpl: dependencies.fetchImpl, clock: fetchClock });
    const recoveryTransport = createOrderScopedBuyerNativeHttpsTransportV1({
      privateStateDirectory: path.join(requestDirectory, "sparkfun-http"),
      orderRefHash: digest("outsider/sparkfun-http-order/v1", request.requestId),
      allowedOrigins: ["https://www.sparkfun.com"], timeoutMs: 20_000,
      maximumResponseBytes: 768 * 1024,
    }, { fetchImpl: dependencies.fetchImpl, clock: fetchClock });
    const capabilityExpiry = Date.parse(proof.expiresAt)
      < Date.parse(program.formationDeadline)
      ? proof.expiresAt : program.formationDeadline;
    const capabilityIssuedAt = proof.issuedAt;
    const capabilityRevalidate = async (entry) => {
      const checked = await dependencies.revalidateTransactionAuthority(
        Object.freeze({
          authorityRefHash: proof.authorityRefHash,
          principalEpochRefHash: proof.principalEpochRefHash,
          outcomeHash, tenderHash, observedAt: entry.observedAt,
          authorityProof: proof,
        }));
      return { active: checked.active === true,
        capabilityRefHash: entry.capabilityRefHash,
        accountRefHash: entry.accountRefHash,
        observedAt: entry.observedAt,
        expiresAt: Date.parse(checked.expiresAt) < Date.parse(capabilityExpiry)
          ? checked.expiresAt : capabilityExpiry };
    };
    const primaryCapability = issueAdafruitGuestShopperBuyerNativeCapabilityV1({
      capabilityRefHash: digest("outsider/adafruit-capability/v1", request.requestId),
      accountRefHash: digest("outsider/adafruit-account/v1", request.requestId),
      nodeRefHash: digest("outsider/adafruit-node/v1", request.requestId),
      issuedAt: capabilityIssuedAt, expiresAt: capabilityExpiry,
      productId: "4474", quantity: 1,
    }, { httpsRequestImpl: primaryTransport,
      revalidateImpl: capabilityRevalidate,
      sourceOccurrenceSink:
        dependencies.buyerNativeSourceOccurrenceSink ?? null });
    const cartStore = createPrivateCartStore(path.join(requestDirectory,
      "sparkfun-cart-state"));
    const recoveryAccountRefHash = digest("outsider/sparkfun-account/v1",
      request.requestId);
    const recoveryCapability
      = issueSparkFunMagentoGuestCartBuyerNativeCapabilityV1({
        capabilityRefHash: digest("outsider/sparkfun-capability/v1",
          request.requestId),
        accountRefHash: recoveryAccountRefHash,
        nodeRefHash: digest("outsider/sparkfun-node/v1", request.requestId),
        issuedAt: capabilityIssuedAt, expiresAt: capabilityExpiry,
        catalogPath: "/usb-3-1-cable-a-to-c-3-foot.html",
        productId: "4636", sku: "CAB-14743", quantity: 1,
      }, { httpsRequestImpl: recoveryTransport,
        revalidateImpl: capabilityRevalidate,
        loadPrivateCartStateImpl: cartStore.load,
        storePrivateCartStateImpl: cartStore.store,
        clearPrivateCartStateImpl: cartStore.clear,
        sourceOccurrenceSink:
          dependencies.buyerNativeSourceOccurrenceSink ?? null });
    const witnessMetadata = {
      capabilityRefHash: digest("outsider/physical-witness-capability/v1",
        request.requestId),
      accountRefHash: digest("outsider/physical-witness-account/v1",
        request.requestId),
      nodeRefHash: digest("outsider/physical-witness-node/v1",
        request.requestId),
      issuedAt: capabilityIssuedAt, expiresAt: capabilityExpiry,
      supportedOperations: ["QUOTE", "STATUS"],
    };
    const independentWitnessCapability = witnessCapability(witnessMetadata,
      (entry) => dependencies.witnessReadinessImpl(Object.freeze({
        request: entry, program, foundationCompilation: bundle,
      })), capabilityRevalidate,
      dependencies.buyerNativeSourceOccurrenceSink ?? null);
    const primaryBytes = createAdafruitGuestShopperCommandBytesV1({
      productId: "4474", quantity: 1,
    });
    const recoveryBytes = createSparkFunMagentoGuestCartCommandBytesV1({
      sku: "CAB-14743", quantity: 1,
    });
    const witnessBytes = Buffer.from(canonicalizeStrict({
      schema: "outsider/physical-delivery-witness-readiness-command/v1",
      programHash: program.programHash,
      criteria: program.outcome.acceptance.map((item) => item.criterionId),
    }), "utf8");
    const defaults = {
      primary: routePlan("PRIMARY", primaryBytes),
      recovery: routePlan("RECOVERY", recoveryBytes),
      independentWitness: routePlan("INDEPENDENT_WITNESS", witnessBytes),
    };
    const routeRequests = dependencies.resolveRouteRequests === null
      ? defaults
      : await dependencies.resolveRouteRequests(Object.freeze({
        program, foundationCompilation: bundle,
        candidateRoutingRequest: bundle.candidateRoutingRequest,
        selectedOrderScopedCandidates: Object.freeze([
          Object.freeze({ role: "PRIMARY", provider: "ADAFRUIT_GUEST_SHOPPER",
            productId: "4474" }),
          Object.freeze({ role: "RECOVERY",
            provider: "SPARKFUN_MAGENTO_GUEST_CART", sku: "CAB-14743" }),
          Object.freeze({ role: "INDEPENDENT_WITNESS",
            provider: "INJECTED_WITNESS_READINESS_SOURCE" }),
        ]),
        defaultRouteRequests: defaults,
      }));
    const coordinator = createAtomicBuyerNativeTemporaryNetworkCoordinatorV1({
      journalDirectory: requestDirectory, networkId,
      frozenOutcome: bundle.frozenOutcome, frozenTender: bundle.tender,
      expectedOutcomeHash: outcomeHash, expectedTenderHash: tenderHash,
      formationExpiresAt: program.formationDeadline,
      commercialTerms: { currency: request.budget.currency,
        totalAmountMinor: request.budget.maximumAmountMinor,
        maximumLossMinor: request.budget.maximumAmountMinor },
      routeRequests,
    }, { currentTransactionAuthority: authority, primaryCapability,
      recoveryCapability, independentWitnessCapability, clock: now });
    return { requestDirectory, networkId, outcomeHash, tenderHash, bundle,
      coordinator, recoveryTransport, recoveryAccountRefHash, cartStore,
      capabilityIssuedAt, capabilityExpiry, capabilityRevalidate,
      destinationQuote: null, targetCandidate: null, bestBuyCandidate: null,
      preparation: null };
  }

  async function quoteDestination(context, destination,
    recoveryCartOccurrenceHash) {
    hash(recoveryCartOccurrenceHash, "RECOVERY_CART_OCCURRENCE_HASH");
    const observedAt = now();
    const destinationRefHash = digest("outsider/private-postal-destination/v1",
      { networkId: context.networkId, destination });
    const grant = issueSparkFunPrivatePostalDestinationQuoteGrantV1({
      destinationRefHash, authorizedAt: observedAt,
      expiresAt: context.capabilityExpiry,
      countryCode: destination.countryCode, postalCode: destination.postalCode,
      regionId: destination.regionId ?? null,
      region: destination.region ?? null, city: destination.city ?? null,
    });
    const sourceCartTransactionRefHash = routeTransactionHash(
      context.networkId, "RECOVERY");
    const sourceCartStateKey = digest(
      "outsider/sparkfun-order-scoped-private-cart/v1", {
        accountRefHash: context.recoveryAccountRefHash,
        transactionRefHash: sourceCartTransactionRefHash,
        productId: "4636", sku: "CAB-14743", quantity: 1,
      });
    const stageTransactionRefHash = digest(
      "outsider/sparkfun-destination-quote-subtransaction/v1", {
        networkId: context.networkId, destinationRefHash,
        sourceCartOccurrenceHash: recoveryCartOccurrenceHash,
      });
    const capability = issueSparkFunMagentoDestinationQuoteCapabilityV1({
      capabilityRefHash: digest("outsider/sparkfun-destination-capability/v1",
        { networkId: context.networkId, destinationRefHash }),
      accountRefHash: context.recoveryAccountRefHash,
      nodeRefHash: digest("outsider/sparkfun-destination-node/v1",
        context.networkId),
      issuedAt: observedAt, expiresAt: context.capabilityExpiry,
      productId: "4636", sku: "CAB-14743", quantity: 1,
      destinationGrant: grant,
    }, { httpsRequestImpl: context.recoveryTransport,
      revalidateImpl: context.capabilityRevalidate,
      async loadPrivateCartStateImpl(stageKey) {
        const source = await context.cartStore.load(sourceCartStateKey);
        return source === null ? null : { ...source, sessionRefHash: stageKey };
      },
      sourceOccurrenceSink:
        dependencies.buyerNativeSourceOccurrenceSink ?? null });
    const runtime = createBuyerNativeTransactionRouteRuntimeV1({
      journalDirectory: context.requestDirectory,
      journalId: `transaction_${digest("outsider/destination-journal/v1",
        destinationRefHash).slice(7, 39)}`,
      transactionRefHash: stageTransactionRefHash,
      outcomeIntentRefHash: context.outcomeHash, routeRole: "RECOVERY",
      formationExpiresAt: context.bundle.program.formationDeadline,
    }, { capability, clock: now });
    const expiresAt = context.bundle.program.formationDeadline;
    const ratesBytes = createSparkFunMagentoDestinationQuoteCommandBytesV1(
      capability, { stage: "SHIPPING_RATES", selectedCarrierCode: null,
        selectedMethodCode: null, previousQuoteOccurrenceHash: null });
    const ratesResult = await runtime.quote({
      operationNonce: `destination-rates-${destinationRefHash.slice(7, 39)}`,
      requestBytes: ratesBytes, expiresAt,
      expectedPreviousOccurrenceHash: null,
      triggerOccurrenceHash: null,
    });
    if (ratesResult.publicProjection.sourceState !== "QUOTE_AVAILABLE") {
      return Object.freeze({
        stageState: "DESTINATION_ROUTE_REPLACEMENT_REQUIRED",
        destinationRefHash, sourceCartOccurrenceHash:
          recoveryCartOccurrenceHash, stageTransactionRefHash,
        rates: destinationSummary({
          lifecycleState: "DESTINATION_SHIPPING_UNAVAILABLE_HOLD",
          nextGate: "UNAVAILABLE", normalized: null,
        }, ratesResult), landedTotals: null,
      });
    }
    const ratesReceipt = JSON.parse(
      claimBuyerNativeTransactionSourceOccurrenceV1(ratesResult)
        .sourceBytes.toString("utf8"));
    const available = ratesReceipt.normalized.rates.filter((rate) =>
      rate.available === true);
    const selected = dependencies.selectShippingRate === null
      ? [...available].sort((left, right) => left.amount - right.amount
        || `${left.carrierCode}:${left.methodCode}`.localeCompare(
          `${right.carrierCode}:${right.methodCode}`))[0]
      : await dependencies.selectShippingRate(Object.freeze({
        program: context.bundle.program, rates: available,
      }));
    if (selected === undefined) {
      return Object.freeze({
        stageState: "DESTINATION_ROUTE_REPLACEMENT_REQUIRED",
        destinationRefHash, sourceCartOccurrenceHash:
          recoveryCartOccurrenceHash, stageTransactionRefHash,
        rates: destinationSummary(ratesReceipt, ratesResult),
        landedTotals: null,
      });
    }
    const previous = ratesResult.publicProjection.sourceOccurrenceHash;
    const totalsBytes = createSparkFunMagentoDestinationQuoteCommandBytesV1(
      capability, { stage: "LANDED_TOTALS_ESTIMATE",
        selectedCarrierCode: selected.carrierCode,
        selectedMethodCode: selected.methodCode,
        previousQuoteOccurrenceHash: previous });
    const totalsResult = await runtime.quote({
      operationNonce: `destination-totals-${destinationRefHash.slice(7, 39)}`,
      requestBytes: totalsBytes, expiresAt,
      expectedPreviousOccurrenceHash: previous,
      triggerOccurrenceHash: null,
    });
    const totalsReceipt = JSON.parse(
      claimBuyerNativeTransactionSourceOccurrenceV1(totalsResult)
        .sourceBytes.toString("utf8"));
    return Object.freeze({
      stageState: "POSTAL_QUOTE_COMPLETE_NEEDS_FULL_ADDRESS_AND_ETA",
      destinationRefHash, sourceCartOccurrenceHash:
        recoveryCartOccurrenceHash, stageTransactionRefHash,
      rates: destinationSummary(ratesReceipt, ratesResult),
      landedTotals: destinationSummary(totalsReceipt, totalsResult),
    });
  }

  async function observeTargetCandidate(context, destination) {
    if (dependencies.resolveTargetCandidateBinding === undefined
      || dependencies.resolveTargetCandidateBinding === null) return null;
    const binding = await dependencies.resolveTargetCandidateBinding(
      Object.freeze({ destination: Object.freeze({ ...destination }),
        program: context.bundle.program,
        budget: context.bundle.frozenOutcome.budget }));
    if (binding === null) return null;
    if (binding.postalCode !== destination.postalCode) {
      fail("TARGET_CANDIDATE_DESTINATION_BINDING_MISMATCH");
    }
    const transport = createOrderScopedBuyerNativeHttpsTransportV1({
      privateStateDirectory: path.join(context.requestDirectory,
        "target-redsky-http"),
      orderRefHash: digest("outsider/target-redsky-http-order/v1",
        context.bundle.program.orderId),
      allowedOrigins: ["https://redsky.target.com"], timeoutMs: 20_000,
      maximumResponseBytes: 768 * 1024,
    }, { fetchImpl: dependencies.fetchImpl, clock: () => Date.parse(now()) });
    const capability = issueTargetRedskyCandidateBuyerNativeCapabilityV1({
      capabilityRefHash: digest("outsider/target-redsky-capability/v1",
        context.networkId),
      accountRefHash: digest("outsider/target-public-web-route/v1",
        context.networkId),
      nodeRefHash: digest("outsider/target-redsky-node/v1",
        context.networkId),
      issuedAt: context.capabilityIssuedAt,
      expiresAt: context.capabilityExpiry,
      ...binding,
    }, { httpsRequestImpl: transport,
      revalidateImpl: context.capabilityRevalidate,
      sourceOccurrenceSink:
        dependencies.buyerNativeSourceOccurrenceSink ?? null });
    const transactionRefHash = digest(
      "outsider/target-redsky-candidate-transaction/v1", context.networkId);
    const runtime = createBuyerNativeTransactionRouteRuntimeV1({
      journalDirectory: context.requestDirectory,
      journalId: `transaction_${transactionRefHash.slice(7, 39)}`,
      transactionRefHash, outcomeIntentRefHash: context.outcomeHash,
      routeRole: "RECOVERY",
      formationExpiresAt: context.bundle.program.formationDeadline,
    }, { capability, clock: now });
    const command = createTargetRedskyCandidateCommandBytesV1(binding);
    const quote = await runtime.quote({
      operationNonce: `target-pdp-${transactionRefHash.slice(7, 39)}`,
      requestBytes: command, expiresAt: context.capabilityExpiry,
      expectedPreviousOccurrenceHash: null, triggerOccurrenceHash: null,
    });
    if (quote.publicProjection.sourceOccurrenceHash === null) {
      return Object.freeze({
        schema: "outsider/target-redsky-parallel-candidate-observation/v1",
        schemaVersion: "1.0.0", provider:
          "TARGET_REDSKY_READ_ONLY_CANDIDATE",
        stageState: "PDP_QUOTE_SOURCE_UNAVAILABLE",
        selectedForAtomicSlot: false, affectsAtomicNetworkState: false,
        transactionRefHash, quote: quote.publicProjection,
        fulfillment: null, commitEligible: false,
        capacityReserved: false, paymentPerformed: false,
        orderSubmitted: false,
      });
    }
    const quoteClaim = claimBuyerNativeTransactionSourceOccurrenceV1(quote);
    const product = normalizeTargetRedskyPdpSourceV1(
      quoteClaim.sourceBytes, { tcin: binding.tcin,
        quantity: binding.quantity,
        maximumAmountMinor: binding.maximumAmountMinor });
    const status = await runtime.status({
      operationNonce: `target-status-${transactionRefHash.slice(7, 39)}`,
      requestBytes: command, expiresAt: context.capabilityExpiry,
      expectedPreviousOccurrenceHash:
        quote.publicProjection.sourceOccurrenceHash,
      triggerOccurrenceHash: null,
    });
    if (status.publicProjection.sourceOccurrenceHash === null) {
      return Object.freeze({
        schema: "outsider/target-redsky-parallel-candidate-observation/v1",
        schemaVersion: "1.0.0", provider:
          "TARGET_REDSKY_READ_ONLY_CANDIDATE",
        stageState: "POSTAL_STATUS_SOURCE_UNAVAILABLE",
        selectedForAtomicSlot: false, affectsAtomicNetworkState: false,
        transactionRefHash,
        quote: Object.freeze({ publicProjection: quote.publicProjection,
          exactSourceBytes: quoteClaim.sourceBytes.length, normalized: product }),
        fulfillment: status.publicProjection, commitEligible: false,
        capacityReserved: false, paymentPerformed: false,
        orderSubmitted: false,
      });
    }
    const statusClaim = claimBuyerNativeTransactionSourceOccurrenceV1(status);
    const fulfillment = normalizeTargetRedskyFulfillmentSourceV1(
      statusClaim.sourceBytes, { tcin: binding.tcin,
        quantity: binding.quantity,
        requestedDeliveryDate: binding.requestedDeliveryDate });
    const displayedScenarioMinor = product.unitPriceMinor
      + fulfillment.largestDisplayedFeeMinor;
    const maximumAmountMinor = Number(binding.maximumAmountMinor);
    return deepFreeze({
      schema: "outsider/target-redsky-parallel-candidate-observation/v1",
      schemaVersion: "1.0.0",
      provider: "TARGET_REDSKY_READ_ONLY_CANDIDATE",
      stageState: "REJECTED_FROM_ATOMIC_SELECTION",
      selectedForAtomicSlot: false,
      affectsAtomicNetworkState: false,
      transactionRefHash,
      productQuote: {
        sourceOccurrenceHash: quote.publicProjection.sourceOccurrenceHash,
        sourceBytesHash: quote.publicProjection.sourceBytesHash,
        exactSourceBytes: quoteClaim.sourceBytes.length,
        normalized: product,
      },
      postalFulfillmentStatus: {
        sourceOccurrenceHash: status.publicProjection.sourceOccurrenceHash,
        sourceBytesHash: status.publicProjection.sourceBytesHash,
        exactSourceBytes: statusClaim.sourceBytes.length,
        normalized: fulfillment,
      },
      standardShippingRouteState: product.standardShippingRouteState,
      sameDayRouteState: "ACCOUNT_AUTHORITY_REQUIRED",
      targetAccountAuthorityPresent: false,
      itemPlusLargestDisplayedFeeBeforeTaxMinor: displayedScenarioMinor,
      displayedScenarioBeforeTaxWithinBudget:
        displayedScenarioMinor <= maximumAmountMinor,
      allInBudgetProven: false,
      exactAcceptanceSatisfied: product.exactAcceptanceSatisfied,
      commitBlockers: [...product.blockingAcceptanceGaps,
        ...(product.standardShippingRouteState === "BUDGET_INFEASIBLE"
          ? ["STANDARD_SHIPPING_MINIMUM_EXCEEDS_BUDGET"] : []),
        "SAME_DAY_TARGET_ACCOUNT_AUTHORITY_NOT_PRESENT",
        "ALL_IN_TOTAL_NOT_PROVEN", "CAPACITY_NOT_RESERVED"],
      sourceAvailableToPromiseIsReservation: false,
      sourceDeliveryDateIsBindingCommitment: false,
      commitEligible: false,
      capacityReserved: false,
      deliveryDeadlineProven: false,
      paymentPerformed: false,
      orderSubmitted: false,
    });
  }

  async function observeBestBuyCandidate(context, destination) {
    if (dependencies.resolveBestBuyCandidateBinding === undefined
      || dependencies.resolveBestBuyCandidateBinding === null) return null;
    const binding = await dependencies.resolveBestBuyCandidateBinding(
      Object.freeze({ destination: Object.freeze({ ...destination }),
        program: context.bundle.program,
        budget: context.bundle.frozenOutcome.budget }));
    if (binding === null) return null;
    if (binding.postalCode !== destination.postalCode) {
      fail("BESTBUY_CANDIDATE_DESTINATION_BINDING_MISMATCH");
    }
    const capability = issueBestBuyBuyerNativeCandidateCapabilityV1({
      capabilityRefHash: digest("outsider/bestbuy-capability/v1",
        context.networkId),
      accountRefHash: digest("outsider/bestbuy-source-route/v1",
        context.networkId),
      nodeRefHash: digest("outsider/bestbuy-node/v1", context.networkId),
      issuedAt: context.capabilityIssuedAt,
      expiresAt: context.capabilityExpiry,
      binding,
    }, { readSourceImpl: dependencies.bestBuyCandidateSourceRead,
      revalidateImpl: context.capabilityRevalidate,
      sourceOccurrenceSink:
        dependencies.buyerNativeSourceOccurrenceSink ?? null });
    const transactionRefHash = digest(
      "outsider/bestbuy-candidate-transaction/v1", context.networkId);
    const runtime = createBuyerNativeTransactionRouteRuntimeV1({
      journalDirectory: context.requestDirectory,
      journalId: `transaction_${transactionRefHash.slice(7, 39)}`,
      transactionRefHash, outcomeIntentRefHash: context.outcomeHash,
      routeRole: "RECOVERY",
      formationExpiresAt: context.bundle.program.formationDeadline,
    }, { capability, clock: now });
    const command = (stage) =>
      createBestBuyBuyerNativeCandidateCommandBytesV1({ binding, stage });
    const quote = await runtime.quote({
      operationNonce: `bestbuy-product-${transactionRefHash.slice(7, 39)}`,
      requestBytes: command("PRODUCT"),
      expiresAt: context.capabilityExpiry,
      expectedPreviousOccurrenceHash: null, triggerOccurrenceHash: null,
    });
    if (quote.publicProjection.sourceOccurrenceHash === null) {
      fail("BESTBUY_PRODUCT_SOURCE_UNAVAILABLE");
    }
    const productClaim = claimBuyerNativeTransactionSourceOccurrenceV1(quote);
    const product = normalizeBestBuyProductSourceV1(
      productClaim.sourceBytes, { sku: binding.sku, bsin: binding.bsin,
        requestedCableQuantity: binding.requestedCableQuantity,
        reviewedProductSpec: binding.reviewedProductSpec });
    const cartResult = await runtime.status({
      operationNonce: `bestbuy-cart-${transactionRefHash.slice(7, 39)}`,
      requestBytes: command("CART"), expiresAt: context.capabilityExpiry,
      expectedPreviousOccurrenceHash:
        quote.publicProjection.sourceOccurrenceHash,
      triggerOccurrenceHash: null,
    });
    if (cartResult.publicProjection.sourceOccurrenceHash === null) {
      fail("BESTBUY_CART_SOURCE_UNAVAILABLE");
    }
    const cartClaim = claimBuyerNativeTransactionSourceOccurrenceV1(
      cartResult);
    const cart = normalizeBestBuyCartSourceV1(cartClaim.sourceBytes, {
      sku: binding.sku, bsin: binding.bsin,
      postalCode: binding.postalCode,
      cartLineQuantity: binding.cartLineQuantity,
      requestedDeliveryDate: binding.requestedDeliveryDate,
      maximumAmountMinor: binding.maximumAmountMinor,
    });
    const guestResult = await runtime.status({
      operationNonce: `bestbuy-guest-${transactionRefHash.slice(7, 39)}`,
      requestBytes: command("GUEST_CHECKOUT"),
      expiresAt: context.capabilityExpiry,
      expectedPreviousOccurrenceHash:
        cartResult.publicProjection.sourceOccurrenceHash,
      triggerOccurrenceHash: null,
    });
    if (guestResult.publicProjection.sourceOccurrenceHash === null) {
      fail("BESTBUY_GUEST_CHECKOUT_SOURCE_UNAVAILABLE");
    }
    const guestClaim = claimBuyerNativeTransactionSourceOccurrenceV1(
      guestResult);
    const guestCheckout = normalizeBestBuyGuestCheckoutSourceV1(
      guestClaim.sourceBytes, {
        cartLineQuantity: binding.cartLineQuantity });
    const exactAcceptanceSatisfied = product.exactAcceptanceSatisfied;
    return deepFreeze({
      schema: "outsider/bestbuy-parallel-candidate-observation/v1",
      schemaVersion: "1.0.0",
      provider: "BEST_BUY_US_WEB_SOURCE_PINNED_CANDIDATE",
      stageState: "REJECTED_FROM_ATOMIC_SELECTION_HOLD",
      selectedForAtomicSlot: false,
      affectsAtomicNetworkState: false,
      transactionRefHash,
      productQuote: {
        sourceOccurrenceHash: quote.publicProjection.sourceOccurrenceHash,
        sourceBytesHash: quote.publicProjection.sourceBytesHash,
        exactSourceBytes: productClaim.sourceBytes.length,
        normalized: product,
      },
      anonymousCartStatus: {
        sourceOccurrenceHash:
          cartResult.publicProjection.sourceOccurrenceHash,
        sourceBytesHash: cartResult.publicProjection.sourceBytesHash,
        exactSourceBytes: cartClaim.sourceBytes.length,
        normalized: cart,
      },
      guestCheckoutStatus: {
        sourceOccurrenceHash:
          guestResult.publicProjection.sourceOccurrenceHash,
        sourceBytesHash: guestResult.publicProjection.sourceBytesHash,
        exactSourceBytes: guestClaim.sourceBytes.length,
        normalized: guestCheckout,
      },
      requestedCableQuantity: binding.requestedCableQuantity,
      packCableQuantity: product.packCableQuantity,
      surplusCableQuantity: product.surplusCableQuantity,
      surplusAuthorizationRequired: product.surplusAuthorizationRequired,
      surplusAuthorizationPresent: false,
      eligibleAsRecoveryOnlyIfSurplusExplicitlyAuthorized:
        product.exactCableSpecExceptPackQuantity
          && product.surplusAuthorizationRequired,
      anonymousCartAccepted: cart.anonymousCartAccepted,
      guestCheckoutOffered: guestCheckout.guestCheckoutOffered,
      accountRequiredForCheckout:
        guestCheckout.accountRequiredForCheckout,
      displayedAllInTotalMinor: cart.displayedAllInTotalMinor,
      withinMaximumAmount: cart.withinMaximumAmount,
      sourceEtaDate: cart.sourceEtaDate,
      sourceDateMeetsRequestedDeadline:
        cart.sourceDateMeetsRequestedDeadline,
      sourceNumericAtpExposed: cart.sourceNumericAtpExposed,
      sourceNumericAtpQuantity: cart.sourceNumericAtpQuantity,
      exactAcceptanceSatisfied,
      commitBlockers: [...product.blockingAcceptanceGaps,
        "CART_IS_NOT_CAPACITY_RESERVATION",
        "SOURCE_ETA_IS_NOT_BINDING_UNTIL_ORDER"],
      sourceReplayOnly: true,
      cartIsCapacityReservation: false,
      sourceEtaIsBindingCommitment: false,
      commitEligible: false,
      capacityReserved: false,
      deliveryDeadlineProven: false,
      contactSubmitted: false,
      fullAddressSubmitted: false,
      paymentPerformed: false,
      orderSubmitted: false,
    });
  }

  const productRuntime = createOutsiderOutcomeProductRuntimeV2({
    directory: path.join(directory, "product-runtime"), clock: now,
    compileGoal,
    async prepareFormation(entry) {
      let context = contexts.get(entry.request.requestId);
      if (context === undefined) {
        context = await makeContext(entry.request, entry.program);
        contexts.set(entry.request.requestId, context);
      }
      context.preparation = await context.coordinator.prepare();
      const destination = privateInputs.get(entry.request.requestId)?.destination;
      if (destination !== null && destination !== undefined
        && context.preparation.networkState === "NEEDS_ADDRESS_AND_PAYMENT") {
        const recovery = context.preparation.slots.find((slot) =>
          slot.routeRole === "RECOVERY");
        context.destinationQuote = await quoteDestination(context, destination,
          recovery.latestSourceOccurrenceHash);
        persistDestinationState(context.requestDirectory,
          entry.request.requestId, context.destinationQuote);
        try {
          context.targetCandidate = await observeTargetCandidate(context,
            destination);
        } catch (error) {
          context.targetCandidate = Object.freeze({
            schema:
              "outsider/target-redsky-parallel-candidate-observation/v1",
            schemaVersion: "1.0.0",
            provider: "TARGET_REDSKY_READ_ONLY_CANDIDATE",
            stageState: "CANDIDATE_OBSERVATION_FAILED_HOLD",
            failureCode: typeof error?.outsiderCode === "string"
              ? error.outsiderCode : "TARGET_CANDIDATE_OBSERVATION_FAILED",
            selectedForAtomicSlot: false,
            affectsAtomicNetworkState: false,
            commitEligible: false,
            capacityReserved: false,
            paymentPerformed: false,
            orderSubmitted: false,
          });
        }
        if (context.targetCandidate !== null) {
          persistTargetCandidateState(context.requestDirectory,
            entry.request.requestId, context.targetCandidate);
        }
        try {
          context.bestBuyCandidate = await observeBestBuyCandidate(context,
            destination);
        } catch (error) {
          context.bestBuyCandidate = Object.freeze({
            schema: "outsider/bestbuy-parallel-candidate-observation/v1",
            schemaVersion: "1.0.0",
            provider: "BEST_BUY_US_WEB_SOURCE_PINNED_CANDIDATE",
            stageState: "CANDIDATE_OBSERVATION_FAILED_HOLD",
            failureCode: typeof error?.outsiderCode === "string"
              ? error.outsiderCode : "BESTBUY_CANDIDATE_OBSERVATION_FAILED",
            selectedForAtomicSlot: false,
            affectsAtomicNetworkState: false,
            surplusAuthorizationRequired: true,
            surplusAuthorizationPresent: false,
            commitEligible: false,
            capacityReserved: false,
            contactSubmitted: false,
            fullAddressSubmitted: false,
            paymentPerformed: false,
            orderSubmitted: false,
          });
        }
        if (context.bestBuyCandidate !== null) {
          persistBestBuyCandidateState(context.requestDirectory,
            entry.request.requestId, context.bestBuyCandidate);
        }
      }
      const preparation = context.destinationQuote === null
        ? context.preparation : Object.freeze({ ...context.preparation,
          destinationFormation: Object.freeze({
            stageState: context.destinationQuote.stageState,
            destinationRefHash: context.destinationQuote.destinationRefHash,
            sourceCartOccurrenceHash:
              context.destinationQuote.sourceCartOccurrenceHash,
            stageTransactionRefHash:
              context.destinationQuote.stageTransactionRefHash,
            ratesOccurrenceHash:
              context.destinationQuote.rates?.sourceOccurrenceHash ?? null,
            landedTotalsOccurrenceHash:
              context.destinationQuote.landedTotals?.sourceOccurrenceHash
                ?? null,
            capacityReserved: false,
            deliveryDeadlineProven: false,
            paymentPerformed: false,
            orderSubmitted: false,
          }),
        });
      return { coordinator: context.coordinator,
        preparation, exactCommitment: null };
    },
    restoreCoordinator: null,
    formationEventSink: dependencies.formationEventSink ?? null,
  });

  function publicResult(productResponse) {
    const context = contexts.get(productResponse.requestId);
    const bundle = context?.bundle ?? bundles.get(productResponse.requestId)
      ?? readPrivateCanonicalRecord(foundationFile(foundationDirectory,
        productResponse.requestId), "FOUNDATION_COMPILATION");
    const requestDirectory = requestPrivateDirectory(directory,
      productResponse.requestId);
    const destinationQuote = context?.destinationQuote
      ?? loadDestinationState(requestDirectory, productResponse.requestId);
    const targetCandidate = context?.targetCandidate
      ?? loadTargetCandidateState(requestDirectory, productResponse.requestId);
    const bestBuyCandidate = context?.bestBuyCandidate
      ?? loadBestBuyCandidateState(requestDirectory,
        productResponse.requestId);
    const outcomeIntentRefHash = context?.outcomeHash
      ?? (bundle === null || bundle === undefined ? null
        : pinAtomicBuyerNativeFrozenArtifactV1("OUTCOME",
          bundle.frozenOutcome));
    const destinationQuoted = destinationQuote?.stageState
      === "POSTAL_QUOTE_COMPLETE_NEEDS_FULL_ADDRESS_AND_ETA";
    const workflowState = productResponse.state === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : destinationQuote?.stageState
        === "DESTINATION_ROUTE_REPLACEMENT_REQUIRED"
        ? "DESTINATION_ROUTE_REPLACEMENT_REQUIRED"
      : destinationQuoted
        ? "NEEDS_FULL_ADDRESS_DELIVERABILITY_AND_ETA"
        : "NEEDS_DESTINATION";
    const nextInput = workflowState === "NEEDS_DESTINATION"
      ? OUTSIDER_FIRST_PHYSICAL_OUTCOME_DESTINATION_INPUT_V1
      : workflowState.startsWith("NEEDS_FULL_ADDRESS")
        ? OUTSIDER_FIRST_PHYSICAL_OUTCOME_FULL_DELIVERY_INPUT_V1 : null;
    const body = {
      schema: OUTSIDER_FIRST_PHYSICAL_OUTCOME_PRODUCTION_COMPOSITION_V1_SCHEMA,
      schemaVersion: "1.0.0",
      requestId: productResponse.requestId,
      programHash: productResponse.programHash,
      outcomeIntentRefHash,
      candidateRoutingRequestHash: bundle?.candidateRoutingRequest
        ?.candidateRoutingRequestHash
        ?? (bundle === null || bundle === undefined ? null
          : digest("outsider/candidate-routing-request/v1",
            bundle.candidateRoutingRequest)),
      productState: productResponse.state,
      workflowState,
      productResponse,
      selectedOrderScopedRoutes: Object.freeze([
        Object.freeze({ role: "PRIMARY", provider: "ADAFRUIT_GUEST_SHOPPER",
          productId: "4474" }),
        Object.freeze({ role: "RECOVERY",
          provider: "SPARKFUN_MAGENTO_GUEST_CART", sku: "CAB-14743" }),
          Object.freeze({ role: "INDEPENDENT_WITNESS",
            provider: "INJECTED_WITNESS_READINESS_SOURCE" }),
      ]),
      parallelUnselectedCandidateRoutes: Object.freeze([
        ...(targetCandidate === null ? [] : [targetCandidate]),
        ...(bestBuyCandidate === null ? [] : [bestBuyCandidate]),
      ]),
      destinationQuote,
      nextInput,
      exactCommitmentProposal: null,
      cartReadyCountsAsReservation: false,
      postalQuoteCountsAsReservation: false,
      capacityReserved: false,
      paymentAttempted: false,
      orderSubmitted: false,
      sellerMessageCount: 0,
      humanQueueCreated: false,
      outsiderStaffTouchLimit: 0,
      outcomePromiseIssued: false,
      boundary:
        OUTSIDER_FIRST_PHYSICAL_OUTCOME_PRODUCTION_COMPOSITION_V1_BOUNDARY,
    };
    return Object.freeze({ ...body,
      compositionHash: digest(body.schema, body) });
  }

  function bindPrivateInput(requestId, injected) {
    if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
      fail("REQUEST_ID_INVALID");
    }
    exact(injected, ["formationAuthorization", "transactionAuthority",
      "destination"], "INJECTED");
    if (injected.destination !== null) {
      exact(injected.destination, ["countryCode", "postalCode", "regionId",
        "region", "city"], "DESTINATION");
    }
    privateInputs.set(requestId, {
      transactionAuthority: injected.transactionAuthority,
      destination: injected.destination,
    });
  }

  return Object.freeze({
    async requestOutcome(request, injected) {
      bindPrivateInput(request.requestId, injected);
      return publicResult(await productRuntime.requestOutcome(request, {
        formationAuthorization: injected.formationAuthorization,
      }));
    },
    async resumeOutcome(requestId, injected) {
      bindPrivateInput(requestId, injected);
      return publicResult(await productRuntime.resumeFormation(requestId, {
        formationAuthorization: injected.formationAuthorization,
      }));
    },
    inspect(requestId) { return publicResult(productRuntime.inspect(requestId)); },
  });
}
