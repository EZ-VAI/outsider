/*
 * A single known seat in a caller-declared Seats.io sandbox workspace.
 * Reuses the native resource adapter shape and durable one-use effect ledger.
 * No booking, ticket sale, attendee, payment, owner signature or guarantee.
 * GET evidence is point-in-time; a temporary hold is not future fulfillment.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
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
const ID = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/u;
const TOKEN = /^[A-Za-z0-9_-]{1,256}$/u;
const CAPABILITY = "RESOURCE_SINGLE_OBJECT_HOLD";
const ORIGINS = Object.freeze({ eu: "https://api-eu.seatsio.net",
  na: "https://api-na.seatsio.net", sa: "https://api-sa.seatsio.net",
  oc: "https://api-oc.seatsio.net" });
export const SEATSIO_CAPACITY_PROTOCOL = Object.freeze({
  capability: CAPABILITY, regionOrigins: ORIGINS,
  token: "POST /hold-tokens", tokenRead: "GET /hold-tokens/{token}",
  hold: "POST /events/{eventKey}/actions/hold?expand=objects",
  objectRead: "GET /events/{eventKey}/objects?label={knownObjectLabel}",
  release: "POST /events/{eventKey}/actions/release?expand=objects",
  sandboxBoundary: "CALLER_DECLARED_WORKSPACE_NOT_SEPARATE_HOST",
  independentOwnerIdentityEstablished: false, outcomeCommitIssued: false,
  bookingPerformed: false, paymentPerformed: false,
  sources: Object.freeze([
    "https://docs.seats.io/docs/api/regions/",
    "https://docs.seats.io/docs/api/authentication/",
    "https://docs.seats.io/docs/api/sandboxes/",
    "https://docs.seats.io/docs/api/create-a-hold-token/",
    "https://docs.seats.io/docs/api/retrieve-a-hold-token/",
    "https://docs.seats.io/docs/api/temporarily-hold-objects/",
    "https://docs.seats.io/docs/api/objects/retrieve-event-object-infos/",
    "https://docs.seats.io/docs/api/get-objects-for-a-hold-token/",
    "https://docs.seats.io/docs/api/release-objects/",
  ]),
});

const fail = code => {
  const error = new Error(`OUTSIDER_SEATSIO_CAPACITY_${code}`);
  error.outsiderCode = code;
  throw error;
};
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const digest = value => hash(canonicalizeStrict(value));
function instant(value) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    || !Number.isFinite(Date.parse(value))) fail("INSTANT_INVALID");
  return new Date(value).toISOString();
}
function privateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) {
    fail("DIRECTORY_NOT_PRIVATE");
  }
  return realpathSync(directory);
}
function json(source) {
  try { return JSON.parse(Buffer.from(source.bodyBase64, "base64").toString("utf8")); }
  catch { return null; }
}

export function createSeatsioCapacityAdapter(config = {}) {
  if (!Object.hasOwn(ORIGINS, config.region) || !ID.test(config.eventKey ?? "")
    || !ID.test(config.objectLabel ?? "") || typeof config.directory !== "string"
    || !path.isAbsolute(config.directory) || typeof config.getWorkspaceSecretKey !== "function"
    || config.sandboxWorkspace?.declaredSandbox !== true
    || !HASH.test(config.sandboxWorkspace?.workspaceRefHash ?? "")
    || !HASH.test(config.sandboxWorkspace?.testScopeRefHash ?? "")
    || ["origin", "apiOrigin", "baseUrl", "endpoint"].some(key => Object.hasOwn(config, key))) {
    fail("CONFIG_INVALID");
  }
  const expiresInMinutes = config.expiresInMinutes ?? 5;
  const requestTimeoutMs = config.requestTimeoutMs ?? 15_000;
  if (!Number.isSafeInteger(expiresInMinutes) || expiresInMinutes < 1 || expiresInMinutes > 15
    || !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60_000) {
    fail("CONFIG_BOUNDS_INVALID");
  }
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const clock = config.clock ?? (() => new Date().toISOString());
  if (typeof fetchImpl !== "function" || typeof clock !== "function") fail("CONFIG_INVALID");
  const sourceKind = config.fetchImpl ? "PROVIDER_FIXTURE" : "SEATSIO_API";
  const root = privateDirectory(config.directory);
  const sourceRoot = privateDirectory(path.join(root, "sources"));
  const origin = ORIGINS[config.region];
  const adapterId = config.adapterId ?? "seatsio-single-object-hold";
  const eventPath = `/events/${encodeURIComponent(config.eventKey)}`;
  const objectPath = `${eventPath}/objects?${new URLSearchParams({ label: config.objectLabel })}`;
  const now = () => instant(clock());
  const instance = { adapterId, origin, eventKey: config.eventKey, objectLabel: config.objectLabel,
    sourceKind, sandboxWorkspace: config.sandboxWorkspace };
  const read = file => JSON.parse(readPrivateExecutionBytes(file));

  async function request(method, pathname, body, file) {
    const key = await config.getWorkspaceSecretKey({ region: config.region,
      workspaceRefHash: config.sandboxWorkspace.workspaceRefHash, scope: "SANDBOX_SINGLE_OBJECT_HOLD" });
    if (typeof key !== "string" || key.length < 1 || key.length > 4096
      || /[:\r\n]/u.test(key)) fail("WORKSPACE_KEY_INVALID");
    const response = await fetchImpl(`${origin}${pathname}`, { method,
      headers: { authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
        accept: "application/json", ...(body === null ? {} : { "content-type": "application/json" }) },
      ...(body === null ? {} : { body: canonicalizeStrict(body) }),
      redirect: "error", signal: AbortSignal.timeout(requestTimeoutMs) });
    if (!(response instanceof Response)) fail("RESPONSE_INVALID");
    // Bound the stream, not merely the final buffer allocation.
    const chunks = []; let length = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 512 * 1024) { await reader.cancel(); fail("RESPONSE_TOO_LARGE"); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
    }
    const value = { method, path: pathname, requestBodyHash: body === null ? null : digest(body),
      sourceKind, observedAt: now(), status: response.status,
      providerDate: response.headers.get("date"), bodyBase64: Buffer.concat(chunks).toString("base64") };
    writePrivateExecutionRecordOnce(file, value);
    return { ...value, providerReceipt: hash(readPrivateExecutionBytes(file)) };
  }
  const observe = pathname => request("GET", pathname, null,
    path.join(sourceRoot, `${randomBytes(16).toString("hex")}.json`));

  // Three effects use the established ledger: token creation, hold, release.
  // An attempted POST with a lost response is never sent again, even cold.
  async function oneUse({ binding, kind, pathname, body, deadline, observeOnly = false }) {
    const effectIdHash = digest({ operationRefHash: binding.operationRefHash, kind });
    const effectRoot = privateDirectory(path.join(root, effectIdHash.slice(7)));
    const ledgerDirectory = path.join(effectRoot, "effect-ledger");
    const ledgerId = `ledger_${effectIdHash.slice(7, 39)}`;
    const sourceFile = path.join(effectRoot, "source.json");
    const fields = { effectIdHash, transactionBindingHash: digest(binding),
      endpointBindingHash: digest({ origin, method: "POST", pathname }),
      adapterInstanceRefHash: digest(instance), permissionGrantHash: binding.permissionGrantHash,
      oneUseNonceHash: digest({ effectIdHash, kind: "nonce" }),
      idempotencyKeyHash: digest({ effectIdHash, kind: "local-no-retry-key" }),
      bodyHash: digest(body), effectDeadline: instant(deadline) };
    let current; let verification;
    const event = (type, receipt = null) => createDurableOneUseEndpointEffectEventV1({
      ...fields, ledgerId, eventType: type, recordedAt: now(),
      previousEffectEventHash: current?.eventHash ?? null,
      occurrenceNonceHash: hash(randomBytes(32)), endpointReceiptHash: receipt,
      terminalEvidenceHash: null });
    const append = (type, receipt = null) => {
      const next = event(type, receipt);
      verification = appendDurableOneUseEndpointEffectLedgerV1({ directory: ledgerDirectory,
        ledgerId, event: next, expectedLocalHeadHash: verification.head.headHash });
      current = next;
    };
    if (existsSync(ledgerDirectory)) {
      verification = verifyDurableOneUseEndpointEffectLedgerV1({ directory: ledgerDirectory,
        ledgerId, expectedLocalHeadHash: null });
      if (!verification.ok) fail("EFFECT_LEDGER_INVALID");
      current = replayDurableOneUseEndpointEffectStatesSinceV1({ directory: ledgerDirectory,
        ledgerId, expectedAncestorHeadHash: verification.head.headHash,
        effectIdHashes: [effectIdHash] }).effects[0]?.currentEvent;
      if (!current || Object.entries(fields).some(([key, value]) => current[key] !== value)) {
        fail("OPERATION_REUSED_WITH_DIFFERENT_INPUT");
      }
      if (existsSync(sourceFile)) {
        const source = { ...read(sourceFile), providerReceipt: hash(readPrivateExecutionBytes(sourceFile)) };
        if (current.eventType === "SUBMIT_ATTEMPTED") append("ENDPOINT_RECEIPT_OBSERVED", source.providerReceipt);
        else if (current.eventType !== "ENDPOINT_RECEIPT_OBSERVED"
          || current.endpointReceiptHash !== source.providerReceipt) fail("SOURCE_RECEIPT_MISMATCH");
        return source;
      }
      if (["SUBMIT_ATTEMPTED", "ENDPOINT_RECEIPT_OBSERVED"].includes(current.eventType)) {
        return { ambiguous: true, reason: "AMBIGUOUS_NO_RETRY" };
      }
    } else {
      if (observeOnly) return { notSubmitted: true, reason: "NO_LOCAL_SUBMISSION" };
      if (Date.parse(now()) >= Date.parse(fields.effectDeadline)) return { expired: true };
      current = event("INTENT_ADMITTED");
      verification = initializeDurableOneUseEndpointEffectLedgerV1({ directory: ledgerDirectory,
        ledgerId, genesisEvent: current });
    }
    if (observeOnly) return { notSubmitted: true, reason: "NO_LOCAL_SUBMISSION" };
    if (Date.parse(now()) >= Date.parse(fields.effectDeadline)) return { expired: true };
    if (current.eventType === "INTENT_ADMITTED") append("SUBMIT_RESERVED");
    append("SUBMIT_ATTEMPTED");
    let source;
    try { source = await request("POST", pathname, body, sourceFile); }
    catch { return { ambiguous: true, reason: "AMBIGUOUS_NO_RETRY" }; }
    append("ENDPOINT_RECEIPT_OBSERVED", source.providerReceipt);
    return source;
  }

  function requirementMatches(requirement) {
    return requirement?.capability === CAPABILITY
      && requirement.constraints?.eventKey === config.eventKey
      && requirement.constraints?.objectLabel === config.objectLabel
      && (requirement.constraints?.quantity ?? 1) === 1;
  }
  function reserveBinding(context, persist) {
    const { program, requirement, operationId, permissionGrantHash } = context;
    if (!requirementMatches(requirement) || !ID.test(requirement.requirementId ?? "")
      || !ID.test(operationId ?? "") || !HASH.test(program?.programHash ?? "")
      || !HASH.test(permissionGrantHash ?? "")) fail("OPERATION_BINDING_INVALID");
    const operationRefHash = digest({ adapterId, programHash: program.programHash,
      requirementId: requirement.requirementId, operationId });
    const binding = { operationRefHash, instance, programHash: program.programHash,
      requirementId: requirement.requirementId, operationId, permissionGrantHash,
      formationDeadline: instant(program.formationDeadline), expiresInMinutes };
    const file = path.join(root, `${operationRefHash.slice(7)}-binding.json`);
    if (persist) writePrivateExecutionRecordOnce(file, binding);
    else if (existsSync(file) && canonicalizeStrict(read(file)) !== canonicalizeStrict(binding)) {
      fail("OPERATION_REUSED_WITH_DIFFERENT_INPUT");
    }
    return binding;
  }
  function reservationBinding(reservation) {
    const ref = reservation?.adapterState?.operationRefHash;
    if (!HASH.test(ref ?? "") || reservation.reservationId !== `seatsio:${ref.slice(7)}`) {
      fail("RESERVATION_INVALID");
    }
    const binding = read(path.join(root, `${ref.slice(7)}-binding.json`));
    if (binding.operationRefHash !== ref || canonicalizeStrict(binding.instance) !== canonicalizeStrict(instance)) {
      fail("RESERVATION_BINDING_MISMATCH");
    }
    return binding;
  }
  async function tokenFor(binding, observeOnly) {
    const source = await oneUse({ binding, kind: "TOKEN", pathname: "/hold-tokens",
      body: { expiresInMinutes }, deadline: binding.formationDeadline, observeOnly });
    const data = json(source);
    if (![200, 201].includes(source.status) || !TOKEN.test(data?.holdToken ?? "")) {
      return { unavailable: true, reason: source.ambiguous ? "HOLD_TOKEN_UNKNOWN_NO_RETRY"
        : source.expired ? "FORMATION_EXPIRED" : "HOLD_TOKEN_NOT_OBSERVED", source };
    }
    return { holdToken: data.holdToken, expiresAt: instant(data.expiresAt), source };
  }
  const unavailable = (reason, fields = {}) => ({ status: "UNAVAILABLE", reason,
    sourceKind, capacityOwned: false, retryAllowed: false, ...fields });
  function reserved(binding, token, sources) {
    return { status: "RESERVED", reservationId: `seatsio:${binding.operationRefHash.slice(7)}`,
      validUntil: token.expiresAt, providerReceipt: sources.at(-1).providerReceipt,
      providerReceipts: sources.map(source => source.providerReceipt),
      sourceKind, capacityOwned: true,
      adapterState: { operationRefHash: binding.operationRefHash,
        eventKey: config.eventKey, objectLabel: config.objectLabel,
        sourceClass: "PROVIDER_NATIVE_SINGLE_SEAT_HOLD", sourceKind,
        sandboxDeclaredByCaller: true, ownershipEvidence: "EXACT_TOKEN_ON_KNOWN_OBJECT",
        expiryIssuedByProvider: true, serviceExecutionPromised: false,
        ownerIdentityEstablished: false, bookingPerformed: false } };
  }
  function checkedObject(source) {
    const data = json(source)?.[config.objectLabel];
    if (source.status !== 200 || data?.label !== config.objectLabel || data?.objectType !== "seat") return null;
    return data;
  }
  async function current(binding, token) {
    const tokenSource = await observe(`/hold-tokens/${encodeURIComponent(token.holdToken)}`);
    const objectSource = await observe(objectPath);
    const object = checkedObject(objectSource);
    const receipts = [tokenSource.providerReceipt, objectSource.providerReceipt];
    if (!object) return unavailable("OBJECT_READ_NOT_VALID", { providerReceipts: receipts });
    if (["free", "resale"].includes(object.status)) return { status: "RELEASED",
      sourceKind, capacityOwned: false, releaseAttributionConfirmed: false,
      providerReceipt: objectSource.providerReceipt, providerReceipts: receipts };
    if (object.status !== "reservedByToken" || object.holdToken !== token.holdToken) {
      return unavailable("OBJECT_NOT_HELD_BY_THIS_TOKEN", { providerReceipts: receipts });
    }
    const data = json(tokenSource);
    if (tokenSource.status !== 200 || data?.holdToken !== token.holdToken) {
      return unavailable("TOKEN_READ_NOT_VALID", { providerReceipts: receipts });
    }
    const expiresAt = instant(data.expiresAt);
    if (Date.parse(expiresAt) <= Date.parse(now())) return unavailable("TOKEN_EXPIRED", { providerReceipts: receipts });
    return reserved(binding, { ...token, expiresAt }, [tokenSource, objectSource]);
  }
  async function reserve(context, observeOnly) {
    const binding = reserveBinding(context, !observeOnly);
    const token = await tokenFor(binding, observeOnly);
    if (token.unavailable) return unavailable(token.reason, { ambiguous: token.source.ambiguous === true });
    if (Date.parse(token.expiresAt) <= Date.parse(now())) return unavailable("TOKEN_EXPIRED");
    const source = await oneUse({ binding, kind: "HOLD",
      pathname: `${eventPath}/actions/hold?expand=objects`,
      body: { objects: [config.objectLabel], holdToken: token.holdToken },
      deadline: binding.formationDeadline, observeOnly });
    if (source.notSubmitted || source.expired) return unavailable(source.reason ?? "FORMATION_EXPIRED");
    if (source.ambiguous) return { ...await current(binding, token), reconciledBy: "KNOWN_OBJECT_AND_TOKEN_READ",
      holdSubmissionAmbiguous: true, retryAllowed: false };
    const object = json(source)?.objects?.[config.objectLabel];
    if (source.status !== 200 || object?.label !== config.objectLabel || object?.objectType !== "seat"
      || object?.status !== "reservedByToken" || object?.holdToken !== token.holdToken) {
      return unavailable("HOLD_RECEIPT_NOT_MATCHED", { providerReceipt: source.providerReceipt });
    }
    // Never promote replayed POST acceptance to a current capacity fact.
    return current(binding, token);
  }
  const adapter = {
    adapterId, providerRef: "seats.io", failureDomainRef: "seats.io",
    roles: Object.freeze(["PRIMARY", "RECOVERY"]), capabilities: Object.freeze([CAPABILITY]),
    protocol: SEATSIO_CAPACITY_PROTOCOL,
    supports: requirementMatches,
    async discover() {
      const source = await observe(objectPath); const object = checkedObject(source);
      if (!object) return unavailable("OBJECT_READ_NOT_VALID", { providerReceipt: source.providerReceipt });
      return { status: "OBSERVED", eventKey: config.eventKey, objectLabel: config.objectLabel,
        objectStatus: object.status, available: object.status === "free" && object.forSale === true,
        observedAt: source.observedAt, providerReceipt: source.providerReceipt,
        sourceKind, capacityReserved: false };
    },
    reserve: context => reserve(context, false),
    reconcileReserve: context => reserve(context, true),
    async readReservation({ reservation }) {
      const binding = reservationBinding(reservation); const token = await tokenFor(binding, true);
      return token.unavailable ? unavailable(token.reason) : current(binding, token);
    },
    async release({ reservation, program, requirementId, operationId, permissionGrantHash, deadline }) {
      const original = reservationBinding(reservation);
      if (program?.programHash !== original.programHash || requirementId !== original.requirementId
        || !ID.test(operationId ?? "") || !HASH.test(permissionGrantHash ?? "")) fail("RELEASE_BINDING_INVALID");
      const token = await tokenFor(original, true);
      if (token.unavailable) return { ...unavailable(token.reason), status: "OPEN" };
      const before = await current(original, token);
      if (before.status === "RELEASED") return before;
      if (before.status !== "RESERVED") return { ...before, status: "OPEN" };
      const binding = { ...original, permissionGrantHash,
        releaseOperationId: operationId, originalOperationRefHash: original.operationRefHash,
        operationRefHash: digest({ originalOperationRefHash: original.operationRefHash, operationId }) };
      const source = await oneUse({ binding, kind: "RELEASE",
        pathname: `${eventPath}/actions/release?expand=objects`,
        body: { objects: [config.objectLabel], holdToken: token.holdToken },
        deadline: deadline ?? program.completionDeadline });
      const after = await current(original, token);
      return { ...after, status: after.status === "RELEASED" ? "RELEASED" : "OPEN",
        releaseAttributionConfirmed: after.status === "RELEASED" && source.status === 200
          && json(source)?.objects?.[config.objectLabel]?.label === config.objectLabel
          && json(source)?.objects?.[config.objectLabel]?.objectType === "seat"
          && ["free", "resale"].includes(json(source)?.objects?.[config.objectLabel]?.status),
        releaseSubmissionAmbiguous: source.ambiguous === true,
        releaseReceipt: source.providerReceipt ?? null, retryAllowed: false, bookingCanceled: false };
    },
    async execute() { return { status: "FAILED", reason: "SEAT_HOLD_IS_NOT_BOOKING_OR_FULFILLMENT" }; },
  };
  return Object.freeze(adapter);
}
