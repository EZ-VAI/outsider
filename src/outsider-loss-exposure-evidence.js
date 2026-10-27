/*
 * Local loss/exposure evidence boundary for the Stage 2 research bridge.
 *
 * This module does not price, insure, reserve capital, settle, or promote a
 * locally configured key to L3/L4 evidence.  It accepts signed, complete
 * exposure windows into quarantine, binds a separately signed adjudication
 * and fraud review, preserves every dependence root, and emits only the
 * sufficient statistics required by later Beta-Binomial,
 * Buehlmann-Straub, and TVaR research.
 *
 * Benchmark spend, token cost, failed-attempt cost, robot reward, estimated
 * damage, and DROID/historical robot observations are structurally outside
 * this schema.  A zero-loss window is represented by an empty incidents
 * array; deleting those windows destroys the denominator and is disclosed.
 */

import {
  createHash, createPrivateKey, createPublicKey, sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const LOSS_EXPOSURE_SCHEMAS = Object.freeze({
  observation: "outsider/loss-exposure-observation/v1",
  quarantine: "outsider/loss-exposure-quarantine/v1",
  fraudReview: "outsider/loss-exposure-fraud-review/v1",
  adjudication: "outsider/loss-exposure-adjudication/v1",
  researchRow: "outsider/loss-exposure-research-row/v1",
  shadowBook: "outsider/loss-exposure-shadow-book/v1",
});

export const LOSS_EXPOSURE_SOURCE_CLASSES = Object.freeze([
  "CUSTOMER_PRODUCTION",
  "PROSPECTIVE_DESIGN_PARTNER",
  "PUBLIC_REGULATORY_COMPLETE_WINDOW",
]);

export const LOSS_EXPOSURE_UNITS = Object.freeze([
  "ACTION",
  "DEVICE_HOUR",
  "ROBOT_HOUR",
  "RUN",
  "TRANSACTION",
]);

export const OBSERVED_ECONOMIC_LOSS_BASES = Object.freeze([
  "ACCOUNTING_RECOGNIZED",
  "CLAIM_PAID",
  "INVOICE_VERIFIED",
  "LEDGER_POSTED",
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const CURRENCY = /^[A-Z]{3}$/;
const BASE64_SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;
const GENESIS = digestDomain("outsider/loss-exposure-quarantine/genesis/v1", {});
const SOURCE_CLASS_SET = new Set(LOSS_EXPOSURE_SOURCE_CLASSES);
const EXPOSURE_UNIT_SET = new Set(LOSS_EXPOSURE_UNITS);
const LOSS_BASIS_SET = new Set(OBSERVED_ECONOMIC_LOSS_BASES);
const FRAUD_STATUSES = new Set(["CLEAR", "CONFIRMED", "PENDING", "SUSPECTED"]);
const ADJUDICATION_STATUSES = new Set(["FINAL", "PROVISIONAL"]);
const DISPOSITIONS = new Set([
  "LOSS_CONFIRMED", "NO_LOSS", "REPORTED_LOSS_DENIED", "FRAUD_REJECTED",
]);
const APPEAL_STATUSES = new Set(["NONE", "EXHAUSTED", "PENDING"]);

const CLAIM_BOUNDARY_KEYS = Object.freeze([
  "automaticTraining",
  "benchmarkSpendUsedAsLoss",
  "droidOrHistoricalRobotCorpusUsedAsLoss",
  "estimatedDamageUsedAsLoss",
  "failedAttemptCostUsedAsLoss",
  "modelTokenCostUsedAsLoss",
  "robotRewardUsedAsLoss",
]);

const AUTHORITY_KEYS = Object.freeze([
  "movesFunds", "permitsCapital", "permitsCoverage", "permitsPricing",
  "permitsSettlement",
]);

function digest(value) {
  return `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
}

function digestDomain(domain, value) {
  return digest({ domain, value });
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function sortedUniqueHashes(values, { minimum = 0, maximum = 128 } = {}) {
  return Array.isArray(values) && values.length >= minimum && values.length <= maximum
    && values.every((value) => HASH.test(String(value ?? "")))
    && new Set(values).size === values.length
    && canonicalizeStrict(values) === canonicalizeStrict([...values].sort());
}

function boundedCanonical(value, maximumBytes, problems, code) {
  try {
    if (Buffer.byteLength(canonicalizeStrict(value), "utf8") > maximumBytes) {
      problems.push(`${code}_TOO_LARGE`);
    }
  } catch { problems.push(`${code}_NOT_CANONICAL`); }
}

function checkedSafeSum(values, code) {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) throw new Error(`${code}_INPUT_NOT_SAFE_INTEGER`);
    total += value;
    if (!Number.isSafeInteger(total)) throw new Error(`${code}_OVERFLOW`);
  }
  return total;
}

function canonicalTime(value, code) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${code}_INVALID`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(`${code}_NON_CANONICAL`);
  return normalized;
}

function safeTime(value, code, problems) {
  try { return canonicalTime(value, code); }
  catch (error) { problems.push(error.message); return null; }
}

function keyIdFor(publicKeyPem) {
  const publicKey = createPublicKey(publicKeyPem);
  if (publicKey.asymmetricKeyType !== "ed25519") throw new Error("LOSS_EXPOSURE_KEY_NOT_ED25519");
  const der = publicKey.export({ type: "spki", format: "der" });
  return digestDomain("outsider/ed25519-public-key/v1", der.toString("base64"));
}

export function lossExposurePublicKeyId(publicKeyPem) {
  if (typeof publicKeyPem !== "string" || publicKeyPem.length > 1024
    || publicKeyPem.includes("PRIVATE KEY")) {
    throw new Error("LOSS_EXPOSURE_PUBLIC_KEY_INVALID");
  }
  return keyIdFor(publicKeyPem);
}

function roleEntry(trustStore, role, keyId, problems, effectiveAt = null) {
  const entry = trustStore?.[role]?.[keyId];
  if (!exactKeys(entry, ["publicKeyPem", "domainRootHash", "controlRootHash",
    "conformanceOnly", "policyVersionHash", "validFrom", "validUntil",
    "revokedAt"])) {
    problems.push(`${role.toUpperCase()}_TRUST_ENTRY_MISSING_OR_INVALID`);
    return null;
  }
  if (typeof entry.publicKeyPem !== "string" || entry.publicKeyPem.includes("PRIVATE KEY")
    || entry.conformanceOnly !== true
    || !HASH.test(entry.domainRootHash) || !HASH.test(entry.controlRootHash)
    || !HASH.test(entry.policyVersionHash)) {
    problems.push(`${role.toUpperCase()}_TRUST_ENTRY_INVALID`);
    return null;
  }
  try {
    if (keyIdFor(entry.publicKeyPem) !== keyId) {
      problems.push(`${role.toUpperCase()}_TRUST_KEY_ID_MISMATCH`);
      return null;
    }
  } catch { problems.push(`${role.toUpperCase()}_TRUST_KEY_INVALID`); return null; }
  const validFrom = safeTime(entry.validFrom, `${role.toUpperCase()}_TRUST_VALID_FROM`, problems);
  const validUntil = entry.validUntil === null ? null
    : safeTime(entry.validUntil, `${role.toUpperCase()}_TRUST_VALID_UNTIL`, problems);
  const revokedAt = entry.revokedAt === null ? null
    : safeTime(entry.revokedAt, `${role.toUpperCase()}_TRUST_REVOKED_AT`, problems);
  const effective = effectiveAt === null ? null
    : safeTime(effectiveAt, `${role.toUpperCase()}_TRUST_EFFECTIVE_TIME`, problems);
  if (validUntil && validFrom && Date.parse(validUntil) <= Date.parse(validFrom)) {
    problems.push(`${role.toUpperCase()}_TRUST_VALIDITY_WINDOW_INVALID`);
  }
  if (revokedAt && validFrom && Date.parse(revokedAt) <= Date.parse(validFrom)) {
    problems.push(`${role.toUpperCase()}_TRUST_REVOCATION_TIME_INVALID`);
  }
  if (effective && validFrom && Date.parse(effective) < Date.parse(validFrom)) {
    problems.push(`${role.toUpperCase()}_TRUST_NOT_YET_VALID`);
  }
  if (effective && validUntil && Date.parse(effective) >= Date.parse(validUntil)) {
    problems.push(`${role.toUpperCase()}_TRUST_EXPIRED`);
  }
  if (effective && revokedAt && Date.parse(effective) >= Date.parse(revokedAt)) {
    problems.push(`${role.toUpperCase()}_TRUST_REVOKED`);
  }
  return entry;
}

function signatureMessage(schema, contentHash) {
  return Buffer.from(`${schema}\0${contentHash}`, "utf8");
}

function makeSignature(schema, contentHash, privateKeyPem) {
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("LOSS_EXPOSURE_SIGNING_KEY_NOT_ED25519");
  }
  const publicKeyPem = createPublicKey(privateKey)
    .export({ type: "spki", format: "pem" }).toString();
  return Object.freeze({
    algorithm: "Ed25519",
    keyId: keyIdFor(publicKeyPem),
    value: cryptoSign(null, signatureMessage(schema, contentHash), privateKey)
      .toString("base64"),
  });
}

function verifyEnvelopeSignature(envelope, schema, hashField, role, trustStore, problems,
  effectiveAt = null) {
  const signature = envelope?.signature;
  if (!exactKeys(signature, ["algorithm", "keyId", "value"])
    || signature.algorithm !== "Ed25519"
    || !HASH.test(signature.keyId)
    || typeof signature.value !== "string"
    || !BASE64_SIGNATURE.test(signature.value)
    || Buffer.from(signature.value, "base64").length !== 64) {
    problems.push(`${role.toUpperCase()}_SIGNATURE_INVALID`);
    return null;
  }
  const entry = roleEntry(trustStore, role, signature.keyId, problems, effectiveAt);
  if (!entry) return null;
  try {
    const ok = cryptoVerify(null, signatureMessage(schema, envelope[hashField]),
      createPublicKey(entry.publicKeyPem), Buffer.from(signature.value, "base64"));
    if (!ok) problems.push(`${role.toUpperCase()}_SIGNATURE_INVALID`);
  } catch { problems.push(`${role.toUpperCase()}_SIGNATURE_INVALID`); }
  return entry;
}

function validateIncident(incident, window, problems, prefix = "INCIDENT") {
  if (!exactKeys(incident, ["incidentIdHash", "claimIdHash", "occurredAt", "currency",
    "grossAmountMinorUnits", "recoveryAmountMinorUnits", "economicLossBasis",
    "lossEvidenceHashes"])) {
    problems.push(`${prefix}_SCHEMA_INVALID`);
    return;
  }
  if (!HASH.test(incident.incidentIdHash) || !HASH.test(incident.claimIdHash)) {
    problems.push(`${prefix}_IDENTITY_INVALID`);
  }
  const occurredAt = safeTime(incident.occurredAt, `${prefix}_TIME`, problems);
  if (occurredAt && (Date.parse(occurredAt) < Date.parse(window.startAt)
    || Date.parse(occurredAt) > Date.parse(window.endAt))) {
    problems.push(`${prefix}_OUTSIDE_EXPOSURE_WINDOW`);
  }
  if (!CURRENCY.test(String(incident.currency ?? ""))
    || incident.currency !== window.reportingCurrency) {
    problems.push(`${prefix}_CURRENCY_INVALID_OR_MISMATCH`);
  }
  if (!Number.isSafeInteger(incident.grossAmountMinorUnits)
    || incident.grossAmountMinorUnits <= 0
    || !Number.isSafeInteger(incident.recoveryAmountMinorUnits)
    || incident.recoveryAmountMinorUnits < 0
    || incident.recoveryAmountMinorUnits > incident.grossAmountMinorUnits) {
    problems.push(`${prefix}_AMOUNT_INVALID`);
  }
  if (!LOSS_BASIS_SET.has(incident.economicLossBasis)) {
    problems.push(`${prefix}_NOT_OBSERVED_ECONOMIC_LOSS`);
  }
  if (!sortedUniqueHashes(incident.lossEvidenceHashes, { minimum: 1 })) {
    problems.push(`${prefix}_EVIDENCE_INVALID`);
  }
}

function validateIncidents(incidents, window, problems, prefix = "INCIDENT") {
  if (!Array.isArray(incidents) || incidents.length > 100) {
    problems.push(`${prefix}_SET_INVALID`);
    return;
  }
  const identities = new Set();
  for (const incident of incidents) {
    validateIncident(incident, window, problems, prefix);
    const identity = `${incident?.incidentIdHash ?? ""}\0${incident?.claimIdHash ?? ""}`;
    if (identities.has(identity)) problems.push(`${prefix}_DUPLICATE_IDENTITY`);
    identities.add(identity);
  }
  const sorted = [...incidents].sort((left, right) => (
    `${left.incidentIdHash}\0${left.claimIdHash}`
      .localeCompare(`${right.incidentIdHash}\0${right.claimIdHash}`)
  ));
  if (canonicalizeStrict(incidents) !== canonicalizeStrict(sorted)) {
    problems.push(`${prefix}_SET_NOT_CANONICALLY_SORTED`);
  }
}

function validateObservationPayload(payload, now, problems) {
  if (!exactKeys(payload, ["sourceClass", "sourceRecordIdHash", "operatorDomainRootHash",
    "operatorControlRootHash", "systemRootHash", "instrumentHash", "policyHash",
    "assignmentAt", "observedAt", "window", "reportedIncidents", "provenance",
    "correlationRoots", "claimBoundary"])) {
    problems.push("OBSERVATION_PAYLOAD_SCHEMA_INVALID");
    return;
  }
  boundedCanonical(payload, 512 * 1024, problems, "OBSERVATION_PAYLOAD");
  if (!SOURCE_CLASS_SET.has(payload.sourceClass)) problems.push("SOURCE_CLASS_NOT_ADMISSIBLE");
  for (const field of ["sourceRecordIdHash", "operatorDomainRootHash",
    "operatorControlRootHash", "systemRootHash", "instrumentHash", "policyHash"]) {
    if (!HASH.test(String(payload[field] ?? ""))) problems.push(`OBSERVATION_${field.toUpperCase()}_INVALID`);
  }
  const assignmentAt = safeTime(payload.assignmentAt, "ASSIGNMENT_TIME", problems);
  const observedAt = safeTime(payload.observedAt, "OBSERVATION_TIME", problems);
  const at = safeTime(now, "VERIFICATION_TIME", problems);
  const window = payload.window;
  if (!exactKeys(window, ["windowIdHash", "populationRootHash", "populationManifestHash",
    "startAt", "endAt", "status", "exposureUnit", "unitDefinitionHash",
    "quantityMicrounits", "reportingCurrency"])) {
    problems.push("EXPOSURE_WINDOW_SCHEMA_INVALID");
    return;
  }
  for (const field of ["windowIdHash", "populationRootHash", "populationManifestHash",
    "unitDefinitionHash"]) {
    if (!HASH.test(String(window[field] ?? ""))) problems.push(`EXPOSURE_${field.toUpperCase()}_INVALID`);
  }
  const startAt = safeTime(window.startAt, "EXPOSURE_START_TIME", problems);
  const endAt = safeTime(window.endAt, "EXPOSURE_END_TIME", problems);
  if (window.status !== "CLOSED") problems.push("EXPOSURE_WINDOW_NOT_CLOSED");
  if (!EXPOSURE_UNIT_SET.has(window.exposureUnit)) problems.push("EXPOSURE_UNIT_INVALID");
  if (!Number.isSafeInteger(window.quantityMicrounits) || window.quantityMicrounits <= 0) {
    problems.push("EXPOSURE_DENOMINATOR_INVALID");
  }
  if (!CURRENCY.test(String(window.reportingCurrency ?? ""))) {
    problems.push("EXPOSURE_REPORTING_CURRENCY_INVALID");
  }
  if (assignmentAt && startAt && Date.parse(assignmentAt) > Date.parse(startAt)) {
    problems.push("ASSIGNMENT_AFTER_EXPOSURE_START");
  }
  if (startAt && endAt && Date.parse(startAt) >= Date.parse(endAt)) {
    problems.push("EXPOSURE_WINDOW_ORDER_INVALID");
  }
  if (endAt && observedAt && Date.parse(endAt) > Date.parse(observedAt)) {
    problems.push("OBSERVATION_BEFORE_EXPOSURE_CLOSE");
  }
  if (observedAt && at && Date.parse(observedAt) > Date.parse(at)) {
    problems.push("OBSERVATION_IN_FUTURE");
  }
  validateIncidents(payload.reportedIncidents, window, problems, "REPORTED_INCIDENT");
  const provenance = payload.provenance;
  if (!exactKeys(provenance, ["sourceSystemHash", "collectionMethodHash",
    "sourceEvidenceHashes", "licenseStatus", "licenseEvidenceHash",
    "researchUsePermitted", "pricingUsePermitted", "piiIncluded",
    "rawPayloadRetainedByOutsider"])) {
    problems.push("PROVENANCE_SCHEMA_INVALID");
  } else {
    if (!HASH.test(provenance.sourceSystemHash)
      || !HASH.test(provenance.collectionMethodHash)
      || !HASH.test(provenance.licenseEvidenceHash)
      || !sortedUniqueHashes(provenance.sourceEvidenceHashes, { minimum: 1 })) {
      problems.push("PROVENANCE_HASHES_INVALID");
    }
    if (provenance.licenseStatus !== "VERIFIED"
      || provenance.researchUsePermitted !== true
      || typeof provenance.pricingUsePermitted !== "boolean"
      || provenance.piiIncluded !== false
      || provenance.rawPayloadRetainedByOutsider !== false) {
      problems.push("PROVENANCE_RIGHTS_OR_PRIVACY_INVALID");
    }
  }
  if (!sortedUniqueHashes(payload.correlationRoots, { minimum: 1 })
    || !payload.correlationRoots.includes(payload.operatorDomainRootHash)
    || !payload.correlationRoots.includes(payload.operatorControlRootHash)
    || !payload.correlationRoots.includes(payload.systemRootHash)) {
    problems.push("CORRELATION_ROOTS_INVALID_OR_INCOMPLETE");
  }
  if (!exactKeys(payload.claimBoundary, CLAIM_BOUNDARY_KEYS)
    || CLAIM_BOUNDARY_KEYS.some((key) => payload.claimBoundary[key] !== false)) {
    problems.push("PROHIBITED_PROXY_LOSS_OR_AUTOMATIC_TRAINING_BOUNDARY_INVALID");
  }
}

export function signLossExposureObservation(payload, { privateKeyPem } = {}) {
  const problems = [];
  validateObservationPayload(payload, new Date().toISOString(), problems);
  if (problems.length) throw new Error(`LOSS_EXPOSURE_OBSERVATION_INVALID:${[...new Set(problems)].join(",")}`);
  const sourceObservationHash = digestDomain(LOSS_EXPOSURE_SCHEMAS.observation, payload);
  return Object.freeze({
    schema: LOSS_EXPOSURE_SCHEMAS.observation,
    payload: structuredClone(payload),
    sourceObservationHash,
    signature: makeSignature(LOSS_EXPOSURE_SCHEMAS.observation,
      sourceObservationHash, privateKeyPem),
  });
}

export function verifyLossExposureObservation(envelope,
  { trustStore, now = new Date().toISOString() } = {}) {
  const problems = [];
  if (!exactKeys(envelope, ["schema", "payload", "sourceObservationHash", "signature"])
    || envelope?.schema !== LOSS_EXPOSURE_SCHEMAS.observation
    || !HASH.test(String(envelope?.sourceObservationHash ?? ""))) {
    problems.push("OBSERVATION_ENVELOPE_SCHEMA_INVALID");
  }
  if (envelope?.payload) validateObservationPayload(envelope.payload, now, problems);
  if (envelope?.payload
    && digestDomain(LOSS_EXPOSURE_SCHEMAS.observation, envelope.payload)
      !== envelope.sourceObservationHash) {
    problems.push("SOURCE_OBSERVATION_HASH_INVALID");
  }
  const operator = verifyEnvelopeSignature(envelope, LOSS_EXPOSURE_SCHEMAS.observation,
    "sourceObservationHash", "operators", trustStore, problems,
    envelope?.payload?.observedAt ?? null);
  if (operator && envelope?.payload
    && (operator.domainRootHash !== envelope.payload.operatorDomainRootHash
      || operator.controlRootHash !== envelope.payload.operatorControlRootHash)) {
    problems.push("OPERATOR_POLICY_ROOT_BINDING_INVALID");
  }
  return Object.freeze({
    ok: problems.length === 0,
    failures: Object.freeze([...new Set(problems)]),
    envelopeHash: problems.length ? null
      : digestDomain("outsider/loss-exposure-observation-envelope/v1", envelope),
    operatorKeyId: problems.length ? null : envelope.signature.keyId,
    trustPolicyVersionHash: problems.length ? null : operator.policyVersionHash,
    evidenceLevel: problems.length ? null : "L2_LOCAL_POLICY_CONFORMANCE_ONLY",
    externallyGoverned: false,
  });
}

function semanticWindowHash(payload) {
  return digestDomain("outsider/loss-exposure-semantic-window/v1", {
    systemRootHash: payload.systemRootHash,
    windowIdHash: payload.window.windowIdHash,
    populationRootHash: payload.window.populationRootHash,
    exposureUnit: payload.window.exposureUnit,
    unitDefinitionHash: payload.window.unitDefinitionHash,
  });
}

function overlapScopeHash(payload) {
  return digestDomain("outsider/loss-exposure-overlap-scope/v1", {
    systemRootHash: payload.systemRootHash,
    populationRootHash: payload.window.populationRootHash,
    exposureUnit: payload.window.exposureUnit,
    unitDefinitionHash: payload.window.unitDefinitionHash,
  });
}

function incidentFactHash(payload, incident) {
  return digestDomain("outsider/loss-exposure-economic-fact/v1", {
    systemRootHash: payload.systemRootHash,
    incidentIdHash: incident.incidentIdHash,
    claimIdHash: incident.claimIdHash,
  });
}

function quarantineEntryBody(entry) {
  return Object.fromEntries(["ordinal", "sourceObservationHash", "envelopeHash",
    "operatorKeyId", "operatorTrustPolicyVersionHash", "semanticWindowHash",
    "overlapScopeHash", "incidentFactHashes", "previousEntryHash",
    "observationEnvelope"].map((key) => [key, entry[key]]));
}

function safeArtifactHash(value, domain) {
  try { return digestDomain(domain, value); }
  catch { return null; }
}

export function buildLossExposureQuarantine(observationEnvelopes = [],
  { trustStore, createdAt = new Date().toISOString() } = {}) {
  const at = canonicalTime(createdAt, "QUARANTINE_CREATED_AT");
  if (!Array.isArray(observationEnvelopes) || observationEnvelopes.length > 10_000) {
    throw new Error("LOSS_EXPOSURE_QUARANTINE_INPUT_INVALID");
  }
  const entries = [];
  const duplicates = [];
  const rejected = [];
  const bySource = new Map();
  const byWindow = new Map();
  const byIncident = new Map();
  const windowsByScope = new Map();
  let previousEntryHash = GENESIS;
  for (const [inputIndex, envelope] of observationEnvelopes.entries()) {
    const checked = verifyLossExposureObservation(envelope, { trustStore, now: at });
    const envelopeHash = checked.envelopeHash
      ?? safeArtifactHash(envelope, "outsider/loss-exposure-rejected-envelope/v1");
    if (!checked.ok) {
      rejected.push({ inputIndex, envelopeHash, reasonCodes: checked.failures });
      continue;
    }
    const payload = envelope.payload;
    if (bySource.has(envelope.sourceObservationHash)) {
      duplicates.push({ inputIndex, envelopeHash,
        sourceObservationHash: envelope.sourceObservationHash,
        firstEntryHash: bySource.get(envelope.sourceObservationHash) });
      continue;
    }
    const windowHash = semanticWindowHash(payload);
    if (byWindow.has(windowHash)) {
      rejected.push({ inputIndex, envelopeHash,
        reasonCodes: ["SEMANTIC_WINDOW_RESEALED_OR_CONFLICTING"] });
      continue;
    }
    const scopeHash = overlapScopeHash(payload);
    const overlap = (windowsByScope.get(scopeHash) ?? []).find((prior) => (
      Date.parse(payload.window.startAt) < Date.parse(prior.endAt)
      && Date.parse(payload.window.endAt) > Date.parse(prior.startAt)
    ));
    if (overlap) {
      rejected.push({ inputIndex, envelopeHash,
        reasonCodes: ["OVERLAPPING_EXPOSURE_WINDOW_FOR_SAME_POPULATION"] });
      continue;
    }
    const factHashes = payload.reportedIncidents.map((incident) => (
      incidentFactHash(payload, incident)
    )).sort();
    if (factHashes.some((hash) => byIncident.has(hash))) {
      rejected.push({ inputIndex, envelopeHash,
        reasonCodes: ["SEMANTIC_INCIDENT_OR_CLAIM_REUSED"] });
      continue;
    }
    const entry = {
      ordinal: entries.length + 1,
      sourceObservationHash: envelope.sourceObservationHash,
      envelopeHash,
      operatorKeyId: checked.operatorKeyId,
      operatorTrustPolicyVersionHash: checked.trustPolicyVersionHash,
      semanticWindowHash: windowHash,
      overlapScopeHash: scopeHash,
      incidentFactHashes: factHashes,
      previousEntryHash,
      observationEnvelope: structuredClone(envelope),
    };
    entry.entryHash = digestDomain("outsider/loss-exposure-quarantine-entry/v1",
      quarantineEntryBody(entry));
    entries.push(entry);
    bySource.set(envelope.sourceObservationHash, entry.entryHash);
    byWindow.set(windowHash, entry.entryHash);
    for (const hash of factHashes) byIncident.set(hash, entry.entryHash);
    if (!windowsByScope.has(scopeHash)) windowsByScope.set(scopeHash, []);
    windowsByScope.get(scopeHash).push({ startAt: payload.window.startAt,
      endAt: payload.window.endAt, entryHash: entry.entryHash });
    previousEntryHash = entry.entryHash;
  }
  const body = {
    schema: LOSS_EXPOSURE_SCHEMAS.quarantine,
    schemaVersion: "1.0.0",
    generation: 1,
    previousQuarantineHash: null,
    createdAt: at,
    genesisHash: GENESIS,
    trustPolicyVersionHashes: [...new Set(entries.map((entry) => (
      entry.operatorTrustPolicyVersionHash
    )))].sort(),
    entries,
    duplicates,
    rejected,
    counts: {
      input: observationEnvelopes.length,
      quarantined: entries.length,
      duplicates: duplicates.length,
      rejected: rejected.length,
      zeroLossWindows: entries.filter((entry) => (
        entry.observationEnvelope.payload.reportedIncidents.length === 0
      )).length,
    },
    boundary: {
      disposition: "QUARANTINED",
      cumulativeSemanticDedup: true,
      localTrustPolicyConformanceOnly: true,
      l3L4EvidenceRows: 0,
      automaticTraining: false,
      permitsPricing: false,
      permitsCoverage: false,
      permitsCapital: false,
      permitsSettlement: false,
      movesFunds: false,
    },
  };
  return Object.freeze({ ...body,
    quarantineHash: digestDomain(LOSS_EXPOSURE_SCHEMAS.quarantine, body) });
}

/**
 * Append a new intake batch to the cumulative quarantine.  The complete prior
 * entry set is reverified and replayed through semantic-window, overlap, and
 * incident-fact dedup before a new generation is sealed.  Entry hashes remain
 * append-only; the generation hash commits the full cumulative disposition.
 */
export function appendLossExposureQuarantine(previousQuarantine,
  observationEnvelopes = [], { trustStore, previousLineage = [],
    createdAt = new Date().toISOString() } = {}) {
  const at = canonicalTime(createdAt, "QUARANTINE_CREATED_AT");
  const previousCheck = verifyLossExposureQuarantine(previousQuarantine,
    { trustStore, now: at, lineage: previousLineage });
  if (!previousCheck.ok) {
    throw new Error(`LOSS_EXPOSURE_PREVIOUS_QUARANTINE_INVALID:${previousCheck.failures.join(",")}`);
  }
  if (Date.parse(at) <= Date.parse(previousQuarantine.createdAt)) {
    throw new Error("LOSS_EXPOSURE_QUARANTINE_GENERATION_TIME_NOT_INCREASING");
  }
  if (!Array.isArray(observationEnvelopes) || observationEnvelopes.length > 10_000) {
    throw new Error("LOSS_EXPOSURE_QUARANTINE_INPUT_INVALID");
  }
  const replayed = buildLossExposureQuarantine([
    ...previousQuarantine.entries.map((entry) => entry.observationEnvelope),
    ...observationEnvelopes,
  ], { trustStore, createdAt: at });
  const oldEntryCount = previousQuarantine.entries.length;
  const globalIndex = (index) => previousQuarantine.counts.input + index - oldEntryCount;
  const newDuplicates = replayed.duplicates
    .filter((item) => item.inputIndex >= oldEntryCount)
    .map((item) => ({ ...item, inputIndex: globalIndex(item.inputIndex) }));
  const newRejected = replayed.rejected
    .filter((item) => item.inputIndex >= oldEntryCount)
    .map((item) => ({ ...item, inputIndex: globalIndex(item.inputIndex) }));
  const duplicates = [...structuredClone(previousQuarantine.duplicates), ...newDuplicates];
  const rejected = [...structuredClone(previousQuarantine.rejected), ...newRejected];
  const entries = structuredClone(replayed.entries);
  const body = {
    schema: LOSS_EXPOSURE_SCHEMAS.quarantine,
    schemaVersion: "1.0.0",
    generation: previousQuarantine.generation + 1,
    previousQuarantineHash: previousQuarantine.quarantineHash,
    createdAt: at,
    genesisHash: GENESIS,
    trustPolicyVersionHashes: structuredClone(replayed.trustPolicyVersionHashes),
    entries,
    duplicates,
    rejected,
    counts: {
      input: previousQuarantine.counts.input + observationEnvelopes.length,
      quarantined: entries.length,
      duplicates: duplicates.length,
      rejected: rejected.length,
      zeroLossWindows: entries.filter((entry) => (
        entry.observationEnvelope.payload.reportedIncidents.length === 0
      )).length,
    },
    boundary: structuredClone(replayed.boundary),
  };
  return Object.freeze({ ...body,
    quarantineHash: digestDomain(LOSS_EXPOSURE_SCHEMAS.quarantine, body) });
}

export function verifyLossExposureQuarantine(quarantine,
  { trustStore, now = new Date().toISOString(), previousQuarantine = null,
    lineage = null } = {}) {
  const failures = [];
  if (!exactKeys(quarantine, ["schema", "schemaVersion", "generation",
    "previousQuarantineHash", "createdAt", "genesisHash", "trustPolicyVersionHashes",
    "entries", "duplicates", "rejected", "counts", "boundary", "quarantineHash"])
    || quarantine?.schema !== LOSS_EXPOSURE_SCHEMAS.quarantine
    || quarantine?.schemaVersion !== "1.0.0" || quarantine?.genesisHash !== GENESIS
    || !Number.isSafeInteger(quarantine.generation) || quarantine.generation < 1
    || (quarantine.generation === 1 && quarantine.previousQuarantineHash !== null)
    || (quarantine.generation > 1 && !HASH.test(quarantine.previousQuarantineHash))) {
    failures.push("QUARANTINE_SCHEMA_INVALID");
    return Object.freeze({ ok: false, failures });
  }
  const at = safeTime(now, "QUARANTINE_VERIFY_TIME", failures);
  const createdAt = safeTime(quarantine.createdAt, "QUARANTINE_CREATED_AT", failures);
  if (at && createdAt && Date.parse(createdAt) > Date.parse(at)) failures.push("QUARANTINE_FROM_FUTURE");
  const suppliedLineage = lineage === null
    ? (previousQuarantine === null ? [] : [previousQuarantine]) : lineage;
  if (!Array.isArray(suppliedLineage)) failures.push("QUARANTINE_LINEAGE_INVALID");
  if (Array.isArray(suppliedLineage)
    && suppliedLineage.length !== quarantine.generation - 1) {
    failures.push("QUARANTINE_COMPLETE_LINEAGE_REQUIRED");
  }
  const priorArtifact = Array.isArray(suppliedLineage) && suppliedLineage.length
    ? suppliedLineage[suppliedLineage.length - 1] : null;
  if (priorArtifact !== null) {
    const prior = verifyLossExposureQuarantine(priorArtifact,
      { trustStore, now: quarantine.createdAt,
        lineage: suppliedLineage.slice(0, -1) });
    if (!prior.ok
      || quarantine.generation !== priorArtifact.generation + 1
      || quarantine.previousQuarantineHash !== priorArtifact.quarantineHash
      || Date.parse(quarantine.createdAt) <= Date.parse(priorArtifact.createdAt)
      || quarantine.entries.length < priorArtifact.entries.length
      || canonicalizeStrict(quarantine.entries.slice(0, priorArtifact.entries.length))
        !== canonicalizeStrict(priorArtifact.entries)
      || quarantine.duplicates.length < priorArtifact.duplicates.length
      || canonicalizeStrict(quarantine.duplicates.slice(0,
        priorArtifact.duplicates.length))
        !== canonicalizeStrict(priorArtifact.duplicates)
      || quarantine.rejected.length < priorArtifact.rejected.length
      || canonicalizeStrict(quarantine.rejected.slice(0, priorArtifact.rejected.length))
        !== canonicalizeStrict(priorArtifact.rejected)) {
      failures.push("QUARANTINE_PREVIOUS_GENERATION_BINDING_INVALID");
    }
  }
  const { quarantineHash, ...body } = quarantine;
  if (digestDomain(LOSS_EXPOSURE_SCHEMAS.quarantine, body) !== quarantineHash) {
    failures.push("QUARANTINE_HASH_INVALID");
  }
  if (!Array.isArray(quarantine.entries) || !Array.isArray(quarantine.duplicates)
    || !Array.isArray(quarantine.rejected)) failures.push("QUARANTINE_COLLECTIONS_INVALID");
  let previous = GENESIS;
  const sources = new Set(), windows = new Set(), incidents = new Set();
  const windowsByScope = new Map();
  for (const [index, entry] of (quarantine.entries ?? []).entries()) {
    if (!exactKeys(entry, ["ordinal", "sourceObservationHash", "envelopeHash",
      "operatorKeyId", "operatorTrustPolicyVersionHash", "semanticWindowHash",
      "overlapScopeHash", "incidentFactHashes", "previousEntryHash",
      "observationEnvelope", "entryHash"])
      || entry.ordinal !== index + 1 || entry.previousEntryHash !== previous
      || !HASH.test(entry.entryHash)
      || digestDomain("outsider/loss-exposure-quarantine-entry/v1",
        quarantineEntryBody(entry)) !== entry.entryHash) {
      failures.push(`QUARANTINE_ENTRY_INVALID:${index}`);
      continue;
    }
    const checked = verifyLossExposureObservation(entry.observationEnvelope,
      { trustStore, now: createdAt ?? now });
    if (!checked.ok || checked.envelopeHash !== entry.envelopeHash
      || checked.operatorKeyId !== entry.operatorKeyId
      || checked.trustPolicyVersionHash !== entry.operatorTrustPolicyVersionHash
      || entry.sourceObservationHash !== entry.observationEnvelope.sourceObservationHash) {
      failures.push(`QUARANTINE_ENTRY_SOURCE_INVALID:${index}`);
      continue;
    }
    const payload = entry.observationEnvelope.payload;
    const facts = payload.reportedIncidents.map((incident) => incidentFactHash(payload, incident)).sort();
    if (entry.semanticWindowHash !== semanticWindowHash(payload)
      || entry.overlapScopeHash !== overlapScopeHash(payload)
      || canonicalizeStrict(entry.incidentFactHashes) !== canonicalizeStrict(facts)
      || sources.has(entry.sourceObservationHash) || windows.has(entry.semanticWindowHash)
      || facts.some((hash) => incidents.has(hash))) {
      failures.push(`QUARANTINE_ENTRY_DEDUP_INVALID:${index}`);
      continue;
    }
    const overlap = (windowsByScope.get(entry.overlapScopeHash) ?? []).some((prior) => (
      Date.parse(payload.window.startAt) < Date.parse(prior.endAt)
      && Date.parse(payload.window.endAt) > Date.parse(prior.startAt)
    ));
    if (overlap) failures.push(`QUARANTINE_ENTRY_OVERLAP_INVALID:${index}`);
    sources.add(entry.sourceObservationHash); windows.add(entry.semanticWindowHash);
    for (const hash of facts) incidents.add(hash);
    if (!windowsByScope.has(entry.overlapScopeHash)) windowsByScope.set(entry.overlapScopeHash, []);
    windowsByScope.get(entry.overlapScopeHash).push({ startAt: payload.window.startAt,
      endAt: payload.window.endAt });
    previous = entry.entryHash;
  }
  const expectedCounts = {
    input: (quarantine.entries?.length ?? 0) + (quarantine.duplicates?.length ?? 0)
      + (quarantine.rejected?.length ?? 0),
    quarantined: quarantine.entries?.length ?? 0,
    duplicates: quarantine.duplicates?.length ?? 0,
    rejected: quarantine.rejected?.length ?? 0,
    zeroLossWindows: (quarantine.entries ?? []).filter((entry) => (
      entry.observationEnvelope.payload.reportedIncidents.length === 0
    )).length,
  };
  if (canonicalizeStrict(quarantine.counts) !== canonicalizeStrict(expectedCounts)) {
    failures.push("QUARANTINE_COUNTS_INVALID");
  }
  const expectedPolicyVersions = [...new Set((quarantine.entries ?? []).map((entry) => (
    entry.operatorTrustPolicyVersionHash
  )))].sort();
  if (!sortedUniqueHashes(quarantine.trustPolicyVersionHashes)
    || canonicalizeStrict(quarantine.trustPolicyVersionHashes)
      !== canonicalizeStrict(expectedPolicyVersions)) {
    failures.push("QUARANTINE_TRUST_POLICY_VERSION_SET_INVALID");
  }
  if (!exactKeys(quarantine.boundary, ["disposition", "cumulativeSemanticDedup",
    "localTrustPolicyConformanceOnly",
    "l3L4EvidenceRows", "automaticTraining", "permitsPricing", "permitsCoverage",
    "permitsCapital", "permitsSettlement", "movesFunds"])
    || quarantine.boundary.disposition !== "QUARANTINED"
    || quarantine.boundary.cumulativeSemanticDedup !== true
    || quarantine.boundary.localTrustPolicyConformanceOnly !== true
    || quarantine.boundary.l3L4EvidenceRows !== 0
    || Object.entries(quarantine.boundary).some(([key, value]) => (
      !["disposition", "cumulativeSemanticDedup", "localTrustPolicyConformanceOnly",
        "l3L4EvidenceRows"].includes(key)
      && value !== false
    ))) failures.push("QUARANTINE_BOUNDARY_INVALID");
  return Object.freeze({ ok: failures.length === 0,
    failures: Object.freeze([...new Set(failures)]), recordsVerified: failures.length === 0 });
}

function claimSetHash(observationPayload) {
  return digestDomain("outsider/loss-exposure-claim-set/v1",
    observationPayload.reportedIncidents.map((incident) => ({
      incidentIdHash: incident.incidentIdHash, claimIdHash: incident.claimIdHash,
    })));
}

function windowCommitmentHash(observationPayload) {
  return digestDomain("outsider/loss-exposure-window-commitment/v1",
    observationPayload.window);
}

function validateFraudReviewPayload(payload, now, problems) {
  if (!exactKeys(payload, ["quarantineEntryHash", "sourceObservationHash",
    "windowCommitmentHash", "claimSetHash", "policyHash", "reviewerDomainRootHash",
    "reviewerControlRootHash", "completedAt", "status", "evidenceHashes"])) {
    problems.push("FRAUD_REVIEW_PAYLOAD_SCHEMA_INVALID");
    return;
  }
  boundedCanonical(payload, 128 * 1024, problems, "FRAUD_REVIEW_PAYLOAD");
  for (const field of ["quarantineEntryHash", "sourceObservationHash",
    "windowCommitmentHash", "claimSetHash", "policyHash", "reviewerDomainRootHash",
    "reviewerControlRootHash"]) {
    if (!HASH.test(String(payload[field] ?? ""))) problems.push(`FRAUD_REVIEW_${field.toUpperCase()}_INVALID`);
  }
  const completedAt = safeTime(payload.completedAt, "FRAUD_REVIEW_TIME", problems);
  const at = safeTime(now, "FRAUD_REVIEW_VERIFY_TIME", problems);
  if (completedAt && at && Date.parse(completedAt) > Date.parse(at)) {
    problems.push("FRAUD_REVIEW_IN_FUTURE");
  }
  if (!FRAUD_STATUSES.has(payload.status)) problems.push("FRAUD_REVIEW_STATUS_INVALID");
  if (!sortedUniqueHashes(payload.evidenceHashes, { minimum: 1 })) {
    problems.push("FRAUD_REVIEW_EVIDENCE_INVALID");
  }
}

export function signLossExposureFraudReview(payload, { privateKeyPem } = {}) {
  const problems = [];
  validateFraudReviewPayload(payload, new Date().toISOString(), problems);
  if (problems.length) throw new Error(`LOSS_EXPOSURE_FRAUD_REVIEW_INVALID:${[...new Set(problems)].join(",")}`);
  const fraudReviewHash = digestDomain(LOSS_EXPOSURE_SCHEMAS.fraudReview, payload);
  return Object.freeze({
    schema: LOSS_EXPOSURE_SCHEMAS.fraudReview,
    payload: structuredClone(payload),
    fraudReviewHash,
    signature: makeSignature(LOSS_EXPOSURE_SCHEMAS.fraudReview,
      fraudReviewHash, privateKeyPem),
  });
}

function validateAdjudicationPayload(payload, observationPayload, now, problems) {
  if (!exactKeys(payload, ["quarantineEntryHash", "sourceObservationHash",
    "windowCommitmentHash", "claimSetHash", "policyHash", "adjudicatorDomainRootHash",
    "adjudicatorControlRootHash", "adjudicatedAt", "status", "disposition",
    "observationWindowClosed", "exposureVerified", "populationCompletenessVerified",
    "finalIncidents", "adjudicationEvidenceHashes", "fraudReviewHash",
    "appealStatus", "authority"])) {
    problems.push("ADJUDICATION_PAYLOAD_SCHEMA_INVALID");
    return;
  }
  boundedCanonical(payload, 512 * 1024, problems, "ADJUDICATION_PAYLOAD");
  for (const field of ["quarantineEntryHash", "sourceObservationHash",
    "windowCommitmentHash", "claimSetHash", "policyHash", "adjudicatorDomainRootHash",
    "adjudicatorControlRootHash", "fraudReviewHash"]) {
    if (!HASH.test(String(payload[field] ?? ""))) problems.push(`ADJUDICATION_${field.toUpperCase()}_INVALID`);
  }
  const adjudicatedAt = safeTime(payload.adjudicatedAt, "ADJUDICATION_TIME", problems);
  const at = safeTime(now, "ADJUDICATION_VERIFY_TIME", problems);
  if (adjudicatedAt && at && Date.parse(adjudicatedAt) > Date.parse(at)) {
    problems.push("ADJUDICATION_IN_FUTURE");
  }
  if (!ADJUDICATION_STATUSES.has(payload.status)) problems.push("ADJUDICATION_STATUS_INVALID");
  if (!DISPOSITIONS.has(payload.disposition)) problems.push("ADJUDICATION_DISPOSITION_INVALID");
  if (!APPEAL_STATUSES.has(payload.appealStatus)) problems.push("ADJUDICATION_APPEAL_STATUS_INVALID");
  if (typeof payload.observationWindowClosed !== "boolean"
    || typeof payload.exposureVerified !== "boolean"
    || typeof payload.populationCompletenessVerified !== "boolean") {
    problems.push("ADJUDICATION_CLOSURE_FLAGS_INVALID");
  }
  if (!sortedUniqueHashes(payload.adjudicationEvidenceHashes, { minimum: 1 })) {
    problems.push("ADJUDICATION_EVIDENCE_INVALID");
  }
  if (!exactKeys(payload.authority, AUTHORITY_KEYS)
    || AUTHORITY_KEYS.some((key) => payload.authority[key] !== false)) {
    problems.push("ADJUDICATION_AUTHORITY_BOUNDARY_INVALID");
  }
  if (observationPayload) {
    validateIncidents(payload.finalIncidents, observationPayload.window,
      problems, "FINAL_INCIDENT");
    const reported = new Map(observationPayload.reportedIncidents.map((incident) => (
      [`${incident.incidentIdHash}\0${incident.claimIdHash}`, incident]
    )));
    for (const incident of payload.finalIncidents ?? []) {
      const source = reported.get(`${incident.incidentIdHash}\0${incident.claimIdHash}`);
      if (!source || source.occurredAt !== incident.occurredAt
        || source.currency !== incident.currency) {
        problems.push("FINAL_INCIDENT_NOT_BOUND_TO_OPERATOR_OBSERVATION");
      }
    }
    if (payload.disposition === "LOSS_CONFIRMED" && !(payload.finalIncidents?.length > 0)) {
      problems.push("CONFIRMED_LOSS_WITHOUT_FINAL_INCIDENT");
    }
    if (["NO_LOSS", "REPORTED_LOSS_DENIED", "FRAUD_REJECTED"].includes(payload.disposition)
      && payload.finalIncidents?.length !== 0) {
      problems.push("NON_LOSS_DISPOSITION_WITH_FINAL_INCIDENT");
    }
    if (payload.disposition === "NO_LOSS" && observationPayload.reportedIncidents.length !== 0) {
      problems.push("NO_LOSS_DISPOSITION_CONTRADICTS_REPORTED_INCIDENT");
    }
    if (payload.disposition === "REPORTED_LOSS_DENIED"
      && observationPayload.reportedIncidents.length === 0) {
      problems.push("DENIAL_WITHOUT_REPORTED_INCIDENT");
    }
    if (adjudicatedAt && Date.parse(adjudicatedAt) < Date.parse(observationPayload.observedAt)) {
      problems.push("ADJUDICATION_PRECEDES_OBSERVATION_OR_WINDOW_CLOSE");
    }
  }
}

export function signLossExposureAdjudication(payload,
  { privateKeyPem, fraudReview } = {}) {
  const problems = [];
  validateAdjudicationPayload(payload, null, new Date().toISOString(), problems);
  if (fraudReview?.fraudReviewHash !== payload?.fraudReviewHash) {
    problems.push("ADJUDICATION_FRAUD_REVIEW_BINDING_INVALID");
  }
  if (problems.length) throw new Error(`LOSS_EXPOSURE_ADJUDICATION_INVALID:${[...new Set(problems)].join(",")}`);
  const adjudicationHash = digestDomain(LOSS_EXPOSURE_SCHEMAS.adjudication, payload);
  return Object.freeze({
    schema: LOSS_EXPOSURE_SCHEMAS.adjudication,
    payload: structuredClone(payload),
    adjudicationHash,
    signature: makeSignature(LOSS_EXPOSURE_SCHEMAS.adjudication,
      adjudicationHash, privateKeyPem),
    fraudReview: structuredClone(fraudReview),
  });
}

export function verifyLossExposureAdjudication(envelope,
  { trustStore, quarantineEntry, now = new Date().toISOString() } = {}) {
  const problems = [];
  if (!exactKeys(envelope, ["schema", "payload", "adjudicationHash", "signature",
    "fraudReview"])
    || envelope?.schema !== LOSS_EXPOSURE_SCHEMAS.adjudication
    || !HASH.test(String(envelope?.adjudicationHash ?? ""))) {
    problems.push("ADJUDICATION_ENVELOPE_SCHEMA_INVALID");
  }
  const observation = quarantineEntry?.observationEnvelope?.payload;
  if (!observation) problems.push("ADJUDICATION_QUARANTINE_ENTRY_REQUIRED");
  if (envelope?.payload) validateAdjudicationPayload(envelope.payload, observation, now, problems);
  if (envelope?.payload
    && digestDomain(LOSS_EXPOSURE_SCHEMAS.adjudication, envelope.payload)
      !== envelope.adjudicationHash) problems.push("ADJUDICATION_HASH_INVALID");
  const adjudicator = verifyEnvelopeSignature(envelope, LOSS_EXPOSURE_SCHEMAS.adjudication,
    "adjudicationHash", "adjudicators", trustStore, problems,
    envelope?.payload?.adjudicatedAt ?? null);
  if (adjudicator && envelope?.payload
    && (adjudicator.domainRootHash !== envelope.payload.adjudicatorDomainRootHash
      || adjudicator.controlRootHash !== envelope.payload.adjudicatorControlRootHash)) {
    problems.push("ADJUDICATOR_POLICY_ROOT_BINDING_INVALID");
  }
  const fraud = envelope?.fraudReview;
  if (!exactKeys(fraud, ["schema", "payload", "fraudReviewHash", "signature"])
    || fraud?.schema !== LOSS_EXPOSURE_SCHEMAS.fraudReview
    || !HASH.test(String(fraud?.fraudReviewHash ?? ""))) {
    problems.push("FRAUD_REVIEW_ENVELOPE_SCHEMA_INVALID");
  }
  if (fraud?.payload) validateFraudReviewPayload(fraud.payload, now, problems);
  if (fraud?.payload && digestDomain(LOSS_EXPOSURE_SCHEMAS.fraudReview, fraud.payload)
    !== fraud.fraudReviewHash) problems.push("FRAUD_REVIEW_HASH_INVALID");
  const reviewer = verifyEnvelopeSignature(fraud, LOSS_EXPOSURE_SCHEMAS.fraudReview,
    "fraudReviewHash", "fraudReviewers", trustStore, problems,
    fraud?.payload?.completedAt ?? null);
  if (reviewer && fraud?.payload
    && (reviewer.domainRootHash !== fraud.payload.reviewerDomainRootHash
      || reviewer.controlRootHash !== fraud.payload.reviewerControlRootHash)) {
    problems.push("FRAUD_REVIEWER_POLICY_ROOT_BINDING_INVALID");
  }
  if (envelope?.payload?.fraudReviewHash !== fraud?.fraudReviewHash) {
    problems.push("ADJUDICATION_FRAUD_REVIEW_BINDING_INVALID");
  }
  if (observation && envelope?.payload) {
    const payload = envelope.payload;
    if (payload.quarantineEntryHash !== quarantineEntry.entryHash
      || payload.sourceObservationHash !== quarantineEntry.sourceObservationHash
      || payload.windowCommitmentHash !== windowCommitmentHash(observation)
      || payload.claimSetHash !== claimSetHash(observation)
      || payload.policyHash !== observation.policyHash) {
      problems.push("ADJUDICATION_SOURCE_POLICY_CLAIM_WINDOW_BINDING_INVALID");
    }
    const fraudPayload = fraud?.payload;
    if (!fraudPayload
      || fraudPayload.quarantineEntryHash !== quarantineEntry.entryHash
      || fraudPayload.sourceObservationHash !== quarantineEntry.sourceObservationHash
      || fraudPayload.windowCommitmentHash !== windowCommitmentHash(observation)
      || fraudPayload.claimSetHash !== claimSetHash(observation)
      || fraudPayload.policyHash !== observation.policyHash) {
      problems.push("FRAUD_REVIEW_SOURCE_POLICY_CLAIM_WINDOW_BINDING_INVALID");
    }
    const operatorKeyId = quarantineEntry.operatorKeyId;
    const operator = roleEntry(trustStore, "operators", operatorKeyId, problems,
      observation.observedAt);
    const identities = [operatorKeyId, envelope?.signature?.keyId, fraud?.signature?.keyId];
    if (new Set(identities).size !== identities.length) problems.push("REVIEW_PARTY_KEYS_NOT_DISTINCT");
    const controls = [operator?.controlRootHash, adjudicator?.controlRootHash,
      reviewer?.controlRootHash];
    if (controls.some((root) => !root) || new Set(controls).size !== controls.length) {
      problems.push("REVIEW_PARTY_CONTROL_ROOTS_NOT_DISTINCT");
    }
    const domains = [operator?.domainRootHash, adjudicator?.domainRootHash,
      reviewer?.domainRootHash];
    if (domains.some((root) => !root) || new Set(domains).size !== domains.length) {
      problems.push("REVIEW_PARTY_DOMAIN_ROOTS_NOT_DISTINCT");
    }
    if (fraudPayload?.completedAt && Date.parse(fraudPayload.completedAt)
      < Date.parse(observation.observedAt)) problems.push("FRAUD_REVIEW_PRECEDES_OBSERVATION");
    if (fraudPayload?.completedAt && payload.adjudicatedAt
      && Date.parse(fraudPayload.completedAt) > Date.parse(payload.adjudicatedAt)) {
      problems.push("ADJUDICATION_PRECEDES_FRAUD_REVIEW");
    }
  }
  const structurallyValid = problems.length === 0;
  const researchEligible = structurallyValid
    && envelope.payload.status === "FINAL"
    && envelope.payload.observationWindowClosed === true
    && envelope.payload.exposureVerified === true
    && envelope.payload.populationCompletenessVerified === true
    && fraud.payload.status === "CLEAR"
    && ["NONE", "EXHAUSTED"].includes(envelope.payload.appealStatus)
    && envelope.payload.disposition !== "FRAUD_REJECTED";
  const eligibilityReasons = [];
  if (structurallyValid && !researchEligible) {
    if (envelope.payload.status !== "FINAL") eligibilityReasons.push("ADJUDICATION_NOT_FINAL");
    if (envelope.payload.observationWindowClosed !== true) eligibilityReasons.push("WINDOW_NOT_CLOSED");
    if (envelope.payload.exposureVerified !== true) eligibilityReasons.push("EXPOSURE_NOT_VERIFIED");
    if (envelope.payload.populationCompletenessVerified !== true) eligibilityReasons.push("POPULATION_COMPLETENESS_NOT_VERIFIED");
    if (fraud.payload.status !== "CLEAR") eligibilityReasons.push("FRAUD_REVIEW_NOT_CLEAR");
    if (!["NONE", "EXHAUSTED"].includes(envelope.payload.appealStatus)) eligibilityReasons.push("APPEAL_NOT_CLOSED");
    if (envelope.payload.disposition === "FRAUD_REJECTED") eligibilityReasons.push("FRAUD_REJECTED");
  }
  return Object.freeze({
    ok: structurallyValid,
    failures: Object.freeze([...new Set(problems)]),
    researchEligible,
    eligibilityReasons: Object.freeze(eligibilityReasons),
    adjudicationEnvelopeHash: structurallyValid
      ? digestDomain("outsider/loss-exposure-adjudication-envelope/v1", envelope) : null,
    evidenceLevel: structurallyValid ? "L2_LOCAL_POLICY_DUAL_ATTESTED_CONFORMANCE" : null,
    l3L4Eligible: false,
    externallyGoverned: false,
  });
}

function researchRow(entry, adjudication, trustStore) {
  const observation = entry.observationEnvelope.payload;
  const finalIncidents = adjudication.payload.finalIncidents;
  const roots = [...new Set([
    ...observation.correlationRoots,
    observation.operatorDomainRootHash,
    observation.operatorControlRootHash,
    observation.systemRootHash,
    observation.window.populationRootHash,
    entry.operatorKeyId,
    adjudication.signature.keyId,
    adjudication.payload.adjudicatorDomainRootHash,
    adjudication.payload.adjudicatorControlRootHash,
    adjudication.fraudReview.signature.keyId,
    adjudication.fraudReview.payload.reviewerDomainRootHash,
    adjudication.fraudReview.payload.reviewerControlRootHash,
    entry.operatorTrustPolicyVersionHash,
    trustStore.adjudicators[adjudication.signature.keyId].policyVersionHash,
    trustStore.fraudReviewers[adjudication.fraudReview.signature.keyId].policyVersionHash,
    ...observation.reportedIncidents.flatMap((incident) => (
      [incident.incidentIdHash, incident.claimIdHash]
    )),
  ])].sort();
  const body = {
    schema: LOSS_EXPOSURE_SCHEMAS.researchRow,
    sourceObservationHash: entry.sourceObservationHash,
    quarantineEntryHash: entry.entryHash,
    adjudicationHash: adjudication.adjudicationHash,
    fraudReviewHash: adjudication.fraudReview.fraudReviewHash,
    declaredSourceClass: observation.sourceClass,
    sourceClassExternallyVerified: false,
    instrumentHash: observation.instrumentHash,
    policyHash: observation.policyHash,
    operatorDomainRootHash: observation.operatorDomainRootHash,
    operatorControlRootHash: observation.operatorControlRootHash,
    systemRootHash: observation.systemRootHash,
    window: structuredClone(observation.window),
    finalIncidents: structuredClone(finalIncidents),
    incidentFactHashes: finalIncidents.map((incident) => incidentFactHash(observation, incident)).sort(),
    correlationRootHashes: roots,
    trustPolicyVersionHashes: [
      entry.operatorTrustPolicyVersionHash,
      trustStore.adjudicators[adjudication.signature.keyId].policyVersionHash,
      trustStore.fraudReviewers[adjudication.fraudReview.signature.keyId].policyVersionHash,
    ].sort(),
    derivedEvidenceLevel: "L2_LOCAL_POLICY_DUAL_ATTESTED_CONFORMANCE",
    externallyGoverned: false,
    l3L4Eligible: false,
    useBoundary: {
      researchShadowOnly: true,
      automaticTraining: false,
      permitsPricing: false,
      permitsCoverage: false,
      permitsCapital: false,
      permitsSettlement: false,
      movesFunds: false,
    },
  };
  return Object.freeze({ ...body,
    rowHash: digestDomain(LOSS_EXPOSURE_SCHEMAS.researchRow, body) });
}

function correlationComponents(rows) {
  const parent = rows.map((_, index) => index);
  const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const join = (a, b) => {
    const left = find(a), right = find(b);
    if (left !== right) parent[right] = left;
  };
  const owner = new Map();
  rows.forEach((row, index) => {
    for (const root of row.correlationRootHashes) {
      const typed = digestDomain("outsider/loss-exposure-correlation-root/v1", root);
      if (owner.has(typed)) join(index, owner.get(typed));
      else owner.set(typed, index);
    }
  });
  const byComponent = new Map();
  rows.forEach((row, index) => {
    const key = find(index);
    if (!byComponent.has(key)) byComponent.set(key, []);
    byComponent.get(key).push(row);
  });
  return [...byComponent.values()].map((members) => {
    const recordHashes = members.map((row) => row.rowHash).sort();
    const rootHashes = [...new Set(members.flatMap((row) => row.correlationRootHashes))].sort();
    return Object.freeze({
      componentHash: digestDomain("outsider/loss-exposure-correlation-component/v1",
        { recordHashes, rootHashes }),
      recordHashes,
      rootHashes,
    });
  }).sort((left, right) => left.componentHash.localeCompare(right.componentHash));
}

function cellHash(row) {
  return digestDomain("outsider/loss-exposure-model-cell/v1", {
    instrumentHash: row.instrumentHash,
    policyHash: row.policyHash,
    exposureUnit: row.window.exposureUnit,
    unitDefinitionHash: row.window.unitDefinitionHash,
    reportingCurrency: row.window.reportingCurrency,
  });
}

function buildModelCells(rows, components) {
  const componentOf = new Map();
  for (const component of components) {
    for (const hash of component.recordHashes) componentOf.set(hash, component.componentHash);
  }
  const cells = new Map();
  for (const row of rows) {
    const hash = cellHash(row);
    if (!cells.has(hash)) cells.set(hash, []);
    cells.get(hash).push(row);
  }
  return [...cells.entries()].map(([modelCellHash, members]) => {
    const first = members[0];
    const byComponent = new Map();
    for (const row of members) {
      const componentHash = componentOf.get(row.rowHash);
      if (!byComponent.has(componentHash)) byComponent.set(componentHash, []);
      byComponent.get(componentHash).push(row);
    }
    const incidents = members.flatMap((row) => row.finalIncidents.map((incident) => ({
      rowHash: row.rowHash,
      incidentFactHash: incidentFactHash({
        operatorControlRootHash: row.operatorControlRootHash,
        operatorDomainRootHash: row.operatorDomainRootHash,
        systemRootHash: row.systemRootHash,
      }, incident),
      grossAmountMinorUnits: incident.grossAmountMinorUnits,
      recoveryAmountMinorUnits: incident.recoveryAmountMinorUnits,
      netAmountMinorUnits: incident.grossAmountMinorUnits - incident.recoveryAmountMinorUnits,
    })));
    const componentStatistics = [...byComponent.entries()].map(([componentHash, values]) => ({
      componentHash,
      exposureWindows: values.length,
      incidentWindows: values.filter((row) => row.finalIncidents.length > 0).length,
      exposureQuantityMicrounits: checkedSafeSum(values.map((row) => (
        row.window.quantityMicrounits
      )), "LOSS_EXPOSURE_COMPONENT_EXPOSURE_SUM"),
      grossLossMinorUnits: checkedSafeSum(values.flatMap((row) => (
        row.finalIncidents.map((incident) => incident.grossAmountMinorUnits)
      )), "LOSS_EXPOSURE_COMPONENT_GROSS_SUM"),
      recoveryMinorUnits: checkedSafeSum(values.flatMap((row) => (
        row.finalIncidents.map((incident) => incident.recoveryAmountMinorUnits)
      )), "LOSS_EXPOSURE_COMPONENT_RECOVERY_SUM"),
    })).sort((left, right) => left.componentHash.localeCompare(right.componentHash));
    return Object.freeze({
      modelCellHash,
      key: {
        instrumentHash: first.instrumentHash,
        policyHash: first.policyHash,
        exposureUnit: first.window.exposureUnit,
        unitDefinitionHash: first.window.unitDefinitionHash,
        reportingCurrency: first.window.reportingCurrency,
      },
      counts: {
        exposureWindows: members.length,
        zeroLossWindows: members.filter((row) => row.finalIncidents.length === 0).length,
        incidentWindows: members.filter((row) => row.finalIncidents.length > 0).length,
        confirmedIncidents: incidents.length,
        correlationComponents: byComponent.size,
      },
      betaBinomialSufficientStatistics: {
        trials: members.length,
        incidentWindows: members.filter((row) => row.finalIncidents.length > 0).length,
        priorAlpha: null,
        priorBeta: null,
        posterior: null,
      },
      gammaPoissonSufficientStatistics: {
        incidentCount: incidents.length,
        exposureQuantityMicrounits: checkedSafeSum(members.map((row) => (
          row.window.quantityMicrounits
        )), "LOSS_EXPOSURE_CELL_EXPOSURE_SUM"),
        posterior: null,
      },
      buhlmannStraubSufficientStatistics: {
        componentStatistics,
        credibilityK: null,
        estimates: null,
      },
      tvarSeverityInput: {
        currency: first.window.reportingCurrency,
        samples: incidents.sort((left, right) => (
          left.incidentFactHash.localeCompare(right.incidentFactHash)
        )),
        estimate: null,
        capital: null,
      },
    });
  }).sort((left, right) => left.modelCellHash.localeCompare(right.modelCellHash));
}

function buildBookBody({ quarantine, quarantineLineage, adjudications, trustStore,
  generatedAt }) {
  const verifiedQuarantine = verifyLossExposureQuarantine(quarantine,
    { trustStore, now: generatedAt, lineage: quarantineLineage });
  if (!verifiedQuarantine.ok) {
    throw new Error(`LOSS_EXPOSURE_QUARANTINE_INVALID:${verifiedQuarantine.failures.join(",")}`);
  }
  if (!Array.isArray(adjudications) || adjudications.length > 10_000) {
    throw new Error("LOSS_EXPOSURE_ADJUDICATION_SET_INVALID");
  }
  const entries = new Map(quarantine.entries.map((entry) => [entry.entryHash, entry]));
  const byEntry = new Map();
  const duplicateAdjudications = [];
  const rejectedAdjudications = [];
  const seenAdjudicationHashes = new Map();
  for (const [inputIndex, adjudication] of adjudications.entries()) {
    const entryHash = adjudication?.payload?.quarantineEntryHash;
    const entry = entries.get(entryHash);
    if (!entry) {
      rejectedAdjudications.push({ inputIndex,
        adjudicationHash: adjudication?.adjudicationHash ?? null,
        reasonCodes: ["ADJUDICATION_SOURCE_ENTRY_NOT_FOUND"] });
      continue;
    }
    const checked = verifyLossExposureAdjudication(adjudication,
      { trustStore, quarantineEntry: entry, now: generatedAt });
    if (!checked.ok) {
      rejectedAdjudications.push({ inputIndex,
        adjudicationHash: adjudication?.adjudicationHash ?? null,
        reasonCodes: checked.failures });
      continue;
    }
    if (seenAdjudicationHashes.has(adjudication.adjudicationHash)) {
      duplicateAdjudications.push({ inputIndex,
        adjudicationHash: adjudication.adjudicationHash,
        firstInputIndex: seenAdjudicationHashes.get(adjudication.adjudicationHash) });
      continue;
    }
    seenAdjudicationHashes.set(adjudication.adjudicationHash, inputIndex);
    if (!byEntry.has(entryHash)) byEntry.set(entryHash, []);
    byEntry.get(entryHash).push({ adjudication, checked });
  }
  const rows = [];
  const pending = [];
  const conflicts = [];
  for (const entry of quarantine.entries) {
    const candidates = byEntry.get(entry.entryHash) ?? [];
    if (candidates.length === 0) {
      pending.push({ entryHash: entry.entryHash, reasonCodes: ["ADJUDICATION_MISSING"] });
      continue;
    }
    if (candidates.length > 1) {
      conflicts.push({ entryHash: entry.entryHash,
        adjudicationHashes: candidates.map(({ adjudication }) => (
          adjudication.adjudicationHash
        )).sort(), reasonCodes: ["CONFLICTING_FINAL_OR_PROVISIONAL_ADJUDICATIONS"] });
      continue;
    }
    const { adjudication, checked } = candidates[0];
    if (!checked.researchEligible) {
      pending.push({ entryHash: entry.entryHash,
        reasonCodes: checked.eligibilityReasons });
      continue;
    }
    rows.push(researchRow(entry, adjudication, trustStore));
  }
  rows.sort((left, right) => left.rowHash.localeCompare(right.rowHash));
  const components = correlationComponents(rows);
  const modelCells = buildModelCells(rows, components);
  const distinctDomains = new Set(rows.map((row) => row.operatorDomainRootHash)).size;
  const numericFloorObserved = rows.length >= 200 && distinctDomains >= 3
    && components.length >= 100;
  const missingRequirements = [
    "EXTERNALLY_GOVERNED_PINNED_TRUST_ROOT",
    "EXTERNAL_TRUST_ROOT_REVOCATION_FEED",
    "EXTERNAL_TIMESTAMP_OR_APPEND_ONLY_INGEST_REGISTRY",
    "L3_L4_GOVERNANCE_PROMOTION",
    "PROSPECTIVE_TEMPORAL_HOLDOUT",
    "INDEPENDENT_ACTUARIAL_MODEL_REVIEW",
    "LEGAL_RATE_COVERAGE_AND_CAPITAL_AUTHORITY",
  ];
  if (!rows.length) missingRequirements.unshift("DUAL_ATTESTED_CLOSED_EXPOSURE_WINDOWS");
  if (!numericFloorObserved) missingRequirements.push("MINIMUM_200_WINDOWS_3_DOMAINS_100_COMPONENTS");
  return {
    schema: LOSS_EXPOSURE_SCHEMAS.shadowBook,
    schemaVersion: "1.0.0",
    generatedAt,
    sources: {
      quarantineHash: quarantine.quarantineHash,
      quarantineLineageHashes: quarantineLineage.map((artifact) => (
        artifact.quarantineHash
      )),
      adjudicationHashes: [...seenAdjudicationHashes.keys()].sort(),
      sourceCommitmentHash: digestDomain("outsider/loss-exposure-book-sources/v1", {
        quarantineHash: quarantine.quarantineHash,
        quarantineLineageHashes: quarantineLineage.map((artifact) => (
          artifact.quarantineHash
        )),
        adjudicationHashes: [...seenAdjudicationHashes.keys()].sort(),
      }),
    },
    counts: {
      quarantineEntries: quarantine.entries.length,
      adjudicationInputs: adjudications.length,
      duplicateAdjudications: duplicateAdjudications.length,
      rejectedAdjudications: rejectedAdjudications.length,
      conflictingAdjudications: conflicts.length,
      pendingWindows: pending.length,
      researchRows: rows.length,
      zeroLossWindows: rows.filter((row) => row.finalIncidents.length === 0).length,
      confirmedLossWindows: rows.filter((row) => row.finalIncidents.length > 0).length,
      confirmedIncidents: rows.reduce((sum, row) => sum + row.finalIncidents.length, 0),
      l3L4Rows: 0,
    },
    adjudicationDisposition: {
      duplicateAdjudications,
      rejectedAdjudications,
      conflicts,
      pending,
    },
    researchRows: rows,
    correlation: {
      independenceClaimed: false,
      correlationDiscountApplied: false,
      distinctOperatorDomainsObserved: distinctDomains,
      connectedComponents: components,
      structuralIndependentUpperBound: components.length,
      splitPolicy: "CONNECTED_COMPONENTS_MUST_REMAIN_IN_ONE_TEMPORAL_PARTITION",
      trainCalibrationHoldoutAssigned: false,
    },
    modelCells,
    modelEntrance: {
      mode: "RESEARCH_SHADOW_ONLY",
      decision: "ABSTAIN_NO_EXTERNALLY_GOVERNED_L3_L4",
      localPolicyConformanceRows: rows.length,
      externallyGovernedL3L4Rows: 0,
      numericEvidenceFloorObserved: numericFloorObserved,
      automaticPromotion: false,
      automaticTraining: false,
      betaBinomialPosteriorComputed: false,
      buhlmannStraubCredibilityComputed: false,
      tvarComputed: false,
      price: null,
      premium: null,
      capital: null,
      coverage: null,
      payout: null,
      missingRequirements,
    },
    claimBoundary: {
      benchmarkOrTokenSpendIsLoss: false,
      failedAttemptCostIsLoss: false,
      robotRewardOrEstimatedDamageIsLoss: false,
      droidOrHistoricalRobotObservationIsLoss: false,
      localAllowlistProvesExternalGovernance: false,
      externalIngestTimestampVerified: false,
      zeroLossWindowsRequiredForDenominator: true,
      currencyConversionPerformed: false,
      l3L4EvidenceClaimed: false,
    },
    authority: {
      mode: "none",
      permitsPricing: false,
      permitsCoverage: false,
      permitsCapital: false,
      permitsSettlement: false,
      movesFunds: false,
    },
  };
}

export function buildLossExposureShadowBook({ quarantine, adjudications = [], trustStore,
  quarantineLineage = [], generatedAt = new Date().toISOString() } = {}) {
  const at = canonicalTime(generatedAt, "LOSS_EXPOSURE_BOOK_TIME");
  const body = buildBookBody({ quarantine, quarantineLineage, adjudications, trustStore,
    generatedAt: at });
  return Object.freeze({ ...body,
    bookHash: digestDomain(LOSS_EXPOSURE_SCHEMAS.shadowBook, body) });
}

export function verifyLossExposureShadowBook(book,
  { quarantine, quarantineLineage = [], adjudications = [], trustStore,
    now = new Date().toISOString() } = {}) {
  const failures = [];
  if (!book || book.schema !== LOSS_EXPOSURE_SCHEMAS.shadowBook
    || !HASH.test(String(book.bookHash ?? ""))) {
    return Object.freeze({ ok: false, failures: ["LOSS_EXPOSURE_BOOK_SCHEMA_INVALID"] });
  }
  const at = safeTime(now, "LOSS_EXPOSURE_BOOK_VERIFY_TIME", failures);
  const generatedAt = safeTime(book.generatedAt, "LOSS_EXPOSURE_BOOK_TIME", failures);
  if (at && generatedAt && Date.parse(generatedAt) > Date.parse(at)) {
    failures.push("LOSS_EXPOSURE_BOOK_FROM_FUTURE");
  }
  try {
    const expectedBody = buildBookBody({ quarantine, quarantineLineage, adjudications,
      trustStore, generatedAt: book.generatedAt });
    const { bookHash, ...actualBody } = book;
    if (canonicalizeStrict(actualBody) !== canonicalizeStrict(expectedBody)
      || digestDomain(LOSS_EXPOSURE_SCHEMAS.shadowBook, expectedBody) !== bookHash) {
      failures.push("LOSS_EXPOSURE_BOOK_DERIVATION_OR_HASH_INVALID");
    }
  } catch (error) { failures.push(`LOSS_EXPOSURE_BOOK_SOURCE_INVALID:${error.message}`); }
  if (book?.modelEntrance?.decision !== "ABSTAIN_NO_EXTERNALLY_GOVERNED_L3_L4"
    || book?.modelEntrance?.externallyGovernedL3L4Rows !== 0
    || book?.modelEntrance?.automaticPromotion !== false
    || book?.modelEntrance?.automaticTraining !== false
    || book?.modelEntrance?.price !== null || book?.modelEntrance?.premium !== null
    || book?.modelEntrance?.capital !== null || book?.modelEntrance?.coverage !== null
    || book?.modelEntrance?.payout !== null
    || book?.authority?.mode !== "none"
    || ["permitsPricing", "permitsCoverage", "permitsCapital", "permitsSettlement",
      "movesFunds"].some((key) => book?.authority?.[key] !== false)) {
    failures.push("LOSS_EXPOSURE_BOOK_ABSTAIN_OR_AUTHORITY_BOUNDARY_INVALID");
  }
  return Object.freeze({ ok: failures.length === 0,
    failures: Object.freeze([...new Set(failures)]),
    sourceArtifactsReverified: failures.length === 0,
    derivationsVerified: failures.length === 0,
    permitsPricing: false,
    l3L4EvidenceRows: 0 });
}
