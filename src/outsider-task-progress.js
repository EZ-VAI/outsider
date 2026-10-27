/* User-facing progress derived from original task facts, never an invented
 * completion percentage or a second workflow state machine. */
export function describeTaskProgress(session, { createdAt = null, completionDeadline = null, now = new Date().toISOString() } = {}) {
  const s = session ?? {}, brief = s.taskBrief, work = s.participantWork ?? [];
  const steps = s.executionProgress?.steps ?? [], digitalJobs = s.digitalWork?.jobs ?? [];
  const runningDigital = digitalJobs.filter(job => job.state === 'RUNNING');
  let updatedAt = s.actualDelivery?.completedAt ?? s.partialDelivery?.observedAt
    ?? s.executionProgress?.observedAt ?? s.formationProgress?.updatedAt ?? createdAt;
  let issueCode = s.failureCode ?? null;
  let code, stage = 0, group = 'active', action = null;
  if (s.state === 'SUCCEEDED') { code = 'COMPLETED'; stage = 4; group = 'completed'; }
  else if (s.state === 'FAILED_CLOSED' && s.executionRecovery?.recoverableRequirementIds?.length) {
    code = 'WORK_BLOCKED'; group = 'attention'; stage = 2; action = 'CONTINUE_DIGITAL_WORK';
  }
  else if (s.cancelled || ['CANCELLED', 'FAILED_CLOSED'].includes(s.state)) {
    code = s.state === 'CANCELLED' ? 'CANCELLED' : 'FAILED'; group = 'closed'; stage = s.executionStarted ? 2 : 0;
  } else if (s.confirmed) {
    stage = 2;
    if ((s.connectedBookings??[]).some(row=>row.state==='WAITING_CUSTOMER')) { code='NEEDS_DETAILS'; group='attention'; action='PROVIDE_BOOKING_DETAILS'; }
    else if ((s.digitalWork?.jobs??[]).some(job=>job.state==='INPUT_REQUIRED')) { code='NEEDS_DETAILS'; group='attention'; action='CONTINUE_DIGITAL_WORK'; }
    else if (digitalJobs.some(job=>job.customerReviewOffer?.canAccept && job.goalAssessment?.state!=='SUPPORTED')) { code='REVIEW_DELIVERY'; group='attention'; action='REVIEW_DIGITAL_WORK'; }
    else if ((s.networkWork??[]).some(row=>row.state?.state==='AWAITING_CUSTOMER_REVIEW')) {code='REVIEW_DELIVERY';group='attention';action='REVIEW_NETWORK_WORK';}
    else if ((s.networkWork??[]).some(row=>row.state?.state==='NEEDS_ATTENTION')) {code='WORK_BLOCKED';group='attention';action='REVIEW_NETWORK_WORK';}
    else if (work.some(row => row.work?.latestReport && !row.work.buyerAccepted)) { code = 'REVIEW_DELIVERY'; group = 'attention'; action = 'REVIEW_WORK'; }
    else if (work.some(row => ['BLOCKED', 'WAITING_REPLACEMENT', 'CANCELLED_WITH_PARTIAL_WORK'].includes(row.work?.state))) { code = 'WORK_BLOCKED'; group = 'attention'; action = 'REVIEW_WORK'; }
    else if (runningDigital.length) {
      code = 'EXECUTING';
      const latest = runningDigital.map(job => job.lastActivity?.at ?? job.updatedAt).filter(value => Number.isFinite(Date.parse(value))).sort().at(-1);
      if (latest && (!updatedAt || Date.parse(latest) > Date.parse(updatedAt))) updatedAt = latest;
      if (['DIGITAL_AGENT_WAITING_FOR_EXECUTION', 'DIGITAL_AGENT_RUNNING'].includes(issueCode)) issueCode = null;
    }
    else if (s.waitingFor || s.nextWakeAt) code = 'WAITING_EXECUTION';
    else code = 'EXECUTING';
  } else if (completionDeadline && Date.parse(completionDeadline) <= Date.parse(now)) {
    code = 'WINDOW_ENDED'; group = 'closed';
  } else if (s.state === 'INPUT_REQUIRED' || brief?.questions?.length && brief.canUpdate) {
    code = 'NEEDS_DETAILS'; group = 'attention'; action = 'CLARIFY';
  } else if (s.state === 'PROPOSED') { code = 'PLAN_READY'; stage = 1; group = 'attention'; action = 'CONFIRM'; }
  else if ((s.participantSourcing?.recruitment??[]).some(row=>row.continuous?.state==='WAITING_CONTACT_CHANNEL')) {
    code='CONTACT_CHANNEL_NEEDED';group='attention';action='REVIEW_WORK';
  }
  else if (issueCode && !s.proposalStale && !s.formationPending) {
    code = 'PREPARATION_FAILED'; group = 'attention'; action = brief?.canRetry ? 'RETRY' : null;
  } else if (s.participantSourcing?.autoAssemble && ['AWAITING_OFFERS', 'RECRUITED', 'NO_COMPATIBLE_COMBINATION', 'SEARCH_INCOMPLETE'].includes(s.participantSourcing.state)) {
    const invitations = (s.participantSourcing.recruitment ?? []).reduce((sum, row) => sum + (row.invitationCount ?? 0), 0)
      + work.reduce((sum, row) => sum + (row.work?.invitations?.length ?? 0), 0);
    code = s.participantSourcing.state === 'NO_COMPATIBLE_COMBINATION' ? 'QUOTE_CONFLICT' : invitations ? 'WAITING_QUOTES' : 'PARTICIPANTS_NEEDED';
    group = code === 'WAITING_QUOTES' ? 'active' : 'attention'; action = 'REVIEW_WORK';
  } else if (s.formationPending && s.waitingFor==='RESOURCE_FORMATION') { code='FORMATION_NEEDS_ROUTE';group='attention';action=work.length?'REVIEW_WORK':brief?.canRetry?'RETRY':null; }
  else if (s.state === 'UNAVAILABLE') { code = 'RESOURCE_GAP'; group = 'attention'; action = work.length ? 'REVIEW_WORK' : null; }
  else if (s.state === 'NEW') { code = 'READY_TO_PREPARE'; group = 'attention'; action = 'PREPARE'; }
  else code = s.formationProgress?.phase ?? (s.state === 'FORMING' && !s.goalContract && !s.formation ? 'INTERPRETING_GOAL' : 'PREPARING_PLAN');
  return { code, stage, group, action, updatedAt, issueCode,
    acceptedSteps: steps.filter(step => step.state === 'ACCEPTED').length, totalSteps: steps.length,
    ...(s.nextWakeAt ? { nextCheckAt: s.nextWakeAt } : {}) };
}
