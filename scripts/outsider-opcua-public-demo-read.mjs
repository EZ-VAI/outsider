#!/usr/bin/env node
// One bounded official public-demo connection; no write, method call, or device control.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOpcUaResourceNode, createNodeOpcUaReadTransport, projectOpcUaWorldState,
  OPCUA_RESOURCE_NODE_PROTOCOL } from "../src/outsider-opcua-resource-node.js";

const [dependencyDirectory, outputDirectory, provider = "prosys"] = process.argv.slice(2);
if (!dependencyDirectory || !outputDirectory) {
  console.error("Usage: node scripts/outsider-opcua-public-demo-read.mjs DEPENDENCY_DIRECTORY NEW_PRIVATE_OUTPUT_DIRECTORY");
  process.exit(2);
}
process.umask(0o077);
const output = path.resolve(outputDirectory);
mkdirSync(output, { recursive: false, mode: 0o700 });
const demos = {
  prosys: { endpointUrl: OPCUA_RESOURCE_NODE_PROTOCOL.officialDemoEndpoint,
    sources: OPCUA_RESOURCE_NODE_PROTOCOL.officialDemoSources },
  opclabs: { endpointUrl: "opc.tcp://opcua.demo-this.com:51210/UA/SampleServer",
    sources: ["https://opcfoundation.org/forum/opc-ua-standard/how-to-set-up-remote-opc-ua-connection/",
      "https://www.opclabs.com/forum/quickopc-net/1863-browsing-your-public-server"] },
};
const demo = demos[provider];
if (!demo) throw new Error("Unknown official demo provider");
const require = createRequire(path.join(path.resolve(dependencyDirectory), "package.json"));
const opcua = require("node-opcua");
const pkg = require("node-opcua/package.json");
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const sourcePath = fileURLToPath(new URL("../src/outsider-opcua-resource-node.js", import.meta.url));
writeFileSync(path.join(output, "adapter-source.mjs"), readFileSync(sourcePath), { flag: "wx", mode: 0o600 });
const serviceResponses = [];
const transport = createNodeOpcUaReadTransport({ opcua, pkiDirectory: path.join(output, "pki"),
  allowUnsecuredDemo: true,
  // The public demo may advertise its short machine hostname, rather than FQDN.
  clientOptions: { endpointMustExist: false },
  onResponse(reply) {
    const bytes = Buffer.from(JSON.stringify({ observedAt: new Date().toISOString(), ...reply }));
    const file = path.join(output, `service-response-${serviceResponses.length + 1}.json`);
    writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
    serviceResponses.push({ service: reply.service, hash: digest(bytes), bytes: bytes.length,
      bytesRead: reply.bytesRead, bytesWritten: reply.bytesWritten });
  },
});
const resource = createOpcUaResourceNode({
  endpointUrl: demo.endpointUrl,
  officialSourceUrl: demo.sources[0],
  sourceClass: "SIMULATED_INDUSTRIAL_DEMO", transport, directory: path.join(output, "sources"),
});
const manifest = { schema: "outsider/opcua-public-demo-live-run/v1", startedAt: new Date().toISOString(),
  endpointUrl: demo.endpointUrl,
  officialSources: demo.sources,
  dependency: { name: "node-opcua", version: pkg.version,
    packageLockHash: digest(readFileSync(path.join(dependencyDirectory, "package-lock.json"))) },
  sourceHash: digest(readFileSync(sourcePath)), sourceClass: "SIMULATED_INDUSTRIAL_DEMO",
  physicalHardwareConnected: false, physicalActuationPerformed: false,
  independentOutcomeTruthEstablished: false, sources: [], sampleCount: 0 };
try {
  manifest.connection = await resource.connect();
  manifest.sources.push(manifest.connection.source);
  const objects = await resource.discover({ maxReferences: 32 });
  manifest.sources.push(objects.source);
  manifest.objectReferences = objects.references;
  const simulation = objects.references.find((ref) => /(?:^|:)Simulation$/u.test(ref.browseName));
  let chosen = [];
  if (simulation) {
    const discovery = await resource.discover({ rootNodeId: simulation.nodeId, maxReferences: 32 });
    manifest.sources.push(discovery.source);
    manifest.simulationReferences = discovery.references;
    chosen = discovery.references.filter((ref) => ref.nodeClass === "Variable").slice(0, 3).map((ref) => ref.nodeId);
  }
  const dataRoot = objects.references.find((ref) => /(?:^|:)Data$/u.test(ref.browseName));
  if (!chosen.length && dataRoot) {
    let parent = dataRoot;
    manifest.dataDiscovery = [];
    // Bounded profile navigation only: Data -> Dynamic -> Scalar. Never scan a LAN or whole server.
    for (let depth = 0; depth < 3 && parent; depth += 1) {
      const discovery = await resource.discover({ rootNodeId: parent.nodeId, maxReferences: 32 });
      manifest.sources.push(discovery.source);
      manifest.dataDiscovery.push({ parent: parent.nodeId, references: discovery.references });
      const variables = discovery.references.filter((ref) => ref.nodeClass === "Variable");
      if (variables.length) {
        variables.sort((a, b) => Number(/Double|Boolean|Int32/u.test(b.browseName))
          - Number(/Double|Boolean|Int32/u.test(a.browseName)));
        chosen = variables.slice(0, 3).map((ref) => ref.nodeId); break;
      }
      parent = discovery.references.find((ref) => /(?:^|:)Dynamic$/u.test(ref.browseName))
        ?? discovery.references.find((ref) => /(?:^|:)(?:Scalar|AnalogScalar)$/u.test(ref.browseName));
    }
  }
  if (!chosen.length) chosen = [`i=${opcua.VariableIds.Server_ServerStatus_CurrentTime}`];
  const status = await resource.observe({ nodeIds: [
    `i=${opcua.VariableIds.Server_ServerStatus_BuildInfo_ProductName}`,
    `i=${opcua.VariableIds.Server_ServerStatus_BuildInfo_SoftwareVersion}`,
    `i=${opcua.VariableIds.Server_ServerStatus_BuildInfo_BuildNumber}`,
  ] });
  manifest.sources.push(...status.sources);
  manifest.serverBuildInfo = status.samples;
  const observations = await resource.observe({ nodeIds: chosen, maxSamples: 3, intervalMs: 1000 });
  manifest.sources.push(...observations.sources);
  manifest.samples = observations.samples;
  const candidates = observations.samples.filter((sample) => sample.sampleIndex === 2
    && ["boolean", "number", "string"].includes(typeof sample.value));
  manifest.worldState = projectOpcUaWorldState(observations, {
    bindings: candidates.map((sample, index) => ({ nodeId: sample.nodeId,
      predicateId: `industrial.demo.observed${index + 1}`, valueType: typeof sample.value })),
    evaluatedAt: new Date().toISOString(), maxAgeMs: 30_000,
  });
  manifest.sampleCount = observations.samples.length + status.samples.length;
  manifest.state = "NATIVE_READ_COMPLETED";
} catch (error) {
  manifest.state = "NATIVE_READ_FAILED";
  manifest.error = { name: error.name, code: error.code ?? null, message: error.message };
  process.exitCode = 1;
} finally {
  try { await resource.close(); manifest.connectionClosed = true; }
  catch (error) { manifest.connectionClosed = false; manifest.closeError = error.message; }
  manifest.finishedAt = new Date().toISOString();
  manifest.serviceResponses = serviceResponses;
  manifest.decodedSourceBytes = manifest.sources.reduce((sum, source) => sum + source.bytes, 0);
  function protect(dir) {
    chmodSync(dir, 0o700);
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) protect(file); else chmodSync(file, 0o600);
    }
  }
  protect(output);
  writeFileSync(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ state: manifest.state, endpointUrl: manifest.endpointUrl,
    dependency: manifest.dependency, sampleCount: manifest.sampleCount,
    decodedSourceCount: manifest.sources.length, decodedSourceBytes: manifest.decodedSourceBytes,
    connectionClosed: manifest.connectionClosed, error: manifest.error ?? null,
    manifest: path.join(output, "manifest.json") }, null, 2));
}
