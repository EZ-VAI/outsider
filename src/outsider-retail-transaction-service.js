import {privateExecutionRecordExists as existsSync} from './outsider-user-held-durable-execution-v2.js';
/* Existing owner Node's retail transaction surface. No second scheduler:
 * requests create only isolated carts/drafts, never confirm an OutcomeProgram
 * or enable checkout payment. Credentials and draft keys stay with the Node. */
import path from "node:path";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { interfaceDigest as digest } from "./outsider-openapi-demand-matcher.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "./outsider-user-held-durable-execution-v2.js";
import { normalizeRetailTransactionRequest } from "./outsider-woocommerce-buyer-transaction.js";
import { createRetailOrderFollowup } from "./outsider-retail-order-followup.js";
import { normalizeShopifyBuyerRequest, SHOPIFY_BUYER_PROTOCOL } from "./outsider-shopify-ucp-buyer-transaction.js";
import { createNativeRetailBuyer } from './outsider-native-retail-buyer.js';
import { createShopifyPlatformAccess } from './outsider-shopify-platform-access.js';
import { verifyShopifyOrderEvent } from './outsider-shopify-order-events.js';
import {createDigitalGoodsDelivery} from './outsider-digital-goods-delivery.js';
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function createRetailTransactionService({ directory, fetchFactory, ucpFetchFactory, orderAccess, checkoutAccess, platformAccess, maximumTransactions = 20, clock = () => new Date().toISOString(), followupIntervalMs }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const pending = new Map(); let closing = false;
  const platform=platformAccess??createShopifyPlatformAccess({nodeDirectory:path.dirname(directory)});
  function rootFor(id) {
    if (!/^retail_[a-f0-9]{32}$/u.test(id ?? "")) fail("RETAIL_TRANSACTION_ID_INVALID");
    return path.join(directory, id);
  }
  function adapter(id) {
    const root = rootFor(id);
    if (!existsSync(path.join(root,"request.json"))) fail("RETAIL_TRANSACTION_NOT_FOUND");
    const request = read(path.join(root,"request.json"));
    return createNativeRetailBuyer({ directory: path.join(root, 'native'), request, clock, nodeDirectory: path.dirname(directory),
      fetchFactory, ucpFetchFactory, orderAccess, checkoutAccess });
  }
  const followup = id => createRetailOrderFollowup({ directory: path.join(rootFor(id), "followup"), transactionId: id,
    adapter: adapter(id), clock, ...(followupIntervalMs ? { intervalMs: followupIntervalMs } : {}) });
  const run = async (id, action) => {
    if (closing) fail("RETAIL_SERVICE_CLOSING");
    if (pending.has(id)) fail("RETAIL_TRANSACTION_BUSY");
    const promise = action(); pending.set(id,promise);
    try { return { transactionId: id, ...await promise }; } finally { pending.delete(id); }
  };
  return Object.freeze({
    async prepare(input) {
      const request = input?.protocol === SHOPIFY_BUYER_PROTOCOL ? normalizeShopifyBuyerRequest(input) : normalizeRetailTransactionRequest(input);
      const id = `retail_${digest(request.requestId).slice(7,39)}`, root = rootFor(id);
      if (existsSync(path.join(root,"request.json"))) {
        if (digest(read(path.join(root,"request.json"))) !== digest(request)) fail("RETAIL_REQUEST_ID_CONFLICT");
      } else {
        if (readdirSync(directory).filter(n=>/^retail_[a-f0-9]{32}$/u.test(n)).length >= maximumTransactions) fail("RETAIL_TRANSACTION_LIMIT");
        mkdirSync(root,{recursive:true,mode:0o700});writeOnce(path.join(root,"request.json"),request);
      }
      return run(id,()=>adapter(id).prepare());
    },
    inspect: id => run(id,()=>adapter(id).inspect()),
    clear: id => run(id,()=>adapter(id).clear()),
    quoteDelivery: (id,address) => run(id,()=>{
      const buyer=adapter(id);
      if(typeof buyer.quoteDelivery!=='function')fail('RETAIL_DELIVERY_QUOTE_PROTOCOL_UNSUPPORTED');
      return buyer.quoteDelivery(address);
    }),
    metrics(id) {
      const root=path.join(rootFor(id),'native');
      if(!existsSync(root))return {nativeRequests:0,responseBodyBytes:0};
      return readdirSync(root).filter(n=>n.endsWith('.json')).reduce((m,n)=>{
        const r=read(path.join(root,n));
        if(Number.isInteger(r.httpStatus)&&Number.isInteger(r.bodyBytes)){m.nativeRequests++;m.responseBodyBytes+=r.bodyBytes;}
        return m;
      },{nativeRequests:0,responseBodyBytes:0});
    },
    bindOrder: (id, reference) => run(id, () => reference ? adapter(id).attachOrder(reference) : adapter(id).readOrder()),
    currentOrder: id => run(id,()=>adapter(id).readOrder({preferWebhook:true})),
    platformStatus:()=>platform.verify(),
    async acceptShopifyOrderEvent(envelope){
      const event=verifyShopifyOrderEvent(envelope,platform.webhookSecret());
      const identity=id=>typeof id==='string'?id.split('?')[0]:null;
      const ids=readdirSync(directory).filter(id=>/^retail_[a-f0-9]{32}$/u.test(id)).filter(id=>{
        const root=rootFor(id),binding=path.join(root,'native','checkout-session.json');
        return existsSync(binding)&&read(path.join(root,'request.json')).protocol===SHOPIFY_BUYER_PROTOCOL
          &&identity(read(binding).id)===identity(event.order.checkout_id);
      });
      if(ids.length!==1)return {state:'ORDER_EVENT_NOT_BOUND_TO_THIS_NODE',accepted:false,changed:false,transactionIds:[]};
      const result=await run(ids[0],()=>adapter(ids[0]).acceptVerifiedOrderEvent(event));
      return {schema:'outsider/provider-lifecycle-intake/v1',...result,accepted:true,
        transactionIds:result.changed||result.state==='ORDER_EVENT_DUPLICATE'?[ids[0]]:[],paymentPerformed:false,physicalDeliveryProven:false};
    },
    planZeroTotalOrder:(id,command)=>run(id,()=>{
      const buyer=adapter(id);
      if(typeof buyer.planZeroTotalCheckout!=='function')fail('RETAIL_NATIVE_ZERO_TOTAL_CHECKOUT_NOT_SUPPORTED');
      return buyer.planZeroTotalCheckout(command);
    }),
    planPayLaterOrder:(id,command)=>run(id,()=>{
      const buyer=adapter(id);
      if(typeof buyer.planPayLaterCheckout!=='function')fail('RETAIL_PAY_LATER_CHECKOUT_NOT_SUPPORTED');
      return buyer.planPayLaterCheckout(command);
    }),
    buyerNextAction:id=>run(id,()=>{
      const buyer=adapter(id);
      if(typeof buyer.buyerNextAction!=='function')fail('RETAIL_BUYER_PAYMENT_ACTION_NOT_SUPPORTED');
      return buyer.buyerNextAction();
    }),
    digitalArtifact:id=>run(id,()=>{
      const root=rootFor(id),request=read(path.join(root,'request.json'));
      if(request.protocol!=='WOOCOMMERCE_DIGITAL_GOODS_V1')fail('DIGITAL_GOODS_TRANSACTION_REQUIRED');
      const directory=path.join(root,'digital-delivery'),delivery=createDigitalGoodsDelivery({directory,buyer:adapter(id),origin:request.storeUrl,clock});
      const receipt=delivery.inspect();if(!receipt)fail('DIGITAL_GOODS_FILE_NOT_RECEIVED');
      return {bytes:readFileSync(path.join(directory,receipt.fileName)),artifactHash:receipt.artifactHash,contentType:'application/zip'};
    }),
    async orderFollowup(id, command) {
      if (!command || !["WATCH", "INSPECT", "STOP"].includes(command.action)) fail("RETAIL_FOLLOWUP_COMMAND_INVALID");
      const expected = command.action === "WATCH" ? (command.orderReference ? "action,orderReference,until" : "action,until") : "action";
      if (Object.keys(command).sort().join(",") !== expected) fail("RETAIL_FOLLOWUP_COMMAND_INVALID");
      if (command.action === 'WATCH' && read(path.join(rootFor(id), 'request.json')).protocol === SHOPIFY_BUYER_PROTOCOL)
        fail('RETAIL_ORDER_WEBHOOK_CONNECTION_REQUIRED');
      return run(id, () => command.action === "WATCH" ? followup(id).watch(command)
        : command.action === "STOP" ? followup(id).stop() : followup(id).poll({ force: true }));
    },
    async pollDueOrders() {
      if (closing) return { checked: 0 };
      const due = readdirSync(directory).filter(id => /^retail_[a-f0-9]{32}$/u.test(id) && !pending.has(id)
        && existsSync(path.join(rootFor(id), "followup"))).map(id => ({ id, status: followup(id).inspect() }))
        .filter(row => row.status.monitoring && Date.parse(row.status.nextPollAt) <= Date.parse(clock()))
        .sort((a, b) => a.status.nextPollAt.localeCompare(b.status.nextPollAt)).slice(0, 4);
      const results = await Promise.allSettled(due.map(row => run(row.id, () => followup(row.id).poll())));
      return { checked: results.length, errors: results.filter(row => row.status === "rejected").length };
    },
    close: async () => { closing = true; await Promise.allSettled(pending.values()); },
  });
}
