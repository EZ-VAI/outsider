/* Connect an open demand job to existing source adapters. A source read is
 * neither a supplier offer nor capacity. Raw candidate leases remain ephemeral;
 * only a separate, fresh observation may be returned to the demand frontier.
 */
import { discoverMcpRegistryRemoteRoutesV1, claimMcpRegistryRemoteCandidateForObservationV1 }
  from "./outsider-mcp-registry-discovery-adapter-v1.js";
import { discoverBraveSearchRoutesV1, claimBraveSearchCandidateForSellerObservationV1 }
  from "./outsider-brave-search-route-discovery-adapter-v1.js";

export function createOpenDemandDiscoveryBridge({ bindRequirement, planSources,
  fetchImpl = globalThis.fetch, braveApiToken = null, allowBillableSearch = false,
  federatedMcpSource = null,
  observeCandidate = async () => null, maximumObservationsPerSource = 2,
  onSourceProjection = async () => {} } = {}) {
  if (typeof bindRequirement !== "function" || typeof planSources !== "function"
    || typeof observeCandidate !== "function" || typeof onSourceProjection !== "function"
    || !Number.isInteger(maximumObservationsPerSource) || maximumObservationsPerSource < 0
    || maximumObservationsPerSource > 5) throw new Error("OPEN_DISCOVERY_CONFIG_INVALID");
  return async function discover(job) {
    const plans = await planSources(job);
    if (!Array.isArray(plans) || plans.length > 4) throw new Error("OPEN_DISCOVERY_SOURCE_PLAN_INVALID");
    const results = await Promise.all(plans.map(async plan => {
      if (!["MCP_REGISTRY", "BRAVE"].includes(plan.provider) || !job.requirementIds.includes(plan.requirementId)
        || typeof plan.query !== "string" || !plan.query.trim()) throw new Error("OPEN_DISCOVERY_SOURCE_PLAN_INVALID");
      if (plan.provider === "BRAVE" && (!allowBillableSearch || !braveApiToken)) {
        return { provider: "BRAVE", requirementId: plan.requirementId, state: "DEFERRED_BILLABLE_SEARCH", candidates: [] };
      }
      const binding = await bindRequirement({ job, plan });
      const { tender, requirementKind, requirementId, asOf, expiresAt, privateBindingNonce } = binding;
      if (plan.provider === "MCP_REGISTRY" && federatedMcpSource) {
        try {
          const source = await federatedMcpSource({ binding, query:plan.query, fetchImpl });
          await onSourceProjection({provider:plan.provider,requirementId:plan.requirementId,
            projection:source.projection,interfaceObservation:source.observation});
          return {provider:plan.provider,requirementId:plan.requirementId,
            state:source.projection.status === "SUCCEEDED" ? "SOURCE_READ_COMPLETED" : "SOURCE_READ_FAILED",
            projection:source.projection,interfaceObservation:source.observation,
            candidates:source.observationHash ? [{requirementId:plan.requirementId,
              sourceHash:source.observationHash,state:"PROTOCOL_OBSERVATION_NOT_CAPABILITY_FIT",capacityEstablished:false}] : []};
        } catch {
          return {provider:plan.provider,requirementId:plan.requirementId,
            state:"FEDERATED_SOURCE_OR_OBSERVATION_FAILED",candidates:[]};
        }
      }
      let result;
      try {
        result = plan.provider === "MCP_REGISTRY"
          ? await discoverMcpRegistryRemoteRoutesV1({ tender, requirementKind, requirementId,
              discovery: { search: plan.query, limit: 10 }, asOf, expiresAt, privateBindingNonce }, { fetchImpl, timeoutMs: 10000 })
          : await discoverBraveSearchRoutesV1({ tender, requirementKind, requirementId, asOf, privateBindingNonce,
              query: { text: plan.query, country: "ALL", searchLang: null, count: 10, expiresAt } },
            { apiToken: braveApiToken, fetchImpl, timeoutMs: 10000 });
      } catch {
        return { provider: plan.provider, requirementId: plan.requirementId, state: "SOURCE_BINDING_OR_READ_FAILED", candidates: [] };
      }
      await onSourceProjection({ provider: plan.provider, requirementId: plan.requirementId, projection: result.publicProjection });
      const candidates = [];
      if (result.publicProjection.status === "SUCCEEDED") {
        const count = Math.min(maximumObservationsPerSource, result.privateEphemeral?.candidateLeaseCount ?? 0);
        for (let index = 0; index < count; index++) {
          const candidate = plan.provider === "MCP_REGISTRY"
            ? claimMcpRegistryRemoteCandidateForObservationV1(result, index)
            : claimBraveSearchCandidateForSellerObservationV1(result, index);
          // Observer must acquire its own permitted source, never persist this
          // registry/search object or relabel it as a seller-owned observation.
          const observed = await observeCandidate({ provider: plan.provider, requirementId: plan.requirementId,
            candidate, binding });
          if (observed && /^sha256:[a-f0-9]{64}$/u.test(observed.sourceHash ?? "")
            && observed.freshSourceObserved === true) candidates.push({ requirementId: plan.requirementId,
              sourceHash: observed.sourceHash, state: "FRESH_SOURCE_REQUIRES_CAPABILITY_VALIDATION",
              capacityEstablished: false });
        }
      }
      return { provider: plan.provider, requirementId: plan.requirementId,
        state: result.publicProjection.status === "SUCCEEDED" ? "SOURCE_READ_COMPLETED" : "SOURCE_READ_FAILED",
        projection: result.publicProjection, candidates };
    }));
    return { state: "SOURCE_DISCOVERY_NOT_FORMATION", sources: results.map(({ candidates, ...source }) => source),
      candidates: results.flatMap(r => r.candidates),
      unresolvedRequirements: [...job.requirementIds],
      providerCommitmentEstablished: false, actionPermitted: false };
  };
}
