import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  NETWORK_INTAKE_BOUNDARY,
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
  createNetworkIntakeManifest,
  networkIntakeDigest,
  verifyNetworkIntakeManifest,
} from "../src/outsider-network-intake.js";
import {
  PROSPECTIVE_EPISODE_CENSUS_BOUNDARY,
  PROSPECTIVE_EPISODE_CENSUS_SCHEMAS,
  buildProspectiveEpisodeCensusProjection,
  createProspectiveEpisodeCensusSource,
  verifyProspectiveEpisodeCensusProjection,
} from "../src/outsider-prospective-episode-census.js";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function input(suffix = "a") {
  return {
    bindings: {
      claimHash: h(`claim:${suffix}`),
      wayHash: h(`way:${suffix}`),
      worldHash: h(`world:${suffix}`),
      cohortHash: h(`cohort:${suffix}`),
      censusSlotHash: h(`slot:${suffix}`),
    },
    registration: {
      registeredAt: "2026-08-28T01:00:00.000Z",
      plannedNotBefore: "2026-08-28T01:01:00.000Z",
      plannedNotAfter: "2026-08-28T02:00:00.000Z",
      preActionRegistrationReferenceHash: h(`registration:${suffix}`),
      externalTimeAnchorHash: null,
    },
    design: {
      eligibilityRuleHash: h(`eligibility:${suffix}`),
      assignmentPolicyHash: h(`assignment:${suffix}`),
      instrumentPlanHash: h(`instrument:${suffix}`),
      outcomePlanHash: h(`outcome:${suffix}`),
      stoppingPolicyHash: h(`stopping:${suffix}`),
      monitorPlanHash: h(`monitor:${suffix}`),
      stewardshipPlanHash: h(`stewardship:${suffix}`),
    },
  };
}

function resealProjection(record) {
  const result = structuredClone(record);
  delete result.projectionHash;
  result.projectionHash = networkIntakeDigest(
    PROSPECTIVE_EPISODE_CENSUS_SCHEMAS.projection, result);
  return result;
}

test("source replay produces an exact network census projection and remains HOLD", () => {
  const source = createProspectiveEpisodeCensusSource(input());
  const projection = buildProspectiveEpisodeCensusProjection(source);
  const checked = verifyProspectiveEpisodeCensusProjection(projection, {
    source, expectedSourceHash: source.sourceHash,
    expectedProjectionHash: projection.projectionHash,
  });
  assert.equal(checked.ok, true);
  assert.equal(checked.sourceReplayComplete, true);
  assert.equal(checked.networkQuarantineEligible, true);
  assert.equal(checked.decision, "HOLD");
  assert.equal(checked.boundary.authority, "NONE");
  assert.equal(checked.boundary.actionReady, false);
  assert.equal(checked.boundary.causalExperienceUnits, 0);

  const { subject, payload } = projection.networkProjection;
  assert.equal(payload.schema, NETWORK_INTAKE_PAYLOAD_SCHEMAS.PROSPECTIVE_CENSUS);
  assert.equal(payload.cohortCommitmentHash, subject.cohortHash);
  assert.equal(payload.censusSlotCommitmentHash, subject.censusSlotHash);
  assert.equal(payload.instrumentPlanHash, source.design.instrumentPlanHash);
  assert.notEqual(payload.instrumentPlanHash, projection.instrumentBundleHash);
  assert.equal(subject.episodeHash, null);
  assert.equal(subject.actorIdentityEnvelopeHash, null);
  assert.equal(payload.prospectiveRegistrationEstablishedAtNetworkEdge, false);
  assert.equal(payload.scientificCensusCompletenessEstablishedAtNetworkEdge, false);
});

test("the derived subject and payload pass only the quarantine network manifest", () => {
  const projection = buildProspectiveEpisodeCensusProjection(
    createProspectiveEpisodeCensusSource(input()));
  const manifest = createNetworkIntakeManifest({
    lane: projection.networkProjection.lane,
    clientSubmissionId: "prospective_episode_0001",
    payloadSchema: projection.networkProjection.payloadSchema,
    payload: projection.networkProjection.payload,
    subject: projection.networkProjection.subject,
    source: {
      sourceManifestHash: projection.sourceHash,
      instrumentHash: projection.instrumentBundleHash,
      rightsReviewHash: h("rights-review"),
      privacyReviewHash: h("privacy-review"),
    },
    consentHash: h("consent"),
    retentionDays: 30,
    createdAt: "2026-08-28T01:00:10.000Z",
  });
  const checked = verifyNetworkIntakeManifest(manifest, {
    payload: projection.networkProjection.payload,
  });
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.useBoundary, NETWORK_INTAKE_BOUNDARY);
  assert.equal(checked.useBoundary.authority, "NONE");
  assert.equal(checked.useBoundary.automaticTraining, false);
});

test("registration must precede the planned action window using canonical UTC", () => {
  const equal = input();
  equal.registration.registeredAt = equal.registration.plannedNotBefore;
  assert.throws(() => createProspectiveEpisodeCensusSource(equal),
    /LOCAL_PRE_ACTION_ORDER_INVALID/);
  const after = input();
  after.registration.registeredAt = "2026-08-28T01:30:00.000Z";
  assert.throws(() => createProspectiveEpisodeCensusSource(after),
    /LOCAL_PRE_ACTION_ORDER_INVALID/);
  const timezoneLess = input();
  timezoneLess.registration.registeredAt = "2026-08-28T01:00:00";
  assert.throws(() => createProspectiveEpisodeCensusSource(timezoneLess),
    /REGISTERED_AT_INVALID/);
});

test("an anchor reference never self-establishes external time or prospectivity", () => {
  const anchored = input();
  anchored.registration.externalTimeAnchorHash = h("external-anchor-reference");
  const projection = buildProspectiveEpisodeCensusProjection(
    createProspectiveEpisodeCensusSource(anchored));
  assert.equal(projection.networkProjection.payload.externalTimeAnchorHash,
    anchored.registration.externalTimeAnchorHash);
  assert.equal(projection.boundary.externalTimeAnchorVerified, false);
  assert.equal(projection.boundary.prospectivityEstablishedAtNetworkEdge, false);
  assert.deepEqual(projection.boundary, PROSPECTIVE_EPISODE_CENSUS_BOUNDARY);
});

test("source splicing and self-rehashing cannot change the frozen design", () => {
  const sourceA = createProspectiveEpisodeCensusSource(input("a"));
  const sourceB = createProspectiveEpisodeCensusSource(input("b"));
  const projection = buildProspectiveEpisodeCensusProjection(sourceA);
  assert.equal(verifyProspectiveEpisodeCensusProjection(projection, {
    source: sourceB,
  }).ok, false);

  const changed = structuredClone(projection);
  changed.design.monitorPlanHash = h("replacement-monitor");
  const resealed = resealProjection(changed);
  assert.equal(verifyProspectiveEpisodeCensusProjection(resealed, {
    source: sourceA,
  }).ok, false);
  assert.equal(verifyProspectiveEpisodeCensusProjection(projection, {
    source: sourceA, expectedSourceHash: h("wrong-source"),
  }).ok, false);
});

test("caller-positive fields and subject mismatches fail closed", () => {
  const promoted = input();
  promoted.authority = true;
  assert.throws(() => createProspectiveEpisodeCensusSource(promoted),
    /SOURCE_INPUT_FIELDS_INVALID/);

  const projection = buildProspectiveEpisodeCensusProjection(
    createProspectiveEpisodeCensusSource(input()));
  const altered = structuredClone(projection.networkProjection.payload);
  altered.prospectiveRegistrationEstablishedAtNetworkEdge = true;
  assert.throws(() => createNetworkIntakeManifest({
    lane: "PROSPECTIVE_CENSUS",
    clientSubmissionId: "prospective_episode_0002",
    payloadSchema: projection.networkProjection.payloadSchema,
    payload: altered,
    subject: projection.networkProjection.subject,
    source: { sourceManifestHash: projection.sourceHash,
      instrumentHash: projection.instrumentBundleHash,
      rightsReviewHash: h("rights"), privacyReviewHash: h("privacy") },
    consentHash: h("consent"), retentionDays: 30,
    createdAt: "2026-08-28T01:00:10.000Z",
  }), /MUST_REMAIN_FALSE/);
});

test("accessors, sparse values and proxies are rejected without reading traps", () => {
  let getterCalls = 0;
  const accessor = input();
  Object.defineProperty(accessor.bindings, "claimHash", {
    enumerable: true,
    get() { getterCalls += 1; return h("trap"); },
  });
  assert.throws(() => createProspectiveEpisodeCensusSource(accessor),
    /canonical objects must contain enumerable data properties/);
  assert.equal(getterCalls, 0);

  const sparse = input();
  sparse.design = new Array(2);
  sparse.design[1] = h("sparse");
  assert.throws(() => createProspectiveEpisodeCensusSource(sparse), /dense and undecorated/);

  let proxyCalls = 0;
  const proxied = new Proxy(input(), { get() { proxyCalls += 1; return null; } });
  assert.throws(() => createProspectiveEpisodeCensusSource(proxied), /PROXY_FORBIDDEN/);
  assert.equal(proxyCalls, 0);

  const cyclic = input();
  cyclic.unexpected = cyclic;
  assert.throws(() => createProspectiveEpisodeCensusSource(cyclic),
    /SHARED_OR_CYCLIC_OBJECT_FORBIDDEN/);
});

test("captured object intrinsics keep source bytes stable after import", () => {
  const before = buildProspectiveEpisodeCensusProjection(
    createProspectiveEpisodeCensusSource(input()));
  const originalDescriptors = Object.getOwnPropertyDescriptors;
  const originalFreeze = Object.freeze;
  const originalRegExpTest = RegExp.prototype.test;
  const OriginalDate = globalThis.Date;
  try {
    Object.getOwnPropertyDescriptors = () => { throw new Error("poisoned descriptors"); };
    Object.freeze = () => { throw new Error("poisoned freeze"); };
    RegExp.prototype.test = () => true;
    globalThis.Date = class PoisonedDate {
      constructor() { throw new Error("poisoned date"); }
    };
    const after = buildProspectiveEpisodeCensusProjection(
      createProspectiveEpisodeCensusSource(input()));
    assert.equal(after.projectionHash, before.projectionHash);
  } finally {
    Object.getOwnPropertyDescriptors = originalDescriptors;
    Object.freeze = originalFreeze;
    RegExp.prototype.test = originalRegExpTest;
    globalThis.Date = OriginalDate;
  }
});
