/*
 * Current buyer-native resource-time hold adapter for Cal.com API v2.
 *
 * Native availability -> expiring slot hold -> source read -> release. A slot
 * can represent any owner's scheduled resource; this adapter never creates a
 * booking, sends an invitation, collects attendee data, or takes payment.
 *
 * reserve/release use the existing durable one-use effect ledger. Raw replies
 * stay in the caller's private directory. Provider-issued reservationUntil is
 * an option expiry, NOT a promise that work will occur at slotStart. The
 * standard RESERVED result can be consumed by existing resource orchestration,
 * but a five-minute hold cannot satisfy a later service obligation's horizon.
 * No Outsider owner signature or synthetic owner lifecycle is manufactured.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync,
  readFileSync, realpathSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import {
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
  replayDurableOneUseEndpointEffectStatesSinceV1,
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";

const ORIGIN = "https://api.cal.com";
const VERSION = "2024-09-04";
const CAPABILITY = "RESOURCE_TIME_SLOT_HOLD";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UID = /^[A-Za-z0-9_-]{1,128}$/u;
const MAX_BYTES = 1024 * 1024;

export const CALCOM_SLOT_RESERVATION_PROTOCOL = Object.freeze({
  apiOrigin: ORIGIN,
  apiVersion: VERSION,
  capability: CAPABILITY,
  defaultReservationDurationMinutes: 5,
  availability: "GET /v2/slots",
  reserve: "POST /v2/slots/reservations",
  read: "GET /v2/slots/reservations/{uid}",
  release: "DELETE /v2/slots/reservations/{uid}",
  reservationDurationIsServiceDuration: false,
  bookingPerformed: false,
  paymentPerformed: false,
  independentOwnerIdentityEstablished: false,
  independentOutcomeTruthEstablished: false,
  outcomeCommitIssued: false,
  primarySourceRevision: "abffde336e744e15cf69626c10e436d6172bc406",
  sources: Object.freeze([
    "https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type",
    "https://cal.com/docs/api-reference/v2/slots/reserve-a-slot",
    "https://cal.com/docs/api-reference/v2/slots/get-reserved-slot",
    "https://cal.com/docs/api-reference/v2/slots/delete-a-reserved-slot",
    "https://github.com/calcom/cal.com/blob/abffde336e744e15cf69626c10e436d6172bc406/apps/api/v2/src/modules/slots/slots-2024-09-04/controllers/slots.controller.ts",
  ]),
});

function fail(code) {
  const error = new TypeError(`OUTSIDER_CALCOM_SLOT_${code}`);
  error.outsiderCode = code;
  throw error;
}
function hash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function digest(value) { return hash(canonicalizeStrict(value)); }
function instant(value) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    || !Number.isFinite(Date.parse(value))) fail("INSTANT_INVALID");
  return new Date(value).toISOString();
}
function positive(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail("POSITIVE_INTEGER_REQUIRED");
  return value;
}
function privateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  return realpathSync(directory);
}
function writeOnce(file, bytes) {
  const fd = openSync(file, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  finally { closeSync(fd); }
  const parent = openSync(path.dirname(file), "r");
  try { fsyncSync(parent); } finally { closeSync(parent); }
}
function readSource(file) {
  const bytes = readFileSync(file);
  const source = JSON.parse(bytes.toString("utf8"));
  return { ...source, providerReceipt: hash(bytes) };
}
function sourceJson(source) {
  try { return JSON.parse(Buffer.from(source.bodyBase64, "base64").toString("utf8")); }
  catch { return null; }
}

/** Credentials and raw source bytes remain local to this adapter. */
export function createCalComSlotReservationAdapter(config = {}) {
  const eventTypeId = positive(config.eventTypeId);
  if (typeof config.directory !== "string" || !config.directory
    || (config.variableLength !== undefined && typeof config.variableLength !== "boolean")
    || (config.apiToken !== undefined
      && (typeof config.apiToken !== "string" || !config.apiToken))) {
    fail("CONFIG_INVALID");
  }
  const root = privateDirectory(path.resolve(config.directory));
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const clock = config.clock ?? (() => new Date().toISOString());
  if (typeof fetchImpl !== "function" || typeof clock !== "function") fail("CONFIG_INVALID");
  const requestTimeoutMs = positive(config.requestTimeoutMs ?? 15_000);
  if (requestTimeoutMs > 60_000) fail("REQUEST_TIMEOUT_EXCEEDS_60000_MS");
  const now = () => instant(clock());
  const adapterId = config.adapterId ?? "calcom-slot-reservation";
  const sourceRoot = privateDirectory(path.join(root, "sources"));

  async function request(method, pathname, body, file) {
    const headers = { "cal-api-version": VERSION, accept: "application/json" };
    if (config.apiToken) headers.Authorization = `Bearer ${config.apiToken}`;
    if (body !== null) headers["content-type"] = "application/json";
    const response = await fetchImpl(`${ORIGIN}${pathname}`, {
      method, headers, redirect: "error", signal: AbortSignal.timeout(requestTimeoutMs),
      ...(body === null ? {} : { body: canonicalizeStrict(body) }),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES) fail("RESPONSE_TOO_LARGE");
    const source = {
      method, path: pathname, requestBodyHash: body === null ? null : digest(body),
      observedAt: now(), status: response.status,
      contentType: response.headers.get("content-type"),
      providerDate: response.headers.get("date"), bodyBase64: bytes.toString("base64"),
    };
    writeOnce(file, Buffer.from(canonicalizeStrict(source)));
    return readSource(file);
  }

  async function observe(method, pathname) {
    return request(method, pathname, null,
      path.join(sourceRoot, `${randomBytes(16).toString("hex")}.json`));
  }

  // Ledger bindings carry the same caller-issued program/grant references as
  // other native adapters. Possessing hashes does not issue a new authority.
  async function oneUse({ method, pathname, body, operationId, programHash,
    requirementId, permissionGrantHash, deadline, requestContextHash = null,
    observeOnly = false }) {
    if (typeof operationId !== "string" || !operationId
      || typeof requirementId !== "string" || !requirementId
      || !HASH.test(programHash ?? "") || !HASH.test(permissionGrantHash ?? "")) {
      fail("OPERATION_BINDING_INVALID");
    }
    const effectDeadline = instant(deadline);
    const effectIdHash = digest({ adapterId, programHash, requirementId, operationId });
    const effectRoot = privateDirectory(path.join(root, effectIdHash.slice(7)));
    const ledgerDirectory = path.join(effectRoot, "effect-ledger");
    const ledgerId = `ledger_${effectIdHash.slice(7, 39)}`;
    const file = path.join(effectRoot, "source.json");
    const binding = {
      effectIdHash,
      transactionBindingHash: digest({ programHash, requirementId, requestContextHash }),
      endpointBindingHash: digest({ origin: ORIGIN, method, pathname, version: VERSION }),
      adapterInstanceRefHash: digest({ adapterId, eventTypeId }),
      permissionGrantHash,
      oneUseNonceHash: digest({ effectIdHash, kind: "nonce" }),
      idempotencyKeyHash: digest({ effectIdHash, kind: "local-operation-key" }),
      bodyHash: digest(body), effectDeadline,
    };
    let currentEvent = null;
    let verification;
    const event = (eventType, receipt = null) => createDurableOneUseEndpointEffectEventV1({
      ...binding, ledgerId, eventType, recordedAt: now(),
      previousEffectEventHash: currentEvent?.eventHash ?? null,
      occurrenceNonceHash: hash(randomBytes(32)), endpointReceiptHash: receipt,
      terminalEvidenceHash: null,
    });
    const append = (type, receipt = null) => {
      const next = event(type, receipt);
      verification = appendDurableOneUseEndpointEffectLedgerV1({
        directory: ledgerDirectory, ledgerId, event: next,
        expectedLocalHeadHash: verification.head.headHash,
      });
      currentEvent = next;
    };
    if (existsSync(ledgerDirectory)) {
      verification = verifyDurableOneUseEndpointEffectLedgerV1({
        directory: ledgerDirectory, ledgerId, expectedLocalHeadHash: null,
      });
      if (!verification.ok) fail("EFFECT_LEDGER_INVALID");
      const replay = replayDurableOneUseEndpointEffectStatesSinceV1({
        directory: ledgerDirectory, ledgerId,
        expectedAncestorHeadHash: verification.head.headHash, effectIdHashes: [effectIdHash],
      });
      currentEvent = replay.effects[0]?.currentEvent;
      if (!currentEvent || Object.entries(binding).some(([key, value]) => currentEvent[key] !== value)) {
        fail("OPERATION_REUSED_WITH_DIFFERENT_INPUT");
      }
      if (existsSync(file)) {
        const source = readSource(file);
        if (currentEvent.eventType === "SUBMIT_ATTEMPTED") {
          append("ENDPOINT_RECEIPT_OBSERVED", source.providerReceipt);
        } else if (currentEvent.eventType !== "ENDPOINT_RECEIPT_OBSERVED"
          || currentEvent.endpointReceiptHash !== source.providerReceipt) fail("SOURCE_RECEIPT_MISMATCH");
        return source;
      }
      if (["SUBMIT_ATTEMPTED", "ENDPOINT_RECEIPT_OBSERVED"].includes(currentEvent.eventType)) {
        return { ambiguous: true, reason: "AMBIGUOUS_NO_RETRY", providerReceipt: null };
      }
    } else {
      if (observeOnly) {
        return { notSubmitted: true, reason: "NO_LOCAL_SUBMISSION", providerReceipt: null };
      }
      if (Date.parse(now()) >= Date.parse(effectDeadline)) {
        return { expired: true, reason: "EXPIRED_BEFORE_EFFECT", providerReceipt: null };
      }
      currentEvent = event("INTENT_ADMITTED");
      verification = initializeDurableOneUseEndpointEffectLedgerV1({
        directory: ledgerDirectory, ledgerId, genesisEvent: currentEvent,
      });
    }
    if (observeOnly) {
      return { notSubmitted: true, reason: "NOT_SUBMITTED", providerReceipt: null };
    }
    if (Date.parse(now()) >= Date.parse(effectDeadline)) {
      return { expired: true, reason: "EXPIRED_BEFORE_EFFECT", providerReceipt: null };
    }
    if (currentEvent.eventType === "INTENT_ADMITTED") append("SUBMIT_RESERVED");
    append("SUBMIT_ATTEMPTED");
    let source;
    try { source = await request(method, pathname, body, file); }
    catch { return { ambiguous: true, reason: "AMBIGUOUS_NO_RETRY", providerReceipt: null }; }
    append("ENDPOINT_RECEIPT_OBSERVED", source.providerReceipt);
    return source;
  }

  function slot(requirement) {
    const value = requirement?.constraints;
    if (requirement?.capability !== CAPABILITY || value?.eventTypeId !== eventTypeId) {
      fail("REQUIREMENT_MISMATCH");
    }
    return {
      eventTypeId, slotStart: instant(value.slotStart), slotDuration: positive(value.slotDuration),
      ...(value.reservationDuration === undefined ? {}
        : { reservationDuration: positive(value.reservationDuration) }),
    };
  }
  function handle(reservation) {
    const state = reservation?.adapterState;
    if (!state || state.eventTypeId !== eventTypeId
      || !UID.test(state.reservationUid ?? "")
      || reservation.reservationId !== `calcom-slot:${state.reservationUid}`) fail("RESERVATION_INVALID");
    return state;
  }
  function reserveResult(source, expected, expectedUid = null) {
    if (source.ambiguous || source.expired || source.notSubmitted) return { status: "UNAVAILABLE", ...source };
    const json = sourceJson(source);
    const data = json?.data;
    if (source.status === 404 || (source.status === 200 && json?.status === "success" && data === null)) {
      return { status: "UNAVAILABLE", reason: "RESERVATION_NOT_CURRENT", providerReceipt: source.providerReceipt };
    }
    if (![200, 201].includes(source.status) || json?.status !== "success") {
      return { status: "UNAVAILABLE", reason: "PROVIDER_REJECTED", providerStatus: source.status,
        providerReceipt: source.providerReceipt };
    }
    const uid = data?.reservationUid;
    if (!UID.test(uid ?? "") || (expectedUid !== null && uid !== expectedUid)
      || data.eventTypeId !== eventTypeId || instant(data.slotStart) !== expected.slotStart
      || data.slotDuration !== expected.slotDuration
      || Date.parse(instant(data.slotEnd)) - Date.parse(expected.slotStart) !== expected.slotDuration * 60_000) {
      fail("RESERVATION_SOURCE_IDENTITY_MISMATCH");
    }
    const validUntil = instant(data.reservationUntil);
    if (Date.parse(validUntil) <= Date.parse(now())) {
      return { status: "EXPIRED", reason: "PROVIDER_RESERVATION_EXPIRED", validUntil,
        providerReceipt: source.providerReceipt };
    }
    return {
      status: "RESERVED", reservationId: `calcom-slot:${uid}`, validUntil,
      providerReceipt: source.providerReceipt,
      adapterState: {
        eventTypeId, reservationUid: uid, slotStart: expected.slotStart,
        slotEnd: instant(data.slotEnd), slotDuration: expected.slotDuration,
        reservationUntil: validUntil, observedAt: source.observedAt,
        sourceClass: "PROVIDER_NATIVE_SLOT_RESERVATION",
        expiryIssuedByProvider: true, ownerIdentityEstablished: false,
        serviceExecutionPromised: false, bookingPerformed: false,
      },
    };
  }

  function reserveRequest({ program, requirement, operationId, permissionGrantHash }) {
    const expected = slot(requirement);
    // Fixed-length event types reject an explicit slotDuration. Its expected
    // value is still bound to the operation and checked against the reply.
    const { slotDuration, ...fixedBody } = expected;
    const body = config.variableLength === true ? expected : fixedBody;
    return { expected, body, method: "POST", pathname: "/v2/slots/reservations",
      operationId, programHash: program?.programHash, requirementId: requirement.requirementId,
      permissionGrantHash, deadline: program?.formationDeadline,
      requestContextHash: digest(expected) };
  }

  const adapter = {
    adapterId, providerRef: "cal.com", failureDomainRef: "cal.com",
    roles: Object.freeze(["PRIMARY", "RECOVERY"]),
    capabilities: Object.freeze([CAPABILITY]), protocol: CALCOM_SLOT_RESERVATION_PROTOCOL,
    supports(requirement) { try { slot(requirement); return true; } catch { return false; } },
    async discover({ start, end, timeZone = "UTC" }) {
      const from = instant(start); const until = instant(end);
      if (Date.parse(from) >= Date.parse(until)) fail("DISCOVERY_WINDOW_INVALID");
      const query = new URLSearchParams({ eventTypeId: String(eventTypeId), start: from,
        end: until, timeZone, format: "range" });
      const source = await observe("GET", `/v2/slots?${query}`);
      const json = sourceJson(source);
      if (source.status !== 200 || json?.status !== "success" || !json.data) {
        return { status: "UNAVAILABLE", providerStatus: source.status, providerReceipt: source.providerReceipt };
      }
      const slots = Object.values(json.data).flat().map((entry) => ({
        start: instant(entry.start), end: instant(entry.end),
      }));
      return { status: "OBSERVED", eventTypeId, observedAt: source.observedAt, slots,
        providerReceipt: source.providerReceipt, capacityReserved: false };
    },
    async reserve(context) {
      const request = reserveRequest(context);
      if (request.body.reservationDuration !== undefined && !config.apiToken) {
        return { status: "UNAVAILABLE", reason: "CUSTOM_DURATION_REQUIRES_AUTHENTICATION" };
      }
      return reserveResult(await oneUse(request), request.expected);
    },
    async reconcileReserve(context) {
      const request = reserveRequest(context);
      // Never turn reconciliation into a new POST, including after restart.
      const source = await oneUse({ ...request, observeOnly: true });
      if (!source.ambiguous) return reserveResult(source, request.expected);
      const start = request.expected.slotStart;
      const end = new Date(Date.parse(start) + request.expected.slotDuration * 60_000).toISOString();
      const availability = await adapter.discover({ start, end });
      const available = availability.status === "OBSERVED"
        ? availability.slots.some((item) => item.start === start && item.end === end) : null;
      // No UID means Cal offers no correlation-safe lookup. Availability can
      // change because of another buyer; neither presence nor absence tells
      // us that this operation reserved or released the slot.
      return { status: "UNAVAILABLE", reason: "RESERVATION_UID_UNKNOWN", ambiguous: true,
        effectStatus: "UNKNOWN", retryAllowed: false, capacityOwned: false,
        slotCurrentlyAvailable: available, providerReceipt: availability.providerReceipt,
        availabilityObservedAt: availability.observedAt ?? null };
    },
    async readReservation({ reservation }) {
      const state = handle(reservation);
      // The pinned official controller exposes GET/DELETE without an auth
      // guard; its generated documentation incorrectly marks Bearer required.
      const source = await observe("GET", `/v2/slots/reservations/${encodeURIComponent(state.reservationUid)}`);
      return reserveResult(source, state, state.reservationUid);
    },
    async release({ reservation, program, requirementId, operationId, permissionGrantHash, deadline }) {
      const state = handle(reservation);
      const source = await oneUse({ method: "DELETE",
        pathname: `/v2/slots/reservations/${encodeURIComponent(state.reservationUid)}`, body: null,
        operationId, programHash: program?.programHash, requirementId, permissionGrantHash,
        deadline: deadline ?? program?.completionDeadline });
      if (source.ambiguous) {
        // A timed-out DELETE may have succeeded. The exact known UID permits
        // a safe read without resending the effect or guessing from slots.
        const current = await adapter.readReservation({ reservation });
        if (current.reason === "RESERVATION_NOT_CURRENT") {
          return { status: "RELEASED", reason: "RESERVATION_NOT_CURRENT_AFTER_AMBIGUOUS_RELEASE",
            receipt: current.providerReceipt, releaseAttributionConfirmed: false,
            reconciledBy: "PROVIDER_UID_READ", bookingCanceled: false };
        }
        return { status: "OPEN", ...source, currentReservationStatus: current.status,
          reconciliationReceipt: current.providerReceipt, retryAllowed: false };
      }
      if (source.expired) return { status: "OPEN", ...source };
      const json = sourceJson(source);
      const closed = source.status === 404 || (source.status === 200 && json?.status === "success");
      return { status: closed ? "RELEASED" : "OPEN", providerStatus: source.status,
        receipt: source.providerReceipt, bookingCanceled: false };
    },
    async execute() {
      return { status: "FAILED", reason: "SLOT_HOLD_REQUIRES_SEPARATE_BOOKING_ADAPTER" };
    },
  };
  return Object.freeze(adapter);
}
