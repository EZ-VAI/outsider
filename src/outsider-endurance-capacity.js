const stripAnsi = (value) => String(value ?? "")
  .replace(/\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g, " ")
  .replace(/\s+/g, " ").trim();

const meridiemHour = (hour, suffix) => {
  const normalized = Number(hour) % 12;
  return suffix.toLowerCase() === "pm" ? normalized + 12 : normalized;
};

/** Parse only Claude's explicit, user-visible capacity banner.  The raw banner
 * is never persisted; callers can commit its hash and the normalized reset. */
export function parseClaudeCapacityBlock(value, { nowMs = Date.now(), localTimeZone = null } = {}) {
  const text = stripAnsi(value);
  const authenticationRequired = /(?:not logged in|please (?:run )?\/?login|authentication required|failed to authenticate[\s\S]{0,200}\b403\b[\s\S]{0,200}request not allowed)/i
    .test(text);
  if (authenticationRequired) {
    return { limited: true, kind: "authentication-required", resetAtMs: null,
      resetTimeZone: null };
  }
  const limited = /(?:you(?:'|’)ve hit your session limit|usage limit reached|rate limit reached)/i
    .test(text);
  if (!limited) return null;
  const match = text.match(/resets?\s+(?:(tomorrow)\s+)?(\d{1,2}):(\d{2})\s*(am|pm)(?:\s*\(([^)]+)\))?/i);
  if (!match) return { limited: true, kind: "usage-limit", resetAtMs: null,
    resetTimeZone: null };
  const resetTimeZone = match[5]?.trim() || localTimeZone || null;
  if (localTimeZone && resetTimeZone && resetTimeZone !== localTimeZone) {
    return { limited: true, kind: "usage-limit", resetAtMs: null, resetTimeZone };
  }
  const now = new Date(nowMs);
  const reset = new Date(nowMs);
  reset.setHours(meridiemHour(match[2], match[4]), Number(match[3]), 0, 0);
  if (match[1] || reset.getTime() <= now.getTime()) reset.setDate(reset.getDate() + 1);
  return { limited: true, kind: "usage-limit", resetAtMs: reset.getTime(), resetTimeZone };
}

/**
 * Observe PTY output without allowing a later terminal redraw to erase a
 * capacity banner before the evaluator's polling loop sees it.  Detection is
 * performed against the untruncated prior-tail + current chunk, while only a
 * bounded tail and a normalized first observation are retained.  Raw terminal
 * output never enters the durable capacity record.
 */
export function observeClaudeCapacityChunk(state, chunk, {
  nowMs = Date.now(), localTimeZone = null, maximumTailBytes = 32_000,
} = {}) {
  const prior = state && typeof state === "object" ? state : {};
  const combined = `${String(prior.tail ?? "")}${String(chunk ?? "")}`;
  const parsed = prior.block ?? parseClaudeCapacityBlock(combined, { nowMs, localTimeZone });
  return {
    tail: combined.slice(-Math.max(1, Number(maximumTailBytes) || 32_000)),
    block: prior.block ?? (parsed?.limited ? {
      ...parsed,
      observedAtMs: nowMs,
    } : null),
  };
}

export function assessEnduranceCapacity({
  nowMs = Date.now(), resetAtMs = null, budgetDeadlineMs,
  completedCheckpoints = 0, minimumCheckpoints, minimumIntervalMs,
} = {}) {
  const remaining = Math.max(0, Number(minimumCheckpoints) - Number(completedCheckpoints));
  const resumeAt = resetAtMs != null && Number.isFinite(Number(resetAtMs))
    ? Number(resetAtMs) : Infinity;
  const earliestCompletionMs = remaining === 0
    ? nowMs : resumeAt + Math.max(0, remaining - 1) * Number(minimumIntervalMs);
  const recoverable = Number.isFinite(earliestCompletionMs)
    && earliestCompletionMs <= Number(budgetDeadlineMs);
  return { recoverable, remainingCheckpoints: remaining, resumeAtMs: resumeAt,
    earliestCompletionMs };
}
