/* Merchant-authored services and standing booking terms. A minimum quote is
 * not a sellable price, and a calendar alone is not a service catalog. */
import {publicDatasetHash} from './outsider-public-dataset.js';
const fail=code=>{throw Object.assign(new Error(`SUPPLY_${code}`),{code:`SUPPLY_${code}`});};
export const MERCHANT_RESERVATION_TERMS_VERSION='merchant-reservation-2026-09-17';
export const supplyTermsHash=value=>publicDatasetHash(value).slice(7);
const text=(v,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\0\r]/u.test(v))fail('SERVICE_CONFIGURATION_INVALID');return v.trim();};
const integer=(v,min,max)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail('SERVICE_CONFIGURATION_INVALID');return v;};
const list=v=>{if(!Array.isArray(v)||!v.length||v.length>32)fail('SERVICE_CONFIGURATION_INVALID');return [...new Set(v.map(s=>text(s)))];};
// This describes what this price buys, not which trade the merchant belongs
// to. An assessment price must survive every projection as assessment-only.
export function normalizeServicePricingCondition(value){
  if(!value||!['FIXED_SCOPE','ASSESSMENT_ONLY'].includes(value.kind)
    ||Object.keys(value).some(k=>!['kind','followOnEstimate','assessment'].includes(k)))fail('SERVICE_PRICING_CONDITION_INVALID');
  const estimate=value.followOnEstimate;
  if(estimate!==undefined){
    if(value.kind!=='ASSESSMENT_ONLY'||!estimate||Object.keys(estimate).some(k=>!['currency','minimumAmountMinor','maximumAmountMinor'].includes(k))
      ||!/^(USD|CAD|GBP|EUR|AUD)$/u.test(estimate.currency??'')
      ||!/^\d{1,12}$/u.test(estimate.minimumAmountMinor??'')
      ||estimate.maximumAmountMinor!==null&&!/^\d{1,12}$/u.test(estimate.maximumAmountMinor??'')
      ||estimate.maximumAmountMinor!==null&&BigInt(estimate.maximumAmountMinor)<BigInt(estimate.minimumAmountMinor))fail('SERVICE_FOLLOW_ON_ESTIMATE_INVALID');
  }
  let assessment;
  if(value.assessment!==undefined){
    if(value.kind!=='ASSESSMENT_ONLY'||!value.assessment||Object.keys(value.assessment).some(k=>!['scope','acceptance'].includes(k)))fail('SERVICE_ASSESSMENT_SCOPE_INVALID');
    assessment={scope:text(value.assessment.scope,4000),acceptance:list(value.assessment.acceptance)};
  }
  return {kind:value.kind,...(estimate?{followOnEstimate:{...estimate}}:{}),...(assessment?{assessment}:{})};
}
export function normalizeSupplierPaymentTerms(value){
  if(!value||Object.keys(value).some(k=>!['version','method','dueBusinessDays','startsAt','bankCalendarId'].includes(k))
    ||value.method!=='ACH'||value.startsAt!=='CUSTOMER_ACCEPTANCE')fail('SERVICE_PAYMENT_TERMS_INVALID');
  return {version:text(value.version),method:'ACH',dueBusinessDays:integer(value.dueBusinessDays,0,60),
    startsAt:'CUSTOMER_ACCEPTANCE',bankCalendarId:text(value.bankCalendarId)};
}
export function normalizeSupplyServiceConfiguration(input){
  if(input?.version!==1||input.accepted!==true||input.calendarCommitmentAccepted!==true)fail('SERVICE_TERMS_REQUIRED');
  if(input.termsVersion!==undefined&&!['provider-network-2026-09-15','provider-network-2026-09-16'].includes(input.termsVersion))fail('SERVICE_TERMS_REQUIRED');
  const timeZone=text(input.timeZone);try{new Intl.DateTimeFormat('en',{timeZone}).format();}catch{fail('SERVICE_TIMEZONE_INVALID');}
  const openingHours=input.openingHours?.map(row=>({day:integer(row.day,0,6),startMinute:integer(row.startMinute,0,1439),endMinute:integer(row.endMinute,1,1440)}));
  if(!openingHours?.length||openingHours.length>28||openingHours.some(r=>r.startMinute>=r.endMinute))fail('SERVICE_HOURS_REQUIRED');
  const services=input.services?.map(s=>{
    const id=text(s.id,100);if(!/^[a-zA-Z0-9_-]+$/u.test(id))fail('SERVICE_CONFIGURATION_INVALID');
    const price=s.priceRule;if(!['FIXED','PER_UNIT'].includes(price?.kind)||!/^\d{1,12}$/u.test(price.amountMinor??'')||!/^\d{1,12}$/u.test(price.baseAmountMinor??'0')||!/^(USD|CAD|GBP|EUR|AUD)$/u.test(price.currency??''))fail('SERVICE_PRICE_REQUIRED');
    const priceRule={kind:price.kind,currency:price.currency,amountMinor:String(price.amountMinor),baseAmountMinor:String(price.baseAmountMinor??'0'),
      unit:price.kind==='FIXED'?'service':text(price.unit),minimumUnits:price.kind==='FIXED'?1:integer(price.minimumUnits,1,1000),maximumUnits:price.kind==='FIXED'?1:integer(price.maximumUnits,1,1000),taxIncluded:price.taxIncluded===true};
    if(!priceRule.taxIncluded||priceRule.maximumUnits<priceRule.minimumUnits||BigInt(priceRule.amountMinor)+BigInt(priceRule.baseAmountMinor)<=0n)fail('SERVICE_TOTAL_PRICE_REQUIRED');
    if(s.durationBasis!==undefined&&!['FIXED','PER_UNIT'].includes(s.durationBasis))fail('SERVICE_CONFIGURATION_INVALID');
    const cancellationPolicy=s.cancellationPolicy?{freeBeforeHours:integer(s.cancellationPolicy.freeBeforeHours,0,720),latePercent:integer(s.cancellationPolicy.latePercent,0,100)}:null;
    const terms=Object.fromEntries(['cancellation','refund','paymentSchedule','scopeExclusions'].map(k=>[k,text(s.supplierTerms?.[k],4000)]));
    const customerAddressRequired=s.customerAddressRequired!==false,serviceLocation=customerAddressRequired?'':text(s.serviceLocation,2000);
    const pricingCondition=s.pricingCondition===undefined?null:normalizeServicePricingCondition(s.pricingCondition);
    if(pricingCondition?.followOnEstimate&&pricingCondition.followOnEstimate.currency!==priceRule.currency)fail('SERVICE_FOLLOW_ON_ESTIMATE_INVALID');
    return {id,name:text(s.name),...(s.category?{category:text(s.category)}:{}),description:text(s.description,4000),serviceAreas:list(s.serviceAreas),
      ...(pricingCondition?{pricingCondition}:{}),...(s.paymentTerms?{paymentTerms:normalizeSupplierPaymentTerms(s.paymentTerms)}:{}),
      ...(s.cancellationFeeBeforeStartMinor!==undefined?{cancellationFeeBeforeStartMinor:String(integer(Number(s.cancellationFeeBeforeStartMinor),0,999999999999))}:{}),
      customerAddressRequired,serviceLocation,
      ...(s.durationBasis?{durationBasis:s.durationBasis}:{}),...(cancellationPolicy?{cancellationPolicy}:{}),
      teamCalendarIds:list(s.teamCalendarIds),blockingCalendarIds:s.blockingCalendarIds?.length?list(s.blockingCalendarIds):[],
      durationMinutes:integer(s.durationMinutes,15,1440),bufferBeforeMinutes:integer(s.bufferBeforeMinutes??0,0,240),
      bufferAfterMinutes:integer(s.bufferAfterMinutes??0,0,240),travelMinutes:integer(s.travelMinutes??0,0,240),
      minimumNoticeMinutes:integer(s.minimumNoticeMinutes??0,0,525600),priceRule,supplierTerms:terms};
  });
  if(!services?.length||services.length>100||new Set(services.map(s=>s.id)).size!==services.length)fail('SERVICE_CONFIGURATION_INVALID');
  let reservationConsent=null;
  if(input.reservationConsent?.accepted===true){
    const r=input.reservationConsent;
    if(r.version!==MERCHANT_RESERVATION_TERMS_VERSION||r.durationHours!==24||r.feeMinor!=='0'
      ||r.cancellation!=='FREE_BEFORE_CUSTOMER_ACCEPTANCE'||r.conversion!=='CUSTOMER_ACCEPTS_WITHIN_RESERVATION')fail('RESERVATION_TERMS_REQUIRED');
    reservationConsent={version:r.version,accepted:true,durationHours:24,feeMinor:'0',cancellation:r.cancellation,conversion:r.conversion};
  }
  return {version:1,timeZone,openingHours,services,accepted:true,calendarCommitmentAccepted:true,
    termsVersion:input.termsVersion??'provider-network-2026-09-15',...(reservationConsent?{reservationConsent}:{})};
}
export function quoteSupplyService(service,units){
  const p=service.priceRule;if(!p)fail('SERVICE_PRICE_REQUIRED');
  const quantity=units??(p.kind==='FIXED'?1:null);
  if(!Number.isSafeInteger(quantity)||quantity<p.minimumUnits||quantity>p.maximumUnits)fail('SERVICE_QUANTITY_REQUIRED');
  return {amountMinor:String(BigInt(p.baseAmountMinor)+BigInt(p.amountMinor)*BigInt(quantity)),currency:p.currency,
    units:quantity,durationMinutes:service.durationMinutes*(service.durationBasis==='FIXED'?1:quantity),priceBasis:'MERCHANT_PRICE_RULE',supplierTerms:service.supplierTerms,
    ...(service.pricingCondition?{pricingCondition:normalizeServicePricingCondition(service.pricingCondition)}:{}),
    ...(service.paymentTerms?{paymentTerms:normalizeSupplierPaymentTerms(service.paymentTerms)}:{}),
    configurationHash:supplyTermsHash(service)};
}
// Reconstruct only an exact accepted quote, never infer item count from a
// fixed-duration window. Used by both initial booking and later repair.
export function supplyServiceUnitsForPlan(service,plan){
  const price=service.priceRule,net=BigInt(plan.totalAmountMinor)-BigInt(price.baseAmountMinor??'0'),rate=BigInt(price.amountMinor);
  const duration=Date.parse(plan.availableEnd)-Date.parse(plan.availableStart);
  let units;
  if(rate>0n&&net>=0n&&net%rate===0n)units=Number(net/rate);
  else if(rate===0n&&service.durationBasis!=='FIXED')units=duration/(service.durationMinutes*60000);
  else if(rate===0n&&price.minimumUnits===price.maximumUnits)units=price.minimumUnits;
  else fail('SERVICE_QUANTITY_NOT_BOUND');
  if(!Number.isSafeInteger(units)||units<price.minimumUnits||units>price.maximumUnits)fail('SERVICE_QUANTITY_CHANGED');
  const quote=quoteSupplyService(service,units);
  if(quote.amountMinor!==plan.totalAmountMinor||quote.currency!==plan.currency||quote.durationMinutes*60000!==duration)fail('SERVICE_QUANTITY_CHANGED');
  return units;
}
export function supplyResourceReady(resource){return !!resource.price&&/^\d+$/u.test(resource.price.amountMinor??'')
  &&resource.price.currency&&resource.durationMinutes>0&&!resource.bookingBlockers?.length&&!!resource.supplierTerms&&!!resource.serviceConfigurationHash
  &&['AUTOMATIC_ACCEPTANCE','AUTOMATIC','CALENDAR_COMMITMENT'].includes(resource.bookingMode);}
