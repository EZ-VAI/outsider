/* Layer-2 recovery portfolio descendant. Structural references never prove a held option. */
import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";
import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS,
  verifyThreeLayerOutcomeProductArtifactV1,
} from "./outsider-three-layer-outcome-product-contract-v1.js";

export const OUTSIDER_RECOVERY_OPTION_PORTFOLIO_V2_SCHEMA =
  "outsider/recovery-option-portfolio/v2";
export const OUTSIDER_RECOVERY_OPTION_PORTFOLIO_V2_MECHANISMS = Object.freeze([
  "ROUTE_SUBSTITUTION", "STATE_ROLLBACK", "COMPENSATING_ACTION",
]);
export const OUTSIDER_RECOVERY_OPTION_PORTFOLIO_V2_FAILURE_DOMAIN_STATUSES =
  Object.freeze(["PROVEN_DISTINCT", "KNOWN_SHARED", "UNKNOWN"]);

const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const INPUT_FIELDS = ["outcomeOs", "observedAt", "primaryOption", "recoveryOptions"];
const OPTION_FIELDS = ["optionRefHash", "role", "recoveryMechanismKind",
  "latestSafeExerciseAt", "exerciseAuthorityRefHash", "exerciseInstructionRefHash",
  "cancellationRefHash", "exclusiveExerciseSemantics", "failureDomainRefHashes",
  "failureDomainEvidenceRefHash"];
const RECORD_FIELDS = ["schema", "schemaVersion", "recordClass", "productLayer",
  "supersedesSchema", "outcomeOs", "observedAt", "primaryOption",
  "recoveryOptions", "failureDomainRelationship", "failureDomainComparisonBasis",
  "latestSafeExerciseAt", "exerciseWindowOpen", "failureDomainPromotionEligible",
  "externalCapacityEstablished", "recoveryOptionHeld", "recoverableActive",
  "layerTwoPromotionPermitted", "authority", "outcomeTruthEstablished",
  "outcomeCommitIssued", "guaranteeCreated", "directPiiProjected", "gapCodes",
  "artifactHash"];

function fail(code) { const e = new TypeError(`OUTSIDER_RECOVERY_OPTION_PORTFOLIO_V2_${code}`); e.outsiderCode = code; throw e; }
function exact(value, fields, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || isProxy(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some(field => !Object.hasOwn(value, field))) fail(`${code}_FIELDS_INVALID`);
}
function hash(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}
function instant(value, code) {
  if (typeof value !== "string" || !UTC.test(value)
    || new Date(value).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}
function digest(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function option(value, role) {
  exact(value, OPTION_FIELDS, `${role}_OPTION`);
  if (value.role !== role) fail(`${role}_ROLE_INVALID`);
  if (!OUTSIDER_RECOVERY_OPTION_PORTFOLIO_V2_MECHANISMS.includes(value.recoveryMechanismKind))
    fail(`${role}_MECHANISM_INVALID`);
  if (value.exclusiveExerciseSemantics !== "SINGLE_WRITER_PRIMARY_XOR_RECOVERY")
    fail(`${role}_EXCLUSIVE_EXERCISE_SEMANTICS_INVALID`);
  if (!Array.isArray(value.failureDomainRefHashes) || value.failureDomainRefHashes.length < 1
    || value.failureDomainRefHashes.length > 32) fail(`${role}_FAILURE_DOMAINS_INVALID`);
  const domains = value.failureDomainRefHashes.map((item) => hash(item,
    `${role}_FAILURE_DOMAIN_REF_HASH`)).sort();
  if (new Set(domains).size !== domains.length) fail(`${role}_FAILURE_DOMAIN_DUPLICATE`);
  return freeze({ optionRefHash: hash(value.optionRefHash, `${role}_OPTION_REF_HASH`), role,
    recoveryMechanismKind: value.recoveryMechanismKind,
    latestSafeExerciseAt: instant(value.latestSafeExerciseAt, `${role}_LATEST_SAFE_EXERCISE_AT`),
    exerciseAuthorityRefHash: hash(value.exerciseAuthorityRefHash,
      `${role}_EXERCISE_AUTHORITY_REF_HASH`),
    exerciseInstructionRefHash: hash(value.exerciseInstructionRefHash,
      `${role}_EXERCISE_INSTRUCTION_REF_HASH`),
    cancellationRefHash: hash(value.cancellationRefHash, `${role}_CANCELLATION_REF_HASH`),
    exclusiveExerciseSemantics: value.exclusiveExerciseSemantics,
    failureDomainRefHashes: domains,
    failureDomainEvidenceRefHash: hash(value.failureDomainEvidenceRefHash,
      `${role}_FAILURE_DOMAIN_EVIDENCE_REF_HASH`, true) });
}
function relationship(primary, recoveries) {
  if (primary.failureDomainEvidenceRefHash === null
    || recoveries.some(item => item.failureDomainEvidenceRefHash === null)) return "UNKNOWN";
  const primaryDomains = new Set(primary.failureDomainRefHashes);
  return recoveries.some(item => item.failureDomainRefHashes.some(domain => primaryDomains.has(domain)))
    ? "KNOWN_SHARED" : "PROVEN_DISTINCT";
}

export function prepareRecoveryOptionPortfolioV2(input = {}) {
  exact(input, INPUT_FIELDS, "INPUT");
  const outcomeOs = verifyThreeLayerOutcomeProductArtifactV1(input.outcomeOs);
  if (outcomeOs.productLayer !== OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS.outcomeOs)
    fail("OUTCOME_OS_LAYER_INVALID");
  const observedAt = instant(input.observedAt, "OBSERVED_AT");
  const primary = option(input.primaryOption, "PRIMARY");
  if (!Array.isArray(input.recoveryOptions) || input.recoveryOptions.length < 1
    || input.recoveryOptions.length > 32) fail("RECOVERY_OPTIONS_INVALID");
  const recoveries = input.recoveryOptions.map(item => option(item, "RECOVERY"))
    .sort((a, b) => a.optionRefHash.localeCompare(b.optionRefHash));
  if (new Set([primary.optionRefHash, ...recoveries.map(item => item.optionRefHash)]).size
    !== recoveries.length + 1) fail("OPTION_REF_HASH_DUPLICATE");
  const status = relationship(primary, recoveries);
  const latestSafeExerciseAt = recoveries.map(item => item.latestSafeExerciseAt).sort()[0];
  const exerciseWindowOpen = Date.parse(observedAt) < Date.parse(latestSafeExerciseAt);
  const domainEligible = status === "PROVEN_DISTINCT";
  const gaps = ["EXTERNAL_CAPACITY_LIFECYCLE_SOURCE_REPLAY_REQUIRED",
    "EXERCISE_AUTHORITY_SOURCE_REPLAY_REQUIRED"];
  if (status === "UNKNOWN") gaps.push("FAILURE_DOMAIN_RELATIONSHIP_UNKNOWN");
  if (status === "KNOWN_SHARED") gaps.push("PRIMARY_RECOVERY_FAILURE_DOMAIN_SHARED");
  if (!exerciseWindowOpen) gaps.push("LATEST_SAFE_EXERCISE_TIME_REACHED");
  const body = { schema: OUTSIDER_RECOVERY_OPTION_PORTFOLIO_V2_SCHEMA,
    schemaVersion: "2.0.0", recordClass: "AGENT_NEUTRAL_TYPED_RECOVERY_OPTION_PORTFOLIO",
    productLayer: OUTSIDER_THREE_LAYER_OUTCOME_PRODUCT_CONTRACT_V1_LAYERS.formationRecoveryOptions,
    supersedesSchema: "outsider/formation-recovery-options-product/v1", outcomeOs, observedAt,
    primaryOption: primary, recoveryOptions: freeze(recoveries),
    failureDomainRelationship: status,
    failureDomainComparisonBasis: "TYPED_REFERENCE_SET_COMPARISON_NOT_EXTERNAL_CAPACITY_PROOF",
    latestSafeExerciseAt, exerciseWindowOpen,
    failureDomainPromotionEligible: domainEligible && exerciseWindowOpen,
    externalCapacityEstablished: false, recoveryOptionHeld: false,
    recoverableActive: false, layerTwoPromotionPermitted: false, authority: "NONE",
    outcomeTruthEstablished: false, outcomeCommitIssued: false,
    guaranteeCreated: false, directPiiProjected: false, gapCodes: freeze(gaps.sort()) };
  return freeze({ ...body, artifactHash: digest(body.schema, body) });
}

export function verifyRecoveryOptionPortfolioV2(record) {
  exact(record, RECORD_FIELDS, "ARTIFACT");
  const rebuilt = prepareRecoveryOptionPortfolioV2({ outcomeOs: record.outcomeOs,
    observedAt: record.observedAt, primaryOption: record.primaryOption,
    recoveryOptions: record.recoveryOptions });
  if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(record)) fail("ARTIFACT_REPLAY_INVALID");
  return rebuilt;
}
