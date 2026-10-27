import test from "node:test";
import assert from "node:assert/strict";
import { createOpenDemandDiscoveryBridge } from "../src/outsider-open-demand-discovery-bridge.js";
const job = { query:"external resource API", requirementIds:["installation"], candidateDocumentationUrls:[] };
test("billable search is deferred before credentials or provider contact", async () => {
  let calls=0;
  const discover=createOpenDemandDiscoveryBridge({ braveApiToken:"fixture-token",allowBillableSearch:false,
    planSources:()=>[{provider:"BRAVE",requirementId:"installation",query:job.query}],
    bindRequirement:()=>{throw new Error("must not bind paid route");},fetchImpl:()=>{calls++;} });
  const value=await discover(job);
  assert.equal(calls,0);assert.equal(value.sources[0].state,"DEFERRED_BILLABLE_SEARCH");
  assert.equal(value.actionPermitted,false);assert.deepEqual(value.unresolvedRequirements,["installation"]);
});
test("invalid source binding produces a failure, never guessed authority or a replacement protocol", async () => {
  let calls=0;
  const discover=createOpenDemandDiscoveryBridge({
    planSources:()=>[{provider:"MCP_REGISTRY",requirementId:"installation",query:"network"}],
    bindRequirement:()=>({}),fetchImpl:()=>{calls++;} });
  const value=await discover(job);
  assert.equal(value.sources[0].state,"SOURCE_BINDING_OR_READ_FAILED");
  assert.equal(calls,0);assert.deepEqual(value.candidates,[]);
});
