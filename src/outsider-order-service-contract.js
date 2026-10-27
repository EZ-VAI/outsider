/* The customer's order conversation shares the original order identity. Only
 * display fields cross the owner/invited boundary; executable arguments stay
 * in the Node and are checked again against the current order. */
const fail = code => { throw Object.assign(new Error(`CUSTOMER_SERVICE_${code}`), { code: `CUSTOMER_SERVICE_${code}` }); };
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
export const ORDER_SERVICE_TEXT_BYTES = 8000;
export const ORDER_SERVICE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
export function normalizeOrderServiceCommand(command) {
  const fields = command?.action === 'MESSAGE' ? ['action', 'requestId', 'text', 'language']
    : ['ACCEPT_ACTION', 'DISMISS_ACTION'].includes(command?.action) ? ['action', 'requestId', 'actionId']
      : command?.action === 'RETRY' ? ['action', 'requestId'] : [];
  if (!fields.length || !exact(command, fields) || typeof command.requestId !== 'string' || !ORDER_SERVICE_REQUEST_ID.test(command.requestId)) fail('COMMAND_INVALID');
  if (command.action === 'MESSAGE' && (typeof command.text !== 'string' || !command.text.trim()
    || command.text.includes('\0') || Buffer.byteLength(command.text) > ORDER_SERVICE_TEXT_BYTES
    || !['zh-CN', 'en'].includes(command.language))) fail('MESSAGE_INVALID');
  if (['ACCEPT_ACTION', 'DISMISS_ACTION'].includes(command.action) && (typeof command.actionId !== 'string' || !/^service_action_[a-f0-9]{24}$/u.test(command.actionId))) fail('ACTION_INVALID');
  return { ...command, ...(command.action === 'MESSAGE' ? { text: command.text.trim() } : {}) };
}
export function publicOrderCustomerService(value) {
  if (!value || !['ACTIVE', 'WORKING', 'WAITING', 'CLOSED', 'UNAVAILABLE'].includes(value.status)) return null;
  const selected = []; let bytes = 0;
  for (const row of [...(value.messages ?? [])].reverse()) {
    if (!row || typeof row.id !== 'string' || !['user', 'assistant', 'system'].includes(row.role) || typeof row.text !== 'string') continue;
    const message = { id: row.id, role: row.role, text: row.text.slice(0, 8000), createdAt: row.createdAt,
      ...(typeof row.kind === 'string' ? { kind: row.kind } : {}) };
    const size = Buffer.byteLength(JSON.stringify(message));
    if (selected.length >= 60 || selected.length && bytes + size > 48000) break;
    selected.push(message); bytes += size;
  }
  const candidates = (value.actions ?? []).filter(row => row && typeof row.id === 'string'
    && ['PROPOSED', 'APPLIED', 'FAILED', 'DISMISSED'].includes(row.status)).slice(-16).map(row => ({
    id: row.id, label: String(row.label ?? '').slice(0, 160), description: String(row.description ?? '').slice(0, 3000),
    status: row.status, confirmationRequired: row.confirmationRequired === true,
    // The order page offers whole-order acceptance outside the conversation.
    // (Projected twice on the invited path, so keep an already public kind.)
    ...(row.executable?.kind === 'ACCEPT_DELIVERY' || row.kind === 'ACCEPT_DELIVERY' ? { kind: 'ACCEPT_DELIVERY' } : {}),
  }));
  const actions = []; let actionBytes = 0;
  for (const row of [...candidates].reverse()) {
    const size = Buffer.byteLength(JSON.stringify(row));
    if (actions.length && actionBytes + size > 24000) break;
    actions.unshift(row); actionBytes += size;
  }
  return { status: value.status, messages: selected.reverse(), actions,
    updatedAt: value.updatedAt ?? null, modelAvailable: value.modelAvailable === true,
    pending: value.pending === true, ...(typeof value.errorCode === 'string' ? { errorCode: value.errorCode } : {}),
    ...(value.acceptedAt ? { acceptedAt: value.acceptedAt } : {}),
    acceptanceHistory: (value.acceptanceHistory ?? []).slice(-16).filter(row => typeof row.acceptedAt === 'string')
      .map(row => ({ acceptedAt: row.acceptedAt })),
    ...(value.aftercare && ['ACTIVE','RESOLVED'].includes(value.aftercare.state) ? { aftercare: {
      state: value.aftercare.state, kind: 'DIGITAL_REWORK', requirementId: value.aftercare.requirementId,
      requestedAt: value.aftercare.requestedAt,
      ...(value.aftercare.previousAcceptedAt ? { previousAcceptedAt: value.aftercare.previousAcceptedAt } : {}),
      ...(value.aftercare.resolvedAt ? { resolvedAt: value.aftercare.resolvedAt } : {}),
    } } : {}),
    hasEarlierMessages: value.hasEarlierMessages === true || (value.messages?.length ?? 0) > selected.length };
}
