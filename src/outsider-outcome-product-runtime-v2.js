/*
 * Outsider Outcome Product Runtime v2.
 *
 * Product order:
 *   one goal + formation-only authority
 *   -> compile
 *   -> injected, account-local formation.prepare
 *   -> background / unavailable / needs destination, or one exact proposal
 *   -> one separately-authorized atomic commit attempt
 *
 * The runtime contains no provider or vertical. It performs no live I/O itself.
 * Durable records contain the private request, public formation projections and
 * hashes only; injected authorities and coordinator capabilities are never
 * serialized. A proposal is not an outcome promise.
 */

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  inspectAtomicBuyerNativeTemporaryNetworkCoordinatorV1,
} from "./outsider-atomic-buyer-native-temporary-network-coordinator-v1.js";
import { verifyOutcomeProgramV1 }
  from "./outsider-outcome-program-v1.js";

const PREFIX = "OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_";
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const NETWORK_ID = /^network_[a-f0-9]{32}$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const AMOUNT = /^(?:0|[1-9]\d{0,30})$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const FORMATION_SCHEMA
  = "outsider/atomic-buyer-native-network-preparation-result/v1";
const EXACT_TERMS_SCHEMA = "outsider/exact-commitment-terms/v2";
const TERMINAL_FORMATION_STATES = new Set([
  "COMMITMENT_PROPOSAL_READY",
  "UNAVAILABLE",
]);
const REQUIRED_ROLES = Object.freeze([
  "PRIMARY", "RECOVERY", "INDEPENDENT_WITNESS",
]);

export const OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS = Object.freeze({
  request: "outsider/private-outcome-product-request/v2",
  formation: "outsider/outcome-product-formation-snapshot/v2",
  proposal: "outsider/exact-commitment-proposal/v2",
  confirmation: "outsider/outcome-product-confirmation-marker/v2",
  commitResult: "outsider/outcome-product-atomic-commit-result/v2",
  response: "outsider/outcome-product-response/v2",
  formationEvent: "outsider/outcome-product-formation-event/v2",
  formationEventSinkReceipt:
    "outsider/outcome-product-formation-event-sink-receipt/v2",
});

export const OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_STATES = Object.freeze([
  "BACKGROUND_FORMING",
  "NEEDS_DESTINATION",
  "UNAVAILABLE",
  "COMMITMENT_PROPOSAL_READY",
]);

export const OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_BOUNDARY = Object.freeze({
  position: "GENERIC_OUTCOME_PRODUCT_ENTRY",
  providerOrVerticalEmbedded: false,
  liveIoPerformedByRuntime: false,
  initialAuthorityScope: "FORMATION_IO_ONLY",
  paymentAuthorityAcceptedDuringFormation: false,
  exactProposalRequiresPrimaryRecoveryAndWitnessReadiness: true,
  cartReadyIsCommitmentReady: false,
  explicitPaymentLossAndAddressBoundAuthorizationRequiredForCommit: true,
  humanQueuePermitted: false,
  outsiderStaffTouchLimit: 0,
  commitmentProposalIsOutcomePromise: false,
  coordinatorSourceStateIsIndependentOutcomeTruth: false,
  configuredFormationEventSinkIsFailClosed: true,
  formationEventDeliveryIsReplayable: true,
  formationEventContainsProviderSourceBytes: false,
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

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function money(value, code) {
  if (typeof value !== "string" || !AMOUNT.test(value)) fail(`${code}_INVALID`);
  return value;
}

function jsonClone(value, code) {
  try {
    return JSON.parse(canonicalizeStrict(value));
  } catch { fail(`${code}_NOT_CANONICAL_JSON`); }
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  if (!Object.isFrozen(value)) fail("EXACT_TERMS_NOT_DEEPLY_FROZEN");
  seen.add(value);
  for (const item of Object.values(value)) assertDeepFrozen(item, seen);
}

function stem(requestId) {
  return createHash("sha256").update(requestId, "utf8").digest("hex");
}

function requestPath(directory, requestId) {
  return path.join(directory, `${stem(requestId)}.request.v2.json`);
}

function confirmationPath(directory, requestId) {
  return path.join(directory, `${stem(requestId)}.confirmation.v2.json`);
}

function commitResultPath(directory, requestId) {
  return path.join(directory, `${stem(requestId)}.commit-result.v2.json`);
}

function formationPrefix(requestId) {
  return `${stem(requestId)}.formation.`;
}

function formationPath(directory, requestId, ordinal) {
  return path.join(directory,
    `${formationPrefix(requestId)}${String(ordinal).padStart(8, "0")}.v2.json`);
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeOnce(directory, file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
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

function readRecord(file, code) {
  if (!existsSync(file)) fail(code);
  const info = statSync(file);
  if (!info.isFile() || (info.mode & 0o077) !== 0) fail("RECORD_NOT_PRIVATE");
  const bytes = readFileSync(file);
  if (bytes.length < 3 || bytes.at(-1) !== 0x0a) fail("RECORD_PARTIAL");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch {
    fail("RECORD_INVALID");
  }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail("RECORD_NOT_CANONICAL");
  }
  return value;
}

function latestFormation(directory, requestId) {
  const prefix = formationPrefix(requestId);
  const names = readdirSync(directory).filter((name) =>
    name.startsWith(prefix) && name.endsWith(".v2.json")).sort();
  return names.length === 0 ? null
    : readRecord(path.join(directory, names.at(-1)), "FORMATION_NOT_FOUND");
}

function normalizedRequest(input, clock) {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || Buffer.isBuffer(input)) fail("REQUEST_OBJECT_INVALID");
  const required = ["requestId", "goal", "budget", "completionDeadline"];
  const allowed = new Set([...required, "context"]);
  if (required.some((field) => !Object.hasOwn(input, field))
    || Reflect.ownKeys(input).some((field) => !allowed.has(field))) {
    fail("REQUEST_FIELDS_INVALID");
  }
  if (typeof input.requestId !== "string" || !REQUEST_ID.test(input.requestId)
    || typeof input.goal !== "string" || input.goal.trim().length < 1
    || Buffer.byteLength(input.goal, "utf8") > 32_768) fail("REQUEST_INVALID");
  exact(input.budget, ["currency", "maximumAmountMinor"], "BUDGET");
  if (typeof input.budget.currency !== "string"
    || !CURRENCY.test(input.budget.currency)) fail("BUDGET_CURRENCY_INVALID");
  money(input.budget.maximumAmountMinor, "BUDGET_MAXIMUM_AMOUNT_MINOR");
  const requestedAt = instant(clock(), "CLOCK");
  const completionDeadline = instant(input.completionDeadline,
    "COMPLETION_DEADLINE");
  const request = {
    requestId: input.requestId,
    goal: input.goal.trim(),
    budget: {
      currency: input.budget.currency,
      maximumAmountMinor: input.budget.maximumAmountMinor,
    },
    completionDeadline,
    context: jsonClone(input.context ?? {}, "REQUEST_CONTEXT"),
    requestedAt,
  };
  const replayIdentity = {
    requestId: request.requestId,
    goal: request.goal,
    budget: request.budget,
    completionDeadline: request.completionDeadline,
    context: request.context,
  };
  return { request, requestFingerprint: digest(
    "outsider/outcome-product-request-identity/v2", replayIdentity) };
}

function validateProgram(programInput, request) {
  const program = verifyOutcomeProgramV1(programInput);
  if (program.orderId !== request.requestId
    || program.outcome.statement !== request.goal
    || program.outcome.budget.currency !== request.budget.currency
    || program.outcome.budget.maximumAmountMinor
      !== request.budget.maximumAmountMinor
    || program.completionDeadline !== request.completionDeadline) {
    fail("COMPILED_PROGRAM_REQUEST_MISMATCH");
  }
  return program;
}

function validatePreparation(value, coordinator) {
  const preparation = jsonClone(value, "PREPARATION");
  if (preparation.schema !== FORMATION_SCHEMA
    || preparation.networkId !== coordinator.networkId
    || preparation.outcomeHash !== coordinator.outcomeHash
    || preparation.tenderHash !== coordinator.tenderHash
    || preparation.primaryCommitCalled !== false
    || preparation.userResultCommitted !== false
    || preparation.reservationAttempted !== false
    || preparation.cartReadyCountsAsReservation !== false
    || !Array.isArray(preparation.slots)) fail("PREPARATION_BOUNDARY_INVALID");
  const roles = preparation.slots.map((slot) => slot.routeRole).sort();
  if (canonicalizeStrict(roles)
    !== canonicalizeStrict([...REQUIRED_ROLES].sort())) {
    fail("PREPARATION_REQUIRED_SLOTS_INVALID");
  }
  return preparation;
}

const EXACT_TERMS_FIELDS = Object.freeze([
  "schema", "programHash", "networkId", "coordinatorBindingHash",
  "primaryReadinessRefHash", "recoveryReadinessRefHash",
  "independentWitnessReadinessRefHash", "currency", "totalAmountMinor",
  "maximumLossMinor", "completionDeadline", "validUntil",
]);

function proposalFromExactTerms(value, requestRecord, preparation,
  coordinator, observedAt) {
  if (value === null) return null;
  exact(value, EXACT_TERMS_FIELDS, "EXACT_TERMS");
  assertDeepFrozen(value);
  if (value.schema !== EXACT_TERMS_SCHEMA
    || hash(value.programHash, "EXACT_PROGRAM_HASH")
      !== requestRecord.program.programHash
    || typeof value.networkId !== "string" || !NETWORK_ID.test(value.networkId)
    || value.networkId !== coordinator.networkId
    || hash(value.coordinatorBindingHash, "EXACT_COORDINATOR_BINDING_HASH")
      !== coordinator.coordinatorBindingHash
    || value.currency !== requestRecord.request.budget.currency
    || value.completionDeadline !== requestRecord.request.completionDeadline) {
    fail("EXACT_TERMS_BINDING_INVALID");
  }
  const totalAmountMinor = money(value.totalAmountMinor,
    "EXACT_TOTAL_AMOUNT_MINOR");
  const maximumLossMinor = money(value.maximumLossMinor,
    "EXACT_MAXIMUM_LOSS_MINOR");
  const requestMaximum = BigInt(requestRecord.request.budget.maximumAmountMinor);
  if (BigInt(totalAmountMinor) > requestMaximum
    || BigInt(maximumLossMinor) > requestMaximum) {
    fail("EXACT_TERMS_EXCEED_REQUEST_BUDGET");
  }
  const validUntil = instant(value.validUntil, "EXACT_VALID_UNTIL");
  if (Date.parse(validUntil) <= Date.parse(observedAt)
    || Date.parse(validUntil)
      > Date.parse(requestRecord.program.formationDeadline)) {
    fail("EXACT_TERMS_VALIDITY_INVALID");
  }
  if (preparation.networkState !== "READY_FOR_PRINCIPAL_PAYMENT_APPROVAL") {
    fail("EXACT_TERMS_WITHOUT_COMMIT_READY_PREPARATION");
  }
  const byRole = Object.fromEntries(preparation.slots.map((slot) =>
    [slot.routeRole, slot]));
  const readiness = {
    PRIMARY: hash(value.primaryReadinessRefHash,
      "PRIMARY_READINESS_REF_HASH"),
    RECOVERY: hash(value.recoveryReadinessRefHash,
      "RECOVERY_READINESS_REF_HASH"),
    INDEPENDENT_WITNESS: hash(value.independentWitnessReadinessRefHash,
      "WITNESS_READINESS_REF_HASH"),
  };
  for (const role of REQUIRED_ROLES) {
    const slot = byRole[role];
    if (slot.sourceAvailable !== true || slot.cartReady !== false
      || slot.latestSourceOccurrenceHash !== readiness[role]) {
      fail("EXACT_TERMS_READINESS_BINDING_INVALID");
    }
  }
  const body = {
    schema: OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.proposal,
    schemaVersion: "2.0.0",
    requestId: requestRecord.request.requestId,
    programHash: value.programHash,
    networkId: value.networkId,
    coordinatorBindingHash: value.coordinatorBindingHash,
    primaryReadinessRefHash: readiness.PRIMARY,
    recoveryReadinessRefHash: readiness.RECOVERY,
    independentWitnessReadinessRefHash: readiness.INDEPENDENT_WITNESS,
    currency: value.currency,
    totalAmountMinor,
    maximumLossMinor,
    completionDeadline: value.completionDeadline,
    validUntil,
    confirmationRequired: true,
    confirmationEffect: "ATOMIC_RESERVE_THREE_SLOTS_THEN_PRIMARY_COMMIT",
    outcomePromiseIssued: false,
  };
  return { ...body,
    proposalHash: digest(OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.proposal,
      body) };
}

function publicResponse(requestRecord, formation) {
  const state = formation.state;
  const nextAction = state === "COMMITMENT_PROPOSAL_READY"
    ? "CONFIRM_EXACT_PROPOSAL_ONCE"
    : state === "NEEDS_DESTINATION"
      ? "AUTHORIZE_DESTINATION_FOR_FORMATION"
      : state === "BACKGROUND_FORMING"
        ? "AUTOMATED_FORMATION_RESUME"
        : "NONE";
  return Object.freeze({
    schema: OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.response,
    schemaVersion: "2.0.0",
    requestId: requestRecord.request.requestId,
    programHash: requestRecord.program.programHash,
    state,
    outcome: requestRecord.program.outcome,
    formationDeadline: requestRecord.program.formationDeadline,
    completionDeadline: requestRecord.program.completionDeadline,
    formationAttempt: formation.ordinal,
    observedAt: formation.observedAt,
    exactCommitmentProposal: formation.exactCommitmentProposal,
    userActionRequired: state === "COMMITMENT_PROPOSAL_READY"
      || state === "NEEDS_DESTINATION",
    nextAction,
    humanQueueCreated: false,
    outsiderStaffTouchLimit: 0,
    outcomePromiseIssued: false,
  });
}

function confirmationPublic(record) {
  return Object.freeze({
    schema: OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.commitResult,
    schemaVersion: "2.0.0",
    requestId: record.requestId,
    proposalHash: record.proposalHash,
    networkId: record.networkId,
    state: record.atomicCoordinatorResult.networkState,
    atomicCoordinatorResult: record.atomicCoordinatorResult,
    outcomePromiseIssued: false,
    independentWitnessOutcomeStillRequired: true,
  });
}

/** Create the generic product entry; all resource I/O stays injected. */
export function createOutsiderOutcomeProductRuntimeV2(options = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)
    || Buffer.isBuffer(options)
    || Reflect.ownKeys(options).some((field) => ![
      "directory", "compileGoal", "prepareFormation", "restoreCoordinator",
      "clock", "formationEventSink",
    ].includes(field))
    || ["directory", "compileGoal", "prepareFormation", "restoreCoordinator",
      "clock"].some((field) => !Object.hasOwn(options, field))) {
    fail("OPTIONS_FIELDS_INVALID");
  }
  if (typeof options.directory !== "string" || options.directory.length < 1
    || typeof options.compileGoal !== "function"
    || typeof options.prepareFormation !== "function"
    || (options.restoreCoordinator !== null
      && typeof options.restoreCoordinator !== "function")
    || typeof options.clock !== "function"
    || (options.formationEventSink !== undefined
      && options.formationEventSink !== null
      && typeof options.formationEventSink !== "function")) fail("OPTIONS_INVALID");
  const directory = path.resolve(options.directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = statSync(directory);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) {
    fail("DIRECTORY_NOT_PRIVATE");
  }
  const coordinators = new Map();

  async function emitFormationEvent(requestRecord, formation) {
    if (options.formationEventSink === undefined
      || options.formationEventSink === null) return;
    const body = {
      schema: OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formationEvent,
      schemaVersion: "2.0.0",
      eventType: "FORMATION_SNAPSHOT_RECORDED",
      requestRefHash: digest("outsider/outcome-product-request-ref/v2", {
        requestFingerprint: requestRecord.requestFingerprint,
      }),
      programHash: requestRecord.program.programHash,
      formationSnapshotHash: digest(
        OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formation,
        formation),
      recordedAt: formation.observedAt,
      formation: jsonClone(formation, "FORMATION_EVENT_SNAPSHOT"),
      providerSourceBytesIncluded: false,
      outcomePromiseIssued: false,
    };
    const event = Object.freeze({ ...body, eventIdHash: digest(
      OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formationEvent, body) });
    let receipt;
    try { receipt = await options.formationEventSink(event); }
    catch { fail("FORMATION_EVENT_SINK_FAILED"); }
    exact(receipt, ["schema", "schemaVersion", "accepted", "eventIdHash",
      "duplicateDelivery"], "FORMATION_EVENT_SINK_RECEIPT");
    if (receipt.schema
        !== OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS
          .formationEventSinkReceipt
      || receipt.schemaVersion !== "2.0.0" || receipt.accepted !== true
      || receipt.eventIdHash !== event.eventIdHash
      || typeof receipt.duplicateDelivery !== "boolean") {
      fail("FORMATION_EVENT_SINK_RECEIPT_INVALID");
    }
  }

  function loadRequest(requestId) {
    if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
      fail("REQUEST_ID_INVALID");
    }
    return readRecord(requestPath(directory, requestId), "REQUEST_NOT_FOUND");
  }

  async function runFormation(requestRecord, formationAuthorization) {
    if (typeof formationAuthorization !== "object"
      || formationAuthorization === null
      || formationAuthorization.formationOperationsAuthorized !== true
      || formationAuthorization.commitWithoutSeparatePaymentAuthorization
        !== false
      || formationAuthorization.paymentAuthorized === true) {
      fail("FORMATION_ONLY_AUTHORIZATION_REQUIRED");
    }
    const previous = latestFormation(directory,
      requestRecord.request.requestId);
    const ordinal = (previous?.ordinal ?? 0) + 1;
    const observedAt = instant(options.clock(), "CLOCK");
    if (Date.parse(observedAt)
      >= Date.parse(requestRecord.program.formationDeadline)) {
      const expired = {
        schema: OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formation,
        schemaVersion: "2.0.0",
        requestId: requestRecord.request.requestId,
        programHash: requestRecord.program.programHash,
        ordinal,
        observedAt,
        state: "UNAVAILABLE",
        dispositionReason: "FORMATION_DEADLINE_REACHED",
        preparation: previous?.preparation ?? null,
        exactCommitmentProposal: null,
        humanQueueCreated: false,
        outcomePromiseIssued: false,
      };
      writeOnce(directory, formationPath(directory,
        requestRecord.request.requestId, ordinal), expired);
      await emitFormationEvent(requestRecord, expired);
      return publicResponse(requestRecord, expired);
    }
    const result = await options.prepareFormation(Object.freeze({
      request: requestRecord.request,
      program: requestRecord.program,
      formationAuthorization,
      previousFormation: previous,
    }));
    exact(result, ["coordinator", "preparation", "exactCommitment"],
      "FORMATION_RESULT");
    const coordinator
      = inspectAtomicBuyerNativeTemporaryNetworkCoordinatorV1(result.coordinator);
    const preparation = validatePreparation(result.preparation, coordinator);
    coordinators.set(coordinator.coordinatorBindingHash, coordinator);
    const proposal = proposalFromExactTerms(result.exactCommitment,
      requestRecord, preparation, coordinator, observedAt);
    let state;
    let dispositionReason;
    if (proposal !== null) {
      state = "COMMITMENT_PROPOSAL_READY";
      dispositionReason = "EXACT_THREE_SLOT_PROPOSAL_FORMED";
    } else if (preparation.networkState === "UNAVAILABLE") {
      state = "UNAVAILABLE";
      dispositionReason = "FORMATION_UNAVAILABLE";
    } else if (preparation.networkState === "NEEDS_ADDRESS_AND_PAYMENT"
      || preparation.networkState === "NEEDS_DESTINATION") {
      state = "NEEDS_DESTINATION";
      dispositionReason = "DESTINATION_REQUIRED_TO_FORM_EXACT_TERMS";
    } else {
      state = "BACKGROUND_FORMING";
      dispositionReason = "EXACT_THREE_SLOT_PROPOSAL_NOT_YET_FORMED";
    }
    const formation = {
      schema: OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formation,
      schemaVersion: "2.0.0",
      requestId: requestRecord.request.requestId,
      programHash: requestRecord.program.programHash,
      ordinal,
      observedAt,
      state,
      dispositionReason,
      preparation,
      exactCommitmentProposal: proposal,
      humanQueueCreated: false,
      outcomePromiseIssued: false,
    };
    writeOnce(directory, formationPath(directory,
      requestRecord.request.requestId, ordinal), formation);
    await emitFormationEvent(requestRecord, formation);
    return publicResponse(requestRecord, formation);
  }

  async function requestOutcome(input, injected = {}) {
    exact(injected, ["formationAuthorization"], "REQUEST_INJECTED");
    const normalized = normalizedRequest(input, options.clock);
    const file = requestPath(directory, normalized.request.requestId);
    let requestRecord;
    if (existsSync(file)) {
      requestRecord = readRecord(file, "REQUEST_NOT_FOUND");
      if (requestRecord.requestFingerprint !== normalized.requestFingerprint) {
        fail("REQUEST_ID_REUSED");
      }
      const formation = latestFormation(directory,
        normalized.request.requestId);
      if (formation !== null) {
        await emitFormationEvent(requestRecord, formation);
        return publicResponse(requestRecord, formation);
      }
    } else {
      if (Date.parse(normalized.request.completionDeadline)
        <= Date.parse(normalized.request.requestedAt)) {
        fail("COMPLETION_DEADLINE_NOT_FUTURE");
      }
      const program = validateProgram(await options.compileGoal(Object.freeze({
        ...normalized.request,
      })), normalized.request);
      requestRecord = {
        schema: OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.request,
        schemaVersion: "2.0.0",
        requestFingerprint: normalized.requestFingerprint,
        request: normalized.request,
        program,
      };
      writeOnce(directory, file, requestRecord);
    }
    return runFormation(requestRecord, injected.formationAuthorization);
  }

  async function resumeFormation(requestId, injected = {}) {
    exact(injected, ["formationAuthorization"], "RESUME_INJECTED");
    const requestRecord = loadRequest(requestId);
    const current = latestFormation(directory, requestId);
    if (current !== null && TERMINAL_FORMATION_STATES.has(current.state)) {
      await emitFormationEvent(requestRecord, current);
      return publicResponse(requestRecord, current);
    }
    return runFormation(requestRecord, injected.formationAuthorization);
  }

  async function coordinatorFor(requestRecord, formation) {
    const bindingHash = formation.exactCommitmentProposal
      .coordinatorBindingHash;
    if (coordinators.has(bindingHash)) return coordinators.get(bindingHash);
    if (options.restoreCoordinator === null) fail("COORDINATOR_REATTACH_REQUIRED");
    const restored = inspectAtomicBuyerNativeTemporaryNetworkCoordinatorV1(
      await options.restoreCoordinator(Object.freeze({
        request: requestRecord.request,
        program: requestRecord.program,
        preparation: formation.preparation,
        coordinatorBindingHash: bindingHash,
      })));
    if (restored.coordinatorBindingHash !== bindingHash
      || restored.networkId !== formation.exactCommitmentProposal.networkId) {
      fail("RESTORED_COORDINATOR_BINDING_MISMATCH");
    }
    coordinators.set(bindingHash, restored);
    return restored;
  }

  async function confirmOutcome(input, injected = {}) {
    exact(input, ["requestId", "proposalHash"], "CONFIRMATION_INPUT");
    exact(injected, ["paymentAndLossAuthorization"],
      "CONFIRMATION_INJECTED");
    if (typeof input.requestId !== "string" || !REQUEST_ID.test(input.requestId)) {
      fail("CONFIRMATION_REQUEST_ID_INVALID");
    }
    hash(input.proposalHash, "CONFIRMATION_PROPOSAL_HASH");
    const requestRecord = loadRequest(input.requestId);
    const formation = latestFormation(directory, input.requestId);
    if (formation === null || formation.state !== "COMMITMENT_PROPOSAL_READY"
      || formation.exactCommitmentProposal.proposalHash !== input.proposalHash) {
      fail("CONFIRMATION_PROPOSAL_NOT_CURRENT");
    }
    const confirmationObservedAt = instant(options.clock(), "CLOCK");
    const authorization = injected.paymentAndLossAuthorization;
    if (authorization === null || typeof authorization !== "object"
      || authorization.paymentAuthorized !== true
      || hash(authorization.approvalBindingHash,
        "PAYMENT_AUTHORIZATION_BINDING_HASH") === null
      || authorization.currency !== formation.exactCommitmentProposal.currency
      || BigInt(money(authorization.authorizedAmountMinor,
        "PAYMENT_AUTHORIZED_AMOUNT_MINOR"))
        < BigInt(formation.exactCommitmentProposal.totalAmountMinor)
      || BigInt(money(authorization.maximumLossMinor,
        "PAYMENT_MAXIMUM_LOSS_MINOR"))
        < BigInt(formation.exactCommitmentProposal.maximumLossMinor)
      || !HASH.test(authorization.deliveryAddressRefHash)
      || !HASH.test(authorization.paymentMethodRefHash)) {
      fail("PAYMENT_AUTHORIZATION_SCOPE_INSUFFICIENT");
    }
    const markerFile = confirmationPath(directory, input.requestId);
    const marker = {
      schema: OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.confirmation,
      schemaVersion: "2.0.0",
      requestId: input.requestId,
      proposalHash: input.proposalHash,
      approvalBindingHash: authorization.approvalBindingHash,
      confirmedAt: confirmationObservedAt,
    };
    const markerExists = existsSync(markerFile);
    if (markerExists) {
      const existing = readRecord(markerFile, "CONFIRMATION_NOT_FOUND");
      if (existing.proposalHash !== marker.proposalHash
        || existing.approvalBindingHash !== marker.approvalBindingHash) {
        fail("CONFIRMATION_REPLAY_MISMATCH");
      }
    }
    const resultFile = commitResultPath(directory, input.requestId);
    if (existsSync(resultFile)) {
      return confirmationPublic(readRecord(resultFile,
        "COMMIT_RESULT_NOT_FOUND"));
    }
    /* An already accepted marker may be recovering a crash after the atomic
       coordinator accepted the proposal. Only a new confirmation is barred by
       proposal expiry. */
    if (!markerExists && Date.parse(confirmationObservedAt)
      >= Date.parse(formation.exactCommitmentProposal.validUntil)) {
      fail("CONFIRMATION_PROPOSAL_EXPIRED");
    }
    const coordinator = await coordinatorFor(requestRecord, formation);
    const atomicCoordinatorResult = jsonClone(
      await coordinator.authorizeCommit(authorization), "ATOMIC_COMMIT_RESULT");
    if (atomicCoordinatorResult.networkId !== coordinator.networkId
      || atomicCoordinatorResult.userResultCommitted !== false) {
      fail("ATOMIC_COMMIT_RESULT_BOUNDARY_INVALID");
    }
    /* The atomic coordinator durably records and validates the factory-issued
       authorization before effects. Persist the product marker only after that
       gate accepts it, so a forged object cannot poison this request. */
    if (!markerExists) writeOnce(directory, markerFile, marker);
    const record = {
      schema: OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.commitResult,
      schemaVersion: "2.0.0",
      requestId: input.requestId,
      proposalHash: input.proposalHash,
      networkId: coordinator.networkId,
      atomicCoordinatorResult,
      outcomePromiseIssued: false,
    };
    writeOnce(directory, resultFile, record);
    return confirmationPublic(record);
  }

  return Object.freeze({
    requestOutcome,
    resumeFormation,
    confirmOutcome,
    inspect(requestId) {
      const requestRecord = loadRequest(requestId);
      const formation = latestFormation(directory, requestId);
      if (formation === null) fail("FORMATION_NOT_FOUND");
      return publicResponse(requestRecord, formation);
    },
  });
}
