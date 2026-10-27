/* Runnable DATA example, not a work order. Every capacity, cost, effect and
 * duration below is fictional. No office, factory or device is actuated. */
const minute = 60_000;
const fact = predicateId => ({ predicateId, valueType: "boolean", value: true });
const condition = predicateId => ({ ...fact(predicateId), operator: "EQ" });
const action = (actionId, requires, produces, minutes, costMinor, resourceIds = []) => ({
  actionId, capability: `RESOURCE_${actionId.toUpperCase()}`,
  preconditions: requires.map(condition), effects: produces.map(fact),
  durationMs: minutes * minute, costMinor,
  resourceClaims: resourceIds.map(resourceId => ({ resourceId, units: 1 })),
  failureDomainRefs: ["synthetic-facility"],
});

export function createWorldStateResourceNetworkExample(createdAt = "2026-09-05T13:00:00.000Z") {
  const actions = [
    action("secure_space", [], ["space.ready"], 4, "12000"),
    action("enable_power", [], ["power.ready"], 6, "8000"),
    action("wired_network", [], ["network.ready"], 8, "18000", ["network_team"]),
    action("wireless_network", [], ["network.ready"], 3, "35000", ["network_team"]),
    action("prepare_staff", [], ["people.ready"], 5, "11000"),
    action("install_equipment", ["space.ready", "power.ready"], ["equipment.installed"],
      4, "24000", ["installation_crew"]),
    action("configure_workstations", ["space.ready", "power.ready", "network.ready"],
      ["workstations.ready"], 3, "13000", ["installation_crew"]),
    action("commission", ["equipment.installed", "workstations.ready", "people.ready"],
      ["facility.operational"], 2, "7500", ["acceptance_instrument"]),
  ];
  const planningInput = {
    initialState: [],
    targetPredicates: ["facility.operational", "network.ready", "people.ready"].map(condition),
    actions,
    resources: [
      { resourceId: "installation_crew", resourceType: "PERSONNEL", capacityUnits: 1 },
      { resourceId: "network_team", resourceType: "SERVICE_TEAM", capacityUnits: 1 },
      { resourceId: "acceptance_instrument", resourceType: "EQUIPMENT", capacityUnits: 1 },
    ],
    budget: { currency: "USD", maximumAmountMinor: "120000" },
    deadlineMs: 20 * minute,
    searchLimits: { maxExpansions: 5000, maxActionsPerPlan: 8, maxPlans: 4 },
    recoveryScenarios: [{
      scenarioId: "wired_unavailable_after_preparation",
      initialState: ["space.ready", "power.ready", "people.ready"].map(fact),
      unavailableActionIds: ["wired_network"], elapsedMs: 6 * minute,
      sunkCostMinor: "31000",
    }],
  };
  const formationDeadline = new Date(Date.parse(createdAt) + minute).toISOString();
  const completionDeadline = new Date(Date.parse(formationDeadline) + 20 * minute).toISOString();
  const cleanupDeadline = new Date(Date.parse(completionDeadline) + minute).toISOString();
  const requirements = [];
  const obligations = [];
  const actionBindings = {};
  function requirement(requirementId, role, capability) {
    requirements.push({ requirementId, role, capability,
      constraints: { exampleOnly: true, ownerCapacityEstablished: false },
      minimumReservationMs: 22 * minute, dependsOnRequirementIds: [] });
    obligations.push({ obligationId: `close_${requirementId}`, trigger: "ALWAYS",
      targetRequirementId: requirementId, nodeId: null,
      action: "CLOSE_RESOURCE_LIFECYCLE", input: { exampleOnly: true }, deadline: cleanupDeadline });
    return requirementId;
  }
  for (const candidate of actions) {
    actionBindings[candidate.actionId] = {
      primaryRequirementId: requirement(`primary_${candidate.actionId}`, "PRIMARY", candidate.capability),
      recoveryRequirementId: requirement(`recovery_${candidate.actionId}`, "RECOVERY", candidate.capability),
      witnessRequirementId: requirement(`witness_${candidate.actionId}`, "INDEPENDENT_WITNESS", "RESOURCE_STATE_OBSERVATION"),
      input: { exampleOnly: true },
    };
  }
  const finalWitnessRequirementId = requirement("joint_world_state_witness",
    "INDEPENDENT_WITNESS", "JOINT_CURRENT_STATE_OBSERVATION");
  return { exampleOnly: true, planningInput, actionBindings,
    programInput: {
      programId: "example_resource_network", orderId: "example_resource_order",
      statement: "Synthetic multi-resource readiness graph; not a real facility work order.",
      createdAt, formationDeadline, completionDeadline, requirements, obligations,
      finalWitnessRequirementId,
    },
  };
}
