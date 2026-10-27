/* Read-only progress from the current original-order preparation. A candidate
 * or configured execution path is never a held resource or execution consent. */
import {publicDatasetHash as digest} from './outsider-public-dataset.js';
const list=value=>Array.isArray(value)?value:[];
const url=value=>{try{const parsed=new URL(value);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?parsed.href:null;}catch{return null;}};
const text=(value,maximum=500)=>typeof value==='string'&&value.trim()?value.slice(0,maximum):null;

export function projectOpenOutcomePreparationContinuation({request,goalContract,resolved,sources,sourceMatches,
  businessResources,networkResources,digitalRuntime,digitalConnections=[],issues=[],observedAt,publicSourceEvidence}){
  const graph=resolved.graphInput.graph;
  const requirements=graph.requirements.map(need=>{
    const operation=resolved.graphInput.operationInputs[need.id],match=sourceMatches.find(row=>row.requirementId===need.id);
    const cards=list(sources.cards).filter(card=>card.status===200&&url(card.url)&&text(card.sourceHash)
      &&(list(card.requirementIds).includes(need.id)||list(match?.sources).some(row=>row.url===card.url&&row.sourceHash===card.sourceHash)));
    const seen=new Set(),sourceRows=cards.filter(card=>!seen.has(card.url)&&seen.add(card.url)).slice(0,4)
      .map(card=>({url:url(card.url),sourceHash:card.sourceHash,...(text(card.title)?{title:text(card.title)}:{})}));
    const candidates=sourceRows.map(row=>({name:row.title??new URL(row.url).hostname,sourceUrl:row.url,
      sourceHash:row.sourceHash,state:'PUBLIC_SOURCE_OBSERVED',capacityReserved:false,quoteEstablished:false}));
    const network=list(networkResources?.requirements).find(row=>row.requirementId===need.id);
    for(const offer of list(network?.offers).slice(0,5))candidates.push({name:text(offer.summary)??'Observed network offer',
      ...(text(offer.offerHash)?{sourceHash:offer.offerHash}:{}),state:'OBSERVED_NETWORK_OFFER',
      ...(/^[0-9]+$/u.test(offer.estimatedTotalAmountMinor??'')&&/^[A-Z]{3}$/u.test(offer.currency??'')
        ?{estimatedTotalAmountMinor:offer.estimatedTotalAmountMinor,currency:offer.currency}:{}),
      ...(text(offer.expiresAt)?{expiresAt:offer.expiresAt}:{}),...(text(network.environment)?{environment:network.environment}:{}),
      capacityReserved:false,estimatedPriceOnly:true,finalPriceConfirmed:false});
    const business=list(businessResources?.demands).find(row=>row.requirementId===need.id);
    for(const prepared of list(business?.preparations).slice(0,3)){
      const sourceUrl=url(prepared.sourceUrl);
      candidates.push({name:text(prepared.operatorDisplayName)??'Observed resource preparation',
        ...(sourceUrl?{sourceUrl}:{}),state:'SELLER_PREPARATION_OBSERVED',capacityReserved:false,
        ...(prepared.price&&typeof prepared.price.total==='number'&&Number.isFinite(prepared.price.total)
          &&/^[A-Z]{3}$/u.test(prepared.price.currency??'')?{price:{amount:String(prepared.price.total),currency:prepared.price.currency}}:{})});
    }
    const digital=need.capability==='GENERAL_DIGITAL_AGENT_TASK_V1'&&operation&&digitalRuntime?.available===true
      &&list(operation.connectionIds).every(id=>digitalConnections.some(row=>row.id===id));
    const executionPath=digital?{kind:'EXISTING_GENERAL_DIGITAL_EXECUTOR',available:true,
      ...(text(digitalRuntime.provider)?{provider:digitalRuntime.provider}:{}),
      ...(text(digitalRuntime.model)?{model:digitalRuntime.model}:{}),
      confirmationRequired:true,capacityReserved:false}:null;
    return {requirementId:need.id,scope:need.outcome,capability:need.capability,dependsOn:[...need.dependsOn],
      planningState:digital?'EXECUTOR_INPUT_READY':network?'NATIVE_SEARCH_PREPARED':candidates.length?'SOURCES_OBSERVED':'RESOURCE_PREPARATION_UNRESOLVED',
      executionState:need.dependsOn.length?'AWAITING_ORDER_CONFIRMATION_AND_DEPENDENCIES':'AWAITING_ORDER_CONFIRMATION',
      ...(executionPath?{executionPath}:{}),...(network?{nativeSearchState:network.state}:{}),sources:sourceRows,candidates};
  });
  const body={schema:'outsider/open-outcome-preparation-continuation/v1',state:'PREPARATION_READY_WITH_QUESTIONS',
    requestHash:digest(request),contractHash:goalContract?.contractHash??null,graphHash:digest(graph),
    questions:[...graph.missingFacts],observedAt,requirements,issues,
    ...(publicSourceEvidence ? { publicSourceEvidence } : {}),
    capacityReserved:false,executionStarted:false,paymentPerformed:false,requiresOriginalOrderConfirmation:true};
  return {...body,preparationHash:digest(body)};
}
