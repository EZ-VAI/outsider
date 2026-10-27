import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createPinnedPublicHttpsOneUsePostTransportV1 } from "../src/outsider-pinned-public-https-one-use-post-transport-v1.js";

const options=(body,signal=new AbortController().signal)=>({method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},redirect:"error",credentials:"omit",body,signal});
const lookup=async()=>[{address:"8.8.8.8",family:4}];
const response=(overrides={})=>({status:200,headers:{"content-type":"application/json"},body:'{"ok":true}',remoteAddress:"8.8.8.8",remoteFamily:4,tlsAuthorized:true,tlsServernameVerified:true,tlsCertificateHostnameVerified:true,...overrides});

test("posts exact canonical bytes once over replayed public DNS/TLS binding",async()=>{
  let calls=0;
  const post=createPinnedPublicHttpsOneUsePostTransportV1({lookupImpl:lookup,requestImpl:async(req)=>{calls++;assert.equal(req.url,"https://seller.example/tender");assert.deepEqual(req.body,Buffer.from('{"a":1}'));assert.deepEqual(req.headers,{Accept:"application/json","Content-Type":"application/json",Connection:"close"});return response();}});
  const got=await post("https://seller.example/tender",options(Buffer.from('{"a":1}')));
  assert.equal(got.status,200);assert.equal(await got.text(),'{"ok":true}');assert.equal(calls,1);
  await assert.rejects(()=>post("https://seller.example/tender",options(Buffer.from('{"a":1}'))),/TRANSPORT_ALREADY_CONSUMED/);assert.equal(calls,1);
});

test("consumes capability before rejecting noncanonical body or mixed private DNS",async()=>{
  let calls=0;const post=createPinnedPublicHttpsOneUsePostTransportV1({lookupImpl:lookup,requestImpl:async()=>{calls++;return response();}});
  await assert.rejects(()=>post("https://seller.example/tender",options(Buffer.from('{ "a": 1 }'))),/REQUEST_BODY_NOT_CANONICAL_JSON/);
  await assert.rejects(()=>post("https://seller.example/tender",options(Buffer.from('{"a":1}'))),/TRANSPORT_ALREADY_CONSUMED/);assert.equal(calls,0);
  const mixed=createPinnedPublicHttpsOneUsePostTransportV1({lookupImpl:async()=>[{address:"8.8.8.8",family:4},{address:"127.0.0.1",family:4}],requestImpl:async()=>{calls++;return response();}});
  await assert.rejects(()=>mixed("https://seller.example/tender",options(Buffer.from('{"a":1}'))),/DNS_NON_PUBLIC_OR_MIXED_ADDRESS_REFUSED/);assert.equal(calls,0);
});

test("caller abort and timeout never retry",async()=>{
  let calls=0;const controller=new AbortController();controller.abort();const aborted=createPinnedPublicHttpsOneUsePostTransportV1({lookupImpl:lookup,requestImpl:async()=>{calls++;return response();}});
  await assert.rejects(()=>aborted("https://seller.example/tender",options(Buffer.from('{"a":1}'),controller.signal)),/ABORTED/);assert.equal(calls,0);
  const timed=createPinnedPublicHttpsOneUsePostTransportV1({timeoutMs:5,lookupImpl:lookup,requestImpl:async()=>{calls++;await new Promise(()=>{});}});
  await assert.rejects(()=>timed("https://seller.example/tender",options(Buffer.from('{"a":1}'))),/TIMEOUT/);assert.equal(calls,1);
  await assert.rejects(()=>timed("https://seller.example/tender",options(Buffer.from('{"a":1}'))),/TRANSPORT_ALREADY_CONSUMED/);assert.equal(calls,1);
});
