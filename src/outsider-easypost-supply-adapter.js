/* EasyPost bulk carrier rating and owned-shipment tracking. Official v2
 * https://docs.easypost.com/docs/authentication
 * https://docs.easypost.com/docs/shipments
 * https://docs.easypost.com/docs/shipments/rates
 * This slice acquires account-backed shipping rates, not a shipping label or
 * carrier collection. Label purchase must join the original funded task before
 * it is exposed; rate discovery never claims a completed shipment. */
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,lstatSync} from 'node:fs';
import {publicDatasetHash as digest} from './outsider-public-dataset.js';
import {readPrivateExecutionBytes,writePrivateExecutionRecordOnce as writeOnce,withUserHeldExecutionLockV2 as locked} from './outsider-user-held-durable-execution-v2.js';
export const EASYPOST_QUOTE_SCHEMA='outsider/easypost-carrier-quotes/v1';
const API='https://api.easypost.com/v2',MAX_BYTES=512*1024;
const fail=code=>{throw Object.assign(new Error('EASYPOST_'+code),{code:'EASYPOST_'+code});};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys,required=keys)=>{if(!plain(v)||Object.keys(v).some(k=>!keys.includes(k))||required.some(k=>!Object.hasOwn(v,k)))fail('INPUT_INVALID');};
const text=(v,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\0-\x1f\x7f]/u.test(v))fail('INPUT_INVALID');return v;};
const label=v=>typeof v==='string'?v.replace(/[\0-\x1f\x7f]/gu,' ').slice(0,200):null;
const id=(v,prefix)=>{if(typeof v!=='string'||!new RegExp('^'+prefix+'_[A-Za-z0-9]{1,100}$').test(v))fail('IDENTIFIER_INVALID');return v;};
const hash=v=>{if(!/^sha256:[a-f0-9]{64}$/u.test(v??''))fail('HASH_INVALID');return v;};
const read=file=>JSON.parse(readPrivateExecutionBytes(file));
const money=v=>{if(typeof v!=='string'||!/^(0|[1-9]\d{0,12})(?:\.\d{1,2})?$/u.test(v))fail('PRICE_INVALID');const [a,b='']=v.split('.');return String(BigInt(a)*100n+BigInt(b.padEnd(2,'0')));};
function address(v){
  const keys=['name','street1','street2','city','state','zip','country','phone','email'];
  exact(v,keys,['name','street1','city','state','zip','country']);
  const out=Object.fromEntries(Object.keys(v).map(k=>[k,text(v[k],k==='email'?254:200)]));
  if(out.country!=='US'||!/^[A-Z]{2}$/u.test(out.state)||!/^\d{5}(?:-\d{4})?$/u.test(out.zip)
    ||out.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(out.email))fail('ADDRESS_INVALID');
  return out;
}
function normalize(v){
  exact(v,['fromAddress','toAddress','parcel','maximumAmountMinor','currency','carrierAccountIds'],['fromAddress','toAddress','parcel','maximumAmountMinor','currency']);
  if(v.currency!=='USD'||!/^[1-9]\d{0,12}$/u.test(v.maximumAmountMinor??''))fail('BUDGET_INVALID');
  exact(v.parcel,['length','width','height','weight']);
  if(Object.values(v.parcel).some(n=>typeof n!=='number'||!Number.isFinite(n)||n<=0||n>100000))fail('PARCEL_INVALID');
  if(v.carrierAccountIds!==undefined&&(!Array.isArray(v.carrierAccountIds)||v.carrierAccountIds.length>100||!v.carrierAccountIds.length
    ||new Set(v.carrierAccountIds).size!==v.carrierAccountIds.length))fail('CARRIER_SELECTION_INVALID');
  return {fromAddress:address(v.fromAddress),toAddress:address(v.toAddress),parcel:v.parcel,maximumAmountMinor:v.maximumAmountMinor,currency:'USD',
    ...(v.carrierAccountIds?{carrierAccountIds:v.carrierAccountIds.map(v=>id(v,'ca'))}:{})};
}
export function createEasyPostSupplyAdapter({nodeDirectory,fetchImpl=globalThis.fetch,clock=()=>new Date().toISOString()}={}){
  if(!path.isAbsolute(nodeDirectory??''))fail('DIRECTORY_INVALID');
  const configFile=path.join(nodeDirectory,'connections','easypost.json'),root=path.join(nodeDirectory,'easypost-quotes');
  const now=()=>{const value=clock();if(!Number.isFinite(Date.parse(value)))fail('CLOCK_INVALID');return new Date(value).toISOString();};
  function config(){
    if(!existsSync(configFile))fail('NOT_CONFIGURED');const v=read(configFile);
    if(v.schema!=='outsider/easypost-connection/v1'||!['test','production'].includes(v.environment)||!path.isAbsolute(v.apiKeyFile??''))fail('CONFIG_INVALID');
    if(!lstatSync(v.apiKeyFile).isFile()||lstatSync(v.apiKeyFile).isSymbolicLink())fail('KEY_FILE_INVALID');
    const key=readPrivateExecutionBytes(v.apiKeyFile).toString('utf8').trim();if(!/^[A-Za-z0-9_-]{20,300}$/u.test(key))fail('KEY_INVALID');
    const connectionHash=digest({key,environment:v.environment,accountLabel:v.accountLabel??null,billingPolicy:v.billingPolicy??null});
    return {key,environment:v.environment,accountLabel:label(v.accountLabel),connectionHash,billingPolicy:v.billingPolicy??null};
  }
  const authorize=c=>{if(c.environment==='production'&&(c.billingPolicy?.quoteRequestsAuthorized!==true
    ||c.billingPolicy?.customerChargePolicy!=='PLATFORM_ABSORBS_NETWORK_FEES'))fail('OPERATOR_QUOTE_FEE_POLICY_REQUIRED');};
  async function request(c,route,method='GET',body){
    if(config().connectionHash!==c.connectionHash)fail('CONNECTION_CHANGED');
    const response=await fetchImpl(API+route,{method,headers:{authorization:'Basic '+Buffer.from(c.key+':').toString('base64'),accept:'application/json',
      ...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok)fail(response.status===401||response.status===403?'AUTHENTICATION_FAILED':'PROVIDER_REQUEST_FAILED');
    const reader=response.body?.getReader();if(!reader)fail('RESPONSE_INVALID');const chunks=[];let count=0;
    while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>MAX_BYTES){await reader.cancel();fail('RESPONSE_TOO_LARGE');}chunks.push(value);}
    let result;try{result=JSON.parse(Buffer.concat(chunks));}catch{fail('RESPONSE_INVALID');}
    if(config().connectionHash!==c.connectionHash)fail('CONNECTION_CHANGED');return result;
  }
  function shipment(c,v,input,expectedId){
    if(!plain(v)||v.object!=='Shipment'||v.mode!==c.environment||expectedId&&v.id!==expectedId)fail('SHIPMENT_BINDING_CHANGED');
    id(v.id,'shp');
    // EasyPost may standardize display spelling; stable address object IDs and
    // exact private initial response are bound below rather than guessed aliases.
    if(!v.from_address||!v.to_address||!v.parcel||v.from_address.country!=='US'||v.to_address.country!=='US')fail('SHIPMENT_RESPONSE_INVALID');
    id(v.from_address.id,'adr');id(v.to_address.id,'adr');id(v.parcel.id,'prcl');
    if(Object.entries(input.parcel).some(([key,value])=>v.parcel[key]!==value))fail('PARCEL_BINDING_CHANGED');
    for(const [sent,actual] of [[input.fromAddress,v.from_address],[input.toAddress,v.to_address]]){
      const norm=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/gu,' ').toUpperCase();
      if(['name','street1','street2','city','state','zip','country'].some(k=>norm(sent[k])!==norm(actual[k])))fail('ADDRESS_BINDING_CHANGED');
    }
    return v;
  }
  function rates(c,v,input){
    if(!Array.isArray(v.rates)||v.rates.length>1000)fail('RATES_INVALID');
    let rejected=0;const result=[],seen=new Set();
    for(const rate of v.rates){try{
      id(rate.id,'rate');id(rate.carrier_account_id,'ca');
      if(seen.has(rate.id))fail('DUPLICATE_RATE');seen.add(rate.id);
      if(rate.shipment_id!==v.id||rate.mode!==c.environment||rate.currency!=='USD'||!['easypost','carrier'].includes(rate.billing_type)
        ||input.carrierAccountIds&&!input.carrierAccountIds.includes(rate.carrier_account_id))fail('RATE_BINDING_CHANGED');
      const amountMinor=money(rate.rate);if(BigInt(amountMinor)>BigInt(input.maximumAmountMinor))fail('RATE_ABOVE_BUDGET');
      const row={rateId:rate.id,carrierAccountId:rate.carrier_account_id,carrier:text(rate.carrier,100),service:text(rate.service,100),amountMinor,currency:'USD',
        billingType:rate.billing_type,deliveryDays:Number.isSafeInteger(rate.delivery_days)&&rate.delivery_days>=0?rate.delivery_days:null,
        deliveryDate:label(rate.delivery_date),deliveryDateGuaranteed:rate.delivery_date_guaranteed===true};
      result.push({...row,rateHash:digest({connectionHash:c.connectionHash,shipmentId:v.id,...row})});
    }catch(error){if(error.code==='EASYPOST_DUPLICATE_RATE')throw error;rejected++;}}
    result.sort((a,b)=>BigInt(a.amountMinor)<BigInt(b.amountMinor)?-1:BigInt(a.amountMinor)>BigInt(b.amountMinor)?1:a.rateId.localeCompare(b.rateId));
    return {rates:result,observedRateCount:v.rates.length,rejectedRateCount:rejected};
  }
  function persist(c,input,value,previousQuoteHash=null){
    if(value.postage_label||value.selected_rate||value.tracking_code)fail('SHIPMENT_ALREADY_PURCHASED');
    const result=rates(c,value,input),body={schema:EASYPOST_QUOTE_SCHEMA,connectionHash:c.connectionHash,environment:c.environment,accountLabel:c.accountLabel,
      request:input,shipmentId:value.id,addressIds:[value.from_address.id,value.to_address.id],parcelId:value.parcel.id,...result,
      quotedAt:now(),refreshAfter:new Date(Date.parse(now())+15*60000).toISOString(),previousQuoteHash,nonce:randomBytes(32).toString('hex')};
    const quoteHash=digest(body);mkdirSync(root,{recursive:true,mode:0o700});writeOnce(path.join(root,quoteHash.slice(7)+'.json'),body);return publicQuote(body,quoteHash);
  }
  const publicQuote=(body,quoteHash)=>({schema:EASYPOST_QUOTE_SCHEMA,networkId:'easypost',quoteHash,shipmentId:body.shipmentId,environment:body.environment,
    accountLabel:body.accountLabel,quotedAt:body.quotedAt,refreshAfter:body.refreshAfter,previousQuoteHash:body.previousQuoteHash,
    route:{from:{city:body.request.fromAddress.city,state:body.request.fromAddress.state,country:'US'},to:{city:body.request.toAddress.city,state:body.request.toAddress.state,country:'US'}},
    parcel:body.request.parcel,units:{dimensions:'inch',weight:'ounce'},rates:body.rates,observedRateCount:body.observedRateCount,rejectedRateCount:body.rejectedRateCount,
    comparisonScope:'ACCOUNT_RETURNED_CARRIER_RATES',allCarriersAvailable:false,amountIsShippingRateOnly:true,priceLocked:false,
    operatorApiFeesKnown:false,carrierAdjustmentsPossible:true,paymentPerformed:false,labelPurchased:false,pickupScheduled:false,physicalDeliveryCompleted:false,
    purchaseEnabled:false,purchaseUnavailableReason:'ORIGINAL_TASK_LABEL_PURCHASE_INTEGRATION_REQUIRED'});
  function load(quoteHash){hash(quoteHash);const body=read(path.join(root,quoteHash.slice(7)+'.json'));
    if(body.schema!==EASYPOST_QUOTE_SCHEMA||digest(body)!==quoteHash)fail('QUOTE_CHANGED');return body;}
  function owned(quoteHash){const body=load(quoteHash),c=config();if(c.connectionHash!==body.connectionHash)fail('CONNECTION_CHANGED');return {body,c};}
  function checkedOwnedShipment(body,c,value){
    shipment(c,value,body.request,body.shipmentId);
    if(digest([value.from_address.id,value.to_address.id])!==digest(body.addressIds)||value.parcel.id!==body.parcelId)fail('SHIPMENT_BINDING_CHANGED');return value;
  }
  return Object.freeze({status(){try{const c=config();let enabled=true,reason=null;try{authorize(c);}catch(e){enabled=false;reason=e.code;}
    return {provider:'easypost',configured:true,preparationEnabled:enabled,environment:c.environment,accountLabel:c.accountLabel,connectionHash:c.connectionHash,
      authenticatedAccessVerified:false,quoteImplemented:true,trackingImplemented:true,labelPurchaseEnabled:false,reason};
    }catch(e){return {provider:'easypost',configured:false,preparationEnabled:false,authenticatedAccessVerified:false,quoteImplemented:true,trackingImplemented:true,labelPurchaseEnabled:false,
      reason:/^EASYPOST_[A-Z_]+$/u.test(e.code??'')?e.code:'EASYPOST_CONFIG_INVALID'};}},
    async quote(value){const input=normalize(value),c=config();authorize(c);
      const result=await request(c,'/shipments','POST',{shipment:{reference:'outsider-'+randomBytes(16).toString('hex'),from_address:input.fromAddress,to_address:input.toAddress,parcel:input.parcel,
        ...(input.carrierAccountIds?{carrier_accounts:input.carrierAccountIds}:{})}});
      return persist(c,input,shipment(c,result,input));},
    readQuote(quoteHash){const {body}=owned(quoteHash);return publicQuote(body,quoteHash);},
    async refresh({quoteHash}){const {body,c}=owned(quoteHash);authorize(c);
      return locked(digest({root,shipmentId:body.shipmentId}),async()=>{
        const current=checkedOwnedShipment(body,c,await request(c,'/shipments/'+body.shipmentId));
        if(current.postage_label||current.selected_rate)fail('SHIPMENT_ALREADY_PURCHASED');
        const result=checkedOwnedShipment(body,c,await request(c,'/shipments/'+body.shipmentId+'/rerate','POST',{}));
        return persist(c,body.request,result,quoteHash);});},
    async track({quoteHash}){const {body,c}=owned(quoteHash),value=checkedOwnedShipment(body,c,await request(c,'/shipments/'+body.shipmentId));
      const tracking=value.tracker;let url=null;
      try{const v=new URL(tracking?.public_url);if(v.protocol==='https:'&&!v.username&&!v.password)url=v.href;}catch{}
      return {networkId:'easypost',quoteHash,shipmentId:body.shipmentId,environment:c.environment,observedAt:now(),
        labelPresent:!!value.postage_label,trackingCode:label(value.tracking_code),trackingStatus:label(tracking?.status??value.status),trackingUrl:url,
        refundStatus:label(value.refund_status),providerReported:true,carrierReportsDelivered:tracking?.status==='delivered',
        independentOfSeller:false,physicalDeliveryCompleted:false,paymentPerformedByThisOperation:false,pickupScheduledByThisOperation:false};}
  });
}
