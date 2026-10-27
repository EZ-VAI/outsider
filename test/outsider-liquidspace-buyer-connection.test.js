import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import {mkdtempSync} from "node:fs";
import {writePrivateExecutionRecordOnce as writeOnce} from "../src/outsider-user-held-durable-execution-v2.js";
import {loadLiquidSpaceBuyerConnection} from "../src/outsider-liquidspace-buyer-connection.js";
test("account session stays on the seller and general access is not payment authority",async()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),"outsider-buyer-connection-")),profile=path.join(root,"profile.json"),cookieFile=path.join(root,"cookie.json"),operationGrantsFile=path.join(root,"grants.json");
  writeOnce(profile,{schema:"outsider/liquidspace-buyer-connection/v1",organizerId:"buyer",cookieFile,operationGrantsFile});
  writeOnce(cookieFile,{origin:"https://liquidspace.com",cookie:"fixture-only",expiresAt:"2030-01-01T00:00:00.000Z"});
  const h=`sha256:${"a".repeat(64)}`;writeOnce(operationGrantsFile,{grants:[{requestHash:h,operations:["CREATE","READ"],amount:100,currency:"USD",expiresAt:"2030-01-01T00:00:00.000Z",grantHash:h}]});
  const calls=[];const c=loadLiquidSpaceBuyerConnection(profile,{fetchImpl:async(url,opts)=>{calls.push({url,opts});return new Response('{}');}});
  await assert.rejects(c.fetch("https://unrelated.example/api/reservations",{}),/DESTINATION/);
  await c.fetch("https://liquidspace.com/api/Costs/calculate",{method:"POST"});assert.equal(calls[0].opts.headers.Cookie,"fixture-only");
  const context={requestHash:h,operation:"CREATE",amount:100,currency:"USD"};assert.equal((await c.authorize(context)).allowed,false);
  assert.equal((await c.authorize({...context,operation:"READ"})).allowed,true);
});
