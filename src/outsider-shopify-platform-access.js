/* One platform credential shared by the buyer network, not merchant/customer
 * accounts. Token scopes are observations, never locally minted permissions. */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readPrivateExecutionBytes } from './outsider-user-held-durable-execution-v2.js';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const read = file => JSON.parse(readPrivateExecutionBytes(file));
export function createShopifyPlatformAccess({nodeDirectory,fetchImpl=fetch,clock=()=>Date.now()}) {
  const file=path.join(nodeDirectory,'connections','shopify-platform-access.json');
  let cached=null;
  function configuration() {
    const legacy=path.join(nodeDirectory,'connections','shopify-order-access.json');
    if(!existsSync(file)&&!existsSync(legacy))fail('UCP_PLATFORM_ACCESS_NOT_CONNECTED');
    const c=read(existsSync(file)?file:legacy);
    if(!['outsider/shopify-platform-access/v1','outsider/shopify-order-access/v1'].includes(c.schema)
      ||!path.isAbsolute(c.credentialsFile??''))fail('UCP_PLATFORM_ACCESS_CONFIG_INVALID');
    const url=new URL(c.profileUrl);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)fail('UCP_PLATFORM_PROFILE_INVALID');
    return c;
  }
  function credentials() {
    const c=read(configuration().credentialsFile);
    if(Object.keys(c).sort().join(',')!=='clientId,clientSecret'
      ||![c.clientId,c.clientSecret].every(v=>typeof v==='string'&&v.length>=8&&v.length<=2048))fail('UCP_PLATFORM_CREDENTIALS_INVALID');
    return c;
  }
  async function token({requiredScope}={}) {
    if(!cached||cached.expiresAt<=clock()+60000) {
      const c=credentials(),response=await fetchImpl('https://api.shopify.com/auth/access_token',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{'content-type':'application/json',accept:'application/json'},
        body:JSON.stringify({client_id:c.clientId,client_secret:c.clientSecret,grant_type:'client_credentials'})});
      if(!response.ok)fail(`UCP_PLATFORM_AUTH_HTTP_${response.status}`);
      const v=await response.json();let claims={};
      try{claims=JSON.parse(Buffer.from(v.access_token.split('.')[1],'base64url'));}catch{}
      const scopes=v.scope??claims.scopes??claims.scope??[];
      const expiresAt=Number.isInteger(v.expires_in)?clock()+v.expires_in*1000:claims.exp*1000;
      if(typeof v.access_token!=='string'||!/^[A-Za-z0-9._~-]+$/u.test(v.access_token)
        ||!Number.isFinite(expiresAt)||expiresAt<=clock()+60000)fail('UCP_PLATFORM_TOKEN_INVALID');
      cached={token:v.access_token,expiresAt,scopes:Array.isArray(scopes)?scopes:String(scopes).split(/[ ,]+/u),verifiedAt:new Date(clock()).toISOString()};
    }
    if(requiredScope&&!cached.scopes.includes(requiredScope))fail('UCP_PLATFORM_SCOPE_NOT_GRANTED');
    return cached.token;
  }
  const status=()=>({configured:existsSync(file)||existsSync(path.join(nodeDirectory,'connections','shopify-order-access.json')),
    tokenExchangeVerified:!!cached,grantedScopes:cached?.scopes??[],verifiedAt:cached?.verifiedAt??null,
    orderReadGranted:cached?.scopes.includes('read_global_api_orders')??false,
    checkoutCompletionGranted:false,paymentToolEnabled:false,userMerchantRegistrationRequired:false});
  return {token,status,profileUrl:()=>configuration().profileUrl,
    // The verifier reads this inside the trusted Node only; no HTTP projection.
    webhookSecret:()=>credentials().clientSecret,
    async verify(){await token();return status();}};
}
