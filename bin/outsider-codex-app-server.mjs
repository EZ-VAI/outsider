#!/usr/bin/env node
/*
 * Transparent stdio recorder for a Codex app-server connection.
 *
 * The bridge does not submit a prompt and does not choose a model.  It proxies
 * a client-owned JSON-RPC stream, injects one `hooks/list` request on that same
 * initialized connection, and seals the exact duplex frames on graceful exit.
 * Raw bytes stay local and mode 0600; the signed artifact is hash-only.
 */

import { spawn } from "node:child_process";
import {
  existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  assessCodexStage05Control, createCodexAppServerControlTrace,
} from "../src/outsider-codex-control-evidence.js";
import {
  verifyCodexHookCapabilityProbe,
} from "../src/outsider-codex-worker-adapter.js";
import { canonicalizeStrict } from "../src/canonical.js";
import { workerDigest } from "../src/outsider-worker-adapter.js";
import { defaultAttachedRoot } from "../src/outsider-attached-client.js";
import {
  ensureCodexLiveReceiptIdentity, loadCodexLiveReceiptBundles,
} from "../src/outsider-codex-live-receipts.js";

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  return index < 0 ? null : args[index + 1] ?? null;
};
const cwd = path.resolve(value("--cwd") ?? process.cwd());
const sourceFile = value("--source") && path.resolve(value("--source"));
const traceFile = value("--trace") && path.resolve(value("--trace"));
const assessmentFile = value("--assessment")
  ? path.resolve(value("--assessment")) : traceFile && `${traceFile}.readiness.json`;
const signingKeyFile = value("--signing-key") && path.resolve(value("--signing-key"));
const probeFile = value("--probe") && path.resolve(value("--probe"));
const nativeBinaryFile = value("--native-binary") && path.resolve(value("--native-binary"));
const schemaFile = value("--schema") && path.resolve(value("--schema"));
const appServerSchemaFile = value("--app-server-schema")
  && path.resolve(value("--app-server-schema"));
const hookMetadataFile = value("--hook-metadata")
  ? path.resolve(value("--hook-metadata")) : sourceFile && `${sourceFile}.hook-metadata.json`;
const receiptRoot = path.resolve(value("--receipt-root") ?? defaultAttachedRoot());
if ([sourceFile, traceFile, assessmentFile, signingKeyFile, probeFile, nativeBinaryFile,
  schemaFile, appServerSchemaFile, hookMetadataFile].some((entry) => !entry)
  || args.includes("--dangerously-bypass-hook-trust")) {
  process.stderr.write("usage: outsider-codex-app-server --source <raw.jsonl> --trace <trace.json> "
    + "[--assessment <readiness.json>] "
    + "--signing-key <ed25519-private.pem> --probe <probe.json> --native-binary <codex-native> "
    + "--schema <v2-schema.json> --app-server-schema <full-schema.json> "
    + "[--hook-metadata <private.json>] [--receipt-root <attached-root>] "
    + "[--codex /same/exact/native/codex] [--cwd dir]\n");
  process.exit(2);
}
if (existsSync(sourceFile) || existsSync(traceFile) || existsSync(assessmentFile)
  || existsSync(hookMetadataFile)) {
  throw new Error("CODEX_APP_SERVER_RECORDER_OUTPUT_ALREADY_EXISTS");
}
const codex = path.resolve(value("--codex") ?? nativeBinaryFile);
if (realpathSync(codex) !== realpathSync(nativeBinaryFile)) {
  throw new Error("CODEX_APP_SERVER_RECORDER_MUST_LAUNCH_PINNED_NATIVE_BINARY");
}

const probe = JSON.parse(readFileSync(probeFile, "utf8"));
const nativeBinaryBytes = readFileSync(nativeBinaryFile);
const schemaBytes = readFileSync(schemaFile);
const appServerSchemaBytes = readFileSync(appServerSchemaFile);
const privateKeyPem = readFileSync(signingKeyFile, "utf8");
if (workerDigest(nativeBinaryBytes) !== probe.binary?.sha256
  || workerDigest(schemaBytes) !== probe.generatedSchema?.bundleHash) {
  throw new Error("CODEX_APP_SERVER_RECORDER_PROBE_SOURCE_MISMATCH");
}
/* Pin the controller identity before the child can execute any hook. The
   recorder key is deliberately not inherited by Codex or model-launched tools. */
const controllerIdentity = ensureCodexLiveReceiptIdentity({ root: receiptRoot });

const child = spawn(codex, ["app-server", "--stdio"], {
  cwd, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env,
    OUTSIDER_CODEX_HOOK_METADATA_FILE: hookMetadataFile,
    OUTSIDER_ATTACHED_ROOT: receiptRoot },
});
const frames = [];
const internalHooksId = `outsider-hooks-list-${process.pid}`;
let clientBuffer = "", serverBuffer = "", hooksList = null;
let injectedHooksList = false, finished = false, inputEnded = false;

function frame(direction, message) {
  if (message === null || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("CODEX_APP_SERVER_RECORDER_MESSAGE_INVALID");
  }
  frames.push({ sequence: frames.length, direction, message });
}

function writeChild(message) {
  frame("CLIENT_TO_SERVER", message);
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function clientMessage(message) {
  if (Object.hasOwn(message, "id")) {
    const key = canonicalizeStrict(message.id);
    if (key === canonicalizeStrict(internalHooksId)) {
      throw new Error("CODEX_APP_SERVER_RECORDER_RESERVED_ID_COLLISION");
    }
  }
  writeChild(message);
  if (message.method === "initialized" && !injectedHooksList) {
    injectedHooksList = true;
    writeChild({ id: internalHooksId, method: "hooks/list", params: { cwds: [cwd] } });
  }
}

function serverMessage(message) {
  frame("SERVER_TO_CLIENT", message);
  if (Object.hasOwn(message, "id")
    && canonicalizeStrict(message.id) === canonicalizeStrict(internalHooksId)) {
    if (message.error || !message.result) {
      throw new Error("CODEX_APP_SERVER_RECORDER_HOOKS_LIST_FAILED");
    }
    hooksList = message.result;
    const metadataBody = { schema: "outsider/codex-same-connection-hook-metadata/v1",
      recordedAt: new Date().toISOString(), cwdHash: workerDigest(cwd), hooksList };
    const metadata = { ...metadataBody,
      snapshotHash: workerDigest({ domain: metadataBody.schema, body: metadataBody }) };
    writeExclusive(hookMetadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
    if (inputEnded) child.stdin.end();
    return;
  }
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function consume(which, chunk, handler) {
  const prior = which === "client" ? clientBuffer : serverBuffer;
  let buffer = prior + chunk.toString("utf8"), newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    handler(JSON.parse(line));
  }
  if (which === "client") clientBuffer = buffer;
  else serverBuffer = buffer;
}

function writeExclusive(file, bytes) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, bytes, { mode: 0o600, flag: "wx" });
}

function finalize(code) {
  if (finished) return;
  finished = true;
  try {
    if (clientBuffer.trim() || serverBuffer.trim()) {
      throw new Error("CODEX_APP_SERVER_RECORDER_TRUNCATED_FRAME");
    }
    if (!hooksList) throw new Error("CODEX_APP_SERVER_RECORDER_SAME_CONNECTION_HOOKS_MISSING");
    if (workerDigest(readFileSync(nativeBinaryFile)) !== probe.binary.sha256
      || workerDigest(readFileSync(schemaFile)) !== probe.generatedSchema.bundleHash
      || workerDigest(readFileSync(appServerSchemaFile)) !== workerDigest(appServerSchemaBytes)) {
      throw new Error("CODEX_APP_SERVER_RECORDER_SOURCE_CHANGED_DURING_RUN");
    }
    const replay = verifyCodexHookCapabilityProbe(probe,
      { binaryBytes: nativeBinaryBytes, schemaBytes, hooksList });
    if (!replay.ok || replay.verificationMode !== "FULL_LOCAL_METADATA_REPLAY") {
      throw new Error(`CODEX_APP_SERVER_RECORDER_METADATA_REPLAY_FAILED:${replay.error ?? "MODE"}`);
    }
    const source = Buffer.from(frames.map((entry) => canonicalizeStrict(entry)).join("\n") + "\n");
    const trace = createCodexAppServerControlTrace(source, { privateKeyPem,
      binarySha256: probe.binary.sha256,
      schemaBundleHash: probe.generatedSchema.bundleHash,
      appServerSchemaBundleHash: workerDigest(appServerSchemaBytes),
      hookProbeRecordHash: probe.recordHash, bypassedHookTrust: false });
    const threadIds = frames.filter((entry) => entry.direction === "SERVER_TO_CLIENT"
      && entry.message?.method === "thread/started")
      .map((entry) => entry.message?.params?.thread?.id).filter(Boolean);
    const liveBundles = loadCodexLiveReceiptBundles({ root: receiptRoot, threadIds });
    const assessment = assessCodexStage05Control({ hookProbe: probe,
      binaryBytes: nativeBinaryBytes, schemaBytes, appServerSchemaBytes, hooksList,
      trace, traceSource: source,
      controllerReceipts: liveBundles.map((entry) => entry.receipt),
      controllerReceiptSources: liveBundles,
      trustedRecorderKeyIds: [trace.signature.keyId],
      trustedControllerKeyIds: [controllerIdentity.keyId] });
    writeExclusive(sourceFile, source);
    writeExclusive(traceFile, `${JSON.stringify(trace, null, 2)}\n`);
    writeExclusive(assessmentFile, `${JSON.stringify(assessment, null, 2)}\n`);
    process.stderr.write(`outsider: Codex app-server trace sealed (${trace.traceHash}); `
      + `${liveBundles.length} source-replayed controller receipt(s); no model was started by the recorder.\n`);
    process.exitCode = code === 0 ? 0 : code;
  } catch (error) {
    process.stderr.write(`outsider: Codex app-server trace NOT sealed: ${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}

process.stdin.on("data", (chunk) => {
  try { consume("client", chunk, clientMessage); }
  catch (error) { process.stderr.write(`${error?.message ?? error}\n`); child.kill("SIGTERM"); }
});
process.stdin.on("end", () => {
  inputEnded = true;
  /* hooks/list is injected only after initialized. Once its response arrives,
     serverMessage closes the child input. If no initialization occurred, close
     now and finalize red rather than inventing same-connection metadata. */
  if (hooksList || !injectedHooksList) child.stdin.end();
});
child.stdout.on("data", (chunk) => {
  try { consume("server", chunk, serverMessage); }
  catch (error) { process.stderr.write(`${error?.message ?? error}\n`); child.kill("SIGTERM"); }
});
child.stderr.on("data", (chunk) => process.stderr.write(chunk));
child.on("error", (error) => {
  process.stderr.write(`outsider: failed to launch Codex app-server: ${error?.message ?? error}\n`);
  finalize(1);
});
child.on("exit", (code) => finalize(code ?? 1));

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  try { child.kill(signal); } catch { /* already exited */ }
});
