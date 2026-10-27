/*
 * Reality Stewardship — the cross-stage constitutional spine that keeps a
 * successful machine action from being mistaken for a legitimate use of the
 * shared world.
 *
 * MEASURE, ATTEST, CURATE, PRICE, GUARANTEE and SETTLE answer useful questions,
 * but none of them alone answers who may expose reality, affected parties and
 * future options to an experiment.  This module keeps those non-fungible
 * questions open before, during and after a run:
 *
 *   legitimacy -> cumulative reality budget -> delayed consequence horizons
 *   -> challenge/recovery -> externally governed closure
 *
 * It is an advisory protocol whose inputs may be real-world, controlled,
 * simulated, or synthetic.  “Advisory” limits its authority; it does not
 * relabel empirical evidence as unreal.  A hash, a signature or a passing
 * result here is never production authority, consent, insurance, a CEU or
 * settlement.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const REALITY_STEWARDSHIP_SCHEMAS = Object.freeze({
  boundary: "outsider/reality-boundary/v1",
  claim: "outsider/reality-stewardship-claim/v1",
  commitment: "outsider/reality-budget-commitment/v1",
  assessment: "outsider/reality-stewardship-assessment/v1",
  execution: "outsider/reality-execution-receipt/v1",
  consequence: "outsider/reality-consequence-report/v1",
  challenge: "outsider/reality-challenge/v1",
  consequenceState: "outsider/reality-consequence-state/v1",
});

export const STEWARDSHIP_STAGE_GAPS = Object.freeze({
  MEASURE: Object.freeze([
    "LEGITIMACY_BEFORE_ACTION", "AFFECTED_PARTY_REPRESENTATION",
    "CUMULATIVE_REALITY_BUDGET", "DELAYED_CONSEQUENCE_HORIZON",
  ]),
  ATTEST: Object.freeze([
    "TRUTH_BEYOND_COMMITTED_BYTES", "STANDING_AND_CONSENT",
    "OPEN_WORLD_CONSEQUENCE_AMENDMENT",
  ]),
  CURATE: Object.freeze([
    "RIGHT_TO_CREATE_EXPERIENCE", "RIGHT_TO_REUSE_EXPERIENCE",
    "REUSE_EXTERNALITY_AND_OPTION_LOSS", "VALIDITY_DOMAIN_ENFORCEMENT",
  ]),
  PRICE: Object.freeze([
    "PERMISSION_IS_NOT_PURCHASABLE", "NON_MONETARY_AND_IRREVERSIBLE_HARM",
    "UNKNOWN_UNKNOWN_AND_SYSTEMIC_TAIL", "AFFECTED_PARTY_DISTRIBUTION",
  ]),
  GUARANTEE: Object.freeze([
    "RESOURCE_OWNER_AUTHORITY", "NON_WAIVABLE_CONSTRAINTS",
    "RESPONSIBILITY_CONTINUITY", "EXECUTABLE_RECOVERY_CAPACITY",
  ]),
  SETTLE: Object.freeze([
    "RESTORATION_IS_NOT_PAYMENT", "DELAYED_AND_PROPAGATED_CONSEQUENCES",
    "CHALLENGE_APPEAL_AND_REOPENING", "SYSTEMIC_OBLIGATION_CLOSURE",
  ]),
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const PURPOSES = new Set(["WORK", "EXPERIENCE"]);
const CONSTRAINT_KINDS = new Set(["HARD_PROHIBITION", "CUMULATIVE_CAP"]);
const IMPACT_AGGREGATIONS = new Set(["INCREMENTAL_SUM", "CUMULATIVE_MAX"]);
const OUTCOMES = new Set(["SUCCESS", "PARTIAL", "FAILURE", "UNKNOWN"]);
const CAUSAL_STATES = new Set(["OBSERVATION", "PARTIALLY_IDENTIFIED", "CAUSAL_CLAIM"]);
const RECOVERY_STATES = new Set(["NOT_REQUIRED", "PENDING", "COMPLETE", "FAILED"]);
const CHALLENGE_STATES = new Set(["OPEN", "RESOLVED", "WITHDRAWN"]);
const PARTY_REPORT_DISPOSITIONS = new Set(["OBSERVED", "NO_REPORTED_IMPACT"]);

const DOMAIN = Object.freeze({
  boundary: "outsider/reality-boundary/v1",
  claim: "outsider/reality-stewardship-claim/v1",
  commitment: "outsider/reality-budget-commitment/v1",
  assessment: "outsider/reality-stewardship-assessment/v1",
  execution: "outsider/reality-execution-receipt/v1",
  consequence: "outsider/reality-consequence-report/v1",
  challenge: "outsider/reality-challenge/v1",
  consequenceState: "outsider/reality-consequence-state/v1",
});

function fail(code) { throw new Error(code); }

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function iso(value, code) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    fail(code);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail(code);
  return normalized;
}

function token(value, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(code);
  return value;
}

function hash(value, code) {
  if (!HASH.test(String(value ?? ""))) fail(code);
  return value;
}

function hashes(values, code, { minimum = 0, maximum = 128 } = {}) {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum
    || values.some((value) => !HASH.test(String(value ?? "")))) fail(code);
  const sorted = [...new Set(values)].sort();
  if (sorted.length !== values.length) fail(`${code}_DUPLICATE`);
  return sorted;
}

function nonNegativeInteger(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
}

function positiveInteger(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(code);
  return value;
}

function addSafe(left, right, code) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail(code);
  return result;
}

function fixedBoundary() {
  return {
    lane: "RESEARCH_AND_ADVISORY_ONLY",
    authority: "none",
    ownerGateAdoptionEstablished: false,
    automaticTraining: false,
    causalExperienceUnits: 0,
    financialEffect: "none",
    permits: { EXECUTE: false, PRICE: false, GUARANTEE: false, SETTLE: false },
  };
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function seal(schema, domain, body, hashField) {
  return deepFreeze({ schema, schemaVersion: "1.0.0", ...body,
    [hashField]: digest(domain, { schema, schemaVersion: "1.0.0", ...body }) });
}

function verifySeal(record, schema, domain, hashField, keys) {
  if (!exactKeys(record, ["schema", "schemaVersion", ...keys, hashField])
    || record.schema !== schema || record.schemaVersion !== "1.0.0"
    || !HASH.test(record[hashField] ?? "")) return false;
  const body = Object.fromEntries(keys.map((key) => [key, record[key]]));
  return record[hashField] === digest(domain,
    { schema, schemaVersion: "1.0.0", ...body });
}

const BOUNDARY_KEYS = [
  "boundaryId", "worldHash", "policyHash", "resourceOwnerRootHash",
  "affectedPartyRootHashes", "affectedPartyRegisterCompleteness",
  "affectedPartyStandingExternallyVerified", "constraints", "observationHorizons",
  "challengePolicyHash", "recoveryStandardHash", "validFrom", "validUntil", "boundary",
];

function normalizeConstraint(value) {
  if (!exactKeys(value, ["channelId", "kind", "unit", "cap", "aggregation",
    "nonCompensable", "affectedPartyRootHashes"])) fail("REALITY_CONSTRAINT_SCHEMA_INVALID");
  const kind = token(value.kind, "REALITY_CONSTRAINT_KIND_INVALID");
  if (!CONSTRAINT_KINDS.has(kind)) fail("REALITY_CONSTRAINT_KIND_INVALID");
  const cap = kind === "HARD_PROHIBITION"
    ? nonNegativeInteger(value.cap, "REALITY_CONSTRAINT_CAP_INVALID")
    : positiveInteger(value.cap, "REALITY_CONSTRAINT_CAP_INVALID");
  if (kind === "HARD_PROHIBITION" && cap !== 0) fail("REALITY_HARD_CONSTRAINT_CAP_NOT_ZERO");
  if (value.nonCompensable !== true) fail("REALITY_CONSTRAINT_MUST_BE_NON_COMPENSABLE");
  const aggregation = token(value.aggregation, "REALITY_CONSTRAINT_AGGREGATION_INVALID");
  if (!IMPACT_AGGREGATIONS.has(aggregation)) {
    fail("REALITY_CONSTRAINT_AGGREGATION_INVALID");
  }
  return {
    channelId: token(value.channelId, "REALITY_CONSTRAINT_CHANNEL_INVALID"),
    kind,
    unit: token(value.unit, "REALITY_CONSTRAINT_UNIT_INVALID"),
    cap,
    aggregation,
    nonCompensable: true,
    affectedPartyRootHashes: hashes(value.affectedPartyRootHashes,
      "REALITY_CONSTRAINT_PARTIES_INVALID", { minimum: 1 }),
  };
}

function normalizeHorizon(value) {
  if (!exactKeys(value, ["horizonId", "closesAfterMs", "mandatory"])) {
    fail("REALITY_HORIZON_SCHEMA_INVALID");
  }
  if (value.mandatory !== true) fail("REALITY_HORIZON_MUST_BE_MANDATORY");
  return { horizonId: token(value.horizonId, "REALITY_HORIZON_ID_INVALID"),
    closesAfterMs: nonNegativeInteger(value.closesAfterMs,
      "REALITY_HORIZON_DURATION_INVALID"), mandatory: true };
}

export function createRealityBoundary({
  boundaryId, worldHash, policyHash, resourceOwnerRootHash,
  affectedPartyRootHashes, constraints, observationHorizons,
  challengePolicyHash, recoveryStandardHash, validFrom, validUntil,
} = {}) {
  const parties = hashes(affectedPartyRootHashes, "REALITY_BOUNDARY_PARTIES_INVALID",
    { minimum: 1 });
  if (!Array.isArray(constraints) || constraints.length === 0 || constraints.length > 64) {
    fail("REALITY_BOUNDARY_CONSTRAINTS_INVALID");
  }
  const normalizedConstraints = constraints.map(normalizeConstraint)
    .sort((a, b) => a.channelId.localeCompare(b.channelId));
  if (new Set(normalizedConstraints.map((item) => item.channelId)).size
    !== normalizedConstraints.length) fail("REALITY_BOUNDARY_CONSTRAINT_DUPLICATE");
  for (const constraint of normalizedConstraints) {
    if (constraint.affectedPartyRootHashes.some((party) => !parties.includes(party))) {
      fail("REALITY_CONSTRAINT_PARTY_OUTSIDE_BOUNDARY");
    }
  }
  if (!Array.isArray(observationHorizons) || observationHorizons.length === 0
    || observationHorizons.length > 32) fail("REALITY_BOUNDARY_HORIZONS_INVALID");
  const horizons = observationHorizons.map(normalizeHorizon)
    .sort((a, b) => a.closesAfterMs - b.closesAfterMs
      || a.horizonId.localeCompare(b.horizonId));
  if (new Set(horizons.map((item) => item.horizonId)).size !== horizons.length) {
    fail("REALITY_BOUNDARY_HORIZON_DUPLICATE");
  }
  if (!horizons.some((item) => item.closesAfterMs > 0)) {
    fail("REALITY_BOUNDARY_DELAYED_HORIZON_REQUIRED");
  }
  const from = iso(validFrom, "REALITY_BOUNDARY_VALID_FROM_INVALID");
  const until = iso(validUntil, "REALITY_BOUNDARY_VALID_UNTIL_INVALID");
  if (Date.parse(until) <= Date.parse(from)) fail("REALITY_BOUNDARY_WINDOW_INVALID");
  return seal(REALITY_STEWARDSHIP_SCHEMAS.boundary, DOMAIN.boundary, {
    boundaryId: token(boundaryId, "REALITY_BOUNDARY_ID_INVALID"),
    worldHash: hash(worldHash, "REALITY_WORLD_HASH_INVALID"),
    policyHash: hash(policyHash, "REALITY_POLICY_HASH_INVALID"),
    resourceOwnerRootHash: hash(resourceOwnerRootHash, "REALITY_OWNER_HASH_INVALID"),
    affectedPartyRootHashes: parties,
    affectedPartyRegisterCompleteness: "SELF_ASSERTED_NOT_EXTERNALLY_COMPLETE",
    affectedPartyStandingExternallyVerified: false,
    constraints: normalizedConstraints,
    observationHorizons: horizons,
    challengePolicyHash: hash(challengePolicyHash, "REALITY_CHALLENGE_POLICY_INVALID"),
    recoveryStandardHash: hash(recoveryStandardHash, "REALITY_RECOVERY_STANDARD_INVALID"),
    validFrom: from,
    validUntil: until,
    boundary: fixedBoundary(),
  }, "boundaryHash");
}

export function verifyRealityBoundary(record) {
  try {
    if (!verifySeal(record, REALITY_STEWARDSHIP_SCHEMAS.boundary, DOMAIN.boundary,
      "boundaryHash", BOUNDARY_KEYS)) fail("REALITY_BOUNDARY_HASH_OR_SCHEMA_INVALID");
    const rebuilt = createRealityBoundary(record);
    if (!same(record, rebuilt)) fail("REALITY_BOUNDARY_DERIVATION_INVALID");
    return { ok: true, boundaryHash: record.boundaryHash,
      verificationLevel: "SELF_CHECK_ONLY", sourceReverified: false,
      affectedPartyRegisterExternallyVerified: false,
      ownerAuthorityExternallyVerified: false };
  } catch (error) { return { ok: false, error: String(error?.message ?? error) }; }
}

const CLAIM_KEYS = [
  "boundaryHash", "claimIdHash", "wayHash", "claimantRootHash",
  "standingEvidenceHashes", "purpose", "operationHashes",
  "representedPartyRootHashes", "requestedExternalities", "alternativesConsideredHashes",
  "whyRealityRequiredHash", "causalDesignHash", "experienceRightsHash",
  "optionPreservationEvidenceHashes", "recoveryPlanHash", "responsibilityRootHashes",
  "compensationProposalHash", "requestedAt", "expiresAt", "boundary",
];

function normalizeRequestedExternality(value) {
  if (!exactKeys(value, ["channelId", "amount"])) fail("REALITY_REQUEST_SCHEMA_INVALID");
  return { channelId: token(value.channelId, "REALITY_REQUEST_CHANNEL_INVALID"),
    amount: nonNegativeInteger(value.amount, "REALITY_REQUEST_AMOUNT_INVALID") };
}

export function createStewardshipClaim({
  boundary, claimIdHash, wayHash, claimantRootHash, standingEvidenceHashes,
  purpose, operationHashes, representedPartyRootHashes, requestedExternalities,
  alternativesConsideredHashes, whyRealityRequiredHash = null, causalDesignHash = null,
  experienceRightsHash = null, optionPreservationEvidenceHashes, recoveryPlanHash,
  responsibilityRootHashes, compensationProposalHash = null, requestedAt, expiresAt,
} = {}) {
  if (!verifyRealityBoundary(boundary).ok) fail("REALITY_CLAIM_BOUNDARY_INVALID");
  const normalizedPurpose = token(purpose, "REALITY_CLAIM_PURPOSE_INVALID");
  if (!PURPOSES.has(normalizedPurpose)) fail("REALITY_CLAIM_PURPOSE_INVALID");
  if (!Array.isArray(requestedExternalities) || requestedExternalities.length === 0
    || requestedExternalities.length > 64) fail("REALITY_REQUESTS_INVALID");
  const requests = requestedExternalities.map(normalizeRequestedExternality)
    .sort((a, b) => a.channelId.localeCompare(b.channelId));
  if (new Set(requests.map((item) => item.channelId)).size !== requests.length) {
    fail("REALITY_REQUEST_CHANNEL_DUPLICATE");
  }
  if (!same(requests.map((item) => item.channelId),
    boundary.constraints.map((item) => item.channelId).sort())) {
    fail("REALITY_REQUEST_MUST_COVER_ALL_BOUNDARY_CHANNELS");
  }
  const requested = iso(requestedAt, "REALITY_CLAIM_REQUESTED_AT_INVALID");
  const expires = iso(expiresAt, "REALITY_CLAIM_EXPIRES_AT_INVALID");
  if (Date.parse(expires) <= Date.parse(requested)
    || Date.parse(requested) < Date.parse(boundary.validFrom)
    || Date.parse(expires) > Date.parse(boundary.validUntil)) {
    fail("REALITY_CLAIM_TIME_WINDOW_INVALID");
  }
  const nullableHash = (value, code) => value === null ? null : hash(value, code);
  return seal(REALITY_STEWARDSHIP_SCHEMAS.claim, DOMAIN.claim, {
    boundaryHash: boundary.boundaryHash,
    claimIdHash: hash(claimIdHash, "REALITY_CLAIM_ID_INVALID"),
    wayHash: hash(wayHash, "REALITY_CLAIM_WAY_INVALID"),
    claimantRootHash: hash(claimantRootHash, "REALITY_CLAIMANT_ROOT_INVALID"),
    standingEvidenceHashes: hashes(standingEvidenceHashes,
      "REALITY_STANDING_EVIDENCE_INVALID", { minimum: 1 }),
    purpose: normalizedPurpose,
    operationHashes: hashes(operationHashes, "REALITY_OPERATIONS_INVALID", { minimum: 1 }),
    representedPartyRootHashes: hashes(representedPartyRootHashes,
      "REALITY_REPRESENTED_PARTIES_INVALID"),
    requestedExternalities: requests,
    alternativesConsideredHashes: hashes(alternativesConsideredHashes,
      "REALITY_ALTERNATIVES_INVALID", { minimum: 1 }),
    whyRealityRequiredHash: nullableHash(whyRealityRequiredHash,
      "REALITY_WHY_REALITY_REQUIRED_INVALID"),
    causalDesignHash: nullableHash(causalDesignHash, "REALITY_CAUSAL_DESIGN_INVALID"),
    experienceRightsHash: nullableHash(experienceRightsHash,
      "REALITY_EXPERIENCE_RIGHTS_INVALID"),
    optionPreservationEvidenceHashes: hashes(optionPreservationEvidenceHashes,
      "REALITY_OPTION_EVIDENCE_INVALID", { minimum: 1 }),
    recoveryPlanHash: hash(recoveryPlanHash, "REALITY_RECOVERY_PLAN_INVALID"),
    responsibilityRootHashes: hashes(responsibilityRootHashes,
      "REALITY_RESPONSIBILITY_ROOTS_INVALID", { minimum: 1 }),
    compensationProposalHash: nullableHash(compensationProposalHash,
      "REALITY_COMPENSATION_PROPOSAL_INVALID"),
    requestedAt: requested,
    expiresAt: expires,
    boundary: fixedBoundary(),
  }, "claimHash");
}

export function verifyStewardshipClaim(record, { boundary = null } = {}) {
  try {
    if (!verifySeal(record, REALITY_STEWARDSHIP_SCHEMAS.claim, DOMAIN.claim,
      "claimHash", CLAIM_KEYS)) fail("REALITY_CLAIM_HASH_OR_SCHEMA_INVALID");
    if (!same(record.boundary, fixedBoundary())) fail("REALITY_CLAIM_BOUNDARY_CHANGED");
    if (boundary !== null) {
      if (!verifyRealityBoundary(boundary).ok || record.boundaryHash !== boundary.boundaryHash) {
        fail("REALITY_CLAIM_BOUNDARY_INVALID");
      }
      const rebuilt = createStewardshipClaim({ ...record, boundary });
      if (!same(record, rebuilt)) fail("REALITY_CLAIM_DERIVATION_INVALID");
    }
    return { ok: true, claimHash: record.claimHash,
      verificationLevel: boundary === null ? "SELF_CHECK_ONLY" : "BOUNDARY_REDERIVED" };
  } catch (error) { return { ok: false, error: String(error?.message ?? error) }; }
}

const COMMITMENT_KEYS = [
  "boundaryHash", "claimHash", "channelAmounts", "commitmentEvidenceHash",
  "committedAt", "completeness", "boundary",
];

export function createRealityBudgetCommitment({
  boundary, claim, channelAmounts, commitmentEvidenceHash, committedAt,
} = {}) {
  if (!verifyRealityBoundary(boundary).ok || !verifyStewardshipClaim(claim, { boundary }).ok
    || claim.boundaryHash !== boundary.boundaryHash) fail("REALITY_COMMITMENT_BINDING_INVALID");
  if (!Array.isArray(channelAmounts) || channelAmounts.length === 0
    || channelAmounts.length > 64) fail("REALITY_COMMITMENT_AMOUNTS_INVALID");
  const amounts = channelAmounts.map(normalizeRequestedExternality)
    .sort((a, b) => a.channelId.localeCompare(b.channelId));
  if (new Set(amounts.map((item) => item.channelId)).size !== amounts.length) {
    fail("REALITY_COMMITMENT_CHANNEL_DUPLICATE");
  }
  if (!same(amounts, claim.requestedExternalities)) {
    fail("REALITY_COMMITMENT_MUST_RESERVE_EXACT_CLAIM_REQUEST");
  }
  const committed = iso(committedAt, "REALITY_COMMITMENT_TIME_INVALID");
  if (Date.parse(committed) < Date.parse(claim.requestedAt)
    || Date.parse(committed) >= Date.parse(claim.expiresAt)
    || Date.parse(committed) < Date.parse(boundary.validFrom)
    || Date.parse(committed) >= Date.parse(boundary.validUntil)) {
    fail("REALITY_COMMITMENT_OUTSIDE_VALIDITY_WINDOW");
  }
  return seal(REALITY_STEWARDSHIP_SCHEMAS.commitment, DOMAIN.commitment, {
    boundaryHash: boundary.boundaryHash,
    claimHash: claim.claimHash,
    channelAmounts: amounts,
    commitmentEvidenceHash: hash(commitmentEvidenceHash,
      "REALITY_COMMITMENT_EVIDENCE_INVALID"),
    committedAt: committed,
    completeness: "OPERATOR_OBSERVED_NOT_EXTERNALLY_COMPLETE",
    boundary: fixedBoundary(),
  }, "commitmentHash");
}

export function verifyRealityBudgetCommitment(record, { boundary = null, claim = null } = {}) {
  try {
    if (!verifySeal(record, REALITY_STEWARDSHIP_SCHEMAS.commitment, DOMAIN.commitment,
      "commitmentHash", COMMITMENT_KEYS)) fail("REALITY_COMMITMENT_INVALID");
    if (record.completeness !== "OPERATOR_OBSERVED_NOT_EXTERNALLY_COMPLETE"
      || !same(record.boundary, fixedBoundary())) fail("REALITY_COMMITMENT_BOUNDARY_CHANGED");
    hash(record.boundaryHash, "REALITY_COMMITMENT_BOUNDARY_HASH_INVALID");
    hash(record.claimHash, "REALITY_COMMITMENT_CLAIM_HASH_INVALID");
    hash(record.commitmentEvidenceHash, "REALITY_COMMITMENT_EVIDENCE_INVALID");
    iso(record.committedAt, "REALITY_COMMITMENT_TIME_INVALID");
    if (!Array.isArray(record.channelAmounts) || record.channelAmounts.length === 0
      || record.channelAmounts.length > 64) fail("REALITY_COMMITMENT_AMOUNTS_INVALID");
    const normalizedAmounts = record.channelAmounts.map(normalizeRequestedExternality)
      .sort((a, b) => a.channelId.localeCompare(b.channelId));
    if (new Set(normalizedAmounts.map((item) => item.channelId)).size
      !== normalizedAmounts.length || !same(normalizedAmounts, record.channelAmounts)) {
      fail("REALITY_COMMITMENT_AMOUNTS_NON_CANONICAL");
    }
    if ((boundary === null) !== (claim === null)) fail("REALITY_COMMITMENT_SOURCE_PAIR_REQUIRED");
    if (boundary !== null) {
      const rebuilt = createRealityBudgetCommitment({ ...record, boundary, claim });
      if (!same(record, rebuilt)) fail("REALITY_COMMITMENT_DERIVATION_INVALID");
    }
    return { ok: true, commitmentHash: record.commitmentHash,
      verificationLevel: boundary === null ? "SELF_CHECK_ONLY" : "SOURCE_REDERIVED" };
  } catch (error) { return { ok: false, error: String(error?.message ?? error) }; }
}

function gate(status, reasons = []) { return { status, reasons: [...reasons].sort() }; }

export function assessRealityStewardship({
  boundary, claim, priorCommitmentEntries = [], now,
} = {}) {
  if (!verifyRealityBoundary(boundary).ok || !verifyStewardshipClaim(claim, { boundary }).ok
    || claim.boundaryHash !== boundary.boundaryHash) fail("REALITY_ASSESSMENT_BINDING_INVALID");
  const at = iso(now, "REALITY_ASSESSMENT_TIME_INVALID");
  if (Date.parse(at) < Date.parse(boundary.validFrom)
    || Date.parse(at) >= Date.parse(boundary.validUntil)
    || Date.parse(at) >= Date.parse(claim.expiresAt)) fail("REALITY_ASSESSMENT_OUTSIDE_WINDOW");
  if (!Array.isArray(priorCommitmentEntries) || priorCommitmentEntries.length > 10_000) {
    fail("REALITY_ASSESSMENT_COMMITMENTS_INVALID");
  }
  const seenCommitments = new Set();
  const usage = new Map(boundary.constraints.map((item) => [item.channelId, 0]));
  for (const entry of priorCommitmentEntries) {
    if (!exactKeys(entry, ["commitment", "claim"])) {
      fail("REALITY_ASSESSMENT_COMMITMENT_ENTRY_INVALID");
    }
    const { commitment, claim: committedClaim } = entry;
    if (!verifyStewardshipClaim(committedClaim, { boundary }).ok
      || !verifyRealityBudgetCommitment(commitment, {
        boundary, claim: committedClaim,
      }).ok
      || commitment.boundaryHash !== boundary.boundaryHash
      || commitment.claimHash !== committedClaim.claimHash) {
      fail("REALITY_ASSESSMENT_COMMITMENT_INVALID");
    }
    if (commitment.claimHash === claim.claimHash) {
      fail("REALITY_ASSESSMENT_CURRENT_CLAIM_ALREADY_COMMITTED");
    }
    if (seenCommitments.has(commitment.commitmentHash)) continue;
    seenCommitments.add(commitment.commitmentHash);
    for (const item of commitment.channelAmounts) {
      if (!usage.has(item.channelId)) fail("REALITY_COMMITMENT_UNKNOWN_CHANNEL");
      usage.set(item.channelId, addSafe(usage.get(item.channelId), item.amount,
        "REALITY_COMMITMENT_USAGE_OVERFLOW"));
    }
  }
  const requested = new Map(claim.requestedExternalities
    .map((item) => [item.channelId, item.amount]));
  const hardReasons = [];
  const budgetRows = boundary.constraints.map((constraint) => {
    const used = usage.get(constraint.channelId) ?? 0;
    const ask = requested.get(constraint.channelId) ?? 0;
    const projected = addSafe(used, ask, "REALITY_PROJECTED_USAGE_OVERFLOW");
    let status = "PASS";
    if (constraint.kind === "HARD_PROHIBITION" && ask > 0) {
      status = "REFUSE";
      hardReasons.push(`HARD_PROHIBITION:${constraint.channelId}`);
    } else if (constraint.kind === "CUMULATIVE_CAP" && projected > constraint.cap) {
      status = "REFUSE";
      hardReasons.push(`CUMULATIVE_CAP_EXCEEDED:${constraint.channelId}`);
    }
    return { channelId: constraint.channelId, kind: constraint.kind, unit: constraint.unit,
      alreadyCommitted: used, requested: ask, projected, cap: constraint.cap,
      nonCompensable: true, status };
  });
  for (const channelId of requested.keys()) {
    if (!usage.has(channelId)) hardReasons.push(`UNKNOWN_EXTERNALITY_CHANNEL:${channelId}`);
  }
  const missingRepresentation = boundary.affectedPartyRootHashes
    .filter((party) => !claim.representedPartyRootHashes.includes(party));
  const experienceMissing = claim.purpose === "EXPERIENCE"
    ? [
      claim.whyRealityRequiredHash ? null : "WHY_REALITY_REQUIRED_MISSING",
      claim.causalDesignHash ? null : "CAUSAL_DESIGN_MISSING",
      claim.experienceRightsHash ? null : "EXPERIENCE_RIGHTS_MISSING",
    ].filter(Boolean) : [];
  const gates = {
    standing: gate(claim.standingEvidenceHashes.length
      ? "REFERENCED_NOT_EXTERNALLY_VERIFIED" : "HOLD"),
    representation: gate(missingRepresentation.length === 0
      ? "REFERENCED_NOT_EXTERNALLY_VERIFIED" : "REFUSE",
      missingRepresentation.map((item) => `UNREPRESENTED_PARTY:${item}`)),
    authority: gate("EXTERNAL_OWNER_GATE_REQUIRED", ["OUTSIDER_CANNOT_AUTHORIZE"]),
    externalityBudget: gate(hardReasons.length ? "REFUSE" : "PASS", hardReasons),
    recovery: gate(claim.recoveryPlanHash && claim.responsibilityRootHashes.length
      ? "REFERENCED_NOT_EXTERNALLY_VERIFIED" : "HOLD"),
    optionality: gate(claim.optionPreservationEvidenceHashes.length
      ? "REFERENCED_NOT_EXTERNALLY_VERIFIED" : "HOLD"),
    experienceRights: gate(experienceMissing.length ? "HOLD"
      : "REFERENCED_NOT_EXTERNALLY_VERIFIED", experienceMissing),
    longHorizonObservability: gate(boundary.observationHorizons.some((item) =>
      item.closesAfterMs > 0) ? "STRUCTURALLY_PRESENT" : "HOLD"),
  };
  const refusal = Object.values(gates).some((item) => item.status === "REFUSE");
  const hold = Object.values(gates).some((item) => item.status === "HOLD");
  const decision = refusal ? "REFUSE_NON_FUNGIBLE_CONSTRAINT"
    : hold ? "HOLD_MISSING_CONSTITUTIONAL_EVIDENCE"
      : "STRUCTURALLY_READY_PENDING_EXTERNAL_LEDGER_AND_OWNER_GATE";
  const compensationCannotOverride = claim.compensationProposalHash !== null
    && (hardReasons.length > 0 || missingRepresentation.length > 0);
  return seal(REALITY_STEWARDSHIP_SCHEMAS.assessment, DOMAIN.assessment, {
    boundaryHash: boundary.boundaryHash,
    claimHash: claim.claimHash,
    assessedAt: at,
    decision,
    gates,
    budgetRows,
    priorCommitmentHashes: [...seenCommitments].sort(),
    budgetCompleteness: "OPERATOR_OBSERVED_NOT_EXTERNALLY_COMPLETE",
    affectedPartyRegisterCompleteness: boundary.affectedPartyRegisterCompleteness,
    measurementTruthExternallyVerified: false,
    affectedPartyReportsExternallyVerified: false,
    compensationCannotOverride,
    executionAuthorized: false,
    ownerGateInputEligible: false,
    externalLedgerAndOwnerReviewRequired: !refusal && !hold,
    boundary: fixedBoundary(),
  }, "assessmentHash");
}

export function verifyRealityStewardshipAssessment(record, {
  boundary = null, claim = null, priorCommitmentEntries = null,
} = {}) {
  try {
    const keys = ["boundaryHash", "claimHash", "assessedAt", "decision", "gates",
      "budgetRows", "priorCommitmentHashes", "budgetCompleteness",
      "affectedPartyRegisterCompleteness", "measurementTruthExternallyVerified",
      "affectedPartyReportsExternallyVerified", "compensationCannotOverride",
      "executionAuthorized", "ownerGateInputEligible",
      "externalLedgerAndOwnerReviewRequired", "boundary"];
    if (!verifySeal(record, REALITY_STEWARDSHIP_SCHEMAS.assessment, DOMAIN.assessment,
      "assessmentHash", keys)) fail("REALITY_ASSESSMENT_INVALID");
    if (!same(record.boundary, fixedBoundary()) || record.executionAuthorized !== false
      || record.ownerGateInputEligible !== false
      || record.budgetCompleteness !== "OPERATOR_OBSERVED_NOT_EXTERNALLY_COMPLETE"
      || record.affectedPartyRegisterCompleteness
        !== "SELF_ASSERTED_NOT_EXTERNALLY_COMPLETE"
      || record.measurementTruthExternallyVerified !== false
      || record.affectedPartyReportsExternallyVerified !== false) {
      fail("REALITY_ASSESSMENT_BOUNDARY_CHANGED");
    }
    const decisions = new Set([
      "REFUSE_NON_FUNGIBLE_CONSTRAINT",
      "HOLD_MISSING_CONSTITUTIONAL_EVIDENCE",
      "STRUCTURALLY_READY_PENDING_EXTERNAL_LEDGER_AND_OWNER_GATE",
    ]);
    if (!decisions.has(record.decision)
      || record.externalLedgerAndOwnerReviewRequired
        !== (record.decision === "STRUCTURALLY_READY_PENDING_EXTERNAL_LEDGER_AND_OWNER_GATE")) {
      fail("REALITY_ASSESSMENT_DECISION_INVALID");
    }
    const supplied = [boundary, claim, priorCommitmentEntries]
      .filter((value) => value !== null).length;
    if (supplied !== 0 && supplied !== 3) fail("REALITY_ASSESSMENT_SOURCE_SET_REQUIRED");
    if (supplied === 3) {
      const rebuilt = assessRealityStewardship({
        boundary, claim, priorCommitmentEntries, now: record.assessedAt,
      });
      if (!same(record, rebuilt)) fail("REALITY_ASSESSMENT_DERIVATION_INVALID");
    }
    return { ok: true, assessmentHash: record.assessmentHash,
      verificationLevel: supplied === 3 ? "STRUCTURAL_INPUTS_REDERIVED" : "SELF_CHECK_ONLY",
      protocolInputsReplayed: supplied === 3,
      sourceReverified: false,
      structuralDecisionVerified: supplied === 3,
      measurementTruthExternallyVerified: false,
      affectedPartyReportsExternallyVerified: false,
      externalLedgerCompletenessVerified: false,
      affectedPartyRegisterExternallyVerified: false,
      ownerGateEligibilityVerified: false };
  } catch (error) { return { ok: false, error: String(error?.message ?? error) }; }
}

const EXECUTION_KEYS = [
  "boundaryHash", "claimHash", "ownerGateReceiptHash", "executionEvidenceHash",
  "providerRootHash", "responsibilityRootHashes", "executedAt",
  "externalOwnerAdoptionVerified", "boundary",
];

export function createRealityExecutionReceipt({
  boundary, claim, ownerGateReceiptHash, executionEvidenceHash, providerRootHash,
  responsibilityRootHashes, executedAt,
} = {}) {
  if (!verifyRealityBoundary(boundary).ok || !verifyStewardshipClaim(claim, { boundary }).ok
    || claim.boundaryHash !== boundary.boundaryHash) fail("REALITY_EXECUTION_BINDING_INVALID");
  const responsibilities = hashes(responsibilityRootHashes,
    "REALITY_EXECUTION_RESPONSIBILITY_INVALID", { minimum: 1 });
  for (const root of claim.responsibilityRootHashes) {
    if (!responsibilities.includes(root)) fail("REALITY_EXECUTION_RESPONSIBILITY_ERASED");
  }
  const provider = hash(providerRootHash, "REALITY_PROVIDER_ROOT_INVALID");
  if (!responsibilities.includes(provider)) fail("REALITY_EXECUTION_PROVIDER_NOT_RESPONSIBLE");
  const executed = iso(executedAt, "REALITY_EXECUTED_AT_INVALID");
  if (Date.parse(executed) < Date.parse(claim.requestedAt)
    || Date.parse(executed) >= Date.parse(claim.expiresAt)
    || Date.parse(executed) < Date.parse(boundary.validFrom)
    || Date.parse(executed) >= Date.parse(boundary.validUntil)) {
    fail("REALITY_EXECUTION_OUTSIDE_CLAIM_WINDOW");
  }
  return seal(REALITY_STEWARDSHIP_SCHEMAS.execution, DOMAIN.execution, {
    boundaryHash: boundary.boundaryHash,
    claimHash: claim.claimHash,
    ownerGateReceiptHash: hash(ownerGateReceiptHash, "REALITY_OWNER_GATE_RECEIPT_INVALID"),
    executionEvidenceHash: hash(executionEvidenceHash, "REALITY_EXECUTION_EVIDENCE_INVALID"),
    providerRootHash: provider,
    responsibilityRootHashes: responsibilities,
    executedAt: executed,
    externalOwnerAdoptionVerified: false,
    boundary: fixedBoundary(),
  }, "executionHash");
}

export function verifyRealityExecutionReceipt(record, { boundary = null, claim = null } = {}) {
  try {
    if (!verifySeal(record, REALITY_STEWARDSHIP_SCHEMAS.execution, DOMAIN.execution,
      "executionHash", EXECUTION_KEYS) || record.externalOwnerAdoptionVerified !== false
      || !same(record.boundary, fixedBoundary())) fail("REALITY_EXECUTION_INVALID");
    if ((boundary === null) !== (claim === null)) fail("REALITY_EXECUTION_SOURCE_PAIR_REQUIRED");
    if (boundary !== null) {
      const rebuilt = createRealityExecutionReceipt({ ...record, boundary, claim });
      if (!same(record, rebuilt)) fail("REALITY_EXECUTION_DERIVATION_INVALID");
    }
    return { ok: true, executionHash: record.executionHash,
      verificationLevel: boundary === null ? "SELF_CHECK_ONLY" : "SOURCE_REDERIVED" };
  } catch (error) { return { ok: false, error: String(error?.message ?? error) }; }
}

const CONSEQUENCE_KEYS = [
  "boundaryHash", "claimHash", "executionHash", "horizonId", "outcome",
  "impactMeasurements", "affectedPartyReports", "causalStatus", "recoveryStatus",
  "recoveryStandardHash", "recoveryEvidenceHashes", "recoveryExternallyVerified",
  "measurementTruthExternallyVerified", "affectedPartyReportsExternallyVerified",
  "measurementEvidenceHashes", "observedAt", "boundary",
];

function normalizeImpact(value) {
  if (!exactKeys(value, ["channelId", "amount", "measurementEvidenceHash"])) {
    fail("REALITY_IMPACT_SCHEMA_INVALID");
  }
  return { channelId: token(value.channelId, "REALITY_IMPACT_CHANNEL_INVALID"),
    amount: nonNegativeInteger(value.amount, "REALITY_IMPACT_AMOUNT_INVALID"),
    measurementEvidenceHash: hash(value.measurementEvidenceHash,
      "REALITY_IMPACT_EVIDENCE_INVALID") };
}

function normalizeAffectedPartyReport(value) {
  if (!exactKeys(value, ["affectedPartyRootHash", "reportHash", "disposition"])) {
    fail("REALITY_PARTY_REPORT_SCHEMA_INVALID");
  }
  if (!PARTY_REPORT_DISPOSITIONS.has(value.disposition)) {
    fail("REALITY_PARTY_REPORT_DISPOSITION_INVALID");
  }
  return { affectedPartyRootHash: hash(value.affectedPartyRootHash,
    "REALITY_PARTY_REPORT_ROOT_INVALID"),
  reportHash: hash(value.reportHash, "REALITY_PARTY_REPORT_HASH_INVALID"),
  disposition: value.disposition };
}

export function createConsequenceReport({
  boundary, claim, execution, horizonId, outcome, impactMeasurements = [],
  affectedPartyReports, causalStatus = "OBSERVATION",
  recoveryStatus = "NOT_REQUIRED", recoveryStandardHash = null,
  recoveryEvidenceHashes = [], measurementEvidenceHashes, observedAt,
} = {}) {
  if (!verifyRealityBoundary(boundary).ok || !verifyStewardshipClaim(claim, { boundary }).ok
    || !verifyRealityExecutionReceipt(execution, { boundary, claim }).ok
    || claim.boundaryHash !== boundary.boundaryHash
    || execution.claimHash !== claim.claimHash) fail("REALITY_CONSEQUENCE_BINDING_INVALID");
  if (!boundary.observationHorizons.some((item) => item.horizonId === horizonId)) {
    fail("REALITY_CONSEQUENCE_HORIZON_UNKNOWN");
  }
  if (!OUTCOMES.has(outcome)) fail("REALITY_CONSEQUENCE_OUTCOME_INVALID");
  if (!CAUSAL_STATES.has(causalStatus)) fail("REALITY_CONSEQUENCE_CAUSAL_STATUS_INVALID");
  if (!RECOVERY_STATES.has(recoveryStatus)) fail("REALITY_CONSEQUENCE_RECOVERY_INVALID");
  if (!Array.isArray(impactMeasurements)
    || impactMeasurements.length !== boundary.constraints.length
    || impactMeasurements.length > 64) {
    fail("REALITY_IMPACTS_INVALID");
  }
  const impacts = impactMeasurements.map(normalizeImpact)
    .sort((a, b) => a.channelId.localeCompare(b.channelId));
  if (new Set(impacts.map((item) => item.channelId)).size !== impacts.length
    || !same(impacts.map((item) => item.channelId),
      boundary.constraints.map((constraint) => constraint.channelId))) {
    fail("REALITY_IMPACT_CHANNEL_COVERAGE_INVALID");
  }
  if (!Array.isArray(affectedPartyReports)
    || affectedPartyReports.length !== boundary.affectedPartyRootHashes.length) {
    fail("REALITY_PARTY_REPORT_COVERAGE_INVALID");
  }
  const partyReports = affectedPartyReports.map(normalizeAffectedPartyReport)
    .sort((a, b) => a.affectedPartyRootHash.localeCompare(b.affectedPartyRootHash));
  if (!same(partyReports.map((item) => item.affectedPartyRootHash),
    boundary.affectedPartyRootHashes)) fail("REALITY_PARTY_REPORT_COVERAGE_INVALID");
  const hasPositiveImpact = impacts.some((item) => item.amount > 0);
  const recoveryEvidence = hashes(recoveryEvidenceHashes,
    "REALITY_RECOVERY_EVIDENCE_INVALID", { minimum: recoveryStatus === "COMPLETE" ? 1 : 0 });
  let normalizedRecoveryStandard = null;
  if (hasPositiveImpact) {
    if (recoveryStatus === "NOT_REQUIRED") fail("REALITY_POSITIVE_IMPACT_REQUIRES_RECOVERY");
    normalizedRecoveryStandard = hash(recoveryStandardHash,
      "REALITY_RECOVERY_STANDARD_REFERENCE_INVALID");
    if (normalizedRecoveryStandard !== boundary.recoveryStandardHash) {
      fail("REALITY_RECOVERY_STANDARD_MISMATCH");
    }
  } else if (recoveryStatus !== "NOT_REQUIRED" || recoveryStandardHash !== null
    || recoveryEvidence.length !== 0) {
    fail("REALITY_NO_IMPACT_RECOVERY_FIELDS_INVALID");
  }
  const observed = iso(observedAt, "REALITY_CONSEQUENCE_OBSERVED_AT_INVALID");
  if (Date.parse(observed) < Date.parse(execution.executedAt)) {
    fail("REALITY_CONSEQUENCE_BEFORE_EXECUTION");
  }
  const horizon = boundary.observationHorizons.find((item) => item.horizonId === horizonId);
  const dueAt = Date.parse(execution.executedAt) + horizon.closesAfterMs;
  if (Date.parse(observed) < dueAt) fail("REALITY_CONSEQUENCE_BEFORE_HORIZON_MATURITY");
  return seal(REALITY_STEWARDSHIP_SCHEMAS.consequence, DOMAIN.consequence, {
    boundaryHash: boundary.boundaryHash,
    claimHash: claim.claimHash,
    executionHash: execution.executionHash,
    horizonId: token(horizonId, "REALITY_CONSEQUENCE_HORIZON_INVALID"),
    outcome,
    impactMeasurements: impacts,
    affectedPartyReports: partyReports,
    causalStatus,
    recoveryStatus,
    recoveryStandardHash: normalizedRecoveryStandard,
    recoveryEvidenceHashes: recoveryEvidence,
    recoveryExternallyVerified: false,
    measurementTruthExternallyVerified: false,
    affectedPartyReportsExternallyVerified: false,
    measurementEvidenceHashes: hashes(measurementEvidenceHashes,
      "REALITY_MEASUREMENT_EVIDENCE_INVALID", { minimum: 1 }),
    observedAt: observed,
    boundary: fixedBoundary(),
  }, "consequenceHash");
}

export function verifyConsequenceReport(record, {
  boundary = null, claim = null, execution = null,
} = {}) {
  try {
    if (!verifySeal(record, REALITY_STEWARDSHIP_SCHEMAS.consequence, DOMAIN.consequence,
      "consequenceHash", CONSEQUENCE_KEYS) || !same(record.boundary, fixedBoundary())
      || record.recoveryExternallyVerified !== false
      || record.measurementTruthExternallyVerified !== false
      || record.affectedPartyReportsExternallyVerified !== false) {
      fail("REALITY_CONSEQUENCE_INVALID");
    }
    const supplied = [boundary, claim, execution].filter((item) => item !== null).length;
    if (supplied !== 0 && supplied !== 3) fail("REALITY_CONSEQUENCE_SOURCE_SET_REQUIRED");
    if (supplied === 3) {
      const rebuilt = createConsequenceReport({ ...record, boundary, claim, execution });
      if (!same(record, rebuilt)) fail("REALITY_CONSEQUENCE_DERIVATION_INVALID");
    }
    return { ok: true, consequenceHash: record.consequenceHash,
      verificationLevel: supplied === 3 ? "STRUCTURAL_INPUTS_REDERIVED" : "SELF_CHECK_ONLY",
      protocolInputsReplayed: supplied === 3,
      sourceReverified: false,
      measurementTruthExternallyVerified: false,
      affectedPartyReportsExternallyVerified: false,
      recoveryExternallyVerified: false,
      affectedPartyStandingExternallyVerified: false };
  } catch (error) { return { ok: false, error: String(error?.message ?? error) }; }
}

const CHALLENGE_KEYS = [
  "boundaryHash", "claimHash", "affectedPartyRootHash", "status", "filedAt",
  "resolutionHash", "boundary",
];

export function createStewardshipChallenge({
  boundary, claim, affectedPartyRootHash, status = "OPEN", filedAt,
  resolutionHash = null,
} = {}) {
  if (!verifyRealityBoundary(boundary).ok || !verifyStewardshipClaim(claim, { boundary }).ok
    || claim.boundaryHash !== boundary.boundaryHash) fail("REALITY_CHALLENGE_BINDING_INVALID");
  if (!boundary.affectedPartyRootHashes.includes(affectedPartyRootHash)) {
    fail("REALITY_CHALLENGE_PARTY_WITHOUT_STANDING");
  }
  if (!CHALLENGE_STATES.has(status)) fail("REALITY_CHALLENGE_STATUS_INVALID");
  if ((status === "RESOLVED") !== (resolutionHash !== null)) {
    fail("REALITY_CHALLENGE_RESOLUTION_INVALID");
  }
  return seal(REALITY_STEWARDSHIP_SCHEMAS.challenge, DOMAIN.challenge, {
    boundaryHash: boundary.boundaryHash,
    claimHash: claim.claimHash,
    affectedPartyRootHash,
    status,
    filedAt: iso(filedAt, "REALITY_CHALLENGE_FILED_AT_INVALID"),
    resolutionHash: resolutionHash === null ? null
      : hash(resolutionHash, "REALITY_CHALLENGE_RESOLUTION_HASH_INVALID"),
    boundary: fixedBoundary(),
  }, "challengeHash");
}

export function verifyStewardshipChallenge(record, { boundary = null, claim = null } = {}) {
  try {
    if (!verifySeal(record, REALITY_STEWARDSHIP_SCHEMAS.challenge, DOMAIN.challenge,
      "challengeHash", CHALLENGE_KEYS) || !same(record.boundary, fixedBoundary())) {
      fail("REALITY_CHALLENGE_INVALID");
    }
    if ((boundary === null) !== (claim === null)) fail("REALITY_CHALLENGE_SOURCE_PAIR_REQUIRED");
    if (boundary !== null) {
      const rebuilt = createStewardshipChallenge({ ...record, boundary, claim });
      if (!same(record, rebuilt)) fail("REALITY_CHALLENGE_DERIVATION_INVALID");
    }
    return { ok: true, challengeHash: record.challengeHash,
      verificationLevel: boundary === null ? "SELF_CHECK_ONLY" : "SOURCE_REDERIVED" };
  } catch (error) { return { ok: false, error: String(error?.message ?? error) }; }
}

export function buildConsequenceState({
  boundary, claim, execution, reports = [], challenges = [], now,
} = {}) {
  if (!verifyRealityBoundary(boundary).ok || !verifyStewardshipClaim(claim, { boundary }).ok
    || !verifyRealityExecutionReceipt(execution, { boundary, claim }).ok
    || claim.boundaryHash !== boundary.boundaryHash
    || execution.claimHash !== claim.claimHash) fail("REALITY_STATE_BINDING_INVALID");
  const at = iso(now, "REALITY_STATE_TIME_INVALID");
  if (Date.parse(at) < Date.parse(execution.executedAt)) fail("REALITY_STATE_BEFORE_EXECUTION");
  if (!Array.isArray(reports) || reports.length > 256
    || !Array.isArray(challenges) || challenges.length > 256) fail("REALITY_STATE_INPUT_INVALID");
  const byHorizon = new Map();
  for (const report of reports) {
    if (!verifyConsequenceReport(report, { boundary, claim, execution }).ok
      || report.boundaryHash !== boundary.boundaryHash
      || report.claimHash !== claim.claimHash || report.executionHash !== execution.executionHash) {
      fail("REALITY_STATE_REPORT_INVALID");
    }
    if (Date.parse(report.observedAt) > Date.parse(at)) {
      fail("REALITY_STATE_REPORT_FROM_FUTURE");
    }
    if (byHorizon.has(report.horizonId)) fail("REALITY_STATE_DUPLICATE_HORIZON_REPORT");
    byHorizon.set(report.horizonId, report);
  }
  for (const challenge of challenges) {
    if (!verifyStewardshipChallenge(challenge, { boundary, claim }).ok
      || challenge.boundaryHash !== boundary.boundaryHash
      || challenge.claimHash !== claim.claimHash) fail("REALITY_STATE_CHALLENGE_INVALID");
    if (Date.parse(challenge.filedAt) > Date.parse(at)) {
      fail("REALITY_STATE_CHALLENGE_FROM_FUTURE");
    }
  }
  const executionMs = Date.parse(execution.executedAt);
  const nowMs = Date.parse(at);
  const horizons = boundary.observationHorizons.map((horizon) => {
    const dueAt = new Date(executionMs + horizon.closesAfterMs).toISOString();
    const report = byHorizon.get(horizon.horizonId) ?? null;
    const matured = nowMs >= Date.parse(dueAt);
    return { horizonId: horizon.horizonId, dueAt, matured,
      status: report ? "REPORTED" : matured ? "OVERDUE" : "OPEN",
      consequenceHash: report?.consequenceHash ?? null };
  });
  const openChallenges = challenges.filter((item) => item.status === "OPEN");
  const observedImpacts = reports.flatMap((report) => report.impactMeasurements);
  const positiveImpactReports = reports.filter((report) => report.impactMeasurements
    .some((impact) => impact.amount > 0));
  const recoveryFailed = positiveImpactReports.some((report) =>
    report.recoveryStatus === "FAILED");
  const recoveryDue = positiveImpactReports.some((report) =>
    report.recoveryStatus === "PENDING");
  const recoveryExternalVerificationRequired = positiveImpactReports.some((report) =>
    report.recoveryStatus === "COMPLETE" && report.recoveryExternallyVerified !== true);
  const allReported = horizons.every((item) => item.status === "REPORTED");
  let status = "MONITORING_WINDOW_OPEN";
  if (horizons.some((item) => item.status === "OVERDUE")) status = "OBSERVATION_OVERDUE";
  else if (openChallenges.length) status = "CHALLENGE_OPEN";
  else if (recoveryFailed) status = "RECOVERY_FAILED";
  else if (recoveryDue) status = "RECOVERY_DUE";
  else if (recoveryExternalVerificationRequired) {
    status = "RECOVERY_EXTERNAL_VERIFICATION_REQUIRED";
  } else if (allReported) status = "STRUCTURALLY_READY_PENDING_EXTERNAL_CLOSURE";
  const causalClaims = reports.filter((item) => item.causalStatus === "CAUSAL_CLAIM");
  const impactTotals = [...new Set(observedImpacts.map((item) => item.channelId))].sort()
    .map((channelId) => {
      const constraint = boundary.constraints.find((item) => item.channelId === channelId);
      const values = observedImpacts.filter((item) => item.channelId === channelId)
        .map((item) => item.amount);
      const amount = constraint.aggregation === "CUMULATIVE_MAX"
        ? Math.max(...values)
        : values.reduce((sum, value) => addSafe(sum, value,
          "REALITY_IMPACT_TOTAL_OVERFLOW"), 0);
      return { channelId, aggregation: constraint.aggregation, amount,
        measurementCount: values.length };
    });
  return seal(REALITY_STEWARDSHIP_SCHEMAS.consequenceState, DOMAIN.consequenceState, {
    boundaryHash: boundary.boundaryHash,
    claimHash: claim.claimHash,
    executionHash: execution.executionHash,
    evaluatedAt: at,
    status,
    horizonStates: horizons,
    consequenceHashes: reports.map((item) => item.consequenceHash).sort(),
    challengeHashes: challenges.map((item) => item.challengeHash).sort(),
    openChallengeCount: openChallenges.length,
    impactTotals,
    responsibilityRootHashes: [...execution.responsibilityRootHashes],
    obligationOpen: true,
    canClose: false,
    externalClosureRequired: true,
    externalClosureReviewReady: status === "STRUCTURALLY_READY_PENDING_EXTERNAL_CLOSURE",
    externalClosureEligibilityVerified: false,
    affectedPartyStandingExternallyVerified: false,
    measurementTruthExternallyVerified: false,
    affectedPartyReportsExternallyVerified: false,
    recoveryExternallyVerified: positiveImpactReports.length === 0 ? null : false,
    causalClaimsObserved: causalClaims.length,
    causalExperienceUnits: 0,
    learningAdmission: false,
    noteCode: causalClaims.length
      ? "CAUSAL_LABEL_PRESENT_BUT_NO_EXTERNAL_PROSPECTIVE_CHAIN_VERIFIER"
      : "OBSERVATION_ONLY",
    boundary: fixedBoundary(),
  }, "stateHash");
}

export function verifyConsequenceState(record, {
  boundary = null, claim = null, execution = null, reports = null, challenges = null,
} = {}) {
  try {
    const keys = ["boundaryHash", "claimHash", "executionHash", "evaluatedAt", "status",
      "horizonStates", "consequenceHashes", "challengeHashes", "openChallengeCount",
      "impactTotals", "responsibilityRootHashes", "obligationOpen", "canClose",
      "externalClosureRequired", "externalClosureReviewReady",
      "externalClosureEligibilityVerified",
      "affectedPartyStandingExternallyVerified", "measurementTruthExternallyVerified",
      "affectedPartyReportsExternallyVerified", "recoveryExternallyVerified",
      "causalClaimsObserved", "causalExperienceUnits", "learningAdmission", "noteCode",
      "boundary"];
    if (!verifySeal(record, REALITY_STEWARDSHIP_SCHEMAS.consequenceState,
      DOMAIN.consequenceState, "stateHash", keys)
      || record.obligationOpen !== true || record.canClose !== false
      || record.externalClosureRequired !== true
      || record.externalClosureEligibilityVerified !== false
      || record.affectedPartyStandingExternallyVerified !== false
      || record.measurementTruthExternallyVerified !== false
      || record.affectedPartyReportsExternallyVerified !== false
      || record.causalExperienceUnits !== 0 || record.learningAdmission !== false
      || !same(record.boundary, fixedBoundary())) fail("REALITY_STATE_INVALID");
    const statuses = new Set([
      "MONITORING_WINDOW_OPEN", "OBSERVATION_OVERDUE", "CHALLENGE_OPEN",
      "RECOVERY_FAILED", "RECOVERY_DUE", "RECOVERY_EXTERNAL_VERIFICATION_REQUIRED",
      "STRUCTURALLY_READY_PENDING_EXTERNAL_CLOSURE",
    ]);
    if (!statuses.has(record.status)
      || record.externalClosureReviewReady
        !== (record.status === "STRUCTURALLY_READY_PENDING_EXTERNAL_CLOSURE")
      || ![null, false].includes(record.recoveryExternallyVerified)) {
      fail("REALITY_STATE_STATUS_INVALID");
    }
    const supplied = [boundary, claim, execution, reports, challenges]
      .filter((value) => value !== null).length;
    if (supplied !== 0 && supplied !== 5) fail("REALITY_STATE_SOURCE_SET_REQUIRED");
    if (supplied === 5) {
      const rebuilt = buildConsequenceState({
        boundary, claim, execution, reports, challenges, now: record.evaluatedAt,
      });
      if (!same(record, rebuilt)) fail("REALITY_STATE_DERIVATION_INVALID");
    }
    return { ok: true, stateHash: record.stateHash,
      verificationLevel: supplied === 5 ? "STRUCTURAL_INPUTS_REDERIVED" : "SELF_CHECK_ONLY",
      protocolInputsReplayed: supplied === 5,
      sourceReverified: false,
      stateDerivationVerified: supplied === 5,
      measurementTruthExternallyVerified: false,
      affectedPartyReportsExternallyVerified: false,
      externalClosureEligibilityVerified: false,
      affectedPartyStandingExternallyVerified: false };
  } catch (error) { return { ok: false, error: String(error?.message ?? error) }; }
}

export function describeStewardshipGap() {
  const body = {
    schema: "outsider/reality-stewardship-gap-map/v1",
    problem: "LINEAR_TRANSACTION_STAGES_DO_NOT_GOVERN_PERSISTENT_SHARED_REALITY",
    missingSpines: [
      "EX_ANTE_LEGITIMACY_AND_AFFECTED_PARTY_STANDING",
      "CUMULATIVE_SCARCE_REALITY_AND_OPTION_BUDGET",
      "OPEN_WORLD_DELAYED_DISTRIBUTED_CONSEQUENCE_ACCOUNTING",
      "RESPONSIBILITY_RECOVERY_CHALLENGE_AND_REOPENING_CONTINUITY",
      "EXPERIENCE_CREATION_REUSE_RIGHTS_AND_EXTERNALITY",
      "ADOPTED_RESOURCE_OWNER_ENFORCEMENT",
      "SYSTEMIC_CORRELATION_AND_NON_MONETIZABLE_CONSTRAINTS",
    ],
    stageGaps: STEWARDSHIP_STAGE_GAPS,
    conclusion: "REALITY_STEWARDSHIP_IS_A_CROSS_STAGE_KERNEL_NOT_A_FINAL_STAGE",
    boundary: fixedBoundary(),
  };
  return deepFreeze({ ...body, gapMapHash: digest(
    "outsider/reality-stewardship-gap-map/v1", body) });
}
