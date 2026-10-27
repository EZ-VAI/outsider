/*
 * Append one read-only, user-held seller-route observation Attempt to an
 * existing Episode Attempt-set branch. This issues identity/census lineage
 * only; a broker receipt may later report what was observed.
 */
import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import { createEpisodeAttemptSetComposition } from
  "./outsider-episode-attempt-set-composition.js";

const PREFIX = "OUTSIDER_USER_HELD_ROUTE_OBSERVATION_ATTEMPT_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;

export const OUTSIDER_USER_HELD_ROUTE_OBSERVATION_ATTEMPT_V1_BOUNDARY
  = Object.freeze({
    attemptSemantic: "USER_HELD_ROUTE_OBSERVATION",
    operationSemantic: "READ_ONLY_SOURCE_OBSERVATION",
    intendedExecutor: "DURABLE_PRODUCTION_BROKER",
    sellerNeutral: true, networkIoPerformed: false,
    paymentAttempted: false, orderSubmitted: false,
    cartMutationPerformed: false, contactSubmitted: false,
    addressSubmitted: false, capacityEstablished: false,
    independentOutcomeTruthEstablished: false, authorityMinted: false,
    outcomeCommitIssued: false, authority: "NONE", actionReady: false,
    executable: false,
  });

function fail(code) { throw new TypeError(`${PREFIX}${code}`); }
function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}
function instant(value, code) {
  if (typeof value !== "string" || new Date(value).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}
function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}
function bindingInput(value) {
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
const attemptInput = row => ({ attemptOrdinal: row.attemptOrdinal,
  occurredAt: row.occurredAt, episodeHash: row.episodeHash,
  attemptHash: row.attemptHash,
  attemptActorSubjectHash: row.attemptActorSubjectHash, kind: row.kind,
  retryOfAttemptHash: row.retryOfAttemptHash,
  recoveryOfAttemptHash: row.recoveryOfAttemptHash });
const reportInput = row => ({ reportOrdinal: row.reportOrdinal,
  reportedAt: row.reportedAt, episodeHash: row.episodeHash,
  occurrenceIdentityHash: row.occurrenceIdentityHash,
  attemptHash: row.attemptHash,
  networkObjectIdentityHash: row.networkObjectIdentityHash,
  networkReceiptHash: row.networkReceiptHash,
  executionDisposition: row.executionDisposition,
  outcomeObservationStatus: row.outcomeObservationStatus,
  reportedOutcomeEvidenceHash: row.reportedOutcomeEvidenceHash,
  consequenceEvidenceHashes: row.consequenceEvidenceHashes });

export function issueUserHeldRouteObservationAttemptV1(input = {}) {
  const fields = ["predecessor", "recordedAt", "occurredAt",
    "attemptActorSubjectHash", "brokerInstructionRefHash",
    "sourceInterfaceRefHash", "idempotencyKeyHash"];
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || Reflect.ownKeys(input).length !== fields.length
    || fields.some(field => !Object.hasOwn(input, field))) fail("INPUT_FIELDS");
  const predecessor = input.predecessor;
  if (predecessor === null || typeof predecessor !== "object"
    || predecessor.schema !== "outsider/episode-attempt-set-composition/v1"
    || !HASH.test(predecessor.compositionHash ?? "")) fail("PREDECESSOR_INVALID");
  const occurredAt = instant(input.occurredAt, "OCCURRED_AT");
  const recordedAt = instant(input.recordedAt, "RECORDED_AT");
  if (Date.parse(recordedAt) < Date.parse(occurredAt)
    || Date.parse(occurredAt) < Date.parse(predecessor.recordedAt)) {
    fail("TIME_ORDER");
  }
  const brokerInstructionRefHash = hash(input.brokerInstructionRefHash,
    "BROKER_INSTRUCTION_REF_HASH");
  const sourceInterfaceRefHash = hash(input.sourceInterfaceRefHash,
    "SOURCE_INTERFACE_REF_HASH");
  const idempotencyKeyHash = hash(input.idempotencyKeyHash,
    "IDEMPOTENCY_KEY_HASH");
  const attemptHash = digest(
    "outsider/user-held-route-observation-attempt-identity/v1", {
      episodeHash: predecessor.episodeBinding.episodeHash,
      predecessorCompositionHash: predecessor.compositionHash,
      brokerInstructionRefHash, sourceInterfaceRefHash, idempotencyKeyHash,
    });
  const previousAttempt = predecessor.attempts.at(-1);
  const descendant = createEpisodeAttemptSetComposition({
    recordedAt,
    episodeBinding: bindingInput(predecessor.episodeBinding),
    appendOnlyLineage: {
      revision: predecessor.appendOnlyLineage.revision + 1,
      predecessorCompositionHash: predecessor.compositionHash,
      supersedesCompositionHash: predecessor.compositionHash,
    },
    attempts: [...predecessor.attempts.map(attemptInput), {
      attemptOrdinal: predecessor.attempts.length + 1, occurredAt,
      episodeHash: predecessor.episodeBinding.episodeHash, attemptHash,
      attemptActorSubjectHash: hash(input.attemptActorSubjectHash,
        "ATTEMPT_ACTOR_SUBJECT_HASH"), kind: "RETRY",
      retryOfAttemptHash: previousAttempt.attemptHash,
      recoveryOfAttemptHash: null,
    }],
    reportOccurrences: predecessor.reportOccurrences.map(reportInput),
  }, { predecessor });
  const body = {
    schema: "outsider/user-held-route-observation-attempt/v1",
    schemaVersion: "1.0.0", predecessorCompositionHash:
      predecessor.compositionHash, descendantComposition: descendant,
    attempt: { attemptHash, attemptOrdinal: descendant.attempts.length,
      attemptSemantic: "USER_HELD_ROUTE_OBSERVATION",
      operationSemantic: "READ_ONLY_SOURCE_OBSERVATION",
      brokerInstructionRefHash, sourceInterfaceRefHash, idempotencyKeyHash },
    paymentAttempted: false, orderSubmitted: false,
    capacityEstablished: false, independentOutcomeTruthEstablished: false,
    authorityMinted: false, outcomeCommitIssued: false,
    boundary: OUTSIDER_USER_HELD_ROUTE_OBSERVATION_ATTEMPT_V1_BOUNDARY,
  };
  return Object.freeze({ ...body, artifactHash: digest(body.schema, body) });
}
