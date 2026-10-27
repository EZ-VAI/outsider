import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ACTION_ADMISSION_NO_AUTHORITY,
  createActionEvidenceCommitment,
  createActionResponsibilityCommitment,
  createUnresolvedExternalAuthoritySlot,
  requestActionAdmission,
} from "../src/outsider-action-admission.js";
import {
  ACTION_OBLIGATION_HOLD_COMPOSITION_SCHEMAS,
  deriveActionObligationResponsibilityRefHash,
  verifyActionObligationHoldComposition,
} from "../src/outsider-action-obligation-hold-composition.js";
import { normalizeDelegationRadius } from "../src/outsider-delegation-radius.js";
import {
  RealityObligationFixtureStoreForTests,
  RealityObligationStore,
} from "../src/outsider-reality-obligation-store.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const CREATED_AT = "2026-08-27T00:00:00.000Z";
const EVALUATED_AT = "2026-08-27T12:00:00.000Z";
const VALIDITY = Object.freeze({
  validFrom: "2026-08-27T00:00:00.000Z",
  validUntil: "2026-08-28T00:00:00.000Z",
});

function temporaryLedger(t, label) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-action-obligation-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return path.join(root, label);
}

function obligationInput(directory) {
  return {
    directory,
    obligationId: "obligation-composition-1",
    bindings: {
      claimHash: h("claim"),
      wayHash: h("way"),
      worldHash: h("world"),
      episodeHash: h("episode"),
      attemptHash: h("attempt"),
      censusRegistrationHash: h("census"),
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
        observationRequirementHash: h("observation:immediate"),
        mandatory: true,
      },
      {
        horizonId: "delayed",
        dueAfterMs: 86_400_000,
        observationRequirementHash: h("observation:delayed"),
        mandatory: true,
      },
    ],
    createdAt: CREATED_AT,
  };
}

function radius(limit) {
  return normalizeDelegationRadius({
    validity: VALIDITY,
    grants: [{
      atom: "OBSERVE",
      scopeHashes: [h("scope")],
      budget: { unitHash: h("unit"), limit },
    }],
  });
}

function admissionSource(snapshot, overrides = {}) {
  const capabilityRadius = radius("2");
  const effectRadius = radius("3");
  const authorityRadius = radius("4");
  const evidenceRadius = radius("5");
  const responsibilityRadius = radius("6");
  const affectedChannelHash = overrides.affectedChannelHash ?? h("affected-channel");
  const horizonHashes = overrides.horizonHashes ?? snapshot.genesis.mandatoryHorizons
    .map(({ horizonCommitmentHash }) => horizonCommitmentHash);
  const responsibilityRefHash = deriveActionObligationResponsibilityRefHash({
    genesisHash: snapshot.genesis.genesisHash,
    stateHash: snapshot.stateHash,
  });
  const subject = {
    claimHash: snapshot.genesis.bindings.claimHash,
    wayHash: snapshot.genesis.bindings.wayHash,
    worldHash: snapshot.genesis.bindings.worldHash,
    episodeHash: snapshot.genesis.bindings.episodeHash,
    attemptHash: snapshot.genesis.bindings.attemptHash,
    censusHash: snapshot.genesis.bindings.censusRegistrationHash,
    ...overrides.subject,
  };
  return {
    bindings: {
      claimWayWorld: {
        claimHash: subject.claimHash,
        wayHash: subject.wayHash,
        worldHash: subject.worldHash,
      },
      run: {
        episodeHash: subject.episodeHash,
        attemptHash: subject.attemptHash,
        censusHash: subject.censusHash,
      },
      governance: {
        ownerGateSlotHash: h("owner-gate-slot"),
        adoptionSlotHash: h("adoption-slot"),
        revocationStatusSlotHash: h("revocation-status-slot"),
      },
      /* This remains the action/world before-state.  The obligation state is
         bound independently by the responsibility reference below. */
      state: { beforeStateHash: overrides.beforeStateHash ?? h("world-before-state") },
      validity: {
        validitySlotHash: h("validity-slot"),
        evaluatedAt: overrides.evaluatedAt ?? EVALUATED_AT,
      },
    },
    capabilityRadius,
    effectRadius,
    referencedAuthority: {
      radius: authorityRadius,
      externalVerifierSlot: createUnresolvedExternalAuthoritySlot({
        externalVerifierContractHash: h("external-verifier-contract"),
        authorityArtifactRefHash: h("authority-artifact-ref"),
        authorityRadiusHash: authorityRadius.radiusHash,
      }),
    },
    evidence: {
      radius: evidenceRadius,
      commitment: createActionEvidenceCommitment({
        commitmentRefHash: h("evidence-ref"),
        radius: evidenceRadius,
        affectedChannelHashes: [affectedChannelHash],
        horizonHashes,
        custodianRefHashes: [h("custodian")],
      }),
    },
    responsibility: {
      radius: responsibilityRadius,
      commitment: createActionResponsibilityCommitment({
        commitmentRefHash: overrides.responsibilityRefHash ?? responsibilityRefHash,
        radius: responsibilityRadius,
        affectedChannelHashes: [affectedChannelHash],
        horizonHashes,
        responsiblePartyRefHashes: [h("responsible-party")],
      }),
    },
    consequenceEnvelope: {
      affectedChannelHashes: [affectedChannelHash],
      horizonHashes,
    },
  };
}

function verifyInput(directory, snapshot, source) {
  const admissionRequest = requestActionAdmission(source);
  return {
    admissionRequest,
    admissionSource: source,
    expectedAdmissionRequestHash: admissionRequest.admissionRequestHash,
    obligationDirectory: directory,
    expectedObligationGenesisHash: snapshot.genesis.genesisHash,
    expectedObligationStateHash: snapshot.stateHash,
  };
}

function assertHeld(result) {
  assert.equal(result.decisionState, "HOLD");
  assert.equal(result.admitted, false);
  assert.equal(result.actionReady, false);
  assert.equal(result.executable, false);
  assert.equal(result.executionToken, null);
  assert.equal(result.authorityEstablished, false);
  assert.equal(result.liveActionConnected, false);
  assert.deepEqual(result.authority, ACTION_ADMISSION_NO_AUTHORITY);
  assert.ok(Object.values(result.authority).every((value) => value === false));
}

test("exact production genesis/state reference is replayed but semantic composition stays unresolved", (t) => {
  const directory = temporaryLedger(t, "production");
  const store = RealityObligationStore.create(obligationInput(directory));
  const snapshot = store.snapshot();
  const source = admissionSource(snapshot);
  const result = verifyActionObligationHoldComposition(
    verifyInput(directory, snapshot, source));

  assert.equal(result.schema,
    ACTION_OBLIGATION_HOLD_COMPOSITION_SCHEMAS.verification);
  assert.equal(result.ok, false);
  assert.equal(result.structuralCompositionVerified, false);
  assert.equal(result.referenceIntegrityVerified, true);
  assert.equal(result.obligation.genesisHash, snapshot.genesis.genesisHash);
  assert.equal(result.obligation.stateHash, snapshot.stateHash);
  assert.equal(result.obligation.revision, 0);
  assert.equal(result.obligation.status, "PRECOMMITTED");
  assert.equal(result.checks.exactClaimWayWorldEpisodeAttemptCensus, true);
  assert.equal(result.checks.responsibilityCommitmentOpaqueGenesisStateReferenceBound, true);
  assert.equal(result.checks.affectedPartyRootSourceReplayed, false);
  assert.equal(result.checks.responsibilityGraphSourceReplayed, false);
  assert.equal(result.checks.consequenceChannelsBoundToObligationGenesis, true);
  assert.equal(result.checks.mandatoryHorizonProjectionBound, true);
  assert.equal(result.checks.consequenceEnvelopeSourceProjectedFromEffect, false);
  assert.ok(result.productionBlockers.includes(
    "AFFECTED_PARTY_ROOT_NOT_SOURCE_REPLAYED"));
  assert.deepEqual(result.subjectBindings, {
    claimHash: snapshot.genesis.bindings.claimHash,
    wayHash: snapshot.genesis.bindings.wayHash,
    worldHash: snapshot.genesis.bindings.worldHash,
    episodeHash: snapshot.genesis.bindings.episodeHash,
    attemptHash: snapshot.genesis.bindings.attemptHash,
    censusHash: snapshot.genesis.bindings.censusRegistrationHash,
  });
  assert.equal(Object.isFrozen(result), true);
  assertHeld(result);
});

test("each Claim/Way/World/episode/attempt/census mismatch fails closed and stays HOLD", (t) => {
  const directory = temporaryLedger(t, "subject-mismatch");
  const snapshot = RealityObligationStore.create(obligationInput(directory)).snapshot();
  for (const field of ["claimHash", "wayHash", "worldHash", "episodeHash",
    "attemptHash", "censusHash"]) {
    const source = admissionSource(snapshot, { subject: { [field]: h(`other:${field}`) } });
    const result = verifyActionObligationHoldComposition(
      verifyInput(directory, snapshot, source));
    assert.equal(result.ok, false, field);
    assert.match(result.error, /SUBJECT_BINDING_MISMATCH/u, field);
    assertHeld(result);
  }
});

test("responsibility ref binds exact genesis/state without conflating action before-state", (t) => {
  const directory = temporaryLedger(t, "binding-mismatch");
  const snapshot = RealityObligationStore.create(obligationInput(directory)).snapshot();

  const wrongRef = admissionSource(snapshot, { responsibilityRefHash: h("wrong-ref") });
  const refResult = verifyActionObligationHoldComposition(
    verifyInput(directory, snapshot, wrongRef));
  assert.equal(refResult.ok, false);
  assert.match(refResult.error, /RESPONSIBILITY_COMMITMENT_OBLIGATION_BINDING_MISMATCH/u);
  assertHeld(refResult);

  const independentActionState = admissionSource(snapshot, {
    beforeStateHash: h("independent-world-before-state"),
  });
  const independentStateResult = verifyActionObligationHoldComposition(
    verifyInput(directory, snapshot, independentActionState));
  assert.equal(independentStateResult.ok, false);
  assert.equal(independentStateResult.referenceIntegrityVerified, true);
  assertHeld(independentStateResult);

  assert.notEqual(deriveActionObligationResponsibilityRefHash({
    genesisHash: snapshot.genesis.genesisHash,
    stateHash: snapshot.stateHash,
  }), deriveActionObligationResponsibilityRefHash({
    genesisHash: snapshot.genesis.genesisHash,
    stateHash: h("different-state"),
  }));
});

test("any obligation event invalidates the pre-action state binding", (t) => {
  const directory = temporaryLedger(t, "advanced");
  const store = RealityObligationStore.create(obligationInput(directory));
  const precommit = store.snapshot();
  const source = admissionSource(precommit);
  const admissionRequest = requestActionAdmission(source);
  const advanced = store.activate({
    commandId: "activate",
    expectedRevision: precommit.revision,
    expectedStateHash: precommit.stateHash,
    occurredAt: "2026-08-27T12:00:00.000Z",
  });
  const result = verifyActionObligationHoldComposition({
    admissionRequest,
    admissionSource: source,
    expectedAdmissionRequestHash: admissionRequest.admissionRequestHash,
    obligationDirectory: directory,
    expectedObligationGenesisHash: advanced.genesis.genesisHash,
    expectedObligationStateHash: advanced.stateHash,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /PRODUCTION_PRECOMMITTED_NO_AUTHORITY_OBLIGATION_REQUIRED/u);
  assertHeld(result);
});

test("fixture ledgers, forged admissions, and caller fields cannot create a positive path", (t) => {
  const directory = temporaryLedger(t, "fixture");
  const snapshot = RealityObligationFixtureStoreForTests
    .create(obligationInput(directory)).snapshot();
  const source = admissionSource(snapshot);
  const fixtureResult = verifyActionObligationHoldComposition(
    verifyInput(directory, snapshot, source));
  assert.equal(fixtureResult.ok, false);
  assert.match(fixtureResult.error,
    /PRODUCTION_PRECOMMITTED_NO_AUTHORITY_OBLIGATION_REQUIRED/u);
  assertHeld(fixtureResult);

  const productionDirectory = temporaryLedger(t, "forged");
  const productionSnapshot = RealityObligationStore
    .create(obligationInput(productionDirectory)).snapshot();
  const productionSource = admissionSource(productionSnapshot);
  const forgedInput = verifyInput(productionDirectory, productionSnapshot, productionSource);
  forgedInput.admissionRequest = structuredClone(forgedInput.admissionRequest);
  forgedInput.admissionRequest.decision.actionReady = true;
  const forgedResult = verifyActionObligationHoldComposition(forgedInput);
  assert.equal(forgedResult.ok, false);
  assert.match(forgedResult.error, /ADMISSION_SOURCE_REPLAY_FAILED/u);
  assertHeld(forgedResult);

  const extraField = verifyInput(productionDirectory, productionSnapshot, productionSource);
  extraField.authorityEstablished = true;
  const extraResult = verifyActionObligationHoldComposition(extraField);
  assert.equal(extraResult.ok, false);
  assert.match(extraResult.error, /VERIFY_INPUT_FIELDS_INVALID/u);
  assertHeld(extraResult);
});

test("a valid HOLD request with a radius or coverage gap is not a verified composition", (t) => {
  const directory = temporaryLedger(t, "coverage-gap");
  const snapshot = RealityObligationStore.create(obligationInput(directory)).snapshot();
  const source = admissionSource(snapshot);
  source.consequenceEnvelope.affectedChannelHashes = [h("uncovered-channel")];
  const result = verifyActionObligationHoldComposition(
    verifyInput(directory, snapshot, source));
  assert.equal(result.ok, false);
  assert.match(result.error, /ADMISSION_RADIUS_OR_COMMITMENT_COVERAGE_GAP/u);
  assertHeld(result);
});

test("caller-self-consistent channel and horizon sets cannot splice around the obligation", (t) => {
  const directory = temporaryLedger(t, "semantic-splice");
  const snapshot = RealityObligationStore.create(obligationInput(directory)).snapshot();

  const channelSource = admissionSource(snapshot, {
    affectedChannelHash: h("uncommitted-channel"),
  });
  const channelResult = verifyActionObligationHoldComposition(
    verifyInput(directory, snapshot, channelSource));
  assert.equal(channelResult.ok, false);
  assert.match(channelResult.error, /CONSEQUENCE_CHANNEL_NOT_PRECOMMITTED/);
  assertHeld(channelResult);

  const horizonSource = admissionSource(snapshot, {
    horizonHashes: [h("uncommitted-horizon")],
  });
  const horizonResult = verifyActionObligationHoldComposition(
    verifyInput(directory, snapshot, horizonSource));
  assert.equal(horizonResult.ok, false);
  assert.match(horizonResult.error, /CONSEQUENCE_HORIZON_NOT_PRECOMMITTED/);
  assertHeld(horizonResult);
});
