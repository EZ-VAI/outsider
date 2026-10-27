import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import { createEpisodeAttemptSetComposition } from "../src/outsider-episode-attempt-set-composition.js";
import { createMemoryUserHeldFormationLeaseBrokerV1 } from
  "../src/outsider-user-held-formation-executor-protocol-v1.js";
import { runTargetUserHeldRouteObservationProductionV1 } from
  "../scripts/outsider-target-user-held-route-observation-production-v1.mjs";
const h = x => `sha256:${createHash("sha256").update(x).digest("hex")}`;
const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const NOW = "2026-09-05T01:20:00.000Z";
function put(root, name, value) { const file = path.join(root, name);
  writeFileSync(file, `${canonicalizeStrict(value)}\n`, { mode: 0o600 }); chmodSync(file, 0o600); return file; }
function json(value, status = 200) { return new Response(`${JSON.stringify(value)}\n`,
  { status, headers: { "content-type": "application/json" } }); }
function genesis() { return createEpisodeAttemptSetComposition({ recordedAt: "2026-09-05T01:00:00.000Z",
  episodeBinding: { principalEpochProjectionHash:h("p"), accountableDeploymentSubjectHash:h("d"),
    runtimeInstanceHash:h("r"), embodimentRevisionHash:null, delegationEdgeHash:h("g"), episodeHash:h("e"),
    workOrderProjectionHash:h("w"), networkCompleteEpisodeJoinHash:h("j"), prospectiveCensusProjectionHash:h("c"),
    realityObligationGenesisHash:h("og"), realityObligationStateHash:h("os"), genesisObligationAttemptHash:h("a") },
  appendOnlyLineage:{revision:0,predecessorCompositionHash:null,supersedesCompositionHash:null},
  attempts:[{attemptOrdinal:1,occurredAt:"2026-09-05T00:59:00.000Z",episodeHash:h("e"),attemptHash:h("a"),
    attemptActorSubjectHash:h("actor"),kind:"PRIMARY",retryOfAttemptHash:null,recoveryOfAttemptHash:null}],
  reportOccurrences:[] }, { predecessor:null }); }

test("production runner publishes generic job then performs exactly two local Target GETs", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-target-production-")); chmodSync(root,0o700);
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const predecessor=put(root,"predecessor.json",genesis());
  const outcome=put(root,"outcome.json",{schema:"outsider/private-first-physical-outcome-destination-formation-request/v2",schemaVersion:"2.0.0",destination:{postalCode:"02446",region:"MA"}});
  const q=new URLSearchParams({key:"9f36aeafbe60771e321a7cc95a78140772ab3e96",tcin:"91252434",zip:"02446",state:"MA",latitude:"42.34",longitude:"-71.12",pricing_store_id:"2822",store_id:"2822"});
  const route=put(root,"route.json",{sources:[{method:"GET",url:`https://redsky.target.com/redsky_aggregations/v1/web/product_fulfillment_v1?${q}`}]});
  const product=put(root,"product.json",{schema:"outsider/first-physical-formation-product-state/v2",schemaVersion:"2.0.0",productStateHash:h("state"),product:{outcomeKind:"PHYSICAL_GOODS_DELIVERY",exactItem:{condition:"NEW",connectorA:"USB_A_MALE",connectorB:"USB_C_MALE",dataRequired:true,fiveVoltPowerRequired:true,minimumLengthMm:900,maximumLengthMm:1100,quantity:1}}});
  const token=path.join(root,"dispatch.secret"); writeFileSync(token,"publication-token-abcdefghijklmnopqrstuvwxyz-123456\n",{mode:0o600});chmodSync(token,0o600);
  const broker=createMemoryUserHeldFormationLeaseBrokerV1({clock:()=>NOW}); const central=[]; const provider=[];
  const fetchImpl=async(url,init)=>{const u=new URL(url); if(u.origin==="https://redsky.target.com"){
    provider.push({method:init.method,url:String(url)}); const body=u.pathname.endsWith("pdp_client_v1")
      ? {data:{product:{tcin:"91252434",free_shipping:{enabled:false},item:{primary_barcode:"810212674155",cart_add_on_threshold:35,product_description:{title:"3 foot USB-A to USB-C cable",bullet_descriptions:["<B>Cable/Cord Length:</B> 3 Feet","<B>Connection Type:</B> USB-C","<B>Connection Gender:</B> Male-To-Male","<B>Connection Types 2:</B> USB-A"],downstream_description:"Cable for charging at 5V and data transfer.",soft_bullets:{bullets:["USB-A to USB-C cord"]}}},price:{current_retail:5.99,formatted_current_price:"$5.99"}}}}
      : {data:{product:{tcin:"91252434",pay_per_order_charges:{one_day:7.99,scheduled_delivery:9.99},fulfillment:{shipping_options:{availability_status:"IN_STOCK",available_to_promise_quantity:10,services:[{is_two_day_shipping:true,is_base_shipping_method:true,shipping_method_id:"STANDARD",cutoff:"2026-09-05T21:00:00Z",min_delivery_date:"2026-09-06",max_delivery_date:"2026-09-06",shipping_method_short_description:"Standard",service_level_description:"2-day shipping"}]}}}}};
    return json(body); }
    central.push(String(init.body)); const body=JSON.parse(String(init.body));
    if(u.pathname==="/v1/client-executions"){broker.enqueue(body.job,body.executorCapabilityHash);return json({schema:"outsider/user-held-formation-execution-publish-response/v1",apiVersion:"2.5.0",ok:true,state:"PUBLISHED",jobKey:body.job.jobKey??body.bindingProjection?.jobKey,jobHash:body.bindingProjection.jobHash,replayed:false,durableStorage:"SQLITE_DURABLE_OBJECT",privateParameterBytesStored:false,privateParameterUnkeyedHashStored:false,authorityMinted:false,capacityEstablished:false,independentOutcomeTruthEstablished:false,outcomeCommitted:false},201);}
    if(u.pathname==="/v1/client-execution-claims") return json(broker.claim(body));
    return json(broker.complete(body)); };
  const output=path.join(root,"activation");
  const result=await runTargetUserHeldRouteObservationProductionV1({privateRoot:root,predecessorCompositionFile:predecessor,outcomeProgramHash:h("real-outcome-program"),outcomeInputFile:outcome,priorRouteBindingFile:route,frozenProductStateFile:product,formationDispatchTokenFile:token,outputRoot:output,issuedAt:"2026-09-05T01:10:00.000Z",expiresAt:"2026-09-05T02:00:00.000Z"},{fetchImpl,clock:()=>NOW,randomBytes:n=>Buffer.alloc(n,0x41)});
  assert.equal(result.safe.adapterBinding.adapterId,"user-held-read-only-route-observation");
  assert.equal(provider.length,2); assert(provider.every(x=>x.method==="GET"));
  assert.equal(result.safe.paymentActions+result.safe.orderActions+result.safe.cartActions,0);
  const text=central.join("\n"); for(const forbidden of ["target-redsky","02446","42.34","-71.12","redsky.target.com",sha(readFileSync(route)),sha(readFileSync(outcome)),sha(readFileSync(product))]) assert.equal(text.includes(forbidden),false,forbidden);
  for(const file of ["executor-bearer-token.secret","commitment-key.secret","episode-attempt-set-composition.json","activation-safe-receipt.json"]) assert.equal(statSync(path.join(result.activation,file)).mode&0o777,0o600);
});
