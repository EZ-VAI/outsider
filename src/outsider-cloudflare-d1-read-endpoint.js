/* Task-owned dynamic D1 reader. This is not an independent witness: an external
 * observer can query its public route, while the provider remains Cloudflare.
 * No seed data is embedded. A GET always reads the bound database afresh.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { OUTSIDER_CLOUDFLARE_WORKER_UPLOAD_PROTOCOL as UPLOAD }
  from "./outsider-cloudflare-worker-production-adapter.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce,
  withUserHeldExecutionLockV2 } from "./outsider-user-held-durable-execution-v2.js";
const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const digest = value => hash(canonicalizeStrict(value));
const HASH = /^sha256:[a-f0-9]{64}$/u;
const fail = code => { throw new Error(`OUTSIDER_D1_READ_ENDPOINT_${code}`); };
const read = file => JSON.parse(readPrivateExecutionBytes(file));

export function buildD1ReadEndpointModule({ expectedRecordsHash, expiresAt }) {
  if (!HASH.test(expectedRecordsHash ?? "") || !Number.isFinite(Date.parse(expiresAt))) fail("MODULE_INPUT_INVALID");
  return Buffer.from(`// Outsider task-owned dynamic D1 reader; no embedded records.\n` +
    `const deadline=${JSON.stringify(Date.parse(expiresAt))}, expected=${JSON.stringify(expectedRecordsHash)};\n` +
    `export default { async fetch(request, env) {\n` +
    `const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store, max-age=0","x-content-type-options":"nosniff"};\n` +
    `if(request.method!=="GET"||new URL(request.url).pathname!=="/")return new Response("{}",{status:405,headers});\n` +
    `if(Date.now()>=deadline)return new Response("{}",{status:410,headers});\n` +
    `try {const result=await env.OUTSIDER_DB.prepare("SELECT id, value FROM outsider_records ORDER BY id").all();\n` +
    `if(result.success!==true||!Array.isArray(result.results)||result.results.length!==3)return new Response("{}",{status:409,headers});\n` +
    `const rows=result.results.map(r=>({id:r.id,value:r.value}));\n` +
    `if(rows.some(r=>typeof r.id!=="string"||typeof r.value!=="string")||new Set(rows.map(r=>r.id)).size!==3)return new Response("{}",{status:409,headers});\n` +
    `rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);const body=JSON.stringify(rows);\n` +
    `const actual="sha256:"+Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body))),b=>b.toString(16).padStart(2,"0")).join("");\n` +
    `if(actual!==expected)return new Response("{}",{status:409,headers});\n` +
    `return new Response(body,{status:200,headers});}catch{return new Response("{}",{status:503,headers});}}};\n`);
}

export function createCloudflareD1ReadEndpoint(config) {
  if (!path.isAbsolute(config?.directory ?? "") || !/^[a-f0-9]{32}$/u.test(config.accountId ?? "")
    || !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(config.workersDevSubdomain ?? "")
    || !/^[A-Za-z0-9._-]{1,128}$/u.test(config.namespace ?? "")
    || typeof config.getApiToken !== "function" || config.syntheticData !== true
    || !path.isAbsolute(config.databaseCreateReceiptFile ?? "")) fail("CONFIG_INVALID");
  const source = read(config.databaseCreateReceiptFile);
  const database = JSON.parse(Buffer.from(source.bodyBase64 ?? "", "base64").toString("utf8"));
  if (source.method !== "POST" || source.path !== `/client/v4/accounts/${config.accountId}/d1/database`
    || source.status < 200 || source.status >= 300 || database.success !== true
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(database.result?.uuid ?? "")) fail("ORIGINAL_DATABASE_CREATE_RECEIPT_REQUIRED");
  const moduleBytes = buildD1ReadEndpointModule(config);
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const clock = config.clock ?? (() => new Date().toISOString());
  const sourceKind = config.fetchImpl ? "PROVIDER_FIXTURE" : "CLOUDFLARE_WORKERS_D1_API";
  const binding = { accountId: config.accountId, namespace: config.namespace,
    databaseId: database.result.uuid, databaseCreateReceiptHash: hash(readPrivateExecutionBytes(config.databaseCreateReceiptFile)),
    expectedRecordsHash: config.expectedRecordsHash, expiresAt: new Date(config.expiresAt).toISOString(),
    moduleHash: hash(moduleBytes), sourceKind };
  const key = digest(binding); const scriptName = `outsider-d1-read-${key.slice(7, 39)}`;
  const routeUrl = `https://${scriptName}.${config.workersDevSubdomain}.workers.dev/`;
  const scriptPath = `/client/v4/accounts/${config.accountId}/workers/scripts/${scriptName}`;
  mkdirSync(config.directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(config.directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) fail("PRIVATE_DIRECTORY_REQUIRED");
  const file = name => path.join(config.directory, `${name}.json`);
  writePrivateExecutionRecordOnce(file("binding"), { ...binding, scriptName, routeUrl });
  function live() { if (Date.parse(clock()) >= Date.parse(binding.expiresAt)) fail("DEPLOY_SCOPE_EXPIRED"); }
  async function exchange(method, pathname, body, authenticated = true) {
    const headers = { accept: authenticated ? "application/json" : "application/json", "cache-control": "no-cache" };
    if (authenticated) {
      const token = await config.getApiToken();
      if (typeof token !== "string" || !/^[\x21-\x7e]{1,4096}$/u.test(token)) fail("TOKEN_INVALID");
      headers.authorization = `Bearer ${token}`;
    }
    if (body && !(body instanceof FormData)) headers["content-type"] = "application/json";
    const response = await fetchImpl(authenticated ? `https://api.cloudflare.com${pathname}` : routeUrl,
      { method, headers, ...(body ? { body } : {}), redirect: "error", signal: AbortSignal.timeout(15000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 1024 * 1024) fail("RESPONSE_TOO_LARGE");
    const receipt = { method, path: pathname, observedAt: clock(), status: response.status,
      sourceKind, bodyBase64: bytes.toString("base64") };
    const receiptFile = file(`source-${randomBytes(12).toString("hex")}`);
    writePrivateExecutionRecordOnce(receiptFile, receipt);
    let json; try { json = JSON.parse(bytes.toString("utf8")); } catch { /* Worker module */ }
    return { status: response.status, bytes, json, providerReceipt: hash(readPrivateExecutionBytes(receiptFile)) };
  }
  const accepted = result => result.status >= 200 && result.status < 300 && result.json?.success === true;
  async function settings() {
    const result = await exchange("GET", `${scriptPath}/settings`);
    const bindings = result.json?.result?.bindings;
    if (!accepted(result) || !Array.isArray(bindings) || bindings.length !== 1
      || bindings[0].type !== "d1" || bindings[0].name !== "OUTSIDER_DB"
      || bindings[0].id !== binding.databaseId) fail("CURRENT_DATABASE_BINDING_CHANGED");
    return result;
  }
  async function owned() {
    if (!existsSync(file("uploaded"))) fail("UPLOAD_OWNERSHIP_RECEIPT_REQUIRED");
    const result = await exchange("GET", scriptPath);
    if (result.status === 404) return { absent: true, providerReceipt: result.providerReceipt };
    if (result.status !== 200 || !result.bytes.includes(moduleBytes)) fail("CURRENT_WORKER_MODULE_CHANGED");
    const configured = await settings();
    return { absent: false, providerReceipt: result.providerReceipt, bindingReceipt: configured.providerReceipt };
  }
  return Object.freeze({ scriptName, routeUrl, expectedBodyHash: config.expectedRecordsHash,
    async deploy() {
      return withUserHeldExecutionLockV2(key, async () => {
        live();
        if (existsSync(file("released"))) fail("ALREADY_RELEASED");
        if (!existsSync(file("uploaded"))) {
          if (existsSync(file("upload-started"))) fail("UPLOAD_UNKNOWN_NO_AUTOMATIC_RETRY");
          const before = await exchange("GET", scriptPath);
          if (before.status !== 404) fail("NAMESPACE_NOT_PROVEN_UNUSED");
          const body = new FormData();
          body.set(UPLOAD.metadataPartName, JSON.stringify({ main_module: UPLOAD.mainModuleMetadataValue,
            compatibility_date: "2025-08-01", bindings: [{ type: "d1", name: "OUTSIDER_DB", id: binding.databaseId }] }));
          body.set(UPLOAD.mainModulePartName, new Blob([moduleBytes], { type: UPLOAD.mainModuleContentType }), UPLOAD.mainModuleFilename);
          writePrivateExecutionRecordOnce(file("upload-started"), { bindingHash: key, startedAt: clock() });
          const uploaded = await exchange("PUT", scriptPath, body);
          if (!accepted(uploaded)) fail("UPLOAD_NOT_CONFIRMED");
          writePrivateExecutionRecordOnce(file("uploaded"), { providerReceipt: uploaded.providerReceipt });
        }
        if (!existsSync(file("activated"))) {
          if ((await owned()).absent) fail("OWNED_WORKER_ABSENT");
          const activated = await exchange("POST", `${scriptPath}/subdomain`, JSON.stringify({ enabled: true, previews_enabled: false }));
          if (!accepted(activated) || activated.json.result?.enabled !== true) fail("ACTIVATION_NOT_CONFIRMED");
          writePrivateExecutionRecordOnce(file("activated"), { providerReceipt: activated.providerReceipt });
        }
        return { status: "DEPLOYED", routeUrl, expectedBodyHash: binding.expectedRecordsHash,
          sourceKind, providerObservationIndependent: false, dynamicDatabaseRead: true };
      });
    },
    async read() {
      const result = await exchange("GET", "/", null, false);
      return { status: result.status === 200 && hash(result.bytes) === binding.expectedRecordsHash ? "SATISFIED" : "NOT_SATISFIED",
        httpStatus: result.status, bodyHash: hash(result.bytes), expectedBodyHash: binding.expectedRecordsHash,
        providerReceipt: result.providerReceipt, routeUrl, sourceKind, providerObservationIndependent: false };
    },
    async release() {
      return withUserHeldExecutionLockV2(key, async () => {
        if (existsSync(file("released"))) return read(file("released"));
        const current = await owned();
        if (!current.absent) {
          const deleted = await exchange("DELETE", scriptPath);
          if (!accepted(deleted) && deleted.status !== 404) return { status: "OPEN", providerReceipt: deleted.providerReceipt };
        }
        const after = await exchange("GET", scriptPath);
        if (after.status !== 404) return { status: "OPEN", providerReceipt: after.providerReceipt };
        const result = { status: "RELEASED", providerReceipt: after.providerReceipt,
          scriptName, sourceKind, databaseDeleted: false };
        writePrivateExecutionRecordOnce(file("released"), result); return result;
      });
    },
  });
}
