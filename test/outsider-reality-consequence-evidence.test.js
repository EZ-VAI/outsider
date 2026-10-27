import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";

import {
  adaptOshaSirRobotConsequenceCsv,
  buildRealityConsequenceEvidenceDiff,
  buildOshaSirRobotConsequenceBookFromZip,
  extractSingleCsvFromZip,
  OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821,
  verifyOshaSirRobotConsequenceBook,
  verifyOshaSirRobotConsequenceBookFromZip,
  verifyRealityConsequenceEvidenceDiff,
} from "../src/outsider-reality-consequence-evidence.js";

const HEADERS = [
  "ID", "UPA", "EventDate", "Employer", "Address1", "Address2", "City", "State",
  "Zip", "Latitude", "Longitude", "Primary NAICS", "Hospitalized", "Amputation",
  "Loss of Eye", "Inspection", "Final Narrative", "Nature", "NatureTitle",
  "Part of Body", "Part of Body Title", "Event", "EventTitle", "Source",
  "SourceTitle", "Secondary Source", "Secondary Source Title", "FederalState",
];

function csvField(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function fixtureCsv() {
  const base = ["", "", "", "", "", "", "", "", "", "", "", "", "0.00",
    "0.00", "0.00", "", "", "", "", "", "", "", "", "", "", "", "", "1"];
  const row = (overrides) => HEADERS.map((header, index) => overrides[header] ?? base[index]);
  const rows = [
    row({ ID: "A-1", UPA: "SECRET-UPA-1", EventDate: "1/2/2024",
      Employer: "Secret Employer A", Address1: "1 Secret Street", City: "Secret City",
      State: "CA", Zip: "99999", Latitude: "37.1", Longitude: "-122.1",
      "Primary NAICS": "336111", Hospitalized: "1.00", Inspection: "SECRET-INSPECTION",
      "Final Narrative": "A maintenance employee was pinned by a robotic arm in a guarded robot cell; it was not locked out.",
      Nature: "111", NatureTitle: "Fractures", "Part of Body": "510",
      "Part of Body Title": "Leg", Event: "6411", EventTitle: "Caught in machinery",
      Source: "392", SourceTitle: "Assembly machinery" }),
    row({ ID: "A-1", UPA: "SECRET-UPA-2", EventDate: "2/3/2024",
      Employer: "Secret Employer B", "Primary NAICS": "493190", Amputation: "1.00",
      "Final Narrative": "An automated guided vehicle (AGV) struck a worker during setup.",
      Nature: "1311", NatureTitle: "Amputations", "Part of Body": "4422",
      "Part of Body Title": "Fingertip", Event: "6219", EventTitle: "Struck by vehicle",
      Source: "8629", SourceTitle: "Industrial vehicle" }),
    row({ ID: "A-3", UPA: "3", EventDate: "3/4/2024", Employer: "Restaurant",
      Hospitalized: "1.00", "Final Narrative": "A worker contacted a Robot Coupe food processor." }),
    row({ ID: "A-4", UPA: "4", EventDate: "4/5/2024", Employer: "Warehouse",
      Hospitalized: "1.00", "Final Narrative": "A worker fell from a ladder." }),
  ];
  return Buffer.from(`${HEADERS.map(csvField).join(",")}\n${rows.map((values) =>
    values.map(csvField).join(",")).join("\n")}\n`);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(name, content) {
  const nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30 + nameBytes.length);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc32(content), 14); local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22); local.writeUInt16LE(nameBytes.length, 26);
  nameBytes.copy(local, 30);
  const central = Buffer.alloc(46 + nameBytes.length);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6); central.writeUInt32LE(crc32(content), 16);
  central.writeUInt32LE(content.length, 20); central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(0, 42);
  nameBytes.copy(central, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(local.length + content.length, 16);
  return Buffer.concat([local, content, central, end]);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainHash(domain, value) {
  return sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`));
}

function reseal(artifact) {
  for (const row of artifact.projections) {
    const { projectionHash: ignored, ...body } = row;
    row.projectionHash = domainHash("outsider/osha-sir/robot-consequence-projection/v1", body);
  }
  artifact.sourceCommitmentHash = domainHash("outsider/osha-sir/robot-consequence-source/v1", {
    source: artifact.source,
    counts: artifact.counts,
    taxonomyCandidateCounts: artifact.taxonomyCandidateCounts,
    projectionHashes: artifact.projections.map((row) => row.projectionHash),
  });
  const { artifactHash: ignored, ...body } = artifact;
  artifact.artifactHash = domainHash("outsider/reality-consequence-evidence-book/v1", body);
  return artifact;
}

test("OSHA consequence adapter preserves reality while refusing causal and pricing authority", () => {
  const csv = fixtureCsv();
  const artifact = adaptOshaSirRobotConsequenceCsv(csv, {
    sourceArchiveHash: sha256(Buffer.from("fixture archive")), sourceArchiveBytes: 15,
    generatedAt: "2026-08-21T00:00:00.000Z",
  });
  assert.deepEqual(artifact.evidenceOntology.environmentReality, ["UNVERIFIED_FIXTURE"]);
  assert.equal(artifact.source.sourceTrustClass, "CALLER_ASSERTED_SHAPED_FIXTURE");
  assert.equal(artifact.source.publisher, null);
  assert.equal(artifact.source.officialPageUrl, null);
  assert.equal(artifact.source.sourceUrl, null);
  assert.equal(artifact.source.sourceArtifactsReverified, false);
  assert.deepEqual(artifact.evidenceOntology.authorityLevels, ["CALLER_ASSERTED"]);
  assert.equal(artifact.rightsBoundary.sourceBytesAccess, "CALLER_PROVIDED_FIXTURE_BYTES");
  assert.equal(artifact.counts.sourceReportRows, 4);
  assert.equal(artifact.counts.uniqueNativeReportIds, 3);
  assert.equal(artifact.counts.reusedNativeReportIdRows, 1);
  assert.equal(artifact.counts.selectedReportRows, 2);
  assert.equal(artifact.counts.explicitRobotTokenRows, 1);
  assert.equal(artifact.counts.guidedVehicleTokenRows, 1);
  assert.equal(artifact.counts.reportedHospitalizations, 1);
  assert.equal(artifact.counts.reportedAmputations, 1);
  assert.equal(artifact.boundary.causalExperienceUnits, 0);
  assert.equal(artifact.boundary.admittedEconomicLossRows, 0);
  assert.equal(artifact.boundary.permitsPrice, false);
  assert.equal(artifact.rightsBoundary.reuseOrTrainingRights, "NOT_ESTABLISHED");
  assert.equal(artifact.source.frozenProfileMatched, false);
  const serialized = JSON.stringify(artifact);
  for (const secret of ["SECRET-UPA", "Secret Employer", "Secret Street", "Secret City",
    "SECRET-INSPECTION", "maintenance employee", "37.1", "-122.1", "99999"]) {
    assert.equal(serialized.includes(secret), false, `${secret} must not persist`);
  }
  const standalone = verifyOshaSirRobotConsequenceBook(artifact);
  assert.equal(standalone.ok, true);
  assert.equal(standalone.sourceArtifactsReverified, false);
});

test("OSHA single-entry ZIP is replayed and corrupt bytes fail", () => {
  const csv = fixtureCsv();
  const zip = storedZip("fixture.csv", csv);
  assert.deepEqual(extractSingleCsvFromZip(zip).csvBytes, csv);
  const artifact = buildOshaSirRobotConsequenceBookFromZip(zip, {
    generatedAt: "2026-08-21T00:00:00.000Z",
  });
  const full = verifyOshaSirRobotConsequenceBookFromZip(artifact, zip);
  assert.equal(full.ok, true);
  assert.equal(full.inputBytesReproduced, true);
  assert.equal(full.sourceArtifactsReverified, false);
  assert.equal(full.officialFrozenSourceReproduced, false);
  assert.equal(full.verificationLevel, "CALLER_ASSERTED_FIXTURE_BYTES_REPRODUCED");
  const corrupt = Buffer.from(zip); corrupt[60] ^= 1;
  assert.throws(() => extractSingleCsvFromZip(corrupt), /ZIP_ENTRY_INTEGRITY_INVALID/);
  assert.throws(() => buildOshaSirRobotConsequenceBookFromZip(zip, {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceArchiveHash: OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.archiveSha256,
    sourceArchiveBytes: OSHA_SIR_ROBOT_FROZEN_SOURCE_20260821.archiveBytes,
  }), /BUILD_OPTIONS_INVALID/);
});

test("OSHA artifact cannot be resealed into loss, causality, recovery, or authority", () => {
  const csv = fixtureCsv();
  const artifact = adaptOshaSirRobotConsequenceCsv(csv, {
    sourceArchiveHash: sha256(Buffer.from("fixture archive")), sourceArchiveBytes: 15,
    generatedAt: "2026-08-21T00:00:00.000Z",
  });
  for (const mutate of [
    (copy) => { copy.authority = "PRICE"; },
    (copy) => { copy.boundary.causalExperienceUnits = 1; },
    (copy) => { copy.boundary.admittedEconomicLossRows = 1; },
    (copy) => { copy.boundary.permitsPrice = true; },
    (copy) => { copy.projections[0].lossDollars = 1_000_000; },
    (copy) => { copy.projections[0].reportedConsequences.recoveryOrLongTermOutcomeObserved = true; },
    (copy) => { copy.rightsBoundary.reuseOrTrainingRights = "GRANTED"; },
    (copy) => { copy.source.publisher = "ATTACKER_PUBLISHER"; },
    (copy) => { copy.source.officialPageUrl = "https://attacker.invalid"; },
    (copy) => { copy.source.sourceUrl = "https://attacker.invalid/source.zip"; },
    (copy) => { copy.source.dashboardCoverage.through = "2099-12-31"; },
    (copy) => { copy.source.coverageBoundary = "GLOBAL_COMPLETE"; },
    (copy) => { copy.counts.selectedReportRows = 9_999; },
    (copy) => { copy.counts.reportedHospitalizations = 9_999; },
  ]) {
    const copy = structuredClone(artifact); mutate(copy); reseal(copy);
    assert.equal(verifyOshaSirRobotConsequenceBook(copy).ok, false);
  }
});

test("OSHA shaped fixture cannot be resealed into the official origin profile", () => {
  const artifact = adaptOshaSirRobotConsequenceCsv(fixtureCsv(), {
    sourceArchiveHash: sha256(Buffer.from("fixture archive")), sourceArchiveBytes: 15,
    generatedAt: "2026-08-21T00:00:00.000Z",
  });
  const promoted = structuredClone(artifact);
  Object.assign(promoted.source, {
    sourceId: "OSHA_SEVERE_INJURY_REPORTS_ROBOT_MENTION",
    sourceTrustClass: "OFFICIAL_OSHA_FROZEN_SOURCE_REPLAY",
    officialPageUrl: "https://www.osha.gov/severe-injury-reports",
    sourceUrl: "https://www.osha.gov/sites/default/files/January2015toNovember2025.zip",
    csvName: "January2015toNovember2025.csv",
    frozenProfileMatched: true,
    officialFrozenSourceVerified: true,
    sourceArtifactsReverified: true,
    dashboardCoverage: { from: "2015-01-01", through: "2025-11-30" },
    publisher: "US_OCCUPATIONAL_SAFETY_AND_HEALTH_ADMINISTRATION",
    reportingBasis: "EMPLOYER_SEVERE_INJURY_REPORTS_UNDER_29_CFR_1904_39",
    coverageBoundary: "FEDERAL_OSHA_JURISDICTION_NO_FATALITIES_STATE_PLAN_STATES_EXCLUDED",
  });
  promoted.evidenceOntology = {
    environmentReality: ["ORGANIC", "REAL_PHYSICAL"],
    empiricalStatus: "EMPIRICAL_RECORDED",
    observationOrigin: "PUBLISHER_REGULATORY_INCIDENT_REPORT",
    affectedPartyReportClass: "EMPLOYER_REPORT_ABOUT_AFFECTED_WORKER",
    authorityLevels: ["SELF_REPORTED", "PUBLISHER_DECLARED", "SOURCE_REPLAYED"],
    humanReviewEstablished: false,
    independentObservationEstablished: false,
    formalAdjudicationEstablished: false,
  };
  promoted.rightsBoundary.sourceBytesAccess = "OFFICIAL_PUBLIC_DOWNLOAD";
  promoted.rightsBoundary.reportTextRights
    = "NOT_RETAINED_IN_DERIVED_ARTIFACT_RIGHTS_NOT_GRANTED_BY_ADAPTER";
  promoted.rightsBoundary.consentOrCollectionAuthority
    = "REGULATORY_REPORTING_BASIS_RECORDED_NOT_AFFECTED_PARTY_CONSENT";
  promoted.stewardshipUse.admitted = ["DESCRIPTIVE_COMPOSITION", "FACTOR_SCHEMA_CANDIDATES",
    "CONSEQUENCE_CHANNEL_DISCOVERY", "AFFECTED_PARTY_CLASS_DISCOVERY"];
  promoted.stewardshipUse.nextObservationNeed
    = "PROSPECTIVE_OWNER_BOUND_RUN_PLUS_AFFECTED_PARTY_REPORT_PLUS_DELAYED_RECOVERY_CHECK";
  for (const row of promoted.projections) {
    row.reportedConsequences.reportingBasis = "EMPLOYER_SUBMISSION_PUBLISHED_BY_OSHA";
    row.reportedConsequences.affectedPartyClass = "WORKER";
  }
  reseal(promoted);
  assert.equal(verifyOshaSirRobotConsequenceBook(promoted).ok, false);
});

test("consequence snapshot diff forms a review-only ingestion flywheel", () => {
  const beforeCsv = fixtureCsv();
  const afterCsv = Buffer.from(beforeCsv.toString("utf8")
    .replace("during setup.", "during setup and maintenance."));
  const previous = adaptOshaSirRobotConsequenceCsv(beforeCsv, {
    sourceArchiveHash: sha256(Buffer.from("before archive")), sourceArchiveBytes: 14,
    generatedAt: "2026-08-20T00:00:00.000Z",
  });
  const current = adaptOshaSirRobotConsequenceCsv(afterCsv, {
    sourceArchiveHash: sha256(Buffer.from("current archive")), sourceArchiveBytes: 15,
    generatedAt: "2026-08-21T00:00:00.000Z",
  });
  const diff = buildRealityConsequenceEvidenceDiff(previous, current);
  assert.deepEqual(diff.changes.counts, { added: 0, removed: 0, changed: 1, unchanged: 1 });
  assert.equal(diff.disposition, "SOURCE_DISCOVERY_AND_TAXONOMY_REVIEW_ONLY");
  assert.equal(diff.automaticPromotion, false);
  assert.equal(diff.boundary.automaticTraining, false);
  assert.equal(verifyRealityConsequenceEvidenceDiff(diff, previous, current).ok, true);
});
