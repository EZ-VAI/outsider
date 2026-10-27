#!/usr/bin/env node
/* Convert saved quote bytes into the existing seller-neutral evidence shape. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import { createBuyerNativeRouteEvidenceV1, verifyBuyerNativeRouteEvidenceV1 }
  from "../src/outsider-buyer-native-route-evidence-v1.js";
import { parseAdafruitPrepaymentSummaryV10 }
  from "./outsider-adafruit-shipping-reconciliation-live-runner-v10.mjs";

const sha = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const digest = (domain, value) => sha(`${domain}\0${canonicalizeStrict(value)}`);
const fail = code => { throw new TypeError(`ADAFRUIT_CURRENT_QUOTE_EVIDENCE_${code}`); };

export function convertAdafruitShippingQuoteEvidence({ resultSourceBytes,
  step4SourceBytes, priorRouteEvidence, localFreshnessMs = 30 * 60 * 1000 }) {
  const result = JSON.parse(Buffer.from(resultSourceBytes).toString("utf8"));
  const prior = verifyBuyerNativeRouteEvidenceV1(priorRouteEvidence);
  const current = result.exchanges?.at(-1);
  if (result.state !== "ALL_IN_QUOTE_OBSERVED" || result.service !== "USPS Ground Advantage"
    || result.paymentPerformed !== false || result.orderSubmitted !== false
    || result.capacityReserved !== false || result.userResultCommitted !== false
    || result.counts?.postRequests !== 1 || result.counts?.paymentSubmissions !== 0
    || result.counts?.orderSubmissions !== 0 || current?.method !== "GET"
    || current?.url !== "https://www.adafruit.com/checkout?step=4" || current.status !== 200
    || current.body?.bytesHash !== sha(step4SourceBytes)
    || current.body?.bytes !== step4SourceBytes.length) fail("SOURCE_BINDING_INVALID");
  if (!Number.isSafeInteger(localFreshnessMs) || localFreshnessMs < 1
    || localFreshnessMs > 30 * 60 * 1000
    || new Date(result.observedAt).toISOString() !== result.observedAt) fail("LOCAL_FRESHNESS_INVALID");
  const summary = parseAdafruitPrepaymentSummaryV10(Buffer.from(step4SourceBytes).toString("utf8"),
    prior.facts.eta.completionDeadline, result.shippingMinor, result.service);
  if (canonicalizeStrict(summary) !== canonicalizeStrict(result.summary)
    || !summary.allInTotalProven || summary.structuredEtaObserved) fail("SUMMARY_REPLAY_MISMATCH");
  const validUntil = new Date(Date.parse(result.observedAt) + localFreshnessMs).toISOString();
  const occurrenceRefHash = digest("outsider/adafruit-current-shipping-quote-occurrence", {
    resultSourceBytesHash: sha(resultSourceBytes), step4SourceBytesHash: sha(step4SourceBytes),
    observedAt: result.observedAt,
  });
  const body = { schema: "outsider/adafruit-shipping-quote-evidence-replay",
    observedAt: result.observedAt, occurrenceRefHash,
    resultSourceBytesHash: sha(resultSourceBytes), step4SourceBytesHash: sha(step4SourceBytes),
    step4SourceBytes: step4SourceBytes.length, priorRouteEvidenceHash: prior.evidenceHash,
    specificationProvenance: { sourceOccurrenceRefHash: prior.facts.specification.sourceOccurrenceRefHash,
      originalObservedAt: prior.observedAt, originalValidUntil: prior.validUntil,
      inheritedPriorObservation: true, reobservedInCurrentCheckout: false,
      validityRefreshed: false },
    freshness: { validUntil, localFreshnessMs, basis: "LOCAL_OBSERVATION_RECHECK_POLICY",
      sellerGuaranteedPriceValidity: false,
      appliesTo: ["CURRENT_CHECKOUT_PRICE_OBSERVATION"],
      inheritedSpecificationValidityExtended: false },
    allInMinorUnits: summary.allInTotalMinor, shippingMinor: summary.shippingMinor,
    etaStatus: "UNAVAILABLE", capacityStatus: "UNRESERVED",
    networkRequests: 0, paymentPerformed: false, orderSubmitted: false };
  const replay = { ...body, replayHash: digest(body.schema, body) };
  const routeEvidence = createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: replay.replayHash, occurrenceRefHash,
    recoveryOptionRefHash: prior.recoveryOptionRefHash,
    observedAt: result.observedAt, validUntil, sourceReplayReceiptHash: replay.replayHash,
    facts: {
      specification: prior.facts.specification,
      allInPrice: { ...prior.facts.allInPrice, sourceOccurrenceRefHash: occurrenceRefHash,
        allInMinorUnits: summary.allInTotalMinor, includesItemTaxShippingAndFees: true,
        status: "COMPLETE" },
      eta: { sourceOccurrenceRefHash: occurrenceRefHash,
        completionDeadline: prior.facts.eta.completionDeadline,
        estimatedCompletionAt: null, status: "UNAVAILABLE" },
      capacity: { sourceOccurrenceRefHash: occurrenceRefHash, capacityLifecycleRefHash: null,
        capacityLifecycleHeadHash: null, reservedFrom: null, reservedUntil: null,
        status: "UNRESERVED", sourceClass: "SELLER_SERVER_ACK_ONLY" },
    },
  });
  return { replay, routeEvidence };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [runDirectory, priorEvidenceFile, outputDirectory] = process.argv.slice(2);
  const output = path.resolve(outputDirectory);
  if (existsSync(output)) fail("OUTPUT_ALREADY_EXISTS");
  const resultBytes = readFileSync(path.join(runDirectory, "result.json"));
  const last = JSON.parse(resultBytes).exchanges.at(-1);
  if (path.basename(last.body.file) !== last.body.file) fail("SOURCE_PATH_INVALID");
  const converted = convertAdafruitShippingQuoteEvidence({ resultSourceBytes: resultBytes,
    step4SourceBytes: readFileSync(path.join(runDirectory, last.body.file)),
    priorRouteEvidence: JSON.parse(readFileSync(priorEvidenceFile)) });
  mkdirSync(output, { recursive: true, mode: 0o700 });
  for (const [name, value] of [["replay.json", converted.replay],
    ["route-evidence.v1.json", converted.routeEvidence]]) {
    writeFileSync(path.join(output, name), `${canonicalizeStrict(value)}\n`, { mode: 0o600, flag: "wx" });
  }
  process.stdout.write(`${canonicalizeStrict({ outputDirectory: output,
    evidenceHash: converted.routeEvidence.evidenceHash, replayHash: converted.replay.replayHash,
    allInMinorUnits: converted.replay.allInMinorUnits,
    observedAt: converted.replay.observedAt, validUntil: converted.replay.freshness.validUntil,
    freshnessBasis: converted.replay.freshness.basis,
    specificationInherited: true, networkRequests: 0 })}\n`);
}
