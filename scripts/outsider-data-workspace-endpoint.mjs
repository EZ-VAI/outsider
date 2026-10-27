#!/usr/bin/env node
// Dynamic database read surface for a task-owned synthetic workspace.
import path from 'node:path';
import {createCloudflareD1ReadEndpoint} from '../src/outsider-cloudflare-d1-read-endpoint.js';
import {readPrivateExecutionBytes,writePrivateExecutionRecordOnce as writeOnce} from '../src/outsider-user-held-durable-execution-v2.js';
try {
  const [command,flag,file,...extra]=process.argv.slice(2);
  if(!['deploy','read','release'].includes(command)||flag!=='--config'||!path.isAbsolute(file??'')||extra.length)throw new Error('DATA_ENDPOINT_ARGUMENT_INVALID');
  const config=JSON.parse(readPrivateExecutionBytes(file));
  const endpoint=createCloudflareD1ReadEndpoint({...config,getApiToken:()=>JSON.parse(readPrivateExecutionBytes(config.workersCredentialsFile)).cloudflare.apiToken});
  const result=await endpoint[command]();
  if(command==='deploy'&&config.observationInputFile)writeOnce(config.observationInputFile,{
    directory:config.observationDirectory,outputFile:config.observationOutputFile,
    taskId:config.namespace,operationId:config.namespace+'_restored_globalping',
    targetUrl:endpoint.routeUrl,expectedBodyHash:endpoint.expectedBodyHash});
  console.log(JSON.stringify(result));
  if(result.status==='NOT_SATISFIED'||result.status==='OPEN')process.exitCode=2;
}catch(error){const code=error.outsiderCode??error.code??error.message;
  console.error(/^[A-Z][A-Z0-9_]{0,160}$/.test(code??'')?code:'DATA_ENDPOINT_FAILED');process.exitCode=1;}
