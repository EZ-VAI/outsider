import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCalComSlotReservationAdapter } from "../src/outsider-calcom-slot-reservation-adapter.js";

const now = "2026-09-05T12:00:00.000Z";
const program = { programHash: `sha256:${"1".repeat(64)}`,
  formationDeadline: "2026-09-05T12:03:00.000Z", completionDeadline: "2026-09-05T12:10:00.000Z" };
const requirement = { requirementId: "resource-primary", capability: "RESOURCE_TIME_SLOT_HOLD",
  constraints: { eventTypeId: 123, slotStart: "2026-09-08T14:00:00.000Z", slotDuration: 30 } };
const permissionGrantHash = `sha256:${"2".repeat(64)}`;
const data = { eventTypeId: 123, slotStart: "2026-09-08T14:00:00.000Z",
  slotEnd: "2026-09-08T14:30:00.000Z", slotDuration: 30,
  reservationUid: "e84be5a3-4696-49e3-acc7-b2f3999c3b94", reservationDuration: 5,
  reservationUntil: "2026-09-05T12:05:00.000Z" };
const context = { program, requirement, operationId: "reserve-1", permissionGrantHash };
const reply = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
function setup(fetchImpl, extra = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-cal-slot-"));
  const config = { directory, eventTypeId: 123, clock: () => now, fetchImpl, ...extra };
  return { config, adapter: createCalComSlotReservationAdapter(config), directory };
}
function files(root) {
  return readdirSync(root).flatMap((name) => {
    const file = path.join(root, name);
    return statSync(file).isDirectory() ? files(file) : [file];
  });
}

test("native hold keeps provider expiry and cold replay performs no second POST", async () => {
  const calls = [];
  const { config, adapter, directory } = setup(async (url, init) => {
    calls.push({ url, init }); return reply({ status: "success", data }, 201);
  });
  const held = await adapter.reserve(context);
  assert.equal(held.status, "RESERVED");
  assert.equal(held.validUntil, data.reservationUntil);
  assert.notEqual(held.validUntil, program.completionDeadline);
  assert.equal(held.adapterState.serviceExecutionPromised, false);
  assert.equal(held.adapterState.expiryIssuedByProvider, true);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    eventTypeId: requirement.constraints.eventTypeId, slotStart: requirement.constraints.slotStart,
  });
  assert.equal(calls[0].url, "https://api.cal.com/v2/slots/reservations");
  assert.equal(calls[0].init.headers["cal-api-version"], "2024-09-04");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  const cold = createCalComSlotReservationAdapter(config);
  assert.deepEqual(await cold.reserve(context), held);
  assert.equal(calls.length, 1);
  for (const file of files(directory)) assert.equal(statSync(file).mode & 0o777, 0o600);
});

test("ambiguous reserve persists one-use state across restart and changed bodies cannot reuse it", async () => {
  let calls = 0;
  const { config, adapter } = setup(async () => { calls += 1; throw new Error("lost receipt"); });
  assert.equal((await adapter.reserve(context)).reason, "AMBIGUOUS_NO_RETRY");
  assert.equal((await createCalComSlotReservationAdapter(config).reserve(context)).reason, "AMBIGUOUS_NO_RETRY");
  assert.equal(calls, 1);
  await assert.rejects(() => adapter.reserve({ ...context, requirement: {
    ...requirement, constraints: { ...requirement.constraints, slotDuration: 60 },
  } }), /OPERATION_REUSED_WITH_DIFFERENT_INPUT/u);
  assert.equal(calls, 1);
});

test("authenticated native lifecycle reads exact UID and release does not create a booking", async () => {
  const calls = [];
  const { adapter, config, directory } = setup(async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.Authorization });
    return reply({ status: "success", ...(init.method === "DELETE" ? {} : { data }) }, init.method === "POST" ? 201 : 200);
  }, { apiToken: "cal_private_fixture_token" });
  const reservation = await adapter.reserve(context);
  assert.equal((await adapter.readReservation({ reservation })).status, "RESERVED");
  const release = { reservation, program, requirementId: requirement.requirementId,
    operationId: "release-1", permissionGrantHash };
  assert.equal((await adapter.release(release)).status, "RELEASED");
  assert.equal((await createCalComSlotReservationAdapter(config).release(release)).status, "RELEASED");
  assert.deepEqual(calls.map((item) => item.method), ["POST", "GET", "DELETE"]);
  assert.ok(calls.slice(1).every((item) => item.url.endsWith(`/reservations/${data.reservationUid}`)));
  assert.ok(calls.every((item) => item.auth === "Bearer cal_private_fixture_token"));
  for (const file of files(directory)) assert.ok(!readFileSync(file, "utf8").includes("cal_private_fixture_token"));
  assert.equal((await adapter.execute()).reason, "SLOT_HOLD_REQUIRES_SEPARATE_BOOKING_ADAPTER");
});

test("anonymous lifecycle follows pinned official controller; only custom duration requires authentication", async () => {
  let calls = 0;
  const { adapter } = setup(async (_url, init) => {
    calls += 1;
    assert.equal(init.headers.Authorization, undefined);
    return reply({ status: "success", ...(init.method === "DELETE" ? {} : { data }) },
      init.method === "POST" ? 201 : 200);
  });
  const reservation = await adapter.reserve(context);
  assert.equal((await adapter.readReservation({ reservation })).status, "RESERVED");
  assert.equal((await adapter.release({ reservation, program,
    requirementId: requirement.requirementId, operationId: "anonymous-release", permissionGrantHash })).status, "RELEASED");
  assert.equal((await adapter.reserve({ ...context, operationId: "reserve-long",
    requirement: { ...requirement, constraints: { ...requirement.constraints, reservationDuration: 10 } },
  })).reason, "CUSTOM_DURATION_REQUIRES_AUTHENTICATION");
  assert.equal(calls, 3);
});

test("wrong source identity is preserved but rejected; expired receipts are not current capacity", async () => {
  let calls = 0;
  const { adapter, config } = setup(async () => { calls += 1;
    return reply({ status: "success", data: { ...data, eventTypeId: 456 } }, 201); });
  await assert.rejects(() => adapter.reserve(context), /RESERVATION_SOURCE_IDENTITY_MISMATCH/u);
  await assert.rejects(() => createCalComSlotReservationAdapter(config).reserve(context), /RESERVATION_SOURCE_IDENTITY_MISMATCH/u);
  assert.equal(calls, 1);
  const expired = setup(async () => reply({ status: "success", data: { ...data, reservationUntil: now } }, 201));
  assert.equal((await expired.adapter.reserve(context)).status, "EXPIRED");
});

test("availability is a read-only source observation, never a reservation", async () => {
  const calls = [];
  const { adapter } = setup(async (url, init) => { calls.push({ url, method: init.method });
    return reply({ status: "success", data: { "2026-09-08": [{ start: data.slotStart, end: data.slotEnd }] } }); });
  const result = await adapter.discover({ start: "2026-09-08T00:00:00Z", end: "2026-09-09T00:00:00Z" });
  assert.equal(result.capacityReserved, false);
  assert.equal(result.slots.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.ok(calls[0].url.includes("eventTypeId=123"));
});

test("reserve reconciliation never submits a missing operation", async () => {
  const { adapter } = setup(async () => { throw new Error("must not call provider"); });
  const result = await adapter.reconcileReserve(context);
  assert.equal(result.reason, "NO_LOCAL_SUBMISSION");
  assert.equal(result.notSubmitted, true);
});

test("unknown reserve UID remains unknown even if its slot is currently available", async () => {
  const calls = [];
  const { adapter, config } = setup(async (_url, init) => {
    calls.push(init.method);
    if (init.method === "POST") throw new Error("response lost");
    return reply({ status: "success", data: { "2026-09-08": [{ start: data.slotStart, end: data.slotEnd }] } });
  });
  await adapter.reserve(context);
  const result = await createCalComSlotReservationAdapter(config).reconcileReserve(context);
  assert.equal(result.effectStatus, "UNKNOWN");
  assert.equal(result.slotCurrentlyAvailable, true);
  assert.equal(result.capacityOwned, false);
  assert.equal(result.retryAllowed, false);
  assert.deepEqual(calls, ["POST", "GET"]);
});

test("reserve reconciliation recovers a durable receipt without resubmission", async () => {
  let calls = 0;
  const { adapter, config } = setup(async () => { calls += 1; return reply({ status: "success", data }, 201); });
  const reserved = await adapter.reserve(context);
  assert.deepEqual(await createCalComSlotReservationAdapter(config).reconcileReserve(context), reserved);
  assert.equal(calls, 1);
});

test("ambiguous release is reconciled by exact UID absence, not a repeated DELETE", async () => {
  const calls = [];
  const { adapter, config } = setup(async (url, init) => {
    calls.push({ url, method: init.method });
    if (init.method === "POST") return reply({ status: "success", data }, 201);
    if (init.method === "DELETE") throw new Error("delete succeeded but response lost");
    return reply({ status: "success", data: null });
  });
  const reservation = await adapter.reserve(context);
  const release = { reservation, program, requirementId: requirement.requirementId,
    operationId: "release-timeout", permissionGrantHash };
  const result = await adapter.release(release);
  assert.equal(result.status, "RELEASED");
  assert.equal(result.releaseAttributionConfirmed, false);
  assert.equal(result.reconciledBy, "PROVIDER_UID_READ");
  assert.equal((await createCalComSlotReservationAdapter(config).release(release)).status, "RELEASED");
  assert.deepEqual(calls.map((item) => item.method), ["POST", "DELETE", "GET", "GET"]);
  assert.ok(calls.slice(1).every((item) => item.url.endsWith(`/reservations/${data.reservationUid}`)));
});

test("ambiguous release with a still-present reservation remains open", async () => {
  const { adapter } = setup(async (_url, init) => {
    if (init.method === "DELETE") throw new Error("request lost");
    return reply({ status: "success", data }, init.method === "POST" ? 201 : 200);
  });
  const reservation = await adapter.reserve(context);
  const result = await adapter.release({ reservation, program, requirementId: requirement.requirementId,
    operationId: "release-timeout", permissionGrantHash });
  assert.equal(result.status, "OPEN");
  assert.equal(result.currentReservationStatus, "RESERVED");
  assert.equal(result.retryAllowed, false);
});
