import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRetailTransactionService} from '../src/outsider-retail-transaction-service.js';
import {retailFulfillmentStore} from '../src/outsider-retail-fulfillment-fragment.js';

const address={street_address:'Fixture street',address_locality:'Fixture city',address_region:'MA',postal_code:'00000',address_country:'US'};
const shippingAddress={first_name:'Fixture',last_name:'Buyer',address_1:address.street_address,city:address.address_locality,state:'MA',postcode:'00000',country:'US'};
const billingAddress={...shippingAddress,email:'buyer@example.org'};
const request={protocol:'SHOPIFY_UCP_V1',requestId:'native-zero-checkout',storeUrl:'https://seller.example',
  variantId:'gid://shopify/ProductVariant/123',quantity:1,country:'US',currency:'USD',maximumTotalMinor:'0',
  profileUrl:'https://agent.example/.well-known/ucp',quoteAddress:address};
async function fixture(){
  const root=mkdtempSync(path.join(tmpdir(),'outsider-shopify-complete-')),calls=[];
  let price=0,buyer=null,completed=false,loseResponse=false,contactAccepted=true;
  const checkoutId='gid://shopify/Checkout/abc?key=private',orderId='gid://shopify/Order/456';
  const access={token:async()=>'fixture-only-token',profileUrl:()=>request.profileUrl};
  const checkout=()=>({id:checkoutId,currency:'USD',status:completed?'completed':buyer?'ready_for_complete':'requires_escalation',
    line_items:[{id:'line-1',item:{id:request.variantId,title:'Fixture free item',price},quantity:1}],
    totals:[{type:'total',amount:price}],buyer,payment:{instruments:[]},
    fulfillment:{methods:[{id:'shipping-1',type:'shipping',line_item_ids:['line-1'],destinations:[address],
      groups:[{id:'group-1',selected_option_id:'zero-shipping',options:[{id:'zero-shipping',title:'Shipping',totals:[{type:'total',amount:0}]}]}]}]},
    links:[{type:'terms_of_service',url:'https://seller.example/terms'}],
    ...(completed?{order:{id:orderId}}:{})});
  const fetchImpl=async(url,options)=>{
    const {params:{name,arguments:args}}=JSON.parse(options.body);calls.push({name,args});
    if(name==='create_checkout'){assert.equal(args.cart_id,'gid://shopify/Cart/abc');assert.equal(args.checkout,undefined);}
    if(name.includes('checkout'))assert.equal(options.headers.Authorization,'Bearer fixture-only-token');
    if(name==='update_checkout'){if(contactAccepted)buyer=args.checkout.buyer;assert.equal(args.checkout.line_items[0].item.id,request.variantId);}
    if(name==='complete_checkout'){
      assert.deepEqual(args.checkout,{});assert.match(args.meta['idempotency-key'],/^[a-f0-9-]{36}$/u);completed=true;
      if(loseResponse)throw new Error('fixture-network-response-lost');
    }
    if(name==='get_order')return Response.json({result:{structuredContent:{id:orderId,checkout_id:checkoutId,currency:'USD',
      line_items:[{id:'line-1',item:{id:request.variantId},quantity:{original:1,total:1},status:'unfulfilled'}],
      totals:[{type:'total',amount:price}],fulfillment:{expectations:[{method_type:'shipping',line_items:[{id:'line-1',quantity:1}],destination:address}]}}}});
    const value=checkout();if(name.includes('cart'))value.id='gid://shopify/Cart/abc';
    return Response.json({result:{structuredContent:value}});
  };
  const dependencies={ucpFetchFactory:()=>fetchImpl,orderAccess:access,checkoutAccess:access};
  const service=createRetailTransactionService({directory:path.join(root,'retail-transactions'),...dependencies});
  const p=await service.prepare(request);
  return {root,service,calls,transactionId:p.transactionId,dependencies,
    plan:()=>service.planZeroTotalOrder(p.transactionId,{billingAddress,shippingAddress}),
    store:()=>retailFulfillmentStore(root,p.transactionId,dependencies),
    setPrice:value=>{price=value;},loseResponse:()=>{loseResponse=true;},rejectContact:()=>{contactAccepted=false;}};
}
test('shared retail surface plans Shopify native checkout and the original fulfillment store submits and reads the real-shaped order',async()=>{
  const f=await fixture(),plan=await f.plan();
  assert.equal(f.calls.filter(c=>c.name==='complete_checkout').length,0);
  assert.equal(plan.totalAmountMinor,'0');assert.equal(plan.createAccount,false);
  assert.doesNotMatch(JSON.stringify(plan),/buyer@example|Fixture street|key=private/);
  assert.equal(f.store().checkoutPlan(plan.planHash).planHash,plan.planHash);
  const result=await f.store().purchase(plan.planHash);
  assert.equal(result.sellerOrderAccepted,true);assert.equal(result.outsiderCreatedOrder,true);
  assert.equal(result.paymentPerformed,false);assert.equal(result.orderCompletedIsDeliveryProof,false);
  await f.store().purchase(plan.planHash);assert.equal(f.calls.filter(c=>c.name==='complete_checkout').length,1);
  assert.equal((await f.service.currentOrder(f.transactionId)).outsiderCreatedOrder,true);
  const original=JSON.parse(readFileSync(path.join(f.root,'retail-transactions',f.transactionId,'request.json')));
  assert.deepEqual(original,request);await f.service.close();
});
test('a changed total is not completed and an unaccepted contact does not become a purchase plan',async()=>{
  const f=await fixture(),plan=await f.plan();f.setPrice(100);
  await assert.rejects(f.store().purchase(plan.planHash),/ZERO_TOTAL_REQUIRED/);
  assert.equal(f.calls.filter(c=>c.name==='complete_checkout').length,0);await f.service.close();
  const g=await fixture();g.rejectContact();await assert.rejects(g.plan(),/NOT_READY_FOR_NATIVE_COMPLETION/);await g.service.close();
});
test('lost completion response is reconciled from that checkout and order without a second submission',async()=>{
  const f=await fixture(),plan=await f.plan();f.loseResponse();
  await assert.rejects(f.store().purchase(plan.planHash),/fixture-network-response-lost/);
  const result=await f.store().purchase(plan.planHash);assert.equal(result.outsiderCreatedOrder,true);
  assert.equal(f.calls.filter(c=>c.name==='complete_checkout').length,1);await f.service.close();
});
