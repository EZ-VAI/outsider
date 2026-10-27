/* Calendly's official MCP + dynamic OAuth registration. Booking tools require
 * an additional scheduling-write grant; direct rescheduling is not supported.
 * https://developer.calendly.com/docs/mcp/calendly-mcp-server
 * https://developer.calendly.com/docs/mcp/supported-tools */
import {randomBytes,createHash} from 'node:crypto';
export const CALENDLY_SUPPLY_SCOPES=Object.freeze(['mcp:scheduling:read']);
export const CALENDLY_SUPPLY_BOOKING_SCOPES=Object.freeze([...CALENDLY_SUPPLY_SCOPES,'mcp:scheduling:write']);
const MCP='https://mcp.calendly.com/',AUTH='https://calendly.com';
const fail=code=>{throw Object.assign(new Error(`CALENDLY_SUPPLY_${code}`),{code:`CALENDLY_SUPPLY_${code}`});};
const secret=value=>{if(typeof value!=='string'||!value||value.length>8192||/[\x00-\x20]/u.test(value))fail('CREDENTIAL_INVALID');return value;};
const uriId=(uri,kind)=>{const m=new RegExp(`^https://api\\.calendly\\.com/${kind}/([A-Za-z0-9_-]{1,191})$`,'u').exec(uri??'');if(!m)fail('RESPONSE_INVALID');return m[1];};
async function request(fetchImpl,url,{headers={},body,method='GET'}={}){
  let res;try{res=await fetchImpl(url,{method,headers:{accept:'application/json',...headers},...(body===undefined?{}:{body}),redirect:'error',signal:AbortSignal.timeout(15000)});}catch{fail('TRANSPORT_FAILED');}
  if(!res.ok){await res.body?.cancel();fail([401,403].includes(res.status)?'UNAUTHORIZED':res.status===429?'RATE_LIMITED':'UPSTREAM_UNAVAILABLE');}
  let size=0;const chunks=[];if(res.body)for await(const chunk of res.body){size+=chunk.length;if(size>4*1024*1024)fail('RESPONSE_TOO_LARGE');chunks.push(Buffer.from(chunk));}const text=Buffer.concat(chunks).toString('utf8');
  if(!text.trim())return {value:null,headers:res.headers};
  try{return {value:JSON.parse(text),headers:res.headers};}catch{}
  // Streamable HTTP servers may send a finite SSE response for each RPC.
  const values=text.split(/\r?\n\r?\n/u).flatMap(event=>{const data=event.split(/\r?\n/u).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');try{return [JSON.parse(data)];}catch{return [];}});
  if(!values.length)fail('RESPONSE_INVALID');return {value:values.at(-1),headers:res.headers};
}
export async function registerCalendlySupplyApplication({redirectUri,fetchImpl=fetch}){
  const redirect=new URL(redirectUri);if(redirect.protocol!=='https:'||redirect.username||redirect.password||redirect.search||redirect.hash||redirect.pathname!=='/v1/supply/callback/calendly')fail('CONFIG_INVALID');
  const resource=(await request(fetchImpl,MCP+'.well-known/oauth-protected-resource')).value;
  const metadata=(await request(fetchImpl,AUTH+'/.well-known/oauth-authorization-server')).value;
  if(resource.resource!==MCP||!resource.authorization_servers?.includes(AUTH+'/')||!resource.scopes_supported?.includes(CALENDLY_SUPPLY_SCOPES[0])
    ||metadata.authorization_endpoint!==AUTH+'/oauth/authorize'||metadata.token_endpoint!==AUTH+'/oauth/token'
    ||metadata.registration_endpoint!==AUTH+'/oauth/register'||!metadata.code_challenge_methods_supported?.includes('S256'))fail('METADATA_CHANGED');
  const registration=(await request(fetchImpl,metadata.registration_endpoint,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({client_name:'Outsider',redirect_uris:[redirectUri],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})})).value;
  secret(registration?.client_id);if(!registration.redirect_uris?.includes(redirectUri)||registration.client_secret||registration.token_endpoint_auth_method!=='none')fail('REGISTRATION_INVALID');
  return {environment:'production',clientId:registration.client_id,redirectUri,dynamicRegistration:true};
}
// Tool schemas come from the authorized server. Accept only known field names
// (snake/camel case, including an optional query wrapper); unknown requirements
// cause a visible failure instead of guessing or calling a different tool.
function toolArguments(schema,values){
  const normalize=s=>s.replaceAll('_','').toLowerCase();const seen=new Set();
  function build(shape,depth=0){if(depth>4)fail('TOOL_SCHEMA_UNSUPPORTED');const result={};
    for(const [key,property] of Object.entries(shape?.properties??{})){
      const source=Object.keys(values).find(k=>normalize(k)===normalize(key));
      if(source!==undefined){result[key]=values[source];seen.add(source);}
      else if(property?.type==='object'&&['query','queryparameters','params','parameters','body','requestbody','path','pathparameters'].includes(normalize(key)))result[key]=build(property,depth+1);
      else if(shape.required?.includes(key))fail('TOOL_SCHEMA_UNSUPPORTED');
    }return result;
  }
  const result=build(schema);if(Object.keys(values).some(k=>!seen.has(k)))fail('TOOL_SCHEMA_UNSUPPORTED');return result;
}
async function withTools(fetchImpl,accessToken,operation){
  let sequence=0,session=null,protocol='2025-03-26';
  const headers=()=>({authorization:`Bearer ${secret(accessToken)}`,'content-type':'application/json',accept:'application/json, text/event-stream',
    ...(session?{'mcp-session-id':session}:{}),'mcp-protocol-version':protocol});
  async function rpc(method,params){const id=++sequence,{value,headers:responseHeaders}=await request(fetchImpl,MCP,{method:'POST',headers:headers(),body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
    if(responseHeaders.get('mcp-session-id'))session=responseHeaders.get('mcp-session-id');
    if(value?.id!==id||value.error||!value.result)fail('MCP_REQUEST_FAILED');return value.result;
  }
  try{
    const initialized=await rpc('initialize',{protocolVersion:protocol,capabilities:{},clientInfo:{name:'Outsider',version:'1.0.0'}});
    if(!['2024-11-05','2025-03-26','2025-06-18'].includes(initialized.protocolVersion))fail('PROTOCOL_UNSUPPORTED');protocol=initialized.protocolVersion;
    await request(fetchImpl,MCP,{method:'POST',headers:headers(),body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})});
    let tools=[],cursor;for(let n=0;n<20;n++){const page=await rpc('tools/list',cursor?{cursor}:{});if(!Array.isArray(page.tools))fail('TOOLS_INVALID');tools.push(...page.tools);cursor=page.nextCursor;if(!cursor)break;if(n===19)fail('TOOLS_INCOMPLETE');}
    const allowed=['users-get_current_user','event_types-list_event_types','event_types-get_event_type','event_types-list_event_type_available_times',
      'meetings-create_invitee','meetings-get_event','meetings-cancel_event','meetings-list_events','meetings-list_event_invitees','meetings-get_event_invitee'];
    return await operation(async(name,values={})=>{if(!allowed.includes(name))fail('TOOL_NOT_ALLOWED');const tool=tools.find(t=>t.name===name);if(!tool)fail('TOOL_NOT_AVAILABLE');
      const result=await rpc('tools/call',{name,arguments:toolArguments(tool.inputSchema,values)});if(result.isError)fail('TOOL_FAILED');
      if(result.structuredContent)return result.structuredContent;
      for(const block of result.content??[])if(block.type==='text')try{return JSON.parse(block.text);}catch{}
      fail('TOOL_RESPONSE_INVALID');});
  }finally{if(session)try{await request(fetchImpl,MCP,{method:'DELETE',headers:headers()});}catch{}}
}
export function createCalendlySupplyAdapter({clientId,redirectUri,fetchImpl=fetch,clock=()=>new Date().toISOString()}={}){
  secret(clientId);const redirect=new URL(redirectUri);if(redirect.protocol!=='https:'||redirect.pathname!=='/v1/supply/callback/calendly')fail('CONFIG_INVALID');
  async function tokens(input,knownMerchantId,requestedScopes=CALENDLY_SUPPLY_SCOPES){const result=(await request(fetchImpl,AUTH+'/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:clientId,resource:MCP,...input}).toString()})).value;
    secret(result?.access_token);secret(result?.refresh_token);if(!Number.isFinite(result.expires_in)||result.expires_in<=0||result.expires_in>86400)fail('TOKEN_RESPONSE_INVALID');
    // A rotated refresh token must reach durable storage before another source
    // read can fail. Initial exchange still verifies the owner through MCP.
    const owner=result.owner??(knownMerchantId?`https://api.calendly.com/users/${knownMerchantId}`
      :(await withTools(fetchImpl,result.access_token,call=>call('users-get_current_user'))).resource?.uri);
    const id=uriId(owner,'users');
    const scopes=typeof result.scope==='string'?result.scope.split(/\s+/u).filter(Boolean):[...requestedScopes];
    return {accessToken:result.access_token,refreshToken:result.refresh_token,merchantId:id,scopes,expiresAt:new Date(Date.parse(clock())+result.expires_in*1000).toISOString()};
  }
  const validId=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,191}$/u.test(value))fail('INPUT_INVALID');return value;};
  const eventUri=id=>`https://api.calendly.com/scheduled_events/${validId(id)}`;
  const safeLink=value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='calendly.com'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
  function project(event,invitee){const externalBookingId=uriId(event?.uri,'scheduled_events');
    if(!Number.isFinite(Date.parse(event.start_time))||!Number.isFinite(Date.parse(event.end_time)))fail('BOOKING_RESPONSE_INVALID');
    return {connectorId:'calendly',externalBookingId,externalInviteeId:invitee?.uri?.split('/').at(-1)??null,
      providerStatus:event.status,state:event.status==='active'?'CONFIRMED':event.status==='canceled'?'CANCELLED':'PROVIDER_REPORTED',
      startAt:new Date(event.start_time).toISOString(),endAt:new Date(event.end_time).toISOString(),resourceId:uriId(event.event_type,'event_types'),
      cancelUrl:safeLink(invitee?.cancel_url),rescheduleUrl:safeLink(invitee?.reschedule_url),rescheduled:invitee?.rescheduled===true,
      newInviteeUri:typeof invitee?.new_invitee==='string'?invitee.new_invitee:null,observedAt:clock(),paymentPerformed:false};}
  async function readBooking(call,{externalBookingId,externalInviteeId}){
    const event=(await call('meetings-get_event',{uuid:validId(externalBookingId)})).resource;
    const invitee=externalInviteeId?(await call('meetings-get_event_invitee',{uuid:validId(externalBookingId),invitee_uuid:validId(externalInviteeId)})).resource:null;
    const linked=/^https:\/\/api\.calendly\.com\/scheduled_events\/([A-Za-z0-9_-]{1,191})\/invitees\/([A-Za-z0-9_-]{1,191})$/u.exec(invitee?.new_invitee??'');
    if(invitee?.rescheduled===true&&linked){const nextEvent=(await call('meetings-get_event',{uuid:linked[1]})).resource,
      nextInvitee=(await call('meetings-get_event_invitee',{uuid:linked[1],invitee_uuid:linked[2]})).resource;
      if(nextInvitee.old_invitee!==invitee.uri||nextEvent.event_type!==event.event_type)fail('BOOKING_RESCHEDULE_BINDING_CHANGED');
      return {...project(nextEvent,nextInvitee),previousExternalBookingId:externalBookingId};}
    return project(event,invitee);
  }
  return {
    beginAuthorization({state,mode='READ'}){if(!['READ','BOOKING'].includes(mode))fail('AUTHORIZATION_MODE_INVALID');const scopes=mode==='BOOKING'?CALENDLY_SUPPLY_BOOKING_SCOPES:CALENDLY_SUPPLY_SCOPES;
      const verifier=randomBytes(32).toString('base64url'),url=new URL(AUTH+'/oauth/authorize');
      url.search=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,state,resource:MCP,scope:scopes.join(' '),
        code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')}).toString();return {authorizationUrl:url.href,proof:{verifier,scopes}};},
    exchange({code,proof}){return tokens({grant_type:'authorization_code',code:secret(code),redirect_uri:redirectUri,code_verifier:secret(proof?.verifier)},undefined,proof?.scopes);},
    refresh({refreshToken,merchantId,scopes}){return tokens({grant_type:'refresh_token',refresh_token:secret(refreshToken)},merchantId,scopes);},
    // Calendly's DCR metadata does not advertise a revocation endpoint. Stop
    // local use immediately; surface the remaining grant in the provider UI.
    async revoke(){return {localOnly:true,providerRevocationRequired:true};},
    async inventory({accessToken,merchantId,scopes=CALENDLY_SUPPLY_SCOPES}){return withTools(fetchImpl,accessToken,async call=>{
      const user=(await call('users-get_current_user')).resource;if(uriId(user?.uri,'users')!==merchantId)fail('ACCOUNT_MISMATCH');
      const rows=[],seen=new Set();let cursor;
      for(let n=0;n<100;n++){const result=await call('event_types-list_event_types',{user:user.uri,active:true,count:100,...(cursor?{page_token:cursor}:{})});
        if(!Array.isArray(result.collection))fail('INVENTORY_INVALID');rows.push(...result.collection);const next=result.pagination?.next_page_token;
        if(!next)break;if(seen.has(next)||n===99)fail('INVENTORY_INCOMPLETE');seen.add(next);cursor=next;}
      const resources=rows.filter(r=>r.active===true).map(r=>({id:uriId(r.uri,'event_types'),name:String(r.name??'').slice(0,500),kind:'SERVICE',locationIds:[merchantId],
        durationMinutes:Number.isSafeInteger(r.duration)&&r.duration>0?r.duration:null,sourceVersion:r.updated_at??null,price:null,
        providerEventKind:r.kind??null,locationOptions:Array.isArray(r.locations)?r.locations.map(l=>({kind:l.kind,location:l.location??null})):[],
        bookingBlockers:r.kind==='solo'?[]:['GROUP_OR_UNKNOWN_EVENT_REQUIRES_PROVIDER_BOOKING'],
        bookingMode:r.booking_method==='instant'?'AUTOMATIC':'PROVIDER_APPROVAL',priceBasis:'NOT_PROVIDED',availabilityRequiresSearch:true,capacityReserved:false,
        bookingUrl:typeof r.scheduling_url==='string'&&r.scheduling_url.startsWith('https://calendly.com/')?r.scheduling_url:null}));
      if(new Set(resources.map(r=>r.id)).size!==resources.length)fail('INVENTORY_INVALID');
      return {account:{id:merchantId,name:String(user.name??'Calendly').slice(0,200)},locations:[{id:merchantId,name:'Calendly',timeZone:user.timezone??null,address:{}}],resources,
        permissions:{grantedScopes:scopes,verifiedAt:clock()},
        operations:{inventoryRead:{enabled:true,implemented:true,permissionGranted:true},availabilitySearch:{enabled:true,implemented:true,permissionGranted:true},
          bookingRead:{enabled:true,implemented:true,permissionGranted:true},
          bookingCreate:{enabled:scopes.includes('mcp:scheduling:write'),implemented:true,permissionGranted:scopes.includes('mcp:scheduling:write'),requiredScopes:['mcp:scheduling:write']},
          bookingCancel:{enabled:scopes.includes('mcp:scheduling:write'),implemented:true,permissionGranted:scopes.includes('mcp:scheduling:write'),requiredScopes:['mcp:scheduling:write']},
          bookingReschedule:{enabled:false,implemented:false,reason:'PROVIDER_RESCHEDULE_LINK_REQUIRED'},paymentWrite:{enabled:false,implemented:false}},
        complete:true,observedAt:clock(),source:'CALENDLY_AUTHORIZED_MCP',inventoryIsAvailability:false};
    });},
    async searchAvailability({accessToken,locationId,resourceId,startAt,endAt,durationMinutes}){
      if(!/^[A-Za-z0-9_-]{1,191}$/u.test(resourceId??''))fail('INPUT_INVALID');const start=Date.parse(startAt),end=Date.parse(endAt);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<Date.parse(clock())||end<=start||end-start>31*86400000)fail('AVAILABILITY_WINDOW_INVALID');
      return withTools(fetchImpl,accessToken,async call=>{const collection=[];
        // Calendly limits each available-times query to seven days.
        for(let cursor=start;cursor<end;cursor+=7*86400000){const result=await call('event_types-list_event_type_available_times',{
          event_type:`https://api.calendly.com/event_types/${resourceId}`,start_time:new Date(cursor).toISOString(),end_time:new Date(Math.min(end,cursor+7*86400000)).toISOString()});
          if(!Array.isArray(result.collection))fail('AVAILABILITY_RESPONSE_INVALID');collection.push(...result.collection);}
        const duration=Number.isSafeInteger(durationMinutes)&&durationMinutes>0?durationMinutes*60000:0;
        return {resourceId,locationId,slots:collection.filter((s,i,rows)=>rows.findIndex(x=>x.start_time===s.start_time)===i&&s.status==='available'&&Date.parse(s.start_time)>=start&&Date.parse(s.start_time)<end
          &&Date.parse(s.start_time)+duration<=end&&(s.invitees_remaining===undefined||Number.isSafeInteger(s.invitees_remaining)&&s.invitees_remaining>0))
          .map(s=>({resourceId,locationId,startAt:new Date(s.start_time).toISOString(),remaining:s.invitees_remaining,
            ...(duration?{endAt:new Date(Date.parse(s.start_time)+duration).toISOString()}:{}),
            bookingUrl:typeof s.scheduling_url==='string'&&s.scheduling_url.startsWith('https://calendly.com/')?s.scheduling_url:null})),
          observedAt:clock(),source:'CALENDLY_LIVE_AVAILABILITY',capacityReserved:false,bookingConfirmed:false,priceQuoted:false};});
    },
    async createBooking({accessToken,resourceId,slot,customer,idempotencyKey}){
      if(typeof customer?.name!=='string'||!customer.name.trim()||customer.name.length>200||!/^\S+@\S+\.\S+$/u.test(customer?.email??''))fail('BOOKING_CUSTOMER_REQUIRED');
      try{new Intl.DateTimeFormat('en',{timeZone:customer.timezone});}catch{fail('BOOKING_TIMEZONE_REQUIRED');}
      if(!customer.timezone)fail('BOOKING_TIMEZONE_REQUIRED');
      return withTools(fetchImpl,accessToken,async call=>{
        const type=(await call('event_types-get_event_type',{uuid:validId(resourceId)})).resource;
        if(type?.kind!=='solo'||type.active!==true)fail('BOOKING_EVENT_TYPE_UNSUPPORTED');
        const locations=type.locations??[];let location;
        if(locations.length){const chosen=locations.find(l=>l.kind===customer.location?.kind);
          if(!chosen)fail('BOOKING_LOCATION_REQUIRED');location={kind:chosen.kind,...(customer.location?.location?{location:String(customer.location.location).slice(0,2000)}:{})};
          if(['ask_invitee','outbound_call'].includes(chosen.kind)&&!location.location)fail('BOOKING_LOCATION_REQUIRED');}
        try{const result=await call('meetings-create_invitee',{event_type:`https://api.calendly.com/event_types/${resourceId}`,start_time:slot.startAt,
            invitee:{name:customer.name.trim(),email:customer.email,timezone:customer.timezone},...(location?{location}:{}),
            tracking:{utm_source:'outsider',utm_content:idempotencyKey}});
          const invitee=result.resource,externalBookingId=uriId(invitee?.event,'scheduled_events');
          // Keep the acknowledged reference even if a later read is unavailable.
          return {connectorId:'calendly',externalBookingId,externalInviteeId:invitee.uri?.split('/').at(-1),resourceId,
            providerStatus:invitee.status,state:'CREATED_READBACK_REQUIRED',startAt:slot.startAt,endAt:slot.endAt,
            cancelUrl:safeLink(invitee.cancel_url),rescheduleUrl:safeLink(invitee.reschedule_url),observedAt:clock(),paymentPerformed:false};
        }catch(error){if(!/TOOL_SCHEMA|TOOL_NOT_AVAILABLE/u.test(error.code??''))error.bookingWriteAttempted=true;throw error;}
      });
    },
    readBooking(input){return withTools(fetchImpl,input.accessToken,call=>readBooking(call,input));},
    async reconcileBooking(input){return withTools(fetchImpl,input.accessToken,async call=>{
      const matches=[];let cursor;
      for(let page=0;page<20;page++){
        const events=await call('meetings-list_events',{user:`https://api.calendly.com/users/${validId(input.merchantId)}`,
          min_start_time:input.startAt,max_start_time:input.endAt,count:100,...(cursor?{page_token:cursor}:{})});
        if(!Array.isArray(events.collection))fail('BOOKING_RECONCILIATION_INVALID');
        for(const event of events.collection){if(event.event_type!==`https://api.calendly.com/event_types/${input.resourceId}`||Date.parse(event.start_time)!==Date.parse(input.startAt))continue;
          const invitees=await call('meetings-list_event_invitees',{uuid:uriId(event.uri,'scheduled_events'),count:100});
          if(!Array.isArray(invitees.collection)||invitees.pagination?.next_page_token)fail('BOOKING_RECONCILIATION_INCOMPLETE');
          for(const invitee of invitees.collection)if(invitee.tracking?.utm_source==='outsider'&&invitee.tracking?.utm_content===input.idempotencyKey&&invitee.email===input.customer?.email)
            matches.push(project(event,invitee));
        }
        cursor=events.pagination?.next_page_token;if(!cursor)break;if(page===19)fail('BOOKING_RECONCILIATION_INCOMPLETE');
      }
      if(matches.length>1)fail('BOOKING_RECONCILIATION_AMBIGUOUS');return matches[0]??{state:'RECONCILIATION_REQUIRED',observedAt:clock()};
    });},
    async cancelBooking(input){return withTools(fetchImpl,input.accessToken,async call=>{
      const current=await readBooking(call,input);if(current.state==='CANCELLED')return current;
      const type=(await call('event_types-get_event_type',{uuid:current.resourceId})).resource;
      if(type?.kind!=='solo')fail('BOOKING_GROUP_CANCELLATION_UNSUPPORTED');
      await call('meetings-cancel_event',{uuid:validId(input.externalBookingId),reason:'Cancelled within the original Outsider order.'});
      return {...current,state:'CANCELLATION_READBACK_REQUIRED',observedAt:clock()};
    });},
    async rescheduleBooking(input){const current=await withTools(fetchImpl,input.accessToken,call=>readBooking(call,input));
      if(!current.rescheduleUrl)fail('BOOKING_RESCHEDULE_LINK_UNAVAILABLE');return {...current,actionRequired:'OPEN_PROVIDER_RESCHEDULE',actionUrl:current.rescheduleUrl};},
  };
}
