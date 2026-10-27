import test from 'node:test';
import assert from 'node:assert/strict';
import { createSquareSupplyAdapter, SQUARE_SUPPLY_SCOPES, SQUARE_SUPPLY_CONNECTOR,
  SQUARE_SUPPLY_API_VERSION } from '../src/outsider-square-supply-adapter.js';

const NOW = '2026-09-09T22:00:00.000Z', EXPIRY = '2026-10-09T22:00:00.000Z';
const CLIENT = 'test-square-application', SECRET = 'test-private-client-secret', TOKEN = 'test-private-access-token', REFRESH = 'test-private-refresh-token';
const MERCHANT = 'MERCHANT123';
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const status = () => ({ merchant_id: MERCHANT, client_id: CLIENT, expires_at: EXPIRY, scopes: [...SQUARE_SUPPLY_SCOPES] });
const profile = () => ({ seller_id: MERCHANT, booking_enabled: true, booking_policy: 'ACCEPT_ALL', allow_user_cancel: true,
  support_seller_level_writes: false, business_appointment_settings: { cancellation_fee_money: { currency: 'USD' } } });
const variation = (id, extra = {}, data = {}) => ({ type: 'ITEM_VARIATION', id, version: 1720000000000,
  item_variation_data: { item_id: 'ITEM123', name: id, available_for_booking: true,
    service_duration: 1800000, pricing_type: 'FIXED_PRICING', price_money: { amount: 2000, currency: 'USD' }, ...data }, ...extra });
const item = (variations, extra = {}) => ({ type: 'ITEM', id: 'ITEM123',
  item_data: { product_type: 'APPOINTMENTS_SERVICE', name: 'Independent service', variations }, ...extra });
function fixture({ business = profile(), items = [item([variation('SERVICE123')])], scopes,
  catalogPages, locationPages, override } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const u = new URL(url), body = options.body ? JSON.parse(options.body) : undefined;
    const call = { url, path: u.pathname, options, body }; calls.push(call);
    const custom = override?.(call); if (custom) return custom;
    if (u.pathname === '/oauth2/token/status') return response({ ...status(), ...(scopes ? { scopes } : {}) });
    if (u.pathname === '/oauth2/token') return response({ access_token: TOKEN, refresh_token: REFRESH,
      merchant_id: MERCHANT, token_type: 'bearer', expires_at: EXPIRY });
    if (u.pathname === '/oauth2/revoke') return response({ success: true });
    if (u.pathname === `/v2/merchants/${MERCHANT}`) return response({ merchant: { id: MERCHANT, business_name: 'Services network',
      private_note: TOKEN, email_address: 'private-owner@example.test' } });
    if (u.pathname === '/v2/locations') return response({ locations: [
      { id: 'LOCATION_A', name: 'A', status: 'ACTIVE', timezone: 'America/New_York',
        address: { address_line_1: '10 Main St', locality: 'Boston', first_name: 'private' }, phone_number: '55512345' },
      { id: 'LOCATION_B', name: 'B', status: 'ACTIVE', timezone: 'America/New_York' },
      { id: 'LOCATION_C', name: 'C', status: 'ACTIVE', timezone: 'America/New_York' },
      { id: 'LOCATION_OFFLINE', name: 'Offline', status: 'ACTIVE' },
      { id: 'LOCATION_CLOSED', name: 'Closed', status: 'INACTIVE' },
    ] });
    if (u.pathname === '/v2/bookings/business-booking-profile') return response({ business_booking_profile: business });
    if (u.pathname === '/v2/bookings/location-booking-profiles') return response(locationPages?.[u.searchParams.get('cursor') ?? 'first']
      ?? { location_booking_profiles: ['LOCATION_A', 'LOCATION_B', 'LOCATION_C', 'LOCATION_CLOSED'].map(location_id => ({ location_id, online_booking_enabled: true })) });
    if (u.pathname === '/v2/catalog/search-catalog-items') return response(catalogPages?.[body.cursor ?? 'first'] ?? { items });
    assert.fail(`Unexpected documented route ${u.pathname}`);
  };
  return { calls, adapter: createSquareSupplyAdapter({ environment: 'sandbox', clientId: CLIENT, clientSecret: SECRET,
    redirectUri: 'https://outsider.example.test/supply/callback', fetchImpl, clock: () => NOW }) };
}

test('OAuth uses exact read scopes, matching environment and callback, then verifies the returned account', async () => {
  const { adapter, calls } = fixture();
  const state = 'a'.repeat(64), url = new URL(adapter.authorizationUrl({ state }));
  assert.equal(url.origin, 'https://connect.squareupsandbox.com');
  assert.equal(url.pathname, '/oauth2/authorize');
  assert.equal(url.searchParams.get('state'), state);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://outsider.example.test/supply/callback');
  assert.deepEqual(url.searchParams.get('scope').split(' '), SQUARE_SUPPLY_SCOPES);
  assert.equal(url.searchParams.get('session'), 'false');
  assert.equal(url.href.includes(SECRET), false);
  assert.equal(SQUARE_SUPPLY_SCOPES.some(scope => /CUSTOMERS|PAYMENTS|ALL_READ|WRITE/u.test(scope)), false);
  assert.equal(SQUARE_SUPPLY_CONNECTOR.bookingWrite, true, 'The connector implements booking; read-only OAuth still grants no write scope');
  const token = await adapter.exchange({ code: 'provider-code' });
  assert.deepEqual(token, { accessToken: TOKEN, refreshToken: REFRESH, merchantId: MERCHANT, expiresAt: EXPIRY, scopes: [...SQUARE_SUPPLY_SCOPES].sort() });
  assert.deepEqual(calls[0].body, { client_id: CLIENT, client_secret: SECRET, grant_type: 'authorization_code', code: 'provider-code',
    redirect_uri: 'https://outsider.example.test/supply/callback' });
  assert.equal(calls[1].path, '/oauth2/token/status');
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].options.headers['Square-Version'], SQUARE_SUPPLY_API_VERSION);
  assert.equal(calls[0].options.redirect, 'error');
});

test('OAuth provider errors and transport errors never expose credentials or upstream details', async () => {
  for (const code of [400, 401, 403, 429, 500]) {
    const { adapter } = fixture({ override: call => call.path === '/oauth2/token'
      ? response({ errors: [{ detail: `${TOKEN} ${SECRET}`, code: 'INVALID_GRANT' }] }, code) : null });
    await assert.rejects(adapter.exchange({ code: 'provider-code' }), error => {
      assert.match(error.code, /^SQUARE_SUPPLY_/u);
      assert.equal(JSON.stringify(error).includes(TOKEN), false);
      assert.equal(error.message.includes(SECRET), false); return true;
    });
  }
  const adapter = createSquareSupplyAdapter({ environment: 'production', clientId: CLIENT, clientSecret: SECRET,
    redirectUri: 'https://outsider.example.test/supply/callback', fetchImpl: async () => { throw new Error(TOKEN); } });
  await assert.rejects(adapter.exchange({ code: 'code' }), { code: 'SQUARE_SUPPLY_TRANSPORT_FAILED' });
});

test('wrong merchant, wrong application, expired token and missing scopes never become connected inventory', async () => {
  for (const changed of [{ merchant_id: 'OTHER_MERCHANT' }, { client_id: 'other-app' }, { expires_at: NOW },
    { scopes: SQUARE_SUPPLY_SCOPES.filter(scope => scope !== 'APPOINTMENTS_READ') }]) {
    const { adapter, calls } = fixture({ override: call => call.path === '/oauth2/token/status' ? response({ ...status(), ...changed }) : null });
    await assert.rejects(adapter.inventory({ accessToken: TOKEN, merchantId: MERCHANT }), { code: changed.scopes
      ? 'SQUARE_SUPPLY_REQUIRED_SCOPES_MISSING' : changed.expires_at ? 'SQUARE_SUPPLY_AUTHORIZATION_EXPIRED' : 'SQUARE_SUPPLY_ACCOUNT_MISMATCH' });
    assert.equal(calls.length, 1);
  }
});

test('refresh rechecks permissions and revocation ends the full authorization using only one token locator', async () => {
  const { adapter, calls } = fixture();
  const refreshed = await adapter.refresh({ refreshToken: REFRESH });
  assert.equal(refreshed.merchantId, MERCHANT);
  assert.deepEqual(calls[0].body, { client_id: CLIENT, client_secret: SECRET, grant_type: 'refresh_token',
    refresh_token: REFRESH });
  const revoked = await adapter.revoke({ accessToken: TOKEN, merchantId: MERCHANT });
  const last = calls.at(-1);
  assert.equal(last.options.headers.Authorization, `Client ${SECRET}`);
  assert.deepEqual(last.body, { client_id: CLIENT, access_token: TOKEN, revoke_only_access_token: false });
  assert.deepEqual(revoked, { revoked: true, merchantId: MERCHANT, scope: 'APPLICATION_AUTHORIZATION', revokedAt: NOW });
  assert.equal(JSON.stringify(revoked).includes(TOKEN), false);
});

test('inventory paginates services and location profiles and returns only active online bookable service locations', async () => {
  const a = item([variation('SERVICE_A')]), b = item([variation('SERVICE_B', {}, { pricing_type: 'VARIABLE_PRICING' })]);
  const { adapter, calls } = fixture({
    catalogPages: { first: { items: [a], cursor: 'page-2' }, 'page-2': { items: [b] } },
    locationPages: { first: { location_booking_profiles: [{ location_id: 'LOCATION_A', online_booking_enabled: true },
      { location_id: 'LOCATION_OFFLINE', online_booking_enabled: false }], cursor: 'locations-2' },
    'locations-2': { location_booking_profiles: [{ location_id: 'LOCATION_B', online_booking_enabled: true },
      { location_id: 'LOCATION_CLOSED', online_booking_enabled: true }] } },
  });
  const inventory = await adapter.inventory({ accessToken: TOKEN, merchantId: MERCHANT });
  assert.deepEqual(inventory.locations.map(row => row.id), ['LOCATION_A', 'LOCATION_B']);
  assert.deepEqual(inventory.resources.map(row => row.id), ['SERVICE_A', 'SERVICE_B']);
  assert.deepEqual(inventory.resources[0].locationIds, ['LOCATION_A', 'LOCATION_B']);
  assert.deepEqual(inventory.resources[0].price, { amountMinor: '2000', currency: 'USD' });
  assert.equal(inventory.resources[1].price, null);
  assert.equal(inventory.resources[0].durationMinutes, 30);
  assert.equal(inventory.resources[0].bookingMode, 'AUTOMATIC_ACCEPTANCE');
  assert.equal(inventory.resources[0].priceBasis, 'CATALOG_BASE_PRICE_NOT_ALL_IN_QUOTE');
  assert.equal(inventory.operations.availabilitySearch.enabled, true);
  assert.equal(inventory.operations.bookingCreate.enabled, false);
  assert.equal(inventory.operations.bookingRead.enabled, true);
  assert.equal(inventory.operations.bookingReschedule.enabled, false);
  assert.equal(inventory.operations.bookingCancel.enabled, false);
  assert.equal(inventory.complete, true);
  const queries = calls.filter(call => call.path === '/v2/catalog/search-catalog-items');
  assert.deepEqual(queries.map(call => call.body.cursor ?? null), [null, 'page-2']);
  assert.deepEqual(queries[0].body.product_types, ['APPOINTMENTS_SERVICE']);
  assert.equal(queries[0].body.archived_state, 'ARCHIVED_STATE_NOT_ARCHIVED');
  const projection = JSON.stringify(inventory);
  for (const privateValue of [TOKEN, SECRET, REFRESH, 'private-owner', '55512345', 'first_name']) assert.equal(projection.includes(privateValue), false);
  assert.equal(calls.some(call => /customers|payments|\/v2\/bookings$/u.test(call.path)), false);
});

test('location membership intersects parent and variation while honoring Square default and inactive lists', async () => {
  const variants = [
    variation('DEFAULT', { absent_at_location_ids: ['LOCATION_A'], present_at_location_ids: ['LOCATION_A'] }),
    variation('EXPLICIT', { present_at_all_locations: false, present_at_location_ids: ['LOCATION_A'], absent_at_location_ids: ['LOCATION_A'] }),
    variation('DISABLED', { present_at_all_locations: false }),
    variation('PARENT_EXCLUDES', { present_at_all_locations: false, present_at_location_ids: ['LOCATION_C'] }),
    variation('NOT_BOOKABLE', {}, { available_for_booking: false }),
    variation('DELETED', { is_deleted: true }),
  ];
  const { adapter } = fixture({ items: [item(variants, { present_at_all_locations: false, present_at_location_ids: ['LOCATION_A', 'LOCATION_B'], absent_at_location_ids: ['LOCATION_A'] }),
    item([variation('RETAIL')], { item_data: { product_type: 'REGULAR', variations: [variation('RETAIL')] } })] });
  const inventory = await adapter.inventory({ accessToken: TOKEN, merchantId: MERCHANT });
  assert.deepEqual(inventory.resources.map(row => [row.id, row.locationIds]), [['DEFAULT', ['LOCATION_B']], ['EXPLICIT', ['LOCATION_A']]]);
});

test('provider acceptance, cancellation fee limits and location prices remain distinct from executable capacity', async () => {
  const business = { ...profile(), booking_policy: 'REQUIRES_ACCEPTANCE' };
  const { adapter } = fixture({ business, items: [item([
    variation('OVERRIDDEN', {}, { location_overrides: [{ location_id: 'LOCATION_A', price_money: { amount: 3500, currency: 'USD' } }] }),
    variation('FEE', {}, { no_show_fee: { amount: 1000, currency: 'USD' } }),
  ])] });
  const result = await adapter.inventory({ accessToken: TOKEN, merchantId: MERCHANT });
  assert.ok(result.resources.every(row => row.bookingMode === 'PROVIDER_APPROVAL' && row.capacityReserved === false));
  assert.equal(result.resources.find(row => row.id === 'OVERRIDDEN').price, null);
  assert.deepEqual(result.resources.find(row => row.id === 'FEE').bookingBlockers, ['NONZERO_CANCELLATION_FEE_UNSUPPORTED_BY_BOOKINGS_API']);
  const disabled = fixture({ business: { ...profile(), booking_enabled: false } });
  assert.deepEqual((await disabled.adapter.inventory({ accessToken: TOKEN, merchantId: MERCHANT })).resources, []);
});

test('partial pagination and catalog changes fail rather than presenting a complete synchronized inventory', async () => {
  const repeated = fixture({ catalogPages: { first: { items: [], cursor: 'again' }, again: { items: [], cursor: 'again' } } });
  await assert.rejects(repeated.adapter.inventory({ accessToken: TOKEN, merchantId: MERCHANT }), { code: 'SQUARE_SUPPLY_PAGINATION_INVALID' });
  const failure = fixture({ override: call => call.path === '/v2/bookings/location-booking-profiles' ? response({ errors: [{ detail: TOKEN }] }, 503) : null });
  await assert.rejects(failure.adapter.inventory({ accessToken: TOKEN, merchantId: MERCHANT }), { code: 'SQUARE_SUPPLY_PROVIDER_REQUEST_FAILED' });
  const changed = fixture({ catalogPages: { first: { items: [item([variation('SAME')])], cursor: 'second' },
    second: { items: [item([variation('SAME', { version: 1720000000001 })])] } } });
  await assert.rejects(changed.adapter.inventory({ accessToken: TOKEN, merchantId: MERCHANT }), { code: 'SQUARE_SUPPLY_CATALOG_CHANGED_DURING_SYNC' });
});

test('availability expands only the upstream read window, then returns exact single-service matches without booking', async () => {
  const startAt = '2026-09-14T14:00:00Z', endAt = '2026-09-14T16:00:00Z';
  const availability = (start, patch = {}) => ({ location_id: 'LOCATION_A', start_at: start,
    appointment_segments: [{ duration_minutes: 30, team_member_id: 'TEAM_A', service_variation_id: 'SERVICE123',
      service_variation_version: 1720000000000 }], ...patch });
  const { adapter, calls } = fixture({ override: call => call.path === '/v2/bookings/availability/search' ? response({ availabilities: [
    availability('2026-09-14T14:30:00Z'), availability('2026-09-14T14:30:00Z'),
    availability('2026-09-14T15:45:00Z'), availability('2026-09-14T13:30:00Z'),
    availability('2026-09-14T14:30:00Z', { location_id: 'OTHER_LOCATION' }),
    availability('2026-09-14T14:30:00Z', { appointment_segments: [{ duration_minutes: 30, team_member_id: 'TEAM_B',
      service_variation_id: 'SERVICE123', service_variation_version: 1720000000000 }] }),
  ] }) : null });
  const result = await adapter.searchAvailability({ accessToken: TOKEN, locationId: 'LOCATION_A', resourceId: 'SERVICE123',
    startAt, endAt, teamMemberIds: ['TEAM_A'] });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { query: { filter: {
    start_at_range: { start_at: '2026-09-14T14:00:00.000Z', end_at: '2026-09-15T14:00:00.000Z' }, location_id: 'LOCATION_A',
    segment_filters: [{ service_variation_id: 'SERVICE123', team_member_id_filter: { any: ['TEAM_A'] } }],
  } } });
  assert.equal(result.slots.length, 1);
  assert.equal(result.slots[0].endAt, '2026-09-14T15:00:00.000Z');
  assert.equal(result.capacityReserved, false);
  assert.equal(result.bookingConfirmed, false);
  assert.equal(result.priceQuoted, false);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  await assert.rejects(adapter.searchAvailability({ accessToken: TOKEN, locationId: 'LOCATION_A', resourceId: 'SERVICE123',
    startAt, endAt: '2026-10-16T14:00:01Z' }), { code: 'SQUARE_SUPPLY_AVAILABILITY_WINDOW_INVALID' });
});

test('adapter rejects redirect substitutions before sending credentials and rejects provider redirects', async () => {
  for (const redirectUri of ['http://remote.example.test/callback', 'https://user:password@example.test/callback',
    'https://example.test/callback#token', 'https://example.test/callback?next=other']) {
    assert.throws(() => createSquareSupplyAdapter({ environment: 'production', clientId: CLIENT, clientSecret: SECRET, redirectUri }),
      { code: 'SQUARE_SUPPLY_REDIRECT_INVALID' });
  }
  const { adapter } = fixture({ override: () => new Response('', { status: 302, headers: { location: 'https://different.example.test' } }) });
  await assert.rejects(adapter.exchange({ code: 'code' }), { code: 'SQUARE_SUPPLY_REDIRECT_REJECTED' });
});

test('a lost booking response is reconciled by its exact reference through read-only paginated lookup',async()=>{
  const slot={locationId:'LOCATION_A',startAt:'2026-09-10T14:00:00.000Z',endAt:'2026-09-10T14:30:00.000Z',durationMinutes:30,
    teamMemberId:'TEAM123',resourceId:'SERVICE123',sourceVersion:'1720000000000'},idempotencyKey='original-booking';
  const row={id:'BOOKING123',version:0,status:'ACCEPTED',customer_id:'CUSTOMER123',location_id:slot.locationId,
    customer_note:'Outsider reference: '+idempotencyKey,start_at:slot.startAt,appointment_segments:[{duration_minutes:30,
      team_member_id:slot.teamMemberId,service_variation_id:slot.resourceId,service_variation_version:1720000000000}]};
  let mode='found';
  const {adapter,calls}=fixture({override:call=>{
    if(call.path!=='/v2/bookings')return;
    assert.equal(call.options.method,'GET');
    const query=new URL(call.url).searchParams;
    assert.equal(query.get('location_id'),slot.locationId);assert.equal(query.get('start_at_min'),slot.startAt);
    if(!query.has('cursor'))return response({bookings:[{...row,id:'OTHER123',customer_note:'another order'}],cursor:'next'});
    return response({bookings:mode==='missing'?[]:mode==='duplicate'?[row,{...row,id:'BOOKING456'}]:[{...row,...(mode==='mismatch'?{location_id:'LOCATION_B'}:{})}]});
  }});
  assert.equal((await adapter.reconcileBooking({accessToken:TOKEN,idempotencyKey,slot})).externalBookingId,'BOOKING123');
  mode='missing';assert.equal((await adapter.reconcileBooking({accessToken:TOKEN,idempotencyKey,slot})).state,'RECONCILIATION_REQUIRED');
  mode='duplicate';await assert.rejects(adapter.reconcileBooking({accessToken:TOKEN,idempotencyKey,slot}),/AMBIGUOUS/);
  mode='mismatch';await assert.rejects(adapter.reconcileBooking({accessToken:TOKEN,idempotencyKey,slot}),/MISMATCH/);
  assert.equal(calls.every(c=>c.options.method==='GET'),true);
});
