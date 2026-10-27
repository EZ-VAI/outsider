/* Seller-term ETA intervals for planning; source dates retain their own status. */
import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import { createBuyerNativeRouteEvidenceV1, verifyBuyerNativeRouteEvidenceV1 }
  from "./outsider-buyer-native-route-evidence-v1.js";
import { parseAdafruitShippingApplicationFormV9 }
  from "../scripts/outsider-adafruit-shipping-application-live-runner-v9.mjs";

const SCHEMA = "outsider/adafruit-eta-planning/v1";
const ZONE = "America/New_York";
const SERVICES = ["UPS Ground Saver", "UPS Ground", "UPS 3 Day Select",
  "UPS 2nd Day Air", "UPS Next Day Air", "USPS Ground Advantage",
  "Priority Mail"];
const EXPEDITED = new Set(["UPS 3 Day Select", "UPS 2nd Day Air",
  "UPS Next Day Air"]);
const RANK = { TYPICAL_WINDOW_BEFORE_DEADLINE: 0,
  TYPICAL_WINDOW_STRADDLES_DEADLINE: 1,
  TYPICAL_WINDOW_AFTER_DEADLINE: 2, UNAVAILABLE: 3 };
const sha = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const digest = (domain, value) => sha(`${domain}\0${canonicalizeStrict(value)}`);
function fail(code) { throw new TypeError(`OUTSIDER_ADAFRUIT_ETA_V1_${code}`); }
function instant(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail("INSTANT_INVALID");
  return value;
}
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
    || !Number.isFinite(Date.parse(`${value}T12:00:00.000Z`))
    || new Date(`${value}T12:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    fail("DATE_INVALID");
  }
  return value;
}
function text(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
    .replace(/<!--[\s\S]*?-->/gu, "").replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ").replace(/&(?:ndash|mdash);/giu, "-")
    .replace(/[–—]/gu, "-").replace(/&(?:trade|reg);/giu, "")
    .replace(/&amp;/giu, "&").replace(/\s+/gu, " ").trim();
}
function localParts(value) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour), minute: Number(parts.minute) };
}
function nextDate(value) {
  return new Date(Date.parse(`${value}T12:00:00.000Z`) + 86_400_000)
    .toISOString().slice(0, 10);
}
function isBusinessDay(value, calendar) {
  const weekday = new Date(`${value}T12:00:00.000Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !calendar.closedDates.includes(value);
}
function addBusinessDays(value, count, calendar) {
  let current = value;
  for (let added = 0; added < count;) {
    current = nextDate(current);
    if (current > calendar.validUntilDate) return null;
    if (isBusinessDay(current, calendar)) added += 1;
  }
  return current;
}

export function parseAdafruitShippingTermsV1(source) {
  const body = text(Buffer.isBuffer(source) ? source.toString("utf8") : source);
  const processing = /Orders usually ship within (\d+)-(\d+) business days/iu
    .exec(body);
  const cutoff = /orders placed by (\d{1,2})am ET during weekdays usually ship same day/iu
    .exec(body);
  if (processing === null || !/do not include weekends.*?US holidays/iu.test(body)) {
    fail("SHIPPING_TERMS_UNRECOGNIZED");
  }
  const transit = {};
  const ranges = [
    ["UPS Ground Saver", /UPS Ground Saver\b.{0,180}?Delivery estimates range from (\d+)-(\d+) business days once shipped/iu],
    ["UPS Ground", /UPS Ground usually arrives within (\d+)-(\d+) business days once shipped/iu],
    ["USPS Ground Advantage", /USPS Ground Advantage\b.{0,180}?Delivery estimates range from (\d+)-(\d+) business days once shipped/iu],
    ["Priority Mail", /Priority mail ususally arrives within (\d+)-(\d+) business days once shipped/iu],
  ];
  for (const [service, pattern] of ranges) {
    const match = pattern.exec(body);
    if (match) transit[service] = { minimum: Number(match[1]), maximum: Number(match[2]) };
  }
  for (const [service, word, days] of [["UPS 3 Day Select", "third", 3],
    ["UPS 2nd Day Air", "second", 2], ["UPS Next Day Air", "next", 1]]) {
    const pattern = new RegExp(`${service} arrives by the end of (?:the )?${word} business day once shipped`, "iu");
    if (pattern.test(body)) transit[service] = { minimum: days, maximum: days };
  }
  const values = [{ minimum: Number(processing[1]), maximum: Number(processing[2]) },
    ...Object.values(transit)];
  if (values.some(range => range.minimum < 0 || range.minimum > range.maximum
    || range.maximum > 30)) fail("SHIPPING_DAY_RANGE_INVALID");
  return { processingBusinessDays: values[0], transitBusinessDays: transit,
    expeditedCutoffHourET: cutoff === null ? null : Number(cutoff[1]),
    weekendDeliveryAssumed: false, sourcePromisesSameDayDispatch: false,
    estimatesMayBeExceeded: true };
}

function attributes(opening) {
  return Object.fromEntries([...opening.matchAll(
    /\b(name|id|value|for)=(?:"([^"]*)"|'([^']*)')/giu)]
    .map(match => [match[1].toLowerCase(), match[2] ?? match[3]]));
}
function serviceLabels(html) {
  const labels = new Map([...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/giu)]
    .map(match => [attributes(match[0]).for, text(match[0])]));
  const result = new Map();
  for (const match of html.matchAll(/<input\b[^>]*>/giu)) {
    const input = attributes(match[0]);
    if (input.name !== "shipping") continue;
    // The current checkout renders "USPS - Ground Advantage" while the
    // shipping terms name the same service "USPS Ground Advantage".
    const label = (labels.get(input.id) ?? "").replace(/\s+-\s+/gu, " ");
    const service = SERVICES.find(candidate => label.toLowerCase()
      .includes(candidate.toLowerCase())) ?? SERVICES.find(candidate =>
      input.value?.toLowerCase().endsWith(candidate.toLowerCase())) ?? null;
    result.set(input.value, service);
  }
  return result;
}
function validateCalendar(input) {
  if (!input || !Array.isArray(input.closedDates)
    || typeof input.sourceUrl !== "string" || typeof input.sourceText !== "string"
    || input.sourceText.length < 1) fail("CALENDAR_SOURCE_REQUIRED");
  const calendar = { ...input, validFromDate: date(input.validFromDate),
    validUntilDate: date(input.validUntilDate),
    closedDates: [...new Set(input.closedDates.map(date))].sort() };
  if (calendar.validFromDate > calendar.validUntilDate
    || calendar.closedDates.some(day => day < calendar.validFromDate
      || day > calendar.validUntilDate)) fail("CALENDAR_INTERVAL_INVALID");
  return calendar;
}

export function buildAdafruitEtaPlanningV1(input) {
  const sourceEvidence = verifyBuyerNativeRouteEvidenceV1(input.sourceRouteEvidence);
  const shippingBytes = Buffer.from(input.shippingSourceBytes);
  const step3Bytes = Buffer.from(input.step3SourceBytes);
  const step3Html = step3Bytes.toString("utf8");
  const terms = parseAdafruitShippingTermsV1(shippingBytes);
  const calendar = validateCalendar(input.calendar);
  const plannedOrderAt = instant(input.plannedOrderAt);
  const planned = localParts(plannedOrderAt);
  const completionDeadline = sourceEvidence.facts.eta.completionDeadline;
  const deadlineDate = localParts(completionDeadline).date;
  const projection = input.step3Projection;
  if (!projection || projection.sourceBytesHash !== sha(step3Bytes)
    || projection.recoveryOptionRefHash !== sourceEvidence.recoveryOptionRefHash
    || projection.acceptanceSpecRefHash
      !== sourceEvidence.facts.specification.frozenPredicateHash) {
    fail("CHECKOUT_SOURCE_BINDING_INVALID");
  }
  const rates = parseAdafruitShippingApplicationFormV9(step3Html).rates;
  const labels = serviceLabels(step3Html);
  const quoteExpired = Date.parse(plannedOrderAt) >= Date.parse(sourceEvidence.validUntil);
  const candidates = rates.map(rate => {
    const service = labels.get(rate.methodValue) ?? null;
    const transit = terms.transitBusinessDays[service] ?? null;
    const sameDayDispatchEstimate = EXPEDITED.has(service)
      && terms.expeditedCutoffHourET !== null
      && planned.hour < terms.expeditedCutoffHourET
      && isBusinessDay(planned.date, calendar);
    const processing = sameDayDispatchEstimate ? { minimum: 0, maximum: 0 }
      : terms.processingBusinessDays;
    let arrivalWindow = null;
    let missing = service === null ? "SERVICE_LABEL_UNMAPPED"
      : transit === null ? "SERVICE_TRANSIT_TERMS_UNAVAILABLE" : null;
    if (planned.date < calendar.validFromDate || planned.date > calendar.validUntilDate) {
      missing = "HOLIDAY_CALENDAR_DOES_NOT_COVER_PLAN";
    }
    if (missing === null) {
      const earliestDate = addBusinessDays(planned.date,
        processing.minimum + transit.minimum, calendar);
      const latestDate = addBusinessDays(planned.date,
        processing.maximum + transit.maximum, calendar);
      if (earliestDate === null || latestDate === null) {
        missing = "HOLIDAY_CALENDAR_DOES_NOT_COVER_ARRIVAL";
      } else arrivalWindow = { earliestDate, latestDate, timeZone: ZONE,
        processingBusinessDays: processing, transitBusinessDays: transit,
        dispatchEstimate: sameDayDispatchEstimate
          ? "USUALLY_SAME_DAY_BEFORE_WEEKDAY_CUTOFF" : "USUAL_PROCESSING_RANGE",
        estimateKind: "DERIVED_SELLER_TERM_INTERVAL", guaranteed: false };
    }
    const deadlineDisposition = arrivalWindow === null ? "UNAVAILABLE"
      : arrivalWindow.earliestDate > deadlineDate ? "TYPICAL_WINDOW_AFTER_DEADLINE"
        : arrivalWindow.latestDate > deadlineDate ? "TYPICAL_WINDOW_STRADDLES_DEADLINE"
          : "TYPICAL_WINDOW_BEFORE_DEADLINE";
    return { rateRefHash: rate.rateRefHash, service, shippingMinor: rate.amountMinor,
      selectedByProvider: rate.selectedByProvider, quoteExpired,
      fullRepricedOrderTotalProven: false, arrivalWindow, deadlineDisposition,
      missingFact: missing, deadlineTimeOfDayProven: false,
      guaranteedArrivalProven: false };
  });
  const ranked = [...candidates].sort((a, b) =>
    RANK[a.deadlineDisposition] - RANK[b.deadlineDisposition]
      || a.shippingMinor - b.shippingMinor || a.rateRefHash.localeCompare(b.rateRefHash));
  const selected = candidates.find(candidate => candidate.selectedByProvider) ?? null;
  const usefulAlternatives = ranked.filter(candidate =>
    !candidate.selectedByProvider && RANK[candidate.deadlineDisposition] < 2);
  const body = { schema: SCHEMA, schemaVersion: "1.0.0", plannedOrderAt,
    completionDeadline, deadlineDate, timeZone: ZONE,
    source: { routeEvidenceHash: sourceEvidence.evidenceHash,
      checkoutProjectionHash: projection.projectionHash,
      checkoutBytesHash: sha(step3Bytes), checkoutObservedAt: projection.observedAt,
      quoteValidUntil: sourceEvidence.validUntil,
      shippingPolicyUrl: "https://www.adafruit.com/shipping",
      shippingPolicyBytesHash: sha(shippingBytes),
      calendarSourceUrl: calendar.sourceUrl,
      calendarSourceTextHash: sha(calendar.sourceText),
      calendarValidFromDate: calendar.validFromDate,
      calendarValidUntilDate: calendar.validUntilDate,
      excludedDates: calendar.closedDates },
    sourceDateEvidence: { status: sourceEvidence.facts.eta.status,
      estimatedCompletionAt: sourceEvidence.facts.eta.estimatedCompletionAt },
    terms, planningCandidates: candidates,
    rankedRateRefs: ranked.map(candidate => candidate.rateRefHash),
    nextAction: selected?.deadlineDisposition === "TYPICAL_WINDOW_AFTER_DEADLINE"
      ? usefulAlternatives.length > 0
        ? "REQUOTE_FASTER_SERVICE_AND_REQUEST_DESTINATION_DATE"
        : "SEARCH_ANOTHER_SUPPLIER_OR_REVISE_DEADLINE"
      : "REQUEST_DESTINATION_DATE_AND_REFRESH_EXPIRED_QUOTE",
    nextActionCandidates: usefulAlternatives.map(candidate => ({
      rateRefHash: candidate.rateRefHash, service: candidate.service,
      shippingMinor: candidate.shippingMinor,
      arrivalWindow: candidate.arrivalWindow,
      deadlineDisposition: candidate.deadlineDisposition })),
    estimateUsedFor: ["COMPARE_SERVICES", "DEPRIORITIZE_LATE_ROUTES", "SELECT_NEXT_QUOTE"],
    sourceDateFabricated: false, evidenceValidityRefreshed: false,
    networkRequestCount: 0, paymentPerformed: false, orderSubmitted: false,
    capacityReserved: false, userResultCommitted: false, authority: "NONE" };
  const assessment = { ...body, assessmentHash: digest(SCHEMA, body) };
  const occurrenceHash = digest("outsider/adafruit-eta-planning-occurrence/v1", {
    assessmentHash: assessment.assessmentHash,
    priorOccurrenceRefHash: sourceEvidence.occurrenceRefHash,
  });
  const directDateAlreadyPresent = sourceEvidence.facts.eta.status === "STRUCTURED";
  const routeEvidence = directDateAlreadyPresent ? sourceEvidence
    : createBuyerNativeRouteEvidenceV1({
      routeProposalRefHash: assessment.assessmentHash,
      occurrenceRefHash: occurrenceHash,
      recoveryOptionRefHash: sourceEvidence.recoveryOptionRefHash,
      observedAt: sourceEvidence.observedAt, validUntil: sourceEvidence.validUntil,
      sourceReplayReceiptHash: assessment.assessmentHash,
      facts: { ...sourceEvidence.facts,
        eta: { ...sourceEvidence.facts.eta,
          sourceOccurrenceRefHash: occurrenceHash, estimatedCompletionAt: null,
          status: selected?.arrivalWindow ? "UNSTRUCTURED" : "UNAVAILABLE" } },
    });
  return { assessment, routeEvidence };
}

/** Choose the next quote to request, retaining the distinction between a
 * quoted order total and a service substitution estimate. This also consumes
 * already saved assessments without changing their hashes or source dates. */
export function selectAdafruitEtaNextActionV1({ assessment, sourceRouteEvidence,
  maximumAmountMinor }) {
  const evidence = verifyBuyerNativeRouteEvidenceV1(sourceRouteEvidence);
  const { assessmentHash, ...body } = assessment ?? {};
  if (body.schema !== SCHEMA || digest(SCHEMA, body) !== assessmentHash
    || body.source?.routeEvidenceHash !== evidence.evidenceHash
    || body.completionDeadline !== evidence.facts.eta.completionDeadline
    || !Array.isArray(body.planningCandidates)) fail("ASSESSMENT_SOURCE_BINDING_INVALID");
  if (typeof maximumAmountMinor !== "string"
    || !/^(0|[1-9][0-9]{0,14})$/u.test(maximumAmountMinor)) fail("PLANNING_BUDGET_INVALID");
  const maximum = Number(maximumAmountMinor);
  const selected = body.planningCandidates.find(row => row.selectedByProvider);
  if (!selected || body.planningCandidates.filter(row => row.selectedByProvider).length !== 1
    || body.planningCandidates.some(row => !Number.isSafeInteger(row.shippingMinor)
      || row.shippingMinor < 0 || !Object.hasOwn(RANK, row.deadlineDisposition))) {
    fail("PLANNING_RATES_INVALID");
  }
  const price = evidence.facts.allInPrice;
  const total = price.status === "COMPLETE" ? price.allInMinorUnits : null;
  const nonShipping = total === null ? null : total - selected.shippingMinor;
  if (nonShipping !== null && nonShipping < 0) fail("PLANNING_TOTAL_INVALID");
  const candidates = body.planningCandidates.map(row => {
    const estimate = nonShipping === null ? null : nonShipping + row.shippingMinor;
    return { service: row.service, rateRefHash: row.rateRefHash,
      selectedByProvider: row.selectedByProvider, shippingMinor: row.shippingMinor,
      estimatedOrderTotalMinor: estimate,
      budgetDisposition: row.shippingMinor > maximum ? "SHIPPING_QUOTE_EXCEEDS_TOTAL_BUDGET"
        : estimate === null ? "ALL_IN_REQUOTE_REQUIRED"
          : estimate > maximum ? "REPRICING_ESTIMATE_OVER_BUDGET"
            : "REQUOTE_WITHIN_PLANNING_BUDGET",
      arrivalWindow: row.arrivalWindow, deadlineDisposition: row.deadlineDisposition,
      quoteExpired: row.quoteExpired,
      allInRepricingRequired: true, guaranteedArrivalProven: false };
  });
  const withinBudget = candidates.filter(row =>
    row.budgetDisposition === "REQUOTE_WITHIN_PLANNING_BUDGET");
  const order = (a, b) => RANK[a.deadlineDisposition] - RANK[b.deadlineDisposition]
    || a.estimatedOrderTotalMinor - b.estimatedOrderTotalMinor
    || a.rateRefHash.localeCompare(b.rateRefHash);
  const before = withinBudget.filter(row =>
    row.deadlineDisposition === "TYPICAL_WINDOW_BEFORE_DEADLINE").sort(order);
  const uncertain = withinBudget.filter(row =>
    row.deadlineDisposition === "TYPICAL_WINDOW_STRADDLES_DEADLINE").sort(order);
  const selectedQuote = before[0] ?? uncertain[0] ?? null;
  const nextActions = before.length > 0
    ? ["REQUOTE_DEADLINE_FEASIBLE_SERVICE_WITHIN_BUDGET", "ACQUIRE_STRUCTURED_DESTINATION_ETA"]
    : ["SEARCH_DEADLINE_FEASIBLE_SUPPLIER_WITHIN_BUDGET",
      ...(uncertain.length > 0 ? ["REQUEST_DESTINATION_DATE_FOR_BUDGET_FEASIBLE_SERVICE"] : []),
      ...(nonShipping === null ? ["ACQUIRE_SELLER_FINAL_ALL_IN_TOTAL"] : [])];
  return { assessmentHash, sourceRouteEvidenceHash: evidence.evidenceHash,
    plannedOrderAt: body.plannedOrderAt, currency: price.currency,
    maximumAmountMinor, observedCurrentTotalMinor: total,
    sourceObservedAt: evidence.observedAt, sourceValidUntil: evidence.validUntil,
    estimateBasis: "OBSERVED_TOTAL_MINUS_SELECTED_SHIPPING_PLUS_CANDIDATE_SHIPPING",
    repricingMayChangeTaxFeesDiscountsAndAvailability: true,
    selectedQuote, candidates, nextActions,
    searchAnotherSupplierInParallel: before.length === 0,
    selectedQuoteMeetsTypicalDeadlineWindow: before.length > 0,
    decisionEffect: "NEXT_QUOTE_AND_SOURCE_DISCOVERY_ONLY",
    establishesStructuredEta: false, establishesCapacity: false,
    authorizesPayment: false, createsCommitment: false };
}
