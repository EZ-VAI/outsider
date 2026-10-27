import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, statSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireObservationCapabilityCatalog, createObservationCapabilityCatalog }
  from "../src/outsider-observation-capability-catalog.js";
import { compileWorldStateResourcePlan } from "../src/outsider-world-state-program-compiler.js";

const now = "2026-09-05T12:00:00.000Z";
const source = { sourceHash: `sha256:${"a".repeat(64)}`,
  sourceClass: "CALCOM_PUBLIC_SANDBOX_AVAILABILITY", observedAt: now };
const calcom = { eventTypeId: 6, start: "2026-09-08T00:00:00Z", end: "2026-09-09T00:00:00Z", source };
const input = { observedAt: now, expiresAt: "2026-09-05T12:05:00Z", calcom };
function directory(t) {
  const result = mkdtempSync(path.join(os.tmpdir(), "outsider-observation-catalog-"));
  t.after(() => rmSync(result, { recursive: true, force: true })); return result;
}
function files(root) {
  return readdirSync(root).flatMap(name => {
    const file = path.join(root, name); return statSync(file).isDirectory() ? files(file) : [file];
  });
}

test("native availability describes future report capability, not achieved state or reserved supply", () => {
  const catalog = createObservationCapabilityCatalog(input);
  assert.deepEqual(catalog.planningInput.initialState, []);
  assert.deepEqual(catalog.planningInput.resources, []);
  assert.equal(catalog.executionReadiness.ready, false);
  assert.equal(catalog.boundary.providerCapacityReserved, false);
  assert.equal(catalog.planningAssumptions.externalWitnessCostIncluded, false);
  assert.ok(catalog.programInput.requirements.every(row => row.constraints.formationStatus === "DECLARED_NOT_RESERVED"));
  const planningInput = { ...catalog.planningInput,
    targetPredicates: catalog.semanticTargets[0].predicates,
    budget: { currency: "USD", maximumAmountMinor: "0" }, deadlineMs: 60_000 };
  const compilation = compileWorldStateResourcePlan({ planningInput,
    programInput: { ...catalog.programInput, programId: "report_program", orderId: "report_order",
      createdAt: now, formationDeadline: "2026-09-05T12:01:00.000Z",
      completionDeadline: "2026-09-05T12:02:00.000Z", statement: "Produce current availability report." },
    actionBindings: catalog.actionBindings });
  assert.equal(compilation.planningResult.status, "FEASIBLE");
  assert.equal(compilation.outcomeEstablished, false);
  assert.equal(compilation.program.requirements.length, 3);
  assert.equal(compilation.program.nodes.length, 2);
});

test("catalog hashes the source identity and rejects wrong classes, windows and future evidence", () => {
  assert.equal(createObservationCapabilityCatalog(input).catalogId, createObservationCapabilityCatalog(input).catalogId);
  assert.notEqual(createObservationCapabilityCatalog(input).catalogId,
    createObservationCapabilityCatalog({ ...input, calcom: { ...calcom, source: {
      ...source, sourceHash: `sha256:${"b".repeat(64)}` } } }).catalogId);
  assert.throws(() => createObservationCapabilityCatalog({ ...input, calcom: { ...calcom, eventTypeId: 7 } }), /SANDBOX_EVENT/u);
  assert.throws(() => createObservationCapabilityCatalog({ ...input, calcom: { ...calcom, source: {
    ...source, sourceClass: "OWNER_CAPACITY" } } }), /SOURCE_INVALID/u);
  assert.throws(() => createObservationCapabilityCatalog({ ...input, expiresAt: "2026-09-05T12:05:01Z" }), /LIFETIME/u);
  assert.throws(() => createObservationCapabilityCatalog({ ...input, calcom: { ...calcom, source: {
    ...source, observedAt: "2026-09-05T12:00:01Z" } } }), /SOURCE_FROM_FUTURE/u);
});

test("acquisition reuses the native GET adapter, preserves private receipts and accepts empty slots", async t => {
  const root = directory(t), calls = [];
  const result = await acquireObservationCapabilityCatalog({ directory: root, calcom,
    clock: () => now, fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method });
      return new Response(JSON.stringify({ status: "success", data: {} }), { status: 200 });
    } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.equal(result.acquisition.observations[0].slotCount, 0);
  assert.equal(result.catalog.sourceReferences[0].sourceHash, result.acquisition.observations[0].providerReceipt);
  for (const file of files(root)) assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.ok(!JSON.stringify(result.catalog).includes(root));
  assert.equal(result.catalog.executionReadiness.ready, false);
});

test("OPC UA evidence retains demo scope and values stay out of the model-facing catalog", async t => {
  const calls = [], transport = {
    async connect() { calls.push("CONNECT"); return { anonymous: true }; },
    async browse() { throw new Error("not requested"); },
    async read({ nodeIds }) { calls.push("READ"); return { values: nodeIds.map(nodeId => ({
      nodeId, dataType: "String", value: "private_demo_reading_731", statusCode: 0,
      sourceTimestamp: now, serverTimestamp: now,
    })) }; },
    async close() { calls.push("CLOSE"); },
  };
  const result = await acquireObservationCapabilityCatalog({ directory: directory(t), clock: () => now,
    opcua: { endpointUrl: "opc.tcp://demo.example:51210/UA/SampleServer",
      officialSourceUrl: "https://demo.example/docs", nodeIds: ["i=2258"], transport } });
  assert.deepEqual(calls, ["CONNECT", "READ", "CLOSE"]);
  assert.equal(result.catalog.sourceReferences[0].sourceClass, "SIMULATED_INDUSTRIAL_DEMO");
  assert.equal(result.acquisition.observations[0].goodCount, 1);
  assert.equal(result.acquisition.observations[0].physicalHardwareConnected, false);
  assert.ok(!JSON.stringify(result.catalog).includes("private_demo_reading_731"));
  assert.deepEqual(result.catalog.planningInput.initialState, []);
});

test("failed native reads cannot populate a source-backed catalog", async t => {
  await assert.rejects(() => acquireObservationCapabilityCatalog({ directory: directory(t), calcom,
    clock: () => now, fetchImpl: async () => new Response("{}", { status: 503 }) }), /CALCOM_READ_UNAVAILABLE/u);
});
