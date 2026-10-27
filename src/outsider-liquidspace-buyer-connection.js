/* Account-local connection. The server configuration, not an order's payload,
 * names credential/grant files. Never copy a browser session implicitly. */
import path from "node:path";
import {existsSync} from "node:fs";
import {readPrivateExecutionBytes} from "./outsider-user-held-durable-execution-v2.js";
const read=file=>JSON.parse(readPrivateExecutionBytes(file));
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function loadLiquidSpaceBuyerConnection(profileFile,{fetchImpl=globalThis.fetch,clock=()=>new Date().toISOString()}={}) {
  if(!profileFile)return null;
  if(!path.isAbsolute(profileFile))fail("BUYER_CONNECTION_PROFILE_INVALID");
  const profile=read(profileFile);
  if(profile.schema!=="outsider/liquidspace-buyer-connection/v1"||!profile.organizerId
    ||![profile.cookieFile,profile.operationGrantsFile].every(file=>path.isAbsolute(file??"")))fail("BUYER_CONNECTION_PROFILE_INVALID");
  const allowedRoute=url=>url.origin==="https://liquidspace.com"&&!url.username&&!url.password&&!url.hash
    &&(/^\/api\/reservations(?:\/[A-Za-z0-9_-]{1,128})?$/u.test(url.pathname)
      ||url.pathname==="/api/Costs/calculate"||url.pathname==="/api/booking/prerequisites/validate"
      ||/^\/api\/venues\/[a-f0-9-]{36}\/workspaces\/[a-f0-9-]{36}\/availability\/check$/iu.test(url.pathname));
  return {
    organizerId:profile.organizerId,
    async fetch(url,options){
      if(!allowedRoute(new URL(url)))fail("BUYER_CONNECTION_DESTINATION_REJECTED");
      const credential=read(profile.cookieFile);
      if(credential.origin!=="https://liquidspace.com"||typeof credential.cookie!=="string"||!credential.cookie||/[\r\n]/u.test(credential.cookie)
        ||!Number.isFinite(Date.parse(credential.expiresAt))||Date.parse(credential.expiresAt)<=Date.parse(clock()))fail("BUYER_CONNECTION_SESSION_UNAVAILABLE");
      return fetchImpl(url,{...options,redirect:"error",headers:{...options.headers,Cookie:credential.cookie}});
    },
    async authorize(context){
      if(!existsSync(profile.operationGrantsFile))return {allowed:false};
      const document=read(profile.operationGrantsFile);
      const grant=document.grants?.find(g=>g.requestHash===context.requestHash&&g.operations?.includes(context.operation)
        &&g.currency===context.currency&&g.amount===context.amount&&Date.parse(g.expiresAt)>Date.parse(clock())
        &&(context.operation!=="CANCEL"||g.cancellationFeeAuthorized===true));
      // A payment-capable CREATE needs explicit payment authority in addition
      // to general account access. This module does not mint either grant.
      if(!grant||(context.operation==="CREATE"&&context.amount>0&&grant.paymentAuthorized!==true))return {allowed:false};
      return {allowed:true,requestHash:grant.requestHash,grantHash:grant.grantHash};
    },
    paymentMethod:profile.paymentMethod??null,
  };
}
