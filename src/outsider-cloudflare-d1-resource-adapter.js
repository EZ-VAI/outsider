/* Task-owned, three-record D1 resource lifecycle. No arbitrary SQL, billing,
 * account inventory ownership inference, recovery orchestrator or outcome witness.
 * Caller scope is not provider billing proof; assess permission/cost before use.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { normalizePublicDataset } from "./outsider-public-dataset.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce }
  from "./outsider-user-held-durable-execution-v2.js";
import {
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
  replayDurableOneUseEndpointEffectStatesSinceV1,
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const ORIGIN = "https://api.cloudflare.com";
const CAPABILITY = "D1_SYNTHETIC_THREE_RECORD_WORKSPACE";
const SCHEMA_SQL = "CREATE TABLE outsider_records (id TEXT PRIMARY KEY, value TEXT NOT NULL)";
const WRITE_SQL = "INSERT INTO outsider_records (id, value) VALUES (?, ?), (?, ?), (?, ?)";
const READ_SQL = "SELECT id, value FROM outsider_records ORDER BY id";
const SCHEMA_READ_SQL = "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?";
export const CLOUDFLARE_D1_RESOURCE_PROTOCOL = Object.freeze({
  capability: CAPABILITY, origin: ORIGIN, paymentPerformed: false,
  dataScope: "EXACTLY_THREE_CALLER_DECLARED_SYNTHETIC_ID_VALUE_RECORDS",
  ownershipEvidence: "ORIGINAL_CREATE_RECEIPT_UUID_AND_CURRENT_EXACT_DATABASE_READ",
  providerObservationIndependent: false, automaticExpiry: false,
  sources: Object.freeze([
    "https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/",
    "https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/",
    "https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/",
    "https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/delete/",
    "https://developers.cloudflare.com/d1/platform/pricing/",
  ]),
});
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const digest = value => hash(canonicalizeStrict(value));
function fail(code, recoverable = false) {
  const error = new Error(`OUTSIDER_CLOUDFLARE_D1_${code}`);
  error.outsiderCode = code; error.recoverable = recoverable; throw error;
}
function instant(value) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    || !Number.isFinite(Date.parse(value))) fail("INSTANT_INVALID");
  return new Date(value).toISOString();
}
function privateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) fail("DIRECTORY_NOT_PRIVATE");
  return realpathSync(directory);
}
function normalizedRecords(input) {
  if (!Array.isArray(input) || input.length !== 3 || input.some(row => !row
    || Object.keys(row).sort().join(",") !== "id,value" || !ID.test(row.id ?? "")
    || typeof row.value !== "string" || Buffer.byteLength(row.value) > 1024)
    || new Set(input.map(row => row.id)).size !== 3) fail("RECORDS_INVALID");
  return input.map(({ id, value }) => ({ id, value })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function json(source) {
  try { return JSON.parse(Buffer.from(source.bodyBase64, "base64").toString("utf8")); }
  catch { return null; }
}
function accepted(source) {
  return source.status >= 200 && source.status < 300 && json(source)?.success === true;
}
function queryRows(source) {
  const result = json(source)?.result;
  return accepted(source) && Array.isArray(result) && result.length === 1
    && result[0]?.success === true && Array.isArray(result[0].results) ? result[0].results : null;
}

export function createCloudflareD1ResourceAdapter(config = {}) {
  return createD1Resource(config, false);
}

// Explicit successor capability. The old three-synthetic-record API is unchanged.
export function createCloudflareD1PublicDatasetAdapter(config = {}) {
  return createD1Resource(config, true);
}

function createD1Resource(config, publicDataset) {
  const capability = publicDataset ? "PUBLIC_DATASET_STORAGE_V1" : CAPABILITY;
  const normalize = publicDataset
    ? rows => normalizePublicDataset({ visibility: "PUBLIC", records: rows }).records : normalizedRecords;
  if (!/^[a-f0-9]{32}$/u.test(config.accountId ?? "") || !path.isAbsolute(config.directory ?? "")
    || typeof config.getApiToken !== "function" || (publicDataset ? config.publicData !== true : config.syntheticData !== true)
    || config.zeroCostScope?.confirmed !== true || !HASH.test(config.zeroCostScope?.refHash ?? "")
    || (config.recordSourceRefHash !== undefined && !HASH.test(config.recordSourceRefHash))
    || ["origin", "apiOrigin", "baseUrl", "endpoint", "sql", "databaseId", "databaseName"].some(key => Object.hasOwn(config, key))) {
    fail("CONFIG_INVALID");
  }
  const records = normalize(config.records);
  const recordsHash = digest(records);
  const scope = { confirmed: true, refHash: config.zeroCostScope.refHash,
    expiresAt: instant(config.zeroCostScope.expiresAt) };
  const requestTimeoutMs = config.requestTimeoutMs ?? 15_000;
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const clock = config.clock ?? (() => new Date().toISOString());
  const adapterId = config.adapterId ?? (publicDataset ? "cloudflare-d1-public-dataset" : "cloudflare-d1-three-record-workspace");
  if (!ID.test(adapterId) || typeof fetchImpl !== "function" || typeof clock !== "function"
    || !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60_000) fail("CONFIG_INVALID");
  const sourceKind = Object.hasOwn(config, "fetchImpl") ? "PROVIDER_FIXTURE" : "CLOUDFLARE_D1_API";
  const root = privateDirectory(config.directory);
  const sources = privateDirectory(path.join(root, "sources"));
  const base = `/client/v4/accounts/${config.accountId}/d1/database`;
  const now = () => instant(clock());
  const read = file => JSON.parse(readPrivateExecutionBytes(file));
  const instance = { adapterId, accountId: config.accountId, recordsHash, sourceKind,
    recordSourceRefHash: config.recordSourceRefHash ?? null, zeroCostScope: scope };
  async function request(method, pathname, body, file) {
    const token = await config.getApiToken({ accountId: config.accountId, scope: CAPABILITY });
    if (typeof token !== "string" || !/^[\x21-\x7e]{1,4096}$/u.test(token)) fail("API_TOKEN_INVALID");
    const response = await fetchImpl(`${ORIGIN}${pathname}`, { method,
      headers: { authorization: `Bearer ${token}`, accept: "application/json",
        ...(body === null ? {} : { "content-type": "application/json" }) },
      ...(body === null ? {} : { body: canonicalizeStrict(body) }),
      redirect: "error", signal: AbortSignal.timeout(requestTimeoutMs) });
    if (!(response instanceof Response)) fail("RESPONSE_INVALID");
    const chunks = []; let length = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          length += value.length;
          if (length > 512 * 1024) { await reader.cancel(); fail("RESPONSE_TOO_LARGE"); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
    }
    const source = { method, path: pathname, requestBodyHash: body === null ? null : digest(body),
      observedAt: now(), sourceKind, status: response.status, providerDate: response.headers.get("date"),
      bodyBase64: Buffer.concat(chunks).toString("base64") };
    writePrivateExecutionRecordOnce(file, source);
    return { ...source, providerReceipt: hash(readPrivateExecutionBytes(file)) };
  }
  const observe = (pathname, body = null) => request(body === null ? "GET" : "POST", pathname, body,
    path.join(sources, `${randomBytes(16).toString("hex")}.json`));

  // The existing one-use ledger records attempted submission before contact.
  // This is local no-retry coordination, not Cloudflare idempotency support.
  async function oneUse({ binding, kind, method, pathname, body, deadline, observeOnly = false }) {
    const effectIdHash = digest({ operationRefHash: binding.operationRefHash, kind });
    const effectRoot = privateDirectory(path.join(root, effectIdHash.slice(7)));
    const ledgerDirectory = path.join(effectRoot, "effect-ledger");
    const ledgerId = `ledger_${effectIdHash.slice(7, 39)}`;
    const sourceFile = path.join(effectRoot, "source.json");
    const fields = { effectIdHash, transactionBindingHash: digest(binding),
      endpointBindingHash: digest({ origin: ORIGIN, method, pathname }), adapterInstanceRefHash: digest(instance),
      permissionGrantHash: binding.permissionGrantHash, oneUseNonceHash: digest({ effectIdHash, kind: "nonce" }),
      idempotencyKeyHash: digest({ effectIdHash, kind: "local-no-retry-key" }), bodyHash: digest(body),
      effectDeadline: instant(deadline) };
    let current; let verification;
    const event = (eventType, endpointReceiptHash = null) => createDurableOneUseEndpointEffectEventV1({
      ...fields, ledgerId, eventType, recordedAt: now(), previousEffectEventHash: current?.eventHash ?? null,
      occurrenceNonceHash: hash(randomBytes(32)), endpointReceiptHash, terminalEvidenceHash: null });
    const append = (type, receipt = null) => {
      const next = event(type, receipt);
      verification = appendDurableOneUseEndpointEffectLedgerV1({ directory: ledgerDirectory,
        ledgerId, event: next, expectedLocalHeadHash: verification.head.headHash }); current = next;
    };
    if (existsSync(ledgerDirectory)) {
      verification = verifyDurableOneUseEndpointEffectLedgerV1({ directory: ledgerDirectory,
        ledgerId, expectedLocalHeadHash: null });
      if (!verification.ok) fail("EFFECT_LEDGER_INVALID");
      current = replayDurableOneUseEndpointEffectStatesSinceV1({ directory: ledgerDirectory,
        ledgerId, expectedAncestorHeadHash: verification.head.headHash,
        effectIdHashes: [effectIdHash] }).effects[0]?.currentEvent;
      if (!current || Object.entries(fields).some(([key, value]) => current[key] !== value)) fail("OPERATION_REUSED_WITH_DIFFERENT_INPUT");
      if (existsSync(sourceFile)) {
        const source = { ...read(sourceFile), providerReceipt: hash(readPrivateExecutionBytes(sourceFile)) };
        if (current.eventType === "SUBMIT_ATTEMPTED") append("ENDPOINT_RECEIPT_OBSERVED", source.providerReceipt);
        else if (current.eventType !== "ENDPOINT_RECEIPT_OBSERVED"
          || current.endpointReceiptHash !== source.providerReceipt) fail("SOURCE_RECEIPT_MISMATCH");
        return source;
      }
      if (["SUBMIT_ATTEMPTED", "ENDPOINT_RECEIPT_OBSERVED"].includes(current.eventType)) return { ambiguous: true };
    } else {
      if (observeOnly) return { notSubmitted: true };
      if (Date.parse(now()) >= Date.parse(fields.effectDeadline) || Date.parse(now()) >= Date.parse(scope.expiresAt)) fail("MUTATION_SCOPE_EXPIRED");
      current = event("INTENT_ADMITTED");
      verification = initializeDurableOneUseEndpointEffectLedgerV1({ directory: ledgerDirectory, ledgerId, genesisEvent: current });
    }
    if (observeOnly) return { notSubmitted: true };
    if (Date.parse(now()) >= Date.parse(fields.effectDeadline) || Date.parse(now()) >= Date.parse(scope.expiresAt)) fail("MUTATION_SCOPE_EXPIRED");
    if (current.eventType === "INTENT_ADMITTED") append("SUBMIT_RESERVED");
    append("SUBMIT_ATTEMPTED");
    let source;
    try { source = await request(method, pathname, body, sourceFile); }
    catch { return { ambiguous: true }; }
    append("ENDPOINT_RECEIPT_OBSERVED", source.providerReceipt); return source;
  }
  const supports = requirement => requirement?.capability === capability
    && (requirement.constraints?.recordCount ?? records.length) === records.length
    && (!requirement.constraints?.recordsHash || requirement.constraints.recordsHash === recordsHash);
  function reserveBinding({ program, requirement, operationId, permissionGrantHash }, persist) {
    if (!supports(requirement) || !ID.test(requirement.requirementId ?? "") || !ID.test(operationId ?? "")
      || !HASH.test(program?.programHash ?? "") || !HASH.test(permissionGrantHash ?? "")) fail("OPERATION_BINDING_INVALID");
    // One owned resource per requirement, not one new DB per retry operation id.
    const operationRefHash = digest({ adapterId, programHash: program.programHash, requirementId: requirement.requirementId });
    const binding = { operationRefHash, instance, programHash: program.programHash,
      requirementId: requirement.requirementId, operationId, permissionGrantHash,
      formationDeadline: instant(program.formationDeadline), completionDeadline: instant(program.completionDeadline),
      databaseName: `outsider-${operationRefHash.slice(7, 39)}` };
    const file = path.join(root, `${operationRefHash.slice(7)}-binding.json`);
    if (persist) writePrivateExecutionRecordOnce(file, binding);
    else if (existsSync(file) && canonicalizeStrict(read(file)) !== canonicalizeStrict(binding)) fail("OPERATION_REUSED_WITH_DIFFERENT_INPUT");
    return binding;
  }
  function reservationBinding(reservation) {
    const ref = reservation?.adapterState?.operationRefHash;
    if (!HASH.test(ref ?? "") || reservation.reservationId !== `d1:${ref.slice(7)}`) fail("RESERVATION_INVALID");
    const binding = read(path.join(root, `${ref.slice(7)}-binding.json`));
    if (binding.operationRefHash !== ref || canonicalizeStrict(binding.instance) !== canonicalizeStrict(instance)
      || reservation.adapterState.databaseRefHash !== digest({ accountId: config.accountId, operationRefHash: ref })) fail("RESERVATION_BINDING_MISMATCH");
    return binding;
  }
  async function created(binding, observeOnly = true) {
    const source = await oneUse({ binding, kind: "CREATE", method: "POST", pathname: base,
      body: { name: binding.databaseName }, deadline: binding.formationDeadline, observeOnly });
    if (source.ambiguous) fail("CREATE_UNKNOWN_NO_RETRY", true);
    if (source.notSubmitted) return null;
    const data = json(source)?.result;
    if (!accepted(source) || !UUID.test(data?.uuid ?? "") || data.name !== binding.databaseName) fail("CREATE_NOT_CONFIRMED", true);
    return { databaseId: data.uuid, source };
  }
  async function inspect(binding, owned) {
    const source = await observe(`${base}/${owned.databaseId}`);
    if (source.status === 404) return { status: "RELEASED", sourceKind, capacityOwned: false,
      releaseAttributionConfirmed: false, providerReceipt: source.providerReceipt };
    const data = json(source)?.result;
    if (!accepted(source) || data?.uuid !== owned.databaseId || data.name !== binding.databaseName) fail("DATABASE_READ_UNKNOWN", true);
    return { status: "RESERVED", reservationId: `d1:${binding.operationRefHash.slice(7)}`,
      validUntil: binding.completionDeadline, validUntilBasis: "LOCAL_TASK_HORIZON_NOT_PROVIDER_LEASE",
      automaticExpiry: false, sourceKind, capacityOwned: true, providerReceipt: source.providerReceipt,
      createReceipt: owned.source.providerReceipt, providerObservationIndependent: false,
      adapterState: { operationRefHash: binding.operationRefHash,
        databaseRefHash: digest({ accountId: config.accountId, operationRefHash: binding.operationRefHash }),
        recordsHash, recordSourceRefHash: instance.recordSourceRefHash } };
  }
  async function snapshot({ reservation }) {
    const binding = reservationBinding(reservation); const owned = await created(binding);
    if (!owned) fail("OWNERSHIP_NOT_ESTABLISHED");
    const source = await observe(`${base}/${owned.databaseId}/query`, { sql: READ_SQL, params: [] });
    let observedRecords;
    try { observedRecords = normalize(queryRows(source)); }
    catch { fail("SNAPSHOT_READ_UNKNOWN", true); }
    const snapshot = { schema: "outsider/recoverable-record-snapshot/v1",
      sourceDatabaseRefHash: reservation.adapterState.databaseRefHash,
      sourceReadReceiptHash: source.providerReceipt, recordSchema: "ID_VALUE_STRING_V1", records: observedRecords };
    const snapshotBytes = Buffer.from(canonicalizeStrict(snapshot), "utf8"); // Canonical UTF-8, no trailing LF.
    return { status: "OBSERVED", sourceKind, snapshotBytes, snapshotHash: hash(snapshotBytes),
      recordsHash: digest(observedRecords), recordSourceRefHash: instance.recordSourceRefHash,
      sourceReadReceiptHash: source.providerReceipt,
      providerReceipt: source.providerReceipt, providerObservationIndependent: false };
  }
  const adapter = {
    adapterId, providerRef: "cloudflare", failureDomainRef: "cloudflare-d1",
    roles: Object.freeze(["PRIMARY", "RECOVERY"]), capabilities: Object.freeze([capability]),
    protocol: publicDataset ? { ...CLOUDFLARE_D1_RESOURCE_PROTOCOL, capability,
      dataScope: "CALLER_CONFIRMED_PUBLIC_DATASET_1_TO_100_RECORDS" } : CLOUDFLARE_D1_RESOURCE_PROTOCOL, supports,
    async reserve(context) {
      const binding = reserveBinding(context, true); const owned = await created(binding, false);
      return inspect(binding, owned);
    },
    async reconcileReserve(context) {
      const binding = reserveBinding(context, false); const owned = await created(binding);
      return owned ? inspect(binding, owned) : { status: "UNAVAILABLE", reason: "NO_LOCAL_SUBMISSION", sourceKind };
    },
    async readReservation({ reservation }) {
      const binding = reservationBinding(reservation); const owned = await created(binding);
      if (!owned) fail("OWNERSHIP_NOT_ESTABLISHED"); return inspect(binding, owned);
    },
    snapshot,
    async execute({ reservation }) {
      const binding = reservationBinding(reservation); const owned = await created(binding);
      if (!owned) fail("OWNERSHIP_NOT_ESTABLISHED");
      const current = await inspect(binding, owned);
      if (current.status === "RELEASED") return { status: "FAILED", reason: "OWNED_DATABASE_ABSENT", providerReceipt: current.providerReceipt, sourceKind };
      const pathname = `${base}/${owned.databaseId}/query`;
      const schema = await oneUse({ binding, kind: "SCHEMA", method: "POST", pathname,
        body: { sql: SCHEMA_SQL, params: [] }, deadline: binding.completionDeadline });
      if (schema.ambiguous) {
        const observed = await observe(pathname, { sql: SCHEMA_READ_SQL, params: ["outsider_records"] });
        if (queryRows(observed)?.[0]?.name !== "outsider_records") fail("SCHEMA_UNKNOWN_NO_RETRY", true);
      } else if (queryRows(schema) === null) fail("SCHEMA_NOT_CONFIRMED", true);
      const written = await oneUse({ binding, kind: "ROWS", method: "POST", pathname,
        body: { sql: publicDataset ? `INSERT INTO outsider_records (id, value) VALUES ${records.map(() => "(?, ?)").join(", ")}` : WRITE_SQL,
          params: records.flatMap(row => [row.id, row.value]) }, deadline: binding.completionDeadline });
      if (!written.ambiguous && queryRows(written) === null) fail("WRITE_NOT_CONFIRMED", true);
      const observed = await snapshot({ reservation });
      if (observed.recordsHash !== recordsHash) fail("RECORDS_NOT_EXACT", true);
      return { ...observed, status: "SUCCEEDED", writeReceipt: written.providerReceipt ?? null,
        writeSubmissionAmbiguous: written.ambiguous === true, reconciledBy: "EXACT_ORDERED_SELECT", retryAllowed: false };
    },
    async release({ reservation, program, requirementId, permissionGrantHash, operationId }) {
      const binding = reservationBinding(reservation);
      if (program?.programHash !== binding.programHash || requirementId !== binding.requirementId
        || permissionGrantHash !== binding.permissionGrantHash || !ID.test(operationId ?? "")) fail("RELEASE_BINDING_INVALID");
      const owned = await created(binding); if (!owned) fail("OWNERSHIP_NOT_ESTABLISHED");
      const before = await inspect(binding, owned); if (before.status === "RELEASED") return before;
      // One deletion intent for this owned resource, regardless of cleanup retry id.
      const source = await oneUse({ binding, kind: "DELETE", method: "DELETE",
        pathname: `${base}/${owned.databaseId}`, body: null, deadline: binding.completionDeadline });
      const after = await inspect(binding, owned);
      return { ...after, status: after.status === "RELEASED" ? "RELEASED" : "OPEN",
        releaseReceipt: source.providerReceipt ?? null, releaseSubmissionAmbiguous: source.ambiguous === true,
        releaseAttributionConfirmed: after.status === "RELEASED" && accepted(source), retryAllowed: false };
    },
    async closeObligation(context) {
      const result = await adapter.release(context);
      return result.status === "RELEASED" ? { ...result, status: "CLOSED", receipt: result.providerReceipt } : result;
    },
  };
  return Object.freeze(adapter);
}
