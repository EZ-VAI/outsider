/* Source-aware model planning over a previously interpreted demand graph.
 * Plans search requests, not URLs, supplier commitments or executable actions.
 */
export const DEMAND_SOURCE_QUERY_SCHEMA = {
  type:"object",additionalProperties:false,required:["queries","notSearchableYet"],properties:{
    queries:{type:"array",items:{type:"object",additionalProperties:false,
      required:["requirementId","provider","query","purpose"],properties:{
        requirementId:{type:"string"},provider:{type:"string",enum:["MCP_REGISTRY","BRAVE"]},
        query:{type:"string"},purpose:{type:"string",enum:["PRIMARY","RECOVERY","WITNESS","OWNER_INTERFACE"]}}}},
    notSearchableYet:{type:"array",items:{type:"object",additionalProperties:false,
      required:["requirementId","reason"],properties:{requirementId:{type:"string"},reason:{type:"string"}}}},
  },
};
export function validateDemandSourceQueryPlan(value, graph) {
  if(!value||!Array.isArray(value.queries)||value.queries.length>24||!Array.isArray(value.notSearchableYet)
    ||value.notSearchableYet.length>24)return false;
  const ids=new Set(graph.requirements.map(r=>r.id)), covered=new Set(), seen=new Set(), perNeed=new Map();
  for(const row of value.queries){
    if(!ids.has(row?.requirementId)||!["MCP_REGISTRY","BRAVE"].includes(row.provider)
      ||!["PRIMARY","RECOVERY","WITNESS","OWNER_INTERFACE"].includes(row.purpose)
      ||typeof row.query!=="string"||!row.query.trim()||row.query!==row.query.trim()
      ||/[\u0000-\u001f\u007f]/u.test(row.query))return false;
    if(row.provider==="MCP_REGISTRY"&&(Buffer.byteLength(row.query)>80||row.query.split(/\s+/u).length>3
      ||/https?:|site:/iu.test(row.query)))return false;
    if(row.provider==="BRAVE"&&(Buffer.byteLength(row.query)>400||row.query.split(/\s+/u).length>50))return false;
    const key=JSON.stringify([row.requirementId,row.provider,row.query]); if(seen.has(key))return false;
    seen.add(key);covered.add(row.requirementId);
    const count=(perNeed.get(row.requirementId)??0)+1;if(count>4)return false;perNeed.set(row.requirementId,count);
  }
  for(const row of value.notSearchableYet){
    if(!ids.has(row?.requirementId)||typeof row.reason!=="string"||!row.reason||row.reason.length>2000)return false;
    covered.add(row.requirementId);
  }
  return [...ids].every(id=>covered.has(id));
}
export async function planDemandSourceQueries({graph,interpret,sourceAvailability={MCP_REGISTRY:true,BRAVE:false}}){
  const packet={task:"Plan source-specific discovery queries for this FULL existing demand graph. Do not redo the graph or generate URLs. MCP_REGISTRY only supports case-insensitive SUBSTRING matching of SERVER NAMES, not semantic web search: use a short plausible connector/product/category name, max 3 words, and only for needs plausibly served by a connector. BRAVE supports normal web search: seek actual seller transaction interfaces, APIs and marketplaces, NOT generic regulatory or how-to guidance. Keep useful BRAVE plans even when execution is deferred for cost; do not replace physical supply needs with unrelated MCP nodes. Cover each requirement with at least one query or an explicit notSearchableYet reason. Use 1-2 queries per requirement, max 24 total; include recovery and independent witness needs where relevant. Missing private site facts may limit local capacity discovery but need not prevent generic interface discovery. Do not include private addresses, personal contact details or credentials in any query. These are query hypotheses, not resource availability. Return JSON only.",
    requirements:graph.requirements.map(({id,outcome,capability,resourceKinds,acceptance,recoveryNeeds})=>
      ({id,outcome,capability,resourceKinds,acceptance,recoveryNeeds})),
    queryQuality: "For BRAVE, use concise queries of about 4-12 words, one actual resource and one transaction intent per query. Do NOT concatenate the entire requirement/acceptance checklist: that returns SEO tutorials instead of sellers. Seek developer API, book online, request quote or rental inventory specifically. Avoid adding privacy/accessibility/revocation buzzwords to every query. Include at least one independent WITNESS and one different-provider RECOVERY query when the graph requires them.",
    sourceAvailability,sourceSemantics:{MCP_REGISTRY:"SERVER_NAME_SUBSTRING",BRAVE:"PUBLIC_WEB_SEARCH"},
    responseSchema:DEMAND_SOURCE_QUERY_SCHEMA};
  const result=await interpret(packet);
  if(!validateDemandSourceQueryPlan(result,graph))throw new Error("DEMAND_SOURCE_QUERY_PLAN_INVALID");
  return {...result,schema:"outsider/demand-source-query-plan/v1",sourceAvailability,
    executableCapacityEstablished:false,sourcePlanOrigin:"MODEL_PLANNED_NOT_PROVIDER_FACT"};
}
