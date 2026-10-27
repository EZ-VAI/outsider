/* One accepted reservation replacement inside the original order. This pure
 * lifecycle consumes original-adapter receipts; it performs no IO, chooses no
 * supplier, grants no authority, and does not undo or compensate delivered work. */
import { publicDatasetHash as digest } from './outsider-public-dataset.js';

export const RESERVED_RESOURCE_REPLACEMENT_SCHEMA = 'outsider/reserved-resource-replacement/v1';
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const PHASES = ['ACQUIRE_NEW', 'RELEASE_OLD', 'RELEASE_NEW'];
const fail = code => { throw Object.assign(new Error(`RESERVED_RESOURCE_REPLACEMENT_${code}`),
  { code: `RESERVED_RESOURCE_REPLACEMENT_${code}` }); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const text = value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 4096;
const identity = value => `${value.providerRef}\0${value.reservationId}`;

export function normalizeReservedResourceReplacement(value) {
  if (!exact(value, ['schema', 'programHash', 'componentId', 'nodeId', 'originalConnectionHash', 'replacementConnectionHash',
    'inputContractHash', 'acceptanceContractHash', 'authorizationHash', 'completionDeadline', 'currency',
    'maximumAmountMinor', 'executionWindowHash', 'participants', 'retainedWitness'])
    || value.schema !== RESERVED_RESOURCE_REPLACEMENT_SCHEMA
    || ['programHash', 'originalConnectionHash', 'replacementConnectionHash', 'inputContractHash',
      'acceptanceContractHash', 'authorizationHash', 'executionWindowHash'].some(key => !HASH.test(value[key] ?? ''))
    || value.originalConnectionHash === value.replacementConnectionHash
    || !ID.test(value.componentId ?? '') || !ID.test(value.nodeId ?? '')
    || !instant(value.completionDeadline) || !/^[A-Z]{3}$/u.test(value.currency ?? '') || value.maximumAmountMinor !== '0'
    || !Array.isArray(value.participants) || value.participants.length < 1 || value.participants.length > 16)
    fail('CONTRACT_INVALID');
  const requirements = new Set(), oldIdentities = new Set();
  for (const row of value.participants) {
    if (!exact(row, ['requirementId', 'role', 'old', 'replacement']) || !ID.test(row.requirementId ?? '')
      || requirements.has(row.requirementId) || !['PRIMARY', 'RECOVERY'].includes(row.role)
      || !exact(row.old, ['providerRef', 'reservationId', 'validUntil', 'receiptHash'])
      || !text(row.old.providerRef) || !text(row.old.reservationId) || !HASH.test(row.old.receiptHash ?? '')
      || !instant(row.old.validUntil) || Date.parse(row.old.validUntil) < Date.parse(value.completionDeadline)
      || !exact(row.replacement, ['providerRef', 'quoteId', 'quoteHash', 'expiresAt', 'completionBy',
        'responsibilityTerms', 'totalAmountMinor', 'currency'])
      || !text(row.replacement.providerRef) || !text(row.replacement.quoteId) || !HASH.test(row.replacement.quoteHash ?? '')
      || !text(row.replacement.responsibilityTerms) || row.replacement.totalAmountMinor !== '0'
      || row.replacement.currency !== value.currency || !instant(row.replacement.expiresAt)
      || !instant(row.replacement.completionBy) || Date.parse(row.replacement.completionBy) > Date.parse(value.completionDeadline)
      || oldIdentities.has(identity(row.old))) fail('PARTICIPANT_INVALID');
    requirements.add(row.requirementId); oldIdentities.add(identity(row.old));
  }
  const witness = value.retainedWitness;
  if (!exact(witness, ['requirementId', 'providerRef', 'routeHash', 'reservationId', 'validUntil', 'receiptHash'])
    || !ID.test(witness.requirementId ?? '') || requirements.has(witness.requirementId)
    || !text(witness.providerRef) || !text(witness.reservationId) || !HASH.test(witness.routeHash ?? '')
    || !HASH.test(witness.receiptHash ?? '') || !instant(witness.validUntil)
    || Date.parse(witness.validUntil) < Date.parse(value.completionDeadline)
    || value.participants.some(row => row.old.providerRef === witness.providerRef || row.replacement.providerRef === witness.providerRef))
    fail('WITNESS_INVALID');
  if (Buffer.byteLength(JSON.stringify(value)) > 64000) fail('CONTRACT_TOO_LARGE');
  digest(value);
  return structuredClone(value);
}

export function reservedResourceReplacementOperationId({ contract, phase, requirementId }) {
  const normalized = normalizeReservedResourceReplacement(contract);
  if (!PHASES.includes(phase) || !normalized.participants.some(row => row.requirementId === requirementId))
    fail('OPERATION_INVALID');
  return `replacement-${digest({ contractHash: digest(normalized), phase, requirementId }).slice(7)}`;
}

// The adapter has already projected its native protocol. No success shortcut
// can replace matching accepted terms and an actual reservation identity.
function acquisition(contract, row, result) {
  const unsent = result?.nativeRequestNotSent;
  if (result?.status === 'UNAVAILABLE' && exact(unsent, ['contractHash', 'operationId', 'noCapacityAcquired', 'reason'])
    && unsent.contractHash === digest(contract) && unsent.noCapacityAcquired === true
    && unsent.operationId === reservedResourceReplacementOperationId({ contract, phase: 'ACQUIRE_NEW', requirementId: row.requirementId })
    && typeof unsent.reason === 'string' && /^[A-Z][A-Z0-9_]{0,127}$/u.test(unsent.reason))
    return { state: 'DECLINED', reservation: null };
  const receipt = result?.providerReceipt;
  if (!receipt || receipt.httpAccepted !== true || receipt.providerRef !== row.replacement.providerRef
    || receipt.quoteId !== row.replacement.quoteId) return { state: 'UNKNOWN', reservation: null };
  const hasCapacity = text(receipt.reservationId);
  if (!hasCapacity) return { state: receipt.noCapacityAcquired === true ? 'DECLINED' : 'UNKNOWN', reservation: null };
  const reservation = { requirementId: row.requirementId, role: row.role, reservationId: receipt.reservationId,
    validUntil: receipt.validUntil ?? null, providerReceipt: structuredClone(receipt), adapterState: null };
  if (contract.participants.some(other => identity(other.old) === identity(receipt)))
    return { state: 'ALIASED_OLD_CAPACITY', reservation: null };
  const accepted = result.status === 'RESERVED' && result.reservationId === receipt.reservationId
    && result.capacityReserved === true && result.validUntil === receipt.validUntil && receipt.accepted === true
    && receipt.totalAmountMinor === '0' && receipt.currency === contract.currency
    && receipt.responsibilityTerms === row.replacement.responsibilityTerms && instant(receipt.validUntil)
    && Date.parse(receipt.validUntil) >= Date.parse(contract.completionDeadline);
  return { state: accepted ? 'ACCEPTED' : 'ALLOCATION_NOT_ACCEPTED', reservation };
}

function releaseMatches(result, providerRef, reservationId) {
  return ['CLOSED', 'RELEASED'].includes(result?.status) && result.receipt?.httpAccepted === true
    && result.receipt.providerRef === providerRef && result.receipt.reservationId === reservationId
    && result.receipt.released === true;
}

export function projectReservedResourceReplacement({ contract, events = [], observedAt, closing = false }) {
  contract = normalizeReservedResourceReplacement(contract);
  if (!instant(observedAt) || typeof closing !== 'boolean' || !Array.isArray(events) || events.length > 4096)
    fail('PROJECTION_INVALID');
  const contractHash = digest(contract), requested = new Map(), results = new Map();
  let lastAt = -Infinity;
  for (const event of events) {
    const expected = event?.kind === 'REQUESTED' ? ['kind', 'contractHash', 'phase', 'requirementId', 'operationId', 'recordedAt']
      : ['kind', 'contractHash', 'phase', 'requirementId', 'operationId', 'recordedAt', 'result'];
    if (!exact(event, expected) || !['REQUESTED', 'OBSERVED'].includes(event.kind) || event.contractHash !== contractHash
      || !instant(event.recordedAt) || Date.parse(event.recordedAt) < lastAt || Date.parse(event.recordedAt) > Date.parse(observedAt)
      || event.operationId !== reservedResourceReplacementOperationId({ contract, phase: event.phase, requirementId: event.requirementId }))
      fail('HISTORY_INVALID');
    lastAt = Date.parse(event.recordedAt);
    const key = `${event.phase}:${event.requirementId}`;
    if (event.kind === 'REQUESTED') {
      if (requested.has(key)) fail('DUPLICATE_REQUEST');
      if (event.phase === 'RELEASE_OLD' && !contract.participants.every(row =>
        acquisition(contract, row, results.get(`ACQUIRE_NEW:${row.requirementId}`)).state === 'ACCEPTED'))
        fail('OLD_RELEASE_BEFORE_REPLACEMENT_ACCEPTED');
      if (event.phase === 'ACQUIRE_NEW' && Date.parse(event.recordedAt) >= Date.parse(contract.completionDeadline))
        fail('ACQUISITION_AFTER_DEADLINE');
      if (event.phase === 'RELEASE_NEW' && !requested.has(`ACQUIRE_NEW:${event.requirementId}`)) fail('CLEANUP_WITHOUT_ACQUISITION');
      requested.set(key, event);
    } else {
      if (!requested.has(key)) fail('OBSERVATION_WITHOUT_REQUEST');
      const row = contract.participants.find(item => item.requirementId === event.requirementId);
      if (event.phase === 'ACQUIRE_NEW') {
        const previous = acquisition(contract, row, results.get(key)), next = acquisition(contract, row, event.result);
        if (previous.reservation && (!next.reservation || identity(previous.reservation.providerReceipt) !== identity(next.reservation.providerReceipt)))
          fail('ALLOCATION_IDENTITY_CHANGED');
        if (previous.state === 'ACCEPTED' && digest(previous.reservation) !== digest(next.reservation)) fail('ACCEPTED_CAPACITY_CHANGED');
      }
      digest(event.result); results.set(key, event.result);
    }
  }
  const acquisitions = new Map(contract.participants.map(row => [row.requirementId,
    acquisition(contract, row, results.get(`ACQUIRE_NEW:${row.requirementId}`))]));
  const newIdentities = new Set();
  for (const value of acquisitions.values()) if (value.reservation) {
    const key = identity(value.reservation.providerReceipt);
    if (newIdentities.has(key)) fail('REPLACEMENT_CAPACITY_DUPLICATED');
    newIdentities.add(key);
  }
  const action = (phase, row) => ({ phase, requirementId: row.requirementId,
    operationId: reservedResourceReplacementOperationId({ contract, phase, requirementId: row.requirementId }),
    previouslyRequested: requested.has(`${phase}:${row.requirementId}`) });
  const expired = Date.parse(observedAt) >= Date.parse(contract.completionDeadline);
  const quoteExpiredBeforeRequest = contract.participants.some(row => !requested.has(`ACQUIRE_NEW:${row.requirementId}`)
    && Date.parse(observedAt) >= Date.parse(row.replacement.expiresAt));
  const aborted = closing || expired || quoteExpiredBeforeRequest || [...acquisitions.values()].some(value =>
    ['DECLINED', 'ALLOCATION_NOT_ACCEPTED', 'ALIASED_OLD_CAPACITY'].includes(value.state));
  const base = { schema: 'outsider/reserved-resource-replacement-state/v1', contractHash, programHash: contract.programHash,
    componentId: contract.componentId, nodeId: contract.nodeId, observedAt, targetDispatchBlocked: true,
    releaseIsCompensation: false, deliveredEffectsUndone: false, newExecutionAuthorityCreated: false };
  if (aborted) {
    const nextActions = [];
    for (const row of contract.participants) {
      const acquired = acquisitions.get(row.requirementId), wasRequested = requested.has(`ACQUIRE_NEW:${row.requirementId}`);
      if (acquired.reservation) {
        if (!releaseMatches(results.get(`RELEASE_NEW:${row.requirementId}`), row.replacement.providerRef, acquired.reservation.reservationId))
          nextActions.push(action('RELEASE_NEW', row));
      } else if (wasRequested && acquired.state === 'UNKNOWN') nextActions.push(action('RELEASE_NEW', row));
      // An old-capacity alias must never be released as a new allocation.
    }
    // closePendingReservation may prove the original request never acquired
    // capacity. Only that explicit adapter evidence ends unknown allocation.
    const remaining = nextActions.filter(item => {
      const result = results.get(`RELEASE_NEW:${item.requirementId}`);
      const row = contract.participants.find(value => value.requirementId === item.requirementId);
      if (acquisitions.get(item.requirementId).reservation) return true;
      const receipt = result?.receipt, provider = receipt?.providerReceipt;
      return !(['CLOSED', 'RELEASED'].includes(result?.status) && (receipt?.requestNotSent === true && receipt.noCapacityAcquired === true
        || receipt?.providerConfirmedNoCapacity === true && provider?.httpAccepted === true && provider.noCapacityAcquired === true
          && provider.providerRef === row.replacement.providerRef && provider.quoteId === row.replacement.quoteId));
    });
    return { ...base, state: remaining.length ? 'CLEANING_REPLACEMENT' : 'ABORTED', nextActions: remaining,
      reason: closing ? 'ORDER_CLOSING' : expired ? 'ORIGINAL_DEADLINE_PASSED'
        : quoteExpiredBeforeRequest ? 'QUOTE_EXPIRED_BEFORE_REQUEST' : 'REPLACEMENT_CAPACITY_NOT_ACCEPTED', activation: null };
  }
  const pending = contract.participants.filter(row => acquisitions.get(row.requirementId).state !== 'ACCEPTED');
  if (pending.length) return { ...base, state: 'ACQUIRING_REPLACEMENT', nextActions: pending.map(row => action('ACQUIRE_NEW', row)), activation: null };
  const oldPending = contract.participants.filter(row => !releaseMatches(results.get(`RELEASE_OLD:${row.requirementId}`),
    row.old.providerRef, row.old.reservationId));
  if (oldPending.length) return { ...base, state: 'RELEASING_OLD_CAPACITY', nextActions: oldPending.map(row => action('RELEASE_OLD', row)), activation: null };
  return { ...base, state: 'READY_TO_ACTIVATE', nextActions: [], activation: {
    replacementConnectionHash: contract.replacementConnectionHash,
    reservations: Object.fromEntries([...acquisitions].map(([requirementId, value]) => [requirementId, value.reservation])),
    oldReservationsReleased: contract.participants.map(row => ({ requirementId: row.requirementId,
      providerRef: row.old.providerRef, reservationId: row.old.reservationId,
      receiptHash: digest(results.get(`RELEASE_OLD:${row.requirementId}`).receipt) })) } };
}
