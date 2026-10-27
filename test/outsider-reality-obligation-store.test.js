import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  REALITY_NON_CLOSING_FACT_KINDS,
  REALITY_OBLIGATION_STATUSES,
  REALITY_OBLIGATION_TEST_FIXTURE_PROVIDER_PROFILE,
  REALITY_OBLIGATION_TEST_FIXTURE_RECEIPT_SCHEMA,
  RealityObligationFixtureStoreForTests,
  RealityObligationStore,
  verifyRealityObligationStatePrefix,
  verifyRealityObligationStore,
} from "../src/outsider-reality-obligation-store.js";

function h(label) {
  return `sha256:${createHash("sha256").update(`test:${label}`).digest("hex")}`;
}

function domainHash(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0`).update(canonicalizeStrict(value)).digest("hex")}`;
}

function at(second) {
  return new Date(Date.UTC(2026, 7, 27, 0, 0, second)).toISOString();
}

function fixture(t, label = "ledger") {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "outsider-obligation-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  return path.join(temporaryRoot, label);
}

function creation(directory, obligationId = "obligation-1") {
  return {
    directory,
    obligationId,
    bindings: {
      claimHash: h("claim"),
      wayHash: h("way"),
      worldHash: h("world"),
      episodeHash: h("episode"),
      attemptHash: h("attempt"),
      censusRegistrationHash: h("census-registration"),
      responsibilityGraphHash: h("responsibility-graph"),
      affectedPartyRootHash: h("affected-party-root"),
      budgetCommitmentHash: h("budget-commitment"),
      recoveryPolicyHash: h("recovery-policy"),
      challengePolicyHash: h("challenge-policy"),
    },
    consequenceChannelHashes: [h("affected-channel")],
    mandatoryHorizons: [
      {
        horizonId: "immediate",
        dueAfterMs: 0,
        observationRequirementHash: h("immediate-observation"),
        mandatory: true,
      },
      {
        horizonId: "delayed",
        dueAfterMs: 2_000,
        observationRequirementHash: h("delayed-observation"),
        mandatory: true,
      },
    ],
    createdAt: at(0),
  };
}

function cas(snapshot, commandId, occurredAt, extra = {}) {
  return {
    commandId,
    expectedRevision: snapshot.revision,
    expectedStateHash: snapshot.stateHash,
    occurredAt,
    ...extra,
  };
}

function assertNoAuthority(snapshot) {
  assert.equal(snapshot.state.authority.actionReady, false);
  assert.equal(snapshot.state.authority.executionAuthorityEstablished, false);
  assert.equal(snapshot.state.authority.obligationClosureAuthorityEstablished, false);
  assert.equal(snapshot.state.authority.externalProviderAuthorityEstablished, false);
  assert.equal(snapshot.state.authority.callerAssertionsAcceptedAsAuthority, false);
  assert.equal(snapshot.state.authority.callbackVerificationAccepted, false);
  assert.equal(snapshot.state.productionClosureEstablished, false);
  assert.equal(snapshot.state.liveActionConnected, false);
  assert.equal(snapshot.state.causalExperienceUnits, 0);
  assert.equal(snapshot.verification.actionReady, false);
  assert.equal(snapshot.verification.externalClosureVerified, false);
  assert.equal(snapshot.verification.externallyClosedStatusHasProductionEffect, false);
  assert.equal(snapshot.verification.productionClosureEstablished, false);
}

function advanceToCandidate(store) {
  let snapshot = store.snapshot();
  snapshot = store.activate(cas(snapshot, "activate", at(1)));
  snapshot = store.recordHorizonReport(cas(snapshot, "report-immediate", at(2), {
    horizonId: "immediate",
    consequenceReportHash: h("immediate-report"),
  }));
  assert.throws(() => store.recordHorizonReport(cas(snapshot, "report-delayed-early", at(2), {
    horizonId: "delayed",
    consequenceReportHash: h("premature-delayed-report"),
  })), /HORIZON_REPORT_BEFORE_DUE/);
  snapshot = store.recordHorizonReport(cas(snapshot, "report-delayed", at(3), {
    horizonId: "delayed",
    consequenceReportHash: h("delayed-report"),
  }));
  return store.nominateClosureCandidate(cas(snapshot, "nominate", at(4), {
    evidenceSetHash: h("candidate-evidence-set"),
  }));
}

test("durable obligation genesis binds the complete Reality subject and never grants authority",
  (t) => {
    const directory = fixture(t);
    const store = RealityObligationStore.create(creation(directory));
    const snapshot = store.snapshot();

    assert.equal(snapshot.state.status, REALITY_OBLIGATION_STATUSES.PRECOMMITTED);
    assert.deepEqual(snapshot.state.bindings, creation(directory).bindings);
    assert.deepEqual(snapshot.state.consequenceChannelHashes,
      creation(directory).consequenceChannelHashes);
    assert.ok(snapshot.state.mandatoryHorizons.every(
      ({ horizonCommitmentHash }) => /^sha256:[a-f0-9]{64}$/.test(horizonCommitmentHash)));
    assert.deepEqual(snapshot.state.mandatoryHorizons.map((horizon) => ({
      horizonId: horizon.horizonId,
      dueAfterMs: horizon.dueAfterMs,
      observationRequirementHash: horizon.observationRequirementHash,
      mandatory: horizon.mandatory,
    })), creation(directory).mandatoryHorizons);
    assert.equal(snapshot.state.obligationOutstanding, true);
    assert.equal(snapshot.state.workflowOpen, true);
    assert.equal(snapshot.verification.sourceReplayComplete, true);
    assert.equal(snapshot.verification.externalAnchorEstablished, false);
    assert.equal(snapshot.verification.testFixtureLedger, false);
    assertNoAuthority(snapshot);
    assert.equal(typeof store.recordProviderSpecificExternalClosureReceipt, "undefined");
  });

test("mandatory horizons, recovery and challenge duties gate a closure candidate", (t) => {
  const store = RealityObligationStore.create(creation(fixture(t)));
  let snapshot = store.snapshot();
  snapshot = store.activate(cas(snapshot, "activate", at(1)));
  assert.equal(snapshot.state.status, REALITY_OBLIGATION_STATUSES.OPEN);
  assert.deepEqual(store.snapshot({ asOf: at(1) }).overdueHorizonIds, ["immediate"]);

  snapshot = store.evaluateHorizons(cas(snapshot, "evaluate-immediate", at(1)));
  assert.equal(snapshot.state.status, REALITY_OBLIGATION_STATUSES.HORIZON_PENDING);
  assert.equal(snapshot.state.mandatoryHorizons[0].status, "OVERDUE");
  snapshot = store.recordHorizonReport(cas(snapshot, "report-immediate", at(2), {
    horizonId: "immediate",
    consequenceReportHash: h("immediate-report"),
  }));

  snapshot = store.markRecoveryDue(cas(snapshot, "recovery-due", at(3), {
    triggerEvidenceHash: h("recovery-trigger"),
  }));
  assert.equal(snapshot.state.status, REALITY_OBLIGATION_STATUSES.RECOVERY_DUE);
  snapshot = store.openChallenge(cas(snapshot, "challenge-open", at(4), {
    challengeHash: h("affected-party-challenge"),
  }));
  assert.equal(snapshot.state.status, REALITY_OBLIGATION_STATUSES.CHALLENGED);
  snapshot = store.recordRecoveryEvidence(cas(snapshot, "recovery-evidence", at(5), {
    recoveryEvidenceHash: h("local-recovery-evidence"),
  }));
  assert.equal(snapshot.state.status, REALITY_OBLIGATION_STATUSES.CHALLENGED);
  assert.equal(snapshot.state.recovery.status, "RECORDED_LOCAL_EVIDENCE_ONLY");
  snapshot = store.resolveChallenge(cas(snapshot, "challenge-resolved", at(6), {
    challengeHash: h("affected-party-challenge"),
    resolutionHash: h("local-resolution-record"),
  }));
  assert.equal(snapshot.state.status, REALITY_OBLIGATION_STATUSES.HORIZON_PENDING);

  assert.throws(() => store.snapshot({ asOf: at(4) }), /AS_OF_BEFORE_REPLAYED_STATE/);
  assert.deepEqual(store.snapshot({ asOf: at(6) }).overdueHorizonIds, ["delayed"]);
  snapshot = store.evaluateHorizons(cas(snapshot, "evaluate-delayed", at(7)));
  assert.equal(snapshot.state.mandatoryHorizons[1].status, "OVERDUE");
  assert.throws(() => store.nominateClosureCandidate(cas(
    snapshot, "premature-candidate", at(8), { evidenceSetHash: h("premature") })),
  /REQUIRES_ALL_HORIZONS_REPORTED/);
  snapshot = store.recordHorizonReport(cas(snapshot, "report-delayed", at(8), {
    horizonId: "delayed",
    consequenceReportHash: h("delayed-report"),
  }));
  snapshot = store.nominateClosureCandidate(cas(snapshot, "candidate", at(9), {
    evidenceSetHash: h("candidate-evidence"),
  }));
  assert.equal(snapshot.state.status, REALITY_OBLIGATION_STATUSES.CLOSURE_CANDIDATE);
  assert.equal(snapshot.state.obligationOutstanding, true);
  assert.equal(snapshot.state.closureCandidate.authorityEffect, "NONE");
  assertNoAuthority(snapshot);
});

test("success, rollback, payment, coverage, replacement and grant-expiry facts cannot close or delete",
  (t) => {
    const store = RealityObligationStore.create(creation(fixture(t)));
    let snapshot = store.snapshot();
    snapshot = store.activate(cas(snapshot, "activate", at(1)));
    for (let index = 0; index < REALITY_NON_CLOSING_FACT_KINDS.length; index += 1) {
      const factKind = REALITY_NON_CLOSING_FACT_KINDS[index];
      snapshot = store.recordNonClosingFact(cas(snapshot, `fact-${index}`, at(2 + index), {
        factKind,
        factEvidenceHash: h(`fact-evidence-${factKind}`),
      }));
      assert.equal(snapshot.state.status, REALITY_OBLIGATION_STATUSES.OPEN);
      assert.equal(snapshot.state.obligationOutstanding, true);
      assert.equal(snapshot.state.nonClosingFacts[index].closureEffect, "NONE");
      assertNoAuthority(snapshot);
    }
    assert.equal(snapshot.state.nonClosingFacts.length,
      REALITY_NON_CLOSING_FACT_KINDS.length);
    assert.equal(typeof store.delete, "undefined");
    assert.equal(typeof store.close, "undefined");

    const candidateStore = RealityObligationStore.create(creation(
      fixture(t, "candidate-fact-ledger"), "candidate-fact-obligation"));
    let candidate = advanceToCandidate(candidateStore);
    candidate = candidateStore.recordNonClosingFact(cas(
      candidate, "success-after-candidate", at(5), {
        factKind: "SUCCESS_REPORTED",
        factEvidenceHash: h("success-after-candidate"),
      }));
    assert.equal(candidate.state.status, REALITY_OBLIGATION_STATUSES.HORIZON_PENDING);
    assert.equal(candidate.state.closureCandidate, null);
    assert.equal(candidate.state.obligationOutstanding, true);
    assertNoAuthority(candidate);
  });

test("CAS, exact schemas and immutable reports reject caller authority and callback laundering", (t) => {
  const store = RealityObligationStore.create(creation(fixture(t)));
  let snapshot = store.snapshot();
  const stale = snapshot;
  assert.throws(() => store.activate({
    ...cas(snapshot, "caller-bool", at(1)),
    verified: true,
  }), /EXACT_FIELDS_REQUIRED/);
  assert.throws(() => store.activate({
    ...cas(snapshot, "caller-callback", at(1)),
    verifier: () => true,
  }), /EXACT_FIELDS_REQUIRED/);

  snapshot = store.activate(cas(snapshot, "activate", at(1)));
  assert.throws(() => store.evaluateHorizons(cas(stale, "stale-cas", at(2))),
    /CAS_MISMATCH/);
  snapshot = store.recordHorizonReport(cas(snapshot, "report-immediate", at(2), {
    horizonId: "immediate",
    consequenceReportHash: h("first-report"),
  }));
  assert.throws(() => store.recordHorizonReport(cas(snapshot, "replace-report", at(3), {
    horizonId: "immediate",
    consequenceReportHash: h("replacement-report"),
  })), /HORIZON_REPORT_IMMUTABLE/);
  assertNoAuthority(snapshot);
});

test("source replay repairs a crash-lagged head without dropping the immutable event", (t) => {
  const directory = fixture(t);
  const store = RealityObligationStore.create(creation(directory));
  let snapshot = store.snapshot();
  snapshot = store.activate(cas(snapshot, "activate", at(1)));
  const oldHead = readFileSync(path.join(directory, "head.json"));
  snapshot = store.evaluateHorizons(cas(snapshot, "evaluate", at(2)));
  const durableStateHash = snapshot.stateHash;

  writeFileSync(path.join(directory, "head.json"), oldHead);
  chmodSync(path.join(directory, "head.json"), 0o600);
  const beforeRepair = verifyRealityObligationStore(directory, { asOf: at(2) });
  assert.equal(beforeRepair.headStatus, "LAGGING_REPAIRABLE_FROM_IMMUTABLE_CHAIN");
  assert.equal(beforeRepair.revision, 2);
  assert.equal(beforeRepair.stateHash, durableStateHash);

  const reopened = RealityObligationStore.open(directory);
  const repaired = reopened.snapshot({ asOf: at(2) });
  assert.equal(repaired.headStatus, "CURRENT");
  assert.equal(repaired.revision, 2);
  assert.equal(repaired.stateHash, durableStateHash);
  assert.equal(repaired.state.mandatoryHorizons[0].status, "OVERDUE");
});

test("a pinned revision-zero prefix replays after current advances without reading mutable head",
  (t) => {
    const directory = fixture(t, "historic-prefix");
    const store = RealityObligationStore.create(creation(
      directory, "historic-prefix-obligation"));
    const revisionZero = store.snapshot();
    let current = store.activate(cas(revisionZero, "activate", at(1)));
    current = store.evaluateHorizons(cas(current, "evaluate", at(2)));
    assert.equal(current.revision, 2);

    const headFile = path.join(directory, "head.json");
    const untrustedHead = JSON.stringify({ callerClaimsAuthority: true });
    writeFileSync(headFile, untrustedHead);
    chmodSync(headFile, 0o600);
    const prefix = verifyRealityObligationStatePrefix(directory, {
      expectedRevision: 0,
      expectedStateHash: revisionZero.stateHash,
      expectedGenesisHash: revisionZero.genesis.genesisHash,
    });

    assert.equal(prefix.schema,
      "outsider/reality-obligation-state-prefix-verification/v1");
    assert.equal(prefix.revision, 0);
    assert.equal(prefix.stateHash, revisionZero.stateHash);
    assert.equal(prefix.state.status, REALITY_OBLIGATION_STATUSES.PRECOMMITTED);
    assert.equal(prefix.headStatus, "MUTABLE_HEAD_NOT_READ_BY_PREFIX_VERIFIER");
    assert.equal(prefix.verification.immutablePrefixReplayComplete, true);
    assert.equal(prefix.verification.sourceReplayComplete, false);
    assert.equal(prefix.verification.sourceReplayScope,
      "PINNED_IMMUTABLE_PREFIX_ONLY");
    assert.equal(prefix.verification.sourceReplayThroughRevision, 0);
    assert.equal(prefix.verification.fullLedgerSourceReplayComplete, false);
    assert.equal(prefix.verification.expectedGenesisHashChecked, true);
    assert.equal(prefix.verification.mutableHeadRead, false);
    assert.equal(prefix.verification.mutableHeadTrusted, false);
    assert.equal(prefix.verification.writesPerformed, false);
    assert.equal(readFileSync(headFile, "utf8"), untrustedHead);
    assertNoAuthority(prefix);
  });

test("prefix replay rejects wrong pins, unavailable revisions, gaps, tamper and fixture splice",
  async (t) => {
    await t.test("wrong state hash and unavailable revision", () => {
      const directory = fixture(t, "wrong-prefix-pin");
      const store = RealityObligationStore.create(creation(
        directory, "wrong-prefix-pin-obligation"));
      const revisionZero = store.snapshot();
      store.activate(cas(revisionZero, "activate", at(1)));
      assert.throws(() => verifyRealityObligationStatePrefix(directory, {
        expectedRevision: 0,
        expectedStateHash: h("wrong-prefix-state"),
      }), /PREFIX_EXPECTED_STATE_HASH_MISMATCH/);
      assert.throws(() => verifyRealityObligationStatePrefix(directory, {
        expectedRevision: 2,
        expectedStateHash: h("unavailable-prefix-state"),
      }), /PREFIX_REVISION_NOT_AVAILABLE/);
    });

    await t.test("sequence gap", () => {
      const directory = fixture(t, "prefix-gap");
      const store = RealityObligationStore.create(creation(directory, "prefix-gap-obligation"));
      let snapshot = store.activate(cas(store.snapshot(), "activate", at(1)));
      snapshot = store.evaluateHorizons(cas(snapshot, "evaluate", at(2)));
      renameSync(path.join(directory, "events", "000000000002.json"),
        path.join(directory, "events", "000000000003.json"));
      assert.throws(() => verifyRealityObligationStatePrefix(directory, {
        expectedRevision: 2,
        expectedStateHash: snapshot.stateHash,
      }), /EVENT_SEQUENCE_GAP/);
    });

    await t.test("event tamper", () => {
      const directory = fixture(t, "prefix-tamper");
      const store = RealityObligationStore.create(creation(
        directory, "prefix-tamper-obligation"));
      const snapshot = store.activate(cas(store.snapshot(), "activate", at(1)));
      const eventFile = path.join(directory, "events", "000000000001.json");
      const event = JSON.parse(readFileSync(eventFile, "utf8"));
      event.payload = { callerClaimsAuthority: true };
      writeFileSync(eventFile, JSON.stringify(event));
      chmodSync(eventFile, 0o600);
      assert.throws(() => verifyRealityObligationStatePrefix(directory, {
        expectedRevision: 1,
        expectedStateHash: snapshot.stateHash,
      }), /EVENT_HASH_MISMATCH|ACTIVATE_PAYLOAD_EXACT_FIELDS_REQUIRED/);
    });

    await t.test("production and fixture genesis cannot be spliced", () => {
      const productionDirectory = fixture(t, "prefix-production");
      const fixtureDirectory = fixture(t, "prefix-fixture");
      const production = RealityObligationStore.create(creation(
        productionDirectory, "prefix-capability-obligation")).snapshot();
      const fixtureSnapshot = RealityObligationFixtureStoreForTests.create(creation(
        fixtureDirectory, "prefix-capability-obligation")).snapshot();
      assert.notEqual(production.genesis.genesisHash, fixtureSnapshot.genesis.genesisHash);
      assert.throws(() => verifyRealityObligationStatePrefix(fixtureDirectory, {
        expectedRevision: 0,
        expectedStateHash: production.stateHash,
        expectedGenesisHash: production.genesis.genesisHash,
      }), /PREFIX_EXPECTED_GENESIS_HASH_MISMATCH/);
    });
  });

test("a stale PID lock is never stolen automatically", (t) => {
  const directory = fixture(t, "stale-lock-ledger");
  RealityObligationStore.create(creation(directory, "stale-lock-obligation"));
  const body = {
    schema: "outsider/reality-obligation-lock/v1",
    pid: 2_147_483_647,
    nonce: "dead-holder",
    acquiredAt: at(1),
  };
  const lock = {
    ...body,
    lockHash: domainHash("outsider/reality-obligation-lock/v1", body),
  };
  const lockFile = path.join(directory, "append.lock");
  writeFileSync(lockFile, JSON.stringify(lock), { mode: 0o600, flag: "wx" });
  const before = readFileSync(lockFile, "utf8");
  assert.throws(() => RealityObligationStore.open(directory),
    /STALE_LOCK_REQUIRES_EXPLICIT_RECOVERY/);
  assert.equal(readFileSync(lockFile, "utf8"), before);
});

test("event tamper and sequence gaps fail closed under full source replay", async (t) => {
  await t.test("tamper", () => {
    const directory = fixture(t, "tamper-ledger");
    const store = RealityObligationStore.create(creation(directory, "tamper-obligation"));
    store.activate(cas(store.snapshot(), "activate", at(1)));
    const eventFile = path.join(directory, "events", "000000000001.json");
    const event = JSON.parse(readFileSync(eventFile, "utf8"));
    event.payload = { callerClaimsAuthority: true };
    writeFileSync(eventFile, JSON.stringify(event));
    chmodSync(eventFile, 0o600);
    assert.throws(() => verifyRealityObligationStore(directory),
      /EVENT_HASH_MISMATCH|ACTIVATE_PAYLOAD_EXACT_FIELDS_REQUIRED/);
  });

  await t.test("gap", () => {
    const directory = fixture(t, "gap-ledger");
    const store = RealityObligationStore.create(creation(directory, "gap-obligation"));
    let snapshot = store.activate(cas(store.snapshot(), "activate", at(1)));
    store.evaluateHorizons(cas(snapshot, "evaluate", at(2)));
    renameSync(path.join(directory, "events", "000000000002.json"),
      path.join(directory, "events", "000000000003.json"));
    assert.throws(() => verifyRealityObligationStore(directory), /EVENT_SEQUENCE_GAP/);
  });
});

test("EXTERNALLY_CLOSED is provider-slot-specific, fixture-only and can be reopened", (t) => {
  const productionDirectory = fixture(t, "production");
  const production = RealityObligationStore.create(creation(
    productionDirectory, "production-obligation"));
  assert.equal(typeof production.recordProviderSpecificExternalClosureReceipt, "undefined");
  assert.throws(() => RealityObligationFixtureStoreForTests.open(productionDirectory),
    /FIXTURE_STORE_REFUSES_PRODUCTION_LEDGER/);
  const productionCandidate = advanceToCandidate(production);
  const forgedProductionReceipt = {
    schema: REALITY_OBLIGATION_TEST_FIXTURE_RECEIPT_SCHEMA,
    providerProfile: REALITY_OBLIGATION_TEST_FIXTURE_PROVIDER_PROFILE,
    providerIdHash: h("forged-provider"),
    providerPolicyHash: h("forged-policy"),
    verifierImplementationHash: h("forged-verifier"),
    providerReceiptHash: h("forged-receipt"),
    receiptIssuedAt: at(5),
    closureCandidateHash: productionCandidate.state.closureCandidate.candidateHash,
    subjectStateHash: productionCandidate.stateHash,
  };
  const forgedBody = {
    schema: "outsider/reality-obligation-event/v1",
    sequence: 5,
    commandId: "forged-production-close",
    kind: "RECORD_TEST_FIXTURE_EXTERNAL_CLOSURE",
    occurredAt: at(5),
    previousEventHash: productionCandidate.state.lastEventHash,
    previousStateHash: productionCandidate.stateHash,
    payload: { receipt: forgedProductionReceipt },
  };
  const forgedEvent = {
    ...forgedBody,
    eventHash: domainHash("outsider/reality-obligation-event/v1", forgedBody),
    resultStateHash: h("unreachable-result-state"),
  };
  writeFileSync(path.join(productionDirectory, "events", "000000000005.json"),
    JSON.stringify(forgedEvent), { mode: 0o600, flag: "wx" });
  assert.throws(() => verifyRealityObligationStore(productionDirectory),
    /PRODUCTION_EXTERNAL_CLOSURE_UNREACHABLE/);

  const fixtureDirectory = fixture(t, "fixture");
  const store = RealityObligationFixtureStoreForTests.create(creation(
    fixtureDirectory, "fixture-obligation"));
  let snapshot = advanceToCandidate(store);
  const receipt = {
    schema: REALITY_OBLIGATION_TEST_FIXTURE_RECEIPT_SCHEMA,
    providerProfile: REALITY_OBLIGATION_TEST_FIXTURE_PROVIDER_PROFILE,
    providerIdHash: h("fixture-provider-alpha"),
    providerPolicyHash: h("fixture-provider-policy"),
    verifierImplementationHash: h("fixture-verifier-bytes"),
    providerReceiptHash: h("fixture-provider-receipt"),
    receiptIssuedAt: at(5),
    closureCandidateHash: snapshot.state.closureCandidate.candidateHash,
    subjectStateHash: snapshot.stateHash,
  };
  assert.throws(() => store.recordProviderSpecificExternalClosureReceipt({
    ...cas(snapshot, "self-asserted-receipt", at(5), { receipt }),
    independent: true,
  }), /EXACT_FIELDS_REQUIRED/);
  assert.throws(() => store.recordProviderSpecificExternalClosureReceipt(cas(
    snapshot, "receipt-nested-bool", at(5), {
      receipt: { ...receipt, externallyVerified: true },
    })), /FIXTURE_RECEIPT_EXACT_FIELDS_REQUIRED/);

  snapshot = store.recordProviderSpecificExternalClosureReceipt(cas(
    snapshot, "fixture-receipt", at(5), { receipt }));
  assert.equal(snapshot.state.status, REALITY_OBLIGATION_STATUSES.EXTERNALLY_CLOSED);
  assert.equal(snapshot.state.workflowOpen, false);
  assert.equal(snapshot.state.fixtureScenarioClosed, true);
  assert.equal(snapshot.state.obligationOutstanding, true);
  assert.equal(snapshot.state.externalClosureReceiptSlot.fixtureOnly, true);
  assert.equal(snapshot.state.externalClosureReceiptSlot.providerSpecific, true);
  assert.equal(snapshot.state.externalClosureReceiptSlot.externalVerificationEstablished, false);
  assert.equal(snapshot.state.externalClosureReceiptSlot.productionClosureEstablished, false);
  assert.equal(snapshot.verification.testFixtureLedger, true);
  assertNoAuthority(snapshot);
  assert.throws(() => RealityObligationStore.open(fixtureDirectory),
    /PRODUCTION_STORE_REFUSES_TEST_FIXTURE_LEDGER/);

  snapshot = store.recordNonClosingFact(cas(snapshot, "late-fact", at(6), {
    factKind: "SUCCESS_REPORTED",
    factEvidenceHash: h("late-fact-outside-closed-evidence-set"),
  }));
  assert.equal(snapshot.state.status, REALITY_OBLIGATION_STATUSES.REOPENED);
  assert.equal(snapshot.state.workflowOpen, true);
  assert.equal(snapshot.state.fixtureScenarioClosed, false);
  assert.equal(snapshot.state.externalClosureReceiptSlot, null);
  assert.equal(snapshot.state.recovery.status, "DUE");
  assert.equal(snapshot.state.recovery.triggerEvidenceHash,
    h("late-fact-outside-closed-evidence-set"));
  assert.equal(snapshot.state.reopenedCount, 1);
  assert.equal(snapshot.state.obligationOutstanding, true);
  assertNoAuthority(snapshot);

  snapshot = store.recordRecoveryEvidence(cas(snapshot, "late-fact-recovery", at(7), {
    recoveryEvidenceHash: h("local-recovery-evidence-after-late-fact"),
  }));
  snapshot = store.nominateClosureCandidate(cas(snapshot, "candidate-after-reopen", at(8), {
    evidenceSetHash: h("candidate-evidence-after-reopen"),
  }));
  snapshot = store.reopen(cas(snapshot, "explicit-reopen", at(9), {
    reopeningEvidenceHash: h("delayed-harm-or-challenge"),
  }));
  assert.equal(snapshot.state.status, REALITY_OBLIGATION_STATUSES.REOPENED);
  assert.equal(snapshot.state.reopenedCount, 2);
  assert.equal(snapshot.state.obligationOutstanding, true);
  assertNoAuthority(snapshot);
});
