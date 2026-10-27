/* Read-only evidence labels. The original contract and result records keep
 * their meaning; receiving an agent response never proves an arbitrary goal. */
export function summarizeResourceGraphAcceptance({ parts = [], result, partialDelivery }) {
  const agentParts = parts.filter(part => part.category === 'AGENT_TASK_EXECUTION');
  if (!agentParts.length) return null;
  const steps = agentParts.map(part => {
    const delivery = result?.deliveries?.[part.id] ?? partialDelivery?.deliveries?.[part.id];
    const checked = !!part.input.outputRequirement.dataValidation;
    const evaluation = delivery?.outputAcceptance;
    return { requirementId: part.id,
      scope: checked ? 'PROVIDER_RETURNED_DATA_CONDITIONS' : 'PROVIDER_RETURNED_ARTIFACT_BYTES',
      artifactReceived: delivery?.taskPhase === 'ARTIFACT_AVAILABLE',
      declaredDataConditionsSatisfied: checked ? evaluation?.dataValidation?.satisfied ?? null : null,
      ...(part.input.skillSelection ? { skillSelection: structuredClone(part.input.skillSelection) } : {}),
      semanticOutcomeSatisfied: false, independentOutcomeEvidence: false };
  });
  const artifactOnlyStepIds = steps.filter(step => step.scope === 'PROVIDER_RETURNED_ARTIFACT_BYTES').map(step => step.requirementId);
  const checkedDataStepIds = steps.filter(step => step.scope === 'PROVIDER_RETURNED_DATA_CONDITIONS').map(step => step.requirementId);
  return { schema: 'outsider/resource-graph-acceptance-summary/v1',
    confirmedTypedContractsSatisfied: result?.actualConfirmedContractDelivered === true,
    artifactOnlyStepIds, checkedDataStepIds, steps,
    allDeclaredDataConditionsSatisfied: checkedDataStepIds.length > 0
      && steps.filter(step => step.scope === 'PROVIDER_RETURNED_DATA_CONDITIONS').every(step => step.declaredDataConditionsSatisfied === true),
    otherContractSteps: parts.length - agentParts.length,
    naturalLanguageGoalEquivalenceProven: false,
    providerDescriptionsProveSuitability: false, readOnlyProjection: true };
}
