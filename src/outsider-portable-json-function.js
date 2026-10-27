/* One JSON contract, explicit JavaScript and PostgreSQL implementations.
 * This is not a general Node/HTTP server or a claim of arbitrary JS portability.
 * Source and inputs are explicitly PUBLIC; no local execution of caller code. */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { createNeonClaimableResource } from "./outsider-neon-claimable-resource.js";
import { softwareBytesHash as hash } from "./outsider-github-public-build.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "./outsider-user-held-durable-execution-v2.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));
export const JSON_FUNCTION_CAPABILITY = "PUBLIC_JSON_FUNCTION_SERVICE_V1";
export const JS_FUNCTION_CAPABILITY = "PUBLIC_JSON_FUNCTION_SERVICE_V2";
export function normalizePublicJsFunction(input) {
  if (!input || Object.keys(input).sort().join(",") !== "checks,functionBody,visibility")
    throw new Error("PUBLIC_JS_FUNCTION_INPUT_INVALID");
  const { postgresBody, ...packet } = normalizePublicJsonFunction({ ...input, postgresBody: "NULL::jsonb" });
  return packet;
}
export function javascriptFunctionSoftware(input) {
  const packet = normalizePublicJsFunction(input);
  const functionHash = hash(Buffer.from(canonicalizeStrict({ javascript: packet.functionBody })));
  const metadata = { capability: JS_FUNCTION_CAPABILITY, functionHash, inputMode: "PUBLIC_JSON", synchronous: true };
  const source = `const evaluate=function(input){\n${packet.functionBody}\n};\nconst respond=(value,status=200)=>new Response(JSON.stringify(value).replace(/[^\\x00-\\x7f]/g,c=>"\\\\u"+c.charCodeAt(0).toString(16).padStart(4,"0")),{status,headers:{"content-type":"application/json; charset=utf-8"}});\nexport default{async fetch(request){const u=new URL(request.url);if(u.pathname==="/")return respond(${JSON.stringify(metadata)});if(u.pathname!=="/evaluate")return respond({error:"NOT_FOUND"},404);try{const input=request.method==="GET"?JSON.parse(u.searchParams.get("input")):await request.json();const result=evaluate(input);if(result&&typeof result.then==="function")throw Error("SYNC_JSON_REQUIRED");return respond(result)}catch{return respond({error:"FUNCTION_INPUT_OR_EXECUTION_FAILED"},400)}}};\n`;
  return { packet, functionHash, metadata, recoveryProvider: "deno", software: { visibility: "PUBLIC",
    files: { "function.mjs": source }, entry: "function.mjs",
    checks: [{ method: "GET", path: "/", body: null, expectedStatus: 200, expectedBody: JSON.stringify(metadata) },
      ...packet.checks.map(row => ({ method: "POST", path: "/evaluate", body: JSON.stringify(row.input), expectedStatus: 200, expectedBody: JSON.stringify(row.expected) }))] } };
}
export function normalizePublicJsonFunction(input) {
  if (!input || Object.keys(input).sort().join(",") !== "checks,functionBody,postgresBody,visibility" || input.visibility !== "PUBLIC"
    || typeof input.functionBody !== "string" || !input.functionBody.trim() || Buffer.byteLength(input.functionBody) > 16000
    || typeof input.postgresBody !== "string" || !input.postgresBody.trim() || Buffer.byteLength(input.postgresBody) > 16000
    || !Array.isArray(input.checks) || input.checks.length < 2 || input.checks.length > 6
    || input.checks.some(row => !row || Object.keys(row).sort().join(",") !== "expected,input"))
    throw new Error("PUBLIC_JSON_FUNCTION_INPUT_INVALID");
  const packet = JSON.parse(canonicalizeStrict(input));
  if (Buffer.byteLength(JSON.stringify(packet)) > 24000
    || packet.checks.some(row => Buffer.byteLength(JSON.stringify(row.input)) > 3000
      || Buffer.byteLength(JSON.stringify(row.expected)) > 6000)) throw new Error("PUBLIC_JSON_FUNCTION_TOO_LARGE");
  return packet;
}
export function jsonFunctionSoftware(input) {
  const packet = normalizePublicJsonFunction(input), functionHash = hash(Buffer.from(canonicalizeStrict({ javascript: packet.functionBody, postgres: packet.postgresBody })));
  const metadata = { capability: JSON_FUNCTION_CAPABILITY, functionHash, inputMode: "PUBLIC_JSON", synchronous: true };
  const source = `const evaluate=function(input){\n${packet.functionBody}\n};\nexport default{async fetch(request){const u=new URL(request.url);if(u.pathname==="/")return Response.json(${JSON.stringify(metadata)});if(u.pathname!=="/evaluate")return Response.json({error:"NOT_FOUND"},{status:404});try{const input=request.method==="GET"?JSON.parse(u.searchParams.get("input")):await request.json();const result=evaluate(input);if(result&&typeof result.then==="function")throw Error("SYNC_JSON_REQUIRED");return Response.json(result)}catch{return Response.json({error:"FUNCTION_INPUT_OR_EXECUTION_FAILED"},{status:400})}}};\n`;
  return { packet, functionHash, metadata, software: { visibility: "PUBLIC", files: { "function.mjs": source,
    "postgres-source.mjs": `export default ${JSON.stringify(packet.postgresBody)};\n` }, entry: "function.mjs",
    checks: [{ method: "GET", path: "/", body: null, expectedStatus: 200, expectedBody: JSON.stringify(metadata) },
      ...packet.checks.map(row => ({ method: "POST", path: "/evaluate", body: JSON.stringify(row.input), expectedStatus: 200, expectedBody: JSON.stringify(row.expected) }))] } };
}

export function createNeonJsonFunctionRuntime({ directory, profile, portableFunction, sourceHash, expiresAt,
  fetchImpl = fetch, clock = () => new Date().toISOString(), createNeon = createNeonClaimableResource }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`), { packet, functionHash, metadata } = portableFunction;
  const neon = createNeon({ directory: path.join(directory, "neon"), permissionGrantHash: profile.permissionGrantHash, dataApi: true,
    ...(fetchImpl === globalThis.fetch ? {} : { fetchImpl }), clock });
  let connection;
  const connected = async () => connection ??= await neon.privateReadConnection();
  async function sql(query, params = []) {
    const c = await connected(), r = await fetchImpl(`https://${c.host.replace(/-pooler(?=\.)/u, "")}/sql`, { method: "POST",
      headers: { "content-type": "application/json", "Neon-Connection-String": c.connectionString,
        "Neon-Array-Mode": "true", "Neon-Raw-Text-Output": "true" }, body: JSON.stringify({ query, params }),
      redirect: "error", signal: AbortSignal.timeout(25000) });
    const bytes = Buffer.from(await r.arrayBuffer());
    writeOnce(file(`sql-${randomUUID()}`), { status: r.status, observedAt: clock(), queryHash: hash(Buffer.from(query)), bodyBase64: bytes.toString("base64") });
    if (!r.ok) throw new Error(`NEON_FUNCTION_SQL_HTTP_${r.status}`);
    return { body: JSON.parse(bytes), receiptHash: hash(bytes) };
  }
  async function call(route, input) {
    const c = await connected();
    const token = await fetchImpl(`${c.authBaseUrl}/token/anonymous`, { redirect: "error", signal: AbortSignal.timeout(20000) });
    const guest = await token.json();
    if (!token.ok || typeof guest.token !== "string") throw new Error("NEON_FUNCTION_GUEST_TOKEN_UNAVAILABLE");
    const r = await fetchImpl(`${c.dataApiUrl.replace(/\/$/u, "")}/rpc/${route}`, { method: input === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${guest.token}`, "content-type": "application/json" },
      ...(input === undefined ? {} : { body: JSON.stringify({ input }) }), redirect: "error", signal: AbortSignal.timeout(20000) });
    const bytes = Buffer.from(await r.arrayBuffer());
    writeOnce(file(`http-${randomUUID()}`), { method: input === undefined ? "GET" : "POST", status: r.status,
      observedAt: clock(), route, bodyBase64: bytes.toString("base64") });
    let body; try { body = JSON.parse(bytes); } catch {}
    return { status: r.status, body, responseHash: hash(bytes) };
  }
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const body = `SELECT (${packet.postgresBody}) WHERE now()<${quote(expiresAt)}::timestamptz`;
  return {
    providerRef: "neon",
    get routeUrl() { return existsSync(file("allocation")) ? read(file("allocation")).adapterState.routeUrl : null; },
    async reserve() {
      if (existsSync(file("allocation"))) return read(file("allocation"));
      const capacity = await neon.reserve();
      if (Date.parse(capacity.validUntil) < Date.parse(expiresAt)) throw new Error("NEON_FUNCTION_LIFETIME_TOO_SHORT");
      // These names exist only in this task-owned new project. Do not replace a
      // foreign function on retry. The invoker has no owner role or SQL secret.
      const prior = await sql("SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('public.outsider_evaluate(jsonb)')");
      if (prior.body.rows.length && prior.body.rows[0][0] !== body) throw new Error("NEON_FUNCTION_NAMESPACE_OCCUPIED");
      if (!prior.body.rows.length) await sql(`CREATE FUNCTION public.outsider_evaluate(input jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET statement_timeout='5s' AS ${quote(body)}`);
      const metaBody = `SELECT ${quote(JSON.stringify(metadata))}::jsonb WHERE now()<${quote(expiresAt)}::timestamptz`;
      const priorMeta = await sql("SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('public.outsider_metadata()')");
      if (priorMeta.body.rows.length && priorMeta.body.rows[0][0] !== metaBody) throw new Error("NEON_FUNCTION_METADATA_OCCUPIED");
      if (!priorMeta.body.rows.length) await sql(`CREATE FUNCTION public.outsider_metadata() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS ${quote(metaBody)}`);
      // Neon currently binds a GET jsonb parameter as a JSON string. Use an
      // explicit text RPC wrapper, then parse JSON once before the same function.
      // This invokes only the already public calculation, never owner privileges.
      const getBody = "SELECT public.outsider_evaluate(input::jsonb)";
      const priorGet = await sql("SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('public.outsider_evaluate_get(text)')");
      if (priorGet.body.rows.length && priorGet.body.rows[0][0] !== getBody) throw new Error("NEON_FUNCTION_GET_WRAPPER_OCCUPIED");
      if (!priorGet.body.rows.length) await sql(`CREATE FUNCTION public.outsider_evaluate_get(input text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS ${quote(getBody)}`);
      await sql("REVOKE ALL ON FUNCTION public.outsider_evaluate(jsonb),public.outsider_metadata(),public.outsider_evaluate_get(text) FROM PUBLIC");
      await sql("GRANT USAGE ON SCHEMA public TO anonymous");
      await sql("GRANT EXECUTE ON FUNCTION public.outsider_evaluate(jsonb),public.outsider_metadata(),public.outsider_evaluate_get(text) TO anonymous");
      await sql("NOTIFY pgrst,'reload schema'");
      const current = await sql("SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('public.outsider_evaluate(jsonb)')");
      if (current.body.rows[0]?.[0] !== body) throw new Error("NEON_FUNCTION_SOURCE_READBACK_MISMATCH");
      const c = await connected(), base = c.dataApiUrl.replace(/\/$/u, "");
      const result = { status: "RESERVED", reservationId: `neon-function:${capacity.projectRefHash.slice(7,39)}`, validUntil: expiresAt,
        providerReceipt: { capacity: capacity.providerReceipt, sourceReadback: current.receiptHash, functionHash, sourceHash },
        adapterState: { routeUrl: `${base}/rpc/outsider_metadata`, invokeUrl: `${base}/rpc/outsider_evaluate`, observeUrl: `${base}/rpc/outsider_evaluate_get`,
          publicAnonymousTokenUrl: `${c.authBaseUrl}/token/anonymous`, allocationBasis: "PROVISIONED_POSTGRES_SQL_FUNCTION_NOT_SLA", sourceHash } };
      writeOnce(file("allocation"), result); return result;
    },
    async exercise() {
      const results = [];
      for (const [route, input, expected] of [["outsider_metadata", undefined, metadata], ...packet.checks.map(row => ["outsider_evaluate", row.input, row.expected])]) {
        const observed = await call(route, input);
        results.push({ method: input === undefined ? "GET" : "POST", route, status: observed.status, responseHash: observed.responseHash,
          matched: observed.status === 200 && observed.body !== undefined && canonicalizeStrict(observed.body) === canonicalizeStrict(expected) });
      }
      return { status: results.every(row => row.matched) ? "SUCCEEDED" : "FAILED", checks: results, localExecutionUsed: false,
        observationIndependentlyOperated: false, evidenceScope: "FROZEN_PUBLIC_JSON_FUNCTION_CASES" };
    },
    async access() { return read(file("allocation")).adapterState; },
    async release() {
      if (existsSync(file("released"))) return read(file("released"));
      if (!existsSync(path.join(directory, "neon", "registration-source.json"))) return { status: "CLOSED", receipt: { neverAllocated: true } };
      await sql("DROP FUNCTION IF EXISTS public.outsider_evaluate_get(text)");
      await sql("DROP FUNCTION IF EXISTS public.outsider_evaluate(jsonb),public.outsider_metadata()");
      const current = await sql("SELECT to_regprocedure('public.outsider_evaluate(jsonb)')");
      if (current.body.rows[0]?.[0] !== null) throw new Error("NEON_FUNCTION_RELEASE_NOT_CONFIRMED");
      const result = { status: "CLOSED", receipt: { callableFunctionRemoved: true, providerReceipt: current.receiptHash, projectExpiryAutomatic: true } };
      writeOnce(file("released"), result); return result;
    },
  };
}
