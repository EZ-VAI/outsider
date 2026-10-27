import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRetailTransactionService } from '../src/outsider-retail-transaction-service.js';
import { retailFulfillmentStore, prepareRetailFulfillmentPart } from '../src/outsider-retail-fulfillment-fragment.js';
import { createShopifyOrderAccess } from '../src/outsider-shopify-platform-connection.js';
import { writePrivateExecutionRecordOnce as writeOnce } from '../src/outsider-user-held-durable-execution-v2.js';
const profileUrl='https://platform.example/.well-known/ucp';
const request={protocol:'SHOPIFY_UCP_V1',requestId:'native-order-test',storeUrl:'https://seller.example',
  variantId:'gid://shopify/ProductVariant/123',quantity:1,country:'US',currency:'USD',maximumTotalMinor:'2000',profileUrl,
  quoteAddress:{street_address:'Private test address',address_locality:'Private city',address_region:'MA',postal_code:'12345',address_country:'US'}};
function fixture(){
  let wrong=false,total=1900,completed=false,shipped=false;const calls=[];
  const checkoutId='gid://shopify/Checkout/345?key=private-checkout',orderId='gid://shopify/Order/456';
  const access={token:async()=>'test-order-token',profileUrl:()=>profileUrl};
  const fetchImpl=async(url,options)=>{
    const {params:{name,arguments:args}}=JSON.parse(options.body);calls.push({name,args,headers:options.headers});
    const order=name==='get_order';
    const value=order?{id:orderId,checkout_id:wrong?'gid://shopify/Checkout/999':checkoutId,currency:'USD',
      totals:[{type:'total',amount:total}],line_items:[{id:'order-line',item:{id:request.variantId},quantity:{original:1,total:1,fulfilled:0},status:'unfulfilled'}],
      fulfillment:{expectations:[{method_type:'shipping',line_items:[{id:'order-line',quantity:1}],destination:request.quoteAddress}],events:shipped?[{
        id:'shipment-event',type:'shipped',tracking_number:'FIXTURE-TRACKING-NUMBER',carrier:'Fixture carrier',line_items:[{id:'order-line',quantity:1}]}]:[]}}
      :completed&&name==='get_checkout'?{id:checkoutId,status:'completed',order:{id:orderId}}
      :{id:name.includes('checkout')?checkoutId:'gid://shopify/Cart/234?key=private-cart',currency:'USD',status:'requires_escalation',
        line_items:[{id:'cart-line',item:{id:request.variantId,title:'Test item',price:900},quantity:1}],totals:[{type:'total',amount:1900}]};
    return Response.json({result:{structuredContent:value}});
  };
  return {fetchImpl,access,calls,orderId,setWrong:v=>wrong=v,setTotal:v=>total=v,setCompleted:v=>completed=v,setShipped:v=>shipped=v};
}
test('prepared native checkout binds an order through the same service and fulfillment factory, without passing checkout secrets to the client',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'outsider-order-')),f=fixture();
  const service=createRetailTransactionService({directory:path.join(root,'retail-transactions'),ucpFetchFactory:()=>f.fetchImpl,orderAccess:f.access});
  const prepared=await service.prepare(request);
  const order=await service.bindOrder(prepared.transactionId,{orderId:f.orderId});
  assert.equal(order.sellerOrderAccepted,true);assert.equal(order.needsPayment,null);
  assert.equal(order.paymentStatus,'NOT_RETURNED_BY_ORDER_CAPABILITY');
  assert.doesNotMatch(JSON.stringify(order),/private-checkout|private-cart|Private test address|12345|test-order-token/);
  const deps={ucpFetchFactory:()=>f.fetchImpl,orderAccess:f.access};
  const store=retailFulfillmentStore(root,prepared.transactionId,deps);
  assert.equal((await store.readOrder()).orderRefHash,order.orderRefHash);
  assert.equal((await prepareRetailFulfillmentPart({id:'item',input:{transactionId:prepared.transactionId},nodeDirectory:root},deps)).unavailable,'NATIVE_PAID_ACCEPTED_ORDER_REQUIRED');
  f.setTotal(0);
  const part=await prepareRetailFulfillmentPart({id:'item',input:{transactionId:prepared.transactionId},nodeDirectory:root},
    {...deps,shipmentConnectionStatus:()=>({connected:true})});
  assert.equal(part.category,'RETAIL_FULFILLMENT');assert.equal(part.order.needsPayment,false);
  await assert.rejects(service.orderFollowup(prepared.transactionId,{action:'WATCH',until:'2026-09-12T00:00:00.000Z'}),/WEBHOOK_CONNECTION_REQUIRED/);
  assert.ok(f.calls.filter(c=>c.name==='get_order').every(c=>c.headers.Authorization==='Bearer test-order-token'));
  assert.ok(f.calls.filter(c=>c.name!=='get_order').every(c=>!c.headers.Authorization));
  assert.ok(f.calls.every(c=>c.name!=='complete_checkout'));await service.close();
});
test('an order from a different checkout cannot become this task order',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'outsider-order-bind-')),f=fixture();
  const service=createRetailTransactionService({directory:root,ucpFetchFactory:()=>f.fetchImpl,orderAccess:f.access});
  const p=await service.prepare(request);f.setWrong(true);
  await assert.rejects(service.bindOrder(p.transactionId,{orderId:f.orderId}),/ORDER_BINDING_MISMATCH/);await service.close();
});
test('completed checkout automatically supplies its order and merchant shipment reference, without manual IDs or payment inference',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'outsider-auto-order-')),f=fixture();
  const service=createRetailTransactionService({directory:path.join(root,'retail-transactions'),ucpFetchFactory:()=>f.fetchImpl,orderAccess:f.access});
  const p=await service.prepare(request);
  await assert.rejects(service.bindOrder(p.transactionId),/UCP_CHECKOUT_NOT_COMPLETED/);
  f.setCompleted(true);f.setShipped(true);
  const order=await service.bindOrder(p.transactionId);
  assert.equal(order.sellerOrderAccepted,true);assert.equal(order.needsPayment,null);
  const store=retailFulfillmentStore(root,p.transactionId,{ucpFetchFactory:()=>f.fetchImpl,orderAccess:f.access});
  assert.equal(store.shipment().number,'FIXTURE-TRACKING-NUMBER');assert.equal(store.shipment().carrier,null);
  assert.equal(store.shipment().source,'MERCHANT_BUYER_ORDER_API');
  assert.equal(store.shipment().orderRefHash,order.orderRefHash);
  assert.doesNotMatch(JSON.stringify(order),/FIXTURE-TRACKING-NUMBER|private-checkout|Private test address|test-order-token/);
  assert.ok(f.calls.every(c=>c.name!=='complete_checkout'));await service.close();
});
test('platform connection exchanges credentials once, refreshes expiring access, and keeps secrets out of status',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'outsider-platform-'));mkdirSync(path.join(root,'connections'));
  const credentialsFile=path.join(root,'credentials.json');writeOnce(credentialsFile,{clientId:'fixture-client',clientSecret:'fixture-secret'});
  writeOnce(path.join(root,'connections','shopify-order-access.json'),{schema:'outsider/shopify-order-access/v1',credentialsFile,profileUrl});
  let now=Date.now(),calls=0;
  const connection=createShopifyOrderAccess({nodeDirectory:root,clock:()=>now,fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://api.shopify.com/auth/access_token');assert.equal(options.redirect,'error');
    return Response.json({access_token:'fixture-token',expires_in:3600,scope:'read_global_api_orders'});
  }});
  await connection.token();await connection.token();assert.equal(calls,1);
  now+=3600000;await connection.token();assert.equal(calls,2);
  assert.deepEqual(connection.status(),{configured:true,liveOrderAccessVerified:false,paymentToolEnabled:false,userMerchantRegistrationRequired:false});
});
