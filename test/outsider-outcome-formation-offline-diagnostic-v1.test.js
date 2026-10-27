import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createActionEvidenceCommitment,
  createActionResponsibilityCommitment,
  createUnresolvedExternalAuthoritySlot,
  requestActionAdmission,
} from "../src/outsider-action-admission.js";
import { createAutonomousWorkOrderProjection }
  from "../src/outsider-autonomous-work-order.js";
import { normalizeDelegationRadius }
  from "../src/outsider-delegation-radius.js";
import { createEpisodeAttemptSetComposition }
  from "../src/outsider-episode-attempt-set-composition.js";
import {
  OUTSIDER_OUTCOME_FORMATION_OFFLINE_DIAGNOSTIC_V1,
  evaluateOutcomeFormationOfflineDiagnosticV1,
  readPrivateCanonicalFormationInputV1,
} from "../src/outsider-outcome-formation-offline-diagnostic-v1.js";
import {
  createExternalCapacityReservationReceiptBindingV1,
  createOwnerOneUseMandateV1,
  createProviderOneUseAcceptanceV1,
} from "../src/outsider-one-use-commitments-v1.js";
import { compileOutcomeTenderV1 }
  from "../src/outsider-outcome-tender-v1.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(repositoryRoot, "scripts", "outcome-formation-evaluate.mjs");
const h = (label) => `sha256:${createHash("sha256")
  .update(`offline-diagnostic:${label}`, "utf8").digest("hex")}`;
const id = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;

function graph() {
  return {
    principalEpoch: {
      principalRefHash: h("principal"),
      epochRefHash: h("epoch"),
      principalEpochProjectionHash: h("principal-epoch"),
    },
    accountableDeployment: {
      deploymentLineageRefHash: h("deployment-lineage"),
      deploymentRevisionHash: h("deployment-revision"),
      accountableDeploymentSubjectHash: h("deployment-subject"),
    },
    runtime: {
      runtimeInstanceRefHash: h("runtime-ref"),
      runtimeInstanceHash: h("runtime"),
    },
    embodiment: {
      present: true,
      deviceLineageRefHash: h("device-lineage"),
      embodimentRevisionHash: h("embodiment-revision"),
    },
    delegation: {
      delegationEvidenceRefHash: h("delegation-evidence"),
      delegationEdgeHash: h("delegation-edge"),
    },
    episode: {
      episodeHash: h("episode"),
      networkCompleteEpisodeJoinHash: h("complete-episode"),
    },
    attempt: {
      attemptHash: h("attempt"),
      attemptActorSubjectHash: h("attempt-actor"),
    },
  };
}

function workOrder() {
  const provider = h("provider");
  return createAutonomousWorkOrderProjection({
    orderId: id("awo", "work-order"),
    recordedAt: "2026-09-02T12:00:00.000Z",
    appendOnlyLineage: {
      revision: 0,
      predecessorProjectionHash: null,
      supersedesProjectionHash: null,
    },
    typedGraph: graph(),
    contractReferences: {
      actorIdentityEnvelopeHash: h("identity-envelope"),
      realitySemanticBundleHash: h("semantic-bundle"),
      realityObligationGenesisHash: h("obligation-genesis"),
      realityObligationStateHash: h("obligation-state"),
      affectedPartyRootHash: h("affected-party-root"),
      outcomeWitnessEnvelopeHash: null,
    },
    resourceOwner: {
      resourceOwnerRefHash: h("owner"),
      ownerAdoptionEvidenceRefHash: null,
      externalAdoptionEstablished: false,
    },
    promisedOutcome: {
      promisedOutcomeRefHash: h("outcome-spec"),
      acceptanceCriteriaHash: h("acceptance-criteria"),
      outcomeWitnessRequirementHash: h("probe-requirement"),
      consequenceChannelHashes: [h("affected-channel")],
    },
    observationHorizons: [{
      horizonId: "immediate",
      dueAfterMs: 0,
      observationRequirementHash: h("probe-requirement"),
      mandatory: true,
    }, {
      horizonId: "longitudinal",
      dueAfterMs: 86_400_000,
      observationRequirementHash: h("probe-requirement"),
      mandatory: true,
    }],
    obligors: [{
      obligorRefHash: provider,
      role: "PRIMARY_PERFORMANCE",
      obligationRefHash: h("performance-obligation"),
    }, {
      obligorRefHash: provider,
      role: "RECOVERY",
      obligationRefHash: h("recovery-obligation"),
    }],
    remedyMenu: [{
      remedyId: "reperform",
      kind: "REPERFORM",
      remedyTermsHash: h("recovery-outcome"),
      obligorRefHashes: [provider],
    }],
    protectionFunding: { status: "NONE" },
    orderStatus: "STRUCTURAL_PRECOMMITMENT_HOLD",
    challenge: {
      opened: false,
      challengeRefHash: null,
      standingExternallyVerified: false,
    },
    closure: {
      closed: false,
      closureRefHash: null,
      externalClosureVerified: false,
    },
    proofAccessPolicy: {
      roleScopedProofPolicyHash: h("proof-policy"),
      redactionPolicyHash: h("redaction-policy"),
    },
  });
}

function tender(order) {
  const evidenceId = id("evidence", "independent-evidence");
  return compileOutcomeTenderV1({
    tenderId: id("tender", "tender"),
    compiledAt: "2026-09-02T12:00:00.000Z",
    lineage: {
      revision: 0,
      predecessorTenderHash: null,
      supersedesTenderHash: null,
    },
    workOrderHash: order.workOrderHash,
    typedGraph: graph(),
    authorizationBinding: {
      actorIdentityEnvelopeHash: h("identity-envelope"),
      delegationEvidenceRefHash: h("delegation-evidence"),
      delegationEdgeHash: h("delegation-edge"),
      authorityScopeRefHash: h("authority-scope"),
      resourceOwnerAuthorizationRefHash: h("owner-authorization"),
      rightsPrivacyPolicyRefHash: h("rights-policy"),
    },
    exactOutcome: {
      outcomeKindCode: "NETWORK_CONNECTIVITY_RESTORED",
      outcomeSpecRefHash: h("outcome-spec"),
      subjectRefHash: h("private-subject"),
      acceptanceCriteriaRefHash: h("acceptance-criteria"),
      conditions: [{
        conditionId: id("condition", "connected"),
        metricCode: "CONNECTIVITY_STATE",
        comparator: "EQUAL",
        target: {
          valueKind: "STATE_CODE",
          booleanValue: null,
          integerValue: null,
          stateCode: "CONNECTED",
          unitCode: null,
        },
        observationWindowMs: 0,
        conditionRefHash: h("connected-condition"),
        mandatory: true,
      }],
      deadline: "2026-09-03T12:00:00.000Z",
    },
    formationDeadline: "2026-09-02T12:30:00.000Z",
    resourceRequirements: [{
      resourceRequirementId: id("resource", "technician"),
      resourceClassCode: "NETWORK_TECHNICIAN",
      capabilityRefHash: h("technician-capability"),
      quantity: 1,
      unitCode: "PERSON_VISIT",
      regionRefHash: h("private-region"),
      requiredBy: "2026-09-03T08:00:00.000Z",
      mandatory: true,
    }],
    evidenceRequirements: [{
      evidenceRequirementId: evidenceId,
      evidenceClassCode: "INDEPENDENT_NETWORK_PROBE",
      evidenceRequirementRefHash: h("probe-requirement"),
      sourceControl: "INDEPENDENT_OF_PROVIDER",
      observationMode: "LONGITUDINAL",
      dueBy: "2026-09-03T12:00:00.000Z",
      mandatory: true,
    }],
    recoveryRequirements: [{
      recoveryRequirementId: id("recovery", "alternate"),
      triggerRefHash: h("recovery-trigger"),
      recoveryOutcomeRefHash: h("recovery-outcome"),
      resourceClassCode: "ALTERNATE_NETWORK_TECHNICIAN",
      maximumAttempts: 2,
      completionDeadline: "2026-09-03T12:00:00.000Z",
      recoveryEvidenceRequirementId: evidenceId,
      routePolicy: "ALTERNATE_RESOURCE_REQUIRED",
      mandatory: true,
    }],
    maximumConsequence: {
      consequenceEnvelopeRefHash: h("consequence-envelope"),
      consequenceClassCode: "BOUNDED_SERVICE_INTERRUPTION",
      measureCode: "MAXIMUM_INTERRUPTION_MINUTES",
      maximumValue: 240,
      unitCode: "MINUTE",
      affectedChannelRefHashes: [h("affected-channel")],
      irreversibleHarmAllowed: false,
      unboundedConsequenceAllowed: false,
    },
    zeroInternalOps: {
      outsiderStaffInterventionsAllowed: 0,
      internalManualSourcingAllowed: false,
      internalManualCoordinationAllowed: false,
      internalManualVerificationAllowed: false,
      internalManualRecoveryAllowed: false,
      humanQueueFallbackAllowed: false,
      failureDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    },
  });
}

function radius(limit) {
  return normalizeDelegationRadius({
    validity: {
      validFrom: "2026-09-02T11:00:00.000Z",
      validUntil: "2026-09-02T13:00:00.000Z",
    },
    grants: [{
      atom: "OBSERVE",
      scopeHashes: [h("scope")],
      budget: { unitHash: h("budget-unit"), limit },
    }],
  });
}

function actionSource() {
  const capability = radius("1");
  const effect = radius("2");
  const authority = radius("3");
  const evidence = radius("4");
  const responsibility = radius("5");
  const channel = h("affected-channel");
  const horizonHashes = [h("horizon")];
  return {
    bindings: {
      claimWayWorld: {
        claimHash: h("claim"),
        wayHash: h("way"),
        worldHash: h("world"),
      },
      run: {
        episodeHash: h("episode"),
        attemptHash: h("attempt"),
        censusHash: h("prospective-census"),
      },
      governance: {
        ownerGateSlotHash: h("owner-gate"),
        adoptionSlotHash: h("adoption"),
        revocationStatusSlotHash: h("revocation"),
      },
      state: { beforeStateHash: h("before-state") },
      validity: {
        validitySlotHash: h("validity-slot"),
        evaluatedAt: "2026-09-02T12:05:00.000Z",
      },
    },
    capabilityRadius: capability,
    effectRadius: effect,
    referencedAuthority: {
      radius: authority,
      externalVerifierSlot: createUnresolvedExternalAuthoritySlot({
        externalVerifierContractHash: h("authority-verifier"),
        authorityArtifactRefHash: h("authority-artifact"),
        authorityRadiusHash: authority.radiusHash,
      }),
    },
    evidence: {
      radius: evidence,
      commitment: createActionEvidenceCommitment({
        commitmentRefHash: h("evidence-commitment"),
        radius: evidence,
        affectedChannelHashes: [channel],
        horizonHashes,
        custodianRefHashes: [h("custodian")],
      }),
    },
    responsibility: {
      radius: responsibility,
      commitment: createActionResponsibilityCommitment({
        commitmentRefHash: h("responsibility-commitment"),
        radius: responsibility,
        affectedChannelHashes: [channel],
        horizonHashes,
        responsiblePartyRefHashes: [h("responsible-party")],
      }),
    },
    consequenceEnvelope: {
      affectedChannelHashes: [channel],
      horizonHashes,
    },
  };
}

function attemptSet(order) {
  return createEpisodeAttemptSetComposition({
    recordedAt: "2026-09-02T12:02:00.000Z",
    episodeBinding: {
      principalEpochProjectionHash: h("principal-epoch"),
      accountableDeploymentSubjectHash: h("deployment-subject"),
      runtimeInstanceHash: h("runtime"),
      embodimentRevisionHash: h("embodiment-revision"),
      delegationEdgeHash: h("delegation-edge"),
      episodeHash: h("episode"),
      workOrderProjectionHash: order.workOrderHash,
      networkCompleteEpisodeJoinHash: h("complete-episode"),
      prospectiveCensusProjectionHash: h("prospective-census"),
      realityObligationGenesisHash:
        order.contractReferences.realityObligationGenesisHash,
      realityObligationStateHash:
        order.contractReferences.realityObligationStateHash,
      genesisObligationAttemptHash: h("attempt"),
    },
    appendOnlyLineage: {
      revision: 0,
      predecessorCompositionHash: null,
      supersedesCompositionHash: null,
    },
    attempts: [{
      attemptOrdinal: 1,
      occurredAt: "2026-09-02T12:01:00.000Z",
      episodeHash: h("episode"),
      attemptHash: h("attempt"),
      attemptActorSubjectHash: h("attempt-actor"),
      kind: "PRIMARY",
      retryOfAttemptHash: null,
      recoveryOfAttemptHash: null,
    }],
    reportOccurrences: [],
  }, { predecessor: null });
}

function oneUse(compiledTender) {
  const commercialTerm = {
    quoteRefHash: h("quote-reference"),
    currency: "USD",
    amountMinor: "12500",
  };
  const common = {
    tenderHash: compiledTender.tenderHash,
    scopeHash: compiledTender.exactOutcome.exactOutcomeHash,
    evidencePlanHash: compiledTender.evidenceRequirements.requirementSetHash,
    remedyPlanHash: compiledTender.recoveryRequirements.requirementSetHash,
    commercialTerm,
    expiresAt: "2026-09-02T12:30:00.000Z",
    response: "ACCEPT",
  };
  const ownerMandate = createOwnerOneUseMandateV1({
    ...common,
    ownerPrincipalRefHash: h("owner-principal"),
    delegationEnvelopeHash: h("owner-delegation"),
    issuedAt: "2026-09-02T12:01:00.000Z",
    oneUseNonceHash: h("owner-nonce"),
    signatureRefHash: h("owner-signature"),
  });
  const providerAcceptance = createProviderOneUseAcceptanceV1({
    ...common,
    providerRefHash: h("provider"),
    acceptedAt: "2026-09-02T12:02:00.000Z",
    oneUseNonceHash: h("provider-nonce"),
    signatureRefHash: h("provider-signature"),
  });
  const capacityReservationReceipt
    = createExternalCapacityReservationReceiptBindingV1({
      tenderHash: compiledTender.tenderHash,
      scopeHash: compiledTender.exactOutcome.exactOutcomeHash,
      providerAcceptanceHash: providerAcceptance.providerAcceptanceHash,
      commercialTermHash: providerAcceptance.commercialTerm.commercialTermHash,
      externalSystemRefHash: h("capacity-system"),
      externalReservationRefHash: h("capacity-reservation"),
      externalReceiptArtifactHash: h("capacity-artifact"),
      issuedAt: "2026-09-02T12:03:00.000Z",
      reservedFrom: "2026-09-02T12:03:00.000Z",
      reservedUntil: "2026-09-03T13:00:00.000Z",
      status: "RESERVED",
      signatureRefHash: h("capacity-signature"),
    });
  return { ownerMandate, providerAcceptance, capacityReservationReceipt };
}

function input() {
  const order = workOrder();
  const compiledTender = tender(order);
  const action = actionSource();
  const request = requestActionAdmission(action);
  const composition = attemptSet(order);
  const commitments = oneUse(compiledTender);
  return {
    schema: OUTSIDER_OUTCOME_FORMATION_OFFLINE_DIAGNOSTIC_V1.inputSchema,
    source: {
      formationId: id("formation", "offline-diagnostic"),
      evaluatedAt: "2026-09-02T12:06:00.000Z",
      expectedTenderHash: compiledTender.tenderHash,
      tender: compiledTender,
      ownerMandate: commitments.ownerMandate,
      providerAcceptance: commitments.providerAcceptance,
      capacityReservationReceipt: commitments.capacityReservationReceipt,
      consumedNonceHashes: [],
      untrustedCallerAssertions: {
        capacityReceiptAuthentic: false,
        externalTrustEstablished: false,
        authorityEstablished: false,
        riskCapitalEstablished: false,
        custodyEstablished: false,
        adjudicationEstablished: false,
        independentWitnessEstablished: false,
        rightsPrivacyCleared: false,
        actionReady: false,
        priceAuthorityEstablished: false,
        guaranteeAuthorityEstablished: false,
        settlementAuthorityEstablished: false,
      },
      autonomousWorkOrder: order,
      actionAdmissionReplay: { request, source: action },
      attemptSetReplay: { composition, predecessor: null },
      networkOutcomeWitnessReplay: null,
      actionObligationHoldCompositionInput: null,
    },
  };
}

function sandbox(t) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()),
    "outsider-formation-cli-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { mode: 0o600 });
  chmodSync(file, 0o600);
}

function runCli(file, extra = []) {
  return spawnSync(process.execPath, [cli, file, ...extra], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("canonical private input replays source records and returns HOLD only", (t) => {
  const root = sandbox(t);
  const file = path.join(root, "input.json");
  writePrivate(file, canonicalizeStrict(input()));

  const parsed = readPrivateCanonicalFormationInputV1(file);
  assert.equal(parsed.schema,
    OUTSIDER_OUTCOME_FORMATION_OFFLINE_DIAGNOSTIC_V1.inputSchema);
  const summary = evaluateOutcomeFormationOfflineDiagnosticV1(file);
  assert.equal(summary.diagnosticVerificationOk, true);
  assert.equal(summary.sourceRecordsReplayed, true);
  assert.equal(summary.engineEvaluationRederived, true);
  assert.equal(summary.coreFoundationRecordsRederivedAndCrossBound, true);
  assert.equal(summary.tenderStructurallyVerified, true);
  assert.equal(summary.oneUseBindingsStructurallyVerified, true);
  assert.equal(summary.allRequiredFormationFoundationsReplayed, false);
  assert.equal(summary.externalCapacityEstablished, false);
  assert.equal(summary.externalTrustEstablished, false);
  assert.equal(summary.independentOutcomeTruthEstablished, false);
  assert.equal(summary.decisionState, "HOLD");
  assert.equal(summary.authority, "NONE");
  assert.equal(summary.actionReady, false);
  assert.equal(summary.executable, false);
  assert.equal(summary.cEnabledSubsetAProven, true);
  assert.equal(summary.priceEstablished, false);
  assert.equal(summary.guaranteeCreated, false);
  assert.equal(summary.settlementPermitted, false);
  assert.equal(summary.moneyMovementEnabled, false);
  assert.equal(summary.networkIoPerformed, false);
  assert.equal(summary.providerDiscoveryPerformed, false);
  assert.equal(summary.providerContactPerformed, false);
  assert.equal(summary.liveActionPerformed, false);
  assert.equal(summary.internalManualOperationsPerformed, false);
  assert.equal(summary.humanFallbackPermitted, false);
  assert.ok(summary.gapCodes.includes(
    "ACTION_ADMISSION_FULL_ORDER_SEMANTIC_BINDING_UNPROVEN"));
});

test("CLI emits only the bounded non-sensitive HOLD projection", (t) => {
  const root = sandbox(t);
  const secret = "PERSON_SECRET_DO_NOT_EMIT";
  const source = JSON.parse(JSON.stringify(input()));
  source.source.untrustedSecret = secret;
  const file = path.join(root, `${secret}.json`);
  writePrivate(file, canonicalizeStrict(source));

  const result = runCli(file);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, /PERSON_SECRET_DO_NOT_EMIT/u);
  assert.doesNotMatch(result.stdout, /outsider-formation-cli/u);
  assert.doesNotMatch(result.stdout, /sha256:[a-f0-9]{64}/u);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.diagnosticVerificationOk, false);
  assert.deepEqual(summary.gapCodes, ["INPUT_OR_SOURCE_REPLAY_REJECTED"]);
  assert.equal(summary.decisionState, "HOLD");
  assert.equal(summary.authority, "NONE");
  assert.equal(summary.actionReady, false);
  assert.equal(summary.moneyMovementEnabled, false);
});

test("CLI happy path is canonical, bounded, and never claims capacity or money",
  (t) => {
    const root = sandbox(t);
    const file = path.join(root, "valid.json");
    writePrivate(file, canonicalizeStrict(input()));
    const result = runCli(file);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.ok(Buffer.byteLength(result.stdout, "utf8") < 16_384);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.diagnosticVerificationOk, true);
    assert.equal(summary.decisionState, "HOLD");
    assert.equal(summary.externalCapacityEstablished, false);
    assert.equal(summary.priceEstablished, false);
    assert.equal(summary.guaranteeCreated, false);
    assert.equal(summary.settlementPermitted, false);
    assert.equal(summary.humanFallbackPermitted, false);
    assert.equal(result.stdout.trim(), canonicalizeStrict(summary));
  });

test("leaf and ancestor symlinks fail closed without leaking their targets", (t) => {
  const root = sandbox(t);
  const actual = path.join(root, "actual.json");
  writePrivate(actual, canonicalizeStrict(input()));
  const leafLink = path.join(root, "leaf.json");
  symlinkSync(actual, leafLink);
  assert.throws(() => readPrivateCanonicalFormationInputV1(leafLink),
    /INPUT_PATH_NOT_CANONICAL|PRIVATE_INPUT_FILE_INVALID/u);

  const actualDirectory = path.join(root, "actual-directory");
  mkdirSync(actualDirectory, { mode: 0o700 });
  const nested = path.join(actualDirectory, "input.json");
  writePrivate(nested, canonicalizeStrict(input()));
  const directoryLink = path.join(root, "linked-directory");
  symlinkSync(actualDirectory, directoryLink);
  const result = runCli(path.join(directoryLink, "input.json"));
  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.doesNotMatch(result.stdout, /actual-directory|linked-directory/u);
  assert.equal(JSON.parse(result.stdout).diagnosticVerificationOk, false);
});

test("oversize, corrupt, duplicate-key, and noncanonical JSON fail closed", (t) => {
  const root = sandbox(t);
  const oversize = path.join(root, "oversize.json");
  writePrivate(oversize,
    Buffer.alloc(OUTSIDER_OUTCOME_FORMATION_OFFLINE_DIAGNOSTIC_V1
      .maximumInputBytes + 1, 0x20));
  assert.equal(runCli(oversize).status, 1);

  const corrupt = path.join(root, "corrupt.json");
  writePrivate(corrupt, "{not-json");
  assert.equal(runCli(corrupt).status, 1);

  const duplicate = path.join(root, "duplicate.json");
  writePrivate(duplicate,
    `{\"schema\":\"${OUTSIDER_OUTCOME_FORMATION_OFFLINE_DIAGNOSTIC_V1.inputSchema}\",\"schema\":\"${OUTSIDER_OUTCOME_FORMATION_OFFLINE_DIAGNOSTIC_V1.inputSchema}\",\"source\":{}}`);
  assert.equal(runCli(duplicate).status, 1);

  const noncanonical = path.join(root, "noncanonical.json");
  writePrivate(noncanonical, `${JSON.stringify(input(), null, 2)}\n`);
  assert.equal(runCli(noncanonical).status, 1);
});

test("public mode, opaque replay inputs, missing core records, and extra args fail",
  (t) => {
    const root = sandbox(t);
    const publicFile = path.join(root, "public.json");
    writePrivate(publicFile, canonicalizeStrict(input()));
    chmodSync(publicFile, 0o400);
    assert.equal(runCli(publicFile).status, 1);
    chmodSync(publicFile, 0o644);
    assert.equal(runCli(publicFile).status, 1);

    const opaque = input();
    opaque.source.networkOutcomeWitnessReplay = {};
    const opaqueFile = path.join(root, "opaque.json");
    writePrivate(opaqueFile, canonicalizeStrict(opaque));
    assert.equal(runCli(opaqueFile).status, 1);

    const missing = input();
    missing.source.autonomousWorkOrder = null;
    const missingFile = path.join(root, "missing.json");
    writePrivate(missingFile, canonicalizeStrict(missing));
    assert.equal(runCli(missingFile).status, 1);

    const valid = path.join(root, "valid.json");
    writePrivate(valid, canonicalizeStrict(input()));
    const extra = runCli(valid, ["ignored-extra-argument"]);
    assert.equal(extra.status, 1);
    assert.equal(JSON.parse(extra.stdout).diagnosticVerificationOk, false);
  });
