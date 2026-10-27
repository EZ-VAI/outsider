import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  normalizeDelegationRadius,
} from "../src/outsider-delegation-radius.js";
import {
  EFFECT_CONSEQUENCE_REVIEW_SCHEMA,
  buildEffectConsequenceReviewProjection,
} from "../src/outsider-effect-consequence-review.js";
import { buildMatraixPersonaMetadataProjection } from
  "../src/outsider-matraix-persona-metadata.js";
import { listProviderPatternEntities } from
  "../src/outsider-provider-pattern-registry.js";
import { listRealitySourceCandidates } from
  "../src/outsider-reality-source-scout.js";
import {
  AFFECTED_PARTY_REGISTER_SCHEMAS,
  buildAffectedPartyRegister,
  createAffectedPartyRegisterSource,
  verifyAffectedPartyRegister,
} from "../src/outsider-affected-party-register.js";

const MATRAIX_SOURCE_URL = new URL(
  "../references/matraix-persona-maintainer-reviewed-source-manifest.json",
  import.meta.url,
);
const MATRAIX_PROJECTION_HASH = buildMatraixPersonaMetadataProjection(
  readFileSync(MATRAIX_SOURCE_URL)).artifactHash;

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function bindings(overrides = {}) {
  return {
    claimWayWorld: {
      claimHash: overrides.claimHash ?? h("claim"),
      wayHash: overrides.wayHash ?? h("way"),
      worldHash: overrides.worldHash ?? h("world"),
    },
    run: {
      episodeHash: overrides.episodeHash ?? h("episode"),
      attemptHash: overrides.attemptHash ?? h("attempt"),
      censusHash: overrides.censusHash ?? h("census"),
    },
    action: {
      proposedActionHash: overrides.proposedActionHash ?? h("proposed-action"),
      beforeStateHash: overrides.beforeStateHash ?? h("before-state"),
      adapterDescriptorHash: overrides.adapterDescriptorHash ?? h("adapter"),
      resourceTopologyHash: overrides.resourceTopologyHash ?? h("topology"),
      projectorPolicyHash: overrides.projectorPolicyHash ?? h("projector-policy"),
    },
  };
}

function radius(atoms = ["OBSERVE"]) {
  const grants = [];
  for (let index = 0; index < atoms.length; index += 1) {
    const atom = atoms[index];
    grants.push({
      atom,
      scopeHashes: [h(`scope:${atom}`)],
      budget: { unitHash: h(`unit:${atom}`), limit: "1" },
    });
  }
  return normalizeDelegationRadius({
    validity: {
      validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-08-28T00:00:00.000Z",
    },
    grants,
  });
}

function effectFixture(overrides = {}) {
  const effectRadius = overrides.effectRadius ?? radius();
  const capabilityRadius = overrides.capabilityRadius ?? effectRadius;
  const effectBindings = overrides.bindings ?? bindings();
  const projection = buildEffectConsequenceReviewProjection({
    bindings: effectBindings,
    capabilityRadius,
    effectRadius,
    selectedProviderEntityIds: listProviderPatternEntities(),
    selectedOfficialSourceCandidateIds: listRealitySourceCandidates(),
  });
  return { projection, context: { capabilityRadius, effectRadius } };
}

function flatSubject(effectBindings) {
  return {
    claimHash: effectBindings.claimWayWorld.claimHash,
    wayHash: effectBindings.claimWayWorld.wayHash,
    worldHash: effectBindings.claimWayWorld.worldHash,
    episodeHash: effectBindings.run.episodeHash,
    attemptHash: effectBindings.run.attemptHash,
    censusHash: effectBindings.run.censusHash,
  };
}

function coverageSubject(label, partyClass, channelIds, standingOverride) {
  const unresolved = partyClass === "POTENTIAL_BYSTANDER_CLASS"
    || partyClass === "UNKNOWN_AFFECTED_CLASS"
    || partyClass === "ENVIRONMENTAL_INTEREST_CLASS";
  return {
    coverageSubjectRefHash: h(`${label}-coverage-subject`),
    partyClass,
    standingBasisReviewRefHash: standingOverride === undefined
      ? unresolved ? null : h(`${label}-standing-review`) : standingOverride,
    channelIds,
  };
}

function sourceInput(effect, coverageSubjects) {
  return {
    subjectBindings: flatSubject(effect.projection.bindings),
    beforeStateHash: effect.projection.bindings.action.beforeStateHash,
    effectConsequenceReviewProjection: effect.projection,
    effectReviewContext: effect.context,
    matraixReviewRefs: [{ sourceId: "MATRAIX_PERSONA_1M",
      projectionHash: MATRAIX_PROJECTION_HASH }],
    coverageSubjects,
  };
}

function fixture(coverageSubjectsFactory) {
  const effect = effectFixture();
  const coverageSubjects = coverageSubjectsFactory === undefined ? [
    coverageSubject("owner", "DIRECT_AFFECTED_PARTY",
      [effect.projection.channelHypotheses[0]]),
    coverageSubject("bystander", "POTENTIAL_BYSTANDER_CLASS",
      [effect.projection.channelHypotheses[0]]),
  ] : coverageSubjectsFactory(effect);
  const source = createAffectedPartyRegisterSource(sourceInput(effect,
    coverageSubjects));
  const register = buildAffectedPartyRegister(source);
  return { effect, source, register };
}

function verify(built, expectedRootHash = built.register.affectedPartyRootHash) {
  return verifyAffectedPartyRegister(built.register, {
    source: built.source,
    expectedSourceHash: built.source.sourceHash,
    expectedAffectedPartyRootHash: expectedRootHash,
  });
}

function reseal(record, schema, field) {
  const changed = structuredClone(record);
  delete changed[field];
  changed[field] = `sha256:${createHash("sha256")
    .update(`${schema}\0${canonicalizeStrict(changed)}`, "utf8").digest("hex")}`;
  return changed;
}

test("full effect record/context replay binds action state and all 11+11 review tuples", () => {
  const built = fixture();
  const checked = verify(built);
  assert.equal(checked.ok, true);
  assert.equal(checked.sourceReplayComplete, true);
  assert.equal(checked.effectReviewSourceRebuildComplete, true);
  assert.equal(built.source.effectConsequenceReviewProjectionHash,
    built.effect.projection.projectionHash);
  assert.equal(built.source.beforeStateHash,
    built.effect.projection.bindings.action.beforeStateHash);
  assert.deepEqual(built.source.subjectBindings,
    flatSubject(built.effect.projection.bindings));
  assert.equal(built.source.reviewRefs.providerReviews.length, 11);
  assert.equal(built.source.reviewRefs.realityReviews.length, 11);
  assert.equal(built.source.reviewRefs.matraixReviews[0].projectionHash,
    MATRAIX_PROJECTION_HASH);
  assert.deepEqual(built.source.reviewRefs.providerReviews,
    built.effect.projection.dependencyBindings.providerReviewProjectionHashes);
  assert.deepEqual(built.source.reviewRefs.realityReviews,
    built.effect.projection.dependencyBindings.officialSourceReviewProjectionHashes);
});

test("every effect channel and mandatory horizon becomes a deterministic review row", () => {
  const built = fixture();
  assert.equal(built.source.effectChannelRows.length,
    built.effect.projection.channelHypotheses.length);
  assert.equal(built.source.coverageRows.length,
    built.effect.projection.channelHypotheses.length);
  assert.equal(built.source.mandatoryHorizonRows.length,
    built.effect.projection.horizonHypotheses.length);
  assert.ok(built.source.mandatoryHorizonRows.every(({ mandatory }) => mandatory));
  assert.deepEqual(built.source.effectChannelRows.map(({ channelId }) => channelId),
    built.effect.projection.channelHypotheses);
  assert.deepEqual(built.source.mandatoryHorizonRows.map(({ horizonId }) => horizonId),
    built.effect.projection.horizonHypotheses);
  assert.equal(built.register.accounting.assignedChannelRows, 1);
  assert.ok(built.register.gapReasons.includes(
    "EFFECT_CHANNEL_HYPOTHESIS_COVERAGE_UNASSIGNED"));
});

test("unknown and potential-bystander placeholders are unresolved classes, never standing", () => {
  const unknown = fixture((effect) => [coverageSubject("unknown",
    "UNKNOWN_AFFECTED_CLASS", [effect.projection.channelHypotheses[0]])]);
  const row = unknown.register.coverageRows.find(({ unresolvedClassRefHashes }) =>
    unresolvedClassRefHashes.length > 0);
  assert.ok(row);
  assert.equal(row.partyCandidateRefHashes.length, 0);
  assert.equal(row.unresolvedClassRefHashes.length, 1);
  assert.equal(unknown.register.coverageSubjects[0].coverageSubjectKind,
    "UNRESOLVED_CLASS");
  assert.equal(unknown.register.coverageSubjects[0].standingBasisReviewRefHash, null);
  assert.ok(unknown.register.gapReasons.includes(
    "UNKNOWN_AFFECTED_CLASS_PRESENT_AS_UNRESOLVED_CLASS_ONLY"));
  assert.equal(unknown.register.standingEstablished, false);

  const effect = effectFixture();
  assert.throws(() => createAffectedPartyRegisterSource(sourceInput(effect, [
    coverageSubject("false-standing", "UNKNOWN_AFFECTED_CLASS",
      [effect.projection.channelHypotheses[0]], h("standing")),
  ])), /UNRESOLVED_CLASS_CANNOT_CARRY_STANDING_BASIS/u);
});

test("empty and placeholder-omitted sources remain explicit structural HOLDs", () => {
  const empty = fixture(() => []);
  assert.equal(verify(empty).ok, true);
  assert.ok(empty.register.gapReasons.includes(
    "EMPTY_AFFECTED_PARTY_REVIEW_REGISTER"));
  assert.ok(empty.register.gapReasons.includes(
    "AFFECTED_CLASS_COVERAGE_PLACEHOLDER_OMITTED"));
  assert.ok(empty.register.gapReasons.includes("NO_AFFECTED_PARTY_CANDIDATE_PRESENT"));

  const direct = fixture((effect) => [coverageSubject("direct-only",
    "DIRECT_AFFECTED_PARTY", [effect.projection.channelHypotheses[0]])]);
  assert.ok(direct.register.gapReasons.includes(
    "AFFECTED_CLASS_COVERAGE_PLACEHOLDER_OMITTED"));
  for (const built of [empty, direct]) {
    assert.equal(built.register.providerApplicabilityEstablished, false);
    assert.equal(built.register.effectClosureEstablished, false);
    assert.equal(built.register.affectedPartyCompletenessEstablished, false);
    assert.equal(built.register.standingEstablished, false);
    assert.equal(built.register.semanticClosureEligible, false);
    assert.equal(built.register.decisionState, "HOLD");
    assert.equal(built.register.actionReady, false);
    assert.equal(built.register.causalExperienceUnits, 0);
  }
});

test("caller booleans, raw identity, callbacks, accessors, sparse arrays and symbols fail", () => {
  const effect = effectFixture();
  const input = sourceInput(effect, []);
  assert.throws(() => createAffectedPartyRegisterSource({ ...input, verified: true }),
    /FIELDS_INVALID/u);
  assert.throws(() => createAffectedPartyRegisterSource({ ...input,
    coverageSubjects: [{ ...coverageSubject("pii", "DIRECT_AFFECTED_PARTY", []),
      rawName: "person name" }] }), /FIELDS_INVALID/u);

  let invoked = false;
  const accessor = coverageSubject("accessor", "DIRECT_AFFECTED_PARTY", []);
  Object.defineProperty(accessor, "partyClass", {
    enumerable: true,
    get() { invoked = true; return "DIRECT_AFFECTED_PARTY"; },
  });
  assert.throws(() => createAffectedPartyRegisterSource({ ...input,
    coverageSubjects: [accessor] }), /enumerable data properties/u);
  assert.equal(invoked, false);

  assert.throws(() => createAffectedPartyRegisterSource({ ...input,
    coverageSubjects: new Array(1) }), /dense and undecorated/u);
  assert.throws(() => createAffectedPartyRegisterSource({ ...input,
    callback() { invoked = true; } }), /unsupported canonical value type:function/u);
  assert.equal(invoked, false);

  const symbolized = structuredClone(input);
  symbolized[Symbol("authority")] = true;
  assert.throws(() => createAffectedPartyRegisterSource(symbolized),
    /symbol properties/u);
});

test("source replay rejects effect, before-state, and review tuple splices", () => {
  const built = fixture();

  const effectSplice = structuredClone(built.source);
  effectSplice.effectConsequenceReviewProjection.channelHypotheses = [];
  effectSplice.effectConsequenceReviewProjection = reseal(
    effectSplice.effectConsequenceReviewProjection,
    EFFECT_CONSEQUENCE_REVIEW_SCHEMA, "projectionHash");
  effectSplice.effectConsequenceReviewProjectionHash
    = effectSplice.effectConsequenceReviewProjection.projectionHash;
  const rehashedEffectSource = reseal(effectSplice,
    AFFECTED_PARTY_REGISTER_SCHEMAS.source, "sourceHash");
  assert.equal(verifyAffectedPartyRegister(built.register, {
    source: rehashedEffectSource,
    expectedSourceHash: rehashedEffectSource.sourceHash,
    expectedAffectedPartyRootHash: built.register.affectedPartyRootHash,
  }).ok, false);

  const stateSplice = structuredClone(built.source);
  stateSplice.beforeStateHash = h("spliced-before-state");
  const rehashedStateSource = reseal(stateSplice,
    AFFECTED_PARTY_REGISTER_SCHEMAS.source, "sourceHash");
  assert.equal(verifyAffectedPartyRegister(built.register, {
    source: rehashedStateSource,
    expectedSourceHash: rehashedStateSource.sourceHash,
    expectedAffectedPartyRootHash: built.register.affectedPartyRootHash,
  }).ok, false);

  const reviewSplice = structuredClone(built.source);
  reviewSplice.reviewRefs.providerReviews[0].entityId = "SPLICED_PROVIDER";
  const rehashedReviewSource = reseal(reviewSplice,
    AFFECTED_PARTY_REGISTER_SCHEMAS.source, "sourceHash");
  assert.equal(verifyAffectedPartyRegister(built.register, {
    source: rehashedReviewSource,
    expectedSourceHash: rehashedReviewSource.sourceHash,
    expectedAffectedPartyRootHash: built.register.affectedPartyRootHash,
  }).ok, false);
});

test("self-consistent register rehash and extra fields cannot promote review coverage", () => {
  const built = fixture();
  for (const mutate of [
    (value) => { value.actionReady = true; },
    (value) => { value.effectClosureEstablished = true; },
    (value) => { value.standingEstablished = true; },
    (value) => { value.independent = true; },
  ]) {
    const changed = structuredClone(built.register);
    mutate(changed);
    const rehashed = reseal(changed, AFFECTED_PARTY_REGISTER_SCHEMAS.register,
      "affectedPartyRootHash");
    const checked = verifyAffectedPartyRegister(rehashed, {
      source: built.source,
      expectedSourceHash: built.source.sourceHash,
      expectedAffectedPartyRootHash: rehashed.affectedPartyRootHash,
    });
    assert.equal(checked.ok, false);
    assert.equal(checked.effectClosureEstablished, false);
    assert.equal(checked.standingEstablished, false);
    assert.equal(checked.actionReady, false);
    assert.equal(checked.decisionState, "HOLD");
  }
});

test("post-import intrinsic poisoning cannot erase rows or grant semantic closure", () => {
  const effect = effectFixture();
  const input = sourceInput(effect, [coverageSubject("poison-resistant",
    "POTENTIAL_BYSTANDER_CLASS", [effect.projection.channelHypotheses[0]])]);
  const originals = {
    map: Array.prototype.map,
    sort: Array.prototype.sort,
    values: Object.values,
    hasOwn: Object.hasOwn,
    clone: globalThis.structuredClone,
    String: globalThis.String,
  };
  let built;
  try {
    Array.prototype.map = () => { throw new Error("poisoned map"); };
    Array.prototype.sort = () => { throw new Error("poisoned sort"); };
    Object.hasOwn = () => { throw new Error("poisoned hasOwn"); };
    globalThis.structuredClone = () => ({ actionReady: true });
    globalThis.String = () => "poisoned";
    const source = createAffectedPartyRegisterSource(input);
    built = { source, register: buildAffectedPartyRegister(source) };
  } finally {
    Array.prototype.map = originals.map;
    Array.prototype.sort = originals.sort;
    Object.values = originals.values;
    Object.hasOwn = originals.hasOwn;
    globalThis.structuredClone = originals.clone;
    globalThis.String = originals.String;
  }
  assert.equal(verify(built).ok, true);
  assert.equal(built.register.effectChannelRows.length,
    effect.projection.channelHypotheses.length);
  assert.equal(built.register.effectClosureEstablished, false);
  assert.equal(built.register.actionReady, false);

  let valuesPoisonedSource;
  try {
    Object.values = () => { throw new Error("poisoned values"); };
    valuesPoisonedSource = createAffectedPartyRegisterSource(input);
  } finally {
    Object.values = originals.values;
  }
  assert.equal(buildAffectedPartyRegister(valuesPoisonedSource)
    .effectClosureEstablished, false);
});
