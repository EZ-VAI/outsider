/* Bind a new OutcomeProgram invocation to the existing reporting graph.
 * Account/runtime references retain their original assurance. A fresh program
 * receives a fresh delegation, Episode and primary Attempt before provider I/O.
 * The instruction records use of existing authorization, not a new signature.
 */
import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

const SCHEMA = "outsider/user-held-outcome-program-attempt/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
const fail = code => { throw new TypeError(`OUTSIDER_OUTCOME_PROGRAM_ATTEMPT_${code}`); };
function hash(value) {
  if (typeof value !== "string" || !HASH.test(value)) fail("REFERENCE_INVALID");
  return value;
}

export function issueUserHeldOutcomeProgramAttempt(input) {
  const { identityBinding, request, proposal, confirmation, recordedAt,
    authorizationRefHash } = input ?? {};
  if (!identityBinding || !request || !proposal || !confirmation
    || typeof request.requestId !== "string" || request.requestId.length < 1
    || request.requestId !== proposal.requestId
    || request.requestId !== confirmation.requestId
    || proposal.programHash !== confirmation.programHash) fail("PROGRAM_BINDING_INVALID");
  if (typeof recordedAt !== "string" || !Number.isFinite(Date.parse(recordedAt))
    || new Date(recordedAt).toISOString() !== recordedAt
    || !Number.isFinite(Date.parse(request.completionDeadline))
    || Date.parse(recordedAt) >= Date.parse(request.completionDeadline)) fail("TIME_INVALID");
  const ancestry = {
    principalEpochHash: hash(identityBinding.principalEpochHash),
    accountableDeploymentHash: hash(identityBinding.accountableDeploymentHash),
    runtimeOrEmbodimentHash: hash(identityBinding.runtimeOrEmbodimentHash),
    sourceRefHash: hash(identityBinding.sourceRefHash),
  };
  const requestRefHash = digest("outsider/outcome-program-request", request);
  const proposalRefHash = digest("outsider/outcome-program-proposal", proposal);
  const confirmationRefHash = digest("outsider/outcome-program-confirmation", confirmation);
  const delegation = {
    principalEpochHash: ancestry.principalEpochHash,
    accountableDeploymentHash: ancestry.accountableDeploymentHash,
    runtimeOrEmbodimentHash: ancestry.runtimeOrEmbodimentHash,
    outcomeProgramHash: hash(proposal.programHash), requestRefHash,
    proposalRefHash, confirmationRefHash,
    authorizationRefHash: hash(authorizationRefHash), recordedAt,
    authorizationBasis: "EXISTING_USER_AUTHORIZATION_WITH_EXACT_PROGRAM_INSTRUCTION",
    assurance: "SELF_DECLARED_REFERENCE",
  };
  const delegationHash = digest("outsider/outcome-program-delegation-reference", delegation);
  const episode = {
    delegationHash, requestId: request.requestId,
    outcomeProgramHash: proposal.programHash, requestRefHash,
    recordedAt, completionDeadline: request.completionDeadline,
  };
  const episodeHash = digest("outsider/outcome-program-episode-reference", episode);
  const attempt = {
    episodeHash, delegationHash, outcomeProgramHash: proposal.programHash,
    attemptActorSubjectHash: ancestry.accountableDeploymentHash,
    operation: "EXECUTE_OUTCOME_PROGRAM", kind: "PRIMARY", attemptOrdinal: 1,
    retryOfAttemptHash: null, recoveryOfAttemptHash: null, recordedAt,
    providerEffectsStarted: false,
  };
  const attemptHash = digest("outsider/outcome-program-attempt-reference", attempt);
  const graphRefs = {
    principalEpochHash: ancestry.principalEpochHash,
    accountableDeploymentHash: ancestry.accountableDeploymentHash,
    runtimeOrEmbodimentHash: ancestry.runtimeOrEmbodimentHash,
    delegationHash, episodeHash, attemptHash,
  };
  const body = {
    schema: SCHEMA, schemaVersion: "1.0.0", recordedAt, graphRefs,
    ancestry, delegation, episode, attempt,
    graphPath: "PrincipalEpoch → AccountableDeployment → Runtime/Embodiment → Delegation → Episode → Attempt",
    identityAssurance: "INHERITED_REPORTING_REFERENCES_ONLY",
    authorityMinted: false,
  };
  return { ...body, artifactHash: digest(SCHEMA, body) };
}
