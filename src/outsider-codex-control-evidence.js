/*
 * Source-bound Codex app-server control evidence.
 *
 * There are three deliberately separate statements here:
 *   1. a local Codex binary advertises lifecycle hooks (metadata);
 *   2. the host emitted lifecycle/item/approval frames (host observation);
 *   3. the trusted Outsider controller made the decision bound to that item
 *      (controller authority).
 *
 * A caller-created array of "Pre/Post/Stop" objects proves none of them.  The
 * trace below is a hash-only projection of exact canonical app-server JSONL,
 * signed by an allow-listed recorder.  Exact controller receipts are separately
 * signed and must bind the same thread/turn/item identities.  Even then, this
 * module proves control delivery, not that the delivered work was correct.
 */

import {
  closeSync, constants, fstatSync, openSync, readFileSync,
} from "node:fs";
import {
  createPrivateKey, createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign, verify as cryptoVerify,
} from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import {
  CODEX_REQUIRED_LIFECYCLE_EVENTS, verifyCodexHookCapabilityProbe,
} from "./outsider-codex-worker-adapter.js";
import { workerDigest } from "./outsider-worker-adapter.js";

export const CODEX_CONTROL_SCHEMAS = Object.freeze({
  trace: "outsider/codex-app-server-control-trace/v1",
  controllerReceipt: "outsider/codex-controller-receipt/v1",
  controllerReceiptSource: "outsider/codex-controller-receipt-source/v1",
  assessment: "outsider/codex-stage05-control-assessment/v1",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const KEY_ID = /^ed25519:sha256:[a-f0-9]{64}$/;
const MAX_TRACE_BYTES = 64 * 1024 * 1024;
const MAX_TRACE_FRAMES = 250_000;
const DIRECTIONS = new Set(["CLIENT_TO_SERVER", "SERVER_TO_CLIENT"]);
const HOOK_EVENTS = new Set(["preToolUse", "permissionRequest", "postToolUse",
  "preCompact", "postCompact", "sessionStart", "sessionEnd", "userPromptSubmit",
  "subagentStart", "subagentStop", "stop"]);
const HOOK_STATUSES = new Set(["running", "completed", "failed", "blocked", "stopped"]);
const RECEIPT_DECISIONS = new Set(["ALLOW", "DENY", "BLOCK", "OBSERVE"]);
const CONTROLLER_PATHS = new Set(["KERNEL_CONTROLLER", "ATTACHED_POLICY",
  "ATTACHED_FAIL_CLOSED", "ATTACHED_FAIL_VISIBLE"]);
const IDENTITY_SOURCES = new Set(["HOST_SESSION_ID", "HOST_THREAD_ID",
  "HOST_SESSION_ID_FALLBACK", "HOST_TURN_ID", "HOST_TOOL_USE_ID", "NOT_APPLICABLE"]);
const REQUIRED_INSTALLED_HOOKS = CODEX_REQUIRED_LIFECYCLE_EVENTS;
const REQUIRED_APP_SERVER_METHODS = Object.freeze([
  "hook/started", "hook/completed", "item/started", "item/completed",
  "turn/started", "turn/completed", "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval", "item/permissions/requestApproval",
]);
const APPROVAL_METHODS = new Set(REQUIRED_APP_SERVER_METHODS.filter((method) =>
  method.endsWith("/requestApproval")));

const plain = (value) => value !== null && typeof value === "object"
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const digest = (value) => workerDigest(Buffer.isBuffer(value) || typeof value === "string"
  ? value : canonicalizeStrict(value));
const hashNullable = (value) => value == null ? null : digest(String(value));
const exactKeys = (value, keys) => plain(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const uniqueSorted = (values) => [...new Set(values)].sort();

function fail(code) { throw new Error(`CODEX_CONTROL_${code}`); }

function canonicalTime(value) {
  const input = value instanceof Date ? value.toISOString() : value;
  if (typeof input !== "string" || input.length > 40
    || !Number.isFinite(Date.parse(input))
    || new Date(Date.parse(input)).toISOString() !== input) fail("TIME_INVALID");
  return input;
}

function keyIdentityFromPrivate(privateKeyPem) {
  try {
    const privateKey = createPrivateKey(privateKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519") fail("KEY_NOT_ED25519");
    const publicKeyPem = createPublicKey(privateKey)
      .export({ type: "spki", format: "pem" }).toString();
    return { privateKey, publicKeyPem, keyId: codexControlKeyId(publicKeyPem) };
  } catch (error) {
    if (String(error?.message ?? error).startsWith("CODEX_CONTROL_")) throw error;
    fail("PRIVATE_KEY_INVALID");
  }
}

export function codexControlKeyId(publicKeyPem) {
  try {
    const publicKey = createPublicKey(publicKeyPem);
    if (publicKey.asymmetricKeyType !== "ed25519") fail("KEY_NOT_ED25519");
    const der = publicKey.export({ type: "spki", format: "der" });
    return `ed25519:${digest(der)}`;
  } catch (error) {
    if (String(error?.message ?? error).startsWith("CODEX_CONTROL_")) throw error;
    fail("PUBLIC_KEY_INVALID");
  }
}

function signHash(hash, privateKeyPem, role) {
  const identity = keyIdentityFromPrivate(privateKeyPem);
  const context = { schema: "outsider/codex-control-signature/v1", role,
    algorithm: "Ed25519", keyId: identity.keyId, contentHash: hash };
  return Object.freeze({ algorithm: "Ed25519", role, keyId: identity.keyId,
    publicKeyPem: identity.publicKeyPem,
    value: cryptoSign(null, Buffer.from(canonicalizeStrict(context)), identity.privateKey)
      .toString("base64url") });
}

function verifySignature(hash, signature, role, trustedKeyIds) {
  try {
    if (!exactKeys(signature, ["algorithm", "role", "keyId", "publicKeyPem", "value"])
      || signature.algorithm !== "Ed25519" || signature.role !== role
      || !KEY_ID.test(String(signature.keyId ?? ""))
      || signature.keyId !== codexControlKeyId(signature.publicKeyPem)
      || !Array.isArray(trustedKeyIds) || !trustedKeyIds.includes(signature.keyId)
      || typeof signature.value !== "string") return false;
    const context = { schema: "outsider/codex-control-signature/v1", role,
      algorithm: "Ed25519", keyId: signature.keyId, contentHash: hash };
    return cryptoVerify(null, Buffer.from(canonicalizeStrict(context)),
      createPublicKey(signature.publicKeyPem), Buffer.from(signature.value, "base64url"));
  } catch { return false; }
}

function sourceBuffer(source) {
  if (Buffer.isBuffer(source)) return source;
  if (typeof source === "string") return Buffer.from(source);
  fail("TRACE_SOURCE_INVALID");
}

/** Read one non-symlinked inode and reject an in-place mutation during read. */
export function readCodexAppServerTraceSnapshot(file) {
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  let descriptor;
  try { descriptor = openSync(file, flags); }
  catch (error) { throw new Error(`CODEX_CONTROL_TRACE_OPEN_FAILED:${error?.code ?? "UNKNOWN"}`); }
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size > BigInt(MAX_TRACE_BYTES)) fail("TRACE_FILE_INVALID");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    for (const key of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[key] !== after[key]) fail("TRACE_CHANGED_DURING_READ");
    }
    if (BigInt(bytes.length) !== after.size) fail("TRACE_SIZE_MISMATCH");
    return bytes;
  } finally { closeSync(descriptor); }
}

function parseFrames(source) {
  const bytes = sourceBuffer(source);
  if (!bytes.length || bytes.length > MAX_TRACE_BYTES || bytes[0] === 0xef) {
    fail("TRACE_SOURCE_SIZE_OR_BOM_INVALID");
  }
  const text = bytes.toString("utf8");
  if (!text.endsWith("\n") || text.includes("\r")) fail("TRACE_SOURCE_NOT_CANONICAL_JSONL");
  const lines = text.slice(0, -1).split("\n");
  if (!lines.length || lines.length > MAX_TRACE_FRAMES) fail("TRACE_FRAME_COUNT_INVALID");
  return lines.map((line, index) => {
    let frame;
    try { frame = JSON.parse(line); } catch { fail("TRACE_JSON_INVALID"); }
    if (!exactKeys(frame, ["sequence", "direction", "message"])
      || frame.sequence !== index || !DIRECTIONS.has(frame.direction)
      || !plain(frame.message) || line !== canonicalizeStrict(frame)) {
      fail("TRACE_FRAME_INVALID");
    }
    return frame;
  });
}

function frameContext(params = {}) {
  const threadId = params.threadId ?? params.thread?.id ?? null;
  const turnId = params.turnId ?? params.turn?.id ?? null;
  const item = params.item ?? null;
  return { threadIdHash: hashNullable(threadId), turnIdHash: hashNullable(turnId),
    itemIdHash: hashNullable(params.itemId ?? item?.id ?? null) };
}

/* The pinned generated app-server protocol has HookRunSummary but no item/tool-use
   identity on that object.  Do not infer one from ordering inside a turn: a
   turn can contain multiple actions.  A future protocol may close the gap, in
   which case every generated HookRunSummary definition must expose the field
   and the live notification must actually carry it. */
function namedSchemas(value, name, into = []) {
  if (Array.isArray(value)) {
    for (const item of value) namedSchemas(item, name, into);
  } else if (plain(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (key === name && plain(item)) into.push(item);
      namedSchemas(item, name, into);
    }
  }
  return into;
}

export function codexAppServerHookItemIdentityCapability(schemaBytes) {
  try {
    const schema = JSON.parse(sourceBuffer(schemaBytes).toString("utf8"));
    const summaries = namedSchemas(schema, "HookRunSummary");
    const exposed = summaries.length > 0 && summaries.every((summary) => {
      const properties = summary.properties ?? {};
      return ["itemId", "toolUseId", "tool_use_id"].some((key) =>
        Object.hasOwn(properties, key));
    });
    return Object.freeze({ exposed, definitionsChecked: summaries.length });
  } catch {
    return Object.freeze({ exposed: false, definitionsChecked: 0 });
  }
}

function decisionFromResponse(message) {
  const value = message?.result?.decision ?? message?.result?.approvalDecision ?? null;
  if (["decline", "cancel", "accept", "acceptForSession"].includes(value)) return value;
  return null;
}

function normalizeTrace(frames) {
  const clientRequests = new Map();
  const serverRequests = new Map();
  const completedClientRequests = new Set();
  const completedServerRequests = new Set();
  const events = [];
  for (const frame of frames) {
    const message = frame.message;
    const method = typeof message.method === "string" ? message.method : null;
    const hasId = Object.hasOwn(message, "id");
    const requestKey = hasId ? canonicalizeStrict(message.id) : null;
    const base = { sequence: frame.sequence, direction: frame.direction,
      nativeRefHash: digest(message) };

    if (method && hasId) {
      const request = { method, requestIdHash: digest(requestKey),
        ...frameContext(message.params) };
      const requests = frame.direction === "CLIENT_TO_SERVER" ? clientRequests : serverRequests;
      if (requests.has(requestKey)) fail("TRACE_DUPLICATE_REQUEST_ID");
      requests.set(requestKey, request);
      if (APPROVAL_METHODS.has(method) && frame.direction === "SERVER_TO_CLIENT") {
        events.push({ ...base, kind: "APPROVAL_REQUEST", ...request });
      }
      continue;
    }

    if (!method && hasId) {
      const requests = frame.direction === "SERVER_TO_CLIENT" ? clientRequests : serverRequests;
      const completed = frame.direction === "SERVER_TO_CLIENT"
        ? completedClientRequests : completedServerRequests;
      const request = requests.get(requestKey);
      if (!request) {
        events.push({ ...base, kind: "ORPHAN_RESPONSE", requestIdHash: digest(requestKey) });
        continue;
      }
      if (completed.has(requestKey)) fail("TRACE_DUPLICATE_RESPONSE_ID");
      completed.add(requestKey);
      if (frame.direction === "SERVER_TO_CLIENT" && request.method === "hooks/list") {
        events.push({ ...base, kind: "HOOKS_LIST_RESPONSE",
          requestIdHash: request.requestIdHash, resultHash: digest(message.result ?? null) });
      } else if (frame.direction === "CLIENT_TO_SERVER" && APPROVAL_METHODS.has(request.method)) {
        events.push({ ...base, kind: "APPROVAL_RESPONSE", ...request,
          decision: decisionFromResponse(message) });
      }
      continue;
    }

    if (!method || frame.direction !== "SERVER_TO_CLIENT") continue;
    const params = message.params ?? {};
    if (method === "thread/started") {
      events.push({ ...base, kind: "THREAD_STARTED", ...frameContext(params),
        sessionIdHash: hashNullable(params.thread?.sessionId),
        parentThreadIdHash: hashNullable(params.thread?.parentThreadId),
        cwdHash: hashNullable(params.thread?.cwd),
        cliVersionHash: hashNullable(params.thread?.cliVersion) });
    } else if (method === "turn/started" || method === "turn/completed") {
      events.push({ ...base, kind: method === "turn/started" ? "TURN_STARTED" : "TURN_COMPLETED",
        ...frameContext(params), turnStatus: params.turn?.status ?? null });
    } else if (method === "hook/started" || method === "hook/completed") {
      const run = params.run ?? {};
      events.push({ ...base, kind: method === "hook/started" ? "HOOK_STARTED" : "HOOK_COMPLETED",
        ...frameContext(params), runIdHash: hashNullable(run.id),
        hookItemIdHash: hashNullable(params.itemId ?? run.itemId
          ?? run.toolUseId ?? run.tool_use_id ?? null),
        eventName: run.eventName ?? null, status: run.status ?? null,
        sourcePathHash: hashNullable(run.sourcePath), entriesHash: digest(run.entries ?? []) });
    } else if (method === "item/started" || method === "item/completed") {
      const item = params.item ?? {};
      events.push({ ...base, kind: method === "item/started" ? "ITEM_STARTED" : "ITEM_COMPLETED",
        ...frameContext(params), itemType: item.type ?? null, itemStatus: item.status ?? null,
        exitCode: Number.isSafeInteger(item.exitCode) ? item.exitCode : null,
        resultPresent: item.result != null || item.aggregatedOutput != null
          || item.success != null || item.error != null });
    }
  }
  for (const [requestKey, request] of clientRequests) {
    if (!completedClientRequests.has(requestKey)) events.push({ sequence: frames.length + events.length,
      direction: "CLIENT_TO_SERVER", nativeRefHash: digest(requestKey),
      kind: "OPEN_REQUEST", method: request.method, requestIdHash: request.requestIdHash });
  }
  for (const [requestKey, request] of serverRequests) {
    if (!completedServerRequests.has(requestKey)) events.push({ sequence: frames.length + events.length,
      direction: "SERVER_TO_CLIENT", nativeRefHash: digest(requestKey),
      kind: "OPEN_REQUEST", method: request.method, requestIdHash: request.requestIdHash });
  }
  return events;
}

function pairedAfter(events, first, second, identity) {
  return events.some((event) => event.kind === second && event.sequence > first.sequence
    && identity(first, event));
}

function traceAssessment(events) {
  const gaps = [];
  const threads = events.filter((event) => event.kind === "THREAD_STARTED");
  const turns = events.filter((event) => event.kind === "TURN_STARTED");
  const hookStarts = events.filter((event) => event.kind === "HOOK_STARTED");
  const hookCompletes = events.filter((event) => event.kind === "HOOK_COMPLETED");
  const itemStarts = events.filter((event) => event.kind === "ITEM_STARTED");
  const itemCompletes = events.filter((event) => event.kind === "ITEM_COMPLETED");
  const approvals = events.filter((event) => event.kind === "APPROVAL_RESPONSE");
  if (events.some((event) => event.kind === "ORPHAN_RESPONSE")) gaps.push("ORPHAN_RESPONSE");
  if (events.some((event) => event.kind === "OPEN_REQUEST")) gaps.push("OPEN_REQUEST_AT_CLOSE");
  if (approvals.some((event) => event.decision === null)) gaps.push("APPROVAL_DECISION_UNKNOWN");
  if (!threads.length || threads.some((event) => !event.threadIdHash
    || !event.sessionIdHash || !event.cwdHash)) gaps.push("SESSION_CONTEXT_IDENTITY_MISSING");
  if (!turns.length) gaps.push("TURN_START_MISSING");
  for (const complete of hookCompletes) {
    if (!HOOK_EVENTS.has(complete.eventName) || !HOOK_STATUSES.has(complete.status)) {
      gaps.push(`HOOK_SCHEMA_DRIFT:${complete.sequence}`);
    }
    if (!hookStarts.some((start) => start.runIdHash === complete.runIdHash
      && start.eventName === complete.eventName && start.threadIdHash === complete.threadIdHash
      && start.turnIdHash === complete.turnIdHash && start.sequence < complete.sequence)) {
      gaps.push(`HOOK_START_MISSING:${complete.sequence}`);
    }
  }
  for (const start of hookStarts) {
    if (!hookCompletes.some((complete) => complete.runIdHash === start.runIdHash
      && complete.eventName === start.eventName && complete.threadIdHash === start.threadIdHash
      && complete.turnIdHash === start.turnIdHash && start.sequence < complete.sequence)) {
      gaps.push(`HOOK_COMPLETION_MISSING:${start.sequence}`);
    }
  }
  for (const start of itemStarts) {
    if (!pairedAfter(events, start, "ITEM_COMPLETED", (left, right) =>
      left.threadIdHash === right.threadIdHash && left.turnIdHash === right.turnIdHash
        && left.itemIdHash === right.itemIdHash)) gaps.push(`ITEM_OUTCOME_MISSING:${start.sequence}`);
  }
  for (const complete of itemCompletes) {
    if (!itemStarts.some((start) => start.sequence < complete.sequence
      && start.threadIdHash === complete.threadIdHash && start.turnIdHash === complete.turnIdHash
      && start.itemIdHash === complete.itemIdHash)) gaps.push(`ITEM_START_MISSING:${complete.sequence}`);
  }
  for (const turn of turns) {
    if (!events.some((event) => event.kind === "TURN_COMPLETED"
      && event.threadIdHash === turn.threadIdHash && event.turnIdHash === turn.turnIdHash
      && event.sequence > turn.sequence)) gaps.push(`TURN_COMPLETION_MISSING:${turn.sequence}`);
  }
  const hookFailed = hookCompletes.some((event) => ["failed", "stopped"].includes(event.status));
  if (hookFailed) gaps.push("HOOK_FAILURE_OBSERVED");
  const completedNames = new Set(hookCompletes.filter((event) =>
    ["completed", "blocked"].includes(event.status)).map((event) => event.eventName));
  const approvalDeclined = approvals.some((event) => ["decline", "cancel"].includes(event.decision));
  const hookBlocked = hookCompletes.some((event) => event.status === "blocked"
    && event.eventName === "preToolUse");
  return Object.freeze({
    sessionContextIdentityObserved: threads.length > 0 && !gaps.includes("SESSION_CONTEXT_IDENTITY_MISSING"),
    preActionHookObserved: completedNames.has("preToolUse"),
    postOutcomeHookObserved: completedNames.has("postToolUse") && itemCompletes.length > 0,
    stopFinalizationHookObserved: completedNames.has("stop")
      && events.some((event) => event.kind === "TURN_COMPLETED"),
    userPromptHookObserved: completedNames.has("userPromptSubmit"),
    hostInterventionObserved: hookBlocked || approvalDeclined,
    hookBlockObserved: hookBlocked,
    approvalDeclineObserved: approvalDeclined,
    exactControllerItemBindingObserved: false,
    hookFailureObserved: hookFailed,
    gaps: uniqueSorted(gaps),
  });
}

export function createCodexAppServerControlTrace(source, {
  privateKeyPem, recordedAt = new Date(), binarySha256, schemaBundleHash,
  appServerSchemaBundleHash,
  hookProbeRecordHash, bypassedHookTrust = false,
} = {}) {
  if (!privateKeyPem || !HASH.test(String(binarySha256 ?? ""))
    || !HASH.test(String(schemaBundleHash ?? ""))
    || !HASH.test(String(appServerSchemaBundleHash ?? ""))
    || !HASH.test(String(hookProbeRecordHash ?? "")) || bypassedHookTrust !== false) {
    fail("TRACE_ARGUMENT_INVALID");
  }
  const bytes = sourceBuffer(source);
  const frames = parseFrames(bytes);
  const events = normalizeTrace(frames);
  const body = {
    schema: CODEX_CONTROL_SCHEMAS.trace,
    provider: "codex",
    protocol: "codex-app-server-jsonrpc/v2",
    recordedAt: canonicalTime(recordedAt),
    binarySha256,
    schemaBundleHash,
    appServerSchemaBundleHash,
    hookProbeRecordHash,
    source: { snapshotHash: digest(bytes), byteLength: bytes.length,
      frameCount: frames.length, canonicalJsonl: true },
    events,
    assessment: traceAssessment(events),
    authority: { recorderSigned: true, sourceReplayRequired: true,
      callerSelfReportAccepted: false, bypassedHookTrust: false,
      establishesIntervention: false, establishesSemanticOutcome: false },
  };
  const traceHash = digest({ domain: CODEX_CONTROL_SCHEMAS.trace, body });
  return Object.freeze({ ...body, traceHash,
    signature: signHash(traceHash, privateKeyPem, "app-server-recorder") });
}

export function verifyCodexAppServerControlTrace(record, {
  source = null, trustedRecorderKeyIds = [],
} = {}) {
  if (!plain(record) || record.schema !== CODEX_CONTROL_SCHEMAS.trace
    || !HASH.test(String(record.traceHash ?? ""))) {
    return { ok: false, error: "CODEX_CONTROL_TRACE_SCHEMA_INVALID",
      sourceArtifactsReverified: false };
  }
  const { traceHash, signature, ...body } = record;
  if (digest({ domain: CODEX_CONTROL_SCHEMAS.trace, body }) !== traceHash
    || !verifySignature(traceHash, signature, "app-server-recorder", trustedRecorderKeyIds)
    || record.authority?.callerSelfReportAccepted !== false
    || record.authority?.bypassedHookTrust !== false
    || record.authority?.establishesIntervention !== false) {
    return { ok: false, error: "CODEX_CONTROL_TRACE_SIGNATURE_OR_BOUNDARY_INVALID",
      sourceArtifactsReverified: false };
  }
  if (source === null) return { ok: false, error: "CODEX_CONTROL_TRACE_SOURCE_REQUIRED",
    sourceArtifactsReverified: false };
  try {
    const replay = createCodexAppServerControlTrace(source, {
      privateKeyPem: keyIdentityForReplay(), recordedAt: record.recordedAt,
      binarySha256: record.binarySha256, schemaBundleHash: record.schemaBundleHash,
      appServerSchemaBundleHash: record.appServerSchemaBundleHash,
      hookProbeRecordHash: record.hookProbeRecordHash, bypassedHookTrust: false,
    });
    /* The ephemeral replay signature is irrelevant; compare the exact body. */
    const { signature: _a, traceHash: replayHash, ...replayBody } = replay;
    if (replayHash !== traceHash || canonicalizeStrict(replayBody) !== canonicalizeStrict(body)) {
      fail("TRACE_SOURCE_REPLAY_MISMATCH");
    }
    return { ok: true, traceHash, recorderKeyId: signature.keyId,
      sourceArtifactsReverified: true, verificationMode: "SIGNED_FULL_SOURCE_REPLAY",
      ...record.assessment };
  } catch (error) {
    return { ok: false, error: `CODEX_CONTROL_TRACE_INVALID:${error?.message ?? error}`,
      sourceArtifactsReverified: false };
  }
}

/* Replay creation needs a syntactically valid key but never trusts its signature.
   Keep one process-local ephemeral key rather than weakening the public builder. */
let replayPrivateKey = null;
function keyIdentityForReplay() {
  if (replayPrivateKey) return replayPrivateKey;
  replayPrivateKey = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }).privateKey;
  return replayPrivateKey;
}

export function createCodexControllerReceipt({
  eventName, sessionId, threadId, turnId = null, itemId = null,
  hookCurrentHash, input, decision, output, outcome = null,
  controllerAvailable = true, recordedAt = new Date(), privateKeyPem,
  hostDeliveryBinding = null,
  sourceBinding = null, previousReceiptHash = null,
  runtimeClaims = { controllerPath: "KERNEL_CONTROLLER", kernelControllerInvoked: true,
    payloadCaptured: false, hostDeliveryObserved: false,
    outsiderDecisionAttributed: true, semanticRecoveryEstablished: false,
    invokedModel: false },
  identityProvenance = { sessionId: "HOST_SESSION_ID", threadId: "HOST_THREAD_ID",
    turnId: turnId === null ? "NOT_APPLICABLE" : "HOST_TURN_ID",
    itemId: itemId === null ? "NOT_APPLICABLE" : "HOST_TOOL_USE_ID" },
} = {}) {
  if (!privateKeyPem || !HOOK_EVENTS.has(eventName)
    || !RECEIPT_DECISIONS.has(decision) || typeof sessionId !== "string" || !sessionId
    || typeof threadId !== "string" || !threadId
    || !(hookCurrentHash === null || HASH.test(String(hookCurrentHash ?? "")))
    || typeof controllerAvailable !== "boolean") fail("RECEIPT_ARGUMENT_INVALID");
  if (["preToolUse", "postToolUse"].includes(eventName)
    && (typeof turnId !== "string" || !turnId || typeof itemId !== "string" || !itemId)) {
    fail("RECEIPT_ACTION_IDENTITY_REQUIRED");
  }
  if (["sessionStart", "userPromptSubmit", "stop"].includes(eventName) && itemId !== null) {
    fail("RECEIPT_NON_ACTION_ITEM_FORBIDDEN");
  }
  if (!exactKeys(identityProvenance, ["sessionId", "threadId", "turnId", "itemId"])
    || Object.values(identityProvenance).some((value) => !IDENTITY_SOURCES.has(value))) {
    fail("RECEIPT_IDENTITY_PROVENANCE_INVALID");
  }
  if (eventName === "postToolUse" && (decision !== "OBSERVE" || outcome === null)) {
    fail("RECEIPT_POST_OUTCOME_REQUIRED");
  }
  if (["sessionStart", "userPromptSubmit"].includes(eventName) && decision !== "OBSERVE") {
    fail("RECEIPT_LIFECYCLE_DECISION_INVALID");
  }
  if (eventName === "preToolUse" && !["ALLOW", "DENY", "BLOCK"].includes(decision)) {
    fail("RECEIPT_PRE_DECISION_REQUIRED");
  }
  if (eventName === "stop" && !["ALLOW", "DENY", "BLOCK"].includes(decision)) {
    fail("RECEIPT_STOP_DECISION_REQUIRED");
  }
  if (!controllerAvailable && ["preToolUse", "stop"].includes(eventName)
    && !["DENY", "BLOCK"].includes(decision)) fail("RECEIPT_FAIL_OPEN_FORBIDDEN");
  if (hostDeliveryBinding !== null && (!exactKeys(hostDeliveryBinding,
    ["approvalRequestIdHash", "approvalResponseNativeHash"])
    || !HASH.test(String(hostDeliveryBinding.approvalRequestIdHash ?? ""))
    || !HASH.test(String(hostDeliveryBinding.approvalResponseNativeHash ?? "")))) {
    fail("RECEIPT_HOST_DELIVERY_BINDING_INVALID");
  }
  if (sourceBinding !== null && (!exactKeys(sourceBinding,
    ["snapshotHash", "byteLength", "canonicalJson"])
    || !HASH.test(String(sourceBinding.snapshotHash ?? ""))
    || !Number.isSafeInteger(sourceBinding.byteLength) || sourceBinding.byteLength <= 0
    || sourceBinding.canonicalJson !== true)) fail("RECEIPT_SOURCE_BINDING_INVALID");
  if (!(previousReceiptHash === null || HASH.test(String(previousReceiptHash ?? "")))) {
    fail("RECEIPT_PREVIOUS_HASH_INVALID");
  }
  if (!exactKeys(runtimeClaims, ["controllerPath", "kernelControllerInvoked",
    "payloadCaptured", "hostDeliveryObserved", "outsiderDecisionAttributed",
    "semanticRecoveryEstablished", "invokedModel"])
    || !CONTROLLER_PATHS.has(runtimeClaims.controllerPath)
    || ["kernelControllerInvoked", "payloadCaptured", "hostDeliveryObserved",
      "outsiderDecisionAttributed", "semanticRecoveryEstablished", "invokedModel"]
      .some((key) => typeof runtimeClaims[key] !== "boolean")
    || runtimeClaims.hostDeliveryObserved !== false
    || runtimeClaims.semanticRecoveryEstablished !== false
    || runtimeClaims.invokedModel !== false
    || runtimeClaims.outsiderDecisionAttributed !== true
    || runtimeClaims.payloadCaptured !== (sourceBinding !== null)) {
    fail("RECEIPT_RUNTIME_CLAIMS_INVALID");
  }
  const body = {
    schema: CODEX_CONTROL_SCHEMAS.controllerReceipt,
    provider: "codex",
    eventName,
    recordedAt: canonicalTime(recordedAt),
    identity: { sessionIdHash: digest(sessionId), threadIdHash: digest(threadId),
      turnIdHash: hashNullable(turnId), itemIdHash: hashNullable(itemId) },
    identityProvenance: { ...identityProvenance },
    hookCurrentHash,
    inputSnapshotHash: digest(input ?? null),
    decision,
    outputHash: digest(output ?? null),
    outcomeHash: outcome === null ? null : digest(outcome),
    availability: { controllerAvailable, failVisible: !controllerAvailable },
    hostDeliveryBinding: hostDeliveryBinding === null ? null : { ...hostDeliveryBinding },
    sourceBinding: sourceBinding === null ? null : { ...sourceBinding },
    previousReceiptHash,
    runtimeClaims: { ...runtimeClaims },
    authority: { callerSelfReportAccepted: false, establishesSemanticOutcome: false,
      sourceReplayRequired: sourceBinding !== null },
  };
  const receiptHash = digest({ domain: CODEX_CONTROL_SCHEMAS.controllerReceipt, body });
  return Object.freeze({ ...body, receiptHash,
    signature: signHash(receiptHash, privateKeyPem, "stage05-controller") });
}

export function verifyCodexControllerReceipt(receipt, {
  trustedControllerKeyIds = [], source = null,
} = {}) {
  if (!plain(receipt) || receipt.schema !== CODEX_CONTROL_SCHEMAS.controllerReceipt
    || !HASH.test(String(receipt.receiptHash ?? ""))) return { ok: false,
    error: "CODEX_CONTROL_RECEIPT_SCHEMA_INVALID" };
  const { receiptHash, signature, ...body } = receipt;
  const validBody = exactKeys(body, ["schema", "provider", "eventName", "recordedAt",
    "identity", "identityProvenance", "hookCurrentHash", "inputSnapshotHash", "decision", "outputHash",
    "outcomeHash", "availability", "hostDeliveryBinding", "sourceBinding",
    "previousReceiptHash", "runtimeClaims", "authority"])
    && body.provider === "codex" && HOOK_EVENTS.has(body.eventName)
    && RECEIPT_DECISIONS.has(body.decision)
    && (body.hookCurrentHash === null || HASH.test(String(body.hookCurrentHash ?? "")))
    && HASH.test(String(body.inputSnapshotHash ?? "")) && HASH.test(String(body.outputHash ?? ""))
    && (body.outcomeHash === null || HASH.test(String(body.outcomeHash)))
    && exactKeys(body.identity, ["sessionIdHash", "threadIdHash", "turnIdHash", "itemIdHash"])
    && HASH.test(String(body.identity.sessionIdHash ?? ""))
    && HASH.test(String(body.identity.threadIdHash ?? ""))
    && (body.identity.turnIdHash === null || HASH.test(String(body.identity.turnIdHash)))
    && (body.identity.itemIdHash === null || HASH.test(String(body.identity.itemIdHash)))
    && exactKeys(body.identityProvenance, ["sessionId", "threadId", "turnId", "itemId"])
    && Object.values(body.identityProvenance).every((value) => IDENTITY_SOURCES.has(value))
    && exactKeys(body.availability, ["controllerAvailable", "failVisible"])
    && typeof body.availability.controllerAvailable === "boolean"
    && body.availability.failVisible === !body.availability.controllerAvailable
    && (body.hostDeliveryBinding === null
      || exactKeys(body.hostDeliveryBinding,
        ["approvalRequestIdHash", "approvalResponseNativeHash"])
      && HASH.test(String(body.hostDeliveryBinding.approvalRequestIdHash ?? ""))
      && HASH.test(String(body.hostDeliveryBinding.approvalResponseNativeHash ?? "")))
    && (body.sourceBinding === null || exactKeys(body.sourceBinding,
      ["snapshotHash", "byteLength", "canonicalJson"])
      && HASH.test(String(body.sourceBinding.snapshotHash ?? ""))
      && Number.isSafeInteger(body.sourceBinding.byteLength) && body.sourceBinding.byteLength > 0
      && body.sourceBinding.canonicalJson === true)
    && (body.previousReceiptHash === null || HASH.test(String(body.previousReceiptHash ?? "")))
    && exactKeys(body.runtimeClaims, ["controllerPath", "kernelControllerInvoked",
      "payloadCaptured", "hostDeliveryObserved", "outsiderDecisionAttributed",
      "semanticRecoveryEstablished", "invokedModel"])
    && CONTROLLER_PATHS.has(body.runtimeClaims.controllerPath)
    && ["kernelControllerInvoked", "payloadCaptured", "hostDeliveryObserved",
      "outsiderDecisionAttributed", "semanticRecoveryEstablished", "invokedModel"]
      .every((key) => typeof body.runtimeClaims[key] === "boolean")
    && body.runtimeClaims.payloadCaptured === (body.sourceBinding !== null)
    && body.runtimeClaims.hostDeliveryObserved === false
    && body.runtimeClaims.outsiderDecisionAttributed === true
    && body.runtimeClaims.semanticRecoveryEstablished === false
    && body.runtimeClaims.invokedModel === false
    && exactKeys(body.authority, ["callerSelfReportAccepted", "establishesSemanticOutcome",
      "sourceReplayRequired"])
    && body.authority.callerSelfReportAccepted === false
    && body.authority.establishesSemanticOutcome === false
    && body.authority.sourceReplayRequired === (body.sourceBinding !== null)
    && Number.isFinite(Date.parse(body.recordedAt))
    && new Date(Date.parse(body.recordedAt)).toISOString() === body.recordedAt
    && (["preToolUse", "postToolUse"].includes(body.eventName)
      ? body.identity.turnIdHash !== null && body.identity.itemIdHash !== null
      : body.identity.itemIdHash === null)
    && (body.eventName !== "postToolUse"
      || body.decision === "OBSERVE" && body.outcomeHash !== null)
    && (!["sessionStart", "userPromptSubmit"].includes(body.eventName)
      || body.decision === "OBSERVE")
    && (body.eventName !== "preToolUse" || ["ALLOW", "DENY", "BLOCK"].includes(body.decision))
    && (body.eventName !== "stop" || ["ALLOW", "DENY", "BLOCK"].includes(body.decision))
    && (body.availability.controllerAvailable
      || !["preToolUse", "stop"].includes(body.eventName)
      || ["DENY", "BLOCK"].includes(body.decision));
  if (!validBody || digest({ domain: CODEX_CONTROL_SCHEMAS.controllerReceipt, body }) !== receiptHash
    || !verifySignature(receiptHash, signature, "stage05-controller", trustedControllerKeyIds)
    || receipt.authority?.callerSelfReportAccepted !== false
    || receipt.authority?.establishesSemanticOutcome !== false) {
    return { ok: false, error: "CODEX_CONTROL_RECEIPT_SIGNATURE_OR_BOUNDARY_INVALID" };
  }
  if (body.sourceBinding !== null) {
    const replay = verifyCodexControllerReceiptSource(source);
    if (!replay.ok || replay.sourceHash !== body.sourceBinding.snapshotHash
      || replay.byteLength !== body.sourceBinding.byteLength) {
      return { ok: false, error: "CODEX_CONTROL_RECEIPT_SOURCE_REPLAY_REQUIRED_OR_INVALID",
        sourceArtifactsReverified: false };
    }
    try {
      const rebuilt = createCodexControllerReceiptFromSource(source, {
        privateKeyPem: keyIdentityForReplay(), previousReceiptHash: body.previousReceiptHash,
      });
      const { signature: _signature, receiptHash: rebuiltHash, ...rebuiltBody } = rebuilt;
      if (rebuiltHash !== receiptHash
        || canonicalizeStrict(rebuiltBody) !== canonicalizeStrict(body)) {
        fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
      }
    } catch (error) {
      return { ok: false, error: `CODEX_CONTROL_RECEIPT_SOURCE_REPLAY_INVALID:${error?.message ?? error}`,
        sourceArtifactsReverified: false };
    }
    return { ok: true, receiptHash, controllerKeyId: signature.keyId,
      sourceArtifactsReverified: true, verificationMode: "SIGNED_CANONICAL_HOOK_SOURCE_REPLAY" };
  }
  return { ok: true, receiptHash, controllerKeyId: signature.keyId,
    sourceArtifactsReverified: false, verificationMode: "SIGNATURE_ONLY_FIXTURE_OR_LEGACY" };
}

function jsonValue(value) {
  try { return JSON.parse(JSON.stringify(value ?? null)); }
  catch { fail("RECEIPT_SOURCE_JSON_INVALID"); }
}

function receiptEventName(input) {
  const raw = String(input?.hook_event_name ?? input?.hookEventName ?? "");
  const names = { SessionStart: "sessionStart", SessionEnd: "sessionEnd",
    UserPromptSubmit: "userPromptSubmit",
    PreToolUse: "preToolUse", PostToolUse: "postToolUse", PreCompact: "preCompact",
    PostCompact: "postCompact", Stop: "stop", SubagentStart: "subagentStart",
    SubagentStop: "subagentStop", PermissionRequest: "permissionRequest" };
  return names[raw] ?? (HOOK_EVENTS.has(raw) ? raw : null);
}

function receiptDecision(event, result) {
  const output = result?.output ?? {};
  if (event === "preToolUse") {
    const value = output?.hookSpecificOutput?.permissionDecision;
    if (value === "allow") return "ALLOW";
    if (value === "deny") return "DENY";
    if (value === "block") return "BLOCK";
    fail("RECEIPT_SOURCE_PRE_DECISION_MISSING");
  }
  if (event === "stop") {
    if (output?.decision === "approve") return "ALLOW";
    if (output?.decision === "block") return "BLOCK";
    fail("RECEIPT_SOURCE_STOP_DECISION_MISSING");
  }
  return "OBSERVE";
}

export function createCodexControllerReceiptSource({
  input, result, hookMetadata = null, controllerPath = "ATTACHED_POLICY",
  controllerAvailable = true, invocation = {}, capturedAt = new Date(),
} = {}) {
  const exactInput = jsonValue(input);
  const exactResult = jsonValue(result);
  const event = receiptEventName(exactInput);
  if (!plain(exactInput) || !plain(exactResult) || !event
    || !CONTROLLER_PATHS.has(controllerPath) || typeof controllerAvailable !== "boolean"
    || invocation?.agent !== "codex" || invocation?.attachedControl !== true
    || invocation?.bypassedHookTrust !== false) fail("RECEIPT_SOURCE_ARGUMENT_INVALID");
  const metadata = hookMetadata === null ? null : jsonValue(hookMetadata);
  if (metadata !== null && (!exactKeys(metadata, ["eventName", "currentHash", "trustStatus",
    "commandHash", "sourcePathHash", "metadataSnapshotHash"])
    || metadata.eventName !== event || !HASH.test(String(metadata.currentHash ?? ""))
    || !["trusted", "managed", "untrusted", "modified"].includes(metadata.trustStatus)
    || !HASH.test(String(metadata.commandHash ?? ""))
    || !HASH.test(String(metadata.sourcePathHash ?? ""))
    || !HASH.test(String(metadata.metadataSnapshotHash ?? "")))) {
    fail("RECEIPT_SOURCE_HOOK_METADATA_INVALID");
  }
  const body = {
    schema: CODEX_CONTROL_SCHEMAS.controllerReceiptSource,
    provider: "codex",
    capturedAt: canonicalTime(capturedAt),
    invocation: { agent: "codex", attachedControl: true, bypassedHookTrust: false,
      entrypointHash: HASH.test(String(invocation.entrypointHash ?? ""))
        ? invocation.entrypointHash : null,
      argvHash: HASH.test(String(invocation.argvHash ?? "")) ? invocation.argvHash : null,
      signingKeySource: invocation.signingKeySource === "APP_SERVER_RECORDER_PINNED"
        ? "APP_SERVER_RECORDER_PINNED" : "LOCAL_INSTALLATION_KEY" },
    hookInput: exactInput,
    controllerResult: exactResult,
    hookMetadata: metadata,
    runtime: { controllerPath, controllerAvailable },
    claims: { payloadCaptured: true, hostDeliveryObserved: false,
      outsiderDecisionAttributed: true, semanticRecoveryEstablished: false,
      invokedModel: false },
  };
  const sourceHash = digest({ domain: CODEX_CONTROL_SCHEMAS.controllerReceiptSource, body });
  return Object.freeze({ ...body, sourceHash });
}

export function verifyCodexControllerReceiptSource(source) {
  try {
    if (!plain(source) || source.schema !== CODEX_CONTROL_SCHEMAS.controllerReceiptSource
      || !HASH.test(String(source.sourceHash ?? ""))) throw new Error("SCHEMA");
    const { sourceHash, ...body } = source;
    const replay = createCodexControllerReceiptSource({ input: body.hookInput,
      result: body.controllerResult, hookMetadata: body.hookMetadata,
      controllerPath: body.runtime?.controllerPath,
      controllerAvailable: body.runtime?.controllerAvailable,
      invocation: body.invocation, capturedAt: body.capturedAt });
    if (replay.sourceHash !== sourceHash
      || canonicalizeStrict(replay) !== canonicalizeStrict(source)) throw new Error("REPLAY");
    return { ok: true, sourceHash,
      byteLength: Buffer.byteLength(canonicalizeStrict(source)),
      verificationMode: "CANONICAL_HOOK_SOURCE_REPLAY" };
  } catch (error) {
    return { ok: false, error: `CODEX_CONTROL_RECEIPT_SOURCE_INVALID:${error?.message ?? error}` };
  }
}

export function createCodexControllerReceiptFromSource(source, {
  privateKeyPem, previousReceiptHash = null,
} = {}) {
  const checked = verifyCodexControllerReceiptSource(source);
  if (!checked.ok) fail("RECEIPT_SOURCE_INVALID");
  const input = source.hookInput;
  const result = source.controllerResult;
  const event = receiptEventName(input);
  const threadId = String(input.session_id ?? input.sessionId ?? "");
  const turnId = input.turn_id ?? input.turnId ?? null;
  const itemId = input.tool_use_id ?? input.toolUseId ?? null;
  if (!threadId) fail("RECEIPT_SOURCE_THREAD_ID_MISSING");
  const outcome = event === "postToolUse"
    ? (input.tool_response ?? input.toolResponse ?? { present: false }) : null;
  return createCodexControllerReceipt({ eventName: event,
    /* Codex hook stdin names this field session_id, but the official Rust type
       is ThreadId. Preserve it as a conservative session fallback and never
       claim the app-server session-tree identity from this payload alone. */
    sessionId: threadId, threadId, turnId, itemId,
    hookCurrentHash: source.hookMetadata?.currentHash ?? null,
    input, decision: receiptDecision(event, result), output: result.output ?? {}, outcome,
    controllerAvailable: source.runtime.controllerAvailable,
    recordedAt: source.capturedAt, privateKeyPem, previousReceiptHash,
    sourceBinding: { snapshotHash: source.sourceHash, byteLength: checked.byteLength,
      canonicalJson: true },
    runtimeClaims: { controllerPath: source.runtime.controllerPath,
      kernelControllerInvoked: source.runtime.controllerPath === "KERNEL_CONTROLLER",
      ...source.claims },
    identityProvenance: { sessionId: "HOST_SESSION_ID_FALLBACK",
      threadId: "HOST_THREAD_ID", turnId: turnId === null ? "NOT_APPLICABLE" : "HOST_TURN_ID",
      itemId: itemId === null ? "NOT_APPLICABLE" : "HOST_TOOL_USE_ID" } });
}

function collectStrings(value, into = new Set()) {
  if (typeof value === "string") into.add(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, into);
  else if (plain(value)) for (const item of Object.values(value)) collectStrings(item, into);
  return into;
}

function listedOutsiderHooks(hooksList) {
  return (hooksList?.data ?? []).flatMap((entry) => entry.hooks ?? [])
    .filter((hook) => typeof hook.command === "string" && /outsider/i.test(hook.command));
}

function receiptFor(receipts, eventName, identity = {}) {
  return receipts.find((receipt) => receipt.eventName === eventName
    && Object.entries(identity).every(([key, value]) => receipt.identity?.[key] === value));
}

function evaluateLifecycle(trace, receipts) {
  const events = trace.events;
  const missing = (trace.assessment?.gaps ?? [])
    .map((gap) => `HOST_TRACE_GAP:${gap}`);
  const completedItem = events.find((event) => event.kind === "ITEM_COMPLETED");
  const turn = completedItem && events.find((event) => event.kind === "TURN_STARTED"
    && event.threadIdHash === completedItem.threadIdHash
    && event.turnIdHash === completedItem.turnIdHash && event.sequence < completedItem.sequence);
  const thread = completedItem && events.find((event) => event.kind === "THREAD_STARTED"
    && event.threadIdHash === completedItem.threadIdHash && event.sequence < completedItem.sequence);
  const startedItem = completedItem && events.find((event) => event.kind === "ITEM_STARTED"
    && event.threadIdHash === completedItem.threadIdHash
    && event.turnIdHash === completedItem.turnIdHash
    && event.itemIdHash === completedItem.itemIdHash && event.sequence < completedItem.sequence);
  const ids = completedItem && { sessionIdHash: thread?.sessionIdHash,
    threadIdHash: completedItem.threadIdHash,
    turnIdHash: completedItem.turnIdHash, itemIdHash: completedItem.itemIdHash };
  const preReceipt = ids && receiptFor(receipts, "preToolUse", ids);
  const postReceipt = ids && receiptFor(receipts, "postToolUse", ids);
  const sessionReceipt = thread && receiptFor(receipts, "sessionStart", {
    sessionIdHash: thread.sessionIdHash, threadIdHash: thread.threadIdHash });
  const promptReceipt = thread && receiptFor(receipts, "userPromptSubmit", {
    sessionIdHash: thread.sessionIdHash, threadIdHash: thread.threadIdHash });
  const stopReceipt = turn && receiptFor(receipts, "stop", {
    sessionIdHash: thread?.sessionIdHash, threadIdHash: turn.threadIdHash,
    turnIdHash: turn.turnIdHash });
  if (!thread?.sessionIdHash || !thread?.cwdHash) missing.push("SESSION_CONTEXT_IDENTITY_NOT_HOST_BOUND");
  const hostSession = thread && events.some((event) => event.kind === "HOOK_COMPLETED"
    && event.eventName === "sessionStart" && event.threadIdHash === thread.threadIdHash
    && event.status === "completed" && event.sequence < startedItem?.sequence);
  const hostPrompt = turn && events.some((event) => event.kind === "HOOK_COMPLETED"
    && event.eventName === "userPromptSubmit" && event.threadIdHash === turn.threadIdHash
    && event.turnIdHash === turn.turnIdHash && event.status === "completed"
    && event.sequence < startedItem?.sequence);
  if (!hostSession) missing.push("HOST_SESSION_START_DELIVERY_MISSING");
  if (!hostPrompt) missing.push("HOST_USER_PROMPT_DELIVERY_MISSING");
  if (!sessionReceipt) missing.push("SESSION_START_CONTROLLER_RECEIPT_MISSING");
  if (!promptReceipt) missing.push("USER_PROMPT_CONTROLLER_RECEIPT_MISSING");
  if (!startedItem || !completedItem) missing.push("ACTION_OUTCOME_PAIR_MISSING");
  if (!preReceipt) missing.push("PRE_ACTION_CONTROLLER_ITEM_BINDING_MISSING");
  if (!postReceipt) missing.push("POST_OUTCOME_CONTROLLER_ITEM_BINDING_MISSING");
  if (!stopReceipt) missing.push("STOP_CONTROLLER_RECEIPT_MISSING");
  const expectedReceiptRoutes = [
    [sessionReceipt, "sessionStart", "ATTACHED_POLICY", false],
    [promptReceipt, "userPromptSubmit", "ATTACHED_POLICY", false],
    [preReceipt, "preToolUse", "KERNEL_CONTROLLER", true],
    [postReceipt, "postToolUse", "KERNEL_CONTROLLER", true],
    [stopReceipt, "stop", "KERNEL_CONTROLLER", true],
  ];
  const boundReceipts = expectedReceiptRoutes.map(([receipt]) => receipt).filter(Boolean);
  for (const [receipt, eventName, controllerPath, kernelControllerInvoked]
    of expectedReceiptRoutes) {
    if (receipt && (receipt.runtimeClaims?.controllerPath !== controllerPath
      || receipt.runtimeClaims?.kernelControllerInvoked !== kernelControllerInvoked)) {
      missing.push(`CONTROLLER_ROUTE_MISMATCH:${eventName}`);
    }
  }
  if (boundReceipts.some((receipt) => receipt.identityProvenance.threadId !== "HOST_THREAD_ID"
    || receipt.identityProvenance.sessionId !== "HOST_SESSION_ID"
    || (receipt.identity.turnIdHash !== null
      && receipt.identityProvenance.turnId !== "HOST_TURN_ID")
    || (receipt.identity.itemIdHash !== null
      && receipt.identityProvenance.itemId !== "HOST_TOOL_USE_ID"))) {
    missing.push("CONTROLLER_IDENTITY_FALLBACK_USED");
  }
  const hostPreEvent = ids && events.find((event) => event.kind === "HOOK_COMPLETED"
    && event.eventName === "preToolUse" && event.threadIdHash === ids.threadIdHash
    && event.turnIdHash === ids.turnIdHash && event.hookItemIdHash === ids.itemIdHash
    && event.sequence < startedItem?.sequence
    && ["completed", "blocked"].includes(event.status));
  const hostPre = hostPreEvent && (hostPreEvent.status === "completed"
    ? preReceipt?.decision === "ALLOW" : ["DENY", "BLOCK"].includes(preReceipt?.decision));
  const hostPost = ids && events.some((event) => event.kind === "HOOK_COMPLETED"
    && event.eventName === "postToolUse" && event.threadIdHash === ids.threadIdHash
    && event.turnIdHash === ids.turnIdHash && event.hookItemIdHash === ids.itemIdHash
    && event.sequence > completedItem.sequence
    && event.status === "completed");
  const hostStopEvent = turn && events.find((event) => event.kind === "HOOK_COMPLETED"
    && event.eventName === "stop" && event.threadIdHash === turn.threadIdHash
    && event.turnIdHash === turn.turnIdHash && event.sequence > completedItem?.sequence
    && ["completed", "blocked"].includes(event.status));
  const hostStop = hostStopEvent && (hostStopEvent.status === "completed"
    ? stopReceipt?.decision === "ALLOW" : ["DENY", "BLOCK"].includes(stopReceipt?.decision));
  const hostTurnComplete = turn && events.some((event) => event.kind === "TURN_COMPLETED"
    && event.threadIdHash === turn.threadIdHash && event.turnIdHash === turn.turnIdHash
    && event.sequence > completedItem?.sequence);
  if (!hostPre) missing.push("HOST_PRE_ACTION_DELIVERY_MISSING");
  if (!hostPost) missing.push("HOST_POST_OUTCOME_DELIVERY_MISSING");
  if (!hostStop) missing.push("HOST_STOP_DELIVERY_MISSING");
  if (!hostTurnComplete) missing.push("HOST_TURN_COMPLETION_MISSING");
  const exactApprovalIntervention = events.some((event) => event.kind === "APPROVAL_RESPONSE"
    && ["decline", "cancel"].includes(event.decision)
    && receipts.some((receipt) => receipt.eventName === "preToolUse"
      && ["DENY", "BLOCK"].includes(receipt.decision)
      && receipt.identity.threadIdHash === event.threadIdHash
      && receipt.identity.turnIdHash === event.turnIdHash
      && receipt.identity.itemIdHash === event.itemIdHash
      && receipt.hostDeliveryBinding?.approvalRequestIdHash === event.requestIdHash
      && receipt.hostDeliveryBinding?.approvalResponseNativeHash === event.nativeRefHash));
  const hookBlocked = events.some((event) => event.kind === "HOOK_COMPLETED"
    && event.eventName === "preToolUse" && event.status === "blocked");
  if (!exactApprovalIntervention) missing.push("EXACT_HOST_CONTROLLER_INTERVENTION_MISSING");
  return { missing: uniqueSorted(missing), exactApprovalIntervention, hookBlocked,
    exactActionBinding: Boolean(preReceipt && postReceipt && hostPre && hostPost),
    fullLifecycle: missing.length === 0 };
}

/**
 * Build the honest machine decision.  A verified hook list without a signed
 * source trace stays UNCONTROLLED; a host block without exact controller/item
 * binding is ACTION_CONTROLLED_PARTIAL; only the complete chain reaches
 * LIFECYCLE_CONTROLLED.
 */
export function assessCodexStage05Control({
  hookProbe, binaryBytes, schemaBytes, appServerSchemaBytes = schemaBytes, hooksList,
  trace = null, traceSource = null, controllerReceipts = [],
  controllerReceiptSources = [],
  trustedRecorderKeyIds = [], trustedControllerKeyIds = [],
} = {}) {
  const missing = [];
  const probe = verifyCodexHookCapabilityProbe(hookProbe,
    { binaryBytes, schemaBytes, hooksList });
  if (!probe.ok || probe.verificationMode !== "FULL_LOCAL_METADATA_REPLAY") {
    missing.push(`HOOK_METADATA_SOURCE_REPLAY_FAILED:${probe.error ?? "MODE"}`);
  } else {
    if (probe.engineSupportsControlledCandidate !== true) {
      missing.push("HOOK_PROBE_CORE_EVENT_ENGINE_SUPPORT_MISSING");
    }
    if (probe.installedControlHooksTrusted !== true) {
      missing.push("HOOK_PROBE_CORE_EVENT_TRUSTED_INSTALL_MISSING");
    }
  }
  const methods = (() => {
    try { return collectStrings(JSON.parse(sourceBuffer(appServerSchemaBytes).toString("utf8"))); }
    catch { return new Set(); }
  })();
  for (const method of REQUIRED_APP_SERVER_METHODS) {
    if (!methods.has(method)) missing.push(`APP_SERVER_METHOD_MISSING:${method}`);
  }
  const hookItemIdentity = codexAppServerHookItemIdentityCapability(appServerSchemaBytes);
  if (!hookItemIdentity.exposed) missing.push("APP_SERVER_HOOK_ITEM_ID_NOT_EXPOSED");
  const hooks = listedOutsiderHooks(hooksList);
  for (const eventName of REQUIRED_INSTALLED_HOOKS) {
    /* A universal plugin may legitimately add an Outsider-branded boundary
       notice beside the controller hook. Only exact attached-control commands
       occupy the control-authority slot; bypass remains an independent global
       failure and is never promoted as a candidate. */
    const candidates = hooks.filter((hook) => hook.eventName === eventName
      && /(?:^|\s)--attached-control(?:\s|$)/.test(hook.command)
      && !/--dangerously-bypass-hook-trust/.test(hook.command));
    if (!candidates.length) missing.push(`CONTROL_HOOK_MISSING:${eventName}`);
    else if (candidates.length !== 1) missing.push(`CONTROL_HOOK_AMBIGUOUS:${eventName}`);
    else if (!candidates[0].enabled
      || !["trusted", "managed"].includes(candidates[0].trustStatus)) {
      missing.push(`CONTROL_HOOK_NOT_TRUSTED_ATTACHED:${eventName}`);
    }
  }
  if (hooks.some((hook) => /--dangerously-bypass-hook-trust/.test(hook.command))) {
    missing.push("HOOK_TRUST_BYPASS_PRESENT");
  }
  let checkedTrace = null;
  if (!trace || traceSource == null) missing.push("SIGNED_APP_SERVER_TRACE_MISSING");
  else {
    checkedTrace = verifyCodexAppServerControlTrace(trace,
      { source: traceSource, trustedRecorderKeyIds });
    if (!checkedTrace.ok) missing.push(`APP_SERVER_TRACE_INVALID:${checkedTrace.error}`);
    else {
      if (trace.binarySha256 !== hookProbe?.binary?.sha256
        || trace.schemaBundleHash !== hookProbe?.generatedSchema?.bundleHash
        || trace.appServerSchemaBundleHash !== digest(appServerSchemaBytes)
        || trace.hookProbeRecordHash !== hookProbe?.recordHash) {
        missing.push("TRACE_METADATA_BINDING_MISMATCH");
      }
      const hookListResponse = trace.events.find((event) => event.kind === "HOOKS_LIST_RESPONSE"
        && event.resultHash === digest(hooksList));
      if (!hookListResponse) missing.push("HOOK_TRUST_SAME_CONNECTION_NOT_PROVEN");
    }
  }
  const verifiedReceipts = [];
  const sourceReplayedReceiptHashes = [];
  const receiptIdentities = new Set();
  const receiptSources = new Map((controllerReceiptSources ?? []).map((entry) =>
    [entry?.receiptHash, entry?.source]));
  for (const receipt of controllerReceipts) {
    const checked = verifyCodexControllerReceipt(receipt, { trustedControllerKeyIds,
      source: receiptSources.get(receipt?.receiptHash) ?? null });
    if (!checked.ok) missing.push(`CONTROLLER_RECEIPT_INVALID:${checked.error}`);
    else {
      const identity = canonicalizeStrict({ eventName: receipt.eventName,
        identity: receipt.identity });
      if (receiptIdentities.has(identity)) missing.push("CONTROLLER_RECEIPT_DUPLICATE");
      else {
        receiptIdentities.add(identity);
        verifiedReceipts.push(receipt);
        if (checked.sourceArtifactsReverified === true) {
          sourceReplayedReceiptHashes.push(receipt.receiptHash);
        }
      }
    }
  }
  /* A valid signature proves signer attribution, but "live" additionally
     requires replay of the exact canonical hook source. Legacy/test receipts
     may exercise the verifier; they cannot close a production runtime gap. */
  if (sourceReplayedReceiptHashes.length === 0) {
    missing.push("LIVE_CONTROLLER_RECEIPTS_MISSING");
  }
  const configuredHashes = new Map(hooks.map((hook) => [hook.eventName,
    new Set(hooks.filter((candidate) => candidate.eventName === hook.eventName
      && candidate.enabled && ["trusted", "managed"].includes(candidate.trustStatus)
      && /(?:^|\s)--attached-control(?:\s|$)/.test(candidate.command)
      && !/--dangerously-bypass-hook-trust/.test(candidate.command))
      .map((candidate) => candidate.currentHash))]));
  if (verifiedReceipts.some((receipt) => receipt.hookCurrentHash === null)) {
    missing.push("CONTROLLER_RECEIPT_HOOK_HASH_UNAVAILABLE");
  }
  if (verifiedReceipts.some((receipt) => receipt.hookCurrentHash !== null
    && !configuredHashes.get(receipt.eventName)?.has(receipt.hookCurrentHash))) {
    missing.push("CONTROLLER_RECEIPT_HOOK_HASH_MISMATCH");
  }
  let lifecycle = { missing: ["LIVE_LIFECYCLE_NOT_EVALUATED"],
    exactApprovalIntervention: false, hookBlocked: false,
    exactActionBinding: false, fullLifecycle: false };
  if (checkedTrace?.ok) lifecycle = evaluateLifecycle(trace, verifiedReceipts);
  missing.push(...lifecycle.missing);
  let controlLevel = "UNCONTROLLED";
  /* A user/client decline and an arbitrary host hook block are not Outsider
     decisions.  Partial control requires the exact native approval response to
     be cross-bound to a trusted controller DENY/BLOCK receipt. */
  if (checkedTrace?.ok && lifecycle.exactApprovalIntervention) {
    controlLevel = "ACTION_CONTROLLED_PARTIAL";
  }
  if (missing.length === 0 && lifecycle.fullLifecycle) controlLevel = "LIFECYCLE_CONTROLLED";
  const body = {
    schema: CODEX_CONTROL_SCHEMAS.assessment,
    provider: "codex",
    controlLevel,
    doD: {
      preActionCapture: lifecycle.exactActionBinding,
      controllerDecisionAndIntervention: lifecycle.exactApprovalIntervention,
      postOutcome: lifecycle.exactActionBinding,
      stopFinalization: checkedTrace?.stopFinalizationHookObserved === true
        && !lifecycle.missing.includes("STOP_CONTROLLER_RECEIPT_MISSING"),
      sessionContextIdentity: checkedTrace?.sessionContextIdentityObserved === true,
      failVisibleAvailability: verifiedReceipts.length > 0
        && verifiedReceipts.every((receipt) => receipt.availability?.controllerAvailable === true
          || receipt.availability?.failVisible === true),
    },
    claimBoundary: {
      payload: { canonicalHookSourceReplayed: sourceReplayedReceiptHashes.length > 0,
        receiptCount: sourceReplayedReceiptHashes.length },
      hostDelivery: { appServerSourceReplayed: checkedTrace?.ok === true,
        exactActionCrossBinding: lifecycle.exactActionBinding },
      outsiderAttribution: { trustedSignedReceipt: verifiedReceipts.length > 0,
        exactNativeInterventionCrossBinding: lifecycle.exactApprovalIntervention },
      semanticRecovery: { established: false,
        requiredEvidence: "SEPARATE_STAGE05_CAUSAL_AND_OUTCOME_PROOF" },
    },
    missingRequirements: uniqueSorted(missing),
    evidence: { hookProbeRecordHash: hookProbe?.recordHash ?? null,
      traceHash: checkedTrace?.ok ? trace.traceHash : null,
      hostHookItemIdentityExposed: hookItemIdentity.exposed,
      controllerReceiptHashes: verifiedReceipts.map((receipt) => receipt.receiptHash).sort(),
      sourceReplayedControllerReceiptHashes: sourceReplayedReceiptHashes.sort() },
    authority: { invokedModel: false, bypassedHookTrust: false,
      callerSelfReportAccepted: false, establishesSemanticOutcome: false },
  };
  return Object.freeze({ ...body, assessmentHash: digest(body) });
}

export function verifyCodexStage05ControlAssessment(record, sources = {}) {
  if (!plain(record) || record.schema !== CODEX_CONTROL_SCHEMAS.assessment
    || !HASH.test(String(record.assessmentHash ?? ""))) {
    return { ok: false, error: "CODEX_CONTROL_ASSESSMENT_SCHEMA_INVALID",
      sourceArtifactsReverified: false };
  }
  const { assessmentHash, ...body } = record;
  if (digest(body) !== assessmentHash) return { ok: false,
    error: "CODEX_CONTROL_ASSESSMENT_HASH_INVALID", sourceArtifactsReverified: false };
  try {
    const rebuilt = assessCodexStage05Control(sources);
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(record)) {
      return { ok: false, error: "CODEX_CONTROL_ASSESSMENT_SOURCE_REPLAY_MISMATCH",
        sourceArtifactsReverified: false };
    }
    return { ok: true, assessmentHash, controlLevel: record.controlLevel,
      sourceArtifactsReverified: true, verificationMode: "FULL_CONTROL_SOURCE_REPLAY" };
  } catch (error) {
    return { ok: false, error: `CODEX_CONTROL_ASSESSMENT_INVALID:${error?.message ?? error}`,
      sourceArtifactsReverified: false };
  }
}
