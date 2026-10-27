import {privateExecutionRecordExists as existsSync} from './outsider-user-held-durable-execution-v2.js';
/* Goal-bound buyer formation. Merchant origins come from this task's fresh
 * web sources; order-scoped guest sessions come from native seller APIs.
 * This prepares real transactions, not a delivery promise or payment grant. */
import path from "node:path";
import { mkdirSync, readdirSync } from "node:fs";
import { interfaceDigest as digest } from "./outsider-openapi-demand-matcher.js";
import { createWooCommerceBuyerFetch, wooCommerceStoreOrigin } from "./outsider-woocommerce-buyer-transport.js";
import { createRetailTransactionService } from "./outsider-retail-transaction-service.js";
import { discoverShopifyProducts } from "./outsider-shopify-catalog-discovery.js";
import { SHOPIFY_BUYER_PROTOCOL } from "./outsider-shopify-ucp-buyer-transaction.js";
import { WOOCOMMERCE_DIGITAL_PROTOCOL } from "./outsider-woocommerce-buyer-transaction.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "./outsider-user-held-durable-execution-v2.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const money = value => typeof value === "string" && /^(0|[1-9][0-9]{0,11})$/u.test(value);
const productQuery = value => value.replace(/\b(?:ordinary|standard|basic|regular|simple)\b/giu, " ").replace(/\s+/gu, " ").trim() || value.trim();
const code = error => /^[A-Z][A-Z0-9_]{0,120}$/u.test(error.code ?? error.message) ? error.code ?? error.message : "RETAIL_INTERFACE_UNAVAILABLE";
export const RETAIL_DEMAND_CAPABILITY = "RETAIL_GOODS_DELIVERY_V1";
export const DIGITAL_DEMAND_CAPABILITY = "DIGITAL_GOODS_ACQUISITION_V1";
export const isBuyerDemand = capability => [RETAIL_DEMAND_CAPABILITY,DIGITAL_DEMAND_CAPABILITY].includes(capability);
const POSTAL_PREPARATION_SCHEMA = { type: "object", additionalProperties: false,
  required: ["cartPreparationApproved", "currency", "maximumTotalMinor", "destination"], properties: {
    cartPreparationApproved: { const: true }, currency: { type: "string", pattern: "^[A-Z]{3}$" },
    maximumTotalMinor: { type: "string" }, destination: { type: "object", additionalProperties: false,
      required: ["country", "state", "city", "postcode"], properties: Object.fromEntries(
        ["country", "state", "city", "postcode"].map(key => [key, { type: "string" }])) } } };
export const RETAIL_PREPARATION_SCHEMA = { anyOf: [POSTAL_PREPARATION_SCHEMA,
  { type:'object',additionalProperties:false,required:['cartPreparationApproved','currency','maximumTotalMinor','kind'],
    properties:{cartPreparationApproved:{const:true},currency:{type:'string',pattern:'^[A-Z]{3}$'},
      maximumTotalMinor:{const:'0'},kind:{const:'DIGITAL_GOODS'}} }] };
export const RETAIL_DEMAND_REQUEST_SCHEMA = { type: "object", additionalProperties: false,
  required: ["requirementId", "search", "quantity"], properties: {
    requirementId: { type: "string" }, search: { type: "string", maxLength: 100 }, quantity: { type: "integer", minimum: 1, maximum: 10 } } };
export const RETAIL_PREPARATION_CONTRACT = { capability: RETAIL_DEMAND_CAPABILITY, category: "PHYSICAL_GOODS",
  phase: "NATIVE_GUEST_TRANSACTION_PREPARATION_ONLY",
  description: "A purchased physical good delivered to its recipient, including shipping and final acceptance. Product can discover native stores and prepare isolated guest carts when the caller supplies retailPreparation. This does NOT yet execute payment, reserve stock, accept delivery deadlines or verify receipt. Keep the delivery requirement unresolved. Never substitute a digital file, a booking or a test product. A retailRequests entry contains only generic product search words and quantity stated in the goal; no merchant URL, personal details, price or authority. Missing physical specifications remain missing facts.",
  inputSchema: RETAIL_DEMAND_REQUEST_SCHEMA };
export const DIGITAL_PREPARATION_CONTRACT = {capability:DIGITAL_DEMAND_CAPABILITY,category:'DIGITAL_GOODS',
  phase:'NATIVE_GUEST_TRANSACTION_PREPARATION_ONLY',inputSchema:RETAIL_DEMAND_REQUEST_SCHEMA,
  description:'Acquire a requested free downloadable ZIP from a merchant. Use retailRequests.search with 2-4 PRODUCT NAME nouns (example: VDB cloud pack), NOT a sentence, workflow, free/ZIP/guest/no-account conditions or project-use clauses. Keep those constraints in the graph. Quantity is 1; assign assetId:null. The product discovers stores, selects a current zero-priced nonshipping item and prepares its own guest transaction. The user need not supply a merchant API, product ID, transaction ID or plan hash. Buyer contact is requested in-product for the selected seller; no contact is sent during discovery. The original graph later executes the accepted order and receives the private file after confirmation. Not a substitute for physical delivery, an independent inspection, a reserved replacement, a redistribution licence or a paid order.'};
export function normalizeRetailPreparation(value) {
  if(value?.kind==='DIGITAL_GOODS'){
    if(Object.keys(value).sort().join(',')!=='cartPreparationApproved,currency,kind,maximumTotalMinor'
      ||value.cartPreparationApproved!==true||!/^[A-Z]{3}$/u.test(value.currency??'')||value.maximumTotalMinor!=='0')
      fail('RETAIL_PREPARATION_INPUT_INVALID');
    return {...value};
  }
  if (!value || Object.keys(value).sort().join(",") !== "cartPreparationApproved,currency,destination,maximumTotalMinor"
    || value.cartPreparationApproved !== true || !/^[A-Z]{3}$/u.test(value.currency ?? "") || !money(value.maximumTotalMinor))
    fail("RETAIL_PREPARATION_INPUT_INVALID");
  const d = value.destination;
  if (!d || Object.keys(d).sort().join(",") !== "city,country,postcode,state" || !/^[A-Z]{2}$/u.test(d.country ?? "")
    || [d.state, d.city, d.postcode].some(v => typeof v !== "string" || !v.trim() || v.length > 80))
    fail("RETAIL_POSTAL_DESTINATION_INVALID");
  return { ...value, destination: { ...d } };
}
export function normalizeRetailDemands(rows, graph) {
  if (!Array.isArray(rows) || rows.length > 2) fail("RETAIL_DEMANDS_INVALID");
  const seen = new Set();
  return rows.map(row => {
    if (!row || Object.keys(row).sort().join(",") !== "quantity,requirementId,search" || seen.has(row.requirementId)
      || !graph.requirements.some(n => n.id === row.requirementId && isBuyerDemand(n.capability))
      || typeof row.search !== "string" || !row.search.trim() || row.search.length > 100
      || /@|https?:|\d{5}|[\r\n]/iu.test(row.search) || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 10)
      fail("RETAIL_DEMAND_INVALID");
    if(graph.requirements.find(n=>n.id===row.requirementId).capability===DIGITAL_DEMAND_CAPABILITY&&row.quantity!==1)
      fail('DIGITAL_GOODS_QUANTITY_ONE_REQUIRED');
    seen.add(row.requirementId); return { ...row, search: productQuery(row.search) };
  });
}
export function retailSourceQueries(row,capability=RETAIL_DEMAND_CAPABILITY) {
  const query = productQuery(row.search);
  if(capability===DIGITAL_DEMAND_CAPABILITY)return [`${query} free download WooCommerce`,
    `"${query}" "free" "download"`, `${query} "downloadable" "WooCommerce"`, `${query} "free" "zip" shop`];
  return [`${query} shop buy shipping`, `"${query}" "WooCommerce" shop`,
    `"${query}" "Powered by WooCommerce"`, `${query} shop "Powered by WordPress"`];
}
function merchantOrigins(sources, nodeDirectory, rows, graph) {
  const seen = new Set(), origins = [];
  for (const card of sources.cards ?? []) {
    if (card.status !== 200) continue;
    try {
      const origin = wooCommerceStoreOrigin(new URL(card.url).origin);
      if (seen.has(origin)) continue;
      seen.add(origin); origins.push({ origin, sourceUrl: card.url, sourceHash: card.sourceHash, discovery: "CURRENT_TASK_OPEN_WEB" });
    } catch { /* The native transport still requires a public seller origin. */ }
  }
  const current = origins.slice(0, 8), memory = new Map(), root = path.join(nodeDirectory, "retail-transactions");
  // Learn reusable buyer routes from real native receipts already held by this
  // Node, not a manually maintained merchant seed list. Recheck every route now.
  if (existsSync(root)) for (const id of readdirSync(root).filter(n => /^retail_[a-f0-9]{32}$/u.test(n)).sort()) {
    const requestFile = path.join(root, id, "request.json"), receiptFile = path.join(root, id, "native", "namespace.json");
    if (!existsSync(requestFile) || !existsSync(receiptFile)) continue;
    try {
      const previousRequest=read(requestFile),origin = wooCommerceStoreOrigin(previousRequest.storeUrl), receipt = read(receiptFile);
      if (receipt.httpStatus !== 200 || !receipt.bodyBase64) continue;
      const document = JSON.parse(Buffer.from(receipt.bodyBase64, "base64"));
      if (!document.routes?.["/wc/store/v1/cart/add-item"]?.methods?.includes("POST")) continue;
      const route=memory.get(origin)??{origin,sourceUrl:`${origin}/wp-json/wc/store/v1`,sourceHash:receipt.bodyHash,
        discovery:'PRIOR_NATIVE_BUYER_ROUTE_RECHECK_REQUIRED',historicalTransactionRefHash:digest(id),
        relationship:{stage:'TECHNICAL_ROUTE_ONLY',acceptedOrderRefs:[],deliveredOrderRefs:[],relevantPriorFulfillment:false,
          reusableCommercialTerms:[],futureCapacityGranted:false,economicAdvantageProven:false}};
      memory.set(origin,route);
      const submittedFile=path.join(root,id,'native','order-submitted.json'),deliveredFile=path.join(root,id,'digital-delivery','received-file.json');
      if(!existsSync(submittedFile))continue;
      const submitted=read(submittedFile);
      if(!['processing','completed'].includes(submitted.providerStatus))continue;
      const orderRef=digest({origin,id:submitted.orderId});
      if(!route.relationship.acceptedOrderRefs.includes(orderRef))route.relationship.acceptedOrderRefs.push(orderRef);
      route.relationship.stage='TRANSACTED_NOT_STANDING_SUPPLY';
      if(!existsSync(deliveredFile))continue;
      const delivered=read(deliveredFile),product=read(path.join(root,id,'native','product.json'));
      if(delivered.orderRefHash!==orderRef||delivered.artifactBytes<=0||delivered.merchantOrderReceipt?.source!=='MERCHANT_BUYER_ORDER_API')continue;
      if(!route.relationship.deliveredOrderRefs.includes(orderRef))route.relationship.deliveredOrderRefs.push(orderRef);
      route.relationship.stage='FULFILLED_BUYER_RECEIPT_NOT_STANDING_SUPPLY';
      // A completed resource only helps a new task when its category and public
      // product terms overlap. Never infer reserved supply or better economics.
      const words=new Set(`${product.name??''} ${previousRequest.search??''}`.toLowerCase().match(/[a-z0-9]{3,}/gu)??[]);
      route.relationship.relevantPriorFulfillment ||= rows.some(row=>graph.requirements.find(n=>n.id===row.requirementId)?.capability===DIGITAL_DEMAND_CAPABILITY
        &&(row.search.toLowerCase().match(/[a-z0-9]{3,}/gu)??[]).some(w=>words.has(w)));
    } catch { /* Malformed legacy entries do not establish a usable route. */ }
  }
  const learned=[...memory.values()].map(route=>({...route,relationship:{...route.relationship,
    acceptedOrderCount:route.relationship.acceptedOrderRefs.length,observedDeliveryCount:route.relationship.deliveredOrderRefs.length,
    evidenceScope:'THIS_NODE_REAL_TRANSACTIONS_NOT_GLOBAL_PROVIDER_SCORE'}}));
  const proven=learned.filter(r=>r.relationship.relevantPriorFulfillment).slice(0,2);
  const byOrigin=new Map([...proven,...current.map(r=>({...r,...(memory.has(r.origin)?{relationship:learned.find(x=>x.origin===r.origin).relationship}:{})})),
    ...learned.filter(r=>!seen.has(r.origin)).slice(0,2)].map(r=>[r.origin,r]));
  // Preserve priority when a fresh search also returns an experienced route.
  return [...byOrigin.values()].sort((a,b)=>Number(b.relationship?.relevantPriorFulfillment??false)-Number(a.relationship?.relevantPriorFulfillment??false));
}
export async function prepareRetailDemands({ request, graph, retailRequests, preparation, sources, nodeDirectory, directory,
  fetchFactory = createWooCommerceBuyerFetch, serviceFactory = createRetailTransactionService,
  ucpFetchFactory, catalogDiscovery = discoverShopifyProducts, revisionId = null, priorFormation = null }) {
  const rows = normalizeRetailDemands(retailRequests, graph), graphHash = digest(graph);
  if (!rows.length) return { demands: [], metrics: { protocolRequests: 0, nativeRequests: 0, responseBodyBytes: 0 } };
  if (!preparation) return { demands: rows.map(row => ({ requirementId: row.requirementId,
    state: graph.requirements.find(n=>n.id===row.requirementId).capability===DIGITAL_DEMAND_CAPABILITY
      ?'DIGITAL_CART_PREPARATION_APPROVAL_REQUIRED':"POSTAL_QUOTE_CONTEXT_REQUIRED", userMerchantRegistrationRequired: false, executionConnected: false })) };
  const context = normalizeRetailPreparation(preparation), origins = merchantOrigins(sources, nodeDirectory,rows,graph), started = Date.now();
  const digitalRow=row=>graph.requirements.find(n=>n.id===row.requirementId).capability===DIGITAL_DEMAND_CAPABILITY;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const resultFile = path.join(directory, "result.json");
  const binding = { requestHash: digest(request), graphHash, retailRequests: rows, preparation: context,
    ...(revisionId?{revisionId,priorFormationHash:digest(priorFormation)}:{}),
    sourceOrigins: origins };
  writeOnce(path.join(directory, "binding.json"), binding);
  if (existsSync(resultFile)) return read(resultFile);
  const connectionFile=path.join(nodeDirectory,'connections','shopify-ucp.json');
  const ucp=existsSync(connectionFile)?read(connectionFile):null;
  // Discovery is a country-market query. The recipient's address never goes
  // to Global Catalog; a scoped, explicit grant can attach it to a seller quote.
  const catalogJobs=rows.map(async row=>{
    if(digitalRow(row)||!context.destination)return {candidates:[],observation:{state:'PHYSICAL_CATALOG_NOT_APPLICABLE'},metrics:{nativeRequests:0,responseBodyBytes:0}};
    if(!ucp)return {candidates:[],observation:{state:'PLATFORM_UCP_PROFILE_NOT_CONNECTED'},metrics:{nativeRequests:0,responseBodyBytes:0}};
    let nativeRequests=0,responseBodyBytes=0;
    try{return await catalogDiscovery({search:row.search,quantity:row.quantity,currency:context.currency,
      maximumTotalMinor:context.maximumTotalMinor,country:context.destination.country,profileUrl:ucp.profileUrl,
      deliveryDeadline:request.completionDeadline,
      excludedVariants:(priorFormation?.demands??[]).filter(d=>d.requirementId===row.requirementId).flatMap(d=>(d.candidates??[])
        .filter(c=>c.state==='BUDGET_EXCEEDED'&&c.publisherSource?.protocol===SHOPIFY_BUYER_PROTOCOL)
        .map(c=>({storeUrl:c.origin,variantId:c.publisherSource.variantId}))),
      quoteReadyOrigins:(ucp.quoteAddressGrants??[]).filter(g=>g.requestIds?.includes(request.requestId)&&Date.parse(g.expiresAt)>Date.now()).flatMap(g=>g.origins??[]),
      ...(ucpFetchFactory?{fetchImpl:ucpFetchFactory('https://catalog.shopify.com')}:{}),
      onReceipt:r=>{nativeRequests++;responseBodyBytes+=r.bodyBytes;
        writeOnce(path.join(directory,`catalog-${digest({row,requestHash:binding.requestHash}).slice(7)}.json`),r);} });}
    catch(error){return {candidates:[],observation:{state:'CATALOG_UNAVAILABLE',reason:code(error)},metrics:{nativeRequests,responseBodyBytes}};}
  });
  let protocolRequests = 0, protocolBytes = 0;
  const observations = await Promise.all(origins.map(async source => {
    const receiptFile = path.join(directory, `protocol-${digest(source.origin).slice(7)}.json`);
    if (existsSync(receiptFile)) return read(receiptFile).projection;
    try {
      protocolRequests++;
      const response = await fetchFactory(source.origin)(`${source.origin}/wp-json/wc/store/v1`, { method: "GET", headers: { Accept: "application/json" } });
      const bytes = Buffer.from(await response.arrayBuffer()); protocolBytes += bytes.length;
      let document; try { document = JSON.parse(bytes); } catch { /* Not a native JSON store. */ }
      const supported = response.status === 200 && [["/products", "GET"], ["/cart", "GET"], ["/cart/add-item", "POST"],
        ["/cart/update-customer", "POST"], ["/cart/remove-item", "POST"]].every(([route, method]) =>
        document?.routes?.[`/wc/store/v1${route}`]?.methods?.includes(method));
      const projection = { ...source, supported, observedAt: new Date().toISOString(), httpStatus: response.status,
        protocolHash: digest(bytes), reason: supported ? "NATIVE_GUEST_BUYER_PROTOCOL_OBSERVED" : "NATIVE_BUYER_PROTOCOL_NOT_OBSERVED" };
      writeOnce(receiptFile, { projection, bodyBase64: bytes.toString("base64"), bodyBytes: bytes.length });
      return projection;
    } catch (error) {
      const projection = { ...source, supported: false, reason: code(error) };
      writeOnce(receiptFile, { projection }); return projection;
    }
  }));
  const catalogs=await Promise.all(catalogJobs);
  const service = serviceFactory({ directory: path.join(nodeDirectory, "retail-transactions"), fetchFactory, ucpFetchFactory });
  const demands = [];
  try {
    for (const [rowIndex,row] of rows.entries()) {
      const digital=digitalRow(row);
      if(!digital&&!context.destination){demands.push({requirementId:row.requirementId,state:'POSTAL_QUOTE_CONTEXT_REQUIRED',
        candidates:[],graphNodeRemainsUnresolved:true,userMerchantRegistrationRequired:false});continue;}
      const nativeCandidates=catalogs[rowIndex].candidates.map(c=>({origin:c.storeUrl,protocol:SHOPIFY_BUYER_PROTOCOL,
        variantId:c.variantId,discovery:c.discovery,nativeCheckoutAdvertised:c.nativeCheckoutAdvertised}));
      // Independent merchants prepare concurrently (max two per protocol).
      // Every later operation uses the saved exact transaction binding.
      const candidates=await Promise.all([...nativeCandidates,...observations.filter(o => o.supported).slice(0, 2)].map(async source => {
        const requestId = `goal_retail_${digest({ requestHash: binding.requestHash, row, origin: source.origin,
          ...(revisionId?{revisionId}:{}),
          ...(source.protocol?{protocol:source.protocol,variantId:source.variantId}:{}) }).slice(7, 39)}`;
        const transactionId = `retail_${digest(requestId).slice(7, 39)}`;
        const base = { requirementId: row.requirementId, transactionId, origin: source.origin, publisherSource: source,
          capability:digital?DIGITAL_DEMAND_CAPABILITY:RETAIL_DEMAND_CAPABILITY,
          buyerAccess: { mode: "ORDER_SCOPED_GUEST_SESSION", userMerchantAccountRequired: false,
            merchantAccountCreated: false, credentialsOwnedBy: "CURRENT_AUTHORIZED_NODE", oneUseSessionIsNotRegistration: true },
          sellerOrderAccepted: false, independentOwnershipVerified: false, deliveryProven: false };
        writeOnce(path.join(directory, `transaction-${transactionId}.json`), base);
        try {
          const grant=(ucp?.quoteAddressGrants??[]).find(g=>g.requestIds?.includes(request.requestId)
            && g.origins?.includes(source.origin) && Date.parse(g.expiresAt)>Date.now());
          if(!digital && ucp && source.protocol!==SHOPIFY_BUYER_PROTOCOL && !grant)return {...base,
            state:'DELIVERY_ADDRESS_SHARING_APPROVAL_REQUIRED',transactionCreated:false,
            transactionMetrics:{nativeRequests:0,responseBodyBytes:0},nextAction:'OBTAIN_AUTHORIZED_DELIVERY_QUOTE'};
          const prepared = await service.prepare(source.protocol===SHOPIFY_BUYER_PROTOCOL ? {
            protocol:SHOPIFY_BUYER_PROTOCOL,requestId,storeUrl:source.origin,variantId:source.variantId,quantity:row.quantity,
            currency:context.currency,maximumTotalMinor:context.maximumTotalMinor,country:context.destination.country,
            profileUrl:ucp.profileUrl,...(grant?{quoteAddress:grant.address}:{})
          } : digital ? {protocol:WOOCOMMERCE_DIGITAL_PROTOCOL,requestId,storeUrl:source.origin,search:row.search,quantity:1,
            currency:context.currency,maximumTotalMinor:'0',prepareDraft:false} : { requestId, storeUrl: source.origin, search: row.search, quantity: row.quantity,
            currency: context.currency, maximumTotalMinor: context.maximumTotalMinor, prepareDraft: false, destination: context.destination });
          let cleanup = null;
          const nativePrepared=source.protocol===SHOPIFY_BUYER_PROTOCOL&&['CART_AWAITING_DELIVERY_QUOTE','ADDRESS_CART_QUOTED_NOT_ORDERED','CHECKOUT_QUOTED_NOT_ORDERED'].includes(prepared.state);
          if (!nativePrepared && (prepared.state !== "CART_READY_NOT_ORDERED" || prepared.cart.errors.length)) cleanup = await service.clear(transactionId);
          return { ...base, prepared, cleanup, state: prepared.state,
            transactionMetrics:service.metrics?.(transactionId)??cleanup?.metrics??prepared.metrics??{nativeRequests:0,responseBodyBytes:0},
            nextAction: cleanup ? "TRY_OTHER_SUPPLIER" : prepared.state==='CART_AWAITING_DELIVERY_QUOTE'?'OBTAIN_AUTHORIZED_DELIVERY_QUOTE'
              :nativePrepared?'RESOLVE_CHECKOUT_REQUIREMENTS_AND_DELIVERY_DATE':digital?'CONFIRM_SELECTED_MERCHANT_CONTACT_AND_ORIGINAL_GRAPH':"CONNECT_CHECKOUT_AND_DELIVERY_EXECUTION" };
        } catch (error) {
          let cleanup; try { cleanup = await service.clear(transactionId); } catch (cleanupError) { cleanup = { state: "CLEANUP_PENDING", reason: code(cleanupError) }; }
          return { ...base, state: "TRANSACTION_PREPARATION_FAILED", reason: code(error), cleanup,
            transactionMetrics:service.metrics?.(transactionId)??cleanup?.metrics??{nativeRequests:0,responseBodyBytes:0},nextAction: "TRY_OTHER_SUPPLIER" };
        }
      }));
      const priced = candidates.filter(c => c.prepared?.cart?.price && !c.cleanup && c.state === "CART_READY_NOT_ORDERED")
        .sort((a, b) => BigInt(a.prepared.cart.price.totalAmountMinor) < BigInt(b.prepared.cart.price.totalAmountMinor) ? -1 : 1);
      demands.push({ requirementId: row.requirementId, capability:digital?DIGITAL_DEMAND_CAPABILITY:RETAIL_DEMAND_CAPABILITY,
        requested: row, state: priced.length ? "GUEST_PURCHASE_ROUTE_PREPARED_NOT_ORDERED"
        :candidates.some(c=>c.prepared&&!c.cleanup)?"BUYER_SESSIONS_PREPARED_DELIVERY_TERMS_INCOMPLETE":"NO_EXECUTABLE_DELIVERY_ROUTE",
        candidates, preferredTransactionId: priced[0]?.transactionId ?? null, alternativeTransactionIds: priced.slice(1).map(c => c.transactionId),
        preparedBuyerTransactionIds:candidates.filter(c=>c.prepared&&!c.cleanup).map(c=>c.transactionId),
        maximumTotalMinor: digital?'0':context.maximumTotalMinor, selectionBasis: digital?'NATIVE_ZERO_TOTAL_NONSHIPPING_ITEM_NOT_ACCEPTED_ORDER':"OBSERVED_POSTAL_TOTAL_NOT_FINAL_LOCKED_PRICE",
        userMerchantRegistrationRequired: false, supplierUrlsSuppliedByCaller: false, employeePerOrderSetupRequired: false,
        stockReserved: false, deliveryDeadlineAccepted: false, independentRecoveryReserved: false,
        graphNodeRemainsUnresolved: true, resultPromiseIssued: false, paymentPerformed: false });
    }
  } finally { await service.close(); }
  const all = demands.flatMap(d => d.candidates), result = { schema: "outsider/goal-retail-formation/v1", graphHash,
    requestHash: binding.requestHash, demands, protocolObservations: observations,
    catalogObservations:catalogs.map(c=>c.observation),
    metrics: { protocolRequests, catalogRequests:catalogs.reduce((n,c)=>n+c.metrics.nativeRequests,0),
      nativeRequests: all.reduce((n, c) => n + (c.transactionMetrics?.nativeRequests ?? 0), 0),
      responseBodyBytes: protocolBytes + catalogs.reduce((n,c)=>n+c.metrics.responseBodyBytes,0)
        + all.reduce((n, c) => n + (c.transactionMetrics?.responseBodyBytes ?? 0), 0), elapsedMs: Date.now() - started },
    buyerIdentityPolicy: "ONE_OUTSIDER_ENTRY_NOT_ONE_MERCHANT_ACCOUNT_PER_USER", paymentPerformed: false,
    financialMode: "SIMULATION_ONLY", actualPhysicalDelivery: false };
  writeOnce(resultFile, result); return result;
}

export async function operateTaskRetailPreparation({ formation, nodeDirectory, action, serviceFactory = createRetailTransactionService }) {
  if (!["INSPECT", "CLEAR"].includes(action) || !formation) fail("RETAIL_TASK_OPERATION_INVALID");
  const service = serviceFactory({ directory: path.join(nodeDirectory, "retail-transactions") });
  try {
    const transactions = [];
    for (const demand of formation.demands ?? []) for (const candidate of demand.candidates ?? []) {
      if(candidate.transactionCreated===false){transactions.push({requirementId:demand.requirementId,transactionId:candidate.transactionId,
        state:candidate.state,transactionCreated:false});continue;}
      try { transactions.push({ requirementId: demand.requirementId, transactionId: candidate.transactionId,
        ...(await (action === "CLEAR" ? service.clear(candidate.transactionId) : service.inspect(candidate.transactionId))) }); }
      catch (error) { transactions.push({ requirementId: demand.requirementId, transactionId: candidate.transactionId,
        state: "OBSERVATION_UNAVAILABLE", reason: code(error) }); }
    }
    return { action, transactions, paymentPerformed: false, physicalDeliveryProven: false };
  } finally { await service.close(); }
}
