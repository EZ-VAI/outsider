/* Bind model-selected operations to caller-registered native connections.
 * No dynamic code execution and no parallel orchestration engine: this stage
 * only discovers resources through already implemented adapters.
 */
import { interfaceDigest } from "./outsider-openapi-demand-matcher.js";

export async function observeInterfaceMatchedResources({ matches, connections,
  discoveryRequest, clock = () => new Date().toISOString() }) {
  if (!Array.isArray(matches?.matches) || !Array.isArray(connections)
    || new Set(connections.map(c => c.connectionId)).size !== connections.length) {
    throw new Error("INTERFACE_RESOURCE_BINDING_INPUT_INVALID");
  }
  const observedAt = clock(), observations = new Map(), pending = new Map();
  const rows = [];
  for (const match of matches.matches) {
    const bindings = [];
    for (const connection of connections) {
      // Registration is local configuration. It does not establish an external
      // owner's identity, a signed service offer or applicability to this site.
      const operations = match.operationEvidence.filter(operation =>
        connection.sourceHashes.includes(operation.sourceHash)
        && connection.operations.some(registered => registered.method === operation.method
          && registered.path === operation.path));
      if (!operations.length) continue;
      const selectedDiscovery = operations.find(operation => connection.discoveryOperation.method === operation.method
        && connection.discoveryOperation.path === operation.path);
      // The adapter, not the model, declares read-only preparation dependencies.
      // A release alone does not justify discovering/acquiring another resource.
      const prerequisite = connection.discoveryPrerequisite?.readOnly === true
        && connection.discoveryOperation?.method === "GET"
        && connection.discoveryPrerequisite.forOperations.some(required => operations.some(operation =>
          operation.method === required.method && operation.path === required.path));
      const discovery = selectedDiscovery || prerequisite;
      const expired = !Number.isFinite(Date.parse(connection.scopeExpiresAt))
        || Date.parse(observedAt) >= Date.parse(connection.scopeExpiresAt);
      const key = interfaceDigest({ connectionId: connection.connectionId, discoveryRequest });
      let state = expired ? "CONNECTION_SCOPE_EXPIRED" : !discovery ? "DISCOVERY_OPERATION_NOT_SELECTED" : "OBSERVATION_PENDING";
      if (!expired && discovery) {
        if (!pending.has(key)) pending.set(key, (async () => {
          try {
            const result = await connection.discover(discoveryRequest);
            if (result.status !== "OBSERVED" || !/^sha256:[a-f0-9]{64}$/u.test(result.providerReceipt ?? "")) {
              return { key, connectionId: connection.connectionId, state: "RESOURCE_NOT_OBSERVED",
                providerReceipt: result.providerReceipt ?? null };
            }
            return { key, connectionId: connection.connectionId, state: "RESOURCE_AVAILABILITY_OBSERVED",
              providerReceipt: result.providerReceipt, result, observedAt: result.observedAt ?? observedAt,
              failureDomainRef: connection.failureDomainRef, inventoryScope: connection.inventoryScope,
              capacityReserved: false, taskFitEstablished: false, serviceExecutionPromised: false };
          } catch { return { key, connectionId: connection.connectionId, state: "DISCOVERY_FAILED" }; }
        })());
      }
      bindings.push({ connectionId: connection.connectionId, capability: connection.capability,
        operationRefs: operations.map(o => o.operationRef), discoveryKey: !expired && discovery ? key : null,
        discoveryReason: selectedDiscovery ? "MODEL_SELECTED_DISCOVERY" : prerequisite ? "REGISTERED_READ_ONLY_PREREQUISITE" : null,
        state, unsupportedOperationRefs: match.operationEvidence.filter(o => !operations.includes(o)).map(o => o.operationRef),
        next: "BIND_ACTUAL_OUTCOME_SCOPE_QUOTE_ETA_CAPACITY_RECOVERY_AND_WITNESS" });
    }
    rows.push({ requirementId: match.requirementId, supportedSubstep: match.supportedSubstep,
      missingConditions: match.missingConditions, bindings,
      fullRequirementSatisfied: false });
  }
  for (const [key, promise] of pending) observations.set(key, await promise);
  for (const row of rows) for (const binding of row.bindings) {
    if (binding.discoveryKey) binding.state = observations.get(binding.discoveryKey).state;
  }
  return { schema: "outsider/interface-resource-observations/v1", parentMatchesHash: interfaceDigest(matches),
    graphHash: matches.graphHash, rows, observations: [...observations.values()],
    nativeDiscoveryInvocations: pending.size, observedResourceCount: [...observations.values()]
      .filter(o => o.state === "RESOURCE_AVAILABILITY_OBSERVED").length,
    executableRouteCount: 0, completeTemporaryNetwork: false, paymentPerformed: false,
    sourceMeaning: "REGISTERED_INTERFACE_TO_RESOURCE_AVAILABILITY_NOT_ORDER_COMMITMENT" };
}
