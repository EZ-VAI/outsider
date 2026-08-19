/* Signed, provider-neutral live checkpoint monitor. It observes and coordinates;
 * every execution decision remains with the provider-local Outsider controller. */

import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync,
  writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict, sha256 } from "./canonical.js";
import { verifyFederatedWayCheckpoint,
  verifyFederationTrustStore } from "./outsider-federation.js";
import { createFederatedTaskSupervisionRecord, taskFromFederatedPlan,
  verifyFederatedTaskPlan } from "./outsider-federation-plan.js";

const SCHEMA = "outsider/federation-monitor-ledger/v1";
const SNAPSHOT_SCHEMA = "outsider/federation-monitor-snapshot/v1";
const HASH = /^sha256:[a-f0-9]{64}$/;

const addressed = (body) => Object.freeze({ ...body, recordHash: sha256(body) });

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) {
    throw new Error("FEDERATION_MONITOR_SYMLINK_REFUSED");
  }
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

function readJson(file) {
  if (lstatSync(file).isSymbolicLink()) throw new Error("FEDERATION_MONITOR_SYMLINK_REFUSED");
  return JSON.parse(readFileSync(file, "utf8"));
}

function chainKey(payload) {
  return sha256({ caseRef: payload.caseRef, operatorKeyId: payload.operatorKeyId,
    instrumentHash: payload.instrument.instrumentHash,
    wayHash: payload.wayHash, runRefHash: payload.runRefHash });
}

function checkpointFile(directory, hash) {
  if (!HASH.test(String(hash ?? ""))) throw new Error("FEDERATION_MONITOR_HASH_INVALID");
  return path.join(directory, "checkpoints", `${hash.slice("sha256:".length)}.json`);
}

function ledgerRecord({ trustStore, taskPlan, monitorId, maxSilenceMs, entries, head }) {
  return addressed({ schema: SCHEMA, monitorId, trustStoreHash: trustStore.recordHash,
    taskPlanHash: taskPlan?.recordHash ?? null,
    policyHash: sha256({ maxSilenceMs }), maxSilenceMs, entries, head,
    authority: { globalExecutionAuthority: false, localControllersRetainAuthority: true,
      permitsPricing: false, permitsSettlement: false, movesFunds: false } });
}

export class DurableGlobalOutsiderMonitor {
  constructor({ directory, trustStore, monitorId = "global-outsider-monitor",
    maxSilenceMs = 15 * 60_000, taskPlan = null } = {}) {
    if (!directory || typeof directory !== "string"
      || !verifyFederationTrustStore(trustStore).ok
      || (taskPlan != null && !verifyFederatedTaskPlan(taskPlan, trustStore).ok)
      || !Number.isSafeInteger(maxSilenceMs) || maxSilenceMs < 1_000) {
      throw new Error("FEDERATION_MONITOR_CONFIG_INVALID");
    }
    this.directory = path.resolve(directory); this.trustStore = trustStore;
    this.taskPlan = taskPlan;
    this.monitorId = monitorId; this.maxSilenceMs = maxSilenceMs;
    this.entries = []; this.chains = new Map(); this.taskChains = new Map(); this.head = null;
    mkdirSync(path.join(this.directory, "checkpoints"), { recursive: true, mode: 0o700 });
    this.ledgerFile = path.join(this.directory, "federation-monitor.json");
    this.taskPlanFile = path.join(this.directory, "federation-task-plan.json");
    if (taskPlan != null) {
      if (existsSync(this.taskPlanFile)) {
        const diskPlan = readJson(this.taskPlanFile);
        if (diskPlan.recordHash !== taskPlan.recordHash
          || !verifyFederatedTaskPlan(diskPlan, trustStore).ok) {
          throw new Error("FEDERATION_MONITOR_TASK_PLAN_DRIFT");
        }
      } else atomicJson(this.taskPlanFile, taskPlan);
    } else if (existsSync(this.taskPlanFile)) {
      throw new Error("FEDERATION_MONITOR_TASK_PLAN_REQUIRED");
    }
    if (existsSync(this.ledgerFile)) this.#restore(readJson(this.ledgerFile));
    else atomicJson(this.ledgerFile, ledgerRecord(this));
  }

  #validateNext(checkpoint, checked) {
    const payload = checked.payload, key = chainKey(payload), prior = this.chains.get(key);
    if (this.taskPlan != null) {
      const binding = payload.taskBinding;
      const task = taskFromFederatedPlan(this.taskPlan, binding?.taskId);
      if (!task || binding?.planHash !== this.taskPlan.recordHash
        || task.owner.operatorKeyId !== payload.operatorKeyId
        || task.owner.instrumentHash !== payload.instrument.instrumentHash
        || task.owner.wayHash !== payload.wayHash) {
        throw new Error("FEDERATION_MONITOR_TASK_BINDING_INVALID");
      }
      const assigned = this.taskChains.get(task.taskId);
      if (assigned && assigned.chainKeyHash !== key) {
        throw new Error("FEDERATION_MONITOR_TASK_RUN_FORK");
      }
      if (!prior) {
        const dependencies = task.dependencyTaskIds.map((taskId) =>
          this.taskChains.get(taskId)?.deliveryCheckpoint).filter(Boolean);
        const ready = dependencies.length === task.dependencyTaskIds.length
          && dependencies.every((item) => item.signedCheckpoint.payload.status
            === "DELIVERY_READY"
            && HASH.test(String(item.signedCheckpoint.payload.commitments.outputArtifactHash)));
        const expectedHashes = dependencies.map((item) => item.recordHash).sort();
        const deliveredArtifacts = dependencies.map((item) =>
          item.signedCheckpoint.payload.commitments.outputArtifactHash).sort();
        if (!ready || canonicalizeStrict(binding.dependencyCheckpointHashes)
          !== canonicalizeStrict(expectedHashes)
          || (task.expectedInputArtifactHashes.length > 0
            && canonicalizeStrict(task.expectedInputArtifactHashes)
              !== canonicalizeStrict(deliveredArtifacts))) {
          throw new Error("FEDERATION_MONITOR_TASK_DEPENDENCIES_UNSATISFIED");
        }
      } else if (canonicalizeStrict(binding)
        !== canonicalizeStrict(prior.checkpoint.signedCheckpoint.payload.taskBinding)) {
        throw new Error("FEDERATION_MONITOR_TASK_BINDING_CHANGED");
      }
    }
    if (!prior) {
      if (payload.checkpointSeq !== 0 || payload.previousCheckpointHash !== null) {
        throw new Error("FEDERATION_MONITOR_CHAIN_START_INVALID");
      }
    } else {
      const previous = prior.checkpoint.signedCheckpoint.payload;
      if (previous.status === "TERMINATED"
        || payload.checkpointSeq !== previous.checkpointSeq + 1
        || payload.previousCheckpointHash !== prior.checkpoint.recordHash
        || Date.parse(payload.observedAt) < Date.parse(previous.observedAt)
        || payload.progress.toolBoundaries < previous.progress.toolBoundaries
        || payload.progress.agentsObserved < previous.progress.agentsObserved) {
        throw new Error("FEDERATION_MONITOR_CHAIN_TRANSITION_INVALID");
      }
    }
    return { key, prior };
  }

  #appendVerified(checkpoint, expectedEntry = null) {
    const checked = verifyFederatedWayCheckpoint(checkpoint, this.trustStore);
    if (!checked.ok) {
      throw new Error(`FEDERATION_MONITOR_CHECKPOINT_INVALID:${checked.failures.join("|")}`);
    }
    const { key } = this.#validateNext(checkpoint, checked);
    const body = { seq: this.entries.length, checkpointHash: checkpoint.recordHash,
      chainKeyHash: key, previousEntryHash: this.head };
    const entry = Object.freeze({ ...body, entryHash: sha256(body) });
    if (expectedEntry && canonicalizeStrict(entry) !== canonicalizeStrict(expectedEntry)) {
      throw new Error("FEDERATION_MONITOR_LEDGER_CHAIN_INVALID");
    }
    this.entries.push(entry); this.head = entry.entryHash;
    this.chains.set(key, { checkpoint, entry });
    const taskId = checked.payload.taskBinding?.taskId;
    if (taskId) {
      const old = this.taskChains.get(taskId);
      this.taskChains.set(taskId, { checkpoint, entry, chainKeyHash: key,
        deliveryCheckpoint: checked.payload.status === "DELIVERY_READY"
          ? checkpoint : old?.deliveryCheckpoint ?? null });
    }
    return entry;
  }

  #restore(record) {
    const { recordHash, ...body } = record ?? {};
    if (record?.schema !== SCHEMA || recordHash !== sha256(body)
      || record.monitorId !== this.monitorId
      || record.trustStoreHash !== this.trustStore.recordHash
      || record.taskPlanHash !== (this.taskPlan?.recordHash ?? null)
      || record.policyHash !== sha256({ maxSilenceMs: this.maxSilenceMs })
      || record.maxSilenceMs !== this.maxSilenceMs || !Array.isArray(record.entries)) {
      throw new Error("FEDERATION_MONITOR_LEDGER_INVALID");
    }
    for (const entry of record.entries) {
      const file = checkpointFile(this.directory, entry.checkpointHash);
      if (!existsSync(file)) throw new Error("FEDERATION_MONITOR_CHECKPOINT_MISSING");
      this.#appendVerified(readJson(file), entry);
    }
    if (this.head !== record.head) throw new Error("FEDERATION_MONITOR_HEAD_INVALID");
  }

  append(checkpoint) {
    const checked = verifyFederatedWayCheckpoint(checkpoint, this.trustStore);
    if (!checked.ok) {
      throw new Error(`FEDERATION_MONITOR_CHECKPOINT_INVALID:${checked.failures.join("|")}`);
    }
    const existing = this.entries.find((entry) => entry.checkpointHash === checkpoint.recordHash);
    if (existing) return Object.freeze({ appended: false, reason: "DUPLICATE_CHECKPOINT_HASH" });
    const transition = this.#validateNext(checkpoint, checked);
    const body = { seq: this.entries.length, checkpointHash: checkpoint.recordHash,
      chainKeyHash: transition.key, previousEntryHash: this.head };
    const entry = Object.freeze({ ...body, entryHash: sha256(body) });
    atomicJson(checkpointFile(this.directory, checkpoint.recordHash), checkpoint);
    const nextEntries = [...this.entries, entry];
    atomicJson(this.ledgerFile, ledgerRecord({ ...this, entries: nextEntries,
      head: entry.entryHash }));
    this.entries.push(entry); this.head = entry.entryHash;
    this.chains.set(transition.key, { checkpoint, entry });
    const taskId = checked.payload.taskBinding?.taskId;
    if (taskId) {
      const old = this.taskChains.get(taskId);
      this.taskChains.set(taskId, { checkpoint, entry,
        chainKeyHash: transition.key,
        deliveryCheckpoint: checked.payload.status === "DELIVERY_READY"
          ? checkpoint : old?.deliveryCheckpoint ?? null });
    }
    return Object.freeze({ appended: true, seq: entry.seq, entryHash: entry.entryHash,
      chainKeyHash: transition.key });
  }

  snapshot({ now = new Date().toISOString() } = {}) {
    if (typeof now !== "string" || !Number.isFinite(Date.parse(now))) {
      throw new Error("FEDERATION_MONITOR_NOW_INVALID");
    }
    const at = Date.parse(now), ways = [], alerts = [];
    for (const [key, value] of [...this.chains.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const payload = value.checkpoint.signedCheckpoint.payload;
      const ageMs = Math.max(0, at - Date.parse(payload.observedAt));
      let coordination = "LOCAL_CONTROLLER_ACTIVE";
      if (payload.status === "BLOCKED") {
        alerts.push({ code: "WAY_REPORTED_BLOCKED", chainKeyHash: key,
          checkpointHash: value.checkpoint.recordHash });
        coordination = "REVIEW_LOCAL_BLOCKER";
      } else if (!["DELIVERY_READY", "TERMINATED"].includes(payload.status)
        && ageMs > this.maxSilenceMs) {
        alerts.push({ code: "WAY_CHECKPOINT_STALE", chainKeyHash: key,
          checkpointHash: value.checkpoint.recordHash });
        coordination = "CHECK_PROVIDER_LIVENESS";
      } else if (payload.status === "DELIVERY_READY") {
        coordination = "READY_FOR_BILATERAL_HANDOFF";
      } else if (payload.status === "TERMINATED") coordination = "TERMINAL";
      ways.push({ chainKeyHash: key, checkpointHash: value.checkpoint.recordHash,
        operatorKeyId: payload.operatorKeyId, tenantHash: payload.tenantHash,
        instrumentHash: payload.instrument.instrumentHash, wayHash: payload.wayHash,
        runRefHash: payload.runRefHash, checkpointSeq: payload.checkpointSeq,
        status: payload.status, observedAt: payload.observedAt, ageMs,
        progress: payload.progress, coordination });
    }
    const tasks = this.taskPlan == null ? [] : this.taskPlan.signedPlan.payload.tasks
      .map((task) => {
        const state = this.taskChains.get(task.taskId), checkpoint = state?.checkpoint;
        const dependenciesReady = task.dependencyTaskIds.every((taskId) => {
          const dependency = this.taskChains.get(taskId)?.deliveryCheckpoint;
          return dependency?.signedCheckpoint?.payload?.status === "DELIVERY_READY";
        });
        const status = checkpoint?.signedCheckpoint?.payload?.status ?? "NOT_STARTED";
        return { taskId: task.taskId, ordinal: task.ordinal, owner: task.owner,
          dependencyTaskIds: task.dependencyTaskIds, requiredClaim: task.requiredClaim,
          checkpointHash: checkpoint?.recordHash ?? null, status,
          coordination: checkpoint ? (status === "BLOCKED" ? "REVIEW_LOCAL_BLOCKER"
            : status === "DELIVERY_READY" ? "READY_FOR_DEPENDENTS"
              : status === "TERMINATED" ? "TERMINAL" : "LOCAL_CONTROLLER_ACTIVE")
            : dependenciesReady ? "READY_TO_START" : "WAITING_FOR_DEPENDENCIES" };
      });
    return addressed({ schema: SNAPSHOT_SCHEMA, monitorId: this.monitorId,
      observedAt: now, trustStoreHash: this.trustStore.recordHash,
      taskPlanHash: this.taskPlan?.recordHash ?? null,
      ledgerHead: this.head, ways, tasks, alerts,
      summary: { ways: ways.length, blocked: ways.filter((way) => way.status === "BLOCKED").length,
        stale: alerts.filter((alert) => alert.code === "WAY_CHECKPOINT_STALE").length,
        deliveryReady: ways.filter((way) => way.status === "DELIVERY_READY").length,
        terminated: ways.filter((way) => way.status === "TERMINATED").length,
        ...(this.taskPlan == null ? {} : { plannedTasks: tasks.length,
          readyTasks: tasks.filter((task) => task.coordination === "READY_TO_START").length,
          waitingTasks: tasks.filter((task) => task.coordination
            === "WAITING_FOR_DEPENDENCIES").length }) },
      claimBoundary: { liveProviderStatusObserved: true,
        globalExecutionOrCorrectionAuthority: false,
        providerLocalControllersRetainAuthority: true,
        establishesOutcome: false, establishesLossOrLiability: false,
        institutionalIndependenceEstablished: false },
      authority: { mode: "OBSERVATION_AND_COORDINATION_ONLY",
        permitsPricing: false, permitsSettlement: false, movesFunds: false } });
  }

  supervision({ now = new Date().toISOString() } = {}) {
    if (this.taskPlan == null) throw new Error("FEDERATION_MONITOR_TASK_PLAN_REQUIRED");
    return createFederatedTaskSupervisionRecord({ taskPlan: this.taskPlan,
      snapshot: this.snapshot({ now }), trustStore: this.trustStore });
  }

  verify() {
    try {
      const reopened = new DurableGlobalOutsiderMonitor({ directory: this.directory,
        trustStore: this.trustStore, monitorId: this.monitorId,
        maxSilenceMs: this.maxSilenceMs, taskPlan: this.taskPlan });
      return Object.freeze({ ok: reopened.entries.length === this.entries.length
        && reopened.head === this.head, entries: reopened.entries.length,
      head: reopened.head, failures: [] });
    } catch (error) {
      return Object.freeze({ ok: false, entries: 0, head: null,
        failures: [error?.message ?? String(error)] });
    }
  }
}
