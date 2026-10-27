/* One-use loopback intake for PayPal Sandbox app credentials and a sandbox
 * recipient. Secrets arrive only from the local browser, are written 0600,
 * never logged, and the server closes after one successful capture.
 */
import { createHash, randomBytes as systemRandomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { readPrivateExecutionBytes } from "./outsider-user-held-durable-execution-v2.js";

const MAX_BODY_BYTES = 16 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const fail = code => { const error = new Error(`OUTSIDER_PAYPAL_ONBOARDING_${code}`); error.code = code; throw error; };
const digest = value => `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) fail("PRIVATE_DIRECTORY_REQUIRED");
}
function writeOnce(file, value) {
  const bytes = Buffer.from(canonicalizeStrict(value));
  const fd = openSync(file, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  const parent = openSync(path.dirname(file), "r");
  try { fsyncSync(parent); } finally { closeSync(parent); }
  return { bytes: bytes.length, hash: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
}
function privateJson(file, kind) {
  try { return JSON.parse(readPrivateExecutionBytes(file)); } catch { fail(`${kind}_PRIVATE_JSON_REQUIRED`); }
}
function html(pathname) {
  return Buffer.from(`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer">
<title>Outsider · PayPal Sandbox onboarding</title>
<style>body{font:16px system-ui;max-width:720px;margin:48px auto;padding:0 20px;color:#171717}label{display:block;margin:18px 0 6px}input[type=text],input[type=password],input[type=email]{width:100%;box-sizing:border-box;padding:10px}button{margin-top:22px;padding:11px 18px}small{color:#555}.checks label{margin:12px 0}</style>
<h1>PayPal Sandbox one-time onboarding</h1>
<p>Paste values from PayPal Developer <strong>Sandbox</strong>. They are sent only to <code>127.0.0.1</code>, stored as private 0600 files, and never printed. This page does not submit a payout.</p>
<form method="post" action="${pathname}" autocomplete="off">
<label>Sandbox Client ID</label><input name="clientId" type="text" required maxlength="4096" spellcheck="false">
<label>Sandbox Secret</label><input name="clientSecret" type="password" required maxlength="4096">
<label>Sandbox personal test-account email</label><input name="recipientEmail" type="email" required maxlength="254" spellcheck="false">
<div class="checks">
<label><input type="checkbox" name="sandboxOnly" value="yes" required> These are Sandbox credentials, not Live credentials.</label>
<label><input type="checkbox" name="recipientConfirmed" value="yes" required> The email belongs to a PayPal Sandbox personal test account.</label>
<label><input type="checkbox" name="payoutTestOnly" value="yes" required> Authorize this bound controlled-failure rehearsal for Payouts test only; no real money.</label>
</div><button type="submit">Store private Sandbox configuration</button>
<p><small>Existing files are never overwritten. A changed account requires a new versioned directory.</small></p></form>`, "utf8");
}
function validCredential(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 4096
    && /^[\x21-\x7e]+$/u.test(value) && !value.includes(":");
}

export async function startPayPalSandboxOnboarding(options = {}, dependencies = {}) {
  const { directory, resultFile, authorizationSourceFile } = options;
  if (![directory, resultFile, authorizationSourceFile].every(value => typeof value === "string" && path.isAbsolute(value)))
    fail("ABSOLUTE_PATHS_REQUIRED");
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) fail("PORT_INVALID");
  ensurePrivateDirectory(directory);
  const names = ["credentials.json", "recipient.json", "authorization.json", "config.json", "capture-receipt.json"];
  if (names.some(name => existsSync(path.join(directory, name)))) fail("VERSIONED_OUTPUT_REQUIRED");
  const result = privateJson(resultFile, "RESULT");
  const transfer = result.failureRehearsal?.sandboxTransfer;
  if (result.schema !== "outsider/private-digital-goal-mvp-result/v1"
    || result.delivery?.program?.state !== "SUCCEEDED"
    || result.failureRehearsal?.rehearsal?.kind !== "CONTROLLED_FAILURE_REHEARSAL"
    || result.failureRehearsal?.decision !== "SANDBOX_COMPENSATION_CALCULATED"
    || !HASH.test(transfer?.idempotencyKey ?? "") || transfer?.amount?.currency !== "USD")
    fail("BOUND_REHEARSAL_REQUIRED");
  const source = privateJson(authorizationSourceFile, "AUTHORIZATION_SOURCE");
  if (source.schema !== "outsider/paypal-sandbox-onboarding-authorization/v1"
    || source.environment !== "SANDBOX" || source.scope !== "PAYOUTS_TEST_ONLY"
    || source.approved !== true || source.realMoneyAuthorized !== false || !HASH.test(source.sourceRefHash ?? ""))
    fail("EXPLICIT_SANDBOX_AUTHORIZATION_REQUIRED");
  const entropy = (dependencies.randomBytes ?? systemRandomBytes)(24);
  if (!Buffer.isBuffer(entropy) || entropy.length !== 24) fail("ENTROPY_INVALID");
  const pathname = `/onboard/${entropy.toString("hex")}`;
  entropy.fill(0);
  let resolveCapture;
  const captured = new Promise(resolve => { resolveCapture = resolve; });
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    const finish = (status, body, type = "text/plain; charset=utf-8") => {
      response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
        Connection: "close", "X-Content-Type-Options": "nosniff" }); response.end(body);
    };
    if (request.url !== pathname) return finish(404, "Not found");
    if (request.method === "GET") return finish(200, html(pathname), "text/html; charset=utf-8");
    if (request.method !== "POST" || request.headers["content-type"]?.split(";", 1)[0] !== "application/x-www-form-urlencoded")
      return finish(405, "Unsupported request");
    const chunks = []; let size = 0; let rejected = false;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { rejected = true; request.destroy(); }
      else chunks.push(chunk);
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        const values = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
        const clientId = values.get("clientId"), clientSecret = values.get("clientSecret");
        const receiver = values.get("recipientEmail")?.trim().toLowerCase();
        if (!validCredential(clientId) || !validCredential(clientSecret)
          || typeof receiver !== "string" || receiver.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(receiver)
          || values.get("sandboxOnly") !== "yes" || values.get("recipientConfirmed") !== "yes"
          || values.get("payoutTestOnly") !== "yes") return finish(400, "Invalid or incomplete Sandbox attestation");
        const testAccountRefHash = digest({ environment: "SANDBOX", receiver,
          attestation: "USER_CONFIRMED_PAYPAL_SANDBOX_PERSONAL_ACCOUNT", authorizationSourceRefHash: source.sourceRefHash });
        const credentialsFile = path.join(directory, "credentials.json");
        const testRecipientFile = path.join(directory, "recipient.json");
        const authorizationFile = path.join(directory, "authorization.json");
        const configFile = path.join(directory, "config.json");
        const credentialsPin = writeOnce(credentialsFile, { environment: "SANDBOX", clientId, clientSecret });
        const recipientPin = writeOnce(testRecipientFile, { environment: "SANDBOX", testRecipient: {
          recipientType: "EMAIL", receiver, isSandboxAccount: true, testAccountRefHash } });
        const acceptanceRefHash = digest({ environment: "SANDBOX", scope: "PAYOUTS_TEST_ONLY",
          transferIdempotencyKey: transfer.idempotencyKey, testAccountRefHash, amount: transfer.amount,
          authorizationSourceRefHash: source.sourceRefHash, acceptedThrough: "LOCAL_ONE_USE_FORM" });
        const authorizationPin = writeOnce(authorizationFile, { transferIdempotencyKey: transfer.idempotencyKey,
          testAccountRefHash, amount: transfer.amount, sandboxAcceptance: { environment: "SANDBOX",
            scope: "PAYOUTS_TEST_ONLY", accepted: true, acceptanceRefHash } });
        const configPin = writeOnce(configFile, { directory: path.join(directory, "operations"), credentialsFile,
          testRecipientFile, resultFile, authorizationFile });
        const receipt = { schema: "outsider/paypal-sandbox-onboarding-receipt/v1", environment: "SANDBOX",
          capturedAt: (dependencies.clock ?? (() => new Date().toISOString()))(),
          sourceRefHash: source.sourceRefHash, testAccountRefHash, acceptanceRefHash,
          files: { credentials: credentialsPin, recipient: recipientPin, authorization: authorizationPin, config: configPin },
          secretProjected: false, recipientProjected: false, realMoneyAuthorized: false, payoutSubmitted: false };
        const receiptPin = writeOnce(path.join(directory, "capture-receipt.json"), receipt);
        finish(201, Buffer.from("<!doctype html><meta charset=utf-8><h1>Sandbox configuration stored</h1><p>You can return to Outsider. No payout was submitted.</p>", "utf8"), "text/html; charset=utf-8");
        resolveCapture({ status: "CAPTURED", configFile, receipt: receiptPin, secretProjected: false,
          recipientProjected: false, payoutSubmitted: false, realMoneyAuthorized: false });
        server.close();
      } catch { finish(409, "Capture failed; existing files were not overwritten"); }
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const address = server.address();
  return Object.freeze({ origin: `http://127.0.0.1:${address.port}`, pathname, captured,
    close: () => new Promise(resolve => server.close(resolve)) });
}
