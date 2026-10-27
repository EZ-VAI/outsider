/* Public buyer MCP, no browser/session cookies and no payment tool. Catalog
 * bodies are consumed in memory only; merchant transaction receipts may be
 * persisted privately by the caller. The older Woo transport is unchanged. */
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList } from 'node:net';
import { randomUUID } from 'node:crypto';
import { wooCommerceStoreOrigin } from './outsider-woocommerce-buyer-transport.js';
import { interfaceDigest as digest } from './outsider-openapi-demand-matcher.js';
export const SHOPIFY_UCP_VERSION = '2026-08-25';
export const SHOPIFY_CATALOG_ORIGIN = 'https://catalog.shopify.com';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const excluded = new BlockList();
for (const [address, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
  ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],
  ['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) excluded.addSubnet(address,bits,'ipv4');
export function createShopifyUcpFetch(origin) {
  origin = wooCommerceStoreOrigin(origin);
  return async (url, options) => {
    const target = new URL(url);
    if (target.origin !== origin || target.search || target.hash
      || !((options.method === 'POST' && target.pathname === '/api/ucp/mcp')
      || (options.method === 'GET' && target.pathname === '/.well-known/ucp'))) fail('UCP_TRANSPORT_SCOPE_INVALID');
    const addresses = await lookup(target.hostname, { all: true, family: 4 });
    if (!addresses.length || addresses.some(a => excluded.check(a.address,'ipv4'))) fail('UCP_PUBLIC_ADDRESS_REQUIRED');
    if (options.body && Buffer.byteLength(options.body) > 32768) fail('UCP_REQUEST_TOO_LARGE');
    const address = addresses[0].address;
    return new Promise((resolve, reject) => {
      const req = request(target, { method: options.method, agent: false, family: 4, autoSelectFamily: false,
        headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', Connection: 'close',
          ...(options.headers?.Authorization ? { Authorization: options.headers.Authorization } : {}) },
        signal: AbortSignal.timeout(18000), maxHeaderSize: 32768,
        lookup(host, settings, callback) {
          if (host !== target.hostname) return callback(new Error('UCP_DNS_BINDING_INVALID'));
          settings?.all ? callback(null,[{address,family:4}]) : callback(null,address,4);
        } }, response => {
        let size = 0; const chunks = [];
        response.on('data', b => { size += b.length;
          if (size > 700000) response.destroy(new Error('UCP_RESPONSE_TOO_LARGE')); else chunks.push(b); });
        response.on('error', reject);
        response.on('end', () => resolve({ status: response.statusCode, arrayBuffer: async () => Buffer.concat(chunks) }));
      });
      req.on('error', reject); req.end(options.body);
    });
  };
}
export function ucpResponseValue(bytes) {
  let rpc; try { rpc = JSON.parse(bytes); } catch { fail('UCP_RESPONSE_JSON_INVALID'); }
  if (rpc.error) fail(`UCP_${String(rpc.error.data?.code ?? 'RPC_ERROR').toUpperCase().replace(/[^A-Z0-9_]/gu,'_').slice(0,80)}`);
  let value = rpc.result?.structuredContent;
  if (!value) { try { value = JSON.parse(rpc.result?.content?.find(c => c.type === 'text')?.text); } catch {} }
  // A checkout requiring contact/extension input is still a real allocated
  // session. Retain its identity for read/cancel; it is not purchase-ready.
  if ((rpc.result?.isError || value?.ucp?.status === 'error') && !value?.id) {
    const code = value?.messages?.find(m => m.type === 'error')?.code;
    fail(code && /^[a-z_]{1,70}$/u.test(code) ? `UCP_${code.toUpperCase()}` : 'UCP_TOOL_REJECTED');
  }
  if (!value || typeof value !== 'object') fail('UCP_TOOL_RESPONSE_INVALID');
  return value;
}
export function createShopifyUcpClient({ origin, profileUrl, fetchImpl, onReceipt = () => {}, clock = () => new Date().toISOString(), orderAccess, checkoutAccess }) {
  origin = wooCommerceStoreOrigin(origin);
  const profile = new URL(profileUrl);
  if (profile.protocol !== 'https:' || profile.username || profile.password || profile.search || profile.hash) fail('UCP_PROFILE_URL_INVALID');
  const fetcher = fetchImpl ?? createShopifyUcpFetch(origin);
  let nativeRequests = 0, responseBodyBytes = 0;
  const allowed = origin === SHOPIFY_CATALOG_ORIGIN ? ['search_catalog','lookup_catalog','get_product']
    : ['create_cart','get_cart','update_cart','cancel_cart','create_checkout','get_checkout','update_checkout','cancel_checkout'];
  return {
    async call(name, payload, operationKey = randomUUID()) {
      const orderRead = name === 'get_order' && origin !== SHOPIFY_CATALOG_ORIGIN;
      const complete = name === 'complete_checkout' && origin !== SHOPIFY_CATALOG_ORIGIN;
      if (!allowed.includes(name) && !(orderRead && orderAccess) && !(complete && checkoutAccess)) fail('UCP_TOOL_NOT_ALLOWED');
      // The product's completion path sends no instrument or saved-payment
      // selection. A merchant still decides eligibility; a bearer token is not
      // evidence of permission to complete this checkout.
      if (complete && (!payload?.id || Object.keys(payload).sort().join(',') !== 'checkout,id'
        || !payload.checkout || Object.keys(payload.checkout).length)) fail('UCP_PAYMENT_TOOL_NOT_ENABLED');
      const access = orderRead ? orderAccess : name.includes('checkout') ? checkoutAccess : null;
      const token = access ? await access.token() : null;
      const meta = { 'ucp-agent': { profile: access ? access.profileUrl() : profileUrl }, 'idempotency-key': operationKey };
      nativeRequests++;
      const response = await fetcher(`${origin}/api/ucp/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ jsonrpc:'2.0', id: operationKey, method:'tools/call', params: { name, arguments: { meta, ...payload } } }) });
      const bytes = Buffer.from(await response.arrayBuffer()); responseBodyBytes += bytes.length;
      if (bytes.length > 700000) fail('UCP_RESPONSE_TOO_LARGE');
      const receipt = { source: 'SHOPIFY_UCP_MCP', origin, tool: name, observedAt: clock(), httpStatus: response.status,
        bodyHash: digest(bytes), bodyBytes: bytes.length, requestHash: digest(payload) };
      // Shopify prohibits caching catalog results (including images).
      await onReceipt(origin === SHOPIFY_CATALOG_ORIGIN ? receipt : { ...receipt, bodyBase64: bytes.toString('base64') });
      if (response.status < 200 || response.status >= 300) {
        try { ucpResponseValue(bytes); } catch (error) { if (error.code !== 'UCP_RESPONSE_JSON_INVALID') throw error; }
        fail(`UCP_HTTP_${response.status}`);
      }
      return ucpResponseValue(bytes);
    },
    metrics: () => ({ nativeRequests, responseBodyBytes })
  };
}
