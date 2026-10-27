/* One-use loopback intake for an owner-controlled Seats.io test resource.
 * Secret values remain in 0600 files and the server closes after one capture.
 * No provider I/O, hold, booking, ticket sale, invitation or payment occurs.
 */
import { createHash, randomBytes as systemRandomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { readPrivateExecutionBytes } from "./outsider-user-held-durable-execution-v2.js";

const MAX_BODY_BYTES = 20 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$/u;
const fail = code => { const error = new Error(`OUTSIDER_CAPACITY_ONBOARDING_${code}`);
  error.code = code; throw error; };
const digest = value => `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
function directory(value) {
  mkdirSync(value, { recursive: true, mode: 0o700 });
  const stat = lstatSync(value);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) fail("PRIVATE_DIRECTORY_REQUIRED");
}
function writeOnce(file, value) {
  const bytes = Buffer.from(canonicalizeStrict(value));
  const descriptor = openSync(file, "wx", 0o600);
  try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  const parent = openSync(path.dirname(file), "r");
  try { fsyncSync(parent); } finally { closeSync(parent); }
  return { bytes: bytes.length,
    hash: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
}
function read(file) {
  try { return JSON.parse(readPrivateExecutionBytes(file)); }
  catch { fail("AUTHORIZATION_SOURCE_REQUIRED"); }
}
function page(pathname) {
  return Buffer.from(`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer">
<title>Outsider · owner capacity onboarding</title>
<style>body{font:16px system-ui;max-width:720px;margin:48px auto;padding:0 20px;color:#171717}label{display:block;margin:18px 0 6px}input,select{width:100%;box-sizing:border-box;padding:10px}.checks label{margin:12px 0}.checks input{width:auto}button{margin-top:22px;padding:11px 18px}small{color:#555}</style>
<h1>Owner-controlled Seats.io test capacity</h1>
<p>Paste one test workspace resource. Values go only to <code>127.0.0.1</code> and private 0600 files. This page does not contact Seats.io or reserve anything.</p>
<form method="post" action="${pathname}" autocomplete="off">
<label>Workspace secret key</label><input name="secret" type="password" required maxlength="4096">
<label>Region</label><select name="region"><option value="na">North America</option><option value="eu">Europe</option><option value="sa">South America</option><option value="oc">Oceania</option></select>
<label>Test event key</label><input name="eventKey" required maxlength="128" spellcheck="false">
<label>Known test seat label</label><input name="objectLabel" required maxlength="128" spellcheck="false">
<div class="checks">
<label><input type="checkbox" name="owner" value="yes" required> I control this test workspace/event and authorize read, one temporary hold, exact read/reconciliation and release.</label>
<label><input type="checkbox" name="testOnly" value="yes" required> This is test inventory only; no booking, ticket sale, attendee or real-world service promise.</label>
<label><input type="checkbox" name="noPayment" value="yes" required> No payment or paid upgrade is authorized.</label>
</div><button type="submit">Store private capacity profile</button>
<p><small>Existing files are never overwritten. Changed resources require a versioned directory.</small></p></form>`, "utf8");
}

export async function startNativeCapacityOnboarding(options = {}, dependencies = {}) {
  const { directory: root, authorizationSourceFile, expiresAt } = options;
  if (![root, authorizationSourceFile].every(value => typeof value === "string" && path.isAbsolute(value))) fail("ABSOLUTE_PATHS_REQUIRED");
  if (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt))
    || new Date(expiresAt).toISOString() !== expiresAt) fail("EXPIRY_INVALID");
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) fail("PORT_INVALID");
  directory(root);
  const files = ["credentials.json", "profile.json", "capture-receipt.json"];
  if (files.some(name => existsSync(path.join(root, name)))) fail("VERSIONED_OUTPUT_REQUIRED");
  const source = read(authorizationSourceFile);
  if (source.schema !== "outsider/native-capacity-onboarding-authorization/v1"
    || source.provider !== "SEATSIO" || source.scope !== "OWNER_CONTROLLED_TEST_RESOURCE"
    || source.approved !== true || source.paymentAuthorized !== false
    || !HASH.test(source.sourceRefHash ?? "")) fail("AUTHORIZATION_SOURCE_INVALID");
  const entropy = (dependencies.randomBytes ?? systemRandomBytes)(24);
  if (!Buffer.isBuffer(entropy) || entropy.length !== 24) fail("ENTROPY_INVALID");
  const pathname = `/capacity/${entropy.toString("hex")}`; entropy.fill(0);
  let resolveCapture; const captured = new Promise(resolve => { resolveCapture = resolve; });
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    const finish = (status, body, type = "text/plain; charset=utf-8") => {
      response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
        Connection: "close" }); response.end(body);
    };
    if (request.url !== pathname) return finish(404, "Not found");
    if (request.method === "GET") return finish(200, page(pathname), "text/html; charset=utf-8");
    if (request.method !== "POST" || request.headers["content-type"]?.split(";", 1)[0] !== "application/x-www-form-urlencoded") return finish(405, "Unsupported request");
    let size = 0, rejected = false; const chunks = [];
    request.on("data", chunk => { size += chunk.length;
      if (size > MAX_BODY_BYTES) { rejected = true; request.destroy(); } else chunks.push(chunk); });
    request.on("end", () => {
      if (rejected) return;
      try {
        const values = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
        const secret = values.get("secret"), region = values.get("region");
        const eventKey = values.get("eventKey")?.trim(), objectLabel = values.get("objectLabel")?.trim();
        if (typeof secret !== "string" || !secret || secret.length > 4096 || /[:\r\n]/u.test(secret)
          || !["na", "eu", "sa", "oc"].includes(region) || !ID.test(eventKey ?? "")
          || !ID.test(objectLabel ?? "") || values.get("owner") !== "yes"
          || values.get("testOnly") !== "yes" || values.get("noPayment") !== "yes") {
          return finish(400, "Invalid or incomplete test-resource attestation");
        }
        const credentialFile = path.join(root, "credentials.json");
        const profileFile = path.join(root, "profile.json");
        const resourceId = "seatsio-owner-test-primary";
        const scopeRefHash = digest({ sourceRefHash: source.sourceRefHash, provider: "SEATSIO",
          scope: "OWNER_CONTROLLED_TEST_RESOURCE", region, eventKey, objectLabel, expiresAt });
        const permissionGrantHash = digest({ scopeRefHash,
          operations: ["DISCOVER", "TEMPORARY_HOLD", "EXACT_READ", "RECONCILE", "RELEASE"],
          paymentAuthorized: false });
        const credentialsPin = writeOnce(credentialFile, {
          schema: "outsider/native-capacity-credentials/v1", seatsioWorkspaceSecretKey: secret });
        const profilePin = writeOnce(profileFile, { schema: "outsider/native-capacity-profile/v1",
          resources: [{ resourceId, provider: "SEATSIO", permissionGrantHash,
            scope: { ownerControlledTestResource: true, sourceRefHash: scopeRefHash, expiresAt },
            credentialFile: "credentials.json", settings: { region, eventKey, objectLabel,
              sandboxWorkspace: { declaredSandbox: true,
                workspaceRefHash: digest({ scopeRefHash, kind: "OWNER_WORKSPACE" }),
                testScopeRefHash: digest({ scopeRefHash, kind: "TEST_RESOURCE_ONLY" }) } } }] });
        const receipt = { schema: "outsider/native-capacity-onboarding-receipt/v1",
          provider: "SEATSIO", resourceId, capturedAt: (dependencies.clock ?? (() => new Date().toISOString()))(),
          sourceRefHash: source.sourceRefHash, scopeRefHash, permissionGrantHash,
          expiresAt, files: { credentials: credentialsPin, profile: profilePin },
          secretProjected: false, providerIoPerformed: false, capacityReserved: false,
          bookingPerformed: false, paymentAuthorized: false };
        const receiptPin = writeOnce(path.join(root, "capture-receipt.json"), receipt);
        finish(201, "<!doctype html><meta charset=utf-8><h1>Private capacity profile stored</h1><p>Return to Outsider. No hold or payment was performed.</p>", "text/html; charset=utf-8");
        resolveCapture({ status: "CAPTURED", profileFile, resourceId, receipt: receiptPin,
          secretProjected: false, providerIoPerformed: false, paymentAuthorized: false });
        server.close();
      } catch { finish(409, "Capture failed; existing files were not overwritten"); }
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  const address = server.address();
  return Object.freeze({ origin: `http://127.0.0.1:${address.port}`, pathname, captured,
    close: () => new Promise(resolve => server.close(resolve)) });
}
