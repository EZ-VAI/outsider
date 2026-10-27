/* Accountless, task-owned Neon capacity. No claim, account upgrade or billing API.
 * Registration is not idempotent: an uncertain submission is never repeated.
 * Secrets and raw responses stay in the existing private execution store.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, lstatSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { normalizePublicDataset } from "./outsider-public-dataset.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce,
  withUserHeldExecutionLockV2 } from "./outsider-user-held-durable-execution-v2.js";

const ORIGIN = "https://claimable.neon.tech";
const hash = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const digest = value => hash(canonicalizeStrict(value));
const fail = code => { throw new Error(`OUTSIDER_NEON_${code}`); };
const read = file => JSON.parse(readPrivateExecutionBytes(file));
export const NEON_CLAIMABLE_PROTOCOL = Object.freeze({
  providerRef: "neon", failureDomainRef: "neon-postgres",
  origin: ORIGIN, source: "https://neon.com/auth.md",
  accountRequired: false, paymentDetailsRequired: false,
  capacityScope: "TEMPORARY_EXPIRING_PROJECT_NOT_COMMERCIAL_GUARANTEE",
});

export function createNeonClaimableResource({ directory, permissionGrantHash,
  dataApi = false, fetchImpl = globalThis.fetch, clock = () => new Date().toISOString() }) {
  if (!path.isAbsolute(directory ?? "") || !/^sha256:[a-f0-9]{64}$/u.test(permissionGrantHash ?? "")) fail("CONFIG_INVALID");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) fail("PRIVATE_DIRECTORY_REQUIRED");
  const file = name => path.join(directory, `${name}.json`);
  const lock = digest({ directory, resource: "neon-claimable-v1" });
  const sourceKind = fetchImpl === globalThis.fetch ? "NEON_CLAIMABLE_API" : "PROVIDER_FIXTURE";
  const binding = { schema: "outsider/neon-claimable-binding/v1", permissionGrantHash,
    sourceKind, requestedCapabilities: dataApi ? ["postgres", "data_api", "auth"] : ["postgres"] };
  writePrivateExecutionRecordOnce(file("binding"), binding);
  let cachedConnection;
  async function request(url, options, name = `source-${randomUUID()}`) {
    let response;
    try { response = await fetchImpl(url, { ...options, redirect: "error", signal: AbortSignal.timeout(45_000) }); }
    catch { fail("TRANSPORT_UNKNOWN"); }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 512 * 1024) fail("RESPONSE_TOO_LARGE");
    const source = { sourceKind, observedAt: clock(), status: response.status,
      method: options.method ?? "GET", endpoint: url, bodyBase64: bytes.toString("base64") };
    writePrivateExecutionRecordOnce(file(name), source);
    if (!response.ok) fail(`HTTP_${response.status}`);
    let body; try { body = JSON.parse(bytes); } catch { fail("RESPONSE_INVALID"); }
    return { body, receiptHash: hash(readPrivateExecutionBytes(file(name))) };
  }
  function identity() {
    const source = read(file("registration-source"));
    if (source.status < 200 || source.status >= 300) fail(`REGISTRATION_HTTP_${source.status}`);
    const data = JSON.parse(Buffer.from(source.bodyBase64, "base64"));
    if (typeof data.identity_assertion !== "string" || !data.identity_assertion
      || !/^[a-z0-9-]+$/u.test(data.project?.id ?? "") || !data.project.branch_id
      || !Number.isFinite(Date.parse(data.project.expires_at))
      || !data.capabilities?.some(row => row.capability === "postgres" && row.granted === true)) fail("REGISTRATION_FIELDS_INVALID");
    return data;
  }
  async function connection() {
    const registration = identity();
    if (Date.parse(registration.project.expires_at) <= Date.parse(clock())) fail("CAPACITY_EXPIRED");
    if (cachedConnection) return cachedConnection;
    const token = await request(`${ORIGIN}/v1/oauth2/token`, { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: registration.identity_assertion, resource: `${ORIGIN}/` }).toString() });
    if (typeof token.body.access_token !== "string" || !token.body.access_token) fail("TOKEN_INVALID");
    const credentials = await request(`${ORIGIN}/v1/projects/${registration.project.id}/credentials`, {
      headers: { authorization: `Bearer ${token.body.access_token}` } });
    let url; try { url = new URL(credentials.body.database_url); } catch { fail("DATABASE_URL_INVALID"); }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname.endsWith(".neon.tech")
      || url.port || !url.password || !url.username) fail("DATABASE_URL_INVALID");
    const dataApiUrl = credentials.body.services?.data_api?.url;
    const authBaseUrl = credentials.body.services?.auth?.base_url;
    if (dataApi) {
      let endpoint; try { endpoint = new URL(dataApiUrl); } catch { fail("DATA_API_URL_MISSING"); }
      if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".neon.tech")
        || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.port
        || !/^\/[a-zA-Z0-9_-]+\/rest\/v1\/?$/u.test(endpoint.pathname)) fail("DATA_API_URL_INVALID");
      let auth; try { auth = new URL(authBaseUrl); } catch { fail("DATA_API_AUTH_MISSING"); }
      if (auth.protocol !== "https:" || auth.hostname !== endpoint.hostname.replace(".apirest.", ".neonauth.")
        || auth.pathname !== endpoint.pathname.replace(/\/rest\/v1\/?$/u, "/auth")
        || auth.username || auth.password || auth.search || auth.hash || auth.port) fail("DATA_API_AUTH_INVALID");
    }
    cachedConnection = { connectionString: credentials.body.database_url, host: url.hostname,
      ...(dataApi ? { dataApiUrl, authBaseUrl } : {}) };
    return cachedConnection;
  }
  async function sql(query, params = [], sourceName) {
    const { connectionString, host } = await connection();
    return request(`https://${host.replace(/-pooler(?=\.)/u, "")}/sql`, {
      method: "POST", headers: { "content-type": "application/json",
        "Neon-Connection-String": connectionString, "Neon-Raw-Text-Output": "true",
        "Neon-Array-Mode": "true" }, body: JSON.stringify({ query, params }) }, sourceName);
  }
  return Object.freeze({ ...NEON_CLAIMABLE_PROTOCOL, sourceKind,
    // Used only inside the owner's provisioned Worker secret binding. Never a
    // product response, independent-observer argument, or public source receipt.
    async privateReadConnection() { return { ...await connection() }; },
    async publicReadUrl() {
      if (!dataApi) fail("DATA_API_NOT_REQUESTED");
      return `${(await connection()).dataApiUrl.replace(/\/$/u, "")}/outsider_records?select=id,value&order=id.asc`;
    },
    async publicAnonymousTokenUrl() {
      if (!dataApi) fail("DATA_API_NOT_REQUESTED");
      return `${(await connection()).authBaseUrl}/token/anonymous`;
    },
    async publishPublicRead({ expiresAt }) {
      if (!dataApi || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(clock())
        || Date.parse(expiresAt) > Date.parse(identity().project.expires_at)) fail("DATA_API_WINDOW_INVALID");
      return withUserHeldExecutionLockV2(lock, async () => {
        writePrivateExecutionRecordOnce(file("public-api-binding"), { expiresAt, readOnly: true });
        if (!existsSync(file("public-api-enabled"))) {
          // Dedicated task table only. Anonymous callers receive SELECT, never
          // the SQL credential or mutation rights; the read policy expires in SQL.
          await sql("ALTER TABLE outsider_records ENABLE ROW LEVEL SECURITY");
          await sql("GRANT USAGE ON SCHEMA public TO anonymous");
          await sql("GRANT SELECT ON public.outsider_records TO anonymous");
          await sql("DROP POLICY IF EXISTS outsider_public_read ON outsider_records");
          await sql(`CREATE POLICY outsider_public_read ON outsider_records FOR SELECT TO anonymous USING (now() < '${new Date(expiresAt).toISOString()}'::timestamptz)`);
          await sql("NOTIFY pgrst, 'reload schema'");
          writePrivateExecutionRecordOnce(file("public-api-enabled"), { expiresAt, enabledAt: clock() });
        }
        const routeUrl = `${(await connection()).dataApiUrl.replace(/\/$/u, "")}/outsider_records?select=id,value&order=id.asc`;
        // This is a public guest token, obtainable by anyone without identity,
        // not the owner assertion or SQL secret. Never print it in receipts.
        const anonymous = await fetchImpl(`${(await connection()).authBaseUrl}/token/anonymous`,
          { headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(20000) });
        const guest = await anonymous.json();
        if (!anonymous.ok || typeof guest.token !== "string") fail("ANONYMOUS_TOKEN_UNAVAILABLE");
        const observed = await request(routeUrl, { headers: { accept: "application/json", authorization: `Bearer ${guest.token}` } });
        const expected = read(file("public-dataset-binding")).recordsHash;
        if (!Array.isArray(observed.body) || digest(observed.body) !== expected) fail("DATA_API_READBACK_NOT_EXACT");
        return { status: "SUCCEEDED", routeUrl, recordsHash: expected, providerReceipt: observed.receiptHash,
          providerRef: "neon", providerObservationIndependent: false, publicMutationAuthorized: false };
      });
    },
    async writePublicDataset(input) {
      const { records } = normalizePublicDataset(input);
      return withUserHeldExecutionLockV2(lock, async () => {
        writePrivateExecutionRecordOnce(file("public-dataset-binding"), { recordsHash: digest(records) });
        if (existsSync(file("cleared"))) fail("RESOURCE_ALREADY_CLEARED");
        await sql("CREATE TABLE IF NOT EXISTS outsider_records (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
        if (!existsSync(file("public-insert-attempt"))) {
          writePrivateExecutionRecordOnce(file("public-insert-attempt"), { attemptedAt: clock(), recordsHash: digest(records) });
          try { await sql(`INSERT INTO outsider_records (id,value) VALUES ${records.map((_, i) => `($${i * 2 + 1},$${i * 2 + 2})`).join(",")}`,
            records.flatMap(row => [row.id, row.value]), "public-insert-source"); } catch { /* Exact readback decides. */ }
        }
        const observed = await sql("SELECT id,value FROM outsider_records ORDER BY id");
        const rows = observed.body.rows?.map(([id, value]) => ({ id, value }));
        if (!rows || digest(rows) !== digest(records)) fail("PUBLIC_DATASET_READBACK_NOT_EXACT");
        return { status: "SUCCEEDED", recordsHash: digest(rows), recordCount: rows.length,
          providerReceipt: observed.receiptHash, providerObservationIndependent: false, providerRef: "neon" };
      });
    },
    async reserve() {
      return withUserHeldExecutionLockV2(lock, async () => {
        if (!existsSync(file("registration-source"))) {
          if (existsSync(file("registration-attempt"))) fail("REGISTRATION_UNKNOWN_NO_RETRY");
          writePrivateExecutionRecordOnce(file("registration-attempt"), { attemptedAt: clock(), bindingHash: digest(binding) });
          await request(`${ORIGIN}/v1/agent/identity`, { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ type: "anonymous", capabilities: binding.requestedCapabilities, source: "outsider-outcome-network" }) }, "registration-source");
        }
        const data = identity();
        if (dataApi && ["data_api", "auth"].some(capability => !data.capabilities.some(row => row.capability === capability && row.granted === true))) fail("DATA_API_NOT_GRANTED");
        // A usable SELECT, not merely project registration, proves available compute.
        const observed = await sql("SELECT 1 AS outsider_capacity_probe");
        if (observed.body.rows?.[0]?.[0] !== "1") fail("CAPACITY_READBACK_INVALID");
        return { status: "RESERVED", providerRef: "neon", sourceKind,
          projectRefHash: digest({ id: data.project.id }), validUntil: data.project.expires_at,
          automaticExpiry: true, providerReceipt: observed.receiptHash,
          commercialCommitmentIssued: false, providerObservationIndependent: false };
      });
    },
    async restore({ records, recordSourceRefHash }) {
      if (!Array.isArray(records) || records.length !== 3 || new Set(records.map(r => r?.id)).size !== 3
        || records.some(r => !r || Object.keys(r).sort().join(",") !== "id,value"
          || typeof r.id !== "string" || !r.id || r.id.length > 128
          || typeof r.value !== "string" || Buffer.byteLength(r.value) > 1024)
        || !/^sha256:[a-f0-9]{64}$/u.test(recordSourceRefHash ?? "")) fail("RESTORE_INPUT_INVALID");
      const ordered = [...records].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      return withUserHeldExecutionLockV2(lock, async () => {
        writePrivateExecutionRecordOnce(file("restore-binding"), { recordsHash: digest(ordered), recordSourceRefHash });
        if (existsSync(file("cleared"))) fail("RESOURCE_ALREADY_CLEARED");
        // Idempotent schema creation; uncertain INSERT is reconciled by exact readback.
        await sql("CREATE TABLE IF NOT EXISTS outsider_records (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
        if (!existsSync(file("insert-attempt"))) {
          writePrivateExecutionRecordOnce(file("insert-attempt"), { attemptedAt: clock(), recordsHash: digest(ordered) });
          try { await sql("INSERT INTO outsider_records (id,value) VALUES ($1,$2),($3,$4),($5,$6)",
            ordered.flatMap(r => [r.id, r.value]), "insert-source"); } catch { /* Read before any decision; never reinsert. */ }
        }
        const observed = await sql("SELECT id,value FROM outsider_records ORDER BY id");
        const rows = observed.body.rows?.map(([id, value]) => ({ id, value }));
        if (!rows || digest(rows) !== digest(ordered)) fail("RESTORE_READBACK_NOT_EXACT");
        return { status: "SUCCEEDED", recordsHash: digest(ordered), recordCount: rows.length,
          providerReceipt: observed.receiptHash, recordSourceRefHash, sourceKind,
          providerObservationIndependent: false, providerRef: "neon" };
      });
    },
    async clear() {
      return withUserHeldExecutionLockV2(lock, async () => {
        if (existsSync(file("cleared"))) return read(file("cleared"));
        await sql("DROP TABLE IF EXISTS outsider_records");
        const observed = await sql("SELECT to_regclass('public.outsider_records') AS table_name");
        if (observed.body.rows?.[0]?.[0] !== null) fail("CLEAR_NOT_CONFIRMED");
        const result = { status: "DATA_CLEARED_AWAITING_PROJECT_EXPIRY", sourceKind,
          projectDeleted: false, dataCleared: true, providerReceipt: observed.receiptHash,
          expiresAt: identity().project.expires_at };
        writePrivateExecutionRecordOnce(file("cleared"), result); return result;
      });
    },
  });
}
