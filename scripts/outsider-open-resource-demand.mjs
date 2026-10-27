import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import { createWorldStateGoalCommandInterpreter } from "../src/outsider-world-state-goal-model.js";
import { createPublicHttpsReadOnlyFetchTransportV1 } from "../src/outsider-public-https-read-only-fetch-transport-v1.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
import { formOpenResourceDemand, OPEN_RESOURCE_DEMAND_SCHEMA, validateOpenResourceDemand }
  from "../src/outsider-open-resource-demand-graph.js";
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const digest = value => hash(canonicalizeStrict(value));
const read = f => JSON.parse(readPrivateExecutionBytes(f));
try {
  const [directory, requestFile, modelConfigFile, resultRevision = "result"] = process.argv.slice(2);
  if (!/^result(?:-[a-zA-Z0-9_-]+)?$/u.test(resultRevision)) throw new Error("OPEN_DEMAND_REVISION_INVALID");
  if (![directory,requestFile,modelConfigFile].every(f => path.isAbsolute(f ?? ""))) throw new Error("OPEN_DEMAND_ARGUMENT_INVALID");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = n => path.join(directory, `${n}.json`);
  const request = read(requestFile); writeOnce(file("request-binding"), { requestHash: digest(request) });
  if (existsSync(file(resultRevision))) { console.log(JSON.stringify(read(file(resultRevision)).metrics)); process.exit(0); }
  writeOnce(file("model-schema"), OPEN_RESOURCE_DEMAND_SCHEMA);
  const model = read(modelConfigFile); const command = [...model.argv];
  const schemaIndex = command.indexOf("--output-schema"); const cwdIndex = command.indexOf("--cd");
  if (schemaIndex < 0 || cwdIndex < 0) throw new Error("OPEN_DEMAND_MODEL_CONFIG_INVALID");
  command[schemaIndex+1] = file("model-schema"); command[cwdIndex+1] = directory;
  // This is bounded task decomposition, not an open-ended research run.
  // Keep the selected model, and constrain reasoning latency for this stage.
  command.splice(command.length-1, 0, "-c", 'model_reasoning_effort="low"');
  const interpretModel = createWorldStateGoalCommandInterpreter({ command, timeoutMs: 120000,
    validateResponse: validateOpenResourceDemand });
  const interpret = async packet => {
    if (existsSync(file("interpretation"))) return read(file("interpretation"));
    const value = await interpretModel(packet); writeOnce(file("interpretation"), value); return value;
  };
  const fetchPublic = createPublicHttpsReadOnlyFetchTransportV1({ timeoutMs: 12000, maximumResponseBytes: 512*1024 });
  const cache = new Map(); let networkReads = 0;
  const inspect = url => {
    if (cache.has(url)) return cache.get(url);
    const pending = (async () => {
      const location = new URL(url);
      // Only documentation hypotheses are fetched, never an action endpoint.
      if (location.protocol !== "https:" || location.username || location.password || location.search
        || !/(?:docs|developer|reference|openapi|swagger|llms|learn\.|support\.|\/guide|auth\.md)/iu.test(location.hostname+location.pathname)) {
        return { url, state: "NOT_A_DOCUMENTATION_ROUTE" };
      }
      const sourceFile = file(`source-${digest(url).slice(7)}`);
      let source;
      if (existsSync(sourceFile)) source = read(sourceFile);
      else {
        networkReads++;
        const response = await fetchPublic(url, { method: "GET", headers: { accept: "text/html,text/plain,application/json" },
          credentials: "omit", redirect: "error", signal: AbortSignal.timeout(12000) });
        const bytes = Buffer.from(await response.arrayBuffer());
        source = { url, status: response.status, observedAt: new Date().toISOString(),
          contentType: response.headers.get("content-type"), bodyHash: hash(bytes), bodyBytes: bytes.length,
          bodyBase64: bytes.toString("base64") };
        writeOnce(sourceFile, source);
      }
      return { url, state: source.status === 200 ? "DOCUMENTATION_OBSERVED_NOT_CAPACITY" : "DOCUMENTATION_NOT_AVAILABLE",
        httpStatus: source.status, sourceHash: hash(readPrivateExecutionBytes(sourceFile)),
        bodyHash: source.bodyHash, bytes: source.bodyBytes,
        nextAction: "EXTRACT_PROTOCOL_AND_VERIFY_CAPABILITY_FIT", authorizationEstablished: false };
    })().catch(error => ({ url, state: "DOCUMENTATION_READ_FAILED",
      failureCode: /^[A-Z0-9_]+$/u.test(error.outsiderCode ?? "") ? error.outsiderCode : "PUBLIC_READ_FAILED" }));
    cache.set(url, pending); return pending;
  };
  const result = await formOpenResourceDemand({ request,
    knownCapabilities: request.knownCapabilities ?? [], interpret,
    discover: async job => ({ state: "MODEL_PROPOSED_DOCUMENTATION_PROBE",
      openSearchStillRequired: true,
      candidates: await Promise.all(job.candidateDocumentationUrls.slice(0,2).map(inspect)) }),
    concurrency: 4, maximumDiscoveries: 12 });
  result.metrics.uniqueDocumentationRoutes = cache.size; result.metrics.actualPublicReads = networkReads;
  result.discoveryMode = "MODEL_URL_HYPOTHESIS_TO_NATIVE_PUBLIC_GET_NOT_SEARCH_ENGINE";
  result.supersedesResultHash = resultRevision !== "result" && existsSync(file("result"))
    ? hash(readPrivateExecutionBytes(file("result"))) : null;
  writeOnce(file(resultRevision), result);
  console.log(JSON.stringify({ state: result.state, graphHash: result.graphHash, metrics: result.metrics,
    requirements: result.graph.requirements.map(r => ({ id:r.id, capability:r.capability, dependsOn:r.dependsOn })),
    observedDocumentation: [...new Map(result.integrationFrontier.flatMap(x=>x.discoveredRoutes)
      .filter(x=>x.httpStatus===200).map(x=>[x.url,x])).values()].map(x=>({url:x.url,bytes:x.bytes})),
    missingFacts: result.graph.missingFacts }));
} catch (error) {
  console.error(JSON.stringify({ error: /^[A-Z][A-Z0-9_]{0,160}$/u.test(error.code ?? error.message ?? "")
    ? error.code ?? error.message : "OPEN_DEMAND_FAILED", ...(error.failure ? { failure: error.failure } : {}) })); process.exitCode = 1;
}
