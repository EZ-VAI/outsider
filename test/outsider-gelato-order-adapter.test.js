import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGelatoOrderAdapter } from '../src/outsider-gelato-order-adapter.js';

const NOW = '2026-09-09T22:00:00.000Z', KEY = 'test-private-gelato-api-key';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const input = () => ({ orderReferenceId: 'outcome-first-resource', customerReferenceId: 'customer-private', currency: 'USD',
  recipient: { country: 'US', firstName: 'Test', lastName: 'Recipient', addressLine1: '1 Test Street', city: 'Boston',
    postCode: '02110', state: 'MA', email: 'test@example.test' },
  products: [{ itemReferenceId: 'item-a', productUid: 'cards_product_uid', quantity: 20,
    files: [{ type: 'default', url: 'https://artwork.example.test/approved.pdf' }] }] });
function quoteFor(body) {
  return { orderReferenceId: body.orderReferenceId, quotes: [{ id: 'provider-quote-a',
    itemReferenceIds: body.products.map(product => product.itemReferenceId), fulfillmentCountry: 'US',
    products: body.products.map(product => ({ itemReferenceId: product.itemReferenceId, productUid: product.productUid,
      quantity: product.quantity, price: 10.25, currency: 'USD' })),
    shipmentMethods: [{ shipmentMethodUid: 'ups_ground', name: 'Ground', price: 5.50, currency: 'USD',
      minDeliveryDate: '2026-09-15', maxDeliveryDate: '2026-09-17' }] }] };
}
function fixture(t, { override, noConfig = false } = {}) {
  const nodeDirectory = mkdtempSync(path.join(tmpdir(), 'outsider-gelato-test-'));
  t.after(() => rmSync(nodeDirectory, { recursive: true, force: true }));
  const connectionDirectory = path.join(nodeDirectory, 'connections');
  mkdirSync(connectionDirectory, { mode: 0o700 });
  const keyFile = path.join(connectionDirectory, 'gelato-key.txt');
  const configFile = path.join(connectionDirectory, 'gelato.json');
  writeFileSync(keyFile, KEY, { mode: 0o600 });
  if (!noConfig) writeFileSync(configFile, JSON.stringify({ schema: 'outsider/gelato-connection/v1', apiKeyFile: keyFile }), { mode: 0o600 });
  const calls = [], remote = new Map(); let nextOrder = 1;
  async function fetchImpl(url, options) {
    assert.equal(new URL(url).origin, 'https://order.gelatoapis.com');
    assert.equal(options.headers['X-API-KEY'], KEY);
    assert.equal(options.redirect, 'error');
    const call = { url, path: new URL(url).pathname, method: options.method, body: options.body ? JSON.parse(options.body) : null };
    calls.push(call);
    const custom = await override?.(call, { remote, calls });
    if (custom) return custom;
    if (call.path === '/v4/orders:quote') return json(quoteFor(call.body));
    if (call.path === '/v4/orders:search') return json({ orders: [...remote.values()]
      .filter(order => order.orderReferenceId === call.body.orderReferenceId)
      .map(order => ({ id: order.id, orderReferenceId: order.orderReferenceId })) });
    if (call.path === '/v4/orders' && call.method === 'POST') {
      const order = { ...structuredClone(call.body), id: `native-order-${nextOrder++}`, financialStatus: 'draft', fulfillmentStatus: 'draft',
        connectedOrderIds: [], shipment: { shipmentMethodUid: call.body.shipmentMethodUid, packages: [] },
        receipts: [{ transactionType: 'purchase', currency: 'USD', totalInclVat: '16.74' }] };
      remote.set(order.id, order); return json(order);
    }
    if (call.path.endsWith(':cancel')) {
      const order = remote.get(call.path.split('/').at(-1).replace(':cancel', ''));
      if (!order) return json({}, 404);
      if (order.fulfillmentStatus === 'printed') return json({ message: 'Cannot cancel' }, 409);
      order.fulfillmentStatus = 'canceled'; return new Response('', { status: 200 });
    }
    if (call.method === 'GET') return remote.has(call.path.split('/').at(-1))
      ? json(remote.get(call.path.split('/').at(-1))) : json({}, 404);
    assert.fail(`Unexpected route ${call.method} ${call.path}`);
  }
  const adapter = createGelatoOrderAdapter({ nodeDirectory, fetchImpl, clock: () => NOW });
  async function draft(request = input()) {
    const quote = await adapter.quote(request);
    const result = await adapter.createDraft({ quoteId: quote.quoteId, shipmentMethodUid: 'ups_ground' });
    return { quote, result, orderId: result.orders[0].orderId };
  }
  return { adapter, calls, remote, nodeDirectory, configFile, keyFile, fetchImpl, draft };
}

test('configuration is private-file-only and no configuration never makes a provider request', async t => {
  const f = fixture(t, { noConfig: true });
  assert.equal(f.adapter.status().configured, false);
  assert.equal(f.adapter.status().authenticatedAccessVerified, false);
  await assert.rejects(f.adapter.quote(input()), { code: 'GELATO_NOT_CONFIGURED' });
  assert.equal(f.calls.length, 0);
  writeFileSync(f.configFile, JSON.stringify({ schema: 'outsider/gelato-connection/v1', apiKeyFile: f.keyFile }), { mode: 0o600 });
  chmodSync(f.keyFile, 0o644);
  assert.equal(f.adapter.status().configured, false);
  await assert.rejects(f.adapter.quote(input()), { code: 'GELATO_KEY_FILE_INVALID' });
  assert.equal(f.calls.length, 0);
});

test('native quote is an estimate; exact products are bound and private inputs are not projected', async t => {
  const { adapter, calls, nodeDirectory } = fixture(t);
  const quote = await adapter.quote(input());
  assert.equal(calls[0].path, '/v4/orders:quote');
  assert.equal(calls[0].body.allowMultipleQuotes, false);
  assert.equal(quote.priceLocked, false);
  assert.equal(quote.providerExpiresAt, null);
  assert.equal(quote.allInTotalKnown, false);
  assert.deepEqual(quote.groups[0].products[0].price, { amountMinor: '1025', currency: 'USD' });
  assert.deepEqual(quote.groups[0].shipmentMethods[0].price, { amountMinor: '550', currency: 'USD' });
  assert.equal(quote.groups[0].shipmentMethods[0].deliveryIsEstimate, true);
  for (const privateValue of [KEY, 'test@example.test', 'approved.pdf', '1 Test Street']) assert.equal(JSON.stringify(quote).includes(privateValue), false);
  for (const file of readdirSync(path.join(nodeDirectory, 'gelato-orders'))) {
    assert.equal(statSync(path.join(nodeDirectory, 'gelato-orders', file)).mode & 0o777, 0o600);
    assert.equal(readFileSync(path.join(nodeDirectory, 'gelato-orders', file), 'utf8').includes(KEY), false);
  }
});

test('invalid quote items, mismatched currency and partial inventory are rejected', async t => {
  for (const mutation of [value => { value.quotes[0].products[0].quantity++; },
    value => { value.quotes[0].products[0].currency = 'EUR'; },
    value => { value.quotes[0].products[0].price = 1.234; },
    value => { value.quotes[0].itemReferenceIds = ['other-item']; }]) {
    const f = fixture(t, { override: call => { if (call.path !== '/v4/orders:quote') return; const value = quoteFor(call.body); mutation(value); return json(value); } });
    await assert.rejects(f.adapter.quote(input()), error => /^GELATO_(QUOTE_ITEM_MISMATCH|PRICE_RESPONSE_INVALID)$/u.test(error.code));
    assert.equal(f.calls.some(call => call.path === '/v4/orders'), false);
  }
});

test('draft creation always has explicit draft type, fixed selected shipping and original quote data', async t => {
  const f = fixture(t), { quote, result, orderId } = await f.draft();
  const create = f.calls.find(call => call.path === '/v4/orders');
  assert.deepEqual(create.body, { orderType: 'draft', orderReferenceId: input().orderReferenceId,
    customerReferenceId: input().customerReferenceId, currency: 'USD', shippingAddress: input().recipient,
    items: input().products, shipmentMethodUid: 'ups_ground' });
  assert.equal(result.outcome, 'DRAFT_CREATED');
  assert.equal(result.orders[0].orderType, 'draft');
  assert.equal(result.orders[0].delivered, false);
  assert.deepEqual(result.orders[0].total, { amountMinor: '1674', currency: 'USD' });
  assert.equal(result.orders[0].quoteId, quote.quoteId);
  const read = await f.adapter.read({ orderId });
  assert.equal(read.orderId, orderId);
  assert.equal(JSON.stringify(read).includes('test@example.test'), false);
});

test('production cannot bypass the missing provider price lock; no PATCH is sent', async t => {
  const f = fixture(t), { quote, orderId } = await f.draft();
  await assert.rejects(f.adapter.confirm({ orderId, quoteId: quote.quoteId }), { code: 'GELATO_EXPLICIT_CONFIRM_REQUIRED' });
  const result = await f.adapter.confirm({ action: 'CONFIRM_PRODUCTION', orderId, quoteId: quote.quoteId });
  assert.deepEqual(result, { outcome: 'UNSUPPORTED', reason: 'PRICE_LOCK_NOT_SUPPORTED', orderId,
    quoteId: quote.quoteId, productionSubmitted: false, providerMaximumAmountSupported: false });
  assert.equal(f.calls.some(call => call.method === 'PATCH'), false);
  await assert.rejects(f.adapter.confirm({ action: 'CONFIRM_PRODUCTION', orderId, quoteId: 'wrong-quote' }), { code: 'GELATO_QUOTE_BINDING_MISMATCH' });
});

test('unquoted shipping and comma-separated alternatives cannot change the selected route', async t => {
  const f = fixture(t), quote = await f.adapter.quote(input());
  await assert.rejects(f.adapter.createDraft({ quoteId: quote.quoteId, shipmentMethodUid: 'not_quoted' }), { code: 'GELATO_SHIPPING_SELECTION_NOT_SUPPORTED' });
  await assert.rejects(f.adapter.createDraft({ quoteId: quote.quoteId, shipmentMethodUid: 'ups_ground,express' }), { code: 'GELATO_IDENTIFIER_INVALID' });
  assert.equal(f.calls.length, 1);
});

test('retry after persisted draft creation reconciles by original reference without another create', async t => {
  const f = fixture(t), { quote, orderId } = await f.draft();
  const restarted = createGelatoOrderAdapter({ nodeDirectory: f.nodeDirectory, fetchImpl: f.fetchImpl, clock: () => NOW });
  const retry = await restarted.createDraft({ quoteId: quote.quoteId, shipmentMethodUid: 'ups_ground' });
  assert.equal(retry.outcome, 'RECONCILED');
  assert.equal(retry.orders[0].orderId, orderId);
  assert.equal(f.calls.filter(call => call.path === '/v4/orders').length, 1);
  const reconciliation = await restarted.reconcile({ orderReferenceId: input().orderReferenceId });
  assert.equal(reconciliation.outcome, 'FOUND');
  assert.equal(reconciliation.retryCreateAllowed, false);
});

test('unknown create with no visible order never retries a potentially paid provider write', async t => {
  const f = fixture(t, { override: call => { if (call.path === '/v4/orders') throw new Error(`unknown transport ${KEY}`); } });
  const quote = await f.adapter.quote(input());
  await assert.rejects(f.adapter.createDraft({ quoteId: quote.quoteId, shipmentMethodUid: 'ups_ground' }), { code: 'GELATO_TRANSPORT_FAILED' });
  await assert.rejects(f.adapter.createDraft({ quoteId: quote.quoteId, shipmentMethodUid: 'ups_ground' }), { code: 'GELATO_CREATE_OUTCOME_UNKNOWN' });
  assert.equal(f.calls.filter(call => call.path === '/v4/orders').length, 1);
  assert.equal((await f.adapter.reconcile({ orderReferenceId: input().orderReferenceId })).outcome, 'UNKNOWN');
});

test('an uncertain create that later appears is bound by the full native order, not search listing alone', async t => {
  const f = fixture(t, { override: (call, { remote }) => {
    if (call.path !== '/v4/orders') return;
    remote.set('unknown-created', { ...structuredClone(call.body), id: 'unknown-created', financialStatus: 'draft',
      fulfillmentStatus: 'draft', shipment: { shipmentMethodUid: 'ups_ground', packages: [] }, connectedOrderIds: [], receipts: [] });
    throw new Error('lost response');
  } });
  const quote = await f.adapter.quote(input());
  await assert.rejects(f.adapter.createDraft({ quoteId: quote.quoteId, shipmentMethodUid: 'ups_ground' }), { code: 'GELATO_TRANSPORT_FAILED' });
  const result = await f.adapter.reconcile({ orderReferenceId: input().orderReferenceId });
  assert.equal(result.orders[0].orderId, 'unknown-created');
  assert.equal(f.calls.filter(call => call.path === '/v4/orders').length, 1);
});

test('same reference cannot be rebound to a different quote or altered order details', async t => {
  const f = fixture(t), { quote, orderId } = await f.draft();
  const changed = input(); changed.products[0].quantity++;
  const another = await f.adapter.quote(changed);
  await assert.rejects(f.adapter.createDraft({ quoteId: another.quoteId, shipmentMethodUid: 'ups_ground' }), { code: 'GELATO_REFERENCE_ALREADY_BOUND' });
  const original = structuredClone(f.remote.get(orderId));
  for (const mutate of [value => { value.orderReferenceId = 'another-order'; },
    value => { value.items[0].quantity++; }, value => { value.items[0].files[0].url = 'https://artwork.example.test/unapproved.pdf'; },
    value => { value.shippingAddress.addressLine1 = 'Changed recipient'; }, value => { value.shipment.shipmentMethodUid = 'express'; }]) {
    const bad = structuredClone(original); mutate(bad); f.remote.set(orderId, bad);
    await assert.rejects(f.adapter.read({ orderId }), error => /^GELATO_ORDER_/u.test(error.code));
  }
  assert.equal(f.calls.filter(call => call.path === '/v4/orders').length, 1);
  assert.ok(quote.quoteId);
});

test('credential account changes cannot make old private order bindings authorize another account', async t => {
  const f = fixture(t), { orderId } = await f.draft();
  const before = f.calls.length;
  writeFileSync(f.keyFile, 'different-account-test-key');
  await assert.rejects(f.adapter.read({ orderId }), { code: 'GELATO_ACCOUNT_BINDING_CHANGED' });
  assert.equal(f.calls.length, before);
});

test('split orders are tracked together and provider-reported delivery is separate from production', async t => {
  const f = fixture(t);
  const request = input(); request.products.push({ itemReferenceId: 'item-b', productUid: 'second_product_uid', quantity: 1 });
  const { orderId } = await f.draft(request);
  const root = f.remote.get(orderId), child = structuredClone(root);
  root.items = root.items.slice(0, 1); root.connectedOrderIds = ['native-child']; root.fulfillmentStatus = 'delivered'; root.orderType = 'order';
  child.id = 'native-child'; child.items = child.items.slice(1); child.connectedOrderIds = [orderId]; child.fulfillmentStatus = 'shipped'; child.orderType = 'order';
  child.shipment.packages = [{ trackingCode: 'carrier-ref', trackingUrl: 'https://carrier.example.test/track/abc', status: 'in_transit' }];
  f.remote.set(child.id, child);
  const partial = await f.adapter.track({ orderId });
  assert.equal(partial.orders.length, 2);
  assert.equal(partial.delivered, false);
  assert.equal(partial.orders[1].packages[0].trackingCode, 'carrier-ref');
  child.fulfillmentStatus = 'delivered';
  const delivered = await f.adapter.track({ orderId });
  assert.equal(delivered.delivered, true);
  assert.equal(delivered.deliveryEvidence, 'PROVIDER_REPORTED');
  assert.equal((await f.adapter.read({ orderId: child.id })).orderId, child.id);
});

test('unrelated duplicate provider orders are not guessed into one recovered execution', async t => {
  const f = fixture(t), { orderId } = await f.draft();
  const duplicate = structuredClone(f.remote.get(orderId)); duplicate.id = 'unrelated-duplicate'; f.remote.set(duplicate.id, duplicate);
  await assert.rejects(f.adapter.reconcile({ orderReferenceId: input().orderReferenceId }), { code: 'GELATO_DUPLICATE_PROVIDER_ORDERS' });
});

test('cancellation is explicit, checks resulting state and does not invent a refund', async t => {
  const f = fixture(t), { orderId } = await f.draft();
  await assert.rejects(f.adapter.cancel({ orderId }), { code: 'GELATO_EXPLICIT_CANCEL_REQUIRED' });
  const canceled = await f.adapter.cancel({ action: 'CANCEL_ORDER', orderId });
  assert.equal(canceled.outcome, 'CANCELED'); assert.equal(canceled.refundConfirmed, false);
  assert.equal(canceled.order.fulfillmentStatus, 'canceled');
  await f.adapter.cancel({ action: 'CANCEL_ORDER', orderId });
  assert.equal(f.calls.filter(call => call.path.endsWith(':cancel')).length, 1);
});

test('too-late or unknown cancellation never claims success or blindly retries', async t => {
  const f = fixture(t), { orderId } = await f.draft();
  f.remote.get(orderId).fulfillmentStatus = 'printed';
  await assert.rejects(f.adapter.cancel({ action: 'CANCEL_ORDER', orderId }), { code: 'GELATO_PROVIDER_CONFLICT' });
  await assert.rejects(f.adapter.cancel({ action: 'CANCEL_ORDER', orderId }), { code: 'GELATO_CANCEL_OUTCOME_UNKNOWN' });
  assert.equal(f.calls.filter(call => call.path.endsWith(':cancel')).length, 1);
});

test('upstream errors and malformed responses cannot expose credentials or be accepted as valid quotes', async t => {
  for (const status of [401, 403, 429, 500]) {
    const f = fixture(t, { override: () => json({ error: `${KEY} private provider body` }, status) });
    await assert.rejects(f.adapter.quote(input()), error => {
      assert.equal(error.message.includes(KEY), false); assert.equal(JSON.stringify(error).includes(KEY), false); return /^GELATO_/u.test(error.code);
    });
  }
  const f = fixture(t, { override: () => new Response('x'.repeat(2 * 1024 * 1024 + 1)) });
  await assert.rejects(f.adapter.quote(input()), { code: 'GELATO_RESPONSE_TOO_LARGE' });
});

test('input does not permit custom API hosts, unrecognized effects or ambiguous currencies', async t => {
  const f = fixture(t);
  for (const value of [{ ...input(), apiUrl: 'https://attacker.example.test' }, { ...input(), currency: 'JPY' },
    { ...input(), orderType: 'order' }, { ...input(), products: [{ ...input().products[0], files: [{ type: 'default', url: 'http://localhost/private' }] }] }]) {
    await assert.rejects(f.adapter.quote(value), error => /^GELATO_/u.test(error.code));
  }
  assert.equal(f.calls.length, 0);
});

test('a credential replacement during a provider request cannot relabel its response as the new account', async t => {
  let f;
  f = fixture(t, { override: call => {
    if (call.path === '/v4/orders:quote') { writeFileSync(f.keyFile, 'replacement-private-api-key'); return json(quoteFor(call.body)); }
  } });
  await assert.rejects(f.adapter.quote(input()), { code: 'GELATO_ACCOUNT_BINDING_CHANGED' });
  assert.equal(f.adapter.status().configured, false);
  assert.equal(f.calls.length, 1);
});

test('two adapter instances cannot concurrently create the same merchant reference', async t => {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; }), held = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { override: async call => { if (call.path === '/v4/orders') { enter(); await held; } } });
  const quote = await f.adapter.quote(input());
  const other = createGelatoOrderAdapter({ nodeDirectory: f.nodeDirectory, fetchImpl: f.fetchImpl, clock: () => NOW });
  const first = f.adapter.createDraft({ quoteId: quote.quoteId, shipmentMethodUid: 'ups_ground' });
  await entered;
  try {
    await assert.rejects(other.createDraft({ quoteId: quote.quoteId, shipmentMethodUid: 'ups_ground' }),
      error => error.outsiderCode === 'NODE_ALREADY_RUNNING');
  } finally { release(); }
  assert.equal((await first).outcome, 'DRAFT_CREATED');
  assert.equal(f.calls.filter(call => call.path === '/v4/orders').length, 1);
});

test('a missing connected item, an ambiguous receipt, or a draft delivery flag is not completion', async t => {
  const f = fixture(t), { orderId } = await f.draft();
  const order = f.remote.get(orderId);
  order.receipts.push({ transactionType: 'refund', totalInclVat: '1.00', currency: 'USD' });
  order.fulfillmentStatus = 'delivered';
  const draft = await f.adapter.read({ orderId });
  assert.equal(draft.total, null); assert.equal(draft.delivered, false);
  order.orderType = 'order';
  order.connectedOrderIds = ['missing-connected-order'];
  await assert.rejects(f.adapter.track({ orderId }), { code: 'GELATO_PROVIDER_ORDER_NOT_FOUND' });
});

test('tracking binds root and connected GET responses to their requested native IDs', async t => {
  for (const connected of [false, true]) {
    let expectedId;
    const f = fixture(t, { override: (call, { remote }) => {
      if (call.method !== 'GET' || call.path !== `/v4/orders/${expectedId}`) return;
      const changed = structuredClone(remote.get(expectedId)); changed.id = 'unrequested-order';
      return json(changed);
    } });
    const { orderId } = await f.draft();
    expectedId = orderId;
    if (connected) {
      const original = f.remote.get(orderId), child = structuredClone(original);
      child.id = 'expected-child'; child.connectedOrderIds = [orderId];
      original.connectedOrderIds = [child.id]; f.remote.set(child.id, child); expectedId = child.id;
    }
    await assert.rejects(f.adapter.track({ orderId }), { code: 'GELATO_ORDER_BINDING_MISMATCH' });
    const before = f.calls.length;
    await assert.rejects(f.adapter.cancel({ action: 'CANCEL_ORDER', orderId: 'unrequested-order' }),
      { code: 'GELATO_LOCAL_RECORD_NOT_FOUND' });
    assert.equal(f.calls.length, before, 'a mismatched GET must not grant later cancellation authority');
  }
});

test('a quoted page count cannot change or disappear from a bound order', async t => {
  const f = fixture(t), request = input(); request.products[0].pageCount = 16;
  const { orderId } = await f.draft(request);
  assert.equal((await f.adapter.read({ orderId })).orderId, orderId);
  const original = structuredClone(f.remote.get(orderId));
  for (const pageCount of [8, undefined]) {
    const changed = structuredClone(original);
    if (pageCount === undefined) delete changed.items[0].pageCount;
    else changed.items[0].pageCount = pageCount;
    f.remote.set(orderId, changed);
    await assert.rejects(f.adapter.read({ orderId }), { code: 'GELATO_ORDER_ITEM_MISMATCH' });
  }
});

test('malformed search records and non-string connected IDs are rejected without accidental adoption', async t => {
  let malformed;
  const f = fixture(t, { override: call => call.path === '/v4/orders:search' && malformed
    ? json({ orders: malformed }) : undefined });
  const { orderId } = await f.draft();
  for (const candidate of [null, { orderReferenceId: input().orderReferenceId, id: 123 }]) {
    malformed = [candidate];
    await assert.rejects(f.adapter.reconcile({ orderReferenceId: input().orderReferenceId }),
      { code: 'GELATO_SEARCH_RESPONSE_INVALID' });
  }
  f.remote.get(orderId).connectedOrderIds = [123];
  await assert.rejects(f.adapter.track({ orderId }), { code: 'GELATO_ORDER_BINDING_MISMATCH' });
});

test('a valid large quote is rejected before returning or persisting an unreadable local record', async t => {
  const f = fixture(t, { override: call => {
    if (call.path !== '/v4/orders:quote') return;
    const result = { orderReferenceId: call.body.orderReferenceId,
      quotes: call.body.products.map((product, index) => ({ id: `quote-${index}`, itemReferenceIds: [product.itemReferenceId],
        fulfillmentCountry: 'US', products: [{ itemReferenceId: product.itemReferenceId,
          productUid: product.productUid, quantity: product.quantity, price: 10.25, currency: 'USD' }],
        shipmentMethods: Array.from({ length: 100 }, (_, shipping) => ({ shipmentMethodUid: `method-${shipping}`,
          name: 'N'.repeat(100), price: 5.50, currency: 'USD', minDeliveryDate: '2026-09-15', maxDeliveryDate: '2026-09-17' })) })) };
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 2 * 1024 * 1024);
    return json(result);
  } });
  const request = input(); request.products = Array.from({ length: 50 }, (_, index) => ({
    itemReferenceId: `item-${index}`, productUid: 'product_uid', quantity: 1 }));
  await assert.rejects(f.adapter.quote(request), { code: 'GELATO_LOCAL_RECORD_TOO_LARGE' });
  assert.deepEqual(readdirSync(path.join(f.nodeDirectory, 'gelato-orders')), []);
  assert.equal(f.calls.some(call => call.path === '/v4/orders'), false);
});
