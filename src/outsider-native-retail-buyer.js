/* Shared by transaction preparation and the original fulfillment executor. */
import { createWooCommerceBuyerTransaction } from './outsider-woocommerce-buyer-transaction.js';
import { createShopifyUcpBuyerTransaction, SHOPIFY_BUYER_PROTOCOL } from './outsider-shopify-ucp-buyer-transaction.js';
import { createShopifyOrderAccess } from './outsider-shopify-platform-connection.js';
import { createShopifyPlatformAccess } from './outsider-shopify-platform-access.js';
export function createNativeRetailBuyer({ directory, request, nodeDirectory, clock, fetchFactory, ucpFetchFactory, orderAccess, checkoutAccess }) {
  if (request.protocol === SHOPIFY_BUYER_PROTOCOL) {
    const platform = checkoutAccess ?? createShopifyPlatformAccess({ nodeDirectory });
    return createShopifyUcpBuyerTransaction({ directory, request, clock,
    ...(ucpFetchFactory ? { fetchImpl: ucpFetchFactory(request.storeUrl) } : {}),
    ...(checkoutAccess || platform.status().configured ? { checkoutAccess: platform } : {}),
    orderAccess: orderAccess ?? createShopifyOrderAccess({ nodeDirectory }) });
  }
  return createWooCommerceBuyerTransaction({ directory, request, clock,
    ...(fetchFactory ? { fetchImpl: fetchFactory(request.storeUrl) } : {}) });
}
