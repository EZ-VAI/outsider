import {mkdirSync,existsSync} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {canonicalizeStrict} from "../src/canonical.js";
import {readPrivateExecutionBytes,writePrivateExecutionRecordOnce as writeOnce} from "../src/outsider-user-held-durable-execution-v2.js";
import {createWorldStateGoalCommandInterpreter} from "../src/outsider-world-state-goal-model.js";
import {DEMAND_SOURCE_QUERY_SCHEMA,validateDemandSourceQueryPlan,planDemandSourceQueries} from "../src/outsider-demand-source-query-planner.js";
const read=f=>JSON.parse(readPrivateExecutionBytes(f));
const digest=v=>`sha256:${createHash("sha256").update(canonicalizeStrict(v)).digest("hex")}`;
try{
  const [directory,graphFile,modelFile]=process.argv.slice(2);
  if(![directory,graphFile,modelFile].every(f=>path.isAbsolute(f??"")))throw new Error("SOURCE_PLAN_ARGUMENT_INVALID");
  mkdirSync(directory,{recursive:true,mode:0o700});const file=n=>path.join(directory,`${n}.json`);
  const graph=read(graphFile);writeOnce(file("input-binding"),{graphHash:digest(graph)});
  if(existsSync(file("plan"))){console.log(JSON.stringify(read(file("plan"))));process.exit(0);}
  writeOnce(file("schema"),DEMAND_SOURCE_QUERY_SCHEMA);
  const command=[...read(modelFile).argv],si=command.indexOf("--output-schema"),ci=command.indexOf("--cd");
  if(si<0||ci<0)throw new Error("SOURCE_PLAN_MODEL_CONFIG_INVALID");
  command[si+1]=file("schema");command[ci+1]=directory;
  command.splice(command.length-1,0,"-c",'model_reasoning_effort="low"');
  const interpret=createWorldStateGoalCommandInterpreter({command,timeoutMs:120000,
    validateResponse:value=>validateDemandSourceQueryPlan(value,graph)});
  const started=Date.now(),plan=await planDemandSourceQueries({graph,interpret});
  writeOnce(file("plan"),{...plan,planningMs:Date.now()-started});
  writeOnce(file("queries"),plan.queries);
  console.log(JSON.stringify({queries:plan.queries,notSearchableYet:plan.notSearchableYet,planningMs:Date.now()-started}));
}catch(error){console.error(JSON.stringify({error:error.code??"SOURCE_PLAN_FAILED",failure:error.failure??null}));process.exitCode=1;}
