/* Network demand preparation belongs to one original task attempt. Search and
 * private buyer-detail submission acquire quotes, never a booking or payment. */
import path from 'node:path';
import {existsSync,mkdirSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {managedNetworkAdapter,MANAGED_NETWORK_CAPABILITY} from './outsider-managed-network-fragment.js';
import {publicDatasetHash as digest} from './outsider-public-dataset.js';
import {readPrivateExecutionBytes,writePrivateExecutionRecordOnce as writeOnce} from './outsider-user-held-durable-execution-v2.js';

const read=file=>JSON.parse(readPrivateExecutionBytes(file));
const fail=code=>{throw Object.assign(new Error(code),{code});};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>plain(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const safeReason=error=>/^(DUFFEL|MANAGED_NETWORK)_[A-Z0-9_]+$/u.test(error?.code??error?.message??'')
  ?error.code??error.message:'MANAGED_NETWORK_PREPARATION_UNAVAILABLE';

export function createManagedNetworkPreparation({directory,nodeDirectory,request,graph,networkRequests=[]},dependencies={}){
  if(!path.isAbsolute(directory??'')||!path.isAbsolute(nodeDirectory??'')||!Array.isArray(networkRequests))fail('MANAGED_NETWORK_PREPARATION_INPUT_INVALID');
  const clock=dependencies.clock??(()=>new Date().toISOString()),bindingHash=digest({request,graph,networkRequests});
  const adapter=()=>managedNetworkAdapter(nodeDirectory,dependencies);
  const demands=networkRequests.map(row=>{
    const need=graph.requirements.find(need=>need.id===row.requirementId);
    if(!need||need.capability!==MANAGED_NETWORK_CAPABILITY||row.networkId!=='duffel'
      ||!plain(row.search)||!/^\d+$/u.test(row.search.maximumAmountMinor??'')
      ||row.search.currency!=='USD'||request.budget?.currency!=='USD'
      ||BigInt(row.search.maximumAmountMinor)>BigInt(request.budget.maximumAmountMinor)
      ||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(row.requirementId))fail('MANAGED_NETWORK_DEMAND_BINDING_INVALID');
    return {...row,scope:need.outcome};
  });
  if(new Set(demands.map(row=>row.requirementId)).size!==demands.length)fail('MANAGED_NETWORK_DEMAND_BINDING_INVALID');
  const records=id=>{
    const root=path.join(directory,id);
    return existsSync(root)?readdirSync(root).filter(name=>/^\d{6}-[a-f0-9-]+\.json$/u.test(name)).sort().map(name=>read(path.join(root,name))):[];
  };
  const latest=id=>{
    const rows=records(id),last=rows.at(-1);
    if(rows.some((row,index)=>row.bindingHash!==bindingHash||row.requirementId!==id||row.revision!==index+1))fail('MANAGED_NETWORK_PREPARATION_HISTORY_CHANGED');
    return last??null;
  };
  const save=(id,value)=>{
    const previous=latest(id),root=path.join(directory,id);mkdirSync(root,{recursive:true,mode:0o700});
    const revision=(previous?.revision??0)+1;
    const row={schema:'outsider/order-network-preparation/v1',...value,bindingHash,requirementId:id,revision,updatedAt:clock()};
    writeOnce(path.join(root,`${String(revision).padStart(6,'0')}-${randomUUID()}.json`),row);return row;
  };
  const demand=id=>demands.find(row=>row.requirementId===id)??fail('MANAGED_NETWORK_REQUIREMENT_NOT_FOUND');
  const assertOpen=()=>{if(Date.parse(request.completionDeadline)<=Date.parse(clock()))fail('MANAGED_NETWORK_PREPARATION_DEADLINE_PASSED');};
  function inspect(){
    return {schema:'outsider/order-network-preparation-view/v1',requirements:demands.map(need=>{
      const row=latest(need.requirementId),base={requirementId:need.requirementId,networkId:need.networkId,scope:need.scope,
        search:need.search,searchPolicy:need.searchPolicy??{defaultedFields:[]},state:row?.state??'NOT_SEARCHED',offers:[],
        searchHash:row?.searchHash??null,preparedPlanHash:row?.networkPlanHash??null,reason:row?.reason??null};
      if(!row?.searchHash)return base;
      try{
        const result=adapter().readSearch(row.searchHash);
        if(result.searchHash!==row.searchHash||digest(result.request)!==digest(need.search))fail('MANAGED_NETWORK_SEARCH_BINDING_CHANGED');
        const status=adapter().status();
        if(!status.configured||status.connectionHash!==result.connectionHash)fail('MANAGED_NETWORK_CONNECTION_CHANGED');
        if(row.networkPlanHash){
          const plan=adapter().readPlan(row.networkPlanHash);
          if(plan.connectionHash!==status.connectionHash)fail('MANAGED_NETWORK_CONNECTION_CHANGED');
          if(Date.parse(plan.expiresAt)<=Date.parse(clock()))return {...base,state:'QUOTE_EXPIRED',preparedPlanHash:null,reason:'MANAGED_NETWORK_QUOTE_EXPIRED'};
        }
        return {...base,environment:result.environment,accountLabel:result.accountLabel,
          offers:result.offers,comparisonScope:result.comparisonScope,paginationComplete:result.paginationComplete,
          observedOfferCount:result.observedOfferCount,offersTruncated:result.offersTruncated,
          estimatedPriceOnly:true,finalPriceConfirmed:false,selectedOfferHash:row.offerHash??null};
      }catch(error){return {...base,state:'CONNECTION_UNAVAILABLE',reason:safeReason(error),preparedPlanHash:null};}
    }),bookingCreated:false,paymentPerformed:false};
  }
  async function search(id){
    assertOpen();const need=demand(id);
    try{
      const native=adapter(),status=native.status();
      if(!status.configured)return save(id,{state:'NOT_CONFIGURED',reason:status.reason??'DUFFEL_NOT_CONFIGURED'});
      const result=await native.search(need.search);
      if(result.networkId!==need.networkId||digest(result.request)!==digest(need.search)||!Array.isArray(result.offers))fail('MANAGED_NETWORK_SEARCH_BINDING_CHANGED');
      return save(id,{state:result.offers.length?'OFFERS_READY':'NO_OFFERS',searchHash:result.searchHash,reason:result.reason??null});
    }catch(error){return save(id,{state:'SEARCH_FAILED',reason:safeReason(error)});}
  }
  async function operate(command){
    if(command?.action==='SEARCH'&&exact(command,['action','requirementId'])){await search(command.requirementId);return inspect();}
    if(command?.action!=='PREPARE_OFFER'||!exact(command,['action','requirementId','searchHash','offerHash','passengers']))fail('MANAGED_NETWORK_PREPARATION_COMMAND_INVALID');
    assertOpen();const need=demand(command.requirementId),row=latest(need.requirementId);
    if(!row?.searchHash||row.searchHash!==command.searchHash)fail('MANAGED_NETWORK_SEARCH_SELECTION_CHANGED');
    const native=adapter(),result=native.readSearch(command.searchHash);
    if(digest(result.request)!==digest(need.search)||!result.offers.some(offer=>offer.offerHash===command.offerHash))fail('MANAGED_NETWORK_SEARCH_SELECTION_CHANGED');
    const plan=await native.prepareSelected({searchHash:command.searchHash,offerHash:command.offerHash,passengers:command.passengers});
    if(plan.networkId!=='duffel'||plan.searchHash!==command.searchHash||plan.offerHash!==command.offerHash
      ||plan.currency!==need.search.currency||!/^[1-9]\d*$/u.test(plan.totalAmountMinor??'')
      ||BigInt(plan.totalAmountMinor)>BigInt(need.search.maximumAmountMinor)
      ||BigInt(plan.totalAmountMinor)>BigInt(request.budget.maximumAmountMinor))fail('MANAGED_NETWORK_PREPARED_QUOTE_OUTSIDE_REQUEST');
    const current=latest(need.requirementId);
    if(current?.revision!==row.revision||current.searchHash!==command.searchHash)fail('MANAGED_NETWORK_SEARCH_SELECTION_CHANGED');
    save(need.requirementId,{state:'PREPARED',searchHash:command.searchHash,offerHash:command.offerHash,networkPlanHash:plan.planHash});
    return inspect();
  }
  const selectedBindings=()=>inspect().requirements.filter(row=>row.state==='PREPARED'&&row.preparedPlanHash)
    .map(row=>({requirementId:row.requirementId,networkId:row.networkId,networkPlanHash:row.preparedPlanHash}));
  return {inspect,operate,selectedBindings,async prepare(){
    for(const need of demands)if(!latest(need.requirementId))await search(need.requirementId);
    return inspect();
  }};
}
export async function prepareManagedNetworkDemands(options,dependencies={}){
  return createManagedNetworkPreparation(options,dependencies).prepare();
}

// A2A and customer projections use the prepared public contract, never a
// caller-provided traveler form or native account configuration.
export function publicManagedNetworkPreparation(value,{canPrepare=false}={}){
  if(value?.schema!=='outsider/order-network-preparation-view/v1')return null;
  const list=value=>Array.isArray(value)?value:[];
  const scalars=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]===null||['string','number','boolean'].includes(typeof value?.[key]))
    .map(key=>[key,value[key]]));
  return {schema:value.schema,canPrepare:value.canPrepare===true&&canPrepare,bookingCreated:false,paymentPerformed:false,
    ...(typeof value.planIssue==='string'&&/^[A-Z_]+$/u.test(value.planIssue)?{planIssue:value.planIssue}:{}),
    requirements:list(value.requirements).map(row=>({
      ...scalars(row,['requirementId','networkId','scope','state','searchHash','preparedPlanHash','reason','environment','accountLabel',
        'comparisonScope','paginationComplete','observedOfferCount','offersTruncated','estimatedPriceOnly','finalPriceConfirmed','selectedOfferHash']),
      search:{...scalars(row.search,['cabinClass','maximumConnections','maximumAmountMinor','currency']),
        slices:list(row.search?.slices).map(slice=>scalars(slice,['origin','destination','departureDate'])),
        passengers:list(row.search?.passengers).map(passenger=>scalars(passenger,['type']))},
      searchPolicy:{defaultedFields:list(row.searchPolicy?.defaultedFields).filter(key=>['cabinClass','maximumConnections'].includes(key))},
      offers:list(row.offers).map(offer=>({...scalars(offer,['offerId','offerHash','summary','estimatedTotalAmountMinor','currency','expiresAt','cabinClass','identityDocumentsRequired']),
        passengerIds:list(offer.passengerIds).filter(id=>typeof id==='string'&&/^pas_[A-Za-z0-9_-]{1,180}$/u.test(id)),
        itinerary:list(offer.itinerary).map(slice=>({...scalars(slice,['origin','destination']),
          segments:list(slice.segments).map(segment=>scalars(segment,['origin','destination','departingAt','arrivingAt','originTimeZone','destinationTimeZone',
            'operatingCarrier','operatingFlightNumber','marketingCarrier','marketingFlightNumber']))})),
        conditions:Object.fromEntries(['refund_before_departure','change_before_departure'].map(key=>[key,plain(offer.conditions?.[key])?
          scalars(offer.conditions[key],['allowed','penaltyAmountMinor','penaltyCurrency']):null]))}))}))};
}
