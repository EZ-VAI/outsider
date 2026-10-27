#!/usr/bin/env node
/* Explicit local setup. The secret comes from stdin, never argv or stdout. */
import path from 'node:path';
import {mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {writePrivateExecutionRecordOnce as writeOnce} from '../src/outsider-user-held-durable-execution-v2.js';
import {createShopifyPlatformAccess} from '../src/outsider-shopify-platform-access.js';
export async function connectShopifyPlatform({nodeDirectory,credentialDirectory,clientId,clientSecret,profileUrl}) {
  if(!path.isAbsolute(nodeDirectory??'')||!path.isAbsolute(credentialDirectory??'')
    ||![clientId,clientSecret].every(v=>typeof v==='string'&&v.length>=8&&v.length<=2048))throw new Error('SHOPIFY_CONNECTION_INPUT_INVALID');
  const url=new URL(profileUrl);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search)throw new Error('SHOPIFY_PROFILE_INVALID');
  mkdirSync(credentialDirectory,{recursive:true,mode:0o700});
  mkdirSync(path.join(nodeDirectory,'connections'),{recursive:true,mode:0o700});
  const credentialsFile=path.join(credentialDirectory,'credentials.json');
  writeOnce(credentialsFile,{clientId,clientSecret});
  writeOnce(path.join(nodeDirectory,'connections','shopify-platform-access.json'),{
    schema:'outsider/shopify-platform-access/v1',credentialsFile,profileUrl});
  const status=await createShopifyPlatformAccess({nodeDirectory}).verify();
  writeOnce(path.join(credentialDirectory,'token-scope-observation.json'),status);
  return status;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const [nodeDirectory,credentialDirectory,clientId,profileUrl,...extra]=process.argv.slice(2);
    if(extra.length)throw new Error('SHOPIFY_CONNECTION_ARGUMENT_INVALID');
    let clientSecret='';for await(const chunk of process.stdin){clientSecret+=chunk;if(clientSecret.length>2048)throw new Error('SHOPIFY_SECRET_TOO_LARGE');}
    console.log(JSON.stringify(await connectShopifyPlatform({nodeDirectory,credentialDirectory,clientId,profileUrl,clientSecret:clientSecret.trim()})));
  }catch(e){console.error(/^[A-Z][A-Z0-9_]+$/u.test(e.message)?e.message:'SHOPIFY_CONNECTION_FAILED');process.exitCode=1;}
}
