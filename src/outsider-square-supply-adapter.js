/* Square account supply ingress and app-created booking lifecycle. Booking
 * writes require a separate OAuth scope and the merchant's selected-service consent.
 * Provider references are retained for exact later transactions, not interpreted
 * as confirmed slots or all-inclusive prices.
 * Official contracts checked 2026-09-09, pinned Square-Version 2026-08-19:
 * https://developer.squareup.com/docs/oauth-api/overview
 * https://developer.squareup.com/reference/square/o-auth-api/RetrieveTokenStatus
 * https://developer.squareup.com/docs/bookings-api/use-the-api
 * https://developer.squareup.com/reference/square/objects/CatalogObject
 */
export const SQUARE_SUPPLY_API_VERSION = '2026-08-19';
export const SQUARE_SUPPLY_SCOPES = Object.freeze([
  'MERCHANT_PROFILE_READ', 'ITEMS_READ', 'APPOINTMENTS_READ', 'APPOINTMENTS_BUSINESS_SETTINGS_READ',
]);
export const SQUARE_SUPPLY_BOOKING_SCOPES = Object.freeze([...SQUARE_SUPPLY_SCOPES, 'APPOINTMENTS_WRITE', 'CUSTOMERS_WRITE']);
export const SQUARE_SUPPLY_CONNECTOR = Object.freeze({
  id: 'square', name: 'Square', authorization: 'OAUTH2_AUTHORIZATION_CODE',
  scopes: SQUARE_SUPPLY_SCOPES, resourceKinds: Object.freeze(['SERVICE']),
  accountScope: 'ONE_AUTHORIZED_MERCHANT_MULTIPLE_LOCATIONS_AND_SERVICES',
  inventoryRead: true, availabilitySearch: true, bookingWrite: true,
  paymentWrite: false, customerHistoryRead: false,
  apiVersion: SQUARE_SUPPLY_API_VERSION,
});

const ORIGINS = Object.freeze({ production: 'https://connect.squareup.com', sandbox: 'https://connect.squareupsandbox.com' });
const ID = /^[A-Za-z0-9_-]{1,191}$/u;
const DAY_MS = 86400000, MAX_PAGES = 100, MAX_OBJECTS = 20000, MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const fail = code => { throw Object.assign(new Error(`SQUARE_SUPPLY_${code}`), { code: `SQUARE_SUPPLY_${code}` }); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const id = value => { if (typeof value !== 'string' || !ID.test(value)) fail('IDENTIFIER_INVALID'); return value; };
const secret = value => { if (typeof value !== 'string' || !value || value.length > 4096 || /[\s\0]/u.test(value)) fail('CREDENTIAL_INVALID'); return value; };
const label = value => typeof value === 'string' ? value.replace(/[\0-\x1f\x7f]/gu, ' ').slice(0, 500) : '';
const instant = value => {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) fail('TIME_INVALID');
  return new Date(value).toISOString();
};
const integer = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value)
  : typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/u.test(value) ? value : null;
const money = value => plain(value) && integer(value.amount) !== null && /^[A-Z]{3}$/u.test(value.currency ?? '')
  ? { amountMinor: integer(value.amount), currency: value.currency } : null;
const address = value => plain(value) ? Object.fromEntries([
  'address_line_1', 'address_line_2', 'address_line_3', 'locality', 'sublocality',
  'administrative_district_level_1', 'administrative_district_level_2', 'postal_code', 'country',
].filter(key => typeof value[key] === 'string').map(key => [key, label(value[key])])) : {};

// ITEM and ITEM_VARIATION have separate location controls. Both must permit a
// location. Square defaults an omitted present_at_all_locations to true.
function presentAt(object, locationId) {
  if (object.present_at_all_locations !== undefined && typeof object.present_at_all_locations !== 'boolean') fail('CATALOG_INVALID');
  for (const field of ['present_at_location_ids', 'absent_at_location_ids']) {
    if (object[field] !== undefined && (!Array.isArray(object[field]) || object[field].some(value => !ID.test(value)))) fail('CATALOG_INVALID');
  }
  return object.present_at_all_locations !== false
    ? !(object.absent_at_location_ids ?? []).includes(locationId)
    : (object.present_at_location_ids ?? []).includes(locationId);
}

function operations(scopes) {
  const entry = (requiredScopes, implemented, reason) => ({
    enabled: implemented && requiredScopes.every(scope => scopes.includes(scope)),
    implemented, requiredScopes, permissionGranted: requiredScopes.every(scope => scopes.includes(scope)),
    ...(reason ? { reason } : {}),
  });
  return {
    inventoryRead: entry(SQUARE_SUPPLY_SCOPES.filter(scope => scope !== 'APPOINTMENTS_READ'), true),
    availabilitySearch: entry(['APPOINTMENTS_READ'], true),
    bookingCreate: entry(['APPOINTMENTS_WRITE', 'CUSTOMERS_WRITE'], true),
    bookingRead: entry(['APPOINTMENTS_READ'], true),
    bookingReschedule: entry(['APPOINTMENTS_WRITE'], true),
    bookingCancel: entry(['APPOINTMENTS_WRITE'], true),
    paymentWrite: entry(['PAYMENTS_WRITE'], false, 'PAYMENT_NOT_IMPLEMENTED'),
  };
}

export function createSquareSupplyAdapter({ environment, clientId, clientSecret, redirectUri, fetchImpl = globalThis.fetch,
  clock = () => new Date().toISOString() } = {}) {
  if (!Object.hasOwn(ORIGINS, environment ?? '') || typeof fetchImpl !== 'function' || typeof clock !== 'function') fail('CONFIG_INVALID');
  secret(clientId); secret(clientSecret);
  let redirect;
  try { redirect = new URL(redirectUri); } catch { fail('REDIRECT_INVALID'); }
  if (redirect.username || redirect.password || redirect.hash || redirect.search
    || redirect.protocol !== 'https:' && !(environment === 'sandbox' && redirect.protocol === 'http:'
      && ['127.0.0.1', 'localhost', '[::1]'].includes(redirect.hostname))) fail('REDIRECT_INVALID');
  const origin = ORIGINS[environment];
  const now = () => instant(clock());

  async function request(pathname, { method = 'GET', accessToken, body, clientAuthorization = false } = {}) {
    // All paths are constructed by this adapter from documented operations.
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json', 'Square-Version': SQUARE_SUPPLY_API_VERSION };
    if (accessToken) headers.Authorization = `Bearer ${secret(accessToken)}`;
    if (clientAuthorization) headers.Authorization = `Client ${clientSecret}`;
    let response;
    try { response = await fetchImpl(`${origin}${pathname}`, { method, headers, redirect: 'error',
      signal: AbortSignal.timeout(20000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    catch { fail('TRANSPORT_FAILED'); }
    if (response.redirected || response.status >= 300 && response.status < 400) fail('REDIRECT_REJECTED');
    const length = response.headers?.get?.('content-length');
    if (length && Number(length) > MAX_RESPONSE_BYTES) fail('RESPONSE_TOO_LARGE');
    let bytes;
    try {
      if (response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
        const parts = []; let size = 0;
        for await (const chunk of response.body) { size += chunk.byteLength; if (size > MAX_RESPONSE_BYTES) fail('RESPONSE_TOO_LARGE'); parts.push(Buffer.from(chunk)); }
        bytes = Buffer.concat(parts);
      } else bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) { if (error.code === 'SQUARE_SUPPLY_RESPONSE_TOO_LARGE') throw error; fail('RESPONSE_READ_FAILED'); }
    if (bytes.length > MAX_RESPONSE_BYTES) fail('RESPONSE_TOO_LARGE');
    let value;
    try { value = JSON.parse(bytes); } catch { fail('RESPONSE_INVALID'); }
    if (!plain(value)) fail('RESPONSE_INVALID');
    // Provider error.detail/error_description can contain submitted credentials;
    // project only our fixed error codes, never upstream body or thrown fetch text.
    if (response.status === 401) fail('AUTHORIZATION_EXPIRED');
    if (response.status === 403) fail('PERMISSION_DENIED');
    if (response.status === 429) fail('RATE_LIMITED');
    if (response.status < 200 || response.status >= 300 || value.error || value.errors?.length) fail('PROVIDER_REQUEST_FAILED');
    return value;
  }

  async function introspect(accessToken, expectedMerchantId) {
    const value = await request('/oauth2/token/status', { method: 'POST', accessToken });
    if (value.client_id !== clientId || !ID.test(value.merchant_id ?? '')
      || expectedMerchantId && value.merchant_id !== expectedMerchantId) fail('ACCOUNT_MISMATCH');
    if (!Array.isArray(value.scopes) || value.scopes.some(scope => typeof scope !== 'string' || !/^[A-Z_]+$/u.test(scope))) fail('TOKEN_STATUS_INVALID');
    if (typeof value.expires_at !== 'string' || !value.expires_at || Date.parse(instant(value.expires_at)) <= Date.parse(now())) fail('AUTHORIZATION_EXPIRED');
    const scopes = [...new Set(value.scopes)].sort();
    if (SQUARE_SUPPLY_SCOPES.some(scope => !scopes.includes(scope))) fail('REQUIRED_SCOPES_MISSING');
    return { merchantId: value.merchant_id, scopes, expiresAt: instant(value.expires_at), verifiedAt: now() };
  }

  async function tokens(body) {
    const value = await request('/oauth2/token', { method: 'POST', body: { client_id: clientId, client_secret: clientSecret, ...body } });
    secret(value.access_token); secret(value.refresh_token); id(value.merchant_id);
    if (value.token_type !== 'bearer' || Date.parse(instant(value.expires_at)) <= Date.parse(now())) fail('TOKEN_RESPONSE_INVALID');
    const verified = await introspect(value.access_token, value.merchant_id);
    return { accessToken: value.access_token, refreshToken: value.refresh_token, merchantId: value.merchant_id,
      expiresAt: instant(value.expires_at), scopes: verified.scopes };
  }

  async function pages(pathname, property, accessToken, body, filters={}) {
    const records = [], cursors = new Set(); let cursor;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ ...filters, limit: '100', ...(cursor ? { cursor } : {}) });
      const value = await request(body ? pathname : `${pathname}?${query}`, { accessToken,
        ...(body ? { method: 'POST', body: { ...body, ...(cursor ? { cursor } : {}) } } : {}) });
      if (value[property] !== undefined && !Array.isArray(value[property])) fail('INVENTORY_RESPONSE_INVALID');
      records.push(...(value[property] ?? []));
      if (records.length > MAX_OBJECTS) fail('INVENTORY_LIMIT');
      if (!value.cursor) return records;
      if (typeof value.cursor !== 'string' || value.cursor.length > 4096 || cursors.has(value.cursor)) fail('PAGINATION_INVALID');
      cursors.add(value.cursor); cursor = value.cursor;
    }
    fail('INVENTORY_LIMIT');
  }

  const exactNumber = value => { const parsed=integer(value);if(parsed===null||!Number.isSafeInteger(Number(parsed)))fail('BOOKING_VERSION_INVALID');return Number(parsed); };
  const key = value => {if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,45}$/u.test(value))fail('IDEMPOTENCY_KEY_INVALID');return value;};
  function segment(slot){if(!plain(slot)||!Number.isSafeInteger(slot.durationMinutes)||slot.durationMinutes<1)fail('BOOKING_SLOT_INVALID');
    return {duration_minutes:slot.durationMinutes,team_member_id:id(slot.teamMemberId),service_variation_id:id(slot.resourceId),service_variation_version:exactNumber(slot.sourceVersion)};}
  function booking(value){const row=value?.booking;if(!plain(row)||!ID.test(row.id??'')||!Number.isSafeInteger(row.version))fail('BOOKING_RESPONSE_INVALID');
    const segments=(row.appointment_segments??[]).map(s=>({resourceId:s.service_variation_id,teamMemberId:s.team_member_id,durationMinutes:s.duration_minutes,sourceVersion:integer(s.service_variation_version)}));
    const startAt=instant(row.start_at),duration=segments.reduce((sum,s)=>sum+(Number.isSafeInteger(s.durationMinutes)?s.durationMinutes:0),0);
    return {connectorId:'square',externalBookingId:row.id,version:row.version,providerStatus:row.status,
      state:row.status==='ACCEPTED'?'CONFIRMED':row.status==='PENDING'?'PROVIDER_APPROVAL_REQUIRED':/^CANCELLED_/u.test(row.status??'')?'CANCELLED':row.status==='DECLINED'?'DECLINED':'PROVIDER_REPORTED',
      locationId:row.location_id,customerId:row.customer_id,startAt,endAt:new Date(Date.parse(startAt)+duration*60000).toISOString(),segments,observedAt:now(),paymentPerformed:false};}

  return Object.freeze({
    authorizationUrl({ state, mode='READ' }) {
      if(!['READ','BOOKING'].includes(mode))fail('AUTHORIZATION_MODE_INVALID');
      if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/u.test(state)) fail('STATE_INVALID');
      const url = new URL('/oauth2/authorize', origin);
      url.search = new URLSearchParams({ client_id: clientId, scope: (mode==='BOOKING'?SQUARE_SUPPLY_BOOKING_SCOPES:SQUARE_SUPPLY_SCOPES).join(' '),
        redirect_uri: redirect.href, state, session: 'false' }).toString();
      return url.href;
    },
    exchange({ code }) { secret(code); return tokens({ grant_type: 'authorization_code', code, redirect_uri: redirect.href }); },
    refresh({ refreshToken }) { secret(refreshToken); return tokens({ grant_type: 'refresh_token', refresh_token: refreshToken }); },
    async revoke({ accessToken, merchantId }) {
      secret(accessToken); id(merchantId);
      // Default false revokes the app authorization, including refresh tokens.
      // Do not supply both access_token and merchant_id: Square forbids it.
      const result = await request('/oauth2/revoke', { method: 'POST', clientAuthorization: true,
        body: { client_id: clientId, access_token: accessToken, revoke_only_access_token: false } });
      if (result.success !== true) fail('REVOCATION_UNCONFIRMED');
      return { revoked: true, merchantId, scope: 'APPLICATION_AUTHORIZATION', revokedAt: now() };
    },
    async inventory({ accessToken, merchantId }) {
      id(merchantId);
      const verified = await introspect(accessToken, merchantId);
      const results = await Promise.allSettled([
        request(`/v2/merchants/${encodeURIComponent(merchantId)}`, { accessToken }),
        request('/v2/locations', { accessToken }),
        request('/v2/bookings/business-booking-profile', { accessToken }),
        pages('/v2/bookings/location-booking-profiles', 'location_booking_profiles', accessToken),
        pages('/v2/catalog/search-catalog-items', 'items', accessToken,
          { product_types: ['APPOINTMENTS_SERVICE'], archived_state: 'ARCHIVED_STATE_NOT_ARCHIVED', limit: 100 }),
      ]);
      const rejected = results.find(result => result.status === 'rejected');
      if (rejected) throw rejected.reason;
      const [merchantResult, locationResult, businessResult, profiles, items] = results.map(result => result.value);
      const merchant = merchantResult.merchant, business = businessResult.business_booking_profile;
      if (merchant?.id !== merchantId || business?.seller_id !== merchantId) fail('ACCOUNT_MISMATCH');
      if (!Array.isArray(locationResult.locations ?? []) || !plain(business)) fail('INVENTORY_RESPONSE_INVALID');
      const online = new Set(profiles.filter(profile => profile.online_booking_enabled === true).map(profile => id(profile.location_id)));
      const locations = (locationResult.locations ?? []).filter(location => location.status === 'ACTIVE'
        && online.has(location.id) && business.booking_enabled === true).map(location => ({
        id: id(location.id), name: label(location.name), address: address(location.address),
        timeZone: label(location.timezone) || null,
      }));
      if (new Set(locations.map(location => location.id)).size !== locations.length) fail('DUPLICATE_LOCATION');
      const bookingMode = business.booking_policy === 'ACCEPT_ALL' ? 'AUTOMATIC_ACCEPTANCE'
        : business.booking_policy === 'REQUIRES_ACCEPTANCE' ? 'PROVIDER_APPROVAL' : 'UNKNOWN';
      const resources = [], seen = new Map();
      for (const item of items) {
        if (item?.type !== 'ITEM' || item.is_deleted || item.item_data?.is_archived
          || item.item_data?.product_type !== 'APPOINTMENTS_SERVICE') continue;
        id(item.id);
        if (!Array.isArray(item.item_data.variations ?? [])) fail('CATALOG_INVALID');
        for (const variation of item.item_data.variations ?? []) {
          const data = variation.item_variation_data;
          if (variation.type !== 'ITEM_VARIATION' || variation.is_deleted || data?.available_for_booking !== true) continue;
          if (data.item_id !== item.id) fail('CATALOG_PARENT_MISMATCH');
          const locationIds = locations.filter(location => presentAt(item, location.id) && presentAt(variation, location.id)).map(location => location.id).sort();
          if (!locationIds.length) continue;
          const duration = integer(data.service_duration), version = integer(variation.version);
          if (!duration || BigInt(duration) === 0n || BigInt(duration) > 31n * 86400000n || BigInt(duration) % 60000n || version === null) fail('CATALOG_TERMS_INVALID');
          // A single price cannot represent different location overrides. Neither
          // the base nor an override is a tax/fee-inclusive transaction quote.
          const overrides = data.location_overrides ?? [];
          if (!Array.isArray(overrides)) fail('CATALOG_INVALID');
          const locationPriceOverrides = overrides.some(row => locationIds.includes(row.location_id)
            && (row.price_money !== undefined || row.pricing_type !== undefined));
          const basePrice = data.pricing_type === 'FIXED_PRICING' ? money(data.price_money) : null;
          const noShow = money(data.no_show_fee), businessFee = money(business.business_appointment_settings?.cancellation_fee_money);
          const bookingBlockers = [...(noShow && BigInt(noShow.amountMinor) > 0n || businessFee && BigInt(businessFee.amountMinor) > 0n
            ? ['NONZERO_CANCELLATION_FEE_UNSUPPORTED_BY_BOOKINGS_API'] : [])];
          const resource = { id: id(variation.id), name: [label(item.item_data.name), label(data.name)].filter(Boolean).join(' · '),
            locationIds, kind: 'SERVICE', durationMinutes: Number(BigInt(duration) / 60000n),
            price: locationPriceOverrides ? null : basePrice, priceBasis: 'CATALOG_BASE_PRICE_NOT_ALL_IN_QUOTE',
            locationPriceOverrides, sourceVersion: version, bookingMode, bookingBlockers,
            capacityReserved: false, availabilityRequiresSearch: true };
          const previous = seen.get(resource.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(resource)) fail('CATALOG_CHANGED_DURING_SYNC');
          if (!previous) { seen.set(resource.id, resource); resources.push(resource); }
          if (resources.length > MAX_OBJECTS) fail('INVENTORY_LIMIT');
        }
      }
      resources.sort((a, b) => a.id.localeCompare(b.id));
      return { account: { id: merchantId, name: label(merchant.business_name) }, locations, resources,
        permissions: { requestedScopes: [...SQUARE_SUPPLY_SCOPES], grantedScopes: verified.scopes, verifiedAt: verified.verifiedAt },
        operations: operations(verified.scopes), bookingPolicy: { bookingEnabled: business.booking_enabled === true,
          bookingMode, buyerCancellationAllowed: business.allow_user_cancel === true,
          supportsSellerLevelWrites: business.support_seller_level_writes === true },
        observedAt: now(), complete: true, environment, source: 'SQUARE_ACCOUNT_API',
        inventoryIsAvailability: false, inventoryIsBookingAuthority: false };
    },
    async searchAvailability({ accessToken, locationId, resourceId, startAt, endAt, teamMemberIds }) {
      secret(accessToken); id(locationId); id(resourceId);
      const start = instant(startAt), end = instant(endAt), duration = Date.parse(end) - Date.parse(start);
      if (duration <= 0 || duration > 31 * DAY_MS) fail('AVAILABILITY_WINDOW_INVALID');
      if (teamMemberIds !== undefined && (!Array.isArray(teamMemberIds) || !teamMemberIds.length || teamMemberIds.length > 100
        || teamMemberIds.some(value => !ID.test(value)) || new Set(teamMemberIds).size !== teamMemberIds.length)) fail('TEAM_MEMBER_FILTER_INVALID');
      const queryEnd = new Date(Date.parse(start) + Math.max(duration, DAY_MS)).toISOString();
      const result = await request('/v2/bookings/availability/search', { method: 'POST', accessToken, body: { query: { filter: {
        start_at_range: { start_at: start, end_at: queryEnd }, location_id: locationId,
        segment_filters: [{ service_variation_id: resourceId, ...(teamMemberIds ? { team_member_id_filter: { any: teamMemberIds } } : {}) }],
      } } } });
      if (!Array.isArray(result.availabilities ?? [])) fail('AVAILABILITY_RESPONSE_INVALID');
      const slots = [], seen = new Set();
      for (const available of result.availabilities ?? []) {
        if (available.location_id !== locationId || !Array.isArray(available.appointment_segments)
          || available.appointment_segments.length !== 1) continue;
        const segment = available.appointment_segments[0];
        if (segment.service_variation_id !== resourceId || !ID.test(segment.team_member_id ?? '')
          || teamMemberIds && !teamMemberIds.includes(segment.team_member_id)
          || !Number.isSafeInteger(segment.duration_minutes) || segment.duration_minutes <= 0
          || integer(segment.service_variation_version) === null) continue;
        let slotStart;
        try { slotStart = instant(available.start_at); } catch { continue; }
        const finish = Date.parse(slotStart) + segment.duration_minutes * 60000;
        if (Date.parse(slotStart) < Date.parse(start) || finish > Date.parse(end)) continue;
        const slot = { locationId, resourceId, startAt: slotStart, endAt: new Date(finish).toISOString(),
          durationMinutes: segment.duration_minutes, teamMemberId: segment.team_member_id,
          sourceVersion: integer(segment.service_variation_version) };
        const key = JSON.stringify(slot); if (!seen.has(key)) { seen.add(key); slots.push(slot); }
      }
      return { locationId, resourceId, requestedWindow: { startAt: start, endAt: end },
        queriedWindow: { startAt: start, endAt: queryEnd }, slots, observedAt: now(),
        source: 'SQUARE_SEARCH_AVAILABILITY', capacityReserved: false, bookingConfirmed: false, priceQuoted: false };
    },
    async createBooking({accessToken,idempotencyKey,slot,customer}){
      key(idempotencyKey);if(!plain(customer))fail('BOOKING_CUSTOMER_REQUIRED');
      let customerId=customer.customerId;
      if(customerId)id(customerId);else{
        if(typeof customer.name!=='string'||!customer.name.trim()||customer.name.length>200
          ||typeof customer.phone!=='string'||!/^\+?[0-9 ()-]{7,30}$/u.test(customer.phone))fail('BOOKING_CUSTOMER_PHONE_REQUIRED');
        if(customer.email!==undefined&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(customer.email))fail('BOOKING_CUSTOMER_INVALID');
        const created=await request('/v2/customers',{method:'POST',accessToken,body:{idempotency_key:key('c_'+idempotencyKey.slice(0,43)),
          given_name:customer.name.trim(),phone_number:customer.phone,...(customer.email?{email_address:customer.email}:{})}});
        customerId=id(created.customer?.id);
      }
      return booking(await request('/v2/bookings',{method:'POST',accessToken,body:{idempotency_key:idempotencyKey,
        booking:{customer_id:customerId,customer_note:'Outsider reference: '+idempotencyKey,location_id:id(slot.locationId),start_at:instant(slot.startAt),appointment_segments:[segment(slot)]}}}));
    },
    async reconcileBooking({accessToken,idempotencyKey,slot,externalBookingId}){
      if(externalBookingId)return booking(await request(`/v2/bookings/${id(externalBookingId)}`,{accessToken}));
      const marker='Outsider reference: '+key(idempotencyKey),expected=segment(slot);
      const rows=await pages('/v2/bookings','bookings',accessToken,undefined,{
        location_id:id(slot.locationId),start_at_min:instant(slot.startAt),start_at_max:instant(slot.endAt)});
      const matches=rows.filter(r=>r.customer_note===marker);
      if(matches.length>1)fail('BOOKING_RECONCILIATION_AMBIGUOUS');
      // A missing read cannot prove that a timed-out write did not commit.
      if(!matches.length)return {state:'RECONCILIATION_REQUIRED',observedAt:now(),paymentPerformed:false};
      const row=matches[0],segments=row.appointment_segments;
      if(row.location_id!==slot.locationId||Date.parse(row.start_at)!==Date.parse(slot.startAt)||segments?.length!==1
        ||Object.entries(expected).some(([k,v])=>segments[0][k]!==v))fail('BOOKING_RECONCILIATION_MISMATCH');
      return booking({booking:row});
    },
    async readBooking({accessToken,externalBookingId}){return booking(await request(`/v2/bookings/${id(externalBookingId)}`,{accessToken}));},
    async rescheduleBooking({accessToken,externalBookingId,idempotencyKey,slot}){
      const current=booking(await request(`/v2/bookings/${id(externalBookingId)}`,{accessToken}));
      if(!['CONFIRMED','PROVIDER_APPROVAL_REQUIRED'].includes(current.state))fail('BOOKING_NOT_CHANGEABLE');
      if(current.locationId!==slot.locationId||current.segments.length!==1||current.segments[0].resourceId!==slot.resourceId)fail('BOOKING_SCOPE_CHANGED');
      if(current.startAt===instant(slot.startAt)&&current.endAt===instant(slot.endAt)&&current.segments[0].teamMemberId===slot.teamMemberId)return current;
      return booking(await request(`/v2/bookings/${id(externalBookingId)}`,{method:'PUT',accessToken,body:{idempotency_key:key(idempotencyKey),
        booking:{version:current.version,start_at:instant(slot.startAt),appointment_segments:[segment(slot)]}}}));
    },
    async cancelBooking({accessToken,externalBookingId,idempotencyKey}){
      const current=booking(await request(`/v2/bookings/${id(externalBookingId)}`,{accessToken}));if(current.state==='CANCELLED')return current;
      return booking(await request(`/v2/bookings/${id(externalBookingId)}/cancel`,{method:'POST',accessToken,
        body:{idempotency_key:key(idempotencyKey),booking_version:current.version}}));
    },
  });
}
