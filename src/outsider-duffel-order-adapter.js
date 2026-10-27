/* Native Duffel Flights v2. Official contracts checked 2026-09-09:
 * https://duffel.com/docs/api/v2/offers/price-offer
 * https://duffel.com/docs/api/v2/orders/create-order
 * https://duffel.com/docs/api/v2/payments
 * https://duffel.com/docs/api/v2/order-cancellations
 * https://duffel.com/docs/api/overview/response-handling
 * No booking is submitted by preparation. Execute requires the exact payment
 * template from the original confirmed program. Unknown writes are followed,
 * never recreated using an invented idempotency guarantee or a fresh offer.
 */
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { canonicalizeStrict } from './canonical.js';
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce, withUserHeldExecutionLockV2 }
  from './outsider-user-held-durable-execution-v2.js';

export const DUFFEL_ORDER_PLAN_SCHEMA = 'outsider/duffel-order-plan/v1';
export const DUFFEL_PAYMENT_AUTHORIZATION_SCHEMA = 'outsider/funded-network-payment-authorization/v1';
export const DUFFEL_CANCELLATION_AUTHORIZATION_SCHEMA = 'outsider/funded-network-cancellation-authorization/v1';
export const DUFFEL_ORDER_REQUEST_TIMEOUT_MS = 135000;
export const DUFFEL_SEARCH_SCHEMA = 'outsider/duffel-search/v1';
export const DUFFEL_SEARCH_LIMITS = Object.freeze({ pageSize: 50, maximumPages: 10, maximumOffers: 500,
  returnedOffers: 20, timeoutMs: 60000, supplierTimeoutMs: 10000 });
const API = 'https://api.duffel.com/air';
const HASH = /^sha256:[a-f0-9]{64}$/u, ID = /^[a-z]+_[A-Za-z0-9_-]{1,180}$/u;
const digest = value => `sha256:${createHash('sha256').update(canonicalizeStrict(value)).digest('hex')}`;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => canonicalizeStrict(a) === canonicalizeStrict(b);
const fail = (code, extra = {}) => { throw Object.assign(new Error(`DUFFEL_${code}`), { code: `DUFFEL_${code}`, ...extra }); };
const validHash = value => { if (typeof value !== 'string' || !HASH.test(value)) fail('HASH_INVALID'); return value; };
const nativeId = (value, prefix) => { if (typeof value !== 'string' || !ID.test(value) || !value.startsWith(`${prefix}_`)) fail('IDENTIFIER_INVALID'); return value; };
const exact = (value, keys, required = keys) => {
  if (!plain(value) || Object.keys(value).some(key => !keys.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail('INPUT_INVALID');
};
const string = (value, max = 200) => { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\0-\x1f\x7f]/u.test(value)) fail('INPUT_INVALID'); return value; };
const label = value => typeof value === 'string' ? value.replace(/[\0-\x1f\x7f]/gu, ' ').slice(0, 300) : null;
const instant = value => { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('TIME_INVALID'); return new Date(value).toISOString(); };
const date = value => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('DATE_INVALID'); return value; };
function minor(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,12})(?:\.\d{1,2})?$/u.test(value)) fail('AMOUNT_INVALID');
  const [major, fraction = ''] = value.split('.'); return (BigInt(major) * 100n + BigInt(fraction.padEnd(2, '0'))).toString();
}
const decimal = value => `${BigInt(value) / 100n}.${(BigInt(value) % 100n).toString().padStart(2, '0')}`;
function passengers(value) {
  if (!Array.isArray(value) || !value.length || value.length > 9) fail('PASSENGERS_INVALID');
  const keys = ['id', 'given_name', 'family_name', 'born_on', 'email', 'phone_number', 'title', 'gender', 'infant_passenger_id', 'identity_documents'];
  const result = value.map(row => {
    exact(row, keys, keys.slice(0, 8));
    const out = Object.fromEntries(keys.slice(0, 8).map(key => [key, string(row[key], key === 'email' ? 254 : 200)]));
    nativeId(out.id, 'pas'); date(out.born_on);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(out.email) || !/^\+[1-9]\d{6,14}$/u.test(out.phone_number)
      || !/^[a-z]{1,12}$/u.test(out.title) || !/^[a-z]{1,12}$/u.test(out.gender)) fail('PASSENGERS_INVALID');
    if (row.infant_passenger_id !== undefined) out.infant_passenger_id = nativeId(row.infant_passenger_id, 'pas');
    if (row.identity_documents !== undefined) {
      if (!Array.isArray(row.identity_documents) || row.identity_documents.length !== 1) fail('IDENTITY_DOCUMENT_INVALID');
      out.identity_documents = row.identity_documents.map(doc => {
        exact(doc, ['type', 'unique_identifier', 'issuing_country_code', 'expires_on']);
        if (doc.type !== 'passport' || !/^[A-Z]{2}$/u.test(doc.issuing_country_code ?? '')) fail('IDENTITY_DOCUMENT_INVALID');
        return { type: 'passport', unique_identifier: string(doc.unique_identifier, 100), issuing_country_code: doc.issuing_country_code, expires_on: date(doc.expires_on) };
      });
    }
    return out;
  }).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(result.map(row => row.id)).size !== result.length || result.some(row => row.infant_passenger_id
    && (row.infant_passenger_id === row.id || !result.some(other => other.id === row.infant_passenger_id)))) fail('PASSENGERS_INVALID');
  return result;
}
function itinerary(value) {
  if (!Array.isArray(value) || !value.length || value.length > 6) fail('ITINERARY_INVALID');
  const airport = value => { if (!plain(value) || !/^[A-Z]{3}$/u.test(value.iata_code ?? '')) fail('ITINERARY_INVALID'); return value.iata_code; };
  return value.map(slice => {
    if (!plain(slice) || !Array.isArray(slice.segments) || !slice.segments.length || slice.segments.length > 6) fail('ITINERARY_INVALID');
    return { origin: airport(slice.origin), destination: airport(slice.destination), segments: slice.segments.map(segment => {
      if (!plain(segment) || typeof segment.departing_at !== 'string' || typeof segment.arriving_at !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T/u.test(segment.departing_at) || !/^\d{4}-\d{2}-\d{2}T/u.test(segment.arriving_at)
        || !Number.isFinite(Date.parse(segment.departing_at)) || !Number.isFinite(Date.parse(segment.arriving_at))) fail('ITINERARY_INVALID');
      return { origin: airport(segment.origin), destination: airport(segment.destination),
        departingAt: segment.departing_at, arrivingAt: segment.arriving_at,
        originTimeZone: label(segment.origin.time_zone), destinationTimeZone: label(segment.destination.time_zone),
        operatingCarrier: label(segment.operating_carrier?.name), operatingFlightNumber: label(segment.operating_carrier_flight_number),
        marketingCarrier: label(segment.marketing_carrier?.name), marketingFlightNumber: label(segment.marketing_carrier_flight_number) };
    }) };
  });
}
function conditions(value) {
  if (!plain(value)) fail('OFFER_CONDITIONS_INVALID');
  return Object.fromEntries(['refund_before_departure', 'change_before_departure'].map(key => {
    const row = value[key];
    if (row === null || row === undefined) return [key, null];
    if (!plain(row) || typeof row.allowed !== 'boolean') fail('OFFER_CONDITIONS_INVALID');
    return [key, { allowed: row.allowed, penaltyAmountMinor: row.penalty_amount === null || row.penalty_amount === undefined ? null : minor(row.penalty_amount),
      penaltyCurrency: row.penalty_currency === null || row.penalty_currency === undefined ? null : string(row.penalty_currency, 3) }];
  }));
}
function normalizeSearch(value, now) {
  exact(value, ['slices', 'passengers', 'cabinClass', 'maximumConnections', 'maximumAmountMinor', 'currency']);
  if (!Array.isArray(value.slices) || !value.slices.length || value.slices.length > 6
    || !Array.isArray(value.passengers) || !value.passengers.length || value.passengers.length > 9
    || !['economy', 'premium_economy', 'business', 'first'].includes(value.cabinClass)
    || ![0, 1, 2].includes(value.maximumConnections) || value.currency !== 'USD'
    || typeof value.maximumAmountMinor !== 'string' || !/^[1-9]\d{0,14}$/u.test(value.maximumAmountMinor)) fail('SEARCH_INPUT_INVALID');
  const slices = value.slices.map(row => {
    exact(row, ['origin', 'destination', 'departureDate']);
    if (!/^[A-Z]{3}$/u.test(row.origin ?? '') || !/^[A-Z]{3}$/u.test(row.destination ?? '') || row.origin === row.destination)
      fail('SEARCH_INPUT_INVALID');
    const departureDate = date(row.departureDate);
    if (departureDate < now.slice(0, 10)) fail('SEARCH_DATE_PAST');
    return { origin: row.origin, destination: row.destination, departureDate };
  });
  if (slices.some((row, index) => index && row.departureDate < slices[index - 1].departureDate)) fail('SEARCH_DATE_ORDER_INVALID');
  const adults = value.passengers.map(row => { exact(row, ['type']); if (row.type !== 'adult') fail('SEARCH_ADULTS_ONLY'); return { type: 'adult' }; });
  return { slices, passengers: adults, cabinClass: value.cabinClass, maximumConnections: value.maximumConnections,
    maximumAmountMinor: value.maximumAmountMinor, currency: 'USD' };
}
const itinerarySummary = value => value.flatMap(slice => slice.segments.map(segment => `${segment.origin}–${segment.destination} ${segment.departingAt}`
  + (segment.operatingCarrier ? ` · ${segment.operatingCarrier}` : '')
  + (segment.operatingFlightNumber ? ` ${segment.operatingFlightNumber}` : ''))).join('; ');

export function createDuffelOrderAdapter({ nodeDirectory, directory, fetchImpl = globalThis.fetch,
  clock = () => new Date().toISOString() } = {}) {
  if (!path.isAbsolute(nodeDirectory ?? '') || typeof fetchImpl !== 'function' || typeof clock !== 'function') fail('CONFIG_INVALID');
  const root = directory ?? path.join(nodeDirectory, 'duffel-orders');
  if (!path.isAbsolute(root)) fail('CONFIG_INVALID');
  const configFile = path.join(nodeDirectory, 'connections', 'duffel.json'); let pinnedConnection;
  const now = () => instant(clock());
  function config() {
    let value, key;
    if (!existsSync(configFile)) fail('NOT_CONFIGURED');
    try { value = JSON.parse(readPrivateExecutionBytes(configFile)); } catch { fail('CONFIG_INVALID'); }
    exact(value, ['schema', 'apiKeyFile', 'environment', 'accountLabel', 'billingPolicy'], ['schema', 'apiKeyFile']);
    if (value.schema !== 'outsider/duffel-connection/v1' || !path.isAbsolute(value.apiKeyFile ?? '')) fail('CONFIG_INVALID');
    const environment = value.environment ?? 'test'; if (!['test', 'production'].includes(environment)) fail('ENVIRONMENT_INVALID');
    try { key = readPrivateExecutionBytes(value.apiKeyFile).toString('utf8').trim(); } catch { fail('KEY_FILE_INVALID'); }
    if (!/^duffel_(test|live)_[A-Za-z0-9_-]{8,4096}$/u.test(key)) fail('KEY_INVALID');
    if (key.startsWith('duffel_live_') !== (environment === 'production')) fail('ENVIRONMENT_KEY_MISMATCH');
    if (value.billingPolicy !== undefined) {
      exact(value.billingPolicy, ['platformFeesAuthorized', 'customerChargePolicy']);
      if (typeof value.billingPolicy.platformFeesAuthorized !== 'boolean'
        || value.billingPolicy.customerChargePolicy !== 'PLATFORM_ABSORBS_NETWORK_FEES') fail('BILLING_POLICY_INVALID');
    }
    const connectionHash = digest({ provider: 'duffel', credentialHash: digest(key), environment });
    if (pinnedConnection && pinnedConnection !== connectionHash) fail('ACCOUNT_BINDING_CHANGED');
    pinnedConnection = connectionHash;
    return { key, connectionHash, fundingSourceHash: digest({ connectionHash, method: 'balance' }), environment,
      liveMode: environment === 'production', accountLabel: string(value.accountLabel ?? 'Duffel balance', 100),
      separatePlatformFeesAuthorized: value.billingPolicy?.platformFeesAuthorized === true,
      customerChargePolicy: value.billingPolicy?.customerChargePolicy ?? 'TEST_MODE_NO_REAL_CHARGES' };
  }
  function assertBilling(c) {
    if (c.liveMode && (!c.separatePlatformFeesAuthorized || c.customerChargePolicy !== 'PLATFORM_ABSORBS_NETWORK_FEES')) fail('PLATFORM_FEES_POLICY_REQUIRED');
  }
  function ensureRoot() {
    mkdirSync(root, { recursive: true, mode: 0o700 }); const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) fail('DIRECTORY_NOT_PRIVATE');
  }
  const file = (kind, key) => path.join(root, `${kind}-${digest(key).slice(7)}.json`);
  const exists = (kind, key) => existsSync(file(kind, key));
  function save(kind, key, body) {
    ensureRoot(); const record = { connectionHash: config().connectionHash, body };
    if (Buffer.byteLength(`${canonicalizeStrict(record)}\n`) > 1024 * 1024) fail('LOCAL_RECORD_TOO_LARGE');
    writePrivateExecutionRecordOnce(file(kind, key), record);
  }
  function load(kind, key) {
    ensureRoot(); let value;
    try { value = JSON.parse(readPrivateExecutionBytes(file(kind, key))); } catch { fail('LOCAL_RECORD_NOT_FOUND'); }
    if (value.connectionHash !== config().connectionHash) fail('ACCOUNT_BINDING_CHANGED'); return value.body;
  }
  function plan(hash) {
    validHash(hash); const body = load('plan', hash); if (digest(body) !== hash) fail('PLAN_CHANGED'); return { ...body, planHash: hash };
  }
  const lock = (p, fn) => withUserHeldExecutionLockV2(digest({ root, connectionHash: p.connectionHash, offerId: p.offerId }), fn);
  async function request(suffix, { method = 'GET', data, mutation = false, timeoutMs } = {}) {
    const c = config(); let response;
    try { response = await fetchImpl(`${API}${suffix}`, { method, redirect: 'error',
      headers: { Authorization: `Bearer ${c.key}`, 'Duffel-Version': 'v2', Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs ?? (mutation ? DUFFEL_ORDER_REQUEST_TIMEOUT_MS : 30000)),
      ...(data === undefined ? {} : { body: JSON.stringify({ data }) }) }); }
    catch { fail('TRANSPORT_FAILED'); }
    if (response.redirected || response.status >= 300 && response.status < 400) fail('REDIRECT_REJECTED');
    const chunks = []; let size = 0;
    if (Number(response.headers?.get?.('content-length') ?? 0) > 2 * 1024 * 1024) fail('RESPONSE_TOO_LARGE');
    try {
      if (response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
        for await (const chunk of response.body) { size += chunk.byteLength; if (size > 2 * 1024 * 1024) fail('RESPONSE_TOO_LARGE'); chunks.push(Buffer.from(chunk)); }
      } else { const bytes = Buffer.from(await response.arrayBuffer()); size = bytes.length; chunks.push(bytes); }
    } catch (error) { if (error.code === 'DUFFEL_RESPONSE_TOO_LARGE') throw error; fail('RESPONSE_READ_FAILED'); }
    if (size > 2 * 1024 * 1024) fail('RESPONSE_TOO_LARGE');
    let body; try { body = JSON.parse(Buffer.concat(chunks)); } catch { fail('RESPONSE_INVALID'); }
    if (!plain(body)) fail('RESPONSE_INVALID');
    if (config().connectionHash !== c.connectionHash) fail('ACCOUNT_BINDING_CHANGED');
    if (response.status < 200 || response.status >= 300) {
      const codes = Array.isArray(body.errors) ? body.errors.map(row => row?.code) : [];
      const allowed = ['price_changed', 'offer_expired', 'offer_no_longer_available', 'high_fraud_risk', 'order_creation_already_attempted',
        'offer_request_already_booked', 'insufficient_balance', 'order_not_cancellable', 'already_cancelled'];
      const safeCode = allowed.find(code => codes.includes(code));
      fail(safeCode ? safeCode.toUpperCase() : response.status === 401 || response.status === 403 ? 'AUTHORIZATION_FAILED'
        : response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_REQUEST_FAILED', { httpStatus: response.status,
        definitelyRejected: response.status >= 400 && response.status < 500 || response.status === 503 });
    }
    return { status: response.status, data: body.data, meta: plain(body.meta) ? body.meta : {} };
  }
  function searchCandidate(value, input, connection, passengerIds) {
    if (!plain(value) || value.live_mode !== connection.liveMode || value.partial !== false || value.total_currency !== 'USD'
      || !Array.isArray(value.passengers) || value.passengers.some(row => row?.type !== 'adult')) fail('SEARCH_OFFER_UNSUPPORTED');
    const offerId = nativeId(value.id, 'off'), ids = value.passengers.map(row => nativeId(row.id, 'pas')).sort();
    if (!same(ids, passengerIds)) fail('SEARCH_PASSENGERS_MISMATCH');
    const estimatedTotalAmountMinor = minor(value.total_amount), expiresAt = instant(value.expires_at);
    if (estimatedTotalAmountMinor === '0' || BigInt(estimatedTotalAmountMinor) > BigInt(input.maximumAmountMinor)) fail('SEARCH_BUDGET_MISMATCH');
    if (Date.parse(expiresAt) <= Date.parse(now())) fail('OFFER_EXPIRED');
    const route = itinerary(value.slices);
    if (route.length !== input.slices.length) fail('SEARCH_ITINERARY_MISMATCH');
    for (let index = 0; index < route.length; index++) {
      const slice = route[index], wanted = input.slices[index];
      if (slice.origin !== wanted.origin || slice.destination !== wanted.destination
        || slice.segments[0].origin !== wanted.origin || slice.segments.at(-1).destination !== wanted.destination
        || slice.segments[0].departingAt.slice(0, 10) !== wanted.departureDate
        || slice.segments.length - 1 > input.maximumConnections
        || slice.segments.some((segment, n) => n && segment.origin !== slice.segments[n - 1].destination)) fail('SEARCH_ITINERARY_MISMATCH');
      for (const segment of value.slices[index].segments) {
        if (!Array.isArray(segment.passengers) || !same(segment.passengers.map(row => nativeId(row?.passenger_id, 'pas')).sort(), ids)
          || segment.passengers.some(row => row.cabin_class !== input.cabinClass)
          || !label(segment.operating_carrier?.name)) fail('SEARCH_CABIN_OR_CARRIER_UNVERIFIED');
      }
    }
    return { offerId, summary: itinerarySummary(route), itinerary: route, estimatedTotalAmountMinor, currency: 'USD', expiresAt,
      passengerIds: ids, conditions: conditions(value.conditions), cabinClass: input.cabinClass,
      identityDocumentsRequired: value.passenger_identity_documents_required === true,
      priceLocked: false, finalPriceConfirmed: false, paymentMethodFeesKnown: false, operatorNetworkFeesIncluded: false };
  }
  const publicSearch = body => {
    const { privateNonce, ...publicBody } = body; return { ...publicBody, searchHash: digest(body) };
  };
  function readSearch(searchHash) {
    validHash(searchHash); const body = load('search', searchHash);
    if (body.schema !== DUFFEL_SEARCH_SCHEMA || digest(body) !== searchHash) fail('SEARCH_CHANGED');
    return publicSearch(body);
  }
  async function search(input) {
    // Creating a search is not booking. The documented list endpoint is scoped
    // to this offer request; account-wide request/history enumeration is unused.
    // https://duffel.com/docs/api/v2/offer-requests
    // https://duffel.com/docs/api/v2/offers#get-offers
    const normalized = normalizeSearch(input, now()), c = config(); assertBilling(c);
    const createdAt = now(), requestHash = digest(normalized), deadline = Date.now() + DUFFEL_SEARCH_LIMITS.timeoutMs;
    const remaining = () => Math.max(1, Math.min(30000, deadline - Date.now()));
    const offered = (await request(`/offer_requests?return_offers=false&supplier_timeout=${DUFFEL_SEARCH_LIMITS.supplierTimeoutMs}`, {
      method: 'POST', timeoutMs: remaining(), data: { slices: normalized.slices.map(row => ({ origin: row.origin,
        destination: row.destination, departure_date: row.departureDate })), passengers: normalized.passengers,
      cabin_class: normalized.cabinClass, max_connections: normalized.maximumConnections } })).data;
    if (!plain(offered) || offered.live_mode !== c.liveMode || !Array.isArray(offered.passengers)
      || offered.passengers.length !== normalized.passengers.length || offered.passengers.some(row => row?.type !== 'adult'))
      fail('SEARCH_REQUEST_BINDING_INVALID');
    const offerRequestId = nativeId(offered.id, 'orq'), passengerIds = offered.passengers.map(row => nativeId(row.id, 'pas')).sort();
    if (new Set(passengerIds).size !== passengerIds.length) fail('SEARCH_REQUEST_BINDING_INVALID');
    let cursor = null, pagesRead = 0, observedOfferCount = 0, paginationComplete = false, incompleteReason = null;
    const cursors = new Set(), candidates = new Map(), seenOffers = new Map(), rejectedOffers = {};
    while (pagesRead < DUFFEL_SEARCH_LIMITS.maximumPages && observedOfferCount < DUFFEL_SEARCH_LIMITS.maximumOffers) {
      if (Date.now() >= deadline) { incompleteReason = 'SEARCH_TIME_LIMIT'; break; }
      const query = new URLSearchParams({ offer_request_id: offerRequestId, sort: 'total_amount',
        max_connections: String(normalized.maximumConnections), limit: String(DUFFEL_SEARCH_LIMITS.pageSize), ...(cursor ? { after: cursor } : {}) });
      let page;
      try { page = await request(`/offers?${query}`, { timeoutMs: remaining() }); }
      catch (error) {
        if (['DUFFEL_ACCOUNT_BINDING_CHANGED', 'DUFFEL_AUTHORIZATION_FAILED', 'DUFFEL_NOT_CONFIGURED'].includes(error.code)) throw error;
        incompleteReason = 'PROVIDER_PAGE_UNAVAILABLE'; break;
      }
      if (!Array.isArray(page.data) || page.data.length > DUFFEL_SEARCH_LIMITS.pageSize
        || page.meta.after !== undefined && page.meta.after !== null && (typeof page.meta.after !== 'string'
          || !page.meta.after.length || page.meta.after.length > 2048)) { incompleteReason = 'PROVIDER_PAGE_INVALID'; break; }
      pagesRead++; observedOfferCount += page.data.length;
      for (const source of page.data) {
        let candidate;
        try { candidate = searchCandidate(source, normalized, c, passengerIds); }
        catch (error) {
          if (plain(source) && typeof source.id === 'string' && seenOffers.has(source.id)) {
            candidates.delete(source.id); seenOffers.set(source.id, null);
          }
          const reason = ['DUFFEL_OFFER_EXPIRED', 'DUFFEL_SEARCH_BUDGET_MISMATCH', 'DUFFEL_SEARCH_PASSENGERS_MISMATCH',
            'DUFFEL_SEARCH_ITINERARY_MISMATCH', 'DUFFEL_SEARCH_CABIN_OR_CARRIER_UNVERIFIED'].includes(error.code) ? error.code : 'DUFFEL_SEARCH_OFFER_UNSUPPORTED';
          rejectedOffers[reason] = (rejectedOffers[reason] ?? 0) + 1; continue;
        }
        const offerHash = digest({ requestHash, connectionHash: c.connectionHash, offerRequestId, candidate });
        if (seenOffers.has(candidate.offerId) && seenOffers.get(candidate.offerId) !== offerHash) {
          candidates.delete(candidate.offerId); seenOffers.set(candidate.offerId, null); rejectedOffers.DUFFEL_SEARCH_OFFER_CHANGED = (rejectedOffers.DUFFEL_SEARCH_OFFER_CHANGED ?? 0) + 1;
          continue;
        }
        seenOffers.set(candidate.offerId, offerHash); candidates.set(candidate.offerId, { ...candidate, offerHash });
      }
      const next = page.meta.after;
      if (next === undefined || next === null) { paginationComplete = true; break; }
      if (cursors.has(next)) { incompleteReason = 'PROVIDER_CURSOR_REPEATED'; break; }
      cursors.add(next); cursor = next;
    }
    if (!paginationComplete && !incompleteReason) incompleteReason = 'SEARCH_PAGE_LIMIT';
    if (config().connectionHash !== c.connectionHash) fail('ACCOUNT_BINDING_CHANGED');
    const eligible = [...candidates.values()].filter(row => Date.parse(row.expiresAt) > Date.parse(now()))
      .sort((a, b) => BigInt(a.estimatedTotalAmountMinor) < BigInt(b.estimatedTotalAmountMinor) ? -1
        : BigInt(a.estimatedTotalAmountMinor) > BigInt(b.estimatedTotalAmountMinor) ? 1 : a.offerId.localeCompare(b.offerId));
    const body = { schema: DUFFEL_SEARCH_SCHEMA, networkId: 'duffel', connectionHash: c.connectionHash, environment: c.environment, accountLabel: c.accountLabel,
      liveMode: c.liveMode, createdAt, completedAt: now(), requestHash, request: normalized, offerRequestId,
      offers: eligible.slice(0, DUFFEL_SEARCH_LIMITS.returnedOffers), candidateCount: eligible.length, observedOfferCount, pagesRead,
      paginationComplete, incompleteReason, offersTruncated: eligible.length > DUFFEL_SEARCH_LIMITS.returnedOffers,
      comparisonScope: paginationComplete ? 'RETURNED_NETWORK_SEARCH_OFFERS' : 'OBSERVED_OFFERS_ONLY',
      reason: eligible.length ? null : paginationComplete ? 'NO_MATCHING_OFFERS' : 'SEARCH_INCOMPLETE_NO_MATCHING_OFFERS',
      rejectedOffers, supplierTimeoutMs: DUFFEL_SEARCH_LIMITS.supplierTimeoutMs, allAirlinesResponded: false,
      priceLocked: false, finalPriceConfirmed: false, bookingCreated: false, paymentPerformed: false,
      operatorNetworkFeesIncluded: false, paymentMethodFeesKnown: false, privateNonce: randomBytes(32).toString('hex') };
    const searchHash = digest(body); save('search', searchHash, body); return publicSearch(body);
  }
  function offerTerms(value, input, c) {
    if (!plain(value) || value.id !== input.offerId || value.live_mode !== c.liveMode || value.partial === true
      || value.total_currency !== 'USD' || !Array.isArray(value.passengers)) fail('OFFER_BINDING_INVALID');
    const ids = value.passengers.map(row => nativeId(row?.id, 'pas')).sort();
    if (!same(ids, input.passengers.map(row => row.id))) fail('OFFER_PASSENGERS_MISMATCH');
    if (input.searchHash) {
      const found = readSearch(input.searchHash), selected = found.offers.find(row => row.offerHash === input.offerHash);
      if (!selected || selected.offerId !== input.offerId) fail('SEARCH_SELECTION_NOT_FOUND');
      const fresh = searchCandidate(value, found.request, c, selected.passengerIds);
      if (!same(fresh.itinerary, selected.itinerary)) fail('SEARCH_SELECTED_ITINERARY_CHANGED');
    }
    if (value.passenger_identity_documents_required === true && input.passengers.some(row => !row.identity_documents?.length)) fail('IDENTITY_DOCUMENT_REQUIRED');
    const methods = value.intended_payment_methods;
    if (!Array.isArray(methods) || methods.length !== 1 || methods[0]?.type !== 'balance'
      || !Array.isArray(value.intended_services) || value.intended_services.length) fail('PAYMENT_PRICING_UNVERIFIED');
    const orderTotal = minor(value.total_amount), method = methods[0];
    let extra = 0n; const paymentFees = {};
    for (const key of ['surcharge', 'penalty']) {
      const amountKey = `${key}_amount`, currencyKey = `${key}_currency`;
      if (method[amountKey] !== undefined) {
        if (method[currencyKey] !== 'USD') fail('PAYMENT_PRICING_UNVERIFIED');
        paymentFees[`${key}AmountMinor`] = minor(method[amountKey]); extra += BigInt(paymentFees[`${key}AmountMinor`]);
      } else paymentFees[`${key}AmountMinor`] = '0';
    }
    const payable = (BigInt(orderTotal) + extra).toString();
    if (method.charge_amount !== undefined && (method.charge_currency !== 'USD' || minor(method.charge_amount) !== payable)) fail('PAYMENT_PRICING_UNVERIFIED');
    if (payable === '0') fail('POSITIVE_PURCHASE_REQUIRED');
    const expiresAt = instant(value.expires_at);
    if (Date.parse(expiresAt) <= Date.parse(now())) fail('OFFER_EXPIRED');
    return { offerId: input.offerId, currency: 'USD', totalAmountMinor: payable, providerOrderTotalAmountMinor: orderTotal,
      expiresAt, itinerary: itinerary(value.slices), conditions: conditions(value.conditions), passengerIds: ids, paymentFees };
  }
  const feeAccounting = p => ({ chargeScope: 'PROVIDER_ORDER_TOTAL', operatorNetworkFeesIncluded: false,
    operatorNetworkFeesAmountMinor: null, operatorNetworkFeesKnown: false, separatePlatformFeesAuthorized: p.separatePlatformFeesAuthorized,
    customerChargePolicy: p.customerChargePolicy, customerMaximumAmountMinor: p.totalAmountMinor,
    paymentMethodSurchargeAmountMinor: p.paymentFees.surchargeAmountMinor, paymentMethodPenaltyAmountMinor: p.paymentFees.penaltyAmountMinor,
    providerOrderTotalAmountMinor: p.providerOrderTotalAmountMinor, customerCollectionPerformed: false });
  function authorization(p) {
    return { schema: DUFFEL_PAYMENT_AUTHORIZATION_SCHEMA, planHash: p.planHash, connectionHash: p.connectionHash,
      fundingSourceHash: p.fundingSourceHash, environment: p.environment, chargeScope: 'PROVIDER_ORDER_TOTAL', currency: 'USD',
      maximumAmountMinor: p.totalAmountMinor, paymentMethod: 'balance', debitAuthorized: true,
      separatePlatformFeesAuthorized: p.separatePlatformFeesAuthorized };
  }
  function publicPlan(p) {
    const keys = ['planHash', 'quoteHash', 'connectionHash', 'fundingSourceHash', 'offerId', 'totalAmountMinor', 'providerOrderTotalAmountMinor',
      'currency', 'expiresAt', 'preparedAt', 'environment', 'liveMode', 'accountLabel', 'separatePlatformFeesAuthorized', 'customerChargePolicy', 'itinerary', 'conditions'];
    return { schema: DUFFEL_ORDER_PLAN_SCHEMA, networkId: 'duffel', ...Object.fromEntries(keys.map(key => [key, p[key]])),
      ...(p.searchHash ? { searchHash: p.searchHash, offerHash: p.offerHash } : {}),
      summary: itinerarySummary(p.itinerary),
      passengerCount: p.passengers.length, paymentMethod: 'balance', chargeScope: 'PROVIDER_ORDER_TOTAL', providerFeesIncluded: false,
      platformFeesKnown: false, priceLocked: false, accountIdentityVerified: false, credentialBound: true,
      travelCompleted: false, feeAccounting: feeAccounting(p), authorization: authorization(p) };
  }
  async function prepare(input) {
    exact(input, ['offerId', 'passengers']); const normalized = { offerId: nativeId(input.offerId, 'off'), passengers: passengers(input.passengers) };
    const c = config(); assertBilling(c);
    const response = await request(`/offers/${normalized.offerId}/actions/price`, { method: 'POST',
      data: { intended_payment_methods: [{ type: 'balance' }], intended_services: [] } });
    const terms = offerTerms(response.data, normalized, c), quoteHash = digest(terms);
    const { key, ...connection } = c;
    const body = { schema: DUFFEL_ORDER_PLAN_SCHEMA, ...connection, ...terms, quoteHash, passengers: normalized.passengers,
      preparedAt: now(), privateNonce: randomBytes(32).toString('hex') };
    const planHash = digest(body); save('plan', planHash, body); return publicPlan({ ...body, planHash });
  }
  async function prepareSelected(input) {
    exact(input, ['searchHash', 'offerHash', 'passengers']); validHash(input.offerHash);
    const found = readSearch(input.searchHash), selected = found.offers.find(row => row.offerHash === input.offerHash);
    if (!selected) fail('SEARCH_SELECTION_NOT_FOUND');
    if (Date.parse(selected.expiresAt) <= Date.parse(now())) fail('OFFER_EXPIRED');
    const people = passengers(input.passengers);
    if (!same(people.map(row => row.id), selected.passengerIds)) fail('SEARCH_PASSENGERS_MISMATCH');
    const c = config(); assertBilling(c);
    if (c.connectionHash !== found.connectionHash) fail('ACCOUNT_BINDING_CHANGED');
    const value = (await request(`/offers/${selected.offerId}/actions/price`, { method: 'POST',
      data: { intended_payment_methods: [{ type: 'balance' }], intended_services: [] } })).data;
    const fresh = searchCandidate(value, found.request, c, selected.passengerIds);
    if (fresh.offerId !== selected.offerId || !same(fresh.itinerary, selected.itinerary)) fail('SEARCH_SELECTED_ITINERARY_CHANGED');
    const terms = offerTerms(value, { offerId: selected.offerId, passengers: people }, c);
    if (BigInt(terms.totalAmountMinor) > BigInt(found.request.maximumAmountMinor)) fail('SEARCH_BUDGET_MISMATCH');
    if (config().connectionHash !== c.connectionHash) fail('ACCOUNT_BINDING_CHANGED');
    const { key, ...connection } = c;
    const body = { schema: DUFFEL_ORDER_PLAN_SCHEMA, ...connection, ...terms, quoteHash: digest(terms), passengers: people,
      searchHash: input.searchHash, offerHash: input.offerHash, preparedAt: now(), privateNonce: randomBytes(32).toString('hex') };
    const planHash = digest(body); save('plan', planHash, body); return publicPlan({ ...body, planHash });
  }
  function blank(p, state = 'NOT_SUBMITTED', reason = null) {
    return { state, planHash: p.planHash, orderId: null, orderRefHash: null, bookingConfirmed: false,
      paymentPerformed: p.liveMode && state === 'PENDING' ? null : false, chargedAmountMinor: null, currency: 'USD',
      environment: p.environment, liveMode: p.liveMode, providerReported: false, reason, observedAt: now(),
      testPaymentRecorded: false, travelCompleted: false, reconciliationRequired: state === 'PENDING', feeAccounting: feeAccounting(p) };
  }
  function snapshot(p, value) {
    const prefix = `snapshot-${p.planHash.slice(7)}-`; ensureRoot();
    const names = readdirSync(root).filter(name => name.startsWith(prefix) && /^\d{8}\.json$/u.test(name.slice(prefix.length))).sort();
    const count = names.length;
    if (count >= 100000) fail('OBSERVATION_LIMIT');
    let previous = null;
    if (names.length) {
      const saved = JSON.parse(readPrivateExecutionBytes(path.join(root, names.at(-1))));
      if (saved.connectionHash !== p.connectionHash) fail('ACCOUNT_BINDING_CHANGED');
      previous = saved.body;
    }
    // An empty or revised payment read must not erase money already observed
    // leaving this account. Only posted refund evidence could offset it; the
    // public cancellation API provides a refund record, not that transaction.
    let exposure = previous?.paymentExposure ?? null;
    for (const observation of [previous, value]) {
      const amount = p.liveMode ? observation?.chargedAmountMinor : observation?.testChargedAmountMinor;
      if (!observation || !HASH.test(observation.paymentReceiptHash ?? '')
        || (p.liveMode ? observation.paymentPerformed : observation.testPaymentRecorded) !== true
        || !/^(0|[1-9]\d*)$/u.test(amount ?? '')) continue;
      if (!exposure || BigInt(amount) > BigInt(exposure.grossDebitAmountMinor)) exposure = {
        schema: 'outsider/duffel-observed-payment-exposure/v1', planHash: p.planHash,
        connectionHash: p.connectionHash, fundingSourceHash: p.fundingSourceHash,
        environment: p.environment, currency: p.currency, grossDebitAmountMinor: amount,
        paymentReceiptHash: observation.paymentReceiptHash, observedAt: observation.observedAt ?? now(),
        source: 'AUTHENTICATED_PAYMENT_READBACK_HIGH_WATERMARK', customerRefundPerformed: false,
      };
    }
    if (exposure) value = { ...value, paymentExposure: exposure };
    const target = path.join(root, `${prefix}${String(count + 1).padStart(8, '0')}.json`);
    writePrivateExecutionRecordOnce(target, { connectionHash: config().connectionHash, body: value }); return value;
  }
  function localStatus({ planHash } = {}) {
    const p = plan(planHash), prefix = `snapshot-${p.planHash.slice(7)}-`;
    const latest = readdirSync(root).filter(name => name.startsWith(prefix) && /^\d{8}\.json$/u.test(name.slice(prefix.length))).sort().at(-1);
    if (latest) {
      const saved = JSON.parse(readPrivateExecutionBytes(path.join(root, latest)));
      if (saved.connectionHash !== config().connectionHash) fail('ACCOUNT_BINDING_CHANGED');
      return exists('order', planHash) ? { ...saved.body, ...load('order', planHash) } : saved.body;
    }
    return blank(p, exists('attempt', planHash) ? 'PENDING' : 'NOT_SUBMITTED', exists('attempt', planHash) ? 'CREATE_OUTCOME_UNKNOWN' : null);
  }
  function expectedMetadata(p, binding) {
    return { outsider_plan_hash: p.planHash, outsider_operation_id: binding.operationId, outsider_execution_hash: digest(binding) };
  }
  function bindOrder(value, p, binding, expectedId = null) {
    if (!plain(value)) fail('ORDER_BINDING_MISMATCH'); const orderId = nativeId(value.id, 'ord');
    if (expectedId && orderId !== expectedId || value.offer_id !== p.offerId || value.live_mode !== p.liveMode
      || !plain(value.metadata) || Object.entries(expectedMetadata(p, binding)).some(([key, expected]) => value.metadata[key] !== expected)) fail('ORDER_BINDING_MISMATCH');
    const record = { planHash: p.planHash, orderId, orderRefHash: digest({ connectionHash: p.connectionHash, orderId }) };
    save('order', p.planHash, record); return record;
  }
  async function list(suffix, params) {
    let after = null; const seenCursors = new Set(), seenIds = new Set(), rows = [];
    for (let page = 0; page < 20; page++) {
      const query = new URLSearchParams({ ...params, limit: '100', ...(after ? { after } : {}) });
      const result = await request(`${suffix}?${query}`);
      if (!Array.isArray(result.data) || result.data.length > 100) fail('LIST_RESPONSE_INVALID');
      for (const row of result.data) {
        if (!plain(row) || typeof row.id !== 'string' || seenIds.has(row.id)) fail('LIST_RESPONSE_INVALID');
        seenIds.add(row.id); rows.push(row);
      }
      const next = result.meta.after;
      if (next === null || next === undefined) return rows;
      if (typeof next !== 'string' || !next || next.length > 4096 || seenCursors.has(next)) fail('LIST_CURSOR_INVALID');
      seenCursors.add(next); after = next;
    }
    fail('LIST_LIMIT');
  }
  async function observedOrder(p, binding, value, expectedId) {
    const record = bindOrder(value, p, binding, expectedId);
    let result = { ...blank(p, 'PENDING'), ...record, providerReported: true, orderReceiptHash: digest(value),
      reason: 'AWAITING_PAYMENT_READBACK', providerSyncedAt: value.synced_at ? instant(value.synced_at) : null };
    // Preserve the original order's control even if external edits change its
    // terms; do not turn a changed order into a second purchase.
    if (value.total_currency !== 'USD' || minor(value.total_amount) !== p.providerOrderTotalAmountMinor
      || !same(itinerary(value.slices), p.itinerary) || value.type !== 'instant'
      || !Array.isArray(value.services) || value.services.length || !Array.isArray(value.passengers)
      || !same(value.passengers.map(row => row.id).sort(), p.passengers.map(row => row.id))
      || p.passengers.some(expected => {
        const actual = value.passengers.find(row => row.id === expected.id);
        return actual?.born_on !== expected.born_on || ['given_name', 'family_name'].some(key =>
          typeof actual?.[key] !== 'string' || actual[key].trim().toLocaleLowerCase('en-US') !== expected[key].trim().toLocaleLowerCase('en-US'));
      }))
      return snapshot(p, { ...result, reason: 'ORDER_TERMS_CHANGED', requiresReview: true });
    result.bookingConfirmed = value.payment_status?.awaiting_payment === false && typeof value.booking_reference === 'string' && value.booking_reference.length > 0;
    const payments = await list('/payments', { order_id: record.orderId });
    if (payments.some(row => row.order_id !== record.orderId || row.live_mode !== p.liveMode || !['succeeded', 'failed', 'pending', 'cancelled'].includes(row.status))) fail('PAYMENT_BINDING_MISMATCH');
    const succeeded = payments.filter(row => row.status === 'succeeded');
    if (succeeded.length) {
      if (succeeded.some(row => row.type !== 'balance' || row.currency !== 'USD')) fail('PAYMENT_BINDING_MISMATCH');
      const charged = succeeded.reduce((sum, row) => sum + BigInt(minor(row.amount)), 0n).toString();
      result = { ...result, paymentPerformed: p.liveMode, testPaymentRecorded: !p.liveMode, chargedAmountMinor: p.liveMode ? charged : null,
        testChargedAmountMinor: !p.liveMode ? charged : null, paymentReceiptHash: digest(succeeded) };
      if (charged !== p.totalAmountMinor || succeeded.length !== 1) return snapshot(p, { ...result, reason: 'PAYMENT_AMOUNT_MISMATCH', requiresReview: true });
      if (result.bookingConfirmed) result = { ...result, state: 'BOOKED', reason: null, reconciliationRequired: false };
    }
    if (value.cancelled_at) result = { ...result, state: 'CANCELLED', bookingConfirmed: false, cancelledAt: instant(value.cancelled_at),
      reason: null, reconciliationRequired: false };
    return snapshot(p, result);
  }
  async function readInternal(p) {
    if (!exists('attempt', p.planHash)) return localStatus({ planHash: p.planHash });
    const binding = load('execution', p.planHash);
    if (exists('rejected', p.planHash)) return localStatus({ planHash: p.planHash });
    let value, expectedId;
    if (exists('order', p.planHash)) {
      expectedId = load('order', p.planHash).orderId;
      value = (await request(`/orders/${expectedId}`)).data;
    } else {
      const orders = await list('/orders', { offer_id: p.offerId });
      const matches = orders.filter(row => row.offer_id === p.offerId && plain(row.metadata)
        && Object.entries(expectedMetadata(p, binding)).every(([key, expected]) => row.metadata[key] === expected));
      if (matches.length > 1) fail('DUPLICATE_PROVIDER_ORDERS');
      if (!matches.length) return snapshot(p, { ...blank(p, 'PENDING', 'CREATE_OUTCOME_UNKNOWN'), providerReported: true });
      expectedId = nativeId(matches[0].id, 'ord'); value = (await request(`/orders/${expectedId}`)).data;
    }
    const previous=localStatus({planHash:p.planHash}),current=await observedOrder(p, binding, value, expectedId);
    const cp=latestCancellationPlan(p);
    if(!cp)return current;
    if(!exists('cancel-attempt',cp.cancellationPlanHash)&&current.state!=='CANCELLED')return current;
    try{
      const terms=cancellationTerms((await request(`/order_cancellations/${cp.cancellationId}`)).data,p,cp.orderId,cp.cancellationId);
      return snapshot(p,cancellationResult(p,current,terms,cp));
    }catch{
      return snapshot(p,{...current,cancellationPending:current.state!=='CANCELLED',refundObservationCurrent:false,
        reason:'CANCELLATION_READBACK_UNAVAILABLE',
        ...(previous.orderId===current.orderId&&previous.refund?{refund:{...previous.refund,observationCurrent:false}}:{})});
    }
  }
  async function read({ planHash } = {}) { const p = plan(planHash); return lock(p, () => readInternal(p)); }
  async function execute(input) {
    exact(input, ['planHash', 'programHash', 'requirementId', 'operationId', 'authorization', 'resumeOnly'],
      ['planHash', 'programHash', 'requirementId', 'operationId', 'authorization']);
    const p = plan(input.planHash); validHash(input.programHash); string(input.requirementId, 128); string(input.operationId, 256);
    if (input.resumeOnly !== undefined && typeof input.resumeOnly !== 'boolean') fail('INPUT_INVALID');
    if (!same(input.authorization, authorization(p))) fail('PAYMENT_AUTHORIZATION_REQUIRED');
    const binding = { planHash: p.planHash, programHash: input.programHash, requirementId: input.requirementId,
      operationId: input.operationId, authorizationHash: digest(input.authorization), connectionHash: p.connectionHash };
    return lock(p, async () => {
      if (exists('execution', p.planHash) && !same(load('execution', p.planHash), binding)) fail('EXECUTION_BINDING_CHANGED');
      if (exists('attempt', p.planHash)) return readInternal(p);
      if (input.resumeOnly) return localStatus({ planHash: p.planHash });
      const c = config(); assertBilling(c);
      if (c.separatePlatformFeesAuthorized !== p.separatePlatformFeesAuthorized || c.customerChargePolicy !== p.customerChargePolicy) fail('BILLING_POLICY_CHANGED');
      if (exists('offer-binding', p.offerId) && !same(load('offer-binding', p.offerId), binding)) fail('OFFER_ALREADY_BOUND');
      try {
        if (Date.parse(now()) >= Date.parse(p.expiresAt)) fail('OFFER_EXPIRED');
        const current = (await request(`/offers/${p.offerId}/actions/price`, { method: 'POST',
          data: { intended_payment_methods: [{ type: 'balance' }], intended_services: [] } })).data;
        const terms = offerTerms(current, p, c);
        // A refreshed provider expiry cannot extend the confirmed plan. The
        // original deadline still applies; compare all actual purchase terms.
        if (digest({ ...terms, expiresAt: p.expiresAt }) !== p.quoteHash) fail('QUOTE_CHANGED');
      } catch (error) {
        return snapshot(p, { ...blank(p, 'REJECTED', error.code ?? 'DUFFEL_PREFLIGHT_UNAVAILABLE'), effectNotDispatched: true });
      }
      save('offer-binding', p.offerId, binding); save('execution', p.planHash, binding);
      save('attempt', p.planHash, { operationId: input.operationId, requestedAt: now(), quoteHash: p.quoteHash });
      snapshot(p, blank(p, 'PENDING', 'CREATE_OUTCOME_UNKNOWN'));
      let response;
      try {
        response = await request('/orders', { method: 'POST', mutation: true, data: { type: 'instant', selected_offers: [p.offerId],
          payments: [{ type: 'balance', currency: 'USD', amount: decimal(p.totalAmountMinor) }], services: [], passengers: p.passengers,
          metadata: expectedMetadata(p, binding) } });
      } catch (error) {
        if (error.definitelyRejected) {
          save('rejected', p.planHash, { reason: error.code });
          return snapshot(p, { ...blank(p, 'REJECTED', error.code), providerReported: true, effectNotDispatched: true });
        }
        return snapshot(p, blank(p, 'PENDING', error.code ?? 'DUFFEL_CREATE_OUTCOME_UNKNOWN'));
      }
      if (response.status !== 201 || !plain(response.data) || !response.data.id)
        return snapshot(p, blank(p, 'PENDING', 'CREATE_OUTCOME_UNKNOWN'));
      return observedOrder(p, binding, response.data);
    });
  }
  function cancellationTerms(value, p, orderId, expectedId = null) {
    if (!plain(value) || value.order_id !== orderId || value.live_mode !== p.liveMode) fail('CANCELLATION_BINDING_MISMATCH');
    const cancellationId = nativeId(value.id, 'ore');
    if (expectedId && cancellationId !== expectedId) fail('CANCELLATION_BINDING_MISMATCH');
    return { cancellationId, orderId, refundAmountMinor: value.refund_amount === null ? null : minor(value.refund_amount),
      refundCurrency: value.refund_currency === null ? null : string(value.refund_currency, 3), refundTo: label(value.refund_to),
      expiresAt: value.expires_at === null ? null : instant(value.expires_at),
      confirmedAt: value.confirmed_at === null ? null : instant(value.confirmed_at), createdAt: instant(value.created_at),
      airlineCreditsPresent: Array.isArray(value.airline_credits) && value.airline_credits.length > 0 };
  }
  function cancellationPublic(p, cp) {
    const confirmable = cp.refundAmountMinor !== null && cp.refundCurrency === 'USD' && cp.refundTo === 'balance' && !cp.airlineCreditsPresent;
    const authorization = confirmable ? { schema: DUFFEL_CANCELLATION_AUTHORIZATION_SCHEMA, planHash: p.planHash,
      cancellationPlanHash: cp.cancellationPlanHash, connectionHash: p.connectionHash, fundingSourceHash: p.fundingSourceHash,
      environment: p.environment, orderRefHash: digest({ connectionHash: p.connectionHash, orderId: cp.orderId }),
      refundAmountMinor: cp.refundAmountMinor, currency: 'USD', refundTo: 'balance', cancellationAuthorized: true } : null;
    return { ...cp, schema: 'outsider/duffel-cancellation-plan/v1', quoteVersion: cp.quoteVersion ?? 1,
      quoteExpired: cp.expiresAt !== null && Date.parse(cp.expiresAt) <= Date.parse(now()),
      confirmable, authorization, customerRefundPerformed: false,
      refundIsProviderQuote: true, platformFeeRefundKnown: false };
  }
  function latestCancellationPlan(p) {
    if (!exists('cancellation-plan-ref', p.planHash)) return null;
    let hash = load('cancellation-plan-ref', p.planHash).hash;
    const seen = new Set();
    for (;;) {
      if (seen.has(hash) || seen.size >= 1000) fail('CANCELLATION_HISTORY_INVALID');
      seen.add(hash);
      const cp = load('cancellation-plan', hash), { cancellationPlanHash, ...body } = cp;
      if (cancellationPlanHash !== hash || digest(body) !== hash || cp.planHash !== p.planHash) fail('CANCELLATION_PLAN_CHANGED');
      if (!exists('cancellation-plan-next', hash)) return cp;
      const next = load('cancellation-plan-next', hash);
      if (exists('cancel-attempt', hash)) fail('CANCELLATION_HISTORY_INVALID');
      hash = validHash(next.hash);
    }
  }
  function cancellationResult(p,current,terms,cp){
    const confirmed=terms.confirmedAt!==null&&current.state==='CANCELLED';
    const refundTermsMatched=['refundAmountMinor','refundCurrency','refundTo','airlineCreditsPresent'].every(key=>same(terms[key],cp[key]));
    const cashReconciliationState = !confirmed ? 'CANCELLATION_NOT_CONFIRMED'
      : !refundTermsMatched ? 'REFUND_TERMS_CHANGED'
      : terms.airlineCreditsPresent || terms.refundTo === 'airline_credits' ? 'AIRLINE_CREDIT_ONLY'
      : terms.refundAmountMinor === '0' ? 'NO_CASH_REFUND_DUE'
      : !p.liveMode ? 'TEST_REFUND_RECORDED'
      : terms.refundTo !== 'balance' || terms.refundAmountMinor === null ? 'BALANCE_REFUND_NOT_ESTABLISHED'
      : 'POSTED_BALANCE_EVIDENCE_REQUIRED';
    return {...current,cancellationPending:!confirmed,refundObservationCurrent:true,
      reason:!refundTermsMatched?'CANCELLATION_TERMS_CHANGED':confirmed?null:'CANCELLATION_OUTCOME_UNKNOWN',
      ...(!refundTermsMatched?{requiresReview:true}:{}),
      refund:{cancellationId:terms.cancellationId,confirmedAt:terms.confirmedAt,observedAt:now(),observationCurrent:true,
        refundAmountMinor:terms.refundAmountMinor,refundCurrency:terms.refundCurrency,refundTo:terms.refundTo,
        airlineCreditsPresent:terms.airlineCreditsPresent,
        refundConfirmed:confirmed&&refundTermsMatched&&p.liveMode&&terms.refundAmountMinor!==null&&BigInt(terms.refundAmountMinor)>0n,
        providerRefundRecorded:confirmed,testRefundRecorded:confirmed&&!p.liveMode,customerRefundPerformed:false,refundTermsMatched,
        // A cancellation receipt is the network's refund record, not evidence
        // of a credited bank/card balance or a refund to the customer.
        cashCreditVerified:false,spendableRefundMinor:'0',source:'PROVIDER_CONFIRMED_CANCELLATION',platformFeeRefundKnown:false,
        cashReconciliation:{state:cashReconciliationState,postedBalanceReadSupported:false,
          connectionHash:p.connectionHash,fundingSourceHash:p.fundingSourceHash,environment:p.environment,currency:p.currency,
          verifiedCreditAmountMinor:'0',platformFeesRefunded:false,customerRefundPerformed:false,
          nextEvidenceSource:'DUFFEL_AUTHENTICATED_BALANCE_STATEMENT',
          // Official public API/SDK checked 2026-09-12. Balance transactions
          // are documented as Dashboard CSV/PDF exports, not a public API.
          documentationUrl:'https://help.duffel.com/hc/en-gb/articles/360019693539-How-do-I-keep-track-of-my-Duffel-Balance-balance-and-transactions'}}};
  }
  async function quoteCancellation({ planHash } = {}) {
    const p = plan(planHash); return lock(p, async () => {
      const current = await readInternal(p);
      if (!current.orderId || !['BOOKED', 'CANCELLED'].includes(current.state)) fail('ORDER_NOT_CONFIRMED');
      const previous = latestCancellationPlan(p);
      const attemptKey = previous ? { planHash, replacesCancellationPlanHash: previous.cancellationPlanHash } : planHash;
      if (previous) {
        // Once confirmation has been dispatched, follow that cancellation.
        // A new quote would supersede the provider reference being reconciled.
        if (exists('cancel-attempt', previous.cancellationPlanHash) || current.state === 'CANCELLED') return cancellationPublic(p, previous);
        const observed = cancellationTerms((await request(`/order_cancellations/${previous.cancellationId}`)).data,
          p, current.orderId, previous.cancellationId);
        if (observed.confirmedAt) return cancellationPublic(p, previous);
        const expired = previous.expiresAt !== null && Date.parse(previous.expiresAt) <= Date.parse(now());
        if (!exists('cancellation-quote-attempt', attemptKey) && !expired
          && same(observed, Object.fromEntries(Object.keys(observed).map(key => [key, previous[key]]))))
          return cancellationPublic(p, previous);
      } else if (current.state === 'CANCELLED') fail('ORDER_ALREADY_CANCELLED');
      // Keep the original immutable reference readable across upgrades. Each
      // renewal has its own durable attempt and a link from the preceding quote.
      let value;
      if (exists('cancellation-quote-attempt', attemptKey)) {
        const attempt = load('cancellation-quote-attempt', attemptKey);
        const candidates = (await list('/order_cancellations', { order_id: current.orderId }))
          .filter(row => !attempt.priorIds.includes(row.id) && row.order_id === current.orderId && Date.parse(row.created_at) >= Date.parse(attempt.requestedAt));
        if (candidates.length !== 1) fail('CANCELLATION_QUOTE_OUTCOME_UNKNOWN'); value = candidates[0];
      } else {
        const prior = await list('/order_cancellations', { order_id: current.orderId });
        save('cancellation-quote-attempt', attemptKey, { priorIds: prior.map(row => row.id), requestedAt: now(), orderId: current.orderId });
        value = (await request('/order_cancellations', { method: 'POST', data: { order_id: current.orderId }, mutation: true })).data;
      }
      const terms = cancellationTerms(value, p, current.orderId);
      const body = { planHash, ...terms, connectionHash: p.connectionHash, environment: p.environment,
        quoteVersion: (previous?.quoteVersion ?? (previous ? 1 : 0)) + 1,
        replacesCancellationPlanHash: previous?.cancellationPlanHash ?? null,
        previousRefundAmountMinor: previous?.refundAmountMinor ?? null, previousRefundCurrency: previous?.refundCurrency ?? null };
      const cancellationPlanHash = digest(body), cp = { ...body, cancellationPlanHash };
      save('cancellation-plan', cancellationPlanHash, cp);
      save(previous ? 'cancellation-plan-next' : 'cancellation-plan-ref', previous?.cancellationPlanHash ?? planHash, { hash: cancellationPlanHash });
      return cancellationPublic(p, cp);
    });
  }
  async function confirmCancellation(input) {
    exact(input, ['planHash', 'cancellationPlanHash', 'authorization']); const p = plan(input.planHash); validHash(input.cancellationPlanHash);
    return lock(p, async () => {
      const cp = load('cancellation-plan', input.cancellationPlanHash), { cancellationPlanHash, ...body } = cp;
      if (cancellationPlanHash !== input.cancellationPlanHash || digest(body) !== cancellationPlanHash || cp.planHash !== p.planHash) fail('CANCELLATION_PLAN_CHANGED');
      if (latestCancellationPlan(p)?.cancellationPlanHash !== cancellationPlanHash) fail('CANCELLATION_QUOTE_REPLACED');
      const view = cancellationPublic(p, cp);
      if (!view.confirmable || !same(input.authorization, view.authorization)) fail('CANCELLATION_AUTHORIZATION_REQUIRED');
      let terms = cancellationTerms((await request(`/order_cancellations/${cp.cancellationId}`)).data, p, cp.orderId, cp.cancellationId);
      if (!terms.confirmedAt) {
        if (exists('cancel-attempt', cancellationPlanHash)) return snapshot(p, { ...await readInternal(p), reason: 'CANCELLATION_OUTCOME_UNKNOWN', cancellationPending: true });
        if (cp.expiresAt && Date.parse(now()) >= Date.parse(cp.expiresAt) || !same(terms, Object.fromEntries(Object.keys(terms).map(key => [key, cp[key]])))) fail('CANCELLATION_TERMS_CHANGED');
        save('cancel-attempt', cancellationPlanHash, { planHash: p.planHash, cancellationPlanHash, authorizationHash: digest(input.authorization), requestedAt: now() });
        snapshot(p, { ...localStatus({ planHash: p.planHash }), cancellationPending: true, reason: 'CANCELLATION_OUTCOME_UNKNOWN' });
        try { await request(`/order_cancellations/${cp.cancellationId}/actions/confirm`, { method: 'POST', mutation: true }); }
        catch { /* Reconcile this exact cancellation; never repeat its write. */ }
        terms = cancellationTerms((await request(`/order_cancellations/${cp.cancellationId}`)).data, p, cp.orderId, cp.cancellationId);
      }
      const current = await readInternal(p);
      return current.refundObservationCurrent!==undefined?current:snapshot(p,cancellationResult(p,current,terms,cp));
    });
  }
  function status() {
    try { const c = config(); let ready = true, reason = null; try { assertBilling(c); } catch (error) { ready = false; reason = error.code; }
      return { provider: 'duffel', configured: true, preparationEnabled: ready, environment: c.environment, liveMode: c.liveMode,
        accountLabel: c.accountLabel, connectionHash: c.connectionHash, fundingSourceHash: c.fundingSourceHash,
        authenticatedAccessVerified: false, accountIdentityVerified: false, reason };
    } catch (error) { return { provider: 'duffel', configured: false, preparationEnabled: false, authenticatedAccessVerified: false,
      accountIdentityVerified: false, reason: error.code ?? 'DUFFEL_CONFIG_INVALID' }; }
  }
  return Object.freeze({ status, search, readSearch, prepare, prepareSelected, readPlan: hash => publicPlan(plan(hash)), execute, read, localStatus, quoteCancellation, confirmCancellation });
}
