import test from "node:test";
import assert from "node:assert/strict";
import { formOpenResourceDemand, validateOpenResourceDemand } from "../src/outsider-open-resource-demand-graph.js";
const requirement = (id, dependsOn=[]) => ({ id, dependsOn, outcome:`${id} ready`, capability:id,
  acceptance:["measured joint state"], recoveryNeeds:["alternative provider"], resourceKinds:["resource-owner"],
  discoveryQueries:["shared official resource API"], candidateDocumentationUrls:[] });
const request = { goal:"Mixed physical and digital outcome", publicDiscoveryApproved:true };
test("unknown outcomes survive catalog matching and shared discovery is called once", async () => {
  let calls=0;
  const result=await formOpenResourceDemand({request, knownCapabilities:[],
    interpret:async()=>({summary:"full goal",missingFacts:["site unknown"],requirements:[requirement("install"),requirement("verify",["install"])]}),
    discover:async()=>{calls++;return {candidates:[{state:"DOCUMENTATION_OBSERVED_NOT_CAPACITY"}]};}});
  assert.equal(calls,1);assert.equal(result.integrationFrontier.length,2);
  assert.equal(result.metrics.dependencyEdges,1);assert.equal(result.completeTemporaryNetwork,false);
  assert.deepEqual(result.graph.missingFacts,["site unknown"]);
});
test("cycles cannot start discovery", async () => {
  const graph={summary:"cycle",missingFacts:[],requirements:[requirement("a",["b"]),requirement("b",["a"])]};
  assert.equal(validateOpenResourceDemand(graph),false);
  await assert.rejects(()=>formOpenResourceDemand({request,interpret:async()=>graph,
    discover:()=>{throw new Error("must not contact");}}),/GRAPH_INVALID/u);
});
test("bounded frontier does not hide unsearched needs and one failure preserves siblings", async () => {
  const requirements=["a","b","c"].map(id=>({...requirement(id),discoveryQueries:[id]}));
  const result=await formOpenResourceDemand({request,maximumDiscoveries:2,
    interpret:async()=>({summary:"mixed",missingFacts:[],requirements}),
    discover:async({query})=>{if(query==="a")throw new Error("provider unavailable");return {candidates:[]};}});
  assert.equal(result.observations[0].result.state,"DISCOVERY_FAILED");
  assert.deepEqual(result.integrationFrontier[2].pendingQueries,["c"]);
  assert.equal(result.metrics.deferredDiscoveryJobs,1);
});
