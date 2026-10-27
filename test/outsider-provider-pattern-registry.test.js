import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  PROVIDER_PATTERN_REGISTRY_SCHEMA,
  PROVIDER_PATTERN_REVIEW_SCHEMA,
  buildProviderPatternRegistry,
  buildProviderPatternReviewProjection,
  listProviderPatternEntities,
  providerPatternEntity,
  verifyProviderPatternRegistry,
  verifyProviderPatternReviewProjection,
} from "../src/outsider-provider-pattern-registry.js";

function reseal(record, schema, key) {
  const copy = structuredClone(record);
  delete copy[key];
  copy[key] = `sha256:${createHash("sha256")
    .update(`${schema}\0${canonicalizeStrict(copy)}`, "utf8").digest("hex")}`;
  return copy;
}

test("registry contains the exact ten reviewed companies plus MatrAIx", () => {
  const registry = buildProviderPatternRegistry();
  assert.equal(verifyProviderPatternRegistry(registry).ok, true);
  assert.equal(registry.accounting.entities, 11);
  assert.deepEqual(listProviderPatternEntities(), [
    "ACEIILAB_A1", "AIRJELLY", "BRIDGE_AFK", "EIGENFLUX",
    "KRUNTIME_SHAREAI", "MATRAIX", "MICROFEEL_ECHOSHELL", "ROPEDIA",
    "SEELE", "SURETHING", "TAP8_SIGMAZ",
  ]);
  assert.equal(registry.accounting.importedCodeAssets, 0);
  assert.equal(registry.accounting.executedThirdPartyAssets, 0);
  assert.equal(registry.accounting.ingestedPayloadRows, 0);
  assert.equal(registry.accounting.authorityGrants, 0);
  assert.equal(registry.northStarBoundary.mayExpandReviewRequirements, true);
  assert.equal(registry.northStarBoundary.mayExpandAuthority, false);
});

test("official revisions and license boundaries remain exact", () => {
  const eigen = providerPatternEntity("EIGENFLUX");
  assert.equal(eigen.sources[0].revision,
    "8d9679a7c89d9d87d5e580c610a4abebd541f296");
  assert.equal(eigen.sources[0].licenseStatus, "CUSTOM");
  assert.equal(eigen.sources[0].license, "LicenseRef-EigenFlux-2026");

  const seele = providerPatternEntity("SEELE");
  assert.equal(seele.sources.find(({ id }) => id === "seele-game-gen").licenseStatus,
    "ABSENT");
  assert.equal(seele.sources.find(({ id }) => id === "openeva").revision,
    "9cdd493872363e355ef35718076379c2dbff5fa2");

  const ropedia = providerPatternEntity("ROPEDIA");
  assert.equal(ropedia.sources.find(({ id }) => id === "xperience-sample").license,
    "CC-BY-NC-4.0");
  assert.equal(ropedia.sources.find(({ id }) => id === "xperience-full").licenseStatus,
    "GATED");

  const matraix = providerPatternEntity("MATRAIX");
  assert.equal(matraix.sources.find(({ id }) => id === "matraix-code").license, "MIT");
  assert.equal(matraix.sources.find(({ id }) => id === "matraix-persona-1m")
    .licenseStatus, "UNRESOLVED");
});

test("relationship boundaries prevent product and ownership laundering", () => {
  const runtime = providerPatternEntity("KRUNTIME_SHAREAI");
  assert.equal(runtime.identityStatus, "PRODUCT_NAME_NOT_MAPPED_TO_PUBLIC_REPOSITORY");
  assert.ok(runtime.sources.every(({ relationship }) =>
    relationship === "NOT_IDENTITY_PROOF_FOR_KRUNTIME"));

  const air = providerPatternEntity("AIRJELLY");
  assert.equal(air.sources.find(({ id }) => id === "minecontext").relationship,
    "HISTORICAL_TEAM_ASSET_NOT_AIRJELLY_PRODUCT_SOURCE");
  assert.equal(air.sources.find(({ id }) => id === "openclaw").relationship,
    "ECOSYSTEM_ONLY_NOT_AIRJELLY_OWNERSHIP");

  const bridge = providerPatternEntity("BRIDGE_AFK");
  assert.equal(bridge.sources.find(({ id }) => id === "kwwk-vendored").revision,
    "a63283af97e723ab2934eb847d58dbf4f482fb57");
  assert.equal(bridge.sources.find(({ id }) => id === "kwwk-vendored").relationship,
    "INDEPENDENT_OWNER_VENDORED_GITLINK");
  assert.equal(bridge.sources.find(({ id }) => id === "kwwk-upstream-head").relationship,
    "CURRENT_UPSTREAM_HEAD_NOT_VENDORED_REVISION");
});

test("patterns widen review requirements but never coverage, authority, or training", () => {
  for (const id of listProviderPatternEntities()) {
    const projection = buildProviderPatternReviewProjection(id);
    assert.equal(verifyProviderPatternReviewProjection(projection).ok, true);
    assert.ok(projection.evidenceRequirements.length > 0);
    assert.ok(projection.responsibilityRequirements.length > 0);
    assert.equal(projection.sourceCompletenessEstablished, false);
    assert.equal(projection.effectClosureEstablished, false);
    assert.equal(projection.evidenceCoverageEstablished, false);
    assert.equal(projection.responsibilityCoverageEstablished, false);
    assert.equal(projection.authorityEstablished, false);
    assert.equal(projection.actionReady, false);
    assert.equal(projection.executable, false);
    assert.equal(projection.admittedTrainingRows, 0);
    assert.equal(projection.causalExperienceUnits, 0);
  }
});

test("physical, context, and sandbox providers create conservative review floors", () => {
  const physical = buildProviderPatternReviewProjection("ACEIILAB_A1");
  assert.ok(physical.evidenceRequirements.includes("E_STOP"));
  assert.ok(physical.responsibilityRequirements.includes("BYSTANDERS"));
  assert.ok(physical.minimumControls.includes("CONSERVATIVE_EFFECT_CLOSURE"));

  const context = buildProviderPatternReviewProjection("AIRJELLY");
  assert.ok(context.evidenceRequirements.includes("DROPPED_CAPTURE"));
  assert.ok(context.responsibilityRequirements.includes("DELETION"));
  assert.ok(context.minimumControls.includes("NO_ENTER_KEY_CONSENT"));

  const bridge = buildProviderPatternReviewProjection("BRIDGE_AFK");
  assert.ok(bridge.evidenceRequirements.includes("HOST_SIDE_ACTIONS"));
  assert.ok(bridge.responsibilityRequirements.includes("BYPASS_DETECTION"));
  assert.ok(bridge.minimumControls.includes("ACCEPT_IS_NOT_EXTERNAL_AUTHORITY"));
});

test("MatrAIx is a simulated coverage stress source, never Reality or authority", () => {
  const projection = buildProviderPatternReviewProjection("MATRAIX");
  assert.equal(projection.sourceReality, "SIMULATION");
  assert.ok(projection.evidenceRequirements.includes("EXPLICIT_MISSINGNESS"));
  assert.ok(projection.evidenceRequirements.includes("ATTEMPT_DENOMINATOR"));
  assert.ok(projection.minimumControls.includes("CEU_ZERO"));
  assert.ok(projection.minimumControls.includes("NO_REALITY_CENSUS"));
  assert.equal(projection.actionReady, false);
});

test("self-consistent rehashing cannot promote catalog or projection", () => {
  const catalog = buildProviderPatternRegistry();
  for (const mutate of [
    (value) => { value.northStarBoundary.mayExpandAuthority = true; },
    (value) => { value.accounting.admittedTrainingRows = 1; },
    (value) => { value.entities[0].integration.thirdPartyCodeExecuted = true; },
  ]) {
    const changed = structuredClone(catalog);
    mutate(changed);
    assert.equal(verifyProviderPatternRegistry(reseal(changed,
      PROVIDER_PATTERN_REGISTRY_SCHEMA, "registryHash")).ok, false);
  }

  const projection = buildProviderPatternReviewProjection("BRIDGE_AFK");
  for (const mutate of [
    (value) => { value.authorityEstablished = true; },
    (value) => { value.effectClosureEstablished = true; },
    (value) => { value.admittedTrainingRows = 1; },
  ]) {
    const changed = structuredClone(projection);
    mutate(changed);
    assert.equal(verifyProviderPatternReviewProjection(reseal(changed,
      PROVIDER_PATTERN_REVIEW_SCHEMA, "projectionHash")).ok, false);
  }
});

test("non-JSON array semantics and unknown entities fail closed", () => {
  const catalog = structuredClone(buildProviderPatternRegistry());
  catalog.entities.length += 1;
  assert.equal(verifyProviderPatternRegistry(catalog).ok, false);
  assert.throws(() => providerPatternEntity("UNKNOWN"),
    /PROVIDER_PATTERN_ENTITY_UNKNOWN/u);
});

test("post-import structuredClone poisoning cannot erase review requirements or boundaries", () => {
  const original = globalThis.structuredClone;
  try {
    globalThis.structuredClone = () => ({
      evidenceRequirements: [], responsibilityRequirements: [], minimumControls: [],
      integration: { thirdPartyCodeExecuted: true, networkActionConnected: true },
    });
    const registry = buildProviderPatternRegistry();
    const projection = buildProviderPatternReviewProjection("BRIDGE_AFK");
    assert.equal(verifyProviderPatternRegistry(registry).ok, true);
    assert.equal(verifyProviderPatternReviewProjection(projection).ok, true);
    assert.ok(projection.evidenceRequirements.includes("HOST_SIDE_ACTIONS"));
    assert.ok(projection.responsibilityRequirements.includes("BYPASS_DETECTION"));
    assert.ok(registry.entities.every(({ integration }) =>
      integration.thirdPartyCodeExecuted === false
        && integration.networkActionConnected === false));
  } finally {
    globalThis.structuredClone = original;
  }
});

test("post-import array flatMap poisoning cannot erase requirements", () => {
  const original = Array.prototype.flatMap;
  let projection;
  try {
    Array.prototype.flatMap = () => [];
    projection = buildProviderPatternReviewProjection("BRIDGE_AFK");
  } finally {
    Array.prototype.flatMap = original;
  }
  assert.equal(verifyProviderPatternReviewProjection(projection).ok, true);
  assert.ok(projection.evidenceRequirements.includes("HOST_SIDE_ACTIONS"));
  assert.ok(projection.responsibilityRequirements.includes("BYPASS_DETECTION"));
  assert.ok(projection.minimumControls.includes("ACCEPT_IS_NOT_EXTERNAL_AUTHORITY"));
});

test("post-import Object traversal poisoning cannot promote registry boundaries", () => {
  const original = Object.values;
  let registry;
  try {
    Object.values = (value) => {
      if (value?.northStarBoundary) value.northStarBoundary.mayExpandAuthority = true;
      if (value?.integration) value.integration.thirdPartyCodeExecuted = true;
      return original(value);
    };
    registry = buildProviderPatternRegistry();
  } finally {
    Object.values = original;
  }
  assert.equal(verifyProviderPatternRegistry(registry).ok, true);
  assert.equal(registry.northStarBoundary.mayExpandAuthority, false);
  assert.ok(registry.entities.every(({ integration }) =>
    integration.thirdPartyCodeExecuted === false));
});

test("verifiers reject accessors without executing them", () => {
  let registryReads = 0;
  let projectionReads = 0;
  const registry = { get registryHash() { registryReads += 1; return "x"; } };
  const projection = {
    get entityId() { projectionReads += 1; return "BRIDGE_AFK"; },
    get projectionHash() { projectionReads += 1; return "x"; },
  };
  assert.equal(verifyProviderPatternRegistry(registry).ok, false);
  assert.equal(verifyProviderPatternReviewProjection(projection).ok, false);
  assert.equal(registryReads, 0);
  assert.equal(projectionReads, 0);
});
