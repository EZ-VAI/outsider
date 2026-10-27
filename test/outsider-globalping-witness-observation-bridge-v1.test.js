import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, cpSync, mkdtempSync, readFileSync, realpathSync, rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createGlobalpingWitnessObservationBridgeV1,
} from "../src/outsider-globalping-witness-observation-bridge-v1.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ARTIFACT = path.join(ROOT, "artifacts",
  "globalping-http-witness-live-candidate-20260904-v2");
const EPISODE = path.join(ARTIFACT, "episode");
const PLAN_INPUT = JSON.parse(readFileSync(path.join(ARTIFACT, "input.json"),
  "utf8")).planInput;
const OBSERVED_AT = "2026-09-04T01:00:00.000Z";
const FORMATION_DEADLINE = "2026-09-05T12:00:00.000Z";

const EXPECTED = Object.freeze({
  finalProjection: Object.freeze({
    file: Object.freeze({
      bytes: 6409,
      sha256:
        "sha256:b130418587575dbdbca63c146f555052329a06e46ff4fa2e053dc4563b814488",
    }),
    projectionHash:
      "sha256:d541275a11a0892c9cefc70186416949b7c8e048e1f5f09e1fb8f5043aef81b1",
  }),
  manifest: Object.freeze({
    file: Object.freeze({
      bytes: 5648,
      sha256:
        "sha256:533cd871caddee663f50da603f8dc832f4ed0a8d0fb18c830055497e0075b4b2",
    }),
    manifestHash:
      "sha256:c1e938de2531d63de1d2ea29bdad09a00e9a88a7672553ffe38ccc7f7c332b3e",
  }),
  rawJournal: Object.freeze({
    headHash:
      "sha256:056107d72ec3b807fcd92f6b5ee602947aedd377c5f370b9dd9c5c65f3afcd12",
    recordCount: 13,
    exactByteCount: 21098,
  }),
  oneUseEffectLedger: Object.freeze({
    ledgerId: "ledger_96c88a7bf46cf57593fbf302c99f42de",
    headHash:
      "sha256:5ee0ca09c6f89ce56cf6925bec37072a0778117d713115285e1a83aae8a792af",
    entryCount: 4,
    exactEntryByteCount: 8579,
  }),
});

function h(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function shaBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainDigest(domain, value) {
  return shaBytes(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function input(overrides = {}) {
  return {
    globalpingPlanInput: PLAN_INPUT,
    privateEpisodeDirectory: EPISODE,
    expected: EXPECTED,
    observedAt: OBSERVED_AT,
    formationDeadline: FORMATION_DEADLINE,
    ...overrides,
  };
}

test("exact real Globalping v2 receipt becomes only a hash-bound source candidate HOLD",
  () => {
    const bridge = createGlobalpingWitnessObservationBridgeV1(input());
    assert.equal(bridge.recordClass,
      "EXTERNAL_OBSERVATION_SOURCE_CANDIDATE_HOLD");
    assert.equal(bridge.candidateState,
      "AWAITING_INDEPENDENT_WITNESS_OWNER_ADOPTION");
    assert.equal(bridge.thirdPartySourceDeclarationAppeared, true);
    assert.equal(bridge.sourceDeclaredRequirementMatch, true);
    assert.equal(bridge.exactGlobalpingV2PlanRebuilt, true);
    assert.equal(bridge.exactFinalProjectionInternalHashAndFilePinVerified, true);
    assert.equal(bridge.exactManifestInternalHashAndFilePinVerified, true);
    assert.equal(bridge.exactRawJournalHeadRecordAndByteBindingsReplayed, true);
    assert.equal(bridge.exactOneUseLedgerHeadEntryAndByteBindingsReplayed, true);
    assert.equal(bridge.exactCreateReceiptAndFinalStatusSourceBytesReplayed, true);
    assert.equal(bridge.sourceBinding.outcomeRequirementHash,
      PLAN_INPUT.outcomeRequirementHash);
    assert.equal(bridge.sourceBinding.evidenceRequirementHash,
      PLAN_INPUT.evidenceRequirementHash);
    assert.equal(bridge.sourceBinding.targetSelectionProvenanceHash,
      PLAN_INPUT.targetSelectionProvenanceHash);
    assert.equal(bridge.sourceBinding.rawJournal.headHash,
      EXPECTED.rawJournal.headHash);
    assert.equal(bridge.sourceBinding.oneUseEffectLedger.headHash,
      EXPECTED.oneUseEffectLedger.headHash);
    assert.equal(bridge.disposition, "CONTINUE_AUTOMATED_FORMATION_HOLD");
    assert.equal(bridge.deadlineReached, false);
    assert.match(bridge.sourceBindingHash, /^sha256:[a-f0-9]{64}$/u);
    assert.match(bridge.bridgeHash, /^sha256:[a-f0-9]{64}$/u);

    for (const field of [
      "globalpingProductionDeploymentRevisionAttested",
      "globalpingReceiptBindsOutsiderTender",
      "globalpingReceiptBindsWitnessOwnerMandate",
      "witnessOwnerSignaturePresent",
      "witnessObservationResponsibilityReservationPresent",
      "independentWitnessLifecycleReceiptPresent",
      "existingIndependentWitnessHoldGateInvoked",
      "eligibleForExistingIndependentWitnessHoldGate",
      "ownerAdoptionEstablished", "resourceOwnerAuthorityEstablished",
      "currentCapacityEstablished", "capacityReserved",
      "legalIndependenceEstablished", "independentWitnessControlEstablished",
      "independentOutcomeTruthEstablished", "atomicCommitmentGateSatisfied",
      "atomicCommit", "userOutcomePromiseIssued", "bridgeNetworkIoPerformed",
      "paymentPerformed", "priceEstablished", "guaranteeEstablished",
      "settlementPermitted", "humanQueueCreated",
      "internalHumanFallbackPermitted", "rawSourceBytesProjected",
      "targetOrMeasurementIdProjected", "actionReady", "executable",
    ]) assert.equal(bridge[field], false, field);
    assert.equal(bridge.ownerAdoptionRequired, true);
    assert.equal(bridge.enabledCapabilityCount, 0);
    assert.deepEqual(bridge.enabledCapabilityTypes, []);
    assert.equal(bridge.provenAuthorityCapabilityCount, 0);
    assert.deepEqual(bridge.provenAuthorityCapabilityTypes, []);
    assert.equal(bridge.authority, "NONE");
    assert.equal(bridge.decisionState, "HOLD");

    const projected = JSON.stringify(bridge);
    for (const secret of [
      "log2025-1.rekor.sigstore.dev", PLAN_INPUT.projectionSaltBase64, EPISODE,
    ]) assert.equal(projected.includes(secret), false, secret);
  });

test("same verified source candidate declines without a human queue at deadline",
  () => {
    const bridge = createGlobalpingWitnessObservationBridgeV1(input({
      observedAt: FORMATION_DEADLINE,
    }));
    assert.equal(bridge.deadlineReached, true);
    assert.equal(bridge.disposition, "DECLINE_NOT_HUMAN_QUEUE");
    assert.equal(bridge.humanQueueCreated, false);
    assert.equal(bridge.internalHumanFallbackPermitted, false);
    assert.equal(bridge.independentWitnessLifecycleReceiptPresent, false);
    assert.equal(bridge.atomicCommit, false);
  });

test("plan splice and expected head splice fail before a bridge record exists",
  () => {
    assert.throws(() => createGlobalpingWitnessObservationBridgeV1(input({
      globalpingPlanInput: {
        ...PLAN_INPUT,
        evidenceRequirementHash: h("spliced-evidence-requirement"),
      },
    })), /PROJECTION_SEMANTICS_INVALID/u);
    assert.throws(() => createGlobalpingWitnessObservationBridgeV1(input({
      expected: {
        ...EXPECTED,
        rawJournal: { ...EXPECTED.rawJournal, headHash: h("spliced-head") },
      },
    })), /MANIFEST_BINDING_INVALID/u);
  });

test("self-consistent caller expectations cannot hide altered projection bytes",
  (t) => {
    const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
      "outsider-globalping-bridge-v1-")));
    chmodSync(parent, 0o700);
    t.after(() => rmSync(parent, { recursive: true, force: true }));
    const copied = path.join(parent, "episode");
    cpSync(EPISODE, copied, { recursive: true, preserveTimestamps: true });
    for (const directory of [copied, path.join(copied, "raw-globalping-journal"),
      path.join(copied, "one-use-effect-ledger"),
      path.join(copied, "one-use-effect-ledger", "entries"),
      path.join(copied, "one-use-effect-ledger", "tmp")]) {
      chmodSync(directory, 0o700);
    }
    const projectionPath = path.join(copied, "final-public-projection.json");
    const projection = JSON.parse(readFileSync(projectionPath, "utf8"));
    projection.legalIndependenceEstablished = true;
    const { projectionHash: _oldProjectionHash, ...projectionBody } = projection;
    projection.projectionHash = domainDigest(
      "outsider/globalping-http-witness-public-projection/v2", projectionBody);
    const tamperedBytes = Buffer.from(`${canonicalizeStrict(projection)}\n`,
      "utf8");
    writeFileSync(projectionPath, tamperedBytes, { mode: 0o600 });
    const manifestPath = path.join(copied, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.finalProjection.bytes = tamperedBytes.length;
    manifest.finalProjection.sha256 = shaBytes(tamperedBytes);
    const { manifestHash: _oldManifestHash, ...manifestBody } = manifest;
    manifest.manifestHash = domainDigest(
      "outsider/globalping-http-witness-run-manifest/v2", manifestBody);
    const tamperedManifestBytes = Buffer.from(`${canonicalizeStrict(manifest)}\n`,
      "utf8");
    writeFileSync(manifestPath, tamperedManifestBytes, { mode: 0o600 });
    const tamperedExpected = {
      ...EXPECTED,
      finalProjection: {
        ...EXPECTED.finalProjection,
        projectionHash: projection.projectionHash,
        file: {
          bytes: tamperedBytes.length,
          sha256: shaBytes(tamperedBytes),
        },
      },
      manifest: {
        manifestHash: manifest.manifestHash,
        file: {
          bytes: tamperedManifestBytes.length,
          sha256: shaBytes(tamperedManifestBytes),
        },
      },
    };
    assert.throws(() => createGlobalpingWitnessObservationBridgeV1(input({
      privateEpisodeDirectory: copied,
      expected: tamperedExpected,
    })), /PROJECTION_BOUNDARY_INVALID/u);
  });
