/* Called by the existing Node maintenance tick. This only transfers provider
 * events into the original task queue; it cannot create or confirm a goal. */
import path from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
import {interfaceDigest as digest} from './outsider-openapi-demand-matcher.js';
import {readPrivateExecutionBytes,writePrivateExecutionRecordOnce as writeOnce} from './outsider-user-held-durable-execution-v2.js';
const read=file=>JSON.parse(readPrivateExecutionBytes(file));
export function createProviderEventInboxConsumer({nodeDirectory,acceptShopifyOrderEvent,fetchImpl=fetch,clock=()=>Date.now()}){
  const configFile=path.join(nodeDirectory,'connections','shopify-order-inbox.json');
  const directory=path.join(nodeDirectory,'provider-event-ingress');let pending=false;
  function configuration(){
    if(!existsSync(configFile))return null;
    const c=read(configFile),u=new URL(c.origin);
    if(c.schema!=='outsider/provider-event-inbox-connection/v1'||u.protocol!=='https:'||u.origin!==c.origin
      ||!path.isAbsolute(c.readTokenFile??'')||!Number.isFinite(Date.parse(c.expiresAt)))throw new Error('PROVIDER_INBOX_CONFIG_INVALID');
    return c;
  }
  async function exchange(c,route,body){
    const token=read(c.readTokenFile);
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{24,256}$/u.test(token))throw new Error('PROVIDER_INBOX_TOKEN_INVALID');
    const response=await fetchImpl(`${c.origin}${route}`,{method:body?'POST':'GET',redirect:'error',
      signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw new Error(`PROVIDER_INBOX_HTTP_${response.status}`);
    const chunks=[];let size=0;for await(const b of response.body){size+=b.length;if(size>980000)throw new Error('PROVIDER_INBOX_RESPONSE_TOO_LARGE');chunks.push(b);}
    return JSON.parse(Buffer.concat(chunks));
  }
  return {status(){const c=configuration();return {configured:!!c,expired:!!c&&clock()>=Date.parse(c.expiresAt),
    publicReceiver:!!c,platformSubscriptionVerified:false,secondScheduler:false};},
    async poll(){
      const c=configuration();if(!c||pending||clock()>=Date.parse(c.expiresAt))return {processed:0};
      pending=true;let processed=0;
      try{
        for(let n=0;n<4;n++){
          const batch=await exchange(c,'/internal/events');
          if(!Array.isArray(batch.events)||batch.events.length>1)throw new Error('PROVIDER_INBOX_BATCH_INVALID');
          if(!batch.events.length)break;
          const event=batch.events[0];if(!Number.isSafeInteger(event.sequence)||event.sequence<1)throw new Error('PROVIDER_INBOX_SEQUENCE_INVALID');
          const result=await acceptShopifyOrderEvent({headers:event.headers,bodyBase64:event.bodyBase64});
          mkdirSync(directory,{recursive:true,mode:0o700});
          // The raw matched order already lives in its private buyer session.
          // This transfer receipt carries only correlation and disposition.
          const body={schema:'outsider/provider-event-transfer/v1',inboxOrigin:c.origin,sequence:event.sequence,
            envelopeHash:digest({headers:event.headers,bodyBase64:event.bodyBase64}),
            accepted:result.accepted,transactionIds:result.transactionIds??[],
            affectedTaskIds:(result.affectedTasks??[]).map(t=>t.taskId)};
          const file=path.join(directory,`${digest({origin:c.origin,sequence:event.sequence}).slice(7)}.json`);
          if(!existsSync(file))writeOnce(file,body);
          await exchange(c,'/internal/ack',{throughSequence:event.sequence});processed++;
        }
        return {processed};
      }finally{pending=false;}
    }};
}
