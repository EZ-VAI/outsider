#!/usr/bin/env node
// Native resource task entry. Uses the production adapter composition; this
// bounded lifecycle is not a formed guarantee or an independent outcome witness.
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {canonicalizeStrict} from '../src/canonical.js';
import {readPrivateExecutionBytes,writePrivateExecutionRecordOnce as writeOnce,
  withUserHeldExecutionLockV2} from '../src/outsider-user-held-durable-execution-v2.js';
import {createCloudflareD1ResourceAdapter} from '../src/outsider-cloudflare-d1-resource-adapter.js';
import {createGitHubDeferredSnapshotAdapter} from '../src/outsider-github-deferred-snapshot-adapter.js';
import {createGitHubImmutableReleasePolicyProductionProbeV1} from '../src/outsider-github-immutable-release-policy-production-probe-v1.js';
import {createRecoverableDataWorkspaceComposition} from '../src/outsider-recoverable-data-workspace-composition.js';
const digest=value=>'sha256:'+createHash('sha256').update(canonicalizeStrict(value)).digest('hex');
const read=file=>JSON.parse(readPrivateExecutionBytes(file));
try {
  const [command,flag,file,...extra]=process.argv.slice(2);
  if(!['preflight','run','status','release'].includes(command)||flag!=='--config'||!path.isAbsolute(file??'')||extra.length)throw new Error('DATA_TASK_ARGUMENT_INVALID');
  const config=read(file);
  if(config.schema!=='outsider/private-data-workspace-task/v1'||config.syntheticData!==true
    ||config.paymentAuthorized!==false||!path.isAbsolute(config.directory??'')
    ||!/^sha256:[a-f0-9]{64}$/.test(config.permissionGrantHash??''))throw new Error('DATA_TASK_CONFIG_INVALID');
  const root=config.directory;mkdirSync(root,{recursive:true,mode:0o700});
  const record=name=>path.join(root,name+'.json');
  if(command==='status'){
    console.log(JSON.stringify({taskId:config.taskId,reserved:existsSync(record('reservation')),
      result:existsSync(record('result'))?read(record('result')):null,
      cleanup:existsSync(record('cleanup'))?read(record('cleanup')):null,commercialCommitmentIssued:false}));
  }else{
    await withUserHeldExecutionLockV2(digest({kind:'DATA_RESOURCE_TASK',directory:root}),async()=>{
      writeOnce(record('task-binding'),{schema:'outsider/private-data-workspace-task-binding/v1',configHash:digest(config),taskId:config.taskId});
      const getApiToken=()=>readPrivateExecutionBytes(config.cloudflareTokenFile).toString('utf8').trim();
      if(command==='preflight'){
        const url=`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database?per_page=10&page=1`;
        const response=await fetch(url,{headers:{authorization:`Bearer ${getApiToken()}`},redirect:'error',signal:AbortSignal.timeout(15000)});
        const body=await response.text();let parsed;try{parsed=JSON.parse(body);}catch{parsed=null;}
        writeOnce(record('d1-preflight-source'),{url,status:response.status,observedAt:new Date().toISOString(),bodyBase64:Buffer.from(body).toString('base64')});
        if(response.status!==200||parsed?.success!==true||!Array.isArray(parsed.result))throw new Error('DATA_TASK_D1_ACCESS_UNAVAILABLE');
        console.log(JSON.stringify({d1Access:true,databaseCount:parsed.result.length,provider:'CLOUDFLARE_D1_API',providerWrites:0}));return;
      }
      const credentials=read(config.githubCredentialsFile).githubReleaseAsset;
      const immutableReleasePolicyProbe=createGitHubImmutableReleasePolicyProductionProbeV1({
        apiToken:credentials.administrationReadApiToken,administrationReadCapabilityConfirmed:credentials.administrationReadCapabilityConfirmed,
        owner:config.github.owner,repository:config.github.repository});
      const github={...config.github,apiToken:credentials.contentsWriteApiToken,immutableReleasePolicyProbe};
      const d1={accountId:config.accountId,getApiToken,syntheticData:true,zeroCostScope:config.zeroCostScope};
      const composition=createRecoverableDataWorkspaceComposition({directory:path.join(root,'composition'),permissionGrantHash:config.permissionGrantHash,
        primaryAdapter:createCloudflareD1ResourceAdapter({...d1,directory:path.join(root,'primary'),records:config.records,adapterId:'d1-source-workspace'}),
        createBackupAdapter:({directory,snapshotSource})=>createGitHubDeferredSnapshotAdapter({directory,snapshotSource,github}),
        createRestoreAdapter:({directory,records,recordSourceRefHash})=>createCloudflareD1ResourceAdapter({...d1,directory,records,recordSourceRefHash,adapterId:'d1-restored-workspace'})});
      const context={program:config.program,requirement:config.requirement,operationId:config.taskId};
      if(command==='run'){
        if(existsSync(record('cleanup')))throw new Error('DATA_TASK_ALREADY_CLEANED');
        if(!existsSync(record('reservation')))writeOnce(record('reservation'),await composition.adapter.reserve(context));
        const result=await composition.adapter.execute({...context,reservation:read(record('reservation'))});
        writeOnce(record('result'),result);console.log(JSON.stringify({taskId:config.taskId,...result}));
      }else{
        if(!existsSync(record('reservation')))throw new Error('DATA_TASK_NO_OWNED_RESERVATION');
        if(existsSync(record('cleanup'))){console.log(JSON.stringify(read(record('cleanup'))));return;}
        const result=await composition.adapter.release({...context,reservation:read(record('reservation'))});
        if(result.status==='RELEASED')writeOnce(record('cleanup'),result);
        console.log(JSON.stringify({taskId:config.taskId,...result}));
      }
    });
  }
}catch(error){
  const candidate=error.outsiderCode??error.code??error.message;
  console.error(/^[A-Z][A-Z0-9_]{0,160}$/.test(candidate??'')?candidate:'DATA_TASK_OPERATION_FAILED');process.exitCode=1;
}
