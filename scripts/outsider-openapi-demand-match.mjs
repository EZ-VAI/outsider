import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
import { createWorldStateGoalCommandInterpreter } from "../src/outsider-world-state-goal-model.js";
import { readOpenApiInterface, indexOpenApiOperations, interfaceDigest, INTERFACE_DEMAND_MATCH_SCHEMA,
  validateInterfaceDemandMatches, matchDemandToInterfaces, attachInterfaceMatchesToFrontier } from "../src/outsider-openapi-demand-matcher.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));
try {
  const [directory, graphFile, modelFile, sourcesFile, formationFile] = process.argv.slice(2);
  if (![directory, graphFile, modelFile, sourcesFile].every(f => path.isAbsolute(f ?? ""))
    || (formationFile && !path.isAbsolute(formationFile))) throw new Error("INTERFACE_MATCH_ARGUMENT_INVALID");
  const graph = read(graphFile), sources = read(sourcesFile);
  if (!Array.isArray(sources) || !sources.length || sources.length > 4
    || sources.some(s => s.privateInterfaceResearchApproved !== true || typeof s.url !== "string")) {
    throw new Error("INTERFACE_SOURCE_APPROVAL_REQUIRED");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`);
  writeOnce(file("input-binding"), { graphHash: interfaceDigest(graph), sourcesHash: interfaceDigest(sources),
    formationHash: formationFile ? interfaceDigest(read(formationFile)) : null });
  if (existsSync(file("result"))) {
    const result = read(file("result"));
    console.log(JSON.stringify({ mode: "COLD_REPLAY", newHttpRequests: 0, newModelCalls: 0,
      resultHash: interfaceDigest(result), executableRouteCount: result.executableRouteCount }));
    process.exit(0);
  }
  let newSourceGets = 0;
  const started = Date.now();
  const catalogs = await Promise.all(sources.map(async (source, index) => {
    const manifestFile = file(`source-${index}`);
    if (existsSync(manifestFile)) {
      const manifest = read(manifestFile);
      const bytes = Buffer.concat(manifest.chunks.map(name => Buffer.from(read(file(name)).base64, "base64")));
      if (interfaceDigest(bytes) !== manifest.source.contentHash) throw new Error("INTERFACE_SOURCE_REPLAY_MISMATCH");
      return indexOpenApiOperations({ document: JSON.parse(bytes), source: manifest.source });
    }
    newSourceGets += 1;
    const observed = await readOpenApiInterface({ url: source.url });
    const chunks = [];
    for (let offset = 0; offset < observed.bytes.length; offset += 384 * 1024) {
      const name = `source-${index}-chunk-${chunks.length}`;
      writeOnce(file(name), { base64: observed.bytes.subarray(offset, offset + 384 * 1024).toString("base64") });
      chunks.push(name);
    }
    writeOnce(manifestFile, { source: observed.catalog.source, chunks,
      rightsScope: "CALLER_APPROVED_PRIVATE_PUBLIC_DOCUMENTATION_INTERFACE_RESEARCH_NO_REPUBLICATION",
      operationCount: observed.catalog.operations.length });
    return observed.catalog;
  }));
  const discoveryMs = Date.now() - started;
  writeOnce(file("schema"), INTERFACE_DEMAND_MATCH_SCHEMA);
  const command = [...read(modelFile).argv], si = command.indexOf("--output-schema"), ci = command.indexOf("--cd");
  if (si < 0 || ci < 0) throw new Error("INTERFACE_MODEL_CONFIG_INVALID");
  command[si + 1] = file("schema"); command[ci + 1] = directory;
  command.splice(command.length - 1, 0, "-c", 'model_reasoning_effort="low"');
  const interpret = createWorldStateGoalCommandInterpreter({ command, timeoutMs: 120000,
    validateResponse: value => {
      const valid = validateInterfaceDemandMatches(value, graph, catalogs);
      writeOnce(file(`model-response-${randomUUID()}`), { valid, value });
      return valid;
    } });
  const modelStarted = Date.now();
  const result = await matchDemandToInterfaces({ graph, catalogs, interpret });
  writeOnce(file("result"), result);
  if (formationFile) writeOnce(file("formation-successor"), attachInterfaceMatchesToFrontier(read(formationFile), result));
  const metrics = { newSourceGets, sourceBytes: catalogs.reduce((sum, c) => sum + c.source.bytes, 0),
    operationCount: catalogs.reduce((sum, c) => sum + c.operations.length, 0), discoveryMs,
    modelCalls: 1, modelMs: Date.now() - modelStarted, executableRouteCount: 0,
    matches: result.matches.map(m => ({ requirementId: m.requirementId, fit: m.fit, operationCount: m.operationRefs.length })),
    resultHash: interfaceDigest(result) };
  writeOnce(file("metrics"), metrics);
  console.log(JSON.stringify(metrics));
} catch (error) {
  console.error(JSON.stringify({ error: error.code ?? error.message, failure: error.failure ?? null }));
  process.exitCode = 1;
}
