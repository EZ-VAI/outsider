import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync,
  symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildClinicalTrialsPostedResultsEvidenceFromBytes,
  buildClinicalTrialsPostedResultsEvidenceFromSourceDirectory,
  CLINICALTRIALS_API_VERSION,
  CLINICALTRIALS_DATA_TIMESTAMP,
  CLINICALTRIALS_FIXED_FIELDS,
  CLINICALTRIALS_FROZEN_AT,
  CLINICALTRIALS_FROZEN_SOURCE_20260822,
  CLINICALTRIALS_PAGE_SIZE,
  CLINICALTRIALS_POSTED_RESULTS_EVIDENCE_SCHEMA,
  CLINICALTRIALS_QUERY_TERM,
  CLINICALTRIALS_RESULTS_FIRST_POSTED_WINDOW,
  CLINICALTRIALS_SORT,
  clinicalTrialsExpectedAcquisitionManifest,
  clinicalTrialsInitialRequestUrl,
  verifyClinicalTrialsPostedResultsEvidence,
  verifyClinicalTrialsPostedResultsEvidenceWithSource,
} from "../src/outsider-clinicaltrials-posted-results-evidence.js";

const SOURCE = path.resolve("artifacts/clinicaltrials-posted-results-evidence-20260822/source");
const ARTIFACT = path.resolve(
  "artifacts/clinicaltrials-posted-results-evidence-20260822/final-v3/evidence.json",
);
const READY = existsSync(SOURCE) && existsSync(ARTIFACT);

function json(value) { return Buffer.from(JSON.stringify(value)); }
function node(name, piece, sourceType, type, children) {
  const value = { name, piece, sourceType, type };
  if (children) value.children = children;
  return value;
}
function fixtureMetadata() {
  const used = new Set([
    "NCTId", "StudyFirstPostDate", "ResultsFirstPostDate", "HasResults",
    "LeadSponsorName", "LeadSponsorClass",
    "ParticipantFlowModule", "BaselineCharacteristicsModule",
    "OutcomeMeasuresModule", "AdverseEventsModule",
  ]);
  const metadata = [
    node("protocolSection", "FixtureProtocolSection", "STRUCT", "ProtocolSection", [
      node("identificationModule", "FixtureIdentificationModule", "STRUCT", "IdentificationModule", [
        node("nctId", "NCTId", "TEXT", "nct"),
      ]),
      node("statusModule", "FixtureStatusModule", "STRUCT", "StatusModule", [
        node("studyFirstPostDateStruct", "FixtureStudyFirstPostDateStruct", "STRUCT", "DateStruct", [
          node("date", "StudyFirstPostDate", "DATE", "NormalizedDate"),
        ]),
        node("resultsFirstPostDateStruct", "FixtureResultsFirstPostDateStruct", "STRUCT", "DateStruct", [
          node("date", "ResultsFirstPostDate", "DATE", "NormalizedDate"),
        ]),
      ]),
      node("sponsorCollaboratorsModule", "FixtureSponsorCollaboratorsModule", "STRUCT",
        "SponsorCollaboratorsModule", [
          node("leadSponsor", "FixtureLeadSponsor", "STRUCT", "Sponsor", [
            node("name", "LeadSponsorName", "TEXT", "text"),
            node("class", "LeadSponsorClass", "ENUM", "SponsorClass"),
          ]),
        ]),
    ]),
    node("resultsSection", "FixtureResultsSection", "STRUCT", "ResultsSection", [
      node("participantFlowModule", "ParticipantFlowModule", "STRUCT", "ParticipantFlowModule"),
      node("baselineCharacteristicsModule", "BaselineCharacteristicsModule", "STRUCT",
        "BaselineCharacteristicsModule"),
      node("outcomeMeasuresModule", "OutcomeMeasuresModule", "STRUCT", "OutcomeMeasuresModule"),
      node("adverseEventsModule", "AdverseEventsModule", "STRUCT", "AdverseEventsModule"),
    ]),
    node("hasResults", "HasResults", "FUNC Present(ResultsFirstSubmitDate)", "boolean"),
  ];
  let index = 0;
  for (const piece of CLINICALTRIALS_FIXED_FIELDS) {
    if (!used.has(piece)) {
      metadata.push(node(`unusedProjectedField${index}`, piece, "TEXT", "text"));
      index += 1;
    }
  }
  return metadata;
}
function fixtureStudy(index) {
  return {
    protocolSection: {
      identificationModule: { nctId: `NCT${String(index).padStart(8, "0")}` },
      statusModule: {
        studyFirstPostDateStruct: { date: `2020-01-${String(index).padStart(2, "0")}` },
        resultsFirstPostDateStruct: { date: "2026-07-01" },
      },
      sponsorCollaboratorsModule: {
        leadSponsor: { name: "Adebola Adegboyega", class: "OTHER" },
      },
    },
    resultsSection: {},
    hasResults: true,
  };
}
function fixtureFiles() {
  const files = {
    "api-version.json": json({
      apiVersion: CLINICALTRIALS_API_VERSION,
      dataTimestamp: CLINICALTRIALS_DATA_TIMESTAMP,
    }),
    "studies-metadata.json": json(fixtureMetadata()),
    "studies-search-areas.json": json([{ name: "Study", areas: [] }]),
  };
  const pages = CLINICALTRIALS_FROZEN_SOURCE_20260822.files
    .filter((file) => file.kind === "FIXED_QUERY_PAGE");
  let nextStudy = 1;
  for (const expected of pages) {
    const studies = Array.from({ length: expected.expectedRows }, () => fixtureStudy(nextStudy++));
    const page = { studies };
    if (expected.page === 1) page.totalCount = 18;
    if (expected.expectedNextPageToken !== null) page.nextPageToken = expected.expectedNextPageToken;
    // Preserve the official response key profile; object order is immaterial to the parser.
    const ordered = expected.page === 1
      ? { totalCount: page.totalCount, studies: page.studies, nextPageToken: page.nextPageToken }
      : expected.expectedNextPageToken !== null
        ? { studies: page.studies, nextPageToken: page.nextPageToken }
        : { studies: page.studies };
    files[expected.name] = json(ordered);
  }
  return files;
}
function cloneFiles(files) {
  return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, Buffer.from(bytes)]));
}
function reseal(artifact) {
  const { artifactHash: _old, ...withoutHash } = artifact;
  const hash = `sha256:${createHash("sha256").update(canonicalizeStrict({
    domain: CLINICALTRIALS_POSTED_RESULTS_EVIDENCE_SCHEMA,
    value: withoutHash,
  })).digest("hex")}`;
  return { ...withoutHash, artifactHash: hash };
}

test("ClinicalTrials source contract freezes a complete deterministic API population", () => {
  assert.equal(CLINICALTRIALS_API_VERSION, "2.0.5");
  assert.equal(CLINICALTRIALS_DATA_TIMESTAMP, "2026-08-21T09:00:05");
  assert.deepEqual(CLINICALTRIALS_RESULTS_FIRST_POSTED_WINDOW,
    { from: "2026-07-01", through: "2026-07-01" });
  assert.equal(CLINICALTRIALS_QUERY_TERM,
    "AREA[ResultsFirstPostDate]RANGE[2026-07-01, 2026-07-01]");
  assert.equal(CLINICALTRIALS_SORT, "StudyFirstPostDate:asc");
  assert.equal(CLINICALTRIALS_PAGE_SIZE, 7);
  assert.match(clinicalTrialsInitialRequestUrl(), /^https:\/\/clinicaltrials\.gov\/api\/v2\/studies\?/u);
  const pages = CLINICALTRIALS_FROZEN_SOURCE_20260822.files
    .filter((file) => file.kind === "FIXED_QUERY_PAGE");
  assert.deepEqual(pages.map((page) => page.expectedRows), [7, 7, 4]);
  assert.equal(pages.reduce((total, page) => total + page.expectedRows, 0), 18);
  assert.equal(new Set(CLINICALTRIALS_FROZEN_SOURCE_20260822.files
    .map((file) => file.name)).size, 6);
  assert.ok(CLINICALTRIALS_FROZEN_SOURCE_20260822.files.every((file) => (
    file.url.startsWith("https://clinicaltrials.gov/")
      && /^sha256:[a-f0-9]{64}$/u.test(file.sha256) && file.bytes > 0
  )));
});

test("fixed field projection excludes direct contacts, locations, documents, and IPD URLs", () => {
  const fields = CLINICALTRIALS_FIXED_FIELDS.join(",");
  assert.doesNotMatch(fields,
    /(?:Contact|EMail|Phone|Location(?:Facility|City|State|Country|Zip|GeoPoint)|Investigator|OfficialTitle|Document|IPDSharing)/u);
  assert.ok(fields.includes("ParticipantFlowModule"));
  assert.ok(fields.includes("OutcomeMeasuresModule"));
  assert.ok(fields.includes("AdverseEventsModule"));
});

test("synthetic pages remain untrusted even when they obey the frozen query shape", () => {
  const artifact = buildClinicalTrialsPostedResultsEvidenceFromBytes(fixtureFiles());
  assert.equal(artifact.source.profileMatchedAtBuild, false);
  assert.equal(artifact.source.sourceReality, "UNATTESTED_CALLER_BYTES");
  assert.equal(artifact.population.observedStudyRecords, 18);
  assert.equal(artifact.population.completeClosedQueryWindow, true);
  assert.equal(artifact.calibrationReference.decision, "REJECT_UNATTESTED_FIXTURE");
  assert.equal(artifact.calibrationReference.admittedStudyRecords, 0);
  assert.equal(artifact.trainingCandidate.admittedTrainingRows, 0);
  assert.equal(artifact.authority.PRICE, false);
  assert.doesNotThrow(() => verifyClinicalTrialsPostedResultsEvidence({
    schema: CLINICALTRIALS_POSTED_RESULTS_EVIDENCE_SCHEMA,
    nonFiniteAttack: Number.NaN,
    artifactHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  }));
  assert.equal(verifyClinicalTrialsPostedResultsEvidence({
    schema: CLINICALTRIALS_POSTED_RESULTS_EVIDENCE_SCHEMA,
    nonFiniteAttack: Number.NaN,
    artifactHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  }).ok, false);
});

test("unknown projected fields and pagination changes are rejected", () => {
  const unknown = cloneFiles(fixtureFiles());
  const first = JSON.parse(unknown["studies-page-001.json"].toString("utf8"));
  first.studies[0].unexpectedScientificTruth = true;
  unknown["studies-page-001.json"] = json(first);
  assert.throws(() => buildClinicalTrialsPostedResultsEvidenceFromBytes(unknown),
    /UNKNOWN_FIELD:unexpectedScientificTruth/u);

  const pagination = cloneFiles(fixtureFiles());
  const page = JSON.parse(pagination["studies-page-001.json"].toString("utf8"));
  page.nextPageToken = "attacker-token";
  pagination["studies-page-001.json"] = json(page);
  assert.throws(() => buildClinicalTrialsPostedResultsEvidenceFromBytes(pagination),
    /PAGINATION_TOKEN_INVALID/u);

  const contactValue = cloneFiles(fixtureFiles());
  const contactPage = JSON.parse(contactValue["studies-page-001.json"].toString("utf8"));
  contactPage.studies[0].protocolSection.sponsorCollaboratorsModule.leadSponsor.name
    = "person@example.org";
  contactValue["studies-page-001.json"] = json(contactPage);
  assert.throws(() => buildClinicalTrialsPostedResultsEvidenceFromBytes(contactValue),
    /PRIVACY_CONTACT_VALUE_FORBIDDEN/u);
});

test("public individual sponsor names are stripped from the derived projection and its commitments", () => {
  const firstFiles = fixtureFiles();
  const first = buildClinicalTrialsPostedResultsEvidenceFromBytes(firstFiles);
  const firstText = canonicalizeStrict(first);
  assert.doesNotMatch(firstText, /Adebola Adegboyega/u);
  assert.equal(first.realPostedExperience.records[0].registration.leadSponsorName, undefined);
  assert.equal(first.realPostedExperience.records[0].registration.leadSponsorClass, "OTHER");
  assert.equal(first.quality.sponsorNamesPersistedInDerivedArtifact, false);
  assert.equal(first.quality.personNamesPersistedInDerivedArtifact, false);

  const changedFiles = cloneFiles(firstFiles);
  const page = JSON.parse(changedFiles["studies-page-001.json"].toString("utf8"));
  page.studies[0].protocolSection.sponsorCollaboratorsModule.leadSponsor.name = "Another Public Person";
  changedFiles["studies-page-001.json"] = json(page);
  const changed = buildClinicalTrialsPostedResultsEvidenceFromBytes(changedFiles);
  assert.equal(
    changed.realPostedExperience.records[0].studyRecordSemanticCommitment,
    first.realPostedExperience.records[0].studyRecordSemanticCommitment,
  );
  assert.doesNotMatch(canonicalizeStrict(changed), /Another Public Person/u);
});

test("population membership, order, duplicate IDs, and time lock fail closed", () => {
  const outside = cloneFiles(fixtureFiles());
  const first = JSON.parse(outside["studies-page-001.json"].toString("utf8"));
  first.studies[0].protocolSection.statusModule.resultsFirstPostDateStruct.date = "2026-07-02";
  outside["studies-page-001.json"] = json(first);
  assert.throws(() => buildClinicalTrialsPostedResultsEvidenceFromBytes(outside),
    /POPULATION_MEMBERSHIP_INVALID/u);

  const duplicate = cloneFiles(fixtureFiles());
  const second = JSON.parse(duplicate["studies-page-002.json"].toString("utf8"));
  second.studies[0].protocolSection.identificationModule.nctId = "NCT00000001";
  duplicate["studies-page-002.json"] = json(second);
  assert.throws(() => buildClinicalTrialsPostedResultsEvidenceFromBytes(duplicate),
    /NCT_ID_INVALID/u);

  assert.throws(() => buildClinicalTrialsPostedResultsEvidenceFromBytes(fixtureFiles(),
    { generatedAt: "2026-08-22T01:20:01.000Z" }), /NOT_FROZEN_SNAPSHOT/u);
  assert.doesNotThrow(() => buildClinicalTrialsPostedResultsEvidenceFromBytes(fixtureFiles(),
    { generatedAt: CLINICALTRIALS_FROZEN_AT }));
});

test("acquisition manifest binds every request, token, hash, and version", () => {
  const manifest = clinicalTrialsExpectedAcquisitionManifest();
  assert.equal(manifest.apiVersion, CLINICALTRIALS_API_VERSION);
  assert.equal(manifest.dataTimestamp, CLINICALTRIALS_DATA_TIMESTAMP);
  assert.equal(manifest.query.fields.length, CLINICALTRIALS_FIXED_FIELDS.length);
  assert.equal(manifest.objects.length, 6);
  assert.equal(manifest.transportAttested, false);
  assert.deepEqual(manifest.objects.filter((object) => object.page !== null)
    .map((object) => [object.page, object.requestPageToken, object.expectedNextPageToken]), [
    [1, null, CLINICALTRIALS_FROZEN_SOURCE_20260822.files[3].expectedNextPageToken],
    [2, CLINICALTRIALS_FROZEN_SOURCE_20260822.files[4].requestPageToken,
      CLINICALTRIALS_FROZEN_SOURCE_20260822.files[4].expectedNextPageToken],
    [3, CLINICALTRIALS_FROZEN_SOURCE_20260822.files[5].requestPageToken, null],
  ]);
});

test("canonical official snapshot preserves real posted experience without escalation",
  { skip: !READY }, () => {
    const artifact = buildClinicalTrialsPostedResultsEvidenceFromSourceDirectory(SOURCE);
    assert.equal(artifact.source.profileMatchedAtBuild, true);
    assert.equal(artifact.source.sourceReality,
      "REAL_OFFICIAL_CLINICALTRIALS_GOV_EXACT_API_CAPTURE");
    assert.equal(artifact.population.observedStudyRecords, 18);
    assert.equal(artifact.realPostedExperience.studiesWithPostedOutcomeMeasures, 18);
    assert.equal(artifact.realPostedExperience.studiesWithPostedAdverseEvents, 18);
    assert.equal(artifact.realPostedExperience.totalPostedOutcomeMeasureRows, 242);
    assert.equal(artifact.realPostedExperience.totalPostedSeriousAdverseEventTermRows, 409);
    assert.equal(artifact.realPostedExperience.totalPostedOtherAdverseEventTermRows, 514);
    assert.deepEqual(artifact.realPostedExperience.studyTypeCounts, { INTERVENTIONAL: 18 });
    assert.deepEqual(artifact.realPostedExperience.overallStatusCounts,
      { ACTIVE_NOT_RECRUITING: 2, COMPLETED: 14, TERMINATED: 2 });
    assert.equal(artifact.quality.dataAreRealPostedRegistryAndAggregateResultRecords, true);
    assert.equal(artifact.quality.privacyProjectionValidatedAgainstDirectContactKeysAndValues, true);
    assert.equal(artifact.quality.projectedDirectContactLikeValuesDetected, false);
    assert.equal(artifact.quality.sponsorNamesPersistedInDerivedArtifact, false);
    assert.equal(artifact.quality.personNamesPersistedInDerivedArtifact, false);
    assert.equal(artifact.quality.nlmQcEstablishesScientificAccuracy, false);
    assert.equal(artifact.ontology.adverseEventTemporalOccurrenceProvesInterventionCausality, false);
    assert.equal(artifact.rights.automaticBehaviorModelTrainingRightConcluded, false);
    assert.equal(artifact.rights.rightsTermsSourceReplayed, false);
    assert.equal(artifact.rights.rightsDetermination,
      "NOT_ESTABLISHED_URL_ONLY_NOT_REPLAYED");
    assert.equal(artifact.rights.attributionRequirementEstablishedByThisArtifact, false);
    assert.equal(artifact.calibrationReference.independentAdjudicationEstablished, false);
    assert.equal(artifact.stageProgress.stage2TargetExposureLossPairs, 0);
    assert.equal(artifact.readyToTakeResponsibility, false);
  });

test("standalone fixed projection and full source replay have distinct evidence strength",
  { skip: !READY }, () => {
    const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
    const standalone = verifyClinicalTrialsPostedResultsEvidence(artifact);
    assert.equal(standalone.ok, true);
    assert.equal(standalone.verificationLevel,
      "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION");
    assert.equal(standalone.realPostedExperienceAdmissionEstablished, false);
    const full = verifyClinicalTrialsPostedResultsEvidenceWithSource(artifact, SOURCE);
    assert.equal(full.ok, true);
    assert.equal(full.verificationLevel,
      "FULL_EXACT_OFFICIAL_DATA_API_SOURCE_REPLAY_RIGHTS_TERMS_NOT_REPLAYED");
    assert.equal(full.dataApiSourceProfileReproduced, true);
    assert.equal(full.rightsTermsSourceReplayed, false);
    assert.equal(full.realPostedExperienceAdmissionEstablished, true);
    assert.equal(full.independentOutcomeTruthEstablished, false);
    assert.equal(full.trainingAllowed, false);
  });

test("coherently resealed authority, causality, rights, and prerequisite attacks fail",
  { skip: !READY }, () => {
    const artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
    const attacks = [
      reseal({ ...artifact, authority: { ...artifact.authority, PRICE: true } }),
      reseal({ ...artifact, readyToTakeResponsibility: true }),
      reseal({ ...artifact, ontology: { ...artifact.ontology,
        adverseEventTemporalOccurrenceProvesInterventionCausality: true } }),
      reseal({ ...artifact, rights: { ...artifact.rights,
        automaticBehaviorModelTrainingRightConcluded: true } }),
      reseal({ ...artifact, rights: { ...artifact.rights,
        rightsTermsSourceReplayed: true,
        rightsDetermination: "ESTABLISHED" } }),
      reseal({ ...artifact, calibrationReference: { ...artifact.calibrationReference,
        independentAdjudicationEstablished: true } }),
      reseal({ ...artifact, calibrationReference: { ...artifact.calibrationReference,
        requiredBeforeTargetUse: artifact.calibrationReference.requiredBeforeTargetUse.slice(1) } }),
      reseal({ ...artifact, injectedField: "UNKNOWN" }),
    ];
    assert.ok(attacks.every((attack) => !verifyClinicalTrialsPostedResultsEvidence(attack).ok));
    const replay = verifyClinicalTrialsPostedResultsEvidenceWithSource(attacks[0], SOURCE);
    assert.equal(replay.ok, false);
    assert.equal(replay.sourceProfileReproduced, true);
    assert.equal(replay.candidateArtifactExactlyRebuilt, false);
  });

test("source directory rejects symlinks and extra members", { skip: !READY }, () => {
  const temp = mkdtempSync(path.join(tmpdir(), "outsider-clinicaltrials-source-"));
  const copy = path.join(temp, "source");
  mkdirSync(copy);
  try {
    for (const name of [...CLINICALTRIALS_FROZEN_SOURCE_20260822.files.map((file) => file.name),
      "acquisition.json"]) copyFileSync(path.join(SOURCE, name), path.join(copy, name));
    const target = path.join(copy, "api-version.json");
    unlinkSync(target);
    symlinkSync(path.join(SOURCE, "api-version.json"), target);
    assert.throws(() => buildClinicalTrialsPostedResultsEvidenceFromSourceDirectory(copy),
      /SOURCE_FILE_UNSAFE/u);
    unlinkSync(target);
    copyFileSync(path.join(SOURCE, "api-version.json"), target);
    writeFileSync(path.join(copy, "extra.json"), "{}\n");
    assert.throws(() => buildClinicalTrialsPostedResultsEvidenceFromSourceDirectory(copy),
      /DIRECTORY_PROFILE_MISMATCH/u);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("CLI builds, verifies, replays, and acquisition rechecks existing pins",
  { skip: !READY }, () => {
    const temp = mkdtempSync(path.join(tmpdir(), "outsider-clinicaltrials-cli-"));
    try {
      const out = path.join(temp, "evidence.json");
      const build = spawnSync(process.execPath,
        ["scripts/clinicaltrials-posted-results-evidence.mjs", "build",
          "--source", SOURCE, "--out", out], { cwd: path.resolve("."), encoding: "utf8" });
      assert.equal(build.status, 0, build.stderr);
      assert.equal(JSON.parse(build.stdout).observedStudyRecords, 18);
      const standalone = spawnSync(process.execPath,
        ["scripts/clinicaltrials-posted-results-evidence.mjs", "verify", "--artifact", out],
        { cwd: path.resolve("."), encoding: "utf8" });
      assert.equal(standalone.status, 0, standalone.stderr);
      const replay = spawnSync(process.execPath,
        ["scripts/clinicaltrials-posted-results-evidence.mjs", "verify-source",
          "--artifact", out, "--source", SOURCE], { cwd: path.resolve("."), encoding: "utf8" });
      assert.equal(replay.status, 0, replay.stderr);
      const acquire = spawnSync(process.execPath,
        ["scripts/acquire-clinicaltrials-posted-results-evidence.mjs", "--out-dir", SOURCE],
        { cwd: path.resolve("."), encoding: "utf8" });
      assert.equal(acquire.status, 0, acquire.stderr);
      assert.ok(JSON.parse(acquire.stdout).receipts.every((receipt) => (
        receipt.status === "EXACT_EXISTING"
      )));
    } finally { rmSync(temp, { recursive: true, force: true }); }
  });
