/* Official UCP order webhook envelopes. Verify the original bytes; delivery
 * acknowledgements and seller fulfillment claims are not independent outcomes. */
import {createHmac,timingSafeEqual} from 'node:crypto';
import {interfaceDigest as digest} from './outsider-openapi-demand-matcher.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function shopifyEventInstant(value) {
  const m=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$/u.exec(value??'');
  const ms=m?Date.parse(m[1]+m[3]):NaN;
  if(!Number.isFinite(ms))fail('UCP_WEBHOOK_TIMESTAMP_INVALID');
  return (BigInt(ms)*1000000n+BigInt((m[2]??'').padEnd(9,'0'))).toString();
}
export function verifyShopifyOrderEvent({headers,bodyBase64},sharedSecret) {
  if(!headers||typeof bodyBase64!=='string'||bodyBase64.length>950000
    ||typeof sharedSecret!=='string'||sharedSecret.length<8)fail('UCP_WEBHOOK_ENVELOPE_INVALID');
  const bytes=Buffer.from(bodyBase64,'base64');
  if(bytes.toString('base64')!==bodyBase64||!bytes.length||bytes.length>700000)fail('UCP_WEBHOOK_BODY_INVALID');
  const h=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
  const supplied=Buffer.from(h['x-shopify-hmac-sha256']??'','base64');
  const expected=createHmac('sha256',sharedSecret).update(bytes).digest();
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))fail('UCP_WEBHOOK_SIGNATURE_INVALID');
  if(!['orders/create','orders/updated','orders/delete'].includes(h['x-shopify-topic'])
    ||!/^[a-z0-9][a-z0-9-]{0,100}\.myshopify\.com$/u.test(h['x-shopify-shop-domain']??'')
    ||!/^[A-Za-z0-9._:-]{1,150}$/u.test(h['x-shopify-webhook-id']??''))fail('UCP_WEBHOOK_HEADERS_INVALID');
  const sourceSequence=shopifyEventInstant(h['x-shopify-triggered-at']);
  let order;try{order=JSON.parse(bytes);}catch{fail('UCP_WEBHOOK_ORDER_JSON_INVALID');}
  if(!/^gid:\/\/shopify\/Order\/[1-9][0-9]*$/u.test(order?.id??'')
    ||typeof order.checkout_id!=='string')fail('UCP_WEBHOOK_ORDER_ID_INVALID');
  return {order,bodyBase64,receipt:{source:'SHOPIFY_UCP_ORDER_WEBHOOK',signatureVerified:true,
    deliveryId:h['x-shopify-webhook-id'],eventId:h['x-shopify-event-id']??null,
    topic:h['x-shopify-topic'],shopDomain:h['x-shopify-shop-domain'],apiVersion:h['x-shopify-api-version']??null,
    triggeredAt:h['x-shopify-triggered-at'],sourceSequence,bodyHash:digest(bytes),bodyBytes:bytes.length}};
}
