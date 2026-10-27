/*
 * Shared rolling-window scheduler for every UptimeRobot request emitted by
 * one production composition. It serializes admission across PRIMARY and
 * RECOVERY, caps the provider's free-plan window at ten calls per minute, and
 * keeps two positions available for DELETE cleanup. A reserved slot is
 * consumed before transport contact, so a crash can only under-use capacity.
 */

const PREFIX = "OUTSIDER_UPTIMEROBOT_ACCOUNT_RATE_LIMITER_V1_";
const INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function now(clock) {
  let value;
  try { value = clock(); } catch { fail("CLOCK_FAILED"); }
  if (typeof value !== "string" || !INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail("CLOCK_RESULT_INVALID");
  }
  return Date.parse(value);
}

function defaultWait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function createUptimeRobotAccountRateLimiterV1(input = {}) {
  const requestImpl = input.requestImpl;
  const clock = input.clock ?? (() => new Date().toISOString());
  const wait = input.wait ?? defaultWait;
  const rollingWindowMs = input.rollingWindowMs ?? 60_000;
  const maximumRequests = input.maximumRequests ?? 10;
  const reservedCleanupRequests = input.reservedCleanupRequests ?? 2;
  if (typeof requestImpl !== "function" || typeof clock !== "function"
    || typeof wait !== "function" || rollingWindowMs !== 60_000
    || maximumRequests !== 10 || reservedCleanupRequests !== 2) {
    fail("CONFIG_INVALID");
  }
  const ordinaryLimit = maximumRequests - reservedCleanupRequests;
  const admittedAt = [];
  const pending = [];
  let pumpRunning = false;

  function prune(at) {
    while (admittedAt.length > 0
      && at - admittedAt[0].at >= rollingWindowMs) admittedAt.shift();
  }

  function ordinaryCount() {
    return admittedAt.filter((item) => !item.cleanup).length;
  }

  function nextPendingIndex(observed) {
    prune(observed);
    const cleanupIndex = pending.findIndex((item) => item.cleanup);
    if (cleanupIndex >= 0 && admittedAt.length < maximumRequests) {
      return cleanupIndex;
    }
    const ordinaryIndex = pending.findIndex((item) => !item.cleanup);
    if (ordinaryIndex >= 0 && admittedAt.length < maximumRequests
      && ordinaryCount() < ordinaryLimit) return ordinaryIndex;
    return -1;
  }

  function nextSlotAt() {
    const cleanupWaiting = pending.some((item) => item.cleanup);
    const candidates = cleanupWaiting ? admittedAt
      : admittedAt.filter((item) => !item.cleanup);
    if (candidates.length < 1) fail("ROLLING_WINDOW_DELAY_INVALID");
    return Math.min(...candidates.map((item) => item.at + rollingWindowMs));
  }

  async function pump() {
    try {
      while (pending.length > 0) {
        let observed = now(clock);
        let index = nextPendingIndex(observed);
        while (index >= 0) {
          const [item] = pending.splice(index, 1);
          admittedAt.push({ at: observed, cleanup: item.cleanup });
          item.resolve(observed);
          index = nextPendingIndex(observed);
        }
        if (pending.length === 0) break;
        // Resolved callers must reach transport before a synthetic or real
        // window wait advances this scheduler to the next admission epoch.
        await Promise.resolve();
        const delay = nextSlotAt() - observed;
        if (!Number.isSafeInteger(delay) || delay < 1) {
          fail("ROLLING_WINDOW_DELAY_INVALID");
        }
        await wait(delay);
        const after = now(clock);
        if (after < observed + delay) fail("WAIT_DID_NOT_REACH_RATE_SLOT");
      }
    } catch (error) {
      while (pending.length > 0) pending.shift().reject(error);
    } finally {
      pumpRunning = false;
      if (pending.length > 0) schedulePump();
    }
  }

  function schedulePump() {
    if (pumpRunning) return;
    pumpRunning = true;
    queueMicrotask(() => { void pump(); });
  }

  function acquire(cleanup) {
    return new Promise((resolve, reject) => {
      pending.push({ cleanup, resolve, reject });
      schedulePump();
    });
  }

  async function request(url, options = {}) {
    const cleanup = options?.method === "DELETE";
    await acquire(cleanup);
    return requestImpl(url, options);
  }

  return Object.freeze({
    request,
    publicSnapshot() {
      const observed = now(clock);
      prune(observed);
      return Object.freeze({
        schema: "outsider/uptimerobot-account-rate-limit-snapshot/v1",
        rollingWindowMs,
        maximumRequests,
        reservedCleanupRequests,
        ordinaryRequestLimit: ordinaryLimit,
        admittedInCurrentWindow: admittedAt.length,
        cleanupAdmittedInCurrentWindow: admittedAt.filter((item) =>
          item.cleanup).length,
        credentialProjected: false,
        requestTargetProjected: false,
      });
    },
  });
}

export const OUTSIDER_UPTIMEROBOT_ACCOUNT_RATE_LIMITER_V1_BOUNDARY
  = Object.freeze({
    rollingWindowMs: 60_000,
    maximumRequests: 10,
    reservedCleanupRequests: 2,
    ordinaryRequestLimit: 8,
    primaryAndRecoveryShareOneScheduler: true,
    admissionSerialized: true,
    requestReservedBeforeContact: true,
    credentialProjected: false,
    targetProjected: false,
  });
