/* Read-only exploration worker; original Node execution queue stays responsive.
 * Known source snapshots are inputs, not a claim of global supplier coverage.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "../src/outsider-user-held-durable-execution-v2.js";
import { createWorldStateGoalCommandInterpreter } from "../src/outsider-world-state-goal-model.js";
import { formOpenResourceDemand, OPEN_RESOURCE_DEMAND_SCHEMA, validateOpenResourceDemand } from "../src/outsider-open-resource-demand-graph.js";
import { interfaceDigest, indexOpenApiOperations, matchDemandToInterfaces, INTERFACE_DEMAND_MATCH_SCHEMA,
  validateInterfaceDemandMatches, attachInterfaceMatchesToFrontier } from "../src/outsider-openapi-demand-matcher.js";
import { loadNativeCapacityProductionProfile } from "../src/outsider-native-capacity-production.js";
import { observeInterfaceMatchedResources } from "../src/outsider-interface-resource-binding.js";
import { discoverDemandWebSources, describePublisherResponse } from "../src/outsider-open-web-demand-sources.js";
import { planDemandSourceQueries, DEMAND_SOURCE_QUERY_SCHEMA, validateDemandSourceQueryPlan } from "../src/outsider-demand-source-query-planner.js";
import { classifyPublisherTransactionSources, publisherTransactionSchema, validatePublisherTransactions } from "../src/outsider-publisher-transaction-candidates.js";
import { preflightPublisherTransactions } from "../src/outsider-publisher-commerce-preflight.js";
const [directory, profileFile, modelFile] = process.argv.slice(2);
const read = f => JSON.parse(readPrivateExecutionBytes(f)), file = n => path.join(directory, `${n}.json`);
try {
  if (![directory, profileFile, modelFile].every(p => path.isAbsolute(p ?? ""))) throw new Error("EXPLORATION_PATH_INVALID");
  const profile = read(profileFile), request = read(file("request"));
  writeOnce(file("binding"), { requestHash: interfaceDigest(request), profileHash: interfaceDigest(profile),
    modelConfigHash: interfaceDigest(read(modelFile)) });
  if (existsSync(file("result"))) process.exit(0);
  const replayParent = existsSync(file("replay-parent")) ? read(file("replay-parent")) : null;
  if (replayParent) {
    if (!/^explore_[a-f0-9]{32}$/u.test(replayParent.explorationId)) throw new Error("EXPLORATION_PARENT_INVALID");
    const parent = path.join(path.dirname(directory), replayParent.explorationId);
    const parentResult = read(path.join(parent, "result.json"));
    if (interfaceDigest(parentResult) !== replayParent.resultHash
      || read(path.join(parent, "binding.json")).profileHash !== interfaceDigest(profile)) throw new Error("EXPLORATION_PARENT_BINDING_MISMATCH");
    const graph = read(path.join(parent, "graph.json")), matches = read(path.join(parent, "matches.json"));
    if (interfaceDigest(graph) !== parentResult.graphHash || matches.graphHash !== parentResult.graphHash)
      throw new Error("EXPLORATION_PARENT_GRAPH_MISMATCH");
    writeOnce(file("graph"), graph); writeOnce(file("matches"), matches);
    if (parentResult.openWebDiscovery) {
      const web = read(path.join(parent, "web-sources.json"));
      if (interfaceDigest(web.metrics) !== interfaceDigest(parentResult.openWebDiscovery.metrics)
        || interfaceDigest(web.cards.map(({ excerpt, ...card }) => card)) !== interfaceDigest(parentResult.openWebDiscovery.sources))
        throw new Error("EXPLORATION_PARENT_WEB_MISMATCH");
      for (const card of web.cards) {
        const key = interfaceDigest({ url: card.url, sourceHash: card.sourceHash }).slice(7);
        const manifest = read(path.join(parent, `publisher-${key}.json`));
        const bytes = Buffer.concat(manifest.chunks.map(name => Buffer.from(read(path.join(parent, `${name}.json`)).base64, "base64")));
        if (interfaceDigest(bytes) !== card.sourceHash || interfaceDigest(describePublisherResponse({ ...manifest.source, bytes,
          observedAt: manifest.source.observedAt }).card) !== interfaceDigest(card)) throw new Error("EXPLORATION_PARENT_PUBLISHER_MISMATCH");
        writeOnce(file(`publisher-${key}`), manifest);
        for (const name of manifest.chunks) writeOnce(file(name), read(path.join(parent, `${name}.json`)));
      }
      writeOnce(file("web-sources"), web);
      if (parentResult.transactionCandidates) {
        const candidates = read(path.join(parent, "transaction-candidates.json"));
        if (interfaceDigest(candidates) !== interfaceDigest(parentResult.transactionCandidates)
          || candidates.sourceSetHash !== interfaceDigest(web)) throw new Error("EXPLORATION_PARENT_CANDIDATES_MISMATCH");
        writeOnce(file("transaction-candidates"), candidates);
      }
    }
  }
  const interpreter = (name, schema, validate) => {
    writeOnce(file(`${name}-schema`), schema);
    const command = [...read(modelFile).argv], si = command.indexOf("--output-schema"), ci = command.indexOf("--cd");
    if (si < 0 || ci < 0) throw new Error("EXPLORATION_MODEL_CONFIG_INVALID");
    command[si + 1] = file(`${name}-schema`); command[ci + 1] = directory;
    command.splice(command.length - 1, 0, "-c", 'model_reasoning_effort="low"');
    return createWorldStateGoalCommandInterpreter({ command, timeoutMs: 120000, validateResponse: validate });
  };
  const started = Date.now(); let modelCalls = 0;
  const formation = await formOpenResourceDemand({ request: { goal: request.goal, publicDiscoveryApproved: true },
    knownCapabilities: profile.knownCapabilities ?? [],
    interpret: async packet => {
      if (existsSync(file("graph"))) return read(file("graph"));
      modelCalls++; const graph = await interpreter("graph", OPEN_RESOURCE_DEMAND_SCHEMA, validateOpenResourceDemand)(packet);
      writeOnce(file("graph"), graph); return graph;
    },
    discover: async () => ({ state: "OPEN_WEB_DISCOVERY_NOT_CONFIGURED", candidates: [] }) });
  let webSources = existsSync(file("web-sources")) ? read(file("web-sources")) : null;
  if (profile.openWeb && !replayParent) {
    const queryPlan = await planDemandSourceQueries({ graph: formation.graph,
      sourceAvailability: { MCP_REGISTRY: false, BRAVE: true },
      interpret: async packet => {
        modelCalls++;
        return interpreter("source-plan", DEMAND_SOURCE_QUERY_SCHEMA,
          value => validateDemandSourceQueryPlan(value, formation.graph))(packet);
      } });
    writeOnce(file("source-plan"), queryPlan);
    webSources = await discoverDemandWebSources({ graph: formation.graph, plan: queryPlan,
      reference: read(profile.openWeb.referenceFile), apiToken: read(profile.openWeb.capabilityFile).apiToken,
      maximumSearches: profile.openWeb.maximumSearches,
      writeRecord: (name, value) => writeOnce(file(name), value) });
  }
  const catalogs = (profile.sourceManifests ?? []).map(manifestFile => {
    const manifest = read(manifestFile), root = path.dirname(manifestFile);
    const bytes = Buffer.concat(manifest.chunks.map(n => Buffer.from(read(path.join(root, `${n}.json`)).base64, "base64")));
    if (interfaceDigest(bytes) !== manifest.source.contentHash) throw new Error("EXPLORATION_SOURCE_REPLAY_MISMATCH");
    return indexOpenApiOperations({ document: JSON.parse(bytes), source: manifest.source });
  });
  for (const catalog of webSources?.catalogs ?? []) {
    if (!catalogs.some(c => c.source.contentHash === catalog.source.contentHash)) catalogs.push(catalog);
  }
  let transactionCandidates = existsSync(file("transaction-candidates")) ? read(file("transaction-candidates")) : null;
  if (webSources && !transactionCandidates) {
    transactionCandidates = await classifyPublisherTransactionSources({ graph: formation.graph, sources: webSources,
      interpret: async packet => { modelCalls++; let attempt = 0; return interpreter("transactions", publisherTransactionSchema(formation.graph, webSources),
        value => { const valid = validatePublisherTransactions(value, formation.graph, [...new Map(webSources.cards.map(c => [c.sourceHash, c])).values()]);
          if (!valid) writeOnce(file(`transactions-invalid-${++attempt}`), value); return valid; })(packet); } });
    writeOnce(file("transaction-candidates"), transactionCandidates);
  }
  const commercePreflight = transactionCandidates ? await preflightPublisherTransactions({ candidates: transactionCandidates.candidates,
    readSource: candidate => {
      const key = interfaceDigest({ url: candidate.sourceUrl, sourceHash: candidate.sourceHash }).slice(7);
      return Buffer.concat(read(file(`publisher-${key}`)).chunks.map(name => Buffer.from(read(file(name)).base64, "base64")));
    }, writeRecord: (name, value) => writeOnce(file(name), value), maximumReads: 4 }) : null;
  if (commercePreflight) writeOnce(file("commerce-preflight"), commercePreflight);
  let matches;
  if (existsSync(file("matches"))) matches = read(file("matches"));
  else {
    modelCalls++;
    matches = await matchDemandToInterfaces({ graph: formation.graph, catalogs,
      interpret: interpreter("matches", INTERFACE_DEMAND_MATCH_SCHEMA,
        value => validateInterfaceDemandMatches(value, formation.graph, catalogs)) });
    writeOnce(file("matches"), matches);
  }
  const loaded = loadNativeCapacityProductionProfile({ profileFile: profile.nativeProfileFile,
    runtimeDirectory: path.join(directory, "native") });
  if (loaded.status !== "CONFIGURED") throw new Error("EXPLORATION_NATIVE_PROFILE_UNAVAILABLE");
  const calSources = catalogs.filter(c => c.source.url === "https://cal.com/docs/api-reference/v2/openapi.json").map(c => c.source.contentHash);
  const connections = loaded.resources.filter(r => r.provider === "CALCOM").map(r => {
    const adapter = loaded.adapters[r.resourceId], p = adapter.protocol;
    const op = text => { const [method, pathname] = text.split(" "); return { method, path: pathname }; };
    return { connectionId: r.resourceId, capability: r.capability, sourceHashes: calSources,
      operations: [p.availability, p.reserve, p.read, p.release].map(op), discoveryOperation: op(p.availability),
      discoveryPrerequisite: { readOnly: true, forOperations: [p.reserve].map(op) },
      scopeExpiresAt: r.scopeExpiresAt, failureDomainRef: r.failureDomainRef,
      inventoryScope: "OWNER_CONTROLLED_TEST_RESOURCE_NOT_COMMERCIAL_SUPPLY", discover: request => adapter.discover(request) };
  });
  const window = read(profile.capacityWindowFile);
  const resources = await observeInterfaceMatchedResources({ matches, connections,
    discoveryRequest: { start: window.windowStart, end: window.windowEnd } });
  // Counts from no-I/O callbacks must never masquerade as executed web queries.
  formation.metrics.deferredDiscoveryJobs = formation.metrics.uniqueDiscoveryJobs;
  formation.metrics.executedDiscoveryJobs = 0;
  for (const frontier of formation.integrationFrontier) frontier.pendingQueries =
    formation.graph.requirements.find(r => r.id === frontier.requirementId).discoveryQueries;
  const enriched = attachInterfaceMatchesToFrontier(formation, matches);
  // Detailed definitions remain private; client gets compact evidence pointers
  // and actionable gaps, not the full provider schema or private slot schedule.
  const result = { schema: "outsider/open-demand-product-frontier/v1", graph: enriched.graph,
    graphHash: enriched.graphHash, state: "PARTIAL_DISCOVERY_NOT_EXECUTION_PROPOSAL",
    frontier: enriched.integrationFrontier.map(f => ({ requirementId: f.requirementId,
      pendingQueries: f.pendingQueries, existingAdapterIds: f.existingAdapterIds,
      fit: f.interfaceHypothesis?.fit, supportedSubstep: f.interfaceHypothesis?.supportedSubstep,
      missingConditions: f.interfaceHypothesis?.missingConditions,
      operationRefs: f.interfaceHypothesis?.operationRefs,
      discoveredPublisherSources: (webSources?.jobs ?? []).filter(job => job.requirementId === f.requirementId)
        .flatMap(job => job.result.candidates),
      resourceBindings: resources.rows.find(r => r.requirementId === f.requirementId)?.bindings ?? [] })),
    openWebDiscovery: webSources ? { metrics: webSources.metrics,
      sources: webSources.cards.map(({ excerpt, ...card }) => card), pendingQueries: webSources.pendingQueries,
      // Source text and links never become a submitted tender or owner acceptance.
      transactionSubmitted: false } : null,
    transactionCandidates,
    commercePreflight,
    resourceObservations: resources.observations.map(({ key, state, providerReceipt, observedAt, inventoryScope, failureDomainRef }) =>
      ({ key, state, providerReceipt: providerReceipt ?? null, observedAt: observedAt ?? null,
        inventoryScope: inventoryScope ?? null, failureDomainRef: failureDomainRef ?? null })),
    replayParent,
    metrics: { modelCalls, elapsedMs: Date.now() - started, requirementCount: enriched.graph.requirements.length,
      nativeDiscoveryInvocations: resources.nativeDiscoveryInvocations, publicWebSearches: replayParent ? 0 : webSources?.metrics.searchCalls ?? 0,
      publisherResponsesReplayed: replayParent ? webSources?.cards.length ?? 0 : 0,
      sourceSnapshotsReplayed: catalogs.length },
    limitations: [webSources ? "OPEN_WEB_SOURCES_NOT_YET_TRANSACTION_BINDINGS" : replayParent ? "REFRESH_REUSES_INTERFACES_NO_NEW_WEB_SEARCH" : "OPEN_WEB_DISCOVERY_NOT_CONFIGURED", "INTERFACE_MATCHES_ARE_MODEL_HYPOTHESES",
      "ONLY_REGISTERED_TEST_RESOURCE_CONNECTIONS", "QUOTE_ETA_SERVICE_CAPACITY_RECOVERY_WITNESS_NOT_FORMED"],
    completeTemporaryNetwork: false, executableRouteCount: 0, confirmationAvailable: false,
    paymentPerformed: false, financialMode: "SIMULATION_ONLY" };
  writeOnce(file("resource-observations"), resources); writeOnce(file("result"), result);
} catch (error) {
  if (path.isAbsolute(directory ?? "")) writeOnce(file("failure"), {
    code: /^[A-Z][A-Z0-9_]{0,160}$/u.test(error.code ?? error.message) ? error.code ?? error.message : "EXPLORATION_FAILED",
    paymentPerformed: false, executionAuthorized: false });
  process.exitCode = 1;
}
