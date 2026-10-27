/* Gelato V4 preparation and fulfillment lookup, checked 2026-09-09.
 * https://dashboard.gelato.com/docs/orders/v4/{quote,create,get,search,cancel}/
 * https://dashboard.gelato.com/docs/orders/v4/patch/
 * A draft is explicitly non-production. Gelato's documented conversion does
 * not bind an all-in amount or enforce a maximum price, so this adapter never
 * converts to production. It does not simulate successful physical delivery.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync } from 'node:fs';
import { canonicalizeStrict } from './canonical.js';
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce, withUserHeldExecutionLockV2 }
  from './outsider-user-held-durable-execution-v2.js';

export const GELATO_ORDER_PROTOCOL = 'outsider/gelato-order/v1';
const API = 'https://order.gelatoapis.com/v4/orders';
const ID = /^[A-Za-z0-9_-]{1,191}$/u;
const MAX_BYTES = 2 * 1024 * 1024, MAX_RECORDS = 1000;
// readPrivateExecutionBytes admits at most 1 MiB. Reject before writing an
// oversized quote rather than return a quoteId that can never be loaded.
const MAX_PRIVATE_RECORD_BYTES = 1024 * 1024;
const fail = code => { throw Object.assign(new Error(`GELATO_${code}`), { code: `GELATO_${code}` }); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : canonicalizeStrict(value)).digest('hex');
const id = value => { if (typeof value !== 'string' || !ID.test(value)) fail('IDENTIFIER_INVALID'); return value; };
function exact(value, fields) {
  if (!plain(value) || Object.keys(value).some(key => !fields.includes(key))) fail('INPUT_INVALID');
}
function text(value, maximum = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\0-\x1f\x7f]/u.test(value)) fail('INPUT_INVALID');
  return value;
}
function httpsUrl(value) {
  let url; try { url = new URL(value); } catch { fail('FILE_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || value.length > 4096
    || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) fail('FILE_URL_INVALID');
  return url.href;
}
function normalizeInput(value) {
  exact(value, ['orderReferenceId', 'customerReferenceId', 'currency', 'recipient', 'products']);
  const currency = value.currency;
  // This adapter initially supports two-decimal USD; a currency-aware money
  // extension must be explicit instead of rounding JPY/KRW amounts as cents.
  if (currency !== 'USD') fail('CURRENCY_NOT_SUPPORTED');
  const fields = ['country', 'firstName', 'lastName', 'companyName', 'addressLine1', 'addressLine2', 'city', 'postCode', 'state', 'email', 'phone'];
  exact(value.recipient, fields);
  const recipient = Object.fromEntries(fields.filter(key => value.recipient[key] !== undefined)
    .map(key => [key, text(value.recipient[key], key === 'email' ? 254 : 200)]));
  for (const required of ['country', 'firstName', 'lastName', 'addressLine1', 'city', 'postCode', 'email']) if (!recipient[required]) fail('RECIPIENT_INVALID');
  if (!/^[A-Z]{2}$/u.test(recipient.country) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipient.email)
    || ['US', 'CA', 'AU'].includes(recipient.country) && !recipient.state) fail('RECIPIENT_INVALID');
  if (!Array.isArray(value.products) || !value.products.length || value.products.length > 50) fail('PRODUCTS_INVALID');
  const products = value.products.map(product => {
    exact(product, ['itemReferenceId', 'productUid', 'quantity', 'pageCount', 'files']);
    if (!Number.isSafeInteger(product.quantity) || product.quantity < 1 || product.quantity > 10000) fail('QUANTITY_INVALID');
    if (product.pageCount !== undefined && (!Number.isSafeInteger(product.pageCount) || product.pageCount < 1 || product.pageCount > 10000)) fail('PAGE_COUNT_INVALID');
    const result = { itemReferenceId: id(product.itemReferenceId), productUid: text(product.productUid, 500), quantity: product.quantity };
    if (product.pageCount !== undefined) result.pageCount = product.pageCount;
    if (product.files !== undefined) {
      if (!Array.isArray(product.files) || !product.files.length || product.files.length > 20) fail('FILES_INVALID');
      result.files = product.files.map(file => { exact(file, ['type', 'url']); return { type: text(file.type, 100), url: httpsUrl(file.url) }; });
    }
    return result;
  });
  if (new Set(products.map(product => product.itemReferenceId)).size !== products.length) fail('DUPLICATE_ITEM');
  return { orderReferenceId: id(value.orderReferenceId), customerReferenceId: id(value.customerReferenceId), currency, recipient, products };
}
function decimalMinor(value) {
  const str = String(value);
  if (!/^(0|[1-9][0-9]{0,12})(?:\.[0-9]{1,2})?$/u.test(str)) return null;
  const [major, fraction = ''] = str.split('.');
  return String(BigInt(major) * 100n + BigInt(fraction.padEnd(2, '0')));
}
function amount(value, currency) {
  const amountMinor = decimalMinor(value);
  if (currency !== 'USD' || amountMinor === null) fail('PRICE_RESPONSE_INVALID');
  return { amountMinor, currency };
}
const safeLabel = value => typeof value === 'string' ? value.replace(/[\0-\x1f\x7f]/gu, ' ').slice(0, 300) : null;
const safeTrackingUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; } };

export function createGelatoOrderAdapter({ nodeDirectory, directory, fetchImpl = globalThis.fetch,
  clock = () => new Date().toISOString() } = {}) {
  if (!path.isAbsolute(nodeDirectory ?? '') || typeof fetchImpl !== 'function' || typeof clock !== 'function') fail('CONFIG_INVALID');
  const root = directory ?? path.join(nodeDirectory, 'gelato-orders');
  if (!path.isAbsolute(root)) fail('DIRECTORY_INVALID');
  const configFile = path.join(nodeDirectory, 'connections', 'gelato.json');
  let pinnedAccountBinding;
  const now = () => { const value = new Date(clock()); if (!Number.isFinite(value.getTime())) fail('CLOCK_INVALID'); return value.toISOString(); };
  function configuration() {
    if (!existsSync(configFile)) fail('NOT_CONFIGURED');
    let config, key;
    try { config = JSON.parse(readPrivateExecutionBytes(configFile)); }
    catch { fail('CONFIG_INVALID'); }
    exact(config, ['schema', 'apiKeyFile']);
    if (config.schema !== 'outsider/gelato-connection/v1' || !path.isAbsolute(config.apiKeyFile ?? '')) fail('CONFIG_INVALID');
    try { key = readPrivateExecutionBytes(config.apiKeyFile).toString('utf8').trim(); }
    catch { fail('KEY_FILE_INVALID'); }
    if (!key || key.length > 4096 || /\s|\0/u.test(key)) fail('KEY_INVALID');
    const accountBinding = hash(key);
    // Pin this adapter's credential context across async calls. A replaced key
    // cannot silently bind an earlier account's response to the new account.
    if (pinnedAccountBinding && pinnedAccountBinding !== accountBinding) fail('ACCOUNT_BINDING_CHANGED');
    pinnedAccountBinding = accountBinding;
    return { key, accountBinding };
  }
  function ensureRoot() {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) fail('DIRECTORY_NOT_PRIVATE');
  }
  const filename = (kind, key) => path.join(root, `${kind}-${hash(key)}.json`);
  const exists = (kind, key) => existsSync(filename(kind, key));
  function load(kind, key) {
    ensureRoot();
    let record;
    try { record = JSON.parse(readPrivateExecutionBytes(filename(kind, key))); }
    catch { fail('LOCAL_RECORD_NOT_FOUND'); }
    if (record.accountBinding !== configuration().accountBinding) fail('ACCOUNT_BINDING_CHANGED');
    return record;
  }
  function save(kind, key, value) {
    ensureRoot();
    const record = { ...value, accountBinding: configuration().accountBinding };
    if (Buffer.byteLength(`${canonicalizeStrict(record)}\n`) > MAX_PRIVATE_RECORD_BYTES) fail('LOCAL_RECORD_TOO_LARGE');
    writePrivateExecutionRecordOnce(filename(kind, key), record);
  }
  const lock = (key, fn) => withUserHeldExecutionLockV2(`sha256:${hash(`${root}:${key}`)}`, fn);
  async function request(suffix, { method = 'GET', body, empty = false } = {}) {
    const { key } = configuration();
    let response;
    try { response = await fetchImpl(`${API}${suffix}`, { method, headers: { 'X-API-KEY': key,
      Accept: 'application/json', 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    catch { fail('TRANSPORT_FAILED'); }
    if (response.redirected || response.status >= 300 && response.status < 400) fail('REDIRECT_REJECTED');
    if (response.status === 401 || response.status === 403) fail('AUTHORIZATION_FAILED');
    if (response.status === 404) fail('PROVIDER_ORDER_NOT_FOUND');
    if (response.status === 409) fail('PROVIDER_CONFLICT');
    if (response.status === 429) fail('RATE_LIMITED');
    if (response.status < 200 || response.status >= 300) fail('PROVIDER_REQUEST_FAILED');
    const length = response.headers?.get?.('content-length');
    if (length && Number(length) > MAX_BYTES) fail('RESPONSE_TOO_LARGE');
    const chunks = []; let size = 0;
    try {
      if (response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
        for await (const chunk of response.body) { size += chunk.byteLength; if (size > MAX_BYTES) fail('RESPONSE_TOO_LARGE'); chunks.push(Buffer.from(chunk)); }
      } else { const bytes = Buffer.from(await response.arrayBuffer()); size = bytes.length; chunks.push(bytes); }
    } catch (error) { if (error.code === 'GELATO_RESPONSE_TOO_LARGE') throw error; fail('RESPONSE_READ_FAILED'); }
    if (size > MAX_BYTES) fail('RESPONSE_TOO_LARGE');
    if (empty && !size) return null;
    let value; try { value = JSON.parse(Buffer.concat(chunks)); } catch { fail('RESPONSE_INVALID'); }
    if (!plain(value)) fail('RESPONSE_INVALID');
    return value;
  }
  function quoteProjection(record) {
    return { protocol: GELATO_ORDER_PROTOCOL, quoteId: record.quoteId, orderReferenceId: record.input.orderReferenceId,
      currency: record.input.currency, quotedAt: record.quotedAt, priceLocked: false, providerExpiresAt: null,
      allInTotalKnown: false, productionEnabled: false, groups: record.groups };
  }
  async function quote(input) {
    const normalized = normalizeInput(input);
    const result = await request(':quote', { method: 'POST', body: { ...normalized, allowMultipleQuotes: false } });
    if (result.orderReferenceId !== normalized.orderReferenceId || !Array.isArray(result.quotes)
      || !result.quotes.length || result.quotes.length > 50) fail('QUOTE_RESPONSE_INVALID');
    const seen = new Set();
    const groups = result.quotes.map(group => {
      if (!plain(group) || !Array.isArray(group.products) || !group.products.length || !Array.isArray(group.itemReferenceIds)
        || !Array.isArray(group.shipmentMethods) || !group.shipmentMethods.length || group.shipmentMethods.length > 100) fail('QUOTE_RESPONSE_INVALID');
      const products = group.products.map(product => {
        if (!plain(product)) fail('QUOTE_RESPONSE_INVALID');
        const original = normalized.products.find(item => item.itemReferenceId === product.itemReferenceId);
        if (!original || seen.has(product.itemReferenceId) || original.productUid !== product.productUid
          || original.quantity !== product.quantity) fail('QUOTE_ITEM_MISMATCH');
        seen.add(product.itemReferenceId);
        return { itemReferenceId: original.itemReferenceId, productUid: original.productUid, quantity: original.quantity,
          price: amount(product.price, product.currency) };
      });
      if (hash([...group.itemReferenceIds].sort()) !== hash(products.map(product => product.itemReferenceId).sort())) fail('QUOTE_ITEM_MISMATCH');
      const shipmentMethods = group.shipmentMethods.map(method => { if (!plain(method)) fail('QUOTE_RESPONSE_INVALID'); return { shipmentMethodUid: id(method.shipmentMethodUid),
        name: safeLabel(method.name), price: amount(method.price, method.currency),
        minDeliveryDate: safeLabel(method.minDeliveryDate), maxDeliveryDate: safeLabel(method.maxDeliveryDate),
        deliveryIsEstimate: true }; });
      if (new Set(shipmentMethods.map(method => method.shipmentMethodUid)).size !== shipmentMethods.length) fail('QUOTE_RESPONSE_INVALID');
      return { providerQuoteId: id(group.id), itemReferenceIds: products.map(product => product.itemReferenceId),
        fulfillmentCountry: safeLabel(group.fulfillmentCountry), products, shipmentMethods };
    });
    if (seen.size !== normalized.products.length) fail('QUOTE_ITEM_MISMATCH');
    const quotedAt = now(), quoteId = `gq_${hash({ input: normalized, groups, quotedAt })}`;
    const record = { quoteId, input: normalized, groups, quotedAt };
    save('quote', quoteId, record);
    return quoteProjection(record);
  }
  function assertRemote(value, binding, subset = false) {
    const source = load('quote', binding.quoteId).input;
    if (!plain(value) || typeof value.id !== 'string' || !ID.test(value.id) || value.id !== binding.orderId
      || value.orderReferenceId !== source.orderReferenceId || value.customerReferenceId !== source.customerReferenceId
      || value.currency !== source.currency || !['draft', 'order'].includes(value.orderType)
      || !Array.isArray(value.items) || !value.items.length || value.items.length > 50) fail('ORDER_BINDING_MISMATCH');
    const seen = new Set();
    for (const item of value.items) {
      if (!plain(item)) fail('ORDER_ITEM_MISMATCH');
      const original = source.products.find(product => product.itemReferenceId === item.itemReferenceId);
      if (!original || seen.has(item.itemReferenceId) || item.productUid !== original.productUid || item.quantity !== original.quantity
        || original.pageCount !== undefined && item.pageCount !== original.pageCount) fail('ORDER_ITEM_MISMATCH');
      seen.add(item.itemReferenceId);
      if (!Array.isArray(item.files ?? []) || (item.files ?? []).some(file => !plain(file) || typeof file.type !== 'string' || typeof file.url !== 'string')) fail('ORDER_FILES_CHANGED');
      if (original.files?.length && hash((item.files ?? []).map(file => ({ type: file.type, url: file.url })).sort((a, b) => a.type.localeCompare(b.type)))
        !== hash([...original.files].sort((a, b) => a.type.localeCompare(b.type)))) fail('ORDER_FILES_CHANGED');
    }
    const connected = value.connectedOrderIds ?? [];
    if (!Array.isArray(connected) || connected.length > 50
      || connected.some(value => typeof value !== 'string' || !ID.test(value))) fail('ORDER_BINDING_MISMATCH');
    if (!subset && !connected.length && seen.size !== source.products.length) fail('ORDER_ITEM_MISMATCH');
    if (!plain(value.shippingAddress) || Object.entries(source.recipient).some(([key, original]) => value.shippingAddress[key] !== original)) fail('ORDER_RECIPIENT_CHANGED');
    if (value.shipment?.shipmentMethodUid !== binding.shipmentMethodUid) fail('ORDER_SHIPPING_CHANGED');
    return value;
  }
  function projection(value, binding) {
    if (!Array.isArray(value.receipts ?? []) || !Array.isArray(value.shipment?.packages ?? [])
      || (value.shipment?.packages?.length ?? 0) > 100) fail('ORDER_RESPONSE_INVALID');
    const purchase = (value.receipts ?? []).filter(receipt => plain(receipt) && receipt.transactionType === 'purchase'
      && receipt.currency === value.currency && decimalMinor(receipt.totalInclVat) !== null);
    // Multiple invoices/adjustments cannot be guessed into a payable amount.
    const total = purchase.length === 1 && value.receipts.length === 1 ? amount(purchase[0].totalInclVat, value.currency) : null;
    return { protocol: GELATO_ORDER_PROTOCOL, orderId: value.id, quoteId: binding.quoteId,
      orderReferenceId: value.orderReferenceId, orderType: value.orderType,
      financialStatus: safeLabel(value.financialStatus), fulfillmentStatus: safeLabel(value.fulfillmentStatus),
      total, totalSource: total ? 'PROVIDER_PURCHASE_RECEIPT' : null, priceLocked: false,
      connectedOrderIds: value.connectedOrderIds ?? [],
      items: value.items.map(item => ({ itemReferenceId: item.itemReferenceId, productUid: item.productUid,
        quantity: item.quantity, fulfillmentStatus: safeLabel(item.fulfillmentStatus) })),
      packages: (value.shipment?.packages ?? []).map(item => { if (!plain(item)) fail('ORDER_RESPONSE_INVALID'); return { trackingCode: safeLabel(item.trackingCode),
        trackingUrl: safeTrackingUrl(item.trackingUrl), status: safeLabel(item.status) }; }),
      observedAt: now(), delivered: value.orderType === 'order' && value.fulfillmentStatus === 'delivered',
      deliveryEvidence: value.orderType === 'order' && value.fulfillmentStatus === 'delivered' ? 'PROVIDER_REPORTED' : null,
      productionEnabled: false };
  }
  async function rawRead(orderId) {
    id(orderId); const binding = load('order', orderId);
    const value = await request(`/${encodeURIComponent(orderId)}`);
    assertRemote(value, binding, binding.isConnected === true);
    return { value, binding };
  }
  async function read({ orderId } = {}) { const { value, binding } = await rawRead(orderId); return projection(value, binding); }
  function bind(value, creation, isConnected = false) {
    const binding = { orderId: id(value.id), quoteId: creation.quoteId, orderReferenceId: creation.orderReferenceId,
      shipmentMethodUid: creation.shipmentMethodUid, isConnected };
    assertRemote(value, binding, isConnected);
    if (exists('order', binding.orderId)) {
      const existing = load('order', binding.orderId);
      if (existing.quoteId !== binding.quoteId || existing.orderReferenceId !== binding.orderReferenceId
        || existing.shipmentMethodUid !== binding.shipmentMethodUid) fail('ORDER_BINDING_MISMATCH');
      return existing;
    }
    save('order', binding.orderId, binding);
    return binding;
  }
  async function search(creation) {
    const matches = []; let offset = 0;
    while (offset < MAX_RECORDS) {
      const result = await request(':search', { method: 'POST', body: { orderReferenceId: creation.orderReferenceId, limit: 100, offset } });
      if (!Array.isArray(result.orders) || result.orders.length > 100) fail('SEARCH_RESPONSE_INVALID');
      for (const candidate of result.orders) {
        if (!plain(candidate) || candidate.orderReferenceId !== creation.orderReferenceId
          || typeof candidate.id !== 'string' || !ID.test(candidate.id)
          || matches.includes(candidate.id)) fail('SEARCH_RESPONSE_INVALID');
        matches.push(candidate.id);
      }
      if (result.orders.length < 100) break;
      offset += 100;
    }
    if (offset >= MAX_RECORDS) fail('SEARCH_LIMIT');
    const records = [];
    for (const orderId of matches) {
      const value = await request(`/${encodeURIComponent(orderId)}`);
      const binding = { orderId, ...creation };
      assertRemote(value, binding, matches.length > 1);
      records.push(value);
    }
    if (records.length > 1) {
      // Same reference is not a deduplication promise. Only a declared connected
      // order component may be grouped; unrelated duplicates need attention.
      const reached = new Set([records[0].id]);
      let changed = true;
      while (changed) { changed = false; for (const record of records) {
        if (reached.has(record.id) || (record.connectedOrderIds ?? []).some(value => reached.has(value))) {
          for (const value of [record.id, ...(record.connectedOrderIds ?? [])]) if (!reached.has(value)) { reached.add(value); changed = true; }
        }
      } }
      if (records.some(record => !reached.has(record.id))) fail('DUPLICATE_PROVIDER_ORDERS');
    }
    for (const value of records) bind(value, creation, records.length > 1);
    return records.map(value => projection(value, load('order', value.id)));
  }
  async function reconcile({ orderReferenceId } = {}) {
    id(orderReferenceId);
    return lock(orderReferenceId, async () => {
      const creation = load('create-intent', orderReferenceId);
      const orders = await search(creation);
      return { orderReferenceId, outcome: orders.length ? 'FOUND' : 'UNKNOWN', retryCreateAllowed: false, orders };
    });
  }
  async function createDraft(input) {
    exact(input, ['quoteId', 'shipmentMethodUid']);
    const quoted = load('quote', id(input.quoteId));
    const shipmentMethodUid = id(input.shipmentMethodUid);
    if (quoted.groups.some(group => !group.shipmentMethods.some(method => method.shipmentMethodUid === shipmentMethodUid))) fail('SHIPPING_SELECTION_NOT_SUPPORTED');
    const orderReferenceId = quoted.input.orderReferenceId;
    return lock(orderReferenceId, async () => {
      const creation = { quoteId: input.quoteId, orderReferenceId, shipmentMethodUid };
      if (exists('create-intent', orderReferenceId)) {
        const existing = load('create-intent', orderReferenceId);
        if (existing.quoteId !== creation.quoteId || existing.shipmentMethodUid !== shipmentMethodUid) fail('REFERENCE_ALREADY_BOUND');
        const orders = await search(existing);
        if (!orders.length) fail('CREATE_OUTCOME_UNKNOWN');
        return { outcome: 'RECONCILED', orders };
      }
      const body = { orderType: 'draft', orderReferenceId, customerReferenceId: quoted.input.customerReferenceId,
        currency: quoted.input.currency, shippingAddress: quoted.input.recipient, items: quoted.input.products, shipmentMethodUid };
      save('create-intent', orderReferenceId, creation);
      const value = await request('', { method: 'POST', body });
      const binding = bind(value, creation);
      if (value.orderType !== 'draft') fail('DRAFT_WAS_NOT_CREATED');
      return { outcome: 'DRAFT_CREATED', orders: [projection(value, binding)] };
    });
  }
  async function track({ orderId } = {}) {
    id(orderId); const initial = load('order', orderId);
    return lock(initial.orderReferenceId, async () => {
      const queued = [orderId], seen = new Set(), orders = [];
      while (queued.length) {
        const current = queued.shift(); if (seen.has(current)) continue;
        seen.add(current); if (seen.size > 50) fail('CONNECTED_ORDERS_LIMIT');
        const value = await request(`/${encodeURIComponent(current)}`);
        // The provider's response must identify the exact requested order.
        // bind() alone would self-bind an unrelated returned ID and later
        // allow cancellation of an order we never requested or adopted.
        if (value.id !== current) fail('ORDER_BINDING_MISMATCH');
        const binding = bind(value, initial, current !== orderId || initial.isConnected);
        orders.push(projection(value, binding));
        queued.push(...(value.connectedOrderIds ?? []));
      }
      const expected = load('quote', initial.quoteId).input.products;
      const itemCounts = new Map();
      for (const order of orders) for (const item of order.items) itemCounts.set(item.itemReferenceId, (itemCounts.get(item.itemReferenceId) ?? 0) + item.quantity);
      if (expected.some(item => itemCounts.get(item.itemReferenceId) !== item.quantity)) fail('CONNECTED_ITEMS_INCOMPLETE');
      return { orderReferenceId: initial.orderReferenceId, orders, delivered: orders.length > 0 && orders.every(order => order.delivered),
        deliveryEvidence: orders.length > 0 && orders.every(order => order.delivered) ? 'PROVIDER_REPORTED' : null };
    });
  }
  async function cancel(input) {
    exact(input, ['action', 'orderId']);
    if (input.action !== 'CANCEL_ORDER') fail('EXPLICIT_CANCEL_REQUIRED');
    const orderId = id(input.orderId), initial = load('order', orderId);
    return lock(initial.orderReferenceId, async () => {
      const { value, binding } = await rawRead(orderId);
      if (value.fulfillmentStatus === 'canceled') return { outcome: 'CANCELED', order: projection(value, binding), refundConfirmed: value.financialStatus === 'refunded' };
      if (exists('cancel-intent', orderId)) fail('CANCEL_OUTCOME_UNKNOWN');
      // Only this native order is targeted; other connected orders remain
      // visible to the caller and must not be declared canceled as a group.
      save('cancel-intent', orderId, { orderId, orderReferenceId: initial.orderReferenceId });
      await request(`/${encodeURIComponent(orderId)}:cancel`, { method: 'POST', empty: true });
      const updated = await rawRead(orderId);
      return { outcome: updated.value.fulfillmentStatus === 'canceled' ? 'CANCELED' : 'CANCEL_OUTCOME_UNKNOWN',
        order: projection(updated.value, updated.binding), refundConfirmed: updated.value.financialStatus === 'refunded' };
    });
  }
  async function confirm(input) {
    exact(input, ['action', 'orderId', 'quoteId']);
    if (input.action !== 'CONFIRM_PRODUCTION') fail('EXPLICIT_CONFIRM_REQUIRED');
    const binding = load('order', id(input.orderId));
    if (binding.quoteId !== id(input.quoteId)) fail('QUOTE_BINDING_MISMATCH');
    return { outcome: 'UNSUPPORTED', reason: 'PRICE_LOCK_NOT_SUPPORTED', orderId: input.orderId,
      quoteId: input.quoteId, productionSubmitted: false, providerMaximumAmountSupported: false };
  }
  function status() {
    let configured = false, reason = 'NOT_CONFIGURED';
    try { configuration(); configured = true; reason = null; } catch (error) { reason = error.code ?? 'GELATO_CONFIG_INVALID'; }
    return { provider: 'gelato', protocol: GELATO_ORDER_PROTOCOL, configured, reason, authenticatedAccessVerified: false,
      quoteSupported: true, draftSupported: true, readSupported: true, cancelSupported: true,
      productionEnabled: false, productionDisabledReason: 'PRICE_LOCK_NOT_SUPPORTED', accountMode: 'SELF_SERVICE_ACCOUNT_API_KEY' };
  }
  return Object.freeze({ status, quote, createDraft, read, reconcile, track, cancel, confirm });
}
