/*
 * Current formation preactivation policy over the current Worker lifecycle.
 * Historical v2/v3 source is retained for replay; this path never constructs
 * a frozen adapter. Receipt schema/hash domains remain v2 because their
 * meaning is unchanged by replacing the upload implementation.
 *
 * reserve() activates and verifies the confirmed route for formation;
 * execute() remains the outcome attempt. Cleanup requires observed absence.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { createCloudflareWorkerProductionAdapter,
  cloudflareWorkerUploadProtocolBinding }
  from "./outsider-cloudflare-worker-production-adapter.js";

const PREFIX
  = "OUTSIDER_CLOUDFLARE_WORKER_PREACTIVATED_PRODUCTION_ADAPTER_";
const DEFAULT_CLEANUP_POLL_INTERVAL_MS = 250;
const DEFAULT_CLEANUP_MAX_WAIT_MS = 15_000;
const MAX_CLEANUP_MAX_WAIT_MS = 60_000;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function boundedInteger(value, fallback, maximum) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) {
    fail("CONFIG_INVALID");
  }
  return selected;
}

function waitFor(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function boundedFetch(fetchImpl, timeoutMs, url, init) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new TypeError(`${PREFIX}PUBLIC_ROUTE_READ_TIMEOUT`);
      error.outsiderCode = "PUBLIC_ROUTE_READ_TIMEOUT";
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => fetchImpl(url, { ...init,
        signal: controller.signal })),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function receipt(source, activation) {
  const body = {
    schema: "outsider/cloudflare-worker-preactivated-reservation-receipt/v2",
    schemaVersion: "2.0.0",
    sourceReservationReceiptHash: digest(
      "outsider/cloudflare-v1-reservation-receipt/v2",
      source.providerReceipt ?? null),
    formationActivationReceiptHash: digest(
      "outsider/cloudflare-v1-formation-activation-receipt/v2",
      activation.providerReceipt ?? null),
    observedPublicStatus: activation.observedPublicStatus,
    artifactHash: activation.artifactHash,
    formationRoutePreactivated: true,
    independentObservationClaimed: false,
    outcomeCompletionClaimed: false,
  };
  return Object.freeze({ ...body, receiptHash: digest(body.schema, body) });
}

export function createCloudflareWorkerPreactivatedProductionAdapter(
  input = {}) {
  const controlledFailureAfterPreflight = input.controlledFailureStatus === 503;
  const child = createCloudflareWorkerProductionAdapter({
    ...input,
    controlledFailureStatus: undefined,
  });
  const controlledFailureChild = controlledFailureAfterPreflight
    ? createCloudflareWorkerProductionAdapter({
      ...input,
      controlledFailureStatus: 503,
    }) : null;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const cleanupPollIntervalMs = boundedInteger(
    input.cleanupVerificationPollIntervalMs,
    DEFAULT_CLEANUP_POLL_INTERVAL_MS, 10_000);
  const cleanupMaxWaitMs = boundedInteger(input.cleanupVerificationMaxWaitMs,
    DEFAULT_CLEANUP_MAX_WAIT_MS, MAX_CLEANUP_MAX_WAIT_MS);
  const cleanupRequestTimeoutMs = boundedInteger(input.requestTimeoutMs,
    15_000, MAX_CLEANUP_MAX_WAIT_MS);
  const cleanupWait = input.wait ?? waitFor;
  const now = input.now ?? Date.now;
  if (typeof fetchImpl !== "function" || typeof cleanupWait !== "function"
    || typeof now !== "function") fail("CONFIG_INVALID");
  const adapterId = input.preactivatedAdapterId
    ?? "cloudflare-worker-preactivated-production";
  if (typeof adapterId !== "string" || adapterId.length < 1
    || adapterId.length > 255) fail("ADAPTER_ID_INVALID");

  async function verifyRouteAbsent(reservation, operationId) {
    const route = reservation?.adapterState?.publicUrl;
    let parsed;
    try { parsed = new URL(route); } catch { fail("PUBLIC_ROUTE_INVALID"); }
    if (parsed.protocol !== "https:" || parsed.username !== ""
      || parsed.password !== "" || parsed.hash !== ""
      || !parsed.hostname.endsWith(".workers.dev")
      || parsed.pathname !== "/" || parsed.search !== "") {
      fail("PUBLIC_ROUTE_INVALID");
    }
    const startedAt = now();
    if (!Number.isFinite(startedAt)) fail("CLOCK_INVALID");
    let attempts = 0;
    for (;;) {
      attempts += 1;
      const elapsed = Math.max(0, now() - startedAt);
      const remaining = Math.max(1, cleanupMaxWaitMs - elapsed);
      const probe = new URL(parsed.href);
      probe.searchParams.set("outsider_cleanup_probe", createHash("sha256")
        .update(`${operationId}\0${attempts}`, "utf8").digest("hex"));
      let status = null;
      try {
        const response = await boundedFetch(fetchImpl,
          Math.min(cleanupRequestTimeoutMs, remaining), probe.href, {
            method: "GET",
            headers: { accept: "text/plain", "cache-control": "no-cache" },
            redirect: "error",
          });
        status = response.status;
      } catch {}
      if (status === 404 || status === 410) {
        return { verified: true, status, attempts };
      }
      if (now() - startedAt >= cleanupMaxWaitMs) {
        return { verified: false, status, attempts };
      }
      await cleanupWait(Math.min(cleanupPollIntervalMs,
        cleanupMaxWaitMs - Math.max(0, now() - startedAt)));
    }
  }

  async function releaseVerified(context) {
    const released = await child.release(context);
    if (!new Set(["RELEASED", "CLOSED"]).has(released?.status)) {
      return released;
    }
    const absent = await verifyRouteAbsent(context.reservation,
      context.operationId);
    if (!absent.verified) {
      return {
        status: "OPEN",
        reason: "PUBLIC_ROUTE_ABSENCE_NOT_VERIFIED",
        activeRouteVerifiedAbsent: false,
      };
    }
    return {
      status: "RELEASED",
      receipt: digest("outsider/cloudflare-v2-verified-release/v2", {
        childReceipt: released.receipt ?? null,
        routeRefHash: digest("outsider/cloudflare-v2-route/v2",
          context.reservation.adapterState.publicUrl),
        observedStatus: absent.status,
        attempts: absent.attempts,
      }),
      activeRouteVerifiedAbsent: true,
      publicAbsenceObservationIndependent: false,
      cacheBustedAbsenceProbe: true,
    };
  }

  const adapter = {
    ...child,
    adapterId,
    uploadProtocol: cloudflareWorkerUploadProtocolBinding(adapterId),

    supports(requirement) {
      return child.supports(requirement);
    },

    async reserve(context) {
      const reserved = await child.reserve(context);
      if (reserved?.status !== "RESERVED") return reserved;
      let activation;
      try {
        activation = await child.execute({
          reservation: reserved,
          operationId: `${context.operationId}:FORMATION_ROUTE_ACTIVATE`,
          primaryFailure: false,
        });
      } catch (error) {
        const released = await releaseVerified({
            reservation: reserved,
            operationId: `${context.operationId}:FORMATION_COMPENSATE`,
            disposition: "FORMATION_ACTIVATION_FAILED",
          });
        if (released?.status !== "RELEASED") {
          fail("FORMATION_COMPENSATION_FAILED");
        }
        throw error;
      }
      if (activation?.status !== "SUCCEEDED"
        || activation.routeUrl !== reserved.adapterState?.publicUrl
        || activation.artifactHash
          !== reserved.adapterState?.artifactHash
        || activation.observedPublicStatus !== 200) {
        const released = await releaseVerified({
          reservation: reserved,
          operationId: `${context.operationId}:FORMATION_COMPENSATE`,
          disposition: "FORMATION_ACTIVATION_MISMATCH",
        });
        if (!new Set(["RELEASED", "CLOSED"]).has(released?.status)) {
          fail("FORMATION_COMPENSATION_FAILED");
        }
        return {
          status: "UNAVAILABLE",
          reason: "FORMATION_ROUTE_ACTIVATION_UNAVAILABLE",
        };
      }
      return {
        ...reserved,
        providerReceipt: receipt(reserved, activation),
        formationRoutePreactivated: true,
      };
    },

    async execute(context) {
      if (controlledFailureAfterPreflight) {
        const staged = await controlledFailureChild.reserve({
          program: context?.program,
          requirement: context?.requirement,
          operationId: `${context?.operationId}:CONTROLLED_503_STAGE`,
        });
        if (staged?.status !== "RESERVED"
          || staged.reservationId !== context?.reservation?.reservationId
          || staged.adapterState?.publicUrl
            !== context?.reservation?.adapterState?.publicUrl) {
          fail("CONTROLLED_FAILURE_STAGE_UNAVAILABLE");
        }
        const failed = await controlledFailureChild.execute({
          ...context,
          reservation: staged,
          operationId: `${context?.operationId}:CONTROLLED_503_VERIFY`,
        });
        if (failed?.status !== "FAILED"
          || failed.reason !== "CONTROLLED_PRIMARY_FAILURE_OBSERVED"
          || failed.observedPublicStatus !== 503
          || failed.controlledFailureObserved !== true
          || failed.routeUrl !== staged.adapterState.publicUrl) {
          fail("CONTROLLED_FAILURE_NOT_OBSERVED");
        }
        return {
          ...failed,
          operationId: context?.operationId ?? null,
          formationPreflightWasExact200: true,
        };
      }
      return child.execute(context);
    },

    release(context) {
      return releaseVerified(context);
    },

    async closeObligation(context) {
      const released = await releaseVerified(context);
      return released.status === "RELEASED"
        ? { ...released, status: "CLOSED" } : released;
    },
  };
  return Object.freeze(adapter);
}
