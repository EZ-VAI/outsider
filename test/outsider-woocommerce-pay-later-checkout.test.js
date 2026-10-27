import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createNativeRetailBuyer } from '../src/outsider-native-retail-buyer.js';
import { interfaceDigest as digest } from '../src/outsider-openapi-demand-matcher.js';

// Merchant protocol fixtures only. No checkout or payment reaches a supplier.
const start = '2026-09-08T20:00:00.000Z', programHash = digest('original-confirmed-program');
const destination = { country:'US', state:'MA', city:'Fixture City', postcode:'02446' };
const shippingAddress = { ...destination, first_name:'Fixture', last_name:'Buyer', address_1:'1 Fixture Street' };
const billingAddress = { ...shippingAddress, email:'fixture@example.org' };
const orderKey = 'fixture-private-order-key';
function fixture({ method='cod', status=method==='cod'?'processing':'on-hold', draftKnown=false,
  currency='USD', minorUnit=2, initialTotal='1590', finalTotal='1715', expectedTotalSupported=true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(),'outsider-pay-later-')), directory = path.join(root,'native'), calls=[];
  const request = { requestId:'original-candidate', storeUrl:'https://merchant.example.org', search:'supplies', quantity:2,
    currency, maximumTotalMinor:'5000', prepareDraft:false, destination };
  const product = { id:42, type:'simple', name:'Fixture supplies', sku:'SUPPLIES', is_purchasable:true, is_in_stock:true,
    permalink:'https://merchant.example.org/product/supplies', prices:{currency_code:currency,price:'500'} };
  let now=start, items=[], shipping=null, billing=null, submitted=false, currentStatus=status, total=initialTotal,
    methods=['cod','bacs'], currentCurrency=currency, currentMethod=method, lostResponse=false, exposeCheckout=true,
    serverPriceMismatch=false, orderShipping=null, orderBilling=null;
  const totals = () => ({ currency_code:currentCurrency, currency_minor_unit:minorUnit,
    total_items:'1000', total_shipping:total===initialTotal?'500':'600', total_tax:total===initialTotal?'90':'115', total_price:total });
  const cart = () => ({ items, totals:totals(), needs_shipping:items.length>0, needs_payment:items.length>0,
    payment_methods:methods, payment_requirements:['products'], errors:[], billing_address:billing??{}, shipping_address:shipping??{},
    shipping_rates:shipping?[{package_id:0,shipping_rates:[{rate_id:'shipping:1',method_id:'flat_rate',name:'Delivery',
      selected:true,price:totals().total_shipping,currency_code:currentCurrency}]}]:[] });
  const checkout = () => ({ order_id:submitted&&exposeCheckout?71:draftKnown?71:0,
    order_key:submitted&&exposeCheckout||draftKnown?orderKey:'', status:submitted&&exposeCheckout?currentStatus:'checkout-draft',
    customer_id:0, billing_address:billing??{}, shipping_address:shipping??{}, payment_method:submitted&&exposeCheckout?currentMethod:'',
    payment_result:submitted&&exposeCheckout?{payment_status:'success',payment_details:[],
      redirect_url:`${request.storeUrl}/checkout/order-received/71/?key=${orderKey}`}:null });
  const fetchImpl = async (url, options) => {
    const u=new URL(url), route=u.pathname.replace('/wp-json/wc/store/v1',''), body=options.body?JSON.parse(options.body):null;
    calls.push({route,method:options.method,body}); let data;
    if(route==='') data={routes:Object.fromEntries([['/cart','GET'],['/cart/add-item','POST'],['/cart/update-customer','POST'],
      ['/cart/select-shipping-rate','POST'],['/cart/remove-item','POST'],['/checkout','GET']].map(([r,m])=>['/wc/store/v1'+r,
        r==='/checkout'?{methods:['GET','POST'],endpoints:[{methods:['POST'],args:{
          ...(expectedTotalSupported?{expected_total:{type:'string'}}:{}),create_account:{type:'boolean'}}}]}:{methods:[m]}]))};
    else if(route==='/products') data=[product];
    else if(route==='/cart') data=cart();
    else if(route==='/cart/add-item') {items=[{...product,key:'fixture-private-cart-item',quantity:2}];data=cart();}
    else if(route==='/cart/update-customer') {
      shipping=body.shipping_address??shipping;
      if(body.billing_address){billing=body.billing_address;total=finalTotal;}
      data=cart();
    } else if(route==='/cart/select-shipping-rate') data=cart();
    else if(route==='/checkout') {
      if(options.method==='POST') {
        assert.equal(body.create_account,false); assert.deepEqual(body.payment_data,[]);
        assert.equal(body.payment_method,method); assert.equal(body.expected_total,finalTotal);
        assert.deepEqual(body.billing_address,billingAddress); assert.deepEqual(body.shipping_address,shippingAddress);
        if(serverPriceMismatch) return Response.json({code:'woocommerce_rest_checkout_total_mismatch'},{status:409});
        submitted=true; orderShipping={...shipping}; orderBilling={...billing};
        if(lostResponse) throw new Error('fixture response lost after supplier created the order');
      }
      data=checkout();
    } else if(route==='/order/71') {
      assert.equal(u.searchParams.get('key'),orderKey); assert.equal(u.searchParams.get('billing_email'),billingAddress.email);
      data={id:71,status:submitted?currentStatus:'checkout-draft',items:[{...product,id:501,quantity:2}],totals:totals(),
        billing_address:orderBilling??billing,shipping_address:orderShipping??shipping,needs_payment:currentStatus==='pending'};
    } else throw new Error(`unexpected fixture route ${options.method} ${route}`);
    return Response.json(data,{headers:{'Cart-Token':'fixture-private-cart-token'}});
  };
  const make = () => createNativeRetailBuyer({directory,request,nodeDirectory:root,clock:()=>now,fetchFactory:()=>fetchImpl});
  return {root,directory,calls,request,make,prepare:()=>make().prepare(),
    plan:()=>make().planPayLaterCheckout({billingAddress,shippingAddress,paymentMethod:method}),
    submit:(plan,extra={})=>make().submitPayLaterCheckout({expectedPlanHash:plan.planHash,programHash,requirementId:'supplies_order',...extra}),
    submissions:()=>calls.filter(c=>c.route==='/checkout'&&c.method==='POST').length,
    change:values=>{if('now'in values)now=values.now;if('total'in values)total=values.total;if('methods'in values)methods=values.methods;
      if('currency'in values)currentCurrency=values.currency;if('status'in values)currentStatus=values.status;
      if('lostResponse'in values)lostResponse=values.lostResponse;if('exposeCheckout'in values)exposeCheckout=values.exposeCheckout;
      if('serverPriceMismatch'in values)serverPriceMismatch=values.serverPriceMismatch;if('currentMethod'in values)currentMethod=values.currentMethod;}
  };
}

test('COD plans exact nonzero address tax and delivery, preserves currency units, then places the same order once',async()=>{
  const f=fixture({currency:'PKR',minorUnit:0});await f.prepare();
  const original=readFileSync(path.join(f.directory,'binding.json')),prepared=readFileSync(path.join(f.directory,'prepared.json'));
  const plan=await f.plan();assert.equal(plan.totalAmountMinor,'1715');assert.equal(plan.minorUnit,0);
  assert.equal(plan.taxAmountMinor,'115');assert.equal(plan.shippingAmountMinor,'600');assert.equal(plan.items[0].quantity,2);
  assert.equal(plan.createsPaymentObligation,true);assert.equal(plan.buyerAction.type,'PAY_ON_DELIVERY');
  assert.equal(plan.expiresAt,'2026-09-08T20:15:00.000Z');assert.equal(f.submissions(),0);
  assert.doesNotMatch(JSON.stringify(plan),/fixture@example.org|1 Fixture Street|fixture-private/);
  const order=await f.submit(plan);assert.equal(order.sellerOrderAccepted,true);assert.equal(order.orderBindingMatched,true);
  assert.equal(order.paymentPerformed,false);assert.equal(order.paymentAttempted,false);
  assert.equal(order.paymentState,'PAYMENT_DUE_ON_DELIVERY');assert.equal(order.paymentObligationCreated,true);
  assert.equal(order.liabilityAmountMinor,'1715');assert.ok(order.orderRefHash);
  assert.equal((await f.submit(plan)).orderRefHash,order.orderRefHash);assert.equal(f.submissions(),1);
  assert.deepEqual(readFileSync(path.join(f.directory,'binding.json')),original);
  assert.deepEqual(readFileSync(path.join(f.directory,'prepared.json')),prepared);
});

test('BACS retains an unpaid on-hold order and resumes merchant processing without a second POST or invented bank instructions',async()=>{
  const f=fixture({method:'bacs'});await f.prepare();const plan=await f.plan(),waiting=await f.submit(plan);
  assert.ok(waiting.orderRefHash);assert.equal(waiting.sellerOrderAccepted,false);
  assert.equal(waiting.paymentState,'AWAITING_EXTERNAL_BANK_TRANSFER');assert.equal(waiting.paymentObligationCreated,true);
  assert.equal(waiting.paymentPerformed,false);assert.doesNotMatch(JSON.stringify(waiting),/fixture@example.org|fixture-private-order-key/);
  const next=f.make().buyerNextAction();assert.ok(next.merchantReceiptUrl.includes(orderKey));
  assert.equal(next.merchantInstructions,null);assert.equal(next.paymentInstructionsInvented,false);
  f.change({now:'2026-09-09T20:00:00.000Z',status:'processing'});
  const accepted=await f.submit(plan,{resumeOnly:true});assert.equal(accepted.orderRefHash,waiting.orderRefHash);
  assert.equal(accepted.sellerOrderAccepted,true);assert.equal(accepted.paymentState,'MERCHANT_PROCESSING_PAYMENT_UNVERIFIED');
  assert.equal(accepted.paymentPerformed,false);assert.equal(f.submissions(),1);
  await assert.rejects(f.make().clear(),/CART_CLEAR_IS_NOT_ORDER_CANCELLATION/);
});

test('changed quotes, undeclared methods, currency drift, and expired plans cause no checkout POST',async()=>{
  const f=fixture();await f.prepare();const plan=await f.plan();
  f.change({total:'1815'});await assert.rejects(f.submit(plan),{code:'RETAIL_CHECKOUT_PRICE_OR_ITEMS_CHANGED',effectNotDispatched:true,providerCallPerformed:true});
  f.change({total:'1715',methods:['woocommerce_payments']});await assert.rejects(f.submit(plan),/METHOD_NOT_DECLARED/);
  f.change({methods:['cod','bacs'],currency:'EUR'});await assert.rejects(f.submit(plan),/CART_BINDING_MISMATCH/);
  f.change({currency:'USD',now:plan.expiresAt});await assert.rejects(f.submit(plan),{code:'RETAIL_CHECKOUT_PLAN_EXPIRED',effectNotDispatched:true,providerCallPerformed:false});
  assert.equal(f.submissions(),0);
  await assert.rejects(f.make().planPayLaterCheckout({billingAddress,shippingAddress,paymentMethod:'stripe'}),/METHOD_NOT_SUPPORTED/);
  const unsupported=fixture({expectedTotalSupported:false});await unsupported.prepare();
  const before=unsupported.calls.length;await assert.rejects(unsupported.plan(),/CHECKOUT_NOT_ADVERTISED/);
  assert.equal(unsupported.calls.length,before);
});

test('a saved successful checkout response reconstructs the original identity after a crash, even after quote expiry',async()=>{
  const f=fixture({status:'on-hold'});await f.prepare();const plan=await f.plan(),order=await f.submit(plan);
  const identity=readFileSync(path.join(f.directory,'order-submitted.json'));
  unlinkSync(path.join(f.directory,'order-submitted.json')); // crash after response persisted, before this derivative record
  f.change({now:'2026-09-09T20:00:00.000Z'});const count=f.calls.length;
  const resumed=await f.submit(plan,{resumeOnly:true});assert.equal(resumed.orderRefHash,order.orderRefHash);
  assert.equal(resumed.sellerOrderAccepted,true);assert.equal(f.submissions(),1);
  assert.ok(f.calls.slice(count).every(c=>c.method==='GET'));
  assert.deepEqual(readFileSync(path.join(f.directory,'order-submitted.json')),identity);
});

test('a lost checkout response never opens or clears another order; only a matching source checkout can resolve it',async()=>{
  const f=fixture({method:'bacs'});await f.prepare();const plan=await f.plan();
  f.change({lostResponse:true,exposeCheckout:false});const uncertain=await f.submit(plan);
  assert.equal(uncertain.state,'SUBMISSION_UNCERTAIN_NO_RESUBMIT');assert.equal(uncertain.orderRefHash,null);
  assert.equal(Object.hasOwn(uncertain,'effectNotDispatched'),false);
  const count=f.calls.length;await f.submit(plan,{resumeOnly:true});await f.make().inspect();
  assert.ok(f.calls.slice(count).every(c=>c.method==='GET'));assert.equal(f.submissions(),1);
  await assert.rejects(f.make().clear(),/REQUIRES_ORDER_RECONCILIATION/);
  await assert.rejects(f.plan(),/ACTIVE_UNPURCHASED_CART_REQUIRED/);
  await assert.rejects(f.submit(plan,{programHash:digest('another-order')}),/EXECUTION_BINDING_MISMATCH/);
  f.change({exposeCheckout:true,currentMethod:'cod'});assert.equal((await f.submit(plan,{resumeOnly:true})).orderRefHash,null);
  f.change({currentMethod:'bacs',now:'2026-09-09T20:00:00.000Z'});
  const resolved=await f.submit(plan,{resumeOnly:true});assert.ok(resolved.orderRefHash);
  assert.equal(resolved.paymentState,'AWAITING_EXTERNAL_BANK_TRANSFER');assert.equal(f.submissions(),1);
});

test('an original known draft can identify the actual order after response loss but cannot invent its selected payment method',async()=>{
  const f=fixture({draftKnown:true});await f.prepare();const plan=await f.plan();f.change({lostResponse:true,exposeCheckout:false});
  const unresolved=await f.submit(plan);assert.ok(unresolved.orderRefHash);assert.equal(unresolved.sellerOrderAccepted,false);
  assert.equal(unresolved.paymentState,'PAY_LATER_METHOD_UNCONFIRMED');assert.equal(f.submissions(),1);
  f.change({exposeCheckout:true});const resolved=await f.submit(plan,{resumeOnly:true});
  assert.equal(resolved.orderRefHash,unresolved.orderRefHash);assert.equal(resolved.sellerOrderAccepted,true);assert.equal(f.submissions(),1);
});

test('resume-only without an intent, altered plan bytes, and a server total mismatch never authorize a new attempt',async()=>{
  const f=fixture();await f.prepare();const plan=await f.plan();const before=readdirSync(f.directory);
  await assert.rejects(f.submit(plan,{resumeOnly:true}),/NO_SUBMISSION_TO_RESUME/);
  assert.deepEqual(readdirSync(f.directory),before);assert.equal(f.submissions(),0);
  assert.throws(()=>f.make().readPayLaterCheckoutPlan(digest('absent')),{code:'RETAIL_PAY_LATER_PLAN_NOT_FOUND'});
  const p=path.join(f.directory,`pay-later-plan-${plan.planHash.slice(7)}.json`),bytes=readFileSync(p),value=JSON.parse(bytes);
  value.maximumAmountMinor='1';writeFileSync(p,JSON.stringify(value));
  assert.throws(()=>f.make().readPayLaterCheckoutPlan(plan.planHash),/CHECKOUT_PLAN_MISMATCH/);writeFileSync(p,bytes);
  f.change({serverPriceMismatch:true});const rejected=await f.submit(plan);assert.equal(rejected.sellerOrderAccepted,false);
  await f.submit(plan,{resumeOnly:true});assert.equal(f.submissions(),1);
});
