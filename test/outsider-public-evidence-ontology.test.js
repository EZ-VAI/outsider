import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  PUBLIC_EVIDENCE_ONTOLOGY_SCHEMAS,
  PUBLIC_EVIDENCE_ONTOLOGY_INVARIANTS,
  buildPublicEvidenceOntologyCatalog,
  buildPublicEvidenceOntologyClassification,
  listPublicEvidenceOntologySources,
  publicEvidenceOntologyReference,
  verifyPublicEvidenceOntologyCatalog,
  verifyPublicEvidenceOntologyClassification,
  verifyPublicEvidenceOntologyReference,
} from "../src/outsider-public-evidence-ontology.js";

const EXPECTED_SOURCES = [
  "AI45Research/ATBench-Claw",
  "AI45Research/ATBench-Codex",
  "NHTSA_SGO_ADS_CRASH_REPORTS",
  "OpenHands/openhands-feedback",
  "Tencent/CUARewardBench",
  "kantine/BotFails",
  "kimdanny/matm",
  "microsoft/AgentRx:tau_retail",
  "nebius/SWE-rebench-openhands-trajectories",
  "paulpacaud/Guardian-FailCoT-OOD-datasets",
  "r2d2_faceblur",
  "sierra-research/tau2-bench",
  "uw-syfi/TraceLab",
  "xlangai/computer-agent-arena",
];

function reseal(classification) {
  const copy = structuredClone(classification);
  delete copy.classificationHash;
  copy.classificationHash = `sha256:${createHash("sha256")
    .update(`${PUBLIC_EVIDENCE_ONTOLOGY_SCHEMAS.classification}\0`)
    .update(canonicalizeStrict(copy)).digest("hex")}`;
  return copy;
}

test("public evidence ontology freezes all audited sources and four independent dimensions", () => {
  assert.deepEqual(listPublicEvidenceOntologySources(), EXPECTED_SOURCES);
  const catalog = buildPublicEvidenceOntologyCatalog();
  assert.equal(verifyPublicEvidenceOntologyCatalog(catalog).ok, true);
  assert.equal(catalog.catalogHash,
    "sha256:4117c1f3ab69f71b902c91e17c8c283d3087be90e08bcbd61ad3c64f0364ff99");
  assert.deepEqual(catalog.counts.environmentClassMemberships, {
    ORGANIC: 3, REAL_PHYSICAL: 4, REAL_SOFTWARE: 5, CONTROLLED_REAL_APP: 3,
    SIMULATION: 3, SYNTHETIC: 2,
  });
  assert.deepEqual(catalog.counts.authorityLevelMemberships, {
    SELF_REPORTED: 2, PUBLISHER_DECLARED: 14, HUMAN_REVIEWED: 5,
    SOURCE_REPLAYED: 14, PROSPECTIVE: 0, ADJUDICATED: 0,
  });
  assert.deepEqual(catalog.counts.permittedUseMemberships, {
    DESCRIPTIVE: 14, SHADOW_RESEARCH: 13, CAUSAL: 0, LOSS: 0, PRICE: 0,
    PRODUCTION_MODEL: 0, AUTOMATIC_TRAINING: 0, CONTROL: 0, GUARANTEE: 0, SETTLE: 0,
  });
  assert.ok(PUBLIC_EVIDENCE_ONTOLOGY_INVARIANTS.includes(
    "SHADOW_RESEARCH_IS_PERMITTED_USE_NOT_SOURCE_REALITY"));
});

test("recorded simulator execution is empirical but neither synthetic nor real-world", () => {
  for (const id of ["sierra-research/tau2-bench", "kimdanny/matm",
    "microsoft/AgentRx:tau_retail"]) {
    const classification = buildPublicEvidenceOntologyClassification(id);
    assert.deepEqual(classification.environmentReality.classes, ["SIMULATION"]);
    assert.equal(classification.environmentReality.observationOrigin, "RECORDED_EXECUTION");
    assert.equal(classification.environmentReality.empiricalStatus, "EMPIRICAL_RECORDED");
    assert.equal(classification.environmentReality.liveActionSubstrate, false);
    assert.equal(classification.environmentReality.classes.includes("SYNTHETIC"), false);
  }
  for (const id of ["AI45Research/ATBench-Codex", "AI45Research/ATBench-Claw"]) {
    const classification = buildPublicEvidenceOntologyClassification(id);
    assert.deepEqual(classification.environmentReality.classes, ["SYNTHETIC"]);
    assert.equal(classification.environmentReality.observationOrigin, "GENERATED_BENCHMARK");
    assert.equal(classification.environmentReality.empiricalStatus, "GENERATED_SYNTHETIC");
  }
});

test("real software and physical observations do not acquire causal, loss or control authority", () => {
  const catalog = buildPublicEvidenceOntologyCatalog();
  const real = catalog.classifications.filter((classification) =>
    classification.environmentReality.liveActionSubstrate);
  assert.equal(real.length, 9);
  for (const classification of real) {
    assert.equal(classification.environmentReality.classes.some((value) =>
      ["REAL_PHYSICAL", "REAL_SOFTWARE"].includes(value)), true);
    assert.deepEqual(classification.permittedUse.allowed.filter((value) =>
      !["DESCRIPTIVE", "SHADOW_RESEARCH"].includes(value)), []);
    for (const use of ["CAUSAL", "LOSS", "PRICE", "PRODUCTION_MODEL",
      "AUTOMATIC_TRAINING", "CONTROL", "GUARANTEE", "SETTLE"]) {
      assert.ok(classification.permittedUse.denied.includes(use));
    }
    assert.equal(classification.evidenceAuthority.formalAdjudicationEstablished, false);
    assert.equal(classification.rightsBoundary.adapterGrantsRights, false);
  }
});

test("metadata, human review, replay and adjudication remain distinct authority claims", () => {
  const wave3 = buildPublicEvidenceOntologyClassification("Tencent/CUARewardBench");
  assert.equal(wave3.environmentReality.primaryClass, "CONTROLLED_REAL_APP");
  assert.equal(wave3.environmentReality.observationOrigin, "METADATA_ONLY");
  assert.equal(wave3.environmentReality.empiricalStatus, "PUBLISHER_METADATA_ONLY");
  assert.ok(wave3.evidenceAuthority.levels.includes("HUMAN_REVIEWED"));
  assert.equal(wave3.evidenceAuthority.sourceReplayScope, "PINNED_METADATA_ONLY");
  assert.equal(wave3.evidenceAuthority.sourceTruthIndependentlyEstablished, false);

  const wave4 = buildPublicEvidenceOntologyClassification("microsoft/AgentRx:tau_retail");
  assert.ok(wave4.evidenceAuthority.levels.includes("HUMAN_REVIEWED"));
  assert.equal(wave4.evidenceAuthority.levels.includes("ADJUDICATED"), false);
  assert.equal(wave4.evidenceAuthority.formalAdjudicationEstablished, false);

  const droid = buildPublicEvidenceOntologyClassification("r2d2_faceblur");
  assert.equal(droid.environmentReality.primaryClass, "REAL_PHYSICAL");
  assert.equal(droid.evidenceAuthority.levels.includes("HUMAN_REVIEWED"), false);
  assert.equal(droid.evidenceAuthority.collectionTimeAttestationEstablished, false);
});

test("NHTSA is organic physical incident evidence but only descriptive and self-reported", () => {
  const nhtsa = buildPublicEvidenceOntologyClassification("NHTSA_SGO_ADS_CRASH_REPORTS");
  assert.deepEqual(nhtsa.environmentReality.classes, ["ORGANIC", "REAL_PHYSICAL"]);
  assert.equal(nhtsa.environmentReality.observationOrigin, "PUBLISHER_INCIDENT_REPORT");
  assert.deepEqual(nhtsa.evidenceAuthority.levels,
    ["SELF_REPORTED", "PUBLISHER_DECLARED", "SOURCE_REPLAYED"]);
  assert.deepEqual(nhtsa.permittedUse.allowed, ["DESCRIPTIVE"]);
  assert.equal(nhtsa.permittedUse.shadowScope, null);
  assert.equal(nhtsa.permittedUse.descriptiveScope,
    "INCIDENT_TAXONOMY_AND_SOURCE_DISCOVERY_ONLY");
  assert.match(nhtsa.rightsBoundary.reuseOrTrainingRights, /NOT_ESTABLISHED/);
  assert.equal(nhtsa.evidenceAuthority.formalAdjudicationEstablished, false);
});

test("rights are machine-visible and never inferred from reality, review or public access", () => {
  const catalog = buildPublicEvidenceOntologyCatalog();
  for (const classification of catalog.classifications) {
    assert.deepEqual(Object.keys(classification.rightsBoundary).sort(), [
      "adapterGrantsRights", "consentOrCollectionAuthority", "legalConclusion",
      "licenseDeclaration", "reuseOrTrainingRights", "sourceBytesRightsBasis",
    ]);
    assert.equal(classification.rightsBoundary.adapterGrantsRights, false);
    assert.equal(classification.rightsBoundary.legalConclusion, false);
  }
  const wave3 = buildPublicEvidenceOntologyClassification("Tencent/CUARewardBench");
  assert.match(wave3.rightsBoundary.sourceBytesRightsBasis,
    /UPSTREAM_TRAJECTORY_RIGHTS_NOT_CLAIMED/);
  const wave4 = buildPublicEvidenceOntologyClassification("microsoft/AgentRx:tau_retail");
  assert.match(wave4.rightsBoundary.sourceBytesRightsBasis,
    /HF_GATED_BYTE_EQUIVALENCE_UNESTABLISHED/);
  const droid = buildPublicEvidenceOntologyClassification("r2d2_faceblur");
  assert.match(droid.rightsBoundary.licenseDeclaration,
    /GCS_OBJECT_METADATA_HAS_NO_LICENSE_FIELD/);
});

test("semantic verifiers reject re-sealed cross-axis promotions", () => {
  const mutations = [
    ["NHTSA_SGO_ADS_CRASH_REPORTS", (value) => {
      value.permittedUse.allowed.push("LOSS");
      value.permittedUse.denied = value.permittedUse.denied.filter((use) => use !== "LOSS");
    }],
    ["r2d2_faceblur", (value) => { value.evidenceAuthority.sourceTruthIndependentlyEstablished = true; }],
    ["kantine/BotFails", (value) => { value.rightsBoundary.adapterGrantsRights = true; }],
    ["NHTSA_SGO_ADS_CRASH_REPORTS", (value) => {
      value.permittedUse.allowed.push("SHADOW_RESEARCH");
      value.permittedUse.shadowScope = "UNAUTHORIZED_PROMOTION";
      value.permittedUse.allowed.sort((left, right) => ["DESCRIPTIVE", "SHADOW_RESEARCH"]
        .indexOf(left) - ["DESCRIPTIVE", "SHADOW_RESEARCH"].indexOf(right));
      value.permittedUse.denied = value.permittedUse.denied
        .filter((use) => use !== "SHADOW_RESEARCH");
    }],
    ["microsoft/AgentRx:tau_retail", (value) => {
      value.environmentReality.classes = ["SYNTHETIC"];
      value.environmentReality.primaryClass = "SYNTHETIC";
      value.environmentReality.collectionMode = "GENERATED";
      value.environmentReality.observationOrigin = "GENERATED_BENCHMARK";
      value.environmentReality.empiricalStatus = "GENERATED_SYNTHETIC";
    }],
  ];
  for (const [id, mutate] of mutations) {
    const classification = structuredClone(buildPublicEvidenceOntologyClassification(id));
    mutate(classification);
    assert.equal(verifyPublicEvidenceOntologyClassification(reseal(classification)).ok, false);
  }
});

test("compact references bind source revision, ontology, rights and allowed use", () => {
  const reference = publicEvidenceOntologyReference("microsoft/AgentRx:tau_retail");
  assert.equal(verifyPublicEvidenceOntologyReference(reference).ok, true);
  assert.equal(reference.sourceRevision,
    "f228165bfec60a801fd5fedd9d8ffe0f9de0c69d");
  assert.deepEqual(reference.environmentRealityClasses, ["SIMULATION"]);
  assert.equal(reference.observationOrigin, "RECORDED_EXECUTION");
  assert.equal(reference.empiricalStatus, "EMPIRICAL_RECORDED");
  assert.deepEqual(reference.permittedUses, ["DESCRIPTIVE", "SHADOW_RESEARCH"]);
  assert.match(reference.rightsBoundaryHash, /^sha256:[a-f0-9]{64}$/);
  const tampered = structuredClone(reference);
  tampered.permittedUses.push("PRICE");
  assert.equal(verifyPublicEvidenceOntologyReference(tampered).ok, false);
});
