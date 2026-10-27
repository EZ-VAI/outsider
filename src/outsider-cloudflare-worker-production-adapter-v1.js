/*
 * Production adapter for one ephemeral Cloudflare Worker route.
 *
 * reserve() stages exact code at a deterministic, order-scoped script name;
 * execute() enables its workers.dev route; release() removes it.  The adapter
 * keeps credentials only in its closure, so durable orchestrator state can be
 * replayed without serialising a token.  Provider receipts are effect receipts;
 * the program's independent witness still decides outcome acceptance.
 */

import { createHash } from "node:crypto";

const API_ORIGIN = "https://api.cloudflare.com/client/v4";
const CAPABILITY = "PUBLIC_HTTPS_ARTIFACT_PUBLICATION";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_VISIBILITY_POLL_INTERVAL_MS = 500;
const DEFAULT_VISIBILITY_MAX_WAIT_MS = 15_000;
const MAX_VISIBILITY_POLL_INTERVAL_MS = 10_000;
const MAX_VISIBILITY_MAX_WAIT_MS = 60_000;
const MAX_VISIBILITY_ATTEMPTS = 64;

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function fail(code) {
  const error = new TypeError(`OUTSIDER_CLOUDFLARE_WORKER_PRODUCTION_V1_${code}`);
  error.outsiderCode = code;
  throw error;
}

function deterministicScriptName(program, requirement) {
  return `outsider-${createHash("sha256")
    .update(`${program.programHash}\0${requirement.requirementId}`, "utf8")
    .digest("hex").slice(0, 32)}`;
}

function workerSource(artifactBytes, contentType, responseStatus) {
  const base64 = artifactBytes.toString("base64");
  return Buffer.from(
    `const body=Uint8Array.from(atob(${JSON.stringify(base64)}),c=>c.charCodeAt(0));\n`
    + `export default {async fetch(){return new Response(body,{status:${responseStatus},headers:{`
    + `"content-type":${JSON.stringify(contentType)},`
    + '"cache-control":"no-store"}})}};\n',
    "utf8");
}

function multipartBody(moduleBytes, boundary) {
  const metadata = JSON.stringify({
    main_module: "worker.mjs",
    compatibility_date: "2025-08-01",
  });
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n`, "utf8"),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="worker.mjs"; filename="worker.mjs"\r\nContent-Type: application/javascript+module\r\n\r\n`, "utf8"),
    moduleBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
}

async function responseBytes(response, maximum = 2 * 1024 * 1024) {
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maximum) fail("RESPONSE_TOO_LARGE");
  return bytes;
}

function receiptHash(method, path, status, bytes) {
  return sha256(Buffer.concat([
    Buffer.from(`${method}\0${path}\0${status}\0`, "utf8"), bytes,
  ]));
}

function boundedMilliseconds(value, fallback, maximum) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) {
    fail("CONFIG_INVALID");
  }
  return selected;
}

async function withRequestTimeout(timeoutMs, request) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new TypeError(
        "OUTSIDER_CLOUDFLARE_WORKER_PRODUCTION_V1_REQUEST_TIMEOUT");
      error.outsiderCode = "REQUEST_TIMEOUT";
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => request(controller.signal)),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function reservationData(reservation) {
  const data = reservation?.adapterState ?? reservation?.providerData;
  if (data && typeof data.scriptName === "string"
    && typeof data.publicUrl === "string"
    && typeof data.artifactHash === "string") return data;
  const prefix = "cloudflare-worker:";
  if (typeof reservation?.reservationId !== "string"
    || !reservation.reservationId.startsWith(prefix)) fail("RESERVATION_INVALID");
  const scriptName = reservation.reservationId.slice(prefix.length);
  if (!/^outsider-[a-f0-9]{32}$/u.test(scriptName)) fail("RESERVATION_INVALID");
  return {
    scriptName,
    publicUrl: null,
    artifactHash: null,
  };
}

export function createCloudflareWorkerProductionAdapterV1(config) {
  if (!config || typeof config.apiToken !== "string"
    || config.apiToken.length < 20
    || typeof config.accountId !== "string"
    || !/^[a-f0-9]{32}$/u.test(config.accountId)
    || typeof config.workersDevSubdomain !== "string"
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u
      .test(config.workersDevSubdomain)
    || !Buffer.isBuffer(config.artifactBytes)
    || config.artifactBytes.length < 1
    || (config.controlledFailureStatus !== undefined
      && config.controlledFailureStatus !== 503)) fail("CONFIG_INVALID");

  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_INVALID");
  const artifactBytes = Buffer.from(config.artifactBytes);
  const artifactHash = sha256(artifactBytes);
  const contentType = config.contentType ?? "text/plain; charset=utf-8";
  const responseStatus = config.controlledFailureStatus ?? 200;
  const moduleBytes = workerSource(artifactBytes, contentType, responseStatus);
  const requestTimeoutMs = boundedMilliseconds(config.requestTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS, MAX_REQUEST_TIMEOUT_MS);
  const visibilityPollIntervalMs = boundedMilliseconds(
    config.visibilityPollIntervalMs,
    DEFAULT_VISIBILITY_POLL_INTERVAL_MS,
    MAX_VISIBILITY_POLL_INTERVAL_MS,
  );
  const visibilityMaxWaitMs = boundedMilliseconds(
    config.visibilityMaxWaitMs,
    DEFAULT_VISIBILITY_MAX_WAIT_MS,
    MAX_VISIBILITY_MAX_WAIT_MS,
  );

  const dataFor = (reservation) => {
    const parsed = reservationData(reservation);
    return parsed.publicUrl === null
      ? {
        ...parsed,
        publicUrl:
          `https://${parsed.scriptName}.${config.workersDevSubdomain}.workers.dev/`,
        artifactHash,
      }
      : parsed;
  };

  const apiRequest = async (path, init) => {
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Bearer ${config.apiToken}`);
    return withRequestTimeout(requestTimeoutMs, async (signal) => {
      const response = await fetchImpl(`${API_ORIGIN}${path}`, {
        ...init,
        headers,
        redirect: "error",
        signal,
      });
      const bytes = await responseBytes(response);
      return { response, bytes };
    });
  };

  const adapter = {
    adapterId: config.adapterId ?? "cloudflare-worker-production-v1",
    providerRef: "cloudflare-workers",
    failureDomainRef: "cloudflare.com",
    roles: Object.freeze(["PRIMARY"]),
    capabilities: Object.freeze([CAPABILITY]),

    supports(requirement) {
      return requirement?.capability === CAPABILITY
        && requirement.constraints?.artifactHash === artifactHash;
    },

    async reserve({ program, requirement, operationId }) {
      if (!adapter.supports(requirement) || typeof operationId !== "string") {
        return { status: "UNAVAILABLE", reason: "CAPABILITY_OR_INPUT_MISMATCH" };
      }
      const scriptName = deterministicScriptName(program, requirement);
      const path = `/accounts/${config.accountId}/workers/scripts/${scriptName}`;
      const boundary = `outsider-${createHash("sha256")
        .update(operationId, "utf8").digest("hex").slice(0, 32)}`;
      const body = multipartBody(moduleBytes, boundary);
      let exchange;
      try {
        exchange = await apiRequest(path, {
          method: "PUT",
          headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
          body,
        });
      } catch {
        // A transport interruption says nothing about provider capacity.  Let
        // the orchestrator retain the same deterministic operation and let the
        // single autonomous driver reconcile it after bounded backoff.  Only
        // an actual provider response below may close formation as unavailable.
        fail("STAGE_TRANSPORT_FAILED");
      }
      let source;
      try { source = JSON.parse(exchange.bytes.toString("utf8")); } catch {}
      if (!exchange.response.ok || source?.success !== true) {
        return { status: "UNAVAILABLE", reason: "STAGE_REJECTED",
          providerStatus: exchange.response.status };
      }
      const publicUrl = `https://${scriptName}.${config.workersDevSubdomain}.workers.dev/`;
      return {
        status: "RESERVED",
        reservationId: `cloudflare-worker:${scriptName}`,
        validUntil: program.obligations
          .filter((item) => item.targetRequirementId
            === requirement.requirementId)
          .reduce((latest, item) => Date.parse(item.deadline) > Date.parse(latest)
            ? item.deadline : latest, program.completionDeadline),
        providerReceipt: receiptHash("PUT", path, exchange.response.status,
          exchange.bytes),
        adapterState: { scriptName, publicUrl, artifactHash },
      };
    },

    async execute({ reservation, operationId, primaryFailure = false }) {
      const data = dataFor(reservation);
      if (primaryFailure === true) {
        return { status: "FAILED", reason: "INJECTED_PRIMARY_FAILURE",
          routeUrl: data.publicUrl, operationId };
      }
      const path = `/accounts/${config.accountId}/workers/scripts/${data.scriptName}/subdomain`;
      const body = Buffer.from(JSON.stringify({
        enabled: true,
        previews_enabled: false,
      }), "utf8");
      let exchange;
      try {
        exchange = await apiRequest(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
      } catch (error) {
        return { status: "FAILED", reason: "ACTIVATION_TRANSPORT_FAILED",
          errorClass: error?.name ?? "Error", routeUrl: data.publicUrl };
      }
      let source;
      try { source = JSON.parse(exchange.bytes.toString("utf8")); } catch {}
      if (!exchange.response.ok || source?.success !== true
        || source?.result?.enabled !== true) {
        return { status: "FAILED", reason: "ACTIVATION_REJECTED",
          providerStatus: exchange.response.status, routeUrl: data.publicUrl };
      }

      // Enabling a workers.dev route is a separate configuration change from
      // uploading its script.  The enable receipt can therefore precede edge
      // visibility for a short period.  Confirm propagation with a bounded
      // same-route poll; a first 404 is not evidence that execution failed.
      // This observation proves effect visibility, not independence.
      let effectObserved = false;
      let observedPublicStatus = null;
      let observedExactBody = false;
      let visibilityAttempts = 0;
      const maximumAttempts = Math.min(MAX_VISIBILITY_ATTEMPTS, Math.max(1,
        Math.ceil(visibilityMaxWaitMs / visibilityPollIntervalMs)));
      while (visibilityAttempts < maximumAttempts && !effectObserved) {
        visibilityAttempts += 1;
        try {
          const observed = await withRequestTimeout(requestTimeoutMs,
            async (signal) => {
              const publicResponse = await fetchImpl(data.publicUrl, {
                method: "GET",
                headers: { accept: contentType,
                  "cache-control": "no-cache" },
                redirect: "error",
                signal,
              });
              const publicBytes = await responseBytes(publicResponse,
                artifactBytes.length + 1024);
              return { status: publicResponse.status, publicBytes };
            });
          observedPublicStatus = observed.status;
          observedExactBody = false;
          observedExactBody = observed.publicBytes.equals(artifactBytes);
          effectObserved = observedPublicStatus === responseStatus
            && observedExactBody;
        } catch {}
        if (!effectObserved && visibilityAttempts < maximumAttempts) {
          await wait(visibilityPollIntervalMs);
        }
      }
      const visible = responseStatus === 200 && effectObserved;
      const controlledFailureObserved = responseStatus === 503
        && effectObserved;
      return {
        status: visible ? "SUCCEEDED" : "FAILED",
        reason: visible ? null : controlledFailureObserved
          ? "CONTROLLED_PRIMARY_FAILURE_OBSERVED"
          : "PUBLIC_EFFECT_NOT_OBSERVED",
        routeUrl: data.publicUrl,
        artifactHash,
        observedPublicStatus,
        visibilityAttempts,
        controlledFailureObserved,
        providerReceipt: receiptHash("POST", path, exchange.response.status,
          exchange.bytes),
        providerObservationIndependent: false,
      };
    },

    async release({ reservation }) {
      const data = dataFor(reservation);
      const path = `/accounts/${config.accountId}/workers/scripts/${data.scriptName}`;
      let exchange;
      try {
        exchange = await apiRequest(path, { method: "DELETE" });
      } catch (error) {
        return { status: "OPEN", reason: "CLEANUP_TRANSPORT_FAILED",
          errorClass: error?.name ?? "Error" };
      }
      if (!exchange.response.ok && exchange.response.status !== 404) {
        return { status: "OPEN", reason: "CLEANUP_REJECTED",
          providerStatus: exchange.response.status };
      }
      return {
        status: "RELEASED",
        receipt: receiptHash("DELETE", path, exchange.response.status,
          exchange.bytes),
      };
    },

    async closeObligation(context) {
      const released = await adapter.release(context);
      return released.status === "RELEASED"
        ? { status: "CLOSED", receipt: released.receipt }
        : released;
    },
  };

  return Object.freeze(adapter);
}
