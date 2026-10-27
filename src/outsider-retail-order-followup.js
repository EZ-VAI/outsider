/* Normal post-order follow-up, not another task scheduler. The existing Node
 * maintenance tick calls poll(); all supplier operations here are buyer GETs.
 * An accepted or completed seller order never satisfies physical acceptance. */
import path from "node:path";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { interfaceDigest as digest } from "./outsider-openapi-demand-matcher.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce,
  withUserHeldExecutionLockV2 as locked } from "./outsider-user-held-durable-execution-v2.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const instant = value => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const safeError = error => /^RETAIL_[A-Z0-9_]+$/u.test(error?.code ?? "") ? error.code : "RETAIL_ORDER_READ_UNAVAILABLE";

export function createRetailOrderFollowup({ directory, transactionId, adapter,
  clock = () => new Date().toISOString(), intervalMs = 300000 }) {
  const configs = path.join(directory, "registrations"), observations = path.join(directory, "observations");
  const records = root => existsSync(root) ? readdirSync(root).filter(n => /^\d{8}\.json$/u.test(n)).sort().map(n => read(path.join(root, n))) : [];
  const append = (root, body) => { mkdirSync(root, { recursive: true, mode: 0o700 });
    const sequence = (records(root).at(-1)?.sequence ?? 0) + 1;
    const value = { ...body, sequence }; writeOnce(path.join(root, `${String(sequence).padStart(8, "0")}.json`), value); return value; };
  const lock = operation => locked(digest({ directory, kind: "RETAIL_ORDER_FOLLOWUP" }), operation);
  function current() {
    const registration = records(configs).at(-1) ?? null;
    const latest = registration ? records(observations).filter(row => registration.action === "STOP" || row.registrationSequence === registration.sequence).at(-1) ?? null : null;
    return { registration, latest };
  }
  function inspect() {
    const { registration, latest } = current();
    return { schema: "outsider/retail-order-followup/v1", transactionId,
      state: registration?.action === "STOP" ? "MONITORING_STOPPED" : latest?.state ?? "NOT_MONITORING",
      monitoring: registration?.action === "WATCH" && !!latest?.nextPollAt,
      until: registration?.until ?? null, nextPollAt: registration?.action === "STOP" ? null : latest?.nextPollAt ?? null,
      observationCount: records(observations).length,
      latestObservation: latest?.order ?? null, lastReadError: latest?.error ?? null,
      sellerOrderAccepted: latest?.order?.sellerOrderAccepted ?? false,
      physicalDeliveryProven: false, independentInspectionAvailable: false, resultPromiseIssued: false,
      monitoringIsNotOrderCancellation: true, paymentPerformed: false };
  }
  function recordOrder(registration, order) {
    const now = clock(), status = order.sellerOrderStatus;
    const state = ["cancelled", "failed", "refunded"].includes(status) ? "SELLER_CLOSED_WITHOUT_DELIVERY_PROOF"
      : status === "completed" ? "AWAITING_DELIVERY_EVIDENCE"
        : status === "processing" ? "AWAITING_DISPATCH_EVIDENCE"
          : order.needsPayment ? "ORDER_AWAITING_PAYMENT" : "AWAITING_SELLER_ACCEPTANCE";
    const nextPollAt = state === "SELLER_CLOSED_WITHOUT_DELIVERY_PROOF" ? null
      : new Date(Math.min(Date.parse(now) + intervalMs, Date.parse(registration.until))).toISOString();
    append(observations, { registrationSequence: registration.sequence, state, order, observedAt: now, nextPollAt, error: null });
    return inspect();
  }
  return {
    inspect,
    watch: ({ until, orderReference }) => lock(async () => {
      if (!instant(until) || Date.parse(until) <= Date.parse(clock())) fail("RETAIL_FOLLOWUP_DEADLINE_INVALID");
      const order = orderReference ? await adapter.attachOrder(orderReference) : await adapter.readOrder();
      const { registration: previous } = current();
      const registration = previous?.action === "WATCH" && previous.until === until ? previous : append(configs, {
        action: "WATCH", transactionId, until, registeredAt: clock(), orderRefHash: order.orderRefHash,
        readsOnly: true, originalOrderCreator: order.acquisitionSource });
      return recordOrder(registration, order);
    }),
    stop: () => lock(async () => {
      const { registration } = current();
      if (registration && registration.action !== "STOP") append(configs, { ...registration, action: "STOP", stoppedAt: clock() });
      return inspect();
    }),
    poll: ({ force = false } = {}) => lock(async () => {
      const { registration, latest } = current();
      if (registration?.action !== "WATCH" || !latest?.nextPollAt) return inspect();
      const now = clock();
      if (Date.parse(now) >= Date.parse(registration.until)) {
        append(observations, { registrationSequence: registration.sequence, state: "MONITORING_WINDOW_ENDED",
          order: latest.order, observedAt: now, nextPollAt: null, error: null });
        return inspect();
      }
      if (!force && Date.parse(now) < Date.parse(latest.nextPollAt)) return inspect();
      try { return recordOrder(registration, await adapter.readOrder()); }
      catch (error) {
        const code = safeError(error), needsConnection = /HTTP_(401|403|404)$/u.test(code);
        const consecutiveErrors = (latest.consecutiveErrors ?? 0) + 1;
        append(observations, { registrationSequence: registration.sequence,
          state: needsConnection ? "BUYER_READ_CONNECTION_REQUIRED" : "ORDER_OBSERVATION_DELAYED", order: latest.order,
          observedAt: now, error: code, consecutiveErrors, nextPollAt: needsConnection ? null
            : new Date(Math.min(Date.parse(now) + Math.min(intervalMs * 2 ** Math.min(consecutiveErrors, 4), 900000), Date.parse(registration.until))).toISOString() });
        return inspect();
      }
    }),
  };
}

// Local projection only. Inspecting the goal must not secretly call a merchant.
export function readRetailOrderFollowup({ nodeDirectory, transactionId }) {
  if (!/^retail_[a-f0-9]{32}$/u.test(transactionId ?? "")) fail("RETAIL_TRANSACTION_ID_INVALID");
  return createRetailOrderFollowup({ directory: path.join(nodeDirectory, "retail-transactions", transactionId, "followup"),
    transactionId, adapter: null }).inspect();
}
