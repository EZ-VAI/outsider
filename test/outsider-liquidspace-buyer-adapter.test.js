import test from "node:test";
import assert from "node:assert/strict";
import {parseLiquidSpaceSearchPage,liquidSpaceWindowAvailable,createLiquidSpaceBuyerAdapter} from "../src/outsider-liquidspace-buyer-adapter.js";
import {discoverMarketplaceResourceCandidates,prepareMarketplaceTransaction} from "../src/outsider-marketplace-resource-candidates.js";
const hash=`sha256:${"a".repeat(64)}`,sources={searchImplementationHash:hash,availabilityImplementationHash:hash};
const request={city:"Boston",minimumSeats:4,maximumSeats:8,localStartDate:"2026-09-08T10:00:00",localEndDate:"2026-09-08T12:00:00"};
test("public calendar rotation preserves half-hour boundaries",()=>{
  const cells=Array(24).fill("closed-closed");cells[7]=cells[8]="available-available";
  assert.equal(liquidSpaceWindowAvailable(cells,request.localStartDate,request.localEndDate),true);
  cells[8]="available-closed";assert.equal(liquidSpaceWindowAvailable(cells,request.localStartDate,request.localEndDate),false);
});
test("city search is independent of another provider's coordinates",async()=>{
  let sent;const adapter=createLiquidSpaceBuyerAdapter({sourceBindings:sources,fetchImpl:async(url,options)=>{
    if(url.endsWith("/search"))return new Response('<script>SearchPage.initialize({"SearchScriptConstructorParams":{"searchRequest":{"Id":"id"}}});</script>');
    sent=JSON.parse(options.body);return new Response('{}');}});
  await adapter.search(request);assert.equal(sent.IsFullTextSearch,true);assert.equal(sent.Latitude,null);assert.equal(sent.Longitude,null);assert.equal(sent.Address,"Boston");
});
test("transaction preparation calls seller validators and includes service fee without creating an order",async()=>{
  const calls=[],candidate={marketplace:"LiquidSpace",venueId:"a".repeat(36),resourceId:"b".repeat(36),requestedWindow:request};
  const result=await prepareMarketplaceTransaction({candidate,sources:{...sources,costImplementationHash:hash},fetchImpl:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return new Response(JSON.stringify(url.endsWith("calculate")?{currency:0,salesPrice:130,salesTax:0,serviceCharge:12.35,totalPrice:142.35,amountDue:142.35}
      :url.includes("prerequisites")?{isValid:true,errors:[]}:{isAvailable:true}));}});
  assert.equal(result.state,"SELLER_PREFLIGHT_PASSED_NOT_RESERVED");assert.equal(result.price.total,142.35);assert.equal(result.price.serviceCharge,12.35);
  assert.equal(result.capacityReserved,false);assert.equal(result.transactionSubmitted,false);assert.equal(calls.length,3);
  assert.ok(calls.every(c=>!c.url.endsWith("/api/reservations")));assert.ok(result.nextActions.includes("AUTHORIZE_SPECIFIC_PAYMENT"));
  assert.equal(calls.find(c=>c.url.includes("prerequisites")).body.discriminator,"NEW");
});
test("a seller's login requirement and failed cost read survive independently",async()=>{
  const result=await prepareMarketplaceTransaction({candidate:{venueId:"a".repeat(36),resourceId:"b".repeat(36),requestedWindow:request},
    sources:{...sources,costImplementationHash:hash},fetchImpl:async url=>{
      if(url.endsWith("calculate"))throw new Error("unavailable");
      return new Response(JSON.stringify(url.includes("prerequisites")?{isValid:false,errors:[{type:"RequiresLogin",message:"Sign in"}]}:{isAvailable:true}));}});
  assert.equal(result.state,"TRANSACTION_PREPARATION_INCOMPLETE");assert.equal(result.providerRequirements[0].type,"RequiresLogin");
  assert.equal(result.bookingAvailable,true);assert.equal(result.price,null);
});
test("native search uses page-generated search ID, echoes scoped window, and no credentials",async()=>{
  const calls=[];const template={Id:"public-search-id",StartTime:null};
  const adapter=createLiquidSpaceBuyerAdapter({sourceBindings:sources,fetchImpl:async(url,options)=>{
    calls.push({url,options});return new Response(calls.length===1?`<script>SearchPage.initialize(${JSON.stringify({SearchScriptConstructorParams:{searchRequest:template}})});</script>`:JSON.stringify({searchAvailable:true}));}});
  await adapter.search({...request,latitude:42.35,longitude:-71.05});
  const body=JSON.parse(calls[1].options.body);assert.equal(body.Id,"public-search-id");assert.equal(body.ReservationLengthMinutes,120);
  assert.equal(body.StartTime,"2026-09-08");assert.equal(calls[1].options.headers["X-Requested-With"],"XMLHttpRequest");
  assert.equal(calls[1].options.credentials,"omit");assert.equal(adapter.reserve,undefined);
});
test("malformed HTML and unconfirmed search responses cannot become resource results",async()=>{
  assert.throws(()=>parseLiquidSpaceSearchPage("<title>Warning</title>"),/BOOTSTRAP/);
  const result=await discoverMarketplaceResourceCandidates({request,center:{latitude:42.35,longitude:-71.05},sources,
    fetchImpl:async url=>new Response(url.endsWith("/search")?'<script>SearchPage.initialize({"SearchScriptConstructorParams":{"searchRequest":{"Id":"id"}}});</script>':JSON.stringify({searchAvailable:true,pageDataModel:[]}))});
  assert.equal(result.state,"UNAVAILABLE");assert.deepEqual(result.candidates,[]);
});
