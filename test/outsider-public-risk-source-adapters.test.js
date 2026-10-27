import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  adaptNhtsaSgoAdsCsv,
  NHTSA_SGO_FROZEN_SOURCE_20260820,
  PUBLIC_RISK_SOURCE_CATALOG,
  verifyNhtsaSgoIncidentQuarantine,
} from "../src/outsider-public-risk-source-adapters.js";

const HEADERS = [
  "Report ID", "Report Version", "Reporting Entity", "Report Type",
  "Report Month", "Report Year", "Report Submission Date", "VIN", "Serial Number",
  "Automation System Engaged?", "Engagement Status", "Incident Date",
  "Incident Date - Unknown", "Latitude", "Longitude", "Address", "City", "State",
  "Zip Code", "Narrative", "Highest Injury Severity Alleged",
  "Any Air Bags Deployed?", "Was Any Vehicle Towed?", "Crash With",
];

function csvField(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function fixtureCsv() {
  const rows = [
    ["R-1", "1", "Entity A", "Initial", "July", "2026", "07/01/2026",
      "SECRET-VIN-OLD", "SERIAL-OLD", "Yes", "Verified Engaged", "06/01/2026",
      "No", "37.1", "-122.1", "10 Secret St", "Secret City", "CA", "99999",
      "old private narrative", "No Injuries Reported", "No", "No", "Passenger Car"],
    ["R-1", "2", "Entity A", "Updated", "July", "2026", "07/02/2026",
      "SECRET-VIN-LATEST", "SERIAL-LATEST", "Yes", "Verified Engaged", "06/01/2026",
      "No", "37.2", "-122.2", "11 Secret St", "Secret City", "CA", "99999",
      "latest, private narrative", "Serious Injury (Hospitalization)", "Yes", "Yes",
      "Passenger Car"],
    ["R-2", "1", "Entity B", "Initial", "July", "2026", "07/03/2026",
      "SECRET-VIN-2", "SERIAL-2", "No", "Not Engaged", "", "Yes", "", "",
      "", "", "", "", "private narrative 2", "Fatality", "No", "No", "Pedestrian"],
  ];
  return Buffer.from(`${HEADERS.join(",")}\n${rows.map((row) => (
    row.map(csvField).join(",")
  )).join("\n")}\n`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

test("NHTSA adapter latest-version dedups, privacy projects, and admits no loss/exposure", () => {
  const csv = fixtureCsv();
  const artifact = adaptNhtsaSgoAdsCsv(csv, {
    sourceObjectHash: sha256(csv),
    dataDictionaryHash: sha256(Buffer.from("test dictionary")),
    generatedAt: "2026-08-20T00:00:00.000Z",
  });
  assert.deepEqual(artifact.counts, {
    rawReportRows: 3,
    uniqueReportIds: 2,
    historicalOrDuplicateVersions: 1,
    reportingEntities: 2,
    projectedIncidentRows: 2,
    admittedExposureRows: 0,
    admittedLossRows: 0,
    externallyAdjudicatedRows: 0,
  });
  assert.equal(artifact.reports.find((row) => row.reportVersion === 2)
    .highestInjurySeverityAlleged, "Serious Injury (Hospitalization)");
  assert.equal(artifact.modelEntrance.decision,
    "ABSTAIN_INCIDENT_ONLY_NO_DENOMINATOR");
  assert.equal(artifact.modelEntrance.betaBinomialEligible, false);
  assert.equal(artifact.modelEntrance.tvarEligible, false);
  assert.equal(artifact.disposition.sourceClassExternallyVerified, false,
    "a self-matching fixture hash is not the pinned public source manifest");
  assert.equal(artifact.authority.permitsPricing, false);
  const serialized = JSON.stringify(artifact);
  for (const secret of ["SECRET-VIN", "SERIAL-", "private narrative", "Secret St",
    "Secret City", "37.2", "-122.2", "99999"]) {
    assert.equal(serialized.includes(secret), false, `${secret} must not persist`);
  }
  assert.equal(verifyNhtsaSgoIncidentQuarantine(artifact, csv).ok, true);
});

test("NHTSA artifact cannot be resealed into loss, exposure, or pricing evidence", () => {
  const csv = fixtureCsv();
  const artifact = adaptNhtsaSgoAdsCsv(csv, {
    sourceObjectHash: sha256(csv),
    dataDictionaryHash: sha256(Buffer.from("test dictionary")),
    generatedAt: "2026-08-20T00:00:00.000Z",
  });
  for (const mutate of [
    (copy) => { copy.counts.admittedLossRows = 1; },
    (copy) => { copy.counts.admittedExposureRows = 1; },
    (copy) => { copy.modelEntrance.price = 100; },
    (copy) => { copy.authority.permitsPricing = true; },
  ]) {
    const copy = structuredClone(artifact);
    mutate(copy);
    assert.equal(verifyNhtsaSgoIncidentQuarantine(copy, csv).ok, false);
  }
});

test("NHTSA adapter pins source bytes, official URL, and dictionary commitment", () => {
  const csv = fixtureCsv();
  const options = {
    sourceObjectHash: sha256(csv),
    dataDictionaryHash: sha256(Buffer.from("test dictionary")),
    generatedAt: "2026-08-20T00:00:00.000Z",
  };
  assert.throws(() => adaptNhtsaSgoAdsCsv(Buffer.concat([csv, Buffer.from("x")]), options),
    /SOURCE_OBJECT_HASH_INVALID/);
  assert.throws(() => adaptNhtsaSgoAdsCsv(csv, { ...options,
    sourceUrl: "https://example.com/not-official.csv" }), /SOURCE_URL_NOT_OFFICIAL_PIN/);
  assert.throws(() => adaptNhtsaSgoAdsCsv(csv, { ...options,
    dataDictionaryHash: "not-a-hash" }), /DATA_DICTIONARY_HASH_INVALID/);
});

test("public source catalog refuses automatic joins or actuarial admission", () => {
  assert.equal(PUBLIC_RISK_SOURCE_CATALOG.sources.length, 3);
  for (const source of PUBLIC_RISK_SOURCE_CATALOG.sources) {
    assert.equal(source.permitsAutomaticLossAdmission, false);
    assert.equal(source.permitsAutomaticExposureAdmission, false);
  }
  const nhtsa = PUBLIC_RISK_SOURCE_CATALOG.sources
    .find((source) => source.id === "NHTSA_SGO_ADS_CRASH_REPORTS");
  assert.equal(nhtsa.disposition, "INCIDENT_ONLY_NO_DENOMINATOR");
  assert.ok(nhtsa.caveats.includes("NO_VEHICLE_COUNT_OR_MILEAGE_EXPOSURE_DENOMINATOR"));
  assert.match(NHTSA_SGO_FROZEN_SOURCE_20260820.sourceObjectHash,
    /^sha256:[a-f0-9]{64}$/);
});
