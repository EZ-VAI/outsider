import {privateExecutionRecordExists as existsSync} from './outsider-user-held-durable-execution-v2.js';
/* A merchant digital acquisition is distinct from physical delivery and from
 * public datasets. It reuses the original transaction, graph and lifecycle. */
import path from 'node:path';
import {mkdirSync} from 'node:fs';
import {createNativeRetailBuyer} from './outsider-native-retail-buyer.js';
import {WOOCOMMERCE_DIGITAL_PROTOCOL} from './outsider-woocommerce-buyer-transaction.js';
import {normalizeRetailFulfillmentInput} from './outsider-retail-fulfillment-fragment.js';
import {createDigitalGoodsDelivery} from './outsider-digital-goods-delivery.js';
import {readPrivateExecutionBytes,writePrivateExecutionRecordOnce as writeOnce} from './outsider-user-held-durable-execution-v2.js';
const read=f=>JSON.parse(readPrivateExecutionBytes(f));
export const DIGITAL_GOODS_CAPABILITY='DIGITAL_GOODS_ACQUISITION_V1';
export const DIGITAL_GOODS_CONTRACT='NATIVE_ZERO_TOTAL_ORDER_AND_PRIVATE_BUYER_ZIP_RECEIPT_V1';
export function normalizeDigitalGoodsInput(value){
  const v=normalizeRetailFulfillmentInput(value);
  if(!v.purchasePlanHash)throw new Error('DIGITAL_GOODS_PURCHASE_PLAN_REQUIRED');
  return v;
}
function native(nodeDirectory,transactionId,dependencies){
  const root=path.join(nodeDirectory,'retail-transactions',transactionId),request=read(path.join(root,'request.json'));
  if(request.protocol!==WOOCOMMERCE_DIGITAL_PROTOCOL)throw new Error('DIGITAL_GOODS_EXPLICIT_NONSHIPPING_REQUEST_REQUIRED');
  return {root,request,buyer:createNativeRetailBuyer({nodeDirectory,directory:path.join(root,'native'),request,
    clock:dependencies.clock,fetchFactory:dependencies.fetchFactory})};
}
export async function prepareDigitalGoodsPart({id,input,nodeDirectory},dependencies={}){
  const v=normalizeDigitalGoodsInput(input),n=native(nodeDirectory,v.transactionId,dependencies);
  const purchase=n.buyer.readZeroTotalCheckoutPlan(v.purchasePlanHash),observed=await n.buyer.inspect();
  const continuingAcceptedOrder=observed.outsiderCreatedOrder===true&&observed.sellerOrderAccepted===true
    &&observed.checkoutPlanHash===v.purchasePlanHash&&observed.totalAmountMinor==='0'&&observed.needsPayment===false;
  if(!continuingAcceptedOrder&&(observed.cart?.needsShipping!==false||observed.cart?.needsPayment!==false||observed.cart?.price?.totalAmountMinor!=='0'
    ||Date.parse(purchase.expiresAt)<=Date.parse(dependencies.clock?.()??new Date().toISOString())))
    return {id,unavailable:'DIGITAL_GOODS_CURRENT_ZERO_TOTAL_QUOTE_REQUIRED'};
  return {id,category:'DIGITAL_GOODS_ACQUISITION',acceptanceContract:DIGITAL_GOODS_CONTRACT,nodeDirectory,
    transactionId:v.transactionId,purchase,merchantOrigin:n.request.storeUrl,
    product:read(path.join(n.root,'native','prepared.json')).product,
    executionTiming:'AFTER_DEPENDENCY_ACCEPTANCE',continuingAcceptedOrder,independentReplacementSupplier:false};
}
export function digitalGoodsFragment(part,deadline){
  return {id:part.id,category:part.category,acceptanceContract:part.acceptanceContract,finalNodeId:'file_received',witnessRequirementId:'buyer_read',
    requirements:[{requirementId:'order',role:'PRIMARY',capability:'ZERO_TOTAL_NATIVE_DIGITAL_ORDER',minimumReservationMs:1,dependsOnRequirementIds:[],
      constraints:{admissionMode:'EXECUTION_PHASE_TRANSACTION',maximumAmountMinor:'0',checkoutPlanHash:part.purchase.planHash}},
    {requirementId:'download',role:'PRIMARY',capability:'MERCHANT_ISSUED_PRIVATE_DIGITAL_DOWNLOAD',minimumReservationMs:1,dependsOnRequirementIds:['order'],
      constraints:{admissionMode:'EXECUTION_PHASE_TRANSACTION',maximumAmountMinor:'0',publicRedistribution:false}},
    {requirementId:'merchant_read',role:'INDEPENDENT_WITNESS',capability:'NATIVE_ORDER_ACCEPTANCE_NOT_INDEPENDENT_OUTCOME',minimumReservationMs:1,dependsOnRequirementIds:['order'],
      constraints:{admissionMode:'ON_DEMAND_OBSERVATION'}},
    {requirementId:'buyer_read',role:'INDEPENDENT_WITNESS',capability:'BUYER_LOCAL_FILE_READ_NOT_BENEFICIARY_INDEPENDENT',minimumReservationMs:1,dependsOnRequirementIds:['download'],
      constraints:{admissionMode:'ON_DEMAND_OBSERVATION'}}],
    nodes:[{nodeId:'seller_accepted',kind:'TRANSACTION',dependsOn:[],primaryRequirementId:'order',recoveryRequirementId:null,witnessRequirementId:'merchant_read',
      input:{operation:'acquire_digital_order'},acceptance:[part.acceptanceContract]},
    {nodeId:'file_received',kind:'TRANSACTION',dependsOn:['seller_accepted'],primaryRequirementId:'download',recoveryRequirementId:null,witnessRequirementId:'buyer_read',
      input:{operation:'receive_private_package'},acceptance:[part.acceptanceContract]}],
    obligations:[{obligationId:'retain_buyer_control',trigger:'ALWAYS',targetRequirementId:'order',nodeId:null,
      action:'RETAIN_NATIVE_ORDER_AND_BUYER_ENTITLEMENT',input:{automaticRefund:false},deadline}]};
}
export function createDigitalGoodsComponent({part,directory,program,mapping},dependencies={}){
  mkdirSync(directory,{recursive:true,mode:0o700});
  const clock=dependencies.clock??(()=>new Date().toISOString()),n=native(part.nodeDirectory,part.transactionId,dependencies);
  const orderFile=path.join(directory,'purchased-order.json');
  const delivery=createDigitalGoodsDelivery({directory:path.join(n.root,'digital-delivery'),buyer:n.buyer,
    origin:part.merchantOrigin,fetchImpl:dependencies.digitalDeliveryFetch,clock});
  const providerRef=new URL(part.merchantOrigin).hostname;
  const ready=(id)=>({status:'READY_FOR_TRANSACTION',reservationId:`digital:${part.transactionId}:${id}`,
    validUntil:program.completionDeadline,capacityReserved:false,providerReceipt:{source:'CONNECTED_EXACT_BUYER_OPERATION',transactionSubmitted:false}});
  const close=()=>({status:'CLOSED',receipt:{orderCancelled:false,privateFileRetained:true,paymentPerformed:false}});
  async function orderObservation(){
    const expected=existsSync(orderFile)?read(orderFile):null,current=await n.buyer.readOrder();
    return {status:expected&&current.orderRefHash===expected.orderRefHash&&current.sellerOrderAccepted&&current.needsPayment===false&&current.totalAmountMinor==='0'
      ?'SATISFIED':'NOT_SATISFIED',observedAt:clock(),orderReceipt:current.receipt,merchantAccepted:current.sellerOrderAccepted,
      independentOutcomeTruth:false};
  }
  async function fileObservation(){
    const order=await orderObservation(),file=delivery.inspect();
    return {status:order.status==='SATISFIED'&&file?'SATISFIED':'NOT_SATISFIED',observedAt:clock(),
      orderReceipt:order.orderReceipt,artifactHash:file?.artifactHash??null,artifactBytes:file?.artifactBytes??null,
      buyerActuallyReceivedBytes:!!file,independentOfBeneficiary:false,redistributionAuthorized:false};
  }
  const observation=(id,observe)=>({providerRef:id==='merchant_read'?providerRef:'authorized-buyer-file-receipt',
    reserve:()=>({...ready(id),status:'READY_ON_DEMAND'}),observe,release:close});
  return {part,mapping,adapters:{
    order:{providerRef,reserve:()=>ready('order'),async execute(){
      let order;try{order=await n.buyer.submitZeroTotalCheckout(part.purchase.planHash);}catch(error){
        if(error.code==='RETAIL_CHECKOUT_CUSTOMER_INPUT_REJECTED')return {status:'FAILED',providerReceipt:error.providerReceipt};
        throw error;
      }
      if(!existsSync(orderFile))writeOnce(orderFile,order);
      return {status:order.sellerOrderAccepted&&order.needsPayment===false?'SUCCEEDED':'FAILED',providerReceipt:order};
    },release:close,closeObligation:close},
    download:{providerRef,reserve:()=>ready('download'),async execute(){
      const result=await delivery.acquire();return {status:'SUCCEEDED',providerReceipt:{artifactHash:result.artifactHash,
        artifactBytes:result.artifactBytes,orderRefHash:result.orderRefHash,receivedAt:result.receivedAt}};
    },release:close},merchant_read:observation('merchant_read',orderObservation),buyer_read:observation('buyer_read',fileObservation)},
    deliveryDescriptor:()=>{
      const file=delivery.inspect(),order=existsSync(orderFile)?read(orderFile):null;
      return {transactionId:part.transactionId,orderRefHash:order?.orderRefHash??null,productUrl:part.product.productUrl,
        merchantOrigin:part.merchantOrigin,purchasedByOutsider:order?.outsiderCreatedOrder??false,
        artifactHash:file?.artifactHash??null,artifactBytes:file?.artifactBytes??null,archiveEntryCount:file?.archiveEntryCount??null,
        privateFileReceived:!!file,deliveryObservation:'LOCAL_BUYER_RECEIPT_NOT_INDEPENDENT_INSPECTION',
        independentReplacementSupplier:false,capitalBacked:false,publicRedistribution:false};
    }};
}
