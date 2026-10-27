import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test, { before } from "node:test";
import {
  canonicalizeStrict,
  canonicalizeStrictBoundedArtifact,
} from "../src/canonical.js";
import {
  EMPIRICAL_CAPABILITIES,
  EMPIRICAL_FACTOR_DICTIONARIES,
  EMPIRICAL_FACTOR_LEDGER_SCHEMAS,
  buildEmpiricalFactorLedger,
  empiricalCapabilityAdmissions,
  replayEmpiricalFactorLedger,
  verifyEmpiricalFactorLedger,
} from "../src/outsider-empirical-factor-ledger.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  wave3SourceDirectory: path.join(root,
    "artifacts/public-agent-wave3-20260821/source/cuarewardbench"),
  wave4SourceDirectory: path.join(root,
    "artifacts/public-agent-wave4-20260821/source/agentrx-tau"),
  botFailsSourceDirectory: path.join(root,
    "artifacts/curate-public-robotics-20260820/source/botfails"),
  ur5SourceDirectory: path.join(root,
    "artifacts/curate-public-robotics-20260820/source/ur5fail-execution"),
  droidArtifactDirectory: path.join(root,
    "artifacts/curate-droid100-20260902/real-pilot-v7-scoped-canonical-replay"),
  droidSourceDirectory: path.join(root, "artifacts/curate-droid100-20260819/source"),
  nhtsaRegistryDirectory: path.join(root,
    "artifacts/stage1-curate-corpus-registry-all-evidence-v6-scoped-replay-20260902"),
  nhtsaCsvPath: path.join(root,
    "artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv"),
  nhtsaDataDictionaryPath: path.join(root,
    "artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf"),
};
const hasRealSources = Object.values(paths).every(existsSync)
  && existsSync(path.join(paths.droidSourceDirectory,
    "r2d2_faceblur-train.tfrecord-00000-of-00031"));
let sourceOptions;
let ledger;

before(() => {
  if (!hasRealSources) return;
  sourceOptions = {
    ...paths,
    droidSourceDirectory: undefined,
    droidSource: {
      objectListBytes: readFileSync(path.join(paths.droidSourceDirectory, "gcs-objects.json")),
      datasetInfoBytes: readFileSync(path.join(paths.droidSourceDirectory, "dataset_info.json")),
      featureBytes: readFileSync(path.join(paths.droidSourceDirectory, "features.json")),
      shardBytes: readFileSync(path.join(paths.droidSourceDirectory,
        "r2d2_faceblur-train.tfrecord-00000-of-00031")),
    },
    nhtsaReplayAt: "2026-09-02T14:20:08.000Z",
  };
  delete sourceOptions.droidSourceDirectory;
  ledger = buildEmpiricalFactorLedger(sourceOptions);
});

function domainDigest(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}
function reseal(value, field, domain) {
  const body = structuredClone(value);
  delete body[field];
  body[field] = domainDigest(domain, body);
  return body;
}
function resealLedger(value) {
  const body = structuredClone(value);
  delete body.ledgerHash;
  body.ledgerHash = `sha256:${createHash("sha256")
    .update(`${EMPIRICAL_FACTOR_LEDGER_SCHEMAS.ledger}\0`)
    .update(canonicalizeStrictBoundedArtifact(body)).digest("hex")}`;
  return body;
}

test("capability admissions are claim-scoped and all authority paths remain hard closed", () => {
  const sources = ["Tencent/CUARewardBench", "microsoft/AgentRx:tau_retail",
    "kantine/BotFails", "NHTSA_SGO_ADS_CRASH_REPORTS",
    "paulpacaud/Guardian-FailCoT-OOD-datasets", "r2d2_faceblur"];
  for (const source of sources) {
    const admissions = empiricalCapabilityAdmissions(source);
    assert.deepEqual(Object.keys(admissions).sort(), [...EMPIRICAL_CAPABILITIES].sort());
    for (const capability of ["FREQUENCY_CALIBRATION", "CAUSAL_EFFECT",
      "ECONOMIC_SEVERITY", "PRICE", "COVERAGE", "GUARANTEE", "SETTLE",
      "AUTOMATIC_DEPLOY"]) assert.equal(admissions[capability].status, "FORBIDDEN");
  }
  assert.equal(empiricalCapabilityAdmissions("microsoft/AgentRx:tau_retail")
    .TAXONOMY_UPDATE.status, "ADMITTED");
  assert.equal(empiricalCapabilityAdmissions("microsoft/AgentRx:tau_retail")
    .OUTCOME_DISCRIMINATION.status, "ABSTAIN");
  assert.equal(empiricalCapabilityAdmissions("r2d2_faceblur")
    .FACTOR_COVERAGE.status, "ADMITTED");
  const nhtsa = empiricalCapabilityAdmissions("NHTSA_SGO_ADS_CRASH_REPORTS");
  assert.deepEqual(Object.entries(nhtsa).filter(([, admission]) =>
    admission.status === "ADMITTED").map(([capability]) => capability).sort(),
  ["DESCRIPTIVE_COMPOSITION", "FACTOR_SCHEMA_UPDATE", "TAXONOMY_UPDATE"]);
});

test("physical dictionary is versioned independently and encodes unit, timing, and missingness gates", () => {
  const physical = EMPIRICAL_FACTOR_DICTIONARIES.physical;
  assert.equal(physical.schema, "outsider/empirical-factor-dictionary/v1");
  assert.match(physical.dictionaryHash, /^sha256:[a-f0-9]{64}$/);
  const byId = new Map(physical.factors.map((factor) => [factor.id, factor]));
  assert.equal(byId.get("manual_anomaly_positive_frame_fraction").outcomeDerived, true);
  assert.equal(byId.get("manual_anomaly_positive_frame_fraction").preActionAvailable, false);
  assert.match(byId.get("same_step_command_observation_joint_position_delta_rms")
    .interpretationBoundary, /NOT_TRACKING_ERROR/);
  assert.match(byId.get("joint_limit_proximity_min").minimumEvidence,
    /JOINT_LIMIT_CONFIGURATION_AND_UNITS/);
  assert.equal(physical.factors.some((factor) => factor.id === "observed_incident_rate"), false);
});

test("real six-source replay builds a deterministic, zero-authority empirical ledger",
  { skip: !hasRealSources }, () => {
    const checked = verifyEmpiricalFactorLedger(ledger);
    assert.equal(checked.ok, true, checked.error);
    assert.deepEqual(ledger.accounting.sourceRows, {
      "Tencent/CUARewardBench": 272,
      NHTSA_SGO_ADS_CRASH_REPORTS: 1324,
      "kantine/BotFails": 20,
      "microsoft/AgentRx:tau_retail": 29,
      "paulpacaud/Guardian-FailCoT-OOD-datasets": 140,
      r2d2_faceblur: 2,
    });
    assert.equal(ledger.accounting.factorRows, 463);
    assert.equal(ledger.accounting.mechanismEvents, 110);
    assert.equal(ledger.accounting.consequenceObservations, 453);
    assert.equal(ledger.accounting.incidentTaxonomyObservations, 1_324);
    assert.equal(ledger.accounting.incidentTaxonomyRawReportVersions, 1_365);
    assert.equal(ledger.accounting.incidentTaxonomySupersededOrDuplicateVersions, 41);
    assert.equal(ledger.accounting.independentIncidentEventUnits, 0);
    assert.equal(ledger.accounting.admittedEconomicLossRows, 0);
    assert.equal(ledger.accounting.admittedFrequencyDenominators, 0);
    assert.equal(ledger.boundary.legacyRiskFactorDictionaryModified, false);
    const second = buildEmpiricalFactorLedger(sourceOptions);
    assert.equal(second.ledgerHash, ledger.ledgerHash);
    assert.equal(canonicalizeStrictBoundedArtifact(second),
      canonicalizeStrictBoundedArtifact(ledger));
    const replayed = replayEmpiricalFactorLedger(ledger, sourceOptions);
    assert.equal(replayed.ok, true, replayed.error);
    assert.equal(replayed.verificationLevel, "FULL_SIX_SOURCE_REPRODUCED");
    assert.equal(replayed.sourceArtifactsReverified, true);
  });

test("NHTSA remains a source-replayed real-world incident taxonomy lane, not a truth lane",
  { skip: !hasRealSources }, () => {
    const rows = ledger.incidentTaxonomyObservations;
    assert.equal(rows.length, 1_324);
    assert.equal(new Set(rows.map((row) => row.unitIdHash)).size, 1_324);
    assert.equal(new Set(rows.map((row) =>
      row.correlationRoots.datasetRevisionRoot)).size, 1);
    assert.equal(new Set(rows.map((row) =>
      row.correlationRoots.reportingEntityRoot)).size, 16);
    assert.equal(new Set(rows.map((row) =>
      row.correlationRoots.reportingRegimeRoot)).size, 1);
    assert.equal(rows.every((row) => row.sourceId === "NHTSA_SGO_ADS_CRASH_REPORTS"
      && row.evidenceAuthority.observationClass
        === "PUBLISHER_REPORTED_INCIDENT_ALLEGATION"
      && row.evidenceAuthority.publisherReported === true
      && row.evidenceAuthority.alleged === true
      && row.evidenceAuthority.independentlyAdjudicated === false
      && row.boundary.independentEventUnit === false
      && row.boundary.factorPredictorEstablished === false
      && row.boundary.mechanismCausalityEstablished === false
      && row.boundary.consequenceTruthEstablished === false
      && row.boundary.exposureDenominatorObserved === false
      && row.boundary.economicLossObserved === false
      && row.boundary.modelEligible === false
      && row.boundary.trainingEligible === false
      && row.boundary.priceEligible === false
      && row.rights.status === "UNRESOLVED_PUBLIC_ACCESS_ONLY"
      && row.rights.reuseRightsEstablished === false
      && row.rights.trainingRightsEstablished === false
      && row.privacyProjection.vinPersisted === false
      && row.privacyProjection.narrativePersisted === false
      && canonicalizeStrict(row.admittedUses) === canonicalizeStrict(
        ["DESCRIPTIVE_COMPOSITION", "FACTOR_SCHEMA_UPDATE", "TAXONOMY_UPDATE"])), true);
    assert.equal(ledger.factorRows.some(
      (row) => row.sourceId === "NHTSA_SGO_ADS_CRASH_REPORTS"), false);
    assert.equal(ledger.mechanismEvents.some(
      (row) => row.sourceId === "NHTSA_SGO_ADS_CRASH_REPORTS"), false);
    assert.equal(ledger.consequenceObservations.some(
      (row) => row.sourceId === "NHTSA_SGO_ADS_CRASH_REPORTS"), false);
    const profile = ledger.sourceProfiles.find(
      (row) => row.sourceId === "NHTSA_SGO_ADS_CRASH_REPORTS");
    assert.equal(profile.ontologyReference.environmentRealityClasses.includes("REAL_PHYSICAL"),
      true);
    assert.deepEqual(profile.ontologyReference.permittedUses, ["DESCRIPTIVE"]);
    assert.equal(profile.usePermission.rightsScope,
      "RIGHTS_UNRESOLVED_PUBLIC_ACCESS_ONLY");
    assert.equal(profile.sourceBinding.selectedRows, 1_324);
    assert.equal(profile.sourceBinding.rawReportVersions, 1_365);
    assert.equal(profile.sourceBinding.supersededOrDuplicateVersions, 41);
    assert.equal(profile.sourceReality.realPhysicalIncidentReportRecorded, true);
    assert.equal(profile.sourceReality.underlyingExecutionIndependentlyObserved, false);
    assert.equal("realPhysicalExecutionRecorded" in profile.sourceReality, false);
  });

test("AgentRx contributes all 39 publisher events but no failure prevalence or causal claim",
  { skip: !hasRealSources }, () => {
    const events = ledger.mechanismEvents.filter(
      (event) => event.sourceId === "microsoft/AgentRx:tau_retail",
    );
    assert.equal(events.length, 39);
    assert.equal(events.filter((event) => event.mechanism.eventRole
      === "PUBLISHER_DESIGNATED_ROOT_CAUSE").length, 29);
    assert.equal(events.every((event) => event.mechanism.normalizedCategory === null
      && event.mechanism.mappingAuthority === "SOURCE_NATIVE_UNMAPPED"
      && event.selection.design === "OUTCOME_CONDITIONED_FAILED_ONLY"
      && event.selection.observedNonfailureRows === 0
      && event.selection.exposureDenominatorObserved === false
      && event.claims.populationFrequencyEstimated === false
      && event.claims.causalMechanismEstablished === false), true);
    const counts = Object.fromEntries([...events.reduce((map, event) => {
      map.set(event.mechanism.sourceCategory,
        (map.get(event.mechanism.sourceCategory) ?? 0) + 1);
      return map;
    }, new Map()).entries()].sort());
    assert.equal(Object.values(counts).reduce((sum, value) => sum + value, 0), 39);
  });

test("Wave3, BotFails, UR5, and DROID retain their source-specific missingness",
  { skip: !hasRealSources }, () => {
    const wave3Rows = ledger.factorRows.filter(
      (row) => row.sourceId === "Tencent/CUARewardBench",
    );
    assert.equal(wave3Rows.length, 272);
    assert.equal(wave3Rows.every((row) => row.factorValues.trace_bytes_acquired === 0
      && row.missing.agent_trajectory_turn_count === "TRACE_BYTES_NOT_ACQUIRED"), true);
    const botRows = ledger.factorRows.filter((row) => row.sourceId === "kantine/BotFails");
    const nominal = botRows.filter((row) => row.measurementScope === "EPISODE");
    assert.equal(nominal.length, 10);
    assert.equal(nominal.every((row) => !Object.hasOwn(row.factorValues,
      "manual_anomaly_positive_frame_fraction")), true);
    const ur5 = ledger.factorRows.filter(
      (row) => row.sourceId === "paulpacaud/Guardian-FailCoT-OOD-datasets",
    );
    assert.equal(ur5.every((row) => row.factorValues.image_payload_verified_ratio === 0), true);
    const droid = ledger.factorRows.filter((row) => row.sourceId === "r2d2_faceblur");
    assert.equal(droid.length, 2);
    assert.equal(droid.every((row) => row.factorValues.sensor_payload_decoded_ratio === 1
      && row.factorValues.action_observation_pairing_ratio === 1
      && Number.isFinite(row.factorValues.same_step_command_observation_joint_position_delta_rms)
      && row.missing.control_frequency_hz === "TIMESTAMPS_UNAVAILABLE"
      && row.missing.joint_limit_proximity_min
        === "VERIFIED_ROBOT_JOINT_LIMITS_AND_UNITS_UNAVAILABLE"), true);
    const droidConsequences = ledger.consequenceObservations.filter(
      (row) => row.sourceId === "r2d2_faceblur",
    );
    assert.equal(droidConsequences.every((row) => row.consequence.kind
      === "RECORDED_REWARD_UNINTERPRETED" && row.admittedUses.length === 0), true);
  });

test("resealed attempts to promote frequency, loss, missing data, or nominal membership fail",
  { skip: !hasRealSources }, () => {
    const frequency = structuredClone(ledger);
    const wave4ProfileIndex = frequency.sourceProfiles.findIndex(
      (profile) => profile.sourceId === "microsoft/AgentRx:tau_retail",
    );
    frequency.sourceProfiles[wave4ProfileIndex].capabilityAdmissions.FREQUENCY_CALIBRATION = {
      status: "ADMITTED", reasonCodes: ["ATTACK"],
    };
    frequency.sourceProfiles[wave4ProfileIndex] = reseal(
      frequency.sourceProfiles[wave4ProfileIndex], "profileHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.sourceProfile,
    );
    assert.match(verifyEmpiricalFactorLedger(resealLedger(frequency)).error,
      /ADMISSION_INVALID|HARD_GATE_OPEN/);

    const failedOnly = structuredClone(ledger);
    const wave4Event = failedOnly.mechanismEvents.find(
      (event) => event.sourceId === "microsoft/AgentRx:tau_retail",
    );
    wave4Event.selection.exposureDenominatorObserved = true;
    Object.assign(wave4Event, reseal(wave4Event, "eventHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.mechanismEvidence));
    assert.match(verifyEmpiricalFactorLedger(resealLedger(failedOnly)).error,
      /MECHANISM_EVENT_BOUNDARY/);

    const wave3Trace = structuredClone(ledger);
    const wave3Row = wave3Trace.factorRows.find(
      (row) => row.sourceId === "Tencent/CUARewardBench",
    );
    wave3Row.factorValues.trace_bytes_acquired = 1;
    Object.assign(wave3Row, reseal(wave3Row, "rowHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.factorRow));
    assert.match(verifyEmpiricalFactorLedger(resealLedger(wave3Trace)).error,
      /TRACE_BYTES_FALSE_PROMOTION/);

    const nominalAttack = structuredClone(ledger);
    const nominalRow = nominalAttack.factorRows.find((row) =>
      row.sourceId === "kantine/BotFails" && row.measurementScope === "EPISODE");
    nominalRow.factorValues.manual_anomaly_positive_frame_fraction = 0;
    delete nominalRow.missing.manual_anomaly_positive_frame_fraction;
    Object.assign(nominalRow, reseal(nominalRow, "rowHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.factorRow));
    assert.match(verifyEmpiricalFactorLedger(resealLedger(nominalAttack)).error,
      /BOTFAILS_NOMINAL_AS_SUCCESS_OR_LABEL/);

    const lossAttack = structuredClone(ledger);
    const droidConsequence = lossAttack.consequenceObservations.find(
      (row) => row.sourceId === "r2d2_faceblur",
    );
    droidConsequence.consequence.economicLossObserved = true;
    droidConsequence.consequence.monetaryAmountMinorUnits = 100;
    droidConsequence.consequence.currency = "USD";
    Object.assign(droidConsequence, reseal(droidConsequence, "consequenceHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.consequenceEvidence));
    assert.match(verifyEmpiricalFactorLedger(resealLedger(lossAttack)).error,
      /CONSEQUENCE_BOUNDARY/);
  });

test("resealed attempts cannot conflate reality, evidence authority, permission, or source factors",
  { skip: !hasRealSources }, () => {
    const reality = structuredClone(ledger);
    const profileIndex = reality.sourceProfiles.findIndex(
      (profile) => profile.sourceId === "microsoft/AgentRx:tau_retail");
    reality.sourceProfiles[profileIndex].sourceReality.executionEnvironment =
      "REAL_WORLD_PHYSICAL";
    reality.sourceProfiles[profileIndex] = reseal(reality.sourceProfiles[profileIndex],
      "profileHash", EMPIRICAL_FACTOR_LEDGER_SCHEMAS.sourceProfile);
    assert.match(verifyEmpiricalFactorLedger(resealLedger(reality)).error,
      /REALITY_INVALID/);

    const authority = structuredClone(ledger);
    authority.sourceProfiles[profileIndex].evidenceAuthority.claimSupport.ECONOMIC_LOSS =
      "SUPPORTED";
    authority.sourceProfiles[profileIndex] = reseal(authority.sourceProfiles[profileIndex],
      "profileHash", EMPIRICAL_FACTOR_LEDGER_SCHEMAS.sourceProfile);
    assert.match(verifyEmpiricalFactorLedger(resealLedger(authority)).error,
      /CLAIM_AUTHORITY_INVALID/);

    const permissionAttack = structuredClone(ledger);
    permissionAttack.sourceProfiles[profileIndex].usePermission.permissions.PERSIST_RAW = {
      status: "DECLARED_ALLOWED_SCOPE", reason: "ATTACK",
    };
    permissionAttack.sourceProfiles[profileIndex] = reseal(
      permissionAttack.sourceProfiles[profileIndex], "profileHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.sourceProfile);
    assert.match(verifyEmpiricalFactorLedger(resealLedger(permissionAttack)).error,
      /PERMISSION_INVALID/);

    const factorAttack = structuredClone(ledger);
    const wave3 = factorAttack.factorRows.find(
      (row) => row.sourceId === "Tencent/CUARewardBench");
    wave3.factorValues.robot_platform_class = "INVENTED";
    Object.assign(wave3, reseal(wave3, "rowHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.factorRow));
    assert.match(verifyEmpiricalFactorLedger(resealLedger(factorAttack)).error,
      /FACTOR_ROW_VALUE_INVALID/);

    const semanticsAttack = structuredClone(ledger);
    const consequence = semanticsAttack.consequenceObservations.find(
      (row) => row.sourceId === "microsoft/AgentRx:tau_retail");
    consequence.consequence.kind = "REAL_WORLD_PHYSICAL_HARM";
    Object.assign(consequence, reseal(consequence, "consequenceHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.consequenceEvidence));
    assert.match(verifyEmpiricalFactorLedger(resealLedger(semanticsAttack)).error,
      /CONSEQUENCE_BOUNDARY/);
  });

test("NHTSA re-seals cannot promote frequency, loss, independence, rights, or source identity",
  { skip: !hasRealSources }, () => {
    for (const mutate of [
      (row) => { row.boundary.exposureDenominatorObserved = true; },
      (row) => { row.boundary.populationFrequencyEstimable = true; },
      (row) => { row.boundary.economicLossObserved = true; },
      (row) => { row.boundary.independentEventUnit = true; },
      (row) => { row.rights.reuseRightsEstablished = true; },
      (row) => { row.rights.status = "ESTABLISHED"; },
    ]) {
      const attacked = structuredClone(ledger);
      mutate(attacked.incidentTaxonomyObservations[0]);
      attacked.incidentTaxonomyObservations[0] = reseal(
        attacked.incidentTaxonomyObservations[0], "observationHash",
        EMPIRICAL_FACTOR_LEDGER_SCHEMAS.incidentTaxonomyObservation,
      );
      const checked = verifyEmpiricalFactorLedger(resealLedger(attacked));
      assert.equal(checked.ok, false);
      assert.match(checked.error, /INCIDENT_TAXONOMY_BOUNDARY_INVALID/);
    }

    const recordAttack = structuredClone(ledger);
    recordAttack.incidentTaxonomyObservations[0].sourceRecordHash =
      domainDigest("attack/nhtsa-source-record/v1", { changed: true });
    recordAttack.incidentTaxonomyObservations[0] = reseal(
      recordAttack.incidentTaxonomyObservations[0], "observationHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.incidentTaxonomyObservation,
    );
    assert.match(verifyEmpiricalFactorLedger(resealLedger(recordAttack)).error,
      /NHTSA_INCIDENT_SET_BINDING_INVALID/);

    const profileRightsAttack = structuredClone(ledger);
    const profileIndex = profileRightsAttack.sourceProfiles.findIndex(
      (profile) => profile.sourceId === "NHTSA_SGO_ADS_CRASH_REPORTS");
    profileRightsAttack.sourceProfiles[profileIndex].usePermission.rightsScope =
      "RIGHTS_ESTABLISHED";
    profileRightsAttack.sourceProfiles[profileIndex].usePermission.licenseIdentifiers =
      ["INVENTED-LICENSE"];
    profileRightsAttack.sourceProfiles[profileIndex] = reseal(
      profileRightsAttack.sourceProfiles[profileIndex], "profileHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.sourceProfile,
    );
    assert.match(verifyEmpiricalFactorLedger(resealLedger(profileRightsAttack)).error,
      /NHTSA_SOURCE_PROFILE_BOUNDARY_INVALID/);
  });

test("self-sealed values are structural claims; exact replay is the source-trust boundary",
  { skip: !hasRealSources }, () => {
    const valueAttack = structuredClone(ledger);
    const factor = valueAttack.factorRows.find(
      (row) => row.sourceId === "microsoft/AgentRx:tau_retail");
    factor.factorValues.agent_tool_call_count += 1;
    Object.assign(factor, reseal(factor, "rowHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.factorRow));
    const selfSealedValue = verifyEmpiricalFactorLedger(resealLedger(valueAttack));
    assert.equal(selfSealedValue.ok, true, selfSealedValue.error);
    assert.equal(selfSealedValue.verificationLevel, "SELF_SEALED_STRUCTURE_ONLY");
    assert.equal(selfSealedValue.sourceArtifactsReverified, false);
    assert.equal(replayEmpiricalFactorLedger(resealLedger(valueAttack), sourceOptions).ok, false);

    const incidentRecordAttack = structuredClone(ledger);
    incidentRecordAttack.incidentTaxonomyObservations[0].sourceRecordHash =
      domainDigest("attack/nhtsa-fully-resealed-source-record/v1", { changed: true });
    incidentRecordAttack.incidentTaxonomyObservations[0] = reseal(
      incidentRecordAttack.incidentTaxonomyObservations[0], "observationHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.incidentTaxonomyObservation,
    );
    const setHash = domainDigest("outsider/empirical-incident-taxonomy-set/v1",
      incidentRecordAttack.incidentTaxonomyObservations.map((row) => ({
        unitIdHash: row.unitIdHash,
        sourceRecordHash: row.sourceRecordHash,
        observationHash: row.observationHash,
      })));
    const profileIndex = incidentRecordAttack.sourceProfiles.findIndex(
      (profile) => profile.sourceId === "NHTSA_SGO_ADS_CRASH_REPORTS");
    incidentRecordAttack.sourceProfiles[profileIndex].sourceBinding.incidentTaxonomySetHash =
      setHash;
    incidentRecordAttack.sourceProfiles[profileIndex] = reseal(
      incidentRecordAttack.sourceProfiles[profileIndex], "profileHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.sourceProfile,
    );
    const fullyResealed = resealLedger(incidentRecordAttack);
    const structural = verifyEmpiricalFactorLedger(fullyResealed);
    assert.equal(structural.ok, true, structural.error);
    assert.equal(structural.sourceArtifactsReverified, false);
    const fullReplay = replayEmpiricalFactorLedger(fullyResealed, sourceOptions);
    assert.equal(fullReplay.ok, false);
    assert.match(fullReplay.error, /SOURCE_REPLAY_MISMATCH/);
  });

test("cross-lane sourceRecordHash re-seals fail structural joins",
  { skip: !hasRealSources }, () => {
    const mechanismAttack = structuredClone(ledger);
    const mechanism = mechanismAttack.mechanismEvents.find(
      (event) => event.sourceId === "microsoft/AgentRx:tau_retail");
    mechanism.sourceRecordHash = domainDigest("attack/mechanism-source-record/v1", 1);
    Object.assign(mechanism, reseal(mechanism, "eventHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.mechanismEvidence));
    assert.match(verifyEmpiricalFactorLedger(resealLedger(mechanismAttack)).error,
      /MECHANISM_SOURCE_RECORD_JOIN_INVALID/);

    const consequenceAttack = structuredClone(ledger);
    const consequence = consequenceAttack.consequenceObservations.find(
      (row) => row.sourceId === "microsoft/AgentRx:tau_retail");
    consequence.sourceRecordHash = domainDigest("attack/consequence-source-record/v1", 1);
    Object.assign(consequence, reseal(consequence, "consequenceHash",
      EMPIRICAL_FACTOR_LEDGER_SCHEMAS.consequenceEvidence));
    assert.match(verifyEmpiricalFactorLedger(resealLedger(consequenceAttack)).error,
      /CONSEQUENCE_SOURCE_RECORD_JOIN_INVALID/);
  });

test("full replay rejects same-size NHTSA CSV and dictionary tampering",
  { skip: !hasRealSources, timeout: 60_000 }, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "outsider-empirical-nhtsa-tamper-"));
    try {
      const csv = path.join(directory, "nhtsa.csv");
      const dictionary = path.join(directory, "dictionary.pdf");
      copyFileSync(paths.nhtsaCsvPath, csv);
      copyFileSync(paths.nhtsaDataDictionaryPath, dictionary);

      const csvBytes = readFileSync(csv);
      csvBytes[10_000] ^= 1;
      writeFileSync(csv, csvBytes);
      let replayed = replayEmpiricalFactorLedger(ledger, {
        ...sourceOptions, nhtsaCsvPath: csv, nhtsaDataDictionaryPath: dictionary,
      });
      assert.equal(replayed.ok, false);
      assert.match(replayed.error, /NHTSA|SOURCE|HASH/);

      copyFileSync(paths.nhtsaCsvPath, csv);
      const dictionaryBytes = readFileSync(dictionary);
      dictionaryBytes[10_000] ^= 1;
      writeFileSync(dictionary, dictionaryBytes);
      replayed = replayEmpiricalFactorLedger(ledger, {
        ...sourceOptions, nhtsaCsvPath: csv, nhtsaDataDictionaryPath: dictionary,
      });
      assert.equal(replayed.ok, false);
      assert.match(replayed.error, /NHTSA|SOURCE|HASH/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

test("full replay rejects a changed DROID source object", { skip: !hasRealSources }, () => {
  const changed = { ...sourceOptions, droidSource: { ...sourceOptions.droidSource,
    shardBytes: Buffer.from(sourceOptions.droidSource.shardBytes) } };
  changed.droidSource.shardBytes[0] ^= 0xff;
  const replayed = replayEmpiricalFactorLedger(ledger, changed);
  assert.equal(replayed.ok, false);
  assert.match(replayed.error, /DROID|SOURCE|SHARD/);
});

test("CLI writes exclusively and replays the complete source graph",
  { skip: !hasRealSources }, () => {
    const directory = mkdtempSync(path.join(tmpdir(), "outsider-empirical-ledger-cli-"));
    try {
      const output = path.join(directory, "ledger.json");
      const script = path.join(root, "scripts/stage2-empirical-factor-ledger.mjs");
      const built = spawnSync(process.execPath, [script, "--output", output], {
        cwd: root, encoding: "utf8", timeout: 30_000,
      });
      assert.equal(built.status, 0, built.stderr);
      assert.equal(JSON.parse(built.stdout).ledgerHash, ledger.ledgerHash);
      const overwrite = spawnSync(process.execPath, [script, "--output", output], {
        cwd: root, encoding: "utf8", timeout: 30_000,
      });
      assert.notEqual(overwrite.status, 0);
      assert.match(overwrite.stderr, /EEXIST/);
      const replayed = spawnSync(process.execPath, [script, "--replay", output], {
        cwd: root, encoding: "utf8", timeout: 30_000,
      });
      assert.equal(replayed.status, 0, replayed.stderr);
      const result = JSON.parse(replayed.stdout);
      assert.equal(result.ok, true);
      assert.equal(result.verificationLevel, "FULL_SIX_SOURCE_REPRODUCED");
      assert.equal(result.sourceArtifactsReverified, true);
      assert.equal(result.ledgerHash, ledger.ledgerHash);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
