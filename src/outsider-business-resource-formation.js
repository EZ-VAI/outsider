/* Preparation for business resources shares the existing buyer transaction
 * service. A model supplies requirements, never vendors, prices or authority.
 * No reservation POST is issued by this module. */
import { publicDatasetHash as digest } from "./outsider-public-dataset.js";
import { createNativeResourceQuoteService, loadNativeBuyerSources } from "./outsider-native-resource-quote-service.js";
import { loadMarketplaceBuyerSources } from "./outsider-marketplace-resource-candidates.js";
import { loadLiquidSpaceBuyerConnection } from "./outsider-liquidspace-buyer-connection.js";

export const BUSINESS_RESOURCE_CAPABILITY = "MEETING_SPACE_BOOKING";
export const BUSINESS_RESOURCE_REQUEST_SCHEMA = { type: "object", additionalProperties: false,
  required: ["requirementId", "resourceKind", "city", "localStartDate", "localEndDate", "minimumSeats", "maximumSeats"],
  properties: { requirementId: { type: "string" }, resourceKind: { type: "string", const: "MEETING_SPACE" }, city: { type: "string" },
    localStartDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:00$",
      description: "One candidate session's start, YYYY-MM-DDTHH:mm:00 in the city's local time. Never a date-only value or the first day of a date range." },
    localEndDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:00$",
      description: "The same candidate session's end on the same local day, 30-minute increments and 30–720 minutes after its start. Never the last day of a flexible date range." },
    minimumSeats: { type: "integer", minimum: 1, maximum: 100 }, maximumSeats: { type: "integer", minimum: 1, maximum: 100 } } };
export const BUSINESS_RESOURCE_PREPARATION_CONTRACT = {
  capability: BUSINESS_RESOURCE_CAPABILITY, category: "BUSINESS_RESOURCE", phase: "TRANSACTION_PREPARATION_ONLY",
  description: "Find physical meeting rooms through installed public buyer interfaces and obtain this window's actual booking-cost, availability and seller prerequisite receipts. NOT an executable reservation contract: keep this need unresolved until accepted capacity and fulfillment exist. Never substitute an owner test calendar hold. Extract city, local date/time and seat range from the goal. For explicitly flexible dates, one permitted session may be queried as a candidate; preserve the full allowed range in the goal and keep other dates available if it fails. Flexibility is not missing user information. Use full local timestamps for that one session, not the range's boundary dates. Emit no resourceRequest when these adapter inputs cannot be formed; ordinary venue pages and contact routes remain available. Resource requests are reads, not payment authorization.",
  inputSchema: BUSINESS_RESOURCE_REQUEST_SCHEMA,
};
export function normalizeBusinessResourceRequests(rows, graph) {
  if (!Array.isArray(rows) || rows.length > 2) throw new Error("BUSINESS_RESOURCE_REQUESTS_INVALID");
  const seen = new Set();
  return rows.map(row => {
    if (!row || Object.keys(row).sort().join(",") !== "city,localEndDate,localStartDate,maximumSeats,minimumSeats,requirementId,resourceKind"
      || seen.has(row.requirementId) || !graph.requirements.some(n => n.id === row.requirementId
        && [BUSINESS_RESOURCE_CAPABILITY, 'PARTICIPANT_WORK_V1'].includes(n.capability))
      || row.resourceKind !== "MEETING_SPACE" || typeof row.city !== "string" || !row.city.trim() || row.city.length > 100
      || ![row.minimumSeats, row.maximumSeats].every(n => Number.isInteger(n) && n > 0 && n <= 100)
      || row.minimumSeats > row.maximumSeats) throw new Error("BUSINESS_RESOURCE_REQUEST_INVALID");
    for (const key of ["localStartDate", "localEndDate"]) {
      const value = row[key];
      if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:00$/u.test(value ?? "") || !Number.isFinite(Date.parse(`${value}Z`))
        || new Date(`${value}Z`).toISOString().slice(0, 19) !== value) throw new Error("BUSINESS_RESOURCE_WINDOW_INVALID");
    }
    const minutes = (Date.parse(`${row.localEndDate}Z`) - Date.parse(`${row.localStartDate}Z`)) / 60000;
    if (minutes < 30 || minutes > 720 || minutes % 30 || row.localStartDate.slice(0, 10) !== row.localEndDate.slice(0, 10))
      throw new Error("BUSINESS_RESOURCE_WINDOW_INVALID");
    seen.add(row.requirementId); return { ...row, city: row.city.trim() };
  });
}

export async function prepareBusinessResourceDemands({ request, graph, resourceRequests, sources, profile, directory,
  serviceFactory = createNativeResourceQuoteService }) {
  const rows = normalizeBusinessResourceRequests(resourceRequests, graph), graphHash = digest(graph), demands = [];
  if (!rows.length) return { demands, metrics: { apiCalls: 0, bytes: 0, elapsedMs: 0 } };
  const started = Date.now();
  if (!profile?.resourceQuoteProfileFile || !profile.marketplaceQuoteProfileFile) return {
    demands: rows.map(row => ({ requirementId: row.requirementId, state: "TRANSACTION_PREPARATION_NOT_CONNECTED" })),
    metrics: { apiCalls: 0, bytes: 0, elapsedMs: Date.now() - started } };
  const sellerSources = (sources.cards ?? []).filter(card => {
    try { return card.status === 200 && ["www.industriousoffice.com", "liquidspace.com", "www.liquidspace.com"].includes(new URL(card.url).hostname); }
    catch { return false; }
  });
  const service = serviceFactory({ directory, sources: loadNativeBuyerSources(profile.resourceQuoteProfileFile),
    marketplaceSources: loadMarketplaceBuyerSources(profile.marketplaceQuoteProfileFile),
    buyerConnection: loadLiquidSpaceBuyerConnection(profile.buyerConnectionProfileFile) });
  try {
    for (const row of rows) {
      if (!sellerSources.length) { demands.push({ requirementId: row.requirementId, state: "BUSINESS_INTERFACE_NOT_OBSERVED" }); continue; }
      const { requirementId, ...query } = row;
      const formationRef = { taskRequestHash: digest(request), graphHash, requirementId };
      const quote = await service.createFromFormation({ ...query, requestId: `open_market_${digest(formationRef).slice(7, 39)}`, formationRef }, {
        graph, publisherSources: sellerSources.map(({ url, sourceHash }) => ({ url, sourceHash })) });
      const preparations = [];
      for (const candidate of (quote.marketplaceAlternatives?.candidates ?? []).filter(c => c.availabilityObserved).slice(0, 2)) {
        const prepared = await service.prepareTransaction({ quoteId: quote.quoteId, resourceId: candidate.resourceId,
          requestId: `open_preflight_${digest({ formationRef, resourceId: candidate.resourceId }).slice(7, 39)}` });
        preparations.push({ ...prepared, operatorDisplayName: candidate.operatorDisplayName, sourceUrl: candidate.sourceUrl,
          seats: candidate.seats, venueId: candidate.venueId, independentOwnershipVerified: false,
          lifecycleReference: { preparationId: prepared.preparationId, request: "resource-transaction",
            supportedActions: ["SUBMIT", "INSPECT", "CANCEL"], authorityGrantedByReference: false } });
      }
      preparations.sort((a, b) => (a.price?.total ?? Infinity) - (b.price?.total ?? Infinity));
      demands.push({ requirementId, formationRef, state: preparations.length ? "SELLER_TRANSACTION_PREPARATIONS_AVAILABLE_NOT_RESERVED" : quote.state,
        requested: query, quoteId: quote.quoteId, quoteHash: digest(quote), quoteMetrics: { apiCalls: quote.apiCalls, bytes: quote.bytes, elapsedMs: quote.elapsedMs },
        quoteReason: quote.reason, preparations, selectionPolicy: "OBSERVED_ALL_IN_PRICE_ASCENDING_NOT_COMMITTED_MAIN_OR_RECOVERY",
        totalBudgetAvailableMinor: request.budget?.maximumAmountMinor ?? null,
        priceIsNotPaymentAuthority: true, capacityReserved: false, transactionSubmitted: false,
        graphNodeRemainsUnresolved: true, actualBusinessOutcomeDelivered: false });
    }
  } finally { await service.close(); }
  return { schema: "outsider/business-resource-formation/v1", graphHash, demands,
    metrics: { apiCalls: demands.reduce((n, d) => n + (d.quoteMetrics?.apiCalls ?? 0) + (d.preparations ?? []).reduce((s, p) => s + p.apiCalls, 0), 0),
      bytes: demands.reduce((n, d) => n + (d.quoteMetrics?.bytes ?? 0) + (d.preparations ?? []).reduce((s, p) => s + p.bytes, 0), 0), elapsedMs: Date.now() - started },
    requestOrigin: "PRODUCT_COMPILED_DEMAND_NOT_MANUAL_QUOTE_CHAIN", paymentPerformed: false };
}
