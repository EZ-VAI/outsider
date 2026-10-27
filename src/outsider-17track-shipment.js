/* Native 17TRACK v2.4, not a browser or a merchant's completed flag.
 * Only order-bound numbers enter here. Account setup is platform-wide;
 * registration consumes an explicitly approved zero-cost quota, never buys it.
 * Official contract: https://api.17track.net/en/doc (retrieved 2026-09-07).
 */
import path from "node:path";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, writeSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { publicDatasetHash as digest } from "./outsider-public-dataset.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce,
  withUserHeldExecutionLockV2 } from "./outsider-user-held-durable-execution-v2.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw Object.assign(new Error(code), { code }); };
const instant = value => typeof value === "string" && Number.isFinite(Date.parse(value));
const HASH = /^sha256:[a-f0-9]{64}$/u;
export const shipmentConnectionFile = nodeDirectory => path.join(nodeDirectory, "connections", "shipment-tracking.json");

// One owner connection for the existing adapter. A quota read neither registers
// a shipment nor establishes that a parcel, delivery, or free quota is reserved.
export async function connectShipmentTrackingPlatform({ nodeDirectory, input,
  fetchImpl = globalThis.fetch, clock = () => new Date().toISOString() }) {
  const now = clock();
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).sort().join(',') !== 'apiToken,expiresAt,freeQuotaConfirmed'
    || typeof input.apiToken !== 'string' || !/^[\x21-\x7E]{1,2048}$/u.test(input.apiToken)
    || input.freeQuotaConfirmed !== true || !instant(now) || !instant(input.expiresAt)
    || new Date(input.expiresAt).toISOString() !== input.expiresAt || Date.parse(input.expiresAt) <= Date.parse(now))
    fail('SHIPMENT_CONNECTION_INPUT_INVALID');
  const apiToken = input.apiToken, expiresAt = input.expiresAt;
  const privateDirectory = directory => {
    let stat;
    try { stat = lstatSync(directory); } catch { fail('SHIPMENT_CONNECTION_DIRECTORY_INVALID'); }
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700)
      fail('SHIPMENT_CONNECTION_DIRECTORY_INVALID');
  };
  if (typeof nodeDirectory !== 'string' || !path.isAbsolute(nodeDirectory)) fail('SHIPMENT_CONNECTION_DIRECTORY_INVALID');
  privateDirectory(nodeDirectory);
  const root = realpathSync(nodeDirectory), folder = path.join(root, 'connections'), file = shipmentConnectionFile(root);
  if (existsSync(folder)) privateDirectory(folder);
  const result = state => ({ state, connection: shipmentConnectionStatus(root, clock),
    shipmentRegistered: false, paymentPerformed: false, credentialExposed: false });
  return withUserHeldExecutionLockV2(digest({ kind: 'SHIPMENT_PLATFORM_CONNECTION', nodeDirectory: root }), async () => {
    // Even an expired historical profile can be referenced by accepted orders.
    // Rotation needs a separate explicit successor; this entry never overwrites it.
    if (existsSync(file)) return result('ALREADY_CONNECTED');
    let response, bytes;
    try {
      response = await fetchImpl('https://api.17track.net/track/v2.4/getquota', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', '17token': apiToken }, body: '[]' });
      bytes = Buffer.from(await response.arrayBuffer());
    } catch { fail('SHIPMENT_TOKEN_VERIFICATION_UNAVAILABLE'); }
    if (bytes.length > 64 * 1024) fail('SHIPMENT_API_RESPONSE_TOO_LARGE');
    if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) fail('SHIPMENT_API_RESPONSE_INVALID');
    if (response.status !== 200) fail(`SHIPMENT_TOKEN_VERIFICATION_HTTP_${response.status}`);
    let document;
    try { document = JSON.parse(bytes); } catch { fail('SHIPMENT_API_RESPONSE_INVALID'); }
    if (document?.code !== 0) fail('SHIPMENT_API_REJECTED');
    const remaining = document.data?.quota_remain, used = document.data?.quota_used ?? null;
    if (!Number.isSafeInteger(remaining) || remaining < 0
      || used !== null && (!Number.isSafeInteger(used) || used < 0)) fail('SHIPMENT_API_QUOTA_INVALID');
    if (remaining === 0) fail('SHIPMENT_FREE_QUOTA_EXHAUSTED');
    const observedAt = clock();
    if (!instant(observedAt) || Date.parse(observedAt) < Date.parse(now)
      || Date.parse(observedAt) >= Date.parse(expiresAt)) fail('SHIPMENT_CONNECTION_VERIFICATION_EXPIRED');
    const verification = { source: '17TRACK_NATIVE_API_V2_4', method: 'POST', route: '/track/v2.4/getquota',
      httpStatus: response.status, observedAt, bodyBytes: bytes.length,
      bodyHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, remaining, used };
    // The account read reports a balance, not its billing origin. The owner
    // separately confirms the existing free-quota scope; no paid quota is bought.
    mkdirSync(folder, { recursive: true, mode: 0o700 }); privateDirectory(folder);
    const apiKeyFile = path.join(folder, `shipment-tracking-key-${randomUUID()}.txt`);
    const tokenBytes = Buffer.from(`${apiToken}\n`);
    let fd;
    try {
      fd = openSync(apiKeyFile, 'wx', 0o600);
      let offset = 0;
      while (offset < tokenBytes.length) offset += writeSync(fd, tokenBytes, offset);
      fsyncSync(fd);
    } finally { if (fd !== undefined) closeSync(fd); }
    writeOnce(file, { schema: 'outsider/shipment-tracking-connection/v1', provider: '17TRACK', apiKeyFile,
      freeQuotaApproved: true, maximumChargeMinor: '0', expiresAt,
      connectedAt: observedAt, verification, freeQuotaScopeSource: 'EXPLICIT_OWNER_CONFIRMATION',
      noPaidQuotaPurchase: true });
    return { ...result('CONNECTED'), quota: { remaining, used, observedAt } };
  });
}

export function normalizeShipmentBinding(value) {
  if (!value || Object.keys(value).sort().join(",") !== "carrier,number,orderRefHash,recipientCountry,recipientPostcode,source"
    || !/^[A-Za-z0-9][A-Za-z0-9 -]{3,79}$/u.test(value.number ?? "")
    || !(Number.isSafeInteger(value.carrier)&&value.carrier>0
      ||value.carrier===null&&value.source==='MERCHANT_BUYER_ORDER_API') || !HASH.test(value.orderRefHash ?? "")
    || !/^[A-Z]{2}$/u.test(value.recipientCountry ?? "") || typeof value.recipientPostcode !== "string"
    || !value.recipientPostcode.trim() || value.recipientPostcode.length > 20
    || !["MERCHANT_BUYER_ORDER_API", "AUTHORIZED_BUYER_HANDOFF"].includes(value.source)) fail("SHIPMENT_BINDING_INVALID");
  return { ...value };
}
export function shipmentConnectionStatus(nodeDirectory, clock = () => new Date().toISOString()) {
  const file = shipmentConnectionFile(nodeDirectory);
  if (!existsSync(file)) return { connected: false, reason: "SHIPMENT_API_CONNECTION_REQUIRED" };
  try {
    const p = read(file);
    return { connected: p.provider === "17TRACK" && p.freeQuotaApproved === true && p.maximumChargeMinor === "0"
      && path.isAbsolute(p.apiKeyFile ?? "") && existsSync(p.apiKeyFile) && Date.parse(p.expiresAt) > Date.parse(clock()),
    provider: "17TRACK", credentialExposed: false, noPaidQuotaPurchase: true };
  } catch { return { connected: false, reason: "SHIPMENT_API_CONNECTION_INVALID" }; }
}
export function create17TrackShipmentAdapter({ directory, nodeDirectory, profileFile = shipmentConnectionFile(nodeDirectory),
  fetchImpl = globalThis.fetch, clock = () => new Date().toISOString() }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  function profile() {
    if (!existsSync(profileFile)) fail("SHIPMENT_API_CONNECTION_REQUIRED");
    const p = read(profileFile);
    if (p.provider !== "17TRACK" || p.freeQuotaApproved !== true || p.maximumChargeMinor !== "0"
      || !path.isAbsolute(p.apiKeyFile ?? "") || !instant(p.expiresAt) || Date.parse(p.expiresAt) <= Date.parse(clock()))
      fail("SHIPMENT_API_CONNECTION_INVALID");
    return p;
  }
  async function call(operation, body = []) {
    const p = profile(), apiKey = readPrivateExecutionBytes(p.apiKeyFile).toString("utf8").trim();
    if (!apiKey || /\s/u.test(apiKey)) fail("SHIPMENT_API_CREDENTIAL_INVALID");
    const response = await fetchImpl(`https://api.17track.net/track/v2.4/${operation}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/json", "17token": apiKey }, body: JSON.stringify(body) });
    const bytes = Buffer.from(await response.arrayBuffer());
    const receipt = { source: "17TRACK_NATIVE_API_V2_4", operation, observedAt: clock(), httpStatus: response.status,
      bodyBytes: bytes.length, bodyHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
    writeOnce(path.join(directory, `${operation}-${randomUUID()}.json`), { ...receipt, bodyBase64: bytes.toString("base64") });
    if (!response.ok) fail(`SHIPMENT_API_HTTP_${response.status}`);
    let document; try { document = JSON.parse(bytes); } catch { fail("SHIPMENT_API_RESPONSE_INVALID"); }
    if (document.code !== 0) fail("SHIPMENT_API_REJECTED");
    return { data: document.data, receipt: { ...receipt, receiptHash: digest(receipt) } };
  }
  async function quota() {
    const { data, receipt } = await call("getquota");
    if (!Number.isSafeInteger(data?.quota_remain)) fail("SHIPMENT_API_QUOTA_INVALID");
    return { remaining: data.quota_remain, used: data.quota_used ?? null, receipt, paymentPerformed: false };
  }
  async function observe(raw) {
    const binding = normalizeShipmentBinding(raw), shipmentRefHash = digest(binding);
    const key = shipmentRefHash.slice(7), saved = path.join(directory, `registered-${key}.json`);
    let resolvedCarrier=existsSync(saved)?read(saved).carrier??binding.carrier:binding.carrier;
    const query = [{ number: binding.number, ...(resolvedCarrier?{carrier:resolvedCarrier}:{}) }];
    if (!existsSync(saved)) {
      if ((await quota()).remaining < 1) fail("SHIPMENT_FREE_QUOTA_EXHAUSTED");
      const registered = await call("register", [{ ...query[0], destination_country: binding.recipientCountry,
        destination_postal_code: binding.recipientPostcode }]);
      const matches=registered.data?.accepted?.filter(row=>row.number===binding.number
        && (binding.carrier===null||row.carrier===binding.carrier))??[];
      const accepted=matches.length===1?matches[0]:null;
      // API register supports omitted carrier. Origin=3 is only a guess; don't
      // turn it into an authoritative carrier binding or an item outcome.
      if(binding.carrier===null&&(!accepted||![1,2].includes(accepted.origin)
        ||!Number.isSafeInteger(accepted.carrier)||accepted.carrier<1))fail('SHIPMENT_CARRIER_IDENTITY_UNRESOLVED');
      // A previous successful registration can have been interrupted before the
      // local receipt was persisted. A read proves that same account binding;
      // no invented success, credit purchase or alternative number is used.
      if (accepted) {
        resolvedCarrier=accepted.carrier;query[0].carrier=resolvedCarrier;
        writeOnce(saved, { shipmentRefHash, carrier:resolvedCarrier, carrierDetectionOrigin:accepted.origin??null,receipt: registered.receipt });
      }
    }
    const current = await call("gettrackinfo", query);
    const row = current.data?.accepted?.find(item => item.number === binding.number && item.carrier === resolvedCarrier);
    if (!row) fail("SHIPMENT_NUMBER_NOT_AVAILABLE_TO_ACCOUNT");
    if (!existsSync(saved)) writeOnce(saved, { shipmentRefHash, receipt: current.receipt, recoveredFromAccountRead: true });
    const info = row.track_info ?? {}, latest = info.latest_status?.status ?? "NotFound";
    const dated = value => instant(value) && Date.parse(value) <= Date.parse(clock()) ? new Date(value).toISOString() : null;
    const milestone = stage => (info.milestone ?? []).find(item => item.key_stage === stage);
    const delivered = milestone("Delivered"), pickedUp = milestone("PickedUp");
    const deliveredAt = latest === "Delivered" ? dated(delivered?.time_utc ?? delivered?.time_iso
      ?? (info.latest_event?.stage === "Delivered" ? info.latest_event.time_utc ?? info.latest_event.time_iso : null)) : null;
    const postal = info.shipping_info?.recipient_address, country = postal?.country, postcode = postal?.postal_code;
    const norm = value => String(value ?? "").replace(/[\s-]/gu, "").toUpperCase();
    const destinationMismatch = !!country && norm(country) !== norm(binding.recipientCountry)
      || !!postcode && norm(postcode).slice(0, 5) !== norm(binding.recipientPostcode).slice(0, 5);
    return { schema: "outsider/carrier-shipment-observation/v1", shipmentRefHash, orderRefHash: binding.orderRefHash,
      source: "CARRIER_VIA_17TRACK", orderToShipmentLinkSource: binding.source,
      carrier: resolvedCarrier, carrierStatus: latest, carrierSubstatus: info.latest_status?.sub_status ?? null,
      observedAt: current.receipt.observedAt, dispatchedAt: dated(pickedUp?.time_utc ?? pickedUp?.time_iso),
      dispatched: !!dated(pickedUp?.time_utc ?? pickedUp?.time_iso) || ["InTransit", "OutForDelivery", "AvailableForPickup", "Delivered"].includes(latest),
      carrierReportedDelivered: latest === "Delivered", deliveredAt, destinationMismatch,
      destinationMatchedByCarrier: !!country && !!postcode && !destinationMismatch,
      estimatedDelivery: info.time_metrics?.estimated_delivery_date ?? null,
      receipt: current.receipt, independentItemInspection: false, physicalOutcomeProven: false, paymentPerformed: false };
  }
  return { quota, observe };
}
