/*
 * Read-only, machine-native OPC UA resource node. The injected transport is
 * shared by production owner connections and bounded public-demo integration.
 * Browse/Read are evidence acquisition, not physical control or a witness of
 * completed work. No Write, Call, booking, or payment operation is exposed.
 */
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_NETWORK_NODE_SDK_SCHEMAS,
  OUTSIDER_NETWORK_NODE_SDK_BOUNDARY,
} from "./outsider-network-node-sdk.js";

export const OPCUA_RESOURCE_NODE_PROTOCOL = Object.freeze({
  schema: "outsider/opcua-resource-node/v1",
  capability: "INDUSTRIAL_TYPED_TELEMETRY_READ",
  protocol: "OPC_UA_BINARY_OVER_UA_TCP",
  officialDemoEndpoint: "opc.tcp://uademo.prosysopc.com:53530/OPCUA/SimulationServer",
  officialDemoSources: Object.freeze([
    "https://documentation.prosysopc.com/JSDK/tutorial/html/Prosys_OPC_UA_SDK_for_Java_Client_Tutorial.html",
    "https://prosysopc.com/blog/mastering-forge-11-exchanging-data-between-servers/",
  ]),
});

function boundedInt(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`OUTSIDER_OPCUA_${name}_INVALID`);
  }
  return value;
}
function nodeId(value) {
  if (typeof value !== "string" || value.length > 512
    || !/^(?:ns=\d+;)?[isgb]=[^\r\n]+$/u.test(value)) {
    throw new TypeError("OUTSIDER_OPCUA_NODE_ID_INVALID");
  }
  return value;
}
function instant(value) {
  if (value === null || value === undefined) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new TypeError("OUTSIDER_OPCUA_TIMESTAMP_INVALID");
  return parsed.toISOString();
}
function plain(value) {
  // OPC UA allows non-finite floating point and 64-bit values. Preserve those
  // explicitly instead of JSON's silent Infinity/NaN -> null conversion.
  if (typeof value === "bigint") return { encoding: "BIGINT_DECIMAL", value: String(value) };
  if (typeof value === "number" && !Number.isFinite(value)) {
    return { encoding: "IEEE754_SPECIAL", value: String(value) };
  }
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { encoding: "BASE64", value: value.toString("base64") };
  if (ArrayBuffer.isView(value)) return Array.from(value, plain);
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)
      .map(([key, v]) => [key, plain(v)]));
  }
  return value ?? null;
}
const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

/**
 * transport: connect({endpointUrl}), browse({rootNodeId,maxReferences}),
 * read({nodeIds}), close(). read returns {values:[{nodeId,dataType,arrayType,
 * value,statusCode,statusName,sourceTimestamp,serverTimestamp}], rawResponse}.
 * Raw sources are decoded service JSON, not a claim to packet-capture bytes.
 */
export function createOpcUaResourceNode({ endpointUrl, officialSourceUrl,
  sourceClass = "OWNER_AUTHORIZED_TELEMETRY", transport, directory,
  clock = () => new Date().toISOString(), pause = sleep } = {}) {
  const endpoint = new URL(endpointUrl);
  const sourceUrl = new URL(officialSourceUrl);
  if (endpoint.protocol !== "opc.tcp:" || endpoint.username || endpoint.password
    || endpoint.search || endpoint.hash || sourceUrl.protocol !== "https:"
    || sourceUrl.username || sourceUrl.password || typeof directory !== "string"
    || !["SIMULATED_INDUSTRIAL_DEMO", "OWNER_AUTHORIZED_TELEMETRY"].includes(sourceClass)
    || !["connect", "browse", "read", "close"].every((key) => typeof transport?.[key] === "function")) {
    throw new TypeError("OUTSIDER_OPCUA_CONFIG_INVALID");
  }
  const root = path.resolve(directory);
  mkdirSync(root, { recursive: true, mode: 0o700 }); chmodSync(root, 0o700);
  let connection = null;
  let closed = false;
  const boundary = Object.freeze({
    readOnly: true, simulated: sourceClass === "SIMULATED_INDUSTRIAL_DEMO",
    physicalActuationPerformed: false, independentOutcomeTruthEstablished: false,
    ownerIdentityEstablished: false, capacityReserved: false, outcomeCommitIssued: false,
  });
  function persist(operation, request, response, startedAt) {
    const envelope = {
      schema: "outsider/opcua-source-response/v1", protocol: OPCUA_RESOURCE_NODE_PROTOCOL.protocol,
      endpointUrl, officialSourceUrl, sourceClass, operation, request,
      startedAt, observedAt: instant(clock()),
      encoding: "DECODED_OPCUA_SERVICE_JSON_NOT_WIRE_CAPTURE", response: plain(response),
    };
    const bytes = Buffer.from(canonicalizeStrict(envelope));
    if (bytes.length > 2 * 1024 * 1024) throw new Error("OUTSIDER_OPCUA_RESPONSE_TOO_LARGE");
    const privatePath = path.join(root, `${randomUUID()}.json`);
    writeFileSync(privatePath, bytes, { flag: "wx", mode: 0o600 });
    return { hash: hash(bytes), bytes: bytes.length, privatePath,
      observedAt: envelope.observedAt, encoding: envelope.encoding };
  }
  async function connect() {
    if (closed) throw new Error("OUTSIDER_OPCUA_NODE_CLOSED");
    if (!connection) {
      const startedAt = instant(clock());
      const response = await transport.connect({ endpointUrl });
      connection = { ...response, source: persist("CONNECT", { endpointUrl }, response, startedAt) };
    }
    return connection;
  }
  return Object.freeze({
    descriptor() {
      return {
        ...OPCUA_RESOURCE_NODE_PROTOCOL, endpointUrl, officialSourceUrl, sourceClass,
        operations: ["BROWSE", "READ"], boundary,
        networkNodeSdk: {
          schemas: OUTSIDER_NETWORK_NODE_SDK_SCHEMAS,
          boundary: OUTSIDER_NETWORK_NODE_SDK_BOUNDARY,
          inputKind: "VENDOR_NATIVE_TELEMETRY_EVIDENCE",
          conformanceStatus: "NOT_EVALUATED", intakeAdmission: "NOT_SUBMITTED",
          // Endpoint/node addresses are resource locators, never network actor identities.
          endpointIsPrincipalIdentity: false,
        },
      };
    },
    connect,
    async discover({ rootNodeId = "i=85", maxReferences = 32 } = {}) {
      nodeId(rootNodeId); boundedInt(maxReferences, 1, 64, "REFERENCE_COUNT");
      await connect();
      const startedAt = instant(clock());
      const response = await transport.browse({ rootNodeId, maxReferences });
      if (!Array.isArray(response.references)) throw new Error("OUTSIDER_OPCUA_BROWSE_RESPONSE_INVALID");
      const source = persist("BROWSE", { rootNodeId, maxReferences }, response, startedAt);
      return { references: response.references.slice(0, maxReferences),
        truncated: response.references.length > maxReferences || response.hasContinuationPoint === true,
        source, boundary };
    },
    async observe({ nodeIds, maxSamples = 1, intervalMs = 1000 } = {}) {
      if (!Array.isArray(nodeIds) || nodeIds.length < 1 || nodeIds.length > 16
        || new Set(nodeIds).size !== nodeIds.length) throw new TypeError("OUTSIDER_OPCUA_NODE_IDS_INVALID");
      nodeIds.forEach(nodeId);
      boundedInt(maxSamples, 1, 30, "SAMPLE_COUNT");
      boundedInt(intervalMs, 0, 5000, "INTERVAL");
      if ((maxSamples - 1) * intervalMs > 30_000) throw new TypeError("OUTSIDER_OPCUA_DURATION_EXCEEDED");
      await connect();
      const samples = [], sources = [];
      for (let index = 0; index < maxSamples; index += 1) {
        if (index) await pause(intervalMs);
        const startedAt = instant(clock());
        const response = await transport.read({ nodeIds });
        const source = persist("READ", { nodeIds, sampleIndex: index }, response, startedAt);
        sources.push(source);
        if (!Array.isArray(response.values) || response.values.length !== nodeIds.length) {
          throw new Error("OUTSIDER_OPCUA_READ_CARDINALITY_MISMATCH");
        }
        for (let n = 0; n < nodeIds.length; n += 1) {
          const item = response.values[n];
          if (item.nodeId !== nodeIds[n] || !Number.isInteger(item.statusCode)) {
            throw new Error("OUTSIDER_OPCUA_READ_IDENTITY_OR_STATUS_INVALID");
          }
          const severity = (item.statusCode >>> 30) & 3;
          samples.push({ nodeId: item.nodeId, sampleIndex: index,
            dataType: item.dataType ?? null, arrayType: item.arrayType ?? null,
            value: plain(item.value), statusCode: item.statusCode,
            statusName: item.statusName ?? null,
            quality: severity === 0 ? "GOOD" : severity === 1 ? "UNCERTAIN" : "BAD",
            sourceTimestamp: instant(item.sourceTimestamp), serverTimestamp: instant(item.serverTimestamp),
            observedAt: source.observedAt, sourceHash: source.hash });
        }
      }
      return { schema: "outsider/opcua-typed-observations/v1", sourceClass,
        capability: OPCUA_RESOURCE_NODE_PROTOCOL.capability, endpointUrl, officialSourceUrl,
        samples, sources, connection, boundary };
    },
    async close() { closed = true; await transport.close(); },
  });
}

/** Thin optional node-opcua transport; dependency supplied by caller, no root install. */
export function createNodeOpcUaReadTransport({ opcua, pkiDirectory,
  allowUnsecuredDemo = false, clientOptions = {}, onResponse } = {}) {
  if (!opcua?.OPCUAClient || typeof pkiDirectory !== "string") {
    throw new TypeError("OUTSIDER_OPCUA_NATIVE_CLIENT_CONFIG_INVALID");
  }
  mkdirSync(pkiDirectory, { recursive: true, mode: 0o700 }); chmodSync(pkiDirectory, 0o700);
  const certificateManager = new opcua.OPCUACertificateManager({ rootFolder: pkiDirectory,
    automaticallyAcceptUnknownCertificate: false });
  const client = opcua.OPCUAClient.create({
    applicationName: "OutsiderReadOnlyResourceNode", applicationUri: "urn:outsider:read-only-resource-node",
    clientName: "OutsiderReadOnlyResourceNode", clientCertificateManager: certificateManager,
    connectionStrategy: { maxRetry: 0, initialDelay: 1000, maxDelay: 1000 },
    requestedSessionTimeout: 30_000, transportTimeout: 10_000, defaultTransactionTimeout: 15_000,
    keepSessionAlive: false,
    securityMode: allowUnsecuredDemo ? opcua.MessageSecurityMode.None : opcua.MessageSecurityMode.SignAndEncrypt,
    securityPolicy: allowUnsecuredDemo ? opcua.SecurityPolicy.None : opcua.SecurityPolicy.Basic256Sha256,
    ...clientOptions,
  });
  if (onResponse) client.on("receive_response", (response) => onResponse({
    service: response.schema?.name ?? response.constructor.name,
    response: plain(response.toJSON()), bytesRead: client.bytesRead, bytesWritten: client.bytesWritten,
  }));
  let session;
  return {
    async connect({ endpointUrl }) {
      await client.connect(endpointUrl);
      session = await client.createSession();
      return { securityMode: opcua.MessageSecurityMode[client.securityMode] ?? String(client.securityMode),
        securityPolicy: String(client.securityPolicy), anonymous: true,
        encrypted: client.securityMode === opcua.MessageSecurityMode.SignAndEncrypt,
        serverIdentityVerified: false, bytesRead: client.bytesRead, bytesWritten: client.bytesWritten };
    },
    async browse({ rootNodeId, maxReferences }) {
      session.requestedMaxReferencesPerNode = maxReferences;
      const result = await session.browse({ nodeId: rootNodeId,
        browseDirection: opcua.BrowseDirection.Forward, includeSubtypes: true,
        referenceTypeId: "HierarchicalReferences", resultMask: 63 });
      const hasContinuationPoint = Boolean(result.continuationPoint?.length);
      // The bounded reader never walks additional pages, and releases their server state.
      if (hasContinuationPoint) await session.browseNext(result.continuationPoint, true);
      return { statusCode: result.statusCode.value, hasContinuationPoint,
        references: (result.references ?? []).map((ref) => ({ nodeId: ref.nodeId.toString(),
          browseName: ref.browseName.toString(), displayName: ref.displayName.text ?? null,
          nodeClass: opcua.NodeClass[ref.nodeClass] ?? String(ref.nodeClass) })),
        rawResponse: result.toJSON(), bytesRead: client.bytesRead, bytesWritten: client.bytesWritten };
    },
    async read({ nodeIds }) {
      const values = await session.read(nodeIds.map((id) => ({ nodeId: id,
        attributeId: opcua.AttributeIds.Value })), 0);
      return { values: values.map((value, index) => ({ nodeId: nodeIds[index],
        dataType: value.value ? opcua.DataType[value.value.dataType] : null,
        arrayType: value.value ? opcua.VariantArrayType[value.value.arrayType] : null,
        value: plain(value.value?.value), statusCode: value.statusCode.value,
        statusName: value.statusCode.name, sourceTimestamp: instant(value.sourceTimestamp),
        serverTimestamp: instant(value.serverTimestamp) })),
        rawResponse: values.map((value) => plain(value.toJSON())),
        bytesRead: client.bytesRead, bytesWritten: client.bytesWritten };
    },
    async close() {
      try { if (session) { await session.close(); session = null; } }
      finally { await client.disconnect(); }
    },
  };
}

/** Project current source facts into planner state; missing/bad/stale is unknown, not false. */
export function projectOpcUaWorldState(observation, { bindings, evaluatedAt, maxAgeMs = 30_000 } = {}) {
  const evaluation = instant(evaluatedAt);
  if (!evaluation || !Array.isArray(bindings) || bindings.length > 64) {
    throw new TypeError("OUTSIDER_OPCUA_WORLD_STATE_CONFIG_INVALID");
  }
  boundedInt(maxAgeMs, 0, 86_400_000, "MAX_AGE");
  const initialState = {}, facts = [], unknown = [];
  const used = new Set();
  for (const binding of bindings) {
    nodeId(binding.nodeId);
    if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(binding.predicateId ?? "")
      || !["boolean", "number", "string"].includes(binding.valueType) || used.has(binding.predicateId)
      || ["constructor", "prototype", "__proto__"].includes(binding.predicateId)) {
      throw new TypeError("OUTSIDER_OPCUA_WORLD_STATE_BINDING_INVALID");
    }
    used.add(binding.predicateId);
    const matches = (observation.samples ?? []).filter((sample) => sample.nodeId === binding.nodeId);
    const sample = matches.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)
      || b.sampleIndex - a.sampleIndex)[0];
    let reason = null;
    if (!sample) reason = "UNMAPPED_SOURCE_NODE";
    else if (sample.quality !== "GOOD") reason = "SOURCE_QUALITY_NOT_GOOD";
    else if (sample.arrayType !== "Scalar" || typeof sample.value !== binding.valueType
      || (binding.valueType === "number" && !Number.isFinite(sample.value))) reason = "SOURCE_TYPE_MISMATCH";
    else {
      const timestamps = [sample.observedAt, sample.sourceTimestamp ?? sample.observedAt];
      if (timestamps.some((time) => !Number.isFinite(Date.parse(time)))) reason = "SOURCE_TIMESTAMP_MISSING";
      else if (timestamps.some((time) => Date.parse(time) > Date.parse(evaluation))) reason = "SOURCE_FROM_FUTURE";
      else if (timestamps.some((time) => Date.parse(evaluation) - Date.parse(time) > maxAgeMs)) reason = "SOURCE_STALE";
    }
    if (reason) {
      unknown.push({ nodeId: binding.nodeId, predicateId: binding.predicateId, reason });
      continue;
    }
    initialState[binding.predicateId] = sample.value;
    facts.push({ nodeId: sample.nodeId, predicateId: binding.predicateId, valueType: binding.valueType,
      sourceHash: sample.sourceHash, sourceTimestamp: sample.sourceTimestamp,
      observedAt: sample.observedAt, sourceClass: observation.sourceClass });
  }
  const plannerInitialState = facts.map(({ predicateId, valueType }) => ({
    predicateId, valueType, value: initialState[predicateId],
  }));
  return { schema: "outsider/opcua-planner-world-state/v1", initialState, plannerInitialState, facts, unknown,
    evaluatedAt: evaluation, sourceClass: observation.sourceClass,
    simulated: observation.sourceClass === "SIMULATED_INDUSTRIAL_DEMO",
    independentOutcomeTruthEstablished: false, physicalActuationPerformed: false };
}
