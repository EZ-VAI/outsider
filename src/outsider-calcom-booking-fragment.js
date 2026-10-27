import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createCalComBookingAdapter, CALCOM_BOOKING_CAPABILITY, CALCOM_BOOKING_CONTRACT,
  CALCOM_BOOKING_FAILURE_POLICY } from "./outsider-calcom-booking.js";
import { createGlobalpingExactHttpObserverV2 } from "./outsider-globalping-exact-http-observer-v2.js";
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce } from "./outsider-user-held-durable-execution-v2.js";
const read = file => JSON.parse(readPrivateExecutionBytes(file));

export async function prepareCalComBookingPart({ id, input, profileFile, directory, completionDeadline }, dependencies = {}) {
  if (!profileFile) return { id, unavailable: "BOOKING_ATTENDEE_CONNECTION_REQUIRED" };
  const native = (dependencies.createBookingAdapter ?? createCalComBookingAdapter)({ directory, profileFile,
    clock: dependencies.clock, fetchImpl: dependencies.bookingFetch });
  try {
    const booking = await native.prepare(input);
    if (booking.input.failurePolicy === CALCOM_BOOKING_FAILURE_POLICY)
      native.assertFailureCancellationConsent(booking, { completionDeadline });
    return { id, category: "SCHEDULED_BOOKING", acceptanceContract: CALCOM_BOOKING_CONTRACT,
      profileFile, executionTiming:'AFTER_DEPENDENCY_ACCEPTANCE', booking };
  }
  catch (error) {
    if (/^CALCOM_BOOKING_/u.test(error.message)) return { id, unavailable: error.message };
    throw error;
  }
}
export function calComBookingFragment(part, completionDeadline) {
  const deferred=part.executionTiming==='AFTER_DEPENDENCY_ACCEPTANCE';
  const failureCancellation = part.booking.input.failurePolicy === CALCOM_BOOKING_FAILURE_POLICY;
  if (failureCancellation && !deferred) throw new Error('CALCOM_BOOKING_FAILURE_POLICY_REQUIRES_EXECUTION_PHASE');
  return { id: part.id, category: part.category, acceptanceContract: part.acceptanceContract,
    finalNodeId: "booking_current", witnessRequirementId: "booking_read",
    requirements: [
      { requirementId: "booking", role: "PRIMARY", capability: CALCOM_BOOKING_CAPABILITY, minimumReservationMs: 1,
        dependsOnRequirementIds: [], constraints: { eventTypeId: part.booking.event.eventTypeId,
          slotStart: part.booking.slotStart, slotEnd: part.booking.slotEnd, totalAmountMinor: "0",
          attendeeRefHash: part.booking.attendeeRefHash, connectionHash: part.booking.connectionHash,
          ...(failureCancellation ? { failurePolicy: CALCOM_BOOKING_FAILURE_POLICY } : {}),
          ...(deferred?{admissionMode:'EXECUTION_PHASE_TRANSACTION',maximumAmountMinor:'0'}:{}) } },
      { requirementId: "booking_read", role: "INDEPENDENT_WITNESS", capability: "PUBLIC_AVAILABILITY_WITH_NATIVE_BOOKING_ATTRIBUTION",
        minimumReservationMs: 1, dependsOnRequirementIds: ["booking"], constraints: { admissionMode: "ON_DEMAND_OBSERVATION" } },
    ],
    nodes: [{ nodeId: "booking_current", kind: deferred?'TRANSACTION':"OBSERVATION", dependsOn: [], primaryRequirementId: deferred?'booking':null,
      recoveryRequirementId: null, witnessRequirementId: "booking_read",
      input: { bookingIsNotAttendance: true }, acceptance: [part.acceptanceContract] }],
    obligations: [...(failureCancellation ? [{ obligationId: "cancel_booking_on_outcome_failure", trigger: "ON_FAILURE",
      targetRequirementId: "booking", nodeId: null, action: "CANCEL_ACCEPTED_BOOKING_ON_OUTCOME_FAILURE",
      input: { failurePolicy: CALCOM_BOOKING_FAILURE_POLICY, connectionHash: part.booking.connectionHash }, deadline: completionDeadline }] : []),
    { obligationId: "return_booking_control", trigger: "ALWAYS", targetRequirementId: "booking", nodeId: null,
      action: "RETURN_ACCEPTED_BOOKING_CONTROL_TO_BUYER", input: { cancellationIsSeparate: true }, deadline: completionDeadline }] };
}

export function createCalComBookingComponent({ part, directory, program, mapping }, dependencies = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const clock = dependencies.clock ?? (() => new Date().toISOString()), file = name => path.join(directory, `${name}.json`);
  const native = (dependencies.createBookingAdapter ?? createCalComBookingAdapter)({ directory: path.join(directory, "native"),
    profileFile: part.profileFile, clock, fetchImpl: dependencies.bookingFetch });
  const observer = (dependencies.createObserver ?? createGlobalpingExactHttpObserverV2)({ directory: path.join(directory, "observer"), clock });
  const booking = part.booking;
  const deferred=part.executionTiming==='AFTER_DEPENDENCY_ACCEPTANCE';
  const failureCancellation = booking.input.failurePolicy === CALCOM_BOOKING_FAILURE_POLICY;
  if (failureCancellation && !deferred) throw new Error('CALCOM_BOOKING_FAILURE_POLICY_REQUIRES_EXECUTION_PHASE');
  const boundRequirement = program.requirements?.find(row => row.requirementId === `${mapping.prefix}booking`);
  const failureObligation = program.obligations?.find(row => row.obligationId === `${mapping.prefix}cancel_booking_on_outcome_failure`);
  if (failureCancellation || boundRequirement?.constraints.failurePolicy || failureObligation) {
    if (!failureCancellation || boundRequirement?.constraints.failurePolicy !== CALCOM_BOOKING_FAILURE_POLICY
      || boundRequirement.constraints.connectionHash !== booking.connectionHash
      || failureObligation?.trigger !== 'ON_FAILURE' || failureObligation.targetRequirementId !== boundRequirement.requirementId
      || failureObligation.action !== 'CANCEL_ACCEPTED_BOOKING_ON_OUTCOME_FAILURE'
      || failureObligation.input.failurePolicy !== CALCOM_BOOKING_FAILURE_POLICY
      || failureObligation.input.connectionHash !== booking.connectionHash)
      throw new Error('CALCOM_BOOKING_FAILURE_POLICY_BINDING_CHANGED');
  }
  const cancelled = () => existsSync(file('cancellation')) && read(file('cancellation')).state === 'CANCELLED';
  async function closeFailedBooking() {
    const created = native.inspectCreation(booking, { programHash: program.programHash });
    const recorded = existsSync(file('transaction-result')) ? read(file('transaction-result')) : null;
    if (recorded?.bookingRefHash && recorded.bookingRefHash !== created.bookingRefHash)
      throw new Error('CALCOM_BOOKING_CREATION_REFERENCE_CHANGED');
    if (created.state === 'NOT_REQUESTED') return { status: 'CLOSED', receipt: {
      bookingRequestNotSent: true, bookingCancelled: false, paymentPerformed: false } };
    if (!created.bookingRefHash) return { status: 'OPEN', adapterState: {
      state: 'AWAITING_BOOKING_SUBMISSION_RECONCILIATION', bookingRefHash: null }, receipt: {
      bookingSubmissionState: created.state, cancellationConfirmed: false, bookingRequestNotSent: false } };
    // Every resumed closure first reads the original private UID. A lost cancel
    // response is reconciled by that GET and never becomes another POST.
    let current = await native.read(booking), cancellation = null;
    if (current.bookingRefHash && current.bookingRefHash !== created.bookingRefHash)
      throw new Error('CALCOM_BOOKING_CANCELLATION_REFERENCE_CHANGED');
    if (['ACCEPTED', 'PENDING_PROVIDER_ACCEPTANCE'].includes(current.state)) {
      cancellation = await native.cancel(booking);
      current = await native.read(booking);
    }
    const result = { state: current.state === 'CANCELLED' ? 'CANCELLED' : 'CANCELLATION_NOT_CONFIRMED',
      cancellation, readback: current, bookingRefHash: created.bookingRefHash, completedAt: clock(), paymentPerformed: false,
      cause: 'ORIGINAL_OUTCOME_FAILED', servicePerformanceUndone: false };
    if (result.state === 'CANCELLED' && !existsSync(file('cancellation'))) writeOnce(file('cancellation'), result);
    return { status: result.state === 'CANCELLED' ? 'CLOSED' : 'OPEN', receipt: result,
      ...(result.state !== 'CANCELLED' ? { adapterState: { state: 'AWAITING_BOOKING_CANCELLATION_READBACK',
        bookingRefHash: created.bookingRefHash } } : {}) };
  }
  const publicUrl = `https://api.cal.com/v2/slots?${new URLSearchParams({ eventTypeId: String(booking.event.eventTypeId),
    start: booking.input.windowStart, end: booking.input.windowEnd, timeZone: "UTC", format: "range" })}`;
  const bookingAdapter = { providerRef: "cal.com",
    async reserve({ program: original }) {
      if(deferred)return {status:'READY_FOR_TRANSACTION',reservationId:`booking-plan:${original.programHash}:${part.id}`,
        validUntil:program.completionDeadline,capacityReserved:false,
        providerReceipt:{transactionSubmitted:false,eventTypeId:booking.event.eventTypeId,slotStart:booking.slotStart,executionTiming:part.executionTiming}};
      if (existsSync(file("allocation"))) return read(file("allocation"));
      const accepted = await native.create(booking, { programHash: original.programHash, deadline: original.formationDeadline });
      writeOnce(file("transaction-result"), accepted);
      const result = accepted.state === "ACCEPTED" ? { status: "RESERVED", reservationId: `booking:${accepted.bookingRefHash}`,
        validUntil: booking.slotEnd, providerReceipt: accepted, capacityReserved: true }
        : { status: "UNAVAILABLE", providerReceipt: accepted };
      writeOnce(file("allocation"), result); return result;
    },
    async execute({program:original}) {
      if(deferred&&!existsSync(file('transaction-result'))){
        const accepted=await native.create(booking,{programHash:original.programHash,
          deadline:failureCancellation ? original.completionDeadline : original.formationDeadline});
        writeOnce(file('transaction-result'),accepted);
        if(accepted.state!=='ACCEPTED')return {status:'FAILED',providerReceipt:accepted};
      }
      const current = await native.read(booking);
      return { status: current.state === "ACCEPTED" ? "SUCCEEDED" : "FAILED", providerReceipt: current };
    },
    closeObligation: ({ obligation } = {}) => failureCancellation && obligation?.action === 'CANCEL_ACCEPTED_BOOKING_ON_OUTCOME_FAILURE'
      ? closeFailedBooking() : ({ status: "CLOSED", receipt: { buyerBookingRefHash: existsSync(file('transaction-result'))?read(file("transaction-result")).bookingRefHash??null:null,
        cancellationEndpoint: "TASK_SCOPED_CANCEL_BOOKING", bookingAutomaticallyCancelled: failureCancellation && cancelled() } }),
    // The accepted booking is the purchased resource. Releasing orchestration
    // ownership does not cancel a user's successful scheduled appointment.
    release: () => ({ status: "CLOSED", receipt: { bookingRetained: existsSync(file('transaction-result')) && !(failureCancellation && cancelled()),
      bookingCancelled: failureCancellation && cancelled(),
      disposition: failureCancellation && cancelled() ? 'BOOKING_CANCELLATION_READBACK_CONFIRMED'
        : existsSync(file('transaction-result'))?"BOOKING_OWNERSHIP_RETURNED_TO_BUYER_SEPARATE_CANCELLATION_REQUIRED":"BOOKING_NOT_EXECUTED" } }),
  };
  const witnessAdapter = { providerRef: "globalping+calcom-native-attribution",
    async reserve({ operationId }) {
      const observation = await observer.observe({ operationId, targetUrl: publicUrl });
      return { status: "READY_ON_DEMAND", reservationId: `booking-witness:${operationId}`, validUntil: program.completionDeadline,
        capacityReserved: false, providerReceipt: observation };
    },
    async observe({ operationId }) {
      const began = clock();
      const [current, external] = await Promise.all([native.read(booking), observer.observe({ operationId, targetUrl: publicUrl })]);
      const slots = external.publicAvailability?.slots;
      const available = slots?.some(row => Date.parse(row.start) === Date.parse(booking.slotStart));
      return { status: current.state === "ACCEPTED" && Array.isArray(slots) && !available ? "SATISFIED"
        : current.state === "CANCELLED" ? "NOT_SATISFIED" : "INCONCLUSIVE",
        observationStartedAt: began, observedAt: clock(), nativeBooking: current, externalAvailability: external,
        bookingAcceptedByProvider: current.state === "ACCEPTED", absentFromIndependentPublicAvailability: Array.isArray(slots) && !available,
        nativeAttributionIndependent: false, publicAvailabilityIndependentlyObserved: Array.isArray(slots),
        independentServiceCompletionProven: false, noAttendanceClaim: true };
    },
    release: () => ({ status: "CLOSED", receipt: { capacityReserved: false } }),
  };
  return { mapping, part, adapters: { booking: bookingAdapter, booking_read: witnessAdapter },
    deliveryDescriptor() {
      const current = read(file("transaction-result"));
      return { eventUrl: booking.input.eventUrl, eventTypeId: booking.event.eventTypeId, slotStart: booking.slotStart, slotEnd: booking.slotEnd,
        bookingRefHash: current.bookingRefHash, realBookingCreated: current.state === "ACCEPTED", bookingRetained: !(failureCancellation && cancelled()),
        bookingRequestRecorded: !!current.bookingRefHash, providerAcceptance: current.state,
        totalAmountMinor: "0", attendanceOrServiceCompleted: false, independentReplacementSupplier: false,
        ...(failureCancellation ? { failurePolicy: CALCOM_BOOKING_FAILURE_POLICY,
          cancellationState: cancelled() ? 'CANCELLED' : 'NOT_CONFIRMED' } : {}) };
    },
    async cancel({ bookingRefHash }) {
      const allocation = read(file("transaction-result"));
      if (!bookingRefHash || allocation.bookingRefHash !== bookingRefHash) throw new Error("CALCOM_BOOKING_CANCEL_REFERENCE_MISMATCH");
      const cancelled = await native.cancel(booking);
      const current = await native.read(booking);
      const result = { state: current.state === "CANCELLED" ? "CANCELLED" : "CANCELLATION_NOT_CONFIRMED",
        cancellation: cancelled, readback: current, bookingRefHash, completedAt: clock(), paymentPerformed: false };
      if (result.state === "CANCELLED" && !existsSync(file("cancellation"))) writeOnce(file("cancellation"), result);
      return result;
    },
  };
}
