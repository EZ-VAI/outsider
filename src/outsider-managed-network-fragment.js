/* A purchased network booking is one transaction in the original outcome DAG.
 * Provider confirmation proves a booking, not the subsequent physical service.
 * Customer order charges and operator network fees have separate authority. */
import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { createDuffelOrderAdapter } from './outsider-duffel-order-adapter.js';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from './outsider-user-held-durable-execution-v2.js';

export const MANAGED_NETWORK_CAPABILITY = 'MANAGED_NETWORK_BOOKING_V1';
export const MANAGED_NETWORK_CATEGORY = 'MANAGED_NETWORK_TRANSACTION';
export const MANAGED_NETWORK_CONTRACT = 'EXACT_AUTHORIZED_NETWORK_ORDER_AND_PROVIDER_BOOKING_CONFIRMATION_V1';
export const MANAGED_NETWORK_INPUT_SCHEMA = { type:'object', additionalProperties:false,
  required:['networkId','planHash'], properties:{networkId:{const:'duffel'},planHash:{type:'string',pattern:'^sha256:[a-f0-9]{64}$'}} };
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw Object.assign(new Error(code), {code}); };
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function normalizeManagedNetworkInput(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'networkId,planHash' || value.networkId !== 'duffel'
    || !/^sha256:[a-f0-9]{64}$/u.test(value.planHash ?? '')) fail('MANAGED_NETWORK_INPUT_INVALID');
  return {networkId:value.networkId,planHash:value.planHash};
}
export function managedNetworkAdapter(nodeDirectory, dependencies={}) {
  return (dependencies.createManagedNetworkAdapter ?? createDuffelOrderAdapter)({nodeDirectory,
    ...(dependencies.clock?{clock:dependencies.clock}:{}),
    ...(dependencies.managedNetworkFetch?{fetchImpl:dependencies.managedNetworkFetch}:{})});
}
export async function prepareManagedNetworkPart({id,input,nodeDirectory},dependencies={}) {
  input=normalizeManagedNetworkInput(input);
  const purchase=managedNetworkAdapter(nodeDirectory,dependencies).readPlan(input.planHash);
  const auth=purchase.authorization,now=dependencies.clock?.()??new Date().toISOString();
  if(purchase.planHash!==input.planHash || !/^sha256:[a-f0-9]{64}$/u.test(purchase.quoteHash??'')
    ||!instant(purchase.expiresAt)||Date.parse(purchase.expiresAt)<=Date.parse(now)
    ||!['test','production'].includes(purchase.environment)||purchase.currency!=='USD'
    ||!/^[1-9]\d{0,30}$/u.test(purchase.totalAmountMinor??'')
    ||auth?.schema!=='outsider/funded-network-payment-authorization/v1'||auth.planHash!==purchase.planHash||auth.maximumAmountMinor!==purchase.totalAmountMinor
    ||auth.currency!==purchase.currency||auth.environment!==purchase.environment
    ||auth.connectionHash!==purchase.connectionHash||auth.fundingSourceHash!==purchase.fundingSourceHash
    ||auth.debitAuthorized!==true||auth.paymentMethod!=='balance'||auth.chargeScope!=='PROVIDER_ORDER_TOTAL'
    ||purchase.environment==='production'&&(auth.separatePlatformFeesAuthorized!==true
      ||purchase.customerChargePolicy!=='PLATFORM_ABSORBS_NETWORK_FEES'))
    return {id,unavailable:'MANAGED_NETWORK_CURRENT_FUNDED_PLAN_REQUIRED'};
  return {id,input,nodeDirectory,category:MANAGED_NETWORK_CATEGORY,acceptanceContract:MANAGED_NETWORK_CONTRACT,
    purchase,executionTiming:'AFTER_DEPENDENCY_ACCEPTANCE'};
}
export function managedNetworkPaymentConfirmation(preparation) {
  const parts=preparation?.parts?.filter(part=>part.category===MANAGED_NETWORK_CATEGORY)??[];
  return parts.length ? {schema:'outsider/managed-network-payment-confirmation/v1',
    programHash:preparation.compilation.program.programHash,preparationHash:preparation.preparationHash,
    payments:parts.map(part=>({requirementId:part.id,networkId:part.input.networkId,
      summary:part.purchase.summary??'Provider-confirmed flight booking',accountLabel:part.purchase.accountLabel,
      authorization:part.purchase.authorization}))}:null;
}
export function managedNetworkFragment(part,completionDeadline) {
  const p=part.purchase;
  return {id:part.id,category:part.category,acceptanceContract:part.acceptanceContract,
    finalNodeId:'booking_confirmed',witnessRequirementId:'provider_read',
    requirements:[{requirementId:'order',role:'PRIMARY',capability:MANAGED_NETWORK_CAPABILITY,minimumReservationMs:1,
      dependsOnRequirementIds:[],constraints:{admissionMode:'EXECUTION_PHASE_TRANSACTION',newPurchaseAuthorized:true,
        checkoutPlanHash:p.planHash,quoteHash:p.quoteHash,connectionHash:p.connectionHash,fundingSourceHash:p.fundingSourceHash,
        maximumAmountMinor:p.totalAmountMinor,currency:p.currency,paymentMethod:'balance',environment:p.environment,
        automaticPaymentAuthorized:true,chargeScope:'PROVIDER_ORDER_TOTAL',paymentAuthorizationHash:digest(p.authorization)}},
    {requirementId:'provider_read',role:'INDEPENDENT_WITNESS',capability:'PROVIDER_BOOKING_READ_NOT_INDEPENDENT_SERVICE_TRUTH',
      minimumReservationMs:1,dependsOnRequirementIds:['order'],constraints:{admissionMode:'ON_DEMAND_OBSERVATION'}}],
    nodes:[{nodeId:'booking_confirmed',kind:'TRANSACTION',dependsOn:[],primaryRequirementId:'order',
      recoveryRequirementId:null,witnessRequirementId:'provider_read',input:{operation:'CREATE_AND_READ_BOUND_BOOKING'},
      acceptance:[MANAGED_NETWORK_CONTRACT]}],
    obligations:[{obligationId:'return_order_control',trigger:'ALWAYS',targetRequirementId:'order',nodeId:null,
      action:'RETURN_BUYER_ORDER_CONTROL_WITH_FINAL_DISPOSITION',input:{automaticCancellationAuthorized:false},deadline:completionDeadline}]};
}
export function createManagedNetworkComponent({part,directory,program,mapping,preparation,confirmationFile},dependencies={}) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  const native=managedNetworkAdapter(part.nodeDirectory,dependencies),p=part.purchase;
  const clock=dependencies.clock??(()=>new Date().toISOString());
  const requirementId=mapping.prefix+'order',terms=program.requirements.find(row=>row.requirementId===requirementId)?.constraints;
  if(program.schema!=='outsider/execution-only-program/v5'||terms?.checkoutPlanHash!==p.planHash
    ||terms.quoteHash!==p.quoteHash||terms.maximumAmountMinor!==p.totalAmountMinor||terms.currency!==p.currency
    ||terms.connectionHash!==p.connectionHash||terms.fundingSourceHash!==p.fundingSourceHash
    ||terms.paymentAuthorizationHash!==digest(p.authorization))fail('MANAGED_NETWORK_PROGRAM_BINDING_CHANGED');
  const acquiredFile=path.join(directory,'purchased-order.json');
  const local=()=>native.localStatus({planHash:p.planHash});
  const authority=()=>{
    if(!path.isAbsolute(confirmationFile??'')||!existsSync(confirmationFile))fail('MANAGED_NETWORK_PAYMENT_CONFIRMATION_REQUIRED');
    const confirmation=read(confirmationFile),expected=managedNetworkPaymentConfirmation(preparation);
    if(confirmation.preparationHash!==preparation.preparationHash||confirmation.programHash!==program.programHash
      ||confirmation.paymentAuthorized!==true||digest(confirmation.paymentAuthorization??null)!==digest(expected))
      fail('MANAGED_NETWORK_PAYMENT_CONFIRMATION_CHANGED');
    return expected.payments.find(row=>row.requirementId===part.id).authorization;
  };
  const checked=value=>{
    if(value.planHash!==p.planHash||value.currency!==p.currency||value.environment!==p.environment
      )
      fail('MANAGED_NETWORK_PAYMENT_RESULT_MISMATCH');
    return value;
  };
  const paidAsQuoted=order=>order.environment==='production'
    ?order.paymentPerformed===true&&order.chargedAmountMinor===p.totalAmountMinor
    :order.paymentPerformed===false&&order.testPaymentRecorded===true&&order.testChargedAmountMinor===p.totalAmountMinor;
  const pending=reason=>({status:'INCONCLUSIVE',reason,observedAt:clock(),expectedExternalProgress:true,
    retryAfter:new Date(Math.min(Date.parse(clock())+60000,Date.parse(program.completionDeadline))).toISOString()});
  const observe=async()=>{
    const order=checked(await native.read({planHash:p.planHash}));
    if(order.state==='PENDING'||order.state==='NOT_SUBMITTED')return {...pending(order.reason??'NETWORK_BOOKING_PENDING'),order};
    return {status:order.bookingConfirmed&&order.state==='BOOKED'&&paidAsQuoted(order)?'SATISFIED':'NOT_SATISFIED',observedAt:clock(),order,
      independentOfSeller:false,physicalServiceCompleted:false,travelCompleted:false};
  };
  const deliveryDescriptor=()=>({capability:MANAGED_NETWORK_CAPABILITY,networkId:part.input.networkId,
    acceptanceContract:MANAGED_NETWORK_CONTRACT,summary:p.summary??'Provider-confirmed flight booking',
    ...checked(local()),expectedChargeAmountMinor:p.totalAmountMinor,chargedAsQuoted:paidAsQuoted(local()),independentOfSeller:false,physicalServiceCompleted:false,automaticReplacementReserved:false});
  return {part,mapping,deliveryDescriptor,currentAcceptance:observe,
    adapters:{order:{providerRef:'duffel',connectionHash:p.connectionHash,supportsResumeOnly:true,
      reserve:()=>({status:'READY_FOR_TRANSACTION',reservationId:'network-plan:'+p.planHash,
        validUntil:program.completionDeadline,capacityReserved:false,providerReceipt:{checkoutPlanHash:p.planHash,quoteHash:p.quoteHash,currency:p.currency,maximumAmountMinor:p.totalAmountMinor,transactionSubmitted:false,orderCreated:false}}),
      async execute({operationId,resumeOnly=false}){
        const order=checked(await native.execute({planHash:p.planHash,programHash:program.programHash,
          requirementId,operationId,authorization:authority(),resumeOnly}));
        if(order.state==='PENDING')fail('MANAGED_NETWORK_ORDER_RECONCILIATION_REQUIRED');
        if(order.bookingConfirmed&&order.state==='BOOKED'&&paidAsQuoted(order)){
          if(!existsSync(acquiredFile))writeOnce(acquiredFile,order);
          return {status:'SUCCEEDED',providerReceipt:order,paymentPerformed:order.paymentPerformed};
        }
        return {status:'FAILED',providerReceipt:order,paymentPerformed:order.paymentPerformed,
          ...(order.state==='NOT_SUBMITTED'||order.state==='REJECTED'?{effectNotDispatched:order.paymentPerformed===false}:{})};
      },
      closeObligation:async()=>{let order=checked(local());
        if(order.state==='PENDING'){try{order=checked(await native.read({planHash:p.planHash}));}catch{order=checked(local());}}
        return {status:order.state==='PENDING'?'OPEN':'CLOSED',
        receipt:{order,orderCancelled:false,refundPerformed:false,automaticCancellationAuthorized:false}};},
      release:()=>({status:'CLOSED',receipt:{orderCancelled:false,refundPerformed:false}})},
    provider_read:{providerRef:'duffel',
      reserve:()=>({status:'READY_ON_DEMAND',reservationId:'network-read:'+p.planHash,validUntil:program.completionDeadline,capacityReserved:false,providerReceipt:{planHash:p.planHash,readiness:'ORIGINAL_ORDER_READ',providerAcceptanceClaimed:false}}),
      observe,release:()=>({status:'CLOSED',receipt:{orderCancelled:false}})}},
    async operateOrder(command){
      if(command.action==='REFRESH'&&Object.keys(command).sort().join(',')==='action')return native.read({planHash:p.planHash});
      if(command.action==='QUOTE_CANCELLATION'&&Object.keys(command).sort().join(',')==='action')
        return native.quoteCancellation({planHash:p.planHash});
      if(command.action==='CONFIRM_CANCELLATION'&&Object.keys(command).sort().join(',')==='action,authorization,cancellationPlanHash')
        return native.confirmCancellation({planHash:p.planHash,cancellationPlanHash:command.cancellationPlanHash,authorization:command.authorization});
      fail('MANAGED_NETWORK_ORDER_ACTION_INVALID');
    }};
}
