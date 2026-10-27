/* Private account configuration and a one-action bridge to existing native
 * capacity adapters. Not another orchestrator: OutcomeProgram still owns
 * resource selection, parallel reservation, recovery and task fulfillment.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { createSeatsioCapacityAdapter } from "./outsider-seatsio-capacity-adapter.js";
import { createCalComSlotReservationAdapter } from "./outsider-calcom-slot-reservation-adapter.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce, withUserHeldExecutionLockV2 }
  from "./outsider-user-held-durable-execution-v2.js";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const PROVIDERS = Object.freeze({
  SEATSIO: { capability: "RESOURCE_SINGLE_OBJECT_HOLD", failureDomainRef: "seats.io",
    secretField: "seatsioWorkspaceSecretKey", sourceKind: "SEATSIO_API" },
  CALCOM: { capability: "RESOURCE_TIME_SLOT_HOLD", failureDomainRef: "cal.com",
    secretField: "calcomApiToken", sourceKind: "CALCOM_API" },
});
const digest = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const hashObject = value => digest(canonicalizeStrict(value));
const read = file => JSON.parse(readPrivateExecutionBytes(file));
function fail(code) {
  const error = new Error(`OUTSIDER_NATIVE_CAPACITY_${code}`); error.outsiderCode = code; throw error;
}
function privateDirectory(directory) {
  if (!path.isAbsolute(directory ?? "")) fail("DIRECTORY_INVALID");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) fail("DIRECTORY_NOT_PRIVATE");
  return realpathSync(directory);
}
function instant(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail("INSTANT_INVALID");
  return value;
}
const blocked = (code, resourceId = null, prerequisites = []) => ({ status: "BLOCKED",
  blockers: [{ code, resourceId, prerequisites }], externalCapacityEstablished: false,
  paymentPerformed: false, providerIoPerformed: false });

/** No account auto-creation and no public-demo credential inference. Credential
 * files are referenced relative to this private profile, never projected. */
export function loadNativeCapacityProductionProfile({ profileFile, runtimeDirectory,
  clock = () => new Date().toISOString(), fetchByProvider = {} } = {}) {
  if (!path.isAbsolute(profileFile ?? "")) fail("PROFILE_PATH_INVALID");
  if (!existsSync(profileFile)) return blocked("PRIVATE_NATIVE_CAPACITY_PROFILE_MISSING", null, [
    "SEATSIO: own sandbox workspace secret key, region, test event key, known seat label, scope reference",
    "OR CALCOM: owner-controlled test event type ID and scope reference; explicit PUBLIC_BUYER uses the documented default hold without a token",
    "A mode-0600 profile is required; authenticated access also requires a private credential file; no payment or seller outreach is needed by this loader",
  ]);
  const profileBytes = readPrivateExecutionBytes(profileFile); const profile = JSON.parse(profileBytes);
  if (profile?.schema !== "outsider/native-capacity-profile/v1" || !Array.isArray(profile.resources)
    || profile.resources.length < 1 || profile.resources.length > 8
    || new Set(profile.resources.map(row => row?.resourceId)).size !== profile.resources.length) fail("PROFILE_INVALID");
  const resources = [];
  for (const row of profile.resources) {
    if (!ID.test(row?.resourceId ?? "") || !Object.hasOwn(PROVIDERS, row.provider)
      || !HASH.test(row.permissionGrantHash ?? "") || row.scope?.ownerControlledTestResource !== true
      || !HASH.test(row.scope?.sourceRefHash ?? "") || !row.settings || typeof row.settings !== "object") fail("RESOURCE_CONFIG_INVALID");
    instant(row.scope.expiresAt);
    // Cal.com's documented default five-minute buyer hold is public. Owner
    // scope still comes from the explicit profile; no credential is invented.
    const publicBuyer = row.provider === "CALCOM" && row.accessMode === "PUBLIC_BUYER"
      && row.credentialFile === null;
    if (publicBuyer) {
      if (!Number.isSafeInteger(row.settings.eventTypeId) || row.settings.eventTypeId < 1)
        fail("CALCOM_OWNER_CONTROLLED_EVENT_TYPE_MISSING");
      resources.push({ row, credential: {} });
      continue;
    }
    if (typeof row.credentialFile !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/u.test(row.credentialFile)) fail("CREDENTIAL_REFERENCE_INVALID");
    const file = path.join(path.dirname(profileFile), row.credentialFile);
    if (!existsSync(file)) return blocked("PRIVATE_PROVIDER_CREDENTIAL_FILE_MISSING", row.resourceId, [PROVIDERS[row.provider].secretField]);
    const credential = read(file);
    if (credential.schema !== "outsider/native-capacity-credentials/v1"
      || typeof credential[PROVIDERS[row.provider].secretField] !== "string"
      || !credential[PROVIDERS[row.provider].secretField]) return blocked("SCOPED_PROVIDER_CREDENTIAL_MISSING", row.resourceId, [PROVIDERS[row.provider].secretField]);
    if (row.provider === "SEATSIO" && (!row.settings.region || !row.settings.eventKey || !row.settings.objectLabel
      || row.settings.sandboxWorkspace?.declaredSandbox !== true)) {
      return blocked("SEATSIO_SANDBOX_RESOURCE_MISSING", row.resourceId,
        ["region", "eventKey", "objectLabel", "sandboxWorkspace: declaredSandbox/workspaceRefHash/testScopeRefHash"]);
    }
    if (row.provider === "CALCOM" && (!Number.isSafeInteger(row.settings.eventTypeId) || row.settings.eventTypeId < 1)) {
      return blocked("CALCOM_OWNER_CONTROLLED_EVENT_TYPE_MISSING", row.resourceId, ["eventTypeId"]);
    }
    resources.push({ row, credential });
  }
  const root = privateDirectory(runtimeDirectory);
  const profileHash = digest(profileBytes);
  writePrivateExecutionRecordOnce(path.join(root, "profile-binding.json"), { profileHash });
  const adapters = {}; const descriptors = [];
  for (const { row, credential } of resources) {
    const provider = PROVIDERS[row.provider]; const injected = Object.hasOwn(fetchByProvider, row.provider);
    const options = { ...row.settings, directory: path.join(root, row.resourceId), adapterId: row.resourceId, clock,
      ...(injected ? { fetchImpl: fetchByProvider[row.provider] } : {}) };
    const native = row.provider === "SEATSIO"
      ? createSeatsioCapacityAdapter({ ...options, getWorkspaceSecretKey: async () => credential.seatsioWorkspaceSecretKey })
      : createCalComSlotReservationAdapter({ ...options, apiToken: credential.calcomApiToken });
    const sourceKind = injected ? "PROVIDER_FIXTURE" : provider.sourceKind;
    const boundContext = context => {
      if (context?.permissionGrantHash !== row.permissionGrantHash || !native.supports(context.requirement)) fail("RESOURCE_PERMISSION_OR_REQUIREMENT_MISMATCH");
      return context;
    };
    adapters[row.resourceId] = Object.freeze({ ...native,
      async reserve(context) {
        if (Date.parse(instant(clock())) >= Date.parse(row.scope.expiresAt)) fail("RESOURCE_SCOPE_EXPIRED");
        return { ...await native.reserve(boundContext(context)), sourceKind };
      },
      async reconcileReserve(context) {
        const result = await native.reconcileReserve(boundContext(context));
        // Cal.com's legacy reconcile can return its saved successful POST.
        // A production reconciliation must re-read that exact known UID.
        const current = result.status === "RESERVED" ? await native.readReservation({ reservation: result }) : result;
        return { ...current, sourceKind };
      },
      async discover(context = {}) { return { ...await native.discover(context), sourceKind }; },
      async readReservation(context) { return { ...await native.readReservation(context), sourceKind }; },
      async release(context) {
        if (context?.permissionGrantHash !== row.permissionGrantHash) fail("RESOURCE_PERMISSION_OR_REQUIREMENT_MISMATCH");
        return { ...await native.release(context), sourceKind };
      },
    });
    descriptors.push({ resourceId: row.resourceId, provider: row.provider, capability: provider.capability,
      failureDomainRef: provider.failureDomainRef, scopeExpiresAt: row.scope.expiresAt,
      sourceKind, operationalState: "NOT_OBSERVED", capacityReserved: false,
      providerObservationIndependent: false, serviceExecutionPromised: false });
  }
  return { status: "CONFIGURED", profileHash, adapters, resources: descriptors,
    externalCapacityEstablished: false, providerIoPerformed: false, paymentPerformed: false,
    recoveryBoundary: "REGISTER_WITH_ORIGINAL_OUTCOME_PROGRAM; MATCH_CAPABILITY_AND_RESOURCE_SEMANTICS; DIFFERENT_ACCOUNT_IS_NOT_INDEPENDENT_FAILURE_DOMAIN" };
}

/** One explicit verb per invocation. Original native one-use ledgers own effect
 * dedup/reconciliation. The durable context and reservation prevent a CLI
 * caller from supplying someone else's reservation UID to release(). */
export async function runNativeCapacityProductionAction({ profileFile, resourceId, directory,
  action, contextFile = null, start = null, end = null, clock, fetchByProvider } = {}) {
  if (!ID.test(resourceId ?? "") || !["discover", "reserve", "reconcile", "read", "release"].includes(action)) fail("ACTION_INVALID");
  const loaded = loadNativeCapacityProductionProfile({ profileFile, runtimeDirectory: directory, clock, fetchByProvider });
  if (loaded.status === "BLOCKED") return loaded;
  const adapter = loaded.adapters[resourceId]; if (!adapter) return blocked("RESOURCE_NOT_CONFIGURED", resourceId);
  const root = privateDirectory(directory); const prefix = path.join(root, resourceId);
  const contextPath = `${prefix}-context.json`; const reservationPath = `${prefix}-reservation.json`;
  let result; let readback = null;
  if (action === "discover") {
    result = await adapter.discover(adapter.providerRef === "cal.com" ? { start, end } : {});
  } else {
    if (action === "reserve") {
      if (!contextFile || !path.isAbsolute(contextFile)) fail("PRIVATE_OPERATION_CONTEXT_REQUIRED");
      const context = read(contextFile);
      writePrivateExecutionRecordOnce(contextPath, context);
      result = await adapter.reserve(context);
    } else {
      if (!existsSync(contextPath)) return blocked("ORIGINAL_OPERATION_CONTEXT_MISSING", resourceId);
      const context = read(contextPath);
      if (action === "reconcile") result = await adapter.reconcileReserve(context);
      else {
        // Repair a crash between native durable receipt and local handle save by
        // reconciling the original operation, never by accepting caller handles.
        if (!existsSync(reservationPath)) {
          const current = await adapter.reconcileReserve(context);
          if (current.status !== "RESERVED") return blocked("ORIGINAL_RESERVATION_UID_NOT_ESTABLISHED", resourceId);
          writePrivateExecutionRecordOnce(reservationPath, current);
        }
        const reservation = read(reservationPath);
        if (action === "read") result = await adapter.readReservation({ reservation });
        else {
          result = await adapter.release({ reservation, program: context.program,
            requirementId: context.requirement.requirementId,
            permissionGrantHash: context.permissionGrantHash,
            operationId: `${context.operationId}-release` });
          readback = await adapter.readReservation({ reservation });
        }
      }
    }
    if (["reserve", "reconcile"].includes(action) && result.status === "RESERVED" && !existsSync(reservationPath)) {
      writePrivateExecutionRecordOnce(reservationPath, result);
    }
  }
  const observedAt = (clock ?? (() => new Date().toISOString()))();
  const record = { schema: "outsider/native-capacity-action-receipt/v1", profileHash: loaded.profileHash,
    resourceId, action, observedAt, result, readback };
  const receiptFile = path.join(root, `action-${randomBytes(12).toString("hex")}.json`);
  writePrivateExecutionRecordOnce(receiptFile, record);
  const receiptHash = digest(readPrivateExecutionBytes(receiptFile));
  const sourceKind = loaded.resources.find(row => row.resourceId === resourceId).sourceKind;
  const releaseConfirmed = action === "release" && result.status === "RELEASED"
    && (readback?.status === "RELEASED" || readback?.reason === "RESERVATION_NOT_CURRENT");
  return { status: result.status, reason: result.reason ?? null, resourceId, action,
    ...(action === "discover" && Array.isArray(result.slots) ? { availableSlots: result.slots } : {}),
    observedAt, sourceKind, validUntil: result.validUntil ?? null, receiptHash,
    reservationRefHash: result.reservationId ? hashObject({ reservationId: result.reservationId }) : null,
    providerReceipt: result.providerReceipt ?? result.receipt ?? null,
    capacityOwned: ["reserve", "reconcile", "read"].includes(action) && result.status === "RESERVED",
    externalCapacityEstablished: sourceKind !== "PROVIDER_FIXTURE"
      && ["reserve", "reconcile", "read"].includes(action) && result.status === "RESERVED",
    releaseConfirmed, ambiguous: result.ambiguous === true, retryAllowed: result.retryAllowed ?? null,
    inventoryScope: "OWNER_CONTROLLED_TEST_RESOURCE_NOT_COMMERCIAL_SUPPLY",
    independentRecoveryEstablished: false, serviceExecutionPromised: false,
    providerIoPerformed: true, paymentPerformed: false };
}

/** Qualification of one owner time resource through the same native adapter.
 * A saved context always wins over new availability: restart cannot silently
 * acquire a second slot. This cycle qualifies capacity, not a booked service.
 */
export async function runNativeCapacityCycle(options = {}) {
  if (!path.isAbsolute(options.directory ?? "") || !ID.test(options.resourceId ?? ""))
    fail("CYCLE_DIRECTORY_OR_RESOURCE_INVALID");
  const root = privateDirectory(options.directory);
  return withUserHeldExecutionLockV2(hashObject({ kind: "NATIVE_CAPACITY_CYCLE", root,
    resourceId: options.resourceId }), () => runCapacityCycle({ ...options, directory: root }));
}

async function runCapacityCycle({ profileFile, resourceId, directory,
  start, end, slotDuration, clock = () => new Date().toISOString(), fetchByProvider } = {}) {
  const loaded = loadNativeCapacityProductionProfile({ profileFile, runtimeDirectory: directory, clock, fetchByProvider });
  if (loaded.status === "BLOCKED") return loaded;
  const profile = read(profileFile), resource = profile.resources.find(row => row.resourceId === resourceId);
  if (resource?.provider !== "CALCOM" || !Number.isSafeInteger(slotDuration) || slotDuration < 1)
    fail("CYCLE_REQUIRES_CALCOM_AND_SLOT_DURATION");
  const root = privateDirectory(directory), planFile = path.join(root, `${resourceId}-cycle-plan.json`);
  const resultFile = path.join(root, `${resourceId}-cycle-result.json`);
  const contextFile = path.join(root, `${resourceId}-cycle-context.json`);
  const options = { profileFile, resourceId, directory: root, clock, fetchByProvider };
  let plan;
  if (existsSync(planFile)) {
    plan = read(planFile);
    if (plan.profileHash !== loaded.profileHash || plan.slotDuration !== slotDuration
      || plan.resourceId !== resourceId) fail("CYCLE_BINDING_CHANGED");
    if (existsSync(resultFile)) {
      const result = read(resultFile);
      if (result.planHash !== hashObject(plan) || result.resourceId !== resourceId)
        fail("CYCLE_RESULT_BINDING_CHANGED");
      return result;
    }
  } else {
    const available = await runNativeCapacityProductionAction({ ...options, action: "discover", start, end });
    const candidate = available.availableSlots?.find(slot => Date.parse(slot.start) > Date.parse(clock())
      && Date.parse(slot.end) - Date.parse(slot.start) === slotDuration * 60000);
    if (available.status !== "OBSERVED" || !candidate) return { status: "UNAVAILABLE",
      reason: "NO_MATCHING_AVAILABLE_SLOT", discovery: available, paymentPerformed: false };
    const plannedAt = instant(clock());
    plan = { schema: "outsider/native-capacity-cycle-plan/v1", profileHash: loaded.profileHash,
      resourceId, slotDuration, slot: candidate, plannedAt,
      discoveryReceiptHash: available.receiptHash, permissionGrantHash: resource.permissionGrantHash };
    writePrivateExecutionRecordOnce(planFile, plan);
  }
  const context = { program: { programHash: hashObject(plan),
    formationDeadline: new Date(Date.parse(plan.plannedAt) + 3 * 60000).toISOString(),
    completionDeadline: new Date(Date.parse(plan.plannedAt) + 10 * 60000).toISOString() },
    requirement: { requirementId: resourceId, capability: "RESOURCE_TIME_SLOT_HOLD",
      constraints: { eventTypeId: resource.settings.eventTypeId, slotStart: plan.slot.start, slotDuration } },
    operationId: "capacity-cycle-reserve", permissionGrantHash: resource.permissionGrantHash };
  writePrivateExecutionRecordOnce(contextFile, context);
  const run = action => runNativeCapacityProductionAction({ ...options, action, contextFile });
  const reserved = await run("reserve");
  if (reserved.status !== "RESERVED") return { status: "UNAVAILABLE", reservation: reserved,
    planHash: hashObject(plan), paymentPerformed: false };
  // The original reservation is released even if a read fails. Provider write
  // ambiguity remains in its existing one-use ledger for exact reconciliation.
  let reconciled = null, observed = null, released;
  try { reconciled = await run("reconcile"); observed = await run("read"); }
  finally { released = await run("release"); }
  const result = { schema: "outsider/native-capacity-cycle-result/v1",
    status: reconciled.status === "RESERVED" && observed.status === "RESERVED" && released.releaseConfirmed
      ? "CAPACITY_LIFECYCLE_COMPLETE" : "CAPACITY_LIFECYCLE_INCOMPLETE",
    planHash: hashObject(plan), resourceId, slot: plan.slot, recordedAt: clock(),
    reserved, reconciled, observed, released, completeSupplyNetworkCommitted: false,
    bookingPerformed: false, paymentPerformed: false };
  writePrivateExecutionRecordOnce(resultFile, result);
  return result;
}
