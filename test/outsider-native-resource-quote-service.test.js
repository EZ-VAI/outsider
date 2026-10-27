import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createNativeResourceQuoteService } from "../src/outsider-native-resource-quote-service.js";
import { createIndustriousBuyerDiscoveryAdapter } from "../src/outsider-industrious-buyer-discovery-adapter.js";
import { publicDatasetHash as digest } from "../src/outsider-public-dataset.js";
const hash=`sha256:${"a".repeat(64)}`;
const request = {requestId:"quote-test",explorationId:`explore_${"b".repeat(32)}`,resourceKind:"MEETING_SPACE",city:"Boston",
  localStartDate:"2026-09-08T10:00:00",localEndDate:"2026-09-08T12:00:00",minimumSeats:4,maximumSeats:8};
function fixture({seller=true,available=true}={}) {
  const calls=[], directory=mkdtempSync(path.join(os.tmpdir(),"outsider-native-quote-"));
  const room={id:"room123",slug:"boston/room",seats:6,locationName:"Boston",timezone:"America/New_York",onDemandBookingType:"InstantBook"};
  const fetchImpl=async(url,options)=>{
    calls.push({url,options}); let data;
    if(url.includes("/locations/all")) data=[{geolocalization:{lat:42.35,lng:-71.05}}];
    else if(url.endsWith("/search")) data=[room];
    else if(url.endsWith("/preview")) data={priceAmount:100,taxAmount:5,totalPrice:105,currencyIsoCode:"USD"};
    else if(url.endsWith("/search-availabilities")) data=available?[{localStartDate:"2026-09-08T09:00:00",localEndDate:"2026-09-08T17:00:00"}]:[];
    else data={...room,isOnDemandBookable:true};
    return new Response(JSON.stringify(data),{status:200});
  };
  const service=createNativeResourceQuoteService({directory,sources:{configuration:hash,locations:hash,rooms:hash,preview:hash},fetchImpl,
    inspectExploration:()=>({state:"FRONTIER_READY",result:{transactionCandidates:{candidates:seller?[{kind:"RESOURCE_SELLER",sourceUrl:"https://www.industriousoffice.com/meeting-rooms",sourceHash:hash,requirementIds:["R1"]}]:[]}}})});
  return {service,calls,directory};
}
test("native discovery composes price and availability; replay does no network and no reservation",async()=>{
  const {service,calls,directory}=fixture(); const result=await service.create(request);
  assert.equal(result.state,"RESOURCE_QUOTES_OBSERVED_NOT_COMMITMENT"); assert.equal(calls.length,5);
  assert.equal(result.quotes[0].price.total,105); assert.equal(result.capacityReserved,false); assert.equal(result.confirmationAvailable,false);
  assert.equal(result.independentRecoveryAvailable,false);
  assert.deepEqual(JSON.parse(calls.find(c=>c.url.endsWith("/preview")).options.body).duration,{type:"Hour",value:2});
  for(const c of calls) {assert.equal(c.options.headers.authorization,undefined); assert.equal(c.options.credentials,"omit");}
  assert.deepEqual(await service.create(request),result); assert.equal(calls.length,5);
  assert.equal(statSync(path.join(directory,result.quoteId,"source-0.json")).mode&0o777,0o600);
  await assert.rejects(service.create({...request,city:"London"}),/REQUEST_CONFLICT/);
});
test("not-discovered seller and too-short window perform no API calls",async()=>{
  for(const [options,input] of [[{seller:false},request],[{}, {...request,localEndDate:"2026-09-08T11:00:00"}]]) {
    const {service,calls}=fixture(options); assert.equal((await service.create(input)).state,"UNAVAILABLE"); assert.equal(calls.length,0);
  }
});
test("a price alone cannot pass the availability condition",async()=>{
  const {service}=fixture({available:false}); const result=await service.create(request);
  assert.equal(result.state,"UNAVAILABLE"); assert.equal(result.quotes[0].state,"NOT_QUOTABLE");
});
test("adapter rejects invalid duration without sending an order or a request",()=>{
  const adapter=createIndustriousBuyerDiscoveryAdapter({sourceBindings:{configurationHash:hash,discoveryImplementationHash:hash},fetchImpl:()=>assert.fail("network")});
  assert.throws(()=>adapter.meetingRoomPreview({resourceSlug:"x/y",duration:2,...request}),/PREVIEW_WINDOW_INVALID/);
  assert.equal(adapter.reserve,undefined); assert.equal(adapter.pay,undefined);
});
test("marketplace progresses while primary fails; preparation is durable and replay sends nothing",async()=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),"outsider-parallel-quote-"));let calls=0,marketStarted=false;
  const room={Id:"a".repeat(36),VenueId:"b".repeat(36),VenueName:"Seller",Scenario:"Private Meeting Room",Capacity:6,WorkspaceUrl:"/test-room"};
  const fetchImpl=async(url,options)=>{
    calls++;
    if(url.includes("api-gateway.industriousoffice.com")){
      await new Promise(resolve=>setImmediate(resolve));assert.equal(marketStarted,true);throw new Error("primary unavailable");
    }
    marketStarted=true;
    if(url.endsWith("/search"))return new Response('<script>SearchPage.initialize({"SearchScriptConstructorParams":{"searchRequest":{"Id":"id"}}});</script>');
    if(url.endsWith("GetWorkspaces"))return new Response(JSON.stringify({searchAvailable:true,effectiveRequest:JSON.parse(options.body),pageDataModel:[room]}));
    if(url.endsWith("calculate"))return new Response(JSON.stringify({currency:0,salesPrice:10,salesTax:0,serviceCharge:1,totalPrice:11,amountDue:11}));
    if(url.includes("prerequisites"))return new Response('{"isValid":true,"errors":[]}');
    if(url.endsWith("/check"))return new Response('{"isAvailable":true}');
    return new Response(JSON.stringify({IsBlocked:false,WorkspacesAvailability:[{Id:room.Id,Availability:Array(24).fill("available-available")}]}));
  };
  const service=createNativeResourceQuoteService({directory,sources:{configuration:hash,locations:hash,rooms:hash,preview:hash},
    marketplaceSources:{searchImplementationHash:hash,availabilityImplementationHash:hash,costImplementationHash:hash},fetchImpl,
    inspectExploration:()=>({state:"FRONTIER_READY",result:{transactionCandidates:{candidates:[{kind:"RESOURCE_SELLER",sourceUrl:"https://www.industriousoffice.com/meeting-rooms"}]}}})});
  const quote=await service.create(request);assert.equal(quote.state,"RESOURCE_CANDIDATES_OBSERVED_NOT_COMMITMENT");assert.equal(quote.marketplaceAlternatives.candidates.length,1);
  const input={requestId:"prepare-once",quoteId:quote.quoteId,resourceId:room.Id};
  const prepared=await service.prepareTransaction(input);assert.equal(prepared.price.total,11);assert.equal(prepared.apiCalls,3);
  const count=calls;assert.deepEqual(await service.prepareTransaction(input),prepared);assert.equal(calls,count);
});
test("a goal formation reaches the same real buyer service without synthesizing an exploration or altering the graph", async () => {
  const { service, calls } = fixture();
  const graph = { summary: "Room", missingFacts: [], requirements: [{ id: "room", capability: "MEETING_SPACE_BOOKING", dependsOn: [],
    outcome: "Room for six", acceptance: ["Actual booked room"], recoveryNeeds: ["Equivalent room"],
    resourceKinds: ["SPACE"], discoveryQueries: ["Meeting rooms"], candidateDocumentationUrls: [] }] };
  const { explorationId, ...query } = request;
  const input = { ...query, formationRef: { taskRequestHash: hash, graphHash: digest(graph), requirementId: "room" } };
  const origin = { graph, publisherSources: [{ url: "https://www.industriousoffice.com/meeting-rooms", sourceHash: hash }] };
  const result = await service.createFromFormation(input, origin);
  assert.equal(result.quotes[0].price.total, 105);
  assert.deepEqual(result.formationRef, input.formationRef);
  assert.equal(Object.hasOwn(result, "explorationResultHash"), false);
  assert.equal(result.capacityReserved, false);
  assert.deepEqual(await service.createFromFormation(input, origin), result);
  assert.equal(calls.length, 5);
  await assert.rejects(service.createFromFormation({ ...input, formationRef: { ...input.formationRef, requirementId: "wrong" } }, origin), /FORMATION_INVALID/);
});
