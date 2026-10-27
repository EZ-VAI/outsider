/* Follows observed transaction links, never guessed URLs or model endpoints.
 * Reads source-native advertised offers/forms. It does NOT submit an inquiry,
 * book, reserve, accept terms, pay, or turn advertised availability into stock.
 */
import { interfaceDigest } from "./outsider-openapi-demand-matcher.js";
import { createPublicHttpsReadOnlyFetchTransportV1 } from "./outsider-public-https-read-only-fetch-transport-v1.js";
const plainText = s => s.replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "iu"))?.[1] ?? null;
const publicLink = (value, base) => {
  try { const url = new URL(value.replaceAll("&amp;", "&"), base);
    if (url.protocol !== "https:" || url.username || url.password || [...url.searchParams.keys()]
      .some(key => /token|secret|password|email|phone|session|auth|signature/iu.test(key))) return null;
    url.hash = ""; return url.href;
  } catch { return null; }
};
export function extractPublisherCommerce({ url, bytes }) {
  const raw = bytes.toString("utf8"), entries = [], forms = [], advertisedOffers = [];
  for (const m of raw.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
    const href = attr(m[1], "href"), label = plainText(m[2]);
    if (!href || !/\b(?:book(?:ing)?|reserv(?:e|ation)|purchas(?:e|ing)|buy|quote|pricing|availability|developer|api)\b/iu.test(label)) continue;
    const link = publicLink(href, url); if (link && !entries.some(e => e.url === link)) entries.push({ url: link, label: label.slice(0, 160) });
    if (entries.length === 24) break;
  }
  for (const m of raw.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/giu)) {
    const action = attr(m[1], "action"), method = (attr(m[1], "method") ?? "GET").toUpperCase();
    const target = action ? publicLink(action, url) : url;
    if (!target || !["GET", "POST"].includes(method)) continue;
    const fields = [...m[2].matchAll(/<(?:input|select|textarea)\b([^>]*)>/giu)].map(field => attr(field[1], "name")).filter(Boolean);
    forms.push({ action: target, method, fieldNames: [...new Set(fields)].slice(0, 32), valuesOmitted: true });
    if (forms.length === 12) break;
  }
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 12 || advertisedOffers.length >= 32) return;
    if ((value["@type"] === "Offer" || value["@type"] === "AggregateOffer") && (value.price !== undefined || value.lowPrice !== undefined)) {
      advertisedOffers.push({ type: value["@type"], price: String(value.price ?? value.lowPrice).slice(0, 80),
        currency: typeof value.priceCurrency === "string" ? value.priceCurrency.slice(0, 8) : null,
        availabilityClaim: typeof value.availability === "string" ? value.availability.slice(0, 200) : null,
        validUntilClaim: typeof value.priceValidUntil === "string" ? value.priceValidUntil.slice(0, 40) : null,
        basis: "PUBLISHER_ADVERTISEMENT_NOT_ORDER_QUOTE", capacityReserved: false });
    }
    for (const child of Object.values(value)) if (typeof child === "object") visit(child, depth + 1);
  };
  for (const m of raw.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try { visit(JSON.parse(m[1])); } catch { /* No executable script evaluation. */ }
  }
  return { sourceHash: interfaceDigest(bytes), entries, forms, advertisedOffers };
}
export async function preflightPublisherTransactions({ candidates, readSource, writeRecord,
  fetchImpl = createPublicHttpsReadOnlyFetchTransportV1({ maximumResponseBytes: 2 * 1024 * 1024, timeoutMs: 10000 }), maximumReads = 4 }) {
  if (!Number.isInteger(maximumReads) || maximumReads < 0 || maximumReads > 8) throw new Error("COMMERCE_PREFLIGHT_BUDGET_INVALID");
  const selected = [], seen = new Set();
  for (const candidate of candidates.filter(c => ["RESOURCE_SELLER", "INTERFACE_PLATFORM"].includes(c.kind) && c.requirementIds.length)) {
    const bytes = await readSource(candidate);
    if (interfaceDigest(bytes) !== candidate.sourceHash) throw new Error("COMMERCE_PARENT_SOURCE_MISMATCH");
    const commerce = extractPublisherCommerce({ url: candidate.sourceUrl, bytes });
    const entry = commerce.entries.find(e => !seen.has(e.url) && e.url !== candidate.sourceUrl);
    if (entry && selected.length < maximumReads) { selected.push({ candidate, entry }); seen.add(entry.url); }
  }
  const started = Date.now(); let calls = 0;
  const rows = await Promise.all(selected.map(async ({ candidate, entry }, index) => {
    try {
      calls++;
      const response = await fetchImpl(entry.url, { method: "GET", headers: { Accept: "text/html, application/json" },
        credentials: "omit", redirect: "error", signal: AbortSignal.timeout(11000) });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 2 * 1024 * 1024) throw new Error("PREFLIGHT_RESPONSE_TOO_LARGE");
      const chunks = [];
      for (let offset = 0; offset < bytes.length; offset += 384 * 1024) {
        const name = `commerce-${index}-chunk-${chunks.length}`; chunks.push(name);
        await writeRecord(name, { base64: bytes.subarray(offset, offset + 384 * 1024).toString("base64") });
      }
      const commerce = response.status === 200 ? extractPublisherCommerce({ url: entry.url, bytes }) : null;
      const row = { parentSourceHash: candidate.sourceHash, requirementIds: candidate.requirementIds,
        url: entry.url, method: "GET", status: response.status, responseBytes: bytes.length, sourceHash: interfaceDigest(bytes),
        observedAt: new Date().toISOString(), chunks, commerce,
        state: response.status === 200 ? "TRANSACTION_PAGE_OBSERVED_NOT_QUOTED" : "TRANSACTION_ENTRY_READ_FAILED",
        signedOffer: null, reservation: null, responsibilityAcceptance: null };
      await writeRecord(`commerce-${index}`, row); return row;
    } catch { return { parentSourceHash: candidate.sourceHash, requirementIds: candidate.requirementIds,
      state: "TRANSACTION_ENTRY_READ_FAILED", signedOffer: null, reservation: null, responsibilityAcceptance: null }; }
  }));
  return { schema: "outsider/publisher-commerce-preflight/v1", rows,
    metrics: { actualReads: calls, responseBytes: rows.reduce((sum, r) => sum + (r.responseBytes ?? 0), 0), elapsedMs: Date.now() - started },
    signedOffers: 0, reservations: 0, transactionSubmitted: false, paymentPerformed: false };
}
