import {
  chmodSync, closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, renameSync, writeFileSync,
} from "node:fs";
import { createPublicKey, generateKeyPairSync, randomUUID } from "node:crypto";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { attachedSessionKey } from "./outsider-attached-ledger.js";
import {
  codexControlKeyId, createCodexControllerReceiptFromSource,
  createCodexControllerReceiptSource, verifyCodexControllerReceiptSource,
} from "./outsider-codex-control-evidence.js";
import { workerDigest } from "./outsider-worker-adapter.js";

const HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_PRIVATE_KEY_BYTES = 64 * 1024;
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const MAX_RECEIPT_SOURCE_BYTES = 64 * 1024 * 1024;

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("CODEX_LIVE_RECEIPT_DIRECTORY_NOT_PRIVATE_DIRECTORY");
  }
  chmodSync(directory, 0o700);
}

function safeExistingDirectory(directory) {
  try {
    const stat = lstatSync(directory);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch { return false; }
}

function secureRead(file, maximum, { privateFile = false } = {}) {
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  const descriptor = openSync(file, flags);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(maximum)) {
      throw new Error("CODEX_LIVE_RECEIPT_SOURCE_FILE_INVALID");
    }
    if (privateFile && ((Number(before.mode) & 0o077) !== 0
      || (typeof process.getuid === "function" && before.uid !== BigInt(process.getuid())))) {
      throw new Error("CODEX_LIVE_RECEIPT_PRIVATE_KEY_PERMISSIONS_INVALID");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    for (const key of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[key] !== after[key]) throw new Error("CODEX_LIVE_RECEIPT_SOURCE_CHANGED");
    }
    if (BigInt(bytes.length) !== after.size) throw new Error("CODEX_LIVE_RECEIPT_SIZE_CHANGED");
    return bytes;
  } finally { closeSync(descriptor); }
}

function exclusive(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
}

function atomicJson(file, value) {
  ensurePrivateDirectory(path.dirname(file));
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  renameSync(temporary, file);
}

function eventName(input = {}) {
  const raw = String(input.hook_event_name ?? input.hookEventName ?? "");
  return ({ SessionStart: "sessionStart", UserPromptSubmit: "userPromptSubmit",
    PreToolUse: "preToolUse", PostToolUse: "postToolUse", PreCompact: "preCompact",
    PostCompact: "postCompact", Stop: "stop", SubagentStart: "subagentStart",
    SubagentStop: "subagentStop", PermissionRequest: "permissionRequest" })[raw] ?? raw;
}

function metadataFromRuntime(runtime = {}, input = {}) {
  const file = runtime.hookMetadataFile;
  if (typeof file !== "string" || !file) return null;
  try {
    const bytes = secureRead(path.resolve(file), MAX_METADATA_BYTES);
    const snapshot = JSON.parse(bytes.toString("utf8"));
    if (snapshot?.schema !== "outsider/codex-same-connection-hook-metadata/v1"
      || !HASH.test(String(snapshot.snapshotHash ?? ""))) return null;
    const { snapshotHash, ...body } = snapshot;
    if (workerDigest({ domain: snapshot.schema, body }) !== snapshotHash) return null;
    const target = eventName(input);
    const hooks = (snapshot.hooksList?.data ?? []).flatMap((entry) => entry?.hooks ?? []);
    const candidates = hooks.filter((hook) => hook?.eventName === target
      && typeof hook?.command === "string"
      && /(?:^|\s)--attached-control(?:\s|$)/.test(hook.command)
      && !/--dangerously-bypass-hook-trust/.test(hook.command));
    if (candidates.length !== 1) return null;
    const hook = candidates[0];
    if (!HASH.test(String(hook.currentHash ?? ""))
      || !["trusted", "managed", "untrusted", "modified"].includes(hook.trustStatus)
      || typeof hook.sourcePath !== "string") return null;
    return { eventName: target, currentHash: hook.currentHash,
      trustStatus: hook.trustStatus, commandHash: workerDigest(hook.command),
      sourcePathHash: workerDigest(hook.sourcePath), metadataSnapshotHash: snapshotHash };
  } catch { return null; }
}

function localSigningKey(root) {
  const directory = path.join(root, "codex-control");
  ensurePrivateDirectory(root);
  const file = path.join(directory, "controller-ed25519-private.pem");
  ensurePrivateDirectory(directory);
  if (!existsSync(file)) {
    const keys = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    try { exclusive(file, keys.privateKey); } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  const privateKeyPem = secureRead(file, MAX_PRIVATE_KEY_BYTES,
    { privateFile: true }).toString("utf8");
  return { privateKeyPem, source: "LOCAL_INSTALLATION_KEY", file };
}

export function ensureCodexLiveReceiptIdentity({ root } = {}) {
  const resolvedRoot = path.resolve(root);
  const key = localSigningKey(resolvedRoot);
  const publicKeyPem = createPublicKey(key.privateKeyPem)
    .export({ type: "spki", format: "pem" }).toString();
  const keyId = codexControlKeyId(publicKeyPem);
  atomicJson(path.join(resolvedRoot, "codex-control", "controller-public-key.json"), {
    schema: "outsider/codex-controller-public-key/v1", keyId, publicKeyPem,
    privateKeyLocation: "LOCAL_ONLY_NOT_EXPORTED",
  });
  return { ...key, publicKeyPem, keyId };
}

function currentHead(directory) {
  try {
    const head = JSON.parse(secureRead(path.join(directory, "head.json"), 64 * 1024));
    return HASH.test(String(head?.receiptHash ?? "")) ? head.receiptHash : null;
  } catch { return null; }
}

export class CodexLiveReceiptStore {
  constructor({ root }) {
    if (!root) throw new Error("CODEX_LIVE_RECEIPT_ROOT_REQUIRED");
    this.root = path.resolve(root);
    ensurePrivateDirectory(this.root);
  }

  record({ input, result, runtime = {}, controllerPath = "ATTACHED_POLICY",
    controllerAvailable = true, capturedAt = new Date() } = {}) {
    const sessionKey = attachedSessionKey(input);
    if (!sessionKey) throw new Error("CODEX_LIVE_RECEIPT_THREAD_ID_REQUIRED");
    const sessionsDirectory = path.join(this.root, "sessions");
    const sessionDirectory = path.join(sessionsDirectory, sessionKey);
    const directory = path.join(sessionDirectory, "codex-control");
    ensurePrivateDirectory(sessionsDirectory);
    ensurePrivateDirectory(sessionDirectory);
    ensurePrivateDirectory(directory);
    const key = ensureCodexLiveReceiptIdentity({ root: this.root });
    const source = createCodexControllerReceiptSource({ input, result,
      hookMetadata: metadataFromRuntime(runtime, input), controllerPath, controllerAvailable,
      capturedAt, invocation: { agent: "codex", attachedControl: true,
        bypassedHookTrust: false,
        entrypointHash: runtime.entrypointHash ?? null, argvHash: runtime.argvHash ?? null,
        signingKeySource: "LOCAL_INSTALLATION_KEY" } });
    const sourceBytes = Buffer.from(canonicalizeStrict(source));
    if (sourceBytes.length > MAX_RECEIPT_SOURCE_BYTES) {
      throw new Error("CODEX_LIVE_RECEIPT_SOURCE_TOO_LARGE");
    }
    const previousReceiptHash = currentHead(directory);
    const receipt = createCodexControllerReceiptFromSource(source,
      { privateKeyPem: key.privateKeyPem, previousReceiptHash });
    const sourceName = source.sourceHash.slice("sha256:".length);
    const receiptName = receipt.receiptHash.slice("sha256:".length);
    const sourceFile = path.join(directory, "sources", `${sourceName}.json`);
    const receiptFile = path.join(directory, "receipts", `${receiptName}.json`);
    if (!existsSync(sourceFile)) exclusive(sourceFile, sourceBytes);
    exclusive(receiptFile, Buffer.from(canonicalizeStrict(receipt)));
    atomicJson(path.join(directory, "head.json"), {
      schema: "outsider/codex-controller-receipt-head/v1",
      receiptHash: receipt.receiptHash, sourceHash: source.sourceHash,
      controllerKeyId: codexControlKeyId(receipt.signature.publicKeyPem),
      updatedAt: source.capturedAt,
    });
    return { receipt, source, sourceFile, receiptFile, controllerKeyId: receipt.signature.keyId,
      signingKeySource: "LOCAL_INSTALLATION_KEY" };
  }
}

function readJsonIfSafe(file, maximum) {
  try { return JSON.parse(secureRead(file, maximum).toString("utf8")); }
  catch { return null; }
}

export function loadCodexLiveReceiptBundles({ root, threadIds = [] } = {}) {
  const resolvedRoot = path.resolve(root);
  if (!safeExistingDirectory(resolvedRoot)
    || !safeExistingDirectory(path.join(resolvedRoot, "sessions"))) return [];
  const identities = new Set(threadIds.map(String).filter(Boolean));
  const bundles = [];
  const seen = new Set();
  const seenSessions = new Set();
  for (const threadId of identities) {
    const sessionKey = attachedSessionKey({ session_id: threadId });
    if (!sessionKey || seenSessions.has(sessionKey)) continue;
    seenSessions.add(sessionKey);
    const sessionDirectory = path.join(resolvedRoot, "sessions", sessionKey);
    const directory = path.join(sessionDirectory, "codex-control");
    if (!safeExistingDirectory(sessionDirectory) || !safeExistingDirectory(directory)
      || !safeExistingDirectory(path.join(directory, "receipts"))
      || !safeExistingDirectory(path.join(directory, "sources"))) continue;
    let names = [];
    try { names = readdirSync(path.join(directory, "receipts")); } catch { continue; }
    const candidates = new Map();
    for (const name of names.filter((entry) => /^[a-f0-9]{64}\.json$/.test(entry)).sort()) {
      const receipt = readJsonIfSafe(path.join(directory, "receipts", name), 2 * 1024 * 1024);
      const sourceHash = receipt?.sourceBinding?.snapshotHash;
      if (!HASH.test(String(receipt?.receiptHash ?? "")) || !HASH.test(String(sourceHash ?? ""))
        || seen.has(receipt.receiptHash)) continue;
      const source = readJsonIfSafe(path.join(directory, "sources",
        `${sourceHash.slice("sha256:".length)}.json`), MAX_RECEIPT_SOURCE_BYTES);
      const checked = verifyCodexControllerReceiptSource(source);
      const sourceThread = source?.hookInput?.session_id ?? source?.hookInput?.sessionId;
      if (!checked.ok || checked.sourceHash !== sourceHash || !identities.has(String(sourceThread))) {
        continue;
      }
      candidates.set(receipt.receiptHash,
        { receiptHash: receipt.receiptHash, receipt, source });
    }
    const head = readJsonIfSafe(path.join(directory, "head.json"), 64 * 1024);
    const headBundle = candidates.get(head?.receiptHash);
    let cursor = head?.schema === "outsider/codex-controller-receipt-head/v1"
      && HASH.test(String(head?.receiptHash ?? ""))
      && headBundle?.source?.sourceHash === head?.sourceHash
      && headBundle?.receipt?.signature?.keyId === head?.controllerKeyId
      ? head.receiptHash : null;
    const reverse = [];
    const chainSeen = new Set();
    while (cursor !== null) {
      if (chainSeen.has(cursor)) { reverse.length = 0; break; }
      chainSeen.add(cursor);
      const bundle = candidates.get(cursor);
      if (!bundle) { reverse.length = 0; break; }
      reverse.push(bundle);
      cursor = bundle.receipt.previousReceiptHash;
    }
    for (const bundle of reverse.reverse()) {
      if (seen.has(bundle.receiptHash)) continue;
      seen.add(bundle.receiptHash);
      bundles.push(bundle);
    }
  }
  return bundles;
}
