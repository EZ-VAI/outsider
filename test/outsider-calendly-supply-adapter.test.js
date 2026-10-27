import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCalendlySupplyAdapter,registerCalendlySupplyApplication} from '../src/outsider-calendly-supply-adapter.js';
const now='2026-09-10T14:00:00Z',redirectUri='https://merchant.example/v1/supply/callback/calendly';
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
test('refresh rotation returns new credentials before any MCP read can fail',async()=>{
  let calls=0;const client=createCalendlySupplyAdapter({clientId:'test-client',redirectUri,clock:()=>now,fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://calendly.com/oauth/token');assert.equal(new URLSearchParams(options.body).get('refresh_token'),'old-refresh');
    return json({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_in:7200});
  }});
  const credentials=await client.refresh({refreshToken:'old-refresh',merchantId:'userA'});
  assert.equal(calls,1);assert.equal(credentials.merchantId,'userA');assert.equal(credentials.refreshToken,'rotated-refresh');
});
test('dynamic OAuth registration discovers pinned endpoints and creates a public PKCE client',async()=>{
  const calls=[];const config=await registerCalendlySupplyApplication({redirectUri,fetchImpl:async(url,options)=>{
    calls.push([url,options]);if(url.includes('oauth-protected-resource'))return json({resource:'https://mcp.calendly.com/',authorization_servers:['https://calendly.com/'],scopes_supported:['mcp:scheduling:read']});
    if(url.includes('oauth-authorization-server'))return json({authorization_endpoint:'https://calendly.com/oauth/authorize',token_endpoint:'https://calendly.com/oauth/token',registration_endpoint:'https://calendly.com/oauth/register',code_challenge_methods_supported:['S256']});
    const body=JSON.parse(options.body);assert.equal(body.token_endpoint_auth_method,'none');assert.equal(body.client_name,'Outsider');return json({...body,client_id:'public-client'});
  }});assert.equal(config.clientId,'public-client');assert.equal(calls.length,3);
  const adapter=createCalendlySupplyAdapter({...config}),flow=adapter.beginAuthorization({state:'test_state'}),url=new URL(flow.authorizationUrl);
  assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(flow.proof.verifier).digest('base64url'));
  assert.equal(url.searchParams.get('scope'),'mcp:scheduling:read');assert.equal(url.searchParams.get('resource'),'https://mcp.calendly.com/');
});
test('authorized MCP imports event types and reads changing availability with no booking tools, including nested schema and finite SSE',async()=>{
  const calls=[];let slots=1;
  const schemas={'users-get_current_user':{},'event_types-list_event_types':{user:{},active:{},count:{},page_token:{}},'event_types-list_event_type_available_times':{event_type:{},start_time:{},end_time:{}}};
  const fetchImpl=async(url,options)=>{
    if(url.endsWith('/oauth/token'))return json({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:7200});
    if(options.method==='DELETE')return new Response(null,{status:204});
    const body=JSON.parse(options.body);calls.push(body);
    if(body.method==='notifications/initialized')return new Response(null,{status:202});
    let result;
    if(body.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{}}};
    else if(body.method==='tools/list')result={tools:Object.entries(schemas).map(([name,properties])=>({name,inputSchema:{type:'object',properties:{query:{type:'object',properties}},required:['query']}}))};
    else if(body.params.name==='users-get_current_user')result={structuredContent:{resource:{uri:'https://api.calendly.com/users/userA',name:'Test Team',timezone:'America/New_York'}}};
    else if(body.params.name==='event_types-list_event_types'){assert.equal(body.params.arguments.query.user,'https://api.calendly.com/users/userA');result={content:[{type:'text',text:JSON.stringify({collection:[{uri:'https://api.calendly.com/event_types/serviceA',name:'Consultation',active:true,duration:30,booking_method:'instant',scheduling_url:'https://calendly.com/test/consult'}],pagination:{next_page_token:null}})}]};}
    else if(body.params.name==='event_types-list_event_type_available_times'){assert.equal(body.params.arguments.query.event_type,'https://api.calendly.com/event_types/serviceA');result={structuredContent:{collection:slots?[{status:'available',start_time:'2026-09-14T14:00:00Z',invitees_remaining:1,scheduling_url:'https://calendly.com/test/consult'}]:[]}};}
    else assert.fail('unexpected RPC');
    return new Response('event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',id:body.id,result})+'\n\n',{headers:{'content-type':'text/event-stream','mcp-session-id':'fixture-session'}});
  };
  const client=createCalendlySupplyAdapter({clientId:'test-client',redirectUri,fetchImpl,clock:()=>now});
  const credential=await client.exchange({code:'test-code',proof:{verifier:'test-verifier'}});assert.equal(credential.merchantId,'userA');
  const inventory=await client.inventory({accessToken:credential.accessToken,merchantId:'userA'});assert.equal(inventory.resources.length,1);assert.equal(inventory.operations.bookingCreate.enabled,false);
  const input={accessToken:credential.accessToken,resourceId:'serviceA',locationId:'userA',startAt:'2026-09-14T13:00:00Z',endAt:'2026-09-14T16:00:00Z'};
  assert.equal((await client.searchAvailability(input)).slots.length,1);slots=0;assert.equal((await client.searchAvailability(input)).slots.length,0);
  assert.equal(calls.filter(c=>c.method==='tools/call').every(c=>!c.params.name.includes('create')&&!c.params.name.includes('cancel')),true);
  assert.equal((await client.revoke()).providerRevocationRequired,true);
});
