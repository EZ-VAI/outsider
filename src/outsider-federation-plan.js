/*
 * Provider-neutral task planning for Global Outsider.
 *
 * A plan is a signed coordination proposal, not execution authority. Each
 * provider accepts its assignment only by publishing its own signed,
 * task-bound checkpoint. The monitor never receives provider credentials.
 */

import { createPrivateKey, createPublicKey, sign as cryptoSign,
  verify as cryptoVerify } from "node:crypto";
import { canonicalizeStrict, sha256 } from "./canonical.js";
import { createFederatedWayCheckpoint, federationKeyId,
  verifyFederatedHandoff, verifyFederatedHandoffOffer,
  verifyFederationTrustStore } from "./outsider-federation.js";

export const FEDERATED_TASK_PLAN_SCHEMA = "outsider/federated-task-plan/v1";
const PAYLOAD_SCHEMA = "outsider/federated-task-plan-payload/v1";
const SIGNATURE_SCHEMA = "outsider/federation-signature/v1";
const HASH = /^sha256:[a-f0-9]{64}$/;
const CLAIMS = Object.freeze(["OBSERVATION", "DELIVERY", "OUTCOME"]);
const CLAIM_CEILING = Object.freeze({ OBSERVER_ONLY: "OBSERVATION",
  DELIVERY_SUPERVISED: "DELIVERY", CONTROLLED: "OUTCOME" });
const CLAIM_RANK = Object.freeze({ OBSERVATION: 0, DELIVERY: 1, OUTCOME: 2 });
const AUTHORITY = Object.freeze({ federationAuthority: "none",
  executionAuthority: false, localControllersRetainAuthority: true,
  permitsPricing: false, permitsCoverage: false, permitsSettlement: false,
  movesFunds: false });
const CLAIM_BOUNDARY = Object.freeze({ coordinationProposalOnly: true,
  taskOwnerAcceptsOnlyBySignedCheckpoint: true,
  globalExecutionAuthority: false, establishesOutcome: false,
  establishesLossOrLiability: false });

const validHash = (value) => HASH.test(String(value ?? ""));
const validTime = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const same = (left, right) => canonicalizeStrict(left) === canonicalizeStrict(right);
const uniqueSorted = (values) => [...new Set(values)].sort();
const addressed = (body) => Object.freeze({ ...body, recordHash: sha256(body) });

function signPlan(payload, privateKeyPem) {
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKeyPem = createPublicKey(privateKey)
    .export({ type: "spki", format: "pem" }).toString();
  const keyId = federationKeyId(publicKeyPem);
  const context = { schema: SIGNATURE_SCHEMA, algorithm: "Ed25519",
    role: "operator", keyId, payloadHash: sha256(payload) };
  const value = cryptoSign(null, Buffer.from(canonicalizeStrict({ payload, context })),
    privateKey).toString("base64url");
  return Object.freeze({ payload, signature: Object.freeze({ ...context, value }) });
}

function verifyPlanSignature(envelope, publicKeyPem) {
  try {
    const signature = envelope?.signature, payload = envelope?.payload;
    const context = { schema: signature?.schema, algorithm: signature?.algorithm,
      role: signature?.role, keyId: signature?.keyId,
      payloadHash: signature?.payloadHash };
    return signature?.schema === SIGNATURE_SCHEMA
      && signature?.algorithm === "Ed25519" && signature?.role === "operator"
      && signature?.keyId === federationKeyId(publicKeyPem)
      && signature?.payloadHash === sha256(payload)
      && cryptoVerify(null, Buffer.from(canonicalizeStrict({ payload, context })),
        createPublicKey(publicKeyPem), Buffer.from(signature?.value ?? "", "base64url"));
  } catch { return false; }
}

function operatorFor(trustStore, keyId) {
  return trustStore?.operators?.find((entry) => entry.operatorKeyId === keyId) ?? null;
}

function instrumentFor(trustStore, hash) {
  return trustStore?.instruments?.find((entry) => entry.instrumentHash === hash) ?? null;
}

function caseValid(caseRef, policyHash) {
  return [caseRef?.claimHash, caseRef?.claimFamilyHash, caseRef?.worldHash,
    caseRef?.worldFamilyHash, caseRef?.policyHash].every(validHash)
    && caseRef.policyHash === policyHash;
}

function normalizeTask(task) {
  return Object.freeze({ ordinal: task?.ordinal, taskId: task?.taskId,
    owner: Object.freeze({ operatorKeyId: task?.owner?.operatorKeyId,
      instrumentHash: task?.owner?.instrumentHash, wayHash: task?.owner?.wayHash }),
    dependencyTaskIds: uniqueSorted(task?.dependencyTaskIds ?? []),
    scopeHash: task?.scopeHash, expectedOutcomeHash: task?.expectedOutcomeHash,
    expectedInputArtifactHashes: uniqueSorted(task?.expectedInputArtifactHashes ?? []),
    requiredClaim: task?.requiredClaim ?? "OBSERVATION" });
}

function validatePayload(payload, trustStore) {
  const failures = [];
  if (payload?.schema !== PAYLOAD_SCHEMA || !caseValid(payload?.caseRef,
    trustStore?.policyHash) || !validHash(payload?.coordinatorOperatorKeyId)
    || !validHash(payload?.planNonceHash) || !validTime(payload?.createdAt)
    || !Array.isArray(payload?.tasks) || payload.tasks.length === 0
    || !same(payload?.authority, AUTHORITY)) failures.push("TASK_PLAN_BODY_INVALID");
  const coordinator = operatorFor(trustStore, payload?.coordinatorOperatorKeyId);
  if (!coordinator) failures.push("TASK_PLAN_COORDINATOR_UNTRUSTED");
  const tasks = payload?.tasks ?? [], ids = new Set();
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index], instrument = instrumentFor(trustStore,
      task?.owner?.instrumentHash);
    if (!Number.isSafeInteger(task?.ordinal) || task.ordinal !== index
      || !validHash(task?.taskId) || ids.has(task.taskId)
      || ![task?.owner?.operatorKeyId, task?.owner?.instrumentHash,
        task?.owner?.wayHash, task?.scopeHash, task?.expectedOutcomeHash].every(validHash)
      || !Array.isArray(task?.dependencyTaskIds)
      || !same(task.dependencyTaskIds, uniqueSorted(task.dependencyTaskIds ?? []))
      || task.dependencyTaskIds.some((hash) => !validHash(hash))
      || !Array.isArray(task?.expectedInputArtifactHashes)
      || !same(task.expectedInputArtifactHashes,
        uniqueSorted(task.expectedInputArtifactHashes ?? []))
      || task.expectedInputArtifactHashes.some((hash) => !validHash(hash))
      || !CLAIMS.includes(task?.requiredClaim)) failures.push("TASK_PLAN_TASK_INVALID");
    ids.add(task?.taskId);
    if (!operatorFor(trustStore, task?.owner?.operatorKeyId) || !instrument
      || instrument.operatorKeyId !== task?.owner?.operatorKeyId) {
      failures.push("TASK_PLAN_OWNER_INVALID");
    } else if (CLAIM_RANK[task.requiredClaim]
      > CLAIM_RANK[CLAIM_CEILING[instrument.controlMode]]) {
      failures.push("TASK_PLAN_SURFACE_OVERCLAIM");
    }
  }
  const byId = new Map(tasks.map((task) => [task.taskId, task]));
  for (const task of tasks) for (const dependency of task.dependencyTaskIds ?? []) {
    const prior = byId.get(dependency);
    if (!prior || prior.ordinal >= task.ordinal) failures.push("TASK_PLAN_DEPENDENCY_INVALID");
  }
  if (payload?.taskGraphCommitment !== sha256(tasks.map((task) => ({
    taskId: task.taskId, owner: task.owner,
    dependencyTaskIds: task.dependencyTaskIds,
    scopeHash: task.scopeHash, expectedOutcomeHash: task.expectedOutcomeHash,
    expectedInputArtifactHashes: task.expectedInputArtifactHashes,
    requiredClaim: task.requiredClaim })))) failures.push("TASK_PLAN_GRAPH_COMMITMENT_INVALID");
  if (Array.isArray(payload?.tasks)) {
    const exact = { schema: PAYLOAD_SCHEMA, caseRef: payload.caseRef,
      coordinatorOperatorKeyId: payload.coordinatorOperatorKeyId,
      planNonceHash: payload.planNonceHash, createdAt: payload.createdAt,
      tasks: payload.tasks.map(normalizeTask),
      taskGraphCommitment: payload.taskGraphCommitment,
      authority: AUTHORITY, claimBoundary: CLAIM_BOUNDARY };
    if (!same(payload, exact)) failures.push("TASK_PLAN_PUBLIC_PROJECTION_INVALID");
  }
  return [...new Set(failures)].sort();
}

export function createFederatedTaskPlan({ caseRef, planNonceHash, createdAt,
  tasks = [], privateKeyPem, trustStore } = {}) {
  if (!verifyFederationTrustStore(trustStore).ok) {
    throw new Error("FEDERATED_TASK_PLAN_TRUST_INVALID");
  }
  const coordinatorOperatorKeyId = federationKeyId(createPublicKey(
    createPrivateKey(privateKeyPem)).export({ type: "spki", format: "pem" }).toString());
  const normalizedTasks = [...tasks].sort((a, b) => a.ordinal - b.ordinal)
    .map(normalizeTask);
  const payload = { schema: PAYLOAD_SCHEMA, caseRef, coordinatorOperatorKeyId,
    planNonceHash, createdAt, tasks: normalizedTasks,
    taskGraphCommitment: sha256(normalizedTasks.map((task) => ({
      taskId: task.taskId, owner: task.owner,
      dependencyTaskIds: task.dependencyTaskIds,
      scopeHash: task.scopeHash, expectedOutcomeHash: task.expectedOutcomeHash,
      expectedInputArtifactHashes: task.expectedInputArtifactHashes,
      requiredClaim: task.requiredClaim }))), authority: AUTHORITY,
    claimBoundary: CLAIM_BOUNDARY };
  const failures = validatePayload(payload, trustStore);
  if (failures.length) throw new Error(`FEDERATED_TASK_PLAN_INVALID:${failures.join("|")}`);
  return addressed({ schema: FEDERATED_TASK_PLAN_SCHEMA, coordinatorOperatorKeyId,
    signedPlan: signPlan(payload, privateKeyPem) });
}

export function verifyFederatedTaskPlan(record, trustStore) {
  try {
    const failures = [];
    if (!verifyFederationTrustStore(trustStore).ok) failures.push("TASK_PLAN_TRUST_INVALID");
    const { recordHash, ...body } = record ?? {};
    if (record?.schema !== FEDERATED_TASK_PLAN_SCHEMA || sha256(body) !== recordHash) {
      failures.push("TASK_PLAN_RECORD_INVALID");
    }
    const coordinator = operatorFor(trustStore, record?.coordinatorOperatorKeyId);
    if (!coordinator || !verifyPlanSignature(record?.signedPlan, coordinator.publicKeyPem)
      || record?.signedPlan?.payload?.coordinatorOperatorKeyId
        !== record?.coordinatorOperatorKeyId) failures.push("TASK_PLAN_SIGNATURE_INVALID");
    failures.push(...validatePayload(record?.signedPlan?.payload, trustStore));
    return Object.freeze({ ok: failures.length === 0,
      failures: [...new Set(failures)].sort(), recordHash: failures.length ? null : recordHash,
      payload: failures.length ? null : record.signedPlan.payload });
  } catch {
    return Object.freeze({ ok: false, failures: ["TASK_PLAN_MALFORMED"],
      recordHash: null, payload: null });
  }
}

export function taskFromFederatedPlan(taskPlan, taskId) {
  return taskPlan?.signedPlan?.payload?.tasks?.find((task) => task.taskId === taskId) ?? null;
}

export function createTaskBoundFederatedCheckpoint({ taskPlan, taskId,
  dependencyCheckpointHashes = [], trustStore, ...checkpoint } = {}) {
  const checked = verifyFederatedTaskPlan(taskPlan, trustStore);
  const task = checked.ok ? taskFromFederatedPlan(taskPlan, taskId) : null;
  if (!task || !same(checkpoint.caseRef, checked.payload.caseRef)
    || checkpoint.instrument?.instrumentHash !== task.owner.instrumentHash
    || checkpoint.wayHash !== task.owner.wayHash) {
    throw new Error("FEDERATED_TASK_CHECKPOINT_BINDING_INVALID");
  }
  return createFederatedWayCheckpoint({ ...checkpoint,
    taskBinding: { planHash: taskPlan.recordHash, taskId,
      dependencyCheckpointHashes } });
}

export function verifyFederatedTaskHandoff({ taskPlan, fromTaskId, toTaskId,
  handoff, trustStore, sourceAttestation } = {}) {
  const plan = verifyFederatedTaskPlan(taskPlan, trustStore);
  const checked = verifyFederatedHandoff(handoff, trustStore, sourceAttestation);
  const failures = [...plan.failures, ...checked.failures];
  failures.push(...taskOfferBindingFailures({ plan, taskPlan, fromTaskId, toTaskId,
    offer: checked.offer, checkedOk: checked.ok }));
  return Object.freeze({ ok: failures.length === 0,
    failures: [...new Set(failures)].sort(), planHash: plan.recordHash,
    handoffHash: failures.length ? null : checked.recordHash });
}

function taskOfferBindingFailures({ plan, taskPlan, fromTaskId, toTaskId,
  offer, checkedOk }) {
  const failures = [];
  const from = plan.ok ? taskFromFederatedPlan(taskPlan, fromTaskId) : null;
  const to = plan.ok ? taskFromFederatedPlan(taskPlan, toTaskId) : null;
  if (!from || !to || !to.dependencyTaskIds.includes(fromTaskId)) {
    failures.push("TASK_HANDOFF_EDGE_INVALID");
  }
  const binding = offer?.taskBinding;
  if (!checkedOk || binding?.planHash !== taskPlan?.recordHash
    || binding?.fromTaskId !== fromTaskId || binding?.toTaskId !== toTaskId
    || offer?.fromOperatorKeyId !== from?.owner?.operatorKeyId
    || offer?.fromWayHash !== from?.owner?.wayHash
    || offer?.destination?.operatorKeyId !== to?.owner?.operatorKeyId
    || offer?.destination?.instrumentHash !== to?.owner?.instrumentHash
    || offer?.destination?.wayHash !== to?.owner?.wayHash
    || offer?.scopeHash !== to?.scopeHash
    || offer?.expectedOutcomeHash !== to?.expectedOutcomeHash
    || (to?.expectedInputArtifactHashes?.length > 0
      && !to.expectedInputArtifactHashes.includes(offer?.artifactHash))) {
    failures.push("TASK_HANDOFF_BINDING_INVALID");
  }
  return failures;
}

export function verifyFederatedTaskHandoffOffer({ taskPlan, offer,
  trustStore, sourceAttestation } = {}) {
  const plan = verifyFederatedTaskPlan(taskPlan, trustStore);
  const checked = verifyFederatedHandoffOffer(offer, trustStore, sourceAttestation);
  const binding = checked.offer?.taskBinding;
  const failures = [...plan.failures, ...checked.failures,
    ...taskOfferBindingFailures({ plan, taskPlan,
      fromTaskId: binding?.fromTaskId, toTaskId: binding?.toTaskId,
      offer: checked.offer, checkedOk: checked.ok })];
  return Object.freeze({ ok: failures.length === 0,
    failures: [...new Set(failures)].sort(), planHash: plan.recordHash,
    offerHash: failures.length ? null : checked.offerHash });
}

export function createFederatedTaskSupervisionRecord({ taskPlan, snapshot,
  trustStore } = {}) {
  const plan = verifyFederatedTaskPlan(taskPlan, trustStore);
  const { recordHash: snapshotHash, ...snapshotBody } = snapshot ?? {};
  if (!plan.ok || snapshot?.schema !== "outsider/federation-monitor-snapshot/v1"
    || snapshotHash !== sha256(snapshotBody)
    || snapshot?.taskPlanHash !== taskPlan?.recordHash
    || snapshot?.trustStoreHash !== trustStore?.recordHash
    || !Array.isArray(snapshot?.tasks)
    || snapshot.tasks.length !== plan.payload.tasks.length) {
    throw new Error("FEDERATED_TASK_SUPERVISION_INPUT_INVALID");
  }
  const statusCounts = Object.fromEntries(["NOT_STARTED", "STARTED", "ACTIVE", "BLOCKED",
    "DELIVERY_READY", "TERMINATED"].map((status) => [status,
    snapshot.tasks.filter((task) => task.status === status).length]));
  const operators = uniqueSorted(plan.payload.tasks.map((task) => task.owner.operatorKeyId));
  const dependencyEdges = plan.payload.tasks.reduce((total, task) =>
    total + task.dependencyTaskIds.length, 0);
  return addressed({ schema: "outsider/federated-task-supervision/v1",
    planHash: taskPlan.recordHash, snapshotHash, observedAt: snapshot.observedAt,
    caseRefHash: sha256(plan.payload.caseRef),
    observed: { tasks: plan.payload.tasks.length, operators: operators.length,
      dependencyEdges, statusCounts, blocked: snapshot.summary.blocked,
      stale: snapshot.summary.stale, readyToStart: snapshot.summary.readyTasks,
      waitingForDependencies: snapshot.summary.waitingTasks },
    learning: { eligibleForRoutingResearch: operators.length > 1,
      eligibleForGlobalCausalEffectLearning: false,
      eligibleForIndependentReliabilityDenominator: false,
      eligibleForIncidentFrequencyOrSeverity: false,
      eligibleForPricing: false,
      reason: "SIGNED_TASK_ROUTING_AND_LIVENESS_ONLY" },
    riskEvidence: { observedOnly: true,
      establishesLossOrLiability: false, establishesInstitutionalIndependence: false },
    authority: AUTHORITY });
}
