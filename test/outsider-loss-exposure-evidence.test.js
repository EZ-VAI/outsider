import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  appendLossExposureQuarantine,
  buildLossExposureQuarantine,
  buildLossExposureShadowBook,
  lossExposurePublicKeyId,
  signLossExposureAdjudication,
  signLossExposureFraudReview,
  signLossExposureObservation,
  verifyLossExposureAdjudication,
  verifyLossExposureObservation,
  verifyLossExposureQuarantine,
  verifyLossExposureShadowBook,
} from "../src/outsider-loss-exposure-evidence.js";

const AT = "2026-08-20T00:00:00.000Z";

function hash(label) {
  return `sha256:${createHash("sha256").update(String(label)).digest("hex")}`;
}

function domainHash(domain, value) {
  return `sha256:${createHash("sha256")
    .update(canonicalizeStrict({ domain, value })).digest("hex")}`;
}

function keys(label, { domain = `domain:${label}`, control = `control:${label}` } = {}) {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    keyId: lossExposurePublicKeyId(publicKeyPem), publicKeyPem, privateKeyPem,
    domainRootHash: hash(domain), controlRootHash: hash(control),
  };
}

function trustEntry(key) {
  return { publicKeyPem: key.publicKeyPem, domainRootHash: key.domainRootHash,
    controlRootHash: key.controlRootHash, conformanceOnly: true,
    policyVersionHash: hash(`trust-policy:${key.keyId}`),
    validFrom: "2026-01-01T00:00:00.000Z",
    validUntil: "2027-01-01T00:00:00.000Z",
    revokedAt: null };
}

function environment() {
  const operator = keys("operator");
  const adjudicator = keys("adjudicator");
  const reviewer = keys("fraud-reviewer");
  return {
    operator, adjudicator, reviewer,
    trustStore: {
      operators: { [operator.keyId]: trustEntry(operator) },
      adjudicators: { [adjudicator.keyId]: trustEntry(adjudicator) },
      fraudReviewers: { [reviewer.keyId]: trustEntry(reviewer) },
    },
  };
}

function incident(id = "incident-1", overrides = {}) {
  return {
    incidentIdHash: hash(id),
    claimIdHash: hash(`claim:${id}`),
    occurredAt: "2026-08-19T02:00:00.000Z",
    currency: "USD",
    grossAmountMinorUnits: 12_500,
    recoveryAmountMinorUnits: 2_500,
    economicLossBasis: "CLAIM_PAID",
    lossEvidenceHashes: [hash(`loss-proof:${id}`)],
    ...overrides,
  };
}

function observationPayload(operator, id, {
  startAt = "2026-08-19T01:00:00.000Z",
  endAt = "2026-08-19T03:00:00.000Z",
  reportedIncidents = [],
  population = "population-a",
  currency = "USD",
  sourceClass = "PROSPECTIVE_DESIGN_PARTNER",
  sourceRecord = `record:${id}`,
  observedAt = "2026-08-19T03:10:00.000Z",
  overrides = {},
} = {}) {
  const systemRootHash = hash("system-a");
  return {
    sourceClass,
    sourceRecordIdHash: hash(sourceRecord),
    operatorDomainRootHash: operator.domainRootHash,
    operatorControlRootHash: operator.controlRootHash,
    systemRootHash,
    instrumentHash: hash("instrument-v1"),
    policyHash: hash("policy-v1"),
    assignmentAt: "2026-08-19T00:30:00.000Z",
    observedAt,
    window: {
      windowIdHash: hash(`window:${id}`),
      populationRootHash: hash(population),
      populationManifestHash: hash(`manifest:${id}`),
      startAt,
      endAt,
      status: "CLOSED",
      exposureUnit: "RUN",
      unitDefinitionHash: hash("run-unit-v1"),
      quantityMicrounits: 1_000_000,
      reportingCurrency: currency,
    },
    reportedIncidents,
    provenance: {
      sourceSystemHash: hash("partner-ledger"),
      collectionMethodHash: hash("signed-export-v1"),
      sourceEvidenceHashes: [hash(`source:${id}`)],
      licenseStatus: "VERIFIED",
      licenseEvidenceHash: hash("data-license"),
      researchUsePermitted: true,
      pricingUsePermitted: false,
      piiIncluded: false,
      rawPayloadRetainedByOutsider: false,
    },
    correlationRoots: [operator.domainRootHash, operator.controlRootHash, systemRootHash].sort(),
    claimBoundary: {
      automaticTraining: false,
      benchmarkSpendUsedAsLoss: false,
      droidOrHistoricalRobotCorpusUsedAsLoss: false,
      estimatedDamageUsedAsLoss: false,
      failedAttemptCostUsedAsLoss: false,
      modelTokenCostUsedAsLoss: false,
      robotRewardUsedAsLoss: false,
    },
    ...overrides,
  };
}

function signObservation(operator, id, options = {}) {
  return signLossExposureObservation(observationPayload(operator, id, options),
    { privateKeyPem: operator.privateKeyPem });
}

function commitments(payload) {
  return {
    windowCommitmentHash: domainHash("outsider/loss-exposure-window-commitment/v1",
      payload.window),
    claimSetHash: domainHash("outsider/loss-exposure-claim-set/v1",
      payload.reportedIncidents.map((item) => ({ incidentIdHash: item.incidentIdHash,
        claimIdHash: item.claimIdHash }))),
  };
}

function adjudicate(entry, env, {
  disposition = entry.observationEnvelope.payload.reportedIncidents.length
    ? "LOSS_CONFIRMED" : "NO_LOSS",
  finalIncidents = entry.observationEnvelope.payload.reportedIncidents,
  fraudStatus = "CLEAR",
  adjudicationStatus = "FINAL",
  appealStatus = "NONE",
  flags = {},
  adjudicator = env.adjudicator,
  reviewer = env.reviewer,
} = {}) {
  const source = entry.observationEnvelope.payload;
  const observed = Date.parse(source.observedAt);
  const reviewedAt = new Date(observed + 60 * 60 * 1000).toISOString();
  const adjudicatedAt = new Date(observed + 2 * 60 * 60 * 1000).toISOString();
  const bound = commitments(source);
  const fraudReview = signLossExposureFraudReview({
    quarantineEntryHash: entry.entryHash,
    sourceObservationHash: entry.sourceObservationHash,
    ...bound,
    policyHash: source.policyHash,
    reviewerDomainRootHash: reviewer.domainRootHash,
    reviewerControlRootHash: reviewer.controlRootHash,
    completedAt: reviewedAt,
    status: fraudStatus,
    evidenceHashes: [hash(`fraud-review:${entry.entryHash}`)],
  }, { privateKeyPem: reviewer.privateKeyPem });
  return signLossExposureAdjudication({
    quarantineEntryHash: entry.entryHash,
    sourceObservationHash: entry.sourceObservationHash,
    ...bound,
    policyHash: source.policyHash,
    adjudicatorDomainRootHash: adjudicator.domainRootHash,
    adjudicatorControlRootHash: adjudicator.controlRootHash,
    adjudicatedAt,
    status: adjudicationStatus,
    disposition,
    observationWindowClosed: flags.observationWindowClosed ?? true,
    exposureVerified: flags.exposureVerified ?? true,
    populationCompletenessVerified: flags.populationCompletenessVerified ?? true,
    finalIncidents,
    adjudicationEvidenceHashes: [hash(`adjudication:${entry.entryHash}`)],
    fraudReviewHash: fraudReview.fraudReviewHash,
    appealStatus,
    authority: { movesFunds: false, permitsCapital: false, permitsCoverage: false,
      permitsPricing: false, permitsSettlement: false },
  }, { privateKeyPem: adjudicator.privateKeyPem, fraudReview });
}

test("builds a correlation-safe research book with zero-loss denominator and observed loss", () => {
  const env = environment();
  const zero = signObservation(env.operator, "zero");
  const loss = signObservation(env.operator, "loss", {
    startAt: "2026-08-19T06:00:00.000Z",
    endAt: "2026-08-19T08:00:00.000Z",
    observedAt: "2026-08-19T08:10:00.000Z",
    reportedIncidents: [incident("incident-2", { occurredAt: "2026-08-19T07:00:00.000Z" })],
  });
  const quarantine = buildLossExposureQuarantine([zero, loss], {
    trustStore: env.trustStore, createdAt: AT,
  });
  assert.deepEqual(quarantine.counts, { input: 2, quarantined: 2, duplicates: 0,
    rejected: 0, zeroLossWindows: 1 });
  assert.equal(verifyLossExposureQuarantine(quarantine,
    { trustStore: env.trustStore, now: AT }).ok, true);
  const adjudications = quarantine.entries.map((entry) => adjudicate(entry, env));
  const book = buildLossExposureShadowBook({ quarantine, adjudications,
    trustStore: env.trustStore, generatedAt: AT });
  assert.equal(book.counts.researchRows, 2);
  assert.equal(book.counts.zeroLossWindows, 1);
  assert.equal(book.counts.confirmedIncidents, 1);
  assert.equal(book.correlation.connectedComponents.length, 1,
    "a shared operator/control/domain remains one dependence component");
  assert.equal(book.modelCells.length, 1);
  assert.deepEqual(book.modelCells[0].betaBinomialSufficientStatistics, {
    trials: 2, incidentWindows: 1, priorAlpha: null, priorBeta: null, posterior: null,
  });
  assert.equal(book.modelCells[0].tvarSeverityInput.samples[0].netAmountMinorUnits, 10_000);
  assert.equal(book.modelCells[0].tvarSeverityInput.estimate, null);
  assert.equal(book.modelEntrance.decision, "ABSTAIN_NO_EXTERNALLY_GOVERNED_L3_L4");
  assert.equal(book.modelEntrance.externallyGovernedL3L4Rows, 0);
  assert.equal(book.authority.permitsPricing, false);
  assert.equal(verifyLossExposureShadowBook(book, { quarantine, adjudications,
    trustStore: env.trustStore, now: AT }).ok, true);
});

test("benchmark and proxy-cost sources cannot become loss observations", () => {
  const env = environment();
  assert.throws(() => signObservation(env.operator, "benchmark", {
    sourceClass: "BENCHMARK_COST",
  }), /SOURCE_CLASS_NOT_ADMISSIBLE/);
  const payload = observationPayload(env.operator, "token-cost", {
    reportedIncidents: [incident("token-cost")],
  });
  payload.claimBoundary.modelTokenCostUsedAsLoss = true;
  assert.throws(() => signLossExposureObservation(payload,
    { privateKeyPem: env.operator.privateKeyPem }), /PROHIBITED_PROXY_LOSS/);
  for (const field of ["benchmarkSpendUsedAsLoss", "failedAttemptCostUsedAsLoss",
    "robotRewardUsedAsLoss", "estimatedDamageUsedAsLoss",
    "droidOrHistoricalRobotCorpusUsedAsLoss"]) {
    const candidate = observationPayload(env.operator, `proxy:${field}`, {
      reportedIncidents: [incident(`proxy:${field}`)],
    });
    candidate.claimBoundary[field] = true;
    assert.throws(() => signLossExposureObservation(candidate,
      { privateKeyPem: env.operator.privateKeyPem }), /PROHIBITED_PROXY_LOSS/);
  }
});

test("requires complete, positive exposure denominators and canonical economic amounts", () => {
  const env = environment();
  for (const mutate of [
    (payload) => { payload.window.status = "OPEN"; },
    (payload) => { payload.window.quantityMicrounits = 0; },
    (payload) => { delete payload.window.populationManifestHash; },
    (payload) => { payload.window.endAt = payload.window.startAt; },
  ]) {
    const payload = observationPayload(env.operator, hash(String(mutate)));
    mutate(payload);
    assert.throws(() => signLossExposureObservation(payload,
      { privateKeyPem: env.operator.privateKeyPem }));
  }
  for (const bad of [
    { grossAmountMinorUnits: 0 },
    { grossAmountMinorUnits: -1 },
    { grossAmountMinorUnits: 10, recoveryAmountMinorUnits: 11 },
    { grossAmountMinorUnits: Number.NaN },
    { currency: "USDX" },
    { economicLossBasis: "ESTIMATED_DAMAGE" },
    { occurredAt: "2026-08-19T09:00:00.000Z" },
  ]) {
    assert.throws(() => signObservation(env.operator, hash(JSON.stringify(bad)), {
      reportedIncidents: [incident("bad", bad)],
    }));
  }
});

test("discloses signature-independent duplicates and rejects resealed semantic windows", () => {
  const env = environment();
  const secondKey = keys("operator-second-key", {
    domain: "domain:operator", control: "control:operator",
  });
  env.trustStore.operators[secondKey.keyId] = trustEntry(secondKey);
  const payload = observationPayload(env.operator, "same-window");
  const first = signLossExposureObservation(payload,
    { privateKeyPem: env.operator.privateKeyPem });
  const resigned = signLossExposureObservation(payload,
    { privateKeyPem: secondKey.privateKeyPem });
  assert.equal(first.sourceObservationHash, resigned.sourceObservationHash);
  const changedPayload = structuredClone(payload);
  changedPayload.sourceRecordIdHash = hash("changed-source-record");
  const resealedConflict = signLossExposureObservation(changedPayload,
    { privateKeyPem: secondKey.privateKeyPem });
  const quarantine = buildLossExposureQuarantine([first, resigned, resealedConflict], {
    trustStore: env.trustStore, createdAt: AT,
  });
  assert.equal(quarantine.entries.length, 1);
  assert.equal(quarantine.duplicates.length, 1);
  assert.deepEqual(quarantine.rejected[0].reasonCodes,
    ["SEMANTIC_WINDOW_RESEALED_OR_CONFLICTING"]);
});

test("cross-operator re-signing cannot change the identity of a window or incident", () => {
  const env = environment();
  const otherOperator = keys("other-operator");
  env.trustStore.operators[otherOperator.keyId] = trustEntry(otherOperator);
  const first = signObservation(env.operator, "cross-operator-window", {
    reportedIncidents: [incident("cross-operator-fact")],
  });
  const sameWindowPayload = observationPayload(otherOperator, "cross-operator-window", {
    sourceRecord: "different-signature-and-source-record",
    reportedIncidents: [incident("other-fact")],
  });
  const sameWindow = signLossExposureObservation(sameWindowPayload,
    { privateKeyPem: otherOperator.privateKeyPem });
  const repeatedFact = signObservation(otherOperator, "other-window", {
    startAt: "2026-08-19T06:00:00.000Z",
    endAt: "2026-08-19T08:00:00.000Z",
    observedAt: "2026-08-19T08:10:00.000Z",
    reportedIncidents: [incident("cross-operator-fact", {
      occurredAt: "2026-08-19T07:00:00.000Z",
    })],
  });
  const quarantine = buildLossExposureQuarantine([first, sameWindow, repeatedFact], {
    trustStore: env.trustStore, createdAt: AT,
  });
  assert.equal(quarantine.entries.length, 1);
  assert.deepEqual(quarantine.rejected.map((item) => item.reasonCodes[0]), [
    "SEMANTIC_WINDOW_RESEALED_OR_CONFLICTING",
    "SEMANTIC_INCIDENT_OR_CLAIM_REUSED",
  ]);
});

test("rejects overlapping windows and repeated economic facts", () => {
  const env = environment();
  const base = signObservation(env.operator, "base", {
    reportedIncidents: [incident("economic-fact")],
  });
  const overlap = signObservation(env.operator, "overlap", {
    startAt: "2026-08-19T02:30:00.000Z",
    endAt: "2026-08-19T04:00:00.000Z",
    observedAt: "2026-08-19T04:10:00.000Z",
  });
  const repeatedFact = signObservation(env.operator, "later", {
    startAt: "2026-08-19T06:00:00.000Z",
    endAt: "2026-08-19T08:00:00.000Z",
    observedAt: "2026-08-19T08:10:00.000Z",
    reportedIncidents: [incident("economic-fact", {
      occurredAt: "2026-08-19T07:00:00.000Z",
    })],
  });
  const quarantine = buildLossExposureQuarantine([base, overlap, repeatedFact], {
    trustStore: env.trustStore, createdAt: AT,
  });
  assert.equal(quarantine.entries.length, 1);
  assert.deepEqual(quarantine.rejected.map((item) => item.reasonCodes[0]), [
    "OVERLAPPING_EXPOSURE_WINDOW_FOR_SAME_POPULATION",
    "SEMANTIC_INCIDENT_OR_CLAIM_REUSED",
  ]);
});

test("same-party keys or common control roots cannot impersonate independent review", () => {
  const env = environment();
  const observation = signObservation(env.operator, "independence");
  const quarantine = buildLossExposureQuarantine([observation], {
    trustStore: env.trustStore, createdAt: AT,
  });
  const sameControlAdjudicator = keys("adjudicator-same-control", {
    domain: "domain:other", control: "control:operator",
  });
  env.trustStore.adjudicators[sameControlAdjudicator.keyId]
    = trustEntry(sameControlAdjudicator);
  const bad = adjudicate(quarantine.entries[0], env, {
    adjudicator: sameControlAdjudicator,
  });
  const checked = verifyLossExposureAdjudication(bad, { trustStore: env.trustStore,
    quarantineEntry: quarantine.entries[0], now: AT });
  assert.equal(checked.ok, false);
  assert.ok(checked.failures.includes("REVIEW_PARTY_CONTROL_ROOTS_NOT_DISTINCT"));
});

test("pending fraud, partial windows, appeals, and conflicting adjudications never enter the book", () => {
  const env = environment();
  const observation = signObservation(env.operator, "pending");
  const quarantine = buildLossExposureQuarantine([observation], {
    trustStore: env.trustStore, createdAt: AT,
  });
  const entry = quarantine.entries[0];
  for (const candidate of [
    adjudicate(entry, env, { fraudStatus: "PENDING" }),
    adjudicate(entry, env, { adjudicationStatus: "PROVISIONAL" }),
    adjudicate(entry, env, { appealStatus: "PENDING" }),
    adjudicate(entry, env, { flags: { populationCompletenessVerified: false } }),
  ]) {
    const book = buildLossExposureShadowBook({ quarantine, adjudications: [candidate],
      trustStore: env.trustStore, generatedAt: AT });
    assert.equal(book.counts.researchRows, 0);
    assert.equal(book.counts.pendingWindows, 1);
    assert.equal(book.modelEntrance.decision, "ABSTAIN_NO_EXTERNALLY_GOVERNED_L3_L4");
  }
  const first = adjudicate(entry, env);
  const second = adjudicate(entry, env, { appealStatus: "EXHAUSTED" });
  const conflicted = buildLossExposureShadowBook({ quarantine,
    adjudications: [first, second], trustStore: env.trustStore, generatedAt: AT });
  assert.equal(conflicted.counts.researchRows, 0);
  assert.equal(conflicted.counts.conflictingAdjudications, 1);
});

test("currency cells remain separate and no conversion is fabricated", () => {
  const env = environment();
  const usd = signObservation(env.operator, "usd");
  const eur = signObservation(env.operator, "eur", {
    startAt: "2026-08-19T06:00:00.000Z",
    endAt: "2026-08-19T08:00:00.000Z",
    observedAt: "2026-08-19T08:10:00.000Z",
    currency: "EUR",
    reportedIncidents: [incident("eur-loss", { occurredAt: "2026-08-19T07:00:00.000Z",
      currency: "EUR" })],
  });
  const quarantine = buildLossExposureQuarantine([usd, eur], {
    trustStore: env.trustStore, createdAt: AT,
  });
  const adjudications = quarantine.entries.map((entry) => adjudicate(entry, env));
  const book = buildLossExposureShadowBook({ quarantine, adjudications,
    trustStore: env.trustStore, generatedAt: AT });
  assert.deepEqual(book.modelCells.map((cell) => cell.key.reportingCurrency).sort(),
    ["EUR", "USD"]);
  assert.equal(book.claimBoundary.currencyConversionPerformed, false);
});

test("tampering cannot turn the shadow book into PRICE or L3/L4 evidence", () => {
  const env = environment();
  const observation = signObservation(env.operator, "tamper");
  const quarantine = buildLossExposureQuarantine([observation], {
    trustStore: env.trustStore, createdAt: AT,
  });
  const adjudications = [adjudicate(quarantine.entries[0], env)];
  const book = buildLossExposureShadowBook({ quarantine, adjudications,
    trustStore: env.trustStore, generatedAt: AT });
  for (const mutate of [
    (copy) => { copy.authority.permitsPricing = true; },
    (copy) => { copy.modelEntrance.externallyGovernedL3L4Rows = 1; },
    (copy) => { copy.modelEntrance.price = 10; },
    (copy) => { copy.claimBoundary.localAllowlistProvesExternalGovernance = true; },
  ]) {
    const copy = structuredClone(book);
    mutate(copy);
    const { bookHash: ignored, ...body } = copy;
    void ignored;
    copy.bookHash = domainHash("outsider/loss-exposure-shadow-book/v1", body);
    assert.equal(verifyLossExposureShadowBook(copy, { quarantine, adjudications,
      trustStore: env.trustStore, now: AT }).ok, false);
  }
});

test("cumulative generations enforce cross-batch semantic dedup and append-only prefixes", () => {
  const env = environment();
  const first = signObservation(env.operator, "cumulative-a");
  const generation1 = buildLossExposureQuarantine([first], {
    trustStore: env.trustStore, createdAt: "2026-08-19T12:00:00.000Z",
  });
  const otherOperator = keys("cumulative-other-operator");
  env.trustStore.operators[otherOperator.keyId] = trustEntry(otherOperator);
  const sameWindow = signObservation(otherOperator, "cumulative-a", {
    sourceRecord: "cumulative-resealed-cross-batch",
  });
  const newWindow = signObservation(env.operator, "cumulative-b", {
    startAt: "2026-08-19T06:00:00.000Z",
    endAt: "2026-08-19T08:00:00.000Z",
    observedAt: "2026-08-19T08:10:00.000Z",
    reportedIncidents: [incident("cumulative-loss", {
      occurredAt: "2026-08-19T07:00:00.000Z",
    })],
  });
  const generation2 = appendLossExposureQuarantine(generation1,
    [sameWindow, newWindow], { trustStore: env.trustStore, createdAt: AT });
  assert.equal(generation2.generation, 2);
  assert.equal(generation2.previousQuarantineHash, generation1.quarantineHash);
  assert.equal(generation2.entries.length, 2);
  assert.equal(generation2.rejected.length, 1);
  assert.deepEqual(generation2.rejected[0].reasonCodes,
    ["SEMANTIC_WINDOW_RESEALED_OR_CONFLICTING"]);
  assert.equal(verifyLossExposureQuarantine(generation2, {
    trustStore: env.trustStore, now: AT, previousQuarantine: generation1,
  }).ok, true);
  assert.equal(verifyLossExposureQuarantine(generation2, {
    trustStore: env.trustStore, now: AT,
  }).ok, false, "a cumulative generation cannot self-assert its missing lineage");
  const adjudications = generation2.entries.map((entry) => adjudicate(entry, env));
  const legitimateBook = buildLossExposureShadowBook({ quarantine: generation2,
    quarantineLineage: [generation1], adjudications, trustStore: env.trustStore,
    generatedAt: AT });
  assert.equal(legitimateBook.counts.zeroLossWindows, 1);
  assert.equal(legitimateBook.counts.confirmedLossWindows, 1);
  assert.equal(verifyLossExposureShadowBook(legitimateBook, { quarantine: generation2,
    quarantineLineage: [generation1], adjudications, trustStore: env.trustStore,
    now: AT }).ok, true);

  const truncated = structuredClone(generation2);
  truncated.entries = [structuredClone(generation2.entries[1])];
  truncated.entries[0].ordinal = 1;
  truncated.entries[0].previousEntryHash = truncated.genesisHash;
  const { entryHash: ignoredEntryHash, ...entryBody } = truncated.entries[0];
  void ignoredEntryHash;
  truncated.entries[0].entryHash = domainHash(
    "outsider/loss-exposure-quarantine-entry/v1", entryBody);
  truncated.duplicates = [];
  truncated.rejected = [];
  truncated.counts = { input: 1, quarantined: 1, duplicates: 0, rejected: 0,
    zeroLossWindows: 0 };
  const { quarantineHash: ignoredQuarantineHash, ...truncatedBody } = truncated;
  void ignoredQuarantineHash;
  truncated.quarantineHash = domainHash("outsider/loss-exposure-quarantine/v1",
    truncatedBody);
  assert.equal(verifyLossExposureQuarantine(truncated, {
    trustStore: env.trustStore, now: AT,
  }).ok, false, "truncated denominator cannot verify without full lineage");
  const maliciousAdjudication = adjudicate(truncated.entries[0], env);
  assert.throws(() => buildLossExposureShadowBook({ quarantine: truncated,
    adjudications: [maliciousAdjudication], trustStore: env.trustStore,
    generatedAt: AT }), /COMPLETE_LINEAGE_REQUIRED/);
  const tampered = structuredClone(generation2);
  tampered.entries[0].sourceObservationHash = hash("changed-history");
  assert.equal(verifyLossExposureQuarantine(tampered, {
    trustStore: env.trustStore, now: AT, previousQuarantine: generation1,
  }).ok, false);
});

test("trust-policy validity and effective revocation times are enforced", () => {
  const env = environment();
  const observation = signObservation(env.operator, "revoked");
  env.trustStore.operators[env.operator.keyId].revokedAt = "2026-08-19T03:05:00.000Z";
  const checked = verifyLossExposureObservation(observation,
    { trustStore: env.trustStore, now: AT });
  assert.equal(checked.ok, false);
  assert.ok(checked.failures.includes("OPERATORS_TRUST_REVOKED"));
});

test("private keys cannot be smuggled into the trust store", () => {
  const env = environment();
  const observation = signObservation(env.operator, "private-key");
  env.trustStore.operators[env.operator.keyId].publicKeyPem = env.operator.privateKeyPem;
  const checked = verifyLossExposureObservation(observation,
    { trustStore: env.trustStore, now: AT });
  assert.equal(checked.ok, false);
  assert.ok(checked.failures.some((failure) => failure.includes("TRUST_ENTRY_INVALID")));
});

test("evidence arrays are bounded and aggregate safe-integer overflow fails closed", () => {
  const env = environment();
  const tooManyRoots = observationPayload(env.operator, "too-many-roots");
  tooManyRoots.correlationRoots = [...new Set([
    env.operator.domainRootHash, env.operator.controlRootHash, hash("system-a"),
    ...Array.from({ length: 129 }, (_, index) => hash(`root:${index}`)),
  ])].sort();
  assert.throws(() => signLossExposureObservation(tooManyRoots,
    { privateKeyPem: env.operator.privateKeyPem }), /CORRELATION_ROOTS_INVALID/);

  const firstPayload = observationPayload(env.operator, "overflow-a", {
    population: "population-overflow-a",
  });
  firstPayload.window.quantityMicrounits = Number.MAX_SAFE_INTEGER;
  const secondPayload = observationPayload(env.operator, "overflow-b", {
    startAt: "2026-08-19T06:00:00.000Z",
    endAt: "2026-08-19T08:00:00.000Z",
    observedAt: "2026-08-19T08:10:00.000Z",
    population: "population-overflow-b",
  });
  const observations = [firstPayload, secondPayload].map((payload) => (
    signLossExposureObservation(payload, { privateKeyPem: env.operator.privateKeyPem })
  ));
  const quarantine = buildLossExposureQuarantine(observations,
    { trustStore: env.trustStore, createdAt: AT });
  const adjudications = quarantine.entries.map((entry) => adjudicate(entry, env));
  assert.throws(() => buildLossExposureShadowBook({ quarantine, adjudications,
    trustStore: env.trustStore, generatedAt: AT }), /SUM_OVERFLOW/);
});
