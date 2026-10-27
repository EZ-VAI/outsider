import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  ACTION_ADMISSION_NO_AUTHORITY,
  createActionEvidenceCommitment,
  createActionResponsibilityCommitment,
  createUnresolvedExternalAuthoritySlot,
  requestActionAdmission,
} from "../src/outsider-action-admission.js";
import {
  deriveActionObligationResponsibilityRefHash,
} from "../src/outsider-action-obligation-hold-composition.js";
import { normalizeDelegationRadius } from "../src/outsider-delegation-radius.js";
import {
  OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS,
  OWNER_WRITE_GATE_NO_AUTHORITY,
  OwnerWriteGateFixtureHarnessForTests,
  buildOwnerWriteGateConformanceHold,
  verifyOwnerWriteGateConformanceHold,
  verifyOwnerWriteGateFixtureSnapshotForTests,
} from "../src/outsider-owner-write-gate-conformance.js";
import {
  RealityObligationStore,
} from "../src/outsider-reality-obligation-store.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const CREATED_AT = "2026-08-27T00:00:00.000Z";
const EVALUATED_AT = "2026-08-27T12:00:00.000Z";
const HOLD_CREATED_AT = "2026-08-27T12:30:00.000Z";
const HOLD_EXPIRES_AT = "2026-08-27T23:00:00.000Z";
const FIXTURE_CREATED_AT = "2026-08-27T13:00:00.000Z";
const FIXTURE_EXPIRES_AT = "2026-08-27T20:00:00.000Z";
const PROBES = Object.freeze(["ALTERNATE_PATH_SCAN", "OWNER_GATE_ENTRYPOINT"]);
const VALIDITY = Object.freeze({
  validFrom: "2026-08-27T00:00:00.000Z",
  validUntil: "2026-08-28T00:00:00.000Z",
});

function temporaryLedger(t, label) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-owner-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return path.join(root, label);
}

function obligationInput(directory) {
  return {
    directory,
    obligationId: "owner-write-gate-obligation-1",
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

function admissionSource(snapshot) {
  const capabilityRadius = radius("2");
  const effectRadius = radius("3");
  const authorityRadius = radius("4");
  const evidenceRadius = radius("5");
  const responsibilityRadius = radius("6");
  const horizonHashes = snapshot.genesis.mandatoryHorizons
    .map(({ horizonCommitmentHash }) => horizonCommitmentHash);
  const responsibilityRefHash = deriveActionObligationResponsibilityRefHash({
    genesisHash: snapshot.genesis.genesisHash,
    stateHash: snapshot.stateHash,
  });
  return {
    bindings: {
      claimWayWorld: {
        claimHash: snapshot.genesis.bindings.claimHash,
        wayHash: snapshot.genesis.bindings.wayHash,
        worldHash: snapshot.genesis.bindings.worldHash,
      },
      run: {
        episodeHash: snapshot.genesis.bindings.episodeHash,
        attemptHash: snapshot.genesis.bindings.attemptHash,
        censusHash: snapshot.genesis.bindings.censusRegistrationHash,
      },
      governance: {
        ownerGateSlotHash: h("owner-gate-slot"),
        adoptionSlotHash: h("adoption-slot"),
        revocationStatusSlotHash: h("revocation-status-slot"),
      },
      state: { beforeStateHash: h("world-before-state") },
      validity: { validitySlotHash: h("validity-slot"), evaluatedAt: EVALUATED_AT },
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
        affectedChannelHashes: [h("affected-channel")],
        horizonHashes,
        custodianRefHashes: [h("custodian")],
      }),
    },
    responsibility: {
      radius: responsibilityRadius,
      commitment: createActionResponsibilityCommitment({
        commitmentRefHash: responsibilityRefHash,
        radius: responsibilityRadius,
        affectedChannelHashes: [h("affected-channel")],
        horizonHashes,
        responsiblePartyRefHashes: [h("responsible-party")],
      }),
    },
    consequenceEnvelope: {
      affectedChannelHashes: [h("affected-channel")],
      horizonHashes,
    },
  };
}

function environment(t, label = "production") {
  const directory = temporaryLedger(t, label);
  const store = RealityObligationStore.create(obligationInput(directory));
  const snapshot = store.snapshot();
  const admission = admissionSource(snapshot);
  const admissionRequest = requestActionAdmission(admission);
  const compositionInput = {
    admissionRequest,
    admissionSource: admission,
    expectedAdmissionRequestHash: admissionRequest.admissionRequestHash,
    obligationDirectory: directory,
    expectedObligationGenesisHash: snapshot.genesis.genesisHash,
    expectedObligationStateHash: snapshot.stateHash,
  };
  const source = {
    compositionInput,
    createdAt: HOLD_CREATED_AT,
    expiresAt: HOLD_EXPIRES_AT,
    requiredBypassProbeIds: [...PROBES],
  };
  const hold = buildOwnerWriteGateConformanceHold(source);
  return { directory, snapshot, admission, admissionRequest, compositionInput,
    source, hold };
}

function harness(environmentValue) {
  return OwnerWriteGateFixtureHarnessForTests.create({
    hold: environmentValue.hold,
    holdSource: environmentValue.source,
    expectedConformanceHash: environmentValue.hold.conformanceHash,
    candidateIdHash: h("fixture-candidate"),
    capabilityScopeHash: h("fixture-capability-scope"),
    beforeStateHash: environmentValue.admission.bindings.state.beforeStateHash,
    createdAt: FIXTURE_CREATED_AT,
    expiresAt: FIXTURE_EXPIRES_AT,
  });
}

function command(state, kind, label, occurredAt, payload) {
  return {
    kind,
    commandIdHash: h(`command:${label}`),
    occurredAt,
    expectedRevision: state.revision,
    expectedStateHash: state.stateHash,
    payload,
  };
}

function passingProbeResults() {
  return PROBES.map((probeId) => ({
    probeId,
    outcome: "PASS_NO_BYPASS_OBSERVED",
    evidenceHash: h(`probe-evidence:${probeId}`),
    errorHash: null,
  }));
}

async function passAudit(gate, occurredAt = "2026-08-27T14:00:00.000Z") {
  const before = gate.snapshot();
  return gate.transition(command(before, "AUDIT_BYPASS_PATHS", "audit-pass",
    occurredAt, { results: passingProbeResults() }));
}

function assertNoProductionAuthority(value) {
  assert.equal(value.productionEligible, false);
  assert.equal(value.authorityEstablished, false);
  assert.equal(value.actionReady, false);
  assert.equal(value.executable, false);
  assert.deepEqual(value.authority, OWNER_WRITE_GATE_NO_AUTHORITY);
  assert.ok(Object.values(value.authority).every((entry) => entry === false));
}

test("source-replayed production record is an integrity-valid HOLD, never authority", (t) => {
  const env = environment(t);
  const { hold } = env;
  assert.equal(hold.schema, OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.hold);
  assert.equal(hold.composition.referenceIntegrityVerified, true);
  assert.equal(hold.composition.structuralCompositionVerified, false);
  assert.equal(hold.composition.semanticCompositionEstablished, false);
  assert.deepEqual(hold.composition.productionBlockers, [
    "AFFECTED_PARTY_ROOT_NOT_SOURCE_REPLAYED",
    "RESPONSIBILITY_GRAPH_NOT_SOURCE_REPLAYED",
    "CONSEQUENCE_ENVELOPE_NOT_SOURCE_PROJECTED_FROM_EFFECT",
    "EXTERNAL_AUTHORITY_VERIFIER_NOT_INTEGRATED",
    "OWNER_ADOPTION_AND_REVOCATION_NOT_SOURCE_REPLAYED_BY_THIS_COMPOSITION",
    "NO_RUNTIME_OR_LIVE_ACTION_BRIDGE_BY_DESIGN",
  ]);
  assert.equal(hold.cedarBoundary.requestTuple,
    "PRINCIPAL_ACTION_RESOURCE_CONTEXT");
  assert.equal(hold.cedarBoundary.defaultDenyRequired, true);
  assert.equal(hold.cedarBoundary.forbidOverridesPermitRequired, true);
  assert.equal(hold.cedarBoundary.policyEvaluationErrorDisposition, "HOLD_NOT_SKIP");
  assert.equal(hold.cedarBoundary.allowEstablishesResourceOwnerStanding, false);
  assert.equal(hold.cedarBoundary.allowEstablishesActualWritePath, false);
  assert.equal(hold.productionChecks.ownerGateActualWritePathVerified, false);
  assert.equal(hold.decisionState, "HOLD");
  assert.equal(hold.productionEligible, false);
  assert.equal(hold.ownerAdoptionEstablished, false);
  assert.equal(hold.alternateWritePathsExcluded, false);
  assert.equal(hold.actualWritePathVerified, false);
  assert.equal(hold.authorityEstablished, false);
  assert.equal(hold.actionReady, false);
  assert.equal(hold.executable, false);
  assert.equal(hold.fixtureBoundary.crossProcessAtomicityEstablished, false);
  assert.equal(hold.fixtureBoundary.allProbePassesCanEstablishAlternatePathsExcluded,
    false);
  assert.deepEqual(hold.decision, {
    state: "HOLD", productionEligible: false, admitted: false,
    actionReady: false, executable: false, executionToken: null,
    liveActionConnected: false, actualResourceWrite: false,
    authorityEstablished: false, fixtureMechanicsVerified: false,
    fixtureMechanicsVerifiedIsProductionAuthority: false,
  });
  assert.deepEqual(hold.authority, OWNER_WRITE_GATE_NO_AUTHORITY);

  const checked = verifyOwnerWriteGateConformanceHold(hold, {
    source: env.source,
    expectedConformanceHash: hold.conformanceHash,
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel,
    "ACTION_ADMISSION_AND_OBLIGATION_V1_REFERENCE_REPLAYED_HOLD_ONLY");
  assert.equal(checked.fixtureMechanicsVerified, false);
  assert.equal(checked.fixtureMechanicsVerifiedIsProductionAuthority, false);
  assertNoProductionAuthority(checked);
});

test("caller booleans, keys, self-rehashes, sparse probes, and accessors cannot promote HOLD", (t) => {
  const env = environment(t);
  for (const [field, value] of [
    ["ownerAdopted", true],
    ["authorityEstablished", true],
    ["resourceOwnerPublicKey", "self-key"],
    ["cedarAllow", true],
    ["actualWritePath", true],
  ]) {
    assert.throws(() => buildOwnerWriteGateConformanceHold({
      ...env.source,
      [field]: value,
    }), /BUILD_INPUT_FIELDS_INVALID/u);
  }

  const sparse = [...PROBES];
  sparse.length = 3;
  assert.throws(() => buildOwnerWriteGateConformanceHold({
    ...env.source,
    requiredBypassProbeIds: sparse,
  }), /BUILD_INPUT_CANONICAL_DATA_REQUIRED/u);
  assert.throws(() => buildOwnerWriteGateConformanceHold({
    ...env.source,
    requiredBypassProbeIds: [PROBES[1], PROBES[0]],
  }), /REQUIRED_BYPASS_PROBES_SORTED_UNIQUE_REQUIRED/u);
  assert.throws(() => buildOwnerWriteGateConformanceHold({
    ...env.source,
    requiredBypassProbeIds: [],
  }), /REQUIRED_BYPASS_PROBES_DENSE_ARRAY_REQUIRED/u);
  assert.throws(() => buildOwnerWriteGateConformanceHold({
    ...env.source,
    requiredBypassProbeIds: Array.from({ length: 33 }, (_, index) =>
      `PROBE_${String(index).padStart(2, "0")}`),
  }), /REQUIRED_BYPASS_PROBES_DENSE_ARRAY_REQUIRED/u);
  assert.throws(() => buildOwnerWriteGateConformanceHold({
    ...env.source,
    requiredBypassProbeIds: [PROBES[0], PROBES[0]],
  }), /REQUIRED_BYPASS_PROBES_SORTED_UNIQUE_REQUIRED/u);
  assert.throws(() => buildOwnerWriteGateConformanceHold({
    ...env.source,
    createdAt: "2026-08-27T12:30:00Z",
  }), /CREATED_AT_INVALID/u);

  let accessorReads = 0;
  const accessor = {
    get compositionInput() { accessorReads += 1; return env.compositionInput; },
    createdAt: HOLD_CREATED_AT,
    expiresAt: HOLD_EXPIRES_AT,
    requiredBypassProbeIds: [...PROBES],
  };
  assert.throws(() => buildOwnerWriteGateConformanceHold(accessor),
    /BUILD_INPUT_CANONICAL_DATA_REQUIRED/u);
  assert.equal(accessorReads, 0);

  const forged = structuredClone(env.hold);
  forged.decision.actionReady = true;
  forged.decision.executable = true;
  forged.decision.authorityEstablished = true;
  forged.productionChecks.ownerGateActualWritePathVerified = true;
  delete forged.conformanceHash;
  forged.conformanceHash = `sha256:${createHash("sha256")
    .update(`${OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.hold}\0${canonicalizeStrict(forged)}`)
    .digest("hex")}`;
  const checked = verifyOwnerWriteGateConformanceHold(forged, {
    source: env.source,
    expectedConformanceHash: forged.conformanceHash,
  });
  assert.equal(checked.ok, false);
  assertNoProductionAuthority(checked);

  let callbackCalls = 0;
  assert.throws(() => OwnerWriteGateFixtureHarnessForTests.create({
    hold: env.hold,
    holdSource: env.source,
    expectedConformanceHash: env.hold.conformanceHash,
    candidateIdHash: h("fixture-candidate"),
    capabilityScopeHash: h("fixture-capability-scope"),
    beforeStateHash: env.admission.bindings.state.beforeStateHash,
    createdAt: FIXTURE_CREATED_AT,
    expiresAt: FIXTURE_EXPIRES_AT,
    actionCallback: () => { callbackCalls += 1; },
  }), /FIXTURE_CREATE_INPUT_CANONICAL_DATA_REQUIRED/u);
  assert.equal(callbackCalls, 0);
});

test("post-import String replacement cannot alter dense probe replay", (t) => {
  const env = environment(t, "intrinsic-string");
  const originalString = globalThis.String;
  let rebuilt;
  try {
    globalThis.String = () => "poisoned";
    rebuilt = buildOwnerWriteGateConformanceHold(env.source);
  } finally {
    globalThis.String = originalString;
  }
  assert.deepEqual(rebuilt, env.hold);
  assert.equal(rebuilt.requiredBypassProbeIds.length, PROBES.length);
  assert.equal(rebuilt.decisionState, "HOLD");
  assert.equal(rebuilt.actionReady, false);
  assert.equal(rebuilt.executable, false);
});

test("fixture exact probe pass enables one presentation but no write or authority", async (t) => {
  const env = environment(t);
  const gate = harness(env);
  const initial = gate.snapshot();
  assert.equal(initial.fixtureOnly, true);
  assert.equal(initial.processBoundary, "SINGLE_PROCESS_IN_MEMORY_HARNESS_ONLY");
  assert.equal(initial.decisionState, "HOLD");
  assert.equal(initial.productionEligible, false);
  assert.equal(initial.authorityEstablished, false);
  assert.equal(initial.actionReady, false);
  assert.equal(initial.executable, false);
  assert.equal(initial.audit.status, "NOT_RUN_FAIL_CLOSED");

  const audit = await passAudit(gate);
  assert.equal(audit.state.audit.status, "PASSED_LOCAL_DIAGNOSTIC_ONLY");
  assert.equal(audit.state.audit.results.length, PROBES.length);
  assert.equal(audit.state.audit.alternateWritePathsExcluded, false);
  assert.equal(audit.state.mechanics.actualWritePathVerified, false);
  assertNoProductionAuthority(audit);

  const beforePresent = gate.snapshot();
  const presentCommand = command(beforePresent, "PRESENT_ONCE", "present-one",
    "2026-08-27T15:00:00.000Z", {
      observedBeforeStateHash: env.admission.bindings.state.beforeStateHash,
    });
  const presented = await gate.transition(presentCommand);
  assert.equal(presented.state.lifecycle.status, "PRESENTED_ONCE_HOLD");
  assert.equal(presented.state.candidate.presentationCount, 1);
  assert.equal(presented.state.candidate.actualResourceWrite, false);
  assert.equal(presented.state.audit.alternateWritePathsExcluded, false);
  assert.equal(presented.decision.fixtureMechanicsVerified, true);
  assert.equal(presented.decision.fixtureMechanicsVerifiedIsProductionAuthority,
    false);
  assertNoProductionAuthority(presented);

  const replay = await gate.transition(presentCommand);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.state.stateHash, presented.state.stateHash);
  const checked = verifyOwnerWriteGateFixtureSnapshotForTests(presented.state, {
    hold: env.hold,
    holdSource: env.source,
    expectedConformanceHash: env.hold.conformanceHash,
    expectedStateHash: presented.state.stateHash,
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.fixtureMechanicsVerified, true);
  assert.equal(checked.fixtureMechanicsVerifiedIsProductionAuthority, false);
  assert.equal(checked.crossProcessAtomicityEstablished, false);
  assert.equal(checked.actualWritePathVerified, false);
  assertNoProductionAuthority(checked);
});

test("missing, error, or bypass probe results terminal-revoke and never exclude alternatives",
  async (t) => {
    for (const [label, results] of [
      ["missing", [passingProbeResults()[0]]],
      ["error", [
        passingProbeResults()[0],
        { probeId: PROBES[1], outcome: "ERROR", evidenceHash: null,
          errorHash: h("probe-error") },
      ]],
      ["bypass", [
        { probeId: PROBES[0], outcome: "BYPASS_OBSERVED",
          evidenceHash: h("bypass-evidence"), errorHash: null },
        passingProbeResults()[1],
      ]],
    ]) {
      const env = environment(t, label);
      const gate = harness(env);
      const before = gate.snapshot();
      const result = await gate.transition(command(before, "AUDIT_BYPASS_PATHS",
        `audit-${label}`, "2026-08-27T14:00:00.000Z", { results }));
      assert.equal(result.state.audit.status, "FAILED_TERMINAL_REVOKE");
      assert.equal(result.state.lifecycle.status, "REVOKED_HOLD");
      assert.equal(result.state.audit.results.length, PROBES.length);
      assert.equal(result.state.audit.alternateWritePathsExcluded, false);
      assert.equal(result.state.decision.fixtureMechanicsVerified, false);
      assertNoProductionAuthority(result);
      await assert.rejects(() => gate.transition(command(result.state, "PRESENT_ONCE",
        `present-${label}`, "2026-08-27T15:00:00.000Z", {
          observedBeforeStateHash: env.admission.bindings.state.beforeStateHash,
        })), /FIXTURE_ONE_USE_UNAVAILABLE/u);
    }
  });

test("strict time, before-state, explicit revocation, and expiry all fail closed",
  async (t) => {
    const env = environment(t, "expiry");
    const gate = harness(env);
    const initial = gate.snapshot();
    await assert.rejects(() => gate.transition(command(initial, "PRESENT_ONCE",
      "present-before-audit", "2026-08-27T13:30:00.000Z", {
        observedBeforeStateHash: env.admission.bindings.state.beforeStateHash,
      })), /FIXTURE_EXACT_BYPASS_PROBE_PASS_REQUIRED/u);

    await passAudit(gate);
    const audited = gate.snapshot();
    await assert.rejects(() => gate.transition(command(audited, "PRESENT_ONCE",
      "backfill-after-audit", "2026-08-27T13:59:59.999Z", {
        observedBeforeStateHash: env.admission.bindings.state.beforeStateHash,
      })), /FIXTURE_COMMAND_TIME_NOT_STRICTLY_MONOTONIC/u);
    await assert.rejects(() => gate.transition(command(audited, "PRESENT_ONCE",
      "wrong-before-state", "2026-08-27T15:00:00.000Z", {
        observedBeforeStateHash: h("wrong-before-state"),
      })), /FIXTURE_BEFORE_STATE_MISMATCH/u);
    await assert.rejects(() => gate.transition(command(audited, "PRESENT_ONCE",
      "present-at-expiry", FIXTURE_EXPIRES_AT, {
        observedBeforeStateHash: env.admission.bindings.state.beforeStateHash,
      })), /FIXTURE_PRESENT_AT_OR_AFTER_EXPIRY/u);
    const expired = await gate.transition(command(audited, "SWEEP_EXPIRY",
      "sweep-expiry", FIXTURE_EXPIRES_AT, {}));
    assert.equal(expired.state.lifecycle.status, "EXPIRED_HOLD");
    assert.equal(expired.state.candidate.presentationCount, 0);
    assertNoProductionAuthority(expired);

    const revokeEnv = environment(t, "revoke");
    const revokeGate = harness(revokeEnv);
    const revokeInitial = revokeGate.snapshot();
    await assert.rejects(() => revokeGate.transition(command(revokeInitial, "REVOKE",
      "backdated-revoke", FIXTURE_CREATED_AT, { reasonHash: h("reason") })),
    /FIXTURE_COMMAND_TIME_NOT_STRICTLY_MONOTONIC/u);
    const revoked = await revokeGate.transition(command(revokeInitial, "REVOKE",
      "revoke", "2026-08-27T13:30:00.000Z", { reasonHash: h("reason") }));
    assert.equal(revoked.state.lifecycle.status, "REVOKED_HOLD");
    assert.equal(revoked.state.lifecycle.terminalReason,
      "EXPLICIT_FIXTURE_REVOCATION");
    assertNoProductionAuthority(revoked);
  });

test("single-process concurrent stale presentations prove only harness CAS", async (t) => {
  const env = environment(t, "concurrency");
  const gate = harness(env);
  await passAudit(gate);
  const before = gate.snapshot();
  const payload = {
    observedBeforeStateHash: env.admission.bindings.state.beforeStateHash,
  };
  const first = command(before, "PRESENT_ONCE", "concurrent-a",
    "2026-08-27T15:00:00.000Z", payload);
  const second = command(before, "PRESENT_ONCE", "concurrent-b",
    "2026-08-27T15:00:00.001Z", payload);
  const settled = await Promise.allSettled([
    gate.transition(first),
    gate.transition(second),
  ]);
  assert.equal(settled.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(settled.filter(({ status }) => status === "rejected").length, 1);
  assert.match(String(settled.find(({ status }) => status === "rejected").reason),
    /FIXTURE_CAS_MISMATCH/u);
  const final = gate.snapshot();
  assert.equal(final.lifecycle.status, "PRESENTED_ONCE_HOLD");
  assert.equal(final.candidate.presentationCount, 1);
  assert.equal(final.mechanics.singleProcessInMemorySerialization, true);
  assert.equal(final.mechanics.crossProcessAtomicityEstablished, false);
  assert.equal(final.mechanics.actualWritePathVerified, false);
  assert.equal(final.decision.productionEligible, false);
  assert.equal(final.decision.fixtureMechanicsVerifiedIsProductionAuthority, false);
  assert.deepEqual(final.authority, OWNER_WRITE_GATE_NO_AUTHORITY);
});

test("fixture snapshots cannot be promoted by mutation or accessor-backed records", async (t) => {
  const env = environment(t, "snapshot-attack");
  const gate = harness(env);
  await passAudit(gate);
  const snapshot = gate.snapshot();
  const forged = structuredClone(snapshot);
  forged.productionEligible = true;
  forged.decision.actionReady = true;
  forged.authority.authorityEstablished = true;
  delete forged.stateHash;
  forged.stateHash = `sha256:${createHash("sha256")
    .update(`${OWNER_WRITE_GATE_CONFORMANCE_SCHEMAS.fixtureState}\0${canonicalizeStrict(forged)}`)
    .digest("hex")}`;
  const checked = verifyOwnerWriteGateFixtureSnapshotForTests(forged, {
    hold: env.hold,
    holdSource: env.source,
    expectedConformanceHash: env.hold.conformanceHash,
    expectedStateHash: forged.stateHash,
  });
  assert.equal(checked.ok, false);
  assertNoProductionAuthority(checked);

  let reads = 0;
  const accessor = { get stateHash() { reads += 1; return snapshot.stateHash; } };
  const accessorCheck = verifyOwnerWriteGateFixtureSnapshotForTests(accessor, {
    hold: env.hold,
    holdSource: env.source,
    expectedConformanceHash: env.hold.conformanceHash,
    expectedStateHash: snapshot.stateHash,
  });
  assert.equal(accessorCheck.ok, false);
  assert.equal(reads, 0);
  assertNoProductionAuthority(accessorCheck);
  assert.deepEqual(snapshot.authority, OWNER_WRITE_GATE_NO_AUTHORITY);
  assert.deepEqual(env.admissionRequest.authority, ACTION_ADMISSION_NO_AUTHORITY);
});
