import { randomUUID } from "node:crypto";

export const DEFAULT_CONTROLLER_LEASE_MS = 12_000;

const iso = (milliseconds) => new Date(milliseconds).toISOString();

/**
 * A lease prevents two recovered controllers from grading the same boundary.
 * It is deliberately stored beside the causal event stream, outside the worker
 * workspace. A successor may take over only after the old heartbeat expires or
 * when the watchdog presents the exact prior owner id it is replacing.
 */
export function acquireControllerLease({
  store,
  ownerId = randomUUID(),
  ttlMs = DEFAULT_CONTROLLER_LEASE_MS,
  now = Date.now(),
  replacingOwnerId = null,
} = {}) {
  if (!store) throw new Error("CONTROLLER_LEASE_STORE_REQUIRED");
  const prior = store.readJson("controller-lease.json");
  const active = prior?.status === "active" && Number(prior.expiresAtMs) > now;
  if (active && prior.ownerId !== ownerId && prior.ownerId !== replacingOwnerId) {
    throw new Error(`CONTROLLER_LEASE_HELD:${prior.ownerId}`);
  }
  const lease = {
    schema: "outsider/controller-lease/v1",
    runId: store.runId,
    contractSeal: store.contract.seal,
    ownerId,
    generation: Number(prior?.generation ?? 0) + (prior?.ownerId === ownerId ? 0 : 1),
    pid: process.pid,
    status: "active",
    acquiredAt: prior?.ownerId === ownerId ? prior.acquiredAt : iso(now),
    heartbeatAt: iso(now),
    expiresAt: iso(now + ttlMs),
    expiresAtMs: now + ttlMs,
    ttlMs,
  };
  store.writeJson("controller-lease.json", lease);
  return lease;
}

export function heartbeatControllerLease({ store, ownerId, now = Date.now() } = {}) {
  const lease = store?.readJson("controller-lease.json");
  if (!lease || lease.status !== "active" || lease.ownerId !== ownerId
    || lease.runId !== store.runId || lease.contractSeal !== store.contract.seal) {
    throw new Error("CONTROLLER_LEASE_LOST");
  }
  const next = {
    ...lease,
    pid: process.pid,
    heartbeatAt: iso(now),
    expiresAt: iso(now + Number(lease.ttlMs ?? DEFAULT_CONTROLLER_LEASE_MS)),
    expiresAtMs: now + Number(lease.ttlMs ?? DEFAULT_CONTROLLER_LEASE_MS),
  };
  store.writeJson("controller-lease.json", next);
  return next;
}

export function releaseControllerLease({ store, ownerId, now = Date.now() } = {}) {
  const lease = store?.readJson("controller-lease.json");
  if (!lease || lease.ownerId !== ownerId) return false;
  store.writeJson("controller-lease.json", {
    ...lease,
    status: "released",
    releasedAt: iso(now),
    expiresAtMs: now,
    expiresAt: iso(now),
  });
  return true;
}

