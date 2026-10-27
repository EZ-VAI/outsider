/*
 * Issue a content-addressed Formation transport-validation Attempt and append
 * it to an existing Episode Attempt-set composition.  Hosted execution is a
 * new real external effect, so it must never reuse the local Attempt hash.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  createEpisodeAttemptSetComposition,
  verifyEpisodeAttemptSetComposition,
} from "./outsider-episode-attempt-set-composition.js";

const SCHEMA = "outsider/formation-transport-validation-attempt/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/u;

export const OUTSIDER_FORMATION_TRANSPORT_VALIDATION_ATTEMPT_V1_SCHEMAS
  = Object.freeze({ attempt: SCHEMA });

export const OUTSIDER_FORMATION_TRANSPORT_VALIDATION_ATTEMPT_V1_BOUNDARY
  = Object.freeze({
    position: "PRE_ACTION_EPISODE_ATTEMPT_ISSUANCE",
    sameEpisodeRequired: true,
    newAttemptHashRequired: true,
    appendOnlyCompositionRequired: true,
    existingGraphAncestorsReused: true,
    externalEffectClaimed: false,
    capacityReserved: false,
    independentOutcomeEstablished: false,
    authorityMinted: false,
    paymentAuthorized: false,
    orderAuthorized: false,
  });

function fail(code) {
  throw new TypeError(`OUTSIDER_FORMATION_TRANSPORT_ATTEMPT_V1_${code}`);
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) fail(`${code}_INVALID`);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function token(value, code, pattern = TOKEN) {
  if (typeof value !== "string" || !pattern.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function episodeBindingInput(value) {
  return {
    principalEpochProjectionHash: value.principalEpochProjectionHash,
    accountableDeploymentSubjectHash: value.accountableDeploymentSubjectHash,
    runtimeInstanceHash: value.runtimeInstanceHash,
    embodimentRevisionHash: value.embodimentRevisionHash,
    delegationEdgeHash: value.delegationEdgeHash,
    episodeHash: value.episodeHash,
    workOrderProjectionHash: value.workOrderProjectionHash,
    networkCompleteEpisodeJoinHash: value.networkCompleteEpisodeJoinHash,
    prospectiveCensusProjectionHash: value.prospectiveCensusProjectionHash,
    realityObligationGenesisHash: value.realityObligationGenesisHash,
    realityObligationStateHash: value.realityObligationStateHash,
    genesisObligationAttemptHash:
      value.callerSuppliedGenesisObligationAttemptHash,
  };
}

function attemptInput(value) {
  return {
    attemptOrdinal: value.attemptOrdinal,
    occurredAt: value.occurredAt,
    episodeHash: value.episodeHash,
    attemptHash: value.attemptHash,
    attemptActorSubjectHash: value.attemptActorSubjectHash,
    kind: value.kind,
    retryOfAttemptHash: value.retryOfAttemptHash,
    recoveryOfAttemptHash: value.recoveryOfAttemptHash,
  };
}

function reportInput(value) {
  return {
    reportOrdinal: value.reportOrdinal,
    reportedAt: value.reportedAt,
    episodeHash: value.episodeHash,
    occurrenceIdentityHash: value.occurrenceIdentityHash,
    attemptHash: value.attemptHash,
    networkObjectIdentityHash: value.networkObjectIdentityHash,
    networkReceiptHash: value.networkReceiptHash,
    executionDisposition: value.executionDisposition,
    outcomeObservationStatus: value.outcomeObservationStatus,
    reportedOutcomeEvidenceHash: value.reportedOutcomeEvidenceHash,
    consequenceEvidenceHashes: value.consequenceEvidenceHashes,
  };
}

export function issueFormationTransportValidationAttemptV1(input = {}) {
  exact(input, ["predecessorComposition", "orderId", "outcomeProgramHash",
    "adapterId", "adapterVersion", "provider", "executionSurface",
    "issuedAt"], "INPUT");
  const predecessor = input.predecessorComposition;
  if (predecessor === null || typeof predecessor !== "object"
    || !Array.isArray(predecessor.attempts)
    || predecessor.attempts.length < 1
    || predecessor.episodeBinding === null
    || typeof predecessor.episodeBinding !== "object") {
    fail("PREDECESSOR_COMPOSITION_INVALID");
  }
  const issuedAt = instant(input.issuedAt, "ISSUED_AT");
  if (issuedAt < predecessor.recordedAt) fail("ISSUED_AT_REGRESSION");
  const prior = predecessor.attempts.at(-1);
  const ordinal = predecessor.attempts.length + 1;
  const body = {
    schema: SCHEMA,
    schemaVersion: "1.0.0",
    episodeHash: hash(predecessor.episodeBinding.episodeHash, "EPISODE_HASH"),
    attemptOrdinal: ordinal,
    attemptActorSubjectHash: hash(prior.attemptActorSubjectHash,
      "ATTEMPT_ACTOR_SUBJECT_HASH"),
    kind: "RETRY",
    retryOfAttemptHash: hash(prior.attemptHash, "RETRY_OF_ATTEMPT_HASH"),
    recoveryOfAttemptHash: null,
    orderId: token(input.orderId, "ORDER_ID"),
    outcomeProgramHash: hash(input.outcomeProgramHash, "OUTCOME_PROGRAM_HASH"),
    adapterBinding: {
      adapterId: token(input.adapterId, "ADAPTER_ID"),
      adapterVersion: token(input.adapterVersion, "ADAPTER_VERSION", VERSION),
    },
    provider: token(input.provider, "PROVIDER"),
    executionSurface: token(input.executionSurface, "EXECUTION_SURFACE"),
    purpose: "HOSTED_DETERMINISTIC_TRANSPORT_VALIDATION",
    lifecycleState: "ISSUED_PRE_ACTION",
    intendedExternalEffect: "ISOLATED_CART_AND_PREPAYMENT_QUOTE",
    issuedAt,
    externalEffectClaimed: false,
    capacityReserved: false,
    independentOutcomeEstablished: false,
    authorityMinted: false,
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  const attemptRecord = Object.freeze({ ...body,
    attemptHash: digest(SCHEMA, body) });
  if (attemptRecord.attemptHash === prior.attemptHash) fail("ATTEMPT_HASH_REUSED");

  const attempts = predecessor.attempts.map(attemptInput);
  attempts.push({
    attemptOrdinal: ordinal,
    occurredAt: issuedAt,
    episodeHash: attemptRecord.episodeHash,
    attemptHash: attemptRecord.attemptHash,
    attemptActorSubjectHash: attemptRecord.attemptActorSubjectHash,
    kind: "RETRY",
    retryOfAttemptHash: attemptRecord.retryOfAttemptHash,
    recoveryOfAttemptHash: null,
  });
  const composition = createEpisodeAttemptSetComposition({
    recordedAt: issuedAt,
    episodeBinding: episodeBindingInput(predecessor.episodeBinding),
    appendOnlyLineage: {
      revision: predecessor.appendOnlyLineage.revision + 1,
      predecessorCompositionHash: predecessor.compositionHash,
      supersedesCompositionHash: predecessor.compositionHash,
    },
    attempts,
    reportOccurrences: predecessor.reportOccurrences.map(reportInput),
  }, { predecessor });
  const verification = verifyEpisodeAttemptSetComposition(composition, {
    predecessor,
    expectedCompositionHash: composition.compositionHash,
    expectedPredecessorCompositionHash: predecessor.compositionHash,
  });
  if (verification.ok !== true || verification.attemptCount !== ordinal) {
    fail("DESCENDANT_COMPOSITION_VERIFICATION_FAILED");
  }
  return Object.freeze({
    attemptRecord,
    episodeAttemptSetComposition: composition,
    verification,
    graphRefs: Object.freeze({
      principalEpochHash:
        predecessor.episodeBinding.principalEpochProjectionHash,
      accountableDeploymentHash:
        predecessor.episodeBinding.accountableDeploymentSubjectHash,
      runtimeOrEmbodimentHash:
        predecessor.episodeBinding.embodimentRevisionHash
          ?? predecessor.episodeBinding.runtimeInstanceHash,
      delegationHash: predecessor.episodeBinding.delegationEdgeHash,
      episodeHash: predecessor.episodeBinding.episodeHash,
      attemptHash: attemptRecord.attemptHash,
    }),
    boundary: OUTSIDER_FORMATION_TRANSPORT_VALIDATION_ATTEMPT_V1_BOUNDARY,
  });
}
