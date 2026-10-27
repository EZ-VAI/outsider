import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {buildLiquidSpaceHourlyOrder,createLiquidSpaceReservationLifecycle} from "../src/outsider-liquidspace-reservation-lifecycle.js";
const hash=`sha256:${"a".repeat(64)}`;
const preparation={state:"SELLER_PREFLIGHT_PASSED_NOT_RESERVED",prerequisiteValid:true,bookingAvailable:true,
  venueId:"a".repeat(36),resourceId:"b".repeat(36),price:{currency:"USD",total:142.35},
  requestedWindow:{localStartDate:"2026-09-08T10:00:00",localEndDate:"2026-09-08T12:00:00"}};
function fixture({timeout=false,deny=false,mismatch=false}={}){
  const calls=[];let deleted=false;
  const request=buildLiquidSpaceHourlyOrder({preparation,organizerId:"buyer"});
  const options={directory:mkdtempSync(path.join(os.tmpdir(),"outsider-booking-")),sourceHash:hash,request,
    authorize:async c=>({allowed:!deny,requestHash:c.requestHash,grantHash:hash}),
    authorizedFetch:async(url,options)=>{
      calls.push({url,method:options.method});
      if(options.method==="POST"){if(timeout)throw new Error("timeout after submission");return new Response('{"id":"reservation1","securityCode":"private-never-projected"}');}
      if(options.method==="DELETE"){deleted=true;return new Response('{}');}
      return new Response(JSON.stringify({id:"reservation1",venueId:request.venueId,workspaceId:request.workspaceId,deleted,
        startTime:preparation.requestedWindow.localStartDate,endTime:mismatch?"2026-09-08T11:00:00":preparation.requestedWindow.localEndDate,status:0,reservationState:0}));
    }};
  return {calls,options,client:createLiquidSpaceReservationLifecycle(options)};
}
test("native creation reads exact booking then cancellation reads deleted state; replay never creates twice",async()=>{
  const {client,calls,options}=fixture();const result=await client.submit();
  assert.equal(result.state,"BOOKING_RECORDED_AWAITING_CAPACITY_ACCEPTANCE");assert.equal(result.capacityReserved,false);
  assert.equal(JSON.stringify(result).includes("private-never-projected"),false);
  await createLiquidSpaceReservationLifecycle(options).submit();assert.equal(calls.filter(c=>c.method==="POST").length,1);
  assert.equal((await client.cancel()).state,"CANCELLATION_CONFIRMED");
  await client.cancel();assert.equal(calls.filter(c=>c.method==="DELETE").length,1);
});
test("ambiguous create is not resubmitted after a process restart",async()=>{
  const {client,calls,options}=fixture({timeout:true});assert.equal((await client.submit()).state,"SUBMISSION_UNKNOWN_NO_RETRY");
  assert.equal((await createLiquidSpaceReservationLifecycle(options).submit()).state,"SUBMISSION_UNKNOWN_NO_RETRY");assert.equal(calls.length,1);
});
test("no operation permission means no provider call",async()=>{
  const {client,calls}=fixture({deny:true});await assert.rejects(client.submit(),/NOT_AUTHORIZED/);assert.equal(calls.length,0);
});
test("a different returned booking window cannot be accepted or canceled",async()=>{
  const {client,calls}=fixture({mismatch:true});assert.equal((await client.submit()).state,"READBACK_UNCONFIRMED");
  assert.equal((await client.cancel()).state,"CANCELLATION_NEEDS_MATCHED_READBACK");assert.equal(calls.filter(c=>c.method==="DELETE").length,0);
});
