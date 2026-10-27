// Bounded engineering probe: only fresh guest cart/checkout quotation, followed
// by cancellation. It cannot complete checkout or submit a payment instrument.
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { writePrivateExecutionRecordOnce as writeOnce } from '../src/outsider-user-held-durable-execution-v2.js';
const [inputFile, outputDirectory] = process.argv.slice(2);
const input = JSON.parse(readFileSync(inputFile));
// The original input remains frozen; the versioned JSON publication supersedes
// raw GitHub's incompatible content type, not the user's destination consent.
input.profileUrl = JSON.parse(readFileSync(path.join(path.dirname(inputFile), 'ucp-json-endpoint.json'))).profileUrl;
mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
let sequence = 0;
async function call(name, args) {
  if (!['create_cart','get_cart','cancel_cart','create_checkout','get_checkout','cancel_checkout'].includes(name)) throw new Error('PROBE_TOOL_NOT_ALLOWED');
  const meta = { 'ucp-agent': { profile: input.profileUrl }, 'idempotency-key': randomUUID() };
  const r = await fetch(`${input.storeUrl}/api/ucp/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++sequence, method: 'tools/call', params: { name, arguments: { meta, ...args } } }),
    signal: AbortSignal.timeout(20000) });
  const b = Buffer.from(await r.arrayBuffer()), d = JSON.parse(b);
  writeOnce(path.join(outputDirectory, `${sequence}-${name}.json`), { status: r.status, bytes: b.length,
    sha256: createHash('sha256').update(b).digest('hex'), bodyBase64: b.toString('base64') });
  const value = d.result?.structuredContent ?? JSON.parse(d.result?.content?.find(c => c.type === 'text')?.text ?? '{}');
  console.log(JSON.stringify({ name, status: r.status, bytes: b.length, keys: Object.keys(value), error: d.error,
    isError: d.result?.isError, ucpStatus: value.ucp?.status, messages: value.messages,
    cart: summarize(value.cart ?? (name.includes('cart') ? value : null)),
    checkout: summarize(value.checkout ?? (name.includes('checkout') ? value : null)) }));
  if (d.error || d.result?.isError && !value.id) throw new Error('PROBE_PROVIDER_ERROR');
  return value;
}
function summarize(value) {
  if (!value) return undefined;
  return { keys: Object.keys(value), status: value.status, currency: value.currency, totals: value.totals,
    lines: value.line_items?.map(l => ({ keys: Object.keys(l), item: { id: l.item?.id, title: l.item?.title, price: l.item?.price }, quantity: l.quantity, totals: l.totals })),
    fulfillment: value.fulfillment?.methods?.map(m => ({ keys: Object.keys(m), type: m.type,
      groups: m.groups?.map(g => ({ keys: Object.keys(g), options: g.options, selected_option_id: g.selected_option_id })) })) };
}
let cart, checkout;
try {
  const value = await call('create_cart', { cart: { line_items: [{ item: { id: input.variantId }, quantity: 1 }],
    context: { address_country: 'US', currency: 'USD' },
    fulfillment: { methods: [{ type: 'shipping', destinations: [input.address] }] } } });
  cart = value.cart ?? value;
  await call('get_cart', { id: cart.id });
  const c = await call('create_checkout', { checkout: { cart_id: cart.id, line_items: [] } });
  checkout = c.checkout ?? c;
  await call('get_checkout', { id: checkout.id });
} finally {
  if (checkout?.id) await call('cancel_checkout', { id: checkout.id });
  if (cart?.id) await call('cancel_cart', { id: cart.id });
}
