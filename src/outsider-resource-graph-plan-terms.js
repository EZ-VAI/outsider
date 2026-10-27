/* Adapter-side projection of the contracts already prepared by the resource
 * graph. The shared plan evaluator consumes only these terms, never provider
 * names, private files or task-category conventions. A quote/authorization
 * ceiling is not capacity, independent evidence or an Outcome guarantee. */
import { publicDatasetHash as digest } from './outsider-public-dataset.js';

export const RESOURCE_GRAPH_PLAN_TERMS_SCHEMA = 'outsider/resource-graph-plan-terms/v1';
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const amount = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/u.test(value);
const currency = value => typeof value === 'string' && /^[A-Z]{3}$/u.test(value);
const knownCategories = new Set(['NETWORK_WORK_DELIVERY','DIGITAL_AGENT_EXECUTION','MANAGED_NETWORK_TRANSACTION','PARTICIPANT_WORK', 'PUBLIC_JSON_ARTIFACT_PUBLICATION', 'AGENT_TASK_EXECUTION',
  'DIGITAL_GOODS_ACQUISITION', 'COLLABORATION_HANDOFF', 'SCHEDULED_BOOKING', 'RETAIL_FULFILLMENT',
  'SOFTWARE_INVOCATION', 'NATIVE_RESOURCE_NETWORK', 'NATIVE_STATE_OBSERVATION', 'SOFTWARE_EXECUTION', 'DIGITAL_SERVICE', 'TIME_CAPACITY']);

export function projectResourceGraphPlanTerms({ graph, parts = [], operations }) {
  return graph.requirements.map(demand => {
    const part = parts.find(row => row.id === demand.id);
    const operation = operations.find(row => row.capability === demand.capability);
    const category = part?.category ?? operation?.category;
    const acceptanceContract = part?.acceptanceContract ?? operation?.acceptanceContract ?? null;
    const sourceHash = digest({ schema: RESOURCE_GRAPH_PLAN_TERMS_SCHEMA, requirementId: demand.id,
      capability: demand.capability, category: category ?? null, acceptanceContract,
      preparedPartHash: part ? digest(part) : null });
    const dispatchConstraints = [], confirmationConstraints = [];
    const window = (source, values) => {
      const row = { sourceHash: digest({ projection: sourceHash, source }) };
      if (instant(values.latestStartAt)) row.latestStartAt = values.latestStartAt;
      if (instant(values.validUntil)) row.validUntil = values.validUntil;
      if (Object.keys(row).length > 1) dispatchConstraints.push(row);
    };
    let cost = null;
    const ceiling = (value, denomination, basis, source = sourceHash) => {
      if (amount(value) && currency(denomination)) cost = { currency: denomination,
        maximumAmountMinor: value, basis, sourceHash: source };
    };
    if (part) {
      if (category === 'NATIVE_RESOURCE_NETWORK') {
        // These are the selected executor routes, including the accepted
        // backup, rather than every candidate examined during discovery.
        ceiling(part.formationFeasibility?.quotedExecutorTotalMinor, part.formationFeasibility?.currency, 'SOURCE_QUOTED_MAXIMUM');
        for (const [role, quote] of Object.entries(part.quotes ?? {})) {
          // A route cannot first start after its own completion bound. This
          // derives a necessary upper bound, never an earliest completion.
          const bounds = [quote.latestStartAt, quote.completionBy].filter(instant);
          window({ role, quote }, { latestStartAt: bounds.length
            ? new Date(Math.min(...bounds.map(value => Date.parse(value)))).toISOString() : null });
          if (instant(quote.expiresAt)) confirmationConstraints.push({ sourceHash: digest({ role, quote }), validUntil: quote.expiresAt });
        }
      } else if (category === 'NETWORK_WORK_DELIVERY') {
        ceiling(part.purchase.totalAmountMinor,part.purchase.currency,'AUTHORIZED_EXECUTION_CEILING');
        window({networkWorkPlanHash:part.purchase.planHash},{latestStartAt:new Date(part.input.draft.schedule.service_window.start.utc.replace(' ','T')+'Z').toISOString()});
      } else if (category === 'MANAGED_NETWORK_TRANSACTION') {
        ceiling(part.purchase.totalAmountMinor,part.purchase.currency,'SOURCE_QUOTED_MAXIMUM');
        window({networkPlanHash:part.purchase.planHash},{validUntil:part.purchase.expiresAt});
        confirmationConstraints.push({sourceHash:part.purchase.planHash,validUntil:part.purchase.expiresAt});
      } else if (category === 'PARTICIPANT_WORK') {
        ceiling(part.purchase.totalAmountMinor, part.purchase.currency, 'SOURCE_QUOTED_MAXIMUM');
        window({ workPlanHash: part.purchase.planHash }, { latestStartAt: part.purchase.durationMs === undefined
          ? part.purchase.availableEnd : new Date(Date.parse(part.purchase.availableEnd) - part.purchase.durationMs).toISOString(),
          // Calendar-backed orders reserve before card capture. Quote expiry
          // limits acceptance now, not performance on the booked future date.
          validUntil: part.purchase.serviceSource ? undefined : part.purchase.expiresAt });
        confirmationConstraints.push({ sourceHash: part.purchase.planHash, validUntil: part.purchase.expiresAt });
      } else if (category === 'NATIVE_STATE_OBSERVATION') {
        ceiling('0', 'USD', 'AUTHORIZED_EXECUTION_CEILING');
        window({ connectionHash: part.connectionHash }, { validUntil: part.resource?.expiresAt });
      } else if (category === 'DIGITAL_AGENT_EXECUTION') {
        // Existing execution subscription, not a new provider purchase. Any
        // paid external effect remains its own priced order requirement.
        ceiling('0', 'USD', 'AUTHORIZED_EXECUTION_CEILING');
      } else if (category === 'AGENT_TASK_EXECUTION') {
        // The adapter admits only zero-cost task connections. This is the
        // authorized execution ceiling; it does not price unrelated costs.
        ceiling('0', 'USD', 'AUTHORIZED_EXECUTION_CEILING');
        window({ role: 'PRIMARY', connectionHash: part.connectionHash }, { validUntil: part.resource?.expiresAt });
        if (part.recovery) window({ role: 'RECOVERY', connectionHash: part.recovery.connectionHash },
          { validUntil: part.recovery.resource?.expiresAt });
      } else if (['SOFTWARE_EXECUTION', 'DIGITAL_SERVICE'].includes(category)) {
        const budget = part.preparation?.compilation?.program?.outcome?.budget;
        ceiling(budget?.maximumAmountMinor, budget?.currency, 'FROZEN_EXECUTION_BUDGET');
      } else if (category === 'PUBLIC_JSON_ARTIFACT_PUBLICATION') {
        ceiling(part.maximumAmountMinor, 'USD', 'AUTHORIZED_EXECUTION_CEILING');
        window({ connectionHash: part.connectionHash }, { validUntil: part.publicationProfile?.zeroCostScope?.expiresAt });
      } else if (category === 'COLLABORATION_HANDOFF') {
        ceiling(part.maximumAmountMinor, 'USD', 'AUTHORIZED_EXECUTION_CEILING');
      } else if (['SCHEDULED_BOOKING', 'TIME_CAPACITY', 'SOFTWARE_INVOCATION'].includes(category)) {
        if (category === 'SCHEDULED_BOOKING') {
          ceiling(part.booking?.event?.totalAmountMinor, part.booking?.event?.currency, 'SOURCE_QUOTED_MAXIMUM');
          window({ event: part.booking?.event ?? null, slotStart: part.booking?.slotStart ?? null }, { validUntil: part.booking?.slotStart });
        } else ceiling('0', 'USD', 'AUTHORIZED_EXECUTION_CEILING');
        if (category === 'SOFTWARE_INVOCATION')
          window({ sourceResultHash: part.sourceResultHash }, { validUntil: part.delivery?.availableUntil });
      } else if (['RETAIL_FULFILLMENT', 'DIGITAL_GOODS_ACQUISITION'].includes(category)) {
        // Paid history is not a new payment. Only the prepared transaction's
        // bound ceiling participates; an absent denomination remains unknown.
        const purchase = part.purchase;
        if (purchase) {
          ceiling(purchase.totalAmountMinor, purchase.currency, part.continuingAcceptedOrder
            ? 'EXISTING_ACCEPTED_ORDER_NO_NEW_CHARGE' : 'SOURCE_QUOTED_MAXIMUM');
          if (!part.continuingAcceptedOrder)
            window({ checkoutPlanHash: purchase.planHash }, { validUntil: purchase.expiresAt });
        }
      }
    }
    return { requirementId: demand.id, cost, dispatchConstraints, confirmationConstraints,
      providerCompletionBy: instant(part?.formationFeasibility?.providerCompletionBound)
        ? part.formationFeasibility.providerCompletionBound : null,
      acceptanceContract,
      // A digital reread establishes one current sample, never a sustained
      // interval. Native sources retain their separately declared intervals.
      // Before preparation, the digital witness capability is not yet known;
      // the prepared part below must supply its actual observation declaration.
      jointEvidence: part?.jointStateObservation?.intervalMeaning === 'FRESH_READ_POINT' ? 'DECLARED_CURRENT_POINT'
        : part?.jointStateObservation ? 'DECLARED_SOURCE_INTERVALS'
        : !part && category === 'DIGITAL_AGENT_EXECUTION'
          || ['NATIVE_RESOURCE_NETWORK','NATIVE_STATE_OBSERVATION'].includes(category) || !knownCategories.has(category) ? 'UNREPORTED' : 'UNSUPPORTED' };
  });
}
