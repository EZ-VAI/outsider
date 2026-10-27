import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  DELEGATION_RADIUS_ATOMS,
  normalizeDelegationRadius,
} from "../src/outsider-delegation-radius.js";
import {
  listProviderPatternEntities,
} from "../src/outsider-provider-pattern-registry.js";
import {
  listRealitySourceCandidates,
} from "../src/outsider-reality-source-scout.js";
import {
  EFFECT_CONSEQUENCE_REVIEW_SCHEMA,
  buildEffectConsequenceReviewProjection,
  verifyEffectConsequenceReviewProjection,
} from "../src/outsider-effect-consequence-review.js";

function hash(label) {
  return `sha256:${createHash("sha256").update(label).digest("hex")}`;
}

function bindings(overrides = {}) {
  return {
    claimWayWorld: {
      claimHash: overrides.claimHash ?? hash("claim"),
      wayHash: overrides.wayHash ?? hash("way"),
      worldHash: overrides.worldHash ?? hash("world"),
    },
    run: {
      episodeHash: overrides.episodeHash ?? hash("episode"),
      attemptHash: overrides.attemptHash ?? hash("attempt"),
      censusHash: overrides.censusHash ?? hash("census"),
    },
    action: {
      proposedActionHash: overrides.proposedActionHash ?? hash("proposed action"),
      beforeStateHash: overrides.beforeStateHash ?? hash("before state"),
      adapterDescriptorHash: overrides.adapterDescriptorHash
        ?? hash("adapter descriptor"),
      resourceTopologyHash: overrides.resourceTopologyHash
        ?? hash("resource topology"),
      projectorPolicyHash: overrides.projectorPolicyHash ?? hash("projector policy"),
    },
  };
}

function radius(atoms = DELEGATION_RADIUS_ATOMS) {
  return normalizeDelegationRadius({
    validity: {
      validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-08-28T00:00:00.000Z",
    },
    grants: atoms.map((atom) => ({
      atom,
      scopeHashes: [hash(`scope:${atom}`)],
      budget: { unitHash: hash(`unit:${atom}`), limit: "1" },
    })),
  });
}

function request(effectRadius = radius(), overrides = {}) {
  return {
    bindings: overrides.bindings ?? bindings(),
    capabilityRadius: overrides.capabilityRadius ?? effectRadius,
    effectRadius,
    selectedProviderEntityIds:
      overrides.selectedProviderEntityIds ?? listProviderPatternEntities(),
    selectedOfficialSourceCandidateIds:
      overrides.selectedOfficialSourceCandidateIds ?? listRealitySourceCandidates(),
  };
}

function reseal(value) {
  const copy = structuredClone(value);
  delete copy.projectionHash;
  copy.projectionHash = `sha256:${createHash("sha256")
    .update(`${EFFECT_CONSEQUENCE_REVIEW_SCHEMA}\0${canonicalizeStrict(copy)}`, "utf8")
    .digest("hex")}`;
  return copy;
}

test("all ten reviewed companies plus MatrAIx and all official source candidates widen review only", () => {
  const effectRadius = radius();
  const projection = buildEffectConsequenceReviewProjection(request(effectRadius));
  const checked = verifyEffectConsequenceReviewProjection(projection, {
    capabilityRadius: effectRadius,
    effectRadius,
    expectedProjectionHash: projection.projectionHash,
  });

  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "EXPECTED_HASH_BOUND");
  assert.deepEqual(projection.selectedProviderEntityIds,
    listProviderPatternEntities());
  assert.deepEqual(projection.selectedOfficialSourceCandidateIds,
    listRealitySourceCandidates());
  assert.deepEqual(projection.activeEffectAtoms, DELEGATION_RADIUS_ATOMS);
  assert.equal(projection.capabilityRadiusHash, effectRadius.radiusHash);
  assert.equal(projection.effectRadiusHash, effectRadius.radiusHash);
  assert.equal(projection.selectionMode,
    "ALL_REVIEWED_SOURCES_CONSERVATIVE_FLOOR");
  assert.deepEqual(projection.bindings.action, bindings().action);
  assert.equal(projection.dependencyBindings.providerReviewProjectionHashes.length, 11);
  assert.equal(projection.dependencyBindings.officialSourceReviewProjectionHashes.length, 11);

  for (const requirement of ["E_STOP", "HOST_SIDE_ACTIONS", "EXPLICIT_MISSINGNESS",
    "DATA_PROVENANCE", "FUNDS_MOVEMENT_ATTEMPT", "ALL_MANDATORY_HORIZONS"]) {
    assert.ok(projection.requiredEvidence.includes(requirement), requirement);
  }
  for (const requirement of ["BYSTANDERS", "BYPASS_DETECTION",
    "NO_INDIVIDUAL_ATTRIBUTION", "RIGHTSHOLDER", "BENEFICIARY", "REOPEN_OWNER"]) {
    assert.ok(projection.requiredResponsibility.includes(requirement), requirement);
  }
  for (const control of ["CEU_ZERO", "NO_REALITY_CENSUS",
    "NO_TRAINING_WITH_UNRESOLVED_RIGHTS", "ONE_USE_PHYSICAL_COMMAND",
    "EXTERNAL_FUNDS_AUTHORITY", "PRODUCTION_CLOSE_API_ABSENT"]) {
    assert.ok(projection.requiredControls.includes(control), control);
  }
  for (const channel of ["PATIENT_HARM", "NEAR_MISS", "PRINCIPAL",
    "BYSTANDER_HARM", "PRIVACY", "REVERSAL_OR_DISPUTE"]) {
    assert.ok(projection.channelHypotheses.includes(channel), channel);
  }
  for (const horizon of ["PRE_ATTEMPT", "IMMEDIATE_PHYSICAL_OUTCOME",
    "POST_DEPLOYMENT_MONITORING", "REVERSAL_WINDOW", "POST_CLOSURE_LATE_FACT"]) {
    assert.ok(projection.horizonHypotheses.includes(horizon), horizon);
  }
});

test("North Star safety outputs are immutable HOLDs with zero Reality/training credit", () => {
  const projection = buildEffectConsequenceReviewProjection(request(radius([
    "PHYSICAL_ACTUATE", "TRAIN", "MOVE_FUNDS",
  ])));
  assert.equal(projection.decision, "HOLD");
  for (const key of ["sourceTruth", "effectClosure", "affectedPartyCompleteness",
    "evidenceCoverage", "responsibilityCoverage", "providerApplicabilityEstablished",
    "authority", "actionReady", "executable"]) {
    assert.equal(projection[key], false, key);
  }
  for (const key of ["networkReads", "thirdPartyCodeExecuted", "payloadRowsIngested",
    "trainingRows", "causalExperienceUnits"]) {
    assert.equal(projection[key], 0, key);
  }
  assert.ok(projection.missingGates.includes("EFFECT_CLOSURE_NOT_SOURCE_REPLAYED"));
  assert.ok(projection.missingGates.includes(
    "AFFECTED_PARTY_REGISTER_NOT_SOURCE_REPLAYED"));
  assert.ok(projection.missingGates.includes("SOURCE_BYTES_NOT_REPLAYED"));
  assert.ok(projection.missingGates.includes(
    "PROVIDER_APPLICABILITY_OR_BYPASS_INVENTORY_INCOMPLETE"));
  assert.ok(Object.isFrozen(projection));
  assert.ok(Object.isFrozen(projection.requiredEvidence));
});

test("selection order is canonical while every run and effect binding changes the hash", () => {
  const effectRadius = radius(["OBSERVE", "PROPOSE", "WRITE_REVERSIBLE"]);
  const providers = listProviderPatternEntities();
  const sources = listRealitySourceCandidates();
  const left = buildEffectConsequenceReviewProjection(request(effectRadius, {
    selectedProviderEntityIds: providers,
    selectedOfficialSourceCandidateIds: sources,
  }));
  const right = buildEffectConsequenceReviewProjection(request(effectRadius, {
    selectedProviderEntityIds: [...providers].reverse(),
    selectedOfficialSourceCandidateIds: [...sources].reverse(),
  }));
  assert.equal(left.projectionHash, right.projectionHash);

  for (const changedBindings of [
    bindings({ claimHash: hash("other claim") }),
    bindings({ wayHash: hash("other way") }),
    bindings({ worldHash: hash("other world") }),
    bindings({ episodeHash: hash("other episode") }),
    bindings({ attemptHash: hash("other attempt") }),
    bindings({ censusHash: hash("other census") }),
    bindings({ proposedActionHash: hash("other action") }),
    bindings({ beforeStateHash: hash("other before state") }),
    bindings({ adapterDescriptorHash: hash("other adapter") }),
    bindings({ resourceTopologyHash: hash("other topology") }),
    bindings({ projectorPolicyHash: hash("other policy") }),
  ]) {
    const changed = buildEffectConsequenceReviewProjection(request(effectRadius, {
      bindings: changedBindings,
      selectedProviderEntityIds: providers,
      selectedOfficialSourceCandidateIds: sources,
    }));
    assert.notEqual(changed.projectionHash, left.projectionHash);
  }
  const wider = buildEffectConsequenceReviewProjection(request(radius([
    "OBSERVE", "PROPOSE", "WRITE_REVERSIBLE", "PERSIST",
  ]), {
    selectedProviderEntityIds: providers,
    selectedOfficialSourceCandidateIds: sources,
  }));
  assert.notEqual(wider.effectRadiusHash, left.effectRadiusHash);
  assert.notEqual(wider.projectionHash, left.projectionHash);
});

test("provider and database selections are hypotheses, not source truth", () => {
  const effectRadius = radius(["PHYSICAL_ACTUATE"]);
  const projection = buildEffectConsequenceReviewProjection(request(effectRadius, {
    selectedProviderEntityIds: listProviderPatternEntities(),
    selectedOfficialSourceCandidateIds: listRealitySourceCandidates(),
  }));
  assert.ok(projection.requiredEvidence.includes("DEVICE_IDENTITY"));
  assert.ok(projection.channelHypotheses.includes("DEVICE_FAILURE"));
  assert.ok(projection.channelHypotheses.includes("RECOVERY_DEMONSTRATION"));
  assert.equal(projection.sourceTruth, false);
  assert.equal(projection.effectClosure, false);
  assert.equal(projection.affectedPartyCompleteness, false);
  assert.equal(projection.authority, false);
});

test("self-consistent rehashing cannot promote or erase derived requirements", () => {
  const effectRadius = radius(["PHYSICAL_ACTUATE", "TRAIN"]);
  const projection = buildEffectConsequenceReviewProjection(request(effectRadius));
  const mutators = [
    (value) => { value.authority = true; },
    (value) => { value.providerApplicabilityEstablished = true; },
    (value) => { value.effectClosure = true; },
    (value) => { value.affectedPartyCompleteness = true; },
    (value) => { value.trainingRows = 1; },
    (value) => { value.capabilityRadiusHash = hash("forged capability radius"); },
    (value) => { value.bindings.action.proposedActionHash = hash("forged action"); },
    (value) => { value.bindings.action.beforeStateHash = hash("forged before state"); },
    (value) => { value.requiredEvidence = []; },
    (value) => { value.channelHypotheses = []; },
    (value) => {
      value.dependencyBindings.providerPatternRegistryHash = hash("fake registry");
    },
  ];
  for (const mutate of mutators) {
    const changed = structuredClone(projection);
    mutate(changed);
    const checked = verifyEffectConsequenceReviewProjection(reseal(changed), {
      capabilityRadius: effectRadius,
      effectRadius,
      expectedProjectionHash: projection.projectionHash,
    });
    assert.equal(checked.ok, false);
    assert.equal(checked.decision, "HOLD");
    assert.equal(checked.authority, false);
    assert.equal(checked.actionReady, false);
    assert.equal(checked.executable, false);
    assert.equal(checked.trainingRows, 0);
    assert.equal(checked.causalExperienceUnits, 0);
  }
});

test("verification requires complete externally supplied capability and effect radii", () => {
  const effectRadius = radius(["WRITE_REVERSIBLE"]);
  const projection = buildEffectConsequenceReviewProjection(request(effectRadius));
  assert.equal(verifyEffectConsequenceReviewProjection(projection, {}).ok, false);
  assert.equal(verifyEffectConsequenceReviewProjection(projection, {
    capabilityRadius: effectRadius,
    effectRadius: radius(["WRITE_IRREVERSIBLE"]),
  }).ok, false);
  assert.equal(verifyEffectConsequenceReviewProjection(projection, {
    capabilityRadius: radius(["WRITE_IRREVERSIBLE"]),
    effectRadius,
  }).ok, false);
  assert.equal(verifyEffectConsequenceReviewProjection(projection, {
    capabilityRadius: effectRadius,
    effectRadius,
    expectedProjectionHash: hash("wrong expected projection"),
  }).ok, false);
});

test("capability must contract effect and reviewed source floors cannot be caller-pruned", () => {
  const capabilityRadius = radius(["OBSERVE"]);
  const effectRadius = radius(["OBSERVE", "PROPOSE"]);
  const projection = buildEffectConsequenceReviewProjection(request(effectRadius, {
    capabilityRadius,
  }));
  assert.equal(projection.capabilityRadiusHash, capabilityRadius.radiusHash);
  assert.equal(projection.effectRadiusHash, effectRadius.radiusHash);
  assert.notEqual(projection.capabilityRadiusHash, projection.effectRadiusHash);

  assert.throws(() => buildEffectConsequenceReviewProjection(request(
    radius(["OBSERVE"]), { capabilityRadius: radius(["PHYSICAL_ACTUATE"]) })),
  /CAPABILITY_RADIUS_OUTSIDE_EFFECT_RADIUS/u);

  const poisonedCapabilityRadius = radius(["PHYSICAL_ACTUATE"]);
  const poisonedEffectRadius = radius(["OBSERVE"]);
  const originalEvery = Array.prototype.every;
  let result;
  try {
    Array.prototype.every = () => true;
    result = (() => {
      try {
        buildEffectConsequenceReviewProjection(request(poisonedEffectRadius, {
          capabilityRadius: poisonedCapabilityRadius,
        }));
        return "ACCEPTED";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })();
  } finally {
    Array.prototype.every = originalEvery;
  }
  assert.match(result, /CAPABILITY_RADIUS_OUTSIDE_EFFECT_RADIUS/u);

  const providers = listProviderPatternEntities();
  const sources = listRealitySourceCandidates();
  assert.throws(() => buildEffectConsequenceReviewProjection(request(effectRadius, {
    capabilityRadius,
    selectedProviderEntityIds: providers.slice(1),
  })), /PROVIDER_SELECTION_MUST_EQUAL_ALL_REVIEWED_ENTITIES/u);
  assert.throws(() => buildEffectConsequenceReviewProjection(request(effectRadius, {
    capabilityRadius,
    selectedOfficialSourceCandidateIds: sources.slice(1),
  })), /SOURCE_SELECTION_MUST_EQUAL_ALL_REVIEWED_CANDIDATES/u);
});

test("accessors, sparse arrays, duplicates, bottom radius, and unknown IDs fail closed", () => {
  let recordReads = 0;
  let contextReads = 0;
  const record = {
    get schema() { recordReads += 1; return EFFECT_CONSEQUENCE_REVIEW_SCHEMA; },
  };
  const context = {
    get capabilityRadius() { contextReads += 1; return radius(["OBSERVE"]); },
    get effectRadius() { contextReads += 1; return radius(["OBSERVE"]); },
  };
  const checked = verifyEffectConsequenceReviewProjection(record, context);
  assert.equal(checked.ok, false);
  assert.equal(checked.authority, false);
  assert.equal(recordReads, 0);
  assert.equal(contextReads, 0);

  const effectRadius = radius(["OBSERVE"]);
  const sparseProviders = ["MATRAIX"];
  sparseProviders.length = 2;
  assert.throws(() => buildEffectConsequenceReviewProjection(request(effectRadius, {
    selectedProviderEntityIds: sparseProviders,
  })), /dense and undecorated|DENSE_ARRAY_REQUIRED/u);
  assert.throws(() => buildEffectConsequenceReviewProjection(request(effectRadius, {
    selectedProviderEntityIds: ["MATRAIX", "MATRAIX"],
  })), /DUPLICATE/u);
  assert.throws(() => buildEffectConsequenceReviewProjection(request(effectRadius, {
    selectedProviderEntityIds: ["UNKNOWN"],
  })), /PROVIDER_SELECTION_MUST_EQUAL_ALL_REVIEWED_ENTITIES/u);
  assert.throws(() => buildEffectConsequenceReviewProjection(request(effectRadius, {
    selectedOfficialSourceCandidateIds: ["UNKNOWN"],
  })), /SOURCE_SELECTION_MUST_EQUAL_ALL_REVIEWED_CANDIDATES/u);
  const bottom = normalizeDelegationRadius({ validity: null, grants: [] });
  assert.throws(() => buildEffectConsequenceReviewProjection(request(bottom, {
    capabilityRadius: radius(["OBSERVE"]),
  })), /EFFECT_RADIUS_EMPTY/u);
});

test("post-import intrinsic poisoning cannot create permission or alter replay", () => {
  const effectRadius = radius(["PHYSICAL_ACTUATE", "TRAIN"]);
  const input = request(effectRadius);
  const originalClone = globalThis.structuredClone;
  const originalFlatMap = Array.prototype.flatMap;
  const originalValues = Object.values;
  let projection;
  try {
    globalThis.structuredClone = () => ({ authority: true, actionReady: true });
    Array.prototype.flatMap = () => [];
    Object.values = () => [];
    projection = buildEffectConsequenceReviewProjection(input);
  } finally {
    globalThis.structuredClone = originalClone;
    Array.prototype.flatMap = originalFlatMap;
    Object.values = originalValues;
  }
  assert.equal(projection.authority, false);
  assert.equal(projection.actionReady, false);
  assert.ok(projection.requiredEvidence.includes("E_STOP"));
  assert.ok(projection.requiredControls.includes("CEU_ZERO"));

  const originalSort = Array.prototype.sort;
  const originalDescriptor = Object.getOwnPropertyDescriptor;
  let checked;
  try {
    Array.prototype.sort = () => [];
    Object.getOwnPropertyDescriptor = () => ({
      value: true, enumerable: true, configurable: true, writable: true,
    });
    checked = verifyEffectConsequenceReviewProjection(projection, {
      capabilityRadius: effectRadius, effectRadius,
    });
  } finally {
    Array.prototype.sort = originalSort;
    Object.getOwnPropertyDescriptor = originalDescriptor;
  }
  assert.equal(checked.ok, true);
  assert.equal(checked.decision, "HOLD");
  assert.equal(checked.authority, false);
  assert.equal(checked.actionReady, false);
  assert.equal(checked.executable, false);
});
