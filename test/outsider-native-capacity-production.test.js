import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadNativeCapacityProductionProfile, runNativeCapacityProductionAction, runNativeCapacityCycle }
  from "../src/outsider-native-capacity-production.js";

const hash = n => `sha256:${n.repeat(64)}`;
const now = "2026-09-06T12:00:00.000Z";
const expiry = "2026-09-06T12:05:00.000Z";
const key = "fixture_workspace_secret_never_projected";
const token = "fixture_hold_token_never_projected";
function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-native-capacity-"));
  const profileFile = path.join(root, "profile.json");
  const directory = path.join(root, "task");
  const write = (name, value) => writeFileSync(path.join(root, name), JSON.stringify(value), { mode: 0o600 });
  const resource = { resourceId: "seat-primary", provider: "SEATSIO", permissionGrantHash: hash("1"),
    scope: { ownerControlledTestResource: true, sourceRefHash: hash("2"), expiresAt: "2026-09-06T12:15:00.000Z" },
    credentialFile: "credentials.json", settings: { region: "na", eventKey: "owned-test-event", objectLabel: "A-1",
      sandboxWorkspace: { declaredSandbox: true, workspaceRefHash: hash("3"), testScopeRefHash: hash("4") } } };
  write("profile.json", { schema: "outsider/native-capacity-profile/v1", resources: [resource] });
  write("credentials.json", { schema: "outsider/native-capacity-credentials/v1", seatsioWorkspaceSecretKey: key, calcomApiToken: "fixture_cal_token" });
  const context = { program: { programHash: hash("5"), formationDeadline: "2026-09-06T12:03:00.000Z",
    completionDeadline: "2026-09-06T12:10:00.000Z" }, requirement: { requirementId: "seat-primary",
    capability: "RESOURCE_SINGLE_OBJECT_HOLD", constraints: { eventKey: "owned-test-event", objectLabel: "A-1", quantity: 1 } },
    operationId: "reserve-one", permissionGrantHash: hash("1") };
  write("context.json", context);
  const calls = []; const state = { held: false, loseHold: false };
  const object = () => ({ label: "A-1", objectType: "seat", status: state.held ? "reservedByToken" : "free",
    forSale: true, ...(state.held ? { holdToken: token } : {}) });
  const reply = data => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method });
    assert.equal(init.headers.authorization, `Basic ${Buffer.from(`${key}:`).toString("base64")}`);
    if (url.endsWith("/hold-tokens") || url.endsWith(`/hold-tokens/${token}`)) return reply({ holdToken: token, expiresAt: expiry });
    if (url.includes("/objects?")) return reply({ "A-1": object() });
    if (url.includes("/actions/hold?")) { state.held = true; if (state.loseHold) throw new Error("lost"); return reply({ objects: { "A-1": object() } }); }
    if (url.includes("/actions/release?")) { state.held = false; return reply({ objects: { "A-1": object() } }); }
    throw new Error("unexpected fixture endpoint");
  };
  const options = { profileFile, directory, resourceId: "seat-primary", clock: () => now,
    fetchByProvider: { SEATSIO: fetchImpl } };
  return { root, profileFile, directory, resource, context, write, calls, state, options };
}

test("missing private account/resource config returns exact blocker without provider IO or substitutes", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-native-capacity-missing-"));
  const result = await runNativeCapacityProductionAction({ profileFile: path.join(root, "absent.json"),
    directory: path.join(root, "runtime"), resourceId: "seat-primary", action: "reserve" });
  assert.equal(result.status, "BLOCKED"); assert.equal(result.blockers[0].code, "PRIVATE_NATIVE_CAPACITY_PROFILE_MISSING");
  assert.equal(result.providerIoPerformed, false); assert.equal(result.externalCapacityEstablished, false);
  assert.equal(readdirSync(root).length, 0);
});

test("private CLI action bridge uses real existing seat adapter for reserve, cold reconcile, read and exact release", async () => {
  const fixture = setup(); fixture.state.loseHold = true;
  const run = action => runNativeCapacityProductionAction({ ...fixture.options, action,
    contextFile: path.join(fixture.root, "context.json") });
  assert.equal((await run("discover")).capacityOwned, false);
  const reserved = await run("reserve");
  assert.equal(reserved.status, "RESERVED"); assert.equal(reserved.sourceKind, "PROVIDER_FIXTURE");
  assert.equal(reserved.externalCapacityEstablished, false);
  assert.equal((await run("reconcile")).status, "RESERVED");
  assert.equal((await run("read")).status, "RESERVED");
  const released = await run("release");
  assert.equal(released.status, "RELEASED"); assert.equal(released.releaseConfirmed, true);
  assert.equal((await run("release")).releaseConfirmed, true);
  assert.equal(fixture.calls.filter(row => row.method === "POST").length, 3);
  assert.equal(fixture.state.held, false);
  const projected = JSON.stringify({ reserved, released });
  for (const secret of [key, token, fixture.root, "credentials.json"]) assert.equal(projected.includes(secret), false);
  assert.equal(readdirSync(fixture.directory).filter(name => name.startsWith("action-")).length, 6);
});

test("factory exposes original adapter registry, preserves native capability/domain distinctions and private scope binding", async () => {
  const fixture = setup();
  const cal = { ...fixture.resource, resourceId: "slot-recovery", provider: "CALCOM", settings: { eventTypeId: 987 } };
  fixture.write("profile.json", { schema: "outsider/native-capacity-profile/v1", resources: [fixture.resource, cal] });
  const loaded = loadNativeCapacityProductionProfile({ profileFile: fixture.profileFile,
    runtimeDirectory: fixture.directory, clock: () => now, fetchByProvider: fixture.options.fetchByProvider });
  assert.equal(loaded.status, "CONFIGURED"); assert.equal(loaded.providerIoPerformed, false);
  assert.equal(loaded.resources[0].failureDomainRef, "seats.io"); assert.equal(loaded.resources[1].failureDomainRef, "cal.com");
  assert.notEqual(loaded.resources[0].capability, loaded.resources[1].capability);
  assert.equal(loaded.adapters["slot-recovery"].supports(fixture.context.requirement), false);
  await assert.rejects(loaded.adapters["seat-primary"].reserve({ ...fixture.context, permissionGrantHash: hash("f") }),
    /RESOURCE_PERMISSION_OR_REQUIREMENT_MISMATCH/u);
  assert.equal(fixture.calls.length, 0);
  assert.equal(JSON.stringify(loaded.resources).includes(key), false);
  fixture.write("profile.json", { schema: "outsider/native-capacity-profile/v1", resources: [fixture.resource] });
  assert.throws(() => loadNativeCapacityProductionProfile({ profileFile: fixture.profileFile,
    runtimeDirectory: fixture.directory }), /LOCAL_RECORD_MISMATCH/u);
});

test("public Cal.com buyer cycle reserves and releases once; terminal restart performs no IO", async () => {
  const fixture = setup(); let held = false; const calls = [];
  const cal = { ...fixture.resource, resourceId: "public-slot", provider: "CALCOM",
    credentialFile: null, accessMode: "PUBLIC_BUYER", settings: { eventTypeId: 987 } };
  fixture.write("profile.json", { schema: "outsider/native-capacity-profile/v1", resources: [cal] });
  const slot = { start: "2026-09-07T13:00:00.000Z", end: "2026-09-07T13:15:00.000Z" };
  const reservation = { eventTypeId: 987, slotStart: slot.start, slotEnd: slot.end,
    slotDuration: 15, reservationUid: "fixture-owned-hold", reservationUntil: expiry };
  const fetchImpl = async (url, init) => {
    calls.push(init.method); assert.equal(init.headers.Authorization, undefined);
    if (url.includes("/slots?")) return new Response(JSON.stringify({ status: "success", data: { day: [slot] } }));
    if (init.method === "POST") held = true;
    if (init.method === "DELETE") held = false;
    return new Response(JSON.stringify({ status: "success", data: held ? reservation : null }),
      { status: init.method === "POST" ? 201 : 200 });
  };
  const options = { profileFile: fixture.profileFile, resourceId: cal.resourceId, directory: fixture.directory,
    start: "2026-09-07T00:00:00.000Z", end: "2026-09-08T00:00:00.000Z", slotDuration: 15,
    clock: () => now, fetchByProvider: { CALCOM: fetchImpl } };
  const result = await runNativeCapacityCycle(options);
  assert.equal(result.status, "CAPACITY_LIFECYCLE_COMPLETE"); assert.equal(held, false);
  assert.equal(calls.filter(x => x === "POST").length, 1);
  assert.equal(calls.filter(x => x === "DELETE").length, 1);
  const count = calls.length;
  assert.deepEqual(await runNativeCapacityCycle(options), result);
  assert.equal(calls.length, count);
});
