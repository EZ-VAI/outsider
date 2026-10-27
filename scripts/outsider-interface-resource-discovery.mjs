import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
import { loadNativeCapacityProductionProfile } from "../src/outsider-native-capacity-production.js";
import { interfaceDigest } from "../src/outsider-openapi-demand-matcher.js";
import { observeInterfaceMatchedResources } from "../src/outsider-interface-resource-binding.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));
try {
  const [directory, matchesFile, sourcesDirectory, profileFile, windowFile] = process.argv.slice(2);
  if (![directory, matchesFile, sourcesDirectory, profileFile, windowFile].every(f => path.isAbsolute(f ?? ""))) {
    throw new Error("INTERFACE_RESOURCE_ARGUMENT_INVALID");
  }
  const matches = read(matchesFile), window = read(windowFile);
  const discoveryRequest = { start: window.windowStart, end: window.windowEnd };
  if (!Number.isFinite(Date.parse(discoveryRequest.start)) || !Number.isFinite(Date.parse(discoveryRequest.end))
    || Date.parse(discoveryRequest.start) >= Date.parse(discoveryRequest.end)) throw new Error("INTERFACE_RESOURCE_WINDOW_INVALID");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`);
  writeOnce(file("input-binding"), { matchesHash: interfaceDigest(matches), profileFileHash: interfaceDigest(readPrivateExecutionBytes(profileFile)),
    windowHash: interfaceDigest(window) });
  if (existsSync(file("result"))) {
    console.log(JSON.stringify({ mode: "COLD_REPLAY", newNativeDiscoveryInvocations: 0,
      resultHash: interfaceDigest(read(file("result"))) })); process.exit(0);
  }
  const loaded = loadNativeCapacityProductionProfile({ profileFile, runtimeDirectory: path.join(directory, "native") });
  if (loaded.status !== "CONFIGURED") throw new Error("INTERFACE_NATIVE_CONNECTION_NOT_CONFIGURED");
  // Existing adapter protocol owns method/path/origin. Source association is
  // restricted to the known official Cal.com document, not model-supplied URLs.
  // More native adapters register the same connection shape; no world catalog.
  const source = read(path.join(sourcesDirectory, "source-0.json"));
  if (source.source.url !== "https://cal.com/docs/api-reference/v2/openapi.json") throw new Error("INTERFACE_SOURCE_NOT_CALCOM_OFFICIAL");
  const bytes = Buffer.concat(source.chunks.map(name => Buffer.from(read(path.join(sourcesDirectory, `${name}.json`)).base64, "base64")));
  if (interfaceDigest(bytes) !== source.source.contentHash) throw new Error("INTERFACE_SOURCE_BYTES_MISMATCH");
  const connections = loaded.resources.filter(r => r.provider === "CALCOM").map(resource => {
    const adapter = loaded.adapters[resource.resourceId], protocol = adapter.protocol;
    const operation = value => { const [method, route] = value.split(" "); return { method, path: route }; };
    return { connectionId: resource.resourceId, capability: resource.capability,
      failureDomainRef: resource.failureDomainRef, scopeExpiresAt: resource.scopeExpiresAt,
      sourceHashes: [source.source.contentHash], discoveryOperation: operation(protocol.availability),
      operations: [protocol.availability, protocol.reserve, protocol.read, protocol.release].map(operation),
      inventoryScope: "OWNER_CONTROLLED_TEST_RESOURCE_NOT_COMMERCIAL_SUPPLY",
      discover: request => adapter.discover(request) };
  });
  const started = Date.now();
  const result = await observeInterfaceMatchedResources({ matches, connections, discoveryRequest });
  writeOnce(file("result"), result);
  const metrics = { nativeDiscoveryInvocations: result.nativeDiscoveryInvocations,
    nativeDiscoveryMs: Date.now() - started, observedResourceCount: result.observedResourceCount,
    boundRequirementSubsteps: result.rows.filter(r => r.bindings.length).length,
    availableSlotIntervals: result.observations.reduce((n, o) => n + (o.result?.slots?.length ?? 0), 0),
    executableRouteCount: 0, capacityReserved: false, newModelCalls: 0, paymentPerformed: false,
    resultHash: interfaceDigest(result) };
  writeOnce(file("metrics"), metrics); console.log(JSON.stringify(metrics));
} catch (error) { console.error(JSON.stringify({ error: error.outsiderCode ?? error.message })); process.exitCode = 1; }
