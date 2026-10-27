/* Native, anonymous BUYER discovery/price-preview routes observed in the
 * provider's public application. No member endpoints, payment or booking route.
 * POST below is a search/price computation, not an order or capacity lock.
 */
import { interfaceDigest } from "./outsider-openapi-demand-matcher.js";
const ORIGIN = "https://api-gateway.industriousoffice.com";
export function createIndustriousBuyerDiscoveryAdapter({ fetchImpl = globalThis.fetch, sourceBindings, onReceipt = async () => {} } = {}) {
  if (!sourceBindings || !["configurationHash", "discoveryImplementationHash"].every(k => /^sha256:[a-f0-9]{64}$/u.test(sourceBindings[k] ?? "")))
    throw new Error("INDUSTRIOUS_IMPLEMENTATION_SOURCE_REQUIRED");
  async function read(operation, pathname, body, method = "POST") {
    const started = Date.now(), request = { operation, url: `${ORIGIN}${pathname}`, method, body: body ?? null };
    const response = await fetchImpl(request.url, { method, headers: { Accept: "application/json", "Accept-Language": "en",
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024) throw new Error("INDUSTRIOUS_RESPONSE_TOO_LARGE");
    let data = null; try { data = JSON.parse(bytes); } catch { /* Preserve source status without inventing a result. */ }
    const receipt = { schema: "outsider/industrious-buyer-source/v1", request, requestHash: interfaceDigest(request),
      sourceBindings, status: response.status, sourceHash: interfaceDigest(bytes), bytes: bytes.length,
      observedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
      anonymousBuyer: true, transactionSubmitted: false, capacityReserved: false, responsibilityAccepted: false };
    await onReceipt(receipt, bytes);
    return { receipt, data, state: response.status === 200 && data !== null ? "OBSERVED" : response.status === 401 || response.status === 403 ? "ACCESS_UNAVAILABLE" : "SOURCE_READ_FAILED" };
  }
  const slug = (value, nested = false) => { if (typeof value !== "string" || value.length > 200 || !value.split("/").every(part => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u.test(part))
    || value.split("/").length > (nested ? 2 : 1)) throw new Error("INDUSTRIOUS_RESOURCE_SLUG_INVALID"); return value; };
  return Object.freeze({
    searchLocations({ text, limit = 3 }) {
      if (typeof text !== "string" || !text.trim() || text.length > 100 || !Number.isInteger(limit) || limit < 1 || limit > 5) throw new Error("INDUSTRIOUS_LOCATION_QUERY_INVALID");
      return read("SEARCH_LOCATIONS", "/inventory/v1.1.0/discovery/locations/all?responseType=full", { text, limit, withOnlineMeetingRoomReservation: true });
    },
    location(resourceSlug) { return read("READ_LOCATION", `/inventory/v1.1.0/discovery/locations/${slug(resourceSlug)}`, null, "GET"); },
    meetingRoom(resourceSlug) { return read("READ_MEETING_ROOM", `/inventory/v1.1.0/discovery/meeting-rooms/${slug(resourceSlug, true)}`, null, "GET"); },
    searchMeetingRooms({ within, nearTo, seats, dateRange }) {
      for (const point of [within?.northEastPoint, within?.southWestPoint, nearTo]) if (!point || !Number.isFinite(point.latitude)
        || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) throw new Error("INDUSTRIOUS_SEARCH_AREA_INVALID");
      return read("SEARCH_MEETING_ROOMS", "/inventory/v1.1.0/discovery/meeting-rooms/search", { within, nearTo,
        ...(seats ? { seats } : {}), ...(dateRange ? { dateRange } : {}) });
    },
    coworkingDayPassPreview({ locationId, nbDays, localStartDate, localEndDate }) {
      if (!Number.isInteger(nbDays) || nbDays < 1 || nbDays > 7) throw new Error("INDUSTRIOUS_DAY_PASS_DAYS_INVALID");
      return read("DAY_PASS_PRICE_PREVIEW", `/pricing/v1.1.0/discovery/locations/${slug(locationId)}/coworking-day-pass/preview`,
        { nbDays, localStartDate, localEndDate });
    },
    meetingRoomAvailability({ id, day }) {
      if (!/^\d{4}-\d\d-\d\d$/u.test(day ?? "")) throw new Error("INDUSTRIOUS_AVAILABILITY_DAY_INVALID");
      return read("MEETING_ROOM_AVAILABILITY", `/reservation/v1.1.0/meeting-rooms/${slug(id)}/search-availabilities`, { day });
    },
    meetingRoomPrices({ slugs, localStartDate, localEndDate }) {
      if (!Array.isArray(slugs) || !slugs.length || slugs.length > 5) throw new Error("INDUSTRIOUS_PRICE_RESOURCES_INVALID");
      return read("MEETING_ROOM_PRICE_DISCOVERY", "/pricing/v1.1.0/discovery/meeting-rooms", {
        slugs: slugs.map(value => slug(value, true)), ...(localStartDate && localEndDate ? { localStartDate, localEndDate } : {}), withTaxes: false });
    },
    meetingRoomPreview({ resourceSlug, duration, localStartDate, localEndDate }) {
      if (!duration || !["Hour", "Day"].includes(duration.type) || !Number.isFinite(duration.value) || duration.value <= 0 || duration.value > 24 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/u.test(localStartDate ?? "")
        || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/u.test(localEndDate ?? "")) throw new Error("INDUSTRIOUS_PREVIEW_WINDOW_INVALID");
      return read("MEETING_ROOM_PRICE_PREVIEW", `/pricing/v1.1.0/discovery/meeting-rooms/${slug(resourceSlug, true)}/preview`,
        { ...(duration !== undefined ? { duration } : {}), localStartDate, localEndDate });
    },
  });
}
