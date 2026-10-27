import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDuffelOrderAdapter, DUFFEL_SEARCH_SCHEMA, DUFFEL_SEARCH_LIMITS } from '../src/outsider-duffel-order-adapter.js';

const NOW = '2026-09-10T12:00:00.000Z', EXPIRES = '2026-09-10T12:30:00.000Z';
const input = () => ({ slices: [{ origin: 'BOS', destination: 'JFK', departureDate: '2026-10-01' }],
  passengers: [{ type: 'adult' }], cabinClass: 'economy', maximumConnections: 0, maximumAmountMinor: '15000', currency: 'USD' });
const person = () => ({ id: 'pas_one', given_name: 'PrivateAlice', family_name: 'PrivateWalker', born_on: '1992-04-05',
  email: 'private@example.test', phone_number: '+16175550123', title: 'ms', gender: 'f' });
const json = (data, meta = {}, status = 200) => Response.json({ data, meta }, { status });
const segment = (origin = 'BOS', destination = 'JFK') => ({ origin: { iata_code: origin, time_zone: 'America/New_York' },
  destination: { iata_code: destination, time_zone: 'America/New_York' }, departing_at: '2026-10-01T10:00:00', arriving_at: '2026-10-01T11:15:00',
  operating_carrier: { name: 'Fixture Airlines' }, operating_carrier_flight_number: '123',
  passengers: [{ passenger_id: 'pas_one', cabin_class: 'economy' }] });
const offer = (id = 'off_one', amount = '100.00') => ({ id, live_mode: false, partial: false,
  total_amount: amount, total_currency: 'USD', expires_at: EXPIRES, passengers: [{ id: 'pas_one', type: 'adult' }],
  passenger_identity_documents_required: false, client_key: 'PRIVATE_PROVIDER_CLIENT_KEY',
  conditions: { refund_before_departure: { allowed: true, penalty_amount: '10.00', penalty_currency: 'USD' }, change_before_departure: null },
  slices: [{ origin: { iata_code: 'BOS' }, destination: { iata_code: 'JFK' }, segments: [segment()] }] });
const priced = source => ({ ...source, intended_payment_methods: [{ type: 'balance', charge_amount: source.total_amount, charge_currency: 'USD' }], intended_services: [] });
function fixture(t, { pages = [[offer()]], override, environment = 'test', billingPolicy } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-duffel-search-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  mkdirSync(path.join(directory, 'connections'), { mode: 0o700 });
  const keyFile = path.join(directory, 'connections', 'duffel.key'), key = `duffel_${environment === 'production' ? 'live' : 'test'}_private_search_fixture_secret`;
  writeFileSync(keyFile, key, { mode: 0o600 });
  writeFileSync(path.join(directory, 'connections', 'duffel.json'), JSON.stringify({ schema: 'outsider/duffel-connection/v1',
    apiKeyFile: keyFile, environment, accountLabel: 'Fixture travel balance', ...(billingPolicy ? { billingPolicy } : {}) }), { mode: 0o600 });
  const state = { now: NOW, calls: [], priced: priced(offer()) };
  const create = () => createDuffelOrderAdapter({ nodeDirectory: directory, clock: () => state.now,
    fetchImpl: async (url, options) => {
      const u = new URL(url), call = { method: options.method, path: u.pathname, query: u.searchParams,
        data: options.body ? JSON.parse(options.body).data : null };
      assert.equal(u.origin, 'https://api.duffel.com'); assert.equal(options.redirect, 'error');
      assert.equal(options.headers['Duffel-Version'], 'v2'); assert.equal(options.headers.Authorization, `Bearer ${key}`);
      state.calls.push(call); const custom = await override?.(call, state); if (custom) return custom;
      if (call.path === '/air/offer_requests') return json({ id: 'orq_one', live_mode: environment === 'production',
        passengers: [{ id: 'pas_one', type: 'adult' }], client_key: 'PRIVATE_PROVIDER_CLIENT_KEY' }, {}, 201);
      if (call.path === '/air/offers') {
        const index = Number(call.query.get('after')?.replace('cursor_', '') ?? 0);
        return json(pages[index] ?? [], index + 1 < pages.length ? { after: `cursor_${index + 1}` } : { after: null });
      }
      if (call.path === '/air/offers/off_one/actions/price') return json(state.priced);
      assert.fail(`Unexpected native request: ${call.method} ${call.path}`);
    } });
  return { directory, keyFile, key, state, create, adapter: create() };
}
const noBooking = f => assert.equal(f.state.calls.some(row => /\/orders|\/payments|\/actions\/confirm/u.test(row.path)), false);

test('search uses documented native offer-request and scoped paginated offers protocol, never books or exposes raw credentials', async t => {
  const f = fixture(t), result = await f.adapter.search(input());
  assert.equal(result.schema, DUFFEL_SEARCH_SCHEMA); assert.equal(result.environment, 'test'); assert.equal(result.accountLabel, 'Fixture travel balance');
  const create = f.state.calls[0]; assert.equal(create.method, 'POST'); assert.equal(create.path, '/air/offer_requests');
  assert.equal(create.query.get('return_offers'), 'false'); assert.equal(create.query.get('supplier_timeout'), '10000');
  assert.deepEqual(create.data, { slices: [{ origin: 'BOS', destination: 'JFK', departure_date: '2026-10-01' }], passengers: [{ type: 'adult' }], cabin_class: 'economy', max_connections: 0 });
  const list = f.state.calls[1]; assert.equal(list.method, 'GET'); assert.equal(list.query.get('offer_request_id'), 'orq_one');
  assert.equal(list.query.get('sort'), 'total_amount'); assert.equal(list.query.get('limit'), '50'); assert.equal(list.query.get('max_connections'), '0');
  assert.equal(result.offers[0].estimatedTotalAmountMinor, '10000'); assert.deepEqual(result.offers[0].passengerIds, ['pas_one']);
  assert.match(result.offers[0].summary, /BOS–JFK.*Fixture Airlines 123/u); assert.equal(result.offers[0].identityDocumentsRequired, false);
  assert.equal(result.paginationComplete, true); assert.equal(result.finalPriceConfirmed, false); assert.equal(result.paymentMethodFeesKnown, false);
  assert.equal(result.paymentPerformed, false); assert.equal(result.bookingCreated, false); assert.equal(result.allAirlinesResponded, false);
  const publicText = JSON.stringify(result); for (const value of [f.key, 'PRIVATE_PROVIDER_CLIENT_KEY', 'privateNonce']) assert.equal(publicText.includes(value), false);
  assert.deepEqual(f.create().readSearch(result.searchHash), result); noBooking(f);
  for (const name of readdirSync(path.join(f.directory, 'duffel-orders'))) {
    const file = path.join(f.directory, 'duffel-orders', name); assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(readFileSync(file, 'utf8').includes(f.key), false);
  }
});

test('search sorts all observed eligible pages by exact decimal amount with deterministic ties and deduplicates repeated candidates', async t => {
  const f = fixture(t, { pages: [[offer('off_z', '101.01'), offer('off_same', '100.01')], [offer('off_b', '90.00'), offer('off_a', '90.00'), offer('off_same', '100.01')]] });
  const result = await f.adapter.search(input());
  assert.deepEqual(result.offers.map(row => row.offerId), ['off_a', 'off_b', 'off_same', 'off_z']);
  assert.equal(result.pagesRead, 2); assert.equal(result.observedOfferCount, 5); assert.equal(result.candidateCount, 4);
  assert.equal(f.state.calls[2].query.get('after'), 'cursor_1'); assert.equal(result.paginationComplete, true); noBooking(f);
});

test('wrong route/date/passenger/cabin/connections/currency/partial/expired or over-budget offers are not advertised as viable', async t => {
  const cases = [
    value => { value.slices[0].segments[0].departing_at = '2026-10-02T10:00:00'; },
    value => { value.slices[0].origin.iata_code = 'LAX'; },
    value => { value.passengers[0].type = 'child'; },
    value => { value.passengers[0].id = 'pas_unknown'; },
    value => { value.slices[0].segments[0].passengers[0].cabin_class = 'business'; },
    value => { value.slices[0].segments = [segment('BOS', 'PHL'), segment('PHL', 'JFK')]; },
    value => { value.slices[0].segments[0].operating_carrier = null; },
    value => { value.total_currency = 'EUR'; }, value => { value.partial = true; },
    value => { value.expires_at = NOW; }, value => { value.total_amount = '150.01'; },
    value => { value.live_mode = true; }, value => { value.total_amount = 'NaN'; },
    value => { value.slices[0].segments[0].passengers.push({ passenger_id: 'pas_one', cabin_class: 'economy' }); }
  ];
  const invalid = cases.map((change, n) => { const value = offer(`off_invalid_${n}`); change(value); return value; });
  const f = fixture(t, { pages: [[...invalid, offer('off_ok', '150.00')]] }), result = await f.adapter.search(input());
  assert.deepEqual(result.offers.map(row => row.offerId), ['off_ok']); assert.equal(result.candidateCount, 1);
  assert.equal(Object.values(result.rejectedOffers).reduce((sum, n) => sum + n, 0), cases.length); noBooking(f);
});

test('an offer changing between pages cannot win comparison under the same provider id', async t => {
  const f = fixture(t, { pages: [[offer()], [offer('off_one', '90.00')], [offer()]] });
  const result = await f.adapter.search(input()); assert.equal(result.offers.length, 0); assert.equal(result.reason, 'NO_MATCHING_OFFERS');
  assert.ok(result.rejectedOffers.DUFFEL_SEARCH_OFFER_CHANGED >= 1);
  const g = fixture(t, { pages: [[offer()], [offer('off_one', '160.00')], [offer()]] });
  assert.equal((await g.adapter.search(input())).offers.length, 0, 'a later disqualified source invalidates its previous viable projection');
});

test('multi-slice adult requests bind every segment cabin and every passenger, without merging unrelated offers', async t => {
  const wanted = input(); wanted.passengers.push({ type: 'adult' }); wanted.maximumConnections = 1;
  wanted.slices.push({ origin: 'JFK', destination: 'BOS', departureDate: '2026-10-03' });
  const value = offer(); value.passengers.push({ id: 'pas_two', type: 'adult' });
  value.slices[0].segments = [segment('BOS', 'PHL'), segment('PHL', 'JFK')];
  const inbound = segment('JFK', 'BOS'); inbound.departing_at = '2026-10-03T10:00:00'; inbound.arriving_at = '2026-10-03T11:15:00';
  value.slices.push({ origin: { iata_code: 'JFK' }, destination: { iata_code: 'BOS' }, segments: [inbound] });
  for (const row of value.slices.flatMap(slice => slice.segments)) row.passengers.push({ passenger_id: 'pas_two', cabin_class: 'economy' });
  const f = fixture(t, { pages: [[value]], override: call => call.path === '/air/offer_requests'
    ? json({ id: 'orq_one', live_mode: false, passengers: value.passengers }) : undefined });
  const result = await f.adapter.search(wanted); assert.equal(result.offers.length, 1);
  assert.deepEqual(result.offers[0].passengerIds, ['pas_one', 'pas_two']); assert.equal(result.offers[0].itinerary.length, 2);
  assert.equal(f.state.calls[0].data.slices[1].departure_date, '2026-10-03');
});

test('partial pages and repeated cursors retain observed alternatives without claiming a complete search', async t => {
  for (const kind of ['failed', 'invalid', 'repeated']) {
    const f = fixture(t, { override: call => {
      if (call.path !== '/air/offers') return;
      if (!call.query.has('after')) return json([offer()], { after: 'cursor_again' });
      if (kind === 'failed') return Response.json({ errors: [{ code: 'temporary', message: 'PRIVATE_UPSTREAM_ERROR' }] }, { status: 503 });
      if (kind === 'invalid') return json({ not: 'a list' });
      return json([offer()], { after: 'cursor_again' });
    } });
    const result = await f.adapter.search(input()); assert.equal(result.offers.length, 1); assert.equal(result.paginationComplete, false);
    assert.equal(result.comparisonScope, 'OBSERVED_OFFERS_ONLY'); assert.match(result.incompleteReason, /^PROVIDER_/u);
    assert.equal(JSON.stringify(result).includes('PRIVATE_UPSTREAM_ERROR'), false); noBooking(f);
  }
});

test('page and output limits are explicit; cheapest means cheapest observed within this one bounded search', async t => {
  const f = fixture(t, { override: call => {
    if (call.path !== '/air/offers') return;
    const n = Number(call.query.get('after') ?? 0);
    return json(Array.from({ length: 50 }, (_, j) => offer(`off_${String(n * 50 + j).padStart(4, '0')}`, '100.00')), { after: String(n + 1) });
  } });
  const result = await f.adapter.search(input()); assert.equal(result.pagesRead, DUFFEL_SEARCH_LIMITS.maximumPages);
  assert.equal(result.observedOfferCount, DUFFEL_SEARCH_LIMITS.maximumOffers); assert.equal(result.candidateCount, 500);
  assert.equal(result.offers.length, DUFFEL_SEARCH_LIMITS.returnedOffers); assert.equal(result.offersTruncated, true);
  assert.equal(result.paginationComplete, false); assert.equal(result.incompleteReason, 'SEARCH_PAGE_LIMIT'); noBooking(f);
});

test('empty complete result differs from no alternatives observed during a provider failure', async t => {
  const f = fixture(t, { pages: [[]] }), none = await f.adapter.search(input());
  assert.equal(none.reason, 'NO_MATCHING_OFFERS'); assert.equal(none.paginationComplete, true);
  const g = fixture(t, { override: call => call.path === '/air/offers' ? Response.json({}, { status: 503 }) : undefined });
  const incomplete = await g.adapter.search(input()); assert.equal(incomplete.reason, 'SEARCH_INCOMPLETE_NO_MATCHING_OFFERS');
  assert.equal(incomplete.paginationComplete, false); assert.equal(incomplete.offers.length, 0);
});

test('normalized search/request hashes are immutable and bound to this connection even after restart', async t => {
  const f = fixture(t), first = await f.adapter.search(input()), again = await f.adapter.search(input());
  assert.equal(first.requestHash, again.requestHash); assert.notEqual(first.searchHash, again.searchHash);
  const changed = input(); changed.maximumAmountMinor = '14000'; const other = await f.adapter.search(changed);
  assert.notEqual(first.requestHash, other.requestHash); assert.notEqual(first.offers[0].offerHash, other.offers[0].offerHash);
  writeFileSync(f.keyFile, 'duffel_test_rotated_private_fixture_secret', { mode: 0o600 });
  assert.throws(() => f.create().readSearch(first.searchHash), { code: 'DUFFEL_ACCOUNT_BINDING_CHANGED' });
  const g = fixture(t), stored = await g.adapter.search(input());
  const target = path.join(g.directory, 'duffel-orders', readdirSync(path.join(g.directory, 'duffel-orders'))[0]);
  const corrupted = JSON.parse(readFileSync(target, 'utf8')); corrupted.body.request.maximumAmountMinor = '99999';
  writeFileSync(target, JSON.stringify(corrupted), { mode: 0o600 });
  assert.throws(() => g.create().readSearch(stored.searchHash), { code: 'DUFFEL_SEARCH_CHANGED' });
});

test('invalid search inputs fail before provider traffic, production search requires explicit operator fee policy', async t => {
  const f = fixture(t);
  for (const change of [x => { x.currency = 'EUR'; }, x => { x.passengers = [{ type: 'child' }]; }, x => { x.slices[0].origin = 'Boston'; },
    x => { x.slices[0].departureDate = '2026-02-30'; }, x => { x.slices[0].departureDate = '2026-09-09'; },
    x => { x.maximumConnections = 3; }, x => { x.maximumAmountMinor = '100.00'; }, x => { x.maximumAmountMinor = '0'; },
    x => { x.slices.push({ origin: 'JFK', destination: 'BOS', departureDate: '2026-09-30' }); },
    x => { x.passengers[0].given_name = 'PRIVATE'; }, x => { x.unknown = true; }]) {
    const value = input(); change(value); await assert.rejects(f.adapter.search(value));
  }
  assert.equal(f.state.calls.length, 0);
  const g = fixture(t, { environment: 'production' });
  await assert.rejects(g.adapter.search(input()), { code: 'DUFFEL_PLATFORM_FEES_POLICY_REQUIRED' }); assert.equal(g.state.calls.length, 0);
  const h = fixture(t, { environment: 'production', billingPolicy: { platformFeesAuthorized: true, customerChargePolicy: 'PLATFORM_ABSORBS_NETWORK_FEES' },
    pages: [[{ ...offer(), live_mode: true }]] });
  const result = await h.adapter.search(input()); assert.equal(result.environment, 'production'); assert.equal(result.paymentPerformed, false); noBooking(h);
});

test('offer request passenger/account echo and authentication errors cannot produce a selectable search', async t => {
  for (const response of [json({ id: 'orq_one', live_mode: true, passengers: [{ id: 'pas_one', type: 'adult' }] }),
    json({ id: 'orq_one', live_mode: false, passengers: [{ id: 'pas_one', type: 'child' }] }),
    Response.json({ errors: [{ code: 'bad', message: 'PRIVATE' }] }, { status: 401 })]) {
    const f = fixture(t, { override: call => call.path === '/air/offer_requests' ? response : undefined });
    await assert.rejects(f.adapter.search(input())); assert.equal(f.state.calls.length, 1);
  }
});

test('prepareSelected freezes a repriced exact candidate and fee-inclusive ceiling without purchasing', async t => {
  const f = fixture(t), found = await f.adapter.search(input());
  f.state.priced.intended_payment_methods = [{ type: 'balance', charge_amount: '101.57', charge_currency: 'USD', surcharge_amount: '1.57', surcharge_currency: 'USD' }];
  const plan = await f.adapter.prepareSelected({ searchHash: found.searchHash, offerHash: found.offers[0].offerHash, passengers: [person()] });
  assert.equal(plan.totalAmountMinor, '10157'); assert.equal(plan.searchHash, found.searchHash); assert.equal(plan.offerHash, found.offers[0].offerHash);
  assert.deepEqual(f.adapter.readPlan(plan.planHash), plan); assert.equal(f.state.calls.filter(row => row.path.endsWith('/actions/price')).length, 1);
  for (const value of ['PrivateAlice', 'PrivateWalker', 'private@example.test', '1992-04-05']) assert.equal(JSON.stringify(plan).includes(value), false);
  noBooking(f);
});

test('prepareSelected refuses candidate substitution, passenger mismatch, expiry, changed flight/cabin and surcharge over budget', async t => {
  for (const kind of ['candidate', 'passenger', 'expired', 'flight', 'cabin', 'surcharge']) {
    const f = fixture(t), found = await f.adapter.search(input());
    const command = { searchHash: found.searchHash, offerHash: found.offers[0].offerHash, passengers: [person()] };
    if (kind === 'candidate') command.offerHash = 'sha256:' + 'f'.repeat(64);
    if (kind === 'passenger') command.passengers[0].id = 'pas_wrong';
    if (kind === 'expired') f.state.now = EXPIRES;
    if (kind === 'flight') f.state.priced.slices[0].segments[0].operating_carrier_flight_number = '456';
    if (kind === 'cabin') f.state.priced.slices[0].segments[0].passengers[0].cabin_class = 'business';
    if (kind === 'surcharge') f.state.priced.intended_payment_methods = [{ type: 'balance', surcharge_amount: '50.01', surcharge_currency: 'USD' }];
    await assert.rejects(f.adapter.prepareSelected(command)); noBooking(f);
  }
});

test('selected search cabin remains enforced at original execute preflight with no hidden booking on change', async t => {
  const f = fixture(t), found = await f.adapter.search(input());
  const plan = await f.adapter.prepareSelected({ searchHash: found.searchHash, offerHash: found.offers[0].offerHash, passengers: [person()] });
  f.state.priced.slices[0].segments[0].passengers[0].cabin_class = 'business';
  const result = await f.adapter.execute({ planHash: plan.planHash, programHash: 'sha256:' + 'a'.repeat(64),
    requirementId: 'flight', operationId: 'original-flight-operation', authorization: plan.authorization });
  assert.equal(result.state, 'REJECTED'); assert.equal(result.effectNotDispatched, true); noBooking(f);
});
