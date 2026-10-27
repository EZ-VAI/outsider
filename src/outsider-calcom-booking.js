/* A buyer-native booking, deliberately separate from the five-minute hold.
 * Public discovery is not consent; only a confirmed task with a separately
 * approved attendee scope can create/cancel. Native UIDs and contacts stay in
 * the private connection/receipt store, never in graph output bindings. */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createCalComSlotReservationAdapter } from "./outsider-calcom-slot-reservation-adapter.js";
import { publicDatasetHash as digest } from "./outsider-public-dataset.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce,
  withUserHeldExecutionLockV2 } from "./outsider-user-held-durable-execution-v2.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const ORIGIN = "https://api.cal.com", BOOKING_VERSION = "2026-02-25", EVENT_VERSION = "2024-06-14";
export const CALCOM_BOOKING_CAPABILITY = "RESOURCE_TIME_SLOT_BOOKING_V1";
export const CALCOM_BOOKING_CONTRACT = "FREE_SCHEDULED_BOOKING_ACCEPTED_AND_CURRENT_NOT_ATTENDANCE_V1";
export const CALCOM_BOOKING_FAILURE_POLICY = "CANCEL_ON_OUTCOME_FAILURE";
const fail = code => { throw Object.assign(new Error(`CALCOM_BOOKING_${code}`), { code: `CALCOM_BOOKING_${code}` }); };
const instant = value => {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) fail("TIME_INVALID");
  return new Date(value).toISOString();
};
export function normalizeCalComBookingInput(value) {
  if (!value || !["eventUrl,windowEnd,windowStart", "eventUrl,failurePolicy,windowEnd,windowStart"].includes(Object.keys(value).sort().join(","))
    || Object.hasOwn(value, "failurePolicy") && value.failurePolicy !== CALCOM_BOOKING_FAILURE_POLICY) fail("INPUT_INVALID");
  const url = new URL(value.eventUrl);
  if (url.origin !== "https://cal.com" || url.username || url.password || url.search || url.hash
    || !/^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/?$/u.test(url.pathname)) fail("PUBLIC_EVENT_URL_INVALID");
  const windowStart = instant(value.windowStart), windowEnd = instant(value.windowEnd);
  if (Date.parse(windowEnd) <= Date.parse(windowStart) || Date.parse(windowEnd) - Date.parse(windowStart) > 3 * 86400000) fail("WINDOW_INVALID");
  return { eventUrl: `${url.origin}${url.pathname.replace(/\/$/u, "")}`, windowStart, windowEnd,
    ...(Object.hasOwn(value, "failurePolicy") ? { failurePolicy: value.failurePolicy } : {}) };
}

export function loadCalComBookingProfile(file) {
  if (!path.isAbsolute(file ?? "")) fail("PROFILE_REQUIRED");
  const profile = read(file), attendee = profile.attendee, scope = profile.scope;
  if (profile.schema !== "outsider/calcom-booking-connection/v1" || !attendee
    || Object.keys(attendee).sort().join(",") !== "email,name,timeZone"
    || typeof attendee.name !== "string" || !attendee.name.trim() || attendee.name.length > 100
    || typeof attendee.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(attendee.email)
    || !scope || !Array.isArray(scope.allowedEventUrls) || !scope.allowedEventUrls.length
    || scope.maximumBookings !== 1 || scope.maximumAmountMinor !== "0"
    || !path.isAbsolute(profile.scopeDirectory ?? "")
    || typeof scope.createBookingApproved !== "boolean" || typeof scope.cancelBookingApproved !== "boolean") fail("PROFILE_INVALID");
  new Intl.DateTimeFormat("en", { timeZone: attendee.timeZone });
  instant(scope.expiresAt);
  if ((scope.createBookingApproved || scope.cancelBookingApproved)
    && (!path.isAbsolute(scope.authorizationSourceFile ?? "") || digest(read(scope.authorizationSourceFile)) !== scope.authorizationSourceHash))
    fail("CONSENT_SOURCE_REQUIRED");
  return { ...profile, profileHash: digest(profile) };
}

export function createCalComBookingAdapter({ directory, profileFile, clock = () => new Date().toISOString(), fetchImpl = globalThis.fetch }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`);
  const sources = path.join(directory, "sources"); mkdirSync(sources, { recursive: true, mode: 0o700 });
  async function request(method, pathname, body = null, version = BOOKING_VERSION, destination) {
    const response = await fetchImpl(`${ORIGIN}${pathname}`, { method, redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { accept: "application/json", "cal-api-version": version, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 1024 * 1024) fail("RESPONSE_TOO_LARGE");
    const source = { method, pathname, version, status: response.status, observedAt: clock(),
      requestBodyHash: body ? digest(body) : null, bodyBase64: bytes.toString("base64") };
    writeOnce(destination ?? path.join(sources, `${randomUUID()}.json`), source);
    return source;
  }
  const json = source => { try { return JSON.parse(Buffer.from(source.bodyBase64, "base64").toString("utf8")); } catch { return null; } };
  async function event(args) {
    const [username, slug] = new URL(args.eventUrl).pathname.slice(1).split("/");
    const source = await request("GET", `/v2/event-types?${new URLSearchParams({ username, eventSlug: slug })}`, null, EVENT_VERSION);
    const value = json(source), rows = Array.isArray(value?.data) ? value.data : value?.data?.eventTypes;
    const selected = rows?.find(row => row.slug === slug && row.bookingUrl?.replace(/\/$/u, "") === args.eventUrl);
    if (source.status !== 200 || !selected || !Number.isSafeInteger(selected.id)) fail("PUBLIC_EVENT_NOT_FOUND");
    // This first execution contract buys only free, single, automatically
    // accepted slots. Other commercial/confirmation terms remain a frontier.
    if (selected.price !== 0 || selected.recurrence || selected.seats?.disabled !== true
      || selected.confirmationPolicy?.disabled !== true || selected.bookingRequiresAuthentication !== false
      || selected.requiresBookerEmailVerification !== false || selected.disableCancelling?.disabled !== false
      || !Number.isSafeInteger(selected.lengthInMinutes) || selected.lengthInMinutes < 1
      || selected.bookingFields?.some(row => row.required && !["name", "email"].includes(row.slug))) fail("EVENT_TERMS_NOT_SUPPORTED");
    return { eventTypeId: selected.id, title: selected.title, lengthInMinutes: selected.lengthInMinutes,
      currency: String(selected.currency).toUpperCase(), totalAmountMinor: "0", sourceHash: digest(source),
      eventTermsHash: digest({ id: selected.id, price: selected.price, currency: selected.currency,
        duration: selected.lengthInMinutes, seats: selected.seats, confirmation: selected.confirmationPolicy,
        locations: selected.locations, fields: selected.bookingFields }), observedAt: source.observedAt };
  }
  function connection(prepared, verb) {
    const profile = loadCalComBookingProfile(profileFile);
    if (prepared.connectionHash !== profile.profileHash) fail("CONNECTION_CHANGED");
    if (Date.parse(clock()) >= Date.parse(profile.scope.expiresAt)
      || !profile.scope.allowedEventUrls.includes(prepared.input.eventUrl)) fail("OUTSIDE_APPROVED_RESOURCE_SCOPE");
    if (verb && !profile.scope[verb === "CREATE" ? "createBookingApproved" : "cancelBookingApproved"]) fail(`${verb}_CONSENT_REQUIRED`);
    return profile;
  }
  function bookingProjection(source, prepared, expectedUid) {
    const value = json(source), b = value?.data;
    const attendee = loadCalComBookingProfile(profileFile).attendee;
    const matched = [200, 201].includes(source.status) && value?.status === "success" && b && /^[A-Za-z0-9_-]{1,128}$/u.test(b.uid ?? "")
      && (!expectedUid || b.uid === expectedUid) && b.eventTypeId === prepared.event.eventTypeId
      && Date.parse(b.start) === Date.parse(prepared.slotStart) && Date.parse(b.end) === Date.parse(prepared.slotEnd)
      && Array.isArray(b.attendees) && b.attendees.length === 1
      && b.attendees[0].email?.toLowerCase() === attendee.email.toLowerCase();
    return { state: matched ? b.status === "accepted" ? "ACCEPTED" : ["cancelled", "canceled"].includes(b.status) ? "CANCELLED"
      : "PENDING_PROVIDER_ACCEPTANCE" : "BOOKING_NOT_ATTRIBUTABLE",
      providerStatus: matched ? b.status : null, bookingRefHash: matched ? digest({ provider: "cal.com", uid: b.uid }) : null,
      receiptHash: digest(source), httpStatus: source.status, observedAt: source.observedAt,
      eventTypeId: prepared.event.eventTypeId, slotStart: prepared.slotStart, slotEnd: prepared.slotEnd,
      supplierServicePerformed: false, attendeeAttendanceProven: false, paymentPerformed: false };
  }
  function ownBooking(prepared) {
    if (!existsSync(file("create-response"))) fail("NO_LOCAL_BOOKING_RECEIPT");
    const source = read(file("create-response")), b = json(source)?.data;
    if (bookingProjection(source, prepared).state === "BOOKING_NOT_ATTRIBUTABLE") fail("NO_ATTRIBUTABLE_BOOKING");
    return b;
  }
  function assertFailureCancellationConsent(prepared, { completionDeadline } = {}) {
    if (prepared.input.failurePolicy !== CALCOM_BOOKING_FAILURE_POLICY) return;
    const profile = connection(prepared, "CANCEL");
    if (!completionDeadline) fail("FAILURE_CANCELLATION_DEADLINE_REQUIRED");
    if (Date.parse(profile.scope.expiresAt) <= Date.parse(instant(completionDeadline)))
      fail("FAILURE_CANCELLATION_SCOPE_EXPIRES_BEFORE_CLOSURE");
  }
  function inspectCreation(prepared, { programHash }) {
    const profile = loadCalComBookingProfile(profileFile);
    if (prepared.connectionHash !== profile.profileHash) fail("CONNECTION_CHANGED");
    const claimFile = path.join(profile.scopeDirectory, "create-claim.json");
    if (!existsSync(claimFile)) {
      if (existsSync(file("create-response"))) fail("CREATE_RECEIPT_WITHOUT_CLAIM");
      return { state: "NOT_REQUESTED", bookingRefHash: null, paymentPerformed: false };
    }
    const binding = { programHash, preparedHash: digest(prepared), directory: path.resolve(directory) };
    if (digest(read(claimFile)) !== digest(binding)) {
      if (existsSync(file("create-response"))) fail("CREATE_CLAIM_BINDING_CHANGED");
      return { state: "NOT_REQUESTED", bookingRefHash: null, paymentPerformed: false };
    }
    return existsSync(file("create-response")) ? bookingProjection(read(file("create-response")), prepared)
      : { state: "SUBMISSION_UNCERTAIN_NO_RESUBMIT", bookingRefHash: null, paymentPerformed: false };
  }
  return {
    async prepare(input) {
      const args = normalizeCalComBookingInput(input), profile = loadCalComBookingProfile(profileFile);
      if (!profile.scope.allowedEventUrls.includes(args.eventUrl) || Date.parse(clock()) >= Date.parse(profile.scope.expiresAt)) fail("OUTSIDE_APPROVED_RESOURCE_SCOPE");
      const observed = await event(args);
      const availability = await createCalComSlotReservationAdapter({ directory: path.join(directory, "availability"),
        eventTypeId: observed.eventTypeId, clock, fetchImpl }).discover({ start: args.windowStart, end: args.windowEnd });
      const slot = (availability.slots ?? []).filter(row => Date.parse(row.start) > Date.parse(clock())
        && Date.parse(row.start) >= Date.parse(args.windowStart) && Date.parse(row.end) <= Date.parse(args.windowEnd)
        && Date.parse(row.end) - Date.parse(row.start) === observed.lengthInMinutes * 60000).sort((a, b) => a.start.localeCompare(b.start))[0];
      if (!slot) fail("NO_AVAILABLE_SLOT");
      return { input: args, event: observed, slotStart: slot.start, slotEnd: slot.end,
        connectionHash: profile.profileHash, createBookingApproved: profile.scope.createBookingApproved,
        cancelBookingApproved: profile.scope.cancelBookingApproved, attendeeRefHash: digest(profile.attendee),
        availabilityReceipt: availability.providerReceipt, capacityAlreadyReserved: false,
        acceptanceContract: CALCOM_BOOKING_CONTRACT, bookingPersistsAfterTaskSuccess: true,
        financialMode: "SIMULATION_ONLY", capitalBacked: false };
    },
    assertCreateConsent(prepared) { connection(prepared, "CREATE"); },
    assertFailureCancellationConsent,
    inspectCreation,
    async create(prepared, { programHash, deadline }) {
      const profile = connection(prepared, "CREATE");
      mkdirSync(profile.scopeDirectory, { recursive: true, mode: 0o700 });
      return withUserHeldExecutionLockV2(digest({ directory: profile.scopeDirectory, kind: "CALCOM_ONE_BOOKING" }), async () => {
        const binding = { programHash, preparedHash: digest(prepared), directory: path.resolve(directory) };
        const claimFile = path.join(profile.scopeDirectory, "create-claim.json");
        if (existsSync(claimFile)) {
          if (digest(read(claimFile)) !== digest(binding)) fail("SINGLE_BOOKING_SCOPE_ALREADY_USED");
          if (existsSync(file("create-response"))) return bookingProjection(read(file("create-response")), prepared);
          return { state: "SUBMISSION_UNCERTAIN_NO_RESUBMIT", paymentPerformed: false };
        }
        if (!/^sha256:[a-f0-9]{64}$/u.test(programHash ?? "") || Date.parse(clock()) >= Date.parse(instant(deadline))
          || Date.parse(clock()) >= Date.parse(prepared.slotStart)) fail("CREATE_DEADLINE_EXPIRED");
        const current = await event(prepared.input);
        if (current.eventTermsHash !== prepared.event.eventTermsHash) fail("EVENT_TERMS_CHANGED_RECONFIRM_REQUIRED");
        if (prepared.input.failurePolicy === CALCOM_BOOKING_FAILURE_POLICY) {
          connection(prepared, "CREATE");
          assertFailureCancellationConsent(prepared, { completionDeadline: deadline });
          if (Date.parse(clock()) >= Date.parse(instant(deadline)) || Date.parse(clock()) >= Date.parse(prepared.slotStart))
            fail("CREATE_DEADLINE_EXPIRED");
        }
        // The durable claim precedes the POST. A transport timeout never
        // becomes a second booking (Cal does not promise idempotent POST).
        writeOnce(claimFile, binding);
        let source;
        try { source = await request("POST", "/v2/bookings", { eventTypeId: prepared.event.eventTypeId,
          start: prepared.slotStart, attendee: profile.attendee }, BOOKING_VERSION, file("create-response")); }
        catch { return { state: "SUBMISSION_UNCERTAIN_NO_RESUBMIT", paymentPerformed: false }; }
        return bookingProjection(source, prepared);
      });
    },
    async read(prepared) {
      connection(prepared); const b = ownBooking(prepared);
      const source = await request("GET", `/v2/bookings/${encodeURIComponent(b.uid)}`);
      return bookingProjection(source, prepared, b.uid);
    },
    async cancel(prepared) {
      connection(prepared, "CANCEL"); const b = ownBooking(prepared);
      return withUserHeldExecutionLockV2(digest({ directory, kind: "CALCOM_CANCEL_OWN_BOOKING" }), async () => {
        if (existsSync(file("cancel-response"))) return bookingProjection(read(file("cancel-response")), prepared, b.uid);
        if (existsSync(file("cancel-attempt"))) return { state: "CANCELLATION_UNCERTAIN_NO_RESUBMIT", paymentPerformed: false };
        writeOnce(file("cancel-attempt"), { bookingRefHash: digest({ provider: "cal.com", uid: b.uid }), attemptedAt: clock() });
        let source;
        try { source = await request("POST", `/v2/bookings/${encodeURIComponent(b.uid)}/cancel`,
          { cancellationReason: "Outsider: cancellation authorized for this exact booking." }, BOOKING_VERSION, file("cancel-response")); }
        catch { return { state: "CANCELLATION_UNCERTAIN_NO_RESUBMIT", paymentPerformed: false }; }
        return bookingProjection(source, prepared, b.uid);
      });
    },
  };
}
