/* Global catalog is a protocol source, not a curated merchant database. Never
 * write its results or images to disk. Only selected variant references enter
 * buyer requests; prices and names in saved output come from merchant carts. */
import { createShopifyUcpClient, SHOPIFY_CATALOG_ORIGIN } from './outsider-shopify-ucp-client.js';
import { wooCommerceStoreOrigin } from './outsider-woocommerce-buyer-transport.js';
const words = text => String(text).toLowerCase().match(/[a-z0-9]+/gu) ?? [];
export async function discoverShopifyProducts({ search, quantity, currency, maximumTotalMinor, country,
  profileUrl, fetchImpl, onReceipt, maximumCandidates = 2, quoteReadyOrigins = [], deliveryDeadline,
  excludedVariants = [] }) {
  const client = createShopifyUcpClient({ origin: SHOPIFY_CATALOG_ORIGIN, profileUrl, fetchImpl, onReceipt });
  // Search planning only, not an invented shipping quote. Leave budget for
  // tax/fulfillment; prefer domestic inventory for short delivery deadlines.
  const productCeilingMinor=Math.floor(Number(maximumTotalMinor)*0.6/quantity);
  const domesticFirst=Number.isFinite(Date.parse(deliveryDeadline))&&Date.parse(deliveryDeadline)-Date.now()<=7*86400000;
  const value = await client.call('search_catalog', { catalog: { query: search,
    context: { address_country: country, currency }, filters: { available: true, ships_to: { country },
      ...(domesticFirst?{ships_from:[{country}]}:{}),price: { max: productCeilingMinor } }, pagination: { limit: 10 } } });
  const terms = words(search), scored = [];
  for (const product of value.products ?? []) for (const variant of product.variants ?? []) {
    if (!variant.availability?.available || variant.price?.currency !== currency || !Number.isSafeInteger(variant.price?.amount)
      || variant.price.amount < 0 || BigInt(variant.price.amount) * BigInt(quantity) > BigInt(maximumTotalMinor)
      || !/^gid:\/\/shopify\/ProductVariant\/[1-9][0-9]*$/u.test(variant.id ?? '')) continue;
    // Use merchant variant text, not Catalog's AI-inferred technical claims.
    const title = words(variant.title), text = words(`${variant.title} ${variant.description?.plain ?? ''}`);
    if (!terms.some(t => title.includes(t)) || terms.filter(t => text.includes(t)).length < Math.min(2, terms.length)) continue;
    if (quantity === 1 && /\bwholesale\b/iu.test(variant.seller?.name ?? '')) continue;
    if (/\b(set of|pack of|personalized|customized)\b/iu.test(variant.title) && !/\b(set|pack|personalized|customized)\b/iu.test(search)) continue;
    try {
      const storeUrl = wooCommerceStoreOrigin(variant.seller.url), productUrl = new URL(variant.url);
      if (productUrl.origin !== storeUrl) continue;
      if(excludedVariants.some(v=>v.storeUrl===storeUrl&&v.variantId===variant.id))continue;
      const score = terms.filter(t => title.includes(t)).length * 5 - title.filter(t => !terms.includes(t)).length * 0.5;
      scored.push({ storeUrl, variantId: variant.id, score, price: variant.price.amount,
        discovery: 'SHOPIFY_GLOBAL_CATALOG_FRESH', nativeCheckoutAdvertised: variant.eligible?.native_checkout === true });
    } catch { /* Malformed seller references cannot form a native transaction. */ }
  }
  // Among actual matching results, a route with scoped quote consent can close
  // delivery terms now. This never inserts a merchant absent from the catalog.
  scored.sort((a,b) => Number(quoteReadyOrigins.includes(b.storeUrl))-Number(quoteReadyOrigins.includes(a.storeUrl))
    || b.score - a.score || a.price - b.price || a.storeUrl.localeCompare(b.storeUrl));
  const seen = new Set(), candidates = [];
  for (const { price, score, ...candidate } of scored) {
    if (seen.has(candidate.storeUrl)) continue;
    seen.add(candidate.storeUrl); candidates.push(candidate);
    if (candidates.length === maximumCandidates) break;
  }
  return { candidates, observation: { returnedProducts: value.products?.length ?? 0,
    returnedVariants: (value.products ?? []).reduce((n,p)=>n+(p.variants?.length ?? 0),0),
    selectedMerchantCount: candidates.length, catalogResultsCached: false, personalLocationSent: false,
    productCeilingMinor,domesticInventoryFilter:domesticFirst,shippingAllowanceIsHeuristic:true }, metrics: client.metrics() };
}
