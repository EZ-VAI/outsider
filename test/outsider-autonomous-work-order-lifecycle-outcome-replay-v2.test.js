import assert from "node:assert/strict";
import test from "node:test";

import {
  NETWORK_INTAKE_BOUNDARY,
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
} from "../src/outsider-network-intake.js";
import {
  createNetworkLifecycleHeadCheckpoint,
} from "../src/outsider-network-lifecycle-head-checkpoint.js";
import {
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_BOUNDARY,
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_SCHEMAS,
  auditAutonomousWorkOrderLifecyclePageBytesV2,
  createAutonomousWorkOrderLifecycleOutcomeReplayReceiptV2,
  verifyAutonomousWorkOrderLifecycleOutcomeReplayReceiptV2,
} from "../src/outsider-autonomous-work-order-lifecycle-outcome-replay-v2.js";
import {
  createStage5NodeBundle,
  stage5Hash as h,
} from "./helpers/outsider-network-stage5-fixture.js";

const SOURCE_BOUNDARY = {
  ...NETWORK_INTAKE_BOUNDARY,
  disposition: "QUARANTINED",
  automaticTraining: false,
  trainingRows: 0,
  authorityGrants: 0,
  actionAdmissions: 0,
  ceuUnits: 0,
  permitsAuthority: false,
  permitsAction: false,
  permitsCeu: false,
  permitsCuratePromotion: false,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
};

function subject() {
  return {
    claimHash: h("stage1c:claim"),
    wayHash: h("stage1c:way"),
    worldHash: h("stage1c:world"),
    episodeHash: h("stage1c:episode"),
    attemptHash: h("stage1c:attempt"),
    actorIdentityEnvelopeHash: h("stage1c:actor-envelope"),
    accountableDeploymentSubjectHash: h("stage1c:deployment"),
    attemptActorSubjectHash: h("stage1c:attempt-actor"),
    cohortHash: h("stage1c:cohort"),
    censusSlotHash: h("stage1c:slot"),
  };
}

function payload(selected) {
  return {
    schema: NETWORK_INTAKE_PAYLOAD_SCHEMAS.ACTION_OUTCOME,
    attemptRecordHash: selected.attemptHash,
    executionEvidenceHash: h("stage1c:execution"),
    outcomeEvidenceHash: h("stage1c:outcome"),
    obligationStateHash: h("stage1c:obligation"),
    sourceArtifactHash: h("stage1c:source-artifact"),
    sourceReplayReferenceHash: h("stage1c:source-replay"),
    externalOutcomeVerified: false,
    causalAttributionEstablished: false,
    obligationClosed: false,
  };
}

function pageFor(row, selectedPayload) {
  const current = (event, object) => ({
    event,
    object,
    derivedState: { reservationStatus: "SETTLED" },
    retention: {
      retentionUntil: event.retentionUntil,
      payloadTombstoned: false,
      tombstonedAt: null,
    },
  });
  return {
    schema: "outsider/network-quarantine-export/v1",
    registryId: row.bundle.receipt.registryId,
    generatedAt: "2026-08-28T00:10:00.000Z",
    lane: null,
    count: 2,
    items: [current(row.bundle.reservationEvent, null),
      current(row.bundle.settlementEvent, selectedPayload)],
    nextCursor: null,
    eventChain: {
      eventCount: 2,
      tailHash: row.bundle.settlementEvent.eventHash,
      appendOnlyReplayVerified: true,
    },
    derivedLedgerAudit: {
      verified: true,
      retentionSweep: {
        generatedAt: "2026-08-28T00:10:00.000Z",
        sourceClaimOnly: true,
      },
    },
    occurrencePolicy:
      "CONTENT_IS_CAS_DEDUPLICATED_OCCURRENCES_ARE_NEVER_DEDUPLICATED",
    useBoundary: SOURCE_BOUNDARY,
  };
}

test("v2 boundary never promotes local pins, different keys, or delayed reports", () => {
  const boundary = AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_BOUNDARY;
  assert.equal(boundary.integrationStatus, "AUDITED_DRAFT_NOT_INTEGRATED");
  assert.equal(boundary.successReceiptMintingEnabled, false);
  assert.equal(boundary.censusHashRolesCollapsed, false);
  assert.equal(boundary.affectedPartyRootContinuityAcrossCensusRolesEstablished,
    false);
  assert.equal(boundary.sameAffectedPartySetEstablished, false);
  assert.equal(boundary.roleAwareAffectedPartyCertificateProtocolEstablished,
    false);
  assert.equal(boundary.roleAwareObligationGenesisProtocolEstablished, false);
  assert.equal(boundary.pageByteAuditMaximumPageBytes, 1024 * 1024);
  assert.equal(boundary.pageByteAuditMaximumTotalBytes, 4 * 1024 * 1024);
  assert.equal(boundary.localCheckpointIsExternalHead, false);
  assert.equal(boundary.callerPinnedCheckpointIsExternalHead, false);
  assert.equal(boundary.callerPinnedRekorOrProviderDigestIsExternalHead, false);
  assert.equal(boundary.differentKeysAcceptedAsOrganizationalIndependence, false);
  assert.equal(boundary.organizationalIndependenceEstablished, false);
  assert.equal(boundary.delayedWitnessAcceptedAsIndependentOutcomeTruth, false);
  assert.equal(boundary.independentOutcomeTruthEstablished, false);
  assert.equal(boundary.obligationClosureEstablished, false);
  assert.equal(boundary.externalHeadAnchorEstablished, false);
  assert.equal(boundary.fullAttemptAncestryReplayVerified, false);
  assert.equal(boundary.episodeAttemptDenominatorComplete, false);
  assert.equal(boundary.authority, "NONE");
  assert.equal(boundary.enabledCapabilityCount, 0);
  assert.equal(boundary.provenAuthorityCount, 0);
  assert.equal(boundary.enabledCapabilitiesSubsetOfProvenAuthority, true);
});

test("failure verification remains typed HOLD with zero authority and economics", () => {
  const checked = verifyAutonomousWorkOrderLifecycleOutcomeReplayReceiptV2({}, {});
  assert.equal(checked.schema,
    AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_SCHEMAS.verification);
  assert.equal(checked.ok, false);
  assert.equal(checked.integrationStatus, "AUDITED_DRAFT_NOT_INTEGRATED");
  assert.equal(checked.successReceiptMintingEnabled, false);
  assert.equal(checked.lifecycleExactExportByteReplayIntegrated, false);
  assert.equal(checked.lifecycleSourceReviewByteReplayIntegrated, false);
  assert.equal(checked.delayedWitnessSourceByteReplayIntegrated, false);
  assert.equal(checked.sourceReplayVerified, false);
  assert.equal(checked.externalHeadAnchorVerified, false);
  assert.equal(checked.independentOutcomeTruthEstablished, false);
  assert.equal(checked.organizationalIndependenceEstablished, false);
  assert.equal(checked.obligationClosureEstablished, false);
  assert.equal(checked.authority, "NONE");
  assert.equal(checked.actionReady, false);
  assert.equal(checked.trainingRows, 0);
  assert.equal(checked.causalExperienceUnits, 0);
  assert.equal(checked.permitsGuarantee, false);
  assert.equal(checked.permitsSettlement, false);
  assert.match(checked.error,
    /NOT_INTEGRATED_CENSUS_ROLE_AND_OBLIGATION_ROOT_PROTOCOL_REQUIRED/u);
});

test("audited draft refuses to mint a receipt across incompatible census roles",
  () => {
    assert.throws(
      () => createAutonomousWorkOrderLifecycleOutcomeReplayReceiptV2({}, {}),
      /NOT_INTEGRATED_CENSUS_ROLE_AND_OBLIGATION_ROOT_PROTOCOL_REQUIRED/u);
  });

test("page byte audit survives Buffer.prototype.toString poisoning without replay claims",
  () => {
    const pageBytes = Buffer.from("{\"schema\":\"fixture-only\"}\n", "utf8");
    const original = Buffer.prototype.toString;
    try {
      Buffer.prototype.toString = function poisonedBufferToString() {
        throw new Error("POISONED_BUFFER_TO_STRING_MUST_NOT_RUN");
      };
      const audit = auditAutonomousWorkOrderLifecyclePageBytesV2([pageBytes]);
      assert.equal(audit.schema,
        AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_SCHEMAS.pageByteAudit);
      assert.equal(audit.pageCount, 1);
      assert.equal(audit.exactByteCount, pageBytes.length);
      assert.equal(audit.jsonParsingCompleted, true);
      assert.equal(audit.lifecycleReplayVerified, false);
      assert.equal(audit.rawPagesProjected, false);
      assert.equal(audit.authority, "NONE");
      assert.equal(audit.actionReady, false);
    } finally {
      Buffer.prototype.toString = original;
    }
  });

test("page byte audit rejects an oversized page before copying or parsing", () => {
  const oversized = Buffer.alloc(
    AUTONOMOUS_WORK_ORDER_LIFECYCLE_OUTCOME_REPLAY_V2_BOUNDARY
      .pageByteAuditMaximumPageBytes + 1);
  assert.throws(
    () => auditAutonomousWorkOrderLifecyclePageBytesV2([oversized]),
    /LIFECYCLE_EXPORT_PAGE_BYTE_LIMIT_EXCEEDED/u);
});

test("the existing isolated node fixture is not laundered into a full lifecycle head",
  () => {
    const selectedSubject = subject();
    const selectedPayload = payload(selectedSubject);
    const row = createStage5NodeBundle({
      lane: "ACTION_OUTCOME",
      subject: selectedSubject,
      payload: selectedPayload,
      source: {
        sourceManifestHash: h("stage1c:source"),
        instrumentHash: h("stage1c:instrument"),
        rightsReviewHash: h("stage1c:rights"),
        privacyReviewHash: h("stage1c:privacy"),
      },
      clientSubmissionId: "stage1c_lifecycle_audit_0001",
      createdAt: "2026-08-28T00:00:00.000Z",
      ordinal: 1,
    });
    const page = pageFor(row, selectedPayload);
    assert.throws(() => createNetworkLifecycleHeadCheckpoint({
      exportPageBytes: [Buffer.from(`${JSON.stringify(page)}\n`, "utf8")],
      createdAt: "2026-08-28T00:11:00.000Z",
    }), /NETWORK_LIFECYCLE_HEAD_/u,
    "the helper's caller-invented previous hash is not the lifecycle genesis");
  });
