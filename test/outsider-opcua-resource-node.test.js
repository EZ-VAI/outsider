import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createOpcUaResourceNode, createNodeOpcUaReadTransport, projectOpcUaWorldState,
  OPCUA_RESOURCE_NODE_PROTOCOL } from "../src/outsider-opcua-resource-node.js";

const now = "2026-09-05T13:00:00.000Z";
function setup(overrides = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-opcua-test-"));
  const calls = [];
  const transport = {
    connect: async (args) => { calls.push(["connect", args]); return { anonymous: true, encrypted: false }; },
    browse: async (args) => { calls.push(["browse", args]); return { references: [
      { nodeId: "ns=3;i=1001", browseName: "3:Sinusoid", nodeClass: "Variable" },
    ] }; },
    read: async ({ nodeIds }) => { calls.push(["read", nodeIds]); return {
      values: nodeIds.map((id) => ({ nodeId: id, dataType: "Double", arrayType: "Scalar",
        value: 23.1, statusCode: 0, statusName: "Good", sourceTimestamp: now, serverTimestamp: now })),
    }; },
    close: async () => { calls.push(["close"]); }, ...overrides,
  };
  const config = { endpointUrl: OPCUA_RESOURCE_NODE_PROTOCOL.officialDemoEndpoint,
    officialSourceUrl: OPCUA_RESOURCE_NODE_PROTOCOL.officialDemoSources[0],
    sourceClass: "SIMULATED_INDUSTRIAL_DEMO", transport, directory, clock: () => now,
    pause: async () => {} };
  return { node: createOpcUaResourceNode(config), config, calls, directory };
}

test("public demo discovery and typed observations reuse one session and retain private source bytes", async () => {
  const { node, directory, calls } = setup();
  assert.equal((await node.discover()).references[0].browseName, "3:Sinusoid");
  const result = await node.observe({ nodeIds: ["ns=3;i=1001"], maxSamples: 3 });
  assert.equal(result.samples.length, 3);
  assert.equal(result.samples[0].dataType, "Double");
  assert.equal(result.samples[0].sourceTimestamp, now);
  assert.equal(result.samples[0].quality, "GOOD");
  assert.equal(result.boundary.simulated, true);
  assert.equal(result.boundary.independentOutcomeTruthEstablished, false);
  assert.equal(node.descriptor().networkNodeSdk.endpointIsPrincipalIdentity, false);
  assert.equal(node.descriptor().networkNodeSdk.intakeAdmission, "NOT_SUBMITTED");
  assert.equal(node.write, undefined);
  for (const source of result.sources) {
    const bytes = readFileSync(source.privatePath);
    assert.equal(source.bytes, bytes.length);
    assert.equal(source.hash, `sha256:${createHash("sha256").update(bytes).digest("hex")}`);
    assert.equal(JSON.parse(bytes).operation, "READ");
  }
  for (const file of readdirSync(directory)) assert.equal(statSync(path.join(directory, file)).mode & 0o777, 0o600);
  await node.close();
  assert.equal(calls.filter(([name]) => name === "connect").length, 1);
  assert.equal(calls.filter(([name]) => name === "read").length, 3);
  await assert.rejects(() => node.observe({ nodeIds: ["i=2258"] }), /NODE_CLOSED/u);
});

test("bad and uncertain DataValues remain evidence, never silently becoming good telemetry", async () => {
  const { node } = setup({ read: async ({ nodeIds }) => ({ values: [
    { nodeId: nodeIds[0], dataType: null, value: null, statusCode: 0x80340000,
      statusName: "BadNodeIdUnknown", sourceTimestamp: null },
    { nodeId: nodeIds[1], dataType: "UInt64", arrayType: "Scalar", value: [0xffffffff, 0xffffffff],
      statusCode: 0x40000000, statusName: "Uncertain", sourceTimestamp: null },
  ] }) });
  const { samples } = await node.observe({ nodeIds: ["i=42", "i=43"] });
  assert.equal(samples[0].quality, "BAD");
  assert.equal(samples[0].sourceTimestamp, null);
  assert.equal(samples[1].quality, "UNCERTAIN");
  assert.deepEqual(samples[1].value, [0xffffffff, 0xffffffff]);
  await node.close();
});

test("non-finite and arbitrary precision native values remain explicitly typed", async () => {
  const { node } = setup({ read: async ({ nodeIds }) => ({ values: nodeIds.map((id, i) => ({
    nodeId: id, dataType: i ? "UInt64" : "Double", value: i ? 18446744073709551615n : NaN,
    statusCode: 0, sourceTimestamp: now,
  })) }) });
  const { samples } = await node.observe({ nodeIds: ["i=42", "i=43"] });
  assert.deepEqual(samples[0].value, { encoding: "IEEE754_SPECIAL", value: "NaN" });
  assert.deepEqual(samples[1].value, { encoding: "BIGINT_DECIMAL", value: "18446744073709551615" });
  await node.close();
});

test("bounded sampling validates before networking and mismatched replies are preserved, not remapped", async () => {
  const { node, calls, directory } = setup({ read: async () => ({ values: [
    { nodeId: "i=44", value: 0, statusCode: 0 },
  ] }) });
  await assert.rejects(() => node.observe({ nodeIds: ["i=42"], maxSamples: 31 }), /SAMPLE_COUNT_INVALID/u);
  await assert.rejects(() => node.observe({ nodeIds: ["i=42"], maxSamples: 30, intervalMs: 5000 }), /DURATION_EXCEEDED/u);
  assert.equal(calls.length, 0);
  await assert.rejects(() => node.observe({ nodeIds: ["i=42"] }), /READ_IDENTITY_OR_STATUS_INVALID/u);
  assert.equal(readdirSync(directory).length, 2);
  await node.close();
});

test("native thin client sends only Browse/Read and releases continuation pages", async () => {
  const calls = [];
  let options;
  const makeValue = () => ({ value: { dataType: 11, arrayType: 0, value: 4.5 },
    statusCode: { value: 0, name: "Good" }, sourceTimestamp: new Date(now),
    toJSON: () => ({ value: 4.5 }) });
  const session = {
    browse: async (request) => { calls.push(["browse", request]); return {
      statusCode: { value: 0 }, continuationPoint: Buffer.from("page"), references: [],
      toJSON: () => ({ statusCode: 0, references: [] }),
    }; },
    browseNext: async (_cp, release) => { calls.push(["browseNext", release]); },
    read: async (requests, maxAge) => { calls.push(["read", requests, maxAge]); return [makeValue()]; },
    close: async () => { calls.push(["session-close"]); },
  };
  const client = { connect: async () => {}, createSession: async () => session,
    disconnect: async () => { calls.push(["disconnect"]); },
    securityMode: 1, securityPolicy: "None", bytesRead: 80, bytesWritten: 40 };
  const opcua = {
    OPCUAClient: { create: (o) => { options = o; return client; } },
    OPCUACertificateManager: class {}, MessageSecurityMode: { None: 1, SignAndEncrypt: 3, 1: "None" },
    SecurityPolicy: { None: "None", Basic256Sha256: "Basic256Sha256" },
    BrowseDirection: { Forward: 0 }, AttributeIds: { Value: 13 },
    DataType: { 11: "Double" }, VariantArrayType: { 0: "Scalar" }, NodeClass: {},
  };
  const native = createNodeOpcUaReadTransport({ opcua,
    pkiDirectory: mkdtempSync(path.join(os.tmpdir(), "opcua-pki-test-")), allowUnsecuredDemo: true });
  await native.connect({ endpointUrl: OPCUA_RESOURCE_NODE_PROTOCOL.officialDemoEndpoint });
  assert.equal(options.connectionStrategy.maxRetry, 0);
  assert.equal(options.keepSessionAlive, false);
  await native.browse({ rootNodeId: "i=85", maxReferences: 3 });
  const result = await native.read({ nodeIds: ["i=42"] });
  assert.equal(result.values[0].dataType, "Double");
  assert.equal(session.requestedMaxReferencesPerNode, 3);
  assert.deepEqual(calls[1], ["browseNext", true]);
  assert.equal(calls[2][1][0].attributeId, 13);
  await native.close();
  assert.equal(calls.at(-1)[0], "disconnect");
});

test("source-to-planner projection keeps current false/zero facts but bad, stale, future and unknown stay absent", () => {
  const base = { arrayType: "Scalar", quality: "GOOD", observedAt: now,
    sourceTimestamp: now, sourceHash: `sha256:${"a".repeat(64)}`, sampleIndex: 0 };
  const observation = { sourceClass: "SIMULATED_INDUSTRIAL_DEMO", samples: [
    { ...base, nodeId: "i=1", value: false },
    { ...base, nodeId: "i=2", value: 0 },
    { ...base, nodeId: "i=3", value: "ready" },
    { ...base, nodeId: "i=4", value: true, sourceTimestamp: "2026-09-05T12:00:00.000Z" },
    { ...base, nodeId: "i=5", value: true, sourceTimestamp: "2026-09-05T14:00:00.000Z" },
    { ...base, nodeId: "i=6", value: true },
    { ...base, nodeId: "i=6", value: false, quality: "BAD", sampleIndex: 1 },
  ] };
  const bindings = ["boolean", "number", "string", "boolean", "boolean", "boolean", "boolean"]
    .map((valueType, index) => ({ nodeId: `i=${index + 1}`, predicateId: `resource.fact${index + 1}`, valueType }));
  const result = projectOpcUaWorldState(observation, { bindings, evaluatedAt: now, maxAgeMs: 30_000 });
  assert.deepEqual(result.initialState, { "resource.fact1": false, "resource.fact2": 0, "resource.fact3": "ready" });
  assert.deepEqual(result.plannerInitialState, [
    { predicateId: "resource.fact1", valueType: "boolean", value: false },
    { predicateId: "resource.fact2", valueType: "number", value: 0 },
    { predicateId: "resource.fact3", valueType: "string", value: "ready" },
  ]);
  assert.deepEqual(result.unknown.map((entry) => entry.reason), [
    "SOURCE_STALE", "SOURCE_FROM_FUTURE", "SOURCE_QUALITY_NOT_GOOD", "UNMAPPED_SOURCE_NODE",
  ]);
  assert.equal(result.simulated, true);
  assert.equal(result.facts[0].sourceHash, base.sourceHash);
  assert.equal(result.independentOutcomeTruthEstablished, false);
});
