import test from "node:test";
import assert from "node:assert/strict";
import {validateDemandSourceQueryPlan,planDemandSourceQueries} from "../src/outsider-demand-source-query-planner.js";
const graph={requirements:[{id:"install",outcome:"physical installation",capability:"INSTALL",resourceKinds:[],acceptance:[],recoveryNeeds:[]},
  {id:"observe",outcome:"independent acceptance",capability:"OBSERVE",resourceKinds:[],acceptance:[],recoveryNeeds:[]}]};
const valid={queries:[{requirementId:"install",provider:"BRAVE",query:"onsite installer marketplace API",purpose:"PRIMARY"}],
  notSearchableYet:[{requirementId:"observe",reason:"Independent acceptance criteria still missing"}]};
test("physical work remains a web discovery plan even while billable execution is deferred",async()=>{
  const result=await planDemandSourceQueries({graph,interpret:async packet=>{
    assert.equal(packet.sourceSemantics.MCP_REGISTRY,"SERVER_NAME_SUBSTRING");return valid;}});
  assert.equal(result.queries[0].provider,"BRAVE");assert.equal(result.sourceAvailability.BRAVE,false);
  assert.equal(result.executableCapacityEstablished,false);
});
test("every requirement must remain visible and unknown requirement ids cannot enter the plan",()=>{
  assert.equal(validateDemandSourceQueryPlan({...valid,notSearchableYet:[]},graph),false);
  assert.equal(validateDemandSourceQueryPlan({...valid,queries:[{...valid.queries[0],requirementId:"invented"}]},graph),false);
});
test("semantic web queries are not silently treated as MCP server name searches",()=>{
  assert.equal(validateDemandSourceQueryPlan({...valid,queries:[{...valid.queries[0],provider:"MCP_REGISTRY",
    query:"find all independent onsite installers near the office"}]},graph),false);
});
