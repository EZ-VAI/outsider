import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createEasyPostSupplyAdapter} from '../src/outsider-easypost-supply-adapter.js';
const address={name:'PRIVATE_RECEIVER',street1:'123 Test Street',city:'Boston',state:'MA',zip:'02110',country:'US'};
const input=()=>({fromAddress:{...address,name:'PRIVATE_SENDER'},toAddress:{...address},parcel:{length:10,width:8,height:4,weight:16},maximumAmountMinor:'2000',currency:'USD'});
function fixture(t,{environment='test',configured=true,policy=null,mutate}={}){
  const nodeDirectory=mkdtempSync(path.join(tmpdir(),'outsider-easypost-test-'));t.after(()=>rmSync(nodeDirectory,{recursive:true,force:true}));
  const connections=path.join(nodeDirectory,'connections');mkdirSync(connections,{mode:0o700});
  const key='EZTK_controlled_fixture_not_a_real_credential';const keyFile=path.join(connections,'api-key.txt');writeFileSync(keyFile,key,{mode:0o600});
  const config={schema:'outsider/easypost-connection/v1',environment,accountLabel:'Controlled fixture',apiKeyFile:keyFile,...(policy?{billingPolicy:policy}:{})};
  if(configured)writeFileSync(path.join(connections,'easypost.json'),JSON.stringify(config),{mode:0o600});
  const calls=[],shipments=new Map();let mutateResponse=mutate,unknown=false;
  const rate=(shipmentId,carrier,amount,n)=>({id:'rate_'+n,object:'Rate',carrier,carrier_account_id:'ca_'+carrier,service:'Ground',shipment_id:shipmentId,mode:environment,
    rate:amount,currency:'USD',billing_type:'easypost',delivery_days:3,delivery_date:null,delivery_date_guaranteed:false});
  const fetchImpl=async(url,options)=>{
    assert.ok(url.startsWith('https://api.easypost.com/v2/shipments'));assert.equal(options.headers.authorization,'Basic '+Buffer.from(key+':').toString('base64'));assert.equal(options.redirect,'error');
    const pathname=new URL(url).pathname,payload=options.body?JSON.parse(options.body):null;calls.push({pathname,method:options.method,payload});
    if(unknown)throw new Error('Controlled transport failure');let value;
    if(pathname==='/v2/shipments'){
      assert.equal(options.method,'POST');assert.equal(payload.shipment.carrier,undefined);assert.equal(payload.shipment.service,undefined);
      const id='shp_'+(shipments.size+1);value={id,object:'Shipment',mode:environment,reference:payload.shipment.reference,
        from_address:{...payload.shipment.from_address,id:'adr_from'},to_address:{...payload.shipment.to_address,id:'adr_to'},parcel:{...payload.shipment.parcel,id:'prcl_one'},
        postage_label:null,selected_rate:null,tracking_code:null,status:'unknown',tracker:null,rates:[rate(id,'UPS','12.30',1),rate(id,'USPS','8.21',2),rate(id,'FedEx','40.00',3)]};
      shipments.set(id,value);
    }else{value=structuredClone(shipments.get(pathname.split('/')[3]));if(pathname.endsWith('/rerate'))value.rates[0].rate='11.75';}
    if(mutateResponse)mutateResponse(value);return Response.json(value);
  };
  const reopen=()=>createEasyPostSupplyAdapter({nodeDirectory,fetchImpl,clock:()=> '2026-09-10T08:00:00.000Z'});
  return {nodeDirectory,calls,reopen,shipments,mutate:v=>mutateResponse=v,unknown:v=>unknown=v,rotate:()=>writeFileSync(keyFile,key+'changed',{mode:0o600})};
}
test('one native shipment quote compares account-returned carriers using exact decimal rates, without buying a label or exposing contacts',async t=>{
  const f=fixture(t);assert.equal(f.reopen().status().authenticatedAccessVerified,false);
  const result=await f.reopen().quote(input());assert.deepEqual(result.rates.map(r=>[r.carrier,r.amountMinor]),[['USPS','821'],['UPS','1230']]);
  assert.equal(result.rejectedRateCount,1);assert.equal(result.labelPurchased,false);assert.equal(result.paymentPerformed,false);assert.equal(result.purchaseEnabled,false);
  assert.equal(result.allCarriersAvailable,false);assert.equal(result.rates[0].deliveryDateGuaranteed,false);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|Test Street|EZTK_|API_KEY|Basic /);
  assert.deepEqual(f.reopen().readQuote(result.quoteHash),result);assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].payload.shipment.parcel.weight,16);assert.deepEqual(result.units,{dimensions:'inch',weight:'ounce'});
});
test('refresh re-rates the same shipment and preserves the old quote; tracking observes that exact shipment without another write',async t=>{
  const f=fixture(t),quote=await f.reopen().quote(input()),bytes=readFileSync(path.join(f.nodeDirectory,'easypost-quotes',quote.quoteHash.slice(7)+'.json'));
  const next=await f.reopen().refresh({quoteHash:quote.quoteHash});assert.equal(next.shipmentId,quote.shipmentId);assert.equal(next.previousQuoteHash,quote.quoteHash);
  assert.equal(next.rates.find(r=>r.carrier==='UPS').amountMinor,'1175');assert.equal(f.shipments.size,1);
  assert.deepEqual(readFileSync(path.join(f.nodeDirectory,'easypost-quotes',quote.quoteHash.slice(7)+'.json')),bytes);
  f.shipments.get(quote.shipmentId).tracker={status:'delivered',public_url:'https://track.easypost.com/fixture'};
  const tracked=await f.reopen().track({quoteHash:next.quoteHash});assert.equal(tracked.carrierReportsDelivered,true);assert.equal(tracked.physicalDeliveryCompleted,false);
  assert.equal(tracked.paymentPerformedByThisOperation,false);assert.equal(f.calls.at(-1).method,'GET');assert.ok(f.calls.every(c=>!c.pathname.includes('/buy')));
});
test('missing credentials and production quote fees remain explicit; validation precedes any external request',async t=>{
  const absent=fixture(t,{configured:false});assert.equal(absent.reopen().status().configured,false);await assert.rejects(absent.reopen().quote(input()),/NOT_CONFIGURED/);assert.equal(absent.calls.length,0);
  const production=fixture(t,{environment:'production'});assert.equal(production.reopen().status().preparationEnabled,false);
  await assert.rejects(production.reopen().quote(input()),/FEE_POLICY_REQUIRED/);assert.equal(production.calls.length,0);
  const authorized=fixture(t,{environment:'production',policy:{quoteRequestsAuthorized:true,customerChargePolicy:'PLATFORM_ABSORBS_NETWORK_FEES'}});
  assert.equal((await authorized.reopen().quote(input())).environment,'production');
  const invalid=fixture(t);for(const change of [v=>v.toAddress.country='CA',v=>delete v.parcel.height,v=>v.parcel.weight=-1,v=>v.currency='EUR',v=>v.maximumAmountMinor='02000',v=>v.service='invented']){
    const v=input();change(v);await assert.rejects(invalid.reopen().quote(v),/EASYPOST_/);
  }assert.equal(invalid.calls.length,0);
});
test('account, shipment, addresses, parcel and mode stay bound; mismatched or foreign rates cannot enter the selectable result',async t=>{
  for(const mutate of [v=>v.mode='production',v=>v.to_address.street1='Different Street',v=>v.parcel.weight=200,v=>v.selected_rate={id:'rate_paid'}]){
    const f=fixture(t,{mutate});await assert.rejects(f.reopen().quote(input()),/EASYPOST_/);
  }
  const f=fixture(t,{mutate:v=>{v.rates[0].shipment_id='shp_other';v.rates[1].currency='EUR';}});assert.equal((await f.reopen().quote(input())).rates.length,0);
  const duplicate=fixture(t,{mutate:v=>v.rates.push(v.rates[0])});await assert.rejects(duplicate.reopen().quote(input()),/DUPLICATE_RATE/);
  const rotated=fixture(t),quoted=await rotated.reopen().quote(input());rotated.rotate();assert.throws(()=>rotated.reopen().readQuote(quoted.quoteHash),/CONNECTION_CHANGED/);
  await assert.rejects(rotated.reopen().track({quoteHash:quoted.quoteHash}),/CONNECTION_CHANGED/);assert.equal(rotated.calls.length,1);
});
test('unknown quote response is not retried and a purchased shipment cannot be silently re-rated',async t=>{
  const f=fixture(t);f.unknown(true);await assert.rejects(f.reopen().quote(input()),/Controlled transport/);assert.equal(f.calls.length,1);
  assert.equal(existsSync(path.join(f.nodeDirectory,'easypost-quotes')),false);
  const ready=fixture(t),quote=await ready.reopen().quote(input());ready.shipments.get(quote.shipmentId).postage_label={id:'pl_fixture'};
  await assert.rejects(ready.reopen().refresh({quoteHash:quote.quoteHash}),/ALREADY_PURCHASED/);assert.equal(ready.calls.length,2);
});
