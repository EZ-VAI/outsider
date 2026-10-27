/*
 * A read view of the existing durable adapter lifecycle for L2 composition.
 * The orchestrator remains the single reserve/execute/recover/release driver.
 * In particular, an adapter receipt is not converted into an owner-signed
 * capacity contract, and a program deadline is not a provider capacity SLA.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import { verifyOutcomeProgramV1 } from "./outsider-outcome-program-v1.js";

const PREFIX = "OUTSIDER_PROVIDER_RESOURCE_CAPABILITIES_";
const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function frozen(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}

function allInPrice(quote, program, requirement, binding, evaluatedAt) {
  if (quote === undefined || quote === null) return {
    status: "UNKNOWN", currency: null, amountMinor: null,
    observedAt: null, validUntil: null, sourceRefHash: null,
  };
  const fields = ["programHash", "requirementId", "adapterId", "currency",
    "amountMinor", "observedAt", "validUntil", "sourceRefHash"];
  if (typeof quote !== "object" || Array.isArray(quote)
    || Object.keys(quote).sort().join("\0") !== fields.sort().join("\0")
    || quote.programHash !== program.programHash
    || quote.requirementId !== requirement.requirementId
    || !binding || quote.adapterId !== binding.adapterId
    || quote.currency !== program.outcome.budget.currency
    || typeof quote.amountMinor !== "string"
    || !/^(0|[1-9][0-9]{0,30})$/u.test(quote.amountMinor)
    || !HASH.test(quote.sourceRefHash ?? "")) fail("PRICE_QUOTE_BINDING_INVALID");
  instant(quote.observedAt, "PRICE_OBSERVATION_TIME_INVALID");
  instant(quote.validUntil, "PRICE_VALID_UNTIL_INVALID");
  if (Date.parse(quote.observedAt) >= Date.parse(quote.validUntil)) {
    fail("PRICE_WINDOW_INVALID");
  }
  const status = Date.parse(evaluatedAt) < Date.parse(quote.observedAt)
    ? "NOT_YET_VALID" : Date.parse(evaluatedAt) >= Date.parse(quote.validUntil)
      ? "EXPIRED" : "QUOTED";
  return { status, currency: quote.currency, amountMinor: quote.amountMinor,
    observedAt: quote.observedAt, validUntil: quote.validUntil,
    sourceRefHash: quote.sourceRefHash };
}

function executionState(program, projection, requirement) {
  let state = "NOT_EXERCISED";
  for (const node of program.nodes) {
    const result = projection?.nodes?.[node.nodeId];
    const effect = node.primaryRequirementId === requirement.requirementId
      ? result?.primary : node.recoveryRequirementId === requirement.requirementId
        ? result?.recovery : node.witnessRequirementId === requirement.requirementId
          ? result?.witness : null;
    if (effect?.status) state = effect.status;
  }
  return state;
}

/**
 * Consume a projection returned by the existing orchestrator's inspect/run.
 * This function does no source I/O and does not itself replay that journal.
 * Use the current launcher's inspectResourceCapabilities for persisted reads.
 */
export function mapProviderResourceCapabilities({
  program: programInput, projection = null, evaluatedAt,
  adapters = {}, priceQuotesByRequirement = {},
}) {
  const program = verifyOutcomeProgramV1(programInput);
  instant(evaluatedAt, "EVALUATED_AT_INVALID");
  if (projection !== null && (projection?.schema
      !== "outsider/durable-outcome-program-orchestrator-projection/v1"
    || projection.programHash !== program.programHash
    || projection.programId !== program.programId
    || !HASH.test(projection.journalHeadHash ?? ""))) {
    fail("PROJECTION_PROGRAM_BINDING_INVALID");
  }
  if (!priceQuotesByRequirement || typeof priceQuotesByRequirement !== "object"
    || Array.isArray(priceQuotesByRequirement)
    || Object.keys(priceQuotesByRequirement).some((id) =>
      !program.requirements.some((row) => row.requirementId === id))) {
    fail("PRICE_QUOTE_REQUIREMENT_INVALID");
  }
  const capabilities = program.requirements.map((requirement) => {
    const id = requirement.requirementId;
    const binding = projection?.bindings?.[id] ?? null;
    const reservation = projection?.reservations?.[id] ?? null;
    const adapter = binding ? adapters[binding.adapterId] : null;
    if (reservation && (!binding || reservation.requirementId !== id
      || reservation.role !== requirement.role
      || typeof reservation.reservationId !== "string"
      || reservation.reservationId.length === 0)) fail("RESERVATION_BINDING_INVALID");
    if (reservation) instant(reservation.validUntil, "RESERVATION_EXPIRY_INVALID");
    const released = projection?.releases?.[id] !== null
      && projection?.releases?.[id] !== undefined;
    const effectState = executionState(program, projection, requirement);
    const expired = reservation !== null
      && Date.parse(evaluatedAt) >= Date.parse(reservation.validUntil);
    const state = !reservation ? "NOT_RESERVED" : released ? "RELEASED"
      : expired ? "EXPIRED" : effectState === "FAILED" ? "FAILED"
        : ["SUCCEEDED", "SATISFIED"].includes(effectState) ? "EXERCISED" : "RESERVED";
    const receiptPresent = reservation?.providerReceipt !== null
      && reservation?.providerReceipt !== undefined;
    const operationallyUsable = receiptPresent && ["RESERVED", "EXERCISED"].includes(state);
    const price = allInPrice(priceQuotesByRequirement[id], program,
      requirement, binding, evaluatedAt);
    const nextActions = state === "NOT_RESERVED"
      ? ["ACQUIRE_RESOURCE_THROUGH_EXISTING_FORMATION"]
      : state === "EXPIRED" ? ["RELEASE_EXPIRED_RESOURCE", "FORM_FRESH_RESOURCE_RESERVATION"]
        : state === "RELEASED" ? ["FORM_FRESH_RESOURCE_RESERVATION_IF_STILL_NEEDED"]
          : state === "FAILED" ? ["EXERCISE_RESERVED_RECOVERY_THROUGH_EXISTING_ORCHESTRATOR"]
            : [];
    if (price.status !== "QUOTED") nextActions.push("ACQUIRE_CURRENT_ALL_IN_RESOURCE_PRICE");
    if (!receiptPresent && reservation) nextActions.push("ACQUIRE_PROVIDER_RESERVATION_RECEIPT");
    return {
      requirementId: id, role: requirement.role, capability: requirement.capability,
      adapterId: binding?.adapterId ?? null,
      providerRef: adapter?.providerRef ?? binding?.providerRef ?? null,
      failureDomainRef: adapter?.failureDomainRef ?? null,
      state, executionState: effectState, operationallyUsable,
      validUntil: reservation?.validUntil ?? null,
      validityBasis: reservation?.providerReceipt?.formationRoutePreactivated === true
        ? "PROGRAM_REQUESTED_SERVICE_WINDOW" : reservation ? "ADAPTER_DECLARED_WINDOW" : null,
      reservationEvidenceBasis: receiptPresent ? "ADAPTER_PROVIDER_RECEIPT" : null,
      sourceFreshness: "NOT_REOBSERVED_BY_CAPABILITY_VIEW",
      providerReceiptHash: receiptPresent
        ? digest("outsider/provider-reservation-receipt", reservation.providerReceipt) : null,
      reservationRefHash: reservation ? digest("outsider/provider-resource-reservation", {
        programHash: program.programHash, requirementId: id,
        adapterId: binding.adapterId, reservationId: reservation.reservationId,
      }) : null,
      ownerIssuedCapacityEstablished: false,
      allInPrice: price,
      priceCompletenessBlocksResourceLifecycle: false,
      nextActions,
    };
  });
  return frozen({ programHash: program.programHash, evaluatedAt,
    journalHeadHash: projection?.journalHeadHash ?? null,
    capabilities,
    boundary: { view: "EXISTING_DURABLE_ADAPTER_LIFECYCLE",
      providerIoPerformed: false, sourceJournalReplayedByThisMapper: false,
      externalOwnerHoldCreated: false, authorizesPayment: false,
      changesExistingCommitGate: false } });
}
