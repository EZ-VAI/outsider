/* Research discovery only. Caller-supplied reference lineage is copied without
 * asserting authority. No paid search, seller contact, remote MCP invocation,
 * order submission, or candidate lease persistence in this CLI.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce }
  from "../src/outsider-user-held-durable-execution-v2.js";
import { compileBraveProductionProbeInputV1 } from "../src/outsider-brave-production-probe-input-compiler-v1.js";
import { createOpenDemandDiscoveryBridge } from "../src/outsider-open-demand-discovery-bridge.js";
import { formOpenResourceDemand } from "../src/outsider-open-resource-demand-graph.js";
import {discoverFederatedMcpDemandSource} from "../src/outsider-federated-mcp-demand-source.js";
const digest = v => `sha256:${createHash("sha256").update(canonicalizeStrict(v)).digest("hex")}`;
const read = f => JSON.parse(readPrivateExecutionBytes(f));
try {
  const [directory, graphFile, requestFile, referenceFile, planFile, mode = "BOOTSTRAP"] = process.argv.slice(2);
  if(!["BOOTSTRAP","MODEL_PLAN_WITH_MCP_OBSERVATION"].includes(mode))throw new Error("SOURCE_DISCOVERY_MODE_INVALID");
  if (![directory,graphFile,requestFile,referenceFile,planFile].every(f=>path.isAbsolute(f??""))) throw new Error("SOURCE_DISCOVERY_ARGUMENT_INVALID");
  mkdirSync(directory,{recursive:true,mode:0o700});
  const file = name => path.join(directory, `${name}.json`);
  const graph = read(graphFile), request = read(requestFile), reference = read(referenceFile), plans = read(planFile);
  writeOnce(file("input-binding"), { graphHash:digest(graph), requestHash:digest(request),
    referenceHash:digest(reference), sourcePlanHash:digest(plans),
    referenceMode:"CALLER_SUPPLIED_RESEARCH_LINEAGE_NOT_AUTHORITY", realOrderEpisodeCreated:false,
    ...(mode === "BOOTSTRAP" ? {} : {mode}) });
  if (existsSync(file("result"))) { console.log(JSON.stringify(read(file("result")).metrics)); process.exit(0); }
  const declarations = new Map(); let attemptedPublicReads = 0;
  const sourceReceipts = [];
  const discover = createOpenDemandDiscoveryBridge({
    allowBillableSearch:false, maximumObservationsPerSource:0,
    ...(mode === "MODEL_PLAN_WITH_MCP_OBSERVATION" ? {federatedMcpSource:discoverFederatedMcpDemandSource} : {}),
    fetchImpl: async (...args) => { attemptedPublicReads++; return fetch(...args); },
    planSources: job => plans.filter(p=>job.requirementIds.includes(p.requirementId)
      && graph.requirements.find(r=>r.id===p.requirementId)?.discoveryQueries[0]===job.query),
    bindRequirement: async ({job,plan}) => {
      const key=digest({job,plan}); if(declarations.has(key))return declarations.get(key);
      const bindingFile=file(`binding-${key.slice(7)}`);
      let compiled;
      if(existsSync(bindingFile))compiled=read(bindingFile);
      else {
        const now=new Date();
        const scopedReferences={...reference.references,
          requestScopeRefHash:`sha256:${randomBytes(32).toString("hex")}`,
          workOrderHash:digest({kind:"RESEARCH_DEMAND_NOT_TRANSACTION",graphHash:digest(graph),requirementId:plan.requirementId})};
        compiled=compileBraveProductionProbeInputV1({requestId:`open_${key.slice(7,39)}`,
          query:plan.query,currentTime:now.toISOString(),formationDeadline:new Date(+now+300000).toISOString(),
          completionDeadline:new Date(+now+600000).toISOString(),references:scopedReferences,
          exactCallerContactAuthorityRefHash:null});
        writeOnce(bindingFile,compiled);
      }
      const binding={tender:compiled.tender,requirementKind:compiled.tenderRequirement.kind,
        requirementId:compiled.tenderRequirement.requirementId,asOf:compiled.asOf,
        expiresAt:compiled.query.expiresAt,privateBindingNonce:compiled.nonces.discoveryPrivateBindingNonce};
      declarations.set(key,binding);return binding;
    },
    onSourceProjection: async source=>{sourceReceipts.push(source);writeOnce(file(`source-projection-${sourceReceipts.length}`),source);},
  });
  const result=await formOpenResourceDemand({request,knownCapabilities:request.knownCapabilities??[],
    interpret:async()=>graph,discover,concurrency:4,maximumDiscoveries:12});
  result.metrics.actualPublicReadAttempts=attemptedPublicReads;
  result.metrics.completedSourceReads=sourceReceipts.filter(s=>s.projection.status==="SUCCEEDED").length;
  result.metrics.failedSourceReads=sourceReceipts.filter(s=>s.projection.status!=="SUCCEEDED").length;
  result.discoveryMode="EXISTING_SOURCE_ADAPTERS_NOT_MODEL_URL_GUESSING";
  result.sourcePlanOrigin=mode === "BOOTSTRAP" ? "ENGINEERING_BOOTSTRAP_FROM_OFFICIAL_INTERFACE_RESEARCH_NOT_AUTOMATIC_TERM_PLANNING"
    : "MODEL_PLANNED_SOURCE_SPECIFIC_QUERIES_NOT_PROVIDER_FACT";
  result.referenceMode="CALLER_SUPPLIED_RESEARCH_LINEAGE_NOT_AUTHORITY";
  result.newExecutableRoutes=0;result.realOrderEpisodeCreated=false;
  writeOnce(file("result"),result);
  console.log(JSON.stringify({state:result.state,metrics:result.metrics,newExecutableRoutes:0,
    sources:sourceReceipts.map(s=>({provider:s.provider,requirementId:s.requirementId,status:s.projection.status,failureCode:s.projection.failureCode})),
    billableSearchPerformed:false,sellerContactPerformed:false,realOrderEpisodeCreated:false}));
} catch(error) {
  const code=error.outsiderCode??error.message;
  console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]{0,160}$/u.test(code??"")?code:"SOURCE_DISCOVERY_FAILED"}));process.exitCode=1;
}
