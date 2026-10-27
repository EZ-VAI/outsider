import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildFdaMaudeOutcomeSensingFromBytes,
  buildFdaMaudeOutcomeSensingFromSourceDirectory,
  FDA_MAUDE_BASE_COLUMNS,
  FDA_MAUDE_DEVICE_COLUMNS,
  FDA_MAUDE_FROZEN_SOURCE_20260821,
  verifyFdaMaudeOutcomeSensing,
  verifyFdaMaudeOutcomeSensingWithSource,
} from "../src/outsider-fda-maude-outcome-sensing.js";

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function zip(name, content) {
  const source = Buffer.from(content, "latin1");
  const compressed = deflateRawSync(source);
  const filename = Buffer.from(name);
  const crc = crc32(source);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(source.length, 22); local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(source.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const centralOffset = local.length + filename.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12); end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, filename, compressed, central, filename, end]);
}

function row(columns, values) {
  const fields = Array(columns.length).fill("");
  for (const [name, value] of Object.entries(values)) fields[columns.indexOf(name)] = value;
  return fields.join("|");
}

function fixture() {
  const baseHeader = FDA_MAUDE_BASE_COLUMNS.join("|");
  const deviceHeader = FDA_MAUDE_DEVICE_COLUMNS.join("|");
  const baseAdd = [baseHeader,
    row(FDA_MAUDE_BASE_COLUMNS, { MDR_REPORT_KEY: "1", REPORT_NUMBER: "A",
      REPORT_SOURCE_CODE: "M", MANUFACTURER_LINK_FLAG_: "Y", DATE_REPORT: "08/01/2026",
      EVENT_TYPE: "M", TYPE_OF_REPORT: "I", DATE_CHANGED: "08/01/2026",
      MANUFACTURER_CONTACT_STREET_1: "line one\nline two", SUMMARY_REPORT: "N" }),
    row(FDA_MAUDE_BASE_COLUMNS, { MDR_REPORT_KEY: "2", REPORT_NUMBER: "B",
      REPORT_SOURCE_CODE: "D", EVENT_TYPE: "IN", TYPE_OF_REPORT: "I",
      DATE_REPORT: "08/02/2026", DATE_CHANGED: "08/02/2026", SUMMARY_REPORT: "N" }), ""].join("\r\n");
  const baseChange = [baseHeader,
    row(FDA_MAUDE_BASE_COLUMNS, { MDR_REPORT_KEY: "1", REPORT_NUMBER: "A",
      REPORT_SOURCE_CODE: "M", MANUFACTURER_LINK_FLAG_: "Y", DATE_REPORT: "08/03/2026",
      EVENT_TYPE: "IN", TYPE_OF_REPORT: "I,F", DATE_CHANGED: "08/03/2026",
      SUPPL_DATES_FDA_RECEIVED: "08/03/2026", SUMMARY_REPORT: "N" }),
    row(FDA_MAUDE_BASE_COLUMNS, { MDR_REPORT_KEY: "3", REPORT_NUMBER: "C",
      REPORT_SOURCE_CODE: "U", EVENT_TYPE: "D", TYPE_OF_REPORT: "I",
      DATE_REPORT: "08/03/2026", DATE_CHANGED: "08/03/2026", SUMMARY_REPORT: "N" }), ""].join("\r\n");
  const deviceAdd = [deviceHeader,
    row(FDA_MAUDE_DEVICE_COLUMNS, { MDR_REPORT_KEY: "1", DEVICE_EVENT_KEY: "10",
      DEVICE_SEQUENCE_NO: "1", DEVICE_REPORT_PRODUCT_CODE: "AAA", "UDI-DI": "DI1" }),
    row(FDA_MAUDE_DEVICE_COLUMNS, { MDR_REPORT_KEY: "2", DEVICE_EVENT_KEY: "20",
      DEVICE_SEQUENCE_NO: "1", DEVICE_REPORT_PRODUCT_CODE: "BBB" }), ""].join("\r\n");
  const deviceChange = [deviceHeader,
    row(FDA_MAUDE_DEVICE_COLUMNS, { MDR_REPORT_KEY: "1", DEVICE_EVENT_KEY: "10",
      DEVICE_SEQUENCE_NO: "1", DEVICE_REPORT_PRODUCT_CODE: "AAA", "UDI-DI": "DI1" }),
    row(FDA_MAUDE_DEVICE_COLUMNS, { MDR_REPORT_KEY: "3", DEVICE_EVENT_KEY: "30",
      DEVICE_SEQUENCE_NO: "1", DEVICE_REPORT_PRODUCT_CODE: "CCC" }), ""].join("\r\n");
  return {
    "mdr-data-files-20260821.html": Buffer.from("All record types are linked by the MDR REPORT KEY MANUFACTURER LINK FLAG New MAUDE Base records for the current month Base data updates: changes to existing Base data"),
    "maude-about-20260821.html": Buffer.from("not intended to be used either to evaluate rates of adverse events; lack of information about frequency of device use; does not necessarily demonstrate that the device caused"),
    "mdrfoiadd.zip": zip("fixture-base-add.txt", baseAdd),
    "mdrfoichange.zip": zip("fixture-base-change.txt", baseChange),
    "deviceadd.zip": zip("fixture-device-add.txt", deviceAdd),
    "devicechange.zip": zip("fixture-device-change.txt", deviceChange),
  };
}

function reseal(artifact) {
  const { artifactHash: _old, ...withoutHash } = artifact;
  return { ...withoutHash, artifactHash: `sha256:${createHash("sha256")
    .update(canonicalizeStrict(withoutHash)).digest("hex")}` };
}

function writeFixture(files) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-fda-maude-"));
  for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(directory, name), bytes);
  return directory;
}

test("FDA MAUDE fixture applies change precedence but never calls reports incidents", async () => {
  const artifact = await buildFdaMaudeOutcomeSensingFromBytes(fixture(),
    { generatedAt: "2026-08-21T10:30:00.000Z" });
  assert.equal(artifact.source.profileMatchedAtBuild, false);
  assert.equal(artifact.revisionAccounting.baseCrossStreamOverlap, 1);
  assert.equal(artifact.revisionAccounting.effectiveMdrReportKeys, 3);
  assert.equal(artifact.revisionAccounting.reportsWithFollowupEvidence, 1);
  assert.deepEqual(artifact.outcomeSensing.reportedEventTypeCounts, { D: 1, IN: 2 });
  assert.equal(artifact.ontology.reportIsIncident, false);
  assert.equal(artifact.stageProgress.rateCalibrationAdmitted, false);
  assert.equal(artifact.rights.automaticTrainingRightConcluded, false);
  assert.equal(artifact.privacy.deterministicCaseFingerprintsArePseudonymousAndPotentiallyLinkable,
    true);
  assert.equal(artifact.privacy.deterministicCaseFingerprintsAreIrreversiblyAnonymous, false);
});

test("FDA MAUDE standalone verification is structure-only even after caller reseal", async () => {
  const artifact = await buildFdaMaudeOutcomeSensingFromBytes(fixture());
  const forged = reseal({ ...artifact, source: { ...artifact.source,
    profileMatchedAtBuild: true, publisher: "UNITED_STATES_FOOD_AND_DRUG_ADMINISTRATION" } });
  const checked = verifyFdaMaudeOutcomeSensing(forged);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "STRUCTURE_ONLY");
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.decision, null);
});

test("FDA MAUDE full verifier rebuilds bytes and refuses a source-shaped fixture", async () => {
  const files = fixture(); const directory = writeFixture(files);
  const artifact = await buildFdaMaudeOutcomeSensingFromSourceDirectory(directory);
  const checked = await verifyFdaMaudeOutcomeSensingWithSource(artifact, directory);
  assert.equal(checked.ok, false);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_REPLAY_FAILED");
  assert.equal(checked.sourceArtifactsReverified, false);
});

test("FDA MAUDE rejects source substitution, authority mutation, and caller claims", async () => {
  const files = fixture();
  await assert.rejects(buildFdaMaudeOutcomeSensingFromBytes(files,
    { generatedAt: "2026-08-21T10:30:00.000Z", official: true }), /BUILD_ARGUMENTS_INVALID/);
  const artifact = await buildFdaMaudeOutcomeSensingFromBytes(files);
  const authorityMutation = reseal({ ...artifact, authority: { ...artifact.authority, PRICE: true } });
  assert.equal(verifyFdaMaudeOutcomeSensing(authorityMutation).ok, false);
  const directory = writeFixture(files);
  writeFileSync(path.join(directory, "mdr-data-files-20260821.html"), Buffer.from("substituted"));
  const full = await verifyFdaMaudeOutcomeSensingWithSource(artifact, directory);
  assert.equal(full.ok, false);
  assert.equal(full.sourceArtifactsReverified, false);
});

test("FDA MAUDE frozen profile has exact unique pins and no narrative source", () => {
  const files = FDA_MAUDE_FROZEN_SOURCE_20260821.files;
  assert.equal(new Set(files.map((file) => file.name)).size, files.length);
  assert.ok(files.every((file) => /^sha256:[a-f0-9]{64}$/.test(file.sha256) && file.bytes > 0));
  assert.equal(files.some((file) => /text|patient/i.test(file.kind)), false);
});

test("FDA MAUDE directory replay rejects a symlinked source member", async () => {
  const directory = writeFixture(fixture());
  const target = path.join(directory, "mdr-data-files-20260821.html");
  unlinkSync(target); symlinkSync(path.join(directory, "maude-about-20260821.html"), target);
  await assert.rejects(buildFdaMaudeOutcomeSensingFromSourceDirectory(directory), /SOURCE_FILE_UNSAFE/);
});

const officialSource = path.resolve("artifacts/fda-maude-outcome-sensing-20260821/source");
const officialArtifact = path.resolve("artifacts/fda-maude-outcome-sensing-20260821/final-v2/outcome-sensing.json");
test("FDA MAUDE canonical local artifact fully replays when ignored sources are present",
  { skip: !(existsSync(officialSource) && existsSync(officialArtifact)), timeout: 60_000 }, async () => {
    const artifact = JSON.parse(readFileSync(officialArtifact, "utf8"));
    const checked = await verifyFdaMaudeOutcomeSensingWithSource(artifact, officialSource);
    assert.equal(checked.ok, true);
    assert.equal(checked.sourceArtifactsReverified, true);
    assert.equal(checked.verificationLevel, "FULL_OFFICIAL_FDA_MAUDE_SOURCE_REPLAYED");
    assert.equal(checked.artifactHash,
      "sha256:450da676c54f9e8781cff0589618e5f8fbbbf66286c0b38316ae4eb95f643c73");
  });
