/* One platform connection, not one merchant account per customer. Credentials
 * are exchanged only with Shopify; this module never completes a purchase. */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readPrivateExecutionBytes } from './outsider-user-held-durable-execution-v2.js';
import { createShopifyPlatformAccess } from './outsider-shopify-platform-access.js';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const read = file => JSON.parse(readPrivateExecutionBytes(file));
export function createShopifyOrderAccess({ nodeDirectory, fetchImpl = fetch, clock = () => Date.now() }) {
  const configFile = path.join(nodeDirectory, 'connections', 'shopify-order-access.json');
  const platformFile=path.join(nodeDirectory,'connections','shopify-platform-access.json');
  const platform=createShopifyPlatformAccess({nodeDirectory,fetchImpl,clock});
  let cached = null;
  function configuration() {
    if (!existsSync(configFile)) fail('UCP_ORDER_ACCESS_NOT_CONNECTED');
    const config = read(configFile);
    if (config.schema !== 'outsider/shopify-order-access/v1' || !path.isAbsolute(config.credentialsFile ?? '')
      || typeof config.profileUrl !== 'string') fail('UCP_ORDER_ACCESS_CONFIG_INVALID');
    const profile = new URL(config.profileUrl);
    if (profile.protocol !== 'https:' || profile.username || profile.password || profile.hash || profile.search) fail('UCP_ORDER_PROFILE_INVALID');
    return config;
  }
  async function token() {
    if(existsSync(platformFile)){
      try{return await platform.token({requiredScope:'read_global_api_orders'});}
      catch(e){if(e.code==='UCP_PLATFORM_SCOPE_NOT_GRANTED')fail('UCP_ORDER_READ_SCOPE_NOT_GRANTED');throw e;}
    }
    const config = configuration();
    if (cached?.expiresAt > clock() + 60000) return cached.token;
    const credentials = read(config.credentialsFile);
    if (Object.keys(credentials).sort().join(',') !== 'clientId,clientSecret'
      || ![credentials.clientId, credentials.clientSecret].every(v => typeof v === 'string' && v.length >= 8 && v.length <= 2048)) fail('UCP_PLATFORM_CREDENTIALS_INVALID');
    const response = await fetchImpl('https://api.shopify.com/auth/access_token', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ client_id: credentials.clientId, client_secret: credentials.clientSecret, grant_type: 'client_credentials' }) });
    if (!response.ok) fail(`UCP_PLATFORM_AUTH_HTTP_${response.status}`);
    const result = await response.json();
    let claims = {};
    try { claims = JSON.parse(Buffer.from(result.access_token.split('.')[1], 'base64url')); } catch {}
    // Preflight from Shopify's token response, never local authority. The
    // merchant still checks access to every order; secrets are never logged.
    const scopes = result.scope ?? claims.scopes ?? claims.scope ?? [];
    if (!(Array.isArray(scopes) ? scopes : String(scopes).split(/[ ,]+/u)).includes('read_global_api_orders')) fail('UCP_ORDER_READ_SCOPE_NOT_GRANTED');
    const expiresAt = Number.isInteger(result.expires_in) ? clock() + result.expires_in * 1000 : claims.exp * 1000;
    if (typeof result.access_token !== 'string' || !/^[A-Za-z0-9._~-]+$/u.test(result.access_token)
      || !Number.isFinite(expiresAt) || expiresAt <= clock() + 60000) fail('UCP_PLATFORM_TOKEN_INVALID');
    cached = { token: result.access_token, expiresAt }; return cached.token;
  }
  return { token, profileUrl: () => existsSync(platformFile)?platform.profileUrl():configuration().profileUrl,
    status: () => ({ configured: existsSync(configFile)||existsSync(platformFile), liveOrderAccessVerified: false,
      paymentToolEnabled: false, userMerchantRegistrationRequired: false }) };
}
