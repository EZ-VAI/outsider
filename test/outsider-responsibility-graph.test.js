import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { normalizeDelegationRadius } from "../src/outsider-delegation-radius.js";
import { buildEffectConsequenceReviewProjection } from
  "../src/outsider-effect-consequence-review.js";
import { buildMatraixPersonaMetadataProjection } from
  "../src/outsider-matraix-persona-metadata.js";
import { listProviderPatternEntities } from
  "../src/outsider-provider-pattern-registry.js";
import { listRealitySourceCandidates } from
  "../src/outsider-reality-source-scout.js";
import {
  buildAffectedPartyRegister,
  createAffectedPartyRegisterSource,
} from "../src/outsider-affected-party-register.js";
import {
  RESPONSIBILITY_GRAPH_SCHEMAS,
  buildResponsibilityGraph,
  createResponsibilityGraphSource,
  verifyResponsibilityGraph,
} from "../src/outsider-responsibility-graph.js";

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

function radius() {
  return normalizeDelegationRadius({
    validity: {
      validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-08-28T00:00:00.000Z",
    },
    grants: [{
      atom: "OBSERVE",
      scopeHashes: [h("observe-scope")],
      budget: { unitHash: h("observe-unit"), limit: "1" },
    }],
  });
}

function effectFixture(effectBindings = bindings()) {
  const effectRadius = radius();
  const projection = buildEffectConsequenceReviewProjection({
    bindings: effectBindings,
    capabilityRadius: effectRadius,
    effectRadius,
    selectedProviderEntityIds: listProviderPatternEntities(),
    selectedOfficialSourceCandidateIds: listRealitySourceCandidates(),
  });
  return { projection, context: { capabilityRadius: effectRadius, effectRadius } };
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

function coverageSubject(label, partyClass, channelIds) {
  const kind = partyClass === "DIRECT_AFFECTED_PARTY"
    || partyClass === "INDIRECT_AFFECTED_PARTY" ? "PARTY" : "UNRESOLVED_CLASS";
  return {
    coverageSubjectRefHash: h(`${label}-coverage-subject`),
    partyClass,
    standingBasisReviewRefHash: kind === "PARTY"
      ? h(`${label}-standing-review`) : null,
    channelIds,
  };
}

function registerFixture(subjectFactory) {
  const effect = effectFixture();
  const subjects = subjectFactory === undefined ? [
    coverageSubject("owner", "DIRECT_AFFECTED_PARTY",
      [effect.projection.channelHypotheses[0]]),
    coverageSubject("bystander", "POTENTIAL_BYSTANDER_CLASS",
      [effect.projection.channelHypotheses[0]]),
  ] : subjectFactory(effect);
  const source = createAffectedPartyRegisterSource({
    subjectBindings: flatSubject(effect.projection.bindings),
    beforeStateHash: effect.projection.bindings.action.beforeStateHash,
    effectConsequenceReviewProjection: effect.projection,
    effectReviewContext: effect.context,
    matraixReviewRefs: [{ sourceId: "MATRAIX_PERSONA_1M",
      projectionHash: MATRAIX_PROJECTION_HASH }],
    coverageSubjects: subjects,
  });
  const register = buildAffectedPartyRegister(source);
  return { effect, registerSource: source, register };
}

function dutyFor(kind, subjectRefHash, channelHash, horizonHash, suffix = "") {
  const key = `${kind}:${subjectRefHash}:${channelHash}:${horizonHash}:${suffix}`;
  return {
    dutyRefHash: h(`duty:${key}`),
    dutyKind: "PRESERVE_EVIDENCE",
    responsiblePartyRefHash: h(`responsible:${key}`),
    coverageSubjectKind: kind,
    coverageSubjectRefHash: subjectRefHash,
    channelHash,
    horizonHash,
    dutySourceRefHash: h(`duty-source:${key}`),
    policyRefHash: h(`policy:${key}`),
    budgetRefHash: h(`budget:${key}`),
    recoveryRefHash: h(`recovery:${key}`),
    challengeRefHash: h(`challenge:${key}`),
  };
}

function canonicalDuties(register) {
  const duties = [];
  for (let channelIndex = 0; channelIndex < register.coverageRows.length;
    channelIndex += 1) {
    const channel = register.coverageRows[channelIndex];
    for (let partyIndex = 0; partyIndex < channel.partyCandidateRefHashes.length;
      partyIndex += 1) {
      for (let horizonIndex = 0;
        horizonIndex < register.mandatoryHorizonRows.length; horizonIndex += 1) {
        duties.push(dutyFor("PARTY", channel.partyCandidateRefHashes[partyIndex],
          channel.channelHash,
          register.mandatoryHorizonRows[horizonIndex].horizonHash));
      }
    }
    for (let classIndex = 0; classIndex < channel.unresolvedClassRefHashes.length;
      classIndex += 1) {
      for (let horizonIndex = 0;
        horizonIndex < register.mandatoryHorizonRows.length; horizonIndex += 1) {
        duties.push(dutyFor("UNRESOLVED_CLASS",
          channel.unresolvedClassRefHashes[classIndex], channel.channelHash,
          register.mandatoryHorizonRows[horizonIndex].horizonHash));
      }
    }
  }
  return duties;
}

function graphSourceInput(registerBuilt, duties) {
  return {
    affectedPartyRegisterSourceHash: registerBuilt.registerSource.sourceHash,
    affectedPartyRootHash: registerBuilt.register.affectedPartyRootHash,
    effectConsequenceReviewProjectionHash:
      registerBuilt.register.effectConsequenceReviewProjectionHash,
    beforeStateHash: registerBuilt.register.beforeStateHash,
    subjectBindings: registerBuilt.register.subjectBindings,
    reviewRefs: registerBuilt.register.reviewRefs,
    duties,
  };
}

function fixture({ subjectFactory, dutyFactory } = {}) {
  const registerBuilt = registerFixture(subjectFactory);
  const duties = dutyFactory === undefined
    ? canonicalDuties(registerBuilt.register) : dutyFactory(registerBuilt);
  const source = createResponsibilityGraphSource(graphSourceInput(registerBuilt,
    duties));
  const graph = buildResponsibilityGraph({
    source,
    affectedPartyRegister: registerBuilt.register,
    affectedPartyRegisterSource: registerBuilt.registerSource,
  });
  return { ...registerBuilt, source, graph, duties };
}

function verify(built, expectedGraphHash = built.graph.responsibilityGraphHash) {
  return verifyResponsibilityGraph(built.graph, {
    source: built.source,
    affectedPartyRegister: built.register,
    affectedPartyRegisterSource: built.registerSource,
    expectedSourceHash: built.source.sourceHash,
    expectedResponsibilityGraphHash: expectedGraphHash,
  });
}

function reseal(record, schema, field) {
  const changed = structuredClone(record);
  delete changed[field];
  changed[field] = `sha256:${createHash("sha256")
    .update(`${schema}\0${canonicalizeStrict(changed)}`, "utf8").digest("hex")}`;
  return changed;
}

test("graph binds effect review, before state, register root and every canonical row", () => {
  const built = fixture();
  const checked = verify(built);
  assert.equal(checked.ok, true);
  assert.equal(checked.graphSourceReplayComplete, true);
  assert.equal(checked.affectedPartyRegisterSourceReplayComplete, true);
  assert.equal(checked.effectReviewSourceRebuildComplete, true);
  assert.equal(built.graph.effectConsequenceReviewProjectionHash,
    built.register.effectConsequenceReviewProjectionHash);
  assert.equal(built.graph.beforeStateHash, built.register.beforeStateHash);
  assert.equal(built.graph.affectedPartyRootHash,
    built.register.affectedPartyRootHash);
  assert.equal(built.graph.accounting.canonicalResponsibilityRows,
    built.duties.length);
  assert.equal(built.graph.accounting.coveredCanonicalRows, built.duties.length);
  assert.equal(built.graph.accounting.missingCanonicalRows, 0);
  assert.equal(built.graph.gapReasons.includes(
    "CANONICAL_RESPONSIBILITY_ROW_DUTY_COVERAGE_MISSING"), false);
});

test("duty source, policy, budget, recovery and challenge hashes survive replay exactly", () => {
  const built = fixture();
  assert.deepEqual(built.graph.duties, built.source.duties);
  for (const field of ["dutySourceRefHash", "policyRefHash", "budgetRefHash",
    "recoveryRefHash", "challengeRefHash"]) {
    assert.match(built.graph.duties[0][field], /^sha256:[a-f0-9]{64}$/u, field);
  }
  assert.equal(built.graph.externalDutyAcceptanceEstablished, false);
  assert.equal(built.graph.responsibilityCompletenessEstablished, false);
  assert.equal(built.graph.effectClosureEstablished, false);
  assert.equal(built.graph.standingEstablished, false);
  assert.equal(built.graph.externalAuthorityEstablished, false);
  assert.equal(built.graph.semanticClosureEligible, false);
  assert.equal(built.graph.actionReady, false);
  assert.equal(built.graph.causalExperienceUnits, 0);
  assert.equal(built.graph.decisionState, "HOLD");
});

test("empty or partial duty sets expose missing canonical rows", () => {
  const empty = fixture({ dutyFactory: () => [] });
  assert.equal(verify(empty).ok, true);
  assert.ok(empty.graph.gapReasons.includes("EMPTY_RESPONSIBILITY_REVIEW_GRAPH"));
  assert.ok(empty.graph.gapReasons.includes(
    "CANONICAL_RESPONSIBILITY_ROW_DUTY_COVERAGE_MISSING"));
  assert.equal(empty.graph.accounting.coveredCanonicalRows, 0);

  const partial = fixture({ dutyFactory: ({ register }) => {
    const duties = canonicalDuties(register);
    duties.pop();
    return duties;
  } });
  assert.equal(verify(partial).ok, true);
  assert.equal(partial.graph.accounting.missingCanonicalRows, 1);
  assert.equal(partial.graph.actionReady, false);
});

test("UNKNOWN affected class stays in UNRESOLVED_CLASS graph rows", () => {
  const built = fixture({
    subjectFactory: (effect) => [coverageSubject("unknown",
      "UNKNOWN_AFFECTED_CLASS", [effect.projection.channelHypotheses[0]])],
  });
  assert.equal(verify(built).ok, true);
  assert.ok(built.graph.canonicalResponsibilityRows.every(
    ({ coverageSubjectKind }) => coverageSubjectKind === "UNRESOLVED_CLASS"));
  assert.ok(built.graph.gapReasons.includes(
    "UNKNOWN_AFFECTED_CLASS_REMAINS_UNRESOLVED"));
  assert.equal(built.graph.standingEstablished, false);
});

test("orphan subject, wrong kind, channel, horizon and unresolved duty remain gaps", () => {
  const built = fixture({ dutyFactory: ({ register }) => {
    const duties = canonicalDuties(register);
    const row = register.coverageRows.find(({ partyCandidateRefHashes }) =>
      partyCandidateRefHashes.length > 0);
    const horizon = register.mandatoryHorizonRows[0].horizonHash;
    duties.push(dutyFor("PARTY", h("orphan-subject"), row.channelHash,
      horizon, "orphan"));
    duties.push(dutyFor("UNRESOLVED_CLASS", row.partyCandidateRefHashes[0],
      row.channelHash, horizon, "wrong-kind"));
    duties.push(dutyFor("PARTY", row.partyCandidateRefHashes[0],
      h("outside-channel"), horizon, "wrong-channel"));
    const badHorizon = dutyFor("PARTY", row.partyCandidateRefHashes[0],
      row.channelHash, h("outside-horizon"), "wrong-horizon");
    badHorizon.dutyKind = "UNRESOLVED_DUTY";
    duties.push(badHorizon);
    return duties;
  } });
  assert.equal(verify(built).ok, true);
  for (const gap of ["DUTY_EDGE_OUTSIDE_CANONICAL_REVIEW_ROW",
    "UNKNOWN_COVERAGE_SUBJECT_DUTY_EDGE", "COVERAGE_SUBJECT_KIND_MISMATCH",
    "DUTY_CHANNEL_OUTSIDE_EFFECT_REVIEW",
    "DUTY_HORIZON_OUTSIDE_MANDATORY_REVIEW", "UNRESOLVED_DUTY_PRESENT"]) {
    assert.ok(built.graph.gapReasons.includes(gap), gap);
  }
  assert.equal(built.graph.externalDutyAcceptanceEstablished, false);
});

test("effect, before-state, subject, review and register-root splices cannot compose", () => {
  const built = fixture();
  const base = graphSourceInput(built, built.duties);
  const variants = [
    { ...base, effectConsequenceReviewProjectionHash: h("other-effect") },
    { ...base, beforeStateHash: h("other-before") },
    { ...base, subjectBindings: { ...base.subjectBindings,
      claimHash: h("other-claim") } },
    { ...base, reviewRefs: { ...base.reviewRefs,
      matraixReviews: [{ sourceId: "MATRAIX_PERSONA_1M",
        projectionHash: h("other-matraix") }] } },
    { ...base, affectedPartyRootHash: h("other-register-root") },
  ];
  for (const input of variants) {
    const source = createResponsibilityGraphSource(input);
    assert.throws(() => buildResponsibilityGraph({
      source,
      affectedPartyRegister: built.register,
      affectedPartyRegisterSource: built.registerSource,
    }), /BINDING_MISMATCH|SOURCE_REPLAY_FAILED/u);
  }
});

test("caller booleans, raw identity, callback, accessor, sparse and symbol inputs fail", () => {
  const built = fixture();
  const base = graphSourceInput(built, built.duties);
  assert.throws(() => createResponsibilityGraphSource({ ...base, verified: true }),
    /FIELDS_INVALID/u);
  assert.throws(() => createResponsibilityGraphSource({ ...base,
    duties: [{ ...built.duties[0], responsiblePartyName: "raw name" }] }),
  /FIELDS_INVALID/u);

  let invoked = false;
  const accessor = structuredClone(built.duties[0]);
  Object.defineProperty(accessor, "dutyKind", {
    enumerable: true,
    get() { invoked = true; return "HALT"; },
  });
  assert.throws(() => createResponsibilityGraphSource({ ...base,
    duties: [accessor] }), /enumerable data properties/u);
  assert.equal(invoked, false);
  assert.throws(() => createResponsibilityGraphSource({ ...base,
    duties: new Array(1) }), /dense and undecorated/u);
  assert.throws(() => createResponsibilityGraphSource({ ...base,
    callback() { invoked = true; } }), /unsupported canonical value type:function/u);
  assert.equal(invoked, false);

  const symbolized = structuredClone(base);
  symbolized[Symbol("authority")] = true;
  assert.throws(() => createResponsibilityGraphSource(symbolized),
    /symbol properties/u);
});

test("self-consistent graph rehash and extra fields cannot promote source replay", () => {
  const built = fixture();
  for (const mutate of [
    (value) => { value.actionReady = true; },
    (value) => { value.externalDutyAcceptanceEstablished = true; },
    (value) => { value.responsibilityCompletenessEstablished = true; },
    (value) => { value.independent = true; },
  ]) {
    const changed = structuredClone(built.graph);
    mutate(changed);
    const rehashed = reseal(changed, RESPONSIBILITY_GRAPH_SCHEMAS.graph,
      "responsibilityGraphHash");
    const checked = verifyResponsibilityGraph(rehashed, {
      source: built.source,
      affectedPartyRegister: built.register,
      affectedPartyRegisterSource: built.registerSource,
      expectedSourceHash: built.source.sourceHash,
      expectedResponsibilityGraphHash: rehashed.responsibilityGraphHash,
    });
    assert.equal(checked.ok, false);
    assert.equal(checked.externalDutyAcceptanceEstablished, false);
    assert.equal(checked.responsibilityCompletenessEstablished, false);
    assert.equal(checked.actionReady, false);
    assert.equal(checked.decisionState, "HOLD");
  }
});

test("canonical descriptor validation rejects non-finite and decorated graph records", () => {
  const built = fixture();
  const nonFinite = structuredClone(built.graph);
  nonFinite.accounting.dutyEdges = Number.POSITIVE_INFINITY;
  const failed = verifyResponsibilityGraph(nonFinite, {
    source: built.source,
    affectedPartyRegister: built.register,
    affectedPartyRegisterSource: built.registerSource,
    expectedSourceHash: built.source.sourceHash,
    expectedResponsibilityGraphHash: built.graph.responsibilityGraphHash,
  });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /finite numbers/u);

  const decorated = structuredClone(built.graph);
  Object.defineProperty(decorated.duties, "hidden", { value: true });
  const checked = verifyResponsibilityGraph(decorated, {
    source: built.source,
    affectedPartyRegister: built.register,
    affectedPartyRegisterSource: built.registerSource,
    expectedSourceHash: built.source.sourceHash,
    expectedResponsibilityGraphHash: built.graph.responsibilityGraphHash,
  });
  assert.equal(checked.ok, false);
  assert.match(checked.error, /dense and undecorated/u);
});

test("post-import intrinsic poisoning cannot erase canonical rows or accept duties", () => {
  const registerBuilt = registerFixture();
  const duties = canonicalDuties(registerBuilt.register);
  const input = graphSourceInput(registerBuilt, duties);
  const originals = {
    map: Array.prototype.map,
    sort: Array.prototype.sort,
    values: Object.values,
    hasOwn: Object.hasOwn,
    mapGet: Map.prototype.get,
    mapSet: Map.prototype.set,
    mapHas: Map.prototype.has,
    setAdd: Set.prototype.add,
    setHas: Set.prototype.has,
    Map: globalThis.Map,
    Set: globalThis.Set,
    clone: globalThis.structuredClone,
    String: globalThis.String,
    numberIsSafeInteger: Number.isSafeInteger,
  };
  let built;
  try {
    Array.prototype.map = () => { throw new Error("poisoned map"); };
    Array.prototype.sort = () => { throw new Error("poisoned sort"); };
    Object.hasOwn = () => { throw new Error("poisoned hasOwn"); };
    Map.prototype.get = () => { throw new Error("poisoned map get"); };
    Map.prototype.set = () => { throw new Error("poisoned map set"); };
    Map.prototype.has = () => { throw new Error("poisoned map has"); };
    globalThis.Map = class PoisonedMap {};
    globalThis.structuredClone = () => ({ actionReady: true });
    globalThis.String = () => "poisoned";
    Number.isSafeInteger = () => { throw new Error("poisoned safe integer"); };
    const source = createResponsibilityGraphSource(input);
    const graph = buildResponsibilityGraph({
      source,
      affectedPartyRegister: registerBuilt.register,
      affectedPartyRegisterSource: registerBuilt.registerSource,
    });
    built = { ...registerBuilt, source, graph };
  } finally {
    Array.prototype.map = originals.map;
    Array.prototype.sort = originals.sort;
    Object.values = originals.values;
    Object.hasOwn = originals.hasOwn;
    Map.prototype.get = originals.mapGet;
    Map.prototype.set = originals.mapSet;
    Map.prototype.has = originals.mapHas;
    Set.prototype.add = originals.setAdd;
    Set.prototype.has = originals.setHas;
    globalThis.Map = originals.Map;
    globalThis.Set = originals.Set;
    globalThis.structuredClone = originals.clone;
    globalThis.String = originals.String;
    Number.isSafeInteger = originals.numberIsSafeInteger;
  }
  assert.equal(verify(built).ok, true);
  assert.equal(built.graph.accounting.missingCanonicalRows, 0);
  assert.equal(built.graph.externalDutyAcceptanceEstablished, false);
  assert.equal(built.graph.actionReady, false);

  let setPoisonedGraph;
  try {
    Set.prototype.has = () => { throw new Error("poisoned set has"); };
    setPoisonedGraph = buildResponsibilityGraph({
      source: built.source,
      affectedPartyRegister: built.register,
      affectedPartyRegisterSource: built.registerSource,
    });
  } finally {
    Set.prototype.has = originals.setHas;
  }
  assert.equal(setPoisonedGraph.externalDutyAcceptanceEstablished, false);
  assert.equal(setPoisonedGraph.actionReady, false);
});
