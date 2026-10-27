/* Projection of the verification work inside an existing participant request.
 * It does not create a task, dispatch a person, infer competence, or turn a
 * self-reported observation into independently established physical truth. */
import { interfaceDigest as digest } from './outsider-openapi-demand-matcher.js';

export const PARTICIPANT_VERIFICATION_WORK_SCHEMA = 'outsider/participant-verification-work/v1';
export const PARTICIPANT_VERIFICATION_PLAN_SCHEMA = 'outsider/participant-verification-plan/v1';
export const PARTICIPANT_VERIFICATION_FUNDING_SCHEMA = 'outsider/participant-verification-funding-proof/v1';
export const PARTICIPANT_VERIFICATION_EVENTS = Object.freeze(['VERIFICATION_PROPOSED', 'VERIFICATION_DISPATCHED',
  'VERIFICATION_ACCEPTED', 'VERIFICATION_PROGRESS', 'VERIFICATION_BLOCKED', 'VERIFICATION_DECLINED',
  'VERIFICATION_CANCELLATION_REQUESTED', 'VERIFICATION_CANCELLED_NOT_STARTED', 'VERIFICATION_CANCEL_ACK']);
const HASH = /^sha256:[a-f0-9]{64}$/u;
const fail = code => { throw Object.assign(new Error(`PARTICIPANT_WORK_${code}`), { code: `PARTICIPANT_WORK_${code}` }); };

export function participantVerificationContract({ request, report, plan, dispatch }) {
  if (!report || !plan || !dispatch || report.invitationId !== plan.invitationId || report.dispatchHash !== dispatch.dispatchHash
    || dispatch.planHash !== plan.planHash || dispatch.requirementId !== request.input.requirementId
    || ![report.reportHash, dispatch.dispatchHash, dispatch.programHash, plan.planHash].every(hash => HASH.test(hash ?? '')))
    fail('VERIFICATION_SOURCE_NOT_DISPATCHED');
  const body = { schema: PARTICIPANT_VERIFICATION_WORK_SCHEMA, requestId: request.requestId,
    taskId: request.input.taskId, requirementId: request.input.requirementId, reportHash: report.reportHash,
    programHash: dispatch.programHash, workPlanHash: plan.planHash, workDispatchHash: dispatch.dispatchHash,
    acceptanceCriteriaHash: digest(request.input.acceptanceCriteria), completionDeadline: request.input.completionDeadline,
    currency: request.input.budget.currency, maximumAmountMinor: request.input.budget.maximumAmountMinor,
    stopOnReportChange: true,
    scope: 'DECLARED_DISTINCT_ACCOUNT_FIELD_WORK', identityIndependentlyVerified: false,
    physicalTruthIndependentlyEstablished: false };
  return { ...body, contractHash: digest(body) };
}

export function participantVerificationPlan({ request, participant, report, programHash, requirementId }) {
  const contract = participant.verificationWork, offer = participant.offer;
  if (contract?.schema !== PARTICIPANT_VERIFICATION_WORK_SCHEMA || !offer
    || contract.reportHash !== report?.reportHash || contract.programHash !== programHash || contract.requirementId !== requirementId
    || offer.verificationContractHash !== contract.contractHash || offer.reportHash !== contract.reportHash
    || contract.acceptanceCriteriaHash !== digest(request.input.acceptanceCriteria)) fail('VERIFICATION_PLAN_BINDING_INVALID');
  const body = { schema: PARTICIPANT_VERIFICATION_PLAN_SCHEMA, requestId: request.requestId, taskId: request.input.taskId,
    requirementId, programHash, invitationId: participant.invitationId, participantLabel: participant.participantLabel,
    participantId: participant.participantId, directoryOrigin: participant.directoryOrigin, profileHash: participant.profileHash,
    verificationContractHash: contract.contractHash, reportHash: report.reportHash,
    sourceWorkPlanHash: contract.workPlanHash, sourceDispatchHash: contract.workDispatchHash,
    scope: request.input.scope, acceptanceCriteria: request.input.acceptanceCriteria,
    quoteHash: offer.offerHash, totalAmountMinor: offer.amountMinor, currency: offer.currency,
    availableStart: offer.availableStart, availableEnd: offer.availableEnd, expiresAt: offer.offerExpiresAt,
    completionDeadline: request.input.completionDeadline, ...(offer.durationMs === undefined ? {} : { durationMs: offer.durationMs }),
    identityIndependentlyVerified: false, physicalTruthIndependentlyEstablished: false };
  return { ...body, planHash: digest(body) };
}

export function projectParticipantVerificationAttempt({ participant, events, latestReportHash, currentWorkPlanHash,
  workUnavailable = false, observedAt }) {
  if (!participant.verificationWork) return null;
  const contract = participant.verificationWork;
  const { contractHash, ...contractBody } = contract;
  if (contract.schema !== PARTICIPANT_VERIFICATION_WORK_SCHEMA || digest(contractBody) !== contractHash)
    fail('VERIFICATION_CONTRACT_INVALID');
  let dispatch = null, accepted = null, cancellation = null, declined = null, result = null;
  const progress = [];
  for (const event of events) {
    const p = event.payload;
    if (p.invitationId !== participant.invitationId) continue;
    if (event.type === 'VERIFICATION_DISPATCHED') {
      if (dispatch || p.plan?.verificationContractHash !== contractHash || p.plan?.reportHash !== contract.reportHash
        || p.plan?.programHash !== contract.programHash) fail('VERIFICATION_JOURNAL_INVALID');
      dispatch = p;
    } else if (event.type === 'VERIFICATION_ACCEPTED') {
      if (!dispatch || p.dispatchHash !== dispatch.dispatchHash || p.planHash !== dispatch.plan.planHash) fail('VERIFICATION_JOURNAL_INVALID');
      accepted = p;
    } else if (['VERIFICATION_PROGRESS', 'VERIFICATION_BLOCKED'].includes(event.type)) progress.push({ ...p, type: event.type });
    else if (event.type === 'VERIFICATION_DECLINED') declined = p;
    else if (['VERIFICATION_CANCELLATION_REQUESTED', 'VERIFICATION_CANCELLED_NOT_STARTED', 'VERIFICATION_CANCEL_ACK'].includes(event.type)) cancellation = p;
    else if (event.type === 'VERIFIED') {
      if (!accepted || p.verificationWork?.dispatchHash !== dispatch.dispatchHash
        || p.verificationWork?.acceptanceHash !== accepted.acceptanceHash || p.reportHash !== contract.reportHash)
        fail('VERIFICATION_JOURNAL_INVALID');
      result = p;
    }
  }
  const sourceCurrent = latestReportHash === contract.reportHash && currentWorkPlanHash === contract.workPlanHash && !workUnavailable;
  const acknowledged = ['CANCELLED', 'CANCELLED_WITH_PARTIAL_WORK', 'CANCELLED_NOT_STARTED'].includes(cancellation?.state);
  const finished = !!result || acknowledged || !!declined && !accepted;
  const stopAckRequired = !!accepted && !finished && (!sourceCurrent || !!cancellation || !!declined);
  let state = !sourceCurrent ? stopAckRequired ? 'STOP_REQUESTED_REPORT_CHANGED' : 'SUPERSEDED'
    : acknowledged ? cancellation.state
      : stopAckRequired ? 'STOP_ACK_REQUIRED'
        : declined ? 'DECLINED' : result ? 'COMPLETED'
          : Date.parse(observedAt) >= Date.parse(dispatch?.plan.availableEnd ?? contract.completionDeadline)
            ? accepted ? 'OVERDUE' : 'EXPIRED'
            : accepted ? progress.at(-1)?.type === 'VERIFICATION_BLOCKED' ? 'BLOCKED' : 'IN_PROGRESS'
              : dispatch ? 'DISPATCHED' : participant.offer ? 'OFFERED' : 'AWAITING_OFFER';
  return { schema: PARTICIPANT_VERIFICATION_WORK_SCHEMA, invitationId: participant.invitationId,
    participantLabel: participant.participantLabel, reportHash: contract.reportHash, contractHash,
    state, sourceCurrent, offer: participant.offer, plan: dispatch?.plan ?? null, dispatch, accepted,
    progress, cancellation, declined, result, stopAckRequired,
    stopped: finished || !accepted && !sourceCurrent || state === 'EXPIRED',
    paymentPerformed: false, financialSettlementVerified: false,
    identityIndependentlyVerified: false, physicalTruthIndependentlyEstablished: false };
}

export function summarizeParticipantVerificationAttempt(attempt) {
  return { invitationId: attempt.invitationId, participantLabel: attempt.participantLabel, reportHash: attempt.reportHash,
    state: attempt.state, sourceCurrent: attempt.sourceCurrent, stopAckRequired: attempt.stopAckRequired,
    planHash: attempt.plan?.planHash ?? null, dispatchHash: attempt.dispatch?.dispatchHash ?? null,
    acceptedAt: attempt.accepted?.acceptedAt ?? null, verificationHash: attempt.result?.verificationHash ?? null,
    totalAmountMinor: attempt.plan?.totalAmountMinor ?? null, currency: attempt.plan?.currency ?? null,
    availableStart: attempt.plan?.availableStart ?? null, availableEnd: attempt.plan?.availableEnd ?? null,
    paymentPerformed: false, physicalTruthIndependentlyEstablished: false };
}
