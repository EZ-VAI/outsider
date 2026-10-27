#!/usr/bin/env node
/* One versioned, free-scope platform inbox. No checkout, billing change,
 * supplier task, or order webhook subscription is created by deployment. */
import path from 'node:path';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readPrivateExecutionBytes,writePrivateExecutionRecordOnce as writeOnce} from '../src/outsider-user-held-durable-execution-v2.js';
import {createShopifyPlatformAccess} from '../src/outsider-shopify-platform-access.js';
const read=file=>JSON.parse(readPrivateExecutionBytes(file));
const hash=bytes=>`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
export async function deployProviderEventInbox({nodeDirectory,profileFile,directory,sourceRoot=process.cwd()}){
  const profile=read(profileFile),c=profile.cloudflare;
  if(profile.zeroCostScope?.confirmed!==true||Date.parse(profile.zeroCostScope.expiresAt)<=Date.now())throw new Error('EXISTING_ZERO_COST_SCOPE_REQUIRED');
  if(![nodeDirectory,directory,sourceRoot].every(p=>path.isAbsolute(p)))throw new Error('ABSOLUTE_PATH_REQUIRED');
  const source=readFileSync(path.join(sourceRoot,'deploy/cloudflare-provider-event-inbox/src/worker.mjs'));
  const sourceHash=hash(source),scriptName=`outsider-events-${sourceHash.slice(7,27)}`;
  const origin=`https://${scriptName}.${c.workersDevSubdomain}.workers.dev`;
  const endpoint=`https://api.cloudflare.com/client/v4/accounts/${c.accountId}/workers/scripts/${scriptName}`;
  mkdirSync(directory,{recursive:true,mode:0o700});
  const file=name=>path.join(directory,`${name}.json`);
  if(!existsSync(file('private-routing')))writeOnce(file('private-routing'),{
    nodeReadToken:randomBytes(32).toString('base64url'),ingressPathToken:randomBytes(32).toString('base64url')});
  const routing=read(file('private-routing'));
  const credentials=read(c.workersCredentialsFile),apiToken=credentials.cloudflare.apiToken;
  async function api(name,url,method='GET',body){
    const response=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(25000),headers:{
      authorization:`Bearer ${apiToken}`,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},...(body?{body}:{})});
    const bytes=Buffer.from(await response.arrayBuffer());let value;try{value=JSON.parse(bytes);}catch{}
    const receipt={source:'CLOUDFLARE_WORKERS_API',method,url,status:response.status,observedAt:new Date().toISOString(),bodyBytes:bytes.length,
      bodyHash:hash(bytes),bodyBase64:bytes.toString('base64')};
    writeOnce(file(`${name}-${randomBytes(5).toString('hex')}`),receipt);
    return {status:response.status,value,receiptHash:hash(Buffer.from(JSON.stringify(receipt)))};
  }
  if(!existsSync(file('uploaded'))){
    const prior=await api('before',endpoint);
    if(prior.status!==404)throw new Error('VERSIONED_WORKER_NAMESPACE_NOT_EMPTY');
    const metadata={main_module:'worker.mjs',compatibility_date:'2026-09-07',compatibility_flags:['nodejs_compat'],
      observability:{enabled:false},logpush:false,
      bindings:[{type:'durable_object_namespace',name:'EVENTS',class_name:'ProviderEventInbox'},
        {type:'plain_text',name:'EXPIRES_AT',text:profile.zeroCostScope.expiresAt},
        {type:'secret_text',name:'NODE_READ_TOKEN',text:routing.nodeReadToken},
        {type:'secret_text',name:'INGRESS_PATH_TOKEN',text:routing.ingressPathToken},
        {type:'secret_text',name:'SHOPIFY_WEBHOOK_SECRET',text:createShopifyPlatformAccess({nodeDirectory}).webhookSecret()}],
      migrations:{new_tag:'v1',steps:[{new_sqlite_classes:['ProviderEventInbox']}]}};
    const form=new FormData();form.set('metadata',JSON.stringify(metadata));form.set('worker.mjs',new Blob([source],{type:'application/javascript+module'}),'worker.mjs');
    const upload=await api('upload',endpoint,'PUT',form);
    if(upload.status!==200||upload.value?.success!==true)throw new Error(`INBOX_UPLOAD_HTTP_${upload.status}`);
    writeOnce(file('uploaded'),{scriptName,origin,sourceHash,receiptHash:upload.receiptHash,version:upload.value.result?.id??null});
  }
  if(!existsSync(file('enabled'))){
    const enabled=await api('enable',`${endpoint}/subdomain`,'POST',JSON.stringify({enabled:true,previews_enabled:false}));
    if(enabled.status!==200||enabled.value?.success!==true)throw new Error('INBOX_PUBLIC_ROUTE_NOT_ENABLED');
    writeOnce(file('enabled'),{receiptHash:enabled.receiptHash});
  }
  const readTokenFile=file('node-read-token');writeOnce(readTokenFile,routing.nodeReadToken);
  const connection={schema:'outsider/provider-event-inbox-connection/v1',origin,readTokenFile,expiresAt:profile.zeroCostScope.expiresAt};
  writeOnce(path.join(nodeDirectory,'connections','shopify-order-inbox.json'),connection);
  const result={schema:'outsider/provider-event-inbox-publication/v1',scriptName,origin,sourceHash,
    deliveryUrl:`${origin}/shopify/${routing.ingressPathToken}`,expiresAt:connection.expiresAt,
    vendorSubscriptionRegistered:false,paymentPerformed:false,billingPlanChanged:false};
  writeOnce(file('publication'),result);
  return {...result,deliveryUrl:'PRIVATE_REGISTRATION_URL_SAVED_LOCALLY'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const [nodeDirectory,profileFile,directory,...extra]=process.argv.slice(2);if(extra.length)throw new Error('ARGUMENT_INVALID');
    console.log(JSON.stringify(await deployProviderEventInbox({nodeDirectory,profileFile,directory})));}
  catch(e){console.error(/^[A-Z][A-Z0-9_]+$/u.test(e.message)?e.message:'INBOX_DEPLOYMENT_FAILED');process.exitCode=1;}
}
