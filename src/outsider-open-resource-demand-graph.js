/* Open-ended goal understanding BEFORE catalog matching. The model proposes
 * needs and discovery work, not executable supplier capacity. Known adapters
 * remain owned by the existing compiler/runner; unknown needs are retained.
 */
import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
const digest = x => `sha256:${createHash("sha256").update(canonicalizeStrict(x)).digest("hex")}`;
const strings = { type: "array", items: { type: "string" } };
const nodeProperties = {
  id: { type: "string" }, outcome: { type: "string" }, capability: { type: "string" },
  dependsOn: strings, acceptance: strings, recoveryNeeds: strings,
  resourceKinds: strings, discoveryQueries: strings, candidateDocumentationUrls: strings,
};
export const OPEN_RESOURCE_DEMAND_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { summary: { type: "string" }, missingFacts: strings,
    requirements: { type: "array", items: { type: "object", additionalProperties: false,
      properties: { ...nodeProperties, condition: {type:'object',additionalProperties:false,required:['predecessorId','question'],
        properties:{predecessorId:{type:'string'},question:{type:'string',minLength:1,maxLength:1000}}}, outcomeKind: { type: "string", enum: ["ARTIFACT", "EXTERNAL_STATE"] } }, required: Object.keys(nodeProperties) } } },
  required: ["summary", "missingFacts", "requirements"],
};
export function validateOpenResourceDemand(value) {
  if (!value || typeof value.summary !== "string" || !Array.isArray(value.missingFacts)
    || value.missingFacts.some(x => typeof x !== "string") || !Array.isArray(value.requirements)
    || !value.requirements.length || value.requirements.length > 24) return false;
  const ids = new Set(value.requirements.map(x => x?.id));
  if (ids.size !== value.requirements.length) return false;
  for (const r of value.requirements) {
    if (r.outcomeKind !== undefined && !["ARTIFACT", "EXTERNAL_STATE"].includes(r.outcomeKind)) return false;
    if (!r || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/u.test(r.id) || !r.outcome || !r.capability
      || typeof r.outcome !== "string" || typeof r.capability !== "string") return false;
    for (const key of Object.keys(nodeProperties).slice(3)) {
      if (!Array.isArray(r[key]) || r[key].length > 12
        || r[key].some(x => typeof x !== "string" || !x || x.length > 2000)) return false;
    }
    if(r.condition&&(!r.condition.question||typeof r.condition.question!=='string'||r.condition.question.length>1000
      ||Object.keys(r.condition).sort().join(',')!=='predecessorId,question'||!r.dependsOn.includes(r.condition.predecessorId)))return false;
    if (!r.acceptance.length || !r.recoveryNeeds.length
      || r.dependsOn.some(id => !ids.has(id) || id === r.id)) return false;
  }
  // Dependency graph, not a text checklist. Reject cycles before discovery I/O.
  const visited = new Set(), active = new Set();
  const visit = id => {
    if (active.has(id)) return false; if (visited.has(id)) return true;
    active.add(id);
    if (!value.requirements.find(r => r.id === id).dependsOn.every(visit)) return false;
    active.delete(id); visited.add(id); return true;
  };
  return value.requirements.every(r => visit(r.id));
}

export async function formOpenResourceDemand({ request, knownCapabilities = [], interpret,
  discover, concurrency = 4, maximumDiscoveries = 12 }) {
  if (typeof request?.goal !== "string" || !request.goal.trim() || request.goal.length > 12000
    || request.publicDiscoveryApproved !== true || typeof interpret !== "function"
    || typeof discover !== "function" || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8
    || !Number.isInteger(maximumDiscoveries) || maximumDiscoveries < 1 || maximumDiscoveries > 48) throw new Error("OPEN_DEMAND_INPUT_INVALID");
  const started = Date.now();
  const graph = await interpret({
    task: "Decompose the FULL desired future state into an open resource dependency DAG, not a selection from a fixed catalog. Include online and physical work as needed, joint acceptance and recovery needs. Keep missing site/owner/budget facts explicit; do not invent measurements, commitments, prices or ETAs. Known capabilities are reusable building blocks, NOT the limit of the goal. Discover resources via public seller APIs, marketplaces, user-held accounts, device gateways, MCP, or standing offers. Prefer 5-12 substantive nodes over microsteps. Candidate URLs are public official documentation HYPOTHESES only, never action endpoints or credential URLs. Provide 1-2 precise discovery queries only for nodes that genuinely need external facts or resources, and at most 2 documentation URLs when known. Use discoveryQueries:[] for work that can proceed from supplied facts and available tools; do not invent research for a pure digital or file task. No private addresses, contact details or identifiers in public discovery queries. The result is a planning hypothesis, never a formed network. Return responseSchema JSON only.",
    request, knownCapabilities, responseSchema: OPEN_RESOURCE_DEMAND_SCHEMA,
  });
  if (!validateOpenResourceDemand(graph)) throw new Error("OPEN_DEMAND_GRAPH_INVALID");
  const interpretationMs = Date.now() - started;
  // URLs/queries are deduplicated across needs, not by hardcoded provider list.
  const jobs = new Map();
  for (const r of graph.requirements) {
    for (const query of r.discoveryQueries) {
      if (!jobs.has(query)) jobs.set(query, { query, requirementIds: [], candidateDocumentationUrls: [] });
      const job = jobs.get(query); job.requirementIds.push(r.id);
      job.candidateDocumentationUrls.push(...r.candidateDocumentationUrls);
    }
  }
  const queued = [...jobs.values()].map(j => ({ ...j,
    requirementIds: [...new Set(j.requirementIds)], candidateDocumentationUrls: [...new Set(j.candidateDocumentationUrls)] }));
  // Round-robin across requirements, not first-provider priority.
  const selected = []; const seen = new Set();
  for (let i = 0; i < 12; i++) for (const r of graph.requirements) {
    const q = r.discoveryQueries[i];
    if (q && !seen.has(q) && selected.length < maximumDiscoveries) { selected.push(jobs.get(q)); seen.add(q); }
  }
  const observations = new Array(selected.length); let cursor = 0;
  const discoveryStarted = Date.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, async () => {
    while (cursor < selected.length) {
      const index = cursor++; const job = selected[index];
      try { observations[index] = { queryHash: digest(job.query), requirementIds: [...new Set(job.requirementIds)],
        result: await discover({ ...job, candidateDocumentationUrls: [...new Set(job.candidateDocumentationUrls)] }) }; }
      catch { observations[index] = { queryHash: digest(job.query), requirementIds: [...new Set(job.requirementIds)],
        result: { state: "DISCOVERY_FAILED", candidates: [] } }; }
    }
  }));
  const integrationFrontier = graph.requirements.map(r => ({ requirementId: r.id,
    existingAdapterIds: knownCapabilities.filter(c => c.capability === r.capability).map(c => c.adapterId),
    discoveredRoutes: observations.filter(o => o.requirementIds.includes(r.id)).flatMap(o => o.result.candidates ?? []),
    pendingQueries: r.discoveryQueries.filter(q => !seen.has(q)),
    nextActions: ["VERIFY_REQUIREMENT_FIT_AND_LOCATION", "DISCOVER_QUOTE_ETA_AND_CAPACITY", "BIND_OWNER_AUTHORIZATION",
      "FIND_DISTINCT_RECOVERY_AND_JOINT_WITNESS"],
  }));
  return { schema: "outsider/open-resource-demand-formation/v1", graph, integrationFrontier,
    observations, graphHash: digest(graph), modelRole: "OPEN_DEMAND_AND_DISCOVERY_HYPOTHESES",
    state: "DISCOVERY_FRONTIER_NOT_COMMITMENT", completeTemporaryNetwork: false,
    metrics: { requirementCount: graph.requirements.length,
      dependencyEdges: graph.requirements.reduce((n,r) => n+r.dependsOn.length,0),
      uniqueDiscoveryJobs: queued.length, executedDiscoveryJobs: selected.length,
      deferredDiscoveryJobs: queued.length-selected.length, discoveryConcurrency: concurrency,
      interpretationMs, discoveryMs: Date.now()-discoveryStarted },
    requestHash: digest(request), paymentPerformed: false, providerEffectsPerformed: 0 };
}
