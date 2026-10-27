import assert from "node:assert/strict";
import {
  createHash, createPrivateKey, generateKeyPairSync, sign as cryptoSign,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createStage3LocalRequestPolicy,
  inspectStage3ExternalReferenceReceipt,
  signStage3ExternalReferenceReceipt,
  Stage3GuaranteeGateStore,
  verifyStage3GuaranteeGateArtifacts,
  verifyStage3GuaranteeGateCheckpoint,
  verifyStage3GuaranteeGateDirectory,
  verifyStage3GuaranteeGateFull,
} from "../src/outsider-stage3-guarantee-gate.js";
import {
  buildStage3GateFullSourceFixture,
  fixtureHash as h,
  fixtureTime as at,
} from "./fixtures/stage3-gate-full-source-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function keyPair() {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function cas(snapshot, commandId, occurredAt, payload) {
  return {
    commandId,
    expectedRevision: snapshot.envelope.state.revision,
    expectedStateHash: snapshot.envelope.stateHash,
    occurredAt,
    payload,
  };
}

function stateHash(state) {
  return `sha256:${createHash("sha256")
    .update(`outsider/stage3-guarantee-gate-state/v1\0${canonicalizeStrict(state)}`)
    .digest("hex")}`;
}

function signerReseal(envelope, privateKeyPem) {
  const forged = structuredClone(envelope);
  forged.stateHash = stateHash(forged.state);
  forged.signing.signature = cryptoSign(null,
    Buffer.from(`outsider/stage3-guarantee-gate-state-signature/v1\0${forged.stateHash}`),
    createPrivateKey(privateKeyPem)).toString("base64");
  return forged;
}

function checkpointReseal(checkpoint, privateKeyPem) {
  const forged = structuredClone(checkpoint);
  const body = Object.fromEntries([
    "schema", "schemaVersion", "gateIdHash", "genesisHash", "sourceAnchorHash",
    "stateHash", "revision", "eventHeadHash", "createdAt", "signerKeyId",
  ].map((key) => [key, forged[key]]));
  forged.checkpointHash = `sha256:${createHash("sha256")
    .update(`outsider/stage3-guarantee-gate-checkpoint/v1\0${canonicalizeStrict(body)}`)
    .digest("hex")}`;
  forged.signature.value = cryptoSign(null,
    Buffer.from(`outsider/stage3-guarantee-gate-checkpoint-signature/v1\0${forged.checkpointHash}`),
    createPrivateKey(privateKeyPem)).toString("base64");
  return forged;
}

test("Stage 3 durable gate remains HOLD under accounting, concurrency and authority attacks",
  async (t) => {
    const source = await buildStage3GateFullSourceFixture();
    t.after(() => source.cleanup());
    const operator = keyPair();
    const rotated = keyPair();
    const fakeProvider = keyPair();
    let preRotationEnvelope;
    let postRotationCheckpoint;
    const policy = createStage3LocalRequestPolicy({
      policyIdHash: h("stage3-local-request-policy"),
      planningUnitHash: h("opaque-reference-planning-unit-no-currency"),
      aggregateRequestCeilingUnits: "100",
      perCandidateRequestCeilingUnits: "60",
      requiredAuditHookIds: ["owner-entrypoint", "alternate-write-path"],
      createdAt: at(31),
    });
    const gateDirectory = path.join(source.temporaryRoot, "gate");

    await t.test("only the exact fully replayed Stage34/abstain quote can initialize", async () => {
      assert.equal(source.stage34Context.stage2Frontier.sourceReplay
        .empiricalSixSourceLedgerReplayed, true);
      assert.equal(Object.hasOwn(source.stage34Context.stage2Frontier.sourceReplay,
        "empiricalFiveSourceLedgerReplayed"), false);
      const forgedQuote = structuredClone(source.stage2QuoteCandidate);
      forgedQuote.financialOutputs.price = 50;
      forgedQuote.permissions.PRICE = true;
      forgedQuote.candidateHash = h("self-resealed-price-promotion");
      await assert.rejects(Stage3GuaranteeGateStore.create({
        directory: path.join(source.temporaryRoot, "forged-gate"),
        stage34Frontier: source.stage34Frontier,
        stage34Context: source.stage34Context,
        stage2QuoteCandidate: forgedQuote,
        localRequestPolicy: policy,
        createdAt: at(32),
        expiresAt: at(90),
        signerPrivateKeyPem: operator.privateKeyPem,
      }), /STAGE3_GATE_EXACT_STAGE2_QUOTE_REQUIRED/);
    });

    const store = await Stage3GuaranteeGateStore.create({
      directory: gateDirectory,
      stage34Frontier: source.stage34Frontier,
      stage34Context: source.stage34Context,
      stage2QuoteCandidate: source.stage2QuoteCandidate,
      localRequestPolicy: policy,
      createdAt: at(32),
      expiresAt: at(90),
      signerPrivateKeyPem: operator.privateKeyPem,
    });

    let snapshot = await store.snapshot();
    const revisionZeroEnvelope = structuredClone(snapshot.envelope);
    assert.equal(snapshot.verification.verificationLevel, "CURRENT_STATE_CHAIN_ONLY");
    assert.equal(snapshot.verification.rollbackResistanceEstablished, false);
    assert.equal(snapshot.envelope.state.sourceBindings.quoteDecision,
      "NON_BINDING_ABSTAIN");
    assert.equal(snapshot.envelope.state.sourceBindings.sourceReverifiedAtGenesis, true);
    assert.equal(snapshot.envelope.state.sourceBindings.ownerAdoptionVerified, false);
    assert.equal(snapshot.envelope.state.requestAccounting.actualReserveUnits, null);
    assert.equal(snapshot.envelope.state.authority.permitsGuarantee, false);

    await t.test("missing or bypass-reporting hooks fail closed", async () => {
      const missingAudit = await store.runBypassAudit({
        commandId: "audit-missing",
        expectedRevision: snapshot.envelope.state.revision,
        expectedStateHash: snapshot.envelope.stateHash,
        occurredAt: at(33),
        cycleIdHash: h("audit-missing"),
        subjectHash: h("resource-write-topology"),
        hooks: {
          "alternate-write-path": async () => ({
            outcome: "NO_BYPASS_OBSERVED", evidenceHash: h("audit-local-pass"),
          }),
        },
      }, operator.privateKeyPem);
      assert.equal(missingAudit.outcome,
        "HOLD_AUDIT_FAILED_CLOSED_AND_ACTIVE_CANDIDATES_REVOKED");
      snapshot = await store.snapshot();
      assert.equal(snapshot.envelope.state.audit.lastCycleStatus, "FAILED_CLOSED");
    });

    await t.test("a caller-held checkpoint detects the exact rev0-to-rev1 whole-file rollback",
      async () => {
        assert.equal(snapshot.envelope.state.revision, 1);
        const earlyCheckpoint = await store.createCheckpoint({
          expectedRevision: snapshot.envelope.state.revision,
          expectedStateHash: snapshot.envelope.stateHash,
          createdAt: at(33.5),
        }, operator.privateKeyPem);
        const currentEnvelope = structuredClone(snapshot.envelope);
        const stateFile = path.join(gateDirectory, "stage3-guarantee-gate-state.json");
        writeFileSync(stateFile, `${JSON.stringify(revisionZeroEnvelope, null, 2)}\n`,
          { mode: 0o600 });
        try {
          const unguarded = await verifyStage3GuaranteeGateDirectory(gateDirectory);
          assert.equal(unguarded.ok, true);
          assert.equal(unguarded.revision, 0);
          assert.equal(unguarded.verificationLevel, "CURRENT_STATE_CHAIN_ONLY");
          assert.equal(unguarded.rollbackResistanceEstablished, false);
          const guarded = await verifyStage3GuaranteeGateDirectory(gateDirectory,
            { requiredCheckpoint: earlyCheckpoint });
          assert.equal(guarded.ok, false);
          assert.match(guarded.error, /ROLLBACK_BELOW_REQUIRED_CHECKPOINT/);
        } finally {
          writeFileSync(stateFile, `${JSON.stringify(currentEnvelope, null, 2)}\n`,
            { mode: 0o600 });
        }
        snapshot = await store.snapshot();
        assert.equal(snapshot.verification.rollbackResistanceEstablished, true);
      });

    const passingHooks = {
      "alternate-write-path": async () => ({
        outcome: "NO_BYPASS_OBSERVED", evidenceHash: h("alternate-path-audit"),
      }),
      "owner-entrypoint": async () => ({
        outcome: "NO_BYPASS_OBSERVED", evidenceHash: h("owner-entrypoint-audit"),
      }),
    };
    await store.runBypassAudit({
      commandId: "audit-pass",
      expectedRevision: snapshot.envelope.state.revision,
      expectedStateHash: snapshot.envelope.stateHash,
      occurredAt: at(34),
      cycleIdHash: h("audit-pass"),
      subjectHash: h("resource-write-topology"),
      hooks: passingHooks,
    }, operator.privateKeyPem);
    snapshot = await store.snapshot();
    assert.equal(snapshot.envelope.state.audit.lastCycleStatus,
      "PASSED_LOCAL_DIAGNOSTIC_ONLY");
    assert.equal(snapshot.envelope.state.audit.ownerGateActualWritePathVerified, false);
    assert.equal(snapshot.envelope.state.audit.alternateWritePathsExcluded, false);

    await assert.rejects(store.requestCapability(cas(snapshot, "per-candidate-over", at(35), {
      candidateIdHash: h("candidate-per-over"),
      requestedUnits: "61",
      expiresAt: at(80),
      beforeStateHash: h("before-per-over"),
      capabilityScopeHash: h("scope-per-over"),
    }), operator.privateKeyPem), /STAGE3_GATE_PER_CANDIDATE_REQUEST_EXCEEDED/);

    const beforeA = h("actual-resource-before-state-a");
    const requestA = cas(snapshot, "request-a", at(35), {
      candidateIdHash: h("candidate-a"),
      requestedUnits: "60",
      expiresAt: at(80),
      beforeStateHash: beforeA,
      capabilityScopeHash: h("capability-scope-a"),
    });
    const createdA = await store.requestCapability(requestA, operator.privateKeyPem);
    assert.equal(createdA.outcome,
      "HOLD_ONE_USE_REFERENCE_CANDIDATE_CREATED_NO_RESERVE");
    const idempotentA = await store.requestCapability(requestA, operator.privateKeyPem);
    assert.equal(idempotentA.idempotentReplay, true);
    snapshot = await store.snapshot();
    assert.equal(snapshot.envelope.state.revision, requestA.expectedRevision + 1);
    assert.equal(snapshot.envelope.state.requestAccounting.activeRequestedUnits, "60");
    assert.equal(snapshot.envelope.state.candidates[0].core.reserveRequest.currency, null);
    assert.equal(snapshot.envelope.state.candidates[0]
      .core.capabilityBoundary.actualResourceWrite, false);

    await t.test("aggregate ceiling rejects over-reserve and CAS rejects stale balance", async () => {
      await assert.rejects(store.requestCapability(cas(snapshot, "over-reserve", at(36), {
        candidateIdHash: h("candidate-over"),
        requestedUnits: "50",
        expiresAt: at(80),
        beforeStateHash: h("before-over"),
        capabilityScopeHash: h("scope-over"),
      }), operator.privateKeyPem), /STAGE3_GATE_AGGREGATE_REQUEST_EXCEEDED/);

      const stale = snapshot;
      const attempts = ["b", "c"].map((label) => store.requestCapability(
        cas(stale, `concurrent-${label}`, at(37), {
          candidateIdHash: h(`candidate-${label}`),
          requestedUnits: "30",
          expiresAt: at(80),
          beforeStateHash: h(`before-${label}`),
          capabilityScopeHash: h(`scope-${label}`),
        }), operator.privateKeyPem));
      const settled = await Promise.allSettled(attempts);
      assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
      assert.equal(settled.filter((item) => item.status === "rejected"
        && /STAGE3_GATE_CAS_MISMATCH_STALE_STATE/.test(item.reason.message)).length, 1);
      snapshot = await store.snapshot();
      assert.equal(snapshot.envelope.state.requestAccounting.activeRequestedUnits, "90");
      assert.equal(snapshot.envelope.state.requestAccounting.staleBalanceAccepted, false);

      await assert.rejects(store.requestCapability(cas(stale, "stale-balance", at(38), {
        candidateIdHash: h("candidate-stale"),
        requestedUnits: "1",
        expiresAt: at(80),
        beforeStateHash: h("before-stale"),
        capabilityScopeHash: h("scope-stale"),
      }), operator.privateKeyPem), /STAGE3_GATE_CAS_MISMATCH_STALE_STATE/);
    });

    await t.test("self-signed reserve/custodian/issuer/owner receipts never create authority",
      async () => {
        for (const [index, role] of ["RESERVE_PROVIDER", "CUSTODIAN", "ISSUER",
          "RESOURCE_OWNER"].entries()) {
          const receipt = signStage3ExternalReferenceReceipt({
            role,
            providerIdHash: h(`fake-provider-${role}`),
            issuedAt: at(39 + index),
            payloadHash: h(`fake-payload-${role}`),
            claimHash: snapshot.envelope.state.sourceBindings.claimHash,
            worldHash: snapshot.envelope.state.sourceBindings.worldHash,
            quoteCandidateHash:
              snapshot.envelope.state.sourceBindings.quoteCandidateHash,
          }, { privateKeyPem: fakeProvider.privateKeyPem });
          const inspected = inspectStage3ExternalReferenceReceipt(receipt);
          assert.equal(inspected.cryptographicValid, true);
          assert.equal(inspected.institutionalStatus,
            "UNVERIFIED_NO_PROVIDER_SPECIFIC_VERIFIER");
          assert.equal(inspected.custodyVerified, false);
          await store.registerExternalReceipt(cas(snapshot, `receipt-${index}`,
            at(43 + index), { receipt }), operator.privateKeyPem);
          snapshot = await store.snapshot();
        }
        assert.equal(snapshot.envelope.state.externalReceipts.length, 4);
        assert.ok(snapshot.envelope.state.externalReceipts.every((receipt) =>
          receipt.cryptographicValidity === "VALID_SELF_PRESENTED_KEY"
          && receipt.institutionalStatus === "UNVERIFIED_NO_PROVIDER_SPECIFIC_VERIFIER"
          && receipt.issuerStandingVerified === false
          && receipt.custodyVerified === false
          && receipt.reserveVerified === false
          && receipt.ownerAdoptionVerified === false
          && receipt.coverageCreated === false));
        assert.equal(snapshot.envelope.state.authority.permitsCoverage, false);
      });

    await t.test("before-state candidate is one-use, writes nothing, and revoke survives issue",
      async () => {
        await assert.rejects(store.presentCapability(cas(snapshot, "wrong-before-a", at(47), {
          candidateIdHash: h("candidate-a"),
          observedBeforeStateHash: h("different-resource-before-state"),
        }), operator.privateKeyPem), /STAGE3_GATE_BEFORE_STATE_MISMATCH/);
        const presented = await store.presentCapability(cas(snapshot, "present-a", at(47), {
          candidateIdHash: h("candidate-a"),
          observedBeforeStateHash: beforeA,
        }), operator.privateKeyPem);
        assert.equal(presented.actualResourceWrite, false);
        assert.equal(presented.outcome,
          "HOLD_PRESENTED_ONCE_NO_OWNER_ADOPTION_OR_RESOURCE_WRITE");
        snapshot = await store.snapshot();
        await assert.rejects(store.presentCapability(cas(snapshot, "reuse-a", at(48), {
          candidateIdHash: h("candidate-a"), observedBeforeStateHash: beforeA,
        }), operator.privateKeyPem), /STAGE3_GATE_CAPABILITY_REUSE/);

        await store.revokeCapability(cas(snapshot, "revoke-after-issue-a", at(49), {
          candidateIdHash: h("candidate-a"), reasonHash: h("post-issue-revocation"),
        }), operator.privateKeyPem);
        snapshot = await store.snapshot();
        const candidate = snapshot.envelope.state.candidates.find((item) =>
          item.core.candidateIdHash === h("candidate-a"));
        assert.equal(candidate.lifecycle.status, "REVOKED_HOLD");
        assert.equal(candidate.lifecycle.presentationCount, 1);
        assert.equal(candidate.lifecycle.actualResourceWrite, false);
        assert.equal(snapshot.envelope.state.responsibilityRecovery.obligationOpen, true);
      });

    const requestD = await store.requestCapability(cas(snapshot, "request-d", at(50), {
      candidateIdHash: h("candidate-d"), requestedUnits: "60", expiresAt: at(75),
      beforeStateHash: h("before-d"), capabilityScopeHash: h("scope-d"),
    }), operator.privateKeyPem);
    assert.equal(requestD.decision,
      "HOLD_NO_ISSUER_OWNER_CUSTODY_RESERVE_COVERAGE_OR_EXECUTION_AUTHORITY");
    snapshot = await store.snapshot();

    await t.test("an observed alternate path revokes active candidates and stays fail-closed",
      async () => {
        await store.runBypassAudit({
          commandId: "audit-bypass-observed",
          expectedRevision: snapshot.envelope.state.revision,
          expectedStateHash: snapshot.envelope.stateHash,
          occurredAt: at(51),
          cycleIdHash: h("audit-bypass-observed"),
          subjectHash: h("resource-write-topology"),
          hooks: {
            "alternate-write-path": async () => ({
              outcome: "BYPASS_OBSERVED", evidenceHash: h("alternate-write-found"),
            }),
            "owner-entrypoint": passingHooks["owner-entrypoint"],
          },
        }, operator.privateKeyPem);
        snapshot = await store.snapshot();
        assert.equal(snapshot.envelope.state.audit.lastCycleStatus, "FAILED_CLOSED");
        assert.equal(snapshot.envelope.state.requestAccounting.activeRequestedUnits, "0");
        const candidate = snapshot.envelope.state.candidates.find((item) =>
          item.core.candidateIdHash === h("candidate-d"));
        assert.equal(candidate.lifecycle.status, "REVOKED_HOLD");
        await assert.rejects(store.presentCapability(cas(snapshot, "bypass-present-d", at(52), {
          candidateIdHash: h("candidate-d"), observedBeforeStateHash: h("before-d"),
        }), operator.privateKeyPem), /STAGE3_GATE_BYPASS_AUDIT_NOT_PASSING_FAIL_CLOSED/);
      });

    await store.runBypassAudit({
      commandId: "audit-pass-after-bypass",
      expectedRevision: snapshot.envelope.state.revision,
      expectedStateHash: snapshot.envelope.stateHash,
      occurredAt: at(53),
      cycleIdHash: h("audit-pass-after-bypass"),
      subjectHash: h("resource-write-topology"),
      hooks: passingHooks,
    }, operator.privateKeyPem);
    snapshot = await store.snapshot();

    await t.test("dual-proof key rotation retires the old local signer without adding standing",
      async () => {
        preRotationEnvelope = structuredClone(snapshot.envelope);
        await store.rotateSigner({
          commandId: "rotate-local-signer",
          expectedRevision: snapshot.envelope.state.revision,
          expectedStateHash: snapshot.envelope.stateHash,
          occurredAt: at(54),
        }, operator.privateKeyPem, rotated.privateKeyPem);
        snapshot = await store.snapshot();
        assert.equal(snapshot.envelope.state.signers.rotations.length, 1);
        assert.equal(snapshot.envelope.state.signers
          .cryptographicValidityIsInstitutionalStanding, false);
        await assert.rejects(store.requestCapability(cas(snapshot, "old-key-request", at(55), {
          candidateIdHash: h("candidate-old-key"), requestedUnits: "1",
          expiresAt: at(70), beforeStateHash: h("before-old-key"),
          capabilityScopeHash: h("scope-old-key"),
        }), operator.privateKeyPem), /STAGE3_GATE_ACTIVE_SIGNER_REQUIRED/);
        await store.requestCapability(cas(snapshot, "new-key-request", at(55), {
          candidateIdHash: h("candidate-expiry"), requestedUnits: "10",
          expiresAt: at(56), beforeStateHash: h("before-expiry"),
          capabilityScopeHash: h("scope-expiry"),
        }), rotated.privateKeyPem);
        snapshot = await store.snapshot();
        postRotationCheckpoint = await store.createCheckpoint({
          expectedRevision: snapshot.envelope.state.revision,
          expectedStateHash: snapshot.envelope.stateHash,
          createdAt: at(55.5),
        }, rotated.privateKeyPem);
        assert.equal(postRotationCheckpoint.signerKeyId,
          snapshot.envelope.state.signers.activeKeyId);
        const checkpointed = verifyStage3GuaranteeGateCheckpoint(
          postRotationCheckpoint, snapshot);
        assert.equal(checkpointed.ok, true);
        assert.equal(checkpointed.rollbackResistanceEstablished, true);
        assert.equal(checkpointed.checkpointRevisionLag, 0);
        snapshot = await store.snapshot();
        assert.equal(snapshot.verification.rollbackResistanceEstablished, true);
      });

    await store.sweepExpiry(cas(snapshot, "sweep-candidate-expiry", at(57), {}),
      rotated.privateKeyPem);
    snapshot = await store.snapshot();
    const expiredCandidate = snapshot.envelope.state.candidates.find((item) =>
      item.core.candidateIdHash === h("candidate-expiry"));
    assert.equal(expiredCandidate.lifecycle.status, "EXPIRED_HOLD");

    await t.test("coverage/VOID/diet/provider/dissolution events cannot erase recovery",
      async () => {
        const kinds = ["COVERAGE_DISPUTE", "COVERAGE_VOID", "DIET_BREACH",
          "WARRANTY_BREACH", "PROVIDER_REPLACEMENT"];
        for (const [index, kind] of kinds.entries()) {
          await store.recordAdversity(cas(snapshot, `adversity-${kind}`, at(58 + index), {
            kind, evidenceHash: h(`adversity-evidence-${kind}`),
          }), rotated.privateKeyPem);
          snapshot = await store.snapshot();
          assert.equal(snapshot.envelope.state.responsibilityRecovery.nonWaivable, true);
          assert.equal(snapshot.envelope.state.responsibilityRecovery.obligationOpen, true);
          assert.equal(snapshot.envelope.state.responsibilityRecovery.recoveryComplete, false);
          assert.equal(snapshot.envelope.state.responsibilityRecovery.closureAuthorized, false);
        }
        await store.sweepExpiry(cas(snapshot, "sweep-gate-expiry", at(90), {}),
          rotated.privateKeyPem);
        snapshot = await store.snapshot();
        assert.equal(snapshot.envelope.state.lifecycle.status, "EXPIRED_HOLD");
        await store.recordAdversity(cas(snapshot, "institution-dissolution", at(91), {
          kind: "INSTITUTION_DISSOLUTION",
          evidenceHash: h("institution-dissolution-evidence"),
        }), rotated.privateKeyPem);
        snapshot = await store.snapshot();
        const recovery = snapshot.envelope.state.responsibilityRecovery;
        assert.equal(recovery.survivesProviderReplacement, true);
        assert.equal(recovery.survivesCoverageDisputeOrVoid, true);
        assert.equal(recovery.survivesDietOrWarrantyBreach, true);
        assert.equal(recovery.survivesGateOrCandidateExpiry, true);
        assert.equal(recovery.survivesInstitutionDissolution, true);
        assert.equal(recovery.paymentCannotImplyRecovery, true);
        assert.equal(recovery.restorationCannotImplyClosure, true);
        assert.equal(recovery.obligationOpen, true);
      });

    await t.test("hash resealing cannot promote PRICE/guarantee or make VOID erase recovery",
      () => {
        let priceForged = structuredClone(snapshot.envelope);
        priceForged.state.authority.permitsPrice = true;
        priceForged.state.authority.permitsGuarantee = true;
        priceForged = signerReseal(priceForged, rotated.privateKeyPem);
        const priceChecked = verifyStage3GuaranteeGateArtifacts({
          genesis: snapshot.genesis,
          sourceAnchor: snapshot.sourceAnchor,
          envelope: priceForged,
        });
        assert.equal(priceChecked.ok, false);
        assert.equal(priceChecked.coverageEstablished, false);
        assert.equal(priceChecked.movesFunds, false);

        let voidForged = structuredClone(snapshot.envelope);
        voidForged.state.responsibilityRecovery.nonWaivable = false;
        voidForged.state.responsibilityRecovery.obligationOpen = false;
        voidForged.state.responsibilityRecovery.closureAuthorized = true;
        voidForged = signerReseal(voidForged, rotated.privateKeyPem);
        const voidChecked = verifyStage3GuaranteeGateArtifacts({
          genesis: snapshot.genesis,
          sourceAnchor: snapshot.sourceAnchor,
          envelope: voidForged,
        });
        assert.equal(voidChecked.ok, false);
        assert.equal(voidChecked.obligationOpen, true);
        assert.equal(voidChecked.guaranteeIssued, false);
      });

    const checkpointFile = path.join(source.temporaryRoot,
      "caller-held-stage3-checkpoint.json");
    writeFileSync(checkpointFile, `${JSON.stringify(postRotationCheckpoint, null, 2)}\n`,
      { mode: 0o600 });

    await t.test("required checkpoint rejects forged heads and whole-file rollback", async () => {
      const valid = await verifyStage3GuaranteeGateDirectory(gateDirectory,
        { requiredCheckpoint: postRotationCheckpoint });
      assert.equal(valid.ok, true);
      assert.equal(valid.verificationLevel,
        "CURRENT_STATE_CHAIN_WITH_REQUIRED_CHECKPOINT_ANCESTRY");
      assert.equal(valid.rollbackResistanceEstablished, true);
      assert.equal(valid.rollbackResistanceScope,
        "RELATIVE_TO_SUPPLIED_REQUIRED_CHECKPOINT");
      assert.equal(valid.checkpointIndependentRetentionVerified, false);
      assert.ok(valid.checkpointRevisionLag > 0,
        "an older valid checkpoint remains a lower bound and reports its lag");

      const fakeSignature = structuredClone(postRotationCheckpoint);
      fakeSignature.signature.value = "AAAA";
      assert.equal((await verifyStage3GuaranteeGateDirectory(gateDirectory,
        { requiredCheckpoint: fakeSignature })).ok, false);

      for (const [field, value, error] of [
        ["gateIdHash", h("wrong-checkpoint-gate"), "WRONG_GATE"],
        ["genesisHash", h("wrong-checkpoint-genesis"), "WRONG_GENESIS"],
        ["eventHeadHash", h("wrong-checkpoint-head"), "EVENT_HEAD_MISMATCH"],
        ["stateHash", h("wrong-checkpoint-state"), "STATE_NOT_ANCESTOR"],
      ]) {
        const forged = structuredClone(postRotationCheckpoint);
        forged[field] = value;
        const signedForgery = checkpointReseal(forged, rotated.privateKeyPem);
        const checked = await verifyStage3GuaranteeGateDirectory(gateDirectory,
          { requiredCheckpoint: signedForgery });
        assert.equal(checked.ok, false);
        assert.match(checked.error, new RegExp(error));
        assert.equal(checked.rollbackResistanceEstablished, false);
      }

      const finalEnvelope = structuredClone(snapshot.envelope);
      const stateFile = path.join(gateDirectory, "stage3-guarantee-gate-state.json");
      writeFileSync(stateFile, `${JSON.stringify(preRotationEnvelope, null, 2)}\n`,
        { mode: 0o600 });
      try {
        const currentOnly = await verifyStage3GuaranteeGateDirectory(gateDirectory);
        assert.equal(currentOnly.ok, true,
          "a self-consistent historical file is indistinguishable without a watermark");
        assert.equal(currentOnly.verificationLevel, "CURRENT_STATE_CHAIN_ONLY");
        assert.equal(currentOnly.rollbackResistanceEstablished, false);
        assert.ok(currentOnly.revision < postRotationCheckpoint.revision);

        const rollback = await verifyStage3GuaranteeGateDirectory(gateDirectory,
          { requiredCheckpoint: postRotationCheckpoint });
        assert.equal(rollback.ok, false);
        assert.match(rollback.error, /ROLLBACK_BELOW_REQUIRED_CHECKPOINT/);
        assert.equal(rollback.rollbackResistanceEstablished, false);

        const fullRollback = await verifyStage3GuaranteeGateFull({
          directory: gateDirectory,
          stage34Context: source.stage34Context,
          requiredCheckpoint: postRotationCheckpoint,
        });
        assert.equal(fullRollback.ok, false);
        assert.match(fullRollback.error, /ROLLBACK_BELOW_REQUIRED_CHECKPOINT/);
        await assert.rejects(store.snapshot(), /ROLLBACK_BELOW_REQUIRED_CHECKPOINT/);
      } finally {
        writeFileSync(stateFile, `${JSON.stringify(finalEnvelope, null, 2)}\n`,
          { mode: 0o600 });
      }
      snapshot = await store.snapshot();
      assert.equal(snapshot.verification.rollbackResistanceEstablished, true);
    });

    const local = await verifyStage3GuaranteeGateDirectory(gateDirectory);
    assert.equal(local.ok, true);
    assert.equal(local.verificationLevel, "CURRENT_STATE_CHAIN_ONLY");
    assert.equal(local.rollbackResistanceEstablished, false);
    assert.equal(local.rollbackResistanceScope, "NONE_NO_CALLER_HELD_WATERMARK");
    assert.equal(local.sourceArtifactsReverified, false);
    assert.equal(local.cryptographicIntegrityValid, true);
    assert.equal(local.institutionalStandingVerified, false);
    assert.equal(local.custodyVerified, false);
    assert.equal(local.reserveVerified, false);
    assert.equal(local.coverageEstablished, false);
    assert.equal(local.actualResourceWrite, false);

    const full = await verifyStage3GuaranteeGateFull({
      directory: gateDirectory,
      stage34Context: source.stage34Context,
    });
    assert.equal(full.ok, true);
    assert.equal(full.verificationLevel,
      "FULL_STAGE34_STAGE2_QUOTE_SOURCES_PLUS_CURRENT_STATE_CHAIN_ONLY");
    assert.equal(full.sourceArtifactsReverified, true);
    assert.equal(full.rollbackResistanceEstablished, false);
    assert.equal(full.institutionalStandingVerified, false);
    assert.equal(full.guaranteeIssued, false);
    assert.equal(full.movesFunds, false);

    const fullCheckpointed = await verifyStage3GuaranteeGateFull({
      directory: gateDirectory,
      stage34Context: source.stage34Context,
      requiredCheckpoint: postRotationCheckpoint,
    });
    assert.equal(fullCheckpointed.ok, true);
    assert.equal(fullCheckpointed.verificationLevel,
      "FULL_STAGE34_STAGE2_QUOTE_SOURCES_PLUS_REQUIRED_CHECKPOINT_ANCESTRY");
    assert.equal(fullCheckpointed.rollbackResistanceEstablished, true);
    assert.equal(fullCheckpointed.requiredCheckpointHash,
      postRotationCheckpoint.checkpointHash);

    await t.test("CLI reports local-only verification and HOLD status", () => {
      const checkpointCommandFile = path.join(source.temporaryRoot,
        "checkpoint-command.json");
      const rotatedKeyFile = path.join(source.temporaryRoot, "rotated-local-key.pem");
      writeFileSync(checkpointCommandFile, `${JSON.stringify({
        expectedRevision: snapshot.envelope.state.revision,
        expectedStateHash: snapshot.envelope.stateHash,
        createdAt: at(92),
      }, null, 2)}\n`, { mode: 0o600 });
      writeFileSync(rotatedKeyFile, rotated.privateKeyPem, { mode: 0o600 });
      const checkpointCommand = spawnSync(process.execPath,
        [path.join(root, "scripts/stage3-guarantee-gate.mjs"), "checkpoint",
          "--dir", gateDirectory, "--command", checkpointCommandFile,
          "--key", rotatedKeyFile, "--required-checkpoint", checkpointFile],
        { cwd: root, encoding: "utf8" });
      assert.equal(checkpointCommand.status, 0, checkpointCommand.stderr);
      const cliCheckpoint = JSON.parse(checkpointCommand.stdout);
      assert.equal(cliCheckpoint.revision, snapshot.envelope.state.revision);
      assert.equal(cliCheckpoint.stateHash, snapshot.envelope.stateHash);

      const verify = spawnSync(process.execPath,
        [path.join(root, "scripts/stage3-guarantee-gate.mjs"), "verify",
          "--dir", gateDirectory], { cwd: root, encoding: "utf8" });
      assert.equal(verify.status, 0, verify.stderr);
      const verified = JSON.parse(verify.stdout);
      assert.equal(verified.ok, true);
      assert.equal(verified.verificationLevel, "CURRENT_STATE_CHAIN_ONLY");
      assert.equal(verified.rollbackResistanceEstablished, false);
      assert.equal(verified.sourceArtifactsReverified, false);
      assert.equal(verified.coverageEstablished, false);

      const checkpointedVerify = spawnSync(process.execPath,
        [path.join(root, "scripts/stage3-guarantee-gate.mjs"), "verify",
          "--dir", gateDirectory, "--required-checkpoint", checkpointFile],
        { cwd: root, encoding: "utf8" });
      assert.equal(checkpointedVerify.status, 0, checkpointedVerify.stderr);
      const checkpointed = JSON.parse(checkpointedVerify.stdout);
      assert.equal(checkpointed.rollbackResistanceEstablished, true);
      assert.equal(checkpointed.requiredCheckpointHash,
        postRotationCheckpoint.checkpointHash);

      const status = spawnSync(process.execPath,
        [path.join(root, "scripts/stage3-guarantee-gate.mjs"), "status",
          "--dir", gateDirectory], { cwd: root, encoding: "utf8" });
      assert.equal(status.status, 0, status.stderr);
      const report = JSON.parse(status.stdout);
      assert.equal(report.decision,
        "HOLD_NO_ISSUER_OWNER_CUSTODY_RESERVE_COVERAGE_OR_EXECUTION_AUTHORITY");
      assert.equal(report.authority.movesFunds, false);
      assert.equal(report.responsibilityRecovery.obligationOpen, true);
      assert.equal(report.verification.rollbackResistanceEstablished, false);

      const checkpointedStatus = spawnSync(process.execPath,
        [path.join(root, "scripts/stage3-guarantee-gate.mjs"), "status",
          "--dir", gateDirectory, "--required-checkpoint", checkpointFile],
        { cwd: root, encoding: "utf8" });
      assert.equal(checkpointedStatus.status, 0, checkpointedStatus.stderr);
      assert.equal(JSON.parse(checkpointedStatus.stdout)
        .verification.rollbackResistanceEstablished, true);
    });
  });
