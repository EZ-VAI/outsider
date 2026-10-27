import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_SCHEMAS,
  createAutonomousWorkOrderStage1EngineeringIntegrationReceipt,
  verifyAutonomousWorkOrderStage1EngineeringIntegrationReceipt,
} from "../src/outsider-autonomous-work-order-stage1-engineering-integration.js";
import {
  createAutonomousWorkOrderStage1EngineeringIntegrationFixture,
} from "./helpers/outsider-autonomous-work-order-stage1-engineering-integration-fixture.js";
import {
  stage5Hash as h,
} from "./helpers/outsider-network-stage5-fixture.js";

function createReceipt(value, input = value.input, context = value.context) {
  return createAutonomousWorkOrderStage1EngineeringIntegrationReceipt(
    input, context);
}

function verifyReceipt(receipt, value, input = value.input,
  context = value.context, expectedReceiptHash = receipt.receiptHash) {
  return verifyAutonomousWorkOrderStage1EngineeringIntegrationReceipt(
    receipt, { input, context, expectedReceiptHash });
}

function reseal(record) {
  const { receiptHash: ignoredReceiptHash, ...body } = record;
  const receiptHash = `sha256:${createHash("sha256").update(
    `${record.schema}\0${canonicalizeStrict(body)}`, "utf8").digest("hex")}`;
  return { ...body, receiptHash };
}

function replaceAllEpisodeReferences(model, episodeHash) {
  model.binding.episodeHash = episodeHash;
  for (const row of model.attempts) row.episodeHash = episodeHash;
  for (const row of [...model.baseReports, ...model.lifecycleReports]) {
    row.episodeHash = episodeHash;
  }
  return model;
}

function replaceAllAttemptReferences(model, attemptHash) {
  model.binding.genesisObligationAttemptHash = attemptHash;
  model.attempts[0].attemptHash = attemptHash;
  for (const row of [...model.baseReports, ...model.lifecycleReports]) {
    row.attemptHash = attemptHash;
  }
  return model;
}

function assertMonotonicStage1Boundary(record) {
  assert.equal(record.declarationExternalSourceBytesReplayed, false);
  assert.equal(record.nativeSafetyUnconditionalVetoPreserved, true);
  assert.equal(record.outsiderCanOverrideNativeSafetyVeto, false);
  assert.equal(record.storageDirectoryContinuityEstablished, false);
  assert.equal(record.storageDurabilityEstablished, false);
  assert.equal(record.obligationContinuationUniquenessEstablished, false);
  assert.equal(record.dualDirectoryNonEquivocationEstablished, false);
  assert.equal(record.singleCanonicalObligationLedgerEstablished, false);
  assert.equal(record.organizationalIndependenceEstablished, false);
  assert.equal(record.rightsClearanceEstablished, false);
  assert.equal(record.privacyClearanceEstablished, false);
  assert.equal(record.boundary.declarationExternalSourceBytesReplayed, false);
  assert.equal(record.boundary.nativeSafetyUnconditionalVetoPreserved, true);
  assert.equal(record.boundary.outsiderCanOverrideNativeSafetyVeto, false);
  assert.equal(record.boundary.storageDirectoryContinuityEstablished, false);
  assert.equal(record.boundary.storageDurabilityEstablished, false);
  assert.equal(record.boundary.obligationContinuationUniquenessEstablished,
    false);
  assert.equal(record.boundary.dualDirectoryNonEquivocationEstablished, false);
  assert.equal(record.boundary.singleCanonicalObligationLedgerEstablished,
    false);
  assert.equal(record.boundary.organizationalIndependenceEstablished, false);
  assert.equal(record.boundary.rightsClearanceEstablished, false);
  assert.equal(record.boundary.privacyClearanceEstablished, false);
}

test("integration freshly replays all three parents and remains HOLD", (t) => {
  const value = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t);
  const receipt = createReceipt(value);
  const checked = verifyReceipt(receipt, value);

  assert.equal(receipt.schema,
    AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_SCHEMAS.receipt);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.receiptDerivationVerified, true);
  assert.equal(receipt.decisionState, "HOLD");
  assert.equal(receipt.authority, "NONE");
  assert.equal(receipt.actionReady, false);
  assert.equal(receipt.executable, false);
  assert.equal(receipt.automaticTraining, false);
  assert.equal(receipt.trainingRows, 0);
  assert.equal(receipt.causalExperienceUnits, 0);
  assert.equal(receipt.enabledCapabilityCount, 0);
  assert.equal(receipt.provenAuthorityCount, 0);
  assert.equal(receipt.enabledCapabilitiesSubsetOfProvenAuthority, true);
  assert.equal(receipt.consequenceReach, "NONE");
  assert.equal(receipt.moneyMovementEnabled, false);
  assert.equal(receipt.custodyEstablished, false);
  assert.equal(receipt.fundsVerified, false);
  assert.equal(receipt.platformAdvanceEnabled, false);
  assert.equal(receipt.permitsPricing, false);
  assert.equal(receipt.guaranteeEstablished, false);
  assert.equal(receipt.permitsGuarantee, false);
  assert.equal(receipt.insuranceEstablished, false);
  assert.equal(receipt.permitsInsurance, false);
  assert.equal(receipt.settlementEnabled, false);
  assert.equal(receipt.permitsSettlement, false);
  assert.equal(receipt.externalAdoptionEstablished, false);
  assert.equal(receipt.externalContractAcceptanceEstablished, false);
  assert.equal(receipt.networkOrderEstablished, false);
  assert.equal(receipt.stage1EngineeringGatePassed, false);
  assert.equal(receipt.stage1ExternalFactGatePassed, false);
  assert.equal(receipt.stage1Complete, false);
  assert.equal(receipt.stage2Eligible, false);
  assert.equal(receipt.stage2Permitted, false);
  assert.equal(receipt.replayCoverage.externalPinProvenanceEstablished, false);
  assert.equal(receipt.replayCoverage.durableExternalHeadEstablished, false);
  assert.equal(receipt.replayCoverage
    .globalAttemptAndReportDenominatorComplete, false);
  assert.equal(receipt.replayCoverage
    .directParticipantConfirmationEstablished, false);
  assert.equal(receipt.replayCoverage.rightsPrivacyAdjudicationEstablished,
    false);
  assert.equal(receipt.replayCoverage.sourceReplayVerified, false);
  assert.equal(checked.stage1EngineeringGatePassed, false);
  assert.equal(checked.stage1ExternalFactGatePassed, false);
  assert.equal(checked.stage1Complete, false);
  assert.equal(checked.stage2Eligible, false);
  assert.equal(checked.stage2Permitted, false);
  assertMonotonicStage1Boundary(receipt);
  assertMonotonicStage1Boundary(checked);
  assert.deepEqual(receipt.boundary,
    AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_BOUNDARY);

  const recreated = createReceipt(value);
  assert.deepEqual(recreated, receipt);
  assert.equal(recreated.receiptHash, receipt.receiptHash);
});

test("fixture preserves base-three and v2-pair occurrence/object denominators",
  (t) => {
    const value = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t);
    const rows = value.attemptSet.head.reportOccurrences;
    assert.equal(rows.length, 5);
    assert.equal(new Set(rows.map((row) => row.occurrenceIdentityHash)).size, 5);
    assert.equal(new Set(rows.map((row) => row.networkObjectIdentityHash)).size, 4);
    assert.deepEqual(rows.slice(0, 3).map((row) => row.occurrenceIdentityHash),
      value.lifecycle.predecessor.network.rows.map(
        ({ bundle }) => bundle.preview.manifest.occurrenceIdentityHash));
    assert.notEqual(rows[3].occurrenceIdentityHash,
      rows[4].occurrenceIdentityHash);
    assert.equal(rows[3].networkObjectIdentityHash,
      rows[4].networkObjectIdentityHash);

    const receipt = createReceipt(value);
    assert.equal(receipt.requiredReportOccurrenceCrosswalk
      .requiredReportOccurrenceCount, 5);
    assert.equal(receipt.requiredReportOccurrenceCrosswalk
      .requiredDistinctObjectIdentityCount, 4);
    assert.equal(receipt.requiredReportOccurrenceCrosswalk
      .baseNetworkCoreOccurrenceCount, 3);
    assert.equal(receipt.requiredReportOccurrenceCrosswalk
      .lifecycleActionOutcomeV2OccurrenceCount, 2);
    assert.equal(receipt.requiredReportOccurrenceCrosswalk
      .lifecycleActionOutcomeV2DistinctObjectIdentityCount, 1);
    assert.deepEqual(receipt.requiredReportOccurrenceCrosswalk
      .requiredOccurrenceIdentityHashes,
    rows.map((row) => row.occurrenceIdentityHash));
    assert.deepEqual(receipt.requiredReportOccurrenceCrosswalk
      .requiredObjectIdentityHashes,
    [...new Set(rows.map((row) => row.networkObjectIdentityHash))]);
    assert.equal(receipt.requiredReportOccurrenceCrosswalk
      .allRequiredOccurrencesPresentExactlyOnce, true);
    assert.equal(receipt.requiredReportOccurrenceCrosswalk
      .sourceReviewNetworkReceiptCrosswalkVerified, false);
    assert.equal(receipt.requiredReportOccurrenceCrosswalk
      .occurrenceCountDerivedFromObjectCount, false);
    assert.equal(receipt.requiredReportOccurrenceCrosswalk
      .objectDedupReducedReportOccurrenceDenominator, false);
    assert.equal(receipt.localAttemptSetReplay
      .globalReportOccurrenceCompletenessEstablished, false);
    assert.equal(receipt.localAttemptSetReplay
      .globalAttemptCensusCompletenessEstablished, false);
  });

test("all declared external facts must remain absent", (t) => {
  const value = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t);
  for (const field of Object.keys(value.input.absentExternalFacts)) {
    const input = {
      ...value.input,
      absentExternalFacts: {
        ...value.input.absentExternalFacts,
        [field]: h(`stage1-integration:forbidden:${field}`),
      },
    };
    assert.throws(() => createReceipt(value, input),
      /AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_/u);
  }
});

test("stale local head and a caller-swapped current composition fail closed",
  (t) => {
    const value = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t);
    const staleContext = {
      ...value.context,
      localAttemptSet: {
        ...value.context.localAttemptSet,
        expectedLocalHeadHash: h("stage1-integration:stale-head"),
      },
    };
    assert.throws(() => createReceipt(value, value.input, staleContext),
      /AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_/u);

    const input = {
      ...value.input,
      attemptSet: {
        ...value.input.attemptSet,
        headComposition: value.attemptSet.genesis,
      },
    };
    assert.throws(() => createReceipt(value, input),
      /AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_/u);
  });

test("drop, duplicate, and swap attacks on required rows are rejected", (t) => {
  const dropped = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t, {
    mutateAttemptSetModel(model) {
      model.lifecycleReports.pop();
      return model;
    },
  });
  assert.throws(() => createReceipt(dropped),
    /AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_/u);

  const swapped = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t, {
    mutateAttemptSetModel(model) {
      model.lifecycleReports[1].occurrenceIdentityHash
        = h("stage1-integration:swapped-required-occurrence");
      return model;
    },
  });
  assert.throws(() => createReceipt(swapped),
    /AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_/u);

  const value = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t);
  const duplicated = structuredClone(value.attemptSet.head);
  duplicated.reportOccurrences[4].occurrenceIdentityHash
    = duplicated.reportOccurrences[3].occurrenceIdentityHash;
  const input = { ...value.input, attemptSet: {
    ...value.input.attemptSet, headComposition: duplicated } };
  assert.throws(() => createReceipt(value, input),
    /AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_/u);
});

test("Episode, Attempt, receipt, object, and time splices are rejected", (t) => {
  const mutations = [
    (model) => replaceAllEpisodeReferences(model,
      h("stage1-integration:spliced-episode")),
    (model) => replaceAllAttemptReferences(model,
      h("stage1-integration:spliced-attempt")),
    (model) => {
      model.attempts[0].attemptActorSubjectHash
        = h("stage1-integration:spliced-attempt-actor");
      return model;
    },
    (model) => {
      model.baseReports[0].networkReceiptHash
        = h("stage1-integration:spliced-network-receipt");
      return model;
    },
    (model) => {
      model.lifecycleReports[1].networkObjectIdentityHash
        = h("stage1-integration:spliced-network-object");
      return model;
    },
    (model) => {
      model.baseReports[0].reportedAt = "2026-08-28T00:00:03.000Z";
      return model;
    },
  ];
  for (const mutateAttemptSetModel of mutations) {
    const value = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t,
      { mutateAttemptSetModel });
    assert.throws(() => createReceipt(value),
      /AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_/u);
  }
});

test("individually valid child receipts cannot splice different predecessors",
  (t) => {
    const left = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t);
    const right = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t);
    const input = {
      ...left.input,
      sourceClosure: right.input.sourceClosure,
    };
    const context = {
      ...left.context,
      expectedSourceClosureReceiptHash:
        right.context.expectedSourceClosureReceiptHash,
    };
    assert.throws(() => createReceipt(left, input, context),
      /AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_/u);
  });

test("child filesystem failures are redacted and no receipt projects paths or raw bytes",
  (t) => {
    const value = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t);
    const receipt = createReceipt(value);
    const serialized = JSON.stringify(receipt);
    assert.equal(serialized.includes(value.attemptSet.directory), false);
    assert.equal(serialized.includes(value.lifecycle.liveDirectory), false);
    assert.equal(serialized.includes(value.lifecycle.sourceReview.directory), false);
    assert.equal(receipt.boundary.directoryPathsProjected, false);
    assert.equal(receipt.boundary.rawSourceOrReviewBytesProjected, false);

    const privateMissingPath = `${value.attemptSet.directory}/private-missing`;
    const context = {
      ...value.context,
      localAttemptSet: {
        ...value.context.localAttemptSet,
        directory: privateMissingPath,
      },
    };
    const checked = verifyReceipt(receipt, value, value.input, context);
    assert.equal(checked.ok, false);
    assert.equal(checked.error.includes(privateMissingPath), false);
    assert.equal(checked.directoryPathsProjected, false);
    assert.equal(checked.authority, "NONE");
  });

test("tampering, caller self-resealing, malformed options, proxies, and accessors fail closed",
  (t) => {
    const value = createAutonomousWorkOrderStage1EngineeringIntegrationFixture(t);
    const receipt = createReceipt(value);
    const escalated = structuredClone(receipt);
    escalated.authority = "FULL";
    escalated.actionReady = true;
    const checked = verifyReceipt(reseal(escalated), value);
    assert.equal(checked.ok, false);
    assert.equal(checked.authority, "NONE");
    assert.equal(checked.actionReady, false);
    assertMonotonicStage1Boundary(checked);

    const malformedOptions = verifyAutonomousWorkOrderStage1EngineeringIntegrationReceipt(
      receipt, {
        input: value.input,
        context: value.context,
        expectedReceiptHash: receipt.receiptHash,
        extra: true,
    });
    assert.equal(malformedOptions.ok, false);
    const wrongExpectedHash = verifyReceipt(receipt, value, value.input,
      value.context, h("stage1-integration:wrong-expected-receipt"));
    assert.equal(wrongExpectedHash.ok, false);
    assert.match(wrongExpectedHash.error, /EXPECTED_RECEIPT_HASH_MISMATCH/u);

    assert.throws(() => createReceipt(value, new Proxy(value.input, {})),
      /AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_/u);
    const poisoned = { ...value.input };
    Object.defineProperty(poisoned, "absentExternalFacts", {
      enumerable: true,
      get() {
        throw new Error("private getter must not execute");
      },
    });
    assert.throws(() => createReceipt(value, poisoned),
      /AUTONOMOUS_WORK_ORDER_STAGE1_ENGINEERING_INTEGRATION_/u);
  });
