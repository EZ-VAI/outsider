import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  REALITY_SOURCE_REVIEW_SCHEMA,
  REALITY_SOURCE_SCOUT_SCHEMA,
  buildRealitySourceReviewProjection,
  buildRealitySourceScout,
  listRealitySourceCandidates,
  realitySourceCandidate,
  verifyRealitySourceReviewProjection,
  verifyRealitySourceScout,
} from "../src/outsider-reality-source-scout.js";

function reseal(value, schema, hashKey) {
  const copy = structuredClone(value);
  delete copy[hashKey];
  copy[hashKey] = `sha256:${createHash("sha256")
    .update(`${schema}\0${canonicalizeStrict(copy)}`, "utf8").digest("hex")}`;
  return copy;
}

test("eleven official-source candidates remain metadata-only", () => {
  const catalog = buildRealitySourceScout();
  assert.equal(verifyRealitySourceScout(catalog).ok, true);
  assert.equal(catalog.accounting.sources, 11);
  assert.equal(catalog.accounting.payloadsDownloaded, 0);
  assert.equal(catalog.accounting.sourceBytesReplayed, 0);
  assert.equal(catalog.accounting.admittedTrainingRows, 0);
  assert.equal(catalog.accounting.authorityGrants, 0);
  assert.deepEqual(listRealitySourceCandidates(), [
    "AAIB_UAS_RECORD_ONLY_2026_02_03",
    "AI_INCIDENT_DATABASE_2026_MAY_JULY",
    "CALIFORNIA_DMV_AV_DISENGAGEMENT_2023_12_2024_11",
    "CEDAR_EXAMPLE_USE_CASES_4_12",
    "FDA_MAUDE_THRU_2025",
    "NASA_ASRS_UAS_UPDATE_23",
    "NHTSA_SGO_THIRD_AMENDMENT_2026_07_15",
    "OECD_AIM_2026_08_13",
    "OPENID_SHARED_SIGNALS_FINAL_1_0",
    "OSHA_FEDERAL_SEVERE_INJURY_2024",
    "REBOOT26_SAMPLE_RECOVERY_DEMONSTRATION",
  ]);
});

test("exact immutable pins and explicitly mutable source observations are retained", () => {
  assert.equal(realitySourceCandidate("CEDAR_EXAMPLE_USE_CASES_4_12")
    .sourceLocator.value, "c251f7d1ad171bd12dee5d1d7a1cceaec994518f");
  assert.equal(realitySourceCandidate("REBOOT26_SAMPLE_RECOVERY_DEMONSTRATION")
    .sourceLocator.value, "0633573d0438be1185bddebdf1a2c8f5505f7b2a");
  const asrsLocator = realitySourceCandidate("NASA_ASRS_UAS_UPDATE_23")
    .sourceLocator;
  assert.equal(asrsLocator.value, "UPDATE_23");
  assert.equal(asrsLocator.kind, "MUTABLE_OFFICIAL_URL_OBSERVATION");
  assert.equal(asrsLocator.stable, false);
  assert.equal(asrsLocator.contentHashEstablished, false);
  const maudeLocator = realitySourceCandidate("FDA_MAUDE_THRU_2025").sourceLocator;
  assert.equal(maudeLocator.masterFile, "mdrfoithru2025.zip");
  assert.equal(maudeLocator.deviceProblemCodeFile, "deviceproblemcodes2025.zip");
  assert.equal(maudeLocator.patientProblemCodeFile, "patientproblemcodes2025.zip");
  assert.equal(maudeLocator.kind, "OFFICIAL_YEAR_CUTOFF_FILESET_OBSERVATION");
  assert.equal(maudeLocator.stable, false);
  assert.equal(maudeLocator.contentHashEstablished, false);
  const oecdLocator = realitySourceCandidate("OECD_AIM_2026_08_13").sourceLocator;
  assert.equal(oecdLocator.kind, "QUERY_CUTOFF");
  assert.equal(oecdLocator.stable, false);
  assert.equal(oecdLocator.snapshotEstablished, false);

  const openid = realitySourceCandidate("OPENID_SHARED_SIGNALS_FINAL_1_0")
    .sourceLocator;
  assert.equal(openid.kind, "FINAL_SPECIFICATION_SET");
  assert.equal(openid.stable, true);
  assert.equal(openid.contentHashEstablished, false);
  assert.equal(openid.specificationUrls.length, 3);
});

test("denominators and their non-prevalence boundaries stay visible", () => {
  const maude = realitySourceCandidate("FDA_MAUDE_THRU_2025");
  assert.equal(maude.denominator.count, 23_636_521);
  assert.equal(maude.denominator.exposureDenominatorAvailable, false);
  assert.ok(maude.publisherLimitations.includes("NO_EXPOSURE_DENOMINATOR"));

  const asrs = realitySourceCandidate("NASA_ASRS_UAS_UPDATE_23");
  assert.equal(asrs.denominator.count, 50);
  assert.ok(asrs.publisherLimitations.includes("NO_PREVALENCE_INFERENCE"));

  const oecd = realitySourceCandidate("OECD_AIM_2026_08_13");
  assert.equal(oecd.denominator.exact, false);
  assert.equal(oecd.denominator.dynamicSource, true);

  const aiid = realitySourceCandidate("AI_INCIDENT_DATABASE_2026_MAY_JULY");
  assert.equal(aiid.denominator.count, 148);
  assert.equal(aiid.denominator.arithmeticReconciled, true);

  const aaib = realitySourceCandidate("AAIB_UAS_RECORD_ONLY_2026_02_03");
  assert.equal(aaib.denominator.count, 3);
  assert.equal(aaib.denominator.widerOccurrencePopulationKnown, false);

  const dmv = realitySourceCandidate(
    "CALIFORNIA_DMV_AV_DISENGAGEMENT_2023_12_2024_11",
  );
  assert.equal(dmv.denominator.count, 4_498_066);
  assert.equal(dmv.denominator.safetyDriverMiles
    + dmv.denominator.fullyAutonomousMiles, dmv.denominator.count);
  assert.equal(dmv.denominator.disengagementRowsReplayed, false);

  const nhtsa = realitySourceCandidate("NHTSA_SGO_THIRD_AMENDMENT_2026_07_15");
  assert.equal(nhtsa.denominator.count, null);
  assert.equal(nhtsa.denominator.exposureDenominatorAvailable, false);

  const osha = realitySourceCandidate("OSHA_FEDERAL_SEVERE_INJURY_2024");
  assert.equal(osha.denominator.count, 9_034);
  assert.equal(osha.denominator.categoriesMayOverlap, true);
});

test("rights, privacy, and source-specific holds cannot be blurred", () => {
  const reboot = realitySourceCandidate("REBOOT26_SAMPLE_RECOVERY_DEMONSTRATION");
  assert.equal(reboot.denominator.sampleFrameRowsClaimed, 53_886);
  assert.equal(reboot.rightsAndPrivacy.licenseConflictResolved, false);
  assert.equal(reboot.rightsAndPrivacy.rgbdPrivacyReviewRequired, true);
  assert.equal(reboot.boundary.trainingRightsEstablished, false);

  const aiid = realitySourceCandidate("AI_INCIDENT_DATABASE_2026_MAY_JULY");
  assert.equal(aiid.rightsAndPrivacy.codeLicense, "MIT");
  assert.equal(aiid.rightsAndPrivacy.reportTextRightsResolved, false);

  const cedar = realitySourceCandidate("CEDAR_EXAMPLE_USE_CASES_4_12");
  assert.equal(cedar.sourceClass, "SYNTHETIC_AUTHORIZATION_POLICY_AND_REQUEST_CORPUS");
  assert.ok(cedar.publisherLimitations.includes("NO_LIVE_OWNER_IDENTITY"));

  const aaib = realitySourceCandidate("AAIB_UAS_RECORD_ONLY_2026_02_03");
  assert.equal(aaib.rightsAndPrivacy.publicationLicenseClaim, "OGL-3.0");
  assert.equal(aaib.rightsAndPrivacy.thirdPartyRightsResolved, false);

  const openid = realitySourceCandidate("OPENID_SHARED_SIGNALS_FINAL_1_0");
  assert.equal(openid.rightsAndPrivacy.specificationTextLicense, null);
  assert.equal(openid.boundary.authorityEstablished, false);
});

test("review projections add channels to investigate but establish no radius", () => {
  for (const id of listRealitySourceCandidates()) {
    const projection = buildRealitySourceReviewProjection(id);
    assert.equal(verifyRealitySourceReviewProjection(projection).ok, true);
    assert.ok(projection.channelHypotheses.length > 0);
    assert.ok(projection.requiredHoldGates.length >= 5);
    assert.equal(projection.sourceTruthEstablished, false);
    assert.equal(projection.evidenceCoverageEstablished, false);
    assert.equal(projection.responsibilityCoverageEstablished, false);
    assert.equal(projection.causalityEstablished, false);
    assert.equal(projection.authorityEstablished, false);
    assert.equal(projection.actionReady, false);
    assert.equal(projection.trainingRows, 0);
    assert.equal(projection.causalExperienceUnits, 0);
  }
});

test("Cedar patterns do not become authority and incident rows do not become truth", () => {
  const cedar = buildRealitySourceReviewProjection("CEDAR_EXAMPLE_USE_CASES_4_12");
  assert.ok(cedar.channelHypotheses.includes("PRINCIPAL"));
  assert.ok(cedar.channelHypotheses.includes("DENY"));
  assert.equal(cedar.authorityEstablished, false);

  const aiid = buildRealitySourceReviewProjection("AI_INCIDENT_DATABASE_2026_MAY_JULY");
  assert.ok(aiid.channelHypotheses.includes("ALLEGED_HARM"));
  assert.equal(aiid.sourceTruthEstablished, false);

  const openid = buildRealitySourceReviewProjection("OPENID_SHARED_SIGNALS_FINAL_1_0");
  assert.ok(openid.channelHypotheses.includes("SESSION_REVOKED"));
  assert.equal(openid.authorityEstablished, false);
});

test("self-consistent rehashing cannot promote source or review authority", () => {
  const catalog = buildRealitySourceScout();
  for (const mutate of [
    (value) => { value.northStarBoundary.mayExpandAuthority = true; },
    (value) => { value.sources[0].boundary.sourceTruthEstablished = true; },
    (value) => { value.accounting.admittedTrainingRows = 1; },
  ]) {
    const changed = structuredClone(catalog);
    mutate(changed);
    assert.equal(verifyRealitySourceScout(reseal(changed,
      REALITY_SOURCE_SCOUT_SCHEMA, "catalogHash")).ok, false);
  }

  const projection = buildRealitySourceReviewProjection("FDA_MAUDE_THRU_2025");
  const changed = structuredClone(projection);
  changed.causalityEstablished = true;
  assert.equal(verifyRealitySourceReviewProjection(reseal(changed,
    REALITY_SOURCE_REVIEW_SCHEMA, "projectionHash")).ok, false);
});

test("sparse arrays and unknown sources fail closed", () => {
  const catalog = structuredClone(buildRealitySourceScout());
  catalog.sources.length += 1;
  assert.equal(verifyRealitySourceScout(catalog).ok, false);
  assert.throws(() => realitySourceCandidate("UNKNOWN"),
    /REALITY_SOURCE_SCOUT_SOURCE_UNKNOWN/u);
});

test("post-import clone and Object traversal poisoning cannot promote source boundaries", () => {
  const originalClone = globalThis.structuredClone;
  const originalValues = Object.values;
  let catalog;
  try {
    globalThis.structuredClone = (value) => {
      const clone = originalClone(value);
      if (Array.isArray(clone) && clone[0]?.boundary) {
        clone[0].boundary.authorityEstablished = true;
        clone[0].boundary.admittedTrainingRows = 999;
      }
      return clone;
    };
    Object.values = (value) => {
      if (value?.northStarBoundary) value.northStarBoundary.mayExpandAuthority = true;
      return originalValues(value);
    };
    catalog = buildRealitySourceScout();
  } finally {
    globalThis.structuredClone = originalClone;
    Object.values = originalValues;
  }
  assert.equal(verifyRealitySourceScout(catalog).ok, true);
  assert.equal(catalog.northStarBoundary.mayExpandAuthority, false);
  assert.ok(catalog.sources.every(({ boundary }) =>
    boundary.authorityEstablished === false && boundary.admittedTrainingRows === 0));
});

test("verifiers reject accessors without executing them", () => {
  let catalogReads = 0;
  let reviewReads = 0;
  const catalog = { get catalogHash() { catalogReads += 1; return "x"; } };
  const review = {
    get sourceId() { reviewReads += 1; return "FDA_MAUDE_THRU_2025"; },
    get projectionHash() { reviewReads += 1; return "x"; },
  };
  assert.equal(verifyRealitySourceScout(catalog).ok, false);
  assert.equal(verifyRealitySourceReviewProjection(review).ok, false);
  assert.equal(catalogReads, 0);
  assert.equal(reviewReads, 0);
});
