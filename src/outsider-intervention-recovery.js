import { randomUUID } from "node:crypto";

export const INTERVENTION_RECOVERY_SCHEMA = "outsider/intervention-recovery-journal/v1";
export const INTERVENTION_RECOVERY_FILE = "intervention-recovery.json";

const PHASES = new Set([
  "paused",
  "judge-running",
  "judge-complete",
  "delivery-pending",
  "delivery-recorded",
  "delivery-observed",
  "effect-observed",
  "resolved",
]);

const clone = (value) => structuredClone(value);
const nowIso = () => new Date().toISOString();

function required(value, label) {
  if (value == null || String(value).trim() === "") {
    throw new Error(`INTERVENTION_RECOVERY_${label}_REQUIRED`);
  }
  return String(value);
}

function positiveGeneration(value) {
  const generation = Number(value);
  if (!Number.isInteger(generation) || generation < 1) {
    throw new Error("INTERVENTION_RECOVERY_GENERATION_INVALID");
  }
  return generation;
}

function nonempty(value) {
  return typeof value === "string" && value.trim() !== "";
}

function assertRecord(id, record) {
  if (!record || record.schema !== "outsider/recoverable-intervention/v1"
    || record.interventionId !== id || !PHASES.has(record.phase)
    || !nonempty(record.agentId) || !nonempty(record.trigger) || !nonempty(record.boundary)
    || !Number.isInteger(record.attempt) || record.attempt < 1) {
    throw new Error(`INTERVENTION_RECOVERY_RECORD_INVALID:${id}`);
  }
  if (record.authority != null
    && (!nonempty(record.authority.hash) || !nonempty(record.authority.ref)
      || !Number.isInteger(record.authority.draft) || record.authority.draft < 1)) {
    throw new Error(`INTERVENTION_RECOVERY_AUTHORITY_INVALID:${id}`);
  }
  if (!Array.isArray(record.authorityHistory)
    || record.authorityHistory.some((authority) => !nonempty(authority?.hash)
      || !nonempty(authority?.ref) || !Number.isInteger(authority?.draft) || authority.draft < 1
      || !nonempty(authority?.rejectedBy?.resultHash)
      || !nonempty(authority?.rejectedBy?.resultRef)
      || !nonempty(authority?.rejectedBy?.logicalOperationId)
      || !nonempty(authority?.supersededByHash))) {
    throw new Error(`INTERVENTION_RECOVERY_AUTHORITY_HISTORY_INVALID:${id}`);
  }
  if (["judge-running", "judge-complete"].includes(record.phase)) {
    const judge = record.judge;
    const expectedStatus = record.phase === "judge-running" ? "running" : "complete";
    if (!judge || judge.status !== expectedStatus || !nonempty(judge.logicalOperationId)
      || !nonempty(judge.kind) || !nonempty(judge.inputHash) || !nonempty(judge.inputRef)
      || !nonempty(judge.ownerId) || !Number.isInteger(judge.generation) || judge.generation < 1
      || !Number.isInteger(judge.executionAttempt) || judge.executionAttempt < 1
      || (judge.authorityHash != null && (record.phase === "judge-running"
        ? judge.authorityHash !== record.authority?.hash
        : judge.authorityHash !== record.authority?.hash
          && !record.authorityHistory.some((authority) => authority.hash === judge.authorityHash)))
      || (expectedStatus === "complete"
        && (!nonempty(judge.resultHash) || !nonempty(judge.resultRef)))) {
      throw new Error(`INTERVENTION_RECOVERY_JUDGE_INVALID:${id}`);
    }
  }
  if (["delivery-pending", "delivery-recorded", "delivery-observed",
    "effect-observed", "resolved"].includes(record.phase)) {
    const delivery = record.delivery;
    const allowed = record.phase === "delivery-pending" ? ["pending"]
      : record.phase === "delivery-recorded" ? ["recorded"] : ["observed"];
    if (!delivery || !allowed.includes(delivery.status) || !record.authority
      || delivery.authorityHash !== record.authority.hash
      || !nonempty(delivery.correctionHash) || !nonempty(delivery.marker)
      || !nonempty(delivery.payloadRef)
      || (delivery.status !== "pending"
        && (!Number.isInteger(delivery.emittedSeq) || delivery.emittedSeq < 1))
      || (delivery.status === "observed"
        && (!Number.isInteger(delivery.observedSeq)
          || delivery.observedSeq <= delivery.emittedSeq))) {
      throw new Error(`INTERVENTION_RECOVERY_DELIVERY_INVALID:${id}`);
    }
  }
  if (["effect-observed", "resolved"].includes(record.phase)
    && (record.effect?.observed !== true || !Number.isInteger(record.effect.seq)
      || record.effect.seq <= record.delivery.observedSeq)) {
    throw new Error(`INTERVENTION_RECOVERY_EFFECT_INVALID:${id}`);
  }
}

function assertJournal(value, store) {
  if (!value || value.schema !== INTERVENTION_RECOVERY_SCHEMA) {
    throw new Error("INTERVENTION_RECOVERY_JOURNAL_SCHEMA_INVALID");
  }
  if (value.runId !== store.runId || value.contractSeal !== store.contract?.seal) {
    throw new Error("INTERVENTION_RECOVERY_JOURNAL_IDENTITY_MISMATCH");
  }
  if (!Number.isInteger(value.revision) || value.revision < 0
    || !value.interventions || Array.isArray(value.interventions)
    || typeof value.interventions !== "object") {
    throw new Error("INTERVENTION_RECOVERY_JOURNAL_SHAPE_INVALID");
  }
  for (const [id, record] of Object.entries(value.interventions)) {
    assertRecord(id, record);
  }
  return value;
}

function freshJournal(store) {
  return {
    schema: INTERVENTION_RECOVERY_SCHEMA,
    runId: store.runId,
    contractSeal: store.contract?.seal ?? null,
    revision: 0,
    updatedAt: nowIso(),
    interventions: {},
  };
}

function sameIdentity(record, proposed) {
  return record.agentId === proposed.agentId
    && record.trigger === proposed.trigger
    && record.boundary === proposed.boundary
    && record.attempt === proposed.attempt;
}

/**
 * A small operational journal for the one state that cannot be reconstructed
 * from prose after a controller crash: which exact independent judge operation
 * owned an intervention and which authority it was checking.
 *
 * The journal deliberately stores hashes and immutable file references, not an
 * LLM interpretation. Event emission remains the controller's evidence layer;
 * this file is the resumable execution cursor that must be written before an
 * external judge or worker delivery begins.
 */
export class InterventionRecoveryJournal {
  constructor({ store, file = INTERVENTION_RECOVERY_FILE } = {}) {
    if (!store?.runId || !store?.contract?.seal
      || typeof store.readJson !== "function" || typeof store.writeJson !== "function") {
      throw new Error("INTERVENTION_RECOVERY_STORE_REQUIRED");
    }
    this.store = store;
    this.file = file;
  }

  read() {
    const existing = this.store.readJson(this.file);
    return clone(existing ? assertJournal(existing, this.store) : freshJournal(this.store));
  }

  record(interventionId) {
    const id = required(interventionId, "ID");
    const record = this.read().interventions[id];
    return record ? clone(record) : null;
  }

  write(state) {
    assertJournal(state, this.store);
    const next = {
      ...state,
      revision: state.revision + 1,
      updatedAt: nowIso(),
    };
    this.store.writeJson(this.file, next);
    return clone(next);
  }

  mutate(interventionId, update) {
    const id = required(interventionId, "ID");
    const state = this.read();
    const prior = state.interventions[id];
    if (!prior) throw new Error(`INTERVENTION_RECOVERY_UNKNOWN:${id}`);
    const nextRecord = update(clone(prior));
    if (!nextRecord || nextRecord.interventionId !== id || !PHASES.has(nextRecord.phase)) {
      throw new Error(`INTERVENTION_RECOVERY_TRANSITION_INVALID:${id}`);
    }
    state.interventions[id] = nextRecord;
    this.write(state);
    return clone(nextRecord);
  }

  beginIntervention({ interventionId = randomUUID(), agentId = "main", trigger,
    boundary, attempt = 1 } = {}) {
    const id = required(interventionId, "ID");
    const identity = {
      agentId: required(agentId, "AGENT_ID"),
      trigger: required(trigger, "TRIGGER"),
      boundary: required(boundary, "BOUNDARY"),
      attempt: positiveGeneration(attempt),
    };
    const state = this.read();
    const existing = state.interventions[id];
    if (existing) {
      if (!sameIdentity(existing, identity)) {
        throw new Error(`INTERVENTION_RECOVERY_ID_REUSED:${id}`);
      }
      return clone(existing);
    }
    const createdAt = nowIso();
    const record = {
      schema: "outsider/recoverable-intervention/v1",
      interventionId: id,
      ...identity,
      phase: "paused",
      authority: null,
      authorityHistory: [],
      judge: null,
      delivery: { status: "none" },
      effect: { observed: false },
      createdAt,
      updatedAt: createdAt,
      resolvedAt: null,
    };
    state.interventions[id] = record;
    this.write(state);
    return clone(record);
  }

  bindAuthority({ interventionId, authorityHash, authorityRef } = {}) {
    const hash = required(authorityHash, "AUTHORITY_HASH");
    const reference = required(authorityRef, "AUTHORITY_REF");
    return this.mutate(interventionId, (record) => {
      if (record.phase === "resolved") throw new Error("INTERVENTION_RECOVERY_ALREADY_RESOLVED");
      if (record.authority && (record.authority.hash !== hash || record.authority.ref !== reference)) {
        throw new Error("INTERVENTION_RECOVERY_AUTHORITY_MISMATCH");
      }
      record.authority ??= { hash, ref: reference, draft: 1, boundAt: nowIso(),
        supersedesHash: null };
      record.updatedAt = nowIso();
      return record;
    });
  }

  supersedeRejectedAuthority({ interventionId, previousAuthorityHash,
    rejectionResultHash, rejectionResultRef, nextAuthorityHash, nextAuthorityRef } = {}) {
    const previousHash = required(previousAuthorityHash, "PREVIOUS_AUTHORITY_HASH");
    const rejectedHash = required(rejectionResultHash, "REJECTION_RESULT_HASH");
    const rejectedRef = required(rejectionResultRef, "REJECTION_RESULT_REF");
    const nextHash = required(nextAuthorityHash, "NEXT_AUTHORITY_HASH");
    const nextRef = required(nextAuthorityRef, "NEXT_AUTHORITY_REF");
    return this.mutate(interventionId, (record) => {
      if (record.phase !== "judge-complete" || record.delivery?.status !== "none") {
        throw new Error(`INTERVENTION_RECOVERY_AUTHORITY_SUPERSEDE_FORBIDDEN:${record.phase}`);
      }
      if (!record.authority || record.authority.hash !== previousHash
        || record.judge?.kind !== "correction-factual-audit"
        || record.judge?.authorityHash !== previousHash) {
        throw new Error("INTERVENTION_RECOVERY_PREVIOUS_AUTHORITY_MISMATCH");
      }
      if (record.judge.passed !== false
        || record.judge.resultHash !== rejectedHash || record.judge.resultRef !== rejectedRef) {
        throw new Error("INTERVENTION_RECOVERY_REJECTION_EVIDENCE_MISMATCH");
      }
      if (nextHash === previousHash
        || record.authorityHistory.some((authority) => authority.hash === nextHash)) {
        throw new Error("INTERVENTION_RECOVERY_NEXT_AUTHORITY_INVALID");
      }
      const supersededAt = nowIso();
      record.authorityHistory = [...record.authorityHistory, {
        ...record.authority,
        rejectedBy: {
          resultHash: rejectedHash,
          resultRef: rejectedRef,
          logicalOperationId: record.judge.logicalOperationId,
        },
        supersededByHash: nextHash,
        supersededAt,
      }];
      record.authority = {
        hash: nextHash,
        ref: nextRef,
        draft: record.authority.draft + 1,
        boundAt: supersededAt,
        supersedesHash: previousHash,
      };
      record.updatedAt = supersededAt;
      return record;
    });
  }

  beginJudge({ interventionId, kind, inputHash, inputRef, ownerId,
    generation, logicalOperationId = randomUUID(), authorityHash = null } = {}) {
    const operationKind = required(kind, "JUDGE_KIND");
    const packetHash = required(inputHash, "JUDGE_INPUT_HASH");
    const packetRef = required(inputRef, "JUDGE_INPUT_REF");
    const owner = required(ownerId, "OWNER_ID");
    const controllerGeneration = positiveGeneration(generation);
    const operationId = required(logicalOperationId, "OPERATION_ID");
    return this.mutate(interventionId, (record) => {
      if (record.phase === "resolved") throw new Error("INTERVENTION_RECOVERY_ALREADY_RESOLVED");
      if (authorityHash != null && record.authority?.hash !== String(authorityHash)) {
        throw new Error("INTERVENTION_RECOVERY_AUTHORITY_MISMATCH");
      }
      if (record.phase === "judge-running") {
        const same = record.judge?.logicalOperationId === operationId
          && record.judge?.kind === operationKind
          && record.judge?.inputHash === packetHash
          && record.judge?.inputRef === packetRef
          && record.judge?.ownerId === owner
          && record.judge?.generation === controllerGeneration;
        if (same) return record;
        throw new Error("INTERVENTION_RECOVERY_JUDGE_ALREADY_RUNNING");
      }
      if (["delivery-pending", "delivery-recorded"].includes(record.phase)) {
        throw new Error(`INTERVENTION_RECOVERY_JUDGE_BLOCKED_BY_DELIVERY:${record.phase}`);
      }
      record.phase = "judge-running";
      record.judge = {
        logicalOperationId: operationId,
        kind: operationKind,
        inputHash: packetHash,
        inputRef: packetRef,
        authorityHash: record.authority?.hash ?? null,
        status: "running",
        ownerId: owner,
        generation: controllerGeneration,
        executionAttempt: 1,
        startedAt: nowIso(),
        resumedAt: null,
        completedAt: null,
        resultHash: null,
        resultRef: null,
      };
      record.updatedAt = nowIso();
      return record;
    });
  }

  resumeJudge({ interventionId, ownerId, generation, replacingOwnerId } = {}) {
    const owner = required(ownerId, "OWNER_ID");
    const replacement = required(replacingOwnerId, "REPLACING_OWNER_ID");
    const controllerGeneration = positiveGeneration(generation);
    return this.mutate(interventionId, (record) => {
      if (record.phase !== "judge-running" || record.judge?.status !== "running") {
        throw new Error(`INTERVENTION_RECOVERY_NO_RUNNING_JUDGE:${record.phase}`);
      }
      if (record.judge.ownerId !== replacement) {
        throw new Error("INTERVENTION_RECOVERY_REPLACEMENT_OWNER_MISMATCH");
      }
      if (controllerGeneration <= record.judge.generation) {
        throw new Error("INTERVENTION_RECOVERY_GENERATION_NOT_ADVANCED");
      }
      record.judge = {
        ...record.judge,
        ownerId: owner,
        generation: controllerGeneration,
        executionAttempt: Number(record.judge.executionAttempt ?? 1) + 1,
        resumedAt: nowIso(),
        replacedOwnerId: replacement,
      };
      record.updatedAt = nowIso();
      return record;
    });
  }

  completeJudge({ interventionId, logicalOperationId, ownerId, generation,
    resultHash, resultRef, passed = null } = {}) {
    const operationId = required(logicalOperationId, "OPERATION_ID");
    const owner = required(ownerId, "OWNER_ID");
    const controllerGeneration = positiveGeneration(generation);
    const outputHash = required(resultHash, "JUDGE_RESULT_HASH");
    const outputRef = required(resultRef, "JUDGE_RESULT_REF");
    if (passed != null && typeof passed !== "boolean") {
      throw new Error("INTERVENTION_RECOVERY_JUDGE_PASSED_INVALID");
    }
    return this.mutate(interventionId, (record) => {
      if (record.phase !== "judge-running" || record.judge?.status !== "running") {
        throw new Error(`INTERVENTION_RECOVERY_NO_RUNNING_JUDGE:${record.phase}`);
      }
      if (record.judge.logicalOperationId !== operationId
        || record.judge.ownerId !== owner || record.judge.generation !== controllerGeneration) {
        throw new Error("INTERVENTION_RECOVERY_JUDGE_OWNER_MISMATCH");
      }
      record.phase = "judge-complete";
      record.judge = {
        ...record.judge,
        status: "complete",
        resultHash: outputHash,
        resultRef: outputRef,
        passed,
        completedAt: nowIso(),
      };
      record.updatedAt = nowIso();
      return record;
    });
  }

  prepareDelivery({ interventionId, authorityHash, correctionHash, marker, payloadRef } = {}) {
    const boundHash = required(authorityHash, "AUTHORITY_HASH");
    const correction = required(correctionHash, "CORRECTION_HASH");
    const deliveryMarker = required(marker, "DELIVERY_MARKER");
    const reference = required(payloadRef, "DELIVERY_REF");
    return this.mutate(interventionId, (record) => {
      if (record.phase !== "judge-complete") {
        throw new Error(`INTERVENTION_RECOVERY_DELIVERY_BEFORE_JUDGE:${record.phase}`);
      }
      if (record.authority?.hash !== boundHash || record.judge?.authorityHash !== boundHash) {
        throw new Error("INTERVENTION_RECOVERY_AUTHORITY_MISMATCH");
      }
      record.phase = "delivery-pending";
      record.delivery = {
        status: "pending",
        authorityHash: boundHash,
        correctionHash: correction,
        marker: deliveryMarker,
        payloadRef: reference,
        preparedAt: nowIso(),
        recordedAt: null,
        emittedSeq: null,
        observedAt: null,
        observedSeq: null,
      };
      record.updatedAt = nowIso();
      return record;
    });
  }

  recordDelivery({ interventionId, emittedSeq } = {}) {
    const sequence = Number(emittedSeq);
    if (!Number.isInteger(sequence) || sequence < 1) {
      throw new Error("INTERVENTION_RECOVERY_EMITTED_SEQ_INVALID");
    }
    return this.mutate(interventionId, (record) => {
      if (record.phase !== "delivery-pending" || record.delivery?.status !== "pending") {
        throw new Error(`INTERVENTION_RECOVERY_DELIVERY_NOT_PENDING:${record.phase}`);
      }
      record.phase = "delivery-recorded";
      record.delivery = { ...record.delivery, status: "recorded", emittedSeq: sequence,
        recordedAt: nowIso() };
      record.updatedAt = nowIso();
      return record;
    });
  }

  observeDelivery({ interventionId, observedSeq } = {}) {
    const sequence = Number(observedSeq);
    if (!Number.isInteger(sequence) || sequence < 1) {
      throw new Error("INTERVENTION_RECOVERY_OBSERVED_SEQ_INVALID");
    }
    return this.mutate(interventionId, (record) => {
      if (record.phase !== "delivery-recorded" || record.delivery?.status !== "recorded") {
        throw new Error(`INTERVENTION_RECOVERY_DELIVERY_NOT_RECORDED:${record.phase}`);
      }
      if (sequence <= record.delivery.emittedSeq) {
        throw new Error("INTERVENTION_RECOVERY_OBSERVED_BEFORE_EMITTED");
      }
      record.phase = "delivery-observed";
      record.delivery = { ...record.delivery, status: "observed", observedSeq: sequence,
        observedAt: nowIso() };
      record.updatedAt = nowIso();
      return record;
    });
  }

  observeEffect({ interventionId, effectSeq } = {}) {
    const sequence = Number(effectSeq);
    if (!Number.isInteger(sequence) || sequence < 1) {
      throw new Error("INTERVENTION_RECOVERY_EFFECT_SEQ_INVALID");
    }
    return this.mutate(interventionId, (record) => {
      if (record.phase !== "delivery-observed" || record.delivery?.status !== "observed") {
        throw new Error(`INTERVENTION_RECOVERY_DELIVERY_NOT_OBSERVED:${record.phase}`);
      }
      if (sequence <= record.delivery.observedSeq) {
        throw new Error("INTERVENTION_RECOVERY_EFFECT_BEFORE_OBSERVED");
      }
      record.phase = "effect-observed";
      record.effect = { observed: true, seq: sequence, observedAt: nowIso() };
      record.updatedAt = nowIso();
      return record;
    });
  }

  resolve({ interventionId } = {}) {
    return this.mutate(interventionId, (record) => {
      if (!["effect-observed", "judge-complete"].includes(record.phase)
        || record.effect?.observed !== true || record.delivery?.status !== "observed") {
        throw new Error(`INTERVENTION_RECOVERY_EFFECT_NOT_OBSERVED:${record.phase}`);
      }
      record.phase = "resolved";
      record.resolvedAt = nowIso();
      record.updatedAt = record.resolvedAt;
      return record;
    });
  }

  recoveryAction(interventionId) {
    const record = this.record(interventionId);
    if (!record) return { action: "none", reason: "unknown-intervention" };
    if (record.phase === "judge-running") {
      return { action: "resume-judge", interventionId: record.interventionId,
        authorityHash: record.authority?.hash ?? null, judge: clone(record.judge) };
    }
    if (record.phase === "judge-complete") {
      return { action: "continue-after-judge", interventionId: record.interventionId,
        authorityHash: record.authority?.hash ?? null, judge: clone(record.judge) };
    }
    if (record.phase === "delivery-pending") {
      return { action: "deliver", interventionId: record.interventionId,
        authorityHash: record.authority?.hash ?? null, delivery: clone(record.delivery) };
    }
    if (record.phase === "delivery-recorded") {
      return { action: "delivery-unknown", interventionId: record.interventionId,
        authorityHash: record.authority?.hash ?? null, delivery: clone(record.delivery) };
    }
    if (record.phase === "delivery-observed") {
      return { action: "observe-effect", interventionId: record.interventionId,
        authorityHash: record.authority?.hash ?? null, delivery: clone(record.delivery) };
    }
    if (record.phase === "effect-observed") {
      return { action: "continue-outcome", interventionId: record.interventionId,
        authorityHash: record.authority?.hash ?? null };
    }
    return { action: record.phase === "resolved" ? "none" : "continue-judge",
      interventionId: record.interventionId, authorityHash: record.authority?.hash ?? null };
  }
}
