/* Store API buyer lifecycle, shared by merchants rather than a per-store
 * checkout script. Real draft orders are not accepted purchases or delivery.
 * Node exposes prepare/read/clear only; checkout/payment submission additionally
 * needs an injected, independently configured exact-order authorization. */
import path from "node:path";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { interfaceDigest as digest } from "./outsider-openapi-demand-matcher.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce,
  withUserHeldExecutionLockV2 as locked } from "./outsider-user-held-durable-execution-v2.js";
import { createWooCommerceBuyerFetch, wooCommerceStoreOrigin } from "./outsider-woocommerce-buyer-transport.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const money = value => typeof value === "string" && /^(0|[1-9][0-9]{0,11})$/u.test(value);
const id = value => Number.isSafeInteger(value) && value > 0;
const clean = value => String(value ?? "").replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 240);
export const WOOCOMMERCE_DIGITAL_PROTOCOL = 'WOOCOMMERCE_DIGITAL_GOODS_V1';
const addressRejections = new Set(['woocommerce_rest_invalid_address_country','woocommerce_rest_invalid_address',
  'woocommerce_rest_invalid_param','rest_invalid_param']);

export function normalizeRetailOrderReference(value) {
  if (!value || Object.keys(value).sort().join(",") !== "billingEmail,orderId,orderKey" || !id(value.orderId)
    || typeof value.orderKey !== "string" || !/^[A-Za-z0-9_-]{8,200}$/u.test(value.orderKey)
    || typeof value.billingEmail !== "string" || value.billingEmail.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.billingEmail)) fail("RETAIL_ORDER_REFERENCE_INVALID");
  return { ...value };
}

export function normalizeRetailTransactionRequest(input) {
  if(input?.protocol===WOOCOMMERCE_DIGITAL_PROTOCOL){
    const exact = Object.hasOwn(input,'productId');
    if(Object.keys(input).sort().join(',')!==(exact?'currency,maximumTotalMinor,prepareDraft,productId,protocol,quantity,requestId,storeUrl'
      :'currency,maximumTotalMinor,prepareDraft,protocol,quantity,requestId,search,storeUrl')
      ||(exact?!id(input.productId):typeof input.search!=='string'||!input.search.trim()||input.search.length>100)
      ||input.quantity!==1||input.maximumTotalMinor!=='0'||input.prepareDraft!==false
      ||!/^[A-Za-z0-9._:-]{1,128}$/u.test(input.requestId??'')||!/^[A-Z]{3}$/u.test(input.currency??''))fail('DIGITAL_GOODS_REQUEST_INVALID');
    return {...input,storeUrl:wooCommerceStoreOrigin(input.storeUrl)};
  }
  if (!input || Object.keys(input).sort().join(",") !== "currency,destination,maximumTotalMinor,prepareDraft,quantity,requestId,search,storeUrl"
    || !/^[A-Za-z0-9._:-]{1,128}$/u.test(input.requestId ?? "") || typeof input.search !== "string"
    || !input.search.trim() || input.search.length > 100 || !/^[A-Z]{3}$/u.test(input.currency ?? "")
    || !money(input.maximumTotalMinor) || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 10
    || typeof input.prepareDraft !== "boolean") fail("RETAIL_REQUEST_INVALID");
  const d = input.destination;
  if (!d || Object.keys(d).sort().join(",") !== "city,country,postcode,state"
    || !/^[A-Z]{2}$/u.test(d.country ?? "") || [d.city,d.state,d.postcode].some(v => typeof v !== "string" || !v || v.length > 80))
    fail("RETAIL_POSTAL_DESTINATION_INVALID");
  return { ...input, storeUrl: wooCommerceStoreOrigin(input.storeUrl), search: input.search.trim(), destination: { ...d } };
}

function cartProjection(cart) {
  if (!Array.isArray(cart?.items) || !money(cart.totals?.total_price)) fail("RETAIL_CART_RESPONSE_INVALID");
  return { items: cart.items.map(item => ({ productId: item.id, quantity: item.quantity, name: clean(item.name),
    itemRefHash: digest(item.key), unitPriceMinor: item.prices?.price ?? null })),
    price: { currency: cart.totals.currency_code, minorUnit: cart.totals.currency_minor_unit,
      totalAmountMinor: cart.totals.total_price, shippingAmountMinor: cart.totals.total_shipping,
      taxAmountMinor: cart.totals.total_tax },
    shipping: (cart.shipping_rates ?? []).map(pack => ({ packageId: pack.package_id,
      rates: (pack.shipping_rates ?? []).map(rate => ({ rateId: rate.rate_id, name: clean(rate.name),
        amountMinor: rate.price, currency: rate.currency_code, selected: rate.selected === true,
        deliveryTimeClaim: clean(rate.delivery_time) || null })) })),
    needsShipping: cart.needs_shipping === true, needsPayment: cart.needs_payment === true,
    errors: (cart.errors ?? []).map(e => ({ code: clean(e.code), message: clean(e.message) })),
    stockReserved: false, sellerOrderAccepted: false, deliveryProven: false };
}
function matchCart(cart, product, request) {
  if (cart.items?.length !== 1 || cart.items[0].id !== product.id || cart.items[0].quantity !== request.quantity
    || cart.totals?.currency_code !== request.currency) fail("RETAIL_CART_BINDING_MISMATCH");
}

export function createWooCommerceBuyerTransaction({ directory, request: raw, fetchImpl, authorizeCheckout = async () => ({ allowed: false }),
  clock = () => new Date().toISOString() }) {
  const request = normalizeRetailTransactionRequest(raw), requestHash = digest(request);
  const digital=request.protocol===WOOCOMMERCE_DIGITAL_PROTOCOL;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`), root = `${request.storeUrl}/wp-json/wc/store/v1`;
  const fetcher = fetchImpl ?? createWooCommerceBuyerFetch(request.storeUrl);
  writeOnce(file("binding"), { schema: "outsider/woocommerce-buyer-transaction/v1", request, requestHash });
  const lock = operation => locked(digest({ directory, requestHash }), operation);
  const session = () => existsSync(file("cart-session")) ? read(file("cart-session")) : null;
  const source = name => read(file(name));
  const bodyFrom = receipt => JSON.parse(Buffer.from(receipt.bodyBase64, "base64"));
  async function call(name, method, route, body) {
    const headers = { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) };
    const token = session()?.cartToken; if (token) headers["Cart-Token"] = token;
    const response = await fetcher(`${root}${route}`, { method, headers, redirect: "error", credentials: "omit",
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024) fail("RETAIL_RESPONSE_TOO_LARGE");
    const receipt = { method, route: route.split("?")[0], httpStatus: response.status, observedAt: clock(),
      bodyBytes: bytes.length, bodyHash: digest(bytes), bodyBase64: bytes.toString("base64") };
    writeOnce(file(name), receipt);
    if (name === "cart-initial" && response.status === 200) {
      const cartToken = response.headers.get("Cart-Token");
      if (!cartToken || /[\r\n\0]/u.test(cartToken) || cartToken.length > 8192) fail("RETAIL_CART_TOKEN_MISSING");
      writeOnce(file("cart-session"), { cartToken, origin: request.storeUrl, obtainedAt: receipt.observedAt });
    }
    if (response.status < 200 || response.status >= 300) fail(`RETAIL_PROVIDER_HTTP_${response.status}`);
    let value; try { value = JSON.parse(bytes); } catch { fail("RETAIL_PROVIDER_JSON_INVALID"); }
    return value;
  }
  async function step(name, method, route, body) {
    if (existsSync(file(name))) {
      const r = source(name); if (r.httpStatus < 200 || r.httpStatus >= 300) fail(`RETAIL_PROVIDER_HTTP_${r.httpStatus}`);
      return bodyFrom(r);
    }
    if (method !== "GET" || name === "checkout-draft") {
      if (existsSync(file(`${name}-attempt`))) fail("RETAIL_OPERATION_UNKNOWN_INSPECT_REQUIRED");
      writeOnce(file(`${name}-attempt`), { method, route, requestBodyHash: body ? digest(body) : null, attemptedAt: clock(),
        ...(name.startsWith('checkout-submit')?{submissionSequence:readdirSync(directory)
          .filter(n=>/^checkout-submit(?:-[a-f0-9]{24})?-attempt\.json$/u.test(n)).length+1}:{}) });
    }
    return call(name, method, route, body);
  }
  function publicState(extra) {
    return { schema: "outsider/retail-transaction-status/v1", requestHash, storeUrl: request.storeUrl,
      paymentPerformed: false, capitalBacked: false, deliveryProven: false, ...extra };
  }
  const stats = () => {
    const receipts = readdirSync(directory).filter(f => f.endsWith(".json")).map(f => read(path.join(directory,f)))
      .filter(r => r.bodyBase64 && r.method);
    return { nativeRequests: receipts.length, responseBodyBytes: receipts.reduce((n,r)=>n+r.bodyBytes,0),
      methods: receipts.reduce((counts,r)=>(counts[r.method]=(counts[r.method]??0)+1,counts),{}) };
  };
  async function prepare() {
    if (existsSync(file("prepared"))) return { ...read(file("prepared")), metrics: stats() };
    const began = Date.now();
    const namespace = await step("namespace", "GET", "");
    for (const [route, method] of [["/cart","GET"],["/cart/add-item","POST"],["/cart/update-customer","POST"],
      ...(!digital?[["/cart/select-shipping-rate","POST"]]:[["/checkout","POST"]]),["/cart/remove-item","POST"], ...(request.prepareDraft ? [["/checkout","GET"]] : [])]) {
      if (!namespace.routes?.[`/wc/store/v1${route}`]?.methods?.includes(method)) fail("RETAIL_BUYER_PROTOCOL_NOT_ADVERTISED");
    }
    const exactProduct=digital&&request.productId;
    const productResponse=await step("products", "GET", exactProduct?`/products/${request.productId}`:
      `/products?${new URLSearchParams({ search: request.search, per_page: "20", stock_status: "instock" })}`);
    const products=exactProduct?[productResponse]:productResponse;
    if (!Array.isArray(products)) fail("RETAIL_PRODUCTS_RESPONSE_INVALID");
    const eligibleProducts=rows=>rows.filter(p => id(p.id) && p.type === "simple" && p.is_purchasable === true && p.is_in_stock === true
      && p.prices?.currency_code === request.currency && money(p.prices.price)
      && BigInt(p.prices.price) * BigInt(request.quantity) <= BigInt(request.maximumTotalMinor)
      &&(!exactProduct||p.id===request.productId));
    let eligible=eligibleProducts(products),broaderSearch=null;
    if(!eligible.length&&digital&&request.search){
      // Merchant search is lexical, not an instruction-following model. Keep
      // workflow/price constraints in the graph and checkout, not an AND query.
      const words=request.search.split(/\bfor\b|,/iu)[0].split(/[^a-z0-9]+/iu)
        .filter(w=>w&&!/^(free|download|downloadable|zip|guest|checkout|no|account)$/iu.test(w));
      if(words.length>2){broaderSearch=words.slice(0,2).join(' ');
        const response=await step('products-broader','GET',`/products?${new URLSearchParams({search:broaderSearch,per_page:'20',stock_status:'instock'})}`);
        if(!Array.isArray(response))fail('RETAIL_PRODUCTS_RESPONSE_INVALID');eligible=eligibleProducts(response);
      }
    }
    eligible.sort((a,b) => BigInt(a.prices.price) < BigInt(b.prices.price) ? -1 : BigInt(a.prices.price) > BigInt(b.prices.price) ? 1 : a.id-b.id);
    const product = eligible[0]; if (!product) fail("RETAIL_NO_ELIGIBLE_PRODUCT");
    writeOnce(file("product"), product);
    const empty = await step("cart-initial", "GET", "/cart");
    if (!Array.isArray(empty.items) || empty.items.length) fail("RETAIL_NEW_EMPTY_CART_REQUIRED");
    let cart = await step("cart-added", "POST", "/cart/add-item", { id: product.id, quantity: request.quantity });
    matchCart(cart, product, request);
    if(digital){if(cart.needs_shipping!==false)fail('DIGITAL_GOODS_NONSHIPPING_PRODUCT_REQUIRED');}
    else {cart = await step("cart-postal", "POST", "/cart/update-customer", { shipping_address: request.destination });
      matchCart(cart, product, request);}
    let shippingComplete = !cart.needs_shipping;
    if (cart.needs_shipping && cart.shipping_rates?.length) {
      shippingComplete = true;
      for (const [index, pack] of cart.shipping_rates.entries()) {
        const rates = (pack.shipping_rates ?? []).filter(r => money(r.price) && r.currency_code === request.currency
          && !/pickup|collection|collect\b/iu.test(`${r.method_id} ${r.name}`)
          // A non-default free/event method is not proven home delivery merely
          // because its price sorts first. Prefer the seller's postal default.
          && (r.selected === true || /^(usps|ups|fedex|dhl|flat_rate)$/iu.test(r.method_id ?? "")));
        rates.sort((a,b)=>Number(b.selected === true)-Number(a.selected === true)
          || (BigInt(a.price)<BigInt(b.price)?-1:BigInt(a.price)>BigInt(b.price)?1:0));
        if (!rates.length) { shippingComplete = false; continue; }
        cart = await step(`cart-shipping-${index}`, "POST", "/cart/select-shipping-rate", { package_id: pack.package_id, rate_id: rates[0].rate_id });
        matchCart(cart, product, request);
      }
    }
    const projection = cartProjection(cart), affordable = BigInt(projection.price.totalAmountMinor) <= BigInt(request.maximumTotalMinor);
    let draft = null, checkoutPrepared = false, draftDeferredByProvider = false;
    if (request.prepareDraft && affordable && shippingComplete && !projection.errors.length) {
      draft = await step("checkout-draft", "GET", "/checkout");
      // WooCommerce 10.9+ defers persisted draft creation until place-order.
      // The older Checkout docs still show a nonzero GET order id.
      draftDeferredByProvider = draft.order_id === 0 && draft.order_key === "" && draft.status === "checkout-draft";
      if ((!id(draft.order_id) || !draft.order_key) && !draftDeferredByProvider || draft.status !== "checkout-draft") fail("RETAIL_DRAFT_RESPONSE_INVALID");
      if (!draftDeferredByProvider) writeOnce(file("draft-identity"), { orderId: draft.order_id, orderKey: draft.order_key });
      const again = await step("checkout-draft-readback", "GET", "/checkout");
      if (again.order_id !== draft.order_id || again.order_key !== draft.order_key || again.status !== "checkout-draft") fail("RETAIL_DRAFT_READBACK_MISMATCH");
      if (draftDeferredByProvider) {
        matchCart(again.__experimentalCart, product, request);
        if (digest(cartProjection(again.__experimentalCart)) !== digest(projection)) fail("RETAIL_CHECKOUT_CART_CHANGED");
        draft = null;
      }
      checkoutPrepared = true;
    }
    const result = publicState({ state: draft ? "DRAFT_ORDER_AWAITING_PAYMENT_AUTHORIZATION" : checkoutPrepared ? "CHECKOUT_READY_AWAITING_PAYMENT_AUTHORIZATION" : !affordable ? "BUDGET_EXCEEDED"
      : !shippingComplete ? "DELIVERY_RATE_UNAVAILABLE" : "CART_READY_NOT_ORDERED", product: { productId: product.id,
        name: clean(product.name), productUrl: product.permalink, advertisedInStock: product.is_in_stock }, cart: projection,
      quoteHash: digest(projection), draftOrderRefHash: draft ? digest({ origin: request.storeUrl, id: draft.order_id }) : null,
      draftCreated: !!draft, draftReadbackMatched: !!draft, checkoutPrepared, draftDeferredByProvider, sellerOrderAccepted: false, stockReserved: false,
      deliveryDeadlineAccepted: false, deliveryEta: null, postedAddressFields: Object.keys(request.destination??{}),
      ...(digital?{protocol:WOOCOMMERCE_DIGITAL_PROTOCOL,physicalDeliveryApplicable:false}:{}),
      ...(broaderSearch?{broaderProductSearch:broaderSearch,allRequestedSemanticsAutomaticallyProven:false}:{}),
      privateContactSent: false, preparedAt: clock(), elapsedMs: Date.now()-began });
    writeOnce(file("prepared"), result); return { ...result, metrics: stats() };
  }
  async function inspect() {
    if (existsSync(file("order-submitted")) || existsSync(file("order-reference"))) return readOrder();
    if (existsSync(file('pay-later-execution-binding')) && existsSync(file('checkout-submit-attempt'))) {
      const binding = read(file('pay-later-execution-binding'));
      return reconcilePayLater(payLaterPlan(binding.planHash),binding);
    }
    if (!session()) return publicState({ state: "NOT_PREPARED", metrics: stats() });
    const cart = await call(`cart-read-${randomUUID()}`, "GET", "/cart");
    let order = null;
    if (existsSync(file("draft-identity"))) {
      const expected = read(file("draft-identity"));
      if (existsSync(file("order-submitted"))) return readOrder();
      const draft = await call(`draft-read-${randomUUID()}`, "GET", "/checkout");
      if (draft.order_id !== expected.orderId || draft.order_key !== expected.orderKey) fail("RETAIL_DRAFT_READBACK_MISMATCH");
      order = { status: draft.status, draftOrderRefHash: digest({ origin: request.storeUrl, id: draft.order_id }) };
    }
    return publicState({ state: cart.items.length ? "CART_PRESENT" : "CART_EMPTY", cart: cartProjection(cart), order, metrics: stats() });
  }
  async function clear() {
    if (!session()) return publicState({ state: "NO_CART_TO_CLEAR" });
    if (existsSync(file("order-submitted")) || existsSync(file("order-reference"))) fail("RETAIL_CART_CLEAR_IS_NOT_ORDER_CANCELLATION");
    if (existsSync(file('pay-later-execution-binding')) && existsSync(file('checkout-submit-attempt')))
      fail('RETAIL_PAY_LATER_SUBMISSION_REQUIRES_ORDER_RECONCILIATION');
    const cart = await call(`clear-read-${randomUUID()}`, "GET", "/cart");
    const product = read(file("product"));
    if (cart.items.some(item => item.id !== product.id)) fail("RETAIL_CART_BINDING_MISMATCH");
    for (const item of cart.items) await call(`clear-item-${randomUUID()}`, "POST", "/cart/remove-item", { key: item.key });
    const current = await call(`clear-verified-${randomUUID()}`, "GET", "/cart");
    const result = publicState({ state: current.items.length ? "CART_CLEAR_UNCONFIRMED" : "CART_EMPTY", draftDeleted: false,
      draftMayRemainWithSeller: existsSync(file("draft-identity")), checkedAt: clock(), metrics: stats() });
    if (result.state === "CART_EMPTY" && !existsSync(file("cleared"))) writeOnce(file("cleared"), result);
    return result;
  }
  async function observeOrder(saved, acquisitionSource) {
    const receiptName = `order-read-${randomUUID()}`;
    const order = await call(receiptName, "GET", `/order/${saved.orderId}?${new URLSearchParams({key:saved.orderKey,billing_email:saved.billingEmail})}`);
    const product=read(file('product')),item=order.items?.[0];
    // Store API OrderItemSchema.id is the order-line ID, unlike CartItem.id.
    // Its product-derived permalink/SKU bind a simple product after checkout.
    // https://woocommerce.github.io/code-reference/files/woocommerce-src-storeapi-schemas-v1-orderitemschema.html
    const productMatches=item&&(item.permalink
      ?item.permalink===product.permalink&&(!product.sku||item.sku===product.sku)&&!(item.variation?.length)
      :item.id===product.id);
    if (order.id !== saved.orderId || !Array.isArray(order.items) || order.items.length !== 1
      || !productMatches || item.quantity !== request.quantity) fail("RETAIL_ORDER_READBACK_MISMATCH");
    if (order.totals?.currency_code && order.totals.currency_code !== request.currency) fail("RETAIL_ORDER_CURRENCY_MISMATCH");
    if (acquisitionSource === "AUTHORIZED_BUYER_HANDOFF" && !digital && Object.entries(request.destination).some(([key, value]) =>
      clean(order.shipping_address?.[key]).toUpperCase() !== clean(value).toUpperCase())) fail("RETAIL_ORDER_DESTINATION_MISMATCH");
    const receipt = source(receiptName), status = clean(order.status), sellerOrderAccepted = ["processing", "completed"].includes(status);
    return publicState({ state: "SELLER_ORDER_OBSERVED", paymentPerformed: saved.zeroTotal===true?false:null,
      paymentAttempted: acquisitionSource === "NODE_CHECKOUT"&&saved.zeroTotal!==true,
      providerPaymentStatus: saved.paymentResult?.payment_status ?? null, orderRefHash: digest({origin:request.storeUrl,id:order.id}),
      sellerOrderStatus: status, sellerOrderAccepted, needsPayment: typeof order.needs_payment==='boolean'?order.needs_payment:null,
      acquisitionSource, outsiderCreatedOrder: acquisitionSource === "NODE_CHECKOUT", orderCompletedIsDeliveryProof: false,
      productBinding:{productId:product.id,orderLineId:item.id,matchedBy:item.permalink?'NATIVE_PRODUCT_PERMALINK_AND_SKU':'LEGACY_ITEM_PRODUCT_ID'},
      ...(saved.zeroTotal===true?{checkoutPlanHash:saved.checkoutPlanHash}:{}),
      physicalDeliveryStatus: digital?'NOT_APPLICABLE':"NOT_YET_OBSERVED", deliveryDeadlineAccepted: false,
      ...(digital?{digitalFileDeliveryStatus:'NOT_YET_OBSERVED'}:{}),
      totalAmountMinor: money(order.totals?.total_price) ? order.totals.total_price : null,
      currency: order.totals?.currency_code ?? null,
      receipt: { source: "MERCHANT_BUYER_ORDER_API", observedAt: receipt.observedAt, httpStatus: receipt.httpStatus,
        bodyBytes: receipt.bodyBytes, bodyHash: receipt.bodyHash, receiptHash: digest(receipt) }, metrics: stats(),
      ...(saved.payLater === true ? payLaterOrderProjection(saved, order) : {}) });
  }
  async function readOrder() {
    const submitted = existsSync(file("order-submitted"));
    if (!submitted && !existsSync(file("order-reference"))) fail("RETAIL_NO_SUBMITTED_ORDER");
    return observeOrder(read(file(submitted ? "order-submitted" : "order-reference")), submitted ? "NODE_CHECKOUT" : "AUTHORIZED_BUYER_HANDOFF");
  }
  async function attachOrder(rawReference) {
    const reference = normalizeRetailOrderReference(rawReference);
    if (existsSync(file("order-submitted")) || existsSync(file("order-reference"))) {
      const saved = read(file(existsSync(file("order-submitted")) ? "order-submitted" : "order-reference"));
      if (digest(normalizeRetailOrderReference(Object.fromEntries(["orderId", "orderKey", "billingEmail"].map(k => [k, saved[k]])))) !== digest(reference))
        fail("RETAIL_ORDER_ALREADY_BOUND");
      return readOrder();
    }
    // A returned native buyer credential is a handoff, not proof Outsider placed
    // this order. Read and bind its exact product before accepting the handoff.
    const observed = await observeOrder(reference, "AUTHORIZED_BUYER_HANDOFF");
    writeOnce(file("order-reference"), reference);
    return observed;
  }
  async function submitCheckout(command) {
    const prepared = read(file("prepared"));
    if (!["DRAFT_ORDER_AWAITING_PAYMENT_AUTHORIZATION","CHECKOUT_READY_AWAITING_PAYMENT_AUTHORIZATION"].includes(prepared.state) || command.expectedQuoteHash !== prepared.quoteHash)
      fail("RETAIL_CHECKOUT_PREPARATION_MISMATCH");
    if (existsSync(file("order-submitted")) || existsSync(file("order-reference"))) return readOrder();
    const identity = existsSync(file("draft-identity")) ? read(file("draft-identity")) : null;
    const decision = await authorizeCheckout({ requestHash, quoteHash: prepared.quoteHash, draftOrderRefHash: prepared.draftOrderRefHash,
      currency: prepared.cart.price.currency, maximumAmountMinor: prepared.cart.price.totalAmountMinor, paymentMethod: command.paymentMethod });
    if (decision?.allowed !== true || decision.requestHash !== requestHash || decision.quoteHash !== prepared.quoteHash)
      fail("RETAIL_PAYMENT_NOT_AUTHORIZED");
    const current = await call(`checkout-price-${randomUUID()}`, "GET", "/cart");
    if (digest(cartProjection(current)) !== prepared.quoteHash) fail("RETAIL_CHECKOUT_PRICE_OR_ITEMS_CHANGED");
    if (existsSync(file("checkout-submit-attempt"))) fail("RETAIL_SUBMISSION_UNKNOWN_NO_RETRY");
    if (!command.billingAddress?.email || !command.shippingAddress || typeof command.paymentMethod !== "string") fail("RETAIL_CHECKOUT_INPUT_INVALID");
    const data = await step("checkout-submit", "POST", "/checkout", { billing_address: command.billingAddress,
      shipping_address: command.shippingAddress, payment_method: command.paymentMethod, payment_data: command.paymentData ?? [] });
    if (!id(data.order_id) || !data.order_key || identity && (data.order_id !== identity.orderId || data.order_key !== identity.orderKey))
      fail("RETAIL_SUBMISSION_UNKNOWN_NO_RETRY");
    writeOnce(file("order-submitted"), { orderId: data.order_id, orderKey: data.order_key, billingEmail: command.billingAddress.email,
      providerStatus: data.status, paymentResult: data.payment_result, submittedAt: clock() });
    return readOrder();
  }
  const checkoutPlanFile=hash=>{
    if(!/^sha256:[a-f0-9]{64}$/u.test(hash??''))fail('RETAIL_CHECKOUT_PLAN_HASH_INVALID');
    return file(`zero-total-plan-${hash.slice(7)}`);
  };
  const nativeBilling=contact=>digital?{first_name:'',last_name:'',company:'',address_1:'',address_2:'',city:'',state:'',
    postcode:'',country:'',phone:'',email:'',...contact}:contact;
  function latestSubmission() {
    const names=readdirSync(directory).filter(n=>/^checkout-submit(?:-[a-f0-9]{24})?-attempt\.json$/u.test(n))
      .map(n=>({step:n.slice(0,-'-attempt.json'.length),attempt:read(path.join(directory,n))}))
      .sort((a,b)=>(a.attempt.submissionSequence??0)-(b.attempt.submissionSequence??0)
        ||a.attempt.attemptedAt.localeCompare(b.attempt.attemptedAt));
    const latest=names.at(-1);if(!latest)return null;
    if(!existsSync(file(latest.step)))fail('RETAIL_SUBMISSION_UNKNOWN_NO_RETRY');
    return {step:latest.step,receipt:source(latest.step)};
  }
  function checkoutPlan(hash){
    const plan=read(checkoutPlanFile(hash)),{planHash,...body}=plan;
    if(planHash!==hash||digest(body)!==hash||plan.requestHash!==requestHash)fail('RETAIL_CHECKOUT_PLAN_MISMATCH');
    return plan;
  }
  const publicPlan=plan=>({schema:plan.schema,planHash:plan.planHash,requestHash:plan.requestHash,
    quoteHash:plan.quoteHash,merchantOrigin:request.storeUrl,currency:request.currency,totalAmountMinor:'0',
    expiresAt:plan.expiresAt,contactRefHash:digest({billingAddress:plan.billingAddress,shippingAddress:plan.shippingAddress}),
    suppliedBillingFields:Object.keys(plan.billingAddress),
    createAccount:false,paymentInstrumentRequired:false,purchaseSubmitted:false});
  async function planZeroTotalCheckout(command){
    if(Object.keys(command??{}).sort().join(',')!=='billingAddress,shippingAddress')fail('RETAIL_ZERO_TOTAL_PLAN_INPUT_INVALID');
    if(digital){
      const contact=command.billingAddress;
      if(!contact||Object.keys(contact).some(k=>!['first_name','last_name','email','country','address_1','address_2','city','state','postcode','phone'].includes(k))
        ||Object.values(contact).some(v=>typeof v!=='string'||v.length>254||/[\r\n\0]/u.test(v))
        ||contact.country!==undefined&&!/^[A-Z]{2}$/u.test(contact.country)
        ||!contact.first_name?.trim()||!command.shippingAddress||Object.keys(command.shippingAddress).length)
        fail('DIGITAL_GOODS_EXPLICIT_BILLING_REQUIRED');
    }else for(const [kind,address] of Object.entries(command)){
      const allowed=['first_name','last_name','address_1','address_2','city','state','postcode','country',...(kind==='billingAddress'?['email']:[])];
      if(!address||Object.keys(address).some(k=>!allowed.includes(k))
        ||Object.values(address).some(v=>typeof v!=='string'||v.length>254||/[\r\n\0]/u.test(v))
        ||['first_name','last_name','address_1','city','country'].some(k=>!address[k]?.trim())
        ||Object.entries(request.destination).some(([k,v])=>clean(address[k]).toUpperCase()!==clean(v).toUpperCase()))
        fail('RETAIL_ZERO_TOTAL_ADDRESS_INVALID');
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(command.billingAddress.email??''))fail('RETAIL_ZERO_TOTAL_EMAIL_REQUIRED');
    if(existsSync(file('order-submitted'))||existsSync(file('order-reference'))||existsSync(file('cleared')))fail('RETAIL_ACTIVE_UNPURCHASED_CART_REQUIRED');
    const product=read(file('product'));
    const initial=await call(`zero-plan-initial-${randomUUID()}`,'GET','/cart');matchCart(initial,product,request);
    if(initial.totals.total_price!=='0'||initial.needs_payment!==false)fail('RETAIL_ZERO_TOTAL_REQUIRED_PAID_EXECUTION_NOT_ENABLED');
    if(digital&&initial.needs_shipping!==false)fail('DIGITAL_GOODS_NONSHIPPING_PRODUCT_REQUIRED');
    // Explicitly supplied checkout contact is sent only to this task's seller.
    // This remains quotation: the order POST happens only after graph confirmation.
    await call(`zero-plan-address-${randomUUID()}`,'POST','/cart/update-customer',{
      billing_address:nativeBilling(command.billingAddress),...(!digital?{shipping_address:command.shippingAddress}:{})});
    const current=await call(`zero-plan-priced-${randomUUID()}`,'GET','/cart');matchCart(current,product,request);
    if(current.totals.total_price!=='0'||current.needs_payment!==false||current.errors?.length||digital&&current.needs_shipping!==false)
      fail('RETAIL_ZERO_TOTAL_REQUIRED_PAID_EXECUTION_NOT_ENABLED');
    const quote=cartProjection(current),now=clock();
    let rejectedSubmission=null;
    const latest=digital?latestSubmission():null;
    if(latest){
      const previous=latest.receipt,failure=bodyFrom(previous);
      // A separate user-confirmed successor is possible only after this exact
      // validation rejection AND a native read showing no accepted order.
      // Timeouts, 5xx and unrecognized failures never become retry permission.
      if(previous.httpStatus!==400||!addressRejections.has(failure.code))
        fail('RETAIL_PRIOR_CHECKOUT_RECONCILIATION_REQUIRED');
      const name=`rejected-checkout-read-${randomUUID()}`,draft=await call(name,'GET','/checkout');
      const unmaterialized=draft.order_id===0&&draft.order_key==='';
      const pendingDraft=id(draft.order_id)&&typeof draft.order_key==='string'&&draft.order_key.length>=8
        &&draft.customer_id===0&&draft.billing_address?.email===command.billingAddress.email
        &&!draft.payment_result?.payment_status&&!draft.payment_result?.redirect_url;
      if(draft.status!=='checkout-draft'||!unmaterialized&&!pendingDraft)
        fail('RETAIL_PRIOR_CHECKOUT_RECONCILIATION_REQUIRED');
      // Older Store API versions create an unpaid draft on GET. Continue that
      // exact guest cart/draft; do not mistake it for an accepted order or open
      // another cart. New versions can return the unmaterialized zero identity.
      rejectedSubmission={receiptHash:digest(previous),reconciliationReadHash:digest(source(name)),sourceStep:latest.step,
        ...(pendingDraft?{draftIdentity:{orderId:draft.order_id,orderKey:draft.order_key}}:{})};
    }
    const body={schema:'outsider/zero-total-native-checkout-plan/v1',requestHash,quoteHash:digest(quote),
      billingAddress:command.billingAddress,shippingAddress:command.shippingAddress,createdAt:now,
      ...(rejectedSubmission?{supersedesRejectedSubmission:rejectedSubmission}:{}),
      expiresAt:new Date(Date.parse(now)+30*60000).toISOString(),maximumAmountMinor:'0',currency:request.currency};
    const plan={...body,planHash:digest(body)};writeOnce(checkoutPlanFile(plan.planHash),plan);return publicPlan(plan);
  }
  async function submitZeroTotalCheckout(planHash){
    const plan=checkoutPlan(planHash);
    if(existsSync(file('order-submitted'))){
      if(read(file('order-submitted')).checkoutPlanHash!==planHash)fail('RETAIL_CHECKOUT_PLAN_ALREADY_BOUND');
      return readOrder();
    }
    if(existsSync(file('order-reference'))||existsSync(file('cleared')))fail('RETAIL_ACTIVE_UNPURCHASED_CART_REQUIRED');
    if(Date.parse(clock())>=Date.parse(plan.expiresAt))fail('RETAIL_CHECKOUT_PLAN_EXPIRED');
    const current=await call(`zero-submit-price-${randomUUID()}`,'GET','/cart');matchCart(current,read(file('product')),request);
    if(current.totals.total_price!=='0'||current.needs_payment!==false||digest(cartProjection(current))!==plan.quoteHash)
      fail('RETAIL_CHECKOUT_PRICE_OR_ITEMS_CHANGED');
    // No gateway, card token, account creation or deferred-payment method.
    // expected_total also makes the seller reject a server-side price change.
    let submitStep='checkout-submit';
    if(plan.supersedesRejectedSubmission){
      const prior=source(plan.supersedesRejectedSubmission.sourceStep);
      if(!digital||digest(prior)!==plan.supersedesRejectedSubmission.receiptHash||prior.httpStatus!==400
        ||!addressRejections.has(bodyFrom(prior).code))fail('RETAIL_PRIOR_CHECKOUT_RECONCILIATION_REQUIRED');
      submitStep=`checkout-submit-${planHash.slice(7,31)}`;
      const latest=latestSubmission();
      if(latest&&![plan.supersedesRejectedSubmission.sourceStep,submitStep].includes(latest.step))
        fail('RETAIL_PRIOR_CHECKOUT_RECONCILIATION_REQUIRED');
      const identity=plan.supersedesRejectedSubmission.draftIdentity;
      if(identity&&!existsSync(file(submitStep))){
        const draft=await call(`zero-submit-draft-${randomUUID()}`,'GET','/checkout');
        if(draft.order_id!==identity.orderId||draft.order_key!==identity.orderKey||draft.status!=='checkout-draft'
          ||draft.payment_result?.payment_status||draft.payment_result?.redirect_url)fail('RETAIL_PRIOR_CHECKOUT_RECONCILIATION_REQUIRED');
      }
    }
    let data;
    try{data=await step(submitStep,'POST','/checkout',{billing_address:nativeBilling(plan.billingAddress),
      ...(!digital?{shipping_address:plan.shippingAddress}:{}),payment_method:'',payment_data:[],create_account:false,expected_total:'0'});}
    catch(error){
      if(existsSync(file(submitStep))){
        const receipt=source(submitStep),response=bodyFrom(receipt);
        if(receipt.httpStatus===400&&addressRejections.has(response.code))
          throw Object.assign(new Error('RETAIL_CHECKOUT_CUSTOMER_INPUT_REJECTED'),{code:'RETAIL_CHECKOUT_CUSTOMER_INPUT_REJECTED',
            providerReceipt:{source:'NATIVE_CHECKOUT_VALIDATION_REJECTION',httpStatus:400,code:response.code,bodyHash:receipt.bodyHash,
              requiredFields:Object.entries({country:/country.*(?:required|provided)/iu,postcode:/(?:zip code|postcode) is required/iu,
                state:/state is required/iu,last_name:/last name is required/iu,address_1:/street address is required/iu,
                city:/(?:town\s*\/\s*city|city) is required/iu,phone:/phone is required/iu})
                .filter(([,pattern])=>pattern.test(response.message??'')).map(([field])=>field)}});
      }
      throw error;
    }
    if(!id(data.order_id)||typeof data.order_key!=='string'||!data.order_key)fail('RETAIL_SUBMISSION_UNKNOWN_NO_RETRY');
    const priorDraft=plan.supersedesRejectedSubmission?.draftIdentity;
    if(priorDraft&&(data.order_id!==priorDraft.orderId||data.order_key!==priorDraft.orderKey))fail('RETAIL_SUBMISSION_UNKNOWN_NO_RETRY');
    writeOnce(file('order-submitted'),{orderId:data.order_id,orderKey:data.order_key,billingEmail:plan.billingAddress.email,
      providerStatus:data.status,paymentResult:data.payment_result??null,submittedAt:clock(),zeroTotal:true,checkoutPlanHash:planHash});
    const order=await readOrder();
    if(order.totalAmountMinor!=='0'||order.needsPayment!==false)fail('RETAIL_ZERO_TOTAL_ORDER_NOT_CONFIRMED');
    return order;
  }
  // Core WooCommerce COD and BACS use no payment token. Both create an order
  // with money still due; gateway "success" does not mean money was paid.
  // https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/checkout/
  const payLaterSchema = 'outsider/pay-later-native-checkout-plan/v1';
  const payLaterMethods = new Set(['cod', 'bacs']);
  const hashPattern = /^sha256:[a-f0-9]{64}$/u;
  const payLaterPlanFile = hash => {
    if (!hashPattern.test(hash ?? '')) fail('RETAIL_CHECKOUT_PLAN_HASH_INVALID');
    return file(`pay-later-plan-${hash.slice(7)}`);
  };
  function payLaterInput(command) {
    if (!command || Object.keys(command).sort().join(',') !== 'billingAddress,paymentMethod,shippingAddress'
      || !payLaterMethods.has(command.paymentMethod) || digital) fail('RETAIL_PAY_LATER_METHOD_NOT_SUPPORTED');
    const normalized = { billingAddress: {}, shippingAddress: {}, paymentMethod: command.paymentMethod };
    for (const kind of ['billingAddress', 'shippingAddress']) {
      const address = command[kind], allowed = ['first_name','last_name','company','address_1','address_2','city','state','postcode','country','phone',
        ...(kind === 'billingAddress' ? ['email'] : [])];
      if (!address || Array.isArray(address) || Object.keys(address).some(k => !allowed.includes(k))
        || Object.values(address).some(v => typeof v !== 'string' || v.length > 254 || /[\r\n\0]/u.test(v))
        || ['first_name','last_name','address_1','city','country'].some(k => !address[k]?.trim())
        || !/^[A-Z]{2}$/u.test(address.country)) fail('RETAIL_PAY_LATER_ADDRESS_INVALID');
      normalized[kind] = Object.fromEntries(Object.entries(address).map(([k,v]) => [k,v.trim()]));
    }
    if (Object.entries(request.destination).some(([k,v]) => clean(normalized.shippingAddress[k]).toUpperCase() !== clean(v).toUpperCase())
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized.billingAddress.email ?? '')) fail('RETAIL_PAY_LATER_ADDRESS_INVALID');
    return normalized;
  }
  function declaredPayLaterMethods(cart) {
    if (!Array.isArray(cart.payment_methods) || cart.payment_methods.length > 32
      || cart.payment_methods.some(v => typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/u.test(v))
      || new Set(cart.payment_methods).size !== cart.payment_methods.length) fail('RETAIL_PAY_LATER_METHOD_NOT_DECLARED');
    return cart.payment_methods.filter(v => payLaterMethods.has(v)).sort();
  }
  function payLaterQuote(cart, paymentMethod, contact = null) {
    matchCart(cart, read(file('product')), request);
    const methods = declaredPayLaterMethods(cart);
    if (!methods.includes(paymentMethod)) fail('RETAIL_PAY_LATER_METHOD_NOT_DECLARED');
    const totals = cart.totals;
    if (!['total_price','total_shipping','total_tax'].every(k => money(totals?.[k]))
      || !Number.isInteger(totals.currency_minor_unit) || totals.currency_minor_unit < 0 || totals.currency_minor_unit > 8
      || totals.total_price === '0' || cart.needs_payment !== true || cart.errors?.length
      || BigInt(totals.total_price) > BigInt(request.maximumTotalMinor)) fail('RETAIL_PAY_LATER_TOTAL_NOT_AUTHORIZABLE');
    if (cart.needs_shipping !== true || !Array.isArray(cart.shipping_rates) || !cart.shipping_rates.length
      || cart.shipping_rates.some(pack => {
        const selected = pack.shipping_rates?.filter(rate => rate.selected === true) ?? [];
        return selected.length !== 1 || !money(selected[0].price) || selected[0].currency_code !== request.currency
          || /pickup|collection|collect\b/iu.test(`${selected[0].method_id} ${selected[0].name}`);
      })) fail('RETAIL_PAY_LATER_DELIVERY_QUOTE_REQUIRED');
    const totalFields = ['total_items','total_items_tax','total_fees','total_fees_tax','total_discount','total_discount_tax',
      'total_shipping','total_shipping_tax','total_tax','total_price'];
    for (const key of totalFields) if (Object.hasOwn(totals,key) && !money(totals[key])) fail('RETAIL_PAY_LATER_TOTAL_NOT_AUTHORIZABLE');
    if (contact && ['billing','shipping'].some(kind => !cart[`${kind}_address`]
      || Object.entries(contact[`${kind}Address`]).some(([k,v]) => cart[`${kind}_address`][k] !== v)))
      fail('RETAIL_PAY_LATER_ADDRESS_QUOTE_NOT_CONFIRMED');
    return { cart: cartProjection(cart), totals: Object.fromEntries(totalFields.filter(k => Object.hasOwn(totals,k)).map(k => [k,totals[k]])), paymentMethod };
  }
  function payLaterPlan(hash) {
    if (!existsSync(payLaterPlanFile(hash))) fail('RETAIL_PAY_LATER_PLAN_NOT_FOUND');
    const plan = read(payLaterPlanFile(hash)), { planHash, ...body } = plan;
    if (planHash !== hash || digest(body) !== hash || plan.schema !== payLaterSchema || plan.requestHash !== requestHash
      || !payLaterMethods.has(plan.paymentMethod) || plan.currency !== request.currency
      || !money(plan.maximumAmountMinor) || plan.maximumAmountMinor === '0'
      || BigInt(plan.maximumAmountMinor) > BigInt(request.maximumTotalMinor)
      || plan.quoteHash !== digest(plan.quote) || plan.quote.paymentMethod !== plan.paymentMethod
      || plan.quote.cart.price.currency !== plan.currency || plan.quote.cart.price.totalAmountMinor !== plan.maximumAmountMinor
      || !Number.isFinite(Date.parse(plan.createdAt)) || !Number.isFinite(Date.parse(plan.expiresAt))
      || Date.parse(plan.expiresAt) <= Date.parse(plan.createdAt) || Date.parse(plan.expiresAt) - Date.parse(plan.createdAt) > 15*60000
      || digest(payLaterInput(plan.contact)) !== digest(plan.contact) || plan.contact.paymentMethod !== plan.paymentMethod
      || !hashPattern.test(plan.quoteSourceHash ?? '') || !hashPattern.test(plan.checkoutSourceHash ?? '')) fail('RETAIL_CHECKOUT_PLAN_MISMATCH');
    return plan;
  }
  const payLaterAction = method => ({ type: method === 'cod' ? 'PAY_ON_DELIVERY' : 'EXTERNAL_BANK_TRANSFER',
    paymentMethod: method, paymentPerformed: false });
  const publicPayLaterPlan = plan => ({ schema: plan.schema, planHash: plan.planHash, requestHash: plan.requestHash,
    quoteHash: plan.quoteHash, merchantOrigin: request.storeUrl, currency: plan.currency,
    totalAmountMinor: plan.maximumAmountMinor, minorUnit: plan.quote.cart.price.minorUnit,
    items: plan.quote.cart.items, shipping: plan.quote.cart.shipping,
    shippingAmountMinor: plan.quote.cart.price.shippingAmountMinor, taxAmountMinor: plan.quote.cart.price.taxAmountMinor,
    paymentMethod: plan.paymentMethod, availablePaymentMethods: plan.availablePaymentMethods,
    paymentMethodSourceHash: plan.quoteSourceHash, buyerAction: payLaterAction(plan.paymentMethod),
    createsPaymentObligation: true, paymentPerformed: false, expiresAt: plan.expiresAt,
    contactRefHash: digest(plan.contact), suppliedBillingFields: Object.keys(plan.contact.billingAddress),
    createAccount: false, paymentInstrumentRequired: false, purchaseSubmitted: false });
  function payLaterCheckoutIdentity(value, contact, expectedIdentity, requireMethod) {
    const matchesAddress = (actual, expected) => actual && Object.entries(expected).every(([k,v]) => actual[k] === v);
    if (!id(value?.order_id) || typeof value.order_key !== 'string' || !/^[A-Za-z0-9_-]{8,200}$/u.test(value.order_key)
      || value.customer_id !== 0 || !matchesAddress(value.billing_address,contact.billingAddress)
      || !matchesAddress(value.shipping_address,contact.shippingAddress)
      || requireMethod && value.payment_method !== contact.paymentMethod
      || expectedIdentity && (value.order_id !== expectedIdentity.orderId || value.order_key !== expectedIdentity.orderKey))
      fail('RETAIL_PAY_LATER_CHECKOUT_BINDING_MISMATCH');
    return { orderId: value.order_id, orderKey: value.order_key };
  }
  async function planPayLaterCheckout(command) {
    const contact = payLaterInput(command);
    if (existsSync(file('order-submitted')) || existsSync(file('order-reference')) || existsSync(file('cleared'))
      || existsSync(file('checkout-submit-attempt')) || existsSync(file('pay-later-execution-binding')))
      fail('RETAIL_ACTIVE_UNPURCHASED_CART_REQUIRED');
    const namespace = bodyFrom(source('namespace'));
    const checkoutRoute = namespace.routes?.['/wc/store/v1/checkout'];
    if (!['GET','POST'].every(m => checkoutRoute?.methods?.includes(m))
      || !checkoutRoute.endpoints?.some(endpoint => endpoint.methods?.includes('POST')
        && endpoint.args?.expected_total?.type === 'string' && endpoint.args?.create_account?.type === 'boolean'))
      fail('RETAIL_PAY_LATER_CHECKOUT_NOT_ADVERTISED');
    const initial = await call(`pay-later-initial-${randomUUID()}`, 'GET', '/cart');
    payLaterQuote(initial,contact.paymentMethod);
    // Quotation updates this original guest cart. It never POSTs /checkout.
    await call(`pay-later-address-${randomUUID()}`, 'POST', '/cart/update-customer', {
      billing_address: contact.billingAddress, shipping_address: contact.shippingAddress });
    const checkoutName = `pay-later-draft-${randomUUID()}`, checkout = await call(checkoutName,'GET','/checkout');
    if (checkout.status !== 'checkout-draft' || checkout.customer_id !== 0) fail('RETAIL_PAY_LATER_UNPURCHASED_CHECKOUT_REQUIRED');
    const identity = checkout.order_id === 0 && checkout.order_key === '' ? null
      : payLaterCheckoutIdentity(checkout,contact,null,false);
    const quoteName = `pay-later-quote-${randomUUID()}`, cart = await call(quoteName,'GET','/cart'), quote = payLaterQuote(cart,contact.paymentMethod,contact);
    const now = new Date(clock()).toISOString();
    const body = { schema: payLaterSchema, requestHash, quoteHash: digest(quote), quote,
      contact, paymentMethod: contact.paymentMethod, availablePaymentMethods: declaredPayLaterMethods(cart),
      quoteSourceHash: source(quoteName).bodyHash, checkoutSourceHash: source(checkoutName).bodyHash,
      ...(identity ? { checkoutIdentity: identity } : {}),
      createdAt: now, expiresAt: new Date(Date.parse(now)+15*60000).toISOString(),
      maximumAmountMinor: quote.cart.price.totalAmountMinor, currency: request.currency };
    const plan = { ...body, planHash: digest(body) };
    writeOnce(payLaterPlanFile(plan.planHash),plan); return publicPayLaterPlan(plan);
  }
  function payLaterOrderProjection(saved, order) {
    const plan = payLaterPlan(saved.checkoutPlanHash), status = clean(order.status);
    const matchesAddress = (actual, expected) => actual && Object.entries(expected).every(([k,v]) => actual[k] === v);
    if (saved.paymentMethod !== plan.paymentMethod || !hashPattern.test(saved.executionBindingHash ?? '')
      || !existsSync(file('pay-later-execution-binding')) || digest(read(file('pay-later-execution-binding'))) !== saved.executionBindingHash
      || order.totals?.currency_code !== plan.currency || order.totals?.currency_minor_unit !== plan.quote.cart.price.minorUnit
      || ['total_price','total_shipping','total_tax'].some(k => order.totals?.[k] !== plan.quote.totals[k])
      || !matchesAddress(order.billing_address,plan.contact.billingAddress) || !matchesAddress(order.shipping_address,plan.contact.shippingAddress)
      || order.payment_method !== undefined && order.payment_method !== plan.paymentMethod)
      fail('RETAIL_PAY_LATER_ORDER_TERMS_MISMATCH');
    const confirmation = existsSync(file('pay-later-method-confirmation')) ? read(file('pay-later-method-confirmation')) : null;
    const methodConfirmed = saved.paymentMethodConfirmed === true || confirmation?.executionBindingHash === saved.executionBindingHash
      && confirmation.orderRefHash === digest({origin:request.storeUrl,id:saved.orderId}) && confirmation.paymentMethod === plan.paymentMethod;
    const accepted = methodConfirmed && (plan.paymentMethod === 'cod'
      ? ['processing','on-hold','completed'].includes(status) : ['processing','completed'].includes(status));
    const paymentState = !methodConfirmed ? 'PAY_LATER_METHOD_UNCONFIRMED'
      : ['cancelled','failed','refunded'].includes(status) ? 'MERCHANT_ORDER_CLOSED_PAYMENT_UNRESOLVED'
      : plan.paymentMethod === 'cod' ? 'PAYMENT_DUE_ON_DELIVERY'
      : accepted ? 'MERCHANT_PROCESSING_PAYMENT_UNVERIFIED' : 'AWAITING_EXTERNAL_BANK_TRANSFER';
    return { checkoutPlanHash: plan.planHash, paymentMethod: plan.paymentMethod, paymentState,
      sellerOrderAccepted: accepted, paymentPerformed: false, paymentAttempted: false,
      paymentObligationCreated: ['pending','processing','on-hold','completed'].includes(status),
      paymentObligationMayExist: true, liabilityAmountMinor: plan.maximumAmountMinor,
      orderBindingMatched: true, buyerAction: payLaterAction(plan.paymentMethod),
      receiptPageAvailable: !!payLaterReceiptUrl(saved), executionBindingHash: saved.executionBindingHash };
  }
  function payLaterReceiptUrl(saved) {
    const value = saved.paymentResult?.redirect_url;
    let url; try { url = new URL(value); } catch { return null; }
    const segments = url.pathname.split('/').filter(Boolean), index = segments.indexOf('order-received');
    return url.protocol === 'https:' && url.origin === request.storeUrl && !url.username && !url.password && !url.hash
      && index >= 0 && segments[index+1] === String(saved.orderId) && url.searchParams.get('key') === saved.orderKey ? url.href : null;
  }
  function payLaterUnresolved(plan, reason = 'RETAIL_SUBMISSION_UNKNOWN_NO_RETRY') {
    const saved = existsSync(file('order-submitted')) ? read(file('order-submitted')) : null;
    return publicState({ state: 'SUBMISSION_UNCERTAIN_NO_RESUBMIT', reason, checkoutPlanHash: plan.planHash,
      orderRefHash: saved?.payLater === true ? digest({origin:request.storeUrl,id:saved.orderId}) : null,
      sellerOrderAccepted: false, orderBindingMatched: false, paymentMethod: plan.paymentMethod,
      paymentState: 'PAY_LATER_ORDER_RECONCILIATION_REQUIRED', paymentPerformed: false,
      paymentObligationMayExist: true, liabilityAmountMinor: plan.maximumAmountMinor, currency: plan.currency,
      buyerAction: payLaterAction(plan.paymentMethod), noResubmission: true });
  }
  async function adoptPayLaterCheckout(plan, binding, data, receipt, { requireMethod = true } = {}) {
    if (data.status === 'checkout-draft') return payLaterUnresolved(plan);
    const identity = payLaterCheckoutIdentity(data,plan.contact,plan.checkoutIdentity,requireMethod);
    writeOnce(file('order-submitted'), { ...identity, billingEmail: plan.contact.billingAddress.email,
      providerStatus: data.status, paymentResult: data.payment_result ?? null, submittedAt: receipt.observedAt,
      payLater: true, checkoutPlanHash: plan.planHash, paymentMethod: plan.paymentMethod,
      paymentMethodConfirmed: data.payment_method === plan.paymentMethod,
      executionBindingHash: digest(binding), checkoutReceiptHash: digest(receipt) });
    return readOrder();
  }
  async function reconcilePayLater(plan, binding) {
    try {
      if (existsSync(file('order-submitted'))) {
        const saved = read(file('order-submitted'));
        if (!saved.paymentMethodConfirmed && !existsSync(file('pay-later-method-confirmation'))) {
          try {
            const name = `pay-later-method-read-${randomUUID()}`, current = await call(name,'GET','/checkout');
            payLaterCheckoutIdentity(current,plan.contact,saved,true);
            if (current.status !== 'checkout-draft') writeOnce(file('pay-later-method-confirmation'), {
              executionBindingHash: digest(binding), orderRefHash: digest({origin:request.storeUrl,id:saved.orderId}),
              paymentMethod: plan.paymentMethod, sourceReceiptHash: digest(source(name)) });
          } catch { /* An unrelated draft cannot confirm the original method. */ }
        }
        return await readOrder();
      }
      if (existsSync(file('checkout-submit'))) {
        const receipt = source('checkout-submit');
        if (receipt.httpStatus >= 200 && receipt.httpStatus < 300)
          return await adoptPayLaterCheckout(plan,binding,bodyFrom(receipt),receipt);
      }
      // GET may expose this guest cart's accepted checkout. A fresh/empty draft
      // after the seller cleared the cart is never a reason to place it again.
      const name = `pay-later-reconcile-${randomUUID()}`, current = await call(name,'GET','/checkout');
      if (current.status !== 'checkout-draft') return await adoptPayLaterCheckout(plan,binding,current,source(name));
      if (plan.checkoutIdentity) {
        // The original draft identity was obtained before the one POST. The
        // order endpoint proves its current contents, but does not expose the
        // selected gateway; keep acceptance unresolved until a source does.
        const saved = { ...plan.checkoutIdentity, billingEmail: plan.contact.billingAddress.email,
          providerStatus: 'UNKNOWN_AFTER_SUBMISSION', paymentResult: null, submittedAt: source('checkout-submit-attempt').attemptedAt,
          payLater: true, checkoutPlanHash: plan.planHash, paymentMethod: plan.paymentMethod, paymentMethodConfirmed: false,
          executionBindingHash: digest(binding), checkoutReceiptHash: digest(source(name)) };
        const observed = await observeOrder(saved,'NODE_CHECKOUT');
        if (observed.sellerOrderStatus !== 'checkout-draft') { writeOnce(file('order-submitted'),saved); return observed; }
      }
      return payLaterUnresolved(plan);
    } catch (error) { return payLaterUnresolved(plan,error.code ?? 'RETAIL_PAY_LATER_READ_UNAVAILABLE'); }
  }
  async function submitPayLaterCheckout(command) {
    if (!command || !['expectedPlanHash,programHash,requirementId','expectedPlanHash,programHash,requirementId,resumeOnly'].includes(Object.keys(command).sort().join(','))
      || !hashPattern.test(command.programHash ?? '') || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(command.requirementId ?? '')
      || command.resumeOnly !== undefined && typeof command.resumeOnly !== 'boolean') fail('RETAIL_PAY_LATER_EXECUTION_BINDING_INVALID');
    const plan = payLaterPlan(command.expectedPlanHash);
    const binding = { schema: 'outsider/pay-later-checkout-execution/v1', programHash: command.programHash,
      requirementId: command.requirementId, planHash: plan.planHash, requestHash, quoteHash: plan.quoteHash,
      paymentMethod: plan.paymentMethod, currency: plan.currency, maximumAmountMinor: plan.maximumAmountMinor };
    const bindingFile = file('pay-later-execution-binding');
    if (existsSync(bindingFile) && digest(read(bindingFile)) !== digest(binding)) fail('RETAIL_PAY_LATER_EXECUTION_BINDING_MISMATCH');
    if (existsSync(file('order-submitted'))) {
      const saved = read(file('order-submitted'));
      if (saved.payLater !== true || saved.checkoutPlanHash !== plan.planHash || saved.executionBindingHash !== digest(binding))
        fail('RETAIL_CHECKOUT_PLAN_ALREADY_BOUND');
      return reconcilePayLater(plan,binding);
    }
    if (existsSync(file('order-reference')) || existsSync(file('cleared'))) fail('RETAIL_ACTIVE_UNPURCHASED_CART_REQUIRED');
    if (existsSync(file('checkout-submit-attempt'))) {
      if (!existsSync(bindingFile)) fail('RETAIL_PRIOR_CHECKOUT_RECONCILIATION_REQUIRED');
      return reconcilePayLater(plan,binding);
    }
    if (command.resumeOnly) fail('RETAIL_PAY_LATER_NO_SUBMISSION_TO_RESUME');
    let providerCallPerformed = false;
    try {
      if (Date.parse(clock()) >= Date.parse(plan.expiresAt)) fail('RETAIL_CHECKOUT_PLAN_EXPIRED');
      providerCallPerformed = true;
      const current = await call(`pay-later-submit-price-${randomUUID()}`,'GET','/cart');
      if (digest(payLaterQuote(current,plan.paymentMethod,plan.contact)) !== plan.quoteHash) fail('RETAIL_CHECKOUT_PRICE_OR_ITEMS_CHANGED');
    } catch (error) {
      const knownPreflightRejections = new Set(['RETAIL_CHECKOUT_PLAN_EXPIRED','RETAIL_CHECKOUT_PRICE_OR_ITEMS_CHANGED',
        'RETAIL_CART_BINDING_MISMATCH','RETAIL_PAY_LATER_METHOD_NOT_DECLARED','RETAIL_PAY_LATER_TOTAL_NOT_AUTHORIZABLE',
        'RETAIL_PAY_LATER_DELIVERY_QUOTE_REQUIRED','RETAIL_PAY_LATER_ADDRESS_QUOTE_NOT_CONFIRMED']);
      if (knownPreflightRejections.has(error.code) && !existsSync(file('order-submitted')) && !existsSync(file('order-reference'))
        && !readdirSync(directory).some(n => /^checkout-submit(?:-[a-f0-9]{24})?(?:-attempt)?\.json$/u.test(n)))
        Object.assign(error,{effectNotDispatched:true,providerCallPerformed});
      throw error;
    }
    writeOnce(bindingFile,binding);
    try {
      const data = await step('checkout-submit','POST','/checkout', { billing_address: plan.contact.billingAddress,
        shipping_address: plan.contact.shippingAddress, payment_method: plan.paymentMethod, payment_data: [],
        create_account: false, expected_total: plan.maximumAmountMinor });
      return await adoptPayLaterCheckout(plan,binding,data,source('checkout-submit'));
    } catch (error) { return reconcilePayLater(plan,binding); }
  }
  function buyerNextAction() {
    if (!existsSync(file('order-submitted'))) fail('RETAIL_NO_SUBMITTED_ORDER');
    const saved = read(file('order-submitted'));
    if (saved.payLater !== true) fail('RETAIL_PAY_LATER_ORDER_REQUIRED');
    const plan = payLaterPlan(saved.checkoutPlanHash), receiptUrl = payLaterReceiptUrl(saved);
    // This is a private owner-only view. The URL may contain the buyer order
    // key; ordinary task summaries expose only its availability.
    return { schema: 'outsider/pay-later-buyer-action/v1', orderRefHash: digest({origin:request.storeUrl,id:saved.orderId}),
      checkoutPlanHash: plan.planHash, ...payLaterAction(plan.paymentMethod), currency: plan.currency,
      amountMinor: plan.maximumAmountMinor, merchantReceiptUrl: receiptUrl,
      merchantReceiptSourceHash: receiptUrl ? saved.checkoutReceiptHash : null,
      merchantInstructions: null, paymentInstructionsInvented: false };
  }
  return Object.freeze({ prepare: () => lock(prepare), inspect: () => lock(inspect), clear: () => lock(clear),
    submitCheckout: command => lock(() => submitCheckout(command)), readOrder: () => lock(readOrder),
    planZeroTotalCheckout:command=>lock(()=>planZeroTotalCheckout(command)),
    readZeroTotalCheckoutPlan:hash=>publicPlan(checkoutPlan(hash)),
    submitZeroTotalCheckout:hash=>lock(()=>submitZeroTotalCheckout(hash)),
    planPayLaterCheckout: command => lock(() => planPayLaterCheckout(command)),
    readPayLaterCheckoutPlan: hash => publicPayLaterPlan(payLaterPlan(hash)),
    submitPayLaterCheckout: command => lock(() => submitPayLaterCheckout(command)),
    buyerNextAction,
    // Internal buyer capability only; never projected to a public task. The
    // merchant's native completion response is the source of this private URL.
    digitalReceiptReference:()=>{
      if(!digital||!existsSync(file('order-submitted')))fail('DIGITAL_GOODS_NATIVE_ORDER_REQUIRED');
      const order=read(file('order-submitted')),url=order.paymentResult?.redirect_url;
      let parsed;try{parsed=new URL(url);}catch{}
      if(!parsed||parsed.origin!==request.storeUrl||parsed.username||parsed.password||parsed.hash
        ||!parsed.pathname.includes(`/order-received/${order.orderId}`)
        ||parsed.searchParams.get('key')!==order.orderKey)fail('DIGITAL_GOODS_NATIVE_RECEIPT_URL_UNAVAILABLE');
      return {url:parsed.href,orderId:order.orderId,orderKey:order.orderKey,productId:read(file('product')).id,billingEmail:order.billingEmail};
    },
    attachOrder: reference => lock(() => attachOrder(reference)) });
}
