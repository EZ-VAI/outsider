/* One-use native buyer session: cart -> merchant-address quote -> checkout
 * requirements -> confirmed zero-total completion -> native order lifecycle.
 * Paid execution and payment instruments remain disabled.
 * Source receipts belong to the exact transaction, not a reusable price cache. */
import path from 'node:path';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { interfaceDigest as digest } from './outsider-openapi-demand-matcher.js';
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce,
  withUserHeldExecutionLockV2 as locked } from './outsider-user-held-durable-execution-v2.js';
import { wooCommerceStoreOrigin } from './outsider-woocommerce-buyer-transport.js';
import { createShopifyUcpClient, ucpResponseValue } from './outsider-shopify-ucp-client.js';
export const SHOPIFY_BUYER_PROTOCOL = 'SHOPIFY_UCP_V1';
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const clean = text => String(text ?? '').replace(/<[^>]*>/gu,' ').replace(/\s+/gu,' ').trim().slice(0,240);
const money = value => Number.isSafeInteger(value) && value >= 0;
const total = (value, type) => { const rows = (value.totals ?? []).filter(t => t.type === type); return rows.length === 1 && money(rows[0].amount) ? String(rows[0].amount) : null; };
export function normalizeShopifyBuyerRequest(value) {
  const keys = ['country','currency','maximumTotalMinor','profileUrl','protocol','quantity','requestId','storeUrl','variantId'];
  if (value?.quoteAddress) keys.push('quoteAddress');
  if (!value || Object.keys(value).sort().join(',') !== keys.sort().join(',') || value.protocol !== SHOPIFY_BUYER_PROTOCOL
    || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value.requestId ?? '') || !/^[A-Z]{3}$/u.test(value.currency ?? '')
    || !/^[A-Z]{2}$/u.test(value.country ?? '') || !/^(0|[1-9][0-9]{0,11})$/u.test(value.maximumTotalMinor ?? '')
    || !Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > 10
    || !/^gid:\/\/shopify\/ProductVariant\/[1-9][0-9]*$/u.test(value.variantId ?? '')) fail('UCP_BUYER_REQUEST_INVALID');
  const profile = new URL(value.profileUrl);
  if (profile.protocol !== 'https:' || profile.search || profile.hash || profile.username || profile.password) fail('UCP_PROFILE_URL_INVALID');
  if (value.quoteAddress) {
    const address = value.quoteAddress;
    if (Object.keys(address).sort().join(',') !== 'address_country,address_locality,address_region,postal_code,street_address'
      || Object.values(address).some(v => typeof v !== 'string' || !v || v.length > 160)
      || address.address_country !== value.country) fail('UCP_QUOTE_ADDRESS_INVALID');
  }
  return { ...value, storeUrl: wooCommerceStoreOrigin(value.storeUrl) };
}
function projection(value, request) {
  if (!value.id || !Array.isArray(value.line_items) || value.line_items.length !== 1
    || value.line_items[0].item?.id !== request.variantId || value.line_items[0].quantity !== request.quantity
    || value.currency !== request.currency || total(value,'total') === null) fail('UCP_CART_BINDING_MISMATCH');
  return { items: value.line_items.map(l => ({ productId: l.item.id, quantity: l.quantity, name: clean(l.item.title),
    unitPriceMinor: money(l.item.price) ? String(l.item.price) : null })),
    price: { currency: value.currency, totalAmountMinor: total(value,'total'), shippingAmountMinor: total(value,'fulfillment'),
      taxAmountMinor: total(value,'tax'), quoteBasis: request.quoteAddress ? 'ADDRESS_QUOTE_PENDING_CHECKOUT_REQUIREMENTS' : 'COUNTRY_ESTIMATE_NOT_DELIVERED_TOTAL' },
    shipping: (value.fulfillment?.methods ?? []).filter(m => m.type === 'shipping').flatMap(m => (m.groups ?? []).map(g => ({
      rates: (g.options ?? []).map(o => ({ rateId: o.id, name: clean(o.title), amountMinor: total(o,'total'),
        selected: g.selected_option_id === o.id, deliveryTimeClaim: clean(o.description?.plain) || null,
        // Do not turn a service label such as Economy into a promised date.
        deliveryDeadlineAccepted: false })) }))),
    errors: (value.messages ?? []).filter(m => m.type === 'error').map(m => ({ code: clean(m.code), severity: clean(m.severity) })),
    needsShipping: true, needsPayment: total(value,'total') !== '0', stockReserved: false, sellerOrderAccepted: false, deliveryProven: false };
}
export function createShopifyUcpBuyerTransaction({ directory, request: raw, fetchImpl, clock = () => new Date().toISOString(), orderAccess, checkoutAccess }) {
  const request = normalizeShopifyBuyerRequest(raw), requestHash = digest(request);
  mkdirSync(directory,{recursive:true,mode:0o700});
  const file = name => path.join(directory,`${name}.json`), lock = fn => locked(digest({directory,requestHash}),fn);
  writeOnce(file('binding'), { schema:'outsider/shopify-ucp-buyer/v1',request,requestHash });
  let receiptName;
  const client = createShopifyUcpClient({ origin:request.storeUrl,profileUrl:request.profileUrl,fetchImpl,clock,orderAccess,checkoutAccess,
    onReceipt: receipt => writeOnce(file(receiptName),receipt) });
  const stats = () => readdirSync(directory).filter(n=>/^receipt-.*\.json$/u.test(n)).reduce((m,n)=>{
    const r=read(path.join(directory,n));m.nativeRequests++;m.responseBodyBytes+=r.bodyBytes;return m;
  },{nativeRequests:0,responseBodyBytes:0});
  async function call(name,payload,step) {
    receiptName = `receipt-${step ?? randomUUID()}`;
    if (step && existsSync(file(receiptName))) return ucpResponseValue(Buffer.from(read(file(receiptName)).bodyBase64,'base64'));
    let key=randomUUID();
    if (step) {
      if (existsSync(file(`${step}-attempt`))) fail('UCP_OPERATION_UNKNOWN_INSPECT_REQUIRED');
      writeOnce(file(`${step}-attempt`),{tool:name,requestHash:digest(payload),idempotencyKey:key,at:clock()});
    }
    return client.call(name,payload,key);
  }
  const base = value => ({ schema:'outsider/native-retail-preparation/v2',protocol:SHOPIFY_BUYER_PROTOCOL,requestHash,
    origin:request.storeUrl,paymentPerformed:false,sellerOrderAccepted:false,stockReserved:false,
    deliveryDeadlineAccepted:false,deliveryEta:null,resultPromiseIssued:false,
    nativeZeroTotalCompletionImplemented:true,nativeCheckoutConnectionConfigured:!!checkoutAccess,
    merchantCompletionEligibility:'REQUIRES_PROVIDER_ACCEPTANCE',...value,metrics:stats() });
  const effectiveRequest=()=>existsSync(file('quote-address-authorization'))
    ?{...request,quoteAddress:read(file('quote-address-authorization')).address}:request;
  async function prepare() {
    if (existsSync(file('prepared'))) return {...read(file('prepared')),metrics:stats()};
    const began=Date.now();
    let cart=await call('create_cart',{cart:{line_items:[{item:{id:request.variantId},quantity:request.quantity}],
      context:{address_country:request.country,currency:request.currency},
      ...(request.quoteAddress?{fulfillment:{methods:[{type:'shipping',destinations:[request.quoteAddress]}]}}:{})}},'cart-create');
    if(typeof cart.id==='string'&&cart.id.startsWith('gid://shopify/'))writeOnce(file('cart-session'),{id:cart.id});
    projection(cart,request);
    cart=await call('get_cart',{id:cart.id},'cart-readback');
    let current=projection(cart,request),checkout=null;
    if (request.quoteAddress && BigInt(current.price.totalAmountMinor)<=BigInt(request.maximumTotalMinor)) {
      checkout=await call('create_checkout',{cart_id:cart.id},'checkout-create');
      // isError can accompany a valid allocated checkout requiring buyer input.
      if(typeof checkout.id==='string'&&checkout.id.startsWith('gid://shopify/'))writeOnce(file('checkout-session'),{id:checkout.id});
      projection(checkout,request);
      checkout=await call('get_checkout',{id:checkout.id},'checkout-readback');current=projection(checkout,request);
    }
    const state=BigInt(current.price.totalAmountMinor)>BigInt(request.maximumTotalMinor)?'BUDGET_EXCEEDED'
      :checkout?'CHECKOUT_QUOTED_NOT_ORDERED':request.quoteAddress?'ADDRESS_CART_QUOTED_NOT_ORDERED':'CART_AWAITING_DELIVERY_QUOTE';
    const result=base({state,cart:current,product:{productId:request.variantId,name:current.items[0].name,productUrl:null},
      quoteHash:digest(current),cartRefHash:digest(cart.id),checkoutRefHash:checkout?digest(checkout.id):null,
      checkoutStatus:checkout?.status??null,checkoutPrepared:!!checkout,checkoutReady:checkout?.status==='ready_for_complete',
      checkoutRequirements:current.errors,expiresAt:checkout?.expires_at??cart.expires_at??null,
      postedAddressFields:request.quoteAddress?Object.keys(request.quoteAddress):[],privateContactSent:false,
      userMerchantAccountRequired:false,merchantAccountCreated:false,preparedAt:clock(),elapsedMs:Date.now()-began});
    writeOnce(file('product'),{id:request.variantId,name:current.items[0].name});writeOnce(file('prepared'),result);return result;
  }
  async function inspect() {
    if(existsSync(file('order-reference')))return readOrder();
    if(existsSync(file('cleared')))return base(read(file('cleared')));
    const checkout=existsSync(file('checkout-session')), identity=checkout?'checkout-session':'cart-session';
    if(!existsSync(file(identity)))return base({state:'NOT_PREPARED'});
    const v=await call(checkout?'get_checkout':'get_cart',{id:read(file(identity)).id});
    if(checkout&&v.status==='completed')return attachCompletedCheckout(v);
    const current=projection(v,effectiveRequest());
    return base({state:checkout?'CHECKOUT_PRESENT_NOT_ORDERED':'CART_PRESENT',cart:current,
      checkoutRequirements:current.errors,checkoutStatus:v.status??null});
  }
  async function quoteDelivery(address) {
    normalizeShopifyBuyerRequest({...request,quoteAddress:address});
    if(existsSync(file('cleared'))||!existsSync(file('cart-session')))fail('UCP_ACTIVE_CART_REQUIRED');
    writeOnce(file('quote-address-authorization'),{requestHash,origin:request.storeUrl,address,
      scope:'THIS_GUEST_CART_DELIVERY_QUOTATION_NO_CONTACT_OR_PAYMENT'});
    if(existsSync(file('delivery-quote')))return {...read(file('delivery-quote')),metrics:stats()};
    if(existsSync(file('checkout-session')))fail('UCP_EXISTING_CHECKOUT_ALREADY_QUOTED');
    const identity=read(file('cart-session'));
    let cart=await call('get_cart',{id:identity.id},'quote-cart-read');projection(cart,request);
    // update_cart is full replacement, not a patch. This is the Node's own
    // single-item guest cart; explicitly carry all its requested line items.
    cart=await call('update_cart',{id:identity.id,cart:{
      line_items:cart.line_items.map(l=>({id:l.id,item:{id:l.item.id},quantity:l.quantity})),
      context:{address_country:request.country,currency:request.currency},
      fulfillment:{methods:[{type:'shipping',line_item_ids:cart.line_items.map(l=>l.id),destinations:[address]}]}
    }},'quote-cart-update');
    let current=projection(cart,effectiveRequest()),checkout=null;
    if(BigInt(current.price.totalAmountMinor)<=BigInt(request.maximumTotalMinor)){
      checkout=await call('create_checkout',{cart_id:cart.id},'quote-checkout-create');
      if(typeof checkout.id==='string'&&checkout.id.startsWith('gid://shopify/'))writeOnce(file('checkout-session'),{id:checkout.id});
      projection(checkout,effectiveRequest());
      checkout=await call('get_checkout',{id:checkout.id},'quote-checkout-readback');current=projection(checkout,effectiveRequest());
    }
    const overBudget=BigInt(current.price.totalAmountMinor)>BigInt(request.maximumTotalMinor);
    const quote=base({state:overBudget?'BUDGET_EXCEEDED':checkout?'CHECKOUT_QUOTED_NOT_ORDERED':'ADDRESS_CART_QUOTED_NOT_ORDERED',
      cart:current,quoteHash:digest(current),checkoutStatus:checkout?.status??null,checkoutReady:checkout?.status==='ready_for_complete',
      checkoutRequirements:current.errors,postedAddressFields:Object.keys(address),privateContactSent:false,
      expiresAt:checkout?.expires_at??cart.expires_at??null,observedAt:clock(),
      ...(overBudget?{cleanup:await clear()}:{})});
    writeOnce(file('delivery-quote'),quote);return quote;
  }
  async function clear() {
    if(existsSync(file('order-reference')))fail('UCP_ORDER_ALREADY_BOUND');
    if(existsSync(file('cleared')))return base(read(file('cleared')));
    if(!existsSync(file('cart-session')))return base({state:'NO_CART_TO_CLEAR'});
    // cancel_cart invalidates its converted checkout as well. Read back both;
    // a retained line-item snapshot in the cancel response is not a live cart.
    const cart=read(file('cart-session'));
    try{await call('cancel_cart',{id:cart.id},'cart-cancel');}catch(e){if(!['UCP_CART_NOT_FOUND','UCP_CHECKOUT_NOT_FOUND'].includes(e.code))throw e;}
    let retired=false;
    try{await call('get_cart',{id:cart.id});}catch(e){if(['UCP_CART_NOT_FOUND','UCP_CHECKOUT_NOT_FOUND'].includes(e.code))retired=true;else throw e;}
    if(existsSync(file('checkout-session'))){
      try{const v=await call('get_checkout',{id:read(file('checkout-session')).id});retired=retired&&v.status==='canceled';}
      catch(e){if(!['UCP_CHECKOUT_NOT_FOUND','UCP_CART_NOT_FOUND'].includes(e.code))throw e;}
    }
    const result={state:retired?'CART_CANCELLED':'CART_CANCELLATION_UNCONFIRMED',checkoutCancelledWithCart:retired&&existsSync(file('checkout-session')),
      sellerOrderCancelled:false,checkedAt:clock()};
    if(retired)writeOnce(file('cleared'),result);return base(result);
  }
  async function observeOrder(reference, event = null) {
    if (!orderAccess && !event) fail('UCP_ORDER_ACCESS_NOT_CONNECTED');
    if (!existsSync(file('checkout-session'))) fail('UCP_OWN_CHECKOUT_REQUIRED');
    const step = `order-read-${randomUUID()}`;
    const order = event?.order ?? await call('get_order',{id:reference.orderId},step);
    if ((order.messages??[]).some(m=>m.type==='error'))fail('UCP_ORDER_READ_REJECTED');
    const identity = id => typeof id === 'string' ? id.split('?')[0] : null;
    const line = order.line_items?.[0], address = effectiveRequest().quoteAddress;
    if (order.id !== reference.orderId || identity(order.checkout_id)!==identity(read(file('checkout-session')).id)
      || order.currency !== request.currency || order.line_items?.length !== 1
      || line.item?.id !== request.variantId || line.quantity?.original !== request.quantity
      || line.quantity?.total !== request.quantity || total(order,'total')===null)fail('UCP_ORDER_BINDING_MISMATCH');
    const destination = order.fulfillment?.expectations?.find(e=>e.method_type==='shipping'
      && e.line_items?.some(l=>l.id===line.id&&l.quantity===request.quantity))?.destination;
    if (!address || destination?.address_country !== address.address_country
      || clean(destination?.postal_code).replace(/[ -]/gu,'').toUpperCase() !== clean(address.postal_code).replace(/[ -]/gu,'').toUpperCase()) fail('UCP_ORDER_DESTINATION_MISMATCH');
    const receipt = event ? {...event.receipt,observedAt:clock()} : read(file(`receipt-${step}`)), amount = total(order,'total');
    // Order MCP exposes totals, items, fulfillment and adjustments, not a
    // definitive amount-due field. A nonzero order read is NOT proof of payment.
    const observed = base({schema:'outsider/native-retail-order/v2',state:'SELLER_ORDER_OBSERVED',
      orderRefHash:digest({origin:request.storeUrl,id:order.id}),sellerOrderAccepted:
        ['unfulfilled','fulfilled','partially_fulfilled'].includes(line.status) && !(order.adjustments??[]).length
          && receipt.topic!=='orders/delete',
      sellerOrderStatus:line.status==='fulfilled'?'completed':'processing',needsPayment:amount==='0'?false:null,
      paymentStatus:amount==='0'?'ZERO_TOTAL_ORDER':'NOT_RETURNED_BY_ORDER_CAPABILITY',
      acquisitionSource:event?'NATIVE_AGENT_ORDER_WEBHOOK':'NATIVE_AGENT_ORDER_READ',
      outsiderCreatedOrder:existsSync(file('zero-total-order-submitted')),paymentPerformed:false,
      ...(existsSync(file('zero-total-order-submitted'))?{checkoutPlanHash:read(file('zero-total-order-submitted')).planHash}:{}),
      totalAmountMinor:amount,currency:order.currency,physicalDeliveryStatus:'NOT_INDEPENDENTLY_OBSERVED',
      orderCompletedIsDeliveryProof:false,fulfillmentEventCount:order.fulfillment?.events?.length??0,
      receipt:{source:event?'SHOPIFY_UCP_ORDER_WEBHOOK':'SHOPIFY_UCP_ORDER_API',observedAt:receipt.observedAt,
        ...(event?{triggeredAt:receipt.triggeredAt,deliveryIdHash:digest(receipt.deliveryId),signatureVerified:true}: {httpStatus:receipt.httpStatus}),
        bodyBytes:receipt.bodyBytes,bodyHash:receipt.bodyHash,receiptHash:digest(receipt)}});
    // Keep the merchant's item -> shipment reference private. A shipped or
    // delivered merchant event supplies routing, not independent delivery truth.
    const shipments=new Map((order.fulfillment?.events??[]).filter(e=>['shipped','delivered'].includes(e.type)
      && e.line_items?.some(l=>l.id===line.id&&l.quantity===request.quantity)
      && /^[A-Za-z0-9][A-Za-z0-9 -]{3,79}$/u.test(e.tracking_number??''))
      .map(e=>[e.tracking_number,{number:e.tracking_number,carrier:null,orderRefHash:observed.orderRefHash,
        source:'MERCHANT_BUYER_ORDER_API',sourceReceiptHash:observed.receipt.receiptHash}]));
    if(!event&&shipments.size===1&&!existsSync(file('shipment-reference')))writeOnce(file('shipment-reference'),[...shipments.values()][0]);
    if(!event)writeOnce(file(`order-observation-${randomUUID()}`),observed);return observed;
  }
  const eventDirectory=path.join(directory,'order-events');
  function currentEvent(){
    if(!existsSync(eventDirectory))return null;
    return readdirSync(eventDirectory).filter(n=>/^[a-f0-9]{64}\.json$/u.test(n)).map(n=>{
      const stored=read(path.join(eventDirectory,n));
      return {...stored,order:stored.order??JSON.parse(Buffer.from(stored.bodyBase64,'base64'))};
    })
      .sort((a,b)=>BigInt(a.receipt.sourceSequence)<BigInt(b.receipt.sourceSequence)?-1:
        BigInt(a.receipt.sourceSequence)>BigInt(b.receipt.sourceSequence)?1:a.receipt.deliveryId.localeCompare(b.receipt.deliveryId)).at(-1)??null;
  }
  function currentShipment(){
    const event=currentEvent();if(!event)return {eventPresent:false,reference:null};
    const line=event.order.line_items[0];
    const shipments=new Map((event.order.fulfillment?.events??[]).filter(e=>['shipped','delivered'].includes(e.type)
      &&e.line_items?.some(l=>l.id===line.id&&l.quantity===request.quantity)
      &&/^[A-Za-z0-9][A-Za-z0-9 -]{3,79}$/u.test(e.tracking_number??''))
      .map(e=>[e.tracking_number,{number:e.tracking_number,carrier:null,orderRefHash:event.observation.orderRefHash,
        source:'MERCHANT_BUYER_ORDER_API',sourceReceiptHash:event.observation.receipt.receiptHash}]));
    return {eventPresent:true,reference:shipments.size===1?[...shipments.values()][0]:null};
  }
  async function acceptVerifiedOrderEvent(event){
    if(event?.receipt?.source!=='SHOPIFY_UCP_ORDER_WEBHOOK'||event.receipt.signatureVerified!==true)fail('UCP_VERIFIED_WEBHOOK_REQUIRED');
    if(existsSync(file('order-reference'))&&read(file('order-reference')).orderId!==event.order.id)fail('UCP_ORDER_ALREADY_BOUND');
    const target=path.join(eventDirectory,`${digest(event.receipt.deliveryId).slice(7)}.json`);
    if(existsSync(target)){
      if(read(target).receipt.bodyHash!==event.receipt.bodyHash)fail('UCP_WEBHOOK_DELIVERY_CONFLICT');
      return {state:'ORDER_EVENT_DUPLICATE',changed:false};
    }
    const previous=currentEvent();
    // Even an older signed snapshot must match this original checkout before
    // entering its history. It never replaces a newer merchant state.
    const observation=await observeOrder({orderId:event.order.id},event);
    const newer=!previous||BigInt(event.receipt.sourceSequence)>BigInt(previous.receipt.sourceSequence);
    if(previous&&event.receipt.sourceSequence===previous.receipt.sourceSequence
      &&(event.receipt.bodyHash!==previous.receipt.bodyHash||event.receipt.topic!==previous.receipt.topic))
      fail('UCP_WEBHOOK_SAME_TIME_CONFLICT_RECONCILIATION_REQUIRED');
    mkdirSync(eventDirectory,{recursive:true,mode:0o700});
    // Store exact source bytes once, not twice as both base64 and parsed JSON.
    // A maximum-size native snapshot must remain readable by the Node store.
    writeOnce(target,{bodyBase64:event.bodyBase64,receipt:event.receipt,observation});
    writeOnce(file('order-reference'),{orderId:event.order.id});
    return {state:newer?'ORDER_EVENT_APPLIED':'ORDER_EVENT_OLDER_THAN_CURRENT',changed:newer,
      orderRefHash:observation.orderRefHash,order:newer?observation:previous.observation};
  }
  async function attachCompletedCheckout(checkout) {
    const identity=id=>typeof id==='string'?id.split('?')[0]:null;
    if(!existsSync(file('checkout-session'))||checkout.status!=='completed'
      ||identity(checkout.id)!==identity(read(file('checkout-session')).id)
      ||!/^gid:\/\/shopify\/Order\/[1-9][0-9]*$/u.test(checkout.order?.id??''))fail('UCP_COMPLETED_CHECKOUT_REFERENCE_INVALID');
    // Completed checkout payloads need not retain cart line_items or totals.
    // get_order binds the referenced purchase to this exact item/destination.
    return attachOrder({orderId:checkout.order.id});
  }
  async function readOrder({preferWebhook=false}={}) {
    if(preferWebhook){const event=currentEvent();if(event)return event.observation;}
    if(!existsSync(file('order-reference'))){
      if(existsSync(file('cleared'))||!existsSync(file('checkout-session')))fail('UCP_NO_SUBMITTED_ORDER');
      const checkout=await call('get_checkout',{id:read(file('checkout-session')).id});
      if(checkout.status!=='completed')fail('UCP_CHECKOUT_NOT_COMPLETED');
      return attachCompletedCheckout(checkout);
    }
    return observeOrder(read(file('order-reference')));
  }
  async function attachOrder(reference) {
    if(!reference || Object.keys(reference).join(',')!=='orderId'
      || !/^gid:\/\/shopify\/Order\/[1-9][0-9]*$/u.test(reference.orderId??''))fail('UCP_ORDER_REFERENCE_INVALID');
    if(existsSync(file('order-reference')) && read(file('order-reference')).orderId!==reference.orderId)fail('UCP_ORDER_ALREADY_BOUND');
    const result=await observeOrder(reference);writeOnce(file('order-reference'),reference);return result;
  }
  const planFile=hash=>{
    if(!/^sha256:[a-f0-9]{64}$/u.test(hash??''))fail('RETAIL_CHECKOUT_PLAN_HASH_INVALID');
    return file(`zero-total-plan-${hash.slice(7)}`);
  };
  function checkoutPlan(hash){
    const plan=read(planFile(hash)),{planHash,...body}=plan;
    if(planHash!==hash||digest(body)!==hash||plan.requestHash!==requestHash)fail('RETAIL_CHECKOUT_PLAN_MISMATCH');
    return plan;
  }
  const publicPlan=plan=>({schema:plan.schema,planHash:plan.planHash,requestHash,quoteHash:plan.quoteHash,
    merchantOrigin:request.storeUrl,currency:request.currency,totalAmountMinor:'0',expiresAt:plan.expiresAt,
    contactRefHash:plan.contactRefHash,terms:plan.terms,createAccount:false,paymentInstrumentRequired:false,
    purchaseSubmitted:false,merchantCompletionEligibility:'NOT_ESTABLISHED_BY_LOCAL_PLAN'});
  function zeroCheckout(value){
    projection(value,effectiveRequest());
    if(total(value,'total')!=='0'||value.payment?.selected_instrument_id||value.payment?.instruments?.length)
      fail('RETAIL_ZERO_TOTAL_REQUIRED_PAID_EXECUTION_NOT_ENABLED');
    if(value.status!=='ready_for_complete'||(value.messages??[]).some(m=>m.type==='error'))
      fail('UCP_CHECKOUT_NOT_READY_FOR_NATIVE_COMPLETION');
    return digest({id:value.id,currency:value.currency,lineItems:value.line_items,buyer:value.buyer??null,
      fulfillment:value.fulfillment??null,totals:value.totals,links:value.links??[]});
  }
  async function planZeroTotalCheckout(command){
    if(Object.keys(command??{}).sort().join(',')!=='billingAddress,shippingAddress')fail('RETAIL_ZERO_TOTAL_PLAN_INPUT_INVALID');
    const address=effectiveRequest().quoteAddress;
    if(!address||!existsSync(file('checkout-session'))||existsSync(file('cleared'))||existsSync(file('order-reference')))
      fail('RETAIL_ACTIVE_UNPURCHASED_CART_REQUIRED');
    if(!checkoutAccess||!orderAccess)fail('UCP_NATIVE_CHECKOUT_AND_ORDER_CONNECTION_REQUIRED');
    const mapping={address_1:'street_address',city:'address_locality',state:'address_region',postcode:'postal_code',country:'address_country'};
    for(const [kind,contact] of Object.entries(command)){
      const allowed=['first_name','last_name','address_1','address_2','city','state','postcode','country',...(kind==='billingAddress'?['email']:[])];
      if(!contact||Object.keys(contact).some(k=>!allowed.includes(k))||Object.values(contact).some(v=>typeof v!=='string'||v.length>254||/[\r\n\0]/u.test(v))
        ||!contact.first_name?.trim()||Object.entries(mapping).some(([k,v])=>clean(contact[k]).toUpperCase()!==clean(address[v]).toUpperCase())
        ||contact.address_2?.trim())fail('RETAIL_ZERO_TOTAL_ADDRESS_INVALID');
    }
    const buyer={email:command.billingAddress.email};
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(buyer.email??''))fail('RETAIL_ZERO_TOTAL_EMAIL_REQUIRED');
    // Do not send contact if the order lifecycle cannot be read by this agent.
    await orderAccess.token(); await checkoutAccess.token();
    const identity=read(file('checkout-session')).id;
    let current=await call('get_checkout',{id:identity});projection(current,effectiveRequest());
    if(total(current,'total')!=='0'||current.payment?.selected_instrument_id||current.payment?.instruments?.length)
      fail('RETAIL_ZERO_TOTAL_REQUIRED_PAID_EXECUTION_NOT_ENABLED');
    const destination={...address,first_name:command.shippingAddress.first_name,last_name:command.shippingAddress.last_name??''};
    // update_checkout replaces the payload, so preserve the exact line and
    // selected fulfillment option while adding only the authorized contact.
    const methods=(current.fulfillment?.methods??[]).filter(m=>m.type==='shipping').map(m=>({
      ...(m.id?{id:m.id}:{}),type:'shipping',line_item_ids:current.line_items.map(l=>l.id),destinations:[destination],
      ...(m.groups?{groups:m.groups.map(g=>({id:g.id,selected_option_id:g.selected_option_id}))}:{})}));
    if(methods.length!==1)fail('UCP_SHIPPING_METHOD_REQUIRED');
    await call('update_checkout',{id:identity,checkout:{line_items:current.line_items.map(l=>({id:l.id,item:{id:l.item.id},quantity:l.quantity})),
      buyer,fulfillment:{methods}}});
    current=await call('get_checkout',{id:identity});
    const quoteHash=zeroCheckout(current);
    if(current.buyer?.email!==buyer.email)fail('UCP_CHECKOUT_CONTACT_NOT_ACCEPTED');
    const terms=(current.links??[]).map(link=>({type:link.type,url:link.url}));
    for(const link of terms){let u;try{u=new URL(link.url);}catch{}if(!u||u.protocol!=='https:'||u.username||u.password)fail('UCP_CHECKOUT_TERMS_INVALID');}
    const now=clock(),expires=Math.min(Date.parse(now)+30*60000,current.expires_at?Date.parse(current.expires_at):Infinity);
    if(!Number.isFinite(expires)||expires<=Date.parse(now))fail('RETAIL_CHECKOUT_PLAN_EXPIRED');
    const body={schema:'outsider/zero-total-native-checkout-plan/v1',requestHash,quoteHash,checkoutId:identity,
      contactRefHash:digest(command),terms,createdAt:now,expiresAt:new Date(expires).toISOString(),maximumAmountMinor:'0',currency:request.currency};
    const plan={...body,planHash:digest(body)};writeOnce(planFile(plan.planHash),plan);return publicPlan(plan);
  }
  async function submitZeroTotalCheckout(hash){
    const plan=checkoutPlan(hash),submitted=file('zero-total-order-submitted'),attempt=file('checkout-complete-attempt');
    if(existsSync(submitted)){
      if(read(submitted).planHash!==hash)fail('RETAIL_CHECKOUT_PLAN_ALREADY_BOUND');
      return readOrder();
    }
    if(existsSync(file('cleared')))fail('RETAIL_ACTIVE_UNPURCHASED_CART_REQUIRED');
    if(!checkoutAccess||!orderAccess)fail('UCP_NATIVE_CHECKOUT_AND_ORDER_CONNECTION_REQUIRED');
    const current=await call('get_checkout',{id:plan.checkoutId});
    // An uncertain write is reconciled through the original checkout, never
    // retried as a new order. The plan and its idempotency key stay bound.
    if(existsSync(attempt)){
      const intent=read(attempt);
      if(intent.planHash!==hash)fail('RETAIL_CHECKOUT_PLAN_ALREADY_BOUND');
      if(current.status!=='completed')fail('UCP_COMPLETION_UNRESOLVED_INSPECT_REQUIRED');
    }else{
      if(existsSync(file('order-reference')))fail('UCP_ORDER_ALREADY_BOUND');
      if(Date.parse(clock())>=Date.parse(plan.expiresAt))fail('RETAIL_CHECKOUT_PLAN_EXPIRED');
      if(zeroCheckout(current)!==plan.quoteHash)fail('RETAIL_CHECKOUT_PRICE_OR_ITEMS_CHANGED');
      await orderAccess.token(); await checkoutAccess.token();
      const key=randomUUID();writeOnce(attempt,{planHash:hash,idempotencyKey:key,checkoutId:plan.checkoutId,at:clock()});
      receiptName='receipt-checkout-complete';
      await client.call('complete_checkout',{id:plan.checkoutId,checkout:{}},key);
    }
    // Native order read, not a server ACK, establishes item/price/destination.
    const completed=await call('get_checkout',{id:plan.checkoutId});
    const order=await attachCompletedCheckout(completed);
    if(!order.sellerOrderAccepted||order.totalAmountMinor!=='0'||order.needsPayment!==false)
      fail('RETAIL_ZERO_TOTAL_ORDER_NOT_CONFIRMED');
    writeOnce(submitted,{planHash:hash,orderRefHash:order.orderRefHash,submittedAt:clock()});
    return {...order,outsiderCreatedOrder:true,checkoutPlanHash:hash};
  }
  return {prepare:()=>lock(prepare),inspect:()=>lock(inspect),clear:()=>lock(clear),metrics:stats,
    planZeroTotalCheckout:command=>lock(()=>planZeroTotalCheckout(command)),
    readZeroTotalCheckoutPlan:hash=>publicPlan(checkoutPlan(hash)),
    submitZeroTotalCheckout:hash=>lock(()=>submitZeroTotalCheckout(hash)),
    quoteDelivery:address=>lock(()=>quoteDelivery(address)),
    readOrder:options=>lock(()=>readOrder(options)),attachOrder:reference=>lock(()=>attachOrder(reference)),
    currentShipment,
    acceptVerifiedOrderEvent:event=>lock(()=>acceptVerifiedOrderEvent(event))};
}
