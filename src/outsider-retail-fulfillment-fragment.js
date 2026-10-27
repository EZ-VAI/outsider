import {privateExecutionRecordExists as existsSync} from './outsider-user-held-durable-execution-v2.js';
/* Physical fulfillment is an ordinary component of the original demand DAG.
 * Existing-order V1 follows an accepted order; zero-total V2 purchases only
 * after graph confirmation. Neither claims a reserved replacement seller.
 */
import path from "node:path";
import { mkdirSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createNativeRetailBuyer } from './outsider-native-retail-buyer.js';
import { create17TrackShipmentAdapter, normalizeShipmentBinding, shipmentConnectionStatus } from "./outsider-17track-shipment.js";
import { publicDatasetHash as digest } from "./outsider-public-dataset.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "./outsider-user-held-durable-execution-v2.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const timestamp = value => typeof value === "string" && Number.isFinite(Date.parse(value));
export const RETAIL_FULFILLMENT_CONTRACT = "ACCEPTED_ORDER_CARRIER_DELIVERY_AND_RECIPIENT_ITEM_INSPECTION_V1";
export const RETAIL_PURCHASE_CONTRACT = 'ZERO_TOTAL_NATIVE_PURCHASE_CARRIER_DELIVERY_AND_RECIPIENT_INSPECTION_V2';
export const RETAIL_PAY_LATER_CONTRACT = 'FIXED_PRICE_PAY_LATER_PURCHASE_CARRIER_DELIVERY_AND_RECIPIENT_INSPECTION_V3';
const isPayLater = purchase => purchase?.schema === 'outsider/pay-later-native-checkout-plan/v1';
export function normalizeRetailFulfillmentInput(value) {
  if (!value || !['transactionId','purchasePlanHash,transactionId'].includes(Object.keys(value).sort().join(','))
    || !/^retail_[a-f0-9]{32}$/u.test(value.transactionId ?? "")
    || value.purchasePlanHash!==undefined&&!/^sha256:[a-f0-9]{64}$/u.test(value.purchasePlanHash))
    fail("RETAIL_FULFILLMENT_INPUT_INVALID");
  return { transactionId: value.transactionId,...(value.purchasePlanHash?{purchasePlanHash:value.purchasePlanHash}:{}) };
}
export function retailFulfillmentStore(nodeDirectory, transactionId, dependencies = {}) {
  normalizeRetailFulfillmentInput({ transactionId });
  const root = path.join(nodeDirectory, "retail-transactions", transactionId), directory = path.join(root, "fulfillment");
  if (!existsSync(path.join(root, "request.json"))) fail("RETAIL_TRANSACTION_NOT_FOUND");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const request = read(path.join(root, "request.json")), clock = dependencies.clock ?? (() => new Date().toISOString());
  const native = (dependencies.createRetailBuyer ?? createNativeRetailBuyer)({ directory: path.join(root, "native"), request, clock, nodeDirectory,
    fetchFactory: dependencies.fetchFactory, ucpFetchFactory: dependencies.ucpFetchFactory, orderAccess: dependencies.orderAccess,
    checkoutAccess: dependencies.checkoutAccess });
  const destination = request.destination ?? (() => {
    const quote = path.join(root, 'native', 'quote-address-authorization.json');
    const address = request.quoteAddress ?? (existsSync(quote) ? read(quote).address : null);
    return address ? { country: address.address_country, postcode: address.postal_code } : null;
  })();
  const shipmentFile = path.join(directory, "shipment.json"), inspections = path.join(directory, "recipient-inspections");
  const latestInspection = () => !existsSync(inspections) ? null : (() => {
    const latest = readdirSync(inspections).filter(n => n.endsWith(".json")).sort().at(-1);
    return latest ? read(path.join(inspections, latest)) : null;
  })();
  return { request, directory, readOrder: () => native.readOrder({preferWebhook:true}),
    purchaseAttempted:()=>existsSync(path.join(root,'native','pay-later-execution-binding.json'))
      &&existsSync(path.join(root,'native','checkout-submit-attempt.json')),
    checkoutPlan:hash=>{
      if(typeof native.readPayLaterCheckoutPlan==='function'){
        try{return native.readPayLaterCheckoutPlan(hash);}catch(error){
          if(error.code!=='RETAIL_PAY_LATER_PLAN_NOT_FOUND')throw error;
        }
      }
      if(typeof native.readZeroTotalCheckoutPlan!=='function')fail('RETAIL_NATIVE_ZERO_TOTAL_CHECKOUT_NOT_SUPPORTED');
      return native.readZeroTotalCheckoutPlan(hash);
    },
    purchase:(hash,context)=>{
      if(context?.payLater){
        if(typeof native.submitPayLaterCheckout!=='function')fail('RETAIL_PAY_LATER_CHECKOUT_NOT_SUPPORTED');
        return native.submitPayLaterCheckout({expectedPlanHash:hash,programHash:context.programHash,
          requirementId:context.requirementId,...(context.resumeOnly?{resumeOnly:true}:{})});
      }
      if(typeof native.submitZeroTotalCheckout!=='function')fail('RETAIL_NATIVE_ZERO_TOTAL_CHECKOUT_NOT_SUPPORTED');
      return native.submitZeroTotalCheckout(hash);
    },
    shipment: () => {
      if(existsSync(shipmentFile))return read(shipmentFile);
      const eventShipment=native.currentShipment?.();
      if(eventShipment?.eventPresent){
        const reference=eventShipment.reference;
        return reference&&destination?normalizeShipmentBinding({number:reference.number,carrier:reference.carrier,
          orderRefHash:reference.orderRefHash,source:reference.source,
          recipientCountry:destination.country,recipientPostcode:destination.postcode}):null;
      }
      const source=path.join(root,'native','shipment-reference.json');
      if(!existsSync(source)||!destination)return null;
      const reference=read(source);
      const binding=normalizeShipmentBinding({number:reference.number,carrier:reference.carrier,
        orderRefHash:reference.orderRefHash,source:reference.source,
        recipientCountry:destination.country,recipientPostcode:destination.postcode});
      writeOnce(shipmentFile,binding);return binding;
    },
    inspection: latestInspection,
    async bindShipment(value) {
      const order = await native.readOrder();
      if (!destination) fail('RETAIL_ORDER_DESTINATION_REQUIRED');
      const binding = normalizeShipmentBinding({ ...value, orderRefHash: order.orderRefHash,
        recipientCountry: destination.country, recipientPostcode: destination.postcode,
        source: "AUTHORIZED_BUYER_HANDOFF" });
      writeOnce(shipmentFile, binding);
      return { shipmentRefHash: digest(binding), source: binding.source, orderRefHash: order.orderRefHash };
    },
    recordInspection(value, { programHash, orderRefHash, notBefore, deadline }) {
      if (!value || Object.keys(value).sort().join(",") !== "atDestination,itemMatchesOrder,quantityMatchesOrder,receivedAt,undamaged"
        || [value.atDestination, value.itemMatchesOrder, value.quantityMatchesOrder, value.undamaged].some(v => typeof v !== "boolean")
        || !timestamp(value.receivedAt) || Date.parse(value.receivedAt) > Date.parse(clock())
        || Date.parse(value.receivedAt) < Date.parse(notBefore)) fail("RETAIL_RECIPIENT_INSPECTION_INVALID");
      mkdirSync(inspections, { recursive: true, mode: 0o700 });
      const body = { ...value, programHash, orderRefHash, deadline, recordedAt: clock(),
        source: "AUTHENTICATED_NODE_OWNER_RECIPIENT_ATTESTATION", independentOfBeneficiary: false,
        outsiderEmployeeInspection: false };
      const record = { ...body, receiptHash: digest(body) };
      writeOnce(path.join(inspections, `${String(readdirSync(inspections).length + 1).padStart(8, "0")}-${randomUUID()}.json`), record);
      return record;
    } };
}
export async function prepareRetailFulfillmentPart({ id, input, nodeDirectory }, dependencies = {}) {
  const store = retailFulfillmentStore(nodeDirectory, input.transactionId, dependencies);
  const purchase=input.purchasePlanHash?store.checkoutPlan(input.purchasePlanHash):null;
  let order=null;
  if(purchase){
    const now=dependencies.clock?.()??new Date().toISOString();
    if((isPayLater(purchase)? !/^[1-9]\d*$/u.test(purchase.totalAmountMinor)
      ||!['cod','bacs'].includes(purchase.paymentMethod)||purchase.createsPaymentObligation!==true:purchase.totalAmountMinor!=='0')
      ||purchase.currency!==store.request.currency||!timestamp(purchase.expiresAt)||Date.parse(purchase.expiresAt)<=Date.parse(now)
      ||BigInt(purchase.totalAmountMinor)>BigInt(store.request.maximumTotalMinor))
      return {id,unavailable:isPayLater(purchase)?'NATIVE_PAY_LATER_PURCHASE_PLAN_EXPIRED_OR_INVALID':'NATIVE_ZERO_TOTAL_PURCHASE_PLAN_EXPIRED_OR_INVALID'};
  }else{
  try { order = await store.readOrder(); } catch (error) {
    if (["RETAIL_NO_SUBMITTED_ORDER", "UCP_NO_SUBMITTED_ORDER", "UCP_CHECKOUT_NOT_COMPLETED"].includes(error.code)) return { id, unavailable: "NATIVE_ACCEPTED_BUYER_ORDER_REQUIRED" };
    throw error;
  }
  if (!order.sellerOrderAccepted || order.needsPayment !== false) return { id, unavailable: "NATIVE_PAID_ACCEPTED_ORDER_REQUIRED" };
  if (order.currency !== store.request.currency || !/^\d+$/u.test(order.totalAmountMinor ?? "") || BigInt(order.totalAmountMinor) > BigInt(store.request.maximumTotalMinor))
    return { id, unavailable: "ORDER_EXCEEDS_FROZEN_PURCHASE_BUDGET" };
  }
  const connection = dependencies.shipmentConnectionStatus?.() ?? shipmentConnectionStatus(nodeDirectory, dependencies.clock);
  if (!connection.connected) return { id, unavailable: connection.reason ?? "SHIPMENT_API_CONNECTION_REQUIRED" };
  return { id, category: "RETAIL_FULFILLMENT", acceptanceContract: isPayLater(purchase)?RETAIL_PAY_LATER_CONTRACT:purchase?RETAIL_PURCHASE_CONTRACT:RETAIL_FULFILLMENT_CONTRACT, nodeDirectory,
    transactionId: input.transactionId, order, maximumTotalMinor: store.request.maximumTotalMinor,
    ...(purchase?{purchase,executionTiming:'AFTER_DEPENDENCY_ACCEPTANCE'}:{}),
    merchantOrigin: store.request.storeUrl, item: read(path.join(nodeDirectory, "retail-transactions", input.transactionId, "native", "product.json")),
    carrierConnection: { provider: "17TRACK", zeroCostOnly: true }, replacementSupplierReserved: false };
}
export function retailFulfillmentFragment(part, completionDeadline) {
  const deferred=part.purchase&&part.executionTiming==='AFTER_DEPENDENCY_ACCEPTANCE';
  const payLater=isPayLater(part.purchase);
  const witness = (id, capability) => ({ requirementId: id, role: "INDEPENDENT_WITNESS", capability,
    minimumReservationMs: 1, dependsOnRequirementIds: ["order"], constraints: { admissionMode: "ON_DEMAND_OBSERVATION" } });
  return { id: part.id, category: part.category, acceptanceContract: part.acceptanceContract,
    finalNodeId: "recipient_accepted", witnessRequirementId: "recipient_read",
    requirements: [{ requirementId: "order", role: "PRIMARY", capability: payLater?'FIXED_PRICE_NATIVE_BUYER_ORDER_CREATE':part.purchase?'ZERO_TOTAL_NATIVE_BUYER_ORDER_CREATE':'EXISTING_BUYER_ORDER_FULFILLMENT',
      minimumReservationMs: 1, dependsOnRequirementIds: [], constraints: { admissionMode: deferred?'EXECUTION_PHASE_TRANSACTION':part.purchase?'ZERO_TOTAL_NATIVE_ORDER_AFTER_CONFIRMATION':'EXISTING_ACCEPTED_ORDER',
        ...(part.purchase?{checkoutPlanHash:part.purchase.planHash,quoteHash:part.purchase.quoteHash,
          newPurchaseAuthorized:true,maximumAmountMinor:part.purchase.totalAmountMinor,currency:part.purchase.currency,createAccount:false,paymentInstrumentRequired:false,
          ...(payLater?{paymentMethod:part.purchase.paymentMethod,automaticPaymentAuthorized:false,
            createsPaymentObligation:true,buyerAction:part.purchase.buyerAction}:{})}
          :{orderRefHash: part.order.orderRefHash, newPurchaseAuthorized: false}) } },
    witness("merchant_read", "MERCHANT_ORDER_READ_NOT_INDEPENDENT_FULFILLMENT_TRUTH"),
    witness("carrier_read", "CARRIER_EVENT_READ_VIA_17TRACK"),
    witness("recipient_read", "RECIPIENT_ITEM_INSPECTION_NOT_INDEPENDENT_OF_BENEFICIARY")],
    nodes: [
      { nodeId: "seller_accepted", witness: "merchant_read", dependsOn: [] },
      { nodeId: "dispatched", witness: "carrier_read", dependsOn: ["seller_accepted"] },
      { nodeId: "carrier_delivered", witness: "carrier_read", dependsOn: ["dispatched"] },
      { nodeId: "recipient_accepted", witness: "recipient_read", dependsOn: ["carrier_delivered"] },
    ].map(row => ({ nodeId: row.nodeId, kind: deferred&&row.nodeId==='seller_accepted'?'TRANSACTION':"OBSERVATION", dependsOn: row.dependsOn,
      primaryRequirementId: deferred&&row.nodeId==='seller_accepted'?'order':null, recoveryRequirementId: null, witnessRequirementId: row.witness,
      input: { operation: row.nodeId }, acceptance: [part.acceptanceContract] })),
    obligations: [{ obligationId: "return_order_control", trigger: "ALWAYS", targetRequirementId: "order", nodeId: null,
      action: "RETURN_BUYER_ORDER_CONTROL_WITH_FINAL_DISPOSITION", input: { cancellationAndRefundAreSeparate: true },
      deadline: completionDeadline }] };
}
export function createRetailFulfillmentComponent({ part, directory, program, mapping }, dependencies = {}) {
  mkdirSync(directory,{recursive:true,mode:0o700});
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const store = retailFulfillmentStore(part.nodeDirectory, part.transactionId, dependencies);
  const acquiredFile=path.join(directory,'purchased-order.json');
  const expectedOrder=()=>part.order??(existsSync(acquiredFile)?read(acquiredFile):null);
  const deferred=part.purchase&&part.executionTiming==='AFTER_DEPENDENCY_ACCEPTANCE';
  const payLater=isPayLater(part.purchase);
  if(payLater){
    const bound=program.requirements.find(row=>row.requirementId===`${mapping.prefix}order`);
    if(program.schema!=='outsider/execution-only-program/v5'||!deferred||part.acceptanceContract!==RETAIL_PAY_LATER_CONTRACT
      ||bound?.constraints.checkoutPlanHash!==part.purchase.planHash||bound.constraints.quoteHash!==part.purchase.quoteHash
      ||bound.constraints.maximumAmountMinor!==part.purchase.totalAmountMinor||bound.constraints.currency!==part.purchase.currency
      ||bound.constraints.paymentMethod!==part.purchase.paymentMethod||bound.constraints.newPurchaseAuthorized!==true)
      fail('RETAIL_PAY_LATER_PROGRAM_BINDING_CHANGED');
  }
  const carrier = (dependencies.createShipmentAdapter ?? create17TrackShipmentAdapter)({
    directory: path.join(directory, "carrier"), nodeDirectory: part.nodeDirectory, clock });
  const at = () => clock(), pending = reason => ({ status: "INCONCLUSIVE", observedAt: at(), reason,
    retryAfter: new Date(Math.min(Date.parse(clock()) + 15 * 60000, Date.parse(program.completionDeadline))).toISOString(),
    expectedExternalProgress: true });
  const ended = reason => ({ status: "NOT_SATISFIED", observedAt: at(), reason });
  async function currentOrder() {
    const order = payLater?await store.purchase(part.purchase.planHash,{payLater:true,programHash:program.programHash,
      requirementId:`${mapping.prefix}order`,resumeOnly:true}):await store.readOrder();
    const expected=expectedOrder();
    if (!expected||order.orderRefHash !== expected.orderRefHash) fail("RETAIL_FULFILLMENT_ORDER_CHANGED");
    if (order.currency !== expected.currency || !/^\d+$/u.test(order.totalAmountMinor ?? "")
      ||part.purchase&&order.totalAmountMinor!==part.purchase.totalAmountMinor
      || BigInt(order.totalAmountMinor) > BigInt(part.maximumTotalMinor)) fail("RETAIL_FULFILLMENT_ORDER_PRICE_CHANGED");
    if(payLater){
      const observations=path.join(directory,'merchant-observations');mkdirSync(observations,{recursive:true,mode:0o700});
      writeOnce(path.join(observations,`${String(readdirSync(observations).length+1).padStart(8,'0')}-${randomUUID()}.json`),order);
    }
    return order;
  }
  async function carrierObservation() {
    const shipment = store.shipment();
    if (!shipment) return pending("AWAITING_MERCHANT_SHIPMENT_REFERENCE");
    if (shipment.orderRefHash !== expectedOrder()?.orderRefHash) fail("RETAIL_SHIPMENT_ORDER_MISMATCH");
    const observation = await carrier.observe(shipment);
    if (observation.destinationMismatch) return { ...ended("CARRIER_DESTINATION_MISMATCH"), carrier: observation };
    if (["Returned", "Expired"].includes(observation.carrierStatus)) return { ...ended("SHIPMENT_NOT_DELIVERABLE"), carrier: observation };
    return observation;
  }
  async function recipientObservation() {
    const order = await currentOrder();
    if (!order.sellerOrderAccepted || order.needsPayment !== false) return ended("SELLER_ORDER_NO_LONGER_ACCEPTED");
    const transport = await carrierObservation();
    if (transport.status) return transport;
    if (!transport.carrierReportedDelivered || !transport.deliveredAt) return pending("AWAITING_CARRIER_DELIVERY");
    if (Date.parse(transport.deliveredAt) < Date.parse(program.createdAt)
      || Date.parse(transport.deliveredAt) > Date.parse(program.completionDeadline)) return ended("DELIVERY_OUTSIDE_CONTRACT_WINDOW");
    const inspection = store.inspection();
    if (!inspection || inspection.programHash !== program.programHash || inspection.orderRefHash !== order.orderRefHash)
      return { ...pending("AWAITING_RECIPIENT_ITEM_INSPECTION"), carrier: transport };
    const matches = inspection.atDestination && inspection.itemMatchesOrder && inspection.quantityMatchesOrder && inspection.undamaged
      && Date.parse(inspection.receivedAt) <= Date.parse(program.completionDeadline);
    return { status: matches ? "SATISFIED" : "NOT_SATISFIED", observedAt: at(),
      reason: matches ? "CARRIER_AND_RECIPIENT_CONTRACT_SATISFIED" : "RECIPIENT_REPORTED_CONTRACT_NOT_SATISFIED",
      carrier: transport, recipient: inspection, orderReceipt: order.receipt,
      independentOfSeller: true, independentOfBeneficiary: false, fundedCompensationAuthorized: false };
  }
  const onDemand = (id, providerRef, observe) => ({ providerRef,
    reserve: ({ operationId }) => ({ status: "READY_ON_DEMAND", reservationId: `${id}:${operationId}`,
      validUntil: program.completionDeadline, capacityReserved: false,
      providerReceipt: { source: id, readiness: "CONNECTED_READ_OR_AUTHENTICATED_RECIPIENT_INPUT", outcomeTruth: false } }),
    observe, release: () => ({ status: "CLOSED", receipt: { orderCancelled: false, capacityReserved: false } }) });
  async function acquireOrder({resumeOnly=false}={}){
    if(part.purchase&&!existsSync(acquiredFile)){
      const acquired=await store.purchase(part.purchase.planHash,{payLater,programHash:program.programHash,
        requirementId:`${mapping.prefix}order`,resumeOnly});
      if(payLater&&(!acquired.orderRefHash||acquired.outsiderCreatedOrder!==true||acquired.orderBindingMatched!==true))
        fail(acquired.reason??'RETAIL_PAY_LATER_ORDER_RECONCILIATION_REQUIRED');
      writeOnce(acquiredFile,acquired);
    }
    return currentOrder();
  }
  return { part, mapping, adapters: {
    order: { providerRef: new URL(part.merchantOrigin).hostname,
      ...(payLater?{supportsResumeOnly:true}:{}),
      async execute({resumeOnly=false}={}){
        if(!deferred)throw new Error('RETAIL_FULFILLMENT_CANNOT_CREATE_PURCHASE_EFFECT');
        let order;
        try{order=await acquireOrder({resumeOnly});}catch(error){
          if(payLater&&error.effectNotDispatched===true)return {status:'FAILED',reason:error.code,
            effectNotDispatched:true,orderCreated:false,paymentPerformed:false};
          throw error;
        }
        if(payLater&&order.orderRefHash&&order.outsiderCreatedOrder===true)
          return {status:'SUCCEEDED',providerReceipt:order,orderCreated:true,paymentPerformed:false};
        return {status:order.sellerOrderAccepted&&order.needsPayment===false?'SUCCEEDED':'FAILED',providerReceipt:order};
      },
      async reserve() {
        if(deferred)return {status:'READY_FOR_TRANSACTION',reservationId:`checkout-plan:${part.purchase.planHash}`,
          validUntil:program.completionDeadline,capacityReserved:false,
          providerReceipt:{transactionSubmitted:false,checkoutPlanHash:part.purchase.planHash,executionTiming:part.executionTiming,
            ...(payLater?{quoteHash:part.purchase.quoteHash,currency:part.purchase.currency,maximumAmountMinor:part.purchase.totalAmountMinor}:{})}};
        const order = await acquireOrder();
        return order.sellerOrderAccepted && order.needsPayment === false ? { status: part.purchase?"NATIVE_ORDER_ACCEPTED":"EXISTING_ORDER_ACCEPTED",
          reservationId: `${part.purchase?'native':'existing'}-order:${order.orderRefHash}`, validUntil: program.completionDeadline,
          capacityReserved: false, providerReceipt: order } : { status: "UNAVAILABLE", providerReceipt: order }; },
      closeObligation: async () => {
        if(payLater&&!expectedOrder()&&store.purchaseAttempted()){
          try{await acquireOrder({resumeOnly:true});}catch{}
          if(!expectedOrder())return {status:'OPEN',receipt:{disposition:'ORIGINAL_PURCHASE_STATUS_UNRESOLVED',
            orderCancelled:false,refundPerformed:false,paymentObligationMayExist:true}};
        }
        return { status: "CLOSED", receipt: { orderRefHash: expectedOrder()?.orderRefHash??null,
          finalMerchantRead: expectedOrder()?await currentOrder():null, orderCancelled: false, refundPerformed: false,
          disposition: expectedOrder()?"BUYER_RETAINS_ORDER_CONTROL_CANCELLATION_AND_REFUND_NOT_AUTOMATIC":"PURCHASE_NOT_EXECUTED" } };
      },
      release: () => ({ status: "CLOSED", receipt: { orderCancelled: false, newPurchasePerformed: !!part.purchase&&!!expectedOrder(),
        ...(payLater&&!expectedOrder()&&store.purchaseAttempted()?{paymentObligationMayExist:true}:{}) } }) },
    merchant_read: onDemand("merchant", new URL(part.merchantOrigin).hostname, async () => {
      const order = await currentOrder();
      if(payLater&&(!order.sellerOrderAccepted||order.needsPayment!==false)
        &&!['cancelled','failed','refunded'].includes(order.sellerOrderStatus))
        return {...pending(order.paymentState==='AWAITING_EXTERNAL_BANK_TRANSFER'?'AWAITING_EXTERNAL_BANK_TRANSFER'
          :'AWAITING_MERCHANT_PAYMENT_ACCEPTANCE'),merchantOrder:order,paymentPerformed:false};
      return { status: order.sellerOrderAccepted && order.needsPayment === false ? "SATISFIED" : "NOT_SATISFIED",
        observedAt: at(), merchantOrder: order, independentDeliveryTruth: false }; }),
    carrier_read: onDemand("carrier", "17track.net", async ({ node }) => {
      const observation = await carrierObservation(); if (observation.status) return observation;
      const dispatched = node.input.operation === "dispatched";
      const yes = dispatched ? observation.dispatched : observation.carrierReportedDelivered && !!observation.deliveredAt;
      if (!dispatched && yes && (Date.parse(observation.deliveredAt) < Date.parse(program.createdAt)
        || Date.parse(observation.deliveredAt) > Date.parse(program.completionDeadline))) return ended("DELIVERY_OUTSIDE_CONTRACT_WINDOW");
      return { ...(yes ? { status: "SATISFIED", observedAt: at() } : pending(dispatched ? "AWAITING_DISPATCH" : "AWAITING_CARRIER_DELIVERY")),
        carrier: observation, itemInspectionProven: false }; }),
    recipient_read: onDemand("recipient", "authenticated-recipient-not-third-party-inspector", recipientObservation),
  },
    recordInspection: value => store.recordInspection(value, { programHash: program.programHash,
      orderRefHash: expectedOrder().orderRefHash, notBefore: program.createdAt, deadline: program.completionDeadline }),
    deliveryDescriptor: ({accepted=true}={}) => ({ transactionId: part.transactionId, orderRefHash: expectedOrder().orderRefHash,
      totalAmountMinor: expectedOrder().totalAmountMinor,
      ...(payLater?{currency:part.purchase.currency,paymentMethod:part.purchase.paymentMethod,
        paymentPerformed:false,paymentCollectionProven:false}:{}),
      purchasedByOutsider: expectedOrder().outsiderCreatedOrder, actualPurchaseSource: expectedOrder().acquisitionSource,
      contract: part.acceptanceContract, carrierAndRecipientChecksPassed: accepted,
      independentOfBeneficiary: false, independentReplacementSupplier: false, capitalBacked: false }),
  };
}
