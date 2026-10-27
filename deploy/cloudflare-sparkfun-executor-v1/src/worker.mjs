import { canonicalizeStrict } from "../../../src/canonical.js";
import {
  createCloudflareSparkFunExecutorV1,
  OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_BOUNDARY,
  OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_LIMITS,
  validateCloudflareSparkFunExecutorDeploymentV1,
} from "../../../src/outsider-cloudflare-sparkfun-executor-v1.js";
import { formationJobIdentityV1 }
  from "../../../src/outsider-formation-job-worker-v1.js";

const CHUNK_BYTES = 64 * 1024;
const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

function json(status, value) {
  return new Response(`${JSON.stringify(value)}\n`, {
    status,
    headers: JSON_HEADERS,
  });
}

function errorCode(error) {
  return String(error?.outsiderCode ?? error?.message ?? error)
    .split(":", 1)[0];
}

function errorResponse(error) {
  const code = errorCode(error);
  const status = code.includes("TOO_LARGE") ? 413
    : code.includes("CONTENT_TYPE") ? 415 : 400;
  return json(status, { ok: false, error: code });
}

async function body(request) {
  const contentType = request.headers.get("content-type")
    ?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new Error("CONTENT_TYPE_INVALID");
  const declared = request.headers.get("content-length");
  const maximum = OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_LIMITS
    .maximumInvocationBytes;
  if (declared !== null && (!/^\d{1,6}$/u.test(declared)
    || Number(declared) > maximum)) throw new Error("BODY_TOO_LARGE");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length < 2 || bytes.length > maximum) throw new Error("BODY_TOO_LARGE");
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { throw new Error("BODY_INVALID_JSON"); }
}

function registration(env) {
  const text = String(env.SPARKFUN_EXECUTOR_REGISTRATION_JSON ?? "");
  if (text.length < 2 || text.length > 16 * 1024) {
    throw new Error("REGISTRATION_UNAVAILABLE");
  }
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error("REGISTRATION_INVALID"); }
  if (canonicalizeStrict(value) !== text) throw new Error("REGISTRATION_NOT_CANONICAL");
  return value;
}

async function putChunks(storage, prefix, bytes) {
  const source = bytes === null ? null : new Uint8Array(bytes);
  if (source === null) return 0;
  const count = Math.ceil(source.byteLength / CHUNK_BYTES);
  for (let index = 0; index < count; index += 1) {
    const start = index * CHUNK_BYTES;
    await storage.put(`${prefix}:${String(index).padStart(4, "0")}`,
      source.slice(start, Math.min(source.byteLength, start + CHUNK_BYTES)));
  }
  return count;
}

function durableStore(storage) {
  return Object.freeze({
    async read() { return await storage.get("execution-state") ?? null; },
    async claim(input) {
      let result;
      await storage.transaction(async (txn) => {
        const existing = await txn.get("execution-state");
        if (existing === undefined) {
          await txn.put("execution-state", { state: "RUNNING", ...input });
          result = { status: "CLAIMED" };
        } else if (existing.jobHash !== input.jobHash) {
          result = { status: "CONFLICT" };
        } else if (existing.state === "COMPLETE") {
          result = { status: "COMPLETE", result: existing.result };
        } else {
          result = { status: "RUNNING" };
        }
      });
      return Object.freeze(result);
    },
    async storePrivateExchange(value) {
      const prefix = `private-exchange:${value.exchangeHash}`;
      const requestChunkCount = await putChunks(storage, `${prefix}:request`,
        value.requestBytes);
      const responseChunkCount = await putChunks(storage, `${prefix}:response`,
        value.responseBytes);
      await storage.put(`${prefix}:manifest`, {
        ...value.record,
        exchangeHash: value.exchangeHash,
        requestChunkCount,
        responseChunkCount,
        privateProjectionPermitted: false,
      });
    },
    async storePrivateOccurrence(value) {
      const prefix = `private-occurrence:${value.sourceOccurrenceHash}`;
      const sourceChunkCount = await putChunks(storage, `${prefix}:source`,
        value.sourceBytes);
      await storage.put(`${prefix}:manifest`, {
        sourceOccurrenceHash: value.sourceOccurrenceHash,
        occurrenceBody: value.occurrenceBody,
        sourceChunkCount,
        privateProjectionPermitted: false,
      });
    },
    async complete(input) {
      let result;
      await storage.transaction(async (txn) => {
        const existing = await txn.get("execution-state");
        if (existing === undefined || existing.jobHash !== input.jobHash) {
          throw new Error("COMPLETE_WITHOUT_CLAIM");
        }
        if (existing.state === "COMPLETE") {
          if (existing.result.resultHash !== input.result.resultHash) {
            throw new Error("RESULT_CONFLICT");
          }
          result = { status: "EXISTING", result: existing.result };
          return;
        }
        const completed = { ...existing, state: "COMPLETE",
          result: input.result, completedAt: input.completedAt };
        await txn.put("execution-state", completed);
        result = { status: "COMPLETED", result: completed.result };
      });
      return Object.freeze(result);
    },
  });
}

export class SparkFunExecutionLedger {
  constructor(ctx, env) {
    this.executor = createCloudflareSparkFunExecutorV1({
      registration: registration(env),
      privateEnvelopeSecretBase64:
        String(env.SPARKFUN_PRIVATE_ENVELOPE_BASE64 ?? ""),
      store: durableStore(ctx.storage),
      fetchImpl: globalThis.fetch.bind(globalThis),
      clock: () => new Date().toISOString(),
    });
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.pathname !== "/internal/v1/execute" || request.method !== "POST") {
        return json(404, { ok: false, error: "NOT_FOUND" });
      }
      return json(200, await this.executor.handleInvocation(await body(request)));
    } catch (error) { return errorResponse(error); }
  }
}

function namespace(env) {
  const value = env.SPARKFUN_EXECUTIONS;
  return value !== null && typeof value === "object"
    && typeof value.idFromName === "function" && typeof value.get === "function"
    ? value : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz" && request.method === "GET") {
      let configurationReady = false;
      try {
        validateCloudflareSparkFunExecutorDeploymentV1({
          registration: registration(env),
          privateEnvelopeSecretBase64:
            String(env.SPARKFUN_PRIVATE_ENVELOPE_BASE64 ?? ""),
        });
        configurationReady = true;
      } catch {}
      return json(200, { ok: true,
        service: "outsider-cloudflare-sparkfun-executor-v1",
        version: "1.0.0", configurationReady,
        productionExecutionReady: configurationReady
          && namespace(env) !== null,
        boundary: OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_BOUNDARY });
    }
    if (url.pathname !== "/v1/execute-frozen-plan"
      || request.method !== "POST") {
      return json(404, { ok: false, error: "NOT_FOUND" });
    }
    try {
      const invocation = await body(request);
      const identity = formationJobIdentityV1(invocation.job);
      if (invocation.schema !== "outsider/formation-executor-invocation/v1"
        || invocation.jobHash !== identity.jobHash
        || invocation.jobKey !== identity.jobKey) {
        return json(400, { ok: false, error: "INVOCATION_BINDING_INVALID" });
      }
      const binding = namespace(env);
      if (binding === null) {
        return json(500, { ok: false, error: "DURABLE_BINDING_UNAVAILABLE" });
      }
      const stub = binding.get(binding.idFromName(identity.jobKey));
      return stub.fetch(new Request(
        "https://sparkfun-executor.internal/internal/v1/execute", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: canonicalizeStrict(invocation),
        }));
    } catch (error) { return errorResponse(error); }
  },
};
