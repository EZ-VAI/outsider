import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSeatsioCapacityAdapter, SEATSIO_CAPACITY_PROTOCOL }
  from "../src/outsider-seatsio-capacity-adapter.js";

const hash = digit => `sha256:${digit.repeat(64)}`;
const now = "2026-09-05T18:00:00.000Z";
const expiry = "2026-09-05T18:05:00.000Z";
const token = "provider_fixture_hold_token";
const key = "workspace_fixture_secret";
const context = { program: { programHash: hash("1"),
  formationDeadline: "2026-09-05T18:03:00.000Z", completionDeadline: "2026-09-05T18:10:00.000Z" },
  requirement: { requirementId: "seat-primary", capability: "RESOURCE_SINGLE_OBJECT_HOLD",
    constraints: { eventKey: "test-event", objectLabel: "A-1", quantity: 1 } },
  operationId: "hold-1", permissionGrantHash: hash("2") };
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});
function setup(options = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-seatsio-"));
  const calls = [];
  const state = { status: "free", owner: null, expiresAt: expiry,
    tokenTimeout: false, holdTimeout: false, releaseTimeout: false };
  const object = () => ({ label: "A-1", objectType: "seat", status: state.status,
    forSale: true, ...(state.owner === null ? {} : { holdToken: state.owner }) });
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    assert.equal(init.headers.authorization, `Basic ${Buffer.from(`${key}:`).toString("base64")}`);
    assert.equal(init.redirect, "error");
    assert.ok(url.startsWith("https://api-na.seatsio.net/"));
    if (init.method === "POST" && url.endsWith("/hold-tokens")) {
      if (state.tokenTimeout) throw new Error("token response lost");
      return response({ holdToken: token, expiresAt: state.expiresAt, expiresInSeconds: 300 }, 201);
    }
    if (init.method === "GET" && url.endsWith(`/hold-tokens/${token}`)) {
      return response({ holdToken: token, expiresAt: state.expiresAt, expiresInSeconds: 300 });
    }
    if (init.method === "GET" && url.endsWith("/objects?label=A-1")) return response({ "A-1": object() });
    if (init.method === "POST" && url.endsWith("/actions/hold?expand=objects")) {
      assert.deepEqual(JSON.parse(init.body), { objects: ["A-1"], holdToken: token });
      state.status = "reservedByToken"; state.owner = token;
      if (state.holdTimeout) throw new Error("hold response lost");
      return response({ objects: { "A-1": object() } });
    }
    if (init.method === "POST" && url.endsWith("/actions/release?expand=objects")) {
      assert.deepEqual(JSON.parse(init.body), { objects: ["A-1"], holdToken: token });
      assert.equal(state.owner, token);
      state.status = "free"; state.owner = null;
      if (state.releaseTimeout) throw new Error("release response lost");
      return response({ objects: { "A-1": object() } });
    }
    throw new Error(`Unexpected fixture endpoint ${url}`);
  };
  const config = { directory, region: "na", eventKey: "test-event", objectLabel: "A-1",
    getWorkspaceSecretKey: async () => key, fetchImpl, clock: () => now,
    sandboxWorkspace: { declaredSandbox: true, workspaceRefHash: hash("3"), testScopeRefHash: hash("4") },
    ...options };
  return { config, directory, calls, state, adapter: createSeatsioCapacityAdapter(config) };
}
const releaseContext = reservation => ({ reservation, program: context.program,
  requirementId: context.requirement.requirementId, operationId: "release-1",
  permissionGrantHash: context.permissionGrantHash });
const writes = setup => setup.calls.filter(call => call.method === "POST");
function files(root) {
  return readdirSync(root).flatMap(name => {
    const file = path.join(root, name);
    return statSync(file).isDirectory() ? files(file) : [file];
  });
}

test("single seat native lifecycle uses provider expiry, exact token ownership and existing adapter shape", async () => {
  const fixture = setup(); const { adapter, state } = fixture;
  assert.equal(adapter.supports(context.requirement), true);
  assert.equal(adapter.supports({ ...context.requirement,
    constraints: { ...context.requirement.constraints, quantity: 2 } }), false);
  const discovery = await adapter.discover();
  assert.equal(discovery.available, true); assert.equal(discovery.capacityReserved, false);
  const reservation = await adapter.reserve(context);
  assert.equal(reservation.status, "RESERVED"); assert.equal(reservation.validUntil, expiry);
  assert.equal(reservation.sourceKind, "PROVIDER_FIXTURE");
  assert.equal(reservation.adapterState.serviceExecutionPromised, false);
  assert.equal(JSON.stringify(reservation).includes(token), false);
  assert.equal((await adapter.readReservation({ reservation })).capacityOwned, true);
  assert.equal((await adapter.discover()).capacityReserved, false);
  const released = await adapter.release(releaseContext(reservation));
  assert.equal(released.status, "RELEASED"); assert.equal(released.releaseAttributionConfirmed, true);
  assert.equal(state.status, "free"); assert.equal(writes(fixture).length, 3);
  assert.equal((await adapter.execute()).reason, "SEAT_HOLD_IS_NOT_BOOKING_OR_FULFILLMENT");
  for (const file of files(fixture.directory)) {
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(readFileSync(file, "utf8").includes(key), false);
  }
});

test("cold reserve rereads ownership without repeating token or hold writes, and binds immutable inputs", async () => {
  const fixture = setup();
  const reservation = await fixture.adapter.reserve(context);
  const cold = createSeatsioCapacityAdapter(fixture.config);
  const replay = await cold.reserve(context);
  assert.equal(replay.reservationId, reservation.reservationId); assert.equal(replay.status, "RESERVED");
  assert.equal(writes(fixture).length, 2);
  await assert.rejects(cold.reserve({ ...context, permissionGrantHash: hash("5") }), /LOCAL_RECORD_MISMATCH/u);
  fixture.state.status = "booked"; fixture.state.owner = null;
  assert.equal((await cold.reserve(context)).status, "UNAVAILABLE");
  assert.equal(writes(fixture).length, 2);
});

test("lost token response blocks before hold and is never blindly recreated", async () => {
  const fixture = setup(); fixture.state.tokenTimeout = true;
  assert.equal((await fixture.adapter.reserve(context)).reason, "HOLD_TOKEN_UNKNOWN_NO_RETRY");
  assert.equal((await createSeatsioCapacityAdapter(fixture.config).reserve(context)).ambiguous, true);
  assert.equal((await fixture.adapter.reconcileReserve(context)).reason, "HOLD_TOKEN_UNKNOWN_NO_RETRY");
  assert.equal(writes(fixture).length, 1);
});

test("lost hold response reconciles exact known object and token, never inventory counts or reacquisition", async () => {
  const fixture = setup(); fixture.state.holdTimeout = true;
  const reservation = await fixture.adapter.reserve(context);
  assert.equal(reservation.status, "RESERVED"); assert.equal(reservation.holdSubmissionAmbiguous, true);
  assert.equal(reservation.reconciledBy, "KNOWN_OBJECT_AND_TOKEN_READ");
  const cold = createSeatsioCapacityAdapter(fixture.config);
  assert.equal((await cold.reconcileReserve(context)).status, "RESERVED");
  fixture.state.owner = "different_buyer_token";
  const foreign = await cold.reconcileReserve(context);
  assert.equal(foreign.status, "UNAVAILABLE"); assert.equal(foreign.capacityOwned, false);
  assert.equal(foreign.reason, "OBJECT_NOT_HELD_BY_THIS_TOKEN");
  assert.equal(writes(fixture).length, 2);
});

test("release timeout is read-reconciled and cold repetition never releases again", async () => {
  const fixture = setup(); const reservation = await fixture.adapter.reserve(context);
  fixture.state.releaseTimeout = true;
  const released = await fixture.adapter.release(releaseContext(reservation));
  assert.equal(released.status, "RELEASED"); assert.equal(released.releaseSubmissionAmbiguous, true);
  assert.equal(released.releaseAttributionConfirmed, false);
  assert.equal((await createSeatsioCapacityAdapter(fixture.config).release(releaseContext(reservation))).status, "RELEASED");
  assert.equal(writes(fixture).length, 3);
});

test("another owner or a booked object cannot be released with this handle", async () => {
  const fixture = setup(); const reservation = await fixture.adapter.reserve(context);
  fixture.state.owner = "another_token";
  const mismatch = await fixture.adapter.release(releaseContext(reservation));
  assert.equal(mismatch.status, "OPEN"); assert.equal(mismatch.reason, "OBJECT_NOT_HELD_BY_THIS_TOKEN");
  fixture.state.status = "booked"; fixture.state.owner = null;
  assert.equal((await fixture.adapter.release(releaseContext(reservation))).status, "OPEN");
  assert.equal(writes(fixture).length, 2);
});

test("expired token does not mint capacity or restart the hold; read-only reconcile cannot initiate", async () => {
  const fixture = setup();
  assert.equal((await fixture.adapter.reconcileReserve(context)).reason, "HOLD_TOKEN_NOT_OBSERVED");
  assert.equal(writes(fixture).length, 0);
  fixture.state.expiresAt = now;
  assert.equal((await fixture.adapter.reserve(context)).reason, "TOKEN_EXPIRED");
  assert.equal(writes(fixture).length, 1);
});

test("fixed regions and declared sandbox scope are mandatory; injected responses remain fixtures", () => {
  const { config, adapter } = setup();
  assert.equal(SEATSIO_CAPACITY_PROTOCOL.regionOrigins.na, "https://api-na.seatsio.net");
  assert.equal(adapter.protocol.sandboxBoundary, "CALLER_DECLARED_WORKSPACE_NOT_SEPARATE_HOST");
  assert.throws(() => createSeatsioCapacityAdapter({ ...config, region: "elsewhere" }), /CONFIG_INVALID/u);
  assert.throws(() => createSeatsioCapacityAdapter({ ...config, origin: "https://evil.test" }), /CONFIG_INVALID/u);
  assert.throws(() => createSeatsioCapacityAdapter({ ...config,
    sandboxWorkspace: { ...config.sandboxWorkspace, declaredSandbox: false } }), /CONFIG_INVALID/u);
});
