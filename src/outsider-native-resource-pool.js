/* Individual native connections are reusable; the selected network belongs to
 * ONE order. This does not turn an interface/configuration into an accepted
 * offer, reservation, ownership proof, or funded outcome commitment. */
import path from "node:path";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { publicDatasetHash as digest } from "./outsider-public-dataset.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "./outsider-user-held-durable-execution-v2.js";
import { isA2AResourceRoute, isPendingA2AResourceTask } from './outsider-a2a-native-resource.js';
import { isPendingNodeDelegation } from './outsider-node-step-relay.js';

const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw new Error(`NATIVE_RESOURCE_POOL_${code}`); };
const validId = value => typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);

// A terms/readiness request can itself be a remote task. Its durable operation
// identity belongs to this formation, and an absent response is not a refusal.
export async function observeNativeResourceFormation({ native, route, phase, context, operationId }) {
  let receipt, requestFailed = false;
  try { receipt = await native.call(phase, context, { operationId }); }
  catch (error) {
    const saved = native.inspect?.(phase, { operationId });
    // A same-host lock collision precedes any request. Keep this candidate and
    // operation pending rather than freezing contention as a supplier refusal.
    if (error.outsiderCode === 'NODE_ALREADY_RUNNING' && saved?.started === false)
      return { receipt: null, pending: true, retryable: true, reason: 'NATIVE_CANDIDATE_LOCAL_LOCK_BUSY' };
    if (!saved?.started) throw error;
    if (/INPUT_CHANGED|CONNECTION_CHANGED|BINDING_CHANGED/u.test(error.code ?? error.message)) throw error;
    receipt = saved.projection ? { ...saved.projection, httpAccepted: false } : null; requestFailed = true;
  }
  const authorizationRequired = receipt?.authorizationRequired === true;
  const inputRequired = receipt?.inputRequired === true;
  const delegated = isPendingNodeDelegation(receipt);
  const taskPending = isPendingA2AResourceTask(receipt);
  const unresolved = delegated && receipt.delegationState === 'EFFECT_UNKNOWN'
    || requestFailed && !receipt?.remoteTaskId && !delegated
    || isA2AResourceRoute(route) && receipt?.httpAccepted === false && !receipt.remoteTaskId
      && !authorizationRequired && !inputRequired;
  const pending = authorizationRequired || inputRequired || delegated || taskPending || unresolved;
  return { receipt, pending, retryable: pending && !authorizationRequired && !inputRequired && !unresolved,
    ...(pending ? { reason: authorizationRequired ? 'NATIVE_CANDIDATE_AUTHORIZATION_REQUIRED'
      : inputRequired ? 'NATIVE_CANDIDATE_INPUT_REQUIRED' : unresolved ? 'NATIVE_CANDIDATE_RESPONSE_UNRESOLVED'
        : delegated ? 'NATIVE_CANDIDATE_WAITING_FOR_NODE' : 'NATIVE_CANDIDATE_TASK_PENDING' } : {}) };
}
export function loadNativeResourcePool(nodeDirectory, { validateContract, validateRoute }) {
  const file = path.join(nodeDirectory, "connections", "native-resource-pool.json");
  if (!existsSync(file)) return { file, contracts: [], resources: [] };
  const pool = read(file);
  if (pool.schema !== "outsider/native-resource-pool/v1" || !Array.isArray(pool.contracts)
    || !Array.isArray(pool.resources) || pool.contracts.length > 32 || pool.resources.length > 64
    || new Set(pool.contracts.map(c => c.id)).size !== pool.contracts.length
    || new Set(pool.resources.map(r => r.id)).size !== pool.resources.length) fail("INVALID");
  pool.contracts.forEach(validateContract);
  for (const resource of pool.resources) {
    if (!validId(resource.id) || !["EXECUTOR", "WITNESS"].includes(resource.role)
      || !Array.isArray(resource.contractIds) || !resource.contractIds.length
      || resource.contractIds.some(id => !pool.contracts.some(c => c.id === id))) fail("RESOURCE_INVALID");
    validateRoute(resource.route, resource.role === "WITNESS" ? "witness" : "primary");
  }
  return { file, contracts: pool.contracts, resources: pool.resources };
}

export function poolContractCatalog(pool, capability) {
  return pool.contracts.map(contract => {
    const resources = pool.resources.filter(r => r.contractIds.includes(contract.id));
    return { networkId: contract.id, capability, description: contract.description,
      inputFields: contract.inputFields, acceptanceContract: contract.acceptanceContract,
      lateBoundInputFields:contract.lateBoundInputFields??[],publicResultFields:contract.publicResultFields??[],
      expiresAt: contract.expiresAt, assemblyMode: "PER_ORDER_INDIVIDUAL_RESOURCE_POOL",
      candidateResources: resources.map(r => ({ resourceId: r.id, role: r.role, providerRef: r.route.providerRef })),
      providerRefs: [...new Set(resources.map(r => r.route.providerRef))],
      preconfiguredWholeNetworkRequired: false, capacityReserved: false,
      requiresCurrentNativeQuotesAndReservations: true, capitalBacked: false };
  });
}

// Existing confirmed tasks bind only their selected connections. Adding another
// independent candidate later does not silently replace a reserved participant.
export function materializePoolNetwork(pool, contractId, selectedResourceIds) {
  const contract = pool.contracts.find(c => c.id === contractId);
  if (!contract) fail("CONTRACT_MISSING");
  const selected = Object.fromEntries(["primary", "recovery", "witness"].map(role => {
    const resource = pool.resources.find(r => r.id === selectedResourceIds[role]);
    if (!resource || !resource.contractIds.includes(contractId)
      || resource.role !== (role === "witness" ? "WITNESS" : "EXECUTOR")) fail("SELECTED_RESOURCE_MISSING");
    return [role, resource.route];
  }));
  if (new Set(Object.values(selected).map(r => r.providerRef)).size !== 3
    || new Set(Object.values(selected).map(r => r.origin)).size !== 3) fail("DISTINCT_ROLES_MISSING");
  return { ...contract, ...selected, assemblyMode: "PER_ORDER_INDIVIDUAL_RESOURCE_POOL", selectedResourceIds };
}

async function collectBounded(rows, collect) {
  const results = new Array(rows.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, rows.length) }, async () => {
    while (next < rows.length) {
      const index = next++;
      try { results[index] = await collect(rows[index]); }
      catch (error) {
        results[index] = { resourceId: rows[index].id, providerRef: rows[index].route.providerRef,
          eligible: false, reason: "NATIVE_CANDIDATE_REQUEST_FAILED", errorName: error.name };
      }
    }
  }));
  return results;
}

export async function assembleNativeResourcePool({ pool, contract, input, directory, completionDeadline,inputRecipe, formationConstraints,
  createRoute, acceptableQuote, assessQuote, clock, eligibleRoute, connectionSelectionConstraints, rankOptions }) {
  const binding = { contractId: contract.id, contractHash: digest(contract), inputHash: digest(input),
    inputRecipeHash: inputRecipe?.recipeHash ?? null, completionDeadline,
    ...(formationConstraints ? { formationConstraintsHash: digest(formationConstraints) } : {}),
    ...(connectionSelectionConstraints ? { connectionSelectionConstraintsHash: digest(connectionSelectionConstraints) } : {}) };
  writeOnce(path.join(directory, 'pool-formation-binding.json'), binding);
  const selectionFile = path.join(directory, "pool-selection.json");
  if (existsSync(selectionFile)) {
    const selection = read(selectionFile);
    if (selection.contractId !== contract.id || selection.inputHash !== digest(input)
      ||(selection.inputRecipeHash??null)!==(inputRecipe?.recipeHash??null)
      || selection.completionDeadline !== completionDeadline) fail("PREPARATION_CHANGED");
    if (!selection.selectedResourceIds) return { network: null, selection, quotes: null };
    const network = materializePoolNetwork(pool, contract.id, selection.selectedResourceIds);
    if (digest(network) !== selection.selectedNetworkHash) fail("SELECTED_CONNECTION_CHANGED");
    const quotes = Object.fromEntries(["primary", "recovery"].map(role => [role,
      selection.observations.find(o => o.resourceId === selection.selectedResourceIds[role]).receipt]));
    return { network, selection, quotes };
  }
  const resources = pool.resources.filter(r => r.contractIds.includes(contract.id)
    && (!eligibleRoute || eligibleRoute(r.route, r.role === 'WITNESS' ? 'witness' : 'primary')));
  const startedAt = clock(), began = Date.now();
  const observations = await collectBounded(resources, async resource => {
    const candidateDirectory = path.join(directory, "candidates", resource.id);
    mkdirSync(candidateDirectory, { recursive: true, mode: 0o700 });
    writeOnce(path.join(candidateDirectory, 'formation-binding.json'), { ...binding, routeHash: digest(resource.route) });
    const native = createRoute({ directory: candidateDirectory, route: resource.route });
    const isWitness = resource.role === "WITNESS";
    const observed = await observeNativeResourceFormation({ native, route: resource.route, phase: isWitness ? 'ready' : 'quote',
      operationId: `formation-${digest({ binding, resourceId: resource.id }).slice(7)}`, context: {
      input, completionDeadline, currency: contract.currency, contract: contract.acceptanceContract,
      ...(inputRecipe?{inputRecipe}:{} ), ...(formationConstraints ? { formationConstraints } : {}) } });
    const assessment = !isWitness && observed.receipt && assessQuote ? assessQuote(observed.receipt, clock()) : null;
    const eligible = !!observed.receipt && (isWitness ? observed.receipt.httpAccepted && observed.receipt.ready === true
      : assessment ? assessment.acceptable : acceptableQuote(observed.receipt, clock()));
    return { resourceId: resource.id, providerRef: resource.route.providerRef,
      ...observed, ...(assessment ? { assessment } : {}), eligible, pending: !eligible && observed.pending, role: resource.role };
  });
  const eligible = observations.filter(o => o.eligible);
  const executors = eligible.filter(o => o.role === "EXECUTOR").sort((a, b) =>
    Date.parse(a.receipt.completionBy) - Date.parse(b.receipt.completionBy) || a.resourceId.localeCompare(b.resourceId));
  const witnesses = eligible.filter(o => o.role === "WITNESS").sort((a, b) => a.resourceId.localeCompare(b.resourceId));
  let selected = null, network = null;
  const feasible = [];
  for (const primary of executors) {
    for (const recovery of executors) {
      if (primary.resourceId === recovery.resourceId) continue;
      for (const witness of witnesses) {
        const ids = { primary: primary.resourceId, recovery: recovery.resourceId, witness: witness.resourceId };
        let candidateNetwork;
        try { candidateNetwork = materializePoolNetwork(pool, contract.id, ids); }
        catch { continue; }
        feasible.push({ primary, recovery, witness, network: candidateNetwork,
          completionBound: Math.max(Date.parse(primary.receipt.completionBy), Date.parse(recovery.receipt.completionBy)) });
      }
    }
  }
  // Downstream formation needs to cover either accepted execution route. The
  // fastest primary alone is insufficient when its recovery completes later.
  feasible.sort((a, b) => a.completionBound - b.completionBound
    || Date.parse(a.primary.receipt.completionBy) - Date.parse(b.primary.receipt.completionBy)
    || a.primary.resourceId.localeCompare(b.primary.resourceId)
    || a.recovery.resourceId.localeCompare(b.recovery.resourceId)
    || a.witness.resourceId.localeCompare(b.witness.resourceId));
  let resourceChoice = null;
  if (feasible.length && rankOptions) {
    const choices = feasible.map(row => ({ id: digest(row.network.selectedResourceIds),
      amountMinor: (BigInt(row.primary.receipt.totalAmountMinor) + BigInt(row.recovery.receipt.totalAmountMinor)).toString(),
      currency: contract.currency, completionBy: new Date(row.completionBound).toISOString(),
      validUntil: new Date(Math.min(Date.parse(row.primary.receipt.expiresAt), Date.parse(row.recovery.receipt.expiresAt))).toISOString(),
      network: row.network, quotes: { primary: row.primary.receipt, recovery: row.recovery.receipt } }));
    resourceChoice = await rankOptions(choices);
    if (resourceChoice.selectedId) {
      selected = feasible.find(row => digest(row.network.selectedResourceIds) === resourceChoice.selectedId);
      if (!selected) fail('RESOURCE_CHOICE_OUTSIDE_CURRENT_QUOTES');
    }
  } else if (feasible.length) selected = feasible[0];
  if (selected) network = selected.network;
  const selection = { schema: "outsider/per-order-native-network-selection/v1", contractId: contract.id,
    state: selected ? "SELECTED_NOT_RESERVED" : observations.some(o => o.pending) ? "WAITING_CURRENT_TERMS" : "UNAVAILABLE",
    startedAt, completedAt: clock(),
    inputHash: digest(input), completionDeadline, observations, selectedNetworkHash: network ? digest(network) : null,
    ...(inputRecipe?{inputRecipeHash:inputRecipe.recipeHash}:{}),
    selectedResourceIds: network?.selectedResourceIds ?? null,
    ...(formationConstraints ? { formationConstraints } : {}),
    ...(resourceChoice ? { resourceChoice } : {}),
    selectionBasis: resourceChoice?.selectionBasis ?? "CURRENT_NATIVE_TERMS_DEPENDENCY_WINDOW_BUDGET_AND_EARLIEST_TWO_ROUTE_COMPLETION",
    legalOwnershipIndependenceAutomaticallyProven: false, capacityReserved: false,
    metrics: { candidatesQueried: observations.length, eligibleExecutors: executors.length,
      eligibleWitnesses: witnesses.length, maximumConcurrency: 6, elapsedMs: Date.now() - began } };
  // Final selections remain immutable. Pending observations are append-only,
  // so a later wake can query the same remote tasks and form this same order.
  if (selection.state === 'WAITING_CURRENT_TERMS') {
    const progressDirectory = path.join(directory, 'pool-formation-observations');
    mkdirSync(progressDirectory, { recursive: true, mode: 0o700 });
    const occurrence = readdirSync(progressDirectory).filter(name => /^\d{8}\.json$/u.test(name)).length + 1;
    writeOnce(path.join(progressDirectory, `${String(occurrence).padStart(8, '0')}.json`), selection);
  } else writeOnce(selectionFile, selection);
  return { network, selection, quotes: selected ? { primary: selected.primary.receipt, recovery: selected.recovery.receipt } : null };
}
