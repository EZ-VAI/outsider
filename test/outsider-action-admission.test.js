import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  ACTION_ADMISSION_NO_AUTHORITY,
  ACTION_ADMISSION_SCHEMAS,
  createActionEvidenceCommitment,
  createActionResponsibilityCommitment,
  createUnresolvedExternalAuthoritySlot,
  requestActionAdmission,
  verifyActionAdmissionRequest,
  verifyUnresolvedExternalAuthoritySlot,
} from "../src/outsider-action-admission.js";
import { normalizeDelegationRadius } from "../src/outsider-delegation-radius.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const WINDOW = Object.freeze({
  validFrom: "2026-08-27T00:00:00.000Z",
  validUntil: "2026-08-28T00:00:00.000Z",
});

function radius({ scopes = [h("scope:a")], limit = "2", atom = "OBSERVE",
  unit = h("unit:operations"), validity = WINDOW } = {}) {
  return normalizeDelegationRadius({
    validity,
    grants: [{ atom, scopeHashes: scopes, budget: { unitHash: unit, limit } }],
  });
}

function fixture(overrides = {}) {
  const capabilityRadius = overrides.capabilityRadius ?? radius({ limit: "2" });
  const effectRadius = overrides.effectRadius ?? radius({ limit: "3" });
  const authorityRadius = overrides.authorityRadius ?? radius({ limit: "5" });
  const evidenceRadius = overrides.evidenceRadius ?? radius({ limit: "6" });
  const responsibilityRadius = overrides.responsibilityRadius ?? radius({ limit: "7" });
  const channel = h("affected-channel:resource-owner");
  const horizon = h("horizon:delayed-30d");
  const authoritySlot = overrides.authoritySlot
    ?? createUnresolvedExternalAuthoritySlot({
      externalVerifierContractHash: h("external-verifier-contract"),
      authorityArtifactRefHash: h("external-authority-artifact-slot"),
      authorityRadiusHash: authorityRadius.radiusHash,
    });
  const evidenceCommitment = overrides.evidenceCommitment
    ?? createActionEvidenceCommitment({
      commitmentRefHash: h("evidence-commitment-ref"),
      radius: evidenceRadius,
      affectedChannelHashes: [channel, h("affected-channel:operator")],
      horizonHashes: [horizon, h("horizon:immediate")],
      custodianRefHashes: [h("evidence-custodian")],
    });
  const responsibilityCommitment = overrides.responsibilityCommitment
    ?? createActionResponsibilityCommitment({
      commitmentRefHash: h("responsibility-commitment-ref"),
      radius: responsibilityRadius,
      affectedChannelHashes: [channel, h("affected-channel:operator")],
      horizonHashes: [horizon, h("horizon:immediate")],
      responsiblePartyRefHashes: [h("responsible-party")],
    });
  return {
    bindings: {
      claimWayWorld: { claimHash: h("claim"), wayHash: h("way"), worldHash: h("world") },
      run: { episodeHash: h("episode"), attemptHash: h("attempt"), censusHash: h("census") },
      governance: {
        ownerGateSlotHash: h("owner-gate-slot"),
        adoptionSlotHash: h("adoption-slot"),
        revocationStatusSlotHash: h("revocation-status-slot"),
      },
      state: { beforeStateHash: h("before-state") },
      validity: { validitySlotHash: h("validity-slot"),
        evaluatedAt: "2026-08-27T12:00:00.000Z" },
    },
    capabilityRadius,
    effectRadius,
    referencedAuthority: { radius: authorityRadius, externalVerifierSlot: authoritySlot },
    evidence: { radius: evidenceRadius, commitment: evidenceCommitment },
    responsibility: { radius: responsibilityRadius, commitment: responsibilityCommitment },
    consequenceEnvelope: { affectedChannelHashes: [channel], horizonHashes: [horizon] },
  };
}

function resealRequest(record) {
  const body = structuredClone(record);
  delete body.admissionRequestHash;
  return {
    ...body,
    admissionRequestHash: `sha256:${createHash("sha256")
      .update(`${ACTION_ADMISSION_SCHEMAS.request}\0${canonicalizeStrict(body)}`)
      .digest("hex")}`,
  };
}

function assertNoAuthority(value) {
  assert.deepEqual(value, ACTION_ADMISSION_NO_AUTHORITY);
  assert.ok(Object.values(value).every((item) => item === false));
}

test("well-covered action still yields only an expected-hash-bound HOLD request", () => {
  const source = fixture();
  const request = requestActionAdmission(source);
  assert.equal(request.schema, ACTION_ADMISSION_SCHEMAS.request);
  assert.equal(request.checks.capabilityWithinReferencedAuthorityRadius, true);
  assert.equal(request.checks.capabilityWithinConservativeEffectRadius, true);
  assert.equal(request.checks.effectWithinEvidenceRadius, true);
  assert.equal(request.checks.effectWithinResponsibilityRadius, true);
  assert.equal(request.structuralChecksSatisfied, true);
  assert.equal(request.reviewRequestKind, "ADMISSION_REVIEW_REQUEST");
  assert.deepEqual(request.holdReasons, ["EXTERNAL_AUTHORITY_UNESTABLISHED"]);
  assert.deepEqual(request.decision, {
    state: "HOLD",
    admissionRequested: true,
    expansionRequested: false,
    admitted: false,
    actionReady: false,
    executable: false,
    executionToken: null,
    authorityEstablished: false,
  });
  assert.equal(Object.isFrozen(request), true);
  assertNoAuthority(request.authority);
  assert.deepEqual(request.radiusBindings, {
    capabilityRadiusHash: source.capabilityRadius.radiusHash,
    referencedAuthorityRadiusHash: source.referencedAuthority.radius.radiusHash,
    conservativeEffectRadiusHash: source.effectRadius.radiusHash,
    evidenceRadiusHash: source.evidence.radius.radiusHash,
    responsibilityRadiusHash: source.responsibility.radius.radiusHash,
  });

  const checked = verifyActionAdmissionRequest(request, { source,
    expectedAdmissionRequestHash: request.admissionRequestHash });
  assert.equal(checked.ok, true);
  assert.equal(checked.decisionState, "HOLD");
  assert.equal(checked.admitted, false);
  assert.equal(checked.actionReady, false);
  assert.equal(checked.executable, false);
  assertNoAuthority(checked.authority);
});

test("local authority slots cannot accept booleans, keys, signatures, hashes, or become true", () => {
  const source = fixture();
  const slot = source.referencedAuthority.externalVerifierSlot;
  assert.equal(slot.authorityEstablished, false);
  assert.equal(slot.externalVerificationReceiptHash, null);
  assert.equal(slot.localConstructorCanEstablishAuthority, false);
  assertNoAuthority(slot.authority);
  assert.equal(verifyUnresolvedExternalAuthoritySlot(slot,
    { expectedAuthoritySlotHash: slot.authoritySlotHash }).ok, true);

  for (const field of ["authorityEstablished", "callerAuthorized", "selfKeyHash",
    "localSignature", "externalVerificationReceiptHash"]) {
    assert.throws(() => createUnresolvedExternalAuthoritySlot({
      externalVerifierContractHash: h("external-verifier-contract"),
      authorityArtifactRefHash: h("authority-ref"),
      authorityRadiusHash: source.referencedAuthority.radius.radiusHash,
      [field]: field === "authorityEstablished" ? true : h(field),
    }), /AUTHORITY_SLOT_INPUT_FIELDS_INVALID/u);
  }

  const forged = structuredClone(slot);
  forged.authorityEstablished = true;
  assert.equal(verifyUnresolvedExternalAuthoritySlot(forged).ok, false);
});

test("scope and budget expansion are machine-visible and remain on HOLD", () => {
  const authorityRadius = radius({ scopes: [h("scope:a")], limit: "2" });
  const capabilityRadius = radius({ scopes: [h("scope:a"), h("scope:b")], limit: "3" });
  const effectRadius = radius({ scopes: [h("scope:a"), h("scope:b")], limit: "4" });
  const evidenceRadius = radius({ scopes: [h("scope:a"), h("scope:b")], limit: "3" });
  const responsibilityRadius = radius({ scopes: [h("scope:a"), h("scope:b")], limit: "4" });
  const source = fixture({ capabilityRadius, effectRadius, authorityRadius,
    evidenceRadius, responsibilityRadius });
  const request = requestActionAdmission(source);
  assert.equal(request.checks.capabilityWithinReferencedAuthorityRadius, false);
  assert.equal(request.checks.effectWithinEvidenceRadius, false);
  assert.equal(request.checks.effectWithinResponsibilityRadius, true);
  assert.equal(request.structuralChecksSatisfied, false);
  assert.equal(request.reviewRequestKind, "EXPANSION_AND_ADMISSION_REVIEW_REQUEST");
  assert.equal(request.decision.state, "HOLD");
  assert.equal(request.decision.expansionRequested, true);
  assert.equal(request.decision.admitted, false);
  assert.ok(request.holdReasons.includes("CAPABILITY_OUTSIDE_REFERENCED_AUTHORITY_RADIUS"));
  assert.ok(request.holdReasons.includes("EVIDENCE_RADIUS_LAGS_EFFECT_RADIUS"));
});

test("an effect radius narrower than capability is rejected as non-conservative", () => {
  const capabilityRadius = radius({ limit: "3" });
  const effectRadius = radius({ limit: "2" });
  const request = requestActionAdmission(fixture({ capabilityRadius, effectRadius }));
  assert.equal(request.checks.capabilityWithinConservativeEffectRadius, false);
  assert.ok(request.holdReasons.includes("EFFECT_RADIUS_UNDERSTATES_CAPABILITY"));
  assert.equal(request.decision.actionReady, false);
});

test("affected channels and horizons are mandatory and must be covered on both planes", () => {
  const base = fixture();
  assert.throws(() => createActionEvidenceCommitment({
    commitmentRefHash: h("evidence"), radius: base.evidence.radius,
    affectedChannelHashes: [], horizonHashes: [h("horizon")],
    custodianRefHashes: [h("custodian")],
  }), /EVIDENCE_AFFECTED_CHANNELS_DENSE_ARRAY_REQUIRED/u);
  assert.throws(() => createActionResponsibilityCommitment({
    commitmentRefHash: h("responsibility"), radius: base.responsibility.radius,
    affectedChannelHashes: [h("channel")], horizonHashes: [],
    responsiblePartyRefHashes: [h("party")],
  }), /RESPONSIBILITY_HORIZONS_DENSE_ARRAY_REQUIRED/u);
  assert.throws(() => requestActionAdmission({ ...base,
    consequenceEnvelope: { affectedChannelHashes: [], horizonHashes: [h("horizon")] } }),
  /CONSEQUENCE_AFFECTED_CHANNELS_DENSE_ARRAY_REQUIRED/u);

  const uncovered = requestActionAdmission({ ...base,
    consequenceEnvelope: {
      affectedChannelHashes: [h("affected-channel:not-committed")],
      horizonHashes: [h("horizon:not-committed")],
    },
  });
  assert.equal(uncovered.checks.evidenceCoversAffectedChannels, false);
  assert.equal(uncovered.checks.evidenceCoversHorizons, false);
  assert.equal(uncovered.checks.responsibilityCoversAffectedChannels, false);
  assert.equal(uncovered.checks.responsibilityCoversHorizons, false);
  assert.equal(uncovered.decision.state, "HOLD");
});

test("post-import intrinsic replacement cannot forge radius or consequence coverage", () => {
  const base = fixture();
  const originalEvery = Array.prototype.every;
  const originalValues = Object.values;
  let request;
  try {
    Array.prototype.every = () => true;
    Object.values = () => [];
    request = requestActionAdmission({
      ...base,
      capabilityRadius: radius({ atom: "PHYSICAL_ACTUATE", limit: "2" }),
      effectRadius: radius({ atom: "OBSERVE", limit: "3" }),
      consequenceEnvelope: {
        affectedChannelHashes: [h("affected-channel:not-committed")],
        horizonHashes: [h("horizon:not-committed")],
      },
    });
  } finally {
    Array.prototype.every = originalEvery;
    Object.values = originalValues;
  }
  assert.equal(request.checks.capabilityWithinConservativeEffectRadius, false);
  assert.equal(request.checks.evidenceCoversAffectedChannels, false);
  assert.equal(request.checks.evidenceCoversHorizons, false);
  assert.equal(request.checks.responsibilityCoversAffectedChannels, false);
  assert.equal(request.checks.responsibilityCoversHorizons, false);
  assert.equal(request.structuralChecksSatisfied, false);
  assert.equal(request.decision.state, "HOLD");
  assert.equal(request.decision.actionReady, false);
  assert.equal(request.decision.executable, false);
});

test("self-consistent request rehash cannot forge an outcome", () => {
  const source = fixture();
  const original = requestActionAdmission(source);
  const clone = structuredClone(original);
  clone.decision.actionReady = true;
  clone.decision.admitted = true;
  clone.decision.executable = true;
  clone.decision.executionToken = h("forged-token");
  clone.decision.authorityEstablished = true;
  const forged = resealRequest(clone);
  assert.notEqual(forged.admissionRequestHash, original.admissionRequestHash);
  const checked = verifyActionAdmissionRequest(forged, { source,
    expectedAdmissionRequestHash: original.admissionRequestHash });
  assert.equal(checked.ok, false);
  assert.equal(checked.authorityEstablished, false);
  assert.equal(checked.admitted, false);
  assert.equal(checked.actionReady, false);
  assert.equal(checked.executable, false);
});

test("evidence cannot be laundered into authority and authority refs cannot become outcomes", () => {
  const base = fixture();
  assert.throws(() => requestActionAdmission({ ...base,
    referencedAuthority: {
      radius: base.referencedAuthority.radius,
      externalVerifierSlot: base.evidence.commitment,
    },
  }), /REFERENCED_AUTHORITY_SLOT_INVALID/u);

  const evidenceNamedSlot = createUnresolvedExternalAuthoritySlot({
    externalVerifierContractHash: base.evidence.commitment.evidenceCommitmentHash,
    authorityArtifactRefHash: base.evidence.commitment.commitmentRefHash,
    authorityRadiusHash: base.referencedAuthority.radius.radiusHash,
  });
  const laundered = requestActionAdmission({ ...base,
    referencedAuthority: { radius: base.referencedAuthority.radius,
      externalVerifierSlot: evidenceNamedSlot },
    bindings: { ...base.bindings,
      governance: {
        ...base.bindings.governance,
        adoptionSlotHash: evidenceNamedSlot.authorityArtifactRefHash,
      } },
  });
  assert.equal(laundered.decision.state, "HOLD");
  assert.equal(laundered.decision.authorityEstablished, false);
  assert.equal(laundered.decision.admitted, false);
  assert.equal(laundered.decision.actionReady, false);
  assertNoAuthority(laundered.authority);

  assert.throws(() => requestActionAdmission({ ...base,
    bindings: { ...base.bindings, authorityEstablished: true },
  }), /BINDINGS_FIELDS_INVALID/u);
});

test("sparse, decorated, exotic, raw, and secret-shaped inputs fail closed", () => {
  const base = fixture();
  const sparse = [h("channel")];
  sparse.length = 2;
  assert.throws(() => createActionEvidenceCommitment({
    commitmentRefHash: h("evidence"), radius: base.evidence.radius,
    affectedChannelHashes: sparse, horizonHashes: [h("horizon")],
    custodianRefHashes: [h("custodian")],
  }), /EVIDENCE_AFFECTED_CHANNELS_DENSE_ARRAY_REQUIRED/u);

  const decorated = [h("horizon")];
  decorated.authorityEstablished = true;
  assert.throws(() => requestActionAdmission({ ...base,
    consequenceEnvelope: { affectedChannelHashes: [h("channel")],
      horizonHashes: decorated },
  }), /CONSEQUENCE_HORIZONS_DENSE_ARRAY_REQUIRED/u);

  const symbolDecorated = structuredClone(base.bindings);
  symbolDecorated[Symbol("secret")] = true;
  assert.throws(() => requestActionAdmission({ ...base, bindings: symbolDecorated }),
    /BINDINGS_PLAIN_DATA_OBJECT_REQUIRED/u);
  assert.throws(() => requestActionAdmission({ ...base,
    bindings: { ...base.bindings, state: { beforeStateHash: "/tmp/raw-state.json" } },
  }), /BEFORE_STATE_HASH_INVALID/u);
});

test("opaque Claim×Way×World/run/governance/state/validity bindings are all required", () => {
  const base = fixture();
  const request = requestActionAdmission(base);
  assert.deepEqual(request.bindings, base.bindings);
  for (const group of ["claimWayWorld", "run", "governance", "state", "validity"]) {
    const bindings = structuredClone(base.bindings);
    delete bindings[group];
    assert.throws(() => requestActionAdmission({ ...base, bindings }), /BINDINGS_FIELDS_INVALID/u);
  }
  const outside = fixture();
  outside.bindings.validity.evaluatedAt = "2026-08-29T00:00:00.000Z";
  const held = requestActionAdmission(outside);
  assert.equal(held.checks.allRadiusValiditiesCoverEvaluation, false);
  assert.ok(held.holdReasons.includes("VALIDITY_WINDOW_GAP"));
  assert.equal(held.decision.state, "HOLD");

  for (const evaluatedAt of ["2026-08-27T12:00:00",
    "2026-08-27T12:00:00+08:00", "2026-08-27T12:00:00Z",
    "2026-02-30T12:00:00.000Z"]) {
    const noncanonical = fixture();
    noncanonical.bindings.validity.evaluatedAt = evaluatedAt;
    assert.throws(() => requestActionAdmission(noncanonical), /EVALUATED_AT_INVALID/u);
  }
});
