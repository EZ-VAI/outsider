/* A provisioned, task-owned read service over actual external databases.
 * No expected records are embedded in the module. Secrets are Worker bindings,
 * not source literals, public receipts or independent-observer arguments. */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce }
  from "./outsider-user-held-durable-execution-v2.js";
import { publicDatasetHash as digest } from "./outsider-public-dataset.js";

const hash = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const read = file => JSON.parse(readPrivateExecutionBytes(file));
export function buildDatasetReadServiceModule({ recordsHash, recordCount, expiresAt }) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(recordsHash ?? "") || !Number.isSafeInteger(recordCount)
    || recordCount < 1 || recordCount > 100 || !Number.isFinite(Date.parse(expiresAt))) throw new Error("DATASET_SERVICE_INPUT_INVALID");
  return Buffer.from(`const expected=${JSON.stringify(recordsHash)},count=${recordCount},deadline=${Date.parse(expiresAt)};
const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
async function checked(rows){if(!Array.isArray(rows)||rows.length!==count)return null;
const values=rows.map(r=>({id:r.id,value:r.value})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
const body=JSON.stringify(values);const h="sha256:"+Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body))),b=>b.toString(16).padStart(2,"0")).join("");return h===expected?body:null;}
export default{async fetch(request,env){if(request.method!=="GET"||new URL(request.url).pathname!=="/")return new Response("{}",{status:405,headers});
if(Date.now()>=deadline)return new Response("{}",{status:410,headers});let body=null;
try{const r=await env.OUTSIDER_DB.prepare("SELECT id,value FROM outsider_records ORDER BY id").all();if(r.success)body=await checked(r.results);}catch{}
if(!body)try{const u=new URL(env.OUTSIDER_NEON_URL);const r=await fetch("https://"+u.hostname.replace(/-pooler(?=\\.)/,"")+"/sql",{method:"POST",headers:{"content-type":"application/json","Neon-Connection-String":env.OUTSIDER_NEON_URL,"Neon-Raw-Text-Output":"true","Neon-Array-Mode":"true"},body:JSON.stringify({query:"SELECT id,value FROM outsider_records ORDER BY id",params:[]}),redirect:"error",signal:AbortSignal.timeout(10000)});const j=await r.json();if(r.ok)body=await checked(j.rows?.map(([id,value])=>({id,value})));}catch{}
return new Response(body??"{}",{status:body?200:503,headers});}};
`);
}

export function createDatasetReadService(config) {
  const { directory, accountId, workersDevSubdomain, databaseId, namespace, recordsHash,
    recordCount, expiresAt, getApiToken, getNeonConnection } = config;
  if (!path.isAbsolute(directory ?? "") || !/^[a-f0-9]{32}$/u.test(accountId ?? "")
    || !/^[a-z0-9-]{1,63}$/u.test(workersDevSubdomain ?? "")
    || !/^[a-f0-9-]{36}$/u.test(databaseId ?? "") || typeof getApiToken !== "function"
    || config.neonFallback !== false && typeof getNeonConnection !== "function") throw new Error("DATASET_SERVICE_CONFIG_INVALID");
  const module = buildDatasetReadServiceModule(config);
  const key = digest({ namespace, databaseId, recordsHash, expiresAt, moduleHash: hash(module) });
  const scriptName = `outsider-data-${key.slice(7, 39)}`;
  const routeUrl = `https://${scriptName}.${workersDevSubdomain}.workers.dev/`;
  const base = `/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`);
  writeOnce(file("binding"), { key, scriptName, routeUrl, databaseId, recordsHash, recordCount, expiresAt });
  async function exchange(method, pathname, body) {
    const response = await (config.fetchImpl ?? fetch)(`https://api.cloudflare.com${pathname}`, {
      method, headers: { authorization: `Bearer ${await getApiToken()}`,
        ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}) },
      ...(body ? { body } : {}), redirect: "error", signal: AbortSignal.timeout(20000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    writeOnce(file(`source-${randomUUID()}`), { sourceKind: "CLOUDFLARE_API", method, path: pathname,
      observedAt: new Date().toISOString(), status: response.status, bodyBase64: bytes.toString("base64") });
    let json; try { json = JSON.parse(bytes); } catch {}
    return { status: response.status, bytes, json, providerReceipt: hash(bytes) };
  }
  const accepted = value => value.status >= 200 && value.status < 300 && value.json?.success === true;
  return {
    routeUrl, scriptName,
    async reserve() {
      if (existsSync(file("released"))) throw new Error("DATASET_SERVICE_RELEASED");
      if (!existsSync(file("uploaded"))) {
        const before = await exchange("GET", base);
        if (existsSync(file("upload-attempt"))) {
          // Exact task-specific source reconciles an uncertain upload; no overwrite.
          if (before.status !== 200 || !before.bytes.includes(module)) throw new Error("DATASET_UPLOAD_UNKNOWN");
          writeOnce(file("uploaded"), { providerReceipt: before.providerReceipt, reconciled: true });
        } else {
          if (before.status !== 404) throw new Error("DATASET_NAMESPACE_OCCUPIED");
          const connection = config.neonFallback === false ? null : await getNeonConnection();
          const form = new FormData();
          form.set("metadata", JSON.stringify({ main_module: "worker.mjs", compatibility_date: "2025-08-01",
            bindings: [{ type: "d1", name: "OUTSIDER_DB", id: databaseId },
              ...(connection ? [{ type: "secret_text", name: "OUTSIDER_NEON_URL", text: connection.connectionString }] : [])] }));
          form.set("worker.mjs", new Blob([module], { type: "application/javascript+module" }), "worker.mjs");
          writeOnce(file("upload-attempt"), { key, attemptedAt: new Date().toISOString() });
          const uploaded = await exchange("PUT", base, form);
          if (!accepted(uploaded)) throw new Error("DATASET_UPLOAD_NOT_ACCEPTED");
          writeOnce(file("uploaded"), { providerReceipt: uploaded.providerReceipt });
        }
      }
      if (!existsSync(file("activated"))) {
        const result = await exchange("POST", `${base}/subdomain`, JSON.stringify({ enabled: true, previews_enabled: false }));
        if (!accepted(result) || result.json.result?.enabled !== true) throw new Error("DATASET_ROUTE_NOT_ACTIVE");
        writeOnce(file("activated"), { providerReceipt: result.providerReceipt });
      }
      return { status: "RESERVED", reservationId: `worker:${scriptName}`, validUntil: expiresAt,
        providerReceipt: read(file("activated")).providerReceipt,
        adapterState: { routeUrl, allocationBasis: "PROVISIONED_WORKER_NOT_SLA" } };
    },
    async release() {
      if (existsSync(file("released"))) return read(file("released"));
      if (!existsSync(file("uploaded"))) return { status: "CLOSED", receipt: { remoteUploadConfirmed: false } };
      const before = await exchange("GET", base);
      if (before.status !== 404) {
        if (before.status !== 200 || !before.bytes.includes(module)) throw new Error("DATASET_OWNERSHIP_CHANGED");
        const deleted = await exchange("DELETE", base);
        if (!accepted(deleted) && deleted.status !== 404) throw new Error("DATASET_DELETE_NOT_ACCEPTED");
      }
      const result = { status: "RELEASED", receipt: { scriptName, removed: true } };
      writeOnce(file("released"), result); return result;
    },
  };
}
