/* Open internet discovery is a source acquisition stage, not supplier admission.
 * Search leases are consumed in memory. Durable URLs/text below come only from
 * fresh publisher responses, privately retained for replay. No form is submitted.
 */
import { randomBytes } from "node:crypto";
import { createOpenDemandDiscoveryBridge } from "./outsider-open-demand-discovery-bridge.js";
import { compileBraveProductionProbeInputV1 } from "./outsider-brave-production-probe-input-compiler-v1.js";
import { createPublicHttpsReadOnlyFetchTransportV1 } from "./outsider-public-https-read-only-fetch-transport-v1.js";
import { interfaceDigest, indexOpenApiOperations } from "./outsider-openapi-demand-matcher.js";

const text = s => s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ").replace(/<[^>]*>/gu, " ")
  .replace(/\s+/gu, " ").trim();
const unescapeAttribute = s => s.replace(/&(?:amp|quot|apos|lt|gt|#(?:x[a-f0-9]+|[0-9]+));/giu, entity => {
  const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
  if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
  const code = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
});
// Ordinary providers often link to a different booking host or use query IDs.
// Keep only observed anchors here. A form action is never a page to GET.
function publisherNavigation(raw, sourceUrl) {
  const result = [];
  const markup = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, '').replace(/<!--[\s\S]*?-->/gu, '');
  for (const match of markup.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/giu)) {
    const href = /\bhref\s*=\s*["']([^"']+)["']/iu.exec(match[1])?.[1];
    if (!href) continue;
    try {
      const target = new URL(unescapeAttribute(href), sourceUrl);
      if (target.protocol !== 'https:' || target.username || target.password) continue;
      target.hash = '';
      const label = text(unescapeAttribute(match[2])).slice(0, 250), description = `${label} ${target.pathname}`;
      // Navigation only: never follow account/effect actions found on a page.
      if (/(?:logout|sign.?out|unsubscribe|delete|remove|cancel|checkout|purchase|pay.?now|confirm)/iu.test(description)
        || [...target.searchParams.keys()].some(key => /^(?:action|token|auth|code|session|password|key|secret)$/iu.test(key))) continue;
      const purpose = /\/(?:agent-card|agent|openapi|swagger)[^/]*\.json$/iu.test(target.pathname) ? 'INTERFACE'
        : /(?:\b(?:book|reserve|reservation|schedule|availability)\b|booking|预约|预订)/iu.test(description) ? 'BOOKING'
        : /(?:\b(?:price|prices|pricing|rates|rate|costs|fees)\b|价格|费用)/iu.test(description) ? 'PRICING'
        : /(?:\b(?:contact|enquir|inquir)|联系|咨询)/iu.test(description) ? 'CONTACT' : null;
      if (!purpose || target.href === new URL(sourceUrl).href || result.some(row => row.url === target.href)) continue;
      result.push({ url: target.href, label, purpose });
      if (result.length === 24) break;
    } catch { /* Not a readable public anchor. */ }
  }
  return result;
}
const navigationWords = value => new Set(String(value).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
function rankPublisherEntries(entries, card, requirement) {
  const context = navigationWords([card.title, new URL(card.url).pathname, requirement?.outcome,
    ...(requirement?.discoveryQueries ?? [])].filter(Boolean).join(' '));
  const generic = new Set(['the','and','for','with','your','from','this','that','service','services',
    'book','booking','price','prices','rates','resource','resources','contact','now']);
  return entries.map(entry => {
    const url = new URL(entry.url), words = navigationWords(`${entry.label} ${url.pathname} ${[...url.searchParams.values()].join(' ')}`);
    let score = [...words].filter(word => context.has(word) && !generic.has(word)).length * 3;
    if (url.pathname === '/' && url.origin === new URL(card.url).origin) score -= 8;
    if (/\/(?:blog|insights|news|articles?)(?:\/|$)/iu.test(url.pathname)) score -= 12;
    if (entry.purpose === 'PRICING' && /\/(?:prices?|pricing|rates?|fees)(?:\/|$)/iu.test(url.pathname)) score += 6;
    if (entry.purpose === 'BOOKING' && (url.origin !== new URL(card.url).origin || url.pathname !== '/')) score += 2;
    return {entry,score};
  }).sort((a,b)=>b.score-a.score);
}
export function describePublisherResponse({ url, bytes, status, contentType, observedAt }) {
  const raw = bytes.toString("utf8"), sourceHash = interfaceDigest(bytes);
  const source = { url, contentHash: sourceHash, bytes: bytes.length, status, contentType, observedAt,
    revisionKind: "EXACT_RESPONSE_CONTENT_HASH_NOT_RELEASE_PIN", use: "PRIVATE_INTERFACE_RESEARCH_NOT_NETWORK_PUBLICATION" };
  let document; try { document = JSON.parse(raw); } catch { /* HTML is normal. */ }
  let catalog = null;
  if (status === 200 && /^3\./u.test(document?.openapi)) catalog = indexOpenApiOperations({ document, source });
  const links = [], contactLinks = [];
  if (status === 200 && !document) for (const match of raw.matchAll(/\b(?:href|action)\s*=\s*["']([^"']+)["']/giu)) {
    try {
      const target = new URL(unescapeAttribute(match[1]), url);
      if (target.protocol === 'mailto:' && !target.hash
        && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(target.pathname)) {
        // Subject/body parameters are publisher suggestions, not authorized
        // message content. Only the single public address enters inquiries.
        target.search = '';
        if (contactLinks.length < 8 && !contactLinks.includes(target.href)) contactLinks.push(target.href);
        continue;
      }
      if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash) continue;
      if (!/(?:api|swagger|openapi|developer|pricing|quote|book|marketplace|agent-card|agent\.json|contact|request|services)/iu.test(target.pathname)) continue;
      if (links.length < 24 && !links.includes(target.href)) links.push(target.href);
    } catch { /* Not a usable link. */ }
  }
  return { source, catalog, document: catalog ? document : null,
    card: { sourceHash, url, status, observedAt, title: catalog?.title ?? text(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? "").slice(0, 250),
      excerpt: status === 200 ? text(raw).slice(0, 9000) : "", links,
      ...(status === 200 && !document ? { navigationLinks: publisherNavigation(raw, url) } : {}),
      ...(contactLinks.length ? { contactLinks } : {}),
      evidenceKind: catalog ? "PUBLISHER_OPENAPI" : document?.name && Array.isArray(document.skills)
        && (Array.isArray(document.supportedInterfaces) || document.protocolVersion === '0.3.0')
        ? 'PUBLISHER_A2A_AGENT_CARD' : "PUBLISHER_PAGE",
      quoteEstablished: false, capacityReserved: false, responsibilityAccepted: false } };
}

export async function discoverDemandWebSources({ graph, plan, reference, apiToken, maximumSearches = 8,
  maximumObservationsPerSource = 2, includeDocumentationUrls = false, prioritizeUnmetWork = false,
  searchFetch = globalThis.fetch,
  publisherFetch = createPublicHttpsReadOnlyFetchTransportV1({ maximumResponseBytes: 2 * 1024 * 1024, timeoutMs: 10000 }),
  writeRecord = async () => {}, clock = () => new Date().toISOString() }) {
  if (!Number.isInteger(maximumSearches) || maximumSearches < 1 || maximumSearches > 8) throw new Error("WEB_DISCOVERY_BUDGET_INVALID");
  const selected = [], seen = new Set();
  // A bounded run must still search for recovery and independent acceptance.
  for (const purpose of prioritizeUnmetWork ? [] : ["WITNESS", "RECOVERY"]) {
    const p = plan.queries.find(p => p.provider === "BRAVE" && p.purpose === purpose);
    if (p && !seen.has(p.query) && selected.length < maximumSearches) { selected.push(p); seen.add(p.query); }
  }
  // Search prerequisites before their downstream receipts. For a room booking,
  // finding a room must not lose half its small budget to a generic search for
  // confirmation APIs. Independent needs still share each group's searches.
  const groups = prioritizeUnmetWork ? [graph.requirements.filter(r => !r.dependsOn?.length),
    graph.requirements.filter(r => r.dependsOn?.length)] : [graph.requirements];
  for (const requirements of groups) for (let i = 0; i < 4; i++) for (const r of requirements) {
    const queries = plan.queries.filter(p => p.provider === "BRAVE" && p.requirementId === r.id);
    if (prioritizeUnmetWork) queries.sort((a, b) => Number(a.purpose !== 'PRIMARY') - Number(b.purpose !== 'PRIMARY'));
    const p = queries[i];
    if (p && !seen.has(p.query) && selected.length < maximumSearches) { selected.push(p); seen.add(p.query); }
  }
  const started = Date.now(), observations = [], sourceProjections = [], fetched = new Map(), sourceNeeds = new Map();
  let searchCalls = 0, publisherCalls = 0;
  const acquire = (url, requirementId) => {
    if (requirementId) sourceNeeds.set(url, new Set([...(sourceNeeds.get(url) ?? []), requirementId]));
    const track=observed=>{if(observed&&requirementId)sourceNeeds.set(observed.card.url,
      new Set([...(sourceNeeds.get(observed.card.url)??[]),requirementId]));return observed;};
    if (fetched.has(url)) return fetched.get(url).then(track);
    const promise = (async () => {
      let target = new URL(url); const origin = target.origin;
      if (target.protocol !== "https:" || target.username || target.password) return null;
      for (let redirect = 0; redirect < 3; redirect++) {
        publisherCalls++;
        const response = await publisherFetch(target.href, { method: "GET", headers: { Accept: "text/markdown, application/json;q=0.9, text/html;q=0.8" },
          credentials: "omit", redirect: "error", signal: AbortSignal.timeout(11000) });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location"); if (!location) return null;
          const next = new URL(location, target);
          if (next.protocol !== 'https:' || next.username || next.password || !includeDocumentationUrls && next.origin !== origin) return null;
          target = next; continue;
        }
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 2 * 1024 * 1024) throw new Error("PUBLISHER_RESPONSE_TOO_LARGE");
        const observed = describePublisherResponse({ url: target.href, bytes, status: response.status,
          contentType: response.headers.get("content-type"), observedAt: clock() });
        const key = interfaceDigest({ url: target.href, sourceHash: observed.source.contentHash }).slice(7);
        const chunks = [];
        for (let offset = 0; offset < bytes.length; offset += 384 * 1024) {
          const chunk = `publisher-${key}-chunk-${chunks.length}`; chunks.push(chunk);
          await writeRecord(chunk, { base64: bytes.subarray(offset, offset + 384 * 1024).toString("base64") });
        }
        await writeRecord(`publisher-${key}`, { source: observed.source, chunks });
        observations.push(observed); return observed;
      }
      return null;
    })().catch(() => null);
    fetched.set(url, promise); return promise.then(track);
  };
  async function readPublisherEntries(observed, requirementId) {
    if (!observed || observed.card.status !== 200) return;
    const interfaceLinks = includeDocumentationUrls ? (observed.card.navigationLinks ?? []).filter(row => row.purpose === 'INTERFACE').map(row => row.url) : observed.card.links;
    const schema = interfaceLinks.find(link => new URL(link).origin === new URL(observed.source.url).origin
      && /(?:openapi|swagger)[^/]*\.json$/iu.test(new URL(link).pathname));
    if (schema) await acquire(schema, requirementId);
    if (!includeDocumentationUrls) return;
    const entries = [], observedLinks = observed.card.navigationLinks ?? [];
    const ranked = rankPublisherEntries(observedLinks, observed.card, graph.requirements.find(row=>row.id===requirementId));
    // At most two additional pages, one per purpose. Follow an external
    // booking host only when linked by this freshly read publisher. The
    // existing public HTTPS transport still resolves/rejects private hosts.
    for (const purpose of ['PRICING', 'BOOKING', 'CONTACT']) {
      if (purpose === 'CONTACT' && observed.card.contactLinks?.length) continue;
      const candidate = ranked.find(row => row.entry.purpose === purpose && row.entry.url !== schema && row.score >= 0);
      if (candidate && entries.length < 2) entries.push(candidate.entry.url);
    }
    const legacy = interfaceLinks.find(link => new URL(link).origin === new URL(observed.source.url).origin
      && /\/(?:agent-card|agent)\.json$/iu.test(new URL(link).pathname));
    if (legacy && legacy !== schema && !entries.includes(legacy) && entries.length < 2) entries.push(legacy);
    await Promise.all(entries.map(entry => acquire(entry, requirementId)));
  }
  if (includeDocumentationUrls) {
    const hints = graph.requirements.flatMap(row => (row.candidateDocumentationUrls ?? []).map(url => ({url, requirementId: row.id}))).slice(0, 8);
    await Promise.all(hints.map(async row => readPublisherEntries(await acquire(row.url, row.requirementId), row.requirementId)));
  }
  const bridge = createOpenDemandDiscoveryBridge({ braveApiToken: apiToken, allowBillableSearch: true,
    maximumObservationsPerSource,
    fetchImpl: (...args) => { searchCalls++; return searchFetch(...args); },
    planSources: job => selected.filter(p => p.requirementId === job.requirementIds[0] && p.query === job.query),
    bindRequirement: async ({ plan: p }) => {
      const now = clock(), scoped = { ...reference.references, requestScopeRefHash: `sha256:${randomBytes(32).toString("hex")}`,
        workOrderHash: interfaceDigest({ kind: "RESEARCH_DEMAND_NOT_TRANSACTION", graphHash: interfaceDigest(graph), requirementId: p.requirementId }) };
      const binding = compileBraveProductionProbeInputV1({ requestId: `web_${interfaceDigest(p).slice(7, 39)}`, query: p.query,
        currentTime: now, formationDeadline: new Date(Date.parse(now) + 300000).toISOString(),
        completionDeadline: new Date(Date.parse(now) + 600000).toISOString(), references: scoped, exactCallerContactAuthorityRefHash: null });
      return { tender: binding.tender, requirementKind: binding.tenderRequirement.kind, requirementId: binding.tenderRequirement.requirementId,
        asOf: binding.asOf, expiresAt: binding.query.expiresAt, privateBindingNonce: binding.nonces.discoveryPrivateBindingNonce };
    },
    onSourceProjection: async row => { sourceProjections.push(row); await writeRecord(`search-${sourceProjections.length}`, row); },
    observeCandidate: async ({ candidate, requirementId }) => {
      const observed = await acquire(candidate.sellerUrl, requirementId); if (!observed) return null;
      await readPublisherEntries(observed, requirementId);
      return { sourceHash: observed.source.contentHash, freshSourceObserved: true };
    } });
  let cursor = 0; const jobs = new Array(selected.length);
  await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
    while (cursor < selected.length) { const i = cursor++, p = selected[i];
      jobs[i] = { requirementId: p.requirementId, purpose: p.purpose, queryHash: interfaceDigest(p.query),
        result: await bridge({ query: p.query, requirementIds: [p.requirementId] }) }; }
  }));
  const result = { schema: "outsider/open-web-demand-sources/v1", graphHash: interfaceDigest(graph), jobs,
    cards: observations.map(o => ({...o.card, ...(includeDocumentationUrls ? {
      requirementIds: [...(sourceNeeds.get(o.card.url) ?? [])] } : {})})), catalogs: observations.flatMap(o => o.catalog ? [o.catalog] : []),
    metrics: { searchCalls, publisherCalls, freshPublisherResponses: observations.length,
      successfulPublisherResponses: observations.filter(o => o.source.status === 200).length,
      sourceBytes: observations.reduce((sum, o) => sum + o.source.bytes, 0), elapsedMs: Date.now() - started },
    referenceMode: "CALLER_SUPPLIED_RESEARCH_LINEAGE_NOT_AUTHORITY", transactionSubmitted: false,
    pendingQueries: plan.queries.filter(p => !selected.includes(p)), financialMode: "SIMULATION_ONLY" };
  await writeRecord("web-sources", result); return result;
}
