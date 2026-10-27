import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

const SCHEMA = "outsider/outcome-offer-plan/v1";
const PROPOSAL_SCHEMA = "outsider/exact-commitment-proposal/v2";
const MONEY = /^(?:0|[1-9]\d{0,30})$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const COST_KEYS = ["executionMinor", "recoveryMinor", "verificationMinor", "serviceMinor"];
const isMoney = value => typeof value === "string" && MONEY.test(value);
const instant = value => typeof value === "string" && Number.isFinite(Date.parse(value));
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;

function validateRequest(request, now) {
  if (!request || typeof request.requestId !== "string" || !request.requestId
    || typeof request.goal !== "string" || !request.goal.trim()
    || !/^[A-Z]{3}$/u.test(request.budget?.currency ?? "")
    || !isMoney(request.budget?.maximumAmountMinor)
    || !instant(request.completionDeadline) || !instant(now)) {
    throw new Error("OUTSIDER_OUTCOME_OFFER_INVALID_REQUEST");
  }
}

function proposalMatches(proposal, request, terms) {
  if (!proposal || proposal.schema !== PROPOSAL_SCHEMA) return false;
  const { proposalHash, ...body } = proposal;
  return HASH.test(proposalHash ?? "") && proposalHash === digest(PROPOSAL_SCHEMA, body)
    && proposal.requestId === request.requestId
    && proposal.currency === request.budget.currency
    && proposal.currency === terms.currency
    && proposal.totalAmountMinor === terms.totalAmountMinor
    && proposal.completionDeadline === request.completionDeadline
    && proposal.completionDeadline === terms.completionDeadline
    && proposal.validUntil === terms.validUntil
    && isMoney(proposal.maximumLossMinor)
    && BigInt(proposal.maximumLossMinor) <= BigInt(request.budget.maximumAmountMinor)
    && /^network_[a-f0-9]{32}$/u.test(proposal.networkId ?? "")
    && ["programHash", "coordinatorBindingHash", "primaryReadinessRefHash",
      "recoveryReadinessRefHash", "independentWitnessReadinessRefHash"]
      .every(key => HASH.test(proposal[key] ?? ""))
    && proposal.confirmationRequired === true
    && proposal.confirmationEffect === "ATOMIC_RESERVE_THREE_SLOTS_THEN_PRIMARY_COMMIT"
    && proposal.outcomePromiseIssued === false;
}

const ACTIONS = {
  PRICE_MISSING: "OBTAIN_ALL_IN_OUTCOME_QUOTE",
  COST_BREAKDOWN_INCOMPLETE: "COMPLETE_QUOTED_COST_BREAKDOWN",
  COST_TOTAL_MISMATCH: "RECONCILE_QUOTED_TOTAL",
  OUTCOME_TOTAL_MISSING: "PRICE_EXECUTION_RECOVERY_AND_VERIFICATION_TOGETHER",
  DEADLINE_MISSING: "OBTAIN_COMPLETION_WINDOW",
  SOURCE_MISSING: "OBTAIN_QUOTE_SOURCE",
  QUOTE_VALIDITY_MISSING: "OBTAIN_QUOTE_VALIDITY",
  QUOTE_EXPIRED: "REFRESH_QUOTE_AND_AVAILABILITY",
  CURRENCY_MISMATCH: "OBTAIN_QUOTE_IN_REQUEST_CURRENCY",
  INVALID_PRICE: "RECONCILE_QUOTED_TOTAL",
  EXACT_PROPOSAL_MISMATCH: "REFORM_EXACT_PROPOSAL",
  COMPLETION_WINDOW_PASSED: "REFRESH_COMPLETION_WINDOW",
  OBSERVATION_IN_FUTURE: "RECONCILE_SOURCE_OBSERVATION_TIME",
};

/** Pure planning, with no provider calls, reservations, payment or outcome promise.
 * An executable offer is eligible to ask the product runtime to confirm; that
 * runtime must re-read its live proposal and invoke the existing coordinator.
 * All-in prices are quoted charges, never the user's entire willingness to pay.
 */
export function planOutsiderOutcomeOffers({ request, candidates, now }) {
  validateRequest(request, now);
  if (!Array.isArray(candidates)) throw new Error("OUTSIDER_OUTCOME_OFFER_INVALID_CANDIDATES");
  const requestHash = digest("outsider/outcome-offer-request/v1", request);
  const offers = [], alternatives = [], pendingCandidates = [], nextActions = [];
  const ids = new Set();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.candidateId !== "string" || !candidate.candidateId
      || ids.has(candidate.candidateId)) throw new Error("OUTSIDER_OUTCOME_OFFER_INVALID_CANDIDATE_ID");
    ids.add(candidate.candidateId);
    const exact = candidate.exactCommitmentProposal ?? null;
    const issues = [];
    const costs = candidate.costs ?? null;
    const fullCosts = costs !== null && COST_KEYS.every(key => isMoney(costs[key]));
    if (costs !== null && !fullCosts) issues.push("COST_BREAKDOWN_INCOMPLETE");
    const costSum = fullCosts ? COST_KEYS.reduce((sum, key) => sum + BigInt(costs[key]), 0n).toString() : null;
    const totalAmountMinor = candidate.totalAmountMinor ?? exact?.totalAmountMinor ?? costSum;
    if (totalAmountMinor === null || totalAmountMinor === undefined) issues.push("PRICE_MISSING");
    else if (!isMoney(totalAmountMinor)) issues.push("INVALID_PRICE");
    if (costSum !== null && costSum !== totalAmountMinor) issues.push("COST_TOTAL_MISMATCH");
    const priceScope = candidate.priceScope ?? (exact || fullCosts ? "OUTCOME_TOTAL" : "UNSPECIFIED");
    if (priceScope !== "OUTCOME_TOTAL") issues.push("OUTCOME_TOTAL_MISSING");
    const currency = candidate.currency ?? exact?.currency ?? null;
    if (currency !== request.budget.currency) issues.push("CURRENCY_MISMATCH");
    const completionDeadline = candidate.completionDeadline ?? exact?.completionDeadline ?? null;
    if (!instant(completionDeadline)) issues.push("DEADLINE_MISSING");
    else if (Date.parse(completionDeadline) <= Date.parse(now)) issues.push("COMPLETION_WINDOW_PASSED");
    const validUntil = candidate.validUntil ?? exact?.validUntil ?? null;
    if (!instant(validUntil)) issues.push("QUOTE_VALIDITY_MISSING");
    else if (Date.parse(validUntil) <= Date.parse(now)) issues.push("QUOTE_EXPIRED");
    const observedAt = candidate.observedAt ?? null;
    if (observedAt && (!instant(observedAt) || Date.parse(observedAt) > Date.parse(now))) {
      issues.push("OBSERVATION_IN_FUTURE");
    }
    const sourceRefs = [...new Set(candidate.sourceRefs ?? [])].sort();
    if (!sourceRefs.length || !sourceRefs.every(ref => typeof ref === "string" && HASH.test(ref))) {
      issues.push("SOURCE_MISSING");
    }
    const terms = { currency, totalAmountMinor: totalAmountMinor ?? null, completionDeadline, validUntil };
    const exactMatches = proposalMatches(exact, request, terms);
    if (exact && !exactMatches) issues.push("EXACT_PROPOSAL_MISMATCH");
    const base = {
      candidateId: candidate.candidateId, ...terms, observedAt, priceScope,
      costBreakdown: fullCosts ? Object.fromEntries(COST_KEYS.map(key => [key, costs[key]])) : null,
      sourceRefs, exactCommitmentProposal: exact, proposalHash: exact?.proposalHash ?? null,
      maximumLossMinor: exact?.maximumLossMinor ?? null,
    };
    if (issues.length) {
      pendingCandidates.push({ ...base, issues, executable: false });
      nextActions.push(...issues.map(reason => ({ candidateId: candidate.candidateId, action: ACTIONS[reason], reason })));
      continue;
    }
    const budgetGap = BigInt(totalAmountMinor) - BigInt(request.budget.maximumAmountMinor);
    const delayMs = Date.parse(completionDeadline) - Date.parse(request.completionDeadline);
    const withinBudget = budgetGap <= 0n, onTime = delayMs <= 0;
    const body = { schema: "outsider/outcome-offer/v1", requestHash, ...base,
      withinBudget, onTime, executable: withinBudget && onTime && exactMatches,
      confirmationRequired: true, outcomePromiseIssued: false };
    const offer = { ...body, offerHash: digest(body.schema, body) };
    if (withinBudget && onTime) {
      offers.push(offer);
      if (!offer.executable) nextActions.push({ candidateId: candidate.candidateId,
        action: "FORM_PRIMARY_RECOVERY_AND_WITNESS_PROPOSAL", reason: "EXACT_PROPOSAL_NOT_READY" });
    } else {
      alternatives.push({ ...offer,
        reason: !withinBudget && !onTime ? "BUDGET_AND_DEADLINE_CHANGE_REQUIRED"
          : !withinBudget ? "BUDGET_CHANGE_REQUIRED" : "DEADLINE_CHANGE_REQUIRED",
        budgetGapMinor: withinBudget ? "0" : budgetGap.toString(), delayMs: Math.max(0, delayMs),
        requestChangeRequired: true });
    }
  }
  const compare = (a, b) => Number(b.executable) - Number(a.executable)
    || (BigInt(a.totalAmountMinor) < BigInt(b.totalAmountMinor) ? -1 : BigInt(a.totalAmountMinor) > BigInt(b.totalAmountMinor) ? 1 : 0)
    || Date.parse(a.completionDeadline) - Date.parse(b.completionDeadline)
    || a.candidateId.localeCompare(b.candidateId);
  offers.sort(compare); alternatives.sort(compare);
  pendingCandidates.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  if (!candidates.length) nextActions.push({ candidateId: null, action: "DISCOVER_OUTCOME_SUPPLY", reason: "NO_CANDIDATES" });
  return { schema: SCHEMA, requestId: request.requestId, requestHash, observedAt: now,
    state: offers.some(offer => offer.executable) ? "READY_TO_CONFIRM"
      : offers.length ? "FORMING" : alternatives.length ? "ALTERNATIVES_AVAILABLE" : "FORMING",
    offers, alternatives, pendingCandidates,
    recommendedOfferHash: offers[0]?.offerHash ?? null,
    nextActions, outcomePromiseIssued: false };
}
