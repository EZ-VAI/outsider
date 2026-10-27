import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { normalizeDelegationRadius } from
  "../src/outsider-delegation-radius.js";
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
  buildResponsibilityGraph,
  createResponsibilityGraphSource,
} from "../src/outsider-responsibility-graph.js";
import {
  RealityObligationFixtureStoreForTests,
  RealityObligationStore,
} from "../src/outsider-reality-obligation-store.js";
import {
  REALITY_SEMANTIC_BUNDLE_NO_AUTHORITY,
  REALITY_SEMANTIC_BUNDLE_SCHEMAS,
  buildRealitySemanticBundle,
  createRealitySemanticObligation,
  createRealitySemanticPlan,
  verifyRealitySemanticBundle,
} from "../src/outsider-reality-semantic-bundle.js";

const MATRAIX_SOURCE_URL = new URL(
  "../references/matraix-persona-maintainer-reviewed-source-manifest.json",
  import.meta.url,
);
const MATRAIX_PROJECTION_HASH = buildMatraixPersonaMetadataProjection(
  readFileSync(MATRAIX_SOURCE_URL)).artifactHash;
const CREATED_AT = "2026-08-27T00:00:00.000Z";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function temporaryDirectory(t, label) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-semantic-bundle-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return path.join(root, label);
}

function effectBindings(seed = "base") {
  return {
    claimWayWorld: {
      claimHash: h(`${seed}:claim`),
      wayHash: h(`${seed}:way`),
      worldHash: h(`${seed}:world`),
    },
    run: {
      episodeHash: h(`${seed}:episode`),
      attemptHash: h(`${seed}:attempt`),
      censusHash: h(`${seed}:census`),
    },
    action: {
      proposedActionHash: h(`${seed}:proposed-action`),
      beforeStateHash: h(`${seed}:before-state`),
      adapterDescriptorHash: h(`${seed}:adapter`),
      resourceTopologyHash: h(`${seed}:topology`),
      projectorPolicyHash: h(`${seed}:projector-policy`),
    },
  };
}

function radius(seed = "base") {
  return normalizeDelegationRadius({
    validity: {
      validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-08-28T00:00:00.000Z",
    },
    grants: [{
      atom: "OBSERVE",
      scopeHashes: [h(`${seed}:scope`)],
      budget: { unitHash: h(`${seed}:unit`), limit: "1" },
    }],
  });
}

function flatSubject(bindings) {
  return {
    claimHash: bindings.claimWayWorld.claimHash,
    wayHash: bindings.claimWayWorld.wayHash,
    worldHash: bindings.claimWayWorld.worldHash,
    episodeHash: bindings.run.episodeHash,
    attemptHash: bindings.run.attemptHash,
    censusHash: bindings.run.censusHash,
  };
}

function coverageSubject(seed, partyClass, channelIds) {
  const party = partyClass === "DIRECT_AFFECTED_PARTY"
    || partyClass === "INDIRECT_AFFECTED_PARTY";
  return {
    coverageSubjectRefHash: h(`${seed}:coverage-subject`),
    partyClass,
    standingBasisReviewRefHash: party ? h(`${seed}:standing-review`) : null,
    channelIds,
  };
}

function dutyFor(kind, subjectRefHash, channelHash, horizonHash) {
  const key = `${kind}:${subjectRefHash}:${channelHash}:${horizonHash}`;
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
  for (const channel of register.coverageRows) {
    for (const subject of channel.partyCandidateRefHashes) {
      for (const horizon of register.mandatoryHorizonRows) {
        duties.push(dutyFor("PARTY", subject, channel.channelHash,
          horizon.horizonHash));
      }
    }
    for (const subject of channel.unresolvedClassRefHashes) {
      for (const horizon of register.mandatoryHorizonRows) {
        duties.push(dutyFor("UNRESOLVED_CLASS", subject, channel.channelHash,
          horizon.horizonHash));
      }
    }
  }
  return duties;
}

function semanticSource(seed = "base") {
  const bindings = effectBindings(seed);
  const capabilityRadius = radius(seed);
  const effectRadius = radius(seed);
  const effectConsequenceReviewProjection =
    buildEffectConsequenceReviewProjection({
      bindings,
      capabilityRadius,
      effectRadius,
      selectedProviderEntityIds: listProviderPatternEntities(),
      selectedOfficialSourceCandidateIds: listRealitySourceCandidates(),
    });
  const effectReviewContext = { capabilityRadius, effectRadius };
  const allChannels = effectConsequenceReviewProjection.channelHypotheses;
  const affectedPartyRegisterSource = createAffectedPartyRegisterSource({
    subjectBindings: flatSubject(bindings),
    beforeStateHash: bindings.action.beforeStateHash,
    effectConsequenceReviewProjection,
    effectReviewContext,
    matraixReviewRefs: [{
      sourceId: "MATRAIX_PERSONA_1M",
      projectionHash: MATRAIX_PROJECTION_HASH,
    }],
    coverageSubjects: [
      coverageSubject(`${seed}:owner`, "DIRECT_AFFECTED_PARTY", allChannels),
      coverageSubject(`${seed}:unknown`, "UNKNOWN_AFFECTED_CLASS", allChannels),
    ],
  });
  const affectedPartyRegister = buildAffectedPartyRegister(
    affectedPartyRegisterSource);
  const duties = canonicalDuties(affectedPartyRegister);
  const responsibilityGraphSource = createResponsibilityGraphSource({
    affectedPartyRegisterSourceHash: affectedPartyRegisterSource.sourceHash,
    affectedPartyRootHash: affectedPartyRegister.affectedPartyRootHash,
    effectConsequenceReviewProjectionHash:
      affectedPartyRegister.effectConsequenceReviewProjectionHash,
    beforeStateHash: affectedPartyRegister.beforeStateHash,
    subjectBindings: affectedPartyRegister.subjectBindings,
    reviewRefs: affectedPartyRegister.reviewRefs,
    duties,
  });
  const responsibilityGraph = buildResponsibilityGraph({
    source: responsibilityGraphSource,
    affectedPartyRegister,
    affectedPartyRegisterSource,
  });
  const horizonCrosswalk = affectedPartyRegister.mandatoryHorizonRows
    .map((review, index) => ({
      reviewHorizonId: review.horizonId,
      reviewHorizonHash: review.horizonHash,
      obligation: {
        horizonId: `horizon-${String(index).padStart(2, "0")}`,
        dueAfterMs: index === 0 ? 0 : index * 60_000,
        observationRequirementHash: h(`${seed}:observation:${review.horizonId}`),
        mandatory: true,
      },
    }));
  return {
    effectConsequenceReviewProjection,
    effectReviewContext,
    affectedPartyRegisterSource,
    affectedPartyRegister,
    responsibilityGraphSource,
    responsibilityGraph,
    obligation: {
      obligationId: `semantic-obligation-${seed}`,
      budgetCommitmentHash: h(`${seed}:budget-commitment`),
      recoveryPolicyHash: h(`${seed}:recovery-policy`),
      challengePolicyHash: h(`${seed}:challenge-policy`),
      createdAt: CREATED_AT,
      horizonCrosswalk,
    },
  };
}

function builtFixture(t, seed = "base") {
  const source = semanticSource(seed);
  const plan = createRealitySemanticPlan(source);
  const directory = temporaryDirectory(t, seed);
  const snapshot = createRealitySemanticObligation({
    semanticPlan: plan,
    semanticPlanSource: source,
    directory,
  });
  const bundle = buildRealitySemanticBundle({
    semanticPlan: plan,
    semanticPlanSource: source,
    obligationDirectory: directory,
  });
  return { source, plan, directory, snapshot, bundle };
}

function verifyInput(built, overrides = {}) {
  return {
    semanticPlan: built.plan,
    semanticPlanSource: built.source,
    obligationDirectory: built.directory,
    expectedSemanticPlanHash: built.plan.semanticPlanHash,
    expectedObligationGenesisHash: built.snapshot.genesis.genesisHash,
    expectedObligationStateHash: built.snapshot.stateHash,
    expectedBundleHash: built.bundle.bundleHash,
    ...overrides,
  };
}

function verify(built, overrides) {
  return verifyRealitySemanticBundle(built.bundle,
    verifyInput(built, overrides));
}

function reseal(record, schema, hashField) {
  const changed = structuredClone(record);
  delete changed[hashField];
  changed[hashField] = `sha256:${createHash("sha256")
    .update(`${schema}\0${canonicalizeStrict(changed)}`, "utf8").digest("hex")}`;
  return changed;
}

function manualObligation(directory, plan, mutate = () => {}) {
  const template = structuredClone(plan.obligationGenesisTemplate);
  mutate(template);
  return RealityObligationStore.create({ directory, ...template }).snapshot();
}

function assertHeld(value) {
  for (const field of ["providerApplicabilityEstablished",
    "effectClosureEstablished", "affectedPartyCompletenessEstablished",
    "responsibilityCompletenessEstablished", "externalDutyAcceptanceEstablished",
    "standingEstablished", "externalAuthorityEstablished", "closureEstablished",
    "semanticClosureEligible", "admitted", "actionReady", "executable",
    "liveActionConnected"]) assert.equal(value[field], false, field);
  assert.equal(value.decisionState, "HOLD");
  assert.equal(value.causalExperienceUnits, 0);
  assert.deepEqual(value.authority, REALITY_SEMANTIC_BUNDLE_NO_AUTHORITY);
  assert.ok(Object.values(value.authority).every((entry) => entry === false));
}

test("source-replayed chain binds effect, register, graph, plan and production rev0", (t) => {
  const built = builtFixture(t);
  const checked = verify(built);
  assert.equal(checked.ok, true);
  assert.equal(checked.semanticSourceReplayComplete, true);
  assert.equal(checked.productionObligationSourceReplayComplete, true);
  assert.equal(checked.exactSemanticBindingVerified, true);
  assert.equal(built.bundle.obligation.revision, 0);
  assert.equal(built.bundle.obligation.status, "PRECOMMITTED");
  assert.deepEqual(built.bundle.subjectBindings,
    built.source.affectedPartyRegister.subjectBindings);
  assert.equal(built.bundle.beforeStateHash,
    built.source.effectConsequenceReviewProjection.bindings.action.beforeStateHash);
  assert.equal(built.bundle.affectedPartyRootHash,
    built.source.affectedPartyRegister.affectedPartyRootHash);
  assert.equal(built.bundle.responsibilityGraphHash,
    built.source.responsibilityGraph.responsibilityGraphHash);
  assert.equal(Object.isFrozen(built.bundle), true);
  assert.equal(Object.isFrozen(built.bundle.horizonCrosswalk), true);
  assertHeld(built.plan);
  assertHeld(built.bundle);
  assertHeld(checked);
});

test("channel mapping is exact and each review horizon retains the real commitment", (t) => {
  const built = builtFixture(t, "crosswalk");
  assert.deepEqual(built.bundle.channelCrosswalk,
    built.plan.channelCrosswalk);
  assert.deepEqual(
    built.bundle.channelCrosswalk.map((row) => row.obligationConsequenceChannelHash)
      .sort(),
    built.snapshot.genesis.consequenceChannelHashes,
  );
  assert.equal(built.bundle.horizonCrosswalk.length,
    built.source.affectedPartyRegister.mandatoryHorizonRows.length);
  for (const row of built.bundle.horizonCrosswalk) {
    const planned = built.plan.horizonCrosswalk.find(
      (candidate) => candidate.reviewHorizonHash === row.reviewHorizonHash);
    const actual = built.snapshot.genesis.mandatoryHorizons.find(
      (candidate) => candidate.horizonId === row.obligation.horizonId);
    assert.equal(row.reviewHorizonId, planned.reviewHorizonId);
    assert.equal(row.reviewHorizonHash, planned.reviewHorizonHash);
    assert.deepEqual(row.obligation, actual);
    assert.equal(row.obligation.horizonCommitmentHash,
      planned.plannedHorizonCommitmentHash);
  }
  assertHeld(built.bundle);
});

test("self-consistent plan and bundle rehashes do not bypass source replay", (t) => {
  const built = builtFixture(t, "rehash");
  const alteredPlan = structuredClone(built.plan);
  alteredPlan.channelCrosswalk[0].channelId = "forged-channel-id";
  const rehashedPlan = reseal(alteredPlan,
    REALITY_SEMANTIC_BUNDLE_SCHEMAS.plan, "semanticPlanHash");
  assert.throws(() => buildRealitySemanticBundle({
    semanticPlan: rehashedPlan,
    semanticPlanSource: built.source,
    obligationDirectory: built.directory,
  }), /SEMANTIC_PLAN_SOURCE_REPLAY_MISMATCH/u);

  const alteredBundle = structuredClone(built.bundle);
  alteredBundle.channelCrosswalk[0].channelId = "forged-channel-id";
  const rehashedBundle = reseal(alteredBundle,
    REALITY_SEMANTIC_BUNDLE_SCHEMAS.bundle, "bundleHash");
  const checked = verifyRealitySemanticBundle(rehashedBundle, {
    ...verifyInput(built), expectedBundleHash: rehashedBundle.bundleHash,
  });
  assert.equal(checked.ok, false);
  assert.match(checked.error,
    /EXPECTED_BUNDLE_HASH_MISMATCH|BUNDLE_SOURCE_REPLAY_MISMATCH/u);
  assertHeld(checked);
});

test("cross-subject obligation splice fails exact Claim/Way/World/run binding", (t) => {
  const built = builtFixture(t, "subject-source");
  const directory = temporaryDirectory(t, "subject-splice");
  const snapshot = manualObligation(directory, built.plan, (template) => {
    template.bindings.claimHash = h("different-claim");
  });
  assert.equal(snapshot.revision, 0);
  assert.throws(() => buildRealitySemanticBundle({
    semanticPlan: built.plan,
    semanticPlanSource: built.source,
    obligationDirectory: directory,
  }), /OBLIGATION_SUBJECT_BINDING_MISMATCH/u);
});

test("missing or replaced consequence channels cannot bind", (t) => {
  const built = builtFixture(t, "channel-source");
  assert.ok(built.plan.obligationGenesisTemplate.consequenceChannelHashes.length > 1);
  const missingDirectory = temporaryDirectory(t, "channel-missing");
  manualObligation(missingDirectory, built.plan, (template) => {
    template.consequenceChannelHashes.pop();
  });
  assert.throws(() => buildRealitySemanticBundle({
    semanticPlan: built.plan,
    semanticPlanSource: built.source,
    obligationDirectory: missingDirectory,
  }), /OBLIGATION_CHANNEL_SET_NOT_EXACT/u);

  const changedDirectory = temporaryDirectory(t, "channel-changed");
  manualObligation(changedDirectory, built.plan, (template) => {
    template.consequenceChannelHashes[0] = h("replacement-channel");
  });
  assert.throws(() => buildRealitySemanticBundle({
    semanticPlan: built.plan,
    semanticPlanSource: built.source,
    obligationDirectory: changedDirectory,
  }), /OBLIGATION_CHANNEL_SET_NOT_EXACT/u);
});

test("horizon coverage, identity, tuple and dueAfterMs are exact", (t) => {
  const built = builtFixture(t, "horizon-source");
  const missingPlanSource = structuredClone(built.source);
  missingPlanSource.obligation.horizonCrosswalk.pop();
  assert.throws(() => createRealitySemanticPlan(missingPlanSource),
    /HORIZON_CROSSWALK_MUST_COVER_EXACT_REVIEW_SET/u);

  const changedIdDirectory = temporaryDirectory(t, "horizon-id-changed");
  manualObligation(changedIdDirectory, built.plan, (template) => {
    template.mandatoryHorizons[0].horizonId = "replacement-horizon";
  });
  assert.throws(() => buildRealitySemanticBundle({
    semanticPlan: built.plan,
    semanticPlanSource: built.source,
    obligationDirectory: changedIdDirectory,
  }), /OBLIGATION_HORIZON_MISSING_OR_DUPLICATE/u);

  const changedDueDirectory = temporaryDirectory(t, "horizon-due-changed");
  manualObligation(changedDueDirectory, built.plan, (template) => {
    const index = template.mandatoryHorizons.length - 1;
    template.mandatoryHorizons[index].dueAfterMs += 1;
  });
  assert.throws(() => buildRealitySemanticBundle({
    semanticPlan: built.plan,
    semanticPlanSource: built.source,
    obligationDirectory: changedDueDirectory,
  }), /OBLIGATION_HORIZON_TUPLE_OR_COMMITMENT_MISMATCH/u);

  const swappedSource = structuredClone(built.source);
  const left = swappedSource.obligation.horizonCrosswalk[0].obligation;
  swappedSource.obligation.horizonCrosswalk[0].obligation =
    swappedSource.obligation.horizonCrosswalk[1].obligation;
  swappedSource.obligation.horizonCrosswalk[1].obligation = left;
  assert.throws(() => buildRealitySemanticBundle({
    semanticPlan: built.plan,
    semanticPlanSource: swappedSource,
    obligationDirectory: built.directory,
  }), /SEMANTIC_PLAN_SOURCE_REPLAY_MISMATCH/u);
});

test("fixture obligations and revision greater than zero are rejected", (t) => {
  const built = builtFixture(t, "ledger-class");
  const fixtureDirectory = temporaryDirectory(t, "fixture-ledger");
  RealityObligationFixtureStoreForTests.create({
    directory: fixtureDirectory,
    ...structuredClone(built.plan.obligationGenesisTemplate),
  });
  assert.throws(() => buildRealitySemanticBundle({
    semanticPlan: built.plan,
    semanticPlanSource: built.source,
    obligationDirectory: fixtureDirectory,
  }), /PRODUCTION_PRECOMMITTED_REVISION_ZERO_OBLIGATION_REQUIRED/u);

  const store = RealityObligationStore.open(built.directory);
  const initial = store.snapshot();
  store.activate({
    commandId: "activate-semantic-obligation",
    expectedRevision: initial.revision,
    expectedStateHash: initial.stateHash,
    occurredAt: CREATED_AT,
  });
  assert.throws(() => buildRealitySemanticBundle({
    semanticPlan: built.plan,
    semanticPlanSource: built.source,
    obligationDirectory: built.directory,
  }), /PRODUCTION_PRECOMMITTED_REVISION_ZERO_OBLIGATION_REQUIRED/u);
});

test("caller authority, extra schemas and expected-hash substitution fail closed", (t) => {
  const built = builtFixture(t, "caller");
  const withAuthority = {
    semanticPlan: built.plan,
    semanticPlanSource: built.source,
    obligationDirectory: built.directory,
    authorityEstablished: true,
  };
  assert.throws(() => buildRealitySemanticBundle(withAuthority),
    /BUILD_BUNDLE_INPUT_FIELDS_INVALID/u);

  const verifyOptions = verifyInput(built);
  verifyOptions.authorityEstablished = true;
  const extra = verifyRealitySemanticBundle(built.bundle, verifyOptions);
  assert.equal(extra.ok, false);
  assert.match(extra.error, /VERIFY_OPTIONS_FIELDS_INVALID/u);
  assertHeld(extra);

  const expected = verify(built, { expectedBundleHash: h("caller-expected") });
  assert.equal(expected.ok, false);
  assert.match(expected.error, /EXPECTED_BUNDLE_HASH_MISMATCH/u);
  assertHeld(expected);

  const promoted = structuredClone(built.bundle);
  promoted.actionReady = true;
  const promotedRehash = reseal(promoted,
    REALITY_SEMANTIC_BUNDLE_SCHEMAS.bundle, "bundleHash");
  const promotion = verifyRealitySemanticBundle(promotedRehash, {
    ...verifyInput(built), expectedBundleHash: promotedRehash.bundleHash,
  });
  assert.equal(promotion.ok, false);
  assertHeld(promotion);
});

test("accessor, sparse and decorated inputs are rejected without invoking code", (t) => {
  const built = builtFixture(t, "descriptor");
  let invoked = false;
  const accessor = structuredClone(built.source);
  Object.defineProperty(accessor.obligation, "createdAt", {
    enumerable: true,
    get() { invoked = true; return CREATED_AT; },
  });
  assert.throws(() => createRealitySemanticPlan(accessor),
    /enumerable data properties/u);
  assert.equal(invoked, false);

  const sparse = structuredClone(built.source);
  sparse.obligation.horizonCrosswalk = new Array(2);
  assert.throws(() => createRealitySemanticPlan(sparse),
    /dense and undecorated/u);

  const decorated = structuredClone(built.bundle);
  Object.defineProperty(decorated.channelCrosswalk, "hidden", { value: true });
  const result = verifyRealitySemanticBundle(decorated, verifyInput(built));
  assert.equal(result.ok, false);
  assert.match(result.error, /dense and undecorated/u);
  assertHeld(result);
});

test("captured intrinsics survive post-import poisoning without widening semantics", (t) => {
  const built = builtFixture(t, "intrinsics");
  const originals = {
    values: Object.values,
    every: Array.prototype.every,
    String: globalThis.String,
    TypeError: globalThis.TypeError,
  };
  let rebuilt;
  try {
    Object.values = () => [true];
    Array.prototype.every = () => true;
    globalThis.String = () => "poisoned";
    globalThis.TypeError = class PoisonedTypeError extends Error {};
    rebuilt = buildRealitySemanticBundle({
      semanticPlan: built.plan,
      semanticPlanSource: built.source,
      obligationDirectory: built.directory,
    });
  } finally {
    Object.values = originals.values;
    Array.prototype.every = originals.every;
    globalThis.String = originals.String;
    globalThis.TypeError = originals.TypeError;
  }
  assert.deepEqual(rebuilt, built.bundle);
  assertHeld(rebuilt);
});

test("deterministic semantic plan and bound-bundle hashes are frozen", (t) => {
  const built = builtFixture(t, "hash-freeze");
  assert.equal(built.plan.semanticPlanHash,
    "sha256:e6d76e103e83c81d15e4b1209a8a7ba16dbe8ec459a92c1535528117f2c6e33c");
  assert.equal(built.bundle.bundleHash,
    "sha256:b812d290d44d3112625830393d655a2cf68de3b04bb09beb0ebccd3ba0e7ec5a");
});
