/* Temporary capacity is a real task capability, not a meeting booking. The
 * original Node owns confirmation, queue and crash resume. Native adapters own
 * every provider effect. No lease is promoted to promised service delivery. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { loadNativeCapacityProductionProfile, runNativeCapacityProductionAction }
  from "./outsider-native-capacity-production.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce,
  withUserHeldExecutionLockV2 } from "./outsider-user-held-durable-execution-v2.js";

export const CAPACITY_TASK_FAMILY = "TEMPORARY_RESOURCE_HOLD_V1";
const digest = value => `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw Object.assign(new Error(code), { code: `CAPACITY_TASK_${code}` }); };
const write = writePrivateExecutionRecordOnce;

export function createCapacityTaskExtension(profileFile) {
  if (!path.isAbsolute(profileFile ?? "")) fail("PROFILE_REQUIRED");
  const profile = read(profileFile);
  if (profile.schema !== "outsider/capacity-task-profile/v1" || !path.isAbsolute(profile.nativeProfileFile ?? "")
    || !Number.isSafeInteger(profile.slotDurationMinutes) || profile.slotDurationMinutes < 1
    || !Number.isSafeInteger(profile.holdForSeconds) || profile.holdForSeconds < 5 || profile.holdForSeconds > 180
    || !Number.isFinite(Date.parse(profile.windowStart)) || !Number.isFinite(Date.parse(profile.windowEnd))
    || Date.parse(profile.windowStart) >= Date.parse(profile.windowEnd)
    || profile.financialMode !== "SIMULATION_ONLY") fail("PROFILE_INVALID");
  // Bind the private profile bytes now; later task resumes cannot adopt a new
  // account/owner/window through a mutable path.
  const nativeProfileHash = `sha256:${createHash("sha256").update(readPrivateExecutionBytes(profile.nativeProfileFile)).digest("hex")}`;
  return { taskFamily: CAPACITY_TASK_FAMILY, profile: { ...profile, nativeProfileHash },
    description: `Temporarily hold one configured owner resource time slot of ${profile.slotDurationMinutes} minutes within ${profile.windowStart} to ${profile.windowEnd}, keep the native hold for ${profile.holdForSeconds} seconds with provider readbacks, then release it. No meeting booking, invitation, actual service, purchase, capital guarantee, or independent recovery supply. Only this window and duration are supported.`,
    createSession: createCapacityTaskSession };
}

export function createCapacityTaskSession({ directory, input, registration, dependencies = {} }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = name => path.join(directory, `${name}.json`);
  const runtime = input.productionInput.runtimeDirectory;
  mkdirSync(runtime, { recursive: true, mode: 0o700 });
  const rfile = name => path.join(runtime, `${name}.json`);
  const clock = dependencies.clock ?? (() => new Date().toISOString());
  const wait = dependencies.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const runAction = dependencies.runCapacityAction ?? runNativeCapacityProductionAction;
  const profile = registration.profile;
  const request = read(input.productionInput.requestFile);
  if (digest(request) !== registration.requestHash) fail("REQUEST_BINDING_CHANGED");
  write(file("family-binding"), { registrationHash: digest(registration), inputHash: digest(input) });
  const lock = action => withUserHeldExecutionLockV2(digest({ directory, family: CAPACITY_TASK_FAMILY }), action);
  const cancelled = () => existsSync(file("cancel-request"));
  const actionOptions = candidate => ({ profileFile: profile.nativeProfileFile,
    resourceId: candidate.resourceId, directory: path.join(runtime, candidate.candidateId),
    clock, ...(dependencies.fetchByProvider ? { fetchByProvider: dependencies.fetchByProvider } : {}) });
  function currentProfile() {
    const hash = `sha256:${createHash("sha256").update(readPrivateExecutionBytes(profile.nativeProfileFile)).digest("hex")}`;
    if (hash !== profile.nativeProfileHash) fail("NATIVE_PROFILE_CHANGED");
    return read(profile.nativeProfileFile);
  }
  function inspect() {
    const preparation = existsSync(file("preparation")) ? read(file("preparation")) : null;
    const confirmation = existsSync(file("confirmation")) ? read(file("confirmation")) : null;
    const result = existsSync(file("result")) ? read(file("result")) : null;
    const allocation = existsSync(rfile("allocation")) ? read(rfile("allocation")) : null;
    const started = existsSync(file("execution-started"));
    if (preparation) {
      const { preparationHash, ...body } = preparation;
      if (preparationHash !== digest(body) || preparation.registrationHash !== digest(registration)) fail("PREPARATION_CHANGED");
    }
    if (confirmation && (!preparation || confirmation.programHash !== preparation.programHash
      || confirmation.preparationHash !== preparation.preparationHash)) fail("CONFIRMATION_CHANGED");
    return { schema: "outsider/capacity-task-status/v1", taskFamily: CAPACITY_TASK_FAMILY,
      state: result?.state ?? (cancelled() ? "CANCELLING" : allocation ? "HOLDING" : started ? "FORMING"
        : confirmation ? "CONFIRMED" : preparation ? "PROPOSED" : "NEW"),
      confirmed: Boolean(confirmation), terminal: Boolean(result), executionStarted: started,
      preparationHash: preparation?.preparationHash ?? null, programHash: preparation?.programHash ?? null,
      proposal: preparation ? { outcome: { statement: request.goal,
        budget: { currency: "USD", maximumAmountMinor: "0" },
        acceptance: [ { criterionId: "native_capacity", subject: "native capacity", comparator: "EQ", expected: "PROVIDER_RESERVED_AND_READ_BACK" },
          { criterionId: "hold_seconds", subject: "hold window seconds", comparator: "GTE", expected: profile.holdForSeconds },
          { criterionId: "resource_released", subject: "provider-confirmed cleanup", comparator: "EQ", expected: true } ] },
        candidates: preparation.candidates.map(({ resourceId, slot, provider }) => ({ resourceId, slot, provider })),
        formationDeadline: preparation.program.formationDeadline, completionDeadline: request.completionDeadline,
        resourceRoles: [{ requirementId: "temporary_owner_capacity", role: "PRIMARY", capability: "RESOURCE_TIME_SLOT_HOLD" }],
        confirmationRequired: true, serviceBookingIncluded: false, independentRecoveryIncluded: false,
        financialMode: "SIMULATION_ONLY", maximumRealChargeMinor: "0" } : null,
      capacity: allocation ? { resourceId: allocation.candidate.resourceId, slot: allocation.candidate.slot,
        holdUntil: allocation.holdUntil, providerValidUntil: allocation.reserved.validUntil,
        reservationRefHash: allocation.reserved.reservationRefHash } : null,
      actualDelivery: result, cancellationRequested: cancelled(),
      financialMode: "SIMULATION_ONLY", paymentAuthorized: false, realMoneyMoved: false,
      completeTemporarySupplyNetworkCommitted: false, commercialGuaranteeCreated: false };
  }
  async function execute(preparation) {
    currentProfile();
    if (!existsSync(rfile("allocation"))) {
      for (const candidate of preparation.candidates) {
        if (cancelled() || Date.parse(clock()) >= Date.parse(preparation.program.formationDeadline)) break;
        const options = actionOptions(candidate);
        mkdirSync(options.directory, { recursive: true, mode: 0o700 });
        const contextFile = path.join(options.directory, "context.json");
        write(contextFile, { program: preparation.program,
          requirement: { requirementId: candidate.resourceId, capability: "RESOURCE_TIME_SLOT_HOLD",
            constraints: { eventTypeId: candidate.eventTypeId, slotStart: candidate.slot.start,
              slotDuration: profile.slotDurationMinutes } },
          operationId: "capacity-task-reserve", permissionGrantHash: candidate.permissionGrantHash });
        const reserved = await runAction({ ...options, action: "reserve", contextFile });
        if (reserved.ambiguous) fail("RESERVATION_UNKNOWN_RECONCILE_REQUIRED");
        if (reserved.status !== "RESERVED") continue;
        const startedAt = clock(), holdUntil = new Date(Date.parse(startedAt) + profile.holdForSeconds * 1000).toISOString();
        write(rfile("allocation"), { candidate, reserved, startedAt, holdUntil,
          canCoverWindow: Date.parse(reserved.validUntil) > Date.parse(holdUntil) + 5000
            && Date.parse(preparation.program.completionDeadline) > Date.parse(holdUntil) + 1000 });
        break;
      }
    }
    if (!existsSync(rfile("allocation"))) return { state: cancelled() ? "CANCELLED" : "UNAVAILABLE",
      reason: "NO_NATIVE_CAPACITY_ALLOCATED", cleanupComplete: true, completedAt: clock() };
    const allocation = read(rfile("allocation"));
    const options = actionOptions(allocation.candidate);
    const observations = path.join(runtime, "observations"); mkdirSync(observations, { mode: 0o700, recursive: true });
    let failed = !allocation.canCoverWindow;
    if (!existsSync(rfile("hold-finished"))) {
      try {
        while (!failed && !cancelled()) {
          const observed = await runAction({ ...options, action: "read" });
          write(path.join(observations, `${String(readdirSync(observations).length + 1).padStart(6, "0")}.json`), observed);
          if (observed.status !== "RESERVED") { failed = true; break; }
          const remaining = Date.parse(allocation.holdUntil) - Date.parse(clock());
          if (remaining <= 0) break;
          // Small interruptible chunks allow cancellation; only actual readbacks
          // count as observations, not wall-clock waiting or a provider ACK.
          const nextRead = Date.parse(clock()) + Math.min(15000, remaining);
          while (!cancelled() && Date.parse(clock()) < nextRead) await wait(Math.min(1000, nextRead - Date.parse(clock())));
        }
        write(rfile("hold-finished"), { state: cancelled() ? "CANCELLED" : failed ? "FAILED" : "SUCCEEDED",
          reason: failed ? "HOLD_NOT_OBSERVED_THROUGH_REQUESTED_WINDOW" : null, recordedAt: clock() });
      } catch (error) {
        // Cleanup still runs, then propagate the original error. A crash (as
        // opposed to a caught exception) keeps the same allocation for resume.
        const released = await runAction({ ...options, action: "release" });
        if (released.releaseConfirmed) write(rfile("released-after-error"), released);
        throw error;
      }
    }
    if (!existsSync(rfile("released"))) {
      const released = await runAction({ ...options, action: "release" });
      if (!released.releaseConfirmed) fail("CLEANUP_OPEN");
      write(rfile("released"), released);
    }
    const finish = read(rfile("hold-finished"));
    return { ...finish, state: finish.state, resourceId: allocation.candidate.resourceId,
      slot: allocation.candidate.slot, holdStartedAt: allocation.startedAt, holdUntil: allocation.holdUntil,
      observationCount: readdirSync(observations).length, releaseReceiptHash: read(rfile("released")).receiptHash,
      cleanupComplete: true, completedAt: clock(), bookingPerformed: false,
      independentOutcomeVerified: false, completeTemporarySupplyNetworkCommitted: false };
  }
  return Object.freeze({ inspect, status: inspect,
    prepare: () => lock(async () => {
      if (!existsSync(file("preparation"))) {
        if (Date.parse(clock()) + (profile.holdForSeconds + 10) * 1000 >= Date.parse(request.completionDeadline)) fail("DEADLINE_TOO_SHORT");
        const native = currentProfile();
        const loaded = loadNativeCapacityProductionProfile({ profileFile: profile.nativeProfileFile,
          runtimeDirectory: path.join(runtime, "discovery"), clock, fetchByProvider: dependencies.fetchByProvider });
        if (loaded.status !== "CONFIGURED") fail("NATIVE_PROFILE_NOT_CONFIGURED");
        const results = await Promise.all(native.resources.filter(row => row.provider === "CALCOM").map(async row => {
          if (Date.parse(row.scope.expiresAt) <= Date.parse(request.completionDeadline)) return [];
          const discovered = await loaded.adapters[row.resourceId].discover({ start: profile.windowStart, end: profile.windowEnd });
          if (discovered.status !== "OBSERVED") return [];
          return discovered.slots.filter(slot => Date.parse(slot.start) > Date.parse(clock())
            && Date.parse(slot.end) - Date.parse(slot.start) === profile.slotDurationMinutes * 60000).slice(0, 3)
            .map(slot => ({ resourceId: row.resourceId, eventTypeId: row.settings.eventTypeId,
              provider: row.provider, slot, permissionGrantHash: row.permissionGrantHash,
              discoveryReceiptHash: discovered.providerReceipt, candidateId: `candidate-${digest({ resourceId: row.resourceId, slot }).slice(7, 23)}` }));
        }));
        const candidates = results.flat().sort((a, b) => a.slot.start.localeCompare(b.slot.start));
        if (!candidates.length) fail("NO_AVAILABLE_CAPACITY");
        const body = { taskFamily: CAPACITY_TASK_FAMILY, requestHash: registration.requestHash,
          profileHash: digest(profile), candidates, preparedAt: clock() };
        const programHash = digest(body);
        const program = { programHash, formationDeadline: new Date(Math.min(Date.parse(clock()) + 120000,
          Date.parse(request.completionDeadline) - (profile.holdForSeconds + 10) * 1000)).toISOString(),
          completionDeadline: request.completionDeadline };
        const preparation = { ...body, programHash, program, registrationHash: digest(registration) };
        write(file("preparation"), { ...preparation, preparationHash: digest(preparation) });
      }
      return inspect();
    }),
    confirm: hashes => lock(async () => {
      const status = inspect();
      if (!status.preparationHash || !hashes || Object.keys(hashes).sort().join(",") !== "preparationHash,programHash"
        || hashes.preparationHash !== status.preparationHash || hashes.programHash !== status.programHash) fail("CONFIRMATION_MISMATCH");
      if (!existsSync(file("confirmation"))) write(file("confirmation"), { ...hashes, confirmedAt: clock() });
      return inspect();
    }),
    requestCancellation: async () => {
      if (!inspect().terminal && !cancelled()) write(file("cancel-request"), { requestedAt: clock(), reason: "OWNER_REQUESTED" });
      return inspect();
    },
    runConfirmed: () => lock(async () => {
      const status = inspect(); if (!status.confirmed) fail("CONFIRMATION_REQUIRED");
      if (status.terminal) return status;
      if (!status.executionStarted) write(file("execution-started"), { startedAt: clock(), programHash: status.programHash });
      const result = await execute(read(file("preparation")));
      write(file("result"), { ...result, financialMode: "SIMULATION_ONLY", realMoneyMoved: false,
        commercialGuaranteeCreated: false });
      return inspect();
    }),
  });
}
