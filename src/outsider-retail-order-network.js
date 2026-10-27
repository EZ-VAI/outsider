/* Assemble the WHOLE order's already accepted purchases, not one manually
 * supplied transaction at a time. Execution remains in the original graph. */
import { planWorldStateResources } from './outsider-world-state-resource-planner.js';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';
const money = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,11})$/u.test(value);
const errorCode = error => /^[A-Z][A-Z0-9_]{0,100}$/u.test(error?.code ?? error?.message)
  ? error.code ?? error.message : 'ORDER_READ_UNAVAILABLE';
export async function assembleRetailOrderNetwork({ graph, formation, service, currency, maximumTotalMinor }) {
  if (!money(maximumTotalMinor) || !/^[A-Z]{3}$/u.test(currency??'')) throw new Error('RETAIL_NETWORK_BUDGET_REQUIRED');
  const demands = graph.requirements.filter(r => r.capability === 'RETAIL_GOODS_DELIVERY_V1');
  if (!demands.length) throw new Error('RETAIL_NETWORK_DEMAND_REQUIRED');
  const references = demands.flatMap(d => (formation?.demands?.find(row => row.requirementId === d.id)?.candidates ?? [])
    .filter(c => c.transactionCreated !== false).map(c => ({ requirementId:d.id,transactionId:c.transactionId })));
  const reads = new Map();
  for (const {transactionId} of references) if (!reads.has(transactionId)) reads.set(transactionId,
    Promise.resolve().then(()=>service.bindOrder(transactionId)).then(order=>({transactionId,...order}))
      .catch(error=>({transactionId,state:'ORDER_UNAVAILABLE',reason:errorCode(error)})));
  const transactions = await Promise.all([...reads.values()]);
  const eligible = transactions.filter(t=>t.sellerOrderAccepted===true && t.needsPayment===false
    && t.currency===currency && money(t.totalAmountMinor) && /^sha256:[a-f0-9]{64}$/u.test(t.orderRefHash??''));
  const knownPurchases = new Map(transactions.filter(t=>t.sellerOrderAccepted===true
    && t.currency===currency && money(t.totalAmountMinor) && t.orderRefHash).map(t=>[t.orderRefHash,t]));
  const unresolvedAcquisitions = transactions.filter(t=>t.sellerOrderAccepted===true
    && (t.currency!==currency || !money(t.totalAmountMinor) || !t.orderRefHash)).map(t=>t.transactionId);
  // Count accepted acquisitions, including an unselected duplicate purchase.
  // Choosing a cheaper order does not make other incurred spend disappear.
  const observedAcquisitionTotalMinor = [...knownPurchases.values()].reduce((n,t)=>n+BigInt(t.totalAmountMinor),0n).toString();
  const orderResources = [...new Set(eligible.map(t=>t.orderRefHash))].map((hash,i)=>({hash,resourceId:`purchased_order_${i}`,resourceType:'ACCEPTED_BUYER_ORDER',capacityUnits:1}));
  const candidates = references.flatMap((ref,i)=>{
    const order=eligible.find(t=>t.transactionId===ref.transactionId);if(!order)return[];
    const resource=orderResources.find(r=>r.hash===order.orderRefHash);
    return [{...ref,order,actionId:`bind_purchase_${i}`,resourceId:resource.resourceId}];
  });
  const planning = planWorldStateResources({
    targetPredicates:demands.map(d=>({predicateId:`bound.${d.id}`,valueType:'boolean',value:true})),
    resources:orderResources.map(({hash,...r})=>r),
    actions:candidates.map(c=>({actionId:c.actionId,capability:'ALLOCATE_EXISTING_BUYER_ORDER',durationMs:1,
      costMinor:c.order.totalAmountMinor,resourceClaims:[{resourceId:c.resourceId,units:1}],
      // Selection is not reusable: the same physical purchase cannot satisfy
      // two separately requested units merely because their descriptions match.
      preconditions:[{predicateId:`unused.${c.resourceId}`,valueType:'boolean',value:true}],
      effects:[{predicateId:`bound.${c.requirementId}`,valueType:'boolean',value:true},
        {predicateId:`unused.${c.resourceId}`,valueType:'boolean',value:false}]})),
    initialState:orderResources.map(r=>({predicateId:`unused.${r.resourceId}`,valueType:'boolean',value:true})),
    budget:{currency,maximumAmountMinor:maximumTotalMinor},deadlineMs:1000,
    searchLimits:{maxActionsPerPlan:demands.length,maxPlans:1}});
  const selected = (planning.plans[0]?.actionIds??[]).map(id=>candidates.find(c=>c.actionId===id));
  const missingRequirements=demands.filter(d=>!selected.some(c=>c.requirementId===d.id)).map(d=>d.id);
  const overBudget=BigInt(observedAcquisitionTotalMinor)>BigInt(maximumTotalMinor);
  const ready=!overBudget && !missingRequirements.length && !unresolvedAcquisitions.length;
  return {schema:'outsider/accepted-retail-order-network/v1',state:ready?'ACCEPTED_ORDERS_ASSEMBLED':overBudget?'ACQUISITION_BUDGET_EXCEEDED':unresolvedAcquisitions.length?'ACQUISITION_TOTAL_UNRESOLVED':'ACCEPTED_ORDERS_INCOMPLETE',
    transactions,planning,missingRequirements,unresolvedAcquisitions,observedAcquisitionTotalMinor,currency,maximumTotalMinor,
    bindings:ready?selected.map(c=>({requirementId:c.requirementId,transactionId:c.transactionId,orderRefHash:c.order.orderRefHash})):[],
    selectedOrders:ready?selected.map(c=>c.order):[],graphHash:digest(graph),
    newPurchasePerformed:false,independentRecoveryReserved:false,physicalDeliveryProven:false,resultPromiseIssued:false};
}
