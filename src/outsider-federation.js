/*
 * Global Outsider evidence plane.
 *
 * Local Stage 0.5 controllers retain execution authority.  This module binds
 * privacy-safe evidence and dual-signed handoffs across operators and Ways.  A
 * signature proves use of a key; it never proves standing, independence,
 * outcome, liability, pricing eligibility or settlement authority.
 */

import { createPrivateKey, createPublicKey, sign as cryptoSign,
  verify as cryptoVerify } from "node:crypto";
import { canonicalizeStrict, sha256 } from "./canonical.js";

export const FEDERATION_SCHEMAS = Object.freeze({
  trust: "outsider/federation-trust-store/v1",
  way: "outsider/federated-way-attestation/v1",
  checkpoint: "outsider/federated-way-checkpoint/v1",
  checkpointV2: "outsider/federated-way-checkpoint/v2",
  handoff: "outsider/federated-handoff/v1",
  packet: "outsider/federated-evidence-record/v1",
  registry: "outsider/federation-registry/v1",
});

export const FEDERATION_CONTROL_MODES = Object.freeze([
  "OBSERVER_ONLY", "DELIVERY_SUPERVISED", "CONTROLLED",
]);
export const FEDERATION_CHECKPOINT_STATUSES = Object.freeze([
  "STARTED", "ACTIVE", "BLOCKED", "DELIVERY_READY", "TERMINATED",
]);

export const FEDERATION_SURFACE_CEILINGS = Object.freeze({
  "claude-code": "CONTROLLED",
  "claude-cowork": "CONTROLLED",
  "deepseek-harness": "DELIVERY_SUPERVISED",
  codex: "OBSERVER_ONLY",
  trae: "OBSERVER_ONLY",
  "deterministic-program": "CONTROLLED",
  "durable-workflow": "CONTROLLED",
  generic: "OBSERVER_ONLY",
});

const MODE_RANK = Object.freeze({ OBSERVER_ONLY: 0, DELIVERY_SUPERVISED: 1,
  CONTROLLED: 2 });
const HASH = /^sha256:[a-f0-9]{64}$/;
const PRIVATE_KEYS = new Set(["raw", "rawpercept", "prompt", "sourcetext",
  "patchtext", "stdout", "stderr", "secret", "credential", "privatekey",
  "apikey", "accesstoken", "email"]);
const AUTHORITY = Object.freeze({ lane: "RESEARCH", federationAuthority: "none",
  executionAuthority: false, permitsTraining: false, permitsPricing: false,
  permitsCoverage: false, permitsCapital: false, permitsSettlement: false,
  movesFunds: false });

const strictHash = (value) => { canonicalizeStrict(value); return sha256(value); };
const validHash = (value) => HASH.test(String(value ?? ""));
const same = (left, right) => canonicalizeStrict(left) === canonicalizeStrict(right);
const uniqueSorted = (values) => [...new Set(values)].sort();
const validTime = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const plain = (value) => value !== null && typeof value === "object"
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const addressed = (body) => Object.freeze({ ...body, recordHash: strictHash(body) });

function requiredHash(value, label) {
  if (!validHash(value)) throw new Error(`FEDERATION_${label}_HASH_REQUIRED`);
  return value;
}

function publicKeyPemFromPrivate(privateKeyPem) {
  return createPublicKey(createPrivateKey(privateKeyPem))
    .export({ type: "spki", format: "pem" }).toString();
}

export function federationKeyId(publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  return sha256(key.export({ type: "spki", format: "der" }));
}

function signed(payload, { privateKeyPem, role }) {
  if (!privateKeyPem || !["operator", "receiver"].includes(role)) {
    throw new Error("FEDERATION_SIGNING_INPUT_INVALID");
  }
  canonicalizeStrict(payload);
  const publicKeyPem = publicKeyPemFromPrivate(privateKeyPem);
  const keyId = federationKeyId(publicKeyPem);
  const context = { schema: "outsider/federation-signature/v1", algorithm: "Ed25519",
    role, keyId, payloadHash: strictHash(payload) };
  const value = cryptoSign(null, Buffer.from(canonicalizeStrict({ payload, context })),
    createPrivateKey(privateKeyPem)).toString("base64url");
  return Object.freeze({ payload, signature: Object.freeze({ ...context, value }) });
}

function verifySigned(envelope, publicKeyPem, role) {
  try {
    if (!plain(envelope) || !plain(envelope.payload) || !plain(envelope.signature)
      || envelope.signature.schema !== "outsider/federation-signature/v1"
      || envelope.signature.algorithm !== "Ed25519" || envelope.signature.role !== role
      || envelope.signature.keyId !== federationKeyId(publicKeyPem)
      || envelope.signature.payloadHash !== strictHash(envelope.payload)) return false;
    const context = { schema: envelope.signature.schema, algorithm: envelope.signature.algorithm,
      role: envelope.signature.role, keyId: envelope.signature.keyId,
      payloadHash: envelope.signature.payloadHash };
    return cryptoVerify(null, Buffer.from(canonicalizeStrict({ payload: envelope.payload,
      context })), createPublicKey(publicKeyPem),
    Buffer.from(envelope.signature.value ?? "", "base64url"));
  } catch { return false; }
}

function inspectPublic(value, path = "root", depth = 0, failures = []) {
  if (depth > 16) { failures.push(`PUBLIC_DEPTH_EXCEEDED:${path}`); return failures; }
  if (value === null || typeof value === "boolean") return failures;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) failures.push(`PUBLIC_NUMBER_INVALID:${path}`);
    return failures;
  }
  if (typeof value === "string") {
    if (value.length > 4096) failures.push(`PUBLIC_STRING_TOO_LONG:${path}`);
    return failures;
  }
  if (Array.isArray(value)) {
    if (value.length > 512) failures.push(`PUBLIC_ARRAY_TOO_LONG:${path}`);
    value.forEach((item, index) => inspectPublic(item, `${path}[${index}]`, depth + 1,
      failures));
    return failures;
  }
  if (!plain(value)) { failures.push(`PUBLIC_VALUE_INVALID:${path}`); return failures; }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll("_", "").replaceAll("-", "");
    if (PRIVATE_KEYS.has(normalized)) failures.push(`PRIVATE_FIELD_PRESENT:${path}.${key}`);
    inspectPublic(child, `${path}.${key}`, depth + 1, failures);
  }
  return failures;
}

export function federationModeAllowed(surface, mode) {
  const ceiling = FEDERATION_SURFACE_CEILINGS[surface]
    ?? FEDERATION_SURFACE_CEILINGS.generic;
  return FEDERATION_CONTROL_MODES.includes(mode) && MODE_RANK[mode] <= MODE_RANK[ceiling];
}

function caseFailures(caseRef) {
  return ["claimHash", "claimFamilyHash", "worldHash", "worldFamilyHash", "policyHash"]
    .filter((field) => !validHash(caseRef?.[field])).map((field) => `CASE_${field}_INVALID`);
}

export function createFederationTrustStore({ policyHash, operators = [],
  instruments = [] } = {}) {
  requiredHash(policyHash, "POLICY");
  const normalizedOperators = operators.map((entry) => {
    if (String(entry?.publicKeyPem ?? "").includes("PRIVATE KEY")) {
      throw new Error("FEDERATION_PRIVATE_KEY_IN_TRUST_STORE");
    }
    const operatorKeyId = federationKeyId(entry?.publicKeyPem);
    requiredHash(entry?.tenantHash, "TENANT");
    requiredHash(entry?.governanceRootHash, "GOVERNANCE_ROOT");
    if (entry.externalGovernanceEvidenceHash != null) {
      requiredHash(entry.externalGovernanceEvidenceHash, "EXTERNAL_GOVERNANCE_EVIDENCE");
    }
    if (typeof entry?.operatorKind !== "string" || !entry.operatorKind.trim()
      || entry.operatorKind.length > 80) throw new Error("FEDERATION_OPERATOR_KIND_INVALID");
    return Object.freeze({ operatorKeyId, publicKeyPem: entry.publicKeyPem,
      tenantHash: entry.tenantHash, governanceRootHash: entry.governanceRootHash,
      externalGovernanceEvidenceHash: entry.externalGovernanceEvidenceHash ?? null,
      operatorKind: entry.operatorKind, status: "ACTIVE" });
  }).sort((a, b) => a.operatorKeyId.localeCompare(b.operatorKeyId));
  if (new Set(normalizedOperators.map((entry) => entry.operatorKeyId)).size
    !== normalizedOperators.length) throw new Error("FEDERATION_DUPLICATE_OPERATOR");
  const operatorIds = new Set(normalizedOperators.map((entry) => entry.operatorKeyId));
  const normalizedInstruments = instruments.map((entry) => {
    for (const field of ["instrumentHash", "instrumentVersionHash", "adapterHash"]) {
      requiredHash(entry?.[field], field.toUpperCase());
    }
    if (!operatorIds.has(entry.operatorKeyId) || typeof entry.surface !== "string"
      || !entry.surface.trim() || entry.surface.length > 100
      || !federationModeAllowed(entry.surface, entry.controlMode)) {
      throw new Error("FEDERATION_INSTRUMENT_INVALID");
    }
    return Object.freeze({ instrumentHash: entry.instrumentHash,
      instrumentVersionHash: entry.instrumentVersionHash, adapterHash: entry.adapterHash,
      operatorKeyId: entry.operatorKeyId, surface: entry.surface,
      controlMode: entry.controlMode, status: "ACTIVE" });
  }).sort((a, b) => a.instrumentHash.localeCompare(b.instrumentHash));
  if (new Set(normalizedInstruments.map((entry) => entry.instrumentHash)).size
    !== normalizedInstruments.length) throw new Error("FEDERATION_DUPLICATE_INSTRUMENT");
  return addressed({ schema: FEDERATION_SCHEMAS.trust, policyHash,
    operators: normalizedOperators, instruments: normalizedInstruments,
    authority: AUTHORITY });
}

export function verifyFederationTrustStore(store) {
  try {
    const failures = [...inspectPublic(store)];
    const { recordHash, ...body } = store ?? {};
    if (store?.schema !== FEDERATION_SCHEMAS.trust || strictHash(body) !== recordHash
      || !validHash(store.policyHash) || !same(store.authority, AUTHORITY)
      || !Array.isArray(store.operators) || !Array.isArray(store.instruments)) {
      failures.push("TRUST_STORE_BODY_INVALID");
    }
    const ids = new Set();
    for (const operator of store?.operators ?? []) {
      if (ids.has(operator.operatorKeyId)) failures.push("TRUST_STORE_DUPLICATE_OPERATOR");
      ids.add(operator.operatorKeyId);
      if (federationKeyId(operator.publicKeyPem) !== operator.operatorKeyId
        || String(operator.publicKeyPem).includes("PRIVATE KEY")
        || !validHash(operator.tenantHash) || !validHash(operator.governanceRootHash)
        || (operator.externalGovernanceEvidenceHash != null
          && !validHash(operator.externalGovernanceEvidenceHash))
        || operator.status !== "ACTIVE") failures.push("TRUST_STORE_OPERATOR_INVALID");
    }
    const instruments = new Set();
    for (const instrument of store?.instruments ?? []) {
      if (instruments.has(instrument.instrumentHash)) failures.push("TRUST_STORE_DUPLICATE_INSTRUMENT");
      instruments.add(instrument.instrumentHash);
      if (![instrument.instrumentHash, instrument.instrumentVersionHash,
        instrument.adapterHash].every(validHash) || !ids.has(instrument.operatorKeyId)
        || instrument.status !== "ACTIVE"
        || !federationModeAllowed(instrument.surface, instrument.controlMode)) {
        failures.push("TRUST_STORE_INSTRUMENT_INVALID");
      }
    }
    return Object.freeze({ ok: failures.length === 0,
      failures: uniqueSorted(failures), recordHash: failures.length ? null : recordHash });
  } catch { return Object.freeze({ ok: false, failures: ["TRUST_STORE_MALFORMED"],
    recordHash: null }); }
}

function operatorFor(store, keyId) {
  return store?.operators?.find((entry) => entry.operatorKeyId === keyId) ?? null;
}
function instrumentFor(store, hash) {
  return store?.instruments?.find((entry) => entry.instrumentHash === hash) ?? null;
}

function wayPayloadFailures(payload) {
  const failures = [...caseFailures(payload?.caseRef), ...inspectPublic(payload)];
  if (!validHash(payload?.operatorKeyId) || !validHash(payload?.tenantHash)
    || !validHash(payload?.governanceRootHash)) failures.push("WAY_OPERATOR_INVALID");
  if (![payload?.instrument?.instrumentHash, payload?.instrument?.instrumentVersionHash,
    payload?.instrument?.adapterHash].every(validHash)
    || !federationModeAllowed(payload?.instrument?.surface,
      payload?.instrument?.controlMode)) failures.push("WAY_INSTRUMENT_INVALID");
  const way = payload?.way;
  if (![way?.wayHash, way?.runtimeClosureHash, way?.adapterHash,
    way?.providerRootHash, way?.topologyHash].every(validHash)
    || way?.adapterHash !== payload?.instrument?.adapterHash
    || way?.surface !== payload?.instrument?.surface
    || typeof way?.wayKind !== "string" || !way.wayKind.trim()
    || ![way?.modelRootHashes, way?.dataRootHashes, way?.toolchainRootHashes]
      .every((values) => Array.isArray(values) && values.every(validHash))) {
    failures.push("WAY_SPEC_INVALID");
  }
  const observation = payload?.observation;
  if (![observation?.evidenceRecordHash, observation?.runRefHash].every(validHash)
    || !validTime(observation?.observedAt)
    || observation?.establishesLossOrLiability !== false
    || observation?.controlMode !== payload?.instrument?.controlMode
    || [observation?.establishesObservedDelivery, observation?.establishesEffect,
      observation?.establishesOutcome].some((value) => typeof value !== "boolean")) {
    failures.push("WAY_OBSERVATION_INVALID");
  }
  const claims = [observation?.establishesObservedDelivery,
    observation?.establishesEffect, observation?.establishesOutcome];
  if ((payload?.instrument?.controlMode === "OBSERVER_ONLY" && claims.some(Boolean))
    || (payload?.instrument?.controlMode === "DELIVERY_SUPERVISED"
      && observation?.establishesOutcome === true)) {
    failures.push("WAY_SURFACE_CAPABILITY_OVERCLAIM");
  }
  if (!Array.isArray(payload?.inputHandoffHashes)
    || payload.inputHandoffHashes.some((hash) => !validHash(hash))
    || !same(payload.inputHandoffHashes, uniqueSorted(payload.inputHandoffHashes ?? []))
    || !validHash(payload?.outputArtifactHash)
    || !Array.isArray(payload?.correlationRootHashes)
    || payload.correlationRootHashes.some((hash) => !validHash(hash))
    || !same(payload.correlationRootHashes, uniqueSorted(payload.correlationRootHashes ?? []))
    || !same(payload?.authority, AUTHORITY)) failures.push("WAY_BINDING_OR_AUTHORITY_INVALID");
  return uniqueSorted(failures);
}

function correlationRootsFor(payload) {
  return uniqueSorted([payload?.caseRef?.claimFamilyHash,
    payload?.caseRef?.worldFamilyHash, payload?.governanceRootHash,
    payload?.instrument?.instrumentHash, payload?.instrument?.instrumentVersionHash,
    payload?.way?.adapterHash, payload?.way?.runtimeClosureHash,
    payload?.way?.providerRootHash, payload?.way?.topologyHash,
    ...(payload?.way?.modelRootHashes ?? []), ...(payload?.way?.dataRootHashes ?? []),
    ...(payload?.way?.toolchainRootHashes ?? [])].filter(Boolean));
}

export function createFederatedWayAttestation({ caseRef, operator,
  instrument, way, observation, inputHandoffHashes = [], outputArtifactHash,
  privateKeyPem } = {}) {
  const publicKeyPem = publicKeyPemFromPrivate(privateKeyPem);
  const operatorKeyId = federationKeyId(publicKeyPem);
  const publicInstrument = { instrumentHash: instrument?.instrumentHash,
    instrumentVersionHash: instrument?.instrumentVersionHash,
    adapterHash: instrument?.adapterHash, surface: instrument?.surface,
    controlMode: instrument?.controlMode };
  const payload = { schema: "outsider/federated-way-run/v1", caseRef,
    operatorKeyId, tenantHash: operator?.tenantHash,
    governanceRootHash: operator?.governanceRootHash, instrument: publicInstrument,
    way, observation, inputHandoffHashes: uniqueSorted(inputHandoffHashes),
    outputArtifactHash, correlationRootHashes: [], authority: AUTHORITY,
    privacy: { rawEvidenceLocation: "OPERATOR_LOCAL", publicProjectionOnly: true } };
  payload.correlationRootHashes = correlationRootsFor(payload);
  const failures = wayPayloadFailures(payload);
  if (failures.length) throw new Error(`FEDERATION_WAY_INPUT_INVALID:${failures.join("|")}`);
  const body = { schema: FEDERATION_SCHEMAS.way, operatorKeyId,
    signedRun: signed(payload, { privateKeyPem, role: "operator" }) };
  return addressed(body);
}

export function verifyFederatedWayAttestation(record, trustStore) {
  try {
    const failures = [];
    if (!verifyFederationTrustStore(trustStore).ok) failures.push("WAY_TRUST_STORE_INVALID");
    const { recordHash, ...body } = record ?? {};
    if (record?.schema !== FEDERATION_SCHEMAS.way || strictHash(body) !== recordHash) {
      failures.push("WAY_RECORD_INVALID");
    }
    const operator = operatorFor(trustStore, record?.operatorKeyId);
    if (!operator || !verifySigned(record?.signedRun, operator.publicKeyPem, "operator")) {
      failures.push("WAY_SIGNATURE_INVALID");
    }
    const payload = record?.signedRun?.payload;
    failures.push(...wayPayloadFailures(payload));
    if (!same(payload?.correlationRootHashes, correlationRootsFor(payload))) {
      failures.push("WAY_CORRELATION_ROOTS_INCOMPLETE");
    }
    const instrument = instrumentFor(trustStore, payload?.instrument?.instrumentHash);
    if (!operator || payload?.operatorKeyId !== operator.operatorKeyId
      || payload?.tenantHash !== operator.tenantHash
      || payload?.governanceRootHash !== operator.governanceRootHash
      || payload?.caseRef?.policyHash !== trustStore?.policyHash) {
      failures.push("WAY_OPERATOR_OR_POLICY_BINDING_INVALID");
    }
    if (!instrument || instrument.operatorKeyId !== record?.operatorKeyId
      || !same(payload?.instrument, { instrumentHash: instrument?.instrumentHash,
        instrumentVersionHash: instrument?.instrumentVersionHash,
        adapterHash: instrument?.adapterHash, surface: instrument?.surface,
        controlMode: instrument?.controlMode })) failures.push("WAY_INSTRUMENT_BINDING_INVALID");
    return Object.freeze({ ok: failures.length === 0,
      failures: uniqueSorted(failures), recordHash: failures.length ? null : recordHash,
      payload: failures.length ? null : payload });
  } catch { return Object.freeze({ ok: false, failures: ["WAY_ATTESTATION_MALFORMED"],
    recordHash: null, payload: null }); }
}

export function createFederatedWayCheckpoint({ caseRef, operator, instrument,
  wayHash, runRefHash, checkpointSeq, previousCheckpointHash = null,
  status, observedAt, progress = {}, localEvidenceHash = null,
  outputArtifactHash = null, taskBinding = null, privateKeyPem } = {}) {
  const operatorKeyId = federationKeyId(publicKeyPemFromPrivate(privateKeyPem));
  const v2 = taskBinding != null;
  const payload = { schema: v2
    ? "outsider/federated-way-checkpoint-payload/v2"
    : "outsider/federated-way-checkpoint-payload/v1",
    caseRef, operatorKeyId, tenantHash: operator?.tenantHash,
    governanceRootHash: operator?.governanceRootHash,
    instrument: { instrumentHash: instrument?.instrumentHash,
      instrumentVersionHash: instrument?.instrumentVersionHash,
      adapterHash: instrument?.adapterHash, surface: instrument?.surface,
      controlMode: instrument?.controlMode }, wayHash, runRefHash,
    checkpointSeq, previousCheckpointHash, status, observedAt,
    progress: { toolBoundaries: progress?.toolBoundaries ?? 0,
      agentsObserved: progress?.agentsObserved ?? 0,
      openInterventions: progress?.openInterventions ?? 0 },
    commitments: { localEvidenceHash, outputArtifactHash },
    ...(v2 ? { taskBinding: { planHash: taskBinding?.planHash,
      taskId: taskBinding?.taskId,
      dependencyCheckpointHashes: uniqueSorted(taskBinding?.dependencyCheckpointHashes ?? []) } }
      : {}),
    authority: AUTHORITY,
    privacy: { rawEvidenceLocation: "OPERATOR_LOCAL", publicProjectionOnly: true } };
  const failures = checkpointPayloadFailures(payload);
  if (failures.length) {
    throw new Error(`FEDERATION_CHECKPOINT_INPUT_INVALID:${failures.join("|")}`);
  }
  return addressed({ schema: v2 ? FEDERATION_SCHEMAS.checkpointV2
    : FEDERATION_SCHEMAS.checkpoint, operatorKeyId,
    signedCheckpoint: signed(payload, { privateKeyPem, role: "operator" }) });
}

function checkpointPayloadFailures(payload) {
  const failures = [...caseFailures(payload?.caseRef), ...inspectPublic(payload)];
  const v1 = payload?.schema === "outsider/federated-way-checkpoint-payload/v1";
  const v2 = payload?.schema === "outsider/federated-way-checkpoint-payload/v2";
  if ((!v1 && !v2)
    || ![payload?.operatorKeyId, payload?.tenantHash, payload?.governanceRootHash,
      payload?.instrument?.instrumentHash, payload?.instrument?.instrumentVersionHash,
      payload?.instrument?.adapterHash, payload?.wayHash,
      payload?.runRefHash].every(validHash)
    || !federationModeAllowed(payload?.instrument?.surface,
      payload?.instrument?.controlMode)) failures.push("CHECKPOINT_IDENTITY_INVALID");
  if (!Number.isSafeInteger(payload?.checkpointSeq) || payload.checkpointSeq < 0
    || (payload.checkpointSeq === 0 ? payload.previousCheckpointHash !== null
      : !validHash(payload.previousCheckpointHash))
    || !FEDERATION_CHECKPOINT_STATUSES.includes(payload?.status)
    || !validTime(payload?.observedAt)) failures.push("CHECKPOINT_CLOCK_OR_STATUS_INVALID");
  for (const field of ["toolBoundaries", "agentsObserved", "openInterventions"]) {
    if (!Number.isSafeInteger(payload?.progress?.[field]) || payload.progress[field] < 0) {
      failures.push("CHECKPOINT_PROGRESS_INVALID");
    }
  }
  if ((payload?.commitments?.localEvidenceHash != null
      && !validHash(payload.commitments.localEvidenceHash))
    || (payload?.commitments?.outputArtifactHash != null
      && !validHash(payload.commitments.outputArtifactHash))
    || (payload?.status === "DELIVERY_READY"
      && !validHash(payload?.commitments?.outputArtifactHash))
    || !same(payload?.authority, AUTHORITY)
    || payload?.privacy?.rawEvidenceLocation !== "OPERATOR_LOCAL"
    || payload?.privacy?.publicProjectionOnly !== true) {
    failures.push("CHECKPOINT_COMMITMENT_OR_AUTHORITY_INVALID");
  }
  if (v1 && payload?.taskBinding != null) failures.push("CHECKPOINT_TASK_BINDING_INVALID");
  if (v2 && (!validHash(payload?.taskBinding?.planHash)
    || !validHash(payload?.taskBinding?.taskId)
    || !Array.isArray(payload?.taskBinding?.dependencyCheckpointHashes)
    || payload.taskBinding.dependencyCheckpointHashes.some((hash) => !validHash(hash))
    || !same(payload.taskBinding.dependencyCheckpointHashes,
      uniqueSorted(payload.taskBinding.dependencyCheckpointHashes ?? [])))) {
    failures.push("CHECKPOINT_TASK_BINDING_INVALID");
  }
  return uniqueSorted(failures);
}

export function verifyFederatedWayCheckpoint(record, trustStore) {
  try {
    const failures = [...inspectPublic(record)], { recordHash, ...body } = record ?? {};
    const expectedSchema = record?.signedCheckpoint?.payload?.schema
      === "outsider/federated-way-checkpoint-payload/v2"
      ? FEDERATION_SCHEMAS.checkpointV2 : FEDERATION_SCHEMAS.checkpoint;
    if (record?.schema !== expectedSchema || strictHash(body) !== recordHash) {
      failures.push("CHECKPOINT_RECORD_INVALID");
    }
    const operator = operatorFor(trustStore, record?.operatorKeyId);
    if (!verifyFederationTrustStore(trustStore).ok) failures.push("CHECKPOINT_TRUST_INVALID");
    if (!operator || !verifySigned(record?.signedCheckpoint,
      operator.publicKeyPem, "operator")) failures.push("CHECKPOINT_SIGNATURE_INVALID");
    const payload = record?.signedCheckpoint?.payload;
    failures.push(...checkpointPayloadFailures(payload));
    const instrument = instrumentFor(trustStore, payload?.instrument?.instrumentHash);
    if (!operator || payload?.operatorKeyId !== operator.operatorKeyId
      || payload?.tenantHash !== operator.tenantHash
      || payload?.governanceRootHash !== operator.governanceRootHash
      || payload?.caseRef?.policyHash !== trustStore?.policyHash
      || !instrument || instrument.operatorKeyId !== operator.operatorKeyId
      || !same(payload?.instrument, { instrumentHash: instrument?.instrumentHash,
        instrumentVersionHash: instrument?.instrumentVersionHash,
        adapterHash: instrument?.adapterHash, surface: instrument?.surface,
        controlMode: instrument?.controlMode })) {
      failures.push("CHECKPOINT_TRUST_BINDING_INVALID");
    }
    return Object.freeze({ ok: failures.length === 0,
      failures: uniqueSorted(failures), recordHash: failures.length ? null : recordHash,
      payload: failures.length ? null : payload });
  } catch {
    return Object.freeze({ ok: false, failures: ["CHECKPOINT_MALFORMED"],
      recordHash: null, payload: null });
  }
}

export function createFederatedHandoffOffer({ sourceAttestation, destination,
  artifactHash, scopeHash, expectedOutcomeHash, nonceHash, offeredAt,
  taskBinding = null, senderPrivateKeyPem, trustStore } = {}) {
  const source = verifyFederatedWayAttestation(sourceAttestation, trustStore);
  if (!source.ok) throw new Error("FEDERATION_HANDOFF_SOURCE_INVALID");
  for (const [name, value] of Object.entries({ artifactHash, scopeHash,
    expectedOutcomeHash, nonceHash })) requiredHash(value, name.toUpperCase());
  if (!validTime(offeredAt)) throw new Error("FEDERATION_HANDOFF_TIME_INVALID");
  const senderKeyId = federationKeyId(publicKeyPemFromPrivate(senderPrivateKeyPem));
  const destinationInstrument = instrumentFor(trustStore, destination?.instrumentHash);
  if (senderKeyId !== source.payload.operatorKeyId
    || !operatorFor(trustStore, destination?.operatorKeyId)
    || !destinationInstrument
    || destinationInstrument.operatorKeyId !== destination?.operatorKeyId) {
    throw new Error("FEDERATION_HANDOFF_PARTY_OR_INSTRUMENT_INVALID");
  }
  const v2 = taskBinding != null;
  if (v2 && (!validHash(taskBinding?.planHash) || !validHash(taskBinding?.fromTaskId)
    || !validHash(taskBinding?.toTaskId)
    || taskBinding.fromTaskId === taskBinding.toTaskId)) {
    throw new Error("FEDERATION_HANDOFF_TASK_BINDING_INVALID");
  }
  return signed({ schema: v2 ? "outsider/federated-handoff-offer/v2"
    : "outsider/federated-handoff-offer/v1",
    caseRef: source.payload.caseRef, sourceAttestationHash: source.recordHash,
    fromOperatorKeyId: senderKeyId, fromWayHash: source.payload.way.wayHash,
    destination: { operatorKeyId: destination.operatorKeyId, wayHash: destination.wayHash,
      instrumentHash: destination.instrumentHash }, artifactHash, scopeHash,
    expectedOutcomeHash, nonceHash, offeredAt,
    ...(v2 ? { taskBinding: { planHash: taskBinding.planHash,
      fromTaskId: taskBinding.fromTaskId, toTaskId: taskBinding.toTaskId } } : {}),
    authority: AUTHORITY },
  { privateKeyPem: senderPrivateKeyPem, role: "operator" });
}

export function verifyFederatedHandoffOffer(offerEnvelope, trustStore,
  sourceAttestation) {
  try {
    const failures = [...inspectPublic(offerEnvelope)], offer = offerEnvelope?.payload;
    const sender = operatorFor(trustStore, offer?.fromOperatorKeyId);
    if (!verifyFederationTrustStore(trustStore).ok) failures.push("HANDOFF_TRUST_STORE_INVALID");
    if (!sender || !verifySigned(offerEnvelope, sender.publicKeyPem, "operator")) {
      failures.push("HANDOFF_SENDER_SIGNATURE_INVALID");
    }
    const v1 = offer?.schema === "outsider/federated-handoff-offer/v1";
    const v2 = offer?.schema === "outsider/federated-handoff-offer/v2";
    if ((!v1 && !v2)
      || !same(offer?.authority, AUTHORITY)
      || ![offer?.sourceAttestationHash, offer?.fromOperatorKeyId,
        offer?.fromWayHash, offer?.destination?.operatorKeyId,
        offer?.destination?.wayHash, offer?.destination?.instrumentHash,
        offer?.artifactHash, offer?.scopeHash, offer?.expectedOutcomeHash,
        offer?.nonceHash].every(validHash) || !validTime(offer?.offeredAt)) {
      failures.push("HANDOFF_OFFER_PAYLOAD_INVALID");
    }
    const source = verifyFederatedWayAttestation(sourceAttestation, trustStore);
    if (!source.ok || offer?.sourceAttestationHash !== source.recordHash
      || offer?.fromOperatorKeyId !== source.payload?.operatorKeyId
      || offer?.fromWayHash !== source.payload?.way?.wayHash
      || offer?.artifactHash !== source.payload?.outputArtifactHash
      || !same(offer?.caseRef, source.payload?.caseRef)) {
      failures.push("HANDOFF_SOURCE_BINDING_INVALID");
    }
    if (v1 && offer?.taskBinding != null) failures.push("HANDOFF_TASK_BINDING_INVALID");
    if (v2 && (!validHash(offer?.taskBinding?.planHash)
      || !validHash(offer?.taskBinding?.fromTaskId)
      || !validHash(offer?.taskBinding?.toTaskId)
      || offer.taskBinding.fromTaskId === offer.taskBinding.toTaskId)) {
      failures.push("HANDOFF_TASK_BINDING_INVALID");
    }
    const destinationInstrument = instrumentFor(trustStore,
      offer?.destination?.instrumentHash);
    if (!operatorFor(trustStore, offer?.destination?.operatorKeyId)
      || !destinationInstrument
      || destinationInstrument.operatorKeyId !== offer?.destination?.operatorKeyId) {
      failures.push("HANDOFF_DESTINATION_INVALID");
    }
    return Object.freeze({ ok: failures.length === 0,
      failures: uniqueSorted(failures), offer: failures.length ? null : offer,
      offerHash: failures.length ? null : strictHash(offerEnvelope),
      source: failures.length ? null : source });
  } catch {
    return Object.freeze({ ok: false, failures: ["HANDOFF_OFFER_MALFORMED"],
      offer: null, offerHash: null, source: null });
  }
}

export function acceptFederatedHandoffOffer({ offer, sourceAttestation,
  receivedAt, receiverPrivateKeyPem, trustStore } = {}) {
  const checked = verifyFederatedHandoffOffer(offer, trustStore, sourceAttestation);
  if (!checked.ok) throw new Error(`FEDERATION_HANDOFF_OFFER_INVALID:${checked.failures.join("|")}`);
  if (!validTime(receivedAt)
    || Date.parse(receivedAt) < Date.parse(checked.offer.offeredAt)) {
    throw new Error("FEDERATION_HANDOFF_TIME_INVALID");
  }
  const receiverKeyId = federationKeyId(publicKeyPemFromPrivate(receiverPrivateKeyPem));
  if (receiverKeyId !== checked.offer.destination.operatorKeyId) {
    throw new Error("FEDERATION_HANDOFF_RECEIVER_INVALID");
  }
  const offerHash = strictHash(offer);
  const receipt = signed({ schema: "outsider/federated-handoff-receipt/v1",
    offerHash, receiverKeyId, receivedArtifactHash: checked.offer.artifactHash, receivedAt,
    accepted: true, authority: AUTHORITY },
  { privateKeyPem: receiverPrivateKeyPem, role: "receiver" });
  return addressed({ schema: FEDERATION_SCHEMAS.handoff, offer, receipt });
}

export function createFederatedHandoff({ sourceAttestation, destination,
  artifactHash, scopeHash, expectedOutcomeHash, nonceHash, offeredAt, receivedAt,
  taskBinding = null, senderPrivateKeyPem, receiverPrivateKeyPem, trustStore } = {}) {
  const offer = createFederatedHandoffOffer({ sourceAttestation, destination,
    artifactHash, scopeHash, expectedOutcomeHash, nonceHash, offeredAt,
    taskBinding, senderPrivateKeyPem, trustStore });
  return acceptFederatedHandoffOffer({ offer, sourceAttestation, receivedAt,
    receiverPrivateKeyPem, trustStore });
}

export function verifyFederatedHandoff(record, trustStore, sourceAttestation) {
  try {
    const failures = [...inspectPublic(record)];
    const { recordHash, ...body } = record ?? {};
    if (record?.schema !== FEDERATION_SCHEMAS.handoff || strictHash(body) !== recordHash) {
      failures.push("HANDOFF_RECORD_INVALID");
    }
    const offer = record?.offer?.payload, receipt = record?.receipt?.payload;
    const sender = operatorFor(trustStore, offer?.fromOperatorKeyId);
    const receiver = operatorFor(trustStore, receipt?.receiverKeyId);
    if (!sender || !verifySigned(record?.offer, sender.publicKeyPem, "operator")) {
      failures.push("HANDOFF_SENDER_SIGNATURE_INVALID");
    }
    if (!receiver || !verifySigned(record?.receipt, receiver.publicKeyPem, "receiver")) {
      failures.push("HANDOFF_RECEIVER_SIGNATURE_INVALID");
    }
    const offerV1 = offer?.schema === "outsider/federated-handoff-offer/v1";
    const offerV2 = offer?.schema === "outsider/federated-handoff-offer/v2";
    if ((!offerV1 && !offerV2)
      || receipt?.schema !== "outsider/federated-handoff-receipt/v1"
      || !same(offer?.authority, AUTHORITY) || !same(receipt?.authority, AUTHORITY)
      || ![offer?.sourceAttestationHash, offer?.fromOperatorKeyId,
        offer?.fromWayHash, offer?.destination?.operatorKeyId,
        offer?.destination?.wayHash, offer?.destination?.instrumentHash,
        offer?.artifactHash, offer?.scopeHash, offer?.expectedOutcomeHash,
        offer?.nonceHash].every(validHash)) failures.push("HANDOFF_PAYLOAD_INVALID");
    if (offerV1 && offer?.taskBinding != null) failures.push("HANDOFF_TASK_BINDING_INVALID");
    if (offerV2 && (!validHash(offer?.taskBinding?.planHash)
      || !validHash(offer?.taskBinding?.fromTaskId)
      || !validHash(offer?.taskBinding?.toTaskId)
      || offer.taskBinding.fromTaskId === offer.taskBinding.toTaskId)) {
      failures.push("HANDOFF_TASK_BINDING_INVALID");
    }
    const source = verifyFederatedWayAttestation(sourceAttestation, trustStore);
    if (!source.ok || offer?.sourceAttestationHash !== source.recordHash
      || offer?.fromOperatorKeyId !== source.payload?.operatorKeyId
      || offer?.fromWayHash !== source.payload?.way?.wayHash
      || offer?.artifactHash !== source.payload?.outputArtifactHash
      || !same(offer?.caseRef, source.payload?.caseRef)) failures.push("HANDOFF_SOURCE_BINDING_INVALID");
    const destinationInstrument = instrumentFor(trustStore, offer?.destination?.instrumentHash);
    if (!destinationInstrument
      || destinationInstrument.operatorKeyId !== offer?.destination?.operatorKeyId
      || receipt?.offerHash !== strictHash(record?.offer)
      || receipt?.receiverKeyId !== offer?.destination?.operatorKeyId
      || receipt?.receivedArtifactHash !== offer?.artifactHash || receipt?.accepted !== true
      || !validTime(offer?.offeredAt) || !validTime(receipt?.receivedAt)
      || Date.parse(receipt?.receivedAt ?? "") < Date.parse(offer?.offeredAt ?? "")) {
      failures.push("HANDOFF_DESTINATION_OR_RECEIPT_INVALID");
    }
    return Object.freeze({ ok: failures.length === 0, failures: uniqueSorted(failures),
      recordHash: failures.length ? null : recordHash,
      offer: failures.length ? null : offer, receipt: failures.length ? null : receipt });
  } catch { return Object.freeze({ ok: false, failures: ["HANDOFF_MALFORMED"],
    recordHash: null, offer: null, receipt: null }); }
}

function dedupe(records) {
  const map = new Map(), counts = new Map();
  for (const record of records ?? []) {
    const hash = record?.recordHash ?? strictHash(record);
    counts.set(hash, (counts.get(hash) ?? 0) + 1);
    if (!map.has(hash)) map.set(hash, record);
  }
  return { records: [...map.values()].sort((a, b) => a.recordHash.localeCompare(b.recordHash)),
    inputCount: records?.length ?? 0,
    duplicates: [...counts.entries()].filter(([, count]) => count > 1)
      .map(([recordHash, count]) => ({ recordHash, collapsed: count - 1 }))
      .sort((a, b) => a.recordHash.localeCompare(b.recordHash)) };
}

function derivePacket(attestations, handoffs, trustStore, caseRef, requireConnected) {
  const failures = [...caseFailures(caseRef)], byHash = new Map();
  for (const attestation of attestations) {
    const checked = verifyFederatedWayAttestation(attestation, trustStore);
    if (!checked.ok) failures.push(...checked.failures);
    else if (!same(checked.payload.caseRef, caseRef)) failures.push("WAY_CASE_SUBSTITUTION");
    byHash.set(attestation.recordHash, attestation);
  }
  const incoming = new Map();
  for (const target of attestations) for (const handoffHash of
    target.signedRun.payload.inputHandoffHashes) {
    if (!incoming.has(handoffHash)) incoming.set(handoffHash, []);
    incoming.get(handoffHash).push(target);
  }
  const edges = [];
  for (const handoff of handoffs) {
    const source = byHash.get(handoff?.offer?.payload?.sourceAttestationHash);
    const checked = verifyFederatedHandoff(handoff, trustStore, source);
    if (!checked.ok) { failures.push(...checked.failures); continue; }
    const targets = incoming.get(handoff.recordHash) ?? [];
    if (targets.length !== 1) { failures.push("HANDOFF_TARGET_CARDINALITY_INVALID"); continue; }
    const target = targets[0].signedRun.payload;
    if (target.operatorKeyId !== checked.offer.destination.operatorKeyId
      || target.way.wayHash !== checked.offer.destination.wayHash
      || target.instrument.instrumentHash !== checked.offer.destination.instrumentHash
      || Date.parse(target.observation.observedAt) < Date.parse(checked.receipt.receivedAt)) {
      failures.push("HANDOFF_TARGET_BINDING_INVALID");
    }
    edges.push([source.recordHash, targets[0].recordHash]);
  }
  for (const hash of incoming.keys()) if (!handoffs.some((record) => record.recordHash === hash)) {
    failures.push("WAY_INPUT_HANDOFF_MISSING");
  }
  const adjacency = new Map(attestations.map((record) => [record.recordHash, []]));
  for (const [from, to] of edges) { adjacency.get(from)?.push(to); adjacency.get(to)?.push(from); }
  if (requireConnected && attestations.length > 1) {
    const reached = new Set(), todo = [attestations[0].recordHash];
    while (todo.length) { const node = todo.pop(); if (reached.has(node)) continue;
      reached.add(node); todo.push(...(adjacency.get(node) ?? [])); }
    if (reached.size !== attestations.length) failures.push("HANDOFF_GRAPH_DISCONNECTED");
  }
  const directed = new Map(attestations.map((record) => [record.recordHash, []]));
  for (const [from, to] of edges) directed.get(from)?.push(to);
  const visiting = new Set(), visited = new Set();
  const acyclic = (node) => { if (visiting.has(node)) return false; if (visited.has(node)) return true;
    visiting.add(node); for (const child of directed.get(node) ?? []) if (!acyclic(child)) return false;
    visiting.delete(node); visited.add(node); return true; };
  if ([...directed.keys()].some((node) => !acyclic(node))) failures.push("HANDOFF_GRAPH_CYCLE");
  const cohorts = new Map(), correlationOwners = new Map();
  attestations.forEach((record, index) => {
    const payload = record.signedRun.payload;
    const cohortHash = strictHash({ instrumentHash: payload.instrument.instrumentHash,
      instrumentVersionHash: payload.instrument.instrumentVersionHash });
    if (!cohorts.has(cohortHash)) cohorts.set(cohortHash, []);
    cohorts.get(cohortHash).push(record.recordHash);
    for (const root of payload.correlationRootHashes) {
      if (!correlationOwners.has(root)) correlationOwners.set(root, []);
      correlationOwners.get(root).push(index);
    }
  });
  const parent = attestations.map((_, index) => index);
  const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const join = (a, b) => { const left = find(a), right = find(b); if (left !== right) parent[right] = left; };
  for (const indices of correlationOwners.values()) for (let i = 1; i < indices.length; i++) {
    join(indices[0], indices[i]);
  }
  const components = new Map();
  attestations.forEach((record, index) => { const root = find(index);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(record.recordHash); });
  const correlationComponents = [...components.values()].map((values) => values.sort())
    .sort((a, b) => a[0].localeCompare(b[0]));
  return { failures: uniqueSorted(failures), edges: edges.sort(),
    cohorts: [...cohorts.entries()].map(([cohortHash, hashes]) => ({ cohortHash,
      wayAttestationHashes: hashes.sort() })).sort((a, b) => a.cohortHash.localeCompare(b.cohortHash)),
    correlation: { nominalWayRuns: attestations.length, correlationComponents,
      structuralIndependentUpperBound: correlationComponents.length,
      independenceStatus: "NOT_ESTABLISHED_BY_KEYS_OR_CONFIGURATION" },
    operatorKeyIds: uniqueSorted(attestations.map((record) => record.signedRun.payload.operatorKeyId)),
    participantTenantHashes: uniqueSorted(attestations.map((record) => record.signedRun.payload.tenantHash)),
    wayHashes: uniqueSorted(attestations.map((record) => record.signedRun.payload.way.wayHash)) };
}

export function createFederatedEvidencePacket({ caseRef, wayAttestations = [], handoffs = [],
  trustStore, createdAt, requireConnected = true } = {}) {
  if (!validTime(createdAt)) throw new Error("FEDERATION_PACKET_TIME_INVALID");
  const ways = dedupe(wayAttestations), transfers = dedupe(handoffs);
  if (!ways.records.length) throw new Error("FEDERATION_PACKET_EMPTY");
  const derived = derivePacket(ways.records, transfers.records, trustStore, caseRef,
    requireConnected);
  if (derived.failures.length) throw new Error(`FEDERATION_PACKET_INVALID:${derived.failures.join("|")}`);
  return addressed({ schema: FEDERATION_SCHEMAS.packet, caseRef, createdAt, requireConnected,
    wayAttestations: ways.records, handoffs: transfers.records,
    wayAttestationCommitment: strictHash(ways.records.map((record) => record.recordHash)),
    handoffCommitment: strictHash(transfers.records.map((record) => record.recordHash)),
    dedupDisclosure: { wayInputs: ways.inputCount, uniqueWayAttestations: ways.records.length,
      wayDuplicatesCollapsed: ways.inputCount - ways.records.length,
      wayDuplicateHashes: ways.duplicates, handoffInputs: transfers.inputCount,
      uniqueHandoffs: transfers.records.length,
      handoffDuplicatesCollapsed: transfers.inputCount - transfers.records.length,
      handoffDuplicateHashes: transfers.duplicates },
    instrumentPolicy: { pooledAcrossInstruments: false,
      rule: "D2_PARTITION_BY_EXACT_INSTRUMENT_AND_VERSION", cohorts: derived.cohorts },
    handoffGraph: derived.edges, correlation: derived.correlation,
    operatorKeyIds: derived.operatorKeyIds,
    participantTenantHashes: derived.participantTenantHashes,
    wayHashes: derived.wayHashes, evidenceLevel: "L1",
    authority: AUTHORITY,
    privacy: { rawEvidenceLocation: "OPERATOR_LOCAL", publicProjectionOnly: true } });
}

export function verifyFederatedEvidencePacket(packet, trustStore) {
  try {
    const failures = [...inspectPublic(packet)], { recordHash, ...body } = packet ?? {};
    if (packet?.schema !== FEDERATION_SCHEMAS.packet || strictHash(body) !== recordHash
      || !validTime(packet.createdAt) || packet.evidenceLevel !== "L1"
      || !same(packet.authority, AUTHORITY)
      || packet?.privacy?.rawEvidenceLocation !== "OPERATOR_LOCAL"
      || packet?.privacy?.publicProjectionOnly !== true) failures.push("PACKET_BODY_INVALID");
    const attestations = Array.isArray(packet?.wayAttestations) ? packet.wayAttestations : [];
    const handoffs = Array.isArray(packet?.handoffs) ? packet.handoffs : [];
    if (!attestations.length || new Set(attestations.map((record) => record.recordHash)).size
      !== attestations.length || new Set(handoffs.map((record) => record.recordHash)).size
      !== handoffs.length) failures.push("PACKET_RECORD_SET_INVALID");
    const derived = derivePacket(attestations, handoffs, trustStore, packet?.caseRef,
      packet?.requireConnected === true);
    failures.push(...derived.failures);
    if (packet.wayAttestationCommitment !== strictHash(attestations.map((record) => record.recordHash))
      || packet.handoffCommitment !== strictHash(handoffs.map((record) => record.recordHash))
      || !same(packet.handoffGraph, derived.edges)
      || !same(packet.correlation, derived.correlation)
      || !same(packet.operatorKeyIds, derived.operatorKeyIds)
      || !same(packet.participantTenantHashes, derived.participantTenantHashes)
      || !same(packet.wayHashes, derived.wayHashes)
      || packet.instrumentPolicy?.pooledAcrossInstruments !== false
      || !same(packet.instrumentPolicy?.cohorts, derived.cohorts)) failures.push("PACKET_DERIVATION_INVALID");
    const disclosure = packet?.dedupDisclosure;
    const duplicateSets = [[disclosure?.wayDuplicateHashes, new Set(attestations.map((r) => r.recordHash)),
      disclosure?.wayDuplicatesCollapsed], [disclosure?.handoffDuplicateHashes,
      new Set(handoffs.map((r) => r.recordHash)), disclosure?.handoffDuplicatesCollapsed]];
    if (!Number.isInteger(disclosure?.wayInputs)
      || !Number.isInteger(disclosure?.wayDuplicatesCollapsed)
      || !Number.isInteger(disclosure?.handoffInputs)
      || !Number.isInteger(disclosure?.handoffDuplicatesCollapsed)
      || disclosure?.wayInputs < attestations.length
      || disclosure?.handoffInputs < handoffs.length
      || disclosure?.uniqueWayAttestations !== attestations.length
      || disclosure?.uniqueHandoffs !== handoffs.length
      || disclosure?.wayInputs - attestations.length !== disclosure?.wayDuplicatesCollapsed
      || disclosure?.handoffInputs - handoffs.length !== disclosure?.handoffDuplicatesCollapsed) {
      failures.push("PACKET_D1_DISCLOSURE_INVALID");
    }
    for (const [duplicates, admitted, total] of duplicateSets) {
      let count = 0; const seen = new Set();
      if (!Array.isArray(duplicates)) { failures.push("PACKET_D1_DISCLOSURE_INVALID"); continue; }
      for (const duplicate of duplicates) {
        if (!admitted.has(duplicate?.recordHash) || seen.has(duplicate?.recordHash)
          || !Number.isInteger(duplicate?.collapsed) || duplicate.collapsed < 1) {
          failures.push("PACKET_D1_DUPLICATE_INVALID");
        }
        seen.add(duplicate?.recordHash); count += duplicate?.collapsed ?? 0;
      }
      if (count !== total) failures.push("PACKET_D1_DUPLICATE_TOTAL_INVALID");
    }
    const latestEvidence = Math.max(...attestations.map((record) =>
      Date.parse(record.signedRun.payload.observation.observedAt)),
    ...handoffs.map((record) => Date.parse(record.receipt.payload.receivedAt)), -Infinity);
    if (Date.parse(packet.createdAt) < latestEvidence) failures.push("PACKET_CREATED_BEFORE_EVIDENCE");
    return Object.freeze({ ok: failures.length === 0, failures: uniqueSorted(failures),
      recordHash: failures.length ? null : recordHash,
      summary: failures.length ? null : { wayRuns: attestations.length,
        handoffs: handoffs.length, operators: derived.operatorKeyIds.length,
        correlationComponents: derived.correlation.correlationComponents.length,
        structuralIndependentUpperBound: derived.correlation.structuralIndependentUpperBound,
        institutionalIndependence: derived.correlation.independenceStatus } });
  } catch { return Object.freeze({ ok: false, failures: ["FEDERATED_PACKET_MALFORMED"],
    recordHash: null, summary: null }); }
}

export class GlobalOutsiderRegistry {
  constructor({ trustStore, registryId = "global-outsider" } = {}) {
    if (!verifyFederationTrustStore(trustStore).ok) throw new Error("FEDERATION_REGISTRY_TRUST_INVALID");
    this.trustStore = trustStore; this.registryId = registryId;
    this.entries = []; this.packets = new Map(); this.nonces = new Map();
    this.head = null; this.duplicatesCollapsed = 0;
  }
  append(packet) {
    const verified = verifyFederatedEvidencePacket(packet, this.trustStore);
    if (!verified.ok) throw new Error(`FEDERATION_REGISTRY_PACKET_INVALID:${verified.failures.join("|")}`);
    if (this.packets.has(packet.recordHash)) { this.duplicatesCollapsed++;
      return Object.freeze({ appended: false, reason: "DUPLICATE_PACKET_HASH" }); }
    for (const handoff of packet.handoffs) {
      const nonce = handoff.offer.payload.nonceHash, prior = this.nonces.get(nonce);
      if (prior && prior !== handoff.recordHash) throw new Error("FEDERATION_HANDOFF_REPLAY");
    }
    const body = { seq: this.entries.length, packetHash: packet.recordHash,
      participantTenantHashes: packet.participantTenantHashes,
      previousEntryHash: this.head };
    const entry = Object.freeze({ ...body, entryHash: strictHash(body) });
    this.entries.push(entry); this.head = entry.entryHash;
    this.packets.set(packet.recordHash, packet);
    packet.handoffs.forEach((handoff) => this.nonces.set(handoff.offer.payload.nonceHash,
      handoff.recordHash));
    return Object.freeze({ appended: true, seq: entry.seq, entryHash: entry.entryHash });
  }
  packetForTenant(recordHash, tenantHash) {
    const packet = this.packets.get(recordHash);
    return validHash(tenantHash) && packet?.participantTenantHashes.includes(tenantHash)
      ? packet : null;
  }
  verify() {
    let prior = null; const failures = [];
    for (const entry of this.entries) {
      const { entryHash, ...body } = entry;
      if (entry.previousEntryHash !== prior || strictHash(body) !== entryHash
        || !verifyFederatedEvidencePacket(this.packets.get(entry.packetHash),
          this.trustStore).ok) failures.push("FEDERATION_REGISTRY_CHAIN_INVALID");
      prior = entryHash;
    }
    return Object.freeze({ ok: failures.length === 0,
      failures: uniqueSorted(failures), entries: this.entries.length, head: this.head });
  }
  summary() {
    return Object.freeze({ schema: FEDERATION_SCHEMAS.registry,
      registryId: this.registryId, chain: this.verify(), packets: this.entries.length,
      duplicatesCollapsed: this.duplicatesCollapsed,
      institutionalIndependence: "NOT_ESTABLISHED_BY_KEYS_OR_CONFIGURATION",
      authority: AUTHORITY });
  }
}

export function createFederatedSupervisionRecord(packet, trustStore) {
  const verified = verifyFederatedEvidencePacket(packet, trustStore);
  if (!verified.ok) throw new Error("FEDERATED_SUPERVISION_PACKET_INVALID");
  const observations = packet.wayAttestations.map((record) => record.signedRun.payload.observation);
  const body = { schema: "outsider/federated-supervision/v1",
    packetHash: packet.recordHash, caseRefHash: strictHash(packet.caseRef),
    observedAt: packet.createdAt,
    observed: { wayRuns: observations.length, handoffs: packet.handoffs.length,
      deliveries: observations.filter((item) => item.establishesObservedDelivery).length,
      effects: observations.filter((item) => item.establishesEffect).length,
      outcomes: observations.filter((item) => item.establishesOutcome).length,
      controlModes: Object.fromEntries(FEDERATION_CONTROL_MODES.map((mode) => [mode,
        observations.filter((item) => item.controlMode === mode).length])),
      instrumentCohorts: packet.instrumentPolicy.cohorts.length,
      instrumentCohortHashes: packet.instrumentPolicy.cohorts
        .map((cohort) => cohort.cohortHash).sort(),
      operatorKeyIds: [...packet.operatorKeyIds], wayHashes: [...packet.wayHashes],
      nominalWayRuns: packet.correlation.nominalWayRuns,
      structuralIndependentUpperBound: packet.correlation.structuralIndependentUpperBound,
      institutionalIndependence: packet.correlation.independenceStatus },
    learning: { eligibleForRoutingResearch: true,
      eligibleForGlobalCausalEffectLearning: false,
      eligibleForReliabilityGuarantee: false, eligibleForPricing: false,
      reason: "federated observations and handoffs are not randomized treatment or loss evidence" },
    authority: AUTHORITY };
  return addressed(body);
}

export { AUTHORITY as FEDERATION_AUTHORITY };
