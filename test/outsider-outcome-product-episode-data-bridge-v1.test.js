import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { createAutonomousWorkOrderProjection }
  from "../src/outsider-autonomous-work-order.js";
import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
  issueBuyerNativeTransactionAccountCapabilityV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  createOutcomeProductEpisodeDataBridgeV1,
  verifyOutcomeProductEpisodeDataBridgeV1,
} from "../src/outsider-outcome-product-episode-data-bridge-v1.js";
import { OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS }
  from "../src/outsider-outcome-product-runtime-v2.js";

const NOW = "2026-09-04T13:00:00.000Z";
const EXPIRY = "2026-09-04T14:00:00.000Z";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function privateDirectory(t, label) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), label)));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function workOrder() {
  const owner = h("owner");
  return createAutonomousWorkOrderProjection({
    orderId: "awo_0123456789abcdef0123456789abcdef",
    recordedAt: "2026-09-04T12:00:00.000Z",
    appendOnlyLineage: { revision: 0, predecessorProjectionHash: null,
      supersedesProjectionHash: null },
    typedGraph: {
      principalEpoch: { principalRefHash: h("principal"),
        epochRefHash: h("epoch"),
        principalEpochProjectionHash: h("principal-epoch") },
      accountableDeployment: { deploymentLineageRefHash: h("deployment-lineage"),
        deploymentRevisionHash: h("deployment-revision"),
        accountableDeploymentSubjectHash: h("accountable-deployment") },
      runtime: { runtimeInstanceRefHash: h("runtime-ref"),
        runtimeInstanceHash: h("runtime") },
      embodiment: { present: false, deviceLineageRefHash: null,
        embodimentRevisionHash: null },
      delegation: { delegationEvidenceRefHash: h("delegation-evidence"),
        delegationEdgeHash: h("delegation-edge") },
      episode: { episodeHash: h("episode"),
        networkCompleteEpisodeJoinHash: h("episode-join") },
      attempt: { attemptHash: h("attempt"),
        attemptActorSubjectHash: h("attempt-actor") },
    },
    contractReferences: { actorIdentityEnvelopeHash: h("actor-envelope"),
      realitySemanticBundleHash: h("semantic"),
      realityObligationGenesisHash: h("obligation-genesis"),
      realityObligationStateHash: h("obligation-state"),
      affectedPartyRootHash: h("affected-party"),
      outcomeWitnessEnvelopeHash: null },
    resourceOwner: { resourceOwnerRefHash: owner,
      ownerAdoptionEvidenceRefHash: null, externalAdoptionEstablished: false },
    promisedOutcome: { promisedOutcomeRefHash: h("promised-outcome"),
      acceptanceCriteriaHash: h("acceptance"),
      outcomeWitnessRequirementHash: h("witness-requirement"),
      consequenceChannelHashes: [h("consequence-channel")] },
    observationHorizons: [
      { horizonId: "immediate", dueAfterMs: 0,
        observationRequirementHash: h("observe-now"), mandatory: true },
      { horizonId: "delayed", dueAfterMs: 86_400_000,
        observationRequirementHash: h("observe-later"), mandatory: true },
    ],
    obligors: [
      { obligorRefHash: owner, role: "PRIMARY_PERFORMANCE",
        obligationRefHash: h("primary-obligation") },
      { obligorRefHash: owner, role: "RECOVERY",
        obligationRefHash: h("recovery-obligation") },
    ],
    remedyMenu: [{ remedyId: "replace", kind: "REPLACE",
      remedyTermsHash: h("replace-terms"), obligorRefHashes: [owner] }],
    protectionFunding: { status: "NONE" },
    orderStatus: "STRUCTURAL_PRECOMMITMENT_HOLD",
    challenge: { opened: false, challengeRefHash: null,
      standingExternallyVerified: false },
    closure: { closed: false, closureRefHash: null,
      externalClosureVerified: false },
    proofAccessPolicy: { roleScopedProofPolicyHash: h("proof-policy"),
      redactionPolicyHash: h("redaction-policy") },
  });
}

function formationEvent(programHash) {
  const formation = {
    schema: OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formation,
    schemaVersion: "2.0.0",
    requestId: "bridge_order",
    programHash,
    ordinal: 1,
    observedAt: NOW,
    state: "NEEDS_DESTINATION",
    dispositionReason: "DESTINATION_REQUIRED_TO_FORM_EXACT_TERMS",
    preparation: { networkState: "NEEDS_ADDRESS_AND_PAYMENT" },
    exactCommitmentProposal: null,
    humanQueueCreated: false,
    outcomePromiseIssued: false,
  };
  const body = {
    schema: OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formationEvent,
    schemaVersion: "2.0.0",
    eventType: "FORMATION_SNAPSHOT_RECORDED",
    requestRefHash: h("request-ref"),
    programHash,
    formationSnapshotHash: digest(
      OUTSIDER_OUTCOME_PRODUCT_RUNTIME_V2_SCHEMAS.formation, formation),
    recordedAt: NOW,
    formation,
    providerSourceBytesIncluded: false,
    outcomePromiseIssued: false,
  };
  return Object.freeze({ ...body, eventIdHash: digest(body.schema, body) });
}

function assertPrivateTree(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    assert.equal(statSync(target).mode & 0o077, 0);
    if (entry.isDirectory()) assertPrivateTree(target);
  }
}

test("formation and buyer-native occurrences enter the existing typed graph without object-dedup loss",
  async (t) => {
    const directory = privateDirectory(t, "outsider-product-data-bridge-");
    const transactions = path.join(directory, "transactions");
    const order = workOrder();
    const programHash = h("program");
    const prospectiveCensusProjectionHash = h("prospective-census");
    const bridgeInput = { privateDirectory: directory,
      workOrderProjection: order, expectedWorkOrderHash: order.workOrderHash,
      expectedProgramHash: programHash, prospectiveCensusProjectionHash };
    const bridge = createOutcomeProductEpisodeDataBridgeV1(bridgeInput,
      { clock: () => NOW });
    const metadata = (role) => ({ capabilityRefHash: h(`${role}:capability`),
      accountRefHash: h(`${role}:account`), nodeRefHash: h(`${role}:node`),
      issuedAt: "2026-09-04T12:30:00.000Z", expiresAt: EXPIRY,
      supportedOperations: ["QUOTE", "STATUS"] });
    const makeCapability = (role) => {
      const input = metadata(role);
      return issueBuyerNativeTransactionAccountCapabilityV1(input, {
        async requestImpl(request) {
          return request.operation === "STATUS"
            ? { sourceBytes: Buffer.from("provider says fulfilled", "utf8"),
              sourceState: "FULFILLED", sourceExpiresAt: null,
              sourceRecordClass: "STATUS_RECEIPT" }
            : { sourceBytes: Buffer.from("same exact provider bytes", "utf8"),
              sourceState: "QUOTE_AVAILABLE", sourceExpiresAt: EXPIRY,
              sourceRecordClass: "PUBLISHED_INVENTORY" };
        },
        async revalidateImpl(value) {
          return { active: true, capabilityRefHash: input.capabilityRefHash,
            accountRefHash: input.accountRefHash, observedAt: value.observedAt,
            expiresAt: input.expiresAt };
        },
        sourceOccurrenceSink: bridge.buyerNativeSourceOccurrenceSink,
      });
    };
    const route = (role, id) => createBuyerNativeTransactionRouteRuntimeV1({
      journalDirectory: transactions,
      journalId: id,
      transactionRefHash: h(`${role}:transaction`),
      outcomeIntentRefHash: order.promisedOutcome.promisedOutcomeRefHash,
      routeRole: role,
      formationExpiresAt: EXPIRY,
    }, { capability: makeCapability(role), clock: () => NOW });
    const command = (role) => ({
      operationNonce: `operation-nonce-${role.toLowerCase()}-00000001`,
      requestBytes: Buffer.from(`${role}:quote`, "utf8"),
      expiresAt: EXPIRY,
      expectedPreviousOccurrenceHash: null,
      triggerOccurrenceHash: null,
    });
    const primary = route("PRIMARY",
      "transaction_00000000000000000000000000000011");
    const recovery = route("RECOVERY",
      "transaction_00000000000000000000000000000012");
    const [primaryResult, recoveryResult] = await Promise.all([
      primary.quote(command("PRIMARY")), recovery.quote(command("RECOVERY")),
    ]);
    const primaryStatus = await primary.status({
      operationNonce: "operation-nonce-primary-status-00000001",
      requestBytes: Buffer.from("PRIMARY:status", "utf8"),
      expiresAt: EXPIRY,
      expectedPreviousOccurrenceHash:
        primaryResult.publicProjection.sourceOccurrenceHash,
      triggerOccurrenceHash: null,
    });

    /* Configured sink gets an independent claim view. Caller semantics remain
       unchanged and original results are still claimable exactly once. */
    assert.equal(claimBuyerNativeTransactionSourceOccurrenceV1(primaryResult)
      .sourceBytes.toString("utf8"), "same exact provider bytes");
    assert.equal(claimBuyerNativeTransactionSourceOccurrenceV1(recoveryResult)
      .sourceBytes.toString("utf8"), "same exact provider bytes");
    assert.equal(claimBuyerNativeTransactionSourceOccurrenceV1(primaryStatus)
      .sourceBytes.toString("utf8"), "provider says fulfilled");

    const event = formationEvent(programHash);
    const eventReceipt = await bridge.formationEventSink(event);
    assert.equal(eventReceipt.accepted, true);
    assert.equal(eventReceipt.duplicateDelivery, false);
    const projection = await bridge.inspect();
    assert.equal(projection.occurrenceCensus.sourceOccurrenceCount, 4);
    assert.equal(projection.occurrenceCensus.buyerNativeTransactionOccurrenceCount,
      3);
    assert.equal(projection.occurrenceCensus.productFormationOccurrenceCount, 1);
    assert.equal(projection.objectDedupView.distinctSourceObjectCount, 3);
    assert.equal(projection.objectDedupView.duplicateObjectOccurrenceCount, 1);
    assert.equal(projection.episodeAttemptSetComposition.reportOccurrenceCensus
      .reportOccurrenceCount, 4);
    assert.equal(projection.episodeAttemptSetComposition.objectDedupView
      .distinctSuppliedNetworkObjectIdentityHashCount, 3);
    assert.equal(projection.episodeDataEngineFeeder.segments.actionTrace
      .sourceNativeCount, 3);
    assert.equal(projection.episodeDataEngineFeeder.segments.outcome
      .independentCount, 0);
    const vendorFulfilled = projection.episodeAttemptSetComposition
      .reportOccurrences.find((row) => row.occurrenceIdentityHash
        === primaryStatus.publicProjection.sourceOccurrenceHash);
    assert.equal(vendorFulfilled.executionDisposition, "UNKNOWN");
    assert.equal(vendorFulfilled.outcomeObservationStatus, "MISSING");
    assert.equal(vendorFulfilled.reportedOutcomeEvidenceHash, null);
    assert.equal(projection.externalOutcomeEstablished, false);
    assert.equal(projection.episodeDataEngineFeeder.modelDecision,
      "KEEP_BASELINE");

    const duplicate = await bridge.formationEventSink(event);
    assert.equal(duplicate.duplicateDelivery, true);
    assert.equal((await bridge.inspect()).occurrenceCensus.sourceOccurrenceCount,
      4);
    const verified = verifyOutcomeProductEpisodeDataBridgeV1(bridgeInput);
    assert.equal(verified.ok, true);
    assert.equal(verified.sourceReplayComplete, true);
    assert.equal(verified.occurrenceCount, 4);
    assert.equal(verified.distinctSourceObjectCount, 3);
    assert.equal(verified.externalOutcomeEstablished, false);
    const coldBridge = createOutcomeProductEpisodeDataBridgeV1(bridgeInput,
      { clock: () => NOW });
    const coldProjection = await coldBridge.inspect();
    assert.equal(coldProjection.projectionHash, projection.projectionHash);
    assert.equal(coldProjection.occurrenceCensus.sourceOccurrenceCount, 4);
    assertPrivateTree(directory);
  });
